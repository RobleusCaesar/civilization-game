/* BRIDGE-OVER-RESOURCE-SHORE CONTRACT.

   Two bugs, one player report ("can't build on the circle — there was a
   bridge there, maybe it got destroyed?"):

   1. `Terraform.bridgeCrossing`'s land() check required a genuinely
      PASSABLE tile flanking the water on both opposite sides. But a
      standing resource (forest/hills/fertile orchard) also fails
      Path.passable — it blocks land movement exactly like water does — so
      a water tile with a tree-lined far shore had NO valid span and could
      never be bridged at all, even though mounding (reclaiming) the same
      water works fine right next to a resource. Fixed: `land()` now also
      accepts any T.CLEARABLE terrain (forest/hills/fertile) as a landing
      side — the far bank blocks movement until a sapper clears it, exactly
      like it does today for a plain land tile with a resource on it, but
      the SPAN itself is no longer refused. Clear it with the same sapper
      once the bridge is up (tier 3 — the existing 'clear' job, untouched).

   2. Once dispatched, a bridge task's mid-work revalidation only checked
      `Terraform.bridgeable()` (still water?) — not `bridgeCrossing()` (is
      there still a valid SPAN?). If the far shore's validity changed after
      the sapper started working (edge case, but real), the sapper would
      animate for the FULL build timer, `Bld.buildBridge` would silently
      return false at the end, and NOTHING would print — no bridge, no
      toast, no log line. That silent failure is exactly what a player
      would misremember later as "there was a bridge, maybe it got
      destroyed." Fixed: the revalidation now calls `bridgeCrossing` (and
      re-checks `Bld.bridgeAt`), so an invalidated span drops the job
      immediately like any other skipped queue tile, and a completion-time
      failure (defensively still possible) now toasts a reason instead of
      finishing in silence.

   And a third rule, added later — REINFORCING A SPAN IS A BUILD, NOT A
   PURCHASE. Levels 2 and 3 used to be instant: pay, and the timber crossing
   was a stone arch the same frame. They now work like every other upgrade in
   the game — the stone is paid up front, the works stand on the bridge for
   `CFG.BRIDGE.levels[lv].time` DAYS, and a SAPPER has to be at them for the
   whole of it, the same hands that raised the level-1 crossing. The clock
   lives on the BRIDGE (`br.upgrading` / `upTotal` / `upTo`), never on the
   sapper's task, so progress survives the sapper being cut down at the
   waterline and a second sapper genuinely halves the work — the same
   convention buildings use. The span stays crossable throughout.

   Run this after touching any of:
     map.js — Terraform.bridgeCrossing, bridgeable, CLEARABLE
     units.js — the terraform task branch in Units.update (stillValid,
                the job==='bridge' and job==='bridgeup' blocks),
                assignTerraform, canTerraform, terraformJob,
                startNextTerraform, nearestIdleSapper, _bridgeWorks
     buildings.js — Bld.buildBridge, bridgeAt, canUpgradeBridge,
                    orderBridgeUpgrade, finishBridgeUpgrade
     config.js — CFG.BRIDGE.levels (cost + time)
     ui.js — the terraMode==='bridge' tap-order branch, the bridge panel,
             the sapper-taps-the-works branch, panelSig
     render.js — the works drawn on a bridge under reinforcement

     node tests/bridge-resource-shore.mjs      # exits non-zero on any regression

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

  // stand a sapper + a Sappers' Camp at the requested level (2 = bridge, 3 = +clear)
  const setup = (seed, campLevel) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    const camp = Bld.place('P', 'sapper', tc.x + 2, tc.y + 2, { free: true, instant: true });
    camp.level = campLevel; camp.maxhp = CFG.BUILDINGS.sapper.levels[campLevel - 1].hp; camp.hp = camp.maxhp;
    const cx = tc.x + 10, cy = tc.y;
    // a guaranteed-clear approach corridor along row cy (real map gen may put
    // forest/hills anywhere, and a stray obstacle upstream would make the
    // near-shore standing tile unreachable via BFS — a false failure that has
    // nothing to do with what this test is checking), then isolate a single
    // E–W crossing at (cx, cy): only its N/S neighbours are forced to water,
    // so no alternate N–S span can quietly satisfy bridgeCrossing instead.
    for (let dx = -6; dx <= 2; dx++) {
      S.map.terrain[MapGen.idx(cx + dx, cy)] = T.GRASS;
      S.map.explored[MapGen.idx(cx + dx, cy)] = 1;
    }
    S.map.terrain[MapGen.idx(cx, cy - 1)] = T.WATER;
    S.map.terrain[MapGen.idx(cx, cy + 1)] = T.WATER;
    S.map.explored[MapGen.idx(cx, cy - 1)] = 1;
    S.map.explored[MapGen.idx(cx, cy + 1)] = 1;
    S.map.terrain[MapGen.idx(cx, cy)] = T.WATER;
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.GRASS;   // far shore — scenarios override this
    const s = Units.spawn('sapper', 'P', cx - 5, cy);
    return { s, cx, cy };
  };
  const runUntil = (pred, maxSecs) => { let t = 0; const dt = 1 / 10; while (!pred() && t < maxSecs) { Units.update(dt); t += dt; } return t; };

  // ---- 1. bridgeCrossing accepts a CLEARABLE far shore (forest/hills/fertile) ----
  {
    const { cx, cy } = setup('br1', 2);
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.FOREST;
    ck('crossingAcceptsForestShore', !!Terraform.bridgeCrossing(cx, cy, 'P'), String(Terraform.bridgeCrossing(cx, cy, 'P')));
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.HILLS;
    ck('crossingAcceptsHillsShore', !!Terraform.bridgeCrossing(cx, cy, 'P'), String(Terraform.bridgeCrossing(cx, cy, 'P')));
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.FERTILE;
    ck('crossingAcceptsFertileShore', !!Terraform.bridgeCrossing(cx, cy, 'P'), String(Terraform.bridgeCrossing(cx, cy, 'P')));
  }

  // ---- 2. regression: a truly impassable far shore (mountain / another
  //         sapper's trench) is still refused — the fix is resource-specific,
  //         not "anything blocked now counts" ----
  {
    const { cx, cy } = setup('br2', 2);
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.MOUNTAIN;
    ck('crossingStillRejectsMountainShore', !Terraform.bridgeCrossing(cx, cy, 'P'), String(Terraform.bridgeCrossing(cx, cy, 'P')));
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.TRENCH;
    ck('crossingStillRejectsTrenchShore', !Terraform.bridgeCrossing(cx, cy, 'P'), String(Terraform.bridgeCrossing(cx, cy, 'P')));
  }

  // ---- 3. regression: open water with no land on either axis (mid-lake) is
  //         still refused — CLEARABLE water isn't a thing ----
  {
    const { cx, cy } = setup('br3', 2);
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.WATER;
    S.map.terrain[MapGen.idx(cx, cy - 1)] = T.WATER;
    S.map.terrain[MapGen.idx(cx, cy + 1)] = T.WATER;
    ck('crossingStillRejectsOpenLake', !Terraform.bridgeCrossing(cx, cy, 'P'), String(Terraform.bridgeCrossing(cx, cy, 'P')));
  }

  // ---- 4. end-to-end: tap the bridge tool onto a forest-shored water tile,
  //         the sapper actually builds it, and can then clear the far shore ----
  {
    const { s, cx, cy } = setup('br4', 3);   // tier 3: bridge AND clear
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.FOREST;
    ck('jobDetectedAsBridge', Units.terraformJob('P', cx, cy) === 'bridge', Units.terraformJob('P', cx, cy));
    const assigned = Units.assignTerraform(s, cx, cy, 'bridge');
    ck('bridgeTaskAssignedOverForestShore', assigned && s.task && s.task.job === 'bridge', JSON.stringify(s.task));
    const secs = runUntil(() => !s.task, 15);
    ck('bridgeBuiltOverForestShore', !!Bld.bridgeAt(cx, cy), `after ${secs.toFixed(1)}s, bridgeAt=${JSON.stringify(Bld.bridgeAt(cx, cy))}`);
    ck('sapperFreedAfterBuild', !s.task, JSON.stringify(s.task));
    ck('logShowsSuccess', S.log.some(l => (l.msg || l).includes('raise a bridge')), JSON.stringify(S.log.slice(-3)));
    // the far shore is still a standing resource — same sapper clears it now
    ck('forestStillStandsPostBridge', S.map.terrain[MapGen.idx(cx + 1, cy)] === T.FOREST, S.map.terrain[MapGen.idx(cx + 1, cy)]);
    const clearAssigned = Units.assignTerraform(s, cx + 1, cy, 'clear');
    ck('clearTaskAssignedOnLandingTile', clearAssigned && s.task && s.task.job === 'clear', JSON.stringify(s.task));
    runUntil(() => !s.task, 15);
    ck('landingTileClearedAfterBridge', S.map.terrain[MapGen.idx(cx + 1, cy)] === T.GRASS, S.map.terrain[MapGen.idx(cx + 1, cy)]);
    ck('landingTileNowPassable', Path.passable(cx + 1, cy, 'P'), '');
  }

  // ---- 5. mid-work revalidation uses bridgeCrossing, not just "still water":
  //         if the far shore turns genuinely unbridgeable WHILE the sapper is
  //         working, the job drops promptly instead of silently burning the
  //         full timer and finishing with nothing ----
  {
    const { s, cx, cy } = setup('br5', 2);
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.FOREST;
    Units.assignTerraform(s, cx, cy, 'bridge');
    // get the sapper onto its stand tile and mid-timer, then invalidate the span
    runUntil(() => s.task && s.task.type === 'terraform' && s.task.t < s.task.total - 0.3, 5);
    ck('workStartedBeforeInvalidation', !!(s.task && s.task.job === 'bridge'), JSON.stringify(s.task));
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.MOUNTAIN;   // the far shore just became truly impassable
    Units.update(1 / 10);   // one more tick — stillValid should catch it now, not after 6s
    ck('invalidatedSpanDropsQuickly', !(s.task && s.task.job === 'bridge' && s.task.x === cx && s.task.y === cy),
      JSON.stringify(s.task));
    // let the rest of the would-be timer elapse — still nothing gets built
    runUntil(() => !s.task, 15);
    ck('noBridgeFromInvalidatedSpan', !Bld.bridgeAt(cx, cy), JSON.stringify(Bld.bridgeAt(cx, cy)));
  }

  // ---- 6. defensive: if Bld.buildBridge ever fails AT completion despite a
  //         valid span (future regression in that function), the player gets
  //         a toast — never silence ----
  {
    const { s, cx, cy } = setup('br6', 2);
    S.map.terrain[MapGen.idx(cx + 1, cy)] = T.GRASS;
    Units.assignTerraform(s, cx, cy, 'bridge');
    runUntil(() => s.task && s.task.type === 'terraform' && s.task.t < 0.2, 10);
    ck('aboutToCompleteBeforeForcedFailure', !!(s.task && s.task.t < 0.2), JSON.stringify(s.task));
    const origBuild = Bld.buildBridge;
    Bld.buildBridge = () => false;
    let toastMsg = null;
    const origToast = UI.toast.bind(UI);
    UI.toast = (msg, warn) => { if (warn) toastMsg = msg; };
    Units.update(1);
    UI.toast = origToast;
    Bld.buildBridge = origBuild;
    ck('completionFailureToasts', toastMsg === 'The crossing fell through — can’t bridge there', JSON.stringify(toastMsg));
    ck('completionFailureBuildsNothing', !Bld.bridgeAt(cx, cy), JSON.stringify(Bld.bridgeAt(cx, cy)));
  }

  /* ---- 4. REINFORCING TAKES TIME, AND TAKES A SAPPER ---- */
  {
    G.newGame('brup', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    const cx = tc.x + 5, cy = tc.y;
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    for (let y = cy - 3; y <= cy + 3; y++) S.map.terrain[MapGen.idx(cx, y)] = T.WATER;
    Bld._block = null;
    const sc = Bld.place('P', 'sapper', tc.x + 2, tc.y + 2, { free: true }); Bld.finish(sc); sc.level = 3;
    Bld.buildBridge('P', cx, cy);
    const br = Bld.bridgeAt(cx, cy);
    S.units = [];   // no sapper anywhere — the works must simply wait
    ck('everyTierHasATimer',
      CFG.BRIDGE.levels.slice(1).every(l => l.time > 0 && l.cost), 'L2/L3 carry cost AND time');

    // ordering the works pays, but raises NOTHING on the spot
    const before = { wood: S.res.wood, stone: S.res.stone, gold: S.res.gold };
    const ordered = Bld.orderBridgeUpgrade(br);
    const paid = { wood: before.wood - S.res.wood, stone: before.stone - S.res.stone, gold: before.gold - S.res.gold };
    ck('orderingIsNotUpgrading',
      ordered === true && br.level === 1 && br.upTo === 2 &&
      br.upgrading === CFG.BRIDGE.levels[1].time,
      'lv ' + br.level + ', ' + br.upgrading + ' days of works standing');
    ck('theStoneIsPaidUpFront',
      JSON.stringify(paid) === JSON.stringify(CFG.BRIDGE.levels[1].cost), JSON.stringify(paid));
    ck('oneSetOfWorksAtATime', Bld.orderBridgeUpgrade(br) === false && Bld.canUpgradeBridge(br) === false, '');

    // …and nothing happens at all until a sapper stands at it
    for (let i = 0; i < 400; i++) Units.update(0.1);
    ck('noSapperNoProgress',
      br.level === 1 && br.upgrading === CFG.BRIDGE.levels[1].time,
      'forty seconds and not a stone laid');

    const sap = Units.spawn('sapper', 'P', cx - 2, cy);
    ck('theSapperTakesTheJob',
      Units.assignTerraform(sap, cx, cy, 'bridgeup') === true &&
      sap.task.job === 'bridgeup' && Units.canTerraform('P', cx, cy, 'bridgeup') === true, '');
    ck('itIsTheAutoDetectedJobToo', Units.terraformJob('P', cx, cy) === 'bridgeup',
      'a sapper tapped onto its own standing works knows what to do');
    ck('theWorkLineSaysSo', /reinforc/i.test(Units.workReport(sap).what || ''),
      Units.workReport(sap).what);
    let n = 0;
    while (br.upgrading > 0 && n < 4000) { Units.update(0.1); n++; }
    const secs = n / 10, expect = CFG.BRIDGE.levels[1].time * CFG.DAY_MS / 1000;
    ck('itRunsOnTheBuildingClock', Math.abs(secs - expect) < expect * 0.25,
      secs.toFixed(1) + 's for ' + CFG.BRIDGE.levels[1].time + ' days (expected ~' + expect + 's)');
    ck('andThenTheSpanIsStone',
      br.level === 2 && br.maxhp === CFG.BRIDGE.levels[1].hp && br.hp === br.maxhp &&
      !br.upgrading, 'lv ' + br.level + ' hp ' + br.hp);
    ck('theSapperIsFreeAgain', !sap.task || sap.task.type !== 'terraform', JSON.stringify(sap.task));

    // TWO sappers halve it — the clock is on the bridge, not on one pair of hands
    S.units = [];
    Bld.orderBridgeUpgrade(br);
    const total = br.upTotal;
    const a = Units.spawn('sapper', 'P', cx - 2, cy - 1), b2 = Units.spawn('sapper', 'P', cx + 2, cy + 1);
    Units.assignTerraform(a, cx, cy, 'bridgeup'); Units.assignTerraform(b2, cx, cy, 'bridgeup');
    let n2 = 0;
    while (br.upgrading > 0 && n2 < 4000) { Units.update(0.1); n2++; }
    const solo = total * CFG.DAY_MS / 1000;
    ck('twoSappersHalveIt', Math.abs(n2 / 10 - solo / 2) < solo * 0.3,
      (n2 / 10).toFixed(1) + 's for ' + total + ' days, vs ~' + solo + 's alone');
    ck('theArchIsUp', br.level === 3 && Bld.canUpgradeBridge(br) === false, 'lv ' + br.level + ', max');

    // the works survive the sapper being cut down mid-span
    G.newGame('brup2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc2 = Bld.tcOf('P'), dx = tc2.x + 5, dy = tc2.y;
    for (let y = dy - 3; y <= dy + 3; y++) for (let x = dx - 3; x <= dx + 3; x++) {
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    for (let y = dy - 3; y <= dy + 3; y++) S.map.terrain[MapGen.idx(dx, y)] = T.WATER;
    Bld._block = null;
    const sc2 = Bld.place('P', 'sapper', tc2.x + 2, tc2.y + 2, { free: true }); Bld.finish(sc2); sc2.level = 3;
    Bld.buildBridge('P', dx, dy);
    const br2 = Bld.bridgeAt(dx, dy);
    S.units = [];
    Bld.orderBridgeUpgrade(br2);
    const s3 = Units.spawn('sapper', 'P', dx - 2, dy);
    Units.assignTerraform(s3, dx, dy, 'bridgeup');
    for (let i = 0; i < 100; i++) Units.update(0.1);
    const part = br2.upgrading;
    Units.despawn ? Units.despawn(s3) : S.units.splice(S.units.indexOf(s3), 1);
    for (let i = 0; i < 100; i++) Units.update(0.1);
    ck('progressOutlivesTheSapper',
      br2.upgrading === part && part > 0 && part < br2.upTotal,
      part.toFixed(2) + ' days left, held while nobody works it');
    // and a save carries the half-finished works
    const json = G.saveJSON();
    G.loadJSON(json);
    const br3 = Bld.bridgeAt(dx, dy);
    ck('theWorksRideInTheSave',
      !!br3 && Math.abs(br3.upgrading - part) < 1e-6 && br3.upTo === 2, JSON.stringify(br3 && br3.upgrading));
    const legacy = JSON.parse(json);
    for (const z of legacy.bridges) { delete z.upgrading; delete z.upTo; delete z.upTotal; }
    G.loadJSON(JSON.stringify(legacy));
    ck('legacySpansHaveNoWorks',
      Bld.bridgeAt(dx, dy).upgrading === 0 && Bld.canUpgradeBridge(Bld.bridgeAt(dx, dy)) === true,
      'pre-timer saves reinforce from scratch');
  }

  /* ---- THE WORK SITE RUNS THE WAY THE SPAN DOES ----
     A span is built ACROSS the water, never along it. The site used to draw
     one fixed pattern of slats whatever way the crossing ran, so a
     north-south bridge went up as a raft of planks floating sideways on the
     channel. It now reads Terraform.bridgeCrossing — the same call that
     decides br.dir when the deck lands — and lays two stringers bank to bank
     with the decking planked across them.

     Measured off the rects the frame actually draws on the worked tile
     (the game canvas is tainted by cross-origin art, so pixels are out):
     an E–W span's decking planks stand TALL, an N–S span's lie WIDE. */
  {
    G.newGame('brdir', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    // clamped inward: a town near the east edge would put the second crossing
    // off the board, where every neighbour reads as impassable rim
    const ox = Math.max(6, Math.min(tc.x + 6, CFG.W - 10));
    const oy = Math.max(6, Math.min(tc.y + 6, CFG.H - 6));
    for (let y = oy - 4; y <= oy + 4; y++) for (let x = ox - 4; x <= ox + 8; x++) {
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    // an E–W crossing at (ox, oy) and an N–S one at (ox + 4, oy)
    S.map.terrain[MapGen.idx(ox, oy - 1)] = T.WATER;
    S.map.terrain[MapGen.idx(ox, oy)] = T.WATER;
    S.map.terrain[MapGen.idx(ox, oy + 1)] = T.WATER;
    S.map.terrain[MapGen.idx(ox + 3, oy)] = T.WATER;
    S.map.terrain[MapGen.idx(ox + 4, oy)] = T.WATER;
    S.map.terrain[MapGen.idx(ox + 5, oy)] = T.WATER;
    Bld._block = null;
    ck('theTwoCrossingsRunDifferentWays',
      Terraform.bridgeCrossing(ox, oy, 'P') === 'h' &&
      Terraform.bridgeCrossing(ox + 4, oy, 'P') === 'v',
      Terraform.bridgeCrossing(ox, oy, 'P') + ' / ' + Terraform.bridgeCrossing(ox + 4, oy, 'P'));

    // every rect the frame draws INSIDE one tile, in tile-local pixels
    const rectsOn = (tx, ty) => {
      const proto = CanvasRenderingContext2D.prototype, orig = proto.fillRect;
      const TL = CFG.TILE, x0 = tx * TL, y0 = ty * TL, got = [];
      proto.fillRect = function (x, y, w, h) {
        if (x >= x0 - 1 && y >= y0 + 3 && x + w <= x0 + TL + 1 && y + h <= y0 + TL - 2 &&
            Math.max(w, h) >= 12) got.push({ w, h });
        return orig.apply(this, arguments);
      };
      const vis = G.visibleAt; G.visibleAt = () => true;
      R.centerOn(tx + 0.5, ty + 0.5);
      try { R.draw(0.016); } finally { proto.fillRect = orig; G.visibleAt = vis; }
      return got;
    };
    const shape = (tx, ty) => {
      const r = rectsOn(tx, ty);
      return { tall: r.filter(o => o.h > o.w).length, wide: r.filter(o => o.w > o.h).length };
    };
    // put a sapper on each crossing, mid-build
    const site = (x, y) => {
      const s = Units.spawn('sapper', 'P', x - 1, y);
      s.x = x - 0.5; s.y = y + 0.5;
      s.task = { type: 'terraform', job: 'bridge', x, y, sx: x - 1, sy: y, t: 4, total: 10 };
      return s;
    };
    site(ox, oy); site(ox + 4, oy);
    const hS = shape(ox, oy), vS = shape(ox + 4, oy);
    ck('anEastWestSiteDecksInTallPlanks', hS.tall > hS.wide, JSON.stringify(hS));
    ck('aNorthSouthSiteDecksInWidePlanks', vS.wide > vS.tall, JSON.stringify(vS));
    ck('theTwoSitesAreNotTheSameDrawing',
      hS.tall !== vS.tall && hS.wide !== vS.wide,
      'E–W ' + JSON.stringify(hS) + ' · N–S ' + JSON.stringify(vS));
    // …and the FINISHED deck still agrees with the site that raised it
    const okH = Bld.buildBridge('P', ox, oy), okV = Bld.buildBridge('P', ox + 4, oy);
    const dH = Bld.bridgeAt(ox, oy), dV = Bld.bridgeAt(ox + 4, oy);
    ck('theFinishedDecksKeepThoseDirections',
      !!dH && !!dV && dH.dir === 'h' && dV.dir === 'v',
      'built ' + okH + '/' + okV + ' → ' + (dH && dH.dir) + ' / ' + (dV && dV.dir));
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BRIDGE-SHORE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
