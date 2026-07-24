"use strict";
/* Victory — "A New Dawn": the celebration scene. The mirror of js/defeatart.js:
   a handcrafted pixel canvas (400×300, CSS-upscaled), alive — smoke from warm
   chimneys, waving banners, villagers in the lanes. The SCENE answers to the
   difficulty you conquered: Calm shows a simple thriving hamlet (or fisherfolk
   hauling their catch), Moderate a developed town (or a house being raised),
   Hard a fortified town with its army mustered. Each difficulty owns a couple
   of variations, and the LIGHT is drawn fresh each victory — morning, midday
   or evening. The poetic subtitle answers to the land you won.
   Second draft: double resolution, layered depth (far haze → near detail),
   textured timber/thatch/stone, and people with real limbs and jobs. */
const VictoryArt = {
  W: 400, H: 300,

  TITLES: [
    'A NEW DAWN RISES',
    'THE VALLEY IS WON',
    'YOUR FIRE BURNS BRIGHT',
    'A CLAN OF LEGEND',
  ],
  // the positive mirror of the defeat subtitles — the land now serves you
  SUB_BY_LF: {
    valley: [
      'The forest bows to axe and hearth.',
      'Every path in the valley leads to your door.',
      'The trees part, and keep your roads open.',
    ],
    lakeland: [
      'The still water carries your fires home.',
      'Every shore lights a friendly lamp tonight.',
      'The lakes mirror a hundred hearth-fires.',
    ],
    highlands: [
      'The high stones learn your name, and keep it.',
      'Your banners fly above the peaks.',
      'Even the mountains make way.',
    ],
    islands: [
      'The tide brings tribute now.',
      'Every sail on the horizon is yours.',
      'The sea keeps your roads open.',
    ],
  },
  SUBTITLES: [
    'History will remember this valley.',
    'Your people became a legend.',
    'The hearth is warm, and the gates stand open.',
  ],
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  title() { return this.pick(this.TITLES); },
  subtitle() { return this.pick(this.SUB_BY_LF[this.landform] || this.SUBTITLES); },

  // which scenes each difficulty can roll — a couple of variations apiece
  SCENES: {
    calm: ['hamlet', 'fishing'],
    moderate: ['town', 'raising'],
    hard: ['muster', 'stronghold'],
  },

  begin(landform, mode, force) {
    force = force || {};
    this.landform = landform && this.SUB_BY_LF[landform] ? landform : 'valley';
    this.tod = force.tod || this.pick(['morning', 'midday', 'evening']);
    this.scene = force.scene || this.pick(this.SCENES[mode] || this.SCENES.moderate);
    this._seed();
  },

  /* ---- time-of-day palettes: the same celebration under three skies ---- */
  TOD: {
    morning: {   // a pale gold sunrise, mist still on the fields
      sky: ['#6f8fbf', '#f5d9a8'], starA: 0,
      orb: { x: 84, y: 92, r: 24, body: '#fff3c8', crown: '#ffffff', glow: '#ffe9b0', ray: true },
      cloud: ['#f4e3d0', '#fff5e8', 0.7],
      ridge: ['#7d92b5', '#63799c'], jag: ['#7d88a0', '#5f6b84'],
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
    midday: {   // clear bright noon, hard light and long sight
      sky: ['#5f9fd8', '#cfe9f5'], starA: 0,
      orb: { x: 208, y: 48, r: 20, body: '#fff8d8', crown: '#ffffff', glow: '#fff2c0', ray: true },
      cloud: ['#eef6fc', '#ffffff', 0.8],
      ridge: ['#7f9ac2', '#6480a8'], jag: ['#8b95a6', '#6d788c'],
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
    evening: {   // a triumphant amber sunset, first stars out
      sky: ['#453a6e', '#f0a45c'], starA: 0.35,
      orb: { x: 304, y: 108, r: 26, body: '#ffcf7a', crown: '#ffe6a6', glow: '#f0955a', ray: true },
      cloud: ['#755470', '#96636a', 0.55],
      ridge: ['#5f4d70', '#41334f'], jag: ['#564663', '#3a2f4a'],
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

  _seed() {
    this._stars = []; for (let i = 0; i < 70; i++) this._stars.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * 120) | 0, p: Math.random() * 6.28, b: 0.4 + Math.random() * 0.6 });
    this._motes = []; for (let i = 0; i < 40; i++) this._motes.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * this.H) | 0, sp: 3 + Math.random() * 6, p: Math.random() * 6.28, g: 0.2 + Math.random() * 0.45, e: Math.random() < 0.55 });
    this._tufts = []; for (let i = 0; i < 210; i++) { const y = 190 + (Math.random() * 106) | 0; this._tufts.push({ x: (Math.random() * this.W) | 0, y, h: 2 + (Math.random() * 3) | 0, lit: Math.random() < 0.35 }); }
    this._cloudSeed = [{ x: 330, y: 44, s: 2.1 }, { x: 120, y: 70, s: 1.5 }, { x: 236, y: 30, s: 1.8 }, { x: 44, y: 54, s: 1.3 }, { x: 386, y: 78, s: 1.1 }];
  },

  draw(cv, t) {
    const g = cv.getContext('2d');
    if (cv.width !== this.W) { cv.width = this.W; cv.height = this.H; }
    g.imageSmoothingEnabled = false;
    const W = this.W, H = this.H, HZ = 184;
    const th = this.theme(), lf = this.landform || 'valley';

    // --- sky: vertical wash + a warm glow band low over the horizon ---
    for (let y = 0; y < HZ; y++) { g.fillStyle = this.lerp(th.sky[0], th.sky[1], y / HZ); g.fillRect(0, y, W, 1); }
    g.globalAlpha = this.tod === 'midday' ? 0.10 : 0.22; g.fillStyle = th.orb.glow;
    for (let k = 0; k < 26; k++) { g.globalAlpha = (this.tod === 'midday' ? 0.10 : 0.22) * (k / 26); g.fillRect(0, HZ - 26 + k, W, 1); }
    g.globalAlpha = 1;
    if (th.starA > 0) { for (const s of this._stars) { g.globalAlpha = th.starA * s.b * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 700 + s.p))); g.fillStyle = '#f2ead0'; g.fillRect(s.x, s.y, 1, 1); if (s.b > 0.85) g.fillRect(s.x + 1, s.y, 1, 1); } g.globalAlpha = 1; }
    this._orb(g, th, t);
    this._clouds(g, th, t);

    // --- background terrain by landform (far haze layer, then near) ---
    if (lf === 'highlands') this._peaks(g, th);
    else this._ridges(g, th);
    if (lf === 'valley') this._pines(g, th);

    // drifting morning mist over the horizon line
    for (let k = 0; k < 6; k++) { const fx = ((t / 45 + k * 74) % (W + 180)) - 90; g.globalAlpha = th.fogA; g.fillStyle = th.fog; this.blob(g, fx, HZ - 4 + (k % 2) * 7, 74, 7); }
    g.globalAlpha = 1;

    // a glinting lake band for the water lands (the fishing scene brings its own)
    const sceneHasWater = this.scene === 'fishing';
    if ((lf === 'lakeland' || lf === 'islands') && !sceneHasWater) this._lakeBand(g, th, t, HZ, 20);

    // --- ground: gradient + hash mottle + tufts (+ flowers when bright) ---
    const groundTop = (lf === 'lakeland' || lf === 'islands') && !sceneHasWater ? HZ + 20 : HZ;
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
  // highland massifs: a hazed far wall, then three faceted snow peaks
  _peaks(g, th) {
    const HZ = 184, W = this.W;
    g.fillStyle = this.lerp(th.jag[0], th.sky[1], 0.5);
    for (let x = 0; x < W; x++) {
      const yTop = (HZ - 52 - 26 * Math.sin(x / 60 + 1) - 10 * Math.sin(x / 23)) | 0;
      g.fillRect(x, yTop, 1, HZ - yTop);
    }
    const peak = (bx, h, hw) => {
      for (let dx = -hw; dx <= hw; dx++) {
        const x = bx + dx; if (x < 0 || x >= W) continue;
        const jag = (this.hsh(x, bx) * 5) | 0;
        const top = (HZ - h * (1 - Math.abs(dx) / hw) + jag) | 0;
        const lit = dx < -hw * 0.08;
        g.fillStyle = lit ? th.jag[0] : th.jag[1];
        g.fillRect(x, top, 1, HZ - top);
        if (Math.abs(dx + hw * 0.08) < 1.2) { g.fillStyle = this.shade(th.jag[1], -0.22); g.fillRect(x, top, 1, HZ - top); }   // the spine
        // snow: the top third, with a ragged lower hem and a couloir streak
        const snowLen = (h * 0.34 - Math.abs(dx) * 0.5 + this.hsh(x, 5) * 6) | 0;
        if (snowLen > 0) { g.fillStyle = lit ? '#f3f6fa' : '#c9d3e2'; g.fillRect(x, top, 1, Math.min(snowLen, HZ - top)); }
        if ((x - bx) % 9 === 0 && Math.abs(dx) < hw * 0.6) { g.fillStyle = this.shade(th.jag[1], -0.1); g.fillRect(x, top + Math.max(1, snowLen), 1, 5); }
      }
    };
    peak(92, 88, 68); peak(240, 104, 60); peak(360, 76, 52);
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
  _lakeBand(g, th, t, y0, hgt) {
    const W = this.W, y1 = y0 + hgt;
    for (let y = y0; y < y1; y++) { g.fillStyle = this.lerp(th.water[0], th.water[1], (y - y0) / hgt); g.fillRect(0, y, W, 1); }
    g.globalAlpha = 0.35; g.fillStyle = th.orb.body;
    for (let y = y0; y < y1; y++) g.fillRect((th.orb.x - 3 + Math.sin(t / 300 + y * 0.7) * 2.5) | 0, y, 6, 1);
    g.globalAlpha = 0.25; g.fillStyle = th.foam;
    for (let k = 0; k < 6; k++) { const ry = y0 + 3 + k * 3, off = (t / 220 + k * 60) % W; g.fillRect(off | 0, ry, 10, 1); g.fillRect(((off + 170) % W) | 0, ry, 6, 1); }
    g.globalAlpha = 1;
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

  // CALM A — a thriving hamlet: two warm homes, combed crop rows, wash on the
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

  // CALM B — fisherfolk on the river: a jetty out over the water, bent rods,
  // ripple rings, leaping fish and a basket of silver
  _sc_fishing(g, th, t) {
    const y0 = 214, y1 = 258;
    // banks: a dark wet lip above and below the water
    g.fillStyle = this.shade(th.grass[1], -0.28); g.fillRect(0, y0 - 2, this.W, 2);
    for (let y = y0; y < y1; y++) { g.fillStyle = this.lerp(th.water[0], th.water[1], (y - y0) / (y1 - y0)); g.fillRect(0, y, this.W, 1); }
    g.fillStyle = this.shade(th.grass[1], -0.28); g.fillRect(0, y1, this.W, 2);
    // the sun's glitter on the current: broken sparkles scattered under the orb
    g.fillStyle = th.orb.body;
    for (let y = y0 + 2; y < y1 - 2; y += 2) {
      const sp = 6 + this.hsh(y, 1) * 14;
      g.globalAlpha = 0.14 + 0.2 * this.hsh(y, 2) + 0.1 * Math.sin(t / 300 + y);
      g.fillRect((th.orb.x - sp + Math.sin(t / 420 + y * 1.7) * 3) | 0, y, 3 + (this.hsh(y, 3) * 4 | 0), 1);
      g.globalAlpha = 0.14 + 0.2 * this.hsh(y, 5) + 0.1 * Math.cos(t / 340 + y);
      g.fillRect((th.orb.x + sp * 0.5 + Math.sin(t / 380 + y * 2.3) * 3) | 0, y, 2 + (this.hsh(y, 7) * 3 | 0), 1);
    }
    g.globalAlpha = 0.3; g.fillStyle = th.foam;
    for (let k = 0; k < 7; k++) { const ry = y0 + 4 + k * 6, off = (t / 190 + k * 52) % this.W; g.fillRect(off | 0, ry, 12, 1); g.fillRect(((off + 120) % this.W) | 0, ry, 7, 1); }
    g.globalAlpha = 1;
    // reeds along both banks
    for (let i = 0; i < 14; i++) {
      const rx = (this.hsh(i, 41) * this.W) | 0, top = i % 2 ? y0 - 8 : y1 + 2;
      g.fillStyle = th.tuft[1]; g.fillRect(rx, top, 1, 8);
      g.fillStyle = th.wood[3]; g.fillRect(rx, top, 1, 2);
    }
    // far-bank cabin, smoking
    this._house(g, th, 30, 208, 38, 22, { t, smoke: true });
    // the jetty: planks on posts, a fisher at its end
    g.fillStyle = th.wood[2]; g.fillRect(266, y0 + 6, 1, 10); g.fillRect(286, y0 + 10, 1, 10);
    for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? th.wood[1] : this.shade(th.wood[1], 0.08); g.fillRect(258, y0 + 2 + i, 36, 1); }
    g.fillStyle = this.shade(th.wood[1], -0.25); g.fillRect(258, y0 + 5, 36, 1);
    const bend = Math.sin(t / 500) * 2;
    // fisher on the jetty (line down to the water, ripple rings at the float)
    this._dude(g, th, 276, y0 + 2, '#5a6a8a', { rod: true, face: 1 });
    g.fillStyle = th.wood[3];
    for (let i = 0; i < 12; i++) g.fillRect(280 + i, y0 - 8 - (i > 7 ? (i - 7) : 0) + (i * i) / 22, 1, 1);
    g.fillStyle = '#cfd8de'; g.fillRect(292, (y0 + 2 + bend) | 0, 1, Math.max(2, (10 - bend) | 0));
    for (let r = 0; r < 3; r++) {
      const ph = ((t / 900) + r * 0.33) % 1;
      g.globalAlpha = 0.35 * (1 - ph); g.fillStyle = th.foam;
      const rr = 1 + ph * 5;
      g.fillRect((292 - rr) | 0, (y0 + 12) | 0, (rr * 2) | 0, 1);
      g.globalAlpha = 1;
    }
    // a second fisher sitting on the near bank
    this._dude(g, th, 96, y1 + 4, '#7a5a34', { rod: true, face: -1, sit: true });
    g.fillStyle = th.wood[3]; for (let i = 0; i < 10; i++) g.fillRect(94 - i, y1 - 6 + (i * i) / 18, 1, 1);
    g.fillStyle = '#cfd8de'; g.fillRect(84, y1 - 8, 1, 6);
    // leaping fish, silver in the light
    for (let f = 0; f < 2; f++) {
      const ph = ((t / 1400) + f * 0.5) % 1;
      const fx = 170 + f * 64 + ph * 40, fy = y0 + 18 - Math.sin(Math.PI * ph) * 17;
      g.fillStyle = '#dfe8ee'; g.fillRect(fx | 0, fy | 0, 5, 2);
      g.fillRect((fx + (ph > 0.5 ? -2 : 5)) | 0, (fy - 1) | 0, 2, 1);
      g.fillStyle = '#aebbc6'; g.fillRect((fx + 2) | 0, (fy + 1) | 0, 2, 1);
      if (ph > 0.85 || ph < 0.1) { g.globalAlpha = 0.5; g.fillStyle = th.foam; g.fillRect((170 + f * 64 + 40) | 0, y0 + 16, 4, 2); g.globalAlpha = 1; }
    }
    // the day's catch: a woven basket brimming with silver
    g.fillStyle = th.wood[1]; g.fillRect(216, 272, 18, 10);
    g.fillStyle = th.wood[0]; for (let yy = 0; yy < 10; yy += 3) g.fillRect(216, 272 + yy, 18, 1);
    g.fillStyle = th.wood[2]; g.fillRect(215, 271, 20, 2);
    g.fillStyle = '#d4dde4'; g.fillRect(218, 268, 6, 3); g.fillRect(226, 267, 6, 3); g.fillRect(222, 265, 4, 3);
    g.fillStyle = '#aebbc6'; g.fillRect(219, 269, 2, 1); g.fillRect(228, 268, 2, 1);
  },

  // MODERATE A — a developed town: the great hall flying colours over a lane
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

  // MODERATE B — raising a new house: the skeleton frame with rafters and
  // braces, a scaffold, swinging builders, a sawyer, the log pile
  _sc_raising(g, th, t) {
    this._house(g, th, 34, 240, 42, 26, { t, smoke: true });
    const fx = 170, fy = 246, fw = 68, fh = 30;
    // fresh-cut frame: corner posts, mid studs, tie beam, king post, rafters
    g.fillStyle = th.wood[3];
    g.fillRect(fx, fy - fh, 3, fh); g.fillRect(fx + fw - 3, fy - fh, 3, fh);
    g.fillRect(fx + (fw >> 1) - 1, fy - fh, 2, fh);
    g.fillRect(fx, fy - fh, fw, 2);
    g.fillRect(fx + (fw >> 1) - 1, fy - fh - 12, 2, 12);
    g.fillStyle = this.shade(th.wood[3], -0.18);
    g.fillRect(fx + 2, fy - fh, 1, fh); g.fillRect(fx + fw - 1, fy - fh, 1, fh);
    // rafters down both slopes + purlins
    for (let i = 0; i <= (fw >> 1); i++) {
      const ry = fy - fh - 12 + ((i * 12) / (fw >> 1)) | 0;
      if (i % 6 === 0) { g.fillStyle = th.wood[3]; g.fillRect(fx + (fw >> 1) - 1 - i, ry, 2, 2); g.fillRect(fx + (fw >> 1) - 1 + i, ry, 2, 2); }
      else if (i % 2 === 0) { g.fillStyle = this.shade(th.wood[3], -0.1); g.fillRect(fx + (fw >> 1) - 1 - i, ry, 1, 1); g.fillRect(fx + (fw >> 1) + i, ry, 1, 1); }
    }
    // diagonal corner braces
    g.fillStyle = th.wood[2];
    for (let i = 0; i < 8; i++) { g.fillRect(fx + 3 + i, fy - 8 - i, 1, 1); g.fillRect(fx + fw - 4 - i, fy - 8 - i, 1, 1); }
    // scaffold on trestles + a ladder
    g.fillStyle = th.wood[1]; g.fillRect(fx - 8, fy - 16, fw + 16, 2);
    g.fillStyle = th.wood[2]; g.fillRect(fx - 6, fy - 14, 2, 14); g.fillRect(fx + fw + 4, fy - 14, 2, 14);
    g.fillStyle = th.wood[2]; g.fillRect(fx + fw + 10, fy - 26, 1, 26); g.fillRect(fx + fw + 15, fy - 26, 1, 26);
    for (let yy = 0; yy < 5; yy++) { g.fillStyle = th.wood[1]; g.fillRect(fx + fw + 10, fy - 23 + yy * 5, 6, 1); }
    // builders: one up top mid-swing, one at the sawhorse, a hauler crossing
    this._dude(g, th, fx + 12, fy - 17, '#a06a4a', { hammer: t / 180 });
    this._dude(g, th, fx + fw - 16, fy - 17, '#5a6a8a', { hammer: t / 180 + 2.2 });
    const hx2 = (100 + ((t / 55) % 130)) | 0;
    this._dude(g, th, hx2, 282, '#7a5a34', { plank: true, walk: t / 230 });
    // sawhorse, log and saw — chips on the grass
    g.fillStyle = th.wood[2]; g.fillRect(120, 262, 2, 8); g.fillRect(134, 262, 2, 8); g.fillRect(119, 261, 18, 2);
    g.fillStyle = th.wood[3]; g.fillRect(116, 258, 24, 3);
    g.fillStyle = th.metal; g.fillRect(126, 254, 1, 5); g.fillStyle = this.shade(th.metal, -0.3); g.fillRect(126, 258, 1, 1);
    this._dude(g, th, 128, 272, '#5a7a44', { hammer: t / 240 + 1 });
    for (let i = 0; i < 8; i++) { g.fillStyle = th.wood[3]; g.fillRect(114 + ((this.hsh(i, 3) * 30) | 0), 272 + ((this.hsh(i, 9) * 6) | 0), 1, 1); }
    // the log pile: end-grain rounds, dark-barked with a faint ring
    const log = (lx, ly) => {
      g.fillStyle = th.wood[0]; this.disc(g, lx, ly, 4);
      g.fillStyle = th.wood[2]; this.disc(g, lx, ly, 3);
      g.fillStyle = this.shade(th.wood[2], -0.2); this.disc(g, lx, ly, 1);
      g.fillStyle = this.shade(th.wood[2], 0.15); g.fillRect(lx - 1, ly - 2, 1, 1);
    };
    log(292, 276); log(302, 276); log(312, 276); log(297, 269); log(307, 269); log(302, 262);
  },

  // HARD A — the muster: ranked spears before the palisade, the standard high,
  // a mounted captain, the town smoking peacefully behind the wall
  _sc_muster(g, th, t) {
    // rooflines peeking over the wall (eaves tucked behind the palisade) + smoke
    for (const [rx, rw] of [[52, 30], [110, 26], [186, 34], [252, 26], [306, 30]]) {
      for (let i = 0; i <= (rw >> 1); i++) {
        g.fillStyle = i % 4 === 0 ? th.roof[0] : (i % 4 === 2 ? this.shade(th.roof[1], 0.06) : th.roof[1]);
        g.fillRect(rx + i, 212 - (rw >> 1) + i, rw - i * 2, 1);
      }
      g.fillStyle = th.thatchHi; g.fillRect(rx + (rw >> 1) - 1, 212 - (rw >> 1), 3, 1);
    }
    this._smokeCol(g, th, 66, 196, t); this._smokeCol(g, th, 200, 192, t + 400); this._smokeCol(g, th, 320, 196, t + 900);
    // palisade + gate + flanking towers
    this._wallRun(g, th, 16, 384, 224, 18);
    g.fillStyle = th.wood[0]; g.fillRect(186, 206, 26, 18);
    g.fillStyle = th.wood[2]; g.fillRect(186, 206, 26, 1); g.fillRect(198, 206, 2, 18);
    for (let i = 0; i < 9; i++) { g.fillStyle = this.shade(th.wood[0], 0.1); g.fillRect(188 + i * 2, 208 + i, 1, 1); g.fillRect(210 - i * 2, 208 + i, 1, 1); }
    this._towerV(g, th, 152, 224, 26, t);
    this._towerV(g, th, 236, 224, 26, t + 300);
    // the rear rank first (drawn behind), staggered between the front files
    for (let i = 0; i < 11; i++) {
      const sx = 63 + i * 26;
      if (sx > 290) break;
      this._dude(g, th, sx, 276, '#4e5a76', { helm: true, spear: true });
    }
    // the front rank: a dressed shield-wall, every shield the clan's colour
    for (let i = 0; i < 11; i++) {
      const sx = 50 + i * 26, sway = Math.sin(t / 600 + i) * 0.8;
      if (sx > 296) break;
      this._dude(g, th, (sx + sway) | 0, 290, '#5a6a8a', { helm: true, spear: true, shield: th.banner });
    }
    // colours, horn and drum at the centre
    this._dude(g, th, 196, 262, '#8a3a3a', { helm: true });
    this._flag(g, th, 202, 262, 28, th.banner2, t);
    this._dude(g, th, 174, 288, '#6a5a3a');
    g.fillStyle = th.wood[1]; g.fillRect(178, 282, 6, 5); g.fillStyle = th.wood[0]; g.fillRect(178, 282, 6, 1);
    // the mounted captain on the right flank
    const mx = 330, my = 280, bob = Math.sin(t / 420) * 0.8;
    g.globalAlpha = 0.22; g.fillStyle = '#000000'; g.fillRect(mx - 7, my, 16, 1); g.globalAlpha = 1;
    g.fillStyle = th.wood[2];
    g.fillRect(mx - 6, (my - 8 + bob) | 0, 13, 5);
    g.fillRect(mx + 6, (my - 12 + bob) | 0, 3, 5); g.fillRect(mx + 8, (my - 13 + bob) | 0, 3, 3);
    g.fillStyle = th.wood[0]; g.fillRect(mx - 6, (my - 9 + bob) | 0, 2, 2); g.fillRect(mx + 6, (my - 13 + bob) | 0, 1, 3);
    g.fillStyle = '#241a10';
    g.fillRect(mx - 5, (my - 3 + bob) | 0, 1, 3); g.fillRect(mx - 1, (my - 3 + bob) | 0, 1, 3);
    g.fillRect(mx + 3, (my - 3 + bob) | 0, 1, 3); g.fillRect(mx + 5, (my - 3 + bob) | 0, 1, 3);
    this._dude(g, th, mx - 2, (my - 10 + bob) | 0, '#8a3a3a', { helm: true, spear: true });
  },

  // HARD B — the stronghold: a stone keep and curtain wall, braziers burning,
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
