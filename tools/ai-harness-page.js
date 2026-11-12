/* tools/ai-harness-page.js — the in-page half of the rival-AI harness.

   Injected by tools/ai-harness.mjs (page.addScriptTag) AFTER the game has
   loaded. A classic script: the game's script-level consts (G, S, AI, Bld,
   Units, Combat, MapGen, CFG, T, Path, Terraform, Cards, R, Screens, UI,
   Lookout) are in scope bare — they are NOT on window.

   What it holds, in order:
     1. the clock + guards     no rAF interleave, a virtual performance.now,
                               a seeded Math.random, nothing that pauses
     2. ground-truth floods    components / reach, written here and never
                               borrowed from the AI's own reads
     3. the instruments        wrappers on the game's own doors (Units.spawn,
                               Bld.place, Bld.damage, Units.damage, …) and a
                               call counter on EVERY function of the AI object
     4. the daily sample       geography, growth, posture, walls, trapped,
                               sea, engineering, war, cost
     5. the scripted player    passive / turtle / aggressive, through the
                               game's own APIs, paying its own bills
     6. the run API            AIH.findSeeds / start / advance / finish

   EVERYTHING THAT CAN BE DERIVED IS DERIVED from the game's tables
   (MapGen.VARIANTS, CFG.MODES, CFG.SIZES, CFG.BUILDINGS, CFG.UNITS, the AI
   object's own keys), so new content is picked up without editing this file. */
(function () {
  'use strict';
  const realNow = performance.now.bind(performance);
  const AIH = window.AIH = { version: 1 };

  /* ------------------------------------------------------------------ */
  /* 1. THE CLOCK AND THE GUARDS                                          */
  /* ------------------------------------------------------------------ */
  AIH.simMs = 0;            // simulated milliseconds since the run began
  AIH.foreignSteps = 0;     // G.simStep calls that did NOT come from the harness (must stay 0)
  AIH._in = false;

  // the page's own loop stops here: G.frame re-requests itself by reading
  // G.frame at call time, so one more old frame may run and then the stub
  // takes over. AIH.start is only called after the node side has waited two
  // animation frames, and every G.simStep from outside the harness is counted.
  AIH.freeze = function () {
    if (AIH._frozen) return;
    AIH._frozen = true;
    AIH._frame0 = G.frame;
    G.frame = function () { /* the harness owns the clock */ };
    const step0 = G.simStep;
    G.simStep = function (sdt, dt) {
      if (!AIH._in) { AIH.foreignSteps++; return; }   // refused AND counted
      return step0.call(G, sdt, dt);
    };
    if (S) S.paused = true;   // belt and braces for the one frame still in flight
  };

  function lcg(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* ------------------------------------------------------------------ */
  /* 2. GROUND-TRUTH FLOODS                                               */
  /* ------------------------------------------------------------------ */
  const I = (x, y) => y * CFG.W + x;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // label the 4-connected components of pass(x,y). 4-connectivity is the
  // game's own: Path.canStep refuses a diagonal unless both orthogonals are open.
  function components(pass) {
    const W = CFG.W, H = CFG.H, lab = new Int32Array(W * H).fill(-1), size = [];
    const q = new Int32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i0 = y * W + x;
      if (lab[i0] !== -1 || !pass(x, y)) continue;
      const id = size.length; let n = 0, qh = 0, qt = 0;
      lab[i0] = id; q[qt++] = i0;
      while (qh < qt) {
        const i = q[qh++], cx = i % W, cy = (i / W) | 0; n++;
        for (let k = 0; k < 4; k++) {
          const nx = cx + N4[k][0], ny = cy + N4[k][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (lab[ni] !== -1 || !pass(nx, ny)) continue;
          lab[ni] = id; q[qt++] = ni;
        }
      }
      size.push(n);
    }
    return { lab, size };
  }
  function floodFrom(seeds, pass) {
    const W = CFG.W, H = CFG.H, seen = new Uint8Array(W * H), q = [];
    for (const i of seeds) { const x = i % W, y = (i / W) | 0; if (!seen[i] && pass(x, y)) { seen[i] = 1; q.push(i); } }
    let n = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], cx = i % W, cy = (i / W) | 0; n++;
      for (let k = 0; k < 4; k++) {
        const nx = cx + N4[k][0], ny = cy + N4[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (seen[ni] || !pass(nx, ny)) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    return { seen, n, list: q };
  }
  const terr = (x, y) => S.map.terrain[I(x, y)];
  const isWater = (x, y) => MapGen.onBoard(x, y) && (terr(x, y) === T.WATER || terr(x, y) === T.MOAT);
  // potential land: everything that is not water and not mountain (a wood, a
  // deposit or an orchard can be worked away; a mountain and the sea cannot)
  const isLandmass = (x, y) => MapGen.onBoard(x, y) && !isWater(x, y) && terr(x, y) !== T.MOUNTAIN;
  // walkable by TERRAIN alone: every building ignored, bridges and lowered decks counted
  function passTerrain(x, y) {
    if (!MapGen.onBoard(x, y)) return false;
    const i = I(x, y), t = S.map.terrain[i];
    if (Path.blocksLand(t)) {
      const wet = t === T.WATER || t === T.MOAT;
      return !!(wet && ((S.map.bridge && S.map.bridge[i]) || Bld.deckAt(x, y)));
    }
    return true;
  }
  const passFor = owner => (x, y) => Path.passable(x, y, owner);
  const passNoGate = (x, y) => Path.passable(x, y);                // walls AND gates solid
  // the owner's passability with ITS OWN buildings taken off the board
  function passNoOwn(owner) {
    return (x, y) => {
      if (!passTerrain(x, y)) return false;
      const blk = Bld.blockAt(x, y);
      if (!blk) return true;
      const b = Bld.at(x, y);
      return !!(b && b.owner === owner);
    };
  }
  // the owner's passability with only its own WALLS AND GATES taken off
  function passNoForts(owner) {
    return (x, y) => {
      if (Path.passable(x, y)) return true;
      if (!passTerrain(x, y)) return false;
      const b = Bld.at(x, y);
      return !!(b && b.owner === owner && (b.key === 'wall' || b.key === 'gate'));
    };
  }
  const hallCentre = tc => ({ x: tc.x + Bld.size(tc) / 2, y: tc.y + Bld.size(tc) / 2 });
  // the ring of tiles round a hall (its doorstep), whatever stands on them
  function hallRing(tc) {
    const sz = Bld.size(tc), out = [];
    for (let dy = -1; dy <= sz; dy++) for (let dx = -1; dx <= sz; dx++) {
      if (dx >= 0 && dx < sz && dy >= 0 && dy < sz) continue;
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) out.push(I(x, y));
    }
    return out;
  }
  const FAR = 14;          // "beyond the town": tiles further than this from the hall's centre
  const POCKET = 40;       // a component smaller than this is a pocket
  const CORK = 24;         // ground lost behind own works before it counts (AI.corkedGround's own bar)
  function reachesFar(fl, c, far) {
    const W = CFG.W, r2 = (far || FAR) * (far || FAR);
    for (const i of fl.list) { const dx = (i % W) + 0.5 - c.x, dy = ((i / W) | 0) + 0.5 - c.y; if (dx * dx + dy * dy > r2) return true; }
    return false;
  }

  /* ---- geography, read once at the founding (and the land route again at the end) ---- */
  function geography() {
    const W = CFG.W, H = CFG.H, g = {};
    let board = 0, water = 0, mtn = 0, forest = 0, hills = 0, fertile = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!MapGen.onBoard(x, y)) continue;
      board++;
      const t = terr(x, y);
      if (t === T.WATER || t === T.MOAT) water++; else if (t === T.MOUNTAIN) mtn++;
      else if (t === T.FOREST) forest++; else if (t === T.HILLS) hills++; else if (t === T.FERTILE) fertile++;
    }
    g.board = board; g.waterShare = +(water / board).toFixed(3); g.mountainShare = +(mtn / board).toFixed(3);
    g.forest = forest; g.hills = hills; g.fertile = fertile;
    const tcP = Bld.tcOf('P'), tcA = Bld.tcOf('A');
    if (!tcP || !tcA) return g;
    const cP = hallCentre(tcP), cA = hallCentre(tcA);
    g.hallDist = +Math.hypot(cP.x - cA.x, cP.y - cA.y).toFixed(1);
    // LAND MASS: non-water, non-mountain, buildings ignored
    const lm = components(isLandmass);
    const lmOf = tc => { for (const i of hallRing(tc)) if (lm.lab[i] >= 0) return lm.lab[i]; return lm.lab[I(tc.x, tc.y)]; };
    const lP = lmOf(tcP), lA = lmOf(tcA);
    g.sameLandmass = lP >= 0 && lP === lA;
    g.landmassP = lP >= 0 ? lm.size[lP] : 0; g.landmassA = lA >= 0 ? lm.size[lA] : 0;
    g.landmasses = lm.size.filter(n => n >= 12).length;
    // LAND ROUTE TODAY: walkable terrain (woods, deposits and orchards block), buildings ignored
    const wk = components(passTerrain);
    const wkOf = tc => { const s = new Set(); for (const i of hallRing(tc)) if (wk.lab[i] >= 0) s.add(wk.lab[i]); return s; };
    const wP = wkOf(tcP), wA = wkOf(tcA);
    g.landRouteNow = [...wP].some(c => wA.has(c));
    g.walkableA = [...wA].reduce((a, c) => a + wk.size[c], 0);
    g.walkableP = [...wP].reduce((a, c) => a + wk.size[c], 0);
    // SEA ROUTE: one water body with shore near BOTH halls (a water tile within
    // COAST tiles of the hall that touches ground the hall's people can walk to)
    const COAST = 12;
    const wb = components(isWater);
    const coastOf = (tc, wset) => {
      const c = hallCentre(tc), out = new Map();
      for (let y = Math.max(1, (c.y - COAST) | 0); y <= Math.min(H - 2, (c.y + COAST) | 0); y++)
        for (let x = Math.max(1, (c.x - COAST) | 0); x <= Math.min(W - 2, (c.x + COAST) | 0); x++) {
          if (wb.lab[I(x, y)] < 0 || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > COAST) continue;
          let shore = false;
          for (const [dx, dy] of N4) { const l = wk.lab[I(x + dx, y + dy)]; if (l >= 0 && wset.has(l)) { shore = true; break; } }
          if (shore) out.set(wb.lab[I(x, y)], (out.get(wb.lab[I(x, y)]) || 0) + 1);
        }
      return out;
    };
    const sP = coastOf(tcP, wP), sA = coastOf(tcA, wA);
    let shared = 0;
    for (const [b] of sA) if (sP.has(b)) shared = Math.max(shared, wb.size[b]);
    g.seaRoute = shared > 0; g.sharedWaterSize = shared;
    g.coastA = [...sA.values()].reduce((a, n) => a + n, 0); g.coastP = [...sP.values()].reduce((a, n) => a + n, 0);
    g.biggestWaterNearA = Math.max(0, ...[...sA.keys()].map(b => wb.size[b]));
    // CHOKE WIDTH of the land route (an approximation, by erosion): the widest
    // square brush (1, 3, 5, 7 tiles) that can still be dragged hall to hall
    // over walkable terrain. 0 = no land route today.
    g.chokeWidth = 0;
    if (g.landRouteNow) {
      for (let r = 0; r <= 3; r++) {
        const fat = (x, y) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!passTerrain(x + dx, y + dy)) return false; return true; };
        const near = c => { const s = []; for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const x = (c.x | 0) + dx, y = (c.y | 0) + dy; if (MapGen.inB(x, y) && fat(x, y)) s.push(I(x, y)); } return s; };
        const fl = floodFrom(near(cP), fat);
        if (!near(cA).some(i => fl.seen[i])) break;
        g.chokeWidth = 2 * r + 1;
      }
    }
    return g;
  }
  AIH.geography = geography;

  /* ------------------------------------------------------------------ */
  /* 3. THE INSTRUMENTS                                                   */
  /* ------------------------------------------------------------------ */
  const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n == null ? 1 : n); };
  const first = (o, k, v) => { if (o[k] == null) o[k] = v; };

  function newMetrics() {
    return {
      outcome: null, finalDay: 0,
      geo: null, geoEnd: null,
      growth: { hallL2: null, hallL3: null, bldFinal: {}, bldPeak: {}, bldEver: {}, bldFirstDay: {}, levelHist: {},
                series: [], foodZeroDays: 0, villPeak: 0, soldierPeak: 0, upgrades: 0, trained: {} },
      posture: { days: {}, anchorDay: null, anchorSeenDay: null, anchorEst: null, camps: {}, campFirst: {},
                 raidLaunches: 0, firstRaidDay: null, raidLanes: {}, heldForEngineDays: 0, peaceDays: 0, goalDays: {} },
      walls: { walls: 0, gates: 0, towers: 0, wallSites: 0, closedDays: 0, firstClosedDay: null, closedAtEnd: false,
               naturalEnclosedDays: 0, gatesInRing: 0, functional: 0, wasted: 0, detached: 0, wastedShare: 0,
               wastedPeak: 0, wastedWallDays: 0, wallDays: 0, wallLevel: 0, firstWallDay: null, firstGateDay: null, firstTowerDay: null, towerLevels: {} },
      trapped: { trappedUnitDays: 0, trappedFirst: null, trappedKinds: {}, pocketedUnitDays: 0, pocketedFirst: null, pocketedEx: null,
                 embeddedUnitDays: 0, embeddedFirst: null, embeddedEx: null,
                 walledOutUnitDays: 0, walledOutFirst: null, walledOutEx: null,
                 sealedDays: 0, sealedFirst: null, sealedEx: null,
                 corkedDays: 0, corkedFirst: null, corkedMax: 0, corkedEx: null,
                 naturalPocketDays: 0, homeRegionMin: null, homeRegionEnd: 0,
                 stuckUnitDays: 0, stuckFirst: null, stuckEx: null, stuckByTask: {},
                 pacingUnitDays: 0, pacingFirst: null, pacingEx: null, pacingByTask: {},
                 pathStuckWorkerDays: 0, pathStuckWorkerFirst: null, pathStuckWorkerEx: null,
                 idleArmyDays: 0, idleArmyFirst: null, idleArmyMax: 0, idleArmyEx: null,
                 noDoorstepDays: 0 },
      sea: { firstDockDay: null, firstDockDoneDay: null, dockLevelDay: {}, docksEver: 0, hulls: {}, hullsFromStart: {},
             firstHullDay: null, fishboatDays: 0, fishingDays: 0, hullDays: 0, transportLoads: 0, cargoUnitsEver: 0, cargoDays: 0,
             landingsAbroad: 0, landingsHome: 0, landingEvents: 0, firstLandingDay: null, abroadUnitDays: 0, abroadByFootUnitDays: 0,
             navalShots: {}, strandedHoldDays: 0, landingEx: null },
      eng: { sappersTrained: 0, firstSapperDay: null, jobs: {}, jobsP: {}, bridgesStanding: 0, bridgesPeak: 0, bridgesEver: 0, firstBridgeDay: null },
      war: { engines: {}, firstEngineDay: null, pRazedBy: {}, pRazedKeys: {}, firstRazeDay: null, pKilledBy: {}, aLostTo: {}, aDeserted: 0,
             aLostKinds: {}, closestToPHall: null, closestDay: null, warCamps: 0, firstWarCampDay: null, aRazedBy: {}, peaceBrokenDay: null,
             soldierDaysNearPHall: 0 },
      calls: {}, callsByDecision: {}, neverCalled: [],
      cost: { aiDailyMs: [], dayTickMs: [], wallMs: 0, stepMs: 0, sampleMs: 0, botMs: 0 },
      errors: { safe: {}, safeTotal: 0, page: [], bot: {}, botTotal: 0, foreignSteps: 0, forcedUnpause: 0 },
      player: null, rival: null, digest: null, dayDigests: [], trace: [], knows: null,
    };
  }

  const DECISIONS = ['_launchCampRaid', '_launchAmphib', 'campaignLaunch', 'campaignSelect', 'secondFront', 'terraform',
    'offensiveBreach', 'breachToPlayer', 'breachStall', 'cutTheCork', 'openTheGate', '_buildDock', 'maybeWalls', 'mendWallLine',
    'wallDetour', 'wallRelocate', 'answerTheGuns', 'stormTheHall', 'stormTheWonder', 'maybePurge', 'aiWarCamp', 'autoConvert',
    'maybeMine', 'maybeProspect', 'maybeWonder', 'workTheLand', 'probeAssault', 'composeAssault', '_commitMain', 'trainForces',
    'trainArmy', 'bestBuild', 'tryBuild', 'digAndProtect', 'openingBook', 'chooseRaidObj', 'daily'];

  function instrument() {
    const M = AIH.m;
    /* EVERY function on the AI object gets a call counter — derived from the
       object itself, so a method added next month is counted (and shows up
       under "never called" if nothing reaches it) without touching this file. */
    AIH._aiOrig = {};
    for (const k of Object.keys(AI)) {
      if (typeof AI[k] !== 'function') continue;
      const f = AI[k]; AIH._aiOrig[k] = f; M.calls[k] = 0;
      AI[k] = function () { M.calls[k]++; return f.apply(this, arguments); };
    }
    // …with AI.daily timed, and what the day's building choice did recorded
    const daily = AI.daily;
    AI.daily = function () { const t = realNow(); try { return daily.apply(this, arguments); } finally { M.cost.aiDailyMs.push(realNow() - t); } };
    const tick = G.dayTick;
    G.dayTick = function () { const t = realNow(); try { return tick.apply(this, arguments); } finally { M.cost.dayTickMs.push(realNow() - t); } };
    AIH._today = { tries: [], best: null, placed: [], upgraded: [], trained: [] };
    const best = AI.bestBuild;
    AI.bestBuild = function () { AIH._inBest = true; let r; try { r = best.apply(this, arguments); } finally { AIH._inBest = false; } AIH._today.best = !!r; return r; };
    const tryB = AI.tryBuild;
    AI.tryBuild = function (key) { const r = tryB.apply(this, arguments); AIH._today.tries.push((AIH._inBest ? '' : '~') + key + (r ? '+' : '-')); return r; };

    /* every recovered fault, counted per label. G._safe logs a repeat of the
       same fault only once; this counts every one, so an AI method that throws
       every day reads as 300, not 1. */
    const safe0 = G._safe;
    G._safe = function (fn, tag) {
      try { fn(); }
      catch (e) {
        const key = tag + ': ' + String((e && e.message) || e).slice(0, 160);
        inc(M.errors.safe, key); M.errors.safeTotal++;
        if (!M.errors.firstStack) M.errors.firstStack = String((e && e.stack) || e).slice(0, 900);
        safe0.call(G, () => { throw e; }, tag);
      }
    };
    window.addEventListener('error', ev => { if (M.errors.page.length < 20) M.errors.page.push(String(ev.message || ev.error).slice(0, 200)); });
    window.addEventListener('unhandledrejection', ev => { if (M.errors.page.length < 20) M.errors.page.push('unhandled: ' + String(ev.reason && (ev.reason.message || ev.reason)).slice(0, 200)); });

    // who was ever put on the board (the rival's hulls, engines, sappers — by id)
    AIH._ids = { cargo: new Set(), born: new Map() };
    const spawn = Units.spawn;
    Units.spawn = function (kind, owner) {
      const u = spawn.apply(this, arguments);
      try {
        if (u && owner === 'A') {
          const def = CFG.UNITS[kind] || {}, day = S ? S.day : 0, pre = !AIH.running;
          inc(M.growth.trained, kind);
          if (def.naval) { inc(M.sea.hulls, kind); if (pre) inc(M.sea.hullsFromStart, kind); first(M.sea, 'firstHullDay', day); }
          if (kind === 'sapper') { M.eng.sappersTrained++; first(M.eng, 'firstSapperDay', day); }
          if (Units.isSiege(u) || kind === 'ballista' || kind === 'bombard') { inc(M.war.engines, kind); first(M.war, 'firstEngineDay', day); }
        }
      } catch (e) { /* an instrument never breaks the sim */ }
      return u;
    };
    const place = Bld.place;
    Bld.place = function (owner, key) {
      const b = place.apply(this, arguments);
      try {
        if (b && owner === 'A') {
          inc(M.growth.bldEver, key); first(M.growth.bldFirstDay, key, S.day);
          AIH._today.placed.push(key);
          if (key === 'dock') { M.sea.docksEver++; first(M.sea, 'firstDockDay', S.day); }
          if (key === 'warcamp') { M.war.warCamps++; first(M.war, 'firstWarCampDay', S.day); }
        }
        if (b && owner === 'P' && AIH.bot) inc(AIH.bot.rep.placed, key);
      } catch (e) {}
      return b;
    };
    const upg = Bld.upgrade;
    Bld.upgrade = function (b) {
      const r = upg.apply(this, arguments);
      try { if (r && b && b.owner === 'A') { M.growth.upgrades++; AIH._today.upgraded.push(b.key + (b.level + 1)); } } catch (e) {}
      return r;
    };
    const train = Bld.train;
    Bld.train = function (b, kind) {
      const r = train.apply(this, arguments);
      try { if (r && b && b.owner === 'A') AIH._today.trained.push(kind); } catch (e) {}
      return r;
    };
    // a building coming down: whose, and by whose hand
    const bdmg = Bld.damage;
    Bld.damage = function (b, amt, cause, by) {
      const was = b && b.hp, key = b && b.key, owner = b && b.owner, site = b && b.construction > 0;
      const r = bdmg.apply(this, arguments);
      try {
        if (b && was > 0 && b.hp <= 0) {
          const who = cause === 'fire' ? 'fire' : (by || '?');
          if (owner === 'P') {
            inc(M.war.pRazedBy, who);
            if (who === 'A') { inc(M.war.pRazedKeys, key + (site ? '(site)' : '')); first(M.war, 'firstRazeDay', S.day); }
          } else if (owner === 'A') inc(M.war.aRazedBy, who);
        }
      } catch (e) {}
      return r;
    };
    // a unit falling: whose, and to whom
    const udmg = Units.damage;
    Units.damage = function (u, amt, attackerId, attackerOwner) {
      const was = u && u.hp, owner = u && u.owner, kind = u && u.kind;
      let ao = attackerOwner;
      if (!ao && attackerId) { const a = Units.get(attackerId); if (a) ao = a.owner; }
      const r = udmg.apply(this, arguments);
      try {
        if (u && was > 0 && u.hp <= 0) {
          if (owner === 'P') inc(M.war.pKilledBy, ao || '?');
          else if (owner === 'A') { inc(M.war.aLostTo, ao || '?'); inc(M.war.aLostKinds, kind); AIH._dead.add(u.id); }
          if (owner === 'P' && AIH.bot) inc(AIH.bot.rep.lost, kind);
        }
      } catch (e) {}
      return r;
    };
    AIH._dead = new Set();
    const desp = Units.despawn;
    Units.despawn = function (u) {
      try { if (u && u.owner === 'A' && !AIH._dead.has(u.id) && S.units.includes(u)) M.war.aDeserted++; } catch (e) {}
      return desp.apply(this, arguments);
    };
    // the landing itself, exactly when it happens (a short voyage fits between two daily samples)
    const dis = Units.disembark;
    Units.disembark = function (u) {
      const before = (u && u.owner === 'A' && u.cargo) ? u.cargo.slice() : null;
      const r = dis.apply(this, arguments);
      try {
        if (before && before.length) {
          const still = new Set(u.cargo || []);
          const landed = before.filter(c => !still.has(c));
          if (landed.length) {
            M.sea.landingEvents++;
            const lm = AIH._lm, home = AIH._lmHome;
            for (const c of landed) {
              const l = lm ? lm.lab[I(c.x | 0, c.y | 0)] : -2;
              if (lm && l !== home) {
                M.sea.landingsAbroad++; first(M.sea, 'firstLandingDay', S.day);
                if (!M.sea.landingEx) M.sea.landingEx = { kind: c.kind, x: c.x | 0, y: c.y | 0, day: S.day, n: landed.length };
              } else M.sea.landingsHome++;
            }
          }
        }
      } catch (e) {}
      return r;
    };
    // shots loosed from a deck
    const launch = Combat.launch;
    Combat.launch = function (u) {
      try { if (u && u.owner === 'A' && CFG.UNITS[u.kind] && CFG.UNITS[u.kind].naval) inc(M.sea.navalShots, u.kind); } catch (e) {}
      return launch.apply(this, arguments);
    };
    // earthworks and spans, credited to the sapper standing at them
    const jobOwner = (x, y) => {
      let best = null, bd = 3;
      for (const u of S.units) {
        if (u.kind !== 'sapper' || !u.task) continue;
        const d = Math.hypot(u.x - x - 0.5, u.y - y - 0.5);
        if (u.task.x === x && u.task.y === y) return u.owner;
        if (d < bd) { bd = d; best = u.owner; }
      }
      return best || '?';
    };
    for (const job of ['dig', 'clear', 'mound']) {
      const f = Terraform[job];
      if (typeof f !== 'function') continue;
      Terraform[job] = function (x, y) {
        const who = jobOwner(x, y);
        const r = f.apply(this, arguments);
        try { if (r) inc(who === 'A' ? M.eng.jobs : M.eng.jobsP, job); } catch (e) {}
        return r;
      };
    }
    const bb = Bld.buildBridge;
    Bld.buildBridge = function (owner) {
      const r = bb.apply(this, arguments);
      try { if (r) { inc(owner === 'A' ? M.eng.jobs : M.eng.jobsP, 'bridge'); if (owner === 'A') { M.eng.bridgesEver++; first(M.eng, 'firstBridgeDay', S.day); } } } catch (e) {}
      return r;
    };
    const bp = G.breakPeace;
    if (typeof bp === 'function') G.breakPeace = function () { const was = S && S.peace; const r = bp.apply(this, arguments); try { if (was && !S.peace) first(M.war, 'peaceBrokenDay', S.day); } catch (e) {} return r; };
  }

  // nothing may pause, slow or re-screen the run once it is under way
  function quiet() {
    Screens.show = function () { /* the harness has the floor */ };
    Screens._modalUp = false; Screens._victoryPathsPending = false;
    if (Screens.showVictoryPaths) Screens.showVictoryPaths = function () {};
    UI.showEnd = function () {};
    if (typeof Backend !== 'undefined') {
      Backend.autosaveNow = function () {};
      Backend.finalizeRun = function () {};
      Backend.logRunEnd = function () {};
    }
    if (typeof Assets !== 'undefined' && Assets.startEndgameArt) Assets.startEndgameArt = function () {};
  }
  // render-side queues that only a draw would drain: emptied once a sim day
  const RQ = ['floats', 'particles', 'slashes', 'smoke', 'collapses', 'treefalls', 'tamings', 'summons', 'roadSparks',
    'placePoofs', 'horns', 'deaths', 'cardShows', 'cardDust', 'bondSparks', 'blazes', 'blasts', 'arrowFires'];
  function drain() {
    for (const k of RQ) if (Array.isArray(R[k]) && R[k].length) R[k].length = 0;
    if (typeof BattleFX !== 'undefined' && BattleFX.reset) { try { BattleFX.reset(); } catch (e) {} }
    if (typeof UI !== 'undefined' && UI._toastAt && typeof UI._toastAt === 'object') { /* left alone: it is the dedupe map */ }
  }

  /* ------------------------------------------------------------------ */
  /* 4. THE DAILY SAMPLE                                                  */
  /* ------------------------------------------------------------------ */
  const landUnit = u => !CFG.UNITS[u.kind].naval;
  const soldier = u => Units.isMilitary(u) && landUnit(u);
  const reachOf = u => { try { return Combat.reachOf(u); } catch (e) { return (CFG.UNITS[u.kind] || {}).rng || 1; } };
  const exOf = u => ({ kind: u.kind, id: u.id, x: +u.x.toFixed(1), y: +u.y.toFixed(1), day: S.day, task: u.task ? u.task.type : null });

  function inFight(u, prevHp) {
    if (prevHp != null && u.hp < prevHp) return true;
    const r = reachOf(u) + 2;
    if (u.tUnit) { const t = Units.get(u.tUnit); if (t && Math.hypot(t.x - u.x, t.y - u.y) <= r) return true; }
    if (u.tBld) { const b = S.buildings.find(o => o.id === u.tBld); if (b && Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y) - Bld.reach(b) <= r) return true; }
    return false;
  }

  AIH._track = new Map();   // unit id -> { hist: [{x,y}], hp, odo: [n per day] }
  AIH._half = new Map();    // unit id -> {x,y} at the last half-day mark (the odometer)

  function halfDay() {
    // the odometer: straight-line travel between half-day marks, summed
    for (const u of S.units) {
      if (u.owner !== 'A') continue;
      const h = AIH._half.get(u.id);
      if (h) { h.odo += Math.hypot(u.x - h.x, u.y - h.y); h.x = u.x; h.y = u.y; }
      else AIH._half.set(u.id, { x: u.x, y: u.y, odo: 0 });
    }
  }

  function sample() {
    const t0 = realNow();
    const M = AIH.m, day = S.day, ai = S.ai || {};
    const W = CFG.W;
    M.finalDay = day;
    const tcA = Bld.tcOf('A'), tcP = Bld.tcOf('P');
    const bsA = S.buildings.filter(b => b.owner === 'A');
    const unitsA = S.units.filter(u => u.owner === 'A');
    const cargoA = [];
    for (const u of unitsA) if (u.cargo && u.cargo.length) for (const c of u.cargo) cargoA.push(c);

    /* ---- growth ---- */
    if (tcA) {
      if (tcA.level >= 2) first(M.growth, 'hallL2', day);
      if (tcA.level >= 3) first(M.growth, 'hallL3', day);
    }
    const cnt = {};
    for (const b of bsA) inc(cnt, b.key);
    for (const k in cnt) if ((M.growth.bldPeak[k] || 0) < cnt[k]) M.growth.bldPeak[k] = cnt[k];
    M.growth.bldFinal = cnt;
    const vills = unitsA.filter(u => Units.isVillager(u)).length;
    const sols = unitsA.filter(soldier).length + cargoA.filter(soldier).length;
    if (vills > M.growth.villPeak) M.growth.villPeak = vills;
    if (sols > M.growth.soldierPeak) M.growth.soldierPeak = sols;
    if (ai.res && (ai.res.food || 0) <= 0) M.growth.foodZeroDays++;
    if (day % 10 === 0) {
      M.growth.series.push({ d: day, v: vills, s: sols, b: bsA.length, hall: tcA ? tcA.level : 0,
        hulls: unitsA.filter(u => !landUnit(u)).length,
        res: ai.res ? [ai.res.food | 0, ai.res.wood | 0, ai.res.stone | 0, ai.res.gold | 0] : null,
        pv: S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length,
        ps: S.units.filter(u => u.owner === 'P' && Units.isMilitary(u)).length,
        pb: S.buildings.filter(b => b.owner === 'P').length });
    }

    /* ---- posture and plans ---- */
    inc(M.posture.days, ai.posture || 'none');
    if (S.peace) M.posture.peaceDays++;
    if (ai.heldForEngines) M.posture.heldForEngineDays++;
    if (ai.goal) for (const k of Object.keys(ai.goal)) if (ai.goal[k] && k !== 'cost') inc(M.posture.goalDays, k);
    const anchor = ai.read && ai.read.anchor;
    if (anchor) { first(M.posture, 'anchorDay', day); if (M.posture.anchorEst == null) M.posture.anchorEst = !!anchor.est; if (!anchor.est) first(M.posture, 'anchorSeenDay', day); }
    const strat = ai.camp && ai.camp.strat;
    if (strat) { inc(M.posture.camps, strat); first(M.posture.campFirst, strat, day); }
    {
      // a raid LAUNCH: two or more hands newly on a raid task today
      const now = new Set();
      for (const u of unitsA) if (u.task && u.task.type === 'raid') now.add(u.id);
      for (const c of cargoA) if (c.raidObj || (c.task && c.task.type === 'raid')) now.add(c.id);
      let fresh = 0;
      for (const id of now) if (!AIH._raiders || !AIH._raiders.has(id)) fresh++;
      if (fresh >= 2) { M.posture.raidLaunches++; first(M.posture, 'firstRaidDay', day); inc(M.posture.raidLanes, String(ai.raidLane || (ai.raidObj && ai.raidObj.type) || '?')); AIH._today.raid = fresh; }
      AIH._raiders = now;
    }

    /* ---- the land, as it lies today ---- */
    const lm = components(isLandmass);
    AIH._lm = lm;
    let lmHome = -1;
    if (tcA) { for (const i of hallRing(tcA)) if (lm.lab[i] >= 0) { lmHome = lm.lab[i]; break; } }
    AIH._lmHome = lmHome;

    /* ---- walls ---- */
    const Wm = M.walls;
    const forts = bsA.filter(b => (b.key === 'wall' || b.key === 'gate') && !(b.construction > 0));
    Wm.walls = forts.filter(b => b.key === 'wall').length;
    Wm.gates = forts.filter(b => b.key === 'gate').length;
    Wm.wallSites = bsA.filter(b => (b.key === 'wall' || b.key === 'gate') && b.construction > 0).length;
    Wm.towers = bsA.filter(b => b.key === 'tower' && !(b.construction > 0)).length;
    Wm.towerLevels = {}; for (const b of bsA) if (b.key === 'tower' && !(b.construction > 0)) inc(Wm.towerLevels, 'L' + b.level);
    Wm.wallLevel = forts.reduce((m, b) => Math.max(m, b.level || 1), 0);
    if (Wm.walls) first(Wm, 'firstWallDay', day);
    if (Wm.gates) first(Wm, 'firstGateDay', day);
    if (Wm.towers) first(Wm, 'firstTowerDay', day);
    let enclosed = null, closed = false;
    if (tcA) {
      const c = hallCentre(tcA), ring = hallRing(tcA);
      // RING CLOSED: from the doorstep, with walls AND gates solid, nothing
      // beyond the town can be reached — and with the tribe's own walls and
      // gates lifted off, it can. (The second half is what tells a closed
      // ring from a hall the land itself shuts in.)
      enclosed = floodFrom(ring, passNoGate);
      const farIn = reachesFar(enclosed, c);
      if (!farIn && forts.length) {
        const open = floodFrom(ring, passNoForts('A'));
        if (reachesFar(open, c)) closed = true; else Wm.naturalEnclosedDays++;
      } else if (!farIn) Wm.naturalEnclosedDays++;
      if (closed) { Wm.closedDays++; first(Wm, 'firstClosedDay', day); }
      Wm.closedAtEnd = closed;
      // FUNCTIONAL vs WASTED: a section is doing a job only if somebody could
      // step up to it from BEYOND — an orthogonal neighbour further from the
      // hall than the section itself that an enemy could stand on. A section
      // with none (laid against water, wood, rock or behind other stone) is
      // wasted. DETACHED (closed rings only): not touching the enclosed ground.
      let fn = 0, wasted = 0, det = 0, gin = 0;
      const pP = passFor('P');
      for (const b of forts) {
        const d0 = Math.hypot(b.x + 0.5 - c.x, b.y + 0.5 - c.y);
        let outer = false, touch = false;
        for (const [dx, dy] of N4) {
          const x = b.x + dx, y = b.y + dy;
          if (!MapGen.inB(x, y)) continue;
          if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > d0 && pP(x, y)) outer = true;
        }
        for (const [dx, dy] of N8) { const x = b.x + dx, y = b.y + dy; if (MapGen.inB(x, y) && enclosed.seen[I(x, y)]) touch = true; }
        if (b.key === 'wall') { if (outer) fn++; else wasted++; if (closed && !touch) det++; }
        else if (touch) gin++;
      }
      Wm.functional = fn; Wm.wasted = wasted; Wm.detached = det; Wm.gatesInRing = gin;
      Wm.wastedShare = Wm.walls ? +(wasted / Wm.walls).toFixed(3) : 0;
      if (Wm.wastedShare > Wm.wastedPeak) Wm.wastedPeak = Wm.wastedShare;
      Wm.wastedWallDays += wasted; Wm.wallDays += Wm.walls;
    }

    /* ---- trapped (complaint #1) ---- */
    const Tm = M.trapped;
    let homeSet = null, compA = null, noOwn = null;
    if (tcA) {
      const c = hallCentre(tcA), ring = hallRing(tcA);
      const pA = passFor('A');
      compA = components(pA);
      homeSet = new Set();
      for (const i of ring) if (compA.lab[i] >= 0) homeSet.add(compA.lab[i]);
      let homeSize = 0; for (const id of homeSet) homeSize += compA.size[id];
      Tm.homeRegionEnd = homeSize;
      if (Tm.homeRegionMin == null || homeSize < Tm.homeRegionMin) Tm.homeRegionMin = homeSize;
      if (!homeSet.size) Tm.noDoorstepDays++;
      // the same flood with the tribe's own buildings lifted off the board
      noOwn = floodFrom(ring, passNoOwn('A'));
      // how far does home reach?
      let homeFar = false;
      const r2 = FAR * FAR;
      for (let i = 0; i < compA.lab.length && !homeFar; i++) {
        if (compA.lab[i] < 0 || !homeSet.has(compA.lab[i])) continue;
        const dx = (i % W) + 0.5 - c.x, dy = ((i / W) | 0) + 0.5 - c.y;
        if (dx * dx + dy * dy > r2) homeFar = true;
      }
      const farNoOwn = reachesFar(noOwn, c);
      if (!homeFar) {
        if (farNoOwn) { Tm.sealedDays++; first(Tm, 'sealedFirst', day); if (!Tm.sealedEx) Tm.sealedEx = { day, homeSize, x: tcA.x, y: tcA.y, walls: Wm.walls, gates: Wm.gates }; }
        else Tm.naturalPocketDays++;
      }
      // CORKED: ground the tribe could walk to if its own works were not there
      // (tiles under those works themselves are not ground anyone lost)
      let lost = 0;
      for (const i of noOwn.list) {
        if (compA.lab[i] >= 0 && homeSet.has(compA.lab[i])) continue;
        const x = i % W, y = (i / W) | 0;
        if (pA(x, y)) lost++;
      }
      if (lost >= CORK) { Tm.corkedDays++; first(Tm, 'corkedFirst', day); if (lost > Tm.corkedMax) { Tm.corkedMax = lost; Tm.corkedEx = { day, lost, homeSize }; } }
      AIH._lost = lost;
    }
    const pA = passFor('A');
    let idle = 0, idleEx = null;
    for (const u of unitsA) {
      const tr = AIH._track.get(u.id) || { hist: [], hp: u.hp, odo: [] };
      const prevHp = tr.hp; tr.hp = u.hp;
      const half = AIH._half.get(u.id);
      tr.odo.push(half ? half.odo : 0); if (half) half.odo = 0;
      if (tr.odo.length > 6) tr.odo.shift();
      tr.hist.push({ x: u.x, y: u.y }); if (tr.hist.length > 7) tr.hist.shift();
      AIH._track.set(u.id, tr);
      const tx = u.x | 0, ty = u.y | 0, ti = I(tx, ty);
      const naval = !landUnit(u);
      if (u.perch || u.climb) continue;
      // EMBEDDED: standing on a tile its own kind cannot stand on
      const okTile = naval ? Path.passable(tx, ty, 'A', 'water') : pA(tx, ty);
      if (!okTile) { Tm.embeddedUnitDays++; first(Tm, 'embeddedFirst', day); if (!Tm.embeddedEx) Tm.embeddedEx = Object.assign(exOf(u), { terr: terr(tx, ty), bld: (Bld.at(tx, ty) || {}).key || null }); }
      let trappedNow = !okTile;
      if (naval) { if (trappedNow) Tm.trappedUnitDays++; continue; }
      if (compA && okTile) {
        const cid = compA.lab[ti];
        if (cid >= 0 && !homeSet.has(cid)) {
          const wasCargo = AIH._ids.cargo.has(u.id);
          // WALLED OUT: cut off from home by the tribe's OWN works (reachable the moment they are lifted)
          if (noOwn && noOwn.seen[ti]) { trappedNow = true; Tm.walledOutUnitDays++; first(Tm, 'walledOutFirst', day); if (!Tm.walledOutEx) Tm.walledOutEx = Object.assign(exOf(u), { comp: compA.size[cid] }); }
          // POCKETED: in a small pocket that is not home
          if (compA.size[cid] < POCKET) { trappedNow = true; Tm.pocketedUnitDays++; first(Tm, 'pocketedFirst', day); if (!Tm.pocketedEx) Tm.pocketedEx = Object.assign(exOf(u), { comp: compA.size[cid], wasCargo }); }
          // ABROAD: on another land mass than the hall's
          if (lmHome >= 0 && lm.lab[ti] >= 0 && lm.lab[ti] !== lmHome) {
            M.sea.abroadUnitDays++;
            if (!wasCargo) M.sea.abroadByFootUnitDays++;
          }
        }
      }
      if (trappedNow) { Tm.trappedUnitDays++; first(Tm, 'trappedFirst', day); inc(Tm.trappedKinds, u.kind); }
      const fight = inFight(u, prevHp);
      // a walked-out path is left on the unit (pathI at its end): only a path with steps LEFT is an order
      const walking = !!(u.path && (u.pathI || 0) < u.path.length);
      const busy = !!(u.task || walking || u.tUnit || u.tBld);
      const h = tr.hist;
      // …and only an order HELD through every one of those marks counts: a guard who stood idle
      // for three days and was sent off this morning has not been stuck for three days
      tr.busyRun = (busy && !fight) ? (tr.busyRun || 0) + 1 : 0;
      tr.walkRun = (walking && !fight) ? (tr.walkRun || 0) + 1 : 0;
      if (soldier(u)) {
        // STUCK: under orders, not fighting, and the last four daily marks fit in half a tile
        if (tr.busyRun >= 4 && !u.siegePost && h.length >= 4) {
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (let k = h.length - 4; k < h.length; k++) { x0 = Math.min(x0, h[k].x); x1 = Math.max(x1, h[k].x); y0 = Math.min(y0, h[k].y); y1 = Math.max(y1, h[k].y); }
          if (Math.hypot(x1 - x0, y1 - y0) < 0.5) {
            Tm.stuckUnitDays++; first(Tm, 'stuckFirst', day);
            const why = (u.task ? u.task.type : u.tBld ? 'tBld' : u.tUnit ? 'tUnit' : 'path') + (u.defend ? '+defend' : '');
            inc(Tm.stuckByTask, why);
            if (!Tm.stuckEx) Tm.stuckEx = Object.assign(exOf(u), { why, tUnit: u.tUnit || 0, tBld: u.tBld || 0, path: u.path ? u.path.length - (u.pathI || 0) : 0 });
          }
        }
        // PACING: walked a long way in six days and went nowhere (the shoreline shuffle)
        if (tr.busyRun >= 7 && h.length >= 7 && tr.odo.length >= 6) {
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, odo = 0;
          for (const p of h) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
          for (const o of tr.odo) odo += o;
          if (odo >= 14 && Math.hypot(x1 - x0, y1 - y0) <= 4) {
            Tm.pacingUnitDays++; first(Tm, 'pacingFirst', day);
            const why = (u.task ? u.task.type : u.tBld ? 'tBld' : u.tUnit ? 'tUnit' : 'path') + (u.defend ? '+defend' : '');
            inc(Tm.pacingByTask, why);
            if (!Tm.pacingEx) Tm.pacingEx = Object.assign(exOf(u), { why, odo: +odo.toFixed(1) });
          }
        }
        // IDLE AT HOME
        if (!busy && tcA && Math.hypot(u.x - (tcA.x + 1), u.y - (tcA.y + 1)) <= 8) { idle++; if (!idleEx) idleEx = exOf(u); }
        // how near the war ever came to the player's hall
        if (tcP) {
          const d = Math.hypot(u.x - (tcP.x + 1), u.y - (tcP.y + 1));
          if (M.war.closestToPHall == null || d < M.war.closestToPHall) { M.war.closestToPHall = +d.toFixed(1); M.war.closestDay = day; }
          if (d <= 8) M.war.soldierDaysNearPHall++;
        }
      } else if ((Units.isVillager(u) || u.kind === 'sapper') && tr.walkRun >= 4 && h.length >= 4) {
        // a WORKER walking a path that is not getting anywhere
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let k = h.length - 4; k < h.length; k++) { x0 = Math.min(x0, h[k].x); x1 = Math.max(x1, h[k].x); y0 = Math.min(y0, h[k].y); y1 = Math.max(y1, h[k].y); }
        if (Math.hypot(x1 - x0, y1 - y0) < 0.5 && (u.path.length - (u.pathI || 0)) > 1) {
          Tm.pathStuckWorkerDays++; first(Tm, 'pathStuckWorkerFirst', day);
          if (!Tm.pathStuckWorkerEx) Tm.pathStuckWorkerEx = exOf(u);
        }
      }
    }
    if (idle >= 5 && (ai.posture === 'PUSH' || ai.posture === 'PRESSURE') && anchor) {
      Tm.idleArmyDays++; first(Tm, 'idleArmyFirst', day);
      if (idle > Tm.idleArmyMax) { Tm.idleArmyMax = idle; Tm.idleArmyEx = Object.assign({ n: idle }, idleEx); }
    }

    /* ---- sea (complaint #3) ---- */
    const Sm = M.sea;
    const docks = bsA.filter(b => b.key === 'dock');
    if (docks.length) first(Sm, 'firstDockDay', day);
    for (const d of docks) if (!(d.construction > 0)) { first(Sm, 'firstDockDoneDay', day); first(Sm.dockLevelDay, 'L' + d.level, day); }
    let hullsNow = 0, loaded = 0;
    for (const u of unitsA) {
      if (landUnit(u)) continue;
      hullsNow++;
      if (u.kind === 'fishboat') { Sm.fishboatDays++; if (u.task && /fish/.test(u.task.type)) Sm.fishingDays++; }
      if (u.cargo && u.cargo.length) {
        loaded++;
        if (!(u.path && (u.pathI || 0) < u.path.length) && !u.task) Sm.strandedHoldDays++;
        if (!AIH._loaded || !AIH._loaded.has(u.id)) Sm.transportLoads++;
      }
    }
    Sm.hullDays += hullsNow;
    AIH._loaded = new Set(unitsA.filter(u => u.cargo && u.cargo.length).map(u => u.id));
    if (cargoA.length) Sm.cargoDays++;
    for (const c of cargoA) if (!AIH._ids.cargo.has(c.id)) { AIH._ids.cargo.add(c.id); Sm.cargoUnitsEver++; }

    /* ---- engineering ---- */
    const brA = (S.bridges || []).filter(b => b.owner === 'A').length;
    M.eng.bridgesStanding = brA; if (brA > M.eng.bridgesPeak) M.eng.bridgesPeak = brA;

    /* ---- the trace line ---- */
    if (AIH.cfg.trace) M.trace.push(traceLine(unitsA, cargoA, bsA, tcA, closed));
    AIH._today = { tries: [], best: null, placed: [], upgraded: [], trained: [] };
    M.cost.sampleMs += realNow() - t0;
  }

  function traceLine(unitsA, cargoA, bsA, tcA, closed) {
    const ai = S.ai || {}, t = AIH._today, M = AIH.m;
    const kinds = {};
    for (const u of unitsA) inc(kinds, u.kind);
    for (const c of cargoA) inc(kinds, c.kind + '*');
    const res = ai.res ? [ai.res.food | 0, ai.res.wood | 0, ai.res.stone | 0, ai.res.gold | 0].join('/') : '-';
    const anchor = ai.read && ai.read.anchor;
    const camp = ai.camp ? (ai.camp.strat || '-') + (ai.camp.rounds ? ' r' + ai.camp.rounds : '') + (ai.camp.grind ? ' grind' : '') : '-';
    const raiders = unitsA.filter(u => u.task && u.task.type === 'raid').length;
    const raid = raiders ? 'raid ' + raiders + '@' + (ai.raidLane || (ai.raidObj && ai.raidObj.type) || '?') : (ai.raidCd > 0 ? 'cd' + Math.ceil(ai.raidCd) : '-');
    const P = AIH.bot ? AIH.bot.brief() : '';
    return 'd' + String(S.day).padStart(3, '0') + ' ' + String(ai.posture || '-').padEnd(8) +
      ' hall' + (tcA ? tcA.level : 'X') + ' camp=' + camp + ' ' + raid +
      (t.raid ? ' LAUNCH' + t.raid : '') +
      ' anchor=' + (anchor ? (anchor.est ? 'est' : 'seen') : 'none') +
      (ai.heldForEngines ? ' HELD' : '') + (S.peace ? ' peace' : '') +
      ' | build=' + (t.best == null ? '·' : t.best ? 'Y' : 'n') + '[' + t.tries.slice(0, 6).join(' ') + ']' +
      (t.placed.length ? ' placed:' + t.placed.join(',') : '') + (t.upgraded.length ? ' up:' + t.upgraded.join(',') : '') +
      (t.trained.length ? ' train:' + t.trained.join(',') : '') +
      ' | ' + Object.keys(kinds).sort().map(k => k + ':' + kinds[k]).join(' ') +
      ' | b' + bsA.length + ' w' + M.walls.walls + '/g' + M.walls.gates + '/t' + M.walls.towers + (closed ? ' CLOSED' : '') +
      (M.walls.wasted ? ' wasted' + M.walls.wasted : '') + (AIH._lost >= CORK ? ' CORK' + AIH._lost : '') +
      ' | ' + res + ' || P ' + P;
  }

  // a picture of the ground round the rival's hall, for checking a flood by hand
  AIH.ascii = function (rad, owner) {
    owner = owner || 'A'; rad = rad || 13;
    const tc = Bld.tcOf(owner); if (!tc) return '(no hall)';
    const ring = hallRing(tc), fl = floodFrom(ring, passFor(owner));
    const unitsAt = new Map();
    for (const u of S.units) { const k = I(u.x | 0, u.y | 0); if (!unitsAt.has(k) || u.owner === owner) unitsAt.set(k, u); }
    const rows = [];
    for (let y = tc.y - rad; y <= tc.y + rad + 1; y++) {
      let row = '';
      for (let x = tc.x - rad; x <= tc.x + rad + 1; x++) {
        if (!MapGen.inB(x, y)) { row += ' '; continue; }
        const i = I(x, y), b = Bld.at(x, y), u = unitsAt.get(i), t = S.map.terrain[i];
        let ch;
        if (u && u.owner === owner) ch = Units.isVillager(u) ? 'v' : CFG.UNITS[u.kind].naval ? 'b' : 's';
        else if (u && u.owner === 'P') ch = 'p';
        else if (u && u.owner === 'R') ch = 'r';
        else if (b) ch = b.key === 'wall' ? (b.construction > 0 ? 'x' : '#') : b.key === 'gate' ? (b.construction > 0 ? 'g' : 'G') : b.key === 'tc' ? 'H' : b.key === 'tower' ? 'T' : b.key === 'dock' ? 'D' : (b.owner === owner ? (b.construction > 0 ? 'o' : 'O') : 'E');
        else if (t === T.WATER || t === T.MOAT) ch = '~';
        else if (t === T.MOUNTAIN) ch = '^';
        else if (t === T.FOREST) ch = 'f';
        else if (t === T.HILLS) ch = 'h';
        else if (t === T.FERTILE) ch = 'c';
        else if (!MapGen.onBoard(x, y)) ch = ' ';
        else ch = fl.seen[i] ? '.' : ':';
        row += ch;
      }
      rows.push(row);
    }
    return rows.join('\n') + '\n(. home ground  : walkable but NOT reachable from the doorstep  # wall  x wall site  G gate  T tower  H hall  O own building  D dock  E other building  ~ water  ^ mountain  f wood  h ore  c orchard  s soldier  v villager  b hull  p player unit  r raider)';
  };

  /* ------------------------------------------------------------------ */
  /* 5. THE SCRIPTED PLAYER                                               */
  /* ------------------------------------------------------------------ */
  function makeBot(style) {
    const rep = { style, placed: {}, lost: {}, trainedV: 0, trained: {}, upgrades: 0, hallL2: null, hallL3: null,
                  attacks: 0, firstAttackDay: null, attackOrders: 0, scoutLegs: 0, noLandRouteDays: 0, towersManned: 0,
                  wallsLaid: 0, gateLaid: 0, gateOpened: 0, wallUpgrades: 0, armyPeak: 0, villPeak: 0, stayedHome: false,
                  idleVillagerDays: 0, razed: 0, firstSeenRivalDay: null, targetNone: 0 };
    const B = { style, rep, wave: null, scoutId: 0, ring: null, reserve: null };
    const M = AIH.m;
    const act = (name, fn) => { try { return fn(); } catch (e) { inc(M.errors.bot, name + ': ' + String(e && e.message || e).slice(0, 120)); M.errors.botTotal++; return null; } };
    const tc = () => Bld.tcOf('P');
    const mine = () => S.buildings.filter(b => b.owner === 'P');
    const count = key => S.buildings.filter(b => b.owner === 'P' && b.key === key).length;
    const doneOf = key => S.buildings.filter(b => b.owner === 'P' && b.key === key && !(b.construction > 0));
    const vills = () => S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    const army = () => S.units.filter(u => u.owner === 'P' && soldier(u));
    // what the next military yard will cost is kept back from stations and
    // upgrades (B.reserve), or the town never affords its first spear
    const can = (cost, free) => {
      if (!Bld.canAfford(cost, S.res)) return false;
      if (free || !B.reserve) return true;
      for (const k in B.reserve) if ((S.res[k] || 0) - (cost[k] || 0) < B.reserve[k]) return false;
      return true;
    };
    const explored = (x, y) => !!S.map.explored[I(x, y)];
    const queued = kind => mine().reduce((n, b) => n + (b.queue || []).filter(q => q.unit === kind).length, 0);

    // a building site near the hall: a deterministic spiral, one tile of
    // breathing room round every footprint so the town never corks itself
    function siteNear(key, rMin, rMax, cx, cy) {
      const t = tc(); if (!t) return null;
      const sz = Bld.size(key);
      cx = cx == null ? t.x : cx; cy = cy == null ? t.y : cy;
      for (let r = rMin; r <= rMax; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (!MapGen.onBoard(x, y)) continue;
          if (B.ring && B.ring.onLine(x, y, sz)) continue;
          let clear = true;
          for (let yy = y - 1; yy <= y + sz && clear; yy++) for (let xx = x - 1; xx <= x + sz; xx++) {
            if (!MapGen.inB(xx, yy)) continue;
            const o = Bld.at(xx, yy);
            if (o && !(o.key === 'wall' || o.key === 'gate')) { clear = false; break; }
          }
          if (!clear) continue;
          const c = Bld.canPlace('P', key, x, y);
          if (c.ok) return { x, y };
        }
      }
      return null;
    }
    function build(key, spot) {
      if (!spot) return null;
      const c = Bld.canPlace('P', key, spot.x, spot.y);
      if (!c.ok) return null;
      return Bld.place('P', key, spot.x, spot.y, {});
    }
    // worked ground for a station (the game's own rule decides: Bld.canPlace)
    function stationSpot(key) {
      const t = tc(); if (!t) return null;
      let best = null, bd = 1e9;
      const R0 = 16;
      for (let y = Math.max(1, t.y - R0); y <= Math.min(CFG.H - 2, t.y + R0); y++)
        for (let x = Math.max(1, t.x - R0); x <= Math.min(CFG.W - 2, t.x + R0); x++) {
          if (!explored(x, y)) continue;
          const d = Math.hypot(x - t.x, y - t.y);
          if (d >= bd) continue;
          if (B.ring && B.ring.onLine(x, y, 1)) continue;
          if (Bld.stationGround) { const sg = Bld.stationGround(key, x, y); if (!sg || sg.ok === false) continue; }
          if (Bld.canPlace('P', key, x, y).ok) { bd = d; best = { x, y }; }
        }
      return best;
    }

    /* ---------- the economy every style runs ---------- */
    function econ(light) {
      const t = tc(); if (!t) return;
      const vs = vills();
      if (vs.length > rep.villPeak) rep.villPeak = vs.length;
      // 1. unstaffed stations take the nearest idle hand
      act('staff', () => {
        const foodFirst = b => (b.key === 'farm' || b.key === 'lodge') ? 0 : 1;
        for (const b of mine().sort((p, q) => foodFirst(p) - foodFirst(q) || p.id - q.id)) {
          const d = Bld.def(b.key);
          if (!d.needsWorker || b.construction > 0 || b.upgrading > 0) continue;
          while (Bld.workersAssigned(b) < Bld.maxWorkers(b)) {
            const v = Units.nearestIdleVillager(b.x, b.y);
            if (!v) return;
            v.task = { type: 'work', id: b.id }; v.tUnit = 0; v.tBld = 0;
            if (!Units.setPath(v, b.x, b.y)) { v.task = null; break; }
          }
        }
      });
      // 2. sites with nobody on them take one
      act('builders', () => {
        const on = new Set();
        for (const u of vs) if (u.task && u.task.type === 'build') on.add(u.task.id);
        let sent = 0;
        for (const b of mine()) {
          if (!(b.construction > 0 || b.upgrading > 0) || on.has(b.id)) continue;
          if ((b.key === 'wall' || b.key === 'gate') && sent >= 2) continue;
          const v = Units.nearestIdleVillager(b.x, b.y);
          if (!v) break;
          if (Units.assignBuild(v, b)) { on.add(b.id); if (b.key === 'wall' || b.key === 'gate') sent++; }
        }
      });
      // 3. idle hands gather what the town is shortest of
      act('gather', () => {
        const mouths = army().length;
        const want = [['food', T.FERTILE, 280 + 45 * mouths], ['wood', T.FOREST, 340], ['stone', T.HILLS, 200]]
          .map(w => ({ res: w[0], terr: w[1], need: (S.res[w[0]] || 0) / w[2] })).sort((a, b) => a.need - b.need);
        const gath = vs.filter(u => u.task && (u.task.type === 'gather' || u.task.type === 'shorefish'));
        // the hands follow the need: when one store runs dry while another
        // overflows, two gatherers a day change jobs (never the stations' crews)
        if (!light && want[0].need < 0.35 && want[2].need > 1.2) {
          const from = gath.filter(u => (u.task.res || 'food') === want[2].res).slice(0, 2);
          for (const u of from) { u.task = null; u.path = null; }
        }
        const idle = vs.filter(u => !u.task && !u.tUnit && !(Units.isLevied && Units.isLevied(u)));
        if (!idle.length) return;
        const claimed = new Map();
        for (const u of vs) if (u.task && u.task.type === 'gather') inc2(claimed, I(u.task.x, u.task.y));
        const R0 = 15;
        const tiles = { [T.FERTILE]: [], [T.FOREST]: [], [T.HILLS]: [] }, shoals = [];
        for (let y = Math.max(1, t.y - R0); y <= Math.min(CFG.H - 2, t.y + R0); y++)
          for (let x = Math.max(1, t.x - R0); x <= Math.min(CFG.W - 2, t.x + R0); x++) {
            const tt = S.map.terrain[I(x, y)];
            if (!explored(x, y) || Bld.at(x, y)) continue;
            if (tiles[tt]) tiles[tt].push({ x, y });
            else if (tt === T.WATER && S.map.resAmount[I(x, y)] > 0 && MapGen.shoal(x, y)) shoals.push({ x, y });
          }
        let k = 0;
        for (const u of idle) {
          // spread the hands: the shortest good takes the first, then turn about
          let done = false;
          const byDist = (a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y);
          for (let j = 0; j < want.length && !done; j++) {
            const w = want[(k + j) % want.length];
            const list = tiles[w.terr].slice().sort(byDist);
            for (let n = 0; n < list.length && n < 14; n++) {
              const c = list[n];
              if ((claimed.get(I(c.x, c.y)) || 0) >= 2) continue;
              if (Units.assignGather(u, c.x, c.y)) { inc2(claimed, I(c.x, c.y)); done = true; break; }
            }
            // no orchard in reach: a line off the shore feeds a village too
            if (!done && w.res === 'food') {
              const sl = shoals.slice().sort(byDist);
              for (let n = 0; n < sl.length && n < 10; n++) {
                const c = sl[n];
                if ((claimed.get(I(c.x, c.y)) || 0) >= 1) continue;
                if (Units.assignShoreFish(u, c.x, c.y)) { inc2(claimed, I(c.x, c.y)); done = true; break; }
              }
            }
          }
          k++;
          if (!done) rep.idleVillagerDays += light ? 0 : 1;
        }
      });
      if (light) return;
      const day = S.day, hall = t.level;
      // 3b. one hand walks out to look while the town knows too little of its
      // own country (the fog hides every orchard, wood and seam it has not seen)
      act('explore', () => {
        if (day < 3 || day > 90 || day % 2) return;
        const known = { [T.FERTILE]: 0, [T.FOREST]: 0, [T.HILLS]: 0 };
        for (let y = Math.max(1, t.y - 15); y <= Math.min(CFG.H - 2, t.y + 15); y++)
          for (let x = Math.max(1, t.x - 15); x <= Math.min(CFG.W - 2, t.x + 15); x++) { const tt = S.map.terrain[I(x, y)]; if (known[tt] != null && explored(x, y)) known[tt]++; }
        if (known[T.FERTILE] >= 6 && known[T.FOREST] >= 8 && known[T.HILLS] >= 4) return;
        let ex = B.explorer && Units.get(B.explorer);
        if (ex && ex.task && ex.task.type !== 'move') ex = null;       // it took a job: find another
        if (ex && ex.path && (ex.pathI || 0) < ex.path.length) return;
        if (!ex) { ex = Units.nearestIdleVillager(t.x, t.y) || vs.find(u => u.task && u.task.type === 'gather' && u.task.res !== 'food'); if (!ex) return; B.explorer = ex.id; }
        const fl = floodFrom([I(ex.x | 0, ex.y | 0)], (x, y) => explored(x, y) && Path.passable(x, y, 'P'));
        let best = null, bd = 1e9;
        for (const i of fl.list) {
          const x = i % CFG.W, y = (i / CFG.W) | 0, d = Math.hypot(x - t.x, y - t.y);
          if (d < 5 || d > 20 || d >= bd) continue;
          let frontier = false;
          for (const [dx, dy] of N4) if (MapGen.onBoard(x + dx, y + dy) && !explored(x + dx, y + dy)) { frontier = true; break; }
          if (frontier) { bd = d; best = { x, y }; }
        }
        if (best && Units.moveTo(ex, best.x, best.y)) rep.exploreLegs = (rep.exploreLegs || 0) + 1;
        else B.explorer = 0;
      });
      // …and a hand that has walked its leg is a hand again
      act('explorer-home', () => { const ex = B.explorer && Units.get(B.explorer); if (ex && ex.task && ex.task.type === 'move' && !(ex.path && (ex.pathI || 0) < ex.path.length)) ex.task = null; });
      if (hall >= 2 && rep.hallL2 == null) rep.hallL2 = day;
      if (hall >= 3 && rep.hallL3 == null) rep.hallL3 = day;
      // 4. a roof before the cap bites
      act('house', () => {
        const pending = S.buildings.filter(b => b.owner === 'P' && b.key === 'house' && b.construction > 0).length;
        if (Units.popUsed('P') + queued('villager') + 2 >= Bld.popCap('P') && !pending) build('house', siteNear('house', 2, 7));
      });
      // 5. hands, up to the style's workforce
      act('villagers', () => {
        const wantV = style === 'passive' ? 14 : 12;
        if (vs.length + queued('villager') < wantV && Bld.canTrain(t, 'villager').ok && (S.res.food || 0) >= 90)
          if (Bld.train(t, 'villager')) rep.trainedV++;
      });
      // 6. stations on worked ground
      act('stations', () => {
        const cap = day < 30 ? 1 : day < 80 ? 2 : 3;
        const hungry = (S.res.food || 0) < 150 + 30 * army().length;
        for (const key of ['farm', 'lumber', 'quarry', 'lodge']) {
          if (!CFG.BUILDINGS[key]) continue;
          if (count(key) >= (key === 'lodge' ? 1 : cap + (key === 'farm' && hungry ? 2 : 0))) continue;
          const spec = Bld.effCost ? Bld.effCost('P', key) : CFG.BUILDINGS[key].levels[0].cost;
          if (!can(spec)) continue;
          if (build(key, stationSpot(key))) return;
        }
      });
      // 7. the hall, and the three buildings it rises on
      act('hall', () => {
        if (Bld.canUpgrade(t).ok) { if (Bld.upgrade(t)) rep.upgrades++; return; }
        if (t.level >= 3 || t.upgrading > 0) return;
        if (t.level >= 2 && Bld.tcSupport(t) < Bld.TC_SUPPORT) {
          // lift the cheapest finished buildings to the hall's own level
          const cands = mine().filter(b => b.key !== 'tc' && b.key !== 'wall' && b.key !== 'gate' && b.level < t.level && Bld.canUpgrade(b).ok)
            .sort((a, b) => costSum(Bld.def(a.key).levels[a.level].cost) - costSum(Bld.def(b.key).levels[b.level].cost));
          if (cands.length && Bld.upgrade(cands[0])) rep.upgrades++;
        }
      });
      // 8. with goods to spare, the town improves (turtle and aggressive lean on this too)
      act('upgrades', () => {
        if (day % 3) return;
        const rich = (S.res.wood || 0) > 500 && (S.res.stone || 0) > 300;
        if (!rich) return;
        const fed = (S.res.food || 0) > 350;
        const cands = mine().filter(b => b.key !== 'tc' && b.key !== 'wall' && b.key !== 'gate' && (fed || (b.key !== 'farm' && b.key !== 'lodge')) && Bld.canUpgrade(b).ok)
          .sort((a, b) => costSum(Bld.def(a.key).levels[a.level].cost) - costSum(Bld.def(b.key).levels[b.level].cost));
        if (cands.length && can(Bld.def(cands[0].key).levels[cands[0].level].cost) && Bld.upgrade(cands[0])) rep.upgrades++;
      });
    }
    const costSum = c => { let n = 0; for (const k in c) n += c[k] * (k === 'gold' ? 3 : 1); return n; };
    const inc2 = (m, k) => m.set(k, (m.get(k) || 0) + 1);

    /* ---------- the yards and the drill ---------- */
    function yardPlan(wantStable) {
      // which yard comes next, and what is kept back for it
      const t = tc(); B.reserve = null;
      if (!t || S.day < 6) return null;
      for (const key of ['barracks', 'range'].concat(wantStable ? ['stable'] : [])) {
        const d = CFG.BUILDINGS[key];
        if (!d || count(key) >= 1) continue;
        if (d.reqTC && t.level < d.reqTC) continue;
        const cost = Bld.effCost ? Bld.effCost('P', key) : d.levels[0].cost;
        B.reserve = Object.assign({}, cost);
        return { key, cost };
      }
      return null;
    }
    function yards(next) {
      if (!next || S.day < 8) return;
      act('yards', () => { if (can(next.cost, true)) build(next.key, siteNear(next.key, 3, 8)); });
    }
    // the best rank a yard can train today, from its own table
    function bestRank(b, floorFood) {
      const tr = Bld.def(b.key).train || {};
      let pick = null;
      for (const k of Object.keys(tr)) {
        const c = Bld.canTrain(b, k);
        if (c.ok) pick = k;
      }
      return pick;
    }
    function drill(wantBlades, wantBows, wantHorse) {
      act('drill', () => {
        const a = army();
        if (a.length > rep.armyPeak) rep.armyPeak = a.length;
        if ((S.res.food || 0) < 120 + 12 * a.length) return;
        const have = key => a.filter(u => (Bld.def(key).train || {})[u.kind]).length + mine().filter(b => b.key === key).reduce((n, b) => n + (b.queue || []).length, 0);
        for (const [key, want] of [['barracks', wantBlades], ['range', wantBows], ['stable', wantHorse || 0]]) {
          if (!want) continue;
          for (const b of doneOf(key)) {
            if (b.upgrading > 0 || (b.queue || []).length >= 2) continue;
            if (have(key) >= want) continue;
            const k = bestRank(b);
            if (k && Bld.train(b, k)) inc(rep.trained, k);
          }
        }
      });
    }

    /* ---------- the turtle's works ---------- */
    function ringPlan() {
      const t = tc(); if (!t || B.ring) return;
      const R0 = 6, x0 = t.x - R0 + 1, x1 = t.x + R0, y0 = t.y - R0 + 1, y1 = t.y + R0;
      const tiles = [];
      for (let x = x0; x <= x1; x++) { tiles.push({ x, y: y0 }); tiles.push({ x, y: y1 }); }
      for (let y = y0 + 1; y < y1; y++) { tiles.push({ x: x0, y }); tiles.push({ x: x1, y }); }
      // the gate faces the middle of the map: the side an enemy comes from
      const mx = CFG.W / 2 - t.x, my = CFG.H / 2 - t.y;
      const gate = Math.abs(mx) > Math.abs(my) ? { x: mx > 0 ? x1 : x0, y: t.y } : { x: t.x, y: my > 0 ? y1 : y0 };
      B.ring = { tiles, gate, x0, x1, y0, y1,
        onLine(x, y, sz) { for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) { const xx = x + dx, yy = y + dy; if (((xx === x0 || xx === x1) && yy >= y0 && yy <= y1) || ((yy === y0 || yy === y1) && xx >= x0 && xx <= x1)) return true; } return false; } };
    }
    function walls() {
      const t = tc(); if (!t) return;
      act('walls', () => {
        if (S.day < 30) return;
        if (count('barracks') < 1 || count('tower') < 2) return;
        if ((S.res.food || 0) < 150) return;   // the larder before the line
        const g = B.ring.gate;
        // the gate first, so the line can never shut its own people in
        const gb = Bld.at(g.x, g.y);
        if (!gb) {
          const gs = [g].concat(B.ring.tiles.filter(q => Math.abs(q.x - g.x) + Math.abs(q.y - g.y) <= 3));
          for (const q of gs) {
            if (Bld.at(q.x, q.y)) continue;
            if (Bld.canPlace('P', 'gate', q.x, q.y).ok) { if (Bld.place('P', 'gate', q.x, q.y, { noAutoAssign: true })) { B.ring.gate = q; rep.gateLaid++; } return; }
          }
          if ((S.res.wood || 0) < 120) return;   // cannot pay for the gate yet: no stone before it
        }
        if (!S.buildings.some(b => b.owner === 'P' && b.key === 'gate')) return;
        let laid = 0;
        for (const q of B.ring.tiles) {
          if (laid >= 4 || (S.res.wood || 0) < 170) break;
          if (q.x === B.ring.gate.x && q.y === B.ring.gate.y) continue;
          if (Bld.at(q.x, q.y)) continue;
          const c = Bld.canPlace('P', 'wall', q.x, q.y);
          if (!c.ok) continue;
          if (Bld.place('P', 'wall', q.x, q.y, { noAutoAssign: true })) { laid++; rep.wallsLaid++; }
        }
      });
      // a player's gate is born shut: open it, or the town is its own prison
      act('gate', () => {
        for (const b of S.buildings) if (b.owner === 'P' && b.key === 'gate' && !(b.construction > 0) && b.raised && Bld.toggleDrawbridge(b)) rep.gateOpened++;
      });
      act('wallup', () => { if (S.day % 5 === 0 && Bld.canUpgradeWalls && Bld.canUpgradeWalls().ok && (S.res.stone || 0) > 400 && Bld.upgradeWalls()) rep.wallUpgrades++; });
    }
    function towers() {
      const t = tc(); if (!t) return;
      act('towers', () => {
        if (S.day < 12 || count('range') < 1) return;
        const want = Math.min(4, 2 + Math.floor(S.day / 70));
        if (count('tower') >= want) return;
        const cost = Bld.effCost ? Bld.effCost('P', 'tower') : CFG.BUILDINGS.tower.levels[0].cost;
        if (!can(cost)) return;
        // inside the line, toward the four corners in turn
        const corners = [[-3, -3], [4, 4], [4, -3], [-3, 4]];
        const [dx, dy] = corners[count('tower') % 4];
        build('tower', siteNear('tower', 0, 2, t.x + dx, t.y + dy));
      });
    }
    function manTowers() {
      act('man', () => {
        if (typeof Lookout === 'undefined') return;
        let manned = 0;
        const free = () => army().filter(u => Lookout.canMan(u) && !u.perch && !u.climb && !(u.task && u.task.type === 'mantower') && !(B.wave && B.wave.ids.has(u.id)));
        for (const b of doneOf('tower')) {
          if (!Lookout.isPost(b, 'P')) continue;
          let room = Lookout.room ? Lookout.room(b) : 2 - Lookout.crew(b).length;
          manned += Lookout.crew(b).length;
          while (room > 0) {
            const list = free().sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
            if (!list.length || !Lookout.order(list[0], b)) break;
            room--;
          }
        }
        if (manned > rep.towersManned) rep.towersManned = manned;
      });
    }
    function defend() {
      act('defend', () => {
        for (const u of army()) {
          if (u.perch || u.climb || (u.task && u.task.type === 'mantower')) continue;
          if (B.wave && B.wave.ids.has(u.id)) continue;
          if (u.id === B.scoutId) continue;
          if (!u.defend && Units.canDefend(u)) Units.setDefend(u, true);
        }
      });
    }

    /* ---------- the aggressor's war ---------- */
    // what the player has SEEN of the rival: the fog's own memory, nothing else
    function knownRival() {
      const out = [];
      for (const k in S.map.seenB) {
        const sb = S.map.seenB[k];
        if (!sb || sb.owner !== 'A') continue;
        const i = +k; out.push({ x: i % CFG.W, y: (i / CFG.W) | 0, key: sb.key });
      }
      return out;
    }
    function scout() {
      act('scout', () => {
        const a = army();
        let s = B.scoutId && Units.get(B.scoutId);
        if (!s) {
          // the fastest soldier at home; never the last guard
          const pool = a.filter(u => !u.perch && !u.climb && !(B.wave && B.wave.ids.has(u.id)));
          if (pool.length < 2) return;
          pool.sort((p, q) => (q.speed || 0) - (p.speed || 0) || p.id - q.id);
          s = pool[0]; B.scoutId = s.id; s.defend = false;
        }
        if ((s.path && (s.pathI || 0) < s.path.length) || s.tUnit || s.tBld) return;
        // walk to the edge of the known world, on the side the rival would be
        const t = tc(); if (!t) return;
        const fl = floodFrom([I(s.x | 0, s.y | 0)], (x, y) => explored(x, y) && Path.passable(x, y, 'P'));
        const gx = CFG.W - 1 - t.x, gy = CFG.H - 1 - t.y;
        let best = null, bs = 1e9;
        const leg = rep.scoutLegs;
        for (const i of fl.list) {
          const x = i % CFG.W, y = (i / CFG.W) | 0;
          let frontier = false;
          for (const [dx, dy] of N4) if (MapGen.onBoard(x + dx, y + dy) && !explored(x + dx, y + dy)) { frontier = true; break; }
          if (!frontier) continue;
          // every third leg looks somewhere else, so one blocked heading never ends the search
          const tx = leg % 3 === 2 ? ((hashStr(S.seed + ':' + leg) % (CFG.W - 4)) + 2) : gx;
          const ty = leg % 3 === 2 ? (((hashStr(S.seed + '|' + leg) >>> 8) % (CFG.H - 4)) + 2) : gy;
          const sc = Math.hypot(x - tx, y - ty);
          if (sc < bs) { bs = sc; best = { x, y }; }
        }
        if (best && Units.moveTo(s, best.x, best.y)) rep.scoutLegs++;
      });
    }
    function war() {
      act('war', () => {
        const known = knownRival();
        if (known.length && rep.firstSeenRivalDay == null) rep.firstSeenRivalDay = S.day;
        const a = army().filter(u => !u.perch && !u.climb);
        if (B.wave) {
          const alive = a.filter(u => B.wave.ids.has(u.id));
          if (alive.length < 3 || S.day - B.wave.day > 45) {
            for (const u of alive) { u.assault = false; const t = tc(); if (t) Units.moveTo(u, t.x + 1, t.y + 3); }
            B.wave = null;
          } else {
            const idle = alive.filter(u => !u.tBld && !u.tUnit && !(u.path && (u.pathI || 0) < u.path.length));
            if (idle.length) orderAttack(idle, known, alive);
            return;
          }
        }
        if (!known.length) { scout(); return; }
        const home = a.filter(u => u.id !== B.scoutId || known.length);
        if (home.length < 8) return;
        // is there a road at all? (terrain only — the walls are the army's business)
        const lead = home[0];
        const fl = floodFrom([I(lead.x | 0, lead.y | 0)], passTerrain);
        const reach = known.some(k => { for (const [dx, dy] of N8) { const x = k.x + dx, y = k.y + dy; if (MapGen.inB(x, y) && fl.seen[I(x, y)]) return true; } return false; });
        if (!reach) { rep.noLandRouteDays++; rep.stayedHome = true; return; }
        B.wave = { ids: new Set(home.map(u => u.id)), day: S.day };
        B.scoutId = 0;
        rep.attacks++; if (rep.firstAttackDay == null) rep.firstAttackDay = S.day;
        orderAttack(home, known, home);
      });
    }
    function orderAttack(units, known, all) {
      if (!known.length) return;
      let cx = 0, cy = 0; for (const u of all) { cx += u.x; cy += u.y; } cx /= all.length; cy /= all.length;
      // ground the army can stand on today, the rival's stone included in the way
      const fl = floodFrom([I(all[0].x | 0, all[0].y | 0)], passFor('P'));
      const near = k => { for (const [dx, dy] of N8) { const x = k.x + dx, y = k.y + dy; if (MapGen.inB(x, y) && fl.seen[I(x, y)]) return true; } return false; };
      const sorted = known.slice().sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy));
      const pick = sorted.find(near) || null;
      if (!pick) { rep.targetNone++; const far = sorted[0]; Units.formationMove(units, far.x, far.y); return; }
      const b = Bld.at(pick.x, pick.y);
      if (b && b.owner === 'A' && Bld.attackable(b)) {
        for (const u of units) { u.defend = false; u.assault = true; Units.orderAttackBuilding(u, b); rep.attackOrders++; }
      } else {
        // the memory is stale (or it is a mine): walk there and look
        Units.formationMove(units, pick.x, pick.y);
      }
    }

    B.daily = function () {
      const t0 = realNow();
      if (!tc() || S.over) return;
      if (style === 'turtle') ringPlan();
      const next = style === 'passive' ? null : yardPlan(style === 'aggressive' && tc().level >= 2);
      econ(false);
      if (style === 'turtle') {
        yards(next);
        const tw = count('tower');
        drill(5, Math.min(9, 2 * Math.max(1, tw) + 1), 0);
        towers(); manTowers(); defend(); walls();
      } else if (style === 'aggressive') {
        yards(next);
        const cap = Math.max(6, Bld.popCap('P') - vills().length);
        drill(Math.ceil(cap * 0.5), Math.ceil(cap * 0.4), Math.ceil(cap * 0.2));
        defend();   // whoever is home holds the town; a wave is taken off Defend when it marches
        // roofs for an army as well as a workforce
        act('warhouse', () => { if (Units.popUsed('P') + 3 >= Bld.popCap('P') && (S.res.wood || 0) > 120 && !S.buildings.some(b => b.owner === 'P' && b.key === 'house' && b.construction > 0)) build('house', siteNear('house', 2, 8)); });
        war();
      }
      rep.razed = (S.stats && S.stats.razed) || 0;
      M.cost.botMs += realNow() - t0;
    };
    B.midday = function () { if (tc() && !S.over) econ(true); };
    B.brief = function () {
      const t = tc(), a = army();
      return 'hall' + (t ? t.level : 'X') + ' v' + vills().length + ' a' + a.length + ' b' + mine().length +
        ' t' + count('tower') + (rep.towersManned ? '(' + a.filter(u => u.perch).length + ' up)' : '') +
        (count('wall') ? ' w' + count('wall') + '/g' + count('gate') : '') +
        (B.wave ? ' WAVE' + B.wave.ids.size : '') + (rep.attacks ? ' atk' + rep.attacks : '') +
        ' ' + [S.res.food | 0, S.res.wood | 0, S.res.stone | 0, S.res.gold | 0].join('/');
    };
    B.final = function () {
      const t = tc(), by = {};
      for (const b of mine()) inc(by, b.key);
      rep.buildings = by; rep.buildingCount = mine().length;
      rep.hall = t ? t.level : 0; rep.villagers = vills().length; rep.army = army().length;
      rep.perched = army().filter(u => u.perch).length;
      rep.res = [S.res.food | 0, S.res.wood | 0, S.res.stone | 0, S.res.gold | 0];
      rep.wallsStanding = count('wall'); rep.gates = count('gate'); rep.towers = count('tower');
      rep.exploredShare = +(S.map.explored.reduce((n, v) => n + (v ? 1 : 0), 0) / (CFG.W * CFG.H)).toFixed(3);
      rep.knownRivalBuildings = knownRival().length;
      rep.card = S.draft && S.draft.hand && S.draft.pickI != null ? S.draft.hand[S.draft.pickI].key : null;
      return rep;
    };
    return B;
  }

  /* ------------------------------------------------------------------ */
  /* 6. THE RUN                                                           */
  /* ------------------------------------------------------------------ */
  /* SEEDS: for each wished world, the first integer seeds from a fixed base
     whose PEEK (the generator's own, MapGen.generate(seed, mode, true)) names
     it. The same code that lays the world answers, so a changed generator
     re-rolls the list by itself. */
  AIH.worlds = function () {
    const out = [];
    for (const lf of Object.keys(MapGen.VARIANTS)) for (const v of MapGen.VARIANTS[lf]) out.push(lf + ':' + v);
    return out;
  };
  AIH.tables = function () {
    return { worlds: AIH.worlds(), modes: Object.keys(CFG.MODES), sizes: Object.keys(CFG.SIZES),
      buildings: Object.keys(CFG.BUILDINGS), units: Object.keys(CFG.UNITS), personas: Object.keys(AI.PERSONAS || {}),
      cards: (typeof Cards !== 'undefined' && Cards.DEFS) ? Object.keys(Cards.DEFS) : [],
      aiFunctions: Object.keys(AI).filter(k => typeof AI[k] === 'function').length, dayMs: CFG.DAY_MS };
  };
  // do the two seats of this world stand on different land masses? (the
  // generator's own map, before anything is built on it)
  function splitSeats(seed, mode) {
    const gen = MapGen.generate(seed, mode), W = CFG.W, H = CFG.H, t = gen.terrain;
    const land = (x, y) => MapGen.onBoard(x, y) && t[y * W + x] !== T.WATER && t[y * W + x] !== T.MOAT && t[y * W + x] !== T.MOUNTAIN;
    const lab = new Int32Array(W * H).fill(-1);
    let id = 0;
    for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
      if (lab[y0 * W + x0] !== -1 || !land(x0, y0)) continue;
      const q = [y0 * W + x0]; lab[q[0]] = id;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], cx = i % W, cy = (i / W) | 0;
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx; if (lab[ni] === -1 && land(nx, ny)) { lab[ni] = id; q.push(ni); } }
      }
      id++;
    }
    const of = p => { for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r + 1; dy++) for (let dx = -r; dx <= r + 1; dx++) { const x = p.x + dx, y = p.y + dy; if (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] >= 0) return lab[y * W + x]; } return -1; };
    return of(gen.spawns.player) !== of(gen.spawns.ai);
  }
  AIH.findSeeds = function (o) {
    AIH.freeze();
    const W0 = CFG.W, H0 = CFG.H, out = {}, base = o.base || 1000, n = o.n || 1, cap = o.cap || 6000;
    for (const size of o.sizes) {
      CFG.W = CFG.H = CFG.SIZES[size];
      for (const mode of o.modes) {
        const want = new Map(o.worlds.map(w => [w, []]));
        let left = o.worlds.length * n;
        for (let s = base; s < base + cap && left > 0; s++) {
          const pk = MapGen.generate(String(s), mode, true);
          const k = pk.landform + ':' + pk.variant, got = want.get(k);
          if (!got || got.length >= n) continue;
          // --geo split|joined: only worlds whose two halls stand on different
          // (or the same) land masses. This one lays the whole map to look.
          if (o.geo && o.geo !== 'any' && (splitSeats(String(s), mode) ? 'split' : 'joined') !== o.geo) continue;
          got.push(String(s)); left--;
        }
        for (const [w, list] of want) out[size + '|' + mode + '|' + w] = list;
      }
    }
    CFG.W = W0; CFG.H = H0;
    return out;
  };

  AIH.start = function (cfg) {
    AIH.cfg = cfg = Object.assign({ step: 0.05, style: 'passive', mode: 'moderate', size: 'medium', rngSeed: 777, trace: false, bake: false }, cfg);
    AIH.freeze();
    AIH.m = newMetrics();
    AIH.running = false;
    AIH._wall0 = realNow();
    // the virtual clock: everything in the game that reads the wall clock
    // (alarms, heal limits, toast holds, work-tick throttles) reads SIM time
    AIH.simMs = 0;
    const base = 1e6;
    performance.now = function () { return base + AIH.simMs; };
    AIH.realNow = realNow;
    /* THE SEEDED STREAM IS THE SIM'S ALONE. The page has timers of its own
       (the title's card screens are prepared a few seconds after the splash
       lifts and build a noise texture off Math.random): one such draw, landing
       at whatever sim day the wall clock happened to reach, re-dealt every
       roll after it — the same world came out two ways depending on how long
       a chunk took. So the seeded stream answers only while the harness is
       running its own synchronous work (AIH._det); anything else gets the
       browser's own. */
    const seeded = lcg(cfg.rngSeed), rnd0 = AIH._rnd0 || (AIH._rnd0 = Math.random);
    Math.random = function () { return AIH._det ? seeded() : rnd0(); };
    AIH._det = true;
    instrument();
    // no picture is kept: with the bake deferred and never run there is no
    // terrain cache, and every incremental painter returns at its first line
    if (!cfg.bake) R.deferBake = true;
    G.newGame(cfg.seed, cfg.mode, cfg.size, cfg.persona || undefined, 'blue');
    R.deferBake = false;
    // the player keeps an origin card, as every real run does (the first dealt)
    let pcard = null;
    try { const c = Cards.pick(cfg.pcard | 0); pcard = c && c.key; } catch (e) { AIH.m.errors.page.push('pick: ' + e.message); }
    Screens._demo = false;
    Screens.show('playing');
    quiet();
    S.paused = false; S.tut = null; G.freeVis = false;
    /* THE MODULE CLOCKS START AT ZERO (CLAUDE.md's module-clock note). These
       live on their modules, not in S, so G.newGame never resets them and the
       title's demo world has been advancing them on real time since the page
       loaded: the acquire cadence, the herds' breath — and G.dragonT, the
       special events' 1.3 s pulse, which the note does not list. Left alone,
       the same seed fired its Long Winter one step earlier or later depending
       on how long the page took to load, and every roll after it re-dealt. */
    Combat.scanT = 0; Units.herdClock = 0; G.dragonT = 0;
    G.visT = 0;
    G.updateVisibility();
    AIH.m.geo = geography();
    AIH.m.rival = { persona: S.ai.persona, card: (S.ai.opening || {}).card || null, bias: (S.ai.opening || {}).bias || null,
      temper: S.draft && S.draft.rival ? S.draft.rival.temper : null, res0: Object.assign({}, S.ai.res),
      opening: S.opening ? S.opening.rival : null };
    AIH.m.world = { seed: String(cfg.seed), mode: S.mode, size: S.sizeKey, W: CFG.W, landform: S.map.landform, variant: S.map.variant,
      name: S.map.worldName, scarce: S.map.scarce, special: S.special || null, wonder: S.wonder || null, style: cfg.style,
      playerCard: pcard, playerOpening: S.opening ? { villagers: S.opening.player.villagers, rich: S.opening.player.rich, poor: S.opening.player.poor } : null };
    AIH.bot = makeBot(cfg.style);
    AIH.running = true;
    AIH._det = false;
    return { world: AIH.m.world, rival: AIH.m.rival, geo: AIH.m.geo };
  };

  AIH.advance = function (days) {
    const cfg = AIH.cfg, M = AIH.m, STEP = cfg.step;
    const perDay = Math.round(CFG.DAY_MS / 1000 / STEP), half = perDay >> 1;
    const t0 = realNow();
    AIH._det = true;
    try {
    for (let d = 0; d < days && !S.over; d++) {
      const day0 = S.day;
      for (let i = 0; i < perDay && !S.over; i++) {
        if (S.paused) { S.paused = false; M.errors.forcedUnpause++; }
        const ts = realNow();
        AIH._in = true;
        S.playtime = (S.playtime || 0) + STEP;
        try { G.simStep(STEP, STEP); } finally { AIH._in = false; }
        AIH.simMs += STEP * 1000;
        M.cost.stepMs += realNow() - ts;
        // a Wonder's held beat is a real-time timer: end it on the spot
        if (G._marvel && G._marvelEnd) G._marvelEnd();
        if (i === half && !S.over) { halfDay(); if (AIH.bot) AIH.bot.midday(); }
      }
      if (S.day === day0 && !S.over) M.errors.page.push('day did not tick at ' + day0);
      halfDay();
      M.dayDigests.push(digest());   // the world's fingerprint, every day: two runs can be compared day for day
      sample();
      if (!S.over && AIH.bot) AIH.bot.daily();
      // --keepalive (an INSTRUMENT switch, off by default and stamped in the result): the player's hall
      // is mended every morning, so the rival can be watched for the whole run instead of until its first win
      if (cfg.keepalive && !S.over) { const t = Bld.tcOf('P'); if (t && t.hp < t.maxhp) { M.errors.keepaliveHeals = (M.errors.keepaliveHeals || 0) + 1; t.hp = t.maxhp; } }
      drain();
    }
    } finally { AIH._det = false; }
    M.cost.wallMs += realNow() - t0;
    M.errors.foreignSteps = AIH.foreignSteps;
    return { day: S.day, over: S.over ? { win: !!S.over.win, cause: S.over.cause || null } : null, ms: Math.round(realNow() - t0) };
  };

  function stats(a) {
    if (!a.length) return { n: 0, mean: 0, p95: 0, max: 0 };
    const s = a.slice().sort((x, y) => x - y);
    const sum = s.reduce((x, y) => x + y, 0);
    return { n: s.length, mean: +(sum / s.length).toFixed(2), p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(2), max: +s[s.length - 1].toFixed(2) };
  }
  function digest() {
    let h = 2166136261 >>> 0;
    const mix = n => { h ^= (n | 0); h = Math.imul(h, 16777619) >>> 0; };
    mix(S.day); mix(S.rngState); mix(S.units.length); mix(S.buildings.length);
    for (const u of S.units) { mix(u.id); mix(Math.round(u.x * 16)); mix(Math.round(u.y * 16)); mix(Math.round(u.hp)); }
    for (const b of S.buildings) { mix(b.id); mix(b.x); mix(b.y); mix(b.level); mix(Math.round(b.hp)); }
    for (const k of ['food', 'wood', 'stone', 'gold']) { mix(Math.round(S.res[k] || 0)); mix(Math.round((S.ai && S.ai.res[k]) || 0)); }
    return (h >>> 0).toString(16);
  }

  AIH.finish = function () {
    const M = AIH.m;
    M.finalDay = S.day;
    M.outcome = S.over ? { state: S.over.win ? 'player_win' : 'rival_win', cause: S.over.cause || null, day: S.day }
                       : { state: 'running', cause: null, day: S.day };
    // the rival's last standing: level histogram of what it has
    const lv = {};
    for (const b of S.buildings) if (b.owner === 'A') { lv[b.key] = lv[b.key] || {}; inc(lv[b.key], 'L' + b.level + (b.construction > 0 ? 's' : '')); }
    M.growth.levelHist = lv;
    M.growth.final = { villagers: S.units.filter(u => u.owner === 'A' && Units.isVillager(u)).length,
      soldiers: S.units.filter(u => u.owner === 'A' && soldier(u)).length,
      hulls: S.units.filter(u => u.owner === 'A' && !landUnit(u)).length,
      hall: (Bld.tcOf('A') || {}).level || 0, buildings: S.buildings.filter(b => b.owner === 'A').length,
      res: S.ai && S.ai.res ? { food: S.ai.res.food | 0, wood: S.ai.res.wood | 0, stone: S.ai.res.stone | 0, gold: S.ai.res.gold | 0 } : null,
      units: S.units.filter(u => u.owner === 'A').reduce((o, u) => { inc(o, u.kind); return o; }, {}) };
    M.walls.wastedShareMean = M.walls.wallDays ? +(M.walls.wastedWallDays / M.walls.wallDays).toFixed(3) : 0;
    try { M.geoEnd = { landRouteNow: geography().landRouteNow, bridgesA: (S.bridges || []).filter(b => b.owner === 'A').length, bridgesP: (S.bridges || []).filter(b => b.owner === 'P').length }; } catch (e) {}
    // the decision points, and the paths nothing ever reached
    M.callsByDecision = {};
    for (const k of DECISIONS) if (k in M.calls) M.callsByDecision[k] = M.calls[k];
    M.neverCalled = Object.keys(M.calls).filter(k => !M.calls[k]).sort();
    const c = M.cost;
    M.cost = { aiDaily: stats(c.aiDailyMs), dayTick: stats(c.dayTickMs), wallMs: Math.round(c.wallMs), stepMs: Math.round(c.stepMs),
      sampleMs: Math.round(c.sampleMs), botMs: Math.round(c.botMs), totalMs: Math.round(realNow() - AIH._wall0),
      msPerDay: S.day > 1 ? +(c.wallMs / (S.day - 1)).toFixed(1) : 0 };
    M.player = AIH.bot ? AIH.bot.final() : null;
    M.digest = digest();
    M.errors.foreignSteps = AIH.foreignSteps;
    // what the chief SAYS it knows how to use (AI.KNOWS) — the node side reports
    // which of these no run ever built or trained
    M.knows = (typeof AI !== 'undefined' && AI.KNOWS) ? {
      buildings: Object.keys(AI.KNOWS.buildings).filter(k => AI.KNOWS.buildings[k].by),
      units: Object.keys(AI.KNOWS.units).filter(k => AI.KNOWS.units[k].by) } : null;
    M.ai = S.ai ? { posture: S.ai.posture, camp: S.ai.camp ? { strat: S.ai.camp.strat, rounds: S.ai.camp.rounds, tried: S.ai.camp.tried } : null,
      memory: S.ai.memory ? Object.keys(S.ai.memory).filter(k => S.ai.memory[k] && typeof S.ai.memory[k] !== 'object').reduce((o, k) => { o[k] = S.ai.memory[k]; return o; }, {}) : null,
      knownB: S.ai.knownB ? Object.keys(S.ai.knownB).length : 0, peace: !!S.peace } : null;
    if (AIH.cfg.trace) M.asciiEnd = AIH.ascii(13, 'A');
    return M;
  };
})();
