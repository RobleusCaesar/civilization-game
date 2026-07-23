"use strict";
/* Victory — "A New Dawn": the celebration scene. The mirror of js/defeatart.js:
   the same handcrafted pixel canvas (200×150, CSS-upscaled), but alive — smoke
   from warm chimneys, waving banners, villagers in the lanes. The SCENE answers
   to the difficulty you conquered: Calm shows a simple thriving hamlet (or
   fisherfolk hauling their catch), Moderate a developed town (or a house being
   raised), Hard a fortified town with its army mustered. Each difficulty owns a
   couple of variations, and the LIGHT is drawn fresh each victory — morning,
   midday or evening. The poetic subtitle answers to the land you won. */
const VictoryArt = {
  W: 200, H: 150,

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

  // capture the won game's SETTING (landform), SCENE (by difficulty, with
  // variations) and LIGHT (a fresh time of day each victory)
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
      orb: { x: 42, y: 46, r: 14, body: '#fff3c8', crown: '#ffffff', glow: '#ffe9b0', ray: true },
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
      orb: { x: 104, y: 24, r: 12, body: '#fff8d8', crown: '#ffffff', glow: '#fff2c0', ray: true },
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
      orb: { x: 152, y: 54, r: 15, body: '#ffcf7a', crown: '#ffe6a6', glow: '#f0955a', ray: true },
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

  // ---- pixel helpers (same idiom as Defeat) ----
  lerp(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = pa >> 16, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = pb >> 16, bg = (pb >> 8) & 255, bb = pb & 255;
    return 'rgb(' + ((ar + (br - ar) * t) | 0) + ',' + ((ag + (bg - ag) * t) | 0) + ',' + ((ab + (bb - ab) * t) | 0) + ')';
  },
  disc(g, cx, cy, r) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) g.fillRect(cx + dx, cy + dy, 1, 1); },
  blob(g, cx, cy, rw, rh) {
    const rw2 = rw * rw, rh2 = rh * rh;
    for (let dy = -rh; dy <= rh; dy++) for (let dx = -rw; dx <= rw; dx++)
      if (dx * dx * rh2 + dy * dy * rw2 <= rw2 * rh2) g.fillRect((cx + dx) | 0, (cy + dy) | 0, 1, 1);
  },

  _seed() {
    this._stars = []; for (let i = 0; i < 30; i++) this._stars.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * 60) | 0, p: Math.random() * 6.28, b: 0.4 + Math.random() * 0.6 });
    // celebration motes: golden sparks rising, pale petals drifting down
    this._motes = []; for (let i = 0; i < 26; i++) this._motes.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * this.H) | 0, sp: 3 + Math.random() * 6, p: Math.random() * 6.28, g: 0.2 + Math.random() * 0.45, e: Math.random() < 0.55 });
    this._tufts = []; for (let i = 0; i < 80; i++) { const y = 96 + (Math.random() * 54) | 0; this._tufts.push({ x: (Math.random() * this.W) | 0, y, h: 1 + (Math.random() * 2) | 0, lit: Math.random() < 0.35 }); }
    this._cloudSeed = [{ x: 170, y: 20, w: 24, h: 4 }, { x: 60, y: 34, w: 18, h: 3 }, { x: 120, y: 14, w: 20, h: 3 }, { x: 20, y: 26, w: 15, h: 3 }];
  },

  draw(cv, t) {
    const g = cv.getContext('2d');
    if (cv.width !== this.W) { cv.width = this.W; cv.height = this.H; }
    g.imageSmoothingEnabled = false;
    const W = this.W, H = this.H, HZ = 92;
    const th = this.theme(), lf = this.landform || 'valley';

    // --- sky ---
    for (let y = 0; y < HZ; y++) g.fillStyle = this.lerp(th.sky[0], th.sky[1], y / HZ), g.fillRect(0, y, W, 1);
    if (th.starA > 0) { for (const s of this._stars) { g.globalAlpha = th.starA * s.b * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 700 + s.p))); g.fillStyle = '#f2ead0'; g.fillRect(s.x, s.y, 1, 1); } g.globalAlpha = 1; }
    this._orb(g, th, t);
    this._clouds(g, th, t);

    // --- background terrain by landform ---
    if (lf === 'highlands') this._peaks(g, th);
    else this._ridges(g, th);
    if (lf === 'valley') this._pines(g, th);

    // light morning mist over the horizon
    for (let k = 0; k < 5; k++) { const fx = ((t / 45 + k * 44) % (W + 90)) - 45; g.globalAlpha = th.fogA; g.fillStyle = th.fog; this.blob(g, fx, HZ - 2 + (k % 2) * 4, 40, 4); }
    g.globalAlpha = 1;

    // a glinting lake band for the water lands (the fishing scene brings its own)
    const sceneHasWater = this.scene === 'fishing';
    if ((lf === 'lakeland' || lf === 'islands') && !sceneHasWater) this._lakeBand(g, th, t, HZ, 10);

    // --- ground ---
    const groundTop = (lf === 'lakeland' || lf === 'islands') && !sceneHasWater ? HZ + 10 : HZ;
    for (let y = groundTop; y < H; y++) g.fillStyle = this.lerp(th.grass[0], th.grass[1], (y - groundTop) / Math.max(1, H - groundTop)), g.fillRect(0, y, W, 1);
    for (const tf of this._tufts) { if (tf.y < groundTop + 2) continue; g.fillStyle = tf.lit ? th.tuft[0] : th.tuft[1]; g.fillRect(tf.x, tf.y, 1, tf.h); }

    // --- the scene itself ---
    const fn = this['_sc_' + this.scene] || this._sc_hamlet;
    fn.call(this, g, th, t, groundTop);

    this._doves(g, th, t);
    this._drawMotes(g, t);
    this._vignette(g, th);
  },

  _orb(g, th, t) {
    const o = th.orb, mx = o.x, my = o.y, mr = o.r;
    g.fillStyle = o.glow; for (let h = 0; h < 4; h++) { g.globalAlpha = 0.06 - h * 0.01; this.disc(g, mx, my, mr + 13 - h * 3); }
    g.globalAlpha = 1;
    if (o.ray) {
      g.globalAlpha = 0.08; g.fillStyle = o.glow;
      for (let a = 0; a < 8; a++) { const an = a / 8 * 6.28 + t / 4000; for (let r = mr + 2; r < mr + 20; r++) g.fillRect((mx + Math.cos(an) * r) | 0, (my + Math.sin(an) * r) | 0, 1, 1); }
      g.globalAlpha = 1;
    }
    g.fillStyle = o.body; this.disc(g, mx, my, mr);
    g.fillStyle = o.crown; this.disc(g, mx, my, mr - 5);
    g.fillStyle = o.crown; this.disc(g, mx - 5, my - 5, 3);
  },
  _clouds(g, th, t) {
    for (const c of this._cloudSeed) {
      const cx = ((c.x + t / 100) % (this.W + 60)) - 30;
      g.globalAlpha = th.cloud[2]; g.fillStyle = th.cloud[0]; this.blob(g, cx, c.y, c.w, c.h);
      g.globalAlpha = th.cloud[2] * 0.8; g.fillStyle = th.cloud[1]; this.blob(g, cx + 4, c.y - 1, c.w - 6, c.h - 1);
    }
    g.globalAlpha = 1;
  },
  _ridges(g, th) {
    const HZ = 92, W = this.W;
    const ridge = (bx, peak, halfw) => {
      for (let dx = -halfw; dx <= halfw; dx++) {
        const x = bx + dx; if (x < 0 || x >= W) continue;
        const top = HZ - (peak * (1 - Math.abs(dx) / halfw)) | 0;
        g.fillStyle = dx > 0 ? th.ridge[1] : th.ridge[0];
        for (let y = top; y < HZ; y++) g.fillRect(x, y, 1, 1);
      }
    };
    ridge(40, 20, 42); ridge(120, 26, 40); ridge(184, 22, 30);
  },
  _peaks(g, th) {
    const HZ = 92, W = this.W;
    const peak = (bx, h, hw, snow) => {
      for (let dx = -hw; dx <= hw; dx++) {
        const x = bx + dx; if (x < 0 || x >= W) continue;
        const jag = (Math.abs(dx) % 5 < 2 ? 2 : 0);
        const top = (HZ - h * (1 - Math.abs(dx) / hw) + jag) | 0;
        g.fillStyle = dx > 0 ? th.jag[1] : th.jag[0];
        for (let y = top; y < HZ; y++) g.fillRect(x, y, 1, 1);
        if (snow && dx <= 1) { g.fillStyle = '#eef2f8'; for (let y = top; y < top + 3 + (2 - Math.abs(dx)); y++) g.fillRect(x, y, 1, 1); }
      }
    };
    peak(46, 44, 34, true); peak(120, 52, 30, true); peak(180, 38, 26, true);
  },
  _pines(g, th) {
    const HZ = 92;
    for (let i = 0; i < 26; i++) {
      const x = 2 + i * 8 + ((i * 37) % 5), base = HZ + 1, h = 8 + ((i * 53) % 6);
      g.fillStyle = th.sil;
      for (let r = 0; r < 4; r++) { const w = r * 2 + 1; g.fillRect(x - r, base - h + r * (h / 4), w, (h / 4) | 0 + 1); }
      g.fillStyle = th.silEdge; g.fillRect(x - 2, base - 2, 1, 2);
    }
  },
  _lakeBand(g, th, t, y0, hgt) {
    const W = this.W, y1 = y0 + hgt;
    for (let y = y0; y < y1; y++) g.fillStyle = this.lerp(th.water[0], th.water[1], (y - y0) / hgt), g.fillRect(0, y, W, 1);
    g.globalAlpha = 0.35; g.fillStyle = th.orb.body;
    for (let y = y0; y < y1; y++) g.fillRect((th.orb.x - 2 + Math.sin(t / 300 + y) * 1.5) | 0, y, 4, 1);
    g.globalAlpha = 0.25; g.fillStyle = th.foam;
    for (let k = 0; k < 4; k++) { const ry = y0 + 2 + k * 2, off = (t / 220 + k * 30) % W; g.fillRect(off | 0, ry, 6, 1); }
    g.globalAlpha = 1;
  },

  /* ---- shared set-dressing ---- */
  // a warm lived-in house: timber walls, thatch roof, lit window, optional smoke
  _house(g, th, x, y, w, h, opt) {
    opt = opt || {};
    g.fillStyle = th.wood[1]; g.fillRect(x, y - h, w, h);
    g.fillStyle = th.wood[2]; g.fillRect(x, y - h, 1, h); g.fillRect(x, y - h, w, 1);
    // thatch roof — wide eaves at the wall-top, narrowing up to the ridge
    for (let i = 0; i <= (w >> 1); i++) {
      g.fillStyle = i % 3 ? th.roof[1] : th.roof[0];
      g.fillRect(x - 1 + i, y - h - 1 - i, w + 2 - i * 2, 1);
    }
    g.fillStyle = th.thatchHi; g.fillRect(x + (w >> 1), y - h - 1 - (w >> 1), 1, 1);
    // door + one warm window breathing
    g.fillStyle = th.wood[0]; g.fillRect(x + 2, y - 4, 2, 4);
    const warm = 0.6 + 0.4 * Math.sin((opt.t || 0) / 340 + x);
    g.globalAlpha = 0.65 + warm * 0.35; g.fillStyle = th.win; g.fillRect(x + w - 4, y - 5, 2, 2);
    g.globalAlpha = 1;
    if (opt.smoke) this._smokeCol(g, th, x + w - 2, y - h - (w >> 1) - 2, opt.t || 0);
  },
  _smokeCol(g, th, x, y, t) {
    for (let k = 0; k < 14; k++) {
      const yy = y - k * 2, wob = Math.sin(t / 480 + k * 0.5) * 2.4;
      g.globalAlpha = 0.16 * (1 - k / 14); g.fillStyle = th.smoke;
      g.fillRect((x + wob) | 0, yy, 2, 2);
    }
    g.globalAlpha = 1;
  },
  // banner pole with a fluttering pennant
  _flag(g, th, x, y, hgt, col, t) {
    g.fillStyle = th.wood[2]; g.fillRect(x, y - hgt, 1, hgt);
    g.fillStyle = col;
    for (let i = 0; i < 7; i++) {
      const fy = y - hgt + 1 + (Math.sin(t / 240 + i * 0.8) * 1.2) | 0;
      g.fillRect(x + 1 + i, fy, 1, 3 - (i > 4 ? 1 : 0));
    }
    g.fillStyle = th.banner2; g.fillRect(x, y - hgt - 1, 1, 1);
  },
  // a tiny person: head, tunic, legs — with soldier / builder trimmings
  _dude(g, th, x, y, tunic, opt) {
    opt = opt || {};
    g.fillStyle = opt.helm ? th.helm : th.skin; g.fillRect(x, y - 6, 2, 2);
    g.fillStyle = tunic; g.fillRect(x, y - 4, 2, 3);
    g.fillStyle = '#241a10'; g.fillRect(x, y - 1, 1, 1); g.fillRect(x + 1, y - 1, 1, 1);
    if (opt.spear) { g.fillStyle = th.wood[2]; g.fillRect(x + 2, y - 10, 1, 10); g.fillStyle = th.metal; g.fillRect(x + 2, y - 11, 1, 2); }
    if (opt.shield) { g.fillStyle = opt.shield; g.fillRect(x - 1, y - 4, 1, 3); }
    if (opt.hammer != null) {   // an arm swinging a mallet, mid-build
      const up = Math.sin(opt.hammer) > 0;
      g.fillStyle = th.wood[3]; g.fillRect(x + 2, y - (up ? 8 : 5), 1, 2);
      g.fillStyle = th.metal; g.fillRect(x + 2, y - (up ? 9 : 6), 1, 1);
    }
  },
  _towerV(g, th, x, y, h, t) {
    g.fillStyle = th.wood[1]; g.fillRect(x, y - h, 5, h);
    g.fillStyle = th.wood[2]; g.fillRect(x, y - h, 1, h);
    g.fillStyle = th.wood[0]; g.fillRect(x - 1, y - h - 2, 7, 2);
    g.fillStyle = th.wood[2]; g.fillRect(x - 1, y - h - 3, 2, 1); g.fillRect(x + 2, y - h - 3, 2, 1); g.fillRect(x + 5, y - h - 3, 1, 1);
    this._flag(g, th, x + 2, y - h - 3, 6, th.banner, t);
  },
  _wallRun(g, th, x0, x1, y, hgt) {
    g.fillStyle = th.wood[1]; g.fillRect(x0, y - hgt, x1 - x0, hgt);
    g.fillStyle = th.wood[0];
    for (let x = x0; x < x1; x += 3) g.fillRect(x, y - hgt - 1, 2, 1);
    g.fillStyle = th.wood[2]; g.fillRect(x0, y - hgt, x1 - x0, 1);
  },
  _doves(g, th, t) {
    for (let i = 0; i < 3; i++) {
      const bx = ((t / (26 + i * 7) + i * 80) % (this.W + 30)) - 15;
      const by = 26 + i * 9 + Math.sin(t / 400 + i * 2) * 3;
      const flap = Math.sin(t / 130 + i * 1.7) > 0 ? 1 : 0;
      g.fillStyle = th.tod === 'evening' ? '#d8cfc4' : '#f2f4f6';
      g.fillRect(bx | 0, by | 0, 2, 1);
      g.fillRect((bx - 1) | 0, (by - flap) | 0, 1, 1); g.fillRect((bx + 2) | 0, (by - flap) | 0, 1, 1);
    }
  },
  _drawMotes(g, t) {
    const H = this.H, W = this.W;
    for (const m of this._motes) {
      const y = m.e ? (m.y - t * m.sp * 0.32) : (m.y + t * m.sp * 0.4);
      const yy = ((y % (H + 10)) + (H + 10)) % (H + 10) - 5;
      const xx = (m.x + Math.sin(t / 620 + m.p) * 4) | 0;
      g.globalAlpha = m.g * (m.e ? 0.5 + 0.5 * Math.sin(t / 200 + m.p) : 0.7);
      g.fillStyle = m.e ? '#f0c051' : '#e9cfd6';
      g.fillRect(((xx % W) + W) % W, yy | 0, 1, 1);
    }
    g.globalAlpha = 1;
  },
  _vignette(g, th) {
    const W = this.W, H = this.H, depth = 20;
    for (let d = 0; d < depth; d++) {
      g.globalAlpha = th.vigA * (1 - d / depth) + 0.012; g.fillStyle = th.vignette;
      g.fillRect(d, d, W - 2 * d, 1); g.fillRect(d, H - 1 - d, W - 2 * d, 1);
      g.fillRect(d, d, 1, H - 2 * d); g.fillRect(W - 1 - d, d, 1, H - 2 * d);
    }
    g.globalAlpha = 1;
  },

  /* ================= THE SCENES ================= */

  // CALM A — a simple thriving hamlet: one warm cabin, tended crop rows,
  // two villagers idling up the lane, wash on a line
  _sc_hamlet(g, th, t) {
    this._house(g, th, 26, 122, 22, 14, { t, smoke: true });
    this._house(g, th, 62, 110, 14, 9, { t });
    // crop rows, combed and green
    for (let r = 0; r < 5; r++) {
      const ry = 112 + r * 6;
      g.fillStyle = th.tuft[1]; g.fillRect(104, ry, 78, 2);
      g.fillStyle = th.tuft[0];
      for (let x = 106; x < 180; x += 4) g.fillRect(x, ry - 1, 1, 2);
    }
    // wash-line between two posts, sheets luffing
    g.fillStyle = th.wood[2]; g.fillRect(58, 128, 1, 10); g.fillRect(86, 128, 1, 10);
    g.fillStyle = th.wood[0]; g.fillRect(59, 129, 27, 1);
    g.fillStyle = '#e8ecef';
    for (let i = 0; i < 3; i++) { const wx = 62 + i * 8, luff = Math.sin(t / 320 + i) * 1; g.fillRect(wx, 130, 5, (3 + luff) | 0); }
    // villagers on the lane
    const stroll = Math.sin(t / 900) * 6;
    this._dude(g, th, (120 + stroll) | 0, 142, '#7a5a34');
    this._dude(g, th, (128 + stroll) | 0, 143, '#8a6a86');
    this._dude(g, th, 40, 138, '#5a7a44');
  },

  // CALM B — fisherfolk pulling fish from the river: a bright band of water,
  // two rods bent to the current, a full basket, fish leaping silver
  _sc_fishing(g, th, t) {
    // the river crossing the meadow
    const y0 = 108, y1 = 128;
    for (let y = y0; y < y1; y++) g.fillStyle = this.lerp(th.water[0], th.water[1], (y - y0) / (y1 - y0)), g.fillRect(0, y, this.W, 1);
    g.globalAlpha = 0.3; g.fillStyle = th.foam;
    for (let k = 0; k < 5; k++) { const ry = y0 + 2 + k * 4, off = (t / 190 + k * 26) % this.W; g.fillRect(off | 0, ry, 7, 1); g.fillRect(((off + 60) % this.W) | 0, ry, 4, 1); }
    g.globalAlpha = 1;
    // far bank cabin with smoke
    this._house(g, th, 18, 104, 18, 11, { t, smoke: true });
    // two fishers on the near bank, rods out over the water
    const bend = Math.sin(t / 500) * 1.5;
    const fisher = (x, face) => {
      this._dude(g, th, x, 140, '#5a6a8a');
      g.fillStyle = th.wood[3];
      for (let i = 0; i < 8; i++) g.fillRect(x + face * (2 + i), 134 - (i > 4 ? i - 4 : 0), 1, 1);
      g.fillStyle = '#cfd8de';
      g.fillRect(x + face * 10, (127 + bend) | 0, 1, Math.max(1, (7 - bend) | 0));   // the line, taut to the water
    };
    fisher(70, 1); fisher(150, -1);
    // silver fish leaping in arcs
    for (let f = 0; f < 2; f++) {
      const ph = ((t / 1400) + f * 0.5) % 1;
      const fx = 88 + f * 34 + ph * 22, fy = y0 + 8 - Math.sin(Math.PI * ph) * 10;
      g.fillStyle = '#dfe8ee'; g.fillRect(fx | 0, fy | 0, 3, 1); g.fillRect((fx + (ph > 0.5 ? -1 : 3)) | 0, (fy - 1) | 0, 1, 1);
      g.globalAlpha = 0.5; g.fillStyle = th.foam; g.fillRect((88 + f * 34 + 22) | 0, y0 + 7, 2, 1); g.globalAlpha = 1;
    }
    // the day's catch: a basket brimming with silver
    g.fillStyle = th.wood[1]; g.fillRect(108, 136, 9, 5);
    g.fillStyle = th.wood[0]; g.fillRect(108, 136, 9, 1);
    g.fillStyle = '#d4dde4'; g.fillRect(109, 134, 3, 2); g.fillRect(113, 133, 3, 2); g.fillRect(111, 132, 2, 2);
  },

  // MODERATE A — a developed town: the great hall flying colours, a lane of
  // houses, a striped market stall, folk about their business
  _sc_town(g, th, t) {
    // great hall
    g.fillStyle = th.wood[1]; g.fillRect(78, 96, 30, 20);
    g.fillStyle = th.wood[2]; g.fillRect(78, 96, 1, 20); g.fillRect(78, 96, 30, 1);
    for (let i = 0; i < 34; i++) { g.fillStyle = i % 3 ? th.roof[1] : th.roof[0]; const a = Math.abs(i - 16) >> 1; g.fillRect(76 + i, 86 + a, 1, 10 - a); }
    g.fillStyle = th.wood[0]; g.fillRect(90, 108, 4, 8);
    const warm = 0.6 + 0.4 * Math.sin(t / 300);
    g.globalAlpha = 0.6 + warm * 0.4; g.fillStyle = th.win; g.fillRect(83, 102, 2, 3); g.fillRect(101, 102, 2, 3); g.globalAlpha = 1;
    this._flag(g, th, 85, 86, 8, th.banner, t);
    this._smokeCol(g, th, 100, 84, t);
    // houses down the lane
    this._house(g, th, 16, 116, 18, 11, { t, smoke: true });
    this._house(g, th, 44, 120, 16, 10, { t });
    this._house(g, th, 122, 118, 18, 11, { t, smoke: true });
    // market stall: striped awning over crates
    g.fillStyle = th.wood[2]; g.fillRect(154, 118, 1, 12); g.fillRect(172, 118, 1, 12);
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 4 < 2 ? th.banner2 : '#eef0e6'; g.fillRect(154 + i, 116 + (i % 2), 1, 2); }
    g.fillStyle = th.wood[1]; g.fillRect(156, 126, 6, 4); g.fillRect(164, 127, 5, 3);
    g.fillStyle = '#b8434d'; g.fillRect(157, 125, 2, 1); g.fillStyle = th.banner2; g.fillRect(165, 126, 2, 1);
    // townsfolk
    const drift = Math.sin(t / 800) * 5;
    this._dude(g, th, (60 + drift) | 0, 140, '#7a5a34');
    this._dude(g, th, (70 + drift) | 0, 141, '#8a6a86');
    this._dude(g, th, 112, 138, '#5a7a44');
    this._dude(g, th, 160, 140, '#a06a4a');
    this._dude(g, th, 30, 143, '#5a6a8a');
  },

  // MODERATE B — raising a new house: the frame is up, builders swing mallets,
  // a finished neighbour smokes beside the log pile
  _sc_raising(g, th, t) {
    this._house(g, th, 20, 120, 20, 13, { t, smoke: true });
    // the new frame: posts, beam, rafters — bones of a home
    const fx = 92, fy = 122, fw = 26, fh = 15;
    g.fillStyle = th.wood[3];
    g.fillRect(fx, fy - fh, 2, fh); g.fillRect(fx + fw - 2, fy - fh, 2, fh);
    g.fillRect(fx + (fw >> 1) - 1, fy - fh - 5, 2, fh + 5);
    g.fillRect(fx, fy - fh, fw, 1);
    for (let i = 0; i <= (fw >> 1); i += 3) {
      g.fillStyle = th.wood[2];
      g.fillRect(fx + i, fy - fh - ((i * 5 / (fw >> 1)) | 0), 1, 1);
      g.fillRect(fx + fw - 1 - i, fy - fh - ((i * 5 / (fw >> 1)) | 0), 1, 1);
    }
    // scaffold plank + climbing builder
    g.fillStyle = th.wood[1]; g.fillRect(fx - 4, fy - 8, fw + 8, 1);
    this._dude(g, th, fx + 4, fy - 9, '#a06a4a', { hammer: t / 180 });
    this._dude(g, th, fx + fw - 6, fy, '#5a6a8a', { hammer: t / 180 + 2 });
    // a hauler walking a plank over
    const hx = (60 + ((t / 60) % 70)) | 0;
    this._dude(g, th, hx, 141, '#7a5a34');
    g.fillStyle = th.wood[3]; g.fillRect(hx - 2, 133, 7, 1);
    // the log pile
    g.fillStyle = th.wood[1];
    for (const [lx, ly] of [[142, 138], [148, 138], [154, 138], [145, 135], [151, 135], [148, 132]]) {
      this.disc(g, lx, ly, 2);
      g.fillStyle = th.thatchHi; g.fillRect(lx, ly, 1, 1); g.fillStyle = th.wood[1];
    }
  },

  // HARD A — the muster: the army ranked before the walls, banners high,
  // the thriving town smoking peacefully behind the palisade
  _sc_muster(g, th, t) {
    // town behind the wall: rooflines + smoke
    for (const [rx, rw] of [[30, 14], [58, 12], [96, 16], [130, 12], [156, 14]]) {
      for (let i = 0; i <= (rw >> 1); i++) { g.fillStyle = i % 3 ? th.roof[1] : th.roof[0]; g.fillRect(rx + i, 96 - (rw >> 1) + i - 0, rw - i * 2, 1); }
    }
    this._smokeCol(g, th, 38, 88, t); this._smokeCol(g, th, 102, 86, t + 400); this._smokeCol(g, th, 162, 88, t + 900);
    // palisade with gate + towers
    this._wallRun(g, th, 8, 192, 112, 9);
    g.fillStyle = th.wood[0]; g.fillRect(94, 103, 12, 9);
    g.fillStyle = th.wood[2]; g.fillRect(94, 103, 12, 1); g.fillRect(99, 103, 1, 9);
    this._towerV(g, th, 78, 112, 16, t);
    this._towerV(g, th, 116, 112, 16, t + 300);
    // the ranked army — spearmen in file, shields dressed
    for (let i = 0; i < 8; i++) {
      const sx = 32 + i * 18, sway = Math.sin(t / 600 + i) * 0.6;
      this._dude(g, th, (sx + sway) | 0, 134, '#5a6a8a', { helm: true, spear: true, shield: th.banner });
    }
    // second rank, staggered
    for (let i = 0; i < 7; i++) {
      const sx = 41 + i * 18;
      this._dude(g, th, sx, 142, '#4e5a76', { helm: true, spear: true });
    }
    // the standard-bearer, colours flying
    this._dude(g, th, 100, 133, '#8a3a3a', { helm: true });
    this._flag(g, th, 103, 133, 14, th.banner2, t);
  },

  // HARD B — the stronghold: gatehouse and towers, a catapult at rest, the
  // patrol on the wall-walk, watch-fires burning as the town thrives behind
  _sc_stronghold(g, th, t) {
    // dense rooftops + keep behind the wall
    for (const [rx, rw] of [[22, 12], [44, 16], [70, 12], [126, 14], [154, 12], [172, 10]]) {
      for (let i = 0; i <= (rw >> 1); i++) { g.fillStyle = i % 3 ? th.roof[1] : th.roof[0]; g.fillRect(rx + i, 97 - (rw >> 1) + i, rw - i * 2, 1); }
    }
    // the keep
    g.fillStyle = th.wood[1]; g.fillRect(92, 78, 14, 22);
    g.fillStyle = th.wood[2]; g.fillRect(92, 78, 1, 22); g.fillRect(92, 78, 14, 1);
    g.fillStyle = th.wood[0]; g.fillRect(91, 76, 16, 2);
    const warm = 0.6 + 0.4 * Math.sin(t / 280);
    g.globalAlpha = 0.6 + warm * 0.4; g.fillStyle = th.win; g.fillRect(96, 84, 2, 3); g.globalAlpha = 1;
    this._flag(g, th, 98, 76, 9, th.banner, t);
    this._smokeCol(g, th, 50, 88, t + 200); this._smokeCol(g, th, 132, 89, t + 800);
    // curtain wall, gatehouse, flanking towers
    this._wallRun(g, th, 6, 194, 116, 11);
    g.fillStyle = th.wood[0]; g.fillRect(90, 105, 16, 11);
    g.fillStyle = th.wood[2]; g.fillRect(90, 105, 16, 1); g.fillRect(97, 105, 2, 11);
    this._towerV(g, th, 70, 116, 20, t);
    this._towerV(g, th, 122, 116, 20, t + 500);
    // watch-fires flickering on the towers
    for (const wx of [72, 124]) {
      const fl = 0.5 + 0.5 * Math.sin(t / 160 + wx);
      g.globalAlpha = 0.5 + fl * 0.5; g.fillStyle = '#e88a3a'; g.fillRect(wx, 92, 2, 1);
      g.globalAlpha = 0.3 + fl * 0.3; g.fillStyle = '#f6c060'; g.fillRect(wx, 91, 1, 1); g.globalAlpha = 1;
    }
    // patrol walking the wall-walk
    const px = 30 + ((t / 45) % 120);
    this._dude(g, th, px | 0, 105, '#4e5a76', { helm: true, spear: true });
    // a catapult standing down by the gate
    const cx = 152, cy = 140;
    g.fillStyle = th.wood[1]; g.fillRect(cx - 7, cy - 3, 14, 3);
    g.fillStyle = th.wood[0]; this.disc(g, cx - 5, cy, 2); this.disc(g, cx + 5, cy, 2);
    g.fillStyle = th.wood[3]; for (let i = 0; i < 8; i++) g.fillRect(cx - 2 + i, cy - 4 - i, 1, 1);
    g.fillStyle = th.wood[2]; g.fillRect(cx + 6, cy - 13, 3, 2);
    // honour guard at the gate
    this._dude(g, th, 84, 134, '#5a6a8a', { helm: true, spear: true, shield: th.banner });
    this._dude(g, th, 112, 134, '#5a6a8a', { helm: true, spear: true, shield: th.banner });
    this._dude(g, th, 98, 143, '#8a3a3a', { helm: true });
    this._flag(g, th, 101, 143, 12, th.banner2, t + 200);
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
