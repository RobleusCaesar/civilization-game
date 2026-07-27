/* RIVAL CROSSING CONTRACT — the chief can always reach its own works, feeds
   its army before hoarding, and opens lanes away from tower fire.

   One player report ("the enemy never tried a boat landing or building a
   bridge — dozens of soldiers just sitting at their gate"), one 400-day save,
   THREE compounding wedges found in it:

   1. GHOST SITE — `AI.plot` chose building spots with no reachability check,
      so the Sappers' Camp was plotted in a sealed pocket between the bay and
      the rival's own west wall. Every rival building rises under a villager's
      hammer; no hand could ever stand at those works, so construction sat at
      day-zero for 50+ days — and `have.sapper` read as owned, so no second
      camp was ever tried. With sapper tier stuck at 0, every bridge the chief
      could have built (MUDLARK, stall-breaching) was silently disabled for
      the rest of the game. Fixes, both halves:
        · PREVENTION: plot() candidates (and towerSpot picks) must sit in the
          villagers' own reach network (`aiLandReach`), or right beside it.
          Walls/gates are exempt — they sit ON the seam by design.
        · CURE: the daily build-crew block now verifies the chosen hand can
          actually STAND at the works (Path.find end within build reach) —
          three straight days unreachable and an UNSTARTED site is abandoned
          (materials refunded) so the utility re-sites it on real ground. An
          upgrade in the same spot just waits: the building itself stands.

   2. FAMINE — the same save sat at 0 food for months on 15,000 wood, so
      sappers (30 food), infantry and hulls all starved in the training queue
      even after the camp was cured. The rival's Trading Post only ever bought
      GOLD; a starving chief now sends the caravan for FOOD first (surplus
      goods → food, the ordinary swap rate), like any human would.

   3. KILLZONE BREACH — probeAssault's breach-lane scorer picked the frontier
      tile nearest the player's hall with no regard for the player's KNOWN
      towers, so the 55hp unarmed sapper bridged straight into tower fire and
      died in four shots, every time. Each candidate now pays ~10 tiles of
      detour per known tower covering it (7.5 = max tower range + margin) —
      fog-honest, read from ai.knownB only.

   With all three fixed, the 400-day save goes from "26 soldiers idle at the
   gate forever" to a bridge road built across the bay and raid parties of 20
   fighting on the player's side, within ~60 simulated days.

   Run this after touching any of:
     ai.js — plot, towerSpot (via plot), aiLandReach, the BUILD CREWS block in
             daily(), the Trading Post block in daily(), probeAssault's breach
             scorer, breachToPlayer
     buildings.js — removeToRuin, startTrade/tradeDeal, canPlace
     map.js — Path.find, Path.passable

     node tests/rival-crossing.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
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

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    return Bld.tcOf('A');
  };
  const T2 = (x, y, t) => { S.map.terrain[MapGen.idx(x, y)] = t; };
  // the same standable test the crew block uses
  const workable = (mask, x, y) => {
    if (mask[MapGen.idx(x, y)]) return true;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (MapGen.inB(nx, ny) && mask[MapGen.idx(nx, ny)]) return true;
    }
    return false;
  };

  // ---- 1. plot() never sites a building where the town's hands can't reach —
  //         even when a pristine sealed pocket is the roomiest ground around ----
  {
    const atc = setup('rc1');
    // bait: a pristine 3-wide grass pocket ringed with water, just off the hall
    const px = atc.x + 4, py = atc.y + 3;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) T2(px + dx, py + dy, T.WATER);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) T2(px + dx, py + dy, T.GRASS);
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const mask = AI.aiLandReach();
    ck('pocketIsGenuinelyUnreachable', !workable(mask, px, py), `pocket at ${px},${py}`);
    let allOk = true, bad = null;
    for (const key of ['sapper', 'house', 'farm', 'barracks', 'tower']) {
      for (let i = 0; i < 5; i++) {
        const spot = AI.plot(key);
        if (spot && !workable(mask, spot.x, spot.y)) { allOk = false; bad = key + '@' + spot.x + ',' + spot.y; break; }
      }
    }
    ck('plotOnlyPicksReachableGround', allOk, bad || 'all spots workable');
  }

  // ---- 2. a ghost site (under construction, unreachable) is abandoned within
  //         three daily ticks so the building can be re-sited ----
  {
    const atc = setup('rc2');
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    // stand the site on open ground, then cut it off with a water ring
    const sx = atc.x + 5, sy = atc.y;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) T2(sx + dx, sy + dy, T.GRASS);
    const site = Bld.place('A', 'sapper', sx, sy, { free: true });
    ck('siteStartsUnbuilt', !!site && site.construction > 0, site && 'construction=' + site.construction);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) T2(sx + dx, sy + dy, T.WATER);
    const id = site.id;
    let goneOnDay = null;
    for (let d = 1; d <= 5 && !goneOnDay; d++) {
      S.day++; AI.daily();
      if (!Bld.get(id)) goneOnDay = d;
    }
    ck('ghostSiteAbandoned', goneOnDay != null && goneOnDay <= 4, goneOnDay ? `gone after ${goneOnDay} days` : 'still standing after 5 days');
    ck('noHandGluedToGhost', !S.units.some(u => u.owner === 'A' && u.task && u.task.type === 'build' && u.task.id === id), '');
  }

  // ---- 3. …but a REACHABLE site under construction is left alone and crewed ----
  {
    const atc = setup('rc3');
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const sx = atc.x + 4, sy = atc.y + 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) T2(sx + dx, sy + dy, T.GRASS);
    const site = Bld.place('A', 'sapper', sx, sy, { free: true });
    const id = site.id;
    for (let d = 1; d <= 4; d++) { S.day++; AI.daily(); }
    ck('reachableSiteSurvives', !!Bld.get(id), '');
    ck('reachableSiteGetsABuilder', S.units.some(u => u.owner === 'A' && u.task && u.task.type === 'build' && u.task.id === id), '');
  }

  // ---- 4. a starving chief with a goods mountain sends the caravan for FOOD ----
  {
    const atc = setup('rc4');
    const post = Bld.place('A', 'trade', atc.x + 3, atc.y + 2, { free: true, instant: true });
    S.ai.res = { food: 40, wood: 15000, stone: 15000, gold: 50 };
    S.day++; AI.daily();
    ck('starvingChiefBuysFood', !!(post.caravan && post.caravan.need === 'food'),
      JSON.stringify(post.caravan));
    ck('paysFromTheSurplusGood', !!(post.caravan && (post.caravan.pay === 'wood' || post.caravan.pay === 'stone')),
      post.caravan && post.caravan.pay);
  }

  // ---- 5. …and a FED chief still runs the old gold caravan, not food ----
  {
    const atc = setup('rc5');
    const post = Bld.place('A', 'trade', atc.x + 3, atc.y + 2, { free: true, instant: true });
    S.ai.res = { food: 5000, wood: 15000, stone: 15000, gold: 50 };
    S.day++; AI.daily();
    ck('fedChiefStillTradesForGold', !!(post.caravan && post.caravan.need === 'gold'),
      JSON.stringify(post.caravan));
  }

  // ---- 6. the breach lane detours around KNOWN tower fire: with a tower
  //         guarding the near span, the chief bridges the far one ----
  {
    const atc = setup('rc6');
    // a tier-2 corps
    const camp = Bld.place('A', 'sapper', atc.x + 2, atc.y + 2, { free: true, instant: true });
    camp.level = 2; camp.maxhp = CFG.BUILDINGS.sapper.levels[1].hp; camp.hp = camp.maxhp;
    /* controlled geography far from real towns: a water basin holding an
       unreachable island "hall", with exactly two 1-tile bridgeable spans off
       the reachable shore — span A right by the hall, span B 8 tiles south */
    const bx = 25, by = 14;                     // basin centre ("hall" the chief knows)
    for (let dy = -3; dy <= 11; dy++) for (let dx = -3; dx <= 3; dx++) T2(bx + dx, by + dy, T.GRASS);
    for (let dy = -2; dy <= 10; dy++) T2(bx - 1, by + dy, T.WATER);   // the channel wall between shore and island
    // spans: water tiles in the channel with land on both sides (E–W crossings)
    // channel column is x = bx-1; land at bx-2 (shore) and bx (island strip)
    const spanA = { x: bx - 1, y: by };          // nearest the "hall"
    const spanB = { x: bx - 1, y: by + 8 };      // the long way round
    // make everything in the channel EXCEPT the spans unbridgeable: widen to 2 tiles
    for (let dy = -2; dy <= 10; dy++) { const y = by + dy; if (y !== spanA.y && y !== spanB.y) T2(bx - 2, y, T.WATER); }
    G.updateVisibility();
    const read = { knownTC: { x: bx, y: by, seen: S.day } };
    S.ai.posture = 'PUSH';
    const base = AI.probeAssault(read, AI.aiLandReach());
    ck('baselineBreachTakesNearSpan', !!(base && base.breach && Math.abs(base.breach.y - spanA.y) <= 1),
      JSON.stringify(base && base.breach));
    // now the scouts know a Lv3 tower guards the near span
    S.ai.knownB = S.ai.knownB || {};
    S.ai.knownB['t_test'] = { x: bx - 3, y: by, key: 'tower', owner: 'P', level: 3 };
    const seen = AI.probeAssault(read, AI.aiLandReach());
    const farFromTower = seen && seen.breach && Math.hypot(seen.breach.x - (bx - 3), seen.breach.y - by) > 7.5;
    ck('breachDetoursAroundKnownTower', !!farFromTower,
      JSON.stringify(seen && seen.breach));
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RIVAL-CROSSING CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
