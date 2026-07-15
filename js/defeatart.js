"use strict";
/* Defeat — the Game Over scene: "The Last Fire". A moonlit valley the night a
   clan ends. A fresh grave with a wooden marker and two ravens keeps the
   foreground; a dead campfire smoulders beside it; the village stands abandoned
   on the midground — broken palisades, collapsed towers, one cabin with a last
   thread of chimney smoke — beneath a bright full moon, soft mountains and fog.
   Drawn at native pixel resolution in a muted moonlit palette (CSS-upscaled,
   image-rendering: pixelated) so it reads as handcrafted art, not a dead end.
   No score is shown for a defeat — the clan passes quietly into history. */
const Defeat = {
  W: 200, H: 150,

  // The headline, the poetic subtitle beneath it, and the footer epitaph are
  // three separate voices — a loss should read like the fate of a people.
  TITLES: [
    'THE FIRE HAS GONE OUT',
    'THE VILLAGE IS SILENT',
    'YOUR CLAN IS NO MORE',
    'SWALLOWED BY THE DARK',
  ],
  SUBTITLES: [
    'The valley forgets. Grass grows over the ashes.',
    'The paths remain. The footsteps do not.',
    'Nature remembers no kingdoms.',
    'The forest takes back what was borrowed.',
    'Your people became a story.',
    'The last hearth is cold, and no one came.',
  ],
  EPITAPHS: [
    'From ash, we began. From memory, we return.',
    'The forest always wins.',
    'The valley waits for another fire.',
    'History begins with someone trying again.',
    'Every valley waits for another beginning.',
    'Spring arrives without you.',
  ],
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  epitaph() { return this.pick(this.EPITAPHS); },
  subtitle() { return this.pick(this.SUBTITLES); },
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

  // stable scatter (stars / embers / grass) so the scene doesn't shimmer randomly
  _seed() {
    this._stars = []; for (let i = 0; i < 40; i++) this._stars.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * 70) | 0, p: Math.random() * 6.28, b: 0.4 + Math.random() * 0.6 });
    this._motes = []; for (let i = 0; i < 30; i++) this._motes.push({ x: (Math.random() * this.W) | 0, y: (Math.random() * this.H) | 0, sp: 3 + Math.random() * 7, p: Math.random() * 6.28, g: 0.2 + Math.random() * 0.5, e: Math.random() < 0.5 });
    this._tufts = []; for (let i = 0; i < 90; i++) { const y = 96 + (Math.random() * 54) | 0; this._tufts.push({ x: (Math.random() * this.W) | 0, y, h: 1 + (Math.random() * 2) | 0, lit: Math.random() < 0.3 }); }
    this._clouds = [{ x: 176, y: 22, w: 26, h: 4 }, { x: 150, y: 40, w: 20, h: 3 }, { x: 40, y: 18, w: 22, h: 3 }, { x: 96, y: 30, w: 16, h: 3 }];
  },

  draw(cv, t) {
    const g = cv.getContext('2d');
    if (cv.width !== this.W) { cv.width = this.W; cv.height = this.H; }
    g.imageSmoothingEnabled = false;
    const W = this.W, H = this.H, HZ = 92;

    // --- sky: a deep night, navy fading to a colder blue at the treeline ---
    for (let y = 0; y < HZ; y++) g.fillStyle = this.lerp('#0a0c1a', '#1b2338', y / HZ), g.fillRect(0, y, W, 1);
    // stars
    for (const s of this._stars) { g.globalAlpha = s.b * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 700 + s.p))); g.fillStyle = '#d5cfb6'; g.fillRect(s.x, s.y, 1, 1); }
    g.globalAlpha = 1;

    // --- the moon: bright, full, high to the right, with a soft cold halo ---
    const mx = 162, my = 30, mr = 15;
    g.fillStyle = '#aeb6c8'; for (let h = 0; h < 4; h++) { g.globalAlpha = 0.05 - h * 0.008; this.disc(g, mx, my, mr + 12 - h * 3); }
    g.globalAlpha = 1;
    g.fillStyle = '#f2eeda'; this.disc(g, mx, my, mr);
    g.fillStyle = '#e6e0c6'; this.disc(g, mx + 3, my + 2, mr - 2);   // subtle terminator shading, moon lit from upper-left
    g.fillStyle = '#d3ccae'; g.fillRect(mx - 5, my - 3, 4, 3); g.fillRect(mx + 1, my + 4, 5, 3); g.fillRect(mx - 3, my + 6, 3, 2); g.fillRect(mx + 6, my - 4, 3, 2);  // maria
    g.fillStyle = '#fbf7e6'; this.disc(g, mx - 5, my - 5, 3);        // bright crown

    // --- clouds: soft wisps drifting slow across the sky ---
    for (const c of this._clouds) {
      const cx = ((c.x + t / 90) % (W + 60)) - 30;
      g.globalAlpha = 0.5; g.fillStyle = '#232c42'; this.blob(g, cx, c.y, c.w, c.h);
      g.globalAlpha = 0.4; g.fillStyle = '#2c3752'; this.blob(g, cx + 4, c.y - 1, c.w - 6, c.h - 1);
    }
    g.globalAlpha = 1;

    // --- soft mountains along the horizon, lit faintly on their moonward slopes ---
    const ridge = (bx, peak, halfw, moon, shade) => {
      for (let dx = -halfw; dx <= halfw; dx++) {
        const x = bx + dx; if (x < 0 || x >= W) continue;
        const top = HZ - (peak * (1 - Math.abs(dx) / halfw)) | 0;
        g.fillStyle = dx > 0 ? shade : moon;   // moon at right → right faces darker, left slopes catch light
        for (let y = top; y < HZ; y++) g.fillRect(x, y, 1, 1);
      }
    };
    ridge(40, 20, 42, '#1a2233', '#141a28');
    ridge(120, 26, 40, '#1c2536', '#141b29');
    ridge(184, 22, 30, '#1a2233', '#141a28');
    // a low fog band settling over the valley floor
    for (let k = 0; k < 6; k++) { const fx = ((t / 40 + k * 40) % (W + 90)) - 45; g.globalAlpha = 0.06; g.fillStyle = '#8b93a6'; this.blob(g, fx, HZ - 2 + (k % 2) * 4, 40, 4); }
    g.globalAlpha = 1;

    // --- the abandoned village on the midground (near-black silhouettes) ---
    const SIL = '#0c0f18';
    // LEFT: the last cabin — caved roof, but one chimney still breathing smoke
    g.fillStyle = SIL;
    g.fillRect(24, HZ - 12, 22, 12);                                   // body
    for (let i = 0; i < 8; i++) g.fillRect(24 + i, HZ - 12 - i, 1, i + 1);   // near gable (standing)
    for (let i = 0; i < 4; i++) g.fillRect(45 - i, HZ - 9 - i, 1, i + 1);    // far slope sagging in
    g.fillRect(40, HZ - 20, 3, 8);                                     // chimney
    g.fillStyle = '#182031'; g.fillRect(24, HZ - 12, 1, 12);          // faint moonlit wall edge (left/moonward)
    // one warm window and a low doorway ember — a hearth not yet cold
    const warm = 0.55 + 0.45 * Math.sin(t / 320);
    g.globalAlpha = 0.7 + warm * 0.3; g.fillStyle = '#e0863a'; g.fillRect(30, HZ - 7, 3, 4);
    g.globalAlpha = 0.5 + warm * 0.4; g.fillStyle = '#f0b060'; g.fillRect(31, HZ - 6, 1, 2);
    g.globalAlpha = 0.18 + warm * 0.12; g.fillStyle = '#c24a1c'; this.blob(g, 31, HZ - 1, 6, 2);
    g.globalAlpha = 1;
    // thin chimney smoke, wavering as it climbs and thins
    for (let k = 0; k < 22; k++) { const yy = HZ - 21 - k * 2, wob = Math.sin(t / 500 + k * 0.45) * 3; g.globalAlpha = 0.16 * (1 - k / 22); g.fillStyle = '#39404f'; g.fillRect((41 + wob) | 0, yy, 2, 2); }
    g.globalAlpha = 1;

    // RIGHT: broken palisade stubs and two collapsed watchtowers
    g.fillStyle = SIL;
    for (const [x, h] of [[110, 7], [113, 5], [116, 8], [119, 4], [122, 6]]) g.fillRect(x, HZ - h, 1, h);   // shattered palisade line
    g.fillRect(132, HZ - 20, 10, 20); g.fillRect(132, HZ - 27, 6, 9); g.fillRect(139, HZ - 23, 2, 5);        // tall tower, sheared top
    g.fillRect(150, HZ - 5, 9, 5); for (let x = 150; x < 159; x += 3) g.fillRect(x, HZ - 8, 2, 3);            // toppled tower — just a stump + merlons
    g.fillRect(160, HZ - 2, 7, 2);                                     // rubble where it fell
    g.fillRect(172, HZ - 14, 8, 14); g.fillRect(172, HZ - 19, 4, 6);   // last tower on the flank
    g.fillStyle = '#161d2b'; g.fillRect(132, HZ - 20, 1, 20); g.fillRect(172, HZ - 14, 1, 14);   // moonlit tower edges

    // --- the glade floor: moonlit grass fading to near-black at our feet ---
    for (let y = HZ; y < H; y++) g.fillStyle = this.lerp('#28402a', '#0c130d', (y - HZ) / (H - HZ)), g.fillRect(0, y, W, 1);
    for (const tf of this._tufts) { g.fillStyle = tf.lit ? '#3a5638' : '#132015'; g.fillRect(tf.x, tf.y, 1, tf.h); }

    // --- foreground focus: the fresh grave, ringed by wild grass ---
    const gx = 100, gy = 128;
    g.fillStyle = '#1c150c'; this.blob(g, gx, gy, 30, 8);              // turned-earth mound (shadow)
    g.fillStyle = '#2b2013'; this.blob(g, gx, gy - 1, 25, 6);
    g.fillStyle = '#38291831'; g.fillRect(gx - 22, gy - 1, 44, 2);
    g.fillStyle = '#3a2c1a'; this.blob(g, gx, gy - 2, 20, 4);          // fresh soil crown
    // weathered wooden grave-cross, moonlit down its left edge
    g.fillStyle = '#33261680'; g.fillRect(gx + 2, gy - 22, 4, 24);     // faint cast shadow to the right
    g.fillStyle = '#3a2b1a'; g.fillRect(gx - 1, gy - 24, 3, 26); g.fillRect(gx - 6, gy - 18, 13, 3);   // post + arms
    g.fillStyle = '#5c4527'; g.fillRect(gx - 1, gy - 24, 1, 26); g.fillRect(gx - 6, gy - 18, 13, 1);   // moonlit edge
    g.fillStyle = '#1a130a'; g.fillRect(gx, gy - 10, 1, 3);            // a crack in the grain
    // a single wilted bloom laid at the foot
    g.fillStyle = '#5c3a4a'; g.fillRect(gx - 15, gy - 1, 2, 2); g.fillStyle = '#8a5c74'; g.fillRect(gx - 15, gy - 2, 1, 1);

    // --- the dead campfire beside the grave: cold stones, charred logs, an ember ---
    const cx = 60, cy = 134;
    g.fillStyle = '#3a3d46'; for (const [dx, dy] of [[-6, 1], [-3, 3], [1, 3], [5, 1], [4, -2], [-5, -2], [0, -3]]) this.blob(g, cx + dx, cy + dy, 2, 1);   // stone ring
    g.fillStyle = '#4a4e58'; for (const [dx, dy] of [[-6, 0], [5, 0], [0, -4]]) g.fillRect(cx + dx, cy + dy, 2, 1);   // moonlit stone tops
    g.fillStyle = '#17120e'; g.fillRect(cx - 4, cy - 1, 9, 2); g.fillRect(cx - 2, cy - 2, 6, 1);   // charred crossed logs
    g.fillStyle = '#241a12'; g.fillRect(cx - 4, cy - 2, 4, 1); g.fillRect(cx + 1, cy, 4, 1);
    const em = 0.5 + 0.5 * Math.sin(t / 210 + 1);
    g.globalAlpha = 0.25 + em * 0.35; g.fillStyle = '#c24a1c'; g.fillRect(cx - 1, cy - 1, 2, 1);   // one ember not yet dead
    g.globalAlpha = 0.14 + em * 0.14; g.fillStyle = '#e88a3a'; g.fillRect(cx, cy - 1, 1, 1);
    g.globalAlpha = 1;
    for (let k = 0; k < 10; k++) { const yy = cy - 3 - k * 2, wob = Math.sin(t / 470 + k * 0.5) * 2; g.globalAlpha = 0.10 * (1 - k / 10); g.fillStyle = '#39404f'; g.fillRect((cx + wob) | 0, yy, 1, 2); }
    g.globalAlpha = 1;

    // --- two ravens keeping watch, flanking the grave ---
    const raven = (rx, ry, face) => {
      g.fillStyle = '#07060b';
      g.fillRect(rx, ry, 5, 3);                         // body
      g.fillRect(rx + (face > 0 ? 4 : 0), ry - 2, 2, 2); // head
      g.fillRect(rx + (face > 0 ? 6 : -1), ry - 1, 1, 1); // beak
      g.fillRect(rx + (face > 0 ? 0 : 3), ry + 3, 2, 1);  // tail resting low
      g.fillStyle = '#191722'; g.fillRect(rx + 1, ry, 3, 1);   // faint moon sheen on the back
    };
    raven(80, 122, 1);    // left raven, turned toward the grave
    raven(118, 123, -1);  // right raven, looking out

    // --- drifting embers (rising, warm) and ash (falling, cold) ---
    for (const m of this._motes) {
      const y = m.e ? (m.y - t * m.sp * 0.35) : (m.y + t * m.sp * 0.5);
      const yy = ((y % (H + 10)) + (H + 10)) % (H + 10) - 5;
      const xx = (m.x + Math.sin(t / 640 + m.p) * 4) | 0;
      g.globalAlpha = m.g * (m.e ? 0.5 + 0.5 * Math.sin(t / 190 + m.p) : 0.8);
      g.fillStyle = m.e ? '#d8721f' : '#8f8f88';
      g.fillRect(((xx % W) + W) % W, yy | 0, 1, 1);
    }
    g.globalAlpha = 1;

    // --- a soft vignette, the dark drawing gently inward ---
    const depth = 22;
    for (let d = 0; d < depth; d++) {
      g.globalAlpha = 0.085 * (1 - d / depth) + 0.015; g.fillStyle = '#04060c';
      g.fillRect(d, d, W - 2 * d, 1); g.fillRect(d, H - 1 - d, W - 2 * d, 1);
      g.fillRect(d, d, 1, H - 2 * d); g.fillRect(W - 1 - d, d, 1, H - 2 * d);
    }
    g.globalAlpha = 1;
  },

  /* ---- tiny pixel icons for the stat card, buttons and banner ---- */
  // each draws into its own small canvas at native grid resolution; CSS upscales
  // with image-rendering: pixelated to keep them crisp and on-style.
  ICONS: {
    fire: [14, 15, (g) => {                       // banner crest — a living flame
      g.fillStyle = '#7a4a22'; g.fillRect(3, 12, 8, 2); g.fillRect(2, 13, 10, 1);   // log base
      g.fillStyle = '#5c3518'; g.fillRect(4, 12, 2, 1); g.fillRect(8, 12, 2, 1);
      g.fillStyle = '#c2401a'; g.fillRect(5, 3, 4, 9); g.fillRect(4, 6, 6, 5); g.fillRect(6, 1, 2, 3);   // outer flame
      g.fillStyle = '#ec7a26'; g.fillRect(6, 5, 3, 6); g.fillRect(5, 7, 4, 3);      // mid flame
      g.fillStyle = '#f6c445'; g.fillRect(6, 7, 2, 4);                              // hot core
      g.fillStyle = '#fce8a0'; g.fillRect(6, 9, 1, 2);
    }],
    camp: [26, 22, (g) => {                        // Play Again — a tent among pines
      g.fillStyle = '#1a2a18'; g.fillRect(0, 19, 26, 3);                            // ground
      // two pines behind (apex at top, tiers widening downward)
      const pine = (x) => { g.fillStyle = '#274a2a'; for (let r = 0; r < 4; r++) g.fillRect(x - r, 8 + r * 3, r * 2 + 1, 3); g.fillStyle = '#3d6b3e'; for (let r = 0; r < 4; r++) g.fillRect(x - r, 8 + r * 3, 1, 3); g.fillStyle = '#5a3a1e'; g.fillRect(x, 19, 1, 2); };
      pine(4); pine(22);
      // tent: apex at top (y=5), sloping out to a wide base (y=19)
      for (let yy = 5; yy <= 19; yy++) { const hw = ((yy - 5) / 14 * 8) | 0; g.fillStyle = '#c76a2a'; g.fillRect(13 - hw, yy, hw * 2 + 1, 1); g.fillStyle = '#e59a4a'; g.fillRect(13 - hw, yy, 1, 1); }   // canvas + lit left edge
      g.fillStyle = '#2a1810'; for (let yy = 12; yy <= 19; yy++) { const hw = ((yy - 5) / 14 * 8) | 0; g.fillRect(13 - (hw > 3 ? 2 : hw), yy, hw > 3 ? 3 : 1, 1); }   // dark doorway slit
      g.fillStyle = '#f6c060'; g.fillRect(12, 17, 3, 2);                                                // warm glow at the flap
    }],
    mountain: [24, 20, (g) => {                    // Title / Difficulty — a snowcapped peak
      // proper peak: apex at top (x=12,y=3), slopes widening to a base at y=18
      for (let yy = 3; yy <= 18; yy++) {
        const hw = ((yy - 3) / 15 * 11) | 0;
        for (let dx = -hw; dx <= hw; dx++) { g.fillStyle = dx > 1 ? '#3c4a60' : (dx < -1 ? '#5a6c88' : '#4a5b74'); g.fillRect(12 + dx, yy, 1, 1); }
      }
      // snow cap clinging to the summit
      g.fillStyle = '#eef2f8'; g.fillRect(11, 3, 3, 2); g.fillRect(10, 5, 5, 2); g.fillRect(9, 7, 3, 1); g.fillRect(13, 7, 3, 1);
      g.fillStyle = '#cdd8e6'; g.fillRect(10, 7, 1, 1); g.fillRect(14, 7, 1, 1); g.fillRect(11, 9, 2, 1);
    }],
    calendar: [16, 16, (g) => {                    // Day survived
      g.fillStyle = '#6b5a3a'; g.fillRect(2, 3, 12, 11);                                                 // page
      g.fillStyle = '#8a7346'; g.fillRect(3, 4, 10, 9);
      g.fillStyle = '#3a2f1c'; g.fillRect(2, 3, 12, 3);                                                  // header band
      g.fillStyle = '#c7a24a'; g.fillRect(4, 1, 2, 3); g.fillRect(10, 1, 2, 3);                          // rings
      g.fillStyle = '#2a2416'; for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) g.fillRect(4 + xx * 2, 7 + yy * 2, 1, 1);   // grid of days
    }],
    seed: [16, 16, (g) => {                        // Seed — a sprouting seed
      g.fillStyle = '#6b4a28'; g.fillRect(6, 9, 4, 5); g.fillRect(7, 8, 2, 1); g.fillRect(7, 14, 2, 1);  // seed body
      g.fillStyle = '#8a6636'; g.fillRect(6, 9, 1, 5);                                                    // lit edge
      g.fillStyle = '#1e130a'; g.fillRect(8, 10, 1, 3);                                                   // seam
      g.fillStyle = '#3d6b3e'; g.fillRect(8, 5, 1, 4); g.fillRect(9, 4, 2, 2); g.fillRect(6, 6, 2, 2);    // sprout leaves
      g.fillStyle = '#5a8a4a'; g.fillRect(9, 4, 1, 1); g.fillRect(6, 6, 1, 1);
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
