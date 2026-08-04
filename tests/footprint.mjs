/* FOOTPRINT CONTRACT — the primary works stand on 2×2.

   Barracks, Archery Range, Horse Stable, Siege Workshop, Sappers' Camp,
   Trading Post, War Camp and Dock each claim two tiles on a side. The worker
   plots (farm, lumber, quarry, lodge, gold mine), houses and the whole
   fortification set (wall, gate, tower) stay 1×1; the hall stays 2×2 and the
   wonder 3×3.

   WHY IT IS DELICATE: a footprint is not a number in a config file, it is an
   assumption threaded through placement, collision, pathing, tap hit-testing,
   the rival's town layout and every save ever written. The rules pinned here
   are the ones that were being asked of ONE TILE while every building but the
   hall happened to be one tile big:

     1. Sizes are declared in CFG and derived everywhere — never hard-coded.
     2. A standing building keeps the footprint it was RAISED on (b.sz), so
        growing a key can never make an existing town overlap itself.
     3. Placement validates the WHOLE footprint: buildable ground, the gold
        seam clamp, and the dock's open water + walkable shore.
     4. Collision and tap hit-testing cover every tile of the plot.
     5. The rival's plot clamps are asked of the whole footprint — above all
        the reserved wall ring, which a 2×2 could otherwise straddle.
     6. Old saves load with no overlaps.

   node tests/footprint.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + root + '/index.html');
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const BIG = ['barracks', 'range', 'stable', 'siege', 'sapper', 'trade', 'warcamp', 'dock'];
  const SMALL = ['farm', 'lumber', 'quarry', 'lodge', 'mine', 'house', 'wall', 'gate', 'tower'];

  // ---- 1. the declaration ----
  {
    ck('everyPrimaryWorkIsTwoBigger', BIG.every(k => Bld.size(k) === 2),
      BIG.filter(k => Bld.size(k) !== 2).join(',') || 'all eight are 2×2');
    ck('theWorkerPlotsAndFortsStayOne', SMALL.every(k => Bld.size(k) === 1),
      SMALL.filter(k => Bld.size(k) !== 1).join(',') || 'plots, houses, walls, gates, towers');
    ck('theHallAndTheWonderAreUnchanged', Bld.size('tc') === 2 && Bld.size('wonder') === 3,
      'tc ' + Bld.size('tc') + ', wonder ' + Bld.size('wonder'));
    // …and it is DERIVED, never hand-listed: the def is the single source
    ck('theSizeComesFromTheDef',
      BIG.every(k => CFG.BUILDINGS[k].size === 2) && CFG.BUILDINGS.house.size === undefined,
      'CFG is the declaration; Bld.size only reads it');
  }

  // ---- 2. a building keeps the ground it was raised on ----
  {
    G.newGame('fp-a', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    const spot = MapGen.findNear(tc.x + 4, tc.y + 4, 8, (x, y) =>
      [0, 1].every(dy => [0, 1].every(dx => Bld.tileFree(x + dx, y + dy) && !Bld.at(x + dx, y + dy))));
    const br = Bld.place('P', 'barracks', spot.x, spot.y, { instant: true });
    ck('aNewWorkStampsItsFootprint', !!br && br.sz === 2, br ? 'sz=' + br.sz : 'not placed');
    ck('andTheFootprintRidesInTheSave',
      JSON.parse(G.saveJSON()).buildings.some(o => o.id === br.id && o.sz === 2), '');
    /* THE GRANDFATHER RULE. A save written when these works were 1×1 has
       neighbours packed hard against them; if they all claimed a second row
       and column on load they would swallow each other. */
    const j = JSON.parse(G.saveJSON());
    for (const o of j.buildings) delete o.sz;                 // as a pre-migration save looks
    G.loadJSON(JSON.stringify(j));
    const old = Bld.get(br.id);
    ck('anOldSaveIsGrandfatheredNotMigrated', !!old && old.sz === 1,
      old ? 'sz=' + old.sz + ' — the size it was really built at' : 'lost');
    ck('theHallStillLoadsAtTwo', Bld.tcOf('P').sz === 2, 'LEGACY_SIZE knows the hall was always 2×2');
    // and nothing overlaps after that load
    const seen = {}; let overlap = 0;
    for (const bb of S.buildings) {
      const s = Bld.size(bb);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const k = (bb.x + dx) + ',' + (bb.y + dy);
        if (seen[k] != null && seen[k] !== bb.id) overlap++;
        seen[k] = bb.id;
      }
    }
    ck('andNoTwoBuildingsShareATile', overlap === 0, overlap + ' overlapping tiles after a legacy load');
  }

  // ---- 3. placement validates the whole plot ----
  {
    G.newGame('fp-b', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    const spot = MapGen.findNear(tc.x + 3, tc.y + 3, 9, (x, y) =>
      [0, 1].every(dy => [0, 1].every(dx => Bld.tileFree(x + dx, y + dy) && !Bld.at(x + dx, y + dy))));
    // block ONE tile of the plot — the far corner, the one an anchor-only check misses
    const keep = S.map.terrain[MapGen.idx(spot.x + 1, spot.y + 1)];
    S.map.terrain[MapGen.idx(spot.x + 1, spot.y + 1)] = T.WATER; Bld._block = null;
    ck('oneBadTileRefusesTheWholePlot', !Bld.canPlace('P', 'barracks', spot.x, spot.y).ok,
      'the far corner is water — an anchor-only check would have allowed it');
    S.map.terrain[MapGen.idx(spot.x + 1, spot.y + 1)] = keep; Bld._block = null;
    ck('andTheGoodPlotIsAllowed', Bld.canPlace('P', 'barracks', spot.x, spot.y).ok === true, '');
    // a 2×2 may not pave over a gold seam it merely OVERLAPS
    S.map.terrain[MapGen.idx(spot.x + 1, spot.y)] = T.GOLDORE; Bld._block = null;
    const seam = Bld.canPlace('P', 'barracks', spot.x, spot.y);
    ck('norMayItBuryASeamItOnlyOverlaps', !seam.ok && /gold seam/i.test(seam.why || ''),
      seam.why || 'allowed');
    S.map.terrain[MapGen.idx(spot.x + 1, spot.y)] = keep; Bld._block = null;
  }

  // ---- 4. collision and the tap both cover every tile ----
  {
    const tc = Bld.tcOf('P');
    const spot = MapGen.findNear(tc.x + 3, tc.y - 4, 9, (x, y) =>
      [0, 1].every(dy => [0, 1].every(dx => Bld.tileFree(x + dx, y + dy) && !Bld.at(x + dx, y + dy))));
    const br = Bld.place('P', 'barracks', spot.x, spot.y, { instant: true });
    let hit = 0, solid = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      if (Bld.at(br.x + dx, br.y + dy) === br) hit++;             // hit-testing / Bld.at
      if (!Path.passable(br.x + dx, br.y + dy, 'P')) solid++;      // collision
    }
    ck('everyTileOfThePlotAnswersToTheBuilding', hit === 4, hit + '/4 tiles');
    ck('andEveryTileIsSolidGround', solid === 4, solid + '/4 tiles block movement');
    ck('theFootprintCentreIsOffTheAnchor',
      Bld.cx(br) === br.x + 1 && Bld.cy(br) === br.y + 1, 'cx/cy read the instance footprint');
    ck('andItsReachGrewWithIt', Bld.reach(br) === 0.5, 'reach=' + Bld.reach(br));
    // a builder/attacker adjacent to ANY tile of the plot is in contact
    ck('contactIsFromAnyFlank',
      Math.hypot((br.x + 2 + 0.5) - Bld.cx(br), (br.y + 0.5) - Bld.cy(br)) <= 1.5 + Bld.reach(br),
      'a unit at the far flank still reaches the works');
  }

  // ---- 5. the rival plots on the whole footprint ----
  {
    G.newGame('fp-c', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.ai.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const atc = Bld.tcOf('A');
    let offered = 0, straddled = 0, unbuildable = 0;
    const line = AI.wallCenter(), R = AI.WALL_R;
    for (const k of ['barracks', 'range', 'stable', 'trade']) for (let i = 0; i < 10; i++) {
      const s = AI.plot(k);
      if (!s) continue;
      offered++;
      // (a) every tile of the offer must be genuinely buildable
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        if (!Bld.tileFree(s.x + dx, s.y + dy)) unbuildable++;
      // (b) NOT ONE TILE may sit on the reserved wall ring (tests/wall-line.mjs
      //     says a building may never be part of the line; a 2×2 makes that a
      //     four-tile question)
      if (line) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        if (Math.max(Math.abs(s.x + dx - line.cx), Math.abs(s.y + dy - line.cy)) === R) straddled++;
    }
    ck('theChiefOffersRealPlots', offered > 0 && unbuildable === 0,
      offered + ' offers, ' + unbuildable + ' unbuildable tiles');
    ck('andNoPlotStraddlesTheWallRing', straddled === 0,
      straddled + ' tiles on the reserved ring — the anchor may be clear while a corner is not');
  }

  // ---- 6. and the rival still lays out a town it can walk around ----
  {
    /* drive the WHOLE loop, not just the calendar: every site rises under a
       real builder's hammer, so a dayTick-only sim finishes nothing and the
       town reads as empty for reasons that have nothing to do with footprints */
    G.newGame('fp-d', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = false;
    for (let d = 0; d < 120; d++) {
      G.dayTick();
      for (let i = 0; i < 20; i++) { Bld.update(0.05); Units.update(0.25); Combat.update(0.25); }
    }
    const mine = Bld.list('A').filter(b => Bld.done(b));
    let overlap = 0; const seen = {};
    for (const bb of S.buildings) {
      const s = Bld.size(bb);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const k = (bb.x + dx) + ',' + (bb.y + dy);
        if (seen[k] != null && seen[k] !== bb.id) overlap++;
        seen[k] = bb.id;
      }
    }
    ck('aLivePlayedTownNeverOverlaps', overlap === 0, overlap + ' overlapping tiles at day 120');
    ck('andTheChiefStillBuilds', mine.length >= 4, mine.length + ' buildings standing');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FOOTPRINT CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
