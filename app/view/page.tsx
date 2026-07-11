'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  useGameStore,
  currentBatter,
  currentPitcher,
  battingSide,
  fieldingSide,
} from '@/lib/store';
import { useHydratedStore, useWakeLock } from '@/lib/hooks';
import type { GameEvent, GameState, TeamSide } from '@/lib/types';

/**
 * Read-only spectator scoreboard. Subscribes to the same synced game room as
 * every other device and renders a clean, full-screen live scoreboard — no
 * controls, no camera, no permissions. Shareable link for fans or a second
 * screen / jumbotron.
 */
export default function ViewPage() {
  useHydratedStore();
  useWakeLock(true); // keep a dedicated display awake
  const state = useGameStore((s) => s.state);
  const status = useGameStore((s) => s.syncStatus);
  const [fs, setFs] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-broadcast text-chalk">
      {/* Minimal, non-interactive chrome. The only buttons are display aids
          (home, fullscreen) — nothing changes the game state. */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-white/40">
        <Link href="/" className="hover:text-white/70">
          ← Diamond Overlay
        </Link>
        <span className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-2 py-0.5 uppercase tracking-widest">
            Live · View only
          </span>
          <StatusDot status={status} />
          <button onClick={toggleFullscreen} className="hover:text-white/70" aria-label="Fullscreen">
            {fs ? '⤢ Exit' : '⤢ Full'}
          </button>
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-3 pb-8 sm:gap-8">
        <ScoreHeader state={state} />
        <LineScore state={state} />
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
          <BatterPitcher state={state} />
          <Diamond state={state} />
          <Speed state={state} />
        </div>
        <PlayByPlay state={state} />
      </div>
    </main>
  );
}

// -------------------------------------------------------------------------

function formatEvent(e: GameEvent): string | null {
  const d = e.data || {};
  switch (e.kind) {
    case 'batter':
      return `Now batting: #${d.jersey ?? '?'} ${d.name ?? ''}`;
    case 'count':
      return `Count ${d.balls}-${d.strikes}`;
    case 'out':
      return d.outs === 3 ? 'Out #3 — side retired' : `Out #${d.outs}`;
    case 'run': {
      const side = d.side === 'home' ? 'Home' : 'Away';
      return (d.delta as number) > 0 ? `Run scores — ${side}` : `Run removed — ${side}`;
    }
    case 'speed':
      return `${d.mph} MPH`;
    case 'inning':
      return `${e.half === 'top' ? 'Top' : 'Bottom'} ${e.inning}`;
    case 'hit':
      return `Hit — ${d.side === 'home' ? 'Home' : 'Away'}`;
    case 'error':
      return `Error — ${d.side === 'home' ? 'Home' : 'Away'}`;
    case 'base':
      return null; // too chatty for spectators
    case 'stream':
      return d.action === 'started' ? 'Broadcast started' : 'Broadcast ended';
    case 'reset':
      return 'New game';
    default:
      return null;
  }
}

const EVENT_ICON: Partial<Record<GameEvent['kind'], string>> = {
  batter: '🧢',
  run: '🏃',
  out: '❌',
  speed: '📡',
  inning: '↕️',
  hit: '💥',
  error: 'E',
  stream: '📺',
  reset: '🔄',
  count: '·',
};

function PlayByPlay({ state }: { state: GameState }) {
  const rows = state.events
    .slice(-40)
    .reverse()
    .map((e) => ({ e, text: formatEvent(e) }))
    .filter((r) => r.text)
    .slice(0, 20);
  if (rows.length === 0) return null;
  return (
    <div className="w-full max-w-4xl rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-accent">
        Play-by-play
      </div>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
        {rows.map(({ e, text }) => (
          <li key={e.id} className="flex items-baseline gap-2">
            <span className="w-10 shrink-0 font-score text-xs text-white/40">
              {e.half === 'top' ? '▲' : '▼'}{e.inning}
            </span>
            <span className="w-5 shrink-0 text-center text-xs">{EVENT_ICON[e.kind] ?? '·'}</span>
            <span className="min-w-0 flex-1 truncate text-white/80">{text}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-white/30">
              {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ status }: { status: 'connecting' | 'connected' | 'local' }) {
  const color =
    status === 'connected' ? 'bg-emerald-400' : status === 'local' ? 'bg-sky-400' : 'bg-amber-400 animate-pulse';
  return <span className={`h-2 w-2 rounded-full ${color}`} title={status} />;
}

// -------------------------------------------------------------------------

function ScoreHeader({ state }: { state: GameState }) {
  const s = state.session;
  const bat = battingSide(state);
  return (
    <div className="flex w-full max-w-4xl items-stretch justify-center gap-3 sm:gap-6">
      <TeamBlock name={s.guest_name} score={s.guest_score} active={bat === 'guest'} />

      <div className="flex flex-col items-center justify-center gap-2 px-2">
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1">
          <span className="text-2xl leading-none">{s.inning_half === 'top' ? '▲' : '▼'}</span>
          <span className="font-score text-3xl font-black tabular-nums sm:text-4xl">{s.inning}</span>
        </div>
        <CountDots label="B" filled={s.balls} total={3} color="bg-emerald-400" />
        <CountDots label="S" filled={s.strikes} total={2} color="bg-yellow-400" />
        <CountDots label="O" filled={s.outs} total={2} color="bg-red-500" />
      </div>

      <TeamBlock name={s.home_name} score={s.home_score} active={bat === 'home'} />
    </div>
  );
}

function TeamBlock({ name, score, active }: { name: string; score: number; active: boolean }) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center rounded-2xl px-3 py-4 ring-1 sm:px-6 ${
        active ? 'bg-accent/10 ring-accent/50' : 'bg-white/5 ring-white/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            active ? 'bg-accent shadow-[0_0_10px] shadow-accent' : 'bg-white/20'
          }`}
        />
        <span className="max-w-[6ch] truncate text-lg font-black tracking-wide sm:max-w-[10ch] sm:text-2xl">
          {name}
        </span>
      </div>
      <span className="font-score text-6xl font-black tabular-nums sm:text-8xl">{score}</span>
    </div>
  );
}

function CountDots({
  label,
  filled,
  total,
  color,
}: {
  label: string;
  filled: number;
  total: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 text-xs font-bold text-white/50">{label}</span>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full ring-1 ring-white/20 ${i < filled ? color : 'bg-white/10'}`}
        />
      ))}
    </div>
  );
}

// -------------------------------------------------------------------------

function LineScore({ state }: { state: GameState }) {
  const s = state.session;
  const innings = Math.max(9, s.inning, state.box.home.runs.length, state.box.guest.runs.length);
  const row = (side: TeamSide, name: string) => {
    const line = side === 'home' ? state.box.home : state.box.guest;
    const total = line.runs.reduce((a, b) => a + (b || 0), 0);
    return (
      <tr>
        <td className="sticky left-0 bg-broadcast px-2 py-1 text-left font-bold">{name}</td>
        {Array.from({ length: innings }).map((_, i) => (
          <td key={i} className="w-8 px-1 py-1 text-center font-score tabular-nums text-white/80">
            {line.runs[i] ?? '·'}
          </td>
        ))}
        <td className="w-9 px-1 py-1 text-center font-score font-black tabular-nums">{total}</td>
        <td className="w-9 px-1 py-1 text-center font-score tabular-nums text-white/70">{line.hits}</td>
        <td className="w-9 px-1 py-1 text-center font-score tabular-nums text-white/70">{line.errors}</td>
      </tr>
    );
  };
  return (
    <div className="w-full max-w-4xl overflow-x-auto rounded-xl bg-white/5 p-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase text-white/40">
            <th className="sticky left-0 bg-broadcast px-2 py-1 text-left">Team</th>
            {Array.from({ length: innings }).map((_, i) => (
              <th key={i} className="w-8 px-1 py-1 text-center">
                {i + 1}
              </th>
            ))}
            <th className="w-9 px-1 py-1 text-center text-accent">R</th>
            <th className="w-9 px-1 py-1 text-center">H</th>
            <th className="w-9 px-1 py-1 text-center">E</th>
          </tr>
        </thead>
        <tbody>
          {row('guest', state.session.guest_name)}
          {row('home', state.session.home_name)}
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------------------------

function BatterPitcher({ state }: { state: GameState }) {
  const bSide = battingSide(state);
  const batter = currentBatter(state, bSide);
  const pitcher = currentPitcher(state, fieldingSide(state));
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-[10px] font-black uppercase tracking-widest text-accent">At Bat</div>
      {batter ? (
        <div className="mt-1 flex items-center gap-3">
          <span className="font-score text-3xl font-black text-accent">{batter.jersey_number}</span>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{batter.name}</div>
            <div className="text-xs text-white/50">
              {batter.hits}-{batter.ab} · {batter.rbi} RBI · {batter.defensive_position}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm text-white/40">—</div>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2 text-sm">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Pitching</span>
        {pitcher ? (
          <span className="truncate">
            <span className="font-score font-bold">#{pitcher.jersey_number}</span> {pitcher.name}
          </span>
        ) : (
          <span className="text-white/40">—</span>
        )}
      </div>
    </div>
  );
}

function Diamond({ state }: { state: GameState }) {
  const b = state.session.bases;
  const occ = 'fill-accent stroke-accent';
  const empty = 'fill-white/10 stroke-white/40';
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <svg width="110" height="110" viewBox="0 0 100 100">
        <polygon points="50,86 82,54 50,22 18,54" className="fill-field/40 stroke-white/25" strokeWidth={2} />
        <rect x="44" y="16" width="12" height="12" transform="rotate(45 50 22)" className={b.second ? occ : empty} strokeWidth={2} />
        <rect x="12" y="48" width="12" height="12" transform="rotate(45 18 54)" className={b.third ? occ : empty} strokeWidth={2} />
        <rect x="76" y="48" width="12" height="12" transform="rotate(45 82 54)" className={b.first ? occ : empty} strokeWidth={2} />
        <rect x="44" y="80" width="12" height="12" transform="rotate(45 50 86)" className="fill-white/70 stroke-white" strokeWidth={2} />
      </svg>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">Runners</span>
    </div>
  );
}

function Speed({ state }: { state: GameState }) {
  const mph = state.session.current_speed;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent">Radar</span>
      <div className="flex items-end gap-1">
        <span className="font-score text-6xl font-black tabular-nums">{mph || '—'}</span>
        <span className="mb-2 text-lg font-bold text-white/60">MPH</span>
      </div>
    </div>
  );
}
