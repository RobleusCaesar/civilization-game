"use strict";
/* THE DRAGON AND THE KRAKEN (tests/beasts.mjs) — the two monsters of the
   game. Each is the rarest special event a run can roll, and each is the
   payoff of a top-tier card (Dragonfire, Kraken's Call), so when one comes
   it has to read as the biggest thing that ever happens on the map. The
   operator's ruling: "They should feel like the ultimate prizes of the game
   when you play those cards… should feel epic and earned."

   THE ART is drawn, not built: PixelLab strips in assets/fx/, fetched ON
   DEMAND and at HIGH priority (Assets.FX_SETS.dragon / .kraken — the rolled
   event asks for its own set at newGame/loadJSON, a card the moment the
   player HOLDS it, Deck.wantArt; the play's landing waits a beat for it,
   DeckUI.ART_WAIT_MS), square frames, the house's binary alpha:
     dragon-fly      8 x 256px  one full wing beat, facing EAST, looping
     dragon-breath   9 x 256px  0 the glide, 2-5 rearing back, 6-8 the jaws
                                open on the flame (looped while it breathes)
     kraken-thrash   8 x 224px  the head out of the sea in its own ring of
                                foam, tentacles writhing, looping
     kraken-tentacle 13 x 160px one tentacle: rears (0-6), SLAMS (7-8, the
                                splash), and rises again (9-12)
   A missing strip keeps the old procedural creature (drawDragonOld /
   drawKrakenOld) — the painter stands down for art that isn't there.

   THE ACT is the sim's (G.dragonTick / G.krakenTick, and the cards' own
   acts in js/deckfx*.js); everything here is a PICTURE of it: what it does
   to the sky, the ground under it, the camera and the speakers. Render state
   lives in a WeakMap keyed by the act (never in S, never in a save), so a
   save taken mid-act loads into a monster that simply carries on.

   SCALE. The world's creatures are drawn at 2 art pixels a world pixel; the
   monsters are drawn at ONE — they are closer to the camera than anything
   on the ground (the dragon is in the sky, the kraken towers out of the sea)
   and the coarser grain is the size. That scale is FIXED AND WHOLE
   (DRAGON.scale, KRAKEN.scale / tentScale, all 1): a nearest-neighbour
   scale that is not a whole number drops and doubles art rows unevenly,
   and ANIMATED it shimmers — the dragon used to breathe between 0.98x and
   1.22x with its altitude and the kraken grew through 0.78 x (0.7..1) as it
   rose, and every row of both crawled. So the art is never scaled to tell a
   story: altitude and approach are told by POSITION, the shadow and the
   pall, and the kraken surfaces through a widening hole in the sea (a clip
   reveal), never by growing. The dragon spans eight tiles, the kraken's
   body in its ring of foam seven, a tentacle stands about four out of the
   water. (tests/beasts.mjs, theBeastsAreDrawnAtOneWholeScale) */

const Beasts = {
  DRAGON: {
    fps: 12,              // the wing beat
    altHigh: 5.4,         // tiles above its ground point, coming in high…
    altLow: 3.3,          // …and lower over the line it burns
    altDive: 8.2,         // a CARD's dragon dives from higher still (Dragonfire's act)
    scale: 1,             // FIXED and whole (SCALE, above): height is told by position, never by size
    mouth: [122, 58],     // the jaws in breath frames 6-8, from the frame's middle (art px, facing east)
    rearS: 0.32,          // rearing back before the first breath
    pall: 0.24,           // how dark the world goes under it (the stand-in for a page with no vignette)
    pallLv: [0.2, 0.34, 0.48, 0.62],   // …in steps: the middle of the view, then three bands in from every edge
    reach: 2.1,           // tiles ahead of its ground point the flame lands (G.dragonTick's fire line)
    lead: 0.9,            // …and the jaws hang this far behind that landing, so the flame slants forward
  },
  KRAKEN: {
    scale: 1,             // the body (224px art) on the board — FIXED and whole (SCALE, above)
    tentScale: 1,         // a tentacle (160px art), the same
    tentBase: [80, 132],  // where a tentacle leaves the water, in its frame
    frame: 224,           // the kraken-thrash frame (px), foam ring and all — the body's drawn box is frame × scale
    fps: 9,
    offset: 1.7,          // tiles from its prey to the body's middle, out toward open water
    waterline: 6,         // the beast breaks the surface this far below its frame's middle (art px)
    sinkPx: 96,           // …and comes up from this far under it (art px)
    hull: [3.1, 2.6, 0.5],   // the water its body needs: an ellipse (tiles: rx, ry, down from the middle)
  },
  /* THE BEAST AND THE SEA, APART. Each kraken frame is the beast in its own
     disc of dark water and foam. Laid whole on a narrow sea that disc lay on
     the meadow beside it — a navy coin on the grass — and surfacing through a
     widening HOLE cut a hard circle out of the beast. So every frame (and the
     tentacle's splash frames) is split once, by colour, into the BEAST (the
     violet hide, the mauve arms, the eyes and the ink that edges them) and the
     SEA (navy, blue, foam: every pixel whose green is not below its red and
     whose blue leads both, and every near-white); a crumb of beast too small
     to read (under 8 px) goes to the sea. The sea is then laid only on the
     water and the beast
     comes up out of its waterline (R.drawKrakenBody). Render state (a WeakMap
     on the frame); null where the canvas cannot be read (a tainted file://
     page), and the caller draws the frame whole. */
  _split: new WeakMap(),
  split(fr) {
    if (!fr) return null;
    if (this._split.has(fr)) return this._split.get(fr);
    let out = null;
    try {
      const w = fr.width, h = fr.height, src = fr.getContext('2d').getImageData(0, 0, w, h), px = src.data, N = w * h;
      const kind = new Uint8Array(N);                    // 0 empty, 1 beast, 2 sea, 3 ink (decided below)
      for (let i = 0; i < N; i++) {
        const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
        if (px[i * 4 + 3] < 128) continue;
        kind[i] = (gg >= r && b > r + 8 && r + gg + b > 30) || (r > 196 && gg > 196 && b > 196) ? 2 : r + gg + b < 30 ? 3 : 1;
      }
      // ink is the beast's only where the beast is within two pixels of it
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (kind[i] !== 3) continue;
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && kind[yy * w + xx] === 1) { near = true; break; }
        }
        kind[i] = near ? 1 : 2;
      }
      // a crumb of beast too small to read is spray
      const seen = new Uint8Array(N), stack = [];
      for (let i = 0; i < N; i++) {
        if (kind[i] !== 1 || seen[i]) continue;
        const comp = [];
        stack.push(i); seen[i] = 1;
        while (stack.length) {
          const j = stack.pop(); comp.push(j);
          const x = j % w, y = (j / w) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const k = yy * w + xx;
            if (kind[k] === 1 && !seen[k]) { seen[k] = 1; stack.push(k); }
          }
        }
        if (comp.length < 8) for (const j of comp) kind[j] = 2;
      }
      const mk = want => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const q = c.getContext('2d'), im = q.createImageData(w, h);
        for (let i = 0; i < N; i++) if (kind[i] === want) for (let k = 0; k < 4; k++) im.data[i * 4 + k] = px[i * 4 + k];
        q.putImageData(im, 0, 0);
        return c;
      };
      out = { dry: mk(1), wet: mk(2) };
    } catch (e) { out = null; }
    this._split.set(fr, out);
    return out;
  },

  _st: new WeakMap(),     // act -> render state (roared, shook, body offset…)
  st(ev) {
    let s = this._st.get(ev);
    if (!s) { s = { roared: false, breathed: false, nextShake: 0, slammed: {}, risen: false }; this._st.set(ev, s); }
    return s;
  },
  ready(kind) {
    if (typeof Assets === 'undefined' || !Assets.fxFrames) return null;
    if (kind === 'dragon') { const f = Assets.fxFrames('dragon-fly'); return f && f.length >= 8 ? f : null; }
    const k = Assets.fxFrames('kraken-thrash'); return k && k.length >= 8 ? k : null;
  },
  // the act is on screen and the art is not: it is wanted NOW (Assets.wantFx's high road)
  want(kind) { if (typeof Assets !== 'undefined' && Assets.wantFx) Assets.wantFx(kind, { prio: 'high' }); },
  /* A TENTACLE'S STRIKE, frame by frame on the kraken-tentacle strip, `t`
     seconds from the moment it breaks the surface, the blow landing at
     `hit`: up out of its own splash (8→12), rearing (0→6), the PLUNGE (7)
     just before the blow, the SPLASH (8) on it, up out of that again (9→12)
     and down the way it came (11→8). Never a pop in or out of the sea.
     Answers -1 while it is under. */
  strikeFrame(t, hit) {
    if (t < 0) return -1;
    if (t < 0.32) return 8 + Math.min(4, (t / 0.08) | 0);
    if (t < hit - 0.12) return Math.min(6, ((t - 0.32) / Math.max(0.1, hit - 0.44) * 7) | 0);
    if (t < hit) return 7;
    const e = t - hit;
    if (e < 0.26) return 8;
    if (e < 0.58) return 9 + Math.min(3, ((e - 0.26) / 0.08) | 0);
    if (e < 0.9) return 11 - Math.min(3, ((e - 0.58) / 0.08) | 0);
    return -1;
  },
  STRIKE_AFTER: 0.9,      // how long a strike lasts past its blow (strikeFrame)
  tentReady() {
    const f = typeof Assets !== 'undefined' && Assets.fxFrames && Assets.fxFrames('kraken-tentacle');
    return !!(f && f.length >= 13);
  },
  snap(v) { return Math.round(v / 2) * 2; },
  smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); },
  // the act is on the screen the player is looking at (a roar off screen is
  // still heard — it is the shake and the flash that wait for the eye)
  inView(x, y, padT) {
    const v = R.viewTiles(), p = padT || 0;
    return x >= v.x0 - p && x <= v.x1 + p && y >= v.y0 - p && y <= v.y1 + p;
  },
  /* the shadow a frame throws on the ground: its silhouette laid flat, EVERY
     THIRD ROW of it — a whole-number squash, so no row is dropped or doubled
     unevenly from one frame of the wing beat to the next (cached per frame) */
  _shad: new WeakMap(),
  shadowOf(fr) {
    let c = this._shad.get(fr);
    if (c) return c;
    const sil = this.silhouette(fr), n = Math.ceil(fr.height / 3);
    c = document.createElement('canvas'); c.width = fr.width; c.height = n;
    const g = c.getContext('2d');
    for (let y = 0; y < n; y++) g.drawImage(sil, 0, Math.min(fr.height - 1, y * 3 + 1), fr.width, 1, 0, y, fr.width, 1);
    this._shad.set(fr, c);
    return c;
  },
  // a black silhouette of a frame, for the shadow it throws (cached per frame)
  _sil: new WeakMap(),
  silhouette(fr) {
    let c = this._sil.get(fr);
    if (c) return c;
    c = document.createElement('canvas'); c.width = fr.width; c.height = fr.height;
    const g = c.getContext('2d');
    g.drawImage(fr, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#0b0806'; g.fillRect(0, 0, c.width, c.height);
    this._sil.set(fr, c);
    return c;
  },
  /* THE SHADOW IS SOFT (the operator's ruling on the effects: the beasts'
     own sprites stay pixel art, but what they throw — fire, foam, a splash,
     the dark of their shadow — is drawn at the device's own resolution). A
     shadow cast from high above has no hard edge, and its silhouette blown up
     seven times nearest-neighbour drew every art pixel of the wing as a
     block. So the silhouette is BLURRED once per frame — laid down at
     `SOFT_TAPS` offsets on a disc of `SOFT_R` art px, each a share of the
     whole (drawImage only: no pixel is read, so a file:// page that cannot
     read its canvases blurs it the same) — padded by SOFT_R on every side,
     and drawn stretched WITH smoothing: a smooth falloff stretched stays
     smooth. Cached per frame (a WeakMap), render state only. */
  SOFT_R: 3, SOFT_TAPS: 18,
  _soft: new WeakMap(),
  softShadow(fr) {
    let c = this._soft.get(fr);
    if (c) return c;
    const sil = this.silhouette(fr), P = this.SOFT_R + 1;
    c = document.createElement('canvas'); c.width = fr.width + P * 2; c.height = fr.height + P * 2;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    const n = this.SOFT_TAPS;
    g.globalAlpha = 0.2;
    for (let i = 0; i < n; i++) {
      // two rings of taps and the middle: a disc, not a cross
      const ring = i < 6 ? 0.45 : 1, a = i * 2.39996, r = this.SOFT_R * ring;
      g.drawImage(sil, P + Math.cos(a) * r, P + Math.sin(a) * r);
    }
    g.globalAlpha = 0.5; g.drawImage(sil, P, P);
    c.pad = P;
    this._soft.set(fr, c);
    return c;
  },
};
window.Beasts = Beasts;

/* ============ WHAT THE BEASTS AND THE SKY CARDS THROW, AT THE DEVICE'S OWN RESOLUTION ============
   (operator ruling, 2026-10-27: "can you improve the quality of the map
   special effects… the rays are pixelated again… higher pixel count"). The
   world's ART stays pixel art — the dragon's and the kraken's own strips at
   one whole scale, a building, a soldier, the card's own painting — but
   every EFFECT the beasts and the rival-and-sky cards throw (the breath and
   every tongue of fire, foam and spray, a splash, embers, smoke, a shadow's
   soft edge) is drawn here as smooth antialiased paths and gradients at
   FRACTIONAL coordinates, never snapped to the art's 2px grain, never a
   stepped dither, never a small canvas blown up nearest-neighbour. The
   light of it goes through the shared helpers (R.fxGlow / fxRing / fxDot /
   fxSpark / fxRays, js/render.js), whose hue pass keeps a warm light off the
   meadow's lime. Draws wherever the caller draws (the world layer in world
   px, the sky in device px), restores what it sets, keeps no state and draws
   no RNG (a hash and the caller's clock). */
Object.assign(R, {
  /* A TONGUE OF FLAME standing on (x, y) — `h` tall, `w` wide at its foot
     (the caller's units), swaying on its own phases (`t` its clock, `seed`
     its own): an outer tongue in the fire's orange going red and thin at its
     tip, a gold tongue inside it, a white-hot heart at its foot — each a
     smooth tapered path, curved through the midpoints of its edge, never a
     stack of slices — over a soft light of its own hugging the column (an
     ellipse the shape of the flame, never a pool across the ground). `a`
     0..1 its strength. */
  fxFlame(g, x, y, h, w, t, seed, a) {
    a = a == null ? 1 : Math.max(0, Math.min(1, a));
    if (!(h > 0.5) || !(w > 0.3) || a < 0.01) return;
    const F = ART.PALETTE.fire, N = 16, sk = Math.min(1.6, Math.max(0.35, w / 13));
    const at = k => {
      const sway = Math.sin(t * 9 + k * 7 + seed) * (1.5 + k * 4) + Math.sin(t * 13 + seed * 2.1 + k * 3) * k * 2;
      return x + sway * sk;
    };
    // its own light, the shape of the column — an aura hugging the flame,
    // no wider than it is and lifted off its foot: a fire lights ITSELF, and
    // a glow spread round its foot is the warm pool on the meadow that reads
    // as sand (tests/deck-fx.mjs §9 measures the ground round a fire's foot)
    if (this.fxGlow) {
      g.save();
      g.translate(x, y - h * 0.55);
      g.scale(Math.max(0.15, Math.min(1, w * 0.62 / (h * 0.52))), 1);
      this.fxGlow(g, 0, 0, h * 0.52, 0.42 * a, 'bronze', { soft: 2.1 });
      g.restore();
    }
    // one tongue: `wk` of the width, closing to its tip at `hk` of the height
    const tongue = (wk, hk) => {
      const L = [], Rr = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N * hk, q = k / hk, cx = at(k), hw = w * wk * Math.pow(1 - q, 0.85) / 2, yy = y - k * h;
        L.push([cx - hw, yy]); Rr.push([cx + hw, yy]);
      }
      g.beginPath();
      g.moveTo(Rr[0][0], Rr[0][1]);
      // the foot, rounded under
      g.quadraticCurveTo(x, y + w * wk * 0.22, L[0][0], L[0][1]);
      for (let i = 1; i < N; i++) g.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
      g.lineTo(L[N][0], L[N][1]);
      for (let i = N - 1; i > 0; i--) g.quadraticCurveTo(Rr[i][0], Rr[i][1], (Rr[i][0] + Rr[i - 1][0]) / 2, (Rr[i][1] + Rr[i - 1][1]) / 2);
      g.closePath();
    };
    const grad = (hk, stops) => {
      const gr = g.createLinearGradient(x, y, x, y - h * hk);
      for (const [u, c, al] of stops) gr.addColorStop(u, this._fxC ? this._fxC(c, al * a) : c);
      return gr;
    };
    g.save();
    g.globalCompositeOperation = 'source-over';
    tongue(1, 1);
    g.fillStyle = grad(1, [[0, F[1], 1], [0.62, F[1], 1], [0.84, F[0], 0.92], [1, F[0], 0]]); g.fill();
    tongue(0.62, 0.76);
    g.fillStyle = grad(0.76, [[0, F[2], 1], [0.7, F[2], 0.95], [1, F[1], 0]]); g.fill();
    tongue(0.3, 0.46);
    g.fillStyle = grad(0.46, [[0, '#fff7e0', 1], [0.55, F[3], 1], [1, F[2], 0]]); g.fill();
    g.restore();
  },
  /* A RING OF FOAM on the water at (x, y), radii rx / ry (the caller's
     units): BROKEN, the way white water is — crests of foam along the ring,
     each its own length and thickness, swelling in the middle and tapering
     to nothing at both ends, a little in or out of the true ellipse, with
     gaps of open water between (seeded, so a ring keeps its own pattern as
     it rolls out, turning with `o.spin`) — never an even dash, which read
     as a dashed ring drawn on the screen. A soft wide body (`o.deep`) under
     a fine bright crest (`o.col`), its width in CSS px (`o.css`, 1.4), so it
     reads the same on a desk and a phone. `a` 0..1. The caller clips it to
     the water. */
  fxFoam(g, x, y, rx, ry, a, o) {
    o = o || {};
    if (!(a > 0.01) || !(rx > 0.5) || !(ry > 0.2)) return;
    const cp = this.fxPx(g), w = (o.css || 1.4) * cp, seed = o.seed | 0, gap = o.gaps == null ? 0.28 : o.gaps;
    const TAU = Math.PI * 2, spin = (o.spin || 0) * 0.6;
    const C = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const n = Math.max(6, Math.min(40, Math.round(C / (w * 11))));
    const H = (i, k) => this._fxHash(i, seed * 31 + k);
    // one crest: from angle a0 to a1, `ww` thick at its middle, `jr` off the ellipse
    const crest = (a0, a1, ww, jr) => {
      const N = 10, P = [], Q = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, th = a0 + (a1 - a0) * u, ex = Math.cos(th), ey = Math.sin(th);
        const r = 1 + jr * (0.6 + 0.4 * Math.sin(u * Math.PI * 1.7));
        const nx = ex * ry, ny = ey * rx, nl = Math.hypot(nx, ny) || 1;
        const hw = ww * Math.pow(Math.sin(Math.PI * u), 0.75) / 2;
        const px = x + ex * rx * r, py = y + ey * ry * r;
        P.push([px + nx / nl * hw, py + ny / nl * hw]); Q.push([px - nx / nl * hw, py - ny / nl * hw]);
      }
      g.beginPath(); g.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i <= N; i++) g.lineTo(P[i][0], P[i][1]);
      for (let i = N; i >= 0; i--) g.lineTo(Q[i][0], Q[i][1]);
      g.closePath(); g.fill();
    };
    const pieces = [];
    for (let i = 0; i < n; i++) {
      if (H(i, 3) < gap * 0.85) continue;                      // open water here
      const a0 = (i + 0.12 * H(i, 5)) / n * TAU + spin, len = (0.45 + 0.5 * H(i, 7)) / n * TAU;
      pieces.push([a0, a0 + len, w * (0.65 + 0.85 * H(i, 9)), (H(i, 11) - 0.5) * Math.min(0.09, 6 * w / Math.max(rx, 1))]);
    }
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = Math.min(1, a) * 0.34; g.fillStyle = o.deep || '#a9d4ea';
    for (const [a0, a1, ww, jr] of pieces) crest(a0 - 0.04, a1 + 0.04, ww * 2.6, jr);
    g.globalAlpha = Math.min(1, a); g.fillStyle = o.col || '#f2fbff';
    for (const [a0, a1, ww, jr] of pieces) crest(a0, a1, ww, jr);
    g.restore();
  },
  /* A DROP of water (or a fleck of anything thrown): a round head of radius
     `r` with a short streak behind it along its velocity (vx, vy, units a
     second), in `col` at `a` — smooth, never a square cell. */
  fxDrop(g, x, y, vx, vy, r, col, a) {
    if (!(a > 0.01) || !(r > 0)) return;
    const L = Math.hypot(vx, vy), k = L > 0 ? Math.min(r * 4, L * 0.03) / L : 0;
    g.save();
    g.globalAlpha = Math.min(1, a);
    g.fillStyle = g.strokeStyle = col;
    if (k > 0) { g.lineCap = 'round'; g.lineWidth = r * 1.3; g.beginPath(); g.moveTo(x - vx * k, y - vy * k); g.lineTo(x, y); g.stroke(); }
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  /* A PUFF of smoke: a soft disc in `rgb` ("r,g,b") at `a`, thickest at its
     heart — smoke is not light, so it is laid plain source-over. */
  fxPuff(g, x, y, r, rgb, a) {
    if (!(a > 0.01) || !(r > 0.3)) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r), al = Math.min(1, a);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + al.toFixed(3) + ')');
    gr.addColorStop(0.5, 'rgba(' + rgb + ',' + (al * 0.78).toFixed(3) + ')');
    gr.addColorStop(0.8, 'rgba(' + rgb + ',' + (al * 0.3).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.save(); g.globalCompositeOperation = 'source-over';
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.restore();
  },
  /* A CHUNK thrown off a blow (a clod of the shore, a stone off a crater):
     a small irregular polygon, `r` across, turned `rot`, in `col` — an
     antialiased shape at fractional coordinates, never a square cell. */
  fxChunk(g, x, y, r, rot, col, a, seed) {
    if (!(a > 0.01) || !(r > 0.2)) return;
    g.save();
    g.globalAlpha = Math.min(1, a); g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const an = rot + i / 5 * Math.PI * 2, rr = r * (0.7 + 0.45 * this._fxHash(i, (seed | 0) + 3));
      if (i) g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else g.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
    }
    g.closePath(); g.fill();
    g.restore();
  },
});

/* ---------------- the sounds (synthesized — no audio ships) ---------------- */
if (typeof Sound !== 'undefined' && Sound._VOICES) {
  Object.assign(Sound.GAP, { roar: 2.5, breath: 1.2, kraken: 2.5, splash: 0.25 });
  Object.assign(Sound._VOICES, {
    /* THE ROAR: a growl from somewhere much bigger than the speaker — two
       detuned saws sliding down a fourth under a lowpass that closes, a rasp
       of noise in the throat, and a sub-bass thud under the whole thing. */
    roar(t, v) {
      this._note({ at: t, hz: 150, to: 74, dur: 1.5, type: 'sawtooth', gain: 0.16 * v, lp: 900, lpTo: 260, atk: 0.12 });
      this._note({ at: t, hz: 157, to: 70, dur: 1.4, type: 'sawtooth', gain: 0.12 * v, lp: 700, lpTo: 220, atk: 0.15 });
      this._noise({ at: t, delay: 0.05, hz: 700, to: 240, dur: 1.3, q: 1.4, gain: 0.16 * v, atk: 0.1 });
      this._note({ at: t, hz: 52, to: 34, dur: 1.6, type: 'sine', gain: 0.24 * v, atk: 0.2 });
    },
    // the breath: a furnace door thrown open — a roar of air tearing down the band
    breath(t, v) {
      this._noise({ at: t, hz: 2400, to: 300, dur: 1.8, q: 0.5, gain: 0.26 * v, atk: 0.05, filter: 'lowpass' });
      this._noise({ at: t, delay: 0.1, hz: 900, to: 500, dur: 1.6, q: 2.0, gain: 0.10 * v, rate: 1.4 });
      this._note({ at: t, hz: 64, to: 40, dur: 1.4, type: 'sine', gain: 0.22 * v });
    },
    // the deep answering: a groan out of the water, rising, and the sea heaving
    kraken(t, v) {
      this._note({ at: t, hz: 38, to: 58, dur: 2.2, type: 'sine', gain: 0.30 * v, atk: 0.4 });
      this._note({ at: t, delay: 0.3, hz: 92, to: 61, dur: 1.6, type: 'sawtooth', gain: 0.10 * v, lp: 420, lpTo: 180, atk: 0.3 });
      this._noise({ at: t, hz: 600, to: 120, dur: 2.0, q: 0.6, gain: 0.20 * v, atk: 0.3, filter: 'lowpass', rate: 0.6 });
    },
    // a tentacle coming down: a slap and a wall of water
    splash(t, v) {
      this._noise({ at: t, hz: 1800, to: 300, dur: 0.6, q: 0.5, gain: 0.26 * v, filter: 'lowpass' });
      this._note({ at: t, hz: 110, to: 40, dur: 0.5, type: 'sine', gain: 0.26 * v });
    },
  });
}

/* ---------------- the drawing ---------------- */
Object.assign(R, {
  /* THE BLACK DRAGON. Where it is (ev.x, ev.y) is a point on the GROUND —
     the act flies it along the line it burns — and the beast itself is up in
     the sky above that point, ALTITUDE tiles high: coming in high, dropping
     low over the line it breathes on, climbing away — always at the one
     whole scale (SCALE, above), so the height is in where it is drawn and in
     the gap to its shadow, never in its size. Under it, its
     shadow (the frame's own silhouette, flattened onto the ground) races
     across the fields, and the world darkens round it. */
  drawDragonAct(g, dt) {
    const ev = S.dragon && S.dragon.ev;
    if (!ev) return;
    const fly = Beasts.ready('dragon');
    if (!fly) { Beasts.want('dragon'); this.drawDragonOld(g, ev); return; }
    const C = Beasts.DRAGON, TL = CFG.TILE, st = Beasts.st(ev), dir = ev.dir < 0 ? -1 : 1, sc = C.scale;
    const breathF = (typeof Assets !== 'undefined' && Assets.fxFrames('dragon-breath')) || null;
    // how high, how big, and how much of the act is "here"
    let alt, k;
    const DF = ev.card && typeof Deck !== 'undefined' && Deck.FX && Deck.FX.dragonfire;
    if (ev.phase === 'fly') {
      // a CARD's dragon DIVES: in from high over the board, down onto its line
      const d = Math.abs(ev.x - (ev.tx - dir * 2.5)), hi = ev.card ? C.altDive : C.altHigh;
      const a = Beasts.smooth(d / (ev.card ? 12 : 10));
      alt = C.altLow + (hi - C.altLow) * a;
      k = ev.card ? Beasts.smooth(ev.t / 0.5) : 1 - Beasts.smooth((d - 6) / 10);
    } else if (ev.phase === 'burn') {
      alt = C.altLow - 0.3 * Math.sin(Math.min(1, ev.t / 0.5) * Math.PI);
      k = 1;
    } else if (DF && DF.WHEEL_S) {
      /* THE WHEEL (G.dragonTick): it pulls up past the line's end, turns,
         and comes back over the burning town CLIMBING — the same whole
         scale, its height in where it is drawn — until it is gone out of
         the top of the view */
      const tq = DF.TURN_S, e = Math.max(0, ev.t - tq);
      alt = C.altLow + 1.5 * Math.min(1, ev.t / tq) + e * 3.2 + e * e * 3.4;
      k = Math.max(0, 1 - Math.max(0, ev.t - 0.6) / (DF.WHEEL_S - 0.6));
    } else {
      // climbing away (the world's dragon)
      alt = C.altLow + ev.t * 2.6 + (ev.card ? ev.t * ev.t * 5 : 0);
      k = Math.max(0, 1 - ev.t / 1.6);
    }
    /* the act's point is where it BURNS; the beast is drawn so its jaws hang
       just behind the line of fire it lays (G.dragonTick puts that line
       `reach` tiles ahead of the point), the whole way in and out */
    const back = (C.reach - C.lead) * TL - C.mouth[0] * sc;
    const gx = ev.x * TL + dir * back, gy = ev.y * TL, sx = gx, sy = gy - alt * TL;
    const fade = ev.card && ev.phase === 'leave'
      ? (DF && DF.WHEEL_S ? Math.max(0, Math.min(1, (DF.WHEEL_S - ev.t) / 0.25)) : Math.max(0, 1 - Math.abs(ev.x - ev.card.x) / 16)) : 1;
    /* the roar — once, as it comes into the player's world. A CARD's dragon
       roars as it ARRIVES: the moment the beast itself is over the edge of
       the view (the view takes it in — dragonfire.cam), and never later than
       its last stretch of the fly-in, so the breath never comes unannounced;
       roared at the play it was a sound from nowhere, a second before anything
       could be seen. The world's dragon keeps its wide ear. */
    const arrive = ev.card
      ? Beasts.inView(sx / TL, sy / TL, 1.5) || ev.phase !== 'fly' || ev.t > 0.85
      : Beasts.inView(ev.x, ev.y - alt, 6);
    if (!st.roared && arrive) {
      st.roared = true;
      if (typeof Sound !== 'undefined') Sound.play('roar');
      if (Beasts.inView(ev.x, ev.y, 4) || (ev.card && Beasts.inView(sx / TL, sy / TL, 0))) this.shakeAt(ev.card ? 5 : 3, 0.9);
    }
    /* the pall: the light goes out of the day round it (R.stepVignette —
       smooth now, the operator's ruling on the effects): the whole view a
       little darker and every edge of the screen closing in, a falloff at
       the device's own resolution, never a radial gradient and never a warm
       wash */
    if (k > 0.01) {
      // (over the board only: the black beyond it is left as it is)
      if (this.stepVignette) this.clipBoard(g, () => this.stepVignette(g, '12,7,9', k * fade, C.pallLv, 0.075));
      else {
        const v = this.viewTiles();
        g.fillStyle = 'rgba(12,7,9,' + (Math.round(C.pall * k * fade * 4) / 4).toFixed(3) + ')';
        g.fillRect(v.x0 * TL, v.y0 * TL, (v.x1 - v.x0) * TL, (v.y1 - v.y0) * TL);
      }
    }
    // which frame: the wing beat, or the breath (rear back, then the jaws open)
    let fr, breathing = false;
    if (ev.phase === 'burn' && breathF && breathF.length >= 9) {
      if (ev.t < C.rearS) fr = breathF[2 + Math.min(3, (ev.t / C.rearS * 4) | 0)];
      else { fr = breathF[6 + (((ev.t - C.rearS) * 10) | 0) % 3]; breathing = true; }
    } else fr = fly[((ev.t * C.fps) | 0) % fly.length];
    // the shadow on the ground, darker the lower it flies — the frame's own
    // silhouette, BLURRED (Beasts.softShadow: a shadow cast from high above
    // has no hard edge) and laid flat to a third of its height, stretched
    // with smoothing, at fractional coordinates
    {
      const sh = Beasts.softShadow(fr);
      // (high over the town on its wheel it still throws one, faint, sweeping the fields)
      const sa = Math.max(ev.card ? 0.14 : 0, 0.42 - 0.18 * (alt - C.altLow) / (C.altHigh - C.altLow)) * fade;
      // the shadow is ON the ground, so it stops at the board's edge (the
      // beast itself is in the sky and may come in from beyond it)
      this.clipBoard(g, () => {
        g.globalAlpha = Math.max(0, Math.min(1, sa));
        g.imageSmoothingEnabled = true;
        g.translate(gx, gy + TL * 0.2);
        if (dir < 0) g.scale(-1, 1);
        g.drawImage(sh, -sh.width / 2, -sh.height / 6, sh.width, sh.height / 3);
      });
    }
    /* EVERYTHING OF THE BEAST IS ON THE BOARD: its breath, its body and the
       embers off its scales are clipped to the world's edge — a dragon is
       never drawn across the off-map black (it comes in from the board's
       side: js/deckfx.js, dragonfire.dirFor) */
    this.clipBoard(g, () => {
      // the breath: a torrent from the jaws to the ground ahead
      if (breathing) {
        const mx = sx + dir * C.mouth[0] * sc, my = sy + C.mouth[1] * sc;
        const tx = (ev.x + dir * C.reach) * TL, ty = gy;
        this.drawDragonBreath(g, mx, my, tx, ty, ev.t, dir, fade);
        if (!st.breathed) {
          st.breathed = true;
          if (typeof Sound !== 'undefined') Sound.play('breath');
          // felt, not lit: a shake, and never a warm wash over the ground
          // (a card's is short, so each building that catches is felt too)
          if (Beasts.inView(ev.x, ev.y, 3)) this.shakeAt(ev.card ? 6 : 8, ev.card ? 0.55 : 1.7);
          if (this.startle) this.startle(ev.x, ev.y, 18);
        }
      }
      /* the beast — whole, never a half-seen ghost over the fields: a card's
         dragon comes and goes in HARD alpha steps, and only at the far ends of
         its flight (in, and once it has climbed most of the way out) */
      g.save();
      const step = a => Math.round(Math.max(0, Math.min(1, a)) * 4) / 4;
      g.globalAlpha = ev.card ? step(fade * 2.5) * step(ev.phase === 'fly' && ev.t < 0.3 ? ev.t / 0.3 : 1) : fade;
      g.translate(Beasts.snap(sx), Beasts.snap(sy));
      if (dir < 0) g.scale(-1, 1);
      g.drawImage(fr, -fr.width * sc / 2, -fr.height * sc / 2, fr.width * sc, fr.height * sc);
      g.restore();
      // embers off its scales, trailing behind — soft beads of the fire's
      // light, each dying as it drifts (R.fxDot: a mote at the device's own
      // resolution, never a 2px cell)
      const now = performance.now() / 1000;
      if (this.fxDot) for (let i = 0; i < 10; i++) {
        const ph = (now * 0.9 + i * 0.137) % 1;
        const ex = sx - dir * (30 + ph * 110) * sc + Math.sin(i * 7.1 + now * 3) * 14;
        const ey = sy + (Math.sin(i * 3.3) * 40 + ph * 30) * sc;
        this.fxDot(g, ex, ey, i % 3 ? 1.1 : 1.6, 0.95 * fade * (1 - ph * 0.7), i % 2 ? 'gold' : 'bronze');
      }
    });
  },
  /* THE BREATH. A sagging torrent of flame from the jaws to the ground, in
     three heats — the red outer, the orange-gold body, the white-hot core —
     each a smooth tube along the curve, swelling as it falls and writhing
     on the clock, with gouts of fire pouring down it so it RUNS rather than
     stands; its own light (R.fxGlow, its hue tied to its light) in the AIR
     round the upper stream only — nothing laid on the ground where it lands
     (a warm glow over the meadow reads as sand: the dry summer's ruling) —
     and where it lands a heap of the burning-town flames. Drawn at the
     device's own resolution (the operator's ruling on the effects): no 2px
     square anywhere in it. */
  BREATH: { N: 26, glowTo: 0.45 },
  drawDragonBreath(g, mx, my, tx, ty, t, dir, fade) {
    const F = ART.PALETTE.fire, B = this.BREATH, N = B.N;
    const cx = (mx + tx) / 2 + dir * 24, cy = Math.max(my, ty) - 6;      // the sag
    const at = u => [ (1 - u) * (1 - u) * mx + 2 * (1 - u) * u * cx + u * u * tx,
                      (1 - u) * (1 - u) * my + 2 * (1 - u) * u * cy + u * u * ty ];
    const nrm = u => {
      const dx = 2 * (1 - u) * (cx - mx) + 2 * u * (tx - cx), dy = 2 * (1 - u) * (cy - my) + 2 * u * (ty - cy), L = Math.hypot(dx, dy) || 1;
      return [-dy / L, dx / L];
    };
    const TL = CFG.TILE;
    // the light: the column's own, in the air only — small glows down its
    // upper reach, each under ~half a tile, never one on the ground it hits
    if (this.fxGlow) for (let i = 0; i < 5; i++) {
      const u = 0.04 + i * (B.glowTo - 0.04) / 4, [px, py] = at(u);
      this.fxGlow(g, px, py, Math.min(TL * 0.55, 8 + u * 22), 0.55 * fade, 'bronze', { soft: 2 });
    }
    // the torrent: a tube along the curve, `wk` of its width, to `lim` of the way down
    const tube = (wk, lim, ph) => {
      const L = [], Rr = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N * lim, [px, py] = at(u), [nx, ny] = nrm(u);
        const j = Math.sin(t * 31 + u * 70 + ph) * (1 + u * 3.5);
        const hw = (5 + u * 20) * wk / 2 * (i === N ? 0.35 : 1) * (0.88 + 0.12 * Math.sin(t * 23 + u * 40 + ph));
        L.push([px + nx * (hw + j), py + ny * (hw + j)]); Rr.push([px - nx * (hw - j), py - ny * (hw - j)]);
      }
      g.beginPath();
      g.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i < N; i++) g.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
      g.lineTo(L[N][0], L[N][1]);
      g.quadraticCurveTo(...at(lim), Rr[N][0], Rr[N][1]);
      for (let i = N - 1; i > 0; i--) g.quadraticCurveTo(Rr[i][0], Rr[i][1], (Rr[i][0] + Rr[i - 1][0]) / 2, (Rr[i][1] + Rr[i - 1][1]) / 2);
      g.lineTo(Rr[0][0], Rr[0][1]);
      g.closePath();
    };
    const along = (stops, lim) => {
      const [x1, y1] = at(lim), gr = g.createLinearGradient(mx, my, x1, y1);
      for (const [u, c, al] of stops) gr.addColorStop(u, this._fxC(c, al * fade));
      return gr;
    };
    g.save();
    g.globalCompositeOperation = 'source-over';
    tube(1, 1, 0);
    g.fillStyle = along([[0, F[1], 0.95], [0.5, F[0], 0.95], [0.9, F[0], 0.9], [1, F[0], 0.55]], 1); g.fill();
    tube(0.72, 1, 1.7);
    g.fillStyle = along([[0, F[2], 1], [0.45, F[1], 1], [1, F[1], 0.75]], 1); g.fill();
    tube(0.46, 0.92, 3.1);
    g.fillStyle = along([[0, F[3], 1], [0.5, F[2], 1], [1, F[2], 0.55]], 0.92); g.fill();
    tube(0.22, 0.7, 4.6);
    g.fillStyle = along([[0, '#fff8e6', 1], [0.6, F[3], 1], [1, F[3], 0]], 0.7); g.fill();
    // gouts of fire pouring down it: round, on the curve, at fractional positions
    const flow = t * 2.4;
    for (let i = 0; i < 14; i++) {
      const u = ((i / 14 + flow) % 1) * 0.94, [px, py] = at(u), [nx, ny] = nrm(u);
      const j = Math.sin(t * 27 + i * 2.7) * (1.5 + u * 5), r = (2.2 + u * 6.5) * (0.7 + 0.3 * Math.sin(i * 1.9));
      g.globalAlpha = fade * (u < 0.85 ? 0.9 : (0.94 - u) / 0.09 * 0.9);
      g.fillStyle = i % 3 ? F[2] : F[3];
      g.beginPath(); g.arc(px + nx * j, py + ny * j, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    /* the blast where it lands: the burning-town flames themselves (the
       fire line's own sprites, R.drawFireTongue's set) heaped up where the
       torrent hits — a fan of squares at this size read as orange bars */
    if (typeof Assets !== 'undefined' && Assets.resolve && Assets.resolve('misc/flameBig/0')) {
      const TL = CFG.TILE, beat = (t * 12) | 0;
      g.globalAlpha = fade;
      for (const [ox, sz, sd] of [[-0.6, 1.05, 1], [0.55, 1.15, 2], [0, 1.65, 0]]) {
        const s = Math.round(TL * sz * (0.9 + 0.1 * Math.sin(t * 17 + sd * 2.3)));
        Assets.drawSprite(g, 'misc/flameBig/' + ((beat + sd) % 4), Math.round(tx + ox * TL - s / 2), Math.round(ty - s * 0.9), { w: s, h: s });
      }
    } else for (let i = 0; i < 7; i++) {
      // (no flame sprites: smooth tongues of the same fire, R.fxFlame)
      const ox = (i - 3) * 8 + Math.sin(t * 13 + i) * 3, lick = 0.5 + 0.5 * Math.sin(t * 19 + i * 2.1);
      this.fxFlame(g, tx + ox, ty, 14 + lick * 22 - Math.abs(i - 3) * 3, 10, t, i * 1.7, fade);
    }
    g.globalAlpha = 1;
    // sparks thrown up and out of the blast: soft beads, dying as they fly
    if (this.fxDot) for (let i = 0; i < 14; i++) {
      const ph = (t * 1.7 + i * 0.071) % 1, a = i * 2.39;
      this.fxDot(g, tx + Math.cos(a) * ph * 46, ty - ph * 52 + ph * ph * 30, i % 3 ? 1 : 1.4, fade * (1 - ph), i % 3 === 0 ? 'gold' : 'bronze');
    }
  },
  /* ONE POINT OF THE FIRE LINE (S.dragon.fire, drawn under the units by
     R.draw): a big flame and two smaller ones knitting it to its neighbours,
     out of the very sprite set a burning building wears, each on its own
     beat, growing as it catches and shrinking to embers as it gutters.
     Answers false when the flame sprites are not there (the caller keeps its
     tongues of squares). */
  drawFireTongue(g, fp, life, now) {
    if (typeof Assets === 'undefined' || !Assets.resolve || !Assets.resolve('misc/flameBig/0')) return false;
    const TL = CFG.TILE, fx = fp.x * TL, fy = fp.y * TL, beat = (now * 9) | 0;
    const big = life > 0.25, s = TL * (big ? 1.25 : 0.7) * (0.55 + 0.45 * life);
    if (s < 3) return true;
    const key = (big ? 'misc/flameBig/' : 'misc/flameSmall/');
    g.globalAlpha = Math.min(1, life * 1.6);
    Assets.drawSprite(g, key + ((beat + fp.seed) % 4), Math.round(fx - s / 2), Math.round(fy - s * 0.92), { w: Math.round(s), h: Math.round(s) });
    const s2 = s * 0.62;
    Assets.drawSprite(g, 'misc/flameSmall/' + ((beat + fp.seed + 1) % 4), Math.round(fx - s * 0.5 - s2 / 2), Math.round(fy - s2 * 0.9), { w: Math.round(s2), h: Math.round(s2) });
    Assets.drawSprite(g, 'misc/flameSmall/' + ((beat + fp.seed + 2) % 4), Math.round(fx + s * 0.5 - s2 / 2), Math.round(fy - s2 * 0.9), { w: Math.round(s2), h: Math.round(s2) });
    g.globalAlpha = 1;
    return true;
  },
  // the old procedural beast: the fallback while (or if) the strips are missing
  drawDragonOld(g, ev) {
    const TL = CFG.TILE, dx2 = ev.x * TL, dy2 = ev.y * TL;
    const spr = Sprites.misc.dragon[((ev.t * 6) | 0) % 4];
    if (ev.card && ev.phase === 'fly' && ev.t < 0.35) g.globalAlpha = ev.t / 0.35;
    g.fillStyle = 'rgba(10,8,5,0.30)';
    g.beginPath(); g.ellipse(dx2, dy2 + 8, 32, 9, 0, 0, Math.PI * 2); g.fill();
    if (ev.phase === 'burn') {
      const F = ART.PALETTE.fire;
      const mx = dx2 + ev.dir * 72, my = dy2 - 52;
      // (smooth gouts of fire, never squares — the operator's ruling on the effects)
      for (let i = 0; i < 18; i++) {
        const t2 = i / 18;
        const bx2 = mx + ev.dir * t2 * 26 + Math.sin(ev.t * 22 + i * 2.4) * (2 + t2 * 4);
        const by2 = my + t2 * 58, sz = 2.5 + t2 * 8;
        g.fillStyle = F[t2 < 0.3 ? 3 : t2 < 0.65 ? 2 : 1];
        g.beginPath(); g.arc(bx2, by2, sz * 0.6, 0, Math.PI * 2); g.fill();
      }
    }
    g.save();
    g.translate(dx2, dy2 - 34);
    if (ev.dir < 0) g.scale(-1, 1);
    g.drawImage(spr, -96, -48);
    g.restore();
    g.globalAlpha = 1;
  },

  /* THE KRAKEN. Its act (G.krakenTick) has three beats on one hull: RISE
     (1.6s — it comes up out of the sea beside the boat while a tentacle
     rears over it and slams down on the beat the boat is taken), THRASH
     (2.2s — the whole beast heaving, tentacles lashing), SINK (1.6s). The
     body rises out of its own ring of foam a little way out from its prey,
     toward the open water; the sea round it darkens and rings of foam roll
     out. Drawn only where the player can see (the event is fog-honest).
     `ev` is any act of that shape ({phase, t, x, y} — the event's own, or one
     of Kraken's Call's risings); with none given it is the event's. */
  drawKrakenAct(g, dt, ev, opts) {
    ev = ev || (S.kraken && S.kraken.ev);
    if (!ev) return;
    if (!G.visibleAt(ev.x | 0, ev.y | 0)) return;
    if (!Beasts.ready('kraken')) { Beasts.want('kraken'); this.drawKrakenOld(g, ev); return; }
    const st = Beasts.st(ev);
    if (!st.body) st.body = this.krakenBodyAt(ev.x, ev.y);
    /* the arm that takes the boat breaks the surface 0.35s into the rise and
       its blow lands on the take — the rise's end (1.6s), when the act's
       tick drags the boat under (Beasts.strikeFrame) */
    let rise, arm = -1;
    if (ev.phase === 'rise') { rise = Beasts.smooth((ev.t - 0.1) / 1.1); arm = ev.t - 0.35; }
    else if (ev.phase === 'thrash') { rise = 1; arm = 1.25 + ev.t; }
    else rise = 1 - Beasts.smooth(ev.t / 1.3);
    if (!st.roared) {
      st.roared = true;
      if (typeof Sound !== 'undefined') Sound.play('kraken');
      if (Beasts.inView(ev.x, ev.y, 2)) this.shakeAt(5, 1.4);
    }
    this.drawKrakenBody(g, st.body.x, st.body.y, rise, ev.t + (ev.phase === 'thrash' ? 1.6 : ev.phase === 'sink' ? 3.8 : 0));
    const tent = arm >= 0 ? Beasts.strikeFrame(arm, 1.25) : -1;
    // (a card's take draws its own seized hull from the blow on — `untilTake`)
    if (opts && opts.untilTake && arm >= 1.25) {
      if (!st.slammed.boat) { st.slammed.boat = true; if (arm < 1.25 + 0.3) this.krakenSlam(ev.x, ev.y); }
    } else if (tent >= 0) {
      this.drawTentacle(g, ev.x, ev.y, tent, st.body.x < ev.x ? 1 : -1, arm - 1.25);
      // the blow — heard and felt once, and only as it lands (an act first
      // seen half over does not slam on sight)
      if (tent === 8 && arm >= 1.25 && !st.slammed.boat) {
        st.slammed.boat = true;
        if (arm < 1.25 + 0.3) this.krakenSlam(ev.x, ev.y);
      }
    }
  },
  // where the body comes up: a little way out from its prey, toward the
  // most open water — never on the shore it is reaching across, and never
  // hanging off the edge of the world
  krakenBodyAt(x, y) {
    /* the most open water in reach of its prey: every candidate middle
       within 3 tiles scored by the wet ground under the BODY'S OWN WATER —
       the ellipse its drawn beast stands in (KRAKEN.hull: ~6 tiles by 5,
       its middle a little below the frame's), so a narrow sea puts it
       square over the channel rather than half up the shore, and open sea
       puts it a stride out — less a little for distance.
       THE WHOLE DRAWN BODY STANDS ON THE BOARD: water is counted only on
       the board (MapGen.onBoard — G.wetAt asks inB, which counts the rim,
       and an island map's ocean runs right into it), and a candidate whose
       drawn box (KRAKEN.frame × scale) would hang past the board's edge
       ranks below every one that does not. Only where no middle in reach
       keeps all of it on the board (a hull in a corner) does the least
       overhang win, and R.clipBoard keeps that overhang out of the black. */
    const C = Beasts.KRAKEN, W = CFG.W, H = CFG.H, [rx, ry, dn] = C.hull;
    const half = (C.frame || 224) * C.scale / 2 / CFG.TILE;
    const wet = (wx, wy) => MapGen.onBoard(Math.floor(wx), Math.floor(wy)) && G.wetAt(wx, wy);
    let best = null;
    for (let dy = -3; dy <= 3; dy += 0.5) for (let dx = -3; dx <= 3; dx += 0.5) {
      const d = Math.hypot(dx, dy);
      if (d > 3) continue;
      const cx = x + dx, cy = y + dy;
      let n = 0, m = 0;
      for (let oy = -Math.ceil(ry); oy <= Math.ceil(ry); oy += 0.5) for (let ox = -Math.ceil(rx); ox <= Math.ceil(rx); ox += 0.5) {
        if ((ox / rx) * (ox / rx) + (oy / ry) * (oy / ry) > 1) continue;
        m++; if (wet(cx + ox, cy + dn + oy)) n++;
      }
      // the board is tiles 1..W-1 (the rim is off-map void)
      const over = Math.max(0, 1 - (cx - half)) + Math.max(0, cx + half - (W - 1)) +
                   Math.max(0, 1 - (cy - half)) + Math.max(0, cy + half - (H - 1));
      const sc = n / m - d * 0.04 - (over > 0 ? 2 + over : 0);
      if (!best || sc > best.sc) best = { x: cx, y: cy, sc };
    }
    return best ? { x: best.x, y: best.y } : { x, y };
  },
  /* THE BODY at (x, y) in tiles, `rise` 0 (under) → 1 (up), its own clock t.
     It COMES UP OUT OF ITS WATERLINE, never through a hole: its sea (the
     frame's own whirl of dark water and foam — Beasts.split) is laid only on
     the water, in hard steps, and the beast rises through the surface — above
     its waterline it stands over whatever is behind it, below it only where
     there is water to be under. Nothing of it is ever a disc on the grass, a
     circle cut out of the beast, or a ring of white dashes round a hole. The
     water is the traced coast's own outline (R.waterBodyPath), so its edge
     is the shore the player sees. On a page whose canvas cannot be read the
     frame is laid whole, clipped the same way. */
  drawKrakenBody(g, x, y, rise, t) {
    const C = Beasts.KRAKEN, TL = CFG.TILE, fr = Beasts.ready('kraken');
    if (!fr || rise <= 0.001) return;
    const f = fr[((t * C.fps) | 0) % fr.length], sc = C.scale;   // whole and fixed: it surfaces, it never grows
    const cx = Beasts.snap(x * TL), cy = Beasts.snap(y * TL), w = f.width * sc, h = f.height * sc;
    const sp = Beasts.split(f), water = this.waterBodyPath ? this.waterBodyPath() : null;
    const step = a => Math.round(Math.max(0, Math.min(1, a)) * 4) / 4;
    const wl = cy + C.waterline * sc, sink = Beasts.snap((1 - Beasts.smooth(rise)) * C.sinkPx * sc);
    const onWater = fn => { g.save(); if (water) g.clip(water); try { fn(); } finally { g.restore(); } };
    // 1. its sea: the whirl it churns up, on the water only
    onWater(() => {
      g.globalAlpha = step(rise * 1.6);
      g.drawImage(sp ? sp.wet : f, cx - w / 2, cy - h / 2, w, h);
      // rings of foam rolling out from where it breaks the surface — broken
      // white water at the device's own resolution (R.fxFoam), thinning as
      // each rolls out, never a ring of 2px dots
      g.globalAlpha = 1;
      for (let r = 0; r < 3; r++) {
        const q = ((t * 0.55 + r / 3) % 1), rad = w * (0.3 + q * 0.42), a = 0.9 * (1 - q) * Math.min(1, rise * 1.4);
        if (a < 0.02) continue;
        this.fxFoam(g, cx, wl, rad, rad * 0.42, a, { css: 1.7 - q * 0.8, seed: r * 7 + 3, spin: t * 0.06 * (r % 2 ? -1 : 1), deep: r % 2 ? '#9fcbe2' : '#b9def0' });
      }
    });
    // 2. the beast, up out of its waterline: whole above it…
    const body = sp ? sp.dry : f, by = cy - h / 2 + sink;
    g.save();
    g.beginPath(); g.rect(cx - w, by - h, w * 2, wl - (by - h)); g.clip();
    g.drawImage(body, cx - w / 2, by, w, h);
    g.restore();
    // …and below it only over the water — out of the dark there in steps as
    // it comes up, never a whole beast seen through the sea before it rises
    const deep = step((rise - 0.5) * 2);
    if (deep > 0) onWater(() => {
      g.beginPath(); g.rect(cx - w, wl, w * 2, h * 2); g.clip();
      g.globalAlpha = deep;
      g.drawImage(body, cx - w / 2, by, w, h);
    });
  },
  /* A SPLASH OF WATER — never ice: the blow's crown thrown up in arcs of
     drops in the water's own ramp, white at their heads, falling back into
     the sea; a spout at the heart collapsing; a ring of broken foam rolling
     out over the surface. Drawn at the device's own resolution (the
     operator's ruling on the effects): the spout a smooth tapered body in
     the water's ramp, every drop a round head with its streak (R.fxDrop),
     the ring R.fxFoam — never a 2px cell. `t` seconds since the blow (it
     lasts `life`), `sz` its reach in the caller's units, `seed` its own
     scatter. */
  SPLASH: { life: 0.8 },
  drawSplash(g, x, y, t, sz, seed) {
    const life = this.SPLASH.life;
    if (!(t >= 0 && t < life)) return;
    const q = t / life, WR = ART.PALETTE.water, FOAM = ['#8fc6e0', '#cfe9f6', '#ffffff'];
    const hsh = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0; h ^= h >>> 13; return (Math.imul(h, 0xc2b2ae35) >>> 0) / 4294967296; };
    seed = seed | 0;
    // the ring on the water, rolling out
    const rr = sz * (0.3 + 0.8 * (1 - (1 - q) * (1 - q)));
    if (q < 0.9) this.fxFoam(g, x, y, rr, rr * 0.36, q < 0.4 ? 1 : 1 - (q - 0.4) / 0.5, { css: 1.8 - q, seed: seed * 3 + 1, spin: q * 0.4, col: q < 0.4 ? FOAM[2] : FOAM[1] });
    // the spout at the heart: a column of water thrown up and falling back —
    // a smooth tapered body, its own ramp from the sea's blue to the foam at its head
    if (q < 0.5) {
      const hh = sz * 1.3 * Math.sin(q / 0.5 * Math.PI), wd = sz * 0.34;
      if (hh > 1) {
        const body = (wk, hk) => {
          const n = 10, L = [], Rr = [];
          for (let i = 0; i <= n; i++) {
            const k = i / n, yy = k * hh * hk, ww = wd * wk * (1 - k * 0.65) / 2, sw = Math.sin(yy * 0.4 + seed) * Math.min(2, wd * 0.12);
            L.push([x - ww + sw, y - yy]); Rr.push([x + ww + sw, y - yy]);
          }
          g.beginPath(); g.moveTo(L[0][0], L[0][1]);
          for (let i = 1; i <= n; i++) g.lineTo(L[i][0], L[i][1]);
          const [hx, hy] = [(L[n][0] + Rr[n][0]) / 2, L[n][1]];
          g.quadraticCurveTo(hx, hy - wd * wk * 0.3, Rr[n][0], Rr[n][1]);
          for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
          g.closePath();
        };
        g.save();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = WR[3]; body(1, 1); g.fill();
        g.fillStyle = WR[4]; body(0.55, 0.86); g.fill();
        g.fillStyle = FOAM[1]; g.beginPath(); g.arc(x + Math.sin(hh * 0.4 + seed) * Math.min(2, wd * 0.12), y - hh, wd * 0.36, 0, Math.PI * 2); g.fill();
        g.fillStyle = FOAM[2]; g.beginPath(); g.arc(x, y - hh - wd * 0.08, wd * 0.2, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    // the crown: drops thrown out in arcs, each a round head and a short streak
    for (let k = 0; k < 16; k++) {
      const a = (k / 15 - 0.5) * 2.4 + (hsh(seed + k) - 0.5) * 0.3;
      const v = sz * (1.8 + hsh(seed * 7 + k) * 1.1);
      const vx = Math.sin(a) * v * 0.7, vy = Math.cos(a) * v * 1.1;
      const px = x + vx * t, py = y - vy * t + sz * 5.2 * t * t;
      if (py > y + 2) continue;                       // back in the sea
      const r = (k % 3 === 0 ? 1.7 : 1.15) * Math.max(0.6, Math.min(1.6, sz / 30));
      this.fxDrop(g, px, py, vx, -vy + sz * 10.4 * t, r, q < 0.45 ? FOAM[2] : FOAM[1], q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3);
    }
  },
  /* ONE TENTACLE on its strike: frame f of the strip (0 rearing … 8 the
     slam's splash … 12 rising again), its base on the water at (x, y) in
     tiles, side ±1 mirrors it so it reaches in from the body's side. The
     strip's own splash crowns (frames 7-10) were pale jagged shards that
     read as ICE: on those frames only the arm is drawn (Beasts.split) and
     the blow throws WATER (R.drawSplash), `sT` seconds since it landed. */
  drawTentacle(g, x, y, f, side, sT) {
    const C = Beasts.KRAKEN, TL = CFG.TILE;
    const fr = typeof Assets !== 'undefined' && Assets.fxFrames('kraken-tentacle');
    if (!fr || fr.length < 13) return;
    const i = Math.max(0, Math.min(12, f | 0)), sc = C.tentScale;
    const sp = i >= 7 && i <= 10 ? Beasts.split(fr[i]) : null;
    const img = sp ? sp.dry : fr[i];
    const bx = Beasts.snap(x * TL), by = Beasts.snap(y * TL + TL * 0.35);
    g.save();
    g.translate(bx, by);
    if (side < 0) g.scale(-1, 1);
    g.drawImage(img, -C.tentBase[0] * sc, -C.tentBase[1] * sc, img.width * sc, img.height * sc);
    g.restore();
    // (a blow that lands on the shore throws the shore up instead — the caller's debris)
    if (sp && sT != null && G.wetAt(x, y + 0.35)) this.drawSplash(g, bx, by, sT, TL * 0.9, (x * 13 + y * 7) | 0);
  },
  // the blow lands: a wall of water, the camera jolts, the birds go up
  krakenSlam(x, y) {
    if (typeof Sound !== 'undefined') Sound.play('splash');
    if (Beasts.inView(x, y, 1)) this.shakeAt(7, 0.7);
    if (this.startle) this.startle(x, y, 10);
  },
  drawKrakenOld(g, ev) {
    const TL = CFG.TILE;
    const k = ev.phase === 'rise' ? Math.min(1, ev.t / 1.0) : ev.phase === 'sink' ? Math.max(0, 1 - ev.t / 1.2) : 1;
    const fr = Sprites.misc.kraken[((ev.t * 5) | 0) % 4], size = TL * 3;
    g.globalAlpha = k;
    g.drawImage(fr, ev.x * TL - size / 2, ev.y * TL - size / 2 - k * 6, size, size);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(235,244,248,' + (0.4 * k).toFixed(2) + ')';
    g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(ev.x * TL, ev.y * TL + 12, 24 + Math.sin(ev.t * 5) * 5, 9, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.globalAlpha = 0.5 * k;
    g.ellipse(ev.x * TL, ev.y * TL + 12, 34 + Math.sin(ev.t * 4 + 1.5) * 6, 12, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  },
});
