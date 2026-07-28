/* CHASE-COMMIT CONTRACT — a hunter walks its detour like it means it, and no
   land unit is ever wedged in ground that blocks it.

   One player screenshot (day 22): a rival defender "stuck in the trees",
   jittering at a concave forest corner beside the villager it was hunting —
   for minutes, never landing a blow. The trap was the close-range straight
   steer fighting the pathfinder: `d < 3` steering fired whenever ANY
   micro-step toward the prey was momentarily clear, yanked the unit off its
   freshly planned detour AND nulled the path; the next half-second repath
   planned the same detour again. Plan two steps, get yanked back, forever.

   Fixes, two layers plus a courtesy:
     · COMMIT — while a chase path is underway, the straight steer only takes
       over for the final LUNGE (one clear step from striking range,
       reach + 0.5). Open-field chases are untouched: with no obstacle there
       is never a path, so the steer runs every frame exactly as before.
     · DROP — the unreachable-prey abandon (path end further than reach + 1
       from the target) now covers the rival's soldiers ('A') as well as
       barbarians ('R'): a hunter whose quarry genuinely cannot be reached
       clears the lock and lets its own seek pick a reachable mark. Player
       units keep their explicit orders.
     · GROUND-TRUTH RESCUE (units.js) — the world reshapes under standing
       feet (a stump regrows to forest, a channel floods): any land unit ON a
       tile that now blocks it slides to the nearest open tile, orders
       intact, instead of being wedged for good.

   On the reported save the defender now commits to the horseshoe around the
   woods, its guard leash rightly judges the chase too long, and it marches
   home — instead of orbiting a treeline corner. An attacker under an
   explicit attack order (no leash) walks the detour all the way in.

   Run this after touching any of:
     combat.js — the tUnit chase branch in update (the steer/lunge gate, the
                 unreachable-prey drop), canReach
     units.js — the ground-truth rescue block in update, followPath, moving
     map.js — Path.canStep, Path.find, BLOCK_TERR

     node tests/chase-commit.mjs      # exits non-zero on any regression

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

  // the trap geometry, copied tile-for-tile from the reported day-22 save:
  // a concave forest corner with the prey tucked behind it on a stump notch
  const PAT = [
    'g g g F F F F F F',
    'g g g F F F F F g',
    'g g g F F F F F g',
    'g g F F F F F s g',
    'g g F s g h h g g',
    'F F h g g g g g g',
    'g F g F g g g g g',
    'F F g g g g g g g',
  ];
  const TT = { g: T.GRASS, F: T.FOREST, s: T.STUMPS, h: T.HILLS };
  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const bx = 20, by = 20;
    for (let dy = -2; dy <= 9; dy++) for (let dx = -2; dx <= 10; dx++) S.map.terrain[MapGen.idx(bx + dx, by + dy)] = T.GRASS;
    PAT.forEach((row, dy) => row.split(' ').forEach((c, dx) => { S.map.terrain[MapGen.idx(bx + dx, by + dy)] = TT[c]; }));
    return { bx, by };
  };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };

  // ---- 1. the treeline trap: an ordered attacker COMMITS to the detour and
  //         actually gets there — no more orbiting the corner ----
  {
    const { bx, by } = setup('cc1');
    const v = Units.spawn('villager', 'P', bx + 3, by + 4); v.x = bx + 3.5; v.y = by + 4.1;
    const a = Units.spawn('defender', 'A', bx + 2, by + 2);
    a.x = bx + 2.88; a.y = by + 2.99;
    a.task = { type: 'attack' }; a.tUnit = v.id; a.anchor = { x: v.x, y: v.y };
    const sx = a.x, sy = a.y;
    run(5);
    const disp5 = Math.hypot(a.x - sx, a.y - sy);
    ck('attackerCommitsToTheDetour', disp5 > 1.2, `displacement after 5s = ${disp5.toFixed(2)} (an orbit stays ~0.3)`);
    const t = run(20, () => !Units.get(v.id) || v.hp < 40);
    ck('preyIsActuallyReached', !Units.get(v.id) || v.hp < 40, `villager hp=${Units.get(v.id) ? v.hp : 'dead'} after +${t}s`);
  }

  // ---- 2. open-field chases are byte-for-byte alive: close and strike fast ----
  {
    const { bx, by } = setup('cc2');
    const v = Units.spawn('villager', 'P', bx + 6, by + 6);
    const a = Units.spawn('defender', 'A', bx + 8, by + 7);
    a.task = { type: 'attack' }; a.tUnit = v.id; a.anchor = { x: v.x, y: v.y };
    const t = run(4, () => v.hp < 40);
    ck('openFieldStrikeLandsFast', v.hp < 40, `villager hp=${v.hp} after ${t}s`);
  }

  // ---- 3. a GUARD (leashed) caught in the trap gives the chase up cleanly
  //         instead of jittering: it leaves the corner, then drops the lock ----
  {
    const { bx, by } = setup('cc3');
    const v = Units.spawn('villager', 'P', bx + 3, by + 4); v.x = bx + 3.5; v.y = by + 4.1;
    const a = Units.spawn('defender', 'A', bx + 2, by + 2);
    a.x = bx + 2.88; a.y = by + 2.99;
    a.task = { type: 'move', x: bx + 3, y: by + 16 };            // a patrol order, not an attack — the leash applies
    a.tUnit = v.id; a.anchor = { x: bx + 3.5, y: by + 16.5 };    // anchored far to the south, like the save
    run(12);
    const inTrap = Math.hypot(a.x - (bx + 2.88), a.y - (by + 2.99)) < 1;
    ck('guardNeverOrbitsTheCorner', !inTrap || !a.tUnit, `at ${a.x.toFixed(1)},${a.y.toFixed(1)} tUnit=${a.tUnit}`);
  }

  // ---- 4. ground-truth rescue: terrain reshaped under a standing unit frees
  //         it to the nearest open tile, orders intact ----
  {
    const { bx, by } = setup('cc4');
    const a = Units.spawn('defender', 'A', bx + 6, by + 6);
    a.task = { type: 'move', x: bx + 1, y: by + 6 };
    S.map.terrain[MapGen.idx(a.x | 0, a.y | 0)] = T.FOREST;      // the woods regrow under its feet
    run(0.3);
    const t2 = S.map.terrain[MapGen.idx(a.x | 0, a.y | 0)];
    ck('reshapedGroundFreesTheUnit', !Path.blocksLand(t2), `standing on terrain ${t2}`);
    ck('rescueKeepsTheOrders', !!(a.task && a.task.type === 'move'), JSON.stringify(a.task));
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL CHASE-COMMIT CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
