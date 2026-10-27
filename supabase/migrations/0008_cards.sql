-- 0008 — THE CARDS: the collection's record, its ledgers, its telemetry and
-- its dashboard
--
-- WHY. Win or lose, a finished game grants a card (js/deck.js). The game keeps
-- the collection ON THE DEVICE — read at once, playable offline — and queues
-- every change it makes for the cloud: { op:'starter' } (the three Stone
-- cards every new player is dealt once), { op:'grant', run, cards, outcome }
-- (the card a finished run earned) and { op:'consume', card, play } (a card
-- played, and gone for good). Until now there was nowhere to send them, and
-- the two telemetry rows the deck sends (card_granted, card_played) were
-- REFUSED by the 0003 check constraint — silently, because Backend._emit
-- never reads an answer.
--
-- WHAT.
--   0. THE NUMBERS: card_loss_min_deeds(), how many deeds a LOSS needs, and
--      card_pity_wins(), the wins before an Enlightenment card is due
--   1. telemetry.kind admits card_granted and card_played
--   2. the server's copy of the catalog and the drop tables, re-seeded to
--      exactly what this file says every time it runs
--   3. the record — card_collection (per player per card), card_grants (one
--      row per granted card, at most two per run), card_plays (one row per
--      play), card_starter (the starter hand, once per player) and
--      card_refusals (what the server turned away, for the dashboard)
--   4-7. the four doors Deck.sync walks through: grant_card, consume_card,
--      claim_starter_hand, my_cards
--   8. report_run_end — a run_end the game could not send at the time,
--      delivered once (the evidence a grant waits on)
--   9. analytics_cards — the dashboard's Cards section
--
-- THE EARN RULE, re-checked here (the client's half is Deck.eligible):
--   * a WIN always earns;
--   * a LOSS earns only when the run_end row's props.deeds reaches
--     card_loss_min_deeds() (section 0 — the one place the number lives);
--   * a struck banner (outcome 'abandoned') or a closed tab earns nothing.
-- The evidence is the run_end row the game itself sent for THAT player and
-- THAT run_id. It is friction, not proof — a client can write its own
-- telemetry rows, exactly as with the board (0005) and the competition
-- (0004) — and it is bounded by the hourly cap in grant_card.
--
-- THE SHAPE OF AN ANSWER. Every card RPC answers jsonb { ok:true, … } or
-- { ok:false, reason:'…' }. Never an 'error' key: Backend's transport reads
-- a top-level 'error' as a supabase-js failure and would retry a refusal as
-- if the network had dropped. Deck.sync drops an op answered ok (or ok with
-- already:true — a duplicate), keeps one answered 'no_run' (the run_end row
-- is still in flight) or 'not_authenticated' / 'slow_down', and drops any
-- other refusal for good: the next reconcile against my_cards() then shows
-- the player what the server actually holds (and the game SAYS so, once, for
-- a card the ceremony granted). An HTTP 4xx that is not "not yet" (a type
-- error, a unique violation) is that op's own fault: it is stepped past and
-- given up after a day of tries — never while the server refuses everything.
--
-- SEALED BY DEFAULT. Every table here has RLS on, NO policy, and every
-- direct privilege revoked from anon and authenticated (Supabase's default
-- privileges grant all on a new table to both). The only ways in are the
-- SECURITY DEFINER functions below, each of which reads auth.uid() itself.
-- Foreign keys point at auth.users, never at profiles: "profiles: own delete"
-- (0001) cascades, and a ledger that cascades from profiles is a ledger the
-- player can wipe (the starter hand claimed twice, a card granted twice).
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor, after
-- 0007. It is ONE idempotent block: every table IF NOT EXISTS, every index
-- IF NOT EXISTS, every function CREATE OR REPLACE with a signature new in
-- this file (the scratch drafts' signatures are dropped first, so no
-- overload can ever answer PostgREST's 300), every constraint dropped before
-- it is made, and the catalog and drop tables re-seeded to exactly what the
-- file says. Running it twice in a row changes nothing the second time.
-- analytics_summary is NOT touched: 0007 stands exactly as it is, and the
-- dashboard's Cards section calls its own function (section 9).
--
-- WITHOUT THIS MIGRATION the game still plays: the deck lives on the device,
-- Deck.sync keeps every op it cannot deliver (an unknown RPC is a 404, which
-- it reads as "not reached"), and the dashboard's Cards section says the
-- migration is still to be applied.

-- ===========================================================================
-- 0. THE ONE NUMBER — how many deeds a LOSS must carry to earn a card
-- ===========================================================================
-- Change the 5 and run this one statement again; grant_card reads it on
-- every call. The client's half (Deck.eligible) must ask for the same number
-- or a loss it rewards is refused here and the card leaves the collection at
-- the next reconcile.
create or replace function public.card_loss_min_deeds()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;
revoke all on function public.card_loss_min_deeds() from public;
revoke all on function public.card_loss_min_deeds() from anon, authenticated;

-- …and THE PITY NUMBER: wins without an Enlightenment card before one is
-- guaranteed (CFG.CARDS.PITY — tests/deck-sync.mjs holds the two equal).
-- grant_card reads it to allow the pity card on a win whose own table can
-- never roll the tier (a Calm win) — and only when the ledger's own pity
-- count says it is due.
create or replace function public.card_pity_wins()
returns integer
language sql
immutable
set search_path = ''
as $$ select 15 $$;
revoke all on function public.card_pity_wins() from public;
revoke all on function public.card_pity_wins() from anon, authenticated;

-- ===========================================================================
-- 1. TELEMETRY — the deck's two rows are admitted
-- ===========================================================================
-- Deck.track sends kind 'card_granted' (one row per card a run earned) and
-- 'card_played' (one row per play) through Backend._emit. 0003 declared the
-- kind check inline, so its name is Postgres's own (telemetry_kind_check);
-- every check on the table that names `kind` is dropped by catalogue lookup
-- rather than by that guessed name, then the one rule is made again — so
-- this section is safe to run any number of times. analytics_summary is
-- unaffected where it matters: every count it makes of runs and sessions
-- filters by kind; the two new kinds join only its raw 'events' total.
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
  check (kind in ('run_start', 'run_end', 'session', 'card_granted', 'card_played'));

-- ===========================================================================
-- 2. THE CATALOG — the server's copy of Deck.CATALOG's ids and tiers, and of
--    CFG.CARDS.DROPS's tiers (tests/deck-sync.mjs holds the three in step)
-- ===========================================================================
create table if not exists public.card_catalog (
  card_key    text primary key check (card_key ~ '^[a-z0-9_]{1,40}$'),
  tier        text not null check (tier in ('stone', 'bronze', 'iron', 'imperial', 'enlight')),
  starter_qty smallint not null default 0 check (starter_qty between 0 and 9),
  active      boolean not null default true
);
alter table public.card_catalog enable row level security;
revoke all on table public.card_catalog from public;
revoke all on table public.card_catalog from anon, authenticated;

-- the 36 cards. A card no longer listed here is RETIRED, never deleted (a
-- player may still hold one): inactive, so it is neither granted nor shown.
with seed (card_key, tier, starter_qty) as (values
  ('forager_cache', 'stone', 1), ('fallen_timber', 'stone', 1), ('loose_stone', 'stone', 0),
  ('gold_nugget', 'stone', 0), ('willing_hands', 'stone', 1), ('scouts_fire', 'stone', 0),
  ('quick_hands', 'stone', 0), ('mending', 'stone', 0),
  ('trade_caravan', 'bronze', 0), ('harvest_festival', 'bronze', 0), ('war_band', 'bronze', 0),
  ('hunters_pack', 'bronze', 0), ('watchfires', 'bronze', 0), ('master_builders', 'bronze', 0),
  ('pathfinders_map', 'bronze', 0), ('bountiful_land', 'bronze', 0),
  ('swift_raiders', 'iron', 0), ('iron_legion', 'iron', 0), ('siege_train', 'iron', 0),
  ('veterans', 'iron', 0), ('stone_skin', 'iron', 0), ('spy_hall', 'iron', 0), ('blight', 'iron', 0),
  ('legion_marches', 'imperial', 0), ('golden_age', 'imperial', 0), ('age_of_marble', 'imperial', 0),
  ('trebuchet_battery', 'imperial', 0), ('starfall', 'imperial', 0), ('krakens_call', 'imperial', 0),
  ('barbarian_pact', 'imperial', 0),
  ('dragonfire', 'enlight', 0), ('swallowed_sun', 'enlight', 0), ('enlightenment', 'enlight', 0),
  ('unbreakable_hall', 'enlight', 0), ('wonders_foundation', 'enlight', 0), ('ancestors_host', 'enlight', 0)
),
up as (
  insert into public.card_catalog (card_key, tier, starter_qty, active)
  select s.card_key, s.tier, s.starter_qty, true from seed s
  on conflict (card_key) do update
    set tier = excluded.tier, starter_qty = excluded.starter_qty, active = true
  returning card_key
)
update public.card_catalog c set active = false, starter_qty = 0
 where not exists (select 1 from seed s where s.card_key = c.card_key);

-- which tiers each ending can roll: a 0% tier in CFG.CARDS.DROPS can never
-- come out of the table ([stone, bronze, iron, imperial, enlight]):
--   loss [85,15,0,0,0] · calm [40,40,17,3,0] · moderate [0,35,40,20,5] ·
--   hard [0,0,30,45,25]. The pity card (card_pity_wins() wins without a
-- legend) is an Enlightenment card on any win, which grant_card allows on a
-- table that cannot roll it only when the ledger's pity count says it is due.
create table if not exists public.card_drop_tiers (
  tbl  text not null check (tbl in ('loss', 'calm', 'moderate', 'hard')),
  tier text not null check (tier in ('stone', 'bronze', 'iron', 'imperial', 'enlight')),
  primary key (tbl, tier)
);
alter table public.card_drop_tiers enable row level security;
revoke all on table public.card_drop_tiers from public;
revoke all on table public.card_drop_tiers from anon, authenticated;
delete from public.card_drop_tiers;
insert into public.card_drop_tiers (tbl, tier) values
  ('loss', 'stone'), ('loss', 'bronze'),
  ('calm', 'stone'), ('calm', 'bronze'), ('calm', 'iron'), ('calm', 'imperial'),
  ('moderate', 'bronze'), ('moderate', 'iron'), ('moderate', 'imperial'), ('moderate', 'enlight'),
  ('hard', 'iron'), ('hard', 'imperial'), ('hard', 'enlight');

-- ===========================================================================
-- 3. THE RECORD
-- ===========================================================================
-- per player per card: how many they hold (never below zero, never above
-- 999) and when they first held one (the collection's "discovered")
create table if not exists public.card_collection (
  user_id    uuid not null references auth.users (id) on delete cascade,
  card_key   text not null references public.card_catalog (card_key),
  qty        integer not null default 0 check (qty between 0 and 999),
  first_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_key)
);
alter table public.card_collection enable row level security;
revoke all on table public.card_collection from public;
revoke all on table public.card_collection from anon, authenticated;

-- one row per GRANTED CARD: (player, run, slot) is unique and slot is 0 or 1,
-- so a run pays at most twice (the great victory's second card) and never
-- again. The run's own numbers are copied from its run_end row at the moment
-- of the grant, so the dashboard can split grants without a join.
create table if not exists public.card_grants (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  run_id       text not null check (char_length(run_id) between 1 and 64),
  slot         smallint not null check (slot between 0 and 1),
  card_key     text not null references public.card_catalog (card_key),
  tier         text not null,
  outcome      text not null check (outcome in ('win', 'loss')),
  cause        text,
  mode         text,
  landform     text,
  device       text,
  game_version text,
  day          integer,
  seconds      integer,
  score        integer,
  deeds        integer,
  created_at   timestamptz not null default now(),
  unique (user_id, run_id, slot)
);
alter table public.card_grants enable row level security;
revoke all on table public.card_grants from public;
revoke all on table public.card_grants from anon, authenticated;
create index if not exists card_grants_created_idx on public.card_grants (created_at desc);
create index if not exists card_grants_run_idx     on public.card_grants (run_id);

-- one row per PLAY, keyed on the client's play uuid: a retried consume (an
-- answer lost on the way back) spends nothing
create table if not exists public.card_plays (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  play_id    text not null check (char_length(play_id) between 1 and 64),
  card_key   text not null references public.card_catalog (card_key),
  tier       text,
  run_id     text check (run_id is null or char_length(run_id) between 1 and 64),
  day        integer check (day is null or (day >= 0 and day <= 100000)),
  created_at timestamptz not null default now(),
  unique (user_id, play_id)
);
alter table public.card_plays enable row level security;
revoke all on table public.card_plays from public;
revoke all on table public.card_plays from anon, authenticated;
create index if not exists card_plays_created_idx on public.card_plays (created_at desc);
create index if not exists card_plays_run_idx     on public.card_plays (run_id);

-- the starter hand, once per player — its own sealed table, never a column
-- on profiles ("profiles: own update" would let the client clear it)
create table if not exists public.card_starter (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.card_starter enable row level security;
revoke all on table public.card_starter from public;
revoke all on table public.card_starter from anon, authenticated;

-- what the server turned away for good (never 'no_run', which is only "not
-- yet"): the dashboard's early warning that the client and the server
-- disagree about who earns what. Capped per player per hour by the writer.
create table if not exists public.card_refusals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  op         text not null,
  reason     text not null,
  run_id     text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.card_refusals enable row level security;
revoke all on table public.card_refusals from public;
revoke all on table public.card_refusals from anon, authenticated;
create index if not exists card_refusals_created_idx on public.card_refusals (created_at desc);

-- the scratch drafts' signatures, should either ever have been pasted in:
-- left beside the functions below they would be OVERLOADS, and PostgREST
-- answers an ambiguous call with 300 (the 0006 lesson)
drop function if exists public.grant_card(text);
drop function if exists public.grant_card(text, text[]);
drop function if exists public.consume_card(text, text);

-- a refusal, written down and answered. Internal: only the definer
-- functions below call it (they run as its owner); no client may.
create or replace function public.card_refuse(
  p_uid uuid, p_op text, p_reason text, p_run_id text, p_detail jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_uid is not null and (select count(*) from public.card_refusals r
       where r.user_id = p_uid and r.created_at > now() - interval '1 hour') < 60 then
    insert into public.card_refusals (user_id, op, reason, run_id, detail)
    values (p_uid, left(p_op, 16), left(p_reason, 32), left(p_run_id, 64), coalesce(p_detail, '{}'::jsonb));
  end if;
  return jsonb_build_object('ok', false, 'reason', p_reason);
end;
$$;
revoke all on function public.card_refuse(uuid, text, text, text, jsonb) from public;
revoke all on function public.card_refuse(uuid, text, text, text, jsonb) from anon, authenticated;

-- the PITY COUNT, in one place (grant_card and my_cards both ask it): the
-- winning runs on this player's ledger since the last run that granted a
-- legend — the client's own rule, re-derived. In ledger ORDER (the
-- identity), never by timestamp: two grants in one transaction share now(),
-- and a tie would hide a win from the count. Internal: only the definer
-- functions call it.
create or replace function public.card_pity_of(p_uid uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with runs as (
    select g.run_id, max(g.id) as at, bool_or(g.tier = 'enlight') as legend,
           bool_and(g.outcome = 'win') as win
      from public.card_grants g where g.user_id = p_uid group by g.run_id
  )
  select count(*)::integer from runs r
   where r.win and r.at > coalesce((select max(l.at) from runs l where l.legend), 0)
$$;
revoke all on function public.card_pity_of(uuid) from public;
revoke all on function public.card_pity_of(uuid) from anon, authenticated;

-- ===========================================================================
-- 4. grant_card — the queue's { op:'grant', run, cards, outcome }
-- ===========================================================================
-- In order: who (auth.uid()), what (shape), NEVER TWICE (a grant already on
-- the ledger answers ok + already with the cards it paid — a lost answer is
-- safe to retry), THE EVIDENCE (the run's real run_end row, this player's,
-- never the provisional closed_tab, an ending with the grant's own outcome
-- first — missing is 'no_run', "ask again later"), THE EARN RULE, THE CARDS
-- (each a live card of a tier that ending can roll — the pity card when the
-- ledger says it is due — a second card only on a win), the hourly cap, and
-- only then the ledger rows and the collection. It never writes telemetry:
-- the evidence is what the game sent, never what the grant says.
create or replace function public.grant_card(p_run_id text, p_cards text[], p_outcome text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_prev  jsonb;
  v_end   record;
  v_deeds integer;
  v_tbl   text;
  v_bad   text;
  v_n     integer;
  v_i     integer;
  v_tier  text;
  v_pity  integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_run_id is null or char_length(p_run_id) not between 1 and 64
     or p_cards is null or cardinality(p_cards) not between 1 and 2
     or p_outcome is null or p_outcome not in ('win', 'loss') then
    return public.card_refuse(v_uid, 'grant', 'bad_input', p_run_id,
      jsonb_build_object('cards', to_jsonb(p_cards), 'outcome', p_outcome));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- NEVER TWICE
  select jsonb_agg(g.card_key order by g.slot) into v_prev
    from public.card_grants g where g.user_id = v_uid and g.run_id = p_run_id;
  if v_prev is not null then
    return jsonb_build_object('ok', true, 'already', true, 'cards', v_prev);
  end if;

  -- THE EVIDENCE: a REAL ending this player sent for this run, the one
  -- whose outcome is the grant's first, then the latest. A continued save
  -- that ends again ends the same run, and the Load screen is the player's
  -- right: a win earned offline whose grant is delivered after an earlier
  -- save of the same run was lost online is still a win on the record — a
  -- matching ending must still exist, for this player and this run.
  select t.outcome, t.cause, t.mode, t.landform, t.device, t.game_version,
         t.day, t.seconds, t.score, t.props
    into v_end
    from public.telemetry t
   where t.user_id = v_uid and t.run_id = p_run_id and t.kind = 'run_end'
     and coalesce(t.cause, '') <> 'closed_tab'
   order by (coalesce(t.outcome, '') = p_outcome) desc, t.id desc
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_run');
  end if;
  if v_end.outcome is null or v_end.outcome not in ('win', 'loss') then
    return public.card_refuse(v_uid, 'grant', 'not_finished', p_run_id,
      jsonb_build_object('outcome', v_end.outcome, 'cause', v_end.cause));
  end if;
  if v_end.outcome <> p_outcome then
    return public.card_refuse(v_uid, 'grant', 'outcome_mismatch', p_run_id,
      jsonb_build_object('sent', p_outcome, 'row', v_end.outcome));
  end if;

  -- THE EARN RULE: a win always; a loss by its deeds (section 0)
  v_deeds := case
    when jsonb_typeof(v_end.props -> 'deeds') = 'number'
      then least(greatest(floor((v_end.props ->> 'deeds')::numeric), 0), 1000000)::integer
    when (v_end.props ->> 'deeds') ~ '^[0-9]{1,7}$'
      then (v_end.props ->> 'deeds')::integer
    else 0 end;
  if v_end.outcome = 'loss' and v_deeds < public.card_loss_min_deeds() then
    return public.card_refuse(v_uid, 'grant', 'not_earned', p_run_id,
      jsonb_build_object('deeds', v_deeds, 'need', public.card_loss_min_deeds()));
  end if;

  -- THE CARDS
  if cardinality(p_cards) = 2 and v_end.outcome <> 'win' then
    return public.card_refuse(v_uid, 'grant', 'bad_cards', p_run_id,
      jsonb_build_object('cards', to_jsonb(p_cards), 'why', 'two cards on a loss'));
  end if;
  v_tbl := case when v_end.outcome = 'win'
                then (case when v_end.mode in ('calm', 'moderate', 'hard') then v_end.mode else 'moderate' end)
                else 'loss' end;
  -- THE PITY CARD: an Enlightenment card on a win whose own table cannot
  -- roll the tier, only when the ledger says it is due — one win of slack,
  -- for a grant whose evidence never landed and so never reached the count
  v_pity := public.card_pity_of(v_uid);
  select string_agg(k.card_key, ',') into v_bad
    from unnest(p_cards) as k(card_key)
    left join public.card_catalog c on c.card_key = k.card_key and c.active
   where c.card_key is null
      or not (exists (select 1 from public.card_drop_tiers d where d.tbl = v_tbl and d.tier = c.tier)
              or (v_end.outcome = 'win' and c.tier = 'enlight'
                  and v_pity >= public.card_pity_wins() - 1));
  if v_bad is not null then
    return public.card_refuse(v_uid, 'grant', 'bad_cards', p_run_id,
      jsonb_build_object('cards', to_jsonb(p_cards), 'table', v_tbl, 'bad', v_bad));
  end if;

  -- THE CAP, in the 0005 spirit: twelve granted runs an hour is already
  -- more than anyone plays; past it the op waits and tries again
  select count(distinct g.run_id) into v_n from public.card_grants g
   where g.user_id = v_uid and g.created_at > now() - interval '1 hour';
  if v_n >= 12 then
    return jsonb_build_object('ok', false, 'reason', 'slow_down');
  end if;

  for v_i in 1 .. cardinality(p_cards) loop
    select c.tier into v_tier from public.card_catalog c where c.card_key = p_cards[v_i];
    insert into public.card_grants (user_id, run_id, slot, card_key, tier, outcome, cause, mode,
                                    landform, device, game_version, day, seconds, score, deeds)
    values (v_uid, p_run_id, v_i - 1, p_cards[v_i], v_tier, v_end.outcome, v_end.cause, v_end.mode,
            v_end.landform, v_end.device, v_end.game_version, v_end.day, v_end.seconds, v_end.score, v_deeds);
    insert into public.card_collection (user_id, card_key, qty) values (v_uid, p_cards[v_i], 1)
    on conflict (user_id, card_key) do update
      set qty = least(public.card_collection.qty + 1, 999), updated_at = now();
  end loop;
  return jsonb_build_object('ok', true, 'cards', to_jsonb(p_cards));
end;
$$;
revoke all on function public.grant_card(text, text[], text) from public;
revoke all on function public.grant_card(text, text[], text) from anon, authenticated;
grant execute on function public.grant_card(text, text[], text) to authenticated;

-- ===========================================================================
-- 5. consume_card — the queue's { op:'consume', card, play, run, day }
-- ===========================================================================
-- Idempotent on the play uuid; never below zero ('none_left' when the
-- record holds none — the client then drops the op and the reconcile shows
-- the truth).
create or replace function public.consume_card(
  p_card_key text, p_play_id text, p_run_id text default null, p_day integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_left integer;
  v_tier text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_card_key is null or p_play_id is null or char_length(p_play_id) not between 1 and 64 then
    return public.card_refuse(v_uid, 'consume', 'bad_input', p_run_id,
      jsonb_build_object('card', p_card_key, 'play', p_play_id));
  end if;
  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));
  if exists (select 1 from public.card_plays p where p.user_id = v_uid and p.play_id = p_play_id) then
    select c.qty into v_left from public.card_collection c
     where c.user_id = v_uid and c.card_key = p_card_key;
    return jsonb_build_object('ok', true, 'already', true, 'left', coalesce(v_left, 0));
  end if;
  select c.tier into v_tier from public.card_catalog c where c.card_key = p_card_key;
  if not found then
    return public.card_refuse(v_uid, 'consume', 'bad_card', p_run_id, jsonb_build_object('card', p_card_key));
  end if;
  update public.card_collection c set qty = c.qty - 1, updated_at = now()
   where c.user_id = v_uid and c.card_key = p_card_key and c.qty > 0
  returning c.qty into v_left;
  if not found then
    return public.card_refuse(v_uid, 'consume', 'none_left', p_run_id, jsonb_build_object('card', p_card_key));
  end if;
  insert into public.card_plays (user_id, play_id, card_key, tier, run_id, day)
  values (v_uid, p_play_id, p_card_key, v_tier, left(p_run_id, 64),
          least(greatest(coalesce(p_day, 0), 0), 100000));
  return jsonb_build_object('ok', true, 'left', v_left);
end;
$$;
revoke all on function public.consume_card(text, text, text, integer) from public;
revoke all on function public.consume_card(text, text, text, integer) from anon, authenticated;
grant execute on function public.consume_card(text, text, text, integer) to authenticated;

-- ===========================================================================
-- 6. claim_starter_hand — the queue's { op:'starter' }, once per player.
--    The hand is the CATALOG's (starter_qty), never whatever the client sends.
-- ===========================================================================
create or replace function public.claim_starter_hand()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_new   uuid;
  v_cards jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  insert into public.card_starter (user_id) values (v_uid)
  on conflict (user_id) do nothing
  returning user_id into v_new;
  if v_new is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into public.card_collection (user_id, card_key, qty)
  select v_uid, c.card_key, c.starter_qty from public.card_catalog c
   where c.active and c.starter_qty > 0
  on conflict (user_id, card_key) do update
    set qty = least(public.card_collection.qty + excluded.qty, 999), updated_at = now();
  select coalesce(jsonb_agg(c.card_key order by c.card_key), '[]'::jsonb) into v_cards
    from public.card_catalog c where c.active and c.starter_qty > 0;
  return jsonb_build_object('ok', true, 'cards', v_cards);
end;
$$;
revoke all on function public.claim_starter_hand() from public;
revoke all on function public.claim_starter_hand() from anon, authenticated;
grant execute on function public.claim_starter_hand() to authenticated;

-- ===========================================================================
-- 7. my_cards — the record the device mirror reconciles against
-- ===========================================================================
-- counts (live cards held), seen (first held, epoch ms — the collection's
-- "discovered" survives a new device), the starter hand, the pity count
-- (winning runs since the last run that granted a legend — the client's own
-- rule, re-derived from the ledger), and the live WINNING MEDIANS per
-- difficulty that Deck.medianDay asks for (aggregate only, over every
-- player's wins in the last 90 days, and only where there are at least ten).
-- The uid is echoed so the client can refuse an answer that arrives for a
-- player who is no longer signed in.
create or replace function public.my_cards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pity integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  v_pity := public.card_pity_of(v_uid);
  return jsonb_build_object(
    'ok', true,
    'uid', v_uid,
    'counts', coalesce((select jsonb_object_agg(c.card_key, c.qty)
                          from public.card_collection c
                          join public.card_catalog k on k.card_key = c.card_key and k.active
                         where c.user_id = v_uid and c.qty > 0), '{}'::jsonb),
    'seen', coalesce((select jsonb_object_agg(c.card_key, floor(extract(epoch from c.first_at) * 1000)::bigint)
                        from public.card_collection c
                        join public.card_catalog k on k.card_key = c.card_key and k.active
                       where c.user_id = v_uid), '{}'::jsonb),
    'starter', exists (select 1 from public.card_starter s where s.user_id = v_uid),
    'starter_at', (select floor(extract(epoch from s.claimed_at) * 1000)::bigint
                     from public.card_starter s where s.user_id = v_uid),
    'pity', v_pity,
    'grants', (select count(distinct g.run_id) from public.card_grants g where g.user_id = v_uid),
    'plays', (select count(*) from public.card_plays p where p.user_id = v_uid),
    'medians', (select coalesce(jsonb_object_agg(m.mode, m.med), '{}'::jsonb) from (
                  select t.mode, round(percentile_cont(0.5) within group (order by t.day)) as med
                    from public.telemetry t
                   where t.kind = 'run_end' and t.outcome = 'win'
                     and t.mode in ('calm', 'moderate', 'hard')
                     and t.created_at > now() - interval '90 days'
                   group by t.mode
                  having count(*) >= 10) m)
  );
end;
$$;
revoke all on function public.my_cards() from public;
revoke all on function public.my_cards() from anon, authenticated;
grant execute on function public.my_cards() to authenticated;

-- ===========================================================================
-- 8. report_run_end — the evidence a grant waits on, delivered ONCE
-- ===========================================================================
-- A run_end can fail to land two ways: the boot never signed in (no identity
-- to send it under), or the request died (a dead network at the moment of
-- victory). Its card then answered 'no_run' forever. The game now keeps that
-- one row on the device and sends it here when it can (Backend.flushEnds).
-- It is inserted ONLY if no real ending for (this player, this run) WITH
-- THIS OUTCOME is already on the table — a retry can never make a second
-- ending for 0007's dashboard to count twice — and props.late marks it. An
-- ending with another outcome is a different ending (a save of the run
-- loaded and finished another way), which online would have landed by
-- itself. A closed_tab row is provisional by definition and is never
-- accepted here.
create or replace function public.report_run_end(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_run text := p_row ->> 'run_id';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' or v_run is null
     or char_length(v_run) not between 1 and 64
     or coalesce(p_row ->> 'cause', '') = 'closed_tab' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));
  -- a RETRY never makes a second ending (0007's real_ends is not deduped by
  -- run_id — the dashboard would count it twice): an ending of this run
  -- with THIS outcome already on the table is this row, landed. An ending
  -- with another outcome is another ending — a save of the same run loaded
  -- and finished differently, which online would have landed on its own.
  if exists (select 1 from public.telemetry t
              where t.user_id = v_uid and t.run_id = v_run and t.kind = 'run_end'
                and coalesce(t.cause, '') <> 'closed_tab'
                and coalesce(t.outcome, '') = coalesce(p_row ->> 'outcome', '')) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  -- telemetry.user_id references profiles: a player who never got as far as
  -- ensureProfile still owns their own row
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  begin
    insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, landform, size, device,
                                  game_version, day, seconds, tc_level, peak_pop, score, props)
    values (v_uid, v_run, 'run_end',
            p_row ->> 'outcome', left(p_row ->> 'cause', 64), p_row ->> 'mode',
            left(p_row ->> 'landform', 40), left(p_row ->> 'size', 20), p_row ->> 'device',
            left(p_row ->> 'game_version', 20),
            (p_row ->> 'day')::integer, (p_row ->> 'seconds')::integer,
            (p_row ->> 'tc_level')::integer, (p_row ->> 'peak_pop')::integer,
            (p_row ->> 'score')::integer,
            (case when jsonb_typeof(p_row -> 'props') = 'object' then p_row -> 'props' else '{}'::jsonb end)
              || jsonb_build_object('late', true));
  exception when others then
    -- a row the table's own checks refuse (a bad mode, a day past the range,
    -- a number that is not one) is refused for good, never retried
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.report_run_end(jsonb) from public;
revoke all on function public.report_run_end(jsonb) from anon, authenticated;
grant execute on function public.report_run_end(jsonb) to authenticated;

-- ===========================================================================
-- 9. analytics_cards — the dashboard's Cards section (analytics.html)
-- ===========================================================================
-- Token-gated and aggregate-only, exactly like analytics_summary (0003): the
-- same passphrase hash, the same filters with the same meaning, and never a
-- row. A function of its own, so 0007's analytics_summary is not re-created
-- (and cannot be reverted) by this file; the page calls it after the summary
-- and, on a 404 (this file not yet applied), says so in place of the section.
--
-- What it reads: the LEDGERS (what the server actually granted and spent),
-- not the client's card_granted / card_played rows — those are reported
-- beside them as 'client_*', and a gap between the two is the deck failing
-- to deliver, or the server refusing (card_refusals says which).
--
-- The card-assisted win rate reads 0007's own ONE-ENDING-PER-RUN dedupe and
-- run filters (copied below, same rules), split three ways by the ending's
-- props.cards_played and whether the player held a deck at all: played a
-- card / held a deck and played none / no deck. Win rate is wins over every
-- ending, 0007's convention.
create or replace function public.analytics_cards(
  p_token       text,
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_mode        text default null,
  p_landform    text default null,
  p_device      text default null,
  p_version     text default null,
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
  v_out    jsonb;
begin
  select token_hash into v_stored from public.analytics_config where id = 1;
  if v_stored is null then
    return jsonb_build_object('error', 'no_token_set');
  end if;
  if encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_stored then
    return jsonb_build_object('error', 'bad_token');
  end if;

  with
  -- a run's facts, for ledger rows that need a filter they do not carry
  -- (a play): the run_start's when there is one, else its ending's
  run_meta as (
    select distinct on (t.run_id) t.run_id, t.mode, t.landform, t.device, t.game_version
      from public.telemetry t
     where t.run_id is not null and t.kind in ('run_start', 'run_end')
     order by t.run_id, (t.kind = 'run_start') desc, t.id
  ),
  gr as (
    select g.* from public.card_grants g
     where (p_from     is null or g.created_at >= p_from)
       and (p_to       is null or g.created_at <  p_to)
       and (p_mode     is null or g.mode = p_mode)
       and (p_landform is null or g.landform = p_landform)
       and (p_device   is null or g.device = p_device)
       and (p_version  is null or g.game_version = p_version)
  ),
  pl as (
    select p.*, m.mode from public.card_plays p
      left join run_meta m on m.run_id = p.run_id
     where (p_from     is null or p.created_at >= p_from)
       and (p_to       is null or p.created_at <  p_to)
       and (p_mode     is null or m.mode = p_mode)
       and (p_landform is null or m.landform = p_landform)
       and (p_device   is null or m.device = p_device)
       and (p_version  is null or m.game_version = p_version)
  ),
  rf as (
    select r.* from public.card_refusals r
     where (p_from is null or r.created_at >= p_from)
       and (p_to   is null or r.created_at <  p_to)
  ),
  filtered as (
    select * from public.telemetry t
    where (p_from     is null or t.created_at >= p_from)
      and (p_to       is null or t.created_at <  p_to)
      and (p_mode     is null or t.mode      = p_mode)
      and (p_landform is null or t.landform  = p_landform)
      and (p_device   is null or t.device    = p_device)
      and (p_version  is null or t.game_version = p_version)
  ),
  -- 0007's ONE ENDING PER RUN, verbatim in its rules: a real ending beats a
  -- closed_tab row (checked against the whole table), the latest closed_tab
  -- row is kept, and the run filters apply after the dedupe
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
  ends as (select * from (select * from real_ends union all select * from last_left) u
           where coalesce(u.seconds, 0) >= coalesce(p_min_seconds, 0)
             and coalesce(u.day, 0)     >= coalesce(p_min_day, 0)),
  holders as (
    select s.user_id from public.card_starter s
    union select g.user_id from public.card_grants g
  ),
  split as (
    select e.outcome,
           case when (e.props ->> 'cards_played') ~ '^[0-9]+$' and (e.props ->> 'cards_played')::integer > 0
                  then 'played'
                when exists (select 1 from holders h where h.user_id = e.user_id)
                  then 'held'
                else 'none' end as grp
      from ends e
  ),
  tiers (tier, rank) as (values ('stone', 0), ('bronze', 1), ('iron', 2), ('imperial', 3), ('enlight', 4))
  select jsonb_build_object(
    'generated_at', now(),

    'totals', jsonb_build_object(
      'cards_granted',    (select count(*) from gr),
      'runs_granted',     (select count(distinct (user_id, run_id)) from gr),
      'great_victories',  (select count(*) from gr where slot = 1),
      'cards_played',     (select count(*) from pl),
      'players_granted',  (select count(distinct user_id) from gr),
      'players_played',   (select count(distinct user_id) from pl),
      'starters_claimed', (select count(*) from public.card_starter s
                            where (p_from is null or s.claimed_at >= p_from)
                              and (p_to   is null or s.claimed_at <  p_to)),
      'cards_held_now',   (select coalesce(sum(c.qty), 0) from public.card_collection c),
      'refusals',         (select count(*) from rf),
      'client_granted',   (select count(*) from filtered where kind = 'card_granted'),
      'client_played',    (select count(*) from filtered where kind = 'card_played')
    ),

    -- cards granted, by tier and by the ending that earned them
    'granted_by_tier', (
      select coalesce(jsonb_agg(x order by (x ->> 'rank')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'tier', t.tier, 'rank', t.rank,
          'wins',   (select count(*) from gr where gr.tier = t.tier and gr.outcome = 'win'),
          'losses', (select count(*) from gr where gr.tier = t.tier and gr.outcome = 'loss'),
          'n',      (select count(*) from gr where gr.tier = t.tier),
          'players',(select count(distinct gr.user_id) from gr where gr.tier = t.tier)
        ) as x
        from tiers t
      ) q
    ),

    -- cards played, by card — and how the runs they were played in ended
    'played_by_card', (
      select coalesce(jsonb_agg(x order by (x ->> 'plays')::int desc, x ->> 'card'), '[]'::jsonb) from (
        select jsonb_build_object(
          'card', c.card_key, 'tier', c.tier,
          'plays', c.plays, 'players', c.players, 'runs', c.runs,
          'win_pct', (select round(100.0 * count(*) filter (where e.outcome = 'win')
                             / nullif(count(*), 0), 1)
                      from ends e
                      where e.run_id in (select p2.run_id from pl p2 where p2.card_key = c.card_key))
        ) as x
        from (
          select p.card_key, max(p.tier) as tier, count(*) as plays,
                 count(distinct p.user_id) as players, count(distinct p.run_id) as runs
            from pl p group by p.card_key
        ) c
      ) q
    ),

    -- THE CARD-ASSISTED WIN RATE
    'assisted', (
      select coalesce(jsonb_agg(x order by x ->> 'ord'), '[]'::jsonb) from (
        select jsonb_build_object(
          'ord', case s.grp when 'played' then '1' when 'held' then '2' else '3' end,
          'group', case s.grp when 'played' then 'played a card'
                              when 'held' then 'held a deck, played none'
                              else 'no deck' end,
          'runs', count(*),
          'wins', count(*) filter (where s.outcome = 'win'),
          'losses', count(*) filter (where s.outcome = 'loss'),
          'win_pct', round(100.0 * count(*) filter (where s.outcome = 'win') / nullif(count(*), 0), 1)
        ) as x
        from split s group by s.grp
      ) q
    ),

    -- what the server turned away for good, and why
    'refused', (
      select coalesce(jsonb_agg(x order by (x ->> 'n')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('op', r.op, 'reason', r.reason, 'n', count(*),
                                  'players', count(distinct r.user_id)) as x
          from rf r group by r.op, r.reason
      ) q
    )
  ) into v_out;

  return v_out;
end;
$$;
revoke all on function public.analytics_cards(text, timestamptz, timestamptz, text, text, text, text, integer, integer) from public;
grant execute on function public.analytics_cards(text, timestamptz, timestamptz, text, text, text, text, integer, integer)
  to anon, authenticated;

-- ===========================================================================
-- VERIFY (run by hand after applying; each should read as commented)
-- ===========================================================================
-- the kinds:          select pg_get_constraintdef(oid) from pg_constraint
--                      where conrelid = 'public.telemetry'::regclass and conname = 'telemetry_kind_check';
--                      -- … 'card_granted'::text, 'card_played'::text …
-- the catalog:        select tier, count(*) from public.card_catalog where active group by tier order by 1;
--                      -- bronze 8 · enlight 6 · imperial 7 · iron 7 · stone 8
-- the starter hand:   select card_key from public.card_catalog where starter_qty > 0 order by 1;
--                      -- fallen_timber · forager_cache · willing_hands
-- sealed tables:      select relname, relrowsecurity from pg_class where relname like 'card\_%' and relkind = 'r';
--                      -- every one true
-- no client reaches a table:
--                     select has_table_privilege('anon', 'public.card_collection', 'select'),
--                            has_table_privilege('authenticated', 'public.card_grants', 'insert');
--                      -- false, false
-- the doors:          select has_function_privilege('anon', 'public.grant_card(text,text[],text)', 'execute'),
--                            has_function_privilege('authenticated', 'public.grant_card(text,text[],text)', 'execute'),
--                            has_function_privilege('authenticated', 'public.card_refuse(uuid,text,text,text,jsonb)', 'execute');
--                      -- false, true, false
-- one of each:        select proname, count(*) from pg_proc where proname in
--                      ('grant_card','consume_card','claim_starter_hand','my_cards','report_run_end','analytics_cards')
--                      group by proname;   -- every count 1 (an overload would read 2)
-- the loss rule:      select public.card_loss_min_deeds();   -- 5
