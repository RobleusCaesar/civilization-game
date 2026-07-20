"use strict";
/* Defeat — the Game Over scene: "The Last Fire". A fresh grave with a wooden
   marker and two ravens keeps the foreground; a dead campfire smoulders beside
   it; the ruined village stands on the midground. The SETTING changes with the
   map you fell on — a forested valley, a land of still lakes, rugged highlands,
   or a drowning chain of islands — and the LIGHT changes with the difficulty:
   bright day on Calm, a burning dusk on Moderate, deep night on Hard. Drawn at
   native pixel resolution (CSS-upscaled, pixelated) so it reads as handcrafted
   art. No score is shown for a defeat — the clan passes quietly into history. */
const Defeat = {
  W: 200, H: 150,

  TITLES: [
    'THE FIRE HAS GONE OUT',
    'THE VILLAGE IS SILENT',
    'YOUR CLAN IS NO MORE',
    'SWALLOWED BY THE DARK',
  ],
  // the poetic subtitle now answers to the LAND that outlived you
  SUB_BY_LF: {
    valley: [
      'The forest takes back what was borrowed.',
      'The valley forgets. Grass grows over the ashes.',
      'The trees close over the last of the paths.',
    ],
    lakeland: [
      'The still water keeps your reflection, and nothing else.',
      'The lakes drink the last of the smoke.',
      'Reeds lean over where the hearths once burned.',
    ],
    highlands: [
      'The mountains outlast every crown.',
      'The high stones forget your name first.',
      'The peaks were here before you, and shall remain.',
    ],
    islands: [
      'The ocean claims its own.',
      'The tide takes the last footprint from the sand.',
      'The sea rises, patient, and remembers no one.',
    ],
  },
  SUBTITLES: [   // fallback when the landform is unknown
    'Nature remembers no kingdoms.',
    'Your people became a story.',
    'The last hearth is cold, and no one came.',
  ],
  EPITAPHS: [
    'From ash, we began. From memory, we return.',
    'History begins with someone trying again.',
    'Every land waits for another beginning.',
  ],
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  epitaph() { return this.pick(this.EPITAPHS); },
  title() { return this.pick(this.TITLES); },
  subtitle() {
    const pool = this.SUB_BY_LF[this.landform] || this.SUBTITLES;
    return this.pick(pool);
  },

  // capture the fallen game's SETTING (landform) and LIGHT (time of day by
  // difficulty), called once as the Game Over screen opens
  begin(landform, mode) {
    this.landform = landform && this.SUB_BY_LF[landform] ? landform : 'valley';
    this.tod = mode === 'calm' ? 'day' : mode === 'hard' ? 'night' : 'dusk';
    this._seed();
  },

  /* ---- time-of-day palettes: the same scene under three skies ---- */
  TOD: {
    day: {   // Calm — a clear, gentle daylight
      sky: ['#8db6e0', '#cfe4f2'], starA: 0,
      orb: { x: 150, y: 30, r: 13, body: '#fff6d2', shade: '#f4e79a', glow: '#fff2c0', crown: '#ffffff', maria: false, ray: true },
      cloud: ['#eef4fb', '#ffffff', 0.75],
      ridge: ['#8aa0c0', '#6f86a6'], jag: ['#8a94a4', '#6e7889'],
      fog: '#e2eef6', fogA: 0.10,
      sil: '#3b4a3c', silEdge: '#54684f',
      rim: '#f2e4ac',                                   // warm sunlight highlight
      grass: ['#5a8646', '#2e4a24'], tuft: ['#74ad56', '#33512a'],
      earth: ['#3a2a18', '#513c24', '#6c5030'],
      water: ['#4f88b6', '#2f6a97'], foam: '#dceff6',
      vignette: '#16240f', vigA: 0.05,
    },
    dusk: {   // Moderate — a low, burning sunset
      sky: ['#33305e', '#e79457'], starA: 0.45,
      orb: { x: 150, y: 58, r: 16, body: '#ffcf7a', shade: '#ef9540', glow: '#f0895a', crown: '#ffe6a6', maria: false, ray: true },
      cloud: ['#6a4560', '#8a5a62', 0.55],
      ridge: ['#5a4664', '#392c46'], jag: ['#4e3e56', '#332740'],
      fog: '#cf9d86', fogA: 0.09,
      sil: '#281a2b', silEdge: '#40283c',
      rim: '#f4ac64',                                   // warm sunset rim
      grass: ['#4c5a34', '#1c2014'], tuft: ['#63713e', '#222818'],
      earth: ['#271b11', '#37281b', '#4a3626'],
      water: ['#7a5a78', '#432f52'], foam: '#e6bfa0',
      vignette: '#1a0d12', vigA: 0.09,
    },
    night: {   // Hard — deep moonlit dark (the original mood)
      sky: ['#0a0c1a', '#1b2338'], starA: 1,
      orb: { x: 162, y: 30, r: 15, body: '#f2eeda', shade: '#e6e0c6', glow: '#aeb6c8', crown: '#fbf7e6', maria: true, ray: false },
      cloud: ['#232c42', '#2c3752', 0.5],
      ridge: ['#1a2233', '#141a28'], jag: ['#1c2536', '#141b29'],
      fog: '#8b93a6', fogA: 0.06,
      sil: '#0c0f18', silEdge: '#182031',
      rim: '#5c4527',                                   // cool moonlit wood edge
      grass: ['#28402a', '#0c130d'], tuft: ['#3a5638', '#132015'],
      earth: ['#1c150c', '#2b2013', '#3a2c1a'],
      water: ['#1c3550', '#0e2138'], foam: '#7f97ad',
      vignette: '#04060c', vigA: 0.10,
    },
  },
  theme() { return this.TOD[this.tod] || this.TOD.dusk; },

  // ---- pixel helpers ----
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

  // stable scatter (stars / embers / grass) so the scene doesn't shimmer randomly
  _seed() {
    this._stars = []; for (let i = 0; i < 40; i++) this._stars.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * 70) | 0, p: Math.random() * 6.28, b: 0.4 + Math.random() * 0.6 });
    this._motes = []; for (let i = 0; i < 30; i++) this._motes.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * this.H) | 0, sp: 3 + Math.random() * 7, p: Math.random() * 6.28, g: 0.2 + Math.random() * 0.5, e: Math.random() < 0.5 });
    this._tufts = []; for (let i = 0; i < 90; i++) { const y = 96 + (Math.random() * 54) | 0; this._tufts.push({ x: (Math.random() * this.W) | 0, y, h: 1 + (Math.random() * 2) | 0, lit: Math.random() < 0.3 }); }
    this._cloudSeed = [{ x: 176, y: 22, w: 26, h: 4 }, { x: 150, y: 40, w: 20, h: 3 }, { x: 40, y: 18, w: 22, h: 3 }, { x: 96, y: 30, w: 16, h: 3 }];
  },

  draw(cv, t) {
    const g = cv.getContext('2d');
    if (cv.width !== this.W) { cv.width = this.W; cv.height = this.H; }
    g.imageSmoothingEnabled = false;
    const W = this.W, H = this.H, HZ = 92;
    const th = this.theme(), lf = this.landform || 'valley';

    // --- sky ---
    for (let y = 0; y < HZ; y++) g.fillStyle = this.lerp(th.sky[0], th.sky[1], y / HZ), g.fillRect(0, y, W, 1);
    if (th.starA > 0) { for (const s of this._stars) { g.globalAlpha = th.starA * s.b * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 700 + s.p))); g.fillStyle = '#e8e0c4'; g.fillRect(s.x, s.y, 1, 1); } g.globalAlpha = 1; }

    this._orb(g, th, t);
    this._clouds(g, th, t);

    // --- background terrain, by landform ---
    if (lf === 'highlands') this._peaks(g, th);
    else this._ridges(g, th);

    // fog band settling over the horizon
    for (let k = 0; k < 6; k++) { const fx = ((t / 40 + k * 40) % (W + 90)) - 45; g.globalAlpha = th.fogA; g.fillStyle = th.fog; this.blob(g, fx, HZ - 2 + (k % 2) * 4, 40, 4); }
    g.globalAlpha = 1;

    // --- landform signature feature ---
    if (lf === 'valley') this._pines(g, th, t);
    let groundTop = HZ, spit = false;
    if (lf === 'lakeland') this._lake(g, th, t);
    else if (lf === 'islands') { this._sea(g, th, t); groundTop = H - 24; spit = true; }

    // --- the ruined village (perched on the far isle for islands, on the midground else) ---
    if (lf === 'islands') this._ruins(g, th, t, 30, HZ - 1, 0.5, false);
    else this._ruins(g, th, t, 24, HZ, 1, true);

    // --- ground floor: moonlit/sunlit grass fading to shadow at our feet ---
    for (let y = groundTop; y < H; y++) g.fillStyle = this.lerp(th.grass[0], th.grass[1], (y - groundTop) / Math.max(1, H - groundTop)), g.fillRect(0, y, W, 1);
    if (spit) {   // an island: the grass is a last shrinking spit, water lapping its edge
      g.fillStyle = th.foam; g.globalAlpha = 0.5;
      for (let x = 0; x < W; x++) { const e = groundTop + (Math.sin(t / 600 + x * 0.3) * 1.2) + (Math.sin(x * 0.7) * 1.5); g.fillRect(x, e | 0, 1, 1); }
      g.globalAlpha = 1;
    }
    for (const tf of this._tufts) { if (tf.y < groundTop) continue; g.fillStyle = tf.lit ? th.tuft[0] : th.tuft[1]; g.fillRect(tf.x, tf.y, 1, tf.h); }

    // --- foreground focus: grave, dead campfire, ravens (the constant of every loss) ---
    this._grave(g, th, t);
    this._campfire(g, th, t);
    this._ravens(g, th);
    this._drawMotes(g, t);
    this._vignette(g, th);
  },

  // the sun (day/dusk) or moon (night), high or low, with its soft halo
  _orb(g, th, t) {
    const o = th.orb, mx = o.x, my = o.y, mr = o.r;
    g.fillStyle = o.glow; for (let h = 0; h < 4; h++) { g.globalAlpha = 0.06 - h * 0.01; this.disc(g, mx, my, mr + 13 - h * 3); }
    g.globalAlpha = 1;
    if (o.ray) {   // faint warm sun-rays
      g.globalAlpha = 0.08; g.fillStyle = o.glow;
      for (let a = 0; a < 8; a++) { const an = a / 8 * 6.28 + t / 4000; for (let r = mr + 2; r < mr + 20; r++) g.fillRect((mx + Math.cos(an) * r) | 0, (my + Math.sin(an) * r) | 0, 1, 1); }
      g.globalAlpha = 1;
    }
    g.fillStyle = o.body; this.disc(g, mx, my, mr);
    if (o.maria) {   // the MOON: a terminator shading the far limb, plus dark maria
      g.fillStyle = o.shade; this.disc(g, mx + 3, my + 2, mr - 2);
      g.fillStyle = '#d3ccae'; g.fillRect(mx - 5, my - 3, 4, 3); g.fillRect(mx + 1, my + 4, 5, 3); g.fillRect(mx - 3, my + 6, 3, 2); g.fillRect(mx + 6, my - 4, 3, 2);
    } else {         // the SUN: a clean, bright, full disc with a hotter core (no bite)
      g.fillStyle = o.crown; this.disc(g, mx, my, mr - 5);
    }
    g.fillStyle = o.crown; this.disc(g, mx - 5, my - 5, 3);
  },

  _clouds(g, th, t) {
    for (const c of this._cloudSeed) {
      const cx = ((c.x + t / 90) % (this.W + 60)) - 30;
      g.globalAlpha = th.cloud[2]; g.fillStyle = th.cloud[0]; this.blob(g, cx, c.y, c.w, c.h);
      g.globalAlpha = th.cloud[2] * 0.8; g.fillStyle = th.cloud[1]; this.blob(g, cx + 4, c.y - 1, c.w - 6, c.h - 1);
    }
    g.globalAlpha = 1;
  },

  // soft rolling ridges (valley / lakeland / islands base)
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

  // rugged, jagged highland peaks — tall, sharp, snow-flecked
  _peaks(g, th) {
    const HZ = 92, W = this.W;
    const peak = (bx, h, hw, snow) => {
      for (let dx = -hw; dx <= hw; dx++) {
        const x = bx + dx; if (x < 0 || x >= W) continue;
        const jag = (Math.abs(dx) % 5 < 2 ? 2 : 0);
        const top = (HZ - h * (1 - Math.abs(dx) / hw) + jag) | 0;
        g.fillStyle = dx > 0 ? th.jag[1] : th.jag[0];
        for (let y = top; y < HZ; y++) g.fillRect(x, y, 1, 1);
        if (snow && dx <= 1) { g.fillStyle = th.tod === 'night' ? '#c8d2e2' : '#eef2f8'; for (let y = top; y < top + 3 + (2 - Math.abs(dx)); y++) g.fillRect(x, y, 1, 1); }
      }
    };
    peak(46, 44, 34, true); peak(120, 52, 30, true); peak(180, 38, 26, true);
  },

  // a pine treeline crowding the horizon (valley)
  _pines(g, th, t) {
    const HZ = 92;
    for (let i = 0; i < 26; i++) {
      const x = 2 + i * 8 + ((i * 37) % 5), base = HZ + 1, h = 8 + ((i * 53) % 6);
      g.fillStyle = th.sil;
      for (let r = 0; r < 4; r++) { const w = r * 2 + 1; g.fillRect(x - r, base - h + r * (h / 4), w, (h / 4) | 0 + 1); }
      g.fillStyle = th.silEdge; g.fillRect(x - 2, base - 2, 1, 2);
    }
  },

  // a still lake band mirroring the sky (lakeland)
  _lake(g, th, t) {
    const HZ = 92, W = this.W, y0 = HZ, y1 = HZ + 18;
    for (let y = y0; y < y1; y++) g.fillStyle = this.lerp(th.water[0], th.water[1], (y - y0) / (y1 - y0)), g.fillRect(0, y, W, 1);
    // the orb's long reflection shivering on the surface
    const o = th.orb;
    g.globalAlpha = 0.4; g.fillStyle = o.body;
    for (let y = y0; y < y1; y++) { const w = 2 + ((y - y0) % 3 === 0 ? 2 : 0); g.fillRect((o.x - w + Math.sin(t / 300 + y) * 1.5) | 0, y, w * 2, 1); }
    g.globalAlpha = 1;
    // ripple highlights
    g.globalAlpha = 0.25; g.fillStyle = th.foam;
    for (let k = 0; k < 5; k++) { const ry = y0 + 3 + k * 3, off = (t / 200 + k * 20) % W; g.fillRect(off | 0, ry, 6, 1); g.fillRect(((off + 40) % W) | 0, ry, 4, 1); }
    g.globalAlpha = 1;
    // reeds along the near bank
    g.fillStyle = th.sil; for (let i = 0; i < 12; i++) { const x = 6 + i * 16 + ((i * 7) % 4), lean = Math.sin(t / 700 + i) * 1; g.fillRect((x + lean) | 0, y1 - 6, 1, 6); g.fillRect((x + lean * 1.5) | 0, y1 - 7, 1, 1); }
  },

  // the sea, drowning the midground — waves rolling to a low far shore (islands)
  _sea(g, th, t) {
    const HZ = 92, W = this.W, y0 = HZ, y1 = this.H - 24;
    for (let y = y0; y < y1; y++) g.fillStyle = this.lerp(th.water[0], th.water[1], (y - y0) / (y1 - y0)), g.fillRect(0, y, W, 1);
    // the orb's broken reflection
    const o = th.orb;
    g.globalAlpha = 0.35; g.fillStyle = o.body;
    for (let y = y0 + 2; y < y1; y += 2) { const w = 3; g.fillRect((o.x - w + Math.sin(t / 260 + y) * 2.5) | 0, y, w * 2, 1); }
    g.globalAlpha = 1;
    // rolling wave crests (moving rows of foam)
    g.fillStyle = th.foam;
    for (let k = 0; k < 8; k++) {
      const wy = y0 + 3 + k * ((y1 - y0 - 4) / 8), drift = (t / (120 + k * 20) + k * 30) % (W + 30);
      g.globalAlpha = 0.16 + 0.05 * (k / 8);
      for (let s = 0; s < 3; s++) { const x = (drift + s * 60) % (W + 30) - 15; g.fillRect(x | 0, wy | 0, 7, 1); g.fillRect((x + 3) | 0, (wy + 1) | 0, 3, 1); }
    }
    g.globalAlpha = 1;
    // a lonely far isle on the horizon, carrying the ruins on the left
    g.fillStyle = th.ridge[1]; this.blob(g, 34, HZ + 1, 30, 5);
  },

  // the abandoned village — a caved cabin with one breathing chimney, broken
  // palisade, three ruined towers. ox/oy anchor it, sc scales it, smoke optional.
  _ruins(g, th, t, ox, oy, sc, smoke) {
    const SIL = th.sil, HZ = oy;
    const R = (x, y, w, h) => g.fillRect((ox + x * sc) | 0, (y) | 0, Math.max(1, (w * sc) | 0), Math.max(1, h | 0));
    // cabin
    g.fillStyle = SIL;
    R(0, HZ - 12, 22, 12);
    for (let i = 0; i < 8; i++) g.fillRect((ox + i * sc) | 0, (HZ - 12 - i) | 0, Math.max(1, sc | 0), i + 1);
    R(16, HZ - 20, 3, 8);                                  // chimney
    g.fillStyle = th.silEdge; R(0, HZ - 12, 1, 12);
    // one warm window still lit — a hearth not yet cold (constant across skies)
    const warm = 0.55 + 0.45 * Math.sin(t / 320);
    g.globalAlpha = 0.7 + warm * 0.3; g.fillStyle = '#e0863a'; R(6, HZ - 7, 3, 4);
    g.globalAlpha = 0.5 + warm * 0.4; g.fillStyle = '#f0b060'; R(7, HZ - 6, 1, 2);
    g.globalAlpha = 1;
    // broken palisade + collapsed towers to the right (scaled, offset from cabin)
    const bx = ox + 86 * sc;
    g.fillStyle = SIL;
    for (const [x, h] of [[0, 7], [3, 5], [6, 8], [9, 4], [12, 6]]) g.fillRect((bx + x * sc) | 0, (HZ - h) | 0, Math.max(1, sc | 0), h);
    g.fillRect((bx + 22 * sc) | 0, (HZ - 20) | 0, Math.max(1, (10 * sc) | 0), 20); g.fillRect((bx + 22 * sc) | 0, (HZ - 27) | 0, Math.max(1, (6 * sc) | 0), 9);
    g.fillRect((bx + 40 * sc) | 0, (HZ - 5) | 0, Math.max(1, (9 * sc) | 0), 5);
    g.fillRect((bx + 62 * sc) | 0, (HZ - 14) | 0, Math.max(1, (8 * sc) | 0), 14); g.fillRect((bx + 62 * sc) | 0, (HZ - 19) | 0, Math.max(1, (4 * sc) | 0), 6);
    g.fillStyle = th.silEdge; g.fillRect((bx + 22 * sc) | 0, (HZ - 20) | 0, 1, 20);
    // chimney smoke, thin and wavering (only the near, full-scale village)
    if (smoke) {
      for (let k = 0; k < 22; k++) { const yy = HZ - 21 - k * 2, wob = Math.sin(t / 500 + k * 0.45) * 3; g.globalAlpha = 0.16 * (1 - k / 22); g.fillStyle = '#39404f'; g.fillRect((ox + 16 * sc + wob) | 0, yy, 2, 2); }
      g.globalAlpha = 1;
    }
  },

  _grave(g, th, t) {
    const gx = 100, gy = 128, e = th.earth;
    g.fillStyle = e[0]; this.blob(g, gx, gy, 30, 8);
    g.fillStyle = e[1]; this.blob(g, gx, gy - 1, 25, 6);
    g.fillStyle = e[2]; this.blob(g, gx, gy - 2, 20, 4);
    // weathered wooden grave-cross, its light-facing edge catching the rim colour
    g.fillStyle = '#33261680'; g.fillRect(gx + 2, gy - 22, 4, 24);
    g.fillStyle = e[1]; g.fillRect(gx - 1, gy - 24, 3, 26); g.fillRect(gx - 6, gy - 18, 13, 3);
    g.fillStyle = th.rim; g.fillRect(gx - 1, gy - 24, 1, 26); g.fillRect(gx - 6, gy - 18, 13, 1);
    g.fillStyle = '#1a130a'; g.fillRect(gx, gy - 10, 1, 3);
    g.fillStyle = '#5c3a4a'; g.fillRect(gx - 15, gy - 1, 2, 2); g.fillStyle = '#8a5c74'; g.fillRect(gx - 15, gy - 2, 1, 1);
  },

  _campfire(g, th, t) {
    const cx = 60, cy = 134;
    g.fillStyle = '#3a3d46'; for (const [dx, dy] of [[-6, 1], [-3, 3], [1, 3], [5, 1], [4, -2], [-5, -2], [0, -3]]) this.blob(g, cx + dx, cy + dy, 2, 1);
    g.fillStyle = th.rim; for (const [dx, dy] of [[-6, 0], [5, 0], [0, -4]]) g.fillRect(cx + dx, cy + dy, 2, 1);
    g.fillStyle = '#17120e'; g.fillRect(cx - 4, cy - 1, 9, 2); g.fillRect(cx - 2, cy - 2, 6, 1);
    g.fillStyle = '#241a12'; g.fillRect(cx - 4, cy - 2, 4, 1); g.fillRect(cx + 1, cy, 4, 1);
    const em = 0.5 + 0.5 * Math.sin(t / 210 + 1);
    g.globalAlpha = 0.25 + em * 0.35; g.fillStyle = '#c24a1c'; g.fillRect(cx - 1, cy - 1, 2, 1);
    g.globalAlpha = 0.14 + em * 0.14; g.fillStyle = '#e88a3a'; g.fillRect(cx, cy - 1, 1, 1);
    g.globalAlpha = 1;
    for (let k = 0; k < 10; k++) { const yy = cy - 3 - k * 2, wob = Math.sin(t / 470 + k * 0.5) * 2; g.globalAlpha = 0.10 * (1 - k / 10); g.fillStyle = '#39404f'; g.fillRect((cx + wob) | 0, yy, 1, 2); }
    g.globalAlpha = 1;
  },

  _ravens(g, th) {
    const raven = (rx, ry, face) => {
      g.fillStyle = '#07060b';
      g.fillRect(rx, ry, 5, 3);
      g.fillRect(rx + (face > 0 ? 4 : 0), ry - 2, 2, 2);
      g.fillRect(rx + (face > 0 ? 6 : -1), ry - 1, 1, 1);
      g.fillRect(rx + (face > 0 ? 0 : 3), ry + 3, 2, 1);
      g.fillStyle = '#191722'; g.fillRect(rx + 1, ry, 3, 1);
    };
    raven(80, 122, 1); raven(118, 123, -1);
  },

  _drawMotes(g, t) {
    const H = this.H, W = this.W;
    for (const m of this._motes) {
      const y = m.e ? (m.y - t * m.sp * 0.35) : (m.y + t * m.sp * 0.5);
      const yy = ((y % (H + 10)) + (H + 10)) % (H + 10) - 5;
      const xx = (m.x + Math.sin(t / 640 + m.p) * 4) | 0;
      g.globalAlpha = m.g * (m.e ? 0.5 + 0.5 * Math.sin(t / 190 + m.p) : 0.8);
      g.fillStyle = m.e ? '#d8721f' : '#8f8f88';
      g.fillRect(((xx % W) + W) % W, yy | 0, 1, 1);
    }
    g.globalAlpha = 1;
  },

  _vignette(g, th) {
    const W = this.W, H = this.H, depth = 22;
    for (let d = 0; d < depth; d++) {
      g.globalAlpha = th.vigA * (1 - d / depth) + 0.015; g.fillStyle = th.vignette;
      g.fillRect(d, d, W - 2 * d, 1); g.fillRect(d, H - 1 - d, W - 2 * d, 1);
      g.fillRect(d, d, 1, H - 2 * d); g.fillRect(W - 1 - d, d, 1, H - 2 * d);
    }
    g.globalAlpha = 1;
  },

  /* ---- tiny pixel icons for the stat card & buttons (native grid, CSS-upscaled) ---- */
  ICONS: {
    camp: [26, 22, (g) => {
      g.fillStyle = '#1a2a18'; g.fillRect(0, 19, 26, 3);
      const pine = (x) => { g.fillStyle = '#274a2a'; for (let r = 0; r < 4; r++) g.fillRect(x - r, 8 + r * 3, r * 2 + 1, 3); g.fillStyle = '#3d6b3e'; for (let r = 0; r < 4; r++) g.fillRect(x - r, 8 + r * 3, 1, 3); g.fillStyle = '#5a3a1e'; g.fillRect(x, 19, 1, 2); };
      pine(4); pine(22);
      for (let yy = 5; yy <= 19; yy++) { const hw = ((yy - 5) / 14 * 8) | 0; g.fillStyle = '#c76a2a'; g.fillRect(13 - hw, yy, hw * 2 + 1, 1); g.fillStyle = '#e59a4a'; g.fillRect(13 - hw, yy, 1, 1); }
      g.fillStyle = '#2a1810'; for (let yy = 12; yy <= 19; yy++) { const hw = ((yy - 5) / 14 * 8) | 0; g.fillRect(13 - (hw > 3 ? 2 : hw), yy, hw > 3 ? 3 : 1, 1); }
      g.fillStyle = '#f6c060'; g.fillRect(12, 17, 3, 2);
    }],
    mountain: [24, 20, (g) => {
      for (let yy = 3; yy <= 18; yy++) {
        const hw = ((yy - 3) / 15 * 11) | 0;
        for (let dx = -hw; dx <= hw; dx++) { g.fillStyle = dx > 1 ? '#3c4a60' : (dx < -1 ? '#5a6c88' : '#4a5b74'); g.fillRect(12 + dx, yy, 1, 1); }
      }
      g.fillStyle = '#eef2f8'; g.fillRect(11, 3, 3, 2); g.fillRect(10, 5, 5, 2); g.fillRect(9, 7, 3, 1); g.fillRect(13, 7, 3, 1);
      g.fillStyle = '#cdd8e6'; g.fillRect(10, 7, 1, 1); g.fillRect(14, 7, 1, 1); g.fillRect(11, 9, 2, 1);
    }],
    calendar: [16, 16, (g) => {
      g.fillStyle = '#6b5a3a'; g.fillRect(2, 3, 12, 11);
      g.fillStyle = '#8a7346'; g.fillRect(3, 4, 10, 9);
      g.fillStyle = '#3a2f1c'; g.fillRect(2, 3, 12, 3);
      g.fillStyle = '#c7a24a'; g.fillRect(4, 1, 2, 3); g.fillRect(10, 1, 2, 3);
      g.fillStyle = '#2a2416'; for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) g.fillRect(4 + xx * 2, 7 + yy * 2, 1, 1);
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
      const cv = document.getElementById('defeatCanvas');
      if (cv && t - this._last > 55) { this._last = t; this.draw(cv, t); }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },
  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },
};
window.Defeat = Defeat;
