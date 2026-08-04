"use strict";
/* Canvas renderer: camera, cached terrain layer, fog of war, entities, minimap. */

// grass-floored resources: drawn on a transparent floor over one continuous
// painted grass ground (see drawTile/paintGround) so no seam shows at block edges
/* Terrains whose sprite is authored on a TRANSPARENT floor and therefore needs
   paintGround under it. A tile left out of this set falls to the plain
   drawImage branch in drawTile — and a transparent-floored sprite drawn there
   shows the BARE CACHE CANVAS, which composites as black: exactly the "gold
   seam is mostly black" bug. Sprites.blendCol is the matching declaration of
   what floor each one stands on; the two tables must agree. */
const GROUND_GRAIN = new Set([T.FOREST, T.FERTILE, T.HILLS, T.MOUNTAIN, T.STUMPS, T.PEBBLES, T.GOLDORE]);
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

const R = {
  cv: null, g: null,
  mini: null, mg: null,
  cam: { x: 0, y: 0, z: 1.5 },   // world px offset + zoom
  dpr: 1,
  bottomReserve: 0,              // measured open build-menu bar height (CSS px) to keep clear at the bottom
  topReserve: 0,                 // measured top status-bar height (CSS px) so the map's top edge never hides behind it
  terrainCache: null,
  fogCv: null, fogG: null, fogDirty: true,
  floats: [],                    // {x,y,txt,col,t}
  particles: [],                 // transient impact debris/fire/smoke {x,y,vx,vy,t,life,col,sz,g}
  miniT: 0,

  init() {
    this.cv = document.getElementById('c');
    this.g = this.cv.getContext('2d');
    this.mini = document.getElementById('mini');
    this.mg = this.mini.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * this.dpr);
    this.cv.height = Math.round(innerHeight * this.dpr);
  },

  // a loose V of little seagull "M" silhouettes, wings flapping out of phase
  _drawFlock(g, a, ax, ay) {
    g.fillStyle = ART.PALETTE.ink[1];
    for (let k = 0; k < a.n; k++) {
      const bx = ax - a.dir * k * 4.5, by = ay + (k ? ((k & 1) ? 1 : -1) * ((k + 1) >> 1) * 3 : 0) - k * 1.2;
      const flap = Math.sin(a.t * 9 + k * 1.3) > 0 ? 1.4 : 0;
      g.fillRect(bx - 2.6, by - flap, 2.6, 1.4);
      g.fillRect(bx + 0.5, by - flap, 2.6, 1.4);
      g.fillRect(bx - 0.4, by + 0.4, 1, 1);   // body
    }
  },
  // a tiny characterful animal, mirrored by facing; hops when it wanders
  _drawCritter(g, a, ax, ay) {
    const P = ART.PALETTE, f = a.face || 1;
    const hop = a.state === 'wander' ? Math.max(0, Math.sin((a.t + a.ph) * 7)) * 2
      : a.state === 'flee' ? 1.2 : 0;
    const y = ay - hop;
    const px = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(ax + f * dx - (f < 0 ? w : 0), y + dy, w, h); };
    if (a.sub === 'rabbit') {
      px(-2, 0, 4, 3, P.bone[1]);            // body
      px(1, -2, 2, 3, P.bone[2]);            // head/haunch
      px(0, -4, 1, 3, P.bone[1]); px(2, -4, 1, 3, P.bone[1]);   // ears
      px(-3, -1, 1, 1, P.bone[2]);           // white tail puff
      px(2, -1, 1, 1, P.ink[0]);             // eye
    } else if (a.sub === 'fox') {
      px(-3, 0, 5, 2, P.fire[1]);            // body
      px(2, -2, 3, 3, P.fire[1]);            // head
      px(3, -4, 1, 2, P.fire[0]);            // ear
      px(-5, -1, 2, 2, P.fire[1]); px(-6, 0, 1, 1, P.bone[2]);  // bushy white-tipped tail
      px(4, -1, 1, 1, P.ink[0]);             // eye/snout
      px(-2, 2, 1, 1, P.ink[1]); px(1, 2, 1, 1, P.ink[1]);      // legs
    } else {                                 // squirrel
      px(-1, 0, 3, 3, P.hide[2]);            // body
      px(1, -2, 2, 2, P.hide[3]);            // head
      px(-4, -4, 2, 6, P.hide[1]); px(-3, -5, 2, 2, P.hide[2]); // big curled tail
      px(2, -1, 1, 1, P.ink[0]);             // eye
    }
  },

  // The shared grass floor: a flat green fill plus a sparse, near-tone felt grain
  // whose positions come from a fully-mixed hash of the tile's world (x,y) —
  // avalanche-mixed so they decorrelate from x and y (a weak mix left faint
  // vertical streaks). No two tiles share a pattern and nothing lines up with the
  // grid. A gentle DIAGONAL low-frequency field (mixes x AND y, so no axis-aligned
  // banding) leans the grain lighter/darker for soft meadow undulation. Painted
  // identically under open grass AND under every resource, so blocks never seam.
  paintGround(g, x, y, h) {
    const TL = CFG.TILE, px = TL / 16, AP = ART.PALETTE;
    g.fillStyle = AP.grass[2];
    g.fillRect(x * TL, y * TL, TL, TL);
    const lean = (Math.sin((x * 0.8 + y * 0.6) * 0.09) + Math.sin((x * 0.5 - y * 0.9) * 0.075)) * 0.2;
    for (let k = 0; k < 10; k++) {
      let hh = (h ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
      hh = Math.imul(hh ^ (hh >>> 15), 0x85ebca6b) >>> 0;
      hh = Math.imul(hh ^ (hh >>> 13), 0xc2b2ae35) >>> 0;
      hh = (hh ^ (hh >>> 16)) >>> 0;
      const gx = hh & 15, gy = (hh >> 4) & 15;
      g.fillStyle = (((hh >> 8) & 255) / 255) < 0.5 + lean ? AP.grass[3] : AP.grass[1];
      g.fillRect(x * TL + gx * px, y * TL + gy * px, px, px);
    }
    if ((h & 3) === 0) {                          // a short blade on ~1/4 of tiles for texture
      g.fillStyle = AP.grass[3];
      g.fillRect(x * TL + ((h >> 6) & 15) * px, y * TL + ((h >> 10) & 15) * px, px, px * 2);
    }
  },

  // WATER — calm and smooth. A flat body colour with long, LOW-contrast swells
  // computed in WORLD space (the bands run straight across tile borders, so a lake
  // can never show a per-tile pattern), plus a few hash-scattered wave dashes and
  // pinpoint glints. Shore tiles use the lighter shallow ramp; the live sparkle /
  // foam / fish animation layers on top at frame time.
  paintWater(g, x, y, shore) {
    const TL = CFG.TILE, px = TL / 16, W = ART.PALETTE.water;
    const body = shore ? W[2] : W[1], dark = shore ? W[1] : W[0], lite = shore ? W[3] : W[2];
    g.fillStyle = body;
    g.fillRect(x * TL, y * TL, TL, TL);
    for (let jy = 0; jy < 16; jy++) for (let jx = 0; jx < 16; jx++) {
      const wx = x + jx / 16, wy = y + jy / 16;
      // three long slow sine swells, wavelengths of several tiles, gently angled
      const v = Math.sin(wx * 1.7 + wy * 0.55 + 1.3) + Math.sin(wx * 0.4 - wy * 1.35 + 4.1)
        + Math.sin((wx + wy) * 0.75 + 2.2) * 0.8;
      // per-pixel hash softens the band edges so the swell never reads as stripes
      let hh = (Math.imul(x * 16 + jx, 73856093) ^ Math.imul(y * 16 + jy, 19349663)) >>> 0;
      hh = ((Math.imul(hh ^ (hh >>> 13), 0x85ebca6b) >>> 0) >>> 8) / 16777215;
      if (v > 2.05 + (hh - 0.5) * 0.5) g.fillStyle = lite;
      else if (v < -2.15 - (hh - 0.5) * 0.5) g.fillStyle = dark;
      else continue;
      g.fillRect(x * TL + jx * px, y * TL + jy * px, px, px);
    }
    // sparse life: two short crest dashes + one pinpoint glint per tile, hash-placed
    let hh = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b)) >>> 0;
    for (let k = 0; k < 3; k++) {
      hh = (Math.imul(hh ^ (hh >>> 15), 0xc2b2ae35) >>> 0);
      const gx = hh & 15, gy = (hh >> 4) & 15;
      if (k < 2) { g.fillStyle = lite; g.fillRect(x * TL + Math.min(gx, 13) * px, y * TL + gy * px, px * (2 + (hh >> 9 & 1)), px); }
      else if ((hh & 3) === 0) { g.fillStyle = shore ? W[4] : W[3]; g.fillRect(x * TL + gx * px, y * TL + gy * px, px, px); }
    }
  },

  // MOUNTAIN HEIGHT FIELD — the graph distance of every mountain tile from the
  // nearest non-mountain tile (1 at the rocky footprint, rising toward the
  // interior). A whole range shares one continuous field, so bilinear-sampling it
  // gives real slopes that fall away to the ground and ridgelines that run between
  // summits — no per-tile slabs. Computed once (mountains never move).
  computeMountainHeight() {
    const W = CFG.W, H = CFG.H, T_ = S.map.terrain, d = new Int32Array(W * H), q = [];
    for (let i = 0; i < W * H; i++) { if (T_[i] === T.MOUNTAIN) d[i] = 1e6; else { d[i] = 0; q.push(i); } }
    for (let head = 0; head < q.length; head++) {
      const i = q[head], cx = i % W, cy = (i / W) | 0, nd = d[i] + 1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (T_[j] === T.MOUNTAIN && d[j] > nd) { d[j] = nd; q.push(j); }
      }
    }
    let max = 1; for (let i = 0; i < W * H; i++) { if (T_[i] !== T.MOUNTAIN) d[i] = 0; else if (d[i] > max) max = d[i]; }
    this.mtnH = d; this.mtnMax = max;
    // SUMMITS — local maxima of the field (plateau-deduped to their top-left cell),
    // then greedily thinned so no two peaks sit closer than ~2 tiles. Each summit
    // gets a small deterministic jitter so apexes don't sit on tile centers.
    const hsh = (a, b) => { let n = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0; n = Math.imul(n ^ (n >>> 13), 0x85ebca6b) >>> 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
    let cand = [];
    for (let i = 0; i < W * H; i++) {
      if (d[i] < 2) continue;
      const cx = i % W, cy = (i / W) | 0; let isMax = true;
      for (let oy = -1; oy <= 1 && isMax; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const dj = d[ny * W + nx];
        if (dj > d[i] || (dj === d[i] && (oy < 0 || (oy === 0 && ox < 0)))) { isMax = false; break; }
      }
      if (isMax) cand.push({ x: cx + 0.5 + (hsh(cx, cy) - 0.5) * 0.5, y: cy + 0.5 + (hsh(cy, cx + 9) - 0.5) * 0.5, h: d[i] });
    }
    cand.sort((a, b) => b.h - a.h);
    const peaks = [];
    for (const c of cand) { if (!peaks.some(p => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < 4)) peaks.push(c); }
    // RIDGE GRAPH — each summit links to its nearest neighbour summit (deduped), so
    // spines chain along a range; an isolated summit keeps a degenerate point-seg.
    const segs = [], seen = new Set();
    for (let a = 0; a < peaks.length; a++) {
      const near = [];
      for (let b = 0; b < peaks.length; b++) {
        if (b === a) continue;
        const dd = (peaks[a].x - peaks[b].x) ** 2 + (peaks[a].y - peaks[b].y) ** 2;
        if (dd < 42) near.push([dd, b]);
      }
      near.sort((u, v) => u[0] - v[0]);
      if (!near.length) { segs.push([peaks[a].x, peaks[a].y, peaks[a].x, peaks[a].y, peaks[a].h]); continue; }
      for (const [, b] of near.slice(0, 2)) {          // link to the 2 nearest -> continuous chain along the range
        const key = a < b ? a * 4096 + b : b * 4096 + a;
        if (!seen.has(key)) { seen.add(key); segs.push([peaks[a].x, peaks[a].y, peaks[b].x, peaks[b].y, Math.min(peaks[a].h, peaks[b].h)]); }
      }
    }
    this.mtnPeaks = peaks; this.mtnSegs = segs;
  },
  // Draw one mountain tile procedurally from the height field: real sloped rock
  // faces lit top-left / shadowed bottom-right by the surface gradient, faceted
  // crag texture, scree at the footprint, snow on the tallest summits, and an
  // irregular rocky edge where it meets grass. Chunky 2px blocks keep the rough style.
  drawMountain(g, x, y) {
    if (!this.mtnH) this.computeMountainHeight();
    // Author on the FINE 1px grid (N=32) for crisp rock detail. The look is built from
    // two scales: a smooth macro dome (the distance field) that carries the big lit/shadow
    // volume + ridgelines, and a fine crag surface (value-noise octaves) that carves
    // faceted planes, secondary ridges/spurs, cracks and grain on top of it.
    const N = 32, R = ART.PALETTE.mrock, P = ART.PALETTE.peak, W = CFG.W, Hh = CFG.H, Hf = this.mtnH;
    const TL = CFG.TILE, cell = TL / N, bx = x * TL, by = y * TL;
    const hAt = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= Hh) ? 0 : Hf[yy * W + xx];
    const samp = (wx, wy) => {                       // bilinear macro height (the smooth dome)
      const x0 = Math.floor(wx), y0 = Math.floor(wy), fx = wx - x0, fy = wy - y0;
      return hAt(x0, y0) * (1 - fx) * (1 - fy) + hAt(x0 + 1, y0) * fx * (1 - fy)
        + hAt(x0, y0 + 1) * (1 - fx) * fy + hAt(x0 + 1, y0 + 1) * fx * fy;
    };
    const rnd = (a, b) => { let n = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0; n = Math.imul(n ^ (n >>> 13), 0x85ebca6b) >>> 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
    const vnoise = (wx, wy) => {                      // smooth value noise
      const x0 = Math.floor(wx), y0 = Math.floor(wy), fx = wx - x0, fy = wy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const n0 = rnd(x0, y0) * (1 - sx) + rnd(x0 + 1, y0) * sx;
      const n1 = rnd(x0, y0 + 1) * (1 - sx) + rnd(x0 + 1, y0 + 1) * sx;
      return n0 * (1 - sy) + n1 * sy;
    };
    // fine crag surface: medium octave = secondary ridges/spurs, finer octaves = facets/grain
    const crag = (wx, wy) => (vnoise(wx * 1.7 + 2, wy * 1.7 + 2) - 0.5) * 1.2
      + (vnoise(wx * 3.9 + 7, wy * 3.9 + 7) - 0.5) * 0.7
      + (vnoise(wx * 8.3 + 31, wy * 8.3 + 31) - 0.5) * 0.36
      + (vnoise(wx * 15.5 + 60, wy * 15.5 + 60) - 0.5) * 0.2;
    const snowLine = Math.max(2.8, this.mtnMax * 0.62);
    const E = 0.55, ce = 0.11;                        // macro / fine sampling offsets
    // ridge spines + summits near this tile (prefiltered once per tile)
    const segs = [], pks = [];
    for (const sg of this.mtnSegs || []) {
      if (Math.min(sg[0], sg[2]) < x + 5 && Math.max(sg[0], sg[2]) > x - 5 &&
          Math.min(sg[1], sg[3]) < y + 5 && Math.max(sg[1], sg[3]) > y - 5) segs.push(sg);
    }
    for (const pk of this.mtnPeaks || []) {
      if (pk.x > x - 5 && pk.x < x + 5 && pk.y > y - 5 && pk.y < y + 5) pks.push(pk);
    }
    for (let jy = 0; jy < N; jy++) for (let jx = 0; jx < N; jx++) {
      const wx = x + (jx + 0.5) / N - 0.5, wy = y + (jy + 0.5) / N - 0.5;
      const s0 = samp(wx, wy);
      // CLEAN organic footprint: the smooth dome + a LOW-frequency wobble (never the busy
      // crag) defines the rock/grass boundary. That keeps the outer edge a clean wavy line
      // (no dirty high-freq speckle fringe) and breaks any straight terrain edge into organic
      // curves, so no tile ends in a hard half-cut line. Nothing is ever drawn on the grass.
      const wob = (vnoise(wx * 0.8 + 40, wy * 0.8 + 40) - 0.5) * 0.9;
      const edge = s0 + wob;
      if (edge <= 0.6) continue;
      const fade = Math.min(1, (edge - 0.6) / 0.55);              // 0 at the clean edge -> 1 just inside (detail returns fast so thin ridges keep their body)
      const cc = crag(wx, wy), c0 = cc * fade;                     // crag detail fades out at the edge -> crisp boundary
      const H = s0 + c0;
      // macro shading — coherent big lit face (top-left) vs dark shadow face, plus
      // ridgeline/hollow from the dome's curvature (negative laplacian = crest = bright)
      const sR = samp(wx + E, wy), sL = samp(wx - E, wy), sD = samp(wx, wy + E), sU = samp(wx, wy - E);
      const macroLit = (sR - sL) + (sD - sU);
      const macroCrest = 4 * s0 - sR - sL - sD - sU;
      // fine shading — hard-edged facets + fine ridges/gullies (also calmed near the edge)
      const cR = crag(wx + ce, wy), cL = crag(wx - ce, wy), cD = crag(wx, wy + ce), cU = crag(wx, wy - ce);
      const fineLit = ((cR - cL) + (cD - cU)) * fade;
      const fineCrest = (4 * cc - cR - cL - cD - cU) * fade;
      const weather = vnoise(wx * 0.33 + 50, wy * 0.33 + 50) - 0.5;         // low-freq lighter/darker patches
      const grain = (rnd(x * N + jx + 3, y * N + jy + 3) - 0.5) * fade;     // per-pixel speckle (calm at the edge)
      let tone = 0.46 + macroLit * 0.55 + macroCrest * 0.4
        + fineLit * 0.6 + fineCrest * 0.35 + weather * 0.35 + grain * 0.18;
      // RIDGE STRUCTURE — nearest spine segment gives: distance to the ridge (rd),
      // which face of it we're on (rs: up-left = lit, down-right = shadow), and an
      // arc-length coordinate along the ridge (ru) used to draw streaks that fan
      // DOWN the flanks (stripes vary along the ridge, run away from it).
      let rd = 1e9, rs = 0, ru = 0;
      for (const sg of segs) {
        const ex = sg[2] - sg[0], ey = sg[3] - sg[1], ll = ex * ex + ey * ey;
        let t = ll ? ((wx - sg[0]) * ex + (wy - sg[1]) * ey) / ll : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ox = wx - (sg[0] + ex * t), oy = wy - (sg[1] + ey * t);
        const dd = Math.sqrt(ox * ox + oy * oy);
        if (dd < rd) { rd = dd; rs = ox + oy; ru = ll ? t * Math.sqrt(ll) : Math.atan2(oy, ox) * 1.3; }
      }
      // bend the ridge organically: a low-frequency perpendicular wobble shifts the
      // face boundary (and thus the spine) so it never reads as a ruler-straight line
      const rsW = rs + (vnoise(wx * 0.9 + 71, wy * 0.9 + 71) - 0.5) * 0.55;
      const litF = rsW <= 0, snowy = s0 >= snowLine;
      // apex + crevice distances (nearest / second-nearest summit)
      let r1p = 1e9, r2p = 1e9;
      for (const pk of pks) { const dp = (wx - pk.x) ** 2 + (wy - pk.y) ** 2; if (dp < r1p) { r2p = r1p; r1p = dp; } else if (dp < r2p) r2p = dp; }
      let ridged = 0;
      if (rd < 2.6) {                                  // ridge structure only NEAR the spine (macro shading rules farther out)
        ridged = 1;
        const k = snowy ? 0.5 : 1;                     // snow softens the rock modulation
        tone += (litF ? 0.14 : -0.3) * k;              // two distinct faces split hard at the spine —
                                                       // the tonal jump at the boundary IS the ridge line
        // radiating slope streaks fanning DOWN the flanks: stripes vary along the ridge
        // (ru) and run away from it — angled with the slope, never combed. Lit face gets
        // sparse DARK streaks on pale rock; shadow face gets dense LIGHT streaks cutting
        // the dark mass. A gentle jitter bends them; gap noise breaks them into dashes.
        const sq = ru * (litF ? 4.5 : 7) + (vnoise(wx * 1.3 + 80, wy * 1.3 + 80) - 0.5) * 1.5;
        const duty = sq - Math.floor(sq);
        const gapN = vnoise(ru * 2.8 + 90, rd * 3.2 + 90);
        if (duty < (litF ? 0.26 : 0.3) && gapN > 0.44 && rd > 0.1)         // heavy gapping -> short rocky dashes, never combed
          tone += (litF ? -0.26 : 0.3) * k * (0.6 + 0.8 * vnoise(wx * 2.6 + 99, wy * 2.6 + 99));
        // damp the isotropic crag pattern near the ridge so the directional
        // streaks dominate the read instead of the worm-maze texture
        tone -= (fineLit * 0.6 + fineCrest * 0.35) * 0.5;
        // contact shadow where two peak masses meet: darkest values in the crevice
        // along the boundary between neighbouring summits — stacks the peaks visually.
        if (pks.length > 1 && Math.sqrt(r2p) - Math.sqrt(r1p) < 0.24 && r1p > 0.36) tone -= 0.3;
      }
      if (snowy) tone += 0.2;
      // hard thresholds -> faceted planes with crisp edges between tonal steps (no smooth fills)
      let idx = tone < 0.15 ? 0 : tone < 0.31 ? 1 : tone < 0.49 ? 2 : tone < 0.66 ? 3 : tone < 0.82 ? 4 : 5;
      // cracks/fissures: short, higher-frequency ridged-noise streaks broken across the slopes
      const crk = vnoise(wx * 5.5 + wy * 1.4 + 13, wy * 5.5 - wx * 0.7 + 4);
      if (1 - Math.abs(2 * crk - 1) > 0.93 && fade > 0.55) idx = Math.max(0, idx - 2);
      // THE SPINE — a thin dark shadow lip right where the faces meet: the lit face
      // runs bright up to the boundary and drops straight into this dark edge, which
      // is what reads as a sharp crest (never a painted bright trail).
      if (ridged && !litF && rsW < 0.08 && rd < 0.6 && s0 > 0.85 && fade > 0.3) idx = Math.min(idx, 1);
      if (fade < 0.14) idx = Math.min(idx, 1);                             // thin clean dark rim hugging the outer edge
      let col;
      // SNOW — consistent altitude line across the range; sun-facing snow is
      // brightest, shadow-face snow is a mid cool tone (never white); the dark
      // spine lip and crevices stay bare rock poking through the cap.
      if (snowy && idx >= 2) col = litF ? (idx >= 4 ? P[idx >= 5 ? 5 : 4] : P[4]) : P[3];
      else col = R[idx];                                                                  // warm brown-grey rock
      g.fillStyle = col;
      g.fillRect(bx + jx * cell, by + jy * cell, cell, cell);
    }
  },

  drawTile(g, x, y) {
    // THE MAP EDGE — the outermost ring is the hard border no unit may enter and
    // nothing may be built on (Path.passable / Bld.tileFree). Paint it as the same
    // off-map black as the void beyond the map, so it reads as exterior: the player
    // sees the world end at the black edge and raises walls/gates on row 1, the
    // first passable ground, flush against it — none the wiser that a hidden rim
    // lies underneath. Keeps the edge unusable without any movement-rule change.
    if (!MapGen.onBoard(x, y)) {
      g.fillStyle = '#0d0b08';
      g.fillRect(x * CFG.TILE, y * CFG.TILE, CFG.TILE, CFG.TILE);
      return;
    }
    // render from last-seen memory, not live truth — grey fog shows the past
    const terr = S.map.seenTerrain || S.map.terrain;
    const t = terr[MapGen.idx(x, y)];
    const at = (xx, yy) => MapGen.inB(xx, yy) ? terr[MapGen.idx(xx, yy)] : t;
    const TL = CFG.TILE, px = TL / 16, AP = ART.PALETTE;
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    const variants = Sprites.terrain[t];
    let img;
    // a sapper MOAT is just water filling a ditch — it renders exactly like the
    // lake (same blue, same shore treatment) so a dug channel reads as one body
    // of water with no per-tile seams
    const wet = v => v === T.WATER || v === T.MOAT;
    // only NATURAL land makes a shore (shallows + foam). Reclaimed land — where a
    // sapper filled water into ground — must NOT shallow the deep water it abuts:
    // the sea beyond a man-made isthmus reads exactly as it did before it was built.
    const shoreLand = (xx, yy) => MapGen.inB(xx, yy) && !wet(at(xx, yy)) &&
      !(S.map.reclaimed && S.map.reclaimed[MapGen.idx(xx, yy)]);
    let waterShore = false;
    if (t === T.GRASS && h % 61 === 0)
      img = Sprites.terrainRare[T.GRASS][h % Sprites.terrainRare[T.GRASS].length];   // rare flower meadow
    else if (wet(t)) {
      waterShore = shoreLand(x + 1, y) || shoreLand(x - 1, y) ||
                   shoreLand(x, y + 1) || shoreLand(x, y - 1);
      // water is painted procedurally in the ground-layer step below (paintWater):
      // calm world-space swells that run across tile borders, so no per-tile pattern
    } else if (t === T.MOUND) {
      const gr = Sprites.terrain[T.GRASS];               // a berm sits on a grass base
      img = gr[(x * 7 + y * 13) % gr.length];
    } else if (t === T.FOREST) {
      // density from how enclosed the tile is: a lone/edge tile is SPARSE, a
      // perimeter tile MEDIUM, a fully-surrounded core tile DENSE — a natural
      // gradient of individual trees, thickening toward the heart of the wood.
      // Deep in the interior a rare character tile (fallen log / stumps / bramble)
      // rolls in for flavour. Mixed hash for both variant and density so there's
      // no diagonal grid.
      let cnt = 0;
      for (const [ox, oy] of NEIGH8)
        if (MapGen.inB(x + ox, y + oy) && terr[MapGen.idx(x + ox, y + oy)] === T.FOREST) cnt++;
      const hp = (h ^ (h >>> 13)) >>> 0;
      // ONLY a tile fully ringed by forest (cnt === 8) may use the dense straddling
      // set (where crowns are cut by the edge) or a character tile — its cut edges
      // always abut more forest. Any tile touching a non-forest neighbour uses the
      // complete-tree edge sets, so the forest's border never shows a half tree.
      const set = cnt === 8
        ? (hp % 11 === 0 ? Sprites.terrainRare[T.FOREST] : Sprites.terrainFull[T.FOREST])
        : cnt >= 4 ? Sprites.terrainMed[T.FOREST] : Sprites.terrain[T.FOREST];
      img = set[hp % set.length];
    } else if (t === T.HILLS && Sprites.terrainFull[T.HILLS]) {
      // ORE gets the forest's density gradient: a lone/edge tile is a few
      // half-buried stones, a perimeter tile a chunky cluster, and only a
      // fully-enclosed core tile uses the packed straddling set (its cut
      // sides always abut more ore) — so a deposit reads as one rocky mass
      // thickening toward its heart, not a grid of repeated tiles.
      let cnt = 0;
      for (const [ox, oy] of NEIGH8)
        if (MapGen.inB(x + ox, y + oy) && terr[MapGen.idx(x + ox, y + oy)] === T.HILLS) cnt++;
      const hp = (h ^ (h >>> 13)) >>> 0;
      const set = cnt === 8 ? Sprites.terrainFull[T.HILLS]
        : cnt >= 4 ? Sprites.terrainMed[T.HILLS] : Sprites.terrain[T.HILLS];
      img = set[hp % set.length];
    } else if (t !== T.MOUNTAIN) img = variants[(x * 7 + y * 13) % variants.length];
    // MOUNTAIN is drawn procedurally from a height field in the ground-layer step
    // below (drawMountain) — real slopes, not a sprite — so no img is selected here.

    // GROUND LAYER. Grass and every grass-floored resource (forest, fertile,
    // hills, mountain, stumps, pebbles) share ONE continuous painted grass floor
    // — flat green + a world-hash felt grain — so there is no shade mismatch and
    // no seam where a forest/resource block meets open grass. The resource sprites
    // are authored on a TRANSPARENT floor and drawn ON TOP of this ground.
    if (t === T.GRASS && h % 61 === 0) {
      g.drawImage(img, x * TL, y * TL);           // rare flower meadow (self-contained)
    } else if (t === T.GRASS) {
      this.paintGround(g, x, y, h);               // plain grass
    } else if (t === T.MOUNTAIN) {
      this.paintGround(g, x, y, h);                               // grass floor under the irregular rocky footprint
      this.drawMountain(g, x, y);                                 // real textured slopes from the height field
    } else if (wet(t)) {
      this.paintWater(g, x, y, waterShore);                       // calm continuous water, no tile pattern
    } else if (GROUND_GRAIN.has(t)) {
      this.paintGround(g, x, y, h);               // continuous floor...
      g.drawImage(img, x * TL, y * TL);           // ...then the transparent-floored resource on top
    } else {
      g.drawImage(img, x * TL, y * TL);           // water / barren / ruin / camp / mound base
    }

    if (wet(t)) {
      // wet-sand rim + pale foam line along every LAND-facing edge (never between
      // water and a moat, or between two moats — those blend seamlessly)
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!shoreLand(x + ox, y + oy)) continue;   // natural coast only — reclaimed land grows no beach
        const band = (col, off) => {
          g.fillStyle = col;
          if (ox === 1) g.fillRect(x * TL + TL - (off + 1) * px, y * TL, px, TL);
          else if (ox === -1) g.fillRect(x * TL + off * px, y * TL, px, TL);
          else if (oy === 1) g.fillRect(x * TL, y * TL + TL - (off + 1) * px, TL, px);
          else g.fillRect(x * TL, y * TL + off * px, TL, px);
        };
        band(AP.bone[2], 0);
        band(AP.water[4], 1);
      }
    } else if (t === T.TRENCH) {
      // scattered clods of overturned soil, placed from the tile's own map hash so
      // no two ditch tiles share a pattern — a wide floor never shows a grid
      let hh = h;
      for (let k = 0; k < 5; k++) {
        hh = (hh * 1103515245 + 12345) >>> 0;
        g.fillStyle = (hh & 1) ? AP.ink[0] : AP.soil[1];
        g.fillRect(x * TL + (1 + (hh >> 4) % 13) * px, y * TL + (1 + (hh >> 12) % 13) * px, px, px);
      }
      // dry ditch: raise a sloped earth wall only on edges facing solid ground, so
      // a dug line of tiles merges into ONE continuous channel (no per-tile borders
      // between neighbouring ditches). Near walls (N/W) catch light and far walls
      // (S/E) drop into shadow, so the uniform floor reads as a sunken divot.
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tt = at(x + ox, y + oy);
        if (tt === T.TRENCH || tt === T.MOAT) continue;   // same channel — floor runs straight through
        const band = (col, off) => {
          g.fillStyle = col;
          if (ox === 1) g.fillRect(x * TL + TL - (off + 1) * px, y * TL, px, TL);
          else if (ox === -1) g.fillRect(x * TL + off * px, y * TL, px, TL);
          else if (oy === 1) g.fillRect(x * TL, y * TL + TL - (off + 1) * px, TL, px);
          else g.fillRect(x * TL, y * TL + off * px, TL, px);
        };
        const lit = ox === -1 || oy === -1;               // top & left walls face the light
        band(lit ? AP.soil[3] : AP.soil[1], 0);           // ground-level lip at the rim
        band(lit ? AP.soil[2] : AP.ink[0], 1);            // slope wall dropping toward the floor
      }
    } else if (t === T.MOUND) {
      // a raised grassy earthwork — brighter than the surrounding turf, with a lit
      // top-left crown and a shadowed lower-right that sell the elevation; a line of
      // them merges into one continuous embankment (shared edges, no seams)
      const mnd = v => v === T.MOUND;
      const li = mnd(at(x - 1, y)) ? 0 : 2, ri = mnd(at(x + 1, y)) ? 0 : 2;
      const ti = mnd(at(x, y - 1)) ? 0 : 2, bi = mnd(at(x, y + 1)) ? 0 : 2;
      const bx = x * TL, by = y * TL, w = TL - (li + ri) * px, hgt = TL - (ti + bi) * px;
      g.fillStyle = AP.grass[3]; g.fillRect(bx + li * px, by + ti * px, w, hgt);            // raised grassy body
      g.fillStyle = AP.grass[4];                                                            // sunlit crown
      g.fillRect(bx + li * px, by + ti * px, w, 2 * px);
      if (!mnd(at(x - 1, y))) g.fillRect(bx + li * px, by + ti * px, px, hgt);              // lit left face
      let hh = h;   // a scrape of bare earth + a few stones so it reads as heaped-up ground
      for (let k = 0; k < 6; k++) {
        hh = (hh * 1103515245 + 12345) >>> 0;
        const r3 = hh & 3;
        g.fillStyle = r3 === 0 ? AP.soil[2] : r3 === 1 ? AP.stone[2] : AP.grass[2];
        g.fillRect(bx + (3 + (hh >> 4) % 10) * px, by + (5 + (hh >> 12) % 6) * px, px, px);
      }
      if (!mnd(at(x + 1, y))) { g.fillStyle = AP.leaf[1]; g.fillRect(bx + TL - (ri + 2) * px, by + ti * px, 2 * px, hgt); g.fillStyle = AP.ink[0]; g.fillRect(bx + TL - (ri + 1) * px, by + ti * px, px, hgt); }   // shaded right slope + dark edge
      if (!mnd(at(x, y + 1))) { g.fillStyle = AP.leaf[1]; g.fillRect(bx + li * px, by + TL - (bi + 2) * px, w, 2 * px); g.fillStyle = AP.ink[0]; g.fillRect(bx + li * px, by + TL - bi * px, w, px); }            // shaded foot
    } else if (Sprites.blendCol[t]) {
      // dithered checker where a differently-grounded biome touches — no hard seams
      const own = Sprites.blendCol[t];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tt = at(x + ox, y + oy);
        if (tt === t) continue;
        const c = Sprites.blendCol[tt];
        if (!c || c === own) continue;
        g.fillStyle = c;
        for (let i2 = (x + y) & 1; i2 < 16; i2 += 2) {
          if (ox === 1) g.fillRect(x * TL + TL - px, y * TL + i2 * px, px, px);
          else if (ox === -1) g.fillRect(x * TL, y * TL + i2 * px, px, px);
          else if (oy === 1) g.fillRect(x * TL + i2 * px, y * TL + TL - px, px, px);
          else g.fillRect(x * TL + i2 * px, y * TL, px, px);
        }
      }
    }
  },

  // live terrain changed (depletion, ruins, terraforming) — only players watching see it
  updateTile(x, y) {
    if (!G.visibleAt(x, y)) return;   // hidden changes stay hidden until revisited
    S.map.seenTerrain[MapGen.idx(x, y)] = S.map.terrain[MapGen.idx(x, y)];
    this.drawTileAt(x, y);
    // a tile's edge art (trench/ditch walls, water foam, biome blends) is computed
    // from its 4 neighbours, so a change here can leave a stale seam on each of
    // them (e.g. a ditch wall that should vanish once the next tile is dug, or a
    // foam rim between two moat tiles). Repaint every EXPLORED neighbour — gating on
    // current visibility left seams on tiles that were dug next to an already-fogged
    // neighbour (the moat "squares" that only a reload rebuild cleared). The cache
    // holds remembered terrain and fog is a separate overlay, so baking a fogged-
    // but-seen neighbour is safe and correct.
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (MapGen.inB(nx, ny) && S.map.explored[MapGen.idx(nx, ny)]) this.drawTileAt(nx, ny);
    }
  },
  drawTileAt(x, y) {
    if (this.terrainCache) this.drawTile(this.terrainCache.getContext('2d'), x, y);
  },

  onNewGame() {
    this.mini.width = CFG.W * 2; this.mini.height = CFG.H * 2;   // map size varies per game
    this.mtnH = null;                                            // recompute the mountain height field for the new map
    // pre-render the full terrain layer once
    const px = CFG.W * CFG.TILE;
    this.terrainCache = document.createElement('canvas');
    this.terrainCache.width = px; this.terrainCache.height = px;
    const g = this.terrainCache.getContext('2d');
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) this.drawTile(g, x, y);
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = CFG.W; this.fogCv.height = CFG.H;
    this.fogG = this.fogCv.getContext('2d');
    this.fogDirty = true;
    this.floats = [];
    this.collapses = [];       // render-side only — never in a save (same rule as _fighting)
    this.deaths = [];          // …so are villagers going over…
    this.marvel = null;        // …and so is the wonder's held frame
    this._dbA = {};            // …and each gate's drawbridge swing (reused ids
                               //    must not inherit another run's deck angle)
    this._workFloatAt = {};    // …and the per-worker "+wood" tick throttle
    this.particles = [];
    Combat.shots.length = 0; Combat.projectiles.length = 0;
    const tc = Bld.tcOf('P');
    if (tc) this.centerOn(tc.x + 0.5, tc.y + 0.5);
  },

  redrawFog() {
    const g = this.fogG;
    g.clearRect(0, 0, CFG.W, CFG.H);
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      if (!S.map.explored[i]) {
        g.fillStyle = '#0d0b08';               // never seen: black
        g.fillRect(x, y, 1, 1);
      } else if (!(G.vis && G.vis[i])) {
        g.fillStyle = 'rgba(16,16,22,0.45)';   // remembered but out of sight: grey
        g.fillRect(x, y, 1, 1);
      }
    }
    // Feather the reveal edge. The fog is one pixel per tile, so a straight
    // upscale leaves a blocky per-tile staircase where lit meets unexplored —
    // it reads as a hard rectangular outline around whatever sits at the vision
    // edge (forests, resource nodes). Pre-blur an intermediate at 4px/tile so the
    // edge dissolves into a soft gradient. Runs ONLY here (on fogDirty), never
    // per frame; the frame loop just blits the result.
    const scale = 4, bw = CFG.W * scale, bh = CFG.H * scale;
    if (!this.fogBlurCv) this.fogBlurCv = document.createElement('canvas');
    if (this.fogBlurCv.width !== bw) { this.fogBlurCv.width = bw; this.fogBlurCv.height = bh; }
    const bg = this.fogBlurCv.getContext('2d');
    bg.clearRect(0, 0, bw, bh);
    bg.imageSmoothingEnabled = true;
    bg.filter = 'blur(' + (scale * 0.9) + 'px)';   // ~1-tile feather
    bg.drawImage(this.fogCv, 0, 0, CFG.W, CFG.H, 0, 0, bw, bh);
    bg.filter = 'none';
    this.fogDirty = false;
  },

  viewW() { return this.cv.width / this.dpr; },
  viewH() { return this.cv.height / this.dpr; },

  clampCam() {
    const world = CFG.W * CFG.TILE;
    const vw = this.viewW() / this.cam.z, vh = this.viewH() / this.cam.z;
    // lazily learn the open build-menu bar's true height (once), so we can reserve
    // exactly that much at the bottom — measured, so it's right on any device/safe-area
    if (!this.bottomReserve) {
      const bar = document.getElementById('bottombar'), bm = document.getElementById('buildmenu');
      if (bar && bm && bm.style.display !== 'none' && bar.offsetHeight > 40) this.bottomReserve = bar.offsetHeight;
    }
    // whatever the bottom bar is showing RIGHT NOW (collapsed Build button, open
    // menu, or a unit panel) is a live floor — so the last rows never hide behind
    // it even before the build menu has been opened once this session
    const barNowEl = document.getElementById('bottombar');
    const barNow = barNowEl ? barNowEl.offsetHeight : 0;
    // the top status bar overlays the canvas — measure it once so a fully-up pan
    // seats the map's TOP edge right below the bar. Without this, the outermost
    // rows (where units legitimately route around walls) hide behind the bar and
    // characters appear to "walk off the top of the map".
    if (!this.topReserve) {
      const tb = document.getElementById('topbar');
      if (tb && tb.offsetHeight > 20) this.topReserve = tb.offsetHeight;
    }
    // sides pan ~10% past the edge; the TOP reserves the status-bar height and the
    // BOTTOM the full build-menu height, so a fully-panned view seats that map edge
    // right at the UI's inner border — neither bar ever covers the map.
    const padX = vw * 0.10;
    const padTop = Math.max(vh * 0.10, (this.topReserve || 0) / this.cam.z);
    // reserve HALF AGAIN the bottom bar's height, so a comfortable band of open
    // ground always sits below the last row and the menu/panel never crowds the
    // bottom tiles — the map's last few rows were hiding behind the UI.
    const bottomBar = Math.max(this.bottomReserve || 0, barNow) * 1.5;
    const padBottom = Math.max(vh * 0.10, bottomBar / this.cam.z);
    this.cam.x = Math.max(-padX, Math.min(world - vw + padX, this.cam.x));
    this.cam.y = Math.max(-padTop, Math.min(world - vh + padBottom, this.cam.y));
  },

  centerOn(tx, ty) {
    this.cam.x = tx * CFG.TILE - this.viewW() / this.cam.z / 2;
    this.cam.y = ty * CFG.TILE - this.viewH() / this.cam.z / 2;
    this.clampCam();
  },

  /* Is this world point actually on the player's screen right now? Used by the
     army banners, which only haul the camera when NOTHING of the army can be
     seen (tests/army-groups.mjs). The band excludes what the HUD covers — the
     top bar and the open build menu — because a soldier hidden behind the
     interface is not a soldier the player can see. A unit counts as visible
     when its SPRITE BOX overlaps the band, so one standing half off the edge
     still counts: the ask was "slightly in frame". */
  onScreen(wx, wy) {
    const z = this.cam.z, TL = CFG.TILE, half = TL * z * 0.5;
    const sx = (wx * TL - this.cam.x) * z;
    const sy = (wy * TL - this.cam.y) * z - CFG.SPRITE_LIFT * z;
    const top = this.topReserve || 0, bot = this.bottomReserve || 0;
    return sx + half > 0 && sx - half < this.viewW() &&
           sy + half > top && sy - half < this.viewH() - bot;
  },

  screenToWorld(sx, sy) {
    return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y };
  },
  screenToTile(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / CFG.TILE), y: Math.floor(w.y / CFG.TILE) };
  },

  float(x, y, txt, col) {
    if (this.floats.length > 40) this.floats.shift();
    this.floats.push({ x, y, txt, col, t: 1.0 });
  },

  /* ---- THE WORK TICK (tests/mortality.mjs … see workLine's neighbours) ----
     The white "+wood" over a worker's head is a GLANCE cue — an occasional
     tick so you can tell at sight what somebody is doing, without selecting
     them. It is NOT a running readout, and it used to behave like one: every
     gather step and every production step rolled for a float, so a working
     village wrote text over itself continuously (and the faster the game ran,
     the worse it got).

     It is now throttled per UNIT to roughly one float every WORK_FLOAT_S
     seconds. Measured, the old rules fired about once every 4 seconds per
     worker (a gather step's 0.3 roll on each integer tick; a station's
     dt*0.7), so 20s is about a FIFTH of what it was — which is the point:
     a tick, occasionally, not a readout. A village of ten still writes
     something every couple of seconds somewhere, which is what makes it
     readable at a glance; no single villager ever chatters.

     REAL time, not game days, for the same reason the heal limit is
     (UI.healThrottled): this is a rule about what the eye can take, not
     about the calendar — and it must not get worse as the game speeds up.
     The jitter is derived from the unit's id so a row of woodcutters never
     pulses in lockstep, and the log is render-side only — never on the unit,
     never in a save (same rule as R._dbA), cleared in onNewGame so reused
     ids can't inherit another run's timer. */
  WORK_FLOAT_S: 20,
  _workFloatAt: {},
  workFloat(u, txt) {
    const now = performance.now() / 1000;
    const last = this._workFloatAt[u.id];
    const gap = this.WORK_FLOAT_S * (0.75 + ((u.id * 37) % 50) / 100);
    // NO ENTRY means "due now", not "last ticked at time zero": the clock is
    // time-since-page-load, so treating a missing entry as 0 silently ate the
    // first tick of every worker for the first WORK_FLOAT_S seconds of a
    // session — the one tick that most wants to be seen, right after you give
    // somebody a job.
    if (last != null && now - last < gap) return false;
    this._workFloatAt[u.id] = now;
    this.float(u.x, u.y - 0.5, txt, '#d8e8b0');
    return true;
  },

  // impact burst at (x,y): 'stone'/'bolt' throw pale dust + dark debris that
  // fall and fade; 'flame' throws rising fire embers + a puff of grey smoke.
  // Particles are spawned once per hit (not per frame) and capped, so no
  // allocation storms — the draw loop only mutates them in place.
  impact(x, y, kind) {
    const P = this.particles, AP = ART.PALETTE, add = (o) => { if (P.length < 220) P.push(o); };
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (kind === 'flame') {
      for (let i = 0; i < 12; i++) {                       // fire embers, rising
        const a = rnd(-Math.PI, 0), s = rnd(1.2, 3.4);
        add({ x, y, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s - 1.2, t: 1, life: rnd(0.4, 0.8),
              col: AP.fire[(Math.random() * 3 + 1) | 0], sz: rnd(1.5, 3), g: -1.6 });
      }
      for (let i = 0; i < 5; i++)                           // smoke puff, drifts up
        add({ x, y: y - 0.2, vx: rnd(-0.6, 0.6), vy: rnd(-1.6, -0.7), t: 1, life: rnd(0.7, 1.1),
              col: i & 1 ? '#5a5248' : '#7a7268', sz: rnd(2.5, 4.5), g: -0.5, smoke: 1 });
    } else {
      const dust = kind === 'bolt' ? 6 : 10, deb = kind === 'bolt' ? 3 : 6;
      for (let i = 0; i < dust; i++) {                      // pale dust cloud
        const a = rnd(-Math.PI, 0), s = rnd(1, 3);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - 0.6, t: 1, life: rnd(0.3, 0.6),
              col: i & 1 ? AP.stone[3] : AP.bone[1], sz: rnd(1.5, 3), g: 4 });
      }
      for (let i = 0; i < deb; i++) {                       // dark chunks, thrown + falling
        const a = rnd(-Math.PI, 0), s = rnd(2, 4.5);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, t: 1, life: rnd(0.35, 0.7),
              col: kind === 'bolt' ? AP.wood[1] : AP.stone[1], sz: rnd(1.5, 2.5), g: 7 });
      }
    }
  },

  explored(x, y) { return S.map.explored[MapGen.idx(x, y)]; },

  /* ---- THE WOOD REACTS (tests/wild-life.mjs) ----
     Ambience that only ever ignores the world is wallpaper; ambience that
     REACTS is a living system. A fight breaking out, or a building coming
     down, throws every flock within earshot up and away and sends the
     critters bolting for cover. Cheap by construction: the ambient pool is
     capped at a handful of entities, so this is a short loop over ≤7 items,
     and it only ever retargets things that are already on screen. */
  /* who was fighting last frame — render-side only, so it never reaches a save
     file. A unit that gains a target it did not have is a fight STARTING, and
     that is the moment the birds go up. */
  _fighting: null,
  noteFights() {
    const now = new Set();
    for (const u of S.units) if (u.tUnit || u.tBld) now.add(u.id);
    if (this._fighting) {
      for (const id of now) {
        if (this._fighting.has(id)) continue;
        const u = Units.get(id);
        if (u) { this.startle(u.x, u.y, 8); break; }   // one scatter per outbreak is plenty
      }
    }
    this._fighting = now;
  },
  startle(x, y, r) {
    if (!this.ambient || !this.ambient.length) return;
    r = r || 9;
    for (const a of this.ambient) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d > r) continue;
      const dx = (a.x - x) || (Math.random() - 0.5), dy = (a.y - y) || (Math.random() - 0.5);
      const dd = Math.hypot(dx, dy) || 1;
      if (a.kind === 'flock') {
        a.vx = dx / dd * 3.4; a.vy = dy / dd * 1.9 - 1.5;   // climb, and get out
        a.dir = a.vx < 0 ? -1 : 1;
        a.ttl = Math.min(a.ttl, a.t + 2.2);
      } else if (a.kind === 'critter') {
        a.state = 'flee';                                    // straight back into cover
        a.ttl = Math.min(a.ttl, a.t + 1.6);
      } else {
        a.vx = dx / dd * 1.1; a.vy = dy / dd * 0.9;          // butterflies just scatter
        a.ttl = Math.min(a.ttl, a.t + 2.5);
      }
    }
  },

  // fortification auto-tiling: connect to any adjacent wall/gate — and brace
  // flush against water, mountains, and the map edge, so a wall anchored on an
  // obstacle reads as a stout, sealed junction instead of an open end-cap
  wallMaskAt(x, y, extra) {
    const conn = (xx, yy) => {
      if (!MapGen.inB(xx, yy)) return true;                 // map edge
      if (Bld.fortAt(xx, yy)) return true;                  // wall / gate ONLY (a house is not a curtain)
      // a finished TOWER standing IN the line bonds to it (see towerLinkMask)
      const tb = Bld.at(xx, yy);
      if (tb && tb.key === 'tower' && !(tb.construction > 0)) {
        const back = xx === x ? (yy < y ? 4 : 1) : (xx < x ? 2 : 8);   // dir from that tower back to us
        if (this.towerLinkMask(xx, yy).mask & back) return true;
      }
      const t = S.map.terrain[MapGen.idx(xx, yy)];
      if (t === T.WATER || t === T.MOUNTAIN) return true;   // natural barrier
      return !!(extra && extra.has(xx + ',' + yy));
    };
    return (conn(x, y - 1) ? 1 : 0) | (conn(x + 1, y) ? 2 : 0) |
           (conn(x, y + 1) ? 4 : 0) | (conn(x - 1, y) ? 8 : 0);
  },

  /* ---- WALL ↔ TOWER BOND (tests/wall-tower-bond.mjs) ----
     A tower raised IN a wall line should read as part of the curtain, the
     way a real castle's mural towers do — no gap, corners and T-junctions
     included. A tower merely standing BEHIND or IN FRONT of a line must not
     grow a stub toward it, so the rule is that the wall run has to pass
     THROUGH the tower along that axis:

       link toward a neighbouring wall/gate if the run continues on the
       tower's far side (a wall two out along the same axis), or the tower
       has a wall on the opposite side (it sits mid-line), or that
       neighbour is a lone stub with no run of its own yet (the first
       section a player lays out from a tower).

     Reads walls and gates only — never other towers — so it can never
     recurse. PURELY COSMETIC: Bld.blockAt and Path.passable are untouched,
     so a tower in the line stays a walkable door exactly as before (that is
     the wall-line contract, tests/wall-line.mjs). */
  _wgAt(x, y) {
    if (!MapGen.inB(x, y)) return null;
    const b = Bld.at(x, y);
    return b && (b.key === 'wall' || b.key === 'gate') ? b : null;
  },
  towerLinkMask(x, y) {
    let mask = 0, level = 0;
    for (const [dx, dy, bit] of [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]) {
      const nb = this._wgAt(x + dx, y + dy);
      if (!nb || nb.construction > 0) continue;
      let lone = true;                                     // a stub with no run of its own?
      for (const [ex, ey] of [[0, -1], [1, 0], [0, 1], [-1, 0]])
        if (this._wgAt(nb.x + ex, nb.y + ey)) { lone = false; break; }
      if (this._wgAt(x + dx * 2, y + dy * 2) || this._wgAt(x - dx, y - dy) || lone) {
        mask |= bit;
        if (!level) level = nb.level;                      // wear the curtain's own tier
      }
    }
    return { mask, level: level || 1 };
  },
  // the curtain's stonework reaching in to meet the tower, drawn UNDER it so
  // the tower's own body always sits on top of the joint
  drawTowerBond(g, b, bx, by, bw) {
    if (b.construction > 0) return;
    const lk = this.towerLinkMask(b.x, b.y);
    if (!lk.mask) return;
    const fam = Sprites.wallMask[Math.min(lk.level, Sprites.wallMask.length) - 1];
    g.drawImage(fam[lk.mask], bx, by, bw, bw);
    /* THE SEAM. A tower is drawn as an elevation — you see its face — while the
       curtain running north of it is drawn flat, from above. Butted together
       with nothing between, the wall reads as running ONTO the tower's roof
       ("the top tower is sitting on top of the wall"). A shadow line where the
       walk meets the tower's back reads instead as the wall passing BEHIND it,
       which is what is actually happening. Only the north link needs it: a wall
       to the south is nearer than the tower and is drawn over it anyway (the
       building list is sorted by footprint bottom edge). */
    if (lk.mask & 1) {
      g.fillStyle = 'rgba(24,18,12,0.55)';
      g.fillRect(bx + bw * 10 / 32, by, bw * 12 / 32, Math.max(1, bw * 2 / 32));
    }
  },
  /* Which way does this gate face? It faces the way its LINE runs — and the
     line is made of more than walls. A gate flanked by two towers (the classic
     gatehouse the player builds) read as neither axis under the old wall-only
     test, so it drew its east-west self inside a north-south curtain: the
     "tore down a wall, built a second gate, it never went back" bug. Towers
     that have bonded into the line now count, and the axes are SCORED rather
     than compared as booleans, so one wall to the east no longer cancels two
     towers north and south. Terrain deliberately does NOT count: a wall
     running east-west to a lake shore has water north and south of its gate,
     and counting it would spin the gate exactly the wrong way. */
  /* A curtain running SOUTH out of a mural tower must meet its flank at WALK
     HEIGHT, partway up the shaft — not at the tower's foot, where it reads as
     bolted onto the bottom of the tower. The tower's body is drawn OVER the
     bond stub, so the southern arm is drawn again on top of it, clipped to the
     curtain's own width and to everything below TOWER_WALK. The north arm
     needs the opposite treatment (it passes behind — see the seam in
     drawTowerBond), and the east/west arms already emerge at the right height
     because the wall band crosses the tower's middle. */
  TOWER_WALK: 17 / 32,
  drawTowerWalk(g, b, bx, by, bw) {
    if (b.construction > 0) return;
    const lk = this.towerLinkMask(b.x, b.y);
    if (!(lk.mask & 4)) return;                          // nothing coming from the south
    const fam = Sprites.wallMask[Math.min(lk.level, Sprites.wallMask.length) - 1];
    const y0 = by + bw * this.TOWER_WALK;
    g.save();
    g.beginPath();
    g.rect(bx + bw * 10 / 32, y0, bw * 12 / 32, by + bw - y0);   // the curtain's own width only
    g.clip();
    g.drawImage(fam[lk.mask], bx, by, bw, bw);
    g.restore();
  },
  /* ---- THE DRAWBRIDGE (tests/drawbridge.mjs) ----
     The deck is drawn OVER the finished gate sprite, from its own little
     atlas of stills (Sprites.drawbridge), because it moves and a baked sprite
     cannot. `_dbA` eases each gate's deck from lying flat (0) to standing
     against the arch (1) so the order plays as a swing rather than a snap —
     and it is RENDER STATE, kept off the building and out of every save, the
     same rule R._fighting and R.collapses follow. The rule the game actually
     obeys is Bld.rebuildBlock's: the tile seals the instant the order is
     given; the swing is what the player SEES happen. A gate first met already
     shut (a loaded save) starts settled rather than slamming on sight. */
  DB_SPEED: 1.7,          // a full swing in a little over half a second
  _dbA: {},
  /* A DRAWBRIDGE FALLS OUTWARD (tests/drawbridge.mjs). Which way that is comes
     from Bld.gateOutside, which reads the ground rather than the wall line —
     a stronghold is half masonry and half lake and mountain, so the wall alone
     never tells you which side is the courtyard.

     Three strips, and the deck's own geometry decides where each is drawn:
       flank, east   the authored side view
       flank, west   the same view MIRRORED about the tile's centre line — a
                     picture-plane rotation, so a mirror is exactly right
       face, south   the authored toward-the-camera view, drawn OVER the gate
       face, north   deckFaceAway, drawn UNDER it, so the curtain and the
                     gatehouse occlude its near end the way they really would
     `front` says which pass this is: the caller draws once before the gate
     sprite and once after, and each strip answers on the pass it belongs to. */
  drawDrawbridge(g, b, bx, by, bw, dt, front) {
    if (!Sprites.drawbridge || !Bld.canDrawbridge(b)) return;
    const vert = this.gateVerticalAt(b.x, b.y);
    const dir = Bld.gateOutside(b);          // +1 south / east, -1 north / west
    const away = !vert && dir < 0;           // the only case drawn behind the gate
    if (away === !!front) return;
    // the swing is eased here, on the pass that actually draws — never twice
    const tgt = b.raised ? 1 : 0;
    let a = this._dbA[b.id];
    if (a == null) a = tgt;
    else if (a !== tgt) {
      const step = Math.max(0, Math.min(0.2, dt || 0)) * this.DB_SPEED;
      a = tgt > a ? Math.min(tgt, a + step) : Math.max(tgt, a - step);
    }
    this._dbA[b.id] = a;
    const fam = Sprites.drawbridge[away ? 2 : vert ? 1 : 0];
    const fr = Math.max(0, Math.min(fam.length - 1, Math.round(a * (fam.length - 1))));
    // TWO tiles in the direction the deck falls — it spans a whole one
    if (away) {
      // the gate's tile is the BOTTOM half of that canvas; the tile above it is
      // the ground beyond the wall
      g.drawImage(fam[fr], bx, by - bw, bw, bw * 2);
    } else if (vert) {
      if (dir < 0) {                          // …falling WEST: mirror about the tile
        g.save();
        g.translate(bx + bw / 2, 0); g.scale(-1, 1); g.translate(-(bx + bw / 2), 0);
        g.drawImage(fam[fr], bx, by, bw * 2, bw);
        g.restore();
      } else g.drawImage(fam[fr], bx, by, bw * 2, bw);
    } else {
      g.drawImage(fam[fr], bx, by, bw, bw * 2);
    }
  },
  gateVerticalAt(x, y) {
    const score = (xx, yy) => {
      if (!MapGen.inB(xx, yy)) return 0;
      if (Bld.fortAt(xx, yy)) return 2;                    // wall or gate — the line itself
      const t = Bld.at(xx, yy);
      return t && t.key === 'tower' && !(t.construction > 0) ? 2 : 0;   // a mural tower stands IN it
    };
    const ns = score(x, y - 1) + score(x, y + 1), ew = score(x - 1, y) + score(x + 1, y);
    return ns > ew;
  },
  /* `lv` overrides which LEVEL's art to draw. Defaults to what the building
     is today — but a work site nearing completion must show the level it is
     becoming, not the one it is leaving (during an upgrade `b.level` is still
     the OLD level; it only increments in Bld.finishUpgrade). See the staged
     work-site branch below and tests/build-stages.mjs. */
  /* BLIT A BUILDING SPRITE, RESAMPLING HONESTLY.

     The world is drawn with `imageSmoothingEnabled = false` (see draw()) —
     right for pixel art authored at the tile grid, where a hard nearest-
     neighbour upscale is the whole look. But a sprite supplied by the asset
     manifest may be a SUPERSAMPLED MASTER several times the size of the tile
     rect it lands in (the Town Center L1 hut is 256×256 into ~110 screen px),
     and nearest-neighbour DOWN is not a look, it is decimation: seven of every
     eight pixels thrown away, on whichever phase the camera happens to land,
     so the thatch crawls and shimmers as you scroll.

     So: scaling a source DOWN turns smoothing on for that one blit and puts it
     straight back. Sprites at or below their destination size — every
     procedural sprite in the game — take the untouched nearest-neighbour path
     and are pixel-identical to before. */
  blitBld(g, spr, x, y, w, h) {
    const down = spr.width > w * 1.02;
    if (down) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
    g.drawImage(spr, x, y, w, h);
    if (down) g.imageSmoothingEnabled = false;
  },

  bldSprite(b, lv) {
    const L = Math.max(1, lv || b.level);
    if (b.key === 'wall') return Sprites.wallMask[Math.min(L, Sprites.wallMask.length) - 1][this.wallMaskAt(b.x, b.y)];
    if (b.key === 'gate') return Sprites.gateMask[Math.min(L, Sprites.gateMask.length) - 1][this.gateVerticalAt(b.x, b.y) ? 1 : 0];
    /* A TOWER HAS TWO SELVES. Built onto a wall it is a MURAL TOWER — a
       thicker, taller piece of the curtain in the same stone, no outline of
       its own, no door in its foot, the walk running into its flanks. Standing
       alone in open ground it stays the free-standing Watchtower, which is
       what a lone scout tower should look like. Work sites keep the ordinary
       sprite: what is being raised is the building, not the bond. */
    if (b.key === 'tower' && !(b.construction > 0) && Sprites.towerMural &&
        MapGen.inB(b.x, b.y) && this.towerLinkMask(b.x, b.y).mask)
      return Sprites.towerMural[Math.min(L, Sprites.towerMural.length) - 1];
    // a camp is the home of one of the five peoples, and looks like it
    if (b.key === 'raidercamp' && Sprites.camp && Sprites.camp[b.tribe]) return Sprites.camp[b.tribe];
    const fam = (b.owner === 'A' ? Sprites.buildingA : Sprites.building)[b.key];
    return fam[Math.min(L, fam.length) - 1];
  },

  /* ---- BURNING BUILDINGS (tests/burn-down.mjs) ----
     A damaged building shows its destruction in thirds (Bld.burnPhase):
       phase 0  small fires, the building itself untouched
       phase 1  bigger fires, the sprite scorched DARKER (darkOf)
       phase 2  a partially-DESTROYED look (ruinOf: roofline bitten out,
                remains charred), the fires guttering small again
     Variants are generated lazily per base canvas and cached in a WeakMap,
     so every building level, the rival's red set, and even wall/gate
     auto-tile masks get their scorched and ruined selves for free. */
  _burnCache: new WeakMap(),
  _burnEntry(base) {
    let e = this._burnCache.get(base);
    if (!e) { e = {}; this._burnCache.set(base, e); }
    return e;
  },
  darkOf(base) {
    const e = this._burnEntry(base);
    if (e.dark) return e.dark;
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';        // scorch ONLY the sprite's own pixels
    g.fillStyle = 'rgba(28,18,10,0.34)';
    g.fillRect(0, 0, c.width, c.height);
    const r = ART.rng(base.width * 7 + base.height);   // soot licks climbing from openings
    g.fillStyle = 'rgba(15,10,6,0.45)';
    for (let i = 0; i < Math.max(4, c.width >> 4); i++) {
      const sx = r() * c.width, sh = (0.2 + r() * 0.3) * c.height;
      g.fillRect(sx, r() * c.height * 0.5, Math.max(2, c.width * 0.03), sh);
    }
    return e.dark = c;
  },
  ruinOf(base) {
    const e = this._burnEntry(base);
    if (e.ruin) return e.ruin;
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';        // char what still stands
    g.fillStyle = 'rgba(24,15,8,0.48)';
    g.fillRect(0, 0, c.width, c.height);
    const r = ART.rng(base.width * 13 + base.height * 3);
    // BITE the structure apart — collapsed chunks torn out, biased hard to
    // the top half so the roofline reads fallen while the base still stands.
    // Bite ADAPTIVELY: keep tearing until the silhouette has measurably
    // shrunk (a dense full-tile mask needs more bites than an airy sprite).
    const count = (cv) => {
      try {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
        return n;
      } catch (_) { return null; }   // asset-pack image taint — bite blind
    };
    const before = count(c);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';                              // FULL-alpha eraser — a translucent one only singes
    g.fillRect(0, 0, c.width, c.height * 0.12);        // the very crown is always gone
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < Math.max(5, c.width >> 4); i++) {
        const bw = c.width * (0.05 + r() * 0.09), bh = c.height * (0.06 + r() * 0.12);
        g.fillRect(r() * (c.width - bw), r() * c.height * (i % 3 ? 0.4 : 0.7), bw, bh);
      }
      const now = count(c);
      if (before === null || now === null || now <= before * 0.87) break;
    }
    // charred rafter stubs and embers ON the remains (source-atop — the
    // wounds stay open; ruin must always read as LESS building, never more)
    g.globalCompositeOperation = 'source-atop';
    const AF = ART.PALETTE.fire;
    for (let i = 0; i < Math.max(3, c.width >> 5); i++) {
      const sx = (0.15 + r() * 0.7) * c.width, sy = (0.1 + r() * 0.3) * c.height;
      g.fillStyle = '#241a10';
      g.fillRect(sx, sy, Math.max(2, c.width * 0.025), (0.1 + r() * 0.12) * c.height);
      if (r() < 0.7) { g.fillStyle = AF[0]; g.fillRect(sx + 1, sy + 2, 2, 2); }
    }
    g.globalCompositeOperation = 'source-over';
    return e.ruin = c;
  },

  // the animated fires themselves, planted on the roof and at the foot of the
  // building; count and size follow the phase (small → BIG → small)
  /* ---- A TOWER DOESN'T BLAZE, IT CRUMBLES (tests/burn-down.mjs) ----
     There is next to nothing in a stone shaft to burn: what a battered tower
     does is SHED ITSELF. Small fires only (never the big roof blaze a timber
     hall gets), and the real signal is masonry spalling off the shaft and
     falling to the ground — each stone on its own falling cycle, seeded from
     the building id so it is deterministic per tower rather than jittering
     every frame, dust puffing where it breaks loose and again where it
     lands, and a rubble heap at the foot that grows with each third. The
     sprite phases underneath (scorched → part-destroyed) are unchanged. */
  drawTowerCrumble(g, b, bx, by, bw, ph) {
    const now = performance.now() / 1000;
    const ST = ART.PALETTE.stone;
    const hsh = (n) => ((((b.id * 2654435761 + n * 97531) >>> 0) >>> 5) % 1000) / 1000;
    const px = bw / 32, ground = 0.86;                  // one sprite-pixel; the foot of the shaft
    // --- rubble already down, banked around the base ---
    const piles = [2, 4, 7][ph];
    for (let i = 0; i < piles; i++) {
      const rx = bx + (0.22 + hsh(i + 40) * 0.56) * bw;
      const ry = by + (ground + hsh(i + 60) * 0.05) * bw;
      const w = (1 + (i % 3)) * px;
      g.fillStyle = i % 3 ? ST[1] : ST[2];
      g.fillRect(rx, ry, w * 2, w);
      g.fillStyle = ST[0];
      g.fillRect(rx, ry + w, w * 2, Math.max(1, w * 0.6));
    }
    /* --- stones breaking loose and falling. They tear off the SHAFT'S EDGE
       and fall clear of it, alternating sides: a grey stone dropping down a
       grey wall is invisible, and real spalling sheds away from the face
       anyway. Each carries a dark edge so it reads against grass and stone
       alike. --- */
    const live = [2, 3, 5][ph];
    for (let i = 0; i < live; i++) {
      const s = hsh(i);
      const period = 1.2 + s * 1.1;
      const t = ((now + s * 9) % period) / period;      // 0..1 through this stone's fall
      const left = i % 2 === 0;
      const x0 = left ? 0.30 - hsh(i + 10) * 0.04 : 0.70 + hsh(i + 10) * 0.04;
      const y0 = 0.26 + hsh(i + 20) * 0.30;             // from the upper shaft
      const out = (0.04 + hsh(i + 30) * 0.06) * (left ? -1 : 1);   // shed away from the face
      const fx = bx + (x0 + out * t) * bw;
      const fy = by + (y0 + (ground - y0) * t * t) * bw;   // gravity, not a drift
      const w = px * (i % 2 ? 2.4 : 1.6);                // chips of masonry, not boulders
      if (t < 0.10) {                                    // the spall: dust where it tears away
        g.globalAlpha = 0.55 * (1 - t / 0.10);
        g.fillStyle = ST[3];
        g.fillRect(bx + x0 * bw - px, by + y0 * bw, px * 3, px * 2);
        g.globalAlpha = 1;
      }
      if (t > 0.93) {                                    // it lands: a low puff, no stone
        g.globalAlpha = 0.5 * (1 - (t - 0.93) / 0.07);
        g.fillStyle = ST[2];
        g.fillRect(fx - px * 2, by + ground * bw, px * 5, px);
        g.globalAlpha = 1;
        continue;
      }
      g.fillStyle = ART.PALETTE.ink[0];                            // dark edge, so it always reads
      g.fillRect(fx - px * 0.4, fy - px * 0.4, w + px * 0.8, w + px * 0.8);
      g.fillStyle = ST[1]; g.fillRect(fx, fy, w, w);               // the chip
      g.fillStyle = ST[3]; g.fillRect(fx, fy, w, w * 0.5);         // its lit top face
      if (t > 0.3) {                                     // dust trailing the fall
        g.globalAlpha = 0.28;
        g.fillStyle = ST[2];
        g.fillRect(fx + w * 0.25, fy - w * 2, w * 0.5, w * 1.6);
        g.globalAlpha = 1;
      }
    }
    // --- and a little fire, never a blaze ---
    const beat = (performance.now() / 130) | 0;
    const fires = ph === 1 ? [[0.40, 0.42], [0.62, 0.66]] : [[0.52, 0.55]];
    for (let i = 0; i < fires.length; i++) {
      const sz = 0.3 * bw;
      Assets.drawSprite(g, 'misc/flameSmall/' + ((beat + i * 2 + b.id) % 4),
        bx + fires[i][0] * bw - sz / 2, by + fires[i][1] * bw - sz * 0.9, { w: sz, h: sz });
    }
  },

  /* ================= THE COLLAPSE (tests/burn-down.mjs) =================
     Burning is the long signal; the COLLAPSE is the payoff. When a building
     whose kind is registered below is DESTROYED it topples once, on screen,
     in its own cloud of dust — the reward for the minute of work it took to
     chew through a stone shaft.

     The registry is the whole extension point: put a key in R.COLLAPSE and
     that building gets a collapse, with no other code touched. Today only the
     TOWER has one — walls, gates and every other building come down exactly
     as they always did (they simply aren't in the table).

     Frames are CUT FROM THE BUILDING'S OWN SPRITE by default, not drawn by
     hand, so a collapse is free for every level, the rival's red set, and the
     mural tower's bonded self alike: the block above the break line rotates
     about the break, the stump below crumbles down after it, masonry is
     thrown clear, and dust rolls out along the ground and rises over the
     rubble. Sheets cache per base canvas — one generation per artwork.

     A kind that wants BESPOKE art instead just draws it, the same way the
     build stages do: sprites labelled `misc/<key>Fall1..N` take over the whole
     animation (R.COLLAPSE_ART). They are drawn over the same roomy canvas the
     generated frames use — COLLAPSE_PAD is the single source of truth for that
     geometry, so authored art and cut art land in exactly the same place.

     The live animations live on R and NEVER in S — same rule as R._fighting.
     A save file has no business remembering a puff of dust. */
  COLLAPSE: {
    // key → how that kind comes down.
    //   frames  how many looks the topple is cut into (5–10 reads as a fall)
    //   ms      how long the whole thing takes
    //   pivot   where the shaft SNAPS, as a fraction of the sprite's height
    //   lean    radians the toppling block sweeps through
    //   spread  how far the dust rolls, in sprite widths
    tower: { frames: 8, ms: 1500, pivot: 0.62, lean: 1.55, spread: 1.15 },
  },
  // how much ROOMIER than the building's own footprint a collapse frame is —
  // shared by the generated sheet and by any authored `<key>Fall` art
  COLLAPSE_PAD: { w: 2.5, h: 1.6, x: 0.75, y: 0.45 },
  collapses: [],                 // live one-shots: {x,y,sz,spr,cfg,t,flip,art}
  marvel: null,                  // the wonder's held frame: {x,y,t,name,blurb} — never in S

  // does this kind carry hand-drawn collapse art? (returns the frame count)
  collapseArt(key, frames) {
    if (!Sprites.misc || !Sprites.misc[key + 'Fall1']) return 0;
    let n = 0;
    while (n < frames && Sprites.misc[key + 'Fall' + (n + 1)]) n++;
    return n;
  },

  startCollapse(b) {
    const cfg = this.COLLAPSE[b.key];
    if (!cfg) return;                              // this kind doesn't topple
    /* A WORK SITE HAS NOTHING TO TOPPLE. The collapse is cut from the
       BUILDING'S OWN SPRITE (bldSprite), and a site's sprite is the finished
       tower — so knocking down a half-raised shaft played the frame sequence
       staked plot → scaffold → a whole finished tower → the whole thing
       falling over, which is the building's life story run backwards in one
       second. A site simply stops being a site and leaves its rubble, the
       same way every other unfinished building dies. An UPGRADING tower is a
       standing tower and still comes down. */
    if (b.construction > 0) return;
    if (this.collapses.length > 12) this.collapses.shift();
    const TL = CFG.TILE, sz = Bld.size(b);
    /* THE GROUND KEEPS ITS FACE UNTIL THE TOWER IS DOWN. Bld.removeToRuin
       lays rubble the instant the building dies and bakes it straight into
       the terrain cache — so without this the brown scar appeared UNDER a
       tower that was still standing, giving the ending away a second early.
       (The ash pile is held back for the same reason — see collapseAt.)
       Snapshot the ground NOW, while it is still whole; drawCollapseGround
       stamps it back over the cache each frame until the topple ends. It
       rides on the one-shot, so like everything else here it never reaches a
       save. startCollapse must therefore keep running BEFORE removeToRuin. */
    let ground = null;
    if (this.terrainCache) {
      ground = document.createElement('canvas');
      ground.width = sz * TL; ground.height = sz * TL;
      ground.getContext('2d').drawImage(this.terrainCache,
        b.x * TL, b.y * TL, sz * TL, sz * TL, 0, 0, sz * TL, sz * TL);
    }
    this.collapses.push({
      x: b.x, y: b.y, sz, cfg, t: 0, key: b.key,
      spr: this.bldSprite(b),                      // snapshot: it's about to be gone
      art: this.collapseArt(b.key, cfg.frames),    // …unless this kind draws its own
      flip: (b.id & 1) === 1,                      // half the towers fall the other way
      ground,
    });
  },
  // the held ground, stamped straight after the terrain layer so bridges,
  // buildings, units and effects all still draw on top of it as normal
  drawCollapseGround(g) {
    const TL = CFG.TILE;
    for (const c of this.collapses) if (c.ground) g.drawImage(c.ground, c.x * TL, c.y * TL);
  },

  _collapseCache: new WeakMap(),
  collapseSheet(base, cfg) {
    let sheet = this._collapseCache.get(base);
    if (sheet) return sheet;
    const N = cfg.frames, W = base.width, H = base.height;
    // the frames are ROOMIER than the tile: the dust rolls out to either side
    // and rises well above where the crown used to be
    const PD = this.COLLAPSE_PAD;
    const cw = W * PD.w, ch = H * PD.h, ox = W * PD.x, oy = H * PD.y;
    const px = W / 32;                             // one sprite pixel
    const Q = (v) => Math.round(v / px) * px;      // keep every particle on the pixel grid
    const gy = oy + H * (30 / 32);                 // the ground line every fortification stands on
    const pivX = ox + W * 0.5, pivY = oy + H * cfg.pivot;
    const ST = ART.PALETTE.stone, RK = ART.PALETTE.rock, INK = ART.PALETTE.ink;
    const DUST = [ST[2], ST[3], RK[3], ST[4]];
    sheet = [];
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;

      /* --- 1. the block ABOVE the break, sweeping down about the break ---
         Squared easing, because a falling tower doesn't tip at a constant
         rate — it hangs, then goes. It shatters as it lands (`gone`), which
         is what hands the frame over to the rubble heap. */
      const ease = Math.min(1, Math.pow(p / 0.82, 1.8));
      const ang = cfg.lean * ease;                   // ~90° by the time it lands
      // …and it SLIDES DOWN the stump as it goes, so it finishes lying ON the
      // ground rather than pivoting in mid-air at the height of the break
      const drop = (gy - pivY) * Math.min(1, Math.pow(p / 0.85, 2));
      const gone = Math.max(0, (p - 0.84) / 0.16);   // only then does it break up
      if (gone < 1) {
        g.save();
        g.globalAlpha = 1 - gone;
        g.translate(pivX, pivY + drop);
        g.rotate(ang);
        g.translate(-pivX, -pivY);
        g.beginPath(); g.rect(0, 0, cw, pivY); g.clip();   // cut at the break line
        g.drawImage(base, ox, oy);
        g.restore();
      }

      /* --- 2. the STUMP still standing. It judders early (the shaft losing
         its footing) and then crumbles DOWN from the break to the ground. --- */
      const eaten = Math.min(1, Math.max(0, (p - 0.42) / 0.5));
      const stumpTop = pivY + (gy - pivY) * eaten;
      if (stumpTop < gy - px) {
        g.save();
        const jit = p > 0.05 && p < 0.5 ? (i % 2 ? px : -px) : 0;
        g.beginPath(); g.rect(0, stumpTop, cw, ch - stumpTop); g.clip();
        g.drawImage(base, ox + jit, oy);
        if (p > 0.2) {                               // and darkens as it breaks up
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = 'rgba(26,20,12,' + (0.45 * Math.min(1, (p - 0.2) * 2)).toFixed(2) + ')';
          g.fillRect(0, 0, cw, ch);
        }
        g.restore();
      }

      /* --- 3. masonry thrown clear. Each stone breaks loose on its own beat
         and flies a parabola from the break out to the ground. --- */
      const rc = ART.rng(9173);
      for (let k = 0; k < 13; k++) {
        const a0 = rc(), a1 = rc(), a2 = rc(), a3 = rc();
        const t = (p - (0.14 + a0 * 0.36)) / 0.58;
        if (t <= 0 || t >= 1) continue;
        const side = a1 < 0.42 ? -1 : 1;             // biased with the topple
        const fx = Q(pivX + side * (0.18 + a2 * 0.52) * W * t);
        const fy = Q(pivY - H * 0.05 + (gy - pivY) * t * t - H * (0.08 + a3 * 0.14) * 4 * t * (1 - t));
        const w = px * (1 + (k % 2));
        // a chip of masonry, not a die: dark under-edge only (so it still
        // reads flying over grass), stone body, one lit pixel on top
        g.fillStyle = INK[0]; g.fillRect(fx, fy + px * 0.5, w + px * 0.5, w);
        g.fillStyle = ST[1]; g.fillRect(fx, fy, w, w);
        g.fillStyle = ST[2]; g.fillRect(fx, fy, w, px * 0.5);
      }

      /* --- 4. the RUBBLE the tower becomes: a heap banked over its own
         footprint, growing from the moment the block lands. --- */
      const heap = Math.max(0, (p - 0.48) / 0.52);
      if (heap > 0) {
        const rr = ART.rng(5501);
        const hw = W * 0.34 * (0.6 + heap * 0.4);    // a MOUND: banked high in the
        for (let k = 0; k < 34; k++) {               // middle, thinning to nothing at its skirts
          const b0 = rr(), b1 = rr(), b2 = rr();
          if (b0 > heap * 1.25) continue;            // stones arrive as the heap builds
          const u = (b1 - 0.5) * 2;
          const crest = H * 0.21 * heap * (1 - u * u);
          const hx = Q(pivX + u * hw);
          const hy = Q(gy - px * 2 - crest * (0.25 + b2 * 0.75));
          const w = px * (1 + (k % 2));
          g.fillStyle = INK[0]; g.fillRect(hx, hy + px * 0.5, w * 2 + px * 0.5, w);
          g.fillStyle = k % 3 ? ST[1] : ST[2]; g.fillRect(hx, hy, w * 2, w);
          g.fillStyle = ST[3]; g.fillRect(hx, hy, w * 2, px * 0.5);
        }
      }

      /* --- 5. THE DUST. Half of it puffs off the shaft as it goes over; the
         rest bursts at the impact and ROLLS OUT ALONG THE GROUND, which is
         what a real collapse looks like. Blocky puffs, on the pixel grid,
         because everything else in this game is. --- */
      const rp = ART.rng(3121);
      for (let k = 0; k < 38; k++) {
        const d0 = rp(), d1 = rp(), d2 = rp(), d3 = rp();
        // even puffs come off the falling shaft, odd ones burst at the impact
        const birth = k % 2 ? 0.50 + d0 * 0.22 : 0.10 + d0 * 0.34;
        const t = (p - birth) / (1 - birth);
        if (t <= 0) continue;
        const side = d1 < 0.5 ? -1 : 1;
        const roll = Math.min(1, t * 1.3);
        const cx = Q(pivX + side * (0.12 + d2 * cfg.spread) * W * roll);
        const rise = (k % 2 ? 0.06 + d3 * 0.34 : 0.16 + d3 * 0.52) * H;
        const cy = Q(gy - rise * roll);
        const sz = Q(px * (1.8 + d3 * 3.2) * (0.6 + t * 1.4));
        // it thins as it drifts but never wipes clean — a haze still hangs
        // over the rubble on the last frame
        g.globalAlpha = Math.max(0, 0.30 * (1 - t * 0.86) * Math.min(1, t * 5));
        g.fillStyle = DUST[k % DUST.length];
        g.fillRect(cx - sz, cy - sz * 0.6, sz * 2, sz * 1.2);
        g.fillRect(cx - sz * 0.6, cy - sz, sz * 1.2, sz * 2);
        g.globalAlpha = 1;
      }
      // the low wash rolling out along the ground — the signature of a real
      // collapse, and the last thing to settle
      if (p > 0.45) {
        const wash = Math.min(1, (p - 0.45) / 0.25);
        for (let k = 0; k < 3; k++) {
          g.globalAlpha = 0.13 * wash * (1 - Math.max(0, (p - 0.66) / 0.5)) * (1 - k * 0.28);
          g.fillStyle = DUST[k];
          const ww = W * (0.45 + wash * (0.5 + k * 0.30));
          const wh = px * (3 + k * 3) * wash;
          g.fillRect(Q(pivX - ww), Q(gy - wh), Q(ww * 2), Q(wh));
        }
        g.globalAlpha = 1;
      }
      sheet.push(c);
    }
    this._collapseCache.set(base, sheet);
    return sheet;
  },

  /* ================= KEELING OVER (tests/mortality.mjs) =================
     A villager's time is up. Six frames, cut from THAT VILLAGER'S OWN sprite
     — so the tunic dye and the man/woman variants come along for free — of
     them going over: a stagger, the slow tip about their own heels, flat on
     the ground, and then gone, with a puff of dust where they land. The body
     disappears at the end of the sheet; the station they were standing at is
     simply empty from that moment.

     Frames are the SAME SIZE as an ordinary unit sprite, so they draw through
     the identical box at the identical offset (a figure lying flat is about
     as wide as it was tall, and both fit inside the 64px sheet). The live
     one-shots sit on R.deaths and never in S — same rule as R.collapses. */
  DEATH_FRAMES: 6,
  deaths: [],                    // live one-shots: {x,y,spr,t,flip}
  _deathCache: new WeakMap(),
  deathSheet(base) {
    let sheet = this._deathCache.get(base);
    if (sheet) return sheet;
    const N = this.DEATH_FRAMES, W = base.width, H = base.height;
    const px = W / 32;
    const pivX = W * 0.5, pivY = H * 0.82;      // their heels: what they turn about
    const ST = ART.PALETTE.stone, SO = ART.PALETTE.soil;
    sheet = [];
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      // the tip: a slow stagger, then over they go, faster as they fall
      const ang = 1.55 * Math.min(1, Math.pow(p / 0.82, 1.9));
      // they lie there plainly for a beat before fading — a body that starts
      // dissolving on the way down never reads as having LANDED
      const gone = Math.max(0, (p - 0.74) / 0.26);
      g.save();
      g.globalAlpha = 1 - gone;   // GONE by the last frame — only the dust is left
      g.translate(pivX, pivY);
      g.rotate(ang);
      g.translate(-pivX, -pivY);
      // a small sag as the knees give, so it isn't a rigid plank falling over
      g.drawImage(base, 0, Math.round(px * 2 * Math.sin(p * Math.PI)));
      g.restore();
      if (p > 0.45) {                            // dust where they come down
        const d = Math.min(1, (p - 0.45) / 0.35);
        const rr = ART.rng(97);
        for (let k = 0; k < 7; k++) {
          const s = rr(), side = k % 2 ? 1 : -1;
          const dx = pivX + side * (2 + s * 12) * d * px * 0.6;
          const dy = pivY + px * (1 + s * 2) - d * px * 3;
          g.globalAlpha = 0.5 * (1 - d) + 0.08;
          g.fillStyle = k % 3 ? SO[2] : ST[3];
          const sz = px * (1.6 + s * 2.2);
          g.fillRect(Math.round(dx - sz / 2), Math.round(dy), Math.round(sz), Math.round(px));
          g.globalAlpha = 1;
        }
      }
      sheet.push(c);
    }
    this._deathCache.set(base, sheet);
    return sheet;
  },
  startDeath(u) {
    if (this.deaths.length > 8) this.deaths.shift();
    this.deaths.push({
      x: u.x, y: u.y, t: 0,
      spr: this.unitSprite(u),                   // snapshot: they are about to be gone
      flip: (u.id & 1) === 1,                    // half of them fall the other way
    });
  },
  drawDeaths(g, dt) {
    const TL = CFG.TILE, ms = (CFG.MORTALITY && CFG.MORTALITY.animMs) || 1500;
    for (let i = this.deaths.length - 1; i >= 0; i--) {
      const d = this.deaths[i];
      d.t += dt;
      const p = d.t / (ms / 1000);
      if (p >= 1) { this.deaths.splice(i, 1); continue; }
      if (!G.visibleAt(d.x | 0, d.y | 0)) continue;
      const sheet = this.deathSheet(d.spr);
      const f = Math.min(sheet.length - 1, (p * sheet.length) | 0);
      const ux = d.x * TL - TL / 2, uy = d.y * TL - TL / 2 - CFG.SPRITE_LIFT;
      g.save();
      if (d.flip) { g.translate(ux + TL / 2, 0); g.scale(-1, 1); g.translate(-(ux + TL / 2), 0); }
      g.drawImage(sheet[f], ux, uy, TL, TL);
      g.restore();
    }
  },

  // is a topple still playing over this tile? (the ash it leaves waits for it)
  collapseAt(x, y) {
    for (const c of this.collapses)
      if (x >= c.x && x < c.x + c.sz && y >= c.y && y < c.y + c.sz) return c;
    return null;
  },

  // advance and draw the live topples. Called from the frame loop AFTER the
  // units, so the dust rolls over whoever knocked the thing down.
  drawCollapses(g, dt) {
    const TL = CFG.TILE;
    for (let i = this.collapses.length - 1; i >= 0; i--) {
      const c = this.collapses[i];
      c.t += dt;
      const p = c.t / (c.cfg.ms / 1000);
      if (p >= 1) { this.collapses.splice(i, 1); continue; }
      if (!G.visibleAt(c.x, c.y)) continue;        // a tower falling in the fog is not seen
      const PD = this.COLLAPSE_PAD;
      const bw = c.sz * TL, bx = c.x * TL, by = c.y * TL;
      const dx = bx - bw * PD.x, dy = by - bw * PD.y, dw = bw * PD.w, dh = bw * PD.h;
      g.save();
      if (c.flip) { g.translate(bx + bw / 2, 0); g.scale(-1, 1); g.translate(-(bx + bw / 2), 0); }
      if (c.art) {                                 // this kind draws its own fall
        const f = Math.min(c.art - 1, (p * c.art) | 0);
        Assets.drawSprite(g, 'misc/' + c.key + 'Fall' + (f + 1), dx, dy, { w: dw, h: dh });
      } else {
        const sheet = this.collapseSheet(c.spr, c.cfg);
        const f = Math.min(sheet.length - 1, (p * sheet.length) | 0);
        g.drawImage(sheet[f], dx, dy, dw, dh);
      }
      g.restore();
    }
  },

  /* ---- THE WONDER'S SHINE (tests/wonder.mjs) ----
     Seventy thousand of everything and forty-five days went into this, and
     for the rest of the run it has to look like it. Not a glow filter — a
     slow warm radiance that breathes over the monument, and gold motes that
     drift up off it and fade, drawn on a CONTINUOUS clock so nothing snaps.
     Cheap: one gradient and a dozen little rects. */
  drawWonderShine(g, b, bx, by, bw) {
    const now = performance.now() / 1000;
    const cx = bx + bw / 2, cy = by + bw * 0.55;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.8);
    const rad = bw * (0.62 + pulse * 0.05);
    const grd = g.createRadialGradient(cx, cy, bw * 0.10, cx, cy, rad);
    grd.addColorStop(0, 'rgba(255,238,175,' + (0.16 + pulse * 0.07).toFixed(3) + ')');
    grd.addColorStop(0.55, 'rgba(240,200,110,' + (0.07 + pulse * 0.03).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(232,193,90,0)');
    const old = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grd;
    g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    g.globalCompositeOperation = old;
    // motes lifting off the stone, each on its own slow cycle
    const GD = ART.PALETTE.gold, px = bw / 96;
    for (let i = 0; i < 11; i++) {
      const s = ((i * 2654435761) >>> 8) % 1000 / 1000;
      const period = 3.4 + s * 2.6;
      const t = ((now + s * 11) % period) / period;
      const mx = bx + (0.14 + s * 0.72) * bw + Math.sin(now * 0.9 + i) * bw * 0.03;
      const my = by + bw * (0.86 - t * 0.78);
      g.globalAlpha = Math.min(1, t * 4) * (1 - t) * 0.85;
      g.fillStyle = i % 3 ? GD[3] : GD[2];
      g.fillRect(mx, my, px * 2, px * 2);
      g.globalAlpha = 1;
    }
  },

  /* ---- THE MARVEL (tests/wonder.mjs) ----
     The monument is finished and the run is won — but the player is NOT
     snapped straight to a score screen. The world holds still for
     CFG.WONDER.marvelMs with the camera on the thing and its name across the
     bottom of the frame, and only then does the victory screen come up.
     G.wonderRaised owns the clock; this only draws it. Screen space, so it
     runs after the world transform has been reset. */
  drawMarvel(g, dt) {
    const m = this.marvel;
    if (!m) return;
    m.t += dt;
    const W = this.cv.width, H = this.cv.height;
    const fade = Math.min(1, m.t * 1.2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    /* The canvas runs the WHOLE viewport, but the HUD sits on top of it in the
       DOM — so the caption has to live in the open band between the status bar
       and the bottom bar, or it is drawn underneath them and nobody ever sees
       it. Measure BOTH bars as they stand right now, once, when the marvel
       starts: R.topReserve/bottomReserve are learned lazily elsewhere and are
       still 0 in a session where the camera has not been clamped yet. Canvas
       pixels are CSS pixels × dpr. */
    if (m.top == null) {
      const tb = document.getElementById('topbar'), bb = document.getElementById('bottombar');
      const dpr = this.dpr || 1;
      m.top = (tb ? tb.offsetHeight : 0) * dpr || (this.topReserve || 0);
      m.bot = (bb ? bb.offsetHeight : 0) * dpr || (this.bottomReserve || 0);
    }
    const top = m.top, bot = m.bot;
    const openH = Math.max(120, H - top - bot);
    const midY = top + openH * 0.5;
    // a warm vignette closing gently in from the edges of the open frame
    const vg = g.createRadialGradient(W / 2, midY, Math.min(W, openH) * 0.16,
      W / 2, midY, Math.max(W, openH) * 0.72);
    vg.addColorStop(0, 'rgba(255,236,180,0)');
    vg.addColorStop(0.6, 'rgba(90,60,20,' + (0.20 * fade).toFixed(3) + ')');
    vg.addColorStop(1, 'rgba(24,16,8,' + (0.55 * fade).toFixed(3) + ')');
    g.fillStyle = vg; g.fillRect(0, top, W, openH);
    const band = Math.min(92, openH * 0.24), bandY = top + openH - band;
    g.fillStyle = 'rgba(18,14,9,' + (0.72 * fade).toFixed(3) + ')';
    g.fillRect(0, bandY, W, band);
    g.fillStyle = 'rgba(232,193,90,' + (0.9 * fade).toFixed(3) + ')';
    g.fillRect(0, bandY, W, 2);
    g.textAlign = 'center';
    g.globalAlpha = fade;
    g.fillStyle = '#f3dc9a';
    g.font = 'bold ' + Math.round(Math.min(26, W / 15)) + 'px sans-serif';
    g.fillText((m.name || '').toUpperCase(), W / 2, bandY + Math.round(band * 0.42));
    g.fillStyle = '#cbb98a';
    g.font = Math.round(Math.min(14, W / 30)) + 'px sans-serif';
    // the blurb can be longer than a phone is wide — wrap it onto two lines
    const words = String(m.blurb || '').split(' ');
    const lines = [''];
    for (const wd of words) {
      const t2 = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd;
      if (g.measureText(t2).width > W - 28 && lines.length < 2) lines.push(wd);
      else lines[lines.length - 1] = t2;
    }
    lines.forEach((ln, i) => g.fillText(ln, W / 2, bandY + Math.round(band * (0.66 + i * 0.20))));
    g.globalAlpha = 1;
    g.textAlign = 'left';
  },

  /* ---- BANNERS THAT FLY (tests/banners-smoke.mjs) ----
     The POLES are baked into the building sprites; the CLOTH is drawn here,
     every frame, for two reasons: it can ripple, and it can wear the tribe's
     own tunic dye instead of the generic blue/red the sprite sets are built
     in — a purple village flies purple. Anchors are tile FRACTIONS measured
     off the sprite art (the 16-grid ones are c/16, the fine 32-grid ones
     c/32), so they scale with zoom and with the 2×2 hall for free. `lv` is
     the level the pole first appears at — ART.tierDress puts most banners at
     3, while the barracks and the war camp carry theirs from the start. */
  BANNER_AT: {
    barracks: [{ x: 14.25 / 32, y: 4.4 / 32, w: 6 / 32, h: 7 / 32, lv: 1 }],   // the tallest yard post
    warcamp:  [{ x: 19.1 / 32, y: 4.5 / 32, w: 4 / 32, h: 5 / 32, lv: 1, left: true }],  // the bare standard pole
    range:    [{ x: 14 / 16, y: 0, w: 3 / 16, h: 3 / 16, lv: 3 }],
    trade:    [{ x: 15 / 16, y: 0, w: 3 / 16, h: 3 / 16, lv: 3 }],
    sapper:   [{ x: 1 / 16, y: 0, w: 3 / 16, h: 3 / 16, lv: 3 }],
    dock:     [{ x: 4 / 32, y: 3 / 32, w: 3 / 32, h: 3 / 32, lv: 3 }],
    siege:    [{ x: 3 / 32, y: 4 / 32, w: 3 / 32, h: 3 / 32, lv: 3 }],
    tc:       [{ x: 5 / 32, y: 3 / 32, w: 4 / 32, h: 4 / 32, lv: 3 },
               { x: 23 / 32, y: 3 / 32, w: 4 / 32, h: 4 / 32, lv: 3, left: true }],
    // the gatehouse flies a standard from each flanking tower — and its poles
    // move with the gate's ORIENTATION, so it keeps a set of anchors per axis
    gate:     [{ x: 7 / 32, y: 1 / 32, w: 4 / 32, h: 4 / 32, lv: 3 },
               { x: 22 / 32, y: 1 / 32, w: 4 / 32, h: 4 / 32, lv: 3, left: true }],
    gateV:    [{ x: 9 / 32, y: 0, w: 4 / 32, h: 4 / 32, lv: 3 },
               { x: 9 / 32, y: 17 / 32, w: 4 / 32, h: 4 / 32, lv: 3 }],
  },
  drawBanners(g, b, bx, by, bw) {
    const set = b.key === 'gate'
      ? (this.gateVerticalAt(b.x, b.y) ? this.BANNER_AT.gateV : this.BANNER_AT.gate)
      : this.BANNER_AT[b.key];
    if (!set || b.construction > 0) return;                 // no colours over a work site
    const dye = (Sprites.tunicCol || {})[G.tunicOf(b.owner)] || { body: '#3f6d99', accent: '#2c4e70' };
    const now = performance.now() / 1000;
    for (let s = 0; s < set.length; s++) {
      const a = set[s];
      if (b.level < a.lv) continue;                          // the pole isn't there yet
      const w = a.w * bw, h = a.h * bw, x0 = bx + a.x * bw, y0 = by + a.y * bw;
      const cols = Math.max(3, Math.round(w));
      const cw = w / cols;
      const ph = b.id * 0.7 + s * 1.9;
      for (let i = 0; i < cols; i++) {
        // the ripple: each column further from the pole lags a little more and
        // swings a little wider, which is what reads as cloth catching wind
        const f = a.left ? (cols - 1 - i) / cols : i / cols;
        const wave = Math.sin(now * 3.1 - f * 2.6 + ph) * h * 0.16 * (0.25 + f);
        const cx = x0 + i * cw;
        const cy = y0 + wave;
        // the fly end tapers, so the banner reads as cloth and not a slab
        const ch = h * (1 - f * 0.18);
        g.fillStyle = dye.body; g.fillRect(cx, cy, Math.ceil(cw), ch);
        g.fillStyle = dye.accent; g.fillRect(cx, cy + ch - Math.max(1, h * 0.16), Math.ceil(cw), Math.max(1, h * 0.16));
        if (i === 0) { g.fillStyle = dye.accent; g.fillRect(cx, cy, Math.max(1, cw * 0.5), ch); }  // shadowed fold at the pole
      }
    }
  },

  /* ---- HEARTH SMOKE (tests/banners-smoke.mjs) ----
     A village should look INHABITED. Homes and halls breathe a thin column of
     smoke that drifts and fades as it rises — three puffs on a slow loop,
     seeded per building so no two chimneys pulse together. Only finished
     buildings smoke (a work site has no hearth yet), and a building far gone
     in flames doesn't bother — its own fire is already the story. */
  SMOKE_AT: {
    house:   { x: 13.9 / 32, y: 4.75 / 32 },  // the dome's own roof-hole
    tc:      { x: 15.7 / 32, y: 3 / 32 },     // the hall's roof-hole / ridge
    lodge:   { x: 17.6 / 32, y: 10.25 / 32 }, // the lean-to's own ridge
    warcamp: { x: 9.7 / 32, y: 21.5 / 32 },   // the fire ring
    trade:   { x: 8.75 / 32, y: 9.4 / 32 },   // beside the hanging pots
  },
  drawHearthSmoke(g, b, bx, by, bw) {
    const a = this.SMOKE_AT[b.key];
    if (!a || b.construction > 0) return;
    if (Bld.burnPhase(b) >= 1) return;                       // it's on fire; that's smoke enough
    const now = performance.now() / 1000;
    const ox = bx + a.x * bw, oy = by + a.y * bw;
    const seed = (b.id * 0.37) % 1;
    for (let i = 0; i < 3; i++) {
      const t = ((now * 0.42 + seed + i / 3) % 1);           // 0..1 up the column
      const rise = t * bw * 0.55;
      const drift = Math.sin(now * 0.9 + i * 2 + b.id) * bw * 0.09 * t;
      const sz = Math.max(1, bw * (0.05 + t * 0.055));
      g.globalAlpha = 0.34 * (1 - t) * (1 - t * 0.3);
      g.fillStyle = '#cfcac0';
      g.fillRect(ox + drift - sz / 2, oy - rise - sz, sz, sz);
      if (t > 0.35) {                                        // the column frays as it climbs
        g.globalAlpha *= 0.7;
        g.fillRect(ox + drift * 1.5 + sz * 0.4, oy - rise - sz * 1.6, sz * 0.7, sz * 0.7);
      }
    }
    g.globalAlpha = 1;
  },

  /* ---- THE DOORYARD CAMPFIRE ----
     A standalone sprite (assets/tc-l1-fire.png, manifest key misc/campfireTc),
     composited here rather than baked into the hut master — the hut and the
     fire can now each carry their own supersampled detail density without
     one dragging the other's downscale math along. CAMPFIRE_AT is measured
     against the ACTUAL art (the old baked-in position, 0.78/1.64 tile units,
     was tuned for a composition this hut replaced and had drifted loose of
     the stone ring — the floating-glyph bug). blitBld, not Assets.drawSprite,
     because this master is supersampled exactly like the hut's and needs the
     same smoothing-on-downscale treatment or it shimmers as the camera moves.
     A light scale/alpha pulse stands in for the flicker the old baked flame
     used to fake with three raw fillRects — cheap, and never fights the
     fine-grained flame already painted into the master. */
  CAMPFIRE_AT: {
    tc: { x: 10.9 / 32, y: 29.4 / 32 },   // the dooryard, in front of the door
  },
  drawCampfire(g, b, bx, by, bw) {
    const a = this.CAMPFIRE_AT[b.key];
    if (!a || b.construction > 0) return;
    const spr = Assets.resolve('misc/campfireTc');
    if (!spr) return;
    const now = performance.now() / 1000;
    const pulse = 1 + Math.sin(now * 5.3 + b.id) * 0.035;       // a slow flicker breathing
    const w = bw * 0.24 * pulse, h = w * (spr.height / spr.width);
    const ox = bx + a.x * bw - w / 2, oy = by + a.y * bw - h / 2;
    g.globalAlpha = 0.94 + Math.sin(now * 9.1 + b.id * 3) * 0.06;
    this.blitBld(g, spr, ox, oy, w, h);
    g.globalAlpha = 1;
  },

  drawBurn(g, b, bx, by, bw) {
    const ph = Bld.burnPhase(b);
    if (ph < 0) return;
    // stone sheds; timber burns
    if (b.key === 'tower') return this.drawTowerCrumble(g, b, bx, by, bw, ph);
    const beat = (performance.now() / 130) | 0;
    const hsh = (n) => ((((b.id * 2654435761 + n * 40503) >>> 0) >>> 7) % 1000) / 1000;
    const spots = ph === 1
      ? [[0.5, 0.2, 1], [0.24, 0.62, 1], [0.74, 0.5, 1]]   // the blaze: roof + two faces
      : [[0.42, 0.24, 0], [0.66, 0.6, 0]];                 // catching / guttering: two small fires
    for (let i = 0; i < spots.length; i++) {
      const [sx, sy, big] = spots[i];
      const jx = (hsh(i) - 0.5) * 0.18 * bw, jy = (hsh(i + 3) - 0.5) * 0.1 * bw;
      const s = (big ? 0.56 : 0.42) * bw;
      Assets.drawSprite(g, 'misc/' + (big ? 'flameBig' : 'flameSmall') + '/' + ((beat + i * 2 + b.id) % 4),
        bx + sx * bw - s / 2 + jx, by + sy * bw - s * 0.9 + jy, { w: s, h: s });
    }
  },

  /* ---- ASH PILES (tests/burn-down.mjs) — what a burned building leaves ----
     Generated from the building's OWN finished sprite: each column's pixel
     mass becomes the heap's height there, so a tall tower leaves a tall
     narrow cone and a broad hall a long low mound — unique to each building
     by construction. Charcoal base, grey ash body, pale blown-ash crown,
     a few charred beam stubs, embers still pinpricking the fresh pile. */
  _ashCache: {},
  ashOf(key, lv) {
    const ck = key + ':' + (lv || 1);
    if (this._ashCache[ck]) return this._ashCache[ck];
    const fam = Sprites.building[key] || Sprites.building.house;
    const base = fam[Math.min((lv || 1) - 1, fam.length - 1)] || fam[0];
    const W = base.width, H = base.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const COLS = 16, cw = W / COLS;
    let mass = new Array(COLS).fill(0);
    try {
      const d = base.getContext('2d').getImageData(0, 0, W, H).data;
      for (let x = 0; x < W; x++) {
        let n = 0;
        for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 96) n++;
        mass[Math.min(COLS - 1, (x / cw) | 0)] += n;
      }
    } catch (_) {
      // an asset-pack image can taint its canvas — fall back to a settled dome
      mass = mass.map((_, i) => 1 - Math.abs(i - COLS / 2) / (COLS / 2) * 0.7);
    }
    const peak = Math.max(...mass, 1);
    const ST = ART.PALETTE.stone, INK = ART.PALETTE.ink, BO = ART.PALETTE.bone, F = ART.PALETTE.fire;
    const r = ART.rng(ck.length * 31 + key.charCodeAt(0) * 7);
    const ground = H * 0.86;
    g.fillStyle = 'rgba(0,0,0,0.25)';                       // scorched contact shadow
    g.fillRect(W * 0.1, ground + H * 0.02, W * 0.8, H * 0.06);
    for (let i = 0; i < COLS; i++) {
      // the heap: this column's share of the building's mass, softened by its
      // neighbours so the profile reads as one settled pile
      const m = (mass[i] + (mass[i - 1] || mass[i]) + (mass[i + 1] || mass[i])) / 3;
      const hh = Math.max(H * 0.05, (m / peak) * H * 0.3) * (0.85 + r() * 0.3);
      const x = i * cw;
      g.fillStyle = INK[1]; g.fillRect(x, ground - hh, cw, hh);              // charcoal body
      g.fillStyle = ST[1]; g.fillRect(x, ground - hh, cw, Math.max(1, hh * 0.55));   // grey ash over it
      if (r() < 0.65) { g.fillStyle = ST[2]; g.fillRect(x + r() * cw * 0.4, ground - hh, cw * (0.3 + r() * 0.5), Math.max(1, hh * 0.22)); }  // lit crown, settled unevenly
      if (r() < 0.4) { g.fillStyle = BO[1]; g.fillRect(x + r() * cw, ground - hh - 1, Math.max(1, cw * 0.3), 1); }  // blown pale ash
    }
    for (let i = 0; i < 3; i++) {                            // charred beam stubs leaning out of the pile
      const x = (0.2 + r() * 0.6) * W, hh2 = (0.08 + r() * 0.08) * H;
      g.fillStyle = '#241a10';
      g.fillRect(x, ground - (mass[(x / cw) | 0] / peak) * H * 0.25 - hh2, Math.max(2, W * 0.025), hh2);
    }
    for (let i = 0; i < 4; i++) {                            // embers dying in the ash
      g.fillStyle = i % 2 ? F[0] : F[1];
      g.fillRect((0.2 + r() * 0.6) * W, ground - r() * H * 0.12, 2, 2);
    }
    return this._ashCache[ck] = c;
  },

  unitPose(u) {
    const vil = u.kind === 'villager';
    // in a fight: villagers swing a pickaxe (guard), soldiers thrust a spear
    if (u.tUnit) return vil ? 'guard' : 'fight';
    const fb = u.tBld && Bld.get(u.tBld);
    if (fb && Math.hypot(Bld.cx(fb) - u.x, Bld.cy(fb) - u.y) < 1.5 + Bld.reach(fb)) return vil ? 'guard' : 'fight';
    if (Units.moving(u)) return 'walk';
    const t = u.task;
    if (t) {
      if (t.type === 'shorefish') return 'idle';                 // the rod overlay tells the story
      if (t.type === 'gather')                                   // tool by resource
        return t.res === 'stone' ? 'mine' : t.res === 'food' ? 'farm' : 'gather';  // wood → axe (gather)
      if (t.type === 'build') return 'build';
      if (t.type === 'terraform') return u.kind === 'sapper' ? 'work' : 'build';   // pick swing at the dig
      if (t.type === 'work') {                                   // stationed at a workplace → its craft
        const wb = Bld.get(t.id), k = wb && wb.key;
        return (k === 'quarry' || k === 'mine') ? 'mine' : k === 'farm' ? 'farm'
          : (k === 'lumber' || k === 'lodge') ? 'gather' : 'build';
      }
      if (t.type === 'fish') return 'gather';
    }
    return 'idle';
  },
  unitSprite(u) {
    let sheet;
    if (u.kind === 'villager') {
      const tunic = G.tunicOf(u.owner);
      sheet = (u.female && Sprites.villagerF[tunic]) || Sprites.villager[tunic] || Sprites.unit.villager;
    } else if ((u.kind === 'raider' || u.kind === 'brute') && Sprites.barbFor) {
      /* THE FIVE PEOPLES (CFG.TRIBES, tests/raider-camps.mjs): a war band wears
         the look of the people that raised it — the camp's own, for its whole
         life — and its men and women are drawn apart like the villages'. */
      const set = Sprites.barbFor(u.tribe);
      sheet = (set[u.kind] || set.raider)[u.female ? 1 : 0];
    } else {
      // military units wear the village colour on their collar/stripe; barbarians,
      // siege engines and civilian boats fall through to their single sheet
      const mil = Sprites.militaryFor && Sprites.militaryFor(G.tunicOf(u.owner));
      sheet = (mil && mil[u.kind]) || Sprites.unit[u.kind] || Sprites.unit.villager;
    }
    const pose = sheet[this.unitPose(u)] ? this.unitPose(u) : (sheet.walk ? 'walk' : 'idle');
    const fr = sheet[pose];
    // beasts run their longer cycles faster than a villager's four frames a
    // second, so an 8-frame stride still reads as one stride (Sprites.animFps)
    const fps = (Sprites.animFps && Sprites.animFps[u.kind]) || 4;
    return fr[((u.animT * fps) | 0) % fr.length];
  },

  draw(dt) {
    if (!S) return;
    const g = this.g, TL = CFG.TILE, z = this.cam.z * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d0b08';
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(z, 0, 0, z, -this.cam.x * z, -this.cam.y * z);
    g.imageSmoothingEnabled = false;

    // terrain
    g.drawImage(this.terrainCache, 0, 0);
    // …but a tower still coming down keeps the ground it stood on (startCollapse)
    if (this.collapses.length) this.drawCollapseGround(g);

    // sapper bridges: faction-trimmed plank decks over water/moat (above terrain,
    // below units). Dynamic structures, so drawn per-frame, not baked into the cache.
    if (S.bridges && S.bridges.length) {
      const WP = ART.PALETTE.wood, ST = ART.PALETTE.stone;
      for (const br of S.bridges) {
        if (!S.map.explored[MapGen.idx(br.x, br.y)]) continue;
        const bx = br.x * TL, by = br.y * TL, lv = br.level || 1, dir = br.dir || 'h';
        const stone = lv >= 3;                                            // L3 deck is dressed stone
        const deck = stone ? ST[2] : WP[2], lit = stone ? ST[3] : WP[3], seam = stone ? ST[1] : WP[1];
        const fac = br.owner === 'P' ? ART.PALETTE.blue[2] : ART.PALETTE.red[2];
        if (dir === 'v') {   // deck spans N–S: planks run N–S (horizontal seams), rails E/W
          g.fillStyle = deck; g.fillRect(bx + 5, by, TL - 10, TL);
          g.fillStyle = lit; g.fillRect(bx + 5, by, 3, TL);
          g.fillStyle = seam; for (let py = 3; py < TL; py += 6) g.fillRect(bx + 5, by + py, TL - 10, 1);
          if (lv >= 2) { g.fillStyle = ST[1]; g.fillRect(bx + 4, by, TL - 8, 4); g.fillRect(bx + 4, by + TL - 4, TL - 8, 4); g.fillStyle = ST[3]; g.fillRect(bx + 4, by, 3, 4); g.fillRect(bx + 4, by + TL - 4, 3, 4); }  // stone piers
          g.fillStyle = fac; g.fillRect(bx + 4, by, 2, TL); g.fillRect(bx + TL - 6, by, 2, TL);
        } else {             // deck spans E–W: planks run E–W (vertical seams), rails N/S
          g.fillStyle = deck; g.fillRect(bx, by + 5, TL, TL - 10);
          g.fillStyle = lit; g.fillRect(bx, by + 5, TL, 3);
          g.fillStyle = seam; for (let px = 3; px < TL; px += 6) g.fillRect(bx + px, by + 5, 1, TL - 10);
          if (lv >= 2) { g.fillStyle = ST[1]; g.fillRect(bx, by + 4, 4, TL - 8); g.fillRect(bx + TL - 4, by + 4, 4, TL - 8); g.fillStyle = ST[3]; g.fillRect(bx, by + 4, 4, 3); g.fillRect(bx + TL - 4, by + 4, 4, 3); }  // stone piers
          g.fillStyle = fac; g.fillRect(bx, by + 4, TL, 2); g.fillRect(bx, by + TL - 6, TL, 2);
        }
        if (lv > 1) { g.fillStyle = ART.PALETTE.gold[2]; for (let i = 0; i < lv; i++) g.fillRect(bx + 4 + i * 4, by + TL / 2 - 1, 2, 2); }  // level pips
        /* WORKS ON THE SPAN: reinforcing to the next tier takes days and a
           sapper standing at it, so the bridge wears a work site — lashed
           poles along the rails and the usual gold build bar. It stays
           CROSSABLE the whole time; this is a re-facing, not a rebuild. */
        if (br.upgrading > 0) {
          // dressed blocks waiting along the span and straw-coloured lashings
          // over the rails: PALE marks, because at 32px anything in the deck's
          // own brown reads as a hole in the planking rather than work on it
          const TH2 = ART.PALETTE.thatch, ST2 = ART.PALETTE.stone;
          if (dir === 'v') {
            for (let py = 4; py < TL - 7; py += 9) {
              g.fillStyle = ST2[2]; g.fillRect(bx + 10, by + py, 12, 5);
              g.fillStyle = ST2[4]; g.fillRect(bx + 10, by + py, 12, 2);
            }
            g.fillStyle = TH2[2]; g.fillRect(bx + 6, by, 2, TL); g.fillRect(bx + TL - 8, by, 2, TL);
          } else {
            for (let px = 4; px < TL - 7; px += 9) {
              g.fillStyle = ST2[2]; g.fillRect(bx + px, by + 10, 5, 12);
              g.fillStyle = ST2[4]; g.fillRect(bx + px, by + 10, 2, 12);
            }
            g.fillStyle = TH2[2]; g.fillRect(bx, by + 6, TL, 2); g.fillRect(bx, by + TL - 8, TL, 2);
          }
          this.bar(g, bx + 3, by + TL - 4, TL - 6, 3, 1 - br.upgrading / (br.upTotal || 1), '#e8c15a');
        }
        if (br.hp < br.maxhp) this.bar(g, bx + 3, by - 3, TL - 6, 3, br.hp / br.maxhp, '#c98a4a');
      }
    }
    // BRIDGE PLACEMENT PREVIEW: with the bridge tool armed, tint nearby water
    // green where a bridge can span land-to-land, red where it can't
    if (window.UI && UI.terraMode === 'bridge' && UI.sel && UI.sel.type === 'unit') {
      const su = Units.get(UI.sel.id);
      if (su && su.kind === 'sapper') {
        for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
          const x = (su.x | 0) + dx, y = (su.y | 0) + dy;
          if (!MapGen.inB(x, y)) continue;
          const i = MapGen.idx(x, y), terr = S.map.terrain[i];
          if ((terr !== T.WATER && terr !== T.MOAT) || !S.map.explored[i] || Bld.bridgeAt(x, y)) continue;
          g.fillStyle = Terraform.bridgeCrossing(x, y, 'P') ? 'rgba(120,224,120,0.42)' : 'rgba(220,92,80,0.38)';
          g.fillRect(x * TL, y * TL, TL, TL);
        }
      }
    }

    // planned sapper work: a highlighted square on the tile being worked and on
    // every tile still queued behind it, so it's plain where the sapper is headed
    // and what it will do (persists like a wall's build marker until each is done)
    for (const u of S.units) {
      if (u.owner !== 'P' || u.kind !== 'sapper') continue;
      const marks = [];
      if (u.task && u.task.type === 'terraform') marks.push(u.task);
      if (u.jobs) for (const j of u.jobs) marks.push(j);
      for (let mi = 0; mi < marks.length; mi++) {
        const m = marks[mi];
        if (!S.map.explored[MapGen.idx(m.x, m.y)]) continue;
        const mx = m.x * TL, my = m.y * TL, activeMark = mi === 0 && u.task;
        g.fillStyle = activeMark ? 'rgba(244,222,150,0.18)' : 'rgba(244,222,150,0.10)';
        g.fillRect(mx + 2, my + 2, TL - 4, TL - 4);
        g.strokeStyle = 'rgba(244,222,150,' + (activeMark ? '0.9' : '0.6') + ')';
        g.lineWidth = 2;
        // dashed-look corner ticks so a queued run reads as a plan, not solid fill
        const c = 7;
        for (const [cx, cy, sxx, syy] of [[2, 2, 1, 1], [TL - 2, 2, -1, 1], [2, TL - 2, 1, -1], [TL - 2, TL - 2, -1, -1]]) {
          g.beginPath();
          g.moveTo(mx + cx, my + cy + syy * c); g.lineTo(mx + cx, my + cy); g.lineTo(mx + cx + sxx * c, my + cy);
          g.stroke();
        }
      }
    }

    // active sapper WORKSITES: turned earth, a stuck tool, flying dirt and a
    // progress bar, so a tile being reshaped plainly reads as under work
    for (const u of S.units) {
      if (u.kind !== 'sapper' || !u.task || u.task.type !== 'terraform') continue;
      const t = u.task;
      const ex = t.stx != null ? t.stx : t.sx + 0.5, ey = t.sty != null ? t.sty : t.sy + 0.5;
      if (Math.hypot(u.x - ex, u.y - ey) > 1.4) continue;               // only once at the edge, actually working
      if (!S.map.explored[MapGen.idx(t.x, t.y)]) continue;
      const wx = t.x * TL, wy = t.y * TL, SO = ART.PALETTE.soil, WO = ART.PALETTE.wood;
      const prog = t.total ? 1 - t.t / t.total : 0.5;
      if (t.job === 'bridge') {
        /* A SPAN IS BUILT ACROSS THE WATER, NOT ALONG IT. The site used to
           draw one fixed pattern of slats whatever way the crossing ran, so a
           north-south bridge went up as a raft of planks floating sideways on
           the channel. It now takes the crossing's OWN direction — the same
           Terraform.bridgeCrossing that decides br.dir when the deck lands —
           and builds the way a real one goes up: two stringers thrown bank to
           bank first, then the decking planked over them from the near shore
           out as the work proceeds. Falls back to E–W if the crossing has
           since been invalidated (the task's own revalidation will drop it).  */
        const bdir = Terraform.bridgeCrossing(t.x, t.y, u.owner) || 'h';
        const laid = 0.18 + prog * 0.82;
        if (bdir === 'v') {
          g.fillStyle = WO[1];                                             // the stringers, shore to shore
          g.fillRect(wx + 8, wy, 3, TL); g.fillRect(wx + TL - 11, wy, 3, TL);
          g.fillStyle = WO[3];                                             // decking, laid across them
          for (let py = 1; py < TL * laid; py += 5) g.fillRect(wx + 5, wy + py, TL - 10, 3);
        } else {
          g.fillStyle = WO[1];
          g.fillRect(wx, wy + 8, TL, 3); g.fillRect(wx, wy + TL - 11, TL, 3);
          g.fillStyle = WO[3];
          for (let px = 1; px < TL * laid; px += 5) g.fillRect(wx + px, wy + 5, 3, TL - 10);
        }
      } else if (t.job === 'bridgeup') {
        /* REINFORCING a standing span is MASONRY, not digging: the generic
           turned-earth patch below would put a hole of dark soil in the middle
           of a plank deck. The span already wears its own works (the bridge
           loop draws the blocks and lashings) — all this adds is the mason's
           mortar tub, so the tile reads as actively worked. */
        const ST3 = ART.PALETTE.stone;
        g.fillStyle = WO[1]; g.fillRect(wx + 4, wy + TL - 10, 7, 5);
        g.fillStyle = ART.PALETTE.bone[1]; g.fillRect(wx + 5, wy + TL - 9, 5, 2);
        g.fillStyle = ST3[4]; g.fillRect(wx + TL - 12, wy + TL - 11, 4, 4);
      } else {
        const r = Math.round((TL * 0.32) * (0.6 + prog * 0.4));         // a growing patch of turned soil
        g.fillStyle = SO[1]; g.fillRect(wx + TL / 2 - r, wy + TL / 2 - r, r * 2, r * 2);
        g.fillStyle = SO[0]; g.fillRect(wx + TL / 2 - r + 2, wy + TL / 2 - r + 2, Math.max(0, r * 2 - 4), Math.max(0, r * 2 - 4));
        g.fillStyle = SO[3]; g.fillRect(wx + 6, wy + 8, 3, 2); g.fillRect(wx + TL - 11, wy + TL - 13, 3, 2);  // clods
      }
      const ph = ((u.animT * 6) | 0) % 3;
      g.fillStyle = WO[1]; g.fillRect(wx + TL - 10, wy + 4, 2, 9);      // stuck tool haft
      g.fillStyle = ART.PALETTE.stone[3]; g.fillRect(wx + TL - 12, wy + 3, 4, 3);  // tool head
      g.fillStyle = SO[2]; g.fillRect(wx + TL / 2 + ph * 2 - 2, wy + 5 - ph, 2, 2);  // flying earth
      if (t.total) this.bar(g, wx + 3, wy - 3, TL - 6, 3, prog, '#c9a84c');
    }

    // remembered buildings (ghosts in the grey fog) — drawn as last seen
    for (const k in S.map.seenB) {
      const i = +k, gx = i % CFG.W, gy = (i / CFG.W) | 0;
      if ((G.vis && G.vis[i]) || !S.map.explored[i]) continue;
      const snap = S.map.seenB[k];
      const spr = snap.key === 'wall' ? Sprites.wallMask[snap.level - 1][this.wallMaskAt(gx, gy)]
        : snap.key === 'gate' ? Sprites.gateMask[snap.level - 1][this.gateVerticalAt(gx, gy) ? 1 : 0]
        : (snap.owner === 'A' ? Sprites.buildingA : Sprites.building)[snap.key][snap.level - 1];
      const gs = Bld.size(snap) * TL;
      // a remembered tower keeps its bond to the line, same as the wall
      // ghosts beside it (which already mask from live neighbours)
      if (snap.key === 'tower') this.drawTowerBond(g, { x: gx, y: gy, construction: 0 }, gx * TL, gy * TL, gs);
      this.blitBld(g, spr, gx * TL, gy * TL, gs, gs);
    }

    // ash piles — what burned-down buildings left, cooling on the ground
    // (drawn under everything that walks or stands; explored memory is enough,
    // a cold heap doesn't move)
    if (S.ashes) for (const a of S.ashes) {
      if (!S.map.explored[MapGen.idx(a.x, a.y)]) continue;
      // a building still TOPPLING owns its own ground — the ash is what it
      // leaves, and showing it under a tower that is visibly still falling
      // gives the ending away a second and a half early
      if (this.collapseAt(a.x, a.y)) continue;
      g.drawImage(this.ashOf(a.key, a.lv), a.x * TL, a.y * TL, a.sz * TL, a.sz * TL);
    }

    // buildings (sorted by footprint bottom edge)
    const blds = S.buildings.slice().sort((a, b) =>
      (a.y + Bld.size(a)) - (b.y + Bld.size(b)));
    for (const b of blds) {
      const bs = Bld.size(b);
      let seen = false;
      for (let vy = 0; vy < bs && !seen; vy++) for (let vx = 0; vx < bs; vx++)
        if (G.visibleAt(b.x + vx, b.y + vy)) { seen = true; break; }
      if (!seen) continue;
      const bx = b.x * TL, by = b.y * TL, bw = bs * TL;
      if (b.construction > 0 || b.upgrading > 0) {
        // a work site — going up for the first time OR being upgraded. Both
        // wear the scaffold so it's plainly unusable until the work is done.
        const up = b.upgrading > 0;
        if (!up && (b.key === 'wall' || b.key === 'gate')) {
          // fortifications show their oriented shape while first going up
          g.globalAlpha = 0.55; this.blitBld(g, this.bldSprite(b), bx, by, bw, bw); g.globalAlpha = 1;
        } else {
          /* WORK-SITE STAGES (tests/build-stages.mjs): three looks at 1/3
             intervals — ground broken → the raising → the building standing
             in scaffold — then the finished sprite. 2×2 (TC) raisings still
             match the shape going up: the timber long-hall (→L2) or the
             stone keep (→L3). Upgrades wear their own sprite labels (the
             same art for now) so their looks can diverge later. */
          const tgt = up ? b.level + 1 : b.level;
          const stage = Bld.stageOf(b);
          if (b.key === 'wonder') {
            /* THE GREAT WORKS (tests/wonder.mjs). Two shared raising stages —
               every wonder is raised by the same masons, off the same
               drawings — and then the MONUMENT'S OWN ART under a scaffold for
               the last third, which is the moment the valley finally sees
               what it is getting. Forty-five days is a long time to look at a
               building site. */
            if (stage < 2) {
              Assets.drawSprite(g, 'misc/wonderBuild' + (stage + 1), bx, by, { w: bw, h: bw });
            } else {
              this.blitBld(g, this.bldSprite(b, tgt), bx, by, bw, bw);
              Assets.drawSprite(g, 'misc/wonderScaffold', bx, by, { w: bw, h: bw });
            }
          } else if (Sprites.misc[b.key + 'Build1']) {
            // this building has BESPOKE stage art (every 1×1 building does —
            // tests/build-stages.mjs): its own three raising sprites for ALL
            // three stages, no generic look, no scaffold overlay
            Assets.drawSprite(g, 'misc/' + b.key + (up ? 'Up' : 'Build') + (stage + 1), bx, by, { w: bw, h: bw });
          } else if (stage === 0) {
            Assets.drawSprite(g, 'misc/' + (up ? 'upgrade' : 'construction') + (bs >= 2 ? 'Big1' : '1'), bx, by, { w: bw, h: bw });
          } else if (stage === 1) {
            const key = bs >= 2
              ? (up ? (tgt >= 3 ? 'misc/upgradeBig2_3' : 'misc/upgradeBig2') : (tgt >= 3 ? 'misc/constructionBig3' : 'misc/constructionBig'))
              : (up ? 'misc/upgrade2' : 'misc/construction');
            Assets.drawSprite(g, key, bx, by, { w: bw, h: bw });
          } else {
            // nearly done: the building being BUILT TOWARD stands in scaffold.
            // It must be the TARGET level's art (`tgt`) — during an upgrade
            // b.level is still the old level, and drawing that here put the
            // pre-upgrade building (e.g. the TC's level-1 camp) on screen
            // AFTER stage 1 had already raised the new hall's frame, so the
            // sequence ran backwards. tests/build-stages.mjs pins the order.
            this.blitBld(g, this.bldSprite(b, tgt), bx, by, bw, bw);
            Assets.drawSprite(g, 'misc/' + (up ? 'upgradeScaffold' : 'scaffold') + (bs >= 2 ? 'Big' : ''), bx, by, { w: bw, h: bw });
          }
        }
        const total = up ? (b.upgTotal || Bld.def(b.key).levels[b.level].time) : Bld.def(b.key).levels[b.level - 1].time;
        this.bar(g, bx + 4, by + bw - 4, bw - 8, 3, 1 - (up ? b.upgrading : b.construction) / total, '#e8c15a');
        // still tag the owner so a work site reads as friend or foe
        g.fillStyle = b.owner === 'P' ? '#4a90c2' : '#c2564a';
        g.fillRect(bx + 1, by + 1, 4, 4);
      } else {
        // a damaged building wears its destruction phase (tests/burn-down.mjs):
        // untouched → scorched dark → partially destroyed (Bld.burnPhase)
        const bph = Bld.burnPhase(b);
        const spr = bph === 1 ? this.darkOf(this.bldSprite(b))
          : bph === 2 ? this.ruinOf(this.bldSprite(b))
          : this.bldSprite(b);
        // a tower in a wall line wears the curtain's own stonework as
        // connecting stubs, under its body — one unbroken castle wall
        if (b.key === 'tower') this.drawTowerBond(g, b, bx, by, bw);
        // a drawbridge that falls to the FAR side lies beyond the wall, so it
        // goes down before the gatehouse does and is occluded by it
        if (b.key === 'gate') this.drawDrawbridge(g, b, bx, by, bw, dt, false);
        this.blitBld(g, spr, bx, by, bw, bw);
        // …and the walk running south out of it meets its flank at WALK height
        if (b.key === 'tower') this.drawTowerWalk(g, b, bx, by, bw);
        // …and one that falls toward us swings over its own archway
        if (b.key === 'gate') this.drawDrawbridge(g, b, bx, by, bw, dt, true);
        /* Owner tag. On a FORTIFICATION the tile's top-left corner is bare
           ground — the curtain runs down the middle of the tile — so the pip
           floated out on the grass beside the wall like a UI glitch, one per
           section the whole length of the line. Walls and gates share one
           faction-less atlas, so the pip can't simply be dropped either: it is
           their only owner cue. It now marks only the RIVAL's stonework, and
           sits ON it. Nobody else builds walls, so an unmarked curtain is
           yours by elimination — and your own castle reads clean. */
        const fort = b.key === 'wall' || b.key === 'gate' || b.key === 'tower';
        // barbarian works wear the band's own rust, never the rival's red —
        // a camp is nobody's tribe (tests/raider-camps.mjs)
        g.fillStyle = b.owner === 'P' ? '#4a90c2' : b.owner === 'R' ? '#6e5b40' : '#c2564a';
        if (!fort) g.fillRect(bx + 1, by + 1, 4, 4);
        else if (b.owner !== 'P') g.fillRect(bx + bw / 2 - 1.5, by + bw / 2 - 1.5, 3, 3);
        this.drawCampfire(g, b, bx, by, bw);
      }
      this.drawBanners(g, b, bx, by, bw);      // cloth flies in the tribe's own dye
      this.drawHearthSmoke(g, b, bx, by, bw);  // and the hearths breathe
      // a finished WONDER is never just another building on the map
      if (b.key === 'wonder' && !(b.construction > 0)) this.drawWonderShine(g, b, bx, by, bw);
      this.drawBurn(g, b, bx, by, bw);   // fires ride on work sites and finished buildings alike
      if (b.hp < b.maxhp) this.bar(g, bx + 3, by - 4, bw - 6, 3, b.hp / b.maxhp, '#7dbb5e');
      if (UI.sel && UI.sel.type === 'bld' && UI.sel.id === b.id) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bw - 1);
      }
    }

    // the dragon's FIRE LINE — the hero shot. Not scattered campfires: one
    // CONNECTED wall of flame. Pass 1 lays a continuous charred, glowing ember
    // bed under the whole line; pass 2 raises big overlapping tongues (a main
    // tongue plus two offset side-tongues per point, all on their own beats),
    // so the wall roars as a single blaze and dies down to embers and smoke.
    if (S.dragon && S.dragon.fire && S.dragon.fire.length) {
      const F = ART.PALETTE.fire, now = performance.now() / 1000;
      // ---- pass 1: charred ground + ember glow, overlapping into one bed ----
      for (const fp of S.dragon.fire) {
        const fx = fp.x * TL, fy = fp.y * TL;
        const life = Math.min(1, fp.ttl / 1.4);
        g.globalAlpha = 0.55 * Math.min(1, fp.ttl);
        g.fillStyle = '#171310'; g.fillRect(fx - 9, fy - 2, 18, 6);           // scorched earth, fused with its neighbours
        g.globalAlpha = 0.28 * life;
        g.fillStyle = F[1];
        g.beginPath(); g.ellipse(fx, fy + 1, 14, 6, 0, 0, Math.PI * 2); g.fill();   // the shared ember glow
        g.globalAlpha = 0.5 * life;
        g.fillStyle = F[0];                                                    // embers pulsing in the bed
        g.fillRect(fx - 7 + ((fp.seed * 5) % 11), fy + 1 + ((fp.seed * 3) % 3), 2, 2);
      }
      // ---- pass 2: the wall of tongues, 2x tall, bases overlapping ----
      for (const fp of S.dragon.fire) {
        const fx = fp.x * TL, fy = fp.y * TL;
        const life = Math.min(1, fp.ttl / 1.4);
        const tongue = (ox, phMul, hMul, wMul) => {
          const lick = Math.sin(now * (10 + phMul * 3) + fp.seed * phMul) * 0.5 + 0.5;
          const h = (10 + lick * 12) * hMul * life;
          const w = 12 * wMul;
          if (h < 1) return;
          g.globalAlpha = 0.9 * life;
          g.fillStyle = F[1]; g.fillRect(fx + ox - w / 2, fy - h, w, h);                         // outer flame
          g.fillStyle = F[2]; g.fillRect(fx + ox - w * 0.32, fy - h * 0.74, w * 0.64, h * 0.74); // hot middle
          g.fillStyle = F[3] || '#ffd28a'; g.fillRect(fx + ox - w * 0.16, fy - h * 0.42, w * 0.32, h * 0.42);  // white-hot core
          if (lick > 0.7) {                                                    // sparks off the crest
            g.fillStyle = F[2];
            g.fillRect(fx + ox - 2 + ((fp.seed * 7 + phMul * 13) % 5), fy - h - 3 - lick * 4, 2, 2);
          }
        };
        tongue(0, 1, 1, 1);                    // the main tongue
        tongue(-6, 2, 0.6, 0.7);               // side tongues knit the wall together
        tongue(6, 3, 0.7, 0.7);
        // rolling smoke as the blaze gutters
        if (fp.ttl < 2.6) {
          const life2 = Math.min(1, fp.ttl / 1.4);
          g.globalAlpha = 0.24 * life2;
          g.fillStyle = '#4a4a52';
          g.fillRect(fp.x * TL - 2 + Math.sin(now * 2 + fp.seed) * 4, fp.y * TL - 24 - ((now * 6 + fp.seed) % 8), 4, 4);
          g.fillRect(fp.x * TL + 2 + Math.sin(now * 1.6 + fp.seed * 2) * 5, fp.y * TL - 30 - ((now * 5 + fp.seed) % 6), 3, 3);
        }
      }
      g.globalAlpha = 1;
    }
    // dragonfire ash: what is left of an army, blowing away
    if (S.dragon && S.dragon.ash) for (const a of S.dragon.ash) {
      const al = Math.min(1, a.ttl / 1.4);
      const ax = a.x * TL, ay = a.y * TL;
      g.globalAlpha = al;
      g.fillStyle = ART.PALETTE.stone[1];
      g.fillRect(ax - 4, ay - 1, 8, 3);
      g.fillRect(ax - 2, ay - 3, 5, 2);
      g.fillStyle = ART.PALETTE.ink[2];
      g.fillRect(ax - 3, ay, 3, 2); g.fillRect(ax + 1, ay - 2, 2, 2);
      g.fillStyle = ART.PALETTE.stone[2];
      g.fillRect(ax - 1, ay - 4, 2, 1);
      g.globalAlpha = 1;
    }

    // units (y-sorted)
    const selIds = !UI.sel ? null
      : UI.sel.type === 'unit' ? new Set([UI.sel.id])
      : UI.sel.type === 'group' ? new Set(UI.sel.ids) : null;
    // heal-zone ring: when a hurt, healable friendly unit is selected, show where
    // it can be healed — the town-center grounds for land units, a dock for ships
    if (selIds && [...selIds].some(id => { const u = Units.get(id); return u && u.owner === 'P' && u.hp < u.maxhp && CFG.HEAL_FOOD[u.kind]; })) {
      const seen = new Set();
      g.save();
      g.strokeStyle = 'rgba(138,224,138,0.45)'; g.lineWidth = 1.5; g.setLineDash([6, 5]);
      for (const id of selIds) {
        const u = Units.get(id);
        if (!u || u.owner !== 'P' || u.hp >= u.maxhp || !CFG.HEAL_FOOD[u.kind]) continue;
        const z = Bld.healZoneFor(u);
        if (!z) continue;
        const k = z.x + ',' + z.y + ',' + z.r;
        if (seen.has(k)) continue; seen.add(k);
        g.beginPath(); g.ellipse(z.x * TL, z.y * TL, z.r * TL, z.r * TL, 0, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
    const units = S.units.slice().sort((a, b) => a.y - b.y);
    for (const u of units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const ux = u.x * TL - TL / 2, uy = u.y * TL - TL / 2 - CFG.SPRITE_LIFT;
      if (selIds && selIds.has(u.id)) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(u.x * TL, u.y * TL + 10, 10, 5, 0, 0, Math.PI * 2); g.stroke();
      }
      // draw every unit into a TILE-sized box: 32px sheets render 1:1 (unchanged),
      // while the hi-res 64px villager sheet shows at the SAME size but twice as crisp
      if (u.dieT != null && u.dieT > 0) {
        // DEATH BY PLAGUE — a slow, visible fall: the villager sways, keels
        // over under a sickly green pall, and fades into the ground
        const p2 = Math.min(1, Math.max(0, 1 - u.dieT / 2.4));
        const fade2 = p2 > 0.75 ? Math.max(0, (1 - p2) / 0.25) : 1;
        const cx3 = u.x * TL, cy3 = u.y * TL;
        g.save();
        g.globalAlpha = fade2;
        g.translate(cx3, cy3 + p2 * 5);
        g.rotate((u.id % 2 ? 1 : -1) * Math.min(1, p2 * 1.5) * Math.PI / 2 +
          Math.sin(u.animT * 7) * 0.06 * (1 - p2));            // a last sway before the fall
        g.drawImage(this.unitSprite(u), -TL / 2, -TL / 2 - CFG.SPRITE_LIFT, TL, TL);
        g.globalAlpha = fade2 * 0.35 * Math.min(1, p2 * 2);    // the sickness's green cast
        g.fillStyle = '#86b04a';
        g.fillRect(-TL / 2 + 6, -TL / 2, TL - 12, TL - 6);
        g.restore();
        g.globalAlpha = 1;
      } else if (u.burnT > 0) {
        // DEATH BY DRAGONFIRE — a last animation before the ash lands:
        // soldiers topple sideways ablaze; siege engines char, sag and
        // collapse where they stand. Both are wreathed in half-transparent
        // fire and fade out just before they vanish into ash.
        const p = Math.min(1, Math.max(0, 1 - u.burnT / 1.6));       // 0 -> 1 across the burn
        const fade = p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1;
        const cx2 = u.x * TL, cy2 = u.y * TL;
        const F = ART.PALETTE.fire;
        const engine = Units.isSiege(u) || u.kind === 'ballista';
        g.save();
        g.globalAlpha = fade;
        g.translate(cx2, cy2 + p * 4);
        if (engine) g.scale(1, 1 - p * 0.35);                        // the timber frame sags and collapses
        else g.rotate((u.id % 2 ? 1 : -1) * Math.pow(p, 1.4) * Math.PI / 2);   // toppling over
        g.drawImage(this.unitSprite(u), -TL / 2, -TL / 2 - CFG.SPRITE_LIFT, TL, TL);
        if (engine) {                                                // blackening timber
          g.globalAlpha = fade * 0.6 * p;
          g.fillStyle = '#14100c';
          g.fillRect(-TL / 2 + 4, -TL / 2 - 2, TL - 8, TL - 4);
        }
        g.restore();
        // the half-transparent fire wash over the body, and licking tongues
        const lk = Math.sin(u.animT * 13 + u.id) * 0.5 + 0.5, ph = ((u.animT * 9) | 0) % 2;
        g.globalAlpha = fade * 0.5;
        g.fillStyle = F[1]; g.fillRect(cx2 - 8, cy2 - 12 + p * 6, 16, 14);
        g.globalAlpha = fade * 0.9;
        const hh = 8 + lk * 5;
        g.fillStyle = F[1]; g.fillRect(cx2 - 5, cy2 - 4 - hh + p * 5, 4, hh);
        g.fillStyle = F[2]; g.fillRect(cx2 + 1 - ph, cy2 - 2 - hh * 0.8 + p * 5, 3, hh * 0.8);
        g.fillStyle = F[3] || '#ffd28a'; g.fillRect(cx2 - 1, cy2 - hh * 0.5 + p * 5, 2, hh * 0.5);
        if (lk > 0.65) { g.fillStyle = F[2]; g.fillRect(cx2 - 3 + ph * 5, cy2 - hh - 7, 2, 2); }   // sparks
        g.globalAlpha = 1;
      } else {
        g.drawImage(this.unitSprite(u), ux, uy, TL, TL);
      }
      if (u.cargo && u.cargo.length) {                 // one pip per soldier aboard
        g.fillStyle = u.owner === 'P' ? '#c0e8ff' : '#ffb0a0';
        for (let ci = 0; ci < u.cargo.length; ci++)
          g.fillRect(ux + 7 + ci * 4, uy - 1, 3, 3);
      }
      if (u.hp < u.maxhp) this.bar(g, ux + 6, uy - 2, TL - 12, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }

    // cast lines: every settled shore-fisher shows a rod, a line, and a
    // bobbing float out on the shoal — unmistakably fishing
    for (const u of S.units) {
      if (!u.task || u.task.type !== 'shorefish') continue;
      if ((u.x | 0) !== u.task.sx || (u.y | 0) !== u.task.sy) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const dirx = u.task.x - u.task.sx, diry = u.task.y - u.task.sy;
      const tipX = (u.x + dirx * 0.38) * TL, tipY = (u.y + diry * 0.30) * TL - 9;
      const bobX = (u.task.x + 0.5) * TL + Math.sin(u.animT * 1.3) * 3;
      const bobY = (u.task.y + 0.5) * TL + Math.sin(u.animT * 2.1) * 2;
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(110,80,36,0.95)';                      // wood rod
      g.beginPath(); g.moveTo(u.x * TL + dirx * 2, u.y * TL - 2); g.lineTo(tipX, tipY); g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(216,207,174,0.55)';                    // gut line
      g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(bobX, bobY); g.stroke();
      g.fillStyle = ART.PALETTE.fire[2];                           // bright float
      g.fillRect(bobX - 1.5, bobY - 1.5, 3, 3);
      if (Math.sin(u.animT * 2.1) > 0.75) {                        // nibble ripple
        g.strokeStyle = 'rgba(235,244,248,0.35)';
        g.beginPath(); g.ellipse(bobX, bobY + 1, 5, 2.5, 0, 0, Math.PI * 2); g.stroke();
      }
    }

    // the buried cache (special event): the hoard waiting for a spade — with a
    // beckoning golden shimmer so the player can't miss the errand
    if (S.cache && S.cache.ev) {
      const ev = S.cache.ev;
      if (S.map.explored[MapGen.idx(ev.x, ev.y)]) {
        const now2 = performance.now() / 1000;
        const fr = Sprites.misc.cache[((now2 * 2) | 0) % 2];
        g.drawImage(fr, ev.x * TL, ev.y * TL - 4, TL, TL);
        g.globalAlpha = 0.35 + 0.25 * Math.sin(now2 * 3);
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(ev.x * TL + TL / 2, ev.y * TL + TL / 2 + 4, 14 + Math.sin(now2 * 3) * 2, 7, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
    }

    // the kraken: a once-a-game terror breaking the surface
    if (S.kraken && S.kraken.ev) {
      const ev = S.kraken.ev;
      if (G.visibleAt(ev.x | 0, ev.y | 0)) {
        const k = ev.phase === 'rise' ? Math.min(1, ev.t / 1.0)
          : ev.phase === 'sink' ? Math.max(0, 1 - ev.t / 1.2) : 1;
        const fr = Sprites.misc.kraken[((ev.t * 5) | 0) % 4];
        const size = TL * 3;                                   // 96px native — pixel-perfect at zoom 1
        g.globalAlpha = k;
        g.drawImage(fr, ev.x * TL - size / 2, ev.y * TL - size / 2 - k * 6, size, size);
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(235,244,248,' + (0.4 * k).toFixed(2) + ')';
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(ev.x * TL, ev.y * TL + 12, 24 + Math.sin(ev.t * 5) * 5, 9, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();                                          // a second, wider churn ring
        g.globalAlpha = 0.5 * k;
        g.ellipse(ev.x * TL, ev.y * TL + 12, 34 + Math.sin(ev.t * 4 + 1.5) * 6, 12, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // hearth smoke drifting from settled buildings, embers over camp fires —
    // transient render-side particles, bounded, visible tiles only
    this.smoke = this.smoke || [];
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.45;
      if (this.smoke.length < 36) {
        for (const b of S.buildings) {
          if (b.construction > 0) continue;
          const rate = b.key === 'tc' ? 0.9 : (b.key === 'house' || b.key === 'lodge') ? 0.2 : 0;
          if (!rate || Math.random() > rate) continue;
          if (!G.visibleAt(b.x, b.y)) continue;
          // the L1 roundhouse hearth is the fire pit in the dooryard — a very
          // faint wisp curls up from it; every other hearth smokes from the roof
          const pit = b.key === 'tc' && b.level === 1;
          // the campfire's own anchor (R.CAMPFIRE_AT.tc), in tile units rather
          // than bw-fraction — the smoke must rise from the SAME stone ring
          // the sprite actually draws, not the composition it replaced
          this.smoke.push({ x: b.x + (pit ? 0.969 : 0.5) + (Math.random() - 0.5) * 0.12,
                            y: b.y + (pit ? 1.594 : 0.18),
                            t: 0, ttl: (pit ? 1.6 : 2) + Math.random() * 1.2,
                            a: pit ? 0.15 : 0.30 });
          if (this.smoke.length >= 36) break;
        }
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.t += dt;
      if (s.t > s.ttl) { this.smoke.splice(i, 1); continue; }
      const k = s.t / s.ttl;
      const sx = (s.x + Math.sin((s.t + s.x * 7) * 1.6) * 0.06 + s.t * 0.03) * TL;
      const sy = (s.y - s.t * 0.28) * TL;
      const a0 = s.a || 0.30;
      const size = (a0 < 0.2 ? 1.5 : 2) + k * (a0 < 0.2 ? 4 : 5);
      g.fillStyle = 'rgba(206,200,190,' + (a0 * (1 - k)).toFixed(3) + ')';
      g.fillRect(sx - size / 2, sy - size / 2, size, size);
    }

    // hostiles piled on one tile: a head-count badge so the stack is readable
    const stacks = new Map();
    for (const u of S.units) {
      if (u.owner === 'P' || Units.isPassive(u)) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const k = (u.x | 0) * 4096 + (u.y | 0);
      const s = stacks.get(k);
      if (s) { s.n++; if (u.y < s.y) { s.x = u.x; s.y = u.y; } }
      else stacks.set(k, { x: u.x, y: u.y, n: 1 });
    }
    g.font = '700 9px -apple-system, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of stacks.values()) {
      if (s.n < 2) continue;
      const bx = s.x * TL, by = s.y * TL - TL / 2 - 11;
      const w = g.measureText('×' + s.n).width + 8;
      g.fillStyle = 'rgba(20,15,11,0.85)';
      g.beginPath();
      if (g.roundRect) g.roundRect(bx - w / 2, by - 6.5, w, 13, 4);
      else g.rect(bx - w / 2, by - 6.5, w, 13);
      g.fill();
      g.strokeStyle = 'rgba(224,101,80,0.9)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#ffb0a0';
      g.fillText('×' + s.n, bx, by + 0.5);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';

    // arrows in flight (flaming ones burn orange with an ember at the head);
    // catapult stones arc high and land hard
    g.lineWidth = 1.5;
    for (const s of Combat.shots) {
      if (s.rock) {
        const k = Math.max(0, 1 - s.t / 0.35);
        const px = (s.x1 + (s.x2 - s.x1) * k) * TL;
        const py = (s.y1 + (s.y2 - s.y1) * k - Math.sin(k * Math.PI) * 1.1) * TL;
        g.fillStyle = ART.PALETTE.stone[1];
        g.fillRect(px - 3, py - 3, 6, 6);
        g.fillStyle = ART.PALETTE.stone[3];
        g.fillRect(px - 3, py - 3, 3, 3);
        continue;
      }
      const a = Math.min(1, s.t * 6);
      g.strokeStyle = s.fire ? 'rgba(242,150,58,' + a + ')' : 'rgba(240,210,122,' + a + ')';
      g.beginPath(); g.moveTo(s.x1 * TL, s.y1 * TL); g.lineTo(s.x2 * TL, s.y2 * TL); g.stroke();
      if (s.fire) {
        g.fillStyle = 'rgba(255,200,80,' + a + ')';
        g.fillRect(s.x2 * TL - 2, s.y2 * TL - 2, 4, 4);
        g.fillStyle = 'rgba(232,138,58,' + a + ')';
        g.fillRect(s.x2 * TL - 1, s.y2 * TL - 1, 2, 2);
      }
    }

    // ---- siege projectiles in flight: boulder / bolt / flaming ball on an arc,
    // each trailing a ground shadow that tightens as it nears the target ----
    for (const p of Combat.projectiles) {
      const k = p.t / p.dur;
      const wx = p.x1 + (p.x2 - p.x1) * k;
      const wy = p.y1 + (p.y2 - p.y1) * k - Math.sin(k * Math.PI) * p.arc;
      const px = wx * TL, py = wy * TL;
      const sh = 2 + 2 * k;
      g.fillStyle = 'rgba(20,16,10,0.28)';
      g.fillRect(wx * TL - sh, p.y2 * TL - 1, sh * 2, 2);            // shadow on the ground line
      if (p.kind === 'flame') {
        for (let j = 1; j <= 3; j++) {                              // ember trail
          const kk = Math.max(0, k - j * 0.06);
          const tx = (p.x1 + (p.x2 - p.x1) * kk) * TL;
          const ty = (p.y1 + (p.y2 - p.y1) * kk - Math.sin(kk * Math.PI) * p.arc) * TL;
          g.fillStyle = 'rgba(232,138,58,' + (0.5 - j * 0.13) + ')';
          g.fillRect(tx - 2, ty - 2, 4, 4);
        }
        g.fillStyle = ART.PALETTE.fire[1]; g.fillRect(px - 4, py - 4, 8, 8);   // outer glow
        g.fillStyle = ART.PALETTE.fire[2]; g.fillRect(px - 3, py - 3, 6, 6);
        g.fillStyle = ART.PALETTE.fire[3]; g.fillRect(px - 2, py - 3, 3, 3);   // hot core
      } else if (p.kind === 'bolt') {
        const dx = p.x2 - p.x1, dy = p.y2 - p.y1, dl = Math.hypot(dx, dy) || 1;
        g.strokeStyle = ART.PALETTE.wood[2]; g.lineWidth = 2;
        g.beginPath(); g.moveTo(px - dx / dl * 7, py - dy / dl * 7); g.lineTo(px, py); g.stroke();
        g.fillStyle = ART.PALETTE.stone[4]; g.fillRect(px - 1.5, py - 1.5, 3, 3);   // iron head
      } else {                                                       // stone boulder
        g.fillStyle = ART.PALETTE.stone[1]; g.fillRect(px - 3, py - 3, 6, 6);
        g.fillStyle = ART.PALETTE.stone[3]; g.fillRect(px - 3, py - 3, 3, 3);       // lit top-left
        g.fillStyle = ART.PALETTE.stone[0]; g.fillRect(px + 1, py + 1, 2, 2);       // shaded
      }
    }

    // ---- impact particles: dust/debris fall & shrink, embers & smoke rise ----
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.t -= dt / pt.life;
      if (pt.t <= 0) { this.particles.splice(i, 1); continue; }
      pt.vy += pt.g * dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      g.globalAlpha = pt.smoke ? Math.min(0.55, pt.t * 0.55) : Math.min(1, pt.t * 1.4);
      g.fillStyle = pt.col;
      const s = pt.sz * (pt.smoke ? (1.4 - pt.t) + 0.6 : pt.t);      // smoke expands, debris shrinks
      g.fillRect(pt.x * TL - s / 2, pt.y * TL - s / 2, s, s);
    }
    g.globalAlpha = 1; g.lineWidth = 1.5;

    // living water: drifting sparkles, blinking shoreline foam, jumping fish.
    // Viewport-only, a few fillRects per water tile — stays well inside budget.
    this.fishClock = (this.fishClock || 0) + dt;
    {
      const t0 = this.fishClock;
      const cyc = (t0 / 2.4) | 0, phase = (t0 / 2.4) % 1;
      const fishFr = phase < 0.55 ? Sprites.misc.fish[phase < 0.3 ? 0 : 1] : null;
      const terr = S.map.terrain;
      // clamp to the PLAYABLE interior (1 … W-2): the outer ring is off-map black
      // void, so no fish jump, no sparkle, no foam is drawn on it (see R.drawTile)
      const x0 = Math.max(1, (this.cam.x / TL) | 0), y0 = Math.max(1, (this.cam.y / TL) | 0);
      const x1 = Math.min(CFG.W - 2, ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0);
      const y1 = Math.min(CFG.H - 2, ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0);
      const wet = v => v === T.WATER || v === T.MOAT;   // moats animate like the lake
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = MapGen.idx(x, y);
        if (!wet(terr[i])) continue;
        if (!G.visibleAt(x, y)) continue;
        const h = (x * 73856093 ^ y * 19349663) >>> 0;
        if (h % 3 === 0) {                                  // slow drifting sparkle dash
          const ph = t0 * 0.6 + (h % 13);
          const sx = x * TL + 4 + (Math.sin(ph) * 0.5 + 0.5) * (TL - 14);
          const sy = y * TL + 5 + ((h >> 4) % (TL - 10));
          g.fillStyle = 'rgba(190,224,238,0.45)';
          g.fillRect(sx | 0, sy | 0, 5, 2);
        }
        const landN = !wet(terr[MapGen.idx(x, Math.max(0, y - 1))]);
        const landS = y + 1 < CFG.H && !wet(terr[MapGen.idx(x, y + 1)]);
        const landW = !wet(terr[MapGen.idx(Math.max(0, x - 1), y)]);
        const landE = x + 1 < CFG.W && !wet(terr[MapGen.idx(x + 1, y)]);
        if (landN || landS || landW || landE) {             // blinking foam dots on the shore side
          const a = 0.22 + 0.2 * Math.sin(t0 * 1.7 + (h % 7));
          g.fillStyle = 'rgba(235,244,248,' + Math.max(0, a).toFixed(2) + ')';
          const o1 = 4 + (h % 3) * 8, o2 = 20 - (h % 5) * 3;
          if (landN) { g.fillRect(x * TL + o1, y * TL + 2, 2, 2); g.fillRect(x * TL + o2, y * TL + 3, 2, 2); }
          else if (landS) { g.fillRect(x * TL + o1, y * TL + TL - 4, 2, 2); g.fillRect(x * TL + o2, y * TL + TL - 5, 2, 2); }
          else if (landW) { g.fillRect(x * TL + 2, y * TL + o1, 2, 2); g.fillRect(x * TL + 3, y * TL + o2, 2, 2); }
          else { g.fillRect(x * TL + TL - 4, y * TL + o1, 2, 2); g.fillRect(x * TL + TL - 5, y * TL + o2, 2, 2); }
        }
        if (fishFr && S.map.resAmount[i]) {
          // shoals (h % 3 shore tiles — the ones villagers can line-fish)
          // show jumping fish often: that's the tell to watch for. Open deep
          // water keeps only the rare splash; barren shore water shows none.
          const hf = (h ^ cyc * 83492791) >>> 0;
          const nearLand = landN || landS || landW || landE;
          if (nearLand ? (h % 3 === 0 && hf % 5 < 2) : hf % 31 === 0)
            g.drawImage(fishFr, x * TL, y * TL);
        }
      }
    }

    // ambient life: bird flocks glide over the forest, butterflies flutter over
    // open grass, and shy critters (rabbit/fox/squirrel) creep out of the forest
    // edge, potter about, then dart back into cover and vanish. Pure decoration —
    // transient, pooled render-side particles (never in S), a handful of fillRects
    // each, viewport-only. No per-frame allocation beyond the entity objects.
    this.ambient = this.ambient || [];
    this.ambientT = (this.ambientT || 0) - dt;
    if (this.ambientT <= 0 && this.ambient.length < 7) {
      this.ambientT = 0.8 + Math.random() * 1.5;
      const vx0 = Math.max(1, (this.cam.x / TL) | 0), vy0 = Math.max(1, (this.cam.y / TL) | 0);
      const vw = Math.min(CFG.W - 2, ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0) - vx0;
      const vh = Math.min(CFG.H - 2, ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0) - vy0;
      for (let tries = 0; tries < 10; tries++) {
        const tx = vx0 + (Math.random() * Math.max(1, vw)) | 0;
        const ty = vy0 + (Math.random() * Math.max(1, vh)) | 0;
        if (!G.visibleAt(tx, ty)) continue;
        const tt = S.map.terrain[MapGen.idx(tx, ty)];
        if (tt === T.FOREST) {                              // a small gliding flock
          const dir = Math.random() < 0.5 ? -1 : 1;
          this.ambient.push({
            kind: 'flock', x: tx + Math.random(), y: ty + Math.random(), dir,
            vx: dir * (1.3 + Math.random() * 0.7), vy: (Math.random() - 0.5) * 0.4,
            t: 0, ttl: 5 + Math.random() * 3, ph: Math.random() * 10, n: 2 + (Math.random() * 3 | 0),
          });
          break;
        }
        if (tt !== T.GRASS) continue;
        // is this a forest-edge grass tile? if so a critter can emerge from it
        let fx = 0, fy = 0, edge = false;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          if (MapGen.inB(tx + ox, ty + oy) && S.map.terrain[MapGen.idx(tx + ox, ty + oy)] === T.FOREST) {
            fx = ox; fy = oy; edge = true; break;
          }
        }
        if (edge && Math.random() < 0.65) {
          this.ambient.push({
            kind: 'critter', sub: ['rabbit', 'fox', 'squirrel'][Math.random() * 3 | 0],
            x: tx + 0.5 - fx * 0.35, y: ty + 0.5 - fy * 0.35,
            homeX: tx + fx, homeY: ty + fy,                 // forest tile to bolt back to
            vx: -fx * (0.45 + Math.random() * 0.3), vy: -fy * (0.45 + Math.random() * 0.3),
            t: 0, ttl: 4 + Math.random() * 3, ph: Math.random() * 10, face: fx > 0 ? -1 : 1, state: 'emerge',
          });
        } else {
          this.ambient.push({
            kind: 'fly', x: tx + Math.random(), y: ty + Math.random(),
            vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.4,
            t: 0, ttl: 8 + Math.random() * 4, ph: Math.random() * 10,
            col: ART.PALETTE.bloom[(Math.random() * 3) | 0],
          });
        }
        break;
      }
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.t += dt;
      if (a.kind === 'critter') {
        if (a.state === 'emerge' && a.t > 0.8) a.state = 'wander';
        if (a.state !== 'flee' && a.t > a.ttl - 1.6) a.state = 'flee';
        if (a.state === 'wander') {
          if (Math.sin((a.t + a.ph) * 3.1) > 0.985) { a.vx = (Math.random() - 0.5) * 0.6; a.vy = (Math.random() - 0.5) * 0.5; }
          const hop = Math.max(0, Math.sin((a.t + a.ph) * 7));      // scurry between little pauses
          a.x += a.vx * dt * hop; a.y += a.vy * dt * hop;
        } else if (a.state === 'flee') {
          const dx = (a.homeX + 0.5) - a.x, dy = (a.homeY + 0.5) - a.y, d = Math.hypot(dx, dy) || 1;
          a.vx = dx / d * 2.3; a.vy = dy / d * 2.3;
          a.x += a.vx * dt; a.y += a.vy * dt;
          if (d < 0.4) { this.ambient.splice(i, 1); continue; }     // reached cover, gone
        } else { a.x += a.vx * dt; a.y += a.vy * dt; }
        if (a.vx) a.face = a.vx < 0 ? -1 : 1;
      } else if (a.kind === 'flock') {
        a.x += a.vx * dt; a.y += a.vy * dt + Math.sin((a.t + a.ph) * 1.5) * 0.006;
      } else {
        a.x += a.vx * dt; a.y += a.vy * dt + Math.sin((a.t + a.ph) * 5) * 0.010;
        if (Math.sin((a.t + a.ph) * 2.3) > 0.97) { a.vx = (Math.random() - 0.5) * 0.5; a.vy = (Math.random() - 0.5) * 0.4; }
      }
      if (a.t > a.ttl || !MapGen.inB(a.x | 0, a.y | 0)) { this.ambient.splice(i, 1); continue; }
      if (!G.visibleAt(a.x | 0, a.y | 0)) continue;
      const ax = a.x * TL, ay = a.y * TL;
      const fade = Math.min(1, Math.min(a.t, a.ttl - a.t) * 2);
      g.globalAlpha = Math.max(0, fade * 0.9);
      if (a.kind === 'flock') this._drawFlock(g, a, ax, ay);
      else if (a.kind === 'critter') this._drawCritter(g, a, ax, ay);
      else {
        g.fillStyle = a.col;
        const open = Math.sin((a.t + a.ph) * 10) > 0;
        g.fillRect(ax - (open ? 2.5 : 1.5), ay, 2, 2);
        g.fillRect(ax + (open ? 0.5 : -0.5), ay, 2, 2);
        g.fillStyle = ART.PALETTE.ink[1]; g.fillRect(ax - 0.5, ay, 1, 2);   // slim body
      }
      g.globalAlpha = 1;
    }

    // placement ghost
    if (UI.placing === 'wall' && UI.wallGhost && UI.wallGhost.length) {
      // dragged wall line: oriented pieces, green when buildable+affordable
      for (const t of UI.wallGhost) {
        g.globalAlpha = 0.65;
        g.drawImage(Sprites.wallMask[0][t.mask], t.x * TL, t.y * TL);
        g.globalAlpha = 1;
        g.fillStyle = t.ok ? 'rgba(125,187,94,0.35)' : 'rgba(224,101,80,0.45)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
      }
    } else if (UI.placing) {
      const t = UI.placeTile;
      if (t) {
        const ok = Bld.canPlace('P', UI.placing, t.x, t.y).ok;
        // the ghost shows what will ACTUALLY go up: walls and gates are raised at
        // the village-wide fort tier, so once the ring is stone the ghost is too
        // (and matches the build-menu icon — see UI.menuIconLevel)
        const fi = Math.max(0, Math.min(2, ((S.wallLevel || 1) - 1)));
        const spr = UI.placing === 'gate'
          ? Sprites.gateMask[fi][this.gateVerticalAt(t.x, t.y) ? 1 : 0]
          : UI.placing === 'wall'
            ? Sprites.wallMask[fi][this.wallMaskAt(t.x, t.y)]
            : Sprites.building[UI.placing][0];
        g.globalAlpha = 0.6;
        g.drawImage(spr, t.x * TL, t.y * TL);
        g.globalAlpha = 1;
        g.fillStyle = ok ? 'rgba(125,187,94,0.35)' : 'rgba(224,101,80,0.4)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
      }
    }

    // sapper dig/clear line being dragged: amber where workable, red where not
    if (UI.terraDrag && UI.terraGhost && UI.terraGhost.length) {
      for (const t of UI.terraGhost) {
        g.fillStyle = t.ok ? 'rgba(210,168,86,0.38)' : 'rgba(224,101,80,0.42)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
        g.strokeStyle = t.ok ? 'rgba(244,222,150,0.95)' : 'rgba(224,101,80,0.95)';
        g.lineWidth = 2;
        g.strokeRect(t.x * TL + 1, t.y * TL + 1, TL - 2, TL - 2);
      }
    }

    // DRAG-TO-MOVE tether: a dashed gold line from the dragged selection to the
    // finger, an arrowhead on the business end, and a pulsing ring on the
    // destination tile — green-gold over known ground, red over the unexplored
    if (UI.moveDrag) {
      const md = UI.moveDrag;
      const w = this.screenToWorld(md.sx, md.sy);
      const tw = this.screenToTile(md.sx, md.sy);
      const known = MapGen.inB(tw.x, tw.y) && S.map.explored[MapGen.idx(tw.x, tw.y)];
      const ax = md.ax * TL, ay = md.ay * TL, tx = w.x, ty = w.y;
      const col = known ? '232,193,90' : '224,101,80';
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
      g.save();
      g.setLineDash([7, 6]);
      g.lineDashOffset = -(performance.now() / 40) % 13;   // the dashes MARCH toward the target
      g.strokeStyle = 'rgba(' + col + ',0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(tx, ty); g.stroke();
      g.setLineDash([]);
      // arrowhead pointing along the tether
      const angA = Math.atan2(ty - ay, tx - ax);
      g.fillStyle = 'rgba(' + col + ',0.95)';
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(tx - Math.cos(angA - 0.42) * 11, ty - Math.sin(angA - 0.42) * 11);
      g.lineTo(tx - Math.cos(angA + 0.42) * 11, ty - Math.sin(angA + 0.42) * 11);
      g.fill();
      // the destination tile, breathing
      if (MapGen.inB(tw.x, tw.y)) {
        g.strokeStyle = 'rgba(' + col + ',' + (0.45 + 0.4 * pulse) + ')'; g.lineWidth = 2;
        g.strokeRect(tw.x * TL + 2, tw.y * TL + 2, TL - 4, TL - 4);
        g.beginPath();
        g.arc((tw.x + 0.5) * TL, (tw.y + 0.5) * TL, TL * (0.38 + 0.1 * pulse), 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
    // …and the "order landed" pulse where a drag was released: a quick green
    // double-ring that expands and fades, so the hand-off is unmistakable
    if (UI.moveFlash) {
      const f = UI.moveFlash;
      f.t -= dt;
      if (f.t <= 0) { UI.moveFlash = null; }
      else {
        const k = f.t / f.life, done = 1 - k;
        const fx = (f.x + 0.5) * TL, fy = (f.y + 0.5) * TL;
        g.strokeStyle = 'rgba(138,224,138,' + (0.75 * k) + ')'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(fx, fy, 4 + done * 15, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(138,224,138,' + (0.45 * k) + ')'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(fx, fy, 2 + done * 9, 0, Math.PI * 2); g.stroke();
      }
    }

    // rally point flag / rally-setting range ring
    if (UI.settingRally) {
      const rb = Bld.get(UI.settingRally);
      if (rb) {
        g.strokeStyle = 'rgba(232,193,90,0.6)'; g.lineWidth = 2;
        g.beginPath();
        g.arc((rb.x + 0.5) * TL, (rb.y + 0.5) * TL, CFG.RALLY_RANGE * TL, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (UI.sel && UI.sel.type === 'bld') {
      const rb = Bld.get(UI.sel.id);
      if (rb && rb.rally) {
        const fx = (rb.rally.x + 0.5) * TL, fy = (rb.rally.y + 0.5) * TL;
        g.strokeStyle = 'rgba(232,193,90,0.5)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(Bld.cx(rb) * TL, Bld.cy(rb) * TL); g.lineTo(fx, fy); g.stroke();
        g.strokeStyle = '#e8c15a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx, fy + 6); g.lineTo(fx, fy - 8); g.stroke();
        g.fillStyle = '#e8c15a';
        g.beginPath(); g.moveTo(fx, fy - 8); g.lineTo(fx + 8, fy - 5); g.lineTo(fx, fy - 2); g.fill();
      }
    }
    // rally CONFIRM flourish: a placed rally auto-deselects, so flash the flag it
    // dropped for a beat — an expanding pulse + a popped-in flag that fades out —
    // so the player sees exactly where it landed before the panel closes.
    if (UI.rallyFlash) {
      const f = UI.rallyFlash;
      f.t -= dt;
      if (f.t <= 0) { UI.rallyFlash = null; }
      else {
        const k = f.t / f.life;                        // 1 → 0 over its life
        const done = 1 - k;                            // 0 → 1
        const fx = (f.x + 0.5) * TL, fy = (f.y + 0.5) * TL;
        const a = k > 0.35 ? 1 : k / 0.35;             // hold, then fade in the last beat
        const pop = Math.min(1, done / 0.14);          // quick scale-in on arrival
        // tether from the building to the flag
        g.strokeStyle = 'rgba(232,193,90,' + (0.5 * a) + ')'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(f.bx * TL, f.by * TL); g.lineTo(fx, fy); g.stroke();
        // an expanding ring that fades as it grows — the "it landed" pulse
        g.strokeStyle = 'rgba(232,193,90,' + (0.55 * k) + ')'; g.lineWidth = 2;
        g.beginPath(); g.arc(fx, fy, 3 + done * 13, 0, Math.PI * 2); g.stroke();
        // the flag itself, popping up from the ground
        const h = 16 * pop;
        g.strokeStyle = 'rgba(232,193,90,' + a + ')'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx, fy + 6); g.lineTo(fx, fy + 6 - h); g.stroke();
        g.fillStyle = 'rgba(232,193,90,' + a + ')';
        g.beginPath(); g.moveTo(fx, fy + 6 - h); g.lineTo(fx + 8 * pop, fy + 9 - h); g.lineTo(fx, fy + 12 - h); g.fill();
      }
    }

    // fog of war — blit the pre-blurred, feathered fog (built in redrawFog)
    if (this.fogDirty || !this.fogBlurCv) this.redrawFog();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogBlurCv, 0, 0, this.fogBlurCv.width, this.fogBlurCv.height, 0, 0, CFG.W * TL, CFG.H * TL);
    g.imageSmoothingEnabled = false;

    // SPECIAL EVENT — the long winter's pall: a cold blue cast and drifting
    // snow over the whole view while the freeze holds
    if (S.winter && S.winter.days > 0) {
      const vw = this.viewW() / this.cam.z, vh = this.viewH() / this.cam.z;
      g.fillStyle = 'rgba(168,192,226,0.14)';
      g.fillRect(this.cam.x, this.cam.y, vw, vh);
      const now3 = performance.now() / 1000;
      g.fillStyle = 'rgba(240,246,252,0.7)';
      for (let i = 0; i < 26; i++) {
        const fx3 = this.cam.x + ((i * 137 + now3 * (14 + (i % 5) * 4)) % vw);
        const fy3 = this.cam.y + ((i * 71 + now3 * (26 + (i % 3) * 9)) % vh);
        g.fillRect(fx3, fy3, 1.6, 1.6);
      }
    }

    // SPECIAL EVENT — the black dragon, drawn over the fog: nothing hides it
    if (S.dragon && S.dragon.ev) {
      const ev = S.dragon.ev;
      const dx2 = ev.x * TL, dy2 = ev.y * TL;
      const spr = Sprites.misc.dragon[((ev.t * 6) | 0) % 4];   // four-beat wing cycle
      // its shadow races along the ground below
      g.fillStyle = 'rgba(10,8,5,0.30)';
      g.beginPath(); g.ellipse(dx2, dy2 + 8, 32, 9, 0, 0, Math.PI * 2); g.fill();
      // fire breath during the strafe: a roaring cone from the jaws to the ground
      if (ev.phase === 'burn') {
        const F = ART.PALETTE.fire;
        const mx = dx2 + ev.dir * 72, my = dy2 - 52;           // the jaws (see sprite head position)
        for (let i = 0; i < 18; i++) {
          const t2 = i / 18;
          const bx2 = mx + ev.dir * t2 * 26 + Math.sin(ev.t * 22 + i * 2.4) * (2 + t2 * 4);
          const by2 = my + t2 * 58;
          const sz = 2.5 + t2 * 8;
          g.fillStyle = F[t2 < 0.3 ? 3 : t2 < 0.65 ? 2 : 1];
          g.fillRect(bx2 - sz / 2, by2 - sz / 2, sz, sz);
        }
        for (let i = 0; i < 6; i++) {                     // embers skittering at the impact
          g.fillStyle = F[i % 2 ? 0 : 1];
          g.fillRect(dx2 + ev.dir * (60 + i * 9) + Math.sin(ev.t * 17 + i * 3) * 5, dy2 + 4 + (i % 3) * 2, 3, 3);
        }
      }
      g.save();
      g.translate(dx2, dy2 - 34);
      if (ev.dir < 0) g.scale(-1, 1);
      g.drawImage(spr, -96, -48);
      g.restore();
    }

    // buildings coming DOWN — over the units, so the dust rolls across them
    this.drawCollapses(g, dt);
    this.drawDeaths(g, dt);     // …and villagers keeling over where they stood

    // floating text
    g.textAlign = 'center';
    g.font = 'bold 9px sans-serif';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t -= dt; f.y -= dt * 0.6;
      if (f.t <= 0) { this.floats.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, f.t * 2);
      g.fillStyle = f.col;
      g.fillText(f.txt, f.x * TL, f.y * TL);
      g.globalAlpha = 1;
    }

    // gentle long-cycle dusk: after ~10 bright days, night eases in and out
    // across ~2 days — one slow, calm breath, never a strobe. Screen-space
    // tint only; costs one or two fillRects.
    {
      const dayF = ((S.day - 1) % 12) + Math.min(1, S.dayT / CFG.DAY_MS);
      let k = 0;
      if (dayF > 10) k = Math.sin((dayF - 10) / 2 * Math.PI);
      if (k > 0.02) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = 'rgba(22,28,64,' + (0.20 * k).toFixed(3) + ')';
        g.fillRect(0, 0, this.cv.width, this.cv.height);
        const warm = 0.07 * Math.sin(Math.min(1, k * 2) * Math.PI);   // dusk/dawn glow
        if (warm > 0.01) {
          g.fillStyle = 'rgba(240,150,70,' + warm.toFixed(3) + ')';
          g.fillRect(0, 0, this.cv.width, this.cv.height);
        }
      }
    }

    // the monument is finished: hold the frame on it (tests/wonder.mjs)
    this.drawMarvel(g, dt);

    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.5; this.drawMini(); }
  },

  bar(g, x, y, w, h, frac, col) {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, y, w, h);
    g.fillStyle = col;
    g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  },

  // small minimap snapshot for cloud-save slot cards
  thumb() {
    try {
      const c = document.createElement('canvas');
      c.width = 72; c.height = 72;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(this.mini, 0, 0, 72, 72);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  },

  drawMini() {
    const AP = ART.PALETTE;
    const g = this.mg, COLORS = [AP.grass[3], AP.leaf[1], AP.water[2], AP.stone[2], AP.soil[2], AP.rust[1],
      AP.grass[2], AP.stone[3], AP.soil[3], AP.stone[1], AP.stone[0], AP.soil[0], AP.water[1], AP.soil[3],
      AP.gold[2]];
      // grass forest water hills fertile camp stumps pebbles barren ruin mountain trench moat mound goldore
      // (INDEXED BY TERRAIN — a new T.* needs a colour here or its tiles read as
      //  undefined and the minimap paints holes where they stand)
    const shadeCache = {};
    const shade = c => shadeCache[c] || (shadeCache[c] = c.replace(/[0-9a-f]{2}/gi,
      h => Math.max(0, (parseInt(h, 16) * 0.55) | 0).toString(16).padStart(2, '0')));
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      const edge = !MapGen.onBoard(x, y);
      const col = COLORS[S.map.seenTerrain[i]] || AP.grass[3];   // any unmapped terrain id falls back, never undefined
      g.fillStyle = edge ? '#0d0b08'                             // the black off-map rim (see drawTile)
        : !S.map.explored[i] ? '#060504'
        : (G.vis && G.vis[i]) ? col
        : shade(col);
      g.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const b of S.buildings) {
      if (!G.visibleAt(b.x, b.y)) continue;
      if (Bld.size(b) > 1) {
        g.fillStyle = b.owner === 'P' ? '#7ab4dc' : '#d98a80';
        g.fillRect(b.x * 2 - 1, b.y * 2 - 1, Bld.size(b) * 2 + 2, Bld.size(b) * 2 + 2);
        continue;
      }
      g.fillStyle = b.owner === 'P' ? '#5ab4f0' : '#f0645a';
      g.fillRect(b.x * 2 - 1, b.y * 2 - 1, 4, 4);
    }
    for (const k in S.map.seenB) {
      const i = +k;
      if ((G.vis && G.vis[i]) || !S.map.explored[i]) continue;
      g.fillStyle = S.map.seenB[k].owner === 'P' ? '#3a6a8a' : '#8a4a44';
      g.fillRect((i % CFG.W) * 2 - 1, ((i / CFG.W) | 0) * 2 - 1, 4, 4);
    }
    for (const u of S.units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      g.fillStyle = u.owner === 'P' ? '#c0e8ff' : u.owner === 'A' ? '#ffb0a8' : u.owner === 'R' ? '#3fd0b0' : '#e8d8a0';
      g.fillRect((u.x * 2) | 0, (u.y * 2) | 0, 2, 2);
    }
    // camera rect
    const TL = CFG.TILE;
    g.strokeStyle = '#f0e6d0'; g.lineWidth = 1;
    g.strokeRect(this.cam.x / TL * 2, this.cam.y / TL * 2,
      this.viewW() / this.cam.z / TL * 2, this.viewH() / this.cam.z / TL * 2);
  },
};
// classic-script top-level `const` bindings are NOT global-object properties,
// so map.js / buildings.js / assets.js guards like `if (window.R && ...)` were
// silently false — terrain never repainted after a dig, flood, clear or bridge.
// Mirror R onto window (as game.js does for S) so those guards fire.
window.R = R;
