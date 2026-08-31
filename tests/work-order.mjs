/* WORK-ORDER CONTRACT — a line of walls or trenches is worked so the worker
   never boxes itself in, or boxes itself out of its own remaining work.

   The player report: "Often they build the nearest item and then box
   themselves out, and have to walk all the way around to finish; or they box
   out a part of the wall and can't reach it… We want a scenario where they
   say, if I do spot 2 first, I won't be able to reach spot 1, so I'll start
   with spot 1 first."

   The rule (Units.pickWorkOrder): a finished wall blocks the tile it stands
   on; so does a dug trench. From the pending line, take the NEAREST job whose
   completion still leaves every other pending job workable — simulated by
   flooding the map from where the worker will stand, with the finished tile
   treated as solid. In open ground that is exactly the old nearest-first (no
   pointless trek to the far end); across a choke the near job IS the cut, so
   the pick falls past it to the far side — cross first, then work homeward.
   Two companions:
     · KEEP A WAY HOME (Units.assignTerraform): a dig is worked standing on
       the side that still connects to the town once the tile is a trench —
       never from a pocket the sapper's own line is about to close.
     · FIFO stays for lines whose ORDER MEANS SOMETHING: bridge/clear/mound
       chains open ground (the AI's breach lanes chain landings; mounds are
       sorted shore-first) — those queues are untouched.

   Wired in at all three decision points: UI.commitWallDrag (which end of a
   fresh wall line the builder starts at), the build-task continuation in
   units.js (which section a freed builder walks to next), and
   Units.startNextTerraform (which queued dig a sapper takes next).

   Run this after touching any of:
     units.js — pickWorkOrder, _floodReach, _jobStands, startNextTerraform,
                queueTerraform, assignTerraform, the build-task continuation
     ui.js — commitWallDrag, commitTerraDrag
     map.js — Path.passable, Terraform.dig/digWouldSeal

     node tests/work-order.mjs      # exits non-zero on any regression

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
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  /* Arena: the hall anchored WELL inside the map (MapGen.idx wraps off-board
     writes!), a grass field east of it, and — when carveNeck is on — a
     one-tile corridor at y=25 walled by water rows, capped by water at x=37:

         y=24  ~~~~~~~~~~~~~~~~ (water, x 23..37)
         y=25  . . [30] 31 [32] 33..36 ~   ← the corridor; work sites bracketed
         y=26  ~~~~~~~~~~~~~~~~ (water)

     Everything east of a finished cut at 30 is reachable ONLY through the
     corridor — the box-out geometry from the report. */
  const setup = (seed, carveNeck) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    S.map.explored.fill(1);
    // grass the WHOLE box, building footprints included — the relocated hall
    // keeps whatever terrain the seed rolled at (20,25), and a water tile
    // under it would break every "can the worker still get home?" flood
    for (let dy = -8; dy <= 8; dy++) for (let dx = -6; dx <= 20; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    if (carveNeck) {
      for (let x = 23; x <= 37; x++) {
        S.map.terrain[MapGen.idx(x, 24)] = T.WATER;
        S.map.terrain[MapGen.idx(x, 26)] = T.WATER;
      }
      S.map.terrain[MapGen.idx(37, 25)] = T.WATER;
    }
    S.units = [];   // hermetic: only the workers each scene spawns
    return { tc };
  };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };
  const terr = (x, y) => S.map.terrain[MapGen.idx(x, y)];
  const dug = (x, y) => terr(x, y) === T.TRENCH || terr(x, y) === T.MOAT;
  // "still connected to the town" = can reach the hall's DOORSTEP. The hall
  // itself is solid ground now (Bld.solid — tests/buildings-block.mjs), so
  // flooding to its centre tile would always answer no.
  const homeConnected = (u) => {
    const R = Units._floodReach(u.x | 0, u.y | 0, u.owner, -1);
    return Units.homeSteps(u.owner).some(hi => R[hi]);
  };

  // ---- 1. THE reported scenario, trenches: two digs in a one-tile corridor.
  //         Queued near-first; the sapper must take the FAR one first, work
  //         homeward, and end on the town side of its own cuts ----
  {
    const { tc } = setup('wo1', true);
    Bld.place('P', 'sapper', tc.x - 3, tc.y - 3, { free: true, instant: true });
    const u = Units.spawn('sapper', 'P', 26, 25);
    Units.queueTerraform(u, [{ x: 30, y: 25, job: 'dig' }, { x: 32, y: 25, job: 'dig' }]);   // near first — the bad order
    ck('farTrenchDugFirst', !!(u.task && u.task.type === 'terraform' && u.task.x === 32),
      `first task at ${u.task && u.task.x},${u.task && u.task.y}`);
    const t1 = run(60, () => dug(32, 25));
    // KEEP A WAY HOME: the second dig is worked from the town side (x=29),
    // never from the one-tile pocket at x=31 between the two cuts
    ck('secondDigStandsHomeSide', !!(u.task && u.task.x === 30 && u.task.sx === 29),
      `after ${t1}s task=${u.task && u.task.x} stand=${u.task && u.task.sx}`);
    const t2 = run(60, () => dug(30, 25));
    ck('bothTrenchesDug', dug(30, 25) && dug(32, 25), `after +${t2}s: 30=${terr(30, 25)} 32=${terr(32, 25)}`);
    ck('sapperNotMarooned', homeConnected(u, tc), `sapper at ${u.x.toFixed(1)},${u.y.toFixed(1)}`);
  }

  // ---- 2. same choke, walls: a dragged line of three sections. The builder
  //         starts at the FAR end, closes the line homeward, finishes ALL of
  //         it, and ends on the town side ----
  {
    const { tc } = setup('wo2', true);
    const v = Units.spawn('villager', 'P', 26, 25);
    UI.wallGhost = [{ x: 30, y: 25, ok: true }, { x: 31, y: 25, ok: true }, { x: 32, y: 25, ok: true }];
    UI.commitWallDrag();
    const siteAt = (x) => S.buildings.find(b2 => b2.key === 'wall' && b2.x === x && b2.y === 25);
    ck('wallLinePlaced', !!(siteAt(30) && siteAt(31) && siteAt(32)), '');
    ck('builderStartsAtTheFarEnd', !!(v.task && v.task.type === 'build' && v.task.id === siteAt(32).id),
      `assigned to x=${(S.buildings.find(b2 => v.task && b2.id === v.task.id) || {}).x}`);
    const allUp = () => [30, 31, 32].every(x => siteAt(x) && siteAt(x).construction <= 0);
    const t = run(150, allUp);
    ck('wholeLineGetsBuilt', allUp(), `after ${t}s: ` + [30, 31, 32].map(x => siteAt(x) && +siteAt(x).construction.toFixed(2)).join(','));
    ck('builderNotWalledOut', homeConnected(v, tc), `builder at ${v.x.toFixed(1)},${v.y.toFixed(1)}`);
  }

  // ---- 3. open ground: no choke, no reordering — nearest-first stands, so
  //         nobody treks to the far end of a line for no reason ----
  {
    const { tc } = setup('wo3', false);
    Bld.place('P', 'sapper', tc.x - 3, tc.y - 3, { free: true, instant: true });
    const u = Units.spawn('sapper', 'P', 26, 25);
    Units.queueTerraform(u, [{ x: 28, y: 25, job: 'dig' }, { x: 31, y: 25, job: 'dig' }]);
    ck('openFieldDigStaysNearestFirst', !!(u.task && u.task.x === 28), `first task at ${u.task && u.task.x}`);
    const v = Units.spawn('villager', 'P', 26, 20);
    UI.wallGhost = [{ x: 28, y: 20, ok: true }, { x: 29, y: 20, ok: true }, { x: 30, y: 20, ok: true }];
    UI.commitWallDrag();
    const got = S.buildings.find(b2 => v.task && b2.id === v.task.id);
    ck('openFieldWallStaysNearestFirst', !!(got && got.x === 28), `assigned to x=${got && got.x}`);
  }

  // ---- 4. order-carrying queues are untouched: a clear line (and any other
  //         non-dig chain) is worked strictly first-in-first-out ----
  {
    const { tc } = setup('wo4', false);
    const camp = Bld.place('P', 'sapper', tc.x - 3, tc.y - 3, { free: true, instant: true });
    camp.level = 3;   // clears are tier 3
    for (const x of [30, 28]) { S.map.terrain[MapGen.idx(x, 25)] = T.FOREST; S.map.resAmount[MapGen.idx(x, 25)] = 100; }
    const u = Units.spawn('sapper', 'P', 26, 25);
    Units.queueTerraform(u, [{ x: 30, y: 25, job: 'clear' }, { x: 28, y: 25, job: 'clear' }]);   // far queued first, on purpose
    ck('clearLineStaysFIFO', !!(u.task && u.task.x === 30), `first task at ${u.task && u.task.x} (FIFO keeps the queued order)`);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WORK-ORDER CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
