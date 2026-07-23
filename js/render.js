"use strict";
/* Canvas renderer: camera, cached terrain layer, fog of war, entities, minimap. */

// grass-floored resources: drawn on a transparent floor over one continuous
// painted grass ground (see drawTile/paintGround) so no seam shows at block edges
const GROUND_GRAIN = new Set([T.FOREST, T.FERTILE, T.HILLS, T.MOUNTAIN, T.STUMPS, T.PEBBLES]);
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
    if (x === 0 || y === 0 || x === CFG.W - 1 || y === CFG.H - 1) {
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

  // fortification auto-tiling: connect to any adjacent wall/gate — and brace
  // flush against water, mountains, and the map edge, so a wall anchored on an
  // obstacle reads as a stout, sealed junction instead of an open end-cap
  wallMaskAt(x, y, extra) {
    const conn = (xx, yy) => {
      if (!MapGen.inB(xx, yy)) return true;                 // map edge
      if (Bld.blockAt(xx, yy) !== 0) return true;           // wall / gate
      const t = S.map.terrain[MapGen.idx(xx, yy)];
      if (t === T.WATER || t === T.MOUNTAIN) return true;   // natural barrier
      return !!(extra && extra.has(xx + ',' + yy));
    };
    return (conn(x, y - 1) ? 1 : 0) | (conn(x + 1, y) ? 2 : 0) |
           (conn(x, y + 1) ? 4 : 0) | (conn(x - 1, y) ? 8 : 0);
  },
  gateVerticalAt(x, y) {
    const conn = (xx, yy) => MapGen.inB(xx, yy) && Bld.blockAt(xx, yy) !== 0;
    const ns = conn(x, y - 1) || conn(x, y + 1), ew = conn(x + 1, y) || conn(x - 1, y);
    return ns && !ew;
  },
  bldSprite(b) {
    if (b.key === 'wall') return Sprites.wallMask[b.level - 1][this.wallMaskAt(b.x, b.y)];
    if (b.key === 'gate') return Sprites.gateMask[b.level - 1][this.gateVerticalAt(b.x, b.y) ? 1 : 0];
    return (b.owner === 'A' ? Sprites.buildingA : Sprites.building)[b.key][b.level - 1];
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
        return k === 'quarry' ? 'mine' : k === 'farm' ? 'farm'
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
    } else {
      // military units wear the village colour on their collar/stripe; barbarians,
      // siege engines and civilian boats fall through to their single sheet
      const mil = Sprites.militaryFor && Sprites.militaryFor(G.tunicOf(u.owner));
      sheet = (mil && mil[u.kind]) || Sprites.unit[u.kind] || Sprites.unit.villager;
    }
    const pose = sheet[this.unitPose(u)] ? this.unitPose(u) : (sheet.walk ? 'walk' : 'idle');
    const fr = sheet[pose];
    return fr[((u.animT * 4) | 0) % fr.length];
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
        g.fillStyle = WO[1];
        for (let px = 4; px < TL; px += 8) g.fillRect(wx + px, wy + 8, 3, (TL - 16) * (0.4 + prog * 0.6));   // planks going down
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
      const gs = Bld.size(snap.key) * TL;
      g.drawImage(spr, gx * TL, gy * TL, gs, gs);
    }

    // buildings (sorted by footprint bottom edge)
    const blds = S.buildings.slice().sort((a, b) =>
      (a.y + Bld.size(a.key)) - (b.y + Bld.size(b.key)));
    for (const b of blds) {
      const bs = Bld.size(b.key);
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
          g.globalAlpha = 0.55; g.drawImage(this.bldSprite(b), bx, by, bw, bw); g.globalAlpha = 1;
        } else {
          // 2×2 (TC) work-sites match the shape being raised: the timber
          // long-hall (→L2) or the stone keep (→L3). target = the level once done
          const tgt = up ? b.level + 1 : b.level;
          const key = bs >= 2 ? (tgt >= 3 ? 'misc/constructionBig3' : 'misc/constructionBig') : 'misc/construction';
          Assets.drawSprite(g, key, bx, by, { w: bw, h: bw });
        }
        const total = up ? (b.upgTotal || Bld.def(b.key).levels[b.level].time) : Bld.def(b.key).levels[b.level - 1].time;
        this.bar(g, bx + 4, by + bw - 4, bw - 8, 3, 1 - (up ? b.upgrading : b.construction) / total, '#e8c15a');
        // still tag the owner so a work site reads as friend or foe
        g.fillStyle = b.owner === 'P' ? '#4a90c2' : '#c2564a';
        g.fillRect(bx + 1, by + 1, 4, 4);
      } else {
        g.drawImage(this.bldSprite(b), bx, by, bw, bw);
        // owner tag
        g.fillStyle = b.owner === 'P' ? '#4a90c2' : '#c2564a';
        g.fillRect(bx + 1, by + 1, 4, 4);
        if (b.key === 'tc' && b.level === 1) {
          // the camp's heart: a small live flame flickering over the baked embers
          const F = ART.PALETTE.fire;
          const fx2 = bx + 0.78 * TL, fy2 = by + 1.64 * TL;
          const ph = ((performance.now() / 150) | 0) % 2;
          g.fillStyle = F[2]; g.fillRect(fx2 - 2, fy2 - 2 - ph, 4, 2 + ph);
          g.fillStyle = F[3]; g.fillRect(fx2 - 1, fy2 - 4 - ph, 2, 3);
          g.fillStyle = F[1]; g.fillRect(fx2 + (ph ? 1 : -2), fy2 - 5, 1, 2);
        }
      }
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
      const ux = u.x * TL - TL / 2, uy = u.y * TL - TL / 2 - 4;
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
        g.drawImage(this.unitSprite(u), -TL / 2, -TL / 2 - 4, TL, TL);
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
        g.drawImage(this.unitSprite(u), -TL / 2, -TL / 2 - 4, TL, TL);
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
          // the grand hall's hearth is the dooryard campfire (2x2 footprint)
          this.smoke.push({ x: b.x + (pit ? 0.78 : 0.5) + (Math.random() - 0.5) * 0.12,
                            y: b.y + (pit ? 1.62 : 0.18),
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
        const spr = UI.placing === 'gate'
          ? Sprites.gateMask[0][this.gateVerticalAt(t.x, t.y) ? 1 : 0]
          : UI.placing === 'wall'
            ? Sprites.wallMask[0][this.wallMaskAt(t.x, t.y)]
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
      AP.grass[2], AP.stone[3], AP.soil[3], AP.stone[1], AP.stone[0], AP.soil[0], AP.water[1], AP.soil[3]];
      // grass forest water hills fertile camp stumps pebbles barren ruin mountain trench moat mound
    const shadeCache = {};
    const shade = c => shadeCache[c] || (shadeCache[c] = c.replace(/[0-9a-f]{2}/gi,
      h => Math.max(0, (parseInt(h, 16) * 0.55) | 0).toString(16).padStart(2, '0')));
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      const edge = (x === 0 || y === 0 || x === CFG.W - 1 || y === CFG.H - 1);
      const col = COLORS[S.map.seenTerrain[i]] || AP.grass[3];   // any unmapped terrain id falls back, never undefined
      g.fillStyle = edge ? '#0d0b08'                             // the black off-map rim (see drawTile)
        : !S.map.explored[i] ? '#060504'
        : (G.vis && G.vis[i]) ? col
        : shade(col);
      g.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const b of S.buildings) {
      if (!G.visibleAt(b.x, b.y)) continue;
      if (Bld.size(b.key) > 1) {
        g.fillStyle = b.owner === 'P' ? '#7ab4dc' : '#d98a80';
        g.fillRect(b.x * 2 - 1, b.y * 2 - 1, Bld.size(b.key) * 2 + 2, Bld.size(b.key) * 2 + 2);
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
