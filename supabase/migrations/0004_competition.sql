-- Clanfire 0004 — the prize-draw competition: entries, feedback, and the
-- dashboard read path. Apply via the Supabase SQL editor, after 0003.
--
-- THE SHAPE OF THE THING (operator spec, E1-E8):
--   · Two tables, deliberately split: competition_entries carries the email
--     list and NOTHING else leaves it — no client can read it by any path,
--     dashboard included. competition_feedback carries the ratings and the
--     words, HAS NO EMAIL COLUMN, and is what the dashboard reads.
--   · Up to 5 entries per email, one per DISTINCT completed game — enforced
--     here, server-side, inside one SECURITY DEFINER function that is the
--     only write path (anon has no direct table privilege at all, which is
--     stricter than "insert-only"). Over the cap, or the same finished game
--     twice: the player still hears success, no row is created, and nothing
--     ever reveals entry counts or whether an email exists.
--   · Reads come only through analytics_summary (token-gated, replaced below
--     with a competition section) — aggregates and email-free feedback rows,
--     never an entry row, never an email.
--
-- Re-running this file is safe: create-if-not-exists / create-or-replace
-- throughout, and it deletes nothing.

-- ---------------------------------------------------------------------------
-- 1. THE EMAIL LIST — sealed
-- ---------------------------------------------------------------------------
create table if not exists public.competition_entries (
  id              bigint generated always as identity primary key,
  email           text not null check (char_length(email) between 3 and 254),
  game_session_id text not null check (char_length(game_session_id) between 1 and 64),
  win             boolean,
  score           integer check (score is null or (score >= 0 and score <= 1000000)),
  seconds         integer check (seconds is null or (seconds >= 0 and seconds <= 1000000)),
  size            text,
  landform        text,
  day             integer check (day is null or (day >= 0 and day <= 100000)),
  created_at      timestamptz not null default now(),
  -- one entry per (email, finished game): submitting the same game twice
  -- can never create a second row, whatever the client does
  unique (email, game_session_id)
);

-- RLS on with NO policies, and every direct privilege revoked: there is no
-- client path to this table at all — not insert, not select. The function in
-- section 3 is the only door, and the dashboard function never touches it
-- except to COUNT.
alter table public.competition_entries enable row level security;
revoke all on table public.competition_entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE FEEDBACK — email-free by construction
-- ---------------------------------------------------------------------------
-- entry_id ties a rating to its entry when one was created; a repeat past the
-- cap (counted = false) still records its feedback — a returning player's
-- rating moving between entries is exactly the signal wanted. No email column
-- exists here, so no join from this table can ever reach the list.
create table if not exists public.competition_feedback (
  id                 bigint generated always as identity primary key,
  entry_id           bigint references public.competition_entries (id) on delete set null,
  counted            boolean not null default false,
  rating             smallint not null check (rating between 1 and 5),
  improvement_choice text not null check (improvement_choice in
                       ('too_hard', 'too_slow', 'confusing', 'not_enough_to_do',
                        'more_content', 'visuals', 'good')),
  free_text          text check (free_text is null or char_length(free_text) <= 500),
  win                boolean,
  score              integer check (score is null or (score >= 0 and score <= 1000000)),
  seconds            integer check (seconds is null or (seconds >= 0 and seconds <= 1000000)),
  size               text,
  landform           text,
  day                integer check (day is null or (day >= 0 and day <= 100000)),
  created_at         timestamptz not null default now()
);
alter table public.competition_feedback enable row level security;
revoke all on table public.competition_feedback from anon, authenticated;

create index if not exists competition_feedback_created_idx
  on public.competition_feedback (created_at desc);

-- ---------------------------------------------------------------------------
-- 3. THE ONE WRITE PATH
-- ---------------------------------------------------------------------------
-- Validates, normalizes, enforces the cap and the one-per-game rule, stores
-- the feedback ALWAYS, and answers the same {ok:true} whether or not an entry
-- row was created — a caller can never learn counts or membership from it.
-- The advisory lock serializes same-email submissions so two racing tabs
-- cannot land a sixth entry between count and insert.
create or replace function public.enter_competition(
  p_email    text,
  p_session  text,
  p_rating   integer,
  p_choice   text,
  p_text     text default null,
  p_win      boolean default null,
  p_score    integer default null,
  p_seconds  integer default null,
  p_size     text default null,
  p_landform text default null,
  p_day      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_entry bigint;
  v_n     integer;
  v_score integer; v_secs integer; v_day integer;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  -- shape checks only — the game validates before sending, so a failure here
  -- is a hand-rolled request, and 'bad_input' reveals nothing about the data
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_email) > 254
     or p_session is null or char_length(p_session) not between 1 and 64
     or p_rating is null or p_rating not between 1 and 5
     or p_choice is null or p_choice not in
       ('too_hard', 'too_slow', 'confusing', 'not_enough_to_do',
        'more_content', 'visuals', 'good') then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  v_score := least(greatest(coalesce(p_score, 0), 0), 1000000);
  v_secs  := least(greatest(coalesce(p_seconds, 0), 0), 1000000);
  v_day   := least(greatest(coalesce(p_day, 0), 0), 100000);

  perform pg_advisory_xact_lock(hashtext('clanfire-competition:' || v_email));

  select count(*) into v_n from public.competition_entries where email = v_email;
  if v_n < 5 then
    insert into public.competition_entries
      (email, game_session_id, win, score, seconds, size, landform, day)
    values
      (v_email, p_session, p_win, v_score, v_secs,
       left(coalesce(p_size, ''), 16), left(coalesce(p_landform, ''), 32), v_day)
    on conflict (email, game_session_id) do nothing
    returning id into v_entry;                 -- null = this game already entered
  end if;

  insert into public.competition_feedback
    (entry_id, counted, rating, improvement_choice, free_text,
     win, score, seconds, size, landform, day)
  values
    (v_entry, v_entry is not null, p_rating, p_choice,
     nullif(left(coalesce(p_text, ''), 500), ''),
     p_win, v_score, v_secs,
     left(coalesce(p_size, ''), 16), left(coalesce(p_landform, ''), 32), v_day);

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.enter_competition(
  text, text, integer, text, text, boolean, integer, integer, text, text, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE DASHBOARD READ PATH — analytics_summary, replaced whole
-- ---------------------------------------------------------------------------
-- The 0003 function plus: a 'score_bands' section on finished runs (the
-- evidence behind the competition's score gate), and a 'competition' section
-- (entry counts, ratings, improvement choices, win/loss and score-band
-- segments, and the free-text responses — feedback only, never an email,
-- never an entry row). The date filters apply to the competition data; the
-- other filters are telemetry-only.
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
      'runs_abandoned', (select count(*) from abandoned),
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
      'abandon_pct',  (select round(100.0 * (select count(*) from abandoned)
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
        from (values (0,'day 1-10'), (10,'day 11-25'), (25,'day 26-50'), (50,'day 51-100'),
                     (100,'day 101-200'), (200,'day 201-400'), (400,'day 400+')) as b(lo, label)
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
        from filtered
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
      'rating_by_band', (
        select coalesce(jsonb_agg(x order by (x->>'lo')::int), '[]'::jsonb) from (
          select jsonb_build_object(
            'lo', b.lo, 'label', b.label,
            'n', count(f.id),
            'avg_rating', round(avg(f.rating)::numeric, 2)
          ) as x
          from (values (0,'0-1,999'), (2000,'2,000-4,999'),
                       (5000,'5,000-9,999'), (10000,'10,000+')) as b(lo, label)
          left join fb f on f.score >= b.lo and (b.lo = 10000 or f.score < case b.lo
            when 0 then 2000 when 2000 then 5000 when 5000 then 10000 end)
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

grant execute on function public.analytics_summary(text, timestamptz, timestamptz, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. DRAWING A WINNER (for reference — run in the SQL editor when the time
--    comes; the editor is the only place entries are readable)
-- ---------------------------------------------------------------------------
--   select email, count(*) entries, min(created_at) first, max(created_at) last,
--          array_agg(score order by created_at) scores
--   from public.competition_entries group by email order by last;
--   -- eyeball for fraud (see the stored context), then:
--   select email from public.competition_entries order by random() limit 1;
