/* WORKED-GROUND CONTRACT — the economic spine.

   A resource station may only be raised on ground its own resource was taken
   out of: a lumber camp on a stand you felled, a quarry on rock you broke, a
   farm on soil you picked bare, a Hunter's Lodge on a killing ground, a Gold
   Mine on a seam. Nowhere else, and pointedly never on ordinary grass.

   WHY: without it a village manufactures resources from nothing. Ten lumber
   camps on an empty meadow out-produce any forest, so wood, stone and bread
   stop being things on the map and become things you buy with wood, stone and
   bread. With it every station is a claim on a real, finite piece of ground
   that had to be found, worked out by hand and held — which is what makes a
   scarce map bite, sends the village out to explore, and forces it to garrison
   what it works.

   The rules:
     GROUND      Bld.stationGround gates canPlace. Each station names the spent
                 terrain it belongs on (`onWorked`) or, for the lodge, the mark
                 (`onHunted`) — and its own refusal, in its own voice.
     DENSITY     Does not matter. A tile is either spent or it is not.
     NO SHORTCUT A sapper's clear leaves GRASS, not stumps: the resource has to
                 actually be taken.
     FAR IS FINE A station on its proper ground places freely like a Gold Mine
                 (the nearest timber may be twelve tiles out) and is flagged an
                 OUTPOST, so it anchors nothing further.
     BOTH SIDES  Owner-agnostic, enforced in canPlace, which the chief's own
                 plotting goes through. The rival hand-gathers to make its own
                 ground (AI.workTheLand) and takes a guard along when the field
                 is hot.
     A FAIR SEAT Every start is guaranteed CFG.START_RESOURCE.min workable
                 tiles of each kind within `r`, plus game to hunt — three camps
                 still produce meaningfully, so a lean start is hard, not dead.

   Run this after touching any of:
     buildings.js — stationGround / needsWorkedGround / canPlace / _isOutpostSite
     config.js — BUILDINGS[*].onWorked / onHunted / whyGround, START_RESOURCE
     units.js — the gather task's depletion + owner crediting, seedGameNear,
                the wild-death branch (G.noteHunt)
     game.js — noteHunt / huntedAt, the map.hunted save field
     ai.js — workTheLand / WORK_R / WORK_FLEE, plot's station clamp, openingBook
     map.js — the (c) start-resource guarantee in generate

     node tests/worked-ground.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const STATIONS = ['lumber', 'quarry', 'farm', 'lodge'];

  // ---- 1. grass is not a resource ----
  {
    G.newGame('wg-a', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    const g = MapGen.findNear(tc.x + 3, tc.y + 3, 8,
      (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y));
    const whys = {};
    for (const k of STATIONS) { const c = Bld.canPlace('P', k, g.x, g.y); whys[k] = c.ok ? null : c.why; }
    ck('noStationStandsOnGrass', STATIONS.every(k => whys[k]),
      STATIONS.filter(k => !whys[k]).join(',') || 'all four refused');
    ck('andEachRefusesInItsOwnWords',
      new Set(STATIONS.map(k => whys[k])).size === STATIONS.length,
      'one message per resource, never a shared "bad ground"');
    ck('theRefusalsSayWhatToDo',
      STATIONS.every(k => /fell|felled|broken|picked bare|harvested|killing ground/i.test(whys[k])),
      'a joke that does not teach the rule is a bad error');
    // …and a house is untouched by any of this
    ck('anOrdinaryBuildingIsUnaffected', Bld.canPlace('P', 'house', g.x, g.y).ok === true, '');
  }

  // ---- 2. working a tile out MAKES its station's ground ----
  {
    const tc = Bld.tcOf('P');
    // a stand the town can actually walk to — the far corner of a large board
    // may be across water, and an unreachable tree tells us nothing
    const ft = MapGen.findNear(tc.x, tc.y, 20,
      (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.FOREST && !Bld.at(x, y));
    S.map.resAmount[MapGen.idx(ft.x, ft.y)] = 3;      // nearly spent
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    const wood0 = S.res.wood;
    Units.assignGather(v, ft.x, ft.y);
    for (let i = 0; i < 4000 && S.map.terrain[MapGen.idx(ft.x, ft.y)] === T.FOREST; i++) Units.update(0.1);
    ck('fellingLeavesStumps', S.map.terrain[MapGen.idx(ft.x, ft.y)] === T.STUMPS, '');
    ck('andTheWoodCameHome', S.res.wood > wood0, '');
    ck('aCampMayStandOnIt', Bld.canPlace('P', 'lumber', ft.x, ft.y).ok === true, '');
    ck('butOnlyTHATCamp',
      !Bld.canPlace('P', 'quarry', ft.x, ft.y).ok && !Bld.canPlace('P', 'farm', ft.x, ft.y).ok,
      'stumps are a woodcutter’s ground, nobody else’s');
    ck('densityDoesNotMatter',
      S.map.resAmount[MapGen.idx(ft.x, ft.y)] === 0 && Bld.canPlace('P', 'lumber', ft.x, ft.y).ok,
      'spent is spent — what the tile held is not the question');
    // A SAPPER'S CLEAR IS NO SHORTCUT: it leaves grass, not stumps
    const ct = MapGen.findNear(tc.x, tc.y, 20,
      (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.FOREST && !Bld.at(x, y) &&
        !(x === ft.x && y === ft.y));
    if (ct) {
      Terraform.clear(ct.x, ct.y);
      ck('clearingIsNoShortcut',
        S.map.terrain[MapGen.idx(ct.x, ct.y)] === T.GRASS &&
        !Bld.canPlace('P', 'lumber', ct.x, ct.y).ok,
        'the resource has to actually be TAKEN, not bulldozed');
    }
  }

  // ---- 3. the lodge stands where game has fallen ----
  {
    G.newGame('wg-b', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    const k = MapGen.findNear(tc.x + 4, tc.y, 8,
      (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y));
    ck('noLodgeWithoutAKill', !Bld.canPlace('P', 'lodge', k.x, k.y).ok, '');
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    const deer = Units.spawn('deer', 'W', k.x, k.y);
    deer.x = k.x + 0.5; deer.y = k.y + 0.5;
    Units.damage(deer, 9999, v.id);
    ck('aKillMarksTheGround', G.huntedAt(k.x, k.y) === true, '');
    ck('andALodgeMayStandOnIt', Bld.canPlace('P', 'lodge', k.x, k.y).ok === true, '');
    ck('butNotAFarm', !Bld.canPlace('P', 'farm', k.x, k.y).ok, 'a killing ground is not a field');
    // a wolf taking a deer counts too — a place where animals die is a hunting
    // ground whoever made it so, which keeps the rule symmetric for the chief
    const k2 = MapGen.findNear(tc.x - 4, tc.y, 8,
      (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y) && !G.huntedAt(x, y));
    const prey = Units.spawn('cow', 'W', k2.x, k2.y);
    prey.x = k2.x + 0.5; prey.y = k2.y + 0.5;
    const wolf = Units.spawn('wolf', 'W', k2.x + 1, k2.y);
    Units.damage(prey, 9999, wolf.id);
    ck('aWolfsKillCountsToo', G.huntedAt(k2.x, k2.y) === true,
      'the chief never hunts deer — without this the lodge would be the player’s alone');
    // the marks ride in the save
    const j = JSON.parse(G.saveJSON());
    ck('theGroundIsRemembered', !!j.map.hunted && Object.keys(j.map.hunted).length > 0, '');
    delete j.map.hunted;
    G.loadJSON(JSON.stringify(j));
    ck('andAnOlderSaveJustStartsEmpty', !!S.map.hunted && !G.huntedAt(k.x, k.y), '');
  }

  // ---- 4. far ground is a claim, not a second town ----
  {
    G.newGame('wg-c', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    // spent soil well beyond the build anchor's reach
    let far = null;
    for (let y = 1; y < CFG.H - 1 && !far; y++) for (let x = 1; x < CFG.W - 1; x++) {
      if (Math.hypot(x - tc.x, y - tc.y) < CFG.BUILD_RANGE + 6) continue;
      if (!Bld.tileFree(x, y) || Bld.at(x, y)) continue;
      if (S.map.terrain[MapGen.idx(x, y)] !== T.GRASS) continue;
      far = { x, y }; break;
    }
    ck('somewhereFarFromEverything',
      !!far && !Bld.canPlace('P', 'house', far.x, far.y).ok,
      'a house that far is refused — the anchor rule still stands');
    S.map.terrain[MapGen.idx(far.x, far.y)] = T.STUMPS; Bld._block = null;
    ck('butACampMayClaimIt', Bld.canPlace('P', 'lumber', far.x, far.y).ok === true,
      'you worked that stand — you may raise the camp on it');
    const camp = Bld.place('P', 'lumber', far.x, far.y, {});
    ck('andItIsAnOutpost', !!camp && camp.outpost === true,
      'a claim, not a second town: nothing anchors off it');
    ck('soNothingGrowsAroundIt',
      !Bld.canPlace('P', 'house', far.x + 1, far.y).ok,
      'the camp does not become a new home anchor');
  }

  // ---- 5. every seat is dealt a fair hand ----
  {
    const SR = CFG.START_RESOURCE;
    ck('theGuaranteeIsThree', SR.min === 3, SR.min + ' of each within ' + SR.r);
    let short = 0, boards = 0;
    for (const seed of ['wg-s1', 'wg-s2', 'wg-s3']) for (const size of ['medium', 'large']) {
      G.newGame(seed, 'moderate', size); Screens._demo = false; Screens.show('playing'); S.paused = true;
      boards++;
      for (const o of ['P', 'A']) {
        const s = Bld.tcOf(o);
        const reach = Path.reachFrom([{ x: s.x, y: s.y + Bld.size('tc') }]);
        for (const tt of [T.FOREST, T.HILLS, T.FERTILE]) {
          let n = 0;
          for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
            if (S.map.terrain[MapGen.idx(x, y)] !== tt) continue;
            if (Math.hypot(x - s.x, y - s.y) > SR.r) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
              if (MapGen.inB(x + dx, y + dy) && reach[MapGen.idx(x + dx, y + dy)]) { n++; break; }
          }
          if (n < SR.min) short++;
        }
        if (!S.units.some(u => u.owner === 'W' && Units.isPassive(u) &&
            Math.hypot(u.x - s.x, u.y - s.y) <= 14)) short++;
      }
    }
    ck('everySeatCanWorkEveryResource', short === 0,
      short + ' shortfalls across ' + boards + ' boards — a seat that cannot fell a tree cannot ever raise a camp');
  }

  // ---- 6. the chief plays by the same rule, and works the land to do it ----
  {
    G.newGame('wg-d', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const atc = Bld.tcOf('A');
    const g = MapGen.findNear(atc.x + 3, atc.y + 3, 8,
      (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y));
    ck('theChiefIsRefusedGrassToo', !Bld.canPlace('A', 'lumber', g.x, g.y).ok,
      'enforced in canPlace, which its own plotting goes through');
    // …and with NOTHING worked yet it plots nothing at all, rather than falling
    // through to its own last-ditch spill (which drops every other clamp)
    let spill = 0;
    for (const k of STATIONS) for (let i = 0; i < 6; i++) if (AI.plot(k)) spill++;
    ck('withNothingWorkedItPlotsNothing', spill === 0,
      spill + ' sites offered on virgin ground — a site canPlace will refuse burns the build turn');
    // give it real worked ground and it finds it — and ONLY it
    const made = {};
    for (const k of STATIONS) {
      const t = MapGen.findNear(atc.x, atc.y, 9, (x, y) =>
        S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y) && !G.huntedAt(x, y) &&
        Object.values(made).every(m => m.x !== x || m.y !== y));
      made[k] = t;
      const d = CFG.BUILDINGS[k];
      if (d.onWorked != null) S.map.terrain[MapGen.idx(t.x, t.y)] = d.onWorked;
      else G.noteHunt(t.x, t.y);
    }
    Bld._block = null;
    let onWrong = 0, offered = 0, found = 0;
    for (const k of STATIONS) for (let i = 0; i < 12; i++) {
      const s = AI.plot(k);
      if (!s) continue;
      offered++;
      if (!Bld.stationGround(k, s.x, s.y).ok) onWrong++;
      if (s.x === made[k].x && s.y === made[k].y) found++;
    }
    ck('andItNeverPlotsOntoTheWrongGround', offered > 0 && onWrong === 0,
      offered + ' sites offered, ' + onWrong + ' on ground that was never worked');
    ck('itFindsTheGroundItsHandsMade', found > 0,
      'the one worked tile of each kind is the only site there is — the scan has to reach it');
    // it sends its spare hands out to MAKE that ground
    for (let i = 0; i < 6; i++) {
      const sp = MapGen.findNear(atc.x + 2, atc.y + 2, 8,
        (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
      Units.spawn('villager', 'A', sp.x, sp.y);
    }
    for (const u of S.units) if (u.owner === 'A' && Units.isVillager(u)) u.task = null;
    ck('itWorksTheLandByHand', AI.workTheLand({}) === true, '');
    const out2 = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'gather');
    ck('andThoseAreRealGatherOrders', out2.length > 0, out2.length + ' hands out');
    ck('withinAWalkOfTheFire',
      out2.every(u => Math.hypot(u.task.x - Bld.cx(atc), u.task.y - Bld.cy(atc)) <= AI.WORK_R * 2.4 + 1),
      'scanning the whole board sent woodcutters into barbarian country');
    ck('andSomeHandsStayHome',
      S.units.filter(u => u.owner === 'A' && Units.isVillager(u) && !u.task).length >= AI.WORK_SPARE,
      'never strip the town of hammers');
    // the harvest goes to the RIVAL's stores, not the player's
    const aw = S.ai.res.wood, pw2 = S.res.wood;
    const gatherer = out2.find(u => CFG.GATHER[S.map.terrain[MapGen.idx(u.task.x, u.task.y)]]);
    if (gatherer) {
      gatherer.x = (gatherer.task.sx == null ? gatherer.task.x : gatherer.task.sx) + 0.5;
      gatherer.y = (gatherer.task.sy == null ? gatherer.task.y : gatherer.task.sy) + 0.5;
      for (let i = 0; i < 60; i++) Units.update(0.1);
      const res2 = CFG.GATHER[S.map.terrain[MapGen.idx(gatherer.task.x, gatherer.task.y)]];
      ck('andTheHarvestGoesToItsOwnStores',
        S.res.wood === pw2 && (!res2 || S.ai.res[res2.res] >= aw || S.ai.res[res2.res] > 0),
        'the gather task used to credit S.res flat — the PLAYER’s pile');
    }
  }

  // ---- 7. under attack, the work party takes a guard with it ----
  {
    const atc = Bld.tcOf('A');
    for (const u of S.units) if (u.owner === 'A' && Units.isVillager(u)) u.task = null;
    // no soldiers to spare: the work stands down rather than feeding the wilds
    for (const u of S.units.slice()) if (u.owner === 'A' && Units.isMilitary(u)) S.units.splice(S.units.indexOf(u), 1);
    ck('noSpearNoWorkParty', AI.workTheLand({ underThreat: true }) === false,
      'sending hands out unescorted while raiders are about is how a workforce dies');
    // …with spears, the work goes on and they walk out together
    for (let i = 0; i < 3; i++) {
      const sp = MapGen.findNear(atc.x + 2, atc.y, 6,
        (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
      Units.spawn('defender', 'A', sp.x, sp.y);
    }
    ck('butWithSpearsTheWorkGoesOn', AI.workTheLand({ underThreat: true }) === true, '');
    const parties = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'gather');
    const escorts = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
      u.task && u.task.type === 'move');
    ck('andASpearWalksWithEachParty', escorts.length >= Math.min(parties.length, 3),
      parties.length + ' parties, ' + escorts.length + ' escorts');
    ck('theEscortStandsAtTheWork',
      escorts.every(e => parties.some(w =>
        Math.hypot(e.task.x - w.task.x, e.task.y - w.task.y) <= 4)),
      'its own acquire takes whatever comes near — that is the whole job');
  }

  // ---- 8. a hostile near a work party calls it in ----
  {
    const atc = Bld.tcOf('A');
    const worker = S.units.find(u => u.owner === 'A' && u.task && u.task.type === 'gather');
    if (worker) {
      const wolf = Units.spawn('wolf', 'R', worker.task.x, worker.task.y);
      wolf.x = worker.x + 1; wolf.y = worker.y;
      wolf.hostileTo = 'ALL';
      AI.workTheLand({});
      ck('aThreatenedHandRunsForTheHall',
        !worker.task || worker.task.type === 'flee',
        worker.task ? worker.task.type : 'no task');
    }
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WORKED-GROUND CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
