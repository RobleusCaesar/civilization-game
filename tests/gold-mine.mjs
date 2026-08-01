/* GOLD MINE CONTRACT — the map's gold, and what it costs to hold.

   Gold is the one resource with no ordinary tile to gather: it trickles out of
   the hall and the Trading Post and nowhere else. GOLD SEAMS (T.GOLDORE) fix
   that, and every rule here exists to keep them worth going out for:

     FOUND      Seams are laid down at generation, scattered on open ground
                well away from BOTH towns and always on land a villager could
                walk to. Every map size carries some; a map with none would be
                the whole feature switched off.

     CLAIMED    A seam is the ONLY ground a Gold Mine may be sunk on, and a
                Gold Mine is the only thing that may be built on a seam. It is
                freePlace, like the War Camp — the anchor rule would forbid
                every seam on the map — so claiming one means marching out.

     WORKED     An ordinary worker plot: two hands, gold PER HAND, and by a
                distance the richest income in the game. The miner shows what
                it is bringing up — the gold icon over its head (R.CARRY_ICON)
                and the gold rate on its work line.

     RAISED     Three tiers, expensive, and slow: an upgrade runs on the
                station rule (Bld.upgradeTime doubles then quadruples a worker
                plot), so L2 is six days of work and L3 sixteen.

     HELD       A seam OUTLIVES the mine on it. A razed mine leaves the gold
                exactly where it was, so the ground stays worth fighting over
                rather than worth burning — and the rival wants it too
                (AI.maybeMine, fog-honest and never before CFG.GOLD_SEAMS.aiDay).

   Run this after touching any of:
     config.js — T.GOLDORE, CFG.GOLD_SEAMS, CFG.BUILDINGS.mine
     map.js — the seam pass in MapGen.generate; DIGGABLE / CLEARABLE /
              MOUNDABLE_LAND (a seam must be in none of them)
     buildings.js — tileFree, canPlace (the onTerrain clamp), removeToRuin
     sprites.js — Sprites.terrain[T.GOLDORE], B_DRAW.mine, the mine stages
     render.js — CARRY_ICON, unitPose, the minimap COLORS table
     ui.js — MENU_KEYS
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
    ck('itIsInTheBuildMenu', UI.MENU_KEYS.indexOf('mine') >= 0, '');
    ck('itNeedsTheSecondHall', CFG.BUILDINGS.mine.reqTC === 2, '');
    // …and it may be claimed far from home, or no seam could ever be worked
    ck('aClaimIsMadeWhereTheGoldIs', CFG.BUILDINGS.mine.freePlace === true,
      'the anchor rule would forbid every seam on the map');
    window.__seam = { x: sx, y: sy };
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
    ck('andCarriesTheGoldOverItsHead',
      R.CARRY_ICON.mine === 'gold' && !!Sprites.icons.gold,
      'R.CARRY_ICON is the registry — one entry per station that shows its haul');
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

  // ---- 6. the seam outlives the mine ----
  {
    const m = Bld.get(window.__mine), s = window.__seam;
    Bld.damage(m, 999999);
    ck('theGoldStaysInTheGround',
      S.map.terrain[MapGen.idx(s.x, s.y)] === T.GOLDORE,
      'a razed mine leaves rubble everywhere else — never here');
    ck('theGroundIsWorthFightingFor',
      !!Bld.ashAt(s.x, s.y) && Bld.canPlace('P', 'mine', s.x, s.y).ok === false,
      'the ash still cools first, like any burned building');
    S.ashes.length = 0;
    ck('andCanBeClaimedAgain', Bld.canPlace('P', 'mine', s.x, s.y).ok === true, '');
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
    const laid = AI.maybeMine();
    const am = Bld.list('A').find(z => z.key === 'mine');
    ck('butOnceItHasSeenOneItClaimsIt',
      laid === true && !!am && am.x === sx && am.y === sy, '');
    ck('andOnlyEverOnePerSeam', AI.maybeMine() === false, 'the seam is taken');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL GOLD-MINE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
