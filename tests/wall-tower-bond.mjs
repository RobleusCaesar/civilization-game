/* WALL ↔ TOWER BOND + FORTIFICATION MATERIALS CONTRACT

   TWO THINGS, both about how a castle reads.

   1. MATERIALS BY TIER. Every level-2 building tells the same story — stone
      below, timber above — and walls and towers now tell it too:
        L1  timber palisade / wattle tower        (mostly wood)
        L2  stone curtain + TIMBER WALL-WALK, and a tower with a coursed
            stone base under a timber upper storey  (about HALF AND HALF)
        L3  dressed stone, gold-crested            (mostly stone)
      L1 and L3 are deliberately unchanged; only L2 moved. The level-2 wall
      used to be plain stone (a finished castle two tiers early) and the
      level-2 tower nearly all timber (barely a change from L1).

   2. THE BOND. A tower raised IN a wall line joins it — corners, T-junctions
      and mid-run alike — so the curtain reads unbroken like a real castle's
      mural towers. A tower merely standing BEHIND or IN FRONT of a line must
      NOT grow a stub toward it. The rule (R.towerLinkMask): link toward a
      neighbouring wall/gate when the run continues on the tower's far side,
      or the tower sits mid-line, or that neighbour is a lone stub with no
      run of its own yet.

      The bond is about the LOOK. What a tower does to movement is a separate
      rule that now agrees with it: every building except the worker plots is
      solid (Bld.solid — tests/buildings-block.mjs), so a bonded tower really
      does seal the line, for every owner. The two rules are independent —
      the bond decides where stubs are drawn, Bld.solid decides who may walk
      — and this file pins both so neither silently drifts from the other.

   Run this after touching any of:
     sprites.js — wallPal / drawWallMask / the tower draw
     render.js — wallMaskAt / towerLinkMask / drawTowerBond / the building draw

     node tests/wall-tower-bond.mjs      # exits non-zero on any regression */
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
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  // warm brown = timber, neutral grey = masonry
  const mix = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let wood = 0, stone = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 96) continue;
      const R = d[i], G2 = d[i + 1], B = d[i + 2];
      n++;
      if (R - B > 26) wood++;
      else if (Math.abs(R - G2) < 22 && Math.abs(G2 - B) < 22) stone++;
    }
    return n ? { wood: wood / n, stone: stone / n } : { wood: 0, stone: 0 };
  };
  const pct = (m) => Math.round(m.wood * 100) + '% wood / ' + Math.round(m.stone * 100) + '% stone';

  // ---- 1. materials by tier ----
  {
    const w1 = mix(Sprites.wallMask[0][10]), w2 = mix(Sprites.wallMask[1][10]), w3 = mix(Sprites.wallMask[2][10]);
    const t1 = mix(Sprites.building.tower[0]), t2 = mix(Sprites.building.tower[1]), t3 = mix(Sprites.building.tower[2]);
    ck('wallL1StaysTimber', w1.wood > 0.85 && w1.stone < 0.1, pct(w1));
    ck('wallL2IsHalfAndHalf', w2.wood > 0.3 && w2.wood < 0.7 && w2.stone > 0.3 && w2.stone < 0.7, pct(w2));
    ck('wallL3StaysStone', w3.stone > 0.85 && w3.wood < 0.15, pct(w3));
    ck('towerL1StaysTimber', t1.wood > 0.6, pct(t1));
    ck('towerL2IsHalfAndHalf', t2.wood > 0.3 && t2.wood < 0.7 && t2.stone > 0.3 && t2.stone < 0.7, pct(t2));
    ck('towerL3StaysStone', t3.stone > 0.85 && t3.wood < 0.15, pct(t3));
    // the L2 pair now tell the SAME story — that was the point of the change
    ck('wallAndTowerAgreeAtL2', Math.abs(w2.wood - t2.wood) < 0.25,
      'wall ' + pct(w2) + ' vs tower ' + pct(t2));
    // every tier is a visible step, in both families
    ck('everyTierStepsInMaterial',
      w1.stone < w2.stone && w2.stone < w3.stone && t1.stone < t2.stone && t2.stone < t3.stone, '');
  }

  // ---- 2. the bond rule ----
  {
    G.newGame('bond1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    S.wallLevel = 2;
    const tc = Bld.tcOf('P'); tc.x = 2; tc.y = 2;
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; S.map.seenTerrain[i] = T.GRASS;
    }
    S.units = []; Bld._block = null;
    const put = (key, x, y, unfinished) => {
      const bb = Bld.place('P', key, x, y, { free: true });
      if (bb && !unfinished) Bld.finish(bb);
      return bb;
    };
    const N = 1, E = 2, SS = 4, W = 8;

    // (a) MID-RUN: wall wall [tower] wall wall  — bonds east and west
    put('wall', 10, 20); put('wall', 11, 20); put('wall', 13, 20); put('wall', 14, 20);
    const midT = put('tower', 12, 20);
    ck('bondsMidRun', R.towerLinkMask(12, 20).mask === (E | W), 'mask ' + R.towerLinkMask(12, 20).mask);

    // (b) CORNER: a west arm and a south arm meeting at the tower
    put('wall', 20, 30); put('wall', 21, 30);
    put('wall', 22, 31); put('wall', 22, 32);
    put('tower', 22, 30);
    ck('bondsAtCorner', R.towerLinkMask(22, 30).mask === (SS | W), 'mask ' + R.towerLinkMask(22, 30).mask);

    // (c) BEHIND THE LINE: an east-west run with a tower sitting off it —
    //     the tower must stay separate, and the wall must not reach for it
    put('wall', 30, 40); put('wall', 31, 40); put('wall', 32, 40);
    put('tower', 31, 39);
    ck('noBondOffTheLine', R.towerLinkMask(31, 39).mask === 0, 'mask ' + R.towerLinkMask(31, 39).mask);
    ck('wallIgnoresOffLineTower', !(R.wallMaskAt(31, 40) & N), 'wall grew no stub toward it');

    // (d) LONE STUB: the first section laid out from a tower still bonds
    put('wall', 15, 10);
    put('tower', 14, 10);
    ck('bondsToALoneStub', R.towerLinkMask(14, 10).mask === E, 'mask ' + R.towerLinkMask(14, 10).mask);

    // (e) the wall RECIPROCATES on an in-line tower
    ck('wallBondsBack',
      !!(R.wallMaskAt(11, 20) & E) && !!(R.wallMaskAt(13, 20) & W),
      'both neighbours reach the tower');

    // (f) an UNFINISHED tower bonds to nothing (its work-site art stands alone)
    put('wall', 5, 25); put('wall', 6, 25); put('wall', 8, 25); put('wall', 9, 25);
    const site = put('tower', 7, 25, true);
    ck('siteDoesNotBond',
      site.construction > 0 && R.towerLinkMask(7, 25).mask === (E | W) &&
      !(R.wallMaskAt(6, 25) & E),
      'walls wait for the tower to finish');
    Bld.finish(site);
    ck('finishedSiteThenBonds', !!(R.wallMaskAt(6, 25) & E), '');

    // ---- 3. the bond is DRAWN: the curtain's own art, under the tower ----
    const vis = G.visibleAt;
    G.visibleAt = () => true;
    R.centerOn(12, 20);
    const proto = CanvasRenderingContext2D.prototype, origDraw = proto.drawImage;
    const drawn = [];
    proto.drawImage = function (img) { drawn.push(img); return origDraw.apply(this, arguments); };
    try { R.draw(0.016); } finally { proto.drawImage = origDraw; G.visibleAt = vis; }
    ck('bondArtIsDrawn',
      drawn.includes(Sprites.wallMask[1][E | W]) && drawn.includes(Sprites.building.tower[midT.level - 1]),
      'the level-2 curtain stub and the tower both reached the canvas');

    // ---- 4. a bonded tower SEALS the line, for everyone (buildings-block) ----
    ck('bondedTowerSealsTheLine',
      Bld.blockAt(12, 20) === 4 &&
      !Path.passable(12, 20, 'P') && !Path.passable(12, 20, 'A') && !Path.passable(12, 20, 'R'),
      'the curtain is shut at the tower for every owner');
    // …but the LOOK and the BLOCKING stay independent rules: an off-line
    // tower blocks its own tile without ever drawing a stub
    ck('offLineTowerBlocksButDoesNotBond',
      Bld.blockAt(31, 39) === 4 && R.towerLinkMask(31, 39).mask === 0,
      'solid, yet visually separate');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WALL-TOWER-BOND CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
