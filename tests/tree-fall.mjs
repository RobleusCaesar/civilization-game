/* THE STAND COMES DOWN — a wood that is felled falls over, on screen.

   The rules this file pins:

     IT FIRES WHERE A WOOD    The gather task's exhaustion branch and
     ACTUALLY LEAVES A TILE   Terraform.clear, and nowhere else — and BEFORE
                              the terrain flips, because the frames are cut
                              from the tile's own forest art and a moment
                              later there is no forest there to cut. Felling
                              anything else (a quarried hill, spent soil)
                              raises nothing.

     THE FRAMES ARE CUT FROM  R.fallSheet takes any canvas — so all eight
     THE TILE'S OWN ART       forest variants, the three densities, the rare
                              character tiles and a dropped-in
                              assets/terrain/forest.png all topple with no
                              art authored. R.forestSpriteAt is the ONE
                              answer to "which stand stands here", shared
                              with drawTile, or the stand that falls would
                              not be the stand that was standing.

     EVERY TREE GOES OVER     The transform is a SHEAR, not a rigid rotation:
     ABOUT ITS OWN FOOT       a source row keeps its x and only its HEIGHT is
                              projected, so every trunk stays where it was
                              rooted. Rotating the tile rigidly reads as a
                              square of forest spinning. Measured: the art's
                              bottom row must not move, and the top must
                              travel a tile sideways and end at the ground.

     IT GOES OVER AWAY FROM   The hand that felled it decides the direction;
     THE HAND                 with nobody standing there (a sapper's lane, a
                              tile spent off screen) the tile's own hash does.

     FOG-GATED AND CAPPED     Timber nobody can see is drawn for nobody, and
                              a sapper clearing a lane is a scene, not a
                              whiteout.

     NEVER IN A SAVE          R.treefalls is render state, the R.collapses
                              rule, cleared in R.onNewGame so a reused tile
                              cannot inherit another run's fall.

     THE RULES DO NOT MOVE    It is a picture. The tile is stumps in STATE the
                              instant it is spent — passability, the maker's
                              mark and the regrowth clock are all exactly as
                              they were before any of this.                 */

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
  const ck = (n, ok, info) => { res[n] = ok ? 'PASS' : 'FAIL ' + (info || ''); if (!ok) fails.push(n); };

  const stage = (seed) => {
    G.newGame(seed, 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    for (let dy = -7; dy <= 8; dy++) for (let dx = -7; dx <= 8; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y)) continue;
      const at = Bld.at(x, y);
      if (at && at.key !== 'tc') Bld.removeToRuin(at);
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      S.map.explored[MapGen.idx(x, y)] = 1;
    }
    Bld.rebuildBlock(); G.updateVisibility();
    R.treefalls = [];
    return tc;
  };
  const wood = (x, y, amt) => {
    S.map.terrain[MapGen.idx(x, y)] = T.FOREST;
    S.map.resAmount[MapGen.idx(x, y)] = amt == null ? 400 : amt;
  };

  // ============ 1. the real gather path fires it, once, before the flip ====
  {
    const tc = stage('fall-a');
    const fx = tc.x + 3, fy = tc.y;
    wood(fx, fy, 0.5);
    G.updateVisibility();
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    v.x = fx - 0.5; v.y = fy + 0.5; v.path = null;
    const ok = Units.assignGather(v, fx, fy);
    let seen = null; const orig = R.startTreeFall.bind(R);
    R.startTreeFall = (x, y, bx, by) => {
      // the art must still be THERE when the fall is cut from it
      seen = { x, y, bx, terr: S.map.terrain[MapGen.idx(x, y)] };
      return orig(x, y, bx, by);
    };
    for (let k = 0; k < 80 && !seen; k++) Units.update(0.05);
    R.startTreeFall = orig;
    ck('aFelledStandFalls', ok && !!seen && R.treefalls.length === 1,
      'ok ' + ok + ' seen ' + JSON.stringify(seen) + ' live ' + R.treefalls.length);
    ck('andItIsCutBeforeTheGroundChanges',
      !!seen && seen.terr === T.FOREST, seen && seen.terr);
    ck('theTileIsStumpsWhenTheDustSettles',
      S.map.terrain[MapGen.idx(fx, fy)] === T.STUMPS, S.map.terrain[MapGen.idx(fx, fy)]);
    ck('itGoesOverAwayFromTheHand',
      R.treefalls[0] && R.treefalls[0].right === true,
      'villager x ' + v.x + ' tile ' + fx + ' right ' + (R.treefalls[0] || {}).right);
  }

  // ---- …and from the other side it goes the other way ----
  {
    const tc = stage('fall-b');
    const fx = tc.x + 3, fy = tc.y;
    wood(fx, fy, 0.5);
    G.updateVisibility();
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    v.x = fx + 1.5; v.y = fy + 0.5; v.path = null;
    Units.assignGather(v, fx, fy);
    for (let k = 0; k < 80 && !R.treefalls.length; k++) Units.update(0.05);
    ck('aHandOnTheOtherSideDropsItTheOtherWay',
      R.treefalls.length === 1 && R.treefalls[0].right === false,
      JSON.stringify(R.treefalls.map(f => f.right)));
  }

  // ---- a sapper's cleared lane fells real trees too ----
  {
    const tc = stage('fall-c');
    const fx = tc.x + 2, fy = tc.y + 2;
    wood(fx, fy);
    G.updateVisibility();
    ck('aSappersLaneFellsThemToo',
      Terraform.clear(fx, fy) && R.treefalls.length === 1, 'live ' + R.treefalls.length);
    ck('andTheGroundIsGrassBehindIt',
      S.map.terrain[MapGen.idx(fx, fy)] === T.GRASS, '');
    // …but clearing a hill or a field raises nothing: only a WOOD falls
    R.treefalls = [];
    S.map.terrain[MapGen.idx(fx + 1, fy)] = T.HILLS;
    S.map.terrain[MapGen.idx(fx + 2, fy)] = T.FERTILE;
    Terraform.clear(fx + 1, fy); Terraform.clear(fx + 2, fy);
    ck('onlyAWoodFalls', R.treefalls.length === 0, 'live ' + R.treefalls.length);
  }

  // ============ 2. fog-gated, and capped ============
  {
    const tc = stage('fall-d');
    // a wood far away in the dark
    let dark = null;
    for (let x = 2; x < CFG.W - 2 && !dark; x++)
      for (let y = 2; y < CFG.H - 2; y++)
        if (!G.visibleAt(x, y) && MapGen.onBoard(x, y)) { dark = { x, y }; break; }
    wood(dark.x, dark.y);
    R.startTreeFall(dark.x, dark.y);
    ck('timberNobodyCanSeeIsNotDrawn', R.treefalls.length === 0, 'live ' + R.treefalls.length);

    // …and a lane of twenty is a scene, not a whiteout
    R.treefalls = [];
    const fx = tc.x - 3, fy = tc.y - 3;
    for (let k = 0; k < 24; k++) { wood(fx, fy); R.startTreeFall(fx, fy); }
    ck('aClearedLaneIsCapped', R.treefalls.length <= 12, 'live ' + R.treefalls.length);
  }

  // ============ 3. the frames are cut from the tile's own art ============
  {
    stage('fall-e');
    const sets = [Sprites.terrain[T.FOREST], Sprites.terrainMed[T.FOREST],
                  Sprites.terrainFull[T.FOREST], Sprites.terrainRare[T.FOREST]];
    let allOk = true, why = '';
    for (const set of sets) {
      const sh = R.fallSheet(set[0], true);
      if (!sh || sh.length !== R.TREEFALL.frames) { allOk = false; why = 'frames ' + (sh && sh.length); break; }
    }
    ck('everyStandInTheWoodTopples', allOk, why);
    ck('andTheSheetIsCachedPerArtwork',
      R.fallSheet(Sprites.terrain[T.FOREST][0], true) ===
      R.fallSheet(Sprites.terrain[T.FOREST][0], true), '');
    ck('butEachDirectionIsItsOwn',
      R.fallSheet(Sprites.terrain[T.FOREST][0], true) !==
      R.fallSheet(Sprites.terrain[T.FOREST][0], false), '');

    // forestSpriteAt is the SHARED answer: the stand that falls is the stand
    // that was standing (a lone tile takes the sparse set, a ringed one dense)
    const tc = Bld.tcOf('P');
    const lx = tc.x + 4, ly = tc.y + 4;
    wood(lx, ly);
    ck('aLoneTileTakesTheEdgeSet',
      Sprites.terrain[T.FOREST].indexOf(R.forestSpriteAt(lx, ly, S.map.terrain)) >= 0, '');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) wood(lx + dx, ly + dy);
    const core = R.forestSpriteAt(lx, ly, S.map.terrain);
    ck('aRingedTileTakesTheStraddlingSet',
      Sprites.terrainFull[T.FOREST].indexOf(core) >= 0 ||
      Sprites.terrainRare[T.FOREST].indexOf(core) >= 0, '');
  }

  // ============ 4. every tree goes over about ITS OWN foot ============
  {
    stage('fall-f');
    // a synthetic stand: one opaque column at each end of the tile, full height
    const src = document.createElement('canvas'); src.width = 32; src.height = 32;
    const sg = src.getContext('2d');
    sg.fillStyle = '#ffffff'; sg.fillRect(2, 0, 3, 32); sg.fillRect(27, 0, 3, 32);
    const sh = R.fallSheet(src, true);
    const PD = R.TREEFALL_PAD;
    const ox = 32 * PD.x, gy = 32 * PD.y + 32;
    const cols = (c, y) => {
      const d = c.getContext('2d').getImageData(0, Math.max(0, Math.round(y)), c.width, 1).data;
      const xs = [];
      for (let x = 0; x < c.width; x++) if (d[x * 4 + 3] > 40) xs.push(x);
      return xs;
    };
    /* THE ROOTS STAY PUT. Measured MID-SWING (a stand already lying flat has
       its whole crown along the ground row, which is exactly right and says
       nothing about the pivot). Under a shear both feet are still exactly
       where they were rooted; under a rigid rotation about one pivot the far
       post's foot would have travelled halfway across the tile. */
    const runs = (xs) => {
      const out = []; let a = null, b = null;
      for (const x of xs) { if (a === null) { a = b = x; } else if (x <= b + 2) b = x; else { out.push((a + b) / 2); a = b = x; } }
      if (a !== null) out.push((a + b) / 2);
      return out;
    };
    const f0 = runs(cols(sh[0], gy - 1)), fM = runs(cols(sh[5], gy - 1));
    ck('bothFeetAreStillTwoFeetMidSwing',
      f0.length === 2 && fM.length === 2, JSON.stringify([f0, fM]));
    ck('andNeitherHasLeftItsStump',
      f0.length === 2 && fM.length === 2 &&
      Math.abs(f0[0] - fM[0]) <= 3 && Math.abs(f0[1] - fM[1]) <= 3,
      JSON.stringify([f0, fM]));
    // the CROWN travels most of a tile sideways and finishes at the ground
    const inked = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let maxX = -1, maxY = -1, minY = 1e9;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 40) { if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (y < minY) minY = y; }
      return { maxX, maxY, minY };
    };
    const a0 = inked(sh[0]), aL = inked(sh[sh.length - 2]);
    ck('theCrownSweepsOutASideOfATile', aL.maxX - a0.maxX > 20,
      'from ' + a0.maxX + ' to ' + aL.maxX);
    ck('andComesToRestOnTheGround', aL.minY > a0.minY + 18,
      'top ' + a0.minY + ' -> ' + aL.minY);
    ck('itLeansTheOtherWayGoingLeft',
      inked(R.fallSheet(src, false)[sh.length - 2]).maxX < a0.maxX + 4, '');
  }

  // ============ 5. render state, never a save ============
  {
    const tc = stage('fall-g');
    const fx = tc.x + 2, fy = tc.y;
    wood(fx, fy);
    R.startTreeFall(fx, fy, fx - 1, fy);
    ck('aFallIsLive', R.treefalls.length === 1, '');
    ck('butNeverInTheSave', JSON.stringify(S).indexOf('treefall') < 0, '');
    R.onNewGame();
    ck('andANewRunInheritsNone', R.treefalls.length === 0 && R.horns.length === 0, '');
  }

  // ============ 6. it is a picture — the rules do not move ============
  {
    const tc = stage('fall-h');
    const fx = tc.x + 3, fy = tc.y;
    wood(fx, fy, 0.5);
    G.updateVisibility();
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    v.x = fx - 0.5; v.y = fy + 0.5; v.path = null;
    Units.assignGather(v, fx, fy);
    for (let k = 0; k < 80 && !R.treefalls.length; k++) Units.update(0.05);
    const i = MapGen.idx(fx, fy);
    ck('theGroundIsWalkableTheInstantItIsSpent',
      Path.passable(fx, fy, 'P'), '');
    ck('theMakersMarkIsStamped',
      S.map.workedBy && S.map.workedBy[i] === 'P', JSON.stringify(S.map.workedBy && S.map.workedBy[i]));
    ck('andTheRegrowthClockIsRunning',
      !!(S.map.decay && S.map.decay[i] > S.day),
      JSON.stringify(S.map.decay && S.map.decay[i]));
    // the fall itself changes nothing about the tile
    const before = S.map.terrain[i];
    R.startTreeFall(fx, fy, v.x, v.y);
    ck('andRaisingAFallWritesToNoMapArray', S.map.terrain[i] === before, '');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL TREE FALL CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
