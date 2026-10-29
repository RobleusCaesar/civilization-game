/* TELEMETRY — the board reports the SITE, and only games somebody PLAYED.

   The dashboard's win-rate columns were being pulled about by sixteen
   run_end rows that lasted 0.0 minutes and ended on day 1: nine "wins",
   seven "losses". Every one was a CONTRACT TEST. A page opened from disk
   signed in as a real anonymous player (until backend.js's file: gate), and
   tests/finished-run-continue.mjs ends a day-1 world with
   G.end(true, 'test victory') under a forced isReady — one real "win" per
   sweep run. tests/wonder.mjs's rival finish is the "loss/unknown". And every
   test boots at 430px, so its "session" rows counted as MOBILE play.

   Three rules close the class, and this file pins them:

     THE SITE ALONE REPORTS   Backend.telemetryAllowed — https, one of the
                              shipped hosts, never ?dev=. A file:// page, an
                              HTTP-served test (tests/land.mjs runs one), a
                              developer's local server and the art preview
                              all answer no. The MOCK path is exempt, so a
                              test can still read back what would be sent.
     ONLY A PLAYED WORLD      S.played is stamped by Screens.show('playing')
                              for a real (non-demo) world and rides in the
                              save (a pre-stamp save backfills true — a save
                              IS a played world). G.end logs nothing for a
                              world that was never entered: a hand backed out
                              of at the draft, a scripted test world.
     THE DASHBOARD LOOKS PAST what already landed — migrations 0006-0008
                              are pinned here on their source (the run
                              filters, one ending per run, the card rows).
                              The dashboard itself is migration 0010's and is
                              pinned by tests/analytics.mjs, against a real
                              database: one result per GAME, never per row.
     AND SAYS WHAT IT CARRIES (build 107): every row its props.build, every
                              ending its props.errors — 0 for a clean game,
                              never left blank — and props.err, the first
                              fault as "message @ file:line".

   Run after touching: Backend._emit / build / telemetryAllowed / logRunEnd,
   G.end / runReport, Feedback.noteError / resetRunErrors, Screens.show, the
   S.played backfill in loadJSON, or any analytics migration.

     node tests/telemetry.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// shipped PNGs bake into canvases the terrain build reads — file:// must be
// same-origin, or the first G.newGame throws on a tainted getImageData
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* a minimal backend mock: signs in as one fixed uid, answers every REST call,
   and records what the game tried to send (the shape board-post.mjs uses) */
const MOCK = `
  window.__MOCK = (() => {
    const st = { uid: 'mock-uid-0001', calls: [] };
    const session = () => ({ access_token: 't', refresh_token: 'r', user: { id: st.uid } });
    const auth = {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: session() }, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; },
    };
    // the raw PostgREST payload, as board-post.mjs's mock answers: rows for a
    // GET, nothing for a write (Backend._guard wraps it as { ok, data })
    const rest = (method, path, body) => {
      st.calls.push({ method, path, body });
      if (path.startsWith('/profiles') && method === 'GET') return [{ id: st.uid, chief_name: null }];
      // §5: a run_end send that dies, and migration 0008's door for the resend
      if (path === '/telemetry' && method === 'POST' && st.failEnds && body && body[0] && body[0].kind === 'run_end')
        return { error: { status: 503, message: 'down' } };
      if (path === '/rpc/report_run_end') return { ok: true };
      return method === 'GET' ? [] : null;
    };
    return { st, auth, rest };
  })();
  window.__NEO_BACKEND_MOCK = { auth: window.__MOCK.auth, rest: window.__MOCK.rest };
`;

// ---- 0. from disk, nothing leaves — and the gate is the thing stopping it ----
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    let hits = 0;
    const realFetch = window.fetch;
    window.fetch = () => { hits++; return Promise.resolve({ ok: true }); };
    // pretend the cloud came up (the exact forcing finished-run-continue does)
    Backend.configured = true; Backend.uid = 'forced-uid'; Backend.telemetryOn = true;
    const allowedHere = Backend.telemetryAllowed();
    Backend._emit({ kind: 'session', seconds: 9 });
    const afterGated = hits;
    const saved = Backend.telemetryAllowed;
    Backend.telemetryAllowed = () => true;      // the sanity half: with the gate open the row WOULD go
    Backend._emit({ kind: 'session', seconds: 9 });
    const afterOpen = hits;
    Backend.telemetryAllowed = saved;
    window.fetch = realFetch;
    Backend.configured = false; Backend.uid = null;
    return { allowedHere, afterGated, afterOpen, proto: location.protocol };
  });
  ck('aPageFromDiskIsNotTheSite', r.allowedHere === false, 'protocol ' + r.proto);
  ck('andNothingLeavesItEvenWithTheCloudForced', r.afterGated === 0, 'fetches=' + r.afterGated);
  ck('andTheGateIsWhatStopsIt', r.afterOpen === 1, 'with the gate opened, fetches=' + r.afterOpen);

  // the truth table, on synthetic locations
  const t = await p.evaluate(() => {
    const L = (protocol, hostname, search) => Backend.telemetryAllowed({ protocol, hostname, search: search || '' });
    return {
      site: L('https:', 'clanfire.online'), www: L('https:', 'www.clanfire.online'),
      pages: L('https:', 'robleuscaesar.github.io'), caps: L('https:', 'CLANFIRE.ONLINE'),
      http: L('http:', 'clanfire.online'), dev: L('https:', 'clanfire.online', '?dev=1'),
      devAmp: L('https:', 'clanfire.online', '?x=1&dev=1'), local: L('https:', 'localhost'),
      loop: L('http:', '127.0.0.1'), lookalike: L('https:', 'clanfire.online.example.com'),
      none: Backend.telemetryAllowed(null),
      // the test slot (the staging branch at /test/, pages.yml): the live host, the operator's own build
      slot: Backend.telemetryAllowed({ protocol: 'https:', hostname: 'clanfire.online', search: '', pathname: '/test/' }),
      slotPage: Backend.telemetryAllowed({ protocol: 'https:', hostname: 'clanfire.online', search: '', pathname: '/test/index.html' }),
      slotRepo: Backend.telemetryAllowed({ protocol: 'https:', hostname: 'robleuscaesar.github.io', search: '', pathname: '/civilization-game/test/' }),
      livePage: Backend.telemetryAllowed({ protocol: 'https:', hostname: 'clanfire.online', search: '', pathname: '/index.html' }),
      testsLike: Backend.telemetryAllowed({ protocol: 'https:', hostname: 'clanfire.online', search: '', pathname: '/tests/x.html' }),
    };
  });
  ck('theShippedHostsAnswerYes', t.site && t.www && t.pages && t.caps, JSON.stringify(t));
  ck('andEveryOtherOriginAnswersNo', !t.http && !t.dev && !t.devAmp && !t.local && !t.loop && !t.lookalike && !t.none, JSON.stringify(t));
  ck('theTestSlotSendsNothing', !t.slot && !t.slotPage && !t.slotRepo && t.livePage && t.testsLike, JSON.stringify(t));
  ck('theDiskPageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

// ---- 1. with the mock: only a PLAYED world reaches the board ----
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(MOCK);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    const ends = () => __MOCK.st.calls.filter(c => c.path === '/telemetry' && c.body && c.body[0] && c.body[0].kind === 'run_end');
    const out = {};
    // the title's demo world: never stamped, never logged
    out.demoPlayed = !!S.played;
    Screens.show('playing'); out.demoPlayedAfterShow = !!S.played; Screens.show('title');
    // a world founded and ended without ever being entered (a hand backed out of at the draft)
    G.newGame('t1', 'moderate', 'medium'); Screens._demo = false;
    out.freshPlayed = !!S.played;
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 50));
    out.endsAfterUnplayed = ends().length;
    out.endScreenStillShown = Screens.current === 'endgame';   // the run still ENDS — only the row is withheld
    // …and one the player entered: logged, with the numbers the dashboard reads
    G.newGame('t2', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    out.enteredPlayed = !!S.played;
    G.end(false, 'test');
    await new Promise(r => setTimeout(r, 50));
    const e = ends();
    out.endsAfterPlayed = e.length;
    const row = e[0] && e[0].body[0];
    out.row = row && { kind: row.kind, outcome: row.outcome, cause: row.cause, day: row.day, seconds: row.seconds, device: row.device };
    // the stamp rides in the save, and a save that predates it backfills as played
    G.newGame('t3', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    const json = G.saveJSON();
    G.loadJSON(json); out.loadedPlayed = S.played === true;
    const legacy = JSON.parse(json); delete legacy.played;
    G.loadJSON(JSON.stringify(legacy)); out.legacyBackfilled = S.played === true;
    return out;
  });
  ck('theDemoWorldIsNeverStampedPlayed', !r.demoPlayed && !r.demoPlayedAfterShow, JSON.stringify([r.demoPlayed, r.demoPlayedAfterShow]));
  ck('aWorldNeverEnteredEndsWithoutARow', !r.freshPlayed && r.endsAfterUnplayed === 0, 'played=' + r.freshPlayed + ' rows=' + r.endsAfterUnplayed);
  ck('butItStillEnds', r.endScreenStillShown, 'screen after G.end: ' + r.endScreenStillShown);
  ck('aWorldThePlayerEnteredIsLogged', r.enteredPlayed && r.endsAfterPlayed === 1 && r.row && r.row.outcome === 'loss' && r.row.cause === 'unknown',
    JSON.stringify(r.row));
  ck('theStampRidesInTheSaveAndBackfillsTrue', r.loadedPlayed && r.legacyBackfilled, JSON.stringify([r.loadedPlayed, r.legacyBackfilled]));
  ck('theMockPageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

// ---- 3. THE TAB CLOSED: one provisional ending per run, the real one wins ----
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(MOCK);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    const rows = () => __MOCK.st.calls.filter(c => c.path === '/telemetry' && c.body && c.body[0]).map(c => c.body[0]);
    const left = () => rows().filter(x => x.kind === 'run_end' && x.cause === 'closed_tab');
    const tick = () => new Promise(r => setTimeout(r, 30));
    // the REAL events a closing tab fires — both, since iOS may send either
    let H = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => H });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (H ? 'hidden' : 'visible') });
    const close = async () => { H = true; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); await tick(); };
    const back = async () => { H = false; document.dispatchEvent(new Event('visibilitychange')); await tick(); };
    const out = {};

    // EXCLUDED: the title's demo world
    await close(); out.demoRows = left().length; await back();
    // EXCLUDED: a world founded but never entered (backed out at the draft)
    G.newGame('leave0', 'moderate', 'medium'); Screens._demo = false;
    await close(); out.unenteredRows = left().length; await back();

    // A LIVE RUN, closed: exactly one abandon, carrying a real ending's props
    G.newGame('leave1', 'calm', 'medium'); Screens._demo = false;
    Screens._enterNow();
    const start = rows().filter(x => x.kind === 'run_start').pop();
    out.startId = start && start.run_id;
    out.stampedInSave = S.runId === (start && start.run_id);
    S.day = 7; S.playtime = 312; S.stats.built = 4; S.stats.trained = 3;
    await close();
    const one = left();
    out.afterClose = one.length;
    const row = one[0] || {};
    out.row = { run_id: row.run_id, outcome: row.outcome, cause: row.cause, day: row.day, seconds: row.seconds,
      mode: row.mode, landform: row.landform, size: row.size, device: row.device, tc_level: row.tc_level,
      score: row.score, built: row.props && row.props.built, trained: row.props && row.props.trained,
      provisional: row.props && row.props.provisional };
    // came back, left again with nothing new: no second row
    await back(); await close();
    out.afterSecondCloseSameDay = left().length;
    // came back, played on, and FINISHED: the real ending goes up under the same id
    await back();
    S.day = 30; S.playtime = 1800;
    G.end(true, 'test victory', 'wonder');
    await tick();
    const endsNow = rows().filter(x => x.kind === 'run_end' && x.run_id === out.startId);
    out.realEnd = endsNow.filter(x => x.cause !== 'closed_tab').map(x => ({ outcome: x.outcome, cause: x.cause, day: x.day }));
    // and a hide on the finished run sends nothing
    Screens.show('playing');
    await close(); out.afterEndClose = left().length; await back();

    // A LATER DAY re-sends (the dashboard keeps the latest), a CONTINUED save
    // ends the SAME run
    Screens.show('title');
    G.newGame('leave2', 'moderate', 'medium'); Screens._demo = false;
    Screens._enterNow();
    const id2 = Backend.runId;
    S.day = 3; await close(); await back();
    S.day = 12; await close(); await back();
    out.twoDaysTwoRows = left().filter(x => x.run_id === id2).map(x => x.day);
    const json = G.saveJSON();
    Backend.runId = null;                       // a fresh tab knows nothing…
    G.loadJSON(json);                           // …until the save hands its run back
    out.continuedId = Backend.runId === id2;
    Screens.show('playing');
    G.end(false, 'test loss', 'tc_destroyed');
    await tick();
    out.continuedEnd = rows().filter(x => x.kind === 'run_end' && x.run_id === id2 && x.cause === 'tc_destroyed').length;

    // EXCLUDED: the page is not the site — with the mock removed, a live run
    // closing sends nothing at all
    Screens.show('title');
    G.newGame('leave3', 'moderate', 'medium'); Screens._demo = false;
    Screens._enterNow(); S.day = 5;
    let hits = 0; const realFetch = window.fetch; const mk = Backend.mock;
    window.fetch = () => { hits++; return Promise.resolve({ ok: true, json: async () => ({}) }); };
    Backend.mock = null;
    await close();
    out.offSiteFetches = hits;
    Backend.mock = mk; window.fetch = realFetch; await back();
    delete document.hidden; delete document.visibilityState;
    return out;
  });
  ck('noAbandonFromTheTitleDemo', r.demoRows === 0, 'rows=' + r.demoRows);
  ck('noAbandonFromAWorldNeverEntered', r.unenteredRows === 0, 'rows=' + r.unenteredRows);
  ck('theRunIdRidesInTheSave', !!r.startId && r.stampedInSave, String(r.startId));
  const w = r.row || {};
  ck('aClosedTabLogsExactlyOneAbandon', r.afterClose === 1 && w.run_id === r.startId && w.outcome === 'abandoned' && w.cause === 'closed_tab' && w.provisional === true,
    'rows=' + r.afterClose + ' ' + JSON.stringify(w));
  ck('carryingARealEndingsProps', w.day === 7 && w.seconds === 312 && w.mode === 'calm' && !!w.landform && w.size === 'medium' &&
    w.device === 'mobile' && w.tc_level >= 1 && typeof w.score === 'number' && w.built === 4 && w.trained === 3, JSON.stringify(w));
  ck('aReturnAndASecondCloseDoNotDoubleCount', r.afterSecondCloseSameDay === 1, 'rows=' + r.afterSecondCloseSameDay);
  ck('closeReturnFinishLogsTheRealEnding', r.realEnd.length === 1 && r.realEnd[0].outcome === 'win' && r.realEnd[0].cause === 'wonder' && r.realEnd[0].day === 30,
    JSON.stringify(r.realEnd));
  ck('andAFinishedRunNeverAbandons', r.afterEndClose === 1, 'rows=' + r.afterEndClose);
  ck('aLaterDayResendsForTheDedupeToKeep', JSON.stringify(r.twoDaysTwoRows) === '[3,12]', JSON.stringify(r.twoDaysTwoRows));
  ck('aContinuedSaveEndsTheSameRun', r.continuedId && r.continuedEnd === 1, JSON.stringify([r.continuedId, r.continuedEnd]));
  ck('offTheSiteNothingLeaves', r.offSiteFetches === 0, 'fetches=' + r.offSiteFetches);
  ck('theLeavingPageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

// ---- 2. the dashboard side, pinned on the source ----
{
  const mig = readFileSync(join(root, 'supabase/migrations/0006_analytics_run_filters.sql'), 'utf8');
  const html = readFileSync(join(root, 'analytics.html'), 'utf8');
  /* the page that drew 0006/0007/0008's tables is retired: the dashboard is
     0010's now, and its contract runs it against a real database */
  ck('theDashboardAsksTheNewDoorAndHasItsOwnContract', /rpc\('analytics_dashboard'/.test(html) && !/rpc\('analytics_cards'/.test(html) &&
    existsSync(join(root, 'tests/analytics.mjs')) && existsSync(join(root, 'supabase/migrations/0010_dashboard.sql')), 'tests/analytics.mjs');
  ck('theMigrationDropsTheOldSignatureFirst',
    /drop function if exists public\.analytics_summary\(text, timestamptz, timestamptz, text, text, text, text\);/.test(mig) &&
    mig.indexOf('drop function') < mig.indexOf('create or replace function'), 'an overload would 300 every dashboard call');
  ck('andDeclaresTheRunFilters', /p_min_seconds integer default 0/.test(mig) && /p_min_day\s+integer default 0/.test(mig), '');
  ck('andFiltersTheEndsWithThem', /coalesce\(seconds,\s*0\)\s*>=\s*coalesce\(p_min_seconds,\s*0\)/.test(mig) && /coalesce\(day,\s*0\)\s*>=\s*coalesce\(p_min_day,\s*0\)/.test(mig), '');
  ck('andTheThirtyDayTableReadsTheSameFilteredEnds', /union all select created_at, kind, user_id from ends/.test(mig), 'daily.finishes must not bypass the run filter');
  ck('andGrantsTheNewSignature', /grant execute on function public\.analytics_summary\(text, timestamptz, timestamptz, text, text, text, text, integer, integer\)\s+to anon, authenticated/.test(mig) &&
    /revoke all on function public\.analytics_summary\(text, timestamptz, timestamptz, text, text, text, text, integer, integer\) from public/.test(mig), '');
  ck('andAddsTheCauseByDayTable', /'endings_by_bucket'/.test(mig) && /'d10_24',\s*count\(\*\)\s*filter\s*\(where e\.day\s*>=\s*10\s+and e\.day\s*<\s*25\)/.test(mig)
    && /'d200_399'/.test(mig) && /'d400p'/.test(mig), 'the same seven buckets as the survival table');
  // the survival buckets: every label says what its edges do — the upper
  // edges are READ OUT OF THE SQL's own CASE, never typed into the test
  const m = mig.match(/from \(values ([\s\S]*?)\) as b\(lo, label\)/);
  const pairs = m ? [...m[1].matchAll(/\(\s*(\d+)\s*,\s*'day (\d+)(?:-(\d+)|\+)'\s*\)/g)].map(x => [+x[1], +x[2], x[3] == null ? null : +x[3]]) : [];
  const cs = mig.match(/e\.day < case b\.lo([\s\S]*?)end\)/);
  const hi = {}; if (cs) for (const w of cs[1].matchAll(/when\s+(\d+)\s+then\s+(\d+)/g)) hi[+w[1]] = +w[2];
  const labelsHonest = pairs.length === 7 && Object.keys(hi).length === 6 &&
    pairs.every(([lo, a, bnd]) => a === lo && (bnd == null ? (lo === 400 && hi[lo] === undefined) : bnd === hi[lo] - 1));
  ck('theBucketLabelsSayWhatTheirEdgesDo', labelsHonest, JSON.stringify({ pairs, hi }));
}

// ---- 4. migration 0007 + the dashboard's leaving tables, pinned on the source ----
{
  const mig = readFileSync(join(root, 'supabase/migrations/0007_where_they_leave.sql'), 'utf8');
  const bk = readFileSync(join(root, 'js/backend.js'), 'utf8');
  ck('0007RevokesFromPublicBeforeGranting', mig.indexOf('revoke all on function public.analytics_summary(text, timestamptz, timestamptz, text, text, text, text, integer, integer) from public') > 0 &&
    mig.indexOf('revoke all on function') < mig.indexOf('grant execute on function'), '');
  ck('andTheRealEndingBeatsAClosedTab', /coalesce\(r\.cause, ''\) <> 'closed_tab'/.test(mig) && /from public\.telemetry r/.test(mig), 'checked against the whole table');
  ck('andTheLatestClosedTabIsKept', /distinct on \(l\.run_id\)/.test(mig) && /order by l\.run_id, l\.created_at desc/.test(mig), '');
  ck('andTheRunFiltersApplyAfterTheDedupe', /union all select \* from last_left\) u\s+where coalesce\(u\.seconds, 0\) >= coalesce\(p_min_seconds, 0\)/.test(mig), '');
  ck('andItBucketsTheLeavingByDayAndMinutes', /'where_they_leave'/.test(mig) && /'by_day'/.test(mig) && /'by_minutes'/.test(mig) &&
    /grouping sets \(\(e\.cause, e\.mode, e\.device\), \(e\.cause\)\)/.test(mig) && /where e\.outcome = 'abandoned'/.test(mig), 'closed_tab and struck_banner, split by difficulty and device');
  ck('theLeavingRowGoesKeepaliveWithItsToken', /logLeaving\(info\)/.test(bk) && /keepalive: true/.test(bk) && !/sendBeacon\(/.test(bk),
    'a beacon cannot carry the Bearer token the insert policy needs');
}

// ---- 5. THE CARDS (migration 0008): the evidence a grant waits on, the deck's own rows, the dashboard ----
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(MOCK);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    const tick = () => new Promise(r => setTimeout(r, 40));
    const calls = () => __MOCK.st.calls;
    const endsFor = id => calls().filter(c => c.path === '/telemetry' && c.body && c.body[0] && c.body[0].kind === 'run_end' && c.body[0].run_id === id);
    const reports = id => calls().filter(c => c.path === '/rpc/report_run_end' && c.body && c.body.p_row && c.body.p_row.run_id === id);
    const out = {};
    localStorage.removeItem(Backend.END_KEY);

    // A RUN THAT ENDS BEFORE THE BOOT EVER SIGNED IN: nobody to send it as —
    // so it is KEPT, then delivered once through report_run_end on sign-in.
    // (A loss, because a victory's own board calls reconnect at once and
    // would deliver it before anyone could look.)
    G.newGame('cards-e1', 'moderate', 'medium'); Screens._demo = false; Screens._enterNow();
    const id1 = S.runId;
    S.day = 44; S.playtime = 1400;
    Backend.uid = null; Backend.session = null;           // the sign-in never happened
    G.end(false, 'test', 'tc_destroyed');
    await tick();
    const kept = Backend.pendingEnds();
    out.kept = { n: kept.length, run: kept[0] && kept[0].row.run_id === id1, noUser: kept[0] && !('user_id' in kept[0].row),
      uid: kept[0] && kept[0].uid, outcome: kept[0] && kept[0].row.outcome, day: kept[0] && kept[0].row.day, sentRaw: endsFor(id1).length };
    await Backend.reconnect();                             // the second chance signs in…
    await Backend.flushEnds();                             // …and the kept row goes up (joined, never doubled)
    await Backend.flushEnds();
    out.flushed = { reports: reports(id1).length, raw: endsFor(id1).length, left: Backend.pendingEnds().length,
      row: reports(id1)[0] && reports(id1)[0].body.p_row };

    // A SEND THAT DIES (a dead network at the moment of victory): kept too
    G.newGame('cards-e2', 'moderate', 'medium'); Screens._demo = false; Screens._enterNow();
    const id2 = S.runId; S.day = 12;
    __MOCK.st.failEnds = true;
    G.end(false, 'test', 'tc_destroyed');
    await tick();
    __MOCK.st.failEnds = false;
    out.died = { raw: endsFor(id2).length, kept: Backend.pendingEnds().filter(x => x.row.run_id === id2).length,
      keptUid: (Backend.pendingEnds().find(x => x.row.run_id === id2) || {}).uid };
    await Backend.flushEnds();
    out.died.reports = reports(id2).length; out.died.left = Backend.pendingEnds().length;

    // AN ENDING THAT LANDED keeps nothing, and sends nothing twice
    G.newGame('cards-e3', 'moderate', 'medium'); Screens._demo = false; Screens._enterNow();
    const id3 = S.runId;
    G.end(true, 'test', 'wonder');
    await tick();
    await Backend.flushEnds();
    out.landed = { raw: endsFor(id3).length, reports: reports(id3).length, kept: Backend.pendingEnds().length };

    // A RUN WITH NO ID (a save from before the id rode in it) is NAMED BY ITS
    // LINEAGE — seed, mode, size (Backend.legacyRunId) — never by the dice:
    // the same old save loaded and finished again is the SAME run, so its card
    // can be granted once and never again (a fresh random name per ending was
    // a card farm). The name is in S from the end on, and in the row, and in
    // the end screen's report.
    G.newGame('cards-e5', 'moderate', 'medium'); Screens._demo = false; Screens._enterNow();
    S.runId = null; Backend.runId = null;               // exactly what a pre-0007 save holds
    const pre = G.saveJSON();
    const want = Backend.legacyRunId(S.seed, S.mode, S.sizeKey);
    G.end(false, 'test', 'tc_destroyed');
    await tick();
    const runEnds = id => calls().filter(c => c.path === '/telemetry' && c.body && c.body[0] && c.body[0].kind === 'run_end' && c.body[0].run_id === id).length;
    const idl = calls().filter(c => c.path === '/telemetry' && c.body && c.body[0] && c.body[0].kind === 'run_end').slice(-1)[0];
    const rowId = idl && idl.body[0].run_id;
    out.idless = { want, rowId, named: S.runId === want, last: Backend.lastRunId === want, cleared: Backend.runId === null,
      report: (window.Deck && Deck.report) ? Deck.report(false, 'tc_destroyed').runId === want : true,
      rows: runEnds(want), deterministic: Backend.legacyRunId(S.seed, S.mode, S.sizeKey) === want,
      apart: Backend.legacyRunId('cards-e5x', 'moderate', 'medium') !== want && Backend.legacyRunId(S.seed, 'hard', 'medium') !== want,
      shape: /^legacy-[0-9a-f]{16}$/.test(want) };
    // the same save loaded again — twice — and ended each time: one name
    const named = [];
    for (let i = 0; i < 2; i++) {
      G.loadJSON(pre);
      named.push(S.runId === want && Backend.runId === want);
      Screens._demo = false;
      G.end(true, 'test', 'razed_rival_tc');
      await tick();
    }
    out.lineage = { named, rows: runEnds(want), ids: calls().filter(c => c.path === '/telemetry' && c.body && c.body[0] && c.body[0].kind === 'run_end').slice(-2).map(c => c.body[0].run_id === want) };
    // …and a NEW world is never the old run: founded after that load, it
    // owes nothing to the loaded save's name, and ends under its own
    G.loadJSON(pre);
    G.newGame('cards-e6', 'moderate', 'medium');
    out.lineage.fresh = Backend.runId === null;
    Screens._demo = false; Screens.show('playing');
    G.end(false, 'test', 'tc_destroyed');
    await tick();
    out.lineage.own = S.runId === Backend.legacyRunId(S.seed, S.mode, S.sizeKey) && S.runId !== want && runEnds(S.runId) === 1;
    Screens.show('title');

    // A REFUSED SEND, BY ITS STATUS (the real wire, not the mock): a 409 is
    // the profile's foreign key (ensureProfile failed at sign-in) — kept, as
    // report_run_end inserts the profile first and mends it; a 400 is the row
    // itself refused by a check — no resend can mend that, so nothing is kept
    {
      const mk = Backend.mock, allowed = Backend.telemetryAllowed, realFetch = window.fetch;
      const seen = [];
      let status = 409;
      Backend.mock = null; Backend.telemetryAllowed = () => true;
      window.fetch = (u, o) => { seen.push(String(u)); return Promise.resolve({ ok: false, status, json: async () => ({}), text: async () => '' }); };
      try {
        localStorage.removeItem(Backend.END_KEY);
        out.wire = {};
        for (const st of [409, 400, 503]) {
          status = st;
          G.newGame('cards-w' + st, 'moderate', 'medium'); Screens._demo = false; Screens._enterNow();
          const id = S.runId;
          G.end(false, 'test', 'tc_destroyed');
          await tick(); await tick();
          out.wire[st] = Backend.pendingEnds().some(x => x.row.run_id === id);
        }
        out.wire.sent = seen.filter(u => /\/rest\/v1\/telemetry/.test(u)).length;
      } finally {
        Backend.mock = mk; Backend.telemetryAllowed = allowed; window.fetch = realFetch;
        localStorage.removeItem(Backend.END_KEY);
        Screens.show('title');
      }
    }

    // OFF THE SITE nothing is kept, however it ends
    G.newGame('cards-e4', 'moderate', 'medium'); Screens._demo = false; Screens._enterNow();
    const mk = Backend.mock; Backend.mock = null;
    Backend.uid = null;
    G.end(true, 'test', 'razed_rival_tc');
    await tick();
    out.offSite = Backend.pendingEnds().length;
    Backend.mock = mk; Backend.uid = __MOCK.st.uid;

    // THE DECK'S OWN ROWS: card_granted / card_played, through the same door,
    // carrying only what the 0003 checks (and 0008's widened kind) admit
    // (only the two sent here: with the switch shipping on, the wins this page
    // ended above were each granted a real card, and sent their own rows)
    const before = calls().length;
    Deck.track('card_granted', { card: 'starfall', tier: 'imperial', outcome: 'win', difficulty: 'hard', bonus: false, run: id3 });
    Deck.track('card_played', { card: 'forager_cache', tier: 'stone', run: id3, day: 12 });
    const rows = calls().slice(before).filter(c => c.path === '/telemetry' && c.body && c.body[0] && /^card_/.test(c.body[0].kind)).map(c => c.body[0]);
    out.deckRows = rows.map(x => ({ kind: x.kind, run: x.run_id === id3, user: x.user_id === __MOCK.st.uid,
      modeOk: x.mode == null || ['calm', 'moderate', 'hard'].includes(x.mode), dayOk: x.day >= 0 && x.day <= 100000, card: x.props && x.props.card }));
    localStorage.removeItem(Backend.END_KEY);
    return out;
  });
  ck('aRunThatEndsBeforeSignInIsKeptNotLost', r.kept.n === 1 && r.kept.run && r.kept.noUser && r.kept.uid === null && r.kept.outcome === 'loss' && r.kept.day === 44 && r.kept.sentRaw === 0,
    JSON.stringify(r.kept));
  ck('andGoesUpOnceThroughReportRunEndOnSignIn', r.flushed.reports === 1 && r.flushed.raw === 0 && r.flushed.left === 0 &&
    r.flushed.row && r.flushed.row.kind === 'run_end' && r.flushed.row.cause === 'tc_destroyed' && !('user_id' in r.flushed.row),
    JSON.stringify({ reports: r.flushed.reports, raw: r.flushed.raw, left: r.flushed.left }));
  ck('aSendThatDiesIsKeptAndResent', r.died.raw === 1 && r.died.kept === 1 && r.died.keptUid === 'mock-uid-0001' && r.died.reports === 1 && r.died.left === 0,
    JSON.stringify(r.died));
  ck('anEndingThatLandedKeepsNothing', r.landed.raw === 1 && r.landed.reports === 0 && r.landed.kept === 0, JSON.stringify(r.landed));
  ck('offTheSiteNothingIsKept', r.offSite === 0, 'kept ' + r.offSite);
  ck('aRunWithNoIdIsNamedByItsLineage', r.idless.rowId === r.idless.want && r.idless.named && r.idless.last && r.idless.cleared &&
    r.idless.report && r.idless.rows === 1 && r.idless.deterministic && r.idless.apart && r.idless.shape,
    JSON.stringify(r.idless));
  ck('andEveryEndingOfThatSaveIsTheSameRun', r.lineage.named.length === 2 && r.lineage.named.every(Boolean) && r.lineage.rows === 3 &&
    r.lineage.ids.every(Boolean), JSON.stringify(r.lineage));
  ck('aNewWorldIsNeverTheLoadedRun', r.lineage.fresh && r.lineage.own, `Backend.runId cleared by newGame ${r.lineage.fresh}; ends under its own name ${r.lineage.own}`);
  ck('aRefusedSendIsKeptOnlyWhenAResendCanMendIt', r.wire && r.wire[409] === true && r.wire[400] === false && r.wire[503] === true && r.wire.sent >= 3,
    JSON.stringify(r.wire));
  ck('theDecksRowsGoOutUnderTheirOwnKinds', r.deckRows.length === 2 && r.deckRows[0].kind === 'card_granted' && r.deckRows[1].kind === 'card_played' &&
    r.deckRows.every(x => x.run && x.user && x.modeOk && x.dayOk), JSON.stringify(r.deckRows));
  ck('theCardsPageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();

  // …and on the source: 0008 admits them, and the dashboard reads the cards
  const mig = readFileSync(join(root, 'supabase/migrations/0008_cards.sql'), 'utf8');
  const code = mig.replace(/--[^\n]*/g, '');
  ck('0008AdmitsTheDecksKinds', /add constraint telemetry_kind_check\s+check \(kind in \('run_start', 'run_end', 'session', 'card_granted', 'card_played'\)\)/.test(code),
    'Deck.track\'s rows were refused by the 0003 check, silently');
  ck('0008LeavesAnalyticsSummaryAlone', !/analytics_summary/.test(code), '0007\'s dedupe cannot be reverted by a file that never re-creates it');
  const ac = code.slice(code.indexOf('create or replace function public.analytics_cards('));
  ck('theCardsFunctionKeeps0007sOneEndingPerRun', /coalesce\(r\.cause, ''\) <> 'closed_tab'/.test(ac) && /from public\.telemetry r/.test(ac) &&
    /distinct on \(l\.run_id\)/.test(ac) && /union all select \* from last_left\) u\s+where coalesce\(u\.seconds, 0\) >= coalesce\(p_min_seconds, 0\)/.test(ac),
    'a real ending beats a closed tab (whole table), the latest closed tab is kept, the run filters after the dedupe');
  ck('andIsTokenGatedAndAggregateOnly', /digest\(coalesce\(p_token, ''\), 'sha256'\)/.test(ac) && /'bad_token'/.test(ac) &&
    /revoke all on function public\.analytics_cards\(text, timestamptz, timestamptz, text, text, text, text, integer, integer\) from public;/.test(code) &&
    /grant execute on function public\.analytics_cards\(text, timestamptz, timestamptz, text, text, text, text, integer, integer\)\s+to anon, authenticated;/.test(code),
    'the summary\'s own gate and grant');
  ck('andAnswersTheThreeQuestions', /'granted_by_tier'/.test(ac) && /'played_by_card'/.test(ac) && /'assisted'/.test(ac) && /cards_played/.test(ac),
    'granted by tier and outcome, played by card, the card-assisted win rate');
}

// ---- 6. WHAT A GAME CARRIES (build 107): its build on every row, and on its ending the errors it caught ----
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(MOCK);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    const rows = () => __MOCK.st.calls.filter(c => c.path === '/telemetry' && c.body && c.body[0]).map(c => c.body[0]);
    const lastEnd = () => rows().filter(x => x.kind === 'run_end').pop();
    const pick = (x) => x && x.props && { build: x.props.build, errors: x.props.errors, err: x.props.err, hasErr: 'err' in x.props };
    const m = (document.querySelector('script[src*="js/backend.js"]').getAttribute('src') || '').match(/[?&]v=(\d+)/);
    const out = { tag: m ? +m[1] : null };
    // a clean game says 0 — never blank, which the dashboard reads as "not counted"
    G.newGame('err0', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    G.end(false, 'test'); await new Promise(r => setTimeout(r, 50));
    out.clean = pick(lastEnd());
    // a game that caught faults counts every one and names the first, the column cut off
    G.newGame('err1', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    Feedback.noteError('TypeError: boom', 'at x', 'js/units.js:120:7');
    Feedback.noteError('TypeError: boom', 'at x', 'js/units.js:120:7');
    Feedback.noteError('RangeError: later', '', 'frame');
    G.end(false, 'test'); await new Promise(r => setTimeout(r, 50));
    out.hit = pick(lastEnd());
    const tick = () => new Promise(r => setTimeout(r, 50));
    // THE TALLY IS THE RUN'S (G.resetErrs, Feedback.runKey): the next game
    // starts its own count…
    G.newGame('err2', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    out.afterNew = Feedback.runErrs;
    Screens._enterNow();
    Feedback.noteError('Error: in the run', '', 'frame');
    const json2 = G.saveJSON();
    // …a load of the SAME run keeps counting (an earlier save of it)…
    G.loadJSON(json2); out.afterSameLoad = Feedback.runErrs;
    // …a load refused before it lands never touches the live game's count…
    try { G.loadJSON(JSON.stringify({ map: { W: 40, H: 40, terrain: [1, 2, 3] } })); } catch (e) { out.refused = String(e && e.message || e); }
    out.afterRefused = Feedback.runErrs;
    // …the title's demo world is nobody's run and never resets it, so the
    // run Continued from behind it still has its count…
    Screens._demo = true; G.newGame('err-demo', 'moderate', 'medium');
    out.afterDemo = Feedback.runErrs;
    Screens._demo = false; G.loadJSON(json2); out.afterContinue = Feedback.runErrs;
    // …and a load of ANOTHER run starts again
    const other = JSON.parse(json2); other.runId = 'another-run';
    G.loadJSON(JSON.stringify(other)); out.afterOtherLoad = Feedback.runErrs;

    // A FAULT THAT FIRES EVERY FRAME counts in every game it fires in: the
    // frame loop's repeat filter (G._lastErrKey) starts over with the tally
    const boom = () => { throw new Error('boom every frame'); };
    G.newGame('err3', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); Screens._enterNow();
    G._safe(boom, 'ui'); G._safe(boom, 'ui');
    out.frameFirst = Feedback.runErrs;
    G.end(false, 'test'); await tick();
    out.frameEnd1 = pick(lastEnd());
    G.newGame('err4', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); Screens._enterNow();
    G._safe(boom, 'ui');
    G.end(false, 'test'); await tick();
    out.frameEnd2 = pick(lastEnd());

    // A GAME QUIT TO THE MENU IS LEFT (one provisional ending), and CONTINUED
    // from the title it is the SAME run: no second run_start, the same id,
    // its count, its ending under that id
    G.newGame('err5', 'calm', 'medium'); Cards.pick(0); Screens._demo = false; Screens.show('playing'); Screens._enterNow();
    const id5 = S.runId; S.day = 9; S.playtime = 400;
    Feedback.noteError('Error: before the menu', '', 'frame');
    const json5 = G.saveJSON();
    const starts = () => rows().filter(x => x.kind === 'run_start').length;
    const startsBefore = starts();
    Screens.lastSavedDay = S.day;            // saved: one tap leaves
    Screens.quitToTitle(); await tick();
    out.quitRows = rows().filter(x => x.kind === 'run_end' && x.run_id === id5 && x.cause === 'closed_tab').map(x => x.props && x.props.errors);
    out.demoAfterQuit = Screens._demo === true && !!window.S && S.runId !== id5;
    G.loadJSON(json5); Screens._demo = false; Screens._enterNow();   // Continue
    out.continueId = S.runId === id5 && Backend.runId === id5;
    out.noNewStart = starts() === startsBefore;
    out.continueCount = Feedback.runErrs;
    S.day = 20; G.end(true, 'test victory', 'wonder'); await tick();
    out.continueEnd = rows().filter(x => x.kind === 'run_end' && x.run_id === id5 && x.cause === 'wonder').map(x => x.props && x.props.errors);
    // every kind of row carries the build
    Backend._emit({ kind: 'session', seconds: 5 });
    out.kinds = [...new Set(rows().map(x => x.kind + ':' + (x.props ? x.props.build : 'none')))];
    return out;
  });
  ck('everyRowSaysWhichBuildItWasPlayedOn', r.tag > 100 && r.kinds.length >= 2 && r.kinds.every(k => k.endsWith(':' + r.tag)), JSON.stringify(r.kinds) + ' (the tag reads ' + r.tag + ')');
  ck('aCleanGameSaysZeroErrors', r.clean && r.clean.errors === 0 && !r.clean.hasErr && r.clean.build === r.tag, JSON.stringify(r.clean));
  ck('aGameThatCaughtFaultsCountsThemAndNamesTheFirst', r.hit && r.hit.errors === 3 && r.hit.err === 'TypeError: boom @ js/units.js:120',
    JSON.stringify(r.hit));
  ck('andEveryGameStartsItsOwnCount', r.afterNew === 0 && r.afterOtherLoad === 0, JSON.stringify([r.afterNew, r.afterOtherLoad]));
  ck('aLoadOfTheSameRunKeepsItsCount', r.afterSameLoad === 1 && r.afterContinue === 1, JSON.stringify([r.afterSameLoad, r.afterContinue]));
  ck('aRefusedLoadTouchesNothing', /not a Clanfire save/.test(r.refused || '') && r.afterRefused === 1, JSON.stringify([r.refused, r.afterRefused]));
  ck('theTitlesDemoWorldIsNobodysRun', r.afterDemo === 1, 'the count behind the title: ' + r.afterDemo);
  ck('aFaultEveryFrameCountsInEveryGame', r.frameFirst === 1 && r.frameEnd1 && r.frameEnd1.errors === 1 && r.frameEnd2 && r.frameEnd2.errors === 1,
    JSON.stringify([r.frameFirst, r.frameEnd1, r.frameEnd2]));
  ck('aGameQuitToTheMenuIsLeft', JSON.stringify(r.quitRows) === '[1]' && r.demoAfterQuit, JSON.stringify([r.quitRows, r.demoAfterQuit]));
  ck('andContinuedItIsTheSameRun', r.continueId && r.noNewStart && r.continueCount === 1 && JSON.stringify(r.continueEnd) === '[1]',
    JSON.stringify({ id: r.continueId, noNewStart: r.noNewStart, count: r.continueCount, end: r.continueEnd }));
  ck('theBuildPageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL TELEMETRY CHECKS PASS');
