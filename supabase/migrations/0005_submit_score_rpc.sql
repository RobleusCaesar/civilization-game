-- Clanfire 0005 — the leaderboard's one write path, ON THE RECORD.
--
-- This function has been live since 10 Jul 2026 (commit 4dc3995 moved the
-- client onto it) but was pasted into the SQL editor from a chat and never
-- committed, so the repo showed a client calling an RPC no migration defined.
-- Recorded here verbatim (2026-09-11) after probing the live project: a fresh
-- anonymous user reaches it, 'not authenticated' answers a call with no JWT,
-- 'score exceeds plausible maximum for day/mode' answers a 999,999, and a
-- direct INSERT on the table is refused (42501). Re-running this file is safe:
-- create-or-replace and idempotent revokes/grants; it deletes nothing.
--
-- WHAT IT ENFORCES — and what it does NOT: there is no minimum score and no
-- one-row-per-player rule. Every victory may go up, whatever its total
-- (operator ruling 2026-09-11). It refuses only
--   · a caller with no identity,
--   · an empty name (names are cut to 7),
--   · a mode the game does not have,
--   · a score above what the scoring model could produce for that day and
--     mode — (8000 + 3000·day) × multiplier, capped at 250,000 (a real win
--     lands in the low thousands to low tens of thousands),
--   · more than 20 posts from one player in an hour,
--   · the SAME run posted twice within a day (same score, mode, day, seed —
--     the name is not part of the key, so a stand-in name posted on the way
--     out cannot be followed by a chosen one for the same run, and the
--     client treats a 'duplicate submission' answer as "already up").

create or replace function public.submit_score(
  p_name         text,
  p_score        integer,
  p_mode         text,
  p_day          integer default null,
  p_map_seed     text    default null,
  p_game_version text    default null
)
returns void
language plpgsql
security definer
set search_path = ''            -- immutable search_path (no mutable-path warning)
as $$
declare
  v_uid    uuid    := auth.uid();   -- reads the CALLER's JWT, not the definer
  v_mult   numeric;
  v_day    integer;
  v_cap    integer;
  v_recent integer;
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

  -- plausible ceiling from how scoring works: one-time bonuses sit under ~8000
  -- subtotal; per-day accumulation is generously bounded at 3000 subtotal/day;
  -- times the mode multiplier, then a hard absolute ceiling. Moderate wins land
  -- ~5-10k, so this leaves 3x+ head-room for exceptional runs.
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

  -- all checks passed — write it, forcing the owner to the caller
  insert into public.leaderboard (user_id, name, score, mode, day, map_seed, game_version)
  values (v_uid, p_name, p_score, p_mode, p_day, p_map_seed, p_game_version);
end;
$$;

-- only signed-in players may call it; strip the implicit grant to everyone
revoke all     on function public.submit_score(text, integer, text, integer, text, text) from public;
grant  execute on function public.submit_score(text, integer, text, integer, text, text) to authenticated;

-- LOCK THE DIRECT WRITE PATH: the RPC is now the sole writer.
-- Keep the public SELECT policy from the RLS pass; only remove direct INSERT.
revoke insert on public.leaderboard from authenticated;
revoke insert on public.leaderboard from anon;
-- (the July paste dropped a policy by a name 0002 never used; the real one,
-- "leaderboard: own insert", is moot with the privilege gone and is left as is)
drop policy if exists leaderboard_insert_own on public.leaderboard;
