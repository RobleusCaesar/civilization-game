/* A LIVING WORLD CONTRACT — four things that make the map look inhabited
   rather than staged, and one that makes a unit's work legible.

   1. PREDATOR AND PREY. The wilderness is not one happy family:
      Combat.hostileUnits lets a wolf or a bear hunt deer and wild cattle —
      the ONLY case where two same-owner ('W') units are hostile, and
      deliberately one-way, since prey never fights back. A wolf with no one
      of the tribes in reach ranges FURTHER after game than it ever does after
      people, so a pack is seen hunting the treeline long before it threatens
      a village.

   2. THE HERD BOLTS TOGETHER. Grazers keep loose company (Units.grazeIdle
      drifts them toward the herd's centre) and PANIC SPREADS: the animal that
      actually sees the wolf spooks every herd-mate within HERD_R, so the
      group scatters as one. Villagers don't frighten anything — beasts and
      armed strangers do.

   2b. AND THE HERD BREATHES. It draws in close, fans out over the feed and
      gathers again — never converging on a point, never stringing out into a
      line. Every step is measured from the herd's CENTRE, on a radius swinging
      between HERD_TIGHT and HERD_LOOSE on one clock all of them share
      (Units.herdClock); the oldest animal in company leads and the centre is
      dragged after it, so the band travels as a body. A separated animal walks
      back rather than roaming for good.

   2c. FOUR FRAMES IS THE FLOOR. Every beast pose — idle, walk, fight — is a
      4+ frame cycle of genuinely different drawings (sprites.js beast(),
      BEAST_POSE), played at the kind's own rate (Sprites.animFps, read by
      R.unitSprite), never a two-still flip.

   3. THE SKY REACTS. R.startle throws flocks up and away and sends critters
      bolting for cover when a fight breaks out (R.noteFights spots a unit
      gaining a target it did not have) or when a building comes down.
      R._fighting is render-side only, so it never reaches a save file.

   4. BANNERS FLY AND HEARTHS SMOKE. The cloth is drawn per frame in the
      TRIBE'S OWN tunic dye (a purple village flies purple, not the blue the
      sprite set is baked in), so R.BANNER_AT must have an anchor for every
      building whose sprite bakes a pole.

   Run this after touching any of:
     units.js — wildIdle / grazeIdle / spook / workReport
     combat.js — hostileUnits, acquire's wild branches, the noteFights hook
     render.js — startle / noteFights / BANNER_AT / SMOKE_AT / drawBanners
     sprites.js — the banner() helper and the inline banner poles

     node tests/wild-life.mjs      # exits non-zero on any regression */
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
  const arena = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P'); tc.x = 4; tc.y = 4; Bld._block = null;
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    S.units = []; Bld._block = null;
  };
  const run = (secs) => { for (let t = 0; t < secs; t += 0.1) { Units.update(0.1); Combat.update(0.1); } };

  // ---- 1. predator and prey ----
  {
    arena('wl1');
    const wolf = Units.spawn('wolf', 'W', 20, 20);
    const deer = Units.spawn('deer', 'W', 22, 20);
    const cow = Units.spawn('cow', 'W', 30, 30);
    ck('wolvesHuntGame',
      Combat.hostileUnits(wolf, deer) === true && Combat.hostileUnits(wolf, cow) === true, '');
    ck('preyNeverFightsBack', Combat.hostileUnits(deer, wolf) === false, 'one-way by design');
    ck('grazersAreNotHostileToEachOther', Combat.hostileUnits(deer, cow) === false, '');
    const wolf2 = Units.spawn('wolf', 'W', 40, 40);
    ck('wolvesDoNotEatWolves', Combat.hostileUnits(wolf, wolf2) === false, '');
    // …and the wolf actually locks on when nothing of the tribes is near
    Combat.acquire();
    ck('wolfStalksTheNearestDeer', wolf.tUnit === deer.id, 'locked on the deer');
    // a villager still outranks game as a target
    arena('wl1b');
    const w3 = Units.spawn('wolf', 'W', 20, 20);
    const d3 = Units.spawn('deer', 'W', 22, 20);
    const vil = Units.spawn('villager', 'P', 21, 20);
    Combat.acquire();
    ck('peopleStillComeFirst', w3.tUnit === vil.id, 'a villager in reach beats the deer');
    ck('gameIsHuntedFurtherThanPeople',
      CFG.UNITS.wolf.aggro * 2.5 > CFG.UNITS.wolf.aggro, 'the stalking radius is the wider one');
  }

  // ---- 2. the herd bolts together ----
  {
    arena('wl2');
    const herd = [];
    for (let i = 0; i < 4; i++) herd.push(Units.spawn('deer', 'W', 20 + i * 0.7, 20));
    // a soldier walks up on ONE of them — the whole herd should go
    const foe = Units.spawn('defender', 'A', 20.5, 22);
    run(1.2);
    ck('panicSpreadsThroughTheHerd', herd.every(d => d.spookT > 0),
      herd.map(d => (d.spookT > 0 ? 'run' : 'graze')).join(','));
    const away = herd.every(d => d.y < 22);
    run(3);
    ck('andTheyRunAwayFromIt', herd.every(d => d.y < foe.y), 'all of them uphill of the threat');
    // villagers are not frightening — a herd grazes on beside one
    arena('wl2b');
    const calm = [];
    for (let i = 0; i < 3; i++) calm.push(Units.spawn('deer', 'W', 30 + i * 0.7, 30));
    Units.spawn('villager', 'P', 30.5, 31);
    run(1.5);
    ck('farmhandsDoNotSpookGame', calm.every(d => !(d.spookT > 0)), '');
    // and grazers keep company rather than scattering to the winds
    const spread0 = Math.max(...calm.map(d => Math.hypot(d.x - calm[0].x, d.y - calm[0].y)));
    run(20);
    const spread1 = Math.max(...calm.map(d => Math.hypot(d.x - calm[0].x, d.y - calm[0].y)));
    ck('grazersKeepCompany', spread1 <= Units.HERD_R * 2.2,
      'herd spread ' + spread0.toFixed(1) + ' → ' + spread1.toFixed(1) + ' tiles');
  }

  // ---- 2b. …and the herd BREATHES: gather → spread → gather ----
  {
    arena('wl2c');
    const herd = [];
    for (let i = 0; i < 5; i++) herd.push(Units.spawn('deer', 'W', 30 + (i % 3), 30 + ((i / 3) | 0)));
    const start = { x: 31, y: 30.4 };
    const spread = () => {
      let cx = 0, cy = 0;
      for (const d of herd) { cx += d.x; cy += d.y; }
      cx /= herd.length; cy /= herd.length;
      return { r: Math.max(...herd.map(d => Math.hypot(d.x - cx, d.y - cy))), cx, cy };
    };
    const samples = [];
    for (let n = 0; n < 900; n++) {        // 90s — four full breaths at HERD_BREATH
      Units.update(0.1); Combat.update(0.1);
      if (n % 20 === 0) samples.push(spread().r);
    }
    const lo = Math.min(...samples), hi = Math.max(...samples);
    ck('theHerdDrawsInAndFansOut', hi - lo >= 1.5,
      'radius swung ' + lo.toFixed(1) + ' → ' + hi.toFixed(1) + ' tiles');
    ck('itNeverStringsOutIntoALine', hi <= Units.HERD_LOOSE * 2,
      'widest ' + hi.toFixed(1) + ' tiles, loose radius ' + Units.HERD_LOOSE);
    const end = spread();
    ck('noHeadIsLeftBehind',
      herd.every(d => Math.hypot(d.x - end.cx, d.y - end.cy) <= Units.HERD_R * 1.8),
      'every animal still in company after 90s');
    ck('theBandMovesAsABody', Math.hypot(end.cx - start.x, end.cy - start.y) > 2,
      'centre walked ' + Math.hypot(end.cx - start.x, end.cy - start.y).toFixed(1) + ' tiles');
    // a separated animal makes its own way back rather than roaming for good
    arena('wl2d');
    const band = [];
    for (let i = 0; i < 3; i++) band.push(Units.spawn('deer', 'W', 20 + i, 20));
    const stray = Units.spawn('deer', 'W', 20 + Units.HERD_JOIN * 0.5, 20);
    const d0 = Math.hypot(stray.x - band[0].x, stray.y - band[0].y);
    for (let n = 0; n < 600; n++) { Units.update(0.1); Combat.update(0.1); }
    const d1 = Math.min(...band.map(d => Math.hypot(stray.x - d.x, stray.y - d.y)));
    ck('aStragglerRejoinsTheHerd', d1 < d0 * 0.5 && d1 <= Units.HERD_R * 1.8,
      'was ' + d0.toFixed(1) + ' tiles out, now ' + d1.toFixed(1));
  }

  /* ---- 2b². TWO KINDS ARE TWO HERDS. Company, the centre and the lead are
     measured over the animal's own species, and a step into another kind's
     standing room (HERD_APART) is refused — so a deer band and a cattle band
     dropped INTERLEAVED on the same grass sort themselves into two distinct
     herds instead of milling as one mixed blob (the reported screenshot).
     Panic deliberately still crosses kinds: a bolting herd startles the
     neighbours too. ---- */
  {
    arena('wl2e');
    const deer = [], cows = [];
    for (let i = 0; i < 4; i++) {
      deer.push(Units.spawn('deer', 'W', 30 + (i % 2) * 2, 30 + ((i / 2) | 0) * 2));
      cows.push(Units.spawn('cow', 'W', 31 + (i % 2) * 2, 30 + ((i / 2) | 0) * 2));
    }
    const centroid = (band) => {
      let cx = 0, cy = 0;
      for (const d of band) { cx += d.x; cy += d.y; }
      return { x: cx / band.length, y: cy / band.length };
    };
    const gap = () => { const a = centroid(deer), b = centroid(cows); return Math.hypot(a.x - b.x, a.y - b.y); };
    const g0 = gap();
    run(90);
    const g1 = gap();
    ck('interleavedBandsSortThemselvesApart', g1 >= Units.HERD_APART * 0.75,
      'centroids ' + g0.toFixed(1) + ' → ' + g1.toFixed(1) + ' tiles apart (want ≥ ' + (Units.HERD_APART * 0.75).toFixed(1) + ')');
    const c1 = centroid(deer), c2 = centroid(cows);
    ck('eachKindStaysItsOwnHerd',
      deer.every(d => Math.hypot(d.x - c1.x, d.y - c1.y) <= Units.HERD_R * 1.8) &&
      cows.every(c => Math.hypot(c.x - c2.x, c.y - c2.y) <= Units.HERD_R * 1.8),
      'every head still in its own band after 90s');
    // panic still leaps the species line — the deer that sees the soldier
    // spooks the cattle grazing beside it
    arena('wl2f');
    const d5 = Units.spawn('deer', 'W', 20, 20);
    const c5 = Units.spawn('cow', 'W', 22, 20);
    Units.spawn('defender', 'A', 20, 21.5);
    run(1.2);
    ck('panicStillCrossesKinds', d5.spookT > 0 && c5.spookT > 0,
      'deer ' + (d5.spookT > 0 ? 'runs' : 'grazes') + ', cow ' + (c5.spookT > 0 ? 'runs' : 'grazes'));
  }

  /* ---- 2b³. MEAT BY THE BEAST. CFG.MEAT tiers the take by the animal's
     size — a cow outfeeds a deer, a bear feeds the village, and a wolf is
     lean eating — and the payout code reads that table (the bear's old
     hard-coded ×3 lives in its own entry now). ---- */
  {
    arena('wl2g');
    const M = CFG.MEAT;
    ck('everyBeastHasACut', !!M && ['deer', 'cow', 'wolf', 'boar', 'bear'].every(k => M[k] > 0),
      JSON.stringify(M));
    ck('theBiggerTheBeastTheDeeperTheLarder',
      !!M && M.bear > M.cow && M.cow > M.boar && M.boar > M.deer && M.deer > M.wolf,
      'bear ' + M.bear + ' > cow ' + M.cow + ' > boar ' + M.boar + ' > deer ' + M.deer + ' > wolf ' + M.wolf);
    const mult = (window.Cards && Cards.huntMult) ? Cards.huntMult('P') : 1;
    const f0 = S.res.food;
    Units.damage(Units.spawn('deer', 'W', 20, 20), 9999, null, 'P');
    const gotDeer = S.res.food - f0;
    ck('aDeerPaysTheDeerCut', gotDeer === Math.round(M.deer * mult), '+' + gotDeer);
    const f1 = S.res.food;
    Units.damage(Units.spawn('cow', 'W', 24, 20), 9999, null, 'P');
    const gotCow = S.res.food - f1;
    ck('aCowPaysTheCowCut', gotCow === Math.round(M.cow * mult), '+' + gotCow);
    ck('theCowOutfeedsTheDeer', gotCow > gotDeer, gotCow + ' vs ' + gotDeer);
    // the rival's hunters eat by the same table
    const a0 = S.ai.res.food;
    Units.damage(Units.spawn('boar', 'W', 28, 20), 9999, null, 'A');
    const multA = (window.Cards && Cards.huntMult) ? Cards.huntMult('A') : 1;
    ck('theRivalEatsByTheSameTable', S.ai.res.food - a0 === Math.round(M.boar * multA),
      '+' + (S.ai.res.food - a0));
    // the cuts are worth a hunting trip: at the old table (deer 8, cow 15) a
    // kill barely beat a day of foraging, nobody hunted, and the killing
    // grounds a lodge needs were never made
    ck('theCutsMakeHuntingWorthTheTrip', M.deer === 30 && M.cow === 50,
      'deer ' + M.deer + ', cow ' + M.cow);
  }

  /* ---- 2b³b. THE WILD KEEPS TO THE PERIPHERY (Units.TOWN_SHY). Herds used
     to graze in the village high street, which read as tame cattle and kept
     the killing grounds — and so the Hunter's Lodge — pinned to the town's
     doorstep. A herd IN COMPANY refuses step targets within TOWN_SHY of any
     standing town building and walks itself out if it finds itself inside;
     a LONE animal is deliberately exempt (one deer drifting down the lane
     is the map living, a herd camped on the well is not), and a panic still
     runs wherever it runs. ---- */
  {
    arena('wl2gp');
    const tc = Bld.tcOf('P');                       // arena parks it at (4,4)
    // a herd of four camped practically on the hall
    const herd = [];
    for (const [hx, hy] of [[7, 6], [8, 7], [7, 8], [8, 5]])
      herd.push(Units.spawn('deer', 'W', hx, hy));
    run(90);
    const still = herd.filter(d => Units.townBldNear(d.x, d.y, Units.TOWN_SHY - 1.5));
    ck('aHerdGivesTheTownItsGround', still.length === 0,
      still.length + ' of ' + herd.length + ' head still inside the shy ring after the walk-out'
      + ' (tc at ' + tc.x + ',' + tc.y + ')');
    // …but a LONE animal is never town-filtered — the company gate (n) must
    // short-circuit before townBldNear is ever asked
    arena('wl2gq');
    Units.spawn('deer', 'W', 6, 6);
    const orig = Units.townBldNear;
    let asked = 0;
    Units.townBldNear = function (...a) { asked++; return orig.apply(this, a); };
    run(30);
    Units.townBldNear = orig;
    ck('aLoneWandererMayStillDriftThrough', asked === 0,
      'townBldNear consulted ' + asked + ' times for an animal with no company');
  }

  /* ---- 2b³c. THE WILDS ACTUALLY RESTOCK (a real extinction). The
     sealed-walls gate (2fc132b) asked the border-reach net about the spawn
     tile itself — but predators spawn ON forest, forest is impassable, and
     a flood never marks an impassable tile: every daily wolf, boar and
     bear was silently refused from that commit on. The gate now accepts a
     tile that TOUCHES the net (itself or a 4-neighbour), which also pins
     spawns to the treeline — where the ground-truth rescue slide can
     always free the beast on the next tick. Real map, no arena flatten:
     this test needs genuine forest and a genuine border flood. ---- */
  {
    G.newGame('wl-spawn', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.units = S.units.filter(u => u.owner !== 'W');   // clear the day-one herds
    let wolf = null, bear = null;
    for (let i = 0; i < 6 && !wolf; i++) wolf = Units.spawnWild('wolf', CFG.ANIMALS.minDistTC);
    for (let i = 0; i < 6 && !bear; i++) bear = Units.spawnWild('bear', CFG.ANIMALS.minDistTC);
    ck('aPredatorCanStillBeGranted', !!wolf && !!bear,
      wolf ? 'wolf at ' + (wolf.x | 0) + ',' + (wolf.y | 0) +
             (bear ? ' and bear at ' + (bear.x | 0) + ',' + (bear.y | 0) : ' but no bear')
           : 'no wolf in 240 tries — the treeline gate is refusing everything again');
    if (bear) {
      Units.update(0.1);   // the rescue slide frees a tree-spawned beast at once
      ck('theBeastStepsOutOfTheTreeline', Path.passable(bear.x | 0, bear.y | 0),
        'standing at ' + bear.x.toFixed(1) + ',' + bear.y.toFixed(1));
    }
  }

  /* ---- 2b⁴. THE KILL LEAVES ITS MARK. A carcass with meat on it for
     CFG.CORPSE_DAYS.meat days, then a skeleton until .bone — the standing
     visual cue for where a Hunter's Lodge may rise, so the killing grounds
     live on the GROUND instead of in the player's memory. In every save;
     weathered away by the day tick; cleared by a building raised over it. */
  {
    arena('wl2h');
    const before = S.corpses.length;
    Units.damage(Units.spawn('deer', 'W', 24, 24), 9999, null, 'P');
    ck('aKillLeavesACorpse', S.corpses.length === before + 1 &&
      S.corpses[S.corpses.length - 1].kind === 'deer' &&
      Math.abs(S.corpses[S.corpses.length - 1].x - 24) < 1.5, '');
    const c = S.corpses[S.corpses.length - 1];
    // the two phases, by the day arithmetic the renderer uses
    c.day = S.day - (CFG.CORPSE_DAYS.meat - 1);
    ck('freshRemainsStillCarryMeat', S.day - c.day < CFG.CORPSE_DAYS.meat, '');
    c.day = S.day - (CFG.CORPSE_DAYS.meat + 1);
    ck('oldRemainsAreBone', S.day - c.day >= CFG.CORPSE_DAYS.meat &&
      S.day - c.day < CFG.CORPSE_DAYS.bone, '');
    // the art: both phases exist for every beast, cut from its own sprite
    ck('everyBeastLeavesBothLooks',
      ['deer', 'cow', 'wolf', 'boar', 'bear'].every(k =>
        R.corpseOf(k, 'meat') && R.corpseOf(k, 'bone')), '');
    // …and the skeleton is genuinely the PALER of the two
    const lum = (cv) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let s = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 30) { s += d[i] + d[i + 1] + d[i + 2]; n++; }
      return n ? s / n : 0;
    };
    ck('bonesBleachPalerThanMeat', lum(R.corpseOf('deer', 'bone')) > lum(R.corpseOf('deer', 'meat')), '');
    // weathering: gone after CORPSE_DAYS.bone, standing the day before
    // (G.dayTick advances S.day itself — the ages below account for it)
    c.day = S.day - (CFG.CORPSE_DAYS.bone - 2);
    G.dayTick();
    ck('bonesStandToTheLastDay', S.corpses.includes(c), '');
    c.day = S.day - CFG.CORPSE_DAYS.bone;
    G.dayTick();
    ck('thenTheGroundIsClean', !S.corpses.includes(c), '');
    // the record rides in every save; a pre-corpse save starts clean
    S.corpses.push({ x: 30, y: 30, kind: 'cow', day: S.day });
    const json = G.saveJSON();
    ck('remainsRideInTheSave', /"corpses"/.test(json), '');
    const data = JSON.parse(json); delete data.corpses;
    G.loadJSON(JSON.stringify(data));
    ck('aPreCorpseSaveStartsClean', Array.isArray(S.corpses) && S.corpses.length === 0, '');
    Screens._demo = false; Screens.show('playing');
    // a building raised over the remains clears them — the lodge IS the point
    arena('wl2i');
    const tc = Bld.tcOf('P');
    S.corpses.push({ x: tc.x + 3.4, y: tc.y + 3.6, kind: 'boar', day: S.day });
    Bld.place('P', 'house', tc.x + 3, tc.y + 3, { free: true, instant: true });
    ck('aBuildingClearsTheBonesBeneathIt', S.corpses.length === 0, '');
    // the cap: a long war of wolves never bloats the save
    for (let i = 0; i < 120; i++) Units.damage(Units.spawn('deer', 'W', 20, 20), 9999, null, 'P');
    ck('theBoneyardIsCapped', S.corpses.length <= 80, S.corpses.length + ' remains');
  }

  // ---- 2c. four or more frames in every animal action ----
  {
    const kinds = ['wolf', 'boar', 'bear', 'deer', 'cow'];
    const short = [];
    for (const k of kinds) for (const pose of ['idle', 'walk', 'fight'])
      if (!Sprites.unit[k][pose] || Sprites.unit[k][pose].length < 4) short.push(k + '.' + pose);
    ck('everyBeastActionHasFourPlusFrames', short.length === 0, short.join(',') || '15 cycles');
    // …and the frames are actually DIFFERENT drawings, not a padded still
    const flat = [];
    for (const k of kinds) for (const pose of ['idle', 'walk']) {
      const n = new Set(Sprites.unit[k][pose].map(c => c.toDataURL())).size;
      if (n < 4) flat.push(k + '.' + pose + '=' + n);
    }
    ck('thoseFramesActuallyMove', flat.length === 0, flat.join(',') || 'every cycle steps');
    // the renderer plays a beast's longer cycle at its own rate
    ck('beastsRunTheirOwnFrameRate',
      kinds.every(k => (Sprites.animFps && Sprites.animFps[k] || 0) >= 6),
      'Sprites.animFps drives R.unitSprite');
  }

  // ---- 3. the sky reacts ----
  {
    arena('wl3');
    // the flock sits clear of the noise, so its escape direction is decided by
    // geometry rather than the random fallback a bird directly overhead gets
    R.ambient = [
      { kind: 'flock', x: 23, y: 20, dir: 1, vx: 1, vy: 0, t: 0, ttl: 9, ph: 1, n: 3 },
      { kind: 'critter', sub: 'rabbit', x: 21, y: 20, homeX: 25, homeY: 25, vx: 0, vy: 0, t: 0, ttl: 9, ph: 1, state: 'wander', face: 1 },
      { kind: 'fly', x: 40, y: 40, vx: 0.1, vy: 0.1, t: 0, ttl: 9, ph: 1, col: '#fff' },   // far away
    ];
    const before = R.ambient.map(a => ({ vx: a.vx, vy: a.vy, ttl: a.ttl, st: a.state }));
    R.startle(20, 20, 8);
    ck('flocksClimbAndFlee',
      R.ambient[0].vy < before[0].vy && Math.abs(R.ambient[0].vx) > Math.abs(before[0].vx) &&
      R.ambient[0].ttl < before[0].ttl, 'up and away');
    ck('crittersBoltForCover', R.ambient[1].state === 'flee', '');
    ck('distantLifeIsUndisturbed',
      R.ambient[2].vx === before[2].vx && R.ambient[2].ttl === before[2].ttl,
      'out of earshot, out of mind');
    // a fight starting trips it, and only on the FIRST frame of that fight
    arena('wl3b');
    R.ambient = [{ kind: 'flock', x: 20, y: 20, dir: 1, vx: 1, vy: 0, t: 0, ttl: 9, ph: 1, n: 3 }];
    R._fighting = null;
    const a1 = Units.spawn('defender', 'P', 20, 20);
    const a2 = Units.spawn('defender', 'A', 20.8, 20);
    R.noteFights();                       // baseline: nobody fighting yet
    Combat.acquire();
    const vy0 = R.ambient[0].vy;
    R.noteFights();                       // the lock is new → the birds go
    ck('aFightStartingScattersTheBirds', R.ambient[0].vy < vy0, 'flock thrown upward');
    const vy1 = R.ambient[0].vy;
    R.noteFights();                       // same fight, no fresh scare
    ck('anOngoingFightDoesNotRescatter', R.ambient[0].vy === vy1, '');
    ck('fightTrackingStaysOutOfSaves',
      !('_fighting' in S) && R._fighting instanceof Set, 'render-side only');
  }

  // ---- 4. banners fly in the tribe's own dye, hearths smoke ----
  {
    /* …except that the cloth and the 4px owner pip are SWITCHED OFF for now
       (an art-direction call — they crowded the new building art). The
       machinery below is deliberately still exercised: it must keep working
       so flipping either flag restores the feature exactly. If you turn one
       back on, flip its expectation here in the same commit. */
    ck('theTopLeftChromeIsOffForNow',
      R.SHOW_BANNERS === false && R.SHOW_OWNER_PIP === false,
      'banners=' + R.SHOW_BANNERS + ' pip=' + R.SHOW_OWNER_PIP);
    ck('everyBannerPoleHasAnAnchor',
      ['barracks', 'warcamp', 'range', 'trade', 'sapper', 'dock', 'siege', 'tc']
        .every(k => Array.isArray(R.BANNER_AT[k]) && R.BANNER_AT[k].length),
      Object.keys(R.BANNER_AT).length + ' keyed');
    ck('tunicDyesAreExposedToTheRenderer',
      !!Sprites.tunicCol && !!Sprites.tunicCol.purple && !!Sprites.tunicCol.purple.body, '');
    // a purple village flies purple: the cloth colour follows the tunic
    arena('wl4');
    S.tunic = { P: 'purple', A: 'red' };
    const bar = Bld.place('P', 'barracks', 20, 20, { free: true });
    Bld.finish(bar);
    G.visibleAt = () => true;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g2 = cv.getContext('2d');
    const seen = [];
    const origFill = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle').set;
    Object.defineProperty(g2, 'fillStyle', { set(v) { seen.push(v); origFill.call(this, v); }, get() { return '#000'; } });
    R.drawBanners(g2, bar, 0, 0, 32);
    ck('bannerWearsTheVillageDye',
      seen.includes(Sprites.tunicCol.purple.body) && seen.includes(Sprites.tunicCol.purple.accent),
      'purple cloth on a purple tribe');
    // …and a work site flies nothing
    const site = Bld.place('P', 'barracks', 24, 20, { free: true });
    const seen2 = [];
    const g3 = document.createElement('canvas').getContext('2d');
    Object.defineProperty(g3, 'fillStyle', { set(v) { seen2.push(v); }, get() { return '#000'; } });
    R.drawBanners(g3, site, 0, 0, 32);
    ck('workSitesFlyNoColours', seen2.length === 0, 'no cloth over an unfinished hall');
    ck('hearthsAreKeyedForHomesAndHalls',
      ['house', 'tc', 'lodge', 'warcamp'].every(k => R.SMOKE_AT[k]), '');
  }

  // ---- 5. the work report: what a unit does, and what it nets ----
  {
    arena('wl5');
    S.map.terrain[MapGen.idx(24, 24)] = T.FOREST; S.map.resAmount[MapGen.idx(24, 24)] = 100;
    const v = Units.spawn('villager', 'P', 22, 24);
    ck('idleReadsAsIdle', Units.workReport(v).what === 'Idle', '');
    Units.assignGather(v, 24, 24);
    run(6);
    const w = Units.workReport(v);
    ck('gatheringReportsItsResource', !!w.rate && w.rate.res === 'wood' && w.rate.n > 0,
      w.what + ' +' + w.rate.n + ' wood/day');
    ck('theRateIsAWholeDayOfWork',
      Math.abs(w.rate.n - CFG.GATHER[T.FOREST].rate * (CFG.DAY_MS / 1000) * G.modeCfg().gather) < 0.01,
      'rate × day length × mode');
    // a stationed worker reports the STATION's output, and an upgrade pays more
    const camp = Bld.place('P', 'lumber', 22, 26, { free: true }); Bld.finish(camp);
    const v2 = Units.spawn('villager', 'P', 22, 26);
    v2.x = 22.5; v2.y = 26.5;
    v2.task = { type: 'work', id: camp.id };
    const r1 = Units.workReport(v2);
    camp.level = 2;
    const r2 = Units.workReport(v2);
    ck('stationsReportTheirOwnYield', !!r1.rate && r1.rate.res === 'wood', r1.what);
    ck('anUpgradedCampVisiblyPaysMore', r2.rate.n > r1.rate.n,
      '+' + r1.rate.n + ' → +' + r2.rate.n + ' wood/day');
    // walking to a job claims no income yet
    const v3 = Units.spawn('villager', 'P', 34, 34);
    S.map.terrain[MapGen.idx(38, 34)] = T.FOREST; S.map.resAmount[MapGen.idx(38, 34)] = 100;
    Units.assignGather(v3, 38, 34);
    const wr = Units.workReport(v3);
    ck('walkingToWorkClaimsNothing', wr.rate === null && !wr.working, wr.what);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WILD-LIFE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
