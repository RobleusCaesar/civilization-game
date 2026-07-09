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
        // stone great hall: coursed-masonry walls with dressed quoins, a
        // wood-shingle roof, faction banner, fire-lit formal entrance, dooryard fence
        ART.stoneTexture(q, 4, 15, 24, 12, 21);                    // coursed-stone walls
        for (let i = 0; i < 12; i += 2) {                          // dressed corner quoins
          const lit = (i & 2) ? AP.stone[4] : AP.stone[3], sh = (i & 2) ? AP.stone[1] : AP.stone[0];
          q(4, 15 + i, 2, 2, lit); q(26, 15 + i, 2, 2, sh);
        }
        // wood-shingle roof
        ART.shadedRect(q, 3, 3, 26, 13, AP.wood, 2);
        for (let yy = 5; yy < 16; yy += 2) q(3, yy, 26, 1, AP.wood[1]);      // shingle courses
        for (let xx = 5; xx < 28; xx += 3) q(xx, 4, 1, 11, AP.wood[3]);      // shingle seams
        q(3, 3, 26, 1, AP.wood[4]);                               // lit ridge
        q(2, 14, 28, 2, AP.wood[1]); q(2, 14, 28, 1, AP.wood[2]); // eave
        q(15, 5, 3, 2, AP.ink[1]);                                // smoke hole
        // formal fire-lit entrance
        q(12, 17, 8, 1, AP.stone[4]);                             // stone lintel
        q(13, 18, 6, 8, AP.ink[0]);                               // deep doorway
        q(13, 18, 1, 8, AP.stone[3]); q(18, 18, 1, 8, AP.stone[3]); // jambs
        q(14, 24, 4, 2, AP.fire[1]); q(15, 23, 2, 2, AP.fire[2]); // firelight within
        q(7, 19, 3, 3, AP.ink[1]); q(7, 19, 3, 1, AP.stone[4]);   // windows
        q(22, 19, 3, 3, AP.ink[1]); q(22, 19, 3, 1, AP.stone[4]);
        q(24, 2, 1, 9, AP.wood[2]);                               // banner pole
        q(25, 2, 5, 3, fac[2]); q(25, 5, 4, 1, fac[1]); q(25, 2, 5, 1, fac[3]); // faction banner
        for (let fx = 3; fx < 28; fx += 5) { q(fx, 28, 1, 2, AP.wood[2]); q(fx, 28, 4, 1, AP.wood[1]); } // dooryard fence
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
    house(p, lv) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 8, 14, 10);
      const h = 5 + Math.min(2, lv - 1), y = 13 - h;
      wallBody(p, 4, y, 8, h, d, lv * 3);
      roof(p, 3, y - 3, 10, 3, d, lv * 5);
      p(7, 13 - 3, 2, 3, AP.ink[0]);                                // door
      if (d.decor >= 1) p(5, y + 1, 2, 2, AP.ink[1]);               // window
      if (d.decor >= 2) { p(9, y + 1, 2, 2, AP.ink[1]); p(12, 13, 2, 1, AP.bloom[1]); } // flowers
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
    barracks(p, lv, fac) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 8, 14, 14);
      wallBody(p, 1, 7, 14, 7, d, 13);
      roof(p, 0, 4, 16, 3, d, 14);
      p(3, 9, 2, 3, AP.ink[0]); p(11, 9, 2, 3, AP.ink[0]);          // twin doors
      p(7, 8, 2, 3, AP.bone[2]); p(7, 8, 2, 1, fac[2]);             // faction shield
      if (d.decor >= 1) { p(1, 3, 1, 4, AP.wood[2]); p(2, 3, 2, 2, fac[2]); }  // pennant
      if (d.banner) banner(p, 14, 1, fac);
    },
    stable(p, lv, fac) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 8, 14, 14);
      wallBody(p, 1, 7, 14, 7, d, 15);
      roof(p, 0, 4, 16, 3, d, 16);
      p(6, 9, 4, 5, AP.ink[0]);                                     // big stall door
      p(2, 9, 2, 2, AP.hide[3]); p(3, 8, 2, 1, AP.hide[3]); p(3, 9, 1, 1, AP.ink[0]); // horse at window
      p(12, 9, 1, 4, AP.wood[2]); p(13, 10, 2, 1, AP.wood[2]);      // hitching post
      if (d.decor >= 1) { p(0, 12, 1, 3, AP.wood[2]); p(15, 12, 1, 3, AP.wood[2]); } // paddock posts
      if (d.banner) banner(p, 0, 0, fac);
    },
    range(p, lv, fac) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 11, 14, 8);
      ART.shadedCircle(p, 3, 6, 2, AP.bone, 1);                     // straw target
      p(2, 5, 3, 3, AP.red[2]); p(3, 6, 1, 1, AP.bone[2]);          // rings
      p(3, 9, 1, 5, AP.wood[2]);                                    // target post
      wallBody(p, 9, 6, 5, 8, d, 19);
      roof(p, 8, 4, 7, 2, d, 20);
      p(11, 10, 1, 4, AP.ink[0]);                                   // door
      p(6, 11, 1, 4, AP.wood[2]); p(7, 11, 1, 1, AP.wood[3]);       // bow rack
      if (d.decor >= 1) p(0, 12, 8, 1, AP.wood[2]);                 // shooting-lane fence
      if (d.banner) banner(p, 13, 0, fac);
    },
    dock(p, lv, fac) {
      const d = ART.tierDress(lv);
      p(0, 0, 16, 16, AP.water[2]);                                 // open water beneath
      p(2, 1, 3, 3, AP.water[3]); p(11, 11, 3, 2, AP.water[3]);     // ripples
      p(3, 12, 1, 3, AP.wood[1]); p(12, 12, 1, 3, AP.wood[1]);      // pilings
      p(6, 13, 1, 2, AP.wood[1]); p(9, 13, 1, 2, AP.wood[1]);
      ART.woodPlankTexture(p, 2, 6, 12, 6, 23);                     // deck
      p(6, 2, 4, 4, AP.wood[2]); p(6, 2, 4, 1, AP.wood[3]);         // walkway to shore
      if (d.decor >= 1) {
        ART.shadedRect(p, 3, 3, 3, 3, AP.thatch, 2);                // crates of catch
        p(11, 3, 2, 3, AP.wood[2]); p(11, 2, 2, 1, AP.stone[3]);    // mooring post
      }
      if (d.decor >= 2) { banner(p, 13, 0, fac); p(2, 12, 2, 1, AP.gold[2]); }
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
  const NO_OUTLINE = new Set(['farm', 'quarry', 'dock', 'wall', 'gate']);
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

  // the 2×2 Town Center going up — a great roundhouse under construction, drawn
  // at 128px so it stays crisp across the big footprint: a ring foundation with
  // its daub-and-footing wall half-raised, the conical roof frame with the first
  // thatch courses laid, a scaffold ring, a gin-pole hoisting a block, materials
  // and a ladder. Reads clearly as a large building being raised.
  // the great roundhouse being RAISED. 128px canvas authored on its fine 32-grid
  // (`q`, 4px/cell → 2px on screen at the 2×2 footprint) so it matches the
  // finished TC's density. A half-laid stone footing ring, a daub wall going up
  // with a door gap, a conical roof frame thatched on the lit side and bare
  // rafters on the other, a scaffold ring with lashings, a gin-pole hoisting a
  // block, stacked materials and a leaning ladder. Distinct from the 1×1 site.
  Sprites.misc.constructionBig = ART.outline(tileB(p => {
    const q = p.hi, W = AP.wood, ST = AP.stone, TH = AP.thatch, SO = AP.soil;
    q(6, 27, 21, 2, ART.STYLE.SHADOW); q(9, 29, 14, 1, ART.STYLE.SHADOW);       // broad contact shadow
    q(4, 24, 24, 4, SO[2]); q(4, 24, 24, 1, SO[3]); q(4, 27, 24, 1, SO[1]);     // dug foundation pad
    for (let i = 0; i < 10; i++) { q(5 + i * 2, 22, 2, 2, ST[i < 6 ? 2 : 1]); q(5 + i * 2, 22, 2, 1, ST[3]); } // stone footing (tapers off)
    ART.wattleTexture(q, 7, 18, 18, 5, 41); q(7, 18, 18, 1, SO[3]);             // daub wall half-raised
    q(14, 19, 4, 4, AP.ink[0]);                                                 // doorway gap
    for (let sx = 8; sx < 25; sx += 3) q(sx, 19, 1, 4, W[1]);                   // wall stakes
    // conical roof FRAME — thatch laid on the lit (left) bays, bare rafters right
    for (let ry = 4; ry <= 13; ry++) {
      const rw = (ry - 4) + 2, lx = 16 - rw;
      q(lx, ry, rw, 1, ry % 2 ? TH[1] : TH[2]);                                 // thatched left
      q(lx, ry, Math.max(1, rw >> 1), 1, TH[3]);                               // lit
      for (let rx = 16; rx < 16 + rw; rx += 2) q(rx, ry, 1, 1, W[2]);           // bare rafters right
    }
    q(16, 3, 1, 11, W[3]); q(16, 3, 1, 1, TH[3]);                              // king-post + lit crown
    q(6, 12, 10, 2, TH[0]);                                                    // eave shadow under laid thatch
    // scaffold ring: outer + inner uprights, two rails, a plank platform, lashings
    for (const px of [2, 29]) { q(px, 4, 1, 21, W[2]); q(px, 4, 1, 1, W[3]); }
    q(9, 3, 1, 11, W[2]); q(23, 3, 1, 11, W[2]);
    q(2, 8, 28, 1, W[3]); q(2, 17, 28, 1, W[3]); q(2, 17, 11, 1, W[3]);
    for (const [lx, ly] of [[2, 8], [29, 8], [2, 17], [29, 17], [9, 8], [23, 8]]) { q(lx, ly, 1, 1, TH[1]); q(lx, ly + 1, 1, 1, TH[3]); }
    // gin-pole crane hoisting a dressed block on a rope
    q(27, 0, 1, 8, W[1]); q(22, 0, 6, 1, W[2]); q(22, 1, 1, 6, TH[1]);
    ART.shadedRect(q, 20, 6, 3, 3, ST, 2);
    // materials: timber stack (left), dressed stone blocks (right), reed bundle
    q(0, 22, 4, 1, W[3]); q(0, 23, 4, 1, W[2]); q(0, 24, 4, 1, W[3]);
    q(1, 22, 1, 1, TH[2]); q(3, 23, 1, 1, TH[2]);
    ART.shadedRect(q, 26, 23, 4, 3, ST, 2); q(28, 25, 1, 1, ST[0]);
    q(11, 22, 3, 2, TH[2]); q(11, 22, 3, 1, TH[3]);
    // a ladder leaning on the frame
    q(19, 14, 1, 13, W[1]); q(22, 14, 1, 13, W[1]);
    for (let r = 0; r < 6; r++) q(19, 16 + r * 2, 4, 1, W[2]);
    const rr = ART.rng(93);
    for (let i = 0; i < 12; i++) q(6 + (rr() * 22) | 0, 25 + (rr() * 4) | 0, 1, 1, i % 2 ? TH[1] : W[3]);  // sawdust
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
      const ax = f === 0 ? 10 : 12;
      p(10, y + 4, ax - 7, 1, PAL.skin);
      p(ax, y + 2, 1, 4, c.spear || PAL.trunk); // spear
      p(ax, y + 1, 1, 1, PAL.rockL);
      if (f === 1) { p(ax + 1, y + 1, 1, 1, APx.bone[2]); p(ax + 1, y + 3, 1, 1, APx.fire[2]); } // strike flash
      p(5, y + 4, 1, 2, PAL.skin);
    } else {
      p(5, y + 4, 1, 2, PAL.skin);
      p(10, y + 4, 1, 2, PAL.skin);
    }
  }
  function unitSheet(c, extra) {
    return {
      idle: frames(2, (p, g, f) => { humanoid(p, f, 'idle', c); if (extra) extra(p, f); }),
      walk: frames(2, (p, g, f) => { humanoid(p, f, 'walk', c); if (extra) extra(p, f); }),
      gather: frames(2, (p, g, f) => { humanoid(p, f, 'gather', c); if (extra) extra(p, f); }),
      fight: frames(2, (p, g, f) => { humanoid(p, f, 'fight', c); if (extra) extra(p, f); }),
    };
  }
  // villagers carry the full working repertoire: chop (wood), mine (stone),
  // farm (food), build (hammer) and guard (defend with a pickaxe)
  function villagerSheet(c) {
    const mk = (pose) => frames(2, (p, g, f) => humanoid(p, f, pose, c));
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
    green:  { body: '#4d8a46', accent: '#356030' },
    purple: { body: '#7a4a8f', accent: '#553066' },
    teal:   { body: '#2f9a8f', accent: '#1e6a62' },
    orange: { body: '#c07a2a', accent: '#8a5216' },
  };
  Sprites.villager = {};
  for (const name in TUNICS) {
    const t = TUNICS[name];
    Sprites.villager[name] = villagerSheet({ body: t.body, accent: t.accent, pants: '#6e5024', hair: PAL.hair });
  }
  Sprites.villagerTunics = Object.keys(TUNICS);            // exposed for the tunic picker
  Sprites.unit.villager = Sprites.villager.blue;           // default + fallback sheet
  Sprites.unit.defender = unitSheet({ body: '#7a6242', accent: PAL.P, pants: '#4a3a24', hair: PAL.hair, spear: PAL.trunk },
    (p, f) => { p(11, 2, 1, 5, PAL.trunk); p(11, 1, 1, 1, PAL.rockL); });        // idle spear
  Sprites.unit.elite = unitSheet({ body: '#8a7248', accent: PAL.gold, pants: '#4a3a24', hair: PAL.hair, spear: PAL.trunk },
    (p, f) => { p(4, 6, 1, 3, PAL.rockL); p(11, 2, 1, 5, PAL.trunk); p(11, 1, 1, 1, PAL.gold); }); // shield
  Sprites.unit.defenderA = unitSheet({ body: '#7a5242', accent: PAL.A, pants: '#4a2a24', hair: PAL.hair, spear: PAL.trunk },
    (p, f) => { p(11, 2, 1, 5, PAL.trunk); p(11, 1, 1, 1, PAL.rockL); });
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

  // axeman: bare-armed shock troop, broad stone axe over the shoulder
  Sprites.unit.axeman = unitSheet({ body: APx.hide[2], accent: PAL.P, pants: APx.hide[1], hair: PAL.hair, spear: PAL.trunk },
    (p, f) => {
      p(11, 2, 1, 5, PAL.trunk);                               // heavy haft
      p(10, 1, 3, 1, APx.stone[3]); p(10, 2, 2, 1, APx.stone[2]);  // broad axe head
      p(5, 5, 1, 1, APx.skin[2]); p(10, 5, 1, 1, APx.skin[2]); // bare shoulders
    });
  // longbowman: a bow as tall as the archer, quiver on the hip
  Sprites.unit.longbow = unitSheet({ body: APx.leaf[2], accent: PAL.P, pants: APx.leaf[1], hair: PAL.hair, spear: PAL.trunk },
    (p, f) => {
      p(12, 0, 1, 9, PAL.trunk);                               // man-tall stave
      p(11, 0, 1, 1, PAL.trunk); p(11, 8, 1, 1, PAL.trunk);    // curved tips
      p(4, 6, 1, 3, APx.hide[1]); p(4, 5, 1, 1, APx.thatch[2]); // quiver + fletching
    });

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
  Sprites.unit.rider = riderSheet({ horse: '#a87848', horseD: '#7a5430', body: '#7a6242', accent: PAL.P });
  Sprites.unit.horsearcher = riderSheet({ horse: APx.hide[3], horseD: APx.hide[1], body: APx.leaf[2], accent: PAL.P, bow: true });
  Sprites.unit.lancer = riderSheet({ horse: '#8a8078', horseD: '#5d5d64', body: '#8a7248', accent: PAL.gold, tip: PAL.gold });
  // archers: humanoid with a bow at the side
  Sprites.unit.archer = unitSheet({ body: '#6a7a4a', accent: PAL.P, pants: '#4a5230', hair: PAL.hair, spear: PAL.trunk },
    (p, f) => { p(12, 2, 1, 6, PAL.trunk); p(11, 2, 1, 1, PAL.trunk); p(11, 7, 1, 1, PAL.trunk); });
  Sprites.unit.marksman = unitSheet({ body: '#5a6a3a', accent: PAL.gold, pants: '#3a4224', hair: PAL.hair, spear: PAL.trunk },
    (p, f) => { p(12, 1, 1, 7, PAL.trunk); p(11, 1, 1, 1, PAL.gold); p(11, 8, 1, 1, PAL.trunk); });

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
  Sprites.unit.warship = warshipSheet({ hull: PAL.wood, hullD: PAL.woodD, sail: '#e8e8e0', sailD: '#c9c9c0',
    stripe: PAL.P, crew: '#7a6242', arrow: PAL.rockL });
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
