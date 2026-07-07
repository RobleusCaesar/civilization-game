-- Clanfire cloud saves — initial schema.
-- Apply via the Supabase SQL editor (paste this whole file) or `supabase db push`.
-- Requires: Authentication → Sign In / Up → "Allow anonymous sign-ins" ENABLED.

-- ---------------------------------------------------------------------------
-- profiles: one row per anonymous player, keyed by their auth identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  chief_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each policy is scoped to auth.uid(): a browser can only ever touch the row
-- matching the anonymous user it is signed in as. There is no cross-player
-- read path at all.
create policy "profiles: own select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: own insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: own update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: own delete" on public.profiles
  for delete using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- saves: up to five named slots per player
-- ---------------------------------------------------------------------------
create table public.saves (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  slot              smallint not null check (slot between 1 and 5),
  name              text not null default 'Village',
  game_version      text not null default '1',
  day               integer not null default 1,
  map_seed          text,
  landform          text,
  playtime_seconds  integer not null default 0,
  thumbnail         text,          -- small base64 minimap PNG (data URL)
  state             jsonb not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, slot)
);

alter table public.saves enable row level security;

create policy "saves: own select" on public.saves
  for select using (auth.uid() = user_id);
create policy "saves: own insert" on public.saves
  for insert with check (auth.uid() = user_id);
create policy "saves: own update" on public.saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saves: own delete" on public.saves
  for delete using (auth.uid() = user_id);

-- keep updated_at honest on every overwrite
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger saves_touch
  before update on public.saves
  for each row execute function public.touch_updated_at();
