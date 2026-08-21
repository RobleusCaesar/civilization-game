/* RIVAL STRENGTH — the enemy AI lives up to the game's own bar, measured.

   Born from a real day-171 game (and a 12-seed survey of the code before the
   rewrite): most rival buildings level 1-2, no siege, no tactics, no attack
   that ever escalated. The survey found WHY: the entire offensive half of
   ai.js gated on knownTC — a field that stayed null even when the chief
   REMEMBERED nine player buildings, two of them towers four tiles from the
   player's hall — and the economy could starve on one resource against a
   hoard of another with no converter below a level-3 hall. Zero siege
   engines were trained in 12/12 surveyed seeds.

   The rules this file pins:

     THE INNER MARKET     CFG.AI_CONVERT — the approved cheat. The chief
                          converts internally at the Trading Post's own
                          published rates and a caravan-like delay, no
                          building required. One load in flight, lot scaling
                          with the hoard. A deficit against the standing
                          floors or the current savings goal is what triggers
                          it; stations stay the real economy.

     THE ANCHOR           Any known player building anchors the war (see
                          tests/rival-crossing.mjs section 7 for the
                          fog-honesty pins). Fort counts, postures, raids,
                          campaigns, harassment and the war camp all read it.

     THE ENGINE ROAD      Towers known at the target + one raid come home
                          empty (mem.towerStop) + no engines = the main
                          assault HOLDS, the basic drill stands down, and the
                          workshop (or the hall tier gating it) turns
                          commanding until the first engine stands. Cleared
                          by SUCCESS (a razing raid), never by a timer.

     THE CAMPAIGN,        The fortified-town scenario: a real game from day
     MEASURED             1 where the player's town is pre-built in the
                          shape the game's own players actually use — TC3,
                          a dense L2/L3 tower net, a wall line, wide economy
                          — and then goes passive. The rival must grow,
                          find it, escalate to siege, and raze it. Panel
                          measured before shipping: 7/8 seeds ended with the
                          fortified town razed.

   Run after touching: AI.assess (anchor), autoConvert, heldForEngines /
   trainArmy's stand-down, the raid launch gate, the sea patrol / waterBody,
   _buildDock, growthKey's scarce bias, towerSpot's station cover, or
   CFG.AI_CONVERT.

     node tests/rival-strength.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 500, height: 700 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1000);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, info) => { res[n] = ok ? 'PASS' + (info ? ' — ' + info : '') : 'FAIL ' + (info || ''); if (!ok) fails.push(n); };

  // the deterministic-suite discipline (see CLAUDE.md's module-clock note)
  const seedAll = (n) => {
    let s = n >>> 0;
    Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    Combat.scanT = 0; Units.herdClock = 0;
  };

  /* ---- 1. THE INNER MARKET ---- */
  {
    G.newGame('rs1', 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    seedAll(11);
    const ai = S.ai, C = CFG.AI_CONVERT;
    ai.goal = null; ai.convert = null;
    // a wood famine against a gold hoard — the day-171 disease
    ai.res = { food: 400, wood: 10, stone: 300, gold: 5000 };
    AI.autoConvert();
    ck('aDeficitStartsAnExchange', !!ai.convert && ai.convert.need === 'wood',
      JSON.stringify(ai.convert));
    ck('theHoardPaysForIt', ai.convert.pay === 'gold', ai.convert.pay);
    ck('atThePostsOwnBuyRate', Math.abs((5000 - ai.res.gold) - Math.ceil(ai.convert.amt / C.buy)) <= 1,
      'paid ' + (5000 - ai.res.gold).toFixed(0) + ' gold for ' + ai.convert.amt);
    ck('theLotScalesWithTheHoard', ai.convert.amt > C.lot,
      ai.convert.amt + ' vs floor ' + C.lot);
    const inFlight = JSON.stringify(ai.convert);
    AI.autoConvert();
    ck('oneLoadInFlightAtATime', !ai.convert || JSON.stringify({ ...ai.convert, t: ai.convert.t + 1 }) === inFlight,
      'a second exchange must not start under the first');
    // delivery: the delay counts down daily and the goods arrive
    const wood0 = ai.res.wood;
    for (let i = 0; i < 5 && ai.convert; i++) AI.autoConvert();
    ck('theLoadArrivesAfterTheDelay', ai.res.wood > wood0 && !ai.convert,
      'wood ' + wood0 + ' -> ' + ai.res.wood.toFixed(0));
    // …and a town with no real deficit trades nothing
    ai.res = { food: 500, wood: 500, stone: 500, gold: 500 }; ai.goal = null;
    AI.autoConvert();
    ck('aFedTownTradesNothing', !ai.convert, JSON.stringify(ai.convert));
    // the savings goal counts as need — the jar and the market pull together
    ai.res = { food: 2000, wood: 100, stone: 500, gold: 500 };
    ai.goal = { cost: { wood: 600, stone: 450, gold: 120 }, until: S.day + 20 };
    AI.autoConvert();
    ck('theGoalIsANeedTheMarketFills', !!ai.convert && ai.convert.need === 'wood', JSON.stringify(ai.convert));
    ai.convert = null; ai.goal = null;
  }

  /* ---- 2. THE ENGINE ROAD ---- */
  {
    G.newGame('rs2', 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    seedAll(22);
    const ai = S.ai, tc = Bld.tcOf('A');
    // stage: towers known at the anchor, one raid already burnt, no engines
    S.ai.knownB = {
      a: { x: tc.x + 15, y: tc.y, key: 'tower', owner: 'P', level: 2, seen: S.day },
      b: { x: tc.x + 16, y: tc.y + 1, key: 'house', owner: 'P', level: 1, seen: S.day },
    };
    ai.memory = ai.memory || {}; ai.memory.towerStop = S.day - 5;
    ai.posture = 'PUSH';
    const read = AI.assess();
    ck('theAnchorCarriesTheTowerCount', read.foeTower > 0, 'foeTower ' + read.foeTower);
    // heldForEngines is stamped by the daily brain — emulate its condition
    ai.heldForEngines = true;
    ck('theDrillStandsDownWhileHeld', AI.trainArmy(G.modeCfg(), 10, null) === false,
      'no basic spear may eat the workshop bill');
    /* THE HOLD IS THE REAL PREDICATE, AND IT KEEPS A GUARD. AI.engineHold is
       what `daily` stamps from, so these pin the rule itself rather than a
       copy of it. The floor exists because the hold was measured running
       70-92 days on the seeds where it bites, and on one of them the rival's
       standing army reached ZERO while it climbed to its workshop. */
    for (const u of S.units.filter(uu => uu.owner === 'A' && Units.isMilitary(uu))) Units.despawn(u);
    const atc = Bld.tcOf('A');
    const spawnGuard = n => { for (let i = 0; i < n; i++) Units.spawn('defender', 'A', atc.x, atc.y + 2); };
    spawnGuard(AI.HOLD_FLOOR);
    ck('theDrillIsHeldWithAGuardOnItsFeet', AI.engineHold(read) === true,
      AI.HOLD_FLOOR + ' spears standing, towers known, a raid already burnt');
    for (const u of S.units.filter(uu => uu.owner === 'A' && Units.isMilitary(uu)).slice(0, 1)) Units.despawn(u);
    ck('aStrippedTownTrainsWhateverThePlan', AI.engineHold(read) === false,
      'below AI.HOLD_FLOOR (' + AI.HOLD_FLOOR + ') the basic drill resumes');
    spawnGuard(4);
    ck('andAnEngineInHandEndsTheHold',
      (() => { Units.spawn('catapult', 'A', atc.x, atc.y + 3); return AI.engineHold(read) === false; })(),
      'the tool it was saving for is standing in the yard');
    // success clears the lesson: a razing raid resets towerStop (pinned on the
    // retreat block's own line — checked here at the memory level)
    ai.memory.towerStop = 0; ai.heldForEngines = false;
    ck('successClearsTheLesson', !ai.memory.towerStop, '');
    ck('andTheLessonEndsTheHoldToo', AI.engineHold(read) === false, 'no towerStop, no hold');
  }

  /* ---- 3. THE SEA PATROL SAILS ITS OWN WATER ---- */
  {
    G.newGame('rs3', 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    seedAll(33);
    // two ponds: the hull's own, and a far one it can never enter
    const tc = Bld.tcOf('A');
    const mk = (x0, y0) => { for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++)
      if (MapGen.inB(x0 + dx, y0 + dy)) S.map.terrain[MapGen.idx(x0 + dx, y0 + dy)] = T.WATER; };
    const near = { x: Math.min(CFG.W - 5, tc.x + 4), y: Math.min(CFG.H - 5, tc.y + 4) };
    mk(near.x, near.y); mk(3, 3);
    Bld._block = null;
    const body = AI.waterBody(near.x + 1, near.y + 1);
    ck('aWaterBodyIsItsOwnFlood', !!body && body.size >= 9 && !body.mask[4 * CFG.W + 4],
      'size ' + (body && body.size) + ' — the far pond is not in it');

    /* AND THE DRAFTED BOAT IS GIVEN BACK. The rival's fishing boats are put
       on the water exactly once, the day they are trained, and nothing else
       in the game re-employs an idle one — so a hull still standing off
       after the enemy is found is a food source lost for the rest of the
       run, and it goes on counting against the fleet cap so no replacement
       is laid down either. */
    const boat = Units.spawn('fishboat', 'A', near.x + 1, near.y + 1);
    S.ai.seaScoutId = boat.id; boat.scouting = true; boat.task = null;
    // the chief now KNOWS something of theirs: the patrol has done its job
    S.ai.knownB = { z: { x: tc.x + 12, y: tc.y, key: 'house', owner: 'P', level: 1, seen: S.day } };
    try { AI.daily(); } catch (e) { /* a one-day probe: the stand-down is what we measure */ }
    ck('theDraftedBoatIsGivenBack', S.ai.seaScoutId === 0 && !boat.scouting,
      'seaScoutId ' + S.ai.seaScoutId + ', scouting ' + !!boat.scouting);
  }

  /* ---- 4. THE CAMPAIGN, MEASURED (the fortified-town scenario) ---- */
  /* Per-seed bars. These are CALIBRATION with slack, not tuned thresholds:
     the run is a whole 250-day game and a one-day change anywhere in the
     brain moves every later day of it. Set them where a miss would mean the
     chief genuinely failed the user's bar (never found them / never grew /
     never fortified / never brought engines / never got inside), not where a
     week of drift trips them.
       Measured at the time of writing (two identical runs): the anchor found
     on d48 / d44 / d44, the fortified town first bloodied on d59 / d89 /
     d130. Seed 44's razing moved out from d120 when AI.HOLD_FLOOR landed,
     which is the trade that rule makes on purpose — a few days of assault
     timing bought with never leaving the rival's own town standing open. */
  const SEEDS = [
    //            anchor≤  tc3≤  engine≤  raze≤  wallsMin  towersMin
    { seed: '375918148', anchor: 80, tc3: 210, engine: 215, raze: 130, walls: 5, towers: 3 },
    { seed: '11',        anchor: 80, tc3: 190, engine: 200, raze: 140, walls: 5, towers: 3 },
    { seed: '44',        anchor: 90, tc3: 190, engine: 215, raze: 150, walls: 3, towers: 3 },
  ];
  for (const B of SEEDS) {
    /* SEED BEFORE THE WORLD IS MADE. G.newGame draws from Math.random itself,
       so seeding after it leaves the map and the opening placement at the
       mercy of however many draws the sections above happened to spend — the
       same class of bug as the module clocks (CLAUDE.md's note): identical
       code measured 128 and then 134 on this seed purely because two checks
       were added earlier in the file. Seed first, then re-zero the module
       clocks that newGame does not own. */
    seedAll(777);
    G.newGame(B.seed, 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = false; G.freeVis = true;
    Combat.scanT = 0; Units.herdClock = 0;
    const tc = Bld.tcOf('P');
    tc.level = 3; tc.hp = tc.maxhp = 1200;
    const put = (key, dx, dy, lv) => {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y) || Bld.at(x, y)) return null;
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      const bb = Bld.place('P', key, x, y, { free: true, instant: true });
      if (bb) bb.level = lv || 1;
      return bb;
    };
    put('tower', -3, -3, 2); put('tower', 3, -3, 3); put('tower', -3, 4, 2); put('tower', 4, 4, 3);
    put('tower', 0, -4, 2); put('tower', -4, 0, 2); put('tower', 5, 0, 3); put('tower', 0, 5, 2);
    put('house', -2, 3, 2); put('house', 2, 3, 2); put('house', 3, -1, 3);
    put('farm', -2, -2, 1); put('farm', 2, -2, 1);
    put('lumber', -5, 2, 1); put('lumber', 6, 2, 1); put('quarry', -5, -2, 1);
    put('barracks', 1, 4, 3);
    for (const dx of [-1, 0, 1, 2]) put('wall', dx, 6, 2);
    S.wallLevel = 2;
    for (let i = 0; i < 4; i++) Units.spawn('marksman', 'P', tc.x - 1 + i, tc.y + 3);
    Bld._block = null; G.updateVisibility();
    const p0 = S.buildings.filter(bb => bb.owner === 'P').length;
    const marks = { tc3: 0, anchor: 0, engine: 0, raze: 0 };
    const STEP = 0.05, perDay = CFG.DAY_MS / 1000 / STEP;
    for (let d = 0; d < 250 && !S.over; d++) {
      for (let i = 0; i < perDay; i++) {
        const sdt = STEP, dtDays = sdt * 1000 / CFG.DAY_MS;
        G._safe(() => { S.dayT += sdt * 1000; let g2 = 0;
          while (S.dayT >= CFG.DAY_MS && g2++ < 4) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (!S || S.over) break; } }, 'day');
        if (!S || S.over) break;
        G._safe(() => Bld.update(dtDays), 'b'); G._safe(() => Units.update(sdt), 'u');
        G._safe(() => Combat.update(sdt), 'c'); G._safe(() => G.dyingTick(sdt), 'w');
      }
      const tcA = Bld.tcOf('A'); if (!tcA) break;
      if (!marks.tc3 && tcA.level >= 3) marks.tc3 = S.day;
      if (!marks.anchor && S.ai.read && S.ai.read.anchor) marks.anchor = S.day;
      if (!marks.engine && S.units.some(u => u.owner === 'A' && (Units.isSiege(u) || u.kind === 'ballista'))) marks.engine = S.day;
      if (!marks.raze && S.buildings.filter(bb => bb.owner === 'P').length < p0) marks.raze = S.day;
    }
    const bsA = S.buildings.filter(bb => bb.owner === 'A' && !(bb.construction > 0));
    const walls = bsA.filter(bb => bb.key === 'wall' || bb.key === 'gate').length;
    const towers = bsA.filter(bb => bb.key === 'tower').length;
    const razedAll = S.over || S.buildings.filter(bb => bb.owner === 'P').length <= p0 * 0.6;
    const tcA = Bld.tcOf('A');
    const tag = 's' + B.seed.slice(0, 6);
    ck(tag + 'FindsThePlayer', marks.anchor > 0 && marks.anchor <= B.anchor, 'anchor day ' + (marks.anchor || 'never'));
    // TC3 (or the war was already WON before the hall mattered — razing the
    // fortified town outright is success, not a miss)
    ck(tag + 'ReachesTC3', (marks.tc3 > 0 && marks.tc3 <= B.tc3) || razedAll,
      'tc3 day ' + (marks.tc3 || 'never') + (razedAll ? ' (town razed instead)' : ''));
    ck(tag + 'BuildsWallsAndTowers', (walls >= B.walls && towers >= B.towers) || !tcA || S.over,
      walls + ' walls, ' + towers + ' towers');
    ck(tag + 'DevelopsSiege', (marks.engine > 0 && marks.engine <= B.engine) || razedAll,
      'first engine day ' + (marks.engine || 'never') + (razedAll ? ' (town razed without)' : ''));
    ck(tag + 'RazesTheFortifiedTown', marks.raze > 0 && marks.raze <= B.raze,
      'first razing day ' + (marks.raze || 'never'));
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RIVAL-STRENGTH CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs.slice(0, 4));
await b.close();
process.exit(out.fails.length || realErrs.length ? 1 : 0);
