"use strict";
/* Procedurally drawn pixel-art sprites. Everything is generated on a 16x16
   logical grid scaled x2 onto 32x32 canvases at boot — no image files. */

const Sprites = {
  terrain: {},   // terrain[t] = [canvas, ...variants]
  building: {},  // building[key] = [lv1, lv2, lv3]
  unit: {},      // unit[kind] = { pose: [frames] }
  icons: {},
  misc: {},
};

(function () {
  // Legacy alias table — every entry references the ART master palette, so
  // older drawing code stays palette-compliant. New art should use ART directly.
  const APx = ART.PALETTE;
  const PAL = {
    grass: APx.grass[3], grassD: APx.grass[2], grassL: APx.grass[4],
    soil: APx.soil[2], soilD: APx.soil[1], sprout: APx.grass[4],
    water: APx.water[2], waterL: APx.water[3],
    rock: APx.stone[2], rockD: APx.stone[1], rockL: APx.stone[3],
    trunk: APx.wood[1], leaf: APx.leaf[1], leafL: APx.leaf[3],
    wood: APx.wood[3], woodD: APx.wood[2], thatch: APx.thatch[2], thatchD: APx.thatch[1],
    stone: APx.stone[2], stoneD: APx.stone[1],
    gold: APx.gold[2], fire: APx.fire[1], fireL: APx.fire[2],
    skin: APx.skin[2], hair: APx.hair[1],
    P: APx.blue[2], PD: APx.blue[1],        // player accent (blue)
    A: APx.red[2], AD: APx.red[1],          // rival accent (red)
    R: APx.rust[1], RD: APx.rust[0],        // barbarian (dark)
    wolf: APx.pelt[2], wolfD: APx.pelt[1],
    boar: APx.hide[2], boarD: APx.hide[1],
    white: APx.bone[2], red: APx.red[2], dark: APx.ink[0],
  };

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // returns a canvas + a plot fn working on the 16-grid (2px per cell). `p.f`
  // exposes the FINE 32-grid (1px per cell) — the same fine-detail technique the
  // buildings use via `p.hi`, giving terrain true 2× density with no memory cost
  // (the tile stays a 32px canvas, so the pre-composited terrainCache is unchanged).
  function tile(draw) {
    const c = mk(32, 32), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    p.f = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, (w || 1), (h || 1)); };
    p.g = g;
    draw(p, g);
    return c;
  }
  function frames(n, draw) {
    const out = [];
    for (let f = 0; f < n; f++) out.push(tile((p, g) => draw(p, g, f)));
    return out;
  }
  // HI-RES unit canvas: 64×64 with a plotter on the 32-grid (2px/cell) — DOUBLE the
  // density of the legacy 16-grid unit, the same fine-grid technique used for the
  // buildings. render.js draws every unit into a 32px (TILE) box, so a 64px sheet
  // shows at the SAME on-screen size as a 32px one — just with 2× the pixels.
  function tileU(draw) {
    const c = mk(64, 64), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const q = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    q.g = g;
    draw(q, g);
    return c;
  }
  // ow = outline width in canvas px (villager uses 2; military/naval use a slightly
  // thinner 1 for a lighter dark edge, per the art direction).
  function framesU(n, draw, ow) {
    const out = [];
    for (let f = 0; f < n; f++) { const c = tileU((q, g) => draw(q, g, f)); ART.outline(c, ow || 2); out.push(c); }
    return out;
  }
  // HIGH-RES building canvas: 64×64 (double the pixels of a normal tile). The
  // coarse plotter `p` still works on the 16-grid (4px/cell) so every existing
  // building draw renders unchanged — just crisper — while `p.hi` exposes a
  // 32-grid (2px/half-cell) for the finer detail L2/L3 and the work-site carry.
  function tileB(draw, size) {
    size = size || 64;
    const cell = size / 16, half = size / 32;   // 16-grid coarse / 32-grid fine
    const c = mk(size, size), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * cell, y * cell, (w || 1) * cell, (h || 1) * cell); };
    p.hi = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * half, y * half, (w || 1) * half, (h || 1) * half); };
    p.g = g;
    draw(p, g);
    return c;
  }
  // deterministic speckle
  function speckle(p, seed, n, col) {
    let s = seed;
    const r = () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) p(1 + (r() * 14) | 0, 1 + (r() * 14) | 0, 1, 1, col);
  }

  /* ---------------- terrain (built on ART — see ARTSTYLE.md) ---------------- */
  const AP = ART.PALETTE;

  // A calm, even, carpet/felt turf. The base is a FLAT uniform mid-green — every
  // grass tile carries the exact same average tone, so there is no per-tile tone
  // step for the eye to read as a quilt. The only texture is a sparse, near-tone
  // felt grain; the pattern that actually breaks the tile grid is driven from
  // WORLD position in render.js (drawTile), so no two tiles share it. This just
  // provides the flat bed and a whisper of baked grain.
  function grassBase(p, seed) {
    p.f(0, 0, 32, 32, AP.grass[2]);                      // flat, uniform felt — identical every tile
  }
  Sprites.terrain[T.GRASS] = [tile(p => grassBase(p, 3))];
  // rare flower meadows — drawTile rolls these on ~3% of grass tiles
  function flowers(p, seed) {
    grassBase(p, seed);
    const f = p.f, r = ART.rng(seed + 1);
    for (let i = 0; i < 7; i++) {
      const x = 2 + (r() * 27) | 0, y = 2 + (r() * 27) | 0;
      const col = AP.bloom[(r() * 3) | 0];
      f(x, y - 2, 1, 2, AP.grass[1]);                    // stem
      f(x, y, 1, 1, col); f(x - 1, y, 1, 1, col === AP.bloom[2] ? AP.bloom[1] : col);
      f(x + 1, y, 1, 1, col); f(x, y - 1, 1, 1, AP.bloom[3]);   // petals + lit centre
    }
  }
  Sprites.terrainRare = { [T.GRASS]: [tile(p => flowers(p, 301)), tile(p => flowers(p, 407))] };

  const LEAF_D = [AP.leaf[0], AP.leaf[0], AP.leaf[1], AP.leaf[2], AP.leaf[3]];   // shade tree
  const LEAF_L = [AP.leaf[1], AP.leaf[2], AP.leaf[3], AP.leaf[4], AP.leaf[4]];   // sunlit tree
  // ONE tree, drawn to stay READABLE even when packed tight: a trunk, a rounded
  // crown, a DARK underside rim (the key — it rings the bottom of every crown so
  // neighbouring trees never merge into a blob), a sunlit top-left cap and a top
  // glint. Trees are drawn back-to-front so front trunks/rims overlap the crowns
  // behind, exactly like a real stand seen from above.
  function tree(f, cx, cy, rr, ramp) {
    f(cx - 1, cy + rr + 1, 4, 1, AP.grass[0]); f(cx, cy + rr + 2, 2, 1, AP.grass[0]);   // tight ground shadow on the grass
    f(cx, cy + rr - 2, 2, 5, AP.wood[1]); f(cx, cy + rr - 2, 1, 5, AP.wood[2]);   // trunk
    ART.shadedCircle(f, cx, cy, rr, ramp, 2);                            // crown body
    for (let a = 0.4; a <= 2.75; a += 0.28)                             // dark underside rim -> separation
      f((cx + Math.cos(a) * rr) | 0, (cy + Math.sin(a) * rr) | 0, 1, 1, ramp[0]);
    ART.shadedCircle(f, cx - 1, cy - 1, Math.max(1, (rr * 0.5) | 0), ramp, 3);    // sunlit cap
    f(cx - (rr * 0.4 | 0), cy - rr, 1, 1, AP.leaf[4]);                  // crown glint
  }
  const leafPick = r => { const u = r(); return u < 0.32 ? LEAF_D : u > 0.8 ? LEAF_L : AP.leaf; };
  // FOREST at three densities (level 0 sparse / 1 medium / 2 dense). Trees sit
  // directly ON the grass — NO tile-shaped floor tint (that printed hard square
  // corners) — so the grass shows between them and the wood reads as trees on a
  // continuous lawn. Crowns are placed on a jittered grid that STRADDLES every
  // tile edge, so foliage from both sides buries the boundary and neighbouring
  // tiles blend with no visible seam. Density = tree count (sparse edge -> dense
  // core), chosen per tile in render.js from how enclosed it is.
  function forestTile(p, seed, level) {
    const f = p.f, r = ART.rng(seed | 1);
    const trees = [];
    if (level === 2) {
      // DENSE interior only (used when a tile is fully surrounded by forest): a
      // straddling grid whose crowns overhang every edge. Half-cut trees are fine
      // here — every edge abuts more forest that covers them.
      const step = 10, rad = 5, drop = 0.24;
      for (let gy = 0, row = 0; gy <= 32; gy += step, row++)
        for (let gx = (row & 1) ? 5 : 0; gx <= 32; gx += step) {
          if (r() < drop) continue;
          trees.push([gx + ((r() * 5) | 0) - 2, gy + ((r() * 5) | 0) - 2, rad + (r() * 2 | 0), leafPick(r)]);
        }
    } else {
      // EDGE tiles (sparse fringe / medium perimeter): every tree FULLY CONTAINED
      // within the tile (crown may touch an edge but is never cut), so the forest's
      // visible border always shows whole trees on grass — never a half tree.
      const n = level === 1 ? 7 + (r() * 3 | 0) : 1 + (r() * 3 | 0);   // medium packs a fuller clump
      for (let i = 0; i < n; i++) {
        const rr = 5 + (r() * 2 | 0);
        const cx = rr + (r() * (32 - 2 * rr)) | 0;                     // crown fits in [0,31] (may touch, never cut)
        const cy = rr + (r() * (30 - 2 * rr)) | 0;                     // crown + trunk fit in [0,31]
        trees.push([cx, cy, rr, leafPick(r)]);
      }
    }
    trees.sort((a, b) => a[1] - b[1]);
    for (const [cx, cy, rr, ramp] of trees) tree(f, cx, cy, rr, ramp);
  }
  // CHARACTER tiles — one-offs sprinkled rarely deep in the wood for flavour: a
  // fallen mossy log, a logged clearing of cut stumps, an overgrown bramble patch.
  function forestChar(p, seed, kind) {
    const f = p.f, r = ART.rng(seed | 1);
    const ring = [[2, 3], [16, 1], [30, 4], [1, 18], [31, 20], [4, 30], [18, 31], [30, 30]];  // trees straddling edges frame the feature
    for (const [gx, gy] of ring) { if (r() < 0.2) continue; tree(f, gx + ((r() * 3) | 0), gy + ((r() * 3) | 0), 5 + (r() * 2 | 0), leafPick(r)); }
    if (kind === 'log') {
      f(9, 18, 15, 3, AP.wood[1]); f(9, 17, 15, 1, AP.wood[3]); f(23, 17, 2, 2, AP.wood[4]);   // trunk + cut end
      f(12, 18, 1, 1, AP.leaf[3]); f(17, 19, 1, 1, AP.leaf[3]); f(20, 18, 1, 1, AP.leaf[4]);   // moss
      f(9, 21, 15, 1, AP.leaf[0]);
    } else if (kind === 'stumps') {
      drawStump(p, 10, 16); drawStump(p, 19, 20); drawStump(p, 14, 24);
      for (let i = 0; i < 6; i++) f(9 + (r() * 16) | 0, 15 + (r() * 12) | 0, 1, 1, AP.wood[2]);   // wood chips
    } else {                                                           // brambles
      for (let i = 0; i < 4; i++) {
        const bx = 8 + (r() * 16) | 0, by = 14 + (r() * 12) | 0;
        ART.shadedCircle(f, bx, by, 2 + (r() * 2 | 0), LEAF_D, 2);
        f(bx, by - 3, 1, 3, AP.leaf[1]); f(bx + 2, by - 2, 1, 2, AP.leaf[1]);   // thorny sprigs
        if (r() < 0.5) f(bx - 1, by, 1, 1, AP.berry[1]);              // odd berry
      }
    }
  }
  const forestSet = (base, lvl, n) => { const a = []; for (let i = 0; i < n; i++) { const s = base + i * 37; a.push(tile(p => forestTile(p, s, lvl))); } return a; };
  Sprites.terrain[T.FOREST] = forestSet(11, 0, 8);                     // sparse — the outer fringe (complete trees)
  Sprites.terrainMed = { [T.FOREST]: forestSet(400, 1, 8) };          // medium — the perimeter (complete trees)
  Sprites.terrainFull = { [T.FOREST]: forestSet(800, 2, 8) };         // dense — the interior (may straddle)
  Sprites.terrainRare[T.FOREST] = [                                    // character one-offs
    tile(p => forestChar(p, 71, 'log')), tile(p => forestChar(p, 133, 'stumps')),
    tile(p => forestChar(p, 209, 'brambles')), tile(p => forestChar(p, 288, 'log')),
  ];

  // Water — the hero. [0] = shallow (near land, lighter), [1] = deep interior.
  // A rolling swell of four blues drawn at the fine grid: darker troughs, lighter
  // crests, crisp wave-dash highlights and pinpoint sun-glints. render.js layers
  // the live animation (drifting sparkle, shoreline foam, jumping fish) on top.
  function waterTile(p, seed, deep) {
    const f = p.f, r = ART.rng(seed);
    const d0 = deep ? AP.water[0] : AP.water[1];   // trough
    const d1 = deep ? AP.water[1] : AP.water[2];   // body
    const d2 = deep ? AP.water[2] : AP.water[3];   // crest
    const d3 = deep ? AP.water[3] : AP.water[4];   // glint
    f(0, 0, 32, 32, d1);
    for (let y = 0; y < 32; y++) {
      const s = Math.sin(y * 0.5 + seed * 0.7);
      for (let x = 0; x < 32; x++) {
        const w = Math.sin((x + y * 0.4) * 0.45 + seed) + s;
        if (w < -1.1) f(x, y, 1, 1, d0);
        else if (w > 1.15) f(x, y, 1, 1, d2);
      }
    }
    for (let i = 0; i < 11; i++) {                                  // crest wave-dashes
      const x = (r() * 27) | 0, y = 2 + (r() * 28) | 0, ln = 2 + (r() * 3 | 0);
      f(x, y, ln, 1, d2); f(x + 1, y + 1, ln - 1, 1, d1);
    }
    for (let i = 0; i < 6; i++) f(2 + (r() * 28) | 0, 2 + (r() * 28) | 0, 1, 1, d3);
  }
  Sprites.terrain[T.WATER] = [
    tile(p => waterTile(p, 9, false)),
    tile(p => waterTile(p, 57, true)),
  ];

  // A shaded boulder on the fine grid: a soft cast shadow (down-right on the
  // turf), a 3-shade rounded body, an angular fissure + facet break, a top-left
  // crown glint, and an optional snow cap. Boulders are placed in CLUSTERS —
  // some straddling the tile edge — so a field of hill/mountain tiles reads as
  // one broken rocky massif rather than a repeating grid. Shadows are laid down
  // first, then bodies, so overlapping rocks composite cleanly.
  function boulderShadow(f, cx, cy, rr) {
    // a TIGHT contact shadow hugging the rock's base — a small flat ellipse, not
    // a big offset disc (long directional shadows fight the neighbouring tiles)
    const ry = Math.max(1, (rr * 0.4) | 0), rx = rr;
    for (let dy = 0; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++)
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) f(cx + dx, cy + rr - 1 + dy, 1, 1, AP.grass[0]);
  }
  // ORE boulder: an angular, chunky mineral rock in the world's dark muted
  // grey-brown (AP.ore) — the pale near-white stone read as marble dropped on
  // grass. Built per-pixel on an octagonal metric with per-facet radius jitter,
  // so the silhouette is straight chunky edges and chipped corners, never a soft
  // blob. Hard-edged facet planes (lit top-left / front / right / shadowed
  // lower-right) split by dark crack lines, a crisp dark rim, speckle grain,
  // a fissure, a crest glint, and grass creeping up the base. Reads as "stone
  // you can mine", not elevation.
  function boulderBody(f, cx, cy, rr) {
    const St = AP.ore, r = ART.rng((cx * 31 + cy * 17) | 1);
    const oct = []; for (let i = 0; i < 8; i++) oct.push(0.76 + r() * 0.3);   // per-facet radius -> irregular chunk
    const chipA = (r() * 8) | 0, chipB = (r() * 8) | 0;                       // chipped corners
    const s1 = -(0.3 + r() * 0.25) * rr, s2 = (0.35 + r() * 0.25) * rr;       // facet split lines, jittered per rock
    const radAt = (dx, dy) => {
      const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
      const k = dx >= 0 ? (dy >= 0 ? (ax >= ay ? 0 : 1) : (ax >= ay ? 7 : 6)) : (dy >= 0 ? (ax >= ay ? 3 : 2) : (ax >= ay ? 4 : 5));
      let rad = rr * oct[k];
      if (k === chipA || k === chipB) rad *= 0.8;
      return rad;
    };
    const inside = (dx, dy, m) => {                                           // octagonal metric -> flat angular edges
      const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
      return (ax > ay ? ax + 0.41 * ay : ay + 0.41 * ax) <= radAt(dx, dy) - m;
    };
    for (let dy = -rr - 1; dy <= rr + 1; dy++) for (let dx = -rr - 1; dx <= rr + 1; dx++) {
      if (!inside(dx, dy, 0)) continue;
      const s = dx + dy, t = dx - dy;
      let c;                                                                  // hard-edged facet planes, 5 tonal steps
      if (s <= s1) c = s <= s1 - rr * 0.5 ? St[5] : St[4];                    // lit top-left plane (+ bright crest)
      else if (s >= s2) c = s >= s2 + rr * 0.5 ? St[1] : St[2];               // shadowed lower-right plane
      else c = t >= rr * 0.4 ? St[2] : St[3];                                 // right side-plane vs front plane
      if (!inside(dx, dy, 1)) c = s < 0 ? St[1] : St[0];                      // crisp 1px dark rim
      else if (Math.abs(s - s1) < 0.5 || Math.abs(s - s2) < 0.5) c = St[0];   // crack lines along the facet breaks
      f(cx + dx, cy + dy, 1, 1, c);
    }
    f(cx - (rr * 0.2 | 0), cy - (rr * 0.55 | 0), 1, (rr * 0.8) | 0, St[0]);   // vertical fissure
    f(cx + (rr * 0.3 | 0), cy, 1, (rr * 0.6) | 0, St[1]);                     // secondary hairline crack
    for (let i = 0, n = rr * 3; i < n; i++) {                                 // speckle grain (kept inside the rock)
      const gx = -rr + 1 + (r() * (rr * 2 - 1) | 0), gy = -rr + 1 + (r() * (rr * 2 - 1) | 0);
      if (inside(gx, gy, 1.4)) f(cx + gx, cy + gy, 1, 1, r() < 0.55 ? St[1] : St[4]);
    }
    f(cx - 1, cy + rr - 1, 2, 1, AP.grass[1]); f(cx + 1, cy + rr, 1, 1, AP.grass[4]);   // grass creeping up the base
  }
  function rockField(p, seed, spec) {
    const f = p.f, r = ART.rng(seed + 3);
    for (const b of spec) boulderShadow(f, b[0], b[1], b[2]);
    for (const b of spec) boulderBody(f, b[0], b[1], b[2]);
    for (let i = 0; i < 6; i++)                              // a few scree chips + grass tufts (workable-deposit rubble)
      f((r() * 30) | 0, (r() * 30) | 0, 1, 1, r() < 0.6 ? AP.ore[2] : AP.grass[4]);
  }
  // ORE (hills): a big chunky cluster of grey boulders on turf — 12 variants for
  // variety. Big anchor boulders (r 8-10) with mediums (r 6-7) + smalls (r 5) and
  // rubble around; every rock (body + shadow) stays fully inside the tile so a
  // deposit's edge never shows a cut-off boulder.
  Sprites.terrain[T.HILLS] = [
    tile(p => rockField(p, 31, [[14, 16, 9], [24, 24, 6], [7, 25, 5]])),
    tile(p => rockField(p, 87, [[17, 15, 10], [7, 23, 6], [25, 8, 5]])),
    tile(p => rockField(p, 143, [[12, 18, 8], [23, 12, 7], [24, 25, 5]])),
    tile(p => rockField(p, 199, [[16, 20, 9], [9, 9, 6], [24, 17, 6]])),
    tile(p => rockField(p, 251, [[19, 13, 8], [10, 22, 7], [23, 25, 5]])),
    tile(p => rockField(p, 307, [[13, 13, 8], [22, 22, 7], [8, 25, 5]])),
    tile(p => rockField(p, 361, [[16, 17, 10], [26, 7, 5], [8, 12, 5]])),
    tile(p => rockField(p, 419, [[15, 21, 8], [8, 14, 6], [24, 10, 6]])),
    tile(p => rockField(p, 467, [[20, 18, 9], [9, 20, 6], [14, 7, 5]])),
    tile(p => rockField(p, 523, [[12, 15, 9], [24, 20, 6], [18, 25, 5]])),
    tile(p => rockField(p, 577, [[18, 16, 8], [8, 10, 5], [10, 24, 6], [26, 23, 5]])),
    tile(p => rockField(p, 631, [[14, 17, 10], [24, 13, 6], [7, 7, 5]])),
  ];

  // wild fertile ground: fruit orchards and berry thickets, mixed across the
  // map — the village forages these long before it tills its first farm
  function orchardTile(p, seed) {
    const f = p.f, r = ART.rng(seed + 5);          // transparent floor — render paints the grass ground
    const fruitTree = (cx, cy, s2) => {
      const rr = 4 + (r() * 2 | 0);
      f(cx - rr + 1, cy + rr + 2, rr + 2, 1, AP.leaf[0]);           // contact shadow
      tree(f, cx, cy, rr, r() < 0.5 ? AP.leaf : LEAF_L);          // trunk + fruiting crown
      const fr = ART.rng(s2 + 1);
      const fruit = fr() < 0.5 ? AP.red[2] : AP.fire[2];            // apples on some trees, golden on others
      for (let i = 0; i < 8; i++)                                   // ripe fruit dotted in the crown
        f(cx - rr + 1 + ((fr() * (rr * 2 - 1)) | 0), cy - rr + 1 + ((fr() * (rr * 2 - 1)) | 0), 1, 1,
          fr() < 0.7 ? fruit : AP.fire[3]);
    };
    const nt = 2 + (r() * 2 | 0);
    for (let i = 0; i < nt; i++) fruitTree(7 + (r() * 18) | 0, 8 + (r() * 13) | 0, seed + i * 23 + 11);
    f(13, 27, 1, 1, AP.red[1]); f(27, 12, 1, 1, AP.red[2]);         // windfall fruit
  }
  function berryTile(p, seed) {
    const f = p.f, r = ART.rng(seed + 7);          // transparent floor — render paints the grass ground
    const bush = (cx, cy, s2) => {
      const rr = 3 + (r() * 2 | 0);                                 // varied size
      f(cx - rr, cy + rr + 1, rr * 2 + 1, 1, AP.leaf[0]);           // ground shadow
      ART.shadedCircle(f, cx + 1, cy + 1, rr, [AP.leaf[0], AP.leaf[0], AP.leaf[0]], 1);   // dark underside
      ART.shadedCircle(f, cx, cy, rr, AP.leaf, 2);                  // green bush
      ART.shadedCircle(f, cx - 1, cy - 1, (rr * 0.6) | 0, AP.leaf, 3);   // sunlit crown
      const br = ART.rng(s2);
      const hue = br() < 0.5 ? AP.berry[1] : AP.berry[3];           // whole bush reads red OR purple
      for (let i = 0; i < 12; i++) {                                // dense, vivid clustered berries
        const bx = cx - rr + ((br() * (rr * 2)) | 0), by = cy - rr + 1 + ((br() * (rr * 2 - 1)) | 0);
        f(bx, by, 1, 1, br() < 0.75 ? hue : AP.berry[0]);
        if (br() < 0.3) f(bx, by - 1, 1, 1, AP.berry[2]);           // bright pink highlight
      }
    };
    const nb = 3 + (r() * 2 | 0);
    for (let i = 0; i < nb; i++) bush(5 + (r() * 22) | 0, 6 + (r() * 19) | 0, seed + i * 17 + 3);
    f(27, 26, 1, 1, AP.berry[1]); f(4, 17, 1, 1, AP.berry[3]);      // dropped berries
  }
  Sprites.terrain[T.FERTILE] = [
    tile(p => orchardTile(p, 17)), tile(p => berryTile(p, 53)),
    tile(p => orchardTile(p, 91)), tile(p => berryTile(p, 133)),
    tile(p => berryTile(p, 188)), tile(p => orchardTile(p, 241)),
  ];

  // depleted terrain: felled forest, quarried-out hills, spent soil, ruins
  // a felled stump: lit ring-grain top, a bark rim, an axe notch, ground shadow
  function drawStump(p, x, y) {
    const f = p.f;
    f(x - 1, y + 6, 8, 1, AP.wood[0]);                            // ground shadow
    f(x, y + 1, 6, 5, AP.wood[1]); f(x, y + 1, 1, 5, AP.wood[2]); // trunk side (lit left)
    f(x, y, 6, 2, AP.thatch[2]);                                  // cut top face
    f(x + 1, y, 4, 1, AP.thatch[3]); f(x + 2, y + 1, 2, 1, AP.wood[3]);   // rings
    f(x + 4, y + 2, 1, 2, AP.wood[0]);                            // axe notch
  }
  Sprites.terrain[T.STUMPS] = [
    tile(p => { drawStump(p, 5, 7); drawStump(p, 19, 17); drawStump(p, 9, 23); }),
    tile(p => { drawStump(p, 17, 5); drawStump(p, 7, 15); drawStump(p, 23, 23); }),
  ];
  // spent quarry: a couple of leftover rocks, a cracked cut slab, loose scree
  Sprites.terrain[T.PEBBLES] = [
    tile(p => {
      const f = p.f, r = ART.rng(57);            // transparent floor — render paints the grass ground
      boulderShadow(f, 8, 13, 2); boulderBody(f, 8, 13, 2);
      boulderShadow(f, 21, 19, 2); boulderBody(f, 21, 19, 2);
      f(4, 22, 8, 5, AP.stone[1]); f(4, 22, 8, 1, AP.stone[3]); f(4, 22, 1, 5, AP.stone[2]);  // cut slab
      f(7, 22, 1, 5, AP.stone[0]); f(4, 25, 8, 1, AP.stone[0]);                                // saw cracks
      for (let i = 0; i < 11; i++) f((r() * 30) | 0, (r() * 30) | 0, 1, 1, r() < 0.5 ? AP.stone[2] : AP.stone[3]);
    }),
  ];
  // spent soil — dry tilled earth: fine ploughed furrows (lit crest / shadowed
  // trough), scattered clods and dry cracks, drawn at the 32-grid
  Sprites.terrain[T.BARREN] = [
    tile(p => {
      const f = p.f, r = ART.rng(71);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const n = Math.sin((x + y) * 0.7) + (r() - 0.5) * 1.2;
        f(x, y, 1, 1, n > 0.5 ? AP.soil[3] : n < -0.6 ? AP.soil[1] : AP.soil[2]);
      }
      for (let y = 1; y < 32; y += 4) {                             // ploughed furrows
        f(0, y, 32, 1, AP.soil[3]); f(0, y + 1, 32, 1, AP.soil[1]);
      }
      for (let i = 0; i < 14; i++) f((r() * 32) | 0, (r() * 32) | 0, 1, 1, r() < 0.5 ? AP.soil[0] : AP.soil[1]);
      f(4, 8, 9, 1, AP.soil[0]); f(11, 9, 1, 5, AP.soil[0]);        // dry cracks
      f(18, 20, 8, 1, AP.soil[0]); f(20, 12, 1, 6, AP.soil[0]);
    }),
  ];
  Sprites.terrain[T.RUIN] = [
    tile(p => {
      ART.dither(p, 0, 0, 16, 16, AP.soil[1], AP.stone[1]);
      p(2, 9, 5, 3, AP.stone[1]); p(2, 8, 3, 1, AP.stone[2]);       // collapsed wall
      p(9, 4, 4, 2, AP.stone[1]); p(12, 6, 2, 2, AP.stone[2]);
      p(6, 3, 2, 2, AP.wood[1]); p(5, 13, 4, 1, AP.wood[0]);        // charred beams
      p(10, 11, 3, 1, AP.ink[0]); p(4, 5, 1, 1, AP.ink[0]);
    }),
  ];
  // MOUNTAINS — raised BROWN-GREY terrain that reads as ELEVATION, not scattered
  // rock. A tile is drawn by its ROLE in the mass (render.js picks it from the
  // mountain neighbours): a `peak` tile (nothing above it) draws a snow-capped
  // triangular summit widening downward; a `slope` tile (mountain above) draws a
  // full-width rock body of the same lit/shadow faces so a column of tiles stacks
  // into one tall peak; either kind that has open ground BELOW draws a `foot`
  // (scree + a cast shadow onto the grass). Strong lit LEFT face / dark RIGHT
  // face split by a wandering ridge sells the height; snow caps the summits.
  // A single clean cool-grey mountain peak, fully shaded (NO dragged streaks): a
  // lit LEFT face, a shadowed RIGHT face, short angled facet-folds for rock
  // texture, sunlit sparkle dabs, a tight ground shadow and an optional jagged
  // white snow cap sized by `snowFrac`. Drawn back-to-front by the caller.
  function drawPeak(f, r, cx, apexY, height, hw, snowFrac) {
    const P = AP.peak, baseY = apexY + height;
    for (let dx = -hw + 1; dx < hw; dx++) { const yy = Math.min(31, baseY); f(cx + dx, yy, 1, 1, AP.grass[0]); }   // contact shadow
    for (let y = apexY; y < baseY; y++) {                            // faces: lit left / shadow right, soft mid ridge
      if (y < 0 || y > 31) continue;
      const t = (y - apexY) / height, w = Math.max(1, Math.round(t * hw));
      for (let x = cx - w; x <= cx + w; x++) {
        if (x < 0 || x > 31) continue;
        const d = x - cx;
        f(x, y, 1, 1, d < -w * 0.14 ? P[3] : d > w * 0.14 ? P[1] : P[2]);
      }
    }
    for (let i = 0, n = 5 + (r() * 4 | 0); i < n; i++) {             // short angled facet-folds (never full height)
      const fy = apexY + 3 + (r() * (height - 6) | 0), t0 = (fy - apexY) / height, w0 = Math.max(1, Math.round(t0 * hw));
      let fx = cx - w0 + 1 + (r() * (2 * w0 - 2) | 0); const dark = fx < cx ? P[2] : P[0], dir = fx < cx ? -1 : 1, len = 2 + (r() * 3 | 0);
      for (let s = 0; s < len; s++) { const yy = fy + s, xx = fx + (dir * (s >> 1)); if (yy < 0 || yy > 31 || yy >= baseY) break; const ww = Math.max(1, Math.round((yy - apexY) / height * hw)); if (Math.abs(xx - cx) < ww && xx >= 0 && xx < 32) f(xx, yy, 1, 1, dark); }
    }
    for (let i = 0; i < 3; i++) { const fy = apexY + 3 + (r() * (height * 0.6) | 0); if (fy < 0 || fy > 31) continue; const w = Math.max(1, Math.round((fy - apexY) / height * hw)); const xx = cx - 1 - (r() * (w * 0.5) | 0); if (xx >= 0 && xx < 32) f(xx, fy, 1, 1, P[4]); }   // sunlit dabs
    if (snowFrac > 0) {
      const snowH = Math.max(3, Math.round(snowFrac * height));
      for (let y = apexY; y < apexY + snowH; y++) {
        if (y < 0 || y > 31) continue;
        const w = Math.max(1, Math.round((y - apexY) / height * hw));
        for (let x = cx - w; x <= cx + Math.round(w * 0.6); x++) {
          if (x < 0 || x > 31) continue;
          if (y > apexY + snowH - 3 && r() < 0.45) continue;         // jagged melt line
          f(x, y, 1, 1, x <= cx ? P[5] : P[4]);
        }
      }
      for (let i = 0; i < 3; i++) { const sy = apexY + snowH + (r() * 3 | 0); if (sy < 0 || sy > 31) continue; const w = Math.max(1, Math.round((sy - apexY) / height * hw)); const sx = cx - w + 1 + (r() * w | 0); if (sx >= 0 && sx < 32) f(sx, sy, 1, 1, P[5]); }
    }
  }
  function tinyPine(f, x, y) { const L = AP.leaf; if (x < 1 || x > 30) return; f(x, y + 3, 1, 1, AP.wood[1]); f(x - 1, y + 1, 3, 1, L[0]); f(x - 1, y, 3, 1, L[1]); f(x, y - 1, 1, 1, L[2]); f(x, y + 2, 1, 1, L[1]); }
  function miniBoulder(f, x, y) { const S = AP.stone; if (x < 2 || x > 29) return; f(x - 1, y, 3, 2, S[2]); f(x - 1, y, 3, 1, S[3]); f(x - 1, y + 2, 3, 1, S[0]); }
  // MOUNTAIN density tiers (chosen in render.js from how enclosed the tile is, like
  // the forest): LOW = small foothill peak tapering to the ground, NO snow, on the
  // outer edge; MED = a bigger peak with a little snow, base mostly covered by the
  // low peaks in front; HIGH = the biggest summit, sides cut off by the tile edge,
  // lots of snow — the heart of the range. Each fully drawn with a small imperfection.
  function mtnLow(seed) {
    return tile(p => {
      const f = p.f, r = ART.rng(seed | 1), cx = 10 + (r() * 12 | 0), h = 18 + (r() * 5 | 0), hw = 11 + (r() * 3 | 0);
      drawPeak(f, r, cx, 30 - h, h, hw, 0);                              // small foothill, no snow, tapers to the ground
      const im = r(); if (im < 0.4) tinyPine(f, cx - hw - 1 + (r() * 3 | 0), 30); else if (im < 0.7) miniBoulder(f, cx + hw, 29);
    });
  }
  function mtnMed(seed) {
    return tile(p => {
      const f = p.f, r = ART.rng(seed | 1), cx = 9 + (r() * 14 | 0), h = 27 + (r() * 5 | 0), hw = 15 + (r() * 3 | 0);
      drawPeak(f, r, cx, 32 - h, h, hw, 0.22);                           // bigger, a little snow, overlaps neighbours
      const im = r(); if (im < 0.35) drawPeak(f, r, cx + (r() < 0.5 ? -1 : 1) * (hw - 2), 31 - 11, 11, 5, 0); else if (im < 0.55) tinyPine(f, cx - hw, 30);
    });
  }
  function mtnHigh(seed) {
    return tile(p => {
      const f = p.f, r = ART.rng(seed | 1), cx = 11 + (r() * 10 | 0), h = 34 + (r() * 4 | 0), hw = 20 + (r() * 4 | 0);
      drawPeak(f, r, cx, (r() * 2 | 0), h, hw, 0.5);                     // biggest, sides cut off, lots of snow
      if (r() < 0.5) drawPeak(f, r, cx + (r() < 0.5 ? -1 : 1) * (hw - 5), 6 + (r() * 3 | 0), h - 14, 7, 0.4);   // secondary snowy spur
    });
  }
  Sprites.mountain = {
    low: [mtnLow(11), mtnLow(58), mtnLow(102), mtnLow(151)],
    med: [mtnMed(210), mtnMed(263), mtnMed(319)],
    high: [mtnHigh(380), mtnHigh(431), mtnHigh(488)],
  };
  // VERTICAL ridge (N-S runs) — a chain of OVERLAPPING snow-capped peaks receding
  // northward over a dark shadowed-rock ground (render paints it, so NO grass shows
  // on the flanks — only the top summit tile opens to sky). Composited top-to-
  // bottom, so each near (lower) peak overlaps the base of the one behind it, and
  // you read a receding line of summits. render sizes each tile from its position
  // along the run: skinny peaks at the two ends, biggest & snowiest in the middle.
  function mtnVertMid(seed, hw, snow) {
    return tile(p => {
      const f = p.f, r = ART.rng(seed | 1);
      drawPeak(f, r, 16, 0, 32, hw, snow);
      if (r() < 0.5) drawPeak(f, r, 16 + (r() < 0.5 ? -1 : 1) * (hw - 3), 3 + (r() * 4 | 0), 22, 6, snow > 0.2 ? 0.35 : 0);   // secondary spur
    });
  }
  function mtnVertTop(seed, hw) {
    return tile(p => { const f = p.f, r = ART.rng(seed | 1); drawPeak(f, r, 16, 1 + (r() * 2 | 0), 30, hw, 0.5); });
  }
  function mtnVertBot(seed, hw) {
    return tile(p => {
      const f = p.f, r = ART.rng(seed | 1); drawPeak(f, r, 16, 0, 29, hw, 0.15);
      for (let x = 16 - hw; x <= 16 + hw; x++) { if (x < 0 || x > 31) continue; f(x, 28, 1, 1, AP.peak[0]); if (r() < 0.5) f(x, 29 + (r() * 2 | 0), 1, 1, r() < 0.5 ? AP.peak[1] : AP.grass[0]); }
    });
  }
  Sprites.mountainV = {
    top: [mtnVertTop(520, 15), mtnVertTop(571, 16), mtnVertTop(622, 14)],
    midS: [mtnVertMid(660, 11, 0.15), mtnVertMid(709, 11, 0.15)],
    midM: [mtnVertMid(748, 14, 0.3), mtnVertMid(797, 14, 0.3)],
    midT: [mtnVertMid(836, 17, 0.5), mtnVertMid(885, 18, 0.5), mtnVertMid(934, 17, 0.45)],
    bot: [mtnVertBot(970, 13), mtnVertBot(1019, 14), mtnVertBot(1068, 12)],
  };
  Sprites.terrain[T.MOUNTAIN] = Sprites.mountain.high;   // fallback / minimap
  // sapper-dug TRENCH — a ditch of turned earth with a dark shadowed floor and
  // grass banks; MOAT — the same channel flooded from a water source. Both block
  // land movement (drawn full-tile so a dug line reads as one continuous ditch).
  Sprites.terrain[T.TRENCH] = [
    // flat, uniform dug floor filling the WHOLE tile (edge to edge) so a line of
    // dug tiles reads as one continuous ditch. Sloped walls (per land-facing edge)
    // and scattered clods (per-tile from the map hash) are painted in render.js —
    // baking them here would make every tile identical and print a repeating grid.
    tile(p => { p(0, 0, 16, 16, AP.soil[0]); }),
  ];
  Sprites.terrain[T.MOAT] = [
    tile(p => {
      p(1, 1, 14, 14, AP.soil[1]);                                   // earth banks
      p(2, 2, 12, 12, AP.water[1]);                                  // dark ditch water
      p(3, 3, 10, 9, AP.water[2]);
      p(2, 2, 12, 1, AP.soil[3]);                                    // lit near bank
      p(4, 4, 5, 1, AP.water[3]); p(9, 8, 3, 1, AP.water[3]);        // glints
      p(2, 13, 12, 1, AP.ink[0]);                                   // deep far lip
    }),
  ];
  Sprites.terrain[T.CAMP] = [
    tile(p => {
      ART.dither(p, 0, 0, 16, 16, AP.soil[3], AP.grass[2]);          // trampled dirt
      const r = ART.rng(41);
      for (let i = 0; i < 6; i++) p((r() * 16) | 0, (r() * 16) | 0, 1, 1, AP.soil[1]);
      p(1, 2, 1, 3, AP.wood[1]); p(4, 1, 1, 3, AP.wood[1]);          // crude spike palisade
      p(13, 2, 1, 3, AP.wood[1]); p(1, 1, 1, 1, AP.wood[3]); p(13, 1, 1, 1, AP.wood[3]);
      ART.shadedRect(p, 5, 5, 6, 5, AP.rust, 1);                      // hide tent
      p(6, 4, 4, 1, AP.rust[2]);
      p(7, 7, 2, 3, AP.ink[0]);                                       // entrance
      p(2, 9, 1, 3, AP.wood[1]); p(1, 8, 3, 1, AP.bone[2]); p(2, 7, 1, 1, AP.bone[2]);  // skull totem
      p(11, 11, 3, 1, AP.ink[1]); p(12, 10, 2, 2, AP.fire[1]); p(12, 9, 1, 1, AP.fire[2]);  // fire pit
    }),
  ];
  // ground color per terrain — render.js dithers these along biome borders. Every
  // grass-floored terrain shares grass[2] (the painted floor in R.paintGround) so
  // they never dither against each other — only against soil/stone biomes.
  Sprites.blendCol = {
    [T.GRASS]: AP.grass[2], [T.FOREST]: AP.grass[2], [T.HILLS]: AP.grass[2],
    [T.FERTILE]: AP.grass[2], [T.STUMPS]: AP.grass[2], [T.PEBBLES]: AP.grass[2],
    [T.MOUNTAIN]: AP.grass[2],
    [T.BARREN]: AP.soil[3], [T.RUIN]: AP.stone[1], [T.CAMP]: AP.soil[3],
  };

  /* ---------------- buildings ---------------- */
  function shadow(p) { p(2, 13, 12, 2, 'rgba(0,0,0,0.25)'); }

  // fortification materials by level: 1 = stick-and-grass palisade, 2 = stone, 3 = dressed stone
  function wallPal(lv) {
    return lv === 1
      ? { base: PAL.woodD, top: PAL.thatch, seam: APx.wood[0], stick: PAL.wood }
      : lv === 2
        ? { base: PAL.stone, top: PAL.rockL, seam: PAL.stoneD }
        : { base: PAL.stoneD, top: PAL.stone, seam: APx.stone[0], gold: true };
  }
  // directional wall piece for a 4-bit neighbor mask (N=1, E=2, S=4, W=8)
  function drawWallMask(p, lv, mask) {
    const c = wallPal(lv);
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    if (!mask) {                       // lone pillar / stake cluster
      p(4, 3, 8, 10, c.base); p(4, 3, 8, 1, c.top); p(3, 2, 10, 2, c.base); p(3, 2, 10, 1, c.top);
      p(6, 7, 2, 1, c.seam); p(8, 10, 3, 1, c.seam);
      if (c.stick) { p(5, 4, 1, 8, c.stick); p(9, 4, 1, 8, c.stick); }
      if (c.gold) p(3, 1, 10, 1, PAL.gold);
      return;
    }
    if (N) p(5, 0, 6, 5, c.base);
    if (S) p(5, 11, 6, 5, c.base);
    if (E) p(11, 5, 5, 6, c.base);
    if (W) p(0, 5, 5, 6, c.base);
    p(5, 5, 6, 6, c.base);             // hub
    // sunlit edges (grass binding on the palisade)
    p(5, 5, 6, 1, c.top);
    if (W) p(0, 5, 5, 1, c.top);
    if (E) p(11, 5, 5, 1, c.top);
    if (N) p(5, 0, 1, 5, c.top);
    if (S) p(5, 11, 1, 5, c.top);
    if (c.stick) {
      // upright sticks along every run + grass tufts at the footing
      if (W) { p(1, 6, 1, 5, c.stick); p(3, 6, 1, 5, c.stick); }
      if (E) { p(12, 6, 1, 5, c.stick); p(14, 6, 1, 5, c.stick); }
      if (N) { p(7, 0, 1, 5, c.stick); p(9, 1, 1, 4, c.stick); }
      if (S) { p(7, 11, 1, 5, c.stick); p(9, 11, 1, 4, c.stick); }
      p(6, 6, 1, 5, c.stick); p(8, 6, 1, 5, c.stick); p(10, 7, 1, 4, c.stick);
      if (W || E) { p(2, 11, 1, 1, PAL.sprout); p(13, 11, 1, 1, PAL.sprout); }
      if (N || S) p(4, 9, 1, 1, PAL.sprout);
    } else {
      // crenels along horizontal stone tops
      if (W) p(1, 3, 2, 2, c.base);
      if (E) p(12, 3, 2, 2, c.base);
      if (!N) p(6, 3, 2, 2, c.base);
      // masonry seams
      p(7, 8, 2, 1, c.seam);
      if (W) p(1, 8, 3, 1, c.seam);
      if (E) p(12, 8, 3, 1, c.seam);
      if (N) p(6, 2, 2, 1, c.seam);
      if (S) p(8, 13, 2, 1, c.seam);
    }
    if (c.gold) p(5, 4, 6, 1, PAL.gold);
  }
  // north-south gate: no visible door from this angle — a thicker wall span
  // flanked by two small towers marks the passage
  function drawGateVertical(p, lv) {
    const c = wallPal(lv);
    p(5, 0, 6, 16, c.base);                     // wall run
    p(4, 5, 8, 6, c.base);                      // thickened waist
    p(4, 5, 8, 1, c.top);
    // twin towers flanking the passage
    p(2, 0, 12, 4, c.base); p(2, 0, 12, 1, c.top);
    p(2, 12, 12, 4, c.base); p(2, 12, 12, 1, c.top);
    p(3, 2, 2, 1, c.seam); p(11, 14, 2, 1, c.seam);
    if (c.stick) { p(3, 1, 1, 3, c.stick); p(12, 1, 1, 3, c.stick); p(3, 13, 1, 3, c.stick); p(12, 13, 1, 3, c.stick); }
    if (c.gold) { p(2, 0, 12, 1, PAL.gold); p(2, 12, 12, 1, PAL.gold); }
  }
  function roofStrips(p, x, y, w, rows, colA, colB) {
    for (let i = 0; i < rows; i++) p(x + i, y + i, w - i * 2, 1, i % 2 ? colB : colA);
  }
  /* ---- material helpers driven by ART.tierDress ---- */
  function roof(p, x, y, w, h, dress, seed) {
    if (dress.mat === 'stonefoot') {
      ART.shadedRect(p, x, y, w, h, AP.wood, 2);                    // wood shingles
      for (let yy = y + 1; yy < y + h; yy += 2) p(x, yy, w, 1, AP.wood[1]);
      for (let xx = x + 2; xx < x + w - 1; xx += 3) p(xx, y + 1, 1, h - 2, AP.wood[3]);
      p(x, y, w, 1, AP.wood[4]);                                    // lit ridge
      if (p.hi) for (let xx = x; xx < x + w; xx += 1)               // staggered shingle butts
        p.hi(xx * 2 + (xx & 1), (y + h - 1) * 2 + 1, 1, 1, AP.wood[0]);
    } else {
      ART.thatchTexture(p, x, y, w, h, seed);
      if (dress.mat === 'timber') p(x, y, w, 1, AP.wood[3]);        // ridge beam
      if (p.hi) p.hi(x * 2, (y + h) * 2 - 1, w * 2, 1, AP.thatch[0]);  // shaded eave lip
    }
    if (p.hi) p.hi(x * 2 - 1, (y + h) * 2, w * 2 + 2, 1, ART.STYLE.SHADOW);  // eave shadow on the wall below
  }
  function wallBody(p, x, y, w, h, dress, seed) {
    if (dress.mat === 'wattle') ART.wattleTexture(p, x, y, w, h, seed);
    else if (dress.mat === 'timber') {
      ART.woodPlankTexture(p, x, y, w, h, seed);
      if (p.hi) { p.hi(x * 2, y * 2, 1, h * 2, AP.wood[3]); p.hi((x + w) * 2 - 1, y * 2, 1, h * 2, AP.wood[1]); }  // corner posts
    } else {
      ART.stoneTexture(p, x, y, w, h, seed);
      if (p.hi && w > 2 && h > 2) {                                // dressed-stone corner QUOINS at L3
        for (let i = 0; i < h; i += 2) {
          const lit = (i & 2) ? AP.stone[4] : AP.stone[3], sh = (i & 2) ? AP.stone[1] : AP.stone[0];
          p.hi(x * 2, (y + i) * 2, 2, 2, lit); p.hi(x * 2, (y + i) * 2, 2, 1, AP.stone[4]);          // left quoins
          p.hi((x + w) * 2 - 2, (y + i) * 2, 2, 2, sh);                                               // right quoins (shaded)
        }
      }
    }
  }
  function banner(p, x, y, fac) {
    p(x, y, 1, 4, AP.wood[2]);
    p(x + 1, y, 3, 2, fac[2]); p(x + 1, y + 2, 2, 1, fac[1]);
  }
  /* ---- HI-RES building materials on the fine (32-grid) plotter, keyed to tier so
     every building tells the SAME material story: L1 wattle-&-daub with stakes
     (grass/sticks) → L2 timber planks on a stone footing course (sticks + a little
     stone) → L3 coursed stone masonry with dressed quoins (mostly stone). ---- */
  function bWall(q, x, y, w, h, tier, seed) {
    if (tier <= 1) {                                             // wattle & daub, staked
      ART.wattleTexture(q, x, y, w, h, seed);
      q(x, y, w, 1, AP.soil[3]); q(x, y + h - 1, w, 1, AP.soil[1]);
      for (let sx = x + 1; sx < x + w - 1; sx += 3) q(sx, y + 1, 1, h - 2, AP.wood[1]);
    } else if (tier === 2) {                                     // timber planks on a stone footing
      ART.woodPlankTexture(q, x, y, w, h - 2, seed);
      q(x, y, 1, h - 2, AP.wood[3]); q(x + w - 1, y, 1, h - 2, AP.wood[1]);   // corner posts
      ART.stoneTexture(q, x, y + h - 2, w, 2, seed + 7); q(x, y + h - 2, w, 1, AP.stone[4]);  // footing course
    } else {                                                    // coursed stone + dressed quoins
      ART.stoneTexture(q, x, y, w, h, seed);
      for (let i = 0; i < h; i += 2) { q(x, y + i, 2, 2, (i & 2) ? AP.stone[4] : AP.stone[3]); q(x + w - 2, y + i, 2, 2, (i & 2) ? AP.stone[1] : AP.stone[0]); }
      q(x, y, w, 1, AP.stone[4]);
    }
  }
  function bRoof(q, x, y, w, h, tier, seed) {
    if (tier <= 2) {                                            // thatch (looser L1, combed L2)
      ART.thatchTexture(q, x, y, w, h, seed);
      q(x, y, w, 1, AP.thatch[3]); q(x - 1, y + h, w + 2, 1, AP.thatch[0]);   // lit ridge + eave shadow
      if (tier === 2) for (let sx = x + 1; sx < x + w; sx += 4) q(sx, y, 1, h, AP.thatch[1]);  // combed strands
    } else {                                                    // finished wood shingles
      ART.shadedRect(q, x, y, w, h, AP.wood, 2);
      for (let yy = y + 1; yy < y + h; yy += 2) q(x, yy, w, 1, AP.wood[1]);
      for (let xx = x + 2; xx < x + w - 1; xx += 3) q(xx, y + 1, 1, h - 1, AP.wood[3]);
      q(x, y, w, 1, AP.wood[4]); q(x - 1, y + h, w + 2, 1, ART.STYLE.SHADOW);
    }
  }

  /* ---- the 8+ buildings. Each receives (p, lv, fac) where fac is the owning
     faction's cloth ramp — the rival's set is generated in red. Silhouette
     identifies the building; tierDress drives materials and decoration. ---- */
  const B_DRAW = {
    // ============ TOWN CENTER — the hero asset ============
    // ============ TOWN CENTER — the 2×2 hero, authored on the fine 32-grid ============
    // `q` = p.hi (32-grid, 2px/cell). Every mass and detail is drawn at fine
    // density so nothing is a coarse blob across the big footprint. Coords 0..31.
    tc(p, lv, fac) {
      const q = p.hi;
      // broad soft contact shadow for the large footprint
      q(6, 27, 21, 2, ART.STYLE.SHADOW); q(9, 29, 14, 1, ART.STYLE.SHADOW);
      const rr = ART.rng(83);
      if (lv === 1) {
        // great thatched roundhouse: a combed-reed cone over a wattle-and-daub
        // ring wall, crossed ridge poles at the crown, a deep doorway, and a
        // stone fire pit smouldering in the dooryard (render.js adds the flame)
        ART.wattleTexture(q, 7, 19, 18, 8, 41);                     // daub ring wall (tall, visible)
        q(7, 19, 18, 1, AP.soil[3]); q(7, 26, 18, 1, AP.soil[1]);   // lit top / shaded base
        for (let sx = 8; sx < 25; sx += 3) q(sx, 20, 1, 6, AP.wood[1]); // wattle stakes
        // conical thatch roof — a cone (peak top-left of centre) over the ring,
        // built from stacked courses that widen downward to a ragged eave
        for (let ry = 2; ry <= 20; ry++) {
          const rw = Math.round((ry - 2) * 0.95) + 1;               // widens toward the base
          const rx = 16 - rw, w2 = rw * 2;
          q(rx, ry, w2, 1, AP.thatch[2]);
          const edge = Math.max(1, w2 >> 2);
          q(rx, ry, edge, 1, AP.thatch[3]);                         // lit left face
          q(rx + w2 - edge, ry, edge, 1, AP.thatch[1]);             // shaded right face
          if (ry % 2 === 0) q(rx + 1, ry, w2 - 2, 1, AP.thatch[1]); // combed course line
        }
        q(11, 18, 11, 2, AP.thatch[0]);                             // deep eave shadow over the wall
        q(13, 4, 5, 4, AP.thatch[3]);                               // sunlit crown
        for (let i = 0; i < 20; i++) { const yy = 4 + (rr() * 15) | 0, xw = 16 - ((yy - 2) * 0.95 + 1); q((16 - xw + rr() * xw * 2) | 0, yy, 1, 1, rr() < 0.5 ? AP.thatch[0] : AP.thatch[3]); }  // loose reed strands
        q(14, 2, 2, 5, AP.wood[2]); q(17, 3, 2, 4, AP.wood[2]);     // crossed ridge poles at the crown
        q(15, 2, 1, 1, AP.wood[3]); q(18, 3, 1, 1, AP.wood[1]);
        q(15, 7, 3, 1, AP.ink[1]);                                  // smoke hole
        q(13, 19, 6, 1, AP.wood[3]);                                // door lintel
        q(14, 20, 4, 6, AP.ink[0]);                                 // deep doorway
        q(13, 20, 1, 6, AP.wood[2]); q(18, 20, 1, 6, AP.wood[2]);   // door posts
        q(14, 25, 4, 1, AP.soil[3]);                                // trodden threshold
        // stone fire-pit ring in the dooryard (bottom-right — flame drawn over it)
        for (const [dx, dy, s] of [[24, 24, 1], [27, 24, 2], [24, 27, 0], [27, 27, 1], [24, 25, 1], [27, 25, 2], [25, 24, 2], [26, 27, 1]])
          q(dx, dy, 1, 1, AP.stone[s]);
        q(25, 25, 2, 2, AP.fire[1]); q(25, 25, 1, 1, AP.fire[2]);   // banked embers
        q(23, 27, 1, 1, AP.wood[0]);                                // charred log end
      } else if (lv === 2) {
        // timber longhouse: a thatched gable over a post-and-beam plank wall on a
        // stone footing, deep-set doorway, shuttered windows, a drying rack
        ART.woodPlankTexture(q, 5, 16, 22, 11, 5);                  // plank front wall
        ART.stoneTexture(q, 4, 25, 24, 3, 21);                      // stone footing course
        q(4, 25, 24, 1, AP.stone[4]);
        for (const px of [5, 10, 16, 22, 26]) {                     // post-and-beam framing
          q(px, 16, 1, 10, AP.wood[1]); q(px, 16, 1, 1, AP.wood[3]);
        }
        q(5, 16, 22, 1, AP.wood[3]); q(5, 20, 22, 1, AP.wood[2]);   // lit head + mid rail
        // thatch gable roof, overhanging the walls, ridge across the middle
        ART.thatchTexture(q, 3, 4, 26, 13, 6);
        q(2, 15, 28, 2, AP.thatch[1]); q(2, 15, 28, 1, AP.thatch[2]); // eave overhang
        q(3, 4, 26, 1, AP.thatch[3]);                              // lit top edge
        q(4, 9, 24, 1, AP.wood[3]); q(4, 10, 24, 1, AP.wood[1]);   // ridge beam
        for (let sx = 5; sx < 28; sx += 4) q(sx, 4, 1, 11, rr() < 0.5 ? AP.thatch[1] : AP.thatch[3]); // combed strands
        q(3, 3, 1, 14, AP.wood[1]); q(28, 3, 1, 14, AP.wood[1]);   // carved gable-end posts
        q(2, 2, 2, 2, AP.bone[2]); q(28, 2, 2, 2, AP.bone[2]);     // bone finials
        q(15, 6, 3, 2, AP.ink[1]);                                 // smoke hole
        q(13, 18, 6, 1, AP.wood[3]);                               // door lintel
        q(14, 19, 4, 7, AP.ink[0]);                                // deep doorway
        q(13, 19, 1, 7, AP.wood[2]); q(18, 19, 1, 7, AP.wood[2]);  // jambs
        q(14, 25, 4, 1, AP.soil[3]);                               // threshold
        q(8, 20, 3, 3, AP.ink[1]); q(8, 20, 3, 1, AP.wood[3]);     // shuttered windows
        q(21, 20, 3, 3, AP.ink[1]); q(21, 20, 3, 1, AP.wood[3]);
        q(1, 20, 1, 7, AP.wood[2]); q(1, 20, 4, 1, AP.wood[3]);    // drying rack
        q(1, 22, 1, 2, AP.red[2]); q(3, 22, 1, 3, AP.hide[2]);     // hung meat
      } else {
        // GRAND STONE GREAT HALL — a coursed-masonry keep flanked by two
        // crenellated corner towers under a hipped, gold-crested shingle roof.
        // A projecting gabled porch frames a deep fire-lit doorway between
        // glowing braziers; twin faction banners fly from the towers and arched
        // windows glow within. Built to dominate the skyline at the refined tier.
        // stepped stone plinth the whole hall stands on
        ART.stoneTexture(q, 3, 26, 26, 3, 27); q(3, 26, 26, 1, AP.stone[4]); q(2, 28, 28, 1, AP.stone[1]);
        // central hall — coursed stone with a run of dressed quoins up the front
        ART.stoneTexture(q, 6, 14, 20, 13, 21);
        for (let i = 0; i < 13; i += 2) { q(6, 14 + i, 2, 2, (i & 2) ? AP.stone[4] : AP.stone[3]); q(24, 14 + i, 2, 2, (i & 2) ? AP.stone[1] : AP.stone[0]); }
        // hipped wood-shingle roof over the hall, bevelled top corners so it
        // reads as a hip roof, with a gilded ridge and cresting finials
        ART.shadedRect(q, 5, 5, 22, 10, AP.wood, 2);
        for (let yy = 7; yy < 15; yy += 2) q(5, yy, 22, 1, AP.wood[1]);            // shingle courses
        for (let xx = 7; xx < 26; xx += 3) q(xx, 6, 1, 9, AP.wood[3]);             // shingle seams
        q(5, 5, 3, 2, AP.ink[1]); q(24, 5, 3, 2, AP.ink[1]);                       // bevelled hip corners
        q(8, 5, 1, 1, AP.wood[0]); q(23, 5, 1, 1, AP.wood[0]);
        q(6, 4, 20, 1, AP.gold[1]); q(6, 3, 20, 1, AP.gold[2]);                    // gilded ridge
        for (let cx = 8; cx < 25; cx += 4) { q(cx, 2, 1, 1, AP.wood[2]); q(cx, 1, 1, 1, AP.gold[2]); }  // ridge cresting
        q(4, 14, 24, 2, AP.wood[1]); q(4, 14, 24, 1, AP.wood[2]);                  // eave overhang
        // two crenellated corner towers flanking the hall
        for (const tx of [1, 27]) {
          ART.stoneTexture(q, tx, 6, 4, 21, tx * 5 + 9);
          q(tx, 6, 4, 1, AP.stone[4]);                                             // lit tower crown
          q(tx, 5, 1, 1, AP.stone[3]); q(tx + 2, 5, 1, 1, AP.stone[3]);            // merlons
          for (let ty = 10; ty < 26; ty += 3) q(tx, ty, 4, 1, AP.stone[1]);        // course lines
          q(tx + 1, 11, 2, 3, AP.ink[0]); q(tx + 1, 11, 2, 1, AP.stone[4]);        // arrow-slit
          q(tx + 1, 12, 1, 1, AP.fire[1]);                                         // faint glow within
        }
        // projecting gabled entrance porch
        roofStrips(q, 11, 11, 10, 4, AP.wood[3], AP.wood[2]);                      // little gable roof
        q(15, 10, 2, 1, AP.gold[2]);                                              // gilded porch peak
        q(11, 15, 10, 1, AP.wood[3]); q(11, 16, 10, 1, AP.wood[1]);               // porch lintel beam
        q(11, 16, 1, 11, AP.wood[1]); q(20, 16, 1, 11, AP.wood[1]);               // porch posts
        // deep fire-lit arched doorway
        q(13, 17, 6, 1, AP.stone[4]); q(14, 18, 4, 9, AP.ink[0]);                 // arch lintel + deep doorway
        q(13, 18, 1, 9, AP.stone[3]); q(18, 18, 1, 9, AP.stone[3]);               // jambs
        q(14, 24, 4, 3, AP.fire[1]); q(15, 23, 2, 2, AP.fire[2]); q(15, 25, 2, 1, AP.fire[3]);  // firelight within
        // glowing braziers flanking the entrance
        for (const bx of [10, 21]) {
          q(bx, 22, 1, 5, AP.wood[1]); q(bx - 1, 20, 3, 2, AP.stone[2]); q(bx - 1, 20, 3, 1, AP.stone[3]);
          q(bx, 19, 1, 1, AP.fire[2]); q(bx, 18, 1, 1, AP.fire[3]);
        }
        // arched glowing windows in the hall
        for (const wx of [7, 22]) { q(wx, 18, 3, 4, AP.ink[0]); q(wx, 18, 3, 1, AP.stone[4]); q(wx + 1, 19, 1, 2, AP.fire[1]); }
        // twin faction banners flying from the towers
        q(4, 3, 1, 8, AP.wood[2]); q(5, 3, 4, 3, fac[2]); q(5, 6, 3, 1, fac[1]); q(5, 3, 4, 1, fac[3]);
        q(27, 3, 1, 8, AP.wood[2]); q(23, 3, 4, 3, fac[2]); q(23, 6, 3, 1, fac[1]); q(23, 3, 4, 1, fac[3]);
      }
    },
    // FARM — a tilled field of furrowed crop rows (green shoots ripening to gold at
    // L3) with a rail fence, a small shed in the corner, and a scarecrow.
    farm(p, lv) {
      const q = p.hi, tier = lv;
      const crop = tier >= 3 ? AP.gold[2] : AP.grass[4], cropL = tier >= 3 ? AP.gold[3] : AP.grass[3];
      ART.shadedRect(q, 0, 0, 32, 32, AP.soil, 2);                  // tilled soil, whole plot
      for (let i = 0; i < 8; i++) {                                 // furrow rows with crops
        const ry = (3 + i * 3.5) | 0;
        q(1, ry, 30, 1, AP.soil[1]); q(1, ry - 1, 30, 1, AP.soil[3]);
        for (let x = 2 + (i & 1) * 2; x < 30; x += 3) { q(x, ry - 1, 1, 1, crop); if (tier >= 2) q(x, ry - 2, 1, 1, cropL); }
      }
      bWall(q, 22, 4, 8, 6, tier, 3); bRoof(q, 20, 0, 12, 4, tier, 4);   // shed, back-right
      q(24, 6, 3, 4, AP.ink[0]);                                    // shed door
      for (let fx = 1; fx < 31; fx += 4) q(fx, 30, 1, 2, AP.wood[2]);    // rail fence
      q(0, 30, 32, 1, AP.wood[3]); q(0, 0, 1, 30, AP.wood[2]);
      q(6, 13, 1, 6, AP.wood[2]); q(4, 15, 5, 1, AP.wood[2]);       // scarecrow: post + arms
      q(5, 10, 3, 3, AP.thatch[2]); q(5, 10, 3, 1, AP.thatch[3]); q(6, 11, 1, 1, AP.ink[1]);   // straw head
    },
    // HUNTER'S LODGE — read from the great antlered skull mounted over the door, a
    // drying rack hung with pelts and meat, and a wolf pelt stretched on a frame.
    lodge(p, lv) {
      const q = p.hi, tier = lv;
      ART.dropShadow(p, 8, 14, 13);
      // the lodge hut, with a hide slung along the eave
      bWall(q, 9, 15, 13, 11, tier, 8);
      bRoof(q, 7, 8, 17, 7, tier, 9);
      q(10, 14, 11, 1, AP.hide[2]); q(10, 14, 11, 1, AP.hide[2]);
      // a great ANTLERED SKULL trophy over the door — the hunter's mark
      q(12, 10, 6, 3, AP.bone[2]); q(12, 10, 6, 1, AP.bone[1]); q(14, 13, 2, 1, AP.bone[1]);
      q(13, 11, 1, 1, AP.ink[0]); q(16, 11, 1, 1, AP.ink[0]);       // eye sockets
      q(11, 7, 1, 3, AP.bone[1]); q(10, 6, 1, 2, AP.bone[2]); q(9, 8, 1, 1, AP.bone[1]); q(12, 7, 1, 1, AP.bone[2]);   // left antler
      q(18, 7, 1, 3, AP.bone[1]); q(19, 6, 1, 2, AP.bone[2]); q(20, 8, 1, 1, AP.bone[1]); q(17, 7, 1, 1, AP.bone[2]);  // right antler
      // door
      q(13, 19, 4, 7, AP.ink[0]); q(12, 18, 6, 1, AP.wood[3]); q(13, 19, 1, 7, AP.wood[2]); q(16, 19, 1, 7, AP.wood[2]);
      // a DRYING RACK (right) hung with a pelt and a strip of meat
      q(24, 13, 1, 13, AP.wood[2]); q(29, 13, 1, 13, AP.wood[2]); q(24, 13, 6, 1, AP.wood[3]);
      q(25, 15, 2, 6, AP.hide[2]); q(25, 15, 2, 1, AP.hide[3]);     // hung pelt
      q(28, 15, 1, 4, AP.red[1]); q(28, 15, 1, 1, AP.red[2]);       // strip of meat
      // a WOLF PELT stretched on an A-frame out front (the wolf-handler theme)
      q(2, 18, 5, 6, AP.pelt[2]); q(2, 18, 5, 1, AP.pelt[3]); q(2, 18, 1, 6, AP.pelt[1]);
      q(1, 17, 1, 8, AP.wood[1]); q(7, 17, 1, 8, AP.wood[1]); q(3, 20, 1, 1, AP.ink[1]); q(5, 20, 1, 1, AP.ink[1]);
    },
    // LUMBER CAMP — read from a lean-to shelter over a stack of cut logs (ring ends
    // showing), a sawhorse with a log under a two-man saw, and a chopping stump with
    // an axe buried in it.
    lumber(p, lv) {
      const q = p.hi, tier = lv;
      ART.dropShadow(p, 8, 14, 13);
      // open LEAN-TO shelter (back) — its posts/base carry the material tier
      bWall(q, 3, 13, 8, 7, tier, 5);
      for (let i = 0; i < 9; i++) q(2 + i, 12 - (i >> 1), 2, 1, tier >= 3 ? AP.wood[2] : AP.thatch[2]);   // slanted lean-to roof
      q(2, 12, 10, 1, tier >= 3 ? AP.wood[4] : AP.thatch[3]);
      // a STACK of cut logs with pale ring ends (front-left)
      for (let r = 0; r < 3; r++) { const ly = 26 - r * 3;
        for (let lx = 5; lx < 15; lx += 4) { ART.shadedCircle(q, lx, ly, 2, AP.wood, 2); q(lx, ly, 1, 1, AP.thatch[2]); q(lx - 1, ly - 1, 1, 1, AP.wood[3]); }
      }
      // a SAWHORSE with a log across it under a two-man saw (right)
      q(20, 22, 1, 5, AP.wood[1]); q(27, 22, 1, 5, AP.wood[1]); q(19, 24, 10, 1, AP.wood[2]);   // trestle
      q(18, 19, 12, 2, AP.wood[2]); q(18, 19, 12, 1, AP.wood[3]); q(18, 19, 1, 2, AP.thatch[2]); q(29, 19, 1, 2, AP.thatch[1]);  // log
      q(22, 17, 6, 1, AP.stone[3]); q(22, 16, 1, 2, AP.wood[1]); q(27, 16, 1, 2, AP.wood[1]);   // saw blade + handles
      // a chopping STUMP with an AXE sunk into it (front-right)
      ART.shadedCircle(q, 23, 29, 2, AP.wood, 1); q(23, 29, 1, 1, AP.thatch[2]);
      q(25, 24, 1, 5, AP.wood[2]); q(24, 23, 3, 2, AP.stone[3]); q(24, 23, 3, 1, AP.stone[4]);
      q(17, 28, 1, 1, AP.thatch[2]); q(30, 26, 1, 1, AP.wood[3]);   // wood chips
    },
    // QUARRY — an open stepped stone pit with a dark deep cut, stacks of squared
    // blocks, a timber crane hoisting a block, rubble and a pick. Timber shoring is
    // added as the works deepen with each tier.
    quarry(p, lv) {
      const q = p.hi, tier = lv;
      ART.stoneTexture(q, 0, 0, 32, 32, 11);                        // rocky ground, whole plot
      ART.shadedRect(q, 5, 6, 22, 21, AP.stone, 1);                 // stepped pit
      ART.shadedRect(q, 9, 10, 14, 13, AP.stone, 0);
      q(12, 13, 8, 7, AP.ink[1]);                                   // deep cut
      for (const [bx, by] of [[2, 24], [6, 27], [2, 20]]) { q(bx, by, 4, 3, AP.stone[3]); q(bx, by, 4, 1, AP.stone[4]); q(bx, by + 2, 4, 1, AP.stone[1]); }  // squared blocks
      q(26, 4, 4, 3, AP.stone[3]); q(26, 4, 4, 1, AP.stone[4]);
      // timber crane hoisting a block over the pit
      q(20, 2, 2, 12, AP.wood[1]); q(20, 2, 10, 2, AP.wood[2]); q(20, 2, 10, 1, AP.wood[3]);
      q(28, 4, 1, 6, AP.thatch[1]); ART.shadedRect(q, 27, 10, 3, 3, AP.stone, 2);
      // a pick + scattered rubble
      q(15, 24, 1, 5, AP.wood[2]); q(14, 23, 3, 1, AP.stone[3]); q(14, 24, 1, 1, AP.stone[3]); q(16, 24, 1, 1, AP.stone[3]);
      q(24, 24, 1, 1, AP.stone[1]); q(22, 27, 1, 1, AP.stone[2]); q(3, 15, 1, 1, AP.stone[1]);
      if (tier >= 2) { q(0, 0, 1, 32, AP.wood[2]); q(31, 0, 1, 32, AP.wood[2]); q(0, 0, 32, 1, AP.wood[2]); }   // timber shoring
      if (tier >= 3) { q(0, 31, 32, 1, AP.wood[3]); for (let sx = 4; sx < 30; sx += 6) q(sx, 29, 1, 3, AP.wood[1]); }
    },
    // small dwelling — 1×1, but crafted: fine-grid doorway with depth, footing
    // stones, framed windows, a clay pot and grass at the base
    // HOUSE — unmistakably RESIDENTIAL (never a barracks): a small, cosy cottage
    // with a smoking chimney, a warm hearth-lit window, a plank door, a water barrel
    // and a little flower garden. Compact and domestic.
    house(p, lv) {
      const q = p.hi, tier = lv;
      ART.dropShadow(p, 8, 14, 11);
      // the cottage — a small peaked dwelling
      bWall(q, 8, 16, 16, 10, tier, 9);
      bRoof(q, 6, 8, 20, 8, tier, 10);
      q(15, 6, 2, 3, AP.wood[3]);                                   // little gable-peak beam
      // a chimney with a curl of smoke — the homely heart (stone once past L1)
      q(20, 4, 3, 7, tier >= 2 ? AP.stone[2] : AP.soil[2]); q(20, 4, 3, 1, AP.stone[3]); q(20, 4, 1, 7, AP.stone[3]);
      q(20, 3, 3, 1, AP.ink[1]);                                    // flue mouth
      q(21, 1, 1, 2, 'rgba(214,207,196,0.55)'); q(20, 0, 2, 1, 'rgba(214,207,196,0.32)');  // smoke wisp
      // plank door, left of centre
      q(11, 19, 4, 7, AP.ink[0]); q(10, 18, 6, 1, AP.wood[3]); q(11, 19, 1, 7, AP.wood[2]); q(14, 19, 1, 7, AP.wood[2]);
      q(13, 22, 1, 1, AP.stone[3]); q(11, 25, 4, 1, AP.soil[3]);    // latch + threshold
      // a shuttered window with warm hearth-light within
      q(17, 18, 4, 4, AP.ink[0]); q(17, 18, 4, 1, AP.wood[3]); q(17, 18, 1, 4, AP.wood[2]); q(19, 18, 1, 4, AP.wood[1]);
      q(18, 20, 2, 1, AP.fire[1]); q(18, 20, 1, 1, AP.fire[2]);     // candle glow
      // domestic clutter: a water barrel by the wall, a flower garden, grass
      q(24, 21, 3, 5, AP.wood[1]); q(24, 21, 3, 1, AP.wood[3]); q(24, 23, 3, 1, AP.wood[2]); q(24, 20, 3, 1, AP.water[3]);
      q(6, 24, 2, 2, AP.grass[3]); q(6, 24, 1, 1, AP.grass[4]); q(7, 23, 1, 1, AP.bloom[1]);   // garden tuft + bloom
      q(26, 25, 2, 1, AP.grass[3]); q(25, 24, 1, 1, AP.bloom[0]);
    },
    // WATCHTOWER — a tall, narrow vertical silhouette (a long cast shadow sells the
    // height) with an overhanging lookout platform, arrow slits, and a beacon at the
    // top: a blue watch-pennant that becomes a lit signal fire at the stone tier.
    tower(p, lv) {
      const q = p.hi, tier = lv;
      q(6, 27, 22, 2, ART.STYLE.SHADOW); q(11, 29, 13, 1, ART.STYLE.SHADOW);   // long shadow = height
      bWall(q, 11, 9, 10, 17, tier, 17);                            // tall narrow shaft
      q(11, 25, 10, 1, AP.stone[0]);                               // footing rim
      // overhanging lookout platform (machicolation) at the top
      ART.shadedRect(q, 8, 5, 16, 4, tier >= 3 ? AP.stone : AP.wood, 2);
      q(8, 5, 16, 1, tier >= 3 ? AP.stone[4] : AP.wood[3]); q(8, 9, 16, 1, ART.STYLE.SHADOW);
      if (tier >= 3) for (let cx = 8; cx < 24; cx += 3) q(cx, 3, 2, 2, AP.stone[3]);   // stone crenels
      else for (let cx = 9; cx < 24; cx += 3) q(cx, 3, 1, 2, AP.wood[2]);              // timber railing
      // arrow slits + a viewing gap in the shaft
      q(14, 12, 1, 4, AP.ink[0]); q(17, 12, 1, 4, AP.ink[0]); q(14, 19, 4, 1, AP.ink[0]);
      // door at the base
      q(14, 21, 4, 5, AP.ink[0]); q(13, 20, 6, 1, AP.wood[3]); q(14, 21, 1, 5, AP.wood[2]); q(17, 21, 1, 5, AP.wood[2]);
      // beacon at the top
      if (tier >= 3) { q(14, 1, 4, 1, AP.fire[1]); q(15, 0, 2, 2, AP.fire[2]); q(15, 0, 1, 1, AP.fire[3]); }
      else { q(15, 1, 1, 3, AP.wood[1]); q(16, 1, 3, 2, AP.blue[2]); q(16, 1, 3, 1, AP.blue[3]); }
    },
    // FORWARD CAMP — a peaked campaign tent with a war banner on a tall pole and a
    // stand of planted spears out front; reads instantly as a field encampment, not
    // a permanent hall. Single tier, so it ignores lv.
    warcamp(p, lv, fac) {
      const q = p.hi, cv = AP.thatch;
      ART.dropShadow(p, 8, 14, 13);
      // peaked canvas tent: a triangle from the apex down to a wide hem
      for (let y = 11; y <= 28; y++) {
        const half = Math.round((y - 11) * 0.62) + 1;
        q(16 - half, y, half * 2, 1, y < 19 ? cv[2] : cv[1]);
      }
      q(15, 11, 2, 18, cv[3]);                              // lit ridge seam
      q(8, 28, 16, 1, cv[0]);                               // shaded hem
      q(15, 9, 1, 3, AP.wood[3]);                           // ridge-pole finial
      q(14, 21, 4, 7, AP.ink[0]);                           // dark doorway
      q(13, 21, 1, 7, cv[3]); q(18, 21, 1, 7, cv[0]);       // pinned-back flaps
      // war banner on a tall pole beside the tent
      q(25, 8, 1, 20, AP.wood[2]); q(25, 6, 1, 2, AP.stone[4]);
      q(21, 9, 4, 5, fac[2]); q(21, 9, 4, 1, fac[1]); q(21, 13, 3, 1, fac[0]);
      // a stand of planted spears + a round shield out front (the staging ground)
      for (const sx of [6, 8]) { q(sx, 19, 1, 9, AP.wood[2]); q(sx, 18, 1, 1, AP.stone[4]); }
      ART.shadedCircle(q, 8, 26, 3, AP.hide, 2); q(8, 26, 1, 1, fac[1]);
    },
    // martial hall — read at a glance from the weapon rack (spears + round
    // shields) and the big training-hall door; sturdier reinforced posts
    // BARRACKS — unmistakably MARTIAL (never a house): a broad, sturdy drill hall
    // under a tall faction war-banner, a studded reinforced double door, a rack of
    // spears, round shields mounted on the wall, and a sparring dummy in the yard.
    barracks(p, lv, fac) {
      const q = p.hi, tier = lv;
      ART.dropShadow(p, 8, 14, 15);
      // tall faction war-banner on a pole (left) — the standard, at every tier
      q(3, 1, 1, 24, AP.wood[1]); q(3, 0, 1, 1, AP.gold[2]);
      q(4, 2, 6, 7, fac[2]); q(4, 2, 6, 1, fac[3]); q(4, 8, 5, 1, fac[1]); q(4, 5, 5, 1, fac[0]); q(4, 2, 1, 7, fac[3]);
      // the hall — broad and sturdy, taller than a dwelling
      bWall(q, 7, 15, 20, 11, tier, 13);
      bRoof(q, 5, 6, 24, 9, tier, 14);
      // reinforced studded double door, centre
      q(14, 18, 7, 8, AP.ink[0]);
      q(13, 17, 9, 1, AP.wood[3]); q(13, 18, 1, 8, AP.wood[2]); q(21, 18, 1, 8, AP.wood[2]); q(17, 18, 1, 8, AP.wood[1]);
      q(15, 21, 1, 1, AP.stone[3]); q(19, 21, 1, 1, AP.stone[3]); q(16, 22, 1, 1, AP.stone[4]);   // studs + ring handle
      // round shields mounted on the wall, left of the door
      ART.shadedCircle(q, 10, 19, 2, AP.wood, 2); q(10, 19, 1, 1, fac[2]); q(9, 18, 1, 1, AP.stone[4]);
      ART.shadedCircle(q, 10, 24, 2, AP.hide, 2); q(10, 24, 1, 1, AP.bone[2]);
      // weapon rack: crossed spears with steel heads, right of the door
      q(23, 16, 1, 9, AP.wood[2]); q(25, 16, 1, 9, AP.wood[2]);
      q(22, 15, 2, 1, AP.stone[4]); q(24, 15, 2, 1, AP.stone[4]); q(22, 22, 4, 1, AP.wood[1]);
      // a sparring DUMMY in the yard (right): cross-post, straw head, strapped shield
      q(29, 19, 1, 9, AP.wood[1]); q(27, 20, 5, 1, AP.wood[2]);
      ART.shadedCircle(q, 29, 18, 1, AP.thatch, 2);
      ART.shadedCircle(q, 29, 23, 2, AP.wood, 1); q(29, 23, 1, 1, fac[1]);
    },
    // horse stable — read from the big Dutch stall door with a horse looking out
    // over the shut lower leaf, a hay-loft in the gable, a water trough and a
    // paddock rail. Fine-grid detail on the door, horse and tack.
    stable(p, lv, fac) {
      const d = ART.tierDress(lv), q = p.hi;
      ART.dropShadow(p, 8, 14, 14);
      wallBody(p, 2, 7, 12, 7, d, 15);                              // stable block
      roof(p, 1, 4, 14, 3, d, 16);                                 // gabled roof
      // hay-loft opening in the gable with a bale poking out under a hoist beam
      q(13, 7, 4, 3, AP.ink[0]); q(13, 7, 4, 1, AP.wood[3]);
      q(14, 8, 3, 2, AP.thatch[2]); q(14, 8, 3, 1, AP.thatch[3]);  // hay bale
      q(15, 5, 3, 1, AP.wood[2]); q(17, 5, 1, 2, AP.wood[1]); q(17, 4, 1, 1, AP.wood[0]);  // hoist beam + pulley
      // big timber STALL DOOR — a Dutch door: upper leaf open, lower leaf shut
      q(9, 15, 8, 12, AP.wood[3]); q(10, 16, 6, 10, AP.wood[1]);   // door frame recess
      q(10, 16, 6, 5, AP.ink[0]);                                  // upper leaf open — dark stall within
      q(10, 21, 6, 5, AP.wood[2]);                                 // lower leaf shut
      for (let dx = 11; dx < 16; dx += 2) q(dx, 21, 1, 5, AP.wood[1]);  // plank seams
      q(10, 25, 6, 1, AP.wood[3]); q(15, 22, 1, 1, AP.stone[3]);   // kick-board + latch
      // a HORSE peering out over the shut lower leaf, lit against the dark stall
      q(12, 14, 1, 2, AP.hide[2]); q(14, 14, 1, 2, AP.hide[2]);    // ears
      q(12, 13, 1, 1, AP.ink[1]); q(14, 13, 1, 1, AP.ink[1]);      // ear tips
      q(11, 16, 5, 3, AP.hide[3]);                                 // broad lit forehead/cheek
      q(11, 19, 3, 2, AP.hide[2]); q(11, 21, 2, 1, AP.hide[1]);    // face tapering to the muzzle over the door
      q(15, 16, 1, 5, AP.hair[2]); q(13, 15, 3, 1, AP.hair[1]);    // mane down the neck + forelock
      q(13, 17, 1, 1, AP.ink[0]); q(11, 20, 1, 1, AP.bone[1]);     // eye + nostril highlight
      // hitching post + water trough in the dooryard
      q(5, 19, 1, 7, AP.wood[2]); q(4, 19, 3, 1, AP.wood[3]); q(3, 22, 3, 1, AP.hide[2]);  // post with a slung bridle
      q(21, 23, 7, 3, AP.wood[1]); q(21, 23, 7, 1, AP.wood[2]); q(22, 24, 5, 1, AP.water[3]);  // water trough
      if (d.decor >= 1) {                                          // paddock rail to the side
        for (let fx = 24; fx < 31; fx += 3) q(fx, 17, 1, 4, AP.wood[2]);
        q(24, 17, 7, 1, AP.wood[3]); q(24, 19, 7, 1, AP.wood[1]);
      }
      if (d.decor >= 2) { q(18, 16, 2, 2, AP.stone[3]); q(18, 16, 2, 1, AP.stone[4]); q(18, 18, 2, 1, AP.stone[1]); }  // hung horseshoe
      if (d.banner) banner(p, 0, 0, fac);
    },
    // archery range — read from the big ringed straw target butt (right) peppered
    // with fletched arrows, a fletcher's open-front shelter with a bow rack and
    // arrow barrel (left), a straw practice pell, and a shooting-line rail
    range(p, lv, fac) {
      const d = ART.tierDress(lv), q = p.hi;
      ART.dropShadow(p, 8, 14, 13);
      // fletcher's open-front shelter (left) — bows on a rack, an arrow barrel
      wallBody(p, 1, 7, 6, 6, d, 19);
      roof(p, 0, 5, 8, 2, d, 20);
      q(3, 15, 6, 11, AP.ink[1]); q(3, 15, 6, 1, AP.wood[3]);       // open-front recess (shaded interior)
      q(4, 16, 1, 9, AP.wood[2]); q(7, 16, 1, 9, AP.wood[2]);       // bow-rack posts
      q(4, 17, 1, 3, AP.wood[3]); q(4, 21, 1, 3, AP.wood[3]);       // stacked bows (curved staves)
      q(3, 17, 1, 1, AP.bone[1]); q(3, 21, 1, 1, AP.bone[1]);       // bow tips
      ART.shadedRect(q, 8, 22, 4, 4, AP.wood, 1); q(9, 21, 2, 1, AP.bone[2]); q(9, 20, 1, 2, AP.bone[2]); q(11, 20, 1, 3, AP.bone[1]);  // arrow barrel bristling with shafts
      // a straw practice pell (centre) — a bound-straw post man
      q(15, 15, 3, 11, AP.thatch[2]); q(15, 15, 1, 11, AP.thatch[3]); q(17, 15, 1, 11, AP.thatch[1]);
      for (let ry = 17; ry < 26; ry += 3) q(15, ry, 3, 1, AP.wood[1]);  // binding cords
      q(19, 18, 3, 1, AP.bone[2]); q(21, 17, 1, 1, AP.wood[0]);     // an arrow struck into the pell
      // big ringed straw target butt on legs (right) — the identity
      ART.shadedCircle(q, 25, 12, 6, AP.thatch, 1);                 // straw disc
      ART.shadedCircle(q, 25, 12, 5, AP.bone, 1);
      ART.shadedCircle(q, 25, 12, 4, AP.red, 1);
      ART.shadedCircle(q, 25, 12, 3, AP.bone, 1);
      ART.shadedCircle(q, 25, 12, 2, AP.red, 1);
      q(25, 12, 1, 1, AP.gold[2]);                                  // gilded bullseye
      q(23, 21, 1, 5, AP.wood[1]); q(27, 21, 1, 5, AP.wood[1]); q(23, 24, 5, 1, AP.wood[2]);  // trestle legs
      // arrows peppered into the butt, each with a pale fletch
      for (const [ax, ay] of [[24, 10], [27, 13], [23, 14], [26, 9]]) { q(ax, ay, 2, 1, AP.bone[2]); q(ax + 2, ay - 1, 1, 1, AP.bone[1]); q(ax - 1, ay, 1, 1, AP.wood[0]); }
      // shooting-line rail across the yard
      for (let fx = 1; fx < 22; fx += 5) { q(fx, 27, 1, 2, AP.wood[2]); q(fx, 27, 4, 1, AP.wood[1]); }
      if (d.banner) banner(p, 13, 0, fac);
    },
    // a timber jetty raised on pilings over a boat slip, joined to a sandy shore.
    // Drawn on a TRANSPARENT ground (like the other buildings) so the real water
    // and shore show around it in-game — and so the menu icon has no blue tile
    // clashing with the rest. Fine detail (planks, rails, rope, boat) on the q-grid.
    dock(p, lv, fac) {
      const d = ART.tierDress(lv), q = p.hi, W = AP.water, WD = AP.wood, SD = AP.bone;
      // --- the boat slip: a compact patch of water the pier stands over ---
      p(3, 7, 12, 8, W[2]); p(3, 12, 12, 3, W[1]);                  // slip, deeper toward the front
      q(6, 15, 24, 1, W[0]);                                        // dark far lip
      q(8, 26, 4, 1, W[4]); q(20, 23, 3, 1, W[3]); q(24, 28, 3, 1, W[4]);   // foam + drifting ripples
      // --- sandy shore footing on the left, where the pier joins land ---
      p(0, 4, 3, 8, SD[2]); p(0, 4, 3, 1, AP.grass[2]); p(0, 3, 2, 1, AP.grass[3]);
      p(0, 11, 3, 1, SD[1]); q(0, 24, 6, 1, W[4]);                  // wet-sand waterline + foam
      { const r = ART.rng(23); for (let i = 0; i < 6; i++) q((r() * 6) | 0, 9 + (r() * 6 | 0), 1, 1, r() < 0.5 ? SD[0] : SD[2]); }
      // --- pilings driven into the slip (dark posts, lit collar, shadow on the water) ---
      for (const px of [5, 9, 13]) { p(px, 10, 1, 5, WD[0]); q(px * 2, 19, 2, 1, WD[3]); q(px * 2 + 1, 29, 2, 1, W[0]); }
      // --- the plank deck: a jetty running from the shore out over the slip ---
      ART.woodPlankTexture(p, 2, 6, 12, 4, 23);                     // deck boards, rows 6–9
      p(2, 6, 12, 1, WD[3]);                                        // sunlit front edge
      for (let bx = 4; bx <= 12; bx += 2) q(bx * 2, 13, 1, 6, WD[1]);   // seams between the cross-boards
      // rail along the seaward edge: posts + a top rail
      for (let rx = 3; rx <= 13; rx += 3) q(rx * 2, 8, 1, 4, WD[3]);
      q(6, 8, 22, 1, WD[3]);
      // mooring bollard with a looped rope at the deck's end
      q(27, 13, 2, 4, WD[2]); q(27, 12, 2, 1, AP.stone[3]); q(24, 15, 3, 1, AP.thatch[1]);
      if (d.decor >= 1) ART.shadedRect(p, 4, 6, 2, 2, AP.thatch, 2);        // a crate of catch on the deck
      if (d.decor >= 2) {                                                   // a rowboat moored in the slip
        ART.shadedRect(p, 9, 11, 4, 2, AP.hide, 1);
        q(18, 23, 8, 1, AP.hide[3]); q(19, 26, 6, 1, WD[2]); q(24, 21, 1, 3, WD[2]);   // gunwale, thwart, oar
      }
      if (d.banner) banner(q, 3, 3, fac);                          // faction pennant on the shore post
    },
    // trading post: an open market stall — a striped faction awning on timber
    // posts over a plank counter piled with clay pots, a grain basket, bundled
    // furs and a little stack of trade coin. Reads as "market" at a glance.
    trade(p, lv, fac) {
      const d = ART.tierDress(lv), q = p.hi, WD = AP.wood, SD = AP.bone, CLAY = AP.soil, TH = AP.thatch, HD = AP.hide;
      ART.dropShadow(p, 8, 14, 13);
      // stall frame: two posts and a ridge beam
      p(1, 5, 1, 9, WD[1]); p(14, 5, 1, 9, WD[1]);
      p(1, 4, 14, 1, WD[2]); q(2, 27, 2, 1, WD[0]); q(28, 27, 2, 1, WD[0]);
      // striped awning canopy — faction cloth alternating with cream
      for (let ax = 1; ax < 15; ax++) p(ax, 1, 1, 4, (ax & 1) ? fac[2] : SD[2]);
      p(1, 1, 14, 1, SD[2]); p(1, 4, 14, 1, fac[0]);               // sun-lit top + shaded valance
      for (let vx = 2; vx < 30; vx += 4) { q(vx, 10, 2, 1, fac[1]); q(vx + 1, 11, 1, 1, fac[0]); }  // scalloped tabs
      // plank counter across the open front
      ART.woodPlankTexture(p, 2, 11, 12, 2, 19); p(2, 11, 12, 1, WD[3]);
      // --- WARES ---
      p(6, 6, 1, 4, CLAY[2]); p(6, 6, 1, 1, CLAY[3]); q(11, 12, 2, 1, CLAY[1]);   // tall amphora (neck highlight)
      ART.shadedCircle(p, 4, 9, 1, CLAY, 2); q(6, 15, 3, 1, CLAY[3]);             // round clay pot
      ART.shadedCircle(p, 8, 9, 1, TH, 2);  q(15, 15, 3, 1, TH[3]);              // woven grain basket
      ART.shadedRect(p, 9, 8, 2, 2, HD, 2); q(19, 15, 3, 1, HD[3]);             // bundled furs
      ART.shadedRect(p, 2, 8, 2, 2, SD, 1); q(5, 15, 2, 1, SD[2]);              // grain sack at the post
      // a little stack of TRADE COIN on the counter (the gold accent)
      q(24, 21, 4, 1, AP.gold[1]); q(24, 20, 4, 1, AP.gold[2]); q(25, 19, 3, 1, AP.gold[2]); q(25, 18, 2, 1, AP.gold[3]);
      // level dressing
      if (d.decor >= 1) { ART.shadedRect(p, 11, 9, 2, 2, TH, 2); q(24, 13, 2, 3, HD[2]); q(25, 12, 1, 1, WD[1]); }  // extra crate + a hung pelt
      if (d.decor >= 2) { ART.shadedCircle(p, 12, 8, 1, CLAY, 2); q(6, 5, 3, 1, AP.bloom[2]); q(9, 5, 2, 1, AP.bloom[1]); }  // more pottery + a dyed-cloth bolt
      if (d.banner) banner(p, 14, 0, fac);                          // trader's pennant
    },
    // SIEGE WORKSHOP — an open work-yard where a CATAPULT takes shape on the stocks
    // beside the engineers' hut: timber frame on wheels, a throwing arm cocked with a
    // stone in the cup, a winch, seasoned timber and a pile of shot.
    siege(p, lv, fac) {
      const q = p.hi, tier = lv;
      ART.dropShadow(p, 8, 14, 15);
      // engineers' hut (left)
      bWall(q, 2, 14, 10, 12, tier, 25);
      bRoof(q, 0, 8, 14, 7, tier, 26);
      q(5, 18, 4, 8, AP.ink[0]); q(4, 17, 6, 1, AP.wood[3]); q(5, 18, 1, 8, AP.wood[2]); q(8, 18, 1, 8, AP.wood[2]);  // doorway
      // the CATAPULT on the stocks (right) — the identity
      q(16, 22, 14, 2, AP.wood[2]); q(16, 22, 14, 1, AP.wood[3]); q(17, 21, 1, 2, AP.wood[1]); q(28, 21, 1, 2, AP.wood[1]);  // frame rails
      ART.shadedCircle(q, 18, 25, 2, AP.wood, 1); ART.shadedCircle(q, 27, 25, 2, AP.wood, 1);   // wheels
      q(20, 14, 2, 9, AP.wood[1]); q(24, 14, 2, 9, AP.wood[1]); q(20, 14, 6, 1, AP.wood[3]);     // A-frame uprights + pivot
      for (let i = 0; i < 6; i++) q(19 - i, 15 + i * 1.2 | 0, 2, 1, AP.wood[3]);                 // throwing arm cocked back-left
      q(14, 13, 3, 3, AP.wood[2]); q(14, 13, 3, 1, AP.stone[3]); q(15, 13, 2, 1, AP.stone[2]);   // cup loaded with a stone
      q(21, 19, 3, 2, AP.wood[0]);                                  // winch drum
      // seasoned timber stacked + a pile of shot
      q(13, 27, 8, 1, AP.wood[2]); q(13, 26, 8, 1, AP.wood[3]);
      ART.shadedCircle(q, 26, 29, 1, AP.stone, 2); q(28, 29, 1, 1, AP.stone[2]); q(24, 29, 1, 1, AP.stone[2]);
      if (tier >= 3) banner(q, 2, 4, fac);
    },
    // sappers' camp: an earthworks yard — a dug pit with a spoil mound, a timber
    // A-frame derrick, planks and racked tools (shovels/picks), a wheelbarrow
    sapper(p, lv, fac) {
      const d = ART.tierDress(lv), q = p.hi;
      ART.dropShadow(p, 8, 14, 13);
      wallBody(p, 1, 8, 6, 6, d, 31);                                // engineers' hut (left)
      roof(p, 0, 5, 7, 3, d, 32);
      p(2, 10, 2, 4, AP.ink[0]);                                     // doorway
      // a dug pit with a spoil mound of turned earth (the earthworks)
      ART.shadedRect(p, 8, 10, 7, 4, AP.soil, 1); q(16, 20, 14, 1, AP.soil[0]);   // pit floor + shadow lip
      p(8, 10, 7, 1, AP.soil[3]);                                    // lit near rim
      q(19, 15, 4, 2, AP.soil[3]); q(20, 14, 2, 1, AP.soil[3]);      // spoil mound (lit)
      q(24, 21, 3, 1, AP.grass[2]); q(17, 21, 2, 1, AP.grass[2]);    // grass clods
      // timber A-frame derrick over the pit with a hanging block
      q(21, 7, 1, 8, AP.wood[1]); q(26, 8, 1, 7, AP.wood[1]); q(21, 7, 6, 1, AP.wood[2]);
      q(23, 8, 1, 4, AP.thatch[1]); ART.shadedRect(q, 22, 12, 3, 2, AP.stone, 2);   // rope + slung block
      // racked tools: a shovel and a pick leaning by the hut
      q(6, 15, 1, 6, AP.wood[2]); q(5, 14, 3, 2, AP.stone[3]);       // shovel (haft + blade)
      q(9, 15, 1, 6, AP.wood[2]); q(8, 14, 1, 1, AP.stone[3]); q(10, 14, 1, 1, AP.stone[3]);  // pick
      // a wheelbarrow of earth
      q(11, 24, 4, 2, AP.wood[1]); q(11, 24, 4, 1, AP.soil[2]); ART.shadedCircle(q, 12, 26, 1, AP.wood, 1);
      if (d.decor >= 1) { q(3, 20, 4, 1, AP.wood[3]); q(3, 19, 4, 1, AP.wood[2]); }   // stacked planks
      if (d.banner) banner(p, 0, 0, fac);
    },
    wall(p, lv) { drawWallMask(p, lv, 2 | 8); },   // menu/panel icon: an east-west run
    gate(p, lv) {
      const c = wallPal(lv);
      p(0, 5, 16, 9, c.base);
      p(0, 5, 16, 1, c.top);
      p(0, 2, 4, 12, c.base); p(0, 2, 4, 1, c.top);   // twin towers
      p(12, 2, 4, 12, c.base); p(12, 2, 4, 1, c.top);
      p(5, 7, 6, 7, PAL.dark);
      p(5, 8, 3, 6, PAL.trunk); p(8, 8, 3, 6, PAL.woodD);
      p(7, 10, 1, 1, PAL.dark);
      p(1, 6, 2, 1, c.seam); p(13, 10, 2, 1, c.seam);
      if (c.stick) { p(1, 3, 1, 4, c.stick); p(14, 3, 1, 4, c.stick); }
      if (c.gold) { p(0, 2, 4, 1, PAL.gold); p(12, 2, 4, 1, PAL.gold); }
    },
  };
  // build the player (blue) set and a rival (red) set; full-tile and
  // auto-tiling sprites skip the outline pass so they keep tiling seamlessly
  const NO_OUTLINE = new Set(['farm', 'quarry', 'wall', 'gate']);
  Sprites.buildingA = {};
  // walls & gates stay full-tile (32px) so they auto-tile seamlessly; every
  // other building is drawn at HIGH RES (64px) with a proportional 2px outline
  const LORES_BLD = new Set(['wall', 'gate']);
  for (const key of Object.keys(B_DRAW)) {
    const hi = !LORES_BLD.has(key);
    const build = (fac) => [1, 2, 3].map(lv => {
      const c = (hi ? tileB : tile)(p => B_DRAW[key](p, lv, fac));
      return NO_OUTLINE.has(key) ? c : ART.outline(c, 1);
    });
    Sprites.building[key] = build(AP.blue);
    Sprites.buildingA[key] = build(AP.red);
  }
  // auto-tiling atlases: wallMask[level-1][mask 0..15], gateMask[level-1][0=horizontal,1=vertical]
  Sprites.wallMask = [1, 2, 3].map(lv =>
    Array.from({ length: 16 }, (_, m) => tile(p => drawWallMask(p, lv, m))));
  Sprites.gateMask = [0, 1, 2].map(li =>
    [Sprites.building.gate[li], tile(p => drawGateVertical(p, li + 1))]);

  // a proper work-site: a lashed timber scaffold over a dug foundation with a
  // half-laid stone footing, stacked materials, and a leaning ladder. Drawn at
  // high res with rope lashings, plank grain and mortar seams in the fine grid.
  Sprites.misc.construction = ART.outline(tileB(p => {
    const W = AP.wood, ST = AP.stone, TH = AP.thatch;
    ART.dropShadow(p, 8, 14, 13);
    // cleared, dug foundation pad
    p(2, 12, 12, 3, AP.soil[2]);
    p(2, 12, 12, 1, AP.soil[3]);                                  // lit lip
    p(2, 14, 12, 1, AP.soil[1]);                                  // shaded far edge
    // a STONE FOOTING going in along the back — tapering off where work stopped
    for (let i = 0; i < 5; i++) {
      const bx = 3 + i * 2;
      p(bx, 10, 2, 2, ST[i < 3 ? 2 : 1]);                         // laid blocks (unfinished run)
      p(bx, 10, 2, 1, ST[3]);
      p.hi(bx * 2, 21, 2, 1, ST[0]);                             // mortar seam
    }
    // TIMBER SCAFFOLD — three uprights, two working platforms, a diagonal brace
    p(3, 2, 1, 11, W[2]); p(3, 2, 1, 1, W[3]);                    // left upright
    p(8, 1, 1, 12, W[2]); p(8, 1, 1, 1, W[3]);                    // centre upright
    p(12, 2, 1, 11, W[2]);
    p(3, 3, 10, 1, W[3]); p(3, 7, 10, 1, W[3]);                   // lift beams
    for (let i = 0; i < 5; i++) p(4 + i, 7 - i, 1, 1, W[1]);      // cross-brace
    // plank walkway on the lower platform, with grain
    p(4, 8, 8, 1, W[3]);
    for (let x = 4; x < 12; x += 2) p.hi(x * 2 + 1, 17, 1, 1, W[1]);
    // rope lashings at the frame joints
    for (const [lx, ly] of [[3, 3], [8, 3], [12, 3], [3, 7], [8, 7], [12, 7]]) {
      p.hi(lx * 2 - 1, ly * 2, 3, 1, TH[1]); p.hi(lx * 2, ly * 2 + 1, 1, 1, TH[3]);
    }
    // MATERIALS — a stack of timber logs (left), dressed stone blocks (right),
    // a reed bundle waiting to be laid
    p(0, 10, 3, 1, W[3]); p(0, 11, 3, 1, W[2]); p(0, 12, 3, 1, W[3]);
    p.hi(1, 21, 1, 1, TH[2]); p.hi(1, 23, 1, 1, TH[2]);          // log ring-ends
    ART.shadedRect(p, 13, 11, 3, 2, ST, 2);
    p.hi(28, 23, 1, 1, ST[0]); p.hi(30, 23, 1, 1, ST[0]);        // block seams
    p(6, 11, 2, 2, TH[2]); p(6, 11, 2, 1, TH[3]);               // reed bundle
    // a ladder leaning on the frame
    p.hi(20, 6, 1, 13, W[1]); p.hi(23, 6, 1, 13, W[1]);
    for (let r = 0; r < 6; r++) p.hi(20, 8 + r * 2, 4, 1, W[2]);
    // sawdust / wood shavings scattered on the ground
    const rr = ART.rng(51);
    for (let i = 0; i < 9; i++) p.hi(5 + (rr() * 22) | 0, 25 + (rr() * 4) | 0, 1, 1, i % 2 ? TH[1] : W[3]);
  }), 1);

  // the 2×2 Town Center going up — the great TIMBER LONG-HALL under construction
  // (the shape the TC takes from level 2 on), drawn at 128px so it stays crisp
  // across the big footprint. A SUBSTANTIAL half-built hall, not a bare frame,
  // on the fine 32-grid (`q`) matching the finished L2 TC's mass and density: a
  // laid stone footing course, a post-and-beam timber frame with the front bays
  // planked and the right bays still open, a deep-set doorway being framed, and
  // the long GABLE roof half-raised — thatch courses combed onto the lit slope,
  // open bare rafters with purlins on the other, carved gable-end posts (the
  // left bone finial set, the right not yet). A scaffold, a gin-pole crane
  // hoisting a roof beam, stacked timber/thatch/stone, a ladder to the roof and
  // a dropped adze. Reads clearly as the long-hall being raised — the level-2
  // town center taking shape, not the old roundhouse.
  Sprites.misc.constructionBig = ART.outline(tileB(p => {
    const q = p.hi, W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil, BO = AP.bone;
    const rr = ART.rng(71);
    q(6, 27, 21, 2, ART.STYLE.SHADOW); q(9, 29, 14, 1, ART.STYLE.SHADOW);          // broad contact shadow
    q(4, 25, 24, 3, SO[2]); q(4, 25, 24, 1, SO[3]); q(4, 27, 24, 1, SO[1]);        // dug foundation pad
    for (let i = 0; i < 12; i++) { q(4 + i * 2, 23, 2, 2, ST[(i & 1) ? 2 : 1]); q(4 + i * 2, 23, 2, 1, ST[3]); } // full laid stone footing course
    // POST-AND-BEAM timber frame of the long-hall — uprights on the footing, a
    // top plate and a mid rail; the right bays stand proud as bare, open frame
    for (const px of [5, 10, 16, 22, 26]) { q(px, 14, 1, 9, W[1]); q(px, 14, 1, 1, W[3]); }
    q(22, 11, 1, 3, W[1]); q(26, 11, 1, 3, W[1]);                                   // proud post-tops (unfinished right bays)
    q(16, 11, 1, 12, W[0]);                                                          // strong corner post at the planked/open seam
    q(5, 14, 22, 1, W[3]); q(5, 19, 22, 1, W[2]);                                   // top plate + mid rail
    // WALLS going in — front-left bays fully planked, right bays only half-planked
    ART.woodPlankTexture(q, 5, 15, 11, 8, 5); q(5, 15, 11, 1, W[3]);                // finished plank wall (front-left)
    ART.woodPlankTexture(q, 16, 19, 11, 4, 7); q(16, 19, 11, 1, W[3]);             // half-raised plank wall (right)
    q(13, 17, 6, 1, W[3]); q(14, 18, 4, 5, AP.ink[0]);                              // door lintel + deep-set doorway being framed
    q(13, 18, 1, 5, W[2]); q(18, 18, 1, 5, W[2]);                                   // jambs
    // long GABLE ROOF being raised — carved gable-end posts (left finial set), a
    // ridge beam across, thatch courses laid on the lit slope, open bare rafters
    // + purlins on the other
    q(3, 4, 1, 10, W[1]); q(3, 4, 1, 1, W[3]); q(28, 4, 1, 10, W[1]);              // gable-end posts
    q(2, 3, 2, 2, BO[1]); q(2, 3, 1, 1, BO[2]);                                     // left bone finial (set)
    q(4, 8, 24, 1, W[3]); q(4, 9, 24, 1, W[1]);                                     // ridge beam
    ART.thatchTexture(q, 3, 5, 13, 8, 6); q(3, 5, 13, 1, TH[3]);                    // laid thatch (lit left slope)
    for (let sx = 5; sx < 15; sx += 3) q(sx, 5, 1, 7, rr() < 0.5 ? TH[1] : TH[3]); // combed strands
    q(2, 13, 14, 1, TH[1]); q(4, 13, 12, 1, TH[0]);                                 // eave overhang + deep eave shadow onto the wall (left)
    for (let rx = 17; rx <= 27; rx += 2) { q(rx, 9, 1, 5, W[2]); q(rx, 9, 1, 1, W[3]); } // open bare rafters (right slope)
    q(16, 9, 12, 1, W[1]); q(17, 11, 11, 1, W[0]);                                  // ridge purlin + mid purlin over the bare rafters
    // scaffold — poles framing the work, a lower rail + left platform, lashings
    for (const px of [1, 30]) { q(px, 5, 1, 20, W[2]); q(px, 5, 1, 1, W[3]); }
    q(1, 20, 29, 1, W[2]); q(1, 11, 6, 1, W[2]); q(1, 10, 6, 1, W[3]);             // lower rail + left platform
    for (const [lx, ly] of [[1, 11], [30, 11], [1, 20], [30, 20]]) { q(lx, ly, 1, 1, TH[1]); q(lx, ly + 1, 1, 1, TH[3]); }
    // gin-pole crane (top-right) hoisting a roof beam on a rope
    q(29, 0, 1, 9, W[1]); q(24, 0, 6, 1, W[2]); q(25, 1, 1, 6, TH[1]);
    q(22, 7, 5, 1, W[3]); q(22, 8, 5, 1, W[2]);                                     // beam swinging on the hoist
    // stacked materials: timber bundle (left), thatch/reed pile (front), stone (right)
    q(0, 21, 4, 1, W[3]); q(0, 22, 4, 1, W[2]); q(0, 23, 4, 1, W[3]); q(0, 24, 4, 1, W[2]);
    q(1, 21, 1, 1, TH[2]); q(3, 22, 1, 1, TH[2]); q(1, 23, 1, 1, TH[2]);            // log ring-ends
    q(9, 26, 6, 2, TH[2]); q(9, 26, 6, 1, TH[3]); q(10, 27, 4, 1, TH[1]);          // thatch/reed pile
    ART.shadedRect(q, 27, 24, 4, 3, ST, 2); q(29, 26, 1, 1, ST[0]);                // dressed stone blocks
    // a ladder leaning up to the roof work + a dropped adze + scattered sawdust
    q(6, 14, 1, 10, W[1]); q(9, 14, 1, 10, W[1]);
    for (let r = 0; r < 5; r++) q(6, 15 + r * 2, 4, 1, W[2]);
    q(19, 24, 3, 1, W[1]); q(21, 23, 1, 2, ST[3]);                                  // dropped adze (handle + head)
    for (let i = 0; i < 14; i++) q(5 + (rr() * 22) | 0, 25 + (rr() * 4) | 0, 1, 1, i % 2 ? TH[1] : W[3]);  // sawdust
  }, 128), 2);

  // the 2×2 Town Center going up to LEVEL 3 — the great STONE HALL under
  // construction (the keep the TC becomes at the refined tier). A masons' work
  // site, distinct from the timber long-hall raising: a stepped dressed-stone
  // plinth, coursed walls rising with dressed quoins (front-left near full
  // height, the right run stepping down where the masons stopped), a corner
  // tower stub with its first merlons and arrow-slit, the first roof timbers
  // laid over the finished bay, a gin-pole crane hoisting a dressed block, stacks
  // of cut stone, a mortar tub and trowel, a scaffold and a ladder. Reads as the
  // grand keep going up — the level-3 town center.
  Sprites.misc.constructionBig3 = ART.outline(tileB(p => {
    const q = p.hi, W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    const rr = ART.rng(53);
    q(6, 27, 21, 2, ART.STYLE.SHADOW); q(9, 29, 14, 1, ART.STYLE.SHADOW);            // broad contact shadow
    q(4, 25, 24, 3, SO[2]); q(4, 25, 24, 1, SO[3]); q(4, 27, 24, 1, SO[1]);          // dug foundation pad
    for (let i = 0; i < 12; i++) { q(4 + i * 2, 23, 2, 2, ST[(i & 1) ? 3 : 2]); q(4 + i * 2, 23, 2, 1, ST[4]); } // stepped dressed-stone plinth
    // COURSED STONE WALLS rising — front-left near full height with dressed
    // quoins, the right run stepping down course by course where work stopped
    ART.stoneTexture(q, 5, 11, 12, 12, 21); q(5, 11, 12, 1, ST[4]);
    for (let i = 0; i < 11; i += 2) q(5, 11 + i, 2, 2, (i & 2) ? ST[4] : ST[3]);     // dressed quoins up the finished corner
    for (let i = 0; i < 5; i++) { const cx = 17 + i * 2, top = 12 + i * 2; q(cx, top, 2, 23 - top, ST[2]); q(cx, top, 2, 1, ST[4]); q(cx, top, 1, 23 - top, ST[3]); } // stepped-down unfinished right run
    q(16, 10, 1, 13, ST[0]);                                                          // strong corner at the raised/unfinished seam
    q(9, 15, 6, 1, ST[4]); q(10, 16, 4, 7, AP.ink[0]); q(9, 16, 1, 7, ST[3]); q(14, 16, 1, 7, ST[3]);  // doorway going in
    // a corner TOWER stub rising at the left — first merlons, an arrow-slit
    ART.stoneTexture(q, 1, 5, 4, 18, 33); q(1, 5, 4, 1, ST[4]);
    q(1, 4, 1, 1, ST[3]); q(3, 4, 1, 1, ST[3]);                                       // first merlons
    for (let ty = 8; ty < 22; ty += 3) q(1, ty, 4, 1, ST[1]);                         // course lines
    q(2, 9, 2, 3, AP.ink[1]); q(2, 9, 2, 1, ST[4]);                                   // arrow-slit
    // the first ROOF timbers over the finished bay — a ridge beam + bare rafters
    q(6, 7, 11, 1, W[3]); q(6, 8, 11, 1, W[1]);
    for (let rx = 7; rx <= 15; rx += 2) { q(rx, 8, 1, 3, W[2]); q(rx, 8, 1, 1, W[3]); }
    // GIN-POLE crane (top-right) hoisting a dressed stone block on a rope
    q(29, 0, 1, 12, W[1]); q(21, 0, 8, 1, W[2]); q(22, 1, 1, 8, TH[1]);
    ART.shadedRect(q, 20, 9, 4, 3, ST, 3); q(20, 9, 4, 1, ST[4]); q(22, 11, 1, 1, ST[0]);  // dressed block on the hook
    // scaffold poles + a lower rail + a plank platform + lashings
    for (const px of [0, 30]) { q(px, 5, 1, 20, W[2]); q(px, 5, 1, 1, W[3]); }
    q(0, 19, 31, 1, W[2]); q(0, 12, 6, 1, W[2]); q(0, 11, 6, 1, W[3]);
    for (const [lx, ly] of [[0, 12], [30, 12], [0, 19], [30, 19]]) { q(lx, ly, 1, 1, TH[1]); q(lx, ly + 1, 1, 1, TH[3]); }
    // stacked materials: cut-stone blocks (both sides), a mortar tub + trowel
    ART.shadedRect(q, 26, 22, 5, 4, ST, 3); q(26, 22, 5, 1, ST[4]); q(28, 24, 1, 1, ST[0]); q(30, 25, 1, 1, ST[0]);
    q(0, 21, 4, 4, ST[2]); q(0, 21, 4, 1, ST[3]); q(1, 22, 1, 1, ST[0]); q(3, 23, 1, 1, ST[0]);
    q(9, 25, 5, 3, W[1]); q(9, 25, 5, 1, W[2]); q(10, 26, 3, 1, SO[2]);              // mortar tub with grey mortar
    q(13, 24, 3, 1, W[2]); q(15, 23, 1, 2, ST[3]);                                    // dropped trowel
    // a ladder to the wall-head + scattered stone chips and dust
    q(19, 13, 1, 10, W[1]); q(22, 13, 1, 10, W[1]);
    for (let r = 0; r < 5; r++) q(19, 14 + r * 2, 4, 1, W[2]);
    for (let i = 0; i < 14; i++) q(5 + (rr() * 22) | 0, 25 + (rr() * 4) | 0, 1, 1, i % 2 ? ST[3] : ST[1]);  // stone chips
  }, 128), 2);

  /* ---------------- units ---------------- */
  // pose: idle | walk | gather | fight ; c = colour set
  function humanoid(p, f, pose, c) {
    const bob = (pose === 'idle' && f === 1) ? 1 : 0;
    const y = 3 + bob;
    p(6, 15, 4, 1, 'rgba(0,0,0,0.3)');
    // legs
    if (pose === 'walk') {
      if (f === 0) { p(6, 11, 1, 3, c.pants); p(9, 11, 1, 2, c.pants); }
      else { p(6, 11, 1, 2, c.pants); p(9, 11, 1, 3, c.pants); }
    } else { p(6, 11, 1, 3, c.pants); p(9, 11, 1, 3, c.pants); }
    // body
    p(6, y + 3, 4, 5, c.body);
    p(6, y + 3, 4, 1, c.accent);
    // head
    p(7, y, 2, 2, PAL.skin);
    p(7, y - 1, 2, 1, c.hair);
    // arms + tool — the pose IS the villager's task, each with its own tool and
    // a two-frame swing (raised → struck, with debris flying on the strike)
    if (pose === 'gather') {                    // fell timber: lashed stone axe
      const ay = f === 0 ? y + 3 : y + 5;
      p(10, ay, 3, 1, PAL.skin);               // swinging arm
      p(12, ay - 2, 1, 3, PAL.trunk);          // wooden haft
      p(12, ay - 3, 2, 1, PAL.rockL);          // lashed stone head
      if (f === 1) { p(14, ay, 1, 1, APx.thatch[3]); p(14, ay + 1, 1, 1, APx.wood[3]); }  // wood chips fly
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'mine') {               // quarry stone: pickaxe
      const ay = f === 0 ? y + 2 : y + 5;
      p(10, ay, 3, 1, PAL.skin);               // arm
      p(12, ay - 3, 1, 4, PAL.trunk);          // long haft
      p(11, ay - 3, 3, 1, APx.stone[3]);       // pick head bar
      p(11, ay - 2, 1, 1, APx.stone[2]); p(13, ay - 2, 1, 1, APx.stone[2]);  // down-curved points
      if (f === 1) { p(12, ay + 1, 1, 1, APx.stone[4]); p(13, ay + 1, 1, 1, APx.fire[2]); }  // spark off rock
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'farm') {               // till the soil: hoe
      const ay = f === 0 ? y + 2 : y + 4;
      p(10, ay, 3, 1, PAL.skin);               // arm
      p(12, ay - 1, 1, 1, PAL.trunk); p(13, ay, 1, 2, PAL.trunk);   // angled haft
      p(13, ay + 2, 2, 1, APx.stone[3]);       // hoe blade
      if (f === 1) { p(14, ay + 3, 1, 1, APx.soil[2]); p(13, ay + 3, 1, 1, APx.soil[1]); }  // turned earth
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'build') {              // raise a building: mallet
      const ay = f === 0 ? y + 2 : y + 4;
      p(10, ay, 3, 1, PAL.skin);               // arm
      p(12, ay - 1, 1, 3, PAL.trunk);          // handle
      p(11, ay - 2, 3, 2, PAL.woodD);          // mallet head
      p(11, ay - 2, 3, 1, PAL.wood);           // lit top face
      if (f === 1) { p(13, ay + 2, 1, 1, APx.bone[2]); p(11, ay + 2, 1, 1, APx.thatch[3]); }  // impact spark
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'guard') {              // defend the village: pickaxe in anger
      const ax = f === 0 ? 10 : 12;
      p(10, y + 4, Math.max(1, ax - 9), 1, PAL.skin);   // reaching arm
      p(ax, y + 1, 1, 4, PAL.trunk);           // raised haft
      p(ax - 1, y, 3, 1, APx.stone[3]);        // pick head
      p(ax - 1, y + 1, 1, 1, APx.stone[2]); p(ax + 1, y + 1, 1, 1, APx.stone[2]);
      if (f === 1) { p(ax + 1, y + 1, 1, 1, APx.bone[2]); p(ax + 1, y + 3, 1, 1, APx.fire[2]); }  // strike flash
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'fight') {              // soldiers: spear thrust
      if (c.noThrust) {                         // unit draws its OWN weapon (sword, bow…) in its overlay
        p(5, y + 4, 1, 2, PAL.skin); p(10, y + 4, 1, 2, PAL.skin);   // both hands at the ready
      } else {
        const ax = f === 0 ? 10 : 12;
        p(10, y + 4, ax - 7, 1, PAL.skin);
        p(ax, y + 2, 1, 4, c.spear || PAL.trunk); // spear
        p(ax, y + 1, 1, 1, PAL.rockL);
        if (f === 1) { p(ax + 1, y + 1, 1, 1, APx.bone[2]); p(ax + 1, y + 3, 1, 1, APx.fire[2]); } // strike flash
        p(5, y + 4, 1, 2, PAL.skin);
      }
    } else {
      p(5, y + 4, 1, 2, PAL.skin);
      p(10, y + 4, 1, 2, PAL.skin);
    }
  }
  function unitSheet(c, extra) {
    return {
      idle: frames(2, (p, g, f) => { humanoid(p, f, 'idle', c); if (extra) extra(p, f, 'idle'); }),
      walk: frames(2, (p, g, f) => { humanoid(p, f, 'walk', c); if (extra) extra(p, f, 'walk'); }),
      gather: frames(2, (p, g, f) => { humanoid(p, f, 'gather', c); if (extra) extra(p, f, 'gather'); }),
      fight: frames(2, (p, g, f) => { humanoid(p, f, 'fight', c); if (extra) extra(p, f, 'fight'); }),
    };
  }
  // SAPPER — the terraforming engineer. Earth-toned worker with a slung shovel;
  // its 'work' pose swings a pick (digging/breaching). Faction collar via accent,
  // so friendly and rival sappers read apart like every other unit.
  function sapperSheet(acc) {
    const c = { body: '#7a6a44', accent: acc, pants: '#5a4a2c', hair: PAL.hair };
    const slung = (p) => { p(11, 4, 1, 6, PAL.trunk); p(10, 3, 2, 2, APx.stone[3]); };   // shovel on the back at rest
    return {
      idle: frames(2, (p, g, f) => { humanoid(p, f, 'idle', c); slung(p); }),
      walk: frames(2, (p, g, f) => { humanoid(p, f, 'walk', c); slung(p); }),
      work: frames(2, (p, g, f) => humanoid(p, f, 'mine', c)),   // pick swing = dig / breach
    };
  }
  /* HI-RES VILLAGER — authored natively on the 32-grid (2× the legacy 16-grid rig),
     the same fine-grid technique the buildings use. A Neolithic worker: a hide-and-
     woven-cloth wrap dyed the village colour with a leather belt, bare limbs, a
     suggested face under a shock of hair, and a stone tool that IS the task. Every
     pose and its 2-frame swing timing match the old rig, and the figure sits at
     exactly 2× the old coordinates, so positioning, size and gameplay are unchanged
     — just far crisper. c = { body, accent, pants, hair } (village dye + earth tones). */
  function villagerHi(q, f, pose, c, female) {
    const SK = APx.skin, HR = APx.hair, HD = APx.hide, INK = APx.ink;
    const body = c.body, accent = c.accent, pants = c.pants;
    const bob = (pose === 'idle' && f === 1) ? 2 : 0;
    const y = 6 + bob;                                   // head-top row (32-grid)

    // ---- contact shadow (faint — below the outline alpha threshold, so it's not ringed)
    q(12, 30, 9, 1, 'rgba(20,16,10,0.26)'); q(14, 31, 5, 1, 'rgba(20,16,10,0.15)');

    const step = pose === 'walk';
    const upL = step && f === 1 ? 1 : 0, upR = step && f === 0 ? 1 : 0;

    if (female) {
      // ---- WOMAN: bare lower legs peek below a flared skirt; a long braid of hair.
      // The skirt's A-line silhouette + long hair read as female at a glance, even at
      // 32px, so the two sexes never blur together.
      for (const [lx, up] of [[13, upL], [17, upR]]) {       // shins below the hem, stepping
        q(lx, 25, 2, 3 - up, SK[1]); q(lx, 25, 1, 3 - up, SK[2]);
        q(lx, 28 - up, 2, 1, INK[1]);
      }
      q(12, y + 6, 8, 8, body);                              // bodice
      q(19, y + 6, 1, 8, accent);                            // right-side shade
      q(12, y + 6, 8, 2, accent); q(14, y + 6, 4, 1, body);  // neckline yoke (faction trim)
      q(13, y + 8, 1, 5, accent); q(16, y + 9, 1, 4, accent);// draped folds
      q(12, y + 13, 8, 1, HD[1]);                            // waist sash
      // flared skirt widening from the waist to the hem, with pleats
      q(11, y + 14, 10, 2, body); q(10, y + 16, 12, 3, body);
      q(10, y + 18, 12, 1, accent); q(10, y + 16, 1, 3, accent); q(21, y + 16, 1, 3, accent);
      q(13, y + 15, 1, 4, accent); q(16, y + 15, 1, 4, accent); q(19, y + 15, 1, 4, accent);
    } else {
      // ---- MAN: hide leggings and separate legs, broad-shouldered tunic.
      for (const [lx, up] of [[13, upL], [17, upR]]) {
        q(lx, 22, 2, 4 - up, pants); q(lx, 22, 1, 4 - up, HD[2]);   // legging + lit seam
        q(lx, 26 - up, 2, 2, SK[1]); q(lx, 26 - up, 1, 2, SK[2]);   // bare shin
        q(lx, 28 - up, 2, 1, INK[1]);                              // foot
      }
      q(12, y + 6, 8, 10, body);
      q(19, y + 6, 1, 10, accent); q(12, y + 14, 8, 2, accent);   // right & hem shade
      q(12, y + 6, 6, 1, body);
      q(13, y + 8, 1, 6, accent); q(16, y + 9, 1, 5, accent);     // draped folds
      q(12, y + 6, 8, 2, accent); q(14, y + 6, 4, 1, body);       // neckline yoke (faction)
      q(11, y + 6, 1, 3, body); q(20, y + 6, 1, 3, body);         // broader shoulders (male build)
      q(11, y + 6, 1, 1, accent); q(20, y + 6, 1, 1, accent);
      q(12, y + 13, 8, 2, HD[1]); q(12, y + 13, 8, 1, HD[2]);     // leather belt + lit edge
      q(15, y + 13, 1, 2, INK[2]);                               // belt buckle
    }

    // ---- head + eyes (shared)
    q(14, y, 4, 5, SK[2]);                                      // face
    q(14, y, 3, 1, SK[3]); q(14, y, 1, 4, SK[3]);               // top-left highlight
    q(17, y + 1, 1, 4, SK[1]);                                  // right-cheek shade
    q(15, y + 2, 1, 1, INK[1]); q(17, y + 2, 1, 1, INK[1]);     // eyes
    if (female) {
      // long hair: crown + side locks flowing down past the shoulders, framing the face
      q(13, y - 1, 6, 3, HR[1]); q(13, y - 1, 6, 1, HR[2]);      // full crown
      q(12, y + 1, 1, 8, HR[1]); q(19, y + 1, 1, 8, HR[1]);      // long side locks
      q(12, y + 1, 1, 8, HR[0]); q(19, y + 8, 1, 1, HR[0]);
      q(13, y, 1, 1, HR[2]); q(18, y, 1, 1, HR[1]);             // temple wisps
      q(15, y + 3, 2, 1, SK[3]);                                 // soft cheeks (highlight)
    } else {
      // short hair + a beard along the jaw (male)
      q(13, y - 1, 6, 2, HR[1]); q(13, y - 1, 6, 1, HR[2]);      // hair crown
      q(13, y + 1, 1, 2, HR[0]); q(18, y + 1, 1, 2, HR[0]);      // short sideburns
      q(14, y + 4, 4, 1, HR[1]); q(14, y + 3, 1, 1, HR[1]); q(17, y + 3, 1, 1, HR[1]);  // beard on jaw + chin
      q(15, y + 3, 2, 1, SK[1]);                                 // nose shadow above the beard
    }

    // ---- arms + tool. A resting left arm; the right arm swings the tool (raised on
    // frame 0, struck on frame 1, with debris on the strike) — the pose IS the job.
    const armL = () => { q(11, y + 8, 2, 4, SK[2]); q(11, y + 8, 1, 4, SK[3]); q(11, y + 11, 2, 1, SK[2]); };   // left arm at side
    const spark = (x, yy, a, b) => { q(x, yy, 1, 1, a); q(x + 1, yy + 1, 1, 1, b); };
    if (pose === 'gather') {                    // fell timber — lashed stone axe
      armL(); const ay = f === 0 ? y + 7 : y + 11;
      q(19, y + 8, 3, 1, SK[2]); q(21, ay - 1, 1, ay - y - 6, SK[2]);   // shoulder → forearm to the haft
      q(22, ay - 4, 2, 6, PAL.trunk); q(22, ay - 4, 1, 6, APx.wood[3]);  // haft
      q(21, ay - 5, 4, 2, APx.stone[3]); q(21, ay - 5, 4, 1, APx.stone[4]);  // stone axe-head
      q(20, ay - 4, 1, 1, HD[1]);                                       // lashing
      if (f === 1) { spark(25, ay, APx.thatch[3], APx.wood[3]); q(26, ay + 2, 1, 1, APx.wood[2]); }  // chips fly
    } else if (pose === 'mine') {               // quarry stone — pickaxe
      armL(); const ay = f === 0 ? y + 5 : y + 11;
      q(19, y + 8, 3, 1, SK[2]); q(21, ay - 1, 1, ay - y - 6, SK[2]);
      q(23, ay - 6, 1, 8, PAL.trunk); q(23, ay - 6, 1, 8, APx.wood[3]);  // long haft
      q(21, ay - 6, 5, 1, APx.stone[3]);                                // pick bar
      q(21, ay - 5, 1, 1, APx.stone[2]); q(25, ay - 5, 1, 1, APx.stone[2]);  // curved points
      if (f === 1) spark(24, ay + 2, APx.stone[4], APx.fire[2]);        // spark off rock
    } else if (pose === 'farm') {               // till the soil — hoe
      armL(); const ay = f === 0 ? y + 5 : y + 9;
      q(19, y + 8, 3, 1, SK[2]); q(21, ay - 1, 2, 2, SK[2]);
      q(23, ay - 1, 1, 2, PAL.trunk); q(24, ay + 1, 1, 3, PAL.trunk); q(24, ay + 1, 1, 3, APx.wood[3]);  // bent haft
      q(24, ay + 4, 3, 1, APx.stone[3]); q(24, ay + 4, 3, 1, APx.stone[4]);  // hoe blade
      if (f === 1) { spark(26, ay + 6, APx.soil[2], APx.soil[1]); q(25, ay + 6, 1, 1, APx.soil[1]); }  // turned earth
    } else if (pose === 'build') {              // raise a building — mallet
      armL(); const ay = f === 0 ? y + 5 : y + 9;
      q(19, y + 8, 3, 1, SK[2]); q(21, ay - 1, 1, 3, SK[2]);
      q(23, ay - 2, 1, 5, PAL.trunk); q(23, ay - 2, 1, 5, APx.wood[3]);  // handle
      q(21, ay - 4, 5, 3, PAL.woodD); q(21, ay - 4, 5, 1, PAL.wood);     // mallet head + lit face
      q(21, ay - 4, 1, 3, APx.wood[1]);                                  // banding
      if (f === 1) spark(23, ay + 4, APx.bone[2], APx.thatch[3]);        // impact
    } else if (pose === 'guard') {              // defend — pickaxe raised in anger
      armL(); const ax = f === 0 ? 20 : 23;
      q(19, y + 8, Math.max(1, ax - 18), 1, SK[2]); q(ax, y + 2, 1, 8, SK[2]);   // reaching arm
      q(ax, y + 1, 1, 8, PAL.trunk); q(ax, y + 1, 1, 8, APx.wood[3]);            // raised haft
      q(ax - 2, y, 5, 1, APx.stone[3]); q(ax - 2, y, 5, 1, APx.stone[4]);        // pick head
      q(ax - 2, y + 1, 1, 1, APx.stone[2]); q(ax + 2, y + 1, 1, 1, APx.stone[2]);
      if (f === 1) spark(ax + 2, y + 2, APx.bone[2], APx.fire[2]);               // strike flash
    } else {                                    // idle — both hands rest at the sides
      armL();
      q(19, y + 8, 2, 4, SK[2]); q(20, y + 8, 1, 4, SK[1]); q(19, y + 11, 2, 1, SK[2]);
    }
  }
  // villagers carry the full working repertoire: chop (wood), mine (stone),
  // farm (food), build (hammer) and guard (defend with a pickaxe)
  function villagerSheet(c, female) {
    const mk = (pose) => framesU(2, (q, g, f) => villagerHi(q, f, pose, c, female), 1);   // 1px outline, matching the soldiers
    return {
      idle: mk('idle'), walk: mk('walk'), gather: mk('gather'),
      mine: mk('mine'), farm: mk('farm'), build: mk('build'), guard: mk('guard'),
    };
  }
  /* ===================== HI-RES MILITARY RIG =====================
     Foot soldiers share the villager's 32-grid proportions (so the whole cast reads
     at one scale) but stand to arms: the base draws the dyed body, head and a resting
     left arm; each unit's `ex(q,f,pose,c)` overlays its identifying helm / armour /
     shield / weapon. A plain spearman thrusts from the base in the fight pose; units
     that carry their own weapon set c.noThrust and draw it themselves. c = { body
     (unit material), accent (FACTION dye on collar/trim), pants, spear }. */
  function humanoidHi(q, f, pose, c, ex) {
    const SK = APx.skin, HR = APx.hair, HD = APx.hide, INK = APx.ink;
    const body = c.body, accent = c.accent, pants = c.pants || '#4a3a24';
    const bob = (pose === 'idle' && f === 1) ? 2 : 0;
    const y = 6 + bob;
    // contact shadow (faint — below the outline alpha threshold)
    q(12, 30, 9, 1, 'rgba(20,16,10,0.26)'); q(14, 31, 5, 1, 'rgba(20,16,10,0.15)');
    // legs — leggings, bare shins, feet; walk alternates the lead leg
    const step = pose === 'walk';
    const upL = step && f === 1 ? 1 : 0, upR = step && f === 0 ? 1 : 0;
    for (const [lx, up] of [[13, upL], [17, upR]]) {
      q(lx, 22, 2, 4 - up, pants); q(lx, 22, 1, 4 - up, HD[2]);
      q(lx, 26 - up, 2, 2, SK[1]); q(lx, 26 - up, 1, 2, SK[2]);
      q(lx, 28 - up, 2, 1, INK[1]);
    }
    // torso — unit material, dyed collar/trim = faction, cinched by a belt
    q(12, y + 6, 8, 10, body);
    q(19, y + 6, 1, 10, accent); q(12, y + 14, 8, 2, accent);
    q(12, y + 6, 8, 2, accent); q(14, y + 6, 4, 1, body);        // shoulder yoke (faction)
    q(12, y + 13, 8, 2, HD[1]); q(12, y + 13, 8, 1, HD[2]);      // belt
    // head + face + hair (a helm from `ex` may cover this)
    q(14, y, 4, 5, SK[2]); q(14, y, 3, 1, SK[3]); q(14, y, 1, 4, SK[3]); q(17, y + 1, 1, 4, SK[1]);
    q(13, y - 1, 6, 2, HR[1]); q(13, y - 1, 6, 1, HR[2]);
    q(15, y + 2, 1, 1, INK[1]); q(17, y + 2, 1, 1, INK[1]);
    // resting left arm
    q(11, y + 8, 2, 4, SK[2]); q(11, y + 8, 1, 4, SK[3]); q(11, y + 11, 2, 1, SK[2]);
    // right arm — a plain spearman thrusts here; armed units handle it in `ex`
    if (pose === 'fight' && !c.noThrust) {
      const ax = f === 0 ? 20 : 23;
      q(19, y + 8, Math.max(1, ax - 18), 1, SK[2]); q(ax, y + 4, 1, 4, SK[2]);
      q(ax, y, 1, 9, c.spear || PAL.trunk); q(ax, y - 1, 1, 1, APx.stone[3]);
      if (f === 1) { q(ax + 1, y - 1, 1, 1, APx.bone[2]); q(ax + 1, y + 3, 1, 1, APx.fire[2]); }
    } else if (pose !== 'fight') {
      q(19, y + 8, 2, 4, SK[2]); q(20, y + 8, 1, 4, SK[1]); q(19, y + 11, 2, 1, SK[2]);
    }
    if (ex) ex(q, f, pose, c);
  }
  // build a foot-soldier sheet at hi-res: idle / walk / fight (+ gather kept for
  // parity, unused by combat units). Thinner (1px) outline than the villager.
  function footSheetHi(c, ex) {
    const mk = (pose) => framesU(2, (q, g, f) => humanoidHi(q, f, pose, c, ex), 1);
    return { idle: mk('idle'), walk: mk('walk'), gather: mk('gather'), fight: mk('fight') };
  }
  // helper: the head-top row for the current pose (helms track the idle bob)
  const _hy = (pose, f) => 6 + ((pose === 'idle' && f === 1) ? 2 : 0);

  /* ---- HI-RES foot overlays. Silhouette + arms read the unit TYPE; the collar/trim
     (already drawn by the base) reads the faction. Higher tiers wear better war-gear. */
  const G = APx.gold, RED = APx.red, WD = APx.wood, STN = APx.stone, HDE = APx.hide,
        BONE = APx.bone, LEAF = APx.leaf, FIRE = APx.fire, SKN = APx.skin, INKp = APx.ink;

  // DEFENDER (infantry T1): leather cap, round wooden buckler, a spear (thrust in the
  // fight pose by the base rig; shouldered at rest). The plain, reliable spearman.
  const exDefender = (q, f, pose, c) => {
    const y = _hy(pose, f);
    q(13, y - 2, 6, 2, HDE[1]); q(13, y - 2, 6, 1, HDE[2]); q(13, y - 1, 1, 2, HDE[0]);   // leather cap
    ART.shadedCircle(q, 11, y + 11, 3, WD, 2); q(11, y + 11, 1, 1, STN[3]); q(10, y + 9, 1, 1, c.accent);  // buckler + faction mark
    if (pose !== 'fight') { q(20, y + 7, 3, 1, SKN[2]); q(22, y - 2, 1, 13, WD[1]); q(22, y - 3, 1, 1, STN[3]); }   // spear at rest
  };
  // AXEMAN (infantry T2): fur cap, bare arms (shock troop — no armour), a big stone-
  // headed war-axe hefted over the shoulder, chopping down on the strike.
  const exAxeman = (q, f, pose, c) => {
    const y = _hy(pose, f);
    q(13, y - 2, 6, 2, HDE[2]); q(13, y - 2, 6, 1, HDE[3] || HDE[2]); q(12, y - 1, 1, 2, HDE[1]);   // fur cap
    const down = pose === 'fight' && f === 1;
    if (!down) {                                            // axe raised over the shoulder
      q(20, y + 7, 3, 1, SKN[2]); q(24, y - 3, 2, 12, WD[1]); q(24, y - 3, 1, 12, WD[2]);
      q(21, y - 4, 6, 3, STN[3]); q(21, y - 4, 6, 1, STN[4]); q(21, y - 3, 1, 2, STN[2]); q(20, y - 3, 1, 1, HDE[1]);
    } else {                                                // axe chopped down
      q(20, y + 8, 4, 1, SKN[2]); q(25, y + 5, 2, 7, WD[1]); q(25, y + 5, 1, 7, WD[2]);
      q(22, y + 11, 6, 3, STN[3]); q(22, y + 11, 6, 1, STN[4]);
      q(25, y + 14, 1, 1, FIRE[2]); q(22, y + 14, 1, 1, BONE[2]);
    }
  };
  // BRONZE CHAMPION / elite (infantry T3): the showpiece heavy — crested bronze helm,
  // muscled cuirass with greave hints, a great round hoplite shield blazoned with the
  // faction colour, and a bronze sword (shouldered at rest, thrust on the strike).
  const exElite = (q, f, pose, c) => {
    const y = _hy(pose, f);
    // muscled bronze cuirass over the torso
    q(12, y + 6, 8, 8, G[1]); q(12, y + 6, 8, 1, G[2]); q(19, y + 6, 1, 8, G[0]);
    q(13, y + 9, 6, 1, G[0]); q(14, y + 8, 1, 3, G[2]); q(17, y + 8, 1, 3, G[2]);   // pectoral contours
    q(12, y + 6, 8, 2, c.accent);                                                   // faction shoulder trim
    q(12, y + 13, 7, 2, HDE[1]); q(12, y + 13, 7, 1, HDE[2]);                       // war belt
    // crested bronze helm with a visor
    q(13, y - 2, 6, 4, G[1]); q(13, y - 2, 6, 1, G[2]); q(13, y + 1, 6, 1, G[0]);
    q(14, y, 1, 1, INKp[1]); q(16, y, 1, 1, INKp[1]);                               // eye slits
    q(15, y - 4, 2, 2, RED[2]); q(15, y - 4, 2, 1, RED[3] || RED[2]); q(16, y - 2, 1, 2, RED[1]);   // red horsehair crest
    // great round hoplite shield on the left
    ART.shadedCircle(q, 10, y + 11, 4, G, 1); q(10, y + 11, 1, 1, G[3] || G[2]); q(9, y + 11, 1, 1, WD[1]);
    q(10, y + 8, 2, 1, c.accent); q(10, y + 14, 2, 1, c.accent);                    // faction blazon
    // bronze sword
    if (pose === 'fight') {
      const ax = f === 0 ? 21 : 25;
      q(19, y + 8, Math.max(1, ax - 18), 1, SKN[2]); q(ax - 1, y + 7, 3, 1, WD[1]);
      q(ax, y, 1, 9, G[2]); q(ax, y - 1, 1, 1, G[3] || G[2]);
      if (f === 1) { q(ax + 1, y - 1, 1, 1, FIRE[2]); q(ax - 1, y + 3, 1, 1, BONE[2]); }
    } else {
      q(20, y + 8, 2, 1, SKN[2]); q(22, y - 3, 1, 12, G[2]); q(22, y - 3, 1, 1, G[3] || G[2]); q(21, y + 7, 3, 1, WD[1]);
    }
  };

  // shared bow overlay: a vertical bow on the right, gripped by the right hand, with
  // a quiver on the back. In the fight pose it nocks & draws (f0) then looses an
  // arrow streaking right (f1). tall = a longbow's reach; recurve/fire = the Fire
  // Archer's flaming recurve. Ranged units are noThrust — the bow IS the attack.
  const drawBow = (q, f, pose, c, y, o) => {
    const stave = o.stave || WD[2];
    const top = o.tall ? y - 2 : y + 2, bot = o.tall ? y + 17 : y + 15;
    q(21, top, 1, bot - top, stave); q(20, top, 1, 1, stave); q(20, bot - 1, 1, 1, stave);     // stave + curled tips
    if (o.recurve) { q(22, top + 1, 1, 1, stave); q(22, bot - 2, 1, 1, stave); }
    if (o.fire) { q(20, top - 1, 1, 1, FIRE[3]); q(f ? 21 : 20, top - 2, 1, 1, FIRE[1]); q(20, bot, 1, 1, FIRE[3]); q(f ? 20 : 21, bot + 1, 1, 1, FIRE[1]); }
    q(19, y + 9, 2, 1, SKN[2]);                                                                 // right hand grips the bow
    q(10, y + 5, 1, 5, WD[0]); q(10, y + 4, 1, 1, o.fire ? FIRE[2] : BONE[2]);                  // quiver on the back
    if (pose === 'fight') {
      const head = o.fire ? FIRE[3] : BONE[2];
      if (f === 0) { q(16, y + 9, 5, 1, BONE[2]); q(15, y + 9, 1, 1, head); q(18, y + 8, 1, 1, WD[0]); }   // nocked, drawn back
      else { q(23, y + 9, 5, 1, BONE[2]); q(28, y + 9, 1, 1, head); if (o.fire) q(27, y + 8, 1, 1, FIRE[1]); }  // loosed, streaking right
    }
  };
  // ARCHER (ranged T1): a plain self-bow, leather, a small quiver.
  const exArcher = (q, f, pose, c) => { const y = _hy(pose, f); q(13, y - 2, 6, 2, HDE[1]); q(13, y - 2, 6, 1, HDE[2]); drawBow(q, f, pose, c, y, { stave: WD[2] }); };
  // LONGBOWMAN (ranged T2): a taller stave for the longest human reach, green hood.
  const exLongbow = (q, f, pose, c) => { const y = _hy(pose, f); q(13, y - 2, 6, 2, LEAF[1]); q(13, y - 2, 6, 1, LEAF[2]); drawBow(q, f, pose, c, y, { tall: true, stave: WD[1] }); };
  // FIRE ARCHER / marksman (ranged T3): a flaming recurve bow, a quiver of fire
  // arrows, dark-leather hood — looses a burning arrow.
  const exMarksman = (q, f, pose, c) => { const y = _hy(pose, f); q(13, y - 2, 6, 2, INKp[2]); q(13, y - 2, 6, 1, HDE[1]); drawBow(q, f, pose, c, y, { tall: true, fire: true, recurve: true, stave: WD[1] }); };

  /* HI-RES MOUNTED rig (32-grid): a side-view horse facing right with a seated rider.
     The horse's legs gallop across the 2 frames; the rider (dyed body + faction collar)
     carries a spear (thrust), a saddle bow (looses right), or a couched lance (gold
     tip). c = { horse, horseD, body, accent, pants, bow, lance, tip }. */
  function riderSheetHi(c) {
    const HZ = c.horse, HD = c.horseD, mane = c.horseD;
    const draw = (q, f, pose) => {
      const gallop = (pose === 'walk' || pose === 'fight') && f === 1;
      // ground shadow
      q(8, 29, 18, 1, 'rgba(20,16,10,0.26)'); q(11, 30, 12, 1, 'rgba(20,16,10,0.15)');
      // legs (back pair, front pair) — swap length on the gallop frame
      const legs = [[8, gallop ? 4 : 6], [12, gallop ? 6 : 4], [20, gallop ? 6 : 4], [23, gallop ? 4 : 6]];
      for (const [lx, ll] of legs) { q(lx, 23, 2, ll, HD); q(lx, 23 + ll - 1, 2, 1, INKp[1]); }
      // tail, barrel, belly
      q(5, 17, 2, 6, HD); q(6, 17, 1, 4, HZ);
      q(7, 17, 18, 6, HZ); q(7, 17, 18, 1, HZ); q(8, 22, 16, 1, HD);
      // neck + head rising to the right, with mane, ear and eye
      q(22, 13, 3, 5, HZ); q(24, 11, 4, 4, HZ); q(27, 12, 2, 2, HD); q(26, 9, 2, 2, HZ); q(27, 8, 1, 1, HD);
      q(21, 13, 2, 5, mane); q(28, 12, 1, 1, INKp[1]);
      // ---- rider ----
      const y = 3;
      q(14, 18, 2, 4, c.pants || '#4a3a24'); q(18, 18, 2, 4, c.pants || '#4a3a24');   // straddling legs
      q(13, y + 3, 7, 8, c.body); q(13, y + 3, 7, 2, c.accent); q(19, y + 3, 1, 8, c.accent);  // torso + faction
      q(13, y + 9, 7, 1, HDE[1]);                                                     // belt
      q(14, y, 4, 4, SKN[2]); q(14, y, 3, 1, SKN[3]); q(17, y + 1, 1, 3, SKN[1]);     // head
      q(13, y - 1, 6, 2, APx.hair[1]); q(13, y - 1, 6, 1, APx.hair[2]);               // hair
      q(15, y + 1, 1, 1, INKp[1]); q(17, y + 1, 1, 1, INKp[1]);                       // eyes
      q(11, y + 6, 2, 4, SKN[2]);                                                     // rein arm
      // ---- weapon ----
      if (c.bow) {
        q(21, y + 4, 1, 9, WD[2]); q(20, y + 4, 1, 1, WD[2]); q(20, y + 12, 1, 1, WD[2]);   // saddle bow
        q(19, y + 8, 2, 1, SKN[2]);
        if (pose === 'fight') { if (f === 0) q(17, y + 8, 4, 1, BONE[2]); else { q(23, y + 8, 7, 1, BONE[2]); q(30, y + 8, 1, 1, STN[3]); } }
      } else if (c.lance) {
        q(18, y + 6, 14, 1, WD[2]); q(18, y + 7, 13, 1, WD[1]);                        // long couched lance
        q(31, y + 5, 1, 3, c.tip || PAL.gold); q(30, y + 6, 1, 1, c.tip || PAL.gold);  // gold lance-head
        q(18, y + 6, 2, 2, SKN[2]);                                                    // couching hand
      } else {                                                                          // spear
        if (pose === 'fight') { const tx = f === 0 ? 25 : 29; q(20, y + 7, Math.max(1, tx - 20), 1, SKN[2]); q(tx - 7, y + 7, 8, 1, WD[2]); q(tx, y + 6, 1, 1, STN[3]); if (f === 1) q(tx + 1, y + 6, 1, 1, FIRE[2]); }
        else { q(20, y + 6, 2, 1, SKN[2]); q(21, y - 3, 1, 13, WD[2]); q(21, y - 4, 1, 1, STN[3]); }
      }
    };
    return {
      idle: framesU(2, (q, g, f) => draw(q, 0, 'idle'), 1),
      walk: framesU(2, (q, g, f) => draw(q, f, 'walk'), 1),
      fight: framesU(2, (q, g, f) => draw(q, f, 'fight'), 1),
    };
  }

  // TUNIC COLOURS — a villager's tunic (body + collar) is dyed by village, so
  // your people read at a glance against the enemy's. Extend freely.
  const TUNICS = {
    blue:   { body: '#3f6d99', accent: '#2c4e70' },
    red:    { body: '#a8443a', accent: '#7a2c26' },
    yellow: { body: '#c6a638', accent: '#8a7018' },
    green:  { body: '#2c5a2e', accent: '#193d1a' },   // dark green — reads against the grass
    purple: { body: '#7a4a8f', accent: '#553066' },
    teal:   { body: '#2f9a8f', accent: '#1e6a62' },
    orange: { body: '#c07a2a', accent: '#8a5216' },
    black:  { body: '#37373f', accent: '#212127' },
    white:  { body: '#e2e2da', accent: '#b2b2a8' },
  };
  // two builds per village colour — men and women — so a settlement reads as a mixed
  // populace. render picks by u.female; roughly half of spawned villagers are each.
  Sprites.villager = {};                                   // men (also the default/fallback)
  Sprites.villagerF = {};                                  // women
  for (const name in TUNICS) {
    const t = TUNICS[name];
    Sprites.villager[name] = villagerSheet({ body: t.body, accent: t.accent, pants: '#6e5024', hair: PAL.hair }, false);
    Sprites.villagerF[name] = villagerSheet({ body: t.body, accent: t.accent, pants: '#6e5024', hair: PAL.hair }, true);
  }
  Sprites.villagerTunics = Object.keys(TUNICS);            // exposed for the tunic picker
  Sprites.unit.villager = Sprites.villager.blue;           // default + fallback sheet

  // ---- MILITARY units. The silhouette + tools identify the unit TYPE; the
  // collar / torso stripe (accent) is dyed the VILLAGE colour so friendly and
  // enemy soldiers read apart at a glance — exactly like the villager tunics.
  // Built once per tunic and cached (see Sprites.militaryFor), so only the two
  // colours actually in play cost anything. Gold spear/bow tips stay as rank
  // markers on the elite/marksman/lancer; only the faction collar recolours.
  const FOOT = {
    defender: { body: '#7a6242', pants: '#4a3a24', exHi: exDefender },
    // Bronze Champion — a bronze-age heavy: crested helm, muscled cuirass, big round
    // shield and a bronze sword (thrust in the fight pose, shouldered at rest)
    elite:    { body: '#8a6a3a', pants: '#4a3a24', noThrust: true, exHi: exElite },
    axeman:   { body: APx.hide[2], pants: APx.hide[1], noThrust: true, exHi: exAxeman },
    longbow:  { body: APx.leaf[2], pants: APx.leaf[1], noThrust: true, exHi: exLongbow },
    archer:   { body: '#6a7a4a', pants: '#4a5230', noThrust: true, exHi: exArcher },
    marksman: { body: APx.hide[2], pants: '#3a2c1a', noThrust: true, exHi: exMarksman },
  };
  const RIDERS = {
    rider:       { horse: '#a87848', horseD: '#7a5430', body: '#7a6242' },
    horsearcher: { horse: APx.hide[3], horseD: APx.hide[1], body: APx.leaf[2], bow: true },
    lancer:      { horse: '#8a8078', horseD: '#5d5d64', body: '#8a7248', tip: PAL.gold, lance: true },
  };
  Sprites.military = {};                                    // tunic -> { defender, elite, …, warship }
  Sprites.militaryFor = function (tunic) {
    if (Sprites.military[tunic]) return Sprites.military[tunic];
    const acc = (TUNICS[tunic] || TUNICS.blue).body;        // the bright tunic hue = the identifying collar
    const set = {};
    for (const k in FOOT) set[k] = FOOT[k].exHi
      ? footSheetHi({ body: FOOT[k].body, accent: acc, pants: FOOT[k].pants, spear: PAL.trunk, noThrust: FOOT[k].noThrust }, FOOT[k].exHi)
      : unitSheet({ body: FOOT[k].body, accent: acc, pants: FOOT[k].pants, hair: PAL.hair, spear: PAL.trunk, noThrust: FOOT[k].noThrust }, FOOT[k].extra);
    for (const k in RIDERS) set[k] = riderSheetHi({ horse: RIDERS[k].horse, horseD: RIDERS[k].horseD, body: RIDERS[k].body, accent: acc, bow: RIDERS[k].bow, lance: RIDERS[k].lance, tip: RIDERS[k].tip });
    set.warship = warshipSheet({ hull: PAL.wood, hullD: PAL.woodD, sail: '#e8e8e0', sailD: '#c9c9c0', stripe: acc, crew: '#7a6242', arrow: PAL.rockL });
    set.trebuchet = trebuchetSheet(acc);   // siege engine, but faction-draped so friend/foe reads
    set.sapper = sapperSheet(acc);         // earth-toned engineer, faction collar
    Sprites.military[tunic] = set;
    return set;
  };
  // the blue set is the default/fallback surfaced on Sprites.unit.*
  { const blue = Sprites.militaryFor('blue'); for (const k in blue) Sprites.unit[k] = blue[k]; }
  // barbarians / wildlings: shaggy furs, bone trinkets, teal war paint — a
  // colour family all their own so they never read as the (red) rival tribe
  const BARB = { paint: '#3fb094', fur: '#6e5b40', furD: '#4a3d2c', bone: '#d8cfae' };
  Sprites.unit.raider = unitSheet({ body: BARB.fur, accent: BARB.furD, pants: BARB.furD, hair: '#7a5a30', spear: BARB.bone },
    (p, f) => {
      p(7, 1, 2, 1, BARB.paint);                    // teal face paint
      p(6, 6, 4, 1, BARB.paint);                    // painted chest stripe
      p(5, 5, 1, 2, BARB.furD); p(10, 5, 1, 2, BARB.furD);   // shaggy fur shoulders
      p(6, 2, 1, 1, '#7a5a30'); p(9, 2, 1, 1, '#7a5a30');    // wild hair spills down
    });
  Sprites.unit.brute = unitSheet({ body: BARB.furD, accent: BARB.fur, pants: BARB.fur, hair: '#3a2c1a', spear: BARB.bone },
    (p, f) => {
      p(5, 5, 6, 1, BARB.paint);                    // broad teal war stripe
      p(6, 0, 4, 1, BARB.bone);                     // bone crown
      p(5, 7, 1, 1, BARB.bone); p(10, 7, 1, 1, BARB.bone);   // bone trinkets
      p(4, 6, 1, 3, BARB.furD);                     // hulking fur bulk
    });

  // (axeman & longbow silhouettes are defined in FOOT above, dyed per village)

  // mounted unit: horse + rider with spear (or bow, for the horse archer)
  function riderSheet(c) {
    const draw = (p, f, pose) => {
      p(4, 14, 9, 1, 'rgba(0,0,0,0.3)');
      p(3, 8, 9, 3, c.horse);                                   // horse body
      p(11, 6, 3, 3, c.horse); p(12, 5, 1, 1, c.horseD);        // head + ear
      p(2, 8, 1, 2, c.horseD);                                  // tail
      const l1 = (pose === 'walk' || pose === 'fight') && f === 1 ? 2 : 3;
      const l2 = (pose === 'walk' || pose === 'fight') && f === 1 ? 3 : 2;
      p(4, 11, 1, l1, c.horseD); p(10, 11, 1, l2, c.horseD);    // legs
      p(6, 3, 3, 4, c.body); p(6, 3, 3, 1, c.accent);           // rider torso
      p(7, 1, 2, 2, PAL.skin); p(7, 0, 2, 1, PAL.hair);         // head
      if (c.bow) {
        // bow drawn from the saddle; loosing frame shows the arrow away
        p(10, 1, 1, 5, PAL.trunk); p(9, 1, 1, 1, PAL.trunk); p(9, 5, 1, 1, PAL.trunk);
        if (pose === 'fight' && f === 1) p(12, 2, 3, 1, APx.bone[2]);
      } else if (pose === 'fight') {
        p(9, 4, f === 0 ? 4 : 6, 1, PAL.trunk); p(f === 0 ? 13 : 15, 4, 1, 1, PAL.rockL);
      } else { p(10, 0, 1, 7, PAL.trunk); p(10, 0, 1, 1, c.tip || PAL.rockL); }
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, 0, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      fight: frames(2, (p, g, f) => draw(p, f, 'fight')),
    };
  }
  // (rider, horsearcher, lancer, archer & marksman are defined in FOOT/RIDERS
  // above, their collars dyed the village colour)

  /* ---------------- boats ---------------- */
  // rowing-boat sheet: hull low in the water, crew figure, bobbing animation
  // HI-RES FISHING BOAT (32-grid): a rowing skiff with a fisher; oars while rowing,
  // a rod & line over the side when fishing. Bobs on the swell.
  function fishboatSheet() {
    const W = APx.wood;
    const draw = (q, f, pose) => {
      const y = 16 + (f === 1 ? 1 : 0);
      q(6, y + 5, 20, 1, 'rgba(20,16,10,0.22)');
      q(6, y + 1, 20, 4, W[2]); q(6, y + 1, 20, 1, W[3]); q(8, y + 4, 16, 1, W[1]);   // hull
      q(5, y + 1, 1, 3, W[1]); q(26, y + 1, 1, 3, W[1]);                              // prow / stern
      q(12, y - 3, 4, 5, '#6e5b40'); q(12, y - 3, 4, 1, '#8a7458');                   // fisher
      q(12, y - 6, 4, 3, SKN[2]); q(12, y - 7, 4, 1, APx.hair[1]);                    // head + hair
      if (pose === 'gather') {
        q(16, y - 3, 4, 1, SKN[2]); q(20, y - 6, 1, 4, W[1]);                         // arm + rod
        q(21, y - 6, 1, 10, '#c8d8e0');                                               // line to the water
      } else {
        q(5, y + 1, 2, 4, W[1]); q(25, y + 1, 2, 4, W[1]); q(3, y + 2, 2, 1, W[1]); q(27, y + 2, 2, 1, W[1]);  // oars
      }
      if (f === 1) { q(4, y + 3, 1, 1, AP.water[4]); q(27, y + 3, 1, 1, AP.water[4]); }   // wake
    };
    return {
      idle: framesU(2, (q, g, f) => draw(q, f, 'idle'), 1),
      walk: framesU(2, (q, g, f) => draw(q, f, 'walk'), 1),
      gather: framesU(2, (q, g, f) => draw(q, f, 'gather'), 1),
    };
  }
  // HI-RES WARSHIP (32-grid): a bigger hull with a mast + sail (faction stripe) and a
  // deck archer who looses over the bow in the fight pose. The fire warship adds a
  // burning brazier aft and flaming arrows.
  function warshipSheet(c) {
    const W = APx.wood;
    const draw = (q, f, pose) => {
      const y = 18 + (f === 1 ? 1 : 0);
      q(4, y + 5, 24, 1, 'rgba(20,16,10,0.22)');
      q(4, y, 24, 5, c.hull); q(4, y, 24, 1, W[3]); q(6, y + 3, 20, 1, c.hullD);      // hull
      q(2, y, 2, 3, c.hullD); q(28, y, 2, 3, c.hullD);                                // prow / stern rise
      q(15, y - 16, 2, 16, W[1]);                                                     // mast
      q(17, y - 15, 11, 11, c.sail); q(17, y - 15, 11, 1, c.sailD); q(17, y - 15, 1, 11, c.sailD);   // sail
      q(17, y - 10, 11, 2, c.stripe);                                                 // faction stripe
      q(7, y - 4, 3, 4, c.crew); q(7, y - 7, 3, 3, SKN[2]); q(7, y - 8, 3, 1, APx.hair[1]);   // deck archer
      if (pose === 'fight') {
        q(3, y - 7, 1, 8, W[1]); q(2, y - 6, 1, 1, W[1]); q(2, y - 1, 1, 1, W[1]);    // bow
        q(f === 1 ? 1 : 4, y - 4, 4, 1, c.arrow);                                     // arrow (loosed on f1)
        if (c.flame) { q(3, y - 8, 1, 1, FIRE[2]); q(f === 1 ? 0 : 4, y - 5, 1, 1, FIRE[1]); }
      }
      if (c.flame) { q(23, y - 4, 3, 3, FIRE[1]); q(23, y - 5, 2, 1, FIRE[2]); q(24, y - 6, 1, 1, FIRE[3]); }  // fire brazier aft
      if (f === 1) { q(2, y + 3, 1, 1, AP.water[4]); q(29, y + 3, 1, 1, AP.water[4]); }
    };
    return {
      idle: framesU(2, (q, g, f) => draw(q, f, 'idle'), 1),
      walk: framesU(2, (q, g, f) => draw(q, f, 'walk'), 1),
      fight: framesU(2, (q, g, f) => draw(q, f, 'fight'), 1),
    };
  }
  Sprites.unit.fishboat = fishboatSheet();
  // warship's sail stripe is dyed per village (built in Sprites.militaryFor);
  // Sprites.unit.warship holds the blue fallback set there
  Sprites.unit.fireship = warshipSheet({ hull: '#5d4a30', hullD: '#453722', sail: '#b8b0a0', sailD: '#98907e',
    stripe: PAL.fire, crew: '#5d4a30', arrow: PAL.fire, flame: true });

  // troop transports: broad open hulls built to carry soldiers, not fight.
  // The war transport is longer, with a hide canopy and a shield row.
  // HI-RES TROOP TRANSPORTS (32-grid): broad open hulls built to carry, not fight —
  // a steersman at the stern oar. The War Transport is longer, with a hide canopy
  // amidships and a row of shields along the gunwale.
  function transportSheet(big) {
    const W = APx.wood;
    const draw = (q, f) => {
      const y = 18 + (f === 1 ? 1 : 0);
      const x0 = big ? 2 : 4, w = big ? 28 : 24;
      q(x0, y + 5, w, 1, 'rgba(20,16,10,0.22)');
      q(x0, y, w, 5, W[2]); q(x0, y, w, 1, W[3]); q(x0 + 2, y + 4, w - 4, 1, W[1]);   // hull + wet strake
      q(x0, y, 1, 3, W[1]); q(x0 + w - 1, y, 1, 3, W[1]);                             // prow / stern posts
      q(x0 + 1, y - 1, w - 2, 1, W[3]);                                               // deck rail
      if (big) {
        ART.shadedRect(q, x0 + 8, y - 6, 12, 5, AP.hide, 1); q(x0 + 9, y - 7, 10, 1, AP.hide[2]);   // hide canopy
        for (let i = 0; i < 5; i++) q(x0 + 3 + i * 5, y, 2, 1, AP.bone[2]);           // shield row
      }
      q(x0 + w - 6, y - 4, 3, 4, '#6e5b40'); q(x0 + w - 6, y - 6, 3, 2, SKN[2]);      // steersman
      q(x0 + w - 2, y - 5, 1, 7, W[1]);                                               // steering oar
      if (f === 1) { q(x0 - 1, y + 2, 1, 1, AP.water[4]); q(x0 + w, y + 3, 1, 1, AP.water[4]); }  // bow spray
    };
    return {
      idle: framesU(2, (q, g, f) => draw(q, f), 1),
      walk: framesU(2, (q, g, f) => draw(q, f), 1),
    };
  }
  Sprites.unit.transport = transportSheet(false);
  Sprites.unit.bigtransport = transportSheet(true);

  /* ---------------- siege engines ---------------- */
  // catapult (onager): timber frame on wheels, winch, long throwing arm.
  // fight frame 1 snaps the arm upright and the boulder leaves the cup.
  // HI-RES siege engines (32-grid). Neutral timber machines — no faction dye except
  // the trebuchet's counterweight drape + pennant. Thin (1px) outline.
  function _wheel(q, cx, cy) { ART.shadedCircle(q, cx, cy, 3, AP.wood, 1); q(cx - 1, cy - 1, 1, 1, APx.wood[3]); q(cx, cy, 1, 1, APx.wood[0]); }
  // CATAPULT (onager, siege T1): timber frame on wheels, A-frame, a throwing arm
  // cocked back with a boulder — snaps upright on the strike, the stone away.
  function catapultSheet() {
    const draw = (q, f, pose) => {
      q(4, 29, 24, 1, 'rgba(20,16,10,0.28)');
      _wheel(q, 7, 26); _wheel(q, 24, 26);
      q(4, 22, 24, 3, WD[2]); q(4, 22, 24, 1, WD[3]); q(5, 23, 1, 3, WD[1]); q(26, 23, 1, 3, WD[1]);  // frame rails
      q(8, 20, 2, 3, WD[1]); q(22, 20, 2, 3, WD[1]);                // cross braces
      q(15, 12, 2, 10, WD[1]); q(19, 12, 2, 10, WD[1]); q(14, 11, 8, 1, WD[3]);   // A-frame + pivot
      q(21, 19, 4, 2, WD[0]); q(24, 17, 2, 1, WD[2]);              // winch + handle
      if (pose === 'fight' && f === 1) {
        q(16, 3, 2, 10, WD[3]);                                    // arm snapped upright
        q(13, 2, 5, 2, WD[2]);                                     // empty cup
        q(8, 0, 3, 3, STN[3]); q(8, 0, 2, 1, STN[4]); q(7, 2, 1, 1, WD[1]);  // boulder away!
      } else {
        for (let i = 0; i < 6; i++) q(14 - i * 2, 7 + i * 2, 2, 2, WD[3]);    // arm cocked back-left
        q(2, 5, 4, 4, WD[2]); q(2, 5, 4, 1, WD[3]);                // cup…
        q(3, 5, 3, 2, STN[2]); q(3, 5, 3, 1, STN[3]);             // …loaded with stone
      }
    };
    return { idle: framesU(2, (q, g, f) => draw(q, 0, 'idle'), 1), walk: framesU(2, (q, g, f) => draw(q, f, 'walk'), 1), fight: framesU(2, (q, g, f) => draw(q, f, 'fight'), 1) };
  }
  // SIEGE TOWER (siege T3): a tall plank tower on wheels, ladder up the face,
  // crenellated fighting top — rolled to a wall, soldiers stream over. No fight pose.
  function siegetowerSheet() {
    const draw = (q, f) => {
      const bob = f === 1 ? 1 : 0, top = 6 + bob;
      q(6, 29, 20, 1, 'rgba(20,16,10,0.3)');
      _wheel(q, 10, 26); _wheel(q, 21, 26);
      q(10, top, 12, 20 - bob, WD[2]);                             // tower body
      for (let yy = top + 1; yy < 26; yy += 2) q(10, yy, 12, 1, WD[1]);   // plank courses
      q(10, top, 2, 20 - bob, WD[1]); q(20, top, 2, 20 - bob, WD[1]);     // corner posts
      q(8, top - 2, 16, 2, WD[3]);                                 // fighting-top floor
      q(8, top - 4, 2, 2, WD[2]); q(14, top - 4, 2, 2, WD[2]); q(20, top - 4, 2, 2, WD[2]);  // crenels
      for (let yy = top + 2; yy < 25; yy += 3) q(14, yy, 4, 1, APx.thatch[1]);  // ladder rungs
      q(12, 24, 8, 3, WD[0]);                                      // dark base carriage
    };
    return { idle: framesU(2, (q, g, f) => draw(q, 0), 1), walk: framesU(2, (q, g, f) => draw(q, f), 1) };
  }
  // BALLISTA (siege T2): a giant crossbow on a wheeled frame — the unit-killer.
  // String drawn with a bolt nocked; on the strike the string snaps and the bolt flies.
  function ballistaSheet() {
    const draw = (q, f, pose) => {
      q(4, 29, 24, 1, 'rgba(20,16,10,0.28)');
      _wheel(q, 8, 26); _wheel(q, 23, 26);
      q(5, 22, 22, 3, WD[2]); q(5, 22, 22, 1, WD[3]);              // carriage
      q(14, 12, 4, 10, WD[1]); q(14, 12, 4, 1, WD[3]);             // stock riser
      q(4, 10, 10, 2, WD[3]); q(18, 10, 10, 2, WD[3]);             // bow arms
      q(3, 9, 1, 3, WD[2]); q(28, 9, 1, 3, WD[2]);                 // arm tips
      q(20, 18, 5, 3, WD[0]);                                      // windlass
      if (pose === 'fight' && f === 1) {
        q(5, 11, 22, 1, APx.thatch[1]);                            // string slack forward
        q(12, 3, 8, 1, BONE[2]); q(20, 3, 2, 1, STN[3]);           // bolt away!
      } else {
        q(5, 13, 9, 1, APx.thatch[1]); q(18, 13, 9, 1, APx.thatch[1]);  // string drawn
        q(10, 11, 10, 1, BONE[2]); q(20, 11, 2, 1, STN[3]);        // bolt nocked
      }
    };
    return { idle: framesU(2, (q, g, f) => draw(q, 0, 'idle'), 1), walk: framesU(2, (q, g, f) => draw(q, f, 'walk'), 1), fight: framesU(2, (q, g, f) => draw(q, f, 'fight'), 1) };
  }
  // TREBUCHET (siege T3): the tall counterweight engine. A great A-frame straddles a
  // long throwing arm; the weighted box (draped in the faction colour) hauls up while
  // the sling loads a flaming ball. The strike whips the arm over — ball away, weight
  // slammed down.
  function trebuchetSheet(accent) {
    const draw = (q, f, pose) => {
      q(4, 30, 24, 1, 'rgba(20,16,10,0.3)');
      q(4, 24, 24, 3, WD[2]); q(4, 24, 24, 1, WD[3]);              // heavy base beam
      q(6, 22, 2, 5, WD[1]); q(24, 22, 2, 5, WD[1]);              // outriggers
      _wheel(q, 6, 28); _wheel(q, 24, 28);
      q(12, 8, 2, 16, WD[1]); q(18, 8, 2, 16, WD[1]);            // tall A-frame uprights
      q(10, 10, 3, 2, WD[2]); q(19, 10, 3, 2, WD[2]);           // angled braces
      q(12, 8, 8, 2, WD[3]);                                     // pivot crossbeam
      q(14, 0, 2, 8, WD[2]); q(16, 0, 4, 2, accent); q(16, 2, 2, 1, accent);   // faction pennant on the mast
      if (pose === 'fight' && f === 1) {
        q(5, 1, 2, 8, WD[3]); q(7, 8, 7, 2, WD[3]);              // long arm swung up-left
        q(1, 0, 5, 5, FIRE[2]); q(2, 0, 2, 2, FIRE[3]); q(1, 1, 2, 2, FIRE[1]);  // flaming ball away!
        q(20, 20, 6, 6, WD[0]); q(20, 20, 6, 2, accent);        // weight box slammed down
      } else {
        q(7, 3, 6, 6, WD[0]); q(7, 3, 6, 2, accent);            // weight box hauled up (faction drape)
        q(18, 10, 2, 12, WD[3]); q(18, 20, 6, 2, WD[2]);        // long arm down to the sling
        q(24, 19, 4, 4, FIRE[1]); q(24, 19, 2, 2, FIRE[2]);    // loaded flaming ball, glowing
      }
    };
    return { idle: framesU(2, (q, g, f) => draw(q, 0, 'idle'), 1), walk: framesU(2, (q, g, f) => draw(q, f, 'walk'), 1), fight: framesU(2, (q, g, f) => draw(q, f, 'fight'), 1) };
  }
  Sprites.unit.catapult = catapultSheet();
  Sprites.unit.ballista = ballistaSheet();
  Sprites.unit.siegetower = siegetowerSheet();

  // the kraken — a once-a-game terror. Two writhing frames, drawn big.
  Sprites.misc.kraken = [0, 1].map(f => ART.outline(tile(p => {
    const t = f ? 1 : 0;
    p(1, 12, 3, 1, AP.water[4]); p(12, 13, 3, 1, AP.water[4]);      // churned foam
    // tentacles, curling opposite ways each frame
    p(1, 8 - t, 1, 5, AP.ink[1]); p(1, 7 - t, 1, 1, AP.teal[1]);
    p(3, 6 + t, 1, 7, AP.ink[1]); p(3, 5 + t, 1, 1, AP.teal[1]);
    p(12, 6 - t, 1, 7, AP.ink[1]); p(12, 5 - t, 1, 1, AP.teal[1]);
    p(14, 8 + t, 1, 5, AP.ink[1]); p(14, 7 + t, 1, 1, AP.teal[1]);
    p(5, 4 + t, 1, 4, AP.ink[1]); p(10, 4 - t, 1, 4, AP.ink[1]);    // inner arms
    p(1, 10, 1, 1, AP.teal[2]); p(3, 9, 1, 1, AP.teal[2]);          // suckers
    p(12, 9, 1, 1, AP.teal[2]); p(14, 10, 1, 1, AP.teal[2]);
    ART.shadedCircle(p, 8, 9, 3, [AP.ink[0], AP.ink[1], AP.teal[0], AP.teal[1]], 2);  // mantle
    p(6, 8, 1, 1, AP.fire[2]); p(9, 8, 1, 1, AP.fire[2]);           // burning eyes
    p(8, 11, 1, 1, AP.bone[2]);                                     // beak
  })));

  // the black dragon (SPECIAL EVENT — see G.maybeDragon): a wide dark
  // silhouette, wings beating between two frames, one burning eye. 96x48 px
  // = 3x1.5 tiles when it sweeps over an army.
  Sprites.misc.dragon = [0, 1].map(f => {
    const c = mk(96, 48), g2 = c.getContext('2d');
    const p = (x, y, w, h, col) => { g2.fillStyle = col; g2.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    const B = AP.ink[1], D = AP.ink[0], HL = AP.pelt[1];
    // tail, kinked, with a spade tip
    p(2, 15 - f, 6, 1, B); p(7, 14 - f, 5, 1, B); p(1, 14 - f, 1, 1, D); p(1, 13 - f, 1, 1, D);
    // long body, belly catching a little light
    p(12, 12, 18, 4, B); p(12, 15, 18, 1, D); p(14, 12, 14, 1, HL);
    // spine ridges
    for (let i = 0; i < 5; i++) p(14 + i * 3, 11, 1, 1, D);
    // neck rising to the head
    p(30, 10, 4, 4, B); p(34, 8, 4, 4, B);
    // head: brow, jaw, horns swept back, ember eye
    p(38, 8, 6, 3, B); p(42, 11, 3, 1, D);                       // muzzle + jaw
    p(37, 6, 2, 2, D); p(39, 5, 2, 2, D);                        // horns
    p(41, 9, 1, 1, AP.fire[2]);                                  // the eye
    p(44, 10, 1, 1, AP.fire[1]);                                 // heat at the nostril
    // wings: great bat sails, up-beat and down-beat
    if (f === 0) {
      p(16, 2, 12, 2, B); p(14, 1, 4, 2, D);                     // leading edge up
      for (let i = 0; i < 5; i++) p(17 + i * 2, 4, 1, 8 - i, B); // membrane fingers
      p(27, 4, 1, 3, B);
      p(20, 3, 8, 3, B); p(24, 6, 5, 2, B);                      // membrane fill
    } else {
      p(16, 18, 12, 2, B); p(14, 20, 4, 2, D);                   // swept down
      for (let i = 0; i < 5; i++) p(17 + i * 2, 16 - (4 - i), 1, 6, B);
      p(20, 16, 8, 3, B); p(24, 14, 5, 2, B);
    }
    // hind leg tucked
    p(26, 16, 2, 2, D);
    return ART.outline(c);
  });

  // fish breaking the surface — two frames used as an occasional flourish.
  // Fine-grid: an arcing silver body with a fin, dorsal shadow, eye and a spray
  // of droplets, then the splash ring as it falls back.
  Sprites.misc.fish = [
    tile(p => {
      const f = p.f, B = AP.water, S = AP.bone;
      f(12, 13, 7, 3, S[1]); f(11, 14, 1, 2, S[1]);           // arcing body
      f(12, 13, 6, 1, S[2]);                                  // lit back
      f(18, 11, 2, 4, S[1]); f(19, 11, 1, 2, S[0]);           // tail fin
      f(14, 15, 3, 1, B[2]);                                  // belly shadow
      f(13, 14, 1, 1, AP.ink[0]);                             // eye
      f(15, 13, 1, 1, S[2]);                                  // glint
      f(9, 19, 1, 1, S[2]); f(21, 18, 1, 1, S[2]); f(16, 9, 1, 1, S[2]);   // droplets
    }),
    tile(p => {
      const f = p.f, S = AP.bone;
      f(10, 18, 12, 1, S[2]); f(9, 19, 14, 1, AP.water[4]);   // splash ring
      f(13, 16, 4, 1, S[1]); f(11, 15, 1, 1, S[2]); f(20, 15, 1, 1, S[2]);
    }),
  ];

  // HI-RES beasts (64px / 32-grid, 2× the old density) — a proper quadruped
  // silhouette with a 3-shade body, a distinct head + muzzle, four animated
  // legs (near pair in front, far pair behind & darker), and per-species
  // features. Drawn without an outline here; the shared unit-outline pass below
  // gives every frame its 1px ink edge, exactly like the villagers & soldiers.
  function beastFrames(n, draw) {
    const out = [];
    for (let fr = 0; fr < n; fr++) out.push(tileU((q) => draw(q, fr)));
    return out;
  }
  // ramp = [dark, mid, light]
  function beast(name, ramp, opts) {
    const w = opts.w, h = opts.h;
    const bx = 6, byb = 24, byt = byb - h;                    // body box
    const dark = ramp[0], mid = ramp[1], lite = ramp[2] || ramp[1];
    const BN = AP.bone[2], INK = AP.ink[0];
    const draw = (q, f, attacking) => {
      q(bx - 1, byb + 6, w + 5, 2, 'rgba(20,16,10,0.26)');    // contact shadow
      const gait = f === 0 ? 0 : 1;
      const leg = (lx, fwd, shade) => {                       // a single animated leg
        const ll = fwd ? 6 : 5, off = fwd ? 1 : 0;
        q(lx + off, byb, 2, ll, shade); q(lx + off, byb + ll, 2, 1, INK);
      };
      // far (offside) legs first, one shade down
      leg(bx + 2, gait, dark); leg(bx + w - 5, 1 - gait, dark);
      // tail
      if (opts.tail) {
        if (opts.bushy) { q(bx - 2, byt + 1, 2, 5, mid); q(bx - 3, byt + 2, 1, 3, dark); q(bx - 2, byt + 1, 1, 2, lite); }
        else q(bx - 1, byt + 1, 1, opts.longtail ? 6 : 3, dark);
      }
      // body
      ART.shadedRect(q, bx, byt, w, h, ramp, 1);
      if (opts.hump) { q(bx + 1, byt - 2, 5, 2, mid); q(bx + 1, byt - 2, 4, 1, lite); }   // shoulder hump
      if (opts.spots) { q(bx + 2, byt + 1, 3, 2, opts.spots); q(bx + w - 6, byt + 2, 3, 2, opts.spots); q(bx + 5, byt + h - 2, 2, 1, opts.spots); }
      // neck + head at the front (right)
      const hx = bx + w - 1, hy = byt - 1;
      q(hx - 1, byt, 3, 3, mid);                              // neck
      q(hx, hy, 6, h - 1, mid); q(hx, hy, 6, 1, lite);        // head block, lit top
      q(hx + 5, hy + 2, 2, 2, opts.snout || dark);            // muzzle
      q(hx + 6, hy + 3, 1, 1, INK);                           // nostril
      q(hx + 3, hy + 1, 1, 1, INK);                           // eye
      // ears / horns / antlers / tusks
      if (opts.ears) { q(hx, hy - 2, 1, 2, mid); q(hx + 3, hy - 2, 2, 2, mid); q(hx + 3, hy - 2, 1, 1, lite); }
      if (opts.horns) { q(hx - 1, hy - 2, 1, 2, BN); q(hx + 5, hy - 2, 1, 2, BN); q(hx - 1, hy - 3, 3, 1, BN); }
      if (opts.antlers) {
        q(hx + 1, hy - 5, 1, 5, BN); q(hx + 4, hy - 5, 1, 5, BN);        // main beams
        q(hx, hy - 4, 1, 2, BN); q(hx + 2, hy - 6, 1, 2, BN);            // tines
        q(hx + 3, hy - 6, 1, 2, BN); q(hx + 5, hy - 4, 1, 2, BN);
      }
      if (opts.tusk) { q(hx + 5, hy + 4, 2, 1, BN); q(hx + 6, hy + 3, 1, 1, BN); }
      if (opts.mane) { q(hx - 1, hy - 1, 2, h + 1, dark); }             // scruff at the neck
      if (attacking) { q(hx + 5, hy + 3, 2, 1, AP.red[2]); q(hx + 6, hy + 2, 1, 1, BN); }   // open maw + fang
      // near (onside) legs in front of the body
      leg(bx + 3, 1 - gait, mid); leg(bx + w - 4, gait, mid);
    };
    Sprites.unit[name] = {
      idle: beastFrames(2, (q, f) => draw(q, 0, false)),
      walk: beastFrames(2, (q, f) => draw(q, f, false)),
      fight: beastFrames(2, (q, f) => draw(q, f, true)),
    };
  }
  beast('wolf', [AP.pelt[0], AP.pelt[1], AP.pelt[2]], { w: 15, h: 6, ears: true, tail: true, bushy: true, mane: true });
  beast('boar', [AP.hide[0], AP.hide[1], AP.hide[2]], { w: 16, h: 8, tusk: true, tail: true, mane: true });
  // the bear: rare, huge, dark — a humped silhouette a head taller than a boar
  beast('bear', [AP.rust[0], AP.hide[0], AP.hide[1]], { w: 18, h: 10, ears: true, hump: true, snout: AP.hide[2] });
  beast('deer', ['#7a5430', '#a87848', '#c89868'], { w: 13, h: 6, ears: true, tail: true, antlers: true });
  beast('cow', ['#8a8078', '#d8d0c4', '#f0ece2'], { w: 16, h: 8, ears: true, tail: true, longtail: true, horns: true, spots: '#5a4a3a' });

  /* ---------------- icons (16px) ---------------- */

  // ARTSTYLE: every unit frame gets its 1px ink outline at build time
  for (const kind in Sprites.unit)
    for (const pose in Sprites.unit[kind])
      Sprites.unit[kind][pose] = Sprites.unit[kind][pose].map(c => ART.outline(c));

  function icon(draw) {
    const c = mk(16, 16), g = c.getContext('2d');
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    draw(p);
    return c;
  }
  // resource icons: shaded, outlined, palette-only (top-left light like all art)
  Sprites.icons.food = ART.outline(icon(p => {     // meat joint on the bone
    p(2, 3, 4, 3, AP.red[1]); p(2, 3, 3, 1, AP.red[2]); p(2, 3, 1, 2, AP.red[2]);
    p(3, 6, 2, 1, AP.red[0]);
    p(5, 2, 2, 2, AP.bone[2]); p(6, 1, 1, 1, AP.bone[1]);
  }));
  Sprites.icons.wood = ART.outline(icon(p => {     // stacked logs, ring ends lit
    p(1, 2, 6, 2, AP.wood[3]); p(1, 2, 6, 1, AP.wood[4]); p(1, 2, 1, 2, AP.thatch[2]);
    p(1, 5, 6, 2, AP.wood[2]); p(1, 5, 6, 1, AP.wood[3]); p(6, 5, 1, 2, AP.thatch[1]);
  }));
  Sprites.icons.stone = ART.outline(icon(p => {    // shaded boulder
    p(2, 3, 4, 3, AP.stone[2]); p(3, 2, 2, 1, AP.stone[3]);
    p(2, 3, 1, 1, AP.stone[3]); p(2, 5, 4, 1, AP.stone[1]); p(5, 3, 1, 3, AP.stone[1]);
  }));
  Sprites.icons.gold = ART.outline(icon(p => {     // nugget pile with a glint
    p(2, 4, 4, 2, AP.gold[1]); p(2, 4, 4, 1, AP.gold[2]); p(3, 3, 2, 1, AP.gold[2]);
    p(3, 3, 1, 1, AP.gold[3]);
  }));
  Sprites.icons.pop = ART.outline(icon(p => {      // villager in player blue
    p(3, 1, 2, 2, AP.skin[2]); p(3, 1, 2, 1, AP.hair[1]);
    p(2, 3, 4, 3, AP.blue[2]); p(2, 3, 4, 1, AP.blue[3]);
  }));

  Sprites.iconFor = (key) => Sprites.icons[key];
})();
