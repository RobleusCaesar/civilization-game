/* THE CARD SYSTEM — the cloud (Deck.sync in js/deck.js, Backend.flushEnds in
   js/backend.js, supabase/migrations/0008_cards.sql).

   The collection lives on the device and the cloud is the RECORD once it
   answers. Every change the device makes is queued (starter / grant /
   consume) and Deck.sync delivers the queue through 0008's doors, then
   reconciles against my_cards(). This file drives it against a MOCKED
   backend that plays 0008's rules (no network is ever touched) and pins:

     IN ORDER          the queue drains in the order it was written, then the
                       reconcile; nothing queued is ever skipped past
     A DUPLICATE       answered ok + already (a lost answer, retried) leaves
                       the queue and changes nothing
     NOT REACHED       offline, or the migration not yet applied (a 404): the
                       op is KEPT, the drain stops there, a retry is scheduled,
                       and the next sync delivers it
     NO_RUN            the grant's run_end has not landed: the grant is kept
                       and retried, holding back ONLY the plays of its own
                       cards — and the evidence a run could not send at the
                       time goes up FIRST (report_run_end), so its grant lands
                       in the same sync; a grant whose evidence never comes is
                       given up after days AND tries, never sooner
     REFUSED           for good (not earned): dropped, and the reconcile takes
                       the card back off the device
     THE RECORD        with the queue empty, my_cards() REPLACES the device's
                       counts (and brings seen / pity / the winning medians);
                       never while anything waits, and an answer that comes
                       back after a card was played is thrown away
     ONE MIRROR PER PLAYER  a different player signing in on this device never
                       inherits the collection; the first comes back to theirs,
                       queue and all, delivered under their own identity
     THE SWITCH        off, Deck.sync does nothing at all: no listener, no
                       request, no write — even with a queue waiting
     THE SITE          a page from disk never touches the cloud, even with the
                       cloud forced up (the gate is what stops it), and a
                       review deal (?cards=slice) never syncs its free cards
     NEVER THROWS      an answer that is not one of ours keeps the op
     THE MIGRATION     0008_cards.sql, on the source: every door, RLS on every
                       table, the telemetry kinds widened, idempotent in form,
                       the one loss-deeds number in one place — and its catalog,
                       starter hand and drop tiers equal to the game's own

   Run after touching: Deck.sync / the queue ops in js/deck.js,
   Backend.rpc / flushEnds / _emitEnd, or supabase/migrations/0008_cards.sql.

     node tests/deck-sync.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + join(root, 'index.html');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const res = {}, fails = [], errs = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const bail = async (why) => {
  for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
  console.log('BAILED: ' + why);
  console.log('FAILURES:', fails.join(', ') || why);
  process.exit(1);
};

/* a backend mock that plays 0008's rules: one record per uid (counts, the
   starter hand, grants by run, plays by play id, the run_end rows it has
   seen), the four doors plus report_run_end, and switches to take the
   network down, hide a door (a 404), or answer garbage */
const MOCK = `
  window.__MOCK = (() => {
    const st = { uid: 'uid-A', calls: [], rows: [], down: false, missing: {}, garbage: {}, refuse: {},
                 pity: 0, medians: {}, onMyCards: null, telemetryFails: false, emits: 0 };
    const db = {};
    const rec = uid => db[uid] || (db[uid] = { counts: {}, seen: {}, starter: 0, grants: {}, plays: {}, ends: {} });
    const add = (m, k, n) => { m.counts[k] = (m.counts[k] || 0) + n; if (!m.seen[k]) m.seen[k] = 1000; };
    const session = () => ({ access_token: 't-' + st.uid, refresh_token: 'r', user: { id: st.uid } });
    const auth = {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: session() }, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; },
    };
    const doors = {
      claim_starter_hand() {
        const m = rec(st.uid);
        if (m.starter) return { ok: true, already: true };
        m.starter = 5000;
        for (const k of ['fallen_timber', 'forager_cache', 'willing_hands']) add(m, k, 1);
        return { ok: true, cards: ['fallen_timber', 'forager_cache', 'willing_hands'] };
      },
      grant_card(a) {
        const m = rec(st.uid);
        if (m.grants[a.p_run_id]) return { ok: true, already: true, cards: m.grants[a.p_run_id] };
        if (!m.ends[a.p_run_id]) return { ok: false, reason: 'no_run' };
        if (m.ends[a.p_run_id] !== a.p_outcome) return { ok: false, reason: 'outcome_mismatch' };
        if (st.refuse[a.p_run_id]) return { ok: false, reason: st.refuse[a.p_run_id] };
        m.grants[a.p_run_id] = a.p_cards.slice();
        for (const k of a.p_cards) add(m, k, 1);
        return { ok: true, cards: a.p_cards };
      },
      consume_card(a) {
        const m = rec(st.uid);
        if (m.plays[a.p_play_id]) return { ok: true, already: true, left: m.counts[a.p_card_key] || 0 };
        if (!(m.counts[a.p_card_key] > 0)) return { ok: false, reason: 'none_left' };
        m.counts[a.p_card_key]--;
        m.plays[a.p_play_id] = a.p_card_key;
        return { ok: true, left: m.counts[a.p_card_key] };
      },
      my_cards() {
        const m = rec(st.uid);
        if (st.onMyCards) { const f = st.onMyCards; st.onMyCards = null; f(); }
        const counts = {};
        for (const k in m.counts) if (m.counts[k] > 0) counts[k] = m.counts[k];
        return { ok: true, uid: st.uid, counts, seen: Object.assign({}, m.seen), starter: !!m.starter,
                 starter_at: m.starter || null, pity: st.pity, medians: st.medians };
      },
      report_run_end(a) {
        const m = rec(st.uid), r = a.p_row || {};
        if (!r.run_id || r.cause === 'closed_tab') return { ok: false, reason: 'bad_input' };
        if (m.ends[r.run_id]) return { ok: true, already: true };
        m.ends[r.run_id] = r.outcome;
        return { ok: true };
      },
    };
    const rest = (method, path, body) => {
      st.calls.push({ method, path, uid: st.uid, body: body == null ? null : JSON.parse(JSON.stringify(body)) });
      // a request that dies: the REAL transport (Backend._rest's catch) says
      // so on backend-status before it gives up — the mock path does not, so
      // the mock does it for it, or a listener that answers every status word
      // with another sync would look innocent here and spin on a real phone
      // (after the throw, as the real one does after its awaited fetch)
      if (st.down) { st.emits++; setTimeout(() => { try { Backend.emit(); } catch (e) {} }, 0); throw new TypeError('Failed to fetch'); }
      if (path === '/telemetry' && method === 'POST') {
        for (const row of body || []) {
          st.rows.push(row);
          if (!st.telemetryFails && row.kind === 'run_end' && row.run_id && row.cause !== 'closed_tab')
            rec(row.user_id).ends[row.run_id] = row.outcome;
        }
        return st.telemetryFails ? { error: { status: 503, message: 'down' } } : null;
      }
      if (path.startsWith('/rpc/')) {
        const name = path.slice(5);
        if (st.missing[name]) return { error: { status: 404, code: 404, message: 'Could not find the function' } };
        if (name in st.garbage) return st.garbage[name];
        return doors[name] ? doors[name](body || {}) : null;
      }
      if (path.startsWith('/profiles') && method === 'GET') return [{ id: st.uid }];
      return method === 'GET' ? [] : null;
    };
    return { st, db, rec, auth, rest };
  })();
  window.__NEO_BACKEND_MOCK = { auth: window.__MOCK.auth, rest: window.__MOCK.rest };
`;

/* ================= 1. THE SWITCH: off, nothing at all ================= */
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
  // a device that once had the deck on: a collection on disk with ops waiting
  await ctx.addInitScript(() => {
    try {
      localStorage.removeItem('neo-cards-dev');
      localStorage.setItem('neo-deck', JSON.stringify({ v: 1, counts: { forager_cache: 1 }, seen: {}, runs: {}, medians: {},
        queue: [{ op: 'starter', cards: ['forager_cache'] }, { op: 'consume', card: 'forager_cache', play: 'p-off', run: 'r', day: 3 }] }));
    } catch (e) {}
  });
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('switch: ' + e));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 60000 });
  const r = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 800));        // the boot hook and a sign-in have both had their chance
    const before = __MOCK.st.calls.filter(c => c.path.startsWith('/rpc/')).length;
    const stored = localStorage.getItem('neo-deck');
    const out = await Deck.sync('test');
    await new Promise(r => setTimeout(r, 100));
    return {
      on: Deck.on(), why: out.why, armed: Deck._sy !== null,
      rpcs: before + __MOCK.st.calls.filter(c => c.path.startsWith('/rpc/')).length,
      untouched: localStorage.getItem('neo-deck') === stored && JSON.parse(stored).queue.length === 2,
      isPromise: Deck.sync('again') instanceof Promise,
    };
  });
  ck('offTheSyncDoesNothingAtAll', !r.on && r.why === 'off' && !r.armed && r.rpcs === 0 && r.untouched,
    `on ${r.on}, why ${r.why}, armed ${r.armed}, rpc calls ${r.rpcs}, disk untouched ${r.untouched}`);
  ck('andItIsNeverAwaitedByTheGame', r.isPromise, 'Deck.sync answers a promise at once');
  await ctx.close();
}

/* ================= 2. THE SITE: a page from disk never touches the cloud ================= */
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('neo-deck', JSON.stringify({ v: 1, uid: 'disk-uid', counts: { forager_cache: 1 }, seen: {}, runs: {}, medians: {},
        queue: [{ op: 'consume', card: 'forager_cache', play: 'p-disk', run: 'r', day: 3 }] }));
    } catch (e) {}
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('disk: ' + e));
  await p.goto(url + '?cards=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  const r = await p.evaluate(async () => {
    let hits = 0;
    const real = window.fetch;
    window.fetch = (u) => { hits++; return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, already: true }), json: async () => ({}) }); };
    const out = {};
    out.on = Deck.on();
    out.plain = (await Deck.sync('disk')).why;
    out.plainHits = hits;
    // force the cloud up, exactly as finished-run-continue does — the SITE gate still holds
    Backend.configured = true; Backend.uid = 'disk-uid'; Backend.session = { access_token: 't' };
    const ready = Backend.isReady; Backend.isReady = () => true;
    out.forced = (await Deck.sync('forced')).why;
    out.forcedHits = hits;
    // the sanity half: with the site gate opened, the same sync WOULD go out
    const allowed = Backend.telemetryAllowed; Backend.telemetryAllowed = () => true;
    Backend.RETRIES = 1;
    out.opened = (await Deck.sync('opened')).sent;
    out.openedHits = hits;
    Backend.telemetryAllowed = allowed; Backend.isReady = ready; Backend.configured = false; Backend.uid = null; Backend.session = null;
    window.fetch = real;
    return out;
  });
  ck('aPageFromDiskNeverTouchesTheCloud', r.on && r.plain === 'not_configured' && r.plainHits === 0, `why ${r.plain}, fetches ${r.plainHits}`);
  ck('evenWithTheCloudForcedUp', r.forced === 'not_site' && r.forcedHits === 0, `why ${r.forced}, fetches ${r.forcedHits}`);
  ck('andTheSiteGateIsWhatStopsIt', r.opened >= 1 && r.openedHits >= 1, `with the gate opened: sent ${r.opened}, fetches ${r.openedHits}`);
  await ctx.close();
}

/* ================= 3. A TEST DECK never syncs, and the record never takes it back ================= */
{
  // (a) the test link itself: ?cards=all (the device already has the deck on)
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('neo-cards-dev', '1'); } catch (e) {} });
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('test deck: ' + e));
  await p.goto(url + '?cards=all', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 60000 });
  const r = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 400));        // the boot hook and the sign-in have both had their chance
    Deck.ensureStarter();
    const out = await Deck.sync('test-link');
    await new Promise(r => setTimeout(r, 300));
    return { why: out.why, rpcs: __MOCK.st.calls.filter(c => c.path.startsWith('/rpc/')).length };
  });
  ck('aTestLinkStaysOnTheDevice', r.why === 'test' && r.rpcs === 0, `why ${r.why}, rpc calls ${r.rpcs}`);
  await ctx.close();
}
{
  // (b) a mirror marked `test` (Deck.dealAll's stamp) outlives the link: an
  // ordinary load, a sign-in, a queued op — and still nothing goes, and the
  // record never overwrites the dealt hand
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('neo-deck', JSON.stringify({ v: 1, uid: 'uid-A', test: 1700000000000, starter: 1, counts: { dragonfire: 1, krakens_call: 1, forager_cache: 1 },
        seen: {}, runs: {}, medians: {}, queue: [{ op: 'consume', card: 'starfall', play: 'p-test', run: 'r', day: 3 }] }));
    } catch (e) {}
  });
  await ctx.addInitScript(MOCK);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('test mark: ' + e));
  await p.goto(url + '?cards=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 60000 });
  const r = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 400));
    __MOCK.rec('uid-A').counts = { gold_nugget: 1 };   // what the record holds — it must not replace the toy
    __MOCK.rec('uid-A').starter = 1;
    window.dispatchEvent(new CustomEvent('backend-status', { detail: { online: true, configured: true, uid: 'uid-other' } }));
    const out = await Deck.sync('test-mark');
    await new Promise(r => setTimeout(r, 300));
    const c = Deck.col();
    return { why: out.why, rpcs: __MOCK.st.calls.filter(c => c.path.startsWith('/rpc/')).length,
      counts: JSON.stringify(c.counts), uid: c.uid, queue: c.queue.length };
  });
  ck('aTestDeckIsNeverSyncedOrTakenBack', r.why === 'test' && r.rpcs === 0 && r.uid === 'uid-A' &&
    r.counts === JSON.stringify({ dragonfire: 1, krakens_call: 1, forager_cache: 1 }),
    `why ${r.why}, rpc calls ${r.rpcs}, mirror ${r.uid} ${r.counts}, ops left alone ${r.queue}`);
  await ctx.close();
}

/* ================= 4-10. with the mock, on: the queue, the record, the mirror ================= */
const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
await ctx.addInitScript(MOCK);
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('sync: ' + e));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto(url + '?cards=1', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 60000 });
// the boot: the starter hand is dealt on the title, queued, delivered and reconciled with no help
await p.waitForFunction(() => Deck.col().synced && !Deck.col().queue.length && !(Deck._sy && Deck._sy.busy), null, { timeout: 20000 }).catch(() => {});

const boot = await p.evaluate(() => {
  const rpc = __MOCK.st.calls.filter(c => c.path.startsWith('/rpc/')).map(c => c.path.slice(5));
  return { rpc, uid: Deck.col().uid, counts: JSON.stringify(Deck.col().counts), armed: !!(Deck._sy && Deck._sy.armed) };
});
ck('atBootTheStarterHandIsDeliveredThenReconciled',
  boot.rpc[0] === 'claim_starter_hand' && boot.rpc.includes('my_cards') && boot.rpc.indexOf('my_cards') > 0 && boot.uid === 'uid-A' && boot.armed &&
  boot.counts === JSON.stringify({ fallen_timber: 1, forager_cache: 1, willing_hands: 1 }),
  `rpc ${boot.rpc.join(' → ')}; mirror uid ${boot.uid}; counts ${boot.counts}`);

// the scaffolding the rest of the file uses
await p.evaluate(() => {
  Backend.RETRIES = 1;                           // a failure costs one attempt, not three
  Deck.SYNC.WAIT_MS = [600000];                  // no background retry fires mid-check unless a check asks
  window.__t = {
    rpcs(since) { return __MOCK.st.calls.slice(since).filter(c => c.path.startsWith('/rpc/')); },
    mark() { return __MOCK.st.calls.length; },
    // a run that ended for real: its run_end row lands the way the game sends it
    ended(run, outcome) { __MOCK.rec(__MOCK.st.uid).ends[run] = outcome; },
    // the device's side of a grant / a play, through the deck's own primitives
    grant(run, cards, outcome) { for (const k of cards) Deck._add(k, 1); Deck._queue({ op: 'grant', run, key: run, outcome: outcome || 'win', mode: 'moderate', cards }); },
    play(card, play) { Deck._add(card, -1); Deck._queue({ op: 'consume', card, play, run: 'r-play', day: 7 }); },
    quiet() { if (Deck._sy && Deck._sy.timer) { clearTimeout(Deck._sy.timer); Deck._sy.timer = 0; } },
    // 'door:what' for a recorded call, 'op:what:why' for a queued op — a play by its play id, a grant by its run
    tag(c) { const a = c.body || {}; return c.path.slice(5) + ':' + (a.p_play_id || a.p_run_id || (a.p_row && a.p_row.run_id) || ''); },
    optag(o) { return o.op + ':' + (o.op === 'consume' ? o.play : o.run) + ':' + (o.why || ''); },
  };
});

/* ---- 4. IN ORDER, and A DUPLICATE ---- */
{
  const r = await p.evaluate(async () => {
    const m0 = __t.mark();
    __t.ended('r1', 'win'); __t.ended('r2', 'win');
    __t.grant('r1', ['trade_caravan']);
    __t.play('trade_caravan', 'p1');
    __t.grant('r2', ['blight', 'golden_age']);
    __t.play('blight', 'p2');
    const order = Deck.col().queue.map(o => __t.optag(o));
    const out = await Deck.sync('order');
    const sent = __t.rpcs(m0).map(c => __t.tag(c));
    const cloud = JSON.stringify(__MOCK.rec('uid-A').counts);
    // the same grant and the same play again — an answer lost on the way back, retried
    const m1 = __t.mark();
    const before = JSON.stringify(Deck.col().counts);
    Deck._queue({ op: 'grant', run: 'r1', key: 'r1', outcome: 'win', mode: 'moderate', cards: ['trade_caravan'] });
    Deck._queue({ op: 'consume', card: 'trade_caravan', play: 'p1', run: 'r-play', day: 7 });
    const dup = await Deck.sync('dup');
    return { order, sent, out, cloud, dup, dupSent: __t.rpcs(m1).length, before, after: JSON.stringify(Deck.col().counts),
      cloudAfter: JSON.stringify(__MOCK.rec('uid-A').counts), left: Deck.col().queue.length };
  });
  ck('theQueueDrainsInTheOrderItWasWritten',
    JSON.stringify(r.sent) === JSON.stringify(['grant_card:r1', 'consume_card:p1', 'grant_card:r2', 'consume_card:p2', 'my_cards:']) &&
    r.out.ok && r.out.done === 4 && r.out.kept === 0 && r.out.reconciled,
    `queued ${r.order.join(', ')} → sent ${r.sent.join(', ')}`);
  ck('aDuplicateIsDroppedAndChangesNothing', r.dup.ok && r.dup.done === 2 && r.dup.dropped === 0 && r.left === 0 &&
    r.before === r.after && r.cloud === r.cloudAfter, `done ${r.dup.done}, counts ${r.before} → ${r.after}, cloud ${r.cloud} → ${r.cloudAfter}`);
}

/* ---- 5. NOT REACHED: kept, the drain stops there, retried ---- */
{
  const r = await p.evaluate(async () => {
    __t.ended('r3', 'win'); __t.ended('r4', 'win');
    __t.grant('r3', ['iron_legion']);
    __t.grant('r4', ['veterans']);
    __MOCK.st.down = true;
    const m0 = __t.mark();
    Deck.SYNC.WAIT_MS = [600000];
    const e0 = __MOCK.st.emits;
    // a drain that chased its own failures would never resolve: race it
    const out = await Promise.race([Deck.sync('down'), new Promise(r => setTimeout(() => r({ why: 'spinning', kept: -1 }), 4000))]);
    const emitted = __MOCK.st.emits - e0;
    const tried = __t.rpcs(m0).map(c => c.body && c.body.p_run_id);
    const q = Deck.col().queue.map(o => ({ run: o.run, n: o.n || 0 }));
    const timer = !!(Deck._sy && Deck._sy.timer);
    // the sync's own save (an op's try count) must not ask for another sync:
    // an offline device that did would spin, hammering a dead network
    await new Promise(r => setTimeout(r, 900));
    const spun = __t.rpcs(m0).length - tried.length;
    __t.quiet();
    // THE MIGRATION NOT YET APPLIED: the door is a 404 — not reached either
    __MOCK.st.down = false;
    __MOCK.st.missing.grant_card = true;
    const out404 = await Deck.sync('404');
    const q404 = Deck.col().queue.length;
    __t.quiet();
    // the network and the door are back: everything goes
    delete __MOCK.st.missing.grant_card;
    const m1 = __t.mark();
    const back = await Deck.sync('back');
    return { out, tried, q, timer, spun, emitted, out404: out404.why, q404, back, sentBack: __t.rpcs(m1).map(c => c.path.slice(5)),
      cloud: __MOCK.rec('uid-A').counts };
  });
  ck('anOfflineDeviceDoesNotSpin', r.spun === 0 && r.out.why !== 'spinning' && r.emitted >= 1,
    `${r.spun} more asks in the 0.9 s after a failed drain that said "offline" ${r.emitted}× on backend-status (the retry waits its turn)`);
  ck('anUnreachableOpIsKeptAndTheDrainStopsThere',
    r.out.why === 'network' && r.out.kept === 2 && r.tried.length === 1 && r.tried[0] === 'r3' && r.q[0].n === 1 && r.q[1].n === 0 && r.timer,
    `why ${r.out.why}, kept ${r.out.kept}, asked ${r.tried.join(',')}, tries ${JSON.stringify(r.q)}, retry scheduled ${r.timer}`);
  // a drain that spins never resolves, and every later sync in this file
  // joins it: report now rather than hang until the runner gives up
  if (r.out.why === 'spinning') await bail('the offline drain chased its own backend-status and never settled');
  ck('aDoorThatIsNotThereYetKeepsItToo', r.out404 === '404' && r.q404 === 2, `why ${r.out404}, kept ${r.q404}`);
  ck('andTheNextSyncDeliversIt', r.back.ok && r.back.done === 2 && r.cloud.iron_legion === 1 && r.cloud.veterans === 1 &&
    JSON.stringify(r.sentBack) === JSON.stringify(['grant_card', 'grant_card', 'my_cards']), `${r.sentBack.join(' → ')}`);
}

/* ---- 6. NO_RUN: retried, holding back only its own cards' plays; the evidence goes first ---- */
{
  const r = await p.evaluate(async () => {
    const out = {};
    // r5's run_end has not landed; r6's has
    __t.ended('r6', 'win');
    __t.grant('r5', ['starfall']);
    __t.play('starfall', 'p5');              // a play of r5's card — must wait behind it
    __t.play('fallen_timber', 'p6');         // a play of a card the cloud already holds — must not
    __t.grant('r6', ['war_band']);
    const m0 = __t.mark();
    const s1 = await Deck.sync('norun');
    out.s1 = s1;
    out.sent1 = __t.rpcs(m0).map(c => __t.tag(c));
    out.left1 = Deck.col().queue.map(o => __t.optag(o));
    out.timer = !!(Deck._sy && Deck._sy.timer);
    __t.quiet();
    // a second try, still nothing: still kept, its try count rising
    await Deck.sync('norun2');
    out.tries = Deck.col().queue.find(o => o.run === 'r5').n;
    __t.quiet();
    // THE EVIDENCE GOES FIRST: r5's ending could not be sent at the time (the
    // boot never signed in), so it was kept on the device; the next sync sends
    // it through report_run_end BEFORE the grant that waits on it
    localStorage.setItem(Backend.END_KEY, JSON.stringify([{ at: Date.now(), uid: null,
      row: { run_id: 'r5', kind: 'run_end', outcome: 'win', cause: 'razed_rival_tc', mode: 'moderate', day: 60, seconds: 1500, props: {} } }]));
    const m1 = __t.mark();
    const s2 = await Deck.sync('evidence');
    out.s2 = s2;
    out.sent2 = __t.rpcs(m1).map(c => __t.tag(c));
    out.endsLeft = Backend.pendingEnds().length;
    out.cloudStarfall = __MOCK.rec('uid-A').counts.starfall;
    out.local = Deck.count('starfall');
    return out;
  });
  ck('noRunKeepsTheGrantAndHoldsOnlyItsOwnCardsPlays',
    r.s1.why === 'held' && !r.s1.reconciled &&
    JSON.stringify(r.sent1) === JSON.stringify(['grant_card:r5', 'consume_card:p6', 'grant_card:r6']) &&
    JSON.stringify(r.left1) === JSON.stringify(['grant:r5:no_run', 'consume:p5:']) && r.timer,
    `sent ${r.sent1.join(', ')}; waiting ${r.left1.join(', ')}; retry ${r.timer}`);
  ck('andIsRetriedUntilItLands', r.tries === 2, `tries ${r.tries}`);
  ck('theEvidenceGoesUpBeforeTheGrantThatWaitsOnIt',
    r.s2.ok && r.s2.reconciled && r.sent2[0] === 'report_run_end:r5' &&
    JSON.stringify(r.sent2.slice(1)) === JSON.stringify(['grant_card:r5', 'consume_card:p5', 'my_cards:']) &&
    r.endsLeft === 0 && r.cloudStarfall === 0 && r.local === 0,
    `${r.sent2.join(' → ')}; ends kept ${r.endsLeft}; starfall cloud ${r.cloudStarfall} / device ${r.local}`);
}

/* ---- 7. GIVEN UP, and REFUSED FOR GOOD ---- */
{
  const r = await p.evaluate(async () => {
    const out = {};
    // a grant whose evidence never landed — asked for a week and eight times
    __t.grant('r-lost', ['mending']);
    const op = Deck.col().queue[Deck.col().queue.length - 1];
    op.n = 7; op.wait = Date.now() - 6 * 864e5;
    const young = await Deck.sync('young');
    out.young = { kept: young.kept, n: op.n };
    __t.quiet();
    op.wait = Date.now() - 8 * 864e5;
    const old = await Deck.sync('old');
    out.old = { dropped: old.dropped, left: Deck.col().queue.length, why: (Deck.col().refused || []).slice(-1)[0] };
    // refused for good: the device had the card, the server says it was never earned
    __t.ended('r-loss', 'loss');
    __MOCK.st.refuse['r-loss'] = 'not_earned';
    __t.grant('r-loss', ['loose_stone'], 'loss');
    out.heldBefore = Deck.count('loose_stone');
    const ref = await Deck.sync('refused');
    out.ref = { dropped: ref.dropped, reconciled: ref.reconciled, after: Deck.count('loose_stone'),
      note: (Deck.col().refused || []).slice(-1)[0] };
    return out;
  });
  ck('aGrantWithNoEvidenceIsGivenUpOnlyAfterDaysAndTries',
    r.young.kept === 1 && r.young.n === 8 && r.old.dropped === 1 && r.old.left === 0 && r.old.why && r.old.why.why === 'no_run_expired',
    `at 6 days kept (${r.young.n} tries); at 8 days dropped ${r.old.dropped} (${r.old.why && r.old.why.why})`);
  ck('aRefusalIsDroppedAndTheRecordTakesTheCardBack',
    r.heldBefore === 1 && r.ref.dropped === 1 && r.ref.reconciled && r.ref.after === 0 && r.ref.note && r.ref.note.why === 'not_earned',
    `held ${r.heldBefore} → ${r.ref.after}; refusal noted ${JSON.stringify(r.ref.note)}`);
}

/* ---- 8. THE RECORD: the cloud's counts replace the device's ---- */
{
  const r = await p.evaluate(async () => {
    const out = {};
    const c = Deck.col();
    c.counts = { forager_cache: 5, gold_nugget: 2 };
    delete c.seen.starfall; c.pity = 3;
    const cloud = __MOCK.rec('uid-A');
    cloud.counts = { forager_cache: 1, starfall: 2, retired_card: 4 };
    cloud.seen = Object.assign({}, cloud.seen, { starfall: 777 });
    __MOCK.st.pity = 9;
    __MOCK.st.medians = { calm: 150, moderate: 101 };
    const s = await Deck.sync('record');
    out.s = s;
    out.counts = JSON.stringify(Deck.col().counts);
    out.seen = Deck.col().seen.starfall;
    out.pity = Deck.col().pity;
    out.med = [Deck.medianDay('calm'), Deck.medianDay('moderate'), Deck.medianDay('hard')];
    out.disk = JSON.parse(localStorage.getItem('neo-deck')).counts;
    // AN ANSWER THAT COMES BACK LATE: a card is played while my_cards is in
    // flight, and the network drops right after — so nothing comes along to
    // tidy up behind a stale answer: what the player sees is what it left
    cloud.counts = { forager_cache: 1, starfall: 2 };
    __MOCK.st.onMyCards = () => {
      Deck._add('starfall', -1);
      Deck._queue({ op: 'consume', card: 'starfall', play: 'p-race', run: 'r-play', day: 9 });
      __MOCK.st.down = true;
    };
    const m0 = __t.mark();
    await Deck.sync('race');
    out.race = { starfall: Deck.count('starfall'), left: Deck.col().queue.length };
    __t.quiet();
    __MOCK.st.down = false;
    const healed = await Deck.sync('healed');
    out.race.healed = { ok: healed.ok, starfall: Deck.count('starfall'), cloud: cloud.counts.starfall };
    out.race.sent = __t.rpcs(m0).filter(c => c.path !== '/rpc/consume_card' || c.body.p_play_id === 'p-race').map(c => c.path.slice(5));
    return out;
  });
  ck('theCloudsCountsReplaceTheDevices', r.s.ok && r.s.reconciled && r.counts === JSON.stringify({ forager_cache: 1, starfall: 2 }) &&
    JSON.stringify(r.disk) === r.counts, `device now ${r.counts} (a retired card never reaches it)`);
  ck('andBringsWhatWasSeenThePityAndTheMedians', r.seen === 777 && r.pity === 9 && r.med[0] === 150 && r.med[1] === 101 && r.med[2] === CFG_HARD_FALLBACK(),
    `seen ${r.seen}, pity ${r.pity}, medians ${r.med.join('/')}`);
  // the stale answer (starfall 2) is thrown away, the play is kept through
  // the outage (asked once while down), and the healed drain delivers it
  // before the record is read again
  ck('aLateAnswerNeverBringsAPlayedCardBack',
    r.race.starfall === 1 && r.race.left === 1 && r.race.healed.ok && r.race.healed.starfall === 1 && r.race.healed.cloud === 1 &&
    r.race.sent[0] === 'my_cards' && JSON.stringify(r.race.sent.slice(-2)) === JSON.stringify(['consume_card', 'my_cards']),
    `starfall device ${r.race.starfall} (kept ${r.race.left}) → healed ${r.race.healed.starfall} / cloud ${r.race.healed.cloud}; ${r.race.sent.join(' → ')}`);
}
function CFG_HARD_FALLBACK() { return 120; }

/* ---- 8b. THE STARTER HAND AS THE RECORD HAS IT ---- */
{
  const r = await p.evaluate(async () => {
    const out = {};
    const cloud = __MOCK.rec('uid-A');
    // the device believes its hand was claimed; the record never saw the
    // claim (its op was lost to the queue's cap) — nothing is waiting
    Deck.col().queue.length = 0;
    Deck.col().starter = 1234;
    cloud.starter = 0;
    const before = Object.assign({}, cloud.counts);
    const s1 = await Deck.sync('starter-lost');
    out.s1 = { ok: s1.ok, reconciled: s1.reconciled, mark: Deck.col().starter || 0 };
    // the next door that deals the hand deals it, and its op claims it
    out.dealt = Deck.ensureStarter();
    const m0 = __t.mark();
    await Deck.sync('starter-claim');
    out.sent = __t.rpcs(m0).map(c => c.path.slice(5));
    out.claimed = !!cloud.starter;
    out.cloud = ['fallen_timber', 'forager_cache', 'willing_hands'].map(k => (cloud.counts[k] || 0) - (before[k] || 0));
    out.device = ['fallen_timber', 'forager_cache', 'willing_hands'].map(k => Deck.count(k) === (cloud.counts[k] || 0));
    // …and a record that HOLDS the claim is never un-marked
    const s3 = await Deck.sync('starter-kept');
    out.kept = { ok: s3.ok, mark: !!Deck.col().starter, again: Deck.ensureStarter() };
    return out;
  });
  ck('aStarterTheRecordNeverClaimedIsDealtAndClaimed',
    r.s1.ok && r.s1.reconciled && r.s1.mark === 0 && r.dealt === true && r.claimed &&
    r.sent[0] === 'claim_starter_hand' && r.cloud.every(n => n === 1) && r.device.every(Boolean),
    `mark after the record ${r.s1.mark}; dealt ${r.dealt}; ${r.sent.join(' → ')}; cloud +${r.cloud.join('/+')}`);
  ck('andAClaimedHandIsNeverDealtTwice', r.kept.ok && r.kept.mark && r.kept.again === false, JSON.stringify(r.kept));
}

/* ---- 9. ONE MIRROR PER PLAYER ---- */
{
  const r = await p.evaluate(async () => {
    const out = {};
    const tok = 'NEO1.' + btoa(JSON.stringify({ rt: 'r' }));
    const A = Deck.col();
    out.aCounts = JSON.stringify(A.counts);
    // A has a grant waiting on its run_end when someone else signs in here
    __t.grant('r-a', ['siege_train']);
    await Deck.sync('a-wait');
    __t.quiet();
    // another player: their record in the cloud is a single card
    __MOCK.rec('uid-B').counts = { gold_nugget: 1 };
    __MOCK.rec('uid-B').starter = 1;
    __MOCK.st.uid = 'uid-B';
    const m0 = __t.mark();
    await Backend.importIdentity(tok);
    await Deck.sync('b');
    out.bUid = Deck.col().uid;
    out.bCounts = JSON.stringify(Deck.col().counts);
    out.bQueue = Deck.col().queue.length;
    out.parked = JSON.parse(localStorage.getItem('neo-deck@uid-A') || 'null');
    out.bSent = __t.rpcs(m0).map(c => c.path.slice(5) + '@' + c.uid);
    // A comes back — and A's run has ended for real meanwhile
    __MOCK.rec('uid-A').ends['r-a'] = 'win';
    __MOCK.st.uid = 'uid-A';
    const m1 = __t.mark();
    await Backend.importIdentity(tok);
    await Deck.sync('a');
    out.aBack = { uid: Deck.col().uid, counts: Deck.col().counts, queue: Deck.col().queue.length,
      parkedB: !!localStorage.getItem('neo-deck@uid-B'), parkedA: !!localStorage.getItem('neo-deck@uid-A') };
    out.aSent = __t.rpcs(m1).map(c => c.path.slice(5) + '@' + c.uid);
    return out;
  });
  ck('anotherPlayerNeverInheritsTheCollection',
    r.bUid === 'uid-B' && r.bCounts === JSON.stringify({ gold_nugget: 1 }) && r.bQueue === 0 &&
    !r.bSent.some(s => s.startsWith('grant_card')) && r.bSent.every(s => s.endsWith('@uid-B')),
    `B sees ${r.bCounts}; B's calls ${r.bSent.join(', ')}`);
  ck('andTheFirstPlayersMirrorIsParkedQueueAndAll',
    r.parked && r.parked.uid === 'uid-A' && r.parked.queue.length === 1 && r.parked.queue[0].run === 'r-a' && r.parked.counts.siege_train === 1,
    r.parked ? `parked ${JSON.stringify(r.parked.counts)}, ${r.parked.queue.length} op waiting` : 'nothing parked');
  ck('whoGetsItBackAndDeliversUnderTheirOwnName',
    r.aBack.uid === 'uid-A' && r.aBack.queue === 0 && r.aBack.counts.siege_train === 1 && r.aBack.parkedB && !r.aBack.parkedA &&
    r.aSent.includes('grant_card@uid-A') && r.aSent.every(s => s.endsWith('@uid-A')),
    `A back: ${JSON.stringify(r.aBack.counts)}; calls ${r.aSent.join(', ')}`);
}

/* ---- 10. NEVER THROWS: an answer that is not one of ours keeps the op ---- */
{
  const r = await p.evaluate(async () => {
    const out = [];
    __t.ended('r-g', 'win');
    for (const g of [null, 'nonsense', { foo: 1 }, { ok: 'yes' }]) {
      __MOCK.st.garbage.grant_card = g;
      __t.grant('r-g', ['blight']);
      let s, threw = false;
      try { s = await Deck.sync('garbage'); } catch (e) { threw = true; }
      out.push({ g: JSON.stringify(g), threw, why: s && s.why, kept: Deck.col().queue.length });
      Deck.col().queue.length = 0;
      __t.quiet();
    }
    delete __MOCK.st.garbage.grant_card;
    return out;
  });
  ck('anAnswerThatIsNotOursKeepsTheOp', r.every(x => !x.threw && x.why === 'no_answer' && x.kept === 1),
    r.map(x => `${x.g} → ${x.why}/${x.kept}`).join('; '));
}

/* ---- 11. a real grant and a real play, through the deck's own doors ---- */
{
  const r = await p.evaluate(async () => {
    CFG.CARDS.ON = true;
    Screens._demo = false;
    G.newGame('sync-e2e', 'moderate', 'medium');
    Screens._enterNow();
    S.playtime = 1300; S.day = 40;
    const rep = Deck.report(true, 'razed_rival_tc');
    G.end(true, 'test', 'razed_rival_tc');        // the real run_end row goes up under the run id
    const res = Deck.settle(Object.assign(rep, { subtotal: 5000, seconds: 1300 }));
    await new Promise(r => setTimeout(r, 200));   // the nudge delivers it with no one asking
    await Deck.sync('e2e');
    const g = __MOCK.st.calls.filter(c => c.path === '/rpc/grant_card' && c.body.p_run_id === rep.runId);
    return { ok: res.ok, cards: res.cards.map(c => c.id), runId: rep.runId, sent: g.length, body: g[0] && g[0].body,
      cloud: res.cards.map(c => __MOCK.rec('uid-A').counts[c.id] || 0), queue: Deck.col().queue.length,
      track: __MOCK.st.rows.filter(x => x.kind === 'card_granted' && x.run_id === rep.runId).length };
  });
  ck('aRealGrantReachesTheRecordUnderItsRunId',
    r.ok && r.runId && r.sent >= 1 && r.body && r.body.p_outcome === 'win' && JSON.stringify(r.body.p_cards) === JSON.stringify(r.cards) &&
    r.cloud.every(n => n >= 1) && r.queue === 0,
    `run ${r.runId}: ${r.cards.join(',')} → grant_card(${r.body && JSON.stringify(r.body.p_cards)}), cloud ${r.cloud.join(',')}`);
  ck('andTheDeckReportsItAsTelemetry', r.track === r.cards.length, `${r.track} card_granted rows`);
}
await ctx.close();

/* ================= 12. THE MIGRATION, on the source ================= */
let deedsCheck = 0;
{
  const sql = readFileSync(join(root, 'supabase/migrations/0008_cards.sql'), 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');                        // what runs, not what is said
  const lc = code.toLowerCase();
  const fn = name => {
    const i = lc.indexOf('create or replace function public.' + name + '(');
    if (i < 0) return '';
    const j = lc.indexOf('\n$$;', i);
    return lc.slice(i, j < 0 ? undefined : j);
  };
  const doors = ['grant_card', 'consume_card', 'claim_starter_hand', 'my_cards', 'report_run_end'];
  const missing = doors.filter(d => !/security definer/.test(fn(d)) || !/auth\.uid\(\)/.test(fn(d)));
  ck('everyDoorIsThereAndAsksWhoIsCalling', missing.length === 0, missing.length ? 'missing/unsafe: ' + missing.join(',') : doors.join(', '));
  const grants = doors.map(d => {
    const sig = (lc.match(new RegExp('grant execute on function public\\.' + d + '\\(([^)]*)\\) to ([a-z, ]+);')) || []);
    return { d, to: sig[2] && sig[2].trim(), revoked: new RegExp('revoke all on function public\\.' + d + '\\([^)]*\\) from public;').test(lc) &&
      new RegExp('revoke all on function public\\.' + d + '\\([^)]*\\) from anon, authenticated;').test(lc) };
  });
  ck('andOnlyASignedInPlayerMayCallThem', grants.every(g => g.to === 'authenticated' && g.revoked),
    grants.map(g => `${g.d}→${g.to}${g.revoked ? '' : ' (not revoked first)'}`).join(', '));
  const tables = [...lc.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]);
  const open = tables.filter(t => !lc.includes(`alter table public.${t} enable row level security;`) ||
    !lc.includes(`revoke all on table public.${t} from anon, authenticated;`) || /create policy/.test(lc));
  ck('everyTableIsSealed', tables.length >= 5 && ['card_collection', 'card_grants', 'card_plays', 'card_starter'].every(t => tables.includes(t)) && !open.length,
    `${tables.join(', ')}${open.length ? ' — open: ' + open.join(',') : ''}`);
  ck('theTelemetryKindsAreWidened', /add constraint telemetry_kind_check\s+check \(kind in \('run_start', 'run_end', 'session', 'card_granted', 'card_played'\)\)/.test(lc) &&
    lc.indexOf('drop constraint') < lc.indexOf('add constraint telemetry_kind_check'), 'card_granted and card_played admitted, the old check dropped first');
  // idempotent in FORM: nothing made that a second run would trip over
  const bare = [
    ...[...lc.matchAll(/create table (?!if not exists)/g)].map(() => 'create table'),
    ...[...lc.matchAll(/create (unique )?index (?!if not exists)/g)].map(() => 'create index'),
    ...[...lc.matchAll(/create function/g)].map(() => 'create function'),
    // (the kind check's own drop is by catalogue lookup — `drop constraint %I` of a name just found)
    ...[...lc.matchAll(/drop (function|table|policy|index|constraint) (?!if exists|%i)/g)].map(m => 'drop ' + m[1]),
    ...[...lc.matchAll(/insert into public\.card_catalog[\s\S]*?;/g)].filter(m => !/on conflict/.test(m[0])).map(() => 'catalog insert'),
  ];
  const dropAt = lc.indexOf('delete from public.card_drop_tiers'), insAt = lc.indexOf('insert into public.card_drop_tiers');
  ck('andIdempotentInForm', !bare.length && dropAt > 0 && dropAt < insAt && /drop constraint %i/.test(lc),
    bare.length ? 'would fail a second run: ' + bare.join(', ') : 'IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS / re-seeded');
  ck('theAnswersNeverWearAnErrorKey', !doors.some(d => /'error'/.test(fn(d))) && doors.every(d => /'reason'/.test(fn(d)) || d === 'claim_starter_hand'),
    "an 'error' key reads as a transport failure to Backend._retry");
  const deedsDefs = (lc.match(/create or replace function public\.card_loss_min_deeds\(\)/g) || []).length;
  const g = fn('grant_card');
  ck('theLossDeedsNumberLivesInOnePlace', deedsDefs === 1 && lc.indexOf('card_loss_min_deeds()') < lc.indexOf('create or replace function public.grant_card(') &&
    /public\.card_loss_min_deeds\(\)/.test(g) && /props\s*->>?\s*'deeds'/.test(g) && !/\b5\b/.test(g.replace(/'[^']*'/g, '')),
    `defined ${deedsDefs}×, read by grant_card from props.deeds`);
  const sqlDeeds = +((code.match(/create or replace function public\.card_loss_min_deeds\(\)[\s\S]*?as \$\$\s*select (\d+)\s*\$\$/i) || [])[1]);
  deedsCheck = sqlDeeds;
  ck('aWinAlwaysEarnsAndABannerNever', /v_end\.outcome = 'loss' and v_deeds < public\.card_loss_min_deeds\(\)/.test(g) &&
    /coalesce\(t\.cause, ''\) <> 'closed_tab'/.test(g) && /'not_finished'/.test(g) && /'no_run'/.test(g) && /'outcome_mismatch'/.test(g),
    'the earn rule reads only the deeds of a LOSS; closed_tab is never evidence');
  ck('aRunPaysAtMostTwiceAndNeverAgain', /slot\s+smallint not null check \(slot between 0 and 1\)/.test(lc) && /unique \(user_id, run_id, slot\)/.test(lc) &&
    /'already', true/.test(g) && /unique \(user_id, play_id\)/.test(lc) && /qty > 0/.test(fn('consume_card')), 'slots 0/1, one play per play id, never below zero');

  // THE SERVER'S COPY EQUALS THE GAME'S: the catalog, the starter hand, the drop tiers
  const ctx2 = await b.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(url, { waitUntil: 'domcontentloaded' });
  // CFG is a script-level const: window.CFG is undefined (the window.G trap)
  await p2.waitForFunction(() => window.Deck && typeof CFG !== 'undefined', null, { timeout: 30000 });
  const game = await p2.evaluate(() => ({
    lossDeeds: CFG.CARDS.LOSS_DEEDS,
    cat: Deck.CATALOG.map(c => c.id + ':' + c.tier).sort(), starter: CFG.CARDS.STARTER.slice().sort(),
    drops: Object.fromEntries(Object.entries(CFG.CARDS.DROPS).map(([k, w]) => [k, Deck.TIERS.filter((t, i) => w[i] > 0).map(t => t.k).sort()])),
  }));
  await ctx2.close();
  const seed = (code.match(/with seed \(card_key, tier, starter_qty\) as \(values([\s\S]*?)\n\),/) || [])[1] || '';
  const rows = [...seed.matchAll(/\('([a-z0-9_]+)', '([a-z]+)', (\d)\)/g)].map(m => ({ id: m[1], tier: m[2], st: +m[3] }));
  const sqlCat = rows.map(x => x.id + ':' + x.tier).sort();
  const sqlStarter = rows.filter(x => x.st > 0).map(x => x.id).sort();
  const dt = (code.match(/insert into public\.card_drop_tiers \(tbl, tier\) values([\s\S]*?);/) || [])[1] || '';
  const sqlDrops = {};
  for (const m of dt.matchAll(/\('([a-z]+)', '([a-z]+)'\)/g)) (sqlDrops[m[1]] = sqlDrops[m[1]] || []).push(m[2]);
  for (const k in sqlDrops) sqlDrops[k].sort();
  ck('theServersCatalogIsTheGames', JSON.stringify(sqlCat) === JSON.stringify(game.cat) && rows.length === 36,
    `${rows.length} in the SQL; differs: ${sqlCat.filter(x => !game.cat.includes(x)).concat(game.cat.filter(x => !sqlCat.includes(x))).join(', ') || 'none'}`);
  ck('andItsStarterHand', JSON.stringify(sqlStarter) === JSON.stringify(game.starter), sqlStarter.join(', '));
  // THE ONE NUMBER, both halves: the deck's own rule (Deck.eligible reads
  // CFG.CARDS.LOSS_DEEDS) and the server's (card_loss_min_deeds). A loss the
  // game rewards and the server refuses leaves the collection at the next
  // reconcile — the two must never drift. (Before the game's half exists
  // there is nothing to compare, and the check says so.)
  ck('theServersLossDeedsAreTheGames', deedsCheck > 0 && (game.lossDeeds == null || game.lossDeeds === deedsCheck),
    game.lossDeeds == null ? `server ${deedsCheck}; the game has no LOSS_DEEDS yet` : `server ${deedsCheck}, game ${game.lossDeeds}`);
  ck('andItsDropTiers', JSON.stringify(Object.keys(sqlDrops).sort().map(k => [k, sqlDrops[k]])) === JSON.stringify(Object.keys(game.drops).sort().map(k => [k, game.drops[k]])),
    JSON.stringify(sqlDrops));
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 6));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-SYNC CHECKS PASS');
