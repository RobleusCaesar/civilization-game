// TAP & SELECTION CONTRACT — run this after ANY change near:
//   ui.js      UI.handleTap / handleDoubleTap / snapNear / select / deselect
//   units.js   assignGather / assignBuild / moveTo / setPath
//   render.js  screenToWorld / screenToTile / unit draw offsets (CFG.SPRITE_LIFT),
//              unitBox / unitHit (the 48px box — riders, engines, hulls)
//   config.js  TILE / SPRITE_LIFT / GATHER
//
//   node tests/tap-audit.mjs        (needs Playwright + Chromium; both are
//                                    pre-installed in the Claude Code remote env)
//
// It reproduces the fat-finger scenarios from the July 2026 accuracy audit and
// FAILS LOUDLY if any regress. History: tap accuracy has broken repeatedly when
// nearby code changed — hit-tests aiming at logical positions instead of the
// drawn sprite, bystander units hijacking orders, near-miss taps becoming walk
// orders. Details in the commit "Pinpoint tap accuracy: aim at sprites, orders
// outrank bystanders, near-miss snapping".
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
let pw;
try { pw = (await import('playwright')).default ?? await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const checks = [];   // { name, pass, got }
  const ok = (name, pass, got) => checks.push({ name, pass: !!pass, got: String(got) });
  const idx = (x, y) => MapGen.idx(x, y);
  const tap = (wx, wy) => UI.handleTap((wx * CFG.TILE - R.cam.x) * R.cam.z, (wy * CFG.TILE - R.cam.y) * R.cam.z);
  const toasts = []; UI.toast = (m, bad) => toasts.push((bad ? '!' : '') + m);
  const park = (u, x, y) => { u.task = null; u.path = null; u.tUnit = 0; u.tBld = 0; u.x = x; u.y = y; };

  const freshArena = (seed) => {
    G.newGame(seed, 'moderate', 'large'); G.freeVis = true; Screens.show('playing'); S.paused = true;
    S.map.explored.fill(1); G.updateVisibility();
    S.res.wood = 999; S.res.stone = 999; S.res.food = 999;
    // craft a clean grass arena at the point farthest from every building
    let bx = 0, by = 0, bestD = -1;
    for (let y = 8; y < CFG.H - 8; y += 2) for (let x = 8; x < CFG.W - 8; x += 2) {
      let d = 1e9;
      for (const bd of S.buildings) d = Math.min(d, Math.hypot(bd.x - x, bd.y - y));
      if (d > bestD) { bestD = d; bx = x; by = y; }
    }
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      S.map.terrain[idx(bx + dx, by + dy)] = T.GRASS; S.map.resAmount[idx(bx + dx, by + dy)] = 0;
    }
    const vil = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    S.units.filter(u => u !== vil).forEach((u, i) => park(u, 3 + (i % 5), 3 + ((i / 5) | 0)));
    return { bx, by, vil };
  };

  /* ================= crafted fat-finger scenarios ================= */
  {
    const { bx, by, vil } = freshArena('selaudit');
    const LIFT = CFG.SPRITE_LIFT / CFG.TILE;

    // A: taps around a lone villager's VISUAL sprite center all select it
    park(vil, bx + 0.5, by + 0.5);
    let hit = 0, n = 0;
    for (const dy of [-0.3, -0.15, 0, 0.15, 0.3]) for (const dx of [-0.3, -0.15, 0, 0.15, 0.3]) {
      UI.deselect(); tap(vil.x + dx, (vil.y - LIFT) + dy); n++;
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === vil.id) hit++;
    }
    ok('A lone villager: visual-center taps select it', hit === n, hit + '/' + n);

    // B: villager standing on a farm plot still wins visual-center taps
    const fx = bx + 2, fy = by + 2;
    Bld.place('P', 'farm', fx, fy, {});
    const farm = Bld.at(fx, fy); farm.construction = 0; farm.upgrading = 0; farm.hp = farm.maxhp;
    park(vil, fx + 0.5, fy + 0.5);
    hit = 0; n = 0;
    for (const dy of [-0.3, -0.15, 0, 0.15, 0.3]) for (const dx of [-0.3, -0.15, 0, 0.15, 0.3]) {
      UI.deselect(); tap(vil.x + dx, (vil.y - LIFT) + dy); n++;
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === vil.id) hit++;
    }
    ok('B villager on building plot: sprite taps pick the villager', hit === n, hit + '/' + n);

    // C: with a villager selected, a bystander own unit near the tapped
    // resource must NOT hijack the gather order
    const ftx = bx - 3, fty = by;
    S.map.terrain[idx(ftx, fty)] = T.FOREST;
    const sold = Units.spawn('defender', 'P', bx + 2.5, by - 2.5, {});
    let gathers = 0;
    for (const off of [[0.55, 0], [0, 0.55], [0.45, 0.3], [-0.55, 0.1]]) {
      park(vil, bx + 0.5, by - 2.5); park(sold, ftx + 0.5 + off[0], fty + 0.5 + off[1]);
      S.map.resAmount[idx(ftx, fty)] = 500;
      UI.deselect(); UI.select('unit', vil.id);
      tap(ftx + 0.5, fty + 0.5);
      if (vil.task && vil.task.type === 'gather') gathers++;
    }
    ok('C bystander near resource never hijacks the order', gathers === 4, gathers + '/4');
    park(sold, 3, 3);

    // D: station taps across the farm plot AND up to ~0.35 outside it
    const sz = Bld.size('farm');
    const pts = [];
    for (let t = 0; t < 8; t++) pts.push([fx + (t % 4) * (sz / 3) * 0.999, fy + ((t / 4) | 0) * (sz * 0.999)]);
    pts.push([fx - 0.25, fy + 0.5], [fx + sz + 0.25, fy + 0.5], [fx + 0.5, fy - 0.25], [fx + 0.5, fy + sz + 0.25],
             [fx - 0.35, fy - 0.2], [fx + sz + 0.35, fy + sz + 0.2]);
    let st = 0;
    for (const [px, py] of pts) {
      for (const w of S.units.filter(u => u.task && u.task.type === 'work' && u.task.id === farm.id)) w.task = null;
      park(vil, bx + 0.5, by - 2.5);
      UI.deselect(); UI.select('unit', vil.id);
      tap(px, py);
      if (vil.task && vil.task.type === 'work' && vil.task.id === farm.id) st++;
    }
    ok('D station taps land incl. near-misses outside the plot', st === pts.length, st + '/' + pts.length);

    /* D2: A FULL STATION TAKES THE TAP AS A LOOK, NOT AN ORDER.
       Tapping a fully-crewed plot with a villager already selected used to
       refuse the order and HOLD the selection, so walking your eye along five
       lumber camps to see which the new hall lets you upgrade cost a deselect
       between every one. The order is impossible there, so the tap falls
       through to exactly what it would have done with nothing selected — by
       rule 5 that is the worker standing on the plot. A station with ROOM is
       untouched: the order is real and the villager walks over and joins. */
    {
      for (const w of S.units.filter(u => u.task && u.task.type === 'work' && u.task.id === farm.id)) w.task = null;
      // crew the farm to capacity with hands of its own
      const crew = [];
      for (let i = 0; i < Bld.maxWorkers(farm); i++) {
        const w = Units.spawn('villager', 'P', farm.x, farm.y);
        w.x = farm.x + 0.5; w.y = farm.y + 0.62; w.task = { type: 'work', id: farm.id };
        crew.push(w);
      }
      park(vil, bx + 0.5, by - 2.5);
      UI.deselect(); UI.select('unit', vil.id);
      toasts.length = 0;
      tap(farm.x + 0.5, farm.y + 0.62);
      const now = UI.sel && UI.sel.type === 'unit' ? Units.get(UI.sel.id) : null;
      ok('D2 a full station hands the selection to its own worker',
        !!now && now !== vil && crew.includes(now), now ? 'unit ' + now.id : String(UI.sel && UI.sel.type));
      ok('D2 …and the villager that was selected keeps its own orders',
        !vil.task || vil.task.type !== 'work', vil.task ? vil.task.type : 'idle');
      ok('D2 …and it is not reported as a failure', !toasts.some(t => t[0] === '!'), toasts.join(' | ') || 'no toast');
      // …but a station with a free slot still takes the order
      crew[0].task = null;
      park(vil, bx + 0.5, by - 2.5);
      UI.deselect(); UI.select('unit', vil.id);
      tap(farm.x + 0.5, farm.y + 0.62);
      ok('D2 a station with room still takes the villager',
        !!vil.task && vil.task.type === 'work' && vil.task.id === farm.id,
        vil.task ? vil.task.type : 'no order');
      for (const w of crew) { const i = S.units.indexOf(w); if (i >= 0) S.units.splice(i, 1); }
      vil.task = null;
    }

    // E: gather taps that miss the forest tile by a sliver still gather it
    let ga = 0;
    for (const [px, py] of [[ftx - 0.2, fty + 0.5], [ftx + 1.2, fty + 0.5], [ftx + 0.5, fty - 0.2], [ftx + 0.5, fty + 1.25],
                            [ftx - 0.3, fty - 0.2], [ftx + 1.35, fty + 1.1]]) {
      park(vil, bx + 0.5, by - 2.5);
      UI.deselect(); UI.select('unit', vil.id);
      tap(px, py);
      if (vil.task && vil.task.type === 'gather' && vil.task.x === ftx && vil.task.y === fty) ga++;
    }
    ok('E near-miss gather taps snap to the resource', ga === 6, ga + '/6');

    // F: unreachable resource gives spoken feedback, not silence
    const sx2 = bx + 3, sy2 = by - 3;
    S.map.terrain[idx(sx2, sy2)] = T.FOREST; S.map.resAmount[idx(sx2, sy2)] = 500;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.map.terrain[idx(sx2 + dx, sy2 + dy)] = T.WATER;
    park(vil, bx + 0.5, by - 2.5);
    UI.deselect(); UI.select('unit', vil.id);
    toasts.length = 0;
    tap(sx2 + 0.5, sy2 + 0.5);
    ok('F blocked gather explains itself (toast)', toasts.length > 0 && !vil.task, JSON.stringify(toasts));
    S.map.terrain[idx(sx2, sy2)] = T.GRASS; S.map.resAmount[idx(sx2, sy2)] = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.map.terrain[idx(sx2 + dx, sy2 + dy)] = T.GRASS;

    // G: military attack taps just outside an enemy plot still attack it
    const enemy = S.buildings.find(bd => bd.owner === 'A');
    const esz = Bld.size(enemy.key);
    let at = 0;
    for (const [px, py] of [[enemy.x - 0.25, enemy.y + 0.5], [enemy.x + esz + 0.25, enemy.y + 0.5],
                            [enemy.x + 0.5, enemy.y - 0.25], [enemy.x + 0.5, enemy.y + esz + 0.3]]) {
      park(sold, enemy.x - 4, enemy.y);
      UI.deselect(); UI.select('unit', sold.id);
      tap(px, py);
      if (sold.tBld === enemy.id) at++;
    }
    ok('G attack taps just off an enemy plot still attack', at === 4, at + '/4');
  }

  /* ================= must-NOT-change behaviours ================= */
  {
    const { bx, by, vil } = freshArena('selreg');
    const vil2 = Units.spawn('villager', 'P', bx + 2.5, by + 0.5, {});

    // dead-on tap on another own unit still reselects it
    park(vil, bx + 0.5, by + 0.5); park(vil2, bx + 2.5, by + 0.5);
    UI.deselect(); UI.select('unit', vil.id);
    tap(vil2.x, vil2.y - CFG.SPRITE_LIFT / CFG.TILE);
    ok('R1 dead-on tap on own unit reselects it', UI.sel && UI.sel.type === 'unit' && UI.sel.id === vil2.id, JSON.stringify(UI.sel));
    park(vil2, 3, 4);

    // a healthy own wall never steals a walk order beside it
    const wxT = bx - 2, wyT = by - 2;
    Bld.place('P', 'wall', wxT, wyT, {});
    const wall = Bld.at(wxT, wyT); wall.construction = 0; wall.upgrading = 0; wall.hp = wall.maxhp;
    park(vil, bx + 0.5, by + 0.5);
    UI.deselect(); UI.select('unit', vil.id);
    tap(wxT + 1.3, wyT + 0.5);
    ok('R2 walk beside a healthy wall stays a walk', vil.task && vil.task.type === 'move', vil.task && vil.task.type);

    // ...but a DAMAGED wall a sliver away does catch a repair tap
    wall.hp = wall.maxhp * 0.5;
    park(vil, bx + 0.5, by + 0.5);
    UI.deselect(); UI.select('unit', vil.id);
    tap(wxT + 1.3, wyT + 0.5);
    ok('R3 damaged wall catches the repair tap', vil.task && vil.task.type === 'build', vil.task && vil.task.type);
    wall.hp = wall.maxhp;

    // off-center tap on an enemy unit still reads as an attack
    const sold = Units.spawn('defender', 'P', bx + 0.5, by + 2.5, {});
    const foe = Units.spawn('defender', 'A', bx - 2.5, by + 2.5, {});
    UI.deselect(); UI.select('unit', sold.id);
    tap(foe.x + 0.4, foe.y - CFG.SPRITE_LIFT / CFG.TILE - 0.3);
    ok('R4 off-center enemy tap attacks', sold.tUnit === foe.id, sold.task && sold.task.type);
    park(foe, 3, 6);

    // plain move on empty ground still moves
    park(vil, bx + 0.5, by + 0.5); park(sold, 3, 7);
    UI.deselect(); UI.select('unit', vil.id);
    tap(bx + 3.5, by + 3.5);
    ok('R5 plain move on empty ground', vil.task && vil.task.type === 'move', vil.task && vil.task.type);

    // villager selected, tap own healthy house -> selects the house (panel)
    const hxT = bx + 3, hyT = by - 3;
    Bld.place('P', 'house', hxT, hyT, {});
    const house = Bld.at(hxT, hyT); house.construction = 0; house.upgrading = 0; house.hp = house.maxhp;
    park(vil, bx + 0.5, by + 0.5);
    UI.deselect(); UI.select('unit', vil.id);
    tap(hxT + 0.5, hyT + 0.5);
    ok('R6 own house tap opens its panel', UI.sel && UI.sel.type === 'bld' && UI.sel.id === house.id, JSON.stringify(UI.sel));

    // nothing selected: a near-miss beside a building still opens it
    UI.deselect();
    tap(hxT - 0.25, hyT + 0.5);
    ok('R7 near-miss selects the building', UI.sel && UI.sel.type === 'bld' && UI.sel.id === house.id, JSON.stringify(UI.sel));
  }

  /* ============ real-map monte-carlo with thumb wobble ============ */
  {
    let rngState = 12345;
    const rnd = () => (rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let gOK = 0, gN = 0, sOK = 0, sN = 0;
    for (const seed of ['pt1', 'pt2', 'pt3']) {
      G.newGame(seed, 'moderate', 'large'); G.freeVis = true; Screens.show('playing'); S.paused = true;
      S.map.explored.fill(1); G.updateVisibility();
      const vils = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
      const vil = vils[0];
      const targets = [];
      for (let y = 2; y < CFG.H - 2; y++) for (let x = 2; x < CFG.W - 2; x++) {
        if (!CFG.GATHER[S.map.terrain[idx(x, y)]] || S.map.resAmount[idx(x, y)] <= 0) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => Path.passable(x + dx, y + dy))) targets.push([x, y]);
      }
      for (let i = 0; i < 60; i++) {   // gather taps, ±0.6 tile wobble
        const [tx, ty] = targets[(rnd() * targets.length) | 0];
        const jx = (rnd() - 0.5) * 1.2, jy = (rnd() - 0.5) * 1.2;
        park(vil, vil.x, vil.y);
        UI.deselect(); UI.select('unit', vil.id);
        tap(tx + 0.5 + jx, ty + 0.5 + jy);
        gN++;
        if (vil.task && vil.task.type === 'gather' &&
            Math.abs(vil.task.x - tx) <= 1 && Math.abs(vil.task.y - ty) <= 1) gOK++;
      }
      for (let i = 0; i < 40; i++) {   // selection taps at the visual sprite, ±0.25 wobble
        const v = vils[(rnd() * vils.length) | 0];
        const jx = (rnd() - 0.5) * 0.5, jy = (rnd() - 0.5) * 0.5;
        UI.deselect();
        tap(v.x + jx, v.y - CFG.SPRITE_LIFT / CFG.TILE + jy);
        sN++;
        if (UI.sel && UI.sel.type === 'unit') {
          const got = Units.get(UI.sel.id);
          if (UI.sel.id === v.id ||
              (got && Math.hypot(got.x - (v.x + jx), got.y - (v.y + jy)) <= Math.hypot(jx, jy) + 0.01)) sOK++;
        }
      }
    }
    // thresholds from the audited baseline (was 81% / then 93% fixed); the rng
    // is seeded so these are deterministic — drift below means a real break
    ok('MC real-map gather with thumb wobble >= 90%', gOK / gN >= 0.9, gOK + '/' + gN);
    ok('MC real-map sprite selection = 100%', sOK === sN, sOK + '/' + sN);
  }
  return checks;
});

/* ================= THE 48 BOX (audit GAP3-01/02/03/04) =================
   Riders, the whole siege train and the hulls draw in a 48px box (Assets.
   UNIT_BOX) — half as big again as the 32px cast every check above uses, and
   set higher. The hit-tests used to aim at the 32px centre for all of them,
   so a rider's face, an engine's flag and a warship's masthead were not "on"
   the unit: 8-23% of their drawn pixels turned a reselect into a walk order,
   a drag into a camera pan, an attack into a stroll. And this contract could
   not see it: its world was founded while the title demo flag was still up,
   which skips the military strip art, so every big kind drew as the 32px
   procedural cast. This section founds its world the way a real game does,
   WAITS for every 48-box sheet and fails loudly if one never lands, then taps
   EVERY opaque pixel of each kind's real frame — player and rival, facing
   south and east — through the real handlers. The ground truth is the frame
   itself, placed by render.js's unit box (bottom edge on u.y + 0.5 tile,
   CFG.SPRITE_LIFT above), never the code's own hit formula. */
const out48 = await p.evaluate(async () => {
  const checks = [];
  const ok = (name, pass, got) => checks.push({ name, pass: !!pass, got: String(got) });
  const toasts = []; UI.toast = (m, bad) => toasts.push((bad ? '!' : '') + m);
  const TL = CFG.TILE, LIFT = CFG.SPRITE_LIFT / TL;
  const scr = (wx, wy) => [(wx * TL - R.cam.x) * R.cam.z, (wy * TL - R.cam.y) * R.cam.z];
  const tap = (wx, wy) => UI.handleTap(...scr(wx, wy));
  const park = (u, x, y) => { u.task = null; u.path = null; u.tUnit = 0; u.tBld = 0; u.x = x; u.y = y; u.defend = false; };
  Boot.force(); Screens._demo = false;                 // BEFORE newGame, or the strip art is skipped
  G.newGame('tap48', 'moderate', 'large'); Screens._demo = false;
  G.freeVis = true; Screens.show('playing'); S.paused = true;
  S.map.explored.fill(1); G.updateVisibility();
  const idx = (x, y) => MapGen.idx(x, y);
  let bx = 0, by = 0, bestD = -1;
  for (let y = 10; y < CFG.H - 10; y += 2) for (let x = 12; x < CFG.W - 12; x += 2) {
    let d = 1e9; for (const bd of S.buildings) d = Math.min(d, Math.hypot(bd.x - x, bd.y - y));
    if (d > bestD) { bestD = d; bx = x; by = y; }
  }
  // grass above, open water below — the hulls need a sea to sit on
  for (let dy = -7; dy <= 7; dy++) for (let dx = -9; dx <= 9; dx++) {
    S.map.terrain[idx(bx + dx, by + dy)] = dy > 0 ? T.WATER : T.GRASS; S.map.resAmount[idx(bx + dx, by + dy)] = 0;
  }
  Bld._block = null; R.rebuildTerrain();
  S.units.forEach((u, i) => park(u, 3 + (i % 5), 3 + ((i / 5) | 0)));
  const vil = Units.spawn('villager', 'P', bx - 6.5, by - 3.5, {});
  const spear = Units.spawn('defender', 'P', bx - 6.5, by - 1.5, {});
  const bow = Units.spawn('archer', 'P', bx + 6.5, by - 3.5, {});
  const KINDS = Object.keys(Assets.UNIT_BOX).filter(k => CFG.UNITS[k] && k !== 'bear');
  const naval = k => !!CFG.UNITS[k].naval;
  const units = {};
  for (const k of KINDS) for (const o of ['P', 'A'])
    units[k + o] = Units.spawn(k, o, 2 + (o === 'A' ? 4 : 0), 2, {});     // parked out of the way until their turn
  // wait for the sheets the game itself would draw — a check that measures
  // the 32px stand-in cast instead is the blindness this section exists for
  const t0 = performance.now();
  const missing = () => Object.values(units).filter(u => !R.sheetFrames(u)).map(u => u.kind + '/' + u.owner);
  while (missing().length && performance.now() - t0 < 60000) await new Promise(r => setTimeout(r, 150));
  const miss = missing();
  ok('48 box: every big kind draws from its real sheet (not the 32px fallback)', !miss.length && KINDS.length >= 10,
    miss.length ? 'never loaded: ' + miss.join(', ') : KINDS.length + ' kinds × 2 owners');
  if (miss.length) return checks;
  const opaque = (u) => {                                   // the frame's own opaque pixels, as world points
    const fr = R.unitSprite(u), B = R.unitBox(u), s = B / TL;
    const c = document.createElement('canvas'); c.width = fr.width; c.height = fr.height;
    c.getContext('2d').drawImage(fr, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, fr.width, fr.height).data;
    const pts = [], step = Math.max(1, Math.round(fr.width / B));   // one sample per screen-ish pixel
    for (let y = 0; y < fr.height; y += step) for (let x = 0; x < fr.width; x += step)
      if (d[(y * fr.width + x) * 4 + 3] > 128)
        pts.push([u.x - s / 2 + (x + 0.5) / fr.width * s, u.y + 0.5 - LIFT - s + (y + 0.5) / fr.height * s]);
    return { pts, B };
  };
  const tally = {};
  const bump = (name, k, good) => { const t = tally[name] || (tally[name] = { n: 0, bad: 0, worst: {} }); t.n++; if (!good) { t.bad++; t.worst[k] = (t.worst[k] || 0) + 1; } };
  let box48 = 0;
  for (const k of KINDS) for (const face of ['s', 'e']) {
    const zx = bx + 0.5, zy = naval(k) ? by + 1.5 : by - 3.5;   // hulls in the first row of water, beside the shore
    const own = units[k + 'P'], foe = units[k + 'A'];
    for (const u of [own, foe]) park(u, 2 + (u.owner === 'A' ? 4 : 0), 2);
    R.cam.z = 1.7;
    // ---- own unit: reselect from a villager, arm a drag, select from nothing
    park(own, zx, zy); R._faceMap.set(own, { x: own.x, y: own.y, dir: face }); R.centerOn(zx, zy - 0.5);
    const O = opaque(own); if (O.B > TL) box48++;
    for (const [wx, wy] of O.pts) {
      park(vil, bx - 6.5, by - 3.5);
      UI.deselect(); UI.select('unit', vil.id); tap(wx, wy);
      const boarded = vil.task && vil.task.id === own.id;
      bump('villager selected → tapping an own big unit reselects it (transport: boards)', k + '/' + face,
        (UI.sel && UI.sel.type === 'unit' && UI.sel.id === own.id) || (Units.isTransport(own) && boarded));
      UI.deselect(); tap(wx, wy);
      bump('nothing selected → tapping an own big unit selects it', k + '/' + face, UI.sel && UI.sel.type === 'unit' && UI.sel.id === own.id);
      UI.deselect(); UI.select('unit', own.id);
      bump('a press on the selected big unit arms the drag (never a pan)', k + '/' + face, !!UI.dragMoveAnchor(...scr(wx, wy)));
    }
    park(own, 2, 2);
    // ---- rival unit: attack it by tap and by drag-drop
    park(foe, zx, zy); R._faceMap.set(foe, { x: foe.x, y: foe.y, dir: face });
    const F = opaque(foe);
    const hunter = naval(k) ? bow : spear;
    for (const [wx, wy] of F.pts) {
      park(hunter, hunter === bow ? bx + 6.5 : bx - 6.5, hunter === bow ? by - 3.5 : by - 1.5);
      UI.deselect(); UI.select('unit', hunter.id); tap(wx, wy);
      bump('own soldier selected → tapping a rival big unit attacks it', k + '/' + face, hunter.tUnit === foe.id);
      park(hunter, hunter.x, hunter.y);
      UI.deselect(); UI.select('unit', hunter.id); UI.commitMoveDrag(...scr(wx, wy));
      bump('a drag dropped on a rival big unit attacks it', k + '/' + face, hunter.tUnit === foe.id);
    }
    park(foe, 6, 2);
  }
  ok('48 box: the frames really are the big box', box48 === KINDS.length * 2, box48 + ' of ' + KINDS.length * 2 + ' own frames drawn at 48');
  for (const [name, t] of Object.entries(tally))
    ok('48 box: ' + name, t.bad === 0, (t.n - t.bad) + '/' + t.n + (t.bad ? ' — misses by kind/facing ' + JSON.stringify(t.worst) : ''));
  // ---- the crowd: a two-per-tile rank of riders — the rider under the finger wins
  {
    const rs = [];
    for (let i = 0; i < 6; i++) { const r = Units.spawn('rider', 'P', bx - 2 + (i % 3) * 0.5 + 0.25, by - 4.5 + ((i / 3) | 0) * 0.5, {}); R._faceMap.set(r, { x: r.x, y: r.y, dir: 's' }); rs.push(r); }
    R.centerOn(bx - 1, by - 4.5);
    let n = 0, good = 0;
    // the topmost drawn rider at each point (R.draw sorts by y — later is on
    // top), read off each frame's own alpha at that point
    const order = rs.slice().sort((a, b2) => a.y - b2.y);
    const covers = (r) => {
      const fr = R.unitSprite(r), s = R.unitBox(r) / TL;
      const c = document.createElement('canvas'); c.width = fr.width; c.height = fr.height;
      c.getContext('2d').drawImage(fr, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, fr.width, fr.height).data;
      return (wx, wy) => {
        const x = Math.floor((wx - (r.x - s / 2)) / s * fr.width), y = Math.floor((wy - (r.y + 0.5 - LIFT - s)) / s * fr.height);
        return x >= 0 && y >= 0 && x < fr.width && y < fr.height && d[(y * fr.width + x) * 4 + 3] > 128;
      };
    };
    const maps = order.map(r => ({ r, on: covers(r), pts: opaque(r).pts }));
    for (const m of maps) for (const [wx, wy] of m.pts) {
      let top = null; for (const q of maps) if (q.on(wx, wy)) top = q.r;
      if (!top) continue;
      UI.deselect(); tap(wx, wy); n++;
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === top.id) good++;
    }
    ok('48 box: in a two-per-tile rank the rider drawn on top under the finger is the one selected', good === n && n > 500, good + '/' + n);
    rs.forEach(r => park(r, 3, 3));
  }
  return checks;
});
out.push(...out48);

let fail = 0;
for (const c of out) {
  console.log((c.pass ? '  PASS ' : '  FAIL ') + c.name + '   [' + c.got + ']');
  if (!c.pass) fail++;
}
const pageErrs = errs.filter(e => !/supabase|fetch|TUNNEL/.test(e));
if (pageErrs.length) { console.log('page errors:', pageErrs); fail++; }
console.log(fail ? `\n${fail} FAILURE(S) — tap/selection contract broken, do not ship` : '\nall tap/selection contract checks pass');
await b.close();
process.exit(fail ? 1 : 0);
