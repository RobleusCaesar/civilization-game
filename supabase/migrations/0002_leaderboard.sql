-- Clanfire arcade leaderboard + arcade names.
-- Apply via the Supabase SQL editor (paste this whole file), after 0001.

-- one arcade name per player, up to 7 characters, saved on their profile
alter table public.profiles
  add column if not exists arcade_name text
  check (arcade_name is null or char_length(arcade_name) between 1 and 7);

-- ---------------------------------------------------------------------------
-- leaderboard: one row per submitted victory. Readable by EVERYONE (that is
-- the point of a global board); writable only as yourself, and only inserts —
-- no player can edit or erase history.
-- ---------------------------------------------------------------------------
create table public.leaderboard (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 7),
  score        integer not null check (score >= 0 and score <= 1000000),
  mode         text not null check (mode in ('calm', 'moderate', 'hard')),
  day          integer,
  map_seed     text,
  game_version text,
  created_at   timestamptz not null default now()
);

create index leaderboard_score_idx on public.leaderboard (score desc);

alter table public.leaderboard enable row level security;

create policy "leaderboard: public read" on public.leaderboard
  for select using (true);
create policy "leaderboard: own insert" on public.leaderboard
  for insert with check (auth.uid() = user_id);
-- no update/delete policies on purpose: scores are history
