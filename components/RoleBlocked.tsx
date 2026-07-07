'use client';

import Link from 'next/link';

/** Full-screen guard states for single-occupancy roles (Stream / Controller). */
export function RoleChecking({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-broadcast p-6 text-center text-white/60">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
      <p className="text-sm">Checking {label} availability…</p>
    </main>
  );
}

export function RoleBlocked({
  label,
  onTakeover,
}: {
  label: string;
  onTakeover: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-broadcast p-6 text-center">
      <span className="text-5xl">🔒</span>
      <h1 className="text-xl font-black text-chalk">{label} already active</h1>
      <p className="max-w-sm text-sm text-white/60">
        Another device is already the {label.toLowerCase()} for this game. Only one is allowed at a
        time to avoid conflicts.
      </p>
      <div className="mt-2 flex flex-col items-center gap-3">
        <Link
          href="/"
          className="tap-target rounded-xl bg-accent px-6 py-3 text-base font-bold text-broadcast active:scale-95"
        >
          ← Back to Home
        </Link>
        <button
          onClick={onTakeover}
          className="text-xs text-white/40 underline hover:text-white/70"
        >
          Take over on this device (use only if the other device is gone)
        </button>
      </div>
    </main>
  );
}
