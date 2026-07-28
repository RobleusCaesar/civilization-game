/* DEFEND-HOLD CONTRACT — Defend means the defenses, not the landscape.

   One player report (day 148): "my soldiers keep ranging out too far … out
   of the range of my towers for support and getting killed. When I have a
   wall they are always venturing outside the walls." The old holdRadius
   treated NATURAL barriers (forest/water/mountain up to maxNatural 14) as
   the walls of home — on a map ringed by trees, that let guards hold at a
   treeline thirteen tiles out, far past every tower. A treeline is not a
   wall. The defended ground is now built from what the player actually
   raised:

     · no towers, no walls → the tight Town Center ring (r1, ~6-8 tiles);
     · a finished own tower / war camp extends the watch ONLY along threat
       lanes that pass under its arrows (along-ray distance + ~70% of its
       range; a battery more than range+1 off the ray covers nothing there);
     · the own wall line is a hard CEILING — guards hold INSIDE it and wait
       for the breach (ray capped at the first own finished wall/gate,
       walked at half-tiles so diagonals can't be skipped). Enemy walls cap
       nothing. When the section falls, the ceiling lifts and the garrison
       meets what comes through.
     · Want soldiers further out? Turn Defend off — that's the toggle.

   Run this after touching any of:
     units.js — guardCenter, holdRadius, returnToGuard
     combat.js — the defend branches in acquire() and update()
     config.js — CFG.GUARD, tower/warcamp levels (range)

     node tests/defend-hold.mjs      # exits non-zero on any regression

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
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    // anchor the arena WELL inside the map whatever the seed rolled — these
    // scenarios carve absolute geometry east of the hall, and a hall near the
    // rim would push the carve off the board (MapGen.idx wraps!)
    tc.x = 20; tc.y = 25; Bld._block = null;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -4; dx <= 14; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y) && !Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    const u = Units.spawn('defender', 'P', tc.x, tc.y + 2);
    u.defend = true;
    const g = Units.guardCenter(u);
    return { tc, u, g };
  };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };

  // ---- 1. a treeline is NOT a wall: open ground holds the tight ring ----
  {
    const { tc, g } = setup('dh1');
    for (let dy = -3; dy <= 3; dy++) S.map.terrain[MapGen.idx(tc.x + 11, tc.y + dy)] = T.FOREST;
    const hold = Units.holdRadius(g, g.x + 12, g.y);
    ck('treelineIsNotAWall', hold <= (CFG.GUARD.maxRadius || 8) + 0.01, `hold toward the woods = ${hold.toFixed(1)} (r1=${g.r1.toFixed(1)})`);
  }

  // ---- 2. a finished tower extends the watch along ITS lane, and only its lane ----
  {
    const { tc, g } = setup('dh2');
    const tw = Bld.place('P', 'tower', tc.x + 6, tc.y, { free: true, instant: true });
    const east = Units.holdRadius(g, g.x + 12, g.y);
    const north = Units.holdRadius(g, g.x, g.y - 12);
    const expect = Math.hypot(Bld.cx(tw) - g.x, Bld.cy(tw) - g.y) + CFG.BUILDINGS.tower.levels[0].range * 0.7;
    ck('towerExtendsItsOwnLane', Math.abs(east - expect) < 0.6, `east=${east.toFixed(1)} expected≈${expect.toFixed(1)}`);
    ck('offLaneStaysTight', north <= g.r1 + 0.01, `north=${north.toFixed(1)} r1=${g.r1.toFixed(1)}`);
  }

  // ---- 3. a half-built tower extends nothing ----
  {
    const { tc, g } = setup('dh3');
    Bld.place('P', 'tower', tc.x + 6, tc.y, { free: true });   // under construction
    const east = Units.holdRadius(g, g.x + 12, g.y);
    ck('unfinishedTowerExtendsNothing', east <= g.r1 + 0.01, `east=${east.toFixed(1)}`);
  }

  // ---- 4. the own wall line is a ceiling; an enemy wall is not ----
  {
    const { tc, g } = setup('dh4');
    Bld.place('P', 'tower', tc.x + 6, tc.y, { free: true, instant: true });
    for (let dy = -2; dy <= 2; dy++) Bld.place('P', 'wall', tc.x + 8, tc.y + dy, { free: true, instant: true });
    const east = Units.holdRadius(g, g.x + 12, g.y);
    ck('ownWallCapsTheHold', east < (tc.x + 8) - g.x, `east=${east.toFixed(1)} wall at dx=${((tc.x + 8) - g.x).toFixed(1)}`);
    // tear the wall down — the ceiling lifts back to the tower's watch
    for (const w of S.buildings.filter(b2 => b2.key === 'wall' && b2.owner === 'P').slice()) Bld.removeToRuin(w);
    const after = Units.holdRadius(g, g.x + 12, g.y);
    ck('breachLiftsTheCeiling', after > east + 1, `after breach=${after.toFixed(1)}`);
  }
  {
    const { tc, g } = setup('dh5');
    Bld.place('P', 'tower', tc.x + 6, tc.y, { free: true, instant: true });
    for (let dy = -2; dy <= 2; dy++) Bld.place('A', 'wall', tc.x + 8, tc.y + dy, { free: true, instant: true });
    const east = Units.holdRadius(g, g.x + 12, g.y);
    ck('enemyWallIsNoCeiling', east > (tc.x + 8) - g.x, `east=${east.toFixed(1)}`);
  }

  // ---- 5. THE story: behind a wall, the garrison waits for the breach ----
  {
    const { tc, u, g } = setup('dh6');
    // seal the flanks ALL THE WAY to the map rim so the only way in is
    // through the wall line (anything shorter and the raider walks around)
    for (let x = tc.x + 3; x <= CFG.W - 2; x++) {
      S.map.terrain[MapGen.idx(x, tc.y - 3)] = T.WATER;
      S.map.terrain[MapGen.idx(x, tc.y + 3)] = T.WATER;
      for (let dy = -2; dy <= 2; dy++) if (!Bld.at(x, tc.y + dy)) S.map.terrain[MapGen.idx(x, tc.y + dy)] = T.GRASS;
    }
    S.units = S.units.filter(u2 => u2 === u);   // hermetic: just the garrison and its foe
    // …and clear the corridor of starting buildings, or a wall section fails
    // to place on an occupied tile and leaves a silent gap in the line
    S.buildings = S.buildings.filter(b2 => b2.key === 'tc' || b2.x < tc.x + 3 || Math.abs(b2.y - tc.y) > 3);
    Bld._block = null;
    const walls = [];
    for (let dy = -2; dy <= 2; dy++) walls.push(Bld.place('P', 'wall', tc.x + 8, tc.y + dy, { free: true, instant: true }));
    ck('wallLineActuallyStands', walls.every(Boolean), walls.map(w => !!w).join(','));
    let raider = Units.spawn('raider', 'R', tc.x + 11, tc.y); raider.hostileTo = 'P';
    const wallX = tc.x + 8;
    let crossed = false, breached = false;
    let t = 0; const dt = 0.1;
    while (t < 10) {
      Units.update(dt); Combat.update(dt); t += dt;
      if (u.x > wallX) crossed = true;
      const r2 = Units.get(raider.id);
      if (r2 && r2.x < wallX - 0.5) breached = true;
    }
    // the garrison held inside, untouched — and nothing hostile got past the
    // line (the raider batters the wall, or gives it up and leaves; both fine)
    ck('garrisonNeverVenturesPastTheWall', !crossed && u.hp === u.maxhp, `crossed=${crossed} hp=${u.hp}`);
    ck('nothingHostileGotInside', !breached, '');
    // the breach: the wall falls — the garrison meets what comes through
    if (!Units.get(raider.id)) { raider = Units.spawn('raider', 'R', tc.x + 11, tc.y); raider.hostileTo = 'P'; }
    for (const w of walls) if (Bld.get(w.id)) Bld.removeToRuin(w);
    const t2 = run(15, () => !Units.get(raider.id) || raider.hp < raider.maxhp || u.hp < u.maxhp);
    ck('garrisonMeetsTheBreach', !Units.get(raider.id) || raider.hp < raider.maxhp || u.hp < u.maxhp,
      `after ${t2}s: raider ${Units.get(raider.id) ? 'hp ' + raider.hp : 'dead/left'}, defender hp ${u.hp}`);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL DEFEND-HOLD CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
