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

   V5 (js/terrain-v5.js, CLAUDE.md TERRAIN V5) — V4's ground given a REGION:
   8. A played world wears the region its landform calls for; the core is handed
      it (world.R5) and the fields (F.m5 …); nothing about the rules moves.
   9. THE WAY BACK: ?biome=v4 paints V4 byte for byte and is remembered on the
      device until ?biome=auto; CFG.TERRAIN.V5 = false is the kill switch; a
      field build that throws stands V5 down for the session.
  10. THE FIELDS ARE CACHED, NEVER STALE: an edit's rebuild equals a cold one,
      and an edit near food or a new building repaints what a rebuild would.
  11. THE SWITCH IS A TESTER'S TOOL: a player's page carries no chip.

   THE GROUND IS READY WHEN THE WORLD OPENS (PX-20):
  12. While a world is being founded (the draft) or entered (the plaque, a
      Continue's included) the workers are asked for the view it will open
      on, without a single draw, so the first frame has no stand-in ground;
      behind the pause menu nothing is prefetched; and under the classic
      painters, the kill switch and the title's demo it asks for nothing.

   THE CHUNKS MEET WITHOUT A SEAM (build 191):
  13. Every chunk of ground and every tile of road lands on whole device
      pixels, neighbours edge to edge, so a GPU canvas draws no grid line.

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
  const iV = html.indexOf('js/terrain-v5.js?v=');
  ck('andItLoadsAfterTheGameItWraps', iG > 0 && iC > iG && iT > iC && iV > iT, JSON.stringify({ game: iG, core: iC, terrain: iT, v5: iV }));
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

  // 3b. the worn roads are still drawn: a road is quicker to walk, so a player must see it
  // (the worn paths, which stand down while the road builder is on — js/roads.js; with the
  // builder switched off they are the game's roads again, and V4 must still draw them)
  const road = await p.evaluate(() => {
    if (CFG.ROADS) CFG.ROADS.ON = false;
    const W = CFG.W, H = CFG.H, terr = S.map.terrain, tl = CFG.TILE, run = [];
    for (let y = 4; y < H - 4 && !run.length; y++) for (let x = 4; x < W - 12; x++) {
      if ([...Array(7).keys()].every(i => terr[y * W + x + i] === T.GRASS && !Bld.at(x + i, y))) { for (let i = 0; i < 7; i++) run.push([x + i, y]); break; }
    }
    S.map.wear = S.map.wear || {};
    for (const [x, y] of run) S.map.wear[y * W + x] = [30, S.day];
    if (G._wearRoads !== undefined) G._wearRoads = run.length;
    R.rebuildTerrain();
    const g = R.terrainCache.getContext('2d'); let painted = 0, n = 0;
    for (const [x, y] of run.slice(1, -1)) { const d = g.getImageData(x * tl, y * tl + 12, tl, 8).data; for (let i = 3; i < d.length; i += 4) { n++; if (d[i] > 0) painted++; } }
    const out = { tiles: run.length, share: +(painted / Math.max(1, n)).toFixed(2), on: TerrainX.on, level: G.wearLevel ? G.wearLevel(run[3][0], run[3][1]) : null };
    if (CFG.ROADS) CFG.ROADS.ON = true;
    return out;
  });
  ck('theWornRoadsStillShow', road.on && road.tiles === 7 && road.share > 0.3, JSON.stringify(road));

  /* 5b. the game's own layer over the V4 ground (trees, rock, roads, craters) is
     repainted as a rebake would paint it: stood down, the classic ground reset
     erased nothing, and a felled wood kept its trees over the new ground */
  const ov = await p.evaluate(() => {
    const W = CFG.W, terr = S.map.terrain, seen = S.map.seenTerrain;
    const set = (i, t) => { terr[i] = t; if (seen) seen[i] = t; R.drawTileAt(i % W, (i / W) | 0); };
    R.rebuildTerrain();
    let felled = 0, quarried = 0;
    for (let i = 0; i < terr.length && felled < 6; i++) if (terr[i] === T.FOREST) { set(i, T.STUMPS); felled++; }
    for (let i = 0; i < terr.length && quarried < 3; i++) if (terr[i] === T.HILLS) { set(i, T.PEBBLES); quarried++; }
    if (R.flushRepaint) R.flushRepaint();
    const c = R.terrainCache, a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice();
    R.rebuildTerrain();
    const d = R.terrainCache.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== d[i]) diff++;
    return { on: TerrainX.on, felled, quarried, diff };
  });
  ck('andItsOwnLayerRepaintsAsItRebakes', ov.on && ov.felled === 6 && ov.quarried >= 1 && ov.diff === 0, JSON.stringify(ov));

  /* 5c. the purge watchdog (R.cacheState) reads that layer right: it is mostly
     open transparency over the V4 ground, and read in the board's middle a
     HEALTHY cache answered "lost" — a needless rebake every 30s and on every
     return to the tab. A cache whose pixels the OS took back still reads lost. */
  const pg = await p.evaluate(() => {
    R.rebuildTerrain();
    const healthy = R.cacheState();
    let rebaked = 0; const orig = R.reviveTerrain; R.reviveTerrain = function () { rebaked++; return orig.apply(this, arguments); };
    R.cacheReturned();
    const c = R.terrainCache, keep = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    const purged = R.cacheState();
    c.getContext('2d').putImageData(keep, 0, 0); R.reviveTerrain = orig;
    return { on: TerrainX.on, healthy, rebakedOnReturn: rebaked, purged };
  });
  ck('aHealthyV4LayerIsNotAPurge', pg.on && pg.healthy === 'ok' && pg.rebakedOnReturn === 0 && pg.purged === 'lost', JSON.stringify(pg));

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
/* ---- 8–11. V5: the region ---- */
{
  const { p, ctx } = await page('');
  const rules5 = await startWorld(p, SEED);
  await settle(p);
  const reg = await p.evaluate(() => {
    const want = TerrainV5.AUTO[S.map.landform + ':' + S.map.variant] || 'tuscan', w = TerrainX.world();
    return { want, current: TerrainV5.current(), live: TerrainX._v5, r5: !!(w.R5 && w.R5.name), fields: ['e5', 'm5', 'g5', 'k5', 'v5', 's5', 'p5'].every(k => TerrainX.F[k] && TerrainX.F[k].length === CFG.W * CFG.H),
      chip: !!document.getElementById('v5biome'), stored: localStorage.getItem('neo-biome') };
  });
  ck('aPlayedWorldWearsItsRegion', reg.current === reg.want && reg.live === reg.want && reg.r5 && reg.fields, JSON.stringify(reg));
  ck('andAPlayerSeesNoSwitch', reg.chip === false && reg.stored === null, JSON.stringify({ chip: reg.chip, stored: reg.stored }));
  ck('theRegionChangesNoRule', rulesV4 && rulesV4.grid === rules5.grid && rulesV4.terr === rules5.terr && rulesV4.save === rules5.save, JSON.stringify({ grid: [rulesV4 && rulesV4.grid, rules5.grid] }));

  // 10. the cached fields are never stale: after edits (water moved, food spent, a hall's neighbour raised) the
  // warm rebuild equals a cold one, and the chunks an edit repaints equal a core built from the edited world
  const fe = await p.evaluate(() => {
    const W = CFG.W, H = CFG.H, terr = S.map.terrain, seen = S.map.seenTerrain;
    const set = (i, t) => { terr[i] = t; if (seen) seen[i] = t; R.drawTileAt(i % W, (i / W) | 0); };
    let fert = -1; for (let i = 0; i < terr.length; i++) if (terr[i] === T.FERTILE) { fert = i; break; }
    if (fert >= 0) set(fert, T.BARREN);
    let water = -1; for (let i = W * 3; i < terr.length - W * 3; i++) if (terr[i] === T.GRASS && terr[i + 1] === T.WATER && !Bld.at(i % W, (i / W) | 0)) { water = i; break; }
    if (water >= 0) Terraform.dig(water % W, (water / W) | 0);
    let spot = null; for (let y = 4; y < H - 4 && !spot; y++) for (let x = 4; x < W - 4 && !spot; x++) if (Bld.canPlace('P', 'house', x, y, { noCost: true, noSeal: true }).ok) spot = [x, y];
    if (spot) Bld.place('P', 'house', spot[0], spot[1], { free: true, instant: true });
    if (R.flushRepaint) R.flushRepaint();
    const t0 = performance.now(); const e = TerrainX.noteEdit(); const editMs = performance.now() - t0;
    // (the edit builds a NEW fields object: read it after, never through a reference taken before)
    const warm = {}; for (const k of ['e5', 'm5', 'g5', 'k5', 's5', 'p5']) warm[k] = Array.from(TerrainX.F[k]);
    TerrainV5._c = null; TerrainX.buildFields();
    let stale = 0; for (const k of Object.keys(warm)) { const a = warm[k], b = TerrainX.F[k]; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) { stale++; break; } }
    // every chunk, live (as the edit left it) against a core built afresh from the edited world
    const nC = Math.ceil(W / 8), nR = Math.ceil(H / 8), keys = []; for (let j = 0; j < nR; j++) for (let i = 0; i < nC; i++) keys.push([i, j]);
    const live = keys.map(([i, j]) => TerrainX.coreHash(i, j));
    TerrainX.buildSDF(); TerrainX.buildFields(); TerrainX.buildShade();
    const fresh = TCCore(); fresh.setWorld(TerrainX.world());
    const diff = keys.filter(([i, j], k) => TerrainX.coreHash(i, j, fresh) !== live[k]).length;
    return { fert: fert >= 0, water: water >= 0, house: !!spot, edit: e && e.chunks, stale, chunks: keys.length, diff, editMs: +editMs.toFixed(1) };
  });
  ck('theCachedFieldsAreNeverStale', fe.fert && fe.water && fe.house && fe.stale === 0, JSON.stringify(fe));
  ck('andAnEditOfFoodOrTownPaintsWhatARebuildWould', fe.diff === 0, JSON.stringify({ chunks: fe.chunks, diff: fe.diff, edited: fe.edit, editMs: fe.editMs }));

  // 9c. a field build that throws stands V5 down: the world paints as V4, never as a broken map
  const ft = await p.evaluate(() => {
    const keep = TerrainV5.fields; TerrainV5.fields = () => { throw new Error('test fault'); };
    TerrainX.buildFields(); TerrainV5.fields = keep;
    const w = TerrainX.world();
    return { failed: TerrainV5.failed, live: TerrainX._v5, r5: w.R5, m5: !!TerrainX.F.m5, current: TerrainV5.current() };
  });
  ck('aFaultStandsTheRegionDownToV4', ft.failed === true && ft.live === null && ft.r5 === null && !ft.m5 && ft.current === null, JSON.stringify(ft));
  ck('andTheRegionThrewNothingElse', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await ctx.close();
}
/* ---- 9a/9b. ?biome=v4 is V4 byte for byte, remembered until ?biome=auto ---- */
{
  const { p, ctx } = await page('?biome=v4');
  await startWorld(p, SEED);
  await settle(p);
  const v = await p.evaluate(() => {
    const keys = TerrainX.viewChunks(1).slice(0, 6), w = TerrainX.world();
    // the V4 core with no region at all: the same bytes
    const plain = TCCore(); const w4 = Object.assign({}, w, { R5: null }); delete w4.F.e5; plain.setWorld(w4);
    return { live: TerrainX._v5, r5: w.R5, stored: localStorage.getItem('neo-biome'), chip: !!document.getElementById('v5biome'),
      same: keys.map(([i, j]) => TerrainX.coreHash(i, j) === TerrainX.coreHash(i, j, plain)), n: keys.length };
  });
  ck('theV4LinkPaintsV4ByteForByte', v.live === null && v.r5 === null && v.n >= 4 && v.same.every(Boolean), JSON.stringify({ live: v.live, n: v.n, same: v.same.filter(Boolean).length }));
  await p.goto('file://' + join(root, 'index.html'));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  const r1 = await p.evaluate(() => ({ choice: TerrainV5.choice(), chip: !!document.getElementById('v5biome') }));
  await p.goto('file://' + join(root, 'index.html') + '?biome=auto');
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  const r2 = await p.evaluate(() => ({ choice: TerrainV5.choice(), stored: localStorage.getItem('neo-biome') }));
  ck('andTheDeviceRemembersItUntilAutoUndoesIt', v.stored === 'v4' && r1.choice === 'v4' && r2.choice === 'auto' && r2.stored === null, JSON.stringify({ stored: v.stored, r1, r2 }));
  /* THE SWITCH IS PUT AWAY FOR NOW (operator, build 182: "hide the ability … to change
     the map background for now"): no chip on a device that asked by link, and none on a
     test page's path; the machinery stands ready (CHIP true and a mount bring it back) */
  const away = await p.evaluate(() => {
    const before = !!document.getElementById('v5biome');
    const was = TerrainV5.CHIP; TerrainV5.CHIP = true; TerrainV5.mount(); const back = !!document.getElementById('v5biome');
    const el = document.getElementById('v5biome'); if (el) el.remove(); TerrainV5.CHIP = was;
    return { before, back, chip: was, tester: TerrainV5.tester() };
  });
  ck('theLandSwitchIsPutAwayForNow', v.chip === false && r1.chip === false && away.before === false && away.chip === false && away.back === true, JSON.stringify({ v: v.chip, r1: r1.chip, away }));
  await ctx.close();
}
/* ---- 9d. the region's kill switch ---- */
{
  const { p, ctx } = await page('');
  await p.evaluate(() => { CFG.TERRAIN.V5 = false; });
  await startWorld(p, SEED);
  await settle(p);
  const k = await p.evaluate(() => ({ on: TerrainX.on, live: TerrainX._v5, r5: TerrainX.world().R5, current: TerrainV5.current() }));
  ck('theRegionsKillSwitchPaintsPlainV4', k.on === true && k.live === null && k.r5 === null && k.current === null, JSON.stringify(k));
  await ctx.close();
}

/* ---- 12. THE GROUND IS READY WHEN THE WORLD OPENS (PX-20). Chunks were asked
   for only from R.draw, which does not run behind the draft or the plaque, so
   every world opened on flat stand-in ground that popped in square by square
   for seconds. Here R.draw is a counter that draws NOTHING while the world
   waits, so any ground that arrives was asked for by the prefetch alone. ---- */
const groundWaits = (p) => p.evaluate(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(25); return f(); };
  // the world is never drawn while it waits; a prefetch that drew would be counted here
  let inPf = false;
  window.__draws = 0; window.__drawOrig = R.draw; R.draw = function () { if (inPf) window.__draws++; };
  window.__pf = 0; const pf = TerrainX.prefetch;
  if (pf) TerrainX.prefetch = function () { window.__pf++; inPf = true; try { return pf.apply(this, arguments); } finally { inPf = false; } };
  // a world founded and waiting on its draft (Screens.foundRun, then the draft screen)
  Screens._demo = false;
  R.deferBake = true; try { G.newGame('pf-bay', 'moderate', 'medium', undefined, 'green'); } finally { R.deferBake = false; }
  Screens.show('draft');
  await until(() => TerrainX.ready || !TerrainX.on, 30000);
  // …until the view it will open on (this camera at the zoom enterGame gives it)
  // is all in, or a minute: a worker on a loaded machine is slow, never absent
  const z0 = R.cam.z; R.cam.z = R.defaultZoom();
  const view = TerrainX.viewChunks(0).map(([a, b]) => a + ',' + b); R.cam.z = z0;
  const t0 = performance.now();
  if (TerrainX.on) await until(() => view.every(k => TerrainX.chunks.has(k)), 120000); else await sleep(3000);
  return { on: TerrainX.on, ready: TerrainX.ready, chunks: TerrainX.chunks.size, pending: TerrainX.pending.size, prefetch: window.__pf, draws: window.__draws, defined: !!pf,
    view: view.length, have: view.filter(k => TerrainX.chunks.has(k)).length, ms: Math.round(performance.now() - t0) };
});
{
  const { p, ctx } = await page('');
  const w = await groundWaits(p);
  // …the card is kept and the world opens: its FIRST frame's view, read before that frame draws
  const first = await p.evaluate(async () => {
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(25); return f(); };
    let at = null; const draw = window.__drawOrig;
    R.draw = function () {
      if (!at && Screens.current === 'playing') { const v = TerrainX.viewChunks(0); at = { view: v.length, have: v.filter(([a, b]) => TerrainX.chunks.has(a + ',' + b)).length, z: R.cam.z }; }
      return draw.apply(this, arguments);
    };
    Cards.pick(0); Screens.enterGame();
    await until(() => at, 30000);
    return at;
  });
  ck('theOpeningViewIsAskedForWhileTheWorldWaits', w.on && w.ready && w.defined && w.prefetch > 0 && w.view > 0 && w.have === w.view && w.draws === 0,
    `behind the draft: the opening view ${w.have}/${w.view} in after ${w.ms} ms (${w.chunks} chunks), ${w.prefetch} prefetch calls, ${w.draws} draws`);
  ck('soTheFirstFrameStandsOnRealGround', first && first.view > 0 && first.have === first.view,
    `the first frame's view: ${first ? first.have + '/' + first.view : '?'} chunks real at zoom ${first && first.z}`);

  /* the pause menu is not a world being entered: with the camera two screens
     from the hall, nothing is prefetched there through a ten-second pause, and
     the view the player left is still standing when they come back. The view
     is let finish first (the game draws it every frame), so a stand-in on the
     first frame back is the pause's doing, never the camera's last move; the
     chunk requests the pause does make are schedule()'s own, from the world's
     once-a-second draw — the same code as before the prefetch existed. */
  const pz = await p.evaluate(async () => {
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(25); return f(); };
    const tc = Bld.tcOf('P'), z = R.cam.z;
    const dx = 2 * R.viewW() / z / CFG.TILE, far = Bld.cx(tc) + dx < CFG.W - 4 ? Bld.cx(tc) + dx : Bld.cx(tc) - dx;
    R.centerOn(far, Bld.cy(tc));
    const viewIn = () => TerrainX.viewChunks(0).every(([a, b]) => TerrainX.chunks.has(a + ',' + b));
    const settled = await until(viewIn, 120000);   // the view in sight — the ring round it may still be filling
    const pf0 = window.__pf; let asks = 0; const req = TerrainX.request;
    TerrainX.request = function () { asks++; return req.apply(this, arguments); };
    Screens.show('paused');
    await sleep(10000);
    TerrainX.request = req;
    const calls = window.__pf - pf0;
    let at = null; const draw = R.draw, s0 = TerrainX.stats.standIn | 0;
    R.draw = function () { const r = draw.apply(this, arguments); if (!at && Screens.current === 'playing') at = { standIn: (TerrainX.stats.standIn | 0) - s0 }; return r; };
    Screens.enterGame();
    const t0 = performance.now(); while (!at && performance.now() - t0 < 10000) await sleep(20);
    R.draw = draw;
    return { settled, calls, asks, standIn: at ? at.standIn : -1, from: Math.round(Math.abs(far - Bld.cx(tc))) };
  });
  ck('andNothingIsPrefetchedBehindThePauseMenu', pz.settled && pz.calls === 0 && pz.standIn === 0,
    `${pz.calls} prefetch calls through a 10 s pause ${pz.from} tiles from the hall (${pz.asks} chunk requests, schedule()'s own); ` +
    `${pz.standIn} stand-in chunks on the first frame back${pz.settled ? '' : ' (the view never finished before the pause)'}`);
  ck('thePrefetchThrewNothing', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await ctx.close();
}
/* …a CONTINUE waits behind its plaque on the title: the same, there */
{
  const { p, ctx } = await page('');
  const r = await p.evaluate(async () => {
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(25); return f(); };
    Screens._demo = false; G.newGame('pf-continue', 'moderate', 'medium', undefined, 'green'); Cards.pick(0);
    const json = G.saveJSON();
    // the title draws the loaded world now and then behind the plaque; here those
    // draws paint nothing, so any ground that arrives was the prefetch's asking
    let inPf = false;
    const draw = R.draw; let draws = 0; R.draw = function () { if (inPf) draws++; };
    let pf = 0; const f = TerrainX.prefetch;
    if (f) TerrainX.prefetch = function () { pf++; inPf = true; try { return f.apply(this, arguments); } finally { inPf = false; } };
    // the load, then the plaque held up by one request still counted
    R.deferBake = true; try { G.loadJSON(json); } finally { R.deferBake = false; }
    const release = Assets._hold(false);
    Screens.GAME_ART_FLOOR_MS = 600000;   // the plaque stands until release(), however slow the machine
    Screens.enterGame();
    await until(() => TerrainX.ready || !TerrainX.on, 60000);
    // the plaque stands until the view behind it is all in (or a minute: a slow worker, never an absent one)
    const view = TerrainX.viewChunks(0).map(([a, b]) => a + ',' + b);   // enterGame has set the zoom already
    await until(() => view.every(k => TerrainX.chunks.has(k)), 120000);
    const held = { chunks: TerrainX.chunks.size, pf, draws, entering: !!Screens._entering, current: Screens.current,
      view: view.length, recv: TerrainX.stats.recv | 0, pending: TerrainX.pending.size, workers: TerrainX.workers.length };
    let at = null;
    R.draw = function () {
      if (!at && Screens.current === 'playing') { const v = TerrainX.viewChunks(0); at = { view: v.length, have: v.filter(([a, b]) => TerrainX.chunks.has(a + ',' + b)).length }; }
      return draw.apply(this, arguments);
    };
    release();
    await until(() => at, 30000);
    return { held, first: at };
  });
  ck('aContinuesPlaqueAsksForItsGroundToo', r.held.entering && r.held.pf > 0 && r.held.chunks > 0 && r.held.draws === 0 && r.first && r.first.have === r.first.view,
    `behind the Continue plaque: ${r.held.chunks} chunks (view ${r.held.view}; ${r.held.recv} received, ${r.held.pending} in flight, ${r.held.workers} workers), ` +
    `${r.held.pf} prefetch calls, ${r.held.draws} draws; first frame ${r.first ? r.first.have + '/' + r.first.view : '?'}`);
  await ctx.close();
}
/* …and THE VILLAGE OPENS ON ITS OWN GROUND (operator, 2026-11-03): a WARM
   Continue — every picture in, the bake done — used to open at once on the
   flat stand-in and paint its ground in over the next seconds. The press now
   waits behind the plaque for the chunks under its view (no longer than
   Screens.GROUND_MAX_MS), so its first frame stands on real ground. The
   control lifts the cap to nothing and must see the stand-in, or the probe
   is not looking. */
{
  const { p, ctx } = await page('');
  const r = await p.evaluate(async () => {
    const sleep = ms => new Promise(res => setTimeout(res, ms));
    const until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(25); return f(); };
    await until(() => Assets.allArtReady && Assets.allArtReady(), 120000);
    Screens._demo = false; G.newGame('pf-warm', 'moderate', 'medium', undefined, 'green'); Cards.pick(0);
    const json = G.saveJSON(), draw = R.draw, out = {};
    const open = async (label) => {
      Screens.show('title');
      let at = null;
      R.draw = function () {
        if (!at && Screens.current === 'playing') { const v = TerrainX.viewChunks(0); at = { view: v.length, have: v.filter(([a, b]) => TerrainX.chunks.has(a + ',' + b)).length }; }
        return draw.apply(this, arguments);
      };
      G.loadJSON(json);
      // a WARM cache: every picture counts as in, so the only thing left to wait for is the ground
      const ar = Assets.artReady; Assets.artReady = () => true;
      const warm = !R._bakeDue && !R._bake;
      const t0 = performance.now(); let plaque;
      try { Screens.enterGame(); plaque = !!Screens._prepRun; await until(() => at, 60000); }
      finally { Assets.artReady = ar; R.draw = draw; }
      out[label] = { warm, plaque, ms: Math.round(performance.now() - t0), on: TerrainX.on, ...(at || { view: -1, have: -1 }) };
    };
    await open('waited');
    const mx = Screens.GROUND_MAX_MS, mn = Screens.GROUND_MIN_MS;
    Screens.GROUND_MAX_MS = 0; Screens.GROUND_MIN_MS = 0;
    try { await open('control'); } finally { Screens.GROUND_MAX_MS = mx; Screens.GROUND_MIN_MS = mn; }
    out.cap = mx;
    return out;
  });
  const w = r.waited, c = r.control;
  ck('aWarmContinueOpensOnItsOwnGround', w.warm && w.on && w.plaque && w.view > 0 && w.have === w.view && w.ms <= r.cap + 3000,
    `warm press: the plaque ${w.plaque ? 'held' : 'never showed'} ${w.ms} ms; first frame ${w.have}/${w.view} chunks real`);
  ck('andTheCapStillOpensTheWorld', c.warm && c.view > 0 && c.have < c.view,
    `cap lifted to nothing: first frame ${c.have}/${c.view} chunks real after ${c.ms} ms (the stand-in must show, or the probe is not looking)`);
  await ctx.close();
}
/* …and where V4 is not drawing, it asks for nothing at all */
for (const [name, q, setup] of [['theClassicLink', '?terrain=classic', null], ['theKillSwitch', '', 'v4off']]) {
  const { p, ctx } = await page(q);
  if (setup === 'v4off') await p.evaluate(() => { CFG.TERRAIN.V4 = false; });
  const w = await groundWaits(p);
  ck(name + 'PrefetchesNothing', w.on === false && w.prefetch === 0 && w.chunks === 0 && w.pending === 0,
    `V4 on: ${w.on}; ${w.prefetch} prefetch calls, ${w.chunks} chunks, ${w.pending} pending`);
  await ctx.close();
}
{
  const { p, ctx } = await page('');
  const d = await p.evaluate(async () => {
    let pf = 0; const f = TerrainX.prefetch; if (f) TerrainX.prefetch = function () { pf++; return f.apply(this, arguments); };
    await new Promise(res => setTimeout(res, 2500));
    return { demo: !!Screens._demo, current: Screens.current, on: TerrainX.on, pf, chunks: TerrainX.chunks.size, pending: TerrainX.pending.size };
  });
  ck('theTitlesDemoPrefetchesNothing', d.demo && d.current === 'title' && d.pf === 0 && d.chunks === 0 && d.pending === 0, JSON.stringify(d));
  await ctx.close();
}
/* ---- 13. THE CHUNKS MEET WITHOUT A SEAM (operator, build 191: "grid lines are appearing
   on the map… on mobile there are no lines… You should never see grid lines"). A chunk, and a
   tile of road, is drawn into a world rect whose edges fall between device pixels at most
   zooms; desktop Chrome's GPU canvas antialiases the edge of every image, so the pixel two
   neighbours share was covered twice at part strength and the ground under them showed
   through: a dark hairline every eight tiles. R.snapper puts every rect on whole device
   pixels. 13a measures the rects themselves (any browser); 13b the pixels, on a GPU-backed
   canvas, with the snap stood down as the control — the control must SEE the seam, or the
   pixel check is blind on this host and says so. ---- */
const seamWorld = async (p, z, dx, dy) => p.evaluate(async ([z, dx, dy]) => {
  G.newGame('bay31', 'moderate', 'medium'); Screens._demo = false; S.paused = true; Screens.show('playing');
  for (let i = 0; i < 400 && !TerrainX.ready; i++) await new Promise(r => setTimeout(r, 50));
  const tc = S.buildings.find(b => b.key === 'tc' && b.owner === 'P'), TL = CFG.TILE;
  // three tiles of road on open grass by the hall, so a road's joins are drawn too
  let rd = null;
  for (let r = 3; r < 9 && !rd; r++) for (let oy = -r; oy <= r && !rd; oy++) {
    const y = tc.y + oy, x = tc.x - r;
    if ([0, 1, 2].every(k => S.map.terrain[y * CFG.W + x + k] === T.GRASS && !Bld.at(x + k, y))) rd = { x, y };
  }
  if (rd) { S.map.roads = S.map.roads || {}; for (let k = 0; k < 3; k++) S.map.roads[rd.y * CFG.W + rd.x + k] = 1; Roads._n = -1; }
  R.cam.z = z;
  R.cam.x = Math.floor((tc.x * TL - R.viewW() / z / 2) / 256) * 256 + dx;
  R.cam.y = Math.floor((tc.y * TL - R.viewH() / z / 2) / 256) * 256 + dy;
  await TerrainX.whenIdle(30000);
  TerrainX.tOverride = 1;
  return { ready: TerrainX.ready, on: TerrainX.on, road: !!rd };
}, [z, dx, dy]);
/* the rects drawn by the ground's chunks and the road's tiles, in device pixels */
const seamRects = (p) => p.evaluate(() => {
  const out = { chunk: [], road: [] }; let who = null;
  // the chunks' own pictures (and the stand-in's): the water life drawn inside drawGround is one overlay, no mosaic
  const pics = new Set([TerrainX.thumb]); for (const c of TerrainX.chunks.values()) if (c && c.img) pics.add(c.img);
  const dg = TerrainX.drawGround, rdw = Roads.draw, di = CanvasRenderingContext2D.prototype.drawImage;
  TerrainX.drawGround = function () { who = 'chunk'; try { return dg.apply(this, arguments); } finally { who = null; } };
  Roads.draw = function () { who = 'road'; try { return rdw.apply(this, arguments); } finally { who = null; } };
  CanvasRenderingContext2D.prototype.drawImage = function (img) {
    if (who && this.canvas === R.cv && (arguments.length === 5 || arguments.length === 9)) {
      const a = Array.prototype.slice.call(arguments, arguments.length - 4), m = this.getTransform();
      // a road's tile is a TL-square; its decor (overlapping by design) is not a mosaic
      if ((who === 'chunk' && pics.has(img)) || (who === 'road' && a[2] === a[3] && Math.abs(a[2] - CFG.TILE) < 2))
        out[who].push([m.a * a[0] + m.e, m.d * a[1] + m.f, m.a * (a[0] + a[2]) + m.e, m.d * (a[1] + a[3]) + m.f]);
    }
    return di.apply(this, arguments);
  };
  try { R.draw(0); } finally { TerrainX.drawGround = dg; Roads.draw = rdw; CanvasRenderingContext2D.prototype.drawImage = di; }
  return out;
});
const seamVerdict = (rects) => {
  const frac = v => Math.abs(v - Math.round(v)), whole = rects.every(r => r.every(v => frac(v) < 1e-6));
  let joins = 0, gaps = 0;
  for (const A of rects) for (const B of rects) {
    if (A === B) continue;
    if (Math.abs(B[1] - A[1]) < 2 && Math.abs(B[0] - A[2]) < 2) { joins++; if (Math.abs(B[0] - A[2]) > 1e-6) gaps++; }
    if (Math.abs(B[0] - A[0]) < 2 && Math.abs(B[1] - A[3]) < 2) { joins++; if (Math.abs(B[1] - A[3]) > 1e-6) gaps++; }
  }
  const fracEdges = rects.reduce((n, r) => n + r.filter(v => frac(v) > 0.05).length, 0);
  return { n: rects.length, whole, joins, gaps, fracEdges };
};
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.25 });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html'));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  const w = await seamWorld(p, 1.98, 13.37, 7.71);
  const on = await seamRects(p);
  const snap = await p.evaluate(() => { const s = R.snapper; R.snapper = undefined; return !!s; });
  const off = await seamRects(p);
  await p.evaluate(() => { delete R.snapper; });
  const vc = seamVerdict(on.chunk), vr = seamVerdict(on.road), oc = seamVerdict(off.chunk), orr = seamVerdict(off.road);
  ck('theGroundsChunksLandOnWholeDevicePixels', w.on && w.ready && snap && vc.n >= 4 && vc.whole && vc.joins > 0 && vc.gaps === 0,
    `${vc.n} chunks at zoom 1.98 on a 1.25x screen: whole ${vc.whole}, ${vc.joins} joins, ${vc.gaps} apart`);
  ck('andARoadsTilesToo', w.road && vr.n >= 3 && vr.whole && vr.joins > 0 && vr.gaps === 0,
    `${vr.n} road tiles: whole ${vr.whole}, ${vr.joins} joins, ${vr.gaps} apart`);
  ck('andTheProbeSeesTheSplitEdgesWithoutTheSnap', oc.fracEdges > 0 && orr.fracEdges > 0 && !oc.whole,
    `snap stood down: ${oc.fracEdges} chunk edges and ${orr.fracEdges} road edges between device pixels`);
  ck('andNothingThrew', !p.errs.length, p.errs.join(' | ') || 'clean');
  await ctx.close();
}
{
  // a GPU-backed canvas, the desktop's: ANGLE over SwiftShader
  let g = null;
  try { g = await pw.chromium.launch({ args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas'] }); } catch (e) { g = null; }
  if (!g) ck('noSeamIsDrawnOnAGpuCanvas', true, 'no GPU-backed browser on this host: the rects (13a) hold');
  else {
    const ctx = await g.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('file://' + join(root, 'index.html'));
    await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
    // zoom 2.5: a chunk is 640 device px, so every seam sits half a pixel in
    await seamWorld(p, 2.5, 0.2, 0.2);
    const probe = () => p.evaluate(() => {
      R.draw(0);
      const cv = R.cv, gx = cv.getContext('2d'), W = cv.width, H = cv.height, z = R.cam.z * R.dpr, span = 256;
      const d = gx.getImageData(0, 0, W, H).data, L = (x, y) => { const i = (y * W + x) * 4; return d[i] + d[i + 1] + d[i + 2]; };
      const col = x => { let s = 0; for (let y = 70; y < H - 140; y++) s += L(x, y); return s; };
      const row = y => { let s = 0; for (let x = 0; x < W; x++) s += L(x, y); return s; };
      const dips = [];
      for (let c = Math.ceil(R.cam.x / span); (c * span - R.cam.x) * z < W - 3; c++) {
        const x = Math.floor((c * span - R.cam.x) * z); if (x < 3) continue;
        const r = col(x) / ((col(x - 2) + col(x + 2)) / 2); dips.push(['x' + x, +r.toFixed(3)]);
      }
      for (let c = Math.ceil(R.cam.y / span); (c * span - R.cam.y) * z < H - 3; c++) {
        const y = Math.floor((c * span - R.cam.y) * z); if (y < 3) continue;
        const r = row(y) / ((row(y - 2) + row(y + 2)) / 2); dips.push(['y' + y, +r.toFixed(3)]);
      }
      return dips;
    });
    const on = await probe();
    await p.evaluate(() => { R.snapper = undefined; });
    const off = await probe();
    const seen = d => d.filter(([, r]) => r < 0.96).length;
    if (!off.length || !seen(off)) ck('noSeamIsDrawnOnAGpuCanvas', on.length > 0 && !seen(on), `probe blind on this host (the control drew no seam: ${JSON.stringify(off)}); the rects (13a) hold`);
    else ck('noSeamIsDrawnOnAGpuCanvas', on.length > 0 && !seen(on), `snapped ${JSON.stringify(on)} against the control's ${JSON.stringify(off)} (a seam darkens its line by 4% or more)`);
    await ctx.close(); await g.close();
  }
}
await b.close();

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (fails.length) { console.log('\n' + fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('\nALL ' + Object.keys(res).length + ' CHECKS PASS');
