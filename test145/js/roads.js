/* THE ROAD BUILDER (tests/roads.mjs — operator, 2026-11-03: "allowing people to
   draw lines and create roads between buildings could be really fun… The
   roads need to look real, worn, embedded in the ground (not on top), random
   bushes and tufts… Remove the previous feature… where roads are created
   automatically. The player can click and drag roads and a villager builds
   them… fairly quick and easy to build (less than the time for a wall).
   Fairly cheap… a small speed boost for their soldiers and villagers. Have
   characters steer towards using the roads… next to huts / houses in the build
   menu… intersections and roads turning… north south and east west (no
   diagonals)").

   A ROAD IS LAID LIKE A WALL AND LIVES LIKE GROUND. The Road button arms the
   wall's own line drag (UI.isLine): the finger lays a chain of orthogonal tiles,
   each a 1x1 work SITE (key 'road', CFG.BUILDINGS.road — cheap, quick) that a
   villager raises through the ordinary build task, work order and Cancel. The
   site that FINISHES leaves S.buildings at once (Roads.finish, the first line
   of Bld.finish) and becomes ground: S.map.roads[idx] = 1, in every save. So a
   long road never puts hundreds of buildings in front of the systems that
   count buildings (the hall's support, deeds, the rival's eyes, raids).

   WHAT A ROAD IS: walkable ground everyone may use (passability is untouched),
   paved over whatever was spent there (stumps, picked-bare soil, rubble and
   pebbles turn to grass under it and stop regrowing), worth walking for the
   PLAYER's people — every land unit of the player's walks CFG.ROADS.speed as
   fast on it (Units.moveTo) and prices it CFG.ROADS.prefer in its route search
   (Units.wearPrefer → Path.findWeighted), so a march bends onto the road. The
   rival builds none and gets neither, the worn-paths rule (a rival road would be
   a bonus nobody decided). A building raised on a road takes the ground
   (Roads.clearUnder from Bld.place), and a road whose ground is dug or flooded
   is no road (Roads.at asks the terrain too).

   THE WORN PATHS STAND DOWN while roads are on (G.noteWear, G.wearLevel and
   G.countWearRoads answer nothing): the player builds the roads now.

   THE PICTURE: embedded, never laid on top — packed earth sunk below the
   sward, its north-west bank throwing shadow onto the road and its south-east
   lip catching the light, two ruts worn by feet and sledges, a grassy crown
   here and there, pebbles; tufts and weeds breaking its edges, the odd bush
   beside it. Every tile is painted from a distance field to the road's own
   skeleton (centre to the middle of each joined side, its neighbours'
   skeletons included) with noise in WORLD coordinates, so tiles flow into each
   other with no seam, turns round off, T-junctions and crossroads join, and no
   two tiles are alike. Painted on the V4/V5 ground's half-pixel grid; cached
   per tile (surface and decor, the decor cut to what it holds), at most
   CACHE_MAX tiles, measured under BUDGET_MS a frame. A road SITE shows the
   road coming up through the turf in three dithered stages with its stakes.

   THE WAY BACK: CFG.ROADS.ON false — no Road button, no road drawn, and the
   worn paths return. */
const Roads = (() => {
  const K = 2;                                         // cells per world pixel
  const Rd = { BUDGET_MS: 4, CACHE_MAX: 360, _c: new Map(), _world: null, _n: -1, _cost: null };
  Rd.on = () => typeof CFG !== 'undefined' && !!(CFG.ROADS && CFG.ROADS.ON);
  // the roads are as good as the hall: its level, read live (1..3)
  Rd.level = () => {
    const tc = typeof Bld !== 'undefined' && Bld.tcOf && typeof S !== 'undefined' && S && S.buildings ? Bld.tcOf('P') : null;
    const l = tc ? tc.level | 0 : 1;
    return l < 1 ? 1 : l > 3 ? 3 : l;
  };

  // ---- the data ------------------------------------------------------------
  const map = () => S.map.roads || (S.map.roads = {});
  const PAVE = () => [T.STUMPS, T.BARREN, T.RUIN, T.PEBBLES];
  Rd.ground = t => t === T.GRASS || PAVE().includes(t);
  // a finished road the player can walk on: laid, and its ground still ground
  Rd.at = (x, y) => {
    if (!Rd.on() || !S.map || !S.map.roads || !MapGen.onBoard(x, y)) return false;
    const i = y * CFG.W + x;
    return !!S.map.roads[i] && S.map.terrain[i] === T.GRASS;
  };
  Rd.siteAt = (x, y) => { const b = MapGen.onBoard(x, y) && Bld.at(x, y); return b && b.key === 'road' && b.construction > 0 ? b : null; };
  /* THE ROAD GOES THROUGH THE GATE (operator, 2026-11-04, on a gate with a
     road either side and grass in its passage: "make sure that the road goes
     through. Or just maybe make it a road regardless to keep it simple…
     make sure the gate road matches the current player road level"). Every
     finished gate of the player's carries a road down its passage, at the
     hall's level like every road, and on a tile either side of it over open
     grass (its APRON), so a road laid up to a gate joins it and a gate with
     none still reads as a way through. A picture only, like the levels: the
     passage's rules are the gate's, and no road is laid in S. The gate's own
     road runs only along its passage — a road beside the wall never turns
     into the gate's flank. Rebuilt once a frame by Rd.draw (Rd._gr: idx →
     'ns' / 'ew' for a gate, 'a' for an apron); null outside the draw. */
  Rd._gr = null;
  Rd.gateRoads = function () {
    const gr = new Map(), W = CFG.W;
    for (const b of S.buildings) {
      if (b.key !== 'gate' || b.owner !== 'P' || b.construction > 0) continue;
      const ax = R.gateVerticalAt && R.gateVerticalAt(b.x, b.y) ? 'ew' : 'ns';
      gr.set(b.y * W + b.x, ax);
    }
    for (const [i, ax] of [...gr]) {
      const x = i % W, y = (i / W) | 0;
      for (const d of (ax === 'ns' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]])) {
        const nx = x + d[0], ny = y + d[1], j = ny * W + nx;
        if (gr.has(j) || !MapGen.onBoard(nx, ny) || !S.map.explored[j]) continue;
        if (S.map.terrain[j] === T.GRASS && !Bld.at(nx, ny)) gr.set(j, 'a');
      }
    }
    return gr;
  };
  const gateAx = (x, y) => { const v = Rd._gr && MapGen.inB(x, y) && Rd._gr.get(y * CFG.W + x); return v === 'ns' || v === 'ew' ? v : null; };
  // what the picture joins to: a road, a road going up, a gate's passage or its apron
  const link = (x, y) => Rd.at(x, y) || !!Rd.siteAt(x, y) || !!(Rd._gr && MapGen.inB(x, y) && Rd._gr.has(y * CFG.W + x));
  // …and a gate joins only along its passage, from either side of the step
  const byGate = (x, y, dx, dy) => { const a = gateAx(x, y); return !a || (a === 'ns' ? dx === 0 : dy === 0); };
  const joins = (x, y, dx, dy) => link(x + dx, y + dy) && byGate(x, y, dx, dy) && byGate(x + dx, y + dy, -dx, -dy);
  Rd.count = () => {
    if (Rd._world !== S.map) { Rd._world = S.map; Rd._n = -1; Rd._c.clear(); }
    if (Rd._n < 0) { let n = 0; const m = S.map.roads || {}; for (const k in m) if (S.map.terrain[+k] === T.GRASS) n++; Rd._n = n; }
    return Rd._n;
  };
  /* THE ROAD CALLS THE WALKER: a road step costs `prefer`, open ground 1 — the
     weighted search's price, with its admissible floor (min) */
  Rd.cost = () => {
    if (!Rd._cost) { const p = CFG.ROADS.prefer; Rd._cost = (x, y) => (Rd.at(x, y) ? p : 1); Rd._cost.min = p; }
    return Rd._cost;
  };

  // ---- placement -------------------------------------------------------------
  Rd.canPlace = function (owner, x, y, opts) {
    opts = opts || {};
    if (owner !== 'P') return { ok: false, code: 'owner', why: 'Only your people lay roads' };
    if (!MapGen.onBoard(x, y)) return { ok: false, code: 'edge', why: 'Off the map' };
    if (window.Deck && Deck.blindAt && Deck.blindAt(x, y)) return { ok: false, code: 'unexplored', why: Deck.EYES_BUILD || 'Unexplored' };
    const i = y * CFG.W + x;
    if (!S.map.explored[i]) return { ok: false, code: 'unexplored', why: 'Unexplored' };
    if (!Rd.ground(S.map.terrain[i])) return { ok: false, code: 'ground', why: 'A road goes on open ground' };
    if (Bld.at(x, y)) return { ok: false, code: 'blocked', why: 'Something stands there' };
    if (Bld.ashAt && Bld.ashAt(x, y)) return { ok: false, code: 'ash', why: 'Ashes still smoulder here' };
    if (Rd.at(x, y)) return { ok: false, code: 'road', why: 'There is a road here already' };
    if (!opts.noCost && !Bld.canAfford(Bld.effCost(owner, 'road'))) return { ok: false, code: 'cost', why: 'Not enough resources' };
    return { ok: true };
  };

  // ---- a site that finishes becomes ground -------------------------------------
  Rd.finish = function (b, builder) {
    const i = b.y * CFG.W + b.x;
    const k = S.buildings.indexOf(b);
    if (k >= 0) S.buildings.splice(k, 1);
    Bld._block = null;
    if (typeof UI !== 'undefined' && UI.sel && UI.sel.type === 'building' && UI.sel.id === b.id && UI.deselect) UI.deselect();
    map()[i] = 1;
    // paved: what was spent there stops regrowing under the road
    const t = S.map.terrain[i];
    if (t !== T.GRASS) {
      S.map.terrain[i] = T.GRASS;
      if (S.map.resAmount) S.map.resAmount[i] = 0;
      if (S.map.decay) delete S.map.decay[i];
      if (S.map.workedBy) delete S.map.workedBy[i];
      if (window.R && R.updateTile) R.updateTile(b.x, b.y);
    }
    if (S.stats) S.stats.roads = (S.stats.roads || 0) + 1;
    Rd._n = -1; Rd.dirty(b.x, b.y);
    // a building this tile reaches starts working the better for it (Bld.roadBoost) — it twinkles
    if (b.owner === 'P' && Bld.roadArrived) Bld.roadArrived(b.x, b.y);
    // the other hands on this tile go on to the next tile of the line
    for (const u of S.units) {
      if (u === builder || !u.task || u.task.type !== 'build' || u.task.id !== b.id) continue;
      u.task = null;
      const next = Rd.nextSite(u);
      if (next) Units.assignBuild(u, next);
    }
    // the line is done: said once, not once a tile
    if (b.owner === 'P' && !S.buildings.some(o => o.key === 'road' && o.owner === 'P' && o.construction > 0)) {
      if (typeof Sound !== 'undefined' && Sound.ui) Sound.ui('complete', b.x + 0.5, b.y + 0.5);
      G.log('The road is laid', 'note');
    }
  };
  Rd.nextSite = function (u) {
    let best = null, bd = 6;
    for (const o of S.buildings) {
      if (o.key !== 'road' || o.owner !== u.owner || !(o.construction > 0) || Bld.hasWorker(o)) continue;
      const d = Math.hypot(o.x + 0.5 - u.x, o.y + 0.5 - u.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };
  // a building raised on a road takes the ground
  Rd.clearUnder = function (x, y, size) {
    const m = S.map && S.map.roads; if (!m) return;
    let hit = false;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) { const i = (y + dy) * CFG.W + x + dx; if (m[i]) { delete m[i]; hit = true; Rd.dirty(x + dx, y + dy); } }
    if (hit) Rd._n = -1;
  };
  Rd.dirty = function (x, y) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) Rd._c.delete((y + dy) * CFG.W + x + dx);
  };

  // ---- the painter --------------------------------------------------------------
  const hx = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vn = (x, y, s) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hx(x0, y0, s), b = hx(x0 + 1, y0, s), c = hx(x0, y0 + 1, s), d = hx(x0 + 1, y0 + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const fbm = (x, y, s) => vn(x, y, s) * 0.62 + vn(x * 2.3, y * 2.3, s + 11) * 0.38;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bay = (x, y) => BAY[(y & 3) * 4 + (x & 3)];
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const P = {
    earth: ['#3f2f20', '#54402b', '#6a5136', '#7e6243', '#937552', '#a98a63', '#bc9f76'].map(hex),
    grass: ['#24561f', '#2f6b27', '#3d8130', '#4f983a', '#6cb04b', '#93c766'].map(hex),
    seed: ['#8f8257', '#ad9f72', '#c6bb92'].map(hex),
    bush: ['#10291a', '#183d22', '#21552a', '#2d6c31', '#41873a', '#5fa24a'].map(hex),
    bush2: ['#1f2a12', '#33461c', '#4a6424', '#61802d', '#7c9a39', '#9db556'].map(hex),
    stone: ['#34322c', '#55534b', '#706d63', '#8a867a', '#a7a294', '#c2bdae'].map(hex),
    petal: ['#e9e3d0', '#b9a3d6'].map(hex),
    stake: ['#3c2616', '#6a4528', '#9a6c40'].map(hex),
    dust: ['#4d3b28', '#614b33', '#775e40', '#8b704d', '#9f845c', '#b39a70', '#c8b088'].map(hex),
    slab: ['#3a3935', '#504e48', '#65625a', '#79756b', '#8e897d', '#a39d90', '#b9b2a3'].map(hex),
    kerb: ['#4c463a', '#7c7464', '#9c9380', '#b6ac97', '#cdc4ae', '#e0d8c4'].map(hex)
  };
  const TL = () => CFG.TILE;
  // the skeleton of the roads round (tx, ty): centre to the middle of each joined side
  function segsAround(tx, ty, r, extra) {
    const out = [], T_ = TL();
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      if (!(extra ? extra(x, y) : link(x, y))) continue;
      const cx = (x + 0.5) * T_, cy = (y + 0.5) * T_;
      let m = 0, k = 0;
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], b) => {
        if (!(extra ? extra(x + dx, y + dy) : joins(x, y, dx, dy))) return;
        out.push([cx, cy, cx + dx * T_ / 2, cy + dy * T_ / 2, x, y, 0]); m |= 1 << b; k++;
      });
      if (!k) out.push(!extra && gateAx(x, y) === 'ns' ? [cx, cy - 4, cx, cy + 4, x, y, 0] : [cx - 4, cy, cx + 4, cy, x, y, 0]);   // a lone tile: a short patch (a gate's, along its passage)
      // a turn, a T or a crossroads wears its INSIDE corners round — only the
      // quadrants between two joined arms (near()), so a T's straight side
      // stays straight and a turn's outer corner keeps its own curve
      else if (k >= 2 && m !== 5 && m !== 10) out.push([cx, cy, cx, cy, x, y, 6, m]);
    }
    return out;
  }
  function near(segs, px, py) {
    let bd = 1e9, bx = 0, by = 0, bt = null;   // bd: the distance itself (a disc subtracts its radius)
    for (const s of segs) {
      const ax = s[0], ay = s[1], vx = s[2] - ax, vy = s[3] - ay, L = vx * vx + vy * vy;
      if (s[6]) { const need = (py - ay < 0 ? 1 : 4) | (px - ax > 0 ? 2 : 8); if ((s[7] & need) !== need) continue; }
      let t = L ? ((px - ax) * vx + (py - ay) * vy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + vx * t, qy = ay + vy * t;
      let d = Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
      if (s[6]) d = Math.max(0, d - s[6]);
      if (d < bd) { bd = d; bx = qx; by = qy; bt = s; }
    }
    return { d: bd, qx: bx, qy: by, seg: bt };
  }
  /* THREE ROADS, ONE PER AGE OF THE HALL (operator, 2026-11-04: "Make the current
     road level 2, create a more rural road (more like a worn path), and then a
     level 3 that's like a Roman road… upgrade when town center upgrades (no
     cost), like villagers"). The level is the player's hall's, read live
     (Rd.level) and part of every cached tile's key, so a new storey on the hall
     repaints the roads a few tiles a frame. A picture only: speed and route
     price are the same at every level.
       1  a worn track: two bare ruts in dusty earth, a grassy hump between them,
          the sward taking the edges back in a dither and coming through in patches
       2  the packed-earth road: sunk, banked, rutted
       3  a via: polygonal stone slabs mortared tight, two cart ruts worn into
          them, dressed kerbs along both sides, a gravel shoulder, a milestone */
  const LV = { 1: { hw: 8.4, wn: 3.4, wf: 1.6 }, 2: { hw: 10.5, wn: 5.4, wf: 1.8 }, 3: { hw: 11.6, wn: 0.35, wf: 0.2 } };
  const width = (lv, wx, wy) => { const L = LV[lv]; return L.hw + (fbm(wx / 13, wy / 13, 1) - 0.5) * L.wn + (fbm(wx / 4, wy / 4, 2) - 0.5) * L.wf; };
  const clampK = (k, a, b) => (k < a ? a : k > b ? b : k);

  // level 1: the worn track — null lets the real sward show through
  function pix1(n, w, wx, wy, gx, gy, j, side) {
    const edge = w - n.d, hw = LV[1].hw;
    if (edge < 2.0 && bay(gx, gy) * 2.0 > edge + (fbm(wx / 3, wy / 3, 21) - 0.5) * 1.4) return null;   // the sward takes the edge back
    const crown = 1.3 + (fbm(wx / 9, wy / 9, 22) - 0.5) * 1.2;
    if (n.d < crown && fbm(wx / 11, wy / 11, 23) > 0.55 && bay(gx, gy) < 0.85) return null;             // a grassy hump here and there
    if (fbm(wx / 6, wy / 6, 24) > 0.74 && j < 0.7) return null;                                         // grass coming back in patches
    const m = fbm(wx / 5, wy / 5, 3);
    let k = m < 0.35 ? 3 : m < 0.68 ? 4 : 5;
    if (j < 0.06) k--; else if (j > 0.95) k++;
    if (Math.abs(n.d - hw * 0.5 - (fbm(wx / 15, wy / 15, 25) - 0.5) * 1.6) < 0.9 && fbm(wx / 8, wy / 8, 26) > 0.35) k--;   // two tracks, kept bare
    if (side > 0.25 && edge < 1.3) k--;                                                                  // barely sunk
    return P.dust[clampK(k, 0, 6)];
  }
  // level 2: the packed-earth road (as built in 136)
  function pix2(n, w, wx, wy, gx, gy, j, side) {
    const edge = w - n.d, hw = LV[2].hw;
    const m = fbm(wx / 5, wy / 5, 3);
    let k = m < 0.34 ? 2 : m < 0.67 ? 3 : 4;
    if (j < 0.05) k--; else if (j > 0.96) k++;
    // two ruts that wander a little and fade in and out — feet and sledges, never rails
    const rd = n.d - (hw * 0.45 + (fbm(wx / 14, wy / 14, 8) - 0.5) * 2.2), rutOn = fbm(wx / 7, wy / 7, 4) > 0.4;
    if (rutOn && Math.abs(rd) < 0.75) k = Math.min(k, j > 0.3 ? 1 : 0);
    else if (rutOn && rd >= 0.75 && rd < 1.4 && j < 0.6) k = Math.min(6, k + 1);   // the rut's lit outer lip
    // the banks: shadow under the north-west one, a lit lip on the south-east
    if (side > 0.25 && edge < 1.4) k = 0;
    else if (side > 0.25 && edge < 3 && bay(gx, gy) < 0.6) k = Math.max(1, k - 1);
    else if (side < -0.25 && edge < 1.0) k = 5 + (j > 0.5 ? 1 : 0);
    // a grassy crown down the middle in places
    if (n.d < 2.2 && fbm(wx / 8, wy / 8, 5) > 0.52 && j < 0.6) return P.grass[j < 0.2 ? 1 : 2];
    return P.earth[clampK(k, 0, 6)];
  }
  // level 3: the via. Its slabs are a Voronoi of a jittered world lattice, so a
  // slab never knows the tile it lies in.
  const VS = 5.4;
  function vor(wx, wy) {
    const gx0 = Math.floor(wx / VS), gy0 = Math.floor(wy / VS);
    let f1 = 1e9, f2 = 1e9, fx = 0, fy = 0, id = 0;
    for (let yy = gy0 - 1; yy <= gy0 + 1; yy++) for (let xx = gx0 - 1; xx <= gx0 + 1; xx++) {
      const px = (xx + 0.12 + hx(xx, yy, 41) * 0.76) * VS, py = (yy + 0.12 + hx(xx, yy, 42) * 0.76) * VS;
      const d = Math.hypot(wx - px, wy - py);
      if (d < f1) { f2 = f1; f1 = d; fx = px; fy = py; id = xx * 7349 + yy * 31; } else if (d < f2) f2 = d;
    }
    return { e: f2 - f1, fx, fy, id };
  }
  const along = (n, wx, wy) => {
    const s = n.seg; if (!s) return wx;
    if (s[6]) return Math.atan2(wy - s[1], wx - s[0]) * 9;
    return s[1] === s[3] ? wx : wy;
  };
  function pix3(n, w, wx, wy, gx, gy, j, side) {
    const edge = w - n.d;
    if (edge < 1.7) {                                    // the gravel shoulder, frayed into the sward
      if (edge < 0.75 && bay(gx, gy) > edge / 0.75) return null;
      const r = hx(gx, gy, 71);
      return r < 0.32 ? P.slab[r < 0.1 ? 5 : r < 0.2 ? 4 : 3] : P.dust[r < 0.62 ? 2 : r < 0.85 ? 3 : 1];
    }
    if (edge < 3.8) {                                    // the kerb: long dressed blocks set on edge
      if (edge < 2.15) return P.kerb[0];                 // its outer face, in shadow
      if (edge > 3.4) return P.slab[0];                  // the joint with the paving
      const a = along(n, wx, wy) + (side > 0 ? 0 : 2.9), L = 6.4, blk = Math.floor(a / L);
      if (a - blk * L < 0.55) return P.kerb[1];          // a joint between blocks
      const b = hx(blk, side > 0 ? 1 : 2, 72);
      let k = b < 0.3 ? 2 : b < 0.8 ? 3 : 4;
      if (edge > 3.0) k++;                               // the arris catches the light
      if (j > 0.93) k++; else if (j < 0.07) k--;
      return P.kerb[clampK(k, 1, 5)];
    }
    const v = vor(wx, wy);
    if (v.e < 0.8) return P.slab[v.e < 0.42 ? 0 : 1];    // the mortar
    let k = 2 + Math.floor(hx(v.id, 0, 73) * 3);         // each slab its own grey
    if (v.e < 1.8) k += ((v.fx - wx) + (v.fy - wy)) > 0 ? 1 : -1;   // lit on its north-west edge
    if (Math.abs(n.d - 3.5) < 0.6 && fbm(wx / 9, wy / 9, 74) > 0.32) k--;   // two cart ruts worn into the stone
    if (j < 0.05) k--; else if (j > 0.97) k++;
    return P.slab[clampK(k, 1, 6)];
  }

  // the road's own ground, at a level
  function surface(tx, ty, extra, lv, kk) {
    lv = lv || Rd.level(); kk = kk || K;
    const T_ = TL(), C = T_ * kk, segs = segsAround(tx, ty, 1, extra);
    const cv = document.createElement('canvas'); cv.width = C; cv.height = C;
    const id = new ImageData(C, C), A = id.data;
    const set = (cx, cy, c) => { const i = (cy * C + cx) * 4; A[i] = c[0]; A[i + 1] = c[1]; A[i + 2] = c[2]; A[i + 3] = 255; };
    const pix = lv === 1 ? pix1 : lv === 3 ? pix3 : pix2;
    for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
      const wx = tx * T_ + (cx + 0.5) / kk, wy = ty * T_ + (cy + 0.5) / kk, gx = tx * C + cx, gy = ty * C + cy;
      const n = near(segs, wx, wy), w = width(lv, wx, wy);
      if (n.d >= w) continue;
      const side = n.d > 0.01 ? (-(wx - n.qx) - (wy - n.qy)) / (n.d * 1.414) : 0;   // > 0: the north-west half
      const c = pix(n, w, wx, wy, gx, gy, hx(gx, gy, 7), side);
      if (c) set(cx, cy, c);
    }
    // pebbles trodden into the earth roads
    if (lv < 3 && kk === K) for (let py = 1; py < C - 2; py += 6) for (let px = 1; px < C - 2; px += 6) {
      const gx = tx * C + px, gy = ty * C + py, r = hx(gx, gy, 31);
      if (r > (lv === 1 ? 0.07 : 0.12)) continue;
      const ox = px + Math.floor(hx(gx, gy, 32) * 4), oy = py + Math.floor(hx(gx, gy, 33) * 4);
      const wx = tx * T_ + ox / K, wy = ty * T_ + oy / K, n = near(segs, wx, wy);
      if (n.d > width(lv, wx, wy) - (lv === 1 ? 3 : 2)) continue;
      const big = r < 0.04;
      for (let yy = 0; yy < (big ? 3 : 2); yy++) for (let xx = 0; xx < (big ? 3 : 2); xx++) {
        if (ox + xx >= C || oy + yy >= C) continue;
        set(ox + xx, oy + yy, P.stone[yy === 0 && xx === 0 ? 5 : yy === (big ? 2 : 1) ? 1 : 3]);
      }
    }
    cv.getContext('2d').putImageData(id, 0, 0);
    return cv;
  }

  // the decor at a road's edges: tufts and weeds breaking it, bushes beside it, a stone on it
  function blob(L, cx, cy, rx, ry, pal, s) {
    const cells = [], seen = new Set();
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, lump = (hx(Math.round(Math.atan2(dy, dx) * 3), s, 7) - 0.5) * 0.4;
      if (dx * dx + dy * dy <= 1 + lump) { cells.push([x, y, dx, dy]); seen.add(x + ',' + y); }
    }
    for (const [x, y, dx, dy] of cells) {
      const edge = !seen.has((x + 1) + ',' + y) || !seen.has((x - 1) + ',' + y) || !seen.has(x + ',' + (y + 1)) || !seen.has(x + ',' + (y - 1));
      const lit = -dx * 0.6 - dy * 0.8;
      let k = lit > 0.55 ? 4 : lit > 0.15 ? 3 : lit > -0.3 ? 2 : 1;
      const j = hx(x + s * 31, y, s);
      if (j < 0.18) k = Math.min(pal.length - 1, k + 1); else if (j > 0.86) k = Math.max(1, k - 1);
      if (edge && (dy > -0.2 || dx > 0.3)) k = 0;
      L.put(x, y, pal[k]);
    }
  }
  function tuft(L, x, y, h, s, seedHead) {
    const n = 3 + Math.floor(hx(s, 1, 3) * 3);
    for (let k = 0; k < n; k++) {
      const lean = (k - (n - 1) / 2) * 0.5 + (hx(s, k, 5) - 0.5) * 0.6, hh = h * (0.6 + hx(s, k, 6) * 0.45), off = (k - (n - 1) / 2) * 0.6;
      for (let t = 0; t <= hh; t++) { const f = t / hh; L.put(Math.round(x + lean * t * 0.55 + off), Math.round(y - t), P.grass[f < 0.3 ? 0 : f < 0.65 ? 2 : f < 0.9 ? 4 : 5]); }
      if (seedHead && k % 2 === 0) { const px = Math.round(x + lean * hh * 0.55 + off), py = Math.round(y - hh) - 1; L.put(px, py, P.seed[1]); L.put(px, py - 1, P.seed[2]); }
    }
  }
  function weed(L, x, y, s) {
    const c = P.petal[hx(s, 4, 4) < 0.5 ? 0 : 1];
    L.put(x, y, P.grass[1]); L.put(x, y - 1, P.grass[2]); L.put(x - 1, y - 1, P.grass[3]); L.put(x + 1, y - 2, P.grass[2]);
    L.put(x, y - 2, c); L.put(x + 1, y - 3, c);
  }
  // a Roman milestone beside the via: a squat column, its inscription, its shadow
  function milestone(L, x, y) {
    x = Math.round(x); y = Math.round(y);
    for (let k = 0; k < 4; k++) L.put(x + 3 + k, y + 1, P.grass[0]);                 // shadow, cast south-east
    for (let k = 0; k < 3; k++) L.put(x + 4 + k, y, P.grass[0]);
    for (let yy = -12; yy <= 0; yy++) for (let xx = -3; xx <= 3; xx++) {
      if (yy === -12 && Math.abs(xx) > 1) continue;
      if (yy === -11 && Math.abs(xx) > 2) continue;
      const edge = Math.abs(xx) === 3 || yy === 0 || (yy === -12) || (yy === -11 && Math.abs(xx) === 2);
      let k = xx <= -2 ? 4 : xx <= 0 ? 3 : xx === 1 ? 2 : 1;
      if (yy <= -10) k = Math.min(5, k + 1);
      if (edge && (xx >= 1 || yy === 0)) k = 0;
      L.put(x + xx, y + yy, P.kerb[k]);
    }
    for (const [xx, yy] of [[-1, -7], [0, -7], [1, -7], [-1, -5], [1, -5], [0, -4]]) L.put(x + xx, y + yy, P.kerb[1]);   // the miles, cut in
  }
  const MRG = 16;                                       // decor margin, world px
  function decor(tx, ty, lv, extra) {
    lv = lv || Rd.level();
    const T_ = TL(), C = T_ * K, M = MRG * K, S_ = C + 2 * M;
    const A = new Uint8ClampedArray(S_ * S_ * 4);
    const L = { put(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S_ || y >= S_) return; const i = (y * S_ + x) * 4; A[i] = c[0]; A[i + 1] = c[1]; A[i + 2] = c[2]; A[i + 3] = 255; } };
    const lk = extra || link;
    const segs = segsAround(tx, ty, 2, extra);
    const joins = segs.filter(s => s[4] === tx && s[5] === ty && !s[6]).length;
    // a world lattice every 4 px, jittered; each candidate belongs to the tile of the skeleton nearest it
    const x0 = tx * T_ - MRG, y0 = ty * T_ - MRG, x1 = (tx + 1) * T_ + MRG, y1 = (ty + 1) * T_ + MRG;
    for (let gy = Math.floor(y0 / 4); gy <= Math.floor(y1 / 4); gy++) for (let gx = Math.floor(x0 / 4); gx <= Math.floor(x1 / 4); gx++) {
      const r = hx(gx, gy, 51); if (r > 0.6) continue;
      const wx = gx * 4 + hx(gx, gy, 52) * 4, wy = gy * 4 + hx(gx, gy, 53) * 4;
      const n = near(segs, wx, wy);
      if (!n.seg || n.seg[4] !== tx || n.seg[5] !== ty) continue;
      const ctx_ = Math.floor(wx / T_), cty = Math.floor(wy / T_);
      if (!extra) {
        if (!MapGen.onBoard(ctx_, cty)) continue;
        const ct = S.map.terrain[cty * CFG.W + ctx_];
        if (!lk(ctx_, cty) && ct !== T.GRASS) continue;              // never over water, a wood or rock
        if (!lk(ctx_, cty) && Bld.at(ctx_, cty)) continue;           // nor under a building
      }
      const w = width(lv, wx, wy), d = n.d, px = (wx - x0) * K, py = (wy - y0) * K, s = gx * 7919 + gy;
      if (lv === 1) {                                     // the sward is winning: tufts everywhere at its edges
        if (d > w - 2.6 && d < w + 1.2) { if (r < 0.42) tuft(L, px, py, 4 + hx(gx, gy, 54) * 5, s, r < 0.14); }
        else if (d >= w + 1.2 && d < w + 7) {
          if (r < 0.04 && joins <= 2) bush(L, px, py, 5 + hx(gx, gy, 55) * 4, s);
          else if (r < 0.12) weed(L, px, py, s);
          else if (r < 0.24) tuft(L, px, py, 6 + hx(gx, gy, 56) * 5, s, true);
        } else if (d < 2.4 && r < 0.12) tuft(L, px, py, 3 + hx(gx, gy, 57) * 3, s, false);
        else if (d < w - 3 && r < 0.03) tuft(L, px, py, 3, s, false);
      } else if (lv === 3) {                              // a kept road: grass only at the shoulder, a milestone now and then
        if (d > w - 1.3 && d < w + 1.2) { if (r < 0.24) tuft(L, px, py, 3 + hx(gx, gy, 54) * 4, s, r < 0.06); }
        else if (d >= w + 2.2 && d < w + 3.4 && r < 0.012 && joins <= 2) milestone(L, px, py);
        else if (d >= w + 1.2 && d < w + 7) {
          if (r < 0.03 && joins <= 2) bush(L, px, py, 6 + hx(gx, gy, 55) * 4, s);
          else if (r < 0.07) weed(L, px, py, s);
          else if (r < 0.15) tuft(L, px, py, 6 + hx(gx, gy, 56) * 5, s, true);
        }
      } else {
        if (d > w - 1.6 && d < w + 1.2) { if (r < 0.34) tuft(L, px, py, 5 + hx(gx, gy, 54) * 5, s, r < 0.1); }
        else if (d >= w + 1.2 && d < w + 7) {
          if (r < 0.035 && joins <= 2) bush(L, px, py, 6 + hx(gx, gy, 55) * 4, s);
          else if (r < 0.1) weed(L, px, py, s);
          else if (r < 0.2) tuft(L, px, py, 6 + hx(gx, gy, 56) * 5, s, true);
        } else if (d < 2 && r < 0.05) tuft(L, px, py, 4, s, false);
        else if (d < w - 3 && r < 0.012) blob(L, px, py - 2, 3.2, 2.2, P.stone, s);
      }
    }
    // cut to what it holds
    let bx0 = S_, by0 = S_, bx1 = -1, by1 = -1;
    for (let y = 0; y < S_; y++) for (let x = 0; x < S_; x++) if (A[(y * S_ + x) * 4 + 3]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 < 0) return null;
    const w = bx1 - bx0 + 1, h = by1 - by0 + 1, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const id = new ImageData(w, h);
    for (let y = 0; y < h; y++) id.data.set(A.subarray(((y + by0) * S_ + bx0) * 4, ((y + by0) * S_ + bx1 + 1) * 4), y * w * 4);
    cv.getContext('2d').putImageData(id, 0, 0);
    return { cv, x: x0 + bx0 / K, y: y0 + by0 / K, w: w / K, h: h / K };
  }
  function bush(L, x, y, r, s) {
    const pal = hx(s, 2, 2) < 0.5 ? P.bush : P.bush2;
    blob(L, x, y - r * 0.72, r, r * 0.78, pal, s);
    blob(L, x - r * 0.45, y - r * 0.95, r * 0.62, r * 0.55, pal, s + 1);
  }
  // a site coming up: the turf cut and the road showing through in stages, with its stakes
  function siteLook(tx, ty, stage, lv) {
    lv = lv || Rd.level();
    const T_ = TL(), C = T_ * K, base = surface(tx, ty, null, lv);
    const g = base.getContext('2d'), id = g.getImageData(0, 0, C, C), A = id.data;
    const keep = [0.22, 0.55, 0.85][stage];
    for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
      const i = (cy * C + cx) * 4; if (!A[i + 3]) continue;
      const v = fbm((tx * C + cx) / 7, (ty * C + cy) / 7, 61) * 0.7 + hx(tx * C + cx, ty * C + cy, 62) * 0.3;
      if (v > keep) A[i + 3] = 0;
    }
    // stakes at the road's two edges, across its run
    const segs = segsAround(tx, ty, 0), horiz = segs.some(s => s[1] === s[3]);
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= C || y >= C) return; const i = (y * C + x) * 4; A[i] = c[0]; A[i + 1] = c[1]; A[i + 2] = c[2]; A[i + 3] = 255; };
    const stake = (sx, sy) => { for (let y = 0; y < 9; y++) { put(sx, sy - y, P.stake[y < 2 ? 0 : 1]); put(sx + 1, sy - y, P.stake[y < 2 ? 0 : 2]); } };
    const off = Math.min(C / 2 - 3, Math.round(LV[lv].hw * K + 2)), mid = C / 2;
    if (horiz) { stake(mid - 1, mid - off + 8); stake(mid - 1, mid + off + 4 > C - 1 ? C - 1 : mid + off + 4); }
    else { stake(mid - off - 1, mid + 4); stake(mid + off - 1, mid + 4); }
    g.putImageData(id, 0, 0);
    return base;
  }

  // ---- the cache and the draw ------------------------------------------------------
  // what a tile's picture depends on: the roads and sites round it, its stage, and the hall's level
  function sig(tx, ty, stage, lv) {
    let s = '';
    for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
      const gv = Rd._gr && MapGen.inB(x, y) && Rd._gr.get(y * CFG.W + x);
      s += Rd.at(x, y) ? 'r' : Rd.siteAt(x, y) ? 's' : gv ? (gv === 'a' ? 'a' : gv[0]) : '.';
    }
    return s + stage + lv;
  }
  function entry(tx, ty, stage, budget, lv, must) {
    const i = ty * CFG.W + tx, k = sig(tx, ty, stage, lv);
    let e = Rd._c.get(i);
    if (e && e.k === k) { Rd._c.delete(i); Rd._c.set(i, e); return e; }      // most recently used last
    if (budget.left <= 0 && e && !must) return e;                            // stale but drawn while it waits
    if (budget.left <= 0 && !must) return null;
    const t0 = performance.now();
    try {
      e = { k, surf: stage < 3 ? siteLook(tx, ty, stage, lv) : surface(tx, ty, null, lv), dec: stage < 3 ? null : decor(tx, ty, lv) };
    } catch (err) { return null; }                                           // a painter stands down rather than throwing
    budget.left -= performance.now() - t0;
    Rd._c.set(i, e);
    while (Rd._c.size > Rd.CACHE_MAX) Rd._c.delete(Rd._c.keys().next().value);
    return e;
  }
  const blit = (g, cv, x, y, w, h) => { const s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(cv, x, y, w, h); g.imageSmoothingEnabled = s; };
  // every road and road site in view: all the ground first, then all the decor over it
  Rd.draw = function (g) {
    if (!Rd.on() || !S.map) return;
    Rd.count();
    const v = R.viewTiles(), T_ = TL(), lv = Rd.level();
    const x0 = Math.max(1, Math.floor(v.x0) - 1), y0 = Math.max(1, Math.floor(v.y0) - 1);
    const x1 = Math.min(CFG.W - 2, Math.ceil(v.x1) + 1), y1 = Math.min(CFG.H - 2, Math.ceil(v.y1) + 1);
    const m = S.map.roads || {}, budget = { left: Rd.BUDGET_MS }, decs = [];
    const gr = Rd._gr = Rd.gateRoads();
    const sites = S.buildings.filter(b => b.key === 'road' && b.construction > 0 && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1);
    const siteSet = new Set(sites.map(b => b.y * CFG.W + b.x));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * CFG.W + x;
      if (!S.map.explored[i]) continue;
      let stage;
      if (siteSet.has(i)) {
        const b = Bld.at(x, y), tot = (Bld.lv(b) && Bld.lv(b).time) || 1, p = Math.max(0, Math.min(1, 1 - b.construction / tot));
        stage = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      } else if ((m[i] && S.map.terrain[i] === T.GRASS) || gr.has(i)) stage = 3;
      else continue;
      // a gate's road and its aprons are never left to the budget: a few
      // tiles, and a passage must not open onto grass for a frame
      const e = entry(x, y, stage, budget, lv, gr.has(i));
      if (!e) continue;
      blit(g, e.surf, x * T_, y * T_, T_, T_);
      if (e.dec) decs.push(e.dec);
    }
    for (const d of decs) blit(g, d.cv, d.x, d.y, d.w, d.h);
    Rd._gr = null;
  };
  // the line being dragged: the road's plan, joined along the chain, green where it can go
  Rd.drawGhost = function (g, ghost) {
    const T_ = TL(), set = new Set(ghost.map(t => t.x + ',' + t.y));
    const on = (x, y) => set.has(x + ',' + y) || Rd.at(x, y);
    const h = Math.round(LV[Rd.level()].hw);
    for (const t of ghost) {
      const cx = t.x * T_ + T_ / 2, cy = t.y * T_ + T_ / 2;
      g.fillStyle = t.ok ? 'rgba(126,96,62,0.82)' : 'rgba(150,62,48,0.7)';
      g.fillRect(cx - h, cy - h, 2 * h, 2 * h);
      if (on(t.x, t.y - 1)) g.fillRect(cx - h, t.y * T_, 2 * h, T_ / 2 - h);
      if (on(t.x, t.y + 1)) g.fillRect(cx - h, cy + h, 2 * h, T_ / 2 - h);
      if (on(t.x - 1, t.y)) g.fillRect(t.x * T_, cy - h, T_ / 2 - h, 2 * h);
      if (on(t.x + 1, t.y)) g.fillRect(cx + h, cy - h, T_ / 2 - h, 2 * h);
      g.fillStyle = t.ok ? 'rgba(172,140,96,0.9)' : 'rgba(224,101,80,0.9)';
      g.fillRect(cx - 1, cy - 1, 2, 2);
    }
  };
  /* THE BUILD MENU'S CARD, ONE PER LEVEL: a scrap of meadow with the real road
     painter's own road turning across it — the worn track, the earth road or the
     via, whichever the hall's level lays — and beside it a signpost (a
     milestone on the via). UI.menuIconLevel reads Rd.level, so the card
     follows the hall like the roads do. */
  Rd.icon = function (lv) {
    const C = 64, T_ = TL(), TX = 3000 + lv * 9, TY = 3000, SC = 1.3;   // world px a card pixel
    // a road coming up from the south and turning east, its bend at (29, 31) of the card
    const on = new Set([[TX, TY], [TX, TY + 1], [TX, TY + 2], [TX + 1, TY], [TX + 2, TY]].map(p => p + ''));
    const ex = (x, y) => on.has(x + ',' + y), segs = segsAround(TX, TY, 2, ex);
    const ox = TX * T_ + T_ / 2 - 29.5 * SC, oy = TY * T_ + T_ / 2 - 31.5 * SC;
    const id = new ImageData(C, C), A = id.data;
    const put = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= C || y >= C) return; const i = (y * C + x) * 4; A[i] = c[0]; A[i + 1] = c[1]; A[i + 2] = c[2]; A[i + 3] = 255; };
    const inPatch = (x, y) => { const dx = x - 31.5, dy = y - 31.5, t = Math.atan2(dy, dx); return Math.hypot(dx, dy) < 29.6 + (hx(Math.round(t * 7), 0, 91) - 0.5) * 2.2; };
    const pix = lv === 1 ? pix1 : lv === 3 ? pix3 : pix2;
    const edgeAt = [];
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      if (!inPatch(x, y)) { if (y > 34 && (inPatch(x, y - 1) || inPatch(x, y - 2))) put(x, y, P.bush[0]); continue; }
      const wx = ox + (x + 0.5) * SC, wy = oy + (y + 0.5) * SC, n = near(segs, wx, wy), w = width(lv, wx, wy);
      if (n.d < w) {
        const side = n.d > 0.01 ? (-(wx - n.qx) - (wy - n.qy)) / (n.d * 1.414) : 0;
        const c = pix(n, w, wx, wy, x, y, hx(x, y, 7), side);
        if (c) { put(x, y, c); continue; }
      } else if (n.d < w + 1.4) edgeAt.push([x, y]);
      const f = fbm(x / 5, y / 5, 92), j = hx(x, y, 93);
      let k = f < 0.4 ? 2 : f < 0.68 ? 3 : 4; if (j < 0.1) k--; else if (j > 0.93) k++;
      if (!inPatch(x - 1, y - 1)) k = 5;                                  // the patch's lit north-west rim
      else if (!inPatch(x + 1, y + 1)) k = 1;
      put(x, y, P.grass[clampK(k, 0, 5)]);
    }
    const L = { put(x, y, c) { if (inPatch(x | 0, y | 0)) put(x, y, c); } };
    // tufts breaking the road's edges, a weed, a bush up in the far corner
    for (const [x, y] of edgeAt) { const r = hx(x, y, 94); if (r < (lv === 3 ? 0.07 : 0.11)) tuft(L, x, y, 2.5 + r * 12, x * 31 + y, false); }
    weed(L, 50, 50, 5); weed(L, 14, 47, 9);
    bush(L, 50, 16, 4.6, 11);
    // beside the bend: a fingerpost, two arms at level 2, a milestone on the via
    const sx = 15, sy = 27;
    for (let k = 1; k < 5; k++) L.put(sx + k, sy + 1, P.grass[0]);                     // its shadow
    if (lv === 3) {
      for (let yy = -9; yy <= 0; yy++) for (let xx = -2; xx <= 2; xx++) {
        if (yy === -9 && Math.abs(xx) === 2) continue;
        let k = xx <= -1 ? 4 : xx === 0 ? 3 : 2; if (yy <= -8) k = 5;
        if (xx === 2 || yy === 0 || (yy === -9 && xx === 1)) k = 0;
        L.put(sx + xx, sy + yy, P.kerb[k]);
      }
      for (const [xx, yy] of [[-1, -6], [0, -6], [-1, -4], [0, -3]]) L.put(sx + xx, sy + yy, P.kerb[1]);
    } else {
      for (let yy = -13; yy <= 0; yy++) { L.put(sx, sy + yy, P.stake[1]); L.put(sx + 1, sy + yy, P.stake[0]); }
      L.put(sx, sy - 14, P.stake[2]);
      const arm = (y, dir) => {
        for (let xx = 0; xx < 7; xx++) for (let yy = 0; yy < 3; yy++) {
          if (xx === 6 && yy !== 1) continue;                                          // the pointed end
          L.put(dir > 0 ? sx + 2 + xx : sx - 1 - xx, y + yy, yy === 0 ? P.stake[2] : yy === 2 ? P.stake[0] : P.stake[1]);
        }
      };
      arm(sy - 13, 1);
      if (lv === 2) arm(sy - 9, -1);
    }
    const cv = document.createElement('canvas'); cv.width = C; cv.height = C;
    cv.getContext('2d').putImageData(id, 0, 0);
    return cv;
  };
  return Rd;
})();
window.Roads = Roads;
// the Road card in the build menu: one picture per level of the hall (UI.menuIconLevel)
try { if (typeof Sprites !== 'undefined' && Sprites.building && !Sprites.building.road) { const ic = [1, 2, 3].map(l => Roads.icon(l)); Sprites.building.road = ic; if (Sprites.buildingA) Sprites.buildingA.road = ic; } } catch (e) {}
