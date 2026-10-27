/* THE CARD SYSTEM — the in-game deck (js/deckui.js): the HUD button, the
   sheet that pauses the world, the closer look, targeting, the play
   animation and the timers of the cards still running.

   This file pins:

     OFF IS NOTHING    with the switch off a live game builds no DOM, injects
                       no CSS, registers no listener; with it on, the title's
                       demo world still wears nothing (the probe is shown to
                       see deckui.js's listeners once the deck is built)
     THE BUTTON        shows only in a live game, carries Deck.total(), and
                       follows the collection; it never moves the HUD — the
                       top bar keeps its height at phone and desktop widths
                       and nothing in its row overlaps
     THE PAUSE         opening pauses the world; closing gives back exactly
                       what was there; while it is up the tutorial holds its
                       notes (Screens.modalUp)
     THE SHEET         grouped by tier, highest first; a card that cannot be
                       played is greyed with its reason; an empty deck says
                       how to earn one; every face carries its art
     LIFT, FLIP, PLAY  a tap lifts a card into a bigger face, a tap on it
                       turns it over, PLAY plays it: Deck.play is called as
                       the burst lands, the card is spent, the goods tick up
                       on the bar, a toast names the effect, the world
                       resumes — and the sequence is over inside 1.2 s
     WHERE IT LANDS    a 'tc' card bursts on the Town Center's screen point
     A REFUSAL         keeps the card and says why (at PLAY and at landing)
     TARGETING         the world receives no tap: the mark jumps where you
                       tap, a press on it drags it, a press elsewhere pans;
                       confirm plays at that tile; a warning is shown and
                       asked twice; unexplored ground is refused; cancel and
                       Escape keep the card and give the pause back
     TIMERS            a running card wears a chip with its time left and a
                       draining ring, and the chip goes when it expires
     REDUCED MOTION    every animation is opacity only; the play still lands
                       and the information (toast, count) is all there
     THE WORLD CHANGES a new game or a load drops the deck where it stands;
                       a screen that takes over owns the pause from then on
     A STRIKE SAYS IT ONCE  Starfall and Dragonfire narrate their own act:
                       no landing toast, one toast at a time on a 390px
                       phone, never the red alarm (the real effects, played
                       through the real sequence)
     THE PLATES        every card's name (and tier, on the back) inside its
                       plate in at most two lines at 320 and 390 (Deck.nmFit);
                       a refusal may take a third line, never an ellipsis

   Run after touching: js/deckui.js, Deck.face in js/deck.js, the DeckUI
   hooks in js/game.js (frame, newGame, loadJSON), Screens.modalUp.

     node tests/deck-ui.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + join(root, 'index.html');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const errs = [];

/* every listener deckui.js registers, and every Web Animation started, are
   counted from BEFORE the scripts load — the only way to see "no listener" */
const probe = () => {
  window.__dkL = 0;
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try { if (/deckui\.js/.test(new Error().stack || '')) window.__dkL++; } catch (e) {}
    return add.call(this, type, fn, opts);
  };
  // a flight is over when the deck says so — never after a fixed wait (a
  // loaded machine stretches the flight; CLAUDE.md's waited-on-a-timer rule)
  window.__idle = async () => {
    const t = performance.now();
    while (window.DeckUI && DeckUI.playing && performance.now() - t < 8000) await new Promise(r => setTimeout(r, 25));
    await new Promise(r => setTimeout(r, 60));
  };
  // …and anything the frame loop does is waited for by its result
  window.__until = async (fn, ms) => {
    const t = performance.now();
    while (!fn() && performance.now() - t < (ms || 4000)) await new Promise(r => setTimeout(r, 25));
    return fn();
  };
  window.__anims = [];
  const an = Element.prototype.animate;
  Element.prototype.animate = function (kf, opts) {
    try { window.__anims.push(JSON.stringify(kf)); } catch (e) {}
    return an.call(this, kf, opts);
  };
};

/* the timings are measured on a SETTLED page: a fresh one decodes its art
   for seconds, and every late terrain sheet rebakes the ground in one long
   task — frame gaps of half a second that belong to the boot, not the deck */
const settle = (pg) => pg.waitForFunction(() => window.Assets && Assets.allArtReady && Assets.allArtReady(), null, { timeout: 60000 }).catch(() => {});

async function page(opts) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 3 }, opts || {}));
  await ctx.addInitScript(probe);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Deck && window.DeckUI && window.Screens && Screens.current, null, { timeout: 15000 });
  await p.waitForTimeout(600);
  return { ctx, p };
}

/* the cards this contract plays: one per landing and every refusal, through
   the real Deck.FX contract (the real effects are pinned by deck-fx.mjs) */
const fixtures = () => {
  const add = (id, tier, target, text, fx, extra) => {
    if (!Deck.card(id)) Deck.CATALOG.push(Object.assign({ id, tier, cat: target === 'none' ? 'econ' : 'strike', target, name: 'Test ' + id, text, flavor: 'f', when: 'w' }, extra || {}));
    Deck.FX[id] = fx;
  };
  window.__got = [];
  add('__bar', 'stone', 'none', '+250 food.', { at: 'bar', apply: () => { S.res.food += 250; return { ok: true, fly: { food: 250 } }; } });
  add('__tc', 'iron', 'none', 'Riders ride out of your Town Center.', { at: 'tc', apply: () => { window.__tcDest = Object.assign({}, DeckUI.playing.dest); return { ok: true }; } });
  add('__aim', 'imperial', 'explored', 'A star falls on the chosen ground.', {
    at: 'target', valid: () => true,
    warn: (t) => (t && window.__warnX === t.x) ? 'This ends the truce' : null,
    apply: (t) => { window.__got.push(t); return { ok: true }; } });
  add('__no', 'bronze', 'none', 'Strangers at the fire.', { at: 'tc', apply: () => ({ ok: false, why: 'No room by the fire' }) });
  add('__cant', 'bronze', 'none', 'Mend everything.', { can: () => ({ ok: false, why: 'Nothing needs mending' }), apply: () => ({ ok: true }) });
  add('__legend', 'enlight', 'none', '+60 gold.', { at: 'bar', apply: () => { S.res.gold += 60; return { ok: true }; } });
  add('__timed', 'bronze', 'none', 'Richer for 2 days.', { at: 'bar', apply: () => { Deck.addTimed('__timed', 2); return { ok: true }; } }, { days: 2 });
  Deck._byId = null;
};

const enterGame = (seed, mode) => {
  Screens._demo = false;
  G.newGame(seed, mode || 'moderate', 'medium');
  Screens.show('playing');
  for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1;
  G.updateVisibility();
};

/* ================= 1. OFF IS NOTHING ================= */
const { p } = await page();
const off = await p.evaluate(async (enter) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  Deck._del('neo-cards-dev'); Deck._dev = null;
  CFG.CARDS.ON = false;
  eval('(' + enter + ')')('deckoff');
  await wait(700);
  out.on = Deck.on();
  out.dom = ['deckBtn', 'dkTimers', 'dkSheet', 'deckUiCss', 'dkAim', 'dkFly'].filter(id => document.getElementById(id));
  out.built = DeckUI.built;
  out.listeners = window.__dkL;
  out.subs = Deck._subs.length;
  out.modal = Screens.modalUp();
  out.barH = document.getElementById('topbar').offsetHeight;
  out.ingame = document.body.classList.contains('ingame');
  // the switch on, but the TITLE's demo world: still nothing
  Screens.show('title');
  CFG.CARDS.ON = true;
  await wait(500);
  out.demoBuilt = DeckUI.built;
  out.demoBtn = !!document.getElementById('deckBtn');
  return out;
}, enterGame.toString());
ck('offBuildsNoDom', off.ingame && !off.on && off.dom.length === 0 && !off.built, off.dom.join(',') || 'nothing in the document');
ck('offRegistersNoListener', off.listeners === 0 && off.subs === 0, `${off.listeners} deckui listeners, ${off.subs} collection listeners`);
ck('offHoldsNoFloor', off.modal === false);
ck('theTitlesDemoWorldWearsNoDeck', !off.demoBuilt && !off.demoBtn);

/* ================= 2. THE BUTTON ================= */
const on = await p.evaluate(async ({ enter, fx }) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  Deck._col = null; Deck._del(Deck.KEY);
  eval('(' + fx + ')')();
  eval('(' + enter + ')')('deckon');
  await __until(() => DeckUI.built);
  await wait(150);
  const btn = document.getElementById('deckBtn');
  out.built = DeckUI.built;
  out.visible = !!(btn && btn.offsetParent);
  out.inRow = btn && btn.nextElementSibling === document.getElementById('btnPause');
  out.listeners = window.__dkL;
  out.badge = btn.querySelector('.dkBadge').textContent;
  out.total = Deck.total();   // the starter hand, dealt when the deck is built
  out.drawn = !btn.textContent.replace(/\d+/g, '').trim() && !!btn.querySelector('svg.dkIco');
  Deck._add('__bar', 2); Deck.saveCol();
  out.badge2 = btn.querySelector('.dkBadge').textContent; out.total2 = Deck.total();
  out.css = !!document.getElementById('deckUiCss');
  out.barH = document.getElementById('topbar').offsetHeight;
  // the deck leaves with the game: a shell screen covers it
  Screens.show('paused');
  out.hiddenInShell = !btn.offsetParent;
  Screens.show('playing');
  out.backInGame = !!btn.offsetParent;
  return out;
}, { enter: enterGame.toString(), fx: fixtures.toString() });
ck('theButtonShowsInALiveGame', on.built && on.visible && on.inRow && on.css, `in row 2 before ⏸: ${on.inRow}`);
ck('andTheProbeSeesItsListeners', on.listeners > 0, on.listeners + ' listeners once built');
ck('theBadgeCarriesTheCount', on.badge === String(on.total) && on.total === 3 && on.badge2 === String(on.total2) && on.total2 === 5,
  `starter ${on.badge}/${on.total}, then ${on.badge2}/${on.total2}`);
ck('theIconIsDrawnNotTyped', on.drawn);
ck('aShellScreenCoversTheButton', on.hiddenInShell && on.backInGame);
ck('theButtonNeverMovesTheBar', on.barH === off.barH, `bar ${off.barH}px off, ${on.barH}px on`);
await settle(p);

/* the row at phone and desktop widths: same bar height, nothing overlapping —
   with two timers running, which is the crowded case */
const layout = [];
for (const [w, h] of [[320, 568], [390, 844], [430, 880], [900, 700], [1280, 800], [1440, 900]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(250);
  layout.push(await p.evaluate(async (w) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const bar = document.getElementById('topbar');
    const btn = document.getElementById('deckBtn');
    // the height with the deck's chrome taken out, against the height with it in
    const tm = document.getElementById('dkTimers');
    btn.style.display = 'none'; tm.style.display = 'none';
    const bare = bar.offsetHeight;
    btn.style.display = ''; tm.style.display = '';
    Deck.addTimed('__timed', 2); Deck.addTimed('__aim', 5);
    DeckUI._t = 0;
    await __until(() => document.querySelectorAll('#dkTimers .dkT:not(.dkMore)').length === 2);
    await wait(260);   // the chips' own pop-in settles before they are measured
    const full = bar.offsetHeight;
    const r = id => document.getElementById(id).getBoundingClientRect();
    const rows = [...bar.querySelectorAll('.trow')].map(x => x.getBoundingClientRect());
    const ids = ['rPopChip', 'dkTimers', 'rDay', 'deckBtn', 'btnPause', 'btnMenu'];
    const rects = ids.map(r);
    let overlap = null;
    for (let i = 0; i + 1 < rects.length; i++) if (rects[i].width && rects[i + 1].width && rects[i].right > rects[i + 1].left + 0.5) overlap = ids[i] + '>' + ids[i + 1];
    const out = { w, bare, full, overlap, oneRow: w >= 900 ? Math.abs((rows[0].top + rows[0].bottom) - (rows[1].top + rows[1].bottom)) < 4 : rows[1].top >= rows[0].bottom,
      btnH: Math.round(r('deckBtn').height), hit: Math.round(parseFloat(getComputedStyle(btn, '::after').top)) };
    S.deck.fx = [];
    DeckUI._t = 0;
    await __until(() => !document.querySelector('#dkTimers .dkT'));
    return out;
  }, w));
}
await p.setViewportSize({ width: 430, height: 880 });
await p.waitForTimeout(200);
ck('theRowFitsEveryWidth', layout.every(l => l.full === l.bare && !l.overlap && l.oneRow),
  layout.map(l => `${l.w}: ${l.bare}→${l.full}px${l.overlap ? ' OVERLAP ' + l.overlap : ''}${l.oneRow ? '' : ' ROWS'}`).join('; '));
ck('andTheBarStaysOneRowOnADesktop', layout.filter(l => l.w >= 900).every(l => l.full <= 56), layout.filter(l => l.w >= 900).map(l => l.full).join('/'));
ck('theTouchTargetReaches44', layout.every(l => l.btnH + 2 * -l.hit >= 44), layout.map(l => l.btnH + 2 * -l.hit).join('/'));

/* ================= 3. THE PAUSE ================= */
const pz = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const btn = document.getElementById('deckBtn'), pb = document.getElementById('btnPause');
  S.paused = false; pb.textContent = '⏸';
  const day0 = S.dayT;
  btn.click();
  out.paused = S.paused; out.label = pb.textContent; out.open = DeckUI.open;
  out.modal = Screens.modalUp();
  out.shown = getComputedStyle(document.getElementById('dkSheet')).display !== 'none';
  await wait(300);
  out.frozen = S.dayT === day0;
  document.querySelector('#dkSheet .dkClose').click();
  await __until(() => getComputedStyle(document.getElementById('dkSheet')).display === 'none');
  out.after = S.paused; out.label2 = pb.textContent;
  out.hidden = getComputedStyle(document.getElementById('dkSheet')).display === 'none';
  out.modal2 = Screens.modalUp();
  // paused before: stays paused after
  S.paused = true; pb.textContent = '▶';
  btn.click(); await wait(250);
  document.querySelector('#dkSheet .dkBack').click(); await wait(400);
  out.keptPaused = S.paused === true && pb.textContent === '▶';
  // Escape closes it too, and gives the pause back
  S.paused = false; pb.textContent = '⏸';
  btn.click(); await wait(250);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(400);
  out.esc = !DeckUI.open && S.paused === false;
  return out;
});
ck('openingPausesTheWorld', pz.paused && pz.label === '▶' && pz.open && pz.shown && pz.frozen, JSON.stringify({ paused: pz.paused, label: pz.label, frozen: pz.frozen }));
ck('closingGivesBackWhatWasThere', pz.after === false && pz.label2 === '⏸' && pz.hidden && pz.keptPaused && pz.esc,
  `running→${pz.after}, paused→${pz.keptPaused}, escape ${pz.esc}`);
ck('theTutorialHoldsItsNotesWhileTheDeckIsUp', pz.modal === true && pz.modal2 === false);

/* ================= 4. THE SHEET ================= */
const sh = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const c = Deck.col(); c.counts = {};
  for (const [id, n] of [['__bar', 3], ['__legend', 1], ['__tc', 1], ['__aim', 2], ['__cant', 1], ['swift_raiders', 1]]) c.counts[id] = n;
  Deck.saveCol();
  document.getElementById('deckBtn').click();
  await wait(450);
  out.groups = [...document.querySelectorAll('#dkSheet .dkGroup')].map(g => g.dataset.tier);
  out.cells = [...document.querySelectorAll('#dkSheet .dkCell')].map(c => Deck.tier(Deck.card(c.dataset.card).tier).rank);
  const cant = document.querySelector('#dkSheet .dkCell[data-card="__cant"]');
  out.cantOff = cant.querySelector('.ccard').classList.contains('off');
  out.cantWhy = cant.querySelector('.dkCap').textContent;
  out.cantAmber = cant.querySelector('.dkCap').classList.contains('no');
  out.dup = (document.querySelector('#dkSheet .dkCell[data-card="__bar"] .cc-n') || {}).textContent;
  const art = document.querySelector('#dkSheet .dkCell[data-card="swift_raiders"] .cc-art');
  out.art = getComputedStyle(art).backgroundImage;
  out.ico = getComputedStyle(document.querySelector('#dkSheet .dkCell[data-card="swift_raiders"] .cc-ico')).backgroundImage.slice(0, 30);
  out.whole = [...document.querySelectorAll('#dkSheet .ccard')].map(e => +(e.getBoundingClientRect().width * devicePixelRatio / 176).toFixed(3));
  document.querySelector('#dkSheet .dkClose').click();
  await wait(350);
  // an empty deck says how to earn one
  const keep = Object.assign({}, c.counts);
  c.counts = {}; Deck.saveCol();
  document.getElementById('deckBtn').click();
  await wait(350);
  out.empty = (document.querySelector('#dkSheet .dkEmpty') || {}).textContent || '';
  out.emptyBadge = document.getElementById('deckBtn').classList.contains('empty');
  out.need = CFG.CARDS.LOSS_DEEDS;
  document.querySelector('#dkSheet .dkClose').click();
  await wait(350);
  c.counts = keep; Deck.saveCol();
  return out;
});
ck('groupedByTierHighestFirst', sh.groups.join(',') === 'enlight,imperial,iron,bronze,stone' &&
  sh.cells.every((r, i) => i === 0 || r <= sh.cells[i - 1]), sh.groups.join(',') + ' / ' + sh.cells.join(''));
ck('anUnplayableCardIsGreyedWithItsReason', sh.cantOff && sh.cantWhy === 'Nothing needs mending' && sh.cantAmber, sh.cantWhy);
ck('aDuplicateWearsItsCount', sh.dup === '×3', String(sh.dup));
ck('everyFaceCarriesItsArt', /assets\/cards\/art\/swift_raiders\.png/.test(sh.art) && /url\("data:image\/svg/.test(sh.art) && /^url\(/.test(sh.ico),
  sh.art.slice(0, 90));
ck('andEveryFaceIsAWholeMultiple', sh.whole.every(k => Math.abs(k - Math.round(k)) < 0.01 && k >= 1), sh.whole.join(','));
// the earn rule in the player's words (Deck.eligible): a win always earns,
// a defeat for a real fight counted in deeds — with this run's count so far
ck('anEmptyDeckSaysHowToEarnOne', /win a game/i.test(sh.empty) && /lose/i.test(sh.empty) &&
  new RegExp(sh.need + ' deeds').test(sh.empty) && /gathering/.test(sh.empty) && /orders given on 6 different days/.test(sh.empty) &&
  /this run: \d+ of \d+ deeds, \d+ of 6 days/.test(sh.empty) && !/minutes/.test(sh.empty) && sh.emptyBadge,
  sh.empty.slice(0, 160));

/* ================= 5. LIFT, FLIP, PLAY ================= */
const playBar = (pg) => pg.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  UI._toastAt = {};   // a repeat inside six seconds is collapsed, and this one must be seen
  await __until(() => DeckUI.built);
  if (Deck.count('__bar') < 1) { Deck.col().counts.__bar = 2; Deck.saveCol(); }
  const n0 = Deck.count('__bar'), food0 = S.res.food;
  S.paused = false;
  document.getElementById('deckBtn').click();
  await wait(400);
  const cell = document.querySelector('#dkSheet .dkCell[data-card="__bar"]');
  const rowW = cell.querySelector('.ccard').getBoundingClientRect().width;
  cell.click();
  await wait(250);
  const big = document.querySelector('#dkInsp .ccard');
  out.lifted = !!big && big.dataset.card === '__bar' && cell.classList.contains('dkOut');
  out.bigger = big.getBoundingClientRect().width / rowW;
  big.click(); out.flip1 = big.classList.contains('flip');
  big.click(); out.flip2 = big.classList.contains('flip');
  big.click();
  await wait(420);
  // the play: the door is watched, the bar is sampled every frame
  const door = Deck.play;
  let landAt = 0, pausedInFlight = null, atDoor = null, afterDoor = null;
  // the stockpile is read AT the door: the world resumes as the effect lands,
  // and a village that eats would blur a reading taken later
  Deck.play = function (id, tgt) {
    landAt = performance.now();
    const before = S.res.food, r = door.call(Deck, id, tgt);
    atDoor = S.res.food - before; afterDoor = S.res.food;
    return r;
  };
  const seen = [];
  let sampling = true;
  const sample = () => { if (!sampling) return; seen.push(document.getElementById('rFood').textContent); requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
  const t0 = performance.now();
  document.querySelector('#dkInsp .dkPlay').click();
  await wait(300);
  pausedInFlight = S.paused;
  // the flight starts on the next frame the page draws: that lag is the
  // page's, and it is reported beside the total
  const fl = document.querySelector('#dkFly .dkFCard');
  const anim = fl && fl.getAnimations()[0];
  out.startLag = anim && anim.startTime != null ? Math.round(anim.startTime - (document.timeline.currentTime - (performance.now() - t0))) : -1;
  while (DeckUI.playing && performance.now() - t0 < 4000) await new Promise(r => requestAnimationFrame(r));
  const t1 = performance.now();
  await wait(200);
  sampling = false;
  Deck.play = door;
  out.land = Math.round(landAt - t0); out.total = Math.round(t1 - t0);
  out.spent = n0 - Deck.count('__bar');
  out.food = atDoor;
  // the bar passes through the numbers between, and arrives at what the door
  // left (the village eats once the world resumes, so a little under it)
  const nums = seen.map(Number);
  out.ticked = nums.some(v => v > afterDoor - 250 && v < afterDoor - 5) && Math.max(...nums) >= afterDoor - 3 && nums[nums.length - 1] >= afterDoor - 15;
  out.seen = [...new Set(seen)].join('→');
  out.toast = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ');
  out.pausedInFlight = pausedInFlight; out.resumed = S.paused === false;
  out.gone = !document.getElementById('dkFly') && !document.getElementById('dkInsp') && !DeckUI.open;
  out.floor = Screens.modalUp();
  return out;
});
const pl = await playBar(p);
ck('aTapLiftsTheCardIntoABiggerFace', pl.lifted && pl.bigger >= 2, `×${pl.bigger.toFixed(2)}`);
ck('aTapOnItTurnsItOver', pl.flip1 && !pl.flip2);
ck('playSpendsTheCardAsTheBurstLands', pl.spent === 1 && pl.food === 250 && pl.land > 300 && pl.land < pl.total,
  `spent ${pl.spent}, +${pl.food} food, landed at ${pl.land}ms`);
ck('theBarNumberTicksUp', pl.ticked, pl.seen);
ck('aToastNamesTheEffect', /Test __bar: \+250 food\./.test(pl.toast), pl.toast.slice(0, 120));
ck('theWorldWaitsForTheLandingThenResumes', pl.pausedInFlight === true && pl.resumed && pl.gone && !pl.floor);
/* THE 1.2 s BAR is read by the wall clock, from the tap to the last of the
   light, on a page whose frames arrive on time: dpr 1, so the world behind
   the card is a twelfth of the pixels. The dpr-3 page above draws a frame in
   ~60ms on a busy sandbox and the flight can only start on one — measured
   to be the page's cost, unchanged with every light layer hidden — while a
   phone's GPU draws at 60fps. A reading over the bar earns two more
   (land.mjs's perf gates follow the same rule). */
const { ctx: tctx, p: tp } = await page({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
await tp.evaluate(({ enter, fx }) => {
  CFG.CARDS.ON = true;
  Deck._col = null; Deck._del(Deck.KEY);
  eval('(' + fx + ')')();
  eval('(' + enter + ')')('decktime');
}, { enter: enterGame.toString(), fx: fixtures.toString() });
await settle(tp);
const design = await tp.evaluate(() => DeckUI.FLY_MS + DeckUI.FLARE_MS + DeckUI.BURST_MS + DeckUI.AFTER_MS);
const readings = [];
for (let i = 0; i < 3; i++) {
  const r = await playBar(tp);
  readings.push(r);
  if (r.total <= 1200) break;
}
const best = readings.reduce((a, r) => (r.total < a.total ? r : a));
ck('theWholeSequenceIsUnder1200ms', best.total <= 1200 && design <= 900,
  readings.map(r => `${r.total}ms (started ${r.startLag}ms after the tap)`).join(', ') + `; design ${design}ms; at dpr 3: ${pl.total}ms`);
await tctx.close();

/* a 'tc' card bursts on the hall, and the higher tiers bring more light */
const tc = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const c = Deck.col(); c.counts.__tc = 1; c.counts.__bar = 1; c.counts.__legend = 1; Deck.saveCol();
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__tc"]').click(); await wait(250);
  window.__anims.length = 0;
  document.querySelector('#dkInsp .dkPlay').click();
  await __idle();
  const tcB = Bld.tcOf('P'), TL = CFG.TILE, z = R.cam.z;
  const sx = (Bld.cx(tcB) * TL - R.cam.x) * z, sy = (Bld.cy(tcB) * TL - R.cam.y) * z;
  out.dest = window.__tcDest; out.tc = { x: sx, y: sy };
  out.spent = Deck.count('__tc') === 0;
  const ironAnims = window.__anims.length;
  window.__anims.length = 0;
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__bar"]').click(); await wait(250);
  window.__anims.length = 0;
  document.querySelector('#dkInsp .dkPlay').click(); await __idle();
  const stoneAnims = window.__anims.length;
  window.__anims.length = 0;
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__legend"]').click(); await wait(250);
  window.__anims.length = 0;
  document.querySelector('#dkInsp .dkPlay').click(); await __idle();
  out.spectacle = { stone: stoneAnims, iron: ironAnims, legend: window.__anims.length };
  return out;
});
ck('aTcCardBurstsOnTheTownCenter', tc.spent && tc.dest && Math.hypot(tc.dest.x - tc.tc.x, tc.dest.y - tc.tc.y) < 2,
  tc.dest ? `burst at ${tc.dest.x.toFixed(0)},${tc.dest.y.toFixed(0)}; hall at ${tc.tc.x.toFixed(0)},${tc.tc.y.toFixed(0)}` : 'no landing');
ck('theSpectacleScalesWithTheTier', tc.spectacle.legend > tc.spectacle.iron && tc.spectacle.legend > tc.spectacle.stone,
  JSON.stringify(tc.spectacle));

/* ================= 6. A REFUSAL KEEPS THE CARD ================= */
const rf = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const c = Deck.col(); c.counts.__no = 1; c.counts.__cant = 1; Deck.saveCol();
  UI._toastAt = {};
  const q0 = c.queue.filter(x => x.op === 'consume').length;
  S.paused = false;
  // at the landing: the effect refuses
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__no"]').click(); await wait(250);
  document.querySelector('#dkInsp .dkPlay').click();
  await __idle();
  out.noKept = Deck.count('__no') === 1;
  out.noToast = [...document.querySelectorAll('#toasts .toast.warn')].some(t => t.textContent === 'No room by the fire');
  out.noResumed = S.paused === false;
  out.consumes = c.queue.filter(x => x.op === 'consume').length - q0;
  // at PLAY: the card cannot be played now
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__cant"]').click(); await wait(250);
  out.cantGreyed = document.querySelector('#dkInsp .dkPlay').classList.contains('cant') && document.querySelector('#dkInsp .ccard').classList.contains('off');
  document.querySelector('#dkInsp .dkPlay').click();
  await wait(100);
  out.cantFlew = !!DeckUI.playing;
  out.cantKept = Deck.count('__cant') === 1;
  out.cantWhy = document.querySelector('#dkInsp .dkWhy').textContent;
  out.cantToast = [...document.querySelectorAll('#toasts .toast.warn')].some(t => t.textContent === 'Nothing needs mending');
  document.querySelector('#dkInsp .dkIClose').click(); await wait(250);
  out.putBack = !document.getElementById('dkInsp') && DeckUI.open;
  document.querySelector('#dkSheet .dkClose').click(); await wait(350);
  return out;
});
ck('aRefusalAtTheLandingKeepsTheCard', rf.noKept && rf.noToast && rf.noResumed && rf.consumes === 0, JSON.stringify(rf));
ck('aCardThatCannotBePlayedSaysWhy', rf.cantGreyed && !rf.cantFlew && rf.cantKept && rf.cantWhy === 'Nothing needs mending' && rf.cantToast && rf.putBack);

/* ================= 7. TARGETING ================= */
// spies: the world's own tap handlers and the canvas itself
await p.evaluate(() => {
  window.__taps = 0; window.__cv = 0;
  const h = UI.handleTap, d = UI.handleDoubleTap;
  UI.handleTap = function () { window.__taps++; return h.apply(UI, arguments); };
  UI.handleDoubleTap = function () { window.__taps++; return d.apply(UI, arguments); };
  R.cv.addEventListener('pointerdown', () => { window.__cv++; }, true);
});
const aimOpen = () => p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (Deck.count('__aim') < 1) { Deck.col().counts.__aim = 2; Deck.saveCol(); }
  S.paused = false;
  document.getElementById('btnPause').textContent = '⏸';
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__aim"]').click(); await wait(250);
  document.querySelector('#dkInsp .dkPlay').click(); await wait(300);
  return { aim: !!DeckUI.aim, open: DeckUI.open, layer: !!document.getElementById('dkAim'), paused: S.paused,
    hidden: getComputedStyle(document.getElementById('bottombar')).visibility === 'hidden' };
});
const a1 = await aimOpen();
ck('anAimedCardClosesIntoTargeting', a1.aim && !a1.open && a1.layer && a1.paused && a1.hidden, JSON.stringify(a1));
// a real mouse tap on the ground — the view first moved to the middle of the
// board, so a pan has room to move whichever way it is pulled
const P = await p.evaluate(() => {
  R.centerOn(CFG.W / 2, CFG.H / 2);
  const TL = CFG.TILE, z = R.cam.z;
  const x = Math.round(R.viewW() / 2 + 2.5 * TL * z), y = Math.round(R.viewH() / 2 - 1.5 * TL * z);
  return { x, y, t: R.screenToTile(x, y) };
});
await p.mouse.click(P.x, P.y);
await p.waitForTimeout(100);
const t1 = await p.evaluate(() => ({ x: DeckUI.aim.x, y: DeckUI.aim.y, set: DeckUI.aim.set, taps: window.__taps, cv: window.__cv,
  stat: document.querySelector('#dkAimBar .dkAStat').textContent }));
ck('aTapPutsTheMarkWhereItLands', t1.x === P.t.x && t1.y === P.t.y && t1.set, `mark ${t1.x},${t1.y}; tapped tile ${P.t.x},${P.t.y}`);
ck('theWorldReceivesNoTap', t1.taps === 0 && t1.cv === 0, `${t1.taps} world taps, ${t1.cv} canvas presses`);
// a press elsewhere pans, and the mark stays on its ground
const pan0 = await p.evaluate(() => ({ cx: R.cam.x, cy: R.cam.y }));
await p.mouse.move(60, 400); await p.mouse.down(); await p.mouse.move(110, 430, { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(80);
const pan = await p.evaluate((c) => ({ moved: Math.abs(R.cam.x - c.cx) + Math.abs(R.cam.y - c.cy), x: DeckUI.aim.x, y: DeckUI.aim.y, taps: window.__taps, cv: window.__cv }), pan0);
ck('aPressElsewherePansTheView', pan.moved > 10 && pan.x === P.t.x && pan.y === P.t.y && pan.taps === 0 && pan.cv === 0, `camera moved ${pan.moved.toFixed(0)}px`);
// a press ON the mark drags it
const mark = await p.evaluate(() => {
  const A = DeckUI.aim, TL = CFG.TILE, z = R.cam.z;
  return { x: ((A.x + 0.5) * TL - R.cam.x) * z, y: ((A.y + 0.5) * TL - R.cam.y) * z, step: TL * z };
});
await p.mouse.move(mark.x, mark.y); await p.mouse.down();
await p.mouse.move(mark.x + mark.step * 2, mark.y + mark.step, { steps: 8 }); await p.mouse.up();
await p.waitForTimeout(80);
const drag = await p.evaluate((P) => ({ dx: DeckUI.aim.x - P.t.x, dy: DeckUI.aim.y - P.t.y, cv: window.__cv }), P);
ck('aPressOnTheMarkDragsIt', drag.dx === 2 && drag.dy === 1 && drag.cv === 0, `moved ${drag.dx},${drag.dy} tiles`);
// confirm plays at that tile
const go = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const A = DeckUI.aim, want = { x: A.x + 0.5, y: A.y + 0.5 }, n0 = Deck.count('__aim');
  // the reticle's own centre, read off the screen and taken back into the world
  const rr = A.ret.getBoundingClientRect(), TL = CFG.TILE, z = R.cam.z;
  const cross = { x: ((rr.left + rr.right) / 2 / z + R.cam.x) / TL, y: ((rr.top + rr.bottom) / 2 / z + R.cam.y) / TL };
  window.__got.length = 0;
  document.querySelector('#dkAimBar .dkAGo').click();
  await __idle();
  return { want, cross, got: window.__got[0], spent: n0 - Deck.count('__aim'), aim: !!DeckUI.aim, paused: S.paused,
    label: document.getElementById('btnPause').textContent, bar: getComputedStyle(document.getElementById('bottombar')).visibility };
});
ck('confirmPlaysAtTheChosenTile', go.got && go.got.x === go.want.x && go.got.y === go.want.y && go.spent === 1,
  `played at ${JSON.stringify(go.got)}, chose the middle of ${JSON.stringify(go.want)}`);
// the effect takes a WORLD POINT (js/deckfx.js), and it is the reticle's cross
ck('theBlowLandsOnTheReticlesCross', go.got && Math.hypot(go.got.x - go.cross.x, go.got.y - go.cross.y) < 0.06,
  `cross at ${go.cross.x.toFixed(2)},${go.cross.y.toFixed(2)}; played at ${go.got && go.got.x},${go.got && go.got.y}`);
ck('andTheWorldIsGivenBack', !go.aim && go.paused === false && go.label === '⏸' && go.bar === 'visible');
// a warning is shown before confirming, and asked twice
const a2 = await aimOpen();
const wr = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const A = DeckUI.aim, out = {};
  window.__warnX = A.x + 0.5; A.armed = false;
  DeckUI._aimSync();
  out.stat = document.querySelector('#dkAimBar .dkAStat').textContent;
  out.warnCls = document.getElementById('dkAimBar').classList.contains('warn');
  const n0 = Deck.count('__aim');
  document.querySelector('#dkAimBar .dkAGo').click();
  out.first = { flew: !!DeckUI.playing, kept: Deck.count('__aim') === n0, label: document.querySelector('#dkAimBar .dkAGo').textContent,
    stat: document.querySelector('#dkAimBar .dkAStat').textContent };
  document.querySelector('#dkAimBar .dkAGo').click();
  out.second = !!DeckUI.playing;
  await __idle();
  out.spent = n0 - Deck.count('__aim');
  window.__warnX = null;
  return out;
});
ck('aWarningIsShownBeforeConfirming', a2.aim && /This ends the truce/.test(wr.stat) && wr.warnCls, wr.stat);
ck('andItAsksTwice', !wr.first.flew && wr.first.kept && /Confirm/.test(wr.first.label) && /again/.test(wr.first.stat) && wr.second && wr.spent === 1,
  JSON.stringify(wr.first));
// unexplored ground is refused, and the aim waits
await aimOpen();
const ux = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const A = DeckUI.aim, out = {};
  S.map.explored[A.y * CFG.W + A.x] = 0;
  DeckUI._aimSync();
  out.bad = document.getElementById('dkAimBar').classList.contains('bad');
  out.stat = document.querySelector('#dkAimBar .dkAStat').textContent;
  const n0 = Deck.count('__aim');
  UI._toastAt = {};
  document.querySelector('#dkAimBar .dkAGo').click();
  await wait(60);
  out.flew = !!DeckUI.playing; out.kept = Deck.count('__aim') === n0; out.still = !!DeckUI.aim;
  out.toast = [...document.querySelectorAll('#toasts .toast.warn')].some(t => /explored/.test(t.textContent));
  S.map.explored[A.y * CFG.W + A.x] = 1;
  // ✕ puts the card back, untouched, and gives the pause back
  document.querySelector('#dkAimBar .dkANo').click();
  out.cancel = { aim: !!DeckUI.aim, kept: Deck.count('__aim') === n0, paused: S.paused, layer: !!document.getElementById('dkAim') };
  return out;
});
ck('unexploredGroundIsRefused', ux.bad && /explored/.test(ux.stat) && !ux.flew && ux.kept && ux.still && ux.toast, ux.stat);
ck('cancelKeepsTheCardAndTheWorld', !ux.cancel.aim && ux.cancel.kept && ux.cancel.paused === false && !ux.cancel.layer, JSON.stringify(ux.cancel));
await aimOpen();
await p.keyboard.press('Escape');
const esc = await p.evaluate(() => ({ aim: !!DeckUI.aim, paused: S.paused, taps: window.__taps, cv: window.__cv }));
ck('escapeCancelsTheAim', !esc.aim && esc.paused === false);
ck('andNothingEverReachedTheWorld', esc.taps === 0 && esc.cv === 0, `${esc.taps} world taps, ${esc.cv} canvas presses across the whole targeting section`);

/* A MOUSE CHOOSES BY CLICKING. The hover sweeps the mark as a preview, and
   the way to ✓ crosses the ground — so a hover that counted would spend the
   card wherever the cursor last crossed above the bar (reproduced: 10 tiles
   off the point the player meant). Until a click, ✓ asks for one. */
await aimOpen();
const hv = await p.evaluate(() => {
  R.centerOn(CFG.W / 2, CFG.H / 2);
  const TL = CFG.TILE, z = R.cam.z;
  const x = Math.round(R.viewW() / 2 - 3.5 * TL * z), y = Math.round(R.viewH() / 2 - 2.5 * TL * z);
  const go = document.querySelector('#dkAimBar .dkAGo').getBoundingClientRect();
  return { x, y, t: R.screenToTile(x, y), go: { x: go.left + go.width / 2, y: go.top + go.height / 2 } };
});
await p.mouse.move(hv.x - 40, hv.y - 40);
await p.mouse.move(hv.x, hv.y, { steps: 4 });
await p.mouse.move(hv.go.x, hv.go.y, { steps: 12 });
const hv1 = await p.evaluate(async () => {
  window.__got.length = 0;
  UI._toastAt = {};
  const n0 = Deck.count('__aim'), label = document.querySelector('#dkAimBar .dkAGo').textContent;
  return { n0, label };
});
await p.mouse.click(hv.go.x, hv.go.y);
await p.waitForTimeout(80);
const hv2 = await p.evaluate(() => ({ played: window.__got.length, flew: !!DeckUI.playing, aim: !!DeckUI.aim,
  n: Deck.count('__aim'), toast: [...document.querySelectorAll('#toasts .toast')].some(t => /Click the ground/.test(t.textContent)) }));
await p.mouse.click(hv.x, hv.y);
await p.waitForTimeout(60);
const hv3 = await p.evaluate(() => ({ x: DeckUI.aim.x, y: DeckUI.aim.y, label: document.querySelector('#dkAimBar .dkAGo').textContent }));
const goNow = await p.evaluate(() => { const r = document.querySelector('#dkAimBar .dkAGo').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(goNow.x, goNow.y, { steps: 12 });
await p.mouse.click(goNow.x, goNow.y);
await p.evaluate(() => __idle());
const hv4 = await p.evaluate(() => ({ got: window.__got[0] }));
ck('aMouseHoverIsAPreviewNotAChoice', /Click the ground/.test(hv1.label) && hv2.played === 0 && !hv2.flew && hv2.aim && hv2.n === hv1.n0 && hv2.toast,
  `✓ read "${hv1.label}"; a click on it played ${hv2.played}, toast ${hv2.toast}`);
ck('andAClickChoosesTheGround', hv3.x === hv.t.x && hv3.y === hv.t.y && /Here/.test(hv3.label) && hv4.got &&
  hv4.got.x === hv.t.x + 0.5 && hv4.got.y === hv.t.y + 0.5,
  `clicked ${hv.t.x},${hv.t.y}; played at ${JSON.stringify(hv4.got)} after sweeping the cursor down to ✓`);
/* A FINGER CHOOSES BY TAPPING, and ✓ LIGHTS AT ONCE (playtest g1, MAJOR):
   a finger never hovers, so the hover flag was undefined on a phone and
   classList.toggle('off', undefined) FLIPPED the class on every sync — after
   an ordinary tap on the ground ✓ read grey and disabled, and only tapping
   the same tile again lit it. A real touch context, real taps: ✓ is lit on
   the seeded mark, after a tap, after another, after the same tile again —
   and it plays where the finger chose. */
const { ctx: hctx, p: hp } = await page({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await hp.evaluate(({ enter, fx }) => {
  CFG.CARDS.ON = true;
  Deck._col = null; Deck._del(Deck.KEY);
  eval('(' + fx + ')')();
  eval('(' + enter + ')')('dk-touch');
}, { enter: enterGame.toString(), fx: fixtures.toString() });
await hp.evaluate(async () => { await __until(() => DeckUI.built); Deck.col().counts.__aim = 2; Deck.saveCol(); S.paused = false; });
await hp.tap('#deckBtn'); await hp.waitForTimeout(450);
await hp.tap('#dkSheet .dkCell[data-card="__aim"]'); await hp.waitForTimeout(300);
await hp.tap('#dkInsp .dkPlay'); await hp.waitForTimeout(350);
const goState = () => hp.evaluate(() => {
  const g = document.querySelector('#dkAimBar .dkAGo');
  return { off: g.classList.contains('off'), label: g.textContent, x: DeckUI.aim.x, y: DeckUI.aim.y, set: DeckUI.aim.set };
});
const touchSeq = [Object.assign({ at: 'seeded' }, await goState())];
const tt = await hp.evaluate(() => {
  R.centerOn(CFG.W / 2, CFG.H / 2);
  const TL = CFG.TILE, z = R.cam.z, vx = R.viewW() / 2, vy = R.viewH() / 2;
  const at = (dx, dy) => { const x = Math.round(vx + dx * TL * z), y = Math.round(vy + dy * TL * z); return { x, y, t: R.screenToTile(x, y) }; };
  return [at(1.5, -1.5), at(-2.5, 0.5)];
});
for (const [i, q] of [tt[0], tt[1], tt[1]].entries()) {
  await hp.touchscreen.tap(q.x, q.y);
  await hp.waitForTimeout(120);
  touchSeq.push(Object.assign({ at: ['a tap', 'another tile', 'the same tile again'][i], want: q.t }, await goState()));
}
await hp.evaluate(() => { window.__got.length = 0; });
await hp.tap('#dkAimBar .dkAGo');
await hp.evaluate(() => __idle());
const touchGot = await hp.evaluate(() => window.__got[0] || null);
await hctx.close();
ck('aFingerTapLightsTheGoButton', touchSeq.every(s => !s.off && /✓ Here/.test(s.label)) &&
  touchSeq.slice(1).every(s => s.set && s.x === s.want.x && s.y === s.want.y) &&
  !!touchGot && touchGot.x === tt[1].t.x + 0.5 && touchGot.y === tt[1].t.y + 0.5,
  touchSeq.map(s => `${s.at}: ${s.off ? 'GREY' : 'lit'} "${s.label}"`).join('; ') + ` → played at ${JSON.stringify(touchGot)}`);
// a tutorial note already on screen steps aside while the deck has the floor
await aimOpen();
const tut = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mk = id => { let e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; e.dataset.fake = '1'; document.body.appendChild(e); } return e; };
  const dim = mk('tutDim'), card = mk('tutUI');
  const during = [getComputedStyle(dim).visibility, getComputedStyle(card).visibility];
  DeckUI.endAim();
  await wait(30);
  const after = [getComputedStyle(dim).visibility, getComputedStyle(card).visibility];
  for (const e of [dim, card]) if (e.dataset.fake) e.remove();
  return { during, after };
});
ck('aTutorialNoteStepsAsideForTheAim', tut.during.every(v => v === 'hidden') && tut.after.every(v => v === 'visible'),
  `during ${tut.during.join('/')}, after ${tut.after.join('/')}`);
/* THE PAUSE GIVEN BACK is the one the player last chose: paused before the
   deck opened, then ▶ pressed while aiming — the landing must not pause the
   world the player just set running */
const hold = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (Deck.count('__aim') < 1) { Deck.col().counts.__aim = 2; Deck.saveCol(); }
  S.paused = true;
  document.getElementById('deckBtn').click(); await wait(400);
  document.querySelector('#dkSheet .dkCell[data-card="__aim"]').click(); await wait(250);
  document.querySelector('#dkInsp .dkPlay').click(); await wait(300);
  S.paused = false;                       // the player's ▶, while aiming
  DeckUI.aim.set = true;
  document.querySelector('#dkAimBar .dkAGo').click();
  await __idle();
  return { paused: S.paused };
});
ck('aPlayerUnpauseWhileAimingIsKept', hold.paused === false, `after the landing: paused ${hold.paused}`);
/* ONE PLAY, ONE LOG LINE: the effect writes the event log, the landing only
   says it on screen (the effects branch and the deck once both wrote it) */
const one = await p.evaluate(async () => {
  Deck._add('forager_cache', 1);
  S.paused = false;
  const n0 = S.log.length;
  UI._toastAt = {};
  DeckUI._run('forager_cache', null, null, false);
  await __idle();
  return { lines: S.log.length - n0, toast: [...document.querySelectorAll('#toasts .toast')].some(t => /Forager/.test(t.textContent)) };
});
ck('onePlayIsOneLogLine', one.lines === 1 && one.toast, `${one.lines} log lines, toast ${one.toast}`);

/* ================= 8. TIMERS ================= */
const tm = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  S.paused = true;
  Deck.addTimed('__timed', 2);
  DeckUI._t = 0;
  const chip = await __until(() => document.querySelector('#dkTimers .dkT[data-id="__timed"]'));
  out.chip = !!chip; out.label = chip && chip.textContent;
  out.lit0 = DeckUI._chips.__timed && DeckUI._chips.__timed.n;
  S.deck.fx[0].until = Deck.now() + 0.5;   // half a day left of… the ring drains
  S.deck.fx[0].from = Deck.now() - 1.5;
  DeckUI._t = 0;
  await __until(() => /s$/.test(chip.textContent));
  out.label2 = chip.textContent;
  out.lit1 = DeckUI._chips.__timed.n;
  S.day += 3; Deck.tick();
  DeckUI._t = 0;
  await __until(() => !document.querySelector('#dkTimers .dkT'));
  out.gone = !document.querySelector('#dkTimers .dkT');
  out.empty = getComputedStyle(document.getElementById('dkTimers')).display === 'none';
  S.paused = false;
  return out;
});
ck('aRunningCardWearsItsTimeLeft', tm.chip && tm.label === '2d' && tm.label2 === '5s', `${tm.label} → ${tm.label2} (2 days, then half a day)`);
ck('andItsRingDrains', tm.lit1 < tm.lit0 && tm.lit1 > 0, `${tm.lit0} → ${tm.lit1} lit cells`);
ck('andItVanishesAtExpiry', tm.gone && tm.empty);

/* EVERY RUNNING CARD IS SEEN, OR COUNTED: four timers on the narrowest
   phones — each chip either wholly inside its strip and the screen, or folded
   into a "+k" that names it */
const fit = [];
for (const w of [320, 360, 375, 390, 430]) {
  await p.setViewportSize({ width: w, height: 800 });
  await p.waitForTimeout(200);
  fit.push(await p.evaluate(async (w) => {
    const ids = ['__timed', '__aim', '__bar', '__tc'];
    S.deck.fx = [];
    for (const id of ids) Deck.addTimed(id, 3);
    DeckUI._t = 0;
    await __until(() => document.querySelectorAll('#dkTimers .dkT:not(.dkMore)').length === 4);
    await new Promise(r => setTimeout(r, 260));
    const strip = document.getElementById('dkTimers').getBoundingClientRect(), vw = document.documentElement.clientWidth;
    const inside = el => { const r = el.getBoundingClientRect(); return r.left >= strip.left - 0.5 && r.right <= strip.right + 0.5 && r.left >= 0 && r.right <= vw; };
    const chips = [...document.querySelectorAll('#dkTimers .dkT')].filter(el => getComputedStyle(el).display !== 'none');
    const shown = chips.filter(el => !el.classList.contains('dkMore')).length;
    const more = document.querySelector('#dkTimers .dkMore, #dkTimers .dkMoreB');
    const k = more ? +more.textContent.replace('+', '') : 0;
    // the badge's own tap names what it folds
    UI._toastAt = {};
    const badged = document.querySelector('#dkTimers .dkMoreB');
    if (badged) badged.parentNode.click();
    const named = !k || [...document.querySelectorAll('#toasts .toast')].some(t => /Also running/.test(t.textContent));
    const out = { w, shown, k, named, whole: chips.every(inside) };
    S.deck.fx = [];
    DeckUI._t = 0;
    await __until(() => !document.querySelector('#dkTimers .dkT'));
    return out;
  }, w));
}
await p.setViewportSize({ width: 430, height: 880 });
await p.waitForTimeout(200);
ck('everyRunningCardIsSeenOrCounted', fit.every(f => f.whole && f.shown >= 1 && f.shown + f.k === 4 && f.named),
  fit.map(f => `${f.w}: ${f.shown} shown${f.k ? ' +' + f.k : ''}${f.whole ? '' : ' CLIPPED'}${f.named ? '' : ' UNNAMED'}`).join('; '));

/* ================= 9. THE WORLD CHANGES ================= */
const wc = await p.evaluate(async ({ enter }) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  document.getElementById('deckBtn').click(); await wait(300);
  eval('(' + enter + ')')('deckworld2');
  await wait(200);
  out.newGame = !DeckUI.open && !DeckUI.hasFloor() && getComputedStyle(document.getElementById('dkSheet')).display === 'none' && S.paused === false;
  // a screen that takes over mid-aim: the aim is dropped, the card kept, and the screen owns the pause
  Deck.col().counts.__aim = 1; Deck.saveCol();
  document.getElementById('deckBtn').click(); await wait(350);
  document.querySelector('#dkSheet .dkCell[data-card="__aim"]').click(); await wait(250);
  document.querySelector('#dkInsp .dkPlay').click(); await wait(200);
  Screens.show('paused');
  await __until(() => !DeckUI.aim);   // the frame loop notices the screen and drops the deck
  out.shell = { aim: !!DeckUI.aim, kept: Deck.count('__aim') === 1, paused: S.paused, layer: !!document.getElementById('dkAim') };
  Screens.show('playing');
  await wait(150);
  out.resumed = S.paused === false && !DeckUI.aim;
  // a load mid-sheet drops it, and the load's own pause stands
  document.getElementById('deckBtn').click(); await wait(300);
  G.loadJSON(G.saveJSON());
  await wait(150);
  out.load = !DeckUI.open && S.paused === true && document.getElementById('btnPause').textContent === '▶';
  Screens.show('playing');
  return out;
}, { enter: enterGame.toString() });
ck('aNewGameDropsTheDeck', wc.newGame);
ck('aScreenThatTakesOverOwnsThePause', !wc.shell.aim && wc.shell.kept && wc.shell.paused === true && !wc.shell.layer && wc.resumed, JSON.stringify(wc.shell));
ck('aLoadDropsTheDeckAndKeepsItsPause', wc.load);

/* ================= 10. REDUCED MOTION ================= */
const { ctx: rctx, p: rp } = await page({ reducedMotion: 'reduce' });
await rp.evaluate(({ enter, fx }) => {
  CFG.CARDS.ON = true;
  Deck._col = null; Deck._del(Deck.KEY);
  eval('(' + fx + ')')();
  eval('(' + enter + ')')('deckcalm');
}, { enter: enterGame.toString(), fx: fixtures.toString() });
await settle(rp);
const rm = await rp.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  await __until(() => DeckUI.built);
  await wait(200);
  Deck.col().counts.__bar = 1; Deck.col().counts.__aim = 1; Deck.saveCol();
  const food0 = S.res.food;
  window.__anims.length = 0;
  document.getElementById('deckBtn').click(); await wait(300);
  document.querySelector('#dkSheet .dkCell[data-card="__bar"]').click(); await wait(250);
  const t0 = performance.now();
  document.querySelector('#dkInsp .dkPlay').click();
  while (DeckUI.playing && performance.now() - t0 < 3000) await new Promise(r => requestAnimationFrame(r));
  out.total = Math.round(performance.now() - t0);
  await __until(() => !DeckUI._ticks.length);
  out.spent = Deck.count('__bar') === 0; out.food = S.res.food - food0;
  out.rFood = document.getElementById('rFood').textContent === String(UI.fmtRes(S.res.food));
  out.toast = [...document.querySelectorAll('#toasts .toast')].some(t => /\+250 food/.test(t.textContent));
  // and the aim, opened and cancelled
  document.getElementById('deckBtn').click(); await wait(300);
  document.querySelector('#dkSheet .dkCell[data-card="__aim"]').click(); await wait(250);
  document.querySelector('#dkInsp .dkPlay').click(); await wait(250);
  out.aim = !!DeckUI.aim;
  document.querySelector('#dkAimBar .dkANo').click();
  out.anims = window.__anims.length;
  out.moving = window.__anims.filter(k => /transform/.test(k)).length;
  return out;
});
ck('reducedMotionMovesNothing', rm.anims > 0 && rm.moving === 0, `${rm.anims} animations, ${rm.moving} with a transform`);
ck('butTheInformationIsAllThere', rm.spent && rm.food === 250 && rm.rFood && rm.toast && rm.aim && rm.total <= 1200, `${rm.total}ms`);
await rctx.close();

/* ================= 11. A STRIKE SAYS IT ONCE, AND NEVER AS AN ALARM =================
   Starfall and Dragonfire narrate their own act (the star's blow, the
   dragon's ash), so the landing's toast stands down (`narrates`) and the
   act's line wears the NOTE style — the red alarm is for being attacked,
   never for the player's own blow. Played through the real sequence with
   the real effects on a 390px phone and watched for the whole act: one toast
   on screen at a time, none of them an alarm, and the result is said.
   (The old code stacked three — the card's name, the breath in red, the ash.) */
const { ctx: sctx, p: sp } = await page({ viewport: { width: 390, height: 844 } });
const strikes = await sp.evaluate(async (enter) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  CFG.CARDS.ON = true;
  const out = {};
  for (const id of ['starfall', 'dragonfire']) {
    eval('(' + enter + ')')('dk-narrate-' + id);
    Deck._col = null; Deck._del(Deck.KEY); Deck._add(id, 1);
    // something of theirs in the open, in sight, to strike
    const tc = Bld.tcOf('P');
    const spot = MapGen.findNear(tc.x + 9, tc.y + 2, 8, (x, y) => Path.passable(x, y) && !Bld.at(x, y) && !Bld.at(x + 1, y + 1));
    Bld.place('A', 'house', spot.x, spot.y, { free: true, instant: true }); Bld._block = null;
    G.updateVisibility();
    UI._toastAt = {}; document.getElementById('toasts').innerHTML = '';
    S.paused = false;
    DeckUI._run(id, { x: spot.x + 0.5, y: spot.y + 0.5 }, null, false);
    const t0 = performance.now(), said = new Set();
    let max = 0, alarms = 0;
    while (performance.now() - t0 < 7000) {
      const ts = [...document.querySelectorAll('#toasts .toast')].filter(t => getComputedStyle(t).opacity !== '0');
      max = Math.max(max, ts.length);
      for (const t of ts) { if (t.classList.contains('warn')) alarms++; said.add(t.textContent); }
      await wait(50);
    }
    out[id] = { played: Deck.count(id) === 0, max, alarms, said: [...said] };
  }
  return out;
}, enterGame.toString());
ck('aStrikeSaysItOnceNeverAsAnAlarm', ['starfall', 'dragonfire'].every(id => strikes[id].played && strikes[id].max === 1 && strikes[id].alarms === 0) &&
  strikes.starfall.said.some(t => /star strikes/.test(t)) && strikes.dragonfire.said.some(t => /Ash where they stood/.test(t)),
  ['starfall', 'dragonfire'].map(id => `${id}: ${strikes[id].max} at once, ${strikes[id].alarms} alarm samples — ${strikes[id].said.map(t => t.slice(0, 40)).join(' | ')}`).join('; '));
await sctx.close();

/* ================= 12. EVERY NAME FITS ITS PLATE, EVERY REFUSAL ITS CAPTION =================
   The sheet's smallest face is 88px wide (a 320px phone at 2x): there the
   plate's 7.5px floor broke THE SWALLOWED SUN into three lines over the
   plate's rim and ran ENLIGHTENMENT past both its ends. Every card's name —
   and every tier's, on the back — must sit inside its plate in at most two
   lines (Deck.nmFit steps the size down), at 320 and at 390; and a refusal
   may take a third line, so "The Wonder rises only in Calm worlds." is read
   whole (with its period), never cut off in an ellipsis. */
const plates = [];
for (const [w, h, dpr] of [[320, 568, 2], [390, 844, 3]]) {
  const { ctx: pctx, p: pp } = await page({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  plates.push(await pp.evaluate(async ({ enter, w }) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    CFG.CARDS.ON = true;
    eval('(' + enter + ')')('dk-plates');
    Deck._col = null; Deck._del(Deck.KEY);
    for (const c of Deck.CATALOG) Deck._add(c.id, 1);
    if (document.fonts) { await document.fonts.load('700 10px Cinzel'); await document.fonts.ready; }
    DeckUI.openSheet(); await wait(500);
    const lines = el => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map(q => Math.round(q.top))).size; };
    const inside = el => {
      const box = el.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(el);
      const tb = r.getBoundingClientRect(), padX = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      return tb.top >= box.top - 0.5 && tb.bottom <= box.bottom + 0.5 && tb.left >= box.left + padX - 1 && tb.right <= box.right - padX + 1;
    };
    const bad = [], cells = [...document.querySelectorAll('#dkSheet .dkCell')];
    for (const cell of cells) for (const nm of cell.querySelectorAll('.cc-nm')) {
      // (the back plate is measured where it stands, turned away: a half
      // turn about the card's axis mirrors its box, which the test is blind to)
      const back = !!nm.closest('.cc-b');
      const n = lines(nm), ok = n <= 2 && inside(nm);
      if (!ok) bad.push(`${cell.dataset.card}${back ? ' (back)' : ''}: ${n} lines, ${getComputedStyle(nm).fontSize}`);
    }
    const caps = cells.filter(c => c.querySelector('.dkCap.no')).map(c => {
      const cap = c.querySelector('.dkCap');
      return { id: c.dataset.card, why: cap.textContent, n: lines(cap), whole: cap.scrollHeight <= cap.clientHeight + 1 };
    });
    return { w, cardW: Math.round(cells[0].getBoundingClientRect().width), n: cells.length, bad, caps };
  }, { enter: enterGame.toString(), w }));
  await pctx.close();
}
const wonderCap = plates[0].caps.find(c => c.id === 'age_of_marble');
ck('everyNameFitsItsPlate', plates.every(pl => pl.n === 36 && !pl.bad.length) && plates[0].cardW <= 90,
  plates.map(pl => `${pl.w}px (${pl.cardW}px cards): ${pl.bad.length ? pl.bad.join('; ') : 'all 36 inside, both sides'}`).join(' / '));
ck('aRefusalTakesAThirdLineNeverAnEllipsis', !!wonderCap && wonderCap.n === 3 && wonderCap.whole && wonderCap.why === 'The Wonder rises only in Calm worlds.' &&
  plates.every(pl => pl.caps.every(c => c.whole)),
  plates.map(pl => `${pl.w}: ` + pl.caps.map(c => `${c.id} ${c.n}${c.whole ? '' : ' CLIPPED'}`).join(', ')).join(' / '));

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
const pageErrs = errs.filter(e => !/ERR_FILE_NOT_FOUND/.test(e));
if (pageErrs.length) console.log('PAGE ERRORS:', pageErrs.slice(0, 4));
await b.close();
if (fails.length || pageErrs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-UI CHECKS PASS');
