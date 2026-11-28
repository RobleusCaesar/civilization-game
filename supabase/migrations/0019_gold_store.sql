-- 0019 — GOLD AND THE CARD STORE (tests/gold.mjs on a real PostgreSQL,
-- tests/deck-sync.mjs on the source, tests/analytics.mjs §1g)
--
-- WHY. Cards are now also bought (operator, the Gold & Card Store brief):
-- every finished game that earns a card also earns GOLD, at one gold for
-- every 200 points of the final score — never under a floor, never over a
-- cap — and a journey game's win pays a fixed sum; the gold buys any card of
-- the catalog at the main menu's store. So that a bought card is never a
-- free one, the server keeps the purse: one gold grant per run, a balance
-- that can never go below zero, and a purchase that checks the balance,
-- takes the price and adds the card in ONE transaction.
--
-- WHAT.
--   0. the guard: 0008 (the card record) and 0010 (the dashboard's model)
--      must be applied first — it refuses, naming them
--   1. THE NUMBERS, each in one place: gold_rate() (200 points a gold),
--      gold_floor() (10), gold_cap() (150), gold_prologue(game) (40, 50, 60 — 150 over the journey).
--      The game's halves are CFG.GOLD in js/config.js — tests/deck-sync.mjs
--      holds the two equal
--   2. telemetry.kind admits 'store' (the store's own rows: a visit, a BUY
--      tapped without the gold) beside every kind 0018 allowed — re-pasting
--      0008, 0012, 0013, 0016, 0017 or 0018 narrows the kinds again: paste
--      this file after any of them
--   3. THE DROP TABLES (operator: "Mythic drop odds halved across every
--      table. Shift that weight to Stone and Bronze"): a Moderate win may now
--      be paid in Stone, a Hard win in Stone or Bronze. The tiers are a
--      ceiling (0011's rule): nothing is taken away. RE-PASTING 0008 UNDOES
--      THIS SECTION (0008 re-seeds card_drop_tiers from nothing) — paste this
--      file again after it, and after 0011 too
--   4. the record: gold_wallet (one purse a player, never below zero),
--      gold_grants (one row a run, ever), card_prices (the store's price of
--      every card) and gold_purchases (one row a purchase, keyed on the
--      client's purchase id so a lost answer is safe to retry)
--   5. the four doors: grant_gold, grant_prologue_gold, buy_card, my_gold
--   6. analytics_gold — the dashboard's Gold section
--
-- THE EARN RULE IS THE CARD'S (0008's grant_card, word for word): a REAL
-- ending this player sent for this run (never the provisional closed_tab),
-- with the grant's own outcome; a win always; a loss only with
-- card_loss_min_deeds() deeds on its row. A journey game's WIN is paid by
-- its own door (grant_prologue_gold: once per player per game, ever), so
-- the ordinary door refuses one ('prologue'); a lost journey game earns as
-- any defeat does. The amount is the SERVER's, read off the ending's own
-- score column — the number the end screen shows, the difficulty multiplier
-- in — never a number the client sends. It is friction, not proof (0008): a
-- client writes its own telemetry, score included, and the cap and the
-- hourly limit bound what a forged row can buy.
--
-- ONE PURCHASE IS ONE TRANSACTION. buy_card takes the player's advisory lock
-- (the deck's own key, so a purchase also waits for that player's grants and
-- plays), then: a purchase id already on the ledger answers ok + already
-- (a retry after a lost answer spends nothing twice); the price is the
-- server's (and a client that showed another price is told the real one,
-- never charged it); the balance is taken by ONE guarded update
-- (balance >= price), the column's own check (balance >= 0) behind it; the
-- card is added; the purchase is written. Two tabs pressing BUY at once with
-- the gold for one card: the second waits on the lock and then finds the
-- purse short — 'not_enough', with the balance.
--
-- SEALED like 0008: every new table has RLS on, no policy and every
-- privilege revoked from anon and authenticated BY NAME (Supabase grants new
-- objects to both by name, which `revoke … from public` never touches);
-- every function is security definer on an empty search_path; the four
-- doors are the signed-in player's alone, the numbers nobody's, and
-- analytics_gold answers only the 0003 passphrase (or its header, 0015).
-- Foreign keys point at auth.users, never at profiles (0008's reason).
--
-- One idempotent paste, after 0018. WITHOUT IT the game still plays: the
-- purse lives on the device, every gold op waits in its own queue (a 404 is
-- "not yet"), the card queue is untouched, and the store says it cannot
-- reach the trader.

do $guard$ begin
  if to_regclass('public.card_catalog') is null or to_regclass('public.card_collection') is null
     or to_regclass('public.card_drop_tiers') is null
     or to_regprocedure('public.card_refuse(uuid, text, text, text, jsonb)') is null
     or to_regprocedure('public.card_loss_min_deeds()') is null then
    raise exception '0019_gold_store.sql needs 0008_cards.sql applied first';
  end if;
  if to_regprocedure('public.analytics__ok(text)') is null
     or to_regprocedure('public.analytics__hidden()') is null then
    raise exception '0019_gold_store.sql needs 0010_dashboard.sql applied first';
  end if;
end $guard$;

-- ===========================================================================
-- 1. THE NUMBERS — change one and run its statement again
-- ===========================================================================
create or replace function public.gold_rate()
returns integer language sql immutable set search_path = '' as $$ select 200 $$;
create or replace function public.gold_floor()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;
create or replace function public.gold_cap()
returns integer language sql immutable set search_path = '' as $$ select 150 $$;
-- a journey game's win (CFG.GOLD.PROLOGUE)
create or replace function public.gold_prologue(p_game integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_game when 1 then 40 when 2 then 50 when 3 then 60 end
$$;
-- the gold a finished run's final score pays: one for every gold_rate()
-- points, never under the floor, never over the cap
create or replace function public.gold_amount(p_score integer)
returns integer language sql immutable set search_path = '' as $$
  select least(public.gold_cap(), greatest(public.gold_floor(),
    floor(greatest(coalesce(p_score, 0), 0)::numeric / public.gold_rate())::integer))
$$;
revoke all on function public.gold_rate() from public;
revoke all on function public.gold_rate() from anon, authenticated;
revoke all on function public.gold_floor() from public;
revoke all on function public.gold_floor() from anon, authenticated;
revoke all on function public.gold_cap() from public;
revoke all on function public.gold_cap() from anon, authenticated;
revoke all on function public.gold_prologue(integer) from public;
revoke all on function public.gold_prologue(integer) from anon, authenticated;
revoke all on function public.gold_amount(integer) from public;
revoke all on function public.gold_amount(integer) from anon, authenticated;

-- ===========================================================================
-- 2. THE KIND — the store's own rows
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
  check (kind in ('run_start', 'run_end', 'session', 'card_granted', 'card_played', 'vote', 'step', 'prologue', 'store'));

create index if not exists telemetry_store_idx on public.telemetry (created_at desc) where kind = 'store';

-- ===========================================================================
-- 3. THE DROP TABLES — a Moderate win may be paid in Stone, a Hard win in
--    Stone or Bronze (CFG.CARDS.DROPS: moderate [1.25, 36.25, 40, 20, 2.5],
--    hard [6.25, 6.25, 30, 45, 12.5]); every other tier stays as it was
-- ===========================================================================
insert into public.card_drop_tiers (tbl, tier) values
  ('moderate', 'stone'), ('hard', 'stone'), ('hard', 'bronze')
on conflict (tbl, tier) do nothing;

-- ===========================================================================
-- 4. THE RECORD
-- ===========================================================================
-- one purse a player. Never below zero — the column's own check, behind the
-- guarded update in buy_card — and never above ten million.
create table if not exists public.gold_wallet (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0 and balance <= 10000000),
  earned     bigint  not null default 0 check (earned >= 0),
  spent      bigint  not null default 0 check (spent >= 0),
  updated_at timestamptz not null default now()
);
alter table public.gold_wallet enable row level security;
revoke all on table public.gold_wallet from public;
revoke all on table public.gold_wallet from anon, authenticated;

-- one row a RUN, ever (unique on player and run): what it paid and why.
-- A journey game's row carries its game, and a player is paid once a game.
create table if not exists public.gold_grants (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  run_id     text not null check (char_length(run_id) between 1 and 64),
  kind       text not null check (kind in ('run', 'prologue')),
  game       smallint check (game is null or game between 1 and 3),
  amount     integer not null check (amount between 0 and 100000),
  outcome    text not null check (outcome in ('win', 'loss')),
  mode       text,
  score      integer,
  created_at timestamptz not null default now(),
  unique (user_id, run_id)
);
alter table public.gold_grants enable row level security;
revoke all on table public.gold_grants from public;
revoke all on table public.gold_grants from anon, authenticated;
create unique index if not exists gold_grants_prologue_uq on public.gold_grants (user_id, game) where kind = 'prologue';
create index if not exists gold_grants_created_idx on public.gold_grants (created_at desc);

-- THE PRICE LIST (CFG.GOLD.PRICE, Deck.price): a card's price is its tier's,
-- but where the list names it. Re-seeded to exactly this every time it runs.
create table if not exists public.card_prices (
  card_key text primary key references public.card_catalog (card_key),
  price    integer not null check (price between 1 and 100000)
);
alter table public.card_prices enable row level security;
revoke all on table public.card_prices from public;
revoke all on table public.card_prices from anon, authenticated;
with tier_price (tier, price) as (values
  ('stone', 40), ('bronze', 100), ('iron', 200), ('imperial', 500), ('enlight', 800)
),
card_price (card_key, price) as (values
  ('dragonfire', 1000)
)
insert into public.card_prices (card_key, price)
select c.card_key, coalesce(cp.price, tp.price)
  from public.card_catalog c
  join tier_price tp on tp.tier = c.tier
  left join card_price cp on cp.card_key = c.card_key
 where c.active
on conflict (card_key) do update set price = excluded.price;
-- a card no longer in the catalog is no longer for sale
delete from public.card_prices p
 where not exists (select 1 from public.card_catalog c where c.card_key = p.card_key and c.active);

-- one row a PURCHASE, keyed on the client's purchase id
create table if not exists public.gold_purchases (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  purchase_id   text not null check (char_length(purchase_id) between 1 and 64),
  card_key      text not null references public.card_catalog (card_key),
  tier          text not null,
  price         integer not null check (price >= 0),
  balance_after integer not null check (balance_after >= 0),
  created_at    timestamptz not null default now(),
  unique (user_id, purchase_id)
);
alter table public.gold_purchases enable row level security;
revoke all on table public.gold_purchases from public;
revoke all on table public.gold_purchases from anon, authenticated;
create index if not exists gold_purchases_created_idx on public.gold_purchases (created_at desc);

-- the purse after a credit, in one statement (internal: the doors below run
-- as its owner; no client may call it)
create or replace function public.gold_credit(p_uid uuid, p_amount integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare v_bal integer;
begin
  insert into public.gold_wallet (user_id, balance, earned) values (p_uid, least(greatest(p_amount, 0), 10000000), greatest(p_amount, 0))
  on conflict (user_id) do update
    set balance = least(public.gold_wallet.balance + greatest(p_amount, 0), 10000000),
        earned = public.gold_wallet.earned + greatest(p_amount, 0),
        updated_at = now()
  returning balance into v_bal;
  return v_bal;
end;
$$;
revoke all on function public.gold_credit(uuid, integer) from public;
revoke all on function public.gold_credit(uuid, integer) from anon, authenticated;

-- ===========================================================================
-- 5. THE DOORS
-- ===========================================================================
-- grant_gold — the queue's { op:'gold', run, outcome }. In order: who, what,
-- NEVER TWICE (a run already paid answers ok + already with what it paid),
-- THE EVIDENCE (0008's), THE EARN RULE (0008's), a journey win sent here
-- refused for the journey's own door, the hourly cap, then the ledger row
-- and the purse. Answers { ok, amount, gold }.
create or replace function public.grant_gold(p_run_id text, p_outcome text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_prev  record;
  v_end   record;
  v_deeds integer;
  v_n     integer;
  v_amt   integer;
  v_bal   integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_run_id is null or char_length(p_run_id) not between 1 and 64
     or p_outcome is null or p_outcome not in ('win', 'loss') then
    return public.card_refuse(v_uid, 'gold', 'bad_input', p_run_id, jsonb_build_object('outcome', p_outcome));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- NEVER TWICE
  select g.amount, g.kind into v_prev from public.gold_grants g where g.user_id = v_uid and g.run_id = p_run_id;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'amount', v_prev.amount,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
  end if;

  -- THE EVIDENCE: 0008's, word for word
  select t.outcome, t.cause, t.mode, t.score, t.props
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
    return public.card_refuse(v_uid, 'gold', 'not_finished', p_run_id,
      jsonb_build_object('outcome', v_end.outcome, 'cause', v_end.cause));
  end if;
  if v_end.outcome <> p_outcome then
    return public.card_refuse(v_uid, 'gold', 'outcome_mismatch', p_run_id,
      jsonb_build_object('sent', p_outcome, 'row', v_end.outcome));
  end if;
  -- a journey game's WIN is the journey's own door's to pay
  if v_end.outcome = 'win' and coalesce(v_end.mode, '') like 'prologue\_%' then
    return public.card_refuse(v_uid, 'gold', 'prologue', p_run_id, jsonb_build_object('mode', v_end.mode));
  end if;

  -- THE EARN RULE: a win always; a loss by its deeds (0008's section 0)
  v_deeds := case
    when jsonb_typeof(v_end.props -> 'deeds') = 'number'
      then least(greatest(floor((v_end.props ->> 'deeds')::numeric), 0), 1000000)::integer
    when (v_end.props ->> 'deeds') ~ '^[0-9]{1,7}$'
      then (v_end.props ->> 'deeds')::integer
    else 0 end;
  if v_end.outcome = 'loss' and v_deeds < public.card_loss_min_deeds() then
    return public.card_refuse(v_uid, 'gold', 'not_earned', p_run_id,
      jsonb_build_object('deeds', v_deeds, 'need', public.card_loss_min_deeds()));
  end if;

  -- THE CAP, as grant_card's: twelve paid runs an hour
  select count(*) into v_n from public.gold_grants g
   where g.user_id = v_uid and g.created_at > now() - interval '1 hour';
  if v_n >= 12 then
    return jsonb_build_object('ok', false, 'reason', 'slow_down');
  end if;

  v_amt := public.gold_amount(v_end.score);
  insert into public.gold_grants (user_id, run_id, kind, amount, outcome, mode, score)
  values (v_uid, p_run_id, 'run', v_amt, v_end.outcome, v_end.mode, v_end.score);
  v_bal := public.gold_credit(v_uid, v_amt);
  return jsonb_build_object('ok', true, 'amount', v_amt, 'gold', v_bal);
end;
$$;
revoke all on function public.grant_gold(text, text) from public;
revoke all on function public.grant_gold(text, text) from anon, authenticated;
grant execute on function public.grant_gold(text, text) to authenticated;

-- grant_prologue_gold — the queue's { op:'gold_pro', run, game }: a journey
-- game's WIN, once per player per game, ever (0018's grant_prologue rule)
create or replace function public.grant_prologue_gold(p_run_id text, p_game integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_prev record;
  v_amt  integer;
  v_bal  integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_run_id is null or char_length(p_run_id) not between 1 and 64
     or p_game is null or p_game not between 1 and 3 then
    return public.card_refuse(v_uid, 'gold_pro', 'bad_input', p_run_id, jsonb_build_object('game', p_game));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- NEVER TWICE: once a game a player, ever — the same run asking again is a duplicate
  select g.run_id, g.amount into v_prev from public.gold_grants g
   where g.user_id = v_uid and g.kind = 'prologue' and g.game = p_game;
  if found then
    if v_prev.run_id = p_run_id then
      return jsonb_build_object('ok', true, 'already', true, 'amount', v_prev.amount,
        'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
    end if;
    return public.card_refuse(v_uid, 'gold_pro', 'already_had', p_run_id, jsonb_build_object('game', p_game));
  end if;
  if exists (select 1 from public.gold_grants g where g.user_id = v_uid and g.run_id = p_run_id) then
    return public.card_refuse(v_uid, 'gold_pro', 'already_had', p_run_id, jsonb_build_object('game', p_game));
  end if;

  -- THE EVIDENCE: this run's own real ending, won, in this game's mode
  if not exists (select 1 from public.telemetry t
                  where t.user_id = v_uid and t.run_id = p_run_id and t.kind = 'run_end'
                    and t.outcome = 'win' and coalesce(t.cause, '') <> 'closed_tab'
                    and t.mode = 'prologue_' || p_game) then
    return jsonb_build_object('ok', false, 'reason', 'no_run');
  end if;

  v_amt := public.gold_prologue(p_game);
  insert into public.gold_grants (user_id, run_id, kind, game, amount, outcome, mode)
  values (v_uid, p_run_id, 'prologue', p_game, v_amt, 'win', 'prologue_' || p_game);
  v_bal := public.gold_credit(v_uid, v_amt);
  return jsonb_build_object('ok', true, 'amount', v_amt, 'gold', v_bal);
end;
$$;
revoke all on function public.grant_prologue_gold(text, integer) from public;
revoke all on function public.grant_prologue_gold(text, integer) from anon, authenticated;
grant execute on function public.grant_prologue_gold(text, integer) to authenticated;

-- buy_card — the store's BUY, synchronous (never queued): ONE transaction.
-- p_price is the price the store SHOWED; a different server price is never
-- charged — it answers 'price_changed' with the real one. Answers
-- { ok, card, tier, price, gold, qty } or { ok:false, reason, gold, price }.
create or replace function public.buy_card(p_card_key text, p_purchase_id text, p_price integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_prev  record;
  v_tier  text;
  v_price integer;
  v_held  integer;
  v_bal   integer;
  v_qty   integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_card_key is null or p_card_key !~ '^[a-z0-9_]{1,40}$'
     or p_purchase_id is null or char_length(p_purchase_id) not between 1 and 64 then
    return public.card_refuse(v_uid, 'buy', 'bad_input', null, jsonb_build_object('card', p_card_key, 'purchase', p_purchase_id));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- A RETRY spends nothing twice: the purchase already on the ledger is the answer
  select p.card_key, p.tier, p.price, p.balance_after into v_prev from public.gold_purchases p
   where p.user_id = v_uid and p.purchase_id = p_purchase_id;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'card', v_prev.card_key, 'tier', v_prev.tier,
      'price', v_prev.price,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0),
      'qty', coalesce((select c.qty from public.card_collection c where c.user_id = v_uid and c.card_key = v_prev.card_key), 0));
  end if;

  select c.tier, p.price into v_tier, v_price
    from public.card_catalog c join public.card_prices p on p.card_key = c.card_key
   where c.card_key = p_card_key and c.active;
  if v_tier is null then
    return public.card_refuse(v_uid, 'buy', 'not_for_sale', null, jsonb_build_object('card', p_card_key));
  end if;
  if p_price is not null and p_price <> v_price then
    perform public.card_refuse(v_uid, 'buy', 'price_changed', null, jsonb_build_object('card', p_card_key, 'sent', p_price, 'price', v_price));
    return jsonb_build_object('ok', false, 'reason', 'price_changed', 'price', v_price,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
  end if;
  select c.qty into v_held from public.card_collection c where c.user_id = v_uid and c.card_key = p_card_key;
  if coalesce(v_held, 0) >= 999 then
    return public.card_refuse(v_uid, 'buy', 'full', null, jsonb_build_object('card', p_card_key));
  end if;

  -- THE PRICE, taken in one guarded statement: a purse short of it is not touched
  update public.gold_wallet w set balance = w.balance - v_price, spent = w.spent + v_price, updated_at = now()
   where w.user_id = v_uid and w.balance >= v_price
  returning w.balance into v_bal;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_enough', 'price', v_price,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
  end if;

  insert into public.card_collection (user_id, card_key, qty) values (v_uid, p_card_key, 1)
  on conflict (user_id, card_key) do update
    set qty = least(public.card_collection.qty + 1, 999), updated_at = now()
  returning qty into v_qty;
  insert into public.gold_purchases (user_id, purchase_id, card_key, tier, price, balance_after)
  values (v_uid, p_purchase_id, p_card_key, v_tier, v_price, v_bal);
  return jsonb_build_object('ok', true, 'card', p_card_key, 'tier', v_tier, 'price', v_price, 'gold', v_bal, 'qty', v_qty);
end;
$$;
revoke all on function public.buy_card(text, text, integer) from public;
revoke all on function public.buy_card(text, text, integer) from anon, authenticated;
grant execute on function public.buy_card(text, text, integer) to authenticated;

-- my_gold — the purse the device mirror reconciles against, and the price
-- list as the server holds it (a price changed here reaches every store at
-- its next look, with no game update)
create or replace function public.my_gold()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  return jsonb_build_object(
    'ok', true,
    'uid', v_uid,
    'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0),
    'earned', coalesce((select w.earned from public.gold_wallet w where w.user_id = v_uid), 0),
    'spent', coalesce((select w.spent from public.gold_wallet w where w.user_id = v_uid), 0),
    'bought', (select count(*) from public.gold_purchases p where p.user_id = v_uid),
    'prologue', coalesce((select jsonb_agg(g.game order by g.game) from public.gold_grants g
                           where g.user_id = v_uid and g.kind = 'prologue'), '[]'::jsonb),
    'prices', coalesce((select jsonb_object_agg(p.card_key, p.price) from public.card_prices p
                          join public.card_catalog c on c.card_key = p.card_key and c.active), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.my_gold() from public;
revoke all on function public.my_gold() from anon, authenticated;
grant execute on function public.my_gold() to authenticated;

-- ===========================================================================
-- 6. analytics_gold — the dashboard's Gold section
-- ===========================================================================
-- { ok,
--   earned:  [ { outcome: 'win' | 'loss' | 'prologue', mode, grants, players, gold, median, p90, capped, floored } ],
--   spent:   { purchases, players, gold },
--   tiers:   [ { tier, purchases, gold } ],
--   cards:   [ { card, tier, purchases, gold } ],
--   balance: { players, avg, median, p90, zero, can_buy },
--   store:   { visits, players, short, short_players },
--   again:   { buyers: { players, n, again }, others: { players, n, again } } }
--
-- EARNED and SPENT read the LEDGERS (what the server paid and took), in the
-- period, by when they were written. BALANCE is every purse touched in the
-- period, as it stands now (can_buy: holding the cheapest card's price).
-- STORE is the 'store' rows: visits and the BUY taps that were short of gold.
-- PLAYED AGAIN: a BUYER is a player whose first purchase ever was in the
-- period, timed from that purchase; the OTHERS are players paid gold in the
-- period who have never bought a card, timed from their first grant in the
-- period. `again` is a game started in the 7 days after that moment, and
-- `n` the players whose week has passed (a week that has not happened yet
-- is not a "no"); `players` the whole cohort. The dashboard's left-out
-- devices (analytics__hidden()) are left out unless p_everyone.
drop function if exists public.analytics_gold(text, timestamptz, timestamptz, boolean);
create function public.analytics_gold(
  p_token text, p_from timestamptz default null, p_to timestamptz default null, p_everyone boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end timestamptz := least(coalesce(p_to, now()), now());
  v_min integer := coalesce((select min(p.price) from public.card_prices p), 0);
  v_out jsonb;
begin
  if not public.analytics__ok(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;

  with hid as (select distinct h.user_id from public.analytics__hidden() h where not coalesce(p_everyone, false)),
  gr as (
    select g.* from public.gold_grants g
     where (p_from is null or g.created_at >= p_from) and g.created_at < v_end
       and not exists (select 1 from hid where hid.user_id = g.user_id)
  ),
  pu as (
    select p.* from public.gold_purchases p
     where (p_from is null or p.created_at >= p_from) and p.created_at < v_end
       and not exists (select 1 from hid where hid.user_id = p.user_id)
  ),
  earned as (
    select case when g.kind = 'prologue' then 'prologue' else g.outcome end as outcome,
           case when g.kind = 'prologue' then 'journey'
                when g.mode in ('calm', 'moderate', 'hard') then g.mode else 'other' end as mode,
           count(*) as grants, count(distinct g.user_id) as players, coalesce(sum(g.amount), 0) as gold,
           percentile_cont(0.5) within group (order by g.amount) as med,
           percentile_cont(0.9) within group (order by g.amount) as p90,
           count(*) filter (where g.kind = 'run' and g.amount >= public.gold_cap()) as capped,
           count(*) filter (where g.kind = 'run' and g.amount <= public.gold_floor()) as floored
      from gr g group by 1, 2
  ),
  touched as (
    select g.user_id from gr g union select p.user_id from pu p
  ),
  bal as (
    select w.balance from public.gold_wallet w join touched t on t.user_id = w.user_id
  ),
  srows as (
    select t.user_id, t.props->>'ev' as ev
      from public.telemetry t
     where t.kind = 'store' and (p_from is null or t.created_at >= p_from) and t.created_at < v_end
       and not exists (select 1 from hid where hid.user_id = t.user_id)
  ),
  starts as (
    select t.user_id, t.created_at from public.telemetry t
     where t.kind = 'run_start' and not exists (select 1 from hid where hid.user_id = t.user_id)
  ),
  firstbuy as (
    select p.user_id, min(p.created_at) as at from public.gold_purchases p
     where not exists (select 1 from hid where hid.user_id = p.user_id)
     group by p.user_id
  ),
  buyers as (
    select f.* from firstbuy f
     where (p_from is null or f.at >= p_from) and f.at < v_end
  ),
  others as (
    select g.user_id, min(g.created_at) as at from gr g
     where not exists (select 1 from public.gold_purchases p where p.user_id = g.user_id)
     group by g.user_id
  ),
  coh as (
    select 'buyers'::text as cohort, b.user_id, b.at from buyers b
    union all
    select 'others'::text, o.user_id, o.at from others o
  ),
  ripe as (
    select c.*, exists (select 1 from starts s where s.user_id = c.user_id
                         and s.created_at > c.at and s.created_at <= c.at + interval '7 days') as back
      from coh c where c.at <= now() - interval '7 days'
  )
  select jsonb_build_object(
    'ok', true,
    'earned', (select coalesce(jsonb_agg(jsonb_build_object(
        'outcome', e.outcome, 'mode', e.mode, 'grants', e.grants, 'players', e.players, 'gold', e.gold,
        'median', round(e.med::numeric), 'p90', round(e.p90::numeric), 'capped', e.capped, 'floored', e.floored)
      order by e.outcome, e.mode), '[]'::jsonb) from earned e),
    'spent', (select jsonb_build_object('purchases', count(*), 'players', count(distinct p.user_id),
        'gold', coalesce(sum(p.price), 0)) from pu p),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('tier', x.tier, 'purchases', x.n, 'gold', x.gold)
      order by x.gold desc), '[]'::jsonb)
      from (select p.tier, count(*) as n, sum(p.price) as gold from pu p group by p.tier) x),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('card', x.card_key, 'tier', x.tier, 'purchases', x.n, 'gold', x.gold)
      order by x.n desc, x.card_key), '[]'::jsonb)
      from (select p.card_key, p.tier, count(*) as n, sum(p.price) as gold from pu p group by p.card_key, p.tier) x),
    'balance', (select jsonb_build_object('players', count(*),
        'avg', case when count(*) > 0 then round(avg(b.balance)) end,
        'median', case when count(*) > 0 then round((percentile_cont(0.5) within group (order by b.balance))::numeric) end,
        'p90', case when count(*) > 0 then round((percentile_cont(0.9) within group (order by b.balance))::numeric) end,
        'zero', count(*) filter (where b.balance = 0),
        'can_buy', count(*) filter (where v_min > 0 and b.balance >= v_min)) from bal b),
    'store', jsonb_build_object(
        'visits', (select count(*) from srows s where s.ev = 'open'),
        'players', (select count(distinct s.user_id) from srows s where s.ev = 'open'),
        'short', (select count(*) from srows s where s.ev = 'short'),
        'short_players', (select count(distinct s.user_id) from srows s where s.ev = 'short')),
    'again', jsonb_build_object(
        'buyers', jsonb_build_object(
          'players', (select count(*) from coh c where c.cohort = 'buyers'),
          'n', (select count(*) from ripe r where r.cohort = 'buyers'),
          'again', (select count(*) from ripe r where r.cohort = 'buyers' and r.back)),
        'others', jsonb_build_object(
          'players', (select count(*) from coh c where c.cohort = 'others'),
          'n', (select count(*) from ripe r where r.cohort = 'others'),
          'again', (select count(*) from ripe r where r.cohort = 'others' and r.back))))
  into v_out;
  return v_out;
end
$$;
revoke all on function public.analytics_gold(text, timestamptz, timestamptz, boolean) from public;
grant execute on function public.analytics_gold(text, timestamptz, timestamptz, boolean) to anon, authenticated;
