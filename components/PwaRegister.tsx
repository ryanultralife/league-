'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and requests a wake lock helper on the client.
 * Kept as a tiny client component so the root layout can stay a server
 * component. Registration failures are non-fatal (e.g. non-secure contexts).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ignore: registration is best-effort */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
