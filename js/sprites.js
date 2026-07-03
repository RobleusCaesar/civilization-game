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
  const PAL = {
    grass: '#5a8f3c', grassD: '#4d7c33', grassL: '#6da04a',
    soil: '#6b5433', soilD: '#57431f', sprout: '#8fbf4d',
    water: '#2e6b8a', waterL: '#4589ab',
    rock: '#8f8f86', rockD: '#6f6f66', rockL: '#adada2',
    trunk: '#6e4f27', leaf: '#2e5c25', leafL: '#417a33',
    wood: '#8a6b3a', woodD: '#6e5024', thatch: '#c9a84c', thatchD: '#ab8c38',
    stone: '#9a9a92', stoneD: '#77776e',
    gold: '#e8c15a', fire: '#e88a3a', fireL: '#f2c14a',
    skin: '#d9a066', hair: '#4a3620',
    P: '#4a90c2', PD: '#356a92',        // player accent (blue)
    A: '#c2564a', AD: '#8f3d34',        // rival accent (red)
    R: '#3d3833', RD: '#2a2622',        // raider (dark)
    wolf: '#7d7d84', wolfD: '#5d5d64',
    boar: '#7a5230', boarD: '#5c3c20',
    white: '#e8e8e0', red: '#c23a2e', dark: '#1a160f',
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

  /* ---------------- terrain ---------------- */
  function grassBase(p, seed) {
    p(0, 0, 16, 16, PAL.grass);
    speckle(p, seed, 9, PAL.grassD);
    speckle(p, seed + 5, 6, PAL.grassL);
  }
  Sprites.terrain[T.GRASS] = [
    tile(p => grassBase(p, 3)),
    tile(p => grassBase(p, 77)),
  ];
  function drawTree(p, x, y) {
    p(x + 1, y + 4, 1, 2, PAL.trunk);
    p(x, y + 1, 3, 3, PAL.leaf);
    p(x + 1, y, 1, 1, PAL.leaf);
    p(x, y + 1, 1, 1, PAL.leafL);
    p(x + 1, y + 1, 1, 1, PAL.leafL);
  }
  Sprites.terrain[T.FOREST] = [
    tile(p => { grassBase(p, 11); drawTree(p, 2, 2); drawTree(p, 9, 7); drawTree(p, 3, 10); }),
    tile(p => { grassBase(p, 23); drawTree(p, 8, 2); drawTree(p, 2, 6); drawTree(p, 10, 10); }),
  ];
  Sprites.terrain[T.WATER] = [
    tile(p => {
      p(0, 0, 16, 16, PAL.water);
      speckle(p, 9, 5, PAL.waterL);
      p(3, 4, 4, 1, PAL.waterL); p(9, 9, 4, 1, PAL.waterL); p(5, 13, 3, 1, PAL.waterL);
    }),
  ];
  Sprites.terrain[T.HILLS] = [
    tile(p => {
      grassBase(p, 31);
      p(2, 6, 7, 5, PAL.rock); p(3, 5, 5, 1, PAL.rock);
      p(9, 9, 5, 4, PAL.rockD); p(10, 8, 3, 1, PAL.rockD);
      p(3, 6, 2, 1, PAL.rockL); p(10, 9, 2, 1, PAL.rockL);
      p(2, 10, 7, 1, PAL.rockD);
    }),
  ];
  Sprites.terrain[T.FERTILE] = [
    tile(p => {
      p(0, 0, 16, 16, PAL.soil);
      speckle(p, 17, 8, PAL.soilD);
      p(2, 3, 1, 2, PAL.sprout); p(6, 7, 1, 2, PAL.sprout); p(11, 4, 1, 2, PAL.sprout);
      p(4, 12, 1, 2, PAL.sprout); p(12, 11, 1, 2, PAL.sprout); p(9, 13, 1, 2, PAL.sprout);
    }),
  ];
  Sprites.terrain[T.CAMP] = [
    tile(p => {
      grassBase(p, 41);
      p(4, 12, 8, 1, PAL.dark);                     // scorched ground
      p(5, 6, 6, 5, PAL.RD); p(6, 5, 4, 1, PAL.RD); // dark tent
      p(7, 4, 2, 1, PAL.R);
      p(7, 8, 2, 3, PAL.dark);                      // entrance
      p(2, 9, 1, 3, PAL.trunk); p(1, 8, 3, 1, PAL.white); p(2, 7, 1, 1, PAL.white); // skull totem
      p(12, 10, 2, 2, PAL.fire); p(12, 9, 1, 1, PAL.fireL);
    }),
  ];

  /* ---------------- buildings ---------------- */
  function shadow(p) { p(2, 13, 12, 2, 'rgba(0,0,0,0.25)'); }
  function roofStrips(p, x, y, w, rows, colA, colB) {
    for (let i = 0; i < rows; i++) p(x + i, y + i, w - i * 2, 1, i % 2 ? colB : colA);
  }
  const B_DRAW = {
    tc(p, lv) {
      shadow(p);
      const base = lv >= 2 ? PAL.stone : PAL.wood, baseD = lv >= 2 ? PAL.stoneD : PAL.woodD;
      p(2, 8, 12, 6, base); p(2, 8, 12, 1, baseD);
      p(7, 10, 2, 4, PAL.dark);                                  // door
      roofStrips(p, 1, 4, 14, 4, PAL.thatch, PAL.thatchD);
      p(7, 2, 1, 3, PAL.trunk);                                  // banner pole
      p(8, 2, 3, 2, lv >= 3 ? PAL.gold : PAL.P);
      if (lv >= 2) { p(3, 10, 2, 2, PAL.dark); p(11, 10, 2, 2, PAL.dark); } // windows
      if (lv >= 3) { p(0, 9, 2, 5, PAL.stoneD); p(14, 9, 2, 5, PAL.stoneD); } // wings
    },
    farm(p, lv) {
      const crop = lv >= 3 ? PAL.gold : PAL.sprout;
      p(1, 1, 14, 14, PAL.soil);
      for (let i = 0; i < 5; i++) { p(2, 2 + i * 3, 12, 1, PAL.soilD); p(2, 3 + i * 3, 12, 1, crop); }
      p(10, 1, 5, 5, PAL.wood); roofStrips(p, 10, 0, 5, 2, PAL.thatch, PAL.thatchD); // hut
      if (lv >= 2) { p(0, 0, 16, 1, PAL.trunk); p(0, 15, 16, 1, PAL.trunk); p(0, 0, 1, 16, PAL.trunk); p(15, 0, 1, 16, PAL.trunk); }
    },
    lodge(p, lv) {
      shadow(p);
      p(4, 6, 8, 7, PAL.woodD);                                   // tent body
      p(5, 5, 6, 1, PAL.woodD); p(6, 4, 4, 1, PAL.wood); p(7, 3, 2, 1, PAL.wood);
      p(7, 9, 2, 4, PAL.dark);                                    // entrance
      p(5, 2, 1, 2, PAL.white); p(4, 1, 1, 1, PAL.white);         // antlers
      p(10, 2, 1, 2, PAL.white); p(11, 1, 1, 1, PAL.white);
      if (lv >= 2) { p(13, 10, 2, 2, PAL.fire); p(13, 9, 1, 1, PAL.fireL); }
      if (lv >= 3) { p(0, 8, 3, 5, PAL.wood); p(0, 7, 3, 1, PAL.thatchD); } // smoke hut
    },
    lumber(p, lv) {
      shadow(p);
      for (let i = 0; i < 3; i++) { p(2, 10 - i * 2, 8, 2, i % 2 ? PAL.wood : PAL.woodD); p(2, 10 - i * 2, 1, 2, PAL.thatch); } // log pile
      p(11, 9, 4, 4, PAL.trunk);                                  // stump
      p(12, 6, 1, 3, PAL.woodD); p(11, 5, 3, 1, PAL.rockL);       // axe
      if (lv >= 2) roofStrips(p, 1, 2, 10, 2, PAL.thatch, PAL.thatchD);
      if (lv >= 3) { p(11, 2, 4, 3, PAL.stone); p(11, 2, 4, 1, PAL.stoneD); }
    },
    quarry(p, lv) {
      p(1, 1, 14, 14, PAL.rockD);
      p(3, 3, 10, 10, PAL.rock);
      p(5, 5, 6, 6, PAL.rockD);                                   // pit
      p(2, 12, 3, 2, PAL.rockL); p(11, 3, 3, 2, PAL.rockL);       // cut blocks
      if (lv >= 2) { p(7, 2, 1, 6, PAL.trunk); p(7, 2, 5, 1, PAL.trunk); p(11, 3, 1, 3, PAL.woodD); } // crane
      if (lv >= 3) { p(1, 1, 14, 1, PAL.gold); }
    },
    house(p, lv) {
      shadow(p);
      const h = lv >= 3 ? 8 : 6, y = 13 - h;
      p(4, y, 8, h, PAL.wood); p(4, y, 8, 1, PAL.woodD);
      p(7, 13 - 3, 2, 3, PAL.dark);
      roofStrips(p, 3, y - 3, 10, 3, PAL.thatch, PAL.thatchD);
      if (lv >= 2) p(5, y + 2, 2, 2, PAL.dark);
      if (lv >= 3) p(9, y + 2, 2, 2, PAL.dark);
    },
    tower(p, lv) {
      shadow(p);
      const mat = lv >= 2 ? PAL.stone : PAL.wood, matD = lv >= 2 ? PAL.stoneD : PAL.woodD;
      p(5, 5, 6, 9, mat); p(5, 5, 6, 1, matD); p(5, 9, 6, 1, matD);
      p(4, 3, 8, 3, matD); p(3, 2, 10, 1, mat);                  // platform
      p(5, 1, 1, 1, mat); p(10, 1, 1, 1, mat);                   // crenels
      p(7, 11, 2, 3, PAL.dark);
      if (lv >= 3) { p(7, 0, 2, 2, PAL.fire); p(7, 0, 1, 1, PAL.fireL); }
      else p(7, 0, 1, 2, PAL.P);
    },
    barracks(p, lv) {
      shadow(p);
      p(1, 7, 14, 7, PAL.woodD); p(1, 7, 14, 1, PAL.dark);
      roofStrips(p, 0, 4, 16, 3, PAL.RD, PAL.dark);
      p(3, 9, 2, 3, PAL.dark); p(11, 9, 2, 3, PAL.dark);
      p(7, 8, 2, 3, PAL.rockL); p(7, 8, 2, 1, PAL.red);           // shield
      if (lv >= 2) { p(1, 3, 1, 4, PAL.trunk); p(2, 3, 2, 2, PAL.red); }
      if (lv >= 3) { p(14, 3, 1, 4, PAL.trunk); p(12, 3, 2, 2, PAL.gold); }
    },
  };
  for (const key of Object.keys(B_DRAW)) {
    Sprites.building[key] = [1, 2, 3].map(lv => tile(p => B_DRAW[key](p, lv)));
  }
  Sprites.misc.construction = tile(p => {
    p(2, 12, 12, 2, PAL.woodD);
    p(3, 4, 1, 10, PAL.trunk); p(12, 4, 1, 10, PAL.trunk);
    p(3, 4, 10, 1, PAL.trunk); p(3, 8, 10, 1, PAL.trunk);
    p(5, 10, 3, 2, PAL.rockL);
  });

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
      p(10, ay, 3, 1, PAL.skin);
      p(12, ay - 1, 1, 1, PAL.rockL);          // tool head
      p(5, y + 4, 1, 2, PAL.skin);
    } else if (pose === 'fight') {
      const ax = f === 0 ? 10 : 12;
      p(10, y + 4, ax - 7, 1, PAL.skin);
      p(ax, y + 2, 1, 4, c.spear || PAL.trunk); // spear
      p(ax, y + 1, 1, 1, PAL.rockL);
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
  Sprites.unit.raider = unitSheet({ body: PAL.R, accent: PAL.red, pants: PAL.RD, hair: '#1a1208', spear: PAL.RD },
    (p, f) => { p(7, 1, 2, 1, PAL.red); });                                       // warpaint band
  Sprites.unit.brute = unitSheet({ body: PAL.RD, accent: PAL.red, pants: PAL.R, hair: '#1a1208', spear: PAL.RD },
    (p, f) => { p(5, 5, 6, 1, PAL.red); p(6, 0, 4, 1, '#c9b18a'); });             // bone crown

  function beast(name, body, bodyD, opts) {
    const w = opts.w, h = opts.h, y0 = 12 - h;
    const draw = (p, f, attacking) => {
      p(4, 14, w + 2, 1, 'rgba(0,0,0,0.3)');
      p(3, y0, w, h, body);                                   // body
      p(3 + w - 1, y0 - 1, 3, h, bodyD);                      // head
      if (opts.ears) { p(3 + w - 1, y0 - 2, 1, 1, bodyD); p(3 + w + 1, y0 - 2, 1, 1, bodyD); }
      if (opts.tusk) p(3 + w + 2, y0 + h - 2, 1, 1, PAL.white);
      if (opts.tail) p(2, y0, 1, 2, bodyD);
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

  /* ---------------- icons (16px) ---------------- */
  function icon(draw) {
    const c = mk(16, 16), g = c.getContext('2d');
    const p = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, (w || 1) * 2, (h || 1) * 2); };
    draw(p);
    return c;
  }
  Sprites.icons.food = icon(p => { p(2, 3, 4, 4, '#c23a2e'); p(3, 2, 2, 1, '#c23a2e'); p(5, 1, 2, 2, PAL.sprout); p(4, 4, 1, 1, '#e8887a'); });
  Sprites.icons.wood = icon(p => { p(1, 3, 6, 3, PAL.wood); p(1, 3, 1, 3, PAL.thatch); p(2, 4, 4, 1, PAL.woodD); });
  Sprites.icons.stone = icon(p => { p(2, 3, 4, 3, PAL.rock); p(3, 2, 2, 1, PAL.rock); p(2, 5, 4, 1, PAL.rockD); p(3, 3, 1, 1, PAL.rockL); });
  Sprites.icons.gold = icon(p => { p(2, 4, 4, 2, PAL.gold); p(3, 3, 2, 1, PAL.gold); p(3, 4, 1, 1, '#fff2c0'); });
  Sprites.icons.pop = icon(p => { p(3, 1, 2, 2, PAL.skin); p(2, 3, 4, 3, PAL.P); });

  Sprites.iconFor = (key) => Sprites.icons[key];
})();
