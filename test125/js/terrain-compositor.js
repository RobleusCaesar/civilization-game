/* TERRAIN COMPOSITOR v3 — THE MAIN-THREAD SIDE.
   Needs tc-core.js loaded first (TCCore, TCWorkerMain).
   The main thread does only what needs the page: it rasterises the game's
   traced coastline into a signed distance field, measures the tile fields,
   draws the trees' shade mask with the game's own stamps, and hands all of it
   to a pool of workers that compose the chunks. Chunks come back as bitmaps;
   until one arrives, a quarter-resolution thumbnail of it (or a flat tile
   colour) stands in. The water's movement is a light per-frame layer driven by
   data each chunk returns: caustic strength, glint points, swash points. */
(function () {
  const TS = 64, CH = 8, SDF_F = 16, N = 512, TL = 32, LT = 16;   // LT: thumbnail px per tile
  const TX = window.TerrainX = {
    on: false, opt: {}, chunks: new Map(), dirty: new Set(), pending: new Map(), gen: new Map(),
    stats: { ms: [], recv: 0, thumbs: 0 }, workers: [], rr: 0, core: null,
    MAX_CHUNKS: 24,

    // ---- the world the core needs ---------------------------------------------------
    terr() { return S.map.seenTerrain || S.map.terrain; },
    Tcodes() { const o = {}; for (const k of ['WATER', 'MOAT', 'FOREST', 'FERTILE', 'MOUNTAIN', 'HILLS', 'PEBBLES', 'TRENCH', 'BARREN', 'RUIN', 'CAMP', 'MOUND', 'STUMPS', 'GRASS']) o[k] = T[k]; return o; },
    edt(f, w, h) {
      const INF = 1e20, n = Math.max(w, h), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n), out = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = f[i] ? 0 : INF;
      const run = (len) => {
        let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
        for (let q = 1; q < len; q++) {
          let s;
          for (;;) { const r = v[k]; s = ((g[q] + q * q) - (g[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k] && k > 0) { k--; continue; } if (s <= z[k]) k = -1; break; }
          k++; v[k] = q; z[k] = k === 0 ? -INF : s; z[k + 1] = INF;
        }
        k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + g[r]; }
      };
      for (let x = 0; x < w; x++) { for (let q = 0; q < h; q++) g[q] = out[q * w + x]; run(h); for (let q = 0; q < h; q++) out[q * w + x] = d[q]; }
      for (let y = 0; y < h; y++) { const o = y * w; for (let q = 0; q < w; q++) g[q] = out[o + q]; run(w); for (let q = 0; q < w; q++) out[o + q] = d[q]; }
      return out;
    },
    // the coast as a signed distance (world px, + land), clamped at CAP; rasterised in
    // fixed blocks on a global grid so a windowed rebuild is bit-identical to a full one
    buildSDF(win) {
      const t0 = performance.now(), W = CFG.W, H = CFG.H, SW_ = W * SDF_F, SH_ = H * SDF_F, CAP = 150, MT = Math.ceil(CAP / TL) + 1;
      let ix0 = 0, iy0 = 0, ix1 = W, iy1 = H;
      if (win && this.sdf && this.sw === SW_) { ix0 = Math.max(0, win[0]); iy0 = Math.max(0, win[1]); ix1 = Math.min(W, win[2]); iy1 = Math.min(H, win[3]); } else win = null;
      const wx0 = win ? Math.max(0, ix0 - MT) : 0, wy0 = win ? Math.max(0, iy0 - MT) : 0, wx1 = win ? Math.min(W, ix1 + MT) : W, wy1 = win ? Math.min(H, iy1 + MT) : H;
      const sw = (wx1 - wx0) * SDF_F, sh = (wy1 - wy0) * SDF_F, BS = 256, nbx = Math.ceil(SW_ / BS), nby = Math.ceil(SH_ / BS);
      if (!win || !this._mask || this._mask.length !== SW_ * SH_) this._mask = new Uint8Array(SW_ * SH_);
      const mask = this._mask, path = R.waterBodyPath();
      const rb = this._rbc || (this._rbc = document.createElement('canvas')); rb.width = BS; rb.height = BS;
      const rg = rb.getContext('2d', { willReadFrequently: true });
      const bx0 = win ? Math.floor(ix0 * SDF_F / BS) : 0, by0 = win ? Math.floor(iy0 * SDF_F / BS) : 0, bx1 = win ? Math.ceil(ix1 * SDF_F / BS) : nbx, by1 = win ? Math.ceil(iy1 * SDF_F / BS) : nby;
      for (let by = by0; by < by1; by++) for (let bx = bx0; bx < bx1; bx++) {
        rg.setTransform(1, 0, 0, 1, 0, 0); rg.clearRect(0, 0, BS, BS);
        rg.setTransform(SDF_F / TL, 0, 0, SDF_F / TL, -bx * BS, -by * BS); rg.fillStyle = '#fff'; rg.fill(path);
        const a = rg.getImageData(0, 0, BS, BS).data;
        for (let y = 0; y < BS; y++) { const Y = by * BS + y; if (Y >= SH_) break; for (let x = 0; x < BS; x++) { const X = bx * BS + x; if (X >= SW_) break; mask[Y * SW_ + X] = a[(y * BS + x) * 4 + 3] > 127 ? 1 : 0; } }
      }
      const wet = new Uint8Array(sw * sh), dry = new Uint8Array(sw * sh);
      for (let y = 0; y < sh; y++) { const o = (y + wy0 * SDF_F) * SW_ + wx0 * SDF_F, r = y * sw; for (let x = 0; x < sw; x++) { const w = mask[o + x]; wet[r + x] = w; dry[r + x] = 1 - w; } }
      const dW = this.edt(wet, sw, sh), dD = this.edt(dry, sw, sh), k = TL / SDF_F;
      const S_ = win ? this.sdf : new Float32Array(SW_ * SH_);
      for (let y = (iy0 - wy0) * SDF_F; y < (iy1 - wy0) * SDF_F; y++) for (let x = (ix0 - wx0) * SDF_F; x < (ix1 - wx0) * SDF_F; x++) {
        const i = y * sw + x; let v = wet[i] ? -(Math.sqrt(dD[i]) - 0.5) * k : (Math.sqrt(dW[i]) - 0.5) * k;
        if (v > CAP) v = CAP; else if (v < -CAP) v = -CAP;
        S_[(y + wy0 * SDF_F) * SW_ + x + wx0 * SDF_F] = v;
      }
      this.sdf = S_; this.sw = SW_; this.sh = SH_;
      this.stats.sdf = performance.now() - t0;
      return win ? [ix0 * SDF_F, iy0 * SDF_F, (ix1 - ix0) * SDF_F, (iy1 - iy0) * SDF_F] : null;
    },
    buildFields() {
      const W = CFG.W, H = CFG.H, terr = this.terr(), F = {};
      const mk = pred => { const f = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) f[i] = pred(terr[i]) ? 1 : 0; const d = this.edt(f, W, H), o = new Float32Array(W * H); for (let i = 0; i < W * H; i++) o[i] = Math.sqrt(d[i]); return o; };
      F.dForest = mk(t => t === T.FOREST || t === T.FERTILE);
      F.dMtn = mk(t => t === T.MOUNTAIN);
      F.dRock = mk(t => t === T.HILLS || t === T.MOUNTAIN || t === T.PEBBLES);
      F.dMoat = mk(t => t === T.MOAT);
      F.dSea = mk(t => t === T.WATER);
      F.dWet = mk(t => t === T.WATER || t === T.MOAT);
      // each body of water: how deep it can get (its deepest tile's distance to land), spread onto its shore
      const wet = t => t === T.WATER || t === T.MOAT, lab = new Int32Array(W * H).fill(-1), deep = [];
      const dIn = this.edt(Uint8Array.from(terr, t => wet(t) ? 0 : 1), W, H);
      for (let i = 0; i < W * H; i++) {
        if (!wet(terr[i]) || lab[i] >= 0) continue;
        const id = deep.length; let mx = 0; const st = [i]; lab[i] = id;
        while (st.length) { const q = st.pop(); mx = Math.max(mx, Math.sqrt(dIn[q])); const x = q % W, y = (q / W) | 0;
          for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nq = ny * W + nx; if (lab[nq] < 0 && wet(terr[nq])) { lab[nq] = id; st.push(nq); } } }
        deep.push(mx);
      }
      const bd = new Float32Array(W * H).fill(4), seen = new Int32Array(W * H).fill(-1); let fr = [];
      for (let i = 0; i < W * H; i++) if (lab[i] >= 0) { bd[i] = deep[lab[i]]; seen[i] = 0; fr.push(i); }
      for (let r = 1; r <= 4 && fr.length; r++) { const nx_ = [];
        for (const q of fr) { const x = q % W, y = (q / W) | 0;
          for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nq = ny * W + nx; if (seen[nq] < 0) { seen[nq] = r; bd[nq] = bd[q]; nx_.push(nq); } } }
        fr = nx_; }
      F.bodyD = bd;
      this.F = F;
      this.blds = (S.buildings || []).filter(b => b.key !== 'wall' && b.key !== 'gate' && b.key !== 'raidercamp').map(b => ({ x: b.x, y: b.y, s: Bld.size(b), tc: b.key === 'tc', key: b.key }));
    },
    // trees and stones, drawn with the game's own stamps into a 1-bit mask at world px
    buildShade(win) {
      const W = CFG.W, H = CFG.H, sw = W * TL, sh = H * TL;
      if (!this.shade || this.shW !== sw || !win) { this.shade = new Uint8Array(sw * sh); this.shW = sw; this.shH = sh; win = [0, 0, W, H]; }
      const [tx0, ty0, tx1, ty1] = [Math.max(0, win[0]), Math.max(0, win[1]), Math.min(W, win[2]), Math.min(H, win[3])];
      const x0 = tx0 * TL, y0 = ty0 * TL, w = (tx1 - tx0) * TL, h = (ty1 - ty0) * TL;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = false; g.translate(-x0, -y0);
      if (R._stampMode && R._stampMode()) R.clipBoard(g, () => R.forestStampBand(g, Math.max(0, ty0 - 2), Math.min(H, ty1 + 3)));
      const a = g.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) { const o = (y0 + y) * sw + x0; for (let x = 0; x < w; x++) this.shade[o + x] = a[(y * w + x) * 4 + 3] > 60 ? 1 : 0; }
      return [x0, y0, w, h];
    },
    world() { return { seed: this.seed, W: CFG.W, H: CFG.H, T: this.Tcodes(), terr: Uint8Array.from(this.terr()), sdf: this.sdf, sw: this.sw, sh: this.sh, F: this.F, blds: this.blds, shade: this.shade, shW: this.shW, shH: this.shH }; },

    // ---- workers -------------------------------------------------------------------------
    startWorkers() {
      for (const w of this.workers) w.terminate();
      this.workers = [];
      if (this.opt.noWorkers || typeof Worker === 'undefined') return;
      const src = TCCore.toString() + '\n' + TCWorkerMain.toString() + '\nTCWorkerMain();';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const hc = navigator.hardwareConcurrency || 2, n = Math.max(1, Math.min(this.opt.workers || (hc <= 4 ? 1 : 2), hc - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url); w.busy = 0;
        w.onmessage = e => this.onChunk(w, e.data);
        w.postMessage({ type: 'world', world: this.world() });
        this.workers.push(w);
      }
    },
    sendPatch(p) { for (const w of this.workers) w.postMessage({ type: 'patch', patch: p }); this.core.patch(p); },
    request(cx, cy) {
      const k = cx + ',' + cy; if (this.pending.has(k)) return;
      const g = (this.gen.get(k) || 0); this.pending.set(k, g);
      if (!this.workers.length) { this._sync = this._sync || []; this._sync.push([cx, cy, k, g]); return; }
      // the least busy worker
      let w = this.workers[0]; for (const x of this.workers) if (x.busy < w.busy) w = x;
      w.busy++; w.postMessage({ type: 'chunk', cx, cy, key: k, gen: g });
    },
    onChunk(w, m) {
      w.busy = Math.max(0, w.busy - 1);
      if (m.type !== 'chunk') return;
      this.stats.ms.push(m.ms); this.stats.recv++;
      if ((this.gen.get(m.key) || 0) !== m.gen) { this.pending.delete(m.key); return; }   // superseded by an edit
      (this._arrive || (this._arrive = [])).push(m);
    },
    // finished chunks wait their turn: one is taken in per frame, the ones in view first
    takeArrivals() {
      const q = this._arrive; if (!q || !q.length) return;
      const vis = new Set(this.viewChunks(0).map(([a, b]) => a + ',' + b)); let i = q.findIndex(m => vis.has(m.key)); if (i < 0) i = 0;
      const m = q.splice(i, 1)[0];
      if ((this.gen.get(m.key) || 0) !== m.gen) { this.pending.delete(m.key); if (m.bitmap && m.bitmap.close) m.bitmap.close(); if (m.thumb && m.thumb.close) m.thumb.close(); return; }
      let img = m.bitmap;
      if (!img) { const c = document.createElement('canvas'); c.width = N; c.height = N; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.buf.buffer), N, N), 0, 0); img = c; }
      this.store(m.key, img, m.anim, m.thumb);
    },
    store(k, img, anim, thumb) {
      this.pending.delete(k); this.dirty.delete(k);
      const old = this.chunks.get(k); if (old) this.release(old, img);
      this.chunks.delete(k); this.chunks.set(k, { img, anim: this.masks(anim) }); this._maskGen = (this._maskGen | 0) + 1;
      // keep a quarter-size copy as the stand-in for this square
      const [cx, cy] = k.split(',').map(Number), tg = this.thumb.getContext('2d');
      tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'medium';
      tg.drawImage(thumb || img, cx * CH * LT, cy * CH * LT, CH * LT, CH * LT); if (thumb && thumb.close) thumb.close(); this.stats.thumbs++; (this._th || (this._th = new Set())).add(k);
      this.evict();
    },
    release(c, keepImg) {
      if (c.img && c.img.close && c.img !== keepImg) c.img.close();
      for (const m of [c.anim && c.anim.cm, c.anim && c.anim.sm]) if (m && m[0] && m[0].close) m[0].close();
    },
    // the main-thread path hands masks back as arrays: make them canvases cropped like the worker's
    masks(a) {
      if (!a || a.cm !== undefined) return a;
      const span = N / 2, mk = (arr, minSum) => {
        if (!arr) return null; let x0 = span, y0 = span, x1 = -1, y1 = -1, sum = 0;
        for (let y = 0; y < span; y++) for (let x = 0; x < span; x++) { const v = arr[y * span + x]; if (v) { sum += v; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (sum <= minSum) return null;
        const w = x1 - x0 + 1, h = y1 - y0 + 1, c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'), id = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) id.data[(y * w + x) * 4 + 3] = arr[(y0 + y) * span + x0 + x];
        g.putImageData(id, 0, 0); return [c, x0, y0, w, h];
      };
      a.cm = mk(a.mask, 255 * 40); a.sm = mk(a.smask, 255 * 20); a.mask = null; a.smask = null; return a;
    },
    evict() {
      if (this.chunks.size <= this.MAX_CHUNKS) return;
      const keep = new Set((this._want || []).map(([a, b]) => a + ',' + b));
      for (const k of [...this.chunks.keys()]) { if (this.chunks.size <= this.MAX_CHUNKS) break; if (keep.has(k)) continue; this.release(this.chunks.get(k)); this.chunks.delete(k); }
    },
    // a flat colour per tile until the thumbnails arrive
    paintThumbBase() {
      const W = CFG.W, H = CFG.H, terr = this.terr();
      this.thumb = this.thumb || document.createElement('canvas'); this.thumb.width = W * LT; this.thumb.height = H * LT;
      const g = this.thumb.getContext('2d'), col = t => t === T.WATER ? '#2f7b8c' : t === T.MOAT ? '#3d6e66' : t === T.FOREST ? '#2e5226' : t === T.MOUNTAIN ? '#6b6a5e' : '#4b7c33';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = col(terr[y * W + x]); g.fillRect(x * LT, y * LT, LT, LT); }
    },
    viewChunks(pad) {
      const z = R.cam.z, span = CH * TL, nC = Math.ceil(CFG.W / CH), nR = Math.ceil(CFG.H / CH);
      const x0 = R.cam.x, y0 = R.cam.y, x1 = x0 + R.viewW() / z, y1 = y0 + R.viewH() / z, out = [];
      for (let cy = Math.max(0, Math.floor(y0 / span) - pad); cy <= Math.min(nR - 1, Math.floor(y1 / span) + pad); cy++)
        for (let cx = Math.max(0, Math.floor(x0 / span) - pad); cx <= Math.min(nC - 1, Math.floor(x1 / span) + pad); cx++) out.push([cx, cy]);
      return out;
    },
    // ask for what the camera needs, nearest first; then, quietly, everything else (for the thumbnails)
    schedule() {
      this.takeArrivals();
      const now = performance.now(), cx0 = R.cam.x + R.viewW() / R.cam.z / 2, cy0 = R.cam.y + R.viewH() / R.cam.z / 2, span = CH * TL;
      const lc = this._schedCam; this._schedCam = [cx0, cy0, now];
      if (lc && now > lc[2]) { const k = Math.min(1, (now - lc[2]) / 100), vx = (cx0 - lc[0]) / (now - lc[2]), vy = (cy0 - lc[1]) / (now - lc[2]); this._vel = [(this._vel ? this._vel[0] : 0) * (1 - k) + vx * k, (this._vel ? this._vel[1] : 0) * (1 - k) + vy * k]; }
      const vel = this._vel || [0, 0], moving = Math.hypot(vel[0], vel[1]) > 0.05;
      if (moving) this._movedAt = now;
      // where the camera will be in ~0.6 s: the ring is asked for in that order
      const px = cx0 + vel[0] * 600, py = cy0 + vel[1] * 600;
      const vis = this.viewChunks(0), ring = this.viewChunks(2); this._want = ring;
      const cap = Math.max(1, this.workers.length) + 1, inflight = () => this.pending.size;
      const need = ring.filter(([a, b]) => { const k = a + ',' + b; return (!this.chunks.has(k) || this.dirty.has(k)) && !this.pending.has(k); });
      const visSet = new Set(vis.map(([a, b]) => a + ',' + b));
      need.sort((A, B) => { const va = visSet.has(A[0] + ',' + A[1]) ? 0 : 1, vb = visSet.has(B[0] + ',' + B[1]) ? 0 : 1; if (va !== vb) return va - vb;
        return Math.hypot((A[0] + 0.5) * span - px, (A[1] + 0.5) * span - py) - Math.hypot((B[0] + 0.5) * span - px, (B[1] + 0.5) * span - py); });
      for (const [cx, cy] of need) { if (inflight() >= cap) break; this.request(cx, cy); }
      // the rest of the map, for the stand-ins: only while the camera rests and nothing is owed
      if (!this._warmDone && !need.length && inflight() === 0 && now - (this._movedAt || 0) > 700) {
        const nC = Math.ceil(CFG.W / CH), nR = Math.ceil(CFG.H / CH); this._warmQ = this._warmQ || (() => { const q = []; for (let y = 0; y < nR; y++) for (let x = 0; x < nC; x++) q.push([x, y]); q.sort((A, B) => Math.hypot((A[0] + 0.5) * span - cx0, (A[1] + 0.5) * span - cy0) - Math.hypot((B[0] + 0.5) * span - cx0, (B[1] + 0.5) * span - cy0)); return q; })();
        while (this._warmQ.length) { const [cx, cy] = this._warmQ.shift(); if (!this.chunks.has(cx + ',' + cy) && !this._thumbed(cx, cy)) { this.request(cx, cy); break; } }
        if (!this._warmQ.length) this._warmDone = true;
      }
      // no workers: build one chunk on this thread per frame
      if (this._sync && this._sync.length) { const [cx, cy, k, g] = this._sync.shift(); const r = this.core.chunk(cx, cy); const c = document.createElement('canvas'); c.width = N; c.height = N; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.buf.buffer), N, N), 0, 0); if ((this.gen.get(k) || 0) === g) this.store(k, c, r.anim); else this.pending.delete(k); }
    },
    _thumbed(cx, cy) { return this._th && this._th.has(cx + ',' + cy); },

    // ---- per frame -----------------------------------------------------------------------
    drawGround(g) {
      const span = CH * TL, sm = g.imageSmoothingEnabled;
      this.schedule();
      for (const [cx, cy] of this.viewChunks(0)) {
        const c = this.chunks.get(cx + ',' + cy);
        if (c) { g.imageSmoothingEnabled = false; g.drawImage(c.img, cx * span, cy * span, span, span); }
        else { g.imageSmoothingEnabled = true; const L = CH * LT; g.drawImage(this.thumb, cx * L, cy * L, L, L, cx * span, cy * span, span, span); this.stats.standIn = (this.stats.standIn || 0) + 1; }
      }
      g.imageSmoothingEnabled = sm;
      if (this.opt.anim !== false) this.drawWaterLife(g);
    },
    // caustic light: K frames of a tiling pattern of moving cell edges, at world px
    makeCaustics() {
      // sunlight focused by the ripples onto a shallow bed: a net of thin bright lines, the
      // cells a few pixels across and bent by a slow warp, so it never reads as paving.
      // K frames loop seamlessly: every moving part returns to its start after K.
      const K = 12, P_ = 128, n = 16, cell = P_ / n, out = [], core = this.core, pts = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = a => core.hash(i, j, 650 + a); pts.push([(i + 0.25 + 0.5 * h(1)) * cell, (j + 0.25 + 0.5 * h(2)) * cell, 0.8 + h(3) * 1.4, h(4) * 6.283, h(5) < 0.5 ? 1 : -1]); }
      const wA = core.makeNoiseTex(P_, 6, 701), wB = core.makeNoiseTex(P_, 6, 702), br = core.makeNoiseTex(P_, 4, 703);
      for (let f = 0; f < K; f++) {
        const t = f / K * 6.283, sh = Math.round(f * P_ / K), c2 = document.createElement('canvas'); c2.width = P_; c2.height = P_;
        const g = c2.getContext('2d'), id = g.createImageData(P_, P_), d = id.data;
        const P2 = pts.map(([x, y, r, ph, dir]) => [x + Math.cos(t * dir + ph) * r, y + Math.sin(t * dir + ph) * r]);
        for (let y = 0; y < P_; y++) for (let x = 0; x < P_; x++) {
          const wx = x + (core.tex(wA, x + sh, y) - 0.5) * 7, wy = y + (core.tex(wB, x, y - sh) - 0.5) * 7;
          const gx = Math.floor(wx / cell), gy = Math.floor(wy / cell);
          let f1 = 1e9, f2 = 1e9;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const ci = ((gx + ox) % n + n) % n, cj = ((gy + oy) % n + n) % n, p = P2[cj * n + ci];
            // p lives in the base tile; shift it by whole periods so neighbours across the wrap line up
            const dx = wx - (p[0] + Math.floor((gx + ox) / n) * P_), dy = wy - (p[1] + Math.floor((gy + oy) / n) * P_);
            const d2 = dx * dx + dy * dy; if (d2 < f1) { f2 = f1; f1 = d2; } else if (d2 < f2) f2 = d2;
          }
          const e = Math.sqrt(f2) - Math.sqrt(f1), lum = core.tex(br, x + sh, y + sh);
          const a = (e < 0.6 ? 1 : e < 1.2 ? 0.45 : 0) * (lum > 0.38 ? (lum > 0.6 ? 1 : 0.6) : 0.15);
          const i = (y * P_ + x) * 4; d[i] = 226; d[i + 1] = 246; d[i + 2] = 232; d[i + 3] = a * 255;
        }
        g.putImageData(id, 0, 0); out.push(c2);
      }
      this.caus = out;
    },
    // the surface: wavelets that live and fade on their own clocks, carried in groups by a wave
    // that travels across the tile, and sun sparkles that twinkle where a group is cresting.
    // K frames that loop seamlessly over a P-px tile; the tile itself drifts with the wind.
    makeRipples() {
      const K = 16, P_ = 256, core = this.core, out = [], TAU = 6.283185307;
      const site = [], spark = [];
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { const h = a => core.hash(i, j, 720 + a); site.push([(i + h(1)) * 8 | 0, (j + h(2)) * 8 | 0, 2 + (h(3) * 3.2 | 0), h(4), 0.55 + 0.45 * h(5)]); }
      for (let j = 0; j < 22; j++) for (let i = 0; i < 22; i++) { const h = a => core.hash(i, j, 760 + a); spark.push([(i + h(1)) * (256 / 22) | 0, (j + h(2)) * (256 / 22) | 0, h(3), h(4)]); }
      // the group wave: integer frequencies so it tiles; a second wave bends its front
      const grp = (x, y, f) => { const a = TAU * (3 * x + 1 * y) / P_ - TAU * f / K + 1.3 * Math.sin(TAU * (1 * x - 2 * y) / P_ + 0.7) + 0.8 * Math.sin(TAU * (2 * x + 3 * y) / P_ - TAU * f / K * 0.0 + 2.1); return 0.5 + 0.5 * Math.sin(a); };
      const q = v => v > 0.78 ? 1 : v > 0.5 ? 0.7 : v > 0.25 ? 0.42 : v > 0.08 ? 0.2 : 0;   // a few hard alpha steps
      for (let f = 0; f < K; f++) {
        const c = document.createElement('canvas'); c.width = P_; c.height = P_;
        const g = c.getContext('2d'), id = g.createImageData(P_, P_), d = id.data;
        const put = (x, y, r, gg, b, a) => { if (a <= 0) return; x = ((x % P_) + P_) % P_; y = ((y % P_) + P_) % P_; const i = (y * P_ + x) * 4; if (d[i + 3] >= a * 255) return; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a * 255; };
        for (const [x, y, L, ph, b0] of site) {
          // a wavelet shows where a group is cresting; its own clock only breaks the line up
          const G = grp(x, y, f), crest = G < 0.5 ? 0 : (G - 0.5) / 0.5;
          const life = 0.45 + 0.55 * Math.sin(TAU * (f / K + ph)); if (life <= 0 || !crest) continue;
          const I = b0 * life * crest * crest, a = q(I);
          if (!a) continue;
          for (let k = 0; k < L; k++) put(x + k, y, 236, 250, 252, a * 0.66);              // the lit crest
          for (let k = 1; k < L - 1; k++) put(x + k, y + 1, 10, 52, 86, a * 0.24);         // its trough, a touch darker
        }
        for (const [x, y, ph, st] of spark) {
          // the sun caught on a crest: a point that flares for a frame or two, a star when strong
          const G = grp(x, y, f); if (G < 0.7) continue;
          const t = ((f / K * 2 + ph) % 1) * K; if (t >= 2.5) continue;
          const I = (t < 1 ? 1 : t < 2 ? 0.7 : 0.4) * (G - 0.7) / 0.3;
          put(x, y, 255, 253, 240, Math.min(1, 0.6 + I));
          if (st > 0.3 && I > 0.3) { const arm = 0.35 + 0.5 * I; put(x - 1, y, 255, 250, 232, arm); put(x + 1, y, 255, 250, 232, arm); put(x, y - 1, 255, 250, 232, arm * 0.85); put(x, y + 1, 255, 250, 232, arm * 0.85);
            if (st > 0.75 && I > 0.7) { put(x - 2, y, 255, 250, 232, 0.3); put(x + 2, y, 255, 250, 232, 0.3); } }
        }
        g.putImageData(id, 0, 0); out.push(c);
      }
      this.rip = out;
    },
    // ONE composite per frame, over just the water in view. Into a scratch the size of that
    // water (snapped to a 32-px grid, so a pan rarely changes it): the shallow masks cut the
    // caustic pattern, the open-water masks cut the ripple pattern, the two are laid together,
    // and the result goes over the ground in one draw. The scratch is only recomposed when an
    // animation frame turns or the grid box moves; otherwise last frame's is drawn again.
    _scr(n) { const k = '_s' + n; return this[k] || (this[k] = document.createElement('canvas')); },
    _cut(dst, frames, fi, ox, oy, bx, by, w, h, masks, key) {
      const g = dst.getContext('2d'), T = frames[0].width;
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
      const pat = g.createPattern(frames[fi], 'repeat'); pat.setTransform(new DOMMatrix([1, 0, 0, 1, -(((bx - ox) % T) + T) % T, -(((by - oy) % T) + T) % T])); g.fillStyle = pat; g.fillRect(0, 0, w, h);
      const M = this._scr('m'), mg = M.getContext('2d'); mg.clearRect(0, 0, w, h);
      for (const [X0, Y0, a] of masks) { const m = a[key]; if (m) mg.drawImage(m[0], X0 + m[1] - bx, Y0 + m[2] - by); }
      g.globalCompositeOperation = 'destination-in'; g.drawImage(M, 0, 0); g.globalCompositeOperation = 'source-over';
    },
    drawWaterLife(g) {
      const t = this.tOverride != null ? this.tOverride : performance.now() / 1000, span = CH * TL, G_ = 32;
      const z = R.cam.z, vx0 = R.cam.x, vy0 = R.cam.y, vx1 = vx0 + R.viewW() / z, vy1 = vy0 + R.viewH() / z;
      // the water in view, from the chunks' own mask boxes, snapped out to the grid
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; const list = [];
      for (const [cx, cy] of this.viewChunks(0)) {
        const c = this.chunks.get(cx + ',' + cy); if (!c || !c.anim) continue; const a = c.anim, X0 = cx * span, Y0 = cy * span; let used = false;
        for (const m of [a.cm, a.sm]) if (m) { used = true; bx0 = Math.min(bx0, X0 + m[1]); by0 = Math.min(by0, Y0 + m[2]); bx1 = Math.max(bx1, X0 + m[1] + m[3]); by1 = Math.max(by1, Y0 + m[2] + m[4]); }
        if (used) list.push([X0, Y0, a]);
      }
      // a fast pan: nobody can see a ripple turn while the ground streams past, so the layers
      // are not redone more than four times a second until the camera settles
      const now = performance.now(), mv = this._lastCam ? Math.hypot(vx0 - this._lastCam[0], vy0 - this._lastCam[1]) : 0; this._lastCam = [vx0, vy0];
      const hold = mv > (this.opt.fastPx || 5) && now - (this._lastCompose || 0) < 250;
      // the composed box keeps a margin round the view and is only moved when the view leaves it
      const need = [Math.max(bx0, vx0), Math.max(by0, vy0), Math.min(bx1, vx1), Math.min(by1, vy1)];
      if (list.length && need[2] > need[0] && need[3] > need[1]) {
        const MG = this.opt.lifeMargin || 64, lb = this._lifeBox;
        let box = hold && lb ? lb : lb && lb[0] <= need[0] && lb[1] <= need[1] && lb[0] + lb[2] >= need[2] && lb[1] + lb[3] >= need[3] && this._lifeBK && this._lifeBK.endsWith('|' + (this._maskGen | 0)) ? lb : null;
        if (!box) {
          const x0 = Math.floor(Math.max(bx0, vx0 - MG) / G_) * G_, y0 = Math.floor(Math.max(by0, vy0 - MG) / G_) * G_;
          const x1 = Math.ceil(Math.min(bx1, vx1 + MG) / G_) * G_, y1 = Math.ceil(Math.min(by1, vy1 + MG) / G_) * G_;
          box = [x0, y0, x1 - x0, y1 - y0];
        }
        // two layers, two caches: the ripples turn at 8 frames a second, the caustic net (slow light
        // on the bed) at 4; when both are due in one frame only one is redone, so a frame pays at
        // most one composite. Each is drawn straight onto the ground: no third canvas.
        const fr = Math.floor(t * 8) % this.rip.length, fc = Math.floor(t * 4) % this.caus.length;
        const wind = this.opt.wind || [2.2, 0.9], tq = Math.floor(t * 8) / 8, wx = Math.round(tq * wind[0]), wy = Math.round(tq * wind[1]);
        const bk = box.join(',') + '|' + (this._maskGen | 0), kA = bk + '|' + fr + ',' + wx + ',' + wy, kB = bk + '|' + fc;
        const A = this._scr('a'), B = this._scr('b'), boxChanged = bk !== this._lifeBK;
        const size = c => { if (c.width < box[2] || c.height < box[3]) { c.width = Math.max(c.width, box[2]); c.height = Math.max(c.height, box[3]); } };
        const P_ = this._scr('p'); if (boxChanged) { size(A); size(B); size(P_); size(this._scr('m')); }
        let did = 0;
        if (!hold && kA !== this._kA && (boxChanged || this._kB === kB || this._lastDid !== 'a')) { this._cut(A, this.rip, fr, wx, wy, box[0], box[1], box[2], box[3], list, 'sm'); this._kA = kA; did = 'a'; }
        if (!hold && kB !== this._kB && (boxChanged || !did)) { this._cut(B, this.caus, fc, 0, 0, box[0], box[1], box[2], box[3], list, 'cm'); this._kB = kB; did = did ? 'ab' : 'b'; }
        if (did) { this._lastDid = did; this._lastCompose = now; this.stats.lifeComposes = (this.stats.lifeComposes || 0) + 1;
          // the two laid together once, so the screen takes one draw a frame
          const pg = P_.getContext('2d'), [, , w, h] = box; pg.clearRect(0, 0, w, h);
          pg.globalAlpha = this.opt.causticA || 0.3; pg.drawImage(B, 0, 0, w, h, 0, 0, w, h);
          pg.globalAlpha = this.opt.rippleA || 1; pg.drawImage(A, 0, 0, w, h, 0, 0, w, h); pg.globalAlpha = 1; }
        this._lifeBK = bk; this._lifeBox = box;
        // only the part in view goes on screen
        const [lx, ly] = box, sx = Math.max(0, Math.floor(vx0) - lx), sy = Math.max(0, Math.floor(vy0) - ly), sw = Math.min(box[2] - sx, Math.ceil(vx1 - vx0) + 2), sh = Math.min(box[3] - sy, Math.ceil(vy1 - vy0) + 2);
        if (sw > 0 && sh > 0) {
          const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
          g.drawImage(P_, sx, sy, sw, sh, lx + sx, ly + sy, sw, sh); g.imageSmoothingEnabled = sm;
        }
      }
      // swash on open shores: foam that slides up and back
      for (const [X0, Y0, a] of list.length ? list : []) {
        const W_ = a.swash;
        for (let i = 0; i < W_.length; i += 5) {
          const ph = (Math.sin(t * 0.8 + W_[i + 4]) + 1) / 2; if (ph < 0.35) continue;
          const off = (1 - ph) * 2.2, nx = W_[i + 2], ny = W_[i + 3], tx = -ny, ty = nx, cx_ = W_[i] + nx * off, cy_ = W_[i + 1] + ny * off;
          if (cx_ < vx0 - 4 || cx_ > vx1 + 4 || cy_ < vy0 - 4 || cy_ > vy1 + 4) continue;
          g.fillStyle = 'rgba(222,236,230,' + ((ph - 0.35) / 0.65 * 0.5).toFixed(2) + ')';
          for (let s_ = -2; s_ <= 2; s_++) { const bow = (s_ * s_) * 0.12; g.fillRect(Math.round((cx_ + tx * s_ * 0.5 - nx * bow) * 2) / 2, Math.round((cy_ + ty * s_ * 0.5 - ny * bow) * 2) / 2, 0.5, 0.5); }
        }
      }
    },

    // ---- edits ---------------------------------------------------------------------------
    snapshot() { this._Fsnap = {}; for (const k of Object.keys(this.F || {})) this._Fsnap[k] = Float32Array.from(this.F[k]); this._tsnap = Uint8Array.from(this.terr()); this._bsig = new Set(this.blds.map(b => b.key + '@' + b.x + ',' + b.y)); this._wkey = R.waterKey ? R.waterKey() : null; },
    noteEdit() {
      const t0 = performance.now(), W = CFG.W, H = CFG.H, terr = this.terr(), old = this._tsnap, changed = [];
      if (old && old.length === terr.length) for (let i = 0; i < terr.length; i++) if (old[i] !== terr[i]) changed.push([i % W, (i / W) | 0, old[i], terr[i]]);
      const nowB = (S.buildings || []).filter(b => b.key !== 'wall' && b.key !== 'gate' && b.key !== 'raidercamp');
      const bsig = new Set(nowB.map(b => b.key + '@' + b.x + ',' + b.y)), bChanged = nowB.filter(b => !this._bsig.has(b.key + '@' + b.x + ',' + b.y));
      const gone = [...this._bsig].filter(k => !bsig.has(k)).map(k => { const [, xy] = k.split('@'); const [x, y] = xy.split(',').map(Number); return { x, y, s: 2 }; });
      const wkey = R.waterKey ? R.waterKey() : null, waterMoved = wkey !== this._wkey;
      if (!changed.length && !bChanged.length && !gone.length && !waterMoved) { this.stats.lastEdit = { tiles: 0, chunks: 0, ms: performance.now() - t0 }; return this.stats.lastEdit; }
      const patch = {}, hit = new Set(), nC = Math.ceil(W / CH), nR = Math.ceil(H / CH);
      const near = (x0, y0, x1, y1, r) => { for (let cy = Math.floor((y0 - r) / CH); cy <= Math.floor((y1 + r) / CH); cy++) for (let cx = Math.floor((x0 - r) / CH); cx <= Math.floor((x1 + r) / CH); cx++) if (cx >= 0 && cy >= 0 && cx < nC && cy < nR) hit.add(cx + ',' + cy); };
      let tS = 0;
      if (waterMoved) {
        const a = performance.now(), wetT = t => t === T.WATER || t === T.MOAT, oldS = Float32Array.from(this.sdf);
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (const [x, y, o, n_] of changed) if (wetT(o) !== wetT(n_)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
        const R_ = 2 + Math.ceil(150 / TL), win = this.buildSDF(x1 >= 0 ? [x0 - R_, y0 - R_, x1 + R_, y1 + R_] : null);
        if (win) { const [sx, sy, w, h] = win, d = new Float32Array(w * h); for (let y = 0; y < h; y++) d.set(this.sdf.subarray((sy + y) * this.sw + sx, (sy + y) * this.sw + sx + w), y * w); patch.sdfWin = [sx, sy, w, h, d]; }
        else patch.sdfWin = [0, 0, this.sw, this.sh, this.sdf];
        const per = CH * SDF_F;
        for (let i = 0; i < this.sdf.length; i++) { const p = oldS[i], q = this.sdf[i]; if (p !== q && Math.abs(p - q) > 0.2) hit.add(Math.floor((i % this.sw) / per) + ',' + Math.floor(Math.floor(i / this.sw) / per)); }
        tS = performance.now() - a;
      }
      this.buildFields(); patch.F = this.F; patch.blds = this.blds; patch.terr = Uint8Array.from(terr);
      { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
        for (const k of Object.keys(this.F)) { const a = this._Fsnap && this._Fsnap[k], b = this.F[k]; if (!a || a.length !== b.length) { grow(0, 0); grow(W - 1, H - 1); continue; } for (let i = 0; i < b.length; i++) if (Math.abs(a[i] - b[i]) > 1e-4) grow(i % W, (i / W) | 0); }
        if (waterMoved) for (const [x, y, o, n_] of changed) grow(x, y);
        if (x1 >= 0) near(x0, y0, x1 + 1, y1 + 1, 12); }
      for (const [x, y] of changed) near(x, y, x, y, 3);
      for (const b of bChanged.concat(gone)) { const s_ = b.s || Bld.size(b); near(b.x, b.y, b.x + s_, b.y + s_, 2); }
      const WOODY = new Set([T.FOREST, T.HILLS, T.PEBBLES, T.RUIN, T.STUMPS]);
      const woody = changed.filter(([, , a, b]) => WOODY.has(a) || WOODY.has(b));
      if (woody.length) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const [x, y] of woody) { x0 = Math.min(x0, x - 2); y0 = Math.min(y0, y - 2); x1 = Math.max(x1, x + 3); y1 = Math.max(y1, y + 3); } const [sx, sy, w, h] = this.buildShade([x0, y0, x1, y1]); const d = new Uint8Array(w * h); for (let y = 0; y < h; y++) d.set(this.shade.subarray((sy + y) * this.shW + sx, (sy + y) * this.shW + sx + w), y * w); patch.shadeWin = [sx, sy, w, h, d]; }
      this.sendPatch(patch);
      for (const k of hit) { this.dirty.add(k); this.gen.set(k, (this.gen.get(k) || 0) + 1); this.pending.delete(k); }
      this.snapshot();
      this.stats.lastEdit = { tiles: changed.length, water: waterMoved, chunks: hit.size, ms: performance.now() - t0, sdfMs: tS };
      return this.stats.lastEdit;
    },

    // ---- tests ---------------------------------------------------------------------------
    whenIdle(timeout) { const t0 = performance.now(); return new Promise(res => { const tick = () => { const need = this.viewChunks(0).some(([a, b]) => !this.chunks.has(a + ',' + b) || this.dirty.has(a + ',' + b)); if ((!need && !this.pending.size && !(this._arrive && this._arrive.length)) || performance.now() - t0 > (timeout || 20000)) res(performance.now() - t0); else { this.schedule(); setTimeout(tick, 16); } }; tick(); }); },
    coreHash(cx, cy, core) { const b = (core || this.core).chunk(cx, cy).buf; let h = 2166136261; for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619); return (h >>> 0).toString(16); },

    // ---- install ---------------------------------------------------------------------------
    rebuildAll() {
      const t0 = performance.now();
      this.seed = 0; const s = String(S.seed || ''); for (let i = 0; i < s.length; i++) this.seed = (Math.imul(this.seed, 31) + s.charCodeAt(i)) | 0;
      this.buildSDF(); this.buildFields(); this.buildShade();
      this.core = this.core || TCCore(); this.core.setWorld(this.world());
      for (const c of this.chunks.values()) this.release(c);
      this.chunks.clear(); this.dirty.clear(); this.pending.clear(); this.gen.clear(); this._warmQ = null; this._warmDone = false; this._th = new Set(); this._arrive = [];
      this.paintThumbBase(); this.startWorkers(); this.snapshot();
      if (!this.caus) this.makeCaustics(); if (!this.rip) this.makeRipples();
      this.stats.prep = performance.now() - t0;
    },
    // ---- the game's own ground painters, stood down or given back -------------------------
    _capture() {
      if (this._orig) return;
      this._orig = { paintGround: R.paintGround, paintWaterIn: R.paintWaterIn, blockShade: R.blockShade, terrainEdges: R.terrainEdges,
        grassCover: R.grassCover, hueTint: R.hueTint, meadowRoll: R.meadowRoll, drawDecal: R.drawDecal, buildShoreLayer: R.buildShoreLayer, blitShore: R.blitShore,
        drawLivingWater: R.drawLivingWater, drawTileAt: R.drawTileAt, drawTilesAt: R.drawTilesAt };
    },
    setPainters(on) {
      this._capture(); const O = this._orig, self = this;
      if (!on) { Object.assign(R, O); R.shoreLayer = null; R._layerKey = ''; this._painted = false; return; }
      if (this._painted) return;
      const noop = function () {}, keep = new Set(this.opt.keepDecals || ['fern', 'leaf']);
      R.paintGround = noop; R.paintWaterIn = noop; R.blockShade = noop; R.terrainEdges = noop; R.grassCover = noop; R.hueTint = noop; R.meadowRoll = () => false;
      R.drawDecal = function (g, dx, dy, kind, px, rnd) { if (!keep.has(kind)) return; return O.drawDecal.call(this, g, dx, dy, kind, px, rnd); };
      // the game's traced shore layer is not drawn at all (and a full-map canvas is not kept for it)
      R.buildShoreLayer = function () { if (!this.shoreLayer || this.shoreLayer.width !== 1) { this.shoreLayer = document.createElement('canvas'); this.shoreLayer.width = this.shoreLayer.height = 1; } };
      R.blitShore = noop; R.drawLivingWater = noop;
      R.drawTileAt = function () { self._pend = true; return O.drawTileAt.apply(this, arguments); };
      R.drawTilesAt = function () { self._pend = true; return O.drawTilesAt.apply(this, arguments); };
      this._painted = true;
    },
    hook() {
      if (this._hooked) return; this._hooked = true;
      const self = this, orig = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img) {
        if (self.on && img === R.terrainCache && arguments.length === 3) {
          // nothing is drawn in the black: the chunks run past the board's edge (a map is not a
          // whole number of chunks), so the ground and the water life are clipped to the board
          const b = R.boardPx(); this.save(); this.beginPath(); this.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); this.clip();
          try { if (self.ready) { if (self._pend) { self._pend = false; self.noteEdit(); } self.drawGround(this); } else self.drawStandIn(this); } finally { this.restore(); }
        }
        return orig.apply(this, arguments);
      };
    },
    // until the core is ready: the flat stand-in for whatever is in view
    drawStandIn(g) {
      if (!this.thumb) return; const span = CH * TL, L = CH * LT, sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = true;
      for (const [cx, cy] of this.viewChunks(0)) g.drawImage(this.thumb, cx * L, cy * L, L, L, cx * span, cy * span, span, span);
      g.imageSmoothingEnabled = sm;
    },
    // ---- the real game: a run founded or loaded ---------------------------------------------
    // everything the core needs, built a step per task so whatever screen is up keeps moving;
    // the shade waits (briefly) for the forest art so trees throw their shadows from the start
    activate(opt) {
      if (opt) this.opt = opt; this.opt = this.opt || {};
      this.setPainters(true); this.hook();
      const gen = this._actGen = (this._actGen | 0) + 1, t0 = performance.now();
      this.ready = false; this.on = true; this.stopWorkers(); this.releaseAll();
      this.paintThumbBase();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const art = () => (window.Assets && Assets.whenWorldIdle && !(Assets.worldReady && Assets.worldReady())) ? Promise.race([Assets.whenWorldIdle(), wait(8000)]) : Promise.resolve();
      const steps = [
        () => { this.seed = 0; const s = String(S.seed || ''); for (let i = 0; i < s.length; i++) this.seed = (Math.imul(this.seed, 31) + s.charCodeAt(i)) | 0; this.buildSDF(); },
        () => this.buildFields(),
        () => art(),
        () => this.buildShade(),
        () => { this.core = this.core || TCCore(); this.core.setWorld(this.world()); },
        () => { this.startWorkers(); this.snapshot(); if (!this.caus) this.makeCaustics(); if (!this.rip) this.makeRipples(); this.ready = true; this.stats.prep = performance.now() - t0; },
      ];
      return (async () => { for (const st of steps) { if (gen !== this._actGen) return false; await st(); await wait(0); } return true; })();
    },
    deactivate() {
      this._actGen = (this._actGen | 0) + 1; this.on = false; this.ready = false;
      this.stopWorkers(); this.releaseAll(); this.setPainters(false);
    },
    stopWorkers() { for (const w of this.workers) w.terminate(); this.workers = []; this.pending.clear(); this._arrive = []; },
    releaseAll() { for (const c of this.chunks.values()) this.release(c); this.chunks.clear(); this.dirty.clear(); this.gen.clear(); this._warmQ = null; this._warmDone = false; this._th = new Set(); this._lifeKey = this._kA = this._kB = this._lifeBK = null; this._lifeBox = null; },

    install(opt) {
      this.opt = opt || {};
      this.setPainters(true);
      R.rebuildTerrain();
      this.rebuildAll();
      this.hook();
      this.on = true; this.ready = true;
    },
  };
})();
