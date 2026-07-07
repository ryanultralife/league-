'use client';

import Link from 'next/link';
import { useRole } from '@/lib/hooks';
import { useGameStore } from '@/lib/store';
import { SYNC_MODE, currentRoom, inviteLink, setRoom } from '@/lib/sync';
import { useState } from 'react';

// Single-occupancy roles (stream, controller) are disabled on everyone else's
// home screen while a device holds them; cards opt in via their `role` field.
type Card = { href: string; title: string; emoji: string; desc: string; role?: string };
const CARDS: Card[] = [
  {
    href: '/controller',
    title: 'Controller',
    emoji: '🎛️',
    role: 'controller',
    desc: 'Connect the radar over Bluetooth, override the count/score by touch, and drop calibration pins.',
  },
  {
    href: '/lineup',
    title: 'Lineup Manager',
    emoji: '📋',
    desc: 'Build rosters and batting orders, advance the batter, swap fielders, and edit the box score live.',
  },
  {
    href: '/view',
    title: 'View Only',
    emoji: '📺',
    desc: 'Read-only live scoreboard to share with fans or put on a second screen. No controls, no camera, no permissions.',
  },
  {
    href: '/watch',
    title: 'Watch',
    emoji: '▶️',
    desc: 'Branded public player for the live video stream (overlay burned in). Share this link with fans.',
  },
];

export default function Home() {
  useRole('home');
  const status = useGameStore((s) => s.syncStatus);
  const peers = useGameStore((s) => s.peers);
  const presence = useGameStore((s) => s.presence);
  const origin = useGameStore((s) => s.origin);
  const home = useGameStore((s) => s.state.session.home_name);
  const guest = useGameStore((s) => s.state.session.guest_name);
  const mode = SYNC_MODE();

  // A role is "taken" only when a *different* device is on it.
  const takenBy = (role: string) =>
    presence.some((m) => m?.role === role && m?.origin && m.origin !== origin);

  return (
    <main className="min-h-screen bg-broadcast px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚾</span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-chalk">Diamond Overlay</h1>
              <p className="text-sm text-white/50">Live baseball broadcast control</p>
            </div>
          </div>
          <SyncBadge status={status} peers={peers} />
        </header>

        {mode === 'local' && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100/90">
            <strong className="font-bold">⚠ Local-only mode.</strong> Supabase isn&apos;t
            configured, so devices <em>will not</em> sync across phones. Set{' '}
            <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel
            to connect the master and video phones (works across Wi-Fi / hotspot).
          </div>
        )}

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          <div className="flex items-center justify-between">
            <span>
              Active game:{' '}
              <strong className="text-chalk">
                {guest} @ {home}
              </strong>
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">
              sync: {mode} · {peers} device{peers === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {mode === 'supabase' && <GameCodeCard />}

        {/* Primary action: start the broadcast. Grays out if a stream device is
            already live in this game. */}
        <StreamHero taken={takenBy('stream')} />

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => {
            const taken = c.role ? takenBy(c.role) : false;
            if (taken) {
              return (
                <div
                  key={c.href}
                  aria-disabled
                  className="flex cursor-not-allowed flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 opacity-50"
                >
                  <span className="mb-3 text-4xl grayscale">{c.emoji}</span>
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-white/50">
                    {c.title}
                  </h2>
                  <p className="text-sm leading-snug text-white/30">
                    In use on another device.
                  </p>
                </div>
              );
            }
            return (
              <Link
                key={c.href}
                href={c.href}
                className="group flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-accent/60 hover:bg-white/10"
              >
                <span className="mb-3 text-4xl">{c.emoji}</span>
                <h2 className="mb-1 text-lg font-bold text-chalk group-hover:text-accent">
                  {c.title}
                </h2>
                <p className="text-sm leading-snug text-white/60">{c.desc}</p>
              </Link>
            );
          })}
        </div>

        <footer className="mt-10 space-y-2 text-xs text-white/40">
          <p>
            Multi-device: open <code className="text-white/60">/stream</code> on the hanging phone,{' '}
            <code className="text-white/60">/controller</code> on the operator&apos;s phone, and{' '}
            <code className="text-white/60">/lineup</code> on a tablet in the dugout. All three stay
            in sync in real time.
          </p>
          <p>
            Web Bluetooth &amp; camera access require HTTPS — deploy to Vercel or run over a secure
            tunnel. Add to your home screen to install as a standalone app.
          </p>
        </footer>
      </div>
    </main>
  );
}

function StreamHero({ taken }: { taken: boolean }) {
  if (taken) {
    return (
      <div
        aria-disabled
        className="flex cursor-not-allowed items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 opacity-60"
      >
        <span className="text-5xl grayscale">📹</span>
        <div>
          <h2 className="text-xl font-black text-white/50">Stream in use</h2>
          <p className="text-sm text-white/40">
            Another device is already the broadcast camera for this game.
          </p>
        </div>
      </div>
    );
  }
  return (
    <Link
      href="/stream"
      className="group flex items-center gap-4 rounded-2xl border-2 border-accent bg-accent/15 p-6 shadow-broadcast transition hover:bg-accent/25"
    >
      <span className="text-5xl">📹</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-2xl font-black tracking-tight text-accent">Start Stream</h2>
        <p className="text-sm text-white/70">
          Hang the phone, show the camera, draw the broadcast overlay, and go live.
        </p>
      </div>
      <span className="hidden shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-black text-broadcast sm:block">
        Go →
      </span>
    </Link>
  );
}

function GameCodeCard() {
  const [room, setRoomState] = useState(() => currentRoom());
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">Game code</div>
          {!editing ? (
            <button
              onClick={() => {
                setDraft(room);
                setEditing(true);
              }}
              className="font-score text-lg font-bold text-chalk"
              title="Tap to change"
            >
              {room} <span className="text-xs font-normal text-white/40">✎</span>
            </button>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="private-code"
                className="w-40 rounded bg-black/40 px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-accent"
              />
              <button
                onClick={() => setRoom(draft || room)}
                className="rounded bg-accent px-3 py-1 text-sm font-bold text-broadcast"
              >
                Join
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-white/40">
                cancel
              </button>
            </div>
          )}
        </div>
        <button
          onClick={copy}
          className="tap-target rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold active:scale-95"
        >
          {copied ? '✓ Copied' : '🔗 Copy invite link'}
        </button>
      </div>
      <p className="mt-2 text-xs text-white/40">
        All devices on this code share the game. Use a private, hard-to-guess code and share the
        invite link so only your devices join — the realtime channel is open to anyone who knows the
        code. Setting the room here (or opening an invite link) reconnects this device.
      </p>
    </div>
  );
}

function SyncBadge({
  status,
  peers,
}: {
  status: 'connecting' | 'connected' | 'local';
  peers: number;
}) {
  const map = {
    connected: { dot: 'bg-emerald-400', label: 'Synced' },
    connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Connecting' },
    local: { dot: 'bg-sky-400', label: 'Local' },
  } as const;
  const s = map[status];
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
      {status === 'connected' && <span className="text-white/40">· {peers}</span>}
    </span>
  );
}
