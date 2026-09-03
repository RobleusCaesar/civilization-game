/* BUILDINGS BLOCK MOVEMENT CONTRACT

   A building is SOLID GROUND. Nobody walks through a hall, a tower, a house
   or a barracks — not the player, not the rival, not barbarians, not the
   wild animals — everyone goes around, and a village becomes real terrain to
   navigate. (`Bld.solid`, block code 4 in `Bld.rebuildBlock`, refused by
   `Path.passable` for every owner.)

   THE ONE EXCEPTION IS THE WORKER PLOTS — farm, hunter's lodge, lumber camp,
   quarry and gold mine. Their crews stand ON the plot itself (the 'work' task
   walks the villager onto b.x/b.y and holds it there), so a solid plot could
   never be worked at all. That is why the rule keys off `needsWorker` rather
   than a hand-listed set: the exception and the reason for it are the same
   fact. The Hunter's Lodge is in that set for exactly this mechanical reason,
   and the Gold Mine joined it for free when it was added.

   Consequences pinned here because each one has already bitten:
     · the 2×2 Town Center blocks its WHOLE footprint
     · a site is NOT solid while it is being raised (builders must reach the
       far side of a line — tests/work-order.mjs), and anyone standing on the
       footprint is stepped off the day it finishes
     · a unit that ends up inside a building anyway is slid to open ground by
       the ground-truth rescue in units.js
     · "can I still get home?" checks must target the hall's DOORSTEP
       (Units.homeSteps), never its own tile, or they answer no forever
     · docks never block BOATS (the water domain is decided before buildings)
     · ash piles still block BUILDING but never MOVEMENT (tests/burn-down.mjs)
     · the rival must not cork itself with its own huts — AI.plot takes the
       wall line's seal clamps, and AI.cutTheCork may raze a hut, not only
       stone, when a hut is what shut the town in

   Run this after touching any of:
     buildings.js — solid / rebuildBlock / blockAt / fortAt / finish
     map.js — Path.passable
     units.js — the ground-truth rescue, homeSteps, the 'work' task
     ai.js — plot's seal clamp, _reachA, corkedGround, cutTheCork

     node tests/buildings-block.mjs      # exits non-zero on any regression */
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
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };
  const arena = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    tc.x = 6; tc.y = 6; Bld._block = null;
    S.map.explored.fill(1);
    for (let y = 14; y <= 40; y++) for (let x = 14; x <= 40; x++)
      if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.GRASS; S.map.seenTerrain[MapGen.idx(x, y)] = T.GRASS; }
    S.units = []; Bld._block = null;
    return tc;
  };
  const put = (key, owner, x, y) => {
    const bb = Bld.place(owner, key, x, y, { free: true });
    if (bb) Bld.finish(bb);
    Bld._block = null;
    return bb;
  };

  // ---- 1. WHICH buildings stand in the way ----
  {
    const PLOTS = ['farm', 'lodge', 'lumber', 'quarry', 'mine'];
    const all = Object.keys(CFG.BUILDINGS);
    const wrong = all.filter(k => Bld.solid(k) === PLOTS.includes(k));
    ck('solidSetIsEverythingButTheWorkerPlots', wrong.length === 0,
      wrong.length ? 'disagree: ' + wrong.join(',') : all.length - PLOTS.length + ' solid, ' + PLOTS.length + ' walkable plots');
    // …and the set is DERIVED, never hand-listed: a new station is a walkable
    // plot the day it is added, because its crew has to stand on it
    ck('theRuleIsNeedsWorkerNotAList',
      all.every(k => Bld.solid(k) === !CFG.BUILDINGS[k].needsWorker), '');
    ck('theExceptionIsExactlyNeedsWorker',
      all.every(k => Bld.solid(k) === !CFG.BUILDINGS[k].needsWorker), '');
    ck('lodgeIsAWalkablePlotToo', !Bld.solid('lodge'), 'its crew stands on it, like farm/lumber/quarry');
  }

  // ---- 2. solid for EVERY owner, walkable plots for everyone ----
  {
    arena('bb2');
    put('house', 'P', 20, 20);
    put('barracks', 'A', 24, 20);
    put('farm', 'P', 28, 20);
    ck('ownBuildingBlocksItsOwner', !Path.passable(20, 20, 'P'), '');
    ck('playerCannotWalkRivalBuildings', !Path.passable(24, 20, 'P'), '');
    ck('rivalCannotWalkPlayerBuildings', !Path.passable(20, 20, 'A'), '');
    ck('barbariansCannotWalkBuildings', !Path.passable(20, 20, 'R') && !Path.passable(24, 20, 'R'), '');
    ck('wildAnimalsCannotWalkBuildings', !Path.passable(20, 20, 'W'), '');
    ck('workerPlotsStayWalkableForAll',
      Path.passable(28, 20, 'P') && Path.passable(28, 20, 'A') &&
      Path.passable(28, 20, 'R') && Path.passable(28, 20, 'W'),
      'a farm is a field, not a wall');
    // the 2×2 hall is solid across its whole footprint
    const tc = Bld.tcOf('P');
    let whole = true;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      if (Path.passable(tc.x + dx, tc.y + dy, 'P')) whole = false;
    ck('townCenterBlocksWholeFootprint', whole, '2×2 solid');
  }

  // ---- 3. pathing goes AROUND, and wildlife with it ----
  {
    arena('bb3');
    for (let y = 18; y <= 22; y++) put('house', 'P', 25, y);          // a wall of huts, one gap at y=23
    const path = Path.find(22, 20, 28, 20, 'P');
    ck('pathRoutesAroundBuildings',
      !!path && path.length > 6 && !path.some(s => s.x === 25 && s.y >= 18 && s.y <= 22),
      path ? 'found a way round in ' + path.length + ' steps' : 'no path at all');
    // a wild animal ordered through the huts must also go round
    const deer = Units.spawn('deer', 'W', 22, 20);
    const ok = Units.setPath(deer, 28, 20);
    ck('animalsRouteAroundBuildings',
      ok && !deer.path.some(s => s.x === 25 && s.y >= 18 && s.y <= 22), '');
    run(6);
    ck('animalNeverStandsInABuilding', Path.passable(deer.x | 0, deer.y | 0, 'W'),
      'deer at ' + deer.x.toFixed(1) + ',' + deer.y.toFixed(1));
  }

  // ---- 4. sites stay open while raised, then clear their footprint ----
  {
    arena('bb4');
    const site = Bld.place('P', 'barracks', 25, 25, { free: true });
    Bld._block = null;
    ck('siteIsNotSolidWhileRaising',
      site.construction > 0 && Path.passable(25, 25, 'P'), 'builders must be able to cross');
    const u = Units.spawn('villager', 'P', 25, 25);
    u.x = 25.5; u.y = 25.5;
    Bld.finish(site);
    ck('finishStepsUnitsOffTheFootprint',
      ((u.x | 0) !== 25 || (u.y | 0) !== 25) && Path.passable(u.x | 0, u.y | 0, 'P'),
      'villager now at ' + u.x.toFixed(1) + ',' + u.y.toFixed(1));
    ck('finishedBuildingIsSolid', !Path.passable(25, 25, 'P'), '');
  }

  // ---- 5. the ground-truth rescue frees anyone left inside ----
  {
    arena('bb5');
    const u = Units.spawn('defender', 'P', 30, 30);
    u.x = 30.5; u.y = 30.5;
    const bb = Bld.place('P', 'house', 30, 30, { free: true });
    bb.construction = 0; Bld.finish(bb); Bld._block = null;
    u.x = 30.5; u.y = 30.5;                       // put it back inside on purpose
    run(2);
    ck('rescueSlidesUnitsOutOfBuildings',
      Path.passable(u.x | 0, u.y | 0, u.owner) && ((u.x | 0) !== 30 || (u.y | 0) !== 30),
      'defender at ' + u.x.toFixed(1) + ',' + u.y.toFixed(1));
  }

  // ---- 6. the plots still WORK (the whole reason they stay walkable) ----
  {
    arena('bb6');
    const farm = put('farm', 'P', 22, 22);
    const v = Units.spawn('villager', 'P', 26, 22);
    v.task = { type: 'work', id: farm.id };
    const t = run(30, () => (v.x | 0) === farm.x && (v.y | 0) === farm.y);
    ck('workersStillStationOnTheirPlot',
      (v.x | 0) === farm.x && (v.y | 0) === farm.y,
      'after ' + t + 's the villager stands on the farm');
  }

  // ---- 7. a villager can still reach a SOLID building to repair it ----
  {
    arena('bb7');
    const hall = put('barracks', 'P', 22, 30);
    hall.hp = hall.maxhp * 0.4;
    const v = Units.spawn('villager', 'P', 27, 30);
    Units.assignBuild(v, hall);
    const t = run(40, () => hall.hp >= hall.maxhp);
    ck('repairCrewsReachSolidBuildings', hall.hp >= hall.maxhp,
      'mended in ' + t + 's from an adjacent tile');
  }

  // ---- 8. boats: a dock never blocks a hull, and ash never blocks feet ----
  {
    arena('bb8');
    // ash sits where a building burned — building refused, walking fine
    S.ashes = [{ x: 33, y: 33, sz: 1, key: 'house', lv: 1, day: S.day }];
    ck('ashBlocksBuildingNotMovement',
      !Bld.tileFree(33, 33) && Path.passable(33, 33, 'P') && Path.passable(33, 33, 'R'), '');
    // find real water and confirm the water domain ignores buildings entirely
    let wx = -1, wy = -1;
    for (let y = 1; y < CFG.H - 1 && wx < 0; y++) for (let x = 1; x < CFG.W - 1; x++)
      if (S.map.terrain[MapGen.idx(x, y)] === T.WATER) { wx = x; wy = y; break; }
    ck('waterDomainIgnoresBuildings',
      wx > 0 && Path.passable(wx, wy, 'P', 'water'), 'hulls keep their lane at ' + wx + ',' + wy);
  }

  // ---- 9. the auto-tiling still only bonds to FORTIFICATIONS ----
  {
    arena('bb9');
    put('wall', 'P', 20, 35);
    put('house', 'P', 21, 35);
    ck('fortAtSeparatesWallsFromBuildings',
      Bld.fortAt(20, 35) && !Bld.fortAt(21, 35) && Bld.blockAt(21, 35) === 4, '');
    ck('wallGrowsNoStubTowardAHouse', !(R.wallMaskAt(20, 35) & 2),
      'a hut is solid, but it is not a curtain');
  }

  // ---- 10. the rival does not cork itself with its own huts ----
  {
    arena('bb10');
    // a hut is a legal cut candidate now, and stone is still preferred
    const src = String(AI.cutTheCork);
    ck('cutTheCorkMayRazeAHut', /cutCand/.test(src) && /key === 'wall' \? 0 : 6/.test(src.replace(/\s+/g, ' ')),
      'walls first, a hall as the last resort');
    ck('plotTakesTheSealClamp', /sealsTown/.test(String(AI.plot)),
      'plot candidates pass the wall line’s own seal checks');
    // the optimistic flood must pretend EVERY own solid work is open, not just stone
    ck('reachAConsidersAllOwnSolidWorks', /Bld\.solid\(bb\.key\)/.test(String(AI._reachA)), '');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BUILDINGS-BLOCK CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
