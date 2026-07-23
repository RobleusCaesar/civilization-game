// TAP & SELECTION CONTRACT — run this after ANY change near:
//   ui.js      UI.handleTap / handleDoubleTap / snapNear / select / deselect
//   units.js   assignGather / assignBuild / moveTo / setPath
//   render.js  screenToWorld / screenToTile / unit draw offsets (CFG.SPRITE_LIFT)
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
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 900 } });
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
