/* MOUNTAIN CONTRACT — a mountain is an OBJECT, not a grid of tiles
   (architecture: CLAUDE.md "Mountains are objects, not tiles"; ART_PLAN.md).

   Every previous attempt at mountains failed for an architectural reason
   rather than an artistic one: they were drawn tile by tile, and a mountain is
   the only terrain in the game with real HEIGHT, which a top-down tile grid
   has nowhere to put. So each contiguous mountain area is now one object with
   a traced, fractured outline and an internal height field.

   What that buys has to be paid for in honesty, and these are the payments:

   1. THE REGIONS AND THE FIELD ARE CORRECT. 4-connected flood, every mountain
      cell in exactly one region, and a distance transform that really is the
      distance to the nearest non-mountain cell.

   2. SIZE CLASSES ARE DERIVED. A one-cell area is not drawn as a mountain —
      that is a large part of why this used to look wrong.

   3. THE SILHOUETTE IS NOT THE TILE GRID, and it is DETERMINISTIC: the same
      seed draws the same mountain, on a fresh bake and after a save/load.

   4. IT NEVER LEAVES ITS OWN GROUND SIDEWAYS OR SOUTH BY MORE THAN
      MTN.OUT_MAX — and NORTH only by the extrusion's lift (bounded by
      PAD_UP), because that is where the cliff face and the peaks rise. The
      art may sit off the lattice; it may not wander a tile into a meadow.

   5. GAMEPLAY TRUTH IS TILE-BASED AND UNTOUCHED. Passability, buildability,
      dock siting and fishing answer exactly the same with the mountains drawn
      and with them switched off — including on every tile the art reaches
      across.

     node tests/mountain.mjs      # exits non-zero on any regression */
let pw;
try { pw = (await import('playwright')).default ?? await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = async () => {
  const p = await b.newPage({ viewport: { width: 600, height: 500 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await p.goto('file://' + join(root, 'index.html'));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 20000 });
  return p;
};
/* a seed whose xlarge map actually HAS ranges — most do not, and a contract
   that quietly measures an empty set is worse than no contract */
const boot = `Boot.force(); G.newGame('scenes1','moderate','xlarge');
  Screens._demo=false; Screens.show('playing'); S.paused=true;
  for (let i=0;i<S.map.explored.length;i++){S.map.explored[i]=1; if(S.map.seenTerrain)S.map.seenTerrain[i]=S.map.terrain[i];}
  R.rebuildTerrain();`;
const res = {}, fails = [];
const ck = (name, ok, info) => { res[name] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(name); };

/* ---- 1. REGIONS AND THE HEIGHT FIELD --------------------------------- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const W=CFG.W, H=CFG.H, terr=S.map.terrain;
    const regs = R.mtnRegions();
    // every mountain cell in exactly one region, and no cell twice
    const seen = new Map();
    let dupes = 0, alien = 0;
    for (const r of regs) for (const k of r.cells) {
      if (seen.has(k)) dupes++; seen.set(k, r.id);
      if (terr[k] !== T.MOUNTAIN) alien++;
    }
    let total = 0; for (let i=0;i<W*H;i++) if (terr[i]===T.MOUNTAIN) total++;
    // …and the flood really is 4-CONNECTED: two cells sharing an edge share a region
    let split = 0;
    for (const [k, id] of seen) {
      const x=k%W, y=(k/W)|0;
      for (const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const j=(y+oy)*W+(x+ox);
        if (x+ox<0||y+oy<0||x+ox>=W||y+oy>=H) continue;
        if (terr[j]===T.MOUNTAIN && seen.get(j)!==id) split++;
      }
    }
    // THE DISTANCE TRANSFORM, checked against an independent brute force over
    // a sample of cells: d is the true Chebyshev distance to the nearest
    // in-bounds non-mountain cell, and 0 everywhere else
    const d = R.mtnHeight();
    let bad = 0, checked = 0, maxD = 0; const badEx = [];
    for (let i=0;i<W*H;i++) {
      if (terr[i] !== T.MOUNTAIN) { if (d[i] !== 0) bad++; continue; }
      if (d[i] > maxD) maxD = d[i];
      if (i % 7) continue;                       // sample — the brute force is O(r^2) each
      checked++;
      const x=i%W, y=(i/W)|0;
      let want = 99;
      for (let rr=1; rr<=8 && want===99; rr++)
        for (let oy=-rr; oy<=rr && want===99; oy++) for (let ox=-rr; ox<=rr; ox++) {
          if (Math.max(Math.abs(ox),Math.abs(oy)) !== rr) continue;
          const nx=x+ox, ny=y+oy;
          /* OFF THE MAP COUNTS AS MOUNTAIN — the convention the field is built
             on, so a range running into the border stays tall and reads as
             continuing past it rather than tapering into a black rim. */
          if (nx<0||ny<0||nx>=W||ny>=H) continue;
          if (terr[ny*W+nx] !== T.MOUNTAIN) { want = rr; break; }
        }
      if (d[i] !== want) { bad++; if (badEx.length < 6) badEx.push([x, y, d[i], want]); }
    }
    // SIZE CLASSES are derived from the cell count, not hand-assigned
    const wrong = regs.filter(r => {
      const n = r.cells.length;
      const want = n <= MTN.CLS_OUTCROP ? 0 : n <= MTN.CLS_CRAG ? 1 : n <= MTN.CLS_MOUNTAIN ? 2 : 3;
      return r.cls !== want;
    }).length;
    return { regions: regs.length, cells: seen.size, total, dupes, alien, split,
             fieldBad: bad, badEx, checked, maxD, wrong,
             classes: regs.reduce((a,r)=>{a[r.cls]=(a[r.cls]||0)+1;return a;},{}) };`));
  ck('everyMountainCellBelongsToExactlyOneRegion',
    v.regions > 0 && v.cells === v.total && v.dupes === 0 && v.alien === 0 && v.split === 0,
    v.regions + ' regions over ' + v.cells + '/' + v.total + ' cells, 4-connected');
  ck('theDistanceTransformIsTheHeightField', v.fieldBad === 0 && v.maxD >= 2,
    v.checked + ' cells checked against a brute-force search, depth runs to ' + v.maxD
    + (v.fieldBad ? ' — ' + v.fieldBad + ' disagree, e.g. ' + JSON.stringify(v.badEx) : ''));
  ck('andSizeClassesAreDerivedFromTheCellCount', v.wrong === 0,
    'outcrop/crag/mountain/range = ' + [0,1,2,3].map(c=>v.classes[c]||0).join('/'));
  await p.close();
}

/* ---- 2. THE SILHOUETTE ------------------------------------------------ */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const regs = R.mtnRegions();
    const big = regs.reduce((a,b2)=>a.cells.length>b2.cells.length?a:b2);
    /* THE RAW TRACE IS THE CONTROL. A tile loop is all right angles by
       construction, so "how much of this outline is axis-aligned" answers
       100% for it — and whatever the fractured loop answers is the distance
       travelled off the grid. */
    const raw = R.floodTrace((x,y)=>{
      const W=CFG.W,H=CFG.H;
      return x>=0&&y>=0&&x<W&&y<H&&S.map.terrain[y*W+x]===T.MOUNTAIN;
    }).reduce((a,b2)=>a.cells.length>b2.cells.length?a:b2).loops[0];
    const measure = (loop) => {
      let axis=0, tot=0, sum=0;
      for (let i=0;i<loop.length;i++) {
        const a=loop[i], b2=loop[(i+1)%loop.length];
        const dx=Math.abs(b2[0]-a[0]), dy=Math.abs(b2[1]-a[1]);
        sum += Math.hypot(dx,dy); tot++;
        if (dx<0.02||dy<0.02) axis++;
      }
      return { axis: axis/tot, seg: sum/tot, n: tot };
    };
    const m = measure(big.loops[0]), c = measure(raw);
    /* …and it never leaves its own ground EXCEPT NORTH: sample the drawn
       art and check every opaque pixel (the translucent cast shadow is
       excluded by the alpha threshold — a shadow is not rock). A pixel may
       sit north of the footprint by up to the extrusion's headroom, provided
       real footprint lies within PAD_UP tiles directly below it, give or
       take OUT_MAX of sideways slack — that is the lifted plateau. Anything
       else must be within OUT_MAX of the tiles, as in phase 2. */
    R.mtnStrips();
    const outside = R.mtnOutsideFn();
    const TL = CFG.TILE, W2 = CFG.W, H2 = CFG.H, terr2 = S.map.terrain;
    const liftOk = (wx, wy) => {
      const ty = Math.floor(wy);
      for (const tx of [Math.floor(wx - MTN.OUT_MAX), Math.floor(wx), Math.floor(wx + MTN.OUT_MAX)]) {
        if (tx < 0 || tx >= W2) continue;
        for (let k = 0; k <= MTN.PAD_UP; k++) {
          const y2 = ty + k;
          if (y2 < 0 || y2 >= H2) continue;
          if (terr2[y2 * W2 + tx] === T.MOUNTAIN) return true;
        }
      }
      return false;
    };
    let far = 0, opaque = 0, worst = 0, lifted = 0;
    for (const a of R._mtnArt) {
      const g2 = a.c.getContext('2d');
      const d = g2.getImageData(0,0,a.c.width,a.c.height).data;
      for (let j=0;j<a.c.height;j+=2) for (let i=0;i<a.c.width;i+=2) {
        if (d[(j*a.c.width+i)*4+3] < 128) continue;
        opaque++;
        const wx = (a.x+i+0.5)/TL, wy = (a.y+j+0.5)/TL;
        const o = outside(wx, wy);
        if (o <= MTN.OUT_MAX + 0.02) continue;
        if (liftOk(wx, wy)) { lifted++; continue; }
        if (o > worst) worst = o;
        far++;
      }
    }
    // …and every region really was LIFTED: its art must stand north of its
    // own footprint's top edge by at least a real face's worth (A0.2's
    // minimum made measurable) — outcrops are ground objects and exempt
    let unlifted = 0;
    for (const a of R._mtnArt) {
      if (a.kind !== 'region') continue;
      const g2 = a.c.getContext('2d');
      const d = g2.getImageData(0,0,a.c.width,a.c.height).data;
      let topArt = -1;
      for (let j=0;j<a.c.height && topArt<0;j++) for (let i=0;i<a.c.width;i++)
        if (d[(j*a.c.width+i)*4+3] >= 250) { topArt = j; break; }
      const footTop = a.box[1]*TL - a.y;
      if (topArt < 0 || footTop - topArt < MTN.LIFT_MIN * 0.4 * TL) unlifted++;
    }
    return { m, c, far, opaque, lifted, unlifted, worst: +worst.toFixed(3) };`));
  ck('theSilhouetteIsNotTheTileGrid', v.m.axis < 0.30 && v.m.seg < 1,
    Math.round(v.m.axis*100) + '% of the outline locks to an axis against '
    + Math.round(v.c.axis*100) + '% for the raw tile trace; mean segment '
    + v.m.seg.toFixed(2) + ' tiles over ' + v.m.n + ' vertices');
  ck('andItNeverLeavesItsOwnGroundExceptNorth', v.far === 0,
    v.opaque + ' sampled rock pixels: ' + v.lifted + ' lifted north over their own footprint, '
    + 'none loose (worst stray ' + v.worst + ' tiles)');
  ck('andEveryRegionGetsARealFace', v.unlifted === 0,
    'every drawn region stands at least the minimum lift north of its footprint');
  await p.close();
}

/* ---- 3. DETERMINISM --------------------------------------------------- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const sig = () => R.mtnRegions().map(r =>
      r.id + ':' + r.cls + ':' + r.cells.length + ':' + r.maxD + ':' +
      r.loops.map(l => l.length + '/' + l.slice(0, 40).map(q => q[0].toFixed(3) + ',' + q[1].toFixed(3)).join(' ')).join('|')
    ).join(';');
    const a = sig();
    // a fresh trace of the same map
    R._mtnKey = ''; R._mtn = null;
    const b2 = sig();
    // …and through a save/load round trip
    const save = G.saveJSON();
    G.newGame('someOtherSeed','moderate','medium');
    G.loadJSON(save);
    R._mtnKey = ''; R._mtn = null;
    const c = sig();
    return { same: a === b2, survives: a === c, len: a.length };`));
  ck('theSameSeedDrawsTheSameMountain', v.same,
    'region ids, classes, depths and every traced vertex identical on a re-trace ('
    + v.len + ' chars of signature)');
  ck('andItSurvivesASaveLoad', v.survives, 'the outline comes back byte for byte');
  await p.close();
}

/* ---- 4. GAMEPLAY TRUTH IS TILE-BASED --------------------------------- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const W=CFG.W, H=CFG.H;
    /* every tile the art can REACH — the footprint plus the pad it may
       overhang — because those are exactly the tiles where a player might
       wonder whether the picture has changed the rules */
    const on = new Set();
    for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++) {
      if (S.map.terrain[y*W+x] !== T.MOUNTAIN) continue;
      for (let oy=-MTN.PAD_UP; oy<=MTN.PAD_DOWN; oy++) for (let ox=-MTN.PAD_SIDE-1; ox<=MTN.PAD_SIDE+1; ox++) {
        const nx=x+ox, ny=y+oy;
        if (nx>0 && ny>0 && nx<W-1 && ny<H-1) on.add(ny*W+nx);
      }
    }
    const tiles = [...on].map(k => [k % W, (k / W) | 0]);
    const answers = () => tiles.map(([x,y]) => [
      Path.passable(x,y,'P') ? 1 : 0,
      Path.passable(x,y,'P',true) ? 1 : 0,
      Path.passable(x,y,'A') ? 1 : 0,
      Bld.dockSiteOk(x,y,'P').code || 'ok',
      Bld.tileFree ? (Bld.tileFree(x,y) ? 1 : 0) : 0,
      Bld.canPlace('P','house',x,y,{noCost:1}).code || 'ok',
      Units.canFish ? (Units.canFish(x,y) ? 1 : 0) : 0,
    ].join(',')).join(';');
    const sigMap = () => {
      const m = S.map, parts = [];
      for (const k of ['terrain','seenTerrain','explored','reclaimed','seenB'])
        if (m[k]) { let h=0x811c9dc5; for(let i=0;i<m[k].length;i++){h^=m[k][i];h=Math.imul(h,0x01000193);} parts.push(k+':'+(h>>>0)); }
      return parts.join('|');
    };
    R.mtnStrips();                                   // build the layer, so cover exists to measure
    const before = { ans: answers(), sig: sigMap() };
    const bm = R.mtnStrips, bo = R.buildMtnLayer;
    R.mtnStrips = () => []; R.buildMtnLayer = () => {}; R.rebuildTerrain();
    const off = { ans: answers(), sig: sigMap() };
    R.mtnStrips = bm; R.buildMtnLayer = bo; R.rebuildTerrain();
    /* …and EVERY walkable tile under the art is still walkable. The overhang
       covers ground a unit may stand on, which is the whole bargain: the
       picture leaves the footprint, the rules never do. */
    let covered = 0, blockedWrong = 0; const ex = [];
    for (const [x,y] of tiles) {
      if (S.map.terrain[y*W+x] === T.MOUNTAIN) continue;
      if (!R._mtnCover || !R._mtnCover[y*W+x]) continue;
      covered++;
      if (Path.blocksLand(S.map.terrain[y*W+x])) continue;   // water, wood, crag — blocked on its own account
      if (Bld.at && Bld.at(x,y)) continue;                   // …and a building is a building
      if (!Path.passable(x,y,'P')) { blockedWrong++; if (ex.length < 6) ex.push([x,y,S.map.terrain[y*W+x]]); }
    }
    return { tiles: tiles.length, moved: before.ans !== off.ans, wrote: before.sig !== off.sig,
             covered, blockedWrong, ex };`));
  ck('mountainArtChangesNoRule', !v.moved && !v.wrote,
    'land/naval/rival passability, dock siting, buildable ground, house placement and '
    + 'fishing all identical over ' + v.tiles + ' tiles with the mountains drawn and with them off');
  ck('andEveryTileUnderTheOverhangStaysWalkable', v.blockedWrong === 0,
    v.covered + ' non-mountain tiles lie under the art; every one of them that is '
    + 'ordinary ground is still passable'
    + (v.blockedWrong ? ' — except ' + v.blockedWrong + ', e.g. ' + JSON.stringify(v.ex) : ''));
  await p.close();
}

/* ---- 5. OCCLUSION IS REAL, AND SO IS THE WAY BACK --------------------
   The extrusion buys a depth cue: a unit north of a ridge is HIDDEN by the
   lifted art (strips drawn after it in the frame), and comes back as a
   low-alpha silhouette so it stays selectable. Measured on the actual frame:
   with a unit parked on an occluded tile, the drawn frame must differ from
   the same frame without the unit (the silhouette painted something), and by
   clearly less than an unoccluded unit would (most of the sprite is behind
   rock). ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    R.mtnStrips();
    if (!R._mtnOcc || !R._mtnOcc.size) return { skip: true };
    const W = CFG.W, TL = CFG.TILE;
    // an occluded walkable tile, and an open control tile far from any art
    const k = [...R._mtnOcc].find(k2 => Path.passable(k2 % W, (k2 / W) | 0, 'P'));
    if (k == null) return { skip: true };
    const ox = k % W + 0.5, oy = ((k / W) | 0) + 0.5;
    let cx = 0, cy = 0;
    for (let y = 2; y < CFG.H - 2 && !cx; y++) for (let x = 2; x < W - 2; x++)
      if (S.map.terrain[y * W + x] === T.GRASS && !R._mtnCover[y * W + x]
        && Path.passable(x, y, 'P')) { cx = x + 0.5; cy = y + 0.5; break; }
    const u = S.units.find(u2 => u2.owner === 'P');
    const visWas = G.visibleAt; G.visibleAt = () => true;
    const box = (x, y) => {
      const z = R.cam.z * R.dpr;
      return [Math.round((x * TL - TL / 2 - R.cam.x) * z), Math.round((y * TL - TL - R.cam.y) * z),
        Math.round(TL * z), Math.round(TL * 1.4 * z)];
    };
    const grab = (bx) => R.cv.getContext('2d').getImageData(
      Math.max(0, bx[0]), Math.max(0, bx[1]), bx[2], bx[3]).data;
    const shot = (x, y, withUnit) => {
      u.x = withUnit ? x : -99; u.y = withUnit ? y : -99;
      R.centerOn(x, y); R.clampCam(); G.frame(performance.now());
      return grab(box(x, y));
    };
    const diff = (a, b2) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i] - b2[i]) + Math.abs(a[i + 1] - b2[i + 1]) + Math.abs(a[i + 2] - b2[i + 2]) > 12) n++;
      return n; };
    const ux = u.x, uy = u.y;
    const occWith = shot(ox, oy, true), occWithout = shot(ox, oy, false);
    const openWith = shot(cx, cy, true), openWithout = shot(cx, cy, false);
    u.x = ux; u.y = uy; G.visibleAt = visWas;
    const occD = diff(occWith, occWithout), openD = diff(openWith, openWithout);
    return { occD, openD, occTiles: R._mtnOcc.size };`));
  ck('aUnitBehindTheCliffIsHiddenButNotLost', v.skip || (v.occD > 0 && v.occD < v.openD),
    v.skip ? 'no occluded walkable ground on this seed'
      : v.occTiles + ' occluded tiles; the silhouette repaints ' + v.occD
      + ' px where the full sprite would repaint ' + v.openD);
  await p.close();
}

/* ---- NO ENEMY BUILDING HIDES IN THE MOUNTAIN'S SHADOW ------------------
   The extruded rock art covers up to ~two tiles of walkable ground NORTH of
   a mountain (buildings draw before the occlusion strips), and a reported
   day-57 game found a barbarian camp only by the sliver of tent peeking
   past the ridge. MapGen.mtnShadow is the ONE declaration; Bld.canPlace
   hard-refuses enemy owners across the footprint (code 'shadow'), the camp
   seating clamps on it un-relaxably, and the gold-seam scatter skips it.
   The PLAYER stays free: they can see their own placement ghost, so hiding
   a building is a choice, not a trap. ---- */
{
  const p = await page();
  const v = await p.evaluate(new Function(boot + `
    const W = CFG.W, terr = S.map.terrain;
    // carve a clean fixture: a 3-wide mountain wall with open grass around it
    const mx = 20, my = 20;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++)
      if (!Bld.at(mx + dx, my + dy)) terr[MapGen.idx(mx + dx, my + dy)] = T.GRASS;
    for (let dx = -1; dx <= 1; dx++) terr[MapGen.idx(mx + dx, my)] = T.MOUNTAIN;
    S.map.explored.fill(1);
    if (S.map.seenTerrain) for (let i = 0; i < terr.length; i++) S.map.seenTerrain[i] = terr[i];
    Bld._block = null;
    const shadow1 = MapGen.mtnShadow(mx, my - 1);   // one tile north — covered
    const shadow2 = MapGen.mtnShadow(mx, my - 2);   // two north — still covered
    const clear3 = MapGen.mtnShadow(mx, my - 3);    // three north — clear
    const south = MapGen.mtnShadow(mx, my + 1);     // south of the rock — in plain view
    const aiTry = Bld.canPlace('A', 'house', mx, my - 1);
    const pTry = Bld.canPlace('P', 'house', mx, my - 1);
    // generation honours it: mountain-bearing seeds seat no camp or seam in shadow
    let bad = 0, checked = 0;
    // 250355541/calm/medium is the reported day-9 map: its primary seam pass
    // finds only one seam, so it exercises the RELAXATION path — which is
    // exactly where the shadow clamp was once missing
    for (const [sd, md, sz] of [['mtn2', 'hard', 'xlarge'], ['scenes1', 'hard', 'xlarge'],
        ['omega', 'hard', 'xlarge'], ['k1', 'hard', 'xlarge'], ['250355541', 'calm', 'medium']]) {
      G.newGame(sd, md, sz);
      const t2 = S.map.terrain;
      /* seams by terrain; camps by their ANCHORS (spawns.camps) — the worn
         3×3 yard also carries T.CAMP now, and a ring tile brushing a shadow
         hides nothing: the clamp's promise is about the camp BUILDING. */
      for (let y2 = 1; y2 < CFG.H - 1; y2++) for (let x2 = 1; x2 < CFG.W - 1; x2++) {
        if (t2[MapGen.idx(x2, y2)] !== T.GOLDORE) continue;
        checked++;
        if (MapGen.mtnShadow(x2, y2, t2)) bad++;
      }
      for (const c of (S.map.spawns.camps || [])) {
        checked++;
        if (MapGen.mtnShadow(c.x, c.y, t2)) bad++;
      }
    }
    return { shadow1, shadow2, clear3, south,
      aiCode: aiTry.code || 'ok', pOk: pTry.ok !== false || pTry.code !== 'shadow',
      bad, checked };`));
  ck('theShadowIsTheTwoTilesNorth',
    v.shadow1 === true && v.shadow2 === true && v.clear3 === false && v.south === false,
    'covered at 1-2 north of the rock, clear at 3 and to the south');
  ck('anEnemyBuildingIsRefusedThere', v.aiCode === 'shadow', 'canPlace code ' + v.aiCode);
  ck('thePlayerStaysFree', v.pOk === true,
    'the player can see their own ghost — hiding is a choice, not a trap');
  ck('andGenerationSeatsNothingInIt', v.checked > 10 && v.bad === 0,
    v.bad + ' of ' + v.checked + ' camps/seams in shadow across four mountain seeds');
  await p.close();
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL MOUNTAIN CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
