/* THE FISHERY CONTRACT — fish are leaner than they were, and they come back.

   THE SHALLOW/DEEP SPLIT (`CFG.FISH_STOCK`). A water tile touching land is a
   SHORE SHOAL — the water a villager can line-fish and a boat can hug — and
   carries only HALF the raw stock. Open DEEP water carries three quarters.
   So rowing out is worth more than paddling at the edge, and the lean water
   is exactly the water the renderer already shades as shallows (both use the
   same "touches a non-water tile" rule — `MapGen.shallowWater`).

   THE RETURN (`CFG.FISH_RETURN_DAYS`, 120). Fish are the one resource that
   renews on a CLOCK rather than by terrain regrowth: the water never changes,
   only what swims in it. A tile fished to nothing — by boat or from the shore
   — goes on `S.map.fishBack`, and `G.dayTick` restocks it 120 days later at
   the stock its own water is worth. (Contrast ore, which never returns at
   all — tests/ore-finite.mjs.)

   Run this after touching any of:
     config.js — FISH_STOCK / FISH_RETURN_DAYS / RES_AMOUNT[T.WATER]
     map.js — the water stock pass in generation, MapGen.shallowWater
     game.js — fishStockAt / scheduleFishReturn / the fishBack block in dayTick
     units.js — the boat and shore fishing tasks

     node tests/fishery.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const idx = MapGen.idx;

  // ---- 1. the dials ----
  ck('stockSplitIsHalfAndThreeQuarters',
    CFG.FISH_STOCK.shallow === 0.5 && CFG.FISH_STOCK.deep === 0.75, '');
  ck('shoalsReturnAfter120Days', CFG.FISH_RETURN_DAYS === 120, '');

  // ---- 2. what generation actually lays down, averaged over a whole map ----
  {
    G.newGame('fish-a', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const sh = [], dp = [];
    for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
      if (S.map.terrain[idx(x, y)] !== T.WATER) continue;
      (MapGen.shallowWater(x, y) ? sh : dp).push(S.map.resAmount[idx(x, y)]);
    }
    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const raw = CFG.RES_AMOUNT[T.WATER], mid = (raw[0] + raw[1]) / 2;
    const shR = avg(sh) / mid, dpR = avg(dp) / mid;
    // a FOOD-SCARCE map already halves its waters at generation, so the split
    // is measured on top of that lean — fish are food, and a dock must not
    // quietly cancel the scarcity (see the generation pass in map.js)
    const lean = S.map.scarce === 'food' ? 0.5 : 1;
    const note = lean < 1 ? ' (food-scarce map, on top of its ×0.5)' : '';
    ck('enoughWaterToJudge', sh.length > 20 && dp.length > 20, sh.length + ' shallow / ' + dp.length + ' deep');
    ck('shallowWaterCarriesHalf', Math.abs(shR - 0.5 * lean) < 0.06,
      Math.round(shR / lean * 100) + '% of stock' + note);
    ck('deepWaterCarriesThreeQuarters', Math.abs(dpR - 0.75 * lean) < 0.06,
      Math.round(dpR / lean * 100) + '% of stock' + note);
    ck('rowingOutBeatsTheEdge', avg(dp) > avg(sh) * 1.3,
      avg(sh).toFixed(1) + ' vs ' + avg(dp).toFixed(1) + ' per tile');
  }

  // ---- 3. the shallow rule matches what the renderer shades ----
  {
    // a water tile with a land neighbour is shallow; one ringed by water is not
    let sample = null;
    for (let y = 2; y < CFG.H - 2 && !sample; y++) for (let x = 2; x < CFG.W - 2; x++) {
      if (S.map.terrain[idx(x, y)] !== T.WATER) continue;
      let land = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (S.map.terrain[idx(x + dx, y + dy)] !== T.WATER) land++;
      if (land > 0) { sample = { x, y, land }; break; }
    }
    ck('shallowMeansTouchingLand',
      !!sample && MapGen.shallowWater(sample.x, sample.y) === true,
      sample ? sample.land + ' land neighbours at ' + sample.x + ',' + sample.y : 'no shore found');
  }

  // ---- 4. fishing a tile out starts the clock — BOAT ----
  {
    G.newGame('fish-b', 'moderate', 'large'); S.paused = true;
    let deep = null;
    for (let y = 2; y < CFG.H - 2 && !deep; y++) for (let x = 2; x < CFG.W - 2; x++)
      if (S.map.terrain[idx(x, y)] === T.WATER && !MapGen.shallowWater(x, y)) { deep = { x, y }; break; }
    const i = idx(deep.x, deep.y);
    S.map.resAmount[i] = 0.0005;                       // one net-haul from empty
    const boat = Units.spawn('fishboat', 'P', deep.x, deep.y);
    Units.assignFish(boat, deep.x, deep.y);
    for (let k = 0; k < 30; k++) Units.update(0.1);
    ck('boatFishedOutStartsTheClock',
      S.map.resAmount[i] === 0 && S.map.fishBack[i] - S.day === CFG.FISH_RETURN_DAYS,
      'due in ' + (S.map.fishBack[i] - S.day) + ' days');

    // ---- 5. …and it stays empty until the day it is due ----
    for (let k = 0; k < CFG.FISH_RETURN_DAYS - 1; k++) G.dayTick();
    ck('stillEmptyTheDayBefore', S.map.resAmount[i] === 0 && S.map.fishBack[i] !== undefined, '');
    G.dayTick();
    ck('restocksOnTheDueDay',
      S.map.resAmount[i] === G.fishStockAt(deep.x, deep.y) && S.map.fishBack[i] === undefined,
      'came back with ' + S.map.resAmount[i] + ' (deep water)');
    // a returning DEEP shoal is worth more than a returning SHORE one, on
    // whatever map this is (compare two real tiles, not a hardcoded number)
    let shal = null;
    for (let y = 2; y < CFG.H - 2 && !shal; y++) for (let x = 2; x < CFG.W - 2; x++)
      if (S.map.terrain[idx(x, y)] === T.WATER && MapGen.shallowWater(x, y)) { shal = { x, y }; break; }
    ck('deepReturnBeatsShallowReturn',
      !!shal && G.fishStockAt(deep.x, deep.y) > G.fishStockAt(shal.x, shal.y),
      shal ? G.fishStockAt(shal.x, shal.y) + ' shore vs ' + G.fishStockAt(deep.x, deep.y) + ' deep' : 'no shore water');
  }

  // ---- 6. the SHORE line also starts the clock ----
  {
    G.newGame('fish-c', 'moderate', 'large'); S.paused = true;
    let shoal = null;
    for (let y = 2; y < CFG.H - 2 && !shoal; y++) for (let x = 2; x < CFG.W - 2; x++) {
      if (S.map.terrain[idx(x, y)] !== T.WATER) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const sx = x + dx, sy = y + dy;
        if (MapGen.inB(sx, sy) && Path.passable(sx, sy, 'P')) { shoal = { x, y, sx, sy }; break; }
      }
      if (shoal) break;
    }
    const i = idx(shoal.x, shoal.y);
    S.map.resAmount[i] = 0.0005;
    const v = Units.spawn('villager', 'P', shoal.sx, shoal.sy);
    v.x = shoal.sx + 0.5; v.y = shoal.sy + 0.5;
    v.task = { type: 'shorefish', x: shoal.x, y: shoal.y, sx: shoal.sx, sy: shoal.sy };
    for (let k = 0; k < 30; k++) Units.update(0.1);
    ck('shoreFishedOutStartsTheClock',
      S.map.resAmount[i] === 0 && S.map.fishBack[i] - S.day === CFG.FISH_RETURN_DAYS,
      'due in ' + (S.map.fishBack[i] - S.day) + ' days');
    const lean2 = S.map.scarce === 'food' ? 0.5 : 1;
    ck('shallowShoalReturnsLean',
      G.fishStockAt(shoal.x, shoal.y) ===
      Math.max(1, Math.round((CFG.RES_AMOUNT[T.WATER][0] + CFG.RES_AMOUNT[T.WATER][1]) / 2 * CFG.FISH_STOCK.shallow * lean2)),
      'a shore shoal comes back at ' + G.fishStockAt(shoal.x, shoal.y));
  }

  // ---- 7. a shoal that stopped being water just drops off the clock ----
  {
    G.newGame('fish-d', 'moderate', 'large'); S.paused = true;
    let w = null;
    for (let y = 2; y < CFG.H - 2 && !w; y++) for (let x = 2; x < CFG.W - 2; x++)
      if (S.map.terrain[idx(x, y)] === T.WATER) { w = { x, y }; break; }
    const i = idx(w.x, w.y);
    S.map.resAmount[i] = 0;
    G.scheduleFishReturn(i);
    S.map.terrain[i] = T.GRASS;                       // a sapper filled it in
    for (let k = 0; k < CFG.FISH_RETURN_DAYS + 1; k++) G.dayTick();
    ck('reclaimedWaterDropsOffTheClock',
      S.map.fishBack[i] === undefined && S.map.terrain[i] === T.GRASS && S.map.resAmount[i] === 0,
      'no fish in a filled channel');
  }

  // ---- 8. the clock rides in the save; legacy saves backfill ----
  {
    G.newGame('fish-e', 'moderate', 'large'); S.paused = true;
    let w = null;
    for (let y = 2; y < CFG.H - 2 && !w; y++) for (let x = 2; x < CFG.W - 2; x++)
      if (S.map.terrain[idx(x, y)] === T.WATER) { w = { x, y }; break; }
    const i = idx(w.x, w.y);
    S.map.resAmount[i] = 0;
    G.scheduleFishReturn(i);
    const due = S.map.fishBack[i], json = G.saveJSON();
    G.loadJSON(json);
    ck('clockSurvivesSaveLoad', S.map.fishBack[i] === due, 'due day ' + due + ' preserved');
    const legacy = JSON.parse(json); delete legacy.map.fishBack;
    G.loadJSON(JSON.stringify(legacy));
    ck('legacySavesBackfillTheClock',
      S.map.fishBack && typeof S.map.fishBack === 'object' && Object.keys(S.map.fishBack).length === 0, '');
  }

  // ---- 9. ONE BOAT PER TILE — a fleet you can actually see and manage ----
  {
    G.newGame('fish-f', 'moderate', 'large'); S.paused = true;
    S.units = [];
    let w = null;                                    // a patch of open water
    for (let y = 3; y < CFG.H - 3 && !w; y++) for (let x = 3; x < CFG.W - 3; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++)
        if (S.map.terrain[idx(x + dx, y + dy)] !== T.WATER) { ok = false; break; }
      if (ok) w = { x, y };
    }
    const boats = [];
    for (let i = 0; i < 6; i++) {
      const u = Units.spawn('fishboat', 'P', w.x, w.y);
      boats.push(u);
      Units.assignFish(u, w.x, w.y);                 // every one ordered to the SAME tile
    }
    const targets = boats.map(u => u.task && u.task.type === 'fish' ? u.task.x + ',' + u.task.y : 'none');
    ck('sameOrderFansTheFleetOut',
      new Set(targets).size === 6 && !targets.includes('none'),
      '6 boats, 6 different shoals');
    ck('firstBoatKeepsTheTileItWasSent', targets[0] === w.x + ',' + w.y, '');

    // a claimed tile is not free, but its own claimant may keep it
    ck('claimedWaterIsNotFree',
      !!Units.fisherAt(w.x, w.y, null) && Units.canFish(w.x, w.y) === false &&
      Units.canFish(w.x, w.y, boats[0]) === true,
      'claimed by another hull, still fine for the one working it');
    // re-issuing the same order to the same boat must not shuffle it
    Units.assignFish(boats[0], w.x, w.y);
    ck('reorderingABoatToItsOwnTileKeepsIt',
      boats[0].task.x === w.x && boats[0].task.y === w.y, '');

    // and they stay apart once the nets are actually out
    for (let k = 0; k < 400; k++) Units.update(0.1);
    const tiles = boats.map(u => (u.x | 0) + ',' + (u.y | 0));
    ck('boatsNeverStackOnceWorking', new Set(tiles).size === 6, tiles.join(' '));
    ck('andAllOfThemAreStillFishing',
      boats.every(u => u.task && u.task.type === 'fish'), '');

    // an idle hull parked on water claims it too, so nothing is sent on top
    const parked = boats[0];
    parked.task = null;
    ck('idleHullStillClaimsItsTile',
      Units.fisherAt(parked.x | 0, parked.y | 0, null) === parked, '');
  }

  /* ---- the shoal economy (operator direction: shore fish ran out too
     fast): a line-fishable shoal is one shore tile in NINE and carries a
     BERRY PATCH's stock; a food-scarce map withholds the privilege ---- */
  {
    // the berry privilege only exists on maps NOT rolled food-scarce —
    // hunt a seed whose world isn't (the first fixture seed tried rolled
    // scarce=food and correctly showed lean shoals)
    let tries = 0;
    do { G.newGame('shoal-econ' + tries, 'moderate', 'large'); tries++; }
    while (S.map.scarce === 'food' && tries < 8);
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    ck('theFixtureWorldIsNotFoodScarce', S.map.scarce !== 'food', 'scarce=' + S.map.scarce);
    const fr = CFG.RES_AMOUNT[T.FERTILE];
    let shoals = 0, shore = 0, inBand = 0, minS = 1e9, maxS = 0;
    for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
      if (S.map.terrain[MapGen.idx(x, y)] !== T.WATER) continue;
      const isShore = [[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oy]) =>
        S.map.terrain[MapGen.idx(x+ox, y+oy)] !== T.WATER);
      if (!isShore) continue;
      shore++;
      if (!MapGen.shoal(x, y)) continue;
      shoals++;
      const amt = S.map.resAmount[MapGen.idx(x, y)];
      minS = Math.min(minS, amt); maxS = Math.max(maxS, amt);
      if (amt >= fr[0] && amt <= fr[1]) inBand++;
    }
    ck('aShoalIsOneShoreTileInNine', shoals > 0 && shoals <= Math.ceil(shore / 6),
      shoals + ' shoals of ' + shore + ' shore tiles');
    ck('aShoalCarriesABerryPatch', shoals > 0 && inBand === shoals,
      'stock ' + minS + '..' + maxS + ' vs fertile ' + fr[0] + '..' + fr[1]);
    // …and it comes BACK rich (the return clock refills at the same worth)
    let sx = -1, sy = -1;
    outer2: for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++)
      if (S.map.terrain[MapGen.idx(x, y)] === T.WATER && MapGen.shoal(x, y)) { sx = x; sy = y; break outer2; }
    ck('aShoalReturnsRich', sx > 0 && G.fishStockAt(sx, sy) >= fr[0],
      'restock ' + G.fishStockAt(sx, sy));
    // the food-scarce withholding: fake the scarce flag and ask again
    const wasScarce = S.map.scarce;
    S.map.scarce = 'food';
    ck('aFoodScarceMapWithholdsThePrivilege', sx > 0 && G.fishStockAt(sx, sy) < fr[0],
      'scarce restock ' + G.fishStockAt(sx, sy) + ' — reachable fishing counts toward the scarcity');
    S.map.scarce = wasScarce;
  }

  /* ---- a dock goes where its water is (the operator's cleared-shore
     report): a forest shore refuses, a sapper's clearing opens it, and
     the far harbor places FREELY like a station on its worked ground —
     stamped an outpost, a claim that anchors nothing ---- */
  {
    G.newGame('fish-shore', 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1);
    Bld.tcOf('P').level = 2;
    const ptc = Bld.tcOf('P'), atc2 = Bld.tcOf('A');
    let sx = -1, sy = -1;
    outer: for (let y = 4; y < CFG.H - 10; y++) for (let x = 4; x < CFG.W - 10; x++) {
      if (Math.hypot(x - ptc.x, y - ptc.y) < 14 || Math.hypot(x - atc2.x, y - atc2.y) < 14) continue;
      sx = x; sy = y; break outer;
    }
    for (let y = sy; y < sy + 6; y++) for (let x = sx; x < sx + 6; x++) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    for (let x = sx - 1; x < sx + 7; x++) S.map.terrain[MapGen.idx(x, sy + 6)] = T.FOREST;
    const dx2 = sx + 2, dy2 = sy + 4;
    ck('aForestShoreRefusesTheDock', Bld.canPlace('P', 'dock', dx2, dy2).code === 'shore', '');
    Terraform.clear(dx2, sy + 6);
    const opened = Bld.canPlace('P', 'dock', dx2, dy2);
    ck('aClearedShoreOpensIt', opened.ok === true, JSON.stringify(opened));
    const far = Bld.place('P', 'dock', dx2, dy2);
    ck('theFarHarborIsAClaimNotATown', !!far && far.outpost === true,
      'places free of the anchor, anchors nothing itself');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FISHERY CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
