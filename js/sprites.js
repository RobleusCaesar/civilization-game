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
    } else {
      ART.thatchTexture(p, x, y, w, h, seed);
      if (dress.mat === 'timber') p(x, y, w, 1, AP.wood[3]);        // ridge beam
    }
  }
  function wallBody(p, x, y, w, h, dress, seed) {
    if (dress.mat === 'wattle') ART.wattleTexture(p, x, y, w, h, seed);
    else if (dress.mat === 'timber') ART.woodPlankTexture(p, x, y, w, h, seed);
    else ART.stoneTexture(p, x, y, w, h, seed);
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
    tc(p, lv, fac) {
      const d = ART.tierDress(lv);
      ART.dropShadow(p, 8, 14, 14);
      if (lv === 1) {
        // great thatched roundhouse: a true cone of combed reed courses over a
        // wattle-and-daub ring, crossed ridge poles at the crown, and a stone
        // fire pit smouldering in the dooryard
        p(4, 11, 8, 2, AP.soil[2]);                                 // daub ring wall
        p(4, 11, 1, 2, AP.soil[3]); p(11, 11, 1, 2, AP.soil[1]);    // lit / shaded rim
        p(5, 11, 1, 2, AP.wood[1]); p(10, 11, 1, 2, AP.wood[1]);    // wattle stakes
        const rows = [[7, 2], [6, 4], [5, 6], [4, 8], [3, 10], [2, 12], [2, 12], [1, 14]];
        const rr = ART.rng(83);
        for (let i = 0; i < rows.length; i++) {                     // stacked thatch courses
          const ry = 3 + i, rx = rows[i][0], rw = rows[i][1];
          p(rx, ry, rw, 1, AP.thatch[2]);
          const edge = Math.max(1, rw >> 2);
          p(rx, ry, edge, 1, AP.thatch[3]);                         // lit left face
          p(rx + rw - edge, ry, edge, 1, AP.thatch[1]);             // shaded right face
          for (let s2 = 0; s2 < rw >> 1; s2++) {                    // loose reed strands
            p(rx + ((rr() * rw) | 0), ry, 1, 1, rr() < 0.5 ? AP.thatch[1] : AP.thatch[3]);
          }
        }
        p(5, 8, 1, 3, AP.thatch[1]); p(10, 7, 1, 3, AP.thatch[1]);  // combed reed lines
        p(1, 11, 1, 1, AP.thatch[1]); p(13, 11, 1, 1, AP.thatch[1]); // ragged eave fringe
        p(3, 11, 1, 1, AP.thatch[2]);
        p(7, 1, 1, 2, AP.wood[2]); p(9, 1, 1, 1, AP.wood[2]);       // crossed ridge poles
        p(8, 2, 1, 1, AP.wood[3]); p(6, 1, 1, 1, AP.wood[1]);
        p(7, 3, 2, 1, AP.ink[1]);                                   // smoke hole
        p(6, 9, 4, 1, AP.wood[3]);                                  // door lintel
        p(7, 10, 2, 3, AP.ink[0]);                                  // doorway
        p(6, 10, 1, 3, AP.wood[2]); p(9, 10, 1, 3, AP.wood[2]);     // door posts
        p(7, 13, 2, 1, AP.soil[3]);                                 // trodden threshold
        p(3, 13, 1, 1, AP.grass[4]);                                // dooryard grass
        p(12, 12, 1, 1, AP.stone[1]); p(14, 12, 1, 1, AP.stone[2]); // fire-pit stone ring
        p(12, 14, 1, 1, AP.stone[0]); p(14, 14, 1, 1, AP.stone[1]);
        p(13, 12, 1, 1, AP.stone[2]); p(13, 14, 1, 1, AP.stone[1]);
        p(12, 13, 1, 1, AP.stone[1]); p(14, 13, 1, 1, AP.stone[2]);
        p(13, 13, 1, 1, AP.fire[2]);                                // bright ember heart
        p(11, 14, 1, 1, AP.wood[0]);                                // charred log end
      } else if (lv === 2) {
        // timber longhouse with carved posts and a drying rack
        wallBody(p, 2, 8, 12, 6, d, 5);
        roof(p, 1, 3, 14, 5, d, 6);
        p(1, 2, 1, 12, AP.wood[1]); p(14, 2, 1, 12, AP.wood[1]);    // carved end posts
        p(1, 1, 1, 1, AP.bone[2]); p(14, 1, 1, 1, AP.bone[2]);      // bone finials
        p(7, 10, 2, 4, AP.ink[0]);                                  // door
        p(4, 10, 2, 2, AP.ink[1]); p(10, 10, 2, 2, AP.ink[1]);      // windows
        p(7, 2, 2, 1, AP.ink[1]);                                   // smoke hole
        p(0, 12, 1, 3, AP.wood[2]); p(0, 12, 3, 1, AP.wood[3]);     // drying rack
        p(1, 13, 1, 1, AP.red[2]); p(2, 13, 1, 1, AP.hide[2]);      // hung meat
      } else {
        // stone-footed great hall: banner, fire-lit doorway, dooryard fence
        ART.stoneTexture(p, 1, 9, 14, 5, 21);                       // stone footing
        roof(p, 0, 3, 16, 6, d, 9);
        p(0, 3, 16, 1, AP.wood[4]);                                 // gable trim
        p(7, 11, 2, 3, AP.ink[0]);                                  // doorway…
        p(7, 13, 2, 1, AP.fire[1]); p(7, 12, 1, 1, AP.fire[2]);     // …glowing with firelight
        p(3, 11, 2, 2, AP.ink[1]); p(11, 11, 2, 2, AP.ink[1]);      // windows
        banner(p, 12, 0, fac);                                      // faction banner
        p(1, 15, 2, 1, AP.wood[2]); p(6, 15, 2, 1, AP.wood[2]); p(12, 15, 2, 1, AP.wood[2]); // fence
        p(1, 2, 2, 1, AP.ink[1]);                                   // smoke hole
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
  for (const key of Object.keys(B_DRAW)) {
    const build = (fac) => [1, 2, 3].map(lv => {
      const c = tile(p => B_DRAW[key](p, lv, fac));
      return NO_OUTLINE.has(key) ? c : ART.outline(c);
    });
    Sprites.building[key] = build(AP.blue);
    Sprites.buildingA[key] = build(AP.red);
  }
  // auto-tiling atlases: wallMask[level-1][mask 0..15], gateMask[level-1][0=horizontal,1=vertical]
  Sprites.wallMask = [1, 2, 3].map(lv =>
    Array.from({ length: 16 }, (_, m) => tile(p => drawWallMask(p, lv, m))));
  Sprites.gateMask = [0, 1, 2].map(li =>
    [Sprites.building.gate[li], tile(p => drawGateVertical(p, li + 1))]);

  Sprites.misc.construction = ART.outline(tile(p => {
    ART.dropShadow(p, 8, 14, 12);
    p(2, 13, 12, 2, AP.soil[2]);                                  // cleared ground
    p(3, 2, 1, 12, AP.wood[2]); p(12, 2, 1, 12, AP.wood[2]);      // scaffold poles
    p(3, 2, 10, 1, AP.wood[3]); p(3, 6, 10, 1, AP.wood[3]);       // cross beams
    p(4, 3, 1, 1, AP.thatch[1]); p(11, 5, 1, 1, AP.thatch[1]);    // lashings
    ART.shadedRect(p, 5, 9, 6, 5, AP.wood, 1);                    // partial frame
    p(6, 4, 3, 2, AP.stone[2]); p(6, 4, 3, 1, AP.stone[3]);       // materials pile
    p(10, 11, 3, 2, AP.thatch[2]);
  }));

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
    // arms + tool
    if (pose === 'gather') {
      const ay = f === 0 ? y + 3 : y + 5;
      p(10, ay, 3, 1, PAL.skin);               // swinging arm
      p(12, ay - 2, 1, 3, PAL.trunk);          // wooden haft
      p(12, ay - 3, 2, 1, PAL.rockL);          // lashed stone head
      if (f === 1) p(14, ay, 1, 1, APx.thatch[3]);   // chips fly on the strike
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'fight') {
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
  Sprites.unit.villager = unitSheet({ body: '#b08a4f', accent: '#8a6b3a', pants: '#6e5024', hair: PAL.hair });
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

  // mounted unit: horse + rider with spear
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
      if (pose === 'fight') { p(9, 4, f === 0 ? 4 : 6, 1, PAL.trunk); p(f === 0 ? 13 : 15, 4, 1, 1, PAL.rockL); }
      else { p(10, 0, 1, 7, PAL.trunk); p(10, 0, 1, 1, c.tip || PAL.rockL); }
    };
    return {
      idle: frames(2, (p, g, f) => draw(p, 0, 'idle')),
      walk: frames(2, (p, g, f) => draw(p, f, 'walk')),
      fight: frames(2, (p, g, f) => draw(p, f, 'fight')),
    };
  }
  Sprites.unit.rider = riderSheet({ horse: '#a87848', horseD: '#7a5430', body: '#7a6242', accent: PAL.P });
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
