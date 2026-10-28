-- 0011 — A BIG LOSS EARNS A BETTER CARD: a defeat that scored 20,000 or more
-- is judged on a table of its own — Bronze at the least, Iron at the most
--
-- WHY (the operator, 2026-10-28: "I just had a game on Hard where I scored
-- 33,000 (the most points I've ever seen) BUT lost. All I got for a card was
-- a gold nugget (+60 gold). Almost feels disrespectful … anything over 20,000
-- points and bronze is the floor and iron is the ceiling"). Every defeat that
-- earned a card rolled the one loss table — CFG.CARDS.DROPS.loss, Stone 85 /
-- Bronze 15 — whatever it scored, and 0008's grant_card holds every loss to
-- exactly those two tiers. From this file a defeat whose run_end row scores
-- card_big_loss_min_score() or more is held to the BIG LOSS table instead,
-- 'bigloss' (the game's CFG.CARDS.DROPS.bigloss, Bronze 60 / Iron 40).
--
-- THE SCORE is the run_end row's own score column: Score.compute(win).total,
-- fixed by G.end on S.over and sent by G.runReport, the difficulty
-- multiplier IN — the number the end screen shows (and the very number the
-- game's Deck.report chooses its table on). Never the subtotal: the operator's 33,000 on Hard was about 18,900
-- before Hard's ×1.75. The game must choose its table on the same number, or
-- a defeat near the line is judged on two different tables.
--
-- WHAT.
--   0. the guard: 0008 must be applied first (it refuses, naming 0008)
--   1. THE NUMBER: card_big_loss_min_score() — 20000, the one place it lives,
--      internal (no client calls it)
--   2. THE TABLE: card_drop_tiers.tbl admits 'bigloss' (the inline check 0008
--      made — Postgres named it card_drop_tiers_tbl_check — is found by
--      catalogue lookup and made again), and the big loss's tiers are
--      re-seeded to exactly what this file says
--   3. grant_card, made again with ONE line changed: the loss branch of
--      v_tbl reads the ending's score. Nothing else in it moves — the
--      evidence, the earn rule, the one-card-on-a-loss rule, the pity card,
--      the hourly cap and the ledger are 0008's, word for word.
--
-- THE BIG LOSS'S TIERS ARE A CEILING, NOT A FLOOR: Stone, Bronze and Iron —
-- what either loss table can roll. The game's big table never rolls Stone,
-- but the server refusing one would only take a card off a player: a phone
-- still running last week's game rolls the plain table on a big defeat, and a
-- save of the run finished again can move its latest score across the line.
-- A Stone card is never worth forging; an Iron one is, and that is what the
-- line holds back. (tests/deck-sync.mjs holds this table equal to the game's
-- loss tiers joined with its big-loss tiers.)
--
-- THE EVIDENCE is still "friction, not proof" (0008): a client writes its own
-- telemetry rows, score included. A forged 20,000 buys an Iron card at most —
-- less than a forged WIN has always bought (Moderate rolls up to
-- Enlightenment) — and the hourly cap still bounds it.
--
-- HOW TO APPLY. Paste the whole file into the Supabase SQL editor, after
-- 0008. It is ONE idempotent block: run it twice in a row and nothing changes
-- the second time. APPLY IT BEFORE THE GAME THAT ROLLS THE BIG TABLE GOES
-- OUT: until it is, 0008 refuses a big defeat's Iron card ('bad_cards') and
-- the next reconcile takes it back off the device; applied first, it changes
-- nothing for an older game (its Stone and Bronze are inside the ceiling).
-- RE-RUNNING 0008 UNDOES THIS FILE — 0008 re-seeds card_drop_tiers without
-- 'bigloss' and makes grant_card again with the plain loss line — so after
-- pasting 0008 again for any reason, paste this file again too.

do $guard$
begin
  if to_regclass('public.card_drop_tiers') is null or to_regclass('public.card_catalog') is null
     or to_regclass('public.card_grants') is null
     or to_regprocedure('public.grant_card(text, text[], text)') is null
     or to_regprocedure('public.card_refuse(uuid, text, text, text, jsonb)') is null
     or to_regprocedure('public.card_pity_of(uuid)') is null
     or to_regprocedure('public.card_pity_wins()') is null
     or to_regprocedure('public.card_loss_min_deeds()') is null then
    raise exception '0011 needs 0008_cards.sql applied first';
  end if;
end
$guard$;

-- ===========================================================================
-- 1. THE NUMBER — the score a DEFEAT must reach to be a big loss
-- ===========================================================================
-- Change the 20000 and run this one statement again; grant_card reads it on
-- every call. The game's half (the score Deck.table compares) must name the
-- same number, or a defeat it judges big is held here to the plain table and
-- its Iron card leaves the collection at the next reconcile.
create or replace function public.card_big_loss_min_score()
returns integer
language sql
immutable
set search_path = ''
as $$ select 20000 $$;
revoke all on function public.card_big_loss_min_score() from public;
revoke all on function public.card_big_loss_min_score() from anon, authenticated;

-- ===========================================================================
-- 2. THE TABLE — 'bigloss' admitted, its tiers re-seeded
-- ===========================================================================
-- 0008 declared the tbl check inline, so its name is Postgres's own
-- (card_drop_tiers_tbl_check): every check on the table that reads the tbl
-- column is dropped by catalogue lookup rather than by that name, then the
-- one rule is made again — safe to run any number of times. The rows go in
-- only after the check admits them.
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
            where c.conrelid = 'public.card_drop_tiers'::regclass and c.contype = 'c'
              and a.attname = 'tbl' loop
    execute format('alter table public.card_drop_tiers drop constraint %I', r.conname);
  end loop;
end
$$;
alter table public.card_drop_tiers add constraint card_drop_tiers_tbl_check
  check (tbl in ('loss', 'bigloss', 'calm', 'moderate', 'hard'));

-- which tiers a BIG defeat can be paid in ([stone, bronze, iron, imperial,
-- enlight]): the game rolls bigloss [0,60,40,0,0]; the server holds it to the
-- ceiling of both loss tables (the header says why). The other four tables
-- are 0008's and are not touched.
delete from public.card_drop_tiers where tbl = 'bigloss';
insert into public.card_drop_tiers (tbl, tier) values
  ('bigloss', 'stone'), ('bigloss', 'bronze'), ('bigloss', 'iron');

-- ===========================================================================
-- 3. grant_card — 0008's door, the loss branch of v_tbl reading the score
-- ===========================================================================
-- Word for word 0008's section 4 but for ONE line — the else of v_tbl, which
-- was `else 'loss' end;` — so a loss whose ending scored the big-loss number
-- or more is judged on 'bigloss'. A row that carries no score (NULL) is a
-- plain loss. The grants and revokes are 0008's.
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
                else (case when v_end.score >= public.card_big_loss_min_score() then 'bigloss' else 'loss' end) end;
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
-- VERIFY (run by hand after applying; each should read as commented)
-- ===========================================================================
-- the number:         select public.card_big_loss_min_score();   -- 20000
-- the tables:         select tbl, string_agg(tier, ',' order by tier) from public.card_drop_tiers
--                      group by tbl order by tbl;
--                      -- bigloss bronze,iron,stone · calm bronze,imperial,iron,stone ·
--                      -- hard enlight,imperial,iron · loss bronze,stone ·
--                      -- moderate bronze,enlight,imperial,iron
-- one tbl check:      select conname, pg_get_constraintdef(oid) from pg_constraint
--                      where conrelid = 'public.card_drop_tiers'::regclass and contype = 'c';
--                      -- card_drop_tiers_tbl_check (… 'bigloss' …) and card_drop_tiers_tier_check
-- the line:           select prosrc ~ 'card_big_loss_min_score' from pg_proc where proname = 'grant_card';  -- true
-- the doors:          select has_function_privilege('anon', 'public.grant_card(text,text[],text)', 'execute'),
--                            has_function_privilege('authenticated', 'public.grant_card(text,text[],text)', 'execute'),
--                            has_function_privilege('authenticated', 'public.card_big_loss_min_score()', 'execute');
--                      -- false, true, false
-- one of each:        select proname, count(*) from pg_proc where proname in ('grant_card', 'card_big_loss_min_score')
--                      group by proname;   -- every count 1
