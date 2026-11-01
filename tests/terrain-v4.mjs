/* TERRAIN V4 — the contract for js/terrain.js and js/terrain-core.js (CLAUDE.md,
   TERRAIN V4). The new ground and water for a played world, painted in Web
   Workers, with the classic painters kept whole as the rollback.

   1. WHO GETS IT: a played world wears V4; the title's demo world does not.
   2. THE WAY BACK NEEDS NO DEPLOY: ?terrain=classic gives the classic painters
      and is remembered on the device; ?terrain=v4 undoes it; CFG.TERRAIN.V4 =
      false is the kill switch; a worker that errors stands V4 down on the spot
      and the world is repainted with the classic painters.
   3. IT DRAWS ONLY: no rule moves — passability, placement and the whole
      save are identical with V4 on and off for the same seed.
   4. DETERMINISTIC: a chunk is a pure function of the world — the core built
      afresh paints the same bytes, and so does a saved-and-loaded world.
   5. AN EDIT IS A REBUILD: after a dig, a bridge and a mound the core's
      patched state paints exactly what a core built from the edited world does.
   6. NOTHING IN THE BLACK: the ground stops at the board's edge.
   7. THE CORE IS ITS SOURCE, BUILT: js/terrain-core.js is
      tools/terrain-core.src.js run through tools/build-terrain-core.cjs.

     node tests/terrain-v4.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 7. the generated core is the source, built ---- */
{
  const build = require(join(root, 'tools/build-terrain-core.cjs'));
  const { out } = build(readFileSync(join(root, 'tools/terrain-core.src.js'), 'utf8'));
  const shipped = readFileSync(join(root, 'js/terrain-core.js'), 'utf8');
  ck('theCoreIsItsSourceBuilt', out === shipped, out === shipped ? 'js/terrain-core.js == build(tools/terrain-core.src.js)' : 'stale: run node tools/build-terrain-core.cjs');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const iG = html.indexOf('js/game.js?v='), iC = html.indexOf('js/terrain-core.js?v='), iT = html.indexOf('js/terrain.js?v=');
  ck('andItLoadsAfterTheGameItWraps', iG > 0 && iC > iG && iT > iC, JSON.stringify({ game: iG, core: iC, terrain: iT }));
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const SEED = 'bay31';
async function page(q) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + (q || ''));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  return { p, ctx };
}
/* founds the world and, in the SAME tick (before a frame can move anyone), reads
   everything a rule could ask: passability and placement on every tile, the
   terrain, and the whole save */
const startWorld = (p, seed) => p.evaluate((seed) => {
  G.newGame(seed, 'moderate', 'medium'); Screens._demo = false; S.paused = true;
  let h = 2166136261; const add = v => { h = Math.imul(h ^ (v | 0), 16777619); };
  for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
    add(Path.passable(x, y, 'P') ? 1 : 0); add(Bld.canPlace('P', 'house', x, y, { noCost: true, noSeal: true }).ok ? 1 : 0);
  }
  // a unit's cosmetic draws (its animation clock, wander timer, which of the two looks) come
  // from Math.random and differ between ANY two pages; the rest of the save must not
  const sv = JSON.parse(G.saveJSON());
  sv.units = (sv.units || []).map(u => ({ kind: u.kind, owner: u.owner, x: u.x, y: u.y }));
  const save = JSON.stringify(sv); let sh = 2166136261; for (let i = 0; i < save.length; i++) sh = Math.imul(sh ^ save.charCodeAt(i), 16777619);
  const rules = { grid: (h >>> 0).toString(16), terr: Array.from(S.map.terrain).join(''), save: (sh >>> 0).toString(16) };
  Screens.show('playing');
  G.freeVis = true; for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1; G.updateVisibility();
  return rules;
}, seed);
const settle = p => p.waitForFunction(() => !TerrainX.on || (TerrainX.ready && TerrainX.chunks.size > 0), null, { timeout: 60000 }).catch(() => {});

/* ---- 1, 3, 4, 5, 6 on one played world ---- */
let rulesV4 = null;
{
  const { p, ctx } = await page('');
  const title = await p.evaluate(() => ({ on: TerrainX.on, wanted: Terrain4.wanted(), classic: R.paintGround.toString().length > 40 }));
  rulesV4 = await startWorld(p, SEED);
  await settle(p);
  const game = await p.evaluate(() => ({ on: TerrainX.on, ready: TerrainX.ready, chunks: TerrainX.chunks.size, stood: R.paintGround.toString().length < 40 }));
  ck('aPlayedWorldWearsV4', game.on && game.ready && game.chunks > 0 && game.stood, JSON.stringify(game));
  ck('andTheTitlesDemoWorldDoesNot', title.wanted === true && title.on === false && title.classic === true, JSON.stringify(title));

  // 4. the core is a pure function of the world: a fresh core paints the same bytes
  const det = await p.evaluate(() => {
    const keys = TerrainX.viewChunks(1).slice(0, 6), w = TerrainX.world(), fresh = TCCore(); fresh.setWorld(w);
    const h = (core, cx, cy) => TerrainX.coreHash(cx, cy, core);
    return keys.map(([cx, cy]) => [h(TerrainX.core, cx, cy), h(fresh, cx, cy)]);
  });
  ck('aChunkIsAPureFunctionOfTheWorld', det.length >= 4 && det.every(([a, c]) => a === c), det.length + ' chunks, ' + det.filter(([a, c]) => a !== c).length + ' differ');

  // 5. an edit repaints what a rebuild would: patch the live core, compare with a core built from the edited world
  const ed = await p.evaluate(() => {
    const W = CFG.W, H = CFG.H, terr = S.map.terrain;
    // a grass run beside water to dig, bridge and fill
    let site = null;
    for (let y = 3; y < H - 3 && !site; y++) for (let x = 3; x < W - 6 && !site; x++) {
      const ok = [0, 1, 2, 3].every(i => terr[y * W + x + i] === T.GRASS && !Bld.at(x + i, y)) && terr[y * W + x + 4] === T.WATER;
      if (ok) site = [x, y];
    }
    if (!site) return { site: null };
    const [x, y] = site;
    for (let i = 3; i >= 0; i--) Terraform.dig(x + i, y);
    Bld.buildBridge('P', x + 1, y);
    Terraform.mound(x + 3, y);
    R.flushRepaint && R.flushRepaint();
    TerrainX.noteEdit();
    const cx = Math.floor(x / 8), cy = Math.floor(y / 8), keys = [];
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) if (i >= 0 && j >= 0 && i < Math.ceil(W / 8) && j < Math.ceil(H / 8)) keys.push([i, j]);
    // a rebuild from scratch of every field, then the same chunks from a fresh core
    const live = keys.map(([i, j]) => TerrainX.coreHash(i, j));
    TerrainX.buildSDF(); TerrainX.buildFields(); TerrainX.buildShade();
    const fresh = TCCore(); fresh.setWorld(TerrainX.world());
    const full = keys.map(([i, j]) => TerrainX.coreHash(i, j, fresh));
    return { site, n: keys.length, diff: live.filter((v, k) => v !== full[k]).length };
  });
  ck('anEditPaintsWhatARebuildWould', ed.site && ed.n >= 4 && ed.diff === 0, JSON.stringify(ed));

  // 6. nothing in the black: the board's south-east corner in view, the void stays void
  const black = await p.evaluate(async () => {
    R.cam.z = 1; R.centerOn(CFG.W - 2, CFG.H - 2);
    await TerrainX.whenIdle(30000);
    // the game's own cache is swapped for a clear one, so only V4's ground can paint the void
    const keep = R.terrainCache, e = document.createElement('canvas'); e.width = keep.width; e.height = keep.height; R.terrainCache = e;
    R.draw();
    const c = document.getElementById('c') || document.querySelector('canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    R.terrainCache = keep;
    const b = R.boardPx(), dpr = c.width / (R.viewW ? R.viewW() : innerWidth);
    let lit = 0, n = 0;
    for (let py = 0; py < c.height; py += 2) for (let px = 0; px < c.width; px += 2) {
      const wx = px / dpr / R.cam.z + R.cam.x, wy = py / dpr / R.cam.z + R.cam.y;
      if (wx < b.x1 + 4 && wy < b.y1 + 4) continue;              // on the board (or its seam)
      if (wx > CFG.W * CFG.TILE || wy > CFG.H * CFG.TILE) continue; // past the array: never drawn by anyone
      n++; const o = (py * c.width + px) * 4; if (d[o] + d[o + 1] + d[o + 2] > 90) lit++;
    }
    return { n, lit };
  });
  ck('itDrawsNothingInTheBlack', black.n > 200 && black.lit === 0, JSON.stringify(black));

  // 4b. the same world saved and loaded paints the same bytes
  const sl = await p.evaluate(async () => {
    const keys = TerrainX.viewChunks(0).slice(0, 4), before = keys.map(([i, j]) => TerrainX.coreHash(i, j));
    const json = G.saveJSON(); G.loadJSON(json); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const t0 = performance.now(); while (!(TerrainX.ready && TerrainX.core) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 50));
    const after = keys.map(([i, j]) => TerrainX.coreHash(i, j));
    return { n: keys.length, diff: before.filter((v, k) => v !== after[k]).length, on: TerrainX.on };
  });
  ck('andASavedWorldPaintsTheSameBytes', sl.on && sl.n >= 2 && sl.diff === 0, JSON.stringify(sl));

  // 2c. a worker that errors stands V4 down and the classic painters repaint the world
  const fb = await p.evaluate(() => {
    const w = TerrainX.workers[0];
    if (!w || !w.onerror) return { worker: false };
    w.onerror({ message: 'test fault' });
    const c = R.terrainCache, g = c.getContext('2d'), tl = CFG.TILE;
    // a grass tile well inside the board: the classic painters fill it again
    let gx = -1, gy = -1;
    for (let y = 4; y < CFG.H - 4 && gx < 0; y++) for (let x = 4; x < CFG.W - 4; x++) if (S.map.terrain[y * CFG.W + x] === T.GRASS && !Bld.at(x, y)) { gx = x; gy = y; break; }
    const d = g.getImageData(gx * tl + 8, gy * tl + 8, 16, 16).data; let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
    return { worker: true, failed: Terrain4.failed, on: TerrainX.on, classic: R.paintGround.toString().length > 40, opaque, wanted: Terrain4.wanted() };
  });
  ck('aFailingWorkerFallsBackToClassic', fb.worker && /test fault/.test(fb.failed) && fb.on === false && fb.classic && fb.opaque > 200 && fb.wanted === false, JSON.stringify(fb));
  ck('thePlayedWorldThrewNothing', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---- 2a/2b. the classic link, remembered; v4 undoes it ---- */
{
  const { p, ctx } = await page('?terrain=classic');
  const rulesC = await startWorld(p, SEED);
  await p.waitForTimeout(800);
  const c1 = await p.evaluate(() => ({ on: TerrainX.on, wanted: Terrain4.wanted(), classic: R.paintGround.toString().length > 40, stored: localStorage.getItem('neo-terrain') }));
  ck('theClassicLinkIsTheRollback', c1.on === false && c1.wanted === false && c1.classic && c1.stored === 'classic', JSON.stringify(c1));
  // 3. the rules are the same with the classic painters
  ck('itChangesNoRule', rulesV4 && rulesV4.grid === rulesC.grid && rulesV4.terr === rulesC.terr && rulesV4.save === rulesC.save,
    JSON.stringify({ grid: [rulesV4 && rulesV4.grid, rulesC.grid], save: [rulesV4 && rulesV4.save, rulesC.save] }));
  // remembered: the same device without the link is still classic
  await p.goto('file://' + join(root, 'index.html'));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  const c2 = await p.evaluate(() => Terrain4.wanted());
  await p.goto('file://' + join(root, 'index.html') + '?terrain=v4');
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  const c3 = await p.evaluate(() => ({ wanted: Terrain4.wanted(), stored: localStorage.getItem('neo-terrain') }));
  ck('andTheDeviceRemembersItUntilV4UndoesIt', c2 === false && c3.wanted === true && c3.stored === null, JSON.stringify({ remembered: !c2, undone: c3 }));
  await ctx.close();
}

/* ---- 2d. the kill switch ---- */
{
  const { p, ctx } = await page('');
  await p.evaluate(() => { CFG.TERRAIN.V4 = false; });
  await startWorld(p, SEED);
  await p.waitForTimeout(800);
  const k = await p.evaluate(() => ({ on: TerrainX.on, wanted: Terrain4.wanted(), classic: R.paintGround.toString().length > 40 }));
  ck('theKillSwitchStandsItDown', k.on === false && k.wanted === false && k.classic, JSON.stringify(k));
  await ctx.close();
}
await b.close();

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (fails.length) { console.log('\n' + fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('\nALL ' + Object.keys(res).length + ' CHECKS PASS');
