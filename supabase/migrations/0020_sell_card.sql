-- 0020 — THE MARKETPLACE BUYS CARDS BACK (tests/gold.mjs on a real
-- PostgreSQL, js/gold.js's Gold.sell, js/store.js)
--
-- WHY. The store became a Marketplace (operator, build 225: "We also need to
-- give the user the ability to Sell… Sell should go for 20% less than the
-- buy rate"): the trader takes a card from the player's deck and pays four
-- fifths of his own price for it, rounded. Like a purchase, a sale is ONE
-- transaction on the record: the card leaves the collection, the gold goes
-- into the purse and the sale is written, together, under the player's own
-- lock — so two taps, two tabs or two devices can never sell one card twice
-- or be paid twice for it, and a sale whose answer was lost is asked again
-- under its own id and answers "already".
--
-- WHAT.
--   0. the guard: 0019 (the purse, the price list, buy_card) must be applied
--      first — it refuses, naming it
--   1. THE NUMBER, in one place: card_sell_pct() (80). The game's half is
--      CFG.GOLD.SELL (0.8) in js/config.js — tests/gold.mjs holds them equal
--   2. the record: gold_wallet gains `sold` (gold the trader paid, beside
--      `earned` and `spent`), and gold_sales (one row a sale, keyed on the
--      client's sale id)
--   3. the door: sell_card(card, sale id, the price the screen showed)
--   4. my_gold() answers the percentage and the sales count beside the purse
--
-- A sale pays the CARD'S price on the record's own list (card_prices) times
-- the percentage, rounded half up — never a number the client sends; a
-- client that showed another price is told the real one ('price_changed',
-- with the list price beside it) and nothing is sold. A card the record does
-- not hold answers 'none_left'. The purse never passes its ten-million cap
-- (gold_wallet's own check): a sale that would is refused ('full').
--
-- SEALED like 0019: the new table has RLS on, no policy and every privilege
-- revoked from anon and authenticated BY NAME; the door is security definer
-- on an empty search_path and the signed-in player's alone.
--
-- One idempotent paste, after 0019 (and again after any re-paste of 0019,
-- which re-creates my_gold without the sale's fields). WITHOUT IT the game
-- still plays: Sell answers that the trader is not buying yet (a 404 is
-- "not yet") and nothing leaves the deck.

do $guard$ begin
  if to_regclass('public.gold_wallet') is null or to_regclass('public.card_prices') is null
     or to_regprocedure('public.buy_card(text, text, integer)') is null then
    raise exception '0020_sell_card.sql needs 0019_gold_store.sql applied first';
  end if;
end $guard$;

-- ===========================================================================
-- 1. THE NUMBER
-- ===========================================================================
create or replace function public.card_sell_pct()
returns integer language sql immutable set search_path = '' as $$ select 80 $$;
revoke all on function public.card_sell_pct() from public;
revoke all on function public.card_sell_pct() from anon, authenticated;

-- the trader's price for one card: its list price × the percentage, rounded
-- half up (internal: the doors below run as its owner)
create or replace function public.card_sell_price(p_card_key text)
returns integer
language sql
stable
set search_path = ''
as $$
  select ((p.price * public.card_sell_pct() + 50) / 100)::integer
    from public.card_prices p join public.card_catalog c on c.card_key = p.card_key and c.active
   where p.card_key = p_card_key
$$;
revoke all on function public.card_sell_price(text) from public;
revoke all on function public.card_sell_price(text) from anon, authenticated;

-- ===========================================================================
-- 2. THE RECORD
-- ===========================================================================
alter table public.gold_wallet add column if not exists sold bigint not null default 0 check (sold >= 0);

create table if not exists public.gold_sales (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  sale_id       text not null check (char_length(sale_id) between 1 and 64),
  card_key      text not null references public.card_catalog (card_key),
  tier          text not null,
  price         integer not null check (price >= 0),
  balance_after integer not null check (balance_after >= 0),
  created_at    timestamptz not null default now(),
  unique (user_id, sale_id)
);
alter table public.gold_sales enable row level security;
revoke all on table public.gold_sales from public;
revoke all on table public.gold_sales from anon, authenticated;
create index if not exists gold_sales_created_idx on public.gold_sales (created_at desc);

-- ===========================================================================
-- 3. THE DOOR
-- ===========================================================================
-- sell_card — answers { ok, card, tier, price, gold, qty } or
-- { ok:false, reason, gold, price, buy }. In order: who, what, the lock, a
-- retry (the sale already on the ledger is the answer), the price (the
-- server's; one the screen did not show is refused with the real one), the
-- card held (none_left), the purse's ceiling (full); then the card leaves,
-- the gold lands and the sale is written — one transaction.
create or replace function public.sell_card(p_card_key text, p_sale_id text, p_price integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_prev  record;
  v_tier  text;
  v_list  integer;
  v_price integer;
  v_qty   integer;
  v_bal   integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_card_key is null or p_card_key !~ '^[a-z0-9_]{1,40}$'
     or p_sale_id is null or char_length(p_sale_id) not between 1 and 64 then
    return public.card_refuse(v_uid, 'sell', 'bad_input', null, jsonb_build_object('card', p_card_key, 'sale', p_sale_id));
  end if;

  perform pg_advisory_xact_lock(hashtext('clanfire-deck:' || v_uid::text));

  -- A RETRY is paid nothing twice: the sale already on the ledger is the answer
  select s.card_key, s.tier, s.price into v_prev from public.gold_sales s
   where s.user_id = v_uid and s.sale_id = p_sale_id;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'card', v_prev.card_key, 'tier', v_prev.tier,
      'price', v_prev.price,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0),
      'qty', coalesce((select c.qty from public.card_collection c where c.user_id = v_uid and c.card_key = v_prev.card_key), 0));
  end if;

  select c.tier, p.price into v_tier, v_list
    from public.card_catalog c join public.card_prices p on p.card_key = c.card_key
   where c.card_key = p_card_key and c.active;
  if v_tier is null then
    return public.card_refuse(v_uid, 'sell', 'not_for_sale', null, jsonb_build_object('card', p_card_key));
  end if;
  v_price := public.card_sell_price(p_card_key);
  if p_price is not null and p_price <> v_price then
    perform public.card_refuse(v_uid, 'sell', 'price_changed', null, jsonb_build_object('card', p_card_key, 'sent', p_price, 'price', v_price));
    return jsonb_build_object('ok', false, 'reason', 'price_changed', 'price', v_price, 'buy', v_list,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
  end if;

  -- THE CARD, taken in one guarded statement: a deck without it is not touched
  update public.card_collection c set qty = c.qty - 1, updated_at = now()
   where c.user_id = v_uid and c.card_key = p_card_key and c.qty >= 1
  returning c.qty into v_qty;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'none_left', 'price', v_price,
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
  end if;

  -- THE GOLD: a purse at its ceiling is a refusal, and the card stays
  if coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0) + v_price > 10000000 then
    raise exception using errcode = 'P0001', message = 'clanfire:full';
  end if;
  insert into public.gold_wallet (user_id, balance, sold) values (v_uid, v_price, v_price)
  on conflict (user_id) do update
    set balance = public.gold_wallet.balance + v_price,
        sold = public.gold_wallet.sold + v_price,
        updated_at = now()
  returning balance into v_bal;

  insert into public.gold_sales (user_id, sale_id, card_key, tier, price, balance_after)
  values (v_uid, p_sale_id, p_card_key, v_tier, v_price, v_bal);
  return jsonb_build_object('ok', true, 'card', p_card_key, 'tier', v_tier, 'price', v_price, 'gold', v_bal, 'qty', v_qty);
exception when sqlstate 'P0001' then
  if sqlerrm = 'clanfire:full' then
    return jsonb_build_object('ok', false, 'reason', 'full',
      'gold', coalesce((select w.balance from public.gold_wallet w where w.user_id = v_uid), 0));
  end if;
  raise;
end;
$$;
revoke all on function public.sell_card(text, text, integer) from public;
revoke all on function public.sell_card(text, text, integer) from anon, authenticated;
grant execute on function public.sell_card(text, text, integer) to authenticated;

-- ===========================================================================
-- 4. my_gold — the purse, the price list, and now the trader's percentage
-- ===========================================================================
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
    'sold', coalesce((select w.sold from public.gold_wallet w where w.user_id = v_uid), 0),
    'bought', (select count(*) from public.gold_purchases p where p.user_id = v_uid),
    'sales', (select count(*) from public.gold_sales s where s.user_id = v_uid),
    'sell_pct', public.card_sell_pct(),
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
