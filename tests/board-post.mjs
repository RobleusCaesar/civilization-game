/* EVERY VICTORY GOES ON THE WORLD BOARD — CONTRACT

   The board was wiped on 8 Sep 2026 and had gained ONE name in eleven wins
   by the 11th. Nothing was refused server-side: the name box sat behind the
   SCORE button, the celebration screen never said a name was wanted, and a
   boot that failed to sign in made the whole thing go silent. The ruling:
   anyone who wins is on the board, whatever the score. So:

     THE BOX IS ON THE SCENE   A first-time winner sees the name box and the
                       "name your chief" line on the celebration screen
                       itself, without tapping anything.

     A KNOWN CHIEF POSTS ALONE   A name on the profile posts the run the
                       moment the scene lands — no box, no tap, one post,
                       and the tally opening later does not post it again.

     LEAVING STILL COUNTS   REPLAY or MENU with the box empty warns once,
                       then posts the win under the village's stand-in name
                       (Score.fallbackName) on the way out — and that name
                       is NOT remembered as the chief's. A name typed but
                       never saved goes up as typed, with no warning.
                       Closing the page fires the same post keepalive.

     THE CLOUD GETS A SECOND CHANCE   A boot whose sign-in failed reconnects
                       at the victory; if that fails too the scene SAYS so
                       and offers Retry, which reconnects and posts.

     A LOST ANSWER IS NOT A LOST ROW   The server refusing a duplicate means
                       the row is already up: that counts as posted.

     NOTHING FROM DISK   A page opened from file:// never signs in and never
                       sends telemetry — the suite must not mint players or
                       phantom wins in the live project.

   Run this after touching any of:
     screens.js — onEndgame (victory), _offerSubmit, _promptName, _note,
                  _postBeforeLeaving, submitScore, leaveEnd, the pagehide hook
     backend.js — _init's file: guard, _signIn, reconnect, submitScore's
                  remember/keepalive options, _emit
     score.js — fallbackName
     index.html — #nameRow / #savedNote (they live in #victoryScene now)

     node tests/board-post.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

/* THE MOCK: the transport Backend expects (BACKEND.md "Testing"), with just
   enough of the real project's shape — a profile with an arcade_name, a
   public leaderboard, and the submit_score RPC with its duplicate rule. Every
   call is recorded so a test can count posts. */
const MOCK = `
  window.__MOCK = (() => {
    const st = { uid: 'mock-uid-0001', profile: { arcade_name: null }, board: [], calls: [], signinFails: 0, rpcFail: null, dupNext: false };
    const session = () => ({ access_token: 't', refresh_token: 'r', user: { id: st.uid } });
    const auth = {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() {
        if (st.signinFails > 0) { st.signinFails--; return { data: {}, error: { status: 429, message: 'rate limited' } }; }
        return { data: { session: session() }, error: null };
      },
      async refreshSession() { return { data: { session: session() }, error: null }; },
    };
    const rest = (method, path, body) => {
      st.calls.push({ method, path, body });
      if (path.startsWith('/rpc/submit_score')) {
        if (st.rpcFail) { const e = st.rpcFail; st.rpcFail = null; return { error: e }; }
        if (st.dupNext) { st.dupNext = false; return { error: { status: 400, message: 'duplicate submission' } }; }
        st.board.push({ name: body.p_name, score: body.p_score, mode: body.p_mode, day: body.p_day, created_at: new Date().toISOString() });
        return null;
      }
      if (path.startsWith('/leaderboard')) return st.board.slice().sort((a, b) => b.score - a.score);
      if (path.startsWith('/profiles') && method === 'GET') return [Object.assign({ id: st.uid, chief_name: null }, st.profile)];
      if (path.startsWith('/profiles') && method === 'PATCH') { Object.assign(st.profile, body); return null; }
      return method === 'GET' ? [] : null;
    };
    window.__NEO_BACKEND_MOCK = { auth, rest };
    return st;
  })();
`;

const errs = [];
const boot = async (init) => {
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
  if (init) await p.addInitScript(init);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  return p;
};
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---- 0. nothing from disk: no mock, no sign-in, no telemetry ----
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  let cloud = 0;
  await p.route('**/*supabase*/**', r => { cloud++; r.abort(); });
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  await p.waitForTimeout(400);
  const st = await p.evaluate(async () => {
    G.newGame('disk', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 200));
    return { configured: Backend.configured, ready: Backend.isReady(), screen: Screens.current };
  });
  await p.waitForTimeout(300);
  ck('aPageFromDiskNeverTouchesTheCloud', cloud === 0 && !st.configured && !st.ready, `requests=${cloud} configured=${st.configured}`);
  await p.close();
}

// ---- 1. the first-time winner: the box is on the scene, Save posts ----
{
  const p = await boot(MOCK);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('first', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 250));
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    const inScene = !!document.querySelector('#victoryScene #nameRow');
    const before = { scene: vis('victoryScene'), pane: vis('victoryPane'), row: vis('nameRow'), note: document.getElementById('savedNote').textContent, inScene,
      posts: __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')).length };
    document.getElementById('arcadeName').value = 'probe';
    document.getElementById('btnSubmitScore').click();
    await new Promise(r => setTimeout(r, 300));
    const posts = __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score'));
    return { before, posts, note: document.getElementById('savedNote').textContent, row: vis('nameRow'),
      profile: __MOCK.profile.arcade_name, submitted: Screens._submitted, entry: Screens._entry, rank: document.getElementById('vicRank').textContent, rankShown: vis('vicRank') };
  });
  ck('theBoxIsOnTheSceneBeforeAnyTap', r.before.scene && !r.before.pane && r.before.row && r.before.inScene, JSON.stringify(r.before));
  ck('theSceneSaysANameIsWanted', /name your chief/i.test(r.before.note), r.before.note);
  ck('nothingPostsUntilTheChiefIsNamed', r.before.posts === 0, `${r.before.posts} posts`);
  ck('savePostsOnce', r.posts.length === 1, `${r.posts.length} posts`);
  const pb = r.posts[0] && r.posts[0].body;
  ck('thePostCarriesTheRun', pb && pb.p_name === 'probe' && pb.p_score === r.entry.score && pb.p_mode === 'moderate' && pb.p_day === r.entry.day && pb.p_map_seed === 'first', JSON.stringify(pb));
  ck('theChosenNameIsRemembered', r.profile === 'probe', String(r.profile));
  ck('theSceneConfirmsIt', r.submitted && !r.row && /on the board as PROBE/i.test(r.note), r.note);
  ck('theRankLandsOnTheScene', r.rankShown && /RANK|HIGH SCORE/.test(r.rank), r.rank);
  await p.close();
}

// ---- 2. a known chief posts alone, once ----
{
  const p = await boot(MOCK + `__MOCK.profile.arcade_name = 'DEED';`);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('known', 'hard', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 300));
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    const a = { posts: __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')).length, row: vis('nameRow'), note: document.getElementById('savedNote').textContent };
    Screens.openTally();                       // the tally's own _offerSubmit must not post again
    await new Promise(r => setTimeout(r, 2500));
    Screens.closeTally();
    return { a, posts: __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')), warned: Screens._leaveWarned };
  });
  ck('aKnownChiefPostsWithoutATap', r.a.posts === 1 && !r.a.row && /on the board as DEED/i.test(r.a.note), JSON.stringify(r.a));
  ck('theTallyDoesNotPostAgain', r.posts.length === 1 && r.posts[0].body.p_name === 'DEED' && r.posts[0].body.p_mode === 'hard', `${r.posts.length} posts`);
  await p.close();
}

// ---- 3. leaving with the box empty: one warning, then the stand-in name ----
{
  const p = await boot(MOCK);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('leave', 'calm', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 250));
    const entry = Object.assign({}, Screens._entry);
    const fb = Score.fallbackName(Backend.uid);
    document.getElementById('btnVicAgain').click();
    await new Promise(r => setTimeout(r, 100));
    const afterOne = { screen: Screens.current, posts: __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')).length, warned: Screens._leaveWarned };
    document.getElementById('btnVicAgain').click();
    await new Promise(r => setTimeout(r, 400));
    const posts = __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score'));
    return { fb, entry, afterOne, screen: Screens.current, posts, profile: __MOCK.profile.arcade_name, clean: Score.cleanName(fb) };
  });
  ck('theFirstTapOnlyWarns', r.afterOne.screen === 'endgame' && r.afterOne.posts === 0 && r.afterOne.warned, JSON.stringify(r.afterOne));
  ck('theSecondTapLeaves', r.screen !== 'endgame', r.screen);
  ck('andTheWinGoesUpUnderTheStandInName', r.posts.length === 1 && r.posts[0].body.p_name === r.fb, JSON.stringify(r.posts.map(x => x.body.p_name)));
  ck('theStandInPostCarriesTheRunThatEnded', r.posts[0] && r.posts[0].body.p_score === r.entry.score && r.posts[0].body.p_mode === 'calm' && r.posts[0].body.p_map_seed === 'leave', JSON.stringify(r.posts[0] && r.posts[0].body));
  ck('theStandInNameIsNotRemembered', r.profile === null, String(r.profile));
  ck('theStandInNameIsALegalBoardName', r.clean.ok && r.fb.length <= 7 && /^[A-Z]+\d+$/.test(r.fb), r.fb);
  await p.close();
}

// ---- 4. a name typed but never saved goes up as typed, no warning ----
{
  const p = await boot(MOCK);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('typed', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 250));
    document.getElementById('arcadeName').value = 'Ana';
    document.getElementById('btnVicTitle').click();
    await new Promise(r => setTimeout(r, 400));
    const posts = __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score'));
    return { screen: Screens.current, posts: posts.map(x => x.body.p_name), profile: __MOCK.profile.arcade_name };
  });
  ck('aTypedNameLeavesAtOnceAndPosts', r.screen === 'title' && r.posts.length === 1 && r.posts[0] === 'Ana', JSON.stringify(r));
  ck('aTypedNameIsRemembered', r.profile === 'Ana', String(r.profile));
  await p.close();
}

// ---- 5. closing the page posts keepalive ----
{
  const p = await boot(MOCK);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('close', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 250));
    window.dispatchEvent(new Event('pagehide'));
    // the request must be on the wire in the same tick — no pre-check first
    const sync = __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')).length;
    await new Promise(r => setTimeout(r, 200));
    return { sync, posts: __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')).map(x => x.body.p_name), fb: Score.fallbackName(Backend.uid) };
  });
  ck('closingThePagePostsInTheSameTick', r.sync === 1 && r.posts.length === 1 && r.posts[0] === r.fb, JSON.stringify(r));
  await p.close();
}

// ---- 6. the cloud came up late: reconnect at the victory ----
{
  const p = await boot(MOCK + `__MOCK.signinFails = 3;`);   // boot's three tries all fail
  await p.waitForTimeout(3200);                              // 350 + 700 + 1400 ms of backoff
  const r = await p.evaluate(async () => {
    const readyAtBoot = Backend.isReady();
    G.newGame('late', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 400));
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    return { readyAtBoot, ready: Backend.isReady(), row: vis('nameRow'), note: document.getElementById('savedNote').textContent };
  });
  ck('aBootWithoutAnIdentityIsTheCaseUnderTest', !r.readyAtBoot, '');
  ck('theVictoryReconnectsAndAsksForTheName', r.ready && r.row && /name your chief/i.test(r.note), JSON.stringify(r));
  await p.close();
}

// ---- 7. the cloud stays down: the scene says so, Retry gets through ----
{
  const p = await boot(MOCK + `__MOCK.signinFails = 6;`);   // boot (3) and the victory's reconnect (3) both fail
  await p.waitForTimeout(3200);
  const r = await p.evaluate(async () => {
    G.newGame('down', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 3400));
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    const a = { ready: Backend.isReady(), row: vis('nameRow'), note: document.getElementById('savedNote').textContent, btn: document.getElementById('btnSubmitScore').textContent };
    document.getElementById('btnSubmitScore').click();       // Retry — the mock accepts now
    await new Promise(r => setTimeout(r, 400));
    const b2 = { ready: Backend.isReady(), row: vis('nameRow'), note: document.getElementById('savedNote').textContent };
    return { a, b2 };
  });
  ck('aDeadCloudIsSaidOutLoud', !r.a.ready && r.a.row && /out of reach/i.test(r.a.note) && /retry/i.test(r.a.btn), JSON.stringify(r.a));
  ck('retryReconnectsAndAsksForTheName', r.b2.ready && r.b2.row && /name your chief/i.test(r.b2.note), JSON.stringify(r.b2));
  await p.close();
}

// ---- 8. the post fails, then a Save gets through; a duplicate counts as posted ----
{
  const p = await boot(MOCK + `__MOCK.profile.arcade_name = 'DEED'; __MOCK.rpcFail = { status: 400, message: 'boom' };`);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('fail', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 300));
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    const a = { row: vis('nameRow'), note: document.getElementById('savedNote').textContent, name: document.getElementById('arcadeName').value, submitted: Screens._submitted };
    __MOCK.dupNext = true;                                   // the retry is answered "duplicate": the row is already up
    document.getElementById('btnSubmitScore').click();
    await new Promise(r => setTimeout(r, 300));
    const b2 = { row: vis('nameRow'), note: document.getElementById('savedNote').textContent, submitted: Screens._submitted, board: __MOCK.board.length };
    return { a, b2 };
  });
  ck('aFailedAutoPostShowsTheBoxWithTheNameKept', r.a.row && !r.a.submitted && /try again/i.test(r.a.note) && r.a.name === 'DEED', JSON.stringify(r.a));
  ck('aDuplicateAnswerCountsAsPosted', r.b2.submitted && !r.b2.row && /on the board as DEED/i.test(r.b2.note), JSON.stringify(r.b2));
  await p.close();
}

// ---- 9. a defeat asks for nothing and posts nothing ----
{
  const p = await boot(MOCK + `__MOCK.profile.arcade_name = 'DEED';`);
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  const r = await p.evaluate(async () => {
    G.newGame('lost', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    G.end(false, 'test');
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('btnDefeatTitle').click();
    await new Promise(r => setTimeout(r, 200));
    return { posts: __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score')).length, screen: Screens.current };
  });
  ck('aDefeatPostsNothing', r.posts === 0 && r.screen === 'title', JSON.stringify(r));
  await p.close();
}

await b.close();
console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL BOARD-POST CHECKS PASS');
console.log('errors:', errs);
if (fails.length || errs.length) process.exit(1);
