// Realtime sync transport.
//
// The app keeps authoritative state locally (Zustand) and mirrors it to every
// other device over a broadcast channel. Two transports are supported:
//
//   1. Supabase Realtime "broadcast" — used when NEXT_PUBLIC_SUPABASE_URL and
//      NEXT_PUBLIC_SUPABASE_ANON_KEY are configured. No tables required for the
//      live path (broadcast is a pub/sub fan-out); a matching Postgres schema
//      is provided in supabase/schema.sql for durable persistence.
//   2. BroadcastChannel + localStorage — a zero-config fallback that syncs tabs
//      on the same device, so the app is fully demoable without any backend.
//
// A Pusher transport can be dropped in behind the same SyncTransport interface.

import type { GameState } from './types';

export interface SyncTransport {
  /** Broadcast the full state document to peers. */
  publish(state: GameState): void;
  /** Register a handler for incoming state from peers. Returns an unsubscribe. */
  onMessage(handler: (state: GameState) => void): () => void;
  /** Human-readable status for the UI. */
  status(): 'connecting' | 'connected' | 'local';
  /** Tear down. */
  close(): void;
}

const ROOM = process.env.NEXT_PUBLIC_GAME_ROOM || 'default-game';
const CHANNEL = `diamond-overlay:${ROOM}`;
const EVENT = 'state';

/** Stable per-tab id so a device ignores echoes of its own broadcasts. */
export function makeOriginId(): string {
  try {
    const key = 'diamond-origin-id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `dev_${Math.floor(performance.now())}_${Math.floor(
        (typeof crypto !== 'undefined' ? crypto.getRandomValues(new Uint32Array(1))[0] : 0),
      ).toString(36)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `dev_${Math.floor(performance.now())}`;
  }
}

// --------------------------------------------------------------------------
// Supabase transport
// --------------------------------------------------------------------------

function supabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

class SupabaseTransport implements SyncTransport {
  private channel: any = null;
  private client: any = null;
  private state: 'connecting' | 'connected' | 'local' = 'connecting';
  private handlers = new Set<(s: GameState) => void>();

  constructor() {
    void this.init();
  }

  private async init() {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      this.client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        { realtime: { params: { eventsPerSecond: 20 } } },
      );
      this.channel = this.client.channel(CHANNEL, {
        config: { broadcast: { self: false, ack: false } },
      });
      this.channel.on('broadcast', { event: EVENT }, (msg: any) => {
        const payload = msg?.payload as GameState | undefined;
        if (payload) this.handlers.forEach((h) => h(payload));
      });
      this.channel.subscribe((s: string) => {
        this.state = s === 'SUBSCRIBED' ? 'connected' : 'connecting';
      });
    } catch {
      this.state = 'local';
    }
  }

  publish(state: GameState) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event: EVENT, payload: state }).catch(() => {});
  }

  onMessage(handler: (state: GameState) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  status() {
    return this.state;
  }

  close() {
    try {
      this.channel?.unsubscribe();
      this.client?.removeAllChannels?.();
    } catch {
      /* noop */
    }
  }
}

// --------------------------------------------------------------------------
// Local fallback transport (cross-tab on one device)
// --------------------------------------------------------------------------

class LocalTransport implements SyncTransport {
  private bc: BroadcastChannel | null = null;
  private handlers = new Set<(s: GameState) => void>();
  private storageListener?: (e: StorageEvent) => void;

  constructor() {
    try {
      this.bc = new BroadcastChannel(CHANNEL);
      this.bc.onmessage = (e) => {
        if (e.data) this.handlers.forEach((h) => h(e.data as GameState));
      };
    } catch {
      // BroadcastChannel unsupported: fall back to storage events.
      this.storageListener = (e: StorageEvent) => {
        if (e.key === CHANNEL && e.newValue) {
          try {
            const s = JSON.parse(e.newValue) as GameState;
            this.handlers.forEach((h) => h(s));
          } catch {
            /* ignore malformed */
          }
        }
      };
      window.addEventListener('storage', this.storageListener);
    }
  }

  publish(state: GameState) {
    try {
      if (this.bc) this.bc.postMessage(state);
      // Also touch localStorage so brand-new tabs can hydrate the latest state.
      localStorage.setItem(CHANNEL, JSON.stringify(state));
    } catch {
      /* ignore quota / serialization errors */
    }
  }

  onMessage(handler: (state: GameState) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  status() {
    return 'local' as const;
  }

  close() {
    this.bc?.close();
    if (this.storageListener) window.removeEventListener('storage', this.storageListener);
  }
}

let singleton: SyncTransport | null = null;

/** Lazily create the appropriate transport for this environment. */
export function getTransport(): SyncTransport {
  if (typeof window === 'undefined') {
    // SSR guard: return a no-op transport.
    return {
      publish() {},
      onMessage() {
        return () => {};
      },
      status() {
        return 'local';
      },
      close() {},
    };
  }
  if (!singleton) {
    singleton = supabaseConfigured() ? new SupabaseTransport() : new LocalTransport();
  }
  return singleton;
}

export const SYNC_MODE = (): 'supabase' | 'local' =>
  supabaseConfigured() ? 'supabase' : 'local';
