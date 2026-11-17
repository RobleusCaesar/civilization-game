-- 0017 — THE FIRST GAME (build 178; tests/analytics.mjs §6d, tests/first-quick.mjs).
--
-- Why: 13% of games reached a result and only 19 players had ever earned a
-- card. A device's FIRST game is now a hidden profile, mode 'first_quick'
-- (CFG.MODES.first_quick in js/config.js): the smallest map, a slow Calm
-- rival, a cheaper Wonder, and one guaranteed Iron card the moment the Town
-- Center first reaches level 2 (the "milestone").
--
-- What this paste does:
--   1. lets the telemetry table take mode 'first_quick' (0003 allowed only
--      calm/moderate/hard — without this every first game's run_start and
--      run_end row is REFUSED, and so is its end-of-game card)
--   2. card_milestones + grant_milestone(p_run_id, p_card): the milestone
--      card, at most ONE per player, only for a run whose run_start says
--      'first_quick', only of the milestone tier (card_milestone_tier()), and
--      only when the player has no earlier game of another mode
--   3. analytics_first_quick(p_token, p_release, p_everyone): first games in
--      the new profile against first games before it — games, finished, win
--      rate, median win day and played-again-within-a-week
--
-- One idempotent paste, after 0016. PASTE IT BEFORE BUILD 178 GOES LIVE.

-- ===========================================================================
-- 1. the mode
-- ===========================================================================
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.telemetry'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) ilike '%mode%'
              and pg_get_constraintdef(c.oid) not ilike '%kind%' loop
    execute format('alter table public.telemetry drop constraint %I', r.conname);
  end loop;
end
$$;
alter table public.telemetry add constraint telemetry_mode_check
  check (mode is null or mode in ('calm', 'moderate', 'hard', 'first_quick'));

-- ===========================================================================
-- 2. the milestone card
-- ===========================================================================
create or replace function public.card_milestone_tier()
returns text language sql immutable set search_path = '' as $$ select 'iron'::text $$;
revoke all on function public.card_milestone_tier() from public;

create table if not exists public.card_milestones (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  run_id     text not null check (char_length(run_id) between 1 and 64),
  card_key   text not null references public.card_catalog (card_key),
  tier       text not null,
  created_at timestamptz not null default now()
);
alter table public.card_milestones enable row level security;
revoke all on table public.card_milestones from public;
revoke all on table public.card_milestones from anon, authenticated;

drop function if exists public.grant_milestone(text, text);
create function public.grant_milestone(p_run_id text, p_card text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_prev  record;
  v_start record;
  v_tier  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_run_id is null or char_length(p_run_id) not between 1 and 64
     or p_card is null or char_length(p_card) not between 1 and 64 then
    return public.card_refuse(v_uid, 'milestone', 'bad_input', p_run_id, jsonb_build_object('card', p_card));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- ONE EVER: the same run asking again is a duplicate; another run is refused
  select m.run_id, m.card_key into v_prev from public.card_milestones m where m.user_id = v_uid;
  if found then
    if v_prev.run_id = p_run_id then
      return jsonb_build_object('ok', true, 'already', true, 'card', v_prev.card_key);
    end if;
    return public.card_refuse(v_uid, 'milestone', 'already_had', p_run_id, jsonb_build_object('card', p_card));
  end if;

  -- THE EVIDENCE: this run's own run_start, in the first-game profile
  select t.mode, t.created_at into v_start
    from public.telemetry t
   where t.user_id = v_uid and t.run_id = p_run_id and t.kind = 'run_start'
   order by t.id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_run');
  end if;
  if v_start.mode is distinct from 'first_quick' then
    return public.card_refuse(v_uid, 'milestone', 'not_first_quick', p_run_id, jsonb_build_object('mode', v_start.mode));
  end if;
  -- …and the player's first game: no earlier game of another mode
  if exists (select 1 from public.telemetry t
              where t.user_id = v_uid and t.kind = 'run_start' and t.run_id <> p_run_id
                and t.created_at < v_start.created_at
                and coalesce(t.mode, '') <> 'first_quick') then
    return public.card_refuse(v_uid, 'milestone', 'not_first', p_run_id, '{}'::jsonb);
  end if;

  select c.tier into v_tier from public.card_catalog c where c.card_key = p_card and c.active;
  if v_tier is null or v_tier <> public.card_milestone_tier() then
    return public.card_refuse(v_uid, 'milestone', 'bad_cards', p_run_id,
      jsonb_build_object('card', p_card, 'tier', v_tier));
  end if;

  insert into public.card_milestones (user_id, run_id, card_key, tier) values (v_uid, p_run_id, p_card, v_tier);
  insert into public.card_collection (user_id, card_key, qty) values (v_uid, p_card, 1)
  on conflict (user_id, card_key) do update
    set qty = least(public.card_collection.qty + 1, 999), updated_at = now();
  return jsonb_build_object('ok', true, 'card', p_card);
end;
$$;
revoke all on function public.grant_milestone(text, text) from public;
revoke all on function public.grant_milestone(text, text) from anon, authenticated;
grant execute on function public.grant_milestone(text, text) to authenticated;

-- ===========================================================================
-- 3. analytics_first_quick
-- ===========================================================================
-- { ok, release, cohorts: { first_quick: {...}, before: {...} } } where each
-- cohort is { games, won, lost, finished_pct, win_pct, median_win_day,
--             again_n, again_of, again_pct, milestones }.
-- A player's FIRST game is their earliest run_start. 'first_quick' is every
-- first game played in the profile; 'before' every first game started before
-- the release (p_release, else the first first_quick run_start seen).
-- Played again: a second game within 7 days of the first, counted only for
-- first games whose week has passed. Win rate is of games won or lost.
drop function if exists public.analytics_first_quick(text, timestamptz, boolean);
create function public.analytics_first_quick(
  p_token text, p_release timestamptz default null, p_everyone boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rel timestamptz;
  v_out jsonb;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  v_rel := coalesce(p_release,
    (select min(t.created_at) from public.telemetry t where t.kind = 'run_start' and t.mode = 'first_quick'));

  with g as (
    select * from public.analytics__games(null, null, null, null, coalesce(p_everyone, false))
  ),
  ranked as (
    select g.*, row_number() over (partition by g.user_id order by g.started_at, g.run_id) as n,
           lead(g.started_at) over (partition by g.user_id order by g.started_at, g.run_id) as next_at
    from g
  ),
  firsts as (
    select r.*, case when r.mode = 'first_quick' then 'first_quick'
                     when v_rel is null or r.started_at < v_rel then 'before' end as cohort
    from ranked r where r.n = 1
  ),
  agg as (
    select f.cohort,
           count(*) as games,
           count(*) filter (where f.result = 'won') as won,
           count(*) filter (where f.result = 'lost') as lost,
           percentile_cont(0.5) within group (order by f.day) filter (where f.result = 'won' and f.day is not null) as med_win,
           count(*) filter (where f.started_at <= now() - interval '7 days') as again_of,
           count(*) filter (where f.started_at <= now() - interval '7 days'
                              and f.next_at is not null and f.next_at <= f.started_at + interval '7 days') as again_n,
           count(*) filter (where exists (select 1 from public.card_milestones m where m.run_id = f.run_id)) as milestones
    from firsts f where f.cohort is not null group by f.cohort
  )
  select jsonb_build_object(
    'ok', true,
    'release', v_rel,
    'cohorts', coalesce((select jsonb_object_agg(a.cohort, jsonb_build_object(
        'games', a.games, 'won', a.won, 'lost', a.lost,
        'finished_pct', case when a.games > 0 then round(100.0 * (a.won + a.lost) / a.games, 1) end,
        'win_pct', case when a.won + a.lost > 0 then round(100.0 * a.won / (a.won + a.lost), 1) end,
        'median_win_day', case when a.med_win is not null then round(a.med_win::numeric) end,
        'again_n', a.again_n, 'again_of', a.again_of,
        'again_pct', case when a.again_of > 0 then round(100.0 * a.again_n / a.again_of, 1) end,
        'milestones', a.milestones)) from agg a), '{}'::jsonb))
  into v_out;
  return v_out;
end
$$;
revoke all on function public.analytics_first_quick(text, timestamptz, boolean) from public;
grant execute on function public.analytics_first_quick(text, timestamptz, boolean) to anon, authenticated;
