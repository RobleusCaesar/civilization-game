/* THE CARD SYSTEM — the effects (js/deckfx.js) and the hooks they ride:
   one card per tier, each measured doing exactly what its card says.

   This file pins:

     THE SWITCH        off (the default), no hook changes a single number the
                       game produced before cards existed — a day of hand
                       gathering, both towns' production and a hunt's meat
                       are byte-identical with the hooks and without them —
                       and nothing is put on the page
     FORAGER'S CACHE   +250 food, flown to the bar
     HARVEST FESTIVAL  a player gatherer and a station each bring in exactly
                       40% more over a day — the gatherer's load RICHER while
                       the stand is stripped at its own pace (the operator's
                       ruling: richer is more in total, never faster; the
                       whole of that rule is tests/deck-growth.mjs); the
                       panel says so; the rival's work is untouched; a hunt's
                       meat comes richer too; it ends on its day and the work
                       drops back
     SWIFT RAIDERS     five Horse Archers on really-open ground at the hall's
                       doorstep — never one stack, though the yards' own
                       search answers one tile however often it is asked —
                       over the cap, eating, marching out to a muster in a
                       flash that never touches S; refused (and kept) with no
                       hall or no ground
     STARFALL          every number of the card: 900→450 on buildings within
                       2, 250 FLAT on units within 3 (the card's own words),
                       the rival's hall never
                       below 60% from one card and never razed, the player's
                       own and the gold mine spared, kills and razes credited
                       under the card's own cause, never the wilds' 'fire' —
                       and the hall clamp holds even under 'fire', which would
                       take a hall off the board with no ending; the run's
                       rolled star untouched; refused while a star is falling
                       or a strike is landing
     DRAGONFIRE        flies in fast, burns every enemy within 3 to ash as
                       KILLS, 1,200 to buildings within 2.5 (the rival's hall
                       at most half), the fire line runs through the ground
                       chosen, the event's score line and roll never move
     THE TRUCE         a strike aimed at the rival on Calm says so first and
                       ends the truce BEFORE any blow lands (Bld.damage never
                       ends it by itself); aimed at barbarians alone it spares
                       a rival who walks in, or a hut laid meanwhile, and the
                       peace holds — and the question is asked of what the
                       PLAYER KNOWS (a unit in sight, a building remembered):
                       a hidden rival neither warns nor breaks the peace, so
                       sweeping the mark is never a fog lamp
     NO RNG            no card draws from S.rngState, the borrowed dragon act
                       included (its flames' jitter is a picture)
     SAVES             a running festival, a star in mid-air and a dragon on
                       the wing all survive a save and finish after the load

   Run after touching: js/deckfx.js, Deck.mult's hooks (Units.gatherYield,
   Units.workReport, the meat in Units.damage, Bld.dailyProduction),
   G.dragonTick, G.updateVisibility's card sights, R.starAct /
   drawCardStrike / drawCardWorld.

     node tests/deck-fx.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Deck && window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// the shared scaffolding every section builds on
await p.evaluate(() => {
  Boot.force(); Screens._demo = false;
  const W = () => CFG.W;
  window.__fx = {
    // a fresh run with the switch ON and a hand of every slice card
    fresh(seed, mode) {
      CFG.CARDS.ON = true;
      G.newGame(seed, mode || 'moderate', 'medium');
      S.paused = true;
      Deck._col = null; Deck._del(Deck.KEY);
      for (const id of ['forager_cache', 'harvest_festival', 'swift_raiders', 'starfall', 'dragonfire']) Deck._add(id, 9);
      return S;
    },
    // a flat, fully known world with only the two halls on it: every number
    // below is measured on ground the test built, so no seed can flatter it
    flat() {
      for (let i = 0; i < W() * CFG.H; i++) { S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; S.map.resAmount[i] = 0; }
      S.units = []; S.buildings = S.buildings.filter(z => z.key === 'tc');
      // the halls in two far corners, so the ground every section builds on is clear
      const P = Bld.tcOf('P'), A = Bld.tcOf('A');
      P.x = 3; P.y = 3; A.x = W() - 6; A.y = CFG.H - 6;
      Bld._block = null;
    },
    unit(kind, owner, x, y, hp) {
      const u = Units.spawn(kind, owner, Math.floor(x), Math.floor(y));
      u.x = x; u.y = y;
      if (hp) { u.hp = u.maxhp = hp; }
      return u;
    },
    bld(owner, key, x, y, hp) {
      const bb = Bld.place(owner, key, x, y, { free: true, instant: true });
      if (hp) { bb.hp = bb.maxhp = hp; }
      Bld._block = null;
      return bb;
    },
    // a strike in flight, ticked to the end of its last beat
    land() { for (let i = 0; i < 80 && S.deck.strike; i++) Deck.strikeTick(0.1); },
    // a dragon on the wing, flown until it has gone
    fly(onTick) { let t = 0; for (let i = 0; i < 900 && S.dragon.ev; i++) { G.dragonTick(1 / 30); t += 1 / 30; if (onTick) onTick(t); } return t; },
  };
});

// ---------------- 0. THE SWITCH: off, nothing moves ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    out.off = CFG.CARDS.ON === false && !Deck.on();
    out.noCss = !document.getElementById('deckCss');
    /* one deterministic economy, run twice: with the hooks reachable, and with
       window.Deck gone (every hook's guard), which is the game as it was */
    const run = (live) => {
      let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      Combat.scanT = 0; Units.herdClock = 0;
      G.newGame('fx-off', 'hard', 'medium'); S.paused = true;
      // the CONTROL: a festival left running in a save the switch now finds
      // off still pays — the probe must be able to see a hook that moves
      if (live) S.deck.fx.push({ id: 'harvest_festival', from: 0, until: 999 });
      const tc = Bld.tcOf('P');
      // a stand of wood beside open ground, painted where the hall's villagers can reach it
      const f = MapGen.findNear(tc.x + 4, tc.y + 4, 12, (x, y) => MapGen.onBoard(x, y) && MapGen.onBoard(x - 1, y) && !Bld.at(x, y) && !Bld.at(x - 1, y) &&
        Path.passable(x - 1, y, 'P'));
      S.map.terrain[MapGen.idx(f.x, f.y)] = T.FOREST; S.map.resAmount[MapGen.idx(f.x, f.y)] = 1e6; Bld._block = null;
      const v = S.units.find(u => u.owner === 'P' && u.kind === 'villager');
      v.x = f.x - 0.5; v.y = f.y + 0.5;
      out.gathering = Units.assignGather(v, f.x, f.y);
      for (let i = 0; i < 300; i++) Units.update(0.1);
      Bld.dailyProduction('P'); Bld.dailyProduction('A');
      const deer = Units.spawn('deer', 'W', tc.x, tc.y + 4);
      Units.damage(deer, 999, 0, 'P');
      if (!live) out.gathered = S.stats.gathered;
      return JSON.stringify([S.res, S.ai.res, S.stats.gathered, Units.gatherMode(v), Units.workReport(v)]);
    };
    const realRandom = Math.random;
    const withHooks = run();
    const keep = window.Deck; window.Deck = undefined;
    const without = run();
    window.Deck = keep;
    const control = run(true);
    Math.random = realRandom;
    out.same = withHooks === without;
    out.seen = control !== withHooks;
    out.sample = withHooks.slice(0, 120);
    out.refused = ['forager_cache', 'harvest_festival', 'swift_raiders', 'starfall', 'dragonfire'].every(id => !Deck.play(id, { x: 10.5, y: 10.5 }).ok);
    return out;
  });
  ck('theSwitchShipsOff', r.off && r.noCss, `off ${r.off}, deck css on the page ${!r.noCss}`);
  ck('offTheHooksChangeNothing', r.same && r.seen && r.gathering && r.gathered > 10,
    r.same ? `gather (${r.gathered.toFixed(2)} by hand), production and meat byte-identical; a live festival moves them: ${r.seen}` : r.sample);
  ck('offNothingCanBePlayed', r.refused);
}

// ---------------- 1. FORAGER'S CACHE ----------------
{
  const r = await p.evaluate(() => {
    __fx.fresh('fx-cache');
    const f0 = S.res.food, n0 = Deck.count('forager_cache'), rng = S.rngState;
    const out = Deck.play('forager_cache');
    return { food: S.res.food - f0, used: n0 - Deck.count('forager_cache'), fly: out.fly, at: Deck.FX.forager_cache.at, rng: S.rngState === rng };
  });
  ck('aForagersCacheIs250Food', r.food === 250 && r.used === 1 && r.fly && r.fly.food === 250 && r.at === 'bar',
    `+${r.food} food, ${r.used} card spent, fly ${JSON.stringify(r.fly)} at '${r.at}'`);
  ck('andTheCacheDrawsNoRng', r.rng);
}
/* …AND IT HAS A MOMENT AT THE HALL'S DOOR (the playtest: the one starter
   card with no moment in the world and no voice of its own, while its three
   Stone siblings each drop goods at the door). A woven basket comes down,
   lands in its dust and spills its food — each piece a step of the food
   count (its pays) adding to the 250 — in the card's own voice; and every
   beat of it draws, laying a picture worth the name. */
{
  const r = await p.evaluate(() => {
    __fx.fresh('fx-cache-moment');
    Screens.show('playing'); S.paused = true;
    R.cardShows = []; R.placePoofs = [];
    const tc = Bld.tcOf('P');
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 1);
    const heard = [], sp0 = Sound.play;
    Sound.play = function (k) { heard.push(k); return sp0.apply(this, arguments); };
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect, di = P2.drawImage;
    let marks = 0, peak = 0, threw = null;
    try {
      const out = Deck.play('forager_cache');
      const sh = R.cardShows.find(s => s.id === 'forager_cache');
      const d = Deck.FX.forager_cache;
      const pays = sh && d.show && d.show.pays ? d.show.pays.call(d, sh) : [];
      const sum = pays.reduce((a, e) => a + (e[2] || 0), 0);
      P2.fillRect = function () { marks++; return fr.apply(this, arguments); };
      P2.drawImage = function () { marks++; return di.apply(this, arguments); };
      const g = R.cv.getContext('2d');
      if (sh) for (let k = 1; k <= 30; k++) {
        sh.t = k / 30 * sh.ms / 1000 * 0.97; marks = 0;
        if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
        g.save();
        try { R.drawCardShows(g, 0, 'world'); } catch (e) { threw = String(e); }
        g.restore();
        peak = Math.max(peak, marks);
      }
      return { show: !!sh && sh.tc === tc.id && !!sh.at, pay: !!(out.pay && out.pay.ms > 0), pieces: pays.length,
        rest: pays.length > 0 && !pays[pays.length - 1][2] && sum < 250, voice: heard.includes('cardBasket') && typeof Sound._VOICES.cardBasket === 'function',
        poofs: R.placePoofs.length, peak, threw };
    } finally { P2.fillRect = fr; P2.drawImage = di; Sound.play = sp0; R.cardShows = []; }
  });
  ck('aForagersCacheIsSetDownAtTheHallsDoor', r.show && r.pay && r.pieces >= 4 && r.rest,
    `a show at the door ${r.show}, the bar held for its pieces ${r.pay}, ${r.pieces} pieces (the last the rest ${r.rest})`);
  ck('inItsOwnVoiceAndItsOwnDust', r.voice && r.poofs >= 1, `the basket's voice ${r.voice}, ${r.poofs} puffs of dust`);
  ck('andEveryBeatOfItDraws', !r.threw && r.peak >= 40, r.threw || `${r.peak} marks at its height`);
}

// ---------------- 2. HARVEST FESTIVAL ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-fest'); __fx.flat();
    const tcP = Bld.tcOf('P');
    // a wood to cut, for a player's hand and the rival's, side by side
    const wood = (x, y) => { const i = MapGen.idx(x, y); S.map.terrain[i] = T.FOREST; S.map.resAmount[i] = 1e6; };
    const fx = tcP.x + 6, fy = tcP.y + 6;
    wood(fx, fy); wood(fx + 3, fy);
    Bld._block = null;
    const vP = __fx.unit('villager', 'P', fx - 0.5, fy + 0.5), vA = __fx.unit('villager', 'A', fx + 4.5, fy + 0.5);
    Units.assignGather(vP, fx, fy); Units.assignGather(vA, fx + 3, fy);
    // a lumber camp worked by one hand, on the stumps it needs
    const sx = tcP.x + 6, sy = tcP.y + 12;
    S.map.terrain[MapGen.idx(sx, sy)] = T.STUMPS; Bld._block = null;
    const camp = __fx.bld('P', 'lumber', sx, sy);
    const hand = __fx.unit('villager', 'P', sx + 0.5, sy + 0.5); hand.task = { type: 'work', id: camp.id };
    for (let i = 0; i < 40; i++) Units.update(0.1);                 // everybody to work
    const iP = MapGen.idx(fx, fy);
    const day = () => {
      const p0 = S.res.wood, a0 = S.ai.res.wood, g0 = S.map.resAmount[iP];
      for (let i = 0; i < 100; i++) Units.update(0.1);              // one day: 100 x 0.1s = 10 real seconds
      const stand = g0 - S.map.resAmount[iP];
      const mid = Object.assign({}, S.res), aMid = Object.assign({}, S.ai.res);
      Bld.dailyProduction('P'); Bld.dailyProduction('A');
      const prod = {}, aProd = {};
      for (const k in S.res) prod[k] = S.res[k] - mid[k];
      for (const k in S.ai.res) aProd[k] = S.ai.res[k] - aMid[k];
      return { hand: mid.wood - p0, rival: aMid.wood - a0, prod, aProd, stand,
        rate: Units.workReport(vP).rate && Units.workReport(vP).rate.n, station: Units.workReport(hand).rate && Units.workReport(hand).rate.n };
    };
    out.working = vP.task && vP.task.type === 'gather' && vA.task && vA.task.type === 'gather' && Bld.workersActive(camp) === 1;
    const base = day();
    const rng = S.rngState;
    out.play = Deck.play('harvest_festival');
    out.at = Deck.FX.harvest_festival.at;
    out.days = +(Deck.timed('harvest_festival').until - Deck.now()).toFixed(6);
    out.cue = Deck.cue('motes');
    const rich = day();
    out.base = base; out.rich = rich;
    out.handRatio = rich.hand / base.hand;
    out.standRatio = rich.stand / base.stand;
    out.stationRatio = rich.prod.wood / base.prod.wood;
    out.goldRatio = rich.prod.gold / base.prod.gold;
    out.rivalSame = rich.rival === base.rival && JSON.stringify(rich.aProd) === JSON.stringify(base.aProd);
    out.panel = [rich.rate / base.rate, rich.station / base.station];
    // a hunt's meat is gathering too
    const deer = __fx.unit('deer', 'W', tcP.x + 2.5, tcP.y + 4.5);
    const f0 = S.res.food; Units.damage(deer, 999, 0, 'P'); out.meat = S.res.food - f0;
    out.meatWant = Math.round(CFG.MEAT.deer * 1.4);
    // …and its end: on the twelfth day the work drops back
    S.day += 11; Deck.tick();
    out.stillOn = Deck.mult('produce', 'P') === 1.4;
    const logs0 = S.log.length;
    S.day += 1; Deck.tick();
    out.over = !Deck.timed('harvest_festival') && Deck.mult('gather', 'P') === 1 && !Deck.cue('motes');
    out.endLogged = S.log.length > logs0 && /over/.test(S.log[0].msg);
    const after = day();
    out.afterSame = Math.abs(after.hand - base.hand) < 1e-9 && Math.abs(after.prod.wood - base.prod.wood) < 1e-9;
    out.rng = S.rngState === rng;
    // a second festival LENGTHENS the first, never stacks its strength
    Deck.play('harvest_festival'); const u1 = Deck.timed('harvest_festival').until;
    Deck.play('harvest_festival'); const u2 = Deck.timed('harvest_festival').until;
    out.extend = +(u2 - u1).toFixed(6); out.stack = Deck.mult('gather', 'P');
    return out;
  });
  ck('theFestivalRunsTwelveDays', r.play.ok && r.days === 12 && r.at === 'bar' && r.cue, `${r.days} days, at '${r.at}', motes ${r.cue}`);
  ck('aGathererBringsIn40PercentMore', r.working && Math.abs(r.handRatio - 1.4) < 1e-6,
    `${r.base.hand.toFixed(3)} → ${r.rich.hand.toFixed(3)} wood a day (x${r.handRatio.toFixed(4)})`);
  /* (the festival moved to js/deckfx-growth.js and its multiplier from the
     gatherer's PACE to the load's YIELD — Units.gatherYield. The two checks
     above held either way, which is exactly why this one was added: under the
     old pace multiplier the stand emptied 40% sooner and gave not one log
     more over its life) */
  ck('butTheStandIsStrippedAtItsOwnPace', r.standRatio > 0 && Math.abs(r.standRatio - 1) < 1e-9,
    `the stand gives ${r.base.stand.toFixed(3)} → ${r.rich.stand.toFixed(3)} a day (x${r.standRatio.toFixed(6)})`);
  ck('andAStationProduces40PercentMore', Math.abs(r.stationRatio - 1.4) < 1e-9 && Math.abs(r.goldRatio - 1.4) < 1e-9,
    `camp ${r.base.prod.wood} → ${r.rich.prod.wood} wood, hall ${r.base.prod.gold} → ${r.rich.prod.gold} gold`);
  ck('andThePanelSaysSo', r.panel.every(k => Math.abs(k - 1.4) < 1e-9), r.panel.map(k => 'x' + k.toFixed(4)).join(', '));
  ck('theRivalsWorkIsUntouched', r.rivalSame, `rival hand ${r.base.rival.toFixed(3)} vs ${r.rich.rival.toFixed(3)}; production ${JSON.stringify(r.rich.aProd)}`);
  ck('aHuntComesInRicherToo', r.meat === r.meatWant, `a deer: +${r.meat} food`);
  ck('itEndsOnItsDay', r.stillOn && r.over && r.endLogged && r.afterSame, `on day 11 ${r.stillOn}, after day 12 ${r.over}, logged ${r.endLogged}, back to base ${r.afterSame}`);
  ck('aSecondFestivalLengthensItNeverStacks', r.extend === 12 && r.stack === 1.4, `+${r.extend} days, x${r.stack}`);
  ck('andTheFestivalDrawsNoRng', r.rng);
}

// ---------------- 3. SWIFT RAIDERS ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-raid'); __fx.flat();
    const tc = Bld.tcOf('P'), door = { x: tc.x, y: tc.y + Bld.size(tc) };
    // the town is FULL: the riders must come anyway
    while (Units.popUsed('P') < Bld.popCap('P')) __fx.unit('villager', 'P', tc.x - 3.5, tc.y + 0.5);
    const cap = Bld.popCap('P'), pop0 = Units.popUsed('P'), eat0 = Units.foodUpkeep('P'), rng = S.rngState, trained0 = S.stats.trained;
    const ids0 = new Set(S.units.map(u => u.id));
    const play = Deck.play('swift_raiders');
    const riders = S.units.filter(u => !ids0.has(u.id));
    out.play = play.ok; out.at = Deck.FX.swift_raiders.at;
    out.kinds = riders.map(u => u.kind + ':' + u.owner).join(',');
    out.open = riders.every(u => Bld.spawnRoom('P', 'land', u.x | 0, u.y | 0));
    out.tiles = new Set(riders.map(u => (u.x | 0) + ',' + (u.y | 0))).size;
    out.near = Math.max(...riders.map(u => Math.hypot(u.x - door.x - 0.5, u.y - door.y - 0.5)));
    out.pop = { cap, before: pop0, after: Units.popUsed('P') };
    out.eats = +(Units.foodUpkeep('P') - eat0).toFixed(6);
    out.eatsWant = 5 * CFG.FOOD_UPKEEP.cavalry;
    out.march = riders.every(u => u.task && u.task.type === 'move' && u.path && u.path.length);
    out.flash = R.summons.length;
    out.flashInS = /summon/i.test(JSON.stringify(S));
    out.trained = S.stats.trained - trained0;
    for (let i = 0; i < 80; i++) Units.update(0.1);
    out.out = riders.map(u => +Math.hypot(u.x - door.x - 0.5, u.y - door.y - 0.5).toFixed(2));
    out.standing = riders.every(u => Path.passable(u.x | 0, u.y | 0, 'P'));
    out.rng = S.rngState === rng;
    // the CONTROL: the training yards' own search, asked five times, answers
    // one tile five times — it reads the ground, never who stands on it
    out.yardTiles = new Set([0, 1, 2, 3, 4].map(() => { const s = Bld.spawnSpotAt('P', 'horsearcher', door.x, door.y); return s.x + ',' + s.y; })).size;
    const drown = () => {
      for (let dy = -9; dy <= 10; dy++) for (let dx = -9; dx <= 10; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (MapGen.inB(x, y) && !Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
      }
      Bld._block = null;
    };
    // a doorstep with room for three: shared round, never one stack
    drown();
    for (let k = 0; k < 3; k++) S.map.terrain[MapGen.idx(door.x + k, door.y)] = T.GRASS;
    Bld._block = null;
    const ids1 = new Set(S.units.map(u => u.id));
    out.cramped = Deck.play('swift_raiders').ok;
    const per = {};
    for (const u of S.units) if (!ids1.has(u.id)) { const k = (u.x | 0) + ',' + (u.y | 0); per[k] = (per[k] || 0) + 1; }
    out.crampedPer = Object.values(per).sort().join('/');
    // refused, and kept: no open ground anywhere round the hall…
    drown();
    const n0 = Deck.count('swift_raiders'), u0 = S.units.length;
    out.drowned = Deck.play('swift_raiders');
    out.drownedKept = Deck.count('swift_raiders') === n0 && S.units.length === u0;
    // …or no hall at all
    __fx.fresh('fx-raid2');
    S.buildings = S.buildings.filter(z => !(z.owner === 'P' && z.key === 'tc')); Bld._block = null;
    const n1 = Deck.count('swift_raiders');
    out.noHall = Deck.play('swift_raiders');
    out.noHallKept = Deck.count('swift_raiders') === n1;
    return out;
  });
  ck('fiveHorseArchersRideOut', r.play && r.kinds === Array(5).fill('horsearcher:P').join(',') && r.at === 'tc', r.kinds);
  ck('eachOnReallyOpenGroundAtTheDoorstep', r.open && r.tiles === 5 && r.near <= 6.8, `${r.tiles} tiles, farthest ${r.near.toFixed(2)} from the doorstep`);
  ck('overTheCapAndEating', r.pop.before >= r.pop.cap && r.pop.after === r.pop.before + 5 && r.eats === r.eatsWant,
    `pop ${r.pop.before} → ${r.pop.after} of ${r.pop.cap}, +${r.eats} food a day`);
  ck('andTheyMarchIn', r.march && r.out.every(d => d >= 2) && r.standing, `from the doorstep after 8s: ${r.out.join(', ')}`);
  ck('theirFlashIsRenderStateOnly', r.flash === 5 && !r.flashInS, `${r.flash} summonings on R, in S: ${r.flashInS}`);
  ck('raisingThemIsNotTraining', r.trained === 0, `units trained ${r.trained}`);
  ck('andTheRaidersDrawNoRng', r.rng);
  ck('neverOneStack', r.yardTiles === 1 && r.tiles === 5 && r.cramped && r.crampedPer === '1/2/2',
    `the yards' search alone: ${r.yardTiles} tile for 5 asks; the riders: ${r.tiles} tiles; on a 3-tile doorstep ${r.crampedPer}`);
  ck('noGroundMeansTheCardIsKept', !r.drowned.ok && r.drownedKept && /open ground/.test(r.drowned.why), r.drowned.why);
  ck('noHallMeansTheCardIsKept', !r.noHall.ok && r.noHallKept, r.noHall.why);
}

// ---------------- 4. STARFALL ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-star'); __fx.flat();
    const T0 = { x: 20, y: 20 };   // a tile corner: the distances below come out whole
    const H = [__fx.bld('A', 'house', 19, 19, 5000),     // d 0 — the strike lands on its corner
               __fx.bld('A', 'house', 21, 19, 5000),     // d 1
               __fx.bld('A', 'house', 22, 19, 5000),     // d 2 — the edge
               __fx.bld('A', 'house', 23, 19, 5000)];    // d 3 — out of reach
    const camp = __fx.bld('R', 'raidercamp', 19, 21, 5000);   // d 1 — a barbarian camp is an enemy
    const own = __fx.bld('P', 'house', 20, 20, 5000);         // on the ground struck: the player's own
    const mine = __fx.bld('A', 'mine', 18, 20, 5000);         // d 1 — the works are never a target
    const U = [__fx.unit('defender', 'A', 20, 20, 1000),       // d 0
               __fx.unit('defender', 'A', 21.5, 20, 1000),     // d 1.5
               __fx.unit('defender', 'A', 23, 20, 1000),       // d 3 — the edge
               __fx.unit('defender', 'A', 23.5, 20, 1000),     // d 3.5 — out of reach
               __fx.unit('raider', 'R', 20, 22, 1000)];        // d 2
    const mineU = __fx.unit('defender', 'P', 20, 20.2, 1000);
    const wolf = __fx.unit('wolf', 'W', 19, 20, 1000);
    const doomed = __fx.unit('archer', 'A', 20.4, 19.6);       // 45hp: dies, a kill
    const hut = __fx.bld('A', 'house', 17, 20);                 // 80hp at d 2: razed
    const star0 = JSON.stringify(S.starfall), rng = S.rngState, kills = S.stats.kills, razed = S.stats.razed;
    const causes = new Set(), bd = Bld.damage;
    Bld.damage = function (bb, amt, cause) { causes.add(String(cause)); return bd.apply(this, arguments); };
    out.warn = Deck.FX.starfall.warn(T0);
    out.play = Deck.play('starfall', T0);
    out.state = S.deck.strike && S.deck.strike.phase;
    // nothing is struck while it falls; the blow lands on its beat
    let t = 0;
    out.fallingUntouched = true;
    while (S.deck.strike && S.deck.strike.phase === 'fall' && t < 5) {
      if (!(H.every(h => h.hp === 5000) && U.every(u => u.hp === 1000))) out.fallingUntouched = false;
      Deck.strikeTick(0.05); t += 0.05;
    }
    out.landsAt = +t.toFixed(2);
    out.landed = !!S.deck.strike && S.deck.strike.phase === 'down';
    out.hb = H.map(h => 5000 - h.hp);
    out.camp = 5000 - camp.hp;
    out.ub = U.map(u => 1000 - u.hp);
    out.spared = own.hp === 5000 && mineU.hp === 1000 && wolf.hp === 1000 && mine.hp === 5000;
    out.kills = S.stats.kills - kills; out.razed = S.stats.razed - razed;
    out.doomedGone = !S.units.includes(doomed) && !S.buildings.includes(hut);
    __fx.land();
    out.cleared = !S.deck.strike;
    out.star = JSON.stringify(S.starfall) === star0;
    out.rng = S.rngState === rng;
    // THE HALL: three stars on the rival's Town Center and it still stands
    const tc = Bld.tcOf('A');
    tc.hp = tc.maxhp;
    const at = { x: Bld.cx(tc), y: Bld.cy(tc) }, hps = [tc.hp];
    for (let k = 0; k < 4; k++) { Deck.play('starfall', at); __fx.land(); hps.push(tc.hp); }
    out.hall = { maxhp: tc.maxhp, hps, standing: S.buildings.includes(tc), over: !!S.over };
    Bld.damage = bd;
    out.causes = [...causes].join(',');
    /* …and the clamp holds WHATEVER the cause: Bld.damage skips the rival's
       ending for the wilds' 'fire', so a hall a card took to 0 under that
       cause would vanish with the run still going — the clamp must stand
       before Bld.damage is asked anything */
    tc.hp = tc.maxhp;
    Deck.hitBld(tc, 1e9, Deck.FX.starfall.TC_CAP, 'fire');
    const once = tc.hp;
    Deck.hitBld(tc, 1e9, 1, 'fire'); Deck.hitBld(tc, 1e9, 1, 'fire');
    out.fireProof = { once, max: tc.maxhp, last: tc.hp, standing: S.buildings.includes(tc) && Bld.tcOf('A') === tc, over: !!S.over };
    return out;
  });
  ck('starfallLandsAsThePlayEnds', r.play.ok && r.state === 'fall' && r.fallingUntouched && r.landed && r.landsAt <= 1.5,
    `lands ${r.landsAt}s after the play; nothing struck while it falls ${r.fallingUntouched}`);
  ck('buildings900ToHalfAtTwoTiles', JSON.stringify(r.hb) === JSON.stringify([900, 675, 450, 0]) && r.camp === 675,
    `houses at d 0/1/2/3: ${r.hb.join('/')}; barbarian camp at d 1: ${r.camp}`);
  ck('units250FlatOutToThreeTiles', JSON.stringify(r.ub) === JSON.stringify([250, 250, 250, 0, 250]),
    `rival at d 0/1.5/3/3.5: ${r.ub.slice(0, 4).join('/')}; raider at d 2: ${r.ub[4]}`);
  ck('yourOwnAndTheWildAndTheMineAreSpared', r.spared);
  ck('killsAndRazesAreCredited', r.kills === 1 && r.razed === 1 && r.doomedGone, `kills +${r.kills}, razed +${r.razed}`);
  ck('theRunsOwnStarIsUntouched', r.star && r.cleared, 'S.starfall byte-identical across the whole act');
  ck('andStarfallDrawsNoRng', r.rng);
  const hl = r.hall, step = hl.hps.map((h, i) => i ? hl.hps[i - 1] - h : 0).slice(1);
  ck('aRivalHallNeverFallsToACard', hl.standing && !hl.over && hl.hps[hl.hps.length - 1] >= 1 &&
    step[0] === Math.round(hl.maxhp * 0.4) && step.every(s => s <= hl.maxhp * 0.4 + 1e-9),
    `max ${hl.maxhp}: ${hl.hps.join(' → ')}`);
  const fp = r.fireProof;
  ck('theStarStrikesInItsOwnNameNeverTheWilds', r.causes === 'starfall', 'causes handed to Bld.damage: ' + r.causes);
  ck('andTheHallClampHoldsWhateverTheCause', fp.standing && !fp.over && fp.once === Math.round(fp.max * 0.6) && fp.last === 1,
    `'fire' at a 40% cap: ${fp.max} → ${fp.once}; uncapped twice more → ${fp.last}; still standing ${fp.standing}, run over ${fp.over}`);
}

// …refused, and kept
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-star-no'); __fx.flat();
    const T0 = { x: 15.5, y: 15.5 }, n = () => Deck.count('starfall');
    const keep = S.starfall.phase; S.starfall.phase = 'fall';
    const n0 = n(); out.event = Deck.play('starfall', T0); out.eventKept = n() === n0;
    S.starfall.phase = keep;
    Deck.play('starfall', T0);
    const n1 = n(); out.busy = Deck.play('starfall', T0); out.busyKept = n() === n1;
    __fx.land();
    S.map.explored[MapGen.idx(15, 15)] = 0;
    const n2 = n(); out.dark = Deck.play('starfall', T0); out.darkKept = n() === n2;
    out.edge = Deck.validTarget('starfall', 0.5, 0.5);
    return out;
  });
  ck('notWhileTheRunsStarFalls', !r.event.ok && r.eventKept, r.event.why);
  ck('notWhileAStrikeIsLanding', !r.busy.ok && r.busyKept, r.busy.why);
  ck('onlyOnExploredGround', !r.dark.ok && r.darkKept && !r.edge, r.dark.why);
}

// ---------------- 5. DRAGONFIRE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-drag'); __fx.flat();
    const T0 = { x: 12.5, y: 20.5 };
    const V = [__fx.unit('defender', 'A', 12.5, 20.5),
               __fx.unit('villager', 'A', 13.5, 20.5),
               __fx.unit('raider', 'R', 12.5, 22),
               __fx.unit('archer', 'A', 9.6, 20.5),
               __fx.unit('catapult', 'A', 12.5, 18.5)];
    const far = __fx.unit('defender', 'A', 16, 20.5);           // d 3.5
    const mine = __fx.unit('defender', 'P', 13, 20.5);          // the player's own, in the fire
    const wolf = __fx.unit('wolf', 'W', 11.5, 20.5);
    const near = __fx.bld('A', 'house', 15, 20, 5000);           // d 2.5 — the edge
    const out3 = __fx.bld('A', 'house', 16, 20, 5000);           // d 3.5
    const D = S.dragon, d0 = JSON.stringify({ avail: D.avail, done: D.done }), seen0 = S.stats.dragonSeen;
    const causes = new Set(), bd = Bld.damage;
    Bld.damage = function (bb, amt, cause) { causes.add(String(cause)); return bd.apply(this, arguments); };
    const day0 = S.specialDay, kills = S.stats.kills;
    // every draw from the run's stream is counted, and every fire point
    let draws = 0, points = 0;
    const rand = G.rand; G.rand = function () { draws++; return rand.apply(this, arguments); };
    const push = D.fire.push; D.fire.push = function () { points++; return push.apply(this, arguments); };
    out.warn = Deck.FX.dragonfire.warn(T0);
    out.play = Deck.play('dragonfire', T0);
    out.drawsAtPlay = draws;
    out.card = !!(D.ev && D.ev.card);
    let breath = null, line = null;
    const ashAt = [];
    out.t = __fx.fly(t => {
      if (breath == null && D.ev && D.ev.phase === 'burn') { breath = t; out.drawsFlying = draws; out.nearAtBreath = 5000 - near.hp; }
      // the moment the house catches, and where the fire front stood then
      if (out.nearCaught == null && near.hp < 5000 && D.ev) out.nearCaught = { front: D.ev.x + D.ev.dir * 2.1, dir: D.ev.dir, phase: D.ev.phase };
      if (!line && D.ev && D.ev.phase === 'leave') line = D.fire.map(f => f.x);
    });
    G.rand = rand; D.fire.push = push;
    out.breath = breath;
    out.victimsGone = V.every(u => !S.units.includes(u));
    out.kills = S.stats.kills - kills;
    out.ash = D.ash.length;
    out.spared = S.units.includes(far) && far.hp === far.maxhp && S.units.includes(mine) && mine.hp === mine.maxhp && S.units.includes(wolf);
    out.blds = [5000 - near.hp, 5000 - out3.hp];
    out.lineMid = line && line.length ? line.reduce((a, x) => a + x, 0) / line.length : null;
    out.lineN = line ? line.length : 0;
    out.event = JSON.stringify({ avail: D.avail, done: D.done }) === d0 && S.stats.dragonSeen === seen0 && S.specialDay === day0;
    out.draws = draws; out.points = points;
    // THE HALL: the rival's Town Center under the breath, twice
    const tc = Bld.tcOf('A'); tc.hp = tc.maxhp;
    const hps = [tc.hp];
    for (let k = 0; k < 3; k++) { Deck.play('dragonfire', { x: Bld.cx(tc), y: Bld.cy(tc) }); __fx.fly(); hps.push(tc.hp); }
    out.hall = { maxhp: tc.maxhp, hps, standing: S.buildings.includes(tc), over: !!S.over };
    Bld.damage = bd;
    out.causes = [...causes].join(',');
    // refused while the dragon is on the wing
    Deck.play('dragonfire', T0);
    const n0 = Deck.count('dragonfire');
    out.busy = Deck.play('dragonfire', T0); out.busyKept = Deck.count('dragonfire') === n0;
    __fx.fly();
    return out;
  });
  ck('theDragonComesQuickly', r.play.ok && r.card && r.breath != null && r.breath <= 1.5, `breathes ${r.breath && r.breath.toFixed(2)}s after the play`);
  ck('everyEnemyWithinThreeBurnsToAsh', r.victimsGone && r.ash >= 5, `5 of 5 burned (a defender, a villager, a raider, an archer, a catapult), ${r.ash} ash piles`);
  ck('andTheyAreKills', r.kills === 5, `kills +${r.kills}`);
  ck('yourOwnAndTheWildAndTheFarAreSpared', r.spared);
  /* …and a building CATCHES AS THE LINE OF FIRE REACHES IT, never before:
     the house at the far edge (x 15..16, the line running east) is untouched
     as the breath begins and takes its 1200 the frame the front reaches its
     footprint (half a tile of reach) — struck at the first breath, it fell
     in its own dust while the flame still landed tiles away */
  ck('buildingsTake1200WithinTwoAndAHalf', JSON.stringify(r.blds) === '[1200,0]' && r.nearAtBreath === 0 &&
      !!r.nearCaught && r.nearCaught.phase === 'burn' && r.nearCaught.dir > 0 && r.nearCaught.front >= 14.5 && r.nearCaught.front < 14.5 + 0.35,
    `house at d 2.5: ${r.blds[0]} (as the breath began: ${r.nearAtBreath}; caught with the fire front at x ${r.nearCaught && r.nearCaught.front.toFixed(2)}); at d 3.5: ${r.blds[1]}`);
  ck('theLineOfFireRunsThroughTheGroundChosen', r.lineN > 5 && Math.abs(r.lineMid - 12.5) < 1.2,
    `${r.lineN} fire points centred at x ${r.lineMid && r.lineMid.toFixed(2)} (aimed 12.5)`);
  ck('aCardsDragonIsNeverTheWorldsEvent', r.event, 'dragonSeen, specialDay, avail and done all unmoved');
  ck('theDragonBurnsInItsOwnNameNeverTheWilds', r.causes === 'dragonfire', 'causes handed to Bld.damage: ' + r.causes);
  ck('aRivalHallTakesHalfAtMost', r.hall.standing && !r.hall.over &&
    r.hall.hps[0] - r.hall.hps[1] === r.hall.maxhp * 0.5 && r.hall.hps[3] >= 1,
    `max ${r.hall.maxhp}: ${r.hall.hps.join(' → ')}`);
  ck('andTheCardsDragonDrawsNoRng', r.drawsAtPlay === 0 && r.drawsFlying === 0 && r.draws === 0 && r.points > 5,
    `${r.draws} draws from the run's stream over ${r.points} fire points and 5 ash piles`);
  ck('notWhileTheDragonIsOnTheWing', !r.busy.ok && r.busyKept, r.busy.why);
}

// …and aimed at a shore, no flame stands on the water and no stone smoulders on it
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-shore'); __fx.flat();
    // a lake west of x 14: the strikes land on its bank
    for (let y = 8; y < 30; y++) for (let x = 6; x < 14; x++) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    Bld._block = null;
    const T0 = { x: 14.5, y: 20.5 };
    Deck.play('dragonfire', T0);
    let fire = [];
    __fx.fly(() => { if (S.dragon.ev && S.dragon.ev.phase === 'leave' && !fire.length) fire = S.dragon.fire.slice(); });
    out.fire = fire.length;
    out.wetFire = fire.filter(f => G.wetAt(f.x, f.y)).length;
    // the star, drawn frame by frame until its debris has landed
    Screens.show('playing');
    R.centerOn(14.5, 20.5);
    Deck.play('starfall', T0);
    for (let i = 0; i < 150; i++) { Deck.strikeTick(1 / 30); R.draw(1 / 30); }
    const TL = CFG.TILE, sky = R._cardSky, deb = sky ? sky.debris.filter(d => d.landed != null) : [];
    out.landed = deb.length;
    out.wetDebris = deb.filter(d => G.wetAt(d.x / TL, d.y / TL)).length;
    out.thrown = R.STAR.debris;   // the blow throws this many: the ones missing went in the lake
    __fx.land();
    return out;
  });
  ck('noFlameStandsOnTheWater', r.fire > 3 && r.wetFire === 0, `${r.fire} flames on the bank, ${r.wetFire} on the lake`);
  ck('andTheStarsStonesSinkInIt', r.landed > 3 && r.landed < r.thrown && r.wetDebris === 0,
    `${r.landed} of ${r.thrown} stones resting on land, ${r.thrown - r.landed} sunk, ${r.wetDebris} on the lake`);
}

// ---------------- 6. THE TRUCE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    /* NO BLOW LANDS ON THE RIVAL AT PEACE. Bld.damage never ends the truce by
       itself (its safety net lives in Units.damage alone), so the order is the
       whole rule: every hit on the rival this section deals is counted, and
       any one dealt while S.peace still holds is a strike shelling a town
       whose army may not answer */
    let atPeace = 0, onRival = 0;
    const bd = Bld.damage, ud = Units.damage;
    Bld.damage = function (bb) { if (bb.owner === 'A') { onRival++; if (S.peace) atPeace++; } return bd.apply(this, arguments); };
    Units.damage = function (u) { if (u.owner === 'A') { onRival++; if (S.peace) atPeace++; } return ud.apply(this, arguments); };
    // aimed at the rival: told first, and the truce ends at the play
    __fx.fresh('fx-calm', 'calm'); __fx.flat();
    out.peace0 = S.peace === true;
    // a strike is weighed against what the PLAYER knows: a building is known
    // once it is in their memory (S.map.seenB — kept in step while in sight)
    const known = b => { S.map.seenB[MapGen.idx(b.x, b.y)] = { key: b.key, level: b.level, owner: b.owner }; return b; };
    const h = known(__fx.bld('A', 'house', 20, 20, 5000));
    const T0 = { x: 20.5, y: 20.5 };
    out.TRUCE = Deck.TRUCE;
    out.warn = Deck.FX.starfall.warn(T0);
    out.warnD = Deck.FX.dragonfire.warn(T0);
    Deck.play('starfall', T0);
    out.broken = S.peace === false;
    __fx.land();
    out.struck = 5000 - h.hp;
    // aimed at barbarians alone: no warning, and a rival who walks in is spared
    __fx.fresh('fx-calm2', 'calm'); __fx.flat();
    const raider = __fx.unit('raider', 'R', 30.5, 20.5, 1000);
    const walker = __fx.unit('defender', 'A', 34.5, 20.5, 1000);   // d 4 when aimed
    const T1 = { x: 30.5, y: 20.5 };
    out.quiet = Deck.FX.starfall.warn(T1);
    Deck.play('starfall', T1);
    walker.x = 31.5;                                                  // …d 1 when it lands
    const site = __fx.bld('A', 'house', 29, 20, 5000);                // …and a hut the chief lays in the blast meanwhile
    __fx.land();
    out.held = S.peace === true;
    out.raider = 1000 - raider.hp; out.walker = 1000 - walker.hp; out.site = 5000 - site.hp;
    walker.x = 34.5;                                                  // …and off it again
    S.buildings = S.buildings.filter(z => z !== site); Bld._block = null;
    // the dragon keeps the same terms
    const h2 = known(__fx.bld('A', 'house', 30, 25, 5000));
    out.dragonQuiet = Deck.FX.dragonfire.warn({ x: 30.5, y: 20.5 });
    out.dragonWarn = Deck.FX.dragonfire.warn({ x: 30.5, y: 24.5 });
    Deck.play('dragonfire', { x: 30.5, y: 24.5 });
    out.dragonBroke = S.peace === false;
    __fx.fly();
    out.h2 = 5000 - h2.hp;
    /* NEVER A FOG LAMP. A rival the player cannot see — a soldier on ground
       out of sight, a house never seen — draws no warning, and a strike
       there leaves the peace whole and the hidden things unharmed (at peace
       the rival is no target). The same soldier in sight warns. */
    __fx.fresh('fx-calm3', 'calm'); __fx.flat();
    G.updateVisibility();
    const hidU = __fx.unit('defender', 'A', 40.5, 20.5, 1000);
    const hidB = __fx.bld('A', 'house', 41, 22, 5000);
    const hi = MapGen.idx(40, 20);
    S.map.explored[hi] = 1;
    if (G.vis) G.vis[hi] = 0;
    out.hidVisible = G.visibleAt(40, 20);
    out.hidWarn = Deck.FX.starfall.warn({ x: 40.5, y: 20.5 });
    out.hidWarnD = Deck.FX.dragonfire.warn({ x: 40.5, y: 20.5 });
    Deck.play('starfall', { x: 40.5, y: 20.5 });
    __fx.land();
    out.hidPeace = S.peace === true;
    out.hidHurt = (1000 - hidU.hp) + (5000 - hidB.hp);
    G.vis[hi] = 1;
    out.seenWarn = Deck.FX.starfall.warn({ x: 40.5, y: 20.5 });
    G.vis[hi] = 0;
    Bld.damage = bd; Units.damage = ud;
    out.atPeace = atPeace; out.onRival = onRival;
    return out;
  });
  ck('noBlowLandsOnTheRivalAtPeace', r.atPeace === 0 && r.onRival >= 2, `${r.onRival} blows on the rival, ${r.atPeace} of them while the truce held`);
  ck('aStrikeAtTheRivalWarnsFirst', r.peace0 && r.warn === r.TRUCE && /truce/.test(r.warn) && r.warnD === r.warn, String(r.warn));
  ck('andEndsTheTruce', r.broken && r.struck === 900, `peace broken ${r.broken}, the house took ${r.struck}`);
  ck('aStrikeAtBarbariansKeepsThePeace', r.quiet === null && r.held && r.raider === 250 && r.walker === 0 && r.site === 0,
    `warning ${r.quiet}; raider -${r.raider}, the rival who walked in -${r.walker}, a hut laid in the blast -${r.site}, peace ${r.held}`);
  ck('aHiddenRivalNeitherWarnsNorBreaksThePeace', r.hidVisible === false && r.hidWarn === null && r.hidWarnD === null &&
    r.hidPeace && r.hidHurt === 0 && r.seenWarn === r.TRUCE,
    `hidden: warn ${r.hidWarn}/${r.hidWarnD}, peace ${r.hidPeace}, hurt ${r.hidHurt}; the same soldier in sight warns ${!!r.seenWarn}`);
  ck('theDragonKeepsTheSameTerms', r.dragonQuiet === null && r.dragonWarn === r.warn && r.dragonBroke && r.h2 === 1200,
    `quiet ${r.dragonQuiet}, broke ${r.dragonBroke}, house -${r.h2}`);
}

// ---------------- 7. SAVES ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-save'); __fx.flat();
    // a festival running
    Deck.play('harvest_festival');
    const until = Deck.timed('harvest_festival').until;
    G.loadJSON(G.saveJSON());
    out.fest = !!Deck.timed('harvest_festival') && Deck.timed('harvest_festival').until === until && Deck.mult('produce', 'P') === 1.4;
    // a star in mid-air
    const h = __fx.bld('A', 'house', 20, 20, 5000);
    Deck.play('starfall', { x: 20.5, y: 20.5 });
    for (let i = 0; i < 5; i++) Deck.strikeTick(0.1);
    const json = G.saveJSON();
    G.loadJSON(json);
    const st = S.deck.strike;
    out.midAir = !!st && st.phase === 'fall' && Math.abs(st.t - 0.5) < 1e-9;
    __fx.land();
    out.landedOnce = 5000 - Bld.get(h.id).hp;
    // a pause holds it in the sky
    Deck.play('starfall', { x: 20.5, y: 20.5 });
    S.paused = true;
    const t0 = S.deck.strike.t, now = performance.now();
    for (let i = 1; i <= 5; i++) G.frame(now + i * 16);
    out.paused = S.deck.strike.t === t0;
    S.paused = false;
    for (let i = 6; i <= 10; i++) G.frame(now + i * 16);
    out.unpaused = S.deck.strike.t > t0;
    S.paused = true;
    __fx.land();
    // a dragon on the wing
    const v = __fx.unit('defender', 'A', 25.5, 25.5);
    Deck.play('dragonfire', { x: 25.5, y: 25.5 });
    for (let i = 0; i < 10; i++) G.dragonTick(1 / 30);
    G.loadJSON(G.saveJSON());
    out.wing = !!(S.dragon.ev && S.dragon.ev.card);
    __fx.fly();
    out.burned = !S.units.some(u => u.id === v.id);
    return out;
  });
  ck('aRunningFestivalRidesTheSave', r.fest);
  ck('aStarInMidAirLandsAfterTheLoad', r.midAir && r.landedOnce === 900, `mid-air ${r.midAir}, the house took ${r.landedOnce}`);
  ck('aPauseHoldsItInTheSky', r.paused && r.unpaused);
  ck('aDragonOnTheWingFinishesAfterTheLoad', r.wing && r.burned);
}

// ---------------- 8. THE PICTURE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __fx.fresh('fx-draw'); __fx.flat();
    Screens.show('playing');
    const tc = Bld.tcOf('P');
    R.centerOn(tc.x + 3, tc.y + 3);
    const u = __fx.unit('villager', 'P', tc.x + 3.5, tc.y + 3.5);
    u.task = { type: 'gather', x: tc.x + 4, y: tc.y + 3 };
    Deck.play('harvest_festival');
    Deck.play('swift_raiders');
    // the run's own star and a card's, in the sky together
    S.starfall = { avail: true, day: S.day, warned: true, phase: 'fall', t: 1, x: tc.x + 6, y: tc.y + 6, aiSent: false, claimed: null, iron: {}, done: false };
    S.starfall.phase = 'down';   // a claimed-later crater sits while the card falls
    Deck.play('starfall', { x: tc.x + 3.5, y: tc.y + 3.5 });
    let threw = null;
    try { for (let i = 0; i < 30; i++) { R.draw(1 / 30); Deck.strikeTick(1 / 30); } } catch (e) { threw = String(e); }
    out.threw = threw;
    out.twoSkies = !!R._cardSky && R._cardSky !== R._sky;
    try { __fx.land(); for (let i = 0; i < 400 && R._cardSky; i++) R.draw(1 / 30); } catch (e) { threw = String(e); }
    out.drained = !R._cardSky;
    out.threw2 = threw;
    return out;
  });
  ck('theCardsStarAndTheRunsShareTheSky', !r.threw && r.twoSkies, r.threw || 'two skies, drawn together');
  ck('andTheCardsSkyDrainsAway', r.drained && !r.threw2, r.threw2 || 'gone once its smoke has thinned');
}

// ---------------- 9. SCOUT'S FIRE: THE FIRE LIGHTS ITSELF, THE DARK IS WHOLE ----------------
/* The playtest's critics on Scout's Fire (a Stone card whose effect lives in
   js/deckfx-rival.js): at the catch a FLAT ORANGE DISC two and a half tiles
   across lay on the ground with a soft white glow at its base — warm light
   pooled on the meadow, the house style's one forbidden thing — and while
   the fog rolled back a faint TILE GRID showed across the unexplored black
   (every tile of it a rect of its own, each edge anti-aliased on its own at
   the play zoom, the ground showing through every seam). Measured on the
   show: round the fire's foot, out past its own flame, the ground is left
   alone; and the black it draws over the dark is one unbroken black at a
   fractional zoom. */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE;
    __fx.fresh('fx-scoutfire'); __fx.flat();
    Screens.show('playing'); S.paused = true;
    Deck._add('scouts_fire', 2);
    const P = Bld.tcOf('P'), ax = P.x + 12, ay = P.y + 10;
    // the far ground unexplored, the fire's own few tiles known
    for (let y = ay - 9; y <= ay + 9; y++) for (let x = ax - 9; x <= ax + 9; x++) if (MapGen.inB(x, y)) S.map.explored[MapGen.idx(x, y)] = 0;
    for (let y = ay - 1; y <= ay + 1; y++) for (let x = ax - 1; x <= ax + 1; x++) S.map.explored[MapGen.idx(x, y)] = 1;
    R.cardShows = [];
    const play = Deck.play('scouts_fire', { x: ax + 0.5, y: ay + 0.5 });
    const sh = R.cardShows.find(s => s.id === 'scouts_fire');
    out.play = play.ok && !!sh;
    if (!sh) return out;
    // (a) the catch, on flat meadow at world scale: the annulus round the fire's
    // foot, outside its flame's own column, left as it was
    const GR = [91, 132, 57], fx = sh.x * TL, fy = sh.y * TL + TL * 0.25;
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200;
    const cg = cv.getContext('2d');
    sh.dark = []; sh.dim = [];          // the fog-back is (b)'s question
    let worst = 0;
    for (const t of [0.02, 0.06, 0.1, 0.16, 0.22]) {
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.fillStyle = 'rgb(' + GR + ')'; cg.fillRect(0, 0, 200, 200);
      cg.setTransform(1, 0, 0, 1, 100 - fx, 100 - fy);
      sh.t = t; if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
      R.drawCardShows(cg, 0, 'world');
      const d = cg.getImageData(0, 0, 200, 200).data;
      let n = 0, m = 0;
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
        const dx = x - 100, dy = y - (100 - TL * 0.4), rr = Math.hypot(dx, dy);
        if (rr < TL * 0.75 || rr > TL * 1.1 || Math.abs(dx) < TL * 0.55) continue;
        m++;
        const i = (y * 200 + x) * 4;
        if (d[i] !== GR[0] || d[i + 1] !== GR[1] || d[i + 2] !== GR[2]) n++;
      }
      worst = Math.max(worst, n / Math.max(1, m));
    }
    out.disc = worst;
    // (b) the fog rolling back: the black over a block of dark tiles four to
    // seven tiles off, at the play zoom on a phone (a fractional device scale)
    const blk = [];
    for (let y = ay - 2; y <= ay + 2; y++) for (let x = ax + 4; x <= ax + 7; x++) blk.push(MapGen.idx(x, y));
    sh.dark = blk; sh.t = 0.05;
    const Z = 3.4, bx = (ax + 4) * TL, by = (ay - 2) * TL, W2 = Math.ceil(4 * TL * Z), H2 = Math.ceil(5 * TL * Z);
    const c2 = document.createElement('canvas'); c2.width = W2; c2.height = H2;
    const g2 = c2.getContext('2d');
    g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, W2, H2);
    g2.setTransform(Z, 0, 0, Z, -bx * Z + 0.37, -by * Z + 0.61);
    const vt = R.viewTiles; R.viewTiles = () => ({ x0: -2, y0: -2, x1: CFG.W + 2, y1: CFG.H + 2 });
    try { if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh); R.drawCardShows(g2, 0, 'world'); } finally { R.viewTiles = vt; }
    const d2 = g2.getImageData(0, 0, W2, H2).data;
    let seams = 0;
    for (let y = 4; y < H2 - 4; y++) for (let x = 4; x < W2 - 4; x++) {
      const i = (y * W2 + x) * 4;
      if (d2[i] !== 13 || d2[i + 1] !== 11 || d2[i + 2] !== 8) seams++;
    }
    out.seams = seams;
    R.cardShows = [];
    return out;
  });
  ck('scoutsFireLightsOnlyItselfNoPoolOnTheGround', r.play && r.disc < 0.12, `at most ${(100 * (r.disc || 0)).toFixed(0)}% of the ground round its foot touched (the old catch: a disc over all of it)`);
  ck('andTheDarkItDrawsIsWholeNoTileGrid', r.play && r.seams === 0, `${r.seams} pixels of seam inside a block of dark tiles at a fractional zoom`);
}

// ---------------- 10. PATHFINDER'S MAP GIVES NOTHING AWAY, AND THE FOG IS SEEN TO GO ----------------
/* The playtest's critics (a Bronze card whose effect lives in
   js/deckfx-rival.js): the minimap showed the whole world and the relic's X
   on the LANDING frame while the hide was still blank; the hide left as "a
   big translucent rectangle smeared over the town"; the land was hatched
   and the water left blank, so it did not read as the blue-heavy minimap;
   and the fog peeling back happened off camera. Now: the minimap holds the
   world dark until the fog's own rings reach it, the X waits for the
   charcoal to strike it, the hide rolls back up (no alpha), the sea is
   washed and inked in wave dashes, and after the view goes to the X the fog
   steps back from the hall outward — drawn as one path. */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE, W = CFG.W;
    __fx.fresh('fx-pathfinder'); __fx.flat();
    Screens.show('playing'); S.paused = true;
    Deck._add('pathfinders_map', 2);
    const P = Bld.tcOf('P');
    // a sea to the east, the far half of the world dark, a relic in it
    for (let y = 0; y < CFG.H; y++) for (let x = 24; x < 34; x++) if (MapGen.inB(x, y)) { const i = MapGen.idx(x, y); S.map.terrain[i] = T.WATER; if (S.map.seenTerrain) S.map.seenTerrain[i] = T.WATER; }
    for (let i = 0; i < W * CFG.H; i++) { const x = i % W, y = (i / W) | 0; if (Math.hypot(x - P.x, y - P.y) > 9) S.map.explored[i] = 0; }
    S.relic = { key: 'aqueduct', x: 18, y: 18, w: 2, h: 2, found: 0, amount: 0 };
    G.updateVisibility();
    R.cam.z = 1.7; R.centerOn(Bld.cx(P), Bld.cy(P));
    R.cardShows = [];
    const PF = Deck.FX.pathfinders_map;
    const play = Deck.play('pathfinders_map');
    const s = R.cardShows.find(z => z.id === 'pathfinders_map');
    out.play = play.ok && !!s;
    if (!s) return out;
    const B = PF.BEAT || { LIFT: 3.1, ROLL: 0.6, PAN0: 3.45, PAN: 0.7, FOG0: 4.25, FOG: 0.8 };
    // THE MINIMAP on the landing frame: a far charted tile still dark, the relic's X not there yet
    const far = MapGen.idx(30, 30), farTile = { x: 30, y: 30 };
    const mini = (x, y) => { R.drawMini(); const d = R.mg.getImageData(x * 2, y * 2, 1, 1).data; return [d[0], d[1], d[2]]; };
    s.t = 0;
    out.miniLanding = mini(farTile.x, farTile.y).join(',');
    out.xLanding = mini(19, 19).join(',');
    s.t = (B.FOG0 || 4.25) + (B.FOG || 0.8) + 0.05;
    out.miniAfter = mini(farTile.x, farTile.y).join(',');
    out.xAfter = mini(19, 19).join(',');
    out.far = !!s.mask && s.mask[far] === 1;
    // THE HIDE leaves by rolling up: never drawn through an alpha, and narrower as it goes
    const cv = document.createElement('canvas'); cv.width = R.cv.width; cv.height = R.cv.height;
    const g = cv.getContext('2d');
    const di = CanvasRenderingContext2D.prototype.drawImage, art = [];
    CanvasRenderingContext2D.prototype.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw) { if (this === g && img === s.art) art.push({ a: this.globalAlpha, w: dw }); return di.apply(this, arguments); };
    try {
      for (const t of [B.LIFT - 0.2, B.LIFT + B.ROLL * 0.3, B.LIFT + B.ROLL * 0.7]) { s.t = t; g.save(); PF.show.draw.call(PF, g, s, t / (s.ms / 1000), 0, 'sky'); g.restore(); }
    } finally { CanvasRenderingContext2D.prototype.drawImage = di; }
    out.hide = art.map(a => a.a.toFixed(2) + '@' + Math.round(a.w)).join(' ');
    out.noAlpha = art.length === 3 && art.every(a => a.a === 1);
    out.rolls = art.length === 3 && art[0].w > art[1].w && art[1].w > art[2].w;
    // THE SEA on the hide: washed, and inked in wave dashes
    const ink = s.ink.getContext('2d').getImageData(0, 0, s.aw, s.ah).data, hide = s.art.getContext('2d').getImageData(0, 0, s.aw, s.ah).data;
    let waves = 0, wash = 0;
    for (let y = 0; y < CFG.H; y++) for (let x = 25; x < 33; x++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((s.M + y * 2 + dy) * s.aw + s.M + x * 2 + dx) * 4;
      if (ink[i + 3] && ink[i + 2] > ink[i] && ink[i + 2] > ink[i + 1] - 4) waves++;   // a cool ink on the water
      if (hide[i] === 168 && hide[i + 1] === 156 && hide[i + 2] === 126) wash++;
    }
    out.waves = waves; out.wash = wash;
    // THE VIEW GOES TO THE X, then the fog steps back from the hall outward
    R.centerOn(Bld.cx(P), Bld.cy(P));
    s.pan = null; s.panDone = false;
    for (let t = (B.PAN0 || 3.45) - 0.05; t <= (B.PAN0 || 3.45) + (B.PAN || 0.7) + 0.05; t += 0.05) { s.t = t; g.save(); PF.show.draw.call(PF, g, s, t / (s.ms / 1000), 0, 'world'); g.restore(); }
    out.atX = R.onScreen(19, 19);
    const near = MapGen.idx(P.x + 11, P.y + 1);
    const held = (t, i) => { s.t = t; return PF.held ? PF.held(s, i) : true; };
    out.steps = {
      before: held((B.FOG0 || 4.25) - 0.01, near) && held((B.FOG0 || 4.25) - 0.01, far),
      mid: !held((B.FOG0 || 4.25) + (B.FOG || 0.8) * 0.5, near) && held((B.FOG0 || 4.25) + (B.FOG || 0.8) * 0.5, far),
      end: !held((B.FOG0 || 4.25) + (B.FOG || 0.8), far),
    };
    const radii = new Set();
    if (PF.released) for (let t = (B.FOG0 || 4.25); t <= (B.FOG0 || 4.25) + (B.FOG || 0.8); t += 0.02) { s.t = t; radii.add(PF.released(s).toFixed(3)); }
    out.radii = radii.size;
    // the dark it draws over the charted ground is ONE path, never a rect per run
    let rects = 0, fills = 0;
    const fr = CanvasRenderingContext2D.prototype.fillRect, fl = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fillRect = function () { if (this === g) rects++; return fr.apply(this, arguments); };
    CanvasRenderingContext2D.prototype.fill = function () { if (this === g) fills++; return fl.apply(this, arguments); };
    try { s.t = 1; g.save(); PF.show.draw.call(PF, g, s, 1 / (s.ms / 1000), 0, 'world'); g.restore(); }
    finally { CanvasRenderingContext2D.prototype.fillRect = fr; CanvasRenderingContext2D.prototype.fill = fl; }
    out.paths = { rects, fills };
    R.cardShows = [];
    return out;
  });
  const dark = c => c && c.split(',').every(v => +v < 16);
  ck('theMinimapGivesNothingAwayOnTheLandingFrame', r.play && r.far && dark(r.miniLanding) && !dark(r.miniAfter) && dark(r.xLanding) && !dark(r.xAfter),
    `a far charted tile: ${r.miniLanding} landing, ${r.miniAfter} once the fog is back; the relic's middle ${r.xLanding} → ${r.xAfter}`);
  ck('theHideRollsBackUpNeverFades', r.noAlpha && r.rolls, r.hide);
  ck('theSeaIsWashedAndInkedInWaves', r.waves > 40 && r.wash > 200, `${r.waves} wave pixels, ${r.wash} washed`);
  ck('theViewGoesToTheXAndTheFogStepsBackFromTheHall', r.atX && r.steps && r.steps.before && r.steps.mid && r.steps.end && r.radii >= 5 && r.radii <= 8,
    `the X on screen after the pan ${r.atX}; held before ${r.steps && r.steps.before}, near released / far held mid-way ${r.steps && r.steps.mid}, all released at the end ${r.steps && r.steps.end}; ${r.radii} hard rings`);
  ck('andTheDarkOverTheChartedGroundIsOnePath', r.paths && r.paths.rects === 0 && r.paths.fills === 1, JSON.stringify(r.paths));
}

// ---------------- 11. WILLING HANDS WALK UP, AS THE CARD SAYS ----------------
/* The playtest's critics (a Stone card whose effect lives in
   js/deckfx-army.js): "the card's flavour text says strangers walk up; the
   play shows them materialising", out of the goods' cream bars, two of the
   three walking off overlapped into one sprite. Now they come out of the
   treeline (or in from the edge of the view) on ground the player knows and
   the door can be walked to from, in single file half a tile apart, packs on
   their backs, and each joins with a hard-pixel burst at the door. */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE, W = CFG.W;
    __fx.fresh('fx-hands'); __fx.flat();
    Screens.show('playing'); S.paused = true;
    Deck._add('willing_hands', 2);
    const P = Bld.tcOf('P'); P.x = 12; P.y = 12; Bld._block = null;
    // a wood to the north-west, a lake to the east the door cannot be walked across to
    for (let y = 4; y <= 7; y++) for (let x = 6; x <= 10; x++) S.map.terrain[MapGen.idx(x, y)] = T.FOREST;
    for (let y = 6; y <= 20; y++) for (let x = 18; x <= 21; x++) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    Bld._block = null;
    G.updateVisibility();
    R.cam.z = 1.7; R.centerOn(Bld.cx(P), Bld.cy(P));
    R.cardShows = [];
    const ids0 = new Set(S.units.map(u => u.id));
    const play = Deck.play('willing_hands');
    const hands = S.units.filter(u => !ids0.has(u.id));
    out.play = play.ok && hands.length === 3;
    const hx = Bld.cx(P), hy = Bld.cy(P);
    const reach = Path.reachFrom([Deck.summonDoor('villager').first]);
    out.from = hands.map(u => +Math.hypot(u.x - hx, u.y - hy).toFixed(2));
    out.known = hands.every(u => S.map.explored[MapGen.idx(u.x | 0, u.y | 0)] && reach[MapGen.idx(u.x | 0, u.y | 0)]);
    out.treeline = hands.some(u => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (S.map.terrain[MapGen.idx((u.x | 0) + dx, (u.y | 0) + dy)] === T.FOREST) return true; return false; });
    // single file: each sets off on its own beat, never two together
    const waits = hands.map(u => u.task && u.task.type === 'muster' ? +u.task.wait.toFixed(2) : null);
    out.waits = waits;
    // walked in: every few tenths of a second, the strangers never stacked, the show drawn
    const s = R.cardShows.find(z => z.id === 'willing_hands'), WH = Deck.FX.willing_hands;
    let minGap = 9, packs = 0, bursts = 0;
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d'), di = CanvasRenderingContext2D.prototype.drawImage, fr = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.drawImage = function (img) { if (this === g && WH._pack && img === WH._pack) packs++; return di.apply(this, arguments); };
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) { if (this === g && w === 4 && h === 4) bursts++; return fr.apply(this, arguments); };
    try {
      for (let t = 0; t < 7; t += 0.1) {
        Units.update(0.1);
        if (s) { s.t = t; WH.show.draw.call(WH, g, s, t / (s.ms / 1000), 0.1, 'world'); }
        const moving = hands.filter(u => Units.moving(u));
        for (let i = 0; i < hands.length; i++) for (let j = i + 1; j < hands.length; j++)
          if (Units.moving(hands[i]) && Units.moving(hands[j])) minGap = Math.min(minGap, Math.hypot(hands[i].x - hands[j].x, hands[i].y - hands[j].y));
        void moving;
      }
    } finally { CanvasRenderingContext2D.prototype.drawImage = di; CanvasRenderingContext2D.prototype.fillRect = fr; }
    out.minGap = +minGap.toFixed(2);
    out.packs = packs; out.bursts = bursts;
    out.joined = s ? Object.keys(s.joined || {}).length : 0;
    out.home = hands.map(u => +Math.hypot(u.x - hx, u.y - hy).toFixed(2));
    R.cardShows = [];
    return out;
  });
  ck('willingHandsWalkUpFromTheTreelineOnKnownGround', r.play && r.from.every(d => d >= 4.4) && r.known && r.treeline,
    `three set out ${r.from && r.from.join('/')} tiles from the hall, on known walkable ground ${r.known}, at the wood's edge ${r.treeline}`);
  ck('inSingleFileHalfATileApart', r.waits && new Set(r.waits).size === 3 && r.waits.every(w => w != null) && r.minGap >= 0.4,
    `they set off at ${r.waits && r.waits.join('/')} s; never closer than ${r.minGap} tiles while walking`);
  ck('withPacksOnTheirBacksAndABurstAtTheDoor', r.packs > 20 && r.joined === 3 && r.bursts >= 3 && r.home.every(d => d < 4),
    `${r.packs} pack draws on the walk; ${r.joined} joined at the door with ${r.bursts} burst marks; home at ${r.home && r.home.join('/')} tiles`);
}

// ---------------- 12. EVERY PLAY SAYS WHAT IT DID ----------------
/* The playtest's critics: with no line of its own, the landing toast falls
   back to the card's first sentence — Scout's Fire said "Choose any point."
   after the point was chosen, a second Harvest Festival repeated "…for 12
   days." while its chip read 24, and Mending said "3 buildings made whole"
   beside a work site still on fire. Every Stone and Bronze card of this
   slice now returns a line of what it DID (r.msg — DeckUI._land shows it),
   never its rule sentence. */
{
  const r = await p.evaluate(() => {
    const out = { msgs: {}, rule: {} };
    __fx.fresh('fx-results'); __fx.flat();
    Screens.show('playing'); S.paused = true;
    const P = Bld.tcOf('P');
    const IDS = ['forager_cache', 'fallen_timber', 'loose_stone', 'gold_nugget', 'willing_hands', 'scouts_fire', 'quick_hands', 'mending',
      'trade_caravan', 'harvest_festival', 'watchfires', 'master_builders', 'pathfinders_map', 'bountiful_land'];
    for (const id of IDS) Deck._add(id, 3);
    // something to mend, a tower to light, a site burning beside them, ground still dark
    const hut = __fx.bld('P', 'house', P.x + 4, P.y + 1); hut.hp = Math.round(hut.maxhp / 3);
    __fx.bld('P', 'tower', P.x + 1, P.y + 5);
    const site = Bld.place('P', 'house', P.x + 6, P.y + 4, { free: true, noAutoAssign: true }); Bld._block = null;
    site.hp = 1;
    for (let i = 0; i < CFG.W * CFG.H; i++) { const x = i % CFG.W, y = (i / CFG.W) | 0; if (Math.hypot(x - P.x, y - P.y) > 12) S.map.explored[i] = 0; }
    G.updateVisibility();
    out.burning = Bld.burnPhase(site) >= 0;
    const line = t => { const m = /^[^.!?]*[.!?]/.exec(t); return m ? m[0] : t; };
    for (const id of IDS) {
      const c = Deck.card(id);
      const tgt = c.target === 'none' ? undefined : { x: P.x + 20.5, y: P.y + 18.5 };
      const res = Deck.play(id, tgt);
      out.msgs[id] = res.ok ? res.msg || null : 'REFUSED ' + res.why;
      out.rule[id] = line(c.text); out.name = out.name || {}; out.name[id] = c.name;
    }
    // a second copy of each timed card RUNS ON in its toast
    out.again = {
      harvest_festival: Deck.play('harvest_festival').msg,
      quick_hands: Deck.play('quick_hands').msg,
      watchfires: Deck.play('watchfires').msg,
      bountiful_land: Deck.play('bountiful_land').msg,
      scouts_fire: Deck.play('scouts_fire', { x: P.x + 20.5, y: P.y + 18.5 }).msg,
    };
    // Mending passes over the burning works, and a puff of smoke goes up off them
    const ms = R.cardShows.find(z => z.id === 'mending');
    out.left = !!ms && (ms.left || []).some(h => h.id === site.id);
    if (ms) {
      const g = R.cv.getContext('2d');
      for (let t = 0; t < 1.4; t += 0.1) { ms.t = t; g.save(); Deck.FX.mending.show.draw.call(Deck.FX.mending, g, ms, t / (ms.ms / 1000), 0.1, 'world'); g.restore(); }
      out.smoke = (ms.left || []).some(h => h.puffed);
    }
    R.cardShows = [];
    return out;
  });
  // (the fallback the toast falls to with no line: '<name>: <the rule's first sentence>')
  const bare = Object.keys(r.msgs).filter(k => !r.msgs[k] || /^REFUSED/.test(r.msgs[k]) || r.msgs[k] === r.rule[k] || r.msgs[k] === r.name[k] + ': ' + r.rule[k]);
  ck('everyPlayOfTheSliceSaysWhatItDid', !bare.length,
    bare.length ? bare.map(k => k + ': ' + r.msgs[k]).join(' | ') : Object.keys(r.msgs).length + ' cards, each its own line');
  ck('scoutsFireSaysItsFireBurns', r.msgs.scouts_fire === 'A signal fire burns — 9 tiles charted, watched for 3 days.' && /burns on — 3 more days/.test(r.again.scouts_fire || ''),
    `"${r.msgs.scouts_fire}"; fed again "${r.again.scouts_fire}"`);
  ck('aSecondCopyRunsOnInItsToast', Object.values(r.again).every(m => /runs on|keeps up|burn on|stays|more days/.test(m || '')),
    JSON.stringify(r.again));
  ck('mendingSaysTheWorksStillSmoulder', r.burning && /\(the works still smoulder\)/.test(r.msgs.mending || '') && r.left && r.smoke,
    `"${r.msgs.mending}"; the burning site passed over ${r.left}, its smoke up ${r.smoke}`);
}

// ---------------- 13. SCOUT'S FIRE: THE REACH ON SCREEN, THE FIND AFTER THE FOG ----------------
/* The playtest's critics: the 9-tile reach ring was 490 px wide on a 390 px
   phone, so aiming showed "only a reticle over black"; and a relic the fire
   found floated its "+75 stone" in the black before the fog rolled back
   off it. Now aiming steps the view back until the ring fits (fx.aimFit —
   DeckUI._aimFit), a cancel gives the zoom straight back and a play has the
   fire's own moment hand it back; and the find is shown as the fog's front
   passes the relic. */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE;
    __fx.fresh('fx-scout-aim'); __fx.flat();
    Screens.show('playing'); S.paused = false;
    Deck._add('scouts_fire', 4);
    DeckUI._t = 0; DeckUI.frame(1);
    const P = Bld.tcOf('P');
    R.cam.z = 1.7; R.centerOn(Bld.cx(P) + 4, Bld.cy(P) + 4);
    const vw = document.documentElement.clientWidth, z0 = R.cam.z;
    // AIMING: the whole ring on screen, and a cancel hands the zoom back
    DeckUI.startAim('scouts_fire');
    const A = DeckUI.aim;
    out.ring = A ? 2 * A.radius * TL * R.cam.z : -1;
    out.vw = vw;
    DeckUI.endAim();
    out.back = +R.cam.z.toFixed(4) === +z0.toFixed(4);
    // A PLAY: the zoom rides to the card's moment, which gives it back as it ends
    DeckUI.startAim('scouts_fire');
    const zFit = R.cam.z;
    DeckUI.endAim(true, true);
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) if (Math.hypot(x - (P.x + 14), y - (P.y + 12)) < 11) S.map.explored[MapGen.idx(x, y)] = 0;
    S.relic = { key: 'aqueduct', x: P.x + 18, y: P.y + 13, w: 2, h: 2, found: 0, amount: 0 };
    const floats = [], fl = R.float;
    R.float = function (x, y, txt) { floats.push({ x, y, txt, at: 'play' }); return fl.apply(this, arguments); };
    R.cardShows = [];
    let play;
    try { play = Deck.play('scouts_fire', { x: P.x + 14.5, y: P.y + 12.5 }); } finally { R.float = fl; }
    const sh = R.cardShows.find(z => z.id === 'scouts_fire');
    out.play = !!play && play.ok && !!sh;
    out.found = !!S.relic.found;
    out.atPlay = floats.length;
    out.zoomCarried = !!(sh && sh.zoom) && Math.abs(zFit - z0) > 0.05;
    // the show, beat by beat: the find appears once the front has passed it
    const seen = [];
    R.float = function (x, y, txt) { seen.push({ x, y, txt }); return fl.apply(this, arguments); };
    const g = R.cv.getContext('2d');
    let firstAt = -1;
    try {
      if (sh) for (let pp = 0.02; pp < 1; pp += 0.02) {
        sh.t = pp * sh.ms / 1000;
        g.save(); Deck.FX.scouts_fire.show.draw.call(Deck.FX.scouts_fire, g, sh, pp, 0.02, 'world'); g.restore();
        if (seen.length && firstAt < 0) firstAt = pp;
      }
    } finally { R.float = fl; }
    out.firstAt = +firstAt.toFixed(2);
    out.seenAt = seen.length ? [seen[0].x - (S.relic.x + 1), seen[0].y - (S.relic.y + 1)] : null;
    out.zEnd = +R.cam.z.toFixed(4); out.z0 = +z0.toFixed(4);
    R.cardShows = [];
    return out;
  });
  ck('scoutsFiresAimShowsItsWholeReach', r.ring > 0 && r.ring <= r.vw && r.back,
    `the ring ${Math.round(r.ring)} px across on a ${r.vw} px screen; a cancel gives the zoom back ${r.back}`);
  ck('andAPlayHandsTheViewBackAfterItsMoment', r.play && r.zoomCarried && r.zEnd === r.z0, `zoom ${r.z0} → aimed → ${r.zEnd} once the fire has burned up`);
  ck('aRelicTheFireFindsIsShownOnlyAfterTheFog', r.play && r.found && r.atPlay === 0 && r.firstAt > 0.05 && r.seenAt && Math.abs(r.seenAt[0]) < 1 && Math.abs(r.seenAt[1]) < 1.2,
    `found ${r.found}; ${r.atPlay} floats at the play; the find shown at p ${r.firstAt}, at the relic ${JSON.stringify(r.seenAt)}`);
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-FX CHECKS PASS');
