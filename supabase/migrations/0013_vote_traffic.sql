-- 0013 — AFTER THE FIRST VOTE, A RANDOM STONE CARD; AND WHERE PLAYERS COME FROM
--
-- WHY (the operator, 2026-11-03, on the vote reward 0012 made: "when it
-- reappears, all future free cards are stone (lowest level), and
-- randomized … Add this to the analytics in a traffic section so we can see
-- if it's driving any views / plays").
--
-- WHAT.
--   1. telemetry admits kind 'vote': the game's vote banner and its pop-up
--      send one row when the offer is SEEN, OPENED and taken (GO) — props
--      { step, where, first } (js/vote.js).
--   2. vote_later_tier() and vote_reward() replaced: a player's FIRST vote
--      still earns vote_card() (Swift Raiders); every later one earns a
--      random active card of vote_later_tier() (Stone). The gap, the
--      idempotency and the doors are 0012's, unchanged.
--   3. vote_status() — the player's door: how many votes earned a card and
--      when the last one was counted, so the game knows which card the next
--      vote earns and when the banner may come back (12 hours after it).
--   4. analytics_traffic() — the dashboard's Traffic section, behind the
--      0003 passphrase like every other door: visits by the site they came
--      from (session props.src), players and games by the site each device
--      FIRST came from (props.src1), the vote banner's funnel (kind 'vote')
--      and the votes the site reported (card_votes), and a day-by-day line.
--
-- SEALED BY DEFAULT like 0010 and 0012: every function is security definer
-- with an empty search_path; vote_reward() stays the SERVICE ROLE's alone,
-- vote_status() is granted to authenticated, analytics_traffic() to the
-- publishable roles but answers only the passphrase. Nothing read out of a
-- client's props is ever CAST — only compared as text — so one hostile row
-- can never raise an error and take the section down.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor, after
-- 0012. One idempotent block; running it twice changes nothing. Re-pasting
-- 0008 narrows the telemetry kinds again (paste this after it), and
-- re-pasting 0012 puts back the every-vote-Swift-Raiders rule (paste this
-- after it too).
--
-- WITHOUT THIS FILE every vote keeps earning Swift Raiders (0012), the game's
-- status door is a 404 it reads as "unknown" (it then waits the whole 12
-- hours after a press), its 'vote' rows are refused (fire and forget), and
-- the dashboard's Traffic section says it needs this file.

do $guard$ begin
  if to_regclass('public.card_votes') is null then
    raise exception '0013_vote_traffic.sql needs 0012_vote_reward.sql applied first';
  end if;
  if to_regprocedure('public.analytics__ok(text)') is null then
    raise exception '0013_vote_traffic.sql needs 0010_dashboard.sql applied first';
  end if;
end $guard$;

-- ===========================================================================
-- 1. TELEMETRY — the vote banner's rows are admitted
-- ===========================================================================
-- the same drop-by-catalogue-lookup as 0008, so it is safe to run again
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.telemetry'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) ilike '%kind%' loop
    execute format('alter table public.telemetry drop constraint %I', r.conname);
  end loop;
end
$$;
alter table public.telemetry add constraint telemetry_kind_check
  check (kind in ('run_start', 'run_end', 'session', 'card_granted', 'card_played', 'vote'));

-- ===========================================================================
-- 2. THE CARD A VOTE EARNS — the first is vote_card(), the rest Stone
-- ===========================================================================
create or replace function public.vote_later_tier()
returns text language sql immutable set search_path = '' as $$ select 'stone'::text $$;
revoke all on function public.vote_later_tier() from public;
revoke all on function public.vote_later_tier() from anon, authenticated;

-- { ok:true, granted:true, card, first } on a grant; otherwise 0012's answers
create or replace function public.vote_reward(p_ref text, p_vote_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid;
  v_ref   text := left(btrim(coalesce(p_ref, '')), 64);
  v_vote  text := btrim(coalesce(p_vote_id, ''));
  v_card  text;
  v_first boolean;
  v_last  timestamptz;
  v_res   text;
begin
  if char_length(v_vote) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'reason', 'bad_vote');
  end if;
  select v.result into v_res from public.card_votes v where v.vote_id = v_vote;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'result', v_res);
  end if;
  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uid := lower(v_ref)::uuid;
  end if;
  if v_uid is null or not exists (select 1 from auth.users u where u.id = v_uid) then
    insert into public.card_votes (vote_id, ref, result)
    values (v_vote, nullif(v_ref, ''), 'unknown_player')
    on conflict (vote_id) do nothing;
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'unknown_player');
  end if;

  -- the deck's own lock, as in 0012: the site's POST and GET queue up here
  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));
  select v.result into v_res from public.card_votes v where v.vote_id = v_vote;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'result', v_res);
  end if;

  select max(v.created_at) into v_last from public.card_votes v
   where v.user_id = v_uid and v.result = 'granted';
  if v_last is not null and v_last > now() - public.vote_gap() then
    insert into public.card_votes (vote_id, ref, user_id, result) values (v_vote, v_ref, v_uid, 'too_soon');
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'too_soon',
      'next_at', floor(extract(epoch from v_last + public.vote_gap()) * 1000)::bigint);
  end if;

  -- the FIRST vote that earns anything earns vote_card(); every later one a
  -- random card of the later tier (a retired card is never dealt)
  v_first := v_last is null;
  if v_first and exists (select 1 from public.card_catalog c where c.card_key = public.vote_card() and c.active) then
    v_card := public.vote_card();
  else
    select c.card_key into v_card from public.card_catalog c
     where c.tier = public.vote_later_tier() and c.active
     order by random() limit 1;
  end if;
  if v_card is null then
    insert into public.card_votes (vote_id, ref, user_id, result) values (v_vote, v_ref, v_uid, 'no_card');
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'no_card');
  end if;

  insert into public.card_votes (vote_id, ref, user_id, card_key, result)
  values (v_vote, v_ref, v_uid, v_card, 'granted');
  insert into public.card_collection (user_id, card_key, qty) values (v_uid, v_card, 1)
  on conflict (user_id, card_key) do update
    set qty = least(public.card_collection.qty + 1, 999), updated_at = now();
  return jsonb_build_object('ok', true, 'granted', true, 'card', v_card, 'first', v_first);
end;
$$;
revoke all on function public.vote_reward(text, text) from public;
revoke all on function public.vote_reward(text, text) from anon, authenticated;
grant execute on function public.vote_reward(text, text) to service_role;

-- ===========================================================================
-- 3. vote_status — the player's door: what the next vote earns, and when
-- ===========================================================================
-- { ok:true, granted, last_at, first_card, later_tier } — granted: how many
-- of this player's votes earned a card; last_at: the last vote the site
-- counted for them (granted or too soon), in epoch ms, or null
create or replace function public.vote_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_n    integer;
  v_last timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select count(*) filter (where v.result = 'granted'),
         max(v.created_at) filter (where v.result in ('granted', 'too_soon'))
    into v_n, v_last
    from public.card_votes v where v.user_id = v_uid;
  return jsonb_build_object('ok', true, 'granted', coalesce(v_n, 0),
    'last_at', case when v_last is null then null else floor(extract(epoch from v_last) * 1000)::bigint end,
    'first_card', public.vote_card(), 'later_tier', public.vote_later_tier());
end;
$$;
revoke all on function public.vote_status() from public;
revoke all on function public.vote_status() from anon, authenticated;
grant execute on function public.vote_status() to authenticated;

-- ===========================================================================
-- 4. analytics_traffic — the dashboard's Traffic section
-- ===========================================================================
-- Every number over the period [p_from, p_to) (p_from null: the last 30
-- days), the devices the dashboard leaves out left out unless p_everyone.
--   sources  one row per site: visits (session rows whose props.src is that
--            site), and by the site each device FIRST came from (props.src1,
--            kept on the device): new players (first seen in the period),
--            players who started a game, and games started. A row from
--            before build 134 carries no source and reads 'unknown'.
--   vote     the banner's funnel: devices and times at each step (seen,
--            open, go), and per place it was offered (title, reward)
--   votes    what the site reported (card_votes): counted votes, cards
--            granted (the first-vote card and the rest), too soon, and
--            votes whose player could not be named
--   daily    per day in the operator's time zone (p_tz), at most the last
--            60: visits, visits from p_src, new players from p_src, Vote
--            presses, votes counted, cards granted
drop function if exists public.analytics_traffic(text, timestamptz, timestamptz, boolean, text, text);
create function public.analytics_traffic(
  p_token text, p_from timestamptz default null, p_to timestamptz default null,
  p_everyone boolean default false, p_tz text default 'UTC', p_src text default 'vibetoplist.com')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz   text := 'UTC';
  v_end  timestamptz := least(coalesce(p_to, now()), now());
  v_from timestamptz;
  v_d0   date;
  v_d1   date;
  v_out  jsonb;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    v_tz := p_tz;
  end if;
  v_from := coalesce(p_from, v_end - interval '30 days');
  if v_from > v_end then v_from := v_end; end if;
  v_d1 := ((v_end - interval '1 microsecond') at time zone v_tz)::date;
  v_d0 := greatest((v_from at time zone v_tz)::date, v_d1 - 59);

  with hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  -- a source as the client wrote it: a host name or 'direct'/'earlier'; anything else is 'other'
  every_row as (
    select t.user_id, t.kind, t.created_at, t.props,
           case when t.props ? 'src' then
                  case when (t.props->>'src') ~ '^[a-z0-9.-]{1,64}$' then t.props->>'src' else 'other' end end as src,
           case when t.props ? 'src1' then
                  case when (t.props->>'src1') ~ '^[a-z0-9.-]{1,64}$' then t.props->>'src1' else 'other' end end as src1
    from public.telemetry t
    where t.created_at <= now()
      and not exists (select 1 from hid where hid.user_id = t.user_id)
  ),
  -- each device: when it was first seen at all, and the site it first came from
  dev as (
    select r.user_id, min(r.created_at) as first_at,
           (array_agg(r.src1 order by r.created_at desc) filter (where r.src1 is not null))[1] as src1
    from every_row r group by r.user_id
  ),
  win as (select r.* from every_row r where r.created_at >= v_from and r.created_at < v_end),
  visits as (
    select coalesce(w.src, 'unknown') as src, count(*) as visits, count(distinct w.user_id) as devices
    from win w where w.kind = 'session' group by 1
  ),
  bydev as (
    select coalesce(d.src1, 'unknown') as src,
           count(*) filter (where d.first_at >= v_from and d.first_at < v_end) as new_players,
           count(*) filter (where exists (select 1 from win w where w.user_id = d.user_id and w.kind = 'run_start')) as players
    from dev d group by 1
  ),
  games as (
    select coalesce(d.src1, 'unknown') as src, count(*) as games
    from win w join dev d on d.user_id = w.user_id
    where w.kind = 'run_start' group by 1
  ),
  srcs as (
    select s.src from visits s union select b.src from bydev b where b.new_players > 0 or b.players > 0 union select g.src from games g
  ),
  sources as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'src', s.src, 'visits', coalesce(v.visits, 0), 'devices', coalesce(v.devices, 0),
             'new_players', coalesce(b.new_players, 0), 'players', coalesce(b.players, 0), 'games', coalesce(g.games, 0))
           order by coalesce(v.visits, 0) + coalesce(g.games, 0) desc, s.src), '[]'::jsonb) as j
    from srcs s left join visits v on v.src = s.src left join bydev b on b.src = s.src left join games g on g.src = s.src
  ),
  -- the banner's funnel: a step and a place are only ever words from the game
  vrows as (
    select w.user_id, w.created_at,
           case when (w.props->>'step') in ('seen', 'open', 'go') then w.props->>'step' else 'other' end as step,
           case when (w.props->>'where') in ('title', 'reward') then w.props->>'where' else 'other' end as place
    from win w where w.kind = 'vote'
  ),
  vote as (
    select jsonb_build_object(
      'seen', jsonb_build_object('devices', count(distinct v.user_id) filter (where v.step = 'seen'), 'times', count(*) filter (where v.step = 'seen')),
      'open', jsonb_build_object('devices', count(distinct v.user_id) filter (where v.step = 'open'), 'times', count(*) filter (where v.step = 'open')),
      'go',   jsonb_build_object('devices', count(distinct v.user_id) filter (where v.step = 'go'),   'times', count(*) filter (where v.step = 'go')),
      'by_place', coalesce((select jsonb_agg(jsonb_build_object('where', p.place,
                    'seen', p.seen, 'open', p.opened, 'go', p.went) order by p.place)
                  from (select x.place, count(distinct x.user_id) filter (where x.step = 'seen') as seen,
                               count(distinct x.user_id) filter (where x.step = 'open') as opened,
                               count(distinct x.user_id) filter (where x.step = 'go') as went
                        from vrows x group by x.place) p), '[]'::jsonb)) as j
    from vrows v
  ),
  cv as (
    select c.* from public.card_votes c
    where c.created_at >= v_from and c.created_at < v_end
      and (c.user_id is null or not exists (select 1 from hid where hid.user_id = c.user_id))
  ),
  votes as (
    select jsonb_build_object(
      'counted', count(*) filter (where c.result in ('granted', 'too_soon')),
      'voters', count(distinct c.user_id) filter (where c.result in ('granted', 'too_soon')),
      'granted', count(*) filter (where c.result = 'granted'),
      'first_cards', count(*) filter (where c.result = 'granted' and c.card_key = public.vote_card()),
      'later_cards', count(*) filter (where c.result = 'granted' and c.card_key is distinct from public.vote_card()),
      'too_soon', count(*) filter (where c.result = 'too_soon'),
      'unknown', count(*) filter (where c.result = 'unknown_player')) as j
    from cv c
  ),
  days as (
    select d::date as day,
           (d::date::timestamp at time zone v_tz) as ds,
           ((d::date + 1)::timestamp at time zone v_tz) as de
    from generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day') d
    where v_d0 <= v_d1
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', to_char(dd.day, 'YYYY-MM-DD'),
      'visits', (select count(*) from win w where w.kind = 'session' and w.created_at >= dd.ds and w.created_at < dd.de),
      'from_src', (select count(*) from win w where w.kind = 'session' and w.src = p_src and w.created_at >= dd.ds and w.created_at < dd.de),
      'new_from_src', (select count(*) from dev d where d.src1 = p_src and d.first_at >= greatest(dd.ds, v_from) and d.first_at < least(dd.de, v_end)),
      'presses', (select count(*) from vrows v where v.step = 'go' and v.created_at >= dd.ds and v.created_at < dd.de),
      'votes', (select count(*) from cv c where c.result in ('granted', 'too_soon') and c.created_at >= dd.ds and c.created_at < dd.de),
      'cards', (select count(*) from cv c where c.result = 'granted' and c.created_at >= dd.ds and c.created_at < dd.de))
      order by dd.day), '[]'::jsonb) as j
    from days dd
  )
  select jsonb_build_object('ok', true, 'src', p_src, 'tz', v_tz,
           'from', v_from, 'to', v_end,
           'sources', (select j from sources), 'vote', (select j from vote),
           'votes', (select j from votes), 'daily', (select j from daily))
    into v_out;
  return v_out;
end;
$$;
revoke all on function public.analytics_traffic(text, timestamptz, timestamptz, boolean, text, text) from public;
grant execute on function public.analytics_traffic(text, timestamptz, timestamptz, boolean, text, text) to anon, authenticated;
