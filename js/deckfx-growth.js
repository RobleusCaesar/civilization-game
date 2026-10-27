"use strict";
/* THE CARD SYSTEM — GROWTH — richer work, faster building and the Wonder: Harvest Festival's yield, Bountiful Land, Golden Age, Quick Hands, Blight, Enlightenment, Age of Marble, Wonder's Foundation (tests/deck-growth.mjs).
   The contract every entry keeps is in js/deckfx.js (the engine) and
   js/deck.js (Deck.play, the one door); a card's own moment in the world
   is its `show` (R.startCardShow, js/render.js).

   SIX RULES, each one a fault the first reading of these cards walks into:

   1. RICHER IS MORE IN TOTAL, NOT FASTER. A card's 'gather' multiplier is a
      factor on the CREDIT (Units.gatherYield): every load comes home richer
      while the tile is stripped at its own pace. Paid through the pace
      instead (Units.gatherMode, the first cut), a stand gave exactly its
      stock either way and a stone seam — the map's one finite resource —
      gave not one stone more; the card only emptied the ground sooner. Hand
      gathering, both fishings and the meat of a kill all ask the one helper;
      stations and the hall's own gold are production (Deck.mult('produce'),
      Bld.dailyProduction). Only the WORK is scored (S.stats.gathered counts
      the take, never the card's share).
   2. TWO CARDS MULTIPLY, ONE CARD EXTENDS. A festival and a Golden Age
      together are 1.4 × 1.5 = 2.1; a second festival lengthens the first
      and never stacks its strength (Deck.addTimed).
   3. QUICKER HANDS ARE FOR WHAT RISES (Deck.buildRate): a work site, an
      upgrade, the masons' village-wide wall works (tc.wallUp), a sapper
      raising a span and a span's reinforcing (br.upgrading) — everything
      the game builds or upgrades. Never repair (mending is not building),
      never a sapper's earthworks (dig, clear, mound), never the training
      yards. And still only the builders' own work: no card finishes
      anything by itself.
   4. NO CARD LAYS THE LAST STONE. Finishing the Wonder is the run's ending
      (Bld.finish → G.wonderRaised); Wonder's Foundation stops at 95% and
      the Age of Marble only speeds the hands that raise it.
   5. A CARD'S GIFT SCORES NOTHING: Enlightenment's levels are raised with
      Bld.finishUpgrade's `byCard` (no "upgrade finished" scored, no line
      per building), the festival's extra wood is not "gathered". What a
      card-raised building then SEES is a building's sight like any other:
      the next visibility pass charts the wider ring and it counts toward
      exploration as building a taller tower would (skipping the level's
      own G.reveal only spares a duplicate of that pass — it is not what
      keeps exploration honest, and nothing needs to).
   6. BLIGHT IS DENIABLE AND FOG-HONEST. It deals no blow, so it leaves the
      Calm truce standing and asks nothing of Combat.hostile; its look is
      drawn ONLY on the rival's works the player can see right now
      (G.visibleAt), and its pall rolls toward the rival as the player knows
      them — their hall if it is remembered, else the far side of the world
      from the player's own seat — so the card is never a lamp in the fog.
      Bountiful Land's orbit is drawn under the fog, which dims and hides it
      like the land it marks (bountiful_land.drawGround).

   WHAT BELONGS TO THE LAND IS DRAWN WITH THE LAND. R.drawCardWorld runs
   after the units and over the fog — right for light in the air, wrong for
   the ground: Bountiful Land's sprigs (gone now — the operator's ruling)
   grew through the villagers' bodies and stood lit on remembered ground the
   fog dims, and the Blight's grey wash was laid over the rival's hands on
   their own fields. So what marks the land (Bountiful Land's ring and its
   orbit) draws in the GROUND pass
   (drawGround / a show's 'ground' layer — R.drawCardGround, under bridges,
   buildings, units and the fog), and the withered fields ON their building
   (drawBld — R.drawCardBld, right after its own art). Only light and what
   flies (rings in the air, pollen, spores, the sky) stays over the scene.

   Every show is render state (R.cardShows, never in S); a run with no card
   in play pays nothing for any of it (R.draw's length checks). THE LIGHT IS
   DRAWN AT THE DEVICE'S OWN RESOLUTION (operator ruling, 2026-10-27 — it
   supersedes the hard-pixel house style for effects; the world's art stays
   pixel art): the toolkit below lays its rings, beads, glints, columns,
   rays and glitter through the shared helpers in js/render.js (R.fxRing,
   fxDot, fxSpark, fxBeam, fxRays), smooth and antialiased, never snapped to
   the art's 2px grain — and THE LIGHT IS STILL GOLD, NOT LIME: a body of
   light turns what it falls on gold, then brightens it, its hue tied to its
   light (R.FX_TIE), never gold added over the grass. Every show here is
   drawn that way: the festival's embers, Quick Hands' hammer, sawdust and
   '×2', the Blight's billows, spores and leaves, Enlightenment's burst,
   runners and climbing light, the marble's chips, the Foundation's cracks
   of light and lit carvings, and the plaques the acts say what they did on
   (the town's helpers — TX.hammer, shard, leaf, grain, line, taper — are
   asked through Deck._townTX, guarded on the method). The art they light
   (the bunting, the standing stones and slabs, the marble's dressed blocks)
   stays the world's pixel art. */

/* ---------------- the toolkit the growth cards draw with ---------------- */
const GrowFX = {
  GOLD: ['#7a4a0a', '#d8902a', '#ffcc40', '#ffd45e', '#fff1b8', '#fffbe8'],
  snap(v, px) { px = px || 2; return Math.round(v / px) * px; },
  // a stable 0..1 for (a, b): the same mote lands the same way every frame
  hash(a, b) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(((b | 0) + 40503) | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },
  ease(p) { p = Math.max(0, Math.min(1, p)); return 1 - (1 - p) * (1 - p); },
  // a smooth churning field over a cell grid: value noise on an `L`-cell
  // lattice, eased between its corners, drifting with `t` — clouds come in
  // lumps from this, where an independent hash per cell is only static
  blob(gx, gy, L, t) {
    const x = gx / L + t, y = gy / L - t * 0.6, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.hash(x0, y0 + 911), b = this.hash(x0 + 1, y0 + 911), c = this.hash(x0, y0 + 912), d = this.hash(x0 + 1, y0 + 912);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  },
  // alpha in hard fifths: a fade that STEPS, never glides
  step(a) { return Math.max(0, Math.min(1, Math.round(a * 5) / 5)); },
  // rises over [a, b], holds, falls over [c, d]
  env(p, a, b, c, d) {
    if (p <= a || p >= d) return 0;
    if (p < b) return (p - a) / (b - a);
    return p <= c ? 1 : (d - p) / (d - c);
  },
  view(pad) { const v = R.viewTiles(); pad = pad || 0; return { x0: v.x0 - pad, y0: v.y0 - pad, x1: v.x1 + pad, y1: v.y1 + pad }; },
  viewPx(pad) { const v = this.view(pad), TL = CFG.TILE; return { x0: v.x0 * TL, y0: v.y0 * TL, x1: v.x1 * TL, y1: v.y1 * TL }; },
  inV(v, x, y) { return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1; },
  /* a ring rolling out at radius `rad` (squash < 1 lays it on the ground).
     `col` a TONE ('gold', 'pale', 'bronze') is LIGHT: a smooth band of the
     card's light at the device's own resolution (R.fxRing — its hue tied to
     its light, so it is gold and never lime); any other colour (the land's
     green) is a fine antialiased line in that colour. `px` sets its weight
     (the old dot's size: 2 in the world, a few device px in the sky);
     `vp` and `spin` are kept for their callers and no longer needed — a
     path costs the same on screen or off. */
  ring(g, cx, cy, rad, col, a, px, squash, vp, spin) {
    if (!(a > 0.01) || rad < 1) return;
    px = px || 2; squash = squash || 1;
    if (R.isTone(col)) { R.fxRing(g, cx, cy, rad, Math.min(1, a), col, { squash, w: px * 0.7 }); return; }
    g.save();
    g.globalAlpha = Math.min(1, a); g.strokeStyle = col; g.lineWidth = px * 0.55;
    g.beginPath(); g.ellipse(cx, cy, rad, rad * squash, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  },
  /* a grain of light rising (the motes' language): a soft bead at the
     device's own resolution, its cream heart over a halo of its own hue
     (R.fxDot) — gold ADDED over the meadow was lime, a 2px gold square at
     half alpha olive. `dark` (the old grain's underside) is no longer
     needed: a bead of light reads on grass by its own glow. */
  mote(g, x, y, col, dark, a) {
    if (!(a > 0.01)) return;
    R.fxDot(g, x, y, 1.25, Math.min(1, a), col);
  },
  // a four-point glint — something catching the light: hair-thin tapering arms at the device's own resolution (R.fxSpark)
  glint(g, x, y, col, a, px, tone) {
    if (!(a > 0.01)) return;
    px = px || 2;
    R.fxSpark(g, x, y, Math.max(2.5, 1.8 * px / R.fxPx(g)), Math.min(1, a), tone || col);
  },
  /* a word in the world (a card's '×2'): cream on a dark rim stroked round
     its own letters at the device's own resolution (eight copies a world
     pixel apart were a three-pixel smear at a phone's zoom), fading smoothly
     — the float's legibility over any ground */
  tag(g, x, y, txt, a, col) {
    a = Math.max(0, Math.min(1, a));
    if (a <= 0.01) return;
    g.save();
    g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = a;
    g.lineJoin = 'round'; g.miterLimit = 2; g.lineWidth = Math.max(1.4, 2.6 * R.fxPx(g)); g.strokeStyle = '#0d0b08';
    g.strokeText(txt, x, y);
    g.fillStyle = col || '#f2e6cd';
    g.fillText(txt, x, y);
    g.restore();
  },
  // the town's drawing helpers (js/deckfx-town.js), guarded on the method asked
  tx(m) { const T = window.Deck && Deck._townTX; return T && (!m || typeof T[m] === 'function') ? T : null; },
  /* a column of light standing on (x, foot): the card's light as a smooth
     beam at the device's own resolution (R.fxBeam — soft across its width,
     a white-hot thread up its heart, its hue tied to its light so whatever
     stands in it turns gold, never lime), its top faded. `tone`: 'gold'
     (the default), 'bronze' (the amber of a dawn), 'pale' (marble). */
  column(g, x, foot, top, w, a, tone) {
    if (!(a > 0.01) || foot - top < 2 || w < 1) return;
    R.fxBeam(g, x, foot, top, w, Math.min(1, a), tone || 'gold', { core: 1.3, fade: 0.18 });
  },
  /* a building's own silhouette flashed in the card's light (R.glow over its
     tinted picture): the building turns gold in its own light and shade and
     brightens toward cream as the flash strengthens — added, it went lime.
     Its strength runs smoothly (R.glow reads between its rows): a flash in
     hard fifths was a stepped fade. */
  flashBld(g, b, a, tone) {
    a = Math.max(0, Math.min(1, a));
    if (a <= 0.01 || !b) return;
    const spr = R.bldSprite(b);
    if (!spr || !(spr.width > 0)) return;
    const TL = CFG.TILE, sz = Bld.size(b);
    R.glow(g, a, c => R.blitBld(g, R.tintOf(spr, c), b.x * TL, b.y * TL, sz * TL, sz * TL), tone || 'gold');
  },
  // where a building's art stands, in world px — its roof is the top of the box
  artBox(b) {
    const spr = R.bldSprite(b), TL = CFG.TILE, sz = Bld.size(b), x = b.x * TL, y = b.y * TL, w = sz * TL;
    return spr && spr._cfArt ? R.artRect(spr, x, y, w, w) : { x, y, w, h: w };
  },
  // a world point (tiles) on the canvas, in device px — for the sky layer
  toScreen(wx, wy) {
    const TL = CFG.TILE, z = R.cam.z * (R.dpr || 1);
    return { x: (wx * TL - R.cam.x) * z, y: (wy * TL - R.cam.y) * z };
  },
  /* (THE SKY BANDS ARE GONE: flat bands of light down the top of the screen
     were gold ADDED over the meadow — the acid yellow-green of the first
     cut — and a day seen from above has no sky to light, only grass, over
     which a warm grade reads olive and a warm paint sand. The sun or the
     burst at the top of the world, its rays of dots and its glitter carry
     the light there now.) */
  /* rays of light fanning down from (ox, oy), device px — SMOOTH now (the
     operator's ruling on the effects, 2026-10-27: "the rays are pixelated…
     higher pixel count"): slender wedges of the card's light at the
     device's own resolution (R.fxRays), white-hot at the source and gone at
     the tip, their hue tied to their light so the meadow under a ray turns
     gold and never lime; n of them across spread × (n − 1) radians about
     straight down, reaching `reach` (0.3) of the screen past `from` (a
     fraction of the screen's height: the edge of the sun or the burst they
     break from) — the light belongs to what shines it. (They were short
     stepped dashes of ink a cell wide; before that, wedges laid as the
     card's stepped light read as orange road lines on the meadow.) */
  rays(g, ox, oy, n, spread, tone, a, t, from, reach) {
    const H = R.cv.height, dpr = R.dpr || 1, r0 = H * (from == null ? 0.05 : from);
    R.fxRays(g, ox, oy, { n, r0, r1: r0 + H * (reach || 0.3), a: Math.min(1, a), tone, dir: Math.PI / 2, spread: spread * (n - 1),
      w0: 1.1 * dpr, w1: Math.max(2.5 * dpr, H * 0.007), t, seed: 3 });
  },
  // stars of light twinkling across the upper sky (device px): hair-thin four-point glints (R.fxSpark)
  glitter(g, n, tone, a, t) {
    const W = R.cv.width, H = R.cv.height;
    for (let i = 0; i < n; i++) {
      const tw = (Math.sin(t * (2 + this.hash(i, 5) * 3) + i * 2.3) + 1) / 2;
      if (tw < 0.55) continue;
      R.fxSpark(g, this.hash(i, 1) * W, this.hash(i, 2) * H * 0.62, 3 + 4 * this.hash(i, 3), Math.min(1, a * (tw - 0.45) * 1.8), tone, { diag: i % 3 === 0 });
    }
  },
  sfx(kind) { if (typeof Sound !== 'undefined' && Sound.play) Sound.play(kind); },
  show(id, data) { return window.R && R.startCardShow ? R.startCardShow(id, data) : null; },
  // a card's own show still playing (its p, for a live look that grows in with it)
  liveP(id) {
    if (!window.R || !R.cardShows) return -1;
    for (const s of R.cardShows) if (s.id === id) return s.t / (s.ms / 1000);
    return -1;
  },
  // what is left of a timer, as a fade over its last half day
  tail(e) { const left = e.until - Deck.now(); return left < 0.5 ? Math.max(0, left / 0.5) : 1; },
  // the middle of the screen, in tiles
  mid() { const v = R.viewTiles(); return { x: (v.x0 + v.x1) / 2, y: (v.y0 + v.y1) / 2 }; },
  // brings a world point on screen if it is off it (the play sequence does
  // this for where a card lands; the Foundation laid by the ground breaking
  // does it for the works)
  look(x, y) { if (window.R && R.onScreen && !R.onScreen(x, y)) R.centerOn(x, y); },
  // the player's Wonder works, if a site stands: where the two Wonder cards land
  wonderSite() {
    const w = Deck.wonderOf('P');
    return w && w.construction > 0 ? { x: Bld.cx(w), y: Bld.cy(w) } : null;
  },
  /* NOTHING IS DRAWN IN THE BLACK (CLAUDE.md, R.boardPx): the off-map rim is
     void, and light ADDED over black shows as a brown smear — the sky's bands
     and its glitter are exactly the eclipse's stars-in-the-black fault. Every
     growth show and look is drawn clipped to the board: in world space as
     R.clipBoard does it, in the sky (device px) through the camera. */
  clipped(g, layer, fn) {
    const b = window.R && R.boardPx ? R.boardPx() : null;
    if (!b) return fn();
    g.save();
    g.beginPath();
    if (layer === 'sky') {
      const z = R.cam.z * (R.dpr || 1);
      g.rect((b.x0 - R.cam.x) * z, (b.y0 - R.cam.y) * z, (b.x1 - b.x0) * z, (b.y1 - b.y0) * z);
    } else g.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    g.clip();
    try { return fn(); } finally { g.restore(); }
  },
  /* THE WORKS IN THE MIDDLE OF THE VIEW (the Wonder cards' landing): a
     point outside the middle of the open view — between the toasts under
     the top bar and the build bar — is brought to its middle before the
     card flies, so the act never plays at the screen's edge under a toast.
     Asked as the play is armed (fx.dest → DeckUI._dest), never during it. */
  frame(x, y) {
    if (!window.R || !R.cam || !R.viewW) return;
    const z = R.cam.z, TL = CFG.TILE, sx = (x * TL - R.cam.x) * z, sy = (y * TL - R.cam.y) * z;
    const top = (R.topReserve || 0) + 80, bot = R.viewH() - (R.bottomReserve || 0) - 30;
    if (sx < R.viewW() * 0.2 || sx > R.viewW() * 0.8 || sy < top + (bot - top) * 0.22 || sy > top + (bot - top) * 0.78) R.centerOn(x, y);
  },
  /* A CARD'S OWN CAPTION (device px, the sky layer): what the card DID,
     said on the screen while it happens — on a dark plaque in a gold rim,
     low in the open view above the build bar, its title in the menu's carved
     face in gold over a dark edge, its rows at 13 css px or more. `rows` is
     a list of rows of runs {t, col, strike}: `strike` (0..1) draws a line
     through a run from the left, for a price struck out. The plaque comes
     in and each row arrives in turn — eased, never stepped — and all of it
     is drawn at the DEVICE's own resolution (the operator's ruling of
     2026-10-27 on the chrome: a rounded plaque with a smooth bevelled rim and
     its letters stroked round, where the first cut's rim was notched in hard
     2px cells and its title's edge four copies a cell apart). */
  INK: '#1a0f06',
  plaque(g, s, title, rows, p, from, to) {
    if (p < from || p > to) return;
    const dpr = R.dpr || 1, W = R.cv.width, css = v => v * dpr;
    if (s._botPx == null) {
      const bb = document.getElementById('bottombar'), r = bb && bb.getBoundingClientRect();
      s._botPx = (r && r.height > 0 && r.top > 0 ? r.top : innerHeight - 120) * dpr;
    }
    const span = Math.max(0.01, to - from), k = (p - from) / span;
    const enter = this.ease(Math.min(1, k * 14)), leave = k > 0.94 ? Math.max(0, (1 - k) / 0.06) : 1;
    const fs = css(13), ts = css(16), lh = fs * 1.5, pad = css(10), gap = fs * 0.45;
    const face = n => '700 ' + n.toFixed(2) + 'px Cinzel, Georgia, serif';
    g.save();
    g.textBaseline = 'alphabetic';
    g.font = face(fs);
    const rw = rows.map(r => r.reduce((a, run) => a + g.measureText(run.t).width, 0) + (r.length - 1) * gap);
    g.font = face(ts);
    const w = Math.min(W - css(32), Math.max(g.measureText(title).width, ...rw) + pad * 2.4);
    const h = pad * 2 + ts + rows.length * lh, x0 = (W - w) / 2, y0 = s._botPx - css(18) - h + (1 - enter) * css(10);
    g.globalAlpha = enter * leave;
    // the plaque: a soft shadow under it, a gold rim bevelled light to dark,
    // a fine bright line inside the rim, the dark within
    const rr = css(6), box = (x, y, ww, hh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, ww, hh, r); else g.rect(x, y, ww, hh); };
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = css(10); g.shadowOffsetY = css(3);
    const rim = g.createLinearGradient(0, y0, 0, y0 + h);
    rim.addColorStop(0, '#f6c766'); rim.addColorStop(0.45, '#c9822a'); rim.addColorStop(1, '#8a5418');
    g.fillStyle = rim; box(x0, y0, w, h, rr); g.fill();
    g.restore();
    const b = css(2);
    const inner = g.createLinearGradient(0, y0, 0, y0 + h);
    inner.addColorStop(0, '#231a10'); inner.addColorStop(1, '#130d07');
    g.fillStyle = inner; box(x0 + b, y0 + b, w - 2 * b, h - 2 * b, rr - b * 0.6); g.fill();
    g.strokeStyle = 'rgba(255,214,140,0.28)'; g.lineWidth = Math.max(1, css(0.8));
    box(x0 + b * 1.9, y0 + b * 1.9, w - b * 3.8, h - b * 3.8, Math.max(1, rr - b * 1.5)); g.stroke();
    // the title: gold, lit along its top, over a dark edge stroked round its letters
    const ty = y0 + pad + ts * 0.85;
    g.textAlign = 'center';
    g.font = face(ts);
    g.lineJoin = 'round'; g.miterLimit = 2; g.lineWidth = css(3); g.strokeStyle = this.INK;
    g.strokeText(title, W / 2, ty);
    const tg = g.createLinearGradient(0, ty - ts * 0.8, 0, ty);
    tg.addColorStop(0, '#ffe9a8'); tg.addColorStop(0.55, '#ffd45e'); tg.addColorStop(1, '#e8a83a');
    g.fillStyle = tg; g.fillText(title, W / 2, ty);
    // the rows, each arriving in its turn
    g.font = face(fs); g.textAlign = 'left';
    for (let i = 0; i < rows.length; i++) {
      const ra = Math.max(0, Math.min(1, k * 12 - i - 0.5));
      if (ra <= 0) continue;
      let x = W / 2 - rw[i] / 2;
      const y = ty + (i + 1) * lh + (1 - this.ease(ra)) * css(4);
      g.globalAlpha = enter * leave * ra;
      for (const run of rows[i]) {
        const tw = g.measureText(run.t).width;
        if (run.t) { g.fillStyle = run.col || '#efe4c8'; g.fillText(run.t, x, y); }
        if (run.strike > 0) { g.fillStyle = '#d0503a'; g.fillRect(x - css(2), y - fs * 0.38, (tw + css(4)) * Math.min(1, run.strike), Math.max(1, css(1.6))); }
        x += tw + gap;
      }
    }
    g.restore();
  },
};

/* ---------------- the engine pieces the growth cards add ---------------- */
Object.assign(Deck, {
  /* THE BUILD RATE: how many days of work one builder's day lays on this
     works now — 1 with no card running. Every live card's 'build' (a
     different card multiplies: Quick Hands × the Golden Age is 3) and, on
     the player's Wonder, the Age of Marble's double speed, which is the
     rest of the run's and so rides S.deck.charges rather than a timer.
     Asked by the build task (construction and upgrades — never repair), the
     hall's wall works and a span's reinforcing, and by every panel line that
     says how many days are left (Units.buildRate). */
  buildRate(b) {
    if (!b || typeof S === 'undefined' || !S || !S.deck) return 1;
    let r = this.mult('build', b.owner, b);
    if (b.key === 'wonder' && b.owner === 'P' && S.deck.charges && S.deck.charges.marble)
      r *= this.FX.age_of_marble.RATE;
    return r;
  },
  /* THE FESTIVAL'S WORD ON A WORK FLOAT (R.workFloat asks, guarded on this
     method): a hand's next '+wood' after a festival is played reads
     '+wood ×1.4' — '' for anyone else, and always with no festival running */
  floatTag(u) {
    const f = this.FX.harvest_festival;
    return f && f.floatTag ? f.floatTag(u) : '';
  },
  // the player's Wonder under the Age of Marble (Bld.effCost — the one cost point)
  wonderCost(cost) {
    if (!S || !S.deck || !S.deck.charges || !S.deck.charges.marble || !cost) return cost;
    const k = 1 - this.FX.age_of_marble.CUT, out = {};
    for (const r in cost) out[r] = Math.round(cost[r] * k);
    return out;
  },
  // the Wonder's ground is broken (Bld.place): a Foundation waiting for it is laid
  onWonderLaid(b) {
    const ch = S.deck && S.deck.charges;
    if (!ch || !ch.foundation || !b || b.owner !== 'P') return;
    const F = this.FX.wonders_foundation;
    if (!(b.construction > F.floor())) return;   // nothing to lay on (an instant site); the charge waits
    delete ch.foundation;
    F.lay(b, true);
  },
  wonderOf(owner) { return S.buildings.find(b => b.owner === owner && b.key === 'wonder') || null; },
});

/* ---------------- THE CARDS ---------------- */
Object.assign(Deck.FX, {
  /* BRONZE — Harvest Festival: everything the player's people gather or
     produce comes in 40% richer for the card's 12 days (Deck.card().days —
     the catalog's number, never a second copy of it). Hand gathering, both
     kinds of fishing, the meat of a hunt — a YIELD on the credit, the
     ground stripped at its own pace (rule 1) — and every station and the
     hall's own gold, with the panel's work line; the rival's work never.

     A FESTIVAL THE TOWN CAN SEE (the playtest's critics: "a few dotted rings
     and grain specks", then nothing on the map but the chip). The play
     brings the hall on screen (showAtHall), its hearth FLARES and the
     bunting strings out from it to the nearest houses — in the tribe's own
     dye, the banner cloth's (Sprites.tunicCol) — and stays up for the twelve
     days, the fire flaring now and then; every hand's NEXT work float after
     a play carries the bonus ('+wood ×1.4', R.workFloat → Deck.floatTag).
     All of it render state: the bunting is read off the town each frame,
     never stored. */
  harvest_festival: {
    at: 'bar', cue: 'motes', showAtHall: true,
    mult: { gather: 1.4, produce: 1.4 },
    can() { return { ok: true }; },
    apply() {
      const days = Deck.card('harvest_festival').days, was = !!Deck.timed('harvest_festival');
      const e = Deck.addTimed('harvest_festival', days);
      Deck.say(was ? '🌾 The Harvest Festival runs on — ' + days + ' more days of richer work.'
        : '🌾 The Harvest Festival begins: everything your people gather or produce comes in 40% richer for ' + days + ' days.');
      GrowFX.show('harvest_festival', { spots: this.spots(), fresh: !was });
      GrowFX._festNoted = new WeakSet();   // every hand's next float carries the bonus
      GrowFX.sfx('festival');
      // the landing's toast: a second copy RUNS ON (the card's own rule line said "for 12 days" again)
      return { ok: true, until: e.until, msg: was ? 'The Harvest Festival runs on — ' + days + ' more days of work 40% richer.'
        : 'The Harvest Festival begins: for ' + days + ' days every load and every harvest comes in 40% richer.' };
    },
    end() { G.log('🌾 The Harvest Festival is over — the work comes in at its ordinary yield again.'); },
    // where the town's work is going on, on screen now: the hands at it and
    // the works that produce (plain numbers — a show never holds the world)
    spots() {
      const v = GrowFX.view(1), out = [];
      for (const u of S.units) {
        if (out.length >= 24) break;
        if (u.owner !== 'P' || !u.task || !R.MOTE_TASKS[u.task.type] || !GrowFX.inV(v, u.x, u.y)) continue;
        out.push({ x: u.x, y: u.y + 0.3, sz: 0.7 });
      }
      for (const b of S.buildings) {
        if (out.length >= 40) break;
        if (b.owner !== 'P' || !Bld.done(b) || !(Bld.lv(b) || {}).out || !GrowFX.inV(v, Bld.cx(b), Bld.cy(b))) continue;
        const sz = Bld.size(b);
        out.push({ x: Bld.cx(b), y: b.y + sz - 0.1, sz });
      }
      return out;
    },
    /* THE NEXT FLOAT CARRIES THE BONUS (R.workFloat asks): once per hand
       after a play, while the festival runs — the one float that says why
       this load came in richer. Render state (a WeakSet the play resets). */
    TAG: ' ×1.4',
    floatTag(u) {
      if (!u || u.owner !== 'P' || !Deck.timed('harvest_festival')) return '';
      const n = GrowFX._festNoted || (GrowFX._festNoted = new WeakSet());
      if (n.has(u)) return '';
      n.add(u);
      return this.TAG;
    },
    /* THE BUNTING: from the hall to the nearest finished buildings of the
       town (BUNT_N within BUNT_R tiles) — never a wall, a gate or a field,
       which have no eave to tie it to */
    BUNT_N: 3, BUNT_R: 8,
    NO_BUNT: { wall: 1, gate: 1, farm: 1, dock: 1, mine: 1, wonder: 1, tc: 1 },
    buntTo() {
      const tc = Bld.tcOf('P');
      if (!tc || !Bld.done(tc)) return { tc: null, list: [] };
      const hx = Bld.cx(tc), hy = Bld.cy(tc), list = [];
      for (const b of S.buildings) {
        if (b.owner !== 'P' || this.NO_BUNT[b.key] || !Bld.done(b)) continue;
        const d = Math.hypot(Bld.cx(b) - hx, Bld.cy(b) - hy);
        if (d <= this.BUNT_R) list.push({ b, d });
      }
      list.sort((a, c) => a.d - c.d || a.b.id - c.b.id);
      return { tc, list: list.slice(0, this.BUNT_N).map(o => o.b) };
    },
    // where a string is tied: under the eave on the side facing the other end
    eave(b, toward) {
      const TL = CFG.TILE, sz = Bld.size(b), bx = b.x * TL, by = b.y * TL, bw = sz * TL;
      const spr = R.wornSprite ? R.wornSprite(b) : R.bldSprite(b);
      const rc = spr && spr._cfArt ? R.artRect(spr, bx, by, bw, bw) : { x: bx, y: by, w: bw, h: bw };
      const box = spr && R._artBox ? R._artBox(spr) : { l: 0.1, r: 0.9, t: 0.1, b: 0.94 };
      const x0 = rc.x + box.l * rc.w, x1 = rc.x + box.r * rc.w, top = rc.y + box.t * rc.h, bot = rc.y + box.b * rc.h;
      const cx = (x0 + x1) / 2, sx = Math.sign(toward - cx) || 1;
      return { x: Math.round(cx + sx * (x1 - x0) * 0.3), y: Math.round(top + (bot - top) * 0.3) };
    },
    // one string: a sagging cord, its pennants hung every 7 px in the dye, cream and the dye's shade
    string(g, a, b, k, seed, now, dye) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 6 || k <= 0) return;
      const sag = Math.min(14, 4 + L * 0.12), n = Math.ceil(L), upto = Math.floor(n * Math.min(1, k));
      const at = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + sag * 4 * t * (1 - t) });
      g.fillStyle = '#4a3420';
      for (let i = 0; i <= upto; i++) { const q = at(i / n); g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
      const COL = [dye.body, '#f2e6cd', dye.accent];
      for (let j = 1, i = 5; i < upto - 3; i += 9, j++) {
        const q = at(i / n), fl = Math.sin(now * 5 + j * 1.3 + seed) > 0.35 ? 1 : 0;   // a flutter of one pixel, in steps
        const x = Math.round(q.x), y = Math.round(q.y) + 1;
        g.fillStyle = COL[j % 3];
        g.fillRect(x - 3, y, 7, 2); g.fillRect(x - 2 + fl, y + 2, 5, 1); g.fillRect(x - 1 + fl, y + 3, 3, 1); g.fillRect(x + fl, y + 4, 1, 1);
        g.fillStyle = '#2a1e12'; g.fillRect(x - 3, y, 1, 2);   // the fold where it hangs on the cord
      }
    },
    // the hall's hearth (the dooryard fire at L1, the roof's hearth above it): a flare of hard-pixel fire
    hearth(tc) {
      const TL = CFG.TILE, sz = Bld.size(tc), bx = tc.x * TL, by = tc.y * TL, bw = sz * TL;
      const a = R.smokeAnchor(R.CAMPFIRE_AT || {}, 'tc', tc.level) || R.smokeAnchor(R.SMOKE_AT, 'tc', tc.level);
      return a ? { x: bx + a.x * bw, y: by + a.y * bw } : { x: bx + bw / 2, y: by + bw * 0.9 };
    },
    // (the fire is the burning town's own strip; its embers rise off it as
    // small soft beads of the fire's colour, cooling as they climb — at the
    // device's own resolution, never 2px cells on the art's grain)
    flare(g, h, s, beat, embers, now) {
      const TX = Deck._townTX;
      if (TX && TX.flame) TX.flame(g, h.x, h.y, s, beat);
      const F = ['#a33f1c', '#e88a3a', '#f2c14a', '#ffe9a0'];
      for (let i = 0; i < embers; i++) {
        const ph = (now * 0.9 + i / embers) % 1;
        R.fxDot(g, h.x + Math.sin(ph * 7 + i * 2.3) * 4, h.y - s * 0.8 - ph * s * 1.6, 1.1 * (1 - 0.4 * ph), (1 - ph) * Math.min(1, ph / 0.08), F[ph < 0.3 ? 3 : 2]);
      }
    },
    drawLive(g, e) {
      const TL = CFG.TILE, now = performance.now() / 1000, v = GrowFX.viewPx(2);
      const { tc, list } = this.buntTo();
      if (!tc) return;
      const p = GrowFX.liveP('harvest_festival'), fade = GrowFX.tail(e);
      const dye = (Sprites.tunicCol || {})[G.tunicOf('P')] || { body: '#3f6d99', accent: '#2c4e70' };
      const hx = Bld.cx(tc) * TL;
      list.forEach((b, j) => {
        const a = this.eave(tc, Bld.cx(b) * TL), c = this.eave(b, hx);
        if (Math.max(a.x, c.x) < v.x0 || Math.min(a.x, c.x) > v.x1 || Math.max(a.y, c.y) + 20 < v.y0 || Math.min(a.y, c.y) > v.y1) return;
        // strung out from the hall on a fresh play, one string after another
        const k = p >= 0 ? Math.max(0, Math.min(1, (p - 0.12 - j * 0.1) / 0.3)) : 1;
        if (fade < 1 && GrowFX.step(fade) <= 0) return;
        this.string(g, a, c, k, b.id, now, dye);
      });
      // the hearth flares on the play, and now and then for the twelve days
      const h = this.hearth(tc);
      if (h.x < v.x0 || h.x > v.x1 || h.y < v.y0 || h.y > v.y1 + TL) return;
      const beat = (now * 7.7) | 0;
      if (p >= 0 && p < 1) {
        const k = p < 0.12 ? p / 0.12 : p < 0.6 ? 1 : (1 - p) / 0.4;
        if (k > 0.05) this.flare(g, h, TL * (0.25 + 0.3 * GrowFX.step(k)), beat, 5, now);
      } else {
        const ph = (now / 4.5 + tc.id * 0.31) % 1;
        if (ph < 0.16) this.flare(g, h, TL * (ph < 0.04 || ph > 0.12 ? 0.22 : 0.32), beat, 2, now);
      }
    },
    /* the harvest bursts: from every hand at work and every working field in
       view, a fountain of golden grain thrown up and falling back, inside a
       warm ring of dots on the ground (Bronze: warm, a moment, not a storm) */
    show: {
      ms: 2000, layer: 'world',
      draw(g, s, p) {
        const TL = CFG.TILE, F = GrowFX, vp = F.viewPx(1);
        for (let i = 0; i < s.spots.length; i++) {
          const sp = s.spots[i], d0 = (i % 9) * 0.035, q = (p - d0) / (1 - d0);
          if (q <= 0 || q >= 1) continue;
          const cx = sp.x * TL, foot = sp.y * TL;
          if (cx < vp.x0 || cx > vp.x1 || foot < vp.y0 || foot > vp.y1 + TL) continue;
          F.ring(g, cx, foot, TL * (0.25 + sp.sz * 0.8 * F.ease(q / 0.7)), 'bronze', (1 - q) * 0.9, 2, 0.5);
          for (let k = 0; k < 10; k++) {
            const h1 = F.hash(i * 31 + k, 7), h2 = F.hash(k, i * 13 + 3);
            const a = -Math.PI / 2 + (h1 - 0.5) * 1.6, v = TL * (2.2 + h2 * 1.4), t = q * 1.15;
            const x = cx + Math.cos(a) * v * t, y = foot - TL * 0.4 * sp.sz + Math.sin(a) * v * t + 0.5 * TL * 5.2 * t * t;
            F.mote(g, x, y, k % 3 ? '#ffcc40' : '#fff1b8', '#7a4a0a', q < 0.7 ? 1 : (1 - q) / 0.3);
          }
          if (q > 0.08 && q < 0.4) F.glint(g, cx, foot - TL * (0.5 + sp.sz * 0.5), '#fff8d6', 1 - Math.abs(q - 0.24) / 0.16);
        }
        // the hearth's flare throws a fountain of sparks up over the hall
        const tc = Bld.tcOf('P');
        if (tc && Bld.done(tc) && p < 0.7) {
          const h = this.hearth(tc), q = p / 0.7;
          for (let k = 0; k < 14; k++) {
            const h1 = F.hash(k, 91), h2 = F.hash(k * 7, 92);
            const a = -Math.PI / 2 + (h1 - 0.5) * 1.3, v = TL * (2.6 + h2 * 1.6);
            F.mote(g, h.x + Math.cos(a) * v * q, h.y - TL * 0.3 + Math.sin(a) * v * q + 0.5 * TL * 4 * q * q,
              k % 3 ? '#f2c14a' : '#ffe9a0', '#7a2a0a', q < 0.6 ? 1 : (1 - q) / 0.4);
          }
        }
      },
    },
  },

  /* BRONZE — Bountiful Land: within 8 tiles of the player's Town Center —
     measured from the hall's middle — everything gathered or produced comes
     in 50% richer for 20 days. "Where" is where the work is done: a
     gatherer's (or a boat's) own feet, the spot a beast fell, a station's
     middle; the hall itself (its gold) is at the heart of it. The hall is
     read live, so the ring is always the one round the fire. The player's
     work only — a rival hand gathering inside the ring is not paid. */
  bountiful_land: {
    at: 'tc', R: 8, RICH: 1.5,
    centre() { const tc = Bld.tcOf('P'); return tc ? { x: Bld.cx(tc), y: Bld.cy(tc) } : null; },
    inRing(ctx) {
      const c = ctx && this.centre();
      if (!c) return false;
      const x = ctx.key ? Bld.cx(ctx) : ctx.x, y = ctx.key ? Bld.cy(ctx) : ctx.y;
      return Math.hypot(x - c.x, y - c.y) <= this.R;
    },
    mult: {
      gather(owner, ctx) { return owner === 'P' && this.inRing(ctx) ? this.RICH : 1; },
      produce(owner, ctx) { return owner === 'P' && this.inRing(ctx) ? this.RICH : 1; },
    },
    can() { return Bld.tcOf('P') ? { ok: true } : { ok: false, why: 'Your Town Center must stand.' }; },
    apply() {
      const ok = this.can();
      if (!ok.ok) return ok;
      const days = Deck.card('bountiful_land').days, was = !!Deck.timed('bountiful_land');
      const e = Deck.addTimed('bountiful_land', days), c = this.centre();
      Deck.say(was ? '🌱 The land near the fire stays bountiful — ' + days + ' more days.'
        : '🌱 The land within ' + this.R + ' tiles of your Town Center turns bountiful: everything gathered or produced there comes in 50% richer for ' + days + ' days.');
      GrowFX.show('bountiful_land', { x: c.x, y: c.y });
      if (window.R && R.startle) R.startle(c.x, c.y, 9);
      GrowFX.sfx('bloom');
      return { ok: true, x: c.x, y: c.y, until: e.until, msg: was ? 'The land near the fire stays bountiful — ' + days + ' more days.'
        : 'The land within ' + this.R + ' tiles of your hall turns bountiful: 50% richer for ' + days + ' days.' };
    },
    end() { G.log('🌱 The bounty near the fire fades — the land gives its ordinary yield again.'); },
    /* WHAT THE LAND WEARS — AN ORBIT, AND NOTHING GROWS (operator ruling, on
       their phone with the card running: "I don't love all the dancing
       grass. I like the gold circle and the effect, but the dancing grass is
       distracting. Can we get rid of that?" — and of the gold ring's dots:
       "a little pixelated and low quality… a small glittering gold orb that
       travels along that circle with a trail behind it… a subtle reminder,
       but not super obvious"). The first cut held hundreds of upright tufts
       and white '+' crosses over the whole ring for twenty days; the second
       grew them only through the play and left a dozen clover clumps at the
       heart, its edge shown only while the hall was selected. Now NO GRASS,
       sprout, tuft, flower or sparkle is drawn over the zone, at the play or
       after it: the play sweeps one fine gold ring out from the fire to the
       edge, and the ring unwinds into the ORB (R.drawOrbit) — one bead of
       gold going round the eight tiles for all twenty days, its thread gone
       by three quarters of the way round, drawn at device resolution. Drawn
       in the GROUND pass (R.drawCardGround) — under the town, its people and
       the fog, which dims it on remembered ground and hides it where the
       ring runs through ground the player has never seen. */
    PHASE: 0.37,       // this circle's place on the orbit's lap (its own, never another card's)
    OPEN_AT: 0.6,      // the share of the play the ring takes to sweep out to the edge
    show: {
      ms: 2600, layer: 'ground',
      draw(g, s, p) {
        if (!(p >= 0 && p < 1)) return;
        const t = performance.now() / 1000, A = this.OPEN_AT;
        // the ring sweeps out from the fire, whole and even, then unwinds into the orb
        R.drawOrbit(g, s.x, s.y, this.R, t, {
          phase: this.PHASE, grow: GrowFX.ease(p / A), open: p < A ? 0 : GrowFX.ease((p - A) / (1 - A)) });
      },
    },
    // the twenty days: the orb on its lap (the play draws it while it runs)
    drawGround(g, e) {
      const c = this.centre(), p = GrowFX.liveP('bountiful_land');
      if (!c || (p >= 0 && p < 1)) return;
      R.drawOrbit(g, c.x, c.y, this.R, performance.now() / 1000, { phase: this.PHASE, fade: GrowFX.tail(e) });
    },
  },

  /* IMPERIAL — Golden Age: for 20 days everything the player's people
     gather or produce comes in 50% richer (rule 1, as the festival) and
     everything they build rises 50% faster — construction AND upgrades,
     the masons' walls, a span raised and reinforced (rule 3), the Wonder's
     works among them; never repair. Two cards multiply (rule 2). */
  golden_age: {
    at: 'tc', cue: 'motes', REACH: 16,
    mult: { gather: 1.5, produce: 1.5, build: 1.5 },
    can() { return { ok: true }; },
    apply() {
      const days = Deck.card('golden_age').days, was = !!Deck.timed('golden_age');
      const e = Deck.addTimed('golden_age', days);
      const tc = Bld.tcOf('P'), c = tc ? { x: Bld.cx(tc), y: Bld.cy(tc) } : GrowFX.mid();
      Deck.say(was ? '☀️ The Golden Age goes on — ' + days + ' more days.'
        : '☀️ A Golden Age dawns: for ' + days + ' days everything your people gather or produce comes in 50% richer, and everything they build rises 50% faster.');
      // the light runs as far as the town does (its farthest building within REACH), so
      // the wave is still crossing the houses while the player is looking at them
      let far = 0;
      for (const b of S.buildings) if (b.owner === 'P') {
        const d = Math.hypot(Bld.cx(b) - c.x, Bld.cy(b) - c.y);
        if (d <= this.REACH) far = Math.max(far, d);
      }
      GrowFX.show('golden_age', { x: c.x, y: c.y, reach: Math.max(6, far + 2) });
      // (no whole-frame flash: a fill of gold over the meadow, however brief,
      // is a yellow-green or a sepia frame — the dawn's light is the sun's)
      GrowFX.sfx('goldenage');
      return { ok: true, x: c.x, y: c.y, until: e.until };
    },
    end() { G.log('☀️ The Golden Age passes — work and building go at their ordinary pace again.'); },
    /* A GOLDEN DAWN OVER THE TOWN (Imperial: big). A sun rises into the top
       of the world — a white-hot disc in a great soft glow, a fine corona,
       rays fanning out of it and turning slowly, stars of light glittering
       across the sky — held, then shrinking away. A pillar of light stands
       up out of the hall to meet it and the ground gives a small shake. Then
       three rings of light roll out from the hall across the town, and every
       building the light reaches catches it — its own silhouette flashing
       gold, beads of light lifting off the roof, a ring at its foot — and
       KEEPS a gold sheen until the dawn passes, so the town visibly stands
       bathed in it. ALL OF IT AT THE DEVICE'S OWN RESOLUTION (the operator's
       ruling, on this very sun: "looks pixelated… higher pixel count"):
       smooth light from the shared helpers, never discs and dots on the 2px
       grain; the buildings' own art stays pixel art. */
    show: {
      ms: 4600, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX;
        if (layer === 'sky') {
          const W = R.cv.width, H = R.cv.height, dpr = R.dpr || 1;
          // (the breath of warm light over the whole world is the play's gold
          // flash, R.flashAt's amber grade: a fill of orange over the meadow
          // was lime, and any wash over it reads olive)
          const e = F.env(p, 0, 0.14, 0.7, 1);
          if (e <= 0) return;
          // the sun, rising over the hall into the top of the world — below the
          // top bar, which is measured once (R.topReserve is learned lazily
          // and reads 0 early in a session: the marvel caption's lesson)
          if (s.topPx == null) { const tb = document.getElementById('topbar'); s.topPx = tb ? Math.max(0, tb.getBoundingClientRect().bottom) * dpr : 0; }
          const sc = F.toScreen(s.x, s.y), ox = Math.max(W * 0.15, Math.min(W * 0.85, sc.x));
          const oy = s.topPx - H * 0.1 + H * 0.17 * F.ease(p / 0.3);
          /* THE SUN IS DRAWN AT THE DEVICE'S OWN RESOLUTION (the operator,
             on this very sun: "This one for example looks pixelated…
             higher pixel count"): a great soft glow of gold round a white-
             hot disc and a fine corona, rays fanning out of it and stars of
             light glittering across the sky — every one of them smooth
             light (R.fxGlow / fxRays / fxRing / fxSpark), its hue tied to
             its light, so the meadow under the sun turns gold and never
             lime. It keeps its strength and SHRINKS as it goes (a disc faded
             through its light's faint steps passed through olive and mud
             brown); its rays turn slowly with it. */
          const se = 0.25 + 0.75 * F.ease(e), R0 = H * 0.085 * se;
          R.fxGlow(g, ox, oy, H * 0.2 * se, 0.62, 'gold', { soft: 1.35 });
          R.fxRays(g, ox, oy, { n: 26, r0: R0 * 0.7, r1: H * 0.44 * se, a: 0.9 * e, tone: 'gold', spread: Math.PI * 2, dir: s.t * 0.05,
            w0: 1.0 * dpr, w1: Math.max(2 * dpr, H * 0.0055), t: s.t, seed: 11, vary: 0.45, fall: 1.1 });
          R.fxGlow(g, ox, oy, R0 * 1.6, 1, 'gold', { soft: 1.25, core: 0.42 });
          R.fxRing(g, ox, oy, R0 * 1.05, 0.55 * e, 'gold', { css: 1.4 });
          F.glitter(g, 44, 'gold', e, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, cy = s.y * TL, vp = F.viewPx(2), v = F.view(2), reach = s.reach || this.REACH;
        if (p >= 0.05 && !s.boom) { s.boom = 1; if (R.shakeAt) R.shakeAt(3, 0.6); }
        const run = this.run;
        // the gold pillar out of the hall, up to the top of the world
        const pl = F.env(p, 0, 0.06, 0.36, 0.56);
        if (pl > 0) {
          const topY = R.cam.y - 60 / R.cam.z, h = (cy - topY) * F.ease(p / 0.08);
          F.column(g, cx, cy, cy - h, TL * (1.5 + Math.sin(s.t * 8) * 0.1) * pl, pl);
          // it lands in a ring of dots, never a pool (a warm patch reads as sand)
          F.ring(g, cx, cy + TL * 0.4, TL * 1.1, 'gold', 0.9 * pl, 2, 0.5);
        }
        for (let k = 0; k < 3; k++) {
          const q = (p - 0.08 - k * 0.07) / 0.7;
          if (q <= 0 || q >= 1) continue;
          F.ring(g, cx, cy, reach * TL * run(q), 'gold', (1 - q * 0.7) * (k ? 0.7 : 1), 2, 1, vp);
        }
        for (const b of S.buildings) {
          if (b.owner !== 'P' || !Bld.done(b)) continue;
          const bx = Bld.cx(b), by = Bld.cy(b);
          if (!F.inV(v, bx, by)) continue;
          const k = this.lightOn(s, p, b);
          if (k <= 0 || k >= 1.6) continue;
          const box = F.artBox(b), foot = (b.y + Bld.size(b)) * TL;
          F.ring(g, bx * TL, foot - 2, TL * (0.4 + Bld.size(b) * 0.6 * F.ease(k / 1.6)), 'gold', 1 - k / 1.6, 2, 0.5, vp);
          for (let m = 0; m < 8; m++) {
            const h = F.hash(b.id * 7 + m, 3);
            F.mote(g, box.x + box.w * (0.15 + h * 0.7), box.y + box.h * 0.25 - k * TL * (0.6 + h * 0.9),
              m % 2 ? '#ffd45e' : '#fff1b8', '#7a4a0a', 1 - k / 1.6);
          }
        }
      },
      /* each building CATCHES the light — its own silhouette flashing gold as
         the front reaches it, then the sheen it keeps until the dawn passes —
         laid on its own art in the building pass (R.drawCardBld), so the
         hands at work on a field stand in front of the glow, not inside it */
      drawBld(g, b, s, p) {
        if (b.owner !== 'P' || !Bld.done(b)) return;
        const k = this.lightOn(s, p, b);
        if (k <= 0) return;
        // (held under the strongest steps, which lay the ramp's colour source-over
        // and turned a lit building into a flat translucent ghost of itself)
        const held = GrowFX.env(p, 0.1, 0.2, 0.78, 1);
        GrowFX.flashBld(g, b, k < 1 ? 0.66 * (1 - k * 0.4) : Math.max(0.3 * held, k < 1.6 ? 0.4 * (1.6 - k) / 0.6 : 0));
      },
    },
    // the light keeps its pace across the town
    run(q) { return Math.pow(Math.max(0, Math.min(1, q)), 0.85); },
    // how far past a building the dawn's front has rolled, in its own beats (≤ 0: not yet)
    lightOn(s, p, b) {
      const front = (s.reach || this.REACH) * this.run((p - 0.08) / 0.7);
      return (front - Math.hypot(Bld.cx(b) - s.x, Bld.cy(b) - s.y)) / 1.8;
    },
    /* WHILE THE AGE LASTS — all twenty days — the town is seen to stand in
       it: every roof catches the sun in turn, a four-point glint opening off
       its crown and closing again, and beads of gold lift off it — each
       drawn at the device's own resolution (R.fxSpark / fxDot: hair-thin
       tapering arms, a soft bead with a cream heart over its own gold), never
       gold added over the grass. The first cut's two faint specks a roof
       left the aftermath with nothing but the 20d chip to say a Golden Age
       was on. (Every hand at work wears the motes too — cue 'motes', the
       festival's look.) */
    GLINT_S: 2.2,
    drawLive(g, e) {
      const TL = CFG.TILE, F = GrowFX, v = F.view(1), fade = F.tail(e), t = performance.now() / 1000;
      g.save();
      for (const b of S.buildings) {
        if (b.owner !== 'P' || !Bld.done(b) || b.key === 'wall' || b.key === 'gate') continue;
        if (!F.inV(v, Bld.cx(b), Bld.cy(b))) continue;
        const box = F.artBox(b), spr = R.bldSprite(b), ob = spr && R._artBox ? R._artBox(spr) : { l: 0.1, r: 0.9, t: 0.1, b: 0.94 };
        const top = box.y + ob.t * box.h, L = box.x + ob.l * box.w, Wd = (ob.r - ob.l) * box.w;
        // the motes: three beads a roof, lifting off it in turn
        for (let m = 0; m < 3; m++) {
          const ph = (t * 0.32 + F.hash(b.id, m)) % 1;
          if (ph > 0.7) continue;
          const k = ph / 0.7, a = (k < 0.2 ? 0.7 + k * 1.5 : 1 - (k - 0.2) / 0.8) * fade;
          F.mote(g, L + Wd * (0.2 + F.hash(m, b.id) * 0.6), top + box.h * 0.12 - k * TL * 1.1 + Math.sin(t * 2 + m * 2.1) * 2,
            m % 2 ? '#fff1b8' : '#ffd45e', null, a);
        }
        // the glint off its crown: once a turn, a few beats long — a gold
        // four-point star opening out to its height (the short diagonals at
        // its peak) and closing again, smoothly, with a white-hot heart
        const q = ((t / this.GLINT_S + F.hash(b.id, 17)) % 1) / 0.22;
        if (q < 1 && fade > 0.3) {
          const x = L + Wd * (0.3 + F.hash(b.id, 5) * 0.4), y = top + box.h * (0.04 + F.hash(5, b.id) * 0.12);
          const k = Math.sin(q * Math.PI);
          R.fxSpark(g, x, y, 3 + 6 * k, Math.min(1, 0.35 + k) * fade, 'gold', { diag: k > 0.55 });
        }
      }
      g.restore();
    },
  },

  /* STONE — Quick Hands: construction and upgrades go twice as fast for 6
     days (rule 3: sites, upgrades, the masons' wall works, a span raised
     and reinforced; never repair, never a sapper's earthworks). Still the
     builders' own work — a site with nobody at it rises no faster.

     ITS MOMENT IS AT THE WORKS, NEVER AT THE HALL (the playtest's critics:
     "two dotted white ellipses and a few specks" on the hall, then six days
     with nothing in the world showing it). The card lands on the works
     nearest the view (dest), and every works and every builder's hammer in
     sight throws hard-pixel gold sparks and a '×2'; with nothing being built
     anywhere, the '×2' bursts off the Build tab — the next works laid are the
     ones it quickens. While it runs, each works wears a small gold hammer and
     its builders throw a spark on every swing — on the strike frame of their
     own hammer, not a clock of the card's. */
  quick_hands: {
    at: 'tc',
    mult: { build: 2 },
    can() { return { ok: true }; },
    apply() {
      const days = Deck.card('quick_hands').days, was = !!Deck.timed('quick_hands');
      const e = Deck.addTimed('quick_hands', days);
      const msg = was ? '🔨 Quick Hands keeps up the pace — ' + days + ' more days.'
        : '🔨 Quick Hands: construction and upgrades go twice as fast for ' + days + ' days.';
      Deck.say(msg);
      const spots = this.works(), hands = this.hands();
      GrowFX.show('quick_hands', { spots, hands, tab: !spots.length && !hands.length });
      GrowFX.sfx('quickhands');
      return { ok: true, until: e.until, msg: this.result(was, days) };
    },
    // the landing's one toast: what the card did, in the world's words (Deck.say keeps the log line)
    result(was, days) {
      if (was) return 'Quick Hands keeps up the pace — ' + days + ' more days of building at twice the speed.';
      const n = this.all().length;
      return n ? 'Quick Hands: ' + n + (n === 1 ? ' works rises' : ' works rise') + ' twice as fast for ' + days + ' days.'
        : 'Quick Hands: whatever you lay in the next ' + days + ' days rises twice as fast.';
    },
    end() { G.log('🔨 Quick Hands is spent — the works go at their ordinary pace again.'); },
    // every works the quicker hands reach, anywhere: a site, an upgrade, the
    // masons' wall works, a span being reinforced
    rising(b) { return b.owner === 'P' && (b.construction > 0 || b.upgrading > 0 || b.wallUp > 0); },
    all() {
      const out = [];
      for (const b of S.buildings) if (this.rising(b)) out.push({ x: Bld.cx(b), y: b.y + Bld.size(b), sz: Bld.size(b), id: b.id });
      for (const br of (S.bridges || []))
        if (br.owner === 'P' && br.upgrading > 0) out.push({ x: br.x + 0.5, y: br.y + 1, sz: 1, br: 1 });
      return out;
    },
    // the works in view now (plain numbers — a show never holds the world)
    works() {
      const v = GrowFX.view(1);
      return this.all().filter(w => GrowFX.inV(v, w.x, w.y - w.sz / 2)).slice(0, 28);
    },
    // the builders at them in view, and where each one's hammer falls
    hands() {
      const v = GrowFX.view(1), out = [];
      for (const u of S.units) {
        if (out.length >= 24) break;
        if (!this.hammering(u) || !GrowFX.inV(v, u.x, u.y)) continue;
        const h = this.head(u);
        if (h) out.push({ id: u.id, hx: h.x, hy: h.y });
      }
      return out;
    },
    /* WHERE THE CARD LANDS: the works nearest the middle of the view, if any
       is on screen; else the one nearest the hall (the view goes to it); with
       nothing rising anywhere, the hall — and the show bursts off the Build tab */
    dest() {
      const all = this.all();
      if (!all.length) {
        // nothing rising anywhere: the card goes to where the next works are laid
        const t = this.tabPt();
        return t ? { x: (t.x / R.cam.z + R.cam.x) / CFG.TILE, y: (t.y / R.cam.z + R.cam.y) / CFG.TILE } : null;
      }
      const v = GrowFX.view(0), m = GrowFX.mid(), tc = Bld.tcOf('P');
      const seen = all.filter(w => GrowFX.inV(v, w.x, w.y - w.sz / 2));
      const from = seen.length ? m : tc ? { x: Bld.cx(tc), y: Bld.cy(tc) } : m;
      const pool = seen.length ? seen : all;
      let best = pool[0], bd = Infinity;
      for (const w of pool) { const d = Math.hypot(w.x - from.x, w.y - w.sz / 2 - from.y); if (d < bd) { bd = d; best = w; } }
      return { x: best.x, y: best.y - best.sz / 2 };
    },
    /* the Build menu's middle when it is open, else the Build tab — in CSS px
       (null with neither on the page) */
    tabPt() {
      if (typeof document === 'undefined') return null;
      const m = document.getElementById('buildmenu'), t = document.getElementById('bmToggle');
      const mr = m && m.offsetParent !== null && getComputedStyle(m).display !== 'none' ? m.getBoundingClientRect() : null;
      if (mr && mr.width > 0 && mr.height > 0) return { x: mr.left + mr.width / 2, y: mr.top + 6 };
      const tr = t && t.offsetParent !== null ? t.getBoundingClientRect() : null;
      return tr && tr.width > 0 ? { x: tr.left + tr.width / 2, y: tr.top } : null;
    },
    // a builder swinging at a works the card quickens
    hammering(u) {
      if (u.owner !== 'P' || !u.task || Units.moving(u)) return false;
      const tk = u.task;
      if (tk.type === 'build') { const b = Bld.get(tk.id); return !!(b && (b.construction > 0 || b.upgrading > 0)); }
      return tk.type === 'terraform' && tk.job === 'bridgeup';
    },
    /* where the hammer's head comes down, in world px: in front of the body
       the way it faces the works (R.faceBuilding, from where the lean draws
       him), at chest height above the drawn feet */
    head(u) {
      const TL = CFG.TILE, lean = R.workLean ? R.workLean(u) : null;
      const wx = lean ? lean.x : u.x, wy = lean ? lean.y : u.y;
      const b = u.task && u.task.type === 'build' ? Bld.get(u.task.id) : null;
      const dir = (b && R.faceBuilding ? R.faceBuilding(u, b) : null) || 's';
      const sx = /e/.test(dir) ? 1 : /w/.test(dir) ? -1 : 0, sy = /^s/.test(dir) ? 1 : /^n/.test(dir) ? -1 : 0;
      const foot = wy * TL + TL / 2 - CFG.SPRITE_LIFT;
      return { x: wx * TL + sx * 8, y: foot - 12 + sy * 2 };
    },
    /* THE SWING'S STRIKE: the build strip's own cycle (R.unitSprite reads
       u.animT at the sheet's own rate), the head coming down over its last
       third — so the spark is the blow, frame for frame. 0..1 inside the
       strike, -1 between blows. */
    STRIKE: [0.6, 0.84],
    strike(u) {
      const n = 8, key = R.unitArtKey ? R.unitArtKey(u) : u.kind;
      const fps = (Sprites.animFps && (Sprites.animFps[key] || Sprites.animFps[u.kind])) || 9;
      const ph = ((u.animT || 0) * fps / n) % 1, [a, b] = this.STRIKE;
      return ph >= a && ph < b ? (ph - a) / (b - a) : -1;
    },
    // the top of a works as it is drawn now: its stage's art, or the footprint
    top(w) {
      const TL = CFG.TILE;
      if (w.br) return (w.y - 1) * TL;
      const b = Bld.get(w.id);
      if (!b) return (w.y - w.sz) * TL;
      const sz = Bld.size(b), bx = b.x * TL, by = b.y * TL, bw = sz * TL;
      const spr = b.construction > 0 || b.upgrading > 0 ? (R.stageIcon ? R.stageIcon(b) : null) : R.bldSprite(b);
      if (spr && spr._cfArt && R._artBox) { const rc = R.artRect(spr, bx, by, bw, bw), bx2 = R._artBox(spr); return Math.min(by, rc.y + bx2.t * rc.h); }
      return by;
    },
    CHIP: ['#f0dcae', '#d2a868', '#a0703a'],
    /* a small gold hammer over the works — the works' own pip: the masons'
       mark (TX.hammer) at the device's own resolution, a shaped head on its
       haft in the gold over a dark rim (it was 8 × 8 cells of one world
       pixel each, a block of a dozen device pixels on a phone) */
    hammer(g, x, y, a) {
      a = Math.max(0, Math.min(1, a));
      const TX = GrowFX.tx('hammer');
      if (a <= 0.01 || !TX) return;
      TX.hammer(g, x, y, 8.5, null, a, -0.3);
    },
    // sparks thrown off one blow: hot gold grains up and out, falling back
    sparks(g, x, y, q, seed, n, v) {
      const F = GrowFX, TL = CFG.TILE;
      for (let k = 0; k < n; k++) {
        const h1 = F.hash(seed * 17 + k, 5), h2 = F.hash(k * 3, seed + 11);
        const a = -Math.PI / 2 + (h1 - 0.5) * 2.6, sp = TL * (v || 1) * (1.6 + h2 * 1.6);
        const px = x + Math.cos(a) * sp * q, py = y + Math.sin(a) * sp * q + 0.5 * TL * 6 * q * q;
        F.mote(g, px, py, k % 3 ? '#ffcc40' : '#fff6c8', '#7a4a0a', q < 0.6 ? 1 : (1 - q) / 0.4);
      }
    },
    // the '×2': cream on a dark rim, eased up and held, then gone — the burst
    // it pops out of a ring of light running out (R.fxRing)
    pip(g, x, y, q) {
      if (q <= 0 || q >= 1) return;
      const rise = GrowFX.ease(Math.min(1, q / 0.18)) * 9, a = q < 0.75 ? 1 : (1 - q) / 0.25;
      GrowFX.tag(g, x, y - rise, '×2', a, '#f2e6cd');
      if (q < 0.3) {
        const k = q / 0.3;
        R.fxRing(g, x, y - rise, 4 + GrowFX.ease(k) * 10, 0.9 * (1 - k), 'gold', { squash: 0.8, css: 1.6 * (1 - 0.5 * k) });
      }
    },
    show: {
      ms: 1700, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const TL = CFG.TILE, F = GrowFX, vp = F.viewPx(1);
        if (layer === 'sky') {
          if (!s.tab) return;
          // nothing being built: the '×2' bursts off the Build menu (or its
          // tab), where the next works are laid — at the world's own scale
          const t = s.at || (s.at = this.tabPt());
          if (!t) return;
          const d = R.dpr || 1, sc = Math.max(2, Math.round(R.cam.z * d * 1.25));
          g.save(); g.translate(Math.round(t.x * d), Math.round(t.y * d)); g.scale(sc, sc);
          this.sparks(g, 0, -4, Math.min(1, p / 0.7), 7, 16, 0.8);
          this.pip(g, 0, -12, p);
          g.restore();
          return;
        }
        // each works: its sparks and its '×2', a beat apart down the list
        for (let i = 0; i < s.spots.length; i++) {
          const sp = s.spots[i], d0 = (i % 8) * 0.04, q = (p - d0) / (1 - d0);
          if (q <= 0 || q >= 1) continue;
          const cx = sp.x * TL, top = s.tops ? s.tops[i] : this.top(sp);
          if (cx < vp.x0 || cx > vp.x1 || top > vp.y1 + TL || sp.y * TL < vp.y0) continue;
          // sawdust thrown off the works' foot: curls of fresh timber tumbling
          // out and down (TX.shard, at the device's own resolution)
          const foot = sp.y * TL - 2, TXs = F.tx('shard');
          for (let k = 0; k < 10; k++) {
            const h1 = F.hash(i * 17 + k, 9), h2 = F.hash(k * 3, i + 21), t = Math.min(1, q * 1.3);
            const a = -Math.PI / 2 + (h1 - 0.5) * 2.4, v = TL * (1.6 + h2 * 1.4);
            const x = cx + Math.cos(a) * v * t, y = foot - TL * 0.2 + Math.sin(a) * v * t + 0.5 * TL * 7 * t * t;
            const al = t < 0.75 ? 1 : (1 - t) / 0.25;
            if (al <= 0.01 || !TXs) continue;
            g.save(); g.globalAlpha = al;
            TXs.shard(g, x, y, k % 4 ? 1.6 : 2.4, t * (7 + k) + k, this.CHIP[k % 3], this.CHIP[0], '#5a3c1c');
            g.restore();
          }
          this.sparks(g, cx, top + 4, Math.min(1, q / 0.8), i + 1, 12, 1);
          this.pip(g, cx, top - 6, q);
        }
        // every builder's hammer in sight: a fountain of sparks off the blow and a '×2'
        for (let i = 0; i < s.hands.length; i++) {
          const hd = s.hands[i], u = Units.get(hd.id), d0 = 0.08 + (i % 6) * 0.05, q = (p - d0) / (1 - d0);
          if (q <= 0 || q >= 1) continue;
          const h = u ? this.head(u) : { x: hd.hx, y: hd.hy };
          this.sparks(g, h.x, h.y, Math.min(1, q / 0.7), 40 + i, 8, 0.8);
          this.pip(g, h.x, h.y - 14, q);
        }
      },
    },
    // while it lasts: a gold hammer over every works in sight, and a spark off every blow
    drawLive(g) {
      const TL = CFG.TILE, F = GrowFX, v = F.view(1), now = performance.now() / 1000;
      const fresh = F.liveP('quick_hands'), k0 = fresh >= 0 ? Math.min(1, fresh / 0.6) : 1;
      for (const w of this.all()) {
        if (!F.inV(v, w.x, w.y - w.sz / 2)) continue;
        if (!w.br && !G.visibleAt(Math.floor(w.x), Math.floor(w.y - 0.5))) continue;
        const bob = (1 - Math.cos((now * 2 + (w.id || 0) * 0.37) * Math.PI)) * 0.5;   // a gentle bob, smooth
        this.hammer(g, w.x * TL, this.top(w) - 3 - bob, k0);
      }
      for (const u of S.units) {
        if (!this.hammering(u) || !F.inV(v, u.x, u.y)) continue;
        const k = this.strike(u);
        if (k < 0) continue;
        const h = this.head(u);
        for (let m = 0; m < 3; m++) {
          const a = -Math.PI / 2 + (F.hash(u.id + m, Math.floor((u.animT || 0) * 2)) - 0.5) * 2.4;
          F.mote(g, h.x + Math.cos(a) * k * 9, h.y + Math.sin(a) * k * 9, m ? '#ffcc40' : '#fff6c8', null, 1 - k);
        }
      }
    },
  },

  /* IRON — Blight: the rival's gathering and production fall by 40% for 15
     days: its hands' loads (the ground stripped at its own pace — rule 1,
     the other way), both its fishings, the meat of its kills, every station
     it works and the hall's own trickle (AI.daily). The inner market
     (AI.autoConvert) is CONVERSION, not production, and is left alone. A
     curse, not a blow: it leaves the Calm truce standing (rule 6). */
  blight: {
    at: 'bar', CUT: 0.6,
    mult: {
      gather(owner) { return owner === 'A' ? this.CUT : 1; },
      produce(owner) { return owner === 'A' ? this.CUT : 1; },
    },
    can() { return { ok: true }; },
    apply() {
      const days = Deck.card('blight').days, was = !!Deck.timed('blight');
      const e = Deck.addTimed('blight', days);
      Deck.say(was ? '🍂 The blight lingers on the rival’s fields — ' + days + ' more days.'
        : '🍂 A blight falls on the rival: their gathering and production fall by 40% for ' + days + ' days.');
      const d = this.towardRival();
      // with a field of theirs in sight the pall sweeps over it and it withers;
      // with none, the pall gathers where the player is looking and rolls OFF
      // toward the rival — sent, as a curse is (fog-honest: inSight asks the
      // player's own sight)
      GrowFX.show('blight', { dx: d.x, dy: d.y, away: this.fieldsInView() ? 0 : 1 });
      // the light goes sour for a breath as the murk gathers (darker, never lighter)
      if (window.R && R.flashAt) R.flashAt(0.32, 1.4, '40,36,20');
      GrowFX.sfx('blight');
      return { ok: true, until: e.until };
    },
    end() { G.log('🍂 The blight lifts from the rival’s fields.'); },
    /* which way the pall rolls, as the PLAYER knows the world: toward the
       rival's hall if their memory holds it (S.map.seenB), else toward the
       far side of the world from the player's own seat — never a read of
       where the rival really is */
    towardRival() {
      const W = CFG.W, H = CFG.H, seen = S.map && S.map.seenB;
      let t = null;
      if (seen) for (const k in seen) {
        const m = seen[k];
        if (m && m.owner === 'A' && m.key === 'tc') { t = { x: (k % W) + 1, y: Math.floor(k / W) + 1 }; break; }
      }
      if (!t) { const tc = Bld.tcOf('P'); t = tc ? { x: W - Bld.cx(tc), y: H - Bld.cy(tc) } : { x: W / 2, y: H / 2 }; }
      const c = GrowFX.mid();
      let dx = t.x - c.x, dy = t.y - c.y;
      const L = Math.hypot(dx, dy);
      if (L < 1) { dx = 1; dy = 0; } else { dx /= L; dy /= L; }
      return { x: dx, y: dy };
    },
    // a rival work the player can SEE right now (any tile of it in sight)
    inSight(b) {
      const s = Bld.size(b);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (G.visibleAt(b.x + dx, b.y + dy)) return true;
      return false;
    },
    // is a field (any worked station) of theirs in sight and on the screen?
    fieldsInView() {
      const v = GrowFX.view(0);
      return S.buildings.some(b => b.owner === 'A' && Bld.done(b) && Bld.def(b.key).needsWorker &&
        GrowFX.inV(v, Bld.cx(b), Bld.cy(b)) && this.inSight(b));
    },
    /* where the pall's leading edge stands at p, along the way it rolls
       (device px). Over their fields it comes in from the player's side and
       crosses the whole screen; sent AWAY it gathers over the middle of the
       view and rolls off the far edge toward them, leaving the view clear. */
    frontAt(s, p) {
      const Wd = R.cv.width, Hd = R.cv.height, ux = s.dx, uy = s.dy;
      const pr = [0, ux * Wd, uy * Hd, ux * Wd + uy * Hd];
      // the pall is a BANK about half a screen deep — weather passing over,
      // never a sheet over the whole frame
      const lo = Math.min.apply(null, pr), hi = Math.max.apply(null, pr), span = hi - lo, band = span * 0.5;
      if (s.away) {
        const mid = (lo + hi) / 2, f0 = mid + band * 0.55, f1 = hi + band * 1.2;
        const q = p < this.GATHER ? 0 : Math.min(1, (p - this.GATHER) / (0.86 - this.GATHER));
        return { front: f0 + (f1 - f0) * q * q, band, span, ux, uy };
      }
      return { front: lo - band * 0.05 + (span + band * 1.1) * Math.min(1, p / 0.86), band, span, ux, uy };
    },
    // the part of the act an AWAY pall spends gathering before it rolls
    GATHER: 0.22,
    /* the pall: a bank of sick grey-yellow billows rolling across the screen
       toward the rival's side — thick at its leading face, thinning into rags
       behind (hard cells, never a gradient), spores boiling out of it — and every
       rival field the player can see withers as the edge passes */
    show: {
      ms: 3400, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX, fr = this.frontAt(s, p), fade = p < 0.86 ? 1 : Math.max(0, (1 - p) / 0.14);
        if (layer === 'world') {
          // spores burst up off each rival work in sight as the edge rolls over it
          const TL = CFG.TILE, v = F.view(1);
          for (const b of S.buildings) {
            if (b.owner !== 'A' || !Bld.done(b) || !Bld.def(b.key).needsWorker) continue;
            if (!F.inV(v, Bld.cx(b), Bld.cy(b)) || !this.inSight(b)) continue;
            const sc = F.toScreen(Bld.cx(b), Bld.cy(b)), k = (fr.front - (sc.x * fr.ux + sc.y * fr.uy)) / (fr.band * 0.35);
            if (k <= 0 || k >= 1) continue;
            const sz = Bld.size(b);
            for (let m = 0; m < 10; m++) {
              const h = F.hash(b.id + m, 21), a = -Math.PI / 2 + (h - 0.5) * 2;
              F.mote(g, (b.x + sz * (0.2 + F.hash(m, b.id) * 0.6)) * TL + Math.cos(a) * k * TL,
                (b.y + sz * 0.7) * TL + Math.sin(a) * k * TL * 1.4, m % 2 ? this.SPORE[0] : this.SPORE[1], '#2c2a1c', 1 - k);
            }
          }
          return;
        }
        /* THE PALL IS A CLOUD BANK, built of PUFFS: round billows of a sick
           grey-yellow, each lit on its rim toward the sun (up and to the left),
           in shadow on the rim turned away, crowned where it rises — and
           under the bank its own SHADOW on the ground, offset down and right,
           so it is seen to hang over the land and not to be painted on it.
           The bank's leading face is whatever the billows make of it — each a
           different size, boiling, swaying — so it is RAGGED by construction,
           and it thins into rags behind, near-opaque. DRAWN AT THE DEVICE'S OWN
           RESOLUTION (the operator's ruling of 2026-10-27): every billow is one
           smoothly shaded sphere of murk (murkPuff, made once and laid at its
           own size with smoothing) with an antialiased rim — it was a buffer a
           pixel a cell, blown up nearest-neighbour into blocks of a dozen
           device pixels. The first cut was a noise field cut against a
           threshold that jumped where the depth crossed zero: one ruler-
           straight line across the screen with dithered strips behind (a
           screen wipe), and three flat half-clear green-greys by height over
           the grass (camouflage). */
        const Wd = R.cv.width, Hd = R.cv.height, dpr = R.dpr || 1;
        // (the billows' sizes are counted in this unit, the zoom's: the bank is
        // the same weather at every zoom — it is no longer a grid)
        const cell = Math.max(4, 2 * R.cam.z * dpr), T = s.t;
        // an AWAY pall gathers before it rolls: its billows swell up out of nothing in turn
        const gather = s.away ? Math.min(1, p / this.GATHER) : 1;
        const A = fade * 0.92;
        // the billows, in cells: along the band, thinning and shrinking behind its face
        const band = fr.band / cell, span = fr.span / cell, front = fr.front / cell, ux = fr.ux, uy = fr.uy;
        const cw = Wd / cell, ch = Hd / cell;
        // enough of them to overlap two and three deep: one mass with a billowed edge, never a scatter
        const avg = 9.5, N = Math.max(60, Math.min(640, Math.round(band * span * 1.4 / (Math.PI * avg * avg) * 3)));
        const puffs = [];
        for (let i = 0; i < N; i++) {
          const u = Math.pow(F.hash(i, 1), 1.25);
          let r = (6 + 9 * F.hash(i, 3)) * (1 - 0.5 * u) * (1 + 0.07 * Math.sin(T * 2.1 + i * 1.7));
          if (s.away) r *= F.ease(Math.max(0, Math.min(1, gather * 1.6 - F.hash(i, 4) * 0.6)));
          if (r < 1.5) continue;
          const along = front - band * u - r * 0.5, perp = (F.hash(i, 2) - 0.5) * span * 1.4 + Math.sin(T * 0.7 + i) * 1.2;
          const x = ux * along - uy * perp, y = uy * along + ux * perp;
          if (x < -r - 6 || x > cw + r + 6 || y < -r - 6 || y > ch + r + 6) continue;
          puffs.push({ x, y, r, i });
        }
        puffs.sort((a, z) => a.y - z.y);
        const P = this.murkPuff(), SH = this.murkShadow();
        g.save();
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        // the bank's shadow on the ground first
        const so = 3 + band * 0.02;
        g.globalAlpha = fade * 0.36;
        for (const q of puffs) { const R0 = q.r * cell; g.drawImage(SH, (q.x + so) * cell - R0, (q.y + so * 1.3) * cell - R0, R0 * 2, R0 * 2); }
        // then the billows, back to front, each its own lit sphere (two
        // turnings of the sphere, so neighbours do not wear one highlight)
        g.globalAlpha = A;
        for (const q of puffs) {
          const R0 = q.r * cell, img = P[q.i % P.length];
          g.drawImage(img, q.x * cell - R0, q.y * cell - R0, R0 * 2, R0 * 2);
        }
        g.globalAlpha = 1;
        g.restore();
        // spores boiling up out of the murk, a dark underside to each so they
        // read against bright grass and dark woods alike — round specks at
        // the device's own resolution (they were squares of the art's pixel)
        const sp = 2 * R.cam.z * dpr * 0.5;   // a spore's radius, half the art's pixel
        const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
        g.save();
        for (let k = 0; k < 200; k++) {
          const along = fr.front - fr.band * F.hash(k, 1) * 1.05, perp = (F.hash(k, 2) - 0.5) * fr.span * 1.4;
          const sw = Math.sin(s.t * (1.5 + F.hash(k, 4) * 2) + k) * 14 * dpr;
          const x = fr.ux * along - fr.uy * perp + fr.uy * sw, y = fr.uy * along + fr.ux * perp - s.t * 30 * dpr * (0.4 + F.hash(k, 3)) - fr.ux * sw;
          if (x < 0 || x > Wd || y < 0 || y > Hd) continue;
          const a = fade * gather * (1 - F.hash(k, 1) * 0.6);
          if (a <= 0.01) continue;
          const r = sp * (k % 4 === 0 ? 1.7 : 1) * (0.85 + 0.3 * F.hash(k, 6));
          g.globalAlpha = a;
          g.fillStyle = '#2c2a1c'; dot(x + r * 0.25, y + r * 0.7, r);
          g.fillStyle = this.SPORE[k % 3]; dot(x, y, r);
        }
        // and the season's last leaves, dead before they fell, tumbling with it
        const TXl = F.tx('leaf');
        for (let k = 0; k < 46 && TXl; k++) {
          const along = fr.front - fr.band * (0.05 + F.hash(k, 31) * 0.6), perp = (F.hash(k, 32) - 0.5) * fr.span * 1.3;
          const tum = s.t * (3 + F.hash(k, 33) * 4) + k;
          const x = fr.ux * along - fr.uy * perp, y = fr.uy * along + fr.ux * perp + Math.sin(tum) * 10 * dpr;
          if (x < 0 || x > Wd || y < 0 || y > Hd) continue;
          const a = fade * gather * 0.9;
          if (a <= 0.01) continue;
          TXl.leaf(g, x, y, sp * 2 * (2 + F.hash(k, 34)), tum * 0.8, k % 2 ? '#7a6a48' : '#5e5238', a);
        }
        g.restore();
      },
    },
    /* the pall's tones: the billow's shadowed rim, its body, its lit rim, the
       shade in it, its crown — a sick grey with a jaundiced cast — the
       bank's shadow on the ground, and the spores it carries */
    MURK: ['#3c392d', '#7f7a63', '#c4bf86', '#5d5849', '#9a9479', '#1c1a10', '#d6d070'],
    murkRGB() { return this._rgb || (this._rgb = this.MURK.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))); },
    /* ONE BILLOW, made once (render state — never in S): a sphere of the
       murk 128 px across, lit up and to the left — its crown, its body, the
       shade turned away, a dark rim on its shadowed side and a lit one toward
       the sun — with an antialiased edge and a sick fleck or two in it; laid
       at every billow's own size with smoothing, so it is smooth at any zoom.
       Two turnings, so neighbours do not wear one highlight. */
    _puff: null, _shade: null,
    murkPuff() {
      if (this._puff) return this._puff;
      const M = this.murkRGB(), S2 = 128, out = [];
      const mix = (a, b, k) => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * k);
      const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
      for (let v = 0; v < 2; v++) {
        const c = document.createElement('canvas'); c.width = c.height = S2;
        const x = c.getContext('2d'), im = x.createImageData(S2, S2), d = im.data;
        const rot = v ? 0.35 : -0.2;
        for (let py = 0; py < S2; py++) for (let px = 0; px < S2; px++) {
          const dx = (px + 0.5) / S2 * 2 - 1, dy = (py + 0.5) / S2 * 2 - 1, r = Math.hypot(dx, dy);
          if (r > 1) continue;
          const ca = Math.cos(rot), sa = Math.sin(rot), ex = dx * ca - dy * sa, ey = dx * sa + dy * ca;
          const lit = -(ex + ey) * 0.7071;
          let col = M[1];
          col = lit > 0 ? mix(col, M[4], sm(0.15, 0.75, lit) * sm(0.95, 0.4, r)) : mix(col, M[3], sm(0.1, 0.8, -lit));
          // the rim: lit toward the sun, dark on the side turned away
          const rim = sm(0.62, 0.98, r);
          col = lit > 0.2 ? mix(col, M[2], rim * sm(0.2, 0.6, lit)) : mix(col, M[0], rim * sm(-0.1, -0.6, lit));
          // a sick fleck or two, carried in its body
          const fl = Math.sin(px * 0.21 + v * 3) * Math.cos(py * 0.17 + v) > 0.985 && r < 0.8 ? 1 : 0;
          if (fl) col = M[6];
          const i = (py * S2 + px) * 4;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(255 * sm(1, 1 - 2 / S2, r));
        }
        x.putImageData(im, 0, 0);
        out.push(c);
      }
      return (this._puff = out);
    },
    // the bank's shadow under a billow: a dark disc, softened at its rim
    murkShadow() {
      if (this._shade) return this._shade;
      const M = this.murkRGB(), c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      const k = M[5].join(',');
      gr.addColorStop(0, 'rgba(' + k + ',1)'); gr.addColorStop(0.82, 'rgba(' + k + ',1)'); gr.addColorStop(1, 'rgba(' + k + ',0)');
      x.fillStyle = gr; x.beginPath(); x.arc(32, 32, 32, 0, Math.PI * 2); x.fill();
      return (this._shade = c);
    },
    // (the first is a MOTE's colour too: kept under R.warmLight's red, or a
    // faded spore would turn to the gold's ink — R.inkFade)
    SPORE: ['#c4bb86', '#b3a86c', '#efe7b4'],
    /* while it lasts, every rival field and station IN SIGHT stands withered
       — its own silhouette washed a dead yellow-brown, dull specks over the
       plot, sick spores drifting off it. Drawn ON THE BUILDING
       (R.drawCardBld, right after its own art in the building loop), so the
       rival's hands standing on their own field are drawn over it, never
       washed with it — and only for what the frame draws at all, which is
       what the player can see: nothing the fog hides is drawn, ever (the
       card is not a lamp; inSight asks again, for a caller that is not the
       frame). As the pall rolls in, each field withers as its edge passes. */
    drawBld(g, b, e) {
      if (b.owner !== 'A' || !Bld.done(b) || !Bld.def(b.key).needsWorker || !this.inSight(b)) return;
      const TL = CFG.TILE, F = GrowFX, t = performance.now() / 1000, sz = Bld.size(b);
      let k = F.tail(e);
      const sp = F.liveP('blight');
      if (sp >= 0 && sp < 1) {
        const live = R.cardShows.find(z => z.id === 'blight'), fr = live && this.frontAt(live, sp);
        if (fr) { const sc = F.toScreen(Bld.cx(b), Bld.cy(b)); k *= Math.max(0, Math.min(1, (fr.front - (sc.x * fr.ux + sc.y * fr.uy)) / (fr.band * 0.35))); }
      }
      if (k <= 0.05) return;
      const spr = R.wornSprite ? R.wornSprite(b) : R.bldSprite(b);
      if (spr && spr.width > 0) {
        g.globalAlpha = F.step(0.6 * k);
        R.blitBld(g, R.tintOf(spr, '#6b6140'), b.x * TL, b.y * TL, sz * TL, sz * TL);
      }
      g.globalAlpha = F.step(0.75 * k);
      for (let m = 0; m < 8 * sz * sz; m++) {
        g.fillStyle = m % 3 ? '#6e6248' : '#9a8f62';
        g.fillRect(F.snap((b.x + F.hash(m, b.id) * sz) * TL), F.snap((b.y + 0.2 + F.hash(b.id, m * 3) * (sz - 0.2)) * TL), 2, 2);
      }
      for (let m = 0; m < 4; m++) {
        const ph = (t * 0.22 + F.hash(b.id, m + 9)) % 1;
        F.mote(g, (b.x + 0.15 + F.hash(m, b.id + 4) * (sz - 0.3)) * TL + Math.sin(t * 1.3 + m * 2) * 3,
          (b.y + sz * 0.6) * TL - ph * TL * 1.4, this.SPORE[0], '#2c2a1c', k * (ph < 0.2 ? ph / 0.2 : (1 - ph) / 0.8));
      }
      g.globalAlpha = 1;
    },
  },

  /* ENLIGHTENMENT — Enlightenment: the player's Town Center rises one level
     at once, free, skipping the three-building rule (Bld.tcSupport); then
     every building is raised at once, free, to the hall's NEW level — two
     steps where one stands two behind (an L1 mine under a hall going to
     L3) — and the walls and gates with them through the village-wide wall
     tier, if there are any (with none, S.wallLevel stays: it is the tier
     new sections are laid at, and a card must not price the player's next
     palisade in stone). At hall Lv 3 it raises everything else to Lv 3.
     Work SITES are not buildings yet and are left to finish as laid; the
     Wonder and single-tier works have nowhere to rise. WORKS ALREADY UNDER
     WAY are resolved cleanly: an upgrade in flight is finished by the card
     (never left ticking, or the builders would lift it a level past the
     hall when they finished) and what was paid for it comes back — the
     hall's own, the masons' wall works (tc.wallUpPaid) and every
     building's. No upgrade is scored (rule 5). */
  enlightenment: {
    at: 'tc', TOP: 3,
    plan() {
      const tc = Bld.tcOf('P');
      if (!tc) return null;
      const target = Math.min(this.TOP, tc.level + 1), rise = tc.level < target;
      const items = [];
      for (const b of S.buildings) {
        if (b.owner !== 'P' || b === tc || b.key === 'wall' || b.key === 'gate' || b.key === 'wonder') continue;
        if (b.construction > 0) continue;
        const top = Math.min(target, Bld.def(b.key).levels.length);
        if (b.level < top) items.push({ b, to: top });
      }
      const wl = S.wallLevel || 1, forts = Bld.forts('P');
      // masons' works already under way are finished even if every section
      // they were raising has since been knocked down — the card pays them
      // back, so it must finish them, or they would tick on and land a tier
      // the player was just refunded for — but only to the tier they were
      // paid for: with no wall standing, a card prices no palisade in stone
      const walls = wl >= target ? 0 : forts.length ? target : tc.wallUp > 0 ? Math.min(target, tc.wallUpTarget || wl + 1) : 0;
      const steps = (rise ? 1 : 0) + items.reduce((n, it) => n + it.to - it.b.level, 0) + (walls ? walls - wl : 0);
      return { tc, target, rise, items, walls, forts: forts.length, steps };
    },
    /* what the masons were paid for the works in flight, rebuilt for a save
       written before they kept the bill (tc.wallUpPaid): the list price of the
       tier they were raising, for every wall and gate standing now — what
       Bld.wallUpgradeCost charged when the order was given, as near as the
       board still says */
    masonsBill(tc) {
      const i = (tc.wallUpTarget || (S.wallLevel || 1) + 1) - 1, out = {};
      for (const f of Bld.forts('P')) {
        const lv = CFG.BUILDINGS[f.key].levels[i], cost = lv && lv.cost;
        if (cost) for (const k in cost) out[k] = (out[k] || 0) + cost[k];
      }
      return out;
    },
    can() {
      const pl = this.plan();
      if (!pl) return { ok: false, why: 'Your Town Center must stand.' };
      if (!pl.steps) return { ok: false, why: 'Everything stands at its height' };
      return { ok: true };
    },
    apply() {
      const ok = this.can();
      if (!ok.ok) return ok;
      const pl = this.plan(), tc = pl.tc, back = {};
      const refund = c => { for (const k in c) if (c[k] > 0) back[k] = (back[k] || 0) + c[k]; };
      let resolved = 0, raised = 0;
      // what each one wore BEFORE: the act holds that look until its own beam
      // lands (show.held → R.wornSprite) — render data, never in S
      const tcFrom = tc.level, wallFrom = S.wallLevel || 1, from = new Map(pl.items.map(it => [it.b.id, it.b.level]));
      // the hall: an upgrade under way is this same rise — its price comes back
      if (tc.upgrading > 0) { refund(Bld.cancelRefund(tc)); tc.upgrading = 0; tc.upgTotal = 0; resolved++; }
      if (pl.rise) Bld.finishUpgrade(tc, true);
      // the walls and gates, through the village-wide tier (a save from before
      // the masons kept their bill pays back the honest price of the works)
      if (tc.wallUp > 0) { refund(tc.wallUpPaid || this.masonsBill(tc)); resolved++; }
      if (pl.walls) { tc.wallUpTarget = pl.walls; Bld.finishWallUpgrade(tc, true); }
      // every other building, step by step to the hall's level
      const items = [];
      for (const it of pl.items) {
        const b = it.b;
        if (b.upgrading > 0) { refund(Bld.cancelRefund(b)); b.upgrading = 0; b.upgTotal = 0; resolved++; }
        while (b.level < it.to) Bld.finishUpgrade(b, true);
        raised++;
      }
      for (const k in back) S.res[k] = (S.res[k] || 0) + back[k];
      // the light runs out to every building raised (walls included), nearest
      // first, and each rises in its own beat — IN TURN, by rank, never two at
      // once (by distance alone a ring of houses all rose in the same frame)
      const cx = Bld.cx(tc), cy = Bld.cy(tc);
      const lit = pl.items.map(it => it.b).concat(pl.walls ? Bld.forts('P').filter(f => !(f.construction > 0)) : []);
      for (const b of lit) {
        const was = from.has(b.id) ? from.get(b.id) : (b.key === 'wall' || b.key === 'gate') ? wallFrom : 0;
        items.push({ id: b.id, x: Bld.cx(b), y: Bld.cy(b), sz: Bld.size(b), d: Math.hypot(Bld.cx(b) - cx, Bld.cy(b) - cy), from: was !== b.level ? was : 0 });
      }
      items.sort((a, z) => a.d - z.d);
      if (items.length > 64) items.length = 64;
      const n = items.length;
      items.forEach((it, i) => { it.a0 = this.BEAT0 + this.BEATS * (n > 1 ? i / (n - 1) : 0); });
      const maxD = items.reduce((m, it) => Math.max(m, it.d), 1);
      GrowFX.show('enlightenment', { x: cx, y: cy, foot: tc.y + Bld.size(tc), tc: tc.id, tcFrom: pl.rise ? tcFrom : 0, items, maxD });
      GrowFX.sfx('enlighten');
      const s = k => k === 1 ? '' : 's';
      Deck.say('✨ Enlightenment: your Town Center stands at Lv ' + tc.level +
        (raised ? ', and ' + raised + ' building' + s(raised) + ' rose to meet it' : '') +
        (pl.walls && pl.forts ? '; every wall and gate stands at Lv ' + S.wallLevel : '') +
        (resolved ? '. ' + resolved + ' work' + s(resolved) + ' already under way ' + (resolved === 1 ? 'was' : 'were') + ' finished' +
          // (nothing to hand back — never "free paid for it comes back")
          (Object.keys(back).length ? ', and ' + Bld.costStr(back) + ' paid for ' + (resolved === 1 ? 'it' : 'them') + ' comes back' : '') : '') + '.');
      // the landing toast says what happened, not the rule
      const walled = pl.walls && pl.forts ? (raised ? ', and the walls' : ' — and the walls rose with it') : '';
      const msg = '✨ ' + (pl.rise ? 'Town Center Lv ' + tc.level + (raised ? ' — ' + raised + ' building' + s(raised) + ' rose with it' : '') + walled
        : raised + ' building' + s(raised) + ' rose to Lv ' + tc.level + ' to meet your Town Center' + (pl.walls && pl.forts ? ', and the walls' : ''))
        + (Object.keys(back).length ? '; ' + Bld.costStr(back) + ' paid for works under way comes back' : '') + '.';
      return { ok: true, x: cx, y: cy, fly: back, msg };
    },
    /* the beats: the first building's light leaves the hall at BEAT0 and the
       last at BEAT0 + BEATS; each takes RUN to reach its building, its beam
       DROP to come down on it (the moment it rises), and FLASH after */
    BEAT0: 0.18, BEATS: 0.48, RUN: 0.05, DROP: 0.03, FLASH: 0.2,
    /* THE TOWN WAKES KNOWING HOW. A pillar of golden light stands up out of
       the hall into a sky with a sun burst at the top of the world, rays of
       short dashes fanning from it; the ground shakes as it lands and the
       hall rises in it; then the light runs out along the ground to every
       building — nearest first, ONE AT A TIME — and on each a small beam
       comes down out of the sky, and the building rises in it: its own new
       art, flashed gold, a ring of dots, sparks, its own small bell. Until
       its beam lands each wears the look it had before (show.held). */
    show: {
      ms: 5800, layers: ['world', 'sky'],
      // the buildings still waiting for their beam, at the level they wore
      held(s, p) {
        const m = new Map(), E = Deck.FX.enlightenment;
        if (s.tcFrom && p < 0.12) m.set(s.tc, s.tcFrom);
        for (const it of s.items) if (it.from && p < it.a0 + E.RUN + E.DROP) m.set(it.id, it.from);
        return m;
      },
      draw(g, s, p, dt, layer) {
        const F = GrowFX, E = Deck.FX.enlightenment;
        if (layer === 'sky') {
          const e = F.env(p, 0.02, 0.14, 0.7, 0.98);
          if (e <= 0) return;
          const sc = F.toScreen(s.x, s.foot), W = R.cv.width, H = R.cv.height, dpr = R.dpr || 1;
          const ox = Math.max(0, Math.min(W, sc.x)), px = Math.max(2, Math.round(4 * dpr));
          // where the pillar meets the top of the world: a burst of the card's
          // light in three stepped discs — a halo of gold dots round a gold
          // disc round a cream heart. It comes and goes by SIZE at full
          // strength: faded through its faint steps the gold went olive
          const k = F.step(e);
          F.ring(g, ox, 0, H * 0.24 * k, 'gold', 0.8, px, 1);
          F.ring(g, ox, 0, H * 0.2 * k, 'gold', 0.45, px, 1, null, 0.5);
          for (const [r, a] of [[0.15, 0.62], [0.075, 1]])
            R.glow(g, a, () => R.pxDisc(g, ox, 0, H * r * k, px, 1));
          R.glowHot(g, 0.75, () => R.pxDisc(g, ox, 0, H * 0.035 * k, px, 1));
          F.rays(g, ox, -H * 0.04, 15, 0.2, 'gold', 0.9 * e, s.t, 0.29);
          F.glitter(g, 56, 'gold', e, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL, vp = F.viewPx(2);
        if (p >= 0.1 && !s.boom) {
          s.boom = 1;
          if (R.shakeAt) R.shakeAt(8, 1.0);
          // (no whole-frame flash: gold over the meadow is a sepia frame —
          // the pillar landing, the shake and its rings are the blow)
        }
        // THE PILLAR: full width while the hall rises in it, then drawn down
        // to a thread so each building's own beam can be seen beside it
        const up = Math.min(1, p / 0.1), thin = p < 0.2 ? 1 : p < 0.72 ? Math.max(0.3, 1 - (p - 0.2) / 0.12) : Math.max(0, 0.3 * (1 - (p - 0.72) / 0.2));
        if (thin > 0) {
          // it stands up out of the hall's middle, so the hall's own face shows lit beneath it
          const base = s.y * TL, topY = R.cam.y - 60 / R.cam.z, h = (base - topY) * F.ease(up), w = TL * (1.7 + Math.sin(s.t * 9) * 0.12) * thin;
          // NO POOL at its foot (a warm patch on the meadow reads as sand, a
          // pale one added over it as lime): it lands in two rings of dots and
          // the three that keep rolling out below
          F.ring(g, cx, foot, TL * (0.85 + up * 0.45), 'gold', 0.95 * thin, 2, 0.5);
          F.ring(g, cx, foot, TL * (0.5 + up * 0.3), 'gold', thin, 2, 0.5, null, 0.5);
          F.column(g, cx, base, base - h, w, 1);
          // the light climbing it: hot bars running up the cream heart
          R.glowHot(g, 0.5 * thin, () => {
            for (let k = 0; k < 16 && h > 4; k++) {
              const yy = base - ((s.t * 240 + k * 64) % h);
              g.fillRect(F.snap(cx - w * 0.28), F.snap(yy), Math.max(2, F.snap(w * 0.56)), 2);
            }
          });
          for (let k = 0; k < 3; k++) {
            const q = (p * 2.2 + k / 3) % 1;
            F.ring(g, cx, foot, TL * (0.8 + q * 4.6), 'gold', (1 - q) * 0.95 * thin, 2, 0.5, vp);
          }
        }
        // THE LIGHT RUNS OUT TO EVERY BUILDING, one at a time, and a small
        // beam comes down on each (it rises in its own light in the building
        // pass — show.drawBld below)
        for (const it of s.items) {
          const a0 = it.a0, land = a0 + E.RUN;
          if (p < a0) continue;
          const bx = it.x * TL, by = it.y * TL;
          if (p < land) {
            const k = (p - a0) / E.RUN;
            // the runner: a cream head and a gold trail fading down the ramp
            g.save();
            for (let m = 5; m >= 0; m--) {
              const km = Math.max(0, k - m * 0.05), x = cx + (bx - cx) * km, y = foot + (by - foot) * km;
              if (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1) continue;
              if (!R.inkOn(g, 1 - m * 0.15)) continue;
              const sz = m ? 2 : 4;
              g.fillRect(F.snap(x) - sz / 2, F.snap(y) - sz / 2, sz, sz);
            }
            g.restore();
            continue;
          }
          const k = (p - land) / E.FLASH, kd = E.DROP / E.FLASH;
          if (k >= 1 || bx < vp.x0 || bx > vp.x1 || by < vp.y0 - TL * 3 || by > vp.y1 + TL) continue;
          // its own beam: it comes DOWN out of the sky onto the roof, holds,
          // and thins away — narrow, tapering in three stepped widths
          const bf = by + it.sz * TL * 0.5, top = Math.min(bf - TL * 2, R.cam.y - 60 / R.cam.z);
          const drop = F.ease(Math.min(1, k / kd)), fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
          F.column(g, bx, top + (bf - top) * drop, top, TL * (0.3 + it.sz * 0.22) * fade, fade);
          if (k < kd) continue;
          if (!it.rung) { it.rung = 1; F.sfx('rise'); if (R.shakeAt && it.sz > 1) R.shakeAt(2, 0.25); }
          const kk = (k - kd) / (1 - kd);
          F.ring(g, bx, bf - 2, TL * (0.4 + it.sz * 0.9 * F.ease(kk)), 'gold', (1 - kk) * 0.95, 2, 0.5, vp);
          for (let m = 0; m < 6; m++) {
            const h = F.hash(it.id, m + 3);
            F.mote(g, bx + (h - 0.5) * TL * it.sz, bf - TL * 0.4 - kk * TL * (0.8 + h), m % 2 ? '#fff1b8' : '#ffd45e', '#7a4a0a', 1 - kk);
          }
        }
      },
      /* the hall, then every building, RISES IN ITS OWN LIGHT — its new
         silhouette flashed gold on its own art in the building pass
         (R.drawCardBld), the moment its beam lands, so whoever is at work on
         it stands in front of the light */
      drawBld(g, b, s, p) {
        const F = GrowFX, E = Deck.FX.enlightenment;
        if (b.id === s.tc) { if (p > 0.1 && p < 0.5) F.flashBld(g, b, 0.9 * F.env(p, 0.1, 0.13, 0.3, 0.5)); return; }
        const it = (s._byId || (s._byId = new Map(s.items.map(z => [z.id, z])))).get(b.id);
        if (!it) return;
        const k = (p - (it.a0 + E.RUN + E.DROP)) / (E.FLASH - E.DROP);
        if (k > 0 && k < 1) F.flashBld(g, b, 0.95 * (1 - k));
      },
    },
  },

  /* IMPERIAL — Age of Marble: for the rest of the run the player's Wonder
     costs 25% less (Deck.wonderCost, in Bld.effCost — the one cost point,
     so the menu, the ghost, "% saved" and the payment agree) and rises
     twice as fast (Deck.buildRate — the builders' own work, rule 4). Laid
     already? A quarter of what was actually PAID comes back, and the
     site's own record of what it cost (b.paid) drops by the same, so a
     works later called off refunds what is left and never mints the
     quarter twice. A run flag (S.deck.charges.marble), so it rides the
     save; a second card has nothing left to give and is refused. The
     Wonder rises only where the mode offers it (UI.wonderOffered — Calm). */
  age_of_marble: {
    at: 'tc', CUT: 0.25, RATE: 2,
    // the card lands ON the works when they stand (DeckUI._dest), else on the
    // hall — and the works are brought to the middle of the view first: at
    // the screen's edge the courses landed under the toast
    dest() { const w = GrowFX.wonderSite(); if (w) GrowFX.frame(w.x, w.y); return w; },
    can() {
      if (!UI.wonderOffered()) return { ok: false, why: 'The Wonder rises only in Calm worlds.' };
      const w = Deck.wonderOf('P');
      if (w && !(w.construction > 0)) return { ok: false, why: 'Your Wonder already stands.' };
      if (S.deck && S.deck.charges && S.deck.charges.marble) return { ok: false, why: 'The Age of Marble has already come.' };
      return { ok: true };
    },
    apply() {
      const ok = this.can();
      if (!ok.ok) return ok;
      const w = Deck.wonderOf('P'), back = {}, was = Bld.effCost('P', 'wonder');
      Deck.run().charges.marble = 1;
      const now = Bld.effCost('P', 'wonder');
      if (w && w.paid) for (const k in w.paid) {
        const n = Math.floor((w.paid[k] || 0) * this.CUT);
        if (n > 0) { back[k] = n; w.paid[k] -= n; S.res[k] = (S.res[k] || 0) + n; }
      }
      const tc = Bld.tcOf('P');
      const at = w ? { x: Bld.cx(w), y: Bld.cy(w), foot: w.y + Bld.size(w), sz: Bld.size(w), site: 1, bx: w.x, by: w.y }
        : tc ? { x: Bld.cx(tc), y: Bld.cy(tc), foot: tc.y + Bld.size(tc), sz: Bld.size(tc), site: 0 }
        : Object.assign(GrowFX.mid(), { foot: GrowFX.mid().y + 1, sz: 2, site: 0 });
      // the act says what changed: the price struck through (no works yet),
      // or what came back (works laid) — render data, never in S
      GrowFX.show('age_of_marble', Object.assign(at, { was, now, back }));
      // (no whole-frame flash: the first cut washed the frame to a pale cream
      // fog for the whole act, which read as a render failure)
      GrowFX.sfx('marble');
      const any = Object.keys(back).length;
      Deck.say('🏛 The Age of Marble: for the rest of this game your Wonder costs 25% less and rises twice as fast' +
        (w ? (any ? ' — and ' + Bld.costStr(back) + ' of what you paid for it comes back' : '') : '') + '.');
      // the landing toast says what happened, not the rule
      const msg = w ? (any ? '🏛 Age of Marble: ' + Bld.costStr(back) + ' of what you paid comes back, and your Wonder rises twice as fast.'
        : '🏛 Age of Marble: your Wonder rises twice as fast.')
        : '🏛 Age of Marble: your Wonder costs a quarter less now, and will rise twice as fast.';
      return { ok: true, x: at.x, y: at.y, fly: back, msg };
    },
    /* the marble is dressed STONE: the stone ramp (ART.PALETTE.stone) with
       a pale cap — the first cut was white tiles in a grey frame, which read
       as icons laid on the map. Joint, shade, flank, face, cap. */
    MARBLE: ['#4a4a44', '#8f8f86', '#adada2', '#c9c9bf', '#e6e4da'],
    ramp() {
      const P = typeof ART !== 'undefined' && ART.PALETTE && ART.PALETTE.stone;
      return P && P.length >= 5 ? [P[0], P[2], P[3], P[4], this.MARBLE[4]] : this.MARBLE;
    },
    // one dressed block, its foot at (x, y), world px: a dark joint all
    // round, the lit cap, the face with its shaded foot, the flank in
    // shadow, a vein, and now and then a chipped corner
    block(g, x, y, k) {
      const M = this.ramp(), F = GrowFX, x0 = F.snap(x) - 6, y0 = F.snap(y) - 10;
      g.fillStyle = M[0]; g.fillRect(x0, y0, 12, 10);
      g.fillStyle = M[4]; g.fillRect(x0 + 1, y0 + 1, 10, 2);
      g.fillStyle = M[3]; g.fillRect(x0 + 1, y0 + 3, 8, 5);
      g.fillStyle = M[2]; g.fillRect(x0 + 1, y0 + 8, 8, 1); g.fillRect(x0 + 9, y0 + 3, 2, 6);
      g.fillStyle = M[1]; g.fillRect(x0 + 10, y0 + 4, 1, 5);
      g.fillStyle = M[2];
      if (k % 3 === 0) { g.fillRect(x0 + 3, y0 + 4, 1, 1); g.fillRect(x0 + 4, y0 + 5, 1, 1); g.fillRect(x0 + 5, y0 + 6, 2, 1); }
      else if (k % 3 === 1) { g.fillRect(x0 + 6, y0 + 4, 1, 2); g.fillRect(x0 + 5, y0 + 6, 1, 1); }
      if (k % 4 === 2) { g.fillStyle = M[0]; g.fillRect(x0 + 1, y0 + 1, 1, 1); }
    },
    /* the marble arrives: a pale shaft drops from the top of the sky onto
       the works and dressed blocks fall down it, course on course in a
       running bond, each throwing chips of stone as it lands — with no
       works yet, a stack of them is set down at the hall's door, the
       Wonder's stone waiting. The act says what the card did on a plaque
       below it: the Wonder's price struck through to its new one, or the
       quarter of it that comes back. No wash over the frame: the first cut
       faded the whole view to a cream fog for the act. */
    show: {
      ms: 3800, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX;
        if (layer === 'sky') {
          const e = F.env(p, 0, 0.08, 0.66, 0.96);
          if (e > 0) {
            const sc = F.toScreen(s.x, s.foot);
            F.rays(g, Math.max(0, Math.min(R.cv.width, sc.x)), -R.cv.height * 0.05, 9, 0.16, 'pale', 0.7 * e, s.t, 0.06);
            F.glitter(g, 36, 'pale', e * 0.85, s.t);
          }
          this.caption(g, s, p);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, half = s.sz * TL / 2;
        // with no works the stack stands just before the hall's door
        const foot = s.foot * TL + (s.site ? 0 : TL * 0.35);
        // each course lands with a thud: dust rolls out from under the works
        // (the placement dust — render one-shots, never in S) and the ground shakes
        for (const [at, k] of [[0.2, 'd1'], [0.35, 'd2'], [0.5, 'd3']]) {
          if (p < at || s[k]) continue;
          s[k] = 1;
          if (s.site && R.startPlacePoof) R.startPlacePoof(s.bx, s.by, s.sz, { scale: 0.75 + at * 0.4 });
          if (R.shakeAt) R.shakeAt(2 + at * 4, 0.35);
          F.sfx('rise');
        }
        // the shaft comes down from the top of the view, narrow, and thins away
        const topY = R.cam.y - 60 / R.cam.z, sh = F.env(p, 0, 0.06, 0.3, 0.56);
        if (sh > 0) F.column(g, cx, foot, foot - (foot - topY) * F.ease(p / 0.1), TL * (0.5 + s.sz * 0.3) * (1 - 0.5 * p), sh, 'pale');
        F.ring(g, cx, foot - 2, TL * (0.4 + s.sz * 0.9 * F.ease(p / 0.45)), 'pale', (1 - p) * 0.9, 2, 0.5);
        // the courses: a running bond across the works, or a stack (wide
        // at the foot, narrowing up) set down before the hall
        const rows = s.site ? [0, 1, 2].map(() => Math.max(2, s.sz * 2)) : [0, 1, 2].map(r => Math.max(1, Math.max(3, s.sz * 2) - r));
        const N = rows.reduce((a, n) => a + n, 0), sink = p < 0.84 ? 0 : (p - 0.84) / 0.16, M = this.ramp();
        let k = 0;
        for (let row = 0; row < rows.length; row++) for (let i = 0; i < rows[row]; i++, k++) {
          const st = 0.04 + (k / N) * 0.46, q = (p - st) / 0.14;
          if (q <= 0) continue;
          const n = rows[row];
          const bx = s.site ? cx - half * 0.85 + (i + 0.5 + (row % 2 ? 0.25 : 0)) / n * half * 1.7
            : cx + (i - (n - 1) / 2) * 12;
          const landY = foot - 2 - row * 10, y = q < 1 ? landY - TL * 4 * (1 - q * q) : landY;
          // at the end the courses settle INTO the works, a row at a time, never a fade
          if (sink > 0 && row >= Math.round((1 - sink) * rows.length)) continue;
          this.block(g, bx, y, k);
          // a landing throws chips of the stone: opaque, each one gone in its turn
          if (q >= 1 && q < 1.6) {
            const d = (q - 1) / 0.6;
            for (let m = 0; m < 4; m++) {
              if (d > 0.45 + m * 0.15) continue;
              const side = m < 2 ? -1 : 1, fly = 5 + d * 9 * (1 + (m & 1));
              g.fillStyle = M[m & 1 ? 2 : 4];
              g.fillRect(F.snap(bx + side * fly), F.snap(landY - 3 - d * 7 * (1 - d) * (1 + (m & 1)) + d * 3), 2, 2);
            }
          }
        }
      },
    },
    // the plaque: the price struck through to its new one, or what came back
    caption(g, s, p) {
      const F = GrowFX, gold = '#ffd45e', dim = '#9a8f7c', cream = '#efe4c8', RES = ['food', 'wood', 'stone', 'gold'];
      const backKeys = RES.filter(k => s.back && s.back[k] > 0);
      let title, rows;
      if (s.site && backKeys.length) {
        title = 'A QUARTER COMES BACK';
        const runs = backKeys.map(k => ({ t: '+' + s.back[k] + ' ' + k.toUpperCase(), col: gold }));
        rows = [runs.slice(0, 2), runs.slice(2)].filter(r => r.length).concat([[{ t: 'AND THE WORKS RISE TWICE AS FAST', col: cream }]]);
      } else if (s.site || !s.was) {
        title = 'AN AGE OF MARBLE';
        rows = [[{ t: 'YOUR WONDER RISES TWICE AS FAST', col: cream }]];
      } else {
        title = 'THE WONDER’S PRICE';
        const strike = F.step(Math.min(1, Math.max(0, (p - 0.36) / 0.12))), fresh = p > 0.5, hot = p > 0.5 && p < 0.56;
        const run = k => s.was[k] == null ? [] : [{ t: k.toUpperCase(), col: cream }, { t: String(s.was[k]), col: dim, strike },
          { t: String(s.now[k]), col: !fresh ? 'rgba(0,0,0,0)' : hot ? '#fff3cf' : gold }];
        rows = [run('food').concat(run('wood')), run('stone').concat(run('gold')), [{ t: 'AND IT WILL RISE TWICE AS FAST', col: cream }]];
      }
      F.plaque(g, s, title, rows, p, 0.2, 0.98);
    },
  },

  /* ENLIGHTENMENT — Wonder's Foundation: the player's Wonder gains 35% of
     its work — now if its site stands, or the moment it is laid (a charge
     in S.deck.charges, consumed where Bld.place breaks the ground —
     Deck.onWonderLaid) — and never past 95%: the works stop with 5% still
     to raise, so no card ever lays the last stone (rule 4; finishing it is
     G.wonderRaised, the run's ending). "Its work" is measured the way its
     progress bar measures it (Bld.stageOf: the monument's own 45 days). A
     site already at 95% has nothing to gain and the card is refused; one
     foundation may wait for a Wonder not yet laid, never two. */
  wonders_foundation: {
    at: 'tc', GAIN: 0.35, CAP: 0.95,
    /* a foundation WAITING for a Wonder not yet laid is a running card: it
       wears a chip on the strip (DeckUI._timers) until the ground is broken
       and it is laid — kept under 'foundation', which the strip maps back to
       this card. Without it the charge ran unseen and uncounted. */
    chargeKey: 'foundation',
    chip(n) {
      n = n | 0;
      return n > 0 ? { label: '×' + n, frac: 1, words: n + (n === 1 ? ' foundation' : ' foundations') } : null;
    },
    // the card lands ON the works when they stand (DeckUI._dest), brought to
    // the middle of the view first (GrowFX.frame); else on the hall
    dest() { const w = GrowFX.wonderSite(); if (w) GrowFX.frame(w.x, w.y); return w; },
    work() { return CFG.BUILDINGS.wonder.levels[0].time; },
    floor() { return (1 - this.CAP) * this.work(); },
    // `look`: laid by the ground breaking (Bld.place), not by a card the play
    // sequence already carried to the works — bring them to the middle of the
    // view, and since no card is landing to say what happened, say it in a note
    lay(w, look) {
      const before = w.construction, from = Bld.stageOf(w);
      w.construction = Math.max(Math.min(before, this.floor()), before - this.GAIN * this.work());
      const days = Math.round(before - w.construction), pct = Math.round((1 - w.construction / this.work()) * 100);
      // the site holds the stage it showed until the pillar lands, then rises
      // through each stage it gained (show.held — render data, never in S)
      const at = { x: Bld.cx(w), y: Bld.cy(w), foot: w.y + Bld.size(w), sz: Bld.size(w), bx: w.x, by: w.y,
        bid: w.id, from, to: Bld.stageOf(w), days, pct };
      if (look) GrowFX.frame(at.x, at.y);
      GrowFX.show('wonders_foundation', at);
      if (window.R && R.shakeAt) R.shakeAt(6, 1.6);
      GrowFX.sfx('foundation');
      const line = '🗿 The first stones were already here: your Wonder gains ' + days + ' days of work — ' + pct + '% raised.';
      if (look) G.log(line, 'note', 4600); else Deck.say(line);
      return line;
    },
    can() {
      if (!UI.wonderOffered()) return { ok: false, why: 'The Wonder rises only in Calm worlds.' };
      const w = Deck.wonderOf('P'), ch = S.deck && S.deck.charges;
      if (w && !(w.construction > 0)) return { ok: false, why: 'Your Wonder already stands.' };
      if (w && w.construction <= this.floor() + 1e-9) return { ok: false, why: 'The works already stand at 95% — the last stones are yours to lay.' };
      if (!w && ch && ch.foundation) return { ok: false, why: 'A foundation already waits for your Wonder.' };
      return { ok: true };
    },
    apply() {
      const ok = this.can();
      if (!ok.ok) return ok;
      const w = Deck.wonderOf('P');
      if (w) { const msg = this.lay(w); return { ok: true, x: Bld.cx(w), y: Bld.cy(w), msg }; }
      Deck.run().charges.foundation = 1;
      const tc = Bld.tcOf('P'), c = tc ? { x: Bld.cx(tc), y: Bld.cy(tc), foot: tc.y + Bld.size(tc) } : Object.assign(GrowFX.mid(), { foot: GrowFX.mid().y + 1 });
      GrowFX.show('wonders_foundation', { x: c.x, y: c.y, foot: c.foot, sz: 3, pending: 1, ms: 3200 });
      GrowFX.sfx('rise');
      Deck.say('🗿 The first stones wait under the grass: the moment you lay your Wonder, its first 35% stands.');
      return { ok: true, x: c.x, y: c.y, msg: '🗿 The first stones wait for your Wonder: lay it, and its first 35% stands.' };
    },
    // weathered stone, lit from the upper left: outline, shade, face, lit, crest
    STONE: ['#2e2a22', '#5f574a', '#7d7363', '#9a8f7a', '#b3a78f', '#ddd2b8'],
    /* a cup-and-ring carved in a face — the old people's sign, cut dark with
       a lit lower lip — and, `glow` > 0, gold light welling up out of the
       carving in the ramp's ink, laid opaque (an added gold over the stone
       went lime). `big` cuts a second ring. */
    carving(g, mx, my, big, glow) {
      const F = GrowFX, cut = [[mx, my]];
      for (const rr of big ? [4, 8] : [4]) {
        const nd = rr > 4 ? 14 : 8;
        for (let k = 0; k < nd; k++) {
          const th = k / nd * Math.PI * 2;
          cut.push([F.snap(mx + Math.cos(th) * rr), F.snap(my + Math.sin(th) * rr * 0.9)]);
        }
      }
      g.fillStyle = '#3a3429';
      for (const [x, y] of cut) g.fillRect(x, y, 2, 2);
      g.fillStyle = '#a99d85';
      for (const [x, y] of cut) g.fillRect(x, y + 2, 2, 1);
      const ink = glow > 0 && R.goldInk(glow);
      if (ink) {
        g.fillStyle = ink;
        for (const [x, y] of cut) g.fillRect(x, y, 2, 2);
        const hot = R.goldInk(Math.min(1, glow + 0.4));
        if (hot) { g.fillStyle = hot; g.fillRect(mx, my, 2, 2); }
      }
    },
    /* one standing stone, its foot at (gx, gy), risen `q` of its height `bh`:
       its own lean, mossed and chipped, a crack down the face and, on a face
       big enough, the carving */
    standing(g, gx, gy, bw, bh, q, seed, glow) {
      const F = GrowFX, S2 = this.STONE;
      const hh = F.hash(seed, 3), top = F.snap(gy - bh * q), lean = F.snap((hh - 0.5) * 6 * q), L = gx - bw / 2;
      if (gy - top < 4) return;
      g.fillStyle = S2[0];
      g.fillRect(L - 2, top + 4, bw + 4, gy - top - 2);
      g.fillRect(L + lean, top - 2, bw - 4, 8);
      g.fillStyle = S2[2]; g.fillRect(L, top + 4, bw, gy - top - 4);
      g.fillStyle = S2[3]; g.fillRect(L, top + 4, F.snap(bw * 0.45), gy - top - 4);
      g.fillStyle = S2[1]; g.fillRect(L + bw - 4, top + 6, 4, gy - top - 6);
      g.fillStyle = S2[4]; g.fillRect(L + lean + 2, top, bw - 8, 4);
      g.fillStyle = '#c9bea6'; g.fillRect(L + lean + 2, top, F.snap((bw - 8) * 0.5), 2);
      g.fillStyle = '#4a4336';
      for (let c = 0, cy0 = top + 8; c < 3 && cy0 < gy - 6; c++, cy0 += 6) g.fillRect(L + F.snap(bw * (0.35 + F.hash(seed + c, 7) * 0.3)), cy0, 2, 4);
      g.fillStyle = '#5f7a3a';
      for (let m = 0; m < 4; m++) g.fillRect(F.snap(L + F.hash(seed * 3 + m, 11) * (bw - 2)), F.snap(gy - 4 - F.hash(seed, m + 13) * (gy - top) * 0.45), 2, 2);
      g.fillStyle = '#b8ad95'; g.fillRect(L, top + 6, 2, F.snap((gy - top - 6) * 0.7));
      g.fillStyle = S2[5]; g.fillRect(L + lean + 2, top, 2, 2);
      const fh = gy - top - 6;
      if (fh >= 14 && bw >= 12) this.carving(g, F.snap(L + bw * 0.46), F.snap(top + 6 + fh * 0.4), bw >= 18 && fh >= 24, glow);
    },
    /* one foundation slab, its tile at (x, y) world px, `w` wide, lifted
       `lift` px out of the grass: a weathered top with its joints, the cut
       front edge showing as it rises, moss in the cracks */
    slab(g, x, y, w, lift, seed, glow, carved) {
      const F = GrowFX, S2 = this.STONE, L = F.snap(x), T = F.snap(y - lift), W = F.snap(w), H = F.snap(w * 0.86);
      g.fillStyle = S2[0]; g.fillRect(L - 2, T - 2, W + 4, H + 4 + lift);
      g.fillStyle = S2[3]; g.fillRect(L, T, W, H);
      g.fillStyle = S2[4]; g.fillRect(L, T, W, 2); g.fillRect(L, T, 2, H);
      g.fillStyle = S2[2]; g.fillRect(L + W - 2, T + 2, 2, H - 2); g.fillRect(L + 2, T + H - 2, W - 2, 2);
      if (lift > 1) { g.fillStyle = S2[1]; g.fillRect(L, T + H, W, F.snap(lift)); }
      g.fillStyle = S2[1];
      for (let k = 0; k < 3; k++) g.fillRect(F.snap(L + 4 + F.hash(seed, k) * (W - 10)), F.snap(T + 4 + F.hash(k, seed) * (H - 10)), 2 + 2 * (k % 2), 2);
      g.fillStyle = '#5f7a3a';
      for (let m = 0; m < 3; m++) g.fillRect(F.snap(L + F.hash(seed + m, 21) * (W - 2)), F.snap(T + H - 4 - F.hash(m, seed + 21) * 6), 2, 2);
      if (carved) this.carving(g, F.snap(L + W / 2 - 1), F.snap(T + H / 2 - 1), W >= 26, glow);
    },
    // where the ring of old stones stands round the works: a circle clear of
    // the footprint's corners, the first stone due north, clockwise
    RING: 12,
    ringAt(s, i) {
      const TL = CFG.TILE, th = -Math.PI / 2 + i / this.RING * Math.PI * 2, rr = TL * (s.sz * 0.5 * 1.42 + 0.35);
      return { x: s.x * TL + Math.cos(th) * rr, y: (s.foot - s.sz / 2) * TL + Math.sin(th) * rr * 0.92 };
    },
    /* the ground gives up its old stones: gold light breaks along the works'
       outline and runs in from the ring, the earth shakes, a ring of
       weathered standing stones rises out of it AROUND the works — in the
       ground pass, so the works stand over the ones behind them — a pillar
       of light stands up out of the middle, the site rises through the
       stages it gained under it (show.held), the old signs on the stones
       light gold, and the stones settle back into the earth. The act says
       what it did on its own plaque. Waiting for a Wonder not yet laid, the
       3×3 of its foundation surfaces briefly before the hall, its carving
       lit, and goes back under the grass: the first stones wait. */
    show: {
      ms: 5200, layers: ['ground', 'world', 'sky'],
      RISE: 0.38, STEP: 0.07,
      held(s, p) {
        if (s.pending || s.bid == null || s.from == null || s.to == null || s.to <= s.from) return null;
        const shown = p < this.show.RISE ? s.from : Math.min(s.to, s.from + 1 + Math.floor((p - this.show.RISE) / this.show.STEP));
        return shown < s.to ? new Map([[s.bid, { stage: shown }]]) : null;
      },
      draw(g, s, p, dt, layer) {
        const F = GrowFX, D = Deck.FX.wonders_foundation, TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL;
        if (layer === 'sky') {
          const cream = '#efe4c8', gold = '#ffd45e';
          if (s.pending) {
            F.plaque(g, s, 'THE FIRST STONES WAIT', [[{ t: 'FOR YOUR WONDER', col: cream }], [{ t: 'LAY IT, AND ITS FIRST 35% STANDS', col: gold }]], p, 0.12, 0.98);
            return;
          }
          const e = F.env(p, 0.2, 0.32, 0.62, 0.95);
          if (e > 0) {
            const sc = F.toScreen(s.x, s.foot);
            F.rays(g, Math.max(0, Math.min(R.cv.width, sc.x)), -R.cv.height * 0.04, 13, 0.18, 'gold', 0.75 * e, s.t);
            F.glitter(g, 40, 'gold', e, s.t);
          }
          if (s.days != null) F.plaque(g, s, 'THE FIRST STONES WERE HERE',
            [[{ t: '+' + s.days + ' DAYS OF WORK', col: gold }], [{ t: 'YOUR WONDER STANDS ' + s.pct + '% RAISED', col: cream }]], p, 0.36, 0.98);
          return;
        }
        if (s.pending) {
          if (layer !== 'ground') return;
          /* the Wonder's 3×3 foundation surfaces before the hall — the slabs
             lift out of the grass in turn, the carving on the middle one
             lights, and they go back under it: a rise and a fall in hard
             steps, never a fade */
          const n = 3, x0 = cx - n * TL / 2, y0 = foot + TL * 0.25;
          for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
            const k = tx + ty * n, up = F.ease((p - 0.05 - k * 0.025) / 0.2), down = p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78 - (8 - k) * 0.012) / 0.12);
            const q = Math.min(up, down);
            if (q <= 0.05) continue;
            const glow = k === 4 ? F.step(F.env(p, 0.3, 0.38, 0.7, 0.82)) : 0;
            D.slab(g, x0 + tx * TL + TL * 0.04, y0 + ty * TL * 0.86 + TL * 0.04, TL * 0.92, F.snap(6 * q), k * 7 + 3, glow, k === 4);
          }
          if (p < 0.3) for (let m = 0; m < 10; m++) {
            const h = F.hash(m, 41), kk = F.ease(p / 0.3);
            F.mote(g, x0 + h * n * TL, y0 + F.hash(41, m) * n * TL * 0.86 - kk * 10, m % 2 ? '#6e5638' : '#8a6e46', null, 1 - kk);
          }
          return;
        }
        const n = s.sz, x0 = cx - n * TL / 2, y0 = foot - n * TL, mid = foot - n * TL / 2;
        if (layer === 'ground') {
          // 1. light breaking along the works' outline, just outside it, and
          // running in from the ring along the cracks — in the ramp's ink,
          // laid opaque (gold added over the earth went lime)
          const cr = F.env(p, 0, 0.1, 0.55, 0.8);
          if (cr > 0) {
            g.save();
            if (R.inkOn(g, 0.8 * cr)) {
              for (let d = -4; d < n * TL + 4; d += 4) {
                g.fillRect(F.snap(x0 + d), F.snap(y0) - 4, 2, 2); g.fillRect(F.snap(x0 + d), F.snap(foot) + 2, 2, 2);
                g.fillRect(F.snap(x0) - 4, F.snap(y0 + d), 2, 2); g.fillRect(F.snap(x0 + n * TL) + 2, F.snap(y0 + d), 2, 2);
              }
            }
            for (let c = 0; c < D.RING; c++) {
              const r0 = D.ringAt(s, c), len = Math.min(1, cr * 1.4);
              let x = r0.x, y = r0.y;
              for (let st = 0; st < 10 * len; st++) {
                x += (cx - x) * 0.09 + (F.hash(c, st) - 0.5) * 6;
                y += (mid - y) * 0.09 + (F.hash(st, c) - 0.5) * 6;
                const ink = R.goldInk(st % 3 ? 0.7 * cr : cr);
                if (ink) { g.fillStyle = ink; g.fillRect(F.snap(x), F.snap(y), 2, 2); }
              }
            }
            g.restore();
          }
          // 2. the ring of old stones rises AROUND the works, in turn from the
          // north, clockwise — each its own height and lean — sheds the earth
          // it slept under, lights its old sign while the pillar stands, and
          // settles back into the earth at the end (a sink, never a fade)
          if (p >= 0.16 && !s.dust) {
            s.dust = 1;
            if (R.startPlacePoof) { R.startPlacePoof(s.bx, s.by, n); R.startPlacePoof(s.bx, s.by, n, { delay: 420, scale: 0.8 }); }
          }
          const sink = p < 0.8 ? 1 : Math.max(0, 1 - (p - 0.8) / 0.16);
          const order = [];
          for (let i = 0; i < D.RING; i++) order.push(i);
          // the ones further back first, so a nearer stone overlaps a farther one
          order.sort((a, z) => D.ringAt(s, a).y - D.ringAt(s, z).y);
          for (const i of order) {
            const at = D.ringAt(s, i), q = F.ease((p - 0.16 - i * 0.022) / 0.26) * sink;
            if (q <= 0.04) continue;
            const hw = F.hash(i * 11 + 5, 2), hh = F.hash(i * 7 + 3, 9);
            const bw = F.snap(TL * (0.38 + hw * 0.18)), bh = TL * (0.6 + hh * 0.45);
            const glow = F.step(F.env(p, 0.3, 0.38, 0.74, 0.86));
            D.standing(g, F.snap(at.x), F.snap(at.y), bw, bh, q, i * 13 + 1, glow);
            if (q < 1 && p < 0.8) for (let m = 0; m < 4; m++)   // earth falling off the rising stone
              F.mote(g, at.x + (F.hash(m, i * 5) - 0.5) * bw, at.y - bh * q + q * 10 * (m + 1), m % 2 ? '#6e5638' : '#8a6e46', null, 1 - q);
          }
          return;
        }
        // 3. the pillar out of the middle, and rings of dots across the ground
        const pl = F.env(p, 0.28, 0.36, 0.7, 0.9);
        if (pl > 0) {
          const topY = R.cam.y - 60 / R.cam.z;
          F.column(g, cx, mid, mid - (mid - topY) * F.ease((p - 0.28) / 0.1), TL * 1.8 * pl, pl);
          for (let k = 0; k < 3; k++) {
            const q = (p * 2 + k / 3) % 1;
            F.ring(g, cx, mid, TL * (1 + q * 4), 'gold', (1 - q) * 0.9 * pl, 2, 0.6, F.viewPx(2));
          }
        }
        // (the pillar's landing is the blow: no whole-frame flash, which over
        // the meadow is a sepia frame)
        // 4. gold rising off the works as they rise
        if (p > 0.4) for (let m = 0; m < 14; m++) {
          const h = F.hash(m, 77), k = ((p - 0.4) / 0.6 + h) % 1;
          F.mote(g, x0 + (0.1 + h * 0.8) * n * TL, foot - TL * 0.4 - k * TL * 2.2, m % 2 ? '#ffd45e' : '#fff1b8', '#7a4a0a', (1 - k) * Math.min(1, (1 - p) * 2.2));
        }
      },
    },
  },
});

/* every growth show and running look is drawn inside the board (GrowFX.clipped) */
for (const id of ['harvest_festival', 'bountiful_land', 'golden_age', 'quick_hands', 'blight', 'enlightenment', 'age_of_marble', 'wonders_foundation']) {
  const d = Deck.FX[id];
  if (d.show) {
    const sh = d.show, draw = sh.draw;
    sh.draw = function (g, s, p, dt, layer) {
      return GrowFX.clipped(g, layer || sh.layer || 'world', () => draw.call(this, g, s, p, dt, layer));
    };
  }
  if (d.drawLive) {
    const live = d.drawLive;
    d.drawLive = function (g, e, dt) { return GrowFX.clipped(g, 'world', () => live.call(this, g, e, dt)); };
  }
  if (d.drawGround) {
    const gr = d.drawGround;
    d.drawGround = function (g, e, dt) { return GrowFX.clipped(g, 'world', () => gr.call(this, g, e, dt)); };
  }
  if (d.drawBld) {
    const on = d.drawBld;
    d.drawBld = function (g, b, e) { return GrowFX.clipped(g, 'world', () => on.call(this, g, b, e)); };
  }
}

/* ---------------- THE VOICES (js/audio.js's one door: synthesized, never a file) ---------------- */
if (typeof Sound !== 'undefined' && Sound._VOICES) {
  Object.assign(Sound._VOICES, {
    // a reed pipe's tune over a shaker: the festival's dance
    festival(t, v) {
      [523, 659, 784, 880, 1047].forEach((hz, i) =>
        this._note({ at: t, delay: i * 0.085, hz, dur: 0.24, type: 'triangle', gain: 0.075 * v, lp: 2600 }));
      [0, 0.17, 0.34].forEach(d => this._noise({ at: t, delay: d, hz: 5200, dur: 0.06, q: 1.2, gain: 0.05 * v, filter: 'highpass' }));
    },
    // the land breathing out: a rising glide under a soft swell, two bells
    bloom(t, v) {
      this._note({ at: t, hz: 330, to: 660, dur: 0.9, type: 'sine', gain: 0.10 * v, atk: 0.3 });
      this._noise({ at: t, hz: 900, to: 2400, dur: 1.0, q: 0.6, gain: 0.05 * v, atk: 0.4 });
      [784, 988].forEach((hz, i) => this._note({ at: t, delay: 0.45 + i * 0.12, hz, dur: 0.6, type: 'sine', gain: 0.07 * v }));
    },
    // three quick hammer blows, each a little higher
    quickhands(t, v) {
      [0, 0.085, 0.17].forEach((d, i) => {
        this._noise({ at: t, delay: d, hz: 600 + i * 160, to: 240, dur: 0.08, q: 1.4, gain: 0.15 * v });
        this._note({ at: t, delay: d, hz: 230 + i * 50, to: 170, dur: 0.07, type: 'square', gain: 0.04 * v, lp: 900 });
      });
    },
    // a major chord swelling up like a sunrise, a shimmer of high notes over it
    goldenage(t, v) {
      // a low root under it all — the dawn is Imperial, it should be felt
      this._note({ at: t, hz: 65.4, dur: 2.8, type: 'sine', gain: 0.14 * v, atk: 0.35, lp: 900 });
      this._note({ at: t, delay: 0.04, hz: 98, dur: 2.6, type: 'triangle', gain: 0.06 * v, atk: 0.4, lp: 1200 });
      [262, 330, 392, 523].forEach((hz, i) => this._note({ at: t, delay: i * 0.05, hz, dur: 2.2, type: 'sine', gain: 0.085 * v, atk: 0.45 }));
      [1047, 1319, 1568, 2093].forEach((hz, i) => this._note({ at: t, delay: 0.5 + i * 0.11, hz, dur: 0.7, type: 'triangle', gain: 0.035 * v }));
    },
    // a sour drone a semitone wide, and the murk's breath over it
    blight(t, v) {
      this._note({ at: t, hz: 110, dur: 2.0, type: 'sawtooth', gain: 0.07 * v, lp: 380, atk: 0.4 });
      this._note({ at: t, hz: 116.5, dur: 2.0, type: 'sawtooth', gain: 0.06 * v, lp: 360, atk: 0.5 });
      this._noise({ at: t, hz: 300, to: 900, dur: 1.8, q: 0.5, gain: 0.08 * v, atk: 0.6, filter: 'lowpass', rate: 0.6 });
    },
    // THE DEEP CHORD: the whole town waking — a low C under its fifth and
    // third, the ground's rumble as the pillar lands, bells climbing over it
    enlighten(t, v) {
      [65.4, 98, 130.8, 164.8, 196].forEach((hz, i) =>
        this._note({ at: t, delay: i * 0.06, hz, dur: 3.4, type: i < 2 ? 'sine' : 'triangle', gain: (i < 2 ? 0.16 : 0.07) * v, atk: 0.5, lp: 1800 }));
      this._noise({ at: t, hz: 160, to: 50, dur: 1.6, q: 0.7, gain: 0.16 * v, filter: 'lowpass', atk: 0.12, rate: 0.5 });
      [523, 659, 784, 1047, 1319].forEach((hz, i) => this._note({ at: t, delay: 0.7 + i * 0.16, hz, dur: 1.2, type: 'sine', gain: 0.05 * v }));
    },
    // one small bell: a building rising in its flash
    rise(t, v) {
      this._note({ at: t, hz: 1047, dur: 0.5, type: 'sine', gain: 0.045 * v });
      this._note({ at: t, delay: 0.03, hz: 1568, dur: 0.4, type: 'sine', gain: 0.025 * v });
    },
    // stone set on stone, three times, then a bright bell chord
    marble(t, v) {
      [0, 0.16, 0.3].forEach((d, i) => this._noise({ at: t, delay: d, hz: 1300 - i * 200, to: 500, dur: 0.12, q: 1.8, gain: 0.13 * v }));
      [659, 988, 1319].forEach((hz, i) => this._note({ at: t, delay: 0.42 + i * 0.07, hz, dur: 1.1, type: 'sine', gain: 0.07 * v }));
    },
    // the earth groaning open, a low tone under it, and the old chord rising
    foundation(t, v) {
      this._noise({ at: t, hz: 180, to: 45, dur: 2.4, q: 0.8, gain: 0.26 * v, filter: 'lowpass', atk: 0.2, rate: 0.45 });
      this._note({ at: t, hz: 55, to: 41, dur: 2.2, type: 'sine', gain: 0.22 * v, atk: 0.3 });
      [131, 196, 262, 330].forEach((hz, i) => this._note({ at: t, delay: 0.9 + i * 0.08, hz, dur: 2.2, type: 'triangle', gain: 0.06 * v, atk: 0.4, lp: 1600 }));
    },
  });
  // one-off voices are gated to one at a time; the buildings' bells in a run
  Object.assign(Sound.GAP, { festival: 1, bloom: 1, quickhands: 0.6, goldenage: 1.5, blight: 1.5,
    enlighten: 2, rise: 0.09, marble: 1, foundation: 2 });
}
