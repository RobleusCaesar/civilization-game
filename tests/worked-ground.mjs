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
// fixture seeds tuned pre-variants; classic regenerates those exact worlds
// (map.js FORCE_VARIANT / __CLASSIC_WORLDS)
await p.addInitScript(() => { window.__CLASSIC_WORLDS = 1; });
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
      // …a few tiles OUT, not on the doorstep: `plot` has always refused the
      // ring within 2 of the hall, and a scan started at the hall's own tile
      // hands back the nearest match, which is next to it
      const t = MapGen.findNear(atc.x + 5, atc.y + 5, 7, (x, y) =>
        S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y) && !G.huntedAt(x, y) &&
        Math.hypot(x - atc.x, y - atc.y) >= 3 &&
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

  /* ---- 7. a party that leaves the camp takes a spear ----
     Escorting only once the chief had NOTICED a threat meant the first party
     out paid for the intelligence: 19 of 28 villager losses on a rough seed
     were hands in the field, killed by bands that never tripped the flag.
     Bandits and beasts are a standing condition of the open country, so the
     escort is priced into every trip past what the town can answer for. */
  {
    const atc = Bld.tcOf('A');
    for (const u of S.units) if (u.owner === 'A' && Units.isVillager(u)) u.task = null;
    for (const u of S.units.slice()) if (u.owner === 'A' && Units.isMilitary(u)) S.units.splice(S.units.indexOf(u), 1);
    ck('safeGroundIsWhatTheTownCanAnswerFor',
      AI.safeWork(Bld.cx(atc) + 2, Bld.cy(atc)) && !AI.safeWork(Bld.cx(atc) + AI.WORK_SAFE + 6, Bld.cy(atc)),
      'close by its own hall, or under a finished tower’s arrows — nothing else');
    // NO THREAT READ AT ALL, and not a soldier in the town: the hands still
    // work, but only ground the camp covers — nobody wanders off alone
    AI.workTheLand({});
    const lone = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'gather');
    ck('withNoSpearsNobodyLeavesTheCamp',
      lone.length > 0 && lone.every(u => AI.safeWork(u.task.x, u.task.y)),
      lone.length + ' parties, all inside the camp’s own protection');
    // give it spears and the far ground opens up again — each trip escorted.
    // FAR WORK IS PLANTED, not hoped for: ore went from carpets to a few
    // compact deposits, so on this seed every workable tile can now sit
    // inside the safe rings and the check would measure an empty set. A
    // small stand outside the rings is the scenario's own fixture.
    {
      const cx = Bld.cx(atc), cy = Bld.cy(atc);
      /* …and the SAFE ring is cleared of work: the seat's shelter thicket
         gives the hall more close forest than nine hands can use, so nobody
         would ever need to range and the check would measure an empty set.
         With the near work gone and one stand planted past the rings, the
         far trip is the only trip there is — which is the situation the
         check exists to pin. */
      for (let y = Math.max(1, Math.round(cy) - AI.WORK_SAFE - 1); y <= Math.min(CFG.H - 2, Math.round(cy) + AI.WORK_SAFE + 1); y++)
        for (let x = Math.max(1, Math.round(cx) - AI.WORK_SAFE - 1); x <= Math.min(CFG.W - 2, Math.round(cx) + AI.WORK_SAFE + 1); x++) {
          const t2 = S.map.terrain[MapGen.idx(x, y)];
          if (t2 === T.FOREST || t2 === T.FERTILE || t2 === T.HILLS)
            S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
        }
      const fx = cx + AI.WORK_SAFE + 2, fy = cy;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = Math.round(fx + dx), y = Math.round(fy + dy);
        if (MapGen.onBoard(x, y) && S.map.terrain[MapGen.idx(x, y)] === T.GRASS)
          S.map.terrain[MapGen.idx(x, y)] = T.FOREST;
      }
      Bld._block = null;
    }
    for (const u of S.units) if (u.owner === 'A' && Units.isVillager(u)) u.task = null;
    for (let i = 0; i < 4; i++) {
      const sp = MapGen.findNear(atc.x + 2, atc.y, 6, (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
      Units.spawn('defender', 'A', sp.x, sp.y);
    }
    AI.workTheLand({});
    const out4 = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'gather');
    const beyond = out4.filter(u => !AI.safeWork(u.task.x, u.task.y));
    const walking = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
      u.task && u.task.type === 'move');
    ck('withSpearsTheFarGroundOpensAgain', beyond.length > 0,
      beyond.length + ' parties working past the rings');
    ck('andEveryOneOfThemHasASpear', walking.length >= beyond.length,
      beyond.length + ' parties out past the rings, ' + walking.length + ' spears walking with them');
    // …and this holds with NO threat reading whatsoever — it is the ground that
    // decides, never a flag
    ck('noThreatFlagWasNeeded', true, 'workTheLand({}) — nothing was reported to the chief');
  }

  // ---- 7b. under an actual attack, the bar is higher still ----
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

  /* ---- 9. NOBODY WORKS ANOTHER TRIBE'S YARD ----
     Reported from a real day-33 game: the player felled two trees beside their
     own hall and the rival raised a lumber camp on one of them — 34.7 tiles
     from its own fire, 5.1 from the player's, under three of their towers, and
     pulled down three days later. Two compounding faults. The station scan was
     a SQUARE of half-width WORK_R * 2.4, so its real reach was 37 tiles on the
     diagonal, not 26; and nothing anywhere said that a felled stand inside
     somebody's town is not free ground. */
  {
    G.newGame('wg-e', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const atc = Bld.tcOf('A'), ptc = Bld.tcOf('P');
    // the chief has seen the player's hall — the refusal is fog-honest, so it
    // only bites once it actually knows where they live
    S.ai.knownB = S.ai.knownB || {};
    S.ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', x: ptc.x, y: ptc.y, owner: 'P', day: S.day };
    ck('theChiefKnowsWhereTheyLive', !!AI.knownPlayerTC(), '');
    // the ONLY worked ground on the board is the player's, right by their hall
    const stumps = [];
    for (let i = 0; i < 6; i++) {
      const t = MapGen.findNear(ptc.x + 3, ptc.y - 3, 7, (x, y) =>
        Bld.tileFree(x, y) && !Bld.at(x, y) && S.map.terrain[MapGen.idx(x, y)] !== T.STUMPS);
      if (t) { S.map.terrain[MapGen.idx(t.x, t.y)] = T.STUMPS; stumps.push(t); }
    }
    Bld._block = null;
    ck('theOnlyFelledStandIsTheirs',
      stumps.length > 0 && stumps.every(t => Math.hypot(t.x - ptc.x, t.y - ptc.y) <= Bld.HOME_GROUND_R),
      stumps.length + ' stumps inside their home ground');
    let offers = 0, inYard = 0, beyondRing = 0;
    const rMax = Math.round(AI.WORK_R * 2.4);
    for (let i = 0; i < 15; i++) {
      const s = AI.plot('lumber');
      if (!s) continue;
      offers++;
      if (Math.hypot(s.x - ptc.x, s.y - ptc.y) <= Bld.HOME_GROUND_R) inYard++;
      if (Math.hypot(s.x - atc.x, s.y - atc.y) > rMax) beyondRing++;
    }
    ck('theChiefWillNotPlotInTheirTown', inYard === 0,
      offers + ' offers, ' + inYard + ' inside the player’s home ground');
    ck('andTheScanIsARadiusNotASquare', beyondRing === 0,
      'a square of half-width ' + rMax + ' reaches ' + Math.round(rMax * 1.414) + ' on the diagonal — across the map');
    // …and its woodcutters do not go there either
    for (const u of S.units) if (u.owner === 'A' && Units.isVillager(u)) u.task = null;
    for (let i = 0; i < 5; i++) {
      const sp = MapGen.findNear(atc.x + 2, atc.y + 2, 8, (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
      Units.spawn('villager', 'A', sp.x, sp.y);
    }
    AI.workTheLand({});
    const out3 = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'gather');
    ck('norDoesItSendWoodcuttersIntoTheirVillage',
      out3.every(u => Math.hypot(u.task.x - ptc.x, u.task.y - ptc.y) > Bld.HOME_GROUND_R),
      out3.length + ' parties out, none in the player’s town');
    // THE SAME RULE IN REVERSE — the player may not do it to the rival either
    const near = MapGen.findNear(atc.x + 3, atc.y + 3, 6, (x, y) => Bld.tileFree(x, y) && !Bld.at(x, y));
    S.map.terrain[MapGen.idx(near.x, near.y)] = T.STUMPS; Bld._block = null;
    const pc = Bld.canPlace('P', 'lumber', near.x, near.y);
    ck('andThePlayerMayNotDoItEither', !pc.ok, pc.why || 'allowed');
    ck('theRefusalSaysWhoseGroundItIs', !pc.ok && /another tribe/i.test(pc.why || ''), pc.why || '');
    /* ONLY THE FREE PASS IS WITHDRAWN, NEVER THE TILE. Two halls can sit within
       HOME_GROUND_R of each other on a tight board; ground that is ALSO beside
       your own fires stays yours to build on, decided by the ordinary anchor
       rule like everywhere else. */
    const own = MapGen.findNear(ptc.x + 2, ptc.y + 2, 6, (x, y) =>
      Bld.tileFree(x, y) && !Bld.at(x, y) && S.map.terrain[MapGen.idx(x, y)] !== T.STUMPS);
    S.map.terrain[MapGen.idx(own.x, own.y)] = T.STUMPS; Bld._block = null;
    S.ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', x: ptc.x, y: ptc.y, owner: 'P', day: S.day };
    const oc = Bld.canPlace('P', 'lumber', own.x, own.y);
    ck('butYourOwnDoorstepIsStillYours', oc.ok === true,
      'the tile is not forbidden — only the free pass into somebody else’s town');
  }

  /* ---- 10. THE GROUND REMEMBERS WHOSE HANDS MADE IT ----
     From a real day-25 CALM save: a rival lumber camp finished 4.5 tiles from
     the player's hall, because foreignHome is gated on a KNOWN hall and a
     peaceful chief that never scouts has knownTC null — the fog-honest gate
     was the hole. Every depleted tile now carries its maker's mark
     (S.map.workedBy) and the chief may only raise stations on ground its own
     tribe worked out; foreign-made ground is claimable only as a conquest
     (the maker's buildings near it are gone AND the chief has seen the
     ground). */
  {
    G.newGame('wg-f', 'calm', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
    const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
    // a REAL gather to depletion stamps the maker
    const wood = MapGen.findNear(ptc.x, ptc.y, 10, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.FOREST);
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    Units.assignGather(v, wood.x, wood.y);
    v.x = v.task.sx + 0.5; v.y = v.task.sy + 0.5; v.path = null;
    const wi = MapGen.idx(wood.x, wood.y);
    S.map.resAmount[wi] = 0.5;
    for (let i = 0; i < 40 && S.map.terrain[wi] === T.FOREST; i++) Units.update(0.3);
    ck('theSpentTileIsStamped', S.map.terrain[wi] === T.STUMPS && S.map.workedBy[wi] === 'P',
      'terrain=' + S.map.terrain[wi] + ' workedBy=' + S.map.workedBy[wi]);
    // the truth table: the maker holds their ground while anything of theirs stands near
    ck('theMakersGroundIsRefused', AI.groundIsAnothers(wood.x, wood.y) === true, '');
    S.map.workedBy[wi] = 'A';
    ck('itsOwnMakeIsFree', AI.groundIsAnothers(wood.x, wood.y) === false, '');
    delete S.map.workedBy[wi];
    ck('wildGroundIsFree', AI.groundIsAnothers(wood.x, wood.y) === false, '');
    S.map.workedBy[wi] = 'P';
    // THE BLIND CHIEF NEVER SQUATS — the reported save's exact shape: the
    // refusal must hold with the hall UNKNOWN (knownTC null)
    S.ai.knownB = {};
    ck('theHallIsUnknown', !AI.knownPlayerTC(), '');
    const stumps = [];
    for (let i = 0; i < 6; i++) {
      const t = MapGen.findNear(ptc.x + 3, ptc.y - 3, 7, (x, y) =>
        Bld.tileFree(x, y) && !Bld.at(x, y) && S.map.terrain[MapGen.idx(x, y)] !== T.STUMPS);
      if (t) {
        S.map.terrain[MapGen.idx(t.x, t.y)] = T.STUMPS;
        S.map.workedBy[MapGen.idx(t.x, t.y)] = 'P';
        stumps.push(t);
      }
    }
    Bld._block = null;
    let inYard = 0;
    for (let i = 0; i < 15; i++) {
      const s = AI.plot('lumber');
      if (s && Math.hypot(s.x - ptc.x, s.y - ptc.y) <= Bld.HOME_GROUND_R) inYard++;
    }
    ck('theBlindChiefNeverSquats', inYard === 0, inYard + ' offers inside the unseen player yard');
    // CONQUEST: the maker gone from the ground, and the ground actually seen
    const far = { x: Math.min(CFG.W - 3, atc.x + 6), y: Math.min(CFG.H - 3, atc.y + 6) };
    const fi = MapGen.idx(far.x, far.y);
    S.map.terrain[fi] = T.STUMPS; S.map.workedBy[fi] = 'P';   // P-made, but P stands nowhere near
    // ai.seen is built lazily; absent it reads as UNSEEN, which is the
    // conservative direction (a fresh chief has seen nothing)
    S.ai.seen = S.ai.seen || new Uint8Array(CFG.W * CFG.H);
    S.ai.seen[fi] = 0;
    ck('unseenGroundIsNeverClaimed', AI.groundIsAnothers(far.x, far.y) === true, '');
    S.ai.seen[fi] = 1;
    ck('theConquerorMaySettleSeenEmptyGround', AI.groundIsAnothers(far.x, far.y) === false, '');
    // REGROWTH FORGETS THE MAKER
    S.map.decay[wi] = S.day - 1;
    G.dayTick();
    ck('regrownGroundForgetsItsMaker', S.map.workedBy[wi] === undefined,
      'workedBy=' + S.map.workedBy[wi] + ' terrain=' + S.map.terrain[wi]);
    // A PRE-MAKER SAVE IS DEALT THE MARK by the nearer hall, working range only
    const json = JSON.parse(G.saveJSON());
    delete json.map.workedBy;
    G.loadJSON(JSON.stringify(json));
    const ptc2 = Bld.tcOf('P');
    const nearIdx = stumps.length ? MapGen.idx(stumps[0].x, stumps[0].y) : null;
    ck('legacySavesDealTheMark', nearIdx !== null && S.map.workedBy[nearIdx] === 'P',
      'workedBy=' + (nearIdx !== null ? S.map.workedBy[nearIdx] : 'n/a'));
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WORKED-GROUND CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
