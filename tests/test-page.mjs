/* THE TEST PAGE IS A SANDBOX — the contract for CFG.TEST_PAGE (operator,
   build 149: "going forward, can you set all resources in the test
   environment to 2,000 and give the full compliment of cards. This speeds
   up testing things at all levels").

   The test build lives at clanfire.online/test145/ (CLAUDE.md, THE TEST
   BUILD): the live game's own origin, so the same device storage. This suite
   serves the repo over HTTP twice on one origin — under /test145/ (a test
   build: Backend.testSlot answers yes) and at / (the live site) — and holds:

   1. A RUN FOUNDED ON THE TEST PAGE STARTS WITH 2,000 OF EVERY GOOD (never
      less than its own start package), and the title's demo world does not.
   2. THE TEST PAGE HOLDS THE FULL DECK — one of every card in the catalog —
      on every load, a test deck (no sync, no reports).
   3. …UNDER KEYS OF ITS OWN: the live collection ('neo-deck') and anything
      the live page set aside ('neo-deck-real') are never read or written
      there, a card played there included.
   4. THE LIVE SITE NEVER: at / the same seed starts with its start package,
      the deck is the player's own collection, untouched.

     node tests/test-page.mjs      # exits non-zero on any regression */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// one origin, two doors: /test145/… and /… both serve the repo
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const srv = createServer(async (rq, rs) => {
  try {
    let u = decodeURIComponent(rq.url.split('?')[0]);
    if (u === '/__blank') { rs.writeHead(200, { 'content-type': 'text/html' }); rs.end('<!doctype html><title>blank</title>'); return; }
    u = u.replace(/^\/test145(\/|$)/, '/');
    const f = join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
    if (!f.startsWith(root)) { rs.writeHead(403); rs.end(); return; }
    const body = await readFile(f);
    rs.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' });
    rs.end(body);
  } catch (e) { rs.writeHead(404); rs.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
// nothing leaves the machine: the cloud is somebody else's
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

// the device's LIVE collection, and a collection the live page had set aside
const LIVE = JSON.stringify({ v: 1, counts: { forager_cache: 2, willing_hands: 1 }, seen: { forager_cache: 1, willing_hands: 1 },
  pity: 3, starter: 1, runs: {}, queue: [{ op: 'consume', id: 'x', at: 1 }], medians: {} });
const STASH = JSON.stringify({ v: 1, counts: { fallen_timber: 1 }, seen: {}, pity: 0, starter: 1, runs: {}, queue: [], medians: {} });
await p.goto(base + '/__blank');
await p.evaluate(([L, S2]) => { localStorage.clear(); localStorage.setItem('neo-deck', L); localStorage.setItem('neo-deck-real', S2); }, [LIVE, STASH]);

const boot = async (path) => {
  await p.goto(base + path, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof G !== 'undefined' && typeof Deck !== 'undefined' && window.Screens && Screens.current, null, { timeout: 60000 });
  await p.waitForTimeout(1200);
};
const SEED = 'sandbox-149', RES = ['food', 'wood', 'stone', 'gold'];

/* ---- the test page ---- */
await boot('/test145/index.html');
const t = await p.evaluate(([seed, RES]) => {
  const out = { slot: Backend.testSlot(), key: Deck.KEY, real: Deck.REAL_KEY, flag: !!Deck.TEST_PAGE, n: CFG.TEST_PAGE && CFG.TEST_PAGE.res };
  Deck.ensureStarter();
  out.total = Deck.total(); out.catalog = Deck.CATALOG.length; out.test = Deck.isTest();
  out.everyOne = Deck.CATALOG.every(c => Deck.count(c.id) === 1);
  out.sync = Deck._syncGate();
  // a run founded here
  Screens._demo = false;
  G.newGame(seed, 'moderate', 'medium');
  out.res = Object.fromEntries(RES.map(k => [k, S.res[k]]));
  // the title's demo world is nobody's run
  Screens._demo = true;
  G.newGame(seed, 'moderate', 'medium');
  out.demo = Object.fromEntries(RES.map(k => [k, S.res[k]]));
  Screens._demo = false;
  // a card played here leaves the live keys alone
  const first = Deck.CATALOG[0].id;
  Deck._add(first, -1); Deck.saveCol();
  out.afterPlay = Deck.count(first);
  out.liveKey = localStorage.getItem('neo-deck'); out.liveReal = localStorage.getItem('neo-deck-real');
  out.ownKey = !!localStorage.getItem(Deck.KEY);
  return out;
}, [SEED, RES]);
ck('theTestPageIsATestBuild', t.slot === true && t.flag && t.key !== 'neo-deck' && t.real !== 'neo-deck-real' && t.n === 2000,
  `testSlot ${t.slot}, deck keys ${t.key} / ${t.real}, CFG.TEST_PAGE.res ${t.n}`);
ck('itHoldsTheFullDeck', t.total === t.catalog && t.everyOne && t.test && t.sync === 'test',
  `${t.total} cards of ${t.catalog}, one of each ${t.everyOne}, a test deck ${t.test}, sync gate '${t.sync}'`);

/* ---- the live site: the same seed, the player's own collection ---- */
await boot('/index.html');
const l = await p.evaluate(([seed, RES]) => {
  const out = { slot: Backend.testSlot(), key: Deck.KEY, flag: !!Deck.TEST_PAGE };
  out.counts = JSON.stringify(Deck.col().counts); out.total = Deck.total();
  Screens._demo = false;
  G.newGame(seed, 'moderate', 'medium');
  out.res = Object.fromEntries(RES.map(k => [k, S.res[k]]));
  out.liveKey = localStorage.getItem('neo-deck'); out.liveReal = localStorage.getItem('neo-deck-real');
  return out;
}, [SEED, RES]);
const pk = l.res;
ck('aRunFoundedThereStartsWithTwoThousandOfEveryGood',
  RES.every(k => t.res[k] === Math.max(pk[k], 2000) && t.res[k] >= 2000),
  `test page ${RES.map(k => k + ' ' + t.res[k]).join(', ')}; the live site's start package ${RES.map(k => k + ' ' + pk[k]).join(', ')}`);
ck('butNotTheTitlesDemoWorld', RES.every(k => t.demo[k] === pk[k]), `demo ${RES.map(k => k + ' ' + t.demo[k]).join(', ')}`);
ck('andTheLiveCollectionIsNeverTouched', t.liveKey === LIVE && t.liveReal === STASH && t.ownKey && t.afterPlay === 0,
  `live slot ${t.liveKey === LIVE ? 'as stored' : 'CHANGED'}, its set-aside ${t.liveReal === STASH ? 'as stored' : 'CHANGED'}, the test page's own key written ${t.ownKey}, the played card ${t.afterPlay}`);
ck('theLiveSiteIsNoSandbox', l.slot === false && l.key === 'neo-deck' && !l.flag && l.counts === JSON.stringify({ forager_cache: 2, willing_hands: 1 }) &&
  RES.every(k => pk[k] < 2000) && l.liveKey === LIVE,
  `testSlot ${l.slot}, key ${l.key}, its collection ${l.counts}, start ${RES.map(k => pk[k]).join('/')}`);

/* ---- …and the full deck is dealt again on the next load ---- */
await boot('/test145/index.html');
const t2 = await p.evaluate(() => { Deck.ensureStarter(); return { total: Deck.total(), catalog: Deck.CATALOG.length,
  everyOne: Deck.CATALOG.every(c => Deck.count(c.id) === 1), liveKey: localStorage.getItem('neo-deck') }; });
ck('andDealtAgainOnEveryLoad', t2.total === t2.catalog && t2.everyOne && t2.liveKey === LIVE,
  `${t2.total} of ${t2.catalog} after a card was played and the page reloaded`);
ck('andNothingThrew', !errs.length, errs.slice(0, 3).join(' | '));

await b.close();
srv.close();
console.log(JSON.stringify(res, null, 2));
if (fails.length) { console.log(fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('ALL PASS');
