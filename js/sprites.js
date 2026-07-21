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
  // returns a canvas + a plot fn working on the 16-grid (2px per cell)
  function tile(draw) {
    const c = mk(32, 32), g = c.getContext('2d');
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
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
  function framesU(n, draw) {
    const out = [];
    for (let f = 0; f < n; f++) { const c = tileU((q, g) => draw(q, g, f)); ART.outline(c, 2); out.push(c); }
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

  function grassBase(p, seed) {
    p(0, 0, 16, 16, AP.grass[3]);
    const r = ART.rng(seed);
    for (let i = 0; i < 10; i++) p((r() * 16) | 0, (r() * 16) | 0, 1, 1, AP.grass[2]);
    for (let i = 0; i < 6; i++) p((r() * 16) | 0, (r() * 16) | 0, 1, 1, AP.grass[4]);
    for (let i = 0; i < 4; i++) {                       // blade tufts
      const x = 1 + (r() * 14) | 0, y = 2 + (r() * 13) | 0;
      p(x, y, 1, 2, AP.grass[1]); p(x + 1, y + 1, 1, 1, AP.grass[4]);
    }
    for (let i = 0; i < 3; i++) p((r() * 16) | 0, (r() * 16) | 0, 1, 1, AP.grass[1]);
  }
  Sprites.terrain[T.GRASS] = [
    tile(p => grassBase(p, 3)), tile(p => grassBase(p, 77)),
    tile(p => grassBase(p, 129)), tile(p => grassBase(p, 211)),
  ];
  // rare flower meadows — drawTile rolls these on ~3% of grass tiles
  function flowers(p, seed) {
    grassBase(p, seed);
    const r = ART.rng(seed + 1);
    for (let i = 0; i < 4; i++) {
      const x = 1 + (r() * 13) | 0, y = 1 + (r() * 13) | 0;
      const col = AP.bloom[(r() * 3) | 0];
      p(x, y, 1, 1, col); p(x + 1, y, 1, 1, col === AP.bloom[2] ? AP.bloom[1] : col);
      p(x, y + 1, 1, 1, AP.grass[1]);
    }
  }
  Sprites.terrainRare = { [T.GRASS]: [tile(p => flowers(p, 301)), tile(p => flowers(p, 407))] };

  // forest: overlapping canopy crowns that overhang the tile edge, trunk shadows
  function forestTile(p, seed, log) {
    grassBase(p, seed);
    const r = ART.rng(seed + 2);
    p(4, 6, 2, 1, AP.leaf[0]); p(11, 11, 2, 1, AP.leaf[0]);        // trunk shadows
    ART.foliageCluster(p, 3 + (r() * 3) | 0, 3, 4, seed);
    ART.foliageCluster(p, 11 + (r() * 3) | 0, 8 + (r() * 2) | 0, 4, seed + 9);
    ART.foliageCluster(p, 4, 12, 3, seed + 17);
    if (log) {                                                      // fallen log
      p(8, 14, 6, 1, AP.wood[1]); p(8, 13, 6, 1, AP.wood[3]); p(13, 13, 1, 1, AP.wood[4]);
    }
  }
  Sprites.terrain[T.FOREST] = [
    tile(p => forestTile(p, 11)), tile(p => forestTile(p, 23)),
    tile(p => forestTile(p, 149, true)),
  ];

  // water: [0] = shallow (near land, lighter), [1] = deep interior
  function waterTile(p, seed, deep) {
    const base = deep ? AP.water[1] : AP.water[2];
    p(0, 0, 16, 16, base);
    const r = ART.rng(seed);
    for (let i = 0; i < 5; i++) p((r() * 16) | 0, (r() * 16) | 0, 1, 1, deep ? AP.water[0] : AP.water[1]);
    for (let i = 0; i < 3; i++) {                                   // static wave dashes
      const x = (r() * 12) | 0, y = 2 + (r() * 12) | 0;
      p(x, y, 3, 1, deep ? AP.water[2] : AP.water[3]);
    }
  }
  Sprites.terrain[T.WATER] = [
    tile(p => waterTile(p, 9, false)),
    tile(p => waterTile(p, 57, true)),
  ];

  // hills: clustered shaded boulders, grass poking between, dark base rim
  Sprites.terrain[T.HILLS] = [
    tile(p => {
      grassBase(p, 31);
      p(2, 11, 8, 1, AP.stone[0]);                                  // elevation rim
      ART.shadedCircle(p, 5, 8, 3, AP.stone, 2);
      ART.shadedCircle(p, 11, 11, 2, AP.stone, 1);
      ART.shadedCircle(p, 12, 5, 2, AP.stone, 2);
      p(8, 12, 1, 1, AP.grass[4]); p(3, 5, 1, 1, AP.grass[4]);      // grass pokes through
      p(4, 7, 1, 1, AP.stone[4]); p(11, 4, 1, 1, AP.stone[4]);      // glints
    }),
    tile(p => {
      grassBase(p, 87);
      p(6, 13, 8, 1, AP.stone[0]);
      ART.shadedCircle(p, 10, 9, 3, AP.stone, 2);
      ART.shadedCircle(p, 4, 5, 2, AP.stone, 2);
      ART.shadedCircle(p, 4, 11, 2, AP.stone, 1);
      p(7, 6, 1, 1, AP.grass[4]); p(13, 12, 1, 1, AP.grass[4]);
      p(9, 8, 1, 1, AP.stone[4]);
    }),
  ];

  // wild fertile ground: fruit orchards and berry thickets, mixed across the
  // map — the village forages these long before it tills its first farm
  function orchardTile(p, seed) {
    grassBase(p, seed);
    const r = ART.rng(seed + 5);
    const fruitTree = (cx, cy, s2) => {
      p(cx, cy + 2, 1, 3, AP.wood[1]);                              // trunk
      p(cx - 1, cy + 4, 3, 1, AP.leaf[0]);                          // canopy shadow
      ART.foliageCluster(p, cx, cy, 2, s2);
      const fr = ART.rng(s2 + 1);
      for (let i = 0; i < 3; i++)                                   // ripe fruit in the crown
        p(cx - 1 + ((fr() * 3) | 0), cy - 1 + ((fr() * 3) | 0), 1, 1, AP.red[2]);
    };
    fruitTree(4, 3 + ((r() * 2) | 0), seed + 11);
    fruitTree(11, 9 + ((r() * 2) | 0), seed + 23);
    p(6, 12, 1, 1, AP.red[1]); p(13, 5, 1, 1, AP.red[2]);           // windfall fruit
  }
  function berryTile(p, seed) {
    grassBase(p, seed);
    const r = ART.rng(seed + 7);
    const bush = (cx, cy, s2) => {
      p(cx - 1, cy + 2, 4, 1, AP.leaf[0]);                          // ground shadow
      ART.shadedCircle(p, cx, cy, 2, AP.leaf, 1);
      const br = ART.rng(s2);
      for (let i = 0; i < 4; i++)                                   // clustered berries
        p(cx - 1 + ((br() * 4) | 0), cy - 1 + ((br() * 3) | 0), 1, 1,
          br() < 0.5 ? AP.bloom[0] : AP.bloom[1]);
    };
    bush(4, 4 + ((r() * 2) | 0), seed + 13);
    bush(11, 7, seed + 29);
    bush(5, 11 + ((r() * 2) | 0), seed + 41);
    p(13, 13, 1, 1, AP.bloom[0]); p(2, 8, 1, 1, AP.bloom[1]);       // dropped berries
  }
  Sprites.terrain[T.FERTILE] = [
    tile(p => orchardTile(p, 17)), tile(p => berryTile(p, 53)),
    tile(p => orchardTile(p, 91)), tile(p => berryTile(p, 133)),
  ];

  // depleted terrain: felled forest, quarried-out hills, spent soil, ruins
  function drawStump(p, x, y) {
    p(x, y + 1, 3, 2, AP.wood[1]);
    p(x, y, 3, 1, AP.thatch[2]);
    p(x + 1, y, 1, 1, AP.thatch[1]);
    p(x + 2, y + 2, 1, 1, AP.wood[0]);
  }
  Sprites.terrain[T.STUMPS] = [
    tile(p => { grassBase(p, 51); drawStump(p, 2, 3); drawStump(p, 9, 8); drawStump(p, 4, 11); }),
    tile(p => { grassBase(p, 63); drawStump(p, 8, 2); drawStump(p, 3, 7); drawStump(p, 11, 11); }),
  ];
  Sprites.terrain[T.PEBBLES] = [
    tile(p => {
      grassBase(p, 57);
      ART.shadedCircle(p, 4, 6, 1, AP.stone, 2);
      ART.shadedCircle(p, 10, 9, 1, AP.stone, 1);
      p(6, 12, 2, 1, AP.stone[2]); p(12, 4, 1, 1, AP.stone[3]);
      p(2, 12, 3, 2, AP.stone[1]); p(2, 12, 3, 1, AP.stone[2]);     // spent slab
    }),
  ];
  Sprites.terrain[T.BARREN] = [
    tile(p => {
      ART.dither(p, 0, 0, 16, 16, AP.soil[3], AP.soil[2]);
      const r = ART.rng(71);
      for (let i = 0; i < 8; i++) p((r() * 16) | 0, (r() * 16) | 0, 1, 1, AP.soil[1]);
      p(2, 4, 5, 1, AP.soil[0]); p(6, 5, 1, 3, AP.soil[0]);         // cracks
      p(10, 9, 4, 1, AP.soil[0]); p(9, 11, 1, 3, AP.soil[0]);
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
  Sprites.terrain[T.MOUNTAIN] = [
    tile(p => {
      ART.dither(p, 0, 0, 16, 16, AP.stone[1], AP.stone[0]);
      ART.shadedCircle(p, 5, 9, 4, AP.stone, 1);
      p(4, 5, 4, 2, AP.stone[3]); p(5, 3, 2, 2, AP.bone[2]); p(4, 5, 1, 1, AP.bone[2]);  // snow cap
      ART.shadedCircle(p, 12, 11, 3, AP.stone, 1);
      p(11, 6, 2, 2, AP.bone[2]);
      p(3, 13, 4, 1, AP.stone[0]); p(10, 14, 4, 1, AP.stone[0]);
    }),
    tile(p => {
      ART.dither(p, 0, 0, 16, 16, AP.stone[1], AP.stone[0]);
      ART.shadedCircle(p, 10, 9, 4, AP.stone, 1);
      p(9, 4, 3, 2, AP.stone[3]); p(10, 2, 2, 2, AP.bone[2]);
      ART.shadedCircle(p, 3, 11, 3, AP.stone, 1);
      p(3, 8, 1, 1, AP.bone[2]);
    }),
  ];
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
  // ground color per terrain — render.js dithers these along biome borders
  Sprites.blendCol = {
    [T.GRASS]: AP.grass[3], [T.FOREST]: AP.grass[2], [T.HILLS]: AP.grass[3],
    [T.FERTILE]: AP.grass[3], [T.STUMPS]: AP.grass[3], [T.PEBBLES]: AP.grass[3],
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
    farm(p, lv) {
      const d = ART.tierDress(lv);
      const crop = lv >= 3 ? AP.gold[2] : AP.grass[4];
      ART.shadedRect(p, 0, 0, 16, 16, AP.soil, 2);
      for (let i = 0; i < 5; i++) {                                 // tilled crop rows
        p(1, 2 + i * 3, 14, 1, AP.soil[1]);
        for (let x = 1 + (i & 1); x < 15; x += 2) p(x, 3 + i * 3, 1, 1, crop);
        if (lv >= 2) for (let x = 2 - (i & 1); x < 15; x += 4) p(x, 2 + i * 3, 1, 1, lv >= 3 ? AP.gold[3] : AP.grass[2]);
      }
      wallBody(p, 11, 1, 5, 4, d, 3); roof(p, 10, 0, 6, 2, d, 4);   // shed
      if (d.decor >= 1) { p(0, 0, 1, 16, AP.wood[2]); p(15, 0, 1, 16, AP.wood[2]); }  // fence
      if (d.decor >= 2) { p(3, 8, 1, 3, AP.wood[2]); p(2, 8, 3, 1, AP.thatch[2]); p(3, 7, 1, 1, AP.ink[1]); } // scarecrow
    },
    lodge(p, lv) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 8, 14, 11);
      ART.shadedRect(p, 4, 6, 8, 7, AP.hide, 1);                    // hide tent
      p(5, 5, 6, 1, AP.hide[1]); p(6, 4, 4, 1, AP.hide[2]); p(7, 3, 2, 1, AP.hide[3]);
      p(7, 9, 2, 4, AP.ink[0]);                                     // entrance
      p(5, 2, 1, 2, AP.bone[2]); p(4, 1, 1, 1, AP.bone[2]);         // antlers
      p(10, 2, 1, 2, AP.bone[2]); p(11, 1, 1, 1, AP.bone[2]);
      if (d.decor >= 1) {                                           // drying rack with catch
        p(13, 8, 1, 5, AP.wood[2]); p(15, 8, 1, 5, AP.wood[2]); p(13, 8, 3, 1, AP.wood[3]);
        p(13, 9, 1, 2, AP.red[1]); p(15, 9, 1, 2, AP.hide[2]);
      }
      if (d.decor >= 2) { wallBody(p, 0, 8, 3, 5, d, 8); roof(p, 0, 7, 3, 2, d, 8); } // smokehouse
    },
    lumber(p, lv) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 6, 13, 10);
      for (let i = 0; i < 3; i++) {                                 // stacked logs with ring ends
        const y = 10 - i * 2;
        p(2, y, 8, 2, i % 2 ? AP.wood[3] : AP.wood[2]);
        p(2, y, 8, 1, i % 2 ? AP.wood[4] : AP.wood[3]);
        p(2, y, 1, 2, AP.thatch[2]); p(9, y, 1, 2, AP.thatch[1]);
      }
      ART.shadedCircle(p, 12, 11, 2, AP.wood, 2);                   // chopping stump
      p(12, 6, 1, 4, AP.wood[2]); p(11, 5, 3, 1, AP.stone[3]);      // axe
      if (d.decor >= 1) roof(p, 1, 2, 10, 2, d, 5);                 // lean-to over the pile
      if (d.decor >= 2) { ART.stoneTexture(p, 11, 1, 5, 3, 7); p(11, 1, 5, 1, AP.stone[3]); } // stone store
    },
    quarry(p, lv) {
      const d = ART.tierDress(lv);
      ART.stoneTexture(p, 0, 0, 16, 16, 11);
      ART.shadedRect(p, 3, 3, 10, 10, AP.stone, 1);                 // stepped pit
      p(5, 5, 6, 6, AP.stone[0]);
      p(6, 6, 4, 4, AP.ink[1]);                                     // deep cut
      p(2, 12, 3, 2, AP.stone[3]); p(2, 12, 3, 1, AP.stone[4]);     // cut blocks
      p(11, 2, 3, 2, AP.stone[3]); p(11, 2, 3, 1, AP.stone[4]);
      if (d.decor >= 1) {                                           // crane pole + rope
        p(7, 1, 1, 7, AP.wood[2]); p(7, 1, 6, 1, AP.wood[2]);
        p(12, 2, 1, 3, AP.thatch[1]); p(11, 5, 3, 1, AP.wood[3]);
      }
      if (d.decor >= 2) { p(0, 0, 16, 1, AP.wood[2]); p(0, 15, 16, 1, AP.wood[2]); } // timber shoring
    },
    // small dwelling — 1×1, but crafted: fine-grid doorway with depth, footing
    // stones, framed windows, a clay pot and grass at the base
    house(p, lv) {
      const d = ART.tierDress(lv), q = p.hi;
      ART.dropShadow(p, 8, 14, 10);
      const h = 5 + Math.min(2, lv - 1), y = 13 - h;
      wallBody(p, 4, y, 8, h, d, lv * 3);                           // walls (fine posts/quoins via helper)
      roof(p, 3, y - 3, 10, 3, d, lv * 5);                          // roof (fine eave via helper)
      q(6, (y - 3) * 2, 20, 1, d.mat === 'stonefoot' ? AP.wood[4] : AP.thatch[3]); // lit ridge line
      for (let sx = 9; sx < 23; sx += 3) { q(sx, 24, 2, 2, AP.stone[(sx & 2) ? 2 : 1]); q(sx, 24, 2, 1, AP.stone[3]); } // footing stones
      q(13, 19, 6, 1, AP.wood[3]);                                  // door lintel
      q(14, 20, 4, 6, AP.ink[0]);                                  // deep doorway
      q(13, 20, 1, 6, AP.wood[2]); q(18, 20, 1, 6, AP.wood[2]);    // jambs
      q(14, 25, 4, 1, AP.soil[3]);                                 // threshold
      if (d.decor >= 1) { q(9, y * 2 + 2, 3, 3, AP.ink[1]); q(9, y * 2 + 2, 3, 1, AP.wood[3]); q(10, y * 2 + 2, 1, 3, AP.wood[2]); } // framed window
      if (d.decor >= 2) { q(20, y * 2 + 2, 3, 3, AP.ink[1]); q(20, y * 2 + 2, 3, 1, AP.wood[3]); q(21, y * 2 + 2, 1, 3, AP.wood[2]); } // second window
      q(21, 23, 2, 3, AP.hide[1]); q(21, 23, 2, 1, AP.hide[2]); q(21, 22, 2, 1, AP.ink[1]);  // clay pot by the door
      q(7, 25, 1, 2, AP.grass[4]); q(6, 26, 1, 1, AP.grass[3]);    // grass tuft at the base
      if (d.decor >= 2) { q(24, 25, 2, 1, AP.bloom[1]); q(25, 24, 1, 1, AP.bloom[0]); } // flowers
    },
    tower(p, lv) {
      const d = ART.tierDress(lv);
      p(4, 13, 10, 2, ART.STYLE.SHADOW); p(6, 15, 8, 1, ART.STYLE.SHADOW);  // long shadow = height
      wallBody(p, 5, 5, 6, 9, d, 17);                               // shaft
      p(5, 13, 6, 1, AP.stone[0]);                                  // footing rim
      ART.shadedRect(p, 3, 2, 10, 3, d.mat === 'wattle' ? AP.wood : AP.stone, 2); // platform
      p(4, 1, 1, 1, AP.stone[3]); p(7, 1, 1, 1, AP.stone[3]); p(11, 1, 1, 1, AP.stone[3]); // crenels
      p(7, 11, 2, 3, AP.ink[0]);                                    // door
      if (d.glow) { p(7, 0, 2, 2, AP.fire[1]); p(7, 0, 1, 1, AP.fire[2]); }  // signal fire
      else p(7, 0, 1, 2, AP.blue[2]);
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
    barracks(p, lv, fac) {
      const d = ART.tierDress(lv), q = p.hi;
      ART.dropShadow(p, 8, 14, 14);
      wallBody(p, 2, 7, 12, 7, d, 13);
      roof(p, 1, 4, 14, 3, d, 14);
      q(5, 14, 2, 13, AP.wood[0]); q(25, 14, 2, 13, AP.wood[0]);    // reinforced corner posts
      q(12, 18, 6, 9, AP.ink[0]);                                   // training-hall door
      q(11, 17, 8, 1, AP.wood[3]); q(11, 18, 1, 9, AP.wood[2]); q(18, 18, 1, 9, AP.wood[2]); // lintel + jambs
      q(8, 15, 15, 1, AP.wood[1]);                                  // weapon-rack beam
      for (const sx of [9, 12, 20, 23]) { q(sx, 11, 1, 5, AP.wood[2]); q(sx, 10, 1, 1, AP.stone[4]); } // racked spears + steel heads
      ART.shadedCircle(q, 8, 22, 3, AP.wood, 2); q(7, 22, 2, 1, fac[2]); q(8, 22, 1, 1, fac[1]); // faction shield
      ART.shadedCircle(q, 23, 22, 3, AP.hide, 2); q(23, 22, 1, 1, AP.bone[2]);                   // hide shield
      if (d.banner) banner(q, 28, 1, fac);
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
    // siege workshop: an open work-yard where a catapult takes shape beside the hut
    siege(p, lv, fac) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 8, 14, 14);
      wallBody(p, 0, 8, 6, 6, d, 25);                               // workshop hut
      roof(p, 0, 5, 7, 3, d, 26);
      p(2, 10, 2, 4, AP.ink[0]);                                    // doorway
      p(8, 12, 7, 2, AP.wood[1]); p(8, 12, 7, 1, AP.wood[2]);       // engine sled
      ART.shadedCircle(p, 9, 13, 1, AP.wood, 1);                    // wheels
      ART.shadedCircle(p, 13, 13, 1, AP.wood, 1);
      p(10, 7, 1, 5, AP.wood[3]);                                   // upright
      p(10, 7, 4, 1, AP.wood[2]); p(14, 6, 1, 2, AP.stone[2]);      // throwing arm + cup stone
      p(11, 10, 2, 2, AP.wood[0]);                                  // winch drum
      if (d.decor >= 1) { p(7, 14, 3, 1, AP.wood[2]); p(7, 13, 3, 1, AP.wood[3]); }  // seasoned timber
      if (d.decor >= 2) { ART.shadedCircle(p, 8, 4, 1, AP.stone, 2); p(10, 4, 1, 1, AP.stone[2]); }  // shot pile
      if (d.banner) banner(p, 0, 0, fac);
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
      return NO_OUTLINE.has(key) ? c : ART.outline(c, hi ? 2 : 1);
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
  }), 2);

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
  }, 128), 4);

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
  }, 128), 4);

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
  function villagerHi(q, f, pose, c) {
    const SK = APx.skin, HR = APx.hair, HD = APx.hide, INK = APx.ink;
    const body = c.body, accent = c.accent, pants = c.pants;
    const bob = (pose === 'idle' && f === 1) ? 2 : 0;
    const y = 6 + bob;                                   // head-top row (32-grid)

    // ---- contact shadow (faint — below the outline alpha threshold, so it's not ringed)
    q(12, 30, 9, 1, 'rgba(20,16,10,0.26)'); q(14, 31, 5, 1, 'rgba(20,16,10,0.15)');

    // ---- legs: hide leggings, bare shins, simple feet. Walk alternates the lead leg
    const step = pose === 'walk';
    const upL = step && f === 1 ? 1 : 0, upR = step && f === 0 ? 1 : 0;
    for (const [lx, up] of [[13, upL], [17, upR]]) {
      q(lx, 22, 2, 4 - up, pants);                       // upper leg wrap
      q(lx, 22, 1, 4 - up, HD[2]);                       // lit inner seam
      q(lx, 26 - up, 2, 2, SK[1]);                       // bare shin (shaded)
      q(lx, 26 - up, 1, 2, SK[2]);
      q(lx, 28 - up, 2, 1, INK[1]);                      // foot
    }

    // ---- torso: a dyed wrap, lit top-left / shaded lower-right, cinched by a belt
    q(12, y + 6, 8, 10, body);
    q(19, y + 6, 1, 10, accent); q(12, y + 14, 8, 2, accent);   // shade on the right & hem
    q(12, y + 6, 6, 1, body);                                   // (kept flat-lit up top)
    q(13, y + 8, 1, 6, accent); q(16, y + 9, 1, 5, accent);     // two draped folds
    q(12, y + 6, 8, 2, accent);                                 // neckline yoke (trim = faction)
    q(14, y + 6, 4, 1, body);
    q(12, y + 13, 8, 2, HD[1]); q(12, y + 13, 8, 1, HD[2]);     // leather belt + lit top edge
    q(15, y + 13, 1, 2, INK[2]);                                // belt buckle

    // ---- head: rounded, hair over crown & nape, a suggested face
    q(14, y, 4, 5, SK[2]);                                      // face
    q(14, y, 3, 1, SK[3]); q(14, y, 1, 4, SK[3]);               // top-left highlight
    q(17, y + 1, 1, 4, SK[1]);                                  // right-cheek shade
    q(13, y - 1, 6, 2, HR[1]); q(13, y - 1, 6, 1, HR[2]);       // hair crown
    q(13, y + 1, 1, 3, HR[0]); q(18, y + 1, 1, 3, HR[0]);       // side locks / nape
    q(15, y + 2, 1, 1, INK[1]); q(17, y + 2, 1, 1, INK[1]);     // eyes
    q(15, y + 3, 2, 1, SK[1]);                                  // brow/nose shadow

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
  function villagerSheet(c) {
    const mk = (pose) => framesU(2, (q, g, f) => villagerHi(q, f, pose, c));
    return {
      idle: mk('idle'), walk: mk('walk'), gather: mk('gather'),
      mine: mk('mine'), farm: mk('farm'), build: mk('build'), guard: mk('guard'),
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
  Sprites.villager = {};
  for (const name in TUNICS) {
    const t = TUNICS[name];
    Sprites.villager[name] = villagerSheet({ body: t.body, accent: t.accent, pants: '#6e5024', hair: PAL.hair });
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
    defender: { body: '#7a6242', pants: '#4a3a24', extra: (p, f) => { p(11, 2, 1, 5, PAL.trunk); p(11, 1, 1, 1, PAL.rockL); } },
    // Bronze Champion — a bronze-age heavy: crested helm, muscled cuirass, big
    // round shield and a bronze sword (thrust in the fight pose, raised at rest)
    elite:    { body: APx.gold[1], pants: '#4a3a24', noThrust: true, extra: (p, f, pose) => {
      const G = APx.gold, W = APx.wood, R = APx.red;
      p(6, 2, 4, 1, G[1]); p(7, 1, 2, 1, G[2]); p(6, 3, 1, 1, G[0]); p(9, 3, 1, 1, G[0]);   // crested bronze helmet + cheek guards
      p(7, 0, 2, 1, R[2]); p(8, 0, 1, 1, R[3]);                                              // red horsehair crest
      p(6, 9, 4, 1, G[0]); p(6, 7, 1, 2, G[2]); p(9, 7, 1, 2, G[2]);                         // cuirass belt + pauldron edges
      ART.shadedCircle(p, 4, 8, 2, G, 1); p(4, 8, 1, 1, G[3]); p(3, 8, 1, 1, W[1]);          // big round hoplite shield + boss
      if (pose === 'fight') {
        const ax = f === 0 ? 11 : 13;
        p(10, 7, Math.max(1, ax - 9), 1, PAL.skin); p(ax - 1, 7, 3, 1, W[1]);                // thrusting arm + crossguard
        p(ax, 3, 1, 4, G[2]); p(ax, 2, 1, 1, G[3]);                                          // bronze blade + tip
        if (f === 1) { p(ax + 1, 2, 1, 1, APx.fire[2]); p(ax - 1, 4, 1, 1, APx.bone[2]); }   // strike gleam
      } else { p(11, 3, 1, 5, G[2]); p(11, 2, 1, 1, G[3]); p(10, 8, 3, 1, W[1]); p(11, 9, 1, 1, W[0]); }  // sword raised at rest
    } },
    axeman:   { body: APx.hide[2], pants: APx.hide[1], extra: (p, f) => { p(11, 2, 1, 5, PAL.trunk); p(10, 1, 3, 1, APx.stone[3]); p(10, 2, 2, 1, APx.stone[2]); p(5, 5, 1, 1, APx.skin[2]); p(10, 5, 1, 1, APx.skin[2]); } },
    longbow:  { body: APx.leaf[2], pants: APx.leaf[1], extra: (p, f) => { p(12, 0, 1, 9, PAL.trunk); p(11, 0, 1, 1, PAL.trunk); p(11, 8, 1, 1, PAL.trunk); p(4, 6, 1, 3, APx.hide[1]); p(4, 5, 1, 1, APx.thatch[2]); } },
    archer:   { body: '#6a7a4a', pants: '#4a5230', extra: (p, f) => { p(12, 2, 1, 6, PAL.trunk); p(11, 2, 1, 1, PAL.trunk); p(11, 7, 1, 1, PAL.trunk); } },
    // Fire Archer — dark leather, a recurve bow with FLAMING tips, a quiver of
    // fire arrows, and a burning arrow loosed in the fight pose
    marksman: { body: APx.hide[2], pants: '#3a2c1a', noThrust: true, extra: (p, f, pose) => {
      const W = APx.wood, F = APx.fire, B = APx.bone;
      p(12, 1, 1, 7, W[1]); p(11, 1, 1, 1, W[2]); p(11, 7, 1, 1, W[2]); p(13, 3, 1, 3, W[0]);   // recurve bow stave + tips
      p(12, 0, 1, 1, F[3]); p(f ? 11 : 13, 0, 1, 1, F[1]);                                       // top flaming tip (flickers)
      p(12, 8, 1, 1, F[3]); p(f ? 13 : 11, 8, 1, 1, F[1]);                                       // bottom flaming tip
      p(5, 5, 1, 4, W[0]); p(5, 4, 1, 1, B[2]); p(4, 4, 1, 1, F[2]);                             // quiver of fire arrows on the back
      if (pose === 'fight') {
        if (f === 0) { p(9, 5, 3, 1, B[2]); p(8, 5, 1, 1, F[3]); }                               // arrow nocked, drawn back, flaming head
        else { p(13, 5, 3, 1, B[2]); p(15, 5, 1, 1, F[3]); p(14, 4, 1, 1, F[1]); }               // loosed — streaking fire
      }
    } },
  };
  const RIDERS = {
    rider:       { horse: '#a87848', horseD: '#7a5430', body: '#7a6242' },
    horsearcher: { horse: APx.hide[3], horseD: APx.hide[1], body: APx.leaf[2], bow: true },
    lancer:      { horse: '#8a8078', horseD: '#5d5d64', body: '#8a7248', tip: PAL.gold },
  };
  Sprites.military = {};                                    // tunic -> { defender, elite, …, warship }
  Sprites.militaryFor = function (tunic) {
    if (Sprites.military[tunic]) return Sprites.military[tunic];
    const acc = (TUNICS[tunic] || TUNICS.blue).body;        // the bright tunic hue = the identifying collar
    const set = {};
    for (const k in FOOT) set[k] = unitSheet({ body: FOOT[k].body, accent: acc, pants: FOOT[k].pants, hair: PAL.hair, spear: PAL.trunk, noThrust: FOOT[k].noThrust }, FOOT[k].extra);
    for (const k in RIDERS) set[k] = riderSheet({ horse: RIDERS[k].horse, horseD: RIDERS[k].horseD, body: RIDERS[k].body, accent: acc, bow: RIDERS[k].bow, tip: RIDERS[k].tip });
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
  function fishboatSheet() {
    const draw = (p, f, pose) => {
      const y = 8 + (f === 1 ? 1 : 0);
      p(3, y + 4, 10, 1, 'rgba(0,0,0,0.25)');
      p(3, y + 1, 10, 2, PAL.wood); p(4, y + 3, 8, 1, PAL.woodD);   // hull
      p(2, y + 1, 1, 1, PAL.woodD); p(13, y + 1, 1, 1, PAL.woodD);  // prow / stern
      p(6, y - 2, 2, 3, '#6e5b40');                                 // fisher
      p(6, y - 4, 2, 2, PAL.skin); p(6, y - 5, 2, 1, PAL.hair);
      if (pose === 'gather') {
        p(8, y - 2, 3, 1, PAL.skin); p(11, y - 3, 1, 1, PAL.trunk); // rod
        p(12, y - 2, 1, 4, '#c8d8e0');                              // line to water
      } else {
        p(4, y, 1, 2, PAL.trunk); p(11, y, 1, 2, PAL.trunk);        // oars
      }
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, f, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      gather: frames(2, (p, g, f) => draw(p, f, 'gather')),
    };
  }
  // warship sheet: bigger hull, mast and sail, archer on deck
  function warshipSheet(c) {
    const draw = (p, f, pose) => {
      const y = 10 + (f === 1 ? 1 : 0);
      p(2, y + 3, 12, 1, 'rgba(0,0,0,0.25)');
      p(2, y, 12, 3, c.hull); p(3, y + 2, 10, 1, c.hullD);          // hull
      p(1, y, 1, 2, c.hullD); p(14, y, 1, 2, c.hullD);
      p(8, y - 9, 1, 9, PAL.trunk);                                 // mast
      p(9, y - 8, 5, 6, c.sail);                                    // sail
      p(9, y - 6, 5, 1, c.stripe);                                  // painted stripe
      p(9, y - 8, 5, 1, c.sailD);
      p(4, y - 2, 2, 2, c.crew);                                    // archer on deck
      p(4, y - 4, 2, 2, PAL.skin); p(4, y - 5, 2, 1, PAL.hair);
      if (pose === 'fight') {
        p(2, y - 4, 1, 4, PAL.trunk); p(1, y - 3, 1, 1, PAL.trunk); // bow
        p(3, y - 3, 2, 1, c.arrow);                                 // nocked arrow
        if (c.flame) { p(2, y - 5, 1, 1, PAL.fireL); p(3, y - 4, 1, 1, PAL.fire); }
      }
      if (c.flame) { p(11, y - 1, 2, 2, PAL.fire); p(11, y - 2, 1, 1, PAL.fireL); } // fire brazier
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, f, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      fight: frames(2, (p, g, f) => draw(p, f, 'fight')),
    };
  }
  Sprites.unit.fishboat = fishboatSheet();
  // warship's sail stripe is dyed per village (built in Sprites.militaryFor);
  // Sprites.unit.warship holds the blue fallback set there
  Sprites.unit.fireship = warshipSheet({ hull: '#5d4a30', hullD: '#453722', sail: '#b8b0a0', sailD: '#98907e',
    stripe: PAL.fire, crew: '#5d4a30', arrow: PAL.fire, flame: true });

  // troop transports: broad open hulls built to carry soldiers, not fight.
  // The war transport is longer, with a hide canopy and a shield row.
  function transportSheet(big) {
    const draw = (p, f) => {
      const y = 10 + (f === 1 ? 1 : 0);
      const x0 = big ? 1 : 2, w = big ? 14 : 12;
      p(x0, y + 3, w, 1, 'rgba(0,0,0,0.25)');                       // waterline shadow
      p(x0, y, w, 3, APx.wood[2]);                                  // hull
      p(x0, y, w, 1, APx.wood[3]);                                  // lit gunwale
      p(x0 + 1, y + 2, w - 2, 1, APx.wood[1]);                      // wet strake
      p(x0 - 0, y, 1, 2, APx.wood[1]); p(x0 + w - 1, y, 1, 2, APx.wood[1]);  // prow / stern posts
      p(x0 + 1, y - 1, w - 2, 1, APx.wood[3]);                      // deck rail
      p(x0 + 2, y + 1, 1, 1, APx.wood[4]); p(x0 + w - 3, y + 1, 1, 1, APx.wood[0]);  // plank glint / knot
      if (big) {
        ART.shadedRect(p, 5, y - 4, 6, 3, AP.hide, 1);              // hide canopy amidships
        p(6, y - 5, 4, 1, AP.hide[2]);
        for (let i = 0; i < 4; i++) p(2 + i * 3, y, 1, 1, AP.bone[2]);  // shield row on the gunwale
      }
      p(x0 + w - 3, y - 2, 2, 2, '#6e5b40');                        // steersman
      p(x0 + w - 3, y - 3, 2, 1, PAL.skin);
      p(x0 + w - 1, y - 3, 1, 3, APx.wood[1]);                      // steering oar
      if (f === 1) { p(x0 - 1, y + 1, 1, 1, AP.water[4]); p(x0 + w, y + 2, 1, 1, AP.water[4]); }  // bow spray
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, f)),
      walk: frames(2, (p, g, f) => draw(p, f)),
    };
  }
  Sprites.unit.transport = transportSheet(false);
  Sprites.unit.bigtransport = transportSheet(true);

  /* ---------------- siege engines ---------------- */
  // catapult (onager): timber frame on wheels, winch, long throwing arm.
  // fight frame 1 snaps the arm upright and the boulder leaves the cup.
  function catapultSheet() {
    const draw = (p, f, pose) => {
      p(2, 14, 12, 1, 'rgba(0,0,0,0.3)');
      p(2, 11, 12, 2, APx.wood[2]); p(2, 11, 12, 1, APx.wood[3]);   // frame rails
      p(3, 10, 1, 2, APx.wood[1]); p(12, 10, 1, 2, APx.wood[1]);    // cross braces
      ART.shadedCircle(p, 3, 13, 1, AP.wood, 1);                    // wheels
      ART.shadedCircle(p, 12, 13, 1, AP.wood, 1);
      p(8, 7, 1, 4, APx.wood[1]); p(10, 7, 1, 4, APx.wood[1]);      // A-frame uprights
      p(8, 7, 3, 1, APx.wood[3]);
      p(11, 10, 2, 1, APx.wood[0]); p(13, 9, 1, 1, APx.wood[2]);    // winch + handle
      const thrown = pose === 'fight' && f === 1;
      if (thrown) {
        p(9, 3, 1, 5, APx.wood[3]);                                 // arm snapped upright
        p(8, 2, 2, 1, APx.wood[2]);                                 // empty cup
        p(6, 1, 2, 2, AP.stone[3]); p(6, 1, 1, 1, AP.stone[4]);     // boulder away!
      } else {
        p(3, 5, 1, 1, APx.wood[3]); p(4, 6, 1, 1, APx.wood[3]);     // arm cocked back
        p(5, 7, 1, 1, APx.wood[3]); p(6, 8, 1, 1, APx.wood[3]); p(7, 9, 1, 1, APx.wood[3]);
        p(2, 3, 2, 2, APx.wood[2]);                                 // cup…
        p(2, 3, 2, 1, AP.stone[2]);                                 // …loaded with stone
      }
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, 0, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      fight: frames(2, (p, g, f) => draw(p, f, 'fight')),
    };
  }
  // siege tower: a tall plank tower on wheels, ladder up the face, crenellated
  // top — rolled against a wall, soldiers stream over it
  function siegetowerSheet() {
    const draw = (p, f) => {
      const bob = f === 1 ? 1 : 0;
      p(3, 14, 10, 1, 'rgba(0,0,0,0.3)');
      ART.shadedCircle(p, 5, 13, 1, AP.wood, 1);                    // wheels
      ART.shadedCircle(p, 10, 13, 1, AP.wood, 1);
      ART.woodPlankTexture(p, 5, 3 + bob, 6, 10 - bob, 27);         // tower body
      p(4, 2 + bob, 8, 1, APx.wood[3]);                             // fighting-top floor
      p(4, 1 + bob, 1, 1, APx.wood[2]); p(7, 1 + bob, 1, 1, APx.wood[2]);  // crenels
      p(11, 1 + bob, 1, 1, APx.wood[2]);
      p(5, 3 + bob, 1, 10 - bob, APx.wood[1]); p(10, 3 + bob, 1, 10 - bob, APx.wood[1]);  // corner posts
      for (let y = 4 + bob; y < 13; y += 2) p(7, y, 2, 1, APx.thatch[1]);   // ladder rungs
      p(6, 12, 4, 2, APx.wood[0]);                                  // dark base carriage
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, 0)),
      walk: frames(2, (p, g, f) => draw(p, f)),
    };
  }
  // ballista: a giant crossbow on a wheeled frame — the unit-killer
  function ballistaSheet() {
    const draw = (p, f, pose) => {
      p(2, 14, 12, 1, 'rgba(0,0,0,0.3)');
      p(3, 11, 10, 2, APx.wood[2]); p(3, 11, 10, 1, APx.wood[3]);   // carriage
      ART.shadedCircle(p, 4, 13, 1, AP.wood, 1);                    // wheels
      ART.shadedCircle(p, 11, 13, 1, AP.wood, 1);
      p(7, 6, 2, 5, APx.wood[1]);                                   // stock riser
      p(2, 5, 5, 1, APx.wood[3]); p(9, 5, 5, 1, APx.wood[3]);       // bow arms
      p(2, 4, 1, 1, APx.wood[2]); p(13, 4, 1, 1, APx.wood[2]);      // arm tips
      const loosed = pose === 'fight' && f === 1;
      if (loosed) {
        p(3, 6, 10, 1, APx.thatch[1]);                              // string slack forward
        p(6, 1, 4, 1, AP.bone[2]); p(10, 1, 1, 1, AP.stone[3]);     // bolt away!
      } else {
        p(3, 7, 4, 1, APx.thatch[1]); p(9, 7, 4, 1, APx.thatch[1]); // string drawn
        p(5, 6, 6, 1, AP.bone[2]); p(11, 6, 1, 1, AP.stone[3]);     // bolt nocked
      }
      p(10, 9, 2, 2, APx.wood[0]);                                  // windlass
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, 0, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      fight: frames(2, (p, g, f) => draw(p, f, 'fight')),
    };
  }
  // trebuchet: the tall counterweight engine. Two A-frame pivot towers straddle
  // a long throwing arm; a heavy weighted box (draped in the village colour)
  // hangs at the short end, a sling with a flaming ball at the long end. Fight
  // frame 1 whips the arm over — the flaming ball leaves and the weight drops.
  function trebuchetSheet(accent) {
    const draw = (p, f, pose) => {
      p(2, 15, 12, 1, 'rgba(0,0,0,0.3)');                            // long ground shadow
      p(2, 12, 12, 2, APx.wood[2]); p(2, 12, 12, 1, APx.wood[3]);    // heavy base beam
      p(3, 11, 1, 3, APx.wood[1]); p(12, 11, 1, 3, APx.wood[1]);     // outriggers
      ART.shadedCircle(p, 3, 14, 1, AP.wood, 1);                     // wheels
      ART.shadedCircle(p, 12, 14, 1, AP.wood, 1);
      p(6, 4, 1, 8, APx.wood[1]); p(9, 4, 1, 8, APx.wood[1]);        // tall A-frame uprights
      p(5, 5, 2, 1, APx.wood[2]); p(9, 5, 2, 1, APx.wood[2]);        // angled braces
      p(6, 4, 4, 1, APx.wood[3]);                                    // pivot crossbeam
      const thrown = pose === 'fight' && f === 1;
      if (thrown) {
        // arm whipped over: long end up-left, counterweight box slammed down right
        p(3, 1, 1, 4, APx.wood[3]); p(4, 4, 3, 1, APx.wood[3]);      // long arm swung up-left
        p(1, 0, 3, 3, AP.fire[2]); p(2, 0, 1, 1, AP.fire[3]); p(1, 1, 1, 1, AP.fire[1]);  // flaming ball away!
        p(10, 10, 3, 3, APx.wood[0]); p(10, 10, 3, 1, accent);      // weight box dropped, faction drape
      } else {
        // cocked: counterweight box hauled UP (left), long arm down-right, ball loaded
        p(4, 2, 3, 3, APx.wood[0]); p(4, 2, 3, 1, accent);          // raised weight box + faction drape
        p(9, 5, 1, 6, APx.wood[3]); p(9, 10, 3, 1, APx.wood[2]);    // long arm down to the sling
        p(12, 10, 2, 2, AP.fire[1]); p(12, 10, 1, 1, AP.fire[2]);   // loaded flaming ball, glowing
      }
      p(7, 0, 1, 4, APx.wood[2]); p(8, 0, 2, 1, accent); p(8, 1, 1, 1, accent);  // faction pennant on the mast
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, 0, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      fight: frames(2, (p, g, f) => draw(p, f, 'fight')),
    };
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

  // fish breaking the surface — two frames used as an occasional flourish
  Sprites.misc.fish = [
    tile(p => {
      p(6, 7, 3, 2, '#c8d8e0'); p(9, 6, 1, 2, '#c8d8e0');   // arcing body + tail
      p(6, 6, 1, 1, '#e8f4ff');                             // glint
      p(4, 10, 1, 1, '#e8f4ff'); p(10, 10, 1, 1, '#e8f4ff'); // droplets
    }),
    tile(p => {
      p(5, 9, 6, 1, '#e8f4ff'); p(4, 10, 8, 1, PAL.waterL);  // splash ring
      p(7, 8, 2, 1, '#c8d8e0');
    }),
  ];

  function beast(name, body, bodyD, opts) {
    const w = opts.w, h = opts.h, y0 = 12 - h;
    const draw = (p, f, attacking) => {
      p(4, 14, w + 2, 1, 'rgba(0,0,0,0.3)');
      p(3, y0, w, h, body);                                   // body
      p(3 + w - 1, y0 - 1, 3, h, bodyD);                      // head
      if (opts.ears) { p(3 + w - 1, y0 - 2, 1, 1, bodyD); p(3 + w + 1, y0 - 2, 1, 1, bodyD); }
      if (opts.hump) { p(4, y0 - 1, 4, 1, body); p(4, y0 - 1, 2, 1, bodyD); }   // massive shoulder
      if (opts.snout) p(3 + w + 2, y0, 1, 1, opts.snout);                        // pale muzzle
      if (opts.tusk) p(3 + w + 2, y0 + h - 2, 1, 1, PAL.white);
      if (opts.tail) p(2, y0, 1, 2, bodyD);
      if (opts.antlers) { p(3 + w, y0 - 4, 1, 3, '#e8dcc0'); p(3 + w + 2, y0 - 4, 1, 3, '#e8dcc0'); p(3 + w + 1, y0 - 3, 1, 1, '#e8dcc0'); }
      if (opts.horns) { p(3 + w - 1, y0 - 3, 1, 2, PAL.white); p(3 + w + 2, y0 - 3, 1, 2, PAL.white); }
      if (opts.spots) { p(4, y0, 2, 2, opts.spots); p(8, y0 + 1, 2, 2, opts.spots); }
      if (attacking) p(3 + w + 2, y0 + 1, 1, 1, PAL.red);     // open maw
      // legs
      const l1 = f === 0 ? 2 : 3, l2 = f === 0 ? 3 : 2;
      p(4, y0 + h, 1, l1, bodyD); p(3 + w - 2, y0 + h, 1, l2, bodyD);
    };
    Sprites.unit[name] = {
      idle: frames(2, (p, g, f) => draw(p, 0, false)),
      walk: frames(2, (p, g, f) => draw(p, f, false)),
      fight: frames(2, (p, g, f) => draw(p, f, true)),
    };
  }
  beast('wolf', PAL.wolf, PAL.wolfD, { w: 7, h: 3, ears: true, tail: true });
  beast('boar', PAL.boar, PAL.boarD, { w: 8, h: 4, tusk: true, tail: true });
  // the bear: rare, huge, dark — a humped silhouette a head taller than a boar
  beast('bear', APx.hide[1], APx.hide[0], { w: 9, h: 5, ears: true, hump: true, snout: APx.hide[2] });
  beast('deer', '#a87848', '#7a5430', { w: 6, h: 3, ears: true, tail: true, antlers: true });
  beast('cow', '#e8e0d0', '#8a8078', { w: 8, h: 4, ears: true, tail: true, horns: true, spots: '#5a4a3a' });

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
