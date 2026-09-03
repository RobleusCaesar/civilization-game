/* AMPHIBIOUS ASSAULT CONTRACT — the rival can actually fight across the sea.
   Island starts are a free win unless every step of the crossing genuinely
   executes, so each step is pinned in turn on a hand-built two-island world:

   1. THE READ: with the player across open water — no land route, nothing a
      sapper could breach — probeAssault finds the sea lane (ctx.shore), no
      breach, and flags ctx.seaOnly; the lane tile is exported for the dock.
   2. THE PLAN: TIDEWRACK outfits: its fit clears the commitment threshold
      on an untowered shore, the grind order leads with the fleet, and
      campaignSelect commits to TIDEWRACK.
   3. READINESS: hull capacity counts hulls a launch can USE (idle, loaded
      or empty — never one mid-unload), and troops already aboard an idle
      hull count toward the party (the readiness/launch mismatch that once
      idled a campaign for forty days).
   4. THE CROSSING, END TO END: _launchAmphib loads the party, the hulls
      sail (water domain), beach on the hostile shore, the troops disembark
      with their raid orders live, and the emptied hulls are gone. Proven by
      ticking the real sim, not by inspecting intentions.
   5. THE SCREEN: fighting hulls (fireship/bombard — the kinds that exist;
      the old filter asked for a removed 'warship') escort the landing.
   6. NO STRANDED HOLDS: a rival hull that cannot find the hostile beach
      sails HOME and lands its people there instead of anchoring forever
      with a hold full of soldiers.
   7. THE COAST ANSWERS: a SEEN player fighting hull sets read.navalThreat
      (remembered GUN_MEMORY days, fog-honest), and idle rival fighting
      hulls take the Defend stance while it holds.
   8. THE FLEET LEARNS THE COAST: a beach where a landing died is shunned
      (BEACH_R tiles, BEACH_GRUDGE days, then the grudge fades and the front
      door reopens), and a kill pocket ringed with trees — no room to move
      off the sand — is never picked as a beach at all.
   9. THE LEDGER IS HONEST AT SEA: a launched party (spliced into the hulls'
      cargo, invisible to the raid-task filter) is still on the round's
      books, and a wave annihilated ashore condemns its beach MID-round —
      the very next wave sails for different coast.

   Run after touching AI.probeAssault/_assaultShore/_campScore/_grindFallback/
   campaignSelect/campaignReady/_launchAmphib/secondFront, the naval-threat
   read in assess, Units.disembark/orderBoard/orderUnload, or MapGen's
   islands/sea-reachability work (tests/island-maps.mjs owns generation).

     node tests/amphibious.mjs      # exits non-zero on any regression */
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

  /* ---- the two-island world: the rolled map is flattened to open sea and
     two grass islands are carved around the two halls, a 6-wide strait
     between coasts — unbridgeable (bridgeCrossing needs land on OPPOSITE
     sides of ONE tile) and unmoundable (reclaim reaches 2 tiles per shore).
     Every stray unit is brought home to its own island. */
  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    for (const c of Bld.list('R').filter(z => z.key === 'raidercamp')) Bld.removeToRuin(c);
    S.units = S.units.filter(u => !u.campId);
    const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
    const W = CFG.W, H = CFG.H;
    for (let i = 0; i < W * H; i++) { S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 0; }
    const disc = (cx, cy, r) => {
      for (let y = Math.max(1, cy - r); y <= Math.min(H - 2, cy + r); y++)
        for (let x = Math.max(1, cx - r); x <= Math.min(W - 2, cx + r); x++)
          if (Math.hypot(x - cx, y - cy) <= r) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    };
    disc(atc.x + 1, atc.y + 1, 6);   // coast within BUILD_RANGE of the hall
    disc(ptc.x + 1, ptc.y + 1, 6);
    // remove every non-TC building (docks etc. from opening cards would sit in the sea)
    for (const b2 of S.buildings.slice()) if (b2.key !== 'tc') Bld.removeToRuin(b2);
    S.bridges = [];
    // strays home: any unit standing in the new sea steps onto its own island
    for (const u of S.units) {
      const home = u.owner === 'A' ? atc : ptc;
      if (S.map.terrain[MapGen.idx(u.x | 0, u.y | 0)] === T.WATER || Units.isNaval(u)) {
        const spot = MapGen.findNear(home.x + 1, home.y + 1, 7, (x, y) => Path.passable(x, y, u.owner) && !Bld.at(x, y));
        if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; u.path = null; u.task = null; }
      }
    }
    for (let i = 0; i < S.map.explored.length; i++) { S.map.explored[i] = 1; S.map.seenTerrain[i] = S.map.terrain[i]; }
    Bld._block = null; G.freeVis = true; G.updateVisibility();
    atc.level = 2;   // the dock wants a level-2 hall (reqTC) — the scenario grants it
    // the AI knows where the player lives (the standing test idiom), and is committed
    S.ai.knownB = S.ai.knownB || {};
    S.ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: ptc.level, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    S.ai.posture = 'PUSH';
    S.peace = false;
    return { ptc, atc };
  };
  // an AI dock on its own coast, placed through the real siting rules
  const giveDock = (atc) => {
    let built = null;
    giveDock.why = {};
    for (let r = 2; r <= 9 && !built; r++)
      for (let dy = -r; dy <= r && !built; dy++) for (let dx = -r; dx <= r && !built; dx++) {
        const x = atc.x + dx, y = atc.y + dy;
        if (!MapGen.inB(x, y)) continue;
        const site = Bld.dockSiteOk(x, y, 'A');
        if (!site.ok) { giveDock.why[site.code] = (giveDock.why[site.code] || 0) + 1; continue; }
        const cp = Bld.canPlace('A', 'dock', x, y, { noCost: 1 });
        if (!cp.ok) { giveDock.why[cp.code] = (giveDock.why[cp.code] || 0) + 1; continue; }
        built = Bld.place('A', 'dock', x, y, { free: true, instant: true });
      }
    return built;
  };

  // ---- 1 + 2. the read and the plan ----
  {
    const { ptc, atc } = setup('amph1');
    const read = AI.assess();
    ck('theAnchorIsKnown', !!(read.knownTC || read.anchor), JSON.stringify(read.knownTC));
    const reach = AI.aiLandReach();
    const ctx = AI.probeAssault(read, reach);
    ck('theSeaLaneIsFound', !!(ctx && ctx.shore && ctx.shore.land),
      ctx && ctx.shore ? `land=${JSON.stringify(ctx.shore.land)}` : 'no shore');
    ck('nothingToBreach', !ctx.breach, JSON.stringify(ctx.breach));
    ck('theWarReadsSeaOnly', !!ctx.seaOnly, '');
    ck('theLaneTileIsExportedForTheDock', !!(AI._assaultLane && ctx.shore.lane), '');
    ck('theFleetOutscoresEveryLandPlan',
      AI._campScore('TIDEWRACK', ctx) >= AI.CAMP_OPENING &&
      AI._campScore('TIDEWRACK', ctx) > AI._campScore('MUDLARK', ctx) &&
      AI._campScore('TIDEWRACK', ctx) > AI._campScore('IRONBELLY', ctx),
      'TIDEWRACK=' + AI._campScore('TIDEWRACK', ctx));
    const dk = giveDock(atc);
    ck('theGrindLeadsWithTheFleet',
      !!dk && AI._grindFallback(ctx, atc, null, []) === 'TIDEWRACK',
      dk ? '' : 'dock refused: ' + JSON.stringify(giveDock.why));
    AI.campaignSelect(read);
    ck('theCampaignCommitsToTidewrack', S.ai.camp && S.ai.camp.strat === 'TIDEWRACK',
      JSON.stringify(S.ai.camp && S.ai.camp.strat));
  }

  // ---- 3. readiness counts what a launch can use ----
  {
    const { atc } = setup('amph2');
    giveDock(atc);
    // five foot on the island + one idle hull holding three more = party of 8
    for (let i = 0; i < 5; i++) Units.spawn('defender', 'A', atc.x + 2, atc.y + 2);
    const mkHull = () => {
      const spot = MapGen.findNear(atc.x, atc.y, 10, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y));
      const tr = Units.spawn('transport', 'A', spot.x, spot.y); tr.cargo = [];
      return tr;
    };
    const idleLoaded = mkHull();
    for (let i = 0; i < 3; i++) {
      const u = Units.spawn('defender', 'A', atc.x + 2, atc.y + 2);
      S.units.splice(S.units.indexOf(u), 1); idleLoaded.cargo.push(u);
    }
    const busy = mkHull(); busy.task = { type: 'unload', x: busy.x | 0, y: busy.y | 0 };
    S.ai.camp = { strat: 'TIDEWRACK', since: S.day, rounds: 0, tried: [], surge: 0 };
    ck('readinessCountsIdleHullsOnly', AI.campaignReady('TIDEWRACK') === true,
      'cap should be 2 idle hulls × 5 = 10 ≥ 5; party 5 foot + 3 aboard ≥ 5');
    busy.task = null;
    idleLoaded.cargo = [];
    S.units.length = S.units.length;   // (no-op; clarity)
    // strip the foot below the bar: readiness must fail honestly
    for (const u of S.units.slice()) if (u.owner === 'A' && u.kind === 'defender') S.units.splice(S.units.indexOf(u), 1);
    ck('anEmptyIslandIsNotReady', AI.campaignReady('TIDEWRACK') === false, '');
  }

  // ---- 4 + 5. the crossing, end to end, in the real sim ----
  {
    const { ptc, atc } = setup('amph3');
    giveDock(atc);
    for (let i = 0; i < 6; i++) Units.spawn('defender', 'A', atc.x + 2, atc.y + 2);
    const spot = MapGen.findNear(atc.x, atc.y, 10, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y));
    const tr = Units.spawn('transport', 'A', spot.x, spot.y); tr.cargo = [];
    const fs = Units.spawn('fireship', 'A', spot.x, spot.y);
    const read = AI.assess();
    const before = Units.count('A', u => u.kind === 'defender');
    ck('theLaunchSails', AI._launchAmphib(read) === true, '');
    ck('thePartyIsAboard', tr.cargo.length >= 3 && Units.count('A', u => u.kind === 'defender') < before,
      tr.cargo.length + ' aboard');
    ck('theHullHasItsLandingOrder', tr.task && tr.task.type === 'unload', JSON.stringify(tr.task));
    ck('theScreenIsMadeOfRealHulls', fs.task && fs.task.type === 'move', JSON.stringify(fs.task));
    const t = run(90, () => Units.count('A', u => u.kind === 'defender' &&
      Math.hypot(u.x - (ptc.x + 1), u.y - (ptc.y + 1)) < 12) >= 3);
    const ashore = S.units.filter(u => u.owner === 'A' && u.kind === 'defender' &&
      Math.hypot(u.x - (ptc.x + 1), u.y - (ptc.y + 1)) < 12);
    ck('theTroopsCrossAndLand', ashore.length >= 3, `${ashore.length} ashore on the player island after ${t}s`);
    ck('theLandedPartyFights', ashore.some(u => (u.task && u.task.type === 'raid') || u.tBld || u.tUnit || u.assault),
      'tasks: ' + ashore.map(u => u.task && u.task.type).join(','));
    ck('theEmptiedHullIsGone', !S.units.includes(tr), '');
  }

  // ---- 6. a hull that cannot find the beach brings its people home ----
  {
    const { atc } = setup('amph4');
    // an unreachable target: a one-tile islet ringed by its own mountain wall
    // gives the hull NO hostile shore to beach on anywhere near its order
    const tr0 = MapGen.findNear(atc.x, atc.y, 10, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y));
    const tr = Units.spawn('transport', 'A', tr0.x, tr0.y); tr.cargo = [];
    for (let i = 0; i < 3; i++) {
      const u = Units.spawn('defender', 'A', atc.x + 2, atc.y + 2);
      S.units.splice(S.units.indexOf(u), 1); tr.cargo.push(u);
    }
    // sail it to the far open sea and demand a landing there, with the tries
    // budget already spent — the homing branch is what must fire
    const W = CFG.W;
    tr.x = 3.5; tr.y = 3.5;
    tr.task = { type: 'unload', x: 3, y: 3, unloadTries: 10 };
    Units.disembark(tr);
    ck('theStrandedHullTurnsForHome', tr.task && tr.task.type === 'unload' && tr.homed === 1 &&
      Math.hypot(tr.task.x - (atc.x + 1), tr.task.y - (atc.y + 1)) < 26,
      JSON.stringify(tr.task));
    const t = run(90, () => tr.cargo.length === 0 || !S.units.includes(tr));
    ck('andItsPeopleComeAshoreAtHome',
      Units.count('A', u => u.kind === 'defender') === 3, `after ${t}s, cargo=${tr.cargo.length}`);
  }

  // ---- 7. the coast answers a seen sail ----
  {
    const { atc } = setup('amph5');
    giveDock(atc);
    const w = MapGen.findNear(atc.x, atc.y, 8, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y));
    const own = Units.spawn('fireship', 'A', w.x, w.y);
    let read = AI.assess();
    ck('aQuietSeaIsNoThreat', !read.navalThreat, '');
    const foe = Units.spawn('fireship', 'P', w.x + 1, w.y);
    read = AI.assess();
    ck('aSeenSailIsAThreat', read.navalThreat === true, 'navalSeen=' + read.navalSeen);
    // the memory holds after the sail ducks away, then fades
    S.units.splice(S.units.indexOf(foe), 1);
    S.day += 5; read = AI.assess();
    ck('theSightingIsRemembered', read.navalThreat === true, '');
    S.day += AI.GUN_MEMORY + 1; read = AI.assess();
    ck('andFadesLikeAGunDoes', read.navalThreat === false, '');
    // fishing boats are dinner, not danger
    Units.spawn('fishboat', 'P', w.x + 1, w.y);
    read = AI.assess();
    ck('aFishingBoatIsNotAnInvasion', !read.navalThreat, '');
  }

  // ---- 8. the fleet learns the coast ----
  {
    const { ptc } = setup('amph6');
    const read = AI.assess();
    const first = AI.probeAssault(read).shore.land;
    ck('theFrontDoorHasRoom', AI._beachRoom(first.x, first.y) >= AI.BEACH_ROOM,
      'room=' + AI._beachRoom(first.x, first.y));
    // the landing died there: the next read must pick a different stretch of coast
    AI._noteBeach({ x: first.x, y: first.y });
    const second = AI.probeAssault(read).shore.land;
    const moved = Math.max(Math.abs(second.x - first.x), Math.abs(second.y - first.y));
    ck('aBurnedBeachIsShunned', moved > AI.BEACH_R,
      `first=${first.x},${first.y} second=${second.x},${second.y} moved=${moved}`);
    // …and the grudge fades, so the old front door reopens
    S.ai.memory.beaches[0].day = S.day - (AI.BEACH_GRUDGE + 1);
    const third = AI.probeAssault(read).shore.land;
    ck('theGrudgeFades', Math.max(Math.abs(third.x - first.x), Math.abs(third.y - first.y)) <= AI.BEACH_R,
      JSON.stringify(third));
    // wall the front door with trees: a kill pocket floods to nothing and the
    // read skips it without ever having to lose a wave there
    S.ai.memory.beaches = [];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = first.x + ox, y = first.y + oy, i = MapGen.idx(x, y);
      if (MapGen.inB(x, y) && S.map.terrain[i] !== T.WATER) S.map.terrain[i] = T.FOREST;
    }
    ck('aTreePocketHasNoRoom', AI._beachRoom(first.x, first.y) < AI.BEACH_ROOM,
      'room=' + AI._beachRoom(first.x, first.y));
    const fourth = AI.probeAssault(read).shore.land;
    ck('theFleetSkipsThePocket', !(fourth.x === first.x && fourth.y === first.y),
      JSON.stringify(fourth));
  }

  // ---- 9. the ledger is honest at sea ----
  {
    const { atc } = setup('amph7');
    giveDock(atc);
    for (let i = 0; i < 6; i++) Units.spawn('defender', 'A', atc.x + 2, atc.y + 2);
    const spot = MapGen.findNear(atc.x, atc.y, 10, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y));
    const tr = Units.spawn('transport', 'A', spot.x, spot.y); tr.cargo = [];
    S.ai.camp = { strat: 'TIDEWRACK', since: S.day, rounds: 0, tried: [], surge: 0, dry: 0 };
    S.ai.raidCd = 0;
    AI.campaignLaunch(AI.assess(), G.modeCfg());
    const camp = S.ai.camp;
    ck('theSeaPartyIsOnTheBooks', (camp.partyN || 0) >= 3 && !!camp.beach,
      `partyN=${camp.partyN} beach=${JSON.stringify(camp.beach)}`);
    // fake the wave annihilated ashore: empty holds, ids no living unit answers
    // to — the tripwire must condemn the beach before the next wave sails
    for (const u of S.units) if (u.owner === 'A' && Units.isTransport(u)) u.cargo = [];
    camp.inIds = []; camp.roundBaseCore = AI._foeCoreCount();
    const beach = { x: camp.beach.x, y: camp.beach.y };
    S.ai.raidCd = 0;
    AI.campaignLaunch(AI.assess(), G.modeCfg());
    ck('aWipedWaveCondemnsTheBeachAtOnce', AI._beachBurned(beach.x, beach.y),
      JSON.stringify((S.ai.memory && S.ai.memory.beaches) || []));
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
const hard = errs.filter(e => !/supabase|fetch|TUNNEL|net::|429/.test(e));
if (hard.length) console.log('PAGE ERRORS:', hard.slice(0, 4));
await b.close();
if (out.fails.length || hard.length) { console.log('FAILURES: ' + (out.fails.join(', ') || 'pageerrors')); process.exit(1); }
console.log('ALL AMPHIBIOUS CHECKS PASS');
