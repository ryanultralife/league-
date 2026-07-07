'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import { useHydratedStore } from '@/lib/hooks';
import { LineupScanner } from '@/components/LineupScanner';
import type { DefensivePosition, Player, TeamSide } from '@/lib/types';

const POSITIONS: DefensivePosition[] = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'BN',
];

export default function LineupPage() {
  useHydratedStore();
  const [side, setSide] = useState<TeamSide>('home');

  return (
    <main className="min-h-screen bg-broadcast pb-16">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-broadcast/95 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-sm text-white/50">
          ← Home
        </Link>
        <h1 className="text-base font-bold">📋 Lineup Manager</h1>
        <span className="w-10" />
      </header>

      <div className="mx-auto max-w-3xl px-4 py-5">
        <TeamToggle side={side} setSide={setSide} />
        <BoxScoreEditor />
        <RosterEditor side={side} />
      </div>
    </main>
  );
}

function TeamToggle({ side, setSide }: { side: TeamSide; setSide: (s: TeamSide) => void }) {
  const home = useGameStore((s) => s.state.session.home_name);
  const guest = useGameStore((s) => s.state.session.guest_name);
  const setTeamName = useGameStore((s) => s.setTeamName);
  return (
    <div className="mb-5 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('guest')}
          className={`tap-target rounded-xl py-3 font-bold ${
            side === 'guest' ? 'bg-accent text-broadcast' : 'bg-white/10'
          }`}
        >
          {guest} (Away)
        </button>
        <button
          onClick={() => setSide('home')}
          className={`tap-target rounded-xl py-3 font-bold ${
            side === 'home' ? 'bg-accent text-broadcast' : 'bg-white/10'
          }`}
        >
          {home} (Home)
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={guest}
          onChange={(e) => setTeamName('guest', e.target.value)}
          className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:ring-accent focus:outline-none"
          placeholder="Away team name"
        />
        <input
          value={home}
          onChange={(e) => setTeamName('home', e.target.value)}
          className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:ring-accent focus:outline-none"
          placeholder="Home team name"
        />
      </div>
    </div>
  );
}

function BoxScoreEditor() {
  const box = useGameStore((s) => s.state.box);
  const session = useGameStore((s) => s.state.session);
  const addHit = useGameStore((s) => s.addHit);
  const addError = useGameStore((s) => s.addError);
  const setInningRuns = useGameStore((s) => s.setInningRuns);

  const innings = Math.max(9, session.inning, box.home.runs.length, box.guest.runs.length);

  const cell = (side: TeamSide, i: number) => {
    const runs = (side === 'home' ? box.home.runs : box.guest.runs)[i] ?? 0;
    return (
      <input
        inputMode="numeric"
        value={runs || ''}
        onChange={(e) => setInningRuns(side, i, parseInt(e.target.value || '0', 10) || 0)}
        placeholder="·"
        className="h-9 w-9 shrink-0 rounded bg-white/5 text-center font-score text-sm ring-1 ring-white/10 focus:ring-accent focus:outline-none"
      />
    );
  };

  const Row = ({ side, name }: { side: TeamSide; name: string }) => {
    const t = side === 'home' ? box.home : box.guest;
    const total = t.runs.reduce((a, b) => a + (b || 0), 0);
    return (
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 truncate text-sm font-bold">{name}</span>
        <div className="flex gap-1 overflow-x-auto">
          {Array.from({ length: innings }).map((_, i) => (
            <div key={i}>{cell(side, i)}</div>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <Rhe label="R" value={total} />
          <RheEdit label="H" value={t.hits} onDec={() => addHit(side, -1)} onInc={() => addHit(side, 1)} />
          <RheEdit label="E" value={t.errors} onDec={() => addError(side, -1)} onInc={() => addError(side, 1)} />
        </div>
      </div>
    );
  };

  return (
    <section className="mb-6 rounded-2xl bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-white/60">Box Score</span>
        <div className="ml-auto flex gap-1 pr-1 text-[10px] uppercase text-white/40">
          <span className="w-9 text-center">Inn →</span>
        </div>
      </div>
      <div className="space-y-2">
        <Row side="guest" name={session.guest_name} />
        <Row side="home" name={session.home_name} />
      </div>
      <p className="mt-3 text-xs text-white/40">
        Tap an inning cell to set runs; use ± to add hits and errors so the R/H/E on the overlay
        stays accurate.
      </p>
    </section>
  );
}

function Rhe({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase text-white/40">{label}</span>
      <span className="font-score text-lg font-bold">{value}</span>
    </div>
  );
}

function RheEdit({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase text-white/40">{label}</span>
      <div className="flex items-center gap-0.5">
        <button onClick={onDec} className="tap-target h-6 w-5 rounded bg-white/10 text-sm font-bold">
          −
        </button>
        <span className="w-5 text-center font-score text-lg font-bold">{value}</span>
        <button onClick={onInc} className="tap-target h-6 w-5 rounded bg-accent text-sm font-bold text-broadcast">
          +
        </button>
      </div>
    </div>
  );
}

function RosterEditor({ side }: { side: TeamSide }) {
  const roster = useGameStore((s) => s.state.lineups[side]);
  const updatePlayer = useGameStore((s) => s.updatePlayer);
  const setCurrentBatter = useGameStore((s) => s.setCurrentBatter);
  const advanceBatter = useGameStore((s) => s.advanceBatter);
  const swapPosition = useGameStore((s) => s.swapPosition);
  const setRoster = useGameStore((s) => s.setRoster);

  const sorted = [...roster].sort(
    (a, b) =>
      (a.batting_order_position || 99) - (b.batting_order_position || 99) ||
      a.name.localeCompare(b.name),
  );

  const addPlayer = () => {
    const nextOrder =
      Math.max(0, ...roster.map((p) => p.batting_order_position).filter((n) => n <= 9)) + 1;
    const p: Player = {
      id: `${side}-new-${roster.length + 1}-${Math.round(performance.now())}`,
      name: 'New Player',
      jersey_number: '',
      batting_order_position: nextOrder <= 9 ? nextOrder : 0,
      defensive_position: 'BN',
      is_at_bat: false,
      ab: 0,
      hits: 0,
      rbi: 0,
    };
    setRoster(side, [...roster, p]);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-white/60">
          Roster &amp; Batting Order
        </span>
        <button
          onClick={() => advanceBatter(side)}
          className="tap-target rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-broadcast active:scale-95"
        >
          ⏭ Next Batter
        </button>
      </div>

      <LineupScanner side={side} />

      <div className="space-y-2">
        {sorted.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl p-3 ring-1 ${
              p.is_at_bat ? 'bg-accent/10 ring-accent/50' : 'bg-white/5 ring-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={p.batting_order_position || ''}
                onChange={(e) =>
                  updatePlayer(side, p.id, {
                    batting_order_position: Math.max(0, Math.min(9, parseInt(e.target.value || '0', 10) || 0)),
                  })
                }
                className="h-9 w-8 rounded bg-black/30 text-center font-score font-bold ring-1 ring-white/10 focus:ring-accent focus:outline-none"
                placeholder="#"
                title="Batting order (1-9, 0 = bench)"
              />
              <input
                value={p.jersey_number}
                onChange={(e) => updatePlayer(side, p.id, { jersey_number: e.target.value.slice(0, 3) })}
                className="h-9 w-12 rounded bg-black/30 text-center font-score ring-1 ring-white/10 focus:ring-accent focus:outline-none"
                placeholder="##"
                title="Jersey number"
              />
              <input
                value={p.name}
                onChange={(e) => updatePlayer(side, p.id, { name: e.target.value })}
                className="h-9 min-w-0 flex-1 rounded bg-black/30 px-2 ring-1 ring-white/10 focus:ring-accent focus:outline-none"
                placeholder="Player name"
              />
              <select
                value={p.defensive_position}
                onChange={(e) => swapPosition(side, p.id, e.target.value as DefensivePosition)}
                className="h-9 rounded bg-black/30 px-1 text-sm ring-1 ring-white/10 focus:ring-accent focus:outline-none"
                title="Defensive position"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
              <label className="flex items-center gap-1">
                AB
                <input
                  inputMode="numeric"
                  value={p.ab}
                  onChange={(e) => updatePlayer(side, p.id, { ab: parseInt(e.target.value || '0', 10) || 0 })}
                  className="h-6 w-10 rounded bg-black/30 text-center ring-1 ring-white/10 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1">
                H
                <input
                  inputMode="numeric"
                  value={p.hits}
                  onChange={(e) => updatePlayer(side, p.id, { hits: parseInt(e.target.value || '0', 10) || 0 })}
                  className="h-6 w-10 rounded bg-black/30 text-center ring-1 ring-white/10 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1">
                RBI
                <input
                  inputMode="numeric"
                  value={p.rbi}
                  onChange={(e) => updatePlayer(side, p.id, { rbi: parseInt(e.target.value || '0', 10) || 0 })}
                  className="h-6 w-10 rounded bg-black/30 text-center ring-1 ring-white/10 focus:outline-none"
                />
              </label>
              <button
                onClick={() => setCurrentBatter(side, p.id)}
                disabled={p.is_at_bat}
                className="ml-auto rounded bg-white/10 px-2 py-1 font-semibold disabled:opacity-30"
              >
                {p.is_at_bat ? 'At bat' : 'Set at bat'}
              </button>
              <button
                onClick={() => setRoster(side, roster.filter((x) => x.id !== p.id))}
                className="rounded px-2 py-1 text-white/40 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addPlayer}
        className="tap-target w-full rounded-xl border border-dashed border-white/20 py-3 text-sm font-semibold text-white/60 active:scale-95"
      >
        + Add Player
      </button>
    </section>
  );
}
