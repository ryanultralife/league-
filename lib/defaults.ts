import type { GameState, Player, DefensivePosition, TeamLine } from './types';

const DEFAULT_D: DefensivePosition[] = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
];

function starterLineup(prefix: string): Player[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: `${prefix.toUpperCase()} Player ${i + 1}`,
    jersey_number: String(i + 1),
    batting_order_position: i + 1,
    defensive_position: DEFAULT_D[i],
    is_at_bat: prefix === 'home' && i === 0,
    ab: 0,
    hits: 0,
    rbi: 0,
  }));
}

export function makeInitialState(origin: string): GameState {
  return {
    session: {
      balls: 0,
      strikes: 0,
      outs: 0,
      home_score: 0,
      guest_score: 0,
      inning: 1,
      inning_half: 'top',
      current_speed: 0,
      calibration_pins: [],
      bases: { first: false, second: false, third: false },
      home_name: 'HOME',
      guest_name: 'AWAY',
    },
    lineups: {
      home: starterLineup('home'),
      guest: starterLineup('guest'),
    },
    box: {
      home: { runs: [], hits: 0, errors: 0 },
      guest: { runs: [], hits: 0, errors: 0 },
    },
    rev: 0,
    origin,
  };
}

// ---------------------------------------------------------------------------
// Defensive normalization
//
// State can arrive from another device (or from localStorage) that was written
// by an older build with a slightly different shape. The overlay and CV loop
// read deeply nested fields, so a missing `box` / `bases` / `lineups[side]`
// would throw and crash the view. normalizeState deep-merges any input onto a
// complete default so every consumer sees a well-formed GameState.
// ---------------------------------------------------------------------------

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function normPlayer(p: any, fallbackId: string): Player {
  const pos = p?.defensive_position;
  return {
    id: str(p?.id, fallbackId),
    name: str(p?.name, 'Player'),
    jersey_number: str(p?.jersey_number ?? (p?.jersey_number === 0 ? '0' : '')),
    batting_order_position: num(p?.batting_order_position, 0),
    defensive_position: (typeof pos === 'string' ? pos : 'BN') as DefensivePosition,
    is_at_bat: !!p?.is_at_bat,
    ab: num(p?.ab),
    hits: num(p?.hits),
    rbi: num(p?.rbi),
  };
}

function normLineup(arr: any, prefix: string, fallback: Player[]): Player[] {
  if (!Array.isArray(arr)) return fallback;
  return arr.map((p, i) => normPlayer(p, `${prefix}-${i + 1}`));
}

function normLine(line: any): TeamLine {
  return {
    runs: Array.isArray(line?.runs) ? line.runs.map((r: unknown) => num(r)) : [],
    hits: num(line?.hits),
    errors: num(line?.errors),
  };
}

/** Coerce arbitrary/partial input into a complete, safe GameState. */
export function normalizeState(raw: any, origin: string): GameState {
  const base = makeInitialState(origin);
  if (!raw || typeof raw !== 'object') return base;

  const s = raw.session ?? {};
  const b = s.bases ?? {};
  const half = s.inning_half === 'bot' ? 'bot' : 'top';

  return {
    session: {
      balls: num(s.balls),
      strikes: num(s.strikes),
      outs: num(s.outs),
      home_score: num(s.home_score),
      guest_score: num(s.guest_score),
      inning: num(s.inning, 1),
      inning_half: half,
      current_speed: num(s.current_speed),
      calibration_pins: Array.isArray(s.calibration_pins) ? s.calibration_pins : [],
      bases: {
        first: !!b.first,
        second: !!b.second,
        third: !!b.third,
      },
      home_name: str(s.home_name, 'HOME'),
      guest_name: str(s.guest_name, 'AWAY'),
    },
    lineups: {
      home: normLineup(raw.lineups?.home, 'home', base.lineups.home),
      guest: normLineup(raw.lineups?.guest, 'guest', base.lineups.guest),
    },
    box: {
      home: normLine(raw.box?.home),
      guest: normLine(raw.box?.guest),
    },
    rev: num(raw.rev),
    origin: str(raw.origin, origin),
  };
}
