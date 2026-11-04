-- 0014 — THE WORLD BOARD: each chief once, your own play left out, and the
-- run's origin and its cards on the row
--
-- WHY (the operator, 2026-11-04: "make a bigger deal out of the top 3
-- players, then list everyone beneath them. Also, the analytics page allows
-- me to whitelist my IP so I don't throw the analytics stats. Please do
-- that for the leaderboard too … Just wanted people to feel a tiny bit of
-- additional pride over their placement"). The game read the board straight
-- off the table — every victory a row, the ten biggest, so one chief could
-- hold three of the ten places and the operator's own test wins stood
-- beside the players'.
--
-- WHAT.
--   0. the guard: 0005 (submit_score) and 0010 (the dashboard's list of the
--      devices left out) must be applied first — it refuses, naming them
--   1. two columns on the board: `origin`, the origin card the run was
--      founded with (a draft key such as 'warlord'), and `cards_played`, how
--      many deck cards the run played — the card mark the game has been
--      holding assisted wins back for (Backend.BOARD_MARKS_CARDS)
--   2. submit_score made again with two more parameters, p_origin and
--      p_cards_played, both optional. Every rule of 0005 is kept word for
--      word. The old six-parameter function is DROPPED first: two functions
--      of one name make PostgREST answer 300 to every post. A game from
--      before this file still posts — its six named parameters reach the
--      new function through the defaults.
--   3. board_top(p_limit, p_mode, p_days) — the board the game shows: ONE
--      ROW PER CHIEF (their best victory, the earlier of two equal scores
--      ranking higher), how many victories each has on the board, the
--      run's origin and card mark, and `mine` on the caller's own row. The
--      devices the dashboard leaves out (analytics__hidden(): a device
--      marked the operator's, one that held the card test deck, every
--      device ever seen on a network marked the operator's) are LEFT OFF,
--      retroactively — and `me` tells such a device its best is kept off
--      the board, so the operator is never left wondering where it went.
--      p_mode narrows the board to one difficulty; p_days to the victories
--      of the last so many days.
--
-- THE TABLE STAYS READABLE, as 0002 made it (an older game still reads it
-- directly while this file is new); what the game SHOWS is board_top's.
-- Nothing here is a secret: the columns are a card's key and a count.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor, after
-- 0013. One idempotent block; running it twice changes nothing. Re-pasting
-- 0005 makes the old six-parameter submit_score again BESIDE the new one —
-- paste this file again after it (it drops the old one).
--
-- WITHOUT THIS FILE the game reads the table as before and keeps one row
-- per chief itself (by name), shows everyone, and keeps holding a
-- card-assisted win off the board; it learns the file is in the first time
-- board_top answers.

do $guard$ begin
  if to_regclass('public.leaderboard') is null
     or to_regprocedure('public.submit_score(text, integer, text, integer, text, text)') is null
        and to_regprocedure('public.submit_score(text, integer, text, integer, text, text, text, integer)') is null then
    raise exception '0014_world_board.sql needs 0005_submit_score_rpc.sql applied first';
  end if;
  if to_regprocedure('public.analytics__hidden()') is null then
    raise exception '0014_world_board.sql needs 0010_dashboard.sql applied first';
  end if;
end $guard$;

-- ===========================================================================
-- 1. THE COLUMNS
-- ===========================================================================
alter table public.leaderboard add column if not exists origin text
  check (origin is null or origin ~ '^[a-z][a-z0-9_]{0,31}$');
alter table public.leaderboard add column if not exists cards_played smallint
  check (cards_played is null or cards_played between 0 and 999);
create index if not exists leaderboard_user_score_idx on public.leaderboard (user_id, score desc);

-- ===========================================================================
-- 2. submit_score — 0005's door, carrying the origin and the card mark
-- ===========================================================================
drop function if exists public.submit_score(text, integer, text, integer, text, text);

create or replace function public.submit_score(
  p_name          text,
  p_score         integer,
  p_mode          text,
  p_day           integer default null,
  p_map_seed      text    default null,
  p_game_version  text    default null,
  p_origin        text    default null,
  p_cards_played  integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid    := auth.uid();   -- reads the CALLER's JWT, not the definer
  v_mult   numeric;
  v_day    integer;
  v_cap    integer;
  v_recent integer;
  v_origin text;
  v_cards  integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- name: 1..7 visible chars (matches Score.cleanName's length rule)
  p_name := left(coalesce(p_name, ''), 7);
  if length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;

  -- mode must be one the game actually uses; it also sets the multiplier
  v_mult := case p_mode
              when 'calm'     then 0.5
              when 'moderate' then 1.0
              when 'hard'     then 1.75
              else null
            end;
  if v_mult is null then
    raise exception 'invalid mode';
  end if;

  if p_score is null or p_score < 0 then
    raise exception 'score out of range';
  end if;

  -- real wins carry a positive day; clamp so a spoofed huge day can't inflate
  -- the cap. Null -> a typical game length.
  v_day := least(greatest(coalesce(p_day, 60), 1), 2000);

  -- plausible ceiling from how scoring works (0005's words, unchanged)
  v_cap := least( ceil((8000 + 3000 * v_day) * v_mult)::integer, 250000 );
  if p_score > v_cap then
    raise exception 'score exceeds plausible maximum for day/mode';
  end if;

  -- anti-spam: at most 20 submissions per user per hour
  select count(*) into v_recent
  from public.leaderboard
  where user_id = v_uid
    and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'too many submissions, slow down';
  end if;

  -- reject an obvious duplicate (same run resubmitted)
  if exists (
    select 1 from public.leaderboard
    where user_id = v_uid
      and score = p_score
      and mode  = p_mode
      and day       is not distinct from p_day
      and map_seed  is not distinct from p_map_seed
      and created_at > now() - interval '1 day'
  ) then
    raise exception 'duplicate submission';
  end if;

  -- the two new facts are decoration: one that does not read right is left
  -- off the row, never a reason to refuse the victory
  v_origin := case when p_origin ~ '^[a-z][a-z0-9_]{0,31}$' then p_origin else null end;
  v_cards  := case when p_cards_played between 0 and 999 then p_cards_played else null end;

  -- all checks passed — write it, forcing the owner to the caller
  insert into public.leaderboard (user_id, name, score, mode, day, map_seed, game_version, origin, cards_played)
  values (v_uid, p_name, p_score, p_mode, p_day, p_map_seed, p_game_version, v_origin, v_cards);
end;
$$;

revoke all     on function public.submit_score(text, integer, text, integer, text, text, text, integer) from public;
revoke all     on function public.submit_score(text, integer, text, integer, text, text, text, integer) from anon;
grant  execute on function public.submit_score(text, integer, text, integer, text, text, text, integer) to authenticated;

-- ===========================================================================
-- 3. board_top — the board as the game shows it
-- ===========================================================================
-- { ok, rows: [{ rank, name, score, mode, day, at, origin, cards, wins, mine }],
--   me: { rank, name, score, mode, day, at, origin, cards, wins, hidden } | null,
--   players } — `players` the chiefs on this board (after the filters),
-- `me` the caller's own best on it whether or not it made the list
-- (rank null and hidden true for a device the dashboard leaves out).
create or replace function public.board_top(
  p_limit integer default 50,
  p_mode  text    default null,
  p_days  integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    select least(greatest(coalesce(p_limit, 50), 1), 100) as lim,
           case when p_mode in ('calm', 'moderate', 'hard') then p_mode else null end as md,
           case when p_days between 1 and 3650 then p_days else null end as dd,
           auth.uid() as me
  ),
  hid as (select distinct h.user_id from public.analytics__hidden() h where h.user_id is not null),
  pool as (
    select l.* from public.leaderboard l, args a
     where (a.md is null or l.mode = a.md)
       and (a.dd is null or l.created_at > now() - make_interval(days => a.dd))
  ),
  wins as (select p.user_id, count(*)::integer as n from pool p group by p.user_id),
  best as (
    select distinct on (p.user_id) p.user_id, p.name, p.score, p.mode, p.day, p.created_at, p.origin, p.cards_played
      from pool p
     order by p.user_id, p.score desc, p.created_at asc, p.id asc
  ),
  ranked as (
    select b.*, w.n as wins,
           row_number() over (order by b.score desc, b.created_at asc, b.user_id) as rk
      from best b join wins w on w.user_id = b.user_id
     where not exists (select 1 from hid where hid.user_id = b.user_id)
  )
  select jsonb_build_object(
    'ok', true,
    'players', (select count(*) from ranked),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', r.rk, 'name', r.name, 'score', r.score, 'mode', r.mode, 'day', r.day,
               'at', r.created_at, 'origin', r.origin, 'cards', r.cards_played, 'wins', r.wins,
               'mine', (r.user_id = a.me)) order by r.rk)
        from ranked r, args a where r.rk <= a.lim), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
               'rank', r.rk, 'name', b.name, 'score', b.score, 'mode', b.mode, 'day', b.day,
               'at', b.created_at, 'origin', b.origin, 'cards', b.cards_played, 'wins', w.n,
               'hidden', exists (select 1 from hid where hid.user_id = b.user_id))
        from best b join wins w on w.user_id = b.user_id
        cross join args a
        left join ranked r on r.user_id = b.user_id
       where a.me is not null and b.user_id = a.me)
  );
$$;
revoke all on function public.board_top(integer, text, integer) from public;
revoke all on function public.board_top(integer, text, integer) from anon, authenticated;
grant execute on function public.board_top(integer, text, integer) to anon, authenticated;

-- ===========================================================================
-- VERIFY (run by hand after applying; each should read as commented)
-- ===========================================================================
-- one door to post:   select count(*) from pg_proc where proname = 'submit_score';             -- 1
-- the board:          select public.board_top(10) ->> 'ok';                                    -- true
-- your devices gone:  select count(*) from public.leaderboard l
--                      where exists (select 1 from public.analytics__hidden() h where h.user_id = l.user_id);
--                      -- the rows board_top leaves off
-- the doors:          select has_function_privilege('anon', 'public.board_top(integer,text,integer)', 'execute'),
--                            has_function_privilege('anon', 'public.submit_score(text,integer,text,integer,text,text,text,integer)', 'execute');
--                      -- true, false
