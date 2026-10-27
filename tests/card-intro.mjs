/* THE CARD ANNOUNCEMENT (js/cardintro.js).

   This file pins:

     THE SWITCH        off (the shipped default), nothing of the announcement
                       exists: no element, no stylesheet, no listener bound
                       from js/cardintro.js, no storage write, no request for
                       its art — even with ?cardsintro=1 on the address
     ONCE PER DEVICE   on, the first title after the splash lifts wears it
                       (never before the lift), it is stamped seen when shown
                       and a reload never shows it again; ?cardsintro=1 brings
                       it back on purpose; a throwing localStorage still shows
                       it once and never twice in the session
     NEVER OVER A RUN  never over a game, the reward screen or the tutorial's
                       lesson, and leaving the screen it stands over takes it
                       away
     THE CLOSE         X (44px), Escape and the backdrop each close it; a tap
                       inside the panel does not; the focus comes home
     THE SCREENS       four; NEXT walks them and the last one's call to action
                       closes; BACK, the dots, a swipe and the arrow keys move;
                       Tab never leaves the dialog
     THE FACES         every face is a real catalog card drawn by Deck.face,
                       with its own art and its tier's frame, at whole device
                       pixels; the fan is one of each tier, Legendary centred;
                       the prizes are the Dragon and the Kraken
     THE WORDS         every number in the copy is the rule's own
                       (CFG.CARDS.LOSS_DEEDS / LOSS_DAYS / DROPS.hard / PITY,
                       Deck.TIERS), and every claim is checked against the code
                       that keeps it (Deck.eligible, Deck.great, Deck.settle,
                       Deck.play)
     THE FIT           at 390x844, 430x932, 768x1024, 1440x900 and 1920x1080,
                       on every screen: the panel inside the window, nothing of
                       a screen outside its panel, no label running off its
                       line, no caption under a card
     THE MOTION        cards deal in and sparks rise; asking for less motion
                       shows the same screens with nothing animated
     THE COLLECTION    "How cards work" reopens it there, and closing it (or
                       Escape) leaves the collection standing

   Run after touching: js/cardintro.js, the CardIntro hooks in js/screens.js
   (show) and js/deckscreens.js (onTitle, the collection's "How cards work"),
   Deck.face, the earn rule's constants, assets/cards/intro/.

     node tests/card-intro.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const url = 'file://' + join(root, 'index.html');

const res = {}, fails = [], errs = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* every listener and element made BY js/cardintro.js is recorded (the stack
   names the file), before any script of the game has run */
const SPY = () => {
  window.__ciMade = [];
  const mine = () => /cardintro\.js/.test(new Error().stack || '');
  const ael = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) {
    if (mine()) window.__ciMade.push('listener:' + t);
    return ael.call(this, t, f, o);
  };
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (t, o) {
    if (mine()) window.__ciMade.push('element:' + t);
    return ce.call(this, t, o);
  };
};
// a phone that blocks storage (iOS "Block All Cookies"): every access throws
const NO_STORAGE = () => {
  const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
  Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
};

async function context(o) {
  o = o || {};
  const ctx = await b.newContext({ viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: o.dpr || 3,
    reducedMotion: o.reduce ? 'reduce' : 'no-preference', hasTouch: !!o.touch });
  for (const s of (o.init || [])) await ctx.addInitScript(s);
  return ctx;
}
async function page(ctx, q, o) {
  o = o || {};
  const p = await ctx.newPage();
  p.__reqs = [];
  p.on('request', r => p.__reqs.push(r.url()));
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(url + (q || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  if (o.force !== false) await p.evaluate(() => Boot.force && Boot.force());
  await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {});
  return p;
}
/* the close is measured by the condition itself, never a fixed beat: the
   fade-out is a timer, and a loaded machine stretches every timer */
const closed = (p, ms) => p.waitForFunction(() => !CardIntro.open && !document.getElementById('cardIntro'), null, { timeout: ms || 5000 })
  .then(() => true, () => false);
const opened = (p, ms) => p.waitForFunction(() => window.CardIntro && CardIntro.open && document.getElementById('cardIntro'), null, { timeout: ms || 15000 })
  .then(() => true, () => false);
// the announcement opened on purpose (as the collection and ?cardsintro=1 do)
const openNow = p => p.evaluate(() => { if (!CardIntro.open) CardIntro.show('title'); return CardIntro.open; });

/* ================= 1. THE SWITCH, OFF ================= */
{
  const ctx = await context({ init: [SPY] });
  const p = await page(ctx, '?cardsintro=1');
  await sleep(2600);   // past the lift and the announcement's own beat
  const a = await p.evaluate(() => {
    const out = {};
    out.off = CFG.CARDS.ON === false && !Deck.on();
    out.made = window.__ciMade.slice();
    out.el = !!document.getElementById('cardIntro');
    out.css = !!document.getElementById('cardIntroCss');
    out.open = CardIntro.open;
    out.stored = Deck._get(CardIntro.KEY);
    // every way in, asked directly, answers nothing
    Screens.show('settings'); Screens.show('title');
    out.maybe = CardIntro.maybeShow();
    out.show = CardIntro.show('title');
    out.made2 = window.__ciMade.slice();
    out.el2 = !!document.getElementById('cardIntro');
    out.stored2 = Deck._get(CardIntro.KEY);
    return out;
  });
  const art = p.__reqs.filter(u => /assets\/cards\/intro\//.test(u));
  ck('theSwitchShipsOff', a.off);
  ck('offNothingOfItExists', !a.el && !a.css && !a.open && a.made.length === 0 && a.stored == null,
    `element ${a.el}, stylesheet ${a.css}, open ${a.open}, made by cardintro.js: ${a.made.join(',') || 'nothing'}, stored ${a.stored}`);
  ck('offEveryWayInAnswersNothing', a.maybe === false && a.show === false && !a.el2 && a.made2.length === 0 && a.stored2 == null,
    `maybeShow ${a.maybe}, show ${a.show}, element ${a.el2}, made ${a.made2.join(',') || 'nothing'}`);
  ck('offItsArtIsNeverFetched', art.length === 0, art.join(', ') || 'no request for assets/cards/intro/');
  await ctx.close();
}

/* ================= 2. ONCE PER DEVICE ================= */
{
  // the moment it opens is recorded against the splash: after the lift only
  const WATCH = () => {
    new MutationObserver(() => {
      if (window.__ciAt || !document.getElementById('cardIntro')) return;
      const s = document.getElementById('splash');
      window.__ciAt = { splash: !!s && s.style.opacity !== '0', done: !!(window.Boot && Boot.done), screen: window.Screens && Screens.current };
    }).observe(document, { childList: true, subtree: true });
  };
  const ctx = await context({ init: [WATCH] });
  const p = await page(ctx, '?cards=1', { force: false });
  const first = await opened(p, 20000);
  const a = await p.evaluate(() => ({ at: window.__ciAt, stored: Deck._get(CardIntro.KEY), from: CardIntro.from, page: CardIntro.page,
    dialog: (() => { const r = document.getElementById('cardIntro'); return r && r.getAttribute('role') === 'dialog' && r.getAttribute('aria-modal') === 'true'; })() }));
  ck('theFirstTitleWearsTheAnnouncement', first && a.from === 'title' && a.page === 0 && a.dialog, `opened ${first}, from ${a.from}, screen ${a.page}, a modal dialog ${a.dialog}`);
  ck('onlyAfterTheSplashHasLifted', !!a.at && a.at.done && !a.at.splash && a.at.screen === 'title', JSON.stringify(a.at));
  ck('itIsStampedSeenWhenShown', a.stored === '1', String(a.stored));
  await p.click('#cardIntro .ciX');
  ck('theXClosesIt', await closed(p));
  await p.close();
  // the same device, a fresh load: never again
  const q = await page(ctx, '?cards=1');
  const again = await opened(q, 3500);
  ck('neverTwiceOnOneDevice', !again, again ? 'it came back' : 'a second load stays on the title');
  await q.close();
  // …unless asked for
  const r = await page(ctx, '?cards=1&cardsintro=1');
  ck('andTheTestLinkBringsItBack', await opened(r, 15000));
  await ctx.close();
}

/* ================= 3. A STORAGE THAT THROWS ================= */
{
  const ctx = await context({ init: [NO_STORAGE] });
  const p = await page(ctx, '?cards=1');
  const shown = await opened(p, 15000);
  const a = await p.evaluate(async () => {
    const out = { on: Deck.on() };
    CardIntro.close(true);
    // another visit to the title in the session
    Screens.show('settings'); Screens.show('title');
    // …and the next page load's own first try, read from the session's memory
    CardIntro._armed = false;
    out.maybe = CardIntro.maybeShow();
    await new Promise(r => setTimeout(r, 1500));
    out.open = CardIntro.open;
    return out;
  });
  ck('aBlockedStorageStillShowsItOnce', shown && a.on, `deck on ${a.on}, shown ${shown}`);
  ck('andNeverTwiceInTheSession', a.maybe === false && !a.open, `maybeShow ${a.maybe}, open ${a.open}`);
  await ctx.close();
}

/* ================= 4. NEVER OVER A RUN ================= */
{
  const ctx = await context();
  const p = await page(ctx, '?cards=1');
  await opened(p, 15000);
  const a = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // open over the title, then a game starts underneath it (Continue, a deep link)
    Screens._demo = false;
    G.newGame('ci-run', 'moderate', 'medium');
    Screens.show('playing');
    out.closedByGame = !CardIntro.open && !document.getElementById('cardIntro');
    // asked again while the run is live: never
    Deck._del(CardIntro.KEY); CardIntro._armed = false;
    out.inGame = CardIntro._canAuto();
    CardIntro.maybeShow();
    await wait(1300);
    out.openInGame = CardIntro.open;
    // the reward screen
    S.paused = true; S.playtime = 900; S.stats.built = 20; S.day = 140; S.stats.actDays = 30;
    G.end(true, 'test', 'razed_rival_tc');
    await wait(300);
    out.screenEnd = Screens.current;
    CardIntro._armed = false; CardIntro.maybeShow();
    await wait(1300);
    out.openAtEnd = CardIntro.open;
    // the title, with a lesson running in S (a pending tutorial world)
    Screens._demo = true; Screens.show('title');
    S.tut = { on: true, phase: 1 };
    out.lesson = CardIntro._canAuto();
    S.tut = null;
    out.titleOk = CardIntro._canAuto();
    return out;
  });
  ck('aGameStartingUnderneathTakesItAway', a.closedByGame);
  ck('neverOverARunInProgress', !a.inGame && !a.openInGame, `canAuto ${a.inGame}, opened ${a.openInGame}`);
  ck('neverOverTheRewardScreen', a.screenEnd === 'endgame' && !a.openAtEnd, `${a.screenEnd}, opened ${a.openAtEnd}`);
  ck('neverDuringTheLesson', a.lesson === false && a.titleOk === true, `with a lesson ${a.lesson}, without ${a.titleOk}`);
  await ctx.close();
}

/* ================= 5. THE CLOSE, AND THE SCREENS ================= */
{
  const ctx = await context({ w: 1440, h: 900, dpr: 1 });
  const p = await page(ctx, '?cards=1');
  await opened(p, 15000);
  await sleep(700);
  // a tap inside the panel is not a close; the backdrop is
  await p.mouse.click(720, 300);
  const inside = await p.evaluate(() => CardIntro.open);
  await p.mouse.click(30, 450);
  const veil = await closed(p);
  ck('aTapInsideThePanelIsNotAClose', inside);
  ck('theBackdropClosesIt', veil);
  // Escape
  await p.evaluate(() => { document.getElementById('btnTitleCards') && document.getElementById('btnTitleCards').focus(); CardIntro.show('title'); });
  await sleep(300);
  await p.keyboard.press('Escape');
  await closed(p);
  const esc = await p.evaluate(() => ({ closed: !CardIntro.open, focus: document.activeElement && document.activeElement.id, title: Screens.current }));
  ck('escapeClosesIt', esc.closed && esc.title === 'title', JSON.stringify(esc));
  ck('andTheFocusComesHome', esc.focus === 'btnTitleCards', String(esc.focus));
  // the X is 44px to touch
  await openNow(p);
  await sleep(700);   // past the panel's own entrance (it grows in from 96%)
  // its LAYOUT size: the panel's entrance scales it for a moment, never its target
  const x = await p.evaluate(() => { const e = document.querySelector('#cardIntro .ciX'); return [e.offsetWidth, e.offsetHeight]; });
  ck('theXIs44px', x[0] >= 44 && x[1] >= 44, x.join('x'));

  // four screens, walked by NEXT; the last one's call to action closes
  const walk = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = { pages: document.querySelectorAll('#cardIntro .ciPage').length, seen: [], labels: [] };
    for (let i = 0; i < 4; i++) {
      const on = document.querySelector('#cardIntro .ciPage.on');
      out.seen.push(on && on.dataset.page);
      out.labels.push(document.querySelector('#cardIntro .ciNext').textContent.trim());
      out['dots' + i] = [...document.querySelectorAll('#cardIntro .ciDot')].findIndex(d => d.classList.contains('on'));
      // nothing of a hidden screen is reachable
      out['hidden' + i] = [...document.querySelectorAll('#cardIntro .ciPage:not(.on)')].every(s => s.hasAttribute('inert') && s.getAttribute('aria-hidden') === 'true');
      if (i < 3) { document.querySelector('#cardIntro .ciNext').click(); await wait(120); }
    }
    out.backHiddenFirst = null;
    document.querySelector('#cardIntro .ciNext').click();
    await wait(350);
    out.closedByCta = !CardIntro.open;
    return out;
  });
  ck('thereAreFourScreens', walk.pages === 4 && walk.seen.join() === '0,1,2,3', `${walk.pages} pages, walked ${walk.seen.join()}`);
  ck('theDotsFollow', [0, 1, 2, 3].every(i => walk['dots' + i] === i));
  ck('aHiddenScreenIsInert', [0, 1, 2, 3].every(i => walk['hidden' + i]));
  ck('theLastScreenCallsToAction', /^Next/.test(walk.labels[0]) && /Let.s go/i.test(walk.labels[3]) && walk.closedByCta,
    `${walk.labels.join(' | ')}; closed by it ${walk.closedByCta}`);

  // BACK, the dots, the arrow keys and Tab
  await openNow(p);
  const nav = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const backBtn = document.querySelector('#cardIntro .ciBack');
    out.backHiddenOnFirst = getComputedStyle(backBtn).visibility === 'hidden';
    document.querySelector('#cardIntro .ciDot[data-dot="2"]').click(); await wait(80);
    out.dot = CardIntro.page;
    backBtn.click(); await wait(80);
    out.back = CardIntro.page;
    return out;
  });
  await p.keyboard.press('ArrowRight'); await sleep(80);
  await p.keyboard.press('ArrowRight'); await sleep(80);
  const right = await p.evaluate(() => CardIntro.page);
  await p.keyboard.press('ArrowLeft'); await sleep(80);
  const left = await p.evaluate(() => CardIntro.page);
  for (let i = 0; i < 9; i++) await p.keyboard.press('Tab');
  const trapped = await p.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#cardIntro'));
  for (let i = 0; i < 4; i++) await p.keyboard.press('Shift+Tab');
  const trapped2 = await p.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#cardIntro'));
  ck('backIsHiddenOnTheFirstScreen', nav.backHiddenOnFirst);
  ck('theDotsAreTappable', nav.dot === 2 && nav.back === 1, `dot → ${nav.dot}, back → ${nav.back}`);
  ck('theArrowKeysMove', right === 3 && left === 2, `→→ ${right}, ← ${left}`);
  ck('tabNeverLeavesTheDialog', trapped && trapped2);
  await ctx.close();
}

/* ================= 5b. A SWIPE ================= */
{
  const ctx = await context({ touch: true });
  const p = await page(ctx, '?cards=1');
  await opened(p, 15000);
  await sleep(600);
  const swipe = async (x0, x1, y) => {
    const cdp = await p.context().newCDPSession(p);
    const pts = n => [{ x: n, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(x0) });
    for (let i = 1; i <= 3; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(x0 + (x1 - x0) * i / 3) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
  };
  await swipe(320, 80, 420);
  const one = await p.evaluate(() => CardIntro.page);
  await swipe(320, 80, 420);
  const two = await p.evaluate(() => CardIntro.page);
  await swipe(80, 320, 420);
  const back = await p.evaluate(() => CardIntro.page);
  // a vertical drag is nobody's swipe
  await swipe(200, 210, 300);
  const still = await p.evaluate(() => ({ page: CardIntro.page, open: CardIntro.open }));
  ck('aSwipeTurnsThePage', one === 1 && two === 2 && back === 1, `← ${one}, ← ${two}, → ${back}`);
  ck('andATapIsNotASwipe', still.page === 1 && still.open, JSON.stringify(still));
  await ctx.close();
}

/* ================= 6. THE FACES, AND 7. THE WORDS ================= */
{
  const ctx = await context();
  const p = await page(ctx, '?cards=1');
  await opened(p, 15000);
  const a = await p.evaluate(async () => {
    const out = {};
    const root = document.getElementById('cardIntro');
    const faces = [...root.querySelectorAll('.ccard')];
    out.n = faces.length;
    out.bad = faces.filter(f => {
      const c = Deck.card(f.dataset.card);
      if (!c) return true;
      const art = f.querySelector('.cc-art').getAttribute('style') || '';
      const fr = f.style.getPropertyValue('--fr');
      return art.indexOf('assets/cards/art/' + c.id + '.png') < 0 || fr.indexOf('assets/cards/frame-' + c.tier + '.png') < 0;
    }).map(f => f.dataset.card || '?');
    // whole device pixels: every face is a whole multiple of the authored 176
    out.blurry = faces.filter(f => { const k = f.getBoundingClientRect().width === 0 ? null : parseFloat(f.style.getPropertyValue('--w')) * devicePixelRatio / Deck.W; return k != null && Math.abs(k - Math.round(k)) > 0.01; })
      .map(f => f.dataset.card);
    const fan = [...root.querySelectorAll('.ciFan .ciSlot .ccard')];
    out.fanTiers = fan.map(f => Deck.card(f.dataset.card).tier);
    out.mid = (root.querySelector('.ciFan .ciSlot.mid .ccard') || {}).dataset;
    out.mid = out.mid && Deck.card(out.mid.card).tier;
    out.beasts = [...root.querySelectorAll('.ciBeast .ccard')].map(f => f.dataset.card);
    out.strips = [...root.querySelectorAll('.ciMonster')].map(m => m.style.backgroundImage);
    // THE WORDS, read off the page
    const txt = sel => [...root.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    out.sub1 = txt('.ciP-hello .ciSub');
    out.earn = txt('.ciP-earn');
    out.legends = txt('.ciP-legends');
    out.pips = root.querySelectorAll('.ciP-earn .ciPips i').length;
    out.days = root.querySelectorAll('.ciP-earn .ciDays i').length;
    out.ladder = [...root.querySelectorAll('.ciTiers li')].map(li => li.querySelector('b').textContent + '/' + li.querySelector('small').textContent);
    const C = CFG.CARDS;
    out.C = { deeds: C.LOSS_DEEDS, days: C.LOSS_DAYS, leg: C.DROPS.hard[4], pity: C.PITY };
    out.tiers = Deck.TIERS.map(t => t.name + '/' + t.rarity);
    // …and every claim against the code that keeps it
    const E = r => Deck.eligible(Object.assign({ win: false, cause: 'tc_destroyed', deeds: 0, actDays: 0 }, r)).ok;
    out.anyWin = E({ win: true, cause: 'razed_rival_tc' });                          // "however fast you win"
    out.fought = E({ deeds: C.LOSS_DEEDS, actDays: C.LOSS_DAYS });                    // "a defeat you fought hard"
    out.tooFewDeeds = E({ deeds: C.LOSS_DEEDS - 1, actDays: C.LOSS_DAYS });
    out.tooFewDays = E({ deeds: C.LOSS_DEEDS, actDays: C.LOSS_DAYS - 1 });
    out.struck = E({ cause: 'struck_banner', deeds: 99, actDays: 99 });              // "leave with nothing"
    out.greatHard = Deck.great({ win: true, mode: 'hard', day: 9999, cause: 'razed_rival_tc' });
    out.greatWonder = Deck.great({ win: true, mode: 'calm', day: 9999, cause: 'wonder' });
    out.greatFast = Deck.great({ win: true, mode: 'moderate', day: 1, cause: 'razed_rival_tc' });
    out.notGreat = Deck.great({ win: true, mode: 'moderate', day: 9999, cause: 'razed_rival_tc' });
    // "a great victory earns two" and the pity, through the real grant
    const fresh = () => { Deck._col = null; Deck._del(Deck.KEY); Deck.col(); };
    fresh();
    out.two = Deck.settle({ win: true, mode: 'hard', day: 9999, cause: 'razed_rival_tc', deeds: 0, actDays: 0, key: 'ci-great', runId: null }, () => 0).cards.length;
    fresh(); Deck.col().pity = C.PITY;
    out.pityTier = Deck.settle({ win: true, mode: 'calm', day: 9999, cause: 'razed_rival_tc', deeds: 0, actDays: 0, key: 'ci-pity', runId: null }, () => 0).cards[0].tier;
    fresh(); Deck.col().pity = C.PITY - 1;
    out.notYet = Deck.settle({ win: true, mode: 'calm', day: 9999, cause: 'razed_rival_tc', deeds: 0, actDays: 0, key: 'ci-pity2', runId: null }, () => 0).cards[0].tier;
    // "each card plays once — then it's gone"
    fresh(); Deck._add('fallen_timber', 1); Deck.saveCol();
    CardIntro.close(true);
    Screens._demo = false; G.newGame('ci-play', 'moderate', 'medium'); Screens.show('playing'); S.paused = true;
    const before = Deck.count('fallen_timber');
    const r = Deck.play('fallen_timber');
    out.played = { ok: r.ok, before, after: Deck.count('fallen_timber') };
    return out;
  });
  ck('everyFaceIsARealCatalogCard', a.n >= 10 && a.bad.length === 0, `${a.n} faces; wrong art or frame: ${a.bad.join(',') || 'none'}`);
  ck('atWholeDevicePixels', a.blurry.length === 0, a.blurry.join(',') || 'every face a whole multiple');
  ck('theFanIsOneOfEachTierLegendaryCentred', a.fanTiers.slice().sort().join() === ['bronze', 'enlight', 'imperial', 'iron', 'stone'].sort().join() && a.mid === 'enlight',
    `${a.fanTiers.join(',')}, middle ${a.mid}`);
  ck('thePrizesAreTheDragonAndTheKraken', a.beasts.includes('dragonfire') && a.beasts.includes('krakens_call') &&
    a.strips.some(s => /dragon-fly\.png/.test(s)) && a.strips.some(s => /kraken-thrash\.png/.test(s)), `${a.beasts.join(',')}; ${a.strips.length} strips`);
  ck('theFirstScreenSaysWhatTheOperatorSaid', a.sub1 === 'Win or lose, you’ll earn cards to use in future games.', a.sub1);
  ck('theEarnNumbersAreTheRulesOwn', a.earn.includes(a.C.deeds + ' deeds') && a.earn.includes(a.C.days + ' days') && a.pips === a.C.deeds && a.days === a.C.days,
    `"${a.C.deeds} deeds" ${a.earn.includes(a.C.deeds + ' deeds')}, "${a.C.days} days" ${a.earn.includes(a.C.days + ' days')}, pips ${a.pips}, day marks ${a.days}`);
  ck('theOddsAreTheRulesOwn', a.legends.includes('1 card in ' + Math.round(100 / a.C.leg)) && a.legends.includes(a.C.pity + ' wins'),
    a.legends.slice(0, 400));
  ck('theLadderIsTheTiers', a.ladder.length === 5 && a.tiers.every(t => a.ladder.map(x => x.toLowerCase()).includes(t.toLowerCase())), a.ladder.join(', '));
  ck('aWinAlwaysEarns', a.anyWin);
  ck('aFoughtDefeatEarnsAndOnlyAFoughtOne', a.fought && !a.tooFewDeeds && !a.tooFewDays, `fought ${a.fought}, a deed short ${a.tooFewDeeds}, a day short ${a.tooFewDays}`);
  ck('aStruckBannerEarnsNothing', a.struck === false);
  ck('aGreatVictoryIsWhatTheCopySays', a.greatHard && a.greatWonder && a.greatFast && !a.notGreat && a.two === 2,
    `Hard ${a.greatHard}, Wonder ${a.greatWonder}, fast ${a.greatFast}, ordinary ${a.notGreat}, cards ${a.two}`);
  ck('thePityIsWhatTheCopySays', a.pityTier === 'enlight' && a.notYet !== 'enlight', `${a.C.pity} wins without: ${a.pityTier}; one fewer: ${a.notYet}`);
  ck('aPlayedCardIsGone', a.played.ok && a.played.after === a.played.before - 1, JSON.stringify(a.played));
  await ctx.close();
}

/* ================= 8. THE FIT ================= */
{
  const bad = [];
  // the five the brief names, and two short phones (an iPhone SE, and the
  // smallest still in service — where a screen may scroll inside its panel)
  for (const [w, h, dpr] of [[390, 844, 3], [430, 932, 3], [768, 1024, 2], [1440, 900, 1], [1920, 1080, 1], [375, 667, 2], [320, 568, 2]]) {
    const ctx = await context({ w, h, dpr, reduce: true });
    const p = await page(ctx, '?cards=all&cardsintro=1');
    await opened(p, 15000);
    await p.waitForFunction(() => window.Assets && Assets.artReady && Assets.artReady(), null, { timeout: 30000 }).catch(() => {});
    for (let i = 0; i < 4; i++) {
      const r = await p.evaluate(i => {
        CardIntro.go(i);
        const root = document.getElementById('cardIntro'), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        const panel = root.querySelector('.ciPanel').getBoundingClientRect();
        const pg = root.querySelector('.ciPage.on');
        const out = [];
        if (panel.left < 0 || panel.top < 0 || panel.right > vw + 0.5 || panel.bottom > vh + 0.5) out.push(`panel ${panel.left|0},${panel.top|0}-${panel.right|0},${panel.bottom|0} outside ${vw}x${vh}`);
        const rib = root.querySelector('.ciPage.on .ciRibbon').getBoundingClientRect();
        if (rib.top < 0) out.push('ribbon cut by the top ' + rib.top.toFixed(1));
        // everything the screen shows stands inside the panel's inner rim
        const inner = { l: panel.left + 4, t: panel.top + 4, r: panel.right - 4, b: panel.bottom - 4 };
        const parts = [...pg.querySelectorAll('.ciTitle .ciWord, .ciSub, .ciFoot, .ccard, figcaption, .ciRoad, .ciTiers li, .ciDeckBtn')];
        // a hero measured too tall scrolls inside the panel (_fitPage): its
        // box must stand inside the panel and really scroll; what is inside it
        // is reached by scrolling, not laid over anything
        const scroller = pg.classList.contains('scroll') && pg.querySelector('.ciHero');
        if (scroller) {
          const q = scroller.getBoundingClientRect();
          if (q.top < inner.t - 1 || q.bottom > inner.b + 1) out.push('a scrolling hero past the panel');
          if (!(scroller.scrollHeight > scroller.clientHeight)) out.push('a hero marked scrolling that does not scroll');
          if (getComputedStyle(scroller).overflowY !== 'auto') out.push('a spilling hero that cannot scroll');
        }
        for (const el of parts) {
          if (scroller && scroller.contains(el)) continue;
          const q = el.getBoundingClientRect();
          if (!q.width) continue;
          if (q.left < inner.l - 1 || q.right > inner.r + 1 || q.bottom > inner.b + 1 || (q.top < inner.t - 1 && !el.closest('.ciHead')))
            out.push(`${el.className || el.tagName} ${q.left|0},${q.top|0}-${q.right|0},${q.bottom|0} past the panel`);
        }
        // and the nav is never covered by the screen above it
        const nav = root.querySelector('.ciNav').getBoundingClientRect();
        for (const el of pg.querySelectorAll('.ccard, figcaption, .ciRoad, .ciFoot')) {
          if (scroller && scroller.contains(el)) continue;
          const q = el.getBoundingClientRect();
          if (q.width && q.bottom > nav.top + 2) out.push(`${el.className || el.tagName} runs into the nav (${q.bottom|0} > ${nav.top|0})`);
        }
        // no label runs off its line
        for (const el of root.querySelectorAll('.ciRibbon span, .ciNext .blab, .ciWord')) {
          if (!el.getClientRects().length) continue;
          if (el.scrollWidth > el.clientWidth + 1) out.push(`"${el.textContent.trim()}" runs off (${el.scrollWidth} > ${el.clientWidth})`);
        }
        const rb = root.querySelector('.ciPage.on .ciRibbon'), rs = rb.querySelector('span');
        const sr = document.createRange(); sr.selectNodeContents(rs);
        const tw = sr.getBoundingClientRect();
        if (tw.width > rb.getBoundingClientRect().width * 0.8) out.push(`ribbon lettering ${tw.width|0}px on a ${rb.getBoundingClientRect().width|0}px ribbon`);
        // no caption under a card, no card under another screen's caption
        const caps = [...pg.querySelectorAll('figcaption')], cards = [...pg.querySelectorAll('.ccard')];
        for (const c of caps) {
          const q = c.getBoundingClientRect();
          for (const f of cards) {
            const z = f.getBoundingClientRect();
            const ix = Math.min(q.right, z.right) - Math.max(q.left, z.left), iy = Math.min(q.bottom, z.bottom) - Math.max(q.top, z.top);
            if (ix > 2 && iy > 2) out.push(`caption "${c.textContent.trim()}" under ${f.dataset.card} (${ix|0}x${iy|0})`);
          }
        }
        // the buttons are big enough to hit
        for (const el of root.querySelectorAll('.ciX, .ciNext, .ciDot')) {
          const q = el.getBoundingClientRect();
          if (q.width && (q.height < 44 || (el.classList.contains('ciX') && q.width < 44))) out.push(`${el.className} ${q.width|0}x${q.height|0}`);
        }
        return out;
      }, i);
      for (const x of r) bad.push(`${w}x${h} screen ${i + 1}: ${x}`);
    }
    await ctx.close();
  }
  ck('itFitsEveryWindow', bad.length === 0, bad.slice(0, 8).join(' | ') || 'seven windows, four screens, all inside');
}

/* ================= 9. THE MOTION ================= */
{
  const ctx = await context({ w: 1440, h: 900, dpr: 1 });
  const p = await page(ctx, '?cards=1&cardsintro=1');
  await opened(p, 15000);
  const moving = await p.evaluate(() => {
    const root = document.getElementById('cardIntro');
    const an = document.getAnimations().filter(a => a.effect && a.effect.target && root.contains(a.effect.target));
    return { n: an.length, deal: an.some(a => a.animationName === 'ciDeal'), sparks: an.some(a => a.animationName === 'ciMote') };
  });
  ck('theCardsDealInAndSparksRise', moving.deal && moving.sparks, JSON.stringify(moving));
  await ctx.close();
  const ctx2 = await context({ w: 1440, h: 900, dpr: 1, reduce: true });
  const q = await page(ctx2, '?cards=1&cardsintro=1');
  await opened(q, 15000);
  const still = await q.evaluate(async () => {
    const root = document.getElementById('cardIntro');
    const live = () => document.getAnimations().filter(a => a.effect && a.effect.target && root.contains(a.effect.target) && a.playState === 'running').length;
    const out = { a: live() };
    CardIntro.go(3);
    out.b = live();
    const head = root.querySelector('.ciPage.on .ciHead'), card = root.querySelector('.ciPage.on .ccard');
    out.seen = getComputedStyle(head).opacity === '1' && !!card && card.getBoundingClientRect().width > 0;
    return out;
  });
  ck('lessMotionAnimatesNothingAndShowsEverything', still.a === 0 && still.b === 0 && still.seen, JSON.stringify(still));
  await ctx2.close();
}

/* ================= 10. THE COLLECTION ================= */
{
  const ctx = await context();
  const p = await page(ctx, '?cards=1');
  await opened(p, 15000);
  await p.evaluate(() => CardIntro.close(true));
  const a = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    DeckScreens.openCollection('title');
    const how = document.querySelector('#scrCards .clHow');
    out.how = !!how && how.textContent.trim();
    // its touch target is 44px tall (an invisible band round the label)
    const r = how.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    out.hit = [-21, 21].every(d => { const e = document.elementFromPoint(cx, cy + d); return e === how; });
    how.click();
    await wait(150);
    out.open = CardIntro.open && CardIntro.from === 'cards';
    out.screen = Screens.current;
    document.querySelector('#cardIntro .ciX').click();
    await wait(400);
    out.after = { open: CardIntro.open, screen: Screens.current };
    how.click();
    await wait(150);
    return out;
  });
  await p.keyboard.press('Escape');
  await closed(p);
  const esc = await p.evaluate(() => ({ open: CardIntro.open, screen: Screens.current }));
  ck('theCollectionCanBringItBack', a.how === 'How cards work' && a.open && a.screen === 'cards', `${a.how}, open ${a.open}, on ${a.screen}`);
  ck('andItsButtonIs44pxToTouch', a.hit);
  ck('closingItLeavesTheCollection', !a.after.open && a.after.screen === 'cards', JSON.stringify(a.after));
  ck('escapeClosesOnlyTheAnnouncement', !esc.open && esc.screen === 'cards', JSON.stringify(esc));
  await ctx.close();
}

/* ================= THE ERRORS ================= */
ck('noPageErrors', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');

await b.close();
const w = Math.max(...Object.keys(res).map(k => k.length));
for (const k in res) console.log(k.padEnd(w + 2), res[k]);
console.log(fails.length ? `\n${fails.length} FAILURE(S) — ${fails.join(', ')}` : `\nall ${Object.keys(res).length} checks pass`);
process.exit(fails.length ? 1 : 0);
