"use strict";
/* TitleArt — procedural pixel-art for the main menu, drawn with the game's own
   16-bit palette so the chrome reads as the same handcrafted art as gameplay
   (no external assets, no fonts). Provides:
     • the CLANFIRE wordmark — beveled gold letters, dark outline, 3D extrusion
     • a crossed-log emblem with a live, flickering campfire + warm glow
     • a small pixel icon set (home, flag, trophy, gear, book, save, chevron)
   Everything is rendered at native pixel resolution and CSS-upscaled with
   image-rendering: pixelated, exactly like the sprites in js/sprites.js. */
const TitleArt = {
  // 5×7 glyphs for the eight letters of CLANFIRE (1 = lit)
  GLYPHS: {
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  },
  GW: 5, GH: 7, GAP: 1, EXT: 2,   // glyph size, letter gap, 3D extrusion depth
  WORD: 'CLANFIRE',
  BUF: { w: 74, h: 42 },          // native logo buffer (CSS-upscaled)

  pal() {
    const P = (window.ART && ART.PALETTE) || {};
    return {
      gold: P.gold || ['#8a6a1e', '#c99b32', '#e8c15a', '#fff2c0'],
      fire: P.fire || ['#a33f1c', '#e88a3a', '#f2c14a', '#ffe9a0'],
      ink: P.ink || ['#14100a', '#241d15', '#3a3324'],
      wood: P.wood || ['#3e2c14', '#5c421f', '#6e5024', '#8a6b3a', '#a5854d'],
      stone: P.stone || ['#4a4a44', '#6f6f66', '#8f8f86', '#adada2', '#c9c9bf'],
      bone: P.bone || ['#8a7f66', '#b5ab8e', '#d8cfae'],
      blue: P.blue || ['#20415e', '#356a92', '#4a90c2', '#7ab4dc'],
    };
  },

  // ---- pixel helpers ----
  px(g, x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); },
  rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); },

  // vertical face shade for a glyph row (top bright → bottom dark)
  faceShade(P, r) {
    return r === 0 ? P.gold[3] : r <= 2 ? P.gold[2] : r <= 4 ? P.gold[1]
         : r === 5 ? P.gold[1] : P.gold[0];
  },

  drawGlyph(g, P, glyph, ox, oy) {
    const GW = this.GW, GH = this.GH, EXT = this.EXT;
    const on = (c, r) => c >= 0 && c < GW && r >= 0 && r < GH && glyph[r][c] === '1';
    // solid = the letter face plus its downward extrusion (gives a 3D body)
    const solid = (c, r) => { for (let d = 0; d <= EXT; d++) if (on(c, r - d)) return true; return false; };
    // 1) dark outline hugging the whole solid body
    for (let r = -1; r <= GH + EXT; r++) for (let c = -1; c <= GW; c++) {
      if (solid(c, r)) continue;
      let adj = false;
      for (let dr = -1; dr <= 1 && !adj; dr++) for (let dc = -1; dc <= 1; dc++) if (solid(c + dc, r + dr)) { adj = true; break; }
      if (adj) this.px(g, ox + c, oy + r, P.ink[0]);
    }
    // 2) extrusion body (solid but below the face)
    for (let r = 0; r < GH + EXT; r++) for (let c = 0; c < GW; c++)
      if (solid(c, r) && !on(c, r)) this.px(g, ox + c, oy + r, P.gold[0]);
    // 3) shaded face
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++)
      if (on(c, r)) this.px(g, ox + c, oy + r, this.faceShade(P, r));
    // 4) top bevel highlight on the upper lip of each stroke
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++)
      if (on(c, r) && !on(c, r - 1)) this.px(g, ox + c, oy + r, P.gold[3]);
  },

  wordWidth() { return this.WORD.length * this.GW + (this.WORD.length - 1) * this.GAP; },

  drawEmblem(g, P, cx, t) {
    // two crossed logs beneath the fire, bone-capped ends
    for (let i = -6; i <= 6; i++) {
      const y1 = 17 + Math.round(i * 0.28);       // "\" log
      const y2 = 17 - Math.round(i * 0.28);       // "/" log
      this.px(g, cx + i, y1, P.wood[i % 2 ? 1 : 2]);
      this.px(g, cx + i, y1 + 1, P.wood[0]);
      this.px(g, cx + i, y2, P.wood[i % 2 ? 2 : 1]);
      this.px(g, cx + i, y2 + 1, P.wood[0]);
    }
    this.px(g, cx - 6, 18, P.bone[2]); this.px(g, cx + 6, 18, P.bone[2]);
    this.px(g, cx - 6, 16, P.bone[1]); this.px(g, cx + 6, 16, P.bone[1]);
    // stone fire-ring
    for (const [dx, dy, s] of [[-3, 15, 2], [-1, 16, 3], [1, 16, 3], [3, 15, 2], [0, 14, 4]]) {
      this.px(g, cx + dx, dy, P.stone[s]); this.px(g, cx + dx, dy + 1, P.stone[1]);
    }
    // warm glow — a tight, flame-shaped pool (broad halo comes from the CSS)
    const fl = Math.sin(t / 140) * 0.5 + 0.5;
    g.globalAlpha = 0.12 + fl * 0.07; this.rect(g, cx - 3, 8, 7, 6, P.fire[1]);
    g.globalAlpha = 0.16 + fl * 0.09; this.rect(g, cx - 2, 5, 5, 6, P.fire[2]);
    g.globalAlpha = 1;
    // the flame — a small looping flicker with the odd rising spark
    const f = ((t / 110) | 0) % 4;
    const h = [0, 1, 0, 2][f];                    // tongue-height wobble
    this.rect(g, cx - 2, 11, 5, 3, P.fire[0]);                     // ember bed
    this.rect(g, cx - 2, 9 - h, 4, 4 + h, P.fire[1]);              // outer flame
    this.rect(g, cx - 1, 7 - h, 2, 5 + h, P.fire[2]);             // inner flame
    this.px(g, cx, 6 - h, P.fire[3]); this.px(g, cx, 7 - h, P.fire[3]);  // hot core
    this.px(g, cx + (f & 1 ? 1 : -1), 8 - h, P.fire[3]);          // lick
    if (f === 1) this.px(g, cx + 1, 3, P.fire[3]);                // spark
    if (f === 3) this.px(g, cx - 1, 2, P.fire[2]);
  },

  drawLogo(cv, t) {
    const g = cv.getContext('2d');
    if (cv.width !== this.BUF.w) { cv.width = this.BUF.w; cv.height = this.BUF.h; }
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const P = this.pal();
    const cx = (this.BUF.w / 2) | 0;
    this.drawEmblem(g, P, cx, t);
    // wordmark, centered, sitting under the emblem
    const wW = this.wordWidth();
    let ox = Math.round((this.BUF.w - wW) / 2);
    const oy = 22;
    for (const ch of this.WORD) {
      this.drawGlyph(g, P, this.GLYPHS[ch], ox, oy);
      ox += this.GW + this.GAP;
    }
  },

  // ---------------- pixel icon set ----------------
  ICON: 12,
  makeIcon(name) {
    const S = this.ICON, cv = document.createElement('canvas');
    cv.width = S; cv.height = S; cv.className = 'picoCv';
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const P = this.pal();
    const px = (x, y, c) => this.px(g, x, y, c);
    const box = (x, y, w, h, c) => this.rect(g, x, y, w, h, c);
    const out = (x, y, w, h) => { box(x, y, w, 1, P.ink[0]); box(x, y + h - 1, w, 1, P.ink[0]); box(x, y, 1, h, P.ink[0]); box(x + w - 1, y, 1, h, P.ink[0]); };
    switch (name) {
      case 'home': {                                     // gathering hall
        for (let i = 0; i <= 4; i++) box(6 - i, 2 + i, 1 + i * 2, 1, i === 0 ? P.wood[3] : P.wood[2]);
        box(3, 6, 7, 5, P.wood[1]); out(3, 6, 7, 5);
        box(5, 8, 3, 3, P.ink[1]); px(6, 2, P.gold[3]);
        break;
      }
      case 'flag': {                                     // new game — a raised banner
        box(3, 2, 1, 9, P.wood[2]); px(3, 11, P.wood[0]);
        box(4, 2, 6, 4, P.blue[2]); out(4, 2, 6, 4); px(6, 3, P.gold[2]); px(7, 4, P.gold[2]);
        break;
      }
      case 'trophy': {
        box(3, 2, 6, 3, P.gold[2]); out(3, 2, 6, 4); box(4, 3, 4, 2, P.gold[3]);
        px(2, 3, P.gold[1]); px(9, 3, P.gold[1]);                       // handles
        box(5, 6, 2, 2, P.gold[1]); box(4, 8, 4, 1, P.gold[2]); box(4, 9, 4, 1, P.ink[0]);
        break;
      }
      case 'gear': {
        box(5, 1, 2, 10, P.stone[3]); box(1, 5, 10, 2, P.stone[3]);     // teeth
        box(3, 3, 6, 6, P.stone[3]); out(3, 3, 6, 6); box(4, 4, 4, 4, P.stone[2]);
        box(5, 5, 2, 2, P.ink[1]);
        break;
      }
      case 'book': {
        box(2, 3, 8, 7, P.wood[1]); out(2, 3, 8, 7);
        box(6, 3, 1, 7, P.ink[0]);                                      // spine
        box(3, 4, 3, 1, P.bone[2]); box(7, 4, 2, 1, P.bone[2]);
        box(3, 6, 3, 1, P.bone[1]); box(7, 6, 2, 1, P.bone[1]);
        break;
      }
      case 'save': {                                     // floppy
        box(2, 2, 8, 8, P.blue[1]); out(2, 2, 8, 8);
        box(4, 2, 4, 3, P.stone[3]); box(6, 2, 1, 3, P.ink[1]);         // shutter
        box(4, 6, 4, 3, P.bone[2]); out(4, 6, 4, 3);                    // label
        break;
      }
      case 'chev': {
        for (let i = 0; i < 4; i++) { px(4 + i, 2 + i, P.gold[3]); px(4 + i, 3 + i, P.gold[2]); px(4 + i, 9 - i, P.gold[3]); px(4 + i, 8 - i, P.gold[2]); }
        break;
      }
    }
    return cv;
  },

  // ---------------- lifecycle ----------------
  _raf: 0, _last: 0,
  decorate() {
    // stamp pixel icons into any [data-ico] slot that hasn't been filled yet
    const title = document.getElementById('scrTitle');
    if (!title) return;
    for (const slot of title.querySelectorAll('[data-ico]')) {
      if (slot.dataset.done) continue;
      const cv = this.makeIcon(slot.dataset.ico);
      if (cv) { slot.appendChild(cv); slot.dataset.done = '1'; }
    }
  },
  start() {
    this.decorate();
    if (this._raf) return;
    const loop = (t) => {
      this._raf = 0;
      if (!window.Screens || Screens.current !== 'title') return;   // animate only on the title
      const cv = document.getElementById('logoCanvas');
      if (cv && t - this._last > 70) { this._last = t; this.drawLogo(cv, t); }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  },
  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } },
};
window.TitleArt = TitleArt;
