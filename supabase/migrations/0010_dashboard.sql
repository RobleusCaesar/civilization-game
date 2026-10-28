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

-- every telemetry row is stamped by the server: a client cannot write its own
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
-- never 0 (counted clean). Dropped first, so a later edit may change the
-- columns: the functions that call it are created after it, below.
drop function if exists public.analytics__games(timestamptz, timestamptz, text, text, boolean);
create or replace function public.analytics__games(
  p_from timestamptz, p_to timestamptz, p_mode text, p_device text, p_everyone boolean)
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
      and (p_from is null or s.created_at >= p_from)
      and (p_to   is null or s.created_at <  p_to)
      and (p_mode   is null or s.mode   = p_mode)
      and (p_device is null or s.device = p_device)
      and not exists (select 1 from hid where hid.user_id = s.user_id)
    order by s.run_id, s.created_at, s.id
  ),
  ending as (
    -- a real ending beats a closed_tab row; of several, the latest counts
    select distinct on (e.run_id) e.*
    from public.telemetry e
    where e.kind = 'run_end' and e.run_id in (select st.run_id from starts st)
    order by e.run_id, (coalesce(e.cause, '') = 'closed_tab'), e.created_at desc, e.id desc
  )
  select s.run_id, s.user_id, s.created_at, s.mode, s.landform, s.device,
         coalesce((s.props->>'tutorial')::boolean, false),
         nullif(coalesce(e.props->>'card', s.props->>'card'), ''),
         case when coalesce(e.props->>'build', s.props->>'build') ~ '^[0-9]{1,6}$'
              then coalesce(e.props->>'build', s.props->>'build')::integer end,
         case
           when e.run_id is null then 'open'
           when e.outcome = 'win'  then 'won'
           when e.outcome = 'loss' then 'lost'
           when coalesce(e.cause, '') = 'closed_tab' then 'left'
           else 'quit'
         end,
         e.cause, e.day, e.seconds, e.score, e.tc_level, e.peak_pop,
         case when coalesce(e.props->>'cards_played', '') ~ '^[0-9]{1,4}$' then (e.props->>'cards_played')::integer else 0 end,
         case when coalesce(e.props->>'errors', '') ~ '^[0-9]{1,9}$' then (e.props->>'errors')::integer end,
         nullif(left(e.props->>'err', 160), ''),
         e.created_at
  from starts s left join ending e on e.run_id = s.run_id;
$$;
revoke all on function public.analytics__games(timestamptz, timestamptz, text, text, boolean) from public;
revoke all on function public.analytics__games(timestamptz, timestamptz, text, text, boolean) from anon, authenticated;

-- the headline numbers of one window. p_min_seconds drops games that never
-- reached that much play (a bounce is not a game); 'open' games have no
-- length and drop with it whenever it is set. The ERRORS are counted over
-- every game, the filter aside: a game that crashed in its first minute is
-- the one most worth seeing, and the filter would have dropped it.
create or replace function public.analytics__window(
  p_from timestamptz, p_to timestamptz, p_mode text, p_device text,
  p_min_seconds integer, p_everyone boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (select * from public.analytics__games(p_from, p_to, p_mode, p_device, p_everyone)),
  g as (
    select * from a
    where coalesce(p_min_seconds, 0) <= 0 or coalesce(a.seconds, 0) >= p_min_seconds
  ),
  hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  -- a player's FIRST game ever (the same devices left out), for "new"
  firsts as (
    select t.user_id, min(t.created_at) as first_at
    from public.telemetry t
    where t.kind = 'run_start' and not exists (select 1 from hid where hid.user_id = t.user_id)
    group by t.user_id
  ),
  players as (select distinct g.user_id from g),
  newbies as (
    select f.user_id, f.first_at from firsts f
    where f.user_id in (select p.user_id from players p)
      and (p_from is null or f.first_at >= p_from)
      and (p_to   is null or f.first_at <  p_to)
  ),
  -- PLAYED AGAIN: a new player who started a SECOND game within 7 days of
  -- their first (the same sitting counts — a second game is the hook).
  -- Counted only for players first seen at least 7 days ago: a week that has
  -- not happened yet is not a "no".
  ripe as (select n.* from newbies n where n.first_at <= now() - interval '7 days'),
  back as (
    select r.user_id from ripe r
    where (select count(distinct t.run_id) from public.telemetry t
           where t.user_id = r.user_id and t.kind = 'run_start' and t.run_id is not null
             and t.created_at >= r.first_at and t.created_at < r.first_at + interval '7 days') >= 2
  ),
  -- THE FIRST-GAME HOOK: each new player's FIRST game, and whether it held
  -- them for ten minutes of play. A first game with no ending row at all
  -- ('open': still running, or its rows were blocked) says nothing either
  -- way and is left out of both sides.
  first_games as (
    select f.* from (
      select distinct on (x.user_id) x.*
      from a x
      where x.user_id in (select n.user_id from newbies n)
      order by x.user_id, x.started_at
    ) f
    where f.result <> 'open'
  ),
  per_player as (select g.user_id, sum(coalesce(g.seconds, 0)) as secs from g group by g.user_id),
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
    'reports', jsonb_build_object(
      'bug',   (select count(*) from fb where kind = 'bug'),
      'crash', (select count(*) from fb where kind = 'crash'),
      'idea',  (select count(*) from fb where kind = 'idea'),
      'other', (select count(*) from fb where kind = 'other'))
  );
$$;
revoke all on function public.analytics__window(timestamptz, timestamptz, text, text, integer, boolean) from public;
revoke all on function public.analytics__window(timestamptz, timestamptz, text, text, integer, boolean) from anon, authenticated;

-- ===========================================================================
-- 4. THE DASHBOARD'S DOORS
-- ===========================================================================
-- the whole page in one call
create or replace function public.analytics_dashboard(
  p_token text, p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_device text default null,
  p_min_seconds integer default 60, p_everyone boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  with g as (
    select * from public.analytics__games(p_from, p_to, p_mode, p_device, p_everyone) x
    where coalesce(p_min_seconds, 0) <= 0 or coalesce(x.seconds, 0) >= p_min_seconds
  ),
  -- the funnel, the bounce and the errors read EVERY game, the run filter aside
  allg as (select * from public.analytics__games(p_from, p_to, p_mode, p_device, p_everyone)),
  days as (
    select d::date as day from generate_series(
      coalesce(p_from, now() - interval '30 days')::date,
      (coalesce(p_to, now()) - interval '1 second')::date, interval '1 day') d
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
                 'players', (select count(distinct g.user_id) from g where g.started_at::date = d.day),
                 'games',   (select count(*) from g where g.started_at::date = d.day),
                 'won',     (select count(*) from g where g.started_at::date = d.day and g.result = 'won'),
                 'lost',    (select count(*) from g where g.started_at::date = d.day and g.result = 'lost'))
               order by d.day), '[]'::jsonb) from days d),
    'funnel', (select jsonb_build_object(
                 'started',  count(*),
                 'minute',   count(*) filter (where coalesce(seconds, 0) >= 60),
                 'day10',    count(*) filter (where coalesce(day, 0) >= 10),
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
                 'games',   (select count(*) from public.analytics__games(p_from, p_to, p_mode, p_device, true) a
                             where a.user_id in (select user_id from hid))),
    -- WHEN EACH BUILD WENT LIVE (every row names its build from 107 on): the
    -- first row seen on it, everyone's included — the operator's own device
    -- is usually first to load a deploy, and that IS the moment. Builds
    -- before 107 carry no stamp; the page knows their moments by hand.
    'builds', (select coalesce(jsonb_object_agg(b::text, first_at), '{}'::jsonb) from (
                 select (t.props->>'build')::integer as b, min(t.created_at) as first_at
                 from public.telemetry t
                 where coalesce(t.props->>'build', '') ~ '^[0-9]{1,6}$'
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
revoke all on function public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean) from public;
grant execute on function public.analytics_dashboard(text, timestamptz, timestamptz, text, text, integer, boolean) to anon, authenticated;

-- DID THE UPDATE HELP? Two windows of EQUAL LENGTH either side of a moment
-- (a release): the same headline numbers for each. While the "after"
-- window is still running, it is what has happened so far, and the
-- "before" window is the same span a whole number of weeks earlier — so
-- the weekdays and the hours of the day line up, and a count of distinct
-- players means the same thing on both sides (a day's window counts every
-- regular afresh, a fortnight's counts them once: per-day rates of unequal
-- windows would read a short window as growth). Once the window is
-- complete it is simply the p_days before against the p_days after.
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
  v_e := least(v_days::numeric, greatest(0, extract(epoch from (now() - p_split)) / 86400.0));
  v_len := make_interval(secs => (v_e * 86400)::double precision);
  v_back := make_interval(days => 7 * greatest(1, ceil(v_e / 7.0))::integer);
  return jsonb_build_object(
    'ok', true,
    'split', p_split, 'days', v_days,
    'after_days', round(v_e, 1),
    'before_from', p_split - v_back, 'before_to', p_split - v_back + v_len, 'after_to', p_split + v_len,
    'before', public.analytics__window(p_split - v_back, p_split - v_back + v_len, p_mode, p_device, p_min_seconds, p_everyone),
    'after',  public.analytics__window(p_split, p_split + v_len, p_mode, p_device, p_min_seconds, p_everyone)
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
-- whole id it was given for a mark.
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
    select coalesce(jsonb_agg(x order by (x->>'games')::int desc, x->>'last' desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', t.user_id,
        'games', count(*) filter (where t.kind = 'run_start'),
        'wins',  count(*) filter (where t.kind = 'run_end' and t.outcome = 'win'),
        'first', min(t.created_at), 'last', max(t.created_at),
        'device', (array_agg(t.device order by t.created_at desc) filter (where t.device is not null))[1],
        'here', v_net is not null and coalesce(bool_or(t.net = v_net), false),
        'tester', coalesce(bool_or(t.props->>'cards_test' = 'true'), false),
        'mine', exists (select 1 from public.analytics_excluded e where e.user_id = t.user_id),
        'label', (select e.label from public.analytics_excluded e where e.user_id = t.user_id),
        'on_marked_net', coalesce(bool_or(t.net in (select n.net from public.analytics_excluded_nets n)), false)) as x
      from public.telemetry t
      group by t.user_id
      order by count(*) filter (where t.kind = 'run_start') desc, max(t.created_at) desc
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
        'installed', f.details->'report'->'installed',
        'run', f.details->'report'->'run',
        'frame_error', f.details->'report'->>'frameError',
        'errors', coalesce(f.details->'report'->'errors', '[]'::jsonb),
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
