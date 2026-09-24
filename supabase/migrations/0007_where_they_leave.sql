-- 0007 — WHERE THEY LEAVE: the closed tab becomes an ending
--
-- WHY. 22 of the last 24 runs never logged a run_end: closing the tab fires
-- no ending, so the early funnel ("quit before day 5", "under 2 minutes")
-- read ZERO while most players had in fact left somewhere unknown. The game
-- now sends a PROVISIONAL run_end when the tab goes away on a live run
-- (G.noteLeaving → Backend.logLeaving): outcome 'abandoned', cause
-- 'closed_tab', props.provisional = true, with the same numbers a real ending
-- carries. The table needs NO change — kind 'run_end' and outcome
-- 'abandoned' were already allowed and cause is free text.
--
-- WHAT. analytics_summary keeps ONE ending per run:
--   * a real ending (win / loss / struck_banner / …) always beats a
--     closed_tab row for the same run_id — the player came back and finished,
--     in the same tab or by continuing the save (S.runId rides in the save);
--   * of several closed_tab rows for one run (a phone player hides the tab on
--     day 3, comes back, leaves for good on day 40) only the latest is kept.
-- Every existing column reads through that deduped `ends`, so the early
-- funnel now sees the quitters. runs_abandoned counts every run that walked
-- away (closed the tab, struck the banner, or left no signal at all), with
-- the three split out beside it; abandon_pct follows. And a new
-- 'where_they_leave' section buckets the walk-aways by day reached and by
-- minutes played, split by difficulty and device, closed_tab and
-- struck_banner side by side.
--
-- WITHOUT THIS MIGRATION the game still sends the rows, and the OLD function
-- counts every closed_tab row as a separate ending — a player who hid the tab
-- and came back to win would read as two endings. Apply it.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor. The
-- signature is UNCHANGED from 0006, so CREATE OR REPLACE replaces it in place
-- (no overload); the grant is re-issued after revoking from PUBLIC, per the
-- standing rule.

create or replace function public.analytics_summary(
  p_token    text,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_mode     text default null,
  p_landform text default null,
  p_device   text default null,
  p_version  text default null,
  p_min_seconds integer default 0,
  p_min_day     integer default 0
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
  -- ONE ENDING PER RUN (0007). A closed_tab row is PROVISIONAL: the tab went
  -- away on a live run. If the same run_id ever ends for real — the player
  -- came back, or continued the save — the real ending wins, checked against
  -- the WHOLE table so a return after p_to still supersedes it. Of several
  -- closed_tab rows for one run (hidden on day 3, back, hidden on day 40)
  -- only the LATEST is kept: it is where they really left.
  real_ends as (select * from filtered where kind = 'run_end'
                  and coalesce(cause, '') <> 'closed_tab'),
  last_left as (
    select distinct on (l.run_id) l.* from filtered l
    where l.kind = 'run_end' and l.cause = 'closed_tab' and l.run_id is not null
      and not exists (select 1 from public.telemetry r
                      where r.kind = 'run_end' and r.run_id = l.run_id
                        and coalesce(r.cause, '') <> 'closed_tab')
    order by l.run_id, l.created_at desc, l.id desc
  ),
  -- THE RUN FILTERS (analytics.html's "Runs" picker): a run_end that never
  -- lasted p_min_seconds / reached p_min_day is not a game anybody played.
  -- Its run_start then reads as SILENT below, which is what a bounce is.
  -- Applied AFTER the dedupe, so a short closed_tab row can never outlive
  -- the real ending that superseded it.
  ends   as (select * from (select * from real_ends union all select * from last_left) u
             where coalesce(u.seconds, 0) >= coalesce(p_min_seconds, 0)
               and coalesce(u.day, 0)     >= coalesce(p_min_day, 0)),
  sess   as (select * from filtered where kind = 'session'),
  abandoned as (
    select s.* from starts s
    where s.run_id is not null
      and not exists (select 1 from ends e where e.run_id = s.run_id)
  ),
  per_player as (
    select user_id, count(*) as runs from starts group by user_id
  ),
  fb as (
    select * from public.competition_feedback f
    where (p_from is null or f.created_at >= p_from)
      and (p_to   is null or f.created_at <  p_to)
  ),
  ce as (
    select * from public.competition_entries e
    where (p_from is null or e.created_at >= p_from)
      and (p_to   is null or e.created_at <  p_to)
  )
  select jsonb_build_object(
    'generated_at', now(),

    'totals', jsonb_build_object(
      'runs_started',   (select count(*) from starts),
      'runs_finished',  (select count(*) from ends),
      -- every run that walked away: closed the tab, struck the banner, or
      -- left no signal at all (a blocked send, or a run from before 0007)
      'runs_abandoned', (select count(*) from abandoned)
                        + (select count(*) from ends where outcome = 'abandoned'),
      'runs_closed_tab',     (select count(*) from ends where cause = 'closed_tab'),
      'runs_struck_banner',  (select count(*) from ends where cause = 'struck_banner'),
      'runs_silent',    (select count(*) from abandoned),
      'wins',           (select count(*) from ends where outcome = 'win'),
      'losses',         (select count(*) from ends where outcome = 'loss'),
      'players',        (select count(distinct user_id) from filtered),
      'sessions',       (select count(*) from sess),
      'events',         (select count(*) from filtered),
      'first_event',    (select min(created_at) from filtered),
      'last_event',     (select max(created_at) from filtered)
    ),

    'rates', jsonb_build_object(
      'win_pct',      (select round(100.0 * count(*) filter (where outcome = 'win')
                              / nullif(count(*), 0), 1) from ends),
      'loss_pct',     (select round(100.0 * count(*) filter (where outcome = 'loss')
                              / nullif(count(*), 0), 1) from ends),
      'abandon_pct',  (select round(100.0 * ((select count(*) from abandoned)
                                + (select count(*) from starts s where exists
                                    (select 1 from ends e where e.run_id = s.run_id and e.outcome = 'abandoned')))
                              / nullif((select count(*) from starts), 0), 1)),
      'repeat_pct',   (select round(100.0 * count(*) filter (where runs > 1)
                              / nullif(count(*), 0), 1) from per_player)
    ),

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

    'time_on_site', jsonb_build_object(
      'total_hours',   (select round((sum(seconds) / 3600.0)::numeric, 1) from sess),
      'median_minutes',(select round((percentile_cont(0.5) within group (order by seconds) / 60.0)::numeric, 1) from sess),
      'p90_minutes',   (select round((percentile_cont(0.9) within group (order by seconds) / 60.0)::numeric, 1) from sess)
    ),

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

    'day_buckets', (
      select coalesce(jsonb_agg(x order by (x->>'lo')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'lo', b.lo, 'label', b.label,
          'n', count(e.id),
          'win_pct', round(100.0 * count(e.id) filter (where e.outcome = 'win')
                     / nullif(count(e.id), 0), 1)
        ) as x
        from (values (0,'day 0-9'), (10,'day 10-24'), (25,'day 25-49'), (50,'day 50-99'),
                     (100,'day 100-199'), (200,'day 200-399'), (400,'day 400+')) as b(lo, label)
        left join ends e on e.day >= b.lo and (b.lo = 400 or e.day < case b.lo
          when 0 then 10 when 10 then 25 when 25 then 50 when 50 then 100
          when 100 then 200 when 200 then 400 end)
        group by b.lo, b.label
      ) q
    ),

    -- the evidence behind the competition's score gate: where finished runs
    -- actually land, wins and losses apart
    'score_bands', (
      select coalesce(jsonb_agg(x order by (x->>'lo')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'lo', b.lo, 'label', b.label,
          'wins',   count(e.id) filter (where e.outcome = 'win'),
          'losses', count(e.id) filter (where e.outcome = 'loss'),
          'n', count(e.id)
        ) as x
        from (values (0,'0-499'), (500,'500-1,999'), (2000,'2,000-4,999'),
                     (5000,'5,000-9,999'), (10000,'10,000+')) as b(lo, label)
        left join ends e on e.score >= b.lo and (b.lo = 10000 or e.score < case b.lo
          when 0 then 500 when 500 then 2000 when 2000 then 5000 when 5000 then 10000 end)
        group by b.lo, b.label
      ) q
    ),

    -- ---- every cause, spread over the SAME day buckets ------------------
    -- An average hides a shape: "tc_destroyed averages day 19.9" while the
    -- day 10-24 bucket stands empty is either a bug in the buckets or two
    -- populations (razed in the first raid, razed in the long war). This
    -- table answers which, one row per ending, without leaving the page.
    'endings_by_bucket', (
      select coalesce(jsonb_agg(x order by (x->>'n')::int desc, x->>'cause'), '[]'::jsonb) from (
        select jsonb_build_object(
          'outcome', coalesce(e.outcome, 'unknown'),
          'cause',   coalesce(e.cause, 'unknown'),
          'n',       count(*),
          'd0_9',    count(*) filter (where e.day < 10),
          'd10_24',  count(*) filter (where e.day >= 10  and e.day < 25),
          'd25_49',  count(*) filter (where e.day >= 25  and e.day < 50),
          'd50_99',  count(*) filter (where e.day >= 50  and e.day < 100),
          'd100_199',count(*) filter (where e.day >= 100 and e.day < 200),
          'd200_399',count(*) filter (where e.day >= 200 and e.day < 400),
          'd400p',   count(*) filter (where e.day >= 400),
          'min_day', min(e.day), 'max_day', max(e.day),
          'median_day', round((percentile_cont(0.5) within group (order by e.day))::numeric, 1)
        ) as x
        from ends e group by e.outcome, e.cause
      ) q
    ),

    -- ---- WHERE THEY LEAVE (0007) ----------------------------------------
    -- Every run that walked away, closed_tab and struck_banner side by side,
    -- bucketed by the day it reached and by the minutes it lasted, split by
    -- difficulty and device. The 'all' rows (grouping sets) are each cause's
    -- total, so the split never has to be added up by eye.
    'where_they_leave', jsonb_build_object(
      'by_day', (
        select coalesce(jsonb_agg(x order by x->>'cause', x->>'mode', x->>'device'), '[]'::jsonb) from (
          select jsonb_build_object(
            'cause',  coalesce(e.cause, 'unknown'),
            'mode',   case when grouping(e.mode) = 1 then 'all' else coalesce(e.mode, 'unknown') end,
            'device', case when grouping(e.device) = 1 then 'all' else coalesce(e.device, 'unknown') end,
            'n',       count(*),
            'd0_4',    count(*) filter (where coalesce(e.day, 0) < 5),
            'd5_9',    count(*) filter (where e.day >= 5   and e.day < 10),
            'd10_24',  count(*) filter (where e.day >= 10  and e.day < 25),
            'd25_49',  count(*) filter (where e.day >= 25  and e.day < 50),
            'd50_99',  count(*) filter (where e.day >= 50  and e.day < 100),
            'd100p',   count(*) filter (where e.day >= 100),
            'median_day', round((percentile_cont(0.5) within group (order by e.day))::numeric, 1)
          ) as x
          from ends e where e.outcome = 'abandoned'
          group by grouping sets ((e.cause, e.mode, e.device), (e.cause))
        ) q
      ),
      'by_minutes', (
        select coalesce(jsonb_agg(x order by x->>'cause', x->>'mode', x->>'device'), '[]'::jsonb) from (
          select jsonb_build_object(
            'cause',  coalesce(e.cause, 'unknown'),
            'mode',   case when grouping(e.mode) = 1 then 'all' else coalesce(e.mode, 'unknown') end,
            'device', case when grouping(e.device) = 1 then 'all' else coalesce(e.device, 'unknown') end,
            'n',       count(*),
            'm0_2',    count(*) filter (where coalesce(e.seconds, 0) < 120),
            'm2_5',    count(*) filter (where e.seconds >= 120  and e.seconds < 300),
            'm5_10',   count(*) filter (where e.seconds >= 300  and e.seconds < 600),
            'm10_20',  count(*) filter (where e.seconds >= 600  and e.seconds < 1200),
            'm20_45',  count(*) filter (where e.seconds >= 1200 and e.seconds < 2700),
            'm45p',    count(*) filter (where e.seconds >= 2700),
            'median_minutes', round((percentile_cont(0.5) within group (order by e.seconds) / 60.0)::numeric, 1)
          ) as x
          from ends e where e.outcome = 'abandoned'
          group by grouping sets ((e.cause, e.mode, e.device), (e.cause))
        ) q
      )
    ),

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

    -- the card is pulled out FIRST, into its own derived table, so the
    -- win-rate subquery correlates on a plain column (the 0003 lesson:
    -- grouping by props->>'card' and then reaching for s.props is the
    -- "subquery uses ungrouped column" error)
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

    'daily', (
      select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) from (
        select jsonb_build_object(
          'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'starts', count(*) filter (where kind = 'run_start'),
          'finishes', count(*) filter (where kind = 'run_end'),
          'players', count(distinct user_id)
        ) as x
        -- read through the SAME run-filtered CTEs as every other column, or
        -- a day's "finished" could exceed the page's own total
        from (select created_at, kind, user_id from starts
              union all select created_at, kind, user_id from ends
              union all select created_at, kind, user_id from sess) u
        where created_at > now() - interval '30 days'
        group by date_trunc('day', created_at)
      ) q
    ),

    -- the prize draw, read the only way it can be: entry COUNTS and
    -- email-free feedback. No entry row, no email, ever.
    'competition', jsonb_build_object(
      'entries_total',  (select count(*) from ce),
      'emails',         (select count(distinct email) from ce),
      'entry_wins',     (select count(*) from ce where win),
      'entry_losses',   (select count(*) from ce where win = false),
      'feedback_total', (select count(*) from fb),
      'repeat_feedback',(select count(*) from fb where not counted),
      'avg_rating',     (select round(avg(rating)::numeric, 2) from fb),
      'rating_hist', (
        select coalesce(jsonb_agg(x order by (x->>'rating')::int), '[]'::jsonb) from (
          select jsonb_build_object('rating', r,
            'n', (select count(*) from fb f where f.rating = r)) as x
          from generate_series(1, 5) r
        ) q
      ),
      'choices', (
        select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]'::jsonb) from (
          select jsonb_build_object(
            'choice', improvement_choice,
            'n', count(*),
            'wins',   count(*) filter (where win),
            'losses', count(*) filter (where win = false),
            'avg_rating', round(avg(rating)::numeric, 2)
          ) as x
          from fb group by improvement_choice
        ) q
      ),
      'rating_by_outcome', jsonb_build_object(
        'win_avg',  (select round(avg(rating)::numeric, 2) from fb where win),
        'win_n',    (select count(*) from fb where win),
        'loss_avg', (select round(avg(rating)::numeric, 2) from fb where win = false),
        'loss_n',   (select count(*) from fb where win = false)
      ),
      -- ITEM 2: bands re-cut around the 500 gate so the LOSS population is
      -- resolvable instead of collapsing into one bucket. The "under 500"
      -- band is not dead weight: the score gate scales with difficulty
      -- (js/competition.js — same effort on every mode), so a qualifying
      -- calm entry can carry a final total as low as 250.
      'rating_by_band', (
        select coalesce(jsonb_agg(x order by (x->>'lo')::int), '[]'::jsonb) from (
          select jsonb_build_object(
            'lo', b.lo, 'label', b.label,
            'n', count(f.id),
            'wins', count(f.id) filter (where f.win),
            'losses', count(f.id) filter (where f.win = false),
            'avg_rating', round(avg(f.rating)::numeric, 2)
          ) as x
          from (values (0,'under 500'), (500,'500-1,499'), (1500,'1,500-4,999'),
                       (5000,'5,000-14,999'), (15000,'15,000+')) as b(lo, label)
          left join fb f on f.score >= b.lo and (b.lo = 15000 or f.score < case b.lo
            when 0 then 500 when 500 then 1500 when 1500 then 5000 when 5000 then 15000 end)
          group by b.lo, b.label
        ) q
      ),
      'entries_by_day', (
        select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) from (
          select jsonb_build_object(
            'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
            'entries', count(*)
          ) as x
          from ce
          where created_at > now() - interval '30 days'
          group by date_trunc('day', created_at)
        ) q
      ),
      'free_texts', (
        select coalesce(jsonb_agg(x order by x->>'when' desc), '[]'::jsonb) from (
          select jsonb_build_object(
            'when', to_char(created_at, 'YYYY-MM-DD HH24:MI'),
            'rating', rating, 'choice', improvement_choice,
            'text', free_text, 'win', win, 'score', score, 'counted', counted
          ) as x
          from fb
          where free_text is not null
          order by created_at desc
          limit 100
        ) q
      )
    ),

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

revoke all on function public.analytics_summary(text, timestamptz, timestamptz, text, text, text, text, integer, integer) from public;
grant execute on function public.analytics_summary(text, timestamptz, timestamptz, text, text, text, text, integer, integer)
  to anon, authenticated;
