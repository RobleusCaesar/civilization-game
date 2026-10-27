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
};
window.Beasts = Beasts;

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
    /* the pall: the light goes out of the day round it — in HARD DITHERED
       STEPS (R.stepVignette): the whole view a step darker and every edge of
       the screen closing in three more, square, never a radial gradient and
       never a smooth fade (its strength moves in quarters) */
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
    // silhouette, laid flat by a whole-number squash (Beasts.shadowOf)
    {
      const sh = Beasts.shadowOf(fr);
      // (high over the town on its wheel it still throws one, faint, sweeping the fields)
      const sa = Math.max(ev.card ? 0.14 : 0, 0.42 - 0.18 * (alt - C.altLow) / (C.altHigh - C.altLow)) * fade;
      // the shadow is ON the ground, so it stops at the board's edge (the
      // beast itself is in the sky and may come in from beyond it)
      this.clipBoard(g, () => {
        g.globalAlpha = Math.max(0, sa);
        g.translate(Beasts.snap(gx), Beasts.snap(gy + TL * 0.2));
        if (dir < 0) g.scale(-1, 1);
        g.drawImage(sh, -sh.width / 2, -Math.round(sh.height / 2));
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
      // embers off its scales, trailing behind
      const now = performance.now() / 1000, F = ART.PALETTE.fire;
      g.globalAlpha = 0.85 * fade >= 0.5 ? 1 : 0;
      for (let i = 0; i < 10; i++) {
        const ph = (now * 0.9 + i * 0.137) % 1;
        const ex = sx - dir * (30 + ph * 110) * sc + Math.sin(i * 7.1 + now * 3) * 14;
        const ey = sy + (Math.sin(i * 3.3) * 40 + ph * 30) * sc;
        g.fillStyle = F[i % 2 ? 2 : 1];
        g.fillRect(Beasts.snap(ex), Beasts.snap(ey), 2, 2);
      }
      g.globalAlpha = 1;
    });
  },
  /* THE BREATH. A sagging column of flame from the jaws to the ground:
     squares of fire in three heats (red outer, orange-gold body, white-hot
     core), streaming along the curve and widening as it falls, the column's
     own glow ADDED in hard steps — and nothing laid on the ground round it —
     and where it lands a heap of the burning-town flames. All hard pixels on
     the 2px grid. */
  drawDragonBreath(g, mx, my, tx, ty, t, dir, fade) {
    const F = ART.PALETTE.fire, N = 30, snap = Beasts.snap;
    const cx = (mx + tx) / 2 + dir * 24, cy = Math.max(my, ty) - 6;      // the sag
    const at = u => [ (1 - u) * (1 - u) * mx + 2 * (1 - u) * u * cx + u * u * tx,
                      (1 - u) * (1 - u) * my + 2 * (1 - u) * u * cy + u * u * ty ];
    const flow = (t * 2.4) % (1 / N);
    // the light: the COLUMN's own glow, added in hard steps — and only the
    // column. No pool of light on the ground where it lands: a warm glow
    // laid over the meadow reads as sand (the dry summer's ruling)
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const u = i / N + flow, [px, py] = at(Math.min(1, u)), s = 8 + u * 30;
      if (u > 0.62) break;          // in the air only: none of it laid over the ground where it lands
      g.fillStyle = 'rgba(255,140,50,' + (0.07 * fade).toFixed(3) + ')';
      g.fillRect(snap(px - s / 2), snap(py - s / 2), snap(s), snap(s));
    }
    g.restore();
    // the flame itself, outer to core
    g.globalAlpha = fade;
    for (const [col, wk, lim] of [[F[0], 1, 1], [F[1], 0.72, 1], [F[2], 0.46, 0.92], [F[3] || '#ffe7a0', 0.22, 0.7]]) {
      g.fillStyle = col;
      for (let i = 0; i < N; i++) {
        const u = i / N + flow;
        if (u > lim) continue;
        const [px, py] = at(Math.min(1, u));
        const j = Math.sin(t * 31 + i * 2.7) * (2 + u * 7), s = (5 + u * 20) * wk;
        g.fillRect(snap(px - s / 2 + j), snap(py - s / 2 - j * 0.4), snap(Math.max(2, s)), snap(Math.max(2, s)));
      }
    }
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
    } else for (let i = 0; i < 9; i++) {
      const ox = (i - 4) * 7 + Math.sin(t * 13 + i) * 3, lick = 0.5 + 0.5 * Math.sin(t * 19 + i * 2.1);
      const h = 14 + lick * 22 - Math.abs(i - 4) * 2.5, w = 8;
      g.fillStyle = F[1]; g.fillRect(snap(tx + ox - w / 2), snap(ty - h), w, snap(h));
      g.fillStyle = F[2]; g.fillRect(snap(tx + ox - w / 4), snap(ty - h * 0.7), Math.max(2, w / 2), snap(h * 0.7));
      if (lick > 0.6) { g.fillStyle = F[3] || '#ffe7a0'; g.fillRect(snap(tx + ox - 1), snap(ty - h * 0.4), 2, snap(h * 0.4)); }
    }
    // sparks thrown up and out of the blast
    for (let i = 0; i < 14; i++) {
      const ph = (t * 1.7 + i * 0.071) % 1, a = i * 2.39;
      g.fillStyle = F[i % 3 === 0 ? 3 : 2] || F[2];
      g.fillRect(snap(tx + Math.cos(a) * ph * 46), snap(ty - ph * 52 + ph * ph * 30), 2, 2);
    }
    g.globalAlpha = 1;
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
      for (let i = 0; i < 18; i++) {
        const t2 = i / 18;
        const bx2 = mx + ev.dir * t2 * 26 + Math.sin(ev.t * 22 + i * 2.4) * (2 + t2 * 4);
        const by2 = my + t2 * 58, sz = 2.5 + t2 * 8;
        g.fillStyle = F[t2 < 0.3 ? 3 : t2 < 0.65 ? 2 : 1];
        g.fillRect(bx2 - sz / 2, by2 - sz / 2, sz, sz);
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
  drawKrakenAct(g, dt, ev) {
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
    if (tent >= 0) {
      this.drawTentacle(g, ev.x, ev.y, tent, st.body.x < ev.x ? 1 : -1);
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
       within 3 tiles scored by the wet tiles under the body's ring (radius
       2), less a little for distance — a river or a narrow bay puts it
       square over the channel, open sea puts it a stride out.
       THE WHOLE DRAWN BODY STANDS ON THE BOARD: water is counted only on
       the board (MapGen.onBoard — G.wetAt asks inB, which counts the rim,
       and an island map's ocean runs right into it), and a candidate whose
       drawn box (KRAKEN.frame × scale) would hang past the board's edge
       ranks below every one that does not. Only where no middle in reach
       keeps all of it on the board (a hull in a corner) does the least
       overhang win, and R.clipBoard keeps that overhang out of the black. */
    const C = Beasts.KRAKEN, W = CFG.W, H = CFG.H;
    const half = (C.frame || 224) * C.scale / 2 / CFG.TILE;
    const wet = (wx, wy) => MapGen.onBoard(Math.floor(wx), Math.floor(wy)) && G.wetAt(wx, wy);
    let best = null;
    for (let dy = -3; dy <= 3; dy += 0.5) for (let dx = -3; dx <= 3; dx += 0.5) {
      const d = Math.hypot(dx, dy);
      if (d > 3) continue;
      const cx = x + dx, cy = y + dy;
      let n = 0, m = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        if (ox * ox + oy * oy > 4.5) continue;
        m++; if (wet(cx + ox, cy + oy)) n++;
      }
      // the board is tiles 1..W-1 (the rim is off-map void)
      const over = Math.max(0, 1 - (cx - half)) + Math.max(0, cx + half - (W - 1)) +
                   Math.max(0, 1 - (cy - half)) + Math.max(0, cy + half - (H - 1));
      const sc = n / m - d * 0.04 - (over > 0 ? 2 + over : 0);
      if (!best || sc > best.sc) best = { x: cx, y: cy, sc };
    }
    return best ? { x: best.x, y: best.y } : { x, y };
  },
  // the body at (x, y) in tiles, `rise` 0 (under) → 1 (up), its own clock t
  drawKrakenBody(g, x, y, rise, t) {
    const C = Beasts.KRAKEN, TL = CFG.TILE, fr = Beasts.ready('kraken');
    if (!fr || rise <= 0.001) return;
    const f = fr[((t * C.fps) | 0) % fr.length], sc = C.scale;   // whole and fixed: it surfaces, it never grows
    const cx = Beasts.snap(x * TL), cy = Beasts.snap(y * TL), w = f.width * sc, h = f.height * sc;
    // rings of foam rolling out from where it breaks the surface
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 3; r++) {
      const q = ((t * 0.55 + r / 3) % 1), rad = w * (0.36 + q * 0.5);
      g.fillStyle = 'rgba(200,232,240,' + (0.45 * (1 - q) * rise).toFixed(3) + ')';
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + r;
        g.fillRect(Beasts.snap(cx + Math.cos(a) * rad), Beasts.snap(cy + 8 + Math.sin(a) * rad * 0.55), 2, 2);
      }
    }
    g.restore();
    /* SURFACING: the beast is uncovered from the middle outward — a widening
       hole in the sea, its edge a ring of white water — rather than wiped up
       from a waterline, which read as a slab sliding out of the ground */
    const R0 = Math.hypot(w, h) * 0.5 * rise;
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, R0, R0 * 0.92, 0, 0, Math.PI * 2);
    g.clip();
    g.drawImage(f, cx - w / 2, cy - h / 2 + Beasts.snap((1 - rise) * h * 0.12), w, h);
    g.restore();
    if (rise < 0.98) {
      g.fillStyle = 'rgba(236,246,250,0.9)';
      const n = 48;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, j = Math.sin(t * 19 + i * 1.7) * 3;
        g.fillRect(Beasts.snap(cx + Math.cos(a) * (R0 + j)), Beasts.snap(cy + Math.sin(a) * (R0 * 0.92 + j)), 4, 2);
      }
    }
  },
  /* ONE TENTACLE on its strike: frame f of the strip (0 rearing … 8 the
     slam's splash … 12 rising again), its base on the water at (x, y) in
     tiles, side ±1 mirrors it so it reaches in from the body's side. */
  drawTentacle(g, x, y, f, side) {
    const C = Beasts.KRAKEN, TL = CFG.TILE;
    const fr = typeof Assets !== 'undefined' && Assets.fxFrames('kraken-tentacle');
    if (!fr || fr.length < 13) return;
    const i = Math.max(0, Math.min(12, f | 0)), img = fr[i], sc = C.tentScale;
    const bx = Beasts.snap(x * TL), by = Beasts.snap(y * TL + TL * 0.35);
    g.save();
    g.translate(bx, by);
    if (side < 0) g.scale(-1, 1);
    g.drawImage(img, -C.tentBase[0] * sc, -C.tentBase[1] * sc, img.width * sc, img.height * sc);
    g.restore();
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
