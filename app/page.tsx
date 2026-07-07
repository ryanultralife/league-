'use client';

import Link from 'next/link';
import { useHydratedStore } from '@/lib/hooks';
import { useGameStore } from '@/lib/store';
import { SYNC_MODE } from '@/lib/sync';

const CARDS = [
  {
    href: '/stream',
    title: 'Stream View',
    emoji: '📹',
    desc: 'Hang the phone, show the camera, draw the broadcast overlay, and go live. Runs the pixel-watcher CV loop.',
  },
  {
    href: '/controller',
    title: 'Controller',
    emoji: '🎛️',
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
];

export default function Home() {
  useHydratedStore();
  const status = useGameStore((s) => s.syncStatus);
  const peers = useGameStore((s) => s.peers);
  const home = useGameStore((s) => s.state.session.home_name);
  const guest = useGameStore((s) => s.state.session.guest_name);
  const mode = SYNC_MODE();

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

        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
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
          ))}
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
