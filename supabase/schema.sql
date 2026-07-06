-- Diamond Overlay — durable Postgres schema for Supabase.
--
-- The live path uses Supabase Realtime *broadcast* (no tables required), but
-- these tables give you durable persistence and a source of truth that new
-- devices can hydrate from. One row per game room (keyed by `room`).
--
-- Apply with the Supabase SQL editor or `supabase db push`.

create table if not exists game_session (
  room            text primary key,
  balls           int  not null default 0 check (balls between 0 and 3),
  strikes         int  not null default 0 check (strikes between 0 and 2),
  outs            int  not null default 0 check (outs between 0 and 2),
  home_score      int  not null default 0,
  guest_score     int  not null default 0,
  inning          int  not null default 1,
  inning_half     text not null default 'top' check (inning_half in ('top','bot')),
  current_speed   int  not null default 0,
  home_name       text not null default 'HOME',
  guest_name      text not null default 'AWAY',
  bases           jsonb not null default '{"first":false,"second":false,"third":false}'::jsonb,
  calibration_pins jsonb not null default '[]'::jsonb,
  rev             bigint not null default 0,
  updated_at      timestamptz not null default now()
);

-- Players for both teams. team is 'home' | 'guest'.
create table if not exists lineups (
  id                     text primary key,
  room                   text not null references game_session(room) on delete cascade,
  team                   text not null check (team in ('home','guest')),
  name                   text not null,
  jersey_number          text not null default '',
  batting_order_position int  not null default 0 check (batting_order_position between 0 and 9),
  defensive_position     text not null default 'BN',
  is_at_bat              boolean not null default false,
  ab                     int not null default 0,
  hits                   int not null default 0,
  rbi                    int not null default 0
);
create index if not exists lineups_room_team_idx on lineups (room, team);

-- Line score + R/H/E totals. One row per (room, team).
create table if not exists box_score (
  room     text not null references game_session(room) on delete cascade,
  team     text not null check (team in ('home','guest')),
  runs     jsonb not null default '[]'::jsonb, -- runs per inning
  hits     int not null default 0,
  errors   int not null default 0,
  primary key (room, team)
);

-- Enable Realtime on the tables (postgres_changes) in addition to broadcast.
alter publication supabase_realtime add table game_session;
alter publication supabase_realtime add table lineups;
alter publication supabase_realtime add table box_score;

-- NOTE: For a quick start these tables are left without row-level security so
-- the anon key can read/write the shared game document. For production, enable
-- RLS and scope policies to an authenticated broadcaster role.
