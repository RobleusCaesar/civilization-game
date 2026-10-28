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
     THE SCREENS       five (cards, earn, play, the tiers, the prizes); NEXT
                       walks them and the last one's call to action closes;
                       BACK, the dots, a swipe and the arrow keys move; Tab
                       never leaves the dialog
     THE FACES         every face is a real catalog card drawn by Deck.face,
                       with its own art and its tier's frame, at whole device
                       pixels; the fan is one of each tier, Legendary centred;
                       the prizes are the Dragon and the Kraken
     THE WORDS         the operator's lines word for word (2026-10-28), every
                       number in the copy the rule's own (the +1 and +2 a win
                       pays, CFG.CARDS.DROPS.hard / PITY, Deck.TIERS), every
                       claim checked against the code that keeps it
                       (Deck.eligible, Deck.great, Deck.settle, Deck.play), and
                       every tier's line backed by cards of that tier; the
                       defeat road carries no meter of deeds or days
     THE FIT           at 390x844, 430x932, 768x1024, 1440x900 and 1920x1080,
                       on every screen: the panel inside the window, nothing of
                       a screen outside its panel, no label running off its
                       line, no caption under a card
     THE MOTION        cards deal in and sparks rise; asking for less motion
                       shows the same screens with nothing animated
     THE COLLECTION    "How cards work" reopens it there, and closing it (or
                       Escape) leaves the collection standing
     THE TIERS         a screen of their own: five rows, Stone first, five
                       identical gems in one column, every name in one column
                       and its rarity on its line, one short line each, nothing
                       colliding, nothing past the panel and no scroll, from
                       320 to 1920px
     THE CHROME        every ornament that is not a card face or the painted
                       backdrop is a vector, or a raster holding 3 image
                       pixels per CSS pixel; nothing is drawn pixelated
     THE PRIZES        the prizes screen draws no beast of its own — no
                       picture over or behind the Kraken's Call and
                       Dragonfire cards but light, no beast strip fetched —
                       and stands still on the panel at every size (no
                       scroll cutting a caption in half)
     THE X             the laurels' leaves stand clear of the close disc on
                       every screen (drawn smaller from their feet, or not at
                       all on the narrowest phone's tightened screens)
     NOTHING STRAY     the sparks rise in the hero's band, never behind the
                       headline, its line or the foot; the tiers' words
                       stand on a dark plate; the motes stay beside their
                       card; a scrolling hero never runs off its sides
     SEVEN TENTHS      a wide window's panel is seven tenths of its old width,
                       its headline seven tenths of its old size, and no
                       taller than seven tenths of its old height unless a
                       card face at the art's own size needs the room (never
                       its old height); a phone's panel is still its screen;
                       and the broken shield is broken, with blood behind it

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

  // five screens, walked by NEXT; the last one's call to action closes
  const walk = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = { pages: document.querySelectorAll('#cardIntro .ciPage').length, seen: [], labels: [], keys: CardIntro.PAGES.slice() };
    for (let i = 0; i < 5; i++) {
      const on = document.querySelector('#cardIntro .ciPage.on');
      out.seen.push(on && on.dataset.page);
      out.labels.push(document.querySelector('#cardIntro .ciNext').textContent.trim());
      out['dots' + i] = [...document.querySelectorAll('#cardIntro .ciDot')].findIndex(d => d.classList.contains('on'));
      // nothing of a hidden screen is reachable
      out['hidden' + i] = [...document.querySelectorAll('#cardIntro .ciPage:not(.on)')].every(s => s.hasAttribute('inert') && s.getAttribute('aria-hidden') === 'true');
      if (i < 4) { document.querySelector('#cardIntro .ciNext').click(); await wait(120); }
    }
    out.backHiddenFirst = null;
    document.querySelector('#cardIntro .ciNext').click();
    await wait(350);
    out.closedByCta = !CardIntro.open;
    return out;
  });
  ck('thereAreFiveScreens', walk.pages === 5 && walk.seen.join() === '0,1,2,3,4' && walk.keys.join() === 'hello,earn,play,tiers,legends',
    `${walk.pages} pages (${walk.keys.join()}), walked ${walk.seen.join()}`);
  ck('theDotsFollow', [0, 1, 2, 3, 4].every(i => walk['dots' + i] === i));
  ck('aHiddenScreenIsInert', [0, 1, 2, 3, 4].every(i => walk['hidden' + i]));
  ck('theLastScreenCallsToAction', /^Next/.test(walk.labels[0]) && /^Next/.test(walk.labels[3]) && /Let.s go/i.test(walk.labels[4]) && walk.closedByCta,
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
    out.beasts = [...root.querySelectorAll('.ciPrize .ccard')].map(f => f.dataset.card);
    // THE WORDS, read off the page
    const txt = sel => [...root.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    out.sub1 = txt('.ciP-hello .ciSub');
    out.earn = txt('.ciP-earn');
    out.earnSub = txt('.ciP-earn .ciSub');
    out.winLine = txt('.ciP-earn .ciRoad.win .ciRoadTx > p:not(.ciGain)');
    out.gain = txt('.ciP-earn .ciGain b');
    out.lossLines = [...root.querySelectorAll('.ciP-earn .ciRoad.loss .ciRoadTx > *')].map(e => e.tagName + ':' + e.textContent.trim());
    out.meters = root.querySelectorAll('.ciP-earn .ciMeter, .ciP-earn .ciPips, .ciP-earn .ciDays, .ciP-earn .ciNote').length;
    out.legendsSub = txt('.ciP-legends .ciSub');
    out.legendsFoot = txt('.ciP-legends .ciFoot');
    out.tiersTxt = txt('.ciP-tiers');
    out.ladder = [...root.querySelectorAll('.ciTiers li')].map(li => li.querySelector('b').textContent + '/' + li.querySelector('small').textContent);
    out.lines = [...root.querySelectorAll('.ciTiers li .ciTd')].map(e => e.textContent);
    const C = CFG.CARDS;
    out.C = { deeds: C.LOSS_DEEDS, days: C.LOSS_DAYS, leg: C.DROPS.hard[4], pity: C.PITY };
    out.tiers = Deck.TIERS.map(t => t.name + '/' + t.rarity);
    // every tier's line is backed by cards of that tier, and says no more than a sentence
    out.backs = Deck.TIERS.map(t => { const L = CardIntro.TIER_LINES[t.k];
      return !L ? t.k + ': no line' : L.backs.filter(id => !Deck.card(id) || Deck.card(id).tier !== t.k).map(id => t.k + ' ' + id).join(',') ||
        (L.line.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length > 1 || L.line.length > 48 ? t.k + ': more than a short sentence' : ''); }).filter(Boolean);
    // the earn counts, through the real grant: an ordinary win pays one card, a hard-fought one two
    const fresh0 = () => { Deck._col = null; Deck._del(Deck.KEY); Deck.col(); };
    fresh0();
    out.one = Deck.settle({ win: true, mode: 'moderate', day: 9999, cause: 'razed_rival_tc', deeds: 0, actDays: 0, key: 'ci-one', runId: null }, () => 0).cards.length;
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
  ck('thePrizesAreTheDragonAndTheKraken', a.beasts.length === 2 && a.beasts.includes('dragonfire') && a.beasts.includes('krakens_call'), a.beasts.join(','));
  ck('theFirstScreenSaysWhatTheOperatorSaid', a.sub1 === 'Win or lose, you’ll earn cards to use in future games.', a.sub1);
  /* the operator's lines (2026-10-28), word for word — "hard-fought" wears
     its hyphen, as the defeat road's own heading always has */
  ck('theEarnScreenSaysWhatTheOperatorSaid', a.earnSub === 'Every victory earns a card, and so do hard-fought losses.' &&
    a.winLine === 'A good win +1 card, a hard-fought win +2 cards.', `${a.earnSub} | ${a.winLine}`);
  ck('theDefeatRoadIsItsHeadingAndOneLine', a.meters === 0 && a.lossLines.join(' | ') === 'H3:A hard-fought defeat | P:Still a card, if you did the work.',
    `${a.meters} meters/notes; ${a.lossLines.join(' | ')}`);
  ck('thePrizesSayWhatTheOperatorSaid', a.legendsSub === 'The harder the fight, the rarer the card.' && !a.legendsFoot, `${a.legendsSub} | foot: ${a.legendsFoot || 'none'}`);
  ck('theEarnCountsAreTheRulesOwn', a.gain === '+1 card | +2 cards' && a.one === 1 && a.two === 2, `${a.gain}; an ordinary win pays ${a.one}, a hard-fought one ${a.two}`);
  ck('theOddsAreTheRulesOwn', a.tiersTxt.includes('1 card in ' + Math.round(100 / a.C.leg)) && a.tiersTxt.includes(a.C.pity + ' wins'),
    a.tiersTxt.slice(0, 400));
  ck('theTiersScreenIsTheTiers', a.ladder.length === 5 && a.ladder.join() === a.tiers.join() && a.lines.length === 5 && a.lines.every(Boolean),
    a.ladder.join(', ') + ' | ' + a.lines.join(' / '));
  ck('everyTiersLineIsItsTiersOwn', a.backs.length === 0, a.backs.join('; ') || 'each line names only cards of its tier, a short sentence each');
  ck('aWinAlwaysEarns', a.anyWin);
  ck('aFoughtDefeatEarnsAndOnlyAFoughtOne', a.fought && !a.tooFewDeeds && !a.tooFewDays, `fought ${a.fought}, a deed short ${a.tooFewDeeds}, a day short ${a.tooFewDays}`);
  ck('aStruckBannerEarnsNothing', a.struck === false);
  ck('aGreatVictoryEarnsTwo', a.greatHard && a.greatWonder && a.greatFast && !a.notGreat && a.two === 2,
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
    for (let i = 0; i < 5; i++) {
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
        const parts = [...pg.querySelectorAll('.ciTitle .ciWord, .ciSub, .ciFoot, .ccard, figcaption, .ciRoad, .ciTiers li, .ciTiers .ciTd, .ciDeckBtn')];
        // a hero measured too tall scrolls inside the panel (_fitPage): its
        // box must stand inside the panel and really scroll; what is inside it
        // is reached by scrolling, not laid over anything
        const scroller = pg.classList.contains('scroll') && pg.querySelector('.ciHero');
        if (scroller) {
          const q = scroller.getBoundingClientRect();
          if (q.top < inner.t - 1 || q.bottom > inner.b + 1) out.push('a scrolling hero past the panel');
          if (!(scroller.scrollHeight > scroller.clientHeight)) out.push('a hero marked scrolling that does not scroll');
          if (getComputedStyle(scroller).overflowY !== 'auto') out.push('a spilling hero that cannot scroll');
          // it scrolls DOWN only: nothing inside runs off its sides, where the
          // clip cuts words in half ("6 DAYS OF ORDE" at 320) and no scroll reaches
          for (const e of scroller.querySelectorAll('h3, p, b, small, figcaption')) {
            const r = e.getBoundingClientRect();
            if (r.width && (r.left < q.left - 1 || r.right > q.right + 1)) out.push(`"${e.textContent.trim().slice(0, 24)}" runs off the side of a scrolling hero`);
          }
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
        for (const el of pg.querySelectorAll('.ccard, figcaption, .ciRoad, .ciTiers, .ciFoot')) {
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
  ck('itFitsEveryWindow', bad.length === 0, bad.slice(0, 8).join(' | ') || 'seven windows, five screens, all inside');
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
    CardIntro.go(CardIntro.PAGES.indexOf('legends'));
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

/* ================= 11. THE TIERS, A SCREEN OF THEIR OWN (operator,
   2026-10-28: "turn the whole tier structure in the middle into it's own
   tutorial screen. Make it clean, well laid out, and easy to read… no more
   than a sentence on what improves at each level") — and before that: "the
   diamonds for the different rarity of card are not level and some of the
   text is jumbled and not on the same line" =================
   Five rows, Stone first: five IDENTICAL gems in one column, every name in
   one column on one line with its rarity on that line or under it, every
   line of what the tier brings in one column (a phone puts it under its
   name), nothing running into anything, the whole list inside the panel,
   and the screen standing still — no scroll — at every size. */
{
  const bad = [], fonts = [];
  for (const [w, h, dpr] of [[320, 568, 2], [375, 667, 2], [390, 844, 3], [430, 932, 3], [768, 1024, 2], [1100, 728, 1.25], [1440, 900, 1], [1920, 1080, 1]]) {
    const ctx = await context({ w, h, dpr, reduce: true });
    const p = await page(ctx, '?cards=all&cardsintro=1');
    await opened(p, 15000);
    const r = await p.evaluate(() => {
      CardIntro.go(CardIntro.PAGES.indexOf('tiers'));
      const root = document.getElementById('cardIntro'), out = { bad: [] };
      const narrow = out.narrow = root.classList.contains('ciNarrow');
      const ol = root.querySelector('.ciPage.on .ciTiers');
      const lis = ol ? [...ol.querySelectorAll('li')] : [];
      if (lis.length !== 5) { out.bad.push(`${lis.length} rows`); return out; }
      const R = e => e.getBoundingClientRect();
      const gems = lis.map(li => R(li.querySelector('.ciGem'))), names = lis.map(li => li.querySelector('b')),
        rars = lis.map(li => li.querySelector('small')), lines = lis.map(li => li.querySelector('.ciTd'));
      const cx = q => q.left + q.width / 2, spread = a => Math.max(...a) - Math.min(...a), fx = a => a.map(v => v.toFixed(1)).join('/');
      if (names[0].textContent !== 'Stone' || names[4].textContent !== 'Enlightenment') out.bad.push(`the rows run ${names.map(n => n.textContent).join(',')}`);
      if (spread(gems.map(q => q.width)) > 0.5 || spread(gems.map(q => q.height)) > 0.5) out.bad.push('gems differ in size ' + fx(gems.map(q => q.width)));
      if (spread(gems.map(cx)) > 0.5) out.bad.push('gems off one column ' + fx(gems.map(cx)));
      if (spread(names.map(e => R(e).left)) > 0.5) out.bad.push('names not in one column ' + fx(names.map(e => R(e).left)));
      if (spread(lines.map(e => R(e).left)) > 0.5) out.bad.push('the lines not in one column ' + fx(lines.map(e => R(e).left)));
      // rows evenly spaced, top to bottom, one after another
      const tops = lis.map(li => R(li).top);
      for (let i = 1; i < 5; i++) if (!(tops[i] > tops[i - 1])) out.bad.push('the rows out of order');
      lis.forEach((li, i) => {
        // each row's gem sits beside its own name, and its line belongs to it
        const L = R(li);
        for (const [e, what] of [[names[i], 'name'], [rars[i], 'rarity'], [lines[i], 'line']]) {
          const q = R(e);
          if (q.top < L.top - 0.5 || q.bottom > L.bottom + 0.5) out.bad.push(`${names[i].textContent}'s ${what} outside its row`);
        }
        if (gems[i].top < L.top - 0.5 || gems[i].bottom > L.bottom + 0.5) out.bad.push(`${names[i].textContent}'s gem outside its row`);
        if (narrow ? R(lines[i]).top < R(names[i]).bottom - 1 : R(lines[i]).left < R(rars[i]).right) out.bad.push(`${names[i].textContent}'s line not ${narrow ? 'under' : 'beside'} its name`);
      });
      // names and rarities on one line each; nothing on anything else
      const boxes = [];
      lis.forEach((li, i) => {
        for (const e of [names[i], rars[i]]) {
          const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
          if (e.getClientRects().length !== 1 || R(e).height > lh * 1.5) out.bad.push(`"${e.textContent}" wraps`);
        }
        for (const e of [names[i], rars[i], lines[i]]) {
          const rg = document.createRange(); rg.selectNodeContents(e);
          boxes.push({ t: e.textContent, q: rg.getBoundingClientRect() });
        }
        boxes.push({ t: names[i].textContent + "'s gem", q: gems[i] });
      });
      for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++) {
        const A = boxes[a].q, B = boxes[c].q;
        const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ix > 0.5 && iy > 0.5) out.bad.push(`"${boxes[a].t}" runs into "${boxes[c].t}"`);
      }
      // inside the panel, the list never overflowing its room, and the screen standing still
      const panel = R(root.querySelector('.ciPanel'));
      for (const x of boxes) if (x.q.left < panel.left + 4 || x.q.right > panel.right - 4) out.bad.push(`"${x.t}" past the panel`);
      if (ol.scrollWidth > ol.clientWidth + 0.5) out.bad.push(`the list overflows (${ol.scrollWidth} > ${ol.clientWidth})`);
      if (root.querySelector('.ciPage.on').classList.contains('scroll')) out.bad.push('the tiers screen has to scroll');
      const foot = R(root.querySelector('.ciPage.on .ciFoot'));
      if (R(ol).bottom > foot.top + 0.5) out.bad.push('the list runs into the odds under it');
      out.font = parseFloat(getComputedStyle(lines[4]).fontSize);
      return out;
    });
    for (const x of r.bad) bad.push(`${w}x${h}: ${x}`);
    if (!(r.font >= 12.5)) bad.push(`${w}x${h}: the lines set at ${r.font}px`);
    fonts.push(`${w}:${r.font}px`);
    await ctx.close();
  }
  ck('theTiersAreLevelAndEasyToRead', bad.length === 0, bad.slice(0, 6).join(' | ') || 'eight windows, five rows in line; lines set at ' + fonts.join(' '));
}

/* ================= 12. THE CHROME IS DRAWN AT THE DEVICE'S RESOLUTION
   (operator ruling: the world's art stays pixel art, but UI chrome —
   ribbons, frames, corner ornaments, laurels, icons, buttons, arrows,
   dividers, badges — is never chunky, never a small pixel-art PNG blown
   up) =================
   Every picture the announcement draws that is not a card face (Deck.face)
   or the painted backdrop (.ciDusk) is chrome. A raster piece of chrome
   must hold at least 3 image pixels per CSS pixel (sharp on a 3x phone);
   a vector passes; and nothing of it is drawn pixelated or crisp-edged. */
{
  const bad = [];
  for (const [w, h, dpr] of [[390, 844, 3], [1440, 900, 1]]) {
    const ctx = await context({ w, h, dpr, reduce: true });
    const p = await page(ctx, '?cards=all&cardsintro=1');
    await opened(p, 15000);
    const r = await p.evaluate(async () => {
      // a computed url() is always quoted, and a vector's data URI carries its own url(#…) INSIDE the quotes
      const URL_RE = /url\(\s*"((?:[^"\\]|\\.)*)"\s*\)|url\(\s*([^"\s)][^)]*)\)/g;
      const root = document.getElementById('cardIntro'), out = [], seen = new Map();
      const natural = u => seen.get(u) || seen.set(u, new Promise(res => {
        const im = new Image();
        im.onload = () => res([im.naturalWidth, im.naturalHeight]);
        im.onerror = () => res(null);
        im.src = u;
      })).get(u);
      const vector = u => /^data:image\/svg\+xml/i.test(u) || /\.svg(\?|#|$)/i.test(u);
      for (let pg = 0; pg < CardIntro.PAGES.length; pg++) {
        CardIntro.go(pg);
        for (const el of [root, ...root.querySelectorAll('*')]) {
          if (el.closest('.ccard') || el.closest('.ciDusk') || !el.getClientRects().length) continue;
          const name = (el.getAttribute('class') || el.tagName).toString().split(' ')[0];
          const box = el.getBoundingClientRect();
          const own = getComputedStyle(el);
          if (/pixelated|crisp-edges|optimizespeed/i.test(own.imageRendering)) out.push(`screen ${pg + 1}: ${name} is drawn ${own.imageRendering}`);
          if (el instanceof SVGElement && /crispedges|optimizespeed/i.test(el.getAttribute('shape-rendering') || own.shapeRendering || '')) out.push(`screen ${pg + 1}: ${name} is drawn crisp-edged`);
          if (/^(IMG|CANVAS|VIDEO)$/.test(el.tagName)) out.push(`screen ${pg + 1}: a ${el.tagName} in the chrome`);
          for (const pseudo of [null, '::before', '::after']) {
            const cs = pseudo ? getComputedStyle(el, pseudo) : own;
            if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
            const urls = [];
            for (const prop of ['backgroundImage', 'maskImage', 'webkitMaskImage', 'borderImageSource', 'listStyleImage'])
              for (const m of String(cs[prop] || '').matchAll(URL_RE)) urls.push(m[1] != null ? m[1] : m[2]);
            for (const u of urls) {
              if (vector(u)) continue;
              const nat = await natural(u);
              if (!nat) { out.push(`screen ${pg + 1}: ${name}${pseudo || ''} draws an image that never loads`); continue; }
              let dw = pseudo ? parseFloat(cs.width) || box.width : box.width, dh = pseudo ? parseFloat(cs.height) || box.height : box.height;
              const bs = String(cs.backgroundSize || '').split(',')[0].trim().split(/\s+/);
              if (/px$/.test(bs[0])) dw = parseFloat(bs[0]);
              if (/px$/.test(bs[1] || '')) dh = parseFloat(bs[1]);
              if (nat[0] < dw * 3 - 0.5 || nat[1] < dh * 3 - 0.5)
                out.push(`screen ${pg + 1}: ${name}${pseudo || ''} ${u.split('/').pop().split('?')[0]} is ${nat[0]}x${nat[1]} drawn at ${dw.toFixed(0)}x${dh.toFixed(0)} CSS px (needs ${Math.ceil(dw * 3)}x${Math.ceil(dh * 3)})`);
            }
          }
        }
      }
      return out;
    });
    for (const x of r) bad.push(`${w}x${h} ${x}`);
    await ctx.close();
  }
  ck('theChromeIsDrawnAtTheDevicesResolution', bad.length === 0, [...new Set(bad)].slice(0, 6).join(' | ') || 'every ornament a vector or 3x its CSS size; nothing pixelated');
}

/* ================= 13. THE PRIZES WEAR NO BEAST (operator: "you placed
   the kraken and dragon cards but also the kraken behind the card and a
   second dragon on top of the card") =================
   The Kraken's Call and Dragonfire paintings already show the beast. The
   prizes screen's hero (the cards and all round them — the head's chrome
   is section 12's) draws no picture of its own — no strip, no image,
   nothing behind or over a card but light — no beast's strip is ever
   fetched, and the two cards stand whole. */
{
  const ctx = await context({ w: 1440, h: 900, dpr: 1, reduce: true });
  const p = await page(ctx, '?cards=all&cardsintro=1');
  await opened(p, 15000);
  const a = await p.evaluate(() => {
    CardIntro.go(CardIntro.PAGES.indexOf('legends'));
    const URL_RE = /url\(\s*"((?:[^"\\]|\\.)*)"\s*\)|url\(\s*([^"\s)][^)]*)\)/g;
    const pg = document.querySelector('#cardIntro .ciPage.on .ciHero'), out = { pics: [], faces: [] };
    for (const el of [pg, ...pg.querySelectorAll('*')]) {
      if (el.closest('.ccard')) continue;
      if (/^(IMG|CANVAS|VIDEO)$/.test(el.tagName)) out.pics.push(el.tagName);
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        for (const m of String(cs.backgroundImage + ' ' + cs.maskImage).matchAll(URL_RE)) {
          const u = m[1] != null ? m[1] : m[2];
          if (!/^data:image\/svg\+xml/i.test(u)) out.pics.push(((el.getAttribute('class') || el.tagName) + (pseudo || '')) + ' ' + u.split('/').pop().split('?')[0]);
        }
      }
    }
    out.faces = [...pg.querySelectorAll('.ccard')].map(f => f.dataset.card);
    out.strips = typeof CardIntro.BEASTS !== 'undefined';
    return out;
  });
  await sleep(600);   // the next screen's art is fetched behind the one on show: give it the time
  const strips = p.__reqs.filter(u => /assets\/fx\/(kraken|dragon)-/.test(u)).map(u => u.split('/').pop().split('?')[0]);
  ck('thePrizesWearNoBeast', a.pics.length === 0 && !a.strips && !strips.length && a.faces.sort().join() === 'dragonfire,krakens_call',
    [...a.pics, ...strips.map(x => 'fetched ' + x)].slice(0, 4).join(', ') || `only the two faces (${a.faces.join(',')}), no strip fetched`);
  await ctx.close();
}

/* ================= 14. THE X STANDS CLEAR OF THE LAURELS =================
   On a phone a two-line headline pushes its laurels out to the panel's
   edges, and the right one's leaves rose into the close disc. On every
   screen, at every size, the laurels' leaves (the drawn box less 15% each
   side: the drawing's own reach) stand clear of the disc's gold ring (17px
   and its 2px rim); the two laurels are one size; and a laurel is drawn at
   60% or more, or not at all. */
{
  const bad = [];
  for (const [w, h, dpr] of [[320, 568, 2], [375, 667, 2], [390, 844, 3], [430, 932, 3], [768, 1024, 2], [1440, 900, 1]]) {
    const ctx = await context({ w, h, dpr, reduce: true });
    const p = await page(ctx, '?cards=all&cardsintro=1');
    await opened(p, 15000);
    const r = await p.evaluate(() => {
      const out = [], root = document.getElementById('cardIntro');
      for (let i = 0; i < CardIntro.PAGES.length; i++) {
        CardIntro.go(i);
        const X = root.querySelector('.ciX').getBoundingClientRect(), cx = X.left + X.width / 2, cy = X.top + X.height / 2;
        const els = [...root.querySelectorAll('.ciPage.on .ciLaurel')], qs = els.map(e => e.getBoundingClientRect());
        qs.forEach((q, j) => {
          if (q.width < 0.5) return;   // not drawn
          const full = els[j].offsetHeight;
          if (q.height < full * 0.6 - 0.5) out.push(`screen ${i + 1}: a laurel drawn at ${Math.round(q.height / full * 100)}%`);
          const ix = q.width * 0.15, nx = Math.max(q.left + ix, Math.min(cx, q.right - ix)), ny = Math.max(q.top, Math.min(cy, q.bottom));
          const d = Math.hypot(cx - nx, cy - ny);
          if (d < 19 + 1) out.push(`screen ${i + 1}: a laurel's leaves ${d.toFixed(1)}px from the X's centre (its ring reaches 19)`);
        });
        if (qs.length === 2 && Math.abs(qs[0].height - qs[1].height) > 0.5) out.push(`screen ${i + 1}: the laurels differ (${qs[0].height.toFixed(1)} / ${qs[1].height.toFixed(1)})`);
      }
      return out;
    });
    for (const x of r) bad.push(`${w}x${h} ${x}`);
    await ctx.close();
  }
  ck('theXStandsClearOfTheLaurels', bad.length === 0, bad.slice(0, 6).join(' | ') || 'six windows, five screens: every laurel clear of the close disc');
}

/* ================= 15. NOTHING STRAY IN THE WORDS =================
   The sparks rise BEHIND the screens, so one passing behind a line of
   small type showed in the gaps between its letters and read as a stray
   mark ("Uncommo•", "Ha•rd", "ARMİES"). Their field is the hero's own band
   — never the headline, the line under it or the foot — with a hole cut
   round every caption and the ladder inside it; the ladder's words stand on
   a dark plate (alpha .8 or more, its solid core under every word); and a
   prize's motes never rise above its card, where a phone's ladder stands.
   With motion on: the sparks must exist to be measured. */
{
  const bad = [];
  for (const [w, h, dpr] of [[320, 568, 2], [390, 844, 3], [768, 1024, 2], [1440, 900, 1]]) {
    const ctx = await context({ w, h, dpr });
    const p = await page(ctx, '?cards=all&cardsintro=1');
    await opened(p, 15000);
    const r = await p.evaluate(async () => {
      const out = [], root = document.getElementById('cardIntro'), R = e => e.getBoundingClientRect();
      const meet = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 0.5 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 0.5;
      for (let i = 0; i < CardIntro.PAGES.length; i++) {
        CardIntro.go(i);
        await new Promise(res => setTimeout(res, 80));
        const field = R(root.querySelector('.ciSparks'));
        if (!(field.height > 20)) out.push(`screen ${i + 1}: no room for the sparks`);
        for (const e of root.querySelectorAll('.ciPage.on .ciWord, .ciPage.on .ciSub, .ciPage.on .ciFoot'))
          for (const q of e.getClientRects()) if (meet(field, q)) { out.push(`screen ${i + 1}: the sparks rise behind "${e.textContent.trim().slice(0, 24)}"`); break; }
        // inside the hero, every word the field reaches stands in a hole cut out of it
        // (read at rest: every entrance run to its end, the panel's own included)
        for (const a of root.getAnimations({ subtree: true })) if (isFinite(a.effect.getComputedTiming().endTime)) a.finish();
        const sp = root.querySelector('.ciSparks'), F = R(sp);
        if (getComputedStyle(sp).visibility === 'hidden') continue;   // a scrolling screen shows no sparks
        const holes = [...String(getComputedStyle(sp).clipPath).matchAll(/M\s*([\d.]+)[\s,]+([\d.]+)\s*H\s*([\d.]+)\s*V\s*([\d.]+)\s*H\s*[\d.]+\s*Z/gi)]
          .slice(1).map(m => ({ l: F.left + +m[1], t: F.top + +m[2], r: F.left + +m[3], b: F.top + +m[4] }));
        // the words themselves (a range over the text, not the box round it):
        // every caption, and every name and rarity on the ladder
        for (const e of root.querySelectorAll('.ciPage.on .ciHero figcaption, .ciPage.on .ciHero .ciTiers b, .ciPage.on .ciHero .ciTiers small, .ciPage.on .ciHero .ciTiers .ciTd')) {
          const rg = document.createRange();
          rg.selectNodeContents(e);
          const w = rg.getBoundingClientRect();
          if (!w.width || !meet(F, w)) continue;
          // only the part of the word the field reaches can have a spark behind it
          const q = { left: Math.max(w.left, F.left), right: Math.min(w.right, F.right), top: Math.max(w.top, F.top), bottom: Math.min(w.bottom, F.bottom) };
          if (!holes.some(h => q.left >= h.l - 1 && q.right <= h.r + 1 && q.top >= h.t - 1 && q.bottom <= h.b + 1))
            out.push(`screen ${i + 1}: the sparks rise behind "${e.textContent.trim().slice(0, 24)}"`);
        }
      }
      // the tiers' plate: dark enough, and its solid core under every word
      // (read where the rows come to rest: their entrance is run to its end)
      CardIntro.go(CardIntro.PAGES.indexOf('tiers'));
      for (const a of root.querySelector('.ciPage.on').getAnimations({ subtree: true }))
        if (isFinite(a.effect.getComputedTiming().endTime)) a.finish();
      const ol = root.querySelector('.ciPage.on .ciTiers'), cs = getComputedStyle(ol, '::before');
      const m = (cs.backgroundColor || '').match(/rgba?\(([^)]+)\)/), parts = m ? m[1].split(',').map(parseFloat) : [];
      const alpha = parts.length === 4 ? parts[3] : parts.length === 3 ? 1 : 0;
      if (cs.content === 'none' || cs.display === 'none' || alpha < 0.8) out.push(`the tiers stand on no plate (alpha ${alpha})`);
      else {
        // the solid core is the plate's own box (its soft edge lies outside it)
        const o = R(ol), core = { left: o.left + parseFloat(cs.left), right: o.right - parseFloat(cs.right), top: o.top + parseFloat(cs.top), bottom: o.bottom - parseFloat(cs.bottom) };
        for (const e of ol.querySelectorAll('b, small, .ciTd')) {
          const q = R(e);
          if (q.left < core.left - 1 || q.right > core.right + 1 || q.top < core.top - 1 || q.bottom > core.bottom + 1)
            out.push(`"${e.textContent}" past the plate's solid core`);
        }
      }
      // the motes, sampled through their whole cycle, never above their card
      CardIntro.go(CardIntro.PAGES.indexOf('legends'));
      const anims = document.getAnimations().filter(a => a.animationName === 'ciRiseMote');
      if (!anims.length) out.push('no motes round the prizes');
      for (let k = 0; k < 30; k++) {
        for (const a of anims) { a.pause(); a.currentTime = k * 173; }
        for (const st of root.querySelectorAll('.ciPage.on .ciStage')) {
          const top = R(st).top;
          for (const mo of st.querySelectorAll('.ciMotes i'))
            if (parseFloat(getComputedStyle(mo).opacity) > 0.05 && R(mo).top < top - 1) { out.push(`a mote above its card (${(top - R(mo).top).toFixed(1)}px)`); k = 99; break; }
        }
      }
      return [...new Set(out)];
    });
    for (const x of r) bad.push(`${w}x${h} ${x}`);
    await ctx.close();
  }
  ck('nothingStrayInTheWords', bad.length === 0, bad.slice(0, 6).join(' | ') || 'the sparks in the hero alone, the tiers on their plate, the motes beside their cards');
}

/* ================= 16. SEVEN TENTHS (operator, 2026-10-28, on a laptop at
   125%: "Shrink all tutorial screens by 30%. They are too large right now")
   =================
   A wide window's panel is seven tenths of the 880px it was, its headline
   seven tenths of what it was set at, and it is no taller than seven tenths
   of its old 770px — unless a card face drawn at the art's own size (never
   smaller: below it the painting's pixels go) needs the room, and never its
   old height. No screen scrolls. A card face is whole device pixels and not
   under the art's size on a wide panel. A phone's panel is still its
   screen. And the defeat road's shield is broken, with blood behind it. */
{
  const bad = [], seen = [];
  for (const [w, h, dpr] of [[1100, 728, 1.25], [1366, 768, 1], [1440, 900, 1], [1920, 1080, 1], [1440, 900, 2], [768, 1024, 2], [390, 844, 3]]) {
    const ctx = await context({ w, h, dpr, reduce: true });
    const p = await page(ctx, '?cards=all&cardsintro=1');
    await opened(p, 15000);
    const r = await p.evaluate(() => {
      const root = document.getElementById('cardIntro'), out = { bad: [] };
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const panel = root.querySelector('.ciPanel').getBoundingClientRect();
      out.panel = [Math.round(panel.width), Math.round(panel.height)];
      out.narrow = root.classList.contains('ciNarrow');
      if (out.narrow) {
        if (panel.width < vw - 24) out.bad.push(`a phone's panel ${panel.width | 0}px in a ${vw}px window`);
        return out;
      }
      if (panel.width > 880 * 0.7 + 0.5) out.bad.push(`the panel ${panel.width.toFixed(1)}px wide (seven tenths is ${880 * 0.7})`);
      if (panel.height > 770 * 0.85) out.bad.push(`the panel ${panel.height.toFixed(1)}px tall`);
      let under = false;
      for (let i = 0; i < CardIntro.PAGES.length; i++) {
        CardIntro.go(i);
        const pg = root.querySelector('.ciPage.on');
        if (pg.classList.contains('scroll')) out.bad.push(`${CardIntro.PAGES[i]} has to scroll`);
        // the headline at seven tenths of the old rule's size (or less, where its screen is tightened)
        const word = pg.querySelector('.ciWord'), fz = parseFloat(getComputedStyle(word).fontSize);
        const old = { hello: [38, 12, 10, 100], earn: [34, 8.6, 8.4, 84], play: [34, 8.6, 8.4, 84], tiers: [34, 8.6, 8.4, 84], legends: [30, 7.4, 7.4, 70] }[CardIntro.PAGES[i]];
        const was = Math.max(old[0], Math.min(old[1] * 8.8, old[2] * vh / 100, old[3]));
        if (fz > was * 0.7 + 0.5) out.bad.push(`${CardIntro.PAGES[i]}'s headline ${fz}px (seven tenths of ${was.toFixed(1)} is ${(was * 0.7).toFixed(1)})`);
        // a face's own width (the fan scales and tilts its slots by transform, by design)
        for (const f of pg.querySelectorAll('.ccard')) {
          const w = parseFloat(f.style.getPropertyValue('--w')), k = w * devicePixelRatio / Deck.W;
          if (Math.abs(k - Math.round(k)) > 0.01) out.bad.push(`${f.dataset.card} at ${k.toFixed(2)} device pixels to an art pixel`);
          if (w * devicePixelRatio < Deck.W - 0.5) out.bad.push(`${f.dataset.card} under the art's own size`);
          if (w < Deck.W - 0.5) under = true;
        }
      }
      // with every face under the art's size in CSS pixels (a 125% laptop), the panel keeps to about seven tenths of its old height
      // (a few pixels more where the fan's tilted outer cards hang below its box)
      if (under && panel.height > 770 * 0.73) out.bad.push(`the panel ${panel.height | 0}px tall with the faces at their smallest`);
      return out;
    });
    for (const x of r.bad) bad.push(`${w}x${h}@${dpr}: ${x}`);
    seen.push(`${w}x${h}@${dpr} ${r.panel.join('x')}`);
    await ctx.close();
  }
  // the broken shield, with blood splattered behind it
  const ctx = await context({ reduce: true });
  const p = await page(ctx, '?cards=1');
  const sh = await p.evaluate(() => {
    const svg = CardIntro.SVG.fight();
    const halves = [...svg.matchAll(/<g transform='translate\([^)]*\) rotate\((-?[\d.]+) [^)]*\)'><g clip-path='url\(#h([lr])\)'>/g)].map(m => [m[2], +m[1]]);
    const splash = /<path d='M[^']+Z' fill='url\(#bp\)'/.test(svg) && /id='bp'[^>]*>(<stop[^>]*stop-color='#[5-c][0-9a-f][01][0-9a-f]{3}'\/>){3}/.test(svg);
    return { halves, splash, drops: (svg.match(/<ellipse [^>]*fill='url\(#bl\)'/g) || []).length };
  });
  await ctx.close();
  const broken = sh.halves.length === 2 && sh.halves.some(([s, r]) => s === 'l' && r < 0) && sh.halves.some(([s, r]) => s === 'r' && r > 0);
  ck('aWidePanelIsSevenTenths', bad.length === 0, bad.slice(0, 6).join(' | ') || seen.join(', '));
  ck('theDefeatShieldIsBrokenWithBloodBehindIt', broken && sh.splash && sh.drops >= 20,
    `halves ${JSON.stringify(sh.halves)}, a crimson splash ${sh.splash}, ${sh.drops} drops`);
}

/* ================= THE ERRORS ================= */
ck('noPageErrors', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');

await b.close();
const w = Math.max(...Object.keys(res).map(k => k.length));
for (const k in res) console.log(k.padEnd(w + 2), res[k]);
console.log(fails.length ? `\n${fails.length} FAILURE(S) — ${fails.join(', ')}` : `\nall ${Object.keys(res).length} checks pass`);
process.exit(fails.length ? 1 : 0);
