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
      The lush ground of Bountiful Land is asked of the player's memory the
      same way (bountiful_land.grows).

   WHAT BELONGS TO THE LAND IS DRAWN WITH THE LAND. R.drawCardWorld runs
   after the units and over the fog — right for light in the air, wrong for
   the ground: Bountiful Land's sprigs grew through the villagers' bodies
   and stood lit on remembered ground the fog dims, and the Blight's grey
   wash was laid over the rival's hands on their own fields. So the grown
   meadow and the wave that wakes it draw in the GROUND pass
   (drawGround / a show's 'ground' layer — R.drawCardGround, under bridges,
   buildings, units and the fog), and the withered fields ON their building
   (drawBld — R.drawCardBld, right after its own art). Only light and what
   flies (rings in the air, pollen, spores, the sky) stays over the scene.

   Every show is render state (R.cardShows, never in S); a run with no card
   in play pays nothing for any of it (R.draw's length checks). The looks
   speak the house style: hard pixels on a 2px grid, alpha in hard steps,
   rings made of dots — and THE LIGHT IS GOLD, NOT LIME (R.glow, render.js):
   a body of light turns what it falls on gold, then brightens it, and a
   gold mark is laid opaque in the ramp's ink, never added over the grass. */

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
  /* a ring made OF dots (never a stroked arc), culled to `vp`; squash < 1
     lays it on the ground. `col` a TONE ('gold', 'pale', 'bronze') is light:
     its dots are laid opaque in the tone's ink, fading down the ramp
     (R.goldInk) whatever composite the caller holds; any other colour (the
     land's green) keeps its own look */
  ring(g, cx, cy, rad, col, a, px, squash, vp, spin) {
    const tone = R.isTone(col);
    if (!tone) a = this.step(a);
    if (a <= 0 || rad < 1) return;
    px = px || 2; squash = squash || 1;
    const n = Math.max(12, Math.min(360, Math.round(rad * 2 * Math.PI / (px * 3))));
    const op = g.globalCompositeOperation;
    if (tone) { if (!R.inkOn(g, a, col)) return; }
    else { g.fillStyle = col; g.globalAlpha = a; }
    for (let i = 0; i < n; i++) {
      const th = (i + (spin || 0)) / n * Math.PI * 2, x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad * squash;
      if (vp && (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1)) continue;
      g.fillRect(this.snap(x, px), this.snap(y, px), px, px);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = op;
  },
  /* a lit grain with a dark underside (the motes' language: it reads on
     grass). A GOLD grain fades down the ramp, opaque (R.inkFade) — at half
     alpha over the meadow it was a lime speck */
  mote(g, x, y, col, dark, a) {
    a = this.step(a);
    if (a <= 0) return;
    const sx = this.snap(x), sy = this.snap(y), [c, ca] = R.inkFade(col, a);
    if (ca <= 0) return;
    if (dark) { g.globalAlpha = a * 0.6; g.fillStyle = dark; g.fillRect(sx, sy + 2, 2, 1); }
    g.globalAlpha = ca; g.fillStyle = c; g.fillRect(sx, sy, 2, 2);
    g.globalAlpha = 1;
  },
  // a pale cross, one cell each way: something catching the light (a gold one in the ramp's ink)
  glint(g, x, y, col, a, px, tone) {
    a = this.step(a);
    if (a <= 0) return;
    px = px || 2;
    const sx = this.snap(x, px), sy = this.snap(y, px), [c, ca] = R.inkFade(col, a, tone);
    if (ca <= 0) return;
    g.globalAlpha = ca; g.fillStyle = c;
    g.fillRect(sx, sy, px, px);
    g.fillRect(sx - px, sy, px, px); g.fillRect(sx + px, sy, px, px);
    g.fillRect(sx, sy - px, px, px); g.fillRect(sx, sy + px, px, px);
    g.globalAlpha = 1;
  },
  /* a word in the world (a card's '×2'): cream on a hard one-pixel dark rim,
     alpha in steps — the float's legibility over any ground */
  tag(g, x, y, txt, a, col) {
    a = this.step(a);
    if (a <= 0) return;
    g.save();
    g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = a;
    const tx = Math.round(x), ty = Math.round(y);
    g.fillStyle = '#0d0b08';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillText(txt, tx + ox, ty + oy);
    g.fillStyle = col || '#f2e6cd';
    g.fillText(txt, tx, ty);
    g.restore();
  },
  /* a column of light standing on (x, foot): three stepped widths of the
     card's light (R.glow — whatever stands in it turns gold, then bright),
     strongest in the middle, a white-hot thread up its heart. `tone`:
     'gold' (the default), 'bronze' (the amber of a dawn), 'pale' (marble). */
  column(g, x, foot, top, w, a, tone) {
    a = this.step(a);
    if (a <= 0 || foot - top < 2 || w < 2) return;
    tone = tone || 'gold';
    const h = this.snap(foot - top), y0 = this.snap(top);
    for (const [wf, sv] of [[1, 0.6], [0.55, 0.8], [0.18, 1]]) {
      const ww = Math.max(2, this.snap(w * wf));
      R.glow(g, sv * a, () => g.fillRect(this.snap(x - ww / 2), y0, ww, h), tone);
    }
    R.glowHot(g, 0.6 * a, () => g.fillRect(this.snap(x - 1), y0, 2, h), tone);
  },
  /* a building's own silhouette flashed in the card's light (R.glow over its
     tinted picture): the building turns gold in its own light and shade and
     brightens toward cream as the flash strengthens — added, it went lime */
  flashBld(g, b, a, tone) {
    a = this.step(a);
    if (a <= 0 || !b) return;
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
  /* rays of light fanning down from (ox, oy), device px: each a NARROW
     wedge of the card's light (R.glow — the meadow under it turned gold,
     then brightened), cut in rows of the world's grain so its edges are hard
     pixel steps, in four bands that step down as it reaches out — and a
     bead of the tone's ink every few rows along its spine. Laid wide it
     was a slab, added it was lime. */
  rays(g, ox, oy, n, spread, tone, a, t) {
    const W = R.cv.width, H = R.cv.height, px = Math.max(2, Math.round(2 * (R.dpr || 1)));
    const gr = Math.max(px, Math.round(2 * R.cam.z * (R.dpr || 1))), top = Math.max(0, Math.ceil(oy / gr) * gr);
    const L = H - top, BANDS = 4;
    if (L <= 0) return;
    g.save();
    for (let r = 0; r < n; r++) {
      const th = (r - (n - 1) / 2) * spread + Math.sin(t * 0.8 + r * 1.7) * 0.012;   // from the vertical
      if (Math.abs(th) > 1.3) continue;                    // too flat to cut in rows
      const ar = a * (r % 2 ? 0.55 : 1), w = r % 2 ? 0.006 : 0.01;
      const t1 = Math.tan(th - w), t2 = Math.tan(th + w), tc = Math.tan(th);
      for (let b = 0; b < BANDS; b++) {
        const y0 = top + Math.round(L * b / BANDS / gr) * gr, y1 = top + Math.round(L * (b + 1) / BANDS / gr) * gr;
        R.glow(g, ar * 0.75 * (1 - b / BANDS), () => {
          for (let y = y0; y < y1; y += gr) {
            const dy = y + gr / 2 - oy;
            let X1 = Math.round((ox + t1 * dy) / gr) * gr, X2 = Math.round((ox + t2 * dy) / gr) * gr;
            if (X2 <= X1) X2 = X1 + gr;
            if (X2 < 0 || X1 > W) continue;
            g.fillRect(X1, y, X2 - X1, gr);
          }
        }, tone);
      }
      // the beads along its spine
      for (let y = top + gr * 3; y < H; y += gr * 6) {
        const d = (y - top) / L;
        if (!R.inkOn(g, ar * (1 - d), tone)) break;
        g.fillRect(Math.round((ox + tc * (y - oy)) / px) * px, y, px, px);
      }
    }
    g.restore();
  },
  // stars of light twinkling across the upper sky (device px), in the tone's ink
  glitter(g, n, tone, a, t) {
    const W = R.cv.width, H = R.cv.height, px = Math.max(2, Math.round(2 * (R.dpr || 1)));
    g.save();
    for (let i = 0; i < n; i++) {
      const tw = (Math.sin(t * (2 + this.hash(i, 5) * 3) + i * 2.3) + 1) / 2;
      if (tw < 0.55) continue;
      this.glint(g, this.hash(i, 1) * W, this.hash(i, 2) * H * 0.62, R.LIGHT.TONE[tone].ramp[3], a * (tw - 0.45) * 1.8, px, tone);
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
    flare(g, h, s, beat, embers, now) {
      const TX = Deck._townTX;
      if (TX && TX.flame) TX.flame(g, h.x, h.y, s, beat);
      const F = ['#a33f1c', '#e88a3a', '#f2c14a', '#ffe9a0'];
      for (let i = 0; i < embers; i++) {
        const ph = (now * 0.9 + i / embers) % 1;
        g.fillStyle = F[ph < 0.3 ? 3 : ph < 0.6 ? 2 : 1];
        g.fillRect(GrowFX.snap(h.x + Math.sin(ph * 7 + i * 2.3) * 4), GrowFX.snap(h.y - s * 0.8 - ph * s * 1.6), 2, 2);
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
      return { ok: true, x: c.x, y: c.y, until: e.until };
    },
    end() { G.log('🌱 The bounty near the fire fades — the land gives its ordinary yield again.'); },
    // ground a sprig may stand on: open meadow, spent soil, a felled stand
    OPEN: (() => { const o = {}; o[T.GRASS] = 1; o[T.BARREN] = 1; o[T.STUMPS] = 1; return o; })(),
    BLOOM: ['#f4efe0', '#dcc4ec', '#f2c8d0'],
    /* the new growth's greens: the meadow's own leaf ramp a step up, foot to
       tip — never the lime the first cut drew its tufts in (the playtest's
       critics: "the banned upright tufts, in the banned lime") */
    GREEN: ['#2e4a1e', '#3c6f2d', '#4d8a3a', '#5a9640'],
    /* MAY A SPRIG GROW HERE — asked of what the PLAYER knows. A tile in sight
       now reads the live ground and whatever stands on it; a tile the fog
       holds reads the player's MEMORY (S.map.seenTerrain, and S.map.seenB's
       ghosts for what stood there) plus the player's own works, which they
       always know. Read from the truth, the lush ground was a lamp in the fog:
       a rival War Camp raised out of sight inside the ring left a sprig-less
       hole in its own footprint's shape, and a stand felled out of sight
       sprouted. */
    grows(x, y) {
      const i = MapGen.idx(x, y);
      if (!S.map.explored[i]) return false;
      if (G.visibleAt(x, y)) return !!this.OPEN[S.map.terrain[i]] && !Bld.at(x, y);
      if (!this.OPEN[(S.map.seenTerrain || S.map.terrain)[i]]) return false;
      const b = Bld.at(x, y);
      if (b && b.owner === 'P') return false;
      return !this.ghostAt(x, y);
    },
    // a remembered building's footprint covers (x, y) — seenB is keyed by its top-left tile
    ghostAt(x, y) {
      const seen = S.map.seenB;
      if (!seen) return false;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        if (!MapGen.inB(x - dx, y - dy)) continue;
        const m = seen[MapGen.idx(x - dx, y - dy)];
        if (m) { const s = Bld.size(m); if (s > dx && s > dy) return true; }
      }
      return false;
    },
    /* one sprig at its foot (world px), grown `k` of the way: a dark foot so
       it stands ON the ground, then one of three kinds of new growth, chosen
       by the spot's own hash: a TUFT of young blades (the most of it), a
       leafy SPRIG, and now and then a FLOWER — a cross of petals round a pale
       eye (never gold, fire or berry: the ground may not speak the resource
       language). The greens are a step brighter and more saturated than the
       meadow's, so the ring reads as lusher ground, not as more of the same
       grass. `f` (0 or 1) is the breeze's beat: each sprig leans one way on
       one beat and the other on the next, half of them out of step. */
    sprig(g, x, y, h, k, f) {
      if (k <= 0.05) return;
      const F = GrowFX, sx = F.snap(x), sy = F.snap(y), kind = (h * 7.3) % 1;
      const lean = ((((h * 977) | 0) + f) & 1) ? 2 : 0;
      g.globalAlpha = F.step(Math.min(1, k * 1.5));
      g.fillStyle = this.GREEN[0]; g.fillRect(sx - 2, sy, 6, 2);   // its foot in the ground
      if (kind < 0.55) {
        // the tuft: three blades, the middle tallest, the tips leaning with the wind
        const hh = Math.max(2, F.snap((4 + ((h * 97) % 1) * 5) * k));
        g.fillStyle = this.GREEN[1];
        g.fillRect(sx - 2, sy - F.snap(hh * 0.6), 2, F.snap(hh * 0.6));
        g.fillRect(sx + 2, sy - F.snap(hh * 0.7), 2, F.snap(hh * 0.7));
        g.fillStyle = this.GREEN[2]; g.fillRect(sx, sy - hh + 2, 2, hh - 2);
        g.fillRect(sx + lean, sy - hh, 2, 2);   // the tip, bent with the breeze or upright
        if (k > 0.5) { g.fillStyle = this.GREEN[3]; g.fillRect(sx + lean, sy - hh - 2, 2, 2); }
      } else if (kind < 0.85) {
        const hh = Math.max(2, F.snap((5 + ((h * 97) % 1) * 6) * k));
        g.fillStyle = this.GREEN[1]; g.fillRect(sx, sy - hh, 2, hh);
        if (k > 0.45) {
          g.fillStyle = this.GREEN[2];
          g.fillRect(sx - 2, sy - F.snap(hh * 0.55) + (lean ? 2 : 0), 2, 2);
          g.fillRect(sx + 2, sy - F.snap(hh * 0.8) + (lean ? 0 : 2), 2, 2);
          g.fillStyle = this.GREEN[3]; g.fillRect(sx - 4 + lean, sy - F.snap(hh * 0.55) - 2, 2, 2);
        }
      } else {
        // the flower: a stem, then the petals open once it has grown; it nods with the breeze
        const hh = Math.max(2, F.snap(6 * k)), fx = sx + (lean ? 2 : 0);
        g.fillStyle = this.GREEN[1]; g.fillRect(sx, sy - hh, 2, hh);
        if (k > 0.75) {
          const col = F.hash((h * 1e4) | 0, f + 3) > 0.92 ? '#ffffff' : this.BLOOM[(((h * 53) % 1) * 3) | 0];
          // three petals round the stem's tip, never a cross with an eye in it
          // (a '+' of pale cells read as a dead pixel — the playtest's critics)
          g.fillStyle = col;
          g.fillRect(fx - 2, sy - hh - 2, 2, 2); g.fillRect(fx + 2, sy - hh - 2, 2, 2); g.fillRect(fx, sy - hh - 4, 2, 2);
        }
      }
      g.globalAlpha = 1;
    },
    BEAT: 0.7,   // seconds between the breeze's two beats
    /* the land wakes: a wave of green rolls out from the fire along the
       ground to the ring's edge, fresh shoots breaking out behind it
       (drawGround grows the sprigs in behind the front), and the edge flares
       gold and settles to the faint ring the card wears while it lasts. The
       WAVE IS GROUND LIGHT, drawn in the ground pass under the town and the
       fog; only the pollen the land breathes out rises into the air over the
       people — and only off ground the player can see now. */
    show: {
      ms: 2600, layers: ['ground', 'world'],
      draw(g, s, p, dt, layer) {
        const TL = CFG.TILE, F = GrowFX, cx = s.x * TL, cy = s.y * TL, Rp = this.R * TL, vp = F.viewPx(1);
        const rad = Rp * F.ease(p / 0.62);
        if (layer === 'world') {
          // pollen and seed-fluff lifted off the new growth behind the front
          for (let k = 0; k < 90; k++) {
            const born = 0.05 + F.hash(k, 41) * 0.6, q = (p - born) / 0.4;
            if (q <= 0 || q >= 1) continue;
            const th = F.hash(k, 43) * Math.PI * 2, rr = this.R * F.ease(born / 0.62) * (0.35 + F.hash(k, 47) * 0.6);
            const tx = s.x + Math.cos(th) * rr, ty = s.y + Math.sin(th) * rr;
            if (!MapGen.onBoard(tx | 0, ty | 0) || !G.visibleAt(tx | 0, ty | 0)) continue;
            const x = tx * TL + Math.sin(q * 6 + k) * 4, y = ty * TL - q * TL * (1.2 + F.hash(k, 53));
            if (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1) continue;
            F.mote(g, x, y, k % 3 ? '#f4efe0' : '#fff8d6', null, q < 0.3 ? 1 : (1 - q) / 0.7);
          }
          return;
        }
        g.save();
        // the wave of new green: opaque cells of the growth's own greens, laid
        // ON the meadow (never light ADDED to it, which was the lime), thinning
        // out behind the front by hash, never by alpha
        if (p < 0.66) {
          F.ring(g, cx, cy, rad, this.GREEN[3], 1, 2, 1, vp);
          F.ring(g, cx, cy, Math.max(0, rad - 6), this.GREEN[2], 1, 2, 1, vp);
          for (let k = 0; k < 160; k++) {
            const th = F.hash(k, 11) * Math.PI * 2, rr = rad - TL * (0.15 + F.hash(k, 23) * 1.3);
            if (rr <= 0 || F.hash(k, 29) > 1 - (rad - rr) / (TL * 1.5)) continue;
            const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
            if (x < vp.x0 || x > vp.x1 || y < vp.y0 || y > vp.y1) continue;
            g.fillStyle = this.GREEN[k % 3 ? 2 : 3];
            g.fillRect(F.snap(x), F.snap(y), 2, 2);
          }
        }
        if (p > 0.5) {
          const k = (p - 0.5) / 0.5;
          // the edge flares GOLD (in the ring's ink — added over the meadow it was lime)
          F.ring(g, cx, cy, Rp, 'gold', 0.95 - k * 0.6, 2, 1, vp);
          F.ring(g, cx, cy, Rp + 4, 'gold', (1 - k) * 1.0, 2, 1, vp);
          F.ring(g, cx, cy, Rp - 4, 'gold', (1 - k) * 0.5, 2, 1, vp, 0.5);
        }
        g.restore();
      },
    },
    /* WHAT THE LAND WEARS FOR ITS TWENTY DAYS (the playtest's critics: the
       first cut held hundreds of upright tufts in lime and white '+' crosses
       over the whole 8-tile radius for all twenty days — a texture glitch,
       not lush ground). The sprouting is the PLAY's: the sprigs grow in
       behind the wave and, once it has reached the edge, crumble back into
       the meadow in hard steps by the show's end. Then the zone is marked
       with what the house allows and the eye can find: a few CLOVER AND
       FLOWER patches at its heart round the fire (the ground decals'
       language — low, flat, no lime), and the edge itself as a ring of
       muted-gold dots ONLY while the hall is selected — the panel the
       player opens to ask what the hall is doing. Drawn in the GROUND pass
       (R.drawCardGround), under the town, its people and the fog, on ground
       the player knows (grows). */
    CORE_R: 2.6,          // tiles from the fire the lasting patches lie within
    CORE_N: 12,           // …and how many of them, at most
    drawGround(g, e) {
      const c = this.centre();
      if (!c) return;
      const TL = CFG.TILE, F = GrowFX, Rr = this.R, fade = F.tail(e), t = performance.now() / 1000;
      const beat = ((t / this.BEAT) | 0) & 1;
      const p = F.liveP('bountiful_land');
      // the play: sprigs grow in behind the front, then go back into the meadow
      if (p >= 0 && p < 1) {
        const crumble = p < 0.7 ? 0 : (p - 0.7) / 0.3;
        this.sprigs([g], c, Rr * F.ease(p / 0.62), fade, beat, F.view(1), crumble);
      }
      // the twenty days: the patches at the heart, from the moment the wave has passed them
      if (p < 0 || p > 0.3) this.core(g, c, fade);
      // …and the edge, while the hall is selected
      const tc = Bld.tcOf('P');
      if (tc && typeof UI !== 'undefined' && UI.sel && UI.sel.type === 'bld' && UI.sel.id === tc.id)
        F.ring(g, c.x * TL, c.y * TL, Rr * TL, '#b8923a', fade, 2, 1, F.viewPx(1), t * 0.6);
    },
    /* the clover and flowers at the heart: a dozen small flat patches on the
       open ground the player knows within CORE_R of the fire, each where its
       tile's hash puts it (the same patch every frame, no RNG) */
    core(g, c, fade) {
      if (fade <= 0) return;
      const TL = CFG.TILE, F = GrowFX, r0 = Math.ceil(this.CORE_R);
      let n = 0;
      for (let dy = -r0; dy <= r0 && n < this.CORE_N; dy++) for (let dx = -r0; dx <= r0 && n < this.CORE_N; dx++) {
        const x = Math.floor(c.x) + dx, y = Math.floor(c.y) + dy;
        if (!MapGen.onBoard(x, y) || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > this.CORE_R) continue;
        const h = F.hash(x * 31 + 7, y * 17 + 3);
        if (h > 0.42 || !this.grows(x, y)) continue;
        n++;
        const px = F.snap((x + 0.2 + F.hash(x, y + 9) * 0.6) * TL), py = F.snap((y + 0.35 + F.hash(y, x + 5) * 0.5) * TL);
        // a clump, never a lone cross: a low spread of leaves with, on half
        // of them, a few blossoms of clover or meadow flower among them
        const L2 = [[-4, 2], [-2, 0], [0, 2], [2, 0], [4, 2], [0, -2]];
        g.fillStyle = this.GREEN[0]; g.fillRect(px - 4, py + 4, 10, 2);       // its shade on the ground
        for (let k = 0; k < L2.length; k++) {
          if (F.hash(x * 13 + k, y * 7) < 0.25) continue;
          g.fillStyle = this.GREEN[k % 2 ? 2 : 3]; g.fillRect(px + L2[k][0], py + L2[k][1], 2, 2);
        }
        if (h >= 0.18) {
          const col = h < 0.3 ? '#f4efe0' : this.BLOOM[1 + (((h * 97) | 0) % 2)];   // white clover, or pink and lilac
          g.fillStyle = col;
          g.fillRect(px - 2, py - 2, 2, 2); g.fillRect(px + 2, py - 4, 2, 2);
          if (h > 0.24) g.fillRect(px + 4, py, 2, 2);
        }
      }
    },
    // every sprig on the ring's open ground out to `grow` (within `v`, the tiles
    // in view), into each target in turn on its own beat (f0, f0 + 1, …) —
    // `crumble` 0..1 of them gone back into the meadow, each on its own hash
    sprigs(gs, c, grow, fade, f0, v, crumble) {
      const TL = CFG.TILE, F = GrowFX, Rr = this.R;
      const x0 = Math.max(Math.floor(c.x - Rr), Math.floor(v.x0)), x1 = Math.min(Math.ceil(c.x + Rr), Math.ceil(v.x1));
      const y0 = Math.max(Math.floor(c.y - Rr), Math.floor(v.y0)), y1 = Math.min(Math.ceil(c.y + Rr), Math.ceil(v.y1));
      let any = false;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!MapGen.onBoard(x, y)) continue;
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        if (d > Rr || d > grow || !this.grows(x, y)) continue;
        const k = Math.min(1, (grow - d) / 1.2) * fade;
        for (let j = 0; j < 3; j++) {
          const h = F.hash(x * 7 + j, y * 13 + 5);
          if (h > 0.46 || (crumble > 0 && F.hash(x * 5 + j, y * 11 + 2) < crumble)) continue;
          const sx = (x + 0.15 + F.hash(x, y * 3 + j) * 0.7) * TL, sy = (y + 0.3 + F.hash(y, x * 5 + j) * 0.6) * TL;
          for (let m = 0; m < gs.length; m++) this.sprig(gs[m], sx, sy, h / 0.46, k, (f0 + m) & 1);
          any = true;
        }
      }
      return any;
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
    /* A GOLDEN DAWN OVER THE TOWN (Imperial: big). The light comes first —
       the whole sky washed warm in one flat step for a breath, then a sun
       rising into the top of the world, three stepped discs of it, held,
       with rays of dots fanning down from it and stars of light glittering
       across the sky. An amber pillar stands up out of the hall to meet it
       and the ground gives a small shake. Then three rings of gold roll out
       from the hall across the town, and every building the light reaches
       catches it — its own silhouette flashing gold, motes lifting off the
       roof, a ring of dots at its foot — and KEEPS a gold sheen until the
       dawn passes, so the town visibly stands bathed in it. */
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
          const oy = s.topPx - H * 0.1 + H * 0.17 * F.ease(p / 0.3), px = Math.max(2, Math.round(4 * dpr));
          // three stepped discs of the card's own light: a halo of gold dots
          // round a gold disc round a cream heart (a great disc of light laid
          // solid over the meadow read as a pumpkin, added as lime)
          F.ring(g, ox, oy, H * 0.2, 'gold', 0.8 * e, px, 1);
          F.ring(g, ox, oy, H * 0.17, 'gold', 0.45 * e, px, 1, null, 0.5);
          for (const [r, a] of [[0.13, 0.62], [0.065, 1]])
            R.glow(g, a * e, () => R.pxDisc(g, ox, oy, H * r, px, 1));
          R.glowHot(g, 0.75 * e, () => R.pxDisc(g, ox, oy, H * 0.03, px, 1));
          F.rays(g, ox, oy, 15, 0.17, 'gold', 0.9 * e, s.t);
          F.glitter(g, 48, 'gold', e, s.t);
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
        const held = GrowFX.env(p, 0.1, 0.2, 0.78, 1);
        GrowFX.flashBld(g, b, k < 1 ? 0.85 * (1 - k * 0.45) : Math.max(0.3 * held, k < 1.6 ? 0.45 * (1.6 - k) / 0.6 : 0));
      },
    },
    // the light keeps its pace across the town
    run(q) { return Math.pow(Math.max(0, Math.min(1, q)), 0.85); },
    // how far past a building the dawn's front has rolled, in its own beats (≤ 0: not yet)
    lightOn(s, p, b) {
      const front = (s.reach || this.REACH) * this.run((p - 0.08) / 0.7);
      return (front - Math.hypot(Bld.cx(b) - s.x, Bld.cy(b) - s.y)) / 1.8;
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
    // a small gold hammer, 8×8 cells, outlined: the works' own pip
    HAMMER: ['.oooooo.', 'oHHHHHHo', 'oSSSSSSo', '.oooHoo.', '...oHo..', '...oHo..', '...oSo..', '...ooo..'],
    hammer(g, x, y, a) {
      a = GrowFX.step(a);
      if (a <= 0) return;
      const C = { o: '#3a2410', H: '#ffd45e', S: '#d8902a' }, x0 = Math.round(x) - 4, y0 = Math.round(y) - 8;
      g.globalAlpha = a;
      this.HAMMER.forEach((row, j) => { for (let i = 0; i < 8; i++) { const c = C[row[i]]; if (c) { g.fillStyle = c; g.fillRect(x0 + i, y0 + j, 1, 1); } } });
      g.globalAlpha = 1;
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
    // the '×2': cream, a hard dark rim, popped up in steps and held, then gone
    pip(g, x, y, q) {
      if (q <= 0 || q >= 1) return;
      const rise = Math.round(Math.min(1, q / 0.18) * 3) * 3, a = q < 0.75 ? 1 : (1 - q) / 0.25;
      GrowFX.tag(g, x, y - rise, '×2', a, '#f2e6cd');
      if (q < 0.3) {   // the burst it pops out of: eight hard dots running out
        const k = q / 0.3, r = 4 + k * 10;
        for (let i = 0; i < 8; i++) {
          const th = i / 8 * Math.PI * 2;
          GrowFX.mote(g, x + Math.cos(th) * r, y - rise + Math.sin(th) * r * 0.8, '#ffcc40', null, 1 - k);
        }
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
          // sawdust thrown off the works' foot
          const foot = sp.y * TL - 2;
          for (let k = 0; k < 10; k++) {
            const h1 = F.hash(i * 17 + k, 9), h2 = F.hash(k * 3, i + 21), t = Math.min(1, q * 1.3);
            const a = -Math.PI / 2 + (h1 - 0.5) * 2.4, v = TL * (1.6 + h2 * 1.4);
            const x = cx + Math.cos(a) * v * t, y = foot - TL * 0.2 + Math.sin(a) * v * t + 0.5 * TL * 7 * t * t;
            const al = F.step(t < 0.75 ? 1 : (1 - t) / 0.25);
            if (al <= 0) continue;
            g.globalAlpha = al; g.fillStyle = this.CHIP[k % 3];
            g.fillRect(F.snap(x), F.snap(y), k % 4 ? 2 : 4, 2);
          }
          g.globalAlpha = 1;
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
        const bob = ((now * 2 + (w.id || 0) * 0.37) % 2) < 1 ? 0 : 1;   // a one-pixel bob, in steps
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
      // the murk is a FRONT about half a screen deep — weather passing over, with
      // a thin haze where it has been — never a sheet over the whole frame
      const lo = Math.min.apply(null, pr), hi = Math.max.apply(null, pr), span = hi - lo, band = span * 0.5;
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
        /* THE CELL IS THE ART'S OWN PIXEL — 2 world px at the camera's zoom,
           in device px. A fixed 10 css px made cells five or six times the
           art's pixel on a phone, and laid over the whole screen the pall read
           as a censor's mosaic over the town, not as weather. The lumps keep
           their size on screen (`sc` maps a cell back to the old lattice). */
        const Wd = R.cv.width, Hd = R.cv.height, dpr = R.dpr || 1;
        const cell = Math.max(4, Math.round(2 * R.cam.z * dpr)), sc = cell / (10 * dpr);
        const haze = F.step(0.2 * fade), T = s.t, M = this.murkRGB();
        /* ONE PIXEL A CELL: the murk is written into a small buffer, a pixel
           per cell, and laid over the frame in one blit scaled up with
           smoothing off — the same hard cells, without tens of thousands of
           fills (measured ~15ms a frame drawn cell by cell on a software
           canvas) */
        const cw = Math.ceil(Wd / cell), ch = Math.ceil(Hd / cell), buf = this.murkBuf(cw, ch), u32 = buf.u32;
        u32.fill(0);
        // a cell's colour as one little-endian word (ABGR in memory: R, G, B, A bytes)
        const word = (rgb, a) => ((Math.round(a * 255) << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
        // depth behind the edge is LINEAR across the grid: one add a cell, never a recompute
        const dx = -cell * fr.ux / fr.band, dy = -cell * fr.uy / fr.band, d00 = (fr.front - 0.5 * cell * (fr.ux + fr.uy)) / fr.band;
        /* the churning field on every second cell (every third where the
           cells are small — a big screen at a far zoom), eased between: it
           is smooth value noise, its lumps a dozen cells across, so thinning
           its samples moves nothing the eye can see, and the cells stay hard
           where the threshold cuts them. Sampled only near the front (past
           it there is haze or nothing). */
        const st = cell < 8 ? 3 : 2, qw = Math.ceil(cw / st) + 2, qh = Math.ceil(ch / st) + 2, fld = this.murkField(qw * qh);
        const marg = st * (Math.abs(dx) + Math.abs(dy));
        for (let qy = 0; qy < qh; qy++) for (let qx = 0; qx < qw; qx++) {
          const gx = qx * st, gy = qy * st, d = d00 + gx * dx + gy * dy;
          fld[qy * qw + qx] = d < -0.14 - marg || d > 1.04 + marg ? 0
            : F.blob(gx * sc, gy * sc, 6, T * 0.5) * 0.65 + F.blob(gx * sc + 57, gy * sc + 31, 2.5, T * 0.9) * 0.35;
        }
        const hazeW = haze > 0 ? word(M[3], haze) : 0;
        const tones = [0, 1, 2].map(k => [word(M[k], F.step(fade * [0.66, 0.56, 0.6][k])), word(M[k], F.step(fade * 0.7 * [0.66, 0.56, 0.6][k]))]);
        for (let gy = 0; gy < ch; gy++) {
          const qy = (gy / st) | 0, row = gy * cw, qrow = qy * qw, ey = (gy - qy * st) / st;
          let depth = d00 + gy * dy;
          for (let gx = 0; gx < cw; gx++, depth += dx) {
            if (depth < -0.14) continue;
            if (depth > 1.04) {
              if (hazeW && (depth >= 1.16 || F.hash(gx * 7 + 3, gy * 11 + 1) <= 0.5)) u32[row + gx] = hazeW;
              continue;
            }
            const qx = (gx / st) | 0, q = qrow + qx, ex = (gx - qx * st) / st;
            const top = fld[q] + (fld[q + 1] - fld[q]) * ex, bot = fld[q + qw] + (fld[q + qw + 1] - fld[q + qw]) * ex;
            const e = top + (bot - top) * ey - (depth < 0 ? 0.6 - depth * 2.4 : 0.26 + depth * 0.42);
            if (e <= 0) continue;
            u32[row + gx] = tones[e > 0.2 ? 2 : e > 0.07 ? 1 : 0][depth > 0.7 ? 1 : 0];
          }
        }
        buf.g.putImageData(buf.img, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(buf.cv, 0, 0, cw * cell, ch * cell);
        g.globalAlpha = 1;
        // spores riding the murk, swirling up as it rolls, a dark underside
        // to each so they read against bright grass and dark woods alike
        const sp = Math.max(2, Math.round(2 * R.cam.z * dpr));   // the art's pixel, as the murk's
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
    murkRGB() { return this._rgb || (this._rgb = this.MURK.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)))); },
    // the murk's one-pixel-a-cell buffer and its half-resolution field (render state — never in S)
    _fld: null,
    murkField(n) { if (!this._fld || this._fld.length < n) this._fld = new Float32Array(n); return this._fld; },
    _buf: null,
    murkBuf(w, h) {
      let B = this._buf;
      if (!B || B.w !== w || B.h !== h) {
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        const img = g.createImageData(w, h);
        B = this._buf = { cv, g, w, h, img, u32: new Uint32Array(img.data.buffer) };
      }
      return B;
    },
    SPORE: ['#b6bba2', '#9aa27a', '#d4d8bf'],
    /* while it lasts, every rival field and station IN SIGHT stands greyed
       and withered — its own silhouette washed a dead grey-green, dull specks
       over the plot, grey spores drifting off it. Drawn ON THE BUILDING
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
        (resolved ? '. ' + resolved + ' work' + s(resolved) + ' already under way ' + (resolved === 1 ? 'was' : 'were') + ' finished' +
          // (nothing to hand back — never "free paid for it comes back")
          (Object.keys(back).length ? ', and ' + Bld.costStr(back) + ' paid for ' + (resolved === 1 ? 'it' : 'them') + ' comes back' : '') : '') + '.');
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
          const sc = F.toScreen(s.x, s.foot), W = R.cv.width, H = R.cv.height, dpr = R.dpr || 1;
          const ox = Math.max(0, Math.min(W, sc.x)), px = Math.max(2, Math.round(4 * dpr));
          // where the pillar meets the top of the world: a burst of the card's
          // light in three stepped discs — a halo of gold dots round a gold
          // disc round a cream heart
          F.ring(g, ox, 0, H * 0.24, 'gold', 0.8 * e, px, 1);
          F.ring(g, ox, 0, H * 0.2, 'gold', 0.45 * e, px, 1, null, 0.5);
          for (const [r, a] of [[0.15, 0.62], [0.075, 1]])
            R.glow(g, a * e, () => R.pxDisc(g, ox, 0, H * r, px, 1));
          R.glowHot(g, 0.75 * e, () => R.pxDisc(g, ox, 0, H * 0.035, px, 1));
          F.rays(g, ox, -H * 0.04, 15, 0.2, 'gold', 0.9 * e, s.t);
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
        // THE PILLAR
        const up = Math.min(1, p / 0.1), thin = p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.2);
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
        // THE LIGHT RUNS OUT TO EVERY BUILDING (each rises in its own light in
        // the building pass — show.drawBld below)
        for (const it of s.items) {
          const a0 = 0.2 + 0.46 * (it.d / s.maxD), land = a0 + 0.07;
          if (p < a0) continue;
          const bx = it.x * TL, by = it.y * TL;
          if (p < land) {
            const k = (p - a0) / 0.07;
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
          const k = (p - land) / 0.2;
          if (k >= 1 || bx < vp.x0 || bx > vp.x1 || by < vp.y0 || by > vp.y1 + TL) continue;
          if (!it.rung) { it.rung = 1; F.sfx('rise'); }
          const bf = by + it.sz * TL * 0.5;
          F.column(g, bx, bf, bf - TL * (1.4 + it.sz * 0.7) * F.ease(k * 2.5), TL * 0.75 * it.sz * (1 - k), 1 - k);
          F.ring(g, bx, bf - 2, TL * (0.4 + it.sz * 0.9 * F.ease(k)), 'gold', (1 - k) * 0.95, 2, 0.5, vp);
          for (let m = 0; m < 6; m++) {
            const h = F.hash(it.id, m + 3);
            F.mote(g, bx + (h - 0.5) * TL * it.sz, bf - TL * 0.4 - k * TL * (0.8 + h), m % 2 ? '#fff1b8' : '#ffd45e', '#7a4a0a', 1 - k);
          }
        }
      },
      /* the hall, then every building, RISES IN ITS OWN LIGHT — its silhouette
         flashed gold on its own art in the building pass (R.drawCardBld), so
         whoever is at work on it stands in front of the light */
      drawBld(g, b, s, p) {
        const F = GrowFX;
        if (b.id === s.tc) { if (p > 0.06 && p < 0.5) F.flashBld(g, b, 0.9 * F.env(p, 0.06, 0.12, 0.3, 0.5)); return; }
        const it = (s._byId || (s._byId = new Map(s.items.map(z => [z.id, z])))).get(b.id);
        if (!it) return;
        const k = (p - (0.2 + 0.46 * (it.d / s.maxD) + 0.07)) / 0.2;
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
    // the card lands ON the works when they stand (DeckUI._dest), else on the hall
    dest() { return GrowFX.wonderSite(); },
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
      Deck.run().charges.marble = 1;
      const w = Deck.wonderOf('P'), back = {};
      if (w && w.paid) for (const k in w.paid) {
        const n = Math.floor((w.paid[k] || 0) * this.CUT);
        if (n > 0) { back[k] = n; w.paid[k] -= n; S.res[k] = (S.res[k] || 0) + n; }
      }
      const tc = Bld.tcOf('P');
      const at = w ? { x: Bld.cx(w), y: Bld.cy(w), foot: w.y + Bld.size(w), sz: Bld.size(w), site: 1, bx: w.x, by: w.y }
        : tc ? { x: Bld.cx(tc), y: Bld.cy(tc), foot: tc.y + Bld.size(tc), sz: Bld.size(tc), site: 0 }
        : Object.assign(GrowFX.mid(), { foot: GrowFX.mid().y + 1, sz: 2, site: 0 });
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
          // the marble-white flare HELD through the courses, then let go
          const e = F.env(p, 0, 0.08, 0.66, 0.96);
          if (e <= 0) return;
          const fl = F.step(F.env(p, 0, 0.03, 0.1, 0.22));
          // marble light is PALE, not lime: the frame graded toward stone-white
          // (R.goldWash in the pale tone) — a pale fill added over the meadow went green
          if (fl > 0) R.goldWash(g, 0.3 * fl, 0, 0, null, null, 'pale');

          const sc = F.toScreen(s.x, s.foot);
          F.rays(g, Math.max(0, Math.min(R.cv.width, sc.x)), -R.cv.height * 0.05, 9, 0.16, 'pale', 0.7 * e, s.t);
          F.glitter(g, 36, 'pale', e * 0.85, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL, half = s.sz * TL / 2, M = this.MARBLE;
        // each course lands with a thud: dust rolls out from under the works
        // (the placement dust — render one-shots, never in S) and the ground shakes
        for (const [at, k] of [[0.24, 'd1'], [0.42, 'd2'], [0.6, 'd3']]) {
          if (p < at || s[k]) continue;
          s[k] = 1;
          if (s.site && R.startPlacePoof) R.startPlacePoof(s.bx, s.by, s.sz, { scale: 0.75 + at * 0.4 });
          if (R.shakeAt) R.shakeAt(2 + at * 4, 0.35);
          F.sfx('rise');
        }
        F.column(g, cx, foot, foot - TL * (3 + s.sz) * F.ease(p / 0.15), TL * s.sz * 0.9 * (1 - p), F.env(p, 0, 0.08, 0.3, 0.7), 'pale');
        F.ring(g, cx, foot - 2, TL * (0.4 + s.sz * 0.9 * F.ease(p / 0.5)), 'pale', (1 - p) * 0.9, 2, 0.5);
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
    /* a foundation WAITING for a Wonder not yet laid is a running card: it
       wears a chip on the strip (DeckUI._timers) until the ground is broken
       and it is laid — kept under 'foundation', which the strip maps back to
       this card. Without it the charge ran unseen and uncounted. */
    chargeKey: 'foundation',
    chip(n) {
      n = n | 0;
      return n > 0 ? { label: '×' + n, frac: 1, words: n + (n === 1 ? ' foundation' : ' foundations') } : null;
    },
    // the card lands ON the works when they stand (DeckUI._dest), else on the hall
    dest() { return GrowFX.wonderSite(); },
    work() { return CFG.BUILDINGS.wonder.levels[0].time; },
    floor() { return (1 - this.CAP) * this.work(); },
    // `look`: laid by the ground breaking (Bld.place), not by a card the play
    // sequence already carried to the works — bring them on screen
    lay(w, look) {
      const before = w.construction;
      w.construction = Math.max(Math.min(before, this.floor()), before - this.GAIN * this.work());
      const at = { x: Bld.cx(w), y: Bld.cy(w), foot: w.y + Bld.size(w), sz: Bld.size(w), bx: w.x, by: w.y };
      if (look) GrowFX.look(at.x, at.y);
      GrowFX.show('wonders_foundation', at);
      if (window.R && R.shakeAt) R.shakeAt(6, 1.6);
      GrowFX.sfx('foundation');
      Deck.say('🗿 The first stones were already here: your Wonder gains ' + Math.round(before - w.construction) +
        ' days of work and stands ' + Math.round((1 - w.construction / this.work()) * 100) + '% raised.');
      return before - w.construction;
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
          const sc = F.toScreen(s.x, s.foot);
          F.rays(g, Math.max(0, Math.min(R.cv.width, sc.x)), -R.cv.height * 0.04, 13, 0.18, 'gold', 0.75 * e, s.t);
          F.glitter(g, 40, 'gold', e, s.t);
          return;
        }
        const TL = CFG.TILE, cx = s.x * TL, foot = s.foot * TL;
        if (s.pending) {
          const q = F.ease(p / 0.8);
          F.ring(g, cx, foot, TL * (2.6 - q * 2.2), 'gold', 1 - p, 2, 0.5, null, p * 12);
          F.ring(g, cx, foot, TL * (1.8 - q * 1.6), 'gold', (1 - p) * 0.8, 2, 0.5, null, -p * 9);
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
          // in the ramp's ink, laid opaque: gold added over the earth went lime
          g.save();
          R.inkOn(g, 0.8 * cr);
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
              g.fillStyle = R.goldInk(st % 3 ? 0.7 * cr : cr) || g.fillStyle;
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
          // the lit edge where the face turns to the light, and the crown's lip
          g.fillStyle = '#b8ad95'; g.fillRect(L, top + 6, 2, F.snap((gy - top - 6) * 0.7));
          g.fillStyle = '#ddd2b8'; g.fillRect(L + lean + 2, top, 2, 2);
          /* A CUP-AND-RING carved in the face — the old people's sign, cut
             dark with a lit lower lip: a cup and a ring of dots round it (two
             rings on the biggest stones). While the pillar stands, gold light
             wells up out of the carving: these were waiting for this. */
          const fh = gy - top - 6;
          if (fh >= 14 && bw >= 12) {
            const mx = F.snap(L + bw * 0.46), my = F.snap(top + 6 + fh * 0.4);
            const rings = bw >= 18 && fh >= 24 ? [4, 8] : [4];
            const cut = [[mx, my]];
            for (const rr of rings) {
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
            const glow = F.step(F.env(p, 0.3, 0.38, 0.74, 0.92) * q * a);
            if (glow > 0) {
              g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow;
              g.fillStyle = '#ffb030';
              for (const [x, y] of cut) g.fillRect(x, y, 2, 2);
              g.fillStyle = '#fff1b8'; g.fillRect(mx, my, 2, 2);
              g.restore();
              g.globalAlpha = a;
            }
          }
          g.globalAlpha = 1;
          if (q < 1) for (let m = 0; m < 4; m++)   // earth falling off the rising stone
            F.mote(g, gx + (F.hash(m, tx + ty * 5) - 0.5) * bw, top + q * 10 * (m + 1), m % 2 ? '#6e5638' : '#8a6e46', null, (1 - q) * a);
        }
        // 3. the pillar out of the middle, and rings of dots across the ground
        const pl = F.env(p, 0.28, 0.36, 0.7, 0.9);
        if (pl > 0) {
          const topY = R.cam.y - 60 / R.cam.z, mid = foot - n * TL / 2;
          F.column(g, cx, mid, mid - (mid - topY) * F.ease((p - 0.28) / 0.1), TL * 1.8 * pl, pl);
          for (let k = 0; k < 3; k++) {
            const q = (p * 2 + k / 3) % 1;
            F.ring(g, cx, mid, TL * (1 + q * 4), 'gold', (1 - q) * 0.9 * pl, 2, 0.6, F.viewPx(2));
          }
        }
        // (the pillar's landing is the blow: no whole-frame flash, which over
        // the meadow is a sepia frame)
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
