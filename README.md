# ⚾ Diamond Overlay

A Next.js (App Router) **Progressive Web App** that orchestrates a multi-device
live-streaming baseball overlay system. It combines **Web Bluetooth** radar
intake, **HTML5 Canvas computer vision** for reading a scoreboard, and
**real-time state sync** across phones and tablets — all deployable to Vercel.

Point one phone at the field to stream with a burned-in broadcast overlay, run
the count/score from a second phone, and manage the roster from a tablet. Every
device stays in sync in real time.

## The three views

| Route | Device | What it does |
|-------|--------|--------------|
| [`/stream`](./app/stream/page.tsx) | Hanging phone | Full-screen back camera + transparent broadcast overlay. Runs a hidden-canvas **pixel-watcher at 5 FPS** that reads calibration pins and pushes derived game state. Composites camera + graphics and publishes via **WHIP (WebRTC)** or records locally. |
| [`/controller`](./app/controller/page.tsx) | Operator's phone | **Connect Radar** over Web Bluetooth, high-visibility manual count/score/base overrides, and an interactive **calibration** camera to drop scoreboard pins. |
| [`/lineup`](./app/lineup/page.tsx) | Dugout tablet | Roster + batting-order setup, **advance current batter**, on-the-fly defensive swaps, and a **box-score editor** for hits/errors/line score. |

Open [`/`](./app/page.tsx) for the hub linking all three.

## Architecture

```
Zustand store (lib/store.ts)  ← local-first source of truth
        │  every mutation → publish + persist
        ▼
Sync transport (lib/sync.ts)
    ├─ Supabase Realtime broadcast   (when env vars set)
    └─ BroadcastChannel + localStorage (zero-config fallback)
        │
        ▼
Peers apply newer revisions (last-writer-wins via `rev`)
```

- **State management** — [Zustand](./lib/store.ts). Mutations update local state
  first, then publish the full document to peers and persist to `localStorage`.
- **Sync** — [`lib/sync.ts`](./lib/sync.ts). Uses Supabase Realtime *broadcast*
  when `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set;
  otherwise falls back to `BroadcastChannel` so the app is fully demoable with no
  backend. A `SyncTransport` interface makes a Pusher transport a drop-in.
- **Computer vision** — [`lib/vision.ts`](./lib/vision.ts). Samples each
  calibration pin's pixel and compares against its reference RGB using Euclidean
  distance (`delta < 45`) to decide whether a scoreboard light is lit.
- **Bluetooth** — [`lib/bluetooth.ts`](./lib/bluetooth.ts). Filters for
  `Pocket` / `Radar` / `PR` devices, subscribes to every notify characteristic,
  and parses speed bytes (ASCII, 8-bit, or 16-bit LE) into mph.
- **Streaming** — [`lib/streaming.ts`](./lib/streaming.ts). Composites the
  camera frame and canvas overlay ([`lib/overlayCanvas.ts`](./lib/overlayCanvas.ts)),
  then publishes the combined `MediaStream` to a **WHIP** ingest endpoint
  (Livepeer / Mux / Cloudflare Stream) or records a downloadable WebM.

## Data model

Mirrors the requested schema — see [`lib/types.ts`](./lib/types.ts) and the
durable Postgres version in [`supabase/schema.sql`](./supabase/schema.sql):

- **game_session** — balls, strikes, outs, home/guest score, inning, inning_half,
  current_speed, calibration_pins (JSON), bases, team names.
- **lineups** — per-team players with id, name, jersey_number,
  batting_order_position, defensive_position, is_at_bat (+ today's AB/H/RBI).
- **box_score** — per-team line score (runs per inning) plus R / H / E.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

> Camera, Web Bluetooth, and Wake Lock require a **secure context**. `localhost`
> is treated as secure for dev; for real devices deploy to HTTPS (Vercel) or use
> a secure tunnel. **iOS Safari does not support Web Bluetooth** — use
> Chrome/Edge on Android for the radar.

### Optional: real cross-device sync with Supabase

1. Create a Supabase project.
2. (Optional durability) run [`supabase/schema.sql`](./supabase/schema.sql).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (see [`.env.example`](./.env.example)).

Without these, the app runs in single-device **local** sync mode and the UI
shows an amber "Local-only mode" warning — a quick way to confirm at launch that
cross-device sync is actually wired.

## Launch checklist (Supabase + Vercel)

1. **Supabase** → create a project. Copy the Project URL and the `anon` public
   key from *Project Settings → API*. Realtime is on by default; the live sync
   path uses **broadcast**, so no tables or SQL are required to go live.
   (Optionally run [`supabase/schema.sql`](./supabase/schema.sql) for durable
   persistence.)
2. **Vercel** → import this repo and add env vars for **Production** (and
   Preview if you use it):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GAME_ROOM` — optional; any string. All devices sharing this
     value join the same game. Keep it identical across phones (they inherit it
     from the shared deployment), or run two simultaneous games by giving each
     its own room.
3. **Deploy.** Vercel serves HTTPS by default, satisfying the secure-context
   requirement for camera + Web Bluetooth. [`next.config.js`](./next.config.js)
   sets the `Permissions-Policy` (bluetooth/camera) and
   `upgrade-insecure-requests` headers.
4. On each phone, open the deployment and **Add to Home Screen** to install it
   as a standalone PWA. The home screen shows a green **"Synced · N"** badge with
   the live device count once Supabase is connected.

## Multi-device topology (master + video phone)

Because sync runs through Supabase in the cloud, devices do **not** need to be on
the same network — the master phone and the video phone can be on different
Wi-Fi, or the video phone can ride the master's hotspot, and they'll still stay
in sync as long as each has internet.

- **Master phone** → open `/controller` (and `/lineup`). This is the authority:
  radar intake, manual count/score overrides, calibration.
- **Video phone** (an older phone hung over the field) → open `/stream`. It runs
  the camera, the pixel-watcher, and the outgoing broadcast.
- **Late join is handled:** when the video phone connects after the master
  already has a game going, it immediately requests and adopts the current state
  (it won't sit blank until the next change).
- **Manual beats CV:** whenever the master makes a manual edit, the video phone's
  pixel-watcher backs off for a few seconds so a correction isn't instantly
  overwritten by the next camera frame. CV resumes automatically once the
  operator stops touching the controls.

> Reliability tips for an older video phone: keep `/stream` in the foreground
> (installed as a PWA with the screen wake-lock the app requests), and prefer a
> stable power source — camera + encoding + upload is battery-intensive. Web
> Bluetooth is unsupported on iOS, so use the Android phone as the master for the
> radar; the video phone only needs a working camera.

## PWA

- [`public/manifest.json`](./public/manifest.json) — standalone display,
  maskable icons, and shortcuts to each view so the app installs as a native-like
  Android app (keeping Web Bluetooth alive in the foreground).
- [`public/sw.js`](./public/sw.js) — caches the app shell for offline resilience;
  live state still flows over the realtime channel.
- Icons are generated by [`scripts/gen-icons.js`](./scripts/gen-icons.js)
  (`node scripts/gen-icons.js`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next.js lint |
