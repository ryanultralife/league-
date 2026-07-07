// Lineup-card OCR parsing.
//
// Turns the raw text Tesseract extracts from a photo of a lineup card into
// structured players. "Understanding positions by numbers" means the standard
// baseball scorekeeping notation: a position written as a digit 1-9 maps to a
// defensive position. Explicit abbreviations (SS, CF, …) are honored too.

import type { DefensivePosition } from './types';

/** Scorekeeping position numbers → defensive position. */
export const POSITION_BY_NUMBER: Record<number, DefensivePosition> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
};

const ABBREVS: DefensivePosition[] = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
];

export interface ParsedPlayer {
  batting_order_position: number;
  jersey_number: string;
  name: string;
  defensive_position: DefensivePosition;
}

function matchAbbrev(token: string): DefensivePosition | null {
  const t = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (ABBREVS as string[]).includes(t) ? (t as DefensivePosition) : null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .trim();
}

// Lines that are clearly not player rows (headers, labels).
const NOISE = /^(home|away|guest|visitor|lineup|batting|order|pos|position|no|num|name|player|coach|team|date|vs\.?)$/i;

/**
 * Best-effort parse. Every row is later shown to the user in an editable
 * review table, so this optimizes for recall (find likely players) and lets a
 * human fix the details.
 */
export function parseLineupText(text: string): ParsedPlayer[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const players: ParsedPlayer[] = [];
  let order = 0;

  for (const rawLine of lines) {
    // Normalize separators but keep # and alphanumerics.
    const line = rawLine.replace(/[|]/g, ' ').replace(/[^\w#\s\-']/g, ' ');
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;

    // Need at least one name-like token (two+ letters that isn't a position word).
    const nameTokens = tokens.filter(
      (t) => /[A-Za-z]{2,}/.test(t) && !matchAbbrev(t) && !NOISE.test(t),
    );
    if (nameTokens.length === 0) continue;
    // Skip a line that is only noise words.
    if (tokens.every((t) => NOISE.test(t) || /^\d+$/.test(t))) continue;

    order++;

    // Position: prefer an explicit abbreviation (scan from the right), else a
    // trailing single digit 1-9 read as a scorekeeping number.
    let pos: DefensivePosition | undefined;
    let posIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const a = matchAbbrev(tokens[i]);
      if (a) {
        pos = a;
        posIdx = i;
        break;
      }
    }
    if (!pos) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (/^\d$/.test(tokens[i])) {
          const n = parseInt(tokens[i], 10);
          if (n >= 1 && n <= 9) {
            pos = POSITION_BY_NUMBER[n];
            posIdx = i;
            break;
          }
        }
      }
    }

    // Jersey number: a number token (not the position token). Prefer 2-digit,
    // and avoid mistaking the leading batting-order digit for the jersey.
    const numberCandidates: { idx: number; val: string }[] = [];
    tokens.forEach((t, i) => {
      if (i === posIdx) return;
      const m = t.match(/^#?(\d{1,3})$/);
      if (m) numberCandidates.push({ idx: i, val: m[1] });
    });
    let jersey = '';
    const twoDigit = numberCandidates.find((c) => c.val.length >= 2);
    if (twoDigit) {
      // A 2-3 digit number is almost always the jersey.
      jersey = twoDigit.val;
    } else if (numberCandidates.length) {
      // Only single digits present. A leading digit is usually the printed
      // batting order, so prefer a non-leading digit as the jersey; fall back
      // to the leading one when it's the only number (cards without an order
      // column).
      const nonLeading = numberCandidates.find((c) => c.idx > 0);
      jersey = (nonLeading ?? numberCandidates[0]).val;
    }

    // Name: alphabetic tokens excluding the position abbreviation + noise.
    const name = titleCase(
      tokens
        .filter((t, i) => i !== posIdx && /[A-Za-z]{2,}/.test(t) && !matchAbbrev(t) && !NOISE.test(t))
        .join(' '),
    );

    players.push({
      batting_order_position: order <= 9 ? order : 0,
      jersey_number: jersey,
      name: name || `Player ${order}`,
      defensive_position: pos || 'BN',
    });

    // Allow a few substitutes past 9 but stop runaway parsing of noise.
    if (players.length >= 15) break;
  }

  return players;
}
