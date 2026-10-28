/* THE DASHBOARD — the contract for migration 0010 and analytics.html.

   The operator, 2026-10-28, on the past month: "171 games were played, but
   434 reached an ending. That doesn't make any sense. Also, win rate and
   loss rate was only 28…" — the live summary counted every row the game
   sent as an ending, a closed tab five times over. This file pins the
   rebuilt dashboard ON A REAL DATABASE: it starts its own PostgreSQL,
   shaped like Supabase (the anon and authenticated roles, auth.uid(), the
   pgcrypto extension, PostgREST's request.headers), applies every migration
   in supabase/migrations/ in order, and asks the real functions.

   1. THE MIGRATION APPLIES, ONCE OR TWICE: 0001–0010 in order, 0010 a
      second time changes nothing, and 0010 refuses (naming 0009) on a
      database without the feedback table.
   2. ONE GAME, ONE RESULT: a run with three closed-tab rows is ONE game
      that left; a run that left and came back to win is one WIN; a struck
      banner is QUIT; a start with nothing after it is NO SIGNAL; a bounce
      under a minute is no game when the run filter is on. Games add up:
      won + lost + quit + left + open = games. Finished is (won + lost) /
      games and win rate is won / (won + lost), and every number on the
      fixture equals the count made by hand.
   3. YOUR OWN PLAY IS LEFT OUT, RETROACTIVELY: a device marked yours, a
      device that held the card test deck, and every device ever seen on a
      network marked yours vanish from every number — and "include
      everyone" brings them back. The network is stamped by the SERVER (a
      client's own stamp is overwritten), salted and cut to 16 hex, an IPv6
      address by its /64 (a phone's address rotates, its prefix does not).
   4. THE DOORS ARE LOCKED: every door refuses a bad passphrase; the
      publishable role can call the doors and nothing else — not the
      helpers, not a table.
   5. DID THE UPDATE HELP: two equal windows either side of a moment, each
      the same headline numbers, and the "after" window says how much of it
      has happened.
   6. THE INBOX: every report with its status and note; a status set is
      kept (handled follows fixed / won't fix); a bad status is refused.
   7. THE PAGE, against the real functions (the RPCs answered by this
      database through a request bridge): the passphrase gate; the tiles are
      the database's numbers; the split bar adds up to the games; a missing
      migration shows the setup note instead of a broken page; the inbox
      renders, a status saves, and "Send to Claude" opens a GitHub issue
      whose body carries the report and NEVER the player's email or name —
      nor a bare "@claude", which on GitHub pings whoever owns that handle;
      it is labelled player-report and marked with the report's id instead;
      marking this device calls the door and the device drops out.
   And what the game sends from build 107 is read: the errors list takes
   the first error of every game, a crash in its first minute included
   (the run filter would have hidden it), and the deck's own rows are
   counted on the same terms as the games.

   Needs a PostgreSQL 14+ server on this machine (initdb / pg_ctl); the
   sandbox has 16. Run after touching supabase/migrations/0010_dashboard.sql,
   analytics.html, or the telemetry rows the game sends (js/backend.js,
   G.runReport).

     node tests/analytics.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const done = (code) => {
  for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
  console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL ANALYTICS CHECKS PASS');
  process.exit(code != null ? code : (fails.length ? 1 : 0));
};

/* ---------------- a Supabase-shaped PostgreSQL of our own ---------------- */
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
// a home the postgres user can reach (root's scratch dirs are 0700)
const home = asRoot ? '/var/lib/postgresql' : tmpdir();
const DIR = mkdtempSync(join(home, 'cf-analytics-'));
if (asRoot) execFileSync('chown', ['postgres:postgres', DIR]);
const PORT = 55000 + (process.pid % 900);
let started = false;
const stop = () => { try { if (started) runAs(join(PGBIN, 'pg_ctl'), ['-D', join(DIR, 'data'), '-m', 'immediate', 'stop']); } catch (e) {} try { rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
process.on('exit', stop);
try {
  runAs(join(PGBIN, 'initdb'), ['-D', join(DIR, 'data'), '-A', 'trust', '-U', 'postgres']);
  runAs(join(PGBIN, 'pg_ctl'), ['-D', join(DIR, 'data'), '-o', `-p ${PORT} -k ${DIR} -c listen_addresses=''`, '-l', join(DIR, 'log.txt'), '-w', 'start']);
  started = true;
} catch (e) { ck('thereIsADatabaseToTestAgainst', false, 'could not start PostgreSQL: ' + String(e.message || e).slice(0, 200)); done(1); }
const PSQL = join(PGBIN, 'psql');
/* one statement (or a script) through psql: the last line of output, or
   {error} — never a throw, so a refusal can be measured */
const sql = (text, opts) => {
  opts = opts || {};
  const r = spawnSync(PSQL, ['-h', DIR, '-p', String(PORT), '-U', 'postgres', '-d', opts.db || 'cf', '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-X'],
    { input: text, encoding: 'utf8' });
  if (r.status !== 0) return { error: (r.stderr || '').trim() || 'psql exited ' + r.status };
  return { out: (r.stdout || '').trim() };
};
const json = (text, opts) => { const r = sql(text, opts); if (r.error) return { error: r.error }; try { return JSON.parse(r.out.split('\n').pop()); } catch (e) { return { error: 'not json: ' + r.out.slice(0, 200) }; } };
const lit = v => v == null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
// roles are CLUSTER-wide: the second database must not re-create them, or
// ON_ERROR_STOP drops the whole scaffold and every migration after it
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
  -- SUPABASE GRANTS EVERY NEW OBJECT TO THE API ROLES BY DEFAULT — which is
  -- why every migration revokes by name. Without these the revokes would be
  -- no-ops here and the locked-doors check would prove nothing.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;`;
const MIG = join(root, 'supabase/migrations');
const files = readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const make = (db) => { sql('create database ' + db + ';', { db: 'postgres' }); return sql(SCAFFOLD, { db }); };

/* ================= 1. THE MIGRATION APPLIES, ONCE OR TWICE ================= */
{
  const s0 = make('cf');
  const applied = [], broke = [];
  for (const f of files) { const r = sql(readFileSync(join(MIG, f), 'utf8')); (r.error ? broke : applied).push(f + (r.error ? ': ' + r.error.split('\n')[0] : '')); }
  ck('everyMigrationAppliesInOrder', !s0.error && broke.length === 0 && files.includes('0010_dashboard.sql'), broke.join(' | ') || applied.length + ' files');
  const again = sql(readFileSync(join(MIG, '0010_dashboard.sql'), 'utf8'));
  ck('andTheDashboardsTwiceChangesNothing', !again.error, again.error ? again.error.split('\n')[0] : 'applied a second time cleanly');
  // a database that never had 0009 is told so, by name
  make('cf_bare');
  for (const f of files.filter(f => f < '0009')) sql(readFileSync(join(MIG, f), 'utf8'), { db: 'cf_bare' });
  const bare = sql(readFileSync(join(MIG, '0010_dashboard.sql'), 'utf8'), { db: 'cf_bare' });
  ck('itRefusesWithoutTheFeedbackTable', !!bare.error && /0009/.test(bare.error), bare.error ? bare.error.split('\n').find(l => /0009/.test(l)) || bare.error.split('\n')[0] : 'it applied');
}

/* ================= the fixture ================= */
const PASS = 'a long test passphrase';
const TOKEN = createHash('sha256').update('clanfire-analytics-v1:' + PASS).digest('hex');
const U = c => '00000000-0000-0000-0000-00000000000' + c;
const FIX = `
  select public.set_analytics_token(${lit(PASS)});
  insert into auth.users (id) values ('${U('a')}'), ('${U('b')}'), ('${U('c')}'), ('${U('d')}'), ('${U('e')}'), ('${U('f')}');
  insert into public.profiles (id) select id from auth.users on conflict do nothing;
  -- B on 198.51.100.7: a win, a loss, and a run that left twice then came back to WIN
  set request.headers = '{"x-forwarded-for": "198.51.100.7, 10.0.0.2"}';
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at, props) values
   ('${U('b')}','b1','run_start','calm','mobile', now() - interval '20 days', '{"card":"bowyer"}');
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at) values
   ('${U('b')}','b2','run_start','moderate','mobile', now() - interval '19 days'),
   ('${U('b')}','b3','run_start','moderate','mobile', now() - interval '18 days');
  insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, day, seconds, created_at, props) values
   ('${U('b')}','b1','run_end','win','razed_rival_tc','calm',120,2400, now() - interval '20 days' + interval '40 minutes', '{"cards_played":1}'),
   ('${U('b')}','b2','run_end','loss','tc_destroyed','moderate',80,1500, now() - interval '19 days' + interval '30 minutes', '{}'),
   ('${U('b')}','b3','run_end','abandoned','closed_tab','moderate',5,300, now() - interval '18 days' + interval '5 minutes', '{}'),
   ('${U('b')}','b3','run_end','abandoned','closed_tab','moderate',9,600, now() - interval '18 days' + interval '10 minutes', '{}'),
   ('${U('b')}','b3','run_end','win','wonder','moderate',200,4000, now() - interval '17 days', '{}');
  -- B's deck: two cards earned, one played (0008's kinds)
  insert into public.telemetry (user_id, run_id, kind, mode, day, created_at, props) values
   ('${U('b')}','b1','card_granted','calm',120, now() - interval '20 days' + interval '41 minutes', '{"card":"swift_raiders","tier":"stone","run":"b1"}'),
   ('${U('b')}','b3','card_granted','moderate',200, now() - interval '17 days', '{"card":"stone_skin","tier":"bronze","run":"b3"}'),
   ('${U('b')}','b2','card_played','moderate',12, now() - interval '19 days' + interval '5 minutes', '{"card":"forager_cache","tier":"stone","run":"b2"}');
  -- C on an IPv6 home: LEFT (three closed tabs), QUIT (struck banner), NO SIGNAL, a 10-second BOUNCE
  set request.headers = '{"cf-connecting-ip": "2001:db8:abcd:12:1111:2222:3333:4444"}';
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at) values
   ('${U('c')}','c1','run_start','hard','desktop', now() - interval '10 days'),
   ('${U('c')}','c2','run_start','hard','desktop', now() - interval '9 days'),
   ('${U('c')}','c3','run_start','hard','desktop', now() - interval '8 days'),
   ('${U('c')}','c4','run_start','hard','desktop', now() - interval '8 days');
  insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, day, seconds, created_at, props) values
   ('${U('c')}','c1','run_end','abandoned','closed_tab','hard',2,200, now() - interval '10 days' + interval '4 minutes', '{}'),
   ('${U('c')}','c1','run_end','abandoned','closed_tab','hard',3,260, now() - interval '10 days' + interval '6 minutes', '{}'),
   ('${U('c')}','c1','run_end','abandoned','closed_tab','hard',4,320, now() - interval '10 days' + interval '8 minutes', '{}'),
   ('${U('c')}','c2','run_end','abandoned','struck_banner','hard',30,1200, now() - interval '9 days' + interval '20 minutes', '{}'),
   ('${U('c')}','c4','run_end','abandoned','closed_tab','hard',0,10, now() - interval '8 days' + interval '1 minutes', '{"errors": 3, "err": "ReferenceError: early @ js/ui.js:88", "build": 107}');
  -- E: another device on the SAME IPv6 /64 (a rotated address), one win
  set request.headers = '{"cf-connecting-ip": "2001:db8:abcd:12:9999:8888:7777:6666"}';
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at) values ('${U('e')}','e1','run_start','calm','mobile', now() - interval '3 days');
  insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, day, seconds, created_at, props) values
   ('${U('e')}','e1','run_end','win','razed_rival_tc','calm',90,1800, now() - interval '3 days' + interval '30 minutes', '{"errors": 2, "err": "TypeError: boom @ js/units.js:120", "build": 107}');
  -- A: the operator's test device — it held the card test deck
  set request.headers = '{"x-real-ip": "192.0.2.44"}';
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at) values ('${U('a')}','a1','run_start','hard','desktop', now() - interval '5 days');
  insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, day, seconds, created_at, props) values
   ('${U('a')}','a1','run_end','win','razed_rival_tc','hard',50,900, now() - interval '5 days' + interval '15 minutes', '{"cards_test": true, "cards_played": 4}');
  -- D: a client that tries to stamp its own network, from no request at all
  reset request.headers;
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at, net) values ('${U('d')}','d1','run_start','calm','mobile', now() - interval '2 days', 'forgedforgedforg');
  -- F: long ago (outside a 30-day window) — the comparison's "before"
  insert into public.telemetry (user_id, run_id, kind, mode, device, created_at) values ('${U('f')}','f1','run_start','calm','desktop', now() - interval '40 days');
  insert into public.telemetry (user_id, run_id, kind, outcome, cause, mode, day, seconds, created_at, props) values
   ('${U('f')}','f1','run_end','loss','tc_destroyed','calm',40,1300, now() - interval '40 days' + interval '25 minutes', '{}');
  insert into public.feedback (user_id, kind, email, message, details, created_at) values
   ('${U('b')}','bug','player.b@example.com','The wall would not build','{"name":"Bryn","report":{"build":105,"browser":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)","run":{"mode":"calm","day":40,"seed":"1234"},"errors":[{"msg":"TypeError: x is undefined","at":"js/bld.js:10:2","n":1}]}}', now() - interval '6 days'),
   ('${U('a')}','crash','me@example.com','test crash','{"report":{"build":106}}', now() - interval '4 days'),
   ('${U('c')}','idea','player.c@example.com','More maps please','{}', now() - interval '1 days');
`;
{
  const r = sql(FIX);
  ck('theFixtureLoads', !r.error, r.error ? r.error.split('\n')[0] : 'six devices, eleven runs, three reports');
}
const call = (name, args, headers) => json((headers ? `set request.headers = ${lit(JSON.stringify(headers))};\n` : '') +
  `select public.${name}(${Object.entries(args).map(([k, v]) => k + ' => ' + lit(v)).join(', ')});`);
const D30 = () => ({ p_token: TOKEN, p_from: new Date(Date.now() - 30 * 86400000).toISOString(), p_to: null, p_mode: null, p_device: null, p_min_seconds: 60, p_everyone: false });

/* ================= 2. ONE GAME, ONE RESULT ================= */
{
  const d = call('analytics_dashboard', D30());
  const H = d.headline || {};
  // by hand: B (b1 won, b2 lost, b3 WON after two closed tabs), C (c1 LEFT, c2 QUIT;
  // c3 no signal and c4 a 10s bounce both under the minute), E (e1 won); A hidden
  // (test deck), D no signal, F outside the window
  ck('aGameIsCountedOnceWithOneResult', d.ok && H.games === 6 && H.won === 3 && H.lost === 1 && H.quit === 1 && H.left === 1 && H.open === 0,
    JSON.stringify({ games: H.games, won: H.won, lost: H.lost, quit: H.quit, left: H.left, open: H.open }));
  ck('andTheResultsAddUpToTheGames', H.won + H.lost + H.quit + H.left + H.open === H.games, '');
  ck('finishedIsOfGamesAndWinRateIsOfFinished', H.finished_pct === 66.7 && H.win_pct === 75,
    `finished ${H.finished_pct}% (4 of 6), win rate ${H.win_pct}% (3 of 4)`);
  ck('theOtherNumbersAreTheHandCount', H.players === 3 && H.new_players === 3 && H.median_minutes === 27.5 && H.median_day === 85 &&
    H.left_early_pct === 16.7 && H.back === 2 && H.back_ripe === 2 && H.hook === 2 && H.hook_n === 3 && H.player_minutes === 30 &&
    H.err_n === 2 && H.err_games === 2,
    JSON.stringify({ players: H.players, new: H.new_players, med: H.median_minutes, day: H.median_day, early: H.left_early_pct,
      back: [H.back, H.back_ripe], hook: [H.hook, H.hook_n], perPlayer: H.player_minutes, err: [H.err_games, H.err_n] }));
  const all = call('analytics_dashboard', Object.assign(D30(), { p_min_seconds: 0 }));
  // b1-b3, c1-c4, e1 and D's d1 (no ending: no signal) — nine starts, two silent
  ck('everyStartCountsWithTheFilterOff', all.headline.games === 9 && all.headline.open === 2 && all.funnel.started === 9 && all.funnel.minute === 6,
    JSON.stringify({ games: all.headline.games, open: all.headline.open, funnel: all.funnel }));
  ck('theInboxCountsEveryReport', d.inbox && d.inbox.total === 3 && d.inbox.new === 3, JSON.stringify(d.inbox));
  // the errors: the first error of every game, commonest first — c4 crashed in
  // its first ten seconds and the run filter hides the GAME, never its error
  const E = d.errors_top || [];
  ck('theErrorsListTakesEveryGamesFirstError', E.length === 2 && E.some(x => /^TypeError: boom/.test(x.err) && x.games === 1 && x.build === 107) &&
    E.some(x => /^ReferenceError: early/.test(x.err) && x.games === 1), JSON.stringify(E));
  const Cd = d.cards || {};
  ck('theDecksRowsAreCountedLikeTheGames', Cd.earned === 2 && Cd.earners === 1 && Cd.plays === 1 && Cd.players_played === 1 &&
    Cd.earned_by_tier && Cd.earned_by_tier.stone === 1 && Cd.earned_by_tier.bronze === 1 &&
    (Cd.top_played || [])[0] && Cd.top_played[0].card === 'forager_cache' && Cd.top_played[0].plays === 1, JSON.stringify(Cd));
  // when each build went live: its first row (c4's ending, eight days back, is 107's first)
  const first107 = sql(`select to_char(min(created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') from public.telemetry where props->>'build' = '107';`).out;
  ck('theDatabaseSaysWhenEachBuildWentLive', d.builds && Object.keys(d.builds).join() === '107' && String(d.builds['107']).replace(' ', 'T').startsWith(first107),
    JSON.stringify(d.builds) + ' against ' + first107);
  ck('andTheOriginCardIsReadOffTheStart', (d.by_origin || []).length === 1 && d.by_origin[0].origin === 'bowyer' && d.by_origin[0].won === 1,
    JSON.stringify(d.by_origin));
}

/* ================= 3. YOUR OWN PLAY IS LEFT OUT ================= */
{
  const nets = json(`select json_agg(json_build_object('u', user_id, 'n', net) order by id) from public.telemetry;`);
  const by = {}; for (const r of nets || []) (by[r.u] = by[r.u] || new Set()).add(r.n);
  const one = u => by[U(u)] ? [...by[U(u)]] : [];
  ck('theServerStampsTheNetwork', one('b').length === 1 && /^[0-9a-f]{16}$/.test(one('b')[0]) && one('a')[0] !== one('b')[0], JSON.stringify({ b: one('b'), a: one('a') }));
  ck('andAnIPv6HomeIsItsPrefix', one('c').length === 1 && one('e').length === 1 && one('c')[0] === one('e')[0], 'two rotated addresses on one /64: ' + one('c')[0] + ' / ' + one('e')[0]);
  ck('andAClientCannotWriteItsOwn', one('d').length === 1 && one('d')[0] === null, 'the forged stamp read ' + JSON.stringify(one('d')));
  const salt = sql(`select count(*) from public.analytics_secret where char_length(salt) >= 32;`);
  ck('theHashIsSaltedWithASecret', salt.out === '1', '');

  const base = call('analytics_dashboard', D30());
  ck('aTestDeckDeviceIsLeftOutOnItsOwn', base.hidden.testers === 1 && base.hidden.games === 1, JSON.stringify(base.hidden));
  // mark B as mine: B's three games leave every number, history included
  call('analytics_mark_device', { p_token: TOKEN, p_user_id: U('b'), p_mine: true, p_label: 'my phone' });
  const m = call('analytics_dashboard', D30());
  ck('aDeviceMarkedYoursLeavesEveryNumberRetroactively', m.headline.games === 3 && m.headline.won === 1 && m.headline.players === 2 && m.hidden.yours === 1,
    JSON.stringify({ games: m.headline.games, won: m.headline.won, players: m.headline.players, hidden: m.hidden }));
  ck('andItsReportsLeaveTheCount', m.headline.reports.bug === 0 && m.headline.reports.idea === 1, JSON.stringify(m.headline.reports));
  ck('andItsCardsLeaveTheCount', m.cards && m.cards.earned === 0 && m.cards.plays === 0, JSON.stringify(m.cards));
  const ev = call('analytics_dashboard', Object.assign(D30(), { p_everyone: true }));
  ck('includeEveryoneBringsThemBack', ev.headline.games === 7 && ev.hidden.everyone === true, 'games ' + ev.headline.games);
  call('analytics_mark_device', { p_token: TOKEN, p_user_id: U('b'), p_mine: false });
  // mark C's network as mine (asked FROM it): C and E, on the same /64, both go
  const who = call('analytics_whoami', { p_token: TOKEN, p_user_id: U('c') }, { 'cf-connecting-ip': '2001:db8:abcd:12:aaaa::1' });
  ck('whoamiNamesThisDeviceAndThisNetwork', who.ok && who.device && who.device.games === 4 && who.network && who.network.devices === 2 && !who.network.excluded,
    JSON.stringify(who));
  call('analytics_mark_network', { p_token: TOKEN, p_mine: true, p_label: 'home' }, { 'cf-connecting-ip': '2001:db8:abcd:12:aaaa::1' });
  const n = call('analytics_dashboard', D30());
  ck('aNetworkMarkedYoursTakesEveryDeviceSeenOnIt', n.headline.games === 3 && n.headline.players === 1 && n.hidden.network === 2,
    JSON.stringify({ games: n.headline.games, players: n.headline.players, hidden: n.hidden }));
  call('analytics_mark_network', { p_token: TOKEN, p_mine: false }, { 'cf-connecting-ip': '2001:db8:abcd:12:aaaa::1' });
  const nonet = call('analytics_mark_network', { p_token: TOKEN, p_mine: true });
  ck('andWithNoRequestThereIsNoNetworkToMark', nonet.ok === false && nonet.reason === 'no_network', JSON.stringify(nonet));
  // THE REAL CLIENT: an insert as `authenticated`, under 0003's own-rows
  // policy, goes through the trigger and is stamped (then taken out again)
  const ins = sql(`set role authenticated; set request.jwt.claim.sub = '${U('f')}'; set request.headers = '{"x-forwarded-for": "192.0.2.200"}';
    insert into public.telemetry (user_id, run_id, kind, device, props) values ('${U('f')}', 'f-client', 'session', 'desktop', '{"build": 107}');`);
  const forged = sql(`set role authenticated; set request.jwt.claim.sub = '${U('f')}';
    insert into public.telemetry (user_id, run_id, kind, device) values ('${U('e')}', 'f-forged', 'session', 'desktop');`);
  const stamp = sql(`select coalesce(net, 'null') from public.telemetry where run_id = 'f-client';`).out;
  sql(`delete from public.telemetry where run_id in ('f-client', 'f-forged');`);
  ck('aClientsOwnInsertIsStampedUnderItsPolicy', !ins.error && /^[0-9a-f]{16}$/.test(stamp) && !!forged.error,
    (ins.error ? 'insert refused: ' + ins.error.split('\n')[0] : 'stamped ' + stamp) + '; another device\'s row ' + (forged.error ? 'refused' : 'ACCEPTED'));
  const devs = call('analytics_devices', { p_token: TOKEN, p_limit: 25 }, { 'x-forwarded-for': '198.51.100.7' });
  const dB = (devs.devices || []).find(x => x.id === U('b')), dA = (devs.devices || []).find(x => x.id === U('a'));
  ck('theDeviceListFlagsWhatItKnows', devs.ok && dB && dB.here === true && dB.games === 3 && dA && dA.tester === true && dA.here === false,
    JSON.stringify({ b: dB, a: dA }));
}

/* ================= 4. THE DOORS ARE LOCKED ================= */
{
  const DOORS = [
    ['analytics_dashboard', { p_token: 'nope' }], ['analytics_compare', { p_token: 'nope', p_split: new Date().toISOString() }],
    ['analytics_whoami', { p_token: 'nope' }], ['analytics_mark_device', { p_token: 'nope', p_user_id: U('b'), p_mine: true }],
    ['analytics_mark_network', { p_token: 'nope', p_mine: true }], ['analytics_devices', { p_token: 'nope' }],
    ['analytics_feedback', { p_token: 'nope' }], ['analytics_feedback_set', { p_token: 'nope', p_id: 1, p_status: 'fixed' }],
  ];
  const open = DOORS.filter(([n, a]) => { const r = call(n, a); return !(r && r.ok === false && r.reason === 'bad_token'); }).map(d => d[0]);
  ck('everyDoorRefusesABadPassphrase', open.length === 0, open.join(', ') || DOORS.length + ' doors');
  const marked = sql(`select count(*) from public.analytics_excluded;`);
  ck('andABadPassphraseChangesNothing', marked.out === '0', marked.out + ' devices marked');
  // the publishable role: the doors yes, the helpers and the tables no
  const asAnon = (q) => sql(`set role anon; ${q}`);
  const door = asAnon(`select public.analytics_dashboard(${lit(TOKEN)}) ->> 'ok';`);
  const helpers = ['analytics__games(null, null, null, null, false)', 'analytics__window(null, null, null, null, 0, false)', 'analytics__hidden()', 'analytics__net()', 'analytics__ok(\'x\')']
    .filter(h => !asAnon(`select public.${h};`).error);
  const tables = ['telemetry', 'feedback', 'analytics_excluded', 'analytics_excluded_nets', 'analytics_secret', 'analytics_config']
    .filter(t => { const r = asAnon(`select count(*) from public.${t};`); return !r.error && r.out !== '0'; });
  ck('thePublishableRoleCallsTheDoorsAndNothingElse', door.out === 'true' && helpers.length === 0 && tables.length === 0,
    'door ' + (door.out || door.error) + '; helpers it could call: ' + (helpers.join(', ') || 'none') + '; tables it could read: ' + (tables.join(', ') || 'none'));
}

/* ================= 5. DID THE UPDATE HELP ================= */
{
  const split = new Date(Date.now() - 12 * 86400000).toISOString();
  const c = call('analytics_compare', { p_token: TOKEN, p_split: split, p_days: 10, p_min_seconds: 60 });
  // a complete ten-day window, two whole weeks back: before [-26d, -16d) holds
  // B's three games; after [-12d, -2d) holds C's c1/c2 and E's e1 (A hidden)
  ck('twoEqualWindowsEitherSideOfTheMoment', c.ok && c.days === 10 && c.before.games === 3 && c.before.won === 2 && c.after.games === 3 && c.after.left === 1 && c.after.quit === 1,
    JSON.stringify({ before: [c.before.games, c.before.won, c.before.lost], after: [c.after.games, c.after.won, c.after.left, c.after.quit] }));
  const fresh = call('analytics_compare', { p_token: TOKEN, p_split: new Date(Date.now() - 2 * 86400000).toISOString(), p_days: 14 });
  ck('andTheAfterWindowSaysHowMuchOfItHasHappened', fresh.ok && fresh.after_days >= 1.9 && fresh.after_days <= 2.1, 'after_days ' + fresh.after_days);
  /* EQUAL LENGTH, WEEK-ALIGNED: a two-day-old release is two days against the
     same two days a week earlier — never two days against fourteen, where a
     count of distinct players would read the short window as growth */
  const T = k => Date.parse(String(fresh[k]).replace(' ', 'T').replace(/\+00(:00)?$/, 'Z'));
  const lenB = T('before_to') - T('before_from'), lenA = T('after_to') - T('split'), back = T('split') - T('before_from');
  ck('theWindowsAreEqualAndWeekAligned', Math.abs(lenB - lenA) < 2000 && Math.abs(lenA - 2 * 864e5) < 60000 && Math.abs(back - 7 * 864e5) < 2000,
    'before ' + (lenB / 864e5).toFixed(3) + 'd, after ' + (lenA / 864e5).toFixed(3) + 'd, starting ' + (back / 864e5).toFixed(3) + 'd before the release');
}

/* ================= 6. THE INBOX ================= */
{
  const f = call('analytics_feedback', { p_token: TOKEN });
  const bug = (f.reports || []).find(x => x.kind === 'bug');
  ck('everyReportIsInTheInbox', f.ok && f.reports.length === 3 && bug && bug.status === 'new' && bug.email === 'player.b@example.com' &&
    bug.build === '105' && bug.errors.length === 1 && bug.run && bug.run.seed === '1234', JSON.stringify(bug));
  const set = call('analytics_feedback_set', { p_token: TOKEN, p_id: bug.id, p_status: 'fixed', p_note: 'fixed in 107' });
  const row = json(`select json_build_object('status', status, 'note', note, 'handled', handled) from public.feedback where id = ${bug.id};`);
  ck('aStatusIsKeptAndHandledFollowsIt', set.ok && row.status === 'fixed' && row.note === 'fixed in 107' && row.handled === true, JSON.stringify(row));
  const bad = call('analytics_feedback_set', { p_token: TOKEN, p_id: bug.id, p_status: 'deleted' });
  ck('andABadStatusIsRefused', bad.ok === false && bad.reason === 'bad_status', JSON.stringify(bad));
  call('analytics_feedback_set', { p_token: TOKEN, p_id: bug.id, p_status: 'new', p_note: '' });
}

/* ================= 7. THE PAGE, AGAINST THE REAL FUNCTIONS ================= */
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const errs = [];
const SUPA = /draauhjtgifmelzwlojv\.supabase\.co/;
/* the bridge: every RPC the page sends is asked of THIS database, by name,
   with the page's own arguments; `missing` lists doors to answer 404, as an
   unmigrated project would */
const bridge = async (ctx, opts) => {
  opts = opts || {};
  const seen = [];
  await ctx.route(u => SUPA.test(String(u)), async (route) => {
    const req = route.request(), url = req.url(), name = (url.match(/\/rpc\/([a-z_]+)/) || [])[1];
    if (!name) return route.fulfill({ status: 404, body: '' });
    seen.push(name);
    if ((opts.missing || []).includes(name)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}' });
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const r = call(name, body, { 'x-forwarded-for': '198.51.100.7' });
    if (r && r.error && !('ok' in r)) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: r.error }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  return seen;
};
const openPage = async (opts) => {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 900 } });
  const seen = await bridge(ctx, opts);
  if (opts.device) await ctx.addInitScript((id) => { try { localStorage.setItem('sb-draauhjtgifmelzwlojv-auth-token', JSON.stringify({ user: { id } })); } catch (e) {} }, opts.device);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'analytics.html'));
  return { ctx, p, seen };
};
const unlock = async (p, pass) => {
  await p.fill('#pass', pass);
  await p.click('#go');
  await p.waitForFunction(() => !document.getElementById('app').hidden || document.getElementById('gateErr').textContent.length > 12, null, { timeout: 15000 });
  await p.waitForTimeout(400);
};
{
  // the gate: a wrong passphrase is refused and nothing renders
  const { ctx, p } = await openPage();
  await unlock(p, 'wrong');
  const g = await p.evaluate(() => ({ gate: !document.getElementById('gate').hidden, err: document.getElementById('gateErr').textContent }));
  ck('theGateRefusesAWrongPassphrase', g.gate && /not accepted/.test(g.err), JSON.stringify(g));
  await ctx.close();
}
{
  const { ctx, p, seen } = await openPage({ device: U('b') });
  await unlock(p, PASS);
  await p.waitForFunction(() => document.querySelectorAll('#kpis .tile').length === 8 && document.querySelectorAll('#inbox .rep').length > 0 && document.querySelector('#mine button'), null, { timeout: 15000 }).catch(() => {});
  const v = await p.evaluate(() => {
    const t = {}; for (const el of document.querySelectorAll('#kpis .tile')) t[el.querySelector('.k').textContent] = { v: el.querySelector('.v').textContent, n: (el.querySelector('.n') || {}).textContent };
    const split = [...document.querySelectorAll('#split i')].map(i => parseFloat(i.style.width));
    return { t, split: split.reduce((a, x) => a + x, 0), splitN: split.length, key: document.getElementById('splitKey').textContent,
      cmp: document.querySelectorAll('#tCmp tr').length, rel: document.getElementById('cRel').options.length,
      relFirst: (document.getElementById('cRel').options[0] || {}).text || '',
      relPicked: document.getElementById('cRel').value,
      thinTiles: document.querySelectorAll('#kpis .tile .v.thin').length,
      inbox: document.querySelectorAll('#inbox .rep').length, mine: document.getElementById('mine').textContent };
  });
  const H = call('analytics_dashboard', D30()).headline;
  ck('theTilesAreTheDatabasesNumbers', v.t.Games && v.t.Games.v === String(H.games) && v.t.Players.v === String(H.players) &&
    v.t['Win rate'].v === H.win_pct.toFixed(1) + '%' && v.t.Finished.v === H.finished_pct.toFixed(1) + '%' && /3 won of 4 finished/.test(v.t['Win rate'].n) &&
    /4 of 6 reached a win or a loss/.test(v.t.Finished.n),
    JSON.stringify(v.t));
  ck('andTheSplitBarAddsUpToTheGames', Math.abs(v.split - 100) < 0.5 && /Won 3/.test(v.key) && /Lost 1/.test(v.key) && /Quit from the menu 1/.test(v.key) && /Closed the game mid-run 1/.test(v.key),
    v.split.toFixed(1) + '% across ' + v.splitN + ' results: ' + v.key);
  ck('theReleasesComeFromThePatchNotes', v.rel >= 5 && v.cmp === 10 && /^Build 1\d\d · /.test(v.relFirst), v.rel + ' releases offered (newest "' + v.relFirst + '"), ' + v.cmp + ' comparison rows');
  {
    const D = call('analytics_dashboard', D30());
    const want = new Date(D.builds['107']).toISOString();
    ck('theComparisonOpensOnTheNewestReleaseWithAKnownMoment', v.relPicked === want, v.relPicked + ' against build 107 first seen ' + want);
  }
  ck('andEveryRateWearsItsCounts', /3 won of 4 finished/.test(v.t['Win rate'].n) && /too few to trust yet/.test(v.t['Win rate'].n) && v.thinTiles >= 4,
    v.thinTiles + ' greyed tiles (every rate here rests on fewer than 30)');
  ck('theInboxRendersEveryOpenReport', v.inbox === 3, v.inbox + ' reports');
  ck('thisDeviceIsNamed', /This device/.test(v.mine) && /Counted/.test(v.mine) && /3 games on record/.test(v.mine), v.mine.slice(0, 200));
  ck('theDashboardAsksOnlyItsOwnDoors', !seen.includes('analytics_summary') && ['analytics_dashboard', 'analytics_compare', 'analytics_feedback', 'analytics_whoami', 'analytics_devices'].every(n => seen.includes(n)),
    [...new Set(seen)].join(', '));
  // SEND TO CLAUDE: a GitHub issue, the report and the errors in it, the email never.
  // What the page ASKS window.open for is the claim (this sandbox reaches no github.com)
  await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  const bugCard = await p.$('#inbox .rep:has(.badge.bug)');
  await bugCard.$eval('[data-act="claude"]', el => el.click());
  await p.waitForTimeout(600);
  const opened = await p.evaluate(() => window.__opened);
  const issue = opened.find(u => /^https:\/\/github\.com\/robleuscaesar\/civilization-game\/issues\/new\?/.test(u)) || '';
  const q = issue ? new URL(issue).searchParams : null;
  const body = q ? q.get('body') || '' : '';
  const bugId = sql(`select id from public.feedback where kind = 'bug';`).out;
  ck('sendToClaudeOpensAGitHubIssueWithTheReport', !!issue && /^\[Bug\] The wall would not build/.test(q.get('title')) &&
    /The wall would not build/.test(body) && /Build:\*\* 105/.test(body) && /seed 1234/.test(body) && /TypeError: x is undefined/.test(body) &&
    /\*\*For Claude:\*\*/.test(body) && body.includes('<!-- clanfire-report:' + bugId + ' -->') && q.get('labels') === 'player-report',
    issue ? q.get('title') + ' | labels ' + q.get('labels') + ' | ' + body.slice(0, 160).replace(/\n/g, ' ') : 'no issue window opened');
  ck('andNeverThePlayersEmailNameOrABareMention', !!body && !/example\.com/.test(issue) && !/Bryn/.test(issue) && !/@claude/i.test(issue),
    'a bare @claude pings whoever owns that GitHub handle');
  const st = sql(`select status from public.feedback where kind = 'bug';`).out;
  ck('andTheReportIsMarkedSent', st === 'sent', st);
  /* GitHub refuses a prefilled issue past ~8k characters of address: the
     longest report the game accepts (4000 characters) with a full error
     ring still opens, its errors and words cut to fit, never refused */
  const long = await p.evaluate(() => {
    const x = { id: 99, kind: 'crash', status: 'new', at: '2026-10-28T10:00:00Z', message: ('A long report with spaces & symbols; ').repeat(110).slice(0, 4000), build: '107',
      browser: 'Mozilla/5.0 (iPhone)', run: { mode: 'hard', day: 300, seed: '42' },
      errors: Array.from({ length: 20 }, (_, i) => ({ t: '2026-10-28T10:00:00Z', msg: 'TypeError: something long went wrong number ' + i, at: 'js/render.js:' + (4000 + i) + ':12', n: 3, stack: 'at a (x.js:1)\nat b (y.js:2)' })) };
    INBOX.push(x); renderInbox();
    window.__opened = [];
    document.querySelector('.rep[data-id="99"] [data-act="claude"]').click();
    return new Promise(r => setTimeout(() => r(window.__opened.slice(-1)[0] || ''), 300));
  });
  ck('aLongReportStillFitsAGitHubAddress', long.length > 1000 && long.length <= 7000 && /clanfire-report%3A99/.test(long), long.length + ' characters');
  // a status saved from the page lands in the table
  await p.waitForTimeout(300);
  const ideaCard = await p.$('#inbox .rep:has(.badge.idea)');
  await ideaCard.$eval('[data-act="status"]', el => { el.value = 'wontfix'; });
  await ideaCard.$eval('[data-act="note"]', el => { el.value = 'not this year'; });
  await ideaCard.$eval('[data-act="save"]', el => el.click());
  await p.waitForTimeout(600);
  const idea = json(`select json_build_object('s', status, 'n', note) from public.feedback where kind = 'idea';`);
  ck('aStatusSavedFromThePageIsKept', idea.s === 'wontfix' && idea.n === 'not this year', JSON.stringify(idea));
  // THIS DEVICE IS MINE, from the page: B leaves the numbers
  await p.click('#mine button[data-mine-dev]');
  await p.waitForFunction(() => /Left out/.test(document.getElementById('mine').textContent), null, { timeout: 10000 }).catch(() => {});
  const after = await p.evaluate(() => { const t = {}; for (const el of document.querySelectorAll('#kpis .tile')) t[el.querySelector('.k').textContent] = el.querySelector('.v').textContent; return { t, mine: document.getElementById('mine').textContent }; });
  ck('markingThisDeviceTakesItOutOfTheNumbers', after.t.Games === '3' && /Left out/.test(after.mine) && /marked yours/.test(after.mine), JSON.stringify(after.t) + ' · ' + after.mine.slice(0, 120));
  sql(`delete from public.analytics_excluded; update public.feedback set status = 'new', note = null, handled = false;`);
  await ctx.close();
}
{
  // a project without 0010: the setup note, never a broken page
  const { ctx, p } = await openPage({ missing: ['analytics_dashboard', 'analytics_compare', 'analytics_feedback', 'analytics_whoami', 'analytics_devices', 'analytics_mark_device', 'analytics_mark_network', 'analytics_feedback_set'] });
  await unlock(p, PASS);
  const s = await p.evaluate(() => ({ setup: !document.getElementById('setup').hidden, text: document.getElementById('setup').textContent, main: document.getElementById('main').hidden }));
  ck('aMissingMigrationShowsTheSetupNote', s.setup && s.main && /0010_dashboard\.sql/.test(s.text) && /0009_feedback\.sql/.test(s.text), s.text.slice(0, 160));
  await ctx.close();
}
{
  // a phone: the tiles in two columns, nothing wider than the screen
  const { ctx, p } = await openPage({ w: 390, h: 844 });
  await unlock(p, PASS);
  await p.waitForFunction(() => document.querySelectorAll('#kpis .tile').length === 8, null, { timeout: 15000 }).catch(() => {});
  const f = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    cols: getComputedStyle(document.getElementById('kpis')).gridTemplateColumns.split(' ').length }));
  ck('itFitsAPhone', f.sw <= f.cw && f.cols === 2, JSON.stringify(f));
  await ctx.close();
}
ck('thePageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
done();
