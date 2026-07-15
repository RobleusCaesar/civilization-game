"use strict";
/* Defeat — the Game Over scene. A quiet grave in a dark glade: your village a
   line of smoldering ruins on the horizon, a bare dead tree, a lone crow, ash
   drifting down, and the dark closing in from every edge. Drawn at native pixel
   resolution in the game's own 16-bit palette (CSS-upscaled, image-rendering:
   pixelated) so it reads as the same handcrafted art as the world. No score is
   shown for a defeat — the clan simply fades into the depths of history. */
const Defeat = {
  W: 190, H: 120,

  TITLES: ['YOUR CLAN IS NO MORE', 'THE FIRE HAS GONE OUT', 'SWALLOWED BY THE DARK'],
  EPITAPHS: [
    'No song remembers them. No stone bears their true name.',
    'The valley forgets. Grass grows over the ashes.',
    'They passed into the dark of history, with none left to mourn.',
    'Where your fire burned, only a cold wind moves now.',
    'History closes over them like water over a stone.',
    'A hundred years hence, not even the wind will know they were here.',
    'The last hearth is cold. The clan is dust and silence.',
    'No one came. No one will come. The glade keeps its one grave.',
  ],
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  epitaph() { return this.pick(this.EPITAPHS); },
  title() { return this.pick(this.TITLES); },

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

  // stable scatter (stars / ash / tufts) so the scene doesn't shimmer randomly
  _seed() {
    this._stars = []; for (let i = 0; i < 22; i++) this._stars.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * 46) | 0, p: Math.random() * 6.28 });
    this._ash = []; for (let i = 0; i < 34; i++) this._ash.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * this.H) | 0, sp: 3 + Math.random() * 6, p: Math.random() * 6.28, g: 0.18 + Math.random() * 0.4, e: Math.random() < 0.16 });
    this._tufts = []; for (let i = 0; i < 60; i++) this._tufts.push({ x: (Math.random() * this.W) | 0, y: 68 + (Math.random() * 50) | 0, h: 1 + (Math.random() * 2) | 0, d: Math.random() < 0.5 });
  },

  draw(cv, t) {
    const g = cv.getContext('2d');
    if (cv.width !== this.W) { cv.width = this.W; cv.height = this.H; }
    g.imageSmoothingEnabled = false;
    const W = this.W, H = this.H, HZ = 66;
    const INK = '#0b0910';

    // --- sky: night gradient, a dying dusk-glow smeared low on the horizon ---
    for (let y = 0; y < HZ; y++) g.fillStyle = this.lerp('#0a0912', '#232735', y / HZ), g.fillRect(0, y, W, 1);
    for (let y = HZ - 12; y < HZ; y++) { g.globalAlpha = 0.12 * (y - (HZ - 12)) / 12; g.fillStyle = '#5a2a1c'; g.fillRect(0, y, W, 1); }
    g.globalAlpha = 1;
    // stars, faintly twinkling
    for (const s of this._stars) { g.globalAlpha = 0.2 + (0.5 + 0.5 * Math.sin(t / 600 + s.p)) * 0.5; g.fillStyle = '#cfc9b0'; g.fillRect(s.x, s.y, 1, 1); }
    g.globalAlpha = 1;
    // a low, cold moon with a soft halo
    const mx = 150, my = 24, mr = 9;
    g.fillStyle = '#cfc9b0'; g.globalAlpha = 0.05; this.disc(g, mx, my, mr + 8); g.globalAlpha = 0.09; this.disc(g, mx, my, mr + 3); g.globalAlpha = 1;
    g.fillStyle = '#d8d2ba'; this.disc(g, mx, my, mr);
    g.fillStyle = '#c1bba2'; g.fillRect(mx - 4, my - 1, 3, 2); g.fillRect(mx - 2, my + 2, 2, 2); g.fillRect(mx + 2, my + 3, 3, 2);   // maria, clustered like real seas

    // --- the fallen village: a line of black ruins smoldering on the horizon ---
    g.fillStyle = INK;
    // burned longhouse (left) with a caved-in roof
    g.fillRect(24, HZ - 10, 17, 10);
    for (let i = 0; i < 6; i++) g.fillRect(24 + i, HZ - 10 - i, 1, i + 1);      // standing gable slope
    for (let i = 0; i < 3; i++) g.fillRect(40 - i, HZ - 9 - i, 1, i + 1);       // broken far slope (roof gone)
    // broken palisade stubs
    g.fillRect(52, HZ - 8, 1, 8); g.fillRect(55, HZ - 5, 1, 5); g.fillRect(58, HZ - 7, 1, 7);
    // collapsed watchtower (leaning, sheared top)
    g.fillRect(96, HZ - 16, 9, 16); g.fillRect(96, HZ - 23, 5, 8); g.fillRect(103, HZ - 19, 2, 4);
    // ruined castle wall with a collapsed gap + rubble
    g.fillRect(116, HZ - 8, 15, 8); for (let x = 116; x < 131; x += 4) g.fillRect(x, HZ - 11, 2, 3);
    g.fillRect(132, HZ - 3, 8, 3);                                              // rubble where it fell
    g.fillRect(142, HZ - 9, 11, 9); for (let x = 142; x < 153; x += 4) g.fillRect(x, HZ - 12, 2, 3);
    // a dim ember glow still breathing in the longhouse wreck
    const fl = 0.5 + 0.5 * Math.sin(t / 240);
    g.globalAlpha = 0.16 + fl * 0.14; g.fillStyle = '#c24a1c'; this.blob(g, 30, HZ - 2, 6, 2);
    g.globalAlpha = 0.10 + fl * 0.08; g.fillStyle = '#e88a3a'; g.fillRect(29, HZ - 3, 3, 1); g.globalAlpha = 1;
    // thin smoke rising from the wreck, wavering
    for (let k = 0; k < 20; k++) { const yy = HZ - 9 - k * 2, wob = Math.sin(t / 520 + k * 0.5) * 3; g.globalAlpha = 0.14 * (1 - k / 20); g.fillStyle = '#33333c'; g.fillRect(29 + wob, yy, 3, 2); }
    g.globalAlpha = 1;

    // --- glade floor: dark grass fading to near-black in front ---
    for (let y = HZ; y < H; y++) g.fillStyle = this.lerp('#17231a', '#0b120e', (y - HZ) / (H - HZ)), g.fillRect(0, y, W, 1);
    for (const tf of this._tufts) { g.fillStyle = tf.d ? '#0d1610' : '#20301c'; g.fillRect(tf.x, tf.y, 1, tf.h); }
    // drifting ground fog
    for (let k = 0; k < 5; k++) { const fx = ((t / 55 + k * 47) % (W + 70)) - 35; g.globalAlpha = 0.05; g.fillStyle = '#9498a2'; this.blob(g, fx, HZ + 7 + (k % 2) * 5, 34, 4); }
    g.globalAlpha = 1;

    // --- a bare dead tree, gnarled and lifeless ---
    g.fillStyle = '#070508';
    for (let y = 0; y < 44; y++) g.fillRect(33 + ((y * 0.05) | 0), 98 - y, y > 30 ? 2 : 3, 1);   // leaning trunk
    const limb = (x0, y0, dx, dy, n) => { let x = x0, y = y0; for (let i = 0; i < n; i++) { x += dx; y += dy; g.fillRect(x | 0, y | 0, 1, 1); if (i === (n / 2 | 0)) g.fillRect((x + dx) | 0, (y - 1) | 0, 1, 1); } };
    limb(35, 62, -1.1, -0.7, 9); limb(36, 58, 1.2, -0.6, 10); limb(35, 68, -1.3, -0.2, 7); limb(37, 54, 0.5, -1.1, 7);

    // --- the lone grave (the focal point), no one to tend it ---
    g.fillStyle = '#20170e'; this.blob(g, 104, 100, 26, 7);          // turned-earth mound
    g.fillStyle = '#2c2114'; this.blob(g, 104, 99, 22, 5);
    g.fillStyle = '#3a2c1a'; g.fillRect(89, 96, 30, 2);              // dark soil seam
    // weathered wooden grave-cross
    g.fillStyle = '#3a2b1a'; g.fillRect(103, 76, 3, 22); g.fillRect(98, 81, 13, 3);
    g.fillStyle = '#4c3a24'; g.fillRect(103, 76, 1, 22); g.fillRect(98, 81, 13, 1);   // moonlit edge
    g.fillStyle = INK; g.fillRect(104, 88, 1, 3);                    // a crack
    // two small leaning headstones (tilted slabs)
    const slab = (bx, by, w, h, lean, c1, c2) => { for (let r = 0; r < h; r++) { const off = (lean * (h - r) / h) | 0; g.fillStyle = c1; g.fillRect(bx + off, by - r, w, 1); } g.fillStyle = c2; g.fillRect(bx + (lean | 0), by - h + 1, w, 1); };
    slab(84, 98, 6, 9, -2, '#4a4a45', '#63635c');
    slab(122, 98, 5, 7, 2, '#44443f', '#5a5a54');
    // a single wilted flower drooping at the mound's edge
    g.fillStyle = '#5c3a4a'; g.fillRect(94, 97, 1, 2); g.fillStyle = '#7a5266'; g.fillRect(93, 96, 1, 1);

    // --- a lone crow keeping its silent watch on the headstone ---
    g.fillStyle = '#000'; g.fillRect(84, 90, 5, 3); g.fillRect(87, 88, 2, 2); g.fillRect(89, 89, 1, 1);   // body, head, beak
    g.fillStyle = '#0c0a12'; g.fillRect(83, 91, 1, 1);

    // --- ash & the odd rising ember, drifting ---
    for (const a of this._ash) {
      const rise = a.e;
      const y = rise ? (a.y - t * a.sp * 0.4) : (a.y + t * a.sp * 0.6);
      const yy = ((y % (H + 8)) + (H + 8)) % (H + 8) - 4;
      const xx = (a.x + Math.sin(t / 700 + a.p) * 4) | 0;
      g.globalAlpha = a.g * (rise ? 0.6 + 0.4 * Math.sin(t / 200 + a.p) : 1);
      g.fillStyle = rise ? '#c2531f' : '#8f8f88';
      g.fillRect(xx, yy | 0, 1, 1);
    }
    g.globalAlpha = 1;

    // --- the dark closing in: a heavy vignette breathing at the edges ---
    const grow = 4 * (0.5 + 0.5 * Math.sin(t / 1400));
    const depth = 20 + grow;
    for (let d = 0; d < depth; d++) {
      g.globalAlpha = 0.09 * (1 - d / depth) + 0.02;
      g.fillStyle = '#000';
      g.fillRect(d, d, W - 2 * d, 1); g.fillRect(d, H - 1 - d, W - 2 * d, 1);
      g.fillRect(d, d, 1, H - 2 * d); g.fillRect(W - 1 - d, d, 1, H - 2 * d);
    }
    g.globalAlpha = 1;
  },

  // ---- lifecycle ----
  _raf: 0, _last: 0,
  start() {
    this._seed();
    if (this._raf) return;
    const loop = (t) => {
      this._raf = 0;
      if (!window.Screens || Screens.current !== 'endgame') return;   // only while the Game Over screen is up
      const cv = document.getElementById('defeatCanvas');
      if (cv && t - this._last > 55) { this._last = t; this.draw(cv, t); }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },
  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },
};
window.Defeat = Defeat;
