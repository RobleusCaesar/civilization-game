/* THE CARD SYSTEM — GROWTH (js/deckfx-growth.js): the eight cards of richer
   work, quicker hands and the Wonder, each measured doing exactly what its
   card says — and each trap the first reading of it walks into, measured so
   the naive version would fail here.

   This file pins:

     THE SWITCH        off, and on with no card running, every hook these
                       cards ride answers exactly what the game answered
                       before cards existed: a day of hand gathering, both
                       fishings, a station, the rival's hall trickle, a
                       hunt's meat, a site and an upgrade under a builder,
                       the masons' wall works and a span's reinforcing are
                       byte-identical with the hooks and without them; the
                       Wonder's price is the list price; and a card of one
                       kind never bleeds into another
     RICHER = MORE     (the operator's ruling) a card's multiplier is on the
                       CREDIT, never the pace: the ground is stripped at its
                       own rate, a stone seam gives 40% more stone over its
                       life (a pace multiplier gives not one stone more), both
                       fishings and a hunt's meat likewise, only the work is
                       scored, and the mode's own gather dial is untouched
     HARVEST FESTIVAL  (the rework) 40%, 12 days, at the bar; multiplies with
                       a different card, extends with itself
     BOUNTIFUL LAND    +50% for 20 days within 8 tiles of the hall's MIDDLE
                       (never its corner): gathering at the gatherer's feet,
                       a station by its middle, the hall's own gold, a kill
                       where it fell; nothing outside, nothing for the rival;
                       the panel says so; refused with no hall
     GOLDEN AGE        +50% work and +50% building for 20 days: sites,
                       upgrades, the masons' wall works and a span's
                       reinforcing — never repair, never the training yard,
                       never the rival's
     QUICK HANDS       x2 construction and upgrades for 6 days, the same
                       reach; a site with nobody at it rises no faster; the
                       days-left lines tell the truth; a sapper RAISING a
                       span works at the card's pace (it is construction),
                       a trench at its own (an earthwork is not)
     BLIGHT            the rival's hand loads, fishing, kills, stations and
                       hall trickle -40% for 15 days, its ground stripped at
                       its own pace; the inner market left alone; the
                       player's work untouched; the Calm truce left standing;
                       its look drawn only on what the player can SEE, and
                       its pall rolled toward the rival as the PLAYER knows
                       them
     ENLIGHTENMENT     the hall up one level at once, free, past the
                       three-building rule; every building to the hall's new
                       level — two steps where it stands two behind — walls
                       and gates through the village-wide tier; works under
                       way finished and paid back (a save from before the
                       masons kept their bill is paid the honest list
                       price; nothing to hand back is never called "free");
                       no upgrade scored; at hall Lv 3 everything to Lv 3; "Everything stands at
                       its height"
     AGE OF MARBLE     Calm only (kept, greyed, outside it); the Wonder a
                       quarter cheaper at the one cost point and twice as
                       fast under its builders — the PLAYER's Wonder alone,
                       never a house site or the rival's monument; laid
                       already, a quarter of what was PAID comes back and
                       never more; once a run; with a site standing the
                       card LANDS on the works (its dest) and the play never
                       cuts the camera away from them
     WONDER'S FOUNDATION  +35% of the works now, or the moment the Wonder is
                       laid (the charge waits, wears its chip on the strip,
                       rides the save, and the rival's monument never takes
                       it) — and never past 95%:
                       no card lays the last stone; it lands on a standing
                       site, and brings the works on screen only when the
                       ground breaking lays it
     SAVES / RNG       every timer and charge rides a save mid-flight; no
                       card draws from S.rngState at the play
     THE PICTURE       every card's show and every running card's look draws
                       at every beat without throwing, paints something, is
                       render state only, costs nothing with no card in play,
                       and never paints the off-map black (a control widens
                       the board and must see it lit); the lush ground is
                       painted once, in two breeze beats, and drawn from what
                       the player KNOWS (a rival barracks or a felled stand
                       out of sight changes nothing); and, read off the real
                       frame over HTTP, the meadow and the withered fields lie
                       UNDER the people standing on them (their opaque pixels
                       byte-identical) and the fog dims the lush ground on
                       remembered ground like the land under it

   Run after touching: js/deckfx-growth.js, Units.gatherYield / buildRate and
   their call sites (the gather, fish and shorefish tasks, the build task,
   the sapper's span,
   the meat in Units.damage, Units.workReport), Bld.dailyProduction,
   Bld.effCost / place / finishUpgrade / finishWallUpgrade / update (the wall
   works), AI.daily's hall trickle, UI.panelSub / wonderSavedLine,
   R.drawCardGround / cardBldLooks / drawCardBld (the ground pass and the
   building loop's card hooks) and DeckUI._dest (an effect's own dest).

     node tests/deck-growth.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Deck && window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// the shared scaffolding every section builds on
await p.evaluate(() => {
  Boot.force(); Screens._demo = false;
  const GROWTH = ['harvest_festival', 'bountiful_land', 'golden_age', 'quick_hands', 'blight', 'enlightenment', 'age_of_marble', 'wonders_foundation'];
  window.__g = {
    GROWTH,
    // a fresh run with the switch ON and a hand of every growth card
    fresh(seed, mode, size) {
      CFG.CARDS.ON = true;
      G.newGame(seed, mode || 'moderate', size || 'medium');
      S.paused = true;
      Deck._col = null; Deck._del(Deck.KEY);
      for (const id of GROWTH) Deck._add(id, 9);
      Combat.scanT = 0; Units.herdClock = 0;
      return S;
    },
    // a flat, fully known world with only the two halls on it, far apart
    flat() {
      const W = CFG.W;
      for (let i = 0; i < W * CFG.H; i++) {
        S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; S.map.resAmount[i] = 0;
        if (S.map.seenTerrain) S.map.seenTerrain[i] = T.GRASS;
        if (S.map.resMax) S.map.resMax[i] = 0;
      }
      S.units = []; S.buildings = S.buildings.filter(z => z.key === 'tc');
      const P = Bld.tcOf('P'), A = Bld.tcOf('A');
      P.x = 4; P.y = 4; A.x = W - 7; A.y = CFG.H - 7;
      Bld._block = null;
      return { P, A };
    },
    terr(x, y, t, amt) { const i = MapGen.idx(x, y); S.map.terrain[i] = t; if (amt != null) S.map.resAmount[i] = amt; if (S.map.seenTerrain) S.map.seenTerrain[i] = t; Bld._block = null; },
    unit(kind, owner, x, y) {
      const u = Units.spawn(kind, owner, Math.floor(x), Math.floor(y));
      u.x = x; u.y = y;
      return u;
    },
    bld(owner, key, x, y) {
      const bb = Bld.place(owner, key, x, y, { free: true, instant: true });
      Bld._block = null;
      return bb;
    },
    // a work site nobody is sent to, with `days` of work left
    site(owner, key, x, y, days) {
      const bb = Bld.place(owner, key, x, y, { free: true, noAutoAssign: true });
      if (days != null) bb.construction = days;
      Bld._block = null;
      return bb;
    },
    // one builder settled at a works
    builder(bb, owner) {
      const v = this.unit('villager', owner || bb.owner, bb.x - 0.5, bb.y + 0.5);
      Units.assignBuild(v, bb);
      for (let i = 0; i < 30; i++) Units.update(0.1);
      return v;
    },
    // what one day of Units.update takes off a clock
    dayOff(get) { const a = get(); for (let i = 0; i < 100; i++) Units.update(0.1); return a - get(); },
    // a station on its own ground, worked by one hand standing on it
    station(key, x, y, ground) {
      if (ground != null) this.terr(x, y, ground);
      const st = this.bld('P', key, x, y);
      const h = this.unit('villager', 'P', x + 0.5, y + 0.5); h.task = { type: 'work', id: st.id };
      return { st, h };
    },
    // the run's RNG, read before a play and after
    rng() { return S.rngState; },
    // a card running in the save, the way a load finds it
    live(id, days) { Deck.run().fx.push({ id, from: Deck.now(), until: Deck.now() + (days || 999) }); },
  };
});

// ---------------- 0. THE SWITCH: off, and on but idle, nothing moves ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    /* ONE deterministic economy that touches every hook these cards ride,
       run three ways: with the hooks reachable and no card running, with
       window.Deck gone (every hook's guard — the game as it was), and with a
       Golden Age and a Blight left running in the save (the CONTROL: the probe
       must be able to see a hook that moves). */
    const run = (mode) => {
      let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      CFG.CARDS.ON = mode !== 'off';
      G.newGame('growth-off', 'hard', 'medium'); S.paused = true;
      Combat.scanT = 0; Units.herdClock = 0;
      const { P, A } = __g.flat();
      if (mode === 'control') { __g.live('golden_age'); __g.live('blight'); }
      // a wood for each tribe, a lake with a boat and a shore line
      __g.terr(P.x + 6, P.y + 2, T.FOREST, 1e6); __g.terr(A.x - 4, A.y, T.FOREST, 1e6);
      const vP = __g.unit('villager', 'P', P.x + 5.5, P.y + 2.5), vA = __g.unit('villager', 'A', A.x - 4.5, A.y + 0.5);
      Units.assignGather(vP, P.x + 6, P.y + 2); Units.assignGather(vA, A.x - 4, A.y);
      for (let y = 14; y < 20; y++) for (let x = 14; x < 22; x++) __g.terr(x, y, T.WATER, 1e6);
      const boat = __g.unit('fishboat', 'P', 17.5, 16.5); Units.assignFish(boat, 17, 16);
      let shoal = null;
      for (let y = 14; y < 20 && !shoal; y++) for (let x = 14; x < 22 && !shoal; x++) if (MapGen.shoal(x, y)) shoal = { x, y };
      const fisher = __g.unit('villager', 'P', 12.5, 12.5);
      out.shoal = !!shoal && Units.assignShoreFish(fisher, shoal.x, shoal.y);
      // a station, a site, an upgrade, the masons and a span's works
      const { st } = __g.station('lumber', P.x + 3, P.y + 7, T.STUMPS);
      const site = __g.site('P', 'barracks', P.x + 8, P.y + 8, 30); __g.builder(site);
      const hut = __g.bld('P', 'house', P.x + 12, P.y + 3); hut.upgrading = 30; hut.upgTotal = 30; __g.builder(hut);
      const sore = __g.bld('P', 'house', P.x + 12, P.y + 6); sore.hp = sore.maxhp * 0.2; __g.builder(sore);
      const rsite = __g.site('A', 'house', A.x - 3, A.y - 4, 30); __g.builder(rsite, 'A');
      __g.bld('P', 'wall', P.x + 1, P.y + 12); P.wallUp = 9; P.wallUpTotal = 9; P.wallUpTarget = 2;
      for (let y = 24; y < 29; y++) __g.terr(30, y, T.WATER, 0);
      Bld.buildBridge('P', 30, 26);
      const br = Bld.bridgeAt(30, 26); br.upgrading = br.upTotal = 9; br.upTo = 2;
      const sc = __g.bld('P', 'sapper', 26, 22); sc.level = 3;
      const sap = __g.unit('sapper', 'P', 28.5, 26.5); Units.assignTerraform(sap, 30, 26, 'bridgeup');
      for (let i = 0; i < 300; i++) { Units.update(0.1); Bld.update(0.01); }
      Bld.dailyProduction('P'); Bld.dailyProduction('A');
      // the rival hall's trickle, isolated (the line between maybeWonder and the stations)
      let snap = null, trickle = null;
      const mw = AI.maybeWonder, dp = Bld.dailyProduction;
      AI.maybeWonder = function () { const v = mw.apply(this, arguments); snap = Object.assign({}, S.ai.res); return v; };
      Bld.dailyProduction = function (o) { if (o === 'A' && snap) { trickle = {}; for (const k in snap) trickle[k] = S.ai.res[k] - snap[k]; throw 'stop'; } return dp.apply(this, arguments); };
      try { AI.daily(); } catch (e) { if (e !== 'stop') throw e; }
      AI.maybeWonder = mw; Bld.dailyProduction = dp;
      const deer = __g.unit('deer', 'W', P.x + 3.5, P.y + 4.5); Units.damage(deer, 999, 0, 'P');
      const boar = __g.unit('boar', 'W', A.x - 2.5, A.y + 0.5); Units.damage(boar, 999, 0, 'A');
      const cost = Bld.effCost('P', 'wonder');
      return JSON.stringify([S.res, S.ai.res, S.stats.gathered, trickle, site.construction, hut.upgrading, sore.hp,
        rsite.construction, P.wallUp, br.upgrading, st.level, cost,
        Units.workReport(vP), Units.workReport(boat), Units.workReport(fisher)]);
    };
    const realRandom = Math.random;
    const idle = run('idle');
    const keep = window.Deck; window.Deck = undefined;
    const off = run('off');
    window.Deck = keep;
    const control = run('control');
    Math.random = realRandom;
    out.same = idle === off;
    out.seen = control !== idle;
    out.sample = idle.slice(0, 160);
    out.trickle = JSON.parse(idle)[3];
    out.diffs = (() => { const a = JSON.parse(idle), c = JSON.parse(control); return a.map((v, i) => JSON.stringify(v) === JSON.stringify(c[i]) ? 0 : 1); })();

    // on but idle, and a card of one kind never bleeds into another
    __g.fresh('growth-idle'); const { P } = __g.flat();
    const v = __g.unit('villager', 'P', P.x + 3.5, P.y + 3.5), va = __g.unit('villager', 'A', P.x + 3.5, P.y + 4.5);
    const hut = __g.bld('P', 'house', P.x + 5, P.y + 5);
    const list = JSON.stringify(Cards.buildCost('P', 'wonder', CFG.BUILDINGS.wonder.levels[0].cost));
    out.idle = [Units.gatherYield('P', v), Units.gatherYield('A', va), Deck.mult('produce', 'A', Bld.tcOf('A')),
      Deck.mult('produce', 'P', hut), Units.buildRate(hut), Deck.buildRate(hut)].every(k => k === 1) &&
      JSON.stringify(Bld.effCost('P', 'wonder')) === list;
    Deck.play('quick_hands');
    out.quickNoYield = Units.gatherYield('P', v) === 1 && Deck.mult('produce', 'P', hut) === 1 && Units.buildRate(hut) === 2;
    S.deck.fx = [];
    Deck.play('harvest_festival');
    out.festNoBuild = Units.buildRate(hut) === 1 && Units.gatherYield('P', v) === 1.4;
    S.deck.fx = [];
    Deck.play('blight');
    out.blightNoPlayer = Units.gatherYield('P', v) === 1 && Deck.mult('produce', 'P', hut) === 1 && Units.buildRate(hut) === 1 &&
      Units.gatherYield('A', va) === 0.6;
    CFG.CARDS.ON = false;
    out.offRefuses = __g.GROWTH.every(id => !Deck.play(id).ok);
    CFG.CARDS.ON = true;
    return out;
  });
  ck('offTheHooksChangeNothing', r.same && r.seen && r.trickle && r.trickle.gold > 0,
    r.same ? `gathering, fishing, a station, the hall's trickle (+${r.trickle && r.trickle.gold} gold), meat, a site, an upgrade, a repair, the masons and a span: byte-identical; a live Golden Age and Blight move them: ${r.seen} (${r.diffs.join('')})` : r.sample);
  ck('onButIdleEveryHookAnswersOne', r.idle);
  ck('aCardOfOneKindNeverBleedsIntoAnother', r.quickNoYield && r.festNoBuild && r.blightNoPlayer,
    `quick hands builds only ${r.quickNoYield}, the festival pays only ${r.festNoBuild}, the blight reaches only the rival ${r.blightNoPlayer}`);
  ck('offNothingCanBePlayed', r.offRefuses);
}

// ---------------- 1. RICHER IS MORE IN TOTAL, NOT FASTER (the festival) ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-yield'); const { P } = __g.flat();
    const tx = P.x + 8, ty = P.y + 2;
    __g.terr(tx, ty, T.FOREST, 1e6);
    const v = __g.unit('villager', 'P', tx - 0.5, ty + 0.5);
    Units.assignGather(v, tx, ty);
    for (let i = 0; i < 30; i++) Units.update(0.1);
    const i0 = MapGen.idx(tx, ty);
    const day = () => {
      const w0 = S.res.wood, a0 = S.map.resAmount[i0], g0 = S.stats.gathered;
      for (let i = 0; i < 100; i++) Units.update(0.1);
      return { wood: S.res.wood - w0, ground: a0 - S.map.resAmount[i0], scored: S.stats.gathered - g0 };
    };
    const base = day();
    const rate0 = Units.workReport(v).rate.n;
    const rng = __g.rng();
    out.play = Deck.play('harvest_festival');
    out.rng = __g.rng() === rng;
    out.days = +(Deck.timed('harvest_festival').until - Deck.now()).toFixed(6);
    out.at = Deck.FX.harvest_festival.at;
    const rich = day();
    out.base = base; out.rich = rich;
    out.loadRatio = rich.wood / base.wood;
    out.groundRatio = rich.ground / base.ground;
    out.scoredRatio = rich.scored / base.scored;
    out.panel = Units.workReport(v).rate.n / rate0;
    // A STONE SEAM over its whole life: 30 stone in it, worked out with the
    // festival on — 42 stone come home (a pace multiplier would bring 30)
    const sx = P.x + 8, sy = P.y + 10;
    __g.terr(sx, sy, T.HILLS, 30);
    v.task = null;   // the woodcutter downs tools: only the seam is counted below
    const q = __g.unit('villager', 'P', sx - 0.5, sy + 0.5);
    Units.assignGather(q, sx, sy);
    const s0 = S.res.stone, sc0 = S.stats.gathered;
    let n = 0;
    while (S.map.terrain[MapGen.idx(sx, sy)] === T.HILLS && n < 4000) { Units.update(0.1); n++; }
    out.seam = S.res.stone - s0; out.seamScored = S.stats.gathered - sc0; out.seamDone = S.map.terrain[MapGen.idx(sx, sy)] !== T.HILLS;
    // BOTH FISHINGS: a boat on a lake and a villager on its shore
    for (let y = 18; y < 26; y++) for (let x = 18; x < 28; x++) __g.terr(x, y, T.WATER, 1e6);
    const boat = __g.unit('fishboat', 'P', 22.5, 21.5); Units.assignFish(boat, 22, 21);
    let shoal = null;
    for (let y = 18; y < 26 && !shoal; y++) for (let x = 18; x < 28 && !shoal; x++) if (MapGen.shoal(x, y)) shoal = { x, y };
    const bank = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => ({ x: shoal.x + ox, y: shoal.y + oy }))
      .find(c => S.map.terrain[MapGen.idx(c.x, c.y)] !== T.WATER);
    const fisher = __g.unit('villager', 'P', bank.x + 0.5, bank.y + 0.5);
    Units.assignShoreFish(fisher, shoal.x, shoal.y);
    for (let i = 0; i < 40; i++) Units.update(0.1);
    const bi = MapGen.idx(22, 21), si = MapGen.idx(shoal.x, shoal.y);
    const fishDay = () => {
      const f0 = S.res.food, b0 = S.map.resAmount[bi], s1 = S.map.resAmount[si];
      for (let i = 0; i < 100; i++) Units.update(0.1);
      return { food: S.res.food - f0, boatGround: b0 - S.map.resAmount[bi], shoreGround: s1 - S.map.resAmount[si] };
    };
    v.task = null; q.task = null;
    const fRich = fishDay();
    const keepFx = S.deck.fx; S.deck.fx = [];
    const fBase = fishDay();
    S.deck.fx = keepFx;
    out.fishRatio = fRich.food / fBase.food;
    out.fishGround = [fRich.boatGround / fBase.boatGround, fRich.shoreGround / fBase.shoreGround];
    out.fishWorking = boat.task && boat.task.type === 'fish' && fisher.task && fisher.task.type === 'shorefish';
    // a hunt's meat
    const deer = __g.unit('deer', 'W', P.x + 3.5, P.y + 5.5);
    const m0 = S.res.food; Units.damage(deer, 999, 0, 'P'); out.meat = S.res.food - m0;
    // the MODE's own gather dial is the pace, untouched by any card
    __g.fresh('growth-hard', 'hard'); __g.flat();
    const hv = __g.unit('villager', 'P', 8.5, 8.5);
    const pace0 = Units.gatherMode(hv);
    Deck.play('harvest_festival'); Deck.play('golden_age');
    out.hardPace = [pace0, Units.gatherMode(hv), CFG.MODES.hard.gather];
    out.multiply = Units.gatherYield('P', hv);
    // the same card again extends, never stacks
    const u1 = Deck.timed('harvest_festival').until; Deck.play('harvest_festival');
    out.extend = +(Deck.timed('harvest_festival').until - u1).toFixed(6);
    out.stillOnePointFour = near(Deck.mult('gather', 'P', hv), 1.4 * 1.5);
    return out;
    function near(a, b2) { return Math.abs(a - b2) < 1e-9; }
  });
  ck('theFestivalRunsTwelveDaysAtTheBar', r.play.ok && r.days === 12 && r.at === 'bar', `${r.days} days, at '${r.at}'`);
  ck('eachLoadComesHome40PercentRicher', near(r.loadRatio, 1.4, 1e-6), `${r.base.wood.toFixed(3)} → ${r.rich.wood.toFixed(3)} wood a day`);
  ck('butTheGroundIsStrippedAtItsOwnPace', near(r.groundRatio, 1, 1e-9),
    `the stand gives ${r.base.ground.toFixed(3)} → ${r.rich.ground.toFixed(3)} a day (x${r.groundRatio.toFixed(6)})`);
  ck('aStoneSeamGives40PercentMoreOverItsLife', r.seamDone && near(r.seam, 42, 1e-6),
    `a 30-stone seam worked out: +${r.seam.toFixed(4)} stone (a pace card would bring 30)`);
  ck('andOnlyTheWorkIsScored', near(r.scoredRatio, 1, 1e-9) && near(r.seamScored, 30, 1e-6),
    `gathered x${r.scoredRatio.toFixed(6)} a day; the seam scores ${r.seamScored.toFixed(4)}`);
  ck('bothFishingsComeInRicherToo', r.fishWorking && near(r.fishRatio, 1.4, 1e-6) && r.fishGround.every(k => near(k, 1, 1e-9)),
    `food x${r.fishRatio.toFixed(6)}, the water stripped x${r.fishGround.map(k => k.toFixed(6)).join('/')}`);
  ck('andAHuntsMeat', r.meat === Math.round(30 * 1.4), `a deer: +${r.meat}`);
  ck('thePanelShowsTheRicherYield', near(r.panel, 1.4, 1e-9), 'x' + r.panel.toFixed(6));
  ck('theModesOwnDialIsUntouched', r.hardPace[0] === r.hardPace[2] && r.hardPace[1] === r.hardPace[2],
    `Hard's gather pace ${r.hardPace.join(' / ')}`);
  ck('twoCardsMultiplyOneCardExtends', near(r.multiply, 2.1, 1e-9) && r.extend === 12 && r.stillOnePointFour,
    `festival x golden age = ${r.multiply}; a second festival +${r.extend} days`);
  ck('andTheFestivalDrawsNoRng', r.rng);
}

// ---------------- 2. BOUNTIFUL LAND ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-bounty'); const { P } = __g.flat();
    const cx = Bld.cx(P), cy = Bld.cy(P);
    const rng = __g.rng();
    out.play = Deck.play('bountiful_land');
    out.rng = __g.rng() === rng;
    out.days = +(Deck.timed('bountiful_land').until - Deck.now()).toFixed(6);
    out.at = Deck.FX.bountiful_land.at;
    out.show = R.cardShows.some(s => s.id === 'bountiful_land');
    // the ring is measured from the hall's MIDDLE: 7.9 tiles east of it is in,
    // though 8.9 from the hall's corner; 8.1 is out
    const at = (x, y, o) => Units.gatherYield(o || 'P', { x, y });
    out.edge = [at(cx + 7.9, cy), at(cx + 8.1, cy), at(cx, cy - 7.95), at(cx + 6, cy + 6), at(cx + 5.6, cy + 5.6)];
    out.rival = at(cx + 2, cy, 'A');
    // a woodcutter in the ring and one out of it
    const wood = (x, y) => __g.terr(x, y, T.FOREST, 1e6);
    wood(Math.floor(cx + 5), Math.floor(cy)); wood(Math.floor(cx + 14), Math.floor(cy));
    const vin = __g.unit('villager', 'P', Math.floor(cx + 5) - 0.5, Math.floor(cy) + 0.5);
    const vout = __g.unit('villager', 'P', Math.floor(cx + 14) - 0.5, Math.floor(cy) + 0.5);
    Units.assignGather(vin, Math.floor(cx + 5), Math.floor(cy)); Units.assignGather(vout, Math.floor(cx + 14), Math.floor(cy));
    for (let i = 0; i < 30; i++) Units.update(0.1);
    out.report = [Units.workReport(vin).rate.n, Units.workReport(vout).rate.n];
    // stations: a lumber camp in the ring, a quarry out of it; the hall's gold
    const { st: campIn } = __g.station('lumber', Math.floor(cx + 3), Math.floor(cy + 3), T.STUMPS);
    const { st: quarryOut } = __g.station('quarry', Math.floor(cx + 10), Math.floor(cy + 4), T.PEBBLES);
    vin.task = null; vout.task = null;
    for (let i = 0; i < 30; i++) Units.update(0.1);
    const prod = () => { const r0 = Object.assign({}, S.res); Bld.dailyProduction('P'); const o = {}; for (const k in S.res) o[k] = S.res[k] - r0[k]; return o; };
    const rich = prod();
    const keep = S.deck.fx; S.deck.fx = [];
    const base = prod();
    S.deck.fx = keep;
    out.prod = { wood: rich.wood / base.wood, stone: rich.stone / base.stone, gold: rich.gold / base.gold };
    // the station panels say so
    UI.sel = { type: 'bld', id: campIn.id }; out.subIn = UI.panelSub();
    UI.sel = { type: 'bld', id: quarryOut.id }; out.subOut = UI.panelSub();
    UI.sel = null;
    const shown = (bb, k, m) => '+' + Math.round(Bld.lv(bb).out[k] * Bld.nearBonus(bb) * Bld.homesteadMult(bb) * m * 10) / 10 + ' ' + k + '/day';
    out.subWant = [shown(campIn, 'wood', 1.5), shown(quarryOut, 'stone', 1)];
    // a kill in the ring and one out of it
    const d1 = __g.unit('deer', 'W', cx + 3, cy + 2), d2 = __g.unit('deer', 'W', cx + 12, cy + 2);
    let f0 = S.res.food; Units.damage(d1, 999, 0, 'P'); out.meatIn = S.res.food - f0;
    f0 = S.res.food; Units.damage(d2, 999, 0, 'P'); out.meatOut = S.res.food - f0;
    // with the festival they multiply
    Deck.play('harvest_festival');
    out.both = Units.gatherYield('P', { x: cx + 2, y: cy });
    // the same card again lengthens it
    const u1 = Deck.timed('bountiful_land').until; Deck.play('bountiful_land');
    out.extend = +(Deck.timed('bountiful_land').until - u1).toFixed(6);
    // no hall, no card
    __g.fresh('growth-bounty-2'); __g.flat();
    S.buildings = S.buildings.filter(z => !(z.owner === 'P' && z.key === 'tc')); Bld._block = null;
    const n0 = Deck.count('bountiful_land');
    out.noHall = Deck.play('bountiful_land'); out.kept = Deck.count('bountiful_land') === n0;
    return out;
  });
  ck('bountifulLandRunsTwentyDays', r.play.ok && r.days === 20 && r.at === 'tc' && r.show, `${r.days} days, at '${r.at}', its show ${r.show}`);
  ck('theRingIsMeasuredFromTheHallsMiddle', r.edge[0] === 1.5 && r.edge[1] === 1 && r.edge[2] === 1.5 && r.edge[3] === 1 && r.edge[4] === 1.5,
    `7.9 E ${r.edge[0]}, 8.1 E ${r.edge[1]}, 7.95 N ${r.edge[2]}, (6,6) ${r.edge[3]}, (5.6,5.6) ${r.edge[4]}`);
  ck('aGathererInTheRingIs50PercentRicher', near(r.report[0] / r.report[1], 1.5, 1e-9), `panel ${r.report.map(k => k.toFixed(2)).join(' vs ')} wood a day`);
  ck('stationsByTheirMiddleAndTheHallsGold', near(r.prod.wood, 1.5) && near(r.prod.stone, 1) && near(r.prod.gold, 1.5),
    `camp in x${r.prod.wood}, quarry out x${r.prod.stone}, the hall's gold x${r.prod.gold}`);
  ck('theStationPanelSaysSo', r.subIn.includes(r.subWant[0]) && r.subOut.includes(r.subWant[1]),
    `${r.subIn.replace(/<[^>]+>/g, '')} | ${r.subOut.replace(/<[^>]+>/g, '')} (want ${r.subWant.join(' / ')})`);
  ck('aKillWhereItFell', r.meatIn === Math.round(30 * 1.5) && r.meatOut === 30, `in the ring +${r.meatIn}, out of it +${r.meatOut}`);
  ck('theRivalsHandsAreNotPaid', r.rival === 1);
  ck('withTheFestivalTheyMultiply', near(r.both, 2.1, 1e-9), 'x' + r.both);
  ck('aSecondBountyLengthensIt', r.extend === 20, `+${r.extend} days`);
  ck('noHallTheCardIsKept', !r.noHall.ok && r.noHall.why === 'Your Town Center must stand.' && r.kept, r.noHall.why);
  ck('andBountyDrawsNoRng', r.rng);
}

// ---------------- 3–4. GOLDEN AGE and QUICK HANDS: what rises, and what does not ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    const measure = (card) => {
      __g.fresh('growth-build-' + card); const { P, A } = __g.flat();
      const site = __g.site('P', 'barracks', P.x + 6, P.y + 6, 40); __g.builder(site);
      const hut = __g.bld('P', 'house', P.x + 12, P.y + 3); hut.upgrading = 40; hut.upgTotal = 40; __g.builder(hut);
      const sore = __g.bld('P', 'house', P.x + 12, P.y + 9); sore.hp = sore.maxhp * 0.1; __g.builder(sore);
      const lonely = __g.site('P', 'house', P.x + 2, P.y + 14, 40);
      const rsite = __g.site('A', 'barracks', A.x - 5, A.y - 5, 40); __g.builder(rsite, 'A');
      // the masons: a wall standing, the hall's works under way
      __g.bld('P', 'wall', P.x + 1, P.y + 18); P.wallUp = 40; P.wallUpTotal = 40; P.wallUpTarget = 2;
      // the training yard: a spear in the queue
      const yard = __g.bld('P', 'barracks', P.x + 16, P.y + 14); yard.queue.push({ unit: 'defender', t: 40 });
      // a span under reinforcement, its sapper at it
      for (let y = 24; y < 30; y++) __g.terr(30, y, T.WATER, 0);
      Bld.buildBridge('P', 30, 26);
      const br = Bld.bridgeAt(30, 26); br.upgrading = br.upTotal = 40; br.upTo = 2;
      const sc = __g.bld('P', 'sapper', 24, 22); sc.level = 3;
      const sap = __g.unit('sapper', 'P', 28.5, 26.5); Units.assignTerraform(sap, 30, 26, 'bridgeup');
      for (let i = 0; i < 30; i++) Units.update(0.1);
      const day = () => {
        sore.hp = sore.maxhp * 0.1;   // a repair that never reaches full inside the day
        const a = [site.construction, hut.upgrading, sore.hp, lonely.construction, rsite.construction, P.wallUp, yard.queue[0].t, br.upgrading];
        for (let i = 0; i < 100; i++) { Units.update(0.1); Bld.update(0.01); }
        const z = [site.construction, hut.upgrading, sore.hp, lonely.construction, rsite.construction, P.wallUp, yard.queue[0].t, br.upgrading];
        return a.map((v, i) => i === 2 ? z[i] - v : v - z[i]);
      };
      const base = day();
      const rng = __g.rng();
      const play = card ? Deck.play(card) : { ok: true };
      const rngOk = __g.rng() === rng;
      const fast = day();
      // the days-left lines, at the pace the works really go
      UI.sel = { type: 'bld', id: site.id };
      const sub = UI.panelSub(); UI.sel = null;
      const builder = S.units.find(u => u.task && u.task.type === 'build' && u.task.id === site.id);
      return { base, fast, play, rngOk, sub, left: builder && Units.workReport(builder).left, c: site.construction,
        days: card && +(Deck.timed(card).until - Deck.now()).toFixed(6), at: card && Deck.FX[card].at,
        rate: Units.buildRate(site), wallLeft: Math.ceil(P.wallUp / Units.buildRate(P)) };
    };
    out.golden = measure('golden_age');
    out.quick = measure('quick_hands');
    // the two together multiply
    __g.fresh('growth-build-both'); const { P } = __g.flat();
    const hut = __g.bld('P', 'house', P.x + 6, P.y + 6);
    Deck.play('golden_age'); Deck.play('quick_hands');
    out.both = Units.buildRate(hut);
    out.goldenWork = [Units.gatherYield('P', { x: 30, y: 30 }), Deck.mult('produce', 'P', hut)];
    return out;
  });
  const names = ['a site', 'an upgrade', 'a repair', 'a site with nobody at it', "the rival's site", 'the masons', 'the training yard', "a span's works"];
  for (const [card, k, label] of [['golden', 1.5, 'Golden Age'], ['quick', 2, 'Quick Hands']]) {
    const g = r[card], ratio = g.fast.map((v, i) => g.base[i] ? v / g.base[i] : (v === 0 ? 1 : Infinity));
    const want = [k, k, 1, 1, 1, k, 1, k];
    ck(`${card}PlaysAtTheHall`, g.play.ok && g.at === 'tc' && g.days === (card === 'golden' ? 20 : 6) && g.rngOk, `${g.days} days at '${g.at}', rng ${g.rngOk}`);
    ck(`${card}RaisesSitesAndUpgradesX${k}`, near(ratio[0], k, 1e-6) && near(ratio[1], k, 1e-6), `site x${ratio[0].toFixed(4)}, upgrade x${ratio[1].toFixed(4)}`);
    ck(`${card}SpeedsTheMasonsAndTheSpan`, near(ratio[5], k, 1e-6) && near(ratio[7], k, 1e-6), `wall works x${ratio[5].toFixed(4)}, bridge works x${ratio[7].toFixed(4)}`);
    ck(`${card}NeverMendsFasterOrTrainsFaster`, near(ratio[2], 1, 1e-6) && near(ratio[6], 1, 1e-9), `repair x${ratio[2].toFixed(4)}, training x${ratio[6].toFixed(4)}`);
    ck(`${card}NeverRaisesAnEmptySiteOrTheRivals`, g.base[3] === 0 && g.fast[3] === 0 && near(ratio[4], 1, 1e-6),
      `an empty site moved ${g.fast[3]}, the rival's x${ratio[4].toFixed(4)}`);
    ck(`${card}DaysLeftTellTheTruth`, new RegExp(Math.ceil(g.c / g.rate) + 'd of work left').test(g.sub) && near(g.left, g.c / g.rate, 1e-9),
      `${(g.sub.match(/\d+d of work left/) || ['?'])[0]} for ${g.c.toFixed(2)} days of work at x${g.rate}; work line ${g.left && g.left.toFixed(2)}`);
    void names; void want;
  }
  ck('goldenAgeWorkIs50PercentRicher', r.goldenWork[0] === 1.5 && r.goldenWork[1] === 1.5, JSON.stringify(r.goldenWork));
  ck('quickHandsAndGoldenAgeMultiply', near(r.both, 3, 1e-12), 'x' + r.both);
}

// ---------------- 3–4b. A SPAN RAISED IS CONSTRUCTION; THE EARTHWORKS ARE NOT ----------------
{
  const r = await p.evaluate(() => {
    const measure = (card) => {
      __g.fresh('growth-span-' + (card || 'none')); const { P } = __g.flat();
      const sc = __g.bld('P', 'sapper', P.x + 6, P.y + 2); sc.level = 3;
      for (let y = 10; y < 16; y++) __g.terr(20, y, T.WATER, 0);   // a channel to throw a span over
      const sap = __g.unit('sapper', 'P', 18.5, 12.5), dig = __g.unit('sapper', 'P', 10.5, 20.5);
      Units.assignTerraform(sap, 20, 12, 'bridge'); Units.assignTerraform(dig, 11, 20, 'dig');
      for (let i = 0; i < 30; i++) Units.update(0.1);
      if (card) Deck.play(card);
      const jobs = [sap.task && sap.task.job, dig.task && dig.task.job];
      if (sap.task) sap.task.t = 1000; if (dig.task) dig.task.t = 1000;
      for (let i = 0; i < 20; i++) Units.update(0.1);
      return { jobs, d: [1000 - (sap.task ? sap.task.t : 1000), 1000 - (dig.task ? dig.task.t : 1000)] };
    };
    return { none: measure(null), quick: measure('quick_hands'), golden: measure('golden_age') };
  });
  const q = r.quick.d.map((v, i) => v / r.none.d[i]), g = r.golden.d.map((v, i) => v / r.none.d[i]);
  ck('aSpanIsRaisedAtTheCardsPaceTheEarthworksAtTheirOwn', r.none.jobs.join() === 'bridge,dig' && r.none.d[0] > 1 &&
    near(q[0], 2, 1e-6) && near(g[0], 1.5, 1e-6) && near(q[1], 1, 1e-9) && near(g[1], 1, 1e-9),
    `a span raised x${q[0].toFixed(4)} under Quick Hands, x${g[0].toFixed(4)} under the Golden Age; a trench x${q[1].toFixed(4)} / x${g[1].toFixed(4)}`);
}

// ---------------- 5. BLIGHT ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-blight', 'calm'); const { P, A } = __g.flat();
    const peace0 = S.peace;
    // the rival's hands at work: a woodcutter, a boat, three hands for its stations
    __g.terr(A.x - 4, A.y, T.FOREST, 1e6);
    const vA = __g.unit('villager', 'A', A.x - 4.5, A.y + 0.5); Units.assignGather(vA, A.x - 4, A.y);
    for (let y = A.y - 12; y < A.y - 6; y++) for (let x = A.x - 12; x < A.x - 6; x++) __g.terr(x, y, T.WATER, 1e6);
    const boat = __g.unit('fishboat', 'A', A.x - 8.5, A.y - 8.5); Units.assignFish(boat, A.x - 9, A.y - 9);
    const camp = __g.bld('A', 'lumber', A.x - 2, A.y - 3); __g.terr(A.x - 2, A.y - 3, T.STUMPS);
    for (let k = 0; k < 2; k++) __g.unit('villager', 'A', A.x + 0.5, A.y - 1.5 - k);
    // …and the player's, side by side
    __g.terr(P.x + 6, P.y, T.FOREST, 1e6);
    const vP = __g.unit('villager', 'P', P.x + 5.5, P.y + 0.5); Units.assignGather(vP, P.x + 6, P.y);
    for (let i = 0; i < 40; i++) Units.update(0.1);
    const iA = MapGen.idx(A.x - 4, A.y), iB = MapGen.idx(A.x - 9, A.y - 9);
    const day = () => {
      const a = Object.assign({}, S.ai.res), pr = Object.assign({}, S.res), gA = S.map.resAmount[iA], gB = S.map.resAmount[iB];
      for (let i = 0; i < 100; i++) Units.update(0.1);
      const mid = Object.assign({}, S.ai.res), pmid = Object.assign({}, S.res);
      Bld.dailyProduction('A'); Bld.dailyProduction('P');
      return { hand: mid.wood - a.wood, fish: mid.food - a.food, ground: gA - S.map.resAmount[iA], water: gB - S.map.resAmount[iB],
        station: S.ai.res.wood - mid.wood, gold: S.ai.res.gold - mid.gold, player: pmid.wood - pr.wood, playerGold: S.res.gold - pmid.gold };
    };
    out.working = vA.task && vA.task.type === 'gather' && boat.task && boat.task.type === 'fish';
    const base = day();
    const breaks = []; const bp = G.breakPeace; G.breakPeace = function () { breaks.push(1); return bp.apply(this, arguments); };
    const rng = __g.rng();
    out.play = Deck.play('blight');
    out.rng = __g.rng() === rng;
    out.days = +(Deck.timed('blight').until - Deck.now()).toFixed(6);
    out.at = Deck.FX.blight.at;
    const cursed = day();
    out.base = base; out.cursed = cursed;
    out.ratio = {};
    for (const k of ['hand', 'fish', 'ground', 'water', 'station', 'gold', 'player', 'playerGold']) out.ratio[k] = cursed[k] / base[k];
    // a kill of theirs
    const deer = __g.unit('deer', 'W', A.x - 1.5, A.y + 3.5);
    const f0 = S.ai.res.food; Units.damage(deer, 999, 0, 'A'); out.meat = S.ai.res.food - f0;
    // the hall's own trickle, isolated in AI.daily
    const json = G.saveJSON();
    const trickle = () => {
      let snap = null, t = null;
      const mw = AI.maybeWonder, dp = Bld.dailyProduction;
      AI.maybeWonder = function () { const v = mw.apply(this, arguments); snap = Object.assign({}, S.ai.res); return v; };
      Bld.dailyProduction = function (o) { if (o === 'A' && snap) { t = {}; for (const k in snap) t[k] = S.ai.res[k] - snap[k]; throw 'stop'; } return dp.apply(this, arguments); };
      let seed = 3; const rr = Math.random; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      try { AI.daily(); } catch (e) { if (e !== 'stop') throw e; }
      AI.maybeWonder = mw; Bld.dailyProduction = dp; Math.random = rr;
      return t;
    };
    const tCursed = trickle();
    G.loadJSON(json); S.deck.fx = [];
    const tBase = trickle();
    out.trickle = {}; for (const k in tBase) out.trickle[k] = tCursed[k] / tBase[k];
    // the inner market is conversion, not production: identical either way
    const market = (live) => {
      G.loadJSON(json); if (!live) S.deck.fx = [];
      S.ai.convert = null; S.ai.goal = null;
      S.ai.res = { food: 20, wood: 2000, stone: 900, gold: 900 };
      AI.autoConvert();
      return JSON.stringify([S.ai.convert, S.ai.res]);
    };
    out.market = [market(true), market(false)];
    G.loadJSON(json);
    out.peace = peace0 === true && S.peace === true && breaks.length === 0;
    G.breakPeace = bp;
    // a second blight lengthens the first
    const u1 = Deck.timed('blight').until; Deck.play('blight');
    out.extend = +(Deck.timed('blight').until - u1).toFixed(6);
    return out;
  });
  ck('blightRunsFifteenDays', r.play.ok && r.days === 15 && r.rng, `${r.days} days at '${r.at}'`);
  ck('theRivalsHandsBringIn40PercentLess', r.working && near(r.ratio.hand, 0.6, 1e-6) && near(r.ratio.ground, 1, 1e-9),
    `a load x${r.ratio.hand.toFixed(6)}, the stand stripped x${r.ratio.ground.toFixed(6)}`);
  ck('andItsNetsAndItsKills', near(r.ratio.fish, 0.6, 1e-6) && near(r.ratio.water, 1, 1e-9) && r.meat === Math.round(30 * 0.6),
    `fish x${r.ratio.fish.toFixed(6)} (the water x${r.ratio.water.toFixed(6)}), a deer +${r.meat}`);
  ck('andItsStationsAndItsHallsTrickle', near(r.ratio.station, 0.6) && ['food', 'wood', 'stone', 'gold'].every(k => near(r.trickle[k], 0.6, 1e-9)),
    `camp x${r.ratio.station}, trickle ${JSON.stringify(r.trickle)}`);
  ck('theInnerMarketIsLeftAlone', r.market[0] === r.market[1], r.market[0]);
  ck('yourOwnWorkIsUntouched', near(r.ratio.player, 1, 1e-9) && near(r.ratio.playerGold, 1, 1e-9), `x${r.ratio.player}, gold x${r.ratio.playerGold}`);
  ck('aBlightLeavesTheTruceStanding', r.peace);
  ck('aSecondBlightLengthensIt', r.extend === 15, `+${r.extend} days`);
}

// ---------------- 5b. BLIGHT: the look and the pall are fog-honest ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-blight-look'); const { P, A } = __g.flat();
    Screens.show('playing');
    const farm = __g.bld('A', 'farm', A.x - 3, A.y + 1);
    Deck.play('blight');
    R.cardShows.length = 0;
    R.centerOn(farm.x + 0.5, farm.y + 0.5);
    const e = Deck.timed('blight');
    // count what the live look paints on the rival's farm
    const count = () => {
      let n = 0; const bb = R.blitBld, fr = CanvasRenderingContext2D.prototype.fillRect;
      R.blitBld = function () { n++; return bb.apply(this, arguments); };
      CanvasRenderingContext2D.prototype.fillRect = function () { n++; return fr.apply(this, arguments); };
      try { Deck.FX.blight.drawBld(R.ctx || R.cv.getContext('2d'), farm, e); } finally { R.blitBld = bb; CanvasRenderingContext2D.prototype.fillRect = fr; }
      return n;
    };
    const W = CFG.W;
    G.vis = new Uint8Array(W * CFG.H);           // nothing of theirs in sight
    out.hidden = count();
    G.vis[MapGen.idx(farm.x, farm.y)] = 1;        // their farm in sight
    out.seen = count();
    // the pall: with no memory of their hall it rolls AWAY from the player's
    // own seat, wherever the rival really is — put the real hall close by,
    // due east of the player's, the other way from the guess
    P.x = W - 16; P.y = CFG.H - 16; A.x = P.x + 8; A.y = P.y; Bld._block = null;
    S.map.seenB = {};
    R.centerOn(Bld.cx(P), Bld.cy(P));
    const blind = Deck.FX.blight.towardRival();
    const mid = GrowFX.mid();
    const unit = (x, y) => { const L = Math.hypot(x, y); return { x: x / L, y: y / L }; };
    const away = unit((W - Bld.cx(P)) - mid.x, (CFG.H - Bld.cy(P)) - mid.y);
    const truth = unit(Bld.cx(A) - mid.x, Bld.cy(A) - mid.y);
    out.blindAway = blind.x * away.x + blind.y * away.y > 0.99;
    out.blindNotToTruth = blind.x * truth.x + blind.y * truth.y < 0;
    // with their hall remembered, it rolls toward the memory
    S.map.seenB[MapGen.idx(A.x, A.y)] = { key: 'tc', owner: 'A', level: 1 };
    const known = Deck.FX.blight.towardRival();
    out.knownToward = known.x * truth.x + known.y * truth.y > 0.99;
    return out;
  });
  ck('theBlightsLookIsDrawnOnlyWhereYouCanSee', r.hidden === 0 && r.seen > 0, `a farm in the fog: ${r.hidden} marks; in sight: ${r.seen}`);
  ck('andItsPallRollsTowardWhatYouKnow', r.blindAway && r.blindNotToTruth && r.knownToward,
    `blind: away from your seat ${r.blindAway}, not toward the truth ${r.blindNotToTruth}; remembered: toward their hall ${r.knownToward}`);
}

// ---------------- 6. ENLIGHTENMENT ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    // A0: a hall standing ALONE — no building at its level, so no upgrade is
    // possible by hand (the three-building rule) — rises all the same
    __g.fresh('growth-enl-0'); const z0 = __g.flat();
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    out.support0 = Bld.tcSupport(z0.P);
    out.canUp0 = Bld.canUpgrade(z0.P).ok;
    out.a0 = Deck.play('enlightenment'); out.a0Level = z0.P.level;
    __g.fresh('growth-enl'); const { P } = __g.flat();
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    const house = __g.bld('P', 'house', P.x + 4, P.y);
    const { st: farm } = __g.station('farm', P.x + 4, P.y + 3, T.BARREN);
    const barracks = __g.bld('P', 'barracks', P.x + 7, P.y);
    const camp = __g.bld('P', 'warcamp', P.x + 7, P.y + 4);
    __g.terr(P.x + 11, P.y, T.GOLDORE);
    const mine = __g.bld('P', 'mine', P.x + 11, P.y);
    const wall = __g.bld('P', 'wall', P.x, P.y + 8), gate = __g.bld('P', 'gate', P.x + 1, P.y + 8);
    const hutSite = __g.site('P', 'house', P.x + 4, P.y + 10, 3);
    const res0 = JSON.stringify(S.res), up0 = S.stats.upgrades || 0, rng = __g.rng(), n0 = Deck.count('enlightenment');
    // STEP A: hall Lv 1 → 2
    out.a = Deck.play('enlightenment');
    out.aRng = __g.rng() === rng;
    out.aSpent = n0 - Deck.count('enlightenment');
    out.aLevels = { tc: P.level, house: house.level, farm: farm.level, barracks: barracks.level, camp: camp.level, mine: mine.level,
      wall: wall.level, gate: gate.level, wallLevel: S.wallLevel, site: hutSite.level, siteLeft: hutSite.construction };
    out.aHp = [house.hp === CFG.BUILDINGS.house.levels[1].hp, wall.maxhp === CFG.BUILDINGS.wall.levels[1].hp];
    out.aFree = JSON.stringify(S.res) === res0;
    out.aScored = (S.stats.upgrades || 0) - up0;
    out.aLog = S.log[0].msg;
    out.aShow = R.cardShows.some(s => s.id === 'enlightenment');
    // STEP B: hall Lv 2 → 3 with work in flight — the hall's own upgrade, a
    // lumber camp mid-upgrade (L1 → L2) under its builder; the mine L1 stands
    // two behind the hall's new level
    mine.level = 1; mine.maxhp = mine.hp = CFG.BUILDINGS.mine.levels[0].hp;
    const { st: lumber, h: lhand } = __g.station('lumber', P.x + 14, P.y + 4, T.STUMPS);
    for (let i = 0; i < 20; i++) Units.update(0.1);
    out.lumberUp = Bld.upgrade(lumber);
    out.hallUp = Bld.upgrade(P);
    const paidRes = Object.assign({}, S.res);
    const want = {};
    const add = c => { for (const k in c) want[k] = (want[k] || 0) + c[k]; };
    add(CFG.BUILDINGS.lumber.levels[1].cost); add(CFG.BUILDINGS.tc.levels[2].cost);
    out.b = Deck.play('enlightenment');
    out.bLevels = { tc: P.level, mine: mine.level, lumber: lumber.level, house: house.level, farm: farm.level, barracks: barracks.level, wallLevel: S.wallLevel,
      lumberUp: lumber.upgrading, tcUp: P.upgrading };
    out.bBack = {}; for (const k in S.res) out.bBack[k] = S.res[k] - paidRes[k];
    out.bWant = want;
    out.bScored = (S.stats.upgrades || 0) - up0;
    // and the builders never lift anything past the hall afterwards
    for (let i = 0; i < 300; i++) { Units.update(0.1); Bld.update(0.01); }
    out.bAfter = { lumber: lumber.level, mine: mine.level, hand: lhand.task && lhand.task.type };
    out.maxLevel = Math.max(...S.buildings.filter(z => z.owner === 'P').map(z => z.level));
    // …and once a Lv 3 hall has brought everything up, everything stands at its height
    const n1 = Deck.count('enlightenment');
    out.d = Deck.play('enlightenment'); out.dKept = Deck.count('enlightenment') === n1;
    out.dCan = Deck.canPlay('enlightenment');
    // STEP C: a hall ALREADY at Lv 3 does not rise, and everything else rises to
    // Lv 3 — a house at Lv 1, a barracks at Lv 2, the walls at the first tier
    __g.fresh('growth-enl-3'); const z3 = __g.flat();
    z3.P.level = 3; z3.P.maxhp = z3.P.hp = CFG.BUILDINGS.tc.levels[2].hp;
    const h3 = __g.bld('P', 'house', z3.P.x + 4, z3.P.y), b3 = __g.bld('P', 'barracks', z3.P.x + 7, z3.P.y);
    b3.level = 2;
    __g.bld('P', 'wall', z3.P.x, z3.P.y + 8);
    out.c = Deck.play('enlightenment');
    out.cLevels = S.buildings.filter(z => z.owner === 'P').map(z => z.key + ':' + z.level);
    out.cWall = S.wallLevel; out.cHall = z3.P.level;
    void h3;

    // THE MASONS' WORKS IN FLIGHT, and a town with no walls at all
    __g.fresh('growth-enl-walls'); const w2 = __g.flat();
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    __g.bld('P', 'wall', w2.P.x, w2.P.y + 8); __g.bld('P', 'wall', w2.P.x + 1, w2.P.y + 8);
    w2.P.level = 2;
    const r0 = Object.assign({}, S.res);
    out.wallsUp = Bld.upgradeWalls();
    const paidW = {}; for (const k in r0) paidW[k] = r0[k] - S.res[k];
    const r1 = Object.assign({}, S.res);
    out.w = Deck.play('enlightenment');
    out.wBack = {}; for (const k in r1) out.wBack[k] = S.res[k] - r1[k];
    out.wPaid = paidW;
    out.wState = { wallLevel: S.wallLevel, wallUp: w2.P.wallUp, tc: w2.P.level, walls: Bld.forts('P').map(z => z.level) };
    // …and with every section razed since the masons were paid: paid back
    // ONCE, the works finished to the tier they were paid for and no further
    // (no wall stands to raise), nothing left ticking to land the tier again
    __g.fresh('growth-enl-razed'); const w4 = __g.flat();
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    __g.bld('P', 'wall', w4.P.x, w4.P.y + 8);
    w4.P.level = 2;
    const q0 = Object.assign({}, S.res);
    Bld.upgradeWalls();
    S.buildings = S.buildings.filter(z => z.key !== 'wall'); Bld._block = null;
    out.razed = Deck.play('enlightenment');
    for (let i = 0; i < 600; i++) Bld.update(0.01);
    out.razedState = { wallUp: w4.P.wallUp, wallLevel: S.wallLevel, net: ['food', 'wood', 'stone', 'gold'].map(k => S.res[k] - q0[k]) };
    // A SAVE FROM BEFORE THE MASONS KEPT THEIR BILL (no tc.wallUpPaid): the
    // works in flight pay back the honest list price of the tier they were
    // raising for the walls standing now — and a run whose walls are all gone
    // has nothing to hand back, and never says "free paid for it comes back"
    __g.fresh('growth-enl-legacy'); const w5 = __g.flat();
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    __g.bld('P', 'wall', w5.P.x, w5.P.y + 8); __g.bld('P', 'gate', w5.P.x + 1, w5.P.y + 8);
    w5.P.level = 2;
    const lw0 = Object.assign({}, S.res);
    Bld.upgradeWalls(); delete w5.P.wallUpPaid;
    out.legacyPaid = {}; for (const k in lw0) out.legacyPaid[k] = lw0[k] - S.res[k];
    const lw1 = Object.assign({}, S.res);
    out.legacy = Deck.play('enlightenment');
    out.legacyBack = {}; for (const k in lw1) out.legacyBack[k] = S.res[k] - lw1[k];
    out.legacyLog = S.log[0].msg;
    __g.fresh('growth-enl-legacy-razed'); const w6 = __g.flat();
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    __g.bld('P', 'wall', w6.P.x, w6.P.y + 8);
    w6.P.level = 2;
    Bld.upgradeWalls(); delete w6.P.wallUpPaid;
    S.buildings = S.buildings.filter(z => z.key !== 'wall'); Bld._block = null;
    const lw2 = JSON.stringify(S.res);
    out.legacyRazed = Deck.play('enlightenment');
    out.legacyRazedSame = JSON.stringify(S.res) === lw2;
    out.legacyRazedLog = S.log[0].msg;
    __g.fresh('growth-enl-nowalls'); const w3 = __g.flat();
    out.nw = Deck.play('enlightenment');
    out.nwWall = S.wallLevel;
    // no hall, no card
    S.buildings = S.buildings.filter(z => !(z.owner === 'P' && z.key === 'tc')); Bld._block = null;
    out.noHall = Deck.canPlay('enlightenment');
    void w3;
    return out;
  });
  ck('theHallRisesOneLevelFreePastTheThreeBuildingRule', r.a0.ok && r.a0Level === 2 && r.support0 === 0 && !r.canUp0 &&
    r.a.ok && r.aLevels.tc === 2 && r.aFree && r.aSpent === 1 && r.a.fly && Object.keys(r.a.fly).length === 0,
    `a hall alone (support ${r.support0}, upgradable by hand ${r.canUp0}) rises to Lv ${r.a0Level}; in a town Lv ${r.aLevels.tc}, stores untouched ${r.aFree}`);
  ck('everyBuildingRisesToTheHallsNewLevel', r.aLevels.house === 2 && r.aLevels.farm === 2 && r.aLevels.barracks === 2 && r.aLevels.mine === 2 && r.aHp[0],
    JSON.stringify(r.aLevels));
  ck('theWallsAndGatesWithThem', r.aLevels.wall === 2 && r.aLevels.gate === 2 && r.aLevels.wallLevel === 2 && r.aHp[1], `wall Lv ${r.aLevels.wall}, gate Lv ${r.aLevels.gate}, tier ${r.aLevels.wallLevel}`);
  ck('aSiteAndASingleTierWorkAreLeftAsTheyAre', r.aLevels.site === 1 && r.aLevels.siteLeft === 3 && r.aLevels.camp === 1, `site Lv ${r.aLevels.site} (${r.aLevels.siteLeft} days left), war camp Lv ${r.aLevels.camp}`);
  ck('aBuildingTwoBehindRisesTwoSteps', r.b.ok && r.bLevels.tc === 3 && r.bLevels.mine === 3, `the mine Lv 1 → ${r.bLevels.mine} under a Lv ${r.bLevels.tc} hall`);
  ck('worksUnderWayAreFinishedAndPaidBack', r.lumberUp && r.hallUp && r.bLevels.lumber === 3 && r.bLevels.lumberUp === 0 && r.bLevels.tcUp === 0 &&
    ['food', 'wood', 'stone', 'gold'].every(k => (r.bBack[k] || 0) === (r.bWant[k] || 0) && ((r.b.fly || {})[k] || 0) === (r.bWant[k] || 0)),
    `back ${JSON.stringify(r.bBack)} for ${JSON.stringify(r.bWant)}; lumber Lv ${r.bLevels.lumber}`);
  ck('andTheBuildersNeverLiftItPastTheHall', r.bAfter.lumber === 3 && r.bAfter.mine === 3 && r.maxLevel === 3 && r.bAfter.hand !== 'build',
    `${JSON.stringify(r.bAfter)}, highest level standing ${r.maxLevel}`);
  ck('noUpgradeIsScored', r.aScored === 0 && r.bScored === 0, `+${r.aScored}, +${r.bScored} upgrades`);
  ck('atHallLv3EverythingElseRisesToLv3', r.c.ok && r.cHall === 3 && r.cLevels.every(s => /:3$/.test(s)) && r.cWall === 3, r.cLevels.join(' ') + ' · walls ' + r.cWall);
  ck('everythingAtItsHeightIsRefused', !r.d.ok && r.d.why === 'Everything stands at its height' && r.dKept && r.dCan.why === 'Everything stands at its height', r.d.why);
  ck('theMasonsWorksAreFinishedAndPaidBack', r.wallsUp && r.w.ok && r.wState.wallLevel === 3 && r.wState.wallUp === 0 && r.wState.walls.every(l => l === 3) &&
    ['food', 'wood', 'stone', 'gold'].every(k => (r.wBack[k] || 0) === (r.wPaid[k] || 0)), `${JSON.stringify(r.wState)}; back ${JSON.stringify(r.wBack)} for ${JSON.stringify(r.wPaid)}`);
  ck('worksWhoseWallsAreGoneAreFinishedOnce', r.razed.ok && r.razedState.wallUp === 0 && r.razedState.wallLevel === 2 && r.razedState.net.every(n => n === 0),
    JSON.stringify(r.razedState));
  ck('aSaveWithoutTheMasonsBillIsPaidTheHonestPrice', r.legacy.ok && ['food', 'wood', 'stone', 'gold'].every(k => (r.legacyBack[k] || 0) === (r.legacyPaid[k] || 0)) &&
    /comes back/.test(r.legacyLog) && !/free/.test(r.legacyLog), `back ${JSON.stringify(r.legacyBack)} for ${JSON.stringify(r.legacyPaid)} — "${r.legacyLog}"`);
  ck('andNothingToHandBackIsNeverCalledFree', r.legacyRazed.ok && r.legacyRazedSame && /already under way was finished\.$/.test(r.legacyRazedLog) && !/free|comes back/.test(r.legacyRazedLog),
    r.legacyRazedLog);
  ck('withNoWallsTheWallTierStays', r.nw.ok && r.nwWall === 1, `tier ${r.nwWall}`);
  ck('noHallNoEnlightenment', !r.noHall.ok && r.noHall.why === 'Your Town Center must stand.', r.noHall.why);
  ck('andEnlightenmentDrawsNoRng', r.aRng);
  ck('itsShowStartsAndItSaysWhatItDid', r.aShow && /Town Center stands at Lv 2/.test(r.aLog), r.aLog);
}

// ---------------- 7. AGE OF MARBLE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    const LIST = CFG.BUILDINGS.wonder.levels[0].cost;
    // outside Calm the card stays in the hand
    __g.fresh('growth-marble-mod', 'moderate'); __g.flat();
    out.mod = Deck.canPlay('age_of_marble'); out.modFound = Deck.canPlay('wonders_foundation');
    const n0 = Deck.count('age_of_marble');
    out.modPlay = Deck.play('age_of_marble'); out.modKept = Deck.count('age_of_marble') === n0;
    // Calm, before the ground is broken
    __g.fresh('growth-marble', 'calm'); const { P } = __g.flat();
    const list = Cards.buildCost('P', 'wonder', LIST);
    out.listBefore = JSON.stringify(Bld.effCost('P', 'wonder')) === JSON.stringify(list);
    const rivalBefore = JSON.stringify(Bld.effCost('A', 'wonder'));
    const rng = __g.rng();
    out.play = Deck.play('age_of_marble');
    out.rng = __g.rng() === rng;
    out.cost = Bld.effCost('P', 'wonder');
    out.want = {}; for (const k in list) out.want[k] = Math.round(list[k] * 0.75);
    out.rival = [rivalBefore, JSON.stringify(Bld.effCost('A', 'wonder'))];
    out.saved = (() => { S.res = Object.assign({}, out.want); return UI.wonderSavedLine(); })();
    // laid at the cheaper price, raised twice as fast under one builder
    S.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
    const r0 = Object.assign({}, S.res);
    const w = Bld.place('P', 'wonder', P.x + 6, P.y + 6, { noAutoAssign: true }); Bld._block = null;
    out.paid = {}; for (const k in r0) out.paid[k] = r0[k] - S.res[k];
    out.wPaid = Object.assign({}, w.paid);
    const nobody = __g.dayOff(() => w.construction);
    __g.builder(w);
    const fast = __g.dayOff(() => w.construction);
    out.nobody = nobody; out.fast = fast;
    // …and ONLY the player's Wonder: a house site of theirs and the rival's own
    // monument rise at the ordinary pace under one builder each
    const hs = __g.site('P', 'house', P.x + 2, P.y + 14, 30); __g.builder(hs);
    out.house = __g.dayOff(() => hs.construction);
    const ra = Bld.tcOf('A');
    const rwon = Bld.place('A', 'wonder', ra.x - 7, ra.y - 7, { free: true, noAutoAssign: true }); Bld._block = null;
    __g.builder(rwon, 'A');
    out.rivalW = __g.dayOff(() => rwon.construction);
    out.rising = UI.wonderSavedLine(); out.left = w.construction;
    out.again = Deck.play('age_of_marble');
    // it rides the save
    G.loadJSON(G.saveJSON());
    out.saved2 = !!S.deck.charges.marble && JSON.stringify(Bld.effCost('P', 'wonder')) === JSON.stringify(out.want);
    out.over = S.over;
    // LAID ALREADY: a quarter of what was PAID comes back, and a works called
    // off later hands back only the rest
    __g.fresh('growth-marble-laid', 'calm'); const q = __g.flat();
    S.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
    const w2 = Bld.place('P', 'wonder', q.P.x + 6, q.P.y + 6, { noAutoAssign: true }); Bld._block = null;
    const paid2 = Object.assign({}, w2.paid);
    const s1 = Object.assign({}, S.res);
    out.laid = Deck.play('age_of_marble');
    out.back = {}; for (const k in s1) out.back[k] = S.res[k] - s1[k];
    out.backWant = {}; for (const k in paid2) out.backWant[k] = Math.floor(paid2[k] * 0.25);
    const s2 = Object.assign({}, S.res);
    Bld.cancelBuild(w2);
    out.rest = {}; for (const k in s2) out.rest[k] = S.res[k] - s2[k];
    out.total = {}; for (const k in paid2) out.total[k] = out.back[k] + out.rest[k];
    out.paid2 = paid2;
    // THE CARD LANDS ON THE WORKS: with a site standing off screen the play
    // sequence carries the card to the Wonder (its dest), and the play itself
    // never cuts the camera away from where the light came down
    __g.fresh('growth-marble-dest', 'calm'); const dz = __g.flat();
    Screens.show('playing');
    out.destNone = Deck.FX.age_of_marble.dest ? Deck.FX.age_of_marble.dest() : 'no dest';
    const wd = Bld.place('P', 'wonder', dz.P.x + 20, dz.P.y + 20, { free: true, noAutoAssign: true }); Bld._block = null;
    R.cam.z = 2; R.centerOn(Bld.cx(dz.P), Bld.cy(dz.P));
    const pt = DeckUI._dest('tc', 'age_of_marble'), cam = [R.cam.x, R.cam.y];
    out.destPlay = Deck.play('age_of_marble');
    out.camStill = R.cam.x === cam[0] && R.cam.y === cam[1];
    const TLd = CFG.TILE;
    out.destErr = Math.hypot((Bld.cx(wd) * TLd - R.cam.x) * R.cam.z - pt.x, (Bld.cy(wd) * TLd - R.cam.y) * R.cam.z - pt.y);
    out.destBurst = out.destPlay.x === Bld.cx(wd) && out.destPlay.y === Bld.cy(wd);
    // a FREE site (paid nothing) is handed nothing back
    __g.fresh('growth-marble-free', 'calm'); const f = __g.flat();
    const w3 = Bld.place('P', 'wonder', f.P.x + 6, f.P.y + 6, { free: true, noAutoAssign: true }); Bld._block = null;
    const s3 = JSON.stringify(S.res);
    out.free = Deck.play('age_of_marble'); out.freeSame = JSON.stringify(S.res) === s3;
    void w3;
    return out;
  });
  const CALM = 'The Wonder rises only in Calm worlds.';
  ck('outsideCalmTheWonderCardsStayInTheHand', !r.mod.ok && r.mod.why === CALM && !r.modFound.ok && r.modFound.why === CALM && !r.modPlay.ok && r.modKept,
    `${r.mod.why} / ${r.modFound.why}`);
  ck('theWonderIsAQuarterCheaperAtTheOneCostPoint', r.play.ok && r.listBefore && JSON.stringify(r.cost) === JSON.stringify(r.want) &&
    ['food', 'wood', 'stone', 'gold'].every(k => r.paid[k] === r.want[k] && r.wPaid[k] === r.want[k]) && r.saved === 'Ready to raise',
    `${JSON.stringify(r.cost)}; paid ${JSON.stringify(r.paid)}; with exactly that saved: "${r.saved}"`);
  ck('andTheRivalsIsNot', r.rival[0] === r.rival[1], r.rival[1]);
  ck('andOnlyYourWonderRisesFaster', near(r.house, 1, 1e-6) && near(r.rivalW, 1, 1e-6),
    `your house site x${r.house.toFixed(4)}, the rival's monument x${r.rivalW.toFixed(4)} under one builder each`);
  ck('theCardLandsOnTheWorksAndStaysThere', r.destNone === null && r.destPlay.ok && r.camStill && r.destErr < 1 && r.destBurst,
    `no site: ${JSON.stringify(r.destNone)}; landed ${r.destErr.toFixed(2)}px from the works; the camera kept still ${r.camStill}`);
  ck('itRisesTwiceAsFastUnderItsBuilders', r.nobody === 0 && near(r.fast, 2, 1e-6) && r.rising === 'Rising — ' + Math.ceil(r.left / 2) + ' days' && r.over === null,
    `nobody at it: ${r.nobody}; one builder: ${r.fast.toFixed(4)} days of work a day; "${r.rising}" for ${r.left.toFixed(2)} days of work`);
  ck('laidAlreadyAQuarterOfWhatWasPaidComesBack', r.laid.ok && ['food', 'wood', 'stone', 'gold'].every(k => r.back[k] === r.backWant[k] && r.total[k] === r.paid2[k]), `back ${JSON.stringify(r.back)}; called off later ${JSON.stringify(r.rest)}; together ${JSON.stringify(r.total)} = paid`);
  ck('andAFreeSiteGetsNothingBack', r.free.ok && r.freeSame);
  ck('aSecondAgeHasNothingToGive', !r.again.ok && r.again.why === 'The Age of Marble has already come.', r.again.why);
  ck('theAgeRidesTheSave', r.saved2);
  ck('andMarbleDrawsNoRng', r.rng);
}

// ---------------- 8. WONDER'S FOUNDATION ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    const T45 = CFG.BUILDINGS.wonder.levels[0].time;
    __g.fresh('growth-found', 'calm'); const { P } = __g.flat();
    const raised = []; const wr = G.wonderRaised; G.wonderRaised = function () { raised.push(1); };
    const fin = []; const bf = Bld.finish; Bld.finish = function (bb) { if (bb && bb.key === 'wonder') fin.push(1); return bf.apply(this, arguments); };
    // a standing site gains 35% of its work
    const w = __g.site('P', 'wonder', P.x + 6, P.y + 6);
    out.start = w.construction;
    const rng = __g.rng();
    out.play = Deck.play('wonders_foundation');
    out.rng = __g.rng() === rng;
    out.after = w.construction; out.stage = Bld.stageOf(w);
    // a site 80% raised gains only to 95% — never the last stone
    w.construction = T45 * 0.2;
    out.cap = Deck.play('wonders_foundation');
    out.capped = w.construction;
    out.stillSite = w.construction > 0 && S.buildings.includes(w) && !S.over;
    // at 95% it is refused
    out.at95 = Deck.play('wonders_foundation');
    // NOT LAID YET: the foundation waits, and is laid with the ground
    __g.fresh('growth-found-wait', 'calm'); const q = __g.flat();
    out.wait = Deck.play('wonders_foundation');
    out.charge = !!S.deck.charges.foundation;
    out.twice = Deck.play('wonders_foundation');
    /* EVERY RUNNING CARD IS SEEN, OR COUNTED: the waiting foundation wears
       the card's chip on the strip, and it goes when the ground is broken */
    Screens.show('playing'); S.paused = true;
    const chipNow = () => { DeckUI._t = 0; DeckUI.frame(1); const ch = DeckUI._chips.wonders_foundation; return ch ? ch.lab.textContent + '|' + ch.charge.words : null; };
    out.chip = [chipNow()];
    // the rival's monument never takes it
    const rw = __g.site('A', 'wonder', q.A.x - 8, q.A.y - 8);
    out.rivalLeft = rw.construction; out.chargeAfterRival = !!S.deck.charges.foundation;
    // it rides the save
    G.loadJSON(G.saveJSON());
    out.chargeSaved = !!S.deck.charges.foundation;
    // and with the Age of Marble both apply the moment the ground is broken
    Deck.play('age_of_marble');
    S.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
    const laid = Bld.place('P', 'wonder', q.P.x + 6, q.P.y + 6, { noAutoAssign: true }); Bld._block = null;
    out.laidLeft = laid.construction; out.chargeGone = !S.deck.charges.foundation;
    out.chip.push(chipNow());
    out.laidPaid = laid.paid;
    out.show = R.cardShows.some(s => s.id === 'wonders_foundation');
    // the card lands on a standing site and keeps the camera where it landed;
    // a foundation laid by the GROUND BREAKING brings the works on screen
    __g.fresh('growth-found-dest', 'calm'); const fz = __g.flat();
    Screens.show('playing');
    const fw = Bld.place('P', 'wonder', fz.P.x + 20, fz.P.y + 20, { free: true, noAutoAssign: true }); Bld._block = null;
    R.cam.z = 2; R.centerOn(Bld.cx(fz.P), Bld.cy(fz.P));
    const fd = Deck.FX.wonders_foundation.dest ? Deck.FX.wonders_foundation.dest() : null;
    out.fDest = fd && fd.x === Bld.cx(fw) && fd.y === Bld.cy(fw);
    DeckUI._dest('tc', 'wonders_foundation');
    const fcam = [R.cam.x, R.cam.y];
    out.fPlay = Deck.play('wonders_foundation');
    out.fCamStill = R.cam.x === fcam[0] && R.cam.y === fcam[1];
    __g.fresh('growth-found-break', 'calm'); const fb = __g.flat();
    Screens.show('playing');
    Deck.play('wonders_foundation');
    R.cam.z = 2; R.centerOn(Bld.cx(fb.P), Bld.cy(fb.P));
    const bw = Bld.place('P', 'wonder', fb.P.x + 20, fb.P.y + 20, { free: true, noAutoAssign: true }); Bld._block = null;
    out.fBreakLook = R.onScreen(Bld.cx(bw), Bld.cy(bw));
    out.raised = raised.length; out.fin = fin.length;
    G.wonderRaised = wr; Bld.finish = bf;
    return out;
  });
  const T45 = 45;
  ck('aStandingSiteGains35PercentOfItsWork', r.play.ok && r.start === T45 && near(r.after, T45 * 0.65, 1e-9) && r.stage === 1,
    `${r.start} → ${r.after} days of work (stage ${r.stage})`);
  ck('neverPast95NoCardLaysTheLastStone', r.cap.ok && near(r.capped, T45 * 0.05, 1e-9) && r.stillSite && r.raised === 0 && r.fin === 0,
    `a site 80% raised stops at ${r.capped} days left; still a site ${r.stillSite}; the Wonder raised by a card ${r.raised}, finished ${r.fin}`);
  ck('at95ItIsRefused', !r.at95.ok && /95%/.test(r.at95.why), r.at95.why);
  ck('notLaidYetTheFoundationWaits', r.wait.ok && r.charge && !r.twice.ok && r.twice.why === 'A foundation already waits for your Wonder.', r.twice.why);
  ck('aWaitingFoundationWearsAChip', r.chip[0] === '×1|1 foundation' && r.chip[1] === null, `strip chip: ${r.chip.map(String).join(' → ')} (laid)`);
  ck('theRivalsMonumentNeverTakesIt', r.rivalLeft === T45 && r.chargeAfterRival, `the rival's site ${r.rivalLeft} days, the charge kept ${r.chargeAfterRival}`);
  ck('aWaitingFoundationRidesTheSave', r.chargeSaved);
  ck('andIsLaidWithTheGround', near(r.laidLeft, T45 * 0.65, 1e-9) && r.chargeGone && r.show,
    `laid at ${r.laidLeft} days of work, the charge spent ${r.chargeGone}, paid ${JSON.stringify(r.laidPaid)}`);
  ck('theFoundationLandsOnTheWorksAndTheGroundBreakingLooks', r.fDest && r.fPlay.ok && r.fCamStill && r.fBreakLook,
    `dest on the works ${r.fDest}, the camera kept still at the play ${r.fCamStill}, the works brought on screen when the ground breaks ${r.fBreakLook}`);
  ck('andFoundationDrawsNoRng', r.rng);
}

// ---------------- 9. SAVES: every timer mid-flight ----------------
{
  const r = await p.evaluate(() => {
    __g.fresh('growth-save'); const { P } = __g.flat();
    const hut = __g.bld('P', 'house', P.x + 5, P.y + 5), v = { x: Bld.cx(P) + 2, y: Bld.cy(P) };
    for (const id of ['harvest_festival', 'bountiful_land', 'golden_age', 'quick_hands', 'blight']) Deck.play(id);
    S.day += 3; Deck.tick();
    const read = () => JSON.stringify([Deck.timers().map(t => [t.id, +t.left.toFixed(6)]), Deck.mult('gather', 'P', v), Deck.mult('gather', 'A', v),
      Deck.mult('produce', 'P', hut), Units.buildRate(Bld.get(hut.id))]);
    const before = read();
    G.loadJSON(G.saveJSON());
    return { before, after: read() };
  });
  ck('everyTimerRidesTheSaveMidFlight', r.before === r.after, r.after);
}

// ---------------- 10. THE PICTURE ----------------
{
  const r = await p.evaluate(() => {
    const out = { threw: [], painted: {}, live: {} };
    __g.fresh('growth-draw', 'calm'); const { P, A } = __g.flat();
    Screens.show('playing');
    // a little town to light up, works to hammer at, a rival farm in sight
    const site = __g.site('P', 'barracks', P.x + 7, P.y + 2, 30); __g.builder(site);
    __g.bld('P', 'house', P.x + 4, P.y); __g.station('farm', P.x + 4, P.y + 3, T.BARREN);
    __g.terr(P.x + 9, P.y + 6, T.FOREST, 1e6);
    const g1 = __g.unit('villager', 'P', P.x + 8.5, P.y + 6.5); Units.assignGather(g1, P.x + 9, P.y + 6);
    const farmA = __g.bld('A', 'farm', P.x + 6, P.y + 9);
    void A;
    __g.site('P', 'wonder', P.x + 2, P.y + 12);
    for (let i = 0; i < 20; i++) Units.update(0.1);
    G.updateVisibility();
    R.cam.z = 2; R.centerOn(Bld.cx(P) + 3, Bld.cy(P) + 4);
    const g = R.cv.getContext('2d');
    const count = (fn) => {
      let n = 0; const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect, di = P2.drawImage;
      P2.fillRect = function () { n++; return fr.apply(this, arguments); };
      P2.drawImage = function () { n++; return di.apply(this, arguments); };
      try { fn(); } finally { P2.fillRect = fr; P2.drawImage = di; }
      return n;
    };
    const sBefore = JSON.stringify(S.deck);
    for (const id of __g.GROWTH) {
      const d = Deck.FX[id];
      R.cardShows.length = 0;
      const res = Deck.play(id);
      if (!res.ok) { out.threw.push(id + ': ' + res.why); continue; }
      const s = R.cardShows.find(z => z.id === id);
      if (!s) { out.threw.push(id + ': no show'); continue; }
      const layers = d.show.layers || [d.show.layer || 'world'];
      let n = 0;
      for (const pp of [0, 0.03, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99]) {
        for (const L of layers) {
          try {
            n += count(() => {
              g.save();
              if (L === 'world') { const z = R.cam.z * R.dpr; g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z); }
              else g.setTransform(1, 0, 0, 1, 0, 0);
              d.show.draw.call(d, g, s, pp, 1 / 30, L);
              g.restore();
              // a show that lights the buildings does it in the building pass
              if (L === layers[0] && d.show.drawBld) {
                const z = R.cam.z * R.dpr;
                for (const bb of S.buildings) { g.save(); g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z); d.show.drawBld.call(d, g, bb, s, pp); g.restore(); }
              }
            });
          } catch (e) { out.threw.push(id + ' @' + pp + ' ' + L + ': ' + e); try { g.restore(); } catch (e2) { /* */ } }
        }
      }
      out.painted[id] = n;
      const e = Deck.timed(id);
      // a running card's look, wherever the frame draws it: in the air
      // (drawLive), on the ground (drawGround) or on a building (drawBld)
      const looks = [d.drawLive && (gg => d.drawLive(gg, e, 1 / 30)), d.drawGround && (gg => d.drawGround(gg, e, 1 / 30)),
        d.drawBld && (gg => d.drawBld(gg, farmA, e))].filter(Boolean);
      if (e && looks.length) {
        R.cardShows.length = 0;   // the look as it stands once the show has played
        // the rival's farm in sight; the clock walked through a second, so a
        // look that beats (the hammers' sparks) is caught on and off the beat
        G.vis[MapGen.idx(farmA.x, farmA.y)] = 1;
        const pn = performance.now;
        try {
          let n = 0;
          for (let k = 0; k < 20; k++) {
            performance.now = () => k * 50;
            n += count(() => {
              g.save(); const z = R.cam.z * R.dpr; g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
              for (const f of looks) f(g);
              g.restore();
            });
          }
          out.live[id] = n;
        } catch (e2) { out.threw.push(id + ' live: ' + e2); }
        finally { performance.now = pn; }
      }
    }
    // the whole frame, with every show and look running, a few dozen times
    try { for (let i = 0; i < 60; i++) R.draw(1 / 20); } catch (e) { out.threw.push('R.draw: ' + e); }
    out.renderOnly = !/cardShows/.test(G.saveJSON()) && !JSON.stringify(S.deck).includes('"t":') && R.cardShows.length >= 0;
    out.deckBefore = sBefore.length; out.farmA = farmA.id;
    // NOTHING IS PAID FOR WITH NO CARD IN PLAY: a fresh run, every growth
    // show and look wrapped with a counter, a few frames drawn
    __g.fresh('growth-idle-draw'); __g.flat(); Screens.show('playing');
    let calls = 0;
    const wrapped = [];
    for (const id of __g.GROWTH) {
      const d = Deck.FX[id];
      if (d.show) { const f = d.show.draw; wrapped.push([d.show, 'draw', f]); d.show.draw = function () { calls++; return f.apply(this, arguments); }; }
      for (const k of ['drawLive', 'drawGround', 'drawBld'])
        if (d[k]) { const f = d[k]; wrapped.push([d, k, f]); d[k] = function () { calls++; return f.apply(this, arguments); }; }
    }
    let worldCalls = 0; const dcw = R.drawCardWorld, dcg = R.drawCardGround, dcb = R.cardBldLooks;
    R.drawCardWorld = function () { worldCalls++; return dcw.apply(this, arguments); };
    R.drawCardGround = function () { worldCalls++; return dcg.apply(this, arguments); };
    R.cardBldLooks = function () { worldCalls++; return dcb.apply(this, arguments); };
    for (let i = 0; i < 20; i++) R.draw(1 / 30);
    R.drawCardWorld = dcw; R.drawCardGround = dcg; R.cardBldLooks = dcb;
    for (const [o, k, f] of wrapped) o[k] = f;
    out.idleCalls = calls; out.idleWorld = worldCalls;
    return out;
  });
  ck('everyShowDrawsAtEveryBeatWithoutThrowing', r.threw.length === 0, r.threw.slice(0, 4).join(' | ') || 'eight shows, ten beats each');
  ck('everyShowPaintsSomething', Object.keys(r.painted).length === 8 && Object.values(r.painted).every(n => n > 20),
    Object.entries(r.painted).map(([k, n]) => k + ' ' + n).join(', '));
  ck('everyRunningLookPaints', ['bountiful_land', 'golden_age', 'quick_hands', 'blight'].every(id => r.live[id] > 0),
    Object.entries(r.live).map(([k, n]) => k + ' ' + n).join(', '));
  ck('theShowsAreRenderStateOnly', r.renderOnly);
  ck('andCostNothingWithNoCardInPlay', r.idleCalls === 0 && r.idleWorld === 0, `${r.idleCalls} show/look calls, ${r.idleWorld} card ground/building/world passes in 20 frames`);
}

// ---------------- 10b. TWENTY DAYS IS A LONG TIME TO PAY FOR A PICTURE ----------------
{
  const r = await p.evaluate(() => {
    __g.fresh('growth-lush', 'calm'); const { P } = __g.flat();
    Screens.show('playing');
    R.cam.z = 1.5; R.centerOn(Bld.cx(P), Bld.cy(P));
    __g.terr(P.x + 5, P.y + 1, T.FOREST, 200);   // a stand in the ring, to be felled
    Deck.play('bountiful_land'); R.cardShows.length = 0;
    const d = Deck.FX.bountiful_land, e = Deck.timed('bountiful_land'), g = R.cv.getContext('2d');
    let paints = 0; const sp = d.sprigs; d.sprigs = function () { paints++; return sp.apply(this, arguments); };
    const frames = n => { for (let i = 0; i < n; i++) { g.save(); d.drawGround(g, e, 1 / 60); g.restore(); } };
    frames(1); const first = paints;
    frames(60); const steady = paints - first;
    // the tree in the ring felled to stumps (open ground a sprig may take)
    __g.terr(P.x + 5, P.y + 1, T.STUMPS);
    frames(30); const afterEdit = paints - first - steady;
    d.sprigs = sp;
    return { first, steady, afterEdit };
  });
  ck('theLushGroundIsPaintedOnceNotEveryFrame', r.first === 1 && r.steady === 0 && r.afterEdit === 1,
    `painted ${r.first} on the first frame, ${r.steady} over the next 60, ${r.afterEdit} when the ground under it changed`);
}

// ---------------- 10c. THE LUSH GROUND IS ASKED OF WHAT YOU KNOW ----------------
{
  const r = await p.evaluate(() => {
    __g.fresh('growth-lush-fog', 'calm'); const { P } = __g.flat();
    Screens.show('playing');
    const d = Deck.FX.bountiful_land;
    // a stand the player knows, inside the ring
    const fx = P.x + 7, fy = P.y + 1;
    __g.terr(fx, fy, T.FOREST, 200);
    Deck.play('bountiful_land'); R.cardShows.length = 0;
    const c = d.centre(), W = CFG.W;
    // the layer's own pixels (its canvases only ever take fills, so they read back from file://)
    const pix = () => {
      d._layer = null;
      const L = d.layer(c);
      return L.g.map((g, i) => Array.from(g.getImageData(0, 0, L.cv[i].width, L.cv[i].height).data).join(','));
    };
    G.vis = new Uint8Array(W * CFG.H);             // the ring known, none of it in sight now
    const before = pix();
    // OUT OF SIGHT: the rival raises a barracks inside the ring (a War Camp would
    // be revealed by its own rule), and the stand is felled
    const camp = __g.bld('A', 'barracks', P.x + 6, P.y + 4);
    const i = MapGen.idx(fx, fy); S.map.terrain[i] = T.STUMPS;   // the truth only — the memory still holds the wood
    const hidden = pix();
    // IN SIGHT: now the player sees both, and the ground answers
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) G.vis[MapGen.idx(camp.x + x, camp.y + y)] = 1;
    G.vis[i] = 1;
    const seen = pix();
    return { same: hidden[0] === before[0] && hidden[1] === before[1], moved: seen[0] !== before[0], beats: before[0] !== before[1] };
  });
  ck('theLushGroundIsDrawnFromWhatYouKnow', r.same && r.moved,
    `a rival barracks raised and a stand felled out of sight change the lush ground: ${!r.same}; once they are in sight: ${r.moved}`);
  ck('andItSwaysOnTwoBeats', r.beats, 'the breeze\'s two beats are two different pictures');
}

// ---------------- 11. NOTHING IS DRAWN IN THE BLACK ----------------
{
  const r = await p.evaluate(() => {
    __g.fresh('growth-rim', 'calm'); const { P } = __g.flat();
    Screens.show('playing');
    __g.site('P', 'wonder', P.x + 4, P.y + 4);
    // the camera at the world's corner, the off-map rim in view
    R.cam.z = 1.5; R.cam.x = 0; R.cam.y = 0;
    const z = R.cam.z * R.dpr, TL = CFG.TILE, rim = Math.floor(TL * z) - 2;
    const probe = () => {
      let lit = 0;
      // the sky of every show at its height, and the bounty's ring rolling out
      // across the rim, each on a fresh canvas (no art has touched it, so its
      // pixels can be read even from file://)
      for (const [id, pp, layer] of [['golden_age', 0.3, 'sky'], ['enlightenment', 0.4, 'sky'], ['age_of_marble', 0.3, 'sky'],
        ['wonders_foundation', 0.45, 'sky'], ['blight', 0.3, 'sky'], ['bountiful_land', 0.75, 'world']]) {
        const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
        const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
        const d = Deck.FX[id];
        const s = { id, t: pp * d.show.ms / 1000, ms: d.show.ms, x: Bld.cx(P), y: Bld.cy(P), foot: P.y + 2, sz: 3, bx: P.x + 4, by: P.y + 4,
          tc: P.id, items: [], maxD: 1, reach: 10, dx: -0.7, dy: -0.7, boom: 1, dust: 1 };
        if (layer === 'world') g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
        d.show.draw.call(d, g, s, pp, 1 / 30, layer);
        g.setTransform(1, 0, 0, 1, 0, 0);
        const top = g.getImageData(0, 0, c.width, rim).data, left = g.getImageData(0, 0, rim, c.height).data;
        let n = 0;
        for (const data of [top, left]) for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 0) n++;
        lit += n;
      }
      // …and the dust the Wonder cards' courses and stones throw up (the
      // engine's placement poof), landing on works laid at the world's corner
      {
        const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
        const g = c.getContext('2d');
        g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
        g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
        const keep = R.placePoofs; R.placePoofs = [];
        R.startPlacePoof(1, 1, 3); R.placePoofs[0].t = R.POOF_MS * 0.3;
        R.drawPlacePoofs(g, 0);
        R.placePoofs = keep;
        g.setTransform(1, 0, 0, 1, 0, 0);
        const top = g.getImageData(0, 0, c.width, rim).data, left = g.getImageData(0, 0, rim, c.height).data;
        for (const data of [top, left]) for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 0) lit++;
      }
      return lit;
    };
    const inBlack = probe();
    // the control: widen the board and the same draws must light the rim
    const bp = R.boardPx;
    R.boardPx = () => ({ x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 });
    const control = probe();
    R.boardPx = bp;
    return { inBlack, control };
  });
  ck('nothingIsDrawnInTheBlack', r.inBlack === 0 && r.control > 1000, `${r.inBlack} lit pixels on the off-map rim; with the board widened ${r.control}`);
}

// ---------------- 12. WHAT BELONGS TO THE LAND IS DRAWN WITH THE LAND ----------------
/* Served over HTTP: under file:// a canvas a PNG has touched cannot be read
   back, and these checks read the real frame. The lush ground and the
   withered fields must lie UNDER the people standing on them — a unit's own
   opaque pixels byte-identical with the card running and not — and the lush
   ground on remembered ground must be dimmed by the fog like the land under
   it (the change it makes there a fraction of the change it makes in sight;
   drawn over the fog, it is all of it and more). */
{
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json',
    '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  const srv = createServer(async (rq, rs) => {
    try {
      const u = decodeURIComponent(rq.url.split('?')[0]);
      const f = join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
      if (!f.startsWith(root)) { rs.writeHead(403); rs.end(); return; }
      const body = await readFile(f);
      rs.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' });
      rs.end(body);
    } catch (e) { rs.writeHead(404); rs.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push('http page: ' + String(e)));
  await p2.goto('http://127.0.0.1:' + srv.address().port + '/index.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.Deck && window.Screens && Screens.current === 'title', null, { timeout: 120000 });
  const r = await p2.evaluate(() => {
    const out = {};
    Boot.force(); Screens._demo = false; CFG.CARDS.ON = true;
    G.newGame('growth-layers', 'calm', 'medium'); S.paused = true;
    const W = CFG.W;
    for (let i = 0; i < W * CFG.H; i++) { S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; S.map.resAmount[i] = 0; S.map.seenTerrain[i] = T.GRASS; }
    S.units = []; S.buildings = S.buildings.filter(z => z.key === 'tc');
    const P = Bld.tcOf('P'), A = Bld.tcOf('A');
    P.x = 20; P.y = 20; A.x = W - 7; A.y = CFG.H - 7;
    const fi = MapGen.idx(26, 22); S.map.terrain[fi] = S.map.seenTerrain[fi] = T.BARREN;
    Bld._block = null;
    const farm = Bld.place('A', 'farm', 26, 22, { free: true, instant: true }); Bld._block = null;
    R.rebuildTerrain();
    Screens.show('playing');
    Deck._col = null; Deck._del(Deck.KEY); Deck._add('bountiful_land', 3); Deck._add('blight', 3);
    // eight of yours on open grass inside the ring; two of theirs at work on their own farm
    for (let k = 0; k < 8; k++) { const u = Units.spawn('villager', 'P', 22 + k % 4, 24 + (k >> 2)); u.x = 22.5 + k % 4; u.y = 24.5 + (k >> 2); }
    for (let k = 0; k < 2; k++) { const u = Units.spawn('villager', 'A', 26, 22); u.x = 26.3 + k * 0.4; u.y = 22.6; u.task = { type: 'work', id: farm.id }; }
    R.cam.z = 2; R.centerOn(24.5, 23);
    G.updateVisibility();
    out.farmSeen = Deck.FX.blight.inSight(farm);
    const g = R.cv.getContext('2d'), frozen = performance.now(), pn = performance.now;
    performance.now = () => frozen;
    const grab = () => { R.ambient = []; R.ambientT = 1e9; R._flash = null; R._shake = null; R.draw(0); return g.getImageData(0, 0, R.cv.width, R.cv.height).data; };
    const same = (a, b, i) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
    try {
      // a unit's OPAQUE pixels: what it changes in the frame, and what does not
      // change when the ground and the buildings under it are swapped out
      const withU = grab();
      const keep = S.units; S.units = []; const noU = grab(); S.units = keep;
      const tc0 = R.terrainCache, alt = document.createElement('canvas');
      alt.width = tc0.width; alt.height = tc0.height;
      const ag = alt.getContext('2d'); ag.fillStyle = '#ff00ff'; ag.fillRect(0, 0, alt.width, alt.height);
      const bb = R.blitBld;
      R.blitBld = function (gg, spr, x, y, w, h) { gg.fillStyle = '#00ffff'; gg.fillRect(x, y, w, h); };
      R.terrainCache = alt; const altU = grab(); R.terrainCache = tc0; R.blitBld = bb;
      const opaque = [];
      for (let i = 0; i < withU.length; i += 4) if (!same(withU, noU, i) && same(withU, altU, i)) opaque.push(i);
      out.opaque = opaque.length;
      const count = (fr, ref) => { let n = 0; for (let i = 0; i < fr.length; i += 4) if (!same(fr, ref, i)) n++; return n; };
      // BOUNTIFUL LAND, its wave over: the meadow grows round the people's feet
      Deck.play('bountiful_land'); R.cardShows.length = 0;
      const lush = grab();
      out.lushPainted = count(lush, withU);
      out.lushOnUnits = opaque.filter(i => !same(lush, withU, i)).length;
      // THE BLIGHT on its own: their farm withers under the hands working it
      S.deck.fx = [];
      Deck.play('blight'); R.cardShows.length = 0;
      const bl = grab();
      out.blightPainted = count(bl, withU);
      out.blightOnUnits = opaque.filter(i => !same(bl, withU, i)).length;
      // THE FOG: the change the lush ground makes on remembered ground, against
      // the change it makes in sight (the people stood out of it — this is the ground)
      S.deck.fx = []; Deck.play('bountiful_land'); R.cardShows.length = 0;
      S.units = [];
      const fxs = S.deck.fx;
      const visLive = grab(); S.deck.fx = []; const visNo = grab(); S.deck.fx = fxs;
      const vis0 = G.vis; G.vis = new Uint8Array(W * CFG.H); R.fogDirty = true;
      const fogLive = grab(); S.deck.fx = []; const fogNo = grab(); S.deck.fx = fxs;
      G.vis = vis0; R.fogDirty = true; S.units = keep;
      let dv = 0, df = 0;
      for (let i = 0; i < visLive.length; i += 4) for (let c = 0; c < 3; c++) {
        dv += Math.abs(visLive[i + c] - visNo[i + c]); df += Math.abs(fogLive[i + c] - fogNo[i + c]);
      }
      out.dv = dv; out.fogRatio = dv ? df / dv : 1;
    } finally { performance.now = pn; }
    return out;
  });
  await p2.close();
  srv.close();
  ck('theLushGroundLiesUnderThePeopleOnIt', r.opaque > 500 && r.lushPainted > 2000 && r.lushOnUnits === 0,
    `${r.lushOnUnits} of ${r.opaque} opaque unit pixels touched; the meadow changed ${r.lushPainted} pixels of the frame`);
  ck('theWitheredFieldLiesUnderTheHandsWorkingIt', r.farmSeen && r.blightPainted > 200 && r.blightOnUnits === 0,
    `${r.blightOnUnits} of ${r.opaque} opaque unit pixels touched; the blight changed ${r.blightPainted} pixels of the frame (their farm in sight ${r.farmSeen})`);
  ck('andOnRememberedGroundTheFogDimsIt', r.dv > 10000 && r.fogRatio < 0.8,
    `the lush ground's change under the fog is ${(r.fogRatio * 100).toFixed(1)}% of its change in sight`);
}

// ---------------- 13. THE LOOKS SPEAK THE HOUSE STYLE (the five-player playtest's judges) ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-style');
    Screens.show('playing'); S.paused = true;
    const { P: tc } = __g.flat();
    const town = [__g.bld('P', 'house', 8, 4), __g.bld('P', 'house', 4, 8), __g.bld('P', 'barracks', 9, 8)];
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc) + 1.5, Bld.cy(tc) + 1.5);
    G.updateVisibility();
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect;
    let rec = null;
    P2.fillRect = function (x, y, w, h) { if (rec && (!rec.cv || this.canvas === rec.cv)) rec.push([x, y, w, h, this.globalCompositeOperation, this.globalAlpha, String(this.fillStyle)]); return fr.apply(this, arguments); };
    try {
      /* (a) THE DAWN'S RAYS ARE SHORT DASHES OF INK NEAR THE SUN: every mark
         opaque and source-over (a wedge of the card's light run down the
         whole screen read as an orange road line, and its faint edge over
         the grass sampled olive-mustard), every mark one cell, and none
         farther from the sun than its halo and a sixth of the screen */
      const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
      const g = c.getContext('2d'), ox = c.width / 2, oy = 300, H = c.height;
      rec = []; rec.cv = c;
      GrowFX.rays(g, ox, oy, 15, 0.17, 'gold', 0.9, 1.0, 0.215);
      const gr = Math.max(2, Math.round(2 * R.cam.z * (R.dpr || 1)));
      out.rayMarks = rec.length;
      out.rayLight = rec.filter(m => m[4] !== 'source-over' || m[5] < 1).length;
      out.rayBig = rec.filter(m => m[2] > gr || m[3] > gr).length;
      out.rayReach = +(rec.reduce((mx, m) => Math.max(mx, Math.hypot(m[0] + m[2] / 2 - ox, m[1] + m[3] / 2 - oy)), 0) / H).toFixed(3);
      /* (b) THE GOLDEN AGE IS SEEN FOR ALL TWENTY DAYS: with the age running
         (its play long over), every roof in view glints in its turn — a gold
         star with a white-hot heart — and sheds gold, over three seconds;
         the first cut left two faint specks a roof and nothing else */
      __g.live('golden_age', 20);
      R.cardShows = [];
      const GA = Deck.FX.golden_age, hot = R.LIGHT.TONE.gold.hot.toLowerCase();
      const dl = GA.drawLive;
      let depth = 0;
      GA.drawLive = function () { depth++; try { return dl.apply(this, arguments); } finally { depth--; } };
      const pn = performance.now;
      rec = []; rec.cv = R.cv;
      const live = [];
      P2.fillRect = function (x, y, w, h) { if (depth && this.canvas === R.cv) live.push(String(this.fillStyle).toLowerCase()); return fr.apply(this, arguments); };
      try { for (let k = 0; k < 30; k++) { performance.now = () => 5000 + k * 100; R.draw(0.1); } }
      finally { performance.now = pn; GA.drawLive = dl; }
      const inView = S.buildings.filter(z => z.owner === 'P' && R.onScreen(Bld.cx(z), Bld.cy(z))).length;
      out.inView = inView;
      out.liveMarks = live.length;
      out.glintHearts = live.filter(c0 => c0 === hot).length;
      rec = null;
    } finally { P2.fillRect = fr; }
    return out;
  });
  ck('theDawnsRaysAreShortDashesOfInk', r.rayMarks > 30 && r.rayLight === 0 && r.rayBig === 0 && r.rayReach <= 0.215 + 0.17 + 0.02,
    `${r.rayMarks} marks, ${r.rayLight} added or translucent, ${r.rayBig} bigger than a cell, the farthest ${r.rayReach} of the screen from the sun`);
  ck('theGoldenAgeIsSeenForAllTwentyDays', r.inView >= 3 && r.glintHearts >= r.inView && r.liveMarks >= 12 * r.inView,
    `${r.inView} buildings in view: ${r.glintHearts} glints, ${r.liveMarks} marks over three seconds`);
}

// ---------------- 13b. THE BLIGHT'S PALL IS WEATHER, NOT A WIPE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-blight-style'); const { P, A } = __g.flat();
    Screens.show('playing'); S.paused = true;
    R.cam.z = 1.7;
    const BL = Deck.FX.blight;
    // the pall's sky drawn alone on a clean canvas (no art has touched it, so
    // it can be read even from file://), rolling straight up the screen
    const sky = (s, pp) => {
      const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
      const g = c.getContext('2d');
      s.t = pp * BL.show.ms / 1000;
      BL.show.draw.call(BL, g, s, pp, 1 / 30, 'sky');
      return { c, d: g.getImageData(0, 0, c.width, c.height).data };
    };
    /* (a) ITS FACE IS RAGGED AND IT IS NEAR-OPAQUE: down each column, the
       first cell of the pall from the side it rolls toward — a ruled line
       puts most columns' first cell on one row (the first cut's threshold
       jumped where the depth crossed zero: one straight line across the
       screen, a screen wipe); and the pall's cells are laid near-opaque
       (half-clear green-greys over the meadow read as camouflage) */
    {
      R.centerOn(CFG.W / 2, CFG.H / 2);
      const { c, d } = sky({ id: 'blight', dx: 0, dy: -1, ms: BL.show.ms }, 0.4);
      const cell = Math.max(4, Math.round(2 * R.cam.z * (R.dpr || 1))), rows = new Map(), alphas = [];
      let cols = 0;
      for (let x = Math.floor(cell / 2); x < c.width; x += cell) {
        for (let y = 0; y < c.height; y += cell) {
          const a = d[(y * c.width + x) * 4 + 3];
          if (a > 0) { const k = Math.floor(y / cell); rows.set(k, (rows.get(k) || 0) + 1); cols++; break; }
        }
      }
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) alphas.push(d[i]);
      alphas.sort((u, v) => u - v);
      out.cols = cols;
      out.modal = cols ? Math.max(...rows.values()) / cols : 1;
      out.alphaMedian = alphas.length ? alphas[alphas.length >> 1] : 0;
    }
    /* (b) WITH NO FIELD OF THEIRS IN VIEW THE PALL IS SENT, and seen to go:
       it gathers over the view and rolls off the screen toward the rival,
       leaving the view clear — the first cut swept the player's own town and
       showed nothing of where it went */
    {
      R.centerOn(Bld.cx(P), Bld.cy(P));
      G.updateVisibility();
      R.cardShows = []; S.deck.fx = [];
      Deck.play('blight');
      const s0 = R.cardShows.find(s => s.id === 'blight');
      out.awayHome = !!s0 && s0.away === 1;
      // their farm in sight and on the screen: the pall sweeps over it instead
      const farm = __g.bld('A', 'farm', A.x - 3, A.y + 1);
      R.centerOn(farm.x + 0.5, farm.y + 0.5);
      G.vis[MapGen.idx(farm.x, farm.y)] = 1;
      R.cardShows = []; S.deck.fx = [];
      Deck.play('blight');
      const s1 = R.cardShows.find(s => s.id === 'blight');
      out.overFields = !!s1 && !s1.away;
      R.cardShows = [];
      R.centerOn(CFG.W / 2, CFG.H / 2);
      // sent up the screen: its covered mass climbs, and at the end the screen is clear
      const mass = pp => {
        const { c, d } = sky({ id: 'blight', dx: 0, dy: -1, away: 1, ms: BL.show.ms }, pp);
        let n = 0, sy = 0;
        for (let y = 0; y < c.height; y += 8) for (let x = 0; x < c.width; x += 8) if (d[(y * c.width + x) * 4 + 3] > 150) { n++; sy += y; }
        return { cover: n / ((c.height / 8) * (c.width / 8)), y: n ? sy / n / c.height : 1 };
      };
      const m1 = mass(0.3), m2 = mass(0.6), m3 = mass(0.95);
      out.away = { early: +m1.cover.toFixed(3), mid: +m2.cover.toFixed(3), end: +m3.cover.toFixed(3), y1: +m1.y.toFixed(3), y2: +m2.y.toFixed(3) };
      out.rollsOff = m1.cover > 0.2 && m2.y < m1.y - 0.05 && m3.cover < 0.02;
    }
    return out;
  });
  ck('theBlightsFaceIsRaggedAndItsPallNearOpaque', r.cols > 40 && r.modal < 0.4 && r.alphaMedian >= 200,
    `${r.cols} columns, ${(r.modal * 100).toFixed(1)}% of them on the commonest row; the pall's median alpha ${r.alphaMedian}/255`);
  ck('withNoFieldInViewThePallIsSentAndSeenToGo', r.awayHome && r.overFields && r.rollsOff,
    `at home: sent ${r.awayHome}; their field in sight: sweeps over it ${r.overFields}; ${JSON.stringify(r.away)}`);
}

// ---------------- 13c. THE AGE OF MARBLE SAYS WHAT IT DID ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    const MB = Deck.FX.age_of_marble;
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect, ft = P2.fillText;
    const fa = R.flashAt, gw = R.goldWash;
    let flashes = 0, washes = 0;
    R.flashAt = function () { flashes++; return fa.apply(this, arguments); };
    R.goldWash = function () { washes++; return gw.apply(this, arguments); };
    try {
      /* (a) NO WASH, AND THE PRICE IS SAID ON SCREEN: with no works laid the
         play throws no whole-frame flash and the act grades nothing (the first
         cut faded the whole view to a cream fog for the act, which read as a
         render failure), and its own caption strikes the old price through to
         the new one — the price the card changed was never shown anywhere */
      __g.fresh('growth-marble-style', 'calm'); const { P } = __g.flat();
      Screens.show('playing'); S.paused = true;
      R.cam.z = 1.7; R.centerOn(Bld.cx(P), Bld.cy(P));
      G.updateVisibility();
      const was = Bld.effCost('P', 'wonder');
      R.cardShows = [];
      const play = Deck.play('age_of_marble');
      const now = Bld.effCost('P', 'wonder');
      const s = R.cardShows.find(z => z.id === 'age_of_marble');
      const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
      const g = c.getContext('2d'), texts = [], strikes = [], fills = new Set();
      P2.fillText = function (t) { if (this.canvas === c) texts.push([String(t), String(this.fillStyle).toLowerCase()]); return ft.apply(this, arguments); };
      P2.fillRect = function (x, y, w) {
        if (this.canvas === c) { const col = String(this.fillStyle).toLowerCase(); fills.add(col); if (col === '#d0503a' && w > 0) strikes.push(w); }
        return fr.apply(this, arguments);
      };
      try {
        for (let k = 1; k < 20; k++) {
          const pp = k / 20; s.t = pp * MB.show.ms / 1000;
          for (const L of ['world', 'sky']) { g.save(); MB.show.draw.call(MB, g, s, pp, 1 / 30, L); g.restore(); }
        }
      } finally { P2.fillText = ft; P2.fillRect = fr; }
      out.flashes = flashes; out.washes = washes;
      const said = t => texts.some(([u]) => u === t);
      out.oldSaid = ['food', 'wood', 'stone', 'gold'].filter(k => was[k] && said(String(was[k]))).length;
      out.newSaid = ['food', 'wood', 'stone', 'gold'].filter(k => now[k] && texts.some(([u, col]) => u === String(now[k]) && col === '#ffd45e')).length;
      out.struck = strikes.length;
      /* (b) THE MARBLE IS STONE: its blocks are shaded in the stone ramp (a
         dark joint, the face, its flank) — the first cut's were flat white
         rectangles in a grey frame, which read as icons laid on the map */
      const ST = ART.PALETTE.stone.map(x => x.toLowerCase());
      out.stoneSteps = [0, 2, 3, 4].filter(i => fills.has(ST[i])).length;
      // (c) the toast says what happened: the price fell
      out.msgPrice = play.ok && typeof play.msg === 'string' && /quarter less/.test(play.msg) ? play.msg : null;
      /* (d) LAID, WHAT CAME BACK IS SAID, and the works are brought to the
         middle of the view before the card flies — at the screen's top edge
         the courses landed under the toast */
      __g.fresh('growth-marble-style2', 'calm'); const q = __g.flat();
      Screens.show('playing'); S.paused = true;
      for (const k of ['food', 'wood', 'stone', 'gold']) S.res[k] = 20000;
      const w = Bld.place('P', 'wonder', q.P.x + 6, q.P.y + 6, { noAutoAssign: true }); Bld._block = null;
      out.paid = !!(w && w.paid && w.paid.food > 0);
      R.cam.z = 1.7;
      const TL = CFG.TILE, z = R.cam.z;
      R.centerOn(Bld.cx(w), Bld.cy(w));
      R.cam.y = Bld.cy(w) * TL - ((R.topReserve || 0) + 30) / z;   // the works just under the top bar
      const pt = DeckUI._dest('tc', 'age_of_marble');
      const top = (R.topReserve || 0) + 80, bot = R.viewH() - (R.bottomReserve || 0) - 30;
      out.framedY = +((pt.y - top) / (bot - top)).toFixed(3);
      out.framedX = +(pt.x / R.viewW()).toFixed(3);
      const r0 = Object.assign({}, S.res);
      const lay = Deck.play('age_of_marble');
      const back = {}; for (const k in r0) if (S.res[k] > r0[k]) back[k] = S.res[k] - r0[k];
      out.msgBack = lay.ok && typeof lay.msg === 'string' && Object.keys(back).length && lay.msg.includes(Bld.costStr(back)) && /comes back/.test(lay.msg) ? lay.msg : (lay.msg || null);
      out.backOk = !!(lay.ok && Object.keys(back).length && typeof lay.msg === 'string' && lay.msg.includes(Bld.costStr(back)));
    } finally { R.flashAt = fa; R.goldWash = gw; }
    return out;
  });
  ck('theAgeOfMarbleWashesNothingOverTheFrame', r.flashes === 0 && r.washes === 0,
    `${r.flashes} whole-frame flashes, ${r.washes} grades over the act`);
  ck('withNoWorksItsCaptionStrikesTheOldPriceToTheNew', r.oldSaid === 4 && r.newSaid === 4 && r.struck >= 4,
    `old price said for ${r.oldSaid}/4 goods, new price in gold for ${r.newSaid}/4, ${r.struck} strike-throughs`);
  ck('theMarbleIsShadedStone', r.stoneSteps >= 3, `${r.stoneSteps} of the stone ramp's steps in the blocks`);
  ck('itsToastSaysWhatChanged', !!r.msgPrice && r.backOk, `none laid: "${r.msgPrice}"; laid: "${r.msgBack}"`);
  ck('laidTheWorksAreBroughtToTheMiddleFirst', r.paid && r.framedY > 0.2 && r.framedY < 0.8 && r.framedX > 0.2 && r.framedX < 0.8,
    `the works land at ${r.framedX} across, ${r.framedY} down the open view`);
}

// ---------------- 13d. ENLIGHTENMENT RAISES THE TOWN ONE BUILDING AT A TIME ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __g.fresh('growth-enl-style'); const { P: tc } = __g.flat();
    Screens.show('playing'); S.paused = true;
    const town = [[8, 4], [4, 8], [8, 8], [11, 5], [6, 11], [11, 10]].map(([x, y]) => __g.bld('P', 'house', x, y));
    R.cam.z = 1.2; R.centerOn(Bld.cx(tc) + 3, Bld.cy(tc) + 3);
    G.updateVisibility();
    R.cardShows = [];
    const TL = CFG.TILE, all = [tc].concat(town);
    // the art each one wore before the card: what the act must hold until its beam lands
    const was = new Map(all.map(b => [b.id, R.bldSprite(b, 1)]));
    const play = Deck.play('enlightenment');
    out.msg = play.ok ? play.msg || null : 'refused: ' + play.why;
    out.levels = all.map(b => b.level).join('');
    const s = R.cardShows.find(z => z.id === 'enlightenment');
    /* (a) THE STATE CHANGES AT ONCE, THE PICTURE IN TURN: through the real
       building pass, each building is drawn in its OLD art until its own
       beam comes down on it — and they rise one at a time (the first cut
       swapped the whole town's art the frame the card landed, under one
       pillar, and the run of the light to each building lit art that had
       already changed) */
    const bb = R.blitBld;
    let drawn = null;
    R.blitBld = function (g, spr, x, y) { if (drawn) drawn.push([spr, x, y]); return bb.apply(this, arguments); };
    const counts = [];
    try {
      for (let k = 0; k < 100; k++) {
        const pp = k / 100; s.t = pp * s.ms / 1000;
        drawn = [];
        R.draw(0);
        counts.push(all.filter(b => drawn.some(d => d[0] === was.get(b.id) && d[1] === b.x * TL && d[2] === b.y * TL)).length);
      }
    } finally { R.blitBld = bb; drawn = null; }
    out.first = counts[2]; out.last = counts[99];
    let worst = 0, up = 0;
    for (let k = 1; k < counts.length; k++) { worst = Math.max(worst, counts[k - 1] - counts[k]); if (counts[k] > counts[k - 1]) up++; }
    out.worstDrop = worst; out.rises = up;
    out.counts = counts.filter((c, k) => k % 10 === 0).join(',');
    /* (b) THE SUN AT THE TOP OF THE WORLD COMES AND GOES BY SIZE: its gold
       discs keep their strength as it leaves (faded through the faint steps
       the gold went olive) and grow smaller instead */
    const ED = Deck.FX.enlightenment, gl = R.glow, pd = R.pxDisc, discs = [];
    let a = null;
    R.glow = function (g, s0) { const was0 = a; a = s0; try { return gl.apply(this, arguments); } finally { a = was0; } };
    R.pxDisc = function (g, x, y, rr) { if (a != null) discs.push([rr, a]); return pd.apply(this, arguments); };
    try {
      const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
      const g = c.getContext('2d');
      for (const pp of [0.4, 0.95]) {
        discs.length = 0;
        const s2 = { id: 'enlightenment', x: Bld.cx(tc), y: Bld.cy(tc), foot: tc.y + 2, tc: tc.id, items: [], maxD: 1, ms: ED.show.ms, t: pp * ED.show.ms / 1000 };
        ED.show.draw.call(ED, g, s2, pp, 1 / 30, 'sky');
        out['sun' + pp] = { r: discs.length ? Math.max(...discs.map(d => d[0])) : 0, a: discs.length ? Math.min(...discs.map(d => d[1])) : 0 };
      }
    } finally { R.glow = gl; R.pxDisc = pd; }
    return out;
  });
  ck('eachBuildingRisesInItsOwnBeamOneAtATime', r.levels === '2222222' && r.first === 7 && r.last === 0 && r.worstDrop === 1 && r.rises === 0,
    `levels ${r.levels} at once; drawn in their old art (every tenth of the act): ${r.counts}; most to rise in one step ${r.worstDrop}`);
  ck('itsToastSaysWhatRose', /^✨ Town Center Lv 2 — 6 buildings rose with it/.test(r.msg || ''), `"${r.msg}"`);
  ck('itsSunLeavesBySizeNotByFading', r['sun0.4'].a >= 0.6 && r['sun0.95'].a >= 0.6 && r['sun0.95'].r > 0 && r['sun0.95'].r < r['sun0.4'].r,
    `the sun at 0.4: ${JSON.stringify(r['sun0.4'])}; leaving at 0.95: ${JSON.stringify(r['sun0.95'])}`);
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 6));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-GROWTH CHECKS PASS');
