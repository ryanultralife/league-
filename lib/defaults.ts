import type { GameState, Player, DefensivePosition } from './types';

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
