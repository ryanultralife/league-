'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './store';
import { getTransport } from './sync';

/** Ensure the store hydrates + connects exactly once on the client. */
export function useHydratedStore() {
  const hydrate = useGameStore((s) => s.hydrate);
  const ready = useGameStore((s) => s.ready);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return ready;
}

/**
 * Hydrate + advertise which role (view) this device is on via presence, so the
 * home screen can show single-occupancy roles (Stream, Controller) as taken.
 */
export function useRole(role: string) {
  const hydrate = useGameStore((s) => s.hydrate);
  const ready = useGameStore((s) => s.ready);
  useEffect(() => {
    hydrate();
    const origin = useGameStore.getState().origin;
    getTransport().setPresence({ role, origin });
  }, [hydrate, role]);
  return ready;
}

export type GuardPhase = 'checking' | 'ok' | 'blocked';

/**
 * Hard single-occupancy guard for a role. On mount it waits until connected,
 * then checks presence: if another device already holds this role it returns
 * `blocked` (and does NOT claim the role); otherwise it claims the role and
 * returns `ok`. The incumbent (which claimed while alone) is never displaced —
 * only a late joiner is blocked. `takeover()` forces the claim if presence is
 * stale (e.g. the previous device crashed without disconnecting).
 */
export function useRoleGuard(role: string, graceMs = 1500): {
  phase: GuardPhase;
  takeover: () => void;
} {
  const hydrate = useGameStore((s) => s.hydrate);
  const [phase, setPhase] = useState<GuardPhase>('checking');

  useEffect(() => {
    hydrate();
    const origin = useGameStore.getState().origin;
    const t = getTransport();
    let settled = false;

    const claim = () => {
      t.setPresence({ role, origin });
      setPhase('ok');
    };

    // Single-device / no realtime backend: nothing to coordinate, proceed.
    if (t.status() === 'local') {
      claim();
      return;
    }

    const start = Date.now();
    const iv = window.setInterval(() => {
      if (settled) return;
      const elapsed = Date.now() - start;
      if (t.status() === 'connected' && elapsed >= graceMs) {
        settled = true;
        window.clearInterval(iv);
        const others = t
          .presence()
          .filter((m) => m?.role === role && m?.origin && m.origin !== origin);
        if (others.length > 0) setPhase('blocked');
        else claim();
      } else if (t.status() === 'local') {
        settled = true;
        window.clearInterval(iv);
        claim();
      } else if (elapsed > 6000) {
        // Couldn't confirm a connection; fail open so the app is still usable.
        settled = true;
        window.clearInterval(iv);
        claim();
      }
    }, 300);

    return () => window.clearInterval(iv);
  }, [hydrate, role, graceMs]);

  const takeover = () => {
    const origin = useGameStore.getState().origin;
    getTransport().setPresence({ role, origin });
    setPhase('ok');
  };

  return { phase, takeover };
}

/**
 * Hold a Screen Wake Lock so the phone doesn't sleep while streaming or
 * controlling. Re-acquires on visibility change (locks drop when backgrounded).
 */
export function useWakeLock(enabled = true) {
  const lockRef = useRef<any>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const request = async () => {
      try {
        const wl = (navigator as any).wakeLock;
        if (wl && document.visibilityState === 'visible') {
          lockRef.current = await wl.request('screen');
        }
      } catch {
        /* wake lock unsupported or blocked */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) request();
    };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        lockRef.current?.release?.();
      } catch {
        /* noop */
      }
      lockRef.current = null;
    };
  }, [enabled]);
}
