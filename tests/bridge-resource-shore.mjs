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

   Run this after touching any of:
     map.js — Terraform.bridgeCrossing, bridgeable, CLEARABLE
     units.js — the terraform task branch in Units.update (stillValid,
                the job==='bridge' completion block), assignTerraform,
                canTerraform, terraformJob, startNextTerraform
     buildings.js — Bld.buildBridge, bridgeAt
     ui.js — the terraMode==='bridge' tap-order branch

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

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BRIDGE-SHORE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
