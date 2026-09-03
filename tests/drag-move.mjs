/* DRAG-TO-MOVE CONTRACT — the second movement gesture.

   Point-and-tap movement breaks down on crowded tiles: with several archers
   packed inside a wall, tapping a destination near them lands on a bystander
   archer and STEALS THE SELECTION instead of moving anyone — the tap-order
   contract deliberately lets a dead-on tap reselect. So a press that starts
   ON the current selection and DRAGS (>8px) is now an order, not a pan: a
   gold tether follows the finger (UI.moveDrag, drawn in render.js), and
   wherever it lifts, the selected unit or party goes (UI.commitMoveDrag).
   The release NEVER re-selects — that is the whole point of the gesture.

   Release semantics are movement-first but honour the obvious intents:
     · enemy unit under the finger        → attack (unit and party alike)
     · own transport under the finger     → board
     · enemy building / bridge            → attack / sever
     · villager onto a standing resource  → gather (dispatch deselects, as taps do)
     · anything else on explored ground   → walk there (green confirm pulse)
     · unexplored ground                  → the fog is not a wall (§8): the
       first dark rank beside explored ground is orderable, deeper black
       clamps to the nearest pointable tile, only the deep void refuses
   And the surrounding input modes are undisturbed:
     · a press that never crosses the drag threshold is an ordinary TAP —
       selection behaviour is byte-for-byte the old one (tap-audit still rules)
     · a drag that starts anywhere OFF the selection still PANS the camera
     · wall-line and sapper-line drags keep right of way (checked at
       pointerdown before the move-arm)

   Run this after touching any of:
     ui.js — bindCanvas (pointerdown/move/up), dragMoveAnchor, commitMoveDrag,
             handleTap, snapNear, select/deselect
     render.js — the UI.moveDrag / UI.moveFlash ghost blocks, screenToWorld
     units.js — moveTo, groupMove, assignGather, orderBoard
     config.js — SPRITE_LIFT, TILE

     node tests/drag-move.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// set a scene up in-page; returns screen coords for the gesture
const setup = (seed, fn) => p.evaluate(({ seed, fn }) => {
  G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  const tc = Bld.tcOf('P');
  // a clear arena around the hall and the camera square on it
  for (let dy = -2; dy <= 8; dy++) for (let dx = -2; dx <= 10; dx++) {
    const x = tc.x + dx, y = tc.y + dy;
    if (!MapGen.inB(x, y)) continue;
    if (!Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    S.map.explored[MapGen.idx(x, y)] = 1;   // the arena is known ground
  }
  R.centerOn(tc.x + 4, tc.y + 3); R.cam.z = 1.2; R.clampCam(); G.updateVisibility();
  const out = (new Function('tc', 'return (' + fn + ')(tc)'))(tc);
  const at = (wx, wy) => ({ x: (wx * CFG.TILE - R.cam.x) * R.cam.z, y: (wy * CFG.TILE - R.cam.y) * R.cam.z });
  const lift = CFG.SPRITE_LIFT / CFG.TILE;
  return { ...out, screen: Object.fromEntries(Object.entries(out.pts).map(([k, v]) =>
    [k, at(v.x, v.y - (v.lift ? lift : 0))])) };
}, { seed, fn: fn.toString() });

const drag = async (from, to) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await p.mouse.move(to.x, to.y, { steps: 4 });
  await p.mouse.up();
};

// ---- 1. THE crowded tile: six archers on one spot, drag the selected one out —
//         it moves, and the selection is NOT stolen by a bystander ----
{
  const sc = await setup('dm1', tc => {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(Units.spawn('archer', 'P', tc.x + 3, tc.y + 3).id);
    UI.select('unit', ids[0]);
    const u = Units.get(ids[0]);
    return { ids, pts: { from: { x: u.x, y: u.y, lift: 1 }, to: { x: tc.x + 7.5, y: tc.y + 5.5 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ ids, tx, ty }) => {
    const u = Units.get(ids[0]);
    const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
    return { sel: JSON.stringify(UI.sel), task: u.task && u.task.type, end,
             othersMoved: ids.slice(1).filter(id => { const o = Units.get(id); return o.task || (o.path && o.pathI < o.path.length); }).length };
  }, { ids: sc.ids, tx: 0, ty: 0 });
  ck('crowdedDragMovesTheSelected', r.task === 'move' && r.end && Math.hypot(r.end.x - 25, 0) < 99, JSON.stringify(r));
  ck('selectionNotStolenByBystander', r.sel === JSON.stringify({ type: 'unit', id: sc.ids[0] }), r.sel);
  ck('bystandersUntouched', r.othersMoved === 0, `${r.othersMoved} bystanders moved`);
}

// ---- 2. …and the drag actually lands them at the dragged-to tile ----
{
  const sc = await setup('dm2', tc => {
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    UI.select('unit', u.id);
    return { id: u.id, dest: { x: tc.x + 7, y: tc.y + 5 },
             pts: { from: { x: u.x, y: u.y, lift: 1 }, to: { x: tc.x + 7.5, y: tc.y + 5.5 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ id, dest }) => {
    const u = Units.get(id);
    const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
    return { task: u.task && JSON.stringify(u.task), end, dest, flash: !!UI.moveFlash };
  }, { id: sc.id, dest: sc.dest });
  const endOk = r.end && Math.hypot(r.end.x - sc.dest.x, r.end.y - sc.dest.y) <= 1.5;
  ck('dragLandsAtReleasePoint', endOk, JSON.stringify(r));
  ck('confirmPulsePlays', r.flash, '');
}

// ---- 3. a short jiggle (under the drag threshold) is still a plain TAP ----
{
  const sc = await setup('dm3', tc => {
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    UI.select('unit', u.id);
    return { id: u.id, pts: { from: { x: u.x, y: u.y, lift: 1 } } };
  });
  await p.mouse.move(sc.screen.from.x, sc.screen.from.y);
  await p.mouse.down();
  await p.mouse.move(sc.screen.from.x + 3, sc.screen.from.y + 2);
  await p.mouse.up();
  const r = await p.evaluate(({ id }) => {
    const u = Units.get(id);
    return { sel: JSON.stringify(UI.sel), task: u.task && u.task.type, moving: !!(u.path && u.pathI < u.path.length) };
  }, { id: sc.id });
  ck('jiggleIsATapNotAnOrder', !r.task && !r.moving && r.sel === JSON.stringify({ type: 'unit', id: sc.id }), JSON.stringify(r));
}

// ---- 4. a drag that starts OFF the selection still pans the camera ----
{
  const sc = await setup('dm4', tc => {
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    UI.select('unit', u.id);
    return { id: u.id, cam0: { x: R.cam.x, y: R.cam.y },
             pts: { from: { x: tc.x + 6.5, y: tc.y + 5.5 }, to: { x: tc.x + 4.5, y: tc.y + 3.5 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ id, cam0 }) => {
    const u = Units.get(id);
    return { panned: Math.hypot(R.cam.x - cam0.x, R.cam.y - cam0.y) > 4, task: u.task && u.task.type };
  }, { id: sc.id, cam0: sc.cam0 });
  ck('offSelectionDragStillPans', r.panned && !r.task, JSON.stringify(r));
}

// ---- 5. a GROUP drags as one: press any member, all march ----
{
  const sc = await setup('dm5', tc => {
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(Units.spawn('defender', 'P', tc.x + 3 + (i % 2), tc.y + 3).id);
    UI.sel = { type: 'group', ids: ids.slice() }; UI.renderPanel();
    const u = Units.get(ids[2]);
    return { ids, pts: { from: { x: u.x, y: u.y, lift: 1 }, to: { x: tc.x + 7.5, y: tc.y + 5.5 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ ids }) => ({
    sel: UI.sel && UI.sel.type,
    marching: ids.filter(id => { const u = Units.get(id); return u && (u.task || (u.path && u.pathI < u.path.length)); }).length,
  }), { ids: sc.ids });
  ck('groupDragMovesTheWholeParty', r.marching === 4, `${r.marching}/4 marching`);
  ck('groupSelectionSurvives', r.sel === 'group', r.sel);
}

// ---- 6. released on an ENEMY: the drag is an attack order ----
{
  const sc = await setup('dm6', tc => {
    // the arena must hold ONLY the two actors: a wild cow grazing at the drop
    // point once stole the release (hunting an animal under the finger is a
    // legal order, so the drag "worked" — at the wrong target)
    S.units = S.units.filter(z => z.owner !== 'W');
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    const foe = Units.spawn('raider', 'R', tc.x + 5, tc.y + 4); foe.hostileTo = 'P';
    UI.select('unit', u.id);
    G.updateVisibility();   // the foe stands inside the defender's sight
    return { id: u.id, foeId: foe.id,
             pts: { from: { x: u.x, y: u.y, lift: 1 }, to: { x: foe.x, y: foe.y, lift: 1 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ id }) => {
    const u = Units.get(id);
    return { tUnit: u.tUnit, task: u.task && u.task.type };
  }, { id: sc.id });
  ck('dragOntoEnemyAttacks', r.tUnit === sc.foeId && r.task === 'attack', JSON.stringify(r));
}

// ---- 7. a villager released on a forest goes to gather (and is dispatched) ----
{
  const sc = await setup('dm7', tc => {
    const v = Units.spawn('villager', 'P', tc.x + 3, tc.y + 3);
    const fx = tc.x + 7, fy = tc.y + 5;
    S.map.terrain[MapGen.idx(fx, fy)] = T.FOREST;
    S.map.resAmount[MapGen.idx(fx, fy)] = 100;
    UI.select('unit', v.id);
    return { id: v.id, pts: { from: { x: v.x, y: v.y, lift: 1 }, to: { x: fx + 0.5, y: fy + 0.5 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ id }) => {
    const u = Units.get(id);
    return { task: u.task && u.task.type, sel: JSON.stringify(UI.sel) };
  }, { id: sc.id });
  ck('villagerDragToResourceGathers', r.task === 'gather', JSON.stringify(r));
  ck('gatherDispatchDeselects', r.sel === 'null', r.sel);
}

/* ---- 8. THE FOG IS NOT A WALL (from a playtest: pushing a scout forward
   felt "stilted" — the vision frontier is ragged, so a tap that LOOKS just
   past the faded edge landed on black and got "Unexplored"). A WALK order
   tolerates the dark: the FIRST RANK of unexplored tiles beside explored
   ground is directly orderable (you can see its near edge), a point DEEPER
   in the black clamps to the nearest pointable tile (UI.fogWalkTarget — "as
   far as you know" is the graceful answer to "go there"), and only a tap
   into deep void with nothing known within UI.FOG_REACH still refuses, with
   the selection kept. Non-walk orders (gather/claim/fish/terraform) keep the
   hard explored gate — they read what a tile HOLDS, which the fog hides. ---- */
{
  // (a) the first line of the darkness is orderable ground
  const sc = await setup('dm8', tc => {
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    UI.select('unit', u.id);
    // hand-darken an onscreen tile (paused game: visibility won't re-mark it)
    const dark = { x: tc.x + 7, y: tc.y + 5 };
    S.map.explored[MapGen.idx(dark.x, dark.y)] = 0;
    return { id: u.id, dark, pts: { from: { x: u.x, y: u.y, lift: 1 }, to: { x: dark.x + 0.5, y: dark.y + 0.5 } } };
  });
  await drag(sc.screen.from, sc.screen.to);
  const r = await p.evaluate(({ id, dark }) => {
    const u = Units.get(id);
    const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
    return { task: u.task && u.task.type, end, dark };
  }, { id: sc.id, dark: sc.dark });
  ck('theFirstLineOfDarknessIsOrderable', r.task === 'move' && !!r.end &&
    Math.hypot(r.end.x - r.dark.x, r.end.y - r.dark.y) < 1.5, JSON.stringify(r));

  // (b) deeper black clamps to the nearest pointable tile; (c) deep void refuses
  const r2 = await p.evaluate(() => {
    G.newGame('dm8b', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    for (let dy = -2; dy <= 8; dy++) for (let dx = -2; dx <= 10; dx++)
      if (MapGen.inB(tc.x + dx, tc.y + dy) && !Bld.at(tc.x + dx, tc.y + dy))
        S.map.terrain[MapGen.idx(tc.x + dx, tc.y + dy)] = T.GRASS;
    // knowledge is ONLY a small pocket around the unit — everything else is night
    S.map.explored.fill(0);
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++)
      if (MapGen.inB(u.x + dx, u.y + dy)) S.map.explored[MapGen.idx((u.x | 0) + dx, (u.y | 0) + dy)] = 1;
    UI.sel = { type: 'unit', id: u.id }; UI.renderPanel();
    R.centerOn(u.x, u.y); R.cam.z = 1.2; R.clampCam();
    const at = (wx, wy) => ({ x: (wx * CFG.TILE - R.cam.x) * R.cam.z, y: (wy * CFG.TILE - R.cam.y) * R.cam.z });
    // aim toward the map's interior so the deep points stay ON the board —
    // a tap off the board is dropped before any fog rule runs
    const dir = (u.x | 0) > CFG.W / 2 ? -1 : 1;
    // (b) eight tiles into the black — well past the frontier, well inside FOG_REACH
    const deep = { x: (u.x | 0) + dir * 8, y: u.y | 0 };
    let s = at(deep.x + 0.5, deep.y + 0.5);
    UI.commitMoveDrag(s.x, s.y);
    const endB = u.path && u.path.length ? u.path[u.path.length - 1] : null;
    const clamped = { task: u.task && u.task.type, end: endB };
    // the destination sits in the KNOWN band (explored or its first dark rank)
    const pointable = endB && (() => {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++)
        if (MapGen.inB(endB.x + ox, endB.y + oy) && S.map.explored[MapGen.idx(endB.x + ox, endB.y + oy)]) return true;
      return false;
    })();
    // (c) the deep void — nothing known within FOG_REACH — still refuses
    u.task = null; u.path = null;
    const voidT = { x: (u.x | 0) + dir * (UI.FOG_REACH + 6), y: u.y | 0 };
    s = at(voidT.x + 0.5, voidT.y + 0.5);
    UI.commitMoveDrag(s.x, s.y);
    return { clamped, pointable,
      voidRefused: !u.task && !(u.path && u.path.length), sel: JSON.stringify(UI.sel), uid: u.id };
  });
  ck('deeperBlackClampsToTheKnownBand', r2.clamped.task === 'move' && !!r2.clamped.end && r2.pointable,
    JSON.stringify(r2.clamped));
  ck('theDeepVoidStillRefuses', r2.voidRefused && r2.sel === JSON.stringify({ type: 'unit', id: r2.uid }),
    'no order, selection kept');
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL DRAG-MOVE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(fails.length ? 1 : 0);
