/* THE TERRAIN CORE (V4) — THE PURE PART. Source of js/terrain-core.js:
   edit THIS file and run `node tools/build-terrain-core.cjs`; the generated
   file inlines the bilinear reads (`ip(X)`) for the JIT, and
   tests/terrain-v4.mjs refuses a js/terrain-core.js that is not this file
   built. Loaded by js/terrain.js, which runs it in Web Workers.
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
      if ('R5' in w) this.setRegion(w.R5);
    },
    /* V5 — A REGION'S CHARACTER (the prototype on the test page; production sends no R5
       and paints V4 exactly). The ramps, the bare ground, the flowers and the shrubs of
       one landscape, read by the land pass with the world fields e5/m5/g5/k5/v5/s5. */
    setRegion(r) {
      if (!r) { this.P5 = null; return; }
      const ramp = a => P(a.map(hx)), shrubs = [];
      const P5 = Object.assign({}, r, { dry: ramp(r.dry), mid: ramp(r.mid), lush: ramp(r.lush), geoA: ramp(r.geoA), geoB: ramp(r.geoB || r.geoA) });
      P5.flowers = (r.flowers || []).map(([a, b]) => { const petal = pk(...hx(a)), eye = pk(...hx(b)), st = [P5.mid[3], P5.mid[2], P5.mid[4]];
        return this.sprite(5, 6, p => { p(2, 0, petal); p(1, 1, petal); p(3, 1, petal); p(2, 1, eye); p(2, 2, petal); p(2, 3, st[0]); p(2, 4, st[1]); p(3, 3, st[2]); }); });
      /* THE ARID PLANTS: short and squat, the dry country's own (a thyme or broom cushion, a
         creeping juniper mat, a feather-grass tussock) — never a cone or a bush standing up
         off the grass, which reads as a tree that cannot be cut. Each is outlined in its
         darkest green, lit from the upper left, and throws a short shadow down-right (sprite
         value 1 = "darken what is under me"). Six of each kind, `nK` kinds in all. */
      (r.shrubs || []).forEach(([kind, cols], si) => {
        const C_ = cols.map(c => pk(...hx(c)));
        for (let k = 0; k < 6; k++) {
          const rr = i => this.hash(k + si * 17, i, 1501);
          let w, h, inside, SX = 2, SY = 1;
          if (kind === 'tussock') {
            // a fountain of blades from one foot: dark at the root, pale at the tip, a few plumed
            w = 11 + Math.floor(rr(0) * 4); h = 10 + Math.floor(rr(1) * 4);
            const nb = 7 + Math.floor(rr(2) * 4);
            shrubs.push(this.sprite(w + 2, h + 1, p => {
              for (let x = Math.floor(w / 2) - 1; x <= Math.floor(w / 2) + 2; x++) p(x, h, 1);
              for (let bI = 0; bI < nb; bI++) {
                const spread = (bI / (nb - 1) - 0.5) * 2, len = Math.round(h * (0.6 + 0.4 * rr(20 + bI)) * (1 - Math.abs(spread) * 0.25));
                for (let j = 0; j < len; j++) { const t = j / len, x = Math.round(w / 2 + spread * (w * 0.42) * t * t), y = h - 1 - j;
                  p(x, y, t < 0.25 ? C_[1] : t < 0.6 ? C_[2] : C_[3]); }
                if (rr(40 + bI) < 0.45 && len >= h - 1) { const x = Math.round(w / 2 + spread * (w * 0.42)), y = h - len; p(x, y, C_[4]); p(x + (spread > 0 ? 1 : -1), y, C_[4]); }
              }
              p(Math.floor(w / 2), h - 1, C_[0]); p(Math.floor(w / 2) + 1, h - 1, C_[0]);
            }));
            continue;
          }
          /* a cushion or a mat is built of small round CLUMPS (like a tree's crown, never one
             shape): heaped toward the middle for a cushion, strung low along the ground for a
             creeping mat — so its outline is lumpy and organic */
          const mat = kind === 'mat';
          w = mat ? 16 + Math.floor(rr(0) * 5) : 11 + Math.floor(rr(0) * 4); h = mat ? 6 + Math.floor(rr(1) * 2) : 7 + Math.floor(rr(1) * 2);
          const nb = mat ? 6 + Math.floor(rr(2) * 3) : 6 + Math.floor(rr(2) * 3), cl_ = [];
          for (let bI = 0; bI < nb; bI++) {
            const r_ = mat ? 1.9 + rr(30 + bI) * 0.8 : 2.2 + rr(30 + bI) * 1.0, ex = (bI + 0.5) / nb * 2 - 1 + (rr(10 + bI) - 0.5) * 0.25;
            const cx_ = w / 2 + ex * (w / 2 - r_ - 0.3), lift = mat ? rr(20 + bI) * 0.9 : (h - 2 * r_) * Math.sqrt(Math.max(0, 1 - ex * ex)) * (0.55 + 0.45 * rr(20 + bI));
            cl_.push([cx_, h - r_ - 0.2 - lift, r_]);
          }
          inside = (x, y) => { if (y < 0 || y >= h || x < 0 || x >= w) return false; const px_ = x + 0.5, py_ = y + 0.5; for (const [bx, by, br_] of cl_) { const dx = px_ - bx, dy = py_ - by; if (dx * dx + dy * dy < br_ * br_) return true; } return false; };
          shrubs.push(this.sprite(w + SX + 1, h + SY + 1, p => {
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y) && !inside(x - SX, y - SY)) p(x + SX, y + SY, 1);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              if (!inside(x, y)) continue;
              const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
              const lit = !inside(x - 1, y - 1) && !edge, shd = !inside(x + 1, y + 1) || y === h - 1;
              const nz = this.hash(x * 7 + k, y * 13 + si, 1509);
              const lowEdge = !inside(x + 1, y) || !inside(x, y + 1) || !inside(x + 1, y + 1);
              let c = edge ? (lowEdge ? C_[0] : C_[2]) : lit ? C_[3] : shd ? C_[1] : nz < 0.3 ? C_[1] : nz > 0.8 ? C_[3] : C_[2];
              if (C_[4] && !lowEdge && nz > 0.7 && nz < 0.82) c = C_[4];
              p(x, y, c);
            }
          }));
        }
      });
      P5.nK = (r.shrubs || []).length;
      P5.shrubs = shrubs;
      P5.grav = ramp(r.grav || r.geoA); P5.soil = ramp(r.soil || r.geoA);
      P5.gravAmt = r.gravAmt == null ? 0.6 : r.gravAmt; P5.soilGap = r.soilGap == null ? 0.5 : r.soilGap;
      /* DRY GROUND IS DRAWN LIKE THE GRASS: pebbles in the region's own stone, most of them
         small, a few half-buried stones a hand across, each lit on its upper left with its
         shadow under it (value 1) */
      P5.peb = [];
      for (let k = 0; k < 14; k++) {
        const rr = i => this.hash(k, i, 1531), big = k >= 10, w = big ? 6 + Math.floor(rr(0) * 4) : 3 + Math.floor(rr(0) * 3), h = big ? 4 + Math.floor(rr(1) * 2) : 2 + Math.floor(rr(1) * 2), G_ = P5.grav;
        P5.peb.push(this.sprite(w + 2, h + 2, p => {
          const ins = (x, y) => { const ex = (x + 0.5 - w / 2) / (w / 2), ey = (y + 0.5 - h / 2) / (h / 2); return ex * ex + ey * ey <= 1.08 + (big ? (this.hash(x, y + k * 9, 1533) - 0.5) * 0.3 : 0); };
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ins(x, y) && !ins(x - 1, y - 1)) p(x + 1, y + 1, 1);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!ins(x, y)) continue;
            const s_ = (x + 0.5 - w / 2) / w + (y + 0.5 - h / 2) / h, edge = !ins(x + 1, y) || !ins(x, y + 1);
            p(x, y, big && edge ? G_[1] : s_ < -0.35 ? G_[5] : s_ < 0.05 ? G_[4] : s_ < 0.4 ? G_[3] : G_[2]);
          }
        }));
      }
      // pavement: slabs a third of a tile across, split by dark grikes (clints and grikes)
      if (!this.SLB) { const t = this.makeMicro(256, 26, 360); this.SLB = t.d; }
      /* GRIT AND GRAVEL, as a texture: thousands of small stones, each with a RANK, so a
         density field can show a few (dry grass) or many (bare earth) of the same stones;
         and CRACKS, a net of fine broken lines for baked clay and alkali crust */
      if (this._grvSeed !== this.seed) {
        const GP = 256, GRV = new Uint8Array(GP * GP), GRK = new Float32Array(GP * GP);
        const put = (x, y, v, rk) => { x &= 255; y &= 255; const q = y * GP + x; if (v === 1 && GRV[q]) return; GRV[q] = v; GRK[q] = rk; };
        /* stones a texel or two to a hand across (at 64 texels a tile): a lit cap on the upper
           left, a dark foot on the lower right, a shadow under — round enough to read as a
           pebble, never a square */
        const disc = (x, y, w, h, rk) => {
          const ins = (i, j) => { const ex = (i + 0.5 - w / 2) / (w / 2), ey = (j + 0.5 - h / 2) / (h / 2); return ex * ex + ey * ey <= 1.15; };
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (ins(i, j) && !ins(i - 1, j - 1)) put(x + i + 1, y + j + 1, 1, rk);
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (!ins(i, j)) continue; const s_ = (i + 0.5) / w + (j + 0.5) / h; put(x + i, y + j, s_ < 0.75 ? 4 : s_ < 1.3 ? 3 : 2, rk); }
        };
        for (let k = 0; k < 2300; k++) {
          const x = Math.floor(this.hash(k, 1, 1541) * GP), y = Math.floor(this.hash(k, 2, 1541) * GP), rk = this.hash(k, 3, 1541), sz = this.hash(k, 4, 1541);
          if (sz < 0.3) { put(x + 1, y + 1, 1, rk); put(x + 1, y, 3, rk); put(x, y, 4, rk); put(x, y + 1, 3, rk); put(x + 1, y + 2, 1, rk); put(x + 2, y + 1, 1, rk); }
          else if (sz < 0.7) disc(x, y, 3, 2 + (sz > 0.55 ? 1 : 0), rk);
          else if (sz < 0.92) disc(x, y, 4 + (sz > 0.85 ? 1 : 0), 3, rk);
          else disc(x, y, 6, 4, rk);
        }
        const CRK = new Uint8Array(GP * GP), nC = 20, cell = GP / nC, pts = [];
        for (let j = 0; j < nC; j++) for (let i = 0; i < nC; i++) pts.push([(i + 0.15 + 0.7 * this.hash(i, j, 1551)) * cell, (j + 0.15 + 0.7 * this.hash(i, j, 1552)) * cell]);
        for (let y = 0; y < GP; y++) for (let x = 0; x < GP; x++) {
          const gx = Math.floor(x / cell), gy = Math.floor(y / cell); let f1 = 1e9, f2 = 1e9, i1 = 0, i2 = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const ci = (gx + ox + nC) % nC, cj = (gy + oy + nC) % nC, q = pts[cj * nC + ci];
            let dx = x - (q[0] + (gx + ox - ci) * cell), dy = y - (q[1] + (gy + oy - cj) * cell); if (dx > GP / 2) dx -= GP; if (dx < -GP / 2) dx += GP; if (dy > GP / 2) dy -= GP; if (dy < -GP / 2) dy += GP;
            const d = Math.hypot(dx, dy), id = cj * nC + ci; if (d < f1) { f2 = f1; i2 = i1; f1 = d; i1 = id; } else if (d < f2) { f2 = d; i2 = id; } }
          // most edges crack, a few never do: an open net, not a tiled floor
          if (f2 - f1 < 1.1 && this.hash(Math.min(i1, i2), Math.max(i1, i2), 1553) < 0.72) CRK[y * GP + x] = 1;
        }
        // the clump field: where dry grass gives way to soil first (a slow field ragged by a finer one)
        const c1 = this.makeNoiseTex(512, 32, 1571).d, c2 = this.makeNoiseTex(512, 80, 1572).d, CLP = new Float32Array(512 * 512);
        for (let q = 0; q < CLP.length; q++) CLP[q] = c1[q] * 0.78 + c2[q] * 0.22;
        this.GRV = GRV; this.GRK = GRK; this.CRK = CRK; this.CLP = CLP; this._grvSeed = this.seed;
      }
      // the light: from the upper left, normalised; the flat ground's own share of it
      const lx = -0.5, ly = -0.62, lz = 0.6, ll = Math.hypot(lx, ly, lz);
      P5.L = [lx / ll, ly / ll, lz / ll];
      this.P5 = P5;
    },
    // a cubic B-spline read of a tile field: C2, so a gradient taken from it never shows the tile grid
    tfc(F, u, v) {
      const W = this.W, H = this.H, x = u - 0.5, y = v - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const bw = t => { const t2 = t * t, t3 = t2 * t; return [(1 - 3 * t + 3 * t2 - t3) / 6, (4 - 6 * t2 + 3 * t3) / 6, (1 + 3 * t + 3 * t2 - 3 * t3) / 6, t3 / 6]; };
      const wx = bw(fx), wy = bw(fy);
      let acc = 0;
      for (let j = 0; j < 4; j++) { const yy = Math.max(0, Math.min(H - 1, y0 - 1 + j)), row = yy * W; let a = 0;
        for (let i = 0; i < 4; i++) a += F[row + Math.max(0, Math.min(W - 1, x0 - 1 + i))] * wx[i];
        acc += a * wy[j]; }
      return acc;
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
      const P5 = this.P5;
      let gBk = -1, gBo = 0;                                           // V5: the gravel texture's offset, per 4-tile block
      const cn = N / CQ + 1, CN = cn * cn, NF = P5 ? 22 : 18, C = [];
      for (let f = 0; f < NF; f++) C.push(new Float32Array(CN));
      const [cL0, cDRY, cLUSH, cWM, cSHELF, cDMAX, cTOPO, cPERT, cSAND, cROCK, cMUD, cSANDW, cRK, cWN, cEXPO, cKIND, cREFL, cHUE, cSH5, cM5, cG5, cK5] = C, MT = [0, 0, 0];
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
        if (P5) {
          /* V5 — THE LIE OF THE LAND: the elevation (a smooth tile field read as a C2
             spline, plus a finer swell) lit from the upper left. Continuous to the last
             pixel, so a slope is a gradient of light and never a contour band; a hollow
             takes a little less light (curvature) and holds the moisture. */
          const eE = (a, b) => this.tfc(F.e5, a, b) + P5.fineAmp * (this.fbm(a / P5.fineS + 77, b / P5.fineS + 31, 171) - 0.5);
          const d_ = 0.22, e0 = eE(u, v), gx = (eE(u + d_, v) - eE(u - d_, v)) / (2 * d_) * P5.relief, gy = (eE(u, v + d_) - eE(u, v - d_)) / (2 * d_) * P5.relief;
          const nl = Math.hypot(gx, gy, 1), lam = (-gx * P5.L[0] - gy * P5.L[1] + P5.L[2]) / nl / P5.L[2] - 1;
          const lap = (eE(u + 0.5, v) + eE(u - 0.5, v) + eE(u, v + 0.5) + eE(u, v - 0.5) - 4 * e0) * 4;
          cSH5[k] = lam - Math.max(-0.5, Math.min(0.5, lap * P5.ao));
          cM5[k] = this.tfc(F.m5, u, v); cG5[k] = this.tfc(F.g5, u, v); cK5[k] = this.tfc(F.k5, u, v);
        }
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
      const [fL0, fDRY, fLUSH, fWM, fSHELF, fDMAX, fTOPO, , fSAND, fROCK, fMUD, fSANDW, fRK, fWN, fEXPO, fKIND, fREFL, fHUE, fSH5, fM5, fG5, fK5] = FN;
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
      const ip = A => A[k00] * w0 + A[k10] * w1 + A[k01] * w2 + A[k11] * w3;
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
            const s = ip(S), t256 = ((ty & 255) << 8) | (tx & 255), t512 = ((ty & 511) << 9) | (tx & 511);
            const bd = BAYER[((ty & 3) << 2) | (tx & 3)];
            if (s < 0) {                                                  // ---------- under the water
              const n8 = NZ8[t256], n3 = NZ3[t256], d0 = -s, dB = -ip(SB);
              const dd = d0 < 10 ? d0 : d0 + (Math.max(dB, 2) - d0) * Math.min(1, (d0 - 10) / 24);
              const sa = ip(fSAND), ro = ip(fROCK), mu = ip(fMUD), wm = ip(fWM);
              // which stretch of shore this water belongs to: weights, blended (no edges on the bed)
              const mx = Math.max(sa, ro, mu, 0.5) - 0.42;
              let wS = sa > mx ? sa - mx : 0, wR = ro > mx ? ro - mx : 0, wM = mu > mx ? mu - mx : 0, wGr = 0.5 > mx ? 0.5 - mx : 0;
              const wt = wS + wR + wM + wGr; wS /= wt; wR /= wt; wM /= wt; wGr /= wt;
              // a beach shelves gently; a grass bank drops away
              const near = dd < 12 ? 1 : dd > 48 ? 0 : 1 - (dd - 12) / 36, shelf = ip(fSHELF) * (1 + ((wS * 1.8 + wR * 0.8 + wM * 1.0 + wGr * 0.42) - 1) * (0.35 + 0.65 * near)), dmax = ip(fDMAX), topo = ip(fTOPO);
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
              const weed = (wM + wGr) * (1 - ip(fEXPO) * 0.5) * (sa_ > 0.6 && sb_ > 0.45 ? 1 : 0) * (D > 0.12 && D < 1.8 ? 1 : 0);
              if (weed > 0) { const w_ = Math.min(0.85, weed), lt = n3 > 0.55 ? 1.25 : 1; br += (46 * lt - br) * w_; bg += (76 * lt - bg) * w_; bb += (40 * lt - bb) * w_; }
              br += (70 - br) * deep; bg += (92 - bg) * deep; bb += (92 - bb) * deep;
              const bankS = (wS < 0.3 ? 1 : wS > 0.7 ? 0 : (0.7 - wS) / 0.4) * (d0 < 1.6 ? 0.2 * (1 - d0 / 1.6) : 0), mot = (1 + (n3 - 0.5) * 0.14) * (1 - bankS);
              BR[q] = Math.max(0, Math.min(255, br * mot)); BG[q] = Math.max(0, Math.min(255, bg * mot)); BB[q] = Math.max(0, Math.min(255, bb * mot));
              DB[q] = D; WMq[q] = wm * 255; { const kd = ip(fKIND) * 50; WI[q] = kd > 255 ? 255 : kd; } RF[q] = ip(fREFL) * 255; HU[q] = (ip(fHUE) + 0.5) * 255; SW[q] = wS > 0.55 && dd < 0.5 + n3 * 1.5 ? 255 : 0;
              // caustics only over a light bed in the shallows
              if (((px | py) & 1) === 0 && D < 0.8) anim.mask[(py >> 1) * AW + (px >> 1)] = Math.round(Math.min(1, (0.8 - D) / 0.5) * (wS + wR * 0.45 + wM * 0.12 + wGr * 0.15) * (wm > 0.5 ? 0.3 : 1) * 255);
              continue;
            }
            // ---------- on land
            let col = 0;
            if (!pureLand) {
              const n3 = NZ3[t256], wm = ip(fWM);
              // which stretch of shore meets the water here. The choice wanders on a slow noise
              // (half a tile), never the fine one: thresholded fine noise flipped whole strips of
              // the band between sand and grass, and every flip was a square tooth of beach.
              const lo = NZ8[(((ty >> 2) & 255) << 8) | ((tx >> 2) & 255)] - 0.5;
              const jit = lo * 0.24 + (n3 - 0.5) * 0.03;
              const w0_ = ip(fSAND) + jit, w1_ = ip(fROCK) - jit, w2_ = ip(fMUD) + jit * 0.5, w4_ = wm > 0.2 ? 0.2 + wm * 1.1 : 0;
              let m = 3, m2 = 3, best = 0.5, sec = -1;
              if (w0_ > best) { sec = best; m2 = m; best = w0_; m = 0; } else if (w0_ > sec) { sec = w0_; m2 = 0; }
              if (w1_ > best) { sec = best; m2 = m; best = w1_; m = 1; } else if (w1_ > sec) { sec = w1_; m2 = 1; }
              if (w2_ > best) { sec = best; m2 = m; best = w2_; m = 2; } else if (w2_ > sec) { sec = w2_; m2 = 2; }
              if (w4_ > best) { sec = best; m2 = m; best = w4_; m = 4; } else if (w4_ > sec) { sec = w4_; m2 = 4; }
              const n8 = NZ8[t256];
              const bw1 = m === 0 ? ip(fSANDW) : m === 1 ? 2.2 + n3 * 3.2 : m === 2 ? 1.2 + n3 * 1.8 : m === 4 ? 2.4 : 0.6 + n8 * 1.6;
              // a stretch of shore narrows as it loses to the next: to nothing where grass takes
              // over (the beach tapers out), to the neighbour's own width where another material does
              const dm = Math.min(1, (best - sec) / 0.2), e = dm * dm * (3 - 2 * dm);
              let bw = bw1;
              if (m !== 3) {
                if (m2 === 3) bw = bw1 * e;
                else { const bw2 = m2 === 0 ? ip(fSANDW) : m2 === 1 ? 2.2 + n3 * 3.2 : m2 === 2 ? 1.2 + n3 * 1.8 : 2.4; bw = bw1 * (0.5 + 0.5 * e) + bw2 * (0.5 - 0.5 * e); }
              }
              if (s < bw + (n3 - 0.6) * 2) {
                if (m === 0) {
                  if (s < Math.min(0.9 + n8 * 1.1, bw * 0.6)) { const kk = 1 + ((n8 + bd * 0.5) * 2 | 0); col = PC.wet[kk < 0 ? 0 : kk > 2 ? 2 : kk]; }
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
                  else { const L = ip(fL0) + GM[t512] - 0.16; const kk = Math.floor(L * 8.6); col = PC.lush[kk < 0 ? 0 : kk > 8 ? 8 : kk]; }
                }
                out[q] = col; continue;
              }
            }
            // grass: macro x meso x micro, in the ramp the place calls for
            const t3 = NZ3[t256];
            let L = ip(fL0) + GM[t512] + TB[q] - ip(fWN) * 0.14 - (s < 14 ? (14 - s) * 0.004 : 0);
            const rk = fRK[k00] + fRK[k10] + fRK[k01] + fRK[k11] > 0 ? ip(fRK) : 0;
            // at a mountain's foot: patches of scree in the grass, thinning outward, never a band;
            // between them the grass sits a shade darker in the rock's lee
            if (rk > 0) {
              const sv = rk * 0.72 + (NZ8[t256] * 0.5 + t3 * 0.5 - 0.5) * 1.6 + (CL[t512] > 0.05 ? 0.12 : -0.05);
              if (sv > 0.9) { const kk = Math.floor((L + 0.04) * 6); out[q] = PC.scree[kk < 0 ? 0 : kk > 5 ? 5 : kk]; continue; }
              L -= rk * 0.07;
            }
            if (P5) {
              /* V5: the grass the moisture calls for, its HUE BLENDED across a broad band from
                 dry to ordinary to lush (the blades keep their crisp detail, only the colour
                 drifts — so a zone's edge is a gradual change, never a speckled checker).
                 DRY GROUND IS DRAWN LIKE THE GRASS: the grass thins in CLUMPS (a slow clump
                 field, so tufts stand in islands with soil between them, never a speckle),
                 more as it dries and as the geology says bare earth is near; the soil is a
                 muted tone mottled at the clump scale, cracked where clay or alkali bakes,
                 strewn with shaded pebbles; rock breaks through only where the ground is
                 really bare, as whole outcrops; then the land's own light */
              const mj = ip(fM5) + (t3 - 0.5) * 0.08 + HM[t512] * 0.1, gv = ip(fG5) + (CL[t512] > 0.04 ? P5.geoCob : 0);
              const bD = 0.11, xD = (P5.dryT + bD - mj) / (2 * bD), xL = (mj - P5.lushT + bD) / (2 * bD);
              const tD = xD <= 0 ? 0 : xD >= 1 ? 1 : xD * xD * (3 - 2 * xD), tL = xL <= 0 ? 0 : xL >= 1 ? 1 : xL * xL * (3 - 2 * xL);
              const clp = this.CLP[t512], want = Math.max((gv - 0.36) / 0.34, tD * P5.soilGap * 0.55);
              const cov = want + (clp - 0.5) * 0.75 + (t3 - 0.5) * 0.12;
              const pf = F.p5 ? F.p5[Math.min(H - 1, (ty / TS) | 0) * W + Math.min(W - 1, (tx / TS) | 0)] : 0;
              let br, bg, bb, kk, grav = 0;
              if (cov > 0.5 || pf && gv > 0.62) {
                // real bare ground wears the geology (rock, red earth, clay, crust); between thinning
                // tufts it is only the soil the grass grows in
                const bareG = (gv - 0.36) / 0.34 > 0.45 || pf, useB = ip(fK5) + (this.CLP[(t512 + 131101) & 262143] - 0.5) * 0.3 > 0.5, stone = bareG && (useB ? P5.stoneB : P5.stoneA) && want > 0.62 && !pf;
                const R5_ = !bareG ? P5.soil : stone ? (useB ? P5.geoB : P5.geoA) : (useB ? P5.stoneB : P5.stoneA) ? P5.soil : useB ? P5.geoB : P5.geoA;
                const Ls = ip(fL0) + (this.CLP[(t512 + 77777) & 262143] - 0.5) * 0.3;
                let gl;
                if (stone) { const sl = this.SLB[t256]; gl = 0.52 + (Ls - 0.55) * 0.35 + (sl > -0.2 ? sl * 0.7 : -0.28); }
                else {
                  gl = 0.6 + (Ls - 0.55) * 0.45 + (want - 0.6) * 0.1 + (cov < 0.54 ? -0.09 : 0);      // a tuft's shadow at the edge of the soil
                  // a ploughed field: furrows a few pixels apart, one direction per field
                  if (pf) { const co = pf === 1 ? ty : pf === 2 ? tx : pf === 3 ? tx + ty : tx - ty, ph = ((co % 7) + 7) % 7; gl += ph < 2 ? -0.16 : ph === 2 ? 0.08 : 0.02; }
                  else if (bareG && P5.cracks && this.CRK[t256] && want > 0.55) gl -= 0.17;           // baked clay, alkali crust
                  grav = (0.18 + want * 0.22) * P5.gravAmt;
                }
                kk = Math.floor(gl * 6); kk = kk < 0 ? 0 : kk > 5 ? 5 : kk;
                const c = R5_[kk]; br = c & 255; bg = (c >>> 8) & 255; bb = (c >>> 16) & 255;
              } else {
                kk = Math.floor((L + (gv > 0.5 ? (gv - 0.5) * -0.35 : 0) - (cov > 0.42 ? 0.08 : 0)) * 8.6); kk = kk < 0 ? 0 : kk > 8 ? 8 : kk;
                const cm = P5.mid[kk]; br = cm & 255; bg = (cm >>> 8) & 255; bb = (cm >>> 16) & 255;
                if (tD > 0) { const c = P5.dry[kk]; br += ((c & 255) - br) * tD; bg += (((c >>> 8) & 255) - bg) * tD; bb += (((c >>> 16) & 255) - bb) * tD; }
                if (tL > 0) { const c = P5.lush[kk]; br += ((c & 255) - br) * tL; bg += (((c >>> 8) & 255) - bg) * tL; bb += (((c >>> 16) & 255) - bb) * tL; }
                grav = tD * 0.05 * P5.gravAmt;
              }
              // grit and gravel: the same stones everywhere, more of them shown where it is drier
              if (grav > 0) {
                // the texture repeats every four tiles: each block reads it from its own offset
                const bk = ((ty >> 8) << 12) | (tx >> 8); if (bk !== gBk) { gBk = bk; gBo = (this.hash(tx >> 8, ty >> 8, 1561) * 65536) | 0; }
                const gq = (((ty + (gBo >> 8)) & 255) << 8) | ((tx + gBo) & 255), gs = this.GRV[gq];
                if (gs && this.GRK[gq] < grav) {
                  if (gs === 1) { br *= 0.76; bg *= 0.76; bb *= 0.8; }
                  else { let gk = gs === 2 ? 1 : gs === 3 ? 3 : 4; if (L < 0.4) gk--; if (L > 0.7) gk++; const c = P5.grav[gk < 0 ? 0 : gk > 5 ? 5 : gk]; br = c & 255; bg = (c >>> 8) & 255; bb = (c >>> 16) & 255; }
                }
              }
              const sh = ip(fSH5) * P5.shadeAmp, f = 1 + sh, wr = sh > 0 ? sh * P5.warm : 0, cb = sh < 0 ? -sh * P5.cool : 0;
              let r = br * f + wr * 40, g = bg * f + wr * 26, b = bb * f + cb * 30;
              r = Math.round(r / 3) * 3; g = Math.round(g / 3) * 3; b = Math.round(b / 3) * 3;
              out[q] = pk(r < 0 ? 0 : r > 255 ? 255 : r, g < 0 ? 0 : g > 255 ? 255 : g, b < 0 ? 0 : b > 255 ? 255 : b);
              continue;
            }
            // a dry or lush patch is a DENSITY of such blades, thinning to its edge, never a flat blob
            const dry = ip(fDRY) * 1.05 + (t3 - 0.5) * 0.95 + HM[t512] * 0.3, lush = ip(fLUSH) + (t3 - 0.5) * 0.8 + HM[t512] * 0.3;
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
      const FLW_ = P5 && P5.flowers.length ? P5.flowers : this.flowers;
      for (const it of items) if (it[1] === 1 || it[1] === 2 || it[1] === 7) {
        const st = it[1] === 1 ? FLW_[it[3] % FLW_.length] : it[1] === 7 ? P5.shrubs[it[3] % P5.shrubs.length] : P5 ? P5.peb[it[3] % P5.peb.length] : this.pebbles[it[3] % this.pebbles.length];
        const x0 = it[2] - ox - (st.w >> 1), y0 = it[0] - oy - st.h + 1;
        for (let y = 0; y < st.h; y++) { const yy = y0 + y; if (yy < 0 || yy >= N) continue; for (let x = 0; x < st.w; x++) { const xx = x0 + x, c = st.px[y * st.w + x]; if (c && xx >= 0 && xx < N && !DB[yy * N + xx]) {
          if (c === 1) { const q = yy * N + xx, o = out[q]; out[q] = pk((o & 255) * 0.7, ((o >>> 8) & 255) * 0.72, ((o >>> 16) & 255) * 0.8); } else out[yy * N + xx] = c; } } }
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
      const W = this.W, H = this.H, T = this.T, F = this.F, terr = this.terr, M = 24, items = [], P5_ = this.P5;
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
          let dens = 0.04 + Math.max(0, patch - 0.5) * 1.2 + Math.max(0, 1 - fF / 1.2) * 0.3 + Math.max(0, 1 - fW / 2) * 0.25 - Math.max(0, 1 - fR / 1.5) * 0.3;
          if (P5_) dens = dens * P5_.tuft * (0.35 + this.tfc(F.v5, u, v) * 1.1);
          if (this.hash(gx, gy, 84) > dens || !okGround(tx, ty)) continue;
          items.push([ty, 0, tx, Math.floor(this.hash(gx, gy, 85) * 18)]);
        }
      const FC = 44;
      for (let gy = Math.floor((oy - M) / FC); gy <= Math.floor((oy + N + M) / FC); gy++)
        for (let gx = Math.floor((ox - M) / FC); gx <= Math.floor((ox + N + M) / FC); gx++) {
          const cxp = gx * FC + this.hash(gx, gy, 91) * FC, cyp = gy * FC + this.hash(gx, gy, 92) * FC, u = cxp / TS, v = cyp / TS;
          const sun = this.fbm(u / 3 + 70, v / 3 + 3, 93);
          const fdens = Math.max(0, sun - 0.55) * 0.9 * (P5_ ? P5_.flower * (0.2 + this.tfc(F.v5, u, v) * 1.2) : 1);
          if (this.hash(gx, gy, 94) > fdens) continue;
          const nK = P5_ && P5_.flowers.length ? P5_.flowers.length : 6;
          const kind = Math.floor(this.hash(gx, gy, 95) * nK), nF = 3 + Math.floor(this.hash(gx, gy, 96) * 6);
          for (let f = 0; f < nF; f++) {
            const a = this.hash(gx * 13 + f, gy, 97) * 6.283, r = 2 + this.hash(gx, gy * 7 + f, 98) * 9;
            const tx = Math.round(cxp + Math.cos(a) * r), ty = Math.round(cyp + Math.sin(a) * r * 0.7);
            if (okGround(tx, ty)) items.push([ty, 1, tx, f % 5 === 4 ? (kind + 1) % nK : kind, f]);
          }
        }
      /* V5: THE ARID PLANTS, in a few TINY PATCHES only: a patch site every few tiles, kept
         only where a broad field and the plant mask (s5: dry ground at the edge of bare
         earth) both allow it, and then two to five plants of one kind within a stride of it */
      if (P5_ && P5_.nK && P5_.shrub > 0) {
        const PG = 176, MP = M + 40;
        for (let gy = Math.floor((oy - MP) / PG); gy <= Math.floor((oy + N + MP) / PG); gy++)
          for (let gx = Math.floor((ox - MP) / PG); gx <= Math.floor((ox + N + MP) / PG); gx++) {
            const cxp = gx * PG + this.hash(gx, gy, 161) * PG, cyp = gy * PG + this.hash(gx, gy, 162) * PG, u = cxp / TS, v = cyp / TS;
            if (u < 1 || v < 1 || u >= W - 1 || v >= H - 1) continue;
            const gate = this.fbm(u / 7 + 19, v / 7 + 41, 163);
            const dens = P5_.shrub * this.tfc(F.s5, u, v) * Math.max(0, gate - 0.5) * 6;
            if (this.hash(gx, gy, 164) > dens) continue;
            const kind = Math.floor(this.hash(gx, gy, 165) * P5_.nK), n = 2 + Math.floor(this.hash(gx, gy, 166) * 4);
            for (let f = 0; f < n; f++) {
              const a = this.hash(gx * 13 + f, gy, 167) * 6.283, r = f === 0 ? 0 : 7 + this.hash(gx, gy * 7 + f, 168) * 22;
              const tx = Math.round(cxp + Math.cos(a) * r), ty = Math.round(cyp + Math.sin(a) * r * 0.6);
              if (!okGround(tx, ty, 16) || this.tfc(F.s5, tx / TS, ty / TS) < 0.12) continue;
              items.push([ty, 7, tx, kind * 6 + Math.floor(this.hash(gx * 5 + f, gy, 169) * 6)]);
            }
          }
      }
      const PCg = 16;
      for (let gy = Math.floor((oy - M) / PCg); gy <= Math.floor((oy + N + M) / PCg); gy++)
        for (let gx = Math.floor((ox - M) / PCg); gx <= Math.floor((ox + N + M) / PCg); gx++) {
          const tx = gx * PCg + Math.floor(this.hash(gx, gy, 101) * PCg), ty = gy * PCg + Math.floor(this.hash(gx, gy, 102) * PCg), u = tx / TS, v = ty / TS;
          let dens = 0.008 + Math.max(0, 1 - this.tf(F.dRock, u, v) / 1.5) * 0.45;
          // V5: stones lie about on dry ground, most of all at the edge of bare earth
          if (P5_) { const dr = Math.min(1, Math.max(0, (P5_.dryT + 0.1 - this.tfc(F.m5, u, v)) / 0.3)), be = Math.min(1, Math.max(0, (this.tfc(F.g5, u, v) - 0.4) / 0.3)); dens += P5_.gravAmt * (dr * 0.025 + be * 0.1); }
          if (this.hash(gx, gy, 103) > dens || !okGround(tx, ty, 6)) continue;
          items.push([ty, 2, tx, Math.floor(this.hash(gx, gy, 104) * (P5_ ? 14 : 10))]);
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
