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

   1b. THE GATEHOUSE. A gate faces the way its LINE runs — and the line is made
      of towers as well as walls, which is what a player's tower/gate/tower
      gatehouse is; terrain never votes on the axis.

      The two views are DIFFERENT DRAWINGS, because you are not standing in the
      same place. Across an east-west wall you look straight at the castle: twin
      crenellated towers, machicolations, the arch, the portcullis. Along a
      north-south wall you see the gatehouse's FLANK — the archway faces east
      and west, away from you, so there is no door to see; the curtain simply
      swells to the width of a tower. Transposing one into the other (which this
      file used to do) draws a gateway seen from a viewpoint that cannot exist.

   2b. A TOWER HAS TWO SELVES. Built onto a wall it is a MURAL TOWER — a
      thicker, taller piece of the curtain, same stone, no outline of its own
      and no door in its foot, the wall-walk running into its flanks. Alone in
      open ground it stays the free-standing Watchtower. R.bldSprite chooses.

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
     sprites.js — wallPal / drawWallMask / drawGate / the tower draw
     render.js — wallMaskAt / towerLinkMask / drawTowerBond / gateVerticalAt /
                 BANNER_AT / the building draw

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

  // ---- 1b. THE GATEHOUSE: it faces the way its line runs, both ways look
  //          built, and it steps through the same materials ----
  {
    const g1 = mix(Sprites.gateMask[0][0]), g2 = mix(Sprites.gateMask[1][0]), g3 = mix(Sprites.gateMask[2][0]);
    ck('gateL1StaysTimber', g1.wood > 0.6 && g1.stone < 0.2, pct(g1));
    ck('gateL2IsHalfAndHalf', g2.wood > 0.25 && g2.wood < 0.7 && g2.stone > 0.3, pct(g2));
    ck('gateL3StaysStone', g3.stone > 0.7 && g3.wood < 0.3, pct(g3));
    ck('gateStepsInMaterialToo', g1.stone < g2.stone && g2.stone < g3.stone, '');
    // NEITHER ORIENTATION IS THE POOR RELATION: the north-south gate used to be
    // a plain grey waist with no art in it at all. Both are now fully drawn, in
    // the same materials — and they are not the same image.
    for (let L = 0; L < 3; L++) {
      const h = Sprites.gateMask[L][0], v = Sprites.gateMask[L][1];
      const mh = mix(h), mv = mix(v);
      ck('bothGatesAreBuilt' + (L + 1),
        h.toDataURL() !== v.toDataURL() && Math.abs(mh.wood - mv.wood) < 0.12 && Math.abs(mh.stone - mv.stone) < 0.12,
        'L' + (L + 1) + ' east-west ' + pct(mh) + ' · north-south ' + pct(mv));
    }
    // and it tells the SAME half-and-half story as the curtain it stands in
    ck('gateAndWallAgreeAtL2', Math.abs(g2.wood - mix(Sprites.wallMask[1][10]).wood) < 0.25,
      'gate ' + pct(g2) + ' vs wall ' + pct(mix(Sprites.wallMask[1][10])));
    /* THE WAY THROUGH FACES EAST AND WEST. Looking along a north-south wall you
       see the gatehouse's FLANK: there is no doorway to see, and drawing one
       there — by TRANSPOSING the face, which this file did for one commit —
       puts a gateway at a viewpoint that cannot exist and reads as a door
       lying on its side. That transposition is the thing to guard, so measure
       it directly: the flank must be nothing like the face turned on its side.

       (This used to be measured as "the face's passage is DARK and the flank's
       is not", which only held while every tier was a castle with an open
       archway. The L1 palisade gate and the L2 stone archway both close their
       gateway with a TIMBER DOOR — no dark hole at all — so the old proxy
       failed on art that is perfectly correct. The rule it stood for is the
       one below.) */
    const transposed = (c) => {
      const n = c.width, src = c.getContext('2d').getImageData(0, 0, n, n).data;
      const t = document.createElement('canvas'); t.width = t.height = n;
      const tg = t.getContext('2d'), img = tg.createImageData(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const a = (y * n + x) * 4, b2 = (x * n + y) * 4;
        for (let k = 0; k < 4; k++) img.data[b2 + k] = src[a + k];
      }
      tg.putImageData(img, 0, 0);
      return t;
    };
    const differ = (a, b2) => {   // mean per-pixel difference, 0 = identical
      const n = a.width;
      const da = a.getContext('2d').getImageData(0, 0, n, n).data;
      const db = b2.getContext('2d').getImageData(0, 0, n, n).data;
      let sum = 0;
      for (let i = 0; i < da.length; i += 4)
        sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) +
               Math.abs(da[i + 2] - db[i + 2]) + Math.abs(da[i + 3] - db[i + 3]);
      return sum / (n * n * 4);
    };
    for (let L = 0; L < 3; L++) {
      const face = Sprites.gateMask[L][0], flank = Sprites.gateMask[L][1];
      const d = differ(flank, transposed(face));
      ck('theFlankIsNotTheFaceOnItsSide' + (L + 1), d > 20,
        'L' + (L + 1) + ' differs from the transposed face by ' + d.toFixed(1));
    }
    /* …and the tier that DOES stand open still reads that way: the level-3
       gatehouse's passage is a dark arch behind a portcullis, and its flank
       shows no such thing. */
    {
      const gateway = (c) => {
        const d = c.getContext('2d').getImageData(22, 30, 20, 24).data;
        let n = 0, dark = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 96) continue;
          n++;
          if (d[i] < 62 && d[i + 1] < 62 && d[i + 2] < 62) dark++;
        }
        return n ? dark / n : 0;
      };
      const f = gateway(Sprites.gateMask[2][0]), v = gateway(Sprites.gateMask[2][1]);
      ck('theThirdTierStandsOpen', f > 0.3 && v < 0.12,
        'L3 face ' + Math.round(f * 100) + '% shadow · flank ' + Math.round(v * 100) + '%');
      // …and the earlier tiers CLOSE theirs with a timber door, which is the
      // whole reason they no longer read as castles
      for (let L = 0; L < 2; L++) {
        const c = Sprites.gateMask[L][0];
        const d = c.getContext('2d').getImageData(24, 36, 16, 18).data;
        let n = 0, wood = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 96) continue;
          n++;
          if (d[i] - d[i + 2] > 26) wood++;
        }
        ck('theEarlyTiersHangATimberDoor' + (L + 1), n > 0 && wood / n > 0.75,
          'L' + (L + 1) + ' gateway is ' + Math.round(100 * wood / n) + '% timber');
      }
    }
    ck('theGatehouseFliesAStandardEitherWay',
      Array.isArray(R.BANNER_AT.gate) && Array.isArray(R.BANNER_AT.gateV) &&
      R.BANNER_AT.gate.length === 2 && R.BANNER_AT.gateV.length === 2, 'an anchor per flanking tower, per axis');
  }

  // ---- 1c. which way a gate faces ----
  {
    G.newGame('gate1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    S.wallLevel = 2;
    const tc = Bld.tcOf('P'); tc.x = 2; tc.y = 2;
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    S.buildings = S.buildings.filter(z => z.key === 'tc'); Bld._block = null;
    const put = (key, x, y) => { const bb = Bld.place('P', key, x, y, { free: true }); Bld.finish(bb); return bb; };
    // a gate in a NORTH-SOUTH curtain, flanked by two towers — the player's own
    // gatehouse, and the shape that used to draw its east-west self sideways
    put('wall', 20, 14); put('tower', 20, 15); put('gate', 20, 16); put('tower', 20, 17); put('wall', 20, 18);
    ck('gateFacesItsLineThroughTowers', R.gateVerticalAt(20, 16) === true, 'north-south');
    // …and the same run made of plain wall
    put('wall', 26, 14); put('wall', 26, 15); put('gate', 26, 16); put('wall', 26, 17);
    ck('gateFacesItsLineThroughWalls', R.gateVerticalAt(26, 16) === true, 'north-south');
    // an EAST-WEST run reads the other way
    put('wall', 30, 20); put('tower', 31, 20); put('gate', 32, 20); put('tower', 33, 20); put('wall', 34, 20);
    ck('anEastWestGateFacesEastWest', R.gateVerticalAt(32, 20) === false, 'east-west');
    // one wall to the east must not outvote two towers north and south
    put('wall', 20, 15 - 1); put('wall', 21, 16);
    ck('oneStrayWallDoesNotSpinTheGate', R.gateVerticalAt(20, 16) === true, 'still north-south');
    // TERRAIN NEVER VOTES: a curtain running east-west to a lake shore has water
    // north and south of its gate — counting it would face the gate exactly wrong
    put('wall', 39, 24); put('gate', 40, 24); put('wall', 41, 24);
    for (const [wx, wy] of [[40, 23], [40, 25]]) S.map.terrain[MapGen.idx(wx, wy)] = T.WATER;
    Bld._block = null;
    ck('waterDoesNotTurnAGate', R.gateVerticalAt(40, 24) === false, 'the walls decide, not the lake');
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

    /* ---- 2b. A TOWER HAS TWO SELVES ----
       Built onto a wall it is a MURAL TOWER: a thicker, taller piece of the
       curtain in the same stone, no outline and no door in its foot. Standing
       alone in open ground it stays the free-standing Watchtower, because a
       lone scout tower should still read as a building. A work site keeps the
       ordinary sprite — what is being raised is the building, not the bond. */
    {
      const lone = put('tower', 40, 10);
      const lv = (b) => Math.max(1, b.level);
      ck('aLoneTowerIsAWatchtower',
        R.bldSprite(lone) === Sprites.building.tower[lv(lone) - 1], 'free-standing art in open ground');
      ck('aTowerBuiltOntoAWallIsMural',
        R.bldSprite(midT) === Sprites.towerMural[lv(midT) - 1], 'mid-run wears the curtain\'s own stone');
      ck('soDoesACornerTower',
        R.bldSprite(Bld.at(22, 30)) === Sprites.towerMural[lv(Bld.at(22, 30)) - 1], '');
      const site2 = put('tower', 40, 14, true);
      put('wall', 41, 14);
      ck('aWorkSiteIsNeither',
        R.bldSprite(site2) === Sprites.building.tower[lv(site2) - 1], 'the raising is of a building');
      // …and the mural tower tells the tier's own material story, like everything
      // else on the wall — it is part of the curtain, so it must match it
      const m1 = mix(Sprites.towerMural[0]), m2 = mix(Sprites.towerMural[1]), m3 = mix(Sprites.towerMural[2]);
      ck('theMuralTowerStepsInMaterialToo',
        m1.wood > 0.6 && m2.wood > 0.2 && m2.stone > 0.3 && m3.stone > 0.7 &&
        m1.stone < m2.stone && m2.stone < m3.stone,
        [m1, m2, m3].map(pct).join(' · '));
      ck('andItIsNotTheWatchtowerRedrawn',
        Sprites.towerMural[1].toDataURL() !== Sprites.building.tower[1].toDataURL(), '');
    }

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
