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
     THE DASHBOARD LOOKS PAST what already landed — migration 0006's run
                              filters (p_min_seconds drives the "Runs" picker;
                              p_min_day is declared for the next question),
                              sent only when the picker is set (PostgREST
                              resolves an RPC by parameter NAMES; an unknown
                              one is a 404, never a default), on the FIRST
                              render too, and the cause-by-day table that
                              settles "avg day 19.9 but the middle bucket is
                              empty" from the page itself.

   Run after touching: Backend._emit / telemetryAllowed / logRunEnd, G.end,
   Screens.show, the S.played backfill in loadJSON, analytics.html's
   callRpc/filters, or any analytics migration.

     node tests/telemetry.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
    };
  });
  ck('theShippedHostsAnswerYes', t.site && t.www && t.pages && t.caps, JSON.stringify(t));
  ck('andEveryOtherOriginAnswersNo', !t.http && !t.dev && !t.devAmp && !t.local && !t.loop && !t.lookalike && !t.none, JSON.stringify(t));
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
  ck('theDashboardSendsTheFilterOnlyWhenSet', /if\s*\(filters\.minSeconds\s*>\s*0\)/.test(html) && /p_min_seconds:\s*filters\.minSeconds/.test(html), '');
  ck('andTheFirstRenderHonoursThePicker', !/callRpc\(TOKEN,\s*\{\s*\}\)/.test(html) && (html.match(/callRpc\(TOKEN,\s*filters\(\)\)/g) || []).length >= 3,
    'unlock, tab-restore and Apply must all send the picker');
  ck('andFallsBackWhenTheFunctionPredatesIt', /res\.status === 404 \|\| res\.status === 300/.test(html) && /migration 0006/.test(html), '');
  ck('andRendersTheCauseByDayTable', /endings_by_bucket/.test(html) && /id="tEndDays"/.test(html) && /id="fMin"/.test(html) && /r\.d200_399, r\.d400p/.test(html), '');
}

// ---- 4. migration 0007 + the dashboard's leaving tables, pinned on the source ----
{
  const mig = readFileSync(join(root, 'supabase/migrations/0007_where_they_leave.sql'), 'utf8');
  const html = readFileSync(join(root, 'analytics.html'), 'utf8');
  const bk = readFileSync(join(root, 'js/backend.js'), 'utf8');
  ck('0007RevokesFromPublicBeforeGranting', mig.indexOf('revoke all on function public.analytics_summary(text, timestamptz, timestamptz, text, text, text, text, integer, integer) from public') > 0 &&
    mig.indexOf('revoke all on function') < mig.indexOf('grant execute on function'), '');
  ck('andTheRealEndingBeatsAClosedTab', /coalesce\(r\.cause, ''\) <> 'closed_tab'/.test(mig) && /from public\.telemetry r/.test(mig), 'checked against the whole table');
  ck('andTheLatestClosedTabIsKept', /distinct on \(l\.run_id\)/.test(mig) && /order by l\.run_id, l\.created_at desc/.test(mig), '');
  ck('andTheRunFiltersApplyAfterTheDedupe', /union all select \* from last_left\) u\s+where coalesce\(u\.seconds, 0\) >= coalesce\(p_min_seconds, 0\)/.test(mig), '');
  ck('andItBucketsTheLeavingByDayAndMinutes', /'where_they_leave'/.test(mig) && /'by_day'/.test(mig) && /'by_minutes'/.test(mig) &&
    /grouping sets \(\(e\.cause, e\.mode, e\.device\), \(e\.cause\)\)/.test(mig) && /where e\.outcome = 'abandoned'/.test(mig), 'closed_tab and struck_banner, split by difficulty and device');
  ck('theDashboardRendersWhereTheyLeave', /where_they_leave/.test(html) && /id="tLeaveDays"/.test(html) && /id="tLeaveMins"/.test(html) && /runs_closed_tab/.test(html), '');
  ck('theLeavingRowGoesKeepaliveWithItsToken', /logLeaving\(info\)/.test(bk) && /keepalive: true/.test(bk) && !/sendBeacon\(/.test(bk),
    'a beacon cannot carry the Bearer token the insert policy needs');
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL TELEMETRY CHECKS PASS');
