'use client';

import { create } from 'zustand';
import type {
  GameState,
  CalibrationPin,
  Player,
  TeamSide,
  DefensivePosition,
  InningHalf,
} from './types';
import { getTransport, makeOriginId } from './sync';
import { makeInitialState, normalizeState } from './defaults';

const PERSIST_KEY = 'diamond-overlay:state';

/**
 * After a human edit arrives from another device, the pixel-watcher defers for
 * this long so a manual correction isn't immediately clobbered by CV. CV
 * resumes once the operator stops touching the controls.
 */
const VISION_SUPPRESS_MS = 8000;

interface StoreApi {
  state: GameState;
  origin: string;
  ready: boolean;
  syncStatus: 'connecting' | 'connected' | 'local';
  /** Number of devices currently connected to the game room. */
  peers: number;
  /** Local epoch (ms) until which the pixel-watcher should defer to a human. */
  suppressVisionUntil: number;

  // Lifecycle
  hydrate: () => void;

  // Scoreboard mutations
  setBalls: (n: number) => void;
  setStrikes: (n: number) => void;
  setOuts: (n: number) => void;
  bumpBall: () => void;
  bumpStrike: () => void;
  bumpOut: () => void;
  clearCount: () => void;
  addRun: (side: TeamSide, delta: number) => void;
  setInning: (inning: number, half: InningHalf) => void;
  toggleBase: (base: 'first' | 'second' | 'third') => void;
  setSpeed: (mph: number) => void;
  setTeamName: (side: TeamSide, name: string) => void;

  // Computer-vision bulk apply (from the pixel watcher)
  applyVision: (partial: {
    balls?: number;
    strikes?: number;
    outs?: number;
    bases?: Partial<GameState['session']['bases']>;
    speed?: number;
  }) => void;

  // Calibration
  addPin: (pin: CalibrationPin) => void;
  removePin: (id: string) => void;
  clearPins: () => void;

  // Lineups
  setRoster: (side: TeamSide, players: Player[]) => void;
  advanceBatter: (side: TeamSide) => void;
  setCurrentBatter: (side: TeamSide, playerId: string) => void;
  swapPosition: (side: TeamSide, playerId: string, pos: DefensivePosition) => void;
  updatePlayer: (side: TeamSide, playerId: string, patch: Partial<Player>) => void;

  // Box score
  setInningRuns: (side: TeamSide, inningIndex: number, runs: number) => void;
  addHit: (side: TeamSide, delta: number) => void;
  addError: (side: TeamSide, delta: number) => void;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Recompute box-score run totals into the session score for a side. */
function syncScoreFromBox(next: GameState, side: TeamSide) {
  const total = next.box[side].runs.reduce((a, b) => a + (b || 0), 0);
  if (side === 'home') next.session.home_score = total;
  else next.session.guest_score = total;
}

export const useGameStore = create<StoreApi>((set, get) => {
  const origin = typeof window !== 'undefined' ? makeOriginId() : 'ssr';

  /**
   * Apply an immutable mutation: deep-clone, run the producer, bump the
   * revision, tag the origin, then publish + persist. Last-writer-wins.
   */
  function mutate(producer: (draft: GameState) => void, publish = true) {
    set((prev) => {
      const draft: GameState = structuredClone(prev.state);
      producer(draft);
      draft.rev = prev.state.rev + 1;
      draft.origin = origin;
      if (publish && typeof window !== 'undefined') {
        try {
          getTransport().send('state', draft);
          localStorage.setItem(PERSIST_KEY, JSON.stringify(draft));
        } catch {
          /* ignore */
        }
      }
      return { state: draft };
    });
  }

  /**
   * Adopt an incoming full-state document from a peer, and persist it. The
   * payload is normalized first so a stale/old-shaped state from another device
   * can never crash the overlay or CV loop.
   */
  function adopt(remote: GameState) {
    const safe = normalizeState(remote, origin);
    set({ state: safe });
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(safe));
    } catch {
      /* ignore */
    }
  }

  return {
    state: makeInitialState(origin),
    origin,
    ready: false,
    syncStatus: 'connecting',
    peers: 1,
    suppressVisionUntil: 0,

    hydrate() {
      if (typeof window === 'undefined' || get().ready) return;
      // Load any persisted state first so a reconnecting device isn't blank.
      // Normalize it: a device may hold state written by an older build.
      try {
        const raw = localStorage.getItem(PERSIST_KEY);
        if (raw) {
          set({ state: normalizeState(JSON.parse(raw), origin) });
        }
      } catch {
        /* ignore malformed persisted state */
      }

      const transport = getTransport();

      // Steady-state broadcasts: apply when at least as new and from a peer.
      // A remote change means a human (controller/lineup) acted, so briefly
      // defer the pixel-watcher to it — manual input overrides CV.
      transport.on('state', (remote: GameState) => {
        if (!remote || remote.origin === origin) return;
        if (remote.rev >= get().state.rev) {
          adopt(remote);
          set({ suppressVisionUntil: Date.now() + VISION_SUPPRESS_MS });
        }
      });

      // Snapshot: a peer's authoritative reply to our join request. We just
      // joined, so adopt the highest-rev snapshot we see regardless of our
      // (possibly stale) local rev.
      transport.on('snapshot', (remote: GameState) => {
        if (!remote || remote.origin === origin) return;
        if (remote.rev >= get().state.rev || get().state.rev === 0) adopt(remote);
      });

      // A peer just joined and asked for current state; answer with ours.
      transport.on('request', () => {
        transport.send('snapshot', get().state);
      });

      // On (re)connect, ask the room for the current state so a late-joining
      // device (e.g. the video phone) syncs immediately instead of waiting for
      // the next change.
      transport.onReady(() => {
        transport.send('request', { origin });
      });

      // Poll transport status + presence for the UI.
      const tick = () => set({ syncStatus: transport.status(), peers: transport.peers() });
      tick();
      const interval = window.setInterval(tick, 1500);
      window.addEventListener('beforeunload', () => window.clearInterval(interval));

      set({ ready: true });
    },

    setBalls: (n) => mutate((d) => (d.session.balls = clamp(n, 0, 3))),
    setStrikes: (n) => mutate((d) => (d.session.strikes = clamp(n, 0, 2))),
    setOuts: (n) => mutate((d) => (d.session.outs = clamp(n, 0, 2))),

    bumpBall: () =>
      mutate((d) => {
        d.session.balls = d.session.balls >= 3 ? 0 : d.session.balls + 1;
      }),
    bumpStrike: () =>
      mutate((d) => {
        d.session.strikes = d.session.strikes >= 2 ? 0 : d.session.strikes + 1;
      }),
    bumpOut: () =>
      mutate((d) => {
        if (d.session.outs >= 2) {
          // Third out: reset count/outs and flip the half-inning.
          d.session.outs = 0;
          d.session.balls = 0;
          d.session.strikes = 0;
          d.session.bases = { first: false, second: false, third: false };
          if (d.session.inning_half === 'top') d.session.inning_half = 'bot';
          else {
            d.session.inning_half = 'top';
            d.session.inning += 1;
          }
        } else {
          d.session.outs += 1;
        }
      }),

    clearCount: () =>
      mutate((d) => {
        d.session.balls = 0;
        d.session.strikes = 0;
      }),

    addRun: (side, delta) =>
      mutate((d) => {
        // Record the run in the current inning's box cell, then re-total.
        const idx = d.session.inning - 1;
        const line = d.box[side].runs;
        while (line.length <= idx) line.push(0);
        line[idx] = clamp((line[idx] || 0) + delta, 0, 99);
        syncScoreFromBox(d, side);
      }),

    setInning: (inning, half) =>
      mutate((d) => {
        d.session.inning = clamp(inning, 1, 30);
        d.session.inning_half = half;
      }),

    toggleBase: (base) =>
      mutate((d) => {
        d.session.bases[base] = !d.session.bases[base];
      }),

    setSpeed: (mph) => mutate((d) => (d.session.current_speed = clamp(Math.round(mph), 0, 130))),

    setTeamName: (side, name) =>
      mutate((d) => {
        if (side === 'home') d.session.home_name = name.toUpperCase().slice(0, 12);
        else d.session.guest_name = name.toUpperCase().slice(0, 12);
      }),

    applyVision: (partial) => {
      // Defer to a recent human override on any device.
      const suppressed = Date.now() < get().suppressVisionUntil;
      // Skip no-op frames so CV doesn't churn the sync channel at 5 FPS.
      const cur = get().state.session;
      const changed =
        (!suppressed &&
          ((partial.balls !== undefined && partial.balls !== cur.balls) ||
            (partial.strikes !== undefined && partial.strikes !== cur.strikes) ||
            (partial.outs !== undefined && partial.outs !== cur.outs) ||
            (partial.bases !== undefined &&
              (('first' in partial.bases && partial.bases.first !== cur.bases.first) ||
                ('second' in partial.bases && partial.bases.second !== cur.bases.second) ||
                ('third' in partial.bases && partial.bases.third !== cur.bases.third))))) ||
        (partial.speed !== undefined && partial.speed !== cur.current_speed);
      if (!changed) return;
      mutate((d) => {
        // Speed comes from the radar pin and is never a human "override", so it
        // always applies. Count/base fields are held during suppression.
        if (partial.speed !== undefined)
          d.session.current_speed = clamp(Math.round(partial.speed), 0, 130);
        if (suppressed) return;
        if (partial.balls !== undefined) d.session.balls = clamp(partial.balls, 0, 3);
        if (partial.strikes !== undefined) d.session.strikes = clamp(partial.strikes, 0, 2);
        if (partial.outs !== undefined) d.session.outs = clamp(partial.outs, 0, 2);
        if (partial.bases) d.session.bases = { ...d.session.bases, ...partial.bases };
      });
    },

    addPin: (pin) => mutate((d) => d.session.calibration_pins.push(pin)),
    removePin: (id) =>
      mutate((d) => {
        d.session.calibration_pins = d.session.calibration_pins.filter((p) => p.id !== id);
      }),
    clearPins: () => mutate((d) => (d.session.calibration_pins = [])),

    setRoster: (side, players) => mutate((d) => (d.lineups[side] = players)),

    advanceBatter: (side) =>
      mutate((d) => {
        const roster = d.lineups[side]
          .filter((p) => p.batting_order_position >= 1 && p.batting_order_position <= 9)
          .sort((a, b) => a.batting_order_position - b.batting_order_position);
        if (roster.length === 0) return;
        const curIdx = roster.findIndex((p) => p.is_at_bat);
        const nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % roster.length;
        const nextId = roster[nextIdx].id;
        d.lineups[side] = d.lineups[side].map((p) => ({
          ...p,
          is_at_bat: p.id === nextId,
        }));
        // A new plate appearance clears the count.
        d.session.balls = 0;
        d.session.strikes = 0;
      }),

    setCurrentBatter: (side, playerId) =>
      mutate((d) => {
        d.lineups[side] = d.lineups[side].map((p) => ({
          ...p,
          is_at_bat: p.id === playerId,
        }));
      }),

    swapPosition: (side, playerId, pos) =>
      mutate((d) => {
        d.lineups[side] = d.lineups[side].map((p) =>
          p.id === playerId ? { ...p, defensive_position: pos } : p,
        );
      }),

    updatePlayer: (side, playerId, patch) =>
      mutate((d) => {
        d.lineups[side] = d.lineups[side].map((p) =>
          p.id === playerId ? { ...p, ...patch } : p,
        );
      }),

    setInningRuns: (side, inningIndex, runs) =>
      mutate((d) => {
        const line = d.box[side].runs;
        while (line.length <= inningIndex) line.push(0);
        line[inningIndex] = clamp(runs, 0, 99);
        syncScoreFromBox(d, side);
      }),

    addHit: (side, delta) =>
      mutate((d) => {
        d.box[side].hits = clamp(d.box[side].hits + delta, 0, 999);
      }),
    addError: (side, delta) =>
      mutate((d) => {
        d.box[side].errors = clamp(d.box[side].errors + delta, 0, 999);
      }),
  };
});

// Selector helpers ---------------------------------------------------------

export function currentBatter(state: GameState, side: TeamSide): Player | undefined {
  return state.lineups[side].find((p) => p.is_at_bat);
}

/** The pitcher is whoever holds the 'P' defensive slot on the fielding side. */
export function currentPitcher(state: GameState, fieldingSide: TeamSide): Player | undefined {
  return state.lineups[fieldingSide].find((p) => p.defensive_position === 'P');
}

/** Batting side = away in the top half, home in the bottom half. */
export function battingSide(state: GameState): TeamSide {
  return state.session.inning_half === 'top' ? 'guest' : 'home';
}

export function fieldingSide(state: GameState): TeamSide {
  return battingSide(state) === 'home' ? 'guest' : 'home';
}
