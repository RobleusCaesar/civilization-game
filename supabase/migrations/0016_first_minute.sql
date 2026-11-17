-- 0016 — THE FIRST MINUTE (build 177; tests/analytics.mjs §1e and §6c).
--
-- Why: half of all games ended before a minute of play and nothing said
-- where. The game now writes one 'step' row the first time a page load
-- reaches each moment of its first minute (Backend.step in js/backend.js):
--   load, splash, title, newgame, origin, picked, playable,
--   map_tap, villager, building, play30, play60, hide
-- each with props { step, ms (since the page began to load), visit (a random
-- id per page load), first (the device held nothing of the game's before),
-- form ('phone' | 'tablet' | 'desktop'), standalone, build } and, on 'hide',
-- `last`: the last step the page reached before it was hidden or closed.
--
-- What this paste does:
--   1. lets the telemetry table take kind 'step' (the kinds 0013 allowed, plus
--      'step' — re-pasting 0008, 0012 or 0013 narrows it again: paste this after)
--   2. analytics_first_minute(p_token, p_from, p_to, p_everyone) — the
--      dashboard's First minute section, behind the passphrase like every
--      0010+ door, leaving out the operator's devices (analytics__hidden())
--      unless p_everyone.
--
-- One idempotent paste, after 0015.

-- ===========================================================================
-- 1. the kind
-- ===========================================================================
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
  check (kind in ('run_start', 'run_end', 'session', 'card_granted', 'card_played', 'vote', 'step'));

create index if not exists telemetry_step_idx on public.telemetry (created_at desc) where kind = 'step';

-- ===========================================================================
-- 2. analytics_first_minute
-- ===========================================================================
-- { ok, base, steps: [ { step, visits, pct, median_ms,
--                        forms: { phone|tablet|desktop|other: { visits, pct, median_ms } },
--                        who:   { first|returning: { visits, pct, median_ms } } } ],
--   bases: { forms: {...}, who: {...} },
--   left:  [ { last, visits } ] }
-- `visits` are page loads that reached the step; `pct` is of the page loads
-- that reached 'load' (of every page load seen, if none did); the median is
-- the milliseconds from the page beginning to load. A step, a form and a
-- last step are only ever words from the game; anything else is 'other'.
drop function if exists public.analytics_first_minute(text, timestamptz, timestamptz, boolean);
create function public.analytics_first_minute(
  p_token text, p_from timestamptz default null, p_to timestamptz default null, p_everyone boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end  timestamptz := least(coalesce(p_to, now()), now());
  v_from timestamptz;
  v_out  jsonb;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  v_from := coalesce(p_from, v_end - interval '30 days');
  if v_from > v_end then v_from := v_end; end if;

  with hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  names as (
    select n.name, n.ord from unnest(array['load', 'splash', 'title', 'newgame', 'origin', 'picked', 'playable',
                                           'map_tap', 'villager', 'building', 'play30', 'play60', 'hide']) with ordinality as n(name, ord)
  ),
  raw as (
    select t.user_id,
           case when (t.props->>'visit') ~ '^[A-Za-z0-9_-]{1,64}$' then t.props->>'visit' end as visit,
           case when (t.props->>'step') in (select n.name from names n) then t.props->>'step' else 'other' end as step,
           case when (t.props->>'ms') ~ '^[0-9]{1,9}$' then (t.props->>'ms')::bigint end as ms,
           case when (t.props->>'form') in ('phone', 'tablet', 'desktop') then t.props->>'form' else 'other' end as form,
           case when (t.props->>'first') = 'true' then 'first' else 'returning' end as who,
           case when (t.props->>'last') in (select n.name from names n) then t.props->>'last'
                when t.props ? 'last' and t.props->>'last' is not null then 'other' else 'none' end as last
    from public.telemetry t
    where t.kind = 'step' and t.created_at >= v_from and t.created_at < v_end and t.created_at <= now()
      and not exists (select 1 from hid where hid.user_id = t.user_id)
  ),
  -- one row per page load and step: its earliest time (a step is sent once,
  -- but a resent or doubled row must never count twice)
  st as (
    select r.visit, r.step, min(r.ms) as ms, min(r.form) as form, min(r.who) as who
    from raw r where r.visit is not null group by r.visit, r.step
  ),
  -- a page load's own form and first/returning: read off any of its rows
  pv as (
    select s.visit, min(s.form) as form, min(s.who) as who, bool_or(s.step = 'load') as loaded
    from st s group by s.visit
  ),
  base as (
    select case when count(*) filter (where p.loaded) > 0 then count(*) filter (where p.loaded) else count(*) end as n,
           bool_or(p.loaded) as any_loaded
    from pv p
  ),
  inbase as (
    select p.* from pv p, base b where p.loaded or not coalesce(b.any_loaded, false)
  ),
  bform as (select i.form, count(*) as n from inbase i group by i.form),
  bwho  as (select i.who,  count(*) as n from inbase i group by i.who),
  per as (
    select n.name, n.ord,
           count(s.visit) as visits,
           percentile_cont(0.5) within group (order by s.ms) filter (where s.ms is not null) as med
    from names n left join st s on s.step = n.name and s.visit in (select i.visit from inbase i)
    group by n.name, n.ord
  ),
  perform as (
    select s.step, p.form, count(*) as visits,
           percentile_cont(0.5) within group (order by s.ms) filter (where s.ms is not null) as med
    from st s join inbase p on p.visit = s.visit group by s.step, p.form
  ),
  perwho as (
    select s.step, p.who, count(*) as visits,
           percentile_cont(0.5) within group (order by s.ms) filter (where s.ms is not null) as med
    from st s join inbase p on p.visit = s.visit group by s.step, p.who
  ),
  lefts as (
    select r.last, count(distinct r.visit) as visits
    from raw r where r.step = 'hide' and r.visit in (select i.visit from inbase i)
    group by r.last
  )
  select jsonb_build_object(
    'ok', true,
    'base', (select b.n from base b),
    'bases', jsonb_build_object(
      'forms', coalesce((select jsonb_object_agg(f.form, f.n) from bform f), '{}'::jsonb),
      'who',   coalesce((select jsonb_object_agg(w.who, w.n) from bwho w), '{}'::jsonb)),
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'step', p.name, 'visits', p.visits,
        'pct', case when (select b.n from base b) > 0 then round(100.0 * p.visits / (select b.n from base b), 1) end,
        'median_ms', case when p.med is not null then round(p.med::numeric) end,
        'forms', coalesce((select jsonb_object_agg(f.form, jsonb_build_object('visits', f.visits,
                    'pct', case when bf.n > 0 then round(100.0 * f.visits / bf.n, 1) end,
                    'median_ms', case when f.med is not null then round(f.med::numeric) end))
                  from perform f join bform bf on bf.form = f.form where f.step = p.name), '{}'::jsonb),
        'who', coalesce((select jsonb_object_agg(w.who, jsonb_build_object('visits', w.visits,
                    'pct', case when bw.n > 0 then round(100.0 * w.visits / bw.n, 1) end,
                    'median_ms', case when w.med is not null then round(w.med::numeric) end))
                  from perwho w join bwho bw on bw.who = w.who where w.step = p.name), '{}'::jsonb))
      order by p.ord) from per p), '[]'::jsonb),
    'left', coalesce((select jsonb_agg(jsonb_build_object('last', l.last, 'visits', l.visits)
                       order by l.visits desc, l.last) from lefts l), '[]'::jsonb))
  into v_out;
  return v_out;
end
$$;
revoke all on function public.analytics_first_minute(text, timestamptz, timestamptz, boolean) from public;
grant execute on function public.analytics_first_minute(text, timestamptz, timestamptz, boolean) to anon, authenticated;
