-- 0012 — A VOTE ON VIBETOPLIST EARNS A CARD
--
-- WHY (the operator, 2026-11-03: "if someone votes for our game they get a
-- card. Pick a shiny fun card (not the best cards), but one that is still
-- exciting"). VibeTopList (https://vibetoplist.com/api-docs) sends a POST and
-- a GET to our callback after every vote: secret, voted (1 on success),
-- userid (the ?ref= the game put on the vote link — the player's own id),
-- vote_id (unique per vote, for idempotent grants), userip and reset. A vote
-- is one per IP per listing every 12 hours.
--
-- HOW IT FLOWS. The game's "Vote for a card" button (the collection screen,
-- js/deckscreens.js) opens https://vibetoplist.com/vote/<slug>?ref=<uid>.
-- The vote lands; VibeTopList calls the Edge Function
-- supabase/functions/vote-callback, which checks the secret (the
-- VTL_SECRET function secret — never in this repo) and calls vote_reward()
-- below as the SERVICE ROLE. vote_reward() puts the card in the record
-- (card_collection, 0008); the game's next Deck.sync reconciles it onto the
-- device and claim_vote_notes() tells the player, once.
--
-- THE CARD: Swift Raiders (Iron, Rare) — vote_card() below, the one place
-- it is named on the server (the game's twin is CFG.CARDS.VOTE.CARD). A
-- mounted war party with a landing worth watching; never Imperial or
-- Enlightenment. AT MOST ONE A VOTE AND ONE EVERY vote_gap() (11 hours —
-- the site's own 12-hour cooldown with an hour of slack for its clock), so
-- a player voting from two networks earns one card, not two.
--
-- WHAT. 1. vote_card() and vote_gap(), the two numbers. 2. card_votes, one
-- row per vote_id (the idempotency key: the site's POST and GET for one vote
-- arrive together, and it may retry). 3. vote_reward(), the service role's
-- door. 4. claim_vote_notes(), the player's door: the votes not yet told,
-- told once.
--
-- SEALED BY DEFAULT, like 0008: RLS on, no policy, every privilege revoked
-- from anon and authenticated by name; vote_reward() is granted to
-- service_role ALONE (a player who could call it could mint cards), and
-- claim_vote_notes() to authenticated, reading auth.uid() itself. The
-- voter's IP is never stored.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor, after
-- 0011. One idempotent block; running it twice changes nothing. It needs
-- 0008 (it refuses by name without it). 0008 and 0011 are untouched, and
-- re-pasting either leaves this file's work standing.
--
-- WITHOUT THIS FILE the callback answers an error the site does not read
-- (it fires and forgets), no card is granted, and the game's thank-you RPC
-- is a 404 it ignores.

do $guard$ begin
  if to_regclass('public.card_collection') is null or to_regclass('public.card_catalog') is null then
    raise exception '0012_vote_reward.sql needs 0008_cards.sql applied first';
  end if;
end $guard$;

-- ===========================================================================
-- 1. THE TWO NUMBERS
-- ===========================================================================
create or replace function public.vote_card()
returns text language sql immutable set search_path = '' as $$ select 'swift_raiders'::text $$;
create or replace function public.vote_gap()
returns interval language sql immutable set search_path = '' as $$ select interval '11 hours' $$;
revoke all on function public.vote_card() from public;
revoke all on function public.vote_card() from anon, authenticated;
revoke all on function public.vote_gap() from public;
revoke all on function public.vote_gap() from anon, authenticated;

-- ===========================================================================
-- 2. THE LEDGER — one row per vote the site reported
-- ===========================================================================
create table if not exists public.card_votes (
  vote_id    text primary key check (char_length(vote_id) between 1 and 64),
  ref        text check (ref is null or char_length(ref) <= 64),
  user_id    uuid references auth.users (id) on delete cascade,
  card_key   text references public.card_catalog (card_key),
  result     text not null check (result in ('granted', 'too_soon', 'unknown_player', 'no_card')),
  told_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists card_votes_user on public.card_votes (user_id, created_at);
alter table public.card_votes enable row level security;
revoke all on table public.card_votes from public;
revoke all on table public.card_votes from anon, authenticated;

-- ===========================================================================
-- 3. vote_reward — the service role's door (the Edge Function calls it)
-- ===========================================================================
-- { ok:true, granted:true, card } on a grant; { ok:true, granted:false,
-- reason } on a vote that earns nothing (too soon, a ref that is no player,
-- the card retired); { ok:true, already:true } for a vote_id seen before;
-- { ok:false, reason:'bad_vote' } for a vote with no id.
create or replace function public.vote_reward(p_ref text, p_vote_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_ref  text := left(btrim(coalesce(p_ref, '')), 64);
  v_vote text := btrim(coalesce(p_vote_id, ''));
  v_card text := public.vote_card();
  v_last timestamptz;
  v_res  text;
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

  -- the deck's own lock (0008's doors take the same one), so a vote never
  -- races a grant or a play, and the site's POST and GET queue up here
  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));
  select v.result into v_res from public.card_votes v where v.vote_id = v_vote;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'result', v_res);
  end if;

  if not exists (select 1 from public.card_catalog c where c.card_key = v_card and c.active) then
    insert into public.card_votes (vote_id, ref, user_id, result) values (v_vote, v_ref, v_uid, 'no_card');
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'no_card');
  end if;
  select max(v.created_at) into v_last from public.card_votes v
   where v.user_id = v_uid and v.result = 'granted';
  if v_last is not null and v_last > now() - public.vote_gap() then
    insert into public.card_votes (vote_id, ref, user_id, result) values (v_vote, v_ref, v_uid, 'too_soon');
    return jsonb_build_object('ok', true, 'granted', false, 'reason', 'too_soon',
      'next_at', floor(extract(epoch from v_last + public.vote_gap()) * 1000)::bigint);
  end if;

  insert into public.card_votes (vote_id, ref, user_id, card_key, result)
  values (v_vote, v_ref, v_uid, v_card, 'granted');
  insert into public.card_collection (user_id, card_key, qty) values (v_uid, v_card, 1)
  on conflict (user_id, card_key) do update
    set qty = least(public.card_collection.qty + 1, 999), updated_at = now();
  return jsonb_build_object('ok', true, 'granted', true, 'card', v_card);
end;
$$;
revoke all on function public.vote_reward(text, text) from public;
revoke all on function public.vote_reward(text, text) from anon, authenticated;
grant execute on function public.vote_reward(text, text) to service_role;

-- ===========================================================================
-- 4. claim_vote_notes — the player's door: what their votes did, told once
-- ===========================================================================
-- { ok:true, notes:[{ result, card, at }] } — every granted or too-soon
-- vote of this player not yet told, oldest first, and marks them told.
create or replace function public.claim_vote_notes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_notes jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  with told as (
    update public.card_votes v set told_at = now()
     where v.user_id = v_uid and v.told_at is null and v.result in ('granted', 'too_soon')
    returning v.result, v.card_key, v.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('result', t.result, 'card', t.card_key,
           'at', floor(extract(epoch from t.created_at) * 1000)::bigint) order by t.created_at), '[]'::jsonb)
    into v_notes from told t;
  return jsonb_build_object('ok', true, 'notes', v_notes);
end;
$$;
revoke all on function public.claim_vote_notes() from public;
revoke all on function public.claim_vote_notes() from anon, authenticated;
grant execute on function public.claim_vote_notes() to authenticated;
