"use strict";
/* Victory — "A New Dawn": the celebration scene. The mirror of js/defeatart.js:
   a handcrafted pixel canvas (400×300, CSS-upscaled), alive — smoke from warm
   chimneys, waving banners, villagers in the lanes. Exactly one fixed scene
   per difficulty, under one fixed sky: Calm a thriving hamlet at morning,
   Moderate a developed town at midday, Hard a fortified stronghold at a
   triumphant evening. No randomness, no landform — the poetic subtitle
   answers to the difficulty too.
   Second draft: double resolution, layered depth (far haze → near detail),
   textured timber/thatch/stone, and people with real limbs and jobs.

   A hand-authored picture SITS ON TOP of this: assets/endgame/win/{calm|
   moderate|hard}/*.png (assets/endgame/README.md). begin() picks one at
   random if the bucket has anything in it; draw() then shows that picture
   instead of the procedural scene, full stop — the procedural drawing above
   is only what's left when a difficulty has no art yet. */
const VictoryArt = {
  W: 400, H: 300,
  HI_W: 800, HI_H: 600,   // backing-store size while showing a real picture —
                           // big enough that the canvas's own `image-rendering:
                           // pixelated` CSS rule (index.html) doesn't crush a
                           // photo down to nearest-neighbour blocks

  TITLES: [
    'A NEW DAWN RISES',
    'THE VALLEY IS WON',
    'YOUR FIRE BURNS BRIGHT',
    'A CLAN OF LEGEND',
  ],
  // the positive mirror of the defeat subtitles — one small pool per difficulty
  SUB_BY_MODE: {
    calm: [
      'The forest bows to axe and hearth.',
      'Every path in the valley leads to your door.',
      'History will remember this valley.',
    ],
    moderate: [
      'The trees part, and keep your roads open.',
      'Every shore lights a friendly lamp tonight.',
      'Your people became a legend.',
    ],
    hard: [
      'Your banners fly above the peaks.',
      'Even the mountains make way.',
      'Every sail on the horizon is yours.',
    ],
  },
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  title() { return this.pick(this.TITLES); },
  subtitle() { return this.pick(this.SUB_BY_MODE[this.mode] || this.SUB_BY_MODE.moderate); },

  // the one scene each difficulty shows — no roll, no alternates
  SCENE_BY_MODE: { calm: 'hamlet', moderate: 'town', hard: 'stronghold' },
  TOD_BY_MODE: { calm: 'morning', moderate: 'midday', hard: 'evening' },

  // capture the difficulty (the only input this scene takes now) and pick a
  // hand-authored picture for it if one has been uploaded; called once as
  // the victory screen opens
  begin(mode) {
    this.mode = CFG.MODES && CFG.MODES[mode] ? mode : 'moderate';
    this.tod = this.TOD_BY_MODE[this.mode] || 'midday';
    this.scene = this.SCENE_BY_MODE[this.mode] || 'hamlet';
    const imgs = window.Assets ? Assets.endgameImgs('win', this.mode) : [];
    this.img = imgs.length ? this.pick(imgs) : null;
    this._seed();
  },

  /* ---- time-of-day palettes: the same celebration under three skies, one
     per difficulty ---- */
  TOD: {
    morning: {   // Calm — a pale gold sunrise, mist still on the fields
      sky: ['#6f8fbf', '#f5d9a8'], starA: 0,
      orb: { x: 84, y: 92, r: 24, body: '#fff3c8', crown: '#ffffff', glow: '#ffe9b0', ray: true },
      cloud: ['#f4e3d0', '#fff5e8', 0.7],
      ridge: ['#7d92b5', '#63799c'],
      fog: '#f2dfc2', fogA: 0.12,
      sil: '#3f5240', silEdge: '#5b7355',
      grass: ['#5f8c49', '#31502a'], tuft: ['#7cb35c', '#3a5a2e'],
      wood: ['#4a3620', '#6b4a26', '#8a6236', '#b58a4e'],
      roof: ['#7a5a30', '#9c7440'], thatchHi: '#c99a58',
      banner: '#4a7fd0', banner2: '#d0a43a',
      win: '#ffd382', water: ['#5b90ba', '#35709c'], foam: '#e5f2f4',
      metal: '#c9ced4', helm: '#59616e', skin: '#e0af80',
      smoke: '#d9dee2', vignette: '#241d0f', vigA: 0.05,
    },
    midday: {   // Moderate — clear bright noon, hard light and long sight
      sky: ['#5f9fd8', '#cfe9f5'], starA: 0,
      orb: { x: 208, y: 48, r: 20, body: '#fff8d8', crown: '#ffffff', glow: '#fff2c0', ray: true },
      cloud: ['#eef6fc', '#ffffff', 0.8],
      ridge: ['#7f9ac2', '#6480a8'],
      fog: '#e8f2f8', fogA: 0.07,
      sil: '#3a4e39', silEdge: '#567350',
      grass: ['#619448', '#2f4f26'], tuft: ['#7fbc58', '#38582c'],
      wood: ['#4a3620', '#6b4a26', '#8a6236', '#b58a4e'],
      roof: ['#826032', '#a67c44'], thatchHi: '#d2a45e',
      banner: '#3f7ad2', banner2: '#d8ac3c',
      win: '#f6c060', water: ['#4f88b6', '#2f6a97'], foam: '#dceff6',
      metal: '#d4dae0', helm: '#5e6774', skin: '#e2b184',
      smoke: '#e2e6ea', vignette: '#1b2410', vigA: 0.04,
    },
    evening: {   // Hard — a triumphant amber sunset, first stars out
      sky: ['#453a6e', '#f0a45c'], starA: 0.35,
      orb: { x: 304, y: 108, r: 26, body: '#ffcf7a', crown: '#ffe6a6', glow: '#f0955a', ray: true },
      cloud: ['#755470', '#96636a', 0.55],
      ridge: ['#5f4d70', '#41334f'],
      fog: '#d8a887', fogA: 0.09,
      sil: '#2e2233', silEdge: '#463049',
      grass: ['#57603a', '#232a18'], tuft: ['#6f7a44', '#2a331c'],
      wood: ['#3a2a18', '#59391f', '#7a5230', '#a37844'],
      roof: ['#6b4a2c', '#8a5f38'], thatchHi: '#b8874c',
      banner: '#5680c9', banner2: '#dca94a',
      win: '#ffbe5c', water: ['#7a5a78', '#4a3560'], foam: '#e6bfa0',
      metal: '#b9bec8', helm: '#4e5560', skin: '#d8a276',
      smoke: '#c8bfc4', vignette: '#1c0f14', vigA: 0.08,
    },
  },
  theme() { return this.TOD[this.tod] || this.TOD.midday; },

  // ---- pixel helpers ----
  lerp(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = pa >> 16, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = pb >> 16, bg = (pb >> 8) & 255, bb = pb & 255;
    return 'rgb(' + ((ar + (br - ar) * t) | 0) + ',' + ((ag + (bg - ag) * t) | 0) + ',' + ((ab + (bb - ab) * t) | 0) + ')';
  },
  shade(c, t) { return t < 0 ? this.lerp(c, '#000000', -t) : this.lerp(c, '#ffffff', t); },
  hsh(x, y) { let n = (x | 0) * 374761393 + (y | 0) * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) % 1024 / 1024; },
  disc(g, cx, cy, r) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) g.fillRect(cx + dx, cy + dy, 1, 1); },
  blob(g, cx, cy, rw, rh) {
    const rw2 = rw * rw, rh2 = rh * rh;
    for (let dy = -rh; dy <= rh; dy++) for (let dx = -rw; dx <= rw; dx++)
      if (dx * dx * rh2 + dy * dy * rw2 <= rw2 * rh2) g.fillRect((cx + dx) | 0, (cy + dy) | 0, 1, 1);
  },
  // draw a real picture to COVER the whole canvas (crop overflow, keep
  // aspect) — used only while a hand-authored PNG is standing in
  _drawCover(g, cv, img) {
    const cw = cv.width, ch = cv.height;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.max(cw / iw, ch / ih);
    const dw = iw * s, dh = ih * s;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  },

  _seed() {
    this._stars = []; for (let i = 0; i < 70; i++) this._stars.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * 120) | 0, p: Math.random() * 6.28, b: 0.4 + Math.random() * 0.6 });
    this._motes = []; for (let i = 0; i < 40; i++) this._motes.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * this.H) | 0, sp: 3 + Math.random() * 6, p: Math.random() * 6.28, g: 0.2 + Math.random() * 0.45, e: Math.random() < 0.55 });
    this._tufts = []; for (let i = 0; i < 210; i++) { const y = 190 + (Math.random() * 106) | 0; this._tufts.push({ x: (Math.random() * this.W) | 0, y, h: 2 + (Math.random() * 3) | 0, lit: Math.random() < 0.35 }); }
    this._cloudSeed = [{ x: 330, y: 44, s: 2.1 }, { x: 120, y: 70, s: 1.5 }, { x: 236, y: 30, s: 1.8 }, { x: 44, y: 54, s: 1.3 }, { x: 386, y: 78, s: 1.1 }];
  },

  draw(cv, t) {
    const g = cv.getContext('2d');
    if (this.img) {
      if (cv.width !== this.HI_W) { cv.width = this.HI_W; cv.height = this.HI_H; }
      cv.classList.add('cfArtPhoto');
      this._drawCover(g, cv, this.img);
      return;
    }
    cv.classList.remove('cfArtPhoto');
    if (cv.width !== this.W) { cv.width = this.W; cv.height = this.H; }
    g.imageSmoothingEnabled = false;
    const W = this.W, H = this.H, HZ = 184;
    const th = this.theme();

    // --- sky: vertical wash + a warm glow band low over the horizon ---
    for (let y = 0; y < HZ; y++) { g.fillStyle = this.lerp(th.sky[0], th.sky[1], y / HZ); g.fillRect(0, y, W, 1); }
    g.globalAlpha = this.tod === 'midday' ? 0.10 : 0.22; g.fillStyle = th.orb.glow;
    for (let k = 0; k < 26; k++) { g.globalAlpha = (this.tod === 'midday' ? 0.10 : 0.22) * (k / 26); g.fillRect(0, HZ - 26 + k, W, 1); }
    g.globalAlpha = 1;
    if (th.starA > 0) { for (const s of this._stars) { g.globalAlpha = th.starA * s.b * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 700 + s.p))); g.fillStyle = '#f2ead0'; g.fillRect(s.x, s.y, 1, 1); if (s.b > 0.85) g.fillRect(s.x + 1, s.y, 1, 1); } g.globalAlpha = 1; }
    this._orb(g, th, t);
    this._clouds(g, th, t);

    // --- background terrain: rolling hills + a pine treeline, always ---
    this._ridges(g, th);
    this._pines(g, th);

    // drifting morning mist over the horizon line
    for (let k = 0; k < 6; k++) { const fx = ((t / 45 + k * 74) % (W + 180)) - 90; g.globalAlpha = th.fogA; g.fillStyle = th.fog; this.blob(g, fx, HZ - 4 + (k % 2) * 7, 74, 7); }
    g.globalAlpha = 1;

    // --- ground: gradient + hash mottle + tufts (+ flowers when bright) ---
    const groundTop = HZ;
    for (let y = groundTop; y < H; y++) { g.fillStyle = this.lerp(th.grass[0], th.grass[1], (y - groundTop) / Math.max(1, H - groundTop)); g.fillRect(0, y, W, 1); }
    for (let i = 0; i < 900; i++) {
      const mx = (this.hsh(i, 7) * W) | 0, my = (groundTop + this.hsh(i, 13) * (H - groundTop)) | 0;
      const dk = this.hsh(i, 29) < 0.5;
      g.globalAlpha = 0.16; g.fillStyle = dk ? th.grass[1] : th.tuft[0];
      g.fillRect(mx, my, 1 + ((i % 3) === 0 ? 1 : 0), 1);
    }
    g.globalAlpha = 1;
    for (const tf of this._tufts) { if (tf.y < groundTop + 3) continue; g.fillStyle = tf.lit ? th.tuft[0] : th.tuft[1]; g.fillRect(tf.x, tf.y - tf.h, 1, tf.h); if (tf.lit && tf.h > 3) g.fillRect(tf.x + 1, tf.y - tf.h + 1, 1, 1); }
    if (this.tod !== 'evening') {
      for (let i = 0; i < 26; i++) {
        const fx2 = (this.hsh(i, 91) * W) | 0, fy2 = (groundTop + 12 + this.hsh(i, 97) * (H - groundTop - 14)) | 0;
        g.fillStyle = i % 3 ? '#e8dce6' : '#e8c455'; g.fillRect(fx2, fy2, 1, 1);
      }
    }

    // --- the scene itself ---
    const fn = this['_sc_' + this.scene] || this._sc_hamlet;
    fn.call(this, g, th, t, groundTop);

    this._doves(g, th, t);
    this._drawMotes(g, t);
    this._vignette(g, th);
  },

  _orb(g, th, t) {
    const o = th.orb, mx = o.x, my = o.y, mr = o.r;
    for (let h = 7; h >= 0; h--) { g.globalAlpha = 0.05; g.fillStyle = o.glow; this.disc(g, mx, my, mr + 4 + h * 5); }
    g.globalAlpha = 1;
    if (o.ray) {
      g.globalAlpha = 0.07; g.fillStyle = o.glow;
      for (let a = 0; a < 10; a++) { const an = a / 10 * 6.28 + t / 5000; for (let r = mr + 4; r < mr + 38; r += 1) { g.fillRect((mx + Math.cos(an) * r) | 0, (my + Math.sin(an) * r) | 0, 1, 1); } }
      g.globalAlpha = 1;
    }
    g.fillStyle = o.body; this.disc(g, mx, my, mr);
    g.fillStyle = o.crown; this.disc(g, mx, my, mr - 8);
    g.fillStyle = o.crown; this.disc(g, mx - (mr * 0.35) | 0, my - (mr * 0.35) | 0, 4);
  },
  // puffy top-lit clouds: base mass, bright lobes above, a flat shaded keel
  _clouds(g, th, t) {
    for (const c of this._cloudSeed) {
      const cx = ((c.x + t / 130) % (this.W + 120)) - 60, s = c.s;
      g.globalAlpha = th.cloud[2];
      g.fillStyle = th.cloud[0];
      this.blob(g, cx, c.y, 20 * s, 5 * s);
      this.blob(g, cx - 10 * s, c.y + 1, 12 * s, 4 * s);
      this.blob(g, cx + 12 * s, c.y + 1, 11 * s, 3.6 * s);
      g.globalAlpha = th.cloud[2] * 0.9; g.fillStyle = th.cloud[1];
      this.blob(g, cx - 4 * s, c.y - 3 * s, 10 * s, 3.4 * s);
      this.blob(g, cx + 8 * s, c.y - 2 * s, 7 * s, 2.6 * s);
      g.globalAlpha = th.cloud[2] * 0.5; g.fillStyle = this.lerp(th.cloud[0], th.sky[0], 0.5);
      g.fillRect((cx - 16 * s) | 0, (c.y + 4 * s) | 0, (32 * s) | 0, 2);
      g.globalAlpha = 1;
    }
  },
  // rolling hills in two depth layers — the far one hazed into the sky
  _ridges(g, th) {
    const HZ = 184, W = this.W;
    const layer = (amp, base, off, col) => {
      g.fillStyle = col;
      for (let x = 0; x < W; x++) {
        const yTop = (base - amp * (0.6 + 0.4 * Math.sin(x / 46 + off)) - amp * 0.5 * Math.sin(x / 17 + off * 2)) | 0;
        g.fillRect(x, yTop, 1, HZ - yTop);
      }
    };
    layer(26, HZ - 18, 0.8, this.lerp(th.ridge[0], th.sky[1], 0.55));
    // near layer with a lit/shadow face read from the slope direction
    for (let x = 0; x < W; x++) {
      const f = xx => HZ - 6 - 30 * (0.5 + 0.5 * Math.sin(xx / 34 + 2.2)) - 12 * Math.sin(xx / 13 + 0.7);
      const yTop = f(x) | 0, slope = f(x + 2) - f(x);
      g.fillStyle = slope > 0 ? th.ridge[1] : th.ridge[0];
      g.fillRect(x, yTop, 1, HZ - yTop);
      if (this.hsh(x, yTop) < 0.06) { g.fillStyle = this.shade(th.ridge[1], -0.15); g.fillRect(x, yTop + 4 + (this.hsh(x, 3) * 10 | 0), 1, 2); }
    }
  },
  // pine treelines: a hazed back row, a full-colour front row. Each tree is a
  // true jagged cone — width swelling row by row with stepped bough tips —
  // over a short trunk, lit up one flank.
  _pines(g, th) {
    const HZ = 184;
    const tree = (x, base, h, col, edge) => {
      g.fillStyle = th.wood[0]; g.fillRect(x, base - 2, 2, 2);
      const maxW = (h * 0.62) | 0;
      for (let i = 0; i < h; i++) {
        // stepped boughs: width climbs, then pulls in a px at each tier break
        let w = 1 + ((i * maxW / h) | 0);
        if (i % 3 === 2) w = Math.max(1, w - 1);
        w += (this.hsh(x, i) < 0.3 ? 1 : 0);
        const y = base - 2 - h + i;
        g.fillStyle = col; g.fillRect(x - (w >> 1), y, w, 1);
        if (i % 3 !== 2 && w > 2) { g.fillStyle = edge; g.fillRect(x - (w >> 1), y, 1, 1); }
      }
    };
    const back = this.lerp(th.sil, th.sky[1], 0.4), backE = this.lerp(th.silEdge, th.sky[1], 0.4);
    for (let i = 0; i < 24; i++) tree(8 + i * 17 + ((i * 37) % 9), HZ - 3, 11 + ((i * 53) % 6), back, backE);
    for (let i = 0; i < 19; i++) tree(4 + i * 22 + ((i * 61) % 11), HZ + 3, 16 + ((i * 47) % 9), th.sil, th.silEdge);
  },

  /* ---- shared set-dressing (all at the new scale) ---- */
  // a lived-in timber house: planked walls with corner posts, coursed thatch
  // with ragged eaves and a bright ridge, an arched door, glowing mullioned
  // windows — and woodsmoke when the hearth is lit
  _house(g, th, x, y, w, h, opt) {
    opt = opt || {};
    // walls: planks with a shadowed course every few rows, corner posts, dark sill
    for (let yy = 0; yy < h; yy++) {
      g.fillStyle = yy % 4 === 3 ? this.shade(th.wood[1], -0.12) : th.wood[1];
      g.fillRect(x, y - h + yy, w, 1);
    }
    g.fillStyle = th.wood[2]; g.fillRect(x, y - h, 2, h); g.fillRect(x + w - 2, y - h, 2, h);
    g.fillStyle = th.wood[0]; g.fillRect(x, y - 1, w, 1);
    // thatch: descending courses with a jittered eave, wide overhang, bright ridge
    const rise = (w >> 1) + 3;
    for (let i = 0; i <= (w >> 1); i++) {
      const courseW = w + 6 - i * 2, cy = y - h - 1 - i;
      g.fillStyle = (i % 4 === 0) ? th.roof[0] : (i % 4 === 2 ? this.shade(th.roof[1], 0.06) : th.roof[1]);
      g.fillRect(x - 3 + i, cy, courseW, 1);
      if (i < 3) { const jag = (this.hsh(x + i, y) * 3) | 0; g.fillStyle = th.roof[0]; g.fillRect(x - 3 + i + jag, cy + 1, 2, 1); g.fillRect(x - 3 + i + courseW - 3 - jag, cy + 1, 2, 1); }
    }
    g.fillStyle = th.thatchHi; g.fillRect(x + (w >> 1) - 2, y - h - 1 - (w >> 1), 5, 2);
    g.globalAlpha = 0.3; g.fillStyle = '#000000'; g.fillRect(x - 2, y - h, w + 4, 1); g.globalAlpha = 1;   // eave shadow
    // arched door with a frame and an iron handle
    const dx = x + 4, dh = Math.min(h - 2, 11);
    g.fillStyle = th.wood[2]; g.fillRect(dx - 1, y - dh - 1, 7, dh + 1);
    g.fillStyle = th.wood[0]; g.fillRect(dx, y - dh, 5, dh); g.fillRect(dx + 1, y - dh - 1, 3, 1);
    g.fillStyle = th.metal; g.fillRect(dx + 3, y - (dh >> 1), 1, 1);
    // windows: framed, mullioned, breathing warm light
    const warm = 0.6 + 0.4 * Math.sin((opt.t || 0) / 340 + x);
    const win = (wx, wy) => {
      g.fillStyle = th.wood[0]; g.fillRect(wx - 1, wy - 1, 6, 6);
      g.globalAlpha = 0.6 + warm * 0.4; g.fillStyle = th.win; g.fillRect(wx, wy, 4, 4); g.globalAlpha = 1;
      g.fillStyle = th.wood[0]; g.fillRect(wx + 1, wy, 1, 4); g.fillRect(wx, wy + 1, 4, 1);
      g.fillStyle = th.wood[2]; g.fillRect(wx - 1, wy + 4, 6, 1);
    };
    win(x + w - 9, y - h + 3 + ((h - 10) >> 1));
    if (w >= 34) win(x + (w >> 1) - 2, y - h + 3 + ((h - 10) >> 1));
    if (this.tod === 'evening') { g.globalAlpha = 0.10; g.fillStyle = th.win; g.fillRect(x + w - 11, y, 9, 3); g.globalAlpha = 1; }
    if (opt.smoke) this._smokeCol(g, th, x + w - 5, y - h - (w >> 1) - 3, opt.t || 0);
  },
  _smokeCol(g, th, x, y, t) {
    for (let k = 0; k < 16; k++) {
      const yy = y - k * 3, wob = Math.sin(t / 480 + k * 0.5) * (2 + k * 0.35);
      g.globalAlpha = 0.16 * (1 - k / 16); g.fillStyle = th.smoke;
      const s = 2 + (k > 6 ? 1 : 0) + (k > 12 ? 1 : 0);
      g.fillRect(((x + wob) | 0) - (s >> 1), yy, s, s);
    }
    g.globalAlpha = 1;
  },
  // banner pole with a long fluttering pennant and a bright finial
  _flag(g, th, x, y, hgt, col, t) {
    g.fillStyle = th.wood[2]; g.fillRect(x, y - hgt, 1, hgt);
    g.fillStyle = this.shade(th.wood[2], 0.15); g.fillRect(x, y - hgt, 1, 2);
    for (let i = 0; i < 13; i++) {
      const fy = y - hgt + 1 + Math.sin(t / 240 + i * 0.55) * (0.6 + i * 0.16);
      const hh = i < 8 ? 4 : (i < 11 ? 3 : 2);
      g.fillStyle = col; g.fillRect(x + 1 + i, fy | 0, 1, hh);
      if (i % 3 === 0) { g.fillStyle = this.shade(col, -0.15); g.fillRect(x + 1 + i, (fy | 0) + hh - 1, 1, 1); }
    }
    g.fillStyle = th.banner2; g.fillRect(x - 1, y - hgt - 2, 3, 2);
  },
  /* a person with real limbs (~12px): shadow, striding legs, tunic with a
     belt, arms that hold tools, a head with hair — or a helm. Options:
     helm, spear, shield, hammer (swing phase), rod, cheer, walk (phase),
     plank (carried overhead), sit */
  _dude(g, th, x, y, tunic, opt) {
    opt = opt || {};
    g.globalAlpha = 0.22; g.fillStyle = '#000000'; g.fillRect(x - 1, y, 6, 1); g.globalAlpha = 1;
    const stride = opt.walk != null ? Math.round(Math.sin(opt.walk) * 1.4) : 0;
    g.fillStyle = '#241a10';
    if (opt.sit) { g.fillRect(x, y - 2, 4, 2); }
    else { g.fillRect(x, y - 3, 2, 3 + (stride > 0 ? 0 : 0)); g.fillRect(x + 2, y - 3, 2, 3); if (stride) { g.fillRect(x - stride * 0 + (stride > 0 ? 4 : -1), y - 2, 1, 2); } }
    // tunic + belt + shaded flank
    g.fillStyle = tunic; g.fillRect(x, y - 8, 4, 5);
    g.fillStyle = this.shade(tunic, -0.22); g.fillRect(x, y - 6, 4, 1); g.fillRect(x + 3, y - 8, 1, 5);
    // arms
    g.fillStyle = th.skin;
    if (opt.cheer) { g.fillRect(x - 1, y - 11, 1, 3); g.fillRect(x + 4, y - 11, 1, 3); }
    else if (opt.hammer != null) {
      const up = Math.sin(opt.hammer) > 0;
      g.fillRect(x + 4, y - (up ? 11 : 8), 1, 3);
      g.fillStyle = th.wood[3]; g.fillRect(x + 5, y - (up ? 12 : 9), 1, 3);
      g.fillStyle = th.metal; g.fillRect(x + 4, y - (up ? 13 : 10), 3, 2);
    } else if (opt.rod) {
      g.fillRect(x + (opt.face < 0 ? -1 : 4), y - 8, 1, 2);
    } else { g.fillRect(x - 1, y - 8, 1, 3); g.fillRect(x + 4, y - 8, 1, 3); }
    // head: skin + hair, or a helm with a nose-bar
    g.fillStyle = th.skin; g.fillRect(x, y - 11, 3, 3);
    if (opt.helm) {
      g.fillStyle = th.helm; g.fillRect(x - 1, y - 12, 5, 2); g.fillRect(x, y - 13, 3, 1); g.fillRect(x + 1, y - 10, 1, 2);
      g.fillStyle = this.shade(th.helm, 0.25); g.fillRect(x, y - 13, 1, 1);
    } else {
      g.fillStyle = opt.hair || th.wood[0]; g.fillRect(x - 1, y - 12, 5, 1); g.fillRect(x - 1, y - 11, 1, 2); g.fillRect(x + 3, y - 11, 1, 1);
    }
    if (opt.spear) {
      g.fillStyle = th.wood[3]; g.fillRect(x + 5, y - 17, 1, 17);
      g.fillStyle = th.metal; g.fillRect(x + 5, y - 19, 1, 3); g.fillRect(x + 4, y - 18, 1, 1);
    }
    if (opt.shield) {
      g.fillStyle = this.shade(opt.shield, -0.3); g.fillRect(x - 3, y - 9, 4, 6);
      g.fillStyle = opt.shield; g.fillRect(x - 2, y - 8, 2, 4);
      g.fillStyle = th.metal; g.fillRect(x - 2, y - 7, 1, 1);
    }
    if (opt.plank) { g.fillStyle = th.wood[3]; g.fillRect(x - 5, y - 13, 14, 2); g.fillStyle = this.shade(th.wood[3], -0.2); g.fillRect(x - 5, y - 12, 14, 1); }
  },
  // a watchtower: a solid planked shaft with corner posts and a cross-brace,
  // a jettied parapet with crenels, a helmet on watch, a banner overhead
  _towerV(g, th, x, y, h, t) {
    // the shaft — planked, corner-posted, braced
    for (let yy = 0; yy < h; yy++) {
      g.fillStyle = yy % 4 === 3 ? this.shade(th.wood[1], -0.12) : th.wood[1];
      g.fillRect(x, y - h + yy, 12, 1);
    }
    g.fillStyle = th.wood[2]; g.fillRect(x, y - h, 2, h); g.fillRect(x + 10, y - h, 2, h);
    g.fillStyle = th.wood[0];
    for (let i = 0; i < 8; i++) { g.fillRect(x + 2 + i, y - (h >> 1) + i - 4, 1, 1); g.fillRect(x + 9 - i, y - (h >> 1) + i - 4, 1, 1); }
    // arrow slit
    g.fillStyle = '#1c1812'; g.fillRect(x + 5, y - h + 4, 2, 4);
    // the jettied parapet: lip, boards, crenel teeth
    g.fillStyle = th.wood[0]; g.fillRect(x - 2, y - h - 2, 16, 2);
    for (let yy = 0; yy < 5; yy++) { g.fillStyle = yy % 3 === 1 ? this.shade(th.wood[1], -0.1) : th.wood[1]; g.fillRect(x - 2, y - h - 7 + yy, 16, 1); }
    g.fillStyle = th.wood[2];
    for (let cx2 = -2; cx2 <= 12; cx2 += 4) g.fillRect(x + cx2, y - h - 9, 2, 2);
    // the watch: a helmet and spear-tip over the parapet
    g.fillStyle = th.helm; g.fillRect(x + 4, y - h - 10, 3, 2);
    g.fillStyle = th.wood[3]; g.fillRect(x + 8, y - h - 14, 1, 6);
    g.fillStyle = th.metal; g.fillRect(x + 8, y - h - 16, 1, 2);
    this._flag(g, th, x + 2, y - h - 9, 9, th.banner, t);
  },
  // a palisade: paired logs with pointed tops, binding rails, a shadowed foot
  _wallRun(g, th, x0, x1, y, hgt) {
    for (let x = x0; x < x1; x += 2) {
      g.fillStyle = ((x - x0) >> 1) % 2 ? this.shade(th.wood[1], -0.1) : th.wood[1];
      g.fillRect(x, y - hgt, 2, hgt);
      g.fillStyle = th.wood[2]; g.fillRect(x, y - hgt - 1 - ((x >> 1) % 2), 1, 2);
    }
    g.fillStyle = th.wood[0]; g.fillRect(x0, y - hgt + 3, x1 - x0, 1); g.fillRect(x0, y - 4, x1 - x0, 1);
    g.globalAlpha = 0.25; g.fillStyle = '#000000'; g.fillRect(x0, y - 1, x1 - x0, 1); g.globalAlpha = 1;
  },
  // a resting catapult: spoked wheels, a timber frame, the arm and its sling
  _catapult(g, th, x, y) {
    const wheel = (wx) => {
      g.fillStyle = th.wood[0]; this.disc(g, wx, y - 4, 4);
      g.fillStyle = th.wood[1]; this.disc(g, wx, y - 4, 3);
      g.fillStyle = th.wood[0]; g.fillRect(wx - 3, y - 4, 7, 1); g.fillRect(wx, y - 7, 1, 7);
      g.fillStyle = th.wood[3]; g.fillRect(wx, y - 4, 1, 1);
    };
    g.fillStyle = th.wood[1]; g.fillRect(x - 10, y - 7, 20, 3);
    g.fillStyle = this.shade(th.wood[1], -0.15); g.fillRect(x - 10, y - 5, 20, 1);
    wheel(x - 7); wheel(x + 7);
    g.fillStyle = th.wood[2]; g.fillRect(x - 4, y - 12, 2, 6); g.fillRect(x + 3, y - 12, 2, 6);
    g.fillStyle = th.wood[3];
    for (let i = 0; i < 12; i++) g.fillRect(x - 3 + i, y - 8 - i, 2, 1);
    g.fillStyle = th.wood[0]; g.fillRect(x + 8, y - 22, 4, 3);
    g.fillStyle = '#8d8f96'; this.disc(g, x - 14, y - 2, 2); this.disc(g, x - 18, y - 1, 2);
  },
  _doves(g, th, t) {
    for (let i = 0; i < 4; i++) {
      const bx = ((t / (26 + i * 7) + i * 130) % (this.W + 60)) - 30;
      const by = 52 + i * 17 + Math.sin(t / 400 + i * 2) * 6;
      const flap = Math.sin(t / 130 + i * 1.7) > 0 ? 1 : -1;
      g.fillStyle = th.tod === 'evening' ? '#d8cfc4' : '#f2f4f6';
      g.fillRect(bx | 0, by | 0, 3, 1);
      g.fillRect((bx - 2) | 0, (by - flap) | 0, 2, 1); g.fillRect((bx + 3) | 0, (by - flap) | 0, 2, 1);
    }
  },
  _drawMotes(g, t) {
    const H = this.H, W = this.W;
    for (const m of this._motes) {
      const y = m.e ? (m.y - t * m.sp * 0.32) : (m.y + t * m.sp * 0.4);
      const yy = ((y % (H + 10)) + (H + 10)) % (H + 10) - 5;
      const xx = (m.x + Math.sin(t / 620 + m.p) * 6) | 0;
      g.globalAlpha = m.g * (m.e ? 0.5 + 0.5 * Math.sin(t / 200 + m.p) : 0.7);
      g.fillStyle = m.e ? '#f0c051' : '#e9cfd6';
      g.fillRect(((xx % W) + W) % W, yy | 0, m.e ? 2 : 1, 1);
    }
    g.globalAlpha = 1;
  },
  _vignette(g, th) {
    const W = this.W, H = this.H, depth = 34;
    for (let d = 0; d < depth; d++) {
      g.globalAlpha = th.vigA * (1 - d / depth) + 0.012; g.fillStyle = th.vignette;
      g.fillRect(d, d, W - 2 * d, 1); g.fillRect(d, H - 1 - d, W - 2 * d, 1);
      g.fillRect(d, d, 1, H - 2 * d); g.fillRect(W - 1 - d, d, 1, H - 2 * d);
    }
    g.globalAlpha = 1;
  },
  // a dirt lane wandering up from the bottom edge toward (tx, ty)
  _lane(g, th, tx, ty, bx) {
    const earth = this.lerp(th.grass[1], th.wood[1], 0.55), lit = this.shade(earth, 0.12);
    for (let y = this.H - 1; y >= ty; y--) {
      const f = (y - ty) / (this.H - ty);
      const cx = tx + (bx - tx) * f + Math.sin(y / 17) * 5 * f;
      const w = 2 + 7 * f;
      g.fillStyle = earth; g.fillRect((cx - w / 2) | 0, y, w | 0, 1);
      g.fillStyle = lit; g.fillRect((cx - w / 6) | 0, y, Math.max(1, (w / 3) | 0), 1);
      if (this.hsh(3, y) < 0.2) { g.fillStyle = this.shade(earth, -0.2); g.fillRect((cx + (this.hsh(7, y) - 0.5) * w) | 0, y, 1, 1); }
    }
  },

  /* ================= THE SCENES ================= */

  // CALM — a thriving hamlet: two warm homes, combed crop rows, wash on the
  // line, a haystack, hens in the yard and folk idling up the lane
  _sc_hamlet(g, th, t) {
    this._lane(g, th, 76, 250, 190);
    this._house(g, th, 52, 246, 46, 28, { t, smoke: true });
    this._house(g, th, 124, 222, 30, 19, { t });
    // fence along the crops
    g.fillStyle = th.wood[2];
    for (let fx = 204; fx <= 372; fx += 12) g.fillRect(fx, 216, 1, 6);
    g.fillStyle = th.wood[1]; g.fillRect(204, 217, 168, 1); g.fillRect(204, 220, 168, 1);
    // crop rows: turned soil with combed green shoots
    for (let r = 0; r < 5; r++) {
      const ry = 228 + r * 12;
      g.fillStyle = this.shade(th.grass[1], -0.18); g.fillRect(206, ry, 164, 4);
      g.fillStyle = this.shade(th.grass[1], -0.3); g.fillRect(206, ry + 3, 164, 1);
      for (let x = 210; x < 366; x += 7) {
        const j = (this.hsh(x, ry) * 2) | 0;
        g.fillStyle = th.tuft[0]; g.fillRect(x + j, ry - 1, 2, 2);
        g.fillStyle = th.tuft[1]; g.fillRect(x + j + 1, ry + 1, 1, 1);
      }
    }
    // wash-line, sheets luffing in the breeze
    g.fillStyle = th.wood[2]; g.fillRect(116, 256, 1, 18); g.fillRect(172, 256, 1, 18);
    g.fillStyle = th.wood[0]; g.fillRect(117, 258, 55, 1);
    for (let i = 0; i < 3; i++) {
      const wx = 124 + i * 16, luff = Math.sin(t / 320 + i) * 2;
      g.fillStyle = i === 1 ? '#d9c9b2' : '#e8ecef';
      g.fillRect(wx, 259, 9, (6 + luff) | 0);
      g.fillStyle = this.shade(i === 1 ? '#d9c9b2' : '#e8ecef', -0.12); g.fillRect(wx + 7, 259, 2, (6 + luff) | 0);
    }
    // haystack + pitchfork
    g.fillStyle = th.roof[1]; this.blob(g, 348, 268, 12, 8);
    g.fillStyle = th.thatchHi; this.blob(g, 345, 263, 7, 4);
    g.fillStyle = this.shade(th.roof[0], -0.15); g.fillRect(338, 273, 21, 2);
    g.fillStyle = th.wood[2]; g.fillRect(334, 258, 1, 16);
    // hens pecking in the yard
    for (let i = 0; i < 3; i++) {
      const hx = 96 + i * 14 + Math.sin(t / 700 + i * 2.4) * 3, hy = 262 + (i % 2) * 6;
      const peck = Math.sin(t / 260 + i) > 0.6 ? 1 : 0;
      g.fillStyle = '#e8e4da'; g.fillRect(hx | 0, hy - 2, 3, 2);
      g.fillStyle = '#d8434d'; g.fillRect((hx + (peck ? 3 : 2)) | 0, hy - 3 + peck, 1, 1);
      g.fillStyle = '#241a10'; g.fillRect((hx + 1) | 0, hy, 1, 1);
    }
    // folk on the lane — one waves the day in
    const stroll = Math.sin(t / 900) * 10;
    this._dude(g, th, (236 + stroll) | 0, 284, '#7a5a34', { walk: t / 260 });
    this._dude(g, th, (252 + stroll) | 0, 286, '#8a6a86', { walk: t / 260 + 2 });
    this._dude(g, th, 84, 276, '#5a7a44', { cheer: true });
  },

  // MODERATE — a developed town: the great hall flying colours over a lane
  // of houses, a striped market, the town well, and folk about their business
  _sc_town(g, th, t) {
    this._lane(g, th, 196, 236, 160);
    // the great hall: long planked walls, twin windows, a crested roof
    const hx = 156, hy = 232, hw = 64, hh = 36;
    for (let yy = 0; yy < hh; yy++) { g.fillStyle = yy % 4 === 3 ? this.shade(th.wood[1], -0.12) : th.wood[1]; g.fillRect(hx, hy - hh + yy, hw, 1); }
    g.fillStyle = th.wood[2]; g.fillRect(hx, hy - hh, 2, hh); g.fillRect(hx + hw - 2, hy - hh, 2, hh); g.fillRect(hx + (hw >> 1) - 1, hy - hh, 2, hh);
    g.fillStyle = th.wood[0]; g.fillRect(hx, hy - 1, hw, 1);
    for (let i = 0; i <= 20; i++) {
      const cw = hw + 8 - ((i * (hw + 8)) / 21) | 0;
      g.fillStyle = i % 4 === 0 ? th.roof[0] : (i % 4 === 2 ? this.shade(th.roof[1], 0.06) : th.roof[1]);
      g.fillRect(hx - 4 + ((i * (hw + 8)) / 42) | 0, hy - hh - 2 - i, cw, 1);
    }
    g.fillStyle = th.thatchHi; g.fillRect(hx + (hw >> 1) - 3, hy - hh - 23, 7, 2);
    g.globalAlpha = 0.3; g.fillStyle = '#000000'; g.fillRect(hx - 3, hy - hh, hw + 6, 1); g.globalAlpha = 1;
    // tall arched door with iron straps
    g.fillStyle = th.wood[2]; g.fillRect(hx + 26, hy - 17, 12, 17);
    g.fillStyle = th.wood[0]; g.fillRect(hx + 27, hy - 16, 10, 16); g.fillRect(hx + 29, hy - 17, 6, 1);
    g.fillStyle = th.metal; g.fillRect(hx + 28, hy - 12, 8, 1); g.fillRect(hx + 28, hy - 6, 8, 1);
    const warm = 0.6 + 0.4 * Math.sin(t / 300);
    g.globalAlpha = 0.6 + warm * 0.4; g.fillStyle = th.win;
    g.fillRect(hx + 8, hy - hh + 12, 5, 6); g.fillRect(hx + hw - 13, hy - hh + 12, 5, 6);
    g.globalAlpha = 1;
    g.fillStyle = th.wood[0]; g.fillRect(hx + 10, hy - hh + 12, 1, 6); g.fillRect(hx + hw - 11, hy - hh + 12, 1, 6);
    this._flag(g, th, hx + 10, hy - hh - 22, 14, th.banner, t);
    this._flag(g, th, hx + hw - 10, hy - hh - 22, 14, th.banner2, t + 300);
    this._smokeCol(g, th, hx + hw - 14, hy - hh - 20, t);
    // houses down the lane
    this._house(g, th, 30, 234, 38, 23, { t, smoke: true });
    this._house(g, th, 88, 242, 32, 20, { t });
    this._house(g, th, 246, 238, 38, 23, { t, smoke: true });
    this._house(g, th, 306, 228, 30, 18, { t });
    // the market: striped awning, crates of goods, sacks
    g.fillStyle = th.wood[2]; g.fillRect(306, 254, 2, 22); g.fillRect(344, 254, 2, 22);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = (i >> 2) % 2 ? th.banner2 : '#eef0e6';
      g.fillRect(304 + i, 250 + ((i % 4) === 3 ? 1 : 0), 1, 4);
    }
    g.globalAlpha = 0.25; g.fillStyle = '#000000'; g.fillRect(305, 254, 40, 1); g.globalAlpha = 1;
    g.fillStyle = th.wood[1]; g.fillRect(310, 268, 12, 8); g.fillRect(326, 270, 10, 6);
    g.fillStyle = th.wood[0]; g.fillRect(310, 268, 12, 1); g.fillRect(326, 270, 10, 1);
    g.fillStyle = '#b8434d'; g.fillRect(312, 266, 3, 2); g.fillRect(316, 266, 2, 2);
    g.fillStyle = th.banner2; g.fillRect(328, 268, 3, 2); g.fillRect(332, 268, 2, 2);
    g.fillStyle = th.wood[3]; this.blob(g, 352, 272, 4, 4); this.blob(g, 358, 274, 3, 3);
    // the town well
    g.fillStyle = '#8d8f96'; g.fillRect(126, 262, 14, 6);
    g.fillStyle = '#6d6f76'; g.fillRect(126, 266, 14, 2); g.fillRect(126, 262, 1, 6);
    g.fillStyle = th.wood[2]; g.fillRect(128, 250, 1, 12); g.fillRect(137, 250, 1, 12);
    g.fillStyle = th.roof[0]; g.fillRect(125, 248, 16, 2); g.fillRect(127, 246, 12, 2);
    g.fillStyle = th.wood[0]; g.fillRect(132, 252, 1, 8);
    // townsfolk: a talking pair, walkers, a running child, the vendor, a dog
    const drift = Math.sin(t / 800) * 8;
    this._dude(g, th, 120, 282, '#7a5a34'); this._dude(g, th, 128, 283, '#8a6a86');
    this._dude(g, th, (210 + drift) | 0, 278, '#5a7a44', { walk: t / 240 });
    this._dude(g, th, 322, 266, '#a06a4a');
    this._dude(g, th, 62, 288, '#5a6a8a', { walk: t / 240 + 1 });
    const kid = (250 + ((t / 26) % 90)) | 0;
    g.save(); g.translate(0, 2); this._dude(g, th, kid, 288, '#b8434d', { walk: t / 120 }); g.restore();
    const dogx = (kid - 12) | 0;
    g.fillStyle = th.wood[2]; g.fillRect(dogx, 288, 6, 3); g.fillRect(dogx + 6, 286, 2, 3);
    g.fillStyle = th.wood[0]; g.fillRect(dogx - 1, 285 + ((Math.sin(t / 150) > 0) ? 0 : 1), 1, 2);
    g.fillRect(dogx + 1, 291, 1, 1); g.fillRect(dogx + 4, 291, 1, 1);
  },

  // HARD — the stronghold: a stone keep and curtain wall, braziers burning,
  // the patrol on the wall-walk, a catapult standing down at the gate
  _sc_stronghold(g, th, t) {
    const st0 = this.lerp(th.helm, '#ffffff', 0.30), st1 = this.lerp(th.helm, '#ffffff', 0.12), st2 = this.shade(th.helm, -0.25);
    const masonry = (x, y, w, h) => {
      g.fillStyle = st1; g.fillRect(x, y, w, h);
      for (let yy = 0; yy < h; yy += 4) { g.fillStyle = st2; g.fillRect(x, y + yy, w, 1); }
      for (let yy = 0; yy < h; yy += 4) for (let xx = ((yy >> 2) % 2) * 3; xx < w; xx += 6) { g.fillStyle = st2; g.fillRect(x + xx, y + yy, 1, 4); }
      g.fillStyle = st0; g.fillRect(x, y, 1, h); g.fillRect(x, y, w, 1);
    };
    // rooftops of the town inside, eaves tucked behind the curtain wall
    for (const [rx, rw] of [[44, 26], [90, 32], [140, 24], [252, 28], [304, 24], [344, 20]]) {
      for (let i = 0; i <= (rw >> 1); i++) {
        g.fillStyle = i % 4 === 0 ? th.roof[0] : (i % 4 === 2 ? this.shade(th.roof[1], 0.06) : th.roof[1]);
        g.fillRect(rx + i, 222 - (rw >> 1) + i, rw - i * 2, 1);
      }
      g.fillStyle = th.thatchHi; g.fillRect(rx + (rw >> 1) - 1, 222 - (rw >> 1), 3, 1);
    }
    this._smokeCol(g, th, 100, 202, t + 200); this._smokeCol(g, th, 264, 204, t + 800);
    // THE KEEP — a stone tower with slits, crenels and a balcony
    masonry(176, 152, 30, 52);
    g.fillStyle = st2; for (let cx2 = 174; cx2 <= 204; cx2 += 5) g.fillRect(cx2, 148, 3, 4);
    g.fillStyle = st1; g.fillRect(174, 152, 34, 2);
    g.fillStyle = '#1c1812'; g.fillRect(184, 162, 2, 6); g.fillRect(196, 172, 2, 6);
    const warm = 0.6 + 0.4 * Math.sin(t / 280);
    g.globalAlpha = 0.6 + warm * 0.4; g.fillStyle = th.win; g.fillRect(190, 182, 3, 4); g.globalAlpha = 1;
    g.fillStyle = th.wood[1]; g.fillRect(182, 192, 18, 2); g.fillStyle = th.wood[0]; g.fillRect(182, 194, 18, 1);
    this._flag(g, th, 190, 148, 14, th.banner, t);
    // curtain wall with a stone base and a timber hoarding top
    masonry(12, 216, 376, 16);
    this._wallRun(g, th, 12, 388, 218, 4);
    // gatehouse: dressed-stone arch, a portcullis half-raised over the shadow
    masonry(178, 200, 44, 32);
    g.fillStyle = st2; for (let cx2 = 178; cx2 <= 218; cx2 += 5) g.fillRect(cx2, 196, 3, 4);
    g.fillStyle = '#171310'; g.fillRect(191, 216, 18, 16); g.fillRect(193, 213, 14, 3); g.fillRect(195, 211, 10, 2);
    g.fillStyle = st0;   // voussoirs ringing the arch
    g.fillRect(190, 215, 1, 17); g.fillRect(209, 215, 1, 17);
    g.fillRect(192, 212, 2, 1); g.fillRect(206, 212, 2, 1); g.fillRect(196, 209, 8, 1);
    g.fillStyle = th.metal;
    for (let i = 0; i < 4; i++) g.fillRect(193 + i * 4, 212, 1, 12);
    for (let i = 0; i < 2; i++) g.fillRect(192, 215 + i * 5, 16, 1);
    g.globalAlpha = 0.35; g.fillStyle = '#000000'; g.fillRect(191, 231, 18, 1); g.globalAlpha = 1;
    // flanking towers with burning braziers
    this._towerV(g, th, 124, 232, 32, t);
    this._towerV(g, th, 268, 232, 32, t + 500);
    for (const wx of [128, 272]) {
      const fl = Math.sin(t / 160 + wx), fl2 = Math.sin(t / 90 + wx * 2);
      g.fillStyle = th.wood[0]; g.fillRect(wx - 1, 186, 6, 2);
      g.globalAlpha = 0.85; g.fillStyle = '#e88a3a'; g.fillRect(wx, 183 - (fl > 0 ? 1 : 0), 4, 3);
      g.globalAlpha = 0.9; g.fillStyle = '#f6c060'; g.fillRect(wx + 1, 181 - (fl2 > 0 ? 1 : 0), 2, 2);
      g.globalAlpha = 0.12; g.fillStyle = '#ffca70'; this.disc(g, wx + 2, 182, 7);
      g.globalAlpha = 1;
    }
    // the patrol pacing the wall-walk, passing each other
    const p1 = 40 + ((t / 45) % 300), p2 = 340 - ((t / 52) % 300);
    this._dude(g, th, p1 | 0, 216, '#4e5a76', { helm: true, spear: true, walk: t / 220 });
    this._dude(g, th, p2 | 0, 216, '#4e5a76', { helm: true, spear: true, walk: t / 240 });
    // honour guard flanking the gate + the standing catapult
    this._dude(g, th, 164, 262, '#5a6a8a', { helm: true, spear: true, shield: th.banner });
    this._dude(g, th, 230, 262, '#5a6a8a', { helm: true, spear: true, shield: th.banner });
    this._dude(g, th, 176, 282, '#8a3a3a', { helm: true });
    this._flag(g, th, 182, 282, 24, th.banner2, t + 200);
    this._catapult(g, th, 318, 284);
  },

  /* ---- tiny pixel icons for the buttons ---- */
  ICONS: {
    trophy: [24, 22, (g) => {
      g.fillStyle = '#8a6a1e'; g.fillRect(7, 17, 10, 2); g.fillRect(9, 15, 6, 2);
      g.fillStyle = '#c7a24a'; g.fillRect(10, 11, 4, 4);
      g.fillStyle = '#e8c86a'; for (let y = 2; y < 11; y++) { const hw = y < 4 ? 5 : (5 - ((y - 3) / 2 | 0)); g.fillRect(12 - hw, y, hw * 2, 1); }
      g.fillStyle = '#fff2c0'; g.fillRect(8, 3, 2, 5);
      g.fillStyle = '#c7a24a'; g.fillRect(4, 3, 3, 2); g.fillRect(3, 5, 2, 3); g.fillRect(17, 3, 3, 2); g.fillRect(19, 5, 2, 3);
      g.fillStyle = '#e8c86a'; g.fillRect(5, 7, 2, 2); g.fillRect(17, 7, 2, 2);
    }],
  },
  drawIcon(cv, name) {
    const spec = this.ICONS[name]; if (!spec || !cv) return;
    const [w, h, fn] = spec;
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    fn(g);
  },

  // ---- lifecycle ----
  _raf: 0, _last: 0,
  start() {
    if (!this._stars) this._seed();
    if (this._raf) return;
    const loop = (t) => {
      this._raf = 0;
      if (!window.Screens || Screens.current !== 'endgame') return;
      const cv = document.getElementById('victoryCanvas');
      if (cv && cv.offsetParent && t - this._last > 55) { this._last = t; this.draw(cv, t); }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },
  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },
};
window.VictoryArt = VictoryArt;
