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
      goods → food, the ordinary swap rate), like any human would. The mirror
      case (a day-167 Hard save): a razed chief died holding 1,352 gold and
      66 wood — gold only flows out through the post, and nothing ever BOUGHT
      with it. A chief over 600 gold with the woodpile under 200 now buys
      wood at the (deliberately awful) gold rate — awful beats dead money.

   3. KILLZONE BREACH — probeAssault's breach-lane scorer picked the frontier
      tile nearest the player's hall with no regard for the player's KNOWN
      towers, so the 55hp unarmed sapper bridged straight into tower fire and
      died in four shots, every time. Each candidate now pays ~10 tiles of
      detour per known tower covering it (7.5 = max tower range + margin) —
      fog-honest, read from ai.knownB only.

   4. POINTLESS BREACH (a second save, day 212) — the scorer also never asked
      whether a cut OPENS anything. A one-tile inlet at a lake's southern
      tip is bridgeable and sits nearest the hall, so MUDLARK marched its
      sapper across the map to bridge water whose both banks were the SAME
      shore — walkable around the notch, the bridge changed nothing, aimed
      at a lake the corps could never actually cross. `AI._breachOpens` now
      gates every sapper-employment site (the campaign breach scorer, the
      stall-breacher, the offensive line walk): a cut counts only if the
      opened tile borders passable ground the army cannot already reach, OR
      the lane can genuinely CONTINUE tile by tile — each further water tile
      must be really spannable (the same land-on-opposite-sides rule as
      Terraform.bridgeCrossing, with the lane's own opened tiles counting as
      landings, exactly as built bridges do) or clearable/reclaimable at the
      corps' tier. Open water fails — a mid-lake deck has water on both far
      sides, and always will. On the day-212 save this stands MUDLARK down
      the same day and the silly bridge is never built.

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

  /* controlled geography for the breach tests: a TRUE island (water on every
     side) holding the "hall" the chief knows, separated from the reachable
     shore by a 1-wide channel on its west. Spans are the channel tiles left
     with land on both opposite sides. The island must be genuinely sealed —
     grass wrapping around the channel ends would let the army simply walk
     there, and the honest breach gate (_breachOpens) would rightly call
     every span pointless. */
  const carveIsland = (bx, by, spanYs) => {
    for (let dy = -5; dy <= 13; dy++) for (let dx = -7; dx <= 7; dx++) T2(bx + dx, by + dy, T.GRASS);
    // the water frame that seals the island (columns bx..bx+3). North, south
    // and east run TWO tiles thick — a 1-thick frame tile has land on both
    // opposite sides and is itself a perfectly good crossing, which the
    // honest breach scorer will happily take; the west channel's spans must
    // be the only bridgeable way in.
    for (let dy = -4; dy <= 12; dy++) T2(bx - 1, by + dy, T.WATER);           // west channel
    for (let dy = -4; dy <= 12; dy++) { T2(bx + 4, by + dy, T.WATER); T2(bx + 5, by + dy, T.WATER); }
    for (let dx = -1; dx <= 5; dx++) {
      T2(bx + dx, by - 3, T.WATER); T2(bx + dx, by - 4, T.WATER);
      T2(bx + dx, by + 11, T.WATER); T2(bx + dx, by + 12, T.WATER);
    }
    // widen the channel beside every non-span tile so only the spans are bridgeable
    for (let dy = -4; dy <= 12; dy++) { const y = by + dy; if (!spanYs.includes(y)) T2(bx - 2, y, T.WATER); }
  };

  // ---- 5b. a gold hoard with a bare woodpile buys WOOD — the treasury is
  //          never dead money while a post stands (a real Hard game died in
  //          REBUILD with 1,352 gold banked and 66 wood) ----
  {
    const atc = setup('rc5b');
    const post = Bld.place('A', 'trade', atc.x + 3, atc.y + 2, { free: true, instant: true });
    S.ai.res = { food: 5000, wood: 66, stone: 88, gold: 1352 };
    S.day++; AI.daily();
    ck('goldHoardBuysWood', !!(post.caravan && post.caravan.need === 'wood' && post.caravan.pay === 'gold'),
      JSON.stringify(post.caravan));
  }

  // ---- 6. the breach lane detours around KNOWN tower fire: with a tower
  //         guarding the near span, the chief bridges the far one ----
  {
    const atc = setup('rc6');
    // a tier-2 corps
    const camp = Bld.place('A', 'sapper', atc.x + 2, atc.y + 2, { free: true, instant: true });
    camp.level = 2; camp.maxhp = CFG.BUILDINGS.sapper.levels[1].hp; camp.hp = camp.maxhp;
    const bx = 25, by = 14;                     // island "hall" the chief knows
    const spanA = { x: bx - 1, y: by };          // nearest the "hall"
    const spanB = { x: bx - 1, y: by + 8 };      // the long way round
    carveIsland(bx, by, [spanA.y, spanB.y]);
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

  // ---- 7. a bridge that OPENS nothing is never chosen: the inlet notch
  //         beside the hall loses to the real crossing eight tiles round ----
  {
    const atc = setup('rc7');
    const camp = Bld.place('A', 'sapper', atc.x + 2, atc.y + 2, { free: true, instant: true });
    camp.level = 2; camp.maxhp = CFG.BUILDINGS.sapper.levels[1].hp; camp.hp = camp.maxhp;
    const bx = 25, by = 14;
    const realSpan = { x: bx - 1, y: by + 8 };   // the ONLY span that reaches the island
    carveIsland(bx, by, [realSpan.y]);
    // the DECOY: a one-tile inlet biting into the reachable shore right by the
    // hall — bridgeable (land both banks), walkable AROUND, three tiles out.
    // The exact "silly bridge" of a real day-212 game: nearest the hall,
    // cheapest tool, opens absolutely nothing.
    const notch = { x: bx - 5, y: by };
    T2(notch.x, notch.y, T.WATER);
    G.updateVisibility();
    const reach = AI.aiLandReach();
    const aim = { x: bx, y: by };
    ck('notchIsGenuinelyBridgeable', !!Terraform.bridgeCrossing(notch.x, notch.y, 'A'), '');   // the bait is real
    ck('notchOpensNothing', !AI._breachOpens(notch.x, notch.y, aim, reach, 2), '');
    ck('realSpanOpensTheIsland', AI._breachOpens(realSpan.x, realSpan.y, aim, reach, 2) === true, '');
    S.ai.posture = 'PUSH';
    const ctx = AI.probeAssault({ knownTC: { x: bx, y: by, seen: S.day } }, reach);
    ck('breachSkipsTheNotchForTheRealSpan',
      !!(ctx && ctx.breach && ctx.breach.x === realSpan.x && Math.abs(ctx.breach.y - realSpan.y) <= 1),
      JSON.stringify(ctx && ctx.breach));
  }

  /* ---- 7. THE BLIND CHIEF (a real day-320 save): knownTC was STILL null after
     320 days — the player's hall sat across water, outside the reach-limited
     hunt — and every attack system gated on it. choosePosture demoted PUSH to
     CONSOLIDATE, campaignSelect returned before selecting, so TIDEWRACK and
     MUDLARK were unreachable code for the one chief that needed them most:
     the whole army walked to the waterline and stood there for 200 days.
     AI.attackAnchor is the stand-in — the known player building nearest the
     centroid of everything the chief has actually seen — and it is EVIDENCE-
     GATED (AI.warStuck): it exists only once the war is provably parked, so a
     young chief still hunts before it besieges. ---- */
  {
    setup('rc7');
    const cluster = () => {
      S.ai.knownB = {
        a: { x: 30, y: 30, key: 'warcamp', owner: 'P', level: 1 },
        b: { x: 32, y: 31, key: 'tower', owner: 'P', level: 2 },
        c: { x: 31, y: 33, key: 'farm', owner: 'P', level: 1 },
      };
    };
    cluster();
    // 7a. an UNSTUCK war never invents an anchor — the hunt keeps hunting
    S.ai.stall = null; if (S.ai.memory) S.ai.memory.laneDef = null;
    ck('warNotStuckByDefault', !AI.warStuck(), '');
    ck('noAnchorWhileTheHuntStillRuns', AI.attackAnchor({ knownTC: null }) === null, '');
    // 7b. a fresh stall IS a stuck war, and the anchor is one of the SEEN works
    S.ai.stall = { x: 20, y: 20, t: S.day };
    ck('freshStallMeansStuck', AI.warStuck(), '');
    const a = AI.attackAnchor({ knownTC: null });
    ck('anchorIsAKnownWork', !!a && ['warcamp', 'tower', 'farm'].includes(a.key), a && a.key);
    // 7c. the real hall always outranks the stand-in
    const tcRead = { x: 5, y: 5, key: 'tc' };
    ck('theRealHallOutranksTheAnchor', AI.attackAnchor({ knownTC: tcRead }) === tcRead, '');
    // 7d. one building is a sighting, not a town — no anchor from a lone glimpse
    S.ai.knownB = { a: { x: 30, y: 30, key: 'tower', owner: 'P' } };
    ck('oneSightingIsNoAnchor', AI.attackAnchor({ knownTC: null }) === null, '');
    // 7e. a stall gone stale (>20 days) stands the whole thing down again…
    cluster();
    S.ai.stall = { x: 20, y: 20, t: S.day - 30 };
    ck('aStaleStallIsNotStuck', !AI.warStuck(), '');
    ck('staleStallDropsTheAnchor', AI.attackAnchor({ knownTC: null }) === null, '');
    // 7f. …but a hunt lane worn down by fruitless marches counts as stuck too
    S.ai.memory = S.ai.memory || {}; S.ai.memory.laneDef = { hunt: 2 };
    ck('aWornHuntLaneIsStuck', AI.warStuck(), '');
    // 7g. probeAssault answers with the anchor — this returning null was what
    // made campaignSelect bail before it could ever pick a crossing plan
    const ctx7 = AI.probeAssault({ knownTC: null }, AI.aiLandReach());
    ck('probeAssaultSeesTheAnchor', !!ctx7 && !!ctx7.ptc, '');
  }

  /* ---- 8. THE WOOD WEDGE: the TC3 savings jar (ai.goal) starved the crossing
     of its HANDS — the camp stood but affordFree refused the 40-wood sapper
     for two hundred days while the jar demanded 600 banked. A war provably
     stuck may raid the jar for the units that unstick it; a war that is NOT
     stuck keeps saving like before. ---- */
  {
    const atc = setup('rc8');
    const camp = Bld.place('A', 'sapper', atc.x + 2, atc.y + 2, { free: true, instant: true });
    S.ai.goal = { key: 'tc', cost: { wood: 600, stone: 450, gold: 120 } };
    S.ai.res = { food: 500, wood: 200, stone: 100, gold: 50 };
    S.ai.posture = 'PUSH';
    const m = CFG.MODES[S.mode] || CFG.MODES.moderate;
    const read8 = { foeWall: 0, foeTower: 0, underThreat: false };
    // 8a. unstuck → the jar holds: no sapper is trained past the savings goal
    S.ai.stall = null; if (S.ai.memory) S.ai.memory.laneDef = null;
    AI.trainForces(m, read8);
    ck('theJarHoldsWhileTheWarMoves', !camp.queue.some(q => q.unit === 'sapper'),
      JSON.stringify(camp.queue));
    // 8b. stuck → the corps trains anyway; the hall can wait a season
    S.ai.stall = { x: 20, y: 20, t: S.day };
    AI.trainForces(m, read8);
    ck('aStuckWarRaidsTheJarForItsSapper', camp.queue.some(q => q.unit === 'sapper'),
      JSON.stringify(camp.queue));
  }

  /* ---- 9. END TO END: an island cluster, no hall ever found, a fresh stall —
     the chief still commits to a crossing plan. This is the whole point of the
     anchor: the machinery below it (probeAssault's breach scan, campaignSelect's
     viability filter) runs exactly as it would with a known hall. ---- */
  {
    const atc = setup('rc9');
    const camp = Bld.place('A', 'sapper', atc.x + 2, atc.y + 2, { free: true, instant: true });
    camp.level = 2; camp.maxhp = CFG.BUILDINGS.sapper.levels[1].hp; camp.hp = camp.maxhp;
    const bx = 25, by = 14;
    carveIsland(bx, by, [by + 4]);
    G.updateVisibility();
    // the chief has seen three works ON the island — never the hall
    S.ai.knownB = {
      a: { x: bx + 1, y: by, key: 'warcamp', owner: 'P', level: 1 },
      b: { x: bx + 2, y: by + 1, key: 'tower', owner: 'P', level: 2 },
      c: { x: bx + 1, y: by + 2, key: 'farm', owner: 'P', level: 1 },
    };
    S.ai.posture = 'PUSH';
    S.ai.stall = { x: bx - 3, y: by, t: S.day };
    S.ai.camp = null;
    AI.campaignSelect({ knownTC: null, weakFlank: null });
    ck('aBlindStuckChiefStillPicksACrossingPlan',
      !!(S.ai.camp && S.ai.camp.strat), S.ai.camp && S.ai.camp.strat);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RIVAL-CROSSING CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
