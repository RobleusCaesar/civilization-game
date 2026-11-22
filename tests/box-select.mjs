/* BOX SELECT AND THE WORK PARTY CONTRACT (build 213).

   Operator, from a player's request: "On desktop, let's add the ability to
   drag and multi select units and send them somewhere… We have to be careful
   on how we implement this because villagers do different work from
   soldiers, stations only have room for two villagers, etc."

   What every desktop strategy game does, and so what this one does with a
   mouse (UI.boxCanArm / boxRect / boxPick / boxSync / commitBox):
     · a LEFT drag that starts off the selection draws a box; a right or a
       middle drag still pans, a touch still pans, and a drag that starts ON
       the selection is still the move order (tests/drag-move.mjs)
     · the box takes the player's own people whose DRAWN bodies it touches —
       never a bow at his tower post, a man on the stairs, anyone else's —
       and never anything under the bars; its first corner is held on the
       ground; Escape puts it down; Settings can give the left drag back to
       the map (UI.boxOn, neo-box-select)
     · SOLDIERS FIRST, then villagers, then sappers, then fishing boats: one
       party at a time, and the toast names who it left out
     · Shift + drag adds, Shift + click adds or takes out, more of the SAME
       party only; a double-click takes every villager of that kind nearby
   And a party in hand takes its orders the way a foreman shares work out
   (UI.partyOrder): a resource ONE HAND TO A TILE before any tile takes a
   second, a station filled to its places and the rest sent to the next works
   of its kind, then to its own good by hand, a full station a LOOK (rule 6),
   a site built by all, a gold seam claimed by as many as the mine holds, a
   shoal fished from its free sides, a boat to each free water; whoever is put
   to work leaves the hand and whoever found no room stays in it. A party's
   Build sends every one of them to the site placed (UI.builderIds).

   Run this after touching any of:
     ui.js — bindCanvas, boxCanArm / boxRect / boxPick / boxSync / commitBox /
             shiftPick / cancelBox, handleDoubleTap, partyOrder and its
             helpers (spreadGather, partyStation, partySeam, partyShoreFish,
             boatsOrder, sappersOrder), renderParty, chosenBuilders,
             confirmPlacement, commitWallDrag
     buildings.js — Bld.place's builderIds;  units.js — assignShoreFish's edge
     map.js — Path.reachFrom's owner;  feel.js — ringsFor's box rings, escape
     settings.js — the Drag to select switch

     node tests/box-select.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::|supabase|fetch/i.test(m.text())) errs.push('console: ' + m.text()); });
await p.addInitScript(() => {
  try {
    localStorage.setItem('neo-cards-intro', '1'); localStorage.setItem('neo-victory-seen', '1');
    localStorage.setItem('neo-music', '0'); localStorage.setItem('neo-sfx', '0');
  } catch (e) {}
});
await p.goto('file://' + join(root, 'index.html') + '?prologue=0', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof G !== 'undefined' && typeof UI !== 'undefined' && typeof Units !== 'undefined', null, { timeout: 20000 });
await p.waitForTimeout(600);

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const nap = ms => new Promise(r => setTimeout(r, ms));

/* a scene in-page: a fresh world, a clear known arena round the hall, none of
   the player's own people but the ones `fn` puts down; returns what fn
   returns, with every `pts` entry turned into screen px (lift: 1 = the drawn
   body's centre, R.unitHit's, for a unit's spot) */
const setup = (seed, fn) => p.evaluate(({ seed, fn }) => {
  Screens._demo = false; G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  const tc = Bld.tcOf('P');
  // the arena: 20 x 18 tiles beside the hall, kept on the board
  const o = { x: Math.max(3, Math.min(CFG.W - 23, tc.x - 2)), y: Math.max(3, Math.min(CFG.H - 21, tc.y - 2)) };
  const inA = (x, y) => x >= o.x - 2 && x <= o.x + 20 && y >= o.y - 2 && y <= o.y + 18;
  S.buildings = S.buildings.filter(bd => bd === tc || !inA(bd.x, bd.y));
  Bld._block = null;
  for (let y = o.y - 2; y <= o.y + 18; y++) for (let x = o.x - 2; x <= o.x + 20; x++) {
    if (!MapGen.onBoard(x, y)) continue;
    const i = MapGen.idx(x, y);
    if (!Bld.at(x, y)) { S.map.terrain[i] = T.GRASS; S.map.resAmount[i] = 0; }
    S.map.explored[i] = 1;
  }
  S.units = S.units.filter(u => u.owner !== 'P' && !inA(u.x | 0, u.y | 0));
  Units.reindex();
  UI.deselect(); UI.setBoxOn(true);
  R.cam.z = 1.4; R.centerOn(o.x + 8, o.y + 7); R.clampCam();
  const out = (new Function('o', 'tc', 'return (' + fn + ')(o, tc)'))(o, tc) || {};
  Bld._block = null;
  G.updateVisibility();
  const at = (wx, wy) => ({ x: (wx * CFG.TILE - R.cam.x) * R.cam.z, y: (wy * CFG.TILE - R.cam.y) * R.cam.z });
  const body = id => { const u = Units.get(id), TL = CFG.TILE, s = R.unitBox(u) / TL; return at(u.x, u.y - CFG.SPRITE_LIFT / TL - (s - 1) / 2); };
  const pts = {};
  for (const [k, v] of Object.entries(out.pts || {})) pts[k] = v.id ? body(v.id) : at(v.x, v.y);
  return { ...out, o, tc: { x: tc.x, y: tc.y }, pts };
}, { seed, fn: fn.toString() });
// where a unit's drawn body is on the screen now (R.unitHit's centre)
const bodyAt = id => p.evaluate(id => { const u = Units.get(id), TL = CFG.TILE, s = R.unitBox(u) / TL;
  return { x: (u.x * TL - R.cam.x) * R.cam.z, y: ((u.y - CFG.SPRITE_LIFT / TL - (s - 1) / 2) * TL - R.cam.y) * R.cam.z }; }, id);
const scr = (wx, wy) => p.evaluate(([wx, wy]) => ({ x: (wx * CFG.TILE - R.cam.x) * R.cam.z, y: (wy * CFG.TILE - R.cam.y) * R.cam.z }), [wx, wy]);

// a left drag, the real mouse: pressed, carried in steps, a look mid-drag, lifted
const drag = async (a, c, opt = {}) => {
  await p.mouse.move(a.x, a.y);
  await p.mouse.down({ button: opt.button || 'left' });
  await p.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2, { steps: 6 });
  await p.mouse.move(c.x, c.y, { steps: 6 });
  const mid = opt.peek ? await p.evaluate(opt.peek) : null;
  if (opt.before) await opt.before();
  await p.mouse.up({ button: opt.button || 'left' });
  await nap(40);
  return mid;
};
const sel = () => p.evaluate(() => UI.sel ? JSON.stringify(UI.sel.type === 'group' ? { type: 'group', ids: UI.sel.ids.slice().sort((a, b) => a - b) } : UI.sel) : 'null');
const grp = ids => JSON.stringify({ type: 'group', ids: ids.slice().sort((a, b) => a - b) });
const toasts = () => p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent));
const cam = () => p.evaluate(() => ({ x: R.cam.x, y: R.cam.y }));
const tasks = ids => p.evaluate(ids => ids.map(id => { const u = Units.get(id); return u && u.task ? JSON.parse(JSON.stringify(u.task)) : null; }), ids);

/* ---- 1. THE BOX: soldiers first, drawn where it is, the count, the rings ---- */
{
  const sc = await setup('bx1', o => {
    const sol = [], vil = [];
    for (let i = 0; i < 3; i++) sol.push(Units.spawn('defender', 'P', o.x + 4.5 + i, o.y + 5.5).id);
    for (let i = 0; i < 4; i++) vil.push(Units.spawn('villager', 'P', o.x + 4.5 + i, o.y + 7.5).id);
    const foe = Units.spawn('defender', 'A', o.x + 8.5, o.y + 6.5).id;
    const deer = Units.spawn('deer', 'W', o.x + 9.5, o.y + 6.5).id;
    return { sol, vil, foe, deer, pts: { a: { x: o.x + 3, y: o.y + 4 }, b: { x: o.x + 11, y: o.y + 8.4 } } };
  });
  const c0 = await cam();
  await p.evaluate(() => { try { localStorage.removeItem('neo-box-told'); } catch (e) {} UI._boxTold = false; });
  const mid = await drag(sc.pts.a, sc.pts.b, { peek: () => {
    const el = document.getElementById('selBox'), r = el && el.getBoundingClientRect();
    const rings = typeof Feel !== 'undefined' && Feel.ringsFor ? Feel.ringsFor(performance.now() / 1000) : null;
    return { shown: !!el && getComputedStyle(el).display === 'block', r: r && { x: r.left, y: r.top, w: r.width, h: r.height },
      n: el && el.querySelector('.sbN').textContent, ids: UI._boxIds ? [...UI._boxIds].sort((a, b) => a - b) : [],
      ringed: rings && rings.units ? [...rings.units.keys()].sort((a, b) => a - b) : [] };
  } });
  const after = await sel(), c1 = await cam(), ts = await toasts(), tk = await tasks([...sc.sol, ...sc.vil]);
  const hidden = await p.evaluate(() => { const el = document.getElementById('selBox'); return !el || getComputedStyle(el).display === 'none'; });
  const within = (v, w) => Math.abs(v - w) <= 2;
  ck('aLeftDragDrawsTheBoxWhereItIsHeld', mid.shown && mid.r && within(mid.r.x, sc.pts.a.x) && within(mid.r.y, sc.pts.a.y) &&
    within(mid.r.x + mid.r.w, sc.pts.b.x) && within(mid.r.y + mid.r.h, sc.pts.b.y), JSON.stringify({ r: mid.r, a: sc.pts.a, b: sc.pts.b }));
  ck('andItSaysWhoItWillTakeAndWhoItLeavesOut', /3 soldiers/.test(mid.n) && /4 villagers left out/.test(mid.n), mid.n);
  ck('andRingsThemBeforeTheRelease', JSON.stringify(mid.ids) === JSON.stringify(sc.sol.slice().sort((a, b) => a - b)) &&
    sc.sol.every(id => mid.ringed.includes(id)) && !sc.vil.some(id => mid.ringed.includes(id)), JSON.stringify(mid));
  ck('soldiersFirstNeverTheVillagersOrAnyoneElse', after === grp(sc.sol), after);
  ck('theToastNamesWhoWasLeftOut', ts.some(t => /Soldiers first/.test(t) && /4 villagers left out/.test(t)), JSON.stringify(ts));
  ck('andTheFirstBoxSaysHowTheMapMovesNow', ts.some(t => /right-drag/.test(t) && /WASD/.test(t)), JSON.stringify(ts));
  ck('aBoxGivesNoOrderAndMovesNoView', tk.every(t => !t) && c1.x === c0.x && c1.y === c0.y && hidden,
    JSON.stringify({ tk, c0, c1, hidden }));
  // the panel is the war party's
  const title = await p.evaluate(() => (document.querySelector('#panel .ptitle') || {}).textContent || '');
  ck('aBoxOfSoldiersIsAWarParty', /War Party/.test(title) && /\(3\)/.test(title), title);
  // the villagers alone: a party of their own, with its own panel
  await p.evaluate(() => UI.deselect());
  await drag(await scr(sc.o.x + 3, sc.o.y + 6.6), await scr(sc.o.x + 11, sc.o.y + 8.4));
  const vs = await sel();
  const pan = await p.evaluate(() => ({ title: (document.querySelector('#panel .ptitle') || {}).textContent || '',
    sub: (document.querySelector('#panel .phead .psub') || {}).textContent || '',
    build: !!document.querySelector('#panel [data-act="ggobuild"]'),
    war: !!document.querySelector('#panel [data-act="gtactics"], #panel [data-act="garmysave"], #panel [data-act="gdefend"]') }));
  ck('withNoSoldierInItTheBoxTakesTheVillagers', vs === grp(sc.vil), vs);
  ck('andTheirPanelIsAVillagersOwn', /Villagers/.test(pan.title) && /\(4\)/.test(pan.title) && /4 idle/.test(pan.sub) && pan.build && !pan.war, JSON.stringify(pan));
}

/* ---- 2. what the box passes over: a bow at his post, the stairs, the bars, the dark ---- */
{
  const sc = await setup('bx2', o => {
    const t = Bld.place('P', 'tower', o.x + 6, o.y + 6, { free: true, instant: true });
    const up = Units.spawn('archer', 'P', o.x + 6.5, o.y + 7.5);
    up.perch = t.id; up.perchSlot = 0; up.x = t.x + 0.5; up.y = t.y + 0.5;
    const climbing = Units.spawn('archer', 'P', o.x + 7.5, o.y + 7.5);
    climbing.climb = { bid: t.id, t: 0.5, up: true };
    const ground = Units.spawn('archer', 'P', o.x + 8.5, o.y + 7.5);
    return { up: up.id, climbing: climbing.id, ground: ground.id,
      pts: { a: { x: o.x + 4.5, y: o.y + 4.5 }, b: { x: o.x + 10, y: o.y + 8.4 } } };
  });
  await drag(sc.pts.a, sc.pts.b);
  const s = await sel();
  ck('aBowAtHisTowerPostAndOneOnTheStairsAreNeverTaken', s === JSON.stringify({ type: 'unit', id: sc.ground }), s);
  // a box that reaches up under the top bar takes nobody drawn under it
  const sc2 = await setup('bx2b', o => {
    const top = document.getElementById('topbar').getBoundingClientRect().bottom;
    // a soldier whose body is drawn under the bar, and one in the open below it
    const wyBar = (top - 18) / R.cam.z + R.cam.y, wyOpen = (top + 60) / R.cam.z + R.cam.y;
    const wx = (420 / R.cam.z + R.cam.x) / CFG.TILE;
    const lift = CFG.SPRITE_LIFT / CFG.TILE;
    const hid = Units.spawn('defender', 'P', wx, wyBar / CFG.TILE + lift);
    const seen = Units.spawn('defender', 'P', wx + 1.5, wyOpen / CFG.TILE + lift);
    // stood exactly there (a spawn steps off ground it cannot stand on)
    hid.x = wx; hid.y = wyBar / CFG.TILE + lift; seen.x = wx + 1.5; seen.y = wyOpen / CFG.TILE + lift;
    Units.reindex();
    return { hid: hid.id, seen: seen.id, top, pts: {} };
  });
  await drag({ x: 380, y: sc2.top + 140 }, { x: 560, y: 8 });
  const s2 = await sel();
  ck('andNothingUnderTheBarsIsTaken', s2 === JSON.stringify({ type: 'unit', id: sc2.seen }), s2);
}

/* ---- 3. one unit, nothing, the ground under it, the other buttons, a touch, the switch ---- */
{
  const sc = await setup('bx3', o => {
    const a = Units.spawn('defender', 'P', o.x + 5.5, o.y + 6.5).id;
    const v = Units.spawn('villager', 'P', o.x + 9.5, o.y + 6.5).id;
    return { a, v, pts: { a0: { x: o.x + 4.6, y: o.y + 5.2 }, a1: { x: o.x + 6.4, y: o.y + 6.9 },
      e0: { x: o.x + 12, y: o.y + 9 }, e1: { x: o.x + 14, y: o.y + 10.5 }, mid: { x: o.x + 7, y: o.y + 8 } } };
  });
  await drag(sc.pts.a0, sc.pts.a1);
  const one = await sel();
  ck('aBoxRoundOneTakesHimAlone', one === JSON.stringify({ type: 'unit', id: sc.a }), one);
  const c0 = await cam();
  await drag(sc.pts.e0, sc.pts.e1);
  const kept = await sel(), c1 = await cam(), tk = await tasks([sc.a]);
  ck('anEmptyBoxTakesNothingAndDropsNothing', kept === one && c1.x === c0.x && c1.y === c0.y && !tk[0], JSON.stringify({ kept, tk }));
  // the first corner is held on the ground: the view moved under the box (a key) keeps it there
  await p.mouse.move(sc.pts.e0.x, sc.pts.e0.y); await p.mouse.down();
  await p.mouse.move(sc.pts.e0.x + 40, sc.pts.e0.y + 30, { steps: 4 });
  const held = await p.evaluate(() => {
    const r0 = UI.boxRect(), cx = R.cam.x;
    R.cam.x += 48 * (R.cam.x > 200 ? -1 : 1); R.clampCam();   // a key's worth of view, away from the edge
    UI.boxSync();
    const r1 = UI.boxRect();
    return { dx: r1.ax - r0.ax, moved: R.cam.x - cx, z: R.cam.z };
  });
  await p.mouse.up(); await nap(40);
  ck('theBoxIsHeldOnTheGroundWhileTheViewMoves', Math.abs(held.moved) > 10 && Math.abs(held.dx + held.moved * held.z) < 0.5, JSON.stringify(held));
  // a right drag and a middle drag still move the map, and draw no box
  for (const button of ['right', 'middle']) {
    await p.evaluate(() => UI.deselect());
    const k0 = await cam();
    const mid = await drag(sc.pts.e1, sc.pts.mid, { button, peek: () => !!UI.boxDrag });
    const k1 = await cam(), s = await sel();
    ck(button === 'right' ? 'aRightDragStillMovesTheMap' : 'andSoDoesAMiddleDrag', !mid && Math.hypot(k1.x - k0.x, k1.y - k0.y) > 10,
      JSON.stringify({ box: mid, k0, k1, s }));
  }
  // a drag ON the selection is still the move order
  await p.evaluate(id => UI.select('unit', id), sc.a);
  const mv = await drag(await bodyAt(sc.a), sc.pts.mid, { peek: () => ({ box: !!UI.boxDrag, tether: !!UI.moveDrag }) });
  const mt = await tasks([sc.a]);
  ck('aDragFromTheSelectionIsStillTheMoveOrder', mv && !mv.box && mv.tether && mt[0] && mt[0].type === 'move', JSON.stringify({ mv, mt }));
  // switched off in Settings: the left drag moves the map again
  await p.evaluate(() => { UI.deselect(); UI.setBoxOn(false); });
  const q0 = await cam();
  const off = await drag(sc.pts.e1, sc.pts.mid, { peek: () => !!UI.boxDrag });
  const q1 = await cam();
  const stored = await p.evaluate(() => localStorage.getItem('neo-box-select'));
  await p.evaluate(() => UI.setBoxOn(true));
  ck('switchedOffTheLeftDragMovesTheMap', !off && Math.hypot(q1.x - q0.x, q1.y - q0.y) > 10 && stored === '0', JSON.stringify({ off, q0, q1, stored }));
  // Escape mid-box puts it down: nothing taken, the rest of the press neither pans nor clicks
  await p.evaluate(id => UI.select('unit', id), sc.v);
  const e0 = await cam();
  await p.mouse.move(sc.pts.a0.x, sc.pts.a0.y); await p.mouse.down();
  await p.mouse.move(sc.pts.a1.x, sc.pts.a1.y, { steps: 5 });
  await p.keyboard.press('Escape');
  const gone = await p.evaluate(() => !UI.boxDrag && getComputedStyle(document.getElementById('selBox')).display === 'none');
  await p.mouse.move(sc.pts.a1.x + 60, sc.pts.a1.y + 20, { steps: 4 });
  await p.mouse.up(); await nap(40);
  const e1 = await cam(), es = await sel(), et = await tasks([sc.v]);
  ck('escapePutsTheBoxDownAndNothingElse', gone && es === JSON.stringify({ type: 'unit', id: sc.v }) && e1.x === e0.x && e1.y === e0.y && !et[0],
    JSON.stringify({ gone, es, e0, e1, et }));
  // placing a building, the left button is the placement's (the ghost rides the
  // mouse and a drag carries it) — never a box
  await p.evaluate(o => { UI.deselect(); R.centerOn(o.x + 8, o.y + 7); R.clampCam(); UI.enterPlacement('house'); }, sc.o);
  const pl = await drag(sc.pts.a0, sc.pts.e0, { peek: () => ({ box: !!UI.boxDrag, ghost: !!UI.placeDragging }) });
  const g1 = await p.evaluate(() => UI.placeGhost && { x: UI.placeGhost.x, y: UI.placeGhost.y, set: !!UI.placeGhost.set });
  ck('whilePlacingTheLeftButtonIsThePlacementsNeverABox', pl && !pl.box && pl.ghost && g1 && g1.set, JSON.stringify({ pl, g1 }));
  // …and the right button still moves the map, even pressed on the ghost
  const gs = await scr(g1.x + 0.5, g1.y + 0.5);
  const w0 = await cam();
  const pr = await drag(gs, { x: gs.x + 120, y: gs.y + 90 }, { button: 'right', peek: () => ({ box: !!UI.boxDrag, ghost: !!UI.placeDragging }) });
  const w1 = await cam(), g2 = await p.evaluate(() => UI.placeGhost && { x: UI.placeGhost.x, y: UI.placeGhost.y });
  await p.evaluate(() => UI.exitPlacement());
  ck('andTheRightDragStillMovesTheMapEvenFromTheGhost', pr && !pr.box && !pr.ghost && Math.hypot(w1.x - w0.x, w1.y - w0.y) > 10 &&
    g2 && g2.x === g1.x && g2.y === g1.y, JSON.stringify({ pr, w0, w1, g1, g2 }));
  // with the wall armed a right drag moves the map and lays nothing (it is never a line paid for by accident)
  await p.evaluate(o => { R.centerOn(o.x + 8, o.y + 7); R.clampCam(); UI.enterPlacement('wall'); }, sc.o);
  const n0 = await p.evaluate(() => S.buildings.length), v0 = await cam();
  const wl = await drag(sc.pts.a0, sc.pts.e0, { button: 'right', peek: () => ({ line: !!UI.wallDrag, box: !!UI.boxDrag }) });
  const n1 = await p.evaluate(() => S.buildings.length), v1 = await cam();
  await p.evaluate(() => UI.exitPlacement());
  ck('andWithTheWallArmedARightDragLaysNoLine', wl && !wl.line && !wl.box && n1 === n0 && Math.hypot(v1.x - v0.x, v1.y - v0.y) > 10,
    JSON.stringify({ wl, n0, n1, v0, v1 }));
}

/* ---- 4. a touch still pans: the phone is untouched ---- */
{
  const tctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', e => errs.push('touch: ' + String(e)));
  await tp.addInitScript(() => { try { localStorage.setItem('neo-cards-intro', '1'); localStorage.setItem('neo-victory-seen', '1'); localStorage.setItem('neo-sfx', '0'); localStorage.setItem('neo-music', '0'); } catch (e) {} });
  await tp.goto('file://' + join(root, 'index.html') + '?prologue=0', { waitUntil: 'domcontentloaded' });
  await tp.waitForFunction(() => typeof G !== 'undefined' && typeof UI !== 'undefined', null, { timeout: 20000 });
  await tp.waitForTimeout(600);
  const t0 = await tp.evaluate(() => {
    Screens._demo = false; G.newGame('bx4', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    for (let i = 0; i < 3; i++) Units.spawn('defender', 'P', tc.x + 2.5 + i, tc.y + 4.5);
    R.centerOn(tc.x + 3, tc.y + 4); R.cam.z = 1.4; R.clampCam(); UI.deselect();
    return { x: R.cam.x, y: R.cam.y };
  });
  const cdp = await tctx.newCDPSession(tp);
  const pt = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await pt('touchStart', 150, 420);
  for (let i = 1; i <= 8; i++) { await pt('touchMove', 150 + i * 12, 420 + i * 9); await nap(16); }
  await pt('touchEnd');
  await nap(60);
  const t1 = await tp.evaluate(() => ({ x: R.cam.x, y: R.cam.y, box: !!UI.boxDrag, sel: !!UI.sel, el: !!document.getElementById('selBox') }));
  ck('aTouchDragStillPansAndDrawsNoBox', Math.hypot(t1.x - t0.x, t1.y - t0.y) > 10 && !t1.box && !t1.sel && !t1.el, JSON.stringify({ t0, t1 }));
  await tctx.close();
}

/* ---- 5. SHIFT adds, more of the same party only; a double-click takes a villager's kind ---- */
{
  const sc = await setup('bx5', o => {
    const s1 = [Units.spawn('archer', 'P', o.x + 4.5, o.y + 5.5).id, Units.spawn('archer', 'P', o.x + 5.5, o.y + 5.5).id];
    const s2 = [Units.spawn('defender', 'P', o.x + 9.5, o.y + 5.5).id, Units.spawn('defender', 'P', o.x + 10.5, o.y + 5.5).id];
    const vil = [Units.spawn('villager', 'P', o.x + 9.5, o.y + 8.5).id, Units.spawn('villager', 'P', o.x + 10.5, o.y + 8.5).id,
      Units.spawn('villager', 'P', o.x + 11.5, o.y + 8.5).id];
    return { s1, s2, vil, pts: { a0: { x: o.x + 3.6, y: o.y + 4.4 }, a1: { x: o.x + 6.4, y: o.y + 6 },
      b0: { x: o.x + 8.6, y: o.y + 4.4 }, b1: { x: o.x + 11.4, y: o.y + 6 },
      v0: { x: o.x + 8.6, y: o.y + 7.4 }, v1: { x: o.x + 12.4, y: o.y + 9 } } };
  });
  await drag(sc.pts.a0, sc.pts.a1);
  await p.keyboard.down('Shift');
  const plus = await drag(sc.pts.b0, sc.pts.b1, { peek: () => document.querySelector('#selBox .sbN').textContent });
  await p.keyboard.up('Shift');
  const both = await sel();
  ck('shiftDragAddsToTheParty', both === grp([...sc.s1, ...sc.s2]) && /^\+2 soldiers/.test(plus), JSON.stringify({ both, plus }));
  await p.keyboard.down('Shift');
  await drag(sc.pts.v0, sc.pts.v1);
  await p.keyboard.up('Shift');
  const still = await sel(), ts = await toasts();
  ck('butNeverAnotherPartysPeople', still === both && ts.some(t => /3 villagers left out/.test(t) && /Shift adds only more soldiers/.test(t)), JSON.stringify({ still, ts: ts.slice(-2) }));
  // Shift + click: one out, then back in
  const d0 = await bodyAt(sc.s2[0]);
  await p.keyboard.down('Shift');
  await p.mouse.click(d0.x, d0.y); await nap(420);
  const out1 = await sel();
  await p.mouse.click(d0.x, d0.y); await nap(420);
  const in1 = await sel();
  await p.keyboard.up('Shift');
  ck('shiftClickTakesOneOutAndPutsHimBack', out1 === grp([...sc.s1, sc.s2[1]]) && in1 === grp([...sc.s1, ...sc.s2]), JSON.stringify({ out1, in1 }));
  // Shift + click a villager with soldiers in hand: an ordinary click (him alone)
  const vb = await bodyAt(sc.vil[0]);
  await p.keyboard.down('Shift');
  await p.mouse.click(vb.x, vb.y); await nap(420);
  await p.keyboard.up('Shift');
  const vOnly = await sel();
  ck('shiftClickOnAnotherPartyIsAnOrdinaryClick', vOnly === JSON.stringify({ type: 'unit', id: sc.vil[0] }), vOnly);
  // a double-click on a villager takes the villagers nearby (a mouse)
  await p.evaluate(() => UI.deselect());
  await p.mouse.dblclick(vb.x, vb.y); await nap(80);
  const dv = await sel();
  ck('aDoubleClickTakesTheVillagersNearby', dv === grp(sc.vil), dv);
}

/* ---- 6. A RESOURCE IS SHARED OUT, ONE HAND TO A TILE ---- */
{
  const sc = await setup('bx6', o => {
    // a stand of five trees in a row, open ground on both long sides
    const trees = [];
    for (let i = 0; i < 5; i++) { const x = o.x + 6 + i, y = o.y + 9; S.map.terrain[MapGen.idx(x, y)] = T.FOREST; S.map.resAmount[MapGen.idx(x, y)] = 100; trees.push([x, y]); }
    const vil = [];
    for (let i = 0; i < 4; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { vil, trees, pts: { tree: { x: o.x + 8.5, y: o.y + 9.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc.vil);
  await p.mouse.click(sc.pts.tree.x, sc.pts.tree.y); await nap(60);
  const tk = await tasks(sc.vil), s = await sel(), ts = await toasts();
  // the order's marks: every tree a hand took, rung one after another
  const marks = await p.evaluate(() => {
    const m = Feel._mark;
    if (!m) return null;
    const r = Feel.ringsFor(m.t0 + 0.4);
    return { kind: m.kind, life: m.life, tiles: r ? r.tiles.map(q => (q.x - 0.5) + ',' + (q.y - 0.5)).sort() : [] };
  });
  const tiles = tk.map(t => t && t.type === 'gather' ? t.x + ',' + t.y : null);
  ck('aPartyOnAStandTakesOneTreeEach', tiles.every(Boolean) && new Set(tiles).size === 4 && tk.every(t => t.res === 'wood'), JSON.stringify(tiles));
  ck('theTappedTreeIsWorkedFirst', tiles.includes((sc.o.x + 8) + ',' + (sc.o.y + 9)), JSON.stringify(tiles));
  ck('andThePartyLeavesTheHandOnceAtWork', s === 'null', s);
  ck('andTheOrderRingsEveryTreeTheyTook', marks && marks.kind === 'work' && JSON.stringify(marks.tiles) === JSON.stringify(tiles.slice().sort()),
    JSON.stringify({ marks, tiles }));
  // all of them where they were sent: an acknowledgement, said nowhere (the house rule) — the marks say it
  ck('andAnOrderCarriedOutWhollyIsNotToasted', !ts.some(t => /gathering wood/.test(t)), JSON.stringify(ts));
  // more hands than trees: every tree takes one before any takes a second side
  const sc2 = await setup('bx6b', o => {
    for (let i = 0; i < 2; i++) { const x = o.x + 7 + i * 3, y = o.y + 9; S.map.terrain[MapGen.idx(x, y)] = T.FOREST; S.map.resAmount[MapGen.idx(x, y)] = 100; }
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 6.5 + i, o.y + 6.5).id);
    return { vil, pts: { tree: { x: o.x + 7.5, y: o.y + 9.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc2.vil);
  await p.mouse.click(sc2.pts.tree.x, sc2.pts.tree.y); await nap(60);
  const tk2 = await tasks(sc2.vil);
  const per = {};
  for (const t of tk2) if (t && t.type === 'gather') per[t.x + ',' + t.y] = (per[t.x + ',' + t.y] || []).concat(t.sx + ',' + t.sy);
  const counts = Object.values(per).map(a => a.length).sort();
  const sides = Object.values(per).every(a => new Set(a).size === a.length);
  ck('everyTreeTakesOneBeforeAnyTakesTwo', JSON.stringify(counts) === '[1,2]' && sides, JSON.stringify(per));
}

/* ---- 6c. a party across two shores: nobody is sent to work he cannot walk to ---- */
{
  const sc = await setup('bx6c', o => {
    // an island: four tiles of grass ringed by water, two of the party on it
    for (let y = o.y + 4; y <= o.y + 9; y++) for (let x = o.x + 11; x <= o.x + 16; x++) {
      const i = MapGen.idx(x, y), inner = x > o.x + 11 && x < o.x + 16 && y > o.y + 4 && y < o.y + 9;
      S.map.terrain[i] = inner ? T.GRASS : T.WATER; S.map.resAmount[i] = 0;
    }
    for (const x of [o.x + 5, o.x + 6]) { const i = MapGen.idx(x, o.y + 9); S.map.terrain[i] = T.FOREST; S.map.resAmount[i] = 100; }
    const home = [Units.spawn('villager', 'P', o.x + 4.5, o.y + 6.5).id, Units.spawn('villager', 'P', o.x + 5.5, o.y + 6.5).id];
    const isle = [Units.spawn('villager', 'P', o.x + 13.5, o.y + 6.5).id, Units.spawn('villager', 'P', o.x + 14.5, o.y + 6.5).id];
    return { home, isle, pts: { tree: { x: o.x + 5.5, y: o.y + 9.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), [...sc.home, ...sc.isle]);
  await p.mouse.click(sc.pts.tree.x, sc.pts.tree.y); await nap(60);
  const tk = await tasks([...sc.home, ...sc.isle]), s = await sel(), ts = await toasts();
  ck('aPartyAcrossTheWaterSendsOnlyThoseWhoCanWalkThere', tk.slice(0, 2).every(t => t && t.type === 'gather') && tk.slice(2).every(t => !t) &&
    s === grp(sc.isle) && ts.some(t => /2 cannot reach it and stay in hand/.test(t)), JSON.stringify({ tk, s, ts: ts.slice(-1) }));
}

/* ---- 7. A STATION HOLDS ITS PLACES AND NO MORE ---- */
{
  const sc = await setup('bx7', o => {
    const put = (key, x, y, terr) => { S.map.terrain[MapGen.idx(x, y)] = terr; return Bld.place('P', key, x, y, { free: true, instant: true }); };
    const camp = put('lumber', o.x + 8, o.y + 9, T.STUMPS);
    // its woods, beside it
    for (let i = 0; i < 4; i++) { const x = o.x + 10 + i, y = o.y + 10; S.map.terrain[MapGen.idx(x, y)] = T.FOREST; S.map.resAmount[MapGen.idx(x, y)] = 100; }
    const vil = [];
    for (let i = 0; i < 5; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { camp: camp.id, vil, pts: { camp: { x: o.x + 8.5, y: o.y + 9.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc.vil);
  await p.mouse.click(sc.pts.camp.x, sc.pts.camp.y); await nap(60);
  const tk = await tasks(sc.vil), ts = await toasts(), s = await sel();
  const onCamp = tk.filter(t => t && t.type === 'work' && t.id === sc.camp).length;
  const byHand = tk.filter(t => t && t.type === 'gather' && t.res === 'wood').length;
  ck('aStationTakesItsTwoAndNoMore', onCamp === 2, JSON.stringify(tk));
  ck('andTheRestGatherItsOwnGoodBesideIt', byHand === 3 && s === 'null', JSON.stringify({ byHand, s }));
  ck('andTheToastSaysWhereEachWent', ts.some(t => /2 to the Lumber Camp/.test(t) && /3 gathering wood beside it/.test(t)), JSON.stringify(ts.slice(-1)));
  // the next works of its kind take the spill before the hand-work does
  const sc2 = await setup('bx7b', o => {
    const put = (key, x, y, terr) => { S.map.terrain[MapGen.idx(x, y)] = terr; return Bld.place('P', key, x, y, { free: true, instant: true }); };
    const a = put('quarry', o.x + 7, o.y + 9, T.PEBBLES), c = put('quarry', o.x + 11, o.y + 9, T.PEBBLES);
    const vil = [];
    for (let i = 0; i < 5; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { a: a.id, c: c.id, vil, pts: { a: { x: o.x + 7.5, y: o.y + 9.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc2.vil);
  await p.mouse.click(sc2.pts.a.x, sc2.pts.a.y); await nap(60);
  const tk2 = await tasks(sc2.vil), s2 = await sel(), ts2 = await toasts();
  const onA = tk2.filter(t => t && t.type === 'work' && t.id === sc2.a).length, onC = tk2.filter(t => t && t.type === 'work' && t.id === sc2.c).length;
  ck('theNextWorksOfItsKindTakeTheSpill', onA === 2 && onC === 2, JSON.stringify(tk2));
  ck('andWhoeverFindsNoRoomStaysInHand', /"type":"unit"/.test(s2) && ts2.some(t => /2 to the next Quarry/.test(t) && /1 still in hand/.test(t)), JSON.stringify({ s2, ts: ts2.slice(-1) }));
  // a FULL station is a look, for a party as for one (rule 6)
  const sc3 = await setup('bx7c', o => {
    S.map.terrain[MapGen.idx(o.x + 8, o.y + 9)] = T.STUMPS;
    const camp = Bld.place('P', 'lumber', o.x + 8, o.y + 9, { free: true, instant: true });
    const w = [];
    for (let i = 0; i < 2; i++) { const u = Units.spawn('villager', 'P', camp.x + 0.25 + i * 0.5, camp.y + 0.5); u.task = { type: 'work', id: camp.id }; w.push(u.id); }
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { camp: camp.id, w, vil, pts: { camp: { x: o.x + 8.5, y: o.y + 9.9 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc3.vil);
  await p.mouse.click(sc3.pts.camp.x, sc3.pts.camp.y); await nap(60);
  const s3 = await sel(), tk3 = await tasks(sc3.vil);
  const look = s3 === JSON.stringify({ type: 'bld', id: sc3.camp }) || sc3.w.some(id => s3 === JSON.stringify({ type: 'unit', id }));
  ck('aFullStationIsALookForAPartyAsForOne', look && tk3.every(t => !t), JSON.stringify({ s3, tk3 }));
}

/* ---- 8. a site built by all, a seam claimed by as many as the mine holds, a shoal, a walk, a hunt ---- */
{
  const sc = await setup('bx8', o => {
    const site = Bld.place('P', 'house', o.x + 9, o.y + 9, { free: true, noAutoAssign: true });
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { site: site.id, vil, pts: { site: { x: o.x + 9.5, y: o.y + 9.7 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc.vil);
  await p.mouse.click(sc.pts.site.x, sc.pts.site.y); await nap(60);
  const tk = await tasks(sc.vil), s = await sel();
  ck('aSiteIsBuiltByAllOfThem', tk.every(t => t && t.type === 'build' && t.id === sc.site) && s === 'null', JSON.stringify({ tk, s }));
  const sc2 = await setup('bx8b', o => {
    const x = o.x + 10, y = o.y + 9;
    S.map.terrain[MapGen.idx(x, y)] = T.GOLDORE;
    const vil = [];
    for (let i = 0; i < 4; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { vil, seam: [x, y], pts: { seam: { x: x + 0.5, y: y + 0.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc2.vil);
  await p.mouse.click(sc2.pts.seam.x, sc2.pts.seam.y); await nap(60);
  const tk2 = await tasks(sc2.vil), s2 = await sel();
  const claims = tk2.filter(t => t && t.type === 'claim').length;
  const kept = s2 !== 'null' ? (JSON.parse(s2).ids || [JSON.parse(s2).id]).length : 0;
  ck('aSeamIsClaimedByAsManyAsTheMineHolds', claims === 2 && kept === 2, JSON.stringify({ tk2, s2 }));
  // a shoal: one line to a shoal first, each from its own side
  const sc3 = await setup('bx8c', o => {
    // two one-tile pools on tiles the shoal hash marks (MapGen.shoal), close together
    const hashed = (x, y) => ((x * 73856093 ^ y * 19349663) >>> 0) % 9 === 0;
    const shoals = [];
    for (let y = o.y + 8; y <= o.y + 13 && shoals.length < 2; y++) for (let x = o.x + 4; x <= o.x + 16 && shoals.length < 2; x++) {
      if (!hashed(x, y) || shoals.some(([sx, sy]) => Math.abs(sx - x) < 2 && Math.abs(sy - y) < 2 || Math.hypot(sx - x, sy - y) > 4)) continue;
      const i = MapGen.idx(x, y); S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 50; shoals.push([x, y]);
    }
    const vil = [];
    for (let i = 0; i < 2; i++) vil.push(Units.spawn('villager', 'P', o.x + 6.5 + i, o.y + 6.5).id);
    const s0 = shoals[0] || [o.x + 6, o.y + 8];
    return { vil, shoals: shoals.filter(([x, y]) => MapGen.shoal(x, y)), pts: { shoal: { x: s0[0] + 0.5, y: s0[1] + 0.5 } } };
  });
  if (sc3.shoals.length) {
    await p.evaluate(ids => UI.takeGroup(ids), sc3.vil);
    await p.mouse.click(sc3.pts.shoal.x, sc3.pts.shoal.y); await nap(60);
    const tk3 = await tasks(sc3.vil);
    const sides = tk3.map(t => t && t.type === 'shorefish' ? t.sx + ',' + t.sy : null);
    const spots = tk3.map(t => t && t.type === 'shorefish' ? t.x + ',' + t.y : null);
    ck('aShoalIsFishedFromItsFreeSides', sides.every(Boolean) && new Set(sides).size === sides.length &&
      (sc3.shoals.length < 2 || new Set(spots).size === spots.length), JSON.stringify({ tk3, shoals: sc3.shoals }));
  } else ck('aShoalIsFishedFromItsFreeSides', false, 'no shoal in the pond: the probe saw nothing');
  // open ground: they walk together, and stay in hand
  const sc4 = await setup('bx8d', o => {
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    const deer = Units.spawn('deer', 'W', o.x + 9.5, o.y + 6.5).id;   // in their sight (a beast in the fog is no target)
    return { vil, deer, pts: { ground: { x: o.x + 10.5, y: o.y + 9.5 }, deer: { id: deer } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc4.vil);
  await p.mouse.click(sc4.pts.ground.x, sc4.pts.ground.y); await nap(420);
  const tk4 = await tasks(sc4.vil), s4 = await sel();
  ck('openGroundIsAWalkTogether', tk4.every(t => t && t.type === 'move') && s4 === grp(sc4.vil), JSON.stringify({ tk4, s4 }));
  await p.mouse.click(sc4.pts.deer.x, sc4.pts.deer.y); await nap(60);
  const tk5 = await tasks(sc4.vil);
  ck('aBeastIsHuntedByThemAll', tk5.every(t => t && t.type === 'attack' && t.on === sc4.deer), JSON.stringify(tk5));
}

/* ---- 9. boats to free water; a party's Build sends all of them ---- */
{
  const sc = await setup('bx9', o => {
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 7; dx++) { const i = MapGen.idx(o.x + 6 + dx, o.y + 7 + dy); S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 60; }
    const boats = [];
    for (let i = 0; i < 3; i++) boats.push(Units.spawn('fishboat', 'P', o.x + 7.5 + i, o.y + 8.5).id);
    return { boats, pts: { a0: { x: o.x + 6.4, y: o.y + 7.3 }, a1: { x: o.x + 11.6, y: o.y + 9.3 }, w: { x: o.x + 9.5, y: o.y + 9.5 } } };
  });
  await drag(sc.pts.a0, sc.pts.a1);
  const bs = await sel();
  await p.mouse.click(sc.pts.w.x, sc.pts.w.y); await nap(60);
  const tk = await tasks(sc.boats);
  const at = tk.map(t => t && t.type === 'fish' ? t.x + ',' + t.y : null);
  ck('aBoxOfFishingBoatsIsAPartyOfItsOwn', bs === grp(sc.boats), bs);
  ck('andEachBoatTakesFreeWater', at.every(Boolean) && new Set(at).size === 3, JSON.stringify(at));
  // a troop hull moored by villagers working the shore: the box takes the villagers
  const sh = await setup('bx9t', o => {
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 7; dx++) { const i = MapGen.idx(o.x + 6 + dx, o.y + 9 + dy); S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 0; }
    const hull = Units.spawn('transport', 'P', o.x + 8.5, o.y + 9.5).id;
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 7.5 + i, o.y + 7.5).id);
    return { hull, vil, pts: { a0: { x: o.x + 6.4, y: o.y + 6.6 }, a1: { x: o.x + 11.6, y: o.y + 10.4 } } };
  });
  const tn = await drag(sh.pts.a0, sh.pts.a1, { peek: () => document.querySelector('#selBox .sbN').textContent });
  const ts9 = await sel();
  ck('aTransportMooredByVillagersNeverTakesTheirBox', ts9 === grp(sh.vil) && /3 villagers/.test(tn) && /1 transport left out/.test(tn), JSON.stringify({ ts9, tn }));
  const sc2 = await setup('bx9b', o => {
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { vil, pts: {} };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc2.vil);
  await p.click('#panel [data-act="ggobuild"]');
  const placed = await p.evaluate(() => {
    const ids0 = (UI.builderIds || []).slice();
    UI.enterPlacement('house');
    // the nearest ground beside the hall a house may stand on
    const tc = Bld.tcOf('P');
    let spot = null;
    for (let r = 2; r < 9 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++)
      if (Bld.canPlace('P', 'house', tc.x + dx, tc.y + dy).ok) spot = { x: tc.x + dx, y: tc.y + dy };
    if (!spot) return { ids0, site: null, why: 'no ground for a house' };
    UI.placeGhost = { x: spot.x, y: spot.y, set: true };
    UI.confirmPlacement();
    const site = S.buildings.find(b => b.key === 'house' && b.x === spot.x && b.y === spot.y);
    return { ids0, site: site && site.id };
  });
  const tk2 = await tasks(sc2.vil);
  ck('aPartysBuildSendsEveryOneOfThem', placed.site && placed.ids0.length === 3 && tk2.every(t => t && t.type === 'build' && t.id === placed.site),
    JSON.stringify({ placed, tk2 }));
}

/* ---- 10. a party dragged: movement-first, a resource for villagers ---- */
{
  const sc = await setup('bx10', o => {
    for (let i = 0; i < 4; i++) { const x = o.x + 7 + i, y = o.y + 10; S.map.terrain[MapGen.idx(x, y)] = T.FOREST; S.map.resAmount[MapGen.idx(x, y)] = 100; }
    const vil = [];
    for (let i = 0; i < 3; i++) vil.push(Units.spawn('villager', 'P', o.x + 5.5 + i, o.y + 6.5).id);
    return { vil, pts: { from: { id: vil[1] }, tree: { x: o.x + 8.5, y: o.y + 10.5 } } };
  });
  await p.evaluate(ids => UI.takeGroup(ids), sc.vil);
  await drag(sc.pts.from, sc.pts.tree);
  const tk = await tasks(sc.vil);
  const tiles = tk.map(t => t && t.type === 'gather' ? t.x + ',' + t.y : null);
  ck('aPartyDraggedOntoTreesSharesThemOut', tiles.every(Boolean) && new Set(tiles).size === 3, JSON.stringify(tk));
}

ck('noPageErrors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL BOX-SELECT CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
