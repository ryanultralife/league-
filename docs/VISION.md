# Vision — League & Event Video Platform

*Working name: Diamond. Last updated: July 2026.*

## What we're building

A platform where a league's games become **living video events**: streamed live
with broadcast overlays, and then broken down into **per-person video** —
highlight reels for every player, coaching reels for review, fan-submitted
clips, and (later) multiple camera angles woven into one timeline.

The current overlay app is not the product; it's the **game-day capture
console** of the product. It already does the hard, differentiating thing:
while the game streams, an operator (plus computer vision + radar) is producing
a **timestamped, player-linked record of everything that happens** — who was at
bat, what the count was, when the run scored, how fast the pitch was.

## The core insight

> **Scoring data + video timeline = automatic personalized video.**

Every event the console captures (at-bat start, pitch count, out, run, speed)
carries a wall-clock timestamp. The broadcast recording has a known start time.
Aligning the two turns reel-making into a database query:

```
"every at-bat for player #12"      → SELECT events WHERE kind='batter' AND player=...
"all pitches over 60 mph"          → SELECT events WHERE kind='speed' AND mph > 60
"the 5th-inning rally"             → SELECT events WHERE inning=5 AND kind='run'
   → each event maps to an offset in the recording → cut list → reel
```

Generic sports-video products make humans scrub footage. We generate the cut
list live, as a side effect of running the scoreboard. That's the moat.

## Product pillars (phased)

### Phase 1 — Foundation (now)
- **Event timeline capture**: every game action logged with timestamps into a
  play-by-play (shipped alongside this doc). Stream start/stop markers included
  so events can later be mapped to offsets in the recording.
- **Durable backend**: move from an ephemeral broadcast document to real
  Supabase Postgres — accounts (Supabase Auth), leagues → teams → players →
  games. A game's state, lineup, box score, and event log survive forever.
- The existing views (stream / controller / lineup / view / watch) become the
  game-day surfaces of the platform.

### Phase 2 — Clips & the event library
- Fan/player **clip uploads**: direct-to-storage (presigned URLs → Cloudflare
  R2), tagged to a game, a moment, and the people in it.
- **Event gallery**: each game page = live stream (during) + recording, play-by-
  play, box score, and everyone's clips (after).

### Phase 3 — Personalized & coaching reels
- **Auto reels**: per-player cut lists generated from the event timeline over
  the game recording (server-side ffmpeg worker cuts and stitches).
- **Coaching reels**: filter by situation (all 2-strike counts, all defensive
  plays at SS), annotate, share to a player.

### Phase 4 — Multi-camera
- Multiple phones film the same game; the shared event timeline is the sync
  spine. Angle switching / picture-in-picture composed per moment.

## Infrastructure decision (hybrid)

| Concern | Choice | Why |
|---|---|---|
| **Live streaming** | Managed (Livepeer today), behind our `startWhip` interface | Live infra punishes self-hosting: transcode + CDN + on-call during games. Rent it; the interface keeps it swappable (Mux/Cloudflare/self-hosted later). |
| **VOD & clips storage** | Self-owned: Cloudflare R2 | Zero egress fees (decisive for video), S3-compatible, cheap at rest. We own the library. |
| **Transcode/reel worker** | Self-owned: ffmpeg on a small worker (Phase 3) | Batch, retryable, failure-tolerant — the safe half to self-host. |
| **Data & auth** | Supabase (Postgres + Auth + Realtime) | Already integrated; realtime stays for game-day sync, Postgres becomes the durable source of truth. |
| **App hosting** | Vercel | Already live; PWA + serverless API routes. |

**Explicit call: we do NOT self-host live streaming now.** Revisit only when
per-minute costs at real scale beat the price of owning uptime during games.

## Data model (target)

```
users (Supabase Auth)
└── memberships (role: owner/scorer/coach/player/fan) ──┐
leagues ── seasons ── teams ── players ←────────────────┘
games (league, home/away team, scheduled_at, status)
├── game_state       (live doc: count, score, bases — realtime)
├── lineup_slots     (game × player: order, position, at-bat flag)
├── game_events      (ts, kind, player_id?, data)   ← the timeline
├── media_assets     (kind: broadcast|clip|reel, r2_key, duration,
│                     started_at → aligns asset time to event time)
└── clips/reels      (asset + in/out offsets + tagged player_ids)
```

## Design principles

1. **Game day must never get harder.** Every platform feature rides on data the
   console already produces; the operator's job stays: score the game.
2. **Own the metadata, rent the plumbing.** Providers are swappable; the
   event-timeline + people graph is not.
3. **Local-first, sync-second** stays: a dropped connection at the field never
   blocks scoring; data reconciles when back online.
4. **Every person is a first-class subject.** Players, not games, are the unit
   fans care about — every feature should answer "show me *my kid*."
