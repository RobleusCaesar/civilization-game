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
// (pg: the page to set it on — the touch page of §9 shares this)
const setup = (seed, fn, pg = p) => pg.evaluate(({ seed, fn }) => {
  // _demo cleared BEFORE newGame, or the military strip art is skipped and
  // every big unit draws as the 32px stand-in cast (audit GAP3-02)
  Screens._demo = false; G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
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
    Screens._demo = false; G.newGame('dm8b', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
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

/* ---- 9. THE MAP STAYS UNDER THE FINGERS (PX-13 — a phone, real CDP touch).
   Two fingers moved together used to leave the map where it was (5.6 px of a
   100 px move); a pinch zoomed about the fingers' midpoint but never FOLLOWED
   it, so the ground slid out from under them (116 px on a pinch that
   travelled 80); the finger left down after a pinch could not pan at all;
   and every one-finger pan trailed the finger by the 8 px tap slop. Now:
   a pinch is a zoom about the midpoint AND a pan by the midpoint's travel,
   the first pan step after the slop carries the whole travel since the
   press, and when one of two fingers lifts the other pans on — re-armed as
   a drag that is ALREADY moving, so it can never start a wall line, a
   sapper line or a move order, and never counts as a tap. ---- */
{
  const tctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', e => errs.push(String(e)));
  await tp.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  // G and UI are script-level consts — never on window (CLAUDE.md's window.G trap)
  await tp.waitForFunction(() => typeof G === 'object' && typeof UI === 'object' && window.R && R.cv, null, { timeout: 60000 });
  await tp.waitForTimeout(600);
  const tcdp = await tctx.newCDPSession(tp);
  const touch = (type, pts) => tcdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(q => ({ x: q.x, y: q.y, id: q.id, radiusX: 6, radiusY: 6, force: 1 })) });
  const nap = ms => new Promise(r => setTimeout(r, ms));
  const cam = () => tp.evaluate(() => ({ x: R.cam.x, y: R.cam.y, z: R.cam.z }));
  const movedPx = (c0, c1) => Math.hypot(c1.x - c0.x, c1.y - c0.y) * c0.z;
  // a scene with nothing selected and the camera over the middle of the map,
  // well clear of every clamp, so a pan is the fingers' and nothing else's
  const open = (seed, z = 1.2) => setup(seed, () => ({ pts: {} }), tp).then(() => tp.evaluate(z => {
    UI.deselect(); R.cam.z = z; R.centerOn(CFG.W / 2, CFG.H / 2); R.clampCam();
    // every tap the canvas commits is counted — a pinch's last finger must never be one
    if (!UI.__l5spy) {
      UI.__l5spy = { taps: 0, moveCommits: 0, wallCommits: 0, terraCommits: 0 };
      for (const [k, f] of [['handleTap', 'taps'], ['handleDoubleTap', 'taps'], ['commitMoveDrag', 'moveCommits'],
                            ['commitWallDrag', 'wallCommits'], ['commitTerraDrag', 'terraCommits']]) {
        const was = UI[k]; UI[k] = function (...a) { UI.__l5spy[f]++; return was.apply(this, a); };
      }
    }
    for (const k in UI.__l5spy) UI.__l5spy[k] = 0;
  }, z));

  // (a) two fingers moved together carry the map with them
  await open('dm9a');
  let c0 = await cam();
  await touch('touchStart', [{ x: 140, y: 430, id: 1 }, { x: 240, y: 430, id: 2 }]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [{ x: 140 - 10 * k, y: 430, id: 1 }, { x: 240 - 10 * k, y: 430, id: 2 }]); await nap(16); }
  await touch('touchEnd', []);
  let c1 = await cam();
  const two = movedPx(c0, c1);
  ck('twoFingersCarryTheMap', two >= 90 && two <= 110 && Math.abs(c1.z / c0.z - 1) < 0.01,
    `fingers moved 100 px, the map ${two.toFixed(1)} px (zoom ×${(c1.z / c0.z).toFixed(3)})`);

  // (b) a pinch whose midpoint travels keeps the ground under the fingers
  await open('dm9b');
  const m0 = 195, y0 = 430;
  const w0 = await tp.evaluate(({ x, y }) => R.screenToWorld(x, y), { x: m0, y: y0 });
  await touch('touchStart', [{ x: m0 - 50, y: y0, id: 1 }, { x: m0 + 50, y: y0, id: 2 }]);
  let mid = m0;
  for (let k = 1; k <= 12; k++) {
    const half = 50 + 50 * k / 12; mid = m0 - 80 * k / 12;
    await touch('touchMove', [{ x: mid - half, y: y0, id: 1 }, { x: mid + half, y: y0, id: 2 }]); await nap(16);
  }
  const s1 = await tp.evaluate(w => ({ x: (w.x - R.cam.x) * R.cam.z, y: (w.y - R.cam.y) * R.cam.z, z: R.cam.z }), w0);
  await touch('touchEnd', []);
  const drift = Math.hypot(s1.x - mid, s1.y - y0);
  ck('aPinchKeepsTheGroundUnderTheFingers', drift <= 4 && s1.z > 1.9 * 1.2 * 0.95,
    `the ground first under the midpoint ends ${drift.toFixed(1)} px from it (zoom ${s1.z.toFixed(2)})`);

  // (c) the pan that crosses the tap slop carries the travel since the press
  await open('dm9c');
  c0 = await cam();
  await touch('touchStart', [{ x: 200, y: 430, id: 1 }]);
  for (let k = 1; k <= 20; k++) { await touch('touchMove', [{ x: 200 - 2 * k, y: 430, id: 1 }]); await nap(16); }
  await touch('touchEnd', []);
  c1 = await cam();
  const lag = 40 - movedPx(c0, c1);
  ck('aPanDoesNotTrailTheFinger', Math.abs(lag) <= 0.5, `a 40 px pan in 2 px steps trails the finger by ${lag.toFixed(1)} px`);

  // the pinch-then-one-finger gesture, reused by (d)–(g): pinch with fingers at
  // a/b, lift finger 2, drag finger 1 by ~86 px, measured before its release
  const pinchThenDrag = async (a, bb, dir) => {
    await touch('touchStart', [{ x: a.x, y: a.y, id: 1 }, { x: bb.x, y: bb.y, id: 2 }]);
    for (let k = 1; k <= 5; k++) { await touch('touchMove', [{ x: a.x - 6 * k, y: a.y, id: 1 }, { x: bb.x + 6 * k, y: bb.y, id: 2 }]); await nap(16); }
    await touch('touchEnd', [{ x: bb.x + 30, y: bb.y, id: 2 }]);
    await nap(16);
    const before = await cam();
    const fx = a.x - 30;
    for (let k = 1; k <= 8; k++) { await touch('touchMove', [{ x: fx + dir * 10 * k, y: a.y - 4 * k, id: 1 }]); await nap(16); }
    const mid = await tp.evaluate(() => ({ cam: { x: R.cam.x, y: R.cam.y, z: R.cam.z }, wallDrag: !!UI.wallDrag, terraDrag: !!UI.terraDrag,
      moveDrag: !!UI.moveDrag, moveDragArm: !!UI.moveDragArm, downAt: UI.downAt && { moved: UI.downAt.moved } }));
    await touch('touchEnd', []);
    await nap(60);
    return { panned: movedPx(before, mid.cam), mid, travel: Math.hypot(80, 32) };
  };
  // the direction a pan may run without meeting the map's edge: toward the middle
  const inward = () => tp.evaluate(() => { const tc = Bld.tcOf('P'); return tc.x < CFG.W / 2 ? -1 : 1; });

  // (d) after a pinch the finger left down pans, and nothing else
  await open('dm9d');
  let g = await pinchThenDrag({ x: 150, y: 420 }, { x: 240, y: 420 }, 1);
  let spy = await tp.evaluate(() => ({ ...UI.__l5spy }));
  ck('afterAPinchTheLastFingerPans', g.panned >= 0.9 * g.travel, `${g.panned.toFixed(1)} px of a ${g.travel.toFixed(1)} px drag`);
  ck('…andItsLiftIsNeverATap', spy.taps === 0, JSON.stringify(spy));

  // (e) with the wall armed: the last finger pans — it never starts a line
  // (setup centres the camera at the zoom it finds, then sets 1.2 — hand it 1.2
  // first, or a scene after a pinch is framed off-centre)
  const z12 = pg => pg.evaluate(() => { R.cam.z = 1.2; });
  await z12(tp);
  await setup('dm9e', tc => { UI.placing = 'wall'; return { pts: {} }; }, tp);
  await tp.evaluate(() => { R.cam.z = 1.4; R.clampCam(); for (const k in UI.__l5spy) UI.__l5spy[k] = 0; window.__walls0 = S.buildings.filter(x => x.key === 'wall').length; });
  let dir = await inward();
  g = await pinchThenDrag({ x: 160, y: 430 }, { x: 250, y: 430 }, dir);
  spy = await tp.evaluate(() => ({ ...UI.__l5spy, walls: S.buildings.filter(x => x.key === 'wall').length - __walls0 }));
  ck('…neverStartsAWallLine', g.panned >= 0.9 * g.travel && !g.mid.wallDrag && spy.wallCommits === 0 && spy.walls === 0 && spy.taps === 0,
    `panned ${g.panned.toFixed(1)} px, ${JSON.stringify({ ...spy, wallDrag: g.mid.wallDrag })}`);
  await tp.evaluate(() => { UI.placing = null; });

  // (f) with a sapper's dig armed: the last finger pans — it never digs a line
  await z12(tp);
  const sap = await setup('dm9f', tc => {
    Bld.place('P', 'sapper', tc.x + 2, tc.y + 6, { free: true, instant: true });
    const s = Units.spawn('sapper', 'P', tc.x + 3, tc.y + 3);
    UI.select('unit', s.id); UI.terraMode = 'dig';
    return { id: s.id, pts: {} };
  }, tp);
  await tp.evaluate(() => { R.cam.z = 1.4; R.clampCam(); for (const k in UI.__l5spy) UI.__l5spy[k] = 0; });
  dir = await inward();
  g = await pinchThenDrag({ x: 160, y: 430 }, { x: 250, y: 430 }, dir);
  spy = await tp.evaluate(id => { const u = Units.get(id); return { ...UI.__l5spy, task: u.task && u.task.type, queued: (u.tfQueue || u.queue || []).length || 0 }; }, sap.id);
  ck('…neverDigsASapperLine', g.panned >= 0.9 * g.travel && !g.mid.terraDrag && spy.terraCommits === 0 && !spy.task && spy.taps === 0,
    `panned ${g.panned.toFixed(1)} px, ${JSON.stringify({ ...spy, terraDrag: g.mid.terraDrag })}`);

  // (g) the pinch began ON the selected soldier: the last finger pans — never a move order
  await z12(tp);
  const mv = await setup('dm9g', tc => {
    const u = Units.spawn('defender', 'P', tc.x + 4, tc.y + 3);
    UI.select('unit', u.id);
    return { id: u.id, pts: { u: { x: u.x, y: u.y, lift: 1 } } };
  }, tp);
  await tp.evaluate(() => { for (const k in UI.__l5spy) UI.__l5spy[k] = 0; });
  dir = await inward();
  const armed = await tp.evaluate(({ x, y }) => !!UI.dragMoveAnchor(x, y), mv.screen.u);
  g = await pinchThenDrag({ x: mv.screen.u.x, y: mv.screen.u.y }, { x: mv.screen.u.x + 90, y: mv.screen.u.y }, dir);
  spy = await tp.evaluate(id => { const u = Units.get(id); return { ...UI.__l5spy, task: u.task && u.task.type, moving: !!(u.path && u.pathI < u.path.length), sel: UI.sel && UI.sel.id === id }; }, mv.id);
  ck('…neverStartsAMoveOrder', armed && g.panned >= 0.9 * g.travel && !g.mid.moveDrag && !g.mid.moveDragArm &&
    spy.moveCommits === 0 && !spy.task && !spy.moving && spy.sel && spy.taps === 0,
    `press on the soldier armed a drag: ${armed}; panned ${g.panned.toFixed(1)} px, ${JSON.stringify({ ...spy, moveDrag: g.mid.moveDrag })}`);
  await tctx.close();
}

/* ---- 10. THE WHEEL ZOOMS IN PROPORTION; RIGHT-CLICK STAYS IN THE GAME
   (PX-48 — the desktop). Each wheel event used to zoom a fixed 12%, so a
   trackpad flick of twenty small deltas ran the whole range (1.25 → 3.5),
   and a ctrl+wheel trackpad pinch the same; a right-click order also opened
   the browser's context menu. Now a wheel zooms by its own size — pixels,
   or lines ×16, or pages × the window — at exp(−dy × 0.0015), each event
   clamped to 0.8…1.25; a ctrl+wheel pinch follows the pinch's own scale
   (Chromium sends deltaY = −100·ln(scale)); and the canvas swallows
   contextmenu while the HUD and the minimap keep the browser's menu.
   R.minZoom and the 3.5 ceiling are untouched. ---- */
{
  await setup('dm10', tc => ({ pts: {} }));
  const pc = await p.context().newCDPSession(p);
  const mid = await p.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  const wheel = (dy, modifiers = 0) => pc.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: dy, modifiers });
  const zoomTo = z => p.evaluate(z => { R.cam.z = z; R.centerOn(CFG.W / 2, CFG.H / 2); R.clampCam(); return R.cam.z; }, z);
  const zNow = () => p.evaluate(() => R.cam.z);
  const run = async (z0, n, dy, mod = 0) => { await zoomTo(z0); for (let k = 0; k < n; k++) await wheel(dy, mod); await new Promise(r => setTimeout(r, 60)); return (await zNow()) / z0; };

  const flickIn = await run(1.6, 20, -3), flickOut = await run(1.6, 20, 3);
  ck('aTrackpadFlickZoomsGently', Math.abs(flickIn - 1) <= 0.10 && Math.abs(1 - flickOut) <= 0.10,
    `twenty 3-unit deltas: in ×${flickIn.toFixed(3)}, out ×${flickOut.toFixed(3)}`);
  const notchIn = await run(1.6, 1, -100), notchOut = await run(1.6, 1, 100);
  ck('oneMouseNotchZoomsTenToTwentyPercent', notchIn - 1 >= 0.10 && notchIn - 1 <= 0.20 && 1 - notchOut >= 0.10 && 1 - notchOut <= 0.20,
    `deltaY ∓100: in ×${notchIn.toFixed(3)}, out ×${notchOut.toFixed(3)}`);
  // a trackpad PINCH arrives as ctrl+wheel: it must follow the pinch's own scale
  const per = s => -100 * Math.log(s) / 20;
  const pinchIn = await run(2, 20, per(1.5), 2), pinchOut = await run(2, 20, per(1 / 1.5), 2);
  ck('aTrackpadPinchFollowsItsScale', Math.abs(pinchIn / 1.5 - 1) <= 0.08 && Math.abs(pinchOut * 1.5 - 1) <= 0.08,
    `a ×1.5 pinch zooms ×${pinchIn.toFixed(3)}, a ÷1.5 pinch ×${pinchOut.toFixed(3)}`);
  // a wheel's delta is normalised by its mode: three lines are 48 px, not three
  const syn = (dy, mode) => p.evaluate(({ dy, mode }) => {
    const z0 = R.cam.z = 1.6; R.centerOn(CFG.W / 2, CFG.H / 2); R.clampCam();
    R.cv.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: mode, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true }));
    return R.cam.z / z0;
  }, { dy, mode });
  const lines3 = await syn(3, 1), px48 = await syn(48, 0), px3 = await syn(3, 0), page1 = await syn(1, 2);
  ck('aWheelsDeltaIsReadInItsOwnUnits', Math.abs(lines3 - px48) < 1e-6 && Math.abs(lines3 - px3) > 0.01 && page1 >= 0.8 - 1e-9,
    `3 lines ×${lines3.toFixed(4)} = 48 px ×${px48.toFixed(4)} ≠ 3 px ×${px3.toFixed(4)}; one page ×${page1.toFixed(3)} (floor 0.8)`);
  // the clamps hold at both ends, as before
  await zoomTo(1.6); for (let k = 0; k < 40; k++) await wheel(-100);
  const top = await p.evaluate(() => ({ z: R.cam.z, max: R.ZOOM_MAX }));
  await zoomTo(1.6); for (let k = 0; k < 40; k++) await wheel(100);
  const bot = await p.evaluate(() => ({ z: R.cam.z, min: R.minZoom() }));
  ck('theZoomClampsAreUnchanged', top.max === 3.5 && Math.abs(top.z - 3.5) < 1e-9 && Math.abs(bot.z - bot.min) < 1e-9,
    `in: ${top.z.toFixed(3)} (max ${top.max}); out: ${bot.z.toFixed(3)} (min ${bot.min.toFixed(3)})`);

  // right-click: an order on the canvas, with no browser menu; the HUD and the minimap keep theirs
  await p.evaluate(() => { R.cam.z = 1.2; });   // the clamp checks left it at the floor
  const sc = await setup('dm10r', tc => {
    const u = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
    UI.select('unit', u.id);
    window.__ctx = [];
    window.addEventListener('contextmenu', e => __ctx.push({ on: e.target && (e.target.id || e.target.tagName), prevented: e.defaultPrevented }));
    const mini = document.getElementById('mini').getBoundingClientRect(), top = document.getElementById('topbar').getBoundingClientRect();
    return { id: u.id, mini: { x: mini.left + mini.width / 2, y: mini.top + mini.height / 2 }, top: { x: top.left + top.width / 2, y: top.top + top.height / 2 },
             pts: { to: { x: tc.x + 7.5, y: tc.y + 5.5 } } };
  });
  const rclick = async (x, y) => {
    await pc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await pc.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
    await pc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
    await new Promise(r => setTimeout(r, 60));
  };
  await rclick(sc.screen.to.x, sc.screen.to.y);
  const ord = await p.evaluate(id => { const u = Units.get(id); return { task: u.task && u.task.type, ctx: __ctx.slice() }; }, sc.id);
  await rclick(sc.top.x, sc.top.y);
  await rclick(sc.mini.x, sc.mini.y);
  const ctx = await p.evaluate(() => __ctx.slice());
  const onCv = ctx[0], onTop = ctx[1], onMini = ctx[2];
  ck('aRightClickOrderOpensNoBrowserMenu', ord.task === 'move' && onCv && onCv.on === 'c' && onCv.prevented,
    JSON.stringify({ task: ord.task, canvas: onCv }));
  ck('…butTheHudAndTheMinimapKeepTheirs', !!onTop && !onTop.prevented && !!onMini && onMini.on === 'mini' && !onMini.prevented,
    JSON.stringify({ topbar: onTop, minimap: onMini }));
}

/* ---- 11. A STILL PRESS IS A TAP, HOWEVER LONG IT RESTS AND HOWEVER LATE
   THE PAGE HEARS IT (PX-27 — the desktop page, mouse events with their own
   timestamps). From ~0.38 s a still press did nothing — no selection, no
   pan, no word — and a normal tap whose lift waited behind a busy frame was
   dropped, because the 400 ms limit was read off the clock when the handler
   RAN. The press and the lift are now timed by the events' own timestamps,
   and a press that never crossed the 8 px slop is a tap for up to a second
   (UI.bindCanvas). The events carry explicit timestamps here, the way the
   OS stamps an input: an awaited CDP command waits for a busy renderer's
   ack on a loaded host and would stretch the gesture it is measuring. ---- */
{
  const sc = await setup('dm11', tc => {
    S.units = S.units.filter(z => z.owner !== 'W');
    const v = Units.spawn('villager', 'P', tc.x + 5, tc.y + 4);
    UI.deselect();
    return { id: v.id, pts: { v: { x: v.x, y: v.y, lift: 1 } } };
  });
  const mc = await p.context().newCDPSession(p);
  const at = sc.screen.v;
  const mouse = (type, ts) => mc.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1, timestamp: ts });
  const nap = ms => new Promise(r => setTimeout(r, ms));
  const picked = () => p.evaluate(id => !!(UI.sel && UI.sel.type === 'unit' && UI.sel.id === id), sc.id);
  await mc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  // (a) a deliberate press, held still for 600 ms
  let t0 = Date.now() / 1000;
  await mouse('mousePressed', t0); await nap(600); await mouse('mouseReleased', t0 + 0.6);
  await nap(80);
  const held = await picked();
  // (b) an 80 ms tap whose lift waits behind a 600 ms busy frame
  await p.evaluate(() => UI.deselect());
  await nap(450);   // clear of the double-tap window
  t0 = Date.now() / 1000;
  await mouse('mousePressed', t0);
  await p.evaluate(() => { setTimeout(() => { const t = performance.now(); while (performance.now() - t < 600) {} }, 0); });
  await nap(80);
  await mouse('mouseReleased', t0 + 0.08);
  await nap(120);
  const late = await picked();
  ck('aStillPressHeldHalfASecondIsATap', held, held ? 'selected' : 'a 600 ms still press selected nothing');
  ck('aTapHeardLateIsStillATap', late, late ? 'selected' : 'an 80 ms tap behind a 600 ms busy frame was dropped');
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL DRAG-MOVE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(fails.length ? 1 : 0);
