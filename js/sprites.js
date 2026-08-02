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
  // ORE boulder: an angular, chunky mineral rock BURIED in the turf — only the
  // top is uncovered. Built per-pixel on an octagonal metric with per-facet
  // radius jitter (straight chunky edges, chipped corners, never a soft blob),
  // then cut off below a jagged bury line: no cast shadow, no floating — the
  // rock sinks straight into the ground. A dark soil seam runs along the
  // contact line and grass blades sprout in front of and beside the base.
  // Hard-edged facet planes split by crack lines, a crisp rim, speckle grain,
  // a fissure and a crest glint. Reads as "stone you can mine", not elevation.
  // `pal` overrides the boulder's stone ramp (6 steps, dark→bright). The GOLD
  // SEAM borrows this same body so a seam reads as ore of the map's own kind,
  // just struck through with a paler quartz.
  function boulderBody(f, cx, cy, rr, pal) {
    const St = pal || AP.ore, r = ART.rng((cx * 31 + cy * 17) | 1);
    const oct = []; for (let i = 0; i < 8; i++) oct.push(0.8 + r() * 0.26);   // per-facet radius -> irregular chunk (kept mild so the mass stays rounded)
    const chipA = (r() * 8) | 0, chipB = (r() * 8) | 0;                       // chipped corners
    const s1 = -(0.3 + r() * 0.25) * rr, s2 = (0.35 + r() * 0.25) * rr;       // facet split lines, jittered per rock
    const cut = rr * 0.6;                                                     // bury line — below this the rock is underground (a little more dome showing)
    const jag = dx => ((dx + cx) & 2) ? 0.7 : 0;                              // toothy contact line, never ruler-straight
    const radAt = (dx, dy) => {
      const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
      const k = dx >= 0 ? (dy >= 0 ? (ax >= ay ? 0 : 1) : (ax >= ay ? 7 : 6)) : (dy >= 0 ? (ax >= ay ? 3 : 2) : (ax >= ay ? 4 : 5));
      let rad = rr * oct[k];
      if (k === chipA || k === chipB) rad *= 0.8;
      return rad;
    };
    const inside = (dx, dy, m) => {                                           // mostly-octagonal metric: flat chunky edges with a bulbous belly
      const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
      const octd = ax > ay ? ax + 0.41 * ay : ay + 0.41 * ax;                 // pure octagon = angular…
      const d = octd * 0.62 + Math.sqrt(dx * dx + dy * dy) * 0.38;            // …a dash of circle rounds it out
      return d <= radAt(dx, dy) - m;
    };
    for (let dy = -rr - 1; dy <= rr + 1; dy++) for (let dx = -rr - 1; dx <= rr + 1; dx++) {
      if (!inside(dx, dy, 0) || dy > cut + jag(dx)) continue;
      const s = dx + dy, t = dx - dy;
      let c;                                                                  // hard-edged facet planes, 5 tonal steps
      if (s <= s1) c = s <= s1 - rr * 0.5 ? St[5] : St[4];                    // lit top-left plane (+ bright crest)
      else if (s >= s2) c = s >= s2 + rr * 0.5 ? St[1] : St[2];               // shadowed lower-right plane
      else c = t >= rr * 0.4 ? St[2] : St[3];                                 // right side-plane vs front plane
      if (!inside(dx, dy, 1)) c = s < 0 ? St[1] : St[0];                      // crisp 1px dark rim
      else if (Math.abs(s - s1) < 0.5 || Math.abs(s - s2) < 0.5) c = St[0];   // crack lines along the facet breaks
      if (dy > cut + jag(dx) - 1.3) c = St[0];                                // dark soil seam where the rock enters the ground
      f(cx + dx, cy + dy, 1, 1, c);
    }
    f(cx - (rr * 0.2 | 0), cy - (rr * 0.55 | 0), 1, (rr * 0.8) | 0, St[0]);   // vertical fissure
    f(cx + (rr * 0.3 | 0), cy, 1, (rr * 0.45) | 0, St[1]);                    // secondary hairline crack (stops above the seam)
    for (let i = 0, n = rr * 3; i < n; i++) {                                 // speckle grain (kept inside the rock, above the seam)
      const gx = -rr + 1 + (r() * (rr * 2 - 1) | 0), gy = -rr + 1 + (r() * (rr * 2 - 1) | 0);
      if (gy <= cut - 1 && inside(gx, gy, 1.4)) f(cx + gx, cy + gy, 1, 1, r() < 0.55 ? St[1] : St[4]);
    }
    // turf lapping the buried base: grass along the contact line, with sprouting
    // blade tips drawn IN FRONT of the rock's bottom edge, plus a tuft at each side
    const gy = cy + Math.round(cut);
    for (let i = 0, n = 3 + (rr >> 1); i < n; i++) {
      const gx2 = cx - rr + 2 + (r() * (rr * 2 - 3) | 0);
      f(gx2, gy, 1, 1, r() < 0.5 ? AP.grass[1] : AP.grass[2]);
      if (r() < 0.55) f(gx2, gy - 1, 1, 1, AP.grass[3]);
    }
    f(cx - rr, gy - 1, 1, 2, AP.grass[3]); f(cx + rr - 1, gy - 1, 1, 2, AP.grass[1]);   // flanking tufts beside the rock
  }
  function rockField(p, seed, spec) {
    const f = p.f, r = ART.rng(seed + 3);
    for (const b of spec) boulderBody(f, b[0], b[1], b[2]);    // no cast shadows — buried rocks sit IN the turf, not on it
    for (let i = 0; i < 6; i++)                                // a few scree chips + grass tufts (workable-deposit rubble)
      f((r() * 30) | 0, (r() * 30) | 0, 1, 1, r() < 0.6 ? AP.ore[2] : AP.grass[4]);
  }
  /* ORE (hills): the same three-density gradient as the forest, so a deposit
     reads as one organic body of stone instead of a repeating grid of tiles:
       SPARSE  (edge of the deposit): one or two smallish half-buried stones,
               mostly open turf — no hard edges, everything inside the tile;
       MEDIUM  (perimeter): the chunky 2-4 boulder clusters, still fully
               inside the tile so the deposit's border never cuts a rock;
       DENSE   (fully-enclosed core): big interlocked boulders that MAY
               straddle the tile edge — every cut side abuts more ore, so the
               heart of the deposit reads as one continuous rocky mass.
     render.js picks the set from the 8-neighbour count, exactly like forest;
     map.js scales each tile's stock by the same density (edge least, core
     most — and at a fixed mining rate, the core holds a villager longest). */
  Sprites.terrain[T.HILLS] = [                                  // SPARSE — the deposit's soft fringe
    tile(p => rockField(p, 31,  [[10, 12, 5]])),
    tile(p => rockField(p, 87,  [[22, 18, 6]])),
    tile(p => rockField(p, 143, [[8, 22, 5], [20, 10, 4]])),
    tile(p => rockField(p, 199, [[24, 24, 5]])),
    tile(p => rockField(p, 251, [[14, 8, 5], [24, 20, 4]])),
    tile(p => rockField(p, 307, [[6, 14, 4], [18, 24, 5]])),
    tile(p => rockField(p, 361, [[20, 6, 5]])),
    tile(p => rockField(p, 419, [[12, 20, 6]])),
  ];
  Sprites.terrainMed[T.HILLS] = [                               // MEDIUM — chunky clusters, none cut
    tile(p => rockField(p, 33, [[14, 16, 9], [24, 24, 6], [7, 25, 5]])),
    tile(p => rockField(p, 89, [[17, 15, 10], [7, 23, 6], [25, 8, 5]])),
    tile(p => rockField(p, 145, [[12, 18, 8], [23, 12, 7], [24, 25, 5]])),
    tile(p => rockField(p, 201, [[16, 20, 9], [9, 9, 6], [24, 17, 6]])),
    tile(p => rockField(p, 253, [[19, 13, 8], [10, 22, 7], [23, 25, 5]])),
    tile(p => rockField(p, 309, [[13, 13, 8], [22, 22, 7], [8, 25, 5]])),
    tile(p => rockField(p, 363, [[16, 17, 10], [26, 7, 5], [8, 12, 5]])),
    tile(p => rockField(p, 421, [[15, 21, 8], [8, 14, 6], [24, 10, 6]])),
    tile(p => rockField(p, 469, [[20, 18, 9], [9, 20, 6], [14, 7, 5]])),
    tile(p => rockField(p, 525, [[12, 15, 9], [24, 20, 6], [18, 25, 5]])),
    tile(p => rockField(p, 579, [[18, 16, 8], [8, 10, 5], [10, 24, 6], [26, 23, 5]])),
    tile(p => rockField(p, 633, [[14, 17, 10], [24, 13, 6], [7, 7, 5]])),
  ];
  Sprites.terrainFull[T.HILLS] = [                              // DENSE — the packed, straddling core
    tile(p => rockField(p, 41, [[6, 8, 10], [22, 14, 11], [10, 24, 9], [28, 28, 8]])),
    tile(p => rockField(p, 97, [[16, 6, 11], [5, 20, 9], [25, 24, 10]])),
    tile(p => rockField(p, 151, [[8, 4, 9], [26, 8, 10], [6, 26, 10], [24, 28, 9]])),
    tile(p => rockField(p, 209, [[16, 16, 13], [2, 6, 8], [30, 26, 9]])),
    tile(p => rockField(p, 257, [[4, 14, 10], [20, 4, 9], [24, 22, 11]])),
    tile(p => rockField(p, 311, [[12, 12, 11], [30, 10, 8], [8, 30, 9], [27, 29, 7]])),
    tile(p => rockField(p, 367, [[18, 26, 11], [6, 10, 10], [28, 2, 8]])),
    tile(p => rockField(p, 431, [[2, 24, 9], [14, 8, 11], [28, 16, 10]])),
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
  /* A GOLD SEAM (tests/gold-mine.mjs) — an outcrop of quartz broken open at
     the surface with gold showing in it. The read has to be unmistakable at a
     glance across a fogged map, because finding one is the whole point: warm
     GOLD in a pale quartz reef, on the same transparent floor the other
     resource nodes use so the grass shows around it. */
  /* A GOLD SEAM (tests/gold-mine.mjs). Built from the map's OWN rock language —
     boulderBody, the same faceted stone every ore deposit is drawn from — but
     in a pale QUARTZ ramp instead of the grey ore one, so a seam reads as a
     different KIND of rock at a glance rather than as a grey slab with dots on
     it. The gold is struck through the quartz as veins that follow the lit
     faces, with weathered nuggets and a little spoil in the turf at the foot.
     Authored on a TRANSPARENT floor like every other resource node: render.js
     paints the grass under it (GROUND_GRAIN). */
  const QUARTZ = ['#6a6a63', '#8c8b80', '#a8a79a', '#c2c1b3', '#dcdbcc', '#f2f1e4'];
  Sprites.terrain[T.GOLDORE] = [
    tile(p => {
      const f = p.f, r = ART.rng(613), GD = AP.gold;
      // the outcrop: one big block with two smaller shoulders, half buried
      boulderBody(f, 14, 15, 9, QUARTZ);
      boulderBody(f, 24, 20, 6, QUARTZ);
      boulderBody(f, 6, 21, 5, QUARTZ);
      /* THE GOLD — short veins that RUN, at the same 45° the facets break on,
         so they read as metal in the rock rather than confetti on top of it.
         Only on the quartz: a vein is sampled and skipped if it would land on
         the open turf. */
      const onRock = (x, y) => {
        const d = (cx, cy, rr) => Math.hypot(x - cx, y - cy) < rr * 0.82;
        return d(14, 15, 9) || d(24, 20, 6) || d(6, 21, 5);
      };
      for (let i = 0; i < 14; i++) {
        const vx = 3 + ((r() * 26) | 0), vy = 7 + ((r() * 16) | 0);
        if (!onRock(vx, vy)) continue;
        const len = 2 + ((r() * 3) | 0), dn = r() < 0.5 ? 1 : -1;
        for (let k = 0; k < len; k++) {
          const x = vx + k, y = vy + k * dn;
          if (!onRock(x, y)) break;
          f(x, y, 1, 1, k === 0 ? GD[3] : GD[2]);
          if (r() < 0.45) f(x, y + 1, 1, 1, GD[1]);      // the vein's shadowed under-edge
        }
      }
      // a fat vein breaking the surface of the main block, the eye-catcher
      f(11, 12, 4, 2, GD[2]); f(11, 12, 3, 1, GD[3]); f(12, 14, 2, 1, GD[1]);
      // spoil at the foot: weathered nuggets and quartz chips in the turf
      for (let i = 0; i < 6; i++) {
        const nx = 4 + ((r() * 24) | 0), ny = 23 + ((r() * 6) | 0);
        f(nx, ny, 2, 1, GD[1]); f(nx, ny, 1, 1, GD[2]);
      }
      for (let i = 0; i < 9; i++)
        f(2 + ((r() * 28) | 0), 22 + ((r() * 8) | 0), 1, 1, r() < 0.55 ? QUARTZ[3] : AP.grass[4]);
    }),
  ];
  /* the CAMP GROUND (tests/raider-camps.mjs) — trampled bare earth, churned by
     feet and scattered with the litter of a band. The camp ITSELF is a
     building drawn on top of this (B_DRAW.raidercamp), because it can be
     pulled down: when it burns, this ground is what is left. */
  Sprites.terrain[T.CAMP] = [
    tile(p => {
      const f = p.f, r = ART.rng(41);
      ART.dither(p, 0, 0, 16, 16, AP.soil[3], AP.grass[2]);          // trampled dirt
      for (let i = 0; i < 16; i++) f((r() * 32) | 0, (r() * 32) | 0, 1, 1, r() < 0.5 ? AP.soil[1] : AP.soil[2]);
      for (let i = 0; i < 5; i++) {                                   // boot-churned hollows
        const hx = 2 + ((r() * 26) | 0), hy = 2 + ((r() * 26) | 0);
        f(hx, hy, 3, 2, AP.soil[1]); f(hx, hy, 3, 1, AP.soil[2]);
      }
      for (let i = 0; i < 4; i++) {                                   // gnawed bones and broken shafts
        const bx = 3 + ((r() * 24) | 0), by = 3 + ((r() * 24) | 0);
        if (r() < 0.5) { f(bx, by, 3, 1, AP.bone[1]); f(bx, by, 1, 1, AP.bone[2]); }
        else f(bx, by, 1, 3, AP.wood[1]);
      }
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
    [T.GOLDORE]: AP.grass[2],   // the seam stands ON grass, like the other nodes
  };

  /* ---------------- buildings ---------------- */
  function shadow(p) { p(2, 13, 12, 2, 'rgba(0,0,0,0.25)'); }

  /* fortification materials by level (tests/wall-tower-bond.mjs):
       1 = stick-and-grass palisade
       2 = a STONE CURTAIN CARRYING A TIMBER WALL-WALK — half stone, half
           wood, the same story the level-2 Watchtower tells (stone base,
           timber upper works) and the material step every level-2 building
           takes. It used to be plain stone, which read as a finished castle
           two tiers early and left level 3 nowhere to go.
       3 = dressed stone, gold-crested */
  function wallPal(lv) {
    return lv === 1
      ? { base: PAL.woodD, top: PAL.thatch, seam: APx.wood[0], stick: PAL.wood }
      : lv === 2
        ? { base: PAL.stone, top: PAL.rockL, seam: PAL.stoneD, timber: true }
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
      // the palisade's own flanking stakes down a north-south run, so a vertical
      // line of timber wall reads as a wall from the side too
      if (N) { p(4, 1, 1, 3, c.stick); p(11, 1, 1, 3, c.stick); }
      if (S) { p(4, 12, 1, 3, c.stick); p(11, 12, 1, 3, c.stick); }
      if (N || S) { p(4, 7, 1, 2, c.stick); p(11, 7, 1, 2, c.stick); }
    } else {
      // crenels along horizontal stone tops — the wall's FACE, seen from the south
      if (W) p(1, 3, 2, 2, c.base);
      if (E) p(12, 3, 2, 2, c.base);
      if (!N) p(6, 3, 2, 2, c.base);
      /* …and MERLONS DOWN BOTH FLANKS of a north-south run. Looking along a
         wall you see its two parapets with the walk between them; without them
         a vertical run was a plain strip with no castle in it at all, and every
         tower and gatehouse standing in that line read as a different building
         from a different game. Every fortification now shows crenellation from
         every side. */
      if (N) { p(3, 1, 2, 2, c.base); p(11, 1, 2, 2, c.base); p(3, 1, 2, 1, c.top); p(11, 1, 2, 1, c.top); }
      if (S) { p(3, 13, 2, 2, c.base); p(11, 13, 2, 2, c.base); p(3, 13, 2, 1, c.top); p(11, 13, 2, 1, c.top); }
      if (N || S) { p(3, 7, 2, 2, c.base); p(11, 7, 2, 2, c.base); p(3, 7, 2, 1, c.top); p(11, 7, 2, 1, c.top); }
      // masonry seams
      p(7, 8, 2, 1, c.seam);
      if (W) p(1, 8, 3, 1, c.seam);
      if (E) p(12, 8, 3, 1, c.seam);
      if (N) p(6, 2, 2, 1, c.seam);
      if (S) p(8, 13, 2, 1, c.seam);
    }
    /* LEVEL 2 — the TIMBER WALL-WALK laid along the stone curtain: planks
       run down the middle third of every arm (and across the hub) with the
       stone parapet left showing on both flanks, so the run reads half
       stone / half wood from above. Posts stand at the parapet edge. */
    if (c.timber) {
      const WD = APx.wood;
      const deck = (x, y, w, h, vert) => {
        p(x, y, w, h, WD[2]);
        if (vert) { p(x, y, 1, h, WD[3]); p(x + w - 1, y, 1, h, WD[1]); }
        else { p(x, y, w, 1, WD[3]); p(x, y + h - 1, w, 1, WD[1]); }
      };
      deck(7, 7, 3, 3);                                   // the hub's decking
      if (W) deck(0, 7, 6, 3);
      if (E) deck(10, 7, 6, 3);
      if (N) deck(7, 0, 3, 6, true);
      if (S) deck(7, 10, 3, 6, true);
      // plank seams across the walk, and posts standing along the parapet
      if (W || E) {
        for (let px = 1; px < 16; px += 3) if ((px < 6 && W) || (px > 9 && E) || (px >= 6 && px <= 9)) p(px, 8, 1, 1, WD[1]);
        if (W) { p(2, 6, 1, 1, WD[3]); p(2, 10, 1, 1, WD[3]); }
        if (E) { p(13, 6, 1, 1, WD[3]); p(13, 10, 1, 1, WD[3]); }
      }
      if (N || S) {
        for (let py = 1; py < 16; py += 3) if ((py < 6 && N) || (py > 9 && S) || (py >= 6 && py <= 9)) p(8, py, 1, 1, WD[1]);
        if (N) { p(6, 2, 1, 1, WD[3]); p(10, 2, 1, 1, WD[3]); }
        if (S) { p(6, 13, 1, 1, WD[3]); p(10, 13, 1, 1, WD[3]); }
      }
    }
    if (c.gold) p(5, 4, 6, 1, PAL.gold);
  }
  /* ---- THE GATEHOUSE (tests/wall-tower-bond.mjs) ----
     THE TWO VIEWS ARE NOT THE SAME DRAWING, because you are not standing in the
     same place. This game draws terrain from above but buildings FACE YOU — a
     tower is an elevation with a door at its foot, a house shows its walls and
     roof. A fortification has to obey the same rule:

       EAST-WEST run  → you are looking straight AT the castle. This is the
         picture-postcard view: twin crenellated towers, the gate block between
         them under its machicolations, the round arch, and the portcullis
         backlit from the passage beyond. Everything a castle is famous for.

       NORTH-SOUTH run → you are looking along the wall, edge on. YOU CANNOT SEE
         THE GATE AT ALL — the arch faces east and west, away from you. What you
         see is the plan: the curtain running past as a skinny strip, swelling
         to the WIDTH OF THE TOWERS where the gatehouse stands.

     Drawing one and transposing it (as this file did before) produces a gate
     lying on its side in a north-south wall — a doorway seen from a viewpoint
     that cannot exist. The two are authored separately and neither is a
     rotation of the other.

     Both are drawn on the FINE 32-grid at high res like every other building;
     the curtain they join is still the 16-grid wall atlas, so the wall band
     sits at rows 10..21, exactly where drawWallMask puts its arms (5..10 of
     16). Change one and you must change the other. */
  function gateDress(lv) {
    const ST = AP.stone, WD = AP.wood;
    return lv === 1
      ? { body: WD, lit: WD[3], mid: WD[2], dim: WD[1], dark: WD[0], iron: WD[0], T1: true }
      : lv === 2
        ? { body: ST, lit: ST[3], mid: ST[2], dim: ST[1], dark: ST[0], iron: AP.ink[0], timber: true }
        : { body: ST, lit: ST[4], mid: ST[3], dim: ST[2], dark: ST[1], iron: AP.ink[0], gold: true };
  }
  // coursed ashlar: staggered blocks under a mortar line. At this size random
  // speckle reads as dirt; courses read as a wall somebody BUILT.
  function ashlar(q, x, y, w, h, ramp, seed) {
    const rnd = ART.rng(seed);
    for (let r = 0; r < h; r++) {
      q(x, y + r, w, 1, r % 3 === 2 ? ramp[1] : ramp[2]);
      if (r % 3 === 2) continue;
      for (let bx = x + ((r >> 1) & 1 ? 0 : 2); bx < x + w - 1; bx += 4)
        q(bx, y + r, 3, 1, rnd() < 0.5 ? ramp[3] : ramp[2]);
    }
  }
  /* THE FACE — an east-west gatehouse, seen straight on.

     THE TURRETS STAND IN THE WALL, they do not stand in front of it. The
     curtain runs the whole width of the tile at its own height, with its own
     merlons on the same rhythm as the wall atlas beside it; the two turrets
     rise OUT of that line (and carry down past it to the ground, as a mural
     tower does); and the gate stretches BETWEEN them, its head level with the
     curtain's, the archway cut through it. Drawn the other way round — a
     gatehouse block with turrets of its own, parked on the line — it reads as
     a separate building shoved up against the wall. */
  function gateFaceT3(q, lv) {
    const d = gateDress(lv), WD = AP.wood, IN = AP.ink[0];
    const GND = 30;                          // the front edge of the tile — everything on the wall is planted on it
    const W0 = 10, W1 = 21;                  // the curtain band (drawWallMask's arms, 5..10 of 16)
    const TL0 = 1, TL1 = 8, TR0 = 24, TR1 = 31;    // the turrets, standing IN the line
    const C0 = 8, C1 = 24;                   // the gate, stretching between them
    const A0 = 11, A1 = 20;                  // the archway — the drawbridge's own width
    const uM = d.timber ? WD[2] : d.mid, uL = d.timber ? WD[3] : d.lit;   // L2 = timber upper works

    // masonry (or upright logs) for any mass of the gatehouse
    const face = (x0, w, top, bot, seed) => {
      if (d.T1) {
        for (let x = x0; x < x0 + w; x += 2) { q(x, top, 2, bot - top, WD[2]); q(x + 1, top, 1, bot - top, WD[1]); }
        q(x0, top + 3, w, 1, AP.thatch[0]);
      } else ashlar(q, x0, top, w, bot - top, d.body, seed);
      q(x0, top, w, 1, d.lit); q(x0, bot - 1, w, 1, d.dark);
    };
    // the crenellated head every part of the castle wears
    const head = (x0, w, top, mach) => {
      if (mach) {                            // the corbelled gallery, over gate and turret alike
        q(x0, top + 2, w, 2, uM); q(x0, top + 2, w, 1, uL);
        for (let x = x0 + 1; x < x0 + w - 1; x += 3) q(x, top + 3, 1, 1, IN);
      }
      for (let x = x0; x < x0 + w - 1; x += 3) { q(x, top - 2, 2, 3, uM); q(x, top - 2, 2, 1, uL); }
      if (d.gold) q(x0, top - 3, w, 1, AP.gold[2]);
    };

    // ---- 1. THE CURTAIN — the WALL's own art, stamped by drawGate before
    //         this runs. Hand-drawing it here is what made the merlons stop
    //         dead at every gate; the line now runs straight through. ----

    /* ---- 2. THE GATEWAY, stretching between the turrets ----
       DELIBERATELY PLAIN, and it rises the FULL HEIGHT of the tile. The
       drawbridge spans a whole tile of ground (DB_LEN), so raised it is a
       whole tile TALL — and the old central block (head at row 6, a
       machicolated gallery under it, crenels over that) left it nowhere to
       stand: the door would have covered its own gallery and towered over the
       castle. A tall bare arch between two crenellated turrets is a real
       gatehouse, it gives the door a gateway that fits it, and it keeps every
       piece of castle character on the turrets where it still reads. */
    face(C0, C1 - C0, 0, GND, 71 + lv);
    q(C0, 0, C1 - C0, 1, d.lit);                                 // a plain coped head
    q(C0, 1, C1 - C0, 1, d.dark);

    // ---- 3. THE TURRETS, rising out of the line and carrying down to the ground ----
    for (const [x0, x1] of [[TL0, TL1], [TR0, TR1]]) {
      face(x0, x1 - x0, 2, GND, x0 * 7 + lv);
      head(x0, x1 - x0, 2, true);
      q(x0 + 3, 8, 1, 4, IN); q(x0 + 3, 14, 1, 4, IN); q(x0 + 3, 20, 1, 4, IN);   // arrow loops
    }

    // ---- 4. THE ARCHWAY — a round head over the passage, in dressed voussoirs.
    //         Wider (it has to pass the deck) and taller (it has to hold it).
    const AT = 14;                                      // where the arch springs
    q(A0, AT + 2, A1 - A0 + 1, GND - AT - 2, IN);       // the dark of the passage
    q(A0 + 1, AT, A1 - A0 - 1, 2, IN); q(A0 + 2, AT - 1, A1 - A0 - 3, 1, IN);
    q(A0 - 1, AT + 2, 1, GND - AT - 2, d.lit); q(A1 + 1, AT + 2, 1, GND - AT - 2, d.lit);   // the jambs
    q(A0, AT + 1, 1, 1, d.lit); q(A1, AT + 1, 1, 1, d.lit);
    q(A0 + 1, AT - 1, 1, 1, d.lit); q(A1 - 1, AT - 1, 1, 1, d.lit);
    q(A0 + 2, AT - 2, A1 - A0 - 3, 1, d.lit);           // the crown of the arch
    // THE PORTCULLIS, backlit from the passage the way it always is in the photos
    q(A0, AT + 3, A1 - A0 + 1, GND - AT - 4, d.T1 ? '#3a2a18' : '#5c3f24');   // torchlight beyond
    for (let x = A0; x <= A1; x += 2) q(x, AT + 1, 1, GND - AT - 2, d.iron);
    for (let y = AT + 3; y < GND - 1; y += 3) q(A0, y, A1 - A0 + 1, 1, d.iron);
    for (let x = A0; x <= A1; x += 2) q(x, GND - 2, 1, 2, d.iron);   // the spikes at its foot
    // the timber threshold under it, and the ground shadow the whole pile throws
    q(A0 - 1, GND, A1 - A0 + 3, 2, WD[2]); q(A0 - 1, GND, A1 - A0 + 3, 1, WD[3]);
    for (let x = A0; x <= A1; x += 3) q(x, GND + 1, 1, 1, WD[1]);
    q(TL0 + 1, GND + 2, TR1 - TL0 - 1, 2, ART.STYLE.SHADOW);
    if (d.timber) {                          // L2: the timber hoarding over the stone
      ART.woodPlankTexture(q, C0 + 1, 8, C1 - C0 - 2, 4, 11);
      q(C0 + 1, 8, C1 - C0 - 2, 1, WD[3]);
      for (const [x0, x1] of [[TL0, TL1], [TR0, TR1]]) {
        ART.woodPlankTexture(q, x0 + 1, 4, x1 - x0 - 2, 4, x0 + 5);
        q(x0 + 1, 4, x1 - x0 - 2, 1, WD[3]);
        // a second hoarding rigged out over each turret at walk height, which is
        // where the L2 curtain's own timber walk runs into the gatehouse
        ART.woodPlankTexture(q, x0, 13, x1 - x0, 5, x0 + 9);
        q(x0, 13, x1 - x0, 1, WD[3]); q(x0, 17, x1 - x0, 1, WD[1]);
      }
    }
    if (d.gold) for (const x of [TL0 + 3, TR0 + 3]) { q(x, -1, 1, 5, WD[1]); q(x, -1, 1, 1, AP.gold[2]); }
  }
  /* THE FLANK — a north-south gatehouse. You are looking along the wall, so the
     archway faces away from you and there is NO DOOR to see; what you see is
     the gatehouse's side: a block as wide as a tower standing in a curtain that
     is skinnier than it, with the wall running in above and below. Drawn in the
     same elevation language as the Watchtower it stands beside — a plan-view
     block between two elevation towers reads as two different games. */
  function gateSideT3(q, lv) {
    const d = gateDress(lv), WD = AP.wood, IN = AP.ink[0];
    const W0 = 10, W1 = 21;                  // the curtain's own width
    const G0 = 6, G1 = 25;                   // the gatehouse: as wide as a tower
    const TOP = 5, GND = 30;                 // its head and its foot — the tower's own ground line

    // the curtain running in from north and south is the WALL's own art,
    // stamped by drawGate — all that is left to draw is the shadow line where
    // the northern walk goes BEHIND the block rather than onto its roof
    q(W0, 0, W1 - W0 + 1, 2, 'rgba(24,18,12,0.55)');

    // the block itself
    if (d.T1) {
      for (let x = G0; x <= G1; x += 2) { q(x, TOP, 2, GND - TOP, WD[2]); q(x + 1, TOP, 1, GND - TOP, WD[1]); }
      q(G0, TOP + 4, G1 - G0 + 1, 1, AP.thatch[0]); q(G0, GND - 5, G1 - G0 + 1, 1, AP.thatch[0]);
    } else ashlar(q, G0, TOP, G1 - G0 + 1, GND - TOP, d.body, 31 + lv);
    q(G0, TOP, G1 - G0 + 1, 1, d.lit); q(G0, GND - 1, G1 - G0 + 1, 1, d.dark);
    q(G0, TOP, 1, GND - TOP, d.lit); q(G1, TOP, 1, GND - TOP, d.dark);
    // machicolations, then the crenels above them — the same head the face
    // wears, timber at L2 for the same reason
    const uM = d.timber ? WD[2] : d.mid, uL = d.timber ? WD[3] : d.lit;
    q(G0, TOP + 2, G1 - G0 + 1, 2, uM); q(G0, TOP + 2, G1 - G0 + 1, 1, uL);
    for (let x = G0 + 1; x < G1 - 1; x += 3) q(x, TOP + 3, 1, 1, IN);
    for (let x = G0; x < G1 - 1; x += 3) { q(x, TOP - 2, 2, 3, uM); q(x, TOP - 2, 2, 1, uL); }
    // arrow loops covering the ground either side of the gate
    for (const x of [G0 + 4, G1 - 4]) { q(x, TOP + 6, 1, 4, IN); q(x, TOP + 12, 1, 4, IN); }
    q((G0 + G1) >> 1, TOP + 6, 1, 4, IN);
    // the mouth of the passage running through, east to west: from here it is
    // only a shadow at each flank, never a doorway — the arch faces away
    q(G0, GND - 11, 1, 6, IN); q(G1, GND - 11, 1, 6, IN);
    q(G0 + 1, GND - 11, 1, 6, d.dark); q(G1 - 1, GND - 11, 1, 6, d.dark);
    if (d.timber) {                          // L2: timber hoarding over the stone head
      ART.woodPlankTexture(q, G0 + 1, TOP + 5, G1 - G0 - 1, 5, 13);
      q(G0 + 1, TOP + 5, G1 - G0 - 1, 1, WD[3]);
    }
    if (d.gold) {
      q(G0, TOP - 3, G1 - G0 + 1, 1, AP.gold[2]);
      for (const x of [G0 + 3, G1 - 3]) { q(x, TOP - 7, 1, 5, WD[1]); q(x, TOP - 7, 1, 1, AP.gold[2]); }
    }
    q(G0 + 1, GND, G1 - G0 - 1, 32 - GND, ART.STYLE.SHADOW);   // the shadow at its foot
  }
  /* ---- THE MURAL TOWER (tests/wall-tower-bond.mjs) ----
     A tower with a wall on it is not a building standing next to a wall — it
     is a THICKER, TALLER PIECE OF THE WALL, built at the same time out of the
     same stone, with the wall-walk running straight into its flanks. That is
     what a castle looks like, and it is what the free-standing Watchtower
     sprite could never be: that one has its own outline, its own drop shadow
     and a door in its foot, which are exactly the things that read as "a
     separate building parked on the line".

     So a tower gets a SECOND drawing. R.bldSprite hands back this one whenever
     the tower is bonded into a line (R.towerLinkMask), and the free-standing
     watchtower whenever it stands alone in open ground — a lone scout tower
     should still read as a building, not as a stump of curtain.

     Same dress as the gatehouse and the curtain (gateDress): L1 timber, L2
     stone under timber upper works, L3 dressed stone with a gold crest and the
     beacon lit. Narrower than the gatehouse (16 of 32 against its 20) so the
     gate stays the biggest thing on the wall, wider than the curtain (12) so
     it reads as a tower, and standing on the same ground line as both. */
  function drawTowerMural(p, lv) {
    const q = p.hi, d = gateDress(lv), WD = AP.wood, IN = AP.ink[0];
    const X0 = 8, X1 = 23;                   // wider than the curtain, narrower than the gate
    /* TOP..GND — and GND reaches the FRONT EDGE OF THE TILE. A tower is drawn
       facing you, so its foot is the nearest thing in the picture: stopping it
       short left it standing on the walk that runs past it and reading as if it
       hovered. The curtain behind it meets it half way up (drawTowerWalk); the
       tower itself is planted on the ground. */
    const TOP = 3, GND = 30;
    const uM = d.timber ? WD[2] : d.mid, uL = d.timber ? WD[3] : d.lit;

    // the shaft
    if (d.T1) {
      for (let x = X0; x <= X1; x += 2) { q(x, TOP, 2, GND - TOP, WD[2]); q(x + 1, TOP, 1, GND - TOP, WD[1]); }
      q(X0, TOP + 5, X1 - X0 + 1, 1, AP.thatch[0]); q(X0, GND - 6, X1 - X0 + 1, 1, AP.thatch[0]);
    } else ashlar(q, X0, TOP, X1 - X0 + 1, GND - TOP, d.body, 47 + lv);
    q(X0, TOP, X1 - X0 + 1, 1, d.lit); q(X0, GND - 1, X1 - X0 + 1, 1, d.dark);
    q(X0, TOP, 1, GND - TOP, d.lit); q(X1, TOP, 1, GND - TOP, d.dark);
    if (!d.T1) for (let y = TOP + 2; y < GND - 2; y += 4) {      // dressed quoins up both corners
      q(X0, y, 2, 2, d.lit); q(X1 - 1, y, 2, 2, d.dark);
    }
    // the machicolated head, and the crenels standing above it
    q(X0, TOP + 2, X1 - X0 + 1, 2, uM); q(X0, TOP + 2, X1 - X0 + 1, 1, uL);
    for (let x = X0 + 1; x < X1 - 1; x += 3) q(x, TOP + 3, 1, 1, IN);
    for (let x = X0; x < X1 - 1; x += 3) { q(x, TOP - 2, 2, 3, uM); q(x, TOP - 2, 2, 1, uL); }
    if (d.timber) {                          // L2: the timber storey over the stone
      ART.woodPlankTexture(q, X0 + 1, TOP + 5, X1 - X0 - 1, 5, 29);
      q(X0 + 1, TOP + 5, X1 - X0 - 1, 1, WD[3]);
    }
    // arrow loops — a tower watches every way, so they run down the whole shaft
    for (const x of [X0 + 4, X1 - 4]) { q(x, TOP + 12, 1, 4, IN); q(x, TOP + 20, 1, 4, IN); }
    q((X0 + X1) >> 1, TOP + 12, 1, 4, IN);
    if (d.gold) {                            // the crest, and the beacon alight
      q(X0, TOP - 3, X1 - X0 + 1, 1, AP.gold[2]);
      q((X0 + X1) >> 1, TOP - 6, 2, 2, AP.fire[2]); q((X0 + X1) >> 1, TOP - 7, 1, 1, AP.fire[3]);
      q(((X0 + X1) >> 1) - 1, TOP - 4, 4, 1, AP.fire[1]);
    }
    q(X0 + 1, GND, X1 - X0 - 1, 32 - GND, ART.STYLE.SHADOW);    // the shadow at its foot
  }
  /* ---- THE GATE THROUGH THE AGES (tests/wall-tower-bond.mjs) ----
     A gatehouse is the clearest read the player has on how far the tribe has
     come, so the three tiers must not all be the same castle in different
     stone. They are three DIFFERENT STRUCTURES:

       L1  a PALISADE GATE. Two stout posts driven in either side of a gap, a
           lintel across them, and a braced plank door hung between. No
           turrets, no battlements, no portcullis — nobody in a stockade has
           any of those. Timber and rope, and that is all.
       L2  a STONE ARCHWAY with a timber door in it. Squared piers, a round
           arch of voussoirs, flat coping — a solid piece of masonry, and
           still not a castle: no turrets rising out of the line, no
           machicolation gallery, no crenels.
       L3  the full castle gatehouse (drawGateT3 — the original drawing), with
           its flanking turrets, machicolated gallery, portcullis and, at this
           tier alone, the drawbridge on chains.

     All three still carry the curtain across the tile at rows 10..21, where
     drawWallMask puts its arms, and all three stand on the front edge of the
     tile (row 30) like every other fortification. */
  function drawGateFace(q, lv) {
    if (lv === 1) return gateFaceT1(q);
    if (lv === 2) return gateFaceT2(q);
    return gateFaceT3(q, lv);
  }
  function drawGateSide(q, lv) {
    if (lv === 1) return gateSideT1(q);
    if (lv === 2) return gateSideT2(q);
    return gateSideT3(q, lv);
  }

  /* L1 FACE — a gap in the stockade with a door hung in it. Everything is
     timber and rope; the only "iron" is WD[0], the darkest wood, because at
     this size real iron reads as masonry and a palisade has no masonry in it. */
  function gateFaceT1(q) {
    const WD = AP.wood, TH = AP.thatch;
    const GND = 30, W0 = 10, W1 = 21;
    const P0 = 8, P1 = 20, O0 = 12, O1 = 19;   // posts, and the opening between them
    // (the stockade crossing this tile is the WALL's own art, stamped by
    // drawGate before we get here — never redrawn, or the two drift apart)
    // the two gate posts, thicker than the stakes and driven deeper
    for (const px of [P0, P1]) {
      q(px, 6, 4, GND - 6, WD[2]);
      q(px, 6, 4, 1, WD[3]);
      q(px, 6, 1, GND - 6, WD[3]);
      q(px + 3, 6, 1, GND - 6, WD[0]);
      q(px, 12, 4, 1, TH[1]); q(px, 22, 4, 1, TH[1]);   // rope lashings
    }
    // the lintel laid across their heads
    q(P0 - 1, 6, P1 + 5 - P0, 3, WD[2]);
    q(P0 - 1, 6, P1 + 5 - P0, 1, WD[3]);
    q(P0 - 1, 8, P1 + 5 - P0, 1, WD[0]);
    // THE DOOR: upright planks, a Z of braces across them, hung on two straps.
    // A dark reveal each side sets it back INTO the gap, so the posts read as
    // posts rather than as more of the same door.
    q(O0 - 1, 9, 1, GND - 9, WD[0]); q(O1 + 1, 9, 1, GND - 9, WD[0]);
    q(O0, 9, O1 - O0 + 1, GND - 9, WD[1]);
    for (let x = O0; x <= O1; x += 2) q(x, 9, 1, GND - 9, WD[2]);
    q(O0, 9, O1 - O0 + 1, 1, WD[3]);
    for (let k = 0; k < 20; k++) {                     // the diagonal brace
      const x = O0 + Math.round(k * (O1 - O0) / 19), y = 11 + Math.round(k * 16 / 19);
      q(x, y, 1, 1, WD[3]); q(x, y + 1, 1, 1, WD[0]);
    }
    q(O0, 12, O1 - O0 + 1, 2, WD[3]); q(O0, 13, O1 - O0 + 1, 1, WD[0]);   // top rail
    q(O0, 26, O1 - O0 + 1, 2, WD[3]); q(O0, 27, O1 - O0 + 1, 1, WD[0]);   // bottom rail
    q(O0 - 1, 13, 2, 2, WD[0]); q(O0 - 1, 26, 2, 2, WD[0]);               // hinge straps
    q(O1, 19, 2, 2, WD[0]);                                               // the ring
    q(P0 + 1, GND, P1 + 3 - P0, 2, ART.STYLE.SHADOW);
  }

  /* L2 FACE — a stone archway with a timber door in it. The curtain carries
     the same timber wall-walk the L2 wall does (that is the tier's material
     story: stone below, timber above), which is also what keeps the gate
     half-and-half rather than a slab of masonry. */
  function gateFaceT2(q) {
    const ST = AP.stone, WD = AP.wood, IN = AP.ink[0];
    const GND = 30, W0 = 10, W1 = 21;
    const P0 = 8, P1 = 20, O0 = 12, O1 = 19;
    const SPR = 15, CX = (O0 + O1 + 1) / 2;            // where the arch springs, and its centre
    // (the curtain crossing this tile is the WALL's own art — stamped by
    // drawGate, merlons, walk and all — so the line runs unbroken through)
    // the two piers of the archway
    for (const px of [P0, P1]) {
      ashlar(q, px, 7, 4, GND - 7, ST, px + 3);
      q(px, 7, 4, 1, ST[4]); q(px, 7, 1, GND - 7, ST[3]); q(px + 3, 7, 1, GND - 7, ST[1]);
    }
    // flat coping over the whole archway — a wall head, not a battlement
    q(P0 - 1, 5, P1 + 5 - P0, 2, ST[2]); q(P0 - 1, 5, P1 + 5 - P0, 1, ST[4]);
    // the passage, then the round arch of voussoirs over it
    q(O0, SPR - 3, O1 - O0 + 1, GND - SPR + 3, IN);
    for (let y = 4; y <= SPR; y++) for (let x = P0; x <= P1 + 3; x++) {
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - SPR);
      if (d < 4.2 || d > 6.2) continue;
      q(x, y, 1, 1, ((x + y) & 1) ? ST[4] : ST[3]);   // dressed voussoirs, lighter than the wall
      if (d > 5.8) q(x, y, 1, 1, ST[1]);               // the ring's outer edge
      if (d < 4.6) q(x, y, 1, 1, ST[1]);               // …and its shadowed soffit
    }
    for (let y = SPR - 3; y < GND; y++) {              // the jambs down to the ground
      q(O0 - 1, y, 1, 1, ST[3]); q(O1 + 1, y, 1, 1, ST[1]);
    }
    // THE DOOR standing in the arch: plank leaves with iron straps
    const DT = SPR - 2;
    q(O0, DT, O1 - O0 + 1, GND - DT, WD[1]);
    for (let x = O0; x <= O1; x += 2) q(x, DT, 1, GND - DT, WD[2]);
    q(O0, DT, O1 - O0 + 1, 1, WD[3]);
    for (const yy of [DT + 2, GND - 5]) {
      q(O0, yy, O1 - O0 + 1, 2, WD[3]); q(O0, yy + 1, O1 - O0 + 1, 1, IN);
    }
    q(CX - 1, DT + 6, 2, 2, IN);                       // the ring
    q(P0 + 1, GND, P1 + 3 - P0, 2, ART.STYLE.SHADOW);
  }

  /* L1 FLANK — looking along the stockade: the passage runs away from you, so
     what you see is the pair of posts edge-on as one heavier block of timber,
     with the palisade running in above and below. */
  function gateSideT1(q) {
    const WD = AP.wood, TH = AP.thatch;
    const W0 = 10, W1 = 21, G0 = 8, G1 = 23, TOP = 6, GND = 30;
    // the stockade coming in from north and south is the WALL's own art
    // (stamped by drawGate); all this adds is the shadow where the northern
    // run passes BEHIND the block instead of onto its roof
    q(W0, 0, W1 - W0 + 1, 2, 'rgba(24,18,12,0.55)');
    // the gate block: close-set uprights, lashed
    for (let x = G0; x <= G1; x += 2) { q(x, TOP, 2, GND - TOP, WD[2]); q(x + 1, TOP, 1, GND - TOP, WD[1]); }
    q(G0, TOP, G1 - G0 + 1, 1, WD[3]);
    q(G0, TOP, 1, GND - TOP, WD[3]); q(G1, TOP, 1, GND - TOP, WD[0]);
    q(G0, TOP + 5, G1 - G0 + 1, 1, TH[1]); q(G0, GND - 7, G1 - G0 + 1, 1, TH[1]);
    // the mouth of the passage, east and west — a shadow, never a door
    q(G0, GND - 12, 1, 7, WD[0]); q(G1, GND - 12, 1, 7, WD[0]);
    q(G0 + 1, GND - 12, 1, 7, WD[1]); q(G1 - 1, GND - 12, 1, 7, WD[1]);
    q(G0 + 1, GND, G1 - G0 - 1, 2, ART.STYLE.SHADOW);
  }

  /* L2 FLANK — the archway's masonry seen side-on, the curtain running in
     above and below with its planked walk. No battlement, no gallery. */
  function gateSideT2(q) {
    const ST = AP.stone, WD = AP.wood;
    const W0 = 10, W1 = 21, G0 = 7, G1 = 24, TOP = 6, GND = 30;
    // the curtain running in north and south is the WALL's own art (stamped by
    // drawGate) — only the shadow where the northern run passes behind is ours
    q(W0, 0, W1 - W0 + 1, 2, 'rgba(24,18,12,0.55)');
    // the pier block
    ashlar(q, G0, TOP, G1 - G0 + 1, GND - TOP, ST, 37);
    q(G0, TOP, G1 - G0 + 1, 1, ST[4]); q(G0, GND - 1, G1 - G0 + 1, 1, ST[0]);
    q(G0, TOP, 1, GND - TOP, ST[3]); q(G1, TOP, 1, GND - TOP, ST[1]);
    // its own length of planked walk on top, like the curtain it stands in
    /* The walk runs the whole length of the block. NOTHING that looks like a
       doorway is drawn here: the passage faces east and west, away from you,
       so a frame or a leaf on this face would be a gateway seen from a
       viewpoint that cannot exist — the very mistake the contract guards. */
    ART.woodPlankTexture(q, G0 + 1, TOP + 2, G1 - G0 - 1, 11, 41);
    q(G0 + 1, TOP + 2, G1 - G0 - 1, 1, WD[3]); q(G0 + 1, TOP + 12, G1 - G0 - 1, 1, WD[0]);
    // flat coping, and the passage mouth in shadow at each flank
    q(G0 - 1, TOP - 2, G1 + 3 - G0, 2, ST[2]); q(G0 - 1, TOP - 2, G1 + 3 - G0, 1, ST[4]);
    q(G0, GND - 12, 1, 7, AP.ink[0]); q(G1, GND - 12, 1, 7, AP.ink[0]);
    q(G0 + 1, GND - 12, 1, 7, ST[1]); q(G1 - 1, GND - 12, 1, 7, ST[1]);
    q(G0 + 1, GND, G1 - G0 - 1, 2, ART.STYLE.SHADOW);
  }

  /* A GATE STANDS IN THE WALL, so the curtain crossing its tile IS the wall —
     the same stone, the same merlons on the same rhythm, the same walk at the
     same height. Each tier used to hand-draw its own version of that band and
     they drifted: the crenellation stopped at the gate and started again the
     other side, and the timber walk stepped a row as it crossed. Stamping the
     REAL wall sprite for a straight run (E|W under a face, N|S under a flank)
     and building the gate on top of it makes the match structural — change
     drawWallMask and every gate follows it for free. */
  function drawGate(p, lv, vert) {
    const fam = Sprites.wallMask && Sprites.wallMask[Math.min(Math.max(lv, 1), 3) - 1];
    if (fam && p.g) {
      const w = p.g.canvas.width;
      p.g.imageSmoothingEnabled = false;
      p.g.drawImage(fam[vert ? (1 | 4) : (2 | 8)], 0, 0, w, w);
    }
    return vert ? drawGateSide(p.hi, lv) : drawGateFace(p.hi, lv);
  }

  /* ================= THE DRAWBRIDGE (tests/drawbridge.mjs) =================
     A level-3 gatehouse hangs its bridge on chains. The deck is NOT baked into
     the gate sprite: it moves, so it is its own little atlas of frames drawn
     over the gate — DRAWBRIDGE_N stills from flat on the ground to standing
     against the arch, one per orientation, exactly the way the build stages
     and the collapse frames are handled.

     The deck reaches PAST the gate's own tile, because a bridge that stops at
     the threshold is a door, not a bridge. So these canvases are one tile plus
     a half: the face view is 1 wide × 1½ TALL (the deck lies south, toward
     you), the flank view 1½ WIDE × 1 tall (the passage runs east-west, so the
     deck lies east). render.js draws each through its own rect.

     Geometry is shared with the gate art it lands on: GND 30 is the front edge
     of the tile, the arch is cells 12..19, and the gallery the chains hang
     from is the machicolation course at row 9. Move one and you must move the
     other. */
  const DRAWBRIDGE_N = 8;                     // stills from fully down (0) to fully up (N-1)
  const IRON = ['#22222a', '#3d3d47', '#5f5f6c', '#87879a'];
  /* THE DECK SPANS A WHOLE TILE. That is the entire point of a drawbridge: it
     reaches across the ditch in front of the gate and lands on the far bank,
     so an army can pour out over it and nothing can follow once it is hauled
     up. A shorter deck stops in the water and crosses nothing.

     DB_LEN is therefore ONE TILE of ground, and it is the same board in both
     states — 30 cells long lying down, 30 cells tall standing up. The ground
     in this game is drawn top-down and is NOT foreshortened, so a tile of
     ground is a tile of screen: there is no cheat factor here, and no jump in
     size when it lands. Everything else follows from that:

       · the raised deck is nearly a full tile TALL, so the level-3 gateway
         had to be rebuilt around it — a tall plain arch between the two
         turrets instead of a stack of galleries (gateFaceT3)
       · the canvases are TWO tiles in the direction the deck falls
       · the chains are long, and hang from the turret heads rather than a
         gallery the deck would cover

     Change this and you must re-check the gateway it stands in. */
  const DB_LEN = 30;

  // a hanging chain: alternating dark/lit links, straight when the winch has
  // it taut, sagging a little once it has been let out
  function chainLine(q, x0, y0, x1, y1, sag) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = Math.round(x0 + (x1 - x0) * f);
      const y = Math.round(y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * sag);
      q(x, y, 1, 1, i % 2 ? IRON[0] : IRON[2]);
    }
  }
  // the winch drum the chain runs over, sat on the gallery
  function winch(q, x, y) {
    q(x - 1, y - 2, 4, 3, IRON[1]);
    q(x - 1, y - 2, 4, 1, IRON[2]);
    q(x, y - 1, 1, 1, IRON[3]);
    q(x - 1, y + 1, 4, 1, IRON[0]);
  }

  /* THE FACE — an east-west gatehouse seen straight on. The deck is hinged at
     the threshold (GND) and swings in the plane you are looking down: DOWN it
     lies south over the ground in front of the gate, UP it stands flat against
     the archway. So the free end's screen height is

         yEnd = GND + LEN·cosθ·FORE − LEN·sinθ

     — the ground reach foreshortened by FORE, the standing height drawn 1:1,
     which is how this game draws every other elevation. That expression walks
     smoothly from +10 rows (lying) through NEARLY EDGE-ON (a two-row slab, the
     honest look of a deck pointing at the camera) to −16 (upright), so the
     swing never jumps and never vanishes. Do not "fix" the edge-on frames by
     clamping the length: taking a max() of the two terms makes the deck
     teleport across the hinge in a single frame.

     Planks run ACROSS the span, so their spacing compresses with the
     foreshortening for free; two iron straps run ALONG it, hinge to chain
     ring. */
  function deckFace(q, t) {
    const WD = AP.wood;
    // one tile of ground, one tile of height — see DB_LEN. FORE is 1: the
    // terrain is drawn top-down, so a tile of ground IS a tile of screen.
    const GND = 30, LEN = DB_LEN, CX = 15.5, FORE = 1;
    const th = t * Math.PI / 2;
    const yEnd = GND + LEN * Math.cos(th) * FORE - LEN * Math.sin(th);
    const span = Math.abs(yEnd - GND) || 0.001;
    const y0 = Math.round(Math.min(GND, yEnd)), y1 = Math.round(Math.max(GND, yEnd));
    const frac = y => Math.min(1, Math.abs(y - GND) / span);      // 0 at the hinge, 1 at the free end
    // lying flat the far end is NEARER, so it reads a touch wider; stood up it
    // is the same distance away as the hinge and the taper goes with it
    const half = y => 5 + frac(y) * 0.9 * Math.cos(th);
    for (let y = y0; y <= y1; y++) {
      const h2 = half(y), x0 = Math.round(CX - h2), w = Math.max(2, Math.round(h2 * 2));
      const s = frac(y) * LEN;
      q(x0, y, w, 1, Math.round(s) % 3 === 0 ? WD[1] : (((s / 3) | 0) % 2 ? WD[2] : WD[3]));
      q(x0, y, 1, 1, WD[1]); q(x0 + w - 1, y, 1, 1, WD[1]);       // the deck's own long edges
    }
    // the iron straps running the deck's length, hinge to ring
    for (const fx of [-3, 2]) q(Math.round(CX + fx), y0, 1, y1 - y0 + 1, IRON[1]);
    // the shoe at the free end and the rings the chains are shackled to
    const eY = Math.round(yEnd), eh = 5 + 0.9 * Math.cos(th);
    const ex0 = Math.round(CX - eh), ew = Math.max(2, Math.round(eh * 2));
    q(ex0, eY, ew, 1, IRON[1]);
    q(ex0 - 1, eY, 1, 1, IRON[2]); q(ex0 + ew, eY, 1, 1, IRON[2]);
    /* …and the chains, up to winches on the TURRET HEADS. They used to sit in
       the gallery over the arch — which a full-height deck now covers, so the
       chains would have run to a drum hidden behind their own bridge. */
    const sag = (1 - t) * 2.4;
    chainLine(q, 8, 6, ex0 - 1, eY, sag);
    chainLine(q, 23, 6, ex0 + ew, eY, sag);
    winch(q, 8, 6); winch(q, 23, 6);
    // the shadow: cast back into the passage once the deck stands over it,
    // laid on the ground in front of it while it is still down
    if (yEnd < GND - 1) q(Math.round(CX - 5), eY, 10, 1, 'rgba(20,14,8,0.5)');
    if (yEnd > GND + 1) q(ex0 + 1, eY + 1, ew - 2, 1, ART.STYLE.SHADOW);
  }

  /* THE FLANK — a north-south gatehouse. The passage runs east-west, AWAY from
     you, so the deck swings out to the EAST and you watch it side-on: this is
     a plain picture-plane rotation about the hinge, no foreshortening to fight,
     and the clearest of the two views. Down it reaches east over the ground;
     up it stands against the block's east face. */
  function deckSide(q, t) {
    const WD = AP.wood;
    const HX = 26, GND = 29, LEN = DB_LEN, TH = 3;   // hinge at the block's east flank
    const th = t * Math.PI / 2;
    const ex = HX + LEN * Math.cos(th), ey = GND - LEN * Math.sin(th);
    // march the deck's length, stamping its thickness across at each step
    const n = Math.max(4, Math.round(LEN));
    const nx = Math.sin(th), ny = Math.cos(th);   // across the deck, from its walking face
    for (let i = 0; i <= n; i++) {
      const f = i / n, s = f * LEN;
      const cx = HX + (ex - HX) * f, cy = GND + (ey - GND) * f;
      const col = Math.round(s) % 3 === 0 ? WD[1] : (((s / 3) | 0) % 2 ? WD[2] : WD[3]);
      for (let k = 0; k <= TH; k++)
        q(Math.round(cx + nx * k), Math.round(cy + ny * k), 1, 1, k === TH ? WD[0] : col);
      q(Math.round(cx), Math.round(cy), 1, 1, WD[4]);             // the lit walking face
    }
    // the shoe, the ring, and the chain up to the winch on the block's head
    q(Math.round(ex), Math.round(ey), 1, 1, IRON[2]);
    q(Math.round(ex + nx * 2), Math.round(ey + ny * 2), 1, 1, IRON[1]);
    chainLine(q, 20, 6, Math.round(ex), Math.round(ey), (1 - t) * 2.4);
    winch(q, 20, 6);
    if (t < 0.6) q(HX, GND + TH + 1, Math.max(1, Math.round(ex - HX)), 1, ART.STYLE.SHADOW);
  }
  /* THE FAR SIDE. A drawbridge falls OUTWARD (Bld.gateOutside), and for a gate
     in an east-west wall the outside is sometimes NORTH — the far side, away
     from the camera. You cannot draw that deck coming toward you without
     drawing the castle opening backwards, and you cannot flip the near-side
     strip either: flipped, the RAISED frames stand below the hinge, which is
     nonsense.

     So it is authored: the deck lies on the ground BEYOND the wall and is
     hauled up out of sight behind it. The hinge is the curtain's far face
     (row 10, the top of the wall band), the deck reaches away from it up the
     screen, and its visible length SHRINKS as it rises — which is exactly
     what you see from inside a castle when the bridge comes up. render.js
     draws this one UNDER the gate sprite, so the curtain and the gatehouse
     occlude its near end the way they really would.

     The tile sits at the BOTTOM of this canvas (fine rows 16..47); the extra
     half-tile above is the ground beyond the wall. */
  function deckFaceAway(q, t) {
    const WD = AP.wood, TILE = 32;                     // where the gate's own tile starts
    /* The hinge is the gate's far threshold — which, in a projection that
       draws terrain from above and buildings facing you, is the TOP EDGE of
       the gate's tile: the ground beyond the wall is the tile above. Hung any
       lower the deck lands on the gatehouse's own crown and reads as a raft
       floating over the battlements. */
    const HINGE = TILE + 2, LEN = DB_LEN, CX = 15.5, FORE = 1;
    const th = t * Math.PI / 2;
    /* How much deck is still lying out there beyond the wall. Its HEIGHT is
       invisible from here (the wall is in the way), so the only thing the
       player reads is the reach — and a plain cos() barely moves for the first
       two frames, which made them identical stills. The mild power curve keeps
       it honest (monotone, fastest through the middle of the swing) while
       giving every frame its own length. The +1.5 floor leaves a last sliver
       of deck showing against the parapet rather than popping to nothing. */
    const ext = LEN * Math.pow(Math.cos(th), 1.6) * 0.94 + 1.5;
    const yEnd = HINGE - ext;
    const y0 = Math.round(yEnd), y1 = HINGE;
    const frac = y => Math.min(1, (HINGE - y) / (ext || 0.001));
    const half = y => 5 - frac(y) * 1.1;               // the far end recedes, so it narrows
    for (let y = y0; y <= y1; y++) {
      const h2 = half(y), x0 = Math.round(CX - h2), w = Math.max(2, Math.round(h2 * 2));
      const s2 = frac(y) * LEN;
      q(x0, y, w, 1, Math.round(s2) % 3 === 0 ? WD[1] : (((s2 / 3) | 0) % 2 ? WD[2] : WD[3]));
      q(x0, y, 1, 1, WD[1]); q(x0 + w - 1, y, 1, 1, WD[1]);
    }
    // the iron shoe at the far end, and the straps running the deck's length
    const eh = half(y0), ex0 = Math.round(CX - eh), ew = Math.max(2, Math.round(eh * 2));
    q(ex0, y0, ew, 1, IRON[1]);
    q(ex0 - 1, y0, 1, 1, IRON[2]); q(ex0 + ew, y0, 1, 1, IRON[2]);
    for (const fx of [-3, 2]) q(Math.round(CX + fx), y0, 1, y1 - y0 + 1, IRON[1]);
    // the shadow it lays on the ground beyond the wall
    if (ext > 5) q(ex0 + 1, y1 + 1, ew - 2, 1, ART.STYLE.SHADOW);
  }
  /* TWO TILES, the second one being the ground the deck reaches across. `tall`
     is the face (the deck falls south, so the gate's tile is the TOP half);
     otherwise it is the flank (falls east, gate's tile is the LEFT half). The
     far-side face uses the tall canvas with the gate's tile at the BOTTOM —
     deckFaceAway offsets itself by TILE to say so. */
  function tileDB(tall, draw) {
    const c = mk(tall ? 64 : 128, tall ? 128 : 64), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const q = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    draw(q);
    return c;
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
  /* Only the POLE is baked. The CLOTH is drawn every frame by render.js
     (R.drawBanners) so it can ripple in the wind AND wear the tribe's own
     tunic colour — a purple village flies purple, not the generic blue this
     sprite set is built in. Anchors live in R.BANNER_AT; if you move a pole
     here, move its anchor there (tests/banners-smoke.mjs pins that they
     agree). `fac` is unused now but kept in the signature: every caller
     passes it, and the rival set is still generated per faction. */
  function banner(p, x, y, fac) {
    p(x, y, 1, 4, AP.wood[2]);
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
        q(4, 3, 1, 8, AP.wood[2]); q(27, 3, 1, 8, AP.wood[2]);   // poles only — cloth in render.js
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
    /* ============ GOLD MINE (tests/gold-mine.mjs) ============
       A mine is a HOLE with works around it, and the tiers are the works
       getting serious: L1 a timber-framed adit driven into the reef with a
       spoil heap and a barrow; L2 a windlass on a frame over the shaft, an
       ore cart on rails and a dressed-stone portal; L3 the full headframe with
       its wheel, a wash-trough sluicing the crushed rock, and gold stacked in
       the cart. The seam it stands on shows around the works at every tier —
       that is what says GOLD rather than "quarry". */
    /* ============ BARBARIAN CAMP (tests/raider-camps.mjs) ============
       Nobody's tribe raised this: a hide tent lashed over bent poles, a ring
       of sharpened stakes leaning outward, a skull totem on a pole and a fire
       that never goes out. Rust and bone, never the tribes' timber-and-thatch,
       so it reads as OTHER at a glance across a fogged map — and it has hp,
       so a war party can burn it out. One level; `lv` is ignored. */
    raidercamp(p) {
      const q = p.hi, R = AP.rust, HD = AP.hide, BO = AP.bone, W = AP.wood, F = AP.fire, INK = AP.ink;
      ART.dropShadow(p, 8, 14, 12);
      const rr = ART.rng(311);
      // the stake ring — sharpened poles leaning outward round the camp
      for (const [sx, sy, lean] of [[2, 12, -1], [4, 22, -1], [27, 11, 1], [29, 21, 1], [9, 27, 0], [21, 28, 0]]) {
        q(sx, sy, 2, 6, W[1]); q(sx, sy, 1, 6, W[2]);
        q(sx + lean, sy - 2, 2, 2, W[2]); q(sx + lean, sy - 2, 1, 1, BO[1]);
      }
      // the TENT — hide stretched over bent poles, a dark mouth in the front
      for (let i = 0; i < 13; i++) {
        const w = 3 + i * 1.5 | 0;
        q(15 - (w >> 1), 6 + i, w, 1, i < 3 ? HD[2] : HD[1]);
        q(15 - (w >> 1), 6 + i, 1, 1, HD[3]);
        q(15 + (w >> 1) - 1, 6 + i, 1, 1, HD[0]);
      }
      q(5, 18, 21, 3, HD[1]); q(5, 18, 21, 1, HD[2]); q(5, 20, 21, 1, INK[0]);
      q(12, 12, 7, 9, INK[0]);                            // the mouth of it
      q(12, 12, 7, 1, HD[0]);
      for (let i = 0; i < 5; i++) q(6 + i * 4, 8 + i, 1, 10 - i, R[1]);   // hide seams and lashings
      q(13, 3, 2, 5, W[1]); q(12, 2, 4, 2, BO[2]);        // the pole at the crown, tipped with bone
      // the SKULL TOTEM on its stake, facing out
      q(24, 8, 2, 12, W[1]); q(24, 8, 1, 12, W[2]);
      q(22, 4, 6, 5, BO[2]); q(22, 4, 6, 1, BO[1]);
      q(23, 6, 2, 2, INK[0]); q(26, 6, 1, 2, INK[0]);     // eye sockets
      q(23, 9, 4, 1, BO[1]);
      q(21, 3, 2, 3, R[2]); q(28, 3, 2, 3, R[2]);         // war rags tied to the stake
      // the FIRE that never goes out, ringed with stones
      const fx = 6, fy = 24;
      for (let i = 0; i < 6; i++) q(fx - 2 + i * 2, fy + 2 - (i % 2), 2, 2, AP.stone[1]);
      q(fx - 1, fy - 1, 6, 2, W[0]); q(fx, fy - 3, 4, 3, F[0]);
      q(fx + 1, fy - 5, 3, 3, F[1]); q(fx + 1, fy - 7, 2, 2, F[2]);
      // a gnawed carcass and a spear stuck in the ground
      q(20, 25, 6, 2, BO[1]); q(20, 25, 6, 1, BO[2]); q(22, 24, 1, 2, BO[2]);
      q(29, 22, 1, 8, W[1]); q(28, 20, 3, 3, AP.stone[2]); q(28, 20, 3, 1, AP.stone[3]);
    },
    mine(p, lv) {
      const q = p.hi, tier = lv, ST = AP.stone, W = AP.wood, GD = AP.gold, RK = AP.rock, INK = AP.ink;
      ART.dropShadow(p, 8, 14, 12);
      const FOOT = 23;                                      // where the bank meets the ground
      const r = ART.rng(77);
      /* THE BANK the adit is driven into. It has to be a natural RISE with a
         broken skyline, not a filled rectangle — a rect reads as a flat card
         with a hole in it and the eye never finds the mine in it. Every column
         gets its own crest height off two out-of-phase sines, and the right
         flank falls into shadow so the mass turns away from the light. */
      for (let x = 2; x < 30; x++) {
        // low frequencies only — a high-frequency term puts a TOOTH on every
        // column and the bank reads as battlements instead of a hillside
        const top = 6 + Math.round(2.6 * Math.sin(x * 0.30) + 1.1 * Math.sin(x * 0.85 + 1.2));
        q(x, top, 1, FOOT - top, RK[2]);
        q(x, top, 1, 1, RK[4]);                             // sun on the crest
        q(x, top + 1, 1, 1, RK[3]);
        if (x >= 21) q(x, top + 2, 1, FOOT - top - 2, RK[1]);
        if (x <= 4) q(x, top + 2, 1, FOOT - top - 2, RK[3]);
      }
      q(2, FOOT - 1, 28, 1, RK[0]);                         // the dark line at the foot
      // GOLD showing all through the rock — the one thing that says which mine
      for (let i = 0; i < 14; i++) {
        const vx = 3 + ((r() * 25) | 0), vy = 8 + ((r() * 12) | 0);
        q(vx, vy, 3, 1, GD[2]); q(vx, vy, 2, 1, GD[3]);
        if (r() < 0.5) q(vx + 1, vy + 1, 2, 1, GD[1]);
      }
      /* THE ADIT sits OFF-CENTRE, to the left. A worker stationed here stands
         on the middle of its own plot (the `work` task walks it onto b.x/b.y),
         so a mouth in the middle of the tile is a mouth nobody can see — the
         one thing that says "mine" would be behind a villager all game. The
         mouth takes the left third and every set of works runs off to the
         right of it. */
      // AX is pushed hard left on purpose: a villager sprite fills roughly the
      // middle third of its tile, so anything from x≈10 to x≈22 is behind a
      // worker whenever the mine is actually being worked
      const stone2 = tier >= 2, AX = 2, AW = 9;
      q(AX, 11, AW, FOOT - 11, INK[0]);
      q(AX + 1, 10, AW - 2, 1, INK[0]);
      q(AX - 1, 9, AW + 2, 2, stone2 ? ST[3] : W[2]);       // the head timber
      q(AX - 1, 9, AW + 2, 1, stone2 ? ST[4] : W[3]);
      q(AX - 1, 11, 2, FOOT - 11, stone2 ? ST[3] : W[2]);   // the legs of the set
      q(AX + AW - 1, 11, 2, FOOT - 11, stone2 ? ST[1] : W[1]);
      if (stone2) { q(AX - 2, 8, AW + 4, 1, ST[4]); q(AX - 2, FOOT - 1, AW + 4, 1, ST[1]); }
      // the SPOIL running out of the mouth, and a pick left standing in it
      q(0, FOOT, 12, 3, RK[1]); q(0, FOOT, 12, 1, RK[2]); q(1, FOOT - 1, 8, 1, RK[2]);
      for (let i = 0; i < 5; i++) q(1 + i * 2, FOOT + 1, 1, 1, ST[2]);
      q(29, FOOT - 3, 1, 7, W[2]); q(28, FOOT - 4, 3, 1, ST[3]);
      q(28, FOOT - 3, 1, 1, ST[3]); q(30, FOOT - 3, 1, 1, ST[3]);
      if (tier === 1) {
        // a hand barrow parked to the right of the mouth
        q(17, FOOT + 1, 8, 4, W[2]); q(17, FOOT + 1, 8, 1, W[3]);
        q(16, FOOT + 5, 2, 2, W[1]); q(24, FOOT + 4, 2, 1, W[1]);
        q(19, FOOT + 2, 4, 2, GD[1]); q(19, FOOT + 2, 2, 1, GD[2]);
      }
      if (tier >= 2) {
        // the WINDLASS — a frame standing over the mouth and clear of the
        // bank's crest, so the tier is legible in silhouette
        q(AX - 3, 1, 2, 9, W[1]); q(AX - 3, 1, 2, 1, W[3]);
        q(AX + AW + 1, 1, 2, 9, W[1]); q(AX + AW + 1, 1, 2, 1, W[3]);
        q(AX - 4, 0, AW + 8, 2, W[2]); q(AX - 4, 0, AW + 8, 1, W[3]);
        ART.shadedCircle(q, AX + 4, 4, 3, W, 2);
        q(AX + 4, 6, 1, 4, AP.thatch[1]);                   // the rope down the shaft
        // rails running out to the right with a loaded ore cart on them
        q(14, FOOT + 5, 17, 1, W[1]); q(14, FOOT + 7, 17, 1, W[1]);
        q(17, FOOT + 1, 10, 4, W[2]); q(17, FOOT + 1, 10, 1, W[3]); q(17, FOOT + 1, 1, 4, W[3]);
        q(19, FOOT + 2, 6, 2, GD[1]); q(19, FOOT + 2, 4, 1, GD[2]);
        q(17, FOOT + 5, 2, 2, INK[1]); q(25, FOOT + 5, 2, 2, INK[1]);
      }
      if (tier >= 3) {
        // the FULL HEADFRAME: braced legs and a winding wheel over the mouth
        q(AX - 4, 0, 2, 11, W[2]); q(AX + AW + 2, 0, 2, 11, W[2]); q(AX - 4, 0, 2, 1, W[3]);
        q(AX - 3, 3, AW + 5, 1, W[1]); q(AX - 3, 7, AW + 5, 1, W[1]);
        ART.shadedCircle(q, AX + 4, 3, 4, W, 3);
        ART.shadedCircle(q, AX + 4, 3, 2, ST, 2);
        for (let a = 0; a < 6; a++)
          q(AX + 4 + Math.round(Math.cos(a) * 3), 3 + Math.round(Math.sin(a) * 3), 1, 1, W[1]);
        // a wash trough sluicing the crushed rock, running gold-bright
        q(18, FOOT - 5, 13, 3, W[1]); q(18, FOOT - 5, 13, 1, W[3]);
        q(19, FOOT - 4, 11, 1, AP.water[3]);
        for (let i = 0; i < 4; i++) q(20 + i * 3, FOOT - 4, 1, 1, GD[2]);
        // ingots stacked clear of the rails, and gold set in the portal head
        q(27, FOOT + 2, 5, 2, GD[1]); q(27, FOOT + 2, 5, 1, GD[2]);
        q(28, FOOT, 3, 2, GD[1]); q(28, FOOT, 3, 1, GD[3]);
        q(AX + 3, 6, 3, 2, GD[2]); q(AX + 3, 6, 2, 1, GD[3]);
      }
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
      if (tier === 2) {
        /* LEVEL 2 — HALF AND HALF (tests/wall-tower-bond.mjs): a coursed
           STONE base carrying a TIMBER upper storey, divided by a lit
           corbelled string-course. It used to be bWall's tier-2 dress —
           planking with a mere two-row stone footing — which barely read as
           a change from the level-1 tower. L1 (wattle) and L3 (all dressed
           stone) are deliberately untouched. */
        ART.woodPlankTexture(q, 11, 9, 10, 8, 17);                  // timber upper storey
        q(11, 9, 1, 8, AP.wood[3]); q(20, 9, 1, 8, AP.wood[1]);     // corner posts
        q(10, 16, 12, 1, AP.stone[4]); q(10, 17, 12, 1, AP.stone[2]);   // corbelled string-course
        ART.stoneTexture(q, 11, 18, 10, 8, 24);                     // coursed stone base
        for (let i = 0; i < 8; i += 2) {                            // dressed quoins up the base
          q(11, 18 + i, 2, 2, (i & 2) ? AP.stone[4] : AP.stone[3]);
          q(19, 18 + i, 2, 2, (i & 2) ? AP.stone[1] : AP.stone[0]);
        }
      } else bWall(q, 11, 9, 10, 17, tier, 17);                     // tall narrow shaft
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
      q(25, 8, 1, 20, AP.wood[2]); q(25, 6, 1, 2, AP.stone[4]);   // pole only — cloth in render.js
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
      q(3, 1, 1, 24, AP.wood[1]); q(3, 0, 1, 1, AP.gold[2]);   // pole only — the cloth flies in render.js
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
    gate(p, lv) { drawGate(p, lv, false); },       // the east-west gatehouse (and the panel icon)
  };
  // build the player (blue) set and a rival (red) set; full-tile and
  // auto-tiling sprites skip the outline pass so they keep tiling seamlessly
  const NO_OUTLINE = new Set(['farm', 'quarry', 'wall', 'gate']);
  Sprites.buildingA = {};
  // WALLS stay full-tile (32px) so the 16-mask atlas auto-tiles seamlessly;
  // every other building — the GATEHOUSE included, so it carries the same
  // detail as the towers it stands between — is drawn at HIGH RES (64px), with
  // a proportional 2px outline for everything not in NO_OUTLINE
  const LORES_BLD = new Set(['wall']);
  /* THE WALL ATLAS IS BUILT FIRST. A gatehouse stamps a straight run of the
     REAL wall art as its own curtain (drawGate), so the two can never drift
     apart — which is exactly what had happened: the gate hand-drew its own
     approximation of the curtain and the merlons stopped dead at the gate,
     the walk stepped a row, and every gate wore a seam on both flanks.
     wallMask[level-1][mask 0..15]. */
  Sprites.wallMask = [1, 2, 3].map(lv =>
    Array.from({ length: 16 }, (_, m) => tile(p => drawWallMask(p, lv, m))));
  for (const key of Object.keys(B_DRAW)) {
    const hi = !LORES_BLD.has(key);
    const build = (fac) => [1, 2, 3].map(lv => {
      const c = (hi ? tileB : tile)(p => B_DRAW[key](p, lv, fac));
      return NO_OUTLINE.has(key) ? c : ART.outline(c, 1);
    });
    Sprites.building[key] = build(AP.blue);
    Sprites.buildingA[key] = build(AP.red);
  }
  // [east-west face, north-south flank] — two authored views (see drawGate)
  Sprites.gateMask = [0, 1, 2].map(li =>
    [Sprites.building.gate[li], tileB(p => drawGate(p, li + 1, true))]);
  // the tower's OTHER self: the one it wears when a wall is built onto it
  Sprites.towerMural = [1, 2, 3].map(lv => tileB(p => drawTowerMural(p, lv)));
  /* THE DRAWBRIDGE ATLAS — drawbridge[0] is the east-west face (1×1½ tall),
     drawbridge[1] the north-south flank (1½ wide×1); frame 0 is fully DOWN and
     the last is fully UP, so both directions of the action are the same strip
     read one way or the other. R.drawDrawbridge picks the frame. */
  Sprites.DRAWBRIDGE_N = DRAWBRIDGE_N;
  Sprites.drawbridge = [
    Array.from({ length: DRAWBRIDGE_N }, (_, i) => tileDB(true, q => deckFace(q, i / (DRAWBRIDGE_N - 1)))),
    Array.from({ length: DRAWBRIDGE_N }, (_, i) => tileDB(false, q => deckSide(q, i / (DRAWBRIDGE_N - 1)))),
    // …and the FAR-SIDE face, for a gate whose outside is north (deckFaceAway)
    Array.from({ length: DRAWBRIDGE_N }, (_, i) => tileDB(true, q => deckFaceAway(q, i / (DRAWBRIDGE_N - 1)))),
  ];

  /* ================= THE ANCIENT WONDERS (tests/wonder.mjs) =================
     Ten monuments, one rolled per run. Each is a 3×3 building — the biggest
     footprint in the game — so each gets a 192px canvas with a 96-CELL grid
     (`q`, 2px per cell) and a 192-cell fine grid (`q.hi`, 1px per cell). At
     three tiles wide that lands one grid cell per screen pixel: exactly the
     density every other building is authored at, over nine times the area.

     Convention, same as the fortifications: the monument FACES YOU and stands
     on the front of its plot — the ground line is cell y=84 of 96, with the
     contact shadow under it. Megaliths use the warm weathered `rock` ramp,
     dressed masonry the cool `stone` ramp; that alone tells a raised circle
     of menhirs from a mason's temple at a glance. */
  function tileW(draw) {
    const c = mk(192, 192), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    p.hi = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, (w || 1), (h || 1)); };
    p.g = g;
    draw(p, g);
    return c;
  }
  const WGY = 84;   // the ground line every wonder stands on (96-grid)

  // broad soft contact shadow for a monument — three tapering bands, so the
  // thing reads as PLANTED rather than pasted onto the grass
  function wShadow(q, cx, w) {
    const SH = ART.STYLE.SHADOW;
    q(cx - (w >> 1), WGY, w, 3, SH);
    q(cx - (w >> 1) + 3, WGY + 3, w - 6, 2, SH);
    q(cx - (w >> 1) + 8, WGY + 5, w - 16, 1, SH);
  }
  // a weathered MEGALITH — undressed stone, lit top-left, lichen and pitting.
  // `lean` shifts the top edge, so a raised circle never reads as a picket fence.
  function menhir(q, x, y, w, h, seed, lean) {
    const RK = AP.rock, r = ART.rng(seed);
    lean = lean || 0;
    for (let i = 0; i < h; i++) {
      const off = Math.round(lean * (h - i) / h);
      q(x + off, y + i, w, 1, RK[2]);
      q(x + off, y + i, 1, 1, RK[3]);                       // lit left edge
      q(x + off + w - 1, y + i, 1, 1, RK[1]);               // shaded right edge
    }
    q(x + Math.round(lean), y, w, 1, RK[4]);                // sun on the crown
    for (let i = 0; i < w * h * 0.10; i++) {                // pitting and lichen
      const px = x + ((r() * w) | 0), py = y + ((r() * h) | 0);
      const off = Math.round(lean * (h - (py - y)) / h);
      q(px + off, py, 1, 1, r() < 0.62 ? RK[1] : (r() < 0.5 ? AP.leaf[1] : RK[3]));
    }
  }
  // dressed ASHLAR masonry — coursed blocks with recessed joints
  function ashlarBlock(q, x, y, w, h, seed, ramp) {
    const ST = ramp || AP.stone, r = ART.rng(seed);
    q(x, y, w, h, ST[2]);
    q(x, y, w, 1, ST[4]); q(x, y, 1, h, ST[3]);
    q(x, y + h - 1, w, 1, ST[0]); q(x + w - 1, y, 1, h, ST[1]);
    for (let cy = y + 3; cy < y + h - 1; cy += 3) {
      q(x + 1, cy, w - 2, 1, ST[1]);                        // course line
      const start = ((cy - y) & 2) ? 4 : 7;
      for (let cx = x + start; cx < x + w - 1; cx += 7) q(cx, cy - 2, 1, 2, ST[1]);   // vertical joints
    }
    for (let i = 0; i < w * h * 0.06; i++)
      q(x + ((r() * w) | 0), y + ((r() * h) | 0), 1, 1, r() < 0.5 ? ST[3] : ST[1]);
  }
  // the stepped plinth most of the monuments stand on
  function plinth(q, cx, w, h, steps, ramp) {
    for (let i = 0; i < steps; i++) {
      const sw = w - i * ((w * 0.10) | 0), sy = WGY - (i + 1) * h;
      ashlarBlock(q, cx - (sw >> 1), sy, sw, h + 1, 200 + i * 13, ramp);
    }
  }

  const BRONZE = ['#3a2810', '#6b481c', '#96662a', '#bd8b3e', '#e3b862'];
  const PATINA = ['#1c4a3e', '#2f7a63', '#49a184'];

  const W_DRAW = {
    /* ---- THE STONE CIRCLE — a raised ring of trilithons on trodden chalk,
       the back arc small and high, the front arc big and low, an altar slab
       lying across the middle. ---- */
    henge(q) {
      wShadow(q, 48, 78);
      const SO = AP.soil, RK = AP.rock;
      // trodden chalk ring the stones stand in (an ellipse of bare pale earth)
      for (let y = 30; y <= WGY - 1; y++) {
        const t = (y - 30) / (WGY - 31), rw = Math.round(20 + t * 24);
        q(48 - rw, y, rw * 2, 1, y > 62 ? SO[2] : SO[1]);
      }
      for (let y = 34; y <= WGY - 5; y++) {                 // inner sward, so it reads as a RING
        const t = (y - 34) / (WGY - 39), rw = Math.round(11 + t * 13);
        q(48 - rw, y, rw * 2, 1, AP.grass[2]);
      }
      const trilithon = (cx, top, sw, sh, seed) => {
        menhir(q, cx - sw - 2, top + 4, sw, sh, seed, 0);
        menhir(q, cx + 2, top + 4, sw, sh, seed + 7, 0);
        // the lintel across, with its own lit top and dark underside
        q(cx - sw - 3, top, sw * 2 + 6, 4, RK[2]);
        q(cx - sw - 3, top, sw * 2 + 6, 1, RK[4]);
        q(cx - sw - 3, top + 3, sw * 2 + 6, 1, RK[0]);
      };
      // BACK arc — smaller, higher up the plot
      trilithon(24, 24, 4, 20, 11); trilithon(48, 20, 4, 22, 23); trilithon(72, 24, 4, 20, 37);
      // FLANKS — the ring turning toward us
      trilithon(12, 38, 5, 24, 51); trilithon(84, 38, 5, 24, 67);
      // FRONT arc — the great stones, tallest and nearest
      trilithon(26, 50, 7, 30, 83); trilithon(70, 50, 7, 30, 97);
      // the altar slab lying in the middle of the ring
      q(38, 62, 22, 6, RK[2]); q(38, 62, 22, 1, RK[4]); q(38, 67, 22, 1, RK[0]);
      q(37, 68, 24, 2, RK[1]);
      for (let i = 0; i < 5; i++) q(40 + i * 4, 63, 1, 4, RK[3]);
    },

    /* ---- THE BRONZE COLOSSUS — a giant warrior of hammered bronze on a
       dressed plinth, spear levelled, shield on the arm, patina running in
       the shadowed folds. ---- */
    colossus(q) {
      wShadow(q, 48, 62);
      plinth(q, 48, 54, 5, 3);
      const B = BRONZE, PT = PATINA;
      /* Anatomy is laid out in ABSOLUTE cells, so the giant reads as a FIGURE
         and not a mass of metal: feet on the plinth at 68, hips at 42,
         shoulders at 22, the head filling 13..22 — six heads tall, the heroic
         proportion. The arms hang CLEAR of the torso with daylight between
         them, which at this size is the whole difference between a statue and
         a blob. */
      const limb = (x, y, w, h) => {
        q(x, y, w, h, B[2]); q(x, y, 2, h, B[3]); q(x + w - 2, y, 2, h, B[1]);
      };
      // LEGS — one bearing the weight, one relaxed and half a step forward
      limb(39, 42, 8, 24); limb(50, 42, 8, 26);
      q(45, 48, 2, 12, B[1]); q(56, 50, 2, 12, B[1]);         // shin shadow, so the legs separate
      q(37, 65, 12, 4, B[2]); q(37, 65, 12, 1, B[3]);         // sandals
      q(48, 66, 12, 3, B[2]); q(48, 66, 12, 1, B[3]);
      q(41, 40, 6, 4, B[3]); q(52, 40, 6, 4, B[3]);           // knees catching the light
      // the pteruges skirt hanging from the belt
      q(37, 35, 23, 7, B[2]); q(37, 35, 23, 1, B[4]);
      for (let i = 0; i < 6; i++) q(38 + i * 4, 42, 3, 5, i & 1 ? B[1] : B[2]);
      // TORSO — a modelled cuirass, broad at the shoulder, drawn in at the waist
      for (let y = 22; y < 36; y++) {
        const t = (y - 22) / 13, w = Math.round(24 - t * 7);
        q(48 - (w >> 1), y, w, 1, B[2]);
        q(48 - (w >> 1), y, 2, 1, B[3]); q(48 + (w >> 1) - 2, y, 2, 1, B[1]);
      }
      q(36, 22, 24, 2, B[4]);
      q(40, 26, 7, 5, B[3]); q(50, 26, 7, 5, B[3]);           // pectorals
      q(47, 25, 2, 10, B[1]);                                  // the line down the breastplate
      q(42, 32, 12, 2, B[1]);                                  // the ribs' shadow
      q(38, 30, 21, 1, PT[0]); q(40, 33, 16, 1, PT[1]);        // patina weeping down the bronze
      // ARMS, hanging clear of the body — the left carrying the shield low,
      // the right closed on the spear haft
      limb(29, 24, 7, 19); limb(30, 42, 6, 13);
      limb(60, 24, 7, 18); limb(61, 41, 6, 14);
      q(29, 22, 9, 4, B[3]); q(58, 22, 9, 4, B[3]);            // shoulder pauldrons
      // the SPEAR standing the full height of the plot, gripped in the right fist
      q(63, 2, 3, 64, AP.wood[1]); q(63, 2, 1, 64, AP.wood[3]);
      q(61, 0, 7, 7, B[3]); q(63, 0, 3, 3, B[4]); q(61, 6, 7, 2, B[1]);
      q(60, 51, 8, 5, B[2]); q(60, 51, 8, 1, B[4]);            // the fist round the haft
      // the SHIELD, carried on the left arm and well clear of the chest. It
      // needs a DARK RIM: bronze on bronze at one value is a boulder.
      ART.shadedCircle(q, 21, 44, 9, B, 2);
      for (let a = 0; a < 26; a++) {
        const t = a * 0.242;
        q(21 + Math.round(Math.cos(t) * 9), 44 + Math.round(Math.sin(t) * 9), 2, 2, B[0]);
        q(21 + Math.round(Math.cos(t) * 7), 44 + Math.round(Math.sin(t) * 7), 1, 1, B[4]);
      }
      ART.shadedCircle(q, 21, 44, 3, B, 3);
      q(14, 50, 13, 2, PT[0]);
      /* SEPARATION. Every limb is the same metal at the same value, so the
         figure only reads if the joins are cut with the darkest bronze — this
         is what turns a bronze mass back into arms, legs and a body. */
      q(36, 24, 2, 30, B[0]); q(58, 24, 2, 28, B[0]);          // torso against the arms
      q(47, 42, 2, 24, B[0]);                                   // between the legs
      q(41, 12, 1, 11, B[0]); q(54, 12, 1, 11, B[0]);           // face against the cheek pieces
      // HEAD — a clean bronze face under a crested helm
      q(42, 13, 13, 10, B[2]); q(42, 13, 3, 10, B[3]); q(52, 13, 3, 10, B[1]);
      q(44, 17, 3, 2, AP.ink[0]); q(50, 17, 3, 2, AP.ink[0]);  // eye sockets, cast in shadow
      q(47, 17, 3, 4, B[1]);                                    // the nose guard
      q(44, 22, 9, 1, B[0]);
      q(40, 13, 2, 8, B[1]); q(55, 13, 2, 8, B[1]);             // cheek pieces
      q(41, 9, 15, 5, B[3]); q(41, 9, 15, 1, B[4]);             // helm brow band
      q(43, 6, 11, 4, B[2]); q(43, 6, 11, 1, B[4]);             // the dome
      // the horsehair CREST — an arc springing off the dome and falling behind,
      // drawn as a curve rather than a heap so it reads as a plume
      for (let i = 0; i < 20; i++) {
        const t = i / 19;
        const cx = 44 + Math.round(t * 15);
        const top = 1 + Math.round(t * t * 9);
        const h = Math.round(4 + Math.sin(t * 3.14) * 4);
        q(cx, top, 2, h, i % 3 ? AP.red[2] : AP.red[1]);
        q(cx, top, 2, 1, AP.red[2]);
      }
      q(43, 4, 10, 3, B[3]); q(43, 4, 10, 1, B[4]);             // the crest box on the dome
      // the dedication plaque on the plinth
      q(38, WGY - 12, 22, 7, AP.stone[1]); q(38, WGY - 12, 22, 1, AP.stone[3]);
      for (let i = 0; i < 5; i++) q(41 + i * 4, WGY - 10, 2, 3, AP.gold[2]);
    },

    /* ---- THE GREAT STONE HEADS — three moai on a long ahu platform: heavy
       brows, long noses, jutting chins, and scoria topknots. ---- */
    moai(q) {
      wShadow(q, 48, 84);
      const RK = AP.rock;
      // the AHU — a long fitted-stone platform the heads stand on
      ashlarBlock(q, 6, WGY - 13, 84, 13, 17, AP.stone);
      q(6, WGY - 13, 84, 2, AP.stone[4]);
      const head = (cx, top, w, seed, topknot) => {
        const h = WGY - 13 - top;
        // the body/torso, narrower than the head and buried to the shoulders
        q(cx - (w >> 1) - 2, top + Math.round(h * 0.62), w + 4, h - Math.round(h * 0.62), RK[2]);
        q(cx - (w >> 1) - 2, top + Math.round(h * 0.62), 3, h - Math.round(h * 0.62), RK[3]);
        q(cx + (w >> 1), top + Math.round(h * 0.62), 3, h - Math.round(h * 0.62), RK[1]);
        // the HEAD — a long slab, flat top, lit left face
        q(cx - (w >> 1), top, w, Math.round(h * 0.66), RK[2]);
        q(cx - (w >> 1), top, 4, Math.round(h * 0.66), RK[3]);
        q(cx + (w >> 1) - 4, top, 4, Math.round(h * 0.66), RK[1]);
        q(cx - (w >> 1), top, w, 2, RK[4]);
        // the brow — one heavy shelf across, with the eyes cut deep beneath it
        q(cx - (w >> 1) + 1, top + 7, w - 2, 4, RK[3]);
        q(cx - (w >> 1) + 1, top + 11, w - 2, 2, RK[0]);
        q(cx - (w >> 1) + 3, top + 12, 5, 3, AP.ink[0]); q(cx + (w >> 1) - 8, top + 12, 5, 3, AP.ink[0]);
        // the long nose and the set mouth
        q(cx - 2, top + 11, 5, 13, RK[3]); q(cx - 3, top + 22, 7, 3, RK[1]);
        q(cx - 5, top + 29, 11, 2, RK[0]);
        // the jutting chin, and the long ears down the flanks
        q(cx - 7, top + 33, 15, 5, RK[2]); q(cx - 7, top + 33, 15, 1, RK[3]);
        q(cx - (w >> 1) - 1, top + 10, 3, 20, RK[1]); q(cx + (w >> 1) - 2, top + 10, 3, 20, RK[1]);
        if (topknot) {                                        // red scoria topknot
          const RD = AP.red;
          q(cx - (w >> 1) + 1, top - 8, w - 2, 8, RD[1]);
          q(cx - (w >> 1) + 1, top - 8, w - 2, 2, RD[2]);
          q(cx - (w >> 1) + 3, top - 10, w - 6, 2, RD[1]);
        }
        for (let i = 0; i < 14; i++) {                        // weathering on the face
          const r = ART.rng(seed + i);
          q(cx - (w >> 1) + ((r() * w) | 0), top + ((r() * h * 0.6) | 0), 1, 1, r() < 0.5 ? RK[1] : RK[3]);
        }
      };
      head(20, 30, 20, 61, true);
      head(48, 18, 24, 29, true);
      head(76, 32, 19, 97, false);
      // fallen blocks and cut chips at the foot of the platform
      for (let i = 0; i < 7; i++) {
        const x = 8 + i * 12 + (i & 1) * 3;
        q(x, WGY - 2, 6, 3, RK[1]); q(x, WGY - 2, 6, 1, RK[2]);
      }
    },

    /* ---- THE STEP PYRAMID — five receding terraces of dressed stone, a
       ceremonial stair up the front face, a shrine with a lit doorway on the
       summit. ---- */
    pyramid(q) {
      wShadow(q, 48, 86);
      const ST = AP.stone;
      const N = 5, baseW = 86, topW = 26, hStep = 11;
      for (let i = 0; i < N; i++) {
        const w = Math.round(baseW - (baseW - topW) * (i / (N - 1)));
        const y = WGY - (i + 1) * hStep;
        ashlarBlock(q, 48 - (w >> 1), y, w, hStep + 1, 31 + i * 9, ST);
        q(48 - (w >> 1), y, w, 2, ST[4]);                       // sunlit terrace lip
        q(48 - (w >> 1), y + hStep - 1, w, 1, ST[0]);           // shadow under the overhang
        // the shaded right flank of each terrace, so it reads as a solid mass
        q(48 + (w >> 1) - 7, y, 7, hStep, ST[1]);
      }
      // the GREAT STAIR up the front — balustrades either side, treads between
      const sx = 38, sw = 20;
      q(sx - 3, WGY - N * hStep, 3, N * hStep, ST[3]);
      q(sx + sw, WGY - N * hStep, 3, N * hStep, ST[1]);
      for (let i = 0; i < N * hStep - 2; i += 3) {
        q(sx, WGY - 1 - i, sw, 2, ST[3]);
        q(sx, WGY - 2 - i, sw, 1, ST[0]);
      }
      // the SHRINE on the summit — a small hall with a lit doorway and a lintel
      const ty = WGY - N * hStep;
      ashlarBlock(q, 36, ty - 17, 24, 17, 77, ST);
      q(36, ty - 17, 24, 2, ST[4]);
      q(33, ty - 20, 30, 4, ST[3]); q(33, ty - 20, 30, 1, ST[4]);  // projecting cornice
      q(43, ty - 12, 10, 12, AP.ink[0]);
      q(43, ty - 12, 10, 2, AP.fire[0]);                            // firelight in the doorway
      q(45, ty - 4, 6, 4, AP.fire[1]);
      for (let i = 0; i < 3; i++) q(38, ty - 15 + i * 4, 20, 1, ST[1]);
    },

    /* ---- THE SUN OBELISK — one tapering granite needle with a gilded
       pyramidion, carved bands down its length, on a stepped base between two
       burning bowls. ---- */
    obelisk(q) {
      wShadow(q, 48, 58);
      plinth(q, 48, 50, 5, 3);
      const RK = AP.rock, GD = AP.gold;
      const capY = 2, botY = WGY - 16;
      // the SHAFT — a true needle: 62 cells of granite tapering from 13 wide at
      // the foot to 7 at the throat, so it reads as tall rather than stubby
      for (let y = 14; y <= botY; y++) {
        const t = (y - 14) / (botY - 14);
        const w = 7 + Math.round(t * 6);
        const x0 = 48 - (w >> 1);
        q(x0, y, w, 1, RK[2]);
        q(x0, y, 2, 1, RK[3]);
        q(x0 + w - 2, y, 2, 1, RK[1]);
      }
      // the gilded PYRAMIDION catching the first of the sun
      for (let i = 0; i < 12; i++) {
        const w = 1 + Math.round(i * 0.55);
        q(48 - w, capY + i, w * 2 + 1, 1, i < 4 ? GD[3] : GD[2]);
        q(48 + w - 1, capY + i, 1, 1, GD[1]);
        q(48 - w, capY + i, 1, 1, GD[3]);
      }
      q(45, 14, 7, 2, GD[1]); q(45, 14, 7, 1, GD[2]);
      // carved bands of glyphs running the length of the face
      for (let y = 20; y < botY - 8; y += 10) {
        q(45, y, 6, 7, RK[1]);
        q(46, y + 1, 2, 2, RK[3]); q(48, y + 4, 2, 2, RK[3]); q(46, y + 4, 1, 1, RK[3]);
      }
      // the two BRAZIERS flanking the base — bronze bowls on stone columns,
      // burning low so they frame the shaft instead of competing with it
      const B = BRONZE, F = AP.fire, ST = AP.stone;
      for (const bx of [17, 79]) {
        q(bx - 8, WGY - 7, 16, 7, ST[2]); q(bx - 8, WGY - 7, 16, 1, ST[4]); q(bx - 8, WGY - 1, 16, 1, ST[0]);
        q(bx - 5, WGY - 23, 10, 16, ST[2]); q(bx - 5, WGY - 23, 3, 16, ST[3]); q(bx + 2, WGY - 23, 3, 16, ST[1]);
        for (let i = 0; i < 4; i++) q(bx - 5, WGY - 20 + i * 4, 10, 1, ST[1]);
        q(bx - 8, WGY - 27, 16, 4, ST[3]); q(bx - 8, WGY - 27, 16, 1, ST[4]);
        // the bowl
        for (let dy = 0; dy < 6; dy++) {
          const w = 11 - dy;
          q(bx - (w >> 1), WGY - 33 + dy, w, 1, dy < 1 ? B[4] : dy > 3 ? B[1] : B[2]);
        }
        q(bx - 7, WGY - 34, 14, 2, B[3]); q(bx - 7, WGY - 34, 14, 1, B[4]);
        // a small steady flame
        q(bx - 5, WGY - 38, 10, 5, F[0]);
        q(bx - 4, WGY - 43, 8, 6, F[1]);
        q(bx - 2, WGY - 47, 5, 5, F[2]);
        q(bx - 1, WGY - 50, 2, 4, F[3]);
      }
    },

    /* ---- THE TEMPLE OF DAWN — a colonnade on a three-step stylobate under a
       carved pediment with the sun disc, roof tiles and antefixes. ---- */
    temple(q) {
      wShadow(q, 48, 84);
      const ST = AP.stone;
      // STYLOBATE — three broad steps
      for (let i = 0; i < 3; i++) {
        const w = 84 - i * 6, y = WGY - (i + 1) * 5;
        ashlarBlock(q, 48 - (w >> 1), y, w, 6, 41 + i * 5, ST);
        q(48 - (w >> 1), y, w, 1, ST[4]);
      }
      const floor = WGY - 15, capY = 30;
      // the CELLA wall behind the columns, in shadow
      q(20, capY + 6, 56, floor - capY - 6, ST[1]);
      q(42, floor - 22, 14, 22, AP.ink[0]);                  // the deep doorway
      q(42, floor - 22, 14, 2, ST[0]);
      q(44, floor - 8, 10, 8, AP.fire[0]);                   // lamplight within
      // SIX fluted columns with base and capital
      for (let i = 0; i < 6; i++) {
        const cx = 15 + i * 14;
        q(cx - 1, floor - 3, 10, 3, ST[3]);                  // base
        q(cx, capY + 8, 8, floor - capY - 11, ST[2]);
        q(cx, capY + 8, 2, floor - capY - 11, ST[4]);        // lit flute
        q(cx + 6, capY + 8, 2, floor - capY - 11, ST[1]);    // shaded flute
        for (const f of [3, 4]) q(cx + f, capY + 8, 1, floor - capY - 11, ST[1]);
        q(cx - 2, capY + 3, 12, 5, ST[3]);                   // capital
        q(cx - 2, capY + 3, 12, 1, ST[4]);
      }
      // ARCHITRAVE and frieze
      q(10, capY - 5, 76, 8, ST[2]); q(10, capY - 5, 76, 1, ST[4]); q(10, capY + 2, 76, 1, ST[0]);
      for (let i = 0; i < 12; i++) q(13 + i * 6, capY - 3, 3, 4, ST[1]);   // triglyphs
      // PEDIMENT — a raking cornice over a tympanum carrying the sun disc
      for (let i = 0; i <= 22; i++) {
        const w = 76 - i * 3.2 | 0;
        q(48 - (w >> 1), capY - 6 - i, w, 1, i > 19 ? ST[3] : ST[2]);
        q(48 - (w >> 1), capY - 6 - i, 2, 1, ST[4]);
        q(48 + (w >> 1) - 2, capY - 6 - i, 2, 1, ST[1]);
      }
      ART.shadedCircle(q, 48, capY - 15, 7, AP.gold, 2);
      for (let a = 0; a < 12; a++) {
        const ax = 48 + Math.round(Math.cos(a * 0.523) * 10), ay = capY - 15 + Math.round(Math.sin(a * 0.523) * 10);
        q(ax, ay, 2, 2, AP.gold[3]);
      }
      // roof edge + antefixes at the eaves
      q(8, capY - 8, 80, 3, ST[3]); q(8, capY - 8, 80, 1, ST[4]);
      for (const ax of [8, 86]) { q(ax - 1, capY - 12, 5, 5, ST[3]); q(ax - 1, capY - 12, 5, 1, ST[4]); }
    },

    /* ---- THE GREAT SPHINX — a crowned lion couchant in warm sandstone,
       forepaws thrown forward, nemes headdress striped and gold-banded. ---- */
    sphinx(q) {
      wShadow(q, 48, 86);
      const RK = AP.rock, SO = AP.soil, GD = AP.gold;
      // the ledge it is carved out of
      ashlarBlock(q, 8, WGY - 9, 80, 9, 63, AP.stone);
      const gy = WGY - 9;
      // BODY — a long couchant mass, haunch at the right, chest at the left
      q(26, gy - 30, 56, 30, RK[2]);
      q(26, gy - 30, 56, 3, RK[3]);
      q(26, gy - 6, 56, 6, RK[1]);
      q(64, gy - 34, 22, 34, RK[2]); q(64, gy - 34, 22, 3, RK[3]);   // the raised haunch
      ART.shadedCircle(q, 74, gy - 18, 10, RK, 2);                    // the thigh muscle
      q(84, gy - 26, 6, 20, RK[1]);                                   // the tail curling in
      q(84, gy - 8, 10, 4, RK[2]); q(88, gy - 12, 4, 6, RK[1]);
      // FOREPAWS thrown forward, toes cut in
      for (const py of [gy - 12, gy - 5]) {
        q(6, py, 30, 6, RK[2]); q(6, py, 30, 1, RK[3]); q(6, py + 5, 30, 1, RK[1]);
        for (let i = 0; i < 4; i++) q(8 + i * 6, py + 1, 1, 4, RK[1]);
      }
      // CHEST rising to the neck
      q(18, gy - 34, 22, 26, RK[2]); q(18, gy - 34, 22, 3, RK[3]);
      // the NEMES headdress — striped lappets falling either side of the face
      q(12, gy - 66, 40, 22, RK[3]);
      for (let i = 0; i < 9; i++) q(13 + i * 4, gy - 66, 2, 22, RK[1]);
      q(10, gy - 48, 12, 18, RK[2]); q(42, gy - 48, 12, 18, RK[2]);
      for (let i = 0; i < 4; i++) { q(11, gy - 46 + i * 4, 10, 2, RK[1]); q(43, gy - 46 + i * 4, 10, 2, RK[1]); }
      q(10, gy - 70, 44, 5, GD[1]); q(10, gy - 70, 44, 1, GD[2]);     // the gold brow band
      q(28, gy - 74, 8, 5, GD[2]); q(30, gy - 77, 4, 4, GD[3]);       // the uraeus rearing at the front
      // the FACE — broad, weathered, eyes and mouth cut deep
      q(18, gy - 62, 28, 26, RK[2]); q(18, gy - 62, 28, 2, RK[4]);
      q(21, gy - 54, 7, 4, AP.ink[0]); q(36, gy - 54, 7, 4, AP.ink[0]);
      q(21, gy - 56, 7, 2, RK[1]); q(36, gy - 56, 7, 2, RK[1]);
      q(29, gy - 54, 5, 11, RK[3]); q(28, gy - 44, 8, 2, RK[1]);      // the nose, chipped away
      q(25, gy - 40, 15, 3, RK[0]);                                    // mouth
      q(20, gy - 38, 24, 4, RK[1]);
      // wind-blown sand banked against the base
      for (let i = 0; i < 22; i++) {
        const r = ART.rng(300 + i);
        q(6 + ((r() * 84) | 0), WGY - 1 + ((r() * 3) | 0), 3, 1, r() < 0.5 ? SO[3] : SO[2]);
      }
    },

    /* ---- THE ETERNAL FLAME — a great bronze bowl on a tripod over a round
       stepped platform, two votive pillars flanking, the fire always lit. ---- */
    flame(q) {
      wShadow(q, 48, 72);
      const ST = AP.stone, B = BRONZE, F = AP.fire;
      // ROUND stepped platform, drawn as stacked ellipses
      for (let i = 0; i < 3; i++) {
        const rw = 38 - i * 6, y = WGY - 5 - i * 6;
        for (let dy = 0; dy < 7; dy++) {
          const t = dy / 6, w = Math.round(rw * (1 - t * 0.10));
          q(48 - w, y - 6 + dy, w * 2, 1, dy === 0 ? ST[4] : dy > 4 ? ST[1] : ST[2]);
        }
      }
      const py = WGY - 23;
      // votive pillars either side, carrying small lamps
      for (const px of [14, 82]) {
        q(px - 5, py - 30, 10, 32, ST[2]); q(px - 5, py - 30, 3, 32, ST[3]); q(px + 2, py - 30, 3, 32, ST[1]);
        q(px - 7, py - 35, 14, 5, ST[3]); q(px - 7, py - 35, 14, 1, ST[4]);
        q(px - 4, py - 39, 8, 4, B[2]); q(px - 4, py - 39, 8, 1, B[3]);
        q(px - 3, py - 43, 6, 4, F[1]); q(px - 2, py - 46, 4, 3, F[2]);
        for (let i = 0; i < 5; i++) q(px - 5, py - 26 + i * 6, 10, 1, ST[1]);
      }
      // the TRIPOD — three bronze legs with lion feet, meeting under the bowl
      for (const [lx, dir] of [[34, -1], [48, 0], [62, 1]]) {
        for (let i = 0; i < 22; i++)
          q(lx + Math.round(dir * i * 0.30), py - 22 + i, 4, 1, dir < 0 ? B[3] : dir > 0 ? B[1] : B[2]);
        q(lx + Math.round(dir * 6) - 2, py, 8, 4, B[2]); q(lx + Math.round(dir * 6) - 2, py, 8, 1, B[3]);
      }
      q(32, py - 26, 32, 5, B[2]); q(32, py - 26, 32, 1, B[4]);
      // the BOWL — a bronze basin, narrow enough that the FIRE is the hero;
      // rim catching the light, soot black inside
      for (let dy = 0; dy < 12; dy++) {
        const w = Math.round(21 - dy * 1.35);
        q(48 - w, py - 30 + dy, w * 2, 1, dy < 2 ? B[3] : dy > 8 ? B[1] : B[2]);
      }
      q(25, py - 32, 46, 3, B[3]); q(25, py - 32, 46, 1, B[4]);
      q(29, py - 29, 38, 3, AP.ink[0]);
      /* the FIRE — tongues, not a stack of slabs. Each is a tapering column of
         flame on its own centre and its own height; the hot core sits inside
         the cooler outer flames, so the blaze has depth instead of banding. */
      // the blaze is measured off the bowl's LIP and kept inside the plot —
      // a tongue taller than the canvas is simply cut off at the top
      const fb = py - 30;
      const tongue = (cx, h, w0, seed, hot) => {
        const r = ART.rng(seed);
        for (let i = 0; i < h; i++) {
          const t = i / h;
          let w = w0 * (1 - t * t) * (1 - t * 0.2);
          w = Math.max(1, Math.round(w - (r() < 0.35 ? 1 : 0)));
          const off = Math.round(Math.sin(i * 0.34 + seed) * (0.8 + t * 1.1));   // it writhes as it climbs
          const col = F[t < 0.22 ? 0 : t < 0.55 ? 1 : t < 0.84 ? 2 : 3];
          q(cx + off - w, fb - i, w * 2, 1, hot && t > 0.3 && t < 0.8 ? F[2] : col);
        }
      };
      // outer flames first, hot core last, with air between them
      tongue(32, 13, 5, 1); tongue(64, 12, 5, 5);
      tongue(39, 21, 5, 2); tongue(57, 19, 4, 4);
      tongue(48, 28, 7, 3, true);
      q(30, fb - 3, 36, 4, F[0]); q(34, fb - 6, 28, 3, F[1]);  // the ember bed inside the bowl
      for (let i = 0; i < 16; i++) {                           // sparks riding the heat
        const r = ART.rng(400 + i * 3);
        q(34 + ((r() * 30) | 0), fb - 40 + ((r() * 18) | 0), 2, 2, r() < 0.5 ? F[2] : F[3]);
      }
    },

    /* ---- THE ANCESTOR TOTEMS — three carved cedar poles of different
       heights on a log platform, each a stack of faces, wings and beaks in
       the clan's paints, a fire pit smouldering between them. ---- */
    totems(q) {
      wShadow(q, 48, 78);
      const W = AP.wood, TL = AP.teal, RD = AP.red, GD = AP.gold, BO = AP.bone;
      // a low platform of split logs
      for (let i = 0; i < 6; i++) {
        q(8, WGY - 10 + i * 2, 80, 2, i & 1 ? W[1] : W[2]);
        q(8, WGY - 10 + i * 2, 80, 1, W[3]);
      }
      q(8, WGY - 10, 80, 1, W[3]);
      const pole = (cx, top, w, seed) => {
        const bot = WGY - 10, r = ART.rng(seed);
        q(cx - (w >> 1), top, w, bot - top, W[2]);
        q(cx - (w >> 1), top, 3, bot - top, W[3]);
        q(cx + (w >> 1) - 3, top, 3, bot - top, W[1]);
        q(cx - (w >> 1), top, w, 2, W[4]);
        // a stack of carved faces down the pole
        let y = top + 4;
        let i = 0;
        while (y < bot - 12) {
          const h = 15 + ((r() * 5) | 0);
          const col = [TL[1], RD[2], GD[2], BO[1]][i % 4];
          q(cx - (w >> 1) + 1, y, w - 2, 1, AP.ink[0]);                // the seam between carvings
          q(cx - (w >> 1) + 2, y + 3, w - 4, 5, col);                  // painted brow band
          q(cx - (w >> 1) + 4, y + 5, 4, 4, AP.ink[0]);                // eyes, deep-set
          q(cx + (w >> 1) - 8, y + 5, 4, 4, AP.ink[0]);
          q(cx - 3, y + 8, 6, 6, W[1]);                                 // the beak/snout jutting out
          q(cx - 5, y + 12, 10, 2, AP.ink[0]);                          // the mouth
          q(cx - (w >> 1) + 2, y + h - 4, w - 4, 3, i % 2 ? RD[1] : TL[0]);
          y += h; i++;
        }
        // outstretched wings at the crown
        q(cx - (w >> 1) - 9, top + 3, 9, 4, W[1]); q(cx + (w >> 1), top + 3, 9, 4, W[1]);
        q(cx - (w >> 1) - 9, top + 3, 9, 1, W[3]); q(cx + (w >> 1), top + 3, 9, 1, W[3]);
        q(cx - (w >> 1) - 12, top + 6, 12, 3, i % 2 ? TL[1] : RD[2]);
        q(cx + (w >> 1), top + 6, 12, 3, TL[1]);
      };
      pole(22, 26, 14, 13);
      pole(48, 8, 16, 29);
      pole(74, 30, 13, 47);
      // the fire pit smouldering between the poles
      q(38, WGY - 6, 20, 5, AP.stone[1]);
      for (let i = 0; i < 7; i++) q(38 + i * 3, WGY - 7, 2, 2, AP.stone[2]);
      q(42, WGY - 9, 12, 3, AP.fire[0]); q(44, WGY - 12, 8, 4, AP.fire[1]);
      q(46, WGY - 15, 4, 4, AP.fire[2]);
    },

    /* ---- THE GREAT SUNDIAL — a vast graven disc laid tilted to the sky, a
       triangular gnomon throwing its shadow across the marks, a ring of hour
       stones set round it. ---- */
    sundial(q) {
      wShadow(q, 48, 80);
      const ST = AP.stone, RK = AP.rock, GD = AP.gold;
      // the hour stones set in a ring around the dial
      for (let a = 0; a < 12; a++) {
        const t = a * 0.5236;
        const hx = 48 + Math.round(Math.cos(t) * 42), hy = 56 + Math.round(Math.sin(t) * 25);
        if (hy < 30) continue;                                 // the back of the ring is hidden by the dial
        menhir(q, hx - 2, hy - 9, 5, 10, 500 + a, 0);
      }
      // the ROUND PLINTH the disc rests on
      for (let dy = 0; dy < 12; dy++) {
        const w = Math.round(36 - dy * 0.4);
        q(48 - w, WGY - 12 + dy, w * 2, 1, dy < 2 ? ST[3] : dy > 8 ? ST[0] : ST[1]);
      }
      /* the DISC — a great circle laid back toward the sky, so it is drawn as
         an ellipse. The face is deliberately DARK stone: every mark on it is
         cut bright, which is the only way an engraved dial reads at this size
         (a pale disc with pale marks is a grey plate). */
      const cyD = 54, rx = 42, ry = 21;
      for (let dy = -ry; dy <= ry; dy++) {
        const t = dy / ry, w = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
        q(48 - w, cyD + dy, w * 2, 1, dy < -14 ? ST[2] : dy > 15 ? ST[0] : ST[1]);
      }
      // the rim: a raised gilded band all the way round the face
      for (let a = 0; a < 128; a++) {
        const t = a * 0.0491;
        q(48 + Math.round(Math.cos(t) * rx), cyD + Math.round(Math.sin(t) * ry), 2, 2,
          Math.sin(t) < -0.2 ? GD[2] : GD[1]);
      }
      // the hour lines cut into the face, every sixth one gilded and doubled
      for (let a = 0; a < 24; a++) {
        const t = a * 0.2618, c1 = Math.cos(t), s1 = Math.sin(t);
        const major = a % 6 === 0;
        for (let r = major ? 12 : 26; r < 40; r++) {
          const ex = 48 + Math.round(c1 * r), ey = cyD + Math.round(s1 * r * (ry / rx));
          q(ex, ey, major ? 2 : 1, major ? 2 : 1, major ? GD[2] : ST[3]);
        }
      }
      /* the GNOMON — a right-triangular blade standing on the meridian, thin
         enough that the dial it reads stays the subject. Its raking
         hypotenuse takes the sun; the shaded face falls away east. */
      const gH = 38;
      for (let i = 0; i < gH; i++) {
        const y = cyD - 2 - i, t = i / gH;
        const w = Math.max(1, Math.round((gH - i) * 0.34));
        q(48, y, 2, 1, RK[2]); q(48, y, 1, 1, RK[4]);           // the blade seen edge-on
        q(50, y, w, 1, RK[1]);                                   // the shaded face of the wedge
        q(49 + w, y, 2, 1, RK[3]);
        if (t < 0.06) q(46, y, 4, 1, RK[1]);
      }
      q(40, cyD - 3, 18, 5, RK[2]); q(40, cyD - 3, 18, 1, RK[4]); q(40, cyD + 1, 18, 1, RK[0]);
      // the SHADOW the blade throws WEST across the face — the whole point of
      // the thing, and it must be laid over the marks, not under the blade
      for (let r = 5; r < 39; r++) {
        const ex = 48 - Math.round(Math.cos(0.34) * r), ey = cyD + Math.round(Math.sin(0.34) * r * (ry / rx));
        q(ex, ey, 3, 2, 'rgba(14,11,8,0.60)');
      }
    },
  };

  /* Build all ten. `Sprites.wonders[key]` holds the artwork; the run's chosen
     one is copied into `Sprites.building.wonder` by Sprites.useWonder (called
     from G.setWonder), so every existing code path — the menu icon, the panel
     thumbnail, R.bldSprite, the burn variants, the ash silhouette — finds it
     exactly where it finds every other building's art, with no special case. */
  Sprites.wonders = {};
  for (const key of Object.keys(W_DRAW)) Sprites.wonders[key] = ART.outline(tileW(p => W_DRAW[key](p)), 2);
  Sprites.useWonder = function (key) {
    const c = Sprites.wonders[key] || Sprites.wonders.henge;
    Sprites.building.wonder = [c];
    Sprites.buildingA.wonder = [c];   // stone is stone — the rival's monument is the same monument
    return c;
  };
  Sprites.useWonder('henge');

  /* The GREAT WORKS going up (tests/wonder.mjs). Two shared stages — every
     wonder is raised the same way, by the same masons — and then stage three
     is the monument's OWN art under a scaffold (render.js), so the last third
     of a very long build is when the valley finally sees what it is getting. */
  Sprites.misc.wonderBuild1 = ART.outline(tileW(p => {
    const q = p, W = AP.wood, ST = AP.stone, SO = AP.soil, r = ART.rng(19);
    wShadow(q, 48, 80);
    // the ground broken: a great dug pad, spoil heaps, staked-out string lines
    q(6, WGY - 16, 84, 17, SO[2]); q(6, WGY - 16, 84, 2, SO[3]); q(6, WGY - 1, 84, 2, SO[1]);
    for (let i = 0; i < 60; i++) q(8 + ((r() * 80) | 0), WGY - 14 + ((r() * 14) | 0), 2, 1, r() < 0.5 ? SO[1] : SO[3]);
    for (let i = 0; i < 9; i++) {                                  // surveyors' stakes and string
      const sx = 10 + i * 10;
      q(sx, WGY - 30, 2, 15, W[1]); q(sx, WGY - 30, 2, 1, W[3]);
    }
    q(10, WGY - 29, 72, 1, AP.bone[1]);
    q(10, WGY - 22, 72, 1, AP.bone[1]);
    for (const hx of [16, 76]) {                                    // spoil heaps either side
      for (let i = 0; i < 9; i++) q(hx - 12 + i, WGY - 20 - i, 26 - i * 2, 2, i & 1 ? SO[1] : SO[2]);
      for (let i = 0; i < 10; i++) { const r = ART.rng(hx + i); q(hx - 10 + ((r() * 20) | 0), WGY - 26 + ((r() * 8) | 0), 2, 1, SO[3]); }
    }
    // the first course of dressed blocks, laid true along the front
    for (let i = 0; i < 9; i++) ashlarBlock(q, 16 + i * 7, WGY - 24, 7, 8, 60 + i, ST);
    // a QUARRY SLED with a great block on it, rollers under, ropes out ahead
    for (let i = 0; i < 6; i++) { q(50 + i * 6, WGY - 8, 4, 3, W[2]); q(50 + i * 6, WGY - 8, 4, 1, W[3]); }
    q(48, WGY - 12, 40, 4, W[1]); q(48, WGY - 12, 40, 1, W[3]);
    ashlarBlock(q, 56, WGY - 22, 22, 10, 91, ST);
    for (let i = 0; i < 3; i++) q(20, WGY - 15 + i * 3, 30, 1, AP.thatch[1]);   // the haul ropes
    // the masons' shelter and the lifting shears standing over the first course
    q(6, WGY - 34, 22, 4, W[2]); q(6, WGY - 34, 22, 1, W[3]);
    ART.thatchTexture(q, 6, WGY - 42, 22, 8, 9);
    q(7, WGY - 30, 3, 8, W[1]); q(24, WGY - 30, 3, 8, W[1]);
    q(60, WGY - 56, 3, 34, W[1]); q(74, WGY - 56, 3, 34, W[1]);
    q(58, WGY - 58, 21, 3, W[2]); q(58, WGY - 58, 21, 1, W[3]);
    q(67, WGY - 55, 1, 18, AP.thatch[1]);
    ashlarBlock(q, 62, WGY - 37, 12, 7, 44, ST);
  }), 2);

  Sprites.misc.wonderBuild2 = ART.outline(tileW(p => {
    const q = p, W = AP.wood, ST = AP.stone, SO = AP.soil, TH = AP.thatch, r = ART.rng(23);
    wShadow(q, 48, 84);
    q(6, WGY - 12, 84, 13, SO[2]); q(6, WGY - 12, 84, 2, SO[3]);
    // a broad plinth of coursed stone rising, stepped down where work stopped
    for (let i = 0; i < 4; i++) {
      const w = 78 - i * 8, y = WGY - 12 - (i + 1) * 8;
      const cut = i >= 2 ? 18 : 0;                                  // the right end still unbuilt
      ashlarBlock(q, 48 - (w >> 1), y, w - cut, 9, 70 + i * 7, ST);
    }
    // the SCAFFOLD around the works — standards, ledgers, putlogs, lashings
    for (const sx of [8, 24, 68, 86]) {
      q(sx, 12, 3, WGY - 12, W[1]); q(sx, 12, 1, WGY - 12, W[3]);
    }
    for (const sy of [20, 36, 52, 68]) {
      q(8, sy, 81, 2, W[2]); q(8, sy, 81, 1, W[3]);
      for (const lx of [8, 24, 68, 86]) { q(lx - 1, sy - 1, 5, 1, TH[1]); q(lx - 1, sy + 2, 5, 1, TH[1]); }
    }
    for (let i = 0; i < 6; i++) q(26, 22 + i * 8, 42, 1, W[1]);     // putlogs across the face
    // planked working platforms with blocks and tools on them
    for (const [px, py, pw] of [[10, 34, 26], [58, 50, 30], [26, 18, 24]]) {
      ART.woodPlankTexture(q, px, py - 3, pw, 3, 7);
      ashlarBlock(q, px + 4, py - 9, 10, 6, 33, ST);
    }
    // the great LEWIS CRANE — a treadwheel hoist swinging a block over the works
    q(74, 4, 4, 44, W[1]); q(74, 4, 2, 44, W[3]);
    q(40, 4, 38, 3, W[2]); q(40, 4, 38, 1, W[3]);
    for (let i = 0; i < 5; i++) q(72 + i, 8 + i * 2, 2, 2, W[0]);   // the brace
    ART.shadedCircle(q, 82, 20, 9, AP.wood, 2);                     // the tread wheel
    for (let a = 0; a < 8; a++) q(82 + Math.round(Math.cos(a * 0.785) * 6), 20 + Math.round(Math.sin(a * 0.785) * 6), 2, 2, W[1]);
    q(44, 6, 1, 22, TH[1]);                                          // the fall rope
    ashlarBlock(q, 38, 28, 14, 9, 55, ST);                           // the block swinging on it
    // masons' clutter at the foot: mortar tub, chisels, a barrow, chips
    q(12, WGY - 6, 12, 5, W[1]); q(12, WGY - 6, 12, 1, W[3]); q(14, WGY - 5, 8, 2, AP.bone[1]);
    q(30, WGY - 5, 10, 4, W[2]); q(30, WGY - 8, 3, 4, W[1]);
    for (let i = 0; i < 26; i++) q(10 + ((r() * 76) | 0), WGY - 4 + ((r() * 5) | 0), 2, 1, r() < 0.5 ? ST[3] : ST[1]);
  }), 2);

  // the scaffold the finished-looking monument wears through its last third —
  // open in the middle so the wonder itself is what the eye lands on
  Sprites.misc.wonderScaffold = tileW(p => {
    const q = p, W = AP.wood, TH = AP.thatch;
    for (const sx of [6, 20, 72, 86]) {
      q(sx, 8, 3, WGY - 6, W[1]); q(sx, 8, 1, WGY - 6, W[3]);
    }
    for (const sy of [16, 34, 52, 70]) {
      q(6, sy, 83, 2, W[2]); q(6, sy, 83, 1, W[3]);
      for (const lx of [6, 20, 72, 86]) { q(lx - 1, sy - 1, 5, 1, TH[1]); q(lx - 1, sy + 2, 5, 1, TH[1]); }
    }
    for (const [px, py, pw] of [[4, 34, 20], [70, 52, 22]]) ART.woodPlankTexture(q, px, py - 3, pw, 3, 11);
    q(78, 2, 4, 30, W[1]); q(50, 2, 32, 3, W[2]); q(54, 4, 1, 16, TH[1]);   // the crane still standing over it
  });

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

  /* ---- WORK-SITE STAGES (tests/build-stages.mjs) — a site now moves through
     THREE looks at exact 1/3 intervals of its build time, then the finished
     building appears:
       stage 1  GROUND BROKEN  — misc.construction1 / constructionBig1 (below)
       stage 2  THE RAISING    — the classic work-site art above
       stage 3  IN SCAFFOLD    — the target building's own sprite with the
                misc.scaffold / scaffoldBig overlay drawn over it (render.js)
     Upgrades reuse the same three under their OWN labels (further below), so
     upgrade art can diverge per level later without touching the plumbing. */

  // STAGE 1 — GROUND BROKEN: the plot staked and strung, the pad half dug,
  // the first deliveries just arriving. Deliberately sparse next to stage 2.
  Sprites.misc.construction1 = ART.outline(tileB(p => {
    const W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    ART.dropShadow(p, 8, 14, 13);
    // the half-dug pad — a lit lip, a shaded far edge, turned clods
    p(2, 9, 12, 6, SO[2]); p(2, 9, 12, 1, SO[3]); p(2, 14, 12, 1, SO[1]);
    const rr = ART.rng(97);
    for (let i = 0; i < 10; i++) p.hi(6 + (rr() * 20) | 0, 20 + (rr() * 8) | 0, 1, 1, i % 2 ? SO[3] : SO[0]);
    // corner stakes and the mason's taut string line
    for (const [sx, sy] of [[2, 8], [13, 8], [2, 13], [13, 13]]) { p(sx, sy - 2, 1, 3, W[2]); p(sx, sy - 2, 1, 1, W[3]); }
    p.hi(5, 13, 22, 1, TH[1]);
    p.hi(5, 23, 22, 1, TH[1]);
    // spoil heap, a small log pile, first dressed stones, a stuck shovel
    p(0, 11, 2, 2, SO[1]); p(0, 11, 2, 1, SO[3]);
    p(14, 10, 2, 1, W[3]); p(14, 11, 2, 1, W[2]);
    p(14, 13, 1, 1, ST[2]); p(15, 13, 1, 1, ST[1]);
    p(6, 10, 1, 3, W[2]); p(6, 9, 1, 1, ST[3]);
  }), 1);

  // STAGE 1, 2×2 — the Town Center's plot broken: a broad dug pad, staked and
  // strung, with the first stock of timber, stone and spoil around it
  Sprites.misc.constructionBig1 = ART.outline(tileB(p => {
    const q = p.hi, W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    const rr = ART.rng(83);
    q(6, 27, 21, 2, ART.STYLE.SHADOW);
    q(4, 19, 24, 9, SO[2]); q(4, 19, 24, 1, SO[3]); q(4, 27, 24, 1, SO[1]);
    for (let i = 0; i < 14; i++) q(5 + (rr() * 21) | 0, 20 + (rr() * 7) | 0, 1, 1, i % 2 ? SO[3] : SO[0]);
    for (const [sx, sy] of [[4, 18], [27, 18], [4, 26], [27, 26]]) { q(sx, sy - 3, 1, 4, W[2]); q(sx, sy - 3, 1, 1, W[3]); }
    q(5, 19, 22, 1, TH[1]); q(5, 26, 22, 1, TH[1]);   // string lines
    // first deliveries: a log stack, dressed stone, the spoil heap, a barrow
    q(0, 22, 4, 1, W[3]); q(0, 23, 4, 1, W[2]); q(0, 24, 4, 1, W[3]);
    q(0, 22, 1, 3, TH[2]);
    ART.shadedRect(q, 27, 22, 4, 3, ST, 2); q(27, 22, 4, 1, ST[3]);
    q(12, 15, 6, 3, SO[1]); q(12, 15, 6, 1, SO[3]);
    q(19, 24, 4, 1, W[2]); q(20, 25, 1, 1, W[0]); q(22, 22, 1, 2, W[3]);
  }, 128), 2);

  // STAGE 3 OVERLAY — a sparse scaffold drawn OVER the finished sprite, so
  // the building reads "up, but still wrapped in the works"
  Sprites.misc.scaffold = ART.outline(tileB(p => {
    const W = AP.wood, TH = AP.thatch;
    p(1, 2, 1, 12, W[2]); p(1, 2, 1, 1, W[3]);
    p(14, 2, 1, 12, W[2]);
    p(1, 4, 14, 1, W[3]);
    p(1, 9, 14, 1, W[2]);
    p(12, 6, 1, 8, W[3]); p(14, 6, 1, 8, W[3]);
    for (let y = 7; y < 13; y += 2) p(12, y, 3, 1, W[1]);
    for (const [lx, ly] of [[1, 4], [14, 4], [1, 9], [14, 9]]) { p.hi(lx * 2, ly * 2, 1, 1, TH[1]); p.hi(lx * 2 + 1, ly * 2 + 1, 1, 1, TH[3]); }
  }), 1);

  Sprites.misc.scaffoldBig = ART.outline(tileB(p => {
    const q = p.hi, W = AP.wood, TH = AP.thatch;
    for (const px of [1, 30]) { q(px, 4, 1, 22, W[2]); q(px, 4, 1, 1, W[3]); }
    q(1, 7, 30, 1, W[3]); q(1, 17, 30, 1, W[2]);
    q(25, 10, 1, 16, W[3]); q(28, 10, 1, 16, W[3]);
    for (let y = 12; y < 25; y += 3) q(25, y, 4, 1, W[1]);
    for (const [lx, ly] of [[1, 7], [30, 7], [1, 17], [30, 17]]) { q(lx, ly, 1, 1, TH[1]); q(lx, ly + 1, 1, 1, TH[3]); }
  }, 128), 2);

  /* UPGRADE work-site stages — the SAME three looks for now, but under their
     own labels so upgrade art can diverge per level later without touching
     the render plumbing (tests/build-stages.mjs pins the aliasing). */
  Sprites.misc.upgrade1 = Sprites.misc.construction1;
  Sprites.misc.upgrade2 = Sprites.misc.construction;
  Sprites.misc.upgradeScaffold = Sprites.misc.scaffold;
  Sprites.misc.upgradeBig1 = Sprites.misc.constructionBig1;
  Sprites.misc.upgradeBig2 = Sprites.misc.constructionBig;
  Sprites.misc.upgradeBig2_3 = Sprites.misc.constructionBig3;
  Sprites.misc.upgradeScaffoldBig = Sprites.misc.scaffoldBig;

  /* ---- WATCHTOWER — bespoke stage art (tests/build-stages.mjs) ----
     The first building with its OWN three-sprite raising, replacing the
     generic work-site looks for b.key === 'tower' in render.js. Grounded in
     how a real medieval tower went up: a foundation pit dug to firm ground
     and a battered plinth laid first; the shaft rising in coursed masonry
     with dressed corner quoins, wrapped in a PUTLOG scaffold (horizontal
     beams socketed into putlog holes left in the wall, carrying plank lifts,
     raised with the wall as work climbed); stone hoisted by rope windlass;
     and the crown — lookout platform, railing, crenellation — fitted LAST at
     the wall-head. Authored at 128px on a 64-cell fine grid (`h`, 2px/cell)
     — DOUBLE the pixel density of the finished tower's 32-grid — so the
     tall, skinny silhouette (shaft x22..41, matching the finished sprite
     doubled) carries real masonry and carpentry detail. */
  const fine128 = (draw) => ART.outline(tileB(p => {
    const h = (x, y, w, ht, col) => { p.g.fillStyle = col; p.g.fillRect(x * 2, y * 2, (w || 1) * 2, (ht || 1) * 2); };
    // raw canvas-pixel plotter (coords 0..127) for TRUE 1px cordage — string
    // lines, plumb lines and hoist ropes stay hair-thin instead of being
    // fattened into bars by the grid cell + outline pass
    h.f = (x, y, w, ht, col) => { p.g.fillStyle = col; p.g.fillRect(x, y, (w || 1), (ht || 1)); };
    draw(h, p);
  }, 128), 2);

  // STAGE 1 — THE FOOTING: the plot staked and strung, the foundation pit dug
  // to firm ground, and the first battered plinth course going in — dressed
  // blocks laid on a mortar bed, stopping mid-course where the masons are.
  // A plumb-line tripod, the mortar tub, and the first deliveries wait.
  Sprites.misc.towerBuild1 = fine128((h) => {
    const W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    const rr = ART.rng(211);
    h(16, 52, 34, 3, ART.STYLE.SHADOW); h(22, 55, 22, 2, ART.STYLE.SHADOW);
    // the stripped plot — turned earth, its edge broken by spilled clods so it
    // reads as ground works, not a panel
    h(18, 38, 28, 16, SO[2]); h(18, 38, 28, 1, SO[3]); h(18, 53, 28, 1, SO[1]);
    for (let i = 0; i < 14; i++) {
      const ex = rr() < 0.5, ey = (rr() * 14) | 0;                   // clods spilling over both edges
      h(ex ? 17 - ((rr() * 2) | 0) : 46 + ((rr() * 2) | 0), 39 + ey, 1, 1, rr() < 0.5 ? SO[2] : SO[3]);
    }
    for (let i = 0; i < 16; i++) h(20 + (rr() * 24) | 0, 40 + (rr() * 12) | 0, 1, 1, i % 2 ? SO[3] : SO[0]);
    // the FOUNDATION TRENCH dug deeper along the tower's square perimeter —
    // a dark ring down to firm ground, the undug core left standing
    h(22, 41, 20, 3, SO[1]); h(22, 48, 20, 3, SO[1]);
    h(22, 41, 3, 10, SO[1]); h(39, 41, 3, 10, SO[1]);
    h(22, 41, 20, 1, SO[0]); h(22, 50, 20, 1, SO[0]);
    h(22, 41, 1, 10, SO[0]); h(41, 42, 1, 9, SO[0]);                 // trench shadow walls
    // corner stakes + the mason's taut string squaring the plot — the string
    // is TRUE 1px cord, drawn over the pit so it stays hair-thin
    for (const [sx, sy] of [[17, 37], [46, 37], [17, 53], [46, 53]]) { h(sx, sy - 6, 1, 7, W[2]); h(sx, sy - 6, 1, 1, W[3]); }
    h.f(36, 77, 56, 1, TH[3]); h.f(36, 104, 56, 1, TH[3]);
    h.f(37, 78, 1, 26, TH[3]); h.f(91, 78, 1, 26, TH[3]);
    // the first PLINTH course going into the trench — dressed blocks laid on
    // a mortar screed along the back run, stopping where the masons stand
    h(22, 41, 18, 1, ST[1]);                                         // mortar screed in the trench
    for (let i = 0; i < 4; i++) {
      const bx = 22 + i * 4;
      h(bx, 41, 4, 3, ST[2]); h(bx, 41, 4, 1, ST[4]);                // laid blocks, lit beds
      h(bx, 41, 1, 3, ST[3]); h(bx + 3, 42, 1, 2, ST[0]);            // dressed face + joint shadow
    }
    h(22, 44, 3, 3, ST[2]); h(22, 44, 3, 1, ST[4]); h(22, 44, 1, 3, ST[3]);   // the corner turned down the left run
    h(38, 42, 4, 1, ST[1]);                                          // mortar spread for the next block
    h(40, 45, 4, 3, ST[2]); h(40, 45, 4, 1, ST[3]);                  // that block, waiting askew in the pit
    // plumb-line tripod standing over the trench corner (the mason's level)
    h(30, 45, 1, 8, W[2]); h(34, 45, 1, 8, W[2]); h(30, 44, 5, 1, W[3]);
    h.f(65, 90, 1, 13, TH[3]); h(32, 51, 1, 1, ST[3]);               // hair-thin line + bob
    // deliveries: rough stone (left), scaffold timber, the mortar tub, spoil,
    // a stuck shovel and a hand barrow
    ART.shadedRect(h, 6, 46, 7, 5, ST, 2); h(6, 46, 7, 1, ST[3]); h(8, 48, 1, 1, ST[0]); h(11, 49, 1, 1, ST[0]);
    h(4, 40, 10, 1, W[3]); h(4, 41, 10, 1, W[2]); h(4, 42, 10, 1, W[3]);   // timber for the putlog scaffold
    h(5, 40, 1, 3, TH[2]); h(12, 40, 1, 3, TH[2]);                   // ring-ends
    h(50, 46, 8, 4, W[1]); h(50, 46, 8, 1, W[2]); h(51, 47, 6, 2, ST[1]);  // mortar tub, mixed grey
    h(48, 38, 6, 4, SO[1]); h(48, 38, 6, 1, SO[3]);                  // spoil heap out of the pit
    h(50, 34, 1, 5, W[2]); h(50, 33, 2, 1, ST[3]);                   // shovel stuck in the spoil
    h(52, 54, 8, 1, W[2]); h(53, 55, 1, 2, W[0]); h(58, 52, 1, 3, W[3]); h(51, 55, 2, 2, W[1]);  // barrow
    for (let i = 0; i < 12; i++) h(14 + (rr() * 36) | 0, 55 + (rr() * 5) | 0, 1, 1, i % 2 ? ST[3] : SO[3]);
  });

  // STAGE 2 — THE SHAFT RISES: half height over the battered plinth, the top
  // course stepped where the hands stand. A putlog scaffold socketed into the
  // wall carries two plank lifts; a rope windlass at the wall-head raises the
  // next load; the doorway is formed under a timber lintel. Two material
  // stories: the FIRST RAISING (stone=false) climbs in wattle-and-daub over
  // staked corner posts — the finished level-1 tower's own walls — while the
  // UPGRADE art (stone=true, towerUp2) climbs in coursed masonry with dressed
  // quoins, the stone tiers the works are lifting the tower to.
  const towerStage2 = (stone) => fine128((h) => {
    const W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    const rr = ART.rng(223);
    h(16, 52, 34, 3, ART.STYLE.SHADOW); h(22, 55, 22, 2, ART.STYLE.SHADOW);
    // battered plinth — two stepped courses wider than the shaft (the stone
    // footing every tier of the tower stands on)
    ART.stoneTexture(h, 20, 46, 24, 6, 141); h(20, 46, 24, 1, ST[4]);
    h(21, 44, 22, 2, ST[2]); h(21, 44, 22, 1, ST[3]);
    if (stone) {
      // the shaft to half height — coursed masonry, quoins up both corners
      ART.stoneTexture(h, 22, 28, 20, 16, 143);
      for (let i = 0; i < 16; i += 2) {
        h(22, 28 + i, 2, 2, (i & 2) ? ST[4] : ST[3]);                // lit left quoins
        h(40, 28 + i, 2, 2, (i & 2) ? ST[1] : ST[0]);                // shaded right quoins
      }
      // the top course stepped and unfinished, fresh mortar beds lit on top
      h(22, 28, 20, 1, ST[1]);
      h(24, 26, 5, 2, ST[2]); h(24, 26, 5, 1, ST[4]);
      h(31, 25, 6, 3, ST[2]); h(31, 25, 6, 1, ST[4]); h(33, 26, 1, 2, ST[0]);
      h(38, 27, 3, 1, ST[3]);
    } else {
      // the shaft to half height — wattle-and-daub packed between staked
      // corner posts, the top edge ragged where the daubing stands
      ART.wattleTexture(h, 22, 28, 20, 16, 143);
      h(22, 28, 1, 18, W[2]); h(22, 28, 1, 1, W[3]);                 // corner posts, proud of the wall
      h(41, 28, 1, 18, W[1]);
      h(23, 28, 18, 1, SO[1]);                                        // raw daub edge
      h(25, 26, 4, 2, SO[2]); h(25, 26, 4, 1, SO[3]);                // fresh daub climbing
      h(32, 25, 5, 3, SO[2]); h(32, 25, 5, 1, SO[3]); h(34, 26, 1, 2, SO[0]);
      h(38, 27, 3, 1, SO[3]);
    }
    // PUTLOG HOLES — dark sockets left in the wall as the scaffold climbed
    for (const px of [25, 30, 35]) { h(px, 34, 1, 1, AP.ink[0]); h(px + 2, 41, 1, 1, AP.ink[0]); }
    // the putlog scaffold: beams socketed INTO the wall carry plank lifts,
    // lashed to outside standards; a ladder links the lifts
    for (const px of [16, 47]) { h(px, 22, 1, 30, W[2]); h(px, 22, 1, 1, W[3]); }
    h(15, 33, 8, 1, W[1]); h(41, 33, 8, 1, W[1]);                    // upper putlogs, wall → standard
    h(15, 41, 8, 1, W[1]); h(41, 41, 8, 1, W[1]);                    // lower putlogs
    h(13, 32, 9, 1, W[3]); h(42, 32, 9, 1, W[3]);                    // upper plank lifts
    h(13, 40, 9, 1, W[3]); h(42, 40, 9, 1, W[3]);                    // lower plank lifts
    for (let x = 14; x < 21; x += 2) h(x, 32, 1, 1, W[1]);
    for (let x = 43; x < 50; x += 2) h(x, 40, 1, 1, W[1]);           // plank grain
    for (const [lx, ly] of [[16, 33], [47, 33], [16, 41], [47, 41]]) { h(lx, ly - 1, 1, 1, TH[1]); h(lx, ly, 1, 1, TH[3]); }
    h(50, 36, 1, 16, W[1]); h(53, 36, 1, 16, W[1]);
    for (let r = 0; r < 7; r++) h(50, 37 + r * 2, 4, 1, W[2]);       // ladder to the lower lift
    // rope WINDLASS at the wall-head raising the next load — a dressed block
    // for the masons, a bound wattle hurdle for the daubers
    h(31, 19, 1, 7, W[1]); h(38, 19, 1, 7, W[1]); h(30, 18, 10, 1, W[3]);
    h(32, 20, 6, 2, W[2]); h(32, 20, 6, 1, W[3]); h(38, 21, 2, 1, ST[3]);   // drum + crank
    h.f(69, 44, 1, 28, TH[1]);                                       // the fall of the rope, 1px
    if (stone) { ART.shadedRect(h, 32, 36, 5, 4, ST, 3); h(32, 36, 5, 1, ST[4]); }
    else {
      h(32, 36, 5, 4, W[2]); h(32, 36, 5, 1, W[3]);                  // the hurdle in its sling
      h(33, 37, 1, 3, W[1]); h(35, 37, 1, 3, W[1]);                  // withies
    }
    h.f(64, 75, 10, 1, TH[1]); h.f(69, 72, 1, 8, TH[1]);             // sling cords
    // the doorway formed under a timber lintel, jambs boarded
    h(27, 38, 10, 2, W[3]);
    h(29, 40, 6, 11, AP.ink[0]); h(28, 40, 1, 11, W[2]); h(35, 40, 1, 11, W[2]);
    // ground: the material stock, the mortar/daub tub, chips off the bankers
    if (stone) { ART.shadedRect(h, 6, 47, 7, 4, ST, 2); h(6, 47, 7, 1, ST[3]); h(9, 49, 1, 1, ST[0]); }
    else {
      h(6, 47, 8, 1, W[3]); h(6, 48, 8, 1, W[2]); h(6, 49, 8, 1, W[3]); h(6, 50, 8, 1, W[2]);  // stacked hurdles
      h(7, 47, 1, 4, TH[2]); h(12, 47, 1, 4, TH[2]);
    }
    h(8, 52, 7, 3, W[1]); h(8, 52, 7, 1, W[2]); h(9, 53, 5, 1, stone ? ST[1] : SO[2]);  // the tub, mixed
    h(56, 50, 6, 1, W[3]); h(56, 51, 6, 1, W[2]);                    // spare putlog timber
    for (let i = 0; i < 14; i++) h(12 + (rr() * 40) | 0, 54 + (rr() * 6) | 0, 1, 1, i % 2 ? (stone ? ST[3] : SO[3]) : (stone ? ST[1] : SO[1]));
  });
  Sprites.misc.towerBuild2 = towerStage2(false);

  // STAGE 3 — THE CROWN: the shaft at full height (the finished tower's own
  // silhouette), arrow slits cut, the lower putlog rows already patched. The
  // work is all at the wall-head now: the overhanging lookout platform half
  // planked on its joists, the first railing up, a gin-pole hoist swinging
  // the next planks, a top lift on tall standards — the struck scaffold
  // stacked on the ground below. Same two material stories as stage 2.
  const towerStage3 = (stone) => fine128((h) => {
    const W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    const rr = ART.rng(227);
    h(12, 54, 42, 3, ART.STYLE.SHADOW); h(22, 57, 24, 2, ART.STYLE.SHADOW);
    // full-height shaft on its battered stone plinth
    ART.stoneTexture(h, 20, 48, 24, 4, 151); h(20, 48, 24, 1, ST[4]);
    if (stone) {
      ART.stoneTexture(h, 22, 18, 20, 30, 153);
      for (let i = 0; i < 30; i += 2) {
        h(22, 18 + i, 2, 2, (i & 2) ? ST[4] : ST[3]);                // quoins all the way up
        h(40, 18 + i, 2, 2, (i & 2) ? ST[1] : ST[0]);
      }
      h(22, 18, 20, 1, ST[4]);                                       // finished top course
    } else {
      ART.wattleTexture(h, 22, 18, 20, 30, 153);
      h(22, 18, 1, 30, W[2]); h(22, 18, 1, 1, W[3]);                 // corner posts all the way up
      h(41, 18, 1, 30, W[1]);
      h(23, 18, 18, 1, SO[3]);                                        // finished daub edge
    }
    // putlog history up the wall: the top rows still open sockets, the
    // lowest already patched
    for (const px of [26, 31, 36]) { h(px, 24, 1, 1, AP.ink[0]); h(px + 1, 32, 1, 1, AP.ink[0]); }
    for (const px of [27, 33, 38]) h(px, 41, 1, 1, stone ? ST[1] : SO[3]);
    // arrow slits cut, the viewing gap, the finished doorway
    const sill = stone ? ST[4] : SO[3];
    h(28, 26, 2, 7, AP.ink[0]); h(28, 25, 2, 1, sill);
    h(34, 26, 2, 7, AP.ink[0]); h(34, 25, 2, 1, sill);
    h(28, 38, 8, 2, AP.ink[0]); h(28, 37, 8, 1, sill);
    h(26, 40, 12, 2, W[3]); h(28, 42, 8, 10, AP.ink[0]);
    h(28, 42, 1, 10, W[2]); h(35, 42, 1, 10, W[2]);
    // the LOOKOUT PLATFORM going in: a bearer beam across the wall-head,
    // joists cantilevered out both sides — the left half planked and railed,
    // the right still bare joists
    h(15, 16, 34, 2, W[1]); h(15, 16, 34, 1, W[2]);                  // bearer + joist ends
    ART.shadedRect(h, 16, 12, 16, 4, AP.wood, 2); h(16, 12, 16, 1, W[3]);  // planked left half
    for (let x = 17; x < 31; x += 3) h(x, 12, 1, 1, W[1]);           // plank seams
    for (let rx = 34; rx < 48; rx += 3) { h(rx, 12, 1, 4, W[2]); h(rx, 12, 1, 1, W[3]); }  // bare joists right
    for (const px of [17, 21, 25, 29]) h(px, 8, 1, 4, W[2]);
    h(17, 8, 13, 1, W[3]);                                           // first railing run
    // gin-pole hoist at the summit swinging the next bundle of planks
    h(45, 2, 1, 12, W[1]); h(40, 2, 6, 1, W[2]); h(45, 1, 1, 1, W[0]);
    h.f(83, 6, 1, 7, TH[1]);                                         // hoist rope, 1px
    h(38, 6, 7, 1, W[3]); h(38, 7, 7, 1, W[2]);                      // the bundle swinging clear of the deck
    // the top lift: tall standards, one high platform each side, lashings —
    // the lower lifts are already struck
    for (const px of [13, 50]) { h(px, 8, 1, 44, W[2]); h(px, 8, 1, 1, W[3]); }
    h(14, 20, 8, 1, W[1]); h(42, 20, 8, 1, W[1]);                    // top putlogs
    h(11, 19, 10, 1, W[3]); h(43, 19, 10, 1, W[3]);                  // high plank lifts
    for (let x = 12; x < 19; x += 2) h(x, 19, 1, 1, W[1]);
    for (const [lx, ly] of [[13, 20], [50, 20]]) { h(lx, ly - 1, 1, 1, TH[1]); h(lx, ly, 1, 1, TH[3]); }
    h(50, 34, 1, 18, W[1]); h(53, 34, 1, 18, W[1]);
    for (let r = 0; r < 8; r++) h(50, 35 + r * 2, 4, 1, W[2]);       // the long ladder up
    // the struck scaffold stacked below, the last of the stock, chips
    h(4, 50, 13, 1, W[2]); h(4, 52, 13, 1, W[1]); h(5, 50, 1, 3, TH[2]); h(15, 50, 1, 3, TH[2]);
    if (stone) { ART.shadedRect(h, 56, 48, 5, 4, ST, 3); h(56, 48, 5, 1, ST[4]); }
    else { h(56, 48, 6, 1, W[3]); h(56, 49, 6, 1, W[2]); h(57, 48, 1, 2, TH[2]); }
    for (let i = 0; i < 12; i++) h(14 + (rr() * 38) | 0, 56 + (rr() * 4) | 0, 1, 1, i % 2 ? (stone ? ST[3] : SO[3]) : (stone ? ST[1] : SO[1]));
  });
  Sprites.misc.towerBuild3 = towerStage3(false);

  /* tower UPGRADES diverge on purpose (the whole point of the separate
     labels): an upgrade lifts the tower toward its STONE tiers, so towerUp2/3
     climb in coursed masonry with dressed quoins while towerBuild2/3 — the
     first raising, toward the wattle level-1 tower — climb in wattle-and-daub
     over staked posts. The ground-breaking is the same work either way. */
  Sprites.misc.towerUp1 = Sprites.misc.towerBuild1;
  Sprites.misc.towerUp2 = towerStage2(true);
  Sprites.misc.towerUp3 = towerStage3(true);

  /* ---- EVERY BUILDING RAISED ITS OWN WAY (tests/build-stages.mjs) ----
     Bespoke three-stage construction art for each 1×1 building, replacing the
     generic work-site looks entirely (render.js routes any b.key with a
     `<key>Build1` sprite here). All at 128px on the 64-cell fine grid, and
     all following the real medieval build order for a timber building:

       stage 1  THE SILL    — plot staked and strung, footing stones set, the
                sill beams framed square at the corners, first deliveries
       stage 2  FOUR WALLS  — posts up from the sills, wall plate on top, the
                roofless box read clearly: back wall's inner face, side-wall
                tops, wattle bays woven and daubed on the front (some bays
                still bare lattice), interior floor open to the sky
       stage 3  THE ROOF    — walls done, rafters on the wall plate, and the
                thatch going on FROM THE EAVES UP in overlapping courses
                (how thatch is actually laid), ladder against the eave

     Open yards (lumber, range, siege, sapper, trade), the tent (warcamp),
     the waterworks (dock: piles driven first, then stringers, then deck) and
     the groundworks (farm: paring → ploughing → sowing; quarry: stripping →
     first bench → the deep cut) each tell their own trade's story instead.
     Each stage carries the building's identity props so no site reads as an
     anonymous brown blob. Upgrades alias the same art under `<key>Up1..3`
     labels (divergence allowed later — the tower's already do). */
  {
    const W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil, BO = AP.bone,
      GR = AP.grass, HD = AP.hide, INK = AP.ink, SH = ART.STYLE.SHADOW, WA = AP.water,
      GD = AP.gold, RK = AP.rock;   // the gold mine's stages work in warm rock and gold

    // trampled work-ground pad with a clod-broken edge (never a crisp panel)
    const pad = (h, x, y, w, d, seed) => {
      const r = ART.rng(seed);
      h(x, y, w, d, SO[2]); h(x, y, w, 1, SO[3]); h(x, y + d - 1, w, 1, SO[1]);
      for (let i = 0; i < 10; i++)
        h(r() < 0.5 ? x - 1 - ((r() * 2) | 0) : x + w + ((r() * 2) | 0), y + 1 + ((r() * (d - 2)) | 0), 1, 1, r() < 0.5 ? SO[2] : SO[3]);
      for (let i = 0; i < 12; i++) h(x + 2 + ((r() * (w - 4)) | 0), y + 1 + ((r() * (d - 2)) | 0), 1, 1, i % 2 ? SO[3] : SO[0]);
    };
    // corner stakes + the mason's taut 1px string squaring the plot
    const stakes = (h, x, y, w, d) => {
      for (const [sx, sy] of [[x - 1, y - 1], [x + w, y - 1], [x - 1, y + d], [x + w, y + d]]) {
        h(sx, sy - 5, 1, 6, W[2]); h(sx, sy - 5, 1, 1, W[3]);
      }
      h.f(x * 2, y * 2 - 1, w * 2, 1, TH[3]); h.f(x * 2, (y + d) * 2, w * 2, 1, TH[3]);
      h.f(x * 2 - 1, y * 2, 1, d * 2, TH[3]); h.f((x + w) * 2, y * 2, 1, d * 2, TH[3]);
    };
    // the sill frame: beams laid square on footing stones, lap-jointed at the
    // corners, a floor joist or two across — the first day of real carpentry
    const sills = (h, x, y, w, d) => {
      for (const [fx, fy] of [[x - 1, y - 1], [x + w - 2, y - 1], [x - 1, y + d - 2], [x + w - 2, y + d - 2], [x + ((w / 2) | 0) - 1, y + d - 2]]) {
        h(fx, fy, 3, 3, ST[2]); h(fx, fy, 3, 1, ST[3]);              // footing stones
      }
      h(x, y, w, 2, W[2]); h(x, y, w, 1, W[3]);                      // back sill
      h(x, y + d - 2, w, 2, W[2]); h(x, y + d - 2, w, 1, W[3]);      // front sill
      h(x, y, 2, d, W[2]); h(x + w - 2, y, 2, d, W[1]);              // side sills
      for (const [cx, cy] of [[x, y], [x + w - 2, y], [x, y + d - 2], [x + w - 2, y + d - 2]])
        h(cx, cy, 2, 1, W[3]);                                       // corner laps, lit
      h(x + 3, y + ((d / 2) | 0), w - 6, 1, W[1]);                   // a floor joist across
    };
    // the roofless FOUR-WALL box: back wall's shaded inner face under a lit
    // wall plate, open interior floor, side-wall tops, and the front wall in
    // woven wattle — some bays daubed, some still bare lattice; corner posts
    // and studs carry the frame. Returns nothing; front wall top edge = yTop
    // + 4 + depth (the eave line stage 3 builds its roof on).
    const frame = (h, x, yTop, w, depth, fH, o) => {
      const seed = o.seed || 7, fy = yTop + 4 + depth;
      ART.wattleTexture(h, x + 2, yTop, w - 4, 4, seed + 3);                   // back wall inner face…
      h(x + 2, yTop, w - 4, 1, W[3]);                                          // …under its lit wall plate
      h(x + 2, yTop + 4, w - 4, depth, BO[1]);                                 // the open floor, PALE dry earth — sky falls in
      h(x + 2, yTop + 4, w - 4, 1, SO[3]);
      const r = ART.rng(seed + 1);
      for (let i = 0; i < 12; i++) h(x + 3 + ((r() * (w - 6)) | 0), yTop + 5 + ((r() * (depth - 2)) | 0), 1, 1, i % 2 ? SO[3] : BO[2]);
      h(x, yTop, 2, 4 + depth, SO[2]); h(x, yTop, 1, 4 + depth, W[2]);         // side-wall tops
      h(x + w - 2, yTop, 2, 4 + depth, SO[1]); h(x + w - 1, yTop, 1, 4 + depth, W[1]);
      // ceiling JOISTS lying across the open box (the roofless read)
      for (const jx of [x + ((w * 0.33) | 0), x + ((w * 0.66) | 0)]) {
        h(jx, yTop, 2, 4 + depth + 1, W[2]); h(jx, yTop, 2, 1, W[3]); h(jx + 2, yTop + 2, 1, 3 + depth, SO[2]);
      }
      ART.wattleTexture(h, x, fy, w, fH, seed);                                // front wall going in
      h(x, fy, w, 1, W[3]);                                                    // lit wall plate
      for (const bx of (o.bare || [])) {                                       // bays still bare lattice
        h(bx, fy + 2, 5, fH - 3, INK[1]);
        for (let yy = fy + 3; yy < fy + fH - 1; yy += 2) h(bx, yy, 5, 1, W[1]);
        h(bx + 2, fy + 2, 1, fH - 3, W[2]);
      }
      if (o.door) { h(o.door[0], fy + 2, o.door[1], fH - 2, INK[0]); h(o.door[0] - 1, fy + 1, o.door[1] + 2, 1, W[3]); }
      for (let sx = x + 6; sx < x + w - 4; sx += 7) h(sx, fy + 1, 1, fH - 1, W[1]);   // studs
      h(x, fy - 1, 2, fH + 1, W[2]); h(x, fy - 1, 2, 1, W[3]);                 // corner posts
      h(x + w - 2, fy - 1, 2, fH + 1, W[1]); h(x + w - 2, fy - 1, 2, 1, W[2]);
      h(x + 2, fy + 1, 2, 1, W[3]); h(x + w - 4, fy + 1, 2, 1, W[2]);          // corner braces at the plate
      h(x + 3, fy + 2, 1, 1, W[3]); h(x + w - 4, fy + 2, 1, 1, W[2]);
    };
    // walls COMPLETE (stage 3): full wattle with corner posts, plate and door
    const walls = (h, x, y, w, hh, o) => {
      ART.wattleTexture(h, x, y, w, hh, (o && o.seed) || 9);
      h(x, y, w, 1, W[3]);
      h(x, y, 2, hh, W[2]); h(x, y, 2, 1, W[3]);
      h(x + w - 2, y, 2, hh, W[1]); h(x + w - 2, y, 2, 1, W[2]);
      if (o && o.door) { h(o.door[0], y + 2, o.door[1], hh - 2, INK[0]); h(o.door[0] - 1, y + 1, o.door[1] + 2, 1, W[3]); }
    };
    // the roof going on: ridge beam, bare rafters, and thatch courses laid
    // FROM THE EAVES UP — the lit ragged working edge shows where the
    // thatcher stands. frac = how far up the slope the courses have climbed.
    const roofOn = (h, x, yR, w, slopeH, frac, seed) => {
      h(x, yR, w, slopeH, W[0]);                                               // the dark under-roof void…
      h(x + 1, yR, w - 2, 1, W[3]); h(x + 1, yR + 1, w - 2, 1, W[1]);          // …ridge beam along the top
      for (let rx = x + 2; rx < x + w - 1; rx += 3) { h(rx, yR + 1, 1, slopeH - 1, W[2]); h(rx, yR + 1, 1, 1, W[3]); }   // rafters over it
      h(x + 1, yR + ((slopeH * 0.4) | 0), w - 2, 1, W[1]);                     // a purlin across the rafters
      h(x, yR, 1, slopeH, W[1]); h(x + w - 1, yR, 1, slopeH, W[1]);            // gable-end boards
      const ch = Math.max(3, (slopeH * frac) | 0), cy = yR + slopeH - ch;
      ART.thatchTexture(h, x, cy, w, ch, seed); h(x, cy, w, 1, TH[3]);         // courses from the eave up
      for (let tx = x + 1; tx < x + w - 2; tx += 4) h(tx, cy - 1, 2, 1, TH[2]);   // ragged working edge
      h(x - 1, yR + slopeH, w + 2, 1, TH[0]);                                  // eave lip shadow
    };
    const ladder = (h, x, y, len) => {
      h(x, y, 1, len, W[1]); h(x + 3, y, 1, len, W[1]);
      for (let r = 1; r < len; r += 2) h(x, y + r, 4, 1, W[2]);
    };
    const timber = (h, x, y) => {                                              // delivered log pile
      h(x, y, 9, 1, W[3]); h(x, y + 1, 9, 1, W[2]); h(x, y + 2, 9, 1, W[3]);
      h(x + 1, y, 1, 3, TH[2]); h(x + 7, y, 1, 3, TH[2]);
    };
    const tub = (h, x, y, mix) => {                                            // daub/mortar tub
      h(x, y, 7, 3, W[1]); h(x, y, 7, 1, W[2]); h(x + 1, y + 1, 5, 1, mix);
    };
    const chips = (h, seed, n, x, y, w, d, a, b) => {
      const r = ART.rng(seed);
      for (let i = 0; i < n; i++) h(x + ((r() * w) | 0), y + ((r() * d) | 0), 1, 1, i % 2 ? a : b);
    };
    /* the GOLD MINE's bank, shared by its three raising stages: a natural rise
       with a BROKEN skyline and gold showing through it, over stripped ground.
       Never a filled rectangle — that reads as a flat card with a hole in it,
       which is exactly how the first pass of this art failed. */
    const mineBank = (h, seed, foot) => {
      const r = ART.rng(seed);
      for (let x = 0; x < 64; x++) {
        const top = 8 + Math.round(5 * Math.sin(x * 0.15) + 2.2 * Math.sin(x * 0.42 + 1.2));
        h(x, top, 1, foot - top, RK[2]);
        h(x, top, 1, 2, RK[4]);
        h(x, top + 2, 1, 1, RK[3]);
        if (x >= 44) h(x, top + 3, 1, foot - top - 3, RK[1]);
        if (x <= 8) h(x, top + 3, 1, foot - top - 3, RK[3]);
      }
      h(0, foot - 2, 64, 2, RK[0]);
      h(0, foot, 64, 64 - foot, SO[2]); h(0, foot, 64, 2, SO[3]);      // the stripped ground below
      for (let i = 0; i < 18; i++) {                                   // gold traced through the rock
        const vx = 2 + ((r() * 60) | 0), vy = 12 + ((r() * (foot - 18)) | 0);
        h(vx, vy, 3, 2, GD[2]); h(vx, vy, 2, 1, GD[3]);
      }
      for (let i = 0; i < 16; i++) h(2 + ((r() * 60) | 0), foot + 2 + ((r() * 14) | 0), 1, 1, r() < 0.5 ? SO[1] : SO[3]);
    };

    const DRAWS = {
      // ============ HOUSE — the cottage: hearth first, home around it ============
      house: [
        (h) => {   // sill: staked plot, sills framed, and the HEARTHSTONE laid
          h(14, 56, 38, 2, SH);
          pad(h, 13, 30, 40, 27, 301); stakes(h, 16, 33, 32, 21); sills(h, 16, 34, 32, 19);
          h(38, 38, 8, 5, ST[2]); h(38, 38, 8, 1, ST[3]); h(40, 40, 4, 2, ST[1]);   // the hearth pad — a house begins at its fire
          timber(h, 2, 38); tub(h, 3, 50, SO[2]);
          h(24, 44, 6, 3, TH[2]); h(24, 44, 6, 1, TH[3]);            // reed bundle on the floor
          h(55, 44, 3, 5, W[1]); h(55, 44, 3, 1, W[3]); h(55, 43, 3, 1, WA[3]);   // the water barrel, already on site
          chips(h, 302, 10, 16, 54, 32, 6, SO[3], ST[3]);
        },
        (h) => {   // four walls: the roofless box, chimney climbing inside
          h(14, 54, 38, 2, SH);
          frame(h, 16, 22, 32, 8, 16, { seed: 31, door: [22, 8], bare: [40] });
          h(38, 24, 6, 9, ST[2]); h(38, 24, 6, 1, ST[3]); h(38, 24, 1, 9, ST[3]);   // chimney stack rising through the open roof
          tub(h, 4, 50, SO[2]); h(2, 42, 6, 3, TH[2]); h(2, 42, 6, 1, TH[3]);      // daub tub + withies
          ladder(h, 52, 34, 18);
          chips(h, 303, 10, 14, 54, 36, 6, SO[3], W[3]);
        },
        (h) => {   // the roof: thatch from the eaves up, chimney topped out
          h(14, 56, 38, 2, SH);
          walls(h, 16, 36, 32, 16, { seed: 31, door: [22, 8] });
          roofOn(h, 12, 20, 40, 16, 0.5, 33);
          h(40, 10, 6, 12, ST[2]); h(40, 10, 6, 1, ST[3]); h(40, 10, 1, 12, ST[3]);   // chimney above the ridge
          ladder(h, 54, 24, 20);
          h(2, 48, 6, 3, TH[2]); h(2, 48, 6, 1, TH[3]); h(2, 52, 6, 3, TH[2]);        // thatch bundles waiting
          chips(h, 304, 8, 16, 55, 32, 5, TH[1], TH[3]);
        },
      ],
      // ============ HUNTER'S LODGE — the trophy waits by the door ============
      lodge: [
        (h) => {
          h(16, 56, 34, 2, SH);
          pad(h, 15, 28, 34, 28, 311); stakes(h, 18, 31, 26, 22); sills(h, 18, 32, 26, 21);
          h(2, 40, 1, 12, W[1]); h(8, 40, 1, 12, W[1]);              // the pelt-frame poles, leant in a cross
          h(50, 46, 10, 1, W[2]); h(50, 48, 10, 1, W[2]);            // drying-rack poles stacked
          h(52, 36, 5, 4, HD[2]); h(52, 36, 5, 1, HD[3]);            // a bundle of hides
          timber(h, 28, 50); chips(h, 312, 8, 20, 54, 24, 5, SO[3], SO[0]);
        },
        (h) => {
          h(16, 54, 34, 2, SH);
          frame(h, 18, 20, 26, 8, 16, { seed: 41, door: [26, 8], bare: [37] });
          h(48, 26, 1, 26, W[2]); h(58, 26, 1, 26, W[2]); h(48, 26, 11, 1, W[3]);   // drying rack raised, nothing hung yet
          h(2, 34, 1, 16, W[1]); h(13, 34, 1, 16, W[1]); h(2, 34, 12, 1, W[2]);     // pelt frame up, empty
          tub(h, 30, 56, SO[2]); chips(h, 313, 8, 20, 54, 24, 5, SO[3], W[3]);
        },
        (h) => {
          h(16, 56, 34, 2, SH);
          walls(h, 18, 32, 26, 16, { seed: 41, door: [26, 8] });
          roofOn(h, 14, 16, 34, 16, 0.5, 43);
          h(4, 50, 8, 4, W[2]); h(4, 50, 8, 1, W[3]);                // a crate by the door…
          h(5, 46, 6, 4, BO[2]); h(5, 46, 6, 1, BO[1]);              // …with the antlered SKULL waiting to be mounted
          h(4, 44, 1, 3, BO[1]); h(11, 44, 1, 3, BO[1]); h(6, 48, 1, 1, INK[0]); h(9, 48, 1, 1, INK[0]);
          h(48, 26, 1, 26, W[2]); h(58, 26, 1, 26, W[2]); h(48, 26, 11, 1, W[3]);
          h(50, 30, 4, 10, HD[2]); h(50, 30, 4, 1, HD[3]);           // the first pelt hung
          ladder(h, 60, 22, 18);
        },
      ],
      // ============ BARRACKS — a hall wide enough to need a king post ============
      barracks: [
        (h) => {
          h(12, 56, 42, 2, SH);
          pad(h, 11, 28, 46, 28, 321); stakes(h, 14, 31, 40, 22); sills(h, 14, 32, 40, 21);
          h(8, 44, 32, 1, W[2]); h(8, 43, 32, 1, W[3]); h(7, 43, 2, 2, ST[3]);   // the great banner pole, lying full length
          timber(h, 44, 52); timber(h, 44, 56);                       // a drill hall takes real timber
          h(58, 40, 2, 8, W[1]); h(57, 39, 4, 1, W[2]);               // the sparring-dummy post, bundled
          chips(h, 322, 10, 16, 54, 36, 6, SO[3], SO[0]);
        },
        (h) => {
          h(12, 54, 42, 2, SH);
          frame(h, 14, 20, 40, 8, 16, { seed: 51, door: [28, 12], bare: [18, 46] });
          h(33, 22, 2, 10, W[1]); h(33, 22, 2, 1, W[3]);              // king post through the open roof
          h(58, 38, 1, 18, W[1]); h(56, 40, 5, 1, W[2]);              // dummy post planted, arms on
          h(46, 40, 1, 12, W[2]); h(52, 40, 1, 12, W[2]);             // weapon-rack posts, empty
          tub(h, 2, 50, SO[2]); chips(h, 323, 10, 14, 54, 38, 6, SO[3], W[3]);
        },
        (h) => {
          h(12, 56, 42, 2, SH);
          walls(h, 14, 34, 40, 16, { seed: 51, door: [27, 12] });
          h(26, 34, 2, 16, W[2]); h(40, 34, 2, 16, W[1]);             // heavy door jambs going in
          roofOn(h, 10, 16, 48, 18, 0.45, 53);
          h(12, 4, 1, 26, W[1]); h(12, 3, 1, 1, ST[4]);               // the banner pole RAISED — bare, no cloth yet
          h.f(26, 10, 14, 1, TH[1]); h.f(26, 10, 1, 24, TH[1]);       // guy ropes staking it
          ladder(h, 56, 22, 22);
          chips(h, 324, 8, 16, 55, 34, 5, TH[1], TH[3]);
        },
      ],
      // ============ STABLE — the trough set before the horse arrives ============
      stable: [
        (h) => {
          h(8, 58, 48, 2, SH);
          pad(h, 6, 32, 52, 26, 331); stakes(h, 8, 35, 48, 20); sills(h, 8, 36, 48, 19);
          h(42, 30, 14, 3, W[1]); h(42, 30, 14, 1, W[2]); h(43, 31, 12, 1, WA[3]);   // the water trough, filled and waiting
          for (let px = 48; px < 62; px += 4) h(px, 52, 1, 6, W[2]);   // paddock posts stacked upright
          h(2, 40, 6, 4, TH[2]); h(2, 40, 6, 1, TH[3]); h(2, 46, 6, 4, TH[2]);       // hay delivered early
          chips(h, 332, 10, 12, 56, 40, 6, SO[3], SO[0]);
        },
        (h) => {
          h(8, 56, 48, 2, SH);
          frame(h, 8, 20, 48, 10, 16, { seed: 61, door: [18, 16], bare: [42, 50] });
          h(42, 52, 14, 3, W[1]); h(42, 52, 14, 1, W[2]); h(43, 53, 12, 1, WA[3]);   // trough moved to the dooryard
          h(58, 40, 4, 1, W[3]); h(58, 42, 4, 1, W[2]); h(58, 44, 4, 1, W[3]);       // paddock posts, cut and stacked
          h(2, 44, 6, 4, TH[2]); h(2, 44, 6, 1, TH[3]);
          tub(h, 2, 54, SO[2]); chips(h, 333, 10, 12, 52, 40, 6, SO[3], W[3]);
        },
        (h) => {
          h(8, 58, 48, 2, SH);
          walls(h, 8, 34, 48, 20, { seed: 61 });
          h(18, 36, 16, 18, INK[0]); h(17, 35, 18, 1, W[3]);          // the big stall doorway…
          h(18, 46, 16, 8, W[2]); h(18, 46, 16, 1, W[3]);             // …its Dutch lower leaf hung first
          for (let dx = 21; dx < 33; dx += 3) h(dx, 46, 1, 8, W[1]);
          roofOn(h, 4, 20, 56, 14, 0.55, 63);
          h(26, 22, 8, 4, INK[0]); h(26, 22, 8, 1, W[3]);             // hay-loft opening framed in the gable
          h(30, 14, 4, 1, W[2]); h(33, 14, 1, 3, W[1]);               // hoist beam + pulley over it
          for (let px = 48; px < 62; px += 4) h(px, 38, 1, 6, W[2]);
          h(48, 38, 14, 1, W[3]);                                     // first paddock rail on its posts
          ladder(h, 1, 26, 20);
        },
      ],
      // ============ ARCHERY RANGE — the butt is built before the roof ============
      range: [
        (h) => {   // the yard staked out: shelter sills + straw for the butt
          h(6, 54, 52, 2, SH);
          pad(h, 2, 26, 60, 30, 341); stakes(h, 4, 29, 24, 16); sills(h, 4, 30, 24, 15);
          h(40, 34, 7, 4, TH[2]); h(40, 34, 7, 1, TH[3]); h(40, 40, 7, 4, TH[2]); h(40, 40, 7, 1, TH[3]);   // straw bales for the target butt
          h(50, 36, 6, 5, W[2]); h(50, 36, 6, 1, W[3]); h(51, 34, 4, 2, BO[2]);      // arrow crate, shafts poking out
          h(30, 46, 1, 10, W[2]); h(29, 45, 3, 1, W[3]);              // the pell post, delivered
          chips(h, 342, 10, 8, 48, 44, 8, SO[3], SO[0]);
        },
        (h) => {   // shelter frame up; the butt's trestle stands, disc leaning
          h(6, 52, 52, 2, SH);
          frame(h, 4, 18, 24, 8, 14, { seed: 71, door: [8, 14], bare: [] });
          h(46, 42, 1, 10, W[1]); h(56, 42, 1, 10, W[1]); h(45, 46, 13, 1, W[2]);    // trestle legs + crossbar
          ART.shadedCircle(h, 44, 40, 9, TH, 1); h(44, 40, 1, 1, TH[1]);             // the straw disc, bound but UNPAINTED, leaning
          h(30, 34, 1, 20, W[2]); h(29, 33, 3, 1, W[3]);              // pell post planted, bare
          tub(h, 2, 54, SO[2]); chips(h, 343, 8, 8, 48, 40, 8, SO[3], W[3]);
        },
        (h) => {   // roof going on; the rings being painted, rail going up
          h(6, 54, 52, 2, SH);
          walls(h, 4, 30, 24, 14, { seed: 71 });
          h(8, 32, 14, 12, INK[1]); h(7, 31, 16, 1, W[3]);            // the open front framed out
          roofOn(h, 0, 22, 32, 8, 0.6, 73);
          ART.shadedCircle(h, 50, 24, 12, TH, 1);                     // the butt MOUNTED on its trestle
          ART.shadedCircle(h, 50, 24, 9, BO, 1); ART.shadedCircle(h, 50, 24, 6, AP.red, 1);   // first rings painted
          h(46, 42, 1, 10, W[1]); h(56, 42, 1, 10, W[1]); h(45, 46, 13, 1, W[2]);
          h(30, 30, 6, 20, TH[2]); h(30, 30, 1, 20, TH[3]); h(30, 34, 6, 1, W[1]); h(30, 40, 6, 1, W[1]);   // pell wrapped + bound
          for (let fx = 2; fx < 24; fx += 10) { h(fx, 54, 1, 2, W[2]); h(fx, 54, 8, 1, W[1]); }   // shooting rail, first spans
        },
      ],
      // ============ TRADING POST — posts, ridge, then the awning unrolls ============
      trade: [
        (h) => {
          h(8, 56, 48, 2, SH);
          pad(h, 4, 30, 56, 26, 351); stakes(h, 6, 33, 52, 20);
          h(8, 40, 1, 1, INK[0]); h(55, 40, 1, 1, INK[0]);            // the two post holes, dug
          h(12, 44, 34, 2, W[2]); h(12, 44, 34, 1, W[3]);             // the posts themselves, lying ready
          h(14, 50, 10, 1, W[3]); h(14, 51, 10, 1, W[2]); h(14, 52, 10, 1, W[3]);   // counter planks stacked
          h(40, 48, 6, 5, W[2]); h(40, 48, 6, 1, W[3]);               // first crate of trade goods
          chips(h, 352, 10, 10, 50, 44, 8, SO[3], SO[0]);
        },
        (h) => {
          h(8, 54, 48, 2, SH);
          h(6, 20, 3, 36, W[2]); h(6, 20, 3, 1, W[3]);                // posts UP…
          h(55, 20, 3, 36, W[1]); h(55, 20, 3, 1, W[2]);
          h(6, 16, 52, 3, W[2]); h(6, 16, 52, 1, W[3]);               // …ridge beam across
          h(6, 12, 52, 4, BO[2]); h(6, 12, 52, 1, BO[1]);             // the awning cloth, still ROLLED on the ridge
          h.f(24, 25, 1, 6, TH[1]); h.f(84, 25, 1, 6, TH[1]);         // tie cords
          h(10, 46, 2, 8, W[1]); h(28, 46, 2, 8, W[1]); h(46, 46, 2, 8, W[1]);      // counter trestles
          h(8, 44, 24, 2, W[2]); h(8, 44, 24, 1, W[3]);               // half the counter top laid
          chips(h, 353, 8, 10, 52, 40, 8, SO[3], W[3]);
        },
        (h) => {
          h(8, 56, 48, 2, SH);
          h(6, 20, 3, 36, W[2]); h(6, 20, 3, 1, W[3]);
          h(55, 20, 3, 36, W[1]); h(55, 20, 3, 1, W[2]);
          h(6, 16, 52, 3, W[2]); h(6, 16, 52, 1, W[3]);
          h(6, 8, 34, 12, BO[2]); h(6, 8, 34, 1, BO[3]);              // awning HALF-UNROLLED down the left…
          for (let vx = 8; vx < 38; vx += 5) h(vx, 20, 3, 1, BO[1]);  // …scalloped hem tabs
          h(40, 10, 18, 4, BO[2]); h(40, 10, 18, 1, BO[1]);           // the rest still rolled
          h(8, 44, 48, 2, W[2]); h(8, 44, 48, 1, W[3]);               // counter planked full
          h(10, 46, 2, 8, W[1]); h(28, 46, 2, 8, W[1]); h(46, 46, 2, 8, W[1]);
          h(14, 38, 3, 6, SO[2]); h(14, 38, 3, 1, SO[3]);             // first wares: a tall amphora…
          h(20, 40, 5, 4, BO[1]); h(20, 40, 5, 1, BO[2]);             // …and a grain sack on the counter
          h(50, 50, 6, 5, W[2]); h(50, 50, 6, 1, W[3]);
        },
      ],
      // ============ SIEGE WORKSHOP — the engine takes shape on the stocks ============
      siege: [
        (h) => {   // hut sills + the STOCKS built first: a yard is its workbench
          h(6, 56, 52, 2, SH);
          pad(h, 2, 28, 60, 28, 361); stakes(h, 4, 31, 20, 18); sills(h, 4, 32, 20, 17);
          h(32, 44, 28, 2, W[2]); h(32, 44, 28, 1, W[3]);             // the stocks (assembly rails)
          h(34, 42, 1, 4, W[1]); h(56, 42, 1, 4, W[1]);
          timber(h, 34, 52); timber(h, 34, 56);                        // seasoned timber, stacked to dry
          h(48, 34, 2, 2, ST[2]); h(51, 35, 2, 2, ST[2]); h(46, 36, 2, 2, ST[1]);   // the first shot, piled
          chips(h, 362, 10, 30, 50, 28, 8, SO[3], W[3]);
        },
        (h) => {   // hut frame; wheels and rails wait on the stocks
          h(6, 54, 52, 2, SH);
          frame(h, 4, 20, 20, 8, 12, { seed: 81, door: [10, 8], bare: [] });
          h(32, 44, 28, 2, W[2]); h(32, 44, 28, 1, W[3]);
          h(34, 40, 24, 3, W[2]); h(34, 40, 24, 1, W[3]);             // the frame rails, laid on the stocks
          ART.shadedCircle(h, 36, 54, 4, W, 1); ART.shadedCircle(h, 46, 54, 4, W, 1);   // wheels leaning, not yet hung
          h(36, 54, 1, 1, TH[2]); h(46, 54, 1, 1, TH[2]);             // their hubs
          h(52, 50, 8, 1, W[1]); h(54, 48, 8, 1, W[1]);               // A-frame pieces on the ground
          tub(h, 26, 56, SO[2]); chips(h, 363, 8, 30, 48, 28, 6, SO[3], W[3]);
        },
        (h) => {   // roof on; the catapult rises — wheels hung, A-frame up
          h(6, 56, 52, 2, SH);
          walls(h, 4, 32, 20, 12, { seed: 81, door: [10, 8] });
          roofOn(h, 0, 18, 28, 14, 0.5, 83);
          h(32, 44, 28, 3, W[2]); h(32, 44, 28, 1, W[3]);             // engine frame on its rails
          ART.shadedCircle(h, 36, 50, 4, W, 1); ART.shadedCircle(h, 54, 50, 4, W, 1);   // wheels ON
          h(40, 28, 2, 16, W[1]); h(48, 28, 2, 16, W[1]); h(40, 28, 10, 1, W[3]);       // A-frame + pivot beam
          h(34, 30, 14, 1, W[2]); h(33, 29, 2, 2, W[3]);              // the throwing arm, leaned against it
          h(52, 38, 3, 2, W[0]);                                      // winch drum waiting
          chips(h, 364, 8, 30, 52, 28, 6, W[3], TH[1]);
        },
      ],
      // ============ SAPPERS' CAMP — tools first, then the practice pit ============
      sapper: [
        (h) => {
          h(6, 58, 52, 2, SH);
          pad(h, 2, 32, 60, 26, 371); stakes(h, 4, 35, 24, 18); sills(h, 4, 36, 24, 17);
          h(34, 40, 14, 1, W[2]);                                     // the tool rail, first thing up…
          h(36, 34, 1, 8, W[2]); h(35, 33, 3, 2, ST[3]);              // …a shovel on it
          h(40, 34, 1, 8, W[2]); h(39, 33, 1, 1, ST[3]); h(41, 33, 1, 1, ST[3]);   // …a pick beside it
          h(44, 36, 1, 6, W[2]); h(43, 35, 3, 1, ST[4]);              // …an axe
          h(50, 50, 6, 3, W[1]); h(50, 50, 6, 1, SO[2]); ART.shadedCircle(h, 51, 54, 2, W, 1);   // the barrow, loaded
          h(28, 52, 8, 1, W[3]); h(28, 53, 8, 1, W[2]);               // planks
          chips(h, 372, 10, 30, 46, 26, 8, SO[3], SO[0]);
        },
        (h) => {
          h(6, 56, 52, 2, SH);
          frame(h, 4, 24, 24, 8, 12, { seed: 91, door: [10, 8], bare: [] });
          h(32, 40, 24, 12, SO[1]); h(36, 43, 16, 7, SO[0]);          // the practice pit, opened
          h(32, 40, 24, 1, SO[3]); h(32, 40, 1, 12, SO[3]); h(32, 51, 24, 1, SO[2]);   // lit near rim
          h(56, 38, 6, 4, SO[3]); h(57, 36, 4, 2, SO[3]); h(28, 46, 4, 3, SO[3]);      // spoil heaped both sides
          h(38, 36, 1, 7, W[2]); h(37, 35, 3, 2, ST[3]);              // shovel stuck in the works
          h(50, 52, 6, 3, W[1]); h(50, 52, 6, 1, SO[2]); ART.shadedCircle(h, 51, 56, 2, W, 1);
          chips(h, 373, 8, 30, 52, 26, 6, SO[3], SO[1]);
        },
        (h) => {
          h(6, 58, 52, 2, SH);
          walls(h, 4, 36, 24, 12, { seed: 91, door: [10, 8] });
          roofOn(h, 0, 22, 28, 14, 0.5, 93);
          h(32, 40, 24, 12, SO[1]); h(38, 43, 12, 6, INK[1]);         // the pit, dug deep
          h(32, 40, 24, 1, SO[3]); h(32, 40, 1, 12, SO[3]); h(32, 51, 24, 1, SO[2]);    // lit rim
          h(42, 24, 1, 16, W[1]); h(52, 24, 1, 16, W[1]); h(42, 24, 11, 1, W[2]);        // the derrick A-frame going up over it
          h.f(94, 50, 1, 10, TH[1]);                                  // its first rope hung
          h(56, 38, 6, 4, SO[3]); h(57, 36, 4, 2, SO[3]);
          h(30, 56, 8, 1, W[3]); h(30, 57, 8, 1, W[2]);
        },
      ],
      // ============ WAR CAMP — a camp is PITCHED, not built ============
      warcamp: [
        (h) => {   // ground cleared: fire ring, pegs driven, canvas ready
          h(10, 56, 44, 2, SH);
          pad(h, 8, 26, 48, 32, 381);
          for (const [px, py] of [[14, 30], [50, 30], [12, 52], [52, 52], [32, 24], [32, 56]])
            h(px, py, 1, 2, W[2]);                                    // tent pegs ringing the pitch
          ART.shadedCircle(h, 20, 48, 3, ST, 1); h(19, 48, 2, 1, INK[1]);   // the fire ring, laid cold
          h(26, 38, 16, 4, BO[2]); h(26, 38, 16, 1, BO[1]); h.f(60, 78, 1, 6, TH[1]); h.f(74, 78, 1, 6, TH[1]);   // the canvas, rolled and corded
          h(26, 44, 14, 1, W[2]); h(26, 46, 14, 1, W[1]);             // the poles beside it
          chips(h, 382, 8, 12, 30, 40, 20, SO[3], SO[0]);
        },
        (h) => {   // the ridge stands; canvas half-hoisted, guys staked
          h(10, 54, 44, 2, SH);
          pad(h, 10, 30, 44, 27, 385);
          h(31, 18, 2, 38, W[2]); h(31, 18, 2, 1, W[3]);              // the mast up
          for (let y = 22; y <= 54; y++) {                            // canvas draped down the LEFT side only
            const half = Math.round((y - 22) * 0.62) + 1;
            h(32 - half, y, half, 1, y < 38 ? TH[2] : TH[1]);
          }
          h(30, 22, 1, 33, TH[3]);                                    // lit seam at the ridge
          h.f(66, 42, 24, 1, TH[1]); h.f(90, 42, 1, 12, TH[1]);       // a guy line to the right-side peg
          h(50, 52, 1, 3, W[2]); h(44, 26, 1, 2, W[2]);               // pegs the bare side ties to
          ART.shadedCircle(h, 16, 48, 3, ST, 1); h(15, 48, 2, 1, INK[1]);
          chips(h, 383, 8, 12, 34, 42, 18, SO[3], SO[0]);
        },
        (h) => {   // the tent stands; banner pole planted, spears racked
          h(10, 56, 44, 2, SH);
          pad(h, 10, 32, 44, 26, 386);
          for (let y = 22; y <= 56; y++) {                            // full canvas cone
            const half = Math.round((y - 22) * 0.62) + 1;
            h(32 - half, y, half * 2, 1, y < 38 ? TH[2] : TH[1]);
          }
          h(31, 22, 2, 34, TH[3]); h(16, 56, 32, 1, TH[0]);           // ridge seam + shaded hem
          h(31, 19, 1, 4, W[3]);                                      // finial pole
          h(28, 42, 8, 14, INK[0]); h(26, 42, 2, 14, TH[3]);          // doorway, one flap pinned back
          h(50, 20, 1, 36, W[2]); h(50, 19, 1, 1, ST[4]);             // the banner pole planted — no cloth yet
          h(48, 52, 5, 2, SO[3]); h.f(101, 44, 8, 1, TH[1]);          // its footing mound + a stay
          for (const sx of [12, 16]) { h(sx, 38, 1, 18, W[2]); h(sx, 37, 1, 1, ST[4]); }   // planted spears
          chips(h, 384, 6, 12, 50, 36, 8, SO[3], SO[0]);
        },
      ],
      // ============ DOCK — piles driven, stringers laid, deck planked ============
      dock: [
        (h) => {   // the pile rig: a driven pair, the weight hung over the next
          h(12, 28, 48, 26, WA[2]); h(12, 48, 48, 12, WA[1]); h(12, 58, 48, 2, WA[0]);   // the slip
          h(0, 16, 12, 40, BO[2]); h(0, 16, 12, 1, GR[2]); h(0, 15, 8, 1, GR[3]);        // the shore
          h(0, 54, 12, 1, WA[4]); h(16, 52, 6, 1, WA[4]); h(40, 56, 5, 1, WA[3]);        // foam + ripples
          h(20, 40, 2, 18, W[0]); h(20, 39, 2, 1, W[3]);              // the first piles, driven
          h(28, 42, 2, 16, W[0]); h(28, 41, 2, 1, W[3]);
          h(1, 20, 10, 1, W[2]); h(1, 23, 10, 1, W[2]); h(1, 26, 10, 1, W[2]);           // piles stacked on shore
          h(34, 18, 1, 22, W[1]); h(42, 18, 1, 22, W[1]); h(34, 18, 9, 1, W[2]);         // the pile-driving frame…
          h.f(76, 40, 1, 14, TH[1]); ART.shadedRect(h, 36, 26, 4, 4, ST, 3);             // …its drop weight on the rope
          h(36, 44, 2, 6, W[0]); h(36, 43, 2, 1, W[3]);               // the pile it stands over, half-driven
        },
        (h) => {   // every pile home; stringers reach out; first boards down
          h(12, 28, 48, 26, WA[2]); h(12, 48, 48, 12, WA[1]); h(12, 58, 48, 2, WA[0]);
          h(0, 16, 12, 40, BO[2]); h(0, 16, 12, 1, GR[2]); h(0, 15, 8, 1, GR[3]);
          h(0, 54, 12, 1, WA[4]); h(22, 54, 6, 1, WA[4]); h(44, 50, 5, 1, WA[3]);
          for (const px of [20, 30, 40, 50]) { h(px, 38, 2, 20, W[0]); h(px, 37, 2, 1, W[3]); }   // all piles driven
          h(4, 30, 52, 2, W[2]); h(4, 30, 52, 1, W[3]);               // stringers shore → out
          h(4, 36, 52, 2, W[1]);
          h(4, 26, 14, 6, W[2]); h(4, 26, 14, 1, W[3]);               // first deck boards at the shore end
          for (let bx = 6; bx < 18; bx += 3) h(bx, 27, 1, 5, W[1]);
          h(52, 18, 1, 20, W[1]); h(58, 18, 1, 20, W[1]); h(52, 18, 7, 1, W[2]);   // the rig, moved to the far end
          h.f(110, 38, 1, 12, TH[1]);
        },
        (h) => {   // the deck planked; rails rising; bollard set
          h(12, 28, 48, 26, WA[2]); h(12, 48, 48, 12, WA[1]); h(12, 58, 48, 2, WA[0]);
          h(0, 16, 12, 40, BO[2]); h(0, 16, 12, 1, GR[2]); h(0, 15, 8, 1, GR[3]);
          h(0, 54, 12, 1, WA[4]); h(20, 52, 6, 1, WA[4]); h(46, 56, 5, 1, WA[3]);
          for (const px of [20, 30, 40, 50]) { h(px, 40, 2, 18, W[0]); }
          ART.woodPlankTexture(h, 4, 24, 52, 14, 87); h(4, 24, 52, 1, W[3]);   // the deck, planked full
          for (let bx = 8; bx < 54; bx += 4) h(bx, 26, 1, 11, W[1]);
          for (let rx = 6; rx <= 42; rx += 9) h(rx, 16, 1, 8, W[3]);           // rail posts up…
          h(6, 16, 28, 1, W[3]);                                               // …top rail on the first spans
          h(54, 26, 4, 8, W[2]); h(54, 25, 4, 1, ST[3]);              // the mooring bollard, set
          h.f(96, 60, 14, 1, TH[1]); h.f(96, 61, 1, 5, TH[1]);        // its first rope, hung ready
        },
      ],
      // ============ FARM — paring, ploughing, sowing ============
      farm: [
        (h) => {   // paring: the sod stripped strip by strip, stones picked
          h(0, 0, 64, 64, GR[2]);
          h(0, 0, 34, 64, SO[2]); h(33, 0, 1, 64, SO[3]);             // stripped ground advancing from the west
          for (let i = 0; i < 5; i++) h(34, 4 + i * 13, 6, 4, SO[2]); // the working edge, ragged
          chips(h, 391, 24, 2, 2, 30, 60, SO[3], SO[0]);
          const r = ART.rng(392);
          for (let i = 0; i < 8; i++) h(36 + ((r() * 26) | 0), 2 + ((r() * 58) | 0), 1, 1, GR[3]);   // unbroken meadow tufts
          for (const [sx, sy] of [[1, 1], [61, 1], [1, 60], [61, 60]]) { h(sx, sy - 0, 1, 3, W[2]); h(sx, sy, 1, 1, W[3]); }
          h.f(4, 2, 120, 1, TH[3]); h.f(4, 125, 120, 1, TH[3]);       // the bounds strung
          h(6, 44, 5, 4, ST[2]); h(6, 44, 5, 1, ST[3]); h(8, 42, 3, 2, ST[1]);   // field stones, picked and piled
          h(20, 24, 1, 6, W[2]); h(19, 23, 3, 1, ST[3]);              // the spade at the working edge
        },
        (h) => {   // ploughing: furrows walk east; the ard rests mid-field
          h(0, 0, 64, 64, SO[2]); ART.shadedRect(h, 0, 0, 64, 64, SO, 2);
          for (let i = 0; i < 8; i++) {                               // furrows on the ploughed half
            const ry = 6 + i * 7;
            h(2, ry, 38, 1, SO[1]); h(2, ry - 1, 38, 1, SO[3]);
          }
          h(40, 26, 8, 2, W[2]); h(46, 24, 2, 2, W[1]); h(47, 22, 1, 3, W[3]); h(40, 28, 2, 2, ST[3]);   // the ard plough, standing in its furrow
          for (let fx = 2; fx < 62; fx += 8) h(fx, 60, 1, 3, W[2]);   // fence posts along the lane — no rails yet
          h(44, 8, 16, 2, W[2]); h(44, 8, 16, 1, W[3]); h(44, 18, 16, 2, W[2]);   // the shed's sills, back-right
          h(44, 8, 2, 12, W[2]); h(58, 8, 2, 12, W[1]);
          chips(h, 393, 16, 42, 30, 20, 26, SO[3], SO[0]);
        },
        (h) => {   // sowing: every furrow cast with seed; the shed frames up
          h(0, 0, 64, 64, SO[2]); ART.shadedRect(h, 0, 0, 64, 64, SO, 2);
          const r = ART.rng(394);
          for (let i = 0; i < 8; i++) {
            const ry = 6 + i * 7;
            h(2, ry, 60, 1, SO[1]); h(2, ry - 1, 60, 1, SO[3]);
            for (let x = 3; x < 60; x += 5) if (r() < 0.7) h(x + ((r() * 3) | 0), ry - 1, 1, 1, TH[3]);   // broadcast seed
          }
          frame(h, 44, 2, 18, 4, 8, { seed: 95, door: [50, 4] });     // the shed rising, back-right
          for (let fx = 2; fx < 62; fx += 8) h(fx, 58, 1, 4, W[2]);
          h(2, 58, 60, 1, W[3]);                                      // the fence railed
          h(12, 32, 1, 8, W[2]); h(10, 34, 5, 1, W[2]);               // the scarecrow's cross, raised bare
          h(24, 44, 4, 3, TH[2]); h(24, 44, 4, 1, TH[3]); h(25, 42, 2, 2, BO[1]);   // the seed basket
        },
      ],
      // ============ QUARRY — strip, split, then the deep cut ============
      /* GOLD MINE — sinking a shaft, in three: the seam prospected and staked;
         the adit collared and the first sets timbered in; the drive going in
         under a working windlass with the first ore out. Warm rock and gold
         showing all through, so the stages read as a MINE and never a quarry. */
      mine: [
        (h) => {   // prospecting: the reef stripped, the gold traced, the shaft staked
          mineBank(h, 431, 46);
          for (let sx = 14; sx <= 46; sx += 16) { h(sx, 34, 2, 12, W[1]); h(sx, 34, 2, 2, W[3]); }   // survey stakes on the collar line
          h.f(28, 72, 72, 2, BO[2]);                                   // the chalked line between them
          h(20, 40, 22, 6, SO[1]); h(20, 40, 22, 2, SO[3]);            // the first cut into the bank
          h(20, 54, 14, 6, RK[1]); h(20, 54, 14, 2, RK[2]);            // spoil barrowed clear
          h(48, 46, 2, 12, W[2]); h(46, 44, 6, 2, ST[3]);              // pick leaned at the works
          h(4, 50, 12, 6, W[1]); h(4, 50, 12, 2, W[3]); h(6, 52, 8, 3, GD[1]);   // the pan of washings that started it all
          chips(h, 432, 14, 8, 48, 48, 14, GD[2], RK[3]);
        },
        (h) => {   // the collar: the mouth cut and the first timber sets driven in
          mineBank(h, 433, 46);
          h(24, 24, 18, 22, INK[0]);                                   // the mouth, driven in
          for (const sx of [21, 42]) { h(sx, 22, 3, 24, W[1]); h(sx, 22, 3, 2, W[3]); }   // the legs of the sets
          h(19, 18, 28, 4, W[2]); h(19, 18, 28, 2, W[3]);              // the head timber across
          h(26, 30, 14, 2, W[1]); h(26, 38, 14, 2, W[1]);              // sets going in down the drive
          h(2, 44, 18, 10, RK[1]); h(2, 44, 18, 2, RK[2]); h(4, 42, 12, 2, RK[2]);   // the growing spoil heap
          h(50, 40, 12, 8, W[2]); h(50, 40, 12, 2, W[3]);              // stacked props waiting
          for (let i = 0; i < 3; i++) h(52, 42 + i * 2, 8, 1, W[1]);
          h(28, 50, 16, 8, W[2]); h(28, 50, 16, 2, W[3]); h(26, 58, 4, 4, W[1]);   // the barrow, loaded
          h(32, 52, 8, 4, RK[3]);
          chips(h, 434, 16, 6, 46, 44, 18, GD[2], RK[3]);
        },
        (h) => {   // the drive goes in: a windlass over the collar, the first ore out
          mineBank(h, 437, 46);
          h(24, 26, 18, 20, INK[0]);
          for (const sx of [21, 42]) { h(sx, 24, 3, 22, W[1]); h(sx, 24, 3, 2, W[3]); }
          h(19, 20, 28, 4, W[2]); h(19, 20, 28, 2, W[3]);
          h(26, 30, 14, 2, W[2]); h(26, 36, 14, 2, W[2]);              // sets receding into the dark
          // the WINDLASS standing over the collar, its rope down the shaft
          h(16, 2, 4, 16, W[1]); h(44, 2, 4, 16, W[1]); h(16, 2, 4, 2, W[3]);
          h(14, 0, 36, 4, W[2]); h(14, 0, 36, 2, W[3]);
          ART.shadedCircle(h, 32, 7, 5, W, 2); h(30, 5, 4, 4, W[3]);
          h.f(64, 24, 2, 26, TH[1]);                                   // the fall of the rope
          h(4, 46, 16, 10, RK[1]); h(4, 46, 16, 2, RK[2]);
          h(24, 52, 22, 2, W[1]); h(24, 58, 22, 2, W[1]);              // rails laid out of the mouth
          h(28, 46, 16, 8, W[2]); h(28, 46, 16, 2, W[3]);
          h(31, 48, 10, 4, GD[1]); h(31, 48, 7, 2, GD[2]);             // the first cart of ore, gold in it
          h(27, 54, 4, 4, INK[1]); h(40, 54, 4, 4, INK[1]);
          h(50, 44, 12, 6, W[1]); h(50, 44, 12, 2, W[3]); h(52, 46, 8, 3, GD[1]);   // washed gold set aside
          chips(h, 438, 14, 6, 46, 44, 18, GD[2], RK[3]);
        },
      ],
      quarry: [
        (h) => {   // stripping: turf off, the seam marked with wedge slots
          ART.stoneTexture(h, 0, 0, 64, 64, 111);
          h(0, 0, 64, 4, GR[2]); h(0, 60, 64, 4, GR[2]); h(0, 0, 3, 64, GR[2]);   // turf still ringing the ground
          h(0, 4, 64, 1, GR[1]); h(0, 59, 64, 1, GR[3]);
          h(48, 8, 10, 6, SO[1]); h(48, 8, 10, 1, SO[3]); h(50, 6, 6, 2, SO[2]);  // overburden, barrowed to a heap
          h.f(24, 60, 60, 1, BO[2]);                                  // the mason's chalked line on the rock
          for (let wx = 13; wx < 42; wx += 5) h(wx, 29, 2, 2, INK[1]);            // wedge slots cut along it
          h(16, 40, 1, 8, W[2]); h(15, 39, 3, 1, ST[3]);              // pick + sledge left at the line
          h(30, 44, 1, 6, W[2]); h(29, 42, 3, 2, ST[2]);
          chips(h, 395, 14, 8, 34, 44, 20, ST[3], ST[1]);
        },
        (h) => {   // the first bench: a slab split off its seam, on rollers
          ART.stoneTexture(h, 0, 0, 64, 64, 111);
          h(0, 0, 64, 3, GR[2]); h(0, 61, 64, 3, GR[2]);
          ART.shadedRect(h, 10, 12, 44, 40, ST, 1);                   // the shallow bench opened
          h(10, 12, 44, 1, ST[4]); h(10, 51, 44, 1, ST[0]);
          for (let wx = 16; wx < 44; wx += 5) h(wx, 22, 2, 2, INK[1]);            // the next wedge line, set
          h.f(32, 46, 44, 1, INK[0]);                                 // the crack running between wedges
          h(18, 36, 12, 6, ST[3]); h(18, 36, 12, 1, ST[4]); h(22, 38, 1, 4, ST[1]);   // the freed slab…
          h(17, 43, 14, 1, W[2]); h(17, 45, 14, 1, W[2]);             // …resting on log rollers
          h(48, 8, 10, 6, SO[1]); h(48, 8, 10, 1, SO[3]);
          h(40, 40, 1, 7, W[2]); h(39, 38, 3, 2, ST[2]);              // the sledge, mid-work
          chips(h, 396, 14, 12, 16, 40, 32, ST[3], ST[1]);
        },
        (h) => {   // the deep cut opens; the crane rises over it
          ART.stoneTexture(h, 0, 0, 64, 64, 111);
          ART.shadedRect(h, 10, 12, 44, 42, ST, 1);
          ART.shadedRect(h, 18, 20, 28, 26, ST, 0);                   // the second step down
          h(24, 26, 16, 14, INK[1]);                                  // the deep cut, dark
          h(40, 4, 3, 24, W[1]); h(40, 4, 3, 1, W[3]); h(40, 4, 18, 3, W[2]);     // the timber crane going up over the pit
          h(44, 2, 1, 4, W[1]); h.f(112, 14, 1, 22, TH[1]);           // jib stay + the fall of its rope
          for (const [bx, by] of [[4, 48], [4, 42], [10, 56]]) { h(bx, by, 7, 5, ST[3]); h(bx, by, 7, 1, ST[4]); h(bx, by + 4, 7, 1, ST[1]); }   // squared blocks stacking up
          h(46, 50, 12, 2, W[3]); h(50, 46, 12, 2, W[3]);             // ramp planks into the works
          h(28, 52, 1, 7, W[2]); h(27, 51, 3, 1, ST[3]);
          chips(h, 397, 12, 12, 16, 40, 34, ST[3], ST[1]);
        },
      ],
      // ============ LUMBER CAMP — the first tree pays for the shelter ============
      lumber: [
        (h) => {   // the first felling: a trunk down, limbed where it lies
          h(10, 56, 44, 2, SH);
          pad(h, 4, 30, 56, 28, 401);
          h(14, 44, 36, 4, W[2]); h(14, 44, 36, 1, W[3]);             // the felled trunk
          h(14, 44, 2, 4, TH[2]); h(15, 45, 1, 2, TH[3]);             // its pale ring end
          h(24, 41, 2, 3, W[1]); h(36, 41, 2, 3, W[1]); h(44, 48, 3, 2, W[1]);   // limbed branch stubs
          ART.shadedCircle(h, 54, 38, 4, W, 1); h(54, 38, 1, 1, TH[2]);          // the chopping stump…
          h(56, 30, 1, 7, W[2]); h(54, 29, 4, 2, ST[3]);              // …axe sunk in it
          for (const [px, py] of [[7, 34], [21, 34], [5, 40], [23, 40]]) h(px, py, 1, 1, INK[0]);   // the lean-to's post holes, dug
          h(8, 36, 10, 1, W[2]); h(8, 38, 10, 1, W[2]);               // its posts, cut and waiting
          chips(h, 402, 16, 10, 40, 44, 14, TH[1], W[3]);
        },
        (h) => {   // the lean-to frame: posts + single-pitch rafters, bare
          h(10, 54, 44, 2, SH);
          h(6, 18, 2, 22, W[2]); h(20, 18, 2, 22, W[1]);              // back posts, taller
          h(4, 28, 2, 16, W[2]); h(22, 28, 2, 16, W[1]);              // front posts, shorter — the single pitch
          h(6, 19, 16, 9, W[0]);                                      // the dark under-roof void of the pitch
          h(6, 18, 16, 1, W[3]); h(4, 28, 20, 1, W[3]);               // plates
          for (let rx = 6; rx < 24; rx += 3) { h(rx, 19, 1, 10, W[2]); h(rx, 19, 1, 1, W[3]); }   // rafters over it
          for (let lx = 8; lx < 28; lx += 6) { ART.shadedCircle(h, lx, 50, 3, W, 2); h(lx, 50, 1, 1, TH[2]); }   // the stack begun — one course of ring ends
          h(38, 44, 1, 8, W[1]); h(50, 44, 1, 8, W[1]); h(36, 47, 16, 1, W[2]);   // sawhorse trestles built
          h(40, 34, 10, 1, ST[3]); h(40, 33, 1, 2, W[1]); h(49, 33, 1, 2, W[1]);  // the two-man saw, leaned ready
          chips(h, 403, 14, 10, 40, 44, 14, TH[1], W[3]);
        },
        (h) => {   // the shelter thatched from its low edge; first log on the horse
          h(10, 56, 44, 2, SH);
          h(6, 18, 2, 24, W[2]); h(20, 18, 2, 24, W[1]);
          h(4, 28, 2, 18, W[2]); h(22, 28, 2, 18, W[1]);
          h(6, 19, 16, 5, W[0]);                                      // dark void where the pitch is still open
          h(6, 18, 16, 1, W[3]);
          for (let rx = 6; rx < 24; rx += 3) { h(rx, 19, 1, 5, W[2]); h(rx, 19, 1, 1, W[3]); }   // top of the pitch still bare
          ART.thatchTexture(h, 4, 24, 20, 6, 105); h(4, 24, 20, 1, TH[3]);        // thatch from the LOW eave up
          for (let lx = 8; lx < 28; lx += 6) {                        // the stack, two courses now
            ART.shadedCircle(h, lx, 50, 3, W, 2); h(lx, 50, 1, 1, TH[2]);
            ART.shadedCircle(h, lx + 3, 45, 3, W, 2); h(lx + 3, 45, 1, 1, TH[2]);
          }
          h(38, 44, 1, 8, W[1]); h(50, 44, 1, 8, W[1]); h(36, 47, 16, 1, W[2]);
          h(34, 38, 20, 3, W[2]); h(34, 38, 20, 1, W[3]); h(34, 38, 1, 3, TH[2]);   // the first log ON the horse
          h(43, 36, 6, 1, ST[3]); h(43, 34, 1, 3, W[1]);              // the saw in its kerf
          chips(h, 404, 16, 30, 48, 24, 10, TH[1], W[3]);
        },
      ],
    };

    for (const [key, ds] of Object.entries(DRAWS)) {
      ds.forEach((d, i) => { Sprites.misc[key + 'Build' + (i + 1)] = fine128(d); });
      for (let i = 1; i <= 3; i++) Sprites.misc[key + 'Up' + i] = Sprites.misc[key + 'Build' + i];
    }
  }

  /* ---- BURNING BUILDINGS (tests/burn-down.mjs): the flame animation ----
     Four-frame licking fire in two sizes, drawn OVER a damaged building
     (render.js drawBurn). Opaque fire on a transparent ground, anchored to
     the canvas bottom so render.js can plant the base of the flame on a
     roof line or a doorway. No ink outline — fire glows, it isn't drawn.
     Layered like the dragon's fire line: a dark ember bed, an outer tongue,
     a hot middle, a white-hot core, sparks off the crest on the high frames
     and a curl of smoke as it licks. */
  {
    const F = AP.fire, SMOKE = 'rgba(74,74,82,0.55)', SMOKE2 = 'rgba(74,74,82,0.3)';
    const flameFrames = (big) => Array.from({ length: 4 }, (_, f) => tileB(p => {
      const q = p.hi, base = 30, cx = 16;
      const sway = [0, -1, 1, 0][f];
      // one licking tongue: rows narrow toward the tip, each row wobbling
      // with height and frame so the fire genuinely licks
      const tongue = (tx, tw, th, col, ph) => {
        for (let yy = 0; yy < th; yy++) {
          const t = yy / th;
          const ww = Math.max(1, Math.round(tw * (1 - t * t)));
          const wob = Math.round(Math.sin(t * 5 + f * 1.6 + ph) * t * 2 + sway * t);
          q(tx - (ww >> 1) + wob, base - 1 - yy, ww, 1, col);
        }
      };
      const w = big ? 13 : 8, h = (big ? 21 : 13) + [0, 3, 1, 4][f];
      if (big) {                                          // side licks knit a broad blaze
        tongue(cx - 5, 6, Math.round(h * 0.55), F[1], 2.1);
        tongue(cx + 5, 6, Math.round(h * 0.5), F[1], 4.2);
      }
      tongue(cx, w, h, F[1], 0);                          // outer flame
      tongue(cx, Math.max(2, w - 4), Math.round(h * 0.72), F[2], 0.4);   // hot middle
      tongue(cx, Math.max(1, w - 8), Math.round(h * 0.4), F[3] || F[2], 0.8);  // white-hot core
      q(cx - (w >> 1) - 1, base - 1, w + 2, 1, F[0]);     // dark ember bed
      q(cx - (w >> 1), base, w, 1, F[1]);                 // glow spilling at the foot
      if (f === 1 || f === 3) {                           // sparks off the crest
        q(cx + sway * 2 + (f === 1 ? 2 : -3), base - h - 3, 1, 1, F[2]);
        if (big) q(cx - sway * 2 + 4, base - h - 5, 1, 1, F[3] || F[2]);
      }
      if (f >= 2) {                                       // smoke curling off the tip
        q(cx + sway + 2, base - h - 4, 2, 2, SMOKE);
        q(cx - 2 + sway * 2, base - h - 7, 2, 2, SMOKE2);
      }
    }, 64));
    Sprites.misc.flameSmall = flameFrames(false);
    Sprites.misc.flameBig = flameFrames(true);
  }

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
  Sprites.tunicCol = TUNICS;                               // render.js flies banners in the village's own dye
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

  /* ---- SPECIAL EVENT SPRITES ----
     Each event owns Sprites.misc.<key>: an ARRAY of frames the renderer
     cycles (4 frames reads smooth at ~5-6 fps), drawn on an oversized canvas
     at native pixel scale. New events should follow the same pattern. */

  // THE KRAKEN — 96×96, four writhing frames. Eight tapered tentacles curl on
  // their own phases around a mottled mantle with burning eyes; churned foam
  // rings the waterline. Triple the pixels of the old 32px terror.
  Sprites.misc.kraken = [0, 1, 2, 3].map(f => {
    const c = mk(96, 96), g2 = c.getContext('2d');
    const ph = f * Math.PI / 2;
    const disc = (x, y, r, col) => { g2.fillStyle = col; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) g2.fillRect((x + dx) | 0, (y + dy) | 0, 1, 1); };
    const px = (x, y, col) => { g2.fillStyle = col; g2.fillRect(x | 0, y | 0, 1, 1); };
    const INK0 = AP.ink[0], INK1 = AP.ink[1];
    // a tentacle: tapered discs along a curling S-path; each arm sways and
    // tightens its curl on its own phase so the whole beast writhes
    const tent = (bx, by, a0, len, curlDir, phOff, front) => {
      let x = bx, y = by;
      let a = a0 + 0.22 * Math.sin(ph + phOff);
      const body = front ? INK1 : INK0;
      for (let s = 0; s < len; s++) {
        const t = s / len;
        // rise first, then curl hard at the tip — an arm reaching up and coiling
        a += curlDir * (0.02 + 0.30 * t * t) * (1 + 0.4 * Math.sin(ph + phOff + t * 2.5));
        x += Math.cos(a) * 1.8; y += Math.sin(a) * 1.8;
        const r = Math.max(1, Math.round(4 * (1 - t * 0.78)));
        disc(x, y, r, body);
        if (front && r >= 2 && s % 4 === 1)                    // wet sheen along the outer curve
          px(x + Math.cos(a - Math.PI / 2) * r, y + Math.sin(a - Math.PI / 2) * r, AP.teal[1]);
        if (front && r >= 2 && s % 4 === 3)                    // suckers down the inner face
          px(x + Math.cos(a + Math.PI / 2) * (r - 0.4), y + Math.sin(a + Math.PI / 2) * (r - 0.4), AP.teal[2]);
      }
      disc(x, y, 1, front ? AP.teal[1] : INK1);                // curled glowing tip
    };
    const my = 50 + (f === 1 ? 1 : f === 3 ? -1 : 0);          // the mantle breathes
    // four BACK arms first (darker, rearing high behind the mantle)
    tent(38, 58, -1.95, 20, -1, 0.9, false);
    tent(58, 58, -1.2, 20, 1, 2.1, false);
    tent(30, 62, -2.3, 17, -1, 3.4, false);
    tent(66, 62, -0.85, 17, 1, 4.6, false);
    // the mantle: layered dome, a cold sheen high on the crown, mottled hide
    disc(48, my, 15, INK0);
    disc(48, my - 1, 13, INK1);
    disc(44, my - 8, 5, AP.teal[0]);
    px(42, my - 10, AP.teal[1]); px(45, my - 11, AP.teal[1]);   // wet glints on the crown
    for (const [sx2, sy2] of [[40, my + 5], [55, my + 3], [50, my + 8], [57, my - 4]])
      disc(sx2, sy2, 1, INK0);                                  // mottled spots
    // burning eyes under a heavy brow, and the bone beak
    g2.fillStyle = INK0; g2.fillRect(38, my - 3, 8, 2); g2.fillRect(50, my - 3, 8, 2);
    g2.fillStyle = AP.fire[1]; g2.fillRect(39, my - 1, 5, 4); g2.fillRect(52, my - 1, 5, 4);
    g2.fillStyle = AP.fire[2]; g2.fillRect(40, my, 3, 2); g2.fillRect(53, my, 3, 2);
    g2.fillStyle = AP.bone[2]; g2.fillRect(46, my + 9, 4, 3); g2.fillRect(47, my + 12, 2, 2);
    g2.fillStyle = INK0; g2.fillRect(47, my + 11, 2, 1);        // the beak's dark hinge
    // four FRONT arms reaching up and coiling before the mantle
    tent(34, 68, -2.1, 24, -1, 0.0, true);
    tent(62, 68, -1.05, 24, 1, 1.6, true);
    tent(42, 72, -1.8, 20, -1, 2.8, true);
    tent(54, 72, -1.35, 20, 1, 4.2, true);
    // churned foam ringing the waterline, shifting each frame
    g2.fillStyle = AP.water[4];
    for (let i = 0; i < 7; i++) {
      const fx2 = 18 + i * 10 + ((f + i) % 3) * 2, fy2 = 76 + ((i * 7 + f) % 2);
      g2.fillRect(fx2, fy2, 5 + (i % 2) * 3, 2);
    }
    for (let i = 0; i < 4; i++) px(26 + i * 15 + (f * 3) % 6, 73, '#dceef4');
    return ART.outline(c);
  });

  // THE BLACK DRAGON — 192×96 (a 96×48 grid at 2px), four wing-beat frames
  // (up → mid → down → mid). A sinuous spade-tipped tail, scaled body with
  // belly plates and spine ridges, swept horns, ember eye, jaws already hot —
  // and great bat sails with membrane fingers and red sheen. Double the
  // canvas and four times the frames of the old sprite.
  Sprites.misc.dragon = [0, 1, 2, 3].map(f => {
    const c = mk(192, 96), g2 = c.getContext('2d');
    const p = (x, y, w, h, col) => { g2.fillStyle = col; g2.fillRect((x * 2) | 0, (y * 2) | 0, ((w || 1) * 2) | 0, ((h || 1) * 2) | 0); };
    const B = AP.ink[1], D = AP.ink[0], HL = AP.pelt[1];
    const bob = f === 0 ? 1 : f === 2 ? -1 : 0;                 // body sinks as the wings lift
    const BY = 24 + bob;                                        // body top line
    const tw = f * Math.PI / 2;
    // wing tips per frame: up / mid / down / mid — a full smooth beat
    const tip = [[60, -6], [68, 10], [60, 42], [68, 20]][f];
    const farTip = [[52, 36], [55, 20], [52, 6], [55, 16]][f];  // the far wing, shorter, beats in counterpoint
    const wingRoot = 34, shX = 48, shY = BY - 1;
    // a wing as a filled sail: scanline between the leading edge (shoulder->tip)
    // and the trailing edge (body root->tip), whichever way the beat folds it
    const wing = (tx, ty, main, faded) => {
      const x0 = Math.min(wingRoot, tx), x1 = Math.max(wingRoot, tx, shX);
      for (let xx = x0; xx <= x1; xx++) {
        const kL = (xx - shX) / (tx - shX), kT = (xx - wingRoot) / (tx - wingRoot);
        if (kT < 0 || kT > 1) continue;
        const trailY = BY + 1 + (ty + 6 - (BY + 1)) * Math.pow(Math.max(0, kT), 1.25);
        const leadY = kL >= 0 && kL <= 1 ? shY + (ty - shY) * kL : BY - 1;
        const y0 = Math.min(leadY, trailY), y1 = Math.max(leadY, trailY);
        p(xx, y0, 1, Math.max(1, y1 - y0), faded ? D : B);
        if (!faded && kL >= 0 && kL <= 1) p(xx, leadY - 1, 1, 1.5, B);       // thick leading edge
      }
      if (!faded) {
        for (const ftK of [0.35, 0.6, 0.82, 1]) {               // finger bones through the sail
          const fx2 = shX + (tx - shX) * ftK, fy2 = shY + (ty - shY) * ftK;
          const kT = (fx2 - wingRoot) / (tx - wingRoot);
          const trailY = BY + 1 + (ty + 6 - (BY + 1)) * Math.pow(Math.max(0, kT), 1.25);
          const y0 = Math.min(fy2, trailY), y1 = Math.max(fy2, trailY);
          p(fx2, y0, 1, Math.max(1, y1 - y0), D);
        }
        for (let k = 2; k <= 8; k++) {                          // blood-sheen veins in the membrane
          const fx2 = shX + (tx - shX) * (k / 10), fy2 = shY + (ty - shY) * (k / 10);
          if ((k % 3) === 2) p(fx2, (fy2 + BY) / 2, 1, 1, AP.red[0]);
        }
      }
    };
    // ---- FAR WING first, behind everything ----
    wing(farTip[0], farTip[1], D, true);
    // ---- tail: a sinuous curve out to a spade tip, lashing with the beat ----
    for (let i = 0; i < 26; i++) {
      const tx2 = 30 - i, yy = BY + 3 + Math.sin(i * 0.22 + tw) * (2 + i * 0.16);
      const th = Math.max(1, 3 - (i / 10) | 0);
      p(tx2, yy, 1, th, i % 5 === 4 ? D : B);
      if (i % 6 === 2) p(tx2, yy - 1, 1, 1, D);                 // dorsal barbs down the tail
    }
    const spY = BY + 3 + Math.sin(26 * 0.22 + tw) * (2 + 26 * 0.16);
    p(3, spY - 2, 2, 5, B); p(2, spY - 1, 1, 3, B); p(4, spY, 1, 1, D);   // the spade
    // ---- body: deep chest, scale rows, lighter belly plates ----
    p(30, BY, 32, 7, B);
    p(32, BY - 1, 26, 1, B);                                    // shoulder hump
    for (let i = 0; i < 8; i++) p(33 + i * 4, BY + 1 + (i % 2), 2, 1, D);      // scale rows
    for (let i = 0; i < 7; i++) p(34 + i * 4, BY + 3 + ((i + 1) % 2), 2, 1, D);
    p(31, BY + 6, 30, 1, HL);                                   // belly plates catching light
    for (let i = 0; i < 10; i++) p(32 + i * 3, BY + 6, 1, 1, '#8a7050');
    for (let i = 0; i < 6; i++) p(33 + i * 5, BY - 2, 1, 1, D); // spine ridges
    // ---- legs tucked for flight, claws trailing ----
    p(40, BY + 7, 3, 2, D); p(39, BY + 9, 1, 1, D); p(42, BY + 9, 1, 1, D);
    p(54, BY + 7, 3, 2, D); p(53, BY + 9, 1, 1, D); p(56, BY + 9, 1, 1, D);
    // ---- neck: a thick smooth S rising to the head ----
    for (let i = 0; i < 12; i++) {
      const nx = 61 + i * 1.6, ny = BY - 1 - i * 0.85;
      p(nx, ny, 3.5, 4, B);
    }
    for (let i = 0; i < 4; i++) p(63 + i * 4, BY - 3.4 - i * 2, 1, 1, D);   // neck ridge
    // ---- head: brow, hot jaws, swept horns, ember eye ----
    p(79, BY - 13, 8, 4, B);                                    // skull + heavy brow
    p(86, BY - 12, 5, 2, B);                                    // muzzle
    p(86, BY - 9.5, 4, 1.5, B);                                 // lower jaw, slightly open
    p(86.5, BY - 10.2, 2.5, 1, AP.fire[1]);                     // heat inside the jaws
    p(78, BY - 15, 2, 3, D); p(81, BY - 17, 2, 5, D);           // horns swept back
    p(76, BY - 14, 2, 2, D);
    p(84, BY - 12, 1.5, 1.5, AP.fire[2]);                       // the ember eye
    p(84, BY - 12, 1, 1, AP.fire[3] || '#ffd28a');
    p(90, BY - 11.5, 1, 1, AP.fire[1]);                         // nostril heat
    // ---- NEAR WING over the body ----
    wing(tip[0], tip[1], B, false);
    p(shX - 2, shY - 2, 5, 4, B);                               // the wing shoulder
    return ART.outline(c);
  });

  // THE BURIED CACHE (special event): a freshly-dug pit with an oaken chest
  // thrown open — gold and goods spilling, a spade still standing in the
  // spoil-heap. Two frames blink the treasure's glint. Fine grid, outlined.
  Sprites.misc.cache = [0, 1].map(f => ART.outline(tile(p => {
    const q = p.f;
    // the dug pit and the thrown spoil
    q(6, 22, 20, 6, AP.soil[0]);
    q(4, 24, 24, 4, AP.soil[1]);
    q(22, 18, 8, 5, AP.soil[2]); q(24, 16, 5, 3, AP.soil[1]);   // spoil heap
    // the chest, lid thrown back
    q(8, 14, 12, 8, AP.wood[1]); q(8, 14, 12, 1, AP.wood[3]);
    q(8, 14, 1, 8, AP.wood[2]); q(13, 14, 1, 8, AP.wood[0]);    // planks + banding
    q(7, 9, 14, 4, AP.wood[2]); q(7, 9, 14, 1, AP.wood[3]);     // the open lid
    q(13, 9, 1, 4, AP.wood[0]);
    // the hoard inside: gold heaped, a red gem, a silver torc
    q(9, 15, 10, 3, AP.gold[1]);
    q(10, 14, 8, 2, AP.gold[2]);
    q(12, 13, 3, 2, AP.gold[2]);
    q(15, 14, 2, 1, AP.red[1] || '#c04040');
    q(10, 15, 2, 1, '#d8dde4');
    // the spade in the spoil-heap
    q(26, 8, 1, 10, AP.wood[2]); q(25, 6, 3, 3, AP.stone[3]); q(25, 6, 3, 1, AP.stone[4]);
    // the glint — blinking between frames so it catches the eye
    if (f === 0) { q(11, 13, 1, 1, '#fff2c0'); q(16, 15, 1, 1, '#fff2c0'); }
    else { q(14, 12, 1, 1, '#fff2c0'); q(9, 16, 1, 1, '#fff2c0'); q(27, 5, 1, 1, '#fff2c0'); }
  })));

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
  //
  // ANIMATION (tests/wild-life.mjs): every pose is a cycle of FOUR OR MORE
  // frames driven by a CONTINUOUS phase rather than a two-still flip — the legs
  // travel through swing and stance (hoof lifted on the swing, planted on the
  // push), the barrel bobs twice a stride, the head nods, the tail swishes.
  // Frame counts live in BEAST_POSE and the playback rate per kind in
  // Sprites.animFps (read by R.unitSprite); both can be raised without touching
  // a line of the drawing code.
  const TAU = Math.PI * 2;
  const BEAST_POSE = { idle: 6, walk: 8, fight: 4 };
  Sprites.animFps = { wolf: 8, boar: 7, bear: 6, deer: 8, cow: 6 };
  // ramp = [dark, mid, light]
  function beast(name, ramp, opts) {
    const w = opts.w, h = opts.h;
    const bx = 6, byb = 24, byt = byb - h;                    // body box
    const dark = ramp[0], mid = ramp[1], lite = ramp[2] || ramp[1];
    const BN = AP.bone[2], INK = AP.ink[0];
    const LEG = 6;
    const draw = (q, ph, pose) => {
      const walking = pose === 'walk', fighting = pose === 'fight';
      // ---- carriage: how the animal is holding itself THIS frame ----
      let bob = 0, hdx = 0, hdy = 0, tail = 0, ear = 0, maw = false, graze = false;
      if (walking) {
        bob = Math.sin(ph * TAU * 2) > 0.35 ? -1 : 0;         // rises twice a stride
        hdy = Math.sin(ph * TAU) > 0.45 ? 1 : 0;              // the nod that comes with it
        tail = Math.round(Math.sin(ph * TAU * 2));
      } else if (fighting) {
        const push = Math.round(Math.sin(ph * TAU) * 3);      // crouch → lunge → strike → recover
        bob = push > 1 ? -1 : 0;
        hdx = push; hdy = push > 1 ? 1 : 0;
        maw = push > 0;
        tail = Math.round(Math.cos(ph * TAU));
      } else if (opts.grazes) {
        // GRAZING: the head reaches DOWN AND FORWARD into the grass for most of
        // the cycle, jaw working, then comes up for a look round — the loop that
        // makes a standing herd read as feeding rather than waiting
        const down = ph < 0.68;
        graze = down;
        hdy = down ? 5 + (Math.sin(ph * TAU * 5) > 0 ? 1 : 0) : 0;
        hdx = down ? 3 : 0;
        tail = Math.round(Math.sin(ph * TAU));
        ear = down ? 0 : 1;
      } else {
        bob = Math.sin(ph * TAU) > 0.6 ? -1 : 0;              // breathing
        hdy = ph > 0.38 && ph < 0.62 ? 1 : 0;                 // a low sniff at the ground
        hdx = ph > 0.82 ? 1 : 0;                              // then the head cranes round
        tail = Math.round(Math.sin(ph * TAU * 2));
        ear = ph > 0.66 && ph < 0.86 ? 1 : 0;                 // an ear flicks
      }
      q(bx - 1, byb + 6, w + 5, 2, 'rgba(20,16,10,0.26)');    // contact shadow
      // a single leg: hip at the barrel (which bobs), hoof on the ground
      const leg = (lx, p, shade) => {
        const top = byb + bob, foot = byb + LEG;
        if (!walking && !fighting) { q(lx, top, 2, foot - top, shade); q(lx, foot, 2, 1, INK); return; }
        const sw = Math.sin(p * TAU);
        const dx = Math.round(sw * 2);                        // forward on the swing, back on the push
        const lift = sw > 0 ? Math.round(sw * 2) : 0;         // the hoof clears the ground
        const thigh = 3, cannon = Math.max(1, foot - lift - (top + thigh));
        q(lx, top, 2, thigh, shade);
        q(lx + dx, top + thigh, 2, cannon, shade);
        q(lx + dx, top + thigh + cannon, 2, 1, INK);
      };
      // diagonal pairs move together (a trot); the offside pair goes first, one shade down
      const gp = fighting ? ph * 2 : ph;
      leg(bx + 2, gp, dark); leg(bx + w - 5, gp + 0.5, dark);
      // tail
      const ty0 = byt + bob + 1;
      if (opts.tail) {
        if (opts.bushy) { q(bx - 2, ty0, 2, 5, mid); q(bx - 3 + tail, ty0 + 1, 1, 3, dark); q(bx - 2, ty0, 1, 2, lite); }
        else { const tl = opts.longtail ? 6 : 3; q(bx - 1, ty0, 1, tl - 1, dark); q(bx - 1 + tail, ty0 + tl - 1, 1, 1, dark); }
      }
      // body
      ART.shadedRect(q, bx, byt + bob, w, h, ramp, 1);
      if (opts.hump) { q(bx + 1, byt + bob - 2, 5, 2, mid); q(bx + 1, byt + bob - 2, 4, 1, lite); }   // shoulder hump
      if (opts.spots) { q(bx + 2, byt + bob + 1, 3, 2, opts.spots); q(bx + w - 6, byt + bob + 2, 3, 2, opts.spots); q(bx + 5, byt + bob + h - 2, 2, 1, opts.spots); }
      // neck + head at the front (right) — both follow the carriage
      const hx = bx + w - 1 + hdx, hy = byt - 1 + bob + hdy;
      // the neck follows the head WHEREVER it goes — laid down the line from the
      // shoulder to the head's root, so a grazing animal reaches into the grass
      // instead of parting company with its own skull
      {
        const sx = bx + w - 3, sy = byt + bob, rx = hx - 1, ry = hy + 1;
        const steps = Math.max(Math.abs(rx - sx), Math.abs(ry - sy), 1);
        for (let i = 0; i <= steps; i++)
          q(Math.round(sx + (rx - sx) * i / steps), Math.round(sy + (ry - sy) * i / steps), 3, 3, mid);
      }
      q(hx, hy, 6, h - 1, mid); q(hx, hy, 6, 1, lite);        // head block, lit top
      q(hx + 5, hy + 2, 2, 2, opts.snout || dark);            // muzzle
      q(hx + 6, hy + 3, 1, 1, INK);                           // nostril
      q(hx + 3, hy + 1, 1, 1, INK);                           // eye
      // ears / horns / antlers / tusks
      if (opts.ears) { q(hx, hy - 2 - ear, 1, 2, mid); q(hx + 3, hy - 2, 2, 2, mid); q(hx + 3, hy - 2, 1, 1, lite); }
      if (opts.horns) { q(hx - 1, hy - 2, 1, 2, BN); q(hx + 5, hy - 2, 1, 2, BN); q(hx - 1, hy - 3, 3, 1, BN); }
      if (opts.antlers) {
        q(hx + 1, hy - 5, 1, 5, BN); q(hx + 4, hy - 5, 1, 5, BN);        // main beams
        q(hx, hy - 4, 1, 2, BN); q(hx + 2, hy - 6, 1, 2, BN);            // tines
        q(hx + 3, hy - 6, 1, 2, BN); q(hx + 5, hy - 4, 1, 2, BN);
      }
      if (opts.tusk) { q(hx + 5, hy + 4, 2, 1, BN); q(hx + 6, hy + 3, 1, 1, BN); }
      if (opts.mane) { q(hx - 1, hy - 1, 2, h + 1, dark); }             // scruff at the neck
      if (maw) { q(hx + 5, hy + 3, 2, 1, AP.red[2]); q(hx + 6, hy + 2, 1, 1, BN); }   // open maw + fang
      // near (onside) legs in front of the body
      leg(bx + 3, gp + 0.5, mid); leg(bx + w - 4, gp, mid);
    };
    const cycle = (pose) => {
      const n = BEAST_POSE[pose], out = [];
      for (let f = 0; f < n; f++) out.push(tileU(q => draw(q, f / n, pose)));
      return out;
    };
    Sprites.unit[name] = { idle: cycle('idle'), walk: cycle('walk'), fight: cycle('fight') };
  }
  beast('wolf', [AP.pelt[0], AP.pelt[1], AP.pelt[2]], { w: 15, h: 6, ears: true, tail: true, bushy: true, mane: true });
  beast('boar', [AP.hide[0], AP.hide[1], AP.hide[2]], { w: 16, h: 8, tusk: true, tail: true, mane: true });
  // the bear: rare, huge, dark — a humped silhouette a head taller than a boar
  beast('bear', [AP.rust[0], AP.hide[0], AP.hide[1]], { w: 18, h: 10, ears: true, hump: true, snout: AP.hide[2] });
  beast('deer', ['#7a5430', '#a87848', '#c89868'], { w: 13, h: 6, ears: true, tail: true, antlers: true, grazes: true });
  beast('cow', ['#8a8078', '#d8d0c4', '#f0ece2'], { w: 16, h: 8, ears: true, tail: true, longtail: true, horns: true, spots: '#5a4a3a', grazes: true });

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
