-- 0018 — THE PROLOGUE (tests/analytics.mjs §1f and §6e, tests/telemetry.mjs §12).
--
-- Why: a brand-new device now plays THREE authored games in order before the
-- full game opens — 'prologue_1' (The First Fire: raise the hall to level 2),
-- 'prologue_2' (The Growing Clan: level 3) and 'prologue_3' (The Two Roads:
-- raze the rival's hall or raise the Wonder). Each WIN pays exactly one card,
-- once per player EVER per game: Bronze, Iron, Imperial. The guide (the
-- Elder) shows one line at a time — a BEAT, named like 'open', 'berries',
-- 'house', 'raise' — and the game reports each beat it shows and each the
-- player completes (Backend.lesson in js/backend.js), with one row of kind
-- 'prologue' each:
--   ev 'start'   a journey game founded and entered    { game }
--   ev 'shown'   a beat first shown                    { game, beat, i }
--   ev 'beat'    a beat completed                      { game, beat, i, shown_ms, done_ms, hints, hand }
--   ev 'finish'  a journey game ended                  { game, outcome, seconds }
--   ev 'skip'    "Skip the journey"                    { from: 'title' | 'game', game }
--   ev 'choice'  the end screen's button               { game, choice: 'journey' | 'random' | 'retry' | 'open' | 'menu' },
--                and the first game's naming               { game: 1, choice: 'named' }
-- each with `visit` (a random id per page load), `first`, `form`,
-- `standalone` and `build`, as the 'step' rows carry (0016). shown_ms and
-- done_ms are ONE clock (the moment the beat was shown, the moment it was
-- done): the dashboard reads only their difference.
--
-- What this paste does:
--   0. the guard: 0008 (the card record) and 0010 (the dashboard's model)
--      must be applied first — it refuses, naming them
--   1. lets the telemetry table take kind 'prologue' (every kind 0016
--      allowed, plus 'prologue' — re-pasting 0008, 0012, 0013 or 0016
--      narrows it again: paste this after any of them)
--   2. lets it take modes 'prologue_1', 'prologue_2', 'prologue_3' (beside
--      0017's 'first_quick' — re-pasting 0017 narrows it again: paste this
--      after it). Without 1 and 2 every journey game's run_start, run_end,
--      card_granted and prologue row is REFUSED, and so is its card.
--      report_run_end (0008) inserts through the same table and its checks,
--      so it takes the new modes with them; submit_score is untouched (a
--      prologue win never posts — the game holds it off the board).
--   3. card_prologue + grant_prologue(p_run_id, p_game, p_card): the
--      journey's card, one per player per game, ever; only of that game's
--      tier (card_prologue_tier()); only for a run whose REAL ending this
--      player sent says it was WON in that game's mode.
--   4. analytics_prologue(p_token, p_from, p_to, p_everyone): the dashboard's
--      Prologue section — each game started, won and how fast; the journey
--      1 → 2 → 3, player by player; each beat shown and done, how long it
--      took and how often the Elder had to help; the skips; the end screen's
--      choices; and played-again-within-a-week for players whose first game
--      was the journey against everyone else's first game.
--
-- SEALED like 0010 and 0017: the new table has RLS on, no policy and every
-- privilege revoked from anon and authenticated BY NAME (Supabase grants new
-- objects to both by name, which `revoke … from public` never touches); every
-- function is security definer on an empty search_path; grant_prologue is the
-- signed-in player's door alone, the tier function nobody's, and
-- analytics_prologue answers only the 0003 passphrase. grant_card (0008 /
-- 0011) is not made again here: 0011 stays the last file to make it.
--
-- One idempotent paste, after 0017. PASTE IT BEFORE THE PROLOGUE GOES LIVE.

do $guard$ begin
  if to_regclass('public.card_catalog') is null or to_regclass('public.card_collection') is null
     or to_regprocedure('public.card_refuse(uuid, text, text, text, jsonb)') is null then
    raise exception '0018_prologue.sql needs 0008_cards.sql applied first';
  end if;
  if to_regprocedure('public.analytics__ok(text)') is null
     or to_regprocedure('public.analytics__hidden()') is null
     or to_regprocedure('public.analytics__games(timestamptz, timestamptz, text, text, boolean, timestamptz)') is null then
    raise exception '0018_prologue.sql needs 0010_dashboard.sql applied first';
  end if;
end $guard$;

-- ===========================================================================
-- 1. the kind
-- ===========================================================================
-- 0016's drop-by-catalogue-lookup: every check on the table that names
-- `kind` goes, then the one rule is made again
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
  check (kind in ('run_start', 'run_end', 'session', 'card_granted', 'card_played', 'vote', 'step', 'prologue'));

create index if not exists telemetry_prologue_idx on public.telemetry (created_at desc) where kind = 'prologue';

-- ===========================================================================
-- 2. the modes
-- ===========================================================================
-- 0017's: every check that names `mode` (and not `kind`) goes, then the one
-- rule is made again
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
  check (mode is null or mode in ('calm', 'moderate', 'hard', 'first_quick', 'prologue_1', 'prologue_2', 'prologue_3'));

-- ===========================================================================
-- 3. the journey's card
-- ===========================================================================
-- the tier each game's win pays (CFG.PROLOGUE.CARD in js/config.js — the two
-- must agree, or the game's card is refused and the next reconcile takes it
-- back off the device). Internal: only grant_prologue asks it.
create or replace function public.card_prologue_tier(p_game integer)
returns text language sql immutable set search_path = '' as $$
  select case p_game when 1 then 'bronze' when 2 then 'iron' when 3 then 'imperial' end
$$;
revoke all on function public.card_prologue_tier(integer) from public;
revoke all on function public.card_prologue_tier(integer) from anon, authenticated;

-- one row per player and game: the card that game's win paid, and the run
create table if not exists public.card_prologue (
  user_id    uuid not null references auth.users (id) on delete cascade,
  game       smallint not null check (game between 1 and 3),
  run_id     text not null check (char_length(run_id) between 1 and 64),
  card_key   text not null references public.card_catalog (card_key),
  tier       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.card_prologue enable row level security;
revoke all on table public.card_prologue from public;
revoke all on table public.card_prologue from anon, authenticated;

-- In order, as grant_milestone (0017): who (auth.uid()), what (the shape),
-- NEVER TWICE (the same run asking again is a duplicate — a lost answer is
-- safe to retry — and another run for a game already paid is refused for
-- good), THE EVIDENCE (a REAL ending this player sent for this run, won, in
-- this game's own mode — missing is 'no_run', which the game reads as "not
-- yet": its run_end may still be on the way), THE CARD (a live card of the
-- game's tier), and only then the ledger row and the collection.
drop function if exists public.grant_prologue(text, integer, text);
create function public.grant_prologue(p_run_id text, p_game integer, p_card text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_prev record;
  v_tier text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_run_id is null or char_length(p_run_id) not between 1 and 64
     or p_game is null or p_game not between 1 and 3
     or p_card is null or char_length(p_card) not between 1 and 64 then
    return public.card_refuse(v_uid, 'prologue', 'bad_input', p_run_id, jsonb_build_object('game', p_game, 'card', p_card));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- NEVER TWICE: one card a game, a player, ever
  select p.run_id, p.card_key into v_prev from public.card_prologue p where p.user_id = v_uid and p.game = p_game;
  if found then
    if v_prev.run_id = p_run_id then
      return jsonb_build_object('ok', true, 'already', true, 'card', v_prev.card_key);
    end if;
    return public.card_refuse(v_uid, 'prologue', 'already_had', p_run_id, jsonb_build_object('game', p_game, 'card', p_card));
  end if;

  -- THE EVIDENCE: this run's own real ending, won, in this game's mode (a
  -- closed tab is provisional and never a win)
  if not exists (select 1 from public.telemetry t
                  where t.user_id = v_uid and t.run_id = p_run_id and t.kind = 'run_end'
                    and t.outcome = 'win' and coalesce(t.cause, '') <> 'closed_tab'
                    and t.mode = 'prologue_' || p_game) then
    return jsonb_build_object('ok', false, 'reason', 'no_run');
  end if;

  select c.tier into v_tier from public.card_catalog c where c.card_key = p_card and c.active;
  if v_tier is null or v_tier <> public.card_prologue_tier(p_game) then
    return public.card_refuse(v_uid, 'prologue', 'bad_card', p_run_id,
      jsonb_build_object('game', p_game, 'card', p_card, 'tier', v_tier));
  end if;

  insert into public.card_prologue (user_id, game, run_id, card_key, tier) values (v_uid, p_game, p_run_id, p_card, v_tier);
  insert into public.card_collection (user_id, card_key, qty) values (v_uid, p_card, 1)
  on conflict (user_id, card_key) do update
    set qty = least(public.card_collection.qty + 1, 999), updated_at = now();
  return jsonb_build_object('ok', true, 'card', p_card);
end;
$$;
revoke all on function public.grant_prologue(text, integer, text) from public;
revoke all on function public.grant_prologue(text, integer, text) from anon, authenticated;
grant execute on function public.grant_prologue(text, integer, text) to authenticated;

-- ===========================================================================
-- 4. analytics_prologue
-- ===========================================================================
-- { ok,
--   games:   [ { game: 1..3, started, players, won, lost, quit, left, open,
--                finished (won + lost), median_win_seconds, median_win_day } ],
--   journey: { started1, won1, started2, won2, started3, won3 },
--   funnel:  [ { game, beat, i, shown, done, median_ms_to_done, hinted, hints, handed } ],
--   skips:   { title, game },
--   choices: [ { game, choice, n } ],
--   again:   { prologue: { players, n, again }, before: { players, n, again } } }
--
-- GAMES are 0010's model (analytics__games: a game is a run_start with ONE
-- result, its ending looked up across the whole table), in the journey's
-- three modes, STARTED in [p_from, p_to). Finished is won + lost of started.
--
-- THE JOURNEY is counted PLAYER BY PLAYER: everyone whose first game 1
-- started in the period, followed through every later game whenever it
-- started; and it is a true funnel — every rung is inside the one before (a
-- player who started game 2 is counted there only once game 1 was won).
--
-- THE FUNNEL is the 'prologue' rows written in the period: per game and beat,
-- how many GAMES (run ids; a row with no run id is counted by its page load,
-- `visit`) showed it and how many completed it, the median milliseconds from
-- shown to done (done_ms − shown_ms, one completion a game: its first), and
-- of those completed, how many needed a hint (hints > 0; `hints` is the sum)
-- and how many were shown the guiding hand.
--
-- SKIPS are PLAYERS (devices) who skipped the journey from the title and from
-- inside a game; CHOICES are end screens (one a game): which button.
--
-- PLAYED AGAIN: each player's FIRST game ever (any mode). 'prologue' is every
-- player whose first game was game 1 of the journey, 'before' everyone whose
-- first game was anything else; both by first game started in the period.
-- `again` counts a second game (of any mode — for the journey, game 2 is one)
-- started within 7 days of the first, and `n` the players whose week has
-- passed (a week that has not happened yet is not a "no"); `players` is the
-- whole cohort.
--
-- EVERY ROW IS A CLIENT'S: every value read out of props is compared as text
-- or matched to a pattern before it is cast, so one hostile row never blanks
-- the section. A beat or a choice that is not a plain word reads 'other'. The
-- dashboard's left-out devices (analytics__hidden()) are left out unless
-- p_everyone.
drop function if exists public.analytics_prologue(text, timestamptz, timestamptz, boolean);
create function public.analytics_prologue(
  p_token text, p_from timestamptz default null, p_to timestamptz default null, p_everyone boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end timestamptz := least(coalesce(p_to, now()), now());
  v_out jsonb;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;

  with hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  -- every game ever started, one result each (the left-out devices left out)
  allg as (select * from public.analytics__games(null, null, null, null, coalesce(p_everyone, false))),
  pg as (
    select a.*, case a.mode when 'prologue_1' then 1 when 'prologue_2' then 2 when 'prologue_3' then 3 end as game
    from allg a
    where a.mode in ('prologue_1', 'prologue_2', 'prologue_3')
  ),
  -- the journey's games STARTED in the period
  wpg as (
    select p.* from pg p
    where (p_from is null or p.started_at >= p_from) and (p_to is null or p.started_at < p_to)
  ),
  gstats as (
    select n.game,
           count(w.run_id) as started,
           count(distinct w.user_id) as players,
           count(w.run_id) filter (where w.result = 'won') as won,
           count(w.run_id) filter (where w.result = 'lost') as lost,
           count(w.run_id) filter (where w.result = 'quit') as quit_n,
           count(w.run_id) filter (where w.result = 'left') as left_n,
           count(w.run_id) filter (where w.result = 'open') as open_n,
           percentile_cont(0.5) within group (order by w.seconds) filter (where w.result = 'won' and w.seconds is not null) as med_s,
           percentile_cont(0.5) within group (order by w.day) filter (where w.result = 'won' and w.day is not null) as med_d
    from (values (1), (2), (3)) as n(game) left join wpg w on w.game = n.game
    group by n.game
  ),
  -- THE JOURNEY: the players who began it in the period, and every game of theirs since
  j0 as (
    select p.user_id from pg p where p.game = 1
    group by p.user_id
    having (p_from is null or min(p.started_at) >= p_from) and (p_to is null or min(p.started_at) < p_to)
  ),
  jp as (
    select j.user_id,
           bool_or(p.game = 1 and p.result = 'won') as w1,
           bool_or(p.game = 2) as s2,
           bool_or(p.game = 2 and p.result = 'won') as w2,
           bool_or(p.game = 3) as s3,
           bool_or(p.game = 3 and p.result = 'won') as w3
    from j0 j join pg p on p.user_id = j.user_id
    group by j.user_id
  ),
  -- the guide's rows written in the period, every value checked before it is used
  lrows as (
    select t.user_id,
           t.props->>'ev' as ev,
           case when (t.props->>'game') ~ '^[1-3]$' then (t.props->>'game')::integer end as game,
           case when (t.props->>'beat') ~ '^[A-Za-z0-9_.:-]{1,40}$' then t.props->>'beat' else 'other' end as beat,
           case when (t.props->>'i') ~ '^[0-9]{1,3}$' then (t.props->>'i')::integer end as i,
           case when (t.props->>'shown_ms') ~ '^[0-9]{1,9}$' then (t.props->>'shown_ms')::bigint end as shown_ms,
           case when (t.props->>'done_ms') ~ '^[0-9]{1,9}$' then (t.props->>'done_ms')::bigint end as done_ms,
           case when (t.props->>'hints') ~ '^[0-9]{1,4}$' then (t.props->>'hints')::integer else 0 end as hints,
           coalesce((t.props->>'hand') = 'true' or (t.props->>'hand') ~ '^[1-9][0-9]{0,3}$', false) as hand,
           case when (t.props->>'from') in ('title', 'game') then t.props->>'from' else 'other' end as sfrom,
           case when (t.props->>'choice') in ('journey', 'random', 'retry', 'open', 'menu', 'named') then t.props->>'choice' else 'other' end as choice,
           coalesce(case when char_length(coalesce(t.run_id, '')) between 1 and 64 then 'r:' || t.run_id end,
                    case when (t.props->>'visit') ~ '^[A-Za-z0-9_-]{1,64}$' then 'v:' || (t.props->>'visit') end) as unit
    from public.telemetry t
    where t.kind = 'prologue' and (p_from is null or t.created_at >= p_from) and t.created_at < v_end
      and not exists (select 1 from hid where hid.user_id = t.user_id)
  ),
  shown as (
    select l.game, l.beat, min(l.i) as i, count(distinct l.unit) as n
    from lrows l where l.ev = 'shown' and l.game is not null and l.unit is not null
    group by l.game, l.beat
  ),
  -- one completion a game and beat: its first (a resent row never counts twice)
  done1 as (
    select distinct on (l.unit, l.game, l.beat) l.*
    from lrows l where l.ev = 'beat' and l.game is not null and l.unit is not null
    order by l.unit, l.game, l.beat, l.done_ms nulls last
  ),
  done as (
    select d.game, d.beat, min(d.i) as i, count(*) as n,
           percentile_cont(0.5) within group (order by d.done_ms - d.shown_ms)
             filter (where d.done_ms is not null and d.shown_ms is not null and d.done_ms >= d.shown_ms) as med,
           count(*) filter (where d.hints > 0) as hinted,
           coalesce(sum(d.hints), 0) as hints,
           count(*) filter (where d.hand) as handed
    from done1 d group by d.game, d.beat
  ),
  beats as (
    select coalesce(s.game, d.game) as game, coalesce(s.beat, d.beat) as beat, least(s.i, d.i) as i,
           coalesce(s.n, 0) as shown, coalesce(d.n, 0) as done, d.med,
           coalesce(d.hinted, 0) as hinted, coalesce(d.hints, 0) as hints, coalesce(d.handed, 0) as handed
    from shown s full join done d on d.game = s.game and d.beat = s.beat
  ),
  skips as (
    select l.sfrom, count(distinct l.user_id) as n from lrows l where l.ev = 'skip' group by l.sfrom
  ),
  choices as (
    select l.game, l.choice, count(distinct l.unit) as n
    from lrows l where l.ev = 'choice' and l.game is not null and l.unit is not null
    group by l.game, l.choice
  ),
  -- PLAYED AGAIN: every player's first game ever, by the period it started in
  firsts as (
    select distinct on (a.user_id) a.user_id, a.started_at as first_at, a.mode
    from allg a order by a.user_id, a.started_at, a.run_id
  ),
  coh as (
    select f.*, case when f.mode = 'prologue_1' then 'prologue' else 'before' end as cohort
    from firsts f
    where (p_from is null or f.first_at >= p_from) and (p_to is null or f.first_at < p_to)
  ),
  ripe as (
    select c.*, (select count(distinct a.run_id) from allg a
                  where a.user_id = c.user_id and a.started_at >= c.first_at
                    and a.started_at < c.first_at + interval '7 days') >= 2 as back
    from coh c where c.first_at <= now() - interval '7 days'
  )
  select jsonb_build_object(
    'ok', true,
    'games', (select coalesce(jsonb_agg(jsonb_build_object(
        'game', s.game, 'started', s.started, 'players', s.players, 'won', s.won, 'lost', s.lost,
        'quit', s.quit_n, 'left', s.left_n, 'open', s.open_n, 'finished', s.won + s.lost,
        'median_win_seconds', case when s.med_s is not null then round(s.med_s::numeric) end,
        'median_win_day', case when s.med_d is not null then round(s.med_d::numeric) end)
      order by s.game), '[]'::jsonb) from gstats s),
    'journey', (select jsonb_build_object(
        'started1', count(*),
        'won1',     count(*) filter (where j.w1),
        'started2', count(*) filter (where j.w1 and j.s2),
        'won2',     count(*) filter (where j.w1 and j.s2 and j.w2),
        'started3', count(*) filter (where j.w1 and j.s2 and j.w2 and j.s3),
        'won3',     count(*) filter (where j.w1 and j.s2 and j.w2 and j.s3 and j.w3)) from jp j),
    'funnel', (select coalesce(jsonb_agg(jsonb_build_object(
        'game', b.game, 'beat', b.beat, 'i', b.i, 'shown', b.shown, 'done', b.done,
        'median_ms_to_done', case when b.med is not null then round(b.med::numeric) end,
        'hinted', b.hinted, 'hints', b.hints, 'handed', b.handed)
      order by b.game, b.i nulls last, b.beat), '[]'::jsonb) from beats b),
    'skips', jsonb_build_object(
        'title', coalesce((select k.n from skips k where k.sfrom = 'title'), 0),
        'game',  coalesce((select k.n from skips k where k.sfrom = 'game'), 0)),
    'choices', (select coalesce(jsonb_agg(jsonb_build_object('game', c.game, 'choice', c.choice, 'n', c.n)
      order by c.game, c.choice), '[]'::jsonb) from choices c),
    'again', jsonb_build_object(
        'prologue', jsonb_build_object(
          'players', (select count(*) from coh c where c.cohort = 'prologue'),
          'n',       (select count(*) from ripe r where r.cohort = 'prologue'),
          'again',   (select count(*) from ripe r where r.cohort = 'prologue' and r.back)),
        'before', jsonb_build_object(
          'players', (select count(*) from coh c where c.cohort = 'before'),
          'n',       (select count(*) from ripe r where r.cohort = 'before'),
          'again',   (select count(*) from ripe r where r.cohort = 'before' and r.back))))
  into v_out;
  return v_out;
end
$$;
revoke all on function public.analytics_prologue(text, timestamptz, timestamptz, boolean) from public;
grant execute on function public.analytics_prologue(text, timestamptz, timestamptz, boolean) to anon, authenticated;
