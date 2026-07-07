// Realtime sync transport.
//
// A thin, typed pub/sub the store uses to mirror the game document to every
// other device. Two transports implement it:
//
//   1. Supabase Realtime — used when NEXT_PUBLIC_SUPABASE_URL and
//      NEXT_PUBLIC_SUPABASE_ANON_KEY are configured. Works ACROSS NETWORKS
//      (every device talks to Supabase in the cloud), so the master phone and a
//      video phone on a different Wi-Fi/hotspot stay in sync. Adds presence so
//      the UI can show how many devices are connected. A matching Postgres
//      schema for durable persistence lives in supabase/schema.sql.
//   2. BroadcastChannel + localStorage — a zero-config fallback that only syncs
//      tabs on the SAME device. Used when Supabase isn't configured; the UI
//      warns that cross-device sync is off.
//
// All logical events are carried over a single Supabase broadcast event
// ("msg") with the real event name in the payload, which avoids listener-
// ordering pitfalls with channel subscription.

const ENV_ROOM = process.env.NEXT_PUBLIC_GAME_ROOM || 'default-game';
const ROOM_KEY = 'diamond-room';
const WIRE_EVENT = 'msg';

/**
 * Resolve the game room at runtime so operators can use a private, hard-to-
 * guess code without redeploying. Precedence:
 *   1. ?game= / ?room= URL param (also persisted, so an invite link sticks)
 *   2. a room previously chosen on this device (localStorage)
 *   3. the deployment default (NEXT_PUBLIC_GAME_ROOM)
 * The env default is preserved when nothing overrides it, so existing shared
 * setups keep working.
 */
function resolveRoom(): string {
  if (typeof window === 'undefined') return ENV_ROOM;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = (params.get('game') || params.get('room') || '').trim();
    if (fromUrl) {
      localStorage.setItem(ROOM_KEY, fromUrl);
      return fromUrl;
    }
    const saved = localStorage.getItem(ROOM_KEY);
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  return ENV_ROOM;
}

let resolvedRoom: string | null = null;
/** The active game room for this session (resolved once). */
export function currentRoom(): string {
  if (resolvedRoom === null) resolvedRoom = resolveRoom();
  return resolvedRoom;
}

/** Persist a new room code and reload so every transport reconnects to it. */
export function setRoom(code: string) {
  if (typeof window === 'undefined') return;
  const clean = code.trim();
  try {
    if (clean) localStorage.setItem(ROOM_KEY, clean);
    else localStorage.removeItem(ROOM_KEY);
  } catch {
    /* ignore */
  }
  // Drop any ?game= param and reload onto the chosen room.
  const url = new URL(window.location.href);
  url.searchParams.delete('game');
  url.searchParams.delete('room');
  window.location.href = url.toString();
}

/** A shareable invite link that carries the current room. */
export function inviteLink(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.origin + '/');
  url.searchParams.set('game', currentRoom());
  return url.toString();
}

const channelFor = (room: string) => `diamond-overlay:${room}`;

export type SyncStatus = 'connecting' | 'connected' | 'local';

export interface SyncTransport {
  /** Send a named logical event with a payload to peers. */
  send(event: string, payload: unknown): void;
  /** Subscribe to a named logical event. Returns an unsubscribe. */
  on(event: string, handler: (payload: any) => void): () => void;
  /** Fire once the transport is connected and ready (or immediately if it already is). */
  onReady(cb: () => void): () => void;
  /** Connection status for the UI badge. */
  status(): SyncStatus;
  /** Number of connected devices (presence). 1 when unknown. */
  peers(): number;
  close(): void;
}

/** Stable per-device id so a device ignores echoes of its own broadcasts. */
export function makeOriginId(): string {
  try {
    const key = 'diamond-origin-id';
    let id = localStorage.getItem(key);
    if (!id) {
      const rand =
        typeof crypto !== 'undefined'
          ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
          : Math.floor(performance.now()).toString(36);
      id = `dev_${Math.floor(performance.now())}_${rand}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `dev_${Math.floor(performance.now())}`;
  }
}

export function supabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export const SYNC_MODE = (): 'supabase' | 'local' =>
  supabaseConfigured() ? 'supabase' : 'local';

// --------------------------------------------------------------------------
// Shared listener bookkeeping
// --------------------------------------------------------------------------

class Listeners {
  private map = new Map<string, Set<(p: any) => void>>();
  add(event: string, handler: (p: any) => void) {
    let set = this.map.get(event);
    if (!set) this.map.set(event, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  }
  emit(event: string, payload: any) {
    this.map.get(event)?.forEach((h) => h(payload));
  }
}

// --------------------------------------------------------------------------
// Supabase transport
// --------------------------------------------------------------------------

class SupabaseTransport implements SyncTransport {
  private channel: any = null;
  private client: any = null;
  private state: SyncStatus = 'connecting';
  private listeners = new Listeners();
  private readyCbs = new Set<() => void>();
  private peerCount = 1;
  private presenceKey = `k_${Math.floor(performance.now())}_${makeOriginId().slice(-6)}`;

  constructor(private channelName: string) {
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
      this.channel = this.client.channel(this.channelName, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: this.presenceKey },
        },
      });

      this.channel.on('broadcast', { event: WIRE_EVENT }, (msg: any) => {
        const env = msg?.payload as { event: string; payload: unknown } | undefined;
        if (env?.event) this.listeners.emit(env.event, env.payload);
      });

      this.channel.on('presence', { event: 'sync' }, () => {
        try {
          const st = this.channel.presenceState();
          this.peerCount = Math.max(1, Object.keys(st).length);
        } catch {
          /* noop */
        }
      });

      this.channel.subscribe(async (s: string) => {
        if (s === 'SUBSCRIBED') {
          this.state = 'connected';
          try {
            await this.channel.track({ id: this.presenceKey });
          } catch {
            /* presence best-effort */
          }
          this.readyCbs.forEach((cb) => cb());
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          this.state = 'connecting';
        }
      });
    } catch {
      this.state = 'local';
    }
  }

  send(event: string, payload: unknown) {
    if (!this.channel) return;
    this.channel
      .send({ type: 'broadcast', event: WIRE_EVENT, payload: { event, payload } })
      .catch(() => {});
  }

  on(event: string, handler: (p: any) => void) {
    return this.listeners.add(event, handler);
  }

  onReady(cb: () => void) {
    if (this.state === 'connected') cb();
    this.readyCbs.add(cb);
    return () => this.readyCbs.delete(cb);
  }

  status() {
    return this.state;
  }

  peers() {
    return this.peerCount;
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
// Local fallback transport (cross-tab on one device only)
// --------------------------------------------------------------------------

class LocalTransport implements SyncTransport {
  private bc: BroadcastChannel | null = null;
  private listeners = new Listeners();
  private storageListener?: (e: StorageEvent) => void;
  private readyFired = false;

  constructor(private channelName: string) {
    try {
      this.bc = new BroadcastChannel(channelName);
      this.bc.onmessage = (e) => {
        const env = e.data as { event: string; payload: unknown } | undefined;
        if (env?.event) this.listeners.emit(env.event, env.payload);
      };
    } catch {
      this.storageListener = (e: StorageEvent) => {
        if (e.key === channelName && e.newValue) {
          try {
            const env = JSON.parse(e.newValue) as { event: string; payload: unknown };
            if (env?.event) this.listeners.emit(env.event, env.payload);
          } catch {
            /* ignore */
          }
        }
      };
      window.addEventListener('storage', this.storageListener);
    }
  }

  send(event: string, payload: unknown) {
    const env = { event, payload };
    try {
      if (this.bc) this.bc.postMessage(env);
      // Nudge localStorage so brand-new tabs can hydrate the latest snapshot.
      localStorage.setItem(this.channelName, JSON.stringify(env));
    } catch {
      /* ignore quota / serialization errors */
    }
  }

  on(event: string, handler: (p: any) => void) {
    return this.listeners.add(event, handler);
  }

  onReady(cb: () => void) {
    // Local transport is ready on the next tick.
    if (!this.readyFired) {
      this.readyFired = true;
      setTimeout(cb, 0);
    } else {
      cb();
    }
    return () => {};
  }

  status() {
    return 'local' as const;
  }

  peers() {
    return 1;
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
    return {
      send() {},
      on() {
        return () => {};
      },
      onReady() {
        return () => {};
      },
      status() {
        return 'local';
      },
      peers() {
        return 1;
      },
      close() {},
    };
  }
  if (!singleton) {
    const channel = channelFor(currentRoom());
    singleton = supabaseConfigured()
      ? new SupabaseTransport(channel)
      : new LocalTransport(channel);
  }
  return singleton;
}
