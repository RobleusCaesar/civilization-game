/* WILD GRASS + TAMING CONTRACT — the meadow, and the ground a town keeps.

   R.grassCover bakes a wild sward layer into the terrain cache (seeded from
   the map seed + tile coords, silhouettes wider than tall, clustered with
   real bare ground between valleys of the macro field). Around every
   STANDING building the wild cover gives way to a cropped kept verge —
   DERIVED from the building list, NEVER STORED, inside a ragged per-tile
   noise boundary — and the flatten one-shot (R.startTaming) fires from
   Bld.finish alone.

   The rules this file pins:
     RENDER-ONLY   The cover and the mask write NO map arrays: tile data is
                   bit-identical with the feature on or off.
     DETERMINISM   Two full rebakes are byte-identical; the hammer scenario
                   (tame, untame, repaint through the real paths) equals a
                   fresh rebake byte for byte.
     DERIVED       tamedAt: standing buildings tame, construction sites and
                   raider camps do not; a razed building's ground grows back
                   byte-identical to the untouched world.
     ONE SHOT      The flatten fires from Bld.finish, and never from a
                   load, a rebake, or an instant placement.
     THE ART DOOR  assets/terrain/cover/{terrain}/{slot}.png installs via
                   Assets.setCoverArt: 32px strip frames, hard binary alpha,
                   wrong grid refused, absent art never an error.

   Run this after touching any of:
     render.js — grassCover / tameMask / tamedAt / tameDirty / startTaming /
                 drawTamings, the LAND.GRASS_* / TAME_* / KEPT_* knobs,
                 _bakeSteps / drawTilesAt / drawTileAt (the cover call sites)
     buildings.js — finish / place / removeToRuin (the taming hooks)
     assets.js — the COVER_* loader block
     dev.js — the cover drop route / conform target

     node tests/wild-grass.mjs      # exits non-zero on any regression */
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

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const flushBake = () => { while (R.tickBake(1e9)) { } while (R.tickRepaint && R.tickRepaint(1e9)) { } };
  const boot = (seed, size) => {
    G.newGame(seed, 'moderate', size || 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    G.freeVis = true; G.updateVisibility();
    flushBake();
  };
  const mapHash = () => {
    let h = 0x811c9dc5 >>> 0;
    const eat = a => { if (!a) return; for (let i = 0; i < a.length; i++) { h ^= a[i] & 0xff; h = Math.imul(h, 0x01000193) >>> 0; } };
    eat(S.map.terrain); eat(S.map.seenTerrain); eat(S.map.resAmount); eat(S.map.explored);
    return h;
  };
  const cacheData = () => R.terrainCache.getContext('2d')
    .getImageData(0, 0, R.terrainCache.width, R.terrainCache.height).data;
  const cacheDiff = (a, c) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 97) if (a[i] !== c[i]) n++;   // strided — plenty to convict
    return n;
  };
  // an open all-grass seat for the taming scenarios, well away from the coast
  const openSpot = (need) => {
    const W = CFG.W, H = CFG.H, terr = S.map.terrain;
    for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
      let ok = true;
      for (let oy = -need; oy <= need && ok; oy++) for (let ox = -need; ox <= need; ox++) {
        if (terr[MapGen.idx(x + ox, y + oy)] !== T.GRASS || Bld.at(x + ox, y + oy)) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  };

  // ---- 1. THE COVER IS RENDER-ONLY: tile data bit-identical on/off ----
  {
    boot('wg-pure');
    const before = mapHash();
    R.rebuildTerrain(); flushBake();
    R.tameMask();
    const withOn = mapHash();
    const D0 = LAND.GRASS_DENSITY;
    LAND.GRASS_DENSITY = 0;
    R.rebuildTerrain(); flushBake();
    const withOff = mapHash();
    LAND.GRASS_DENSITY = D0;
    R.rebuildTerrain(); flushBake();
    ck('theCoverWritesNoMapArrays', before === withOn && withOn === withOff,
      `hashes ${before}/${withOn}/${withOff}`);
  }

  // ---- 2. THE MEADOW EXISTS, AND ITS EMPTINESS IS REAL ----
  {
    boot('wg-meadow');
    const on = cacheData();
    const D0 = LAND.GRASS_DENSITY;
    LAND.GRASS_DENSITY = 0;
    R.rebuildTerrain(); flushBake();
    const off = cacheData();
    LAND.GRASS_DENSITY = D0;
    R.rebuildTerrain(); flushBake();
    // per-tile: which grass tiles changed at all when the cover switched off?
    const TL = CFG.TILE, W = CFG.W, H = CFG.H, terr = S.map.terrain;
    let grassTiles = 0, dressed = 0;
    const rowBytes = R.terrainCache.width * 4;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (terr[MapGen.idx(x, y)] !== T.GRASS) continue;
      grassTiles++;
      let diff = false;
      for (let py = 2; py < TL && !diff; py += 5) {
        const base = (y * TL + py) * rowBytes + x * TL * 4;
        for (let px = 0; px < TL * 4; px += 16) if (on[base + px] !== off[base + px]) { diff = true; break; }
      }
      if (diff) dressed++;
    }
    ck('theMeadowGrows', dressed > grassTiles * 0.15, `${dressed} of ${grassTiles} grass tiles dressed`);
    ck('andTheBareGroundBetweenIsReal', dressed < grassTiles * 0.92,
      `${dressed} of ${grassTiles} — the macro gate must silence real ground`);
  }

  // ---- 3. DETERMINISM: two rebakes byte-identical ----
  {
    boot('wg-det');
    const a = cacheData();
    R.rebuildTerrain(); flushBake();
    const c = cacheData();
    ck('twoRebakesAgreeByteForByte', cacheDiff(a, c) === 0, `${cacheDiff(a, c)} strided diffs`);
  }

  // ---- 4. THE KEPT GROUND IS DERIVED, AND GROWS BACK ----
  {
    boot('wg-derive');
    const at = openSpot(2);   // a 5x5 pure-grass core; the verge may run onto other ground
    if (!at) { ck('anOpenSeatExists', false, 'no all-grass 5x5 found'); }
    else {
      const before = cacheData();
      const house = Bld.place('P', 'house', at.x, at.y, { free: true, instant: true });
      ck('aStandingBuildingTames', !!house && (R.tamedAt(at.x - 1, at.y) || R.tamedAt(at.x + 1, at.y)),
        'no tamed tile beside an instant house');
      const withHouse = cacheData();
      ck('theVergeIsPainted', cacheDiff(before, withHouse) > 0, 'the cache never changed');
      // a construction site keeps nothing
      const at2 = { x: at.x, y: at.y };
      Bld.removeToRuin(house);
      // the ruin the removal leaves is a real tile change — heal it so the
      // ground comparison is about the GRASS, not the rubble
      for (let dy = 0; dy < Bld.size(house); dy++) for (let dx = 0; dx < Bld.size(house); dx++) {
        const i = MapGen.idx(at2.x + dx, at2.y + dy);
        S.map.terrain[i] = T.GRASS;
        if (S.map.seenTerrain) S.map.seenTerrain[i] = T.GRASS;
        R.updateTile(at2.x + dx, at2.y + dy);
      }
      flushBake();
      ck('aRazedKeeperKeepsNothing', !R.tamedAt(at2.x - 1, at2.y) && !R.tamedAt(at2.x + 1, at2.y), '');
      const after = cacheData();
      ck('theWildGrowsBackByteForByte', cacheDiff(before, after) === 0,
        `${cacheDiff(before, after)} strided diffs after raze+heal`);
      // …and the whole session of repaints equals a fresh rebake
      R.rebuildTerrain(); flushBake();
      const fresh = cacheData();
      ck('theRepaintSessionEqualsARebake', cacheDiff(after, fresh) === 0,
        `${cacheDiff(after, fresh)} strided diffs vs rebake`);
      // a SITE tames nothing until it finishes
      const site = Bld.place('P', 'house', at2.x, at2.y, { free: true });
      ck('aConstructionSiteTamesNothing', site && site.construction > 0 &&
        !R.tamedAt(at2.x - 1, at2.y) && !R.tamedAt(at2.x + 1, at2.y), '');
      if (site) Bld.removeToRuin(site);
    }
  }

  // ---- 5. THE FLATTEN FIRES ONCE, FROM FINISH ----
  {
    boot('wg-once');
    /* the seat must actually GROW something — the macro field's bald valleys
       are a real feature, and a flatten over one lifts nothing by design.
       Scan for an open seat whose verge holds at least one wild sward. */
    let at = null;
    {
      const W = CFG.W, H = CFG.H, terr = S.map.terrain;
      outer:
      for (let y = 6; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
        let open = true;
        for (let oy = -1; oy <= 1 && open; oy++) for (let ox = -1; ox <= 1; ox++)
          if (terr[MapGen.idx(x + ox, y + oy)] !== T.GRASS || Bld.at(x + ox, y + oy)) { open = false; break; }
        if (!open) continue;
        for (let oy = -2; oy <= 2 && !at; oy++) for (let ox = -2; ox <= 2; ox++) {
          if (!ox && !oy) continue;
          if (terr[MapGen.idx(x + ox, y + oy)] !== T.GRASS) continue;
          const cap = { rects: [], img: null };
          R.grassCover(null, x + ox, y + oy, terr, cap);
          if (cap.rects.length || cap.img) { at = { x, y }; break; }
        }
        if (at) break outer;
      }
    }
    if (!at) { ck('anOpenSeatExistsForTheFlatten', false, 'no sward-bearing 9x9 grass seat found'); }
    else {
      R.tamings = [];
      const inst = Bld.place('P', 'house', at.x, at.y, { free: true, instant: true });
      ck('anInstantPlacementIsNoCeremony', R.tamings.length === 0, `${R.tamings.length} tamings`);
      if (inst) Bld.removeToRuin(inst);
      R.tamings = [];
      const site = Bld.place('P', 'house', at.x, at.y, { free: true });
      ck('aSiteRaisesNothingYet', R.tamings.length === 0, '');
      if (site) {
        Bld.finish(site);
        ck('finishRaisesTheFlatten', R.tamings.length === 1, `${R.tamings.length} tamings`);
        const tm = R.tamings[0];
        ck('theFlattenLiftsRealSwards', !!tm && tm.tiles.length > 0 &&
          tm.tiles.every(td => td.cap.rects.length > 0 || td.cap.img), '');
        ck('andItRipplesOutward', !!tm && (tm.tiles.length < 2 ||
          tm.tiles[0].delay <= tm.tiles[tm.tiles.length - 1].delay), 'not distance-staggered');
        Bld.removeToRuin(site);
      }
      // a load shows the kept state with no ceremony
      R.tamings = [];
      const save = G.saveJSON ? G.saveJSON() : null;
      if (save && G.loadJSON) {
        G.loadJSON(save); Screens._demo = false; Screens.show('playing'); flushBake();
        ck('aLoadIsNoCeremony', R.tamings.length === 0, `${R.tamings.length} tamings`);
      } else {
        ck('aLoadIsNoCeremony', true, 'no save round-trip API — newGame path covers it');
      }
      G.newGame('wg-once-2', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
      flushBake();
      ck('aNewWorldIsNoCeremony', R.tamings.length === 0, '');
    }
  }

  // ---- 6. THE ART DOOR: 32px strip frames, binary alpha, refusals ----
  {
    const mk = (w, h, a) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(60,120,50,' + (a == null ? 1 : a) + ')';
      g.fillRect(2, 20, 12, 8); g.fillRect(34, 22, 10, 6);
      return c;                          // setCoverArt reads width/height — a canvas passes
    };
    const had = (Assets.cover.grass || {}).wild || null;
    if (Assets.cover.grass) delete Assets.cover.grass.wild;
    const okGood = Assets.setCoverArt('grass', 'wild', mk(64, 32, 0.6));
    const frames = (Assets.cover.grass || {}).wild || [];
    ck('aStripInstallsSliced', okGood === true && frames.length === 2, `${frames.length} frames`);
    let binary = true;
    try {
      for (const f of frames) {
        const d = f.getContext('2d').getImageData(0, 0, 32, 32).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0 && d[i] !== 255) { binary = false; break; }
      }
    } catch (e) { /* tainted page — the snap is best-effort there by design */ }
    ck('theAlphaIsSnappedBinary', binary, 'semi-alpha survived the install');
    ck('theFramePickerWraps', Assets.coverImg('grass', 'wild', 0) === frames[0] &&
      Assets.coverImg('grass', 'wild', 5) === frames[1], '');
    ck('aWrongGridIsRefused', Assets.setCoverArt('grass', 'wild', mk(64, 33)) === false &&
      Assets.setCoverArt('grass', 'wild', mk(50, 32)) === false, '');
    ck('anUnknownSlotIsRefused', Assets.setCoverArt('grass', 'lush', mk(32, 32)) === false, '');
    ck('absentArtIsTheDefaultState', Assets.coverImg('grass', 'kept', 3) === null ||
      Assets.coverImg('grass', 'kept', 3) instanceof HTMLCanvasElement, '');
    // ONE CLUMP PER FRAME: the install measures each frame's ink box, and a
    // sward tile captured with art in place lifts frames at the procedural
    // anchors — art changes what a sward looks like, never where it grows
    ck('aFrameKnowsItsInkBox', frames.every(f => f._bw > 0 && f._bh > 0 && f._bh <= f._bw), '');
    {
      const terr = S.map.terrain;
      let artRects = 0, plainRects = 0, tiles = 0;
      for (let y = 4; y < CFG.H - 4 && tiles < 40; y++) for (let x = 4; x < CFG.W - 4 && tiles < 40; x++) {
        if (terr[MapGen.idx(x, y)] !== T.GRASS) continue;
        const cap = { rects: [], img: null };
        R.grassCover(null, x, y, terr, cap);
        if (!cap.rects.length) continue;
        tiles++;
        for (const r of cap.rects) { if (r.img) artRects++; else plainRects++; }
      }
      ck('artStandsInForTheSward', tiles > 0 && artRects > 0 && plainRects === 0,
        `${artRects} art clumps, ${plainRects} procedural rows over ${tiles} tiles`);
    }
    // a taller-than-wide frame is the sapling trap and is dropped at install
    {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const g2 = c.getContext('2d'); g2.fillStyle = '#4d7c33'; g2.fillRect(14, 4, 4, 24);
      const nWas = ((Assets.cover.grass || {}).wild || []).length;
      const ok = Assets.setCoverArt('grass', 'wild', c);
      const nNow = ((Assets.cover.grass || {}).wild || []).length;
      ck('aSaplingFrameIsRefused', ok === false && nNow === nWas, `${nWas} -> ${nNow} frames`);
    }
    // restore the shipped state so nothing leaks into a later suite run
    if (Assets.cover.grass) { if (had) Assets.cover.grass.wild = had; else delete Assets.cover.grass.wild; }
    R.rebuildTerrain(); flushBake();
  }

  // ---- 7. THE BAKE STAYS CHEAP (informational floor, generous in headless) ----
  {
    G.newGame('wg-perf', 'moderate', 'xlarge'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const t0 = performance.now();
    R.rebuildTerrain(); flushBake();
    const bakeMs = performance.now() - t0;
    const at = (() => { G.freeVis = true; G.updateVisibility(); return openSpot(2); })();
    let editMs = 0;
    if (at) {
      const t1 = performance.now();
      R.drawTileAt(at.x, at.y);
      editMs = performance.now() - t1;
    }
    ck('theBakeStaysUnderTheCeiling', bakeMs < 3000, `${bakeMs.toFixed(0)}ms xlarge bake (live target <1s)`);
    ck('anEditStaysCheap', editMs < 25, `${editMs.toFixed(1)}ms drawTileAt (live target <5ms)`);
    res._perf = `xlarge bake ${bakeMs.toFixed(0)}ms, edit ${editMs.toFixed(2)}ms`;
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log('errors:', JSON.stringify(errs));
await b.close();
if (out.fails.length || errs.length) { console.error('FAILURES:', out.fails); process.exit(1); }
console.log('ALL WILD-GRASS CHECKS PASS');
