"use strict";
/* ARTSTYLE — the single source of visual truth for Clanfire.
   Every sprite, icon, and UI texture is built from this module. No raw hex
   colors anywhere else. Read ARTSTYLE.md before adding or changing any art. */

const ART = (function () {

  /* ================= master palette =================
     Named ramps, darkest → lightest (index 0 = darkest). ~48 colors total,
     warm and earthy in the 16-bit tradition. Sprites reference ramps + index,
     never hex. */
  const PALETTE = {
    // land
    grass:   ['#31491f', '#41652a', '#4d7c33', '#5a8f3c', '#6da04a'],
    leaf:    ['#1d3a17', '#2e5c25', '#3c6f2d', '#417a33', '#569244'],
    soil:    ['#3c2c16', '#57431f', '#6b5433', '#82683f'],
    water:   ['#1c4258', '#265674', '#2e6b8a', '#4589ab', '#7fc0d8'],
    stone:   ['#4a4a44', '#6f6f66', '#8f8f86', '#adada2', '#c9c9bf'],
    // materials
    wood:    ['#3e2c14', '#5c421f', '#6e5024', '#8a6b3a', '#a5854d'],
    thatch:  ['#7a6224', '#ab8c38', '#c9a84c', '#e0c065'],
    bone:    ['#8a7f66', '#b5ab8e', '#d8cfae'],
    // creatures
    skin:    ['#8a5a30', '#b57f4a', '#d9a066', '#ecc08a'],
    hair:    ['#2c2012', '#4a3620', '#7a5a30'],
    pelt:    ['#3d3833', '#5d5d64', '#7d7d84', '#a2a2ac'],
    hide:    ['#41291a', '#5c3c20', '#7a5230', '#9c7040'],
    // factions
    blue:    ['#20415e', '#356a92', '#4a90c2', '#7ab4dc'],   // player
    red:     ['#5e2018', '#8f3d34', '#c2564a', '#d98a80'],   // rival tribe
    rust:    ['#241d15', '#3d3833', '#4a3d2c', '#6e5b40'],   // barbarian furs
    teal:    ['#1e5c4c', '#3fb094', '#7ccfb8'],              // barbarian war paint
    // accents
    fire:    ['#a33f1c', '#e88a3a', '#f2c14a', '#ffe9a0'],
    gold:    ['#8a6a1e', '#c99b32', '#e8c15a', '#fff2c0'],
    bloom:   ['#b8496e', '#d96a8a', '#e8d24a', '#f2f2ea'],   // flowers / butterflies
    ink:     ['#14100a', '#241d15', '#3a3324'],              // outlines / UI chrome
  };

  /* ================= style constants ================= */
  const STYLE = {
    LIGHT: 'top-left',        // locked light direction for every sprite
    GRID: 16,                 // logical pixels per tile
    PX: 2,                    // physical pixels per logical pixel (32px tiles)
    OUTLINE_ALPHA: 0.8,       // outlines use the darkest ramp shade, never pure black
    SHADOW: 'rgba(20,16,10,0.30)',   // drop-shadow color under entities/buildings
    FOG_BLACK: '#0d0b08',
    // sprite scale per entity class (fraction of a tile the silhouette targets)
    SCALE: { unit: 0.6, beast: 0.7, building: 0.95, hero: 1.0 },
  };

  /* ============ level-tier visual language ============
     A progression system, not three hardcoded looks: L4/L5 later just extend
     the curves. Materials roughen → refine, decoration accumulates, footprint
     grows, banners and ember glow arrive at the top tiers. */
  function tierDress(level) {
    const mats = ['wattle', 'timber', 'stonefoot'];   // extend this list for L4+
    return {
      mat: mats[Math.min(level, mats.length) - 1],
      roofRamp: level >= 3 ? PALETTE.wood : PALETTE.thatch,
      decor: Math.max(0, level - 1),           // decorative element count
      inset: Math.max(0, 2 - (level - 1)),     // footprint inset (px) — shrinks as level grows
      banner: level >= 3,                      // faction banner at refined tiers
      glow: level >= 3,                        // ember/door glow at refined tiers
    };
  }

  /* ================= deterministic rng ================= */
  function rng(seed) {
    let s = (seed | 0) || 1;
    return () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
  }

  /* ============ drawing primitives ============
     All take the standard plotter p(x, y, w, h, color) working on the 16-grid. */

  // filled rect with locked top-left light: lit top+left edge, shaded bottom+right
  function shadedRect(p, x, y, w, h, ramp, base) {
    base = base === undefined ? 2 : base;
    p(x, y, w, h, ramp[base]);
    if (ramp[base + 1] && w > 1 && h > 1) { p(x, y, w, 1, ramp[base + 1]); p(x, y, 1, h, ramp[base + 1]); }
    if (ramp[base - 1] && w > 1 && h > 1) { p(x, y + h - 1, w, 1, ramp[base - 1]); p(x + w - 1, y, 1, h, ramp[base - 1]); }
  }

  // rough circle with the same lighting rule
  function shadedCircle(p, cx, cy, r, ramp, base) {
    base = base === undefined ? 2 : base;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r * 0.5) continue;
      const rim = dx * dx + dy * dy > (r - 1) * (r - 1);
      const lit = dx + dy < -r * 0.6, dark = dx + dy > r * 0.6;
      p(cx + dx, cy + dy, 1, 1,
        rim && dark ? (ramp[base - 1] || ramp[base])
          : lit ? (ramp[base + 1] || ramp[base]) : ramp[base]);
    }
  }

  // soft elliptical contact shadow under an entity/building
  function dropShadow(p, cx, y, w) {
    const half = Math.max(1, (w / 2) | 0);
    p(cx - half, y, w, 1, STYLE.SHADOW);
    if (w > 3) p(cx - half + 1, y - 0, w - 2, 1, STYLE.SHADOW);
  }

  // 2×2 checker dithering across a band — ramp transitions without hard seams
  function dither(p, x, y, w, h, colA, colB) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++)
      p(x + xx, y + yy, 1, 1, ((xx + yy) & 1) ? colA : colB);
  }

  /* ---- material textures (buildings) ---- */
  function thatchTexture(p, x, y, w, h, seed) {
    shadedRect(p, x, y, w, h, PALETTE.thatch, 2);
    const r = rng(seed || 7);
    for (let i = 0; i < w * h * 0.25; i++)
      p(x + (r() * w) | 0, y + (r() * h) | 0, 1, 1, r() < 0.5 ? PALETTE.thatch[1] : PALETTE.thatch[3]);
    for (let yy = y + 1; yy < y + h; yy += 2) p(x, yy, w, 1, PALETTE.thatch[1]);   // combed rows
    if (p.hi) {                                                                     // loose reed strands between courses
      const r2 = rng((seed || 7) * 7 + 5);
      for (let i = 0; i < w * h * 0.5; i++)
        p.hi(x * 2 + (r2() * w * 2) | 0, y * 2 + (r2() * h * 2) | 0, 1, 1, r2() < 0.5 ? PALETTE.thatch[0] : PALETTE.thatch[3]);
    }
  }
  function woodPlankTexture(p, x, y, w, h, seed) {
    shadedRect(p, x, y, w, h, PALETTE.wood, 2);
    for (let yy = y + 1; yy < y + h; yy += 2) p(x, yy, w, 1, PALETTE.wood[1]);
    const r = rng(seed || 13);
    for (let i = 0; i < w * 0.6; i++) p(x + (r() * w) | 0, y + (r() * h) | 0, 1, 1, PALETTE.wood[0]);  // knots
    if (p.hi) {                                                                     // fine grain + plank shadow lines
      for (let yy = y + 1; yy < y + h; yy += 2) p.hi(x * 2, yy * 2 + 1, w * 2, 1, PALETTE.wood[3]);   // lit under-plank
      const r2 = rng((seed || 13) * 3 + 1);
      for (let i = 0; i < w * 1.2; i++) p.hi(x * 2 + (r2() * w * 2) | 0, y * 2 + (r2() * h * 2) | 0, 1, 2, PALETTE.wood[1]);  // grain streaks
    }
  }
  function stoneTexture(p, x, y, w, h, seed) {
    shadedRect(p, x, y, w, h, PALETTE.stone, 2);
    const r = rng(seed || 29);
    for (let yy = y + 1; yy < y + h; yy += 2)
      for (let xx = x + ((yy & 2) ? 1 : 2); xx < x + w; xx += 3)
        p(xx, yy, 1, 1, PALETTE.stone[1]);                                          // mortar joints
    for (let i = 0; i < w * h * 0.12; i++)
      p(x + (r() * w) | 0, y + (r() * h) | 0, 1, 1, PALETTE.stone[3]);
    if (p.hi) {                                                                     // crisp ashlar: thin courses + lit/shaded block faces
      for (let yy = y + 2; yy < y + h; yy += 2) p.hi(x * 2, yy * 2, w * 2, 1, PALETTE.stone[0]);       // recessed course line
      const r2 = rng((seed || 29) * 5 + 3);
      for (let i = 0; i < w * h * 0.5; i++)
        p.hi(x * 2 + (r2() * w * 2) | 0, y * 2 + (r2() * h * 2) | 0, 1, 1, r2() < 0.5 ? PALETTE.stone[3] : PALETTE.stone[0]);
    }
  }
  function wattleTexture(p, x, y, w, h, seed) {
    shadedRect(p, x, y, w, h, PALETTE.soil, 2);
    for (let xx = x + 1; xx < x + w; xx += 3) p(xx, y, 1, h, PALETTE.wood[1]);      // stakes
    const r = rng(seed || 31);
    for (let i = 0; i < w * h * 0.15; i++)
      p(x + (r() * w) | 0, y + (r() * h) | 0, 1, 1, PALETTE.soil[1]);               // daub
  }

  // organic leaf clump with 3-shade depth (dark base, mid mass, lit crown)
  function foliageCluster(p, cx, cy, r0, seed) {
    const r = rng(seed || 3);
    shadedCircle(p, cx + 1, cy + 1, r0, [PALETTE.leaf[0], PALETTE.leaf[0], PALETTE.leaf[0]], 1);
    shadedCircle(p, cx, cy, r0, PALETTE.leaf, 2);
    for (let i = 0; i < r0 * 3; i++) {
      const a = r() * Math.PI * 2, d = r() * r0 * 0.8;
      p(cx + Math.cos(a) * d - (a < 2 ? 1 : 0) | 0, cy + Math.sin(a) * d | 0, 1, 1,
        r() < 0.6 ? PALETTE.leaf[4] : PALETTE.leaf[3]);
    }
  }

  /* ---- shared idle animation curves (t in seconds) ---- */
  function animBob(t) { return Math.round(Math.sin(t * 2.4) * 0.5 + 0.5); }        // 0|1 gentle bob
  function animSway(t) { return Math.sin(t * 1.7); }                               // -1..1 slow sway

  /* ---- 1px outline post-process ----
     Draws the darkest ink shade into transparent pixels adjacent to opaque
     ones. Run ONCE at sprite build time (cheap at 32×32), never per frame. */
  function outline(canvas, width) {
    width = width || 1;                                  // 2 for high-res (64px) building canvases
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 96;
    const edges = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      let near = false;
      for (let dy = -width; dy <= width && !near; dy++) for (let dx = -width; dx <= width; dx++) {
        if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) > width) continue;
        if (solid(x + dx, y + dy)) { near = true; break; }
      }
      if (near) edges.push([x, y]);
    }
    g.fillStyle = 'rgba(20,16,10,' + STYLE.OUTLINE_ALPHA + ')';
    for (const [x, y] of edges) g.fillRect(x, y, 1, 1);
    return canvas;
  }

  return {
    PALETTE, STYLE, tierDress, rng,
    shadedRect, shadedCircle, dropShadow, dither,
    thatchTexture, woodPlankTexture, stoneTexture, wattleTexture,
    foliageCluster, animBob, animSway, outline,
  };
})();
