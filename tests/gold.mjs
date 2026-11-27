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
   16. THE END SCREEN'S GOLD: the headline row, its sum and purse. */
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
const F19 = '0019_gold_store.sql';
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
  make('cf_bare');
  for (const f of files.filter(f => f < '0008')) sql(readFileSync(join(MIG, f), 'utf8'), { db: 'cf_bare' });
  const bare = sql(readFileSync(join(MIG, F19), 'utf8'), { db: 'cf_bare' });
  ck('itRefusesWithoutTheCardsByName', !!bare.error && /0008/.test(bare.error), bare.error ? (bare.error.split('\n').find(l => /0008/.test(l)) || bare.error.split('\n')[0]) : 'it applied');
}

/* the record's numbers, read for section 2 (checked against the page's) */
const SQLN = {
  rate: +sql('select public.gold_rate();').out, floor: +sql('select public.gold_floor();').out, cap: +sql('select public.gold_cap();').out,
  pro: [1, 2, 3].map(g => +sql(`select public.gold_prologue(${g});`).out),
  prices: Object.fromEntries((sql("select card_key || '=' || price from public.card_prices order by card_key;").out || '').split('\n').filter(Boolean).map(l => l.split('=')).map(([k, v]) => [k, +v])),
  tierOf: Object.fromEntries((sql("select card_key || '=' || tier from public.card_catalog where active order by card_key;").out || '').split('\n').filter(Boolean).map(l => l.split('='))),
  drops: Object.fromEntries((sql("select tbl || ':' || string_agg(tier, ',' order by tier) from public.card_drop_tiers group by tbl;").out || '').split('\n').filter(Boolean).map(l => l.split(':'))),
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
    const st = { uid: 'uid-G', calls: [], ends: {}, wallet: 0, buys: {}, counts: {}, lose: 0, prices: null };
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
    drops: CFG.CARDS.DROPS, bonus: CFG.CARDS.BONUS }));
  const off = Object.keys(SQLN.prices).filter(k => SQLN.prices[k] !== g.prices[k]).concat(Object.keys(g.prices).filter(k => !(k in SQLN.prices)));
  ck('theRecordsNumbersAreTheGames', g.G.RATE === SQLN.rate && g.G.FLOOR === SQLN.floor && g.G.CAP === SQLN.cap &&
    [1, 2, 3].every((n, i) => g.G.PROLOGUE[n] === SQLN.pro[i]) && off.length === 0,
    `rate ${g.G.RATE}/${SQLN.rate}, floor ${g.G.FLOOR}/${SQLN.floor}, cap ${g.G.CAP}/${SQLN.cap}, journey ${[1, 2, 3].map(n => g.G.PROLOGUE[n])}/${SQLN.pro}; prices apart: ${off.join(', ') || 'none'}`);
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
  ck('theStoreOpensFromTheTitle', r.plate && r.title === 'row' && r.fromTitle && r.items === 36 && r.backHome, `plate ${r.plate} (${r.title}), opened ${r.fromTitle} with ${r.items} cards, back to the title ${r.backHome}`);
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
