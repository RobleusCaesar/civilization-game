/* =========================================================================
   THE GOLD THAT SAYS "THIS ONE", AND "WELL DONE"          (js/goldfx.js)
   tests/ground-ring.mjs, its gold half — operator, build 198: "We want the
   buildings to almost be shimmering gold around them with the flakes
   looking like they're rising up into the sky, same with the villagers, the
   ring should be tied around them, high pixel, high animation, lots of
   images in the Sprite we want the player to feel almost compelled to touch
   … when the building or the character is selected, you should get a
   really nice feedback with a little burst of gold maybe at the base or
   around the building. And when you're doing an upgrade on a building or a
   character we also want a nice little gold pop when they are finished and
   pop into existence."

   Three moments, one gold (R.GRING's ring is the ground they stand on):
     THE GUIDE'S SHIMMER  the journey's chosen one (R.gringGuide): its own
                          silhouette haloed in gold light and rimmed from
                          within, a sheen running across it now and then,
                          sparkles winking on its edges, gold leaf tumbling
                          up off its ring and its roof into the sky — and
                          round a man two lights winding up round him, behind
                          him and in front, so the ring is tied round him.
     THE TAKING           anything of the player's taken in hand (a crowd of
                          more than R.GRING.glintMax is calm): it gives — a
                          squash and a spring at its foot — its outline
                          flashes gold, a flash and a ring roll out over the
                          ground at its base, and sparks and leaf leap off it.
     THE POP              a work finished or a storey raised, a villager or a
                          soldier out of the yard, a soldier risen a rank: it
                          springs into its place in a flash of gold, two rings
                          roll out across the ground, sparks fly and leaf
                          drifts up (no rays standing behind a work: warm
                          light fanned off a roof reads as flames, and fire is
                          the town's one alarm) — once, the first time
                          it is drawn (a card's act holding its old look
                          first: R._cardHeld, R.cardVeil), and never for the
                          rival.
   ALL OF IT A PICTURE: a pure function of the render clock and the thing's
   id (two draws at one clock are one picture), no RNG, nothing in S or a
   save, clipped to the board, drawn at the device's own pixels in the gold
   the rings wear — light with its hue tied to its lift (R.FX_TIE), gold leaf
   opaque and SHRINKING away, never thinned over the meadow. Under reduced
   motion nothing moves: the guide keeps a still halo, nothing bursts or
   pops. A silhouette is measured once per picture (an LRU of its masks) at
   a work size well under the picture's, since a halo is never finer than
   its own blur. A cached older render.js stands this file down: every hook
   guards on the method it calls. */
const GoldFX = {
  ON: true,
  C: {
    // ---- THE SILHOUETTE: a halo out of its own outline, a rim of light inside it
    haloB: 4.4,  haloU: 2.9,                 // world px the halo reaches past a building's / a man's outline
    rimB: 1.25,  rimU: 0.95,                 // world px the rim lies in from the edge
    haloLift: 0.9, rimLift: 0.95,            // their lift at full strength (the halo's at the outline)
    workHalo: 110, workRim: 150,             // the masks' grids: at most this many cells a side
    silPerFrame: 1,                          // new silhouettes measured in one frame (a second waits a frame)
    breathMin: 0.66,                         // the halo's lift at the low of a breath, a share of its high
    // ---- THE GUIDE'S SHIMMER
    sheenS: 2.6, sheenRun: 0.95, sheenW: 0.34, sheenLift: 0.62,   // a sheen every sheenS s, crossing in sheenRun
    flakes: { b: 24, u: 14, t: 13 },         // gold leaf rising off the ring at once
    roof: 11,                                // …and off a building's roofline (more of it)
    rise: { b: 2.5, u: 1.9, t: 1.6 },        // tiles a leaf climbs
    life: [1.8, 2.9],                        // s a leaf's climb
    leaf: { b: [4.4, 7.4], u: [3.6, 5.8], t: [3.6, 6.0] },   // CSS px a leaf is long (× the zoom's share)
    sparks: { b: 6, u: 3, t: 0 },            // sparkles winking on the outline at once
    orbit: 2, orbitS: 2.2, orbitTurns: 1.5,  // the lights winding up round a man: how many, s a climb, turns a climb
    // ---- THE TAKING
    selFlash: 0.6,                           // s the outline's flash lasts
    bounce: { b: 0.07, u: 0.1 }, bounceS: 0.5,   // the give: its depth and how long it rings
    burstS: 1.05,                            // s the burst flies (R.GRING.burstS follows it)
    // ---- THE POP
    popS: { build: 1.7, up: 1.7, train: 1.25, rank: 1.6 },
    popWait: 2.2,                            // s a pop waits to be drawn before it is let go
    popMax: 24,
  },
  // gold leaf dark to hot (its edge, its shaded face, its lit face, its flare, the glint), the rim's light, the sheen's, a trail's
  TONE: { leaf: ['#b87a1c', '#dca23a', '#f6c454', '#ffe596', '#fffaea'], rim: '#ffdc84', sheen: '#fff0c4', trail: ['#d8962e', '#f6c050', '#fff0c0'] },

  /* ----------------------------------------------------------------------
     THE SILHOUETTE — measured once per picture: its alpha on a coarse grid,
     blurred out (the halo) and in (the rim), each laid into its own canvas
     in the light's two passes; and the points round its outline the
     sparkles wink on and the leaf rises off. A picture the canvas may not
     read (a page from disk) has none: the ring and its leaf stand alone. */
  _silC: new Map(),
  /* ONE NEW SILHOUETTE A FRAME (R.draw opens each frame with frameStart):
     measuring a picture reads its pixels back, a few ms on a phone, and a
     group taken in hand or a man walking through his frames asks for one a
     picture — so a second waits a frame (its halo lands 16 ms later, which
     nobody sees) and no frame pays for a crowd. Unlimited until a frame
     opens: a cached older render.js that never calls frameStart keeps
     every silhouette as it was. */
  _silBudget: 1e9,
  frameStart() { this._silBudget = this.C.silPerFrame; },
  sil(img, haloPx, rimPx) {
    if (!img || !(img.width > 1) || !(img.height > 1)) return null;
    const key = Math.round(haloPx * 4) + '|' + Math.round(rimPx * 4);
    let e = this._silC.get(img);
    if (e) { this._silC.delete(img); this._silC.set(img, e); if (key in e) return e[key]; }
    if (this._silBudget <= 0) return null;
    this._silBudget--;
    if (!e) {
      e = {}; this._silC.set(img, e);
      if (this._silC.size > 18) this._silC.delete(this._silC.keys().next().value);
    }
    let s = null;
    try { s = this._build(img, haloPx, rimPx); } catch (err) { s = null; }
    e[key] = s;
    return s;
  },
  _scr: null,
  _scratch(w, h) {
    const c = this._scr || (this._scr = document.createElement('canvas'));
    if (c.width < w) c.width = w;
    if (c.height < h) c.height = h;
    return c;
  },
  // the picture's alpha on a grid k of its size, padded by p cells a side
  _grid(img, k, p) {
    const gw = Math.max(2, Math.round(img.width * k)), gh = Math.max(2, Math.round(img.height * k));
    const W = gw + 2 * p, H = gh + 2 * p;
    const c = this._scratch(W, H), x = c.getContext('2d', { willReadFrequently: true });
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.clearRect(0, 0, W, H);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(img, p, p, gw, gh);
    const d = x.getImageData(0, 0, W, H).data, A = new Float32Array(W * H);
    for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3] / 255;
    return { A, W, H, p, gw, gh };
  },
  // three box passes (a near-gaussian of about σ = r), the grid's padding keeping the edge clear
  _blur(A, W, H, r) {
    r = Math.max(1, Math.round(r));
    const n = 2 * r + 1, out = Float32Array.from(A), tmp = new Float32Array(A.length);
    for (let pass = 0; pass < 3; pass++) {
      // along the rows: out → tmp
      for (let y = 0; y < H; y++) {
        const o = y * W;
        let s = 0;
        for (let x = 0; x <= r && x < W; x++) s += out[o + x];
        for (let x = 0; x < W; x++) {
          tmp[o + x] = s / n;
          if (x + r + 1 < W) s += out[o + x + r + 1];
          if (x - r >= 0) s -= out[o + x - r];
        }
      }
      // down the columns: tmp → out
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = 0; y <= r && y < H; y++) s += tmp[y * W + x];
        for (let y = 0; y < H; y++) {
          out[y * W + x] = s / n;
          if (y + r + 1 < H) s += tmp[(y + r + 1) * W + x];
          if (y - r >= 0) s -= tmp[(y - r) * W + x];
        }
      }
    }
    return out;
  },
  _canvas(W, H, fill) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d'), im = x.createImageData(W, H);
    fill(im.data);
    x.putImageData(im, 0, 0);
    return c;
  },
  _build(img, haloPx, rimPx) {
    const C = this.C, T = R.LIGHT.TONE.gold, K = R.FX_TIE;
    const rgb = c => R._fxRgb(c);
    // the HALO, out of the outline: soft, so a coarse grid serves
    const kH = Math.min(1, C.workHalo / Math.max(img.width, img.height));
    const hg = this._grid(img, kH, Math.ceil(haloPx * kH * 2.4) + 3);
    const hb = this._blur(hg.A, hg.W, hg.H, Math.max(1, haloPx * kH * 0.6));
    const hue = rgb(T.hue), lift = rgb(T.ramp[2]), cream = rgb(T.ramp[3]);
    /* a BAND of light hugging the outline, its outer foot quick: the blur's
       long soft tail, all hue and no light, read as a brown smear round the
       house (the amber band R.FX_TIE warns of) — so the profile is the
       blur's smoothstep between a low and a high, bright across its width */
    const HV = new Float32Array(hb.length);
    for (let i = 0; i < hb.length; i++) { const u = Math.max(0, Math.min(1, (hb[i] - 0.05) / 0.5)); HV[i] = u * u * (3 - 2 * u); }
    const haloHue = this._canvas(hg.W, hg.H, d => {
      for (let i = 0; i < HV.length; i++) { const o = i * 4; d[o] = hue[0]; d[o + 1] = hue[1]; d[o + 2] = hue[2]; d[o + 3] = Math.round(255 * Math.min(1, K * HV[i] * C.haloLift)); }
    });
    const haloLift = this._canvas(hg.W, hg.H, d => {
      for (let i = 0; i < HV.length; i++) {
        const o = i * 4, v = HV[i], k = Math.min(1, v * 1.4);
        d[o] = lift[0] + (cream[0] - lift[0]) * k; d[o + 1] = lift[1] + (cream[1] - lift[1]) * k; d[o + 2] = lift[2] + (cream[2] - lift[2]) * k;
        d[o + 3] = Math.round(255 * v * C.haloLift);
      }
    });
    // the RIM, in from the outline: finer
    const kR = Math.min(1, C.workRim / Math.max(img.width, img.height));
    const rg = this._grid(img, kR, Math.ceil(rimPx * kR * 2) + 3);
    const rb = this._blur(rg.A, rg.W, rg.H, Math.max(1, rimPx * kR));
    const rc = rgb(this.TONE.rim);
    const rim = this._canvas(rg.W, rg.H, d => {
      for (let i = 0; i < rb.length; i++) {
        const o = i * 4, v = rg.A[i] * Math.min(1, 2.1 * (1 - rb[i]));
        d[o] = rc[0]; d[o + 1] = rc[1]; d[o + 2] = rc[2]; d[o + 3] = Math.round(255 * Math.max(0, v) * C.rimLift);
      }
    });
    /* the OUTLINE's points (where the sparkles wink, and the roofline the leaf
       rises off): a cell of the picture beside one that is not, the farthest
       from its middle in each of 28 directions, and the topmost few */
    const W = rg.W, H = rg.H, A = rg.A;
    let mx = 0, my = 0, mn = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A[y * W + x] >= 0.5) { mx += x; my += y; mn++; }
    if (!mn) return null;
    mx /= mn; my /= mn;
    const NB = 28, best = new Array(NB).fill(null), cols = new Map();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (A[i] < 0.5 || (A[i - 1] >= 0.5 && A[i + 1] >= 0.5 && A[i - W] >= 0.5 && A[i + W] >= 0.5)) continue;
      const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy, bk = Math.floor(((Math.atan2(dy, dx) / (Math.PI * 2)) + 1) % 1 * NB);
      if (!best[bk] || d2 > best[bk].d2) best[bk] = { x, y, d2 };
      const cb = Math.floor((x - rg.p) / Math.max(1, rg.gw / 12));
      const t = cols.get(cb);
      if (!t || y < t.y) cols.set(cb, { x, y });
    }
    const norm = (x, y) => {
      const i = y * W + x, gx = rb[i + 1] - rb[i - 1], gy = rb[i + W] - rb[i - W], l = Math.hypot(gx, gy) || 1;
      return [-gx / l, -gy / l];
    };
    const uv = (x, y) => [(x - rg.p + 0.5) / rg.gw, (y - rg.p + 0.5) / rg.gh];
    const edge = best.filter(Boolean).map(p => uv(p.x, p.y).concat(norm(p.x, p.y)));
    // the roofline: the top of each column band, in its upper part only
    const ys = [...cols.values()].map(p => p.y).sort((a, b) => a - b), cut = ys.length ? ys[Math.floor(ys.length * 0.6)] : 0;
    const top = [...cols.values()].filter(p => p.y <= cut).map(p => uv(p.x, p.y));
    return {
      halo: { hue: haloHue, lift: haloLift, p: hg.p, gw: hg.gw, gh: hg.gh, W: hg.W, H: hg.H },
      rim: { c: rim, p: rg.p, gw: rg.gw, gh: rg.gh, W: rg.W, H: rg.H },
      edge, top: top.length ? top : edge.filter(e => e[1] < 0.5),
    };
  },
  // a thing's silhouette at the size it is drawn (pic: {img, x, y, w, h} world px; kind 'b' or 'u')
  silOf(pic, kind) {
    if (!pic || !pic.img || !(pic.w > 0)) return null;
    const px = pic.img.width / pic.w, C = this.C;
    return this.sil(pic.img, (kind === 'u' ? C.haloU : C.haloB) * px, (kind === 'u' ? C.rimU : C.rimB) * px);
  },
  // where a grid's canvas lands for a pic
  _at(gr, pic) {
    const kx = pic.w / gr.gw, ky = pic.h / gr.gh;
    return [pic.x - gr.p * kx, pic.y - gr.p * ky, gr.W * kx, gr.H * ky];
  },
  // THE HALO behind it: light out of its outline, its hue tied to its lift (R.FX_TIE)
  halo(g, S, pic, a) {
    if (!S || !(a > 0.01)) return;
    const [x, y, w, h] = this._at(S.halo, pic);
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.globalCompositeOperation = 'color';
    if (g.globalCompositeOperation === 'color') { g.globalAlpha = Math.min(1, a * 1.15); g.drawImage(S.halo.hue, x, y, w, h); }
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = Math.min(1, a);
    g.drawImage(S.halo.lift, x, y, w, h);
    g.restore();
  },
  // THE RIM over it: its own edge lit gold from within (it lies on its own pixels, never the meadow)
  rim(g, S, pic, a) {
    if (!S || !(a > 0.01)) return;
    const [x, y, w, h] = this._at(S.rim, pic);
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = Math.min(1, a);
    g.drawImage(S.rim.c, x, y, w, h);
    g.restore();
  },
  /* THE SHEEN: a band of light running across it, lower left to upper
     right, every sheenS s — laid on its own pixels alone (the picture's
     alpha, cut in a scratch at the device's pixels) */
  _sh: null,
  sheen(g, pic, t, a, seed) {
    const C = this.C;
    const ph = (((t + (seed % 97) * 0.173) % C.sheenS) + C.sheenS) % C.sheenS / C.sheenRun;
    if (!(ph >= 0 && ph < 1) || !(a > 0.01)) return;
    const m = g.getTransform();
    const X = m.a * pic.x + m.c * pic.y + m.e, Y = m.b * pic.x + m.d * pic.y + m.f, W = m.a * pic.w, H = m.d * pic.h;
    if (!(W > 2 && H > 2) || W > 4096 || H > 4096) return;
    const cw = Math.ceil(W) + 2, ch = Math.ceil(H) + 2;
    const c = this._sh || (this._sh = document.createElement('canvas'));
    if (c.width < cw || c.height < ch) { c.width = Math.max(c.width, cw); c.height = Math.max(c.height, ch); }
    const x = c.getContext('2d'), ox = X - Math.floor(X), oy = Y - Math.floor(Y);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.clearRect(0, 0, cw, ch);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(pic.img, ox, oy, W, H);
    x.globalCompositeOperation = 'source-in';
    // the band's middle runs from past the lower left corner to past the upper right
    const e = ph * ph * (3 - 2 * ph), d = Math.hypot(W, H), ux = W / d, uy = -H / d;
    const cx = ox - W * 0.25 + W * 1.5 * e, cy = oy + H * 1.25 - H * 1.5 * e, bw = d * C.sheenW / 2;
    const gr = x.createLinearGradient(cx - ux * bw, cy - uy * bw, cx + ux * bw, cy + uy * bw);
    const s = R._fxRgb(this.TONE.sheen), o = R._fxRgb(R.LIGHT.TONE.gold.ramp[1]);
    const col = (c, k) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + k + ')';
    const L = C.sheenLift * Math.sin(Math.PI * Math.min(1, ph * 1.15));
    // a broad gold band with a narrow hot core: the light of a sheen on gilding, never a white haze
    gr.addColorStop(0, col(o, 0)); gr.addColorStop(0.22, col(o, 0.3 * L)); gr.addColorStop(0.42, col(o, 0.62 * L));
    gr.addColorStop(0.5, col(s, L)); gr.addColorStop(0.58, col(o, 0.62 * L)); gr.addColorStop(0.78, col(o, 0.3 * L)); gr.addColorStop(1, col(o, 0));
    x.fillStyle = gr;
    x.fillRect(0, 0, cw, ch);
    x.globalCompositeOperation = 'source-over';
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = Math.min(1, a);
    g.drawImage(c, 0, 0, cw, ch, Math.floor(X), Math.floor(Y), cw, ch);
    g.restore();
  },

  /* ----------------------------------------------------------------------
     GOLD LEAF — a flake of beaten gold, tumbling as it climbs: as it turns
     square to the sun its face flares bright and a glint winks off it,
     edge-on it is a sliver of its dark rim. OPAQUE (gold thinned over the
     meadow goes brown), grows in and SHRINKS away. Device px. */
  _zs() { const z = (R.cam && R.cam.z) || 1; return Math.max(0.8, Math.min(1.3, 0.62 + 0.24 * z)) * (R.dpr || 1); },
  leaf(g, X, Y, len, tilt, flip, sh) {
    if (!(len > 0.6)) return;
    const c = Math.cos(flip), ac = Math.abs(c), w = len * (0.52 + 0.14 * sh) * Math.max(0.12, ac);
    const ux = Math.cos(tilt), uy = Math.sin(tilt), vx = -uy, vy = ux;
    const hl = len / 2, hw = w / 2, k = 0.18 * (sh - 0.5);
    // the leaf's four points, a little lopsided (beaten gold, not a cut gem)
    const ax = X + ux * hl, ay = Y + uy * hl, bx = X - ux * hl * (0.82 + 0.2 * sh), by = Y - uy * hl * (0.82 + 0.2 * sh);
    const px = X + vx * hw + ux * hl * k, py = Y + vy * hw + uy * hl * k;
    const qx = X - vx * hw * 0.92 - ux * hl * k, qy = Y - vy * hw * 0.92 - uy * hl * k;
    const L = this.TONE.leaf, lit = c > 0, edge = ac < 0.32;
    g.fillStyle = edge ? L[0] : lit ? L[2] : L[1];
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(px, py); g.lineTo(bx, by); g.closePath(); g.fill();
    g.fillStyle = edge ? L[1] : lit ? (ac > 0.8 ? L[4] : L[3]) : L[2];
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(qx, qy); g.lineTo(bx, by); g.closePath(); g.fill();
    // the glint as it turns square to the sun
    if (lit && ac > 0.88) {
      const s = len * 0.95 * (ac - 0.88) / 0.12, t = Math.max(0.55, s * 0.13);
      g.fillStyle = L[4];
      g.beginPath(); g.moveTo(X - s, Y); g.lineTo(X, Y - t); g.lineTo(X + s, Y); g.lineTo(X, Y + t); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(X, Y - s); g.lineTo(X + t, Y); g.lineTo(X, Y + s); g.lineTo(X - t, Y); g.closePath(); g.fill();
    }
  },
  /* THE LEAF RISING off ring q (and off a building's roofline, its pic's
     outline top) — `side` 'back': those whose foot is on the ring's far side
     (drawn before what stands in it, so they climb behind it and come out
     over its roof), 'front': the near ones and the roof's. Each on its own
     loop, a fresh place every climb. */
  flakes(g, q, pic, S, o, kind, side) {
    const C = this.C, TL = CFG.TILE, a = o.a == null ? 1 : o.a, t = o.t || 0, seed = (o.seed || 0) + 11, sc = o.s || 1;
    if (!(a > 0.02)) return;
    const n = C.flakes[kind] || 0, roofN = kind === 'b' && S && S.top && S.top.length && pic ? C.roof : 0;
    const rise = (C.rise[kind] || 2) * TL, LL = C.leaf[kind] || C.leaf.u, H = R._fxHash.bind(R);
    const m = g.getTransform(), zs = this._zs();
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n + roofN; i++) {
      const roof = i >= n;
      if (roof && side !== 'front') continue;
      const h0 = H(i, seed + 101), h1 = H(seed + 37, i), h2 = H(i + 71, seed);
      const life = C.life[0] + (C.life[1] - C.life[0]) * h1;
      const run = t / life + h0, cyc = Math.floor(run), ph = run - cyc;
      const hs = H(i * 131 + cyc, seed + 7), hs2 = H(cyc + 9, i * 17 + seed);
      let x0, y0;
      if (!roof) {
        const ang = hs * Math.PI * 2, sn = Math.sin(ang);
        if ((sn < 0) !== (side === 'back')) continue;
        const rr = 0.45 + 0.6 * hs2;
        x0 = q.cx + Math.cos(ang) * q.rx * sc * rr; y0 = q.cy + sn * q.ry * sc * rr;
      } else {
        const p = S.top[Math.floor(hs * S.top.length) % S.top.length];
        x0 = pic.x + p[0] * pic.w + (hs2 - 0.5) * TL * 0.2; y0 = pic.y + p[1] * pic.h + TL * 0.06;
      }
      // grows in, climbs fast off the ground and drifts at the top, shrinks away
      const k = Math.min(1, ph / 0.1) * Math.min(1, (1 - ph) / 0.42);
      if (k < 0.06) continue;
      const up = (1 - Math.pow(1 - ph, 1.7)) * rise * (0.6 + 0.55 * h2) * (roof ? 0.78 : 1);
      const sway = Math.sin(ph * (4.4 + 2.2 * h1) + i * 1.9) * TL * (0.07 + 0.1 * h2) * Math.min(1, ph * 3);
      const x = x0 + sway + (x0 - q.cx) * 0.22 * ph, y = y0 - up;
      const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
      const len = (LL[0] + (LL[1] - LL[0]) * h2) * k * zs;
      this.leaf(g, X, Y, len, Math.sin(t * (1.1 + h0) + i) * 0.9 + h2 * 3, t * (4.6 + 4.2 * h1) + i * 2.3, h0);
    }
    g.restore();
  },
  /* THE LIGHTS TIED ROUND A MAN: two motes winding up round him from his
     soles to over his head, a tapered trail behind each — behind his body
     on the far side, in front on the near (side 'back' / 'front') */
  orbit(g, q, pic, o, side) {
    const C = this.C, TL = CFG.TILE, a = o.a == null ? 1 : o.a, t = o.t || 0, seed = o.seed || 0;
    if (!(a > 0.02)) return;
    const bodyH = pic ? Math.max(TL * 0.6, (q.cy - pic.y) * 0.95) : TL * 0.85;
    const m = g.getTransform(), zs = this._zs(), ry = q.ry / q.rx;
    const pos = (i, ph) => {
      const th = (ph * C.orbitTurns + i / C.orbit) * Math.PI * 2 + seed * 0.7;
      const r = q.rx * (o.s || 1) * (1.06 - 0.3 * ph), z = ph * bodyH * 1.08;
      const x = q.cx + Math.cos(th) * r, y = q.cy + Math.sin(th) * r * ry - z;
      return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f, Math.sin(th)];
    };
    const T = this.TONE.trail;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineCap = 'round';
    for (let i = 0; i < C.orbit; i++) {
      const ph0 = (((t / C.orbitS + i / C.orbit + seed * 0.071) % 1) + 1) % 1;
      const env = ph => Math.min(1, ph / 0.12) * Math.min(1, (1 - ph) / 0.28);
      const N = 18, step = 0.012;
      let prev = null;
      for (let k = N; k >= 0; k--) {
        const ph = ph0 - k * step;
        if (ph < 0) { prev = null; continue; }
        const p = pos(i, ph);
        if (prev) {
          const back = (p[2] + prev[2]) < 0, f = 1 - k / N, e = env(ph0) * a;
          if (back === (side === 'back') && e > 0.04) {
            g.strokeStyle = f > 0.7 ? T[2] : f > 0.35 ? T[1] : T[0];
            g.lineWidth = Math.max(0.5, (0.35 + 1.9 * f * f) * zs * e);
            g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke();
          }
        }
        prev = p;
      }
      // the head: a bead of light, a glint on it now and then
      const hp = pos(i, ph0), e = env(ph0) * a;
      if ((hp[2] < 0) === (side === 'back') && e > 0.04) {
        g.fillStyle = this.TONE.leaf[4];
        g.beginPath(); g.arc(hp[0], hp[1], 1.45 * zs * e, 0, Math.PI * 2); g.fill();
        const tw = Math.max(0, Math.sin(t * 5.1 + i * 2.4 + seed));
        if (tw > 0.55) {
          const s = 4.2 * zs * e * (tw - 0.55) / 0.45, w = Math.max(0.55, s * 0.12);
          g.beginPath(); g.moveTo(hp[0] - s, hp[1]); g.lineTo(hp[0], hp[1] - w); g.lineTo(hp[0] + s, hp[1]); g.lineTo(hp[0], hp[1] + w); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(hp[0], hp[1] - s); g.lineTo(hp[0] + w, hp[1]); g.lineTo(hp[0], hp[1] + s); g.lineTo(hp[0] - w, hp[1]); g.closePath(); g.fill();
        }
      }
    }
    g.restore();
  },
  // SPARKLES winking on its outline (world px, R.fxSpark), each on its own loop and place
  sparkles(g, S, pic, o, n) {
    if (!S || !S.edge.length || !(n > 0)) return;
    const a = o.a == null ? 1 : o.a, t = o.t || 0, seed = (o.seed || 0) + 5, H = R._fxHash.bind(R), TL = CFG.TILE;
    const z = Math.max(0.85, Math.min(1.25, 0.65 + 0.22 * ((R.cam && R.cam.z) || 1)));
    for (let j = 0; j < n; j++) {
      const h0 = H(j, seed), h1 = H(seed + 19, j), T = 1.25 + 0.9 * h1;
      const run = t / T + h0, cyc = Math.floor(run), ph = run - cyc;
      if (ph > 0.5) continue;
      const env = Math.sin(ph / 0.5 * Math.PI);
      const p = S.edge[Math.floor(H(j * 7 + cyc, seed + 3) * S.edge.length) % S.edge.length];
      const x = pic.x + p[0] * pic.w + p[2] * TL * 0.05, y = pic.y + p[1] * pic.h + p[3] * TL * 0.05;
      R.fxSpark(g, x, y, (4.2 + 2.8 * h1) * env * z, a * Math.min(1, env * 1.4), 'gold', { rot: (h0 - 0.5) * 0.6, diag: env > 0.75 });
    }
  },

  /* ----------------------------------------------------------------------
     THE BURST: sparks leaping off ring q and falling back, leaf lifting off
     it, a flash and a ring of light rolling out over the ground — `age` s
     into it, n sparks (a crowd taken at once throws fewer each); `side`
     'back' (the ground's light and the sparks on its far side, before what
     stands in it), 'front' (the rest, after it) or none (all of it, after:
     R.drawGRingBurst's own callers). `big` a pop's: wider, higher, longer. */
  burst(g, q, age, seed, n, side, big) {
    const TL = CFG.TILE, dur = this.C.burstS * (big ? 1.3 : 1), p = age / dur;
    if (!(p >= 0 && p < 1) || !(n > 0) || R._gStill()) return;
    const back = side !== 'front', front = side !== 'back', H = R._fxHash.bind(R), ry = q.ry / q.rx, K = big ? 1.35 : 1;
    g.save();
    R._gClip(g);
    if (back) {
      /* the flash at its foot — a flare where it stands, never a pool across
         the meadow (the house style: keep a flat one small) — and the rings
         rolling out over the ground, a tile or so past its own (the body
         over their far arcs) */
      const fr = Math.min(q.rx, TL * 0.8);
      if (age < 0.26) R.fxGlow(g, q.cx, q.cy, fr * (0.95 + 0.45 * age / 0.26), 0.8 * Math.pow(1 - age / 0.26, 1.4), 'gold', { squash: ry, core: 0.24, soft: 2.3 });
      const e1 = 1 - Math.pow(1 - Math.min(1, age / 0.5), 2.6), e2 = 1 - Math.pow(1 - Math.min(1, Math.max(0, age - 0.07) / 0.72), 2.2);
      if (age < 0.5) R.fxRing(g, q.cx, q.cy, q.rx + TL * 1.05 * K * e1, 0.85 * (1 - e1), 'gold', { css: 2.1, squash: ry });
      if (age > 0.07 && age < 0.79) R.fxRing(g, q.cx, q.cy, q.rx + TL * 0.7 * K * e2, 0.5 * (1 - e2), 'gold', { css: 1.4, squash: ry });
    }
    const m = g.getTransform(), zs = this._zs();
    const dev = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    // the sparks: thrown out and up off the ring, burning down as they reach the top of their climb
    const grav = TL * 9.5;
    const at = (i, ag) => {
      const h0 = H(i, seed), h1 = H(seed + 7, i), h2 = H(i + 13, seed + 5);
      const ang = (i + 0.5 * h0) / n * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
      const vo = ((1.0 + 1.4 * h1) * TL + 0.6 * q.rx) * K, vz = (2.6 + 2.2 * h2) * TL * (big ? 1.2 : 1);
      const dd = vo * ag * Math.exp(-ag * 0.9), zz = Math.max(0, vz * ag - 0.5 * grav * ag * ag);
      return [q.cx + c * (q.rx + dd), q.cy + sn * (q.ry + dd * ry) - zz, sn, h2];
    };
    const L = this.TONE.leaf, k = Math.min(1, (0.8 - p) / 0.36, age / 0.04);
    // a star among them every third, turning (R.fxSpark, in the world's own units)…
    if (k >= 0.05) for (let i = 2; i < n; i += 3) {
      const [x, y, sn, h2] = at(i, age);
      if ((sn < 0) ? !back : !front) continue;
      R.fxSpark(g, x, y, (3.4 + 2.2 * h2) * k * (big ? 1.2 : 1), 1, 'gold', { rot: age * 5 + i, diag: k > 0.6 });
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // …and the rest a comet: a hot head, a sliver of gold tapering back to where it was a breath ago
    if (k >= 0.05) for (let i = 0; i < n; i++) {
      if (i % 3 === 2) continue;
      const [x, y, sn] = at(i, age);
      if ((sn < 0) ? !back : !front) continue;
      const b0 = at(i, Math.max(0, age - 0.04)), [X, Y] = dev(x, y), [X0, Y0] = dev(b0[0], b0[1]);
      this.streak(g, X0, Y0, X, Y, Math.max(0.9, 2.1 * zs * k));
    }
    // the leaf: lifted off the ring, drifting up slowly, tumbling, shrinking away
    const nl = Math.max(2, Math.round(n * (big ? 0.75 : 0.55)));
    for (let i = 0; i < nl; i++) {
      const h0 = H(i + 300, seed), h1 = H(seed + 300, i), h2 = H(i + 333, seed + 3);
      const ang = (i + 0.7 * h0) / nl * Math.PI * 2, sn = Math.sin(ang);
      if ((sn < 0) ? !back : !front) continue;
      const kl = Math.min(1, age / 0.12) * Math.min(1, (1 - p) / 0.5);
      if (kl < 0.06) continue;
      const rr = 0.7 + 0.5 * h1, up = (1 - Math.exp(-age * 2.4)) * TL * (0.9 + 1.1 * h2) * K;
      const x = q.cx + Math.cos(ang) * q.rx * rr * (1 + 0.5 * p) + Math.sin(age * 4 + i) * TL * 0.08, y = q.cy + sn * q.ry * rr - up;
      const [X, Y] = dev(x, y);
      this.leaf(g, X, Y, (3.6 + 2.6 * h2) * zs * kl * (big ? 1.15 : 1), h1 * 6 + age * 2, age * (6 + 5 * h1) + i * 1.7, h0);
    }
    g.restore();
  },
  // a spark in flight (device px): a sliver of gold from its tail to a head w wide, the head white-hot
  streak(g, X0, Y0, X, Y, w) {
    const dx = X - X0, dy = Y - Y0, L = Math.hypot(dx, dy), hw = w / 2, T = this.TONE.leaf;
    if (L > 0.75) {
      const nx = -dy / L * hw, ny = dx / L * hw;
      g.fillStyle = T[2];
      g.beginPath(); g.moveTo(X0, Y0); g.lineTo(X + nx, Y + ny); g.lineTo(X - nx, Y - ny); g.closePath(); g.fill();
    }
    g.fillStyle = T[4];
    g.beginPath(); g.arc(X, Y, hw * 0.95, 0, Math.PI * 2); g.fill();
  },

  /* ----------------------------------------------------------------------
     THE TAKING, AND THE POP, AS R ASKS FOR THEM (R.gringUnder / gringOver /
     the building and unit passes) */
  // is the hand calm (a crowd in hand throws less and gives not at all)?
  _calm() { return !R._gSel || R._gSel.size <= R.GRING.glintMax; },
  // the pops waiting to be drawn, or playing: 'b'+id / 'u'+id → { type, made, t0 }
  _pops: new Map(),
  _now() { return performance.now() / 1000; },
  _popSet(k, type) {
    if (!this.ON) return;
    this._pops.delete(k);
    this._pops.set(k, { type, made: this._now(), t0: null });
    while (this._pops.size > this.C.popMax) this._pops.delete(this._pops.keys().next().value);
  },
  popBld(b, type) { if (b && b.owner === 'P') this._popSet('b' + b.id, type || 'build'); },
  popUnit(u, type) { if (u && u.owner === 'P') this._popSet('u' + u.id, type || 'train'); },
  /* the pop of what R is drawing now ({ type, age, dur }), or null — its
     clock starts the first time it is drawn; one never drawn in popWait s is
     let go (a work finished off the view is news, not a pop), and so is one
     a card's act is drawing (Master Builders' raising, Enlightenment's beams:
     the act IS its pop — popDrop) */
  popDrop(k) { this._pops.delete(k); },
  popOf(k, now) {
    const r = this._pops.get(k);
    if (!r) return null;
    if (r.t0 == null) {
      if (R._gStill() || now - r.made > this.C.popWait || now < r.made - 1) { this._pops.delete(k); return null; }
      r.t0 = now;
    }
    const dur = this.C.popS[r.type] || 1.5, age = now - r.t0;
    if (age >= dur) { this._pops.delete(k); return null; }
    if (age < 0) return null;
    return { type: r.type, age, dur };
  },
  forget() { this._pops = new Map(); },
  /* the GIVE and the SPRING, at the thing's foot: { sx, sy } or null — the
     taking's squash and spring, a pop's spring into its place */
  zoom(r, now) {
    if (!r || R._gStill() || !this._inBoard(r)) return null;
    let sx = 1, sy = 1;
    const C = this.C;
    if (r.sl && r.selAge != null && r.selAge < C.bounceS && this._calm()) {
      const t = r.selAge, A = C.bounce[r.kind] || 0.06, w = Math.sin(t * 34) * Math.exp(-t * 9.5) * A;
      sy *= 1 - w; sx *= 1 + w * 0.55;
    }
    const pp = r.pop;
    if (pp) {
      const t = pp.age;
      if (pp.type === 'train') { const s = Math.max(0, 1 - Math.exp(-t * 11) * Math.cos(t * 19)); sy *= s; sx *= s; }
      else if (pp.type === 'rank') { const w = 0.17 * Math.exp(-t * 7) * Math.sin(t * 21); sy *= 1 + w; sx *= 1 - w * 0.5; }
      else { const s = 1 - 0.22 * Math.exp(-t * 8.5) * Math.cos(t * 21); sy *= s; sx *= 1 + (1 - s) * 0.45; }
    }
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return null;
    return { sx, sy };
  },
  /* NOTHING IN THE BLACK: the unit pass is not clipped to the board (a man
     at the rim may stand half over the black), and the spring and the flash
     are effects, so a man drawn over the board's edge — grown as far as any
     spring takes him — neither gives nor flashes. The building pass is
     clipped to the board, so a work needs no such care. */
  _inBoard(r) {
    if (r.kind !== 'u') return true;
    const p = r.pic;
    if (!p || !R.boardPx) return false;
    const b = R.boardPx(), K = 1.2, cx = p.x + p.w / 2, foot = p.y + p.h;
    return cx - p.w / 2 * K >= b.x0 && cx + p.w / 2 * K <= b.x1 && foot - p.h * K >= b.y0 && foot <= b.y1;
  },
  // the strength of the outline's flash now: the taking's, or a pop's
  _flashA(r) {
    let f = 0;
    if (r.sl && r.selAge != null && r.selAge < this.C.selFlash && this._calm()) f = Math.pow(1 - r.selAge / this.C.selFlash, 1.5);
    if (r.pop) f = Math.max(f, Math.pow(Math.max(0, 1 - r.pop.age / (r.pop.dur * 0.55)), 1.2));
    return f;
  },
  /* under what stands in the ring (r: R.gringUnder's record) */
  // its silhouette, measured only when something will hug it (a crowd taken at once measures nothing)
  _silFor(r) {
    if (!r.pic) return null;
    if (r._S === undefined) r._S = (r.o || r.pop || this._flashA(r) > 0.01) ? this.silOf(r.pic, r.kind === 'u' ? 'u' : 'b') : null;
    return r._S;
  },
  under(g, r, now) {
    if (!this.ON) return;
    const still = R._gStill(), o = r.o, S = this._silFor(r);
    g.save();
    R._gClip(g);
    // THE GUIDE: its halo breathing behind it, leaf climbing behind it, a light winding round behind him
    if (o) {
      const beat = still ? 1 : 0.5 + 0.5 * Math.sin((o.t / R.GRING.pulseS + (o.seed || 0) * 0.137) * Math.PI * 2);
      if (S) this.halo(g, S, r.pic, o.a * (still ? 0.8 : this.C.breathMin + (1 - this.C.breathMin) * beat));
      if (!still) {
        this.flakes(g, r.q, r.pic, S, o, r.kind || 't', 'back');
        if (r.kind === 'u') this.orbit(g, r.q, r.pic, o, 'back');
      }
    }
    if (!still) {
      // THE TAKING and THE POP: the outline flares, and the ground's light and the far sparks fly
      const f = this._flashA(r);
      if (S && f > 0.01) this.halo(g, S, r.pic, f * (r.pop ? 1.15 : 1));
      if (r.pop) this.popUnder(g, r, S);
      if (r.burst) this.burst(g, r.q, r.burst.age, r.seed, r.burst.n, 'back');
    }
    g.restore();
  },
  /* over it (after the body and its own pictures) */
  over(g, r, now) {
    if (!this.ON) return;
    const still = R._gStill(), o = r.o, S = this._silFor(r);
    g.save();
    R._gClip(g);
    if (o) {
      const beat = still ? 1 : 0.5 + 0.5 * Math.sin((o.t / R.GRING.pulseS + (o.seed || 0) * 0.137) * Math.PI * 2);
      if (S) this.rim(g, S, r.pic, o.a * (still ? 0.7 : 0.5 + 0.5 * beat));
      if (!still) {
        // (a sheen across a man is a wash over his whole body: his rim and the lights round him are his shimmer)
        if (S && r.pic && r.kind === 'b') this.sheen(g, r.pic, o.t, o.a, o.seed || 0);
        if (S) this.sparkles(g, S, r.pic, o, this.C.sparks[r.kind || 't'] || 0);
        this.flakes(g, r.q, r.pic, S, o, r.kind || 't', 'front');
        if (r.kind === 'u') this.orbit(g, r.q, r.pic, o, 'front');
      }
    }
    if (!still) {
      const f = this._flashA(r);
      if (S && f > 0.01) this.rim(g, S, r.pic, Math.min(1, f * 1.3));
      if (r.pop) this.popOver(g, r, S);
      if (r.burst) this.burst(g, r.q, r.burst.age, r.seed, r.burst.n, 'front');
    }
    g.restore();
  },
  /* THE POP's flash over its own picture: the thing drawn again in white
     gold, fading — inside R's spring, so it springs with it */
  flash(g, r, x, y, w, h) {
    if (!r || !r.pic || R._gStill() || !this._inBoard(r)) return;
    let f = 0;
    if (r.pop) f = Math.pow(Math.max(0, 1 - r.pop.age / 0.5), 1.6) * (r.pop.type === 'train' ? 1 : 0.85);
    if (r.sl && r.selAge != null && r.selAge < 0.22 && this._calm()) f = Math.max(f, 0.35 * (1 - r.selAge / 0.22));
    if (!(f > 0.01)) return;
    const img = R.tintOf(r.pic.img, '#fff1c4');
    g.save();
    g.globalAlpha = Math.min(1, f);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, x == null ? r.pic.x : x, y == null ? r.pic.y : y, w == null ? r.pic.w : w, h == null ? r.pic.h : h);
    g.restore();
  },
  /* a pop's light under it and its rings on the ground — no rays standing
     behind a work: fanned up off a roof over the meadow, warm light reads as
     flames, and a building in flames is the one alarm in the game */
  popUnder(g, r, S) {
    const p = r.pop, q = r.q, TL = CFG.TILE, ry = q.ry / q.rx;
    const work = p.type === 'build' || p.type === 'up';
    // the burst: bigger for a work, a man's own for a man
    this.burst(g, q, p.age, r.seed + 17, work ? 22 : 14, 'back', true);
    if (p.type === 'rank' || p.type === 'train') {
      // rings climbing up him: risen in rank, or out into the world
      for (let k = 0; k < 3; k++) {
        const t = p.age - k * 0.14;
        if (t < 0 || t > 0.7) continue;
        const e = t / 0.7, z = e * (q.cy - (r.pic ? r.pic.y : q.cy - TL)) * 1.02;
        R.fxRing(g, q.cx, q.cy - z, q.rx * (1.05 - 0.35 * e), 0.8 * (1 - e) * (p.type === 'rank' ? 1 : 0.7), 'gold', { css: 1.7, squash: ry });
      }
    }
  },
  popOver(g, r, S) {
    const p = r.pop, work = p.type === 'build' || p.type === 'up';
    this.burst(g, r.q, p.age, r.seed + 17, work ? 22 : 14, 'front', true);
    // stars winking on its outline as it lands
    if (S && r.pic && p.age < 1.1) this.sparkles(g, S, r.pic, { a: Math.min(1, (1.1 - p.age) / 0.4), t: p.age * 2.2, seed: r.seed + 41 }, work ? 6 : 3);
  },
};
window.GoldFX = GoldFX;
