'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from './store';

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
