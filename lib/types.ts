// Shared domain types for the Diamond Overlay system. These mirror the
// database schema (see supabase/schema.sql) and the realtime channel payloads.

export type InningHalf = 'top' | 'bot';

/** A single calibration pin: a screen coordinate + the RGB it should match. */
export interface CalibrationPin {
  id: string;
  /** Human label, e.g. "ball-1", "strike-2", "out-1", "score-home-ones". */
  label: string;
  /** Normalized 0..1 position within the video frame (resolution-agnostic). */
  xPct: number;
  yPct: number;
  /** Reference color captured at calibration time. */
  rgb: [number, number, number];
  /**
   * What lighting up this pin means. The pixel watcher aggregates all "lit"
   * pins of a given kind to compute the count.
   */
  kind: 'ball' | 'strike' | 'out' | 'onbase' | 'speed' | 'ignore';
  /** For onbase pins: which base (1,2,3). For count pins: the index. */
  slot?: number;
}

export interface GameSession {
  balls: number; // 0-3
  strikes: number; // 0-2
  outs: number; // 0-2
  home_score: number;
  guest_score: number;
  inning: number;
  inning_half: InningHalf;
  current_speed: number; // most recent radar reading (mph)
  calibration_pins: CalibrationPin[];
  /** Occupied bases, used by the defensive mini-diamond. */
  bases: { first: boolean; second: boolean; third: boolean };
  /** Team display names. */
  home_name: string;
  guest_name: string;
}

export type DefensivePosition =
  | 'P'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'LF'
  | 'CF'
  | 'RF'
  | 'DH'
  | 'BN';

export interface Player {
  id: string;
  name: string;
  jersey_number: string;
  batting_order_position: number; // 1-9 (0 = bench / not in order)
  defensive_position: DefensivePosition;
  is_at_bat: boolean;
  // Today's line, kept for the batter graphic.
  ab: number;
  hits: number;
  rbi: number;
}

export type TeamSide = 'home' | 'guest';

export interface Lineups {
  home: Player[];
  guest: Player[];
}

/** Per-team line score + totals. */
export interface TeamLine {
  runs: number[]; // runs per inning, index 0 = inning 1
  hits: number;
  errors: number;
}

export interface BoxScore {
  home: TeamLine;
  guest: TeamLine;
}

/** The full replicated document that flows over the realtime channel. */
export interface GameState {
  session: GameSession;
  lineups: Lineups;
  box: BoxScore;
  /** Monotonic version for last-writer-wins conflict resolution. */
  rev: number;
  /** Origin device id of the last mutation. */
  origin: string;
}
