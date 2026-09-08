-- Clanfire 0003 — wipe the leaderboard for launch, and add private analytics.
-- Apply via the Supabase SQL editor (paste this whole file), after 0002.
--
-- Two unrelated things ship together because they are one operator action:
--   1. every high score is deleted and the board starts empty;
--   2. a telemetry table + a token-gated aggregate function feed
--      /analytics.html, which is the only way that data is ever read.
--
-- Re-running this file is safe. Section 1 deletes scores AGAIN (it is a
-- reset, and that is the point); sections 2-5 are all if-not-exists /
-- create-or-replace.

-- ---------------------------------------------------------------------------
-- 1. THE BOARD STARTS EMPTY
-- ---------------------------------------------------------------------------
-- 0002 deliberately gave the leaderboard no delete policy — "scores are
-- history" — so no client, not even the one that wrote a row, can erase it.
-- This runs as the table owner in the SQL editor, which is the only place a
-- wipe can happen, and is exactly why it lives in a migration rather than in
-- the game. Identity restarts at 1 so the fresh board's ids read as a fresh
-- board.
delete from public.leaderboard;
alter table public.leaderboard alter column id restart with 1;

-- ---------------------------------------------------------------------------
-- 2. TELEMETRY — one row per event, insert-only, never client-readable
-- ---------------------------------------------------------------------------
-- Anonymous by construction: user_id is the same anonymous auth uid the saves
-- already use (no email, no name, no IP stored by us). A row records what
-- KIND of thing happened and a small bag of typed columns for the things
-- every dashboard tile needs, plus props jsonb for the long tail.
--
--   kind = 'run_start'  a run was founded (mode/landform/size/cards/tutorial)
--   kind = 'run_end'    a run finished    (outcome/day/playtime/level/score)
--   kind = 'session'    a visit ended     (seconds on site)
--
-- run_id ties a start to its end, so abandonment is start-without-end.
create table if not exists public.telemetry (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  run_id       text,
  kind         text not null check (kind in ('run_start', 'run_end', 'session')),
  outcome      text check (outcome is null or outcome in ('win', 'loss', 'abandoned')),
  cause        text,
  mode         text check (mode is null or mode in ('calm', 'moderate', 'hard')),
  landform     text,
  size         text,
  device       text check (device is null or device in ('mobile', 'desktop')),
  game_version text,
  day          integer check (day is null or (day >= 0 and day <= 100000)),
  seconds      integer check (seconds is null or (seconds >= 0 and seconds <= 1000000)),
  tc_level     integer check (tc_level is null or (tc_level >= 0 and tc_level <= 10)),
  peak_pop     integer check (peak_pop is null or (peak_pop >= 0 and peak_pop <= 100000)),
  score        integer check (score is null or (score >= 0 and score <= 1000000)),
  props        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists telemetry_created_idx on public.telemetry (created_at desc);
create index if not exists telemetry_kind_idx    on public.telemetry (kind, created_at desc);
create index if not exists telemetry_run_idx     on public.telemetry (run_id);
create index if not exists telemetry_user_idx    on public.telemetry (user_id);

alter table public.telemetry enable row level security;

-- A browser may add its OWN rows and nothing else. There is deliberately no
-- select policy: with RLS on and no policy, every client read returns zero
-- rows, so raw play data can never be scraped with the publishable key. The
-- dashboard reads through the aggregate function in section 4 instead.
drop policy if exists "telemetry: own insert" on public.telemetry;
create policy "telemetry: own insert" on public.telemetry
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. THE DASHBOARD TOKEN
-- ---------------------------------------------------------------------------
-- RLS on with no policy at all: unreachable from any client, readable only by
-- the security-definer function below. Stores sha256(sha256(salt||passphrase))
-- — the page sends the inner hash, so the passphrase itself never crosses the
-- wire and a leaked query log cannot reveal it.
create table if not exists public.analytics_config (
  id         integer primary key default 1 check (id = 1),
  token_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.analytics_config enable row level security;

-- Set (or change) the dashboard passphrase. Run this ONCE with your own
-- passphrase, then log in with that same passphrase at /analytics.html:
--     select public.set_analytics_token('choose a long passphrase here');
create or replace function public.set_analytics_token(p_plain text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.analytics_config (id, token_hash, updated_at)
  values (1, encode(digest(encode(digest('clanfire-analytics-v1:' || p_plain, 'sha256'), 'hex'), 'sha256'), 'hex'), now())
  on conflict (id) do update
    set token_hash = excluded.token_hash, updated_at = now();
$$;
revoke all on function public.set_analytics_token(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE AGGREGATE READ PATH
-- ---------------------------------------------------------------------------
-- Everything the dashboard shows, in one call, as one jsonb document. Only
-- AGGREGATES leave the database — no row is ever returned, so even a stolen
-- token cannot expose an individual player's history.
--
-- p_token is the client-side hash described above. Filters are all optional
-- (null = no filter).
create or replace function public.analytics_summary(
  p_token    text,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_mode     text default null,
  p_landform text default null,
  p_device   text default null,
  p_version  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stored text;
  v_ok     boolean;
  v_out    jsonb;
begin
  select token_hash into v_stored from public.analytics_config where id = 1;
  if v_stored is null then
    return jsonb_build_object('error', 'no_token_set');
  end if;
  -- constant-time-ish compare on the digest, never on the raw input
  v_ok := (encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') = v_stored);
  if not v_ok then
    return jsonb_build_object('error', 'bad_token');
  end if;

  with filtered as (
    select * from public.telemetry t
    where (p_from     is null or t.created_at >= p_from)
      and (p_to       is null or t.created_at <  p_to)
      and (p_mode     is null or t.mode      = p_mode)
      and (p_landform is null or t.landform  = p_landform)
      and (p_device   is null or t.device    = p_device)
      and (p_version  is null or t.game_version = p_version)
  ),
  starts as (select * from filtered where kind = 'run_start'),
  ends   as (select * from filtered where kind = 'run_end'),
  sess   as (select * from filtered where kind = 'session'),
  -- a run is abandoned when it was founded and never reported an ending
  abandoned as (
    select s.* from starts s
    where s.run_id is not null
      and not exists (select 1 from ends e where e.run_id = s.run_id)
  ),
  per_player as (
    select user_id, count(*) as runs from starts group by user_id
  )
  select jsonb_build_object(
    'generated_at', now(),

    -- ---- headline ------------------------------------------------------
    'totals', jsonb_build_object(
      'runs_started',   (select count(*) from starts),
      'runs_finished',  (select count(*) from ends),
      'runs_abandoned', (select count(*) from abandoned),
      'wins',           (select count(*) from ends where outcome = 'win'),
      'losses',         (select count(*) from ends where outcome = 'loss'),
      'players',        (select count(distinct user_id) from filtered),
      'sessions',       (select count(*) from sess),
      'events',         (select count(*) from filtered),
      'first_event',    (select min(created_at) from filtered),
      'last_event',     (select max(created_at) from filtered)
    ),

    -- ---- rates ---------------------------------------------------------
    'rates', jsonb_build_object(
      'win_pct',      (select round(100.0 * count(*) filter (where outcome = 'win')
                              / nullif(count(*), 0), 1) from ends),
      'loss_pct',     (select round(100.0 * count(*) filter (where outcome = 'loss')
                              / nullif(count(*), 0), 1) from ends),
      'abandon_pct',  (select round(100.0 * (select count(*) from abandoned)
                              / nullif((select count(*) from starts), 0), 1)),
      'repeat_pct',   (select round(100.0 * count(*) filter (where runs > 1)
                              / nullif(count(*), 0), 1) from per_player)
    ),

    -- ---- how long, how far ---------------------------------------------
    'averages', jsonb_build_object(
      'run_minutes',        (select round((avg(seconds) / 60.0)::numeric, 1) from ends),
      'run_minutes_median', (select round((percentile_cont(0.5) within group (order by seconds) / 60.0)::numeric, 1) from ends),
      'day_reached',        (select round(avg(day)::numeric, 1) from ends),
      'day_median',         (select percentile_cont(0.5) within group (order by day) from ends),
      'tc_level',           (select round(avg(tc_level)::numeric, 2) from ends where tc_level is not null),
      'peak_pop',           (select round(avg(peak_pop)::numeric, 1) from ends where peak_pop is not null),
      'win_score',          (select round(avg(score)::numeric, 0) from ends where outcome = 'win' and score is not null),
      'runs_per_player',    (select round(avg(runs)::numeric, 2) from per_player),
      'session_minutes',    (select round((avg(seconds) / 60.0)::numeric, 1) from sess),
      'sessions_per_player',(select round((count(*)::numeric / nullif(count(distinct user_id), 0)), 2) from sess)
    ),

    -- ---- time on site ----------------------------------------------------
    'time_on_site', jsonb_build_object(
      'total_hours',   (select round((sum(seconds) / 3600.0)::numeric, 1) from sess),
      'median_minutes',(select round((percentile_cont(0.5) within group (order by seconds) / 60.0)::numeric, 1) from sess),
      'p90_minutes',   (select round((percentile_cont(0.9) within group (order by seconds) / 60.0)::numeric, 1) from sess)
    ),

    -- ---- the split every dashboard tile wants ---------------------------
    'by_mode', (
      select coalesce(jsonb_agg(x order by x->>'mode'), '[]'::jsonb) from (
        select jsonb_build_object(
          'mode', coalesce(s.mode, 'unknown'),
          'starts', count(*),
          'share_pct', round(100.0 * count(*) / nullif((select count(*) from starts), 0), 1),
          'finished', (select count(*) from ends e where coalesce(e.mode,'unknown') = coalesce(s.mode,'unknown')),
          'win_pct', (select round(100.0 * count(*) filter (where e.outcome = 'win')
                             / nullif(count(*), 0), 1)
                      from ends e where coalesce(e.mode,'unknown') = coalesce(s.mode,'unknown')),
          'avg_minutes', (select round((avg(e.seconds) / 60.0)::numeric, 1)
                          from ends e where coalesce(e.mode,'unknown') = coalesce(s.mode,'unknown')),
          'avg_day', (select round(avg(e.day)::numeric, 1)
                      from ends e where coalesce(e.mode,'unknown') = coalesce(s.mode,'unknown'))
        ) as x
        from starts s group by s.mode
      ) q
    ),

    'by_landform', (
      select coalesce(jsonb_agg(x order by (x->>'starts')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'landform', coalesce(s.landform, 'unknown'),
          'starts', count(*),
          'win_pct', (select round(100.0 * count(*) filter (where e.outcome = 'win')
                             / nullif(count(*), 0), 1)
                      from ends e where coalesce(e.landform,'unknown') = coalesce(s.landform,'unknown'))
        ) as x
        from starts s group by s.landform
      ) q
    ),

    'by_device', (
      select coalesce(jsonb_agg(x order by (x->>'starts')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'device', coalesce(s.device, 'unknown'),
          'starts', count(*),
          'players', count(distinct s.user_id),
          'win_pct', (select round(100.0 * count(*) filter (where e.outcome = 'win')
                             / nullif(count(*), 0), 1)
                      from ends e where coalesce(e.device,'unknown') = coalesce(s.device,'unknown')),
          'avg_minutes', (select round((avg(e.seconds) / 60.0)::numeric, 1)
                          from ends e where coalesce(e.device,'unknown') = coalesce(s.device,'unknown'))
        ) as x
        from starts s group by s.device
      ) q
    ),

    'by_version', (
      select coalesce(jsonb_agg(x order by (x->>'events')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('version', coalesce(game_version, 'unknown'), 'events', count(*)) as x
        from filtered group by game_version
      ) q
    ),

    -- ---- why runs end — the thing that tells us what to fix -------------
    'endings', (
      select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'outcome', coalesce(outcome, 'unknown'),
          'cause', coalesce(cause, 'unknown'),
          'n', count(*),
          'avg_day', round(avg(day)::numeric, 1),
          'avg_minutes', round((avg(seconds) / 60.0)::numeric, 1)
        ) as x
        from ends group by outcome, cause
      ) q
    ),

    -- ---- where people fall out: the survival curve ----------------------
    'day_buckets', (
      select coalesce(jsonb_agg(x order by (x->>'lo')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'lo', b.lo, 'label', b.label,
          'n', count(e.id),
          'win_pct', round(100.0 * count(e.id) filter (where e.outcome = 'win')
                     / nullif(count(e.id), 0), 1)
        ) as x
        from (values (0,'day 1-10'), (10,'day 11-25'), (25,'day 26-50'), (50,'day 51-100'),
                     (100,'day 101-200'), (200,'day 201-400'), (400,'day 400+')) as b(lo, label)
        left join ends e on e.day >= b.lo and (b.lo = 400 or e.day < case b.lo
          when 0 then 10 when 10 then 25 when 25 then 50 when 50 then 100
          when 100 then 200 when 200 then 400 end)
        group by b.lo, b.label
      ) q
    ),

    -- ---- the first minutes: does the opening land? ----------------------
    'early_funnel', jsonb_build_object(
      'quit_before_day_5',  (select count(*) from ends where day < 5),
      'quit_before_day_10', (select count(*) from ends where day < 10),
      'reached_day_50',     (select count(*) from ends where day >= 50),
      'under_2_minutes',    (select count(*) from ends where seconds < 120),
      'tutorial_on',        (select count(*) from starts where props->>'tutorial' = 'true'),
      'tutorial_off',       (select count(*) from starts where props->>'tutorial' = 'false'),
      'tutorial_win_pct',   (select round(100.0 * count(*) filter (where e.outcome = 'win')
                                    / nullif(count(*), 0), 1)
                             from ends e where e.props->>'tutorial' = 'true')
    ),

    -- ---- how they actually play ----------------------------------------
    -- the card is pulled out FIRST, into its own derived table, so the
    -- win-rate subquery correlates on a plain column. Grouping by the
    -- expression props->>'card' and then reaching for s.props inside the
    -- subquery is the "subquery uses ungrouped column" error — Postgres
    -- only lets you reference the grouping expression itself.
    'origin_cards', (
      select coalesce(jsonb_agg(x order by (x->>'picked')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'card', coalesce(c.card, 'unknown'),
          'picked', c.picked,
          'win_pct', (select round(100.0 * count(*) filter (where e.outcome = 'win')
                             / nullif(count(*), 0), 1)
                      from ends e
                      where coalesce(e.props->>'card', 'unknown') = coalesce(c.card, 'unknown'))
        ) as x
        from (
          select s.props->>'card' as card, count(*) as picked
          from starts s group by s.props->>'card'
        ) c
      ) q
    ),

    'play_style', jsonb_build_object(
      'avg_buildings', (select round(avg((props->>'built')::numeric), 1) from ends where props ? 'built'),
      'avg_units',     (select round(avg((props->>'trained')::numeric), 1) from ends where props ? 'trained'),
      'avg_kills',     (select round(avg((props->>'kills')::numeric), 1) from ends where props ? 'kills'),
      'avg_walls',     (select round(avg((props->>'walls')::numeric), 1) from ends where props ? 'walls'),
      'avg_upgrades',  (select round(avg((props->>'upgrades')::numeric), 1) from ends where props ? 'upgrades'),
      'avg_explored_pct', (select round(avg((props->>'explored')::numeric), 1) from ends where props ? 'explored'),
      'wonder_win_pct',(select round(100.0 * count(*) filter (where cause = 'wonder')
                               / nullif(count(*), 0), 1) from ends),
      'relic_found_pct',(select round(100.0 * count(*) filter (where props->>'relic_found' = 'true')
                               / nullif(count(*), 0), 1) from ends)
    ),

    -- ---- the last 30 days, for the trend line ---------------------------
    'daily', (
      select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) from (
        select jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'starts', count(*) filter (where kind = 'run_start'),
          'finishes', count(*) filter (where kind = 'run_end'),
          'players', count(distinct user_id)
        ) as x
        from filtered
        where created_at > now() - interval '30 days'
        group by date_trunc('day', created_at)
      ) q
    ),

    -- ---- what the filter dropdowns offer --------------------------------
    'facets', jsonb_build_object(
      'modes',     (select coalesce(jsonb_agg(distinct mode) filter (where mode is not null), '[]'::jsonb) from public.telemetry),
      'landforms', (select coalesce(jsonb_agg(distinct landform) filter (where landform is not null), '[]'::jsonb) from public.telemetry),
      'devices',   (select coalesce(jsonb_agg(distinct device) filter (where device is not null), '[]'::jsonb) from public.telemetry),
      'versions',  (select coalesce(jsonb_agg(distinct game_version) filter (where game_version is not null), '[]'::jsonb) from public.telemetry)
    )
  ) into v_out;

  return v_out;
end;
$$;

-- the page calls this as the anonymous/authenticated role; the token check
-- inside is what actually guards it
grant execute on function public.analytics_summary(text, timestamptz, timestamptz, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. AFTER APPLYING THIS FILE
-- ---------------------------------------------------------------------------
--   select public.set_analytics_token('your long passphrase');
-- then open https://clanfire.online/analytics.html and sign in with it.
