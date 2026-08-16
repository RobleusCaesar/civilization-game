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

  // ---- 6. DOCTRINE BY CLASS: the workshop's engines hold closest and never
  //         chase, the ranges' bows a ring further with one step of trail,
  //         the barracks' blades the outer watch with two ----
  {
    const { tc } = setup('dh7');
    const mk = (kind) => { const u2 = Units.spawn(kind, 'P', tc.x, tc.y + 2); u2.defend = true; return Units.guardCenter(u2); };
    const gm = mk('defender'), gr = mk('archer'), gs = mk('catapult'), gb = mk('ballista');
    ck('classHolds', gm.r1 === 5 && gr.r1 === 4 && gs.r1 === 3 && gb.r1 === 3,
      `melee=${gm.r1} ranged=${gr.r1} catapult=${gs.r1} ballista=${gb.r1}`);
    ck('classChase', gm.chase === 2 && gr.chase === 1 && gs.chase === 0 && gb.chase === 0,
      `melee=${gm.chase} ranged=${gr.chase} catapult=${gs.chase} ballista=${gb.chase}`);
    ck('openGroundHoldIsTheClassHold',
      Units.holdRadius(gm, gm.x + 12, gm.y) === 5 && Units.holdRadius(gs, gs.x + 12, gs.y) === 3, '');
  }

  // ---- 7. an engine on Defend opens fire BY ITSELF — no order needed ----
  {
    const { tc, u } = setup('dh8');
    S.units = [];   // hermetic: just the engine and its mark
    const cat = Units.spawn('catapult', 'P', tc.x, tc.y + 2); cat.defend = true;
    const g = Units.guardCenter(cat);
    // the mark is PINNED at the ring's edge (a free raider just flees a lone
    // catapult and the engine rightly lets the runner go — that release is
    // scenario 9's subject; here the subject is unprompted fire)
    const raider = Units.spawn('raider', 'R', (g.x | 0) + 6, g.y | 0); raider.hostileTo = 'P';
    let acquired = false, maxD = 0;
    let t = 0; const dt = 0.1;
    while (t < 10) {
      raider.x = g.x + 6; raider.y = g.y; raider.path = null; raider.task = null; raider.tUnit = 0; raider.tBld = 0;
      Units.update(dt); Combat.update(dt); t += dt;
      if (cat.tUnit === raider.id) acquired = true;
      maxD = Math.max(maxD, Math.hypot(cat.x - g.x, cat.y - g.y));
      if (!Units.get(raider.id) || raider.hp < raider.maxhp) break;
    }
    ck('siegeFiresUnprompted', acquired && (!Units.get(raider.id) || raider.hp < raider.maxhp),
      `acquired=${acquired} raider=${Units.get(raider.id) ? 'hp ' + raider.hp + '/' + raider.maxhp : 'dead'} after ${t.toFixed(1)}s`);
    ck('siegeNeverLeavesItsRing', maxD <= g.r1 + 0.9, `max distance from hall = ${maxD.toFixed(1)} (ring ${g.r1})`);
  }

  // ---- 8. an engine NOT on Defend is still awake: it fires on what walks
  //         into its own range, and lets the runner go instead of crawling
  //         after it ----
  {
    const { tc } = setup('dh9');
    S.units = [];
    const cat = Units.spawn('catapult', 'P', tc.x + 6, tc.y);   // parked in the field, no stance
    const raider = Units.spawn('raider', 'R', tc.x + 10, tc.y); raider.hostileTo = 'P';
    const pin = (x, y) => { raider.x = x + 0.5; raider.y = y + 0.5; raider.path = null; raider.task = null; raider.tUnit = 0; raider.tBld = 0; };
    let acquired = false;
    let t = 0; const dt = 0.1;
    while (t < 4) { pin(tc.x + 10, tc.y); Units.update(dt); Combat.update(dt); t += dt; if (cat.tUnit === raider.id) acquired = true; }
    ck('unorderedSiegeStillFires', acquired && raider.hp < raider.maxhp,
      `acquired=${acquired} raider hp=${raider.hp}/${raider.maxhp}`);
    const sx = cat.x, sy = cat.y;
    t = 0;
    while (t < 5) { pin(tc.x + 19, tc.y); Units.update(dt); Combat.update(dt); t += dt; }
    ck('siegeNeverPursuesARunner', !cat.tUnit && Math.hypot(cat.x - sx, cat.y - sy) < 1.2,
      `tUnit=${cat.tUnit} drifted ${Math.hypot(cat.x - sx, cat.y - sy).toFixed(1)}`);
  }

  // ---- 9. a blade trails its foe two tiles past the bound, then lets go ----
  {
    const { tc, u, g } = setup('dh10');
    S.units = [u];
    const raider = Units.spawn('raider', 'R', (g.x | 0) + 3, g.y | 0); raider.hostileTo = 'P';
    raider.maxhp = raider.hp = 9999;   // survives to keep retreating
    // phase 1: the raider stands INSIDE the ring until the guard lands a blow…
    let rx = g.x + 3, maxD = 0, engaged = false;
    let t = 0; const dt = 0.1;
    while (t < 25) {
      if (raider.hp < raider.maxhp) rx += 0.12 * dt * 10;   // …phase 2: it falls back east at ~1.2 tiles/s
      raider.x = rx; raider.y = g.y; raider.path = null; raider.task = null; raider.tUnit = 0; raider.tBld = 0;
      Units.update(dt); Combat.update(dt); t += dt;
      if (u.tUnit === raider.id) engaged = true;
      maxD = Math.max(maxD, Math.hypot(u.x - g.x, u.y - g.y));
      if (rx > g.x + 14) break;
    }
    ck('bladeEngagesAtTheRing', engaged && raider.hp < raider.maxhp, `engaged=${engaged} raider hp=${raider.hp}`);
    ck('bladeTrailsTwoTilesNoMore', maxD <= g.r1 + (g.chase || 0) + 0.9,
      `max ${maxD.toFixed(1)} vs bound ${(g.r1 + (g.chase || 0)).toFixed(1)}`);
    const t2 = run(10, () => Math.hypot(u.x - g.x, u.y - g.y) <= g.r1);
    ck('bladeComesHomeAfterTheChase', Math.hypot(u.x - g.x, u.y - g.y) <= g.r1 + 0.2,
      `back inside after ${t2}s, at ${Math.hypot(u.x - g.x, u.y - g.y).toFixed(1)}`);
  }

  // ---- 9b. BACK TO YOUR POST: after a kill — or giving up a chase — the
  //          guard returns to the exact spot it stood when the fight began,
  //          not to a generic point on the ring ----
  {
    const { tc, u, g } = setup('dh12');
    S.units = [u];
    const px = g.x + 3, py = g.y - 3;   // a distinct post, well off the ring's center line
    u.x = px; u.y = py; u.path = null;
    const pin = (r2, x, y) => { r2.x = x; r2.y = y; r2.path = null; r2.task = null; r2.tUnit = 0; r2.tBld = 0; };
    // the kill: a raider breaches the far side of the ring — cut it down, walk home
    let raider = Units.spawn('raider', 'R', (g.x | 0) - 3, (g.y | 0) + 2); raider.hostileTo = 'P';
    let t = 0; const dt = 0.1;
    while (t < 40 && Units.get(raider.id)) { pin(raider, g.x - 3.5, g.y + 2.5); Units.update(dt); Combat.update(dt); t += dt; }
    const t2 = run(15, () => Math.hypot(u.x - px, u.y - py) < 1.2);
    ck('killThenBackToPost', !Units.get(raider.id) && Math.hypot(u.x - px, u.y - py) < 1.2,
      `raider ${Units.get(raider.id) ? 'alive' : 'dead'}; guard ${Math.hypot(u.x - px, u.y - py).toFixed(1)} from post after ${t2}s`);
    // the abandoned chase: a foe engages, then flees the defended ground —
    // the lock releases and the guard resolves back to the same post
    raider = Units.spawn('raider', 'R', (g.x | 0) - 3, (g.y | 0) + 2); raider.hostileTo = 'P';
    raider.maxhp = raider.hp = 9999;
    t = 0;
    while (t < 10 && u.tUnit !== raider.id) { pin(raider, g.x - 3.5, g.y + 2.5); Units.update(dt); Combat.update(dt); t += dt; }
    const engaged = u.tUnit === raider.id;
    t = 0;
    while (t < 15) { pin(raider, g.x + 16, g.y); Units.update(dt); Combat.update(dt); t += dt; if (Math.hypot(u.x - px, u.y - py) < 1.2 && !u.tUnit) break; }
    ck('abandonedChaseBackToPost', engaged && !u.tUnit && Math.hypot(u.x - px, u.y - py) < 1.2,
      `engaged=${engaged} tUnit=${u.tUnit} guard ${Math.hypot(u.x - px, u.y - py).toFixed(1)} from post`);
  }

  // ---- 10. a weaponless hull (siege tower) never picks a fight it can't swing in ----
  {
    const { tc } = setup('dh11');
    S.units = [];
    const st = Units.spawn('siegetower', 'P', tc.x, tc.y + 2); st.defend = true;
    const raider = Units.spawn('raider', 'R', tc.x + 4, tc.y + 2); raider.hostileTo = 'P';
    let locked = false;
    let t = 0; const dt = 0.1;
    while (t < 4) {
      raider.x = tc.x + 4.5; raider.y = tc.y + 2.5; raider.path = null; raider.task = null; raider.tUnit = 0; raider.tBld = 0;
      Units.update(dt); Combat.update(dt); t += dt;
      if (st.tUnit) locked = true;
    }
    ck('weaponlessHullNeverPokes', !locked, `tUnit=${st.tUnit}`);
  }

  /* ---- 10b. WHERE A FRIGHTENED VILLAGER RUNS (Units.fleeSpot): BEHIND the
     nearest of their own soldiers first — a spear between you and the raider
     is better cover than a long sprint to the hall, and it walks the fight
     into the army instead of scattering the workforce — and the Town Center
     only when nobody is under arms. The hiding spot is a step PAST the
     soldier on the far side from the threat. Owner-agnostic: the rival's
     townsfolk run by the same rule. ---- */
  {
    const { tc } = setup('dh14');
    S.units = [];
    const guard = Units.spawn('defender', 'P', tc.x + 8, tc.y);
    const raider = Units.spawn('raider', 'R', tc.x + 14, tc.y);
    const vil = Units.spawn('villager', 'P', tc.x + 11, tc.y);
    Units.damage(vil, 3, raider.id);
    const dest = vil.path && vil.path.length ? vil.path[vil.path.length - 1] : { x: vil.x, y: vil.y };
    const dGuard = Math.hypot(dest.x - guard.x, dest.y - guard.y);
    const behind = Math.hypot(dest.x - raider.x, dest.y - raider.y) >
                   Math.hypot(guard.x - raider.x, guard.y - raider.y);
    ck('aVillagerHidesBehindTheSpear',
      vil.task && vil.task.type === 'flee' && dGuard <= 4 && behind,
      `flees to ${dGuard.toFixed(1)} tiles of the guard, on the far side from the raider`);
    // …and with nobody under arms, the old rule stands: run for the hall
    S.units = S.units.filter(u => u !== guard);
    const vil2 = Units.spawn('villager', 'P', tc.x + 11, tc.y + 1);
    const raider2 = Units.spawn('raider', 'R', tc.x + 14, tc.y + 1);
    Units.damage(vil2, 3, raider2.id);
    const dest2 = vil2.path && vil2.path.length ? vil2.path[vil2.path.length - 1] : { x: vil2.x, y: vil2.y };
    ck('theHallOnlyWhenNobodyIsUnderArms',
      vil2.task && vil2.task.type === 'flee' &&
      Math.hypot(dest2.x - Bld.cx(tc), dest2.y - Bld.cy(tc)) < 5,
      'no soldier standing — the run goes home');
  }

  // ---- 11. the Defend button belongs to the defended ground: a soldier out
  //          past the bounds is attacking, not defending — the button goes,
  //          Stop takes its place. Stand Down stays available anywhere. ----
  {
    const { tc } = setup('dh13');
    S.units = [];
    const near = Units.spawn('defender', 'P', tc.x + 2, tc.y);
    UI.select('unit', near.id);
    ck('defendOfferedAtHome', !!document.querySelector('#panel [data-act="defend"]'), '');
    const far = Units.spawn('defender', 'P', tc.x + 14, tc.y);
    UI.select('unit', far.id);
    ck('defendGoneAfield', !document.querySelector('#panel [data-act="defend"]') &&
      !!document.querySelector('#panel [data-act="stop"]'), 'Stop offered instead');
    far.defend = true;   // already in the stance out there — Stand Down must survive
    UI.renderPanel();
    const btn = document.querySelector('#panel [data-act="defend"]');
    ck('standDownStaysAnywhere', !!btn && /Stand Down/.test(btn.textContent), btn ? btn.textContent.trim() : 'missing');
    far.defend = false;
    const far2 = Units.spawn('archer', 'P', tc.x + 15, tc.y);
    UI.sel = { type: 'group', ids: [far.id, far2.id] };
    UI.renderPanel();
    ck('groupDefendGoneAfield', !document.querySelector('#panel [data-act="gdefend"]'), '');
    UI.deselect();
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL DEFEND-HOLD CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
