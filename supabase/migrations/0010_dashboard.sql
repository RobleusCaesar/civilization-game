-- 0010 — THE DASHBOARD, REBUILT: one ending per game, your own play left out
--
-- WHY (the operator, 2026-10-28, on the past month: "171 games were played,
-- but 434 reached an ending. That doesn't make any sense. Also, win rate and
-- loss rate was only 28…"). It did not make sense. The live summary was still
-- 0006's, which counted EVERY run_end row as an ending — and since build 95
-- the game sends a provisional 'closed_tab' ending every time a tab goes away
-- on a live run (one per run per day reached), so a phone player who
-- switched apps five times was five endings. 0007 fixed the worst of it but
-- was never applied, and even 0007 measured "win rate" against all endings
-- rather than against games.
--
-- WHAT THIS FILE DOES. Everything the new analytics.html asks is answered
-- from ONE model: a GAME is a run_start, and it has exactly ONE result —
--   won   its real ending says win
--   lost  its real ending says loss
--   quit  struck the banner (or any other real 'abandoned' ending)
--   left  the tab went away and it never ended for real (closed_tab)
--   open  nothing came back at all (still running, or the send was blocked)
-- A real ending always beats a closed_tab row for the same run (the player
-- came back), and of several rows the LATEST counts. A game belongs to the
-- window it STARTED in; its ending is looked up across the whole table.
-- Every rate says what it is a rate OF: "finished" is (won + lost) / games,
-- "win rate" is won / (won + lost).
--
-- YOUR OWN PLAY IS LEFT OUT, retroactively. A device is hidden from every
-- number when any of these holds:
--   * it is on the operator's list (analytics_excluded — the dashboard's
--     "This device is mine" button, or "Mine" beside it in the device list);
--   * it ever played with the card TEST deck (?cards=all — run_end
--     props.cards_test), which only a tester holds;
--   * it was ever seen on a network the operator marked as theirs
--     (analytics_excluded_nets — "Exclude this network").
-- Networks: from this file on, every telemetry row is stamped with a SALTED,
-- TRUNCATED hash of the network it came from (the IPv4 address, or the /64
-- of an IPv6 one — a phone's IPv6 address rotates, its /64 does not). The
-- address itself is never stored, and the salt is a random secret that never
-- leaves the database, so the hash cannot be run backwards over the address
-- space. Rows from before this file carry no network — that history is
-- covered by the device list. A mobile network is shared by thousands of
-- strangers (CGNAT): mark only a home or office network, and the dashboard
-- shows how many devices a network covers before you mark it.
-- "Include everyone" on the dashboard shows the numbers with nothing hidden.
--
-- THE FEEDBACK INBOX. 0009 keeps every report; this file gives each a STATUS
-- (new → triaged → sent → fixed / wontfix) and a note, and two doors for the
-- dashboard to read and set them. The email still goes out from the game.
--
-- WHAT A GAME CARRIES FROM BUILD 107 ON: every telemetry row's props.build
-- (the code version it was played on) and, on the ending, props.errors (how
-- many errors the game's own recorder caught) and props.err (the first of
-- them, cut short). A game from before carries neither and reads NULL —
-- never counted as clean.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor AFTER 0009
-- (it refuses, saying so, without 0003's telemetry or 0009's feedback). It
-- is ONE idempotent block: run it twice and nothing changes the second time.
-- It does not touch analytics_summary (0006/0007) or analytics_cards (0008):
-- the old dashboard keeps working until the new page is deployed.
--
-- SECURITY. Every new table is sealed (RLS on, no policy, every privilege
-- revoked from anon and authenticated — Supabase grants new objects to both
-- by name, which `revoke … from public` never touches). The public doors are
-- SECURITY DEFINER, check the dashboard passphrase hash first (the 0003
-- token), and are granted to anon + authenticated (the page calls them with
-- the publishable key and no session). The helpers are granted to nobody.
-- The feedback doors return report ROWS — that is the operator's inbox — and
-- only behind the passphrase.
--
-- EVERY ROW IS A CLIENT'S. Telemetry and feedback are written by anonymous
-- players, so nothing read out of them is trusted: every cast of a client's
-- JSON is guarded (one row carrying "tutorial": "yes" used to raise inside
-- every number and blank the whole dashboard), a row's time is the server's
-- (the stamp trigger), and the inbox hands the page every field in a type it
-- can trust.

do $guard$
begin
  if to_regclass('public.telemetry') is null or to_regclass('public.analytics_config') is null then
    raise exception '0010 needs 0003 (telemetry, analytics_config) applied first';
  end if;
  if to_regclass('public.feedback') is null then
    raise exception '0010 needs 0009_feedback.sql applied first';
  end if;
end
$guard$;

-- ===========================================================================
-- 1. THE NETWORK STAMP
-- ===========================================================================
create table if not exists public.analytics_secret (
  id    integer primary key default 1 check (id = 1),
  salt  text not null
);
alter table public.analytics_secret enable row level security;
revoke all on table public.analytics_secret from public;
revoke all on table public.analytics_secret from anon, authenticated;
insert into public.analytics_secret (id, salt)
  values (1, encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (id) do nothing;

alter table public.telemetry add column if not exists net text;
create index if not exists telemetry_net_idx on public.telemetry (net) where net is not null;

-- the network of the request in hand: its first hop's address from the
-- proxy's headers, cut to the network (IPv4 /32, IPv6 /64), salted, hashed,
-- truncated. NULL whenever there is no request (the SQL editor) or the
-- header will not parse — a stamp may be missing, it never throws.
create or replace function public.analytics__net()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_h    jsonb;
  v_ip   text;
  v_net  inet;
  v_salt text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_h is null then return null; end if;
  v_ip := coalesce(nullif(v_h->>'cf-connecting-ip', ''), nullif(v_h->>'x-real-ip', ''),
                   nullif(btrim(split_part(coalesce(v_h->>'x-forwarded-for', ''), ',', 1)), ''));
  if v_ip is null then return null; end if;
  begin
    v_net := v_ip::inet;
  exception when others then
    return null;
  end;
  v_net := network(set_masklen(v_net, case when family(v_net) = 6 then 64 else 32 end));
  select s.salt into v_salt from public.analytics_secret s where s.id = 1;
  if v_salt is null then return null; end if;
  return left(encode(extensions.digest(v_salt || '|' || host(v_net) || '/' || masklen(v_net), 'sha256'), 'hex'), 16);
end;
$$;
revoke all on function public.analytics__net() from public;
revoke all on function public.analytics__net() from anon, authenticated;

-- every telemetry row is stamped by the SERVER, and a client can write
-- neither stamp: its network (any value a client sends is overwritten), and,
-- for a row a client sends (the anon and authenticated roles), its TIME. The
-- game never sends created_at, but the API roles hold INSERT on every column
-- and nothing else checked it: one back-dated row could move a build's
-- release moment (the "Did the update help?" split) and a row dated '44 BC'
-- or 'infinity' could break whatever reads the date. A row written by the
-- operator (the SQL editor, a migration, the contract's own fixture) keeps
-- the time it was given.
create or replace function public.analytics__stamp_net()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    new.net := public.analytics__net();
  exception when others then
    new.net := null;
  end;
  -- the role the REQUEST runs as: PostgREST sets it per request; a session
  -- that logged in as an API role directly has no role set and is its own
  if coalesce(nullif(current_setting('role', true), 'none'), session_user::text) in ('anon', 'authenticated') then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.analytics__stamp_net() from public;
revoke all on function public.analytics__stamp_net() from anon, authenticated;
drop trigger if exists telemetry_stamp_net on public.telemetry;
create trigger telemetry_stamp_net before insert on public.telemetry
  for each row execute function public.analytics__stamp_net();

-- ===========================================================================
-- 2. WHAT IS LEFT OUT
-- ===========================================================================
create table if not exists public.analytics_excluded (
  user_id   uuid primary key,
  label     text check (label is null or char_length(label) <= 60),
  added_at  timestamptz not null default now()
);
alter table public.analytics_excluded enable row level security;
revoke all on table public.analytics_excluded from public;
revoke all on table public.analytics_excluded from anon, authenticated;

create table if not exists public.analytics_excluded_nets (
  net       text primary key check (char_length(net) = 16),
  label     text check (label is null or char_length(label) <= 60),
  added_at  timestamptz not null default now()
);
alter table public.analytics_excluded_nets enable row level security;
revoke all on table public.analytics_excluded_nets from public;
revoke all on table public.analytics_excluded_nets from anon, authenticated;

-- the passphrase check every door asks first (the 0003 token)
create or replace function public.analytics__ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.analytics_config c
                 where c.id = 1 and c.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
$$;
revoke all on function public.analytics__ok(text) from public;
revoke all on function public.analytics__ok(text) from anon, authenticated;

-- every device left out, and why (a device can have several reasons)
create or replace function public.analytics__hidden()
returns table (user_id uuid, why text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id, 'yours'::text from public.analytics_excluded e
  union all
  select distinct t.user_id, 'tester'::text from public.telemetry t
   where t.props->>'cards_test' = 'true'
  union all
  select distinct t.user_id, 'network'::text from public.telemetry t
   join public.analytics_excluded_nets n on n.net = t.net;
$$;
revoke all on function public.analytics__hidden() from public;
revoke all on function public.analytics__hidden() from anon, authenticated;

-- ===========================================================================
-- 3. ONE ROW PER GAME
-- ===========================================================================
-- Every game STARTED in [p_from, p_to), with its one result. p_everyone
-- keeps the hidden devices in. `build` is the code version the game was
-- played on and `errors` / `err` what its own error recorder caught — both
-- sent from build 107 on, so a game before that reads NULL (not counted),
-- never 0 (counted clean).
--
-- EVERY ROW HERE WAS WRITTEN BY A CLIENT, so nothing read out of props is
-- trusted: every cast is guarded (a comparison, or a pattern checked first
-- inside a CASE), and one hostile row can never raise an error and take
-- every number down with it.
--
-- p_seen_by: what had come back BY THAT MOMENT. The release comparison asks
-- each window with the same follow-up — a "before" game a week older than
-- its "after" twin must not have had a week longer to report how it ended,
-- or a left game that later won counts as finished on one side only and
-- every rate leans toward "Worse". NULL reads everything there is.
--
-- A GAME'S ERRORS are read off EVERY ending row it sent, closed tabs
-- included: the error count is per sitting (a reload starts it again), so a
-- game that threw, was reloaded and then ended cleanly still caught an error.
-- Its count is the most any sitting reported and its error the first one any
-- sitting named.
--
-- Dropped first, so a change of columns or arguments never leaves an
-- overload behind (PostgREST answers 300 to an overload): the functions
-- that call it are created after it, below.
drop function if exists public.analytics__games(timestamptz, timestamptz, text, text, boolean);
drop function if exists public.analytics__games(timestamptz, timestamptz, text, text, boolean, timestamptz);
create function public.analytics__games(
  p_from timestamptz, p_to timestamptz, p_mode text, p_device text, p_everyone boolean,
  p_seen_by timestamptz default null)
returns table (
  run_id text, user_id uuid, started_at timestamptz, mode text, landform text, device text,
  tutorial boolean, origin text, build integer, result text, cause text, day integer, seconds integer,
  score integer, tc_level integer, peak_pop integer, cards_played integer, errors integer, err text,
  ended_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  starts as (
    select distinct on (s.run_id) s.*
    from public.telemetry s
    where s.kind = 'run_start' and s.run_id is not null
      and s.created_at <= now()
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <  p_to)
      and (p_mode   is null or s.mode   = p_mode)
      and (p_device is null or s.device = p_device)
      and not exists (select 1 from hid where hid.user_id = s.user_id)
    order by s.run_id, s.created_at, s.id
  ),
  -- every ending row of those runs that had come back by p_seen_by
  endrows as (
    select e.*
    from public.telemetry e
    where e.kind = 'run_end' and e.run_id in (select st.run_id from starts st)
      and (p_seen_by is null or e.created_at < p_seen_by)
  ),
  ending as (
    -- a real ending beats a closed_tab row; of several, the latest counts
    select distinct on (r.run_id) r.*
    from endrows r
    order by r.run_id, (coalesce(r.cause, '') = 'closed_tab'), r.created_at desc, r.id desc
  ),
  errs as (
    select r.run_id,
           max(case when coalesce(r.props->>'errors', '') ~ '^[0-9]{1,9}$' then (r.props->>'errors')::integer end) as errors,
           (array_agg(left(r.props->>'err', 160) order by r.created_at, r.id)
              filter (where coalesce(r.props->>'err', '') <> ''))[1] as err
    from endrows r
    group by r.run_id
  )
  select s.run_id, s.user_id, s.created_at, s.mode, s.landform, s.device,
         coalesce(s.props->>'tutorial' = 'true', false),
         nullif(coalesce(e.props->>'card', s.props->>'card'), ''),
         case when coalesce(e.props->>'build', '') ~ '^[0-9]{1,6}$' then (e.props->>'build')::integer
              when coalesce(s.props->>'build', '') ~ '^[0-9]{1,6}$' then (s.props->>'build')::integer end,
         case
           when e.run_id is null then 'open'
           when e.outcome = 'win'  then 'won'
           when e.outcome = 'loss' then 'lost'
           when coalesce(e.cause, '') = 'closed_tab' then 'left'
           else 'quit'
         end,
         e.cause, e.day, e.seconds, e.score, e.tc_level, e.peak_pop,
         case when coalesce(e.props->>'cards_played', '') ~ '^[0-9]{1,4}$' then (e.props->>'cards_played')::integer else 0 end,
         x.errors,
         x.err,
         e.created_at
  from starts s
  left join ending e on e.run_id = s.run_id
  left join errs x on x.run_id = s.run_id;
$$;
revoke all on function public.analytics__games(timestamptz, timestamptz, text, text, boolean, timestamptz) from public;
revoke all on function public.analytics__games(timestamptz, timestamptz, text, text, boolean, timestamptz) from anon, authenticated;

-- the headline numbers of one window.
--
-- THE LENGTH FILTER (p_min_seconds) drops only a game whose KNOWN length is
-- short: a bounce is not a game. A game with no ending row at all ('open'
-- — still running, or its rows were blocked, or it was left from the menu)
-- has no known length and stays in: dropping it made "finished" a share of
-- the games that happened to report, and "No signal yet" could never show.
-- The ERRORS are counted over every game, the filter aside: a game that
-- crashed in its first minute is the one most worth seeing.
--
-- NEW PLAYERS are everyone whose first game ever started in the window, among
-- the games in the window's scope (difficulty, device) BEFORE the length
-- filter: a new player who bounced in the first minute and never came back is
-- exactly who "played again" and the first-game hook exist to count, so the
-- filter must not quietly remove them from both.
--
-- THE CLUSTER SUMS ('robust'): games come in bunches per player, so a test
-- that treats every game as an independent trial cries "Better" or "Worse"
-- far more often than 5% of the time. For each per-game rate the page gets,
-- per window, k and n and the per-player sums Σk², Σk·n, Σn² and the number
-- of players m with any games in it, and tests the change player by player
-- (the cluster-robust variance); for the count of games, Σg² per player.
drop function if exists public.analytics__window(timestamptz, timestamptz, text, text, integer, boolean);
drop function if exists public.analytics__window(timestamptz, timestamptz, text, text, integer, boolean, timestamptz);
create function public.analytics__window(
  p_from timestamptz, p_to timestamptz, p_mode text, p_device text,
  p_min_seconds integer, p_everyone boolean, p_seen_by timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (select * from public.analytics__games(p_from, p_to, p_mode, p_device, p_everyone, p_seen_by)),
  g as (
    select * from a
    where coalesce(p_min_seconds, 0) <= 0 or a.seconds is null or a.seconds >= p_min_seconds
  ),
  hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  -- a player's FIRST game ever (any difficulty, any device; the same devices
  -- left out), for "new"
  firsts as (
    select t.user_id, min(t.created_at) as first_at
    from public.telemetry t
    where t.kind = 'run_start' and t.run_id is not null and t.created_at <= now()
      and not exists (select 1 from hid where hid.user_id = t.user_id)
    group by t.user_id
  ),
  players as (select distinct g.user_id from g),
  newbies as (
    select f.user_id, f.first_at from firsts f
    where f.user_id in (select x.user_id from a x)
      and (p_from is null or f.first_at >= p_from)
      and (p_to   is null or f.first_at <  p_to)
  ),
  -- PLAYED AGAIN: a new player who started a SECOND game within 7 days of
  -- their first (the same sitting counts — a second game is the hook).
  -- Counted only for players whose week had passed by the time the window is
  -- read (p_seen_by, else now): a week that has not happened yet is not a "no".
  ripe as (select n.* from newbies n where n.first_at <= coalesce(p_seen_by, now()) - interval '7 days'),
  back as (
    select r.user_id from ripe r
    where (select count(distinct t.run_id) from public.telemetry t
           where t.user_id = r.user_id and t.kind = 'run_start' and t.run_id is not null
             and t.created_at >= r.first_at and t.created_at < r.first_at + interval '7 days') >= 2
  ),
  -- THE FIRST-GAME HOOK: each new player's TRUE first game (whatever its
  -- difficulty or device), counted only when that game is in the filter —
  -- under "Hard", a player who started on Calm is scored on nothing rather
  -- than on a later game wearing the name "first". Whether it held them for
  -- ten minutes of play; a first game with no ending row at all ('open') says
  -- nothing either way and is left out of both sides.
  first_games as (
    select f.* from (
      select distinct on (x.user_id) x.*
      from a x join newbies n on n.user_id = x.user_id and x.started_at = n.first_at
      order by x.user_id, x.run_id
    ) f
    where f.result <> 'open'
  ),
  per_player as (select g.user_id, sum(g.seconds) as secs from g where g.seconds is not null group by g.user_id),
  pp as (
    select g.user_id, count(*)::bigint as n,
           count(*) filter (where g.result in ('won', 'lost'))::bigint as d,
           count(*) filter (where g.result = 'won')::bigint as w
    from g group by g.user_id
  ),
  pe as (
    select a.user_id, count(*) filter (where a.errors is not null)::bigint as n,
           count(*) filter (where coalesce(a.errors, 0) > 0)::bigint as k
    from a group by a.user_id
  ),
  fb as (
    select f.kind from public.feedback f
    where (p_from is null or f.created_at >= p_from)
      and (p_to   is null or f.created_at <  p_to)
      and (coalesce(p_everyone, false) or not exists (select 1 from hid where hid.user_id = f.user_id))
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'players',     (select count(*) from players),
    'new_players', (select count(*) from newbies),
    'returning',   (select count(*) from players p where p.user_id not in (select n.user_id from newbies n)),
    'games',       (select count(*) from g),
    'won',   (select count(*) from g where result = 'won'),
    'lost',  (select count(*) from g where result = 'lost'),
    'quit',  (select count(*) from g where result = 'quit'),
    'left',  (select count(*) from g where result = 'left'),
    'open',  (select count(*) from g where result = 'open'),
    'finished_pct', (select round(100.0 * count(*) filter (where result in ('won', 'lost')) / nullif(count(*), 0), 1) from g),
    'win_pct',      (select round(100.0 * count(*) filter (where result = 'won')
                            / nullif(count(*) filter (where result in ('won', 'lost')), 0), 1) from g),
    'games_per_player', (select round(count(*)::numeric / nullif(count(distinct user_id), 0), 2) from g),
    'median_minutes',   (select round((percentile_cont(0.5) within group (order by seconds) / 60.0)::numeric, 1) from g where seconds is not null),
    'median_day',       (select percentile_cont(0.5) within group (order by day) from g where day is not null),
    'hours',            (select round((coalesce(sum(seconds), 0) / 3600.0)::numeric, 1) from g),
    'left_early_pct',   (select round(100.0 * count(*) filter (where result in ('left', 'quit') and coalesce(day, 0) < 10)
                            / nullif(count(*), 0), 1) from g),
    'back_ripe',  (select count(*) from ripe),
    'back',       (select count(*) from back),
    'back_pct',   (select round(100.0 * (select count(*) from back) / nullif((select count(*) from ripe), 0), 1)),
    'hook_n',     (select count(*) from first_games),
    'hook',       (select count(*) from first_games where coalesce(seconds, 0) >= 600),
    'hook_pct',   (select round(100.0 * count(*) filter (where coalesce(seconds, 0) >= 600)
                          / nullif(count(*), 0), 1) from first_games),
    'player_minutes', (select round((percentile_cont(0.5) within group (order by secs) / 60.0)::numeric, 1) from per_player),
    'err_n',      (select count(*) from a where errors is not null),
    'err_games',  (select count(*) from a where coalesce(errors, 0) > 0),
    'robust', jsonb_build_object(
      'games',    (select jsonb_build_object('g', coalesce(sum(n), 0), 'gg', coalesce(sum(n * n), 0), 'm', count(*)) from pp),
      'finished', (select jsonb_build_object('k', coalesce(sum(d), 0), 'n', coalesce(sum(n), 0), 'kk', coalesce(sum(d * d), 0),
                     'kn', coalesce(sum(d * n), 0), 'nn', coalesce(sum(n * n), 0), 'm', count(*) filter (where n > 0)) from pp),
      'win',      (select jsonb_build_object('k', coalesce(sum(w), 0), 'n', coalesce(sum(d), 0), 'kk', coalesce(sum(w * w), 0),
                     'kn', coalesce(sum(w * d), 0), 'nn', coalesce(sum(d * d), 0), 'm', count(*) filter (where d > 0)) from pp),
      'err',      (select jsonb_build_object('k', coalesce(sum(k), 0), 'n', coalesce(sum(n), 0), 'kk', coalesce(sum(k * k), 0),
                     'kn', coalesce(sum(k * n), 0), 'nn', coalesce(sum(n * n), 0), 'm', count(*) filter (where n > 0)) from pe)),
    'reports', jsonb_build_object(
      'bug',   (select count(*) from fb where kind = 'bug'),
      'crash', (select count(*) from fb where kind = 'crash'),
      'idea',  (select count(*) from fb where kind = 'idea'),
      'other', (select count(*) from fb where kind = 'other'))
  );
$$;
revoke all on function public.analytics__window(timestamptz, timestamptz, text, text, integer, boolean, timestamptz) from public;
revoke all on function public.analytics__window(timestamptz, timestamptz, text, text, integer, boolean, timestamptz) from anon, authenticated;

-- ===========================================================================
-- 4. THE DASHBOARD'S DOORS
-- ===========================================================================
-- the whole page in one call.
--
-- EVERY DAY covers exactly the period the tiles count, in the OPERATOR'S days
-- (p_tz, the page's own time zone; a name PostgreSQL does not know falls back
-- to UTC and never raises): from p_from — or, with no start, the day of the
-- first game the tiles count — to p_to or now, at most the last 180 days
-- (`daily_info.capped` says when the chart shows less than the tiles count).
-- A day only partly inside the period carries `partial` and the stretch of it
-- that is in (`from`, `to`): the first day of "Last 30 days" starts at this
-- hour thirty days ago, and today is not over.
drop function if exists public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean);
drop function if exists public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean, text);
create function public.analytics_dashboard(
  p_token text, p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_device text default null,
  p_min_seconds integer default 60, p_everyone boolean default false,
  p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
  v_tz  text := 'UTC';
  v_end timestamptz := least(coalesce(p_to, now()), now());   -- the period ends here: nothing has started after now
  v_d0  date;
  v_d1  date;
  v_cap boolean := false;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    v_tz := p_tz;
  end if;
  -- the days the chart draws: the period's own, in v_tz
  v_d1 := ((v_end - interval '1 microsecond') at time zone v_tz)::date;
  if p_from is not null then
    v_d0 := (p_from at time zone v_tz)::date;
  else
    select (min(x.started_at) at time zone v_tz)::date into v_d0
    from public.analytics__games(null, p_to, p_mode, p_device, p_everyone) x
    where coalesce(p_min_seconds, 0) <= 0 or x.seconds is null or x.seconds >= p_min_seconds;
  end if;
  if v_d0 is not null and v_d0 < v_d1 - 179 then
    v_d0 := v_d1 - 179;
    v_cap := true;
  end if;
  with g as (
    select * from public.analytics__games(p_from, p_to, p_mode, p_device, p_everyone) x
    where coalesce(p_min_seconds, 0) <= 0 or x.seconds is null or x.seconds >= p_min_seconds
  ),
  -- the funnel, the bounce and the errors read EVERY game, the run filter aside
  allg as (select * from public.analytics__games(p_from, p_to, p_mode, p_device, p_everyone)),
  days as (
    select d::date as day,
           (d::date::timestamp at time zone v_tz) as ds,
           ((d::date + 1)::timestamp at time zone v_tz) as de
    from generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day') d
    where v_d0 is not null and v_d0 <= v_d1
  ),
  gd as (
    select (g.started_at at time zone v_tz)::date as day, count(*) as games, count(distinct g.user_id) as players,
           count(*) filter (where g.result = 'won') as won, count(*) filter (where g.result = 'lost') as lost
    from g group by 1
  ),
  hid as (select h.user_id, h.why from public.analytics__hidden() h),
  -- the deck's own rows (0008's kinds), on the same terms as the games: the
  -- window, the difficulty, the device the run was started on, and nobody
  -- left out unless "everyone" is asked for
  cardrows as (
    select t.kind, t.user_id, t.props from public.telemetry t
    where t.kind in ('card_granted', 'card_played')
      and (p_from is null or t.created_at >= p_from)
      and (p_to   is null or t.created_at <  p_to)
      and (p_mode is null or t.mode = p_mode)
      and (p_device is null or exists (select 1 from public.telemetry s
                                       where s.run_id = t.run_id and s.kind = 'run_start' and s.device = p_device))
      and (coalesce(p_everyone, false) or not exists (select 1 from hid where hid.user_id = t.user_id))
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'headline', public.analytics__window(p_from, p_to, p_mode, p_device, p_min_seconds, p_everyone),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                 'day', d.day,
                 'players', coalesce(x.players, 0),
                 'games',   coalesce(x.games, 0),
                 'won',     coalesce(x.won, 0),
                 'lost',    coalesce(x.lost, 0),
                 'partial', (p_from is not null and p_from > d.ds) or v_end < d.de,
                 'from',    case when (p_from is not null and p_from > d.ds) or v_end < d.de
                                 then greatest(d.ds, coalesce(p_from, d.ds)) end,
                 'to',      case when (p_from is not null and p_from > d.ds) or v_end < d.de
                                 then least(d.de, v_end) end)
               order by d.day), '[]'::jsonb)
              from days d left join gd x on x.day = d.day),
    'daily_info', jsonb_build_object('tz', v_tz, 'from', v_d0, 'to', v_d1, 'capped', v_cap, 'max_days', 180),
    -- WHERE PLAYERS STOP: a true funnel — every rung is inside the one before
    -- (a game that reached day 50 reached day 25) — and the outcomes apart:
    -- a game can be won or lost on any day, so "finished" is not a rung.
    'funnel', (select jsonb_build_object(
                 'started',  count(*),
                 'minute',   count(*) filter (where coalesce(seconds, 0) >= 60),
                 'day10',    count(*) filter (where coalesce(day, 0) >= 10),
                 'day25',    count(*) filter (where coalesce(day, 0) >= 25),
                 'day50',    count(*) filter (where coalesce(day, 0) >= 50),
                 'day100',   count(*) filter (where coalesce(day, 0) >= 100),
                 'finished', count(*) filter (where result in ('won', 'lost')),
                 'won',      count(*) filter (where result = 'won')) from allg),
    'by_mode', (select coalesce(jsonb_agg(x order by x->>'mode'), '[]'::jsonb) from (
                 select jsonb_build_object('mode', coalesce(mode, 'unknown'), 'games', count(*),
                   'won', count(*) filter (where result = 'won'), 'lost', count(*) filter (where result = 'lost'),
                   'win_pct', round(100.0 * count(*) filter (where result = 'won')
                                    / nullif(count(*) filter (where result in ('won', 'lost')), 0), 1),
                   'finished_pct', round(100.0 * count(*) filter (where result in ('won', 'lost')) / nullif(count(*), 0), 1),
                   'median_day', percentile_cont(0.5) within group (order by day)) as x
                 from g group by mode) s),
    'left_at', (select jsonb_build_object(
                 'day', jsonb_build_object(
                   'd0_4',    count(*) filter (where coalesce(day, 0) < 5),
                   'd5_9',    count(*) filter (where day between 5 and 9),
                   'd10_24',  count(*) filter (where day between 10 and 24),
                   'd25_49',  count(*) filter (where day between 25 and 49),
                   'd50_99',  count(*) filter (where day between 50 and 99),
                   'd100',    count(*) filter (where day >= 100)),
                 'minutes', jsonb_build_object(
                   'm0_2',    count(*) filter (where coalesce(seconds, 0) < 120),
                   'm2_10',   count(*) filter (where seconds >= 120 and seconds < 600),
                   'm10_30',  count(*) filter (where seconds >= 600 and seconds < 1800),
                   'm30',     count(*) filter (where seconds >= 1800)),
                 'left', count(*) filter (where result = 'left'),
                 'quit', count(*) filter (where result = 'quit'))
               from g where result in ('left', 'quit')),
    'cards', (select jsonb_build_object(
                 'with_games', count(*) filter (where cards_played > 0),
                 'with_won',   count(*) filter (where cards_played > 0 and result = 'won'),
                 'with_lost',  count(*) filter (where cards_played > 0 and result = 'lost'),
                 'without_games', count(*) filter (where cards_played = 0),
                 'without_won',   count(*) filter (where cards_played = 0 and result = 'won'),
                 'without_lost',  count(*) filter (where cards_played = 0 and result = 'lost'),
                 'played',     coalesce(sum(cards_played), 0)) from g)
             || jsonb_build_object(
                 'earned',   (select count(*) from cardrows where kind = 'card_granted'),
                 'earners',  (select count(distinct user_id) from cardrows where kind = 'card_granted'),
                 'plays',    (select count(*) from cardrows where kind = 'card_played'),
                 'players_played', (select count(distinct user_id) from cardrows where kind = 'card_played'),
                 'earned_by_tier', (select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb) from (
                    select coalesce(nullif(props->>'tier', ''), 'unknown') as tier, count(*) as n
                    from cardrows where kind = 'card_granted' group by 1) x),
                 'top_played', (select coalesce(jsonb_agg(jsonb_build_object('card', card, 'plays', n) order by n desc, card), '[]'::jsonb) from (
                    select coalesce(nullif(props->>'card', ''), 'unknown') as card, count(*) as n
                    from cardrows where kind = 'card_played' group by 1 order by 2 desc, 1 limit 8) x)),
    -- THE ERRORS PLAYERS HIT (from build 107 on): the first error each game
    -- caught, most common first — every game, so a crash in the first
    -- minute is here even when the run filter hides the game itself
    'errors_top', (select coalesce(jsonb_agg(jsonb_build_object('err', err, 'games', n, 'players', p,
                      'build', bld, 'last', lst) order by n desc, lst desc), '[]'::jsonb) from (
                    select err, count(*) as n, count(distinct user_id) as p, max(build) as bld,
                           max(coalesce(ended_at, started_at)) as lst
                    from allg where err is not null
                    group by err order by count(*) desc, max(coalesce(ended_at, started_at)) desc limit 8) x),
    'by_origin', (select coalesce(jsonb_agg(x order by (x->>'games')::int desc, x->>'origin'), '[]'::jsonb) from (
                 select jsonb_build_object('origin', origin, 'games', count(*),
                   'won', count(*) filter (where result = 'won'), 'lost', count(*) filter (where result = 'lost')) as x
                 from g where origin is not null group by origin) s),
    'by_device', (select coalesce(jsonb_agg(x order by x->>'device'), '[]'::jsonb) from (
                 select jsonb_build_object('device', coalesce(device, 'unknown'), 'games', count(*),
                   'players', count(distinct user_id),
                   'win_pct', round(100.0 * count(*) filter (where result = 'won')
                                    / nullif(count(*) filter (where result in ('won', 'lost')), 0), 1),
                   'finished_pct', round(100.0 * count(*) filter (where result in ('won', 'lost')) / nullif(count(*), 0), 1)) as x
                 from g group by device) s),
    'by_landform', (select coalesce(jsonb_agg(x order by (x->>'games')::int desc), '[]'::jsonb) from (
                 select jsonb_build_object('landform', coalesce(landform, 'unknown'), 'games', count(*),
                   'win_pct', round(100.0 * count(*) filter (where result = 'won')
                                    / nullif(count(*) filter (where result in ('won', 'lost')), 0), 1),
                   'finished_pct', round(100.0 * count(*) filter (where result in ('won', 'lost')) / nullif(count(*), 0), 1)) as x
                 from g group by landform) s),
    'tutorial', (select jsonb_build_object(
                 'games', count(*) filter (where tutorial),
                 'finished', count(*) filter (where tutorial and result in ('won', 'lost')),
                 'won', count(*) filter (where tutorial and result = 'won')) from g),
    'hidden', jsonb_build_object(
                 'everyone', coalesce(p_everyone, false),
                 'yours',   (select count(distinct user_id) from hid where why = 'yours'),
                 'testers', (select count(distinct user_id) from hid where why = 'tester'),
                 'network', (select count(distinct user_id) from hid where why = 'network'),
                 'devices', (select count(distinct user_id) from hid),
                 'nets',    (select count(*) from public.analytics_excluded_nets),
                 -- their games on the tiles' own terms: the run filter too
                 'games',   (select count(*) from public.analytics__games(p_from, p_to, p_mode, p_device, true) a
                             where a.user_id in (select user_id from hid)
                               and (coalesce(p_min_seconds, 0) <= 0 or a.seconds is null or a.seconds >= p_min_seconds))),
    -- WHEN EACH BUILD WENT LIVE (every row names its build from 107 on): the
    -- first row seen on it, everyone's included — the operator's own device
    -- is usually first to load a deploy, and that IS the moment. Builds
    -- before 107 carry no stamp; the page knows their moments by hand. A
    -- client cannot choose a row's time any more (the stamp trigger above),
    -- but a row from before this file could have: nothing from the future is
    -- read, and the page refuses a moment it cannot parse or that falls
    -- before the build's own patch note.
    'builds', (select coalesce(jsonb_object_agg(b::text, first_at), '{}'::jsonb) from (
                 select case when coalesce(t.props->>'build', '') ~ '^[0-9]{1,6}$' then (t.props->>'build')::integer end as b,
                        min(t.created_at) as first_at
                 from public.telemetry t
                 where coalesce(t.props->>'build', '') ~ '^[0-9]{1,6}$' and t.created_at <= now()
                 group by 1) x),
    'filters', jsonb_build_object(
                 'modes',   (select coalesce(jsonb_agg(distinct t.mode) filter (where t.mode is not null), '[]'::jsonb) from public.telemetry t),
                 'devices', (select coalesce(jsonb_agg(distinct t.device) filter (where t.device is not null), '[]'::jsonb) from public.telemetry t)),
    'inbox', (select jsonb_build_object(
                 'new',     count(*) filter (where f.status = 'new'),
                 'open',    count(*) filter (where f.status in ('new', 'triaged', 'sent')),
                 'total',   count(*)) from public.feedback f)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean, text) from public;
revoke all on function public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean, text) from anon, authenticated;
grant execute on function public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean, text) to anon, authenticated;

-- DID THE UPDATE HELP? Two windows of EQUAL LENGTH either side of a moment
-- (a release): the same headline numbers for each. While the "after"
-- window is still running, it is what has happened so far, and the
-- "before" window is the same span a whole number of weeks earlier — so
-- the weekdays and the hours of the day line up, and a count of distinct
-- players means the same thing on both sides (a day's window counts every
-- regular afresh, a fortnight's counts them once: per-day rates of unequal
-- windows would read a short window as growth). Once the window is
-- complete it is simply the p_days before against the p_days after.
--
-- EQUAL FOLLOW-UP: each window is read as it stood the same time after its
-- own start — the "before" window as of now() minus the shift, the "after"
-- window as of now() — so the before game at split - shift + x and its after
-- twin at split + x have both had exactly now - split - x to report how they
-- ended. Read with everything there is, a before game had the shift (7 to 28
-- days) longer to come back and win, and the release would read "Worse" on
-- identical play. `after_s` is the after window to the second (the page says
-- "no after yet" and "N hours" from it).
create or replace function public.analytics_compare(
  p_token text, p_split timestamptz, p_days integer default 14,
  p_mode text default null, p_device text default null,
  p_min_seconds integer default 60, p_everyone boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 14), 120));
  v_e    numeric;    -- the after window as it stands, in days
  v_len  interval;
  v_back interval;   -- how far back the before window starts: whole weeks
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if p_split is null then
    return jsonb_build_object('ok', false, 'reason', 'no_split');
  end if;
  if not isfinite(p_split) then
    return jsonb_build_object('ok', false, 'reason', 'bad_split');
  end if;
  v_e := least(v_days::numeric, greatest(0, extract(epoch from (now() - p_split)) / 86400.0));
  v_len := make_interval(secs => (v_e * 86400)::double precision);
  v_back := make_interval(days => 7 * greatest(1, ceil(v_e / 7.0))::integer);
  return jsonb_build_object(
    'ok', true,
    'split', p_split, 'days', v_days,
    'after_days', round(v_e, 4),
    'after_s', round(v_e * 86400),
    'before_from', p_split - v_back, 'before_to', p_split - v_back + v_len, 'after_to', p_split + v_len,
    'seen_before', now() - v_back, 'seen_after', now(),
    'before', public.analytics__window(p_split - v_back, p_split - v_back + v_len, p_mode, p_device, p_min_seconds, p_everyone, now() - v_back),
    'after',  public.analytics__window(p_split, p_split + v_len, p_mode, p_device, p_min_seconds, p_everyone, now())
  );
end;
$$;
revoke all on function public.analytics_compare(text, timestamptz, integer, text, text, integer, boolean) from public;
grant execute on function public.analytics_compare(text, timestamptz, integer, text, text, integer, boolean) to anon, authenticated;

-- WHO IS ASKING: this device (its anonymous id, read by the page from the
-- game's own session on this site) and this network — and whether each is
-- left out.
create or replace function public.analytics_whoami(p_token text, p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_net text := public.analytics__net();
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  return jsonb_build_object(
    'ok', true,
    'device', case when p_user_id is null then null else jsonb_build_object(
      'id', p_user_id,
      'known', exists (select 1 from public.telemetry t where t.user_id = p_user_id),
      'games', (select count(*) from public.telemetry t where t.user_id = p_user_id and t.kind = 'run_start'),
      'excluded', exists (select 1 from public.analytics_excluded e where e.user_id = p_user_id),
      'why', (select coalesce(jsonb_agg(distinct h.why), '[]'::jsonb) from public.analytics__hidden() h where h.user_id = p_user_id)) end,
    'network', case when v_net is null then null else jsonb_build_object(
      'id', v_net,
      'excluded', exists (select 1 from public.analytics_excluded_nets n where n.net = v_net),
      'devices', (select count(distinct t.user_id) from public.telemetry t where t.net = v_net)) end
  );
end;
$$;
revoke all on function public.analytics_whoami(text, uuid) from public;
grant execute on function public.analytics_whoami(text, uuid) to anon, authenticated;

-- mark (or unmark) a device as the operator's
create or replace function public.analytics_mark_device(p_token text, p_user_id uuid, p_mine boolean, p_label text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_device');
  end if;
  if coalesce(p_mine, false) then
    insert into public.analytics_excluded (user_id, label) values (p_user_id, left(nullif(btrim(coalesce(p_label, '')), ''), 60))
      on conflict (user_id) do update set label = coalesce(excluded.label, public.analytics_excluded.label);
  else
    delete from public.analytics_excluded e where e.user_id = p_user_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.analytics_mark_device(text, uuid, boolean, text) from public;
grant execute on function public.analytics_mark_device(text, uuid, boolean, text) to anon, authenticated;

-- mark (or unmark) the network this request comes from
create or replace function public.analytics_mark_network(p_token text, p_mine boolean, p_label text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_net text := public.analytics__net();
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if v_net is null then
    return jsonb_build_object('ok', false, 'reason', 'no_network');
  end if;
  if coalesce(p_mine, false) then
    insert into public.analytics_excluded_nets (net, label) values (v_net, left(nullif(btrim(coalesce(p_label, '')), ''), 60))
      on conflict (net) do update set label = coalesce(excluded.label, public.analytics_excluded_nets.label);
  else
    delete from public.analytics_excluded_nets n where n.net = v_net;
  end if;
  return jsonb_build_object('ok', true, 'network', v_net);
end;
$$;
revoke all on function public.analytics_mark_network(text, boolean, text) from public;
grant execute on function public.analytics_mark_network(text, boolean, text) to anon, authenticated;

-- the most active devices, so the operator can recognise their own (the
-- history before the network stamp lives only here). An id is shown cut to
-- 8 characters — enough to tell devices apart, and the page sends back the
-- whole id it was given for a mark. A device's GAMES and WINS come from the
-- same one-result-per-game model as every other number (everyone included):
-- a save loaded and won twice is one game and one win, never two rows.
create or replace function public.analytics_devices(p_token text, p_limit integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_net text := public.analytics__net();
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  return jsonb_build_object('ok', true, 'devices', (
    with gm as (
      select x.user_id, count(*) as games, count(*) filter (where x.result = 'won') as wins
      from public.analytics__games(null, null, null, null, true) x
      group by x.user_id
    ),
    rows_by as (
      select t.user_id, min(t.created_at) as first_at, max(t.created_at) as last_at,
             (array_agg(t.device order by t.created_at desc) filter (where t.device is not null))[1] as device,
             v_net is not null and coalesce(bool_or(t.net = v_net), false) as here,
             coalesce(bool_or(t.props->>'cards_test' = 'true'), false) as tester,
             coalesce(bool_or(t.net in (select n.net from public.analytics_excluded_nets n)), false) as on_marked_net
      from public.telemetry t
      group by t.user_id
    )
    select coalesce(jsonb_agg(x order by (x->>'games')::int desc, x->>'last' desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', r.user_id,
        'games', coalesce(gm.games, 0),
        'wins',  coalesce(gm.wins, 0),
        'first', r.first_at, 'last', r.last_at,
        'device', r.device,
        'here', r.here,
        'tester', r.tester,
        'mine', exists (select 1 from public.analytics_excluded e where e.user_id = r.user_id),
        'label', (select e.label from public.analytics_excluded e where e.user_id = r.user_id),
        'on_marked_net', r.on_marked_net) as x
      from rows_by r left join gm on gm.user_id = r.user_id
      order by coalesce(gm.games, 0) desc, r.last_at desc
      limit greatest(1, least(coalesce(p_limit, 25), 200))
    ) s));
end;
$$;
revoke all on function public.analytics_devices(text, integer) from public;
grant execute on function public.analytics_devices(text, integer) to anon, authenticated;

-- ===========================================================================
-- 5. THE FEEDBACK INBOX
-- ===========================================================================
alter table public.feedback add column if not exists status text not null default 'new';
alter table public.feedback add column if not exists note text;
alter table public.feedback add column if not exists updated_at timestamptz;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_status_check' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint feedback_status_check
      check (status in ('new', 'triaged', 'sent', 'fixed', 'wontfix'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_note_check' and conrelid = 'public.feedback'::regclass) then
    alter table public.feedback add constraint feedback_note_check
      check (note is null or char_length(note) <= 2000);
  end if;
end
$c$;
-- a report already marked handled (0009's flag) reads as fixed
update public.feedback set status = 'fixed' where handled and status = 'new';
create index if not exists feedback_status_time on public.feedback (status, created_at desc);

-- the inbox: report ROWS, behind the passphrase. Every field comes back in a
-- type the page can trust whatever a client sent (0009 only checks that
-- `details` is an object): errors an ARRAY or [], run an object of plain
-- fields or null, installed a boolean. One crafted report used to throw in
-- the page and blank every other report with it.
create or replace function public.analytics_feedback(
  p_token text, p_status text default null, p_kind text default null, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  return jsonb_build_object('ok', true, 'reports', (
    select coalesce(jsonb_agg(x order by (x->>'at') desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', f.id, 'at', f.created_at, 'kind', f.kind, 'status', f.status, 'note', f.note,
        'email', f.email, 'message', f.message, 'user', f.user_id,
        'mine', exists (select 1 from public.analytics__hidden() h where h.user_id = f.user_id),
        'name', f.details->>'name',
        'build', f.details->'report'->>'build',
        'browser', f.details->'report'->>'browser',
        'screen', f.details->'report'->>'screen',
        'installed', coalesce(jsonb_typeof(f.details->'report'->'installed') = 'boolean' and f.details->'report'->>'installed' = 'true', false),
        'run', case when jsonb_typeof(f.details->'report'->'run') = 'object' then jsonb_build_object(
                 'mode', f.details->'report'->'run'->>'mode',
                 'day', case when coalesce(f.details->'report'->'run'->>'day', '') ~ '^[0-9]{1,9}$'
                             then (f.details->'report'->'run'->>'day')::integer end,
                 'size', f.details->'report'->'run'->>'size',
                 'landform', f.details->'report'->'run'->>'landform',
                 'variant', f.details->'report'->'run'->>'variant',
                 'seed', f.details->'report'->'run'->>'seed',
                 'over', coalesce(f.details->'report'->'run'->>'over' = 'true', false)) end,
        'frame_error', f.details->'report'->>'frameError',
        'errors', case when jsonb_typeof(f.details->'report'->'errors') = 'array'
                       then f.details->'report'->'errors' else '[]'::jsonb end,
        'updated_at', f.updated_at) as x
      from public.feedback f
      where (p_status is null or (p_status = 'open' and f.status in ('new', 'triaged', 'sent')) or f.status = p_status)
        and (p_kind is null or f.kind = p_kind)
      order by f.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) s));
end;
$$;
revoke all on function public.analytics_feedback(text, text, text, integer) from public;
grant execute on function public.analytics_feedback(text, text, text, integer) to anon, authenticated;

create or replace function public.analytics_feedback_set(
  p_token text, p_id bigint, p_status text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if p_status is null or p_status not in ('new', 'triaged', 'sent', 'fixed', 'wontfix') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;
  update public.feedback f
     set status = p_status,
         note = case when p_note is null then f.note else left(nullif(btrim(p_note), ''), 2000) end,
         handled = p_status in ('fixed', 'wontfix'),
         updated_at = now()
   where f.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_report');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.analytics_feedback_set(text, bigint, text, text) from public;
grant execute on function public.analytics_feedback_set(text, bigint, text, text) to anon, authenticated;
