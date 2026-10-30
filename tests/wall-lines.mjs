/* THE WALL SANDBOX, PINNED — CONTRACT

   The operator, with two screenshots: "we have towers going underneath a
   mountain, we have towers sitting on top of walls, we have walls going over
   the black edge, we have walls going into the water … when there are long
   lines of walls (running top / bottom) … they glitch … on top and below each
   other … Walls have to come half way up a tower … something more elegant for
   end caps … Fences on top of the wall shouldn't be cut off". A sandbox laid
   every pattern — lines into the black, into water, under and beside
   mountains, round them, zigzags, gatehouses — at all three tiers, and each
   fault it showed is one rule here.

     1. WHAT STANDS IN FRONT IS PAINTED IN FRONT (R.redrawFront). A man
        walking beside a north-south line changes NO pixel outside his own
        picture — the old redraw put back a hand-picked list of forts
        UNCLIPPED, so curtain and towers traded places with every step he
        took. And a tower south of a mountain stands in front of the rock:
        the strips draw after the buildings, so the building pass's tower
        has to be laid back over every strip north of its foot.
     2. A WALL JOINS WALLS, NEVER THE LAND (R.wallMaskAt). Water and rock
        used to brace a curtain toward them, so a line ran its arm into the
        lake and up under the crag. Off the board is not a neighbour either.
     3. NOTHING IS DRAWN IN THE BLACK — the building pass and the remembered
        ghosts are clipped to the board, so a wall on the first row is cut at
        the edge instead of standing in the void.
     4. THE WALK COMES HALF WAY UP A TOWER (R.TOWER_HALF): in a north-south
        line the curtain leaving a tower south meets its face partway up its
        body, at a doorway, not at its foot like a stub bolted on underneath.
     5. THE END CAPS ARE WHOLE (assets/fort/wall-l1*.png, wall-l2*.png). A
        level-1 node with no west arm used to carry a sawn-off stub of wattle
        fence left of its post, and one with no north arm a flat saw-cut on
        its mound's back; a level-2 log block was four pixels narrower than
        the walkway it caps, so the walk's rail stuck out at every end — and
        when it was let out, its bevelled lower corner came apart into a
        broken step (now whole). A level-3 bastion with no north arm wore a
        flat-topped slab of the walk's shaded face beside its head (now a
        round back), and its footings stage a lane running north out of the
        ring (now ending in the ring).
     6. A LINE GOING UP IS ONE LINE (R.lineAt): a wall or gate still being
        raised is not solid, so the block grid does not see it — and a
        dragged line drew as a row of lone end caps until its last section
        set. The picture counts sites; every rule still asks Bld.fortAt.
     7. THE LEVEL-2 GATE'S GRATE HANGS ON ITS GATEHOUSE (R.GATE_DRAWN): side
        on, it hung a cell and a half out in the grass and, raised, floated
        over the roof.

   Run this after touching any of:
     render.js — occludeByForts / redrawFront / _picRect / _redrawPic /
                 wallMaskAt / lineAt / gateVerticalAt / GATE_DRAWN /
                 drawTowerWalk / drawGateWalk / _walkOver /
                 the building pass / the mountain strip flush
     assets/fort/wall-l*.png, gate-l2.png

     node tests/wall-lines.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // the checks read the frame's pixels
const p = await b.newPage({ viewport: { width: 500, height: 700 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.evaluate(() => { Boot.force(); Screens._demo = false; G.newGame('walllines', 'moderate', 'large'); Screens.show('playing'); S.paused = true; });
// the art, not a timer: the drawn kit at every tier and the wall towers
await p.waitForFunction(() => typeof Sprites !== 'undefined' && Sprites.towerArt &&
  [0, 1, 2].every(i => Sprites.towerArt[i] && Sprites.wallMask[i][10]._cfArt && Sprites.gateMask[i][1]._cfArt) &&
  (!Assets.allArtReady || Assets.allArtReady()), null, { timeout: 120000 }).catch(() => {});

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const TL = CFG.TILE;
  // a cleared board, both halls out of the way
  const clear = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    for (const t of [Bld.tcOf('P'), Bld.tcOf('A')]) if (t) { t.x = 40; t.y = t.owner === 'A' ? 44 : 40; }
    S.buildings = S.buildings.filter(bb => bb.key === 'tc'); S.units = [];
    for (let i = 0; i < S.map.terrain.length; i++) { S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1; }
    Bld._block = null;
  };
  const put = (k, x, y, lv) => {
    const bb = Bld.place('P', k, x, y, { free: true, instant: true });
    if (bb && bb.construction > 0) Bld.finish(bb);
    if (bb) { bb.level = lv; const L = CFG.BUILDINGS[k].levels[lv - 1]; if (L && L.hp) bb.hp = bb.maxhp = L.hp; if (k === 'gate') bb.raised = true; }
    Bld._block = null;
    return bb;
  };
  const settle = () => {
    for (let i = 0; i < S.map.terrain.length; i++) S.map.seenTerrain[i] = S.map.terrain[i];
    G.freeVis = true; G.updateVisibility(); R.holdBake = false; R.rebuildTerrain();
    if (R.ensureTerrain) R.ensureTerrain();
    if (R.redrawFog) R.redrawFog();
  };
  const cv = R.cv;
  const snap = () => { R.draw(0); return R.g.getImageData(0, 0, cv.width, cv.height); };
  const scr = (wx, wy) => { const z = R.cam.z * (R.dpr || 1); return [(wx - R.cam.x) * z, (wy - R.cam.y) * z]; };

  // ---- 1a. a man beside a north-south line moves only his own pixels ----
  {
    const bad = [];
    for (const lv of [1, 2, 3]) {
      clear('wl-walk' + lv); S.wallLevel = lv;
      for (let y = 8; y <= 22; y++) put(y % 5 === 0 ? 'tower' : 'wall', 20, y, lv);
      settle(); R.cam.z = 2; R.centerOn(20.5, 15);
      const u = Units.spawn('villager', 'P', 19, 9);
      const box = (y) => {
        const B = TL, foot = y * TL + TL / 2 - CFG.SPRITE_LIFT;
        const a = scr(19.6 * TL - B, foot - B * 1.8), c = scr(19.6 * TL + B, foot + TL * 0.6);
        return [a[0] - 2, a[1] - 2, c[0] + 2, c[1] + 2];
      };
      // each step drawn twice back to back, with him and without him: art
      // landing late can change a frame, never the pair
      let n = 0, steps = 0;
      for (let yy = 9.2; yy < 21; yy += 0.5) {
        u.x = 19.6; u.y = yy;
        const im = snap();
        S.units = [];
        const bare = snap();
        S.units = [u];
        steps++;
        const b1 = box(yy), W = im.width, d = im.data, q = bare.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] === q[i] && d[i + 1] === q[i + 1] && d[i + 2] === q[i + 2]) continue;
          const px = (i / 4) % W, py = ((i / 4) / W) | 0;
          if (!(px >= b1[0] && px <= b1[2] && py >= b1[1] && py <= b1[3])) n++;
        }
      }
      if (n) bad.push('L' + lv + ': ' + n + ' px over ' + steps + ' steps');
      S.units = [];
    }
    ck('aManBesideTheLineMovesOnlyHisOwnPixels', bad.length === 0, bad.length ? bad.join('; ') : 'a north-south line with towers, every tier, 23 steps each');
  }

  // ---- 1b. a tower south of a mountain stands in front of the rock ----
  {
    clear('wl-mtn'); S.wallLevel = 2;
    for (let y = 18; y <= 21; y++) for (let x = 18; x <= 23; x++) S.map.terrain[MapGen.idx(x, y)] = T.MOUNTAIN;
    const tw = put('tower', 20, 22, 2); put('wall', 19, 22, 2); put('wall', 21, 22, 2);
    settle(); R.cam.z = 2; R.centerOn(20.5, 21);
    const grab = () => snap();
    const strips = R.mtnStrips.bind(R), redraw = R.redrawFront;
    const hideTower = () => { S.buildings = S.buildings.filter(bb => bb !== tw); Bld._block = null; };
    const showTower = () => { S.buildings.push(tw); Bld._block = null; };
    const MT = grab();                                       // mountain + tower
    R.mtnStrips = () => [];
    const NT = grab();                                       // tower, no mountain
    hideTower();
    const NN = grab();                                       // neither
    R.mtnStrips = strips;
    const MN = grab();                                       // mountain, no tower
    showTower();
    R.redrawFront = () => 0;
    const OLD = grab();                                      // the old order: strips over the tower
    R.redrawFront = redraw;
    // the tower's own SOLID pixels that the mountain's picture also covers —
    // its rim is smoothed onto whatever stands behind it, rock or grass (the
    // body is drawn a hair under its own pixel size), so the rim is left out:
    // a pixel counts only with everything within two pixels the tower's too
    const [x0, y0] = scr(tw.x * TL - TL, tw.y * TL - TL * 2.2), [x1, y1] = scr(tw.x * TL + TL * 2, tw.y * TL + TL);
    let both = 0, lost = 0, oldLost = 0;
    const W = MT.width;
    const eqAt = (A, B, i) => A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2];
    const towerAt = (x, y) => !eqAt(NT, NN, (y * W + x) * 4);
    for (let y = Math.max(2, y0 | 0); y < Math.min(MT.height - 2, y1); y++) for (let x = Math.max(2, x0 | 0); x < Math.min(W - 2, x1); x++) {
      const i = (y * W + x) * 4;
      let solid = true;
      for (let dy = -2; dy <= 2 && solid; dy++) for (let dx = -2; dx <= 2; dx++) if (!towerAt(x + dx, y + dy)) { solid = false; break; }
      if (!solid) continue;
      if (eqAt(MN, NN, i)) continue;                         // not under the rock
      both++;
      if (!eqAt(MT, NT, i)) lost++;
      if (!eqAt(OLD, NT, i)) oldLost++;
    }
    ck('aTowerSouthOfAMountainStandsInFrontOfIt', both > 40 && lost === 0,
      both + ' tower pixels the rock\x27s picture also reaches, ' + lost + ' lost to it');
    ck('andTheProbeSeesTheOldOrder', oldLost > both * 0.25, 'with the redraw stood down the rock covers ' + oldLost + ' of them');
  }

  // ---- 2. a wall joins walls, never the land and never the black ----
  {
    clear('wl-mask'); S.wallLevel = 1;
    S.map.terrain[MapGen.idx(30, 29)] = T.WATER; S.map.terrain[MapGen.idx(31, 30)] = T.MOUNTAIN;
    S.map.terrain[MapGen.idx(29, 30)] = T.WATER; S.map.terrain[MapGen.idx(30, 31)] = T.MOUNTAIN;
    put('wall', 30, 30, 1);
    const lone = R.wallMaskAt(30, 30);
    put('wall', 30, 1, 1); put('wall', 1, 12, 1);
    const top = R.wallMaskAt(30, 1), left = R.wallMaskAt(1, 12);
    put('wall', 30, 2, 1);
    const run = R.wallMaskAt(30, 1);
    ck('aWallNeverJoinsWaterOrRock', lone === 0, 'water and rock on all four sides: mask ' + lone);
    ck('norTheBlack', !(top & 1) && !(left & 8), 'row 1 mask ' + top + ', column 1 mask ' + left);
    ck('butItStillJoinsAWall', run === 4, 'a wall south of the row-1 wall: mask ' + run);
  }

  // ---- 2b. a line going up is one line ----
  {
    clear('wl-site'); S.wallLevel = 2;
    const site = (k, x, y) => { const bb = Bld.place('P', k, x, y, { free: true }); if (bb) bb.level = 2; Bld._block = null; return bb; };
    const a = site('wall', 30, 20); site('wall', 30, 21); const gt = site('gate', 30, 22); site('wall', 30, 23);
    put('wall', 30, 24, 2);
    const m = [20, 21, 23, 24].map(y => R.wallMaskAt(30, y)), vert = R.gateVerticalAt(30, 22);
    ck('aLineGoingUpIsOneLine', a && a.construction > 0 && gt && gt.construction > 0 &&
      m.join() === '4,5,5,1' && vert,
      'masks ' + m.join('/') + ' (want 4/5/5/1), the gate site facing the line: ' + vert);
    ck('butASiteIsStillWalkedThrough', !Bld.fortAt(30, 21) && Path.passable(30, 21, 'P'), 'the picture joins it; the rules do not');
  }

  // ---- 3. nothing is drawn in the black ----
  {
    clear('wl-black'); S.wallLevel = 3;
    settle(); R.cam.z = 2; R.centerOn(4, 4);
    const before = snap();
    for (let x = 1; x <= 7; x++) put(x === 4 ? 'tower' : 'wall', x, 1, 3);
    for (let y = 2; y <= 7; y++) put(y === 5 ? 'gate' : 'wall', 1, y, 3);
    settle(); R.cam.z = 2; R.centerOn(4, 4);
    const after = snap();
    const bp = R.boardPx(), W = after.width;
    const count = (A) => {
      let n = 0, reach = 0;
      for (let i = 0; i < A.data.length; i += 4) {
        const px = (i / 4) % W, py = ((i / 4) / W) | 0;
        const wx = px / (R.cam.z * (R.dpr || 1)) + R.cam.x, wy = py / (R.cam.z * (R.dpr || 1)) + R.cam.y;
        if (R.onBoardPx(wx, wy)) continue;
        reach++;
        if (A.data[i] !== before.data[i] || A.data[i + 1] !== before.data[i + 1] || A.data[i + 2] !== before.data[i + 2]) n++;
      }
      return [n, reach];
    };
    const [n, reach] = count(after);
    // the control: let the pass draw past the edge and the probe must see it
    const keep = R.boardPx;
    R.boardPx = () => ({ x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 });
    const leak = snap();
    R.boardPx = keep;
    const [nLeak] = count(leak);
    ck('nothingIsDrawnInTheBlack', reach > 1000 && n === 0, n + ' of ' + reach + ' off-board pixels changed by a wall line on the first row and column');
    ck('andTheProbeCanSeeALeak', nLeak > 100, nLeak + ' with the board clip widened');
  }

  // ---- 4. the walk comes half way up a tower ----
  {
    const bad = [];
    for (const lv of [1, 2, 3]) {
      clear('wl-half' + lv); S.wallLevel = lv;
      put('wall', 20, 13, lv); put('wall', 20, 14, lv); const tw = put('tower', 20, 15, lv); put('wall', 20, 16, lv); put('wall', 20, 17, lv);
      settle(); R.cam.z = 2; R.centerOn(20.5, 15);
      const real = snap();
      const keep = R.drawTowerWalk; R.drawTowerWalk = () => {};
      const none = snap();
      R.drawTowerWalk = keep;
      const body = R.towerArtFor(tw), br = R.artRect(body, tw.x * TL, tw.y * TL, TL, TL);
      const [, by0] = scr(0, br.y), [, by1] = scr(0, br.y + br.h);
      const [cx0] = scr(tw.x * TL, 0), [cx1] = scr(tw.x * TL + TL, 0);
      let top = Infinity, bot = -Infinity;
      const W = real.width;
      for (let y = 0; y < real.height; y++) for (let x = cx0 | 0; x < cx1; x++) {
        const i = (y * W + x) * 4;
        if (real.data[i] !== none.data[i] || real.data[i + 1] !== none.data[i + 1] || real.data[i + 2] !== none.data[i + 2]) { top = Math.min(top, y); bot = Math.max(bot, y); }
      }
      const f = (top - by0) / (by1 - by0), g = (bot - by0) / (by1 - by0);
      if (!(f > 0.4 && f < 0.7 && g > 0.9)) bad.push('L' + lv + ' walk from ' + f.toFixed(2) + ' to ' + g.toFixed(2) + ' of the body');
    }
    ck('theWalkComesHalfWayUpATower', bad.length === 0, bad.length ? bad.join('; ') : 'doorway and walk from about half way down the body to its foot, every tier');
  }

  return { res, fails };
});

// ---- 5. the end caps are whole (the kit itself, read off the page's canvases) ----
const caps = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const read = async (src) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return { w: c.width, at: (f, x, y) => { const i = (y * c.width + f * 78 + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]]; } };
  };
  const NON_W = [0, 1, 2, 3, 4, 6, 7], NON_N = [0, 2, 4, 6, 8, 12, 14];
  {
    const bad = [];
    for (const s of ['', '-b2', '-b3', '-d1', '-d2']) {
      const a = await read('assets/fort/wall-l1' + s + '.png');
      for (const f of NON_W) {
        let stub = 0, raw = 0;
        for (let y = 40; y <= 61; y++) for (let x = 0; x < 27; x++) if (a.at(f, x, y)[3] > 20) stub++;
        for (let y = 62; y <= 109; y++) {
          let x = 0; while (x < 78 && a.at(f, x, y)[3] <= 20) x++;
          if (x < 78) { const c = a.at(f, x, y); if (c[0] + c[1] + c[2] > 90) raw++; }
        }
        if (stub || raw > 2) bad.push('wall-l1' + s + ' frame ' + f + ': ' + stub + ' stub px, ' + raw + ' un-inked flank rows');
      }
    }
    ck('level1HasNoCutFenceAtItsEnds', bad.length === 0, bad.length ? bad.join('; ') : 'every node frame with no west arm, finished, stages and damage');
  }
  {
    const bad = [];
    const a = await read('assets/fort/wall-l1.png');
    for (const f of NON_N) {
      let l = 0; while (l < 78 && a.at(f, l, 52)[3] <= 20) l++;
      let r = 77; while (r >= 0 && a.at(f, r, 52)[3] <= 20) r--;
      let raw = 0; for (let x = l; x <= r; x++) { const c = a.at(f, x, 52); if (c[0] + c[1] + c[2] > 90) raw++; }
      if (l < 29 || r > 59 || raw) bad.push('frame ' + f + ' top row ' + l + '..' + r + ', ' + raw + ' un-inked');
    }
    ck('andItsMoundsBackIsRounded', bad.length === 0, bad.length ? bad.join('; ') : 'both top corners cut, the back inked');
  }
  {
    const bad = [];
    // the finished block (a battered one is broken ragged on purpose, and a
    // stage is not a block yet)
    for (const s of ['']) {
      const a = await read('assets/fort/wall-l2' + s + '.png');
      const right = (f, y) => { let r = 77; while (r >= 0 && a.at(f, r, y)[3] <= 20) r--; return r; };
      const walk = right(5, 80);
      for (let f = 0; f < 16; f++) {
        if (f === 5 || f === 10 || (f & 2)) continue;          // the straight runs; an east arm carries on past the block
        const blk = right(f, 80);
        if (blk < walk) bad.push('wall-l2' + s + ' frame ' + f + ' block to x ' + blk + ', walk to ' + walk);
      }
    }
    ck('level2BlockIsAsWideAsItsWalk', bad.length === 0, bad.length ? bad.join('; ') : 'no rail sticks out past the block');
  }
  {
    // the widened block's bevelled lower corner moved with it: its edge
    // steps in row by row with no hole just inside it, and nothing loose
    // lies under it
    const bad = [];
    for (const s of ['', '-b1', '-b2', '-b3', '-d1']) {
      const a = await read('assets/fort/wall-l2' + s + '.png');
      const op = (f, x, y) => a.at(f, x, y)[3] > 20;
      for (const f of [0, 1, 4, 8, 9, 12, 13]) {
        const last = (f & 4) ? 106 : 108;
        let prev = 99;
        for (let y = 99; y <= last; y++) {
          let r = 56; while (r >= 24 && !op(f, r, y)) r--;
          let holes = 0; for (let x = r - 8; x < r; x++) if (!op(f, x, y)) holes++;
          if (r > prev || holes) { bad.push('wall-l2' + s + ' frame ' + f + ' row ' + y + ': edge ' + r + ', ' + holes + ' holes'); break; }
          prev = r;
        }
        if (!(f & 4)) for (let y = 109; y <= 112; y++) for (let x = 40; x <= 56; x++) if (op(f, x, y)) bad.push('wall-l2' + s + ' frame ' + f + ' loose pixel ' + x + ',' + y);
      }
    }
    ck('andItsLowerCornerIsWhole', bad.length === 0, bad.length ? bad.slice(0, 6).join('; ') : 'the bevel steps in cleanly under every block, finished, stages and the battered one');
  }
  {
    // THE LEVEL-3 BASTION HAS A ROUND BACK: no slab of the walk's shaded
    // face stands up beside the head where no north arm runs; behind an
    // east arm the curtain shows instead
    const bad = [];
    for (const s of ['', '-b2', '-b3', '-d1', '-d2']) {
      const a = await read('assets/fort/wall-l3' + s + '.png');
      for (const f of NON_N) {
        let n = 0;
        for (let y = 54; y <= 57; y++) for (let x = 56; x <= 60; x++) {
          const c = a.at(f, x, y), w = a.at(10, x, y);
          if (c[3] > 20 && !(f & 2 && c.every((v, k) => v === w[k]))) n++;
        }
        if (n) bad.push('wall-l3' + s + ' frame ' + f + ': ' + n + ' slab px');
      }
      let lane = 0; for (let y = 54; y <= 57; y++) for (let x = 56; x <= 60; x++) if (a.at(1, x, y)[3] > 20) lane++;
      if (lane < 15) bad.push('wall-l3' + s + ' frame 1 lost its walk (' + lane + ')');
    }
    ck('level3BastionHasARoundBack', bad.length === 0, bad.length ? bad.join('; ') : 'the head stands clear, the curve rises into it, the walk still runs north where it should');
  }
  {
    // and its first stage, the footings, ends in its own ring
    const bad = [];
    const a = await read('assets/fort/wall-l3-b1.png');
    const cnt = (f) => { let n = 0; for (let y = 54; y <= 75; y++) for (let x = 26; x <= 52; x++) if (a.at(f, x, y)[3] > 20) n++; return n; };
    for (const f of NON_N) { const n = cnt(f); if (n) bad.push('frame ' + f + ': ' + n + ' px of lane'); }
    if (cnt(1) < 200) bad.push('frame 1 lost its lane (' + cnt(1) + ')');
    ck('level3FootingsEndInTheirRing', bad.length === 0, bad.length ? bad.join('; ') : 'no lane runs north out of a ring with nothing north of it');
  }
  {
    // the level-2 gate seen side-on: its grate hangs against the gatehouse
    // wall, shut or raised, never out in the grass or up in the sky
    const a = await read('assets/fort/gate-l2.png'), P = R.GATE_DRAWN[1].flank;
    let L = 99, Rr = -1;
    for (let y = 96; y <= 108; y++) {
      let l = 0; while (l < 78 && a.at(1, l, y)[3] <= 20) l++;
      let r = 77; while (r >= 0 && a.at(1, r, y)[3] <= 20) r--;
      L = Math.min(L, l); Rr = Math.max(Rr, r);
    }
    const fine = (x) => (x - Assets.FORT_GEO.M) * 32 / Assets.FORT_GEO.T;
    const gw = fine(L) - (P.w + 2), ge = P.e - fine(Rr + 1);
    const top = P.top - 6;
    ck('level2GateGrateHugsItsGatehouse', gw >= -0.5 && gw <= 0.75 && ge >= -0.5 && ge <= 0.75 && top >= P.y0 - 8 && P.top <= P.y1,
      'gap west ' + gw.toFixed(2) + ', east ' + ge.toFixed(2) + ' cells; raised stub ' + top + '..' + P.top + ' against a slot ' + P.y0 + '..' + P.y1);
  }
  return { res, fails };
});

const res = { ...out.res, ...caps.res }, fails = [...out.fails, ...caps.fails];
console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL WALL-LINE CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs);
await b.close();
process.exit(fails.length || realErrs.length ? 1 : 0);
