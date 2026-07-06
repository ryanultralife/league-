'use client';

import { useGameStore, currentBatter, currentPitcher, battingSide, fieldingSide } from '@/lib/store';
import type { GameState } from '@/lib/types';

/**
 * The full transparent broadcast overlay drawn on top of the camera feed.
 * High-contrast, outlined text so it reads over any background.
 */
export function BroadcastOverlay() {
  const state = useGameStore((s) => s.state);
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <TopScoreBar state={state} />
      <BatterPitcherCard state={state} />
      <DefensiveDiamond state={state} />
      <SpeedGraphic state={state} />
    </div>
  );
}

// -------------------------------------------------------------------------
// Top bar: scoreboard
// -------------------------------------------------------------------------

function TopScoreBar({ state }: { state: GameState }) {
  const s = state.session;
  const bat = battingSide(state);
  return (
    <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-stretch overflow-hidden rounded-lg bg-broadcast/85 text-chalk shadow-broadcast ring-1 ring-white/15 backdrop-blur">
      <TeamCell name={s.guest_name} score={s.guest_score} active={bat === 'guest'} />
      <TeamCell name={s.home_name} score={s.home_score} active={bat === 'home'} home />

      {/* Inning */}
      <div className="flex flex-col items-center justify-center bg-black/40 px-3">
        <span className="text-lg leading-none">{s.inning_half === 'top' ? '▲' : '▼'}</span>
        <span className="font-score text-xl font-bold leading-none">{s.inning}</span>
      </div>

      {/* B / S / O dots */}
      <div className="flex flex-col justify-center gap-1 border-l border-white/15 px-3 py-1.5">
        <CountRow label="B" filled={s.balls} total={3} color="bg-emerald-400" />
        <CountRow label="S" filled={s.strikes} total={2} color="bg-yellow-400" />
        <CountRow label="O" filled={s.outs} total={2} color="bg-red-500" />
      </div>

      {/* R / H / E */}
      <div className="flex items-center border-l border-white/15">
        <RheCol label="R" home={s.home_score} guest={s.guest_score} />
        <RheCol label="H" home={state.box.home.hits} guest={state.box.guest.hits} />
        <RheCol label="E" home={state.box.home.errors} guest={state.box.guest.errors} />
      </div>
    </div>
  );
}

function TeamCell({
  name,
  score,
  active,
  home,
}: {
  name: string;
  score: number;
  active: boolean;
  home?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${home ? '' : 'border-r border-white/10'}`}>
      <span
        className={`h-2 w-2 rounded-full ${active ? 'bg-accent shadow-[0_0_8px] shadow-accent' : 'bg-white/20'}`}
      />
      <span className="min-w-[3ch] font-bold tracking-wide">{name}</span>
      <span className="font-score text-2xl font-black tabular-nums">{score}</span>
    </div>
  );
}

function CountRow({
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
      <span className="w-3 text-xs font-bold text-white/60">{label}</span>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ring-1 ring-white/20 ${
            i < filled ? color : 'bg-white/10'
          }`}
        />
      ))}
    </div>
  );
}

function RheCol({ label, home, guest }: { label: string; home: number; guest: number }) {
  return (
    <div className="flex flex-col items-center justify-center px-2.5 py-1 text-center">
      <span className="text-[10px] font-bold uppercase text-white/50">{label}</span>
      <span className="font-score text-sm font-bold leading-tight tabular-nums">{guest}</span>
      <span className="font-score text-sm font-bold leading-tight tabular-nums">{home}</span>
    </div>
  );
}

// -------------------------------------------------------------------------
// Bottom-left: batter + pitcher
// -------------------------------------------------------------------------

function BatterPitcherCard({ state }: { state: GameState }) {
  const bSide = battingSide(state);
  const fSide = fieldingSide(state);
  const batter = currentBatter(state, bSide);
  const pitcher = currentPitcher(state, fSide);
  return (
    <div className="absolute bottom-3 left-3 w-64 overflow-hidden rounded-lg bg-broadcast/85 text-chalk shadow-broadcast ring-1 ring-white/15 backdrop-blur">
      <div className="bg-accent px-3 py-1 text-xs font-black uppercase tracking-widest text-broadcast">
        At Bat
      </div>
      {batter ? (
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="font-score text-3xl font-black text-accent">
            {batter.jersey_number}
          </span>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight">{batter.name}</div>
            <div className="text-xs text-white/60">
              {batter.hits}-{batter.ab} today · {batter.rbi} RBI · {batter.defensive_position}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-white/50">No batter set</div>
      )}
      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-1.5 text-sm">
        <span className="text-xs font-bold uppercase text-white/50">P</span>
        {pitcher ? (
          <>
            <span className="font-score font-bold text-white/80">#{pitcher.jersey_number}</span>
            <span className="truncate">{pitcher.name}</span>
          </>
        ) : (
          <span className="text-white/40">—</span>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Bottom-right: defensive mini-diamond
// -------------------------------------------------------------------------

function DefensiveDiamond({ state }: { state: GameState }) {
  const b = state.session.bases;
  const occ = 'fill-accent stroke-accent';
  const empty = 'fill-white/10 stroke-white/40';
  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-center rounded-lg bg-broadcast/85 px-4 py-3 shadow-broadcast ring-1 ring-white/15 backdrop-blur">
      <svg width="88" height="88" viewBox="0 0 100 100" className="overflow-visible">
        {/* infield outline */}
        <polygon points="50,86 82,54 50,22 18,54" className="fill-field/40 stroke-white/25" strokeWidth={2} />
        {/* second base (top) */}
        <rect x="44" y="16" width="12" height="12" transform="rotate(45 50 22)" className={`${b.second ? occ : empty}`} strokeWidth={2} />
        {/* third base (left) */}
        <rect x="12" y="48" width="12" height="12" transform="rotate(45 18 54)" className={`${b.third ? occ : empty}`} strokeWidth={2} />
        {/* first base (right) */}
        <rect x="76" y="48" width="12" height="12" transform="rotate(45 82 54)" className={`${b.first ? occ : empty}`} strokeWidth={2} />
        {/* home plate */}
        <rect x="44" y="80" width="12" height="12" transform="rotate(45 50 86)" className="fill-white/70 stroke-white" strokeWidth={2} />
      </svg>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
        Runners
      </span>
    </div>
  );
}

// -------------------------------------------------------------------------
// Bottom-center: massive speed graphic
// -------------------------------------------------------------------------

function SpeedGraphic({ state }: { state: GameState }) {
  const mph = state.session.current_speed;
  if (!mph) return null;
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
      <div className="flex flex-col items-center rounded-2xl bg-broadcast/80 px-6 py-2 shadow-broadcast ring-1 ring-white/15 backdrop-blur">
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent">
          Radar
        </span>
        <div className="flex items-end gap-1">
          <span className="font-score text-6xl font-black leading-none tabular-nums text-chalk text-outline">
            {mph}
          </span>
          <span className="mb-1 text-lg font-bold text-white/70">MPH</span>
        </div>
      </div>
    </div>
  );
}
