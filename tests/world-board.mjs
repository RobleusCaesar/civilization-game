/* THE WORLD BOARD — the contract for js/board.js, the board's half of
   js/backend.js and the card the board lifts (Deck.lift, CFG.CARDS.BOARD).
   Migration 0014's own SQL is pinned on a real PostgreSQL by
   tests/analytics.mjs §1d; this is the game against a mock of it.

   The operator, 2026-11-04: "The leaderboard is a bit bland … let's get
   the leaderboard to match [the settings page]. I think we might need to
   make a bigger deal out of the top 3 players, then list everyone beneath
   them. Also, the analytics page allows me to whitelist my IP … Please do
   that for the leaderboard too … Let's increase the odds for a top tier
   card when you make the leaderboard, especially top 3." Then: "hide the
   filter (for now). It's too much, makes the page look cluttered and
   dilutes the value of being on the leaderboard. Vertically Re-size the
   ranking list so there isn't unbalanced empty space. Make sure everything
   fits on a single page." And: "Delete the text at the bottom … Delete
   the 14 chiefs reference … Get rid of the number of wins under the player
   and the day … get rid of the icon for the origin card. Just name, points,
   difficulty and place."

   1. THE PODIUM AND THE TOP TEN: the three best stand on plinths under
      medals (first in the middle, crowned), the ranks to tenth are rows
      below, each chief once; the player's own row is gold. A place says its
      name, points, difficulty and place and nothing else: no day, no wins,
      no origin, no card mark, no chief count, no words below. The filter bars
      are put away (WorldBoard.FILTERS) — and flipped back on they still ask
      the board for one difficulty or this week, a later ask winning.
   2. YOUR BEST, WHEREVER IT IS: past tenth, or cut to fit a small window, it
      waits at the foot; a device the dashboard leaves out is told so.
   3. BEFORE 0014: the table is read as ever, one row per chief by name, and
      nothing a project without 0014 cannot answer is ever sent (no new
      parameter on a post, the card mark still held off).
   4. ONCE board_top ANSWERS: a post carries the run's origin card and its
      card count, and a card-assisted win goes up wearing the mark.
   5. A TEST BUILD POSTS NOTHING (Screens.boardHold, CLAUDE.md "THE TEST
      BUILD") — and an answer that is not ours never flips the switch.
   6. THE CHROME IS VECTOR, THE ICONS WITHIN THEIR PIXELS, AND IT FITS: the
      medals, crown, trophy and card mark are SVG; every picture is shown at
      or under its own pixels on a 3x screen; nothing runs off the page or
      off its plate from 320 to 1440 wide, a phone on its side included; and
      ONE PAGE: nothing scrolls, the frame is as tall as what it holds, it
      stands in the middle of the screen, and ALL TEN ARE SHOWN at every
      size — a short window presses the rows, puts the hidden device's note
      away and shrinks the podium, and never leaves a rank off.
   7. THE BOARD LIFTS THE CARD: a win placed in the top ten rises a tier
      half the time, on the podium always, never past the highest tier its
      own table rolls (the server's ceiling), never on a loss, a held win or
      past tenth; end to end, the reward screen's card rises and says so.

     node tests/world-board.mjs      # exits non-zero on any regression */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

/* the mock: a profile, the table (every victory a row, as 0002 made it) and
   — unless `v1` — board_top, which does what 0014 does: one row per chief
   (their best, the earlier of two equal scores first), the hidden devices
   left off, `mine` on the caller's own and `me` its best. */
const MOCK = (opts) => `
  window.__MOCK = (() => {
    const o = ${JSON.stringify(opts || {})};
    const st = { uid: 'mock-uid-0001', profile: { arcade_name: o.name || null }, rows: o.rows || [], hidden: o.hidden || [], calls: [], v1: !!o.v1, delay: 0 };
    const session = () => ({ access_token: 't', refresh_token: 'r', user: { id: st.uid } });
    const auth = { async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: session() }, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; } };
    const top = (body) => {
      let pool = st.rows.filter(r => (!body.p_mode || r.mode === body.p_mode) && (!body.p_days || !r.old));
      const best = new Map(), wins = new Map();
      pool.forEach((r, i) => { wins.set(r.uid, (wins.get(r.uid) || 0) + 1); const b = best.get(r.uid); if (!b || r.score > b.score) best.set(r.uid, Object.assign({ i }, r)); });
      const all = [...best.values()].sort((a, b) => b.score - a.score || a.i - b.i);
      const vis = all.filter(r => !st.hidden.includes(r.uid)).map((r, k) => ({ rank: k + 1, name: r.name, score: r.score, mode: r.mode, day: r.day, at: '2026-11-01T00:00:00Z',
        origin: r.origin || null, cards: r.cards == null ? null : r.cards, wins: wins.get(r.uid), mine: r.uid === st.uid }));
      const mb = best.get(st.uid), mr = vis.find(r => r.mine);
      const me = mb ? { rank: mr ? mr.rank : null, name: mb.name, score: mb.score, mode: mb.mode, day: mb.day, origin: mb.origin || null, cards: mb.cards == null ? null : mb.cards,
        wins: wins.get(st.uid), hidden: st.hidden.includes(st.uid) } : null;
      return { ok: true, players: vis.length, rows: vis.slice(0, body.p_limit || 50), me };
    };
    const rest = (method, path, body) => {
      st.calls.push({ method, path, body });
      if (path.startsWith('/rpc/board_top')) {
        if (st.v1) return { error: { status: 404, message: 'Could not find the function public.board_top(p_days, p_limit, p_mode) in the schema cache' } };
        return top(body);
      }
      if (path.startsWith('/rpc/submit_score')) {
        const r = { uid: st.uid, name: body.p_name, score: body.p_score, mode: body.p_mode, day: body.p_day, origin: body.p_origin || null, cards: body.p_cards_played == null ? null : body.p_cards_played };
        st.rows.push(r);
        return null;
      }
      if (path.startsWith('/leaderboard')) return st.rows.slice().sort((a, b) => b.score - a.score)
        .map(r => ({ name: r.name, score: r.score, mode: r.mode, day: r.day, created_at: '2026-11-01T00:00:00Z' }));
      if (path.startsWith('/profiles') && method === 'GET') return [Object.assign({ id: st.uid }, st.profile)];
      if (path.startsWith('/profiles') && method === 'PATCH') { Object.assign(st.profile, body); return null; }
      return method === 'GET' ? [] : null;
    };
    const slow = (m, p, b) => st.delay && p.startsWith('/rpc/board_top') ? new Promise(r => setTimeout(() => r(rest(m, p, b)), st.delay(b))) : rest(m, p, b);
    window.__NEO_BACKEND_MOCK = { auth, rest: slow };
    return st;
  })();
`;
// the fixture: fourteen chiefs, one of them three times (RIDGE), and the player (MOSSY) sixth
const R = (uid, name, score, mode, extra) => Object.assign({ uid, name, score, mode, day: 120 }, extra || {});
const ROWS = [
  R('u1', 'STORMR', 41250, 'hard', { origin: 'warlord', cards: 0 }), R('u2', 'RIDGE', 36900, 'hard', { origin: 'horselord', cards: 3 }),
  R('u2', 'RIDGE', 21000, 'moderate'), R('u2', 'RIDGE', 9000, 'calm'), R('u3', 'ASHKA', 31120, 'hard', { origin: 'mason' }),
  R('u4', 'FERN', 24800, 'moderate', { origin: 'caravan_master' }), R('u5', 'BRAN', 22310, 'hard'),
  R('mock-uid-0001', 'MOSSY', 19870, 'moderate', { origin: 'mariner', cards: 2 }),
  R('u7', 'OSRIC', 17420, 'moderate', { old: true }), R('u8', 'KAYA', 15060, 'moderate'), R('u9', 'TOVE', 12440, 'calm', { origin: 'homesteader' }),
  R('u10', 'LUGH', 11200, 'moderate'), R('u11', 'EDDA', 9800, 'moderate', { old: true }), R('u12', 'HALVR', 8900, 'calm'), R('u13', 'PIP', 7300, 'calm'),
  R('ops', 'OPS', 50000, 'hard'),
];

const errs = [];
const boot = async (init, vp) => {
  const p = await b.newPage({ viewport: vp || { width: 390, height: 844 }, deviceScaleFactor: (vp && vp.dsf) || 1 });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
  if (init) await p.addInitScript(init);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Boot && Boot.done, null, { timeout: 30000 });
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  return p;
};
const openBoard = async p => {
  await p.evaluate(() => { Screens.backTo = 'title'; Screens.show('leaders'); });
  await p.waitForFunction(() => document.querySelector('#ldrList .wbPodium .wbNm') && !document.querySelector('#ldrList .wbGhost'), null, { timeout: 5000 });
};
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---- 1. the podium and everyone beneath ----
{
  const p = await boot(MOCK({ rows: ROWS, hidden: ['ops'], name: 'MOSSY' }));
  await openBoard(p);
  const a = await p.evaluate(() => {
    const L = document.getElementById('ldrList');
    const steps = [...L.querySelectorAll('.wbPodium .wbStep')].map(s => ({ cls: s.className, name: (s.querySelector('.wbNm') || {}).textContent,
      medal: !!s.querySelector('svg.wbMedal'), crown: !!s.querySelector('svg.wbCrown'), plinth: !!s.querySelector('.wbPlinth'), top: s.querySelector('.wbPlinth').getBoundingClientRect().top }));
    const rows = [...L.querySelectorAll('.wbList:not(.wbMeList) .wbRow')].filter(r => !r.hidden).map(r => ({ rk: r.querySelector('.wbRk').textContent, name: r.querySelector('.wbWhoR b').firstChild.textContent, mine: r.classList.contains('mine') }));
    // what each place says: the place, the name, the points, the difficulty — and nothing else on the page
    const say = el => ({ place: !!el.querySelector('svg.wbMedal, .wbRk'), name: !!el.querySelector('.wbNm, .wbWhoR b'), pts: /^[\d,]+$/.test((el.querySelector('.wbPts') || {}).textContent || ''),
      diff: el.querySelectorAll('img').length === 1 && /trial-(calm|moderate|hard)\.png/.test(el.querySelector('img').src),
      extra: [...el.querySelectorAll('small, .wbSub, .wbOrig, .wbCm, .wbCard')].length });
    const places = [...L.querySelectorAll('.wbPodium .wbStep, .wbList:not(.wbMeList) > .wbRow')].map(say);
    const words = (L.textContent.match(/day|victor|wins?\b|chiefs?\b|card|origin|founded|tier|podium/gi) || []);
    return { steps, rows, places, words, foot: !!document.querySelector('#scrLeaders .wbFoot'), back: !!document.querySelector('#scrLeaders #ldrBack.wbBack'),
      count: (document.querySelector('#scrLeaders .wbCount') || {}).textContent || '', head: document.querySelector('#scrLeaders .wbHead').textContent.trim(),
      meList: !!L.querySelector('.wbMeList:not([hidden])'), night: document.getElementById('shell').classList.contains('night') || !(window.Boot && Boot.t2wear),
      bar: !!document.querySelector('#scrLeaders .wbBar, #scrLeaders .wbSeg'), asks: __MOCK.calls.filter(c => c.path.startsWith('/rpc/board_top')).map(c => (c.body.p_mode || '') + '/' + (c.body.p_days || 0)) };
  });
  const order = a.steps.map(s => s.name).join(',');
  ck('theBestThreeStandOnThePodiumTheFirstInTheMiddle', order === 'RIDGE,STORMR,ASHKA' && /s2/.test(a.steps[0].cls) && /s1/.test(a.steps[1].cls) && /s3/.test(a.steps[2].cls) &&
    a.steps.every(s => s.medal && s.plinth) && a.steps[1].crown && !a.steps[0].crown && a.steps[1].top < a.steps[0].top && a.steps[0].top < a.steps[2].top,
    `${order}; crowned ${a.steps.map(s => s.crown)}; plinth tops ${a.steps.map(s => Math.round(s.top))}`);
  const names = a.rows.map(r => r.rk + r.name).join(' ');
  ck('theRanksToTenthBeneathThemEachChiefOnce', names === '4FERN 5BRAN 6MOSSY 7OSRIC 8KAYA 9TOVE 10LUGH', names);
  const bad = a.places.filter(q => !q.place || !q.name || !q.pts || !q.diff || q.extra);
  ck('aPlaceIsItsNamePointsDifficultyAndPlaceAlone', a.places.length === 10 && bad.length === 0,
    `${a.places.length} places; ${bad.length ? 'short or over: ' + JSON.stringify(bad[0]) : 'each the four and nothing else'}`);
  ck('andThePageSaysNothingElse', !a.foot && !a.count && a.head === 'Leaderboard' && a.words.length === 0,
    `foot ${a.foot}; count "${a.count}"; header "${a.head}"; stray words ${a.words.join(' ') || 'none'}`);
  ck('theFilterIsPutAway', !a.bar && a.asks.length > 0 && a.asks.every(k => k === '/0'), `bar shown ${a.bar}; asked ${a.asks.join(' ')}`);
  ck('yourOwnRowIsGoldAndYourDevicesAreLeftOff', a.rows.filter(r => r.mine).map(r => r.name).join() === 'MOSSY' && !/OPS/.test(order + names) && !a.meList,
    `gold ${a.rows.filter(r => r.mine).map(r => r.name)}`);
  ck('itStandsOnTheNightAndKeepsItsWayBack', a.back && a.night, `back ${a.back}, night ${a.night}`);
  await p.close();
}
// the filters, flipped back on (WorldBoard.FILTERS): one difficulty, then this week — and a slow answer overtaken by a later ask is dropped
{
  const p = await boot(MOCK({ rows: ROWS, hidden: ['ops'], name: 'MOSSY' }));
  await p.evaluate(() => { WorldBoard.FILTERS = true; });
  await openBoard(p);
  const f = await p.evaluate(async () => {
    const shown = () => [...document.querySelectorAll('#ldrList .wbNm, #ldrList .wbWhoR b')].map(x => x.firstChild.textContent).join(',');
    const asks = () => __MOCK.calls.filter(c => c.path.startsWith('/rpc/board_top')).map(c => (c.body.p_mode || '') + '/' + (c.body.p_days || 0));
    document.querySelector('#scrLeaders .wbModes [data-mode="calm"]').click();
    for (let i = 0; i < 50 && !/TOVE/.test(shown()); i++) await new Promise(r => setTimeout(r, 20));
    const calm = shown();
    document.querySelector('#scrLeaders .wbWhen [data-days="7"]').click();
    for (let i = 0; i < 50 && /OSRIC|EDDA/.test(shown()) === false && document.querySelector('#ldrList .wbGhost'); i++) await new Promise(r => setTimeout(r, 20));
    await new Promise(r => setTimeout(r, 100));
    const week = shown();
    // the slow one: Hard answers in 400ms, Moderate in 20ms — Moderate was asked last and must stand
    __MOCK.delay = b => b.p_mode === 'hard' ? 400 : 20;
    document.querySelector('#scrLeaders .wbWhen [data-days="0"]').click();
    document.querySelector('#scrLeaders .wbModes [data-mode="hard"]').click();
    await new Promise(r => setTimeout(r, 5));
    document.querySelector('#scrLeaders .wbModes [data-mode="moderate"]').click();
    await new Promise(r => setTimeout(r, 650));
    __MOCK.delay = 0;
    return { calm, week, last: shown(), asks: asks(), on: [...document.querySelectorAll('#scrLeaders .wbBar button.on')].map(x => x.textContent).join('+') };
  });
  // (read in the page's order: the podium is laid out second, first, third)
  ck('flippedBackOnABoardForEachDifficultyAndForTheWeek', f.calm === 'RIDGE,TOVE,HALVR,PIP' && f.asks.includes('calm/0') && f.asks.includes('calm/7') && !/OSRIC|EDDA/.test(f.week),
    `Calm: ${f.calm}; this week: ${f.week}; asked ${f.asks.join(' ')}`);
  ck('andALaterAskOvertakesASlowOne', /^RIDGE,FERN,MOSSY/.test(f.last) && !/STORMR/.test(f.last) && f.on === 'Moderate+All time', `${f.last} (${f.on})`);
  await p.close();
}

// ---- 2. your best, wherever it is ----
{
  const many = ROWS.filter(r => r.uid !== 'mock-uid-0001').concat(Array.from({ length: 110 }, (_, i) => R('x' + i, 'C' + i, 6000 - i * 10, 'moderate')),
    [R('mock-uid-0001', 'MOSSY', 900, 'calm')]);
  const p = await boot(MOCK({ rows: many, hidden: ['ops'], name: 'MOSSY' }));
  await openBoard(p);
  const a = await p.evaluate(() => {
    const me = document.querySelector('#ldrList .wbMeList .wbRow');
    return { me: me && me.textContent, shown: !!(me && me.offsetParent), listed: [...document.querySelectorAll('#ldrList .wbList:not(.wbMeList) .wbRow')].filter(r => !r.hidden).length };
  });
  await p.close();
  // tenth on the board, on the smallest phone: tenth is shown in its place (a rank is never left off to fit), nothing waits at the foot
  const cut = ROWS.map(r => r.uid === 'mock-uid-0001' ? Object.assign({}, r, { score: 11000 }) : r);
  const c = await boot(MOCK({ rows: cut, hidden: ['ops'], name: 'MOSSY' }), { width: 320, height: 568, dsf: 1 });
  await openBoard(c);
  const k = await c.evaluate(() => {
    const vis = [...document.querySelectorAll('#ldrList .wbList:not(.wbMeList) .wbRow')].filter(r => !r.hidden).map(r => r.querySelector('.wbRk').textContent);
    const me = document.querySelector('#ldrList .wbMeList .wbRow');
    const ten = [...document.querySelectorAll('#ldrList .wbList:not(.wbMeList) .wbRow')].find(r => r.querySelector('.wbRk').textContent === '10');
    const pane = document.querySelector('#scrLeaders .wbPane');
    return { vis: vis.join(','), me: me && me.textContent, tenth: ten ? ten.textContent : '', mine: !!(ten && ten.classList.contains('mine')), scroll: pane.scrollHeight - pane.clientHeight };
  });
  await c.close();
  const q = await boot(MOCK({ rows: ROWS, hidden: ['ops', 'mock-uid-0001'], name: 'MOSSY' }));
  await openBoard(q);
  const h = await q.evaluate(() => ({ aside: (document.querySelector('#ldrList .wbAside') || {}).textContent, mossy: /MOSSY/.test(document.getElementById('ldrList').textContent) }));
  await q.close();
  ck('offTheListYourBestWaitsAtTheFoot', a.me && /^123MOSSY/.test(a.me) && a.shown && a.listed === 7,
    `"${a.me}" (shown ${a.shown}); ${a.listed} rows under the podium`);
  ck('andTenthIsShownInItsPlaceOnTheSmallestPhone', k.vis === '4,5,6,7,8,9,10' && /^10MOSSY/.test(k.tenth) && k.mine && !k.me && k.scroll <= 1,
    `ranks shown ${k.vis}; tenth "${k.tenth}" (gold ${k.mine}); at the foot "${k.me || 'nothing'}"; pane overflow ${k.scroll}`);
  ck('aDeviceLeftOutIsToldSo', /kept off the board/.test(h.aside || '') && !h.mossy, `"${h.aside}"; MOSSY shown ${h.mossy}`);
}

// ---- 3–4. before 0014 and once it answers ----
for (const v1 of [true, false]) {
  const p = await boot(MOCK({ rows: ROWS.slice(), v1, name: 'DEED' }));
  await openBoard(p);
  const r = await p.evaluate(async () => {
    const names = [...document.querySelectorAll('#ldrList .wbNm, #ldrList .wbWhoR b')].map(x => x.firstChild.textContent);
    const state = { v2: Backend.boardV2, marks: Backend.BOARD_MARKS_CARDS, ridge: names.filter(n => n === 'RIDGE').length, ops: names.includes('OPS') };
    const posts = () => __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score'));
    // an assisted win, founded with a card
    G.newGame('boardv', 'hard', 'large'); Screens._demo = false; Screens.show('playing');
    S.draft = { done: true, pickI: 0, hand: [{ key: 'warlord' }] };
    S.deck = S.deck || {}; S.deck.played = [{ id: 'forager_cache', day: 1 }];
    const n0 = posts().length;
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 400));
    const ps = posts().slice(n0);
    state.posts = ps.length; state.body = ps[0] && ps[0].body;
    state.note = document.getElementById('savedNote').textContent;
    return state;
  });
  if (v1) {
    ck('beforeTheFileTheTableIsReadOneRowPerChief', r.v2 === false && r.marks === false && r.ridge === 1 && r.ops,
      `boardV2 ${r.v2}, marks ${r.marks}, RIDGE ${r.ridge} row(s), the operator shown ${r.ops} (nothing to leave out with)`);
    ck('andAnAssistedWinIsStillHeldOff', r.posts === 0 && /card mark/.test(r.note), `${r.posts} posts; "${r.note}"`);
  } else {
    ck('onceItAnswersTheBoardWearsTheCardMark', r.v2 === true && r.marks === true && r.posts === 1 && r.body &&
      r.body.p_cards_played === 1 && r.body.p_origin === 'warlord' && r.body.p_mode === 'hard', `boardV2 ${r.v2}, marks ${r.marks}; ${JSON.stringify(r.body)}`);
  }
  await p.close();
}
// a plain win before the file sends exactly the six names a project without 0014 knows
{
  const p = await boot(MOCK({ rows: ROWS.slice(), v1: true, name: 'DEED' }));
  const r = await p.evaluate(async () => {
    await Backend.board({ limit: 10 });
    G.newGame('boardv1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    S.draft = { done: true, pickI: 0, hand: [{ key: 'warlord' }] };
    G.end(true, 'test');
    await new Promise(r => setTimeout(r, 400));
    const ps = __MOCK.calls.filter(c => c.path.startsWith('/rpc/submit_score'));
    return { keys: ps[0] ? Object.keys(ps[0].body).sort().join(',') : 'no post', rank: document.getElementById('vicRank').textContent };
  });
  ck('andAPlainWinSendsOnlyWhatAnOlderProjectKnows', r.keys === 'p_day,p_game_version,p_map_seed,p_mode,p_name,p_score', r.keys);
  ck('andTheRankIsWhereThisRunStands', /RANK #15 /.test(r.rank), `"${r.rank}" — a day-one win under the fourteen chiefs on the board`);
  await p.close();
}

// ---- 5. a test build posts nothing; an answer that is not ours flips nothing ----
{
  const p = await boot(MOCK({ rows: ROWS.slice(), name: 'DEED' }));
  const r = await p.evaluate(async () => {
    const m = Backend.mock, ta = Backend.telemetryAllowed;
    Backend.mock = null; Backend.telemetryAllowed = () => false;
    const held = Screens.boardHold(true);
    Backend.mock = m; Backend.telemetryAllowed = ta;
    const live = Screens.boardHold(true);
    // a mock that never heard of board_top answers { ok, data: null }
    const rest = __NEO_BACKEND_MOCK.rest;
    __NEO_BACKEND_MOCK.rest = (mt, path, b) => path.startsWith('/rpc/board_top') ? null : rest(mt, path, b);
    Backend.boardV2 = null; Backend.BOARD_MARKS_CARDS = false;
    const r2 = await Backend.board({ limit: 5 });
    __NEO_BACKEND_MOCK.rest = rest;
    return { held: held.hold, live: live.hold, v2: Backend.boardV2, marks: Backend.BOARD_MARKS_CARDS, rows: r2.ok && r2.data.rows.length };
  });
  ck('aTestBuildPostsNothing', /test build/i.test(r.held) && r.live === '', `test page: "${r.held}"; the site: "${r.live}"`);
  ck('andAnAnswerThatIsNotOursFlipsNothing', r.v2 === null && r.marks === false && r.rows > 0, `boardV2 ${r.v2}, marks ${r.marks}, the table read: ${r.rows} rows`);
  await p.close();
}

// ---- 6. vector chrome, icons within their pixels, and it fits ----
{
  // every size, and the two hard cases of build 161 (the tenth was left off a 1280x720 laptop): a device kept off the board,
  // whose note takes room at the foot, and a player past tenth, whose own row waits there
  const LOW = ROWS.map(r => r.uid === 'mock-uid-0001' ? Object.assign({}, r, { score: 100 }) : r);
  const sizes = [[320, 568, 3], [390, 844, 3], [430, 932, 3], [844, 390, 3], [568, 320, 2], [1536, 730, 1], [1440, 900, 1], [1280, 720, 1], [1280, 600, 1],
    [1280, 720, 1, 'kept'], [1536, 730, 1, 'kept'], [320, 568, 3, 'kept'], [1280, 720, 1, 'past'], [568, 320, 2, 'past'], [844, 390, 3, 'past'], [1280, 600, 1, 'past']];
  const out = [];
  for (const [w, h, dsf, kase] of sizes) {
    const tag = kase ? `${w}x${h}${kase === 'kept' ? 'KeptOff' : 'PastTenth'}` : `${w}x${h}`;
    const p = await boot(MOCK({ rows: kase === 'past' ? LOW : ROWS, hidden: kase === 'kept' ? ['ops', 'mock-uid-0001'] : ['ops'], name: 'MOSSY' }), { width: w, height: h, dsf });
    await openBoard(p);
    await p.evaluate(() => Promise.all([...document.querySelectorAll('#scrLeaders img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
    const m = await p.evaluate(() => {
      const scr = document.getElementById('scrLeaders'), bad = [], ras = [];
      for (const el of scr.querySelectorAll('*')) {
        if (el.closest('svg')) continue;
        const cs = getComputedStyle(el);
        if (/url\((?!["']?data:image\/svg)/.test(cs.backgroundImage)) ras.push('bg:' + el.className);
      }
      for (const i of scr.querySelectorAll('img')) {
        const r = i.getBoundingClientRect();
        if (!i.naturalWidth) continue;
        if (r.width * 3 > i.naturalWidth + 0.5) bad.push(i.className + ' ' + r.width.toFixed(1) + 'px of ' + i.naturalWidth);
      }
      const over = [];
      const W = document.documentElement.clientWidth;
      for (const el of scr.querySelectorAll('.wbNm, .wbPts, .wbWhoR b, .wbSeg button, .wbHead h2, .wbRow, .wbStep, .wbFrame, .wbTags, .wbSub')) {
        const r = el.getBoundingClientRect();
        if (r.right > W + 0.5 || r.left < -0.5) over.push(el.className + ' off the page');
        // a word cut short (the frame's corners hang past its rim on purpose: it is never a text box)
        if (!el.classList.contains('wbFrame') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis') over.push((el.className || el.tagName) + ' clipped: ' + el.textContent.slice(0, 20));
      }
      // and no name, score or tag spills out of its own step of the podium
      for (const s of scr.querySelectorAll('.wbStep')) {
        const sr = s.getBoundingClientRect();
        for (const el of s.querySelectorAll('.wbNm, .wbPts, .wbTags, .wbSub')) { const r = el.getBoundingClientRect(); if (r.left < sr.left - 0.5 || r.right > sr.right + 0.5) over.push(el.className + ' out of its step'); }
      }
      const steps = [...scr.querySelectorAll('.wbStep')].map(s => s.getBoundingClientRect());
      const overlap = steps.some((a, i) => steps.some((c, j) => i < j && a.right > c.left + 0.5 && c.right > a.left + 0.5));
      // ONE PAGE: nothing scrolls, nothing hangs past the window, no empty band inside the frame, the page stands in the middle
      const pane = scr.querySelector('.wbPane'), fr = scr.querySelector('.wbFrame').getBoundingClientRect();
      const back = scr.querySelector('#ldrBack').getBoundingClientRect(), H = document.documentElement.clientHeight;
      const kids = [...pane.querySelectorAll('#ldrList > *, .wbRest > *')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().bottom);
      const shownRows = [...scr.querySelectorAll('.wbList:not(.wbMeList) > .wbRow')].filter(r => !r.hidden && r.offsetParent);
      // a row the page lists is IN view: never under the player's own row stuck at the foot, never past the pane
      const pr = pane.getBoundingClientRect(), foot = scr.querySelector('.wbMeList');
      const footTop = foot && foot.offsetParent ? foot.getBoundingClientRect().top : Infinity;
      const inView = shownRows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= pr.top - 0.5 && b.bottom <= Math.min(pr.bottom, footTop) + 0.5; }).length;
      const page = { scroll: pane.scrollHeight - pane.clientHeight, docScroll: document.documentElement.scrollHeight - H, frameBottom: Math.round(fr.bottom), H,
        slack: Math.round(pane.getBoundingClientRect().bottom - Math.max(...kids)), above: Math.round(back.top), below: Math.round(H - fr.bottom),
        rows: shownRows.length, inView, rowH: shownRows[0] ? Math.round(shownRows[0].getBoundingClientRect().height) : 0,
        me: !!(foot && foot.offsetParent), note: !!scr.querySelector('.wbAside') };
      return { page, svg: scr.querySelectorAll('svg.wbMedal').length + scr.querySelectorAll('svg.wbCrown').length + scr.querySelectorAll('svg.wbTrophy').length,
        imgs: [...scr.querySelectorAll('img')].map(i => i.src.split('/').pop().split('?')[0]).filter((v, i, a) => a.indexOf(v) === i),
        bad, ras, over, overlap, hscroll: document.documentElement.scrollWidth > W + 1 };
    });
    out.push(`${tag}: ${m.bad.length + m.ras.length + m.over.length + (m.overlap ? 1 : 0) + (m.hscroll ? 1 : 0)} faults`);
    ck(`theChromeIsVectorAndTheIconsWithinTheirPixelsAt${tag}`, m.svg === 5 && m.ras.length === 0 && m.bad.length === 0 &&
      m.imgs.every(n => /^trial-[a-z]+\.png$/.test(n)), `${m.svg} vector medals/crown/trophy; rasters ${m.imgs.join(' ')}; ${m.bad.concat(m.ras).join(' | ') || 'all within their pixels'}`);
    ck(`andNothingRunsOffAt${tag}`, m.over.length === 0 && !m.overlap && !m.hscroll, m.over.join(' | ') || (m.overlap ? 'two steps overlap' : m.hscroll ? 'the page scrolls sideways' : 'fits'));
    // EVERY size shows all seven ranks under the podium, in view (operator, build 161: "Literally anyone that wins should take the
    // tenth spot"): the page presses its rows, its note and its podium instead; a tall one shows them at their full height
    const g = m.page, tall = h >= 844;
    ck(`andItIsOnePageWithAllTenAt${tag}`, g.scroll <= 1 && g.docScroll <= 1 && g.frameBottom <= g.H && g.slack <= 12 && Math.abs(g.above - g.below) <= 16 &&
      g.rows === 7 && g.inView === 7 && g.rowH >= 26 && (!tall || g.rowH >= 42) && (kase !== 'past' || g.me) && (kase !== 'kept' || g.note),
      `pane overflow ${g.scroll}, page ${g.docScroll}; empty band in the frame ${g.slack}px; above ${g.above} / below ${g.below}; ${g.rows} ranks (${g.inView} in view) at ${g.rowH}px; own row at the foot ${g.me}; note ${g.note}`);
    await p.close();
  }
}

// ---- 7. the board lifts the card ----
{
  const p = await boot(MOCK({ rows: ROWS, hidden: ['ops'], name: 'MOSSY' }));
  const u = await p.evaluate(() => {
    const ks = Deck.TIERS.map(t => t.k), modes = ['calm', 'moderate', 'hard'];
    const ceil = m => { const w = CFG.CARDS.DROPS[m]; let t = -1; w.forEach((x, i) => { if (x > 0) t = i; }); return t; };
    const lo = () => 0, hi = () => 0.99;
    let past = [], podium = [], top = [], beyond = [], loss = [];
    for (const m of modes) for (const k of ks) {
      const at = ks.indexOf(k), c = ceil(m), want = at >= 0 && at < c ? ks[at + 1] : k;
      for (const place of [1, 2, 3]) if (Deck.lift(k, { win: true, mode: m, place }, hi) !== want) podium.push(`${m} ${k} #${place}`);
      if (Deck.lift(k, { win: true, mode: m, place: 7 }, lo) !== want || Deck.lift(k, { win: true, mode: m, place: 7 }, hi) !== k) top.push(`${m} ${k}`);
      for (const place of [11, 40, null, 0]) if (Deck.lift(k, { win: true, mode: m, place }, lo) !== k) beyond.push(`${m} ${k} #${place}`);
      if (Deck.lift(k, { win: false, mode: m, place: 1, score: 30000 }, lo) !== k) loss.push(`${m} ${k}`);
      for (const place of [1, 5, 10]) { const t = Deck.lift(k, { win: true, mode: m, place }, lo); if (ks.indexOf(t) > Math.max(c, at)) past.push(`${m} ${k}→${t}`); }
    }
    // the odds, measured: a top-ten moderate win rolls Enlightenment about twice as often
    const n = 20000, rate = place => { let e = 0; for (let i = 0; i < n; i++) { const rep = { win: true, mode: 'moderate', place }; if (Deck.lift(Deck.rollTier(Deck.table(rep)), rep) === 'enlight') e++; } return e / n; };
    return { podium, top, beyond, loss, past, plain: rate(null), top10: rate(7), first: rate(1) };
  });
  ck('onThePodiumEveryCardRisesATier', u.podium.length === 0, u.podium.join(', ') || 'every tier, every difficulty, places 1–3');
  ck('inTheTopTenHalfTheTime', u.top.length === 0, u.top.join(', ') || 'a draw under one half lifts, one over it does not');
  ck('pastTenthALossOrNoPlaceNothing', u.beyond.length === 0 && u.loss.length === 0, u.beyond.concat(u.loss).join(', ') || 'unlifted');
  ck('neverPastTheTierItsOwnTableRolls', u.past.length === 0, u.past.join(', ') || 'Calm stops at Imperial, every table at its own top');
  ck('andTheOddsOfALegendRise', u.top10 > u.plain * 1.6 && u.first > u.plain * 3.5,
    `Moderate Enlightenment: ${(u.plain * 100).toFixed(1)}% plain, ${(u.top10 * 100).toFixed(1)}% in the top ten, ${(u.first * 100).toFixed(1)}% on the podium`);
  // end to end: the board as last seen puts this win second; its card rises and the reward screen says so
  const e = await p.evaluate(async () => {
    await WorldBoard.peek();
    G.newGame('lift', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    S.played = true;
    const roll = Deck.rollTier;
    Deck.rollTier = () => 'bronze';
    const sc = Score.compute;
    Score.compute = win => Object.assign(sc.call(Score, win), { total: 40000 });
    try { G.end(true, 'test'); } finally { Deck.rollTier = roll; }
    await new Promise(r => setTimeout(r, 300));
    Score.compute = sc;
    const run = Deck.col().runs[Deck.report(true, 'test').key] || [];
    const kick = (document.querySelector('#cardEnd .cePlate small') || {}).textContent || '';
    return { place: DeckScreens._view && DeckScreens._view.place, tiers: run.map(c => c.tier + (c.lift ? '↑' : '')).join(','), kick };
  });
  ck('endToEndTheRewardCardRisesAndSaysWhy', e.place === 2 && /^iron↑/.test(e.tiers) && /Board #2/.test(e.kick),
    `place ${e.place}; the run's cards ${e.tiers}; the plate "${e.kick}"`);
  // a held win is lifted by nothing
  const h = await p.evaluate(async () => {
    G.newGame('liftheld', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    S.deck = S.deck || {}; S.deck.played = [{ id: 'forager_cache', day: 1 }];
    const marks = Backend.BOARD_MARKS_CARDS;
    Backend.BOARD_MARKS_CARDS = false;
    const roll = Deck.rollTier; Deck.rollTier = () => 'bronze';
    try { G.end(true, 'test'); } finally { Deck.rollTier = roll; Backend.BOARD_MARKS_CARDS = marks; }
    await new Promise(r => setTimeout(r, 300));
    const run = Deck.col().runs[Deck.report(true, 'test').key] || [];
    return { place: DeckScreens._view && DeckScreens._view.place, tiers: run.map(c => c.tier + (c.lift ? '↑' : '')).join(',') };
  });
  ck('aHeldWinIsLiftedByNothing', !h.place && /^bronze(,|$)/.test(h.tiers), `place ${h.place}; cards ${h.tiers}`);
  await p.close();
}

await b.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL WORLD BOARD CHECKS PASS');
console.log('errors:', errs);
if (fails.length || errs.length) process.exit(1);
