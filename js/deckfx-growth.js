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
      upgrade, the masons' village-wide wall works (tc.wallUp) and a span's
      reinforcing (br.upgrading) — every clock the game calls an upgrade.
      Never repair (mending is not building), never a sapper's earthworks,
      never the training yards. And still only the builders' own work: no
      card finishes anything by itself.
   4. NO CARD LAYS THE LAST STONE. Finishing the Wonder is the run's ending
      (Bld.finish → G.wonderRaised); Wonder's Foundation stops at 95% and
      the Age of Marble only speeds the hands that raise it.
   5. A CARD'S GIFT SCORES NOTHING: Enlightenment's levels are raised with
      Bld.finishUpgrade's `byCard` (no "upgrade finished", no reveal of its
      own — the taller building's sight opens the ground as any building's
      does), the festival's extra wood is not "gathered".
   6. BLIGHT IS DENIABLE AND FOG-HONEST. It deals no blow, so it leaves the
      Calm truce standing and asks nothing of Combat.hostile; its look is
      drawn ONLY on the rival's works the player can see right now
      (G.visibleAt), and its pall rolls toward the rival as the player knows
      them — their hall if it is remembered, else the far side of the world
      from the player's own seat — so the card is never a lamp in the fog.

   Every show is render state (R.cardShows, never in S); a run with no card
   in play pays nothing for any of it (R.draw's length checks). The looks
   speak the house style: hard pixels on a 2px grid, alpha in hard steps,
   light ADDED ('lighter') where it is light, rings made of dots. */

/* ---------------- the pixel toolkit the growth cards draw with ---------------- */
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
  // a ring made OF dots (never a stroked arc), culled to `vp`; squash < 1 lays it on the ground
  ring(g, cx, cy, rad, col, a, px, squash, vp, spin) {
    a = this.step(a);
    if (a <= 0 || rad < 1) return;
    px = px || 2; squash = squash || 1;
    const n = Math.max(12, Math.min(360, Math.round(rad * 2 * Math.PI / (px * 3))));
    g.fillStyle = col; g.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const th = (i + (spin || 0)) / n * Math.PI * 2, x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad * squash;
      if (vp && (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1)) continue;
      g.fillRect(this.snap(x, px), this.snap(y, px), px, px);
    }
    g.globalAlpha = 1;
  },
  // a lit grain with a dark underside (the motes' language: it reads on grass)
  mote(g, x, y, col, dark, a) {
    a = this.step(a);
    if (a <= 0) return;
    const sx = this.snap(x), sy = this.snap(y);
    if (dark) { g.globalAlpha = a * 0.6; g.fillStyle = dark; g.fillRect(sx, sy + 2, 2, 1); }
    g.globalAlpha = a; g.fillStyle = col; g.fillRect(sx, sy, 2, 2);
    g.globalAlpha = 1;
  },
  // a pale cross, one cell each way: something catching the light
  glint(g, x, y, col, a, px) {
    a = this.step(a);
    if (a <= 0) return;
    px = px || 2;
    const sx = this.snap(x, px), sy = this.snap(y, px);
    g.globalAlpha = a; g.fillStyle = col;
    g.fillRect(sx, sy, px, px);
    g.fillRect(sx - px, sy, px, px); g.fillRect(sx + px, sy, px, px);
    g.fillRect(sx, sy - px, px, px); g.fillRect(sx, sy + px, px, px);
    g.globalAlpha = 1;
  },
  // a column of light standing on (x, foot): three stepped widths, light ADDED
  column(g, x, foot, top, w, a, pal) {
    a = this.step(a);
    if (a <= 0 || foot - top < 2 || w < 2) return;
    pal = pal || ['255,190,80', '255,222,130', '255,251,232'];
    const h = this.snap(foot - top);
    const parts = [[1, 0.24], [0.55, 0.4], [0.18, 0.85]];
    for (let i = 0; i < 3; i++) {
      const ww = Math.max(2, this.snap(w * parts[i][0]));
      g.fillStyle = 'rgba(' + pal[i] + ',' + (parts[i][1] * a).toFixed(3) + ')';
      g.fillRect(this.snap(x - ww / 2), this.snap(top), ww, h);
    }
  },
  // a building's own silhouette flashed in light, ADDED to the scene
  flashBld(g, b, col, a) {
    a = this.step(a);
    if (a <= 0 || !b) return;
    const spr = R.bldSprite(b);
    if (!spr || !(spr.width > 0)) return;
    const TL = CFG.TILE, sz = Bld.size(b);
    g.save();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
    R.blitBld(g, R.tintOf(spr, col), b.x * TL, b.y * TL, sz * TL, sz * TL);
    g.restore();
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
  // the sky lit from above: n flat bands, each a little fainter — never a gradient
  skyBands(g, col, a0, n, frac) {
    const W = R.cv.width, H = R.cv.height, bh = Math.max(2, Math.round(H * frac / n));
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = a0 * (1 - i / n);
      if (a <= 0.004) continue;
      g.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      g.fillRect(0, i * bh, W, bh);
    }
    g.restore();
  },
  // rays of light as rows of dots fanning down from (ox, oy), device px
  rays(g, ox, oy, n, spread, col, a, t) {
    const W = R.cv.width, H = R.cv.height, px = Math.max(2, Math.round(2 * (R.dpr || 1))), stepL = px * 6, L = H * 1.15;
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = col;
    for (let r = 0; r < n; r++) {
      const th = Math.PI / 2 + (r - (n - 1) / 2) * spread + Math.sin(t * 0.8 + r * 1.7) * 0.012;
      const ux = Math.cos(th), uy = Math.sin(th), ar = a * (r % 2 ? 0.55 : 1);
      for (let d = stepL; d < L; d += stepL) {
        const x = ox + ux * d, y = oy + uy * d;
        if (x < 0 || x > W || y < 0 || y > H) continue;
        const al = this.step(ar * (1 - d / L));
        if (al <= 0) break;
        g.globalAlpha = al;
        g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, px, px);
      }
    }
    g.restore();
  },
  // stars of light twinkling across the upper sky (device px)
  glitter(g, n, col, a, t) {
    const W = R.cv.width, H = R.cv.height, px = Math.max(2, Math.round(2 * (R.dpr || 1)));
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const tw = (Math.sin(t * (2 + this.hash(i, 5) * 3) + i * 2.3) + 1) / 2;
      if (tw < 0.55) continue;
      this.glint(g, this.hash(i, 1) * W, this.hash(i, 2) * H * 0.62, col, a * (tw - 0.45) * 1.8, px);
    }
    g.restore();
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
  // this for the hall; a card whose work is elsewhere does it for that work)
  look(x, y) { if (window.R && R.onScreen && !R.onScreen(x, y)) R.centerOn(x, y); },
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
    F.lay(b);
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
     hall's own gold, with the panel's work line; the rival's work never. */
  harvest_festival: {
    at: 'bar', cue: 'motes',
    mult: { gather: 1.4, produce: 1.4 },
    can() { return { ok: true }; },
    apply() {
      const days = Deck.card('harvest_festival').days, was = !!Deck.timed('harvest_festival');
      const e = Deck.addTimed('harvest_festival', days);
      Deck.say(was ? '🌾 The Harvest Festival runs on — ' + days + ' more days of richer work.'
        : '🌾 The Harvest Festival begins: everything your people gather or produce comes in 40% richer for ' + days + ' days.');
      GrowFX.show('harvest_festival', { spots: this.spots() });
      GrowFX.sfx('festival');
      return { ok: true, until: e.until };
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
          g.save(); g.globalCompositeOperation = 'lighter';
          F.ring(g, cx, foot, TL * (0.25 + sp.sz * 0.8 * F.ease(q / 0.7)), '#f0b050', (1 - q) * 0.9, 2, 0.5);
          g.restore();
          for (let k = 0; k < 10; k++) {
            const h1 = F.hash(i * 31 + k, 7), h2 = F.hash(k, i * 13 + 3);
            const a = -Math.PI / 2 + (h1 - 0.5) * 1.6, v = TL * (2.2 + h2 * 1.4), t = q * 1.15;
            const x = cx + Math.cos(a) * v * t, y = foot - TL * 0.4 * sp.sz + Math.sin(a) * v * t + 0.5 * TL * 5.2 * t * t;
            F.mote(g, x, y, k % 3 ? '#ffcc40' : '#fff1b8', '#7a4a0a', q < 0.7 ? 1 : (1 - q) / 0.3);
          }
          if (q > 0.08 && q < 0.4) F.glint(g, cx, foot - TL * (0.5 + sp.sz * 0.5), '#fff8d6', 1 - Math.abs(q - 0.24) / 0.16);
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
      return { ok: true, x: c.x, y: c.y, until: e.until };
    },
    end() { G.log('🌱 The bounty near the fire fades — the land gives its ordinary yield again.'); },
    // ground a sprig may stand on: open meadow, spent soil, a felled stand
    OPEN: (() => { const o = {}; o[T.GRASS] = 1; o[T.BARREN] = 1; o[T.STUMPS] = 1; return o; })(),
    BLOOM: ['#f4efe0', '#dcc4ec', '#f2c8d0'],
    // one sprig at its foot (world px), grown `k` of the way: a dark foot so
    // it stands ON the ground, a stem, two leaves, and now and then a blossom
    // (never gold, fire or berry — the ground may not speak the resource language)
    /* three kinds of new growth, chosen by the spot's own hash: a TUFT of
       young blades (the most of it, swaying in the breeze), a leafy SPRIG,
       and now and then a FLOWER — a cross of petals round a pale eye. The
       greens are a step brighter and more saturated than the meadow's, so
       the ring reads as lusher ground, not as more of the same grass. */
    sprig(g, x, y, h, k, t) {
      if (k <= 0.05) return;
      const F = GrowFX, sx = F.snap(x), sy = F.snap(y), kind = (h * 7.3) % 1;
      const sway = Math.sin(t * 1.6 + h * 40) > 0.4 ? 2 : 0;
      g.globalAlpha = F.step(Math.min(1, k * 1.5));
      g.fillStyle = '#2e4a1e'; g.fillRect(sx - 2, sy, 6, 2);   // its foot in the ground
      if (kind < 0.55) {
        // the tuft: three blades, the middle tallest, the tips leaning with the wind
        const hh = Math.max(2, F.snap((4 + ((h * 97) % 1) * 5) * k));
        g.fillStyle = '#4f8a32';
        g.fillRect(sx - 2, sy - F.snap(hh * 0.6), 2, F.snap(hh * 0.6));
        g.fillRect(sx + 2, sy - F.snap(hh * 0.7), 2, F.snap(hh * 0.7));
        g.fillStyle = '#6fbc42'; g.fillRect(sx, sy - hh, 2, hh);
        if (k > 0.5) { g.fillStyle = '#b4ea78'; g.fillRect(sx + sway, sy - hh - 2, 2, 2); }
      } else if (kind < 0.85) {
        const hh = Math.max(2, F.snap((5 + ((h * 97) % 1) * 6) * k));
        g.fillStyle = '#4f8a32'; g.fillRect(sx, sy - hh, 2, hh);
        if (k > 0.45) {
          g.fillStyle = '#86d052';
          g.fillRect(sx - 2, sy - F.snap(hh * 0.55), 2, 2);
          g.fillRect(sx + 2, sy - F.snap(hh * 0.8), 2, 2);
          g.fillStyle = '#b4ea78'; g.fillRect(sx - 4, sy - F.snap(hh * 0.55) - 2, 2, 2);
        }
      } else {
        // the flower: a stem, then the petals open once it has grown
        const hh = Math.max(2, F.snap(6 * k));
        g.fillStyle = '#4f8a32'; g.fillRect(sx, sy - hh, 2, hh);
        if (k > 0.75) {
          const col = Math.sin(t * 2.1 + h * 60) > 0.95 ? '#ffffff' : this.BLOOM[(((h * 53) % 1) * 3) | 0];
          g.fillStyle = col;
          g.fillRect(sx - 2, sy - hh - 2, 2, 2); g.fillRect(sx + 2, sy - hh - 2, 2, 2);
          g.fillRect(sx, sy - hh - 4, 2, 2); g.fillRect(sx, sy - hh, 2, 2);
          g.fillStyle = '#fbf6e2'; g.fillRect(sx, sy - hh - 2, 2, 2);
        }
      }
      g.globalAlpha = 1;
    },
    /* the land wakes: a wave of green rolls out from the fire to the ring's
       edge with fresh shoots breaking out behind it (drawLive grows the
       sprigs in behind the front), and the edge flares gold and settles to
       the faint ring the card wears while it lasts */
    show: {
      ms: 2600, layer: 'world',
      draw(g, s, p) {
        const TL = CFG.TILE, F = GrowFX, cx = s.x * TL, cy = s.y * TL, Rp = this.R * TL, vp = F.viewPx(1);
        const rad = Rp * F.ease(p / 0.62);
        g.save(); g.globalCompositeOperation = 'lighter';
        if (p < 0.66) {
          F.ring(g, cx, cy, rad, '#b8f080', 0.95, 2, 1, vp);
          F.ring(g, cx, cy, Math.max(0, rad - 6), '#5fa83a', 0.7, 2, 1, vp);
          for (let k = 0; k < 120; k++) {
            const th = F.hash(k, 11) * Math.PI * 2, rr = rad - TL * (0.15 + F.hash(k, 23) * 1.3);
            if (rr <= 0) continue;
            const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
            if (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1) continue;
            g.globalAlpha = F.step(0.6 * (1 - (rad - rr) / (TL * 1.5)));
            g.fillStyle = k % 3 ? '#7cc850' : '#d8f0a0';
            g.fillRect(F.snap(x), F.snap(y), 2, 2);
          }
          g.globalAlpha = 1;
        }
        if (p > 0.5) {
          const k = (p - 0.5) / 0.5;
          F.ring(g, cx, cy, Rp, '#ffd45e', 0.95 - k * 0.6, 2, 1, vp);
          F.ring(g, cx, cy, Rp + 4, '#fff1b8', (1 - k) * 0.7, 2, 1, vp);
        }
        g.restore();
      },
    },
    // the ground within the ring visibly lush while the card runs: sprigs and
    // blossoms on open ground the player has seen, a faint gold ring of dots at the edge
    drawLive(g, e) {
      const c = this.centre();
      if (!c) return;
      const TL = CFG.TILE, F = GrowFX, v = F.view(1), Rr = this.R, fade = F.tail(e), t = performance.now() / 1000;
      const p = F.liveP('bountiful_land'), grow = p >= 0 ? Rr * F.ease(p / 0.62) : Rr;
      const x0 = Math.max(Math.floor(c.x - Rr), Math.floor(v.x0)), x1 = Math.min(Math.ceil(c.x + Rr), Math.ceil(v.x1));
      const y0 = Math.max(Math.floor(c.y - Rr), Math.floor(v.y0)), y1 = Math.min(Math.ceil(c.y + Rr), Math.ceil(v.y1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!MapGen.onBoard(x, y)) continue;
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        if (d > Rr || d > grow) continue;
        const i = MapGen.idx(x, y);
        if (!S.map.explored[i] || !this.OPEN[S.map.terrain[i]] || Bld.at(x, y)) continue;
        const k = Math.min(1, (grow - d) / 1.2) * fade;
        for (let j = 0; j < 3; j++) {
          const h = F.hash(x * 7 + j, y * 13 + 5);
          if (h > 0.46) continue;
          this.sprig(g, (x + 0.15 + F.hash(x, y * 3 + j) * 0.7) * TL, (y + 0.3 + F.hash(y, x * 5 + j) * 0.6) * TL, h / 0.46, k, t);
        }
      }
      if (p < 0 || p > 0.62) F.ring(g, c.x * TL, c.y * TL, Rr * TL, '#ffd45e', 0.4 * fade, 2, 1, F.viewPx(1), t * 0.6);
    },
  },

  /* IMPERIAL — Golden Age: for 20 days everything the player's people
     gather or produce comes in 50% richer (rule 1, as the festival) and
     everything they build rises 50% faster — construction AND upgrades,
     the masons' walls and a span's reinforcing (rule 3), the Wonder's works
     among them; never repair. Two cards multiply (rule 2). */
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
      if (window.R && R.flashAt) R.flashAt(0.3, 0.8, '255,224,150');
      GrowFX.sfx('goldenage');
      return { ok: true, x: c.x, y: c.y, until: e.until };
    },
    end() { G.log('☀️ The Golden Age passes — work and building go at their ordinary pace again.'); },
    /* a golden dawn: the sky lit from above in stepped bands with rays of
       dots, and over the town three rings of gold rolling out from the hall
       — every building the light reaches catches it, its own silhouette
       flashing gold with motes lifting off the roof (Imperial: big) */
    show: {
      ms: 3800, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX;
        if (layer === 'sky') {
          const e = F.env(p, 0, 0.18, 0.62, 1);
          if (e <= 0) return;
          F.skyBands(g, '255,206,96', 0.24 * e, 6, 0.5);
          F.rays(g, R.cv.width / 2, -R.cv.height * 0.12, 11, 0.14, '#ffe08a', 0.45 * e, s.t);
          F.glitter(g, 36, '#fff4c8', e, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, cy = s.y * TL, vp = F.viewPx(2), v = F.view(2), reach = s.reach || this.REACH;
        const run = q => Math.pow(Math.max(0, Math.min(1, q)), 0.85);   // the light keeps its pace across the town
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const q = (p - 0.04 - k * 0.08) / 0.76;
          if (q <= 0 || q >= 1) continue;
          F.ring(g, cx, cy, reach * TL * run(q), k ? '#ffcc40' : '#fff1b8', (1 - q * 0.7) * (k ? 0.65 : 1), 2, 1, vp);
        }
        if (p < 0.3) {
          const k = p / 0.3;
          F.column(g, cx, cy, cy - TL * 5 * Math.min(1, k * 3), TL * 1.5 * (1 - k * 0.7), 1 - k);
        }
        g.restore();
        const front = reach * run((p - 0.04) / 0.76);
        for (const b of S.buildings) {
          if (b.owner !== 'P' || !Bld.done(b)) continue;
          const bx = Bld.cx(b), by = Bld.cy(b);
          if (!F.inV(v, bx, by)) continue;
          const k = (front - Math.hypot(bx - s.x, by - s.y)) / 1.8;
          if (k <= 0 || k >= 1.6) continue;
          F.flashBld(g, b, '#ffe9a0', k < 1 ? 0.7 * (1 - k * 0.5) : 0.35 * (1.6 - k) / 0.6);
          const box = F.artBox(b);
          for (let m = 0; m < 6; m++) {
            const h = F.hash(b.id * 7 + m, 3);
            F.mote(g, box.x + box.w * (0.2 + h * 0.6), box.y + box.h * 0.25 - k * TL * (0.6 + h * 0.8),
              m % 2 ? '#ffd45e' : '#fff1b8', '#7a4a0a', 1 - k / 1.6);
          }
        }
      },
    },
    // while the age lasts, the town's roofs shed a slow gold (and every hand
    // at work wears the motes — cue 'motes', the festival's look)
    drawLive(g, e) {
      const TL = CFG.TILE, F = GrowFX, v = F.view(1), fade = F.tail(e), t = performance.now() / 1000;
      for (const b of S.buildings) {
        if (b.owner !== 'P' || !Bld.done(b) || b.key === 'wall' || b.key === 'gate') continue;
        if (!F.inV(v, Bld.cx(b), Bld.cy(b))) continue;
        let box = null;
        for (let m = 0; m < 2; m++) {
          const ph = (t * 0.3 + F.hash(b.id, m)) % 1;
          if (ph > 0.6) continue;
          box = box || F.artBox(b);
          const k = ph / 0.6, a = (k < 0.25 ? k / 0.25 : (1 - k) / 0.75) * fade;
          F.mote(g, box.x + box.w * (0.25 + F.hash(m, b.id) * 0.5), box.y + box.h * 0.3 - k * TL * 0.9, '#ffd45e', '#7a4a0a', a);
        }
      }
    },
  },

  /* STONE — Quick Hands: construction and upgrades go twice as fast for 6
     days (rule 3: sites, upgrades, the masons' wall works, a span's
     reinforcing; never repair, never a sapper's earthworks). Still the
     builders' own work — a site with nobody at it rises no faster. */
  quick_hands: {
    at: 'tc',
    mult: { build: 2 },
    can() { return { ok: true }; },
    apply() {
      const days = Deck.card('quick_hands').days, was = !!Deck.timed('quick_hands');
      const e = Deck.addTimed('quick_hands', days);
      Deck.say(was ? '🔨 Quick Hands keeps up the pace — ' + days + ' more days.'
        : '🔨 Quick Hands: construction and upgrades go twice as fast for ' + days + ' days.');
      GrowFX.show('quick_hands', { spots: this.works() });
      GrowFX.sfx('quickhands');
      return { ok: true, until: e.until };
    },
    end() { G.log('🔨 Quick Hands is spent — the works go at their ordinary pace again.'); },
    // the works the quicker hands reach, on screen now — or the hall
    works() {
      const v = GrowFX.view(1), out = [];
      for (const b of S.buildings) {
        if (out.length >= 24) break;
        if (b.owner !== 'P' || !(b.construction > 0 || b.upgrading > 0 || b.wallUp > 0)) continue;
        if (!GrowFX.inV(v, Bld.cx(b), Bld.cy(b))) continue;
        out.push({ x: Bld.cx(b), y: b.y + Bld.size(b), sz: Bld.size(b) });
      }
      for (const br of (S.bridges || []))
        if (out.length < 28 && br.owner === 'P' && br.upgrading > 0 && GrowFX.inV(v, br.x + 0.5, br.y + 0.5))
          out.push({ x: br.x + 0.5, y: br.y + 1, sz: 1 });
      if (!out.length) {
        const tc = Bld.tcOf('P');
        if (tc) out.push({ x: Bld.cx(tc), y: tc.y + Bld.size(tc), sz: Bld.size(tc) });
      }
      return out;
    },
    CHIP: ['#f0dcae', '#d2a868', '#a0703a'],
    // a burst of sawdust and hammer sparks off every works in view (Stone: modest, crisp)
    show: {
      ms: 1500, layer: 'world',
      draw(g, s, p) {
        const TL = CFG.TILE, F = GrowFX, vp = F.viewPx(1);
        for (let i = 0; i < s.spots.length; i++) {
          const sp = s.spots[i], d0 = (i % 8) * 0.04, q = (p - d0) / (1 - d0);
          if (q <= 0 || q >= 1) continue;
          const cx = sp.x * TL, foot = sp.y * TL - 2;
          if (cx < vp.x0 || cx > vp.x1 || foot < vp.y0 || foot > vp.y1 + TL) continue;
          g.save(); g.globalCompositeOperation = 'lighter';
          F.ring(g, cx, foot, TL * (0.3 + sp.sz * 0.7 * F.ease(q / 0.6)), '#e8e2d2', (1 - q) * 0.85, 2, 0.5);
          g.restore();
          const t = q * 1.0, top = foot - TL * 0.35 * sp.sz;
          for (let k = 0; k < 14; k++) {
            const h1 = F.hash(i * 17 + k, 5), h2 = F.hash(k * 3, i + 11);
            const a = -Math.PI / 2 + (h1 - 0.5) * 2.4, v = TL * (2.4 + h2 * 2);
            const x = cx + Math.cos(a) * v * t, y = top + Math.sin(a) * v * t + 0.5 * TL * 7 * t * t;
            const al = F.step(q < 0.75 ? 1 : (1 - q) / 0.25);
            if (al <= 0) continue;
            g.globalAlpha = al * 0.6; g.fillStyle = '#5e3e1e';
            g.fillRect(F.snap(x), F.snap(y) + 2, k % 4 ? 2 : 4, 1);
            g.globalAlpha = al; g.fillStyle = this.CHIP[k % 3];
            g.fillRect(F.snap(x), F.snap(y), k % 4 ? 2 : 4, 2);
          }
          g.globalAlpha = 1;
          for (let k = 0; k < 4; k++) {
            const h = F.hash(i, k + 70);
            F.mote(g, cx + (h - 0.5) * TL * sp.sz * 0.8, top - q * TL * (1.4 + h * 1.2), k % 2 ? '#ffcc40' : '#fff6c8', null, 1 - q * 1.5);
          }
        }
      },
    },
    // while it lasts, the hammers at every works on screen throw sparks twice as often
    drawLive(g) {
      const TL = CFG.TILE, F = GrowFX, v = F.view(1), t = performance.now() / 1000;
      for (const u of S.units) {
        if (u.owner !== 'P' || !u.task || !F.inV(v, u.x, u.y) || Units.moving(u)) continue;
        const tk = u.task;
        if (tk.type === 'build') {
          const b = Bld.get(tk.id);
          if (!b || !(b.construction > 0 || b.upgrading > 0)) continue;
        } else if (!(tk.type === 'terraform' && tk.job === 'bridgeup')) continue;
        const beat = t * 3.2 + (u.id * 0.37) % 1, ph = beat % 1;
        if (ph > 0.35) continue;
        const k = ph / 0.35, hx = u.x * TL + (u.id % 2 ? 5 : -5), hy = u.y * TL - CFG.SPRITE_LIFT - 2;
        for (let m = 0; m < 3; m++) {
          const a = -Math.PI / 2 + (F.hash(u.id + m, Math.floor(beat)) - 0.5) * 2.4;
          F.mote(g, hx + Math.cos(a) * k * 9, hy + Math.sin(a) * k * 9, m ? '#ffcc40' : '#fff6c8', null, 1 - k);
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
      GrowFX.show('blight', { dx: d.x, dy: d.y });
      // the light goes sour for a breath as the murk gathers
      if (window.R && R.flashAt) R.flashAt(0.3, 1.4, '44,52,30');
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
    // where the pall's leading edge stands at p, along the way it rolls (device px)
    frontAt(s, p) {
      const Wd = R.cv.width, Hd = R.cv.height, ux = s.dx, uy = s.dy;
      const pr = [0, ux * Wd, uy * Hd, ux * Wd + uy * Hd];
      const lo = Math.min.apply(null, pr), hi = Math.max.apply(null, pr), span = hi - lo, band = span * 0.8;
      return { front: lo - band * 0.05 + (span + band * 1.1) * Math.min(1, p / 0.86), band, span, ux, uy };
    },
    /* the pall: a sickly green-grey murk rolling across the screen toward
       the rival's side — thick at its leading edge, thinning to dithered
       wisps behind (hard cells, never a gradient), spores riding it — and
       every rival field the player can see withers as the edge passes */
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
                (b.y + sz * 0.7) * TL + Math.sin(a) * k * TL * 1.4, m % 2 ? '#b6bba2' : '#8b9070', '#3d4232', 1 - k);
            }
          }
          return;
        }
        /* THE MURK, cell by cell (hard cells, alpha in hard steps — never a
           gradient). Not a dither: a checker of independent cells reads as
           noise, and a green-grey murk over green grass is camouflage. The
           cloud is a churning field (GrowFX.blob, two octaves, drifting with
           the clock) cut against a threshold that rises with depth behind the
           edge, so it comes as LUMPS — thick and close-packed at its leading
           face, tearing into rags behind — each lump in three sour, ashen
           tones (a dark underside, the body, a pale crown) that read on grass,
           woods and water alike. Ahead of the edge only the highest of the
           field shows, as wisps; and where it has passed a grey haze hangs
           over the land until the end. */
        const Wd = R.cv.width, Hd = R.cv.height, dpr = R.dpr || 1, cell = Math.max(4, Math.round(10 * dpr));
        const haze = F.step(0.2 * fade), T = s.t, M = this.MURK;
        for (let y = 0; y < Hd; y += cell) for (let x = 0; x < Wd; x += cell) {
          const gx = (x / cell) | 0, gy = (y / cell) | 0;
          const depth = (fr.front - ((x + cell / 2) * fr.ux + (y + cell / 2) * fr.uy)) / fr.band;
          if (depth < -0.14) continue;
          if (depth > 1.04) {
            if (haze <= 0 || (depth < 1.16 && F.hash(gx * 7 + 3, gy * 11 + 1) > 0.5)) continue;
            g.globalAlpha = haze; g.fillStyle = M[3];
            g.fillRect(x, y, cell, cell);
            continue;
          }
          const n = F.blob(gx, gy, 6, T * 0.5) * 0.65 + F.blob(gx + 57, gy + 31, 2.5, T * 0.9) * 0.35;
          const thr = depth < 0 ? 0.6 - depth * 2.4 : 0.26 + depth * 0.42;
          const e = n - thr;
          if (e <= 0) continue;
          const tone = e > 0.2 ? 2 : e > 0.07 ? 1 : 0, back = depth > 0.7 ? 0.7 : 1;
          g.globalAlpha = F.step(fade * back * [0.66, 0.56, 0.6][tone]);
          g.fillStyle = M[tone];
          g.fillRect(x, y, cell, cell);
        }
        g.globalAlpha = 1;
        // spores riding the murk, swirling up as it rolls, a dark underside
        // to each so they read against bright grass and dark woods alike
        const sp = Math.max(2, Math.round(3 * dpr));
        for (let k = 0; k < 170; k++) {
          const along = fr.front - fr.band * F.hash(k, 1) * 1.05, perp = (F.hash(k, 2) - 0.5) * fr.span * 1.4;
          const sw = Math.sin(s.t * (1.5 + F.hash(k, 4) * 2) + k) * 14 * dpr;
          const x = fr.ux * along - fr.uy * perp + fr.uy * sw, y = fr.uy * along + fr.ux * perp - s.t * 30 * dpr * (0.4 + F.hash(k, 3)) - fr.ux * sw;
          if (x < 0 || x > Wd || y < 0 || y > Hd) continue;
          const a = F.step(fade * (1 - F.hash(k, 1) * 0.7));
          if (a <= 0) continue;
          const big = k % 5 === 0 ? 2 : 1, sx = Math.round(x / sp) * sp, sy = Math.round(y / sp) * sp;
          g.globalAlpha = a * 0.7; g.fillStyle = '#2c3022';
          g.fillRect(sx, sy + sp * big, sp * big, sp);
          g.globalAlpha = a; g.fillStyle = this.SPORE[k % 3];
          g.fillRect(sx, sy, sp * big, sp * big);
        }
        // and the season's last leaves, dead before they fell, tumbling with it
        for (let k = 0; k < 46; k++) {
          const along = fr.front - fr.band * (0.05 + F.hash(k, 31) * 0.6), perp = (F.hash(k, 32) - 0.5) * fr.span * 1.3;
          const tum = s.t * (3 + F.hash(k, 33) * 4) + k;
          const x = fr.ux * along - fr.uy * perp, y = fr.uy * along + fr.ux * perp + Math.sin(tum) * 10 * dpr;
          if (x < 0 || x > Wd || y < 0 || y > Hd) continue;
          const a = F.step(fade * 0.9);
          if (a <= 0) continue;
          const flat = Math.cos(tum) > 0, lx = Math.round(x / sp) * sp, ly = Math.round(y / sp) * sp;
          g.globalAlpha = a; g.fillStyle = k % 2 ? '#7a6a48' : '#5e5238';
          g.fillRect(lx, ly, sp * (flat ? 2 : 1), sp * (flat ? 1 : 2));
        }
        g.globalAlpha = 1;
      },
    },
    // the murk's bands by depth behind its edge: [up to, density, alpha, colour]
    // the murk's tones: underside, body, crown — and the haze it leaves
    MURK: ['#3c4430', '#77805f', '#aab28a', '#6f7658'],
    SPORE: ['#b6bba2', '#9aa27a', '#d4d8bf'],
    /* while it lasts, every rival field and station IN SIGHT stands greyed
       and withered — its own silhouette washed a dead grey-green, dull specks
       over the plot, grey spores drifting off it. Nothing the fog hides is
       drawn, ever: the card is not a lamp. */
    drawLive(g, e) {
      const TL = CFG.TILE, F = GrowFX, v = F.view(1), t = performance.now() / 1000;
      const fade = F.tail(e), sp = F.liveP('blight'), live = sp >= 0 && sp < 1 ? R.cardShows.find(z => z.id === 'blight') : null;
      const fr = live ? this.frontAt(live, sp) : null;
      for (const b of S.buildings) {
        if (b.owner !== 'A' || !Bld.done(b) || !Bld.def(b.key).needsWorker) continue;
        const sz = Bld.size(b);
        if (b.x + sz < v.x0 || b.x > v.x1 || b.y + sz < v.y0 || b.y > v.y1) continue;
        if (!this.inSight(b)) continue;
        let k = fade;
        if (fr) { const sc = F.toScreen(Bld.cx(b), Bld.cy(b)); k *= Math.max(0, Math.min(1, (fr.front - (sc.x * fr.ux + sc.y * fr.uy)) / (fr.band * 0.35))); }
        if (k <= 0.05) continue;
        const spr = R.bldSprite(b);
        if (spr && spr.width > 0) {
          g.globalAlpha = F.step(0.55 * k);
          R.blitBld(g, R.tintOf(spr, '#575e45'), b.x * TL, b.y * TL, sz * TL, sz * TL);
        }
        g.globalAlpha = F.step(0.75 * k);
        for (let m = 0; m < 8 * sz * sz; m++) {
          g.fillStyle = m % 3 ? '#6e6248' : '#8d8f7c';
          g.fillRect(F.snap((b.x + F.hash(m, b.id) * sz) * TL), F.snap((b.y + 0.2 + F.hash(b.id, m * 3) * (sz - 0.2)) * TL), 2, 2);
        }
        for (let m = 0; m < 4; m++) {
          const ph = (t * 0.22 + F.hash(b.id, m + 9)) % 1;
          F.mote(g, (b.x + 0.15 + F.hash(m, b.id + 4) * (sz - 0.3)) * TL + Math.sin(t * 1.3 + m * 2) * 3,
            (b.y + sz * 0.6) * TL - ph * TL * 1.4, '#b6bba2', '#3d4232', k * (ph < 0.2 ? ph / 0.2 : (1 - ph) / 0.8));
        }
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
      // the hall: an upgrade under way is this same rise — its price comes back
      if (tc.upgrading > 0) { refund(Bld.cancelRefund(tc)); tc.upgrading = 0; tc.upgTotal = 0; resolved++; }
      if (pl.rise) Bld.finishUpgrade(tc, true);
      // the walls and gates, through the village-wide tier
      if (tc.wallUp > 0) { refund(tc.wallUpPaid || {}); resolved++; }
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
      // the light runs out to every building raised (walls included), nearest first
      const cx = Bld.cx(tc), cy = Bld.cy(tc);
      const lit = pl.items.map(it => it.b).concat(pl.walls ? Bld.forts('P').filter(f => !(f.construction > 0)) : []);
      for (const b of lit) items.push({ id: b.id, x: Bld.cx(b), y: Bld.cy(b), sz: Bld.size(b), d: Math.hypot(Bld.cx(b) - cx, Bld.cy(b) - cy) });
      items.sort((a, z) => a.d - z.d);
      if (items.length > 64) items.length = 64;
      const maxD = items.reduce((m, it) => Math.max(m, it.d), 1);
      GrowFX.show('enlightenment', { x: cx, y: cy, foot: tc.y + Bld.size(tc), tc: tc.id, items, maxD });
      GrowFX.sfx('enlighten');
      const s = n => n === 1 ? '' : 's';
      Deck.say('✨ Enlightenment: your Town Center stands at Lv ' + tc.level +
        (raised ? ', and ' + raised + ' building' + s(raised) + ' rose to meet it' : '') +
        (pl.walls && pl.forts ? '; every wall and gate stands at Lv ' + S.wallLevel : '') +
        (resolved ? '. ' + resolved + ' work' + s(resolved) + ' already under way ' + (resolved === 1 ? 'was' : 'were') +
          ' finished, and ' + Bld.costStr(back) + ' paid for ' + (resolved === 1 ? 'it' : 'them') + ' comes back' : '') + '.');
      return { ok: true, x: cx, y: cy, fly: back };
    },
    /* THE TOWN WAKES KNOWING HOW. A pillar of golden light stands up out of
       the hall into a sky that brightens in stepped bands, rays of dots
       fanning from where it meets the top of the world; the ground shakes as
       it lands; it holds; then the light runs out along the ground to every
       building — nearest first — and each rises in its own flash (its own
       silhouette lit gold, a column, a ring of dots, sparks), each with its
       own small bell; and the pillar is drawn down to a thread. */
    show: {
      ms: 5800, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX;
        if (layer === 'sky') {
          const e = F.env(p, 0.02, 0.14, 0.7, 0.98);
          if (e <= 0) return;
          F.skyBands(g, '255,214,120', 0.26 * e, 8, 0.65);
          const sc = F.toScreen(s.x, s.foot), W = R.cv.width, H = R.cv.height, dpr = R.dpr || 1;
          const ox = Math.max(0, Math.min(W, sc.x)), px = Math.max(2, Math.round(4 * dpr));
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const [r, a, c] of [[0.24, 0.1, '255,200,90'], [0.15, 0.16, '255,226,140'], [0.075, 0.3, '255,250,226']]) {
            g.fillStyle = 'rgba(' + c + ',' + (a * e).toFixed(3) + ')';
            R.pxDisc(g, ox, 0, H * r, px, 1);
          }
          g.restore();
          F.rays(g, ox, -H * 0.04, 15, 0.2, '#ffe9a0', 0.55 * e, s.t);
          F.glitter(g, 56, '#fff6d8', e, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL, vp = F.viewPx(2);
        if (p >= 0.1 && !s.boom) {
          s.boom = 1;
          if (R.shakeAt) R.shakeAt(8, 1.0);
          if (R.flashAt) R.flashAt(0.55, 0.7, '255,236,170');
        }
        // THE PILLAR
        const up = Math.min(1, p / 0.1), thin = p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.2);
        if (thin > 0) {
          // it stands up out of the hall's middle, so the hall's own face shows lit beneath it
          const base = s.y * TL, topY = R.cam.y - 60 / R.cam.z, h = (base - topY) * F.ease(up), w = TL * (1.7 + Math.sin(s.t * 9) * 0.12) * thin;
          g.save(); g.globalCompositeOperation = 'lighter';
          F.column(g, cx, base, base - h, w, 1);
          g.fillStyle = 'rgba(255,252,236,' + (0.5 * thin).toFixed(2) + ')';
          for (let k = 0; k < 16 && h > 4; k++) {
            const yy = base - ((s.t * 240 + k * 64) % h);
            g.fillRect(F.snap(cx - w * 0.28), F.snap(yy), Math.max(2, F.snap(w * 0.56)), 2);
          }
          g.fillStyle = 'rgba(255,214,120,' + (0.45 * thin).toFixed(2) + ')';
          R.pxDisc(g, cx, foot, TL * (1.2 + up * 0.7), 2, 0.5);
          for (let k = 0; k < 3; k++) {
            const q = (p * 2.2 + k / 3) % 1;
            F.ring(g, cx, foot, TL * (0.8 + q * 4.6), '#ffd45e', (1 - q) * 0.85 * thin, 2, 0.5, vp);
          }
          g.restore();
        }
        // THE HALL RISES IN ITS OWN LIGHT
        if (p > 0.06 && p < 0.5) F.flashBld(g, Bld.get(s.tc), '#ffe9a0', 0.8 * F.env(p, 0.06, 0.12, 0.3, 0.5));
        // THE LIGHT RUNS OUT TO EVERY BUILDING
        for (const it of s.items) {
          const a0 = 0.2 + 0.46 * (it.d / s.maxD), land = a0 + 0.07;
          if (p < a0) continue;
          const bx = it.x * TL, by = it.y * TL;
          if (p < land) {
            const k = (p - a0) / 0.07;
            g.save(); g.globalCompositeOperation = 'lighter';
            for (let m = 5; m >= 0; m--) {
              const km = Math.max(0, k - m * 0.05), x = cx + (bx - cx) * km, y = foot + (by - foot) * km;
              if (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1) continue;
              g.fillStyle = m ? '#ffcc40' : '#fffbe8'; g.globalAlpha = F.step(1 - m * 0.15);
              const sz = m ? 2 : 4;
              g.fillRect(F.snap(x) - sz / 2, F.snap(y) - sz / 2, sz, sz);
            }
            g.restore();
            continue;
          }
          const k = (p - land) / 0.2;
          if (k >= 1 || bx < vp.x0 || bx > vp.x1 || by < vp.y0 || by > vp.y1 + TL) continue;
          if (!it.rung) { it.rung = 1; F.sfx('rise'); }
          F.flashBld(g, Bld.get(it.id), '#ffe9a0', 0.85 * (1 - k));
          const bf = by + it.sz * TL * 0.5;
          g.save(); g.globalCompositeOperation = 'lighter';
          F.column(g, bx, bf, bf - TL * (1.4 + it.sz * 0.7) * F.ease(k * 2.5), TL * 0.75 * it.sz * (1 - k), 1 - k);
          F.ring(g, bx, bf - 2, TL * (0.4 + it.sz * 0.9 * F.ease(k)), '#ffd45e', (1 - k) * 0.9, 2, 0.5, vp);
          g.restore();
          for (let m = 0; m < 6; m++) {
            const h = F.hash(it.id, m + 3);
            F.mote(g, bx + (h - 0.5) * TL * it.sz, bf - TL * 0.4 - k * TL * (0.8 + h), m % 2 ? '#fff1b8' : '#ffd45e', '#7a4a0a', 1 - k);
          }
        }
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
    can() {
      if (!UI.wonderOffered()) return { ok: false, why: 'The Wonder rises only in Calm worlds' };
      const w = Deck.wonderOf('P');
      if (w && !(w.construction > 0)) return { ok: false, why: 'Your Wonder already stands.' };
      if (S.deck && S.deck.charges && S.deck.charges.marble) return { ok: false, why: 'The Age of Marble has already come.' };
      return { ok: true };
    },
    apply() {
      const ok = this.can();
      if (!ok.ok) return ok;
      Deck.run().charges.marble = 1;
      const w = Deck.wonderOf('P'), back = {};
      if (w && w.paid) for (const k in w.paid) {
        const n = Math.floor((w.paid[k] || 0) * this.CUT);
        if (n > 0) { back[k] = n; w.paid[k] -= n; S.res[k] = (S.res[k] || 0) + n; }
      }
      const tc = Bld.tcOf('P');
      const at = w ? { x: Bld.cx(w), y: Bld.cy(w), foot: w.y + Bld.size(w), sz: Bld.size(w), site: 1 }
        : tc ? { x: Bld.cx(tc), y: Bld.cy(tc), foot: tc.y + Bld.size(tc), sz: Bld.size(tc), site: 0 }
        : Object.assign(GrowFX.mid(), { foot: GrowFX.mid().y + 1, sz: 2, site: 0 });
      if (w) GrowFX.look(at.x, at.y);
      GrowFX.show('age_of_marble', at);
      if (window.R && R.flashAt) R.flashAt(0.32, 0.6, '245,240,228');
      GrowFX.sfx('marble');
      const any = Object.keys(back).length;
      Deck.say('🏛 The Age of Marble: for the rest of this game your Wonder costs 25% less and rises twice as fast' +
        (w ? (any ? ' — and ' + Bld.costStr(back) + ' of what you paid for it comes back' : '') : '') + '.');
      return { ok: true, x: at.x, y: at.y, fly: back };
    },
    MARBLE: ['#fbf8f0', '#ece6d8', '#c4bdae', '#6f695c'],
    /* the marble arrives: dressed blocks drop out of the sky onto the works,
       course on course, each landing in its own puff of pale dust, under a
       pale column and a ring of dots while the sky flares white (Imperial) */
    show: {
      ms: 3200, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX;
        if (layer === 'sky') {
          const e = F.env(p, 0, 0.12, 0.45, 0.9);
          if (e <= 0) return;
          F.skyBands(g, '236,232,222', 0.2 * e, 6, 0.45);
          F.glitter(g, 30, '#ffffff', e * 0.8, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL, half = s.sz * TL / 2, M = this.MARBLE;
        g.save(); g.globalCompositeOperation = 'lighter';
        F.column(g, cx, foot, foot - TL * (3 + s.sz) * F.ease(p / 0.15), TL * s.sz * 0.9 * (1 - p), F.env(p, 0, 0.08, 0.3, 0.7),
          ['200,196,186', '236,232,222', '255,255,252']);
        F.ring(g, cx, foot - 2, TL * (0.4 + s.sz * 0.9 * F.ease(p / 0.5)), '#f4f0e6', (1 - p) * 0.9, 2, 0.5);
        g.restore();
        const per = Math.max(2, s.sz * 2), N = per * 3, fadeOut = p < 0.82 ? 1 : Math.max(0, (1 - p) / 0.18);
        for (let k = 0; k < N; k++) {
          const st = 0.05 + (k / N) * 0.55, q = (p - st) / 0.16;
          if (q <= 0) continue;
          const row = Math.floor(k / per), bx = cx - half * 0.8 + ((k % per) + 0.5) / per * half * 1.6 + (F.hash(k, 4) - 0.5) * 4;
          const landY = foot - 6 - row * 6, y = q < 1 ? landY - TL * 4 * (1 - q * q) : landY;
          const a = F.step(fadeOut);
          if (a <= 0) continue;
          g.globalAlpha = a;
          g.fillStyle = M[3]; g.fillRect(F.snap(bx) - 5, F.snap(y) - 1, 10, 8);
          g.fillStyle = M[1]; g.fillRect(F.snap(bx) - 4, F.snap(y), 8, 6);
          g.fillStyle = M[0]; g.fillRect(F.snap(bx) - 4, F.snap(y), 8, 2);
          g.fillStyle = M[2]; g.fillRect(F.snap(bx) - 4, F.snap(y) + 4, 8, 2);
          g.globalAlpha = 1;
          if (q >= 1 && q < 1.5) {
            const d = (q - 1) / 0.5;
            for (let m = 0; m < 4; m++)
              F.mote(g, bx + (m < 2 ? -1 : 1) * (4 + d * 10 * (1 + m % 2)), landY + 4 - d * 3 * (m % 2), '#f4f0e6', null, (1 - d) * a);
          }
        }
      },
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
    work() { return CFG.BUILDINGS.wonder.levels[0].time; },
    floor() { return (1 - this.CAP) * this.work(); },
    lay(w) {
      const before = w.construction;
      w.construction = Math.max(Math.min(before, this.floor()), before - this.GAIN * this.work());
      const at = { x: Bld.cx(w), y: Bld.cy(w), foot: w.y + Bld.size(w), sz: Bld.size(w), bx: w.x, by: w.y };
      GrowFX.look(at.x, at.y);
      GrowFX.show('wonders_foundation', at);
      if (window.R && R.shakeAt) R.shakeAt(6, 1.6);
      GrowFX.sfx('foundation');
      Deck.say('🗿 The first stones were already here: your Wonder gains ' + Math.round(before - w.construction) +
        ' days of work and stands ' + Math.round((1 - w.construction / this.work()) * 100) + '% raised.');
      return before - w.construction;
    },
    can() {
      if (!UI.wonderOffered()) return { ok: false, why: 'The Wonder rises only in Calm worlds' };
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
      if (w) { this.lay(w); return { ok: true, x: Bld.cx(w), y: Bld.cy(w) }; }
      Deck.run().charges.foundation = 1;
      const tc = Bld.tcOf('P'), c = tc ? { x: Bld.cx(tc), y: Bld.cy(tc), foot: tc.y + Bld.size(tc) } : Object.assign(GrowFX.mid(), { foot: GrowFX.mid().y + 1 });
      GrowFX.show('wonders_foundation', { x: c.x, y: c.y, foot: c.foot, sz: 2, pending: 1, ms: 2200 });
      GrowFX.sfx('rise');
      Deck.say('🗿 The first stones wait under the grass: the moment you lay your Wonder, its first 35% stands.');
      return { ok: true, x: c.x, y: c.y };
    },
    /* the ground gives up its old stones: gold light breaks along the works'
       outline and cracks run in across it, the earth shakes, nine weathered
       blocks rise out of it, a pillar of light stands up out of the middle
       and the sky brightens — then the old stones settle into the works.
       Waiting for a Wonder not yet laid, it is a smaller thing: a seal of
       gold sinking into the ground at the hall. */
    show: {
      ms: 5200, layers: ['world', 'sky'],
      draw(g, s, p, dt, layer) {
        const F = GrowFX;
        if (layer === 'sky') {
          if (s.pending) return;
          const e = F.env(p, 0.2, 0.32, 0.62, 0.95);
          if (e <= 0) return;
          F.skyBands(g, '255,210,110', 0.26 * e, 7, 0.55);
          const sc = F.toScreen(s.x, s.foot);
          F.rays(g, Math.max(0, Math.min(R.cv.width, sc.x)), -R.cv.height * 0.04, 13, 0.18, '#ffe9a0', 0.45 * e, s.t);
          F.glitter(g, 40, '#fff6d8', e, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL;
        if (s.pending) {
          const q = F.ease(p / 0.8);
          g.save(); g.globalCompositeOperation = 'lighter';
          F.ring(g, cx, foot, TL * (2.6 - q * 2.2), '#ffd45e', 1 - p, 2, 0.5, null, p * 12);
          F.ring(g, cx, foot, TL * (1.8 - q * 1.6), '#fff1b8', (1 - p) * 0.8, 2, 0.5, null, -p * 9);
          g.restore();
          for (let m = 0; m < 12; m++) {
            const th = m / 12 * Math.PI * 2 + p * 3, rr = TL * (2.2 - q * 2);
            F.mote(g, cx + Math.cos(th) * rr, foot + Math.sin(th) * rr * 0.5 + q * 6, '#ffd45e', '#7a4a0a', 1 - p);
          }
          return;
        }
        const n = s.sz, x0 = cx - n * TL / 2, y0 = foot - n * TL;
        // 1. the outline and the cracks, gold light coming up through them
        const cr = F.env(p, 0, 0.1, 0.55, 0.8);
        if (cr > 0) {
          g.save(); g.globalCompositeOperation = 'lighter';
          g.globalAlpha = F.step(cr);
          g.fillStyle = '#ffd45e';
          for (let d = 0; d < n * TL; d += 4) {
            g.fillRect(F.snap(x0 + d), F.snap(y0), 2, 2); g.fillRect(F.snap(x0 + d), F.snap(foot) - 2, 2, 2);
            g.fillRect(F.snap(x0), F.snap(y0 + d), 2, 2); g.fillRect(F.snap(x0 + n * TL) - 2, F.snap(y0 + d), 2, 2);
          }
          for (let c = 0; c < 12; c++) {
            const side = c % 4, u = F.hash(c, 3);
            let x = side === 0 ? x0 + u * n * TL : side === 1 ? x0 + n * TL : side === 2 ? x0 + u * n * TL : x0;
            let y = side === 0 ? y0 : side === 1 ? y0 + u * n * TL : side === 2 ? foot : y0 + u * n * TL;
            const len = Math.min(1, cr * 1.4) * 9;
            for (let st = 0; st < len; st++) {
              x += (cx - x) * 0.12 + (F.hash(c, st) - 0.5) * 8;
              y += (foot - n * TL / 2 - y) * 0.12 + (F.hash(st, c) - 0.5) * 8;
              g.fillStyle = st % 3 ? '#ffcc40' : '#fffbe8';
              g.fillRect(F.snap(x), F.snap(y), 2, 2);
            }
          }
          g.restore();
        }
        // 2. the old stones rise out of the earth — weathered standing stones,
        // each its own height and lean, lit from the upper left, mossed and
        // chipped, shedding the earth they slept under as they come up
        const fadeOut = p < 0.78 ? 1 : Math.max(0, (1 - p) / 0.22);
        if (p >= 0.16 && !s.dust) {
          s.dust = 1;
          if (R.startPlacePoof) { R.startPlacePoof(s.bx, s.by, n); R.startPlacePoof(s.bx, s.by, n, { delay: 420, scale: 0.8 }); }
        }
        const order = [];
        for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) order.push([tx, ty]);
        for (const [tx, ty] of order) {
          const q = F.ease((p - 0.16 - (tx + ty) * 0.035) / 0.3);
          if (q <= 0) continue;
          const a = F.step(fadeOut);
          if (a <= 0) continue;
          const hh = F.hash(tx * 5 + 1, ty * 7 + 3), hw = F.hash(ty * 3 + 2, tx * 11 + 5);
          const bw = F.snap(TL * (0.42 + hw * 0.28)), bh = TL * (0.62 + hh * 0.5);
          const gx = F.snap(x0 + (tx + 0.5) * TL + (hw - 0.5) * 6), gy = F.snap(y0 + (ty + 0.94) * TL);
          const top = F.snap(gy - bh * q), lean = F.snap((hh - 0.5) * 6 * q), L = gx - bw / 2;
          g.globalAlpha = a;
          // the body: an outline, a lit face, the shadowed side, a ragged crown
          g.fillStyle = '#2e2a22';
          g.fillRect(L - 2, top + 4, bw + 4, gy - top - 2);
          g.fillRect(L + lean, top - 2, bw - 4, 8);
          g.fillStyle = '#7d7363'; g.fillRect(L, top + 4, bw, gy - top - 4);
          g.fillStyle = '#9a8f7a'; g.fillRect(L, top + 4, F.snap(bw * 0.45), gy - top - 4);
          g.fillStyle = '#5f574a'; g.fillRect(L + bw - 4, top + 6, 4, gy - top - 6);
          g.fillStyle = '#b3a78f'; g.fillRect(L + lean + 2, top, bw - 8, 4);
          g.fillStyle = '#c9bea6'; g.fillRect(L + lean + 2, top, F.snap((bw - 8) * 0.5), 2);
          // weathering: a crack down the face, lichen and moss low on the stone
          g.fillStyle = '#4a4336';
          for (let c = 0, cy0 = top + 8; c < 3 && cy0 < gy - 6; c++, cy0 += 6) g.fillRect(L + F.snap(bw * (0.35 + F.hash(tx + c, ty) * 0.3)), cy0, 2, 4);
          g.fillStyle = '#5f7a3a';
          for (let m = 0; m < 4; m++) g.fillRect(F.snap(L + F.hash(tx * 3 + m, ty) * (bw - 2)), F.snap(gy - 4 - F.hash(ty, m + tx) * (gy - top) * 0.45), 2, 2);
          g.fillStyle = '#9fb06a'; g.fillRect(F.snap(L + 2 + hw * (bw - 6)), F.snap(top + (gy - top) * 0.3), 2, 2);
          g.globalAlpha = 1;
          if (q < 1) for (let m = 0; m < 4; m++)   // earth falling off the rising stone
            F.mote(g, gx + (F.hash(m, tx + ty * 5) - 0.5) * bw, top + q * 10 * (m + 1), m % 2 ? '#6e5638' : '#8a6e46', null, (1 - q) * a);
        }
        // 3. the pillar out of the middle, and rings of dots across the ground
        const pl = F.env(p, 0.28, 0.36, 0.7, 0.9);
        if (pl > 0) {
          g.save(); g.globalCompositeOperation = 'lighter';
          const topY = R.cam.y - 60 / R.cam.z, mid = foot - n * TL / 2;
          F.column(g, cx, mid, mid - (mid - topY) * F.ease((p - 0.28) / 0.1), TL * 1.8 * pl, pl);
          for (let k = 0; k < 3; k++) {
            const q = (p * 2 + k / 3) % 1;
            F.ring(g, cx, mid, TL * (1 + q * 4), '#ffd45e', (1 - q) * 0.8 * pl, 2, 0.6, F.viewPx(2));
          }
          g.restore();
        }
        if (p >= 0.32 && !s.boom) { s.boom = 1; if (R.flashAt) R.flashAt(0.5, 0.7, '255,236,170'); }
        // 4. gold rising off the settled stones
        if (p > 0.55) for (let m = 0; m < 14; m++) {
          const h = F.hash(m, 77), k = ((p - 0.55) / 0.45 + h) % 1;
          F.mote(g, x0 + (0.1 + h * 0.8) * n * TL, foot - TL * 0.4 - k * TL * 2.2, m % 2 ? '#ffd45e' : '#fff1b8', '#7a4a0a', (1 - k) * (1 - p) * 2.2);
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
