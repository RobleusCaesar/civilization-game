/* GOLD AND THE CARD STORE — the contract (js/gold.js, js/store.js,
   js/deck.js's purse, supabase/migrations/0019_gold_store.sql).

   THE RECORD, on a real PostgreSQL (every migration in order, 0019 twice):
   1. 0019 applies after all the others and twice changes nothing; without
      0008 it refuses by name.
   2. ITS NUMBERS ARE THE GAME'S: gold_rate / floor / cap / the journey's
      three sums and every card's price equal CFG.GOLD and Deck.price.
   3. ONE GRANT PER RUN: grant_gold pays a run its clamp(score / RATE)
      once — asked again it answers "already" with the same sum and the
      purse unmoved — never without its run_end (no_run, a closed tab is no
      ending), never against the row's outcome, never a defeat short of its
      deeds, never a journey win (that door is grant_prologue_gold's), and
      the CAP holds for the biggest score.
   4. THE JOURNEY'S GOLD: 25 / 35 / 50, once per game per player ever (the
      same run again "already", another run "already_had").
   5. THE PURSE NEVER GOES BELOW NOTHING: buy_card short of the price
      touches nothing; the wallet's own check refuses a negative balance
      even to its owner role.
   6. A PURCHASE IS ATOMIC AND A RETRY IS NOT A SECOND ONE: the price, the
      card and the ledger line land together; the same purchase id answers
      "already" and spends nothing; a price the store did not show is
      refused with the real one.
   7. TWO TABS CANNOT SPEND ONE COIN TWICE: two sessions buying at once
      against a purse that holds one card's price — one card, one charge.
   8. THE DOORS ARE LOCKED: no stranger and no player reads or writes the
      tables; anon calls no gold door; the dashboard's door wants the
      passphrase.
   THE GAME, in a browser (served over HTTP; a mock record where it asks):
   9. A RUN IS PAID ONCE, CLIENT SIDE: Deck.settle pays the same sum the
      server would, once; the cap and the floor; an ineligible defeat
      nothing; the gold op queued under the run id.
   10. THE JOURNEY PAYS ITS SUMS ONCE (Deck.prologue).
   11. THE STORE IS THE MAIN MENU'S ALONE: opened from the title, never in
      a game (Store.open, Screens.show('store'), the pause's purse card), never
      on the journey's title.
   12. A LOCAL PURCHASE: deducts, adds the card, refuses short of the price
      and never spends below nothing.
   13. TWO TABS ON ONE DEVICE: two pages buying at once from one purse —
      one card, one charge (navigator.locks and a re-read of the disk).
   14. A CLOUD PURCHASE WHOSE ANSWER WAS LOST is asked again under the same
      id: one card, one charge.
   15. THE TEST LINK mints nothing on a real purse.
   16. THE END SCREEN'S GOLD: the headline row, its sum and purse.
   THE MARKETPLACE BUYS BACK (build 225, migration 0020_sell_card.sql):
   8b. A SALE IS ATOMIC: the card leaves, four fifths of its price lands,
      the sale is written; the same sale id again pays nothing twice; a price
      the screen did not show is refused with the real one; a card not held
      is 'none_left'; two sessions selling the last copy at once — one sale;
      the doors and the ledger are sealed; 0020 twice changes nothing and
      refuses without 0019 by name.
   17. A LOCAL SALE pays Gold.sellPrice (the record's own number) and takes
      the card; a cloud sale whose answer was lost is asked again under the
      same id: one card gone, one payment.
   18. THE MARKETPLACE: one gold plate on the title is the cards' only door;
      the hall opens on the trader and his three offers, every one in view
      and his face clear of his words, at seven sizes; a card held up shows
      its face, then its back, over the case; Sell through the screen. */
import { join, dirname } from 'node:path';
import { readdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const done = (code) => {
  for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
  console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL GOLD CHECKS PASS');
  process.exit(code != null ? code : (fails.length ? 1 : 0));
};

/* ---------------- a Supabase-shaped PostgreSQL (tests/analytics.mjs's) ---------------- */
const PGBIN = (() => {
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) for (const v of readdirSync(base).sort().reverse()) { const b = join(base, v, 'bin'); if (existsSync(join(b, 'initdb'))) return b; }
  for (const d of (process.env.PATH || '').split(':')) if (existsSync(join(d, 'initdb'))) return d;
  return null;
})();
if (!PGBIN) { ck('thereIsADatabaseToTestAgainst', false, 'no PostgreSQL server binaries (initdb) on this machine'); done(1); }
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const runAs = (cmd, args) => asRoot
  ? execFileSync('su', ['postgres', '-s', '/bin/sh', '-c', [cmd, ...args].map(a => "'" + String(a).replace(/'/g, "'\\''") + "'").join(' ')], { encoding: 'utf8' })
  : execFileSync(cmd, args, { encoding: 'utf8' });
const home = asRoot ? '/var/lib/postgresql' : tmpdir();
const DIR = mkdtempSync(join(home, 'cf-gold-'));
if (asRoot) execFileSync('chown', ['postgres:postgres', DIR]);
const PORT = 56000 + (process.pid % 900);
let started = false, srv = null, browser = null;
const stop = () => { try { if (started) runAs(join(PGBIN, 'pg_ctl'), ['-D', join(DIR, 'data'), '-m', 'immediate', 'stop']); } catch (e) {} try { rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
process.on('exit', stop);
try {
  runAs(join(PGBIN, 'initdb'), ['-D', join(DIR, 'data'), '-A', 'trust', '-U', 'postgres']);
  runAs(join(PGBIN, 'pg_ctl'), ['-D', join(DIR, 'data'), '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-l', join(DIR, 'log.txt'), '-w', 'start']);
  started = true;
} catch (e) { ck('thereIsADatabaseToTestAgainst', false, 'could not start PostgreSQL: ' + String(e.message || e).slice(0, 200)); done(1); }
const PSQL = join(PGBIN, 'psql');
const pargs = db => ['-h', DIR, '-p', String(PORT), '-U', 'postgres', '-d', db || 'cf', '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-X'];
const sql = (text, opts) => {
  opts = opts || {};
  const r = spawnSync(PSQL, pargs(opts.db), { input: text, encoding: 'utf8' });
  if (r.status !== 0) return { error: (r.stderr || '').trim() || 'psql exited ' + r.status };
  return { out: (r.stdout || '').trim() };
};
// the same, in the background: two sessions at once
const sqlAsync = (text, db) => new Promise(resolve => {
  const c = spawn(PSQL, pargs(db));
  let out = '', err = '';
  c.stdout.on('data', d => { out += d; });
  c.stderr.on('data', d => { err += d; });
  c.on('close', code => resolve(code === 0 ? { out: out.trim() } : { error: err.trim() || 'exit ' + code }));
  c.stdin.end(text);
});
const parse = r => { if (r.error) return { error: r.error }; try { return JSON.parse(r.out.split('\n').pop()); } catch (e) { return { error: 'not json: ' + r.out.slice(0, 200) }; } };
const json = (text, opts) => parse(sql(text, opts));
const lit = v => v == null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const SCAFFOLD = `
  do $r$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $r$;
  create schema auth; create schema extensions;
  create extension if not exists pgcrypto with schema extensions;
  create table auth.users (id uuid primary key, created_at timestamptz default now(), is_anonymous boolean default true);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, extensions, public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`;
const MIG = join(root, 'supabase/migrations');
const files = readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const F19 = '0019_gold_store.sql', F20 = '0020_sell_card.sql';
const make = (db) => { sql('create database ' + db + ';', { db: 'postgres' }); return sql(SCAFFOLD, { db }); };
const P = n => '00000000-0000-0000-0000-0000000009' + String(n).padStart(2, '0');
const as = (n, q) => `set role authenticated; set request.jwt.claim.sub = '${P(n)}'; ${q}`;
const say = o => o && (o.ok ? 'ok' + (o.already ? ' (already)' : '') : (o.reason || o.error || '?'));

/* ================= 1. THE MIGRATION ================= */
{
  const s0 = make('cf');
  const broke = [];
  for (const f of files) { const r = sql(readFileSync(join(MIG, f), 'utf8')); if (r.error) broke.push(f + ': ' + r.error.split('\n')[0]); }
  ck('everyMigrationAppliesInOrderWithTheGold', !s0.error && broke.length === 0 && files.includes(F19), broke.join(' | ') || files.length + ' files');
  const again = sql(readFileSync(join(MIG, F19), 'utf8'));
  ck('andTheGoldTwiceChangesNothing', !again.error, again.error ? again.error.split('\n')[0] : 'applied a second time cleanly');
  // 0020 is pasted after any re-paste of 0019 (it re-creates my_gold), and twice changes nothing
  const sale1 = sql(readFileSync(join(MIG, F20), 'utf8')), sale2 = sql(readFileSync(join(MIG, F20), 'utf8'));
  ck('andTheSaleAppliesAfterItAndTwiceChangesNothing', files.includes(F20) && !sale1.error && !sale2.error, (sale1.error || sale2.error || 'applied twice cleanly').split('\n')[0]);
  make('cf_bare');
  for (const f of files.filter(f => f < '0008')) sql(readFileSync(join(MIG, f), 'utf8'), { db: 'cf_bare' });
  const bare = sql(readFileSync(join(MIG, F19), 'utf8'), { db: 'cf_bare' });
  ck('itRefusesWithoutTheCardsByName', !!bare.error && /0008/.test(bare.error), bare.error ? (bare.error.split('\n').find(l => /0008/.test(l)) || bare.error.split('\n')[0]) : 'it applied');
  const bare20 = sql(readFileSync(join(MIG, F20), 'utf8'), { db: 'cf_bare' });
  ck('andTheSaleRefusesWithoutTheGoldByName', !!bare20.error && /0019/.test(bare20.error), bare20.error ? (bare20.error.split('\n').find(l => /0019/.test(l)) || bare20.error.split('\n')[0]) : 'it applied');
}

/* the record's numbers, read for section 2 (checked against the page's) */
const SQLN = {
  rate: +sql('select public.gold_rate();').out, floor: +sql('select public.gold_floor();').out, cap: +sql('select public.gold_cap();').out,
  pro: [1, 2, 3].map(g => +sql(`select public.gold_prologue(${g});`).out),
  prices: Object.fromEntries((sql("select card_key || '=' || price from public.card_prices order by card_key;").out || '').split('\n').filter(Boolean).map(l => l.split('=')).map(([k, v]) => [k, +v])),
  tierOf: Object.fromEntries((sql("select card_key || '=' || tier from public.card_catalog where active order by card_key;").out || '').split('\n').filter(Boolean).map(l => l.split('='))),
  drops: Object.fromEntries((sql("select tbl || ':' || string_agg(tier, ',' order by tier) from public.card_drop_tiers group by tbl;").out || '').split('\n').filter(Boolean).map(l => l.split(':'))),
  sellPct: +sql('select public.card_sell_pct();').out,
  sell: Object.fromEntries((sql("select card_key || '=' || public.card_sell_price(card_key) from public.card_prices order by card_key;").out || '').split('\n').filter(Boolean).map(l => l.split('=')).map(([k, v]) => [k, +v])),
};

/* ================= 3. ONE GRANT PER RUN ================= */
{
  const ends = [
    [1, 'w8000', 'win', 'moderate', 8000, 9, null], [1, 'w40000', 'win', 'hard', 40000, 9, null], [1, 'w100', 'win', 'calm', 100, 0, null],
    [1, 'l-deeds', 'loss', 'moderate', 3000, 9, null], [1, 'l-short', 'loss', 'moderate', 3000, 2, null],
    [1, 'tab', 'abandoned', 'moderate', 500, 9, 'closed_tab'], [1, 'pro1', 'win', 'prologue_1', 900, 0, null],
    [2, 'pro1b', 'win', 'prologue_1', 900, 0, null], [2, 'pro2', 'win', 'prologue_2', 900, 0, null], [2, 'pro3', 'win', 'prologue_3', 900, 0, null],
  ];
  const load = sql(`insert into auth.users (id) values ('${P(1)}'), ('${P(2)}'), ('${P(3)}'), ('${P(4)}'), ('${P(5)}');
    insert into public.profiles (id) select id from auth.users on conflict do nothing;
    insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, day, seconds, score, props) values
    ${ends.map(([n, run, o, m, s, d, c]) => `('${P(n)}', ${lit(run)}, 'run_end', ${lit(o)}, ${lit(c || (o === 'win' ? 'razed_rival_tc' : 'tc_destroyed'))}, ${lit(m)}, 90, 2000, ${lit(s)}, '{"deeds": ${d}}')`).join(',\n    ')};`);
  const g = (n, run, outcome) => json(as(n, `select public.grant_gold(${lit(run)}, ${lit(outcome)});`));
  const bal = n => +(sql(`select coalesce((select balance from public.gold_wallet where user_id = '${P(n)}'), 0);`).out || -1);
  const r = { w: g(1, 'w8000', 'win') };
  const b1 = bal(1);
  r.again = g(1, 'w8000', 'win');
  const b2 = bal(1);
  r.cap = g(1, 'w40000', 'win'); r.floor = g(1, 'w100', 'win'); r.loss = g(1, 'l-deeds', 'loss');
  r.short = g(1, 'l-short', 'loss'); r.tab = g(1, 'tab', 'loss'); r.none = g(1, 'never', 'win');
  r.mismatch = g(1, 'l-short', 'win'); r.pro = g(1, 'pro1', 'win');
  const want = 8000 / SQLN.rate;
  ck('aRunIsPaidItsScoreOnce', !load.error && r.w.ok === true && r.w.amount === want && b1 === want && r.again.ok === true && r.again.already === true && r.again.amount === want && b2 === want,
    load.error ? load.error.split('\n')[0] : `8,000 points: ${say(r.w)} +${r.w.amount}, asked again ${say(r.again)} +${r.again.amount}; purse ${b1} then ${b2}`);
  ck('theCapAndTheFloorHold', r.cap.amount === SQLN.cap && r.floor.amount === SQLN.floor && r.loss.amount === Math.max(SQLN.floor, Math.floor(3000 / SQLN.rate)),
    `40,000 → ${r.cap.amount} (cap ${SQLN.cap}), 100 → ${r.floor.amount} (floor ${SQLN.floor}), an earned defeat of 3,000 → ${r.loss.amount}`);
  ck('noEndingNoGold', r.none.reason === 'no_run' && r.tab.reason === 'no_run' && r.mismatch.reason === 'outcome_mismatch' && r.short.reason === 'not_earned',
    `no row ${say(r.none)}, a closed tab ${say(r.tab)}, the wrong outcome ${say(r.mismatch)}, a defeat short of its deeds ${say(r.short)}`);
  ck('aJourneyWinIsNotThisDoorsToPay', r.pro.ok === false && r.pro.reason === 'prologue', `grant_gold on a prologue_1 win: ${say(r.pro)}`);
  const total = want + SQLN.cap + SQLN.floor + r.loss.amount;
  ck('andThePurseIsTheSumOfItsGrants', bal(1) === total, `purse ${bal(1)}, grants ${total}`);

  /* ================= 4. THE JOURNEY'S GOLD ================= */
  const pg = (n, run, game) => json(as(n, `select public.grant_prologue_gold(${lit(run)}, ${game});`));
  const p = { one: pg(2, 'pro1b', 1) };
  p.again = pg(2, 'pro1b', 1); p.other = pg(2, 'pro2', 1); p.two = pg(2, 'pro2', 2); p.three = pg(2, 'pro3', 3); p.none = pg(3, 'pro1', 1);
  ck('theJourneyPaysItsThreeSumsOnceEach', p.one.amount === SQLN.pro[0] && p.again.already === true && p.other.reason === 'already_had' &&
    p.two.amount === SQLN.pro[1] && p.three.amount === SQLN.pro[2] && bal(2) === SQLN.pro[0] + SQLN.pro[1] + SQLN.pro[2] && p.none.reason === 'no_run',
    `game 1 +${p.one.amount} (again ${say(p.again)}, another run ${say(p.other)}), game 2 +${p.two.amount}, game 3 +${p.three.amount}; purse ${bal(2)}; someone else's run ${say(p.none)}`);

  /* ================= 5-6. THE PURSE AND THE PURCHASE ================= */
  // player 4 has the journey's 110: enough for one Bronze card, not two
  for (const [run, game] of [['p4a', 1], ['p4b', 2], ['p4c', 3]]) sql(`insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode) values ('${P(4)}', '${run}', 'run_end', 'win', 'razed_rival_tc', 'prologue_${game}');`);
  for (const [run, game] of [['p4a', 1], ['p4b', 2], ['p4c', 3]]) pg(4, run, game);
  const start = bal(4), price = SQLN.prices.war_band;
  const qty = (n, c) => +(sql(`select coalesce((select qty from public.card_collection where user_id = '${P(n)}' and card_key = ${lit(c)}), 0);`).out || -1);
  const buy = (n, c, id, pr) => json(as(n, `select public.buy_card(${lit(c)}, ${lit(id)}, ${pr == null ? 'null' : pr});`));
  const q0 = qty(4, 'war_band');
  const b = { wrong: buy(4, 'war_band', 'b0', price + 1) };
  const bw = bal(4);
  b.ok = buy(4, 'war_band', 'b1', price);
  const ba = bal(4), qa = qty(4, 'war_band');
  b.retry = buy(4, 'war_band', 'b1', price);
  const br = bal(4), qr = qty(4, 'war_band');
  b.short = buy(4, 'war_band', 'b2', price);
  const bs = bal(4), qs = qty(4, 'war_band');
  b.unknown = buy(4, 'no_such_card', 'b3', 10);
  const rows = +sql(`select count(*) from public.gold_purchases where user_id = '${P(4)}';`).out;
  ck('aPurchaseTakesThePriceAndGivesTheCardTogether', b.ok.ok === true && ba === start - price && qa === q0 + 1 && b.ok.gold === ba && b.ok.qty === qa && rows === 1,
    `purse ${start} → ${ba}, war band ×${q0} → ×${qa}, one ledger line (${rows})`);
  ck('aRetryOfTheSamePurchaseSpendsNothing', b.retry.ok === true && b.retry.already === true && br === ba && qr === qa,
    `the same id again: ${say(b.retry)}, purse ${br}, held ×${qr}`);
  ck('aPurseShortOfThePriceIsNotTouched', b.short.ok === false && b.short.reason === 'not_enough' && bs === ba && qs === qa && b.short.gold === ba,
    `${ba} gold for a ${price} card: ${say(b.short)}, purse ${bs}, held ×${qs}`);
  ck('aPriceTheStoreDidNotShowIsRefusedWithTheRealOne', b.wrong.ok === false && b.wrong.reason === 'price_changed' && b.wrong.price === price && bw === start,
    `sent ${price + 1}: ${say(b.wrong)} (the real price ${b.wrong.price}), purse ${bw}`);
  ck('andAnUnknownCardIsNotForSale', b.unknown.reason === 'not_for_sale', say(b.unknown));
  const neg = sql(`update public.gold_wallet set balance = -1 where user_id = '${P(4)}';`);
  ck('theWalletItselfRefusesANegativePurse', !!neg.error && /check/i.test(neg.error), neg.error ? neg.error.split('\n')[0] : 'a negative balance was written');
}

/* ================= 7. TWO SESSIONS AT ONCE ================= */
{
  // player 5: exactly one Bronze card's price, then two purchases in flight together
  const price = SQLN.prices.war_band;
  sql(`insert into public.gold_wallet (user_id, balance, earned) values ('${P(5)}', ${price}, ${price}) on conflict (user_id) do update set balance = ${price};`);
  const one = as(5, `begin; select public.buy_card('war_band', 'tabA', ${price}); select pg_sleep(1.2); commit;`);
  const two = as(5, `select pg_sleep(0.3); select public.buy_card('veterans', 'tabB', ${SQLN.prices.veterans});`);
  const [a, b] = await Promise.all([sqlAsync(one, 'cf'), sqlAsync(two, 'cf')]);
  const A = parse({ out: (a.out || '').split('\n').filter(l => l.startsWith('{')).pop() || '' }), B = parse({ out: (b.out || '').split('\n').filter(l => l.startsWith('{')).pop() || '' });
  const bal = +sql(`select balance from public.gold_wallet where user_id = '${P(5)}';`).out;
  const bought = +sql(`select count(*) from public.gold_purchases where user_id = '${P(5)}';`).out;
  ck('twoTabsCannotSpendOneCoinTwice', A.ok === true && B.ok === false && B.reason === 'not_enough' && bal === 0 && bought === 1,
    `the first ${say(A)}, the second (in flight beside it) ${say(B)}; purse ${bal}, purchases ${bought}` + (a.error || b.error ? ' — ' + (a.error || b.error).split('\n')[0] : ''));
}

/* ================= 8. THE DOORS ARE LOCKED ================= */
{
  const anonRead = sql(`set role anon; select count(*) from public.gold_wallet;`);
  const userRead = sql(as(1, 'select count(*) from public.gold_purchases;'));
  const userWrite = sql(as(1, `update public.gold_wallet set balance = 99999 where user_id = '${P(1)}';`));
  const anonBuy = sql(`set role anon; select public.buy_card('war_band', 'x', 100);`);
  const anonGrant = sql(`set role anon; select public.grant_gold('w8000', 'win');`);
  const credit = sql(as(1, `select public.gold_credit('${P(1)}', 5000);`));
  const denied = e => !!e && /permission denied/.test(e);
  ck('theTablesAndTheInnerDoorsAreSealed', denied(anonRead.error) && denied(userRead.error) && denied(userWrite.error) && denied(anonBuy.error) && denied(anonGrant.error) && denied(credit.error),
    [['anon reads the wallet', anonRead], ['a player reads the ledger', userRead], ['a player writes their purse', userWrite],
      ['anon buys', anonBuy], ['anon asks for gold', anonGrant], ['a player credits themselves', credit]]
      .filter(([, r]) => !denied(r.error)).map(([k]) => k + ' was allowed').join('; ') || 'every one refused');
  const mine = json(as(1, 'select public.my_gold();'));
  ck('myGoldIsThePursePlusThePriceList', mine.ok === true && mine.gold === +sql(`select balance from public.gold_wallet where user_id = '${P(1)}';`).out &&
    Object.keys(mine.prices || {}).length === Object.keys(SQLN.tierOf).length && mine.prices.dragonfire === SQLN.prices.dragonfire,
    `gold ${mine.gold}, ${Object.keys(mine.prices || {}).length} prices`);
  const PASS = 'a long test passphrase', TOKEN = createHash('sha256').update('clanfire-analytics-v1:' + PASS).digest('hex');
  sql(`select public.set_analytics_token(${lit(PASS)});`);
  const dash = json(`set role anon; select public.analytics_gold(${lit(TOKEN)}, now() - interval '30 days', null, true);`);
  const bad = json(`set role anon; select public.analytics_gold('nope', now() - interval '30 days', null, true);`);
  ck('theDashboardsGoldDoorWantsThePassphrase', dash.ok === true && bad.ok !== true && Array.isArray(dash.earned) && dash.spent && dash.spent.purchases >= 2,
    dash.error ? dash.error.split('\n')[0] : `with it: ${dash.ok ? 'answered (' + (dash.spent && dash.spent.purchases) + ' purchases)' : say(dash)}; without: ${say(bad)}`);
}

/* ================= 8b. THE TRADER BUYS BACK (0020) ================= */
{
  sql(`insert into auth.users (id) values ('${P(6)}'), ('${P(7)}') on conflict do nothing;
    insert into public.profiles (id) values ('${P(6)}'), ('${P(7)}') on conflict do nothing;
    insert into public.card_collection (user_id, card_key, qty) values ('${P(6)}', 'war_band', 2), ('${P(6)}', 'veterans', 1), ('${P(7)}', 'war_band', 1);`);
  const qty = (n, c) => +(sql(`select coalesce((select qty from public.card_collection where user_id = '${P(n)}' and card_key = ${lit(c)}), 0);`).out || -1);
  const bal = n => +(sql(`select coalesce((select balance from public.gold_wallet where user_id = '${P(n)}'), 0);`).out || -1);
  const sell = (n, c, id, pr) => json(as(n, `select public.sell_card(${lit(c)}, ${lit(id)}, ${pr == null ? 'null' : pr});`));
  const wb = SQLN.sell.war_band, vt = SQLN.sell.veterans;
  const r = { wrong: sell(6, 'war_band', 's0', wb + 1) };
  const q0 = qty(6, 'war_band'), b0 = bal(6);
  r.ok = sell(6, 'war_band', 's1', wb);
  const q1 = qty(6, 'war_band'), b1 = bal(6);
  r.retry = sell(6, 'war_band', 's1', wb);
  const q2 = qty(6, 'war_band'), b2 = bal(6);
  r.last = sell(6, 'veterans', 's2', vt);
  r.none = sell(6, 'veterans', 's3', vt);
  r.unknown = sell(6, 'no_such_card', 's4', 10);
  const rows = +sql(`select count(*) from public.gold_sales where user_id = '${P(6)}';`).out;
  const sold = +sql(`select sold from public.gold_wallet where user_id = '${P(6)}';`).out;
  ck('aSaleTakesTheCardAndPaysFourFifths', SQLN.sellPct === 80 && wb === Math.floor(SQLN.prices.war_band * 0.8 + 0.5) && r.ok.ok === true && q1 === q0 - 1 && b1 === b0 + wb && r.ok.gold === b1 && r.ok.qty === q1,
    `${SQLN.sellPct}% of ${SQLN.prices.war_band} = ${wb}: ${say(r.ok)}, war band ×${q0} → ×${q1}, purse ${b0} → ${b1}`);
  ck('aRetryOfTheSameSalePaysNothingTwice', r.retry.ok === true && r.retry.already === true && q2 === q1 && b2 === b1, `the same id again: ${say(r.retry)}, ×${q2}, purse ${b2}`);
  ck('theLastCopySellsAndThenThereIsNoneLeft', r.last.ok === true && r.last.qty === 0 && r.none.ok === false && r.none.reason === 'none_left' && qty(6, 'veterans') === 0 && bal(6) === b2 + vt && rows === 2 && sold === wb + vt,
    `the last veterans: ${say(r.last)}, then ${say(r.none)}; ${rows} sales, sold ${sold}`);
  ck('aSalePriceTheScreenDidNotShowIsRefused', r.wrong.ok === false && r.wrong.reason === 'price_changed' && r.wrong.price === wb && r.wrong.buy === SQLN.prices.war_band,
    `sent ${wb + 1}: ${say(r.wrong)} (the real ${r.wrong.price}, the list ${r.wrong.buy})`);
  ck('andAnUnknownCardIsNotBought', r.unknown.reason === 'not_for_sale', say(r.unknown));
  // two sessions selling player 7's only war band at once: one sale
  const one = as(7, `begin; select public.sell_card('war_band', 'tA', ${wb}); select pg_sleep(1.2); commit;`);
  const two = as(7, `select pg_sleep(0.3); select public.sell_card('war_band', 'tB', ${wb});`);
  const [a, b] = await Promise.all([sqlAsync(one, 'cf'), sqlAsync(two, 'cf')]);
  const A = parse({ out: (a.out || '').split('\n').filter(l => l.startsWith('{')).pop() || '' }), B = parse({ out: (b.out || '').split('\n').filter(l => l.startsWith('{')).pop() || '' });
  ck('twoTabsCannotSellOneCardTwice', A.ok === true && B.ok === false && B.reason === 'none_left' && bal(7) === wb && qty(7, 'war_band') === 0,
    `the first ${say(A)}, the second ${say(B)}; purse ${bal(7)}, war band ×${qty(7, 'war_band')}`);
  const denied = e => !!e && /permission denied/.test(e);
  const anonSell = sql(`set role anon; select public.sell_card('war_band', 'x', ${wb});`);
  const userRead = sql(as(6, 'select count(*) from public.gold_sales;'));
  const inner = sql(as(6, "select public.card_sell_price('war_band');"));
  ck('theSaleDoorsAreSealed', denied(anonSell.error) && denied(userRead.error) && denied(inner.error),
    [['anon sells', anonSell], ['a player reads the sales', userRead], ['a player asks the inner price', inner]].filter(([, x]) => !denied(x.error)).map(([k]) => k + ' was allowed').join('; ') || 'every one refused');
  const mine = json(as(6, 'select public.my_gold();'));
  ck('myGoldSaysTheTradersShare', mine.ok === true && mine.sell_pct === 80 && mine.sales === 2 && mine.sold === wb + vt, `sell_pct ${mine.sell_pct}, sales ${mine.sales}, sold ${mine.sold}`);
}

/* ================= the game, in a browser ================= */
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.woff2': 'font/woff2', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
srv = createServer(async (rq, rs) => {
  try {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    const f = join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
    if (!f.startsWith(root)) { rs.writeHead(403); rs.end(); return; }
    const body = await readFile(f);
    rs.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' });
    rs.end(body);
  } catch (e) { rs.writeHead(404); rs.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/index.html`;
browser = await pw.chromium.launch();
const errs = [];
const VETERAN = () => { try { localStorage.setItem('neo-prologue', JSON.stringify({ v: 1, veteran: true, done: 3 })); localStorage.setItem('neo-cards-intro', '1'); } catch (e) {} };
async function page(o) {
  o = o || {};
  const ctx = o.ctx || await browser.newContext({ viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: o.dpr || 2 });
  if (!o.ctx) { await ctx.addInitScript(VETERAN); if (o.mock) await ctx.addInitScript(o.mock); }
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.goto(URL0 + (o.q || '?prologue=0'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof Screens !== 'undefined' && Screens.current === 'title' && typeof Gold !== 'undefined', null, { timeout: 30000 });
  await p.evaluate(() => { try { Boot.force(); } catch (e) {} });
  return { p, ctx };
}
/* the record, played by a mock (the deck-sync suite's pattern): the gold
   doors with 0019's rules, a switch that loses buy_card's answer after the
   purchase is made */
const MOCK = `
  window.__G = (() => {
    const st = { uid: 'uid-G', calls: [], ends: {}, wallet: 0, buys: {}, sales: {}, counts: {}, lose: 0, prices: null };
    const session = () => ({ access_token: 't-' + st.uid, refresh_token: 'r', user: { id: st.uid } });
    const auth = {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: session() }, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; },
    };
    const price = k => (st.prices && st.prices[k]) || 100;
    const doors = {
      claim_starter_hand() { return { ok: true, already: true }; },
      my_cards() { return { ok: true, uid: st.uid, counts: Object.assign({}, st.counts), seen: {}, starter: true, pity: 0, medians: {} }; },
      my_gold() { return { ok: true, uid: st.uid, gold: st.wallet, earned: 0, spent: 0, bought: 0, prologue: [], prices: st.prices || {} }; },
      // st.cardsMute: the card door answers nothing of ours, so the cards' drain stops
      grant_card() { return st.cardsMute ? null : { ok: true, already: true, cards: [] }; },
      grant_gold(a) { st.goldAsked = (st.goldAsked || 0) + 1; return { ok: true, amount: 10, gold: st.wallet }; },
      buy_card(a) {
        // the answer lost on the wire (every retry of the transport too), the purchase made
        const lost = () => { if (st.lose > 0) { st.lose--; throw new TypeError('Failed to fetch'); } };
        if (st.buys[a.p_purchase_id]) { lost(); return { ok: true, already: true, card: a.p_card_key, price: price(a.p_card_key), gold: st.wallet, qty: st.counts[a.p_card_key] || 0 }; }
        const pr = price(a.p_card_key);
        if (a.p_price != null && a.p_price !== pr) return { ok: false, reason: 'price_changed', price: pr, gold: st.wallet };
        if (st.wallet < pr) return { ok: false, reason: 'not_enough', price: pr, gold: st.wallet };
        st.wallet -= pr; st.buys[a.p_purchase_id] = 1; st.counts[a.p_card_key] = (st.counts[a.p_card_key] || 0) + 1;
        lost();
        return { ok: true, card: a.p_card_key, price: pr, gold: st.wallet, qty: st.counts[a.p_card_key] };
      },
      // 0020's door, its rules: four fifths, once per sale id, never a card not held
      sell_card(a) {
        const lost = () => { if (st.lose > 0) { st.lose--; throw new TypeError('Failed to fetch'); } };
        const k = a.p_card_key, pr = Math.floor(price(k) * 0.8 + 0.5);
        if (st.sales[a.p_sale_id]) { lost(); return { ok: true, already: true, card: k, price: pr, gold: st.wallet, qty: st.counts[k] || 0 }; }
        if (a.p_price != null && a.p_price !== pr) return { ok: false, reason: 'price_changed', price: pr, buy: price(k), gold: st.wallet };
        if (!(st.counts[k] > 0)) return { ok: false, reason: 'none_left', price: pr, gold: st.wallet };
        st.counts[k]--; st.wallet += pr; st.sales[a.p_sale_id] = 1;
        lost();
        return { ok: true, card: k, price: pr, gold: st.wallet, qty: st.counts[k] };
      },
    };
    const rest = (method, path, body) => {
      st.calls.push({ method, path, body: body == null ? null : JSON.parse(JSON.stringify(body)) });
      if (path.startsWith('/rpc/')) { const n = path.slice(5); return doors[n] ? doors[n](body || {}) : null; }
      if (path.startsWith('/profiles') && method === 'GET') return [{ id: st.uid }];
      return method === 'GET' ? [] : null;
    };
    return { st, auth, rest };
  })();
  window.__NEO_BACKEND_MOCK = { auth: window.__G.auth, rest: window.__G.rest };
`;

/* ================= 2. ITS NUMBERS ARE THE GAME'S ================= */
{
  const { p, ctx } = await page();
  const g = await p.evaluate(() => ({ G: CFG.GOLD, prices: Object.fromEntries(Deck.CATALOG.map(c => [c.id, Deck.price(c.id)])),
    sell: Object.fromEntries(Deck.CATALOG.map(c => [c.id, Gold.sellPrice(c.id)])),
    drops: CFG.CARDS.DROPS, bonus: CFG.CARDS.BONUS }));
  const off = Object.keys(SQLN.prices).filter(k => SQLN.prices[k] !== g.prices[k]).concat(Object.keys(g.prices).filter(k => !(k in SQLN.prices)));
  ck('theRecordsNumbersAreTheGames', g.G.RATE === SQLN.rate && g.G.FLOOR === SQLN.floor && g.G.CAP === SQLN.cap &&
    [1, 2, 3].every((n, i) => g.G.PROLOGUE[n] === SQLN.pro[i]) && off.length === 0,
    `rate ${g.G.RATE}/${SQLN.rate}, floor ${g.G.FLOOR}/${SQLN.floor}, cap ${g.G.CAP}/${SQLN.cap}, journey ${[1, 2, 3].map(n => g.G.PROLOGUE[n])}/${SQLN.pro}; prices apart: ${off.join(', ') || 'none'}`);
  // the trader's share and every card's sale price are the record's (0020's card_sell_pct, card_sell_price)
  const soff = Object.keys(SQLN.sell).filter(k => SQLN.sell[k] !== g.sell[k]);
  ck('theTradersShareIsTheRecords', Math.round(g.G.SELL * 100) === SQLN.sellPct && soff.length === 0,
    `SELL ${g.G.SELL} / ${SQLN.sellPct}%; sale prices apart: ${soff.map(k => k + ' ' + g.sell[k] + '/' + SQLN.sell[k]).join(', ') || 'none'}`);
  // every tier a table can roll is one the record lets it grant (0019 widened moderate and hard)
  const TIERS = ['stone', 'bronze', 'iron', 'imperial', 'enlight'];
  const gap = [];
  for (const [tbl, w] of Object.entries(g.drops)) {
    const allowed = (SQLN.drops[tbl] || '').split(',');
    w.forEach((x, i) => { if (x > 0 && !allowed.includes(TIERS[i])) gap.push(tbl + ':' + TIERS[i]); });
  }
  ck('everyTierATableRollsTheRecordGrants', gap.length === 0, gap.join(', ') || 'every table covered');
  ck('theMythicOddsAreHalved', g.drops.moderate[4] === 2.5 && g.drops.hard[4] === 12.5 && g.bonus > 0 && g.bonus <= 0.5 &&
    Object.values(g.drops).every(w => Math.abs(w.reduce((a, b) => a + b, 0) - 100) < 1e-9),
    `Moderate ${g.drops.moderate}, Hard ${g.drops.hard}, the second card ${g.bonus}`);
  await ctx.close();
}

/* ================= 9-10. A RUN IS PAID ONCE, CLIENT SIDE; THE JOURNEY ================= */
{
  const { p, ctx } = await page();
  const r = await p.evaluate(() => {
    Deck._col = null; Deck._del(Deck.KEY); Deck.ensureStarter();
    const G = CFG.GOLD, rep = (key, win, score, deeds, days) => ({ win, cause: win ? 'razed_rival_tc' : 'tc_destroyed', mode: 'moderate', day: 90, seconds: 900,
      subtotal: score, score, deeds: deeds || 0, actDays: days || 0, runId: key, key });
    const out = {};
    out.win = Deck.settle(rep('run-1', true, 8000)).gold;
    out.p1 = Deck.gold();
    out.again = Deck.settle(rep('run-1', true, 8000)).gold;
    out.p2 = Deck.gold();
    out.cap = Deck.settle(rep('run-2', true, 999999)).gold;
    out.floor = Deck.settle(rep('run-3', true, 10)).gold;
    out.lossShort = Deck.settle(rep('run-4', false, 9000, 2, 2)).gold;
    out.lossOk = Deck.settle(rep('run-5', false, 3000, 9, 9)).gold;
    out.ops = Deck.col().gq.map(o => o.op + ':' + o.run + ':' + o.amount);
    out.rate = G.RATE; out.cap0 = G.CAP; out.floor0 = G.FLOOR;
    out.pro1 = Deck.prologue(1, 'pro-run-1').gold;
    out.pro1again = (Deck.prologue(1, 'pro-run-1') || { gold: 0 }).gold;
    out.pro2 = Deck.prologue(2, 'pro-run-2').gold;
    out.pro3 = Deck.prologue(3, 'pro-run-3').gold;
    out.proOps = Deck.col().gq.filter(o => o.op === 'gold_pro').map(o => o.game + ':' + o.amount);
    out.final = Deck.gold();
    return out;
  });
  const want = 8000 / r.rate;
  ck('aRunIsPaidOnceOnTheDevice', r.win === want && r.p1 === want && r.again === want && r.p2 === want,
    `+${r.win}, purse ${r.p1}; settled again +${r.again}, purse ${r.p2}`);
  ck('theDeviceAppliesTheCapTheFloorAndTheEarnRule', r.cap === r.cap0 && r.floor === r.floor0 && r.lossShort === 0 && r.lossOk === Math.floor(3000 / r.rate),
    `cap ${r.cap}, floor ${r.floor}, a defeat short of its deeds ${r.lossShort}, an earned one ${r.lossOk}`);
  ck('andEachPaidRunQueuesOneOpForTheRecord', r.ops.length === 4 && r.ops[0] === 'gold:run-1:' + want, r.ops.join(' '));
  ck('theJourneyPaysItsSumsOnceOnTheDevice', r.pro1 === SQLN.pro[0] && r.pro1again === 0 && r.pro2 === SQLN.pro[1] && r.pro3 === SQLN.pro[2] && r.proOps.join() === `1:${SQLN.pro[0]},2:${SQLN.pro[1]},3:${SQLN.pro[2]}`,
    `game 1 +${r.pro1} (again +${r.pro1again}), game 2 +${r.pro2}, game 3 +${r.pro3}; ops ${r.proOps.join(' ')}`);
  await ctx.close();
}

/* ================= 11. THE STORE IS THE MAIN MENU'S ALONE ================= */
{
  const { p, ctx } = await page({ q: '?prologue=0&cards=all' });
  const r = await p.evaluate(async () => {
    const out = {};
    out.plate = !!document.getElementById('btnTitleStore');
    out.fromTitle = Store.open('title') && Screens.current === 'store';
    // the Marketplace opens on its three offers; Buy shows every card of the catalog
    out.offers = [...document.querySelectorAll('#scrStore .mkOffer')].filter(e => e.getClientRects().length).map(e => e.dataset.mode).join();
    Store.setMode('buy');
    out.items = document.querySelectorAll('#scrStore .stItem').length;
    /* NO COUNT ON THE SHELF (build 224 — the operator: "remove the card
       numbers in the store, you can buy as many as you want that you have
       money for. No limits to the store right now"): the test deck holds one
       of every card, and no ware says so; a purchase adds no badge either */
    const marks = () => [...document.querySelectorAll('#scrStore .stItem')].filter(b => b.querySelector('.stHave') || /×\s*\d/.test(b.textContent)).length;
    out.marks = marks();
    const c0 = Deck.col(); c0.gold = 500; Deck.saveCol(); Store.paint();
    const n0 = Deck.count('war_band');
    Store.look('war_band');
    await Store._tapBuy();
    await new Promise(res => setTimeout(res, 1600));
    out.bought = Deck.count('war_band') - n0;
    out.marks2 = marks();
    out.title = document.querySelector('#scrTitle .trow3 #btnTitleStore') ? 'row' : document.getElementById('btnTitleStore') ? 'elsewhere' : 'none';
    Store.back();
    out.backHome = Screens.current === 'title';
    // a game
    Screens._demo = false;
    G.newGame('gold-ingame', 'moderate', 'medium');
    Screens.show('playing');
    out.inGameOpen = Store.open('title');
    Screens.show('store');
    out.inGameShow = Screens.current;
    Screens.show('paused');
    out.pauseDoor = !!document.querySelector('#scrSetx [data-act="store"]');
    if (window.SettingsPage) SettingsPage.open('general');
    out.pauseDoorGeneral = !!document.querySelector('#scrSetx [data-act="store"]');
    out.pausePurse = !!document.querySelector('#scrSetx .sxGold');
    return out;
  });
  ck('theStoreOpensFromTheTitle', r.plate && r.title === 'row' && r.fromTitle && r.offers === 'buy,sell,own' && r.items === 36 && r.backHome,
    `plate ${r.plate} (${r.title}), opened ${r.fromTitle} on its offers (${r.offers}), Buy with ${r.items} cards, back to the title ${r.backHome}`);
  ck('andNoWareWearsACount', r.marks === 0 && r.bought === 1 && r.marks2 === 0, `${r.marks} of ${r.items} wares wear a count, every card held once; one bought through the stall, then ${r.marks2}`);
  ck('butNeverOverAGame', r.inGameOpen === false && r.inGameShow !== 'store' && !r.pauseDoor && !r.pauseDoorGeneral && r.pausePurse,
    `Store.open ${r.inGameOpen}, Screens.show('store') → ${r.inGameShow}, the pause's store door ${r.pauseDoor || r.pauseDoorGeneral}, its purse shown ${r.pausePurse}`);
  await ctx.close();
  // the journey's title keeps to its path
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(URL0 + '?prologue=reset', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => typeof Screens !== 'undefined' && Screens.current === 'title' && document.getElementById('scrTitle').classList.contains('pro'), null, { timeout: 30000 }).catch(() => {});
  const j = await p2.evaluate(() => {
    const b = document.getElementById('btnTitleStore');
    return { pro: document.getElementById('scrTitle').classList.contains('pro'), shown: !!b && b.getClientRects().length > 0, open: Store.allowed() };
  });
  ck('andNeverOnTheJourneysTitle', j.pro && !j.shown && !j.open, `journey title ${j.pro}, the plate shown ${j.shown}, the store allowed ${j.open}`);
  await ctx2.close();
}

/* ================= 12. A LOCAL PURCHASE ================= */
{
  const { p, ctx } = await page({ q: '?prologue=0&cards=all' });
  const r = await p.evaluate(async () => {
    const c = Deck.col(); c.gold = 150; Deck.saveCol();
    const out = { mode: Gold.mode(), price: Deck.price('war_band'), n0: Deck.count('war_band') };
    out.a = await Gold.buy('war_band');
    out.g1 = Gold.balance(); out.n1 = Deck.count('war_band');
    out.b = await Gold.buy('war_band');
    out.g2 = Gold.balance(); out.n2 = Deck.count('war_band');
    out.disk = JSON.parse(localStorage.getItem(Deck.KEY)).gold;
    return out;
  });
  ck('aLocalPurchaseDeductsAndAddsTheCard', r.mode === 'local' && r.a.ok && r.g1 === 150 - r.price && r.n1 === r.n0 + 1,
    `mode ${r.mode}: ${r.a.ok ? 'bought' : r.a.reason}, purse 150 → ${r.g1}, held ×${r.n0} → ×${r.n1}`);
  ck('andRefusesWhatThePurseCannotPay', !r.b.ok && r.b.reason === 'not_enough' && r.b.need === r.price - r.g1 && r.g2 === r.g1 && r.n2 === r.n1 && r.disk >= 0,
    `${r.g1} gold for ${r.price}: ${r.b.reason} (${r.b.need} more), purse ${r.g2}, held ×${r.n2}, the disk ${r.disk}`);
  /* 13. TWO TABS ON ONE DEVICE */
  const p2 = await ctx.newPage();
  await p2.goto(URL0 + '?prologue=0&cards=all', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => typeof Gold !== 'undefined' && typeof Screens !== 'undefined' && Screens.current === 'title', null, { timeout: 30000 });
  await p.evaluate(() => { Deck._col = null; const c = Deck.col(); c.gold = Deck.price('war_band'); Deck.saveCol(); });
  await p2.evaluate(() => { Deck._col = null; Deck.col(); });
  const [a, b] = await Promise.all([p.evaluate(() => Gold.buy('war_band')), p2.evaluate(() => Gold.buy('war_band'))]);
  const disk = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem(Deck.KEY)); return { gold: c.gold, n: c.counts.war_band, buys: Object.keys(c.buys).length }; });
  ck('twoTabsOnOneDeviceCannotSpendOneCoinTwice', [a, b].filter(x => x.ok).length === 1 && disk.gold === 0,
    `tab one ${a.ok ? 'bought' : a.reason}, tab two ${b.ok ? 'bought' : b.reason}; the disk: purse ${disk.gold}, ${disk.buys} purchases`);
  await ctx.close();
}

/* ================= 14. A CLOUD PURCHASE WHOSE ANSWER WAS LOST ================= */
{
  const { p, ctx } = await page({ mock: MOCK });
  await p.waitForFunction(() => Backend.isReady && Backend.isReady() && Backend.uid, null, { timeout: 20000 });
  const r = await p.evaluate(async () => {
    __G.st.wallet = 250;
    __G.st.prices = Object.fromEntries(Deck.CATALOG.map(c => [c.id, Deck.price(c.id)]));
    await Deck.sync('test');
    const out = { mode: Gold.mode(), g0: Gold.balance(), n0: Deck.count('war_band') };
    __G.st.lose = 6;
    out.first = await Gold.buy('war_band');
    __G.st.lose = 0;
    out.gMid = Gold.balance(); out.nMid = Deck.count('war_band');
    out.second = await Gold.buy('war_band');
    out.g1 = Gold.balance(); out.n1 = Deck.count('war_band');
    out.server = { wallet: __G.st.wallet, n: __G.st.counts.war_band, buys: Object.keys(__G.st.buys).length };
    out.ids = __G.st.calls.filter(c => c.path === '/rpc/buy_card').map(c => c.body.p_purchase_id);
    out.short = await Gold.buy('golden_age');
    return out;
  });
  const price = 100;
  ck('aLostAnswerIsAskedAgainUnderTheSameId', r.mode === 'cloud' && r.g0 === 250 && r.first.ok === false && r.first.reason === 'network' &&
    r.second.ok === true && r.second.already === true && r.ids.length >= 2 && new Set(r.ids).size === 1 &&
    r.server.buys === 1 && r.server.wallet === 250 - price && r.g1 === 250 - price && r.n1 === r.n0 + 1,
    `mode ${r.mode}, purse ${r.g0}; the first answer lost (${r.first.reason}), the press again ${say(r.second)} under ${new Set(r.ids).size === 1 ? 'the same id' : 'a NEW id'} (${r.ids.length} asks); ` +
    `the record ${r.server.buys} purchase(s), ${r.server.wallet} gold; the device ${r.g1} gold, ×${r.n0} → ×${r.n1}`);
  ck('andTheRecordsRefusalIsTheDevicesWord', r.short.ok === false && r.short.reason === 'not_enough' && r.short.need > 0, `${r.short.reason}, ${r.short.need} more`);
  await ctx.close();
}

/* ================= 14b. A STOPPED CARD DRAIN NEVER SPINS ================= */
{
  /* the fault this pins, found by tests/telemetry.mjs: a card drain that
     stopped left the gold ops unmarked, every drain asked for another, and
     the promise chain never let a frame draw — the renderer grew past 7 GB */
  const { p, ctx } = await page({ mock: MOCK });
  await p.waitForFunction(() => Backend.isReady && Backend.isReady() && Backend.uid, null, { timeout: 20000 });
  const kicked = await Promise.race([p.evaluate(() => {
    __G.st.cardsMute = true;
    const c = Deck.col();
    c.queue.push({ at: Date.now(), op: 'grant', run: 'r-stuck', cards: ['war_band'], outcome: 'win' });
    c.gq.push({ at: Date.now(), op: 'gold', run: 'r-stuck', key: 'r-stuck', outcome: 'win', amount: 10 });
    Deck.saveCol();
    window.__before = __G.st.calls.length;
    window.__said = null;
    Deck.sync('test').then(x => { window.__said = x.why; });
    return true;
  }), new Promise(r => setTimeout(() => r(false), 6000))]);
  // asked from OUTSIDE the page: a page that spins never answers at all
  const ask = !kicked ? null : Promise.race([
    (async () => { await new Promise(r => setTimeout(r, 600)); return p.evaluate(async () => {
      const frame = await new Promise(r => requestAnimationFrame(() => r(true)));
      return { out: window.__said, asks: __G.st.calls.length - window.__before, frame, gold: __G.st.goldAsked || 0, kept: Deck.col().gq.length };
    }); })(),
    new Promise(r => setTimeout(() => r(null), 6000)),
  ]);
  const r = (await ask) || { out: 'NO ANSWER: the page is spinning', asks: '?', frame: false, gold: '?', kept: '?' };
  ck('aStoppedCardDrainNeverSpins', r.frame && r.out === 'no_answer' && r.asks <= 6 && r.gold === 0 && r.kept === 1,
    `the drain said ${r.out} after ${r.asks} asks; a frame came ${r.frame}; the gold door asked ${r.gold} times, the gold op kept ${r.kept === 1}`);
  await ctx.close().catch(() => {});
}

/* ================= 15. THE TEST LINK MINTS NOTHING REAL ================= */
{
  const { p, ctx } = await page({ q: '?prologue=0&gold=5000' });
  const real = await p.evaluate(() => ({ gold: Gold.balance(), test: Deck.isTest(), url: location.search }));
  await ctx.close();
  const t = await page({ q: '?prologue=0&cards=all&gold=777' });
  const toy = await t.p.evaluate(() => ({ gold: Gold.balance(), test: Deck.isTest(), url: location.search }));
  await t.ctx.close();
  ck('theTestLinkSetsOnlyAToyPurse', !real.test && real.gold === 0 && toy.test && toy.gold === 777 && !/gold=/.test(toy.url),
    `a real purse after ?gold=5000: ${real.gold}; a test deck's after ?gold=777: ${toy.gold} (the link taken out: ${!/gold=/.test(toy.url)})`);
}

/* ================= 17. A SALE, ON THE DEVICE AND ON THE RECORD ================= */
{
  const { p, ctx } = await page({ q: '?prologue=0&cards=all' });
  const r = await p.evaluate(async () => {
    const c = Deck.col(); c.gold = 0; Deck._add('war_band', 1); Deck.saveCol();
    const out = { mode: Gold.mode(), price: Gold.sellPrice('war_band'), list: Deck.price('war_band'), n0: Deck.count('war_band') };
    out.a = await Gold.sell('war_band');
    out.g1 = Gold.balance(); out.n1 = Deck.count('war_band');
    out.b = await Gold.sell('war_band');
    out.n2 = Deck.count('war_band');
    out.c = await Gold.sell('war_band');
    out.g3 = Gold.balance(); out.n3 = Deck.count('war_band');
    out.disk = JSON.parse(localStorage.getItem(Deck.KEY));
    return out;
  });
  ck('aLocalSaleTakesTheCardAndPaysFourFifths', r.mode === 'local' && r.price === Math.floor(r.list * 0.8 + 0.5) && r.a.ok && r.g1 === r.price && r.n1 === r.n0 - 1,
    `mode ${r.mode}: ${r.list} → ${r.price} for the trader; ${r.a.ok ? 'sold' : r.a.reason}, purse 0 → ${r.g1}, held ×${r.n0} → ×${r.n1}`);
  ck('andNoneLeftIsNoneLeft', r.b.ok && r.n2 === 0 && !r.c.ok && r.c.reason === 'none_left' && r.g3 === r.price * 2 && r.n3 === 0 && r.disk.gold === r.g3 && !r.disk.counts.war_band,
    `the last one ${r.b.ok ? 'sold' : r.b.reason}, then ${r.c.reason}; purse ${r.g3}, the disk ${r.disk.gold} with ×${r.disk.counts.war_band || 0}`);
  await ctx.close();
  // the record: an answer lost on the wire is asked again under the same sale id
  const m = await page({ mock: MOCK });
  await m.p.waitForFunction(() => Backend.isReady && Backend.isReady() && Backend.uid, null, { timeout: 20000 });
  const q = await m.p.evaluate(async () => {
    __G.st.wallet = 10;
    __G.st.prices = Object.fromEntries(Deck.CATALOG.map(c => [c.id, Deck.price(c.id)]));
    __G.st.counts = { war_band: 2 };
    await Deck.sync('test');
    const out = { mode: Gold.mode(), g0: Gold.balance(), n0: Deck.count('war_band'), price: Gold.sellPrice('war_band') };
    __G.st.lose = 6;
    out.first = await Gold.sell('war_band');
    __G.st.lose = 0;
    out.second = await Gold.sell('war_band');
    out.g1 = Gold.balance(); out.n1 = Deck.count('war_band');
    out.server = { wallet: __G.st.wallet, n: __G.st.counts.war_band, sales: Object.keys(__G.st.sales).length };
    out.ids = __G.st.calls.filter(c => c.path === '/rpc/sell_card').map(c => c.body.p_sale_id);
    return out;
  });
  ck('aLostSaleIsAskedAgainUnderTheSameId', q.mode === 'cloud' && q.n0 === 2 && q.first.ok === false && q.first.reason === 'network' && q.second.ok === true && q.second.already === true &&
    new Set(q.ids).size === 1 && q.server.sales === 1 && q.server.n === 1 && q.server.wallet === 10 + q.price && q.g1 === 10 + q.price && q.n1 === 1,
    `mode ${q.mode}; the first answer lost (${q.first.reason}), again ${say(q.second)} under ${new Set(q.ids).size === 1 ? 'the same id' : 'a NEW id'}; ` +
    `the record ${q.server.sales} sale, ×${q.server.n}, ${q.server.wallet} gold; the device ${q.g1} gold, ×${q.n1}`);
  await m.ctx.close();
}

/* ================= 18. THE MARKETPLACE ================= */
{
  /* the hall at seven windows: the trader in view, his face clear of his
     words, the three offers whole inside the window and answering a tap
     where they are drawn; then Buy's case, a card held up (its face, then
     its back), and Escape stepping back one thing at a time */
  const sizes = [[390, 844, 3], [375, 667, 2], [360, 740, 3], [844, 390, 3], [768, 1024, 2], [1280, 720, 1], [1440, 900, 2]];
  const bad = [], held = [], dressing = [], dressed = [];
  for (const [w, h, dpr] of sizes) {
    const { p, ctx } = await page({ q: '?prologue=0&cards=all', w, h, dpr });
    const r = await p.evaluate(async () => {
      Store.open('title');
      await new Promise(res => setTimeout(res, 250));
      const W = innerWidth, H = innerHeight, box = e => e.getBoundingClientRect();
      const inside = b => b.left >= -1 && b.top >= -1 && b.right <= W + 1 && b.bottom <= H + 1;
      const hit = e => { const b = box(e), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!t && e.contains(t); };
      const G = Store._geo, T = Store.TR, tr = box(document.querySelector('#scrStore .mkTrader'));
      const face = { left: G.x0 + (G.g.tx - T.face) * G.s, right: G.x0 + (G.g.tx + T.face) * G.s, top: G.y0 + (G.g.top - T.foot + T.head) * G.s, bottom: G.y0 + (G.g.top - T.foot + T.head + 90) * G.s };
      const say = box(document.querySelector('#scrStore .mkSay')), head = box(document.querySelector('#scrStore .stHead')).bottom;
      const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const offers = [...document.querySelectorAll('#scrStore .mkOffer')];
      // the counter runs to the window's foot: the painting, or its planks carried on
      const foot = () => { const sc = box(document.querySelector('#scrStore .mkScene')), ex = document.querySelector('#scrStore .mkExt');
        return Math.max(sc.bottom, ex.hidden ? 0 : box(ex).bottom) >= H - 1; };
      const out = {
        footLand: foot(),
        traderTall: tr.height / H, faceIn: face.top >= head - 2 && face.left >= 0 && face.right <= W,
        faceCovered: over(say, face) / ((face.right - face.left) * (face.bottom - face.top)),
        sayIn: inside(say) && say.top >= head - 1,
        offers: offers.map(e => ({ m: e.dataset.mode, in: inside(box(e)), hit: hit(e) })),
      };
      /* build 230 — the operator: "center the pile of gold coins in the middle of the
         table (but they can still be on the left hand side), can we make the fire
         flicker in the background … put 1 or 2 small items on the table … on wide
         screen formats … please center them on screen" */
      const fire = document.querySelector('#scrStore .mkFire'), F = Store.FIRE[Store._key], fcs = getComputedStyle(fire), fb = box(fire);
      out.fire = { anim: fcs.animationName !== 'none' && fcs.animationPlayState === 'running', steps: +((fcs.animationTimingFunction.match(/steps\((\d+)/) || [])[1]), n: F.n,
        at: Math.abs(fb.left - (G.x0 + F.x * G.s)) < 1 && Math.abs(fb.top - (G.y0 + F.y * G.s)) < 1 && Math.abs(fb.width - F.d * G.s) < 1 };
      const ctop = G.y0 + G.g.top * G.s, cfront = G.y0 + G.g.front * G.s, ob = offers.map(box);
      out.props = [...document.querySelectorAll('#scrStore .mkProp')].map(e => { const b = box(e);
        return { k: e.dataset.prop, shown: !e.hidden && b.width > 8, cx: (b.left + b.right) / 2, depth: (b.bottom - ctop) / (cfront - ctop), in: inside(b), under: ob.some(o => over(o, b) > 0) }; });
      const row = document.querySelector('#scrStore .mkOffers'), rb = box(row);
      out.row = !row.classList.contains('col') && !row.classList.contains('side') ? Math.abs((rb.left + rb.right) / 2 - W / 2) : null;
      out.side = row.classList.contains('side');
      out.tx = G.x0 + G.g.tx * G.s;
      Store.setMode('buy');
      // the case slides up as it comes (220 ms): measured where it comes to rest
      await new Promise(res => setTimeout(res, 120));
      await Promise.race([Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))), new Promise(res => setTimeout(res, 1500))]);
      const caseB = box(document.querySelector('#scrStore .stCase'));
      const ware = document.querySelector('#scrStore .stItem .ccard');
      out.caseIn = inside(caseB) && caseB.height > 200;
      out.footBuy = foot();
      out.ware = ware ? box(ware).width : 0;
      out.sayClear = over(box(document.querySelector('#scrStore .mkSay')), caseB) === 0;
      Store.look('iron_legion');
      await new Promise(res => setTimeout(res, 120));
      const f = document.querySelector('#scrStore .stLook .ccard');
      out.frontFirst = !!f && !f.classList.contains('flip');
      await new Promise(res => setTimeout(res, 800));
      out.thenBack = !!f && f.classList.contains('flip');
      out.big = f ? box(f).width : 0;
      const deal = document.querySelector('#scrStore .stBuy'), put = document.querySelector('#scrStore .stPut');
      out.dealIn = inside(box(deal)) && inside(box(put)) && hit(deal) && hit(put) && box(f).top >= head - 1;
      out.says = /Iron Legion/.test(document.querySelector('#scrStore .mkSayT').textContent);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      out.esc1 = Store._id === null && Store._mode === 'buy';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      out.esc2 = Store._mode === 'land' && Screens.current === 'store';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      out.esc3 = Screens.current === 'title';
      return out;
    });
    const tag = `${w}x${h}`;
    {
      const P = Object.fromEntries(r.props.map(x => [x.k, x])), shown = r.props.filter(x => x.shown);
      const why = [];
      if (!r.fire.anim || r.fire.steps !== r.fire.n || !r.fire.at) why.push(`the fire (running ${r.fire.anim}, steps ${r.fire.steps} for ${r.fire.n} frames, over the painting's own ${r.fire.at})`);
      if (!P.pile || !P.pile.shown || !(P.pile.cx < r.tx) || !(P.pile.depth > 0.4 && P.pile.depth < 0.8)) why.push(`the gold (shown ${P.pile && P.pile.shown}, left of him ${P.pile && P.pile.cx < r.tx}, its foot ${P.pile && P.pile.depth.toFixed(2)} into the counter top)`);
      if (!r.side && !(P.ledger && P.ledger.shown && P.scales && P.scales.shown)) why.push('no ledger or scales on the counter');
      const line = ['pile', 'ledger', 'scales'].map(k => P[k]).filter(x => x && x.shown);
      if (line.some((x, i) => i && !(x.cx > line[i - 1].cx))) why.push('the counter out of order');
      for (const x of shown) if (!x.in || x.under || !(x.depth > 0.2 && x.depth < 1)) why.push(`the ${x.k} (in the window ${x.in}, under a sign ${x.under}, foot ${x.depth.toFixed(2)})`);
      if (r.row !== null && !(r.row < 1.5)) why.push(`the row ${r.row.toFixed(1)}px off the window's middle`);
      if (why.length) dressing.push(`${tag}: ${why.join(', ')}`);
      dressed.push(`${tag} ${shown.length}${r.row !== null ? ' row ±' + r.row.toFixed(1) : ''}`);
    }
    if (!(r.traderTall >= 0.2)) bad.push(`${tag} trader only ${(r.traderTall * 100).toFixed(0)}% of the height`);
    if (!r.faceIn) bad.push(`${tag} his face out of view`);
    if (r.faceCovered > 0.12) bad.push(`${tag} his words cover ${(r.faceCovered * 100).toFixed(0)}% of his face`);
    if (!r.sayIn) bad.push(`${tag} his words leave the window`);
    for (const o of r.offers) if (!o.in || !o.hit) bad.push(`${tag} ${o.m} ${!o.in ? 'outside the window' : 'covered'}`);
    if (r.offers.length !== 3) bad.push(`${tag} ${r.offers.length} offers`);
    if (!r.caseIn) bad.push(`${tag} the case`);
    if (!r.footLand || !r.footBuy) bad.push(`${tag} the counter stops short of the window's foot (hall ${r.footLand}, case ${r.footBuy})`);
    if (!r.sayClear) bad.push(`${tag} his words over the case`);
    if (!(r.ware >= 100)) bad.push(`${tag} a ware ${r.ware}px wide`);
    held.push(`${tag} ${Math.round(r.ware)}→${Math.round(r.big)}px`);
    if (!r.frontFirst || !r.thenBack) bad.push(`${tag} the held card did not show its face, then its back (${r.frontFirst}, ${r.thenBack})`);
    if (!(r.big > r.ware)) bad.push(`${tag} the held card no bigger than the shelf's`);
    if (!r.dealIn) bad.push(`${tag} Buy / Put back not in view and answering`);
    if (!r.says) bad.push(`${tag} he says nothing of the card`);
    if (!r.esc1 || !r.esc2 || !r.esc3) bad.push(`${tag} Escape steps ${r.esc1}/${r.esc2}/${r.esc3}`);
    await ctx.close();
  }
  ck('theHallOpensOnTheTraderAndHisThreeOffers', bad.filter(x => !/held|Buy \/|Escape|says|case|ware/.test(x)).length === 0, bad.filter(x => !/held|Buy \/|Escape|says|case|ware/.test(x)).join(' | ') || sizes.length + ' windows: the trader in view, his face clear, three offers whole and answering');
  ck('aCardHeldUpShowsItsFaceThenItsBack', bad.filter(x => /held|Buy \/|says|case|ware/.test(x)).length === 0, bad.filter(x => /held|Buy \/|says|case|ware/.test(x)).join(' | ') || held.join(', '));
  ck('escapeStepsBackOneThingAtATime', bad.filter(x => /Escape/.test(x)).length === 0, bad.filter(x => /Escape/.test(x)).join(' | ') || 'the card, the mode, the hall');
  // the hearth's strips: frame 0 IS the painting (every pixel it lays), nothing off the
  // flames laid at all, one frame a step; reduced motion holds it on frame 0
  {
    const { p, ctx } = await page({ q: '?prologue=0' });
    const f = await p.evaluate(async () => {
      const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
      const px = (i, x, y, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(i, -x, -y); return g.getImageData(0, 0, w, h).data; };
      const out = {};
      for (const key of ['tall', 'wide']) {
        const F = Store.FIRE[key], strip = await img(Store._art('fire-' + key + '.png')), hut = await img(Store._art('hut-' + key + '.png'));
        if (!strip || !hut) { out[key] = { lost: true }; continue; }
        const d = F.d * 2, a = px(strip, 0, 0, d, d), b = px(hut, F.x * 2, F.y * 2, d, d);
        let laid = 0, off = 0, clear = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i + 3] === 0) { clear++; continue; }
          laid++;
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) off++;
        }
        out[key] = { frames: strip.naturalWidth / strip.naturalHeight, n: F.n, h: strip.naturalHeight, d, laid, off, clear };
      }
      return out;
    });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    const still = await p.evaluate(async () => { Store.open('title'); await new Promise(res => setTimeout(res, 150)); const n = getComputedStyle(document.querySelector('#scrStore .mkFire')).animationName; Store.close && Store.close(); return n; });
    await ctx.close();
    const okF = k => f[k] && !f[k].lost && f[k].frames === f[k].n && f[k].h === f[k].d && f[k].off === 0 && f[k].clear > f[k].d * 4 && f[k].laid > 0;
    ck('andTheHearthFlickersAndTheCounterIsDressed', dressing.length === 0 && okF('tall') && okF('wide') && still === 'none',
      (dressing.join(' | ') || 'gold on the left, the ledger and the scales on the right, ' + dressed.join(', ')) +
      `; the strips ${['tall', 'wide'].map(k => f[k] && !f[k].lost ? `${k} ${f[k].frames} frames of ${f[k].n}, frame 0 lays ${f[k].laid} of the painting's pixels (${f[k].off} off), ${f[k].clear} clear` : k + ' missing').join('; ')}; reduced motion: ${still}`);
  }
  // SELL through the screen: the last copy asks twice, the coins come home
  const { p, ctx } = await page({ q: '?prologue=0&cards=all' });
  const r = await p.evaluate(async () => {
    const c = Deck.col(); c.gold = 0; Deck.saveCol();
    Store.open('title', 'sell');
    await new Promise(res => setTimeout(res, 150));
    const out = { listed: document.querySelectorAll('#scrStore .stItem').length, held: Deck.CATALOG.filter(x => Deck.count(x.id) > 0).length, n0: Deck.count('war_band') };
    Store.look('war_band');
    await Store._tapDeal();
    out.armed = Deck.count('war_band') === out.n0 && /only one/i.test(document.querySelector('#scrStore .stMsg').textContent);
    await new Promise(res => setTimeout(res, 450));
    await Store._tapDeal();
    await new Promise(res => setTimeout(res, 2600));
    out.n1 = Deck.count('war_band'); out.g1 = Gold.balance(); out.price = Gold.sellPrice('war_band');
    out.gone = !document.querySelector('#scrStore .stItem[data-card="war_band"]');
    out.closed = Store._id === null && !Store._anim;
    return out;
  });
  ck('sellingThroughTheScreenTakesTheCardAndPays', r.listed === r.held && r.armed && r.n1 === r.n0 - 1 && r.g1 === r.price && r.gone && r.closed,
    `${r.listed} of ${r.held} held cards listed; the only war band asked twice ${r.armed}; ×${r.n0} → ×${r.n1}, purse ${r.g1} (${r.price}); off the shelf ${r.gone}`);
  await ctx.close();
}

/* ================= 18b. THE COUNTER, THE CASE'S FOOT, THE TAGS ================= */
{
  /* build 226 — the operator, on an iPhone at home-screen size: "Make sure the
     shop keepers table goes to the bottom of the screen ... the gold trim at the
     bottom of the screen ... goes down too far, gets cut off, and there is some
     random extra blackness down there"; "Drop the amount of coins you're missing
     under a card, and drop the average cost of a card type ... Coins are red if
     you can't afford a card". 390x785 at 3x with a 34px home bar, as his phone. */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 785 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(VETERAN);
  const { p } = await page({ ctx, q: '?prologue=0&cards=all' });
  let inset = true;
  try { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 34, left: 0, right: 0 } }); } catch (e) { inset = false; }
  const r = await p.evaluate(async () => {
    const c = Deck.col(); c.gold = 50; Deck.saveCol();
    Store.open('title');
    await new Promise(res => setTimeout(res, 300));
    const W = innerWidth, H = innerHeight, box = e => e.getBoundingClientRect();
    const sb = document.querySelector('#scrStore .mkSb').offsetHeight;
    const ex = document.querySelector('#scrStore .mkExt'), G = Store._geo;
    const foot = () => { const sc = box(document.querySelector('#scrStore .mkScene')); return Math.max(sc.bottom, ex.hidden ? 0 : box(ex).bottom); };
    // the planks carried on start on the painting's own row: no seam, no gap
    const seam = ex.hidden ? 0 : Math.abs(box(ex).top - (G.y0 + G.g.cut * G.s));
    const offersB = box(document.querySelector('#scrStore .mkOffers')).bottom;
    const out = { sb, H, footLand: foot(), seam, offersB };
    /* build 229 — the operator's mockup: "now you can't read the small text … recreate this
       look": cream letters on a dark board, the clan's cloth behind the column, a heap of
       gold on the counter, the plinth at the foot */
    const lum = e => { const c = getComputedStyle(e).color.match(/[\d.]+/g).map(Number); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
    out.ink = [...document.querySelectorAll('#scrStore .mkOffer b, #scrStore .mkOffer small')].map(lum);
    out.banners = [...document.querySelectorAll('#scrStore .mkBanner')].filter(e => e.getClientRects().length && box(e).height > 60).length;
    const pile = document.querySelector('#scrStore .mkPile'), pl = document.querySelector('#scrStore .mkPlinth');
    out.pile = !pile.hidden && box(pile).width > 30 && box(pile).bottom <= offersB;
    out.plinth = Math.abs(box(pl).bottom - H) < 1 && box(pl).height >= 12 && offersB <= box(pl).top;
    Store.setMode('buy');
    await new Promise(res => setTimeout(res, 120));
    await Promise.race([Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))), new Promise(res => setTimeout(res, 1500))]);
    const cb = box(document.querySelector('#scrStore .stCase'));
    out.caseB = cb.bottom; out.footBuy = foot();
    out.corners = [...document.querySelectorAll('#scrStore .stC')].map(e => box(e)).every(b => b.left >= -0.5 && b.right <= W + 0.5 && b.top >= 0 && b.bottom <= H - sb + 0.5);
    out.more = document.querySelectorAll('#scrStore .stMore').length;
    out.tiers = [...document.querySelectorAll('#scrStore .stTier')].map(t => t.textContent.trim());
    out.names = Deck.TIERS.map(t => t.name);
    const col = id => { const e = document.querySelector(`#scrStore .stItem[data-card="${id}"] .stP`); return e ? getComputedStyle(e).color.match(/\d+/g).map(Number) : null; };
    const cheap = Deck.CATALOG.find(x => Deck.price(x.id) <= 50), dear = Deck.CATALOG.find(x => Deck.price(x.id) > 50);
    out.cheap = col(cheap.id); out.dear = col(dear.id);
    out.tagWords = [...document.querySelectorAll('#scrStore .stItem .stTag')].every(t => /^[\d,]+$/.test(t.textContent.trim()));
    /* build 227: the held card's notes ("Not enough gold yet", "One already in
       your deck") were drawn across the case's gold trim; they end inside it now,
       with the TEST BUILD badge's room taken too (the test page, the tightest) */
    const held = async () => {
      Store.look(dear.id);
      await new Promise(res => setTimeout(res, 700));
      const L = document.querySelector('#scrStore .stLook'), c2 = box(document.querySelector('#scrStore .stCase'));
      const notes = [...L.querySelectorAll('.stMsg, .stOwn')].filter(e => e.textContent).map(e => box(e).bottom);
      const shelf = box(document.querySelector('#scrStore .stItem .ccard')).width;
      const r2 = { caseB: c2.bottom, notesB: Math.max(...notes), n: notes.length, spill: L.scrollHeight - L.clientHeight, card: box(L.querySelector('.ccard')).width, shelf };
      Store.closeLook(true);
      return r2;
    };
    out.held = [await held()];
    const tb = document.createElement('div'); tb.id = 'testBadge'; tb.textContent = 'TEST BUILD';
    tb.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 4px);transform:translateX(-50%);font:700 10px/1 sans-serif;padding:3px 7px;border:1px solid';
    document.body.appendChild(tb); Store.layout();
    out.held.push(await held());
    tb.remove(); Store.layout();
    return out;
  });
  const red = c => !!c && c[0] > 200 && c[0] - c[1] > 70, plain = c => !!c && !red(c);
  ck('andAHeldCardsNotesEndInsideTheCasesTrim',
    r.held.every(h => h.n === 2 && h.notesB <= h.caseB - 12 && h.spill <= 1 && h.card > h.shelf * 1.5),
    r.held.map(h => `the notes (${h.n}) end ${Math.round(h.notesB)}, the case ${Math.round(h.caseB)}, spill ${h.spill}px, the card ${Math.round(h.card)} over the shelf's ${Math.round(h.shelf)}`).join('; with the badge: '));
  ck('theCounterRunsToTheFootAndTheCaseEndsAboveTheHomeBar',
    inset && r.sb === 34 && r.footLand >= r.H - 1 && r.footBuy >= r.H - 1 && r.seam < 1.5 && r.offersB <= r.H - r.sb && r.caseB <= r.H - r.sb - 6 && r.caseB >= r.H - r.sb - 20 && r.corners,
    `home bar ${inset ? r.sb : 'not emulated'}px; the counter to ${Math.round(r.footLand)} / ${Math.round(r.footBuy)} of ${r.H} (seam ${r.seam.toFixed(2)}px); the offers end ${Math.round(r.offersB)}; the case ends ${Math.round(r.caseB)}, its ornaments whole ${r.corners}`);
  ck('andTheSignsAreTheMockupsCreamOnDarkWood',
    r.ink.length === 6 && r.ink.every(l => l > 0.7) && r.banners === 2 && r.pile && r.plinth,
    `the words' lightness ${r.ink.map(l => l.toFixed(2)).join('/')}; ${r.banners} banners behind the column; a heap on the counter ${r.pile}; the plinth at the foot, under the offers ${r.plinth}`);
  ck('aWareWearsItsPriceAloneRedWhenShort',
    r.more === 0 && r.tagWords && JSON.stringify(r.tiers) === JSON.stringify(r.names) && plain(r.cheap) && red(r.dear),
    `${r.more} "more" lines, tags only a price ${r.tagWords}; tier tabs ${r.tiers.join('/')}; an affordable price rgb(${r.cheap}), a dear one rgb(${r.dear})`);
  await ctx.close();
}

/* ================= 16. THE END SCREEN'S GOLD ================= */
{
  const { p, ctx } = await page({ q: '?prologue=0' });
  const r = await p.evaluate(async () => {
    Deck._col = null; Deck._del(Deck.KEY); Deck.ensureStarter();
    const c = Deck.col(); c.gold = 40; Deck.saveCol();
    Screens._demo = false;
    G.newGame('gold-end', 'moderate', 'medium');
    Screens.show('playing'); S.paused = true;
    S.playtime = 900; S.stats.kills = 80; S.stats.built = 20; S.day = 140; S.stats.actDays = 30;
    G.end(true, 'test', 'razed_rival_tc');
    await new Promise(r => setTimeout(r, 300));
    DeckScreens._skip();
    const row = document.querySelector('#cardEnd .ceGold');
    return { row: !!row, sum: row && row.querySelector('.ceGoldN').textContent, purse: row && row.querySelector('.cePurseN').textContent,
      paid: DeckScreens._view.gold, after: Gold.balance(), score: S.over.score,
      first: row && row.compareDocumentPosition(document.querySelector('#cardEnd .ceScoreN')) & Node.DOCUMENT_POSITION_FOLLOWING };
  });
  const want = Math.min(150, Math.max(10, Math.floor(r.score / 200)));
  ck('theEndScreenSaysTheGoldFirst', r.row && r.paid === want && r.sum === '+' + want && r.purse === (40 + want).toLocaleString('en-US') && r.after === 40 + want && !!r.first,
    `a ${r.score}-point win: the row ${r.sum}, purse ${r.purse} (the device ${r.after}), before the score ${!!r.first}`);
  await ctx.close();
}

ck('noPageErrors', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');
await browser.close();
srv.close();
done();
