/* HUD-INFO CONTRACT — the top bar's numbers tell the truth and explain
   themselves, and a hand that runs out of work says so.

   Four faults, measured on build 126/127 by the sprint's Gate 1 audit:
     1. THE FOOD RATE WAS ONLY THE UPKEEP (PX-19). Beside the larder the HUD
        printed "−N/d" — what the village EATS, in an element named rFoodNet —
        so in ordinary early play the larder rose while the bar said it was
        falling: the sign agreed with the real day 0 times in 60.
     2. THE NUMBERS EXPLAINED NOTHING (PX-18). Not one of the seven chips (the
        four goods, the food rate, the tribe, the day) answered a tap or a
        click, none carried a name, and at 320–390 px a five-figure larder and
        its rate spilled out of the food chip.
     3. A SPENT TILE WAS SILENT (PX-08). When the tile a villager gathers runs
        out the hand stands idle, and the line that said so was logged with no
        level — written to the chronicle, shown nowhere: 0 of 4–5 exhaustions
        a world reached the screen.
     4. THREE FALSE LINES (PX-56): the Guide said hungry villagers down tools
        (soldiers desert; villagers never do), Settings said the music is no
        recording (it is four recorded tunes), and a war party of axemen was
        "3 Axemans".

   The rules this pins:
     - The food rate is the NET: what the town is set to bring in a day
       (UI.incomePerDay — every hand sent to gather or fish at the rate
       Units.workReport gives it at work, every finished work by the
       expression Bld.dailyProduction pays) less Units.foodUpkeep('P'),
       signed "+N/d" or "−N/d", smoothed over about half a game day so a
       step between two tiles never flips it; red when it falls, and the
       famine red as before. Judged against the REAL larder, day by day.
     - A tap or a click on any chip answers with a note in the rules' own
       numbers; the chips and the ⏸ / ☰ buttons carry a title and a name; no
       chip spills at 320, 360 or 390; no two of the top bar's tap targets
       overlap.
     - The first spent tile of a world (and the first fished-out shoal) is a
       NOTE on the screen naming what ran out; after it, at most one such
       note every five game days. Every line still goes to the chronicle.
     - The Guide, Settings and the war-party title say what is true.

   Run this after touching UI.refresh's food rate, UI.incomePerDay /
   handRate / chipNote / idleNote, the #topbar chips' markup or CSS, the
   spent-tile lines in Units.update, or the Guide / Settings copy.

     node tests/hud-info.mjs      # exits non-zero on any regression        */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 0. the source: the Guide's famine rule (the copy is markup) ---- */
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const a = html.indexOf('<h3>Feed the tribe</h3>'), b = a >= 0 ? html.indexOf('</section>', a) : -1;
  const page = a >= 0 && b > a ? html.slice(a, b).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : '';
  ck('theGuideTellsTheFamineTruth', !!page && !/down tools/i.test(page) && /soldiers desert/i.test(page) && /villagers keep working/i.test(page),
    page ? `"${page.slice(0, 160).trim()}…"` : 'no Feed the tribe page');
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
// a returning device: the card announcement and the two-roads modal already seen
await p.addInitScript(() => { try { localStorage.setItem('neo-cards-intro', '1'); localStorage.setItem('neo-victory-seen', '1'); } catch (e) {} });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.waitForTimeout(500);

// helpers installed once in the page
await p.evaluate(() => {
  const TL = () => CFG.TILE;
  window.__h = {
    // the seeded clocks a sim that drives Units/Combat directly needs (CLAUDE.md's three lines)
    seed(n) { let a = n >>> 0; Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; Combat.scanT = 0; Units.herdClock = 0; },
    fresh(seed, mode) {
      CFG.W = CFG.H = CFG.SIZES.medium;
      G.newGame(seed, mode || 'calm', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      UI.deselect(); if (UI.exitPlacement) UI.exitPlacement();
      __h.clear();
      return Bld.tcOf('P');
    },
    clear() { document.getElementById('toasts').innerHTML = ''; UI._toastAt = {}; },
    // SEEN, by visibility: displayed, sized, and the topmost thing at its own
    // centre (the toast column takes no pointer events, so the probe lends it some)
    seen(el) {
      if (!el || !el.isConnected) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.style.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const box = document.getElementById('toasts');
      const pe = box.style.pointerEvents;
      box.style.pointerEvents = 'auto'; el.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      box.style.pointerEvents = pe; el.style.pointerEvents = '';
      return !!hit && (hit === el || el.contains(hit));
    },
    shown(re) { return [...document.querySelectorAll('#toasts .toast')].filter(n => re.test(n.textContent) && __h.seen(n)); },
    vills() { return S.units.filter(u => u.owner === 'P' && Units.isVillager(u)); },
    near(terr, from, taken) {
      let best = null, bd = 1e9;
      for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
        const i = y * CFG.W + x;
        if (S.map.terrain[i] !== terr || (taken && taken.has(i)) || !(S.map.resAmount[i] > 1)) continue;
        const d = (x - from.x) ** 2 + (y - from.y) ** 2;
        if (d < bd) { bd = d; best = { x, y, i }; }
      }
      if (best && taken) taken.add(best.i);
      return best;
    },
    // a hand put to work and STOOD at its spot (so the panel's own work line pays it)
    workAt(u, t) {
      if (!Units.assignGather(u, t.x, t.y)) return false;
      u.x = u.task.stx; u.y = u.task.sty; u.path = null;
      return true;
    },
    // a free 1×1 spot (and its east neighbour, for a broadside pair) near the hall
    freePair(tc) {
      for (let r = 3; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tc.x + dx, y = tc.y + dy;
        if ([0, 1].every(k => MapGen.onBoard(x + k, y) && Bld.tileFree(x + k, y) && Path.passable(x + k, y, 'P'))) return { x, y };
      }
      return null;
    },
    // a finished work with its own hands on it (Bld.place free+instant validates nothing)
    station(key, x, y, hands) {
      const bb = Bld.place('P', key, x, y, { free: true, instant: true }); Bld._block = null;
      for (let k = 0; k < hands; k++) {
        const v = Units.spawn('villager', 'P', x, y);
        v.x = x + 0.5; v.y = y + 0.5; v.task = { type: 'work', id: bb.id }; v.path = null;
      }
      return bb;
    },
    // the water a boat can work: a stocked tile, anywhere (the rate asks no road)
    water() {
      for (let i = 0; i < S.map.terrain.length; i++)
        if (S.map.terrain[i] === T.WATER && S.map.resAmount[i] > 5 && MapGen.onBoard(i % CFG.W, (i / CFG.W) | 0)) return { x: i % CFG.W, y: (i / CFG.W) | 0 };
      return null;
    },
    // what Bld.dailyProduction would pay the player at the turn of the day — measured, then given back
    lump() {
      const r0 = Object.assign({}, S.res);
      Bld.dailyProduction('P');
      const out = {};
      for (const k of ['food', 'wood', 'stone', 'gold']) out[k] = S.res[k] - r0[k];
      S.res = r0;
      return out;
    },
    // the hands' rates, straight off the panel's work line
    handSum(res, boats) {
      let n = 0;
      for (const u of S.units) {
        if (u.owner !== 'P' || !u.task || !['gather', 'fish', 'shorefish'].includes(u.task.type)) continue;
        if (!!boats === Units.isVillager(u)) continue;
        const w = Units.workReport(u);
        if (w && w.rate && w.rate.res === res) n += w.rate.n;
      }
      return n;
    },
    r1: v => Math.round(v * 10) / 10,
    // "label 12.5" pairs out of a note's list
    parts(s) {
      const m = /Coming in: (.*?)\.(?: |$)/.exec(s);
      const out = {};
      if (!m) return out;
      for (const bit of m[1].split(/, | and (?=[a-z ]+ \d)/)) {
        const q = /^(.*?) ([\d.]+)$/.exec(bit.trim());
        if (q) out[q[1]] = +q[2];
      }
      return out;
    },
    // the note's daily total ("Stone 76: nothing comes in" is an income of 0)
    total(s) { const m = /^(?:\w+ [\d.k]+: )?([+−±])([\d.]+)(?: food)? a day/.exec(s); return m ? (m[1] === '−' ? -1 : m[1] === '±' ? 0 : 1) * +m[2] : /^\w+ [\d.k]+: nothing comes in/.test(s) ? 0 : NaN; },
    printed() {
      const t = (document.getElementById('rFoodNet') || {}).textContent || '';
      const m = /^([+−±])(\d+)\/d$/.exec(t);
      return { t, n: m ? (m[1] === '−' ? -1 : m[1] === '+' ? 1 : 0) * +m[2] : NaN, bad: document.getElementById('rFoodNet').classList.contains('bad') };
    },
  };
});

/* ---- 1. THE FOOD RATE IS THE NET (PX-19), on a constructed town ---- */
const town = await p.evaluate(() => {
  const out = {};
  const tc = __h.fresh('hud-town', 'moderate');
  G.freeVis = true; G.updateVisibility();
  while (__h.vills().length < 5) Units.spawn('villager', 'P', tc.x + 2, tc.y + 2);
  const taken = new Set(), v = __h.vills();
  // two on food, two on wood, one on stone — each STOOD at work
  const plan = [T.FERTILE, T.FERTILE, T.FOREST, T.FOREST, T.HILLS];
  out.hands = plan.map((terr, k) => { const t = __h.near(terr, tc, taken); return !!t && __h.workAt(v[k], t); });
  // a farm bonded to the house broadside-on (the homestead), worked by two
  const fp = __h.freePair(tc);
  const farm = __h.station('farm', fp.x, fp.y, 2);
  Bld.place('P', 'house', fp.x + 1, fp.y, { free: true, instant: true }); Bld._block = null;
  out.bonded = Bld.homesteadMult(farm) > 1;
  // a lumber camp, a quarry and a gold mine, one hand each
  for (const key of ['lumber', 'quarry', 'mine']) { const q = __h.freePair(tc); __h.station(key, q.x, q.y, 1); }
  // a fishing boat at its nets
  const w = __h.water();
  if (w) { const bt = Units.spawn('fishboat', 'P', w.x, w.y); bt.x = w.x + 0.5; bt.y = w.y + 0.5; bt.task = { type: 'fish', x: w.x, y: w.y }; bt.path = null; }
  out.boat = !!w;
  // the town stands like this for days: the printed rate has settled
  UI.refreshT = 0; UI.refresh(0.25);
  S.day += 10;
  UI.refreshT = 0; UI.refresh(0.25);
  const L = __h.lump(), eat = Units.foodUpkeep('P');
  const handsF = __h.handSum('food'), boatsF = __h.handSum('food', true);
  out.expect = Math.round(handsF + boatsF + L.food - eat);
  out.parts = { hands: __h.r1(handsF), boats: __h.r1(boatsF), works: __h.r1(L.food), eat };
  out.printed = __h.printed();
  // the notes, read through the chips' own door
  const note = k => (UI.chipNote ? UI.chipNote(k) : '') || '';
  out.notes = { food: note('food'), rate: note('foodRate'), wood: note('wood'), stone: note('stone'), gold: note('gold'), pop: note('pop'), day: note('day') };
  const P = __h.parts;
  const nf = P(out.notes.food), nw = P(out.notes.wood), ns = P(out.notes.stone), ng = P(out.notes.gold);
  const sum = o => Object.values(o).reduce((a, c) => a + c, 0);
  const eatM = /Eaten: ([\d.]+)\./.exec(out.notes.food);
  const pop = /Population (\d+) of (\d+)/.exec(out.notes.pop);
  const day = /Day (\d+)\. A day lasts ([\d.]+) seconds/.exec(out.notes.day);
  const tcb = Bld.tcOf('P');
  const hallGold = Bld.lv(tcb).out.gold * G.modeCfg().output;
  out.checks = {
    foodStored: out.notes.food.startsWith('Food ' + UI.fmtRes(S.res.food) + ': '),
    foodHands: nf.gatherers === __h.r1(handsF),
    foodBoats: !out.boat || nf.boats === __h.r1(boatsF),
    foodWorks: Math.abs(sum(nf) - (nf.gatherers || 0) - (nf.boats || 0) - L.food) < 0.15,
    foodEat: !!eatM && +eatM[1] === __h.r1(eat),
    foodNet: Math.abs(__h.total(out.notes.food) - (handsF + boatsF + L.food - eat)) < 0.15,
    rateNet: Math.abs(__h.total(out.notes.rate) - (handsF + boatsF + L.food - eat)) < 0.15 && out.notes.rate !== out.notes.food,
    woodHands: nw.woodcutters === __h.r1(__h.handSum('wood')),
    woodWorks: Math.abs(sum(nw) - (nw.woodcutters || 0) - L.wood) < 0.15,
    woodNet: Math.abs(__h.total(out.notes.wood) - (__h.handSum('wood') + L.wood)) < 0.15,
    stoneHands: ns.stonecutters === __h.r1(__h.handSum('stone')),
    stoneWorks: Math.abs(sum(ns) - (ns.stonecutters || 0) - L.stone) < 0.15,
    stoneNet: Math.abs(__h.total(out.notes.stone) - (__h.handSum('stone') + L.stone)) < 0.15,
    goldHall: ng['the hall'] === __h.r1(hallGold),
    goldAll: Math.abs(sum(ng) - L.gold) < 0.15 && Math.abs(__h.total(out.notes.gold) - L.gold) < 0.15,
    pop: !!pop && +pop[1] === Units.popUsed('P') && +pop[2] === Bld.popCap('P'),
    day: !!day && +day[1] === S.day && +day[2] === CFG.DAY_MS / 1000,
  };
  // a hand still WALKING to its tile is counted at the rate it earns there:
  // the estimate on the way equals the panel's own line once it stands at work
  const walker = __h.vills().find(u => u.task && u.task.type === 'gather' && u.task.res === 'wood');
  if (walker && UI.handRate) {
    const t = walker.task; walker.x = tc.x + 0.5; walker.y = tc.y + 2.5;
    const onWay = UI.handRate(walker);
    walker.x = t.stx; walker.y = t.sty;
    const atWork = Units.workReport(walker).rate;
    out.walk = { onWay: onWay && __h.r1(onWay.n), atWork: atWork && __h.r1(atWork.n) };
  } else out.walk = null;
  // the room note asks only what can be done: a house below the hall's ceiling,
  // a storey at it, and nothing at all from a hall at its last storey
  if (UI.chipNote) {
    const keep = { cap: Bld.popCap, used: Units.popUsed, lv: tc.level };
    const room = (lv, used, cap) => { tc.level = lv; Units.popUsed = () => used; Bld.popCap = () => cap; return UI.chipNote('pop'); };
    try {
      out.pop = { house: room(1, 10, 10), storey: room(1, CFG.TC_POP_CAP[0], CFG.TC_POP_CAP[0]),
        top: room(CFG.TC_POP_CAP.length, CFG.TC_POP_CAP[CFG.TC_POP_CAP.length - 1], CFG.TC_POP_CAP[CFG.TC_POP_CAP.length - 1]), room: room(1, 7, 10) };
    } finally { Bld.popCap = keep.cap; Units.popUsed = keep.used; tc.level = keep.lv; }
  }
  // red when it falls; the famine red as before
  for (const u of __h.vills()) if (u.task && u.task.type === 'gather' && u.task.res === 'food') u.task = null;
  for (const bb of S.buildings) if (bb.owner === 'P' && (bb.key === 'farm' || bb.key === 'lodge')) bb.upgrading = 1;
  S.units = S.units.filter(u => u.kind !== 'fishboat');
  S.day += 10; UI.refreshT = 0; UI.refresh(0.25);
  out.falling = __h.printed();
  for (const bb of S.buildings) if (bb.owner === 'P' && (bb.key === 'farm' || bb.key === 'lodge')) bb.upgrading = 0;
  S.day += 10; UI.refreshT = 0; UI.refresh(0.25);
  out.rising = __h.printed();
  S._famineWarned = true; UI.refreshT = 0; UI.refresh(0.25);
  out.famine = __h.printed();
  S._famineWarned = false;
  return out;
});
ck('theFoodRateIsTheNet', town.hands.every(Boolean) && town.bonded && town.printed.n === town.expect,
  `printed "${town.printed.t}", the rules say ${town.expect >= 0 ? '+' : '−'}${Math.abs(town.expect)}/d (gatherers ${town.parts.hands}, boats ${town.parts.boats}, works ${town.parts.works} with a homestead bond, eaten ${town.parts.eat})`);
ck('andItKeepsItsGlyphs', /^[+−±]\d+\/d$/.test(town.printed.t) && !town.printed.t.includes('-'), `"${town.printed.t}" — U+2212 for a fall, "/d" kept`);
ck('aFallingLarderReadsRed', town.falling.n < 0 && town.falling.bad && town.rising.n > 0 && !town.rising.bad,
  `falling "${town.falling.t}" ${town.falling.bad ? 'red' : 'NOT red'}; rising "${town.rising.t}" ${town.rising.bad ? 'RED' : 'plain'}`);
ck('theFamineRedStillShows', town.famine.bad, `"${town.famine.t}" with the famine warned: ${town.famine.bad ? 'red' : 'NOT red'}`);
const failed = Object.entries(town.checks).filter(([, v]) => !v).map(([k]) => k);
ck('everyNumberInEachNoteIsTheRulesOwn', !failed.length,
  failed.length ? 'wrong: ' + failed.join(', ') + ' — ' + JSON.stringify(town.notes).slice(0, 400)
    : `food "${town.notes.food}" | gold "${town.notes.gold}" | "${town.notes.pop}" | "${town.notes.day}"`);
ck('theRoomNoteAsksOnlyWhatCanBeDone', !!town.pop && /build a house/.test(town.pop.house) && /raise it a level/.test(town.pop.storey) &&
  !/raise it|build a house/.test(town.pop.top) && /3 more can be trained/.test(town.pop.room),
  town.pop ? `full under the ceiling: "${town.pop.house}" | at the ceiling: "${town.pop.storey}" | at the last storey: "${town.pop.top}"` : 'no note');
ck('aHandOnItsWayCountsAtItsWorkRate', !!town.walk && town.walk.onWay != null && town.walk.onWay === town.walk.atWork,
  town.walk ? `on the way ${town.walk.onWay}, at work ${town.walk.atWork}` : 'no way to ask (UI.handRate missing)');

/* ---- 2. EVERY CHIP ANSWERS A TAP (PX-18), by real input and by visibility ---- */
await p.evaluate(() => { __h.fresh('hud-taps', 'moderate'); S.paused = true; UI.refreshT = 0; UI.refresh(0.25); });
await p.waitForTimeout(250);
const CHIPS = [['food', '#rFood', /^Food \d+: [+−±][\d.]+ a day\./], ['food rate', '#rFoodNet', /^[+−±][\d.]+ food a day\./], ['wood', '#rWood', /^Wood \d+: /],
  ['stone', '#rStone', /^Stone \d+: /], ['gold', '#rGold', /^Gold \d+: /], ['population', '#rPopChip', /^Population \d+ of \d+/], ['day', '#rDay', /^Day \d+\./]];
const taps = [];
for (const [name, sel, re] of CHIPS) {
  const box = await p.evaluate(sel => {
    __h.clear();
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, top: !!hit && (hit === el || el.contains(hit) || hit.contains(el)), shown: getComputedStyle(el).display !== 'none' && r.width > 0 };
  }, sel);
  if (!box) { taps.push(`${name}: missing`); continue; }
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(120);
  const got = await p.evaluate(src => __h.shown(new RegExp(src)).map(n => n.textContent), re.source);
  taps.push(`${name}: ${box.shown && box.top ? '' : 'NOT ON TOP — '}${got.length ? '"' + got[0].slice(0, 70) + '…"' : 'NOTHING'}`);
  if (!(box.shown && box.top && got.length)) taps[taps.length - 1] = '✗ ' + taps[taps.length - 1];
}
ck('everyChipAnswersATap', taps.every(t => !t.startsWith('✗') && !t.endsWith('missing')), taps.join(' | '));
// a click leaves no focus on the chip (Enter in placement never also opens a note);
// a chip the keyboard reached answers Enter
const keys = await p.evaluate(() => ({ focusLeft: document.activeElement && document.activeElement.closest && !!document.activeElement.closest('#topbar [data-chip]') }));
await p.evaluate(() => { __h.clear(); document.getElementById('rDay').focus(); });
await p.keyboard.press('Enter');
await p.waitForTimeout(120);
keys.enter = await p.evaluate(() => __h.shown(/^Day \d+\./).length);
await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
ck('theKeyboardReachesTheChipsAndAClickLeavesNoFocus', !keys.focusLeft && keys.enter === 1,
  `after the clicks the focus ${keys.focusLeft ? 'STAYED on a chip' : 'is not on a chip'}; Enter on the focused day: ${keys.enter} note`);

/* ---- 3. THE CHIPS AND THE BUTTONS CARRY A NAME (PX-18) ---- */
const names = await p.evaluate(() => ['#topbar .trow:first-child .res:nth-child(1)', '#topbar .trow:first-child .res:nth-child(2)',
  '#topbar .trow:first-child .res:nth-child(3)', '#topbar .trow:first-child .res:nth-child(4)', '#rPopChip', '#rDay', '#btnPause', '#btnMenu']
  .map(s => { const el = document.querySelector(s); return { s, title: el && el.getAttribute('title'), aria: el && el.getAttribute('aria-label') }; }));
const unnamed = names.filter(n => !n.title || !n.aria);
ck('theChipsAndButtonsCarryNames', !unnamed.length,
  unnamed.length ? 'no title or name: ' + unnamed.map(n => n.s).join(', ') : names.map(n => `"${n.aria}"`).join(', '));

/* ---- 4. NO CHIP SPILLS ON A PHONE (PX-18; challenge-A a03fit's labels) ---- */
const fit = [];
for (const w of [320, 360, 390]) {
  await p.setViewportSize({ width: w, height: 800 });
  await p.waitForTimeout(250);
  fit.push(await p.evaluate(w => {
    const row = document.querySelector('#topbar .trow');
    const chips = [...row.querySelectorAll('.res')];
    const orig = UI.refresh; UI.refresh = () => {};
    const bad = [];
    try {
      for (const [food, lab] of [['368', '−5/d'], ['368', '+12/d'], ['12.4k', '−24/d'], ['12.4k', '+120/d'], ['9999', '+140/d'], ['9999', '−140/d']]) {
        document.getElementById('rFood').textContent = food; document.getElementById('rFoodNet').textContent = lab;
        document.getElementById('rWood').textContent = '12.4k'; document.getElementById('rStone').textContent = '9999'; document.getElementById('rGold').textContent = '9999';
        const rr = row.getBoundingClientRect();
        const tops = new Set(chips.map(c => Math.round(c.getBoundingClientRect().top)));
        const over = chips.some(c => c.scrollWidth > c.clientWidth + 1) || row.scrollWidth > row.clientWidth + 1;
        const clipped = chips.some(c => { const q = c.getBoundingClientRect(); return q.right > rr.right + 0.5 || q.left < rr.left - 0.5; });
        const fr = document.getElementById('rFoodNet').getBoundingClientRect(), cr = chips[0].getBoundingClientRect();
        if (tops.size !== 1 || over || clipped || fr.right > cr.right + 0.5) bad.push(`${food} ${lab}`);
      }
    } finally { UI.refresh = orig; }
    return { w, bad };
  }, w));
}
await p.setViewportSize({ width: 390, height: 844 });
ck('noChipSpillsOnAPhone', fit.every(f => !f.bad.length), fit.map(f => `${f.w}: ${f.bad.length ? 'SPILLS ' + f.bad.join(', ') : 'fits'}`).join('; '));

/* ---- 5. NO TWO TAP TARGETS IN THE TOP BAR OVERLAP (a G/matrix-style probe:
   each target's EFFECTIVE hit box, by elementFromPoint on a 1px grid, so a
   ::after extension counts) ---- */
const hits = [];
for (const w of [320, 390]) {
  await p.setViewportSize({ width: w, height: 800 });
  await p.waitForTimeout(250);
  hits.push(await p.evaluate(w => {
    const bar = document.getElementById('topbar');
    const els = [...bar.querySelectorAll('.res, #rDay, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).display !== 'none'; });
    const boxes = els.map(e => {
      const r = e.getBoundingClientRect();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let y = Math.max(0, r.top - 12); y <= r.bottom + 12; y++) for (let x = Math.max(0, r.left - 12); x <= Math.min(innerWidth - 1, r.right + 12); x++) {
        const h = document.elementFromPoint(x, y);
        if (h && (h === e || e.contains(h))) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      }
      return { id: e.id || e.className, x0, y0, x1, y1 };
    });
    const ov = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      const ix = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) + 1, iy = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) + 1;
      if (ix > 2 && iy > 2) ov.push(`${a.id}×${c.id} ${ix}×${iy}`);
    }
    return { w, n: boxes.length, ov };
  }, w));
}
await p.setViewportSize({ width: 390, height: 844 });
ck('noTwoTopBarTargetsOverlap', hits.every(h => !h.ov.length), hits.map(h => `${h.w}: ${h.n} targets, ${h.ov.length ? 'OVERLAP ' + h.ov.join(', ') : 'none overlap'}`).join('; '));

/* ---- 6. A SPENT TILE SAYS SO, ON SCREEN — ONCE, THEN ONE A FIVE DAYS (PX-08) ---- */
const idle = await p.evaluate(() => {
  const out = {};
  const tc = __h.fresh('hud-idle', 'calm');
  G.freeVis = true; G.updateVisibility();
  const taken = new Set();
  while (__h.vills().length < 4) Units.spawn('villager', 'P', tc.x + 2, tc.y + 2);
  const [v1, v2, v3] = __h.vills();
  const spend = (u, terr) => {
    const t = __h.near(terr, tc, taken);
    if (!t || !__h.workAt(u, t)) return null;
    S.map.resAmount[t.i] = 0.002;
    for (let k = 0; k < 10 && u.task; k++) Units.update(0.1);
    return !u.task;
  };
  const re = /felled|quarried out|soil here is spent|fished out/;
  out.first = spend(v1, T.FOREST);
  out.firstShown = __h.shown(/forest here is felled.*idle/).length;
  // half a game day on, another tile runs out: kept for the chronicle, not shown
  __h.clear(); S.dayT += CFG.DAY_MS / 2; if (S.dayT >= CFG.DAY_MS) { S.dayT -= CFG.DAY_MS; S.day++; }
  out.second = spend(v2, T.HILLS);
  out.secondShown = __h.shown(re).length;
  out.secondLogged = S.log.some(l => /stone here is quarried out.*villager idle/.test(l.msg));
  // five game days after the first, the next one is news again
  __h.clear(); S.day += 5;
  out.third = spend(v3, T.FERTILE);
  out.thirdShown = __h.shown(/soil here is spent.*idle/).length;
  out.note = [...document.querySelectorAll('#toasts .toast')].some(n => re.test(n.textContent) && !n.classList.contains('warn'));
  // a fished-out shoal, in a world of its own
  __h.fresh('hud-shoal', 'calm');
  let shoal = null;
  for (let y = 2; y < CFG.H - 2 && !shoal; y++) for (let x = 2; x < CFG.W - 2 && !shoal; x++) {
    if (S.map.terrain[MapGen.idx(x, y)] !== T.WATER) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const sx = x + dx, sy = y + dy;
      if (MapGen.onBoard(sx, sy) && Path.passable(sx, sy, 'P')) { shoal = { x, y, sx, sy }; break; }
    }
  }
  out.shoal = !!shoal;
  if (shoal) {
    S.map.resAmount[MapGen.idx(shoal.x, shoal.y)] = 0.0005;
    const f = Units.spawn('villager', 'P', shoal.sx, shoal.sy);
    f.x = shoal.sx + 0.5; f.y = shoal.sy + 0.5;
    f.task = { type: 'shorefish', x: shoal.x, y: shoal.y, sx: shoal.sx, sy: shoal.sy };
    for (let k = 0; k < 30 && f.task; k++) Units.update(0.1);
    out.shoalIdle = !f.task;
    out.shoalShown = __h.shown(/shoal is fished out.*idle/).length;
  }
  return out;
});
ck('aSpentTileSaysSoOnScreen', idle.first && idle.firstShown === 1 && idle.note,
  `first spent tile: ${idle.firstShown} visible note${idle.firstShown === 1 ? '' : 's'}${idle.note ? ' (a note, not a warning)' : ''}`);
ck('andTheNextWaitsFiveDays', idle.second && idle.secondShown === 0 && idle.secondLogged && idle.third && idle.thirdShown === 1,
  `half a day later: ${idle.secondShown} shown (in the chronicle: ${idle.secondLogged}); five days on: ${idle.thirdShown} shown`);
ck('aFishedOutShoalSaysSoToo', idle.shoal && idle.shoalIdle && idle.shoalShown === 1, idle.shoal ? `${idle.shoalShown} visible note` : 'no shoal on the map');

/* ---- 7. THE PRINTED RATES AGAINST THE REAL STORES (PX-19 / PX-18 amendments):
   a town run day by day in the real sim, the HUD sampled 4× a second. Each
   day the printed food sign (and each note's income) is judged against what
   the stores really did that day; over the run, the magnitude against the
   real mean; and the printed sign may change no more often than the
   larder's real daily direction. Three economies that rise — two hands on
   food, a homestead farm, two hands under a Harvest Festival — and one that
   falls. A hand whose tile runs out stands idle for a moment before it is
   sent on, as a player's would. ---- */
const runs = [];
for (const kind of ['hands', 'homestead', 'festival', 'none']) {
  runs.push(await p.evaluate(async ([kind, days]) => {
    __h.seed(4242);
    const tc = __h.fresh('hud-sim-' + kind, 'calm');
    while (__h.vills().length < 5) Units.spawn('villager', 'P', tc.x + 2, tc.y + 2);
    const taken = new Set(), kindOf = {}, idleAt = {};
    const plan = kind === 'none' ? [T.FOREST, T.FOREST, T.HILLS, T.FOREST, T.HILLS]
      : kind === 'homestead' ? [T.FOREST, T.FOREST, T.HILLS, T.FOREST, T.HILLS]
      : [T.FERTILE, T.FERTILE, T.FOREST, T.FOREST, T.HILLS];
    __h.vills().forEach((u, k) => { kindOf[u.id] = plan[k % plan.length]; const t = __h.near(kindOf[u.id], tc, taken); if (t) Units.assignGather(u, t.x, t.y); });
    if (kind === 'homestead') {
      const fp = __h.freePair(tc);
      const farm = __h.station('farm', fp.x, fp.y, 2);
      Bld.place('P', 'house', fp.x + 1, fp.y, { free: true, instant: true }); Bld._block = null;
      if (!(Bld.homesteadMult(farm) > 1)) return { kind, error: 'no bond' };
    }
    if (kind === 'festival') {
      const c = Deck.col(); c.counts.harvest_festival = (c.counts.harvest_festival || 0) + 1; Deck.saveCol && Deck.saveCol();
      const r = Deck.play('harvest_festival');
      if (!r.ok) return { kind, error: 'festival refused: ' + r.why };
    }
    const step = dt => {
      S.dayT += dt * 1000; S.playtime = (S.playtime || 0) + dt;
      while (S.dayT >= CFG.DAY_MS) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (S.over) return; }
      Bld.update(dt * 1000 / CFG.DAY_MS); Units.update(dt); Combat.update(dt);
      G.visT -= dt; if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
      // a hand whose tile ran out stands idle a moment, then is sent on (a player's reaction)
      const now = S.day + S.dayT / CFG.DAY_MS;
      for (const u of S.units) {
        if (u.owner !== 'P' || !Units.isVillager(u) || u.task || kindOf[u.id] == null) continue;
        if (idleAt[u.id] == null) { idleAt[u.id] = now; continue; }
        if (now - idleAt[u.id] < 0.15) continue;
        delete idleAt[u.id];
        const t = __h.near(kindOf[u.id], u, taken); if (t) Units.assignGather(u, t.x, t.y);
      }
    };
    const sgn = v => v > 0.5 ? 1 : v < -0.5 ? -1 : 0;
    const sample = () => { UI.refreshT = 0; UI.refresh(0.25); return __h.printed(); };
    const rows = [], signs = [];
    const R = ['food', 'wood', 'stone', 'gold'];
    // one day for the town to settle into its work, then the measured days
    for (let d = -1; d < days && !S.over; d++) {
      const s0 = sample();
      const start = S.day, r0 = Object.assign({}, S.res);
      const notes = {};
      for (const k of ['wood', 'stone', 'gold']) notes[k] = UI.chipNote ? __h.total(UI.chipNote(k)) : NaN;
      let g = 0;
      while (S.day === start && g++ < 400) { step(0.125); if (g % 2 === 0) signs.push(Math.sign(sample().n)); }
      if (d < 0) { signs.length = 0; continue; }
      const delta = {}; for (const k of R) delta[k] = S.res[k] - r0[k];
      rows.push({ day: start, printed: s0.n, t: s0.t, notes, delta });
    }
    const real = rows.map(r => sgn(r.delta.food));
    const changes = a => a.reduce((n, v, i) => n + (i && v !== a[i - 1] ? 1 : 0), 0);
    const agree = res => rows.filter(r => (res === 'food' ? Math.sign(r.printed) : sgn(r.notes[res])) === sgn(r.delta[res])).length;
    const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const mag = res => {
      const pr = mean(rows.map(r => res === 'food' ? r.printed : r.notes[res])), rl = mean(rows.map(r => r.delta[res]));
      return { pr: Math.round(pr * 10) / 10, rl: Math.round(rl * 10) / 10, err: Math.abs(rl) > 0.5 ? Math.abs(pr - rl) / Math.abs(rl) : Math.abs(pr - rl) };
    };
    return { kind, n: rows.length, agree: { food: agree('food'), wood: agree('wood'), stone: agree('stone'), gold: agree('gold') },
      mag: { food: mag('food'), wood: mag('wood'), stone: mag('stone'), gold: mag('gold') },
      printedChanges: changes(signs), realChanges: changes(real), samples: signs.length,
      sample: rows.slice(0, 6).map(r => `d${r.day} ${r.t}→${r.delta.food >= 0 ? '+' : ''}${Math.round(r.delta.food)}`).join(' ') };
  }, [kind, kind === 'none' ? 10 : 20]));
}
const errRuns = runs.filter(r => r.error);
const rise = runs.filter(r => !r.error && r.kind !== 'none'), fall = runs.find(r => r.kind === 'none');
const tot = rise.reduce((n, r) => n + r.n, 0), ag = rise.reduce((n, r) => n + r.agree.food, 0);
ck('theFoodSignIsTheLarders', !errRuns.length && tot >= 60 && ag >= tot * 57 / 60 && fall && fall.agree.food === fall.n,
  errRuns.length ? errRuns.map(r => r.kind + ': ' + r.error).join('; ')
    : `${ag}/${tot} rising days agree (hands, homestead, festival), ${fall.agree.food}/${fall.n} falling days; ${rise.map(r => r.kind + ' ' + r.sample.split(' ').slice(0, 3).join(' ')).join(' | ')}`);
ck('andItsSizeIsTheLarders', !errRuns.length && runs.every(r => r.mag.food.err <= 0.15),
  runs.map(r => `${r.kind} printed ${r.mag.food.pr} vs real ${r.mag.food.rl}`).join('; '));
ck('thePrintedSignNeverFlickers', !errRuns.length && runs.every(r => r.printedChanges <= r.realChanges),
  runs.map(r => `${r.kind}: ${r.printedChanges} printed changes in ${r.samples} samples, the larder's direction changed ${r.realChanges} times`).join('; '));
{
  const incomes = ['wood', 'stone', 'gold'].map(k => {
    const all = runs.filter(r => !r.error);
    const n = all.reduce((s, r) => s + r.n, 0), a = all.reduce((s, r) => s + r.agree[k], 0);
    const worst = Math.max(...all.map(r => r.mag[k].err));
    return { k, n, a, worst, ok: a >= n * 57 / 60 && worst <= 0.15, eg: all.map(r => `${r.mag[k].pr}/${r.mag[k].rl}`).join(' ') };
  });
  ck('eachNoteIncomeIsTheStores', !errRuns.length && incomes.every(i => i.ok),
    incomes.map(i => `${i.k} ${i.a}/${i.n} days, worst ${(100 * i.worst).toFixed(0)}% (printed/real ${i.eg})`).join('; '));
}

/* ---- 8. THE WORDS ARE TRUE (PX-56) ---- */
const words = await p.evaluate(async () => {
  const out = {};
  // the war party's title: men, not mans
  const tc = __h.fresh('hud-words', 'moderate');
  const ids = [];
  for (const [k, n] of [['axeman', 3], ['longbow', 2], ['defender', 1], ['archer', 2]])
    for (let i = 0; i < n; i++) ids.push(Units.spawn(k, 'P', tc.x + 3, tc.y + 3).id);
  out.party = UI.groupComposition(ids);
  // the Settings page's music line, as the page shows it
  Screens.show('settings');
  await new Promise(z => setTimeout(z, 300));
  if (window.SettingsPage && SettingsPage.open) SettingsPage.open('audio');
  await new Promise(z => setTimeout(z, 300));
  const pane = document.querySelector('.sxPane') || document.getElementById('scrSettings');
  out.music = pane ? pane.innerText.replace(/\s+/g, ' ') : '';
  Screens.show('playing');
  return out;
});
ck('aWarPartyOfAxemenIsAxemen', /3 Axemen/.test(words.party) && /2 Longbowmen/.test(words.party) && /1 Defender(?!s)/.test(words.party) && /2 Archers/.test(words.party) && !/mans\b/.test(words.party),
  `"${words.party}"`);
ck('theSettingsMusicLineIsTrue', !!words.music && !/not a recording/i.test(words.music) && /four recorded tunes/i.test(words.music),
  (/[^.]*(recording|recorded|music is)[^.]*\./i.exec(words.music) || ['(no music line)'])[0].trim());

ck('noPageErrors', errs.length === 0, errs.slice(0, 3).join(' | '));
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log(`${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log('ALL HUD-INFO CHECKS PASS');
