/* GOLD MINE CONTRACT — the map's gold, and what it costs to hold.

   Gold is the one resource with no ordinary tile to gather: it trickles out of
   the hall and the Trading Post and nowhere else. GOLD SEAMS (T.GOLDORE) fix
   that, and every rule here exists to keep them worth going out for:

     FOUND      Seams are laid down at generation, scattered on open ground
                well away from BOTH towns and always on land a villager could
                walk to. Every map size carries some; a map with none would be
                the whole feature switched off.

     CLAIMED    The Gold Mine has NO BUTTON IN THE BUILD MENU. You walk a
                villager out to a seam and the works go up around them for
                nothing (Units.assignMine → the 'claim' task → Bld.claimSeam);
                claiming on the ORDER rather than on arrival would let a tribe
                stake every seam on the map from its own doorstep. A seam is
                still the only ground a mine may stand on, and a mine the only
                thing that may stand on a seam.

     TAKEN      The LEVEL BELONGS TO THE SEAM, not to a tribe. Clear the hands
                off a mine and put your own on it and you inherit whatever it
                was raised to. Ownership flips only when the holder has NOBODY
                left on it — and the works are not a target at all
                (Bld.attackable), because a raid that could raze the shaft
                would destroy the level rather than win it.

     WORKED     An ordinary worker plot: two hands, gold PER HAND, and by a
                distance the richest income in the game. The miner says what
                it is bringing up in the same white "+gold" a woodcutter says
                "+wood" in, and its work line carries the rate.

     RAISED     Three tiers, expensive, and slow: an upgrade runs on the
                station rule (Bld.upgradeTime doubles then quadruples a worker
                plot), so L2 is six days of work and L3 sixteen.

     HELD       A seam OUTLIVES the mine on it: demolish one and the gold is
                still there, so the ground stays worth fighting over rather
                than worth burning. The rival plays by every one of these
                rules — it sends a VILLAGER to claim (AI.maybeMine, fog-honest
                and never before CFG.GOLD_SEAMS.aiDay), and it goes after a
                seam whose crew has been cleared off exactly as the player can.

     DRAWN      The seam's sprite is authored on a TRANSPARENT floor like every
                other resource node, so T.GOLDORE must be in render.js's
                GROUND_GRAIN set — left out, drawTile falls to the plain
                drawImage branch and the tile shows the bare cache canvas,
                which composites as BLACK.

   Run this after touching any of:
     config.js — T.GOLDORE, CFG.GOLD_SEAMS, CFG.BUILDINGS.mine
     map.js — the seam pass in MapGen.generate; DIGGABLE / CLEARABLE /
              MOUNDABLE_LAND (a seam must be in none of them)
     buildings.js — tileFree, canPlace (the onTerrain clamp), removeToRuin,
                    seamAt / canClaimSeam / claimSeam / mineHands / attackable
     units.js — assignMine, the 'claim' task
     combat.js — nearestBuilding / nearestReachableBld (the attackable filter)
     sprites.js — Sprites.terrain[T.GOLDORE], B_DRAW.mine, the mine stages
     render.js — GROUND_GRAIN, workFloat, unitPose, the minimap COLORS table
     ui.js — MENU_KEYS, the seam tap in handleTap
     ai.js — maybeMine / plotMine

     node tests/gold-mine.mjs      # exits non-zero on any regression */
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
  const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
  const seamsOf = () => {
    const out2 = [];
    for (let i = 0; i < S.map.terrain.length; i++)
      if (S.map.terrain[i] === T.GOLDORE) out2.push({ x: i % CFG.W, y: (i / CFG.W) | 0, i });
    return out2;
  };

  // ---- 1. every map carries seams, out in the country, on walkable ground ----
  {
    const per = {}, probs = [];
    for (const size of ['medium', 'large', 'xlarge']) {
      let tot = 0, runs = 0, minD = 1e9;
      for (let s = 0; s < 5; s++) {
        G.newGame('gm-' + size + s, 'moderate', size);
        Screens._demo = false; Screens.show('playing'); S.paused = true;
        const seams = seamsOf();
        if (!seams.length) probs.push('gm-' + size + s + ' has NO seam');
        const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
        for (const sm of seams) {
          minD = Math.min(minD, Math.hypot(sm.x - ptc.x, sm.y - ptc.y), Math.hypot(sm.x - atc.x, sm.y - atc.y));
          if (!Path.passable(sm.x, sm.y, 'P')) probs.push('a seam is not walkable');
          if (!Bld.tileFree(sm.x, sm.y)) probs.push('a seam is not buildable');
        }
        tot += seams.length; runs++;
      }
      per[size] = (tot / runs).toFixed(1);
      if (minD < (CFG.GOLD_SEAMS.minFromTown || 10) - 0.01) probs.push(size + ': a seam only ' + minD.toFixed(1) + ' from a town');
    }
    ck('everyMapHasSeams', probs.length === 0 && +per.medium >= 2,
      probs.length ? probs.slice(0, 3).join('; ') : JSON.stringify(per) + ' per map, all walkable and clear of both towns');
    ck('moreGroundMoreGold', +per.xlarge > +per.medium, per.medium + ' → ' + per.xlarge);
  }

  // ---- 2. a seam can never be dug, cleared or paved away ----
  {
    ck('aSeamIsPermanentGround',
      !Terraform.DIGGABLE[T.GOLDORE] && !Terraform.CLEARABLE[T.GOLDORE] &&
      !Terraform.MOUNDABLE_LAND[T.GOLDORE],
      'no sapper tool takes a seam off the map');
  }

  /* ---- 2b. THE SEAM IS DRAWN ON GRASS, not on nothing ----
     Its sprite is authored on a TRANSPARENT floor like every other resource
     node. A terrain left out of render.js's GROUND_GRAIN set falls to the
     plain drawImage branch in drawTile, and a transparent-floored sprite
     drawn there shows the BARE CACHE CANVAS — which composites as black.
     That is exactly what a gold seam did: a tile of black with some gold in
     it. Sprites.blendCol is the matching declaration of the floor it stands
     on, so the two tables have to agree. */
  {
    G.newGame('gm-art', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const spr = Sprites.terrain[T.GOLDORE][0];
    const d = spr.getContext('2d').getImageData(0, 0, spr.width, spr.height).data;
    let clear = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 10) clear++;
    ck('theSeamSpriteHasATransparentFloor', clear > spr.width * spr.height * 0.35,
      Math.round(100 * clear / (spr.width * spr.height)) + '% open');
    // …so the tile MUST get a painted ground under it
    const seam = (() => {
      for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++)
        if (S.map.terrain[MapGen.idx(x, y)] === T.GOLDORE) return { x, y };
      return null;
    })();
    ck('aSeamExistsToDraw', !!seam, '');
    let painted = false;
    const orig = R.paintGround.bind(R);
    R.paintGround = (g2, x, y, h) => { if (x === seam.x && y === seam.y) painted = true; return orig(g2, x, y, h); };
    const cv = document.createElement('canvas');
    cv.width = cv.height = CFG.TILE * (seam.x + 2);
    try { R.drawTile(cv.getContext('2d'), seam.x, seam.y); } finally { R.paintGround = orig; }
    ck('andTheTileIsPaintedGrassFirst', painted,
      'without it the transparent floor shows the bare canvas — black');
    // measure it: the drawn tile must be overwhelmingly opaque
    const td = cv.getContext('2d').getImageData(seam.x * CFG.TILE, seam.y * CFG.TILE, CFG.TILE, CFG.TILE).data;
    let holes = 0;
    for (let i = 3; i < td.length; i += 4) if (td[i] < 250) holes++;
    ck('soTheSeamHasNoHolesInIt', holes === 0,
      holes + ' see-through pixels of ' + (CFG.TILE * CFG.TILE));
  }

  // ---- 3. the seam is for the mine and the mine is for a seam ----
  {
    G.newGame('gm-rules', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P'); tc.level = 3;
    const sx = tc.x + 3, sy = tc.y;
    for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 2; x <= sx + 2; x++) {
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    S.map.terrain[MapGen.idx(sx, sy)] = T.GOLDORE;
    S.map.seenTerrain[MapGen.idx(sx, sy)] = T.GOLDORE;
    Bld._block = null;
    ck('noMineOffASeam',
      Bld.canPlace('P', 'mine', sx + 1, sy).ok === false &&
      /seam/i.test(Bld.canPlace('P', 'mine', sx + 1, sy).why),
      Bld.canPlace('P', 'mine', sx + 1, sy).why);
    ck('noHutOnASeam',
      Bld.canPlace('P', 'house', sx, sy).ok === false &&
      /seam/i.test(Bld.canPlace('P', 'house', sx, sy).why),
      Bld.canPlace('P', 'house', sx, sy).why);
    ck('theMineGoesOnTheSeam', Bld.canPlace('P', 'mine', sx, sy).ok === true, '');
    /* AND NEVER FROM THE MENU. A seam is found in the field and claimed by
       hand; a build button for it would make gold something you shop for. */
    ck('itIsNotInTheBuildMenu',
      UI.MENU_KEYS.indexOf('mine') < 0 && CFG.BUILDINGS.mine.noMenu === true, '');
    ck('andTheClaimItselfIsFree',
      Object.keys(CFG.BUILDINGS.mine.levels[0].cost || {}).length === 0,
      'the journey and holding it are the price');
    // …and it may be claimed far from home, or no seam could ever be worked
    ck('aClaimIsMadeWhereTheGoldIs', CFG.BUILDINGS.mine.freePlace === true,
      'the anchor rule would forbid every seam on the map');
    window.__seam = { x: sx, y: sy };
  }

  /* ---- 3b. THE CLAIM: walked out to, and only raised on arrival ---- */
  {
    const s2 = window.__seam;
    S.units = [];
    const stand = MapGen.findNear(s2.x, s2.y, 6, (x, y) =>
      Path.passable(x, y, 'P') && !Bld.at(x, y) && !(x === s2.x && y === s2.y));
    const v = Units.spawn('villager', 'P', stand.x, stand.y);
    ck('theSeamIsAnOrderNotAPurchase', Units.assignMine(v, s2.x, s2.y) === true &&
      v.task.type === 'claim', v.task && v.task.type);
    ck('andNothingStandsOnItYet', !Bld.at(s2.x, s2.y),
      'claiming on the order would stake every seam from the doorstep');
    for (let i = 0; i < 600 && !(v.task && v.task.type === 'work'); i++) Units.update(0.1);
    const m0 = Bld.at(s2.x, s2.y);
    ck('theWorksGoUpWhenAHandArrives',
      !!m0 && m0.key === 'mine' && m0.owner === 'P' && m0.level === 1 && !m0.construction,
      m0 ? 'Lv ' + m0.level : 'nothing there');
    ck('andTheClaimBecomesAnOrdinaryStation',
      v.task.type === 'work' && v.task.id === m0.id, v.task.type);
    Bld.demolish(m0);
    S.ashes.length = 0;
    S.units = [];
  }

  // ---- 4. worked by hand: gold per villager, and the richest there is ----
  {
    const s = window.__seam;
    const m = Bld.place('P', 'mine', s.x, s.y, { noAutoAssign: true });
    Bld.finish(m);
    ck('minesAreWalkedOnNotAround',
      Bld.solid('mine') === false && Path.passable(s.x, s.y, 'P') === true,
      'a crew stands ON its plot, like every other station');
    S.units = [];
    const v = Units.spawn('villager', 'P', s.x, s.y);
    v.task = { type: 'work', id: m.id };
    for (let t = 0; t < 60; t++) Units.update(0.1);
    const rate = () => { const g0 = S.res.gold; Bld.dailyProduction('P'); return S.res.gold - g0; };
    const one = rate();
    const v2 = Units.spawn('villager', 'P', s.x, s.y);
    v2.task = { type: 'work', id: m.id };
    for (let t = 0; t < 60; t++) Units.update(0.1);
    const two = rate();
    ck('goldPerHand', two - one > 3 && Bld.maxWorkers(m) === 2,
      'one hand ' + one.toFixed(1) + '/day, two ' + two.toFixed(1) + '/day');
    const wr = Units.workReport(v);
    ck('theWorkLineSaysGold',
      /Gold Mine/.test(wr.what) && wr.rate && wr.rate.res === 'gold' && wr.rate.n > 0,
      wr.what + ' · ' + JSON.stringify(wr.rate));
    ck('theMinerSwingsAPick', R.unitPose(v) === 'mine', R.unitPose(v));
    /* …and says "+gold" as it works, in exactly the white vanishing text a
       woodcutter says "+wood" in. Gold gets NO treatment of its own: every
       stationed worker floats its plot's output, the same way the gather task
       has always floated a raw tile's. */
    {
      const seen = [];
      R._workFloatAt = {};   // earlier sections already worked this miner
      const of2 = R.float.bind(R);
      R.float = (x, y, txt, col) => { seen.push(txt + '|' + col); return of2(x, y, txt, col); };
      for (let t = 0; t < 200; t++) Units.update(0.1);
      R.float = of2;
      ck('andSaysPlusGoldAsItWorks',
        seen.some(s => s === '+gold|#d8e8b0'),
        seen.length ? seen.slice(0, 3).join(' ') : 'nothing floated');
      /* …ONCE, though. The work float is a GLANCE cue, not a running readout:
         every "+res" goes through R.workFloat, which is throttled per unit to
         about one tick every WORK_FLOAT_S REAL seconds (the loop above is
         twenty game-seconds of work in a few milliseconds of wall clock, so a
         throttled worker says it exactly once). Before the throttle the same
         loop wrote dozens of lines over one villager's head. */
      const hands = S.units.filter(o => o.task && o.task.type === 'work' && o.task.id === m.id).length;
      ck('butOnlyOccasionally',
        seen.filter(s => /^\+/.test(s)).length === hands,
        seen.filter(s => /^\+/.test(s)).length + ' ticks in 20 game-seconds from ' + hands + ' hands');
    }
    {
      // the throttle itself: one now, none a moment later, one again once the
      // gap has passed — and the timer is render-side, never on the unit
      R._workFloatAt = {};
      const fired = [];
      const of3 = R.float.bind(R);
      R.float = (x, y, txt, col) => { fired.push(txt); return of3(x, y, txt, col); };
      const a = R.workFloat(v, '+gold'), b2 = R.workFloat(v, '+gold');
      R._workFloatAt[v.id] = performance.now() / 1000 - R.WORK_FLOAT_S * 2;
      const c = R.workFloat(v, '+gold');
      R.float = of3;
      ck('theTickIsThrottledPerWorker', a === true && b2 === false && c === true,
        JSON.stringify([a, b2, c]));
      ck('andItIsATickNotAReadout', R.WORK_FLOAT_S >= 15,
        'one every ~' + R.WORK_FLOAT_S + 's, down from about one every 4');
      ck('theTimerIsNeverOnTheUnitOrInASave',
        !('_workFloatAt' in v) && !/_workFloatAt/.test(G.saveJSON()),
        'render-side only, same rule as R._dbA');
    }
    /* the richest per hand on the board — measured in WORTH, not raw units: a
       farm's 50 food a day is more THINGS than a mine's 16 gold and nothing
       like as valuable. The weights are the same rough exchange the sapper's
       fee ladder is valued on (stone 1.5×, gold 4×). */
    const W8 = { food: 1, wood: 1, stone: 1.5, gold: 4 };
    const perHand = (k) => {
      const d = CFG.BUILDINGS[k];
      if (!d.needsWorker) return 0;
      const o = d.levels[d.levels.length - 1].out || {};
      return Object.keys(o).reduce((n, r) => n + o[r] * (W8[r] || 1), 0);
    };
    ck('theRichestIncomeOnTheBoard',
      Object.keys(CFG.BUILDINGS).filter(k => k !== 'mine').every(k => perHand(k) < perHand('mine')),
      perHand('mine') + ' worth/hand/day at L3, against a farm\'s ' + perHand('farm'));
    window.__mine = m.id;
  }

  // ---- 5. the tiers: expensive, and they take real time ----
  {
    const m = Bld.get(window.__mine);
    const L = CFG.BUILDINGS.mine.levels;
    ck('threeTiers', L.length === 3 && L[2].out.gold > L[1].out.gold && L[1].out.gold > L[0].out.gold,
      L.map(l => l.out.gold).join(' → ') + ' gold/hand/day');
    const worth = (c) => (c.food || 0) + (c.wood || 0) + (c.stone || 0) * 1.5 + (c.gold || 0) * 4;
    ck('theUpgradesAreDear',
      worth(L[1].cost) > worth(L[0].cost) * 3 && worth(L[2].cost) > worth(L[1].cost) * 2,
      L.map(l => Math.round(worth(l.cost))).join(' → '));
    ck('everyTierWearsDifferentArt',
      Sprites.building.mine.length === 3 &&
      new Set(Sprites.building.mine.map(c => c.toDataURL())).size === 3 &&
      Sprites.building.mine.every(c => px(c) > 900), '');
    ck('andItRaisesItsOwnWay',
      [1, 2, 3].every(i => Sprites.misc['mineBuild' + i] && Sprites.misc['mineBuild' + i].width === 128) &&
      new Set([1, 2, 3].map(i => Sprites.misc['mineBuild' + i].toDataURL())).size === 3, '');
    // the clock: a station's upgrade is doubled then quadrupled
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    Bld.upgrade(m);
    const t2 = m.upgrading;
    ck('levellingTakesDays', t2 === L[1].time * 2 && t2 >= 5, t2 + ' days to Lv 2');
    ck('andProductionStopsWhileItDoes',
      (() => { const g0 = S.res.gold; Bld.dailyProduction('P'); const d = S.res.gold - g0;
        const tcOut = CFG.BUILDINGS.tc.levels[Bld.tcOf('P').level - 1].out.gold * 1.1;
        return Math.abs(d - tcOut) < 0.5; })(),
      'a mine under works pays nothing');
    m.upgrading = 0; Bld.finishUpgrade(m);
    Bld.upgrade(m);
    const t3 = m.upgrading;
    ck('andTheLastTierLongest', t3 === L[2].time * 4 && t3 > t2, t3 + ' days to Lv 3');
    m.upgrading = 0; Bld.finishUpgrade(m);
    ck('theSeamPaysOut', m.level === 3 && m.maxhp === L[2].hp, 'Lv ' + m.level);
  }

  /* ---- 6. THE WORKS CANNOT BE RAZED — a seam changes hands instead ---- */
  {
    const m = Bld.get(window.__mine), s = window.__seam;
    const hp0 = m.hp, lv0 = m.level;
    Bld.damage(m, 999999);
    ck('theWorksAreNotATarget',
      Bld.attackable(m) === false && m.hp === hp0 && !!Bld.at(s.x, s.y),
      'razing the shaft would destroy the level rather than win it');
    ck('andNobodyEverAimsAtThem',
      Combat.nearestBuilding(s.x, s.y, 'P', () => true) !== m &&
      Combat.nearestReachableBld({ x: s.x, y: s.y, owner: 'A' }, 'P', 30, () => true) !== m,
      'invisible to both target funnels, so nobody swings at it forever');

    /* THE TAKEOVER. While a hand of the holder's is on it, nobody else may
       touch it; clear them off and it changes hands AT THE LEVEL IT STANDS. */
    S.units = [];
    const stand = MapGen.findNear(s.x, s.y, 6, (x, y) =>
      Path.passable(x, y, 'P') && !Bld.at(x, y) && !(x === s.x && y === s.y));
    const mine = Units.spawn('villager', 'P', stand.x, stand.y);
    mine.x = s.x + 0.5; mine.y = s.y + 0.5;
    mine.task = { type: 'work', id: m.id };
    ck('aMannedSeamCannotBeTaken',
      Bld.canClaimSeam('A', s.x, s.y).ok === false &&
      /clear them off/i.test(Bld.canClaimSeam('A', s.x, s.y).why),
      Bld.canClaimSeam('A', s.x, s.y).why);
    const foe = Units.spawn('villager', 'A', stand.x, stand.y);
    ck('andTheRivalIsRefusedTheOrder', Units.assignMine(foe, s.x, s.y) === false, '');
    Units.despawn(mine);
    ck('killTheMinerAndItIsFree', Bld.canClaimSeam('A', s.x, s.y).ok === true, '');
    Units.assignMine(foe, s.x, s.y);
    for (let i = 0; i < 600 && !(foe.task && foe.task.type === 'work'); i++) Units.update(0.1);
    const m2 = Bld.at(s.x, s.y);
    ck('theSeamChangesHands', m2 === m && m2.owner === 'A', m2 && m2.owner);
    ck('atTheLevelYouRaisedItTo', m2.level === lv0 && lv0 === 3,
      'Lv ' + m2.level + ' — the shaft you paid for is the shaft they get');
    const a0 = S.ai.res.gold; Bld.dailyProduction('A');
    ck('andItPaysThemNow', S.ai.res.gold - a0 > 0, +(S.ai.res.gold - a0).toFixed(1) + ' gold/day');

    // …and the GROUND outlives the works: take them away and the gold is still
    // there (removeToRuin — demolish is own-only, and these works are theirs now)
    S.units = [];
    Bld.removeToRuin(m2);
    S.ashes.length = 0;
    ck('theGoldStaysInTheGround',
      S.map.terrain[MapGen.idx(s.x, s.y)] === T.GOLDORE && !Bld.at(s.x, s.y),
      'everywhere else leaves rubble — never here');
    ck('andCanBeClaimedAgain', Bld.canClaimSeam('P', s.x, s.y).ok === true, '');
  }

  // ---- 7. the rival wants it too, but not on day one ----
  {
    G.newGame('gm-ai', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const atc = Bld.tcOf('A');
    const sx = atc.x + 4, sy = atc.y;
    for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 2; x <= sx + 2; x++) {
      if (!MapGen.inB(x, y)) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    S.map.terrain[MapGen.idx(sx, sy)] = T.GOLDORE;
    Bld._block = null;
    S.ai.seen = S.ai.seen || [];
    S.day = (CFG.GOLD_SEAMS.aiDay || 40) - 1;
    ck('notOnDayOne', AI.maybeMine() === false, 'rich and looking at a seam, and still waiting');
    S.day = CFG.GOLD_SEAMS.aiDay;
    ck('andBlindToWhatItHasNotScouted', AI.maybeMine() === false && !S.ai.seen[MapGen.idx(sx, sy)],
      'the seam is not on its map yet — fog-honest');
    S.ai.seen[MapGen.idx(sx, sy)] = 1;
    // it sends a HAND, exactly as the player does — no hand, no claim
    const hands = S.units.filter(u => u.owner === 'A' && Units.isVillager(u));
    ck('itNeedsAHandToSend', hands.length > 0, hands.length + ' villagers alive');
    const sent = AI.maybeMine();
    const walker = S.units.find(u => u.owner === 'A' && u.task && u.task.type === 'claim');
    ck('butOnceItHasSeenOneItSendsAVillager',
      sent === true && !!walker && walker.task.x === sx && walker.task.y === sy, '');
    ck('andNotASecondHandForTheSameSeam', AI.maybeMine() === false, 'one is already on the road');
    for (let i = 0; i < 900 && !(walker.task && walker.task.type === 'work'); i++) Units.update(0.1);
    const am = Bld.at(sx, sy);
    ck('andTheWorksGoUpWhenItGetsThere',
      !!am && am.key === 'mine' && am.owner === 'A', am ? am.owner : 'nothing');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL GOLD-MINE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
