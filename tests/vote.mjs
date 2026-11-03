/* A VOTE EARNS A CARD — js/vote.js, the whole feature in one file
   (supabase/migrations/0012 + 0013 and supabase/functions/vote-callback are
   its server half; their behaviour, on a real PostgreSQL, is
   tests/analytics.mjs §1c and §6b).

   Operator, 2026-11-03: the vote link hid on the Cards screen where nobody
   would find it — "a banner … Vote and Get A Free Card … tap the banner and
   have the modal appear, it should look like the card announcement pages …
   After the 12 hours having it re-appear. When it reappears, all future free
   cards are stone (lowest level), and randomized … remove the button from
   the card screen … keep this whole section containerized".

   Driven against a MOCKED backend (no network is ever touched) that plays
   0012/0013's doors: vote_status, claim_vote_notes, and the record the
   site's callback writes into. Pinned:

     OFF IS NOTHING     CFG.CARDS.VOTE.ON false: no banner, no stylesheet, no
                        request, no row — and a page from disk (no record to
                        land in) offers nothing either
     THE BANNER         on the title, under the menu, in a few words, a 44px
                        target, inside the window at every size — or not at
                        all where the window is too short to hold it
     THE POP-UP         the announcement's own look (its panel, ribbon,
                        laurels, corners); the card the vote earns — Swift
                        Raiders for a first vote, a Stone card face down after
                        it — the vote page carrying this player's id in a new
                        tab; whole inside the window; X, Escape and the dark
                        around it close it
     THE WAIT           a press rests the offer while the vote lands, and the
                        banner returns 12 hours after the last counted vote
     THE CARD           arrives through the record and is thanked once, by
                        its own name; a vote too soon says why
     THE REWARD SCREEN  "Want another?" once the card is claimed, never before
     THE CARDS SCREEN   carries no vote link any more
     THE ROWS           seen (once a page, per place), open and go, each with
                        { step, where, first } and nothing else

   Run after touching: js/vote.js, CFG.CARDS.VOTE, Deck._syncRun's afterSync
   hook, DeckScreens._setButtons, the title's menu.

     node tests/vote.mjs      # exits non-zero on any regression
     SHOTS=dir node tests/vote.mjs   # …and leaves screenshots in dir */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + join(root, 'index.html');
const SHOTS = process.env.SHOTS || '';
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const res = {}, fails = [], errs = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* a backend that plays the vote's doors: one record per uid (its cards, the
   votes the site reported, told or not), vote_status and claim_vote_notes as
   0013 answers them, my_cards for the reconcile, and every telemetry row */
const MOCK = `
  window.__MOCK = (() => {
    const st = { uid: 'vote-uid-0001', calls: [], rows: [], statusMissing: false };
    const db = {};
    const rec = uid => db[uid] || (db[uid] = { counts: {}, seen: {}, starter: 0, votes: [] });
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
      my_cards() {
        const m = rec(st.uid), counts = {};
        for (const k in m.counts) if (m.counts[k] > 0) counts[k] = m.counts[k];
        return { ok: true, uid: st.uid, counts, seen: Object.assign({}, m.seen), starter: !!m.starter, starter_at: m.starter || null, pity: 0, medians: {} };
      },
      vote_status() {
        const m = rec(st.uid), counted = m.votes.filter(v => v.result === 'granted' || v.result === 'too_soon');
        return { ok: true, granted: m.votes.filter(v => v.result === 'granted').length,
                 last_at: counted.length ? Math.max(...counted.map(v => v.at)) : null, first_card: 'swift_raiders', later_tier: 'stone' };
      },
      claim_vote_notes() {
        const m = rec(st.uid), n = m.votes.filter(v => !v.told);
        for (const v of n) v.told = 1;
        return { ok: true, notes: n.map(v => ({ result: v.result, card: v.card || null, at: v.at })) };
      },
    };
    const rest = (method, path, body) => {
      st.calls.push({ method, path, body: body == null ? null : JSON.parse(JSON.stringify(body)) });
      if (path === '/telemetry' && method === 'POST') { for (const r of body || []) st.rows.push(r); return null; }
      if (path.startsWith('/rpc/')) {
        const name = path.slice(5);
        if (name === 'vote_status' && st.statusMissing) return { error: { status: 404, code: 404, message: 'Could not find the function' } };
        return doors[name] ? doors[name](body || {}) : null;
      }
      if (path.startsWith('/profiles') && method === 'GET') return [{ id: st.uid }];
      return method === 'GET' ? [] : null;
    };
    // what the site's callback does through 0013's vote_reward(): a vote, and the card in the record
    const vote = (result, card, at) => { const m = rec(st.uid); m.votes.push({ result, card: card || null, at: at || Date.now() }); if (result === 'granted') add(m, card, 1); };
    return { st, db, rec, auth, rest, vote };
  })();
  window.__NEO_BACKEND_MOCK = { auth: window.__MOCK.auth, rest: window.__MOCK.rest };
`;
// a helper the pages share: wait for a condition, bounded
const UNTIL = `window.__until = async (f, ms) => { const t = performance.now() + (ms || 5000); while (performance.now() < t) { try { if (f()) return true; } catch (e) {} await new Promise(r => setTimeout(r, 50)); } return false; };`;
const VOTE_OFF = () => {
  new MutationObserver((recs, ob) => {
    try { if (typeof CFG !== 'undefined' && CFG.CARDS && CFG.CARDS.VOTE) { CFG.CARDS.VOTE.ON = false; ob.disconnect(); } } catch (e) {}
  }).observe(document, { childList: true, subtree: true });
};
async function page(o) {
  o = o || {};
  const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }, o.ctx || {}));
  if (o.off) await ctx.addInitScript(VOTE_OFF);
  if (o.mock !== false) await ctx.addInitScript(MOCK);
  if (o.init) await ctx.addInitScript(o.init);
  await ctx.addInitScript(UNTIL);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push((o.tag || 'page') + ': ' + e));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  await p.evaluate(() => { if (window.Boot && Boot.force) Boot.force(); if (window.CardIntro) CardIntro.close(true); });
  if (o.mock !== false) await p.waitForFunction(() => Backend.isReady() && Deck.col().synced, null, { timeout: 20000 }).catch(() => {});
  await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
  return { ctx, p };
}
// the intro shows itself to a fresh device over the title: it is the announcement's, not this suite's
const NO_INTRO = () => { try { localStorage.setItem('neo-cards-intro', '1'); } catch (e) {} };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, name + '.png') }); };

/* ================= 1. OFF IS NOTHING ================= */
{
  const { ctx, p } = await page({ off: true, init: NO_INTRO, tag: 'off' });
  const r = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 900));
    Vote.paint(); Vote.open('title');
    return { banner: !!document.getElementById('vtBanner'), css: !!document.getElementById('voteCss'), pop: !!document.getElementById('voteCard'),
      asked: __MOCK.st.calls.filter(c => /vote_status|claim_vote_notes/.test(c.path)).length, rows: __MOCK.st.rows.filter(x => x.kind === 'vote').length };
  });
  ck('offBuildsNothingAndAsksNothing', !r.banner && !r.css && !r.pop && r.asked === 0 && r.rows === 0, JSON.stringify(r));
  await ctx.close();
}
{
  // from disk with no backend: there is no record to land a card in, so nothing is offered
  const { ctx, p } = await page({ mock: false, init: NO_INTRO, tag: 'disk' });
  const r = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 900)); Vote.paint();
    const el = document.getElementById('vtBanner'); return { link: Vote.link(), shown: !!el && !el.hidden, opened: Vote.open('title') }; });
  ck('aPageFromDiskOffersNothing', r.link === null && !r.shown && r.opened === false, JSON.stringify(r));
  await ctx.close();
}

/* ================= 2. THE BANNER, AND THE CARDS SCREEN WITHOUT IT ================= */
const SIZES = [[320, 568], [390, 844], [430, 932], [844, 390], [1024, 768], [1440, 900], [1920, 1080]];
{
  const bad = [], shown = [];
  for (const [w, h] of SIZES) {
    const { ctx, p } = await page({ ctx: { viewport: { width: w, height: h } }, init: NO_INTRO, tag: w + 'x' + h });
    const r = await p.evaluate(async () => {
      await __until(() => { Vote.paint(); const el = document.getElementById('vtBanner'); return !!el; }, 4000);
      Vote.paint();
      await new Promise(r => setTimeout(r, 900));       // its arrival, run to its end
      const el = document.getElementById('vtBanner');
      const col = document.querySelector('#scrTitle .tcol');
      const q = el && el.getBoundingClientRect(), m = document.querySelector('#scrTitle .tmenu').getBoundingClientRect();
      const top = q && document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { shown: !!el && !el.hidden && getComputedStyle(el).display !== 'none', text: el ? el.textContent.trim() : '',
        h: q ? q.height : 0, inside: !!q && q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth,
        under: !!q && q.top >= m.top && Math.abs(q.left - m.left) < 1.5 && Math.abs(q.right - m.right) < 1.5,
        hit: !!top && !!top.closest('#vtBanner'), scroll: col.scrollHeight > col.clientHeight + 1,
        oneLine: !!el && el.querySelector('span').getClientRects().length === 1 && el.scrollWidth <= el.clientWidth + 1 };
    }).catch(e => ({ err: String(e) }));
    if (r.err) { bad.push(`${w}x${h}: ${r.err}`); await ctx.close(); continue; }
    if (r.scroll) bad.push(`${w}x${h}: the title scrolls`);
    if (r.shown) {
      shown.push(w + 'x' + h);
      if (!r.inside || !r.under || !r.hit || r.h < 44 || !r.oneLine || !/^Vote & get a free card$/i.test(r.text))
        bad.push(`${w}x${h}: ${JSON.stringify(r)}`);
    } else if (!(h <= 600)) bad.push(`${w}x${h}: hidden on a window tall enough to hold it`);
    if (w === 390 || w === 1440) await shot(p, `title-${w}x${h}`);
    await ctx.close();
  }
  ck('theBannerStandsUnderTheMenuAtEverySize', bad.length === 0 && shown.length >= 5, bad.join(' | ') || 'shown at ' + shown.join(', ') + '; a window too short keeps its menu whole');
}

/* ================= 3. THE POP-UP ================= */
{
  const { ctx, p } = await page({ init: () => { try { localStorage.setItem('neo-cards-intro', '1'); } catch (e) {} }, tag: 'pop' });
  await p.evaluate(UNTIL);
  const r = await p.evaluate(async () => {
    const out = {};
    await __until(() => { Vote.paint(); const el = document.getElementById('vtBanner'); return el && !el.hidden; }, 6000);
    document.getElementById('vtBanner').click();
    await new Promise(r => setTimeout(r, 700));
    const root = document.getElementById('voteCard');
    const a = root && root.querySelector('a.vtGo'), face = root && root.querySelector('.vtSlot .ccard');
    const pr = root && root.querySelector('.ciPanel').getBoundingClientRect();
    out.look = !!root && !!root.querySelector('.ciPanel .ciRibbon .ciRib') && !!root.querySelector('.ciLaurel.l') && !!root.querySelector('.ciCorner.br') &&
      /data:image\/svg/.test(getComputedStyle(root.querySelector('.ciRib')).backgroundImage) && getComputedStyle(root).position === 'fixed';
    out.words = root ? [root.querySelector('.ciRibbon span').textContent, root.querySelector('.ciWord').textContent, root.querySelector('.ciSub').textContent, a && a.textContent.trim()] : [];
    out.card = face ? face.dataset.card : null;
    out.unknown = face ? face.classList.contains('unknown') : null;
    out.href = a ? a.getAttribute('href') : null;
    out.want = CFG.CARDS.VOTE.URL + '?ref=' + encodeURIComponent(Backend.uid);
    out.tab = a ? a.target === '_blank' && /noopener/.test(a.rel) : false;
    out.inside = !!pr && pr.top >= 0 && pr.bottom <= innerHeight + 0.5 && pr.left >= 0 && pr.right <= innerWidth + 0.5;
    out.focus = document.activeElement === a;
    // Escape, then the X, then the dark around it: each closes it
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    out.esc = !document.getElementById('voteCard');
    Vote.open('title'); await new Promise(r => setTimeout(r, 300));
    document.querySelector('#voteCard .ciX').click(); await new Promise(r => setTimeout(r, 350));
    out.x = !document.getElementById('voteCard');
    Vote.open('title'); await new Promise(r => setTimeout(r, 300));
    document.querySelector('#voteCard .ciVeil').click(); await new Promise(r => setTimeout(r, 350));
    out.veil = !document.getElementById('voteCard');
    return out;
  });
  ck('theBannerOpensThePopupInTheAnnouncementsLook', r.look && r.words[0] === 'Vote for us' && r.words[1] === 'Free card' && /Vote now/.test(r.words[3]),
    JSON.stringify(r.words));
  ck('aFirstVoteShowsSwiftRaiders', r.card === 'swift_raiders' && r.unknown === false && /Swift Raiders joins your deck/.test(r.words[2]), `${r.card} (unknown ${r.unknown}): "${r.words[2]}"`);
  ck('votingOpensTheSiteInANewTabCarryingThisPlayer', r.href === r.want && r.tab && r.focus, `${r.href} (want ${r.want}), new tab ${r.tab}, focused ${r.focus}`);
  ck('andTheXEscapeAndTheDarkCloseIt', r.esc && r.x && r.veil, JSON.stringify({ esc: r.esc, x: r.x, veil: r.veil }));
  // whole inside the window at every size, the card at whole device pixels
  const bad = [];
  for (const [w, h, dpr] of [[320, 568, 2], [390, 844, 3], [844, 390, 3], [1440, 900, 1], [1920, 1080, 1]]) {
    const c2 = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await c2.addInitScript(MOCK); await c2.addInitScript(NO_INTRO); await c2.addInitScript(UNTIL);
    const q = await c2.newPage();
    q.on('pageerror', e => errs.push(`${w}x${h}: ` + e));
    await q.goto(url, { waitUntil: 'domcontentloaded' });
    await q.waitForFunction(() => window.Screens && Screens.current === 'title' && Backend.isReady(), null, { timeout: 60000 });
    await q.evaluate(UNTIL);
    const f = await q.evaluate(async () => {
      if (window.Boot && Boot.force) Boot.force();
      await __until(() => Vote.link(), 5000);
      Vote.open('title');
      await new Promise(r => setTimeout(r, 900));
      const root = document.getElementById('voteCard'), pr = root.querySelector('.ciPanel').getBoundingClientRect();
      const face = root.querySelector('.vtSlot .ccard'), fr = face.getBoundingClientRect(), go = root.querySelector('.vtGo').getBoundingClientRect();
      const page = root.querySelector('.ciPages'), sec = root.querySelector('.ciPage');
      return { inside: pr.top >= -0.5 && pr.bottom <= innerHeight + 0.5 && pr.left >= -0.5 && pr.right <= innerWidth + 0.5,
        clipped: sec.offsetHeight > page.clientHeight + 1, cw: fr.width, whole: Math.abs(fr.width * devicePixelRatio - Math.round(fr.width * devicePixelRatio)) < 0.05,
        go: go.height >= 44 && go.bottom <= pr.bottom, faceIn: fr.top >= pr.top && fr.bottom <= pr.bottom };
    });
    if (!f.inside || f.clipped || !f.whole || !f.go || !f.faceIn || f.cw < 59) bad.push(`${w}x${h}@${dpr}: ${JSON.stringify(f)}`);
    if ([390, 1440].includes(w)) await shot(q, `popup-${w}x${h}`);
    await c2.close();
  }
  ck('thePopupStandsWholeInTheWindowAtEverySize', bad.length === 0, bad.join(' | ') || 'five sizes, the card at whole device pixels, VOTE NOW a 44px target');
  await ctx.close();
}

/* ================= 4. THE PRESS, THE WAIT, THE CARD ================= */
{
  const { ctx, p } = await page({ init: NO_INTRO, tag: 'press' });
  await p.evaluate(UNTIL);
  const r = await p.evaluate(async () => {
    const out = {}, said = [];
    const say0 = Screens.say; Screens.say = function (m) { said.push(m); return say0.apply(this, arguments); };
    const shown = () => { Vote.paint(); const el = document.getElementById('vtBanner'); return !!el && !el.hidden; };
    try {
      await __until(shown, 6000);
      out.before = shown();
      // the press: the page opens in a new tab (held here)
      Vote.open('title'); await new Promise(r => setTimeout(r, 300));
      const hold = e => { if (e.target.closest && e.target.closest('.vtGo')) e.preventDefault(); };
      document.addEventListener('click', hold, true);
      document.querySelector('#voteCard .vtGo').click();
      document.removeEventListener('click', hold, true);
      out.stamped = +localStorage.getItem(Vote.KEY) > Date.now() - 5000;
      out.closed = !document.getElementById('voteCard');
      out.rests = !shown();
      out.told = said.slice(-1)[0] || '';
      // the site called back: the first vote, Swift Raiders, through the record
      const before = Deck.col().counts.swift_raiders || 0;
      __MOCK.vote('granted', 'swift_raiders');
      said.length = 0;
      await Deck.sync('vote');
      out.gained = (Deck.col().counts.swift_raiders || 0) - before;
      out.thanks = said.slice();
      said.length = 0; await Deck.sync('vote'); out.again = said.slice();
      // counted: the banner waits 12 hours from the vote
      await Vote.refreshStatus(true);
      out.first = Vote.firstDue();
      out.waitH = (Vote.nextAt() - Date.now()) / 3600e3;
      out.hidden = !shown();
      // twelve hours later (the vote moved back by hand) it returns — for a random Stone card
      const m = __MOCK.rec(__MOCK.st.uid);
      for (const v of m.votes) v.at -= 12.2 * 3600e3;
      localStorage.setItem(Vote.KEY, String(Date.now() - 12.3 * 3600e3));
      await Vote.refreshStatus(true);
      out.back = shown();
      Vote.open('title'); await new Promise(r => setTimeout(r, 500));
      const root = document.getElementById('voteCard'), face = root.querySelector('.vtSlot .ccard');
      out.later = { card: face.dataset.card, unknown: face.classList.contains('unknown'), tier: Deck.card(face.dataset.card).tier,
        sub: root.querySelector('.ciSub').textContent, name: face.querySelector('.cc-nm').textContent };
      Vote.close(true);
      // a later vote's card: a Stone card, thanked by its own name
      __MOCK.vote('granted', 'loose_stone');
      localStorage.setItem(Vote.KEY, String(Date.now()));
      said.length = 0; await Deck.sync('vote');
      out.stone = { held: Deck.col().counts.loose_stone || 0, said: said.slice() };
      // a vote too soon earns nothing, and says why
      __MOCK.vote('too_soon');
      said.length = 0; await Deck.sync('vote');
      out.soon = said.slice();
      // the status door not there (0013 not applied): a press rests the whole 12 hours
      __MOCK.st.statusMissing = true; Vote.status = null; Vote._stAt = 0;
      localStorage.removeItem(Vote.LAST_KEY);
      localStorage.setItem(Vote.KEY, String(Date.now() - 3 * 3600e3));
      await Vote.refreshStatus(true);
      out.unknownWaitH = (Vote.nextAt() - Date.now()) / 3600e3;
    } finally { Screens.say = say0; }
    out.rows = __MOCK.st.rows.filter(x => x.kind === 'vote').map(x => x.props);
    return out;
  });
  ck('thePressRemembersAndTheBannerRests', r.before && r.stamped && r.closed && r.rests && /come back/i.test(r.told), JSON.stringify({ before: r.before, stamped: r.stamped, closed: r.closed, rests: r.rests, told: r.told }));
  ck('theFirstCardArrivesThroughTheRecordAndIsThankedOnce', r.gained === 1 && r.thanks.length === 1 && /Swift Raiders joins your deck/.test(r.thanks[0]) && r.again.length === 0,
    `+${r.gained}; said ${JSON.stringify(r.thanks)}; again ${JSON.stringify(r.again)}`);
  ck('theBannerReturnsTwelveHoursAfterTheVote', !r.first && r.hidden && r.waitH > 11.9 && r.waitH <= 12 && r.back,
    `first due ${r.first}; hidden ${r.hidden} for ${r.waitH.toFixed(2)} h; back after 12 ${r.back}`);
  ck('andThenItOffersARandomStoneCardFaceDown', r.later.unknown && r.later.tier === 'stone' && r.later.name === '?' && /random Stone card/.test(r.later.sub),
    JSON.stringify(r.later));
  ck('aLaterCardIsThankedByItsOwnName', r.stone.held === 1 && r.stone.said.length === 1 && /Loose Stone joins your deck/.test(r.stone.said[0]), JSON.stringify(r.stone));
  ck('aVoteTooSoonSaysWhy', r.soon.length === 1 && /once every 12 hours/.test(r.soon[0]), JSON.stringify(r.soon));
  ck('withNoStatusAPressRestsTheWholeWait', r.unknownWaitH > 8.9 && r.unknownWaitH <= 9.01, r.unknownWaitH.toFixed(2) + ' h left of the 12 after a press 3 h ago');
  // the rows: seen once a page per place, open, go — { step, where, first } and nothing else
  const shape = r.rows.every(x => Object.keys(x).sort().join() === 'build,first,step,where' || Object.keys(x).sort().join() === 'first,step,where');
  const steps = r.rows.map(x => x.step + ':' + x.where);
  ck('theRowsSayStepPlaceAndWhichCardNothingElse', shape && steps.filter(s => s === 'seen:title').length === 1 && steps.includes('open:title') && steps.includes('go:title') &&
    r.rows.find(x => x.step === 'go').first === true, JSON.stringify(r.rows));
  await ctx.close();
}

/* ================= 5. THE REWARD SCREEN, AND THE CARDS SCREEN ================= */
{
  const { ctx, p } = await page({ init: NO_INTRO, tag: 'reward' });
  await p.evaluate(UNTIL);
  const r = await p.evaluate(async () => {
    const out = {};
    await __until(() => Vote.link(), 6000);
    Screens._demo = false;
    G.newGame(4242, 'moderate', 'medium');
    Screens.show('playing'); S.paused = true;
    S.playtime = 900; S.stats.kills = 80; S.stats.built = 20; S.day = 140; S.stats.actDays = 30;
    G.end(true, 'test', 'razed_rival_tc');
    await __until(() => document.querySelector('#cardEnd .ceBtns'), 6000);
    await new Promise(r => setTimeout(r, 400));
    const more = () => { const el = document.querySelector('#cardEnd .vtMore'); return !!el && !el.hidden && el.getClientRects().length > 0; };
    out.beforeClaim = more();
    // claim every card on the plinth
    for (let i = 0; i < 4 && document.querySelector('#cardEnd .ceBtns').dataset.s !== 'done'; i++) {
      DeckScreens.claim(); await new Promise(r => setTimeout(r, 1600));
    }
    out.state = document.querySelector('#cardEnd .ceBtns').dataset.s;
    await __until(more, 3000);
    out.afterClaim = more();
    const el = document.querySelector('#cardEnd .vtMore');
    out.text = el ? el.textContent.trim() : '';
    const q = el && el.getBoundingClientRect();
    out.inside = !!q && q.bottom <= innerHeight && q.top >= 0;
    if (el) el.click();
    await new Promise(r => setTimeout(r, 500));
    out.pop = !!document.getElementById('voteCard') && getComputedStyle(document.getElementById('voteCard')).zIndex;
    out.rows = __MOCK.st.rows.filter(x => x.kind === 'vote').map(x => x.props.step + ':' + x.props.where);
    Vote.close(true);
    return out;
  });
  if (SHOTS) await shot(p, 'reward-390x844');
  ck('theRewardScreenOffersAnotherOnceTheCardIsClaimed', !r.beforeClaim && r.state === 'done' && r.afterClaim && r.inside && /Want another\? Vote for a free card/i.test(r.text),
    JSON.stringify({ before: r.beforeClaim, state: r.state, after: r.afterClaim, inside: r.inside, text: r.text }));
  ck('andItOpensTheSamePopup', !!r.pop && r.rows.includes('seen:reward') && r.rows.includes('open:reward'), JSON.stringify(r));
  const c = await p.evaluate(async () => {
    DeckScreens.openCollection('title');
    await new Promise(r => setTimeout(r, 400));
    return { link: !!document.querySelector('#scrCards .clVote, #scrCards a[href*="vibetoplist"]'), how: !!document.querySelector('#scrCards .clHow') };
  });
  ck('theCardsScreenCarriesNoVoteLinkAnyMore', !c.link && c.how, JSON.stringify(c));
  await ctx.close();
}

ck('theVotePagesThrewNothing', errs.length === 0, errs.slice(0, 3).join(' | ') || 'no page errors');
await b.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL VOTE CHECKS PASS');
