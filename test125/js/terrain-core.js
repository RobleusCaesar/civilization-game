/* GENERATED from tc4.src.js by build.cjs — edit the source */
/* TERRAIN COMPOSITOR v3 — THE PURE CORE.
   Everything here is arithmetic on arrays: no DOM, no canvas, no game globals.
   The same function runs inside a Web Worker (built from TCCore.toString())
   and on the main thread as the fallback, so both produce identical pixels.

   A chunk is 8x8 tiles at 64 texels per tile (2x the world's pixel density).
   Its picture is composed in layers, the way a painter would:
     LAND    grass in three scales, shore materials, scree, worn ground
     BED     what lies under the water: sand, silt, mud, weed, stones
     WATER   a translucent medium over the bed: per-channel absorption by
             depth plus the water's own colour; the bed shows through where
             it is shallow and fades out as it deepens
     SHADOW  trees and stones throw shade down-right, on land and water
   Depth is NOT the distance to the coast: the distance is shaped by each
   body's own depth, a shelf length that varies along the shore, and
   underwater topography, and the colour is continuous before a fine
   quantisation, so no contour of the distance field survives. */
function TCCore() {
  'use strict';
  const TS = 64, CH = 8, SDF_F = 16, Q = 4, CQ = 16, N = CH * TS;
  const pk = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
  const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // ---- palettes ---------------------------------------------------------------
  // grass: a cool rich green by default; warm/dry only in dry patches; lush by water
  const R_COOL = ['#203a1b', '#284820', '#305625', '#39652a', '#43732e', '#4e8133', '#5a8e39', '#679a40', '#78a74a'].map(hx);
  const R_DRY = ['#33441c', '#3f5120', '#4b5f24', '#586d28', '#667b2d', '#748732', '#829239', '#919e43', '#a2aa50'].map(hx);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) R_DRY[i][j] = Math.round(R_COOL[i][j] * 0.58 + R_DRY[i][j] * 0.42);
  const R_LUSH_OLD = ['#1b381c', '#224621', '#295526', '#30632b', '#387230', '#418036', '#4b8d3d', '#579a45', '#66a64f'].map(hx);
  const R_LUSH = R_COOL.map(([r, g, b]) => [Math.round(r * 0.95), Math.min(255, Math.round(g * 1.02)), Math.round(b * 0.99)]);
  const SAND = ['#b49c70', '#c4ab7c', '#d0b886', '#dbc391', '#e4cd9c', '#ecd8ab'].map(hx);
  const SAND_WET = ['#8f7f5c', '#9c8b65', '#a8966d'].map(hx);
  const MUD = ['#3d3020', '#4a3a26', '#57452d', '#655134', '#735d3c'].map(hx);
  const COBBLE = ['#4a4840', '#5b584d', '#6d695c', '#807b6b', '#958f7d', '#a9a28e'].map(hx);
  const SCREE = ['#4a4a3e', '#5b5a48', '#6c6a55', '#7d7a64', '#8f8b74', '#a29d86'].map(hx);
  const P = a => a.map(c => pk(c[0], c[1], c[2]));
  const PC = { cool: P(R_COOL), dry: P(R_DRY), lush: P(R_LUSH), sand: P(SAND), wet: P(SAND_WET), mud: P(MUD), cob: P(COBBLE), scree: P(SCREE) };
  // V4: the water's colour is light scattered back out of it, shallow -> deep, per body
  // kind; the bed shows through by per-channel transmittance (red is absorbed first)
  const WPAL = {
    sea:  { s0: [58, 164, 176], s1: [30, 100, 168], k: [2.4, 1.15, 0.85] },
    lake: { s0: [56, 156, 160], s1: [32, 102, 152], k: [2.3, 1.1, 0.9] },
    pond: { s0: [54, 158, 150], s1: [30, 104, 118], k: [2.0, 1.0, 0.95] },
    chan: { s0: [66, 140, 126], s1: [44, 100, 106], k: [2.4, 1.25, 1.15] },
  };
  const SKY = [200, 226, 236];
  // the palette for every (body depth, channel weight): 100 x 11 entries of s0 rgb, s1 rgb, k rgb
  const PALT = new Float32Array(100 * 11 * 9);
  for (let i = 0; i < 100; i++) for (let j = 0; j < 11; j++) {
    const kd = i / 20, ch = j / 10, a1 = kd < 1.0 ? 0 : kd > 2.0 ? 1 : kd - 1.0, a2 = kd < 2.2 ? 0 : kd > 3.0 ? 1 : (kd - 2.2) / 0.8, o = (i * 11 + j) * 9;
    let n = 0;
    for (const key of ['s0', 's1', 'k']) for (let c = 0; c < 3; c++) { const p = WPAL.pond[key][c] + (WPAL.lake[key][c] - WPAL.pond[key][c]) * a1, r_ = p + (WPAL.sea[key][c] - p) * a2; PALT[o + n++] = r_ + (WPAL.chan[key][c] - r_) * ch; }
  }
  const BED = { sand: [196, 178, 132], silt: [92, 98, 76], mud: [98, 84, 58], rock: [116, 112, 98], weed: [56, 74, 42] };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
  // exp lookup for absorption, 1/64 depth unit steps up to 8
  const OMEXP = new Float32Array(1024); for (let i = 0; i < 1024; i++) OMEXP[i] = 1 - Math.exp(-i / 64);

  const core = {
    seed: 0, W: 0, H: 0, T: null, terr: null, sdf: null, sw: 0, sh: 0, F: {}, blds: [], shade: null, shW: 0,
    TS, CH, N,
    hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041 + this.seed) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; },
    vn(x, y, s) {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = this.hash(x0, y0, s), b = this.hash(x0 + 1, y0, s), c = this.hash(x0, y0 + 1, s), d = this.hash(x0 + 1, y0 + 1, s);
      return a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy;
    },
    fbm(x, y, s) { return this.vn(x, y, s) * 0.57 + this.vn(x * 2.03, y * 2.03, s + 7) * 0.29 + this.vn(x * 4.1, y * 4.1, s + 13) * 0.14; },
    // tile fields: values at tile centres, bilinear between them
    tf(F, u, v) {
      const W = this.W, H = this.H, x = u - 0.5, y = v - 0.5;
      const x0 = Math.max(0, Math.min(W - 2, Math.floor(x))), y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0)), i = y0 * W + x0;
      return (F[i] * (1 - fx) + F[i + 1] * fx) * (1 - fy) + (F[i + W] * (1 - fx) + F[i + W + 1] * fx) * fy;
    },
    // the body's depth field is a distance transform on the tile grid: it folds in straight
    // ridges from every corner, and a ridge in the depth reads as a line across the water
    // what stretch of shore stands at (u, v), in tiles: [sand, rock, mud]
    shoreMat(u, v, F, out) {
      const fF = this.tf(F.dForest, u, v), fR = this.tf(F.dRock, u, v), bD = this.tf(this.bodyB || F.bodyD, u, v), dMo = this.tf(F.dMoat, u, v), dSe = this.tf(F.dSea, u, v);
      const wm = Math.max(0, Math.min(1, (1.5 - dMo) * 1.2)) * Math.max(0, Math.min(1, (dSe - 0.7) / 1.0));
      const expo = Math.max(0, Math.min(1, (bD - 1.0) / 2.5)) * (1 - wm);
      const beach = Math.max(0, Math.min(1, (this.fbm(u / 4.2 + 11, v / 4.2 + 3, 38) - 0.52) / 0.12));
      out[0] = expo * beach;
      out[1] = Math.max(0, Math.min(1, (1.7 - fR) / 1.1)) + Math.max(0, Math.min(1, (this.fbm(u / 2.6 + 50, v / 2.6 + 8, 37) - 0.66) / 0.1)) * 0.75;
      out[2] = wm + (1 - expo) * 0.62 * Math.max(0, Math.min(1, (this.fbm(u / 3 + 5, v / 3 + 9, 39) - 0.42) / 0.2)) + Math.max(0, Math.min(1, (1.4 - fF) / 1.0)) * 0.25;
      // a pond is its own place: reedy, rocky, clear or deep, by its hash; mostly grass runs
      // down to it, with a stretch or two of earth, sand or half-buried stone
      const ph = this.pondHash(u, v), pf = ph < 0 ? 0 : Math.max(0, Math.min(1, (1.9 - bD) / 0.7)) * (1 - wm);
      if (pf > 0) {
        const ty = this.pondType(ph), pt = this.fbm(u / 1.5 + ph * 37, v / 1.5 + ph * 11, 47);
        const rk = ty === 1 ? Math.max(0, Math.min(1, (pt - 0.42) / 0.1)) * 0.38 : Math.max(0, Math.min(1, (pt - 0.74) / 0.06)) * 0.25;
        const md = ty === 0 ? Math.max(0, Math.min(1, (pt - 0.5) / 0.08)) * 0.4 : Math.max(0, Math.min(1, (0.26 - pt) / 0.06)) * 0.36;
        const sd = ty === 2 ? Math.max(0, Math.min(1, (pt - 0.5) / 0.07)) * 0.4 : 0;
        out[0] += (sd - out[0]) * pf; out[1] += (rk - out[1]) * pf; out[2] += (md - out[2]) * pf;
      }
      return out;
    },
    blurBody() {
      const W = this.W, H = this.H; this.FB = {};
      for (const key of ['bodyD']) { const a = this.F[key]; if (!a) continue;
      let cur = Float32Array.from(a);
      for (let it = 0; it < 3; it++) {
        const nx = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let acc = 0, wsum = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.max(0, Math.min(W - 1, x + dx)), yy = Math.max(0, Math.min(H - 1, y + dy)), wt = (dx ? 1 : 2) * (dy ? 1 : 2);
            acc += cur[yy * W + xx] * wt; wsum += wt;
          }
          nx[y * W + x] = acc / wsum;
        }
        cur = nx;
      }
      this.FB[key] = cur; }
      this.bodyB = this.FB.bodyD;
    },
    blurSDF() {
      const w = this.sw, h = this.sh, src = this.sdf, R = 5, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
      const pass = (a, b, horiz) => {
        for (let o = 0; o < (horiz ? h : w); o++) {
          const len = horiz ? w : h, st = horiz ? 1 : w, base = horiz ? o * w : o;
          let acc = 0; for (let i = -R; i <= R; i++) acc += a[base + Math.max(0, Math.min(len - 1, i)) * st];
          for (let i = 0; i < len; i++) { b[base + i * st] = acc / (2 * R + 1); acc += a[base + Math.min(len - 1, i + R + 1) * st] - a[base + Math.max(0, i - R) * st]; }
        }
      };
      pass(src, tmp, true); pass(tmp, out, false); pass(out, tmp, true); pass(tmp, out, false);
      this.sdfB = out;
    },
    sdfAtB(wx, wy) {
      const f = SDF_F / 32, x = wx * f - 0.5, y = wy * f - 0.5;
      const x0 = Math.max(0, Math.min(this.sw - 2, Math.floor(x))), y0 = Math.max(0, Math.min(this.sh - 2, Math.floor(y)));
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0)), s = this.sdfB, w = this.sw, i = y0 * w + x0;
      return (s[i] * (1 - fx) + s[i + 1] * fx) * (1 - fy) + (s[i + w] * (1 - fx) + s[i + w + 1] * fx) * fy;
    },
    sdfAt(wx, wy) {
      const f = SDF_F / 32, x = wx * f - 0.5, y = wy * f - 0.5;
      const x0 = Math.max(0, Math.min(this.sw - 2, Math.floor(x))), y0 = Math.max(0, Math.min(this.sh - 2, Math.floor(y)));
      const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0)), s = this.sdf, w = this.sw, i = y0 * w + x0;
      return (s[i] * (1 - fx) + s[i + 1] * fx) * (1 - fy) + (s[i + w] * (1 - fx) + s[i + w + 1] * fx) * fy;
    },

    // every body of water gets its own character, from the seed and the place: a hash per
    // body (named by its first tile), spread a few tiles onto the land so the banks can read it
    labelBodies() {
      const W = this.W, H = this.H, T = this.T, terr = this.terr; if (!terr || !T) return;
      const wet = t => t === T.WATER || t === T.MOAT, PH = new Float32Array(W * H).fill(-1), st = [];
      let fr = [];
      for (let i = 0; i < W * H; i++) {
        if (!wet(terr[i]) || PH[i] >= 0) continue;
        const h = this.hash(i % W, (i / W) | 0, 990); PH[i] = h; st.push(i);
        while (st.length) { const q = st.pop(); fr.push(q); const x = q % W, y = (q / W) | 0;
          if (x > 0 && PH[q - 1] < 0 && wet(terr[q - 1])) { PH[q - 1] = h; st.push(q - 1); }
          if (x < W - 1 && PH[q + 1] < 0 && wet(terr[q + 1])) { PH[q + 1] = h; st.push(q + 1); }
          if (y > 0 && PH[q - W] < 0 && wet(terr[q - W])) { PH[q - W] = h; st.push(q - W); }
          if (y < H - 1 && PH[q + W] < 0 && wet(terr[q + W])) { PH[q + W] = h; st.push(q + W); } }
      }
      for (let r = 0; r < 4 && fr.length; r++) { const nx = [];
        for (const q of fr) { const x = q % W, y = (q / W) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const n = Y * W + X; if (PH[n] < 0) { PH[n] = PH[q]; nx.push(n); } } }
        fr = nx; }
      this.PH = PH;
    },
    pondType(ph) { return this.forcePond != null ? this.forcePond : ph < 0.32 ? 0 : ph < 0.54 ? 1 : ph < 0.78 ? 2 : 3; },
    pondHash(u, v) { const W = this.W, H = this.H, PH = this.PH; if (!PH) return -1; const x = Math.max(0, Math.min(W - 1, u | 0)), y = Math.max(0, Math.min(H - 1, v | 0)); return PH[y * W + x]; },
    // ---- world data -------------------------------------------------------------
    setWorld(w) {
      for (const k of Object.keys(w)) this[k] = w[k];
      if (w.seed != null && this._texSeed !== this.seed) { this.makeTextures(); this._texSeed = this.seed; }
      if (w.sdf) this.blurSDF();
      if (w.F) this.blurBody();
      if (w.terr) this.labelBodies();
    },
    // a window of the SDF or the shade mask replaced after an edit
    patch(p) {
      if (p.sdfWin) { const [x0, y0, w, h, data] = p.sdfWin; for (let y = 0; y < h; y++) this.sdf.set(data.subarray(y * w, y * w + w), (y0 + y) * this.sw + x0); }
      if (p.sdfWin) this.blurSDF();
      if (p.shadeWin) { const [x0, y0, w, h, data] = p.shadeWin; for (let y = 0; y < h; y++) this.shade.set(data.subarray(y * w, y * w + w), (y0 + y) * this.shW + x0); }
      for (const k of ['terr', 'F', 'blds']) if (p[k]) this[k] = p[k];
      if (p.forcePond !== undefined) this.forcePond = p.forcePond;   // review shots only: one pond in each of its characters
      if (p.F) this.blurBody();               // after the new fields are in place
      if (p.terr) this.labelBodies();
    },

    // ---- textures (seeded) --------------------------------------------------------
    makeMicro(P_, cell, so) {
      const n = Math.round(P_ / cell), pts = []; cell = P_ / n;
      for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
        const h1 = this.hash(cx, cy, so), h2 = this.hash(cx, cy, so + 1), h3 = this.hash(cx, cy, so + 2);
        pts.push([cx * cell + (0.15 + 0.7 * h1) * cell, cy * cell + (0.15 + 0.7 * h2) * cell, cell * (0.62 + 0.38 * h3)]);
      }
      const out = new Float32Array(P_ * P_);
      for (let y = 0; y < P_; y++) for (let x = 0; x < P_; x++) {
        const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        let f1 = 9, f2 = 9, bdx = 0, bdy = 0, br = 1;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const cx = (gx + ox + n) % n, cy = (gy + oy + n) % n, q = pts[cy * n + cx];
          let dx = x - q[0], dy = y - q[1];
          if (dx > P_ / 2) dx -= P_; if (dx < -P_ / 2) dx += P_; if (dy > P_ / 2) dy -= P_; if (dy < -P_ / 2) dy += P_;
          const f = Math.sqrt(dx * dx + dy * dy) / q[2];
          if (f < f1) { f2 = f1; f1 = f; bdx = dx; bdy = dy; br = q[2]; } else if (f < f2) f2 = f;
        }
        let v;
        if (f1 < 1) { const lit = -(bdx + bdy) / (br * 1.6); v = 0.5 + lit * 0.42 - f1 * f1 * 0.12; if (f2 - f1 < 0.08) v -= 0.08; } else v = 0.2;
        out[y * P_ + x] = v - 0.45;
      }
      return { P: P_, d: out };
    },
    makeBlades(P_, count, so, amp) {
      const d = new Float32Array(P_ * P_);
      const add = (x, y, v) => { x = ((x % P_) + P_) % P_; y = ((y % P_) + P_) % P_; d[y * P_ + x] += v; };
      for (let k = 0; k < count; k++) {
        const x = Math.floor(this.hash(k, 1, so) * P_), y = Math.floor(this.hash(k, 2, so) * P_);
        const len = 2 + Math.floor(this.hash(k, 3, so) * 3.2), lean = this.hash(k, 4, so) < 0.62 ? 1 : (this.hash(k, 5, so) < 0.5 ? 0 : -1);
        const a = amp * (0.6 + 0.6 * this.hash(k, 6, so));
        for (let j = 0; j < len; j++) { const t = (j + 1) / len; add(x + Math.round(lean * j * 0.5), y - j, a * (0.35 + 0.65 * t)); }
        add(x + 1, y + 1, -a * 0.8); add(x, y + 1, -a * 0.45);
      }
      return { P: P_, d };
    },
    makeNoiseTex(P_, freq, so) {
      const d = new Float32Array(P_ * P_), g = P_ / freq, L = [];
      for (let j = 0; j <= freq; j++) for (let i = 0; i <= freq; i++) L.push(this.hash(i % freq, j % freq, so));
      for (let y = 0; y < P_; y++) for (let x = 0; x < P_; x++) {
        const u = x / g, v = y / g, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = freq + 1;
        const a = L[j * w + i], b = L[j * w + i + 1], c = L[(j + 1) * w + i], e = L[(j + 1) * w + i + 1];
        d[y * P_ + x] = a + (b - a) * sx + (c - a + (e - c - b + a) * sx) * sy;
      }
      return { P: P_, d };
    },
    tex(t, x, y) { const P_ = t.P; return t.d[((y % P_ + P_) % P_) * P_ + ((x % P_ + P_) % P_)]; },
    // a small sprite made of packed pixels (0 = transparent)
    sprite(w, h, fn) { const px = new Uint32Array(w * h); fn((x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; }); return { w, h, px }; },
    makeTextures() {
      // V4 GRASS: drawn, not smudged. Blades are hard 1-texel strokes, lit at the tip with a
      // dark root, gathered into clumps by a slow field (so no even speckle); broad tone comes
      // from the macro fields; there is NO ordered dither, so every edge is a pixel edge.
      const micA = this.makeMicro(256, 12, 300), micB = this.makeMicro(256, 22, 310);
      const cl = this.makeNoiseTex(512, 22, 341), cl2 = this.makeNoiseTex(512, 9, 342), n3 = this.makeNoiseTex(512, 170, 330);
      const GMp = 512, GM = new Float32Array(GMp * GMp), HM = new Float32Array(GMp * GMp), CL = new Float32Array(GMp * GMp);
      for (let y = 0; y < GMp; y++) for (let x = 0; x < GMp; x++) {
        const q = y * GMp + x, c1 = cl.d[q], c2 = cl2.d[((y + 211) & 511) * GMp + ((x + 97) & 511)];
        GM[q] = (c1 - 0.5) * 0.07 + (c2 - 0.5) * 0.05 + (n3.d[q] - 0.5) * 0.11;   // the fine term rags every tone edge
        HM[q] = (n3.d[q] - 0.5) * 0.10 + this.tex(micB, x + 97, y + 41) * 0.12;
        CL[q] = Math.max(this.tex(micA, x, y), this.tex(micB, x + 53, y + 151) - 0.05);   // shore cobbles: two sizes mixed, never a grid
      }
      const put = (x, y, v, mode) => { x &= 511; y &= 511; const q = y * GMp + x; GM[q] = mode ? Math.min(GM[q], v) : Math.max(GM[q], v); };
      for (let k = 0; k < 26000; k++) {
        const x = Math.floor(this.hash(k, 1, 351) * GMp), y = Math.floor(this.hash(k, 2, 351) * GMp), dens = cl.d[(y & 511) * GMp + (x & 511)];
        if (this.hash(k, 3, 351) > 0.25 + dens * 0.9) continue;           // blades gather where the clump field is high
        const len = 2 + Math.floor(this.hash(k, 4, 351) * 2.6), lean = this.hash(k, 5, 351) < 0.55 ? 0 : (this.hash(k, 6, 351) < 0.5 ? 1 : -1), dark = this.hash(k, 7, 351) < 0.3;
        const base = GM[(y & 511) * GMp + (x & 511)];
        if (dark) { for (let j = 0; j < len; j++) put(x + (j === len - 1 ? lean : 0), y - j, base - 0.13, 1); continue; }
        for (let j = 0; j < len; j++) put(x + (j === len - 1 ? lean : 0), y - j, base + (j === len - 1 ? 0.2 : 0.12), 0);
        put(x, y + 1, base - 0.12, 1);                                   // the root in shade
      }
      this.GM = GM; this.HM = HM; this.CL = CL;
      this.NZ3 = this.makeNoiseTex(256, 85, 331).d;
      this.NZ8 = this.makeNoiseTex(256, 32, 320).d;
      this.NZS = this.makeNoiseTex(256, 64, 340).d;
      // grass tufts as relief: a fan of pointed blades and the shade they throw
      this.tufts = [];
      for (let k = 0; k < 18; k++) {
        const r = i => this.hash(k, i, 911), w = 10 + Math.floor(r(0) * 6), h = 8 + Math.floor(r(1) * 4), d = new Float32Array(w * (h + 2));
        const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h + 2) d[y * w + x] = v; };
        const nb = 4 + Math.floor(r(3) * 4), cx0 = w / 2, base = h;
        for (let x = 1; x < w; x++) { set(x, base, -0.09); if (x > 2 && x < w - 1) set(x, base + 1, -0.06); }
        for (let b = 0; b < nb; b++) {
          const spread = (b / Math.max(1, nb - 1) - 0.5) * 2, len = Math.round(h * (0.55 + 0.45 * r(20 + b)) * (1 - Math.abs(spread) * 0.3));
          const x0 = cx0 + spread * 1.6 + (r(10 + b) - 0.5);
          for (let j = 0; j < len; j++) { const t = j / len, x = Math.round(x0 + spread * (w * 0.32) * t * t), y = base - 1 - j; set(x, y, 0.06 + t * 0.2); }
        }
        this.tufts.push({ w, h: h + 2, d });
      }
      // flowers: mostly white, some yellow, a few red or pink
      const FL = [['#f4f1e4', '#e8c24a'], ['#f4f1e4', '#e8c24a'], ['#efe9d4', '#d8b040'], ['#f0d04a', '#c8902a'], ['#d9573a', '#f0c050'], ['#e7a2c0', '#f4f1e4']].map(([a, b]) => [pk(...hx(a)), pk(...hx(b))]);
      const stem = [PC.cool[3], PC.cool[2], PC.cool[4]];
      this.flowers = FL.map(([petal, eye]) => this.sprite(5, 6, p => { p(2, 0, petal); p(1, 1, petal); p(3, 1, petal); p(2, 1, eye); p(2, 2, petal); p(2, 3, stem[0]); p(2, 4, stem[1]); p(3, 3, stem[2]); }));
      // land pebbles
      this.pebbles = [];
      for (let k = 0; k < 10; k++) {
        const r = i => this.hash(k, i, 777), w = 4 + Math.floor(r(0) * 4), h = 3 + Math.floor(r(1) * 2);
        this.pebbles.push(this.sprite(w + 1, h + 1, p => {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ex = (x + 0.5 - w / 2) / (w / 2), ey = (y + 0.5 - h / 2) / (h / 2); if (ex * ex + ey * ey > 1.05) continue; p(x, y, (x + y) < (w + h) * 0.45 ? pk(169, 165, 154) : pk(125, 122, 114)); }
          for (let x = 1; x <= w; x++) p(x, h, pk(46, 52, 30));
        }));
      }
      // reeds: a clump of upright blades, dark at the foot, sunlit at the tip; some cattails
      const RG = ['#2c4a22', '#3a5e28', '#4c7430', '#64893a', '#86a24c'].map(c => pk(...hx(c))), CAT = [pk(98, 64, 36), pk(122, 82, 46)];
      this.reeds = [];
      for (let k = 0; k < 8; k++) {
        const r = i => this.hash(k, i, 1201), w = 9 + Math.floor(r(0) * 5), h = 12 + Math.floor(r(1) * 6), nb = 4 + Math.floor(r(2) * 4);
        this.reeds.push(this.sprite(w, h, p => {
          for (let b = 0; b < nb; b++) {
            const x0 = 1 + Math.round((b + 0.5) / nb * (w - 3) + (r(10 + b) - 0.5) * 2), len = Math.round(h * (0.5 + 0.5 * r(20 + b))), lean = r(30 + b) < 0.5 ? -1 : 1;
            for (let j = 0; j < len; j++) { const t = j / len, x = x0 + Math.round(lean * t * t * 2.2); p(x, h - 1 - j, RG[Math.min(4, Math.floor(t * 4.6))]); }
            if (r(40 + b) < 0.3 && len > h * 0.7) { const x = x0 + Math.round(lean * 0.5); for (let j = 0; j < 3; j++) { p(x, h - len + 1 + j, CAT[j === 0 ? 1 : 0]); p(x + 1, h - len + 1 + j, CAT[0]); } }
          }
        }));
      }
      // lily pads: round, notched, lit from the upper left; a few in flower
      const LP = ['#2d5a2a', '#3c7232', '#4f8a3c', '#6aa24a'].map(c => pk(...hx(c))), FLW = [pk(244, 240, 228), pk(236, 170, 196)], EYE = pk(232, 196, 70);
      this.lilies = [];
      for (let k = 0; k < 8; k++) {
        const r = i => this.hash(k, i, 1301), w = 10 + Math.floor(r(0) * 5), h = Math.max(6, Math.round(w * 0.66)), notch = r(1) * 6.283, fl = r(2) < 0.3;
        this.lilies.push(this.sprite(w, h + 1, p => {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const ex = (x + 0.5 - w / 2) / (w / 2), ey = (y + 0.5 - h / 2) / (h / 2), e = ex * ex + ey * ey; if (e > 1) continue;
            const a = Math.atan2(ey, ex), da = Math.abs(((a - notch + 9.42) % 6.283) - 3.14); if (da < 0.32 && e > 0.05) continue;
            const lit = -(ex * 0.6 + ey * 0.8); p(x, y, e > 0.72 ? LP[0] : lit > 0.35 ? LP[3] : lit > -0.2 ? LP[2] : LP[1]);
          }
          for (let x = 1; x < w - 1; x++) p(x, h, 0x00000000);
          if (fl) { const fx = Math.round(w / 2 + (r(3) - 0.5) * 2), fy = Math.round(h / 2 - 1), c = FLW[r(4) < 0.6 ? 0 : 1]; p(fx, fy - 1, c); p(fx - 1, fy, c); p(fx + 1, fy, c); p(fx, fy + 1, c); p(fx, fy, EYE); }
        }));
      }
      // bed stones: lit from the upper left, drawn into the BED so the water tints them
      this.bedStones = [];
      for (let k = 0; k < 16; k++) {
        const r = i => this.hash(k, i, 555), w = 6 + Math.floor(r(0) * 12), h = Math.max(4, Math.round(w * (0.55 + r(1) * 0.3)));
        const ph1 = r(2) * 6.283, ph2 = r(3) * 6.283, a1 = 0.1 + r(4) * 0.14, a2 = 0.05 + r(5) * 0.08, warm = (r(6) - 0.5) * 18, base = 150 + r(7) * 40;
        this.bedStones.push(this.sprite(w, h, p => {
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const ex = (x + 0.5 - w / 2) / (w / 2), ey = (y + 0.5 - h / 2) / (h / 2), th = Math.atan2(ey, ex);
            const rr = 1 + a1 * Math.sin(3 * th + ph1) + a2 * Math.sin(5 * th + ph2), e = Math.hypot(ex, ey) / rr;
            if (e > 1) continue;
            // a rounded top lit from the upper left; the lower right falls into shade
            const lit = -(ex * 0.62 + ey * 0.78) * (1 - e * 0.35);
            let v = lit > 0.42 ? 1.12 : lit > 0.05 ? 0.96 : lit > -0.35 ? 0.8 : 0.64;
            if (e > 0.82 && lit < -0.1) v = 0.52;
            const g = base * v;
            p(x, y, pk(Math.min(255, g + warm * 0.5), Math.min(255, g + warm * 0.2), Math.min(255, g - warm * 0.4 - 8)));
          }
        }));
      }
    },

    // ---- one chunk    },

    // ---- one chunk ------------------------------------------------------------------
    warm() {
      const nC = Math.ceil(this.W / 8); let best = 0, bc = 0, br = 0;
      for (let cy = 0; cy < nC; cy++) for (let cx = 0; cx < nC; cx++) {
        let c = 0;
        for (let y = cy * 8; y < Math.min(this.H, cy * 8 + 8); y++) for (let x = cx * 8; x < Math.min(this.W, cx * 8 + 8); x++) {
          const d = this.sdfAt(x * 32 + 16, y * 32 + 16); if (d > -40 && d < 40) c++; }
        if (c > best) { best = c; bc = cx; br = cy; }
      }
      const t0 = Date.now(); this.chunk(bc, br); this.chunk(bc, br); return Date.now() - t0;
    },
    chunk(cx, cy) {
      const W = this.W, H = this.H, T = this.T, F = this.F, terr = this.terr;
      const n = N / Q + 1, NN = n * n, ox = cx * N, oy = cy * N;
      const nearB = this.blds.filter(b => b.x + b.s + 3 > cx * CH && b.x - 3 < (cx + 1) * CH && b.y + b.s + 3 > cy * CH && b.y - 3 < (cy + 1) * CH);
      // the coarse lattice: every quarter tile
      const cn = N / CQ + 1, CN = cn * cn, NF = 18, C = [];
      for (let f = 0; f < NF; f++) C.push(new Float32Array(CN));
      const [cL0, cDRY, cLUSH, cWM, cSHELF, cDMAX, cTOPO, cPERT, cSAND, cROCK, cMUD, cSANDW, cRK, cWN, cEXPO, cKIND, cREFL, cHUE] = C, MT = [0, 0, 0];
      for (let j = 0; j < cn; j++) for (let i = 0; i < cn; i++) {
        const u = (ox + i * CQ) / TS, v = (oy + j * CQ) / TS, k = j * cn + i;
        const fF = this.tf(F.dForest, u, v), fM = this.tf(F.dMtn, u, v), fR = this.tf(F.dRock, u, v), fW = this.tf(F.dWet, u, v);
        const bD = this.tf(this.bodyB || F.bodyD, u, v), dMo = this.tf(F.dMoat, u, v), dSe = this.tf(F.dSea, u, v);
        cL0[k] = 0.55 + (this.fbm(u / 6.5, v / 6.5, 61) - 0.5) * 0.30 + (this.fbm(u / 1.9 + 11, v / 1.9 + 5, 62) - 0.5) * 0.18
          - (Math.max(0, 1 - fF / 1.3) * 0.15 + Math.max(0, 1 - fM / 1.3) * 0.09);
        cDRY[k] = Math.max(0, Math.min(1, (this.fbm(u / 3.4 + 3, v / 3.4 + 17, 65) - 0.63) / 0.1)) * Math.max(0, Math.min(1, (fW - 2.5) / 3)) * Math.max(0, Math.min(1, (fF - 1) / 2));
        cLUSH[k] = Math.max(0, Math.min(1, (2.6 - fW) / 2.2)) * 0.85 + Math.max(0, Math.min(1, (1.6 - fF) / 1.2)) * 0.5;
        const wm = Math.max(0, Math.min(1, (1.5 - dMo) * 1.2)) * Math.max(0, Math.min(1, (dSe - 0.7) / 1.0));
        cWM[k] = wm;
        const ph0 = this.pondHash(u, v), pf0 = ph0 < 0 ? 0 : Math.max(0, Math.min(1, (1.9 - bD) / 0.7)) * (1 - wm), pty0 = this.pondType(ph0);
        cSHELF[k] = (24 + 56 * this.fbm(u / 4.5 + 9, v / 4.5 + 2, 32)) * Math.max(0.35, Math.min(1.3, bD / 3)) * (1 - 0.45 * pf0);
        // a pond is small but not a puddle: it shelves to a darker middle, deepest for the 'deep' kind
        cDMAX[k] = (Math.max(0.5, Math.min(3.6, bD * 0.8)) * (1 - pf0) + pf0 * [1.15, 1.35, 1.05, 2.3][pty0]) * (1 - wm * 0.1) + wm * 0.5;   // a dug channel holds real water, not a film over mud
        cTOPO[k] = this.fbm(u / 1.5 + 40, v / 1.5 + 7, 34) - 0.5;
        const expo = Math.max(0, Math.min(1, (bD - 1.0) / 2.5)) * (1 - wm);
        cEXPO[k] = expo;
        cKIND[k] = bD;                                                   // body depth, for the water's own colour
        // where the wind roughens the surface it reflects more sky and carries more ripples:
        // broad soft lanes along the wind, and a slow drift of hue across a big expanse
        const rf = 0.5 + (this.fbm(u / 3.4 + 17, v / 2.2 + 5, 52) - 0.5) * 1.7 + (this.vn(u * 0.9, v * 0.55, 53) - 0.5) * 0.5;
        cREFL[k] = rf < 0 ? 0 : rf > 1 ? 1 : rf;
        cHUE[k] = this.fbm(u / 5.5 + 3, v / 5.5 + 29, 54) - 0.5;
        // a beach only in chosen spots on open water; rock by rock; mud in channels and
        // still corners; everywhere else the grass runs down to the water
        let mu_ = u, mv_ = v;
        const wx_ = u * 32, wy_ = v * 32, sB = this.sdfAtB(wx_, wy_);
        if (sB < -2 && pf0 < 0.5) {            // a pond is one place: its bed is read where it lies
          const gx = this.sdfAtB(wx_ + 4, wy_) - this.sdfAtB(wx_ - 4, wy_), gy = this.sdfAtB(wx_, wy_ + 4) - this.sdfAtB(wx_, wy_ - 4), gl = Math.hypot(gx, gy);
          if (gl > 1e-4) {
            // a cone of shore, wider the further out: the stretch's influence spreads and
            // its edges blur and wander instead of running out across the water as spokes
            const dist = -sB / 32, nx_ = gx / gl, ny_ = gy / gl, tx_ = -ny_, ty_ = nx_;
            const sp = 0.25 + dist * 0.55, jit = (this.fbm(u * 1.2 + 7, v * 1.2 + 3, 44) - 0.5) * 1.6 * (0.3 + dist);
            let a0 = 0, a1 = 0, a2 = 0;
            for (let t = -1; t <= 1; t++) {
              const o = t * sp + jit;
              this.shoreMat(u + nx_ * dist + tx_ * o, v + ny_ * dist + ty_ * o, F, MT);
              a0 += MT[0]; a1 += MT[1]; a2 += MT[2];
            }
            MT[0] = a0 / 3; MT[1] = a1 / 3; MT[2] = a2 / 3; mu_ = NaN;
          }
        }
        if (mu_ === mu_) this.shoreMat(mu_, mv_, F, MT);
        cSAND[k] = MT[0]; cROCK[k] = MT[1]; cMUD[k] = MT[2];
        cSANDW[k] = (3 + 8 * this.fbm(u * 0.9, v * 0.9, 51)) * (1 - 0.65 * pf0);
        // the coast's own line: long arcs everywhere, sharper bites where it is rock
        const rkS = Math.min(1, cROCK[k]);
        cPERT[k] = (this.fbm(u / 2.2 + 21, v / 2.2 + 5, 35) - 0.5) * 12 + (this.vn(u * 1.3, v * 1.3, 36) - 0.5) * 4 + rkS * (Math.abs(this.vn(u * 3.4, v * 3.4, 41) - 0.5) * 2 - 0.5) * 6
          + pf0 * (this.fbm(u * 1.4 + 9, v * 1.4 + 2, 46) - 0.5) * 16;           // a pond's bank wanders more: no box
        cRK[k] = Math.max(0, Math.min(1, (0.95 - fM) / 0.7));
        let worn = 0;
        for (const b of nearB) {
          const cxB = b.x + b.s / 2, cyB = b.y + b.s + (b.tc ? 0.05 : 0.02), rx = b.s * 0.55, ry = b.tc ? 0.42 : 0.28;
          const e = ((u - cxB) / rx) ** 2 + ((v - cyB) / ry) ** 2 - (this.fbm(u * 2.4, v * 2.4, 71) - 0.5) * 0.9;
          if (e < 1) worn = Math.max(worn, 1 - e);
        }
        cWN[k] = worn;
      }
      // the fine lattice (every 4 texels = 2 world px): the drawn coast and the coarse fields spread bilinearly
      const step = CQ / Q, FN = new Array(NF), S = new Float32Array(NN), SB = new Float32Array(NN);
      for (let f = 0; f < NF; f++) FN[f] = new Float32Array(NN);
      for (let j = 0; j < n; j++) {
        const cj = Math.min(cn - 2, (j / step) | 0), fy = j / step - cj;
        for (let i = 0; i < n; i++) {
          const ci = Math.min(cn - 2, (i / step) | 0), fx = i / step - ci, a = cj * cn + ci, k = j * n + i;
          const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
          for (let f = 0; f < NF; f++) { const A = C[f]; FN[f][k] = A[a] * w0 + A[a + 1] * w1 + A[a + cn] * w2 + A[a + cn + 1] * w3; }
          // the coast wanders a few pixels either way of the traced line (never in a dug channel)
          S[k] = this.sdfAt((ox + i * Q) / 2, (oy + j * Q) / 2) + FN[7][k] * (1 - FN[3][k]);
          SB[k] = this.sdfAtB((ox + i * Q) / 2, (oy + j * Q) / 2);
        }
      }
      const [fL0, fDRY, fLUSH, fWM, fSHELF, fDMAX, fTOPO, , fSAND, fROCK, fMUD, fSANDW, fRK, fWN, fEXPO, fKIND, fREFL, fHUE] = FN;
      const items = this.decorItems(cx, cy, ox, oy, nearB);
      // relief buffer for the tufts, stamped before the pixel pass
      const TB = new Float32Array(N * N);
      for (const it of items) if (it[1] === 0) {
        const st = this.tufts[it[3] % this.tufts.length], x0 = it[2] - ox - (st.w >> 1), y0 = it[0] - oy - st.h + 1;
        for (let y = 0; y < st.h; y++) { const yy = y0 + y; if (yy < 0 || yy >= N) continue; for (let x = 0; x < st.w; x++) { const xx = x0 + x, v = st.d[y * st.w + x]; if (v && xx >= 0 && xx < N) TB[yy * N + xx] += v; } }
      }
      const out = new Uint32Array(N * N);
      // water pixels keep their bed colour and depth for the second pass
      const BR = new Uint8Array(N * N), BG = new Uint8Array(N * N), BB = new Uint8Array(N * N), DB = new Float32Array(N * N), WI = new Uint8Array(N * N), WMq = new Uint8Array(N * N), RF = new Uint8Array(N * N), HU = new Uint8Array(N * N);
      const GM = this.GM, HM = this.HM, CL = this.CL, NZ3 = this.NZ3, NZ8 = this.NZ8, NZS = this.NZS;
      const AW = N / 2, anim = { mask: new Uint8Array(AW * AW), smask: new Uint8Array(AW * AW), glints: [], swash: [] }, SW = new Uint8Array(N * N);
      const nc = n - 1;
      let k00 = 0, k10 = 0, k01 = 0, k11 = 0, w0 = 0, w1 = 0, w2 = 0, w3 = 0;
      for (let j0 = 0; j0 < nc; j0++) for (let i0 = 0; i0 < nc; i0++) {
        k00 = j0 * n + i0; k10 = k00 + 1; k01 = k00 + n; k11 = k01 + 1;
        const sMin = Math.min(S[k00], S[k10], S[k01], S[k11]);
        const bandMax = Math.max(fSANDW[k00], fSANDW[k10], fSANDW[k01], fSANDW[k11]) + 4;
        const pureLand = sMin > bandMax;
        for (let yy = 0; yy < Q; yy++) {
          const py = j0 * Q + yy, ty = oy + py, fy = yy / Q;
          for (let xx = 0; xx < Q; xx++) {
            const px = i0 * Q + xx, tx = ox + px, q = py * N + px, fx = xx / Q;
            w0 = (1 - fx) * (1 - fy); w1 = fx * (1 - fy); w2 = (1 - fx) * fy; w3 = fx * fy;
            const s = (S[k00] * w0 + S[k10] * w1 + S[k01] * w2 + S[k11] * w3), t256 = ((ty & 255) << 8) | (tx & 255), t512 = ((ty & 511) << 9) | (tx & 511);
            const bd = BAYER[((ty & 3) << 2) | (tx & 3)];
            if (s < 0) {                                                  // ---------- under the water
              const n8 = NZ8[t256], n3 = NZ3[t256], d0 = -s, dB = -(SB[k00] * w0 + SB[k10] * w1 + SB[k01] * w2 + SB[k11] * w3);
              const dd = d0 < 10 ? d0 : d0 + (Math.max(dB, 2) - d0) * Math.min(1, (d0 - 10) / 24);
              const sa = (fSAND[k00] * w0 + fSAND[k10] * w1 + fSAND[k01] * w2 + fSAND[k11] * w3), ro = (fROCK[k00] * w0 + fROCK[k10] * w1 + fROCK[k01] * w2 + fROCK[k11] * w3), mu = (fMUD[k00] * w0 + fMUD[k10] * w1 + fMUD[k01] * w2 + fMUD[k11] * w3), wm = (fWM[k00] * w0 + fWM[k10] * w1 + fWM[k01] * w2 + fWM[k11] * w3);
              // which stretch of shore this water belongs to: weights, blended (no edges on the bed)
              const mx = Math.max(sa, ro, mu, 0.5) - 0.42;
              let wS = sa > mx ? sa - mx : 0, wR = ro > mx ? ro - mx : 0, wM = mu > mx ? mu - mx : 0, wGr = 0.5 > mx ? 0.5 - mx : 0;
              const wt = wS + wR + wM + wGr; wS /= wt; wR /= wt; wM /= wt; wGr /= wt;
              // a beach shelves gently; a grass bank drops away
              const near = dd < 12 ? 1 : dd > 48 ? 0 : 1 - (dd - 12) / 36, shelf = (fSHELF[k00] * w0 + fSHELF[k10] * w1 + fSHELF[k01] * w2 + fSHELF[k11] * w3) * (1 + ((wS * 1.8 + wR * 0.8 + wM * 1.0 + wGr * 0.42) - 1) * (0.35 + 0.65 * near)), dmax = (fDMAX[k00] * w0 + fDMAX[k10] * w1 + fDMAX[k01] * w2 + fDMAX[k11] * w3), topo = (fTOPO[k00] * w0 + fTOPO[k10] * w1 + fTOPO[k01] * w2 + fTOPO[k11] * w3);
              const xe = dd / shelf * 64; let D = dmax * (xe >= 1023 ? 1 : OMEXP[xe | 0]);
              D += topo * 0.55 * Math.min(1, D) + (n8 - 0.5) * 0.06;
              if (D < 0.01) D = 0.01;
              const deep = Math.min(1, D / 1.3), nS = NZS[(((ty >> 1) & 255) << 8) | ((tx >> 1) & 255)];
              let br = 0, bg = 0, bb = 0;
              if (wS > 0) {                                               // sand, with ripples where it is shallow
                const rp = D < 1 ? Math.sin(dd * 0.55 + n8 * 11 + nS * 6) * 0.06 * (1 - D) * (nS > 0.38 ? 1 : 0.3) : 0;
                br += 214 * (1 + rp) * wS; bg += 196 * (1 + rp) * wS; bb += 150 * (1 + rp) * wS;
              }
              if (wR > 0) {                                               // cobbles: lit tops, dark joints
                const c = CL[t512], lit = c > -0.05 ? 0.78 + c * 0.9 : 0.5;
                br += 128 * lit * wR; bg += 124 * lit * wR; bb += 108 * lit * wR;
              }
              // soft beds have texture: pale silt flats, darker mud, weed in hard-edged clumps
              // two sheared reads of the same noise: thresholded value noise draws its own grid
              const sa_ = NZ8[((((ty + (tx >> 1)) >> 1) & 255) << 8) | (((tx - (ty >> 1)) >> 1) & 255)], sb_ = NZ8[((((ty - (tx >> 1)) >> 1) + 97 & 255) << 8) | (((tx + (ty >> 1)) >> 1) + 41 & 255)];
              const bt = sa_ * 0.4 + sb_ * 0.4 + n3 * 0.2, bk = bt > 0.62 ? 1.14 : bt > 0.5 ? 1.0 : bt > 0.38 ? 0.88 : 0.77;
              if (wM > 0) { br += 92 * bk * wM; bg += 80 * bk * wM; bb += 56 * bk * wM; }
              if (wGr > 0) { br += 74 * bk * wGr; bg += 100 * bk * wGr; bb += 60 * bk * wGr; }
              if (wS > 0 && n3 > 0.78 && nS > 0.3) { br -= 30 * wS; bg -= 26 * wS; bb -= 18 * wS; }   // shell grit on the sand
              // weed in still water off soft banks
              const weed = (wM + wGr) * (1 - (fEXPO[k00] * w0 + fEXPO[k10] * w1 + fEXPO[k01] * w2 + fEXPO[k11] * w3) * 0.5) * (sa_ > 0.6 && sb_ > 0.45 ? 1 : 0) * (D > 0.12 && D < 1.8 ? 1 : 0);
              if (weed > 0) { const w_ = Math.min(0.85, weed), lt = n3 > 0.55 ? 1.25 : 1; br += (46 * lt - br) * w_; bg += (76 * lt - bg) * w_; bb += (40 * lt - bb) * w_; }
              br += (70 - br) * deep; bg += (92 - bg) * deep; bb += (92 - bb) * deep;
              const bankS = (wS < 0.3 ? 1 : wS > 0.7 ? 0 : (0.7 - wS) / 0.4) * (d0 < 1.6 ? 0.2 * (1 - d0 / 1.6) : 0), mot = (1 + (n3 - 0.5) * 0.14) * (1 - bankS);
              BR[q] = Math.max(0, Math.min(255, br * mot)); BG[q] = Math.max(0, Math.min(255, bg * mot)); BB[q] = Math.max(0, Math.min(255, bb * mot));
              DB[q] = D; WMq[q] = wm * 255; { const kd = (fKIND[k00] * w0 + fKIND[k10] * w1 + fKIND[k01] * w2 + fKIND[k11] * w3) * 50; WI[q] = kd > 255 ? 255 : kd; } RF[q] = (fREFL[k00] * w0 + fREFL[k10] * w1 + fREFL[k01] * w2 + fREFL[k11] * w3) * 255; HU[q] = ((fHUE[k00] * w0 + fHUE[k10] * w1 + fHUE[k01] * w2 + fHUE[k11] * w3) + 0.5) * 255; SW[q] = wS > 0.55 && dd < 0.5 + n3 * 1.5 ? 255 : 0;
              // caustics only over a light bed in the shallows
              if (((px | py) & 1) === 0 && D < 0.8) anim.mask[(py >> 1) * AW + (px >> 1)] = Math.round(Math.min(1, (0.8 - D) / 0.5) * (wS + wR * 0.45 + wM * 0.12 + wGr * 0.15) * (wm > 0.5 ? 0.3 : 1) * 255);
              continue;
            }
            // ---------- on land
            let col = 0;
            if (!pureLand) {
              const n3 = NZ3[t256], wm = (fWM[k00] * w0 + fWM[k10] * w1 + fWM[k01] * w2 + fWM[k11] * w3);
              // which stretch of shore meets the water here (ragged where two meet)
              const jit = (NZ8[t256] - 0.5) * 0.36 + (n3 - 0.5) * 0.06;
              const sand = (fSAND[k00] * w0 + fSAND[k10] * w1 + fSAND[k01] * w2 + fSAND[k11] * w3) + jit, rock = (fROCK[k00] * w0 + fROCK[k10] * w1 + fROCK[k01] * w2 + fROCK[k11] * w3) - jit, mud = (fMUD[k00] * w0 + fMUD[k10] * w1 + fMUD[k01] * w2 + fMUD[k11] * w3) + jit * 0.5, grass = 0.5;
              let m = 3, best = grass;
              if (sand > best) { best = sand; m = 0; } if (rock > best) { best = rock; m = 1; } if (mud > best) { best = mud; m = 2; }
              if (wm > 0.5) m = 4;                                      // a dug channel: a cut earth bank
              const n8 = NZ8[t256];
              const bw = m === 0 ? (fSANDW[k00] * w0 + fSANDW[k10] * w1 + fSANDW[k01] * w2 + fSANDW[k11] * w3) : m === 1 ? 2.2 + n3 * 3.2 : m === 2 ? 1.2 + n3 * 1.8 : m === 4 ? 2.4 : 0.6 + n8 * 1.6;
              if (s < bw + (n3 - 0.6) * 2) {
                if (m === 0) {
                  if (s < 0.9 + n8 * 1.1) { const kk = 1 + ((n8 + bd * 0.5) * 2 | 0); col = PC.wet[kk < 0 ? 0 : kk > 2 ? 2 : kk]; }
                  else { let kk = 2 + Math.floor((n8 * 0.8 + n3 * 0.2 - 0.5) * 3 + bd * 0.6); if (s > bw - 1.6 + (n3 - 0.5)) kk -= 2; col = PC.sand[kk < 0 ? 0 : kk > 5 ? 5 : kk]; }
                } else if (m === 1) {
                  const c = CL[t512];                                   // cobbles: lit tops, dark joints
                  let kk = c > -0.05 ? 3 + Math.round(c * 4) : 1; if (s < 1.2) kk -= 1;
                  col = PC.cob[kk < 0 ? 0 : kk > 5 ? 5 : kk];
                } else if (m === 2 || m === 4) {
                  let kk = 1 + Math.floor((n8 - 0.3) * 3 + bd * 0.7); if (s < 1.0) kk = m === 4 ? 1 : 0; if (m === 4 && s > 1.6) kk += 1;
                  col = PC.mud[kk < 0 ? 0 : kk > 4 ? 4 : kk];
                } else {
                  // grass to the water's edge: the lip of the bank in shade, a little damp soil
                  if (s < 0.5 && n8 > 0.62 && n3 > 0.45) col = PC.lush[2];
                  else { const L = (fL0[k00] * w0 + fL0[k10] * w1 + fL0[k01] * w2 + fL0[k11] * w3) + GM[t512] - 0.16; const kk = Math.floor(L * 8.6); col = PC.lush[kk < 0 ? 0 : kk > 8 ? 8 : kk]; }
                }
                out[q] = col; continue;
              }
            }
            // grass: macro x meso x micro, in the ramp the place calls for
            const t3 = NZ3[t256];
            let L = (fL0[k00] * w0 + fL0[k10] * w1 + fL0[k01] * w2 + fL0[k11] * w3) + GM[t512] + TB[q] - (fWN[k00] * w0 + fWN[k10] * w1 + fWN[k01] * w2 + fWN[k11] * w3) * 0.14 - (s < 14 ? (14 - s) * 0.004 : 0);
            const rk = fRK[k00] + fRK[k10] + fRK[k01] + fRK[k11] > 0 ? (fRK[k00] * w0 + fRK[k10] * w1 + fRK[k01] * w2 + fRK[k11] * w3) : 0;
            // at a mountain's foot: patches of scree in the grass, thinning outward, never a band;
            // between them the grass sits a shade darker in the rock's lee
            if (rk > 0) {
              const sv = rk * 0.72 + (NZ8[t256] * 0.5 + t3 * 0.5 - 0.5) * 1.6 + (CL[t512] > 0.05 ? 0.12 : -0.05);
              if (sv > 0.9) { const kk = Math.floor((L + 0.04) * 6); out[q] = PC.scree[kk < 0 ? 0 : kk > 5 ? 5 : kk]; continue; }
              L -= rk * 0.07;
            }
            // a dry or lush patch is a DENSITY of such blades, thinning to its edge, never a flat blob
            const dry = (fDRY[k00] * w0 + fDRY[k10] * w1 + fDRY[k01] * w2 + fDRY[k11] * w3) * 1.05 + (t3 - 0.5) * 0.95 + HM[t512] * 0.3, lush = (fLUSH[k00] * w0 + fLUSH[k10] * w1 + fLUSH[k01] * w2 + fLUSH[k11] * w3) + (t3 - 0.5) * 0.8 + HM[t512] * 0.3;
            const R_ = dry > 0.78 ? PC.dry : lush > 0.62 ? PC.lush : PC.cool;
            const kk = Math.floor(L * 8.6);
            out[q] = R_[kk < 0 ? 0 : kk > 8 ? 8 : kk];
          }
        }
      }
      // stones on the bed, before the water goes over them
      for (const it of items) if (it[1] === 3) {
        const st = this.bedStones[it[3] % this.bedStones.length], x0 = it[2] - ox - (st.w >> 1), y0 = it[0] - oy - st.h + 1;
        for (let y = 0; y < st.h; y++) { const yy = y0 + y; if (yy < 0 || yy >= N) continue;
          for (let x = 0; x < st.w; x++) { const xx = x0 + x, c = st.px[y * st.w + x]; if (!c || xx < 0 || xx >= N) continue; const q = yy * N + xx; if (!DB[q]) continue;
            const dp = Math.min(1, DB[q] / 1.1); if (dp > 0.85) continue; BR[q] = (c & 255) + (80 - (c & 255)) * dp; BG[q] = ((c >>> 8) & 255) + (90 - ((c >>> 8) & 255)) * dp; BB[q] = ((c >>> 16) & 255) + (72 - ((c >>> 16) & 255)) * dp; DB[q] = Math.max(0.01, DB[q] * 0.8); } }
      }
      // V4 — THE WATER: the bed's light, attenuated per channel by the depth, plus light
      // scattered back out of the water itself (aqua in the shallows, clear blue in the deep),
      // plus a little sky reflected where the wind roughens the surface. No contour of D is
      // drawn anywhere: everything here is continuous in D before a fine dithered quantisation.
      const SMk = anim.smask, PS = WPAL.sea, PL = WPAL.lake, PP = WPAL.pond, PC_ = WPAL.chan;
      for (let q = 0; q < N * N; q++) {
        const D = DB[q]; if (!D) continue;
        const py = (q / N) | 0, px = q - py * N, ty = oy + py, tx = ox + px;
        // the palette: pond -> lake -> sea by the body's own depth, then a dug channel's murk
        const kd = WI[q] / 50, a1 = kd < 1.0 ? 0 : kd > 2.0 ? 1 : kd - 1.0, a2 = kd < 2.2 ? 0 : kd > 3.0 ? 1 : (kd - 2.2) / 0.8;
        const wk = WMq[q] / 255, ch = wk < 0.25 ? 0 : wk > 0.85 ? 1 : (wk - 0.25) / 0.6, po = ((kd >= 4.95 ? 99 : (kd * 20) | 0) * 11 + ((ch * 10 + 0.5) | 0)) * 9;
        const tD = D < 0.15 ? 0 : D > 2.6 ? 1 : (D - 0.15) / 2.45, sm = tD * tD * (3 - 2 * tD), hv = (HU[q] / 255 - 0.5) * 2 * sm;
        const scr = PALT[po] + (PALT[po + 3] - PALT[po]) * sm - 7 * hv, scg = PALT[po + 1] + (PALT[po + 4] - PALT[po + 1]) * sm + 5 * hv, scb = PALT[po + 2] + (PALT[po + 5] - PALT[po + 2]) * sm - 3 * hv;
        const xr = (D * PALT[po + 6] * 64) | 0, xg = (D * PALT[po + 7] * 64) | 0, xb = (D * PALT[po + 8] * 64) | 0;
        const Tr = 1 - OMEXP[xr > 1023 ? 1023 : xr], Tg = 1 - OMEXP[xg > 1023 ? 1023 : xg], Tb = 1 - OMEXP[xb > 1023 ? 1023 : xb];
        let r = BR[q] * Tr + scr * (1 - Tr), g = BG[q] * Tg + scg * (1 - Tg), b = BB[q] * Tb + scb * (1 - Tb);
        const rf = RF[q] / 255, F = (0.03 + 0.10 * rf) * (0.3 + 0.7 * (D > 1.3 ? 1 : D / 1.3)) * (1 - ch * 0.6) * (0.5 + 0.5 * a1);
        r += (SKY[0] - r) * F; g += (SKY[1] - g) * F; b += (SKY[2] - b) * F;
        const facet = (NZS[(((ty >> 1) & 255) << 8) | ((tx >> 1) & 255)] - 0.5) * 4 * (D > 0.8 ? 1 : D / 0.8);
        r += facet; g += facet; b += facet * 1.1;
        if (((px | py) & 1) === 0) {                                // where the moving ripples may show
          const open = D < 0.12 ? 0 : D > 0.62 ? 1 : (D - 0.12) / 0.5, calm = 0.5 + 0.5 * a1 + (1 - a1) * 0;
          SMk[(py >> 1) * AW + (px >> 1)] = Math.round(open * (0.42 + 0.58 * a1) * (0.7 + 0.3 * a2) * (1 - ch * 0.7) * (0.35 + 0.65 * rf) * 255);
        }
        if (this.dbg === 1) { r = BR[q]; g = BG[q]; b = BB[q]; } else if (this.dbg === 2) { r = g = b = Math.min(255, D * 120); }
        const dth = BAYER[((ty & 3) << 2) | (tx & 3)] * 4;
        r = Math.round((r + dth) / 4) * 4; g = Math.round((g + dth) / 4) * 4; b = Math.round((b + dth) / 4) * 4;
        out[q] = pk(r < 0 ? 0 : r > 255 ? 255 : r, g < 0 ? 0 : g > 255 ? 255 : g, b < 0 ? 0 : b > 255 ? 255 : b);
      }
      // foam: only a broken wash at the very edge of a beach on open water, never white
      for (let q = 0; q < N * N; q++) {
        if (!SW[q] || WI[q] < 130) continue;
        const py = (q / N) | 0, px = q - py * N, ty = oy + py, tx = ox + px, k = ((py / Q) | 0) * n + ((px / Q) | 0);
        if (fEXPO[k] < 0.5) continue;
        const brk = NZ8[((((ty >> 2) & 255) << 8) | ((tx >> 1) & 255))];
        if (brk < 0.62) continue;
        const c = out[q], a = 0.42;
        out[q] = pk((c & 255) + (214 - (c & 255)) * a, ((c >>> 8) & 255) + (228 - ((c >>> 8) & 255)) * a, ((c >>> 16) & 255) + (218 - ((c >>> 16) & 255)) * a);
      }
      // stones breaking the surface along a rocky waterline: wet below, dry above
      for (const it of items) if (it[1] === 4) {
        const st = this.bedStones[it[3] % this.bedStones.length], x0 = it[2] - ox - (st.w >> 1), y0 = it[0] - oy - st.h + 1;
        for (let y = 0; y < st.h; y++) { const yy = y0 + y; if (yy < 0 || yy >= N) continue;
          const wet = y > st.h * 0.55 ? 0.72 : 1;
          for (let x = 0; x < st.w; x++) { const xx = x0 + x, c = st.px[y * st.w + x]; if (!c || xx < 0 || xx >= N) continue;
            out[yy * N + xx] = pk((c & 255) * wet, ((c >>> 8) & 255) * wet, ((c >>> 16) & 255) * (wet + 0.03)); } }
        // the water laps a dark line round its foot
        for (let x = 1; x < st.w - 1; x++) { const xx = x0 + x, yy = y0 + st.h; if (yy < 0 || yy >= N || xx < 0 || xx >= N || !st.px[(st.h - 1) * st.w + x]) continue;
          const q = yy * N + xx; if (!DB[q]) continue; const c = out[q]; out[q] = pk((c & 255) * 0.8, ((c >>> 8) & 255) * 0.82, ((c >>> 16) & 255) * 0.86); }
      }
      // lily pads float on the water; reeds stand in it at the edge, their feet in shade
      for (const it of items) if (it[1] === 6 || it[1] === 5) {
        const st = it[1] === 6 ? this.lilies[it[3] % this.lilies.length] : this.reeds[it[3] % this.reeds.length], x0 = it[2] - ox - (st.w >> 1), y0 = it[0] - oy - st.h + 1;
        for (let y = 0; y < st.h; y++) { const yy = y0 + y; if (yy < 0 || yy >= N) continue;
          for (let x = 0; x < st.w; x++) { const xx = x0 + x, c = st.px[y * st.w + x]; if (!c || xx < 0 || xx >= N) continue; const q = yy * N + xx;
            if (it[1] === 6 && !DB[q]) continue; out[q] = c; } }
        if (it[1] === 6) for (let x = 1; x < st.w - 1; x++) { const xx = x0 + x + 1, yy = y0 + st.h; if (yy < 0 || yy >= N || xx < 0 || xx >= N) continue; const q = yy * N + xx; if (!DB[q] || !st.px[(st.h - 2) * st.w + x]) continue; const c = out[q]; out[q] = pk((c & 255) * 0.82, ((c >>> 8) & 255) * 0.84, ((c >>> 16) & 255) * 0.88); }
      }
      // land things: flowers and pebbles, stamped whole
      for (const it of items) if (it[1] === 1 || it[1] === 2) {
        const st = it[1] === 1 ? this.flowers[it[3] % this.flowers.length] : this.pebbles[it[3] % this.pebbles.length];
        const x0 = it[2] - ox - (st.w >> 1), y0 = it[0] - oy - st.h + 1;
        for (let y = 0; y < st.h; y++) { const yy = y0 + y; if (yy < 0 || yy >= N) continue; for (let x = 0; x < st.w; x++) { const xx = x0 + x, c = st.px[y * st.w + x]; if (c && xx >= 0 && xx < N && !DB[yy * N + xx]) out[yy * N + xx] = c; } }
      }
      // shade from trees and stones: the game's own stamps, offset down-right
      if (this.shade) {
        const sw = this.shW, DX = 3, DY = 4;
        for (let py = 0; py < N; py++) {
          const wy = ((oy + py) >> 1) - DY; if (wy < 0 || wy >= this.shH) continue;
          const row = wy * sw;
          for (let px = 0; px < N; px++) {
            const wx = ((ox + px) >> 1) - DX; if (wx < 0 || wx >= sw || !this.shade[row + wx]) continue;
            const q = py * N + px, c = out[q], k = DB[q] ? 0.78 : 0.66;
            out[q] = pk((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * (k + 0.04));
          }
        }
      }
      // what the animation layer needs: caustic strength (1x), glints, swash
      const GG = 10;                                                   // glints on a jittered grid, 5 world px
      for (let gy = 0; gy < N / GG; gy++) for (let gx = 0; gx < N / GG; gx++) {
        const X = gx + cx * (N / GG), Y = gy + cy * (N / GG);
        const px = gx * GG + Math.floor(this.hash(X, Y, 401) * GG), py = gy * GG + Math.floor(this.hash(X, Y, 402) * GG), q = py * N + px;
        const D = DB[q]; if (!D || D < 0.18) continue;
        const k = ((py / Q) | 0) * n + ((px / Q) | 0), ex = fEXPO[k];
        const patch = this.fbm(((ox + px) / TS) / 2.2 + 31, ((oy + py) / TS) / 2.2 + 17, 408);
        if (this.hash(X, Y, 403) > Math.max(0, patch - 0.48) * (0.9 + ex * 0.8)) continue;
        anim.glints.push((ox + px) / 2, (oy + py) / 2, this.hash(X, Y, 404) * 6.283, 0.7 + this.hash(X, Y, 405) * 1.1, this.hash(X, Y, 406));
      }
      const SG = 6;                                                    // swash marks along exposed waterlines
      for (let gy = 0; gy < N / SG; gy++) for (let gx = 0; gx < N / SG; gx++) {
        const px = gx * SG + 3, py = gy * SG + 3, k = ((py / Q) | 0) * n + ((px / Q) | 0), s = S[k];
        if (s > 0.5 || s < -2.5 || fEXPO[k] < 0.4 || fWM[k] > 0.3 || fSAND[k] < 0.45) continue;
        const X = gx + cx * (N / SG), Y = gy + cy * (N / SG);
        if (NZ8[((((oy + py) >> 3) & 255) << 8) | (((ox + px) >> 3) & 255)] < 0.45) continue;
        const wx = (ox + px) / 2, wy = (oy + py) / 2, e = 1.5;
        let nx = this.sdfAt(wx + e, wy) - this.sdfAt(wx - e, wy), ny = this.sdfAt(wx, wy + e) - this.sdfAt(wx, wy - e); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
        anim.swash.push(wx, wy, -nx, -ny, this.hash(X, Y, 407) * 6.283);
      }
      return { buf: out, anim: { mask: anim.mask, smask: anim.smask, glints: new Float32Array(anim.glints), swash: new Float32Array(anim.swash) } };
    },

    // tufts, flowers, pebbles and bed stones on a WORLD grid, so one crossing a chunk edge is whole in both
    decorItems(cx, cy, ox, oy, nearB) {
      const W = this.W, H = this.H, T = this.T, F = this.F, terr = this.terr, M = 24, items = [];
      const okGround = (tx, ty, minS) => {
        const u = tx / TS, v = ty / TS; if (u < 1 || v < 1 || u >= W - 1 || v >= H - 1) return false;
        const t = terr[(v | 0) * W + (u | 0)];
        if (t === T.WATER || t === T.MOAT || t === T.TRENCH || t === T.BARREN || t === T.RUIN || t === T.CAMP || t === T.MOUND || t === T.MOUNTAIN || t === T.STUMPS) return false;
        if (this.sdfAt(tx / 2, ty / 2) < (minS || 13)) return false;
        for (const b of nearB) if (u > b.x - 0.15 && u < b.x + b.s + 0.15 && v > b.y - 0.15 && v < b.y + b.s + 0.55) return false;
        return true;
      };
      const GC = 12;
      for (let gy = Math.floor((oy - M) / GC); gy <= Math.floor((oy + N + M) / GC); gy++)
        for (let gx = Math.floor((ox - M) / GC); gx <= Math.floor((ox + N + M) / GC); gx++) {
          const tx = gx * GC + Math.floor(this.hash(gx, gy, 81) * GC), ty = gy * GC + Math.floor(this.hash(gx, gy, 82) * GC), u = tx / TS, v = ty / TS;
          const patch = this.fbm(u / 2.4 + 40, v / 2.4 + 9, 83), fF = this.tf(F.dForest, u, v), fR = this.tf(F.dRock, u, v), fW = this.tf(F.dWet, u, v);
          const dens = 0.04 + Math.max(0, patch - 0.5) * 1.2 + Math.max(0, 1 - fF / 1.2) * 0.3 + Math.max(0, 1 - fW / 2) * 0.25 - Math.max(0, 1 - fR / 1.5) * 0.3;
          if (this.hash(gx, gy, 84) > dens || !okGround(tx, ty)) continue;
          items.push([ty, 0, tx, Math.floor(this.hash(gx, gy, 85) * 18)]);
        }
      const FC = 44;
      for (let gy = Math.floor((oy - M) / FC); gy <= Math.floor((oy + N + M) / FC); gy++)
        for (let gx = Math.floor((ox - M) / FC); gx <= Math.floor((ox + N + M) / FC); gx++) {
          const cxp = gx * FC + this.hash(gx, gy, 91) * FC, cyp = gy * FC + this.hash(gx, gy, 92) * FC, u = cxp / TS, v = cyp / TS;
          const sun = this.fbm(u / 3 + 70, v / 3 + 3, 93);
          if (this.hash(gx, gy, 94) > Math.max(0, sun - 0.55) * 0.9) continue;
          const kind = Math.floor(this.hash(gx, gy, 95) * 6), nF = 3 + Math.floor(this.hash(gx, gy, 96) * 6);
          for (let f = 0; f < nF; f++) {
            const a = this.hash(gx * 13 + f, gy, 97) * 6.283, r = 2 + this.hash(gx, gy * 7 + f, 98) * 9;
            const tx = Math.round(cxp + Math.cos(a) * r), ty = Math.round(cyp + Math.sin(a) * r * 0.7);
            if (okGround(tx, ty)) items.push([ty, 1, tx, f % 5 === 4 ? (kind + 1) % 6 : kind, f]);
          }
        }
      const PCg = 16;
      for (let gy = Math.floor((oy - M) / PCg); gy <= Math.floor((oy + N + M) / PCg); gy++)
        for (let gx = Math.floor((ox - M) / PCg); gx <= Math.floor((ox + N + M) / PCg); gx++) {
          const tx = gx * PCg + Math.floor(this.hash(gx, gy, 101) * PCg), ty = gy * PCg + Math.floor(this.hash(gx, gy, 102) * PCg), u = tx / TS, v = ty / TS;
          const dens = 0.008 + Math.max(0, 1 - this.tf(F.dRock, u, v) / 1.5) * 0.45;
          if (this.hash(gx, gy, 103) > dens || !okGround(tx, ty, 6)) continue;
          items.push([ty, 2, tx, Math.floor(this.hash(gx, gy, 104) * 10)]);
        }
      // stones on the bed: clustered off rocky stretches, a few elsewhere, none in a dug channel;
      // along a rocky waterline some break the surface
      const SC = 14;
      for (let gy = Math.floor((oy - M) / SC); gy <= Math.floor((oy + N + M) / SC); gy++)
        for (let gx = Math.floor((ox - M) / SC); gx <= Math.floor((ox + N + M) / SC); gx++) {
          const tx = gx * SC + Math.floor(this.hash(gx, gy, 111) * SC), ty = gy * SC + Math.floor(this.hash(gx, gy, 112) * SC), u = tx / TS, v = ty / TS;
          if (u < 1 || v < 1 || u >= W - 1 || v >= H - 1) continue;
          const s = this.sdfAt(tx / 2, ty / 2); if (s > 2.5 || s < -26) continue;
          if (this.tf(F.dMoat, u, v) < 1.5) continue;
          const dR = this.tf(F.dRock, u, v), MT_ = this.shoreMat(u, v, F, [0, 0, 0]), rocky = MT_[1] > 0.3 ? MT_[1] * 1.6 : MT_[1];
          const clump = this.fbm(u / 1.1 + 13, v / 1.1 + 2, 115);
          const dens = rocky > 0.5 ? 0.25 + Math.max(0, clump - 0.45) * 2.2 : 0.015 + Math.max(0, clump - 0.7) * 0.5;
          if (this.hash(gx, gy, 113) > dens) continue;
          if (s > -4) { if (rocky > 0.5) items.push([ty, 4, tx, Math.floor(this.hash(gx, gy, 114) * 16)]); continue; }
          items.push([ty, 3, tx, Math.floor(this.hash(gx, gy, 114) * 16)]);
        }
      // reeds at the water's edge of still water, clumped; lily pads on sheltered ponds
      const RCg = 9, MTr = [0, 0, 0];
      for (let gy = Math.floor((oy - M) / RCg); gy <= Math.floor((oy + N + M) / RCg); gy++)
        for (let gx = Math.floor((ox - M) / RCg); gx <= Math.floor((ox + N + M) / RCg); gx++) {
          const tx = gx * RCg + Math.floor(this.hash(gx, gy, 131) * RCg), ty = gy * RCg + Math.floor(this.hash(gx, gy, 132) * RCg), u = tx / TS, v = ty / TS;
          if (u < 1 || v < 1 || u >= W - 1 || v >= H - 1) continue;
          const s = this.sdfAt(tx / 2, ty / 2); if (s > 3 || s < -26) continue;
          const bD = this.tf(this.bodyB || F.bodyD, u, v); if (bD > 3.2 || this.tf(F.dMoat, u, v) < 1.5) continue;
          if (nearB.some(b => u > b.x - 0.2 && u < b.x + b.s + 0.2 && v > b.y - 0.2 && v < b.y + b.s + 0.5)) continue;
          const ph = this.pondHash(u, v), pond = ph >= 0 && bD < 1.9, ty_ = this.pondType(ph);
          this.shoreMat(u, v, F, MTr); if (MTr[0] > 0.5 || MTr[1] > 0.45) continue;
          const clump = this.fbm(u / 0.9 + 3, v / 0.9 + 71, 133);
          if (s > -7) {
            const dens = (pond ? (ty_ === 0 ? 1.3 : ty_ === 3 ? 0.2 : 0.38) : 0.18 * (1 - this.tf(F.dSea, u, v) / 9)) * Math.max(0, (clump - 0.42) * 2.4);
            if (this.hash(gx, gy, 134) < dens) items.push([ty, 5, tx, Math.floor(this.hash(gx, gy, 135) * 8)]);
          } else if (pond && ty_ !== 1 && s < -10) {
            const dens = (ty_ === 0 ? 0.75 : ty_ === 2 ? 0.25 : 0.1) * Math.max(0, (clump - 0.45) * 3);
            if (this.hash(gx, gy, 136) < dens) items.push([ty, 6, tx, Math.floor(this.hash(gx, gy, 137) * 8)]);
          }
        }
            items.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
      return items;
    },
  };
  return core;
}
// inside a worker: one core, fed by messages
function TCWorkerMain() {
  const core = TCCore();
  self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'world') { core.setWorld(m.world); core.warm(); return; }
    if (m.type === 'patch') { core.patch(m.patch); return; }
    if (m.type === 'chunk') {
      const t0 = performance.now(), r = core.chunk(m.cx, m.cy), ms = performance.now() - t0;
      let bitmap = null;
      if (typeof OffscreenCanvas !== 'undefined') {
        const oc = new OffscreenCanvas(core.N, core.N), g = oc.getContext('2d'), id = new ImageData(new Uint8ClampedArray(r.buf.buffer), core.N, core.N);
        g.putImageData(id, 0, 0); bitmap = oc.transferToImageBitmap();
      }
      const a = r.anim, tr = [a.glints.buffer, a.swash.buffer];
      // each alpha mask goes back as a bitmap cropped to what it covers (or null)
      const toBmp = (mk, minSum) => {
        const span = core.N / 2; let x0 = span, y0 = span, x1 = -1, y1 = -1, sum = 0;
        for (let y = 0; y < span; y++) for (let x = 0; x < span; x++) { const v = mk[y * span + x]; if (v) { sum += v; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (sum <= minSum) return null;
        const w = x1 - x0 + 1, h = y1 - y0 + 1, oc = new OffscreenCanvas(w, h), id = new ImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) id.data[(y * w + x) * 4 + 3] = mk[(y0 + y) * span + x0 + x];
        oc.getContext('2d').putImageData(id, 0, 0); const bm = oc.transferToImageBitmap(); tr.push(bm); return [bm, x0, y0, w, h];
      };
      if (typeof OffscreenCanvas !== 'undefined') { a.cm = toBmp(a.mask, 255 * 40); a.sm = toBmp(a.smask, 255 * 20); a.mask = null; a.smask = null; }
      else { tr.push(a.mask.buffer, a.smask.buffer); }
      let thumb = null;
      if (bitmap) { const tc = new OffscreenCanvas(128, 128), tg = tc.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'medium'; tg.drawImage(bitmap, 0, 0, 128, 128); thumb = tc.transferToImageBitmap(); tr.push(thumb); }
      if (bitmap) { tr.push(bitmap); self.postMessage({ type: 'chunk', key: m.key, gen: m.gen, bitmap, thumb, anim: a, ms }, tr); }
      else { tr.push(r.buf.buffer); self.postMessage({ type: 'chunk', key: m.key, gen: m.gen, buf: r.buf, anim: a, ms }, tr); }
    }
  };
}
