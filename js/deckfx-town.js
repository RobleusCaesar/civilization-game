"use strict";
/* THE CARD SYSTEM — TOWN — goods and the town's own defences: Fallen Timber,
   Loose Stone, Gold Nugget, Trade Caravan, Mending, Master Builders,
   Watchfires, Stone Skin, Unbreakable Hall (tests/deck-town.mjs).

   The contract every entry keeps is in js/deckfx.js (the engine) and
   js/deck.js (Deck.play, the one door); a card's own moment in the world is
   its `show` (R.startCardShow, js/render.js), and a running card's look is
   its `drawLive`. What each card IS is its text in Deck.CATALOG — the
   numbers below are the text's numbers, read from the catalog where it
   carries them (days) and named once here where it does not.

   THE RULES THESE NINE KEEP:
   1. GOODS ARE A GIFT, NOT A HARVEST. The four goods cards add to the
      stockpile and to nothing else: S.stats.gathered (the score's harvest
      line) is never touched, and no draw is made from the run's RNG.
   2. THE HOOKS ASK THE METHOD, AND ANSWER THE BLOW UNTOUCHED WITH NO CARD
      RUNNING. Three rides live in other files, each one guard and one
      call: Bld.damage asks Deck.bldTakes (Stone Skin halves a blow on the
      player's works, the Unbreakable Hall keeps its last sliver — both
      paths, the wilds' fire and an attack, because both reach the hall
      through the one subtraction); the tower fire asks Deck.mult for
      'towerRange' and 'towerAtk' (Watchfires, the player's own only —
      Deck.mult's numbers are the player's by construction — and the L1
      fumble's G.rand draw stays exactly where it was; the farther band
      only takes a mark on ground the player can see, since it can poke
      past the tower's own sight — the PLAYER's sight, so that gate, and
      the burning arrow that is the card's look, are asked of the player's
      towers alone: another card's factor on the rival's arrows, a softener
      under 1 included, must never dress them as the watchfires); the
      placement confirm asks Deck.masterHand and hands a charge to
      Deck.masterRaise.
   3. THE NUMBER SHOWN IS THE NUMBER TAKEN. Bld.damage now returns what the
      building actually lost, and Combat.hitBuilding floats THAT — a halved
      blow reads as half, and a blow the ward swallows whole reads "Held!".
      With no card running the return is the blow itself, so the float is
      byte for byte the old one. The hp keeps the exact fraction; the float
      is a whole number like every other, and a sliver of a blow reads -1.
   4. A CHARGE IS SPENT ONLY ON A BUILDING THE PLAYER PLACES AND PAYS FOR.
      Master Builders lives on the placement confirm — never inside
      Bld.place, where the rival's ten placements and a wall line-drag (one
      drag, three sections, three charges gone and a line finished across
      its own choke — tests/work-order.mjs) would reach it. Never the
      Wonder (finish() on a wonder IS the win), never walls or gates (the
      card says so). The site is laid with no builder pulled off anything to
      walk to it; a station that needs hands takes the hand the player chose,
      or the nearest idle one, exactly as the builder would have stayed on.
      It goes through Bld.finish, so the done chime, the homestead, the
      taming, the reveal and the build tally all follow — the building was
      placed and PAID for, so it is scored like any other (the card saves
      days, not goods; ruling 6 spares only what a card makes FREE).
   5. MENDING TOUCHES WHAT IS STANDING. Every finished building of the
      player's, walls and gates included and a building in scaffolding for
      an upgrade with them, to full; a work SITE is fragile by design
      (Bld.siteStartHp) and is left as it is. The fires go out by
      themselves: the burn is keyed to hp (Bld.burnPhase).
   6. EVERYTHING HERE THAT IS NOT THE RUN IS RENDER STATE. Shows, the
      beacons' ignition, the glints off stone, the ward's flare: none of it
      is in S, so a save mid-show simply loads without it.
   7. AN OVERLAY WEARS THE PICTURE THE BUILDING PASS DREW (R.wornSprite),
      so a burned building under a card's light is still burned, and its
      shape is laid at the DEVICE'S own size into ONE shared scratch each
      time it is wanted (TX.dev) — never a copy per sprite or per colour held
      for the session, on the frames a phone is likeliest to purge canvases.
   8. THE GOODS' MOMENT IS NEVER CULLED: they play at the bar, and the play
      brings the hall on screen first (showAtHall, js/deckui.js _dest).

   PRESENTATION scales with the tier: Stone a small, satisfying beat at the
   hall's door (the goods come down in a shaft of the tier's own light onto
   ground nobody is standing on, the stone as the map's own ore boulders);
   Bronze warmer (a laden cart rolling in beside its pile, a building rising
   in gold, beacons catching on every tower); Iron dramatic (a cold flash, a
   shake, a wave of runes); Enlightenment held — the sky darkens, a pillar
   of gold comes down on the hall, the ground shakes, a dome rises.
   THE EFFECTS ARE DRAWN AT THE DEVICE'S OWN RESOLUTION (operator ruling,
   2026-10-27: "improve the quality of the map special effects… higher pixel
   count" — it supersedes the hard-pixel house style for every effect here):
   the goods, the cart, the ox, the logs and stones, the buildings turned to
   stone stay the world's pixel ART; every LIGHT (the shafts, the lance, the
   rays, rings, sparks, motes, the dome, the scans) and every effect thrown
   off the art (dust, chips, leaves, embers) is a smooth antialiased path or
   gradient at fractional coordinates, through the shared helpers in
   js/render.js (R.fxRing, fxSpark, fxDot, fxBeam, fxRays, fxGlow, fxLight)
   or the few below built the same way (TX.taper, TX.line, TX.lit) — never a
   cell on the art's 2px grain, a stepped dither or alpha, or a small canvas
   blown up nearest-neighbour. Three rulings still hold, because they are
   about reading the map: THE LIGHT IS GOLD, NOT LIME (a body of the tier's
   light turns what it falls on to its own hue, tied to the light — R.FX_TIE
   — and then brightens it, never gold ADDED over the meadow), no warm light
   pooled flat on the ground, and nothing drawn in the off-map black.
   Culled to the camera, nothing drawn while nothing is in play. */
(() => {
  // the art's own 2px grid — for the ART these cards draw (a stone block,
  // a flame with no strip loaded) and never for a light (the operator's
  // ruling of 2026-10-27: every effect is drawn at the device's resolution)
  const PX = 2;
  const sn = v => Math.round(v / PX) * PX;
  const cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const eo = t => 1 - (1 - t) * (1 - t);
  // a stable 0..1 hash (render jitter that never draws an RNG)
  const hs = (a, b) => ((Math.imul((a | 0) + 0x9e37, 2654435761) ^ Math.imul((b | 0) + 7919, 40503)) >>> 0) % 10007 / 10007;
  const AP = () => ART.PALETTE;
  const TLs = () => CFG.TILE;

  /* ---------------- the shared pictures ---------------- */
  const TX = {
    tc() { return Bld.tcOf('P'); },
    /* THE SAFE VIEW (the playtest, on a 390 px phone: the pile was pushed
       east off villagers' feet and landed at the screen's right edge, its
       "+200 wood" cut to "+200 woo"): the part of the screen nothing of the
       HUD lies over, in WORLD px — below the top bar, the minimap and the
       toast column (two toasts' room under where it starts), above the
       bottom bar, `pad` tiles (1) in from either side. A moment a card plays
       for the player lands INSIDE it, and every number it raises is fitted
       to it (label). Read off the live DOM, so a folded minimap or an open
       panel is measured as it stands; a bar that is not shown measures
       nothing, and with no DOM at all it is the bare view. */
    TOAST_ROOM: 64,
    safeRect(pad) {
      const TL = TLs(), z = R.cam.z || 1;
      pad = pad == null ? 1 : pad;
      const de = document.documentElement;
      const vw = (de && de.clientWidth) || R.viewW(), vh = (de && de.clientHeight) || R.viewH();
      const box = id => {
        const el = document.getElementById(id);
        if (!el || getComputedStyle(el).display === 'none') return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 ? r : null;
      };
      let top = R.topReserve || 0, bot = vh - (R.bottomReserve || 0);
      const tb = box('topbar'), mm = box('miniWrap'), bb = box('bottombar'), ts = box('toasts');
      if (tb && tb.height > 0) top = Math.max(top, tb.bottom);
      if (mm && mm.height > 0) top = Math.max(top, mm.bottom);
      if (ts) top = Math.max(top, ts.top + this.TOAST_ROOM);
      if (bb && bb.height > 0) bot = Math.min(bot, bb.top);
      const r = { x0: R.cam.x + TL * pad, x1: R.cam.x + vw / z - TL * pad,
        y0: R.cam.y + top / z + TL * 0.25, y1: R.cam.y + bot / z - TL * 0.25, top, bot, vw, vh };
      if (r.x1 - r.x0 < TL || r.y1 - r.y0 < TL) {   // a degenerate band: the bare view
        r.x0 = R.cam.x; r.x1 = R.cam.x + vw / z; r.y0 = R.cam.y; r.y1 = R.cam.y + vh / z;
      }
      return r;
    },
    // is a world-px box wholly inside the safe view?
    inSafe(x0, y0, x1, y1, sr) {
      sr = sr || this.safeRect();
      return x0 >= sr.x0 && x1 <= sr.x1 && y0 >= sr.y0 && y1 <= sr.y1;
    },
    // bring a world point (tiles) to the middle of the safe view
    bring(tx, ty) {
      const sr = this.safeRect(0), z = R.cam.z || 1, TL = TLs();
      R.cam.x = tx * TL - sr.vw / z / 2;
      R.cam.y = ty * TL - (sr.top + (sr.bot - sr.top) / 2) / z;
      if (R.clampCam) R.clampCam();
    },
    /* WHERE THE GOODS COME DOWN: open ground at the hall's door, a picture's
       footing and never a rule — ground nobody is standing on (the pile is
       not laid across a villager's feet), at or below the door's row (a pile
       behind the hall would be drawn over its roof), whose pile, the count
       over it and the light's foot all lie INSIDE the safe view — nearest
       the door on the hall's open `side` (+1 east, -1 west). Relaxed a step
       at a time: anyone's feet, then any row beside the hall, then any open
       ground in view; and when nothing near the hall is in view, `look`
       brings the door to the middle of the safe view first (the play's own
       landing: the world is still) and asks again. Ties fall in scan order,
       so a play seats the same way twice. */
    spot(tc, side, look) {
      const sz = Bld.size(tc), fx = side > 0 ? tc.x + sz : tc.x - 1, fy = tc.y + sz, TL = TLs();
      const open = (x, y) => MapGen.onBoard(x, y) && Path.passable(x, y, 'P') && !Bld.at(x, y);
      const clear = (x, y) => open(x, y) && !S.units.some(u => Math.abs(u.x - x - 0.5) < 0.9 && Math.abs(u.y - y - 0.6) < 0.8);
      const find = () => {
        const sr = this.safeRect();
        // the pile spans a tile either side, its count rises ~2 tiles over it
        const seen = (x, y) => this.inSafe((x - 0.5) * TL, (y + 0.7 - 2.1) * TL, (x + 1.5) * TL, (y + 1.1) * TL, sr);
        const pick = (r, ok) => {
          let best = null, bd = Infinity;
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const x = fx + dx, y = fy + dy, d = Math.hypot(dx, dy);
            if (d < bd && ok(x, y)) { best = { x, y }; bd = d; }
          }
          return best;
        };
        return pick(5, (x, y) => y >= fy && clear(x, y) && seen(x, y)) ||
          pick(5, (x, y) => y >= fy && open(x, y) && seen(x, y)) ||
          pick(8, (x, y) => y >= tc.y && clear(x, y) && seen(x, y)) ||
          pick(10, (x, y) => open(x, y) && seen(x, y));
      };
      let s = find();
      if (!s && look && typeof R !== 'undefined' && R.cam) { this.bring(fx + 0.5, fy); s = find(); }
      if (!s) s = MapGen.findNear(fx, fy, 4, clear) || MapGen.findNear(fx, fy, 3, open);
      return s ? { x: s.x + 0.5, y: s.y + 0.7 } : { x: Bld.cx(tc) + side * (sz / 2 + 0.5), y: tc.y + sz + 0.5 };
    },
    /* A NUMBER OVER THE GOODS, in the world's own float type (bold 9 px)
       with a one-pixel dark outline round every letter — legible on the
       meadow and on a straw roof alike (gold on thatch read as nothing) —
       laid in hard alpha steps. `lines` stack downward from (x, y), the
       block's middle at x; the block is FITTED to the safe view once
       (s.lab, so it never creeps) and rises `rise` world px as it goes.
       `avoid` (a world-px rect or a list: the hall's roof, the pile) moves
       the block to the nearest place clear of them all. `k` 0..1 is how far it has
       risen (RISE world px at the most — the fit allows for all of it). */
    RISE: 14,
    label(g, s, key, x, y, lines, a, k, avoid) {
      if (!(a > 0)) return;
      const LH = 11, F = 'bold 9px sans-serif';
      g.save();
      g.font = F;
      const w = Math.max(...lines.map(l => g.measureText(l.t).width)) + 4, h = lines.length * LH + 2;
      const L = s.lab || (s.lab = {});
      let b = L[key];
      if (!b) {
        const sr = this.safeRect(0.25), R0 = this.RISE;
        // fitted to the safe view; the block's whole climb is what must clear the roof
        const fit = (cx, ty) => ({ x: Math.max(sr.x0 + w / 2, Math.min(sr.x1 - w / 2, cx)), y: Math.max(sr.y0 + R0, Math.min(sr.y1 - h, ty)) });
        const boxes = avoid ? [].concat(avoid) : [];
        const hits = q => boxes.some(a => q.x + w / 2 > a.x0 && q.x - w / 2 < a.x1 && q.y + h > a.y0 && q.y - R0 < a.y1);
        avoid = boxes[0];
        // of the places that clear the roof, the one nearest where it wants to be
        // (over its pile): beside the roof, or tucked just under its foot
        const ideal = fit(x, y - h), tries = [ideal];
        if (avoid) tries.push(fit(avoid.x1 + w / 2 + 2, y - h), fit(avoid.x0 - w / 2 - 2, y - h), fit(x, avoid.y1 + R0 + 2));
        const clear = tries.filter(q => !hits(q));
        b = L[key] = clear.sort((a, c) => Math.hypot(a.x - ideal.x, a.y - ideal.y) - Math.hypot(c.x - ideal.x, c.y - ideal.y))[0] || ideal;
      }
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.globalAlpha = cl(a);
      lines.forEach((l, i) => {
        if (l.at != null && s.t < l.at) return;    // a line not yet due holds its place in the block
        this.inkText(g, l.t, b.x, b.y - this.RISE * cl(k || 0) + i * LH, l.col || '#ffd45e');
      });
      g.restore();
    },
    /* A WORD ON A DARK RIM at the device's own resolution: the letters
       stroked in ink round their own outline (a round join, ~1.3 CSS px
       proud of them — never eight copies a whole world pixel apart, which
       at a phone's zoom was a three-pixel smear), then filled. Positions are
       never rounded: a word rising rises smoothly. */
    INK: '#0d0b08',
    inkText(g, t, x, y, col, rim) {
      const w = Math.max(1.4, (rim || 2.6) * R.fxPx(g));
      g.lineJoin = 'round'; g.miterLimit = 2; g.lineWidth = w; g.strokeStyle = this.INK;
      g.strokeText(t, x, y);
      g.fillStyle = col; g.fillText(t, x, y);
    },
    // the side of the hall with more open ground along its door row
    openSide(tc) {
      const sz = Bld.size(tc), y = tc.y + sz;
      let e = 0, w = 0;
      for (let k = 1; k <= 7; k++) {
        if (Path.passable(tc.x + sz - 1 + k, y, 'P') && !Bld.at(tc.x + sz - 1 + k, y)) e++;
        if (Path.passable(tc.x - k, y, 'P') && !Bld.at(tc.x - k, y)) w++;
      }
      return e >= w ? 1 : -1;
    },
    // where a building's picture lands, in world px: the art rect, and the
    // opaque box inside it (fractions of the sprite) — R's own geometry. The
    // picture is the one the building pass DREW (R.wornSprite): a burned
    // building wears its scorched or broken self, crown bitten out, and an
    // overlay cut from the intact sprite would lay the lost roof back over
    // it as a ghost — on exactly the town a ward is played over mid-siege.
    // The worn variants carry the base's _cfArt, so the rect is the same.
    art(b) {
      const TL = TLs(), bs = Bld.size(b), bx = b.x * TL, by = b.y * TL, bw = bs * TL;
      const spr = R.wornSprite ? R.wornSprite(b) : R.bldSprite(b);
      const rc = spr && spr._cfArt ? R.artRect(spr, bx, by, bw, bw) : { x: bx, y: by, w: bw, h: bw };
      const box = spr && R._artBox ? R._artBox(spr) : { l: 0.1, r: 0.9, t: 0.1, b: 0.94 };
      return { spr, rc, box, foot: by + bw };
    },
    crown(b) {
      const a = this.art(b);
      return { x: a.rc.x + (a.box.l + a.box.r) / 2 * a.rc.w, y: a.rc.y + a.box.t * a.rc.h, a };
    },
    /* ============ THE LIGHT AT THE DEVICE'S OWN RESOLUTION ============
       (operator ruling, 2026-10-27, on the effects: "higher pixel count").
       What these cards lay on the world that is not the world's ART — the
       light, and what is thrown off the art (dust, chips, embers) — is drawn
       as smooth antialiased paths and gradients at FRACTIONAL coordinates,
       through the shared light helpers (R.fx*, js/render.js), never snapped
       to the art's 2px grain. Sizes for the thin things are in CSS px
       (R.fxPx), so a thread is as fine on a desktop as on a phone. */

    // a glint off something (a stone's fresh face, a coin, a struck wall):
    // R.fxSpark, its arms `len` WORLD px long (the old star's reach)
    spark(g, x, y, len, a, tone, o) {
      if (!(a > 0.01)) return;
      R.fxSpark(g, x, y, Math.max(2, len / R.fxPx(g)), Math.min(1, a), tone || 'gold', o);
    },
    // a ring of light rolling out on the ground (sy squashes it into perspective)
    halo(g, cx, cy, r, sy, a, tone, css) {
      if (!(a > 0.01) || !(r > 0.5)) return;
      R.fxRing(g, cx, cy, r, Math.min(1, a), tone || 'gold', { squash: sy || 1, css: css || 2 });
    },
    /* A LINE OF LIGHT along any path (a dome's rib, a crack, a rune's
       glow): three strokes, a soft broad one, the tone's bright one and a
       white-hot thread, `o.css` (1.6) CSS px wide — and THE HUE LAST over
       all three (a stack of screens drifts toward lemon: R.fxBeam's rule),
       a device pixel past the broad stroke and tied to the light under it. */
    line(g, path, a, tone, o) {
      o = o || {};
      if (!(a > 0.003)) return;
      const T = R.fxTone(tone || 'gold'), A = R.fxA(a), dv = R.fxDev(g), w = (o.css || 1.6) * R.fxPx(g), K = R.FX_TIE;
      g.save();
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.globalCompositeOperation = 'screen';
      const st = (col, al, lw) => { g.globalAlpha = Math.min(1, al); g.strokeStyle = col; g.lineWidth = lw; path(g); g.stroke(); };
      st(T.ramp[2], A.l * 0.3, w * 3);
      st(T.ramp[3], A.l * 0.75, w);
      st(T.hot, A.l, Math.max(dv, w * 0.36));
      g.globalCompositeOperation = 'color';
      if (g.globalCompositeOperation === 'color') {
        st(T.hue, K * A.l * 0.3, w * 3 + 2 * dv);
        st(T.hue, K * A.l, w + 2 * dv);
      }
      g.restore();
    },
    /* A TAPERED SHAFT OF LIGHT from (x, y0) to (x, y1), `w0` wide at y0 and
       `w1` at y1 (either end may be the narrow one; 0 brings it to a point):
       soft across its width (a conic gradient from where its edges meet, so
       the falloff follows the taper), a white-hot thread up its heart, its
       hue tied to its light. Where conic gradients are unknown it stands as
       R.fxBeam, of its mean width. */
    taper(g, x, y0, y1, w0, w1, a, tone, o) {
      o = o || {};
      if (!(a > 0.003)) return;
      if (y1 < y0) { const t = y0; y0 = y1; y1 = t; const u = w0; w0 = w1; w1 = u; }
      const h = y1 - y0;
      if (h < 0.5 || Math.max(w0, w1) <= 0) return;
      const T = R.fxTone(tone || 'gold'), A = R.fxA(a), K = R.FX_TIE;
      const narrowTop = w0 <= w1, wn = Math.min(w0, w1), ww = Math.max(w0, w1);
      if (!g.createConicGradient || ww - wn < ww * 0.04) {
        R.fxBeam(g, x, y1, y0, (w0 + w1) / 2, a, T, { core: o.core == null ? 1.2 : o.core });
        return;
      }
      // where the two edges meet, and the half-angle they open at
      const reach = h * ww / (ww - wn), ay = narrowTop ? y1 - reach : y0 + reach;
      const half = Math.atan2(ww / 2, reach), mid = narrowTop ? Math.PI / 2 : -Math.PI / 2, f = 2 * half / (Math.PI * 2);
      const core = o.core == null ? 0.35 : o.core;
      const lift = c => A.l * (Math.pow(1 - c, 1.7) * (1 - core * 0.4) + core * Math.pow(Math.max(0, 1 - c * 4.5), 2));
      const grad = (fn) => {
        const gr = g.createConicGradient(mid - half, x, ay);
        const N = 28;
        for (let i = 0; i <= N; i++) { const u = i / N, c = Math.abs(2 * u - 1), v = fn(c); gr.addColorStop(u * f, R._fxC(v[0], v[1])); }
        gr.addColorStop(Math.min(1, f + 1e-4), 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        return gr;
      };
      const path = () => {
        g.beginPath();
        g.moveTo(x - w0 / 2, y0); g.lineTo(x + w0 / 2, y0); g.lineTo(x + w1 / 2, y1); g.lineTo(x - w1 / 2, y1); g.closePath();
      };
      g.save();
      g.globalCompositeOperation = 'screen';
      g.fillStyle = grad(c => [R._fxRamp(T, Math.min(1, c * 1.1)), lift(c)]); path(); g.fill();
      g.globalCompositeOperation = 'color';
      if (g.globalCompositeOperation === 'color') { g.fillStyle = grad(c => [T.hue, Math.min(1, K * lift(c))]); path(); g.fill(); }
      g.restore();
    },
    /* A BUILDING'S OWN SHAPE AT THE DEVICE'S SIZE: the picture the building
       pass drew (a.spr — its worn self) laid into a shared scratch the size
       its rect takes on the DEVICE (smoothed down as R.blitBld smooths it, so
       the edge is the art's own), every time it is wanted. One scratch per
       `slot` for the whole session, never a copy per sprite or per colour
       (rule 7). Answers { c, x, W, H, k } — the canvas, its context, its
       size and device px per world px — or null. */
    _dev: {},
    DEV_MAX: 640,
    dev(g, a, slot) {
      if (!a || !a.spr || !(a.spr.width > 0)) return null;
      const m = g.getTransform ? g.getTransform() : null, k = m ? Math.hypot(m.a, m.b) || 1 : 1;
      const W = Math.max(1, Math.min(this.DEV_MAX, Math.ceil(a.rc.w * k))), H = Math.max(1, Math.min(this.DEV_MAX, Math.ceil(a.rc.h * k)));
      let c = this._dev[slot || 'a'];
      if (!c) c = this._dev[slot || 'a'] = document.createElement('canvas');
      if (c.width < W || c.height < H) { c.width = Math.max(c.width, W); c.height = Math.max(c.height, H); }
      const x = c.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = 1; x.globalCompositeOperation = 'copy';
      x.imageSmoothingEnabled = a.spr.width > W * 1.02;
      if (x.imageSmoothingEnabled) x.imageSmoothingQuality = 'high';
      x.drawImage(a.spr, 0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
      return { c, x, W, H, k };
    },
    // the scratch laid back over the building's rect on g
    devBlit(g, a, d, op, alpha) {
      g.save();
      if (op) g.globalCompositeOperation = op;
      if (alpha != null) g.globalAlpha = alpha;
      g.imageSmoothingEnabled = true;
      g.drawImage(d.c, 0, 0, d.W, d.H, a.rc.x, a.rc.y, a.rc.w, a.rc.h);
      g.restore();
    },
    /* LIGHT IN A BUILDING'S OWN SHAPE: a body of the tone's light laid
       through the building's drawn picture, its strength down the art set by
       `prof(f)` (f 0 at the rect's top, 1 at its foot; 0..1) — the lift
       first, then the hue tied to it — so a scan is a smooth band of light
       running over the building's own roof and walls, its edges the art's
       own, never a flat silhouette and never a stepped dither. */
    lit(g, a, prof, s, tone) {
      if (!(s > 0.003)) return;
      const T = R.fxTone(tone || 'gold'), A = R.fxA(s), K = R.FX_TIE;
      const pass = (op, fn) => {
        const d = this.dev(g, a, 'lit');
        if (!d) return;
        const gr = d.x.createLinearGradient(0, 0, 0, d.H);
        for (let i = 0; i <= 32; i++) { const f = i / 32, v = fn(cl(prof(f))); gr.addColorStop(f, R._fxC(v[0], v[1])); }
        d.x.globalCompositeOperation = 'source-in'; d.x.fillStyle = gr; d.x.fillRect(0, 0, d.W, d.H);
        d.x.globalCompositeOperation = 'source-over';
        this.devBlit(g, a, d, op);
      };
      pass('screen', v => [R._fxRamp(T, 1 - v), A.l * v]);
      g.save(); g.globalCompositeOperation = 'color'; const hue = g.globalCompositeOperation === 'color'; g.restore();
      if (hue) pass('color', v => [T.hue, Math.min(1, K * A.l * v)]);
    },
    /* A SCAN OF LIGHT down a building, `k` 0..1 of the way from its crown to
       its foot: a hot leading edge and a band trailing behind it, laid on its
       own picture (TX.lit). `tone` names the light (gold unless named);
       `up` runs it from the foot to the crown (a building standing up into it) */
    scan(g, a, k, tone, up) {
      if (!a.spr || k < 0 || k > 1) return;
      const t = a.box.t, b = a.box.b, e = eo(k), f0 = up ? b - (b - t) * e : t + (b - t) * e;
      const tail = (b - t) * 0.42, d = up ? -1 : 1, fade = k < 0.85 ? 1 : (1 - k) / 0.15;
      this.lit(g, a, f => {
        const behind = (f0 - f) * d;                // how far back from the leading edge, in the art's height
        if (behind < -0.02) return 0;
        if (behind < 0) return 1 + behind / 0.02;
        return behind < tail ? Math.pow(1 - behind / tail, 1.6) : 0;
      }, 0.95 * fade, tone);
    },
    /* A SOFT CONTACT SHADOW on the ground under a pile, from x0 to x1 at
       its foot — a dark flattened ellipse, never a bar on the 2px grid */
    shadow(g, x0, x1, y, a) {
      if (!(a > 0.01) || !(x1 > x0)) return;
      const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2 + 2, ry = Math.max(1.6, rx * 0.22);
      g.save();
      g.translate(cx, y); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, 'rgba(20,14,8,' + (0.42 * a).toFixed(3) + ')');
      gr.addColorStop(0.6, 'rgba(20,14,8,' + (0.3 * a).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(20,14,8,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
      g.restore();
    },
    /* A GRAIN thrown off something (dust, earth, a spore): a small round
       speck `r` CSS px across, in its own colour at alpha `a` — not light,
       so no hue pass; round and antialiased, never a square cell */
    grain(g, x, y, r, col, a) {
      if (!(a > 0.01)) return;
      g.save();
      g.globalAlpha = Math.min(1, a); g.fillStyle = col;
      g.beginPath(); g.arc(x, y, Math.max(0.3, r * R.fxPx(g)), 0, Math.PI * 2); g.fill();
      g.restore();
    },
    /* THE MENDING +: a rounded cross `s` world px from its middle to an arm's
       end, gold lit on its upper edges over a fine ink rim, in a small glow
       of its own — a mark, at the device's own resolution */
    plus(g, x, y, s, a) {
      if (!(a > 0.01)) return;
      const T = R.fxTone('gold'), w = s * 0.38, rr = w * 0.5;
      const cross = () => {
        g.beginPath();
        if (g.roundRect) { g.roundRect(x - s, y - w, 2 * s, 2 * w, rr); g.roundRect(x - w, y - s, 2 * w, 2 * s, rr); }
        else { g.rect(x - s, y - w, 2 * s, 2 * w); g.rect(x - w, y - s, 2 * w, 2 * s); }
      };
      R.fxGlow(g, x, y, s * 2.2, 0.55 * a, 'gold', { soft: 2.2 });
      g.save();
      g.globalAlpha = Math.min(1, a);
      g.lineJoin = 'round'; g.strokeStyle = this.INK; g.lineWidth = Math.max(R.fxDev(g) * 1.5, s * 0.3);
      cross(); g.stroke();
      const gr = g.createLinearGradient(x, y - s, x, y + s);
      gr.addColorStop(0, T.hot); gr.addColorStop(0.45, T.ramp[2]); gr.addColorStop(1, T.ramp[1]);
      g.fillStyle = gr; cross(); g.fill('nonzero');
      g.restore();
    },
    // a mote of the tone's light, `rc` CSS px (R.fxDot: a soft bead with a cream heart)
    mote(g, x, y, rc, a, tone) {
      if (!(a > 0.01)) return;
      R.fxDot(g, x, y, rc, Math.min(1, a), tone || 'gold');
    },
    /* A CHIP of stone or timber flying: a small faceted shard `s` world px
       across, turned `rot`, its face in `col` with a lit edge and a dark one
       — opaque, at the device's own resolution */
    shard(g, x, y, s, rot, col, lit, dark) {
      const c = Math.cos(rot), sn2 = Math.sin(rot);
      const P = [[-0.55, -0.35], [0.2, -0.6], [0.6, 0.05], [0.1, 0.55], [-0.5, 0.3]].map(([u, v]) => [x + (u * c - v * sn2) * s, y + (u * sn2 + v * c) * s]);
      g.save();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
      if (dark) { g.strokeStyle = dark; g.lineWidth = Math.max(R.fxDev(g), s * 0.18); g.lineJoin = 'round'; g.stroke(); }
      g.fillStyle = col; g.fill();
      if (lit) {
        g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.lineTo(P[2][0], P[2][1]);
        g.strokeStyle = lit; g.lineWidth = Math.max(R.fxDev(g), s * 0.16); g.stroke();
      }
      g.restore();
    },
    // a leaf drifting: a small pointed oval `s` world px long, turned `rot`
    leaf(g, x, y, s, rot, col, a) {
      if (!(a > 0.01)) return;
      g.save();
      g.globalAlpha = Math.min(1, a); g.translate(x, y); g.rotate(rot);
      g.beginPath(); g.moveTo(-s / 2, 0); g.quadraticCurveTo(0, -s * 0.34, s / 2, 0); g.quadraticCurveTo(0, s * 0.34, -s / 2, 0);
      g.fillStyle = col; g.fill();
      g.restore();
    },
    /* A HAMMER at the device's own resolution — the masons' mark (Master
       Builders' play on the hall, Quick Hands' pip over every works): a
       shaped head on a tapered haft, lit along its top, in the tone's own
       ramp over a dark rim. Its foot (the haft's end) at (x, y), `h` world
       px tall, leaning `lean` radians. */
    hammer(g, x, y, h, ramp, a, lean) {
      if (!(a > 0.01)) return;
      const r = ramp || R.fxTone('gold').ramp, dv = R.fxDev(g), u = h / 9;
      g.save();
      g.globalAlpha = Math.min(1, a);
      g.translate(x, y); if (lean) g.rotate(lean);
      g.lineJoin = 'round';
      const rim = Math.max(dv * 1.2, u * 0.55);
      const head = () => {
        g.beginPath();
        g.moveTo(-4.2 * u, -9 * u + 0.6 * u); g.quadraticCurveTo(-4.2 * u, -9 * u, -3.6 * u, -9 * u);
        g.lineTo(3.6 * u, -9 * u); g.quadraticCurveTo(4.4 * u, -9 * u, 4.4 * u, -8.2 * u);
        g.lineTo(4.4 * u, -6.6 * u); g.quadraticCurveTo(4.4 * u, -6 * u, 3.8 * u, -6 * u);
        g.lineTo(-3.6 * u, -6 * u); g.quadraticCurveTo(-4.2 * u, -6 * u, -4.2 * u, -6.6 * u); g.closePath();
      };
      const haft = () => {
        g.beginPath();
        g.moveTo(-0.75 * u, -6.2 * u); g.lineTo(0.75 * u, -6.2 * u); g.lineTo(0.55 * u, -0.4 * u);
        g.quadraticCurveTo(0, 0.2 * u, -0.55 * u, -0.4 * u); g.closePath();
      };
      // the dark rim round both (the world's own outline language)
      g.strokeStyle = '#2a1a0c'; g.lineWidth = rim * 2;
      haft(); g.stroke(); head(); g.stroke();
      // the haft, timber with a lit edge
      haft(); g.fillStyle = '#7a5530'; g.fill();
      g.strokeStyle = '#b08450'; g.lineWidth = Math.max(dv, u * 0.35);
      g.beginPath(); g.moveTo(-0.4 * u, -6 * u); g.lineTo(-0.3 * u, -0.8 * u); g.stroke();
      // the head: a gradient down its face, lit along its top
      head();
      const gr = g.createLinearGradient(0, -9 * u, 0, -6 * u);
      gr.addColorStop(0, r[3]); gr.addColorStop(0.35, r[2]); gr.addColorStop(1, r[0]);
      g.fillStyle = gr; g.fill();
      g.strokeStyle = r[3]; g.lineWidth = Math.max(dv, u * 0.32);
      g.beginPath(); g.moveTo(-3.5 * u, -8.6 * u); g.lineTo(3.7 * u, -8.6 * u); g.stroke();
      g.restore();
    },
    /* A picture laid down with a hard dark outline round its whole silhouette
       — how every object in this world stands off the grass (the boulders',
       the crowns', the bushes' own rule). Drawn into a scratch canvas at the
       DEVICE's own resolution (x, y, w, h in world px; fn draws in world
       coordinates, its art cells laid nearest-neighbour, so the art stays
       the world's pixel art and the cast keeps every pixel of its strips),
       outlined one art pixel (one world px) round in the ink ramp, then laid
       on the frame one scratch pixel to one device pixel. */
    _ink: null,
    /* (`bare`: drawn with no outline of its own — the cast's sprites carry
       theirs. A picture inside a picture — the caravan's cart inside the
       caravan — takes the next scratch down, never the one its maker is
       drawing into.) `dis` 0..1: the picture LEAVING — the whole of it, its
       outline with it, taken down smoothly from one composited image (never
       two half-transparent layers, which read as a ghost, and never a
       dither of holes on the 2px grain, the old hard-step dissolve). */
    _inkD: 0,
    INK_MAX: 2048,
    inked(g, x, y, w, h, fn, dis, bare) {
      if (dis >= 1) return;
      const m = g.getTransform ? g.getTransform() : null, k = m ? Math.hypot(m.a, m.b) || 1 : 1;
      x = Math.floor(x) - 1; y = Math.floor(y) - 1; w = Math.ceil(w) + 3; h = Math.ceil(h) + 3;
      const W = Math.max(1, Math.min(this.INK_MAX, Math.ceil(w * k))), H = Math.max(1, Math.min(this.INK_MAX, Math.ceil(h * k)));
      const kx = W / w, ky = H / h;
      const stack = this._ink || (this._ink = []);
      let K = stack[this._inkD];
      if (!K) K = stack[this._inkD] = { a: document.createElement('canvas'), b: document.createElement('canvas'), c: document.createElement('canvas') };
      if (K.a.width < W || K.a.height < H) {
        K.a.width = K.b.width = K.c.width = Math.max(K.a.width, W); K.a.height = K.b.height = K.c.height = Math.max(K.a.height, H);
      }
      const ga = K.a.getContext('2d'), gb = K.b.getContext('2d'), gc = K.c.getContext('2d');
      ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, W, H);
      ga.imageSmoothingEnabled = false;
      ga.setTransform(kx, 0, 0, ky, -x * kx, -y * ky);
      this._inkD++;
      try { fn(ga); } finally { this._inkD--; }
      ga.setTransform(1, 0, 0, 1, 0, 0);
      gc.setTransform(1, 0, 0, 1, 0, 0); gc.globalCompositeOperation = 'source-over'; gc.globalAlpha = 1; gc.clearRect(0, 0, W, H);
      gc.imageSmoothingEnabled = false;
      if (!bare) {
        gb.globalCompositeOperation = 'copy'; gb.drawImage(K.a, 0, 0, W, H, 0, 0, W, H);
        gb.globalCompositeOperation = 'source-in'; gb.fillStyle = AP().ink[0]; gb.fillRect(0, 0, W, H);
        gb.globalCompositeOperation = 'source-over';
        for (const [dx, dy] of [[-kx, 0], [kx, 0], [0, -ky], [0, ky]]) gc.drawImage(K.b, 0, 0, W, H, dx, dy, W, H);
      }
      gc.drawImage(K.a, 0, 0, W, H, 0, 0, W, H);
      g.save();
      g.imageSmoothingEnabled = false;
      if (dis > 0) g.globalAlpha *= 1 - dis * dis * (3 - 2 * dis);
      g.drawImage(K.c, 0, 0, W, H, x, y, w, h);
      g.restore();
    },
    /* the count over a pile: `lines` from `t0` seconds into the show for
       `dur`, rising as it goes, out in hard steps over its last quarter —
       fitted to the safe view and clear of the hall's roof */
    count(g, s, sp, lines, t0, dur) {
      const tl = s.t - t0;
      if (tl < 0 || tl > dur) return;
      const q = tl / dur, TL = TLs(), tc = Bld.get(s.tc);
      const roof = tc ? (() => { const a = this.art(tc); return { x0: a.rc.x + a.box.l * a.rc.w, x1: a.rc.x + a.box.r * a.rc.w, y0: a.rc.y + a.box.t * a.rc.h, y1: a.foot }; })() : null;
      // …and never over the pile it counts
      const pile = { x0: (sp.x - 1) * TL, x1: (sp.x + 1) * TL, y0: (sp.y - 0.7) * TL, y1: (sp.y + 0.2) * TL };
      this.label(g, s, 'count', sp.x * TL, (sp.y - 0.95) * TL, lines, q < 0.75 ? 1 : (1 - q) / 0.25, eo(Math.min(1, q * 1.6)), roof ? [roof, pile] : [pile]);
    },
    /* PAID ON IMPACT: each piece of the goods steps the bar's held number as
       it LANDS (DeckUI.pay — js/deckui.js; S.res was credited at the play,
       the truth for every rule). `list` is [[t, res, n]] — seconds into the
       show, the resource, how much (none: the rest) — each paid once, on the
       frame its time comes, culled or not (the bar never waits on the
       camera). Guarded on the method it calls: an older deckui.js beside
       this file pays nothing, and its bar simply counts up at the play. */
    settle(s, list, fly) {
      const done = s.paid || (s.paid = {});
      for (let i = 0; i < list.length; i++) {
        const [t, res, n, how] = list[i];
        if (done[i] || s.t < t) continue;
        done[i] = 1;
        // a piece that FLIES into the bar pays when it gets there (TX.flyToBar)
        if (how === 'fly' && fly && fly(list[i], i)) continue;
        if (window.DeckUI && DeckUI.pay) DeckUI.pay(res, n);
      }
    },
    // the goods' own pay list for a show (its pieces' landings), if it names one
    pays(id, s) { const d = Deck.FX[id], sh = d && d.show; return sh && sh.pays ? sh.pays.call(d, s) : []; },
    PAY_MS: 6000,   // the bar's failsafe past the play (DeckUI.pay)
    // a live show of this card that is still running fresh (its render clock), or null
    fresh(id) { return (typeof R !== 'undefined' && R.cardShows) ? R.cardShows.find(x => x.id === id && x.fresh) || null : null; },
    // is a world-px box anywhere near the camera?
    near(x0, y0, x1, y1) {
      const v = R.viewTiles(), TL = TLs();
      return x1 >= (v.x0 - 1) * TL && x0 <= (v.x1 + 1) * TL && y1 >= (v.y0 - 1) * TL && y0 <= (v.y1 + 2) * TL;
    },
    bNear(b) { const TL = TLs(), s = Bld.size(b); return this.near(b.x * TL - TL, b.y * TL - 2 * TL, (b.x + s) * TL + TL, (b.y + s) * TL + TL); },
    // world px → the device pixels the sky layer draws in
    scr(wx, wy) { const z = R.cam.z * R.dpr; return { x: (wx - R.cam.x) * z, y: (wy - R.cam.y) * z, z }; },
    // a flame: the burning houses' own strip, or a stack of hard fire pixels
    flame(g, x, y, s, beat) {
      if (window.Assets && Assets.drawSprite && Assets.drawSprite(g, 'misc/flameBig/' + (beat % 4), x - s / 2, y - s * 0.95, { w: s, h: s })) return;
      const F = AP().fire, h = sn(s * 0.8), w = sn(s * 0.42);
      for (let r = 0; r < h; r += PX) {
        const k = r / h, ww = Math.max(PX, sn(w * (1 - k) * (0.8 + 0.2 * Math.sin(beat + r))));
        g.fillStyle = F[k < 0.3 ? 1 : k < 0.65 ? 2 : 3];
        g.fillRect(sn(x - ww / 2), sn(y - r), ww, PX);
      }
    },
    STONE_LIGHT: 'pale',      // the Stone tier's pale light (R.LIGHT.TONE — Deck.TIERS' stone, lifted)
    BRONZE_LIGHT: 'bronze',   // …and the Bronze tier's warm one
    // a stylesheet a card's look needs, added the first time it is wanted (cards off: never)
    css(id, text) {
      if (typeof document === 'undefined' || document.getElementById(id)) return;
      const st = document.createElement('style'); st.id = id; st.textContent = text;
      document.head.appendChild(st);
    },
    sound(kind) { if (typeof Sound !== 'undefined' && Sound.play) Sound.play(kind); },
    show(id, data) { return (typeof R !== 'undefined' && R.startCardShow) ? R.startCardShow(id, data) : null; },
    // the count over the goods, in gold — held a beat longer than a hit's
    // float (`hold` seconds), since it is the number the card was played for
    float(x, y, txt, hold) {
      if (typeof R === 'undefined' || !R.float) return;
      R.float(x, y, txt, '#ffd45e');
      const f = R.floats && R.floats[R.floats.length - 1];
      if (hold && f && f.txt === txt) f.t = hold;
    },
  };

  /* ---------------- the goods, falling onto a pile at the hall's door ---------------- */
  // a broken block of stone, its foot at (x, y): lit planes up and left, a crack, a
  // chipped corner — the stand-in for the map's ore stamps where Sprites has none (art)
  function block(g, x, y, w, h, i) {
    const S = AP().stone, x0 = sn(x - w / 2), y0 = sn(y - h);
    g.fillStyle = S[2]; g.fillRect(x0, y0 + 2, w, h - 2); g.fillRect(x0, y0, w - 2, 2);
    g.fillStyle = S[3]; g.fillRect(x0, y0, w - 4, 2); g.fillRect(x0, y0, 2, h - 2);
    g.fillStyle = S[4]; g.fillRect(x0 + 2, y0, 2, 2);
    g.fillStyle = S[1]; g.fillRect(x0, y0 + h - 2, w, 2); g.fillRect(x0 + w - 2, y0 + 2, 2, h - 2);
    g.fillStyle = S[0]; g.fillRect(x0 + (i % 2 ? 4 : w - 6), y0 + 2, 2, h - 4);
  }
  /* dust thrown along the ground where something landed `age` seconds ago:
     round grains of the ground's own earth flung out either side and
     settling, smaller and fainter as they go (TX.grain — at the device's own
     resolution, never cells on the 2px grain) */
  function dust(g, x, y, age, n, col, reach) {
    if (age < 0 || age > 0.42) return;
    const q = age / 0.42, a = 0.85 * (1 - q) * (1 - q);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1, row = k >> 1, h = hs(k * 7 + 3, n * 13 + row);
      const d = (2.5 + row * 3.5 + eo(q) * (reach || 34) * (0.7 + 0.5 * h)) * side;
      const lift = Math.sin(Math.min(1, q * 1.4) * Math.PI) * (3 + row * 1.6 + h * 3);
      TX.grain(g, x + d, y - 1.5 - lift, (1.5 - 0.5 * q) * (0.8 + 0.5 * h), col, a);
    }
  }

  /* ================= THE GOODS COME DOWN (the playtest's critics: "a hard
     cream RECTANGLE with a flat bottom and a flat top cut ~250 px above the
     ground — it reads as a stray UI bar, and over grass it reads olive";
     "the heaviest drop has no impact at all") ================= */
  /* THE LIGHT FROM THE SKY: a TAPERED shaft — a thread at the top of the
     view widening to the pile's breadth at the ground — that runs the FULL
     height of the view (the show is clipped to the board, R.drawCardShows):
     soft across its width, a white-hot thread at its heart, the tier's own
     light (TX.taper — its hue tied to its light, so the meadow it falls on
     turns the tier's colour and never lime or olive), drawn at the DEVICE'S
     own resolution: the operator's ruling of 2026-10-27 retired the 2px
     cells and the ordered dither that cut its bands. It breathes a little
     (its width, smoothly), and where it meets the ground it stands in a
     small flare of itself — never a pool across the meadow. */
  TX.SHAFT = { TOP: 3, BREATH: 0.06, HZ: 1.7 };
  /* the shaft over (x, foot), world px, `t` seconds into its life: down out
     of the sky in a breath (its foot falls from the top of the view to the
     ground), held to `hold`, then drawn in to its thread and gone — by its
     width, smoothly. False once it is over. */
  TX.shaft = function (g, x, foot, t, tone, wBot, hold) {
    if (t < 0) return true;
    const SLAM = 0.09, OUT = 0.32;
    if (t > hold + OUT) return false;
    const top = R.cam.y - 8, h = foot - top;
    if (h < 16) return true;
    const out = t <= hold ? 0 : (t - hold) / OUT, k = 1 - eo(out);
    const breath = 1 + this.SHAFT.BREATH * Math.sin(t * Math.PI * 2 * this.SHAFT.HZ);
    const w = wBot * breath * (0.08 + 0.92 * k), down = t < SLAM ? eo(t / SLAM) : 1, y1 = top + h * down;
    // its width where its foot has got to (the taper is the whole shaft's)
    const wTop = this.SHAFT.TOP * (0.4 + 0.6 * k), wFoot = wTop + (w - wTop) * down;
    this.taper(g, x, top, y1, wTop, wFoot, 0.92 * (0.35 + 0.65 * k), tone, { core: 0.45 });
    if (down >= 1) R.fxGlow(g, x, foot - 1, wFoot * 0.8, 0.7 * k, tone, { squash: 0.32, core: 0.25, soft: 2.2 });
    return true;
  };

  /* THE PIECES at the villagers' own density — ONE WORLD PIXEL A CELL (the
     first cut drew on a 2px grid and the critics read "four dark planks").
     Each a small canvas built once, outlined in the ink like everything that
     stands off the grass (TX.inked). */
  const art = (w, h, fn) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    fn((px, py, pw, ph, col) => { x.fillStyle = col; x.fillRect(px, py, pw || 1, ph || 1); }, x);
    return c;
  };
  const rowsArt = (rows, pal) => art(rows[0].length, rows.length, f => rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') f(i, y, 1, 1, pal[r[i]]); }));
  const GA = {
    get(k) { return this['_' + k] || (this['_' + k] = this[k]()); },
    // a log seen END-ON, the way a woodpile shows itself from the high front
    // camera (and the card's own art): the cut face with its rings, the bark
    // running back behind it — 9 wide, 13 tall
    logEnd() {
      const W = AP().wood;
      return art(9, 13, f => {
        f(1, 0, 7, 6, W[1]); f(1, 0, 2, 6, W[3]); f(3, 0, 1, 6, W[2]); f(6, 0, 2, 6, W[0]);
        f(4, 1, 1, 3, W[0]); f(2, 2, 1, 2, W[4]);
        for (const [x, y, w, h] of [[2, 4, 5, 1], [1, 5, 7, 1], [0, 6, 9, 5], [1, 11, 7, 1], [2, 12, 5, 1]]) f(x, y, w, h, '#7a5a30');
        f(2, 5, 5, 1, '#d4b583'); f(1, 6, 7, 5, '#c8a978'); f(2, 11, 5, 1, '#b8955f');
        f(2, 7, 5, 1, '#a88450'); f(2, 9, 5, 1, '#a88450'); f(2, 7, 1, 3, '#a88450'); f(6, 7, 1, 3, '#a88450');
        f(4, 8, 1, 1, '#6e4a26'); f(1, 6, 1, 2, '#e2c898');
      });
    },
    // a log in the air, side-on (it turns end over end as it falls — the angle
    // is the fall's, smooth; the picture is this one)
    logSide() {
      const W = AP().wood;
      return art(20, 7, f => {
        f(0, 1, 17, 5, W[1]); f(0, 1, 17, 1, W[3]); f(0, 2, 17, 1, W[2]); f(0, 5, 17, 1, W[0]);
        f(5, 3, 3, 1, W[0]); f(11, 2, 1, 3, W[0]);
        f(16, 0, 4, 7, '#7a5a30'); f(17, 1, 3, 5, '#c8a978'); f(18, 3, 1, 1, '#6e4a26');
      });
    },
    // the nugget: a lumpy, faceted lump of gold lit up-left — 12 × 10
    nugget() {
      const Gd = AP().gold;
      return rowsArt(['...aaab.....', '..aabbbbc...', '.aabbccbbc..', 'aabbcdccbbc.', 'abbccddcbbcc', 'abbcccccbbcc', '.abbbccbbbcc', '..abbbbbbcc.', '...aabbbcc..', '.....aaa....'],
        { a: Gd[0], b: Gd[1], c: Gd[2], d: Gd[3] });
    },
    // a coin turning over: face, three-quarter, edge — 5 tall
    coins() {
      const Gd = AP().gold;
      return [
        rowsArt(['.bbb.', 'bddcb', 'bdcca', 'bccaa', '.baa.'], { a: Gd[0], b: Gd[1], c: Gd[2], d: Gd[3] }),
        rowsArt(['.bb.', 'bdcb', 'bdca', 'bcca', '.ba.'], { a: Gd[0], b: Gd[1], c: Gd[2], d: Gd[3] }),
        rowsArt(['b', 'd', 'c', 'c', 'a'], { a: Gd[0], b: Gd[1], c: Gd[2], d: Gd[3] }),
      ];
    },
  };
  TX.goodsArt = GA;

  /* A PIECE OF THE GOODS FLIES INTO THE BAR (the nugget's coins, the
     forager's food): a small picture of it lifted off the world at (wx, wy)
     and flown to its resource's chip ABOVE the HUD — a fixed element, since a
     mark on the canvas would pass under the top bar — and the bar's held
     number steps by `n` when it ARRIVES (DeckUI.pay). Render state on the
     page, never in S; with no chip on the page it pays at once. */
  TX.flyToBar = function (res, wx, wy, n, pic, delay) {
    const pay = () => { if (window.DeckUI && DeckUI.pay) DeckUI.pay(res, n); };
    const chip = document.querySelector('#topbar .ric[data-ic="' + res + '"]');
    const r = chip && chip.getBoundingClientRect();
    if (!r || !r.width || !pic) { pay(); return; }
    const z = R.cam.z, sx = (wx - R.cam.x) * z, sy = (wy - R.cam.y) * z, S2 = 14;
    const el = document.createElement('canvas');
    el.width = pic.width; el.height = pic.height;
    el.getContext('2d').drawImage(pic, 0, 0);
    Object.assign(el.style, { position: 'fixed', left: (sx - S2 / 2) + 'px', top: (sy - S2 / 2) + 'px', width: S2 + 'px',
      height: (S2 * pic.height / pic.width) + 'px', imageRendering: 'pixelated', zIndex: 27, pointerEvents: 'none' });
    document.body.appendChild(el);
    const dx = r.left + r.width / 2 - sx, dy = r.top + r.height / 2 - sy;
    const an = el.animate([{ transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * 0.2}px,${dy * 0.2 - 36}px) scale(1.35)`, offset: 0.35 },
      { transform: `translate(${dx}px,${dy}px) scale(.8)` }],
      { duration: 560, delay: delay || 0, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' });
    const done = () => { el.remove(); pay(); };
    an.finished.then(done, done);
  };

  /* A PIECE LANDS: a thud you hear and a puff of the place-poof's own dust
     under it (R.startPlacePoof, render state) — the bar's step rides
     TX.settle's list at the same instant */
  TX.thud = function (wx, wy, sc, voice) {
    if (typeof R !== 'undefined' && R.startPlacePoof) R.startPlacePoof(wx / TLs() - 0.5, wy / TLs() - 0.5, 1, { scale: sc || 0.45 });
    this.sound(voice || 'cardThud');
  };
  /* the pieces in the air and down: `items` [{dx, dy, t0, fall, H, bounce,
     onLand}] → where each is now, its fall's progress q, and whether it is
     down; a landing calls onLand once (render state on the show) */
  TX.fall = function (s, items, px, py) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], tl = s.t - it.t0;
      if (tl < 0) continue;
      const x = px + it.dx;
      if (tl < it.fall) { const q = tl / it.fall; out.push({ it, i, x, y: py + it.dy - it.H * (1 - q * q), q, down: false }); continue; }
      const b = tl - it.fall, bounce = b < 0.12 ? Math.sin(b / 0.12 * Math.PI) * (it.bounce || 0) : 0;
      out.push({ it, i, x, y: py + it.dy - bounce, q: 1, down: true, age: b });
      if (!(s.landed || (s.landed = {}))[i]) { s.landed[i] = 1; if (it.onLand) it.onLand(x, py + it.dy); }
    }
    return out;
  };

  /* ---------------- the caravan ---------------- */
  /* THE CARAVAN IS THE GAME'S OWN CAST (the critics: the first cut's ox,
     drover and cart were drawn in 2px blocks, four times coarser than the
     units beside them, oversized, and read as placeholder art). The ox IS
     the map's cattle — the cow's own walk strip, facing the way it walks —
     and the drover a VILLAGER of the tribe in their walk, both drawn through
     the renderer exactly as it draws its own units (R.unitSprite: the facing
     from how the stand-in moved, the stride driven by the ground it
     covered, the contact shadow its sheet is owed); a stand-in is render
     state on the show, never in S, never a unit. The cart and its load are
     drawn at ONE WORLD PIXEL A CELL — the villagers' own density in the
     world — and outlined in the ink like everything that stands off the
     grass. With no strip loaded the cast's procedural self stands in, as it
     does for every unit. */
  function castFig(s, key, kind, owner, female) {
    // (a positive id far past any unit's: the walk's phase is seeded from it, and a negative one indexes no frame)
    return s[key] || (s[key] = { id: 9e8 + key.length, kind, owner, female: !!female, x: 0, y: 0, hp: 1, maxhp: 1, animT: 0, path: null, pathI: 0 });
  }
  // a stand-in drawn standing on (wx, gy) — gy the ground line in world px
  function drawFig(g, u, wx, gy, moving, dt) {
    const TL = TLs();
    u.x = wx / TL; u.y = (gy + CFG.SPRITE_LIFT - TL / 2 - 2) / TL; u.animT += dt || 0;
    u.path = moving ? [0] : null; u.pathI = 0;
    let img = null;
    try { img = R.unitSprite(u); } catch (e) { img = null; }
    if (!img || !img.width) return;
    const B = R.unitBox(u), D = R.frameBox(u, img, B);
    if (R.sheetUnit(u) && R.drawUnitShadow) R.drawUnitShadow(g, u, u.x, u.y);
    g.drawImage(img, Math.round(u.x * TL - D / 2), Math.round(R.frameTop(u.y, B, D)), D, D);
  }
  // THE LOAD, one world pixel a cell: a sack of grain, a bundle of logs, the strongbox
  GA.sack = () => rowsArt(['..aa..', '.abba.', 'abccba', 'bcddcb', 'bcdccb', 'bccccb', 'bccccb', '.bbbb.'],
    { a: '#5e4a2a', b: '#8a6e44', c: '#b89a68', d: '#d4bb8a' });
  GA.bundle = () => art(12, 10, f => {
    const ring = (x, y) => { f(x + 1, y, 3, 1, '#7a5a30'); f(x, y + 1, 5, 3, '#7a5a30'); f(x + 1, y + 4, 3, 1, '#7a5a30');
      f(x + 1, y + 1, 3, 3, '#c8a978'); f(x + 2, y + 2, 1, 1, '#6e4a26'); f(x + 1, y + 1, 1, 1, '#e2c898'); };
    ring(0, 5); ring(6, 5); ring(3, 1);
    f(0, 7, 11, 1, '#4a3a24');                                   // the rope round it
  });
  GA.chest = () => rowsArt(['.aaaaaaaa.', 'abbbbbbbba', 'acccccccca', 'ainnnninna', 'abbbgybbba', 'abbbggbbba', 'acccccccca', '.aaaaaaaa.'],
    { a: '#3a2814', b: '#6e4a26', c: '#8a6038', n: '#3a3324', g: '#c99b32', y: '#fff2c0', i: '#3a3324' });
  /* THE CART: a two-wheeled ox cart seen side-on, its bed of planks, a rail,
     the shafts forward to the yoke, and the near wheel — rim, four spokes
     turning with the ground it covers (`roll`, world px), the hub. Its bed
     front at (0, gy) world px, facing +x (the caller mirrors it). */
  function cart(g, gy, roll) {
    const W = AP().wood, I = AP().ink;
    const f = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w || 1, h || 1); };
    // the shafts: two poles up to the yoke at the ox's withers
    for (let k = 0; k < 16; k++) { f(k, gy - 11 - (k >> 3), 1, 2, W[0]); }
    // the bed: planks, a lit top rail, the floor's dark line, the stakes
    f(-26, gy - 15, 26, 7, W[2]); f(-26, gy - 15, 26, 1, W[4]); f(-26, gy - 14, 26, 1, W[3]);
    for (let x = -24; x < 0; x += 6) f(x, gy - 13, 1, 5, W[1]);
    f(-26, gy - 9, 26, 1, W[0]); f(-27, gy - 18, 2, 10, W[1]); f(-2, gy - 18, 2, 10, W[1]); f(-27, gy - 18, 2, 1, W[3]);
    f(-26, gy - 8, 26, 1, I[1]);                                  // the axle-tree under it
    // the near wheel: a rim of cells, four spokes, the hub
    const wx = -13, wy = gy - 6, rr = 6, a = roll / rr;
    for (let k = 0; k < 28; k++) { const th = k / 28 * Math.PI * 2; f(Math.round(wx + Math.cos(th) * rr), Math.round(wy + Math.sin(th) * rr), 1, 1, W[0]); }
    for (let k = 0; k < 24; k++) { const th = k / 24 * Math.PI * 2; f(Math.round(wx + Math.cos(th) * (rr - 1)), Math.round(wy + Math.sin(th) * (rr - 1)), 1, 1, W[2]); }
    for (let q = 0; q < 4; q++) { const th = a + q * Math.PI / 2; for (let r2 = 1; r2 < rr - 1; r2++) f(Math.round(wx + Math.cos(th) * r2), Math.round(wy + Math.sin(th) * r2), 1, 1, W[1]); }
    f(wx - 1, wy - 1, 2, 2, W[3]); f(wx, wy, 1, 1, I[0]);
  }
  /* the whole caravan along its road: the cart (bed front at cx), the ox in
     the shafts, the drover at its head with the rope — `dir` ±1 the way it
     faces, `rolled` the ground covered (the wheel), `moving` whether its
     legs walk, `aboard` the load still on the bed (by PILE index) */
  function caravan(g, s, cx, gy, dir, rolled, moving, aboard, dt) {
    const TL = TLs();
    // the beasts and the hand first: the cart is drawn over the ox's hindquarters, as the shafts run
    drawFig(g, castFig(s, '_ox', 'cow', 'W'), cx + dir * 15, gy, moving, dt);
    const dv = castFig(s, '_drover', 'villager', 'P');
    drawFig(g, dv, cx + dir * 34, gy + 1, moving, dt);
    // the lead rope, drover's fist to the ox's nose (a dark thread of cells)
    g.fillStyle = AP().ink[2];
    for (let k = 0; k < 6; k++) g.fillRect(Math.round(cx + dir * (25 + k)), Math.round(gy - 10 + (k < 3 ? k : 5 - k) * 0.5), 1, 1);
    TX.inked(g, cx - 34, gy - 32, 68, 34, gg => {
      gg.save();
      gg.translate(Math.round(cx), 0);
      if (dir < 0) gg.scale(-1, 1);
      cart(gg, gy, rolled);
      // the load on the bed: three sacks, the log bundle, the strongbox on top
      const S2 = GA.get('sack'), Bn = GA.get('bundle'), Ch = GA.get('chest');
      if (aboard[0]) gg.drawImage(S2, -25, gy - 23);
      if (aboard[1]) gg.drawImage(S2, -19, gy - 23);
      if (aboard[2]) gg.drawImage(S2, -22, gy - 29);
      if (aboard[3]) gg.drawImage(Bn, -12, gy - 25);
      if (aboard[4]) gg.drawImage(Bn, -10, gy - 31);
      if (aboard[5]) gg.drawImage(Ch, -16, gy - 33);
      gg.restore();
    });
  }
  // the caravan's reach from its bed front, in px: what the ROAD must carry
  // (the bed back to its tailboard; ahead, the ox and the drover at its head)
  const CART_BACK = 30, CART_FRONT = 44;

  /* ---------------- the hooks' engine (asked from Bld.damage and the placement confirm) ---------------- */
  // the shared pictures, reachable by the contract (tests/deck-town.mjs) and by nothing else
  Deck._townTX = TX;
  Object.assign(Deck, {
    /* THE BLOW A PLAYER BUILDING ACTUALLY TAKES. Asked by Bld.damage for the
       player's works only, before the subtraction, whatever the cause — an
       attack or the wilds' fire. Stone Skin multiplies in (Deck.mult's
       'bldHurt', so a second card of another kind multiplies with it), then
       the Unbreakable Hall caps the blow at what the hall has above its
       sliver — never RAISING a hall already below it. With no card running
       it is one length check and the blow comes back untouched. */
    bldTakes(b, amt, cause) {
      const fx = typeof S !== 'undefined' && S && S.deck && S.deck.fx;
      if (!fx || !fx.length || b.owner !== 'P' || !(amt > 0)) return amt;
      let took = amt * this.mult('bldHurt', 'P', b);
      const U = this.FX.unbreakable_hall;
      // the pictures answer a BLOW, never the summer's slow burn: the wildfire
      // reaches here every frame it touches a roof, and a spark or a flare on
      // every one of them would read as the ward strobing (render state only)
      const blow = cause !== 'fire';
      if (b.key === 'tc' && U && this.timed('unbreakable_hall')) {
        took = Math.min(took, Math.max(0, b.hp - U.sliver(b)));
        if (blow) U.struck(b, took);
      }
      if (blow && took < amt && this.FX.stone_skin && this.timed('stone_skin')) this.FX.stone_skin.glance(b);
      return took;
    },
    /* MASTER BUILDERS' HAND: the charges a placement of `key` would spend
       one of — 0 for the rival, for the Wonder, walls and gates, and with
       none in hand. Asked by the placement confirm (and its chip) only. */
    masterHand(owner, key) {
      if (owner !== 'P' || typeof S === 'undefined' || !S || !S.deck || !S.deck.charges) return 0;
      const n = S.deck.charges.master_builders | 0, MB = this.FX.master_builders;
      return n > 0 && MB && !MB.NOT[key] ? n : 0;
    },
    // …and the raising: one charge, the building finished at full strength
    masterRaise(b, builderId) { return this.FX.master_builders.raise(b, builderId); },
    /* A GOODS CARD'S MOMENT AT THE HALL'S DOOR, for a card that lives in
       another file (Forager's Cache, js/deckfx.js): seated as the goods'
       own (TX.spot — inside the safe view), its show this file's. The show
       or null (no hall, or no show to play). */
    goodsShow(id) {
      const tc = TX.tc(), d = this.FX[id];
      if (!tc || !d || !d.show) return null;
      const side = TX.openSide(tc);
      return TX.show(id, { tc: tc.id, side, at: TX.spot(tc, side, true) });
    },
  });

  /* ---------------- THE CARDS ---------------- */
  // a goods card: the stockpile, the log, the moment at the hall's door
  // (showAtHall: the play brings the hall on screen before the goods land —
  // js/deckui.js _dest — so the moment is never culled off camera)
  const goods = (id, res, n, icon, line, show) => ({
    at: 'bar', showAtHall: true, [res.toUpperCase()]: n,
    can() { return { ok: true }; },
    apply() {
      S.res[res] += n;
      Deck.say(icon + ' ' + line + ': +' + n + ' ' + res + '.');
      const tc = TX.tc();
      if (tc) { const side = TX.openSide(tc); TX.show(id, { tc: tc.id, side, at: TX.spot(tc, side, true) }); }
      TX.sound(show.sound);
      // the number on the bar is held until the goods land (TX.settle)
      return { ok: true, fly: { [res]: n }, pay: tc ? { ms: TX.PAY_MS } : undefined,
        msg: line + ': +' + n + ' ' + res + (tc ? ', set down at your door.' : '.') };
    },
    show,
  });

  Object.assign(Deck.FX, {
    /* STONE — Fallen Timber: +200 wood. The light comes down out of the sky
       at the hall's door, and five logs come tumbling down it one after
       another — turning end over end in the air — each landing with a
       woody thud, a puff of dust and a step of the wood count, until they
       stand as a stacked woodpile, cut ends to the camera like the card's
       own art; the pile dissolves when the moment is over. */
    fallen_timber: goods('fallen_timber', 'wood', 200, '🪵', 'Fallen timber carried home', {
      ms: 3200, layer: 'world', sound: 'cardWood',
      // the woodpile: three on the ground, two in their grooves — [dx, dy] off its foot
      LOGS: [[-10, 0], [0, 0], [10, 0], [-5, -7], [5, -7]],
      T0: 0.14, STEP: 0.15, FALL: 0.36,
      land(i) { return this.T0 + i * this.STEP + this.FALL; },
      pays() { const K = this.show; return K.LOGS.map((_, i) => [K.land(i), 'wood', i < K.LOGS.length - 1 ? 40 : 0]); },
      draw(g, s, p) {
        TX.settle(s, TX.pays('fallen_timber', s));
        const tc = Bld.get(s.tc); if (!tc) return;
        const K = this.show, TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL;
        const items = K.LOGS.map(([dx, dy], i) => ({ dx, dy, t0: K.T0 + i * K.STEP, fall: K.FALL, H: TL * 3.2, bounce: 2,
          onLand: (x, y) => TX.thud(x, y, i < 3 ? 0.45 : 0.32) }));
        const now = TX.fall(s, items, px, py);   // landings (and their dust) happen culled or not
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.shaft(g, px, py, s.t, TX.STONE_LIGHT, TL * 1.2, K.land(K.LOGS.length - 1) + 0.15);
        const logS = GA.get('logSide'), end = GA.get('logEnd'), dis = cl((p - 0.84) / 0.16);
        // the pile's contact shadow, as wide as what is down (soft, never a bar on the grain)
        const down = now.filter(n => n.down && !n.it.dy);
        if (down.length) TX.shadow(g, Math.min(...down.map(n => n.x)) - 6, Math.max(...down.map(n => n.x)) + 6, py - 0.5, 1 - dis);
        TX.inked(g, px - 26, py - TL * 3.4, 52, TL * 3.4 + 4, gg => {
          for (const n of now) {
            if (n.down) gg.drawImage(end, n.x - 4.5, n.y - 13);
            else {
              // turning end over end in the air, smoothly (the art is the log's own; only its angle moves)
              gg.save(); gg.translate(n.x, n.y - 4); gg.rotate(n.q * 6 * Math.PI / 4 + n.i * 0.7);
              gg.drawImage(logS, -10, -3.5); gg.restore();
            }
          }
        }, dis);
        // the storm's leaves, drifting down the light after the wood, turning as they fall
        const L2 = AP().leaf, T2 = AP().thatch;
        for (let k = 0; k < 9; k++) {
          const t0 = 0.2 + hs(k, 3) * 0.6, tl = s.t - t0;
          if (tl < 0 || dis >= 1) continue;
          const y = Math.min(py - 1.5, py - TL * 2.6 + tl * TL * 1.3), x = px + (hs(k, 5) - 0.5) * 40 + Math.sin(tl * 5 + k) * 5;
          TX.leaf(g, x, y, 2.6 + hs(k, 9) * 1.4, Math.sin(tl * 4 + k * 1.7) * 1.2 + k, k % 3 === 0 ? T2[2] : L2[k % 2 ? 3 : 4], 1 - dis);
        }
        TX.count(g, s, sp, [{ t: '+200 wood' }], K.land(K.LOGS.length - 1) + 0.1, 1.9);
      },
    }),

    /* STONE — Loose Stone: +150 stone. The heaviest of the four: five
       blocks of the map's own ORE (Sprites.oreStamp — the round, outlined
       boulder with its quarried facet every deposit is built of) come down
       the light HARD, one after another, each landing in its own dust with
       chips of itself flying and a step of the stone count — the first and
       biggest with a jolt of the ground you feel (two frames of shake). Once
       the pile is down its fresh faces wink in the pale light; a natural
       knot of ore has neither the chips nor the wink. */
    loose_stone: goods('loose_stone', 'stone', 150, '🪨', 'Loose stone hauled in', {
      ms: 3200, layer: 'world', sound: 'cardStone',
      // dx, dy (world px off the pile's foot), radius, the stamp's variant — the biggest first
      BLOCKS: [[0, 0, 8, 4], [-12, 0, 7, 1], [12, 0, 6, 2], [-5, -8, 6, 6], [7, -8, 5, 3]],
      T0: 0.14, STEP: 0.17, FALL: 0.28,
      land(i) { return this.T0 + i * this.STEP + this.FALL; },
      pays() { const K = this.show; return K.BLOCKS.map((_, i) => [K.land(i), 'stone', i < K.BLOCKS.length - 1 ? 30 : 0]); },
      draw(g, s, p) {
        TX.settle(s, TX.pays('loose_stone', s));
        const tc = Bld.get(s.tc); if (!tc) return;
        const K = this.show, TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL;
        const items = K.BLOCKS.map(([dx, dy, rr], i) => ({ dx, dy, t0: K.T0 + i * K.STEP, fall: K.FALL, H: TL * 3.4, bounce: 1,
          onLand: (x, y) => {
            TX.thud(x, y, 0.4 + rr * 0.03, 'cardThunk');
            if (i === 0 && R.shakeAt) R.shakeAt(2.4, 0.035);   // the biggest: two frames of the ground jumping
          } }));
        const now = TX.fall(s, items, px, py);
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.shaft(g, px, py, s.t, TX.STONE_LIGHT, TL * 1.3, K.land(K.BLOCKS.length - 1) + 0.15);
        const dis = cl((p - 0.84) / 0.16);
        const down = now.filter(n => n.down && !n.it.dy);
        if (down.length) TX.shadow(g, Math.min(...down.map(n => n.x)) - 8, Math.max(...down.map(n => n.x)) + 8, py - 0.5, 1 - dis);
        const stamps = typeof Sprites !== 'undefined' && Sprites.oreStamp;
        TX.inked(g, px - 30, py - TL * 3.6, 60, TL * 3.6 + 4, gg => {
          for (const n of now) {
            const [, , rr, v] = K.BLOCKS[n.i];
            if (stamps) { const st = Sprites.oreStamp(rr, v, false); gg.drawImage(st, n.x - st._ox, n.y - st._oy - rr); }
            else block(gg, n.x, n.y, rr * 2, rr + 2, n.i);
          }
        }, dis);
        // every block lands throwing chips of itself: shards of the ore tumbling out
        const O = AP().oreD;
        K.BLOCKS.forEach(([dx, dy, rr], i) => {
          const age = s.t - K.land(i);
          if (age < 0 || age > 0.5) return;
          for (let k = 0; k < 8; k++) {
            const a = -Math.PI * (0.06 + 0.88 * hs(i * 7 + k, 17)), v = 20 + hs(k, i + 31) * 30;
            const cx = px + dx + Math.cos(a) * v * age * 1.5, cy = Math.min(py + 1.5, py + dy - rr - Math.sin(a) * v * age * 1.5 + 90 * age * age);
            TX.shard(g, cx, cy, 1.6 + hs(k, i) * 1.3, age * (8 + k) + k, k % 3 === 0 ? O[5] : k % 3 === 1 ? O[3] : O[2], O[5], O[0]);
          }
        });
        // and once down, a ring of the pale light runs out over the ground and
        // the fresh faces wink in it, one after another (R.fxSpark / fxRing)
        const settled = s.t - K.land(K.BLOCKS.length - 1);
        if (settled > 0 && dis < 1) {
          if (settled < 0.6) TX.halo(g, px, py - 2, 10 + eo(settled / 0.6) * 34, 0.5, 0.8 * (1 - settled / 0.6), TX.STONE_LIGHT, 2);
          K.BLOCKS.forEach(([dx, dy, rr], i) => {
            const ph = (settled * 1.6 + i * 0.37) % 1;
            if (ph > 0.4) return;
            const k = Math.sin(ph / 0.4 * Math.PI);
            TX.spark(g, px + dx - rr * 0.35, py + dy - rr * 1.25, 2 + 4.5 * k, (0.4 + 0.6 * k) * (1 - dis), 'white', { diag: k > 0.7 });
          });
        }
        TX.count(g, s, sp, [{ t: '+150 stone' }], K.land(K.BLOCKS.length - 1) + 0.1, 1.9);
      },
    }),

    /* STONE — Gold Nugget: +60 gold. One nugget drops down the gold light,
       bounces twice — each lower — and comes to rest; it catches the light
       in a hard four-point star, and four coins flip up out of it, turning
       over, and fly off into the gold count, which steps as each one
       arrives (TX.flyToBar). */
    gold_nugget: goods('gold_nugget', 'gold', 60, '🪙', 'A gold nugget turned up', {
      ms: 3000, layer: 'world', sound: 'cardGold',
      LAND: 0.42, B1: 0.22, B2: 0.14, COIN: 0.88, COIN_STEP: 0.1, COINS: 4,
      // the coins pay as they ARRIVE (each flight hands its own coin in): listed
      // here at their launch, so the bar is known to be holding until then
      pays() { const K = this.show; return Array.from({ length: K.COINS }, (_, i) => [K.COIN + i * K.COIN_STEP, 'gold', i < K.COINS - 1 ? 15 : 0, 'fly']); },
      draw(g, s, p) {
        const tc = Bld.get(s.tc); if (!tc) return;
        const K = this.show, TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL;
        const t = s.t, rest = K.LAND + K.B1 + K.B2;
        // the coins leave on their beats, culled or not (the bar waits for them)
        TX.settle(s, TX.pays('gold_nugget', s), (e, i) => {
          const a = -Math.PI / 2 + (i - 1.5) * 0.5;
          TX.flyToBar('gold', px + Math.cos(a) * 14, py - 8 + Math.sin(a) * 14, e[2], GA.get('coins')[0], 160);
          TX.sound('cardCoin');
          return true;
        });
        if (!s.hit && t >= K.LAND) { s.hit = 1; TX.thud(px, py, 0.4, 'cardCoin'); }
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.shaft(g, px, py, t, 'gold', TL * 1.05, rest + 0.1);
        // the fall and two bounces, each lower than the last
        let y = py;
        if (t < K.LAND) y = py - TL * 3 * (1 - (t / K.LAND) * (t / K.LAND));
        else if (t < K.LAND + K.B1) y = py - Math.sin((t - K.LAND) / K.B1 * Math.PI) * 11;
        else if (t < rest) y = py - Math.sin((t - K.LAND - K.B1) / K.B2 * Math.PI) * 4;
        const dis = cl((p - 0.86) / 0.14);
        TX.shadow(g, px - 6, px + 6, py - 0.5, (1 - dis) * cl(1 - (py - y) / (TL * 3)));
        const nug = GA.get('nugget');
        TX.inked(g, px - 10, y - 14, 20, 16, gg => gg.drawImage(nug, px - 6, y - 10), dis);
        if (t >= K.LAND && t < rest + 0.2) dust(g, px, py, t - K.LAND, 6, AP().soil[3], 24);
        // the glint: a four-point star of light caught off the nugget, opening
        // out, held and let go — smooth at the device's own resolution — and a
        // ring of the gold running out from it over the ground
        const gt = (t - rest) / 0.6;
        if (gt > 0 && gt < 1 && dis < 1) {
          const k = Math.sin(Math.min(1, gt * 1.4) * Math.PI);
          TX.spark(g, px - 2, py - 7, 3 + 8 * k, (0.5 + 0.5 * k) * (1 - dis), 'gold', { diag: gt > 0.15 && gt < 0.6 });
          TX.halo(g, px, py - 4, 6 + eo(gt) * 26, 0.55, 0.95 * (1 - gt), 'gold', 1.8);
        }
        // the coins flip up out of it, turning over, before they make for the bar
        const coins = GA.get('coins');
        for (let i = 0; i < K.COINS; i++) {
          const tl = t - (K.COIN + i * K.COIN_STEP);
          if (tl < 0 || tl > 0.16) continue;
          const a = -Math.PI / 2 + (i - 1.5) * 0.5, q = tl / 0.16;
          const cx = px + Math.cos(a) * 14 * q, cy = py - 8 + Math.sin(a) * 14 * q;
          g.drawImage(coins[((tl * 30) | 0) % 3], cx - 2, cy - 2);
        }
        TX.count(g, s, sp, [{ t: '+60 gold' }], K.COIN + K.COINS * K.COIN_STEP + 0.45, 1.6);
      },
    }),

    /* BRONZE — Trade Caravan: +250 food, +250 wood and +100 gold. A laden ox
       cart, its drover leading it by a rope, rolls in along a ROAD THE MAP
       CAN CARRY (TX.road: land tiles, no building, and the row with the
       fewest people on it — the first cut drove a fixed row through a
       villager and, by a coast, across the sea), stops with the ox in front
       of the yard, and unloads — three sacks of grain, logs, a strongbox
       that bursts and spills its coin — onto a pile at the door, each
       landing in a puff of dust; the chest lands in a ring of the Bronze
       tier's warm light; then the cart rolls on and is gone. A short road
       is shortened, never extended over what it cannot cross, and with no
       road at all the load comes down in the card's own light instead. */
    trade_caravan: {
      at: 'bar', showAtHall: true, FOOD: 250, WOOD: 250, GOLD: 100,
      CART: { back: CART_BACK, front: CART_FRONT },   // what the road must carry (the contract reads it)
      can() { return { ok: true }; },
      apply() {
        S.res.food += this.FOOD; S.res.wood += this.WOOD; S.res.gold += this.GOLD;
        Deck.say('🐂 A trade caravan came over the pass: +' + this.FOOD + ' food, +' + this.WOOD + ' wood and +' + this.GOLD + ' gold.');
        const tc = TX.tc();
        if (tc) TX.show('trade_caravan', { tc: tc.id, side: TX.openSide(tc) });
        TX.sound('cardCaravan');
        return { ok: true, fly: { food: this.FOOD, wood: this.WOOD, gold: this.GOLD }, pay: tc ? { ms: TX.PAY_MS } : undefined,
          msg: 'A trade caravan came over the pass: +' + this.FOOD + ' food, +' + this.WOOD + ' wood and +' + this.GOLD + ' gold, unloaded crate by crate.' };
      },
      /* THE ROAD (a picture's footing, never a rule): for each way in (from
         the hall's open side first) and each of the three rows in front of the
         pile, the stop must sit on land whole — the cart from its tailboard to
         its drover — and the road runs back up to 7 tiles and on up to 5,
         each step land whole too, stopping short of the first water or wall.
         Scored by length, against anyone standing on it and against a row
         farther off. Null when no row can even hold the stop. */
      road(sp, side) {
        const TL = TLs(), px = sp.x * TL, py0 = Math.floor(sp.y);
        const land = (x, y) => MapGen.onBoard(x, y) && Path.passable(x, y, 'P') && !Bld.at(x, y);
        const span = (cx, dir) => dir > 0 ? [cx - CART_BACK, cx + CART_FRONT] : [cx - CART_FRONT, cx + CART_BACK];
        const ok = (ty, sp2) => {
          for (let tx = Math.floor(sp2[0] / TL); tx <= Math.floor((sp2[1] - 1) / TL); tx++) if (!land(tx, ty)) return false;
          return true;
        };
        let best = null;
        for (const dir of [-side, side]) for (let ty = py0 + 1; ty <= py0 + 3; ty++) {
          const stop = px - dir * 3;                     // the pile above the shafts: bed behind it, the ox and drover toward the hall
          if (!ok(ty, span(stop, dir))) continue;
          let inN = 0, outN = 0;
          while (inN < 7 && ok(ty, span(stop - dir * (inN + 1) * TL, dir))) inN++;
          while (outN < 5 && ok(ty, span(stop + dir * (outN + 1) * TL, dir))) outN++;
          const a0 = span(stop - dir * inN * TL, dir), a1 = span(stop + dir * outN * TL, dir);
          const lo = Math.min(a0[0], a1[0]) / TL, hi = Math.max(a0[1], a1[1]) / TL;
          const crowd = S.units.filter(u => !Units.isNaval(u) && Math.abs(u.y - (ty + 0.6)) < 0.8 && u.x >= lo && u.x <= hi).length;
          const sc = inN + outN - crowd * 8 - (ty - py0 - 1) * 1.5 + (dir === -side ? 1 : 0);
          if (!best || sc > best.sc) best = { sc, dir, ty, stop, inN, outN };
        }
        return best;
      },
      show: {
        ms: 3800, layer: 'world',
        IN: 0.34, UNLOAD: [0.38, 0.43, 0.48, 0.53, 0.58, 0.64], ON: 0.8,
        // each crate pays as it is set down: three sacks of grain, two loads of logs, the strongbox
        pays(s) {
          const U = this.show.UNLOAD.map(u => u * s.ms / 1000 + 0.34);
          return [[U[0], 'food', 83], [U[1], 'food', 83], [U[2], 'food', 0], [U[3], 'wood', 125], [U[4], 'wood', 0], [U[5], 'gold', 0]];
        },
        // the pile at the door: [dx, dy, the piece] — three sacks, two bundles of logs, the strongbox on top
        PILE: [[-9, 0, 'sack'], [-2, 0, 'sack'], [-6, -7, 'sack'], [8, 0, 'bundle'], [7, -8, 'bundle'], [-1, -13, 'chest']],
        HOP: 0.34,
        draw(g, s, p, dt) {
          TX.settle(s, TX.pays('trade_caravan', s));
          const tc = Bld.get(s.tc); if (!tc) return;
          const TL = TLs(), K = this.show, side = s.side || 1;
          const sp = s.at || (s.at = TX.spot(tc, side));
          if (s.road === undefined) s.road = this.road(sp, side);
          const rd = s.road, pile = { x: sp.x * TL, y: sp.y * TL };
          const dir = rd ? rd.dir : -side, rowY = rd ? (rd.ty + 0.8) * TL : pile.y;
          const stopX = rd ? rd.stop : pile.x;
          const t = p * s.ms / 1000, U = K.UNLOAD.map(u => u * s.ms / 1000), hop = K.HOP, PILE = K.PILE;
          // every crate SET DOWN thuds and throws its dust on its beat, culled or not
          for (let k = 0; k < PILE.length; k++) if (t >= U[k] + hop && !(s.landed || (s.landed = {}))[k]) {
            s.landed[k] = 1;
            TX.thud(pile.x + PILE[k][0], pile.y + PILE[k][1], 0.3, k === PILE.length - 1 ? 'cardCoin' : 'cardThud');
          }
          if (!TX.near(Math.min(pile.x, stopX) - 9 * TL, pile.y - 3 * TL, Math.max(pile.x, stopX) + 9 * TL, rowY + TL)) return;
          const from = stopX - dir * (rd ? rd.inN : 0) * TL, onTo = stopX + dir * (rd ? rd.outN : 0) * TL;
          let cx;
          if (p < K.IN) cx = from + (stopX - from) * eo(p / K.IN);
          else if (p < K.ON) cx = stopX;
          else cx = stopX + (onTo - stopX) * Math.pow((p - K.ON) / (1 - K.ON), 1.6);
          const rolled = Math.abs(cx - from);
          // no road at all: the load comes down the card's own light (the goods' shaft, bronze)
          if (!rd) TX.shaft(g, pile.x, pile.y, t - U[0] + 0.15, TX.BRONZE_LIGHT, TL * 1.4, U[PILE.length - 1] - U[0] + hop + 0.3);
          // the dust it raises while it moves, and the card's warm motes in its wake
          const moving = !!rd && (p < K.IN || p > K.ON);
          // the caravan comes out of the world and goes back into it smoothly, as one picture
          const gone = rd ? Math.max(1 - cl(p / 0.08), cl((p - 0.9) / 0.1)) : 1;
          if (moving && gone < 1) {
            const soil = AP().soil[3];
            for (let k = 0; k < 10; k++) {
              const ph = (rolled / 9 + k / 10) % 1;
              TX.grain(g, cx - dir * (CART_BACK + ph * 22), rowY - 2 - ph * 8 - (k % 2) * 2, 1.6 * (1 - 0.4 * ph), soil, 0.8 * (1 - ph) * (1 - gone));
            }
            for (let k = 0; k < 8; k++) {
              const ph = (rolled / 14 + k / 8) % 1;
              TX.mote(g, cx - dir * (20 + ph * 26), rowY - 30 - ph * 18 + (k % 3) * 3, 1.1, 0.9 * (1 - ph) * (1 - gone), k % 2 ? 'gold' : 'bronze');
            }
          }
          // the goods: off the bed, through the air, onto the pile at the door
          const aboard = PILE.map((_, k) => t < U[k]);
          const bedX = stopX - dir * 13, bedY = rd ? rowY - 22 : pile.y - TL * 3;
          const dis = cl((p - 0.9) / 0.1);
          const down = PILE.filter((it, k) => t - U[k] >= hop && !it[1]);
          if (down.length) TX.shadow(g, pile.x + Math.min(...down.map(it => it[0])) - 5, pile.x + Math.max(...down.map(it => it[0])) + 8, pile.y - 0.5, 1 - dis);
          const iy0 = Math.min(pile.y, bedY) - 50, iy1 = Math.max(pile.y, bedY) + 12;   // the arcs' peaks to the pile's foot
          TX.inked(g, Math.min(pile.x, bedX) - 30, iy0, Math.abs(pile.x - bedX) + 60, iy1 - iy0, gg => {
            for (let k = 0; k < PILE.length; k++) {
              const tl = t - U[k], [dx, dy, key] = PILE[k];
              if (tl < 0) continue;
              const pic = GA.get(key), ex = pile.x + dx, ey = pile.y + dy;
              let x = ex, y = ey;
              if (tl < hop) {
                const f = tl / hop, sx = bedX + (k - 2.5) * 2;
                x = sx + (ex - sx) * f; y = bedY + (ey - bedY) * f - (rd ? Math.sin(f * Math.PI) * 22 : 0);
              }
              gg.drawImage(pic, x - pic.width / 2, y - pic.height);
            }
          }, dis);
          // the strongbox lands in the tier's light and spills: coins leap out
          // and land round the pile, winking — two rings of light running out
          // over the ground (the Bronze tier's, the gold inside it) and a glint
          // off a coin now and then, all at the device's own resolution
          const ct = t - U[PILE.length - 1] - hop;
          if (ct > 0 && dis < 1) {
            if (ct < 0.7) {
              const q = ct / 0.7;
              TX.halo(g, pile.x, pile.y - 2, 10 + eo(q) * 40, 0.5, 0.9 * (1 - q), TX.BRONZE_LIGHT, 2.2);
              TX.halo(g, pile.x, pile.y - 2, 6 + eo(q) * 24, 0.5, 0.8 * (1 - q), 'gold', 1.6);
            }
            const coins = GA.get('coins');
            g.save();
            g.globalAlpha = 1 - dis;
            for (let k = 0; k < 10; k++) {
              const ang = -Math.PI * (0.06 + 0.88 * hs(k, 11)), sp2 = 12 + hs(k, 13) * 18, f = Math.min(1, ct / 0.32);
              const x = pile.x - 1 + Math.cos(ang) * sp2 * f, y = pile.y - 14 + (f * 14) - Math.sin(f * Math.PI) * 14;
              g.drawImage(coins[f < 1 ? ((ct * 30 + k) | 0) % 3 : 0], x - 2, y - 4);
            }
            g.restore();
            for (let k = 0; k < 10; k++) {
              const ang = -Math.PI * (0.06 + 0.88 * hs(k, 11)), sp2 = 12 + hs(k, 13) * 18;
              const w = (ct * 1.6 + k * 0.29) % 1;
              if (ct < 0.32 || w > 0.3) continue;
              TX.spark(g, pile.x - 1 + Math.cos(ang) * sp2, pile.y - 3, 2.5 + 3 * Math.sin(w / 0.3 * Math.PI), (1 - dis) * Math.sin(w / 0.3 * Math.PI), 'gold');
            }
          }
          // the caravan itself: the cast's ox and drover and the cart, on its road
          if (rd && gone < 1) {
            const x0 = dir > 0 ? cx - CART_BACK : cx - CART_FRONT;
            TX.shadow(g, x0 + 2, x0 + CART_BACK - 2, rowY - 0.5, 1 - gone);   // the cart's shadow
            TX.inked(g, x0 - 20, rowY - 50, CART_BACK + CART_FRONT + 40, 56, gg => caravan(gg, s, cx, rowY, dir, rolled, moving, aboard, dt), gone, true);
          }
          // the three counts STACK, each in as its goods come down, fitted
          // to the safe view and never over the hall's straw roof
          TX.count(g, s, sp, [{ t: '+250 food', at: U[2] + hop }, { t: '+250 wood', at: U[4] + hop }, { t: '+100 gold', at: U[5] + hop }],
            U[0] + hop, s.ms / 1000 - U[0] - hop);
        },
      },
    },

    /* STONE — Mending: every finished building of the player's, walls and
       gates included, to full; work sites excluded (Rule 5). A ring of warm
       light rolls out from the hall, and each building it reaches flares
       gold and throws its sparks as it is made whole. */
    mending: {
      at: 'tc',
      hurt() { return S.buildings.filter(b => b.owner === 'P' && !(b.construction > 0) && b.hp < b.maxhp); },
      can() { return this.hurt().length ? { ok: true } : { ok: false, why: 'Nothing needs mending.' }; },
      apply() {
        const list = this.hurt();
        if (!list.length) return this.can();
        const fires = list.filter(b => Bld.burnPhase(b) >= 0).length;
        // the works still burning are left as they are (Rule 5) — and SAID to be,
        // or "made whole" beside a site on fire reads as the card having failed
        const smoulder = S.buildings.filter(b => b.owner === 'P' && b.construction > 0 && Bld.burnPhase(b) >= 0);
        for (const b of list) b.hp = b.maxhp;
        const n = list.length, tc = TX.tc();
        Deck.say('🧵 Mending: ' + n + ' building' + (n > 1 ? 's' : '') + ' made whole' +
          (fires ? ' and ' + fires + ' fire' + (fires > 1 ? 's' : '') + ' put out' : '') + '.');
        const c = tc ? { x: Bld.cx(tc), y: Bld.cy(tc) } : { x: Bld.cx(list[0]), y: Bld.cy(list[0]) };
        const hit = list.map(b => ({ id: b.id, d: Math.hypot(Bld.cx(b) - c.x, Bld.cy(b) - c.y) })).sort((a, b) => a.d - b.d);
        const far = hit[hit.length - 1].d, speed = Math.max(14, far / 1.1);
        const left = smoulder.map(b => ({ id: b.id, d: Math.hypot(Bld.cx(b) - c.x, Bld.cy(b) - c.y) }));
        TX.show('mending', { cx: c.x, cy: c.y, hit, speed, left, puffs: [], ms: Math.min(3200, (far / speed + 1.0) * 1000) });
        TX.sound('cardMend');
        return { ok: true, msg: 'Mending: ' + n + ' building' + (n > 1 ? 's' : '') + ' made whole' + (fires ? ', the fires out' : '') +
          (left.length ? ' (the works still smoulder).' : '.') };
      },
      show: {
        ms: 1800, layer: 'world',
        draw(g, s, p, dt) {
          const TL = TLs(), r = s.t * s.speed, far = s.hit[s.hit.length - 1].d + 1;
          /* a work site still burning is passed over (Rule 5): as the wave
             reaches it, a puff of the game's own smoke goes up off it — the
             works smoulder on, plainly, rather than the card seeming to fail */
          for (const h of s.left || []) {
            if (h.puffed || r < h.d) continue;
            h.puffed = true;
            const b = Bld.get(h.id);
            if (!b) continue;
            const a = TX.art(b), x = a.rc.x + (a.box.l + a.box.r) / 2 * a.rc.w, y = a.rc.y + a.box.t * a.rc.h;
            for (let k = 0; k < 3; k++) s.puffs.push({ x: x + (k - 1) * 5, y: y + 4 - k * 3, t: k * 0.08, life: 1.3, s: 0.9 + k * 0.2 });
          }
          if (s.puffs && s.puffs.length && R._drawPuffs) {
            g.save();
            R._drawPuffs(g, s.puffs, dt || 0, TL, (q, k) => { q.y -= TL * 0.45 * (dt || 0); q.x += TL * 0.1 * (dt || 0) * (0.4 + k); }, 0.6);
            g.restore();
          }
          // the wave: a ring of warm light rolling out over the town, and a
          // fainter one behind it — smooth at the device's own resolution, its
          // hue tied to its light (a lime-green ring ADDED over the meadow was
          // the colour of nothing this card does)
          for (const [lag, a0] of [[0, 1], [0.7, 0.45]]) {
            const rr = r - lag;
            if (rr <= 0 || rr > far + 2) continue;
            const k = rr / (far + 2), a = a0 * (1 - k * k);
            TX.halo(g, s.cx * TL, s.cy * TL, rr * TL, 0.62, a, 'gold', 3.4);
            TX.halo(g, s.cx * TL, s.cy * TL, Math.max(1, rr * TL - 5), 0.62, 0.6 * a, 'gold', 1.6);
          }
          // each building as the light reaches it
          for (const h of s.hit) {
            const age = (r - h.d) / s.speed;
            if (age < 0 || age > 0.9) continue;
            const b = Bld.get(h.id);
            if (!b || !TX.bNear(b)) continue;
            const a = TX.art(b);
            // the mending RUNS DOWN the building as it is made whole: a band of
            // gold light from its crown to its foot over its own worn picture
            // (TX.scan, at the device's own resolution) — never the flat cream
            // silhouette of the first cut, which read as art that failed to load
            if (age < 0.6) TX.scan(g, a, age / 0.6);
            // the sparks of a town patched up: glints rising off the roof, and
            // a mending + above it
            for (let k = 0; k < 6; k++) {
              const tl = age - k * 0.05;
              if (tl < 0 || tl > 0.55) continue;
              const x = a.rc.x + (a.box.l + (a.box.r - a.box.l) * hs(h.id, k)) * a.rc.w;
              const y = a.rc.y + (a.box.t + (a.box.b - a.box.t) * hs(k, h.id) * 0.8) * a.rc.h - tl * 22;
              const q = tl / 0.55;
              TX.spark(g, x, y, 2.5 + 3.5 * (1 - q) * (tl < 0.12 ? 1 : 0.7), 1 - q * q, 'gold', { diag: tl < 0.1 });
            }
            const cx = a.rc.x + (a.box.l + a.box.r) / 2 * a.rc.w, cy = a.rc.y + a.box.t * a.rc.h - 4 - age * 16;
            TX.plus(g, cx, cy - 2, 3.4, cl(1.2 * (1 - age / 0.9)));
          }
        },
      },
    },

    /* BRONZE — Master Builders: three charges in S.deck.charges (a second
       card adds three more). The next buildings the player places through
       the placement confirm stand complete at once, at full strength, still
       paid for — never walls or gates, never the Wonder (Rule 4).

       THE PLAY MARKS WHERE THE REWARD IS (the playtest's critics: "playing
       the card does nothing on the map, only a toast and the ×3 chip"): the
       hall comes on screen (showAtHall) and the masons' hammers come down on
       its roof one after another, a '⚒×3' over them — and the Build tab wears
       a '⚒×3' badge for as long as charges are in hand (syncTab).
       THE RAISING IS A BUILD, NOT A SWAP: a column of the BRONZE tier's light
       (never the gold of a higher tier), no wider than half the footprint,
       comes down on the site and the building's own three raising stages
       play under it in about 600 ms (show.veil stands in for its picture —
       R.cardVeil), then it stands, fills with the light from its foot to its
       crown, and the count left floats over it in cream on a hard dark rim. */
    master_builders: {
      at: 'bar', showAtHall: true, N: 3, NOT: { wonder: 1, wall: 1, gate: 1, tc: 1 },
      TONE: 'bronze', STAGES: 0.36,   // the share of the raising's show the three stages take (~600 ms)
      can() { return { ok: true }; },
      apply() {
        const run = Deck.run(), n = (run.charges.master_builders | 0) + this.N;
        run.charges.master_builders = n;
        Deck.say('⚒ Master Builders: the next ' + n + ' buildings you place stand complete the moment they are placed.');
        const tc = TX.tc();
        if (tc) TX.show('master_builders', { play: true, hall: tc.id, n });
        this.syncTab(true);
        TX.sound('cardBuild');
        return { ok: true, charges: n, msg: 'Master Builders: your next ' + n + ' buildings stand complete the moment they are placed.' };
      },
      // the strip's chip (js/deckui.js): the count in hand, the ring a card's worth
      chip(n) {
        n = n | 0;
        this.syncTab();
        return n > 0 ? { label: '×' + n, frac: Math.min(1, n / this.N), words: n + (n === 1 ? ' building' : ' buildings') } : null;
      },
      /* THE BUILD TAB'S BADGE: '⚒×n' on #bmToggle while charges are in hand —
         an attribute the tab's own label writes (UI.syncBottomToggle sets its
         textContent) never touch, drawn by a rule this file adds the first
         time a badge is wanted (cards off: no rule, no attribute, nothing).
         Re-asked on every chip pass while charges last; one pass after the
         last is spent, or a new world without them, takes it down. */
      syncTab(pop) {
        const el = typeof document !== 'undefined' && document.getElementById('bmToggle');
        if (!el) return;
        const n = (typeof S !== 'undefined' && S && S.deck && S.deck.charges && S.deck.charges.master_builders) | 0;
        if (n > 0) {
          TX.css('dkMBcss', '#bmToggle[data-mb]::after{content:attr(data-mb);position:absolute;top:-11px;right:-14px;' +
            'padding:0 4px;font:700 10px/13px sans-serif;color:#f2e6cd;background:#6a3c1a;border:1px solid #0d0b08;' +
            'border-radius:3px;box-shadow:0 0 0 1px #dc8a4c;pointer-events:none;white-space:nowrap;}' +
            '#bmToggle.dkMBpop::after{animation:dkMBpop .42s steps(2,end) 1.1s 3;}' +
            '@keyframes dkMBpop{50%{transform:scale(1.35) translateY(-2px);}}');
          const want = '⚒×' + n;
          if (el.getAttribute('data-mb') !== want) el.setAttribute('data-mb', want);
          if (pop) { el.classList.remove('dkMBpop'); void el.offsetWidth; el.classList.add('dkMBpop'); }
          if (!this._tabChk) this._tabChk = setTimeout(() => { this._tabChk = 0; this.syncTab(); }, 1000);
        } else {
          if (el.hasAttribute('data-mb')) el.removeAttribute('data-mb');
          el.classList.remove('dkMBpop');
        }
      },
      raise(b, builderId) {
        const run = Deck.run(), n = run.charges.master_builders | 0;
        if (!(n > 0) || !b || b.owner !== 'P' || !(b.construction > 0) || this.NOT[b.key]) return false;
        if (n > 1) run.charges.master_builders = n - 1; else delete run.charges.master_builders;
        // a station needs its hands: the one the player chose, or the nearest idle
        // one — the hand that would have built it and stayed on
        let hand = null;
        if (Bld.def(b.key).needsWorker) {
          hand = builderId ? S.units.find(u => u.id === builderId && u.owner === 'P' && Units.isVillager(u) && !Units.isLevied(u)) : null;
          if (!hand) hand = Units.nearestIdleVillager(b.x, b.y);
        }
        Bld.finish(b, hand);
        if (hand && hand.task && hand.task.type === 'work' && hand.task.id === b.id) {
          hand.tUnit = 0; hand.tBld = 0;
          Units.setPath(hand, b.x, b.y);
        }
        const left = n - 1;
        Deck.say('⚒ Master Builders raise your ' + Bld.def(b.key).name + ' at once' +
          (left ? ' — ' + left + ' more to come.' : ' — the last of them.'));
        TX.show('master_builders', { bid: b.id, left });   // never `id`: that names the card
        // the dust of each stage as it goes up, and the last of it as the building stands
        if (typeof R !== 'undefined' && R.startPlacePoof) {
          const ms = this.show.ms * this.STAGES, sz = Bld.size(b);
          for (let k = 1; k < 3; k++) R.startPlacePoof(b.x, b.y, sz, { delay: ms * k / 3, scale: 0.35 });
          R.startPlacePoof(b.x, b.y, sz, { delay: ms, scale: 1.25 });
        }
        this.syncTab();
        TX.sound('cardBuild');
        return true;
      },
      /* the building as it stood at one of its three raising stages — the
         same routing the map's work site takes (R.stageIcon, with the cleared
         pad under a derived frame), from a copy of it put back that far */
      stage(g, b, st, bx, by, bw) {
        const def = Bld.def(b.key), total = (def.levels[(b.level || 1) - 1] || {}).time || 1;
        const site = Object.assign({}, b, { construction: total * (1 - (st + 0.5) / 3), upgrading: 0 });
        const art = R.stageIcon ? R.stageIcon(site) : null;
        if (!art || !(art.width > 0)) return false;
        const base = R.bldSprite(b), bs = Bld.size(b);
        const own = R.stageArt ? R.stageArt(b.key, b.level, bs, st) : null;
        if (own) { R.blitStage(g, own, base, bx, by, bw); return true; }
        if (st === 0) { g.drawImage(art, bx, by, bw, bw); return true; }
        if (R.padOf && R.padShape) g.drawImage(R.padOf(bs, R.padShape(b.key, b.level, base)), bx, by, bw, bw);
        R.blitBld(g, art, bx, by, bw, bw);
        return true;
      },
      show: {
        ms: 1700, layer: 'world',
        // the raising's three stages, in the building's own place (R.cardVeil asks)
        veil(g, b, s, p, bx, by, bw) {
          if (!s.bid || p >= this.STAGES) return false;
          return this.stage(g, b, Math.min(2, Math.floor(p / (this.STAGES / 3))), bx, by, bw);
        },
        draw(g, s, p) {
          if (s.play) return this.show.drawPlay.call(this, g, s, p);
          const b = Bld.get(s.bid); if (!b || !TX.bNear(b)) return;
          const TL = TLs(), a = TX.art(b), rc = a.rc, top = rc.y + a.box.t * rc.h, foot = rc.y + a.box.b * rc.h;
          const x0 = rc.x + a.box.l * rc.w, x1 = rc.x + a.box.r * rc.w, w = x1 - x0, mid = (x0 + x1) / 2;
          const half = Bld.size(b) * TL / 2, ST = this.STAGES, tone = this.TONE;
          // the column of the bronze light, slammed down, held over the stages,
          // then drawn in to a thread — never wider than half the footprint;
          // smooth at the device's own resolution, its top melting into the air
          const up = cl(p / 0.06), down = p < 0.5 ? 1 : 1 - cl((p - 0.5) / 0.3);
          if (down > 0) {
            const colTop = top - TL * 3, h = (foot - colTop) * eo(up);
            R.fxBeam(g, mid, colTop + h, colTop, Math.min(half, w) * (0.12 + 0.88 * down), 0.95 * (0.4 + 0.6 * down), tone, { core: 1.2, fade: 0.32, foot: up >= 1 ? 0.5 * down : 0 });
          }
          // once it stands, the bronze runs up it from its foot to its crown — a
          // band of light over its own picture, never a flat silhouette
          if (a.spr && p >= ST && p < ST + 0.3) TX.scan(g, a, (p - ST) / 0.3, tone, true);
          // chips of timber and stone thrown off each stage as it goes up, and
          // motes of the bronze light rising with them
          const W = AP().wood, Sn = AP().stone;
          for (let k = 0; k < 12; k++) {
            const tl = p - (k % 3) * (ST / 3) - 0.02;
            if (tl < 0 || tl > 0.3) continue;
            const q = tl / 0.3, x = x0 + hs(k, s.bid) * w + (hs(s.bid + 3, k) - 0.5) * 18 * q;
            const y = foot - hs(s.bid, k) * (foot - top) * 0.6 - 50 * tl + 80 * tl * tl;
            if (k % 2) TX.shard(g, x, y, 1.5 + hs(k, 7), q * 9 + k, k % 4 === 1 ? Sn[3] : W[2], k % 4 === 1 ? Sn[4] : W[3], AP().ink[0]);
            else TX.mote(g, x, y - 4, 1.2, (k % 3 ? 0.75 : 1) * (1 - q), tone);
          }
          // and a ring of the bronze runs out over the ground as the dust settles
          if (p > ST) {
            const q = (p - ST) / (1 - ST);
            TX.halo(g, mid, foot - 2, w * 0.6 + q * TL * 1.4, 0.5, 0.9 * (1 - q), tone, 2);
          }
          // the count left, cream on a hard dark rim, over the building it raised
          if (p > ST + 0.04) {
            const q = (p - ST - 0.04) / (1 - ST - 0.04), al = q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
            TX.label(g, s, 'left', mid, top - 6, [{ t: s.left ? '⚒ ' + s.left + ' left' : '⚒ the last', col: '#f2e6cd' }], al, q, [{ x0, x1, y0: top, y1: foot }]);
          }
        },
        /* THE PLAY: three hammers come down on the hall's roof, one after
           another, each with a dull thud and a puff — then '⚒×n' over them,
           and they step out as the Build tab's badge pops. The hammer is the
           masons' mark (TX.hammer), drawn at the device's own resolution in
           the bronze's own ramp over a dark rim. */
        drawPlay(g, s, p) {
          const tc = Bld.get(s.hall); if (!tc || !TX.bNear(tc)) return;
          const c = TX.crown(tc), TL = TLs(), ramp = R.LIGHT.TONE.bronze.ramp;
          const hh = 18, hw = 18, roof = c.y + (c.a.box.b - c.a.box.t) * c.a.rc.h * 0.3;
          const n = Math.min(3, s.n || 3), gap = hw + 4, x0 = c.x - (n - 1) * gap / 2;
          const out = p > 0.8 ? cl((p - 0.8) / 0.2) : 0;
          for (let i = 0; i < n; i++) {
            const t0 = 0.08 + i * 0.12, q = cl((p - t0) / 0.1);
            if (q <= 0) continue;
            // each comes down onto the roof and stands there on its handle's end
            const x = x0 + i * gap, land = roof + hh * 0.15;
            const y = q < 1 ? land - (1 - q * q) * TL * 2.4 : land;
            if (q >= 1 && !s['th' + i]) { s['th' + i] = 1; TX.sound('cardThud'); }
            // a little glow of the bronze where it strikes
            if (q >= 1) { const st = cl((p - t0 - 0.1) / 0.12); if (st < 1) R.fxGlow(g, x, land - hh * 0.75, hh * 0.9 * (0.5 + st), 0.7 * (1 - st), 'bronze', { soft: 2 }); }
            TX.hammer(g, x, y, hh, ramp, 1 - out * out * (3 - 2 * out), (i - (n - 1) / 2) * 0.16);
          }
          if (p > 0.45) {
            const q = (p - 0.45) / 0.55, al = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
            TX.label(g, s, 'mark', c.x, roof + hh * 0.15 - hh - 4, [{ t: '⚒×' + (s.n || 3), col: '#f2e6cd' }], al, Math.min(1, q * 2), []);
          }
        },
      },
    },

    /* BRONZE — Watchfires: the player's towers and War Camps hit 50% harder
       and reach 50% farther for the card's 6 days (Deck.mult 'towerAtk' /
       'towerRange', read in the tower fire — combat.js). The attack is the
       tower's own stat ×1.5, before the target's defence; the L1 fumble is
       untouched. A beacon blazes on every one of them while it runs, and the
       play shows the longer reach: a ring of fire-dots growing from each
       tower's old range out to its new one. */
    watchfires: {
      at: 'tc', mult: { towerAtk: 1.5, towerRange: 1.5 }, IGNITE: 18,   // tiles a second the kindling runs out from the hall
      forts() { return S.buildings.filter(b => b.owner === 'P' && (b.key === 'tower' || b.key === 'warcamp') && Bld.done(b)); },
      can() { return this.forts().length ? { ok: true } : { ok: false, why: 'You need a finished tower or War Camp.' }; },
      apply() {
        const ok = this.can();
        if (!ok.ok) return ok;
        const days = Deck.card('watchfires').days, was = !!Deck.timed('watchfires');
        const e = Deck.addTimed('watchfires', days), forts = this.forts(), tc = TX.tc();
        Deck.say(was ? '🔥 The watchfires burn on — ' + days + ' more days.'
          : '🔥 Watchfires blaze on every tower and War Camp you hold: they hit 50% harder and reach 50% farther for ' + days + ' days.');
        const hx = tc ? Bld.cx(tc) : Bld.cx(forts[0]), hy = tc ? Bld.cy(tc) : Bld.cy(forts[0]);
        const list = forts.map(b => {
          const lv = Bld.lv(b);
          return { id: b.id, d: Math.hypot(Bld.cx(b) - hx, Bld.cy(b) - hy), ox: b.x + 0.5, oy: b.y + 0.5, r0: lv.range, r1: lv.range * this.mult.towerRange };
        });
        const far = Math.max(0, ...list.map(f => f.d));
        TX.show('watchfires', { list, fresh: !was, ms: Math.min(3600, (far / this.IGNITE + 2.2) * 1000) });
        TX.sound('cardFire');
        const nt = forts.filter(f => f.key === 'tower').length, nc = forts.length - nt;
        const what = [nt ? nt + (nt === 1 ? ' tower' : ' towers') : '', nc ? nc + (nc === 1 ? ' War Camp' : ' War Camps') : ''].filter(Boolean).join(' and ');
        return { ok: true, until: e.until, msg: was ? 'The watchfires burn on — ' + days + ' more days.'
          : 'Watchfires blaze on ' + what + ': half again as hard and as far for ' + days + ' days.' };
      },
      end() { G.log('🔥 The watchfires burn down — your towers shoot as they did before.'); },
      /* THE BEACON ON ONE TOWER: an iron brazier and a big flame in the burning
         town's own strip (flameBig, half again a hall fire's size) with a few
         embers going up off it — and NO LIGHT round it (the playtest's
         critics: a flat translucent orange disc round every tower top for six
         days, its lower half laid over the meadow). The fire lights itself.
         The brazier and the embers are drawn at the device's own resolution
         (the operator's ruling of 2026-10-27): a forged basket on its rim, and
         embers as small soft beads of the fire's own colour. */
      BEACON: 1.5,
      brazier(g, fx, fy) {
        const I = AP().ink, dv = R.fxDev(g);
        g.save();
        g.beginPath();
        g.moveTo(fx - 6.2, fy - 2.4); g.lineTo(fx + 6.2, fy - 2.4); g.lineTo(fx + 4, fy + 1.8); g.lineTo(fx - 4, fy + 1.8); g.closePath();
        g.fillStyle = I[1]; g.fill();
        g.lineJoin = 'round'; g.lineWidth = Math.max(dv, 0.5); g.strokeStyle = I[0]; g.stroke();
        // its rim catching the fire, and the bands round it
        g.strokeStyle = I[2]; g.lineWidth = Math.max(dv, 0.7);
        g.beginPath(); g.moveTo(fx - 5.8, fy - 2); g.lineTo(fx + 5.8, fy - 2); g.stroke();
        g.lineWidth = Math.max(dv, 0.45);
        g.beginPath(); for (const u of [-2.6, 0, 2.6]) { g.moveTo(fx + u * 1.15, fy - 2); g.lineTo(fx + u * 0.75, fy + 1.6); } g.stroke();
        g.restore();
      },
      beacon(g, b, k, now) {
        const TL = TLs(), c = TX.crown(b), s = TL * (b.key === 'warcamp' ? 0.62 : 0.5) * this.BEACON * k;
        if (s < 2) return;
        const fx = c.x, fy = c.y + 2;
        this.brazier(g, fx, fy);
        TX.flame(g, fx, fy - 1, s, ((now * 7.7) | 0) + b.id);
        // two or three embers rising off it, cooling as they climb
        const F = AP().fire;
        for (let i = 0; i < 3; i++) {
          const ph = (now * 0.7 + i / 3 + (b.id * 0.37) % 1) % 1;
          TX.mote(g, fx + Math.sin(ph * 7 + i * 2 + b.id) * 5, fy - s * 0.85 - ph * TL * 1.2, 1.05 * (1 - 0.4 * ph), (1 - ph) * (ph < 0.08 ? ph / 0.08 : 1), F[ph < 0.3 ? 3 : 2]);
        }
      },
      /* …and while it runs, a tower or camp the player selects shows its
         reach as the ORBIT (R.drawOrbit — the operator's ruling on every
         area card's reminder: one bead of gold going round the longer
         range with its thread fading behind it, drawn at device
         resolution, where the two rings of fire-dots were "a little
         pixelated and low quality"). Drawn in the GROUND pass, where the
         arrows land — under the town and the fog. Each tower on its own
         place on the lap. */
      reach(g, b, e) {
        const lv = Bld.lv(b);
        if (!lv || !lv.range) return null;
        return R.drawOrbit(g, Bld.cx(b), Bld.cy(b), lv.range * this.mult.towerRange, performance.now() / 1000,
          { phase: (b.id * 0.618034) % 1, fade: e ? Math.min(1, Math.max(0, (e.until - Deck.now()) / 0.5)) : 1 });
      },
      selected() {
        const sel = typeof UI !== 'undefined' && UI.sel && UI.sel.type === 'bld' ? Bld.get(UI.sel.id) : null;
        return sel && sel.owner === 'P' && (sel.key === 'tower' || sel.key === 'warcamp') && Bld.done(sel) ? sel : null;
      },
      drawGround(g, e) {
        const b = this.selected();
        if (b) this.reach(g, b, e);
      },
      drawLive(g, e) {
        // the kindling runs on the play's own clock (render time); with no fresh
        // play on screen — a replay, a loaded save — every beacon simply burns
        const sh = TX.fresh('watchfires'), age = sh ? sh.t : 1e9;
        const now = performance.now() / 1000, tc = TX.tc();
        const hx = tc ? Bld.cx(tc) : 0, hy = tc ? Bld.cy(tc) : 0;
        let n = 0;
        for (const b of S.buildings) {
          if (b.owner !== 'P' || (b.key !== 'tower' && b.key !== 'warcamp') || !Bld.done(b) || !TX.bNear(b)) continue;
          if (++n > 48) break;
          // each catches in turn, outward from the hall
          const k = cl((age - Math.hypot(Bld.cx(b) - hx, Bld.cy(b) - hy) / this.IGNITE) / 0.35);
          if (k > 0) this.beacon(g, b, k, now);
        }
      },
      show: {
        ms: 2600, layer: 'world',
        draw(g, s, p) {
          const TL = TLs(), t = s.t;
          for (const f of s.list) {
            const b = Bld.get(f.id); if (!b) continue;
            const tl = t - f.d / Deck.FX.watchfires.IGNITE;
            if (tl < 0) continue;
            const R1 = f.r1 * TL, near = TX.near(f.ox * TL - R1, f.oy * TL - R1, f.ox * TL + R1, f.oy * TL + R1);
            if (!near) continue;
            g.save();
            // the pitch catches: a streak of fire shooting up off the crown —
            // the bronze of firelight, smooth at the device's own resolution
            // (TX.taper: a white-hot thread in a soft tongue narrowing upward),
            // its sparks thrown out as beads of the fire's light
            if (s.fresh && tl < 0.45) {
              const c = TX.crown(b), q = tl / 0.45, h = TL * 1.4 * eo(q);
              TX.taper(g, c.x, c.y - h, c.y + 1, 0.6, 6.5 * (1 - 0.5 * q), 0.95 * (1 - q), 'bronze', { core: 0.6 });
              for (let k = 0; k < 8; k++) {
                const a = k / 8 * Math.PI * 2, d = 4 + q * 18;
                TX.mote(g, c.x + Math.cos(a) * d, c.y - 6 + Math.sin(a) * d * 0.7 - q * 6, 1.15, (k % 2 ? 1 : 0.7) * (1 - q), k % 2 ? 'gold' : 'bronze');
              }
            }
            // the reach: the old ring faint, then a ring of the fire's light
            // growing out to the new one, smooth, its hue tied to its light
            const gq = cl((tl - 0.15) / 0.7), r = f.r0 + (f.r1 - f.r0) * eo(gq);
            const a = gq < 1 ? 0.9 : 0.9 * cl(1 - (tl - 0.85) / 1.2);
            if (a > 0) {
              TX.halo(g, f.ox * TL, f.oy * TL, f.r0 * TL, 1, a * 0.35, 'bronze', 1.2);
              TX.halo(g, f.ox * TL, f.oy * TL, r * TL, 1, a, 'bronze', 2.2);
            }
            g.restore();
          }
        },
      },
    },

    /* IRON — Stone Skin: the player's buildings take half damage for the
       card's 8 days — every blow, an attack or the wilds' fire, halved in
       Bld.damage before the subtraction (Deck.bldTakes), and the float says
       the half, in the skin's own cold blue. A dark cold breath and a jolt at
       the play, a wave of carved runes rolling out from the hall, and each
       building TURNED TO STONE as it passes — its own picture, every beam
       and doorway of it, gone grey granite from the foot up — held, then the
       stone crumbling away block by block, from the top, shedding chips, down
       to the SLEEVE it keeps: a course of the same stone round its foot, cut
       in blocks, for all eight days. While it runs a sheen of light crosses
       each sleeve in its turn with a rune cut in it, and a blow that glances
       off throws grey chips of stone.
       THE SKIN IS STONE, NOT LIGHT: every mark is the building's own picture
       turned to stone, or laid opaque (source-over) in the grey-blue STONE
       ramp. The first cut drew it all in cold white ADDED ('lighter') — over
       the meadow it came out mint; a cold rim round every roof read as "this
       building is selected"; its sheen was a flat white bar across each one.
       AND IT IS DRAWN AT THE DEVICE'S OWN RESOLUTION (operator ruling,
       2026-10-27): the stone is laid at the device's size (TX.dev) — it was
       the building cut down to one cell a world pixel, a quarter of its own
       art's detail — its course's blocks are cut and fall smoothly (they
       crumbled in a 4×4 ordered dither of 2px cells), its sheen is a smooth
       band (it was a staircase of cells), the runes are carved strokes and
       the chips small faceted shards (both were 2px cells).
       What is ON a building is drawn ON it (drawBld, in the building loop —
       under whoever stands in front of it); only what flies (the chips, the
       glint) is drawn in the air (drawLive). */
    stone_skin: {
      at: 'tc', mult: { bldHurt: 0.5 },
      // the stone: crevice, dark, mid, light, lit, crest — a cold grey-blue granite
      STONE: ['#262b34', '#434b58', '#646e7d', '#8892a1', '#b0b9c6', '#d9dfe7'],
      // a halved blow's float: the skin's own cold blue (Combat.hitBuilding
      // writes the number, drawLive dyes it the frame it appears)
      HIT: '#a4cfff',
      // the sleeve's height, a fraction of the building's drawn height
      SLEEVE: 0.3,
      can() { return { ok: true }; },
      apply() {
        const days = Deck.card('stone_skin').days, was = !!Deck.timed('stone_skin');
        const e = Deck.addTimed('stone_skin', days), tc = TX.tc();
        Deck.say(was ? '🪨 Stone Skin holds — ' + days + ' more days.'
          : '🪨 Stone Skin: your buildings take half damage for ' + days + ' days.');
        const mine = S.buildings.filter(b => b.owner === 'P' && !(b.construction > 0));
        if (tc && mine.length) {
          const hit = mine.map(b => ({ id: b.id, d: Math.hypot(Bld.cx(b) - Bld.cx(tc), Bld.cy(b) - Bld.cy(tc)) })).sort((a, b) => a.d - b.d);
          const far = hit[hit.length - 1].d, speed = Math.max(9, far / 1.2);
          TX.show('stone_skin', { cx: Bld.cx(tc), cy: Bld.cy(tc), hit, speed, ms: Math.min(3600, (far / speed + this.AGE + 0.2) * 1000) });
        }
        TX.sound('cardSkin');
        return { ok: true, until: e.until };
      },
      end() { G.log('🪨 Stone Skin wears off — your buildings take blows in full again.'); },
      // a blow glanced off: where, when, and the float it wrote (render state — never in S)
      _glints: [],
      glance(b) {
        if (this._glints.length > 15) this._glints.shift();
        const s = Bld.size(b);
        this._glints.push({ x: Bld.cx(b) + (Math.random() - 0.5) * 0.7 * s, y: b.y + s * 0.5 + (Math.random() - 0.5) * 0.5 * s, t: performance.now(),
          fx: Bld.cx(b), fy: b.y - 0.15, n: this._n = ((this._n | 0) + 1) % 997 });
        TX.sound('cardGlance');
      },
      /* THE RUNES, carved: each a few strokes in a 3 × 4 box (world px × RUNE),
         an X, a staff with its branches, an arrow, a thorn, a bound pair */
      RUNES: [
        [[0, 0, 3, 4], [3, 0, 0, 4]],
        [[0, 0, 0, 4], [0, 0.4, 2.6, 1.6], [0, 1.8, 2.6, 3]],
        [[1.5, 0, 1.5, 4], [0, 1.4, 1.5, 0], [3, 1.4, 1.5, 0]],
        [[0.4, 0, 0.4, 4], [0.4, 0.9, 2.6, 2], [2.6, 2, 0.4, 3.1]],
        [[0, 0, 0, 4], [3, 0, 3, 4], [0, 0.6, 3, 3.4], [3, 0.6, 0, 3.4]],
      ],
      RUNE: 2,
      // the strokes of rune `i` with its box's top-left at (x, y), into the current path
      runePath(g, x, y, i, s) {
        const R0 = this.RUNES[((i % this.RUNES.length) + this.RUNES.length) % this.RUNES.length];
        s = s || this.RUNE;
        for (const [x0, y0, x1, y1] of R0) { g.moveTo(x + x0 * s, y + y0 * s); g.lineTo(x + x1 * s, y + y1 * s); }
      },
      /* a rune CUT in the stone at the device's own resolution: its strokes in
         `ink` and, a hair below them, a `lip` (a cut catching the light, or a
         glyph's shadow) — opaque, round-ended, never cells on the 2px grain.
         `list` many runes at once ([x, y, i] each) go down in two strokes. */
      runes(g, list, ink, lip, s) {
        if (!list.length) return;
        const w = Math.max(R.fxDev(g) * 1.2, 0.75 * (s || this.RUNE) / 2);
        g.save();
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w;
        if (lip) {
          g.strokeStyle = lip; g.beginPath();
          for (const [x, y, i] of list) this.runePath(g, x, y + w * 0.9, i, s);
          g.stroke();
        }
        g.strokeStyle = ink; g.beginPath();
        for (const [x, y, i] of list) this.runePath(g, x, y, i, s);
        g.stroke();
        g.restore();
      },
      rune(g, x, y, i, ink, lip) { this.runes(g, [[x, y, i]], ink, lip); },
      // the course is cut in blocks this many world px wide, each lifted its own height
      BLOCK: 6,
      // where the stone's top stands over block `j` of building `bid`, world px
      // below the art's top: `top` (a fraction of the art) lifted by the
      // block's own hash — a course of cut blocks, never a ruled line
      _edge(j, top, h, bid) { return top * h - hs(j, bid) * 3.4; },
      /* THE BUILDING TURNED TO STONE, from row `top` (a fraction of its art)
         down: its OWN picture laid at the DEVICE's size (TX.dev), taken to
         grey and cooled to the granite's blue, so every beam, door and thatch
         line stays and only the material changes; its upper edge cut in
         blocks with a lit crest and its joints; crumbling away BLOCK BY BLOCK
         from the top as `keep` falls 1 → 0, each block sliding down the
         building at its own moment, to row `floor` (the sleeve, which stays).
         `sheen` (0..1, or null) runs a smooth diagonal band of light across
         the stone. One shared scratch for every building (rule 7). */
      stone(g, b, a, top, keep, floor, sheen) {
        const d = TX.dev(g, a, 'stone');
        if (!d) return null;
        const y = d.x, W = d.W, H = d.H, ST = this.STONE, k = W / Math.max(1e-6, a.rc.w);
        y.globalCompositeOperation = 'saturation'; y.fillStyle = '#808080'; y.fillRect(0, 0, W, H);
        y.globalCompositeOperation = 'color'; y.globalAlpha = 0.55;
        if (y.globalCompositeOperation === 'color') {
          y.fillStyle = ST[3]; y.fillRect(0, 0, W, H);
          // …and a shade deeper, granite rather than snow (a pale thatch went white)
          y.globalAlpha = 1; y.globalCompositeOperation = 'multiply'; y.fillStyle = '#b4bcc8'; y.fillRect(0, 0, W, H);
        } else {
          // (a browser without the blend modes keeps the cut shape in plain stone)
          y.globalAlpha = 1; y.globalCompositeOperation = 'source-over'; y.fillStyle = ST[3]; y.fillRect(0, 0, W, H);
        }
        y.globalAlpha = 1;
        // a blend fills the clear ground round the shape as well: the shape again
        y.globalCompositeOperation = 'destination-in';
        y.imageSmoothingEnabled = a.spr.width > W * 1.02; if (y.imageSmoothingEnabled) y.imageSmoothingQuality = 'high';
        y.drawImage(a.spr, 0, 0, W, H);
        // the course: each block's top, and how far it has fallen toward the floor
        const BW = this.BLOCK * k, nB = Math.ceil(W / BW) + 1, fl = floor == null ? 2 : floor, crest = [];
        y.globalCompositeOperation = 'destination-out';
        y.beginPath();
        for (let j = 0; j < nB; j++) {
          const x0 = j * BW, e0 = this._edge(j, top, a.rc.h, b.id) * k;
          let e = e0;
          if (keep < 1) {
            const go = cl((1 - keep) * 1.7 - hs(j * 3 + 1, b.id) * 0.7), fe = this._edge(j, fl, a.rc.h, b.id) * k;
            e = e0 + (Math.max(e0, fe) - e0) * go * go;
          }
          if (e > 0) y.rect(x0 - 0.01, 0, BW + 0.02, e);
          crest.push([x0, e]);
        }
        y.fill();
        // the crest of the course: lit stone along each block's top, a dark joint between blocks
        y.globalCompositeOperation = 'source-atop';
        const lw = Math.max(1, 0.9 * k);
        y.fillStyle = ST[4];
        y.beginPath();
        for (const [x0, e] of crest) if (e >= 0 && e < H) y.rect(x0 + lw * 0.5, e, BW - lw, lw);
        y.fill();
        y.fillStyle = ST[1];
        y.beginPath();
        for (const [x0, e] of crest) if (e >= 0 && e < H) y.rect(x0 - lw * 0.35, e, lw * 0.7, Math.min(H - e, 3.2 * k));
        y.fill();
        // the sheen: one smooth band of pale light crossing the stone on the diagonal
        if (sheen != null && sheen >= 0 && sheen <= 1) {
          const L = a.box.l * W, Rr = a.box.r * W, ys = top * H - 3 * k, span = (Rr - L) + (a.box.b * H - ys);
          const c = L - (a.box.b * H - ys) * 0.4 + sheen * span * 1.3, bw = 5 * k;
          const gr = y.createLinearGradient(c - bw, ys + bw, c + bw, ys - bw);
          gr.addColorStop(0, 'rgba(217,223,231,0)'); gr.addColorStop(0.42, 'rgba(217,223,231,0.85)');
          gr.addColorStop(0.5, 'rgba(244,247,251,0.95)'); gr.addColorStop(0.58, 'rgba(217,223,231,0.85)'); gr.addColorStop(1, 'rgba(217,223,231,0)');
          y.fillStyle = gr; y.fillRect(0, 0, W, H);
        }
        y.globalCompositeOperation = 'source-over';
        TX.devBlit(g, a, d);
        return d;
      },
      // the sleeve's top on this building, as a fraction of its art
      _sleeve(a) { return a.box.b - (a.box.b - a.box.t) * this.SLEEVE; },
      // a sheen of light off the stone: ONE smooth band crossing the sleeve on
      // the diagonal from its lit corner as k runs 0 → 1 (it was a staircase of cells)
      sheen(g, b, a, k) { return this.stone(g, b, a, this._sleeve(a), 1, null, k); },
      // grey chips of stone thrown off a struck wall, falling (world px, `q` 0 → 1 over the chip's life)
      chips(g, x, y, q, seed, n) {
        const ST = this.STONE;
        for (let k = 0; k < (n || 7); k++) {
          const th = -Math.PI * (0.15 + 0.7 * hs(seed, k)), v = 26 + 30 * hs(k, seed);
          const cx = x + Math.cos(th) * v * q * (k % 2 ? 1 : -1), cy = y + Math.sin(th) * v * q + 70 * q * q;
          TX.shard(g, cx, cy, (k % 3 ? 1.6 : 2.6) * (1 - 0.3 * q), q * (6 + k) + seed, ST[k % 3 === 0 ? 4 : k % 3 === 1 ? 3 : 2], ST[5], ST[0]);
        }
      },
      /* a glint where a blow glanced off: a four-pointed star in the stone's
         own pale, opaque and hair-fine at the device's own resolution (never
         light added over the town) */
      star(g, x, y, len) {
        const ST = this.STONE, w = Math.max(R.fxDev(g) * 0.8, len * 0.16);
        g.save();
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = ST[4];
        g.beginPath();
        g.moveTo(x - len, y); g.lineTo(x, y - w); g.lineTo(x + len, y); g.lineTo(x, y + w); g.closePath();
        g.moveTo(x, y - len); g.lineTo(x + w, y); g.lineTo(x, y + len); g.lineTo(x - w, y); g.closePath();
        g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, w * 1.3, 0, Math.PI * 2); g.fill();
        g.restore();
      },
      /* THE SKIN, for all eight days, ON the building (R.drawCardBld, right
         after its own art): the sleeve of stone round its foot, and in its
         turn every few seconds a sheen crossing it and a rune cut in it */
      drawBld(g, b, e) {
        if (b.owner !== 'P' || b.construction > 0) return;
        const a = TX.art(b);
        if (!a.spr) return;
        // the sleeve rises out of the casing as the play's stone crumbles (the
        // show draws the rest of the building's stone above it)
        const sh = TX.fresh('stone_skin'), hit = sh && sh.hit && sh.hit.find(z => z.id === b.id);
        if (hit && (sh.t * sh.speed - hit.d) / sh.speed < this.UP) return;
        const top = this._sleeve(a);
        const ph = (performance.now() / 1000 / 3.4 + (b.id * 0.618) % 1) % 1, k = ph / 0.3;
        this.stone(g, b, a, top, 1, null, ph <= 0.3 ? k : null);
        if (ph <= 0.3 && k > 0.25 && k < 0.85) {
          const ST = this.STONE, w = a.rc.w, h = a.rc.h;
          this.rune(g, a.rc.x + (a.box.l + (a.box.r - a.box.l) * (0.3 + 0.4 * hs(b.id, 3))) * w - 3,
            a.rc.y + (top + (a.box.b - top) * 0.25) * h, b.id, ST[0], ST[4]);
        }
      },
      // what flies: a blow that glances off — the float dyed the skin's cold
      // blue, a glint where it struck, grey chips of stone flying off
      drawLive(g, e) {
        const ms = performance.now(), TL = TLs(), F = typeof R !== 'undefined' && R.floats;
        for (let i = this._glints.length - 1; i >= 0; i--) {
          const gl = this._glints[i], tl = (ms - gl.t) / 1000;
          if (tl > 0.7) { this._glints.splice(i, 1); continue; }
          if (!gl.dyed && F) {
            for (let j = F.length - 1; j >= 0; j--) {
              const f = F[j];
              if (f.x === gl.fx && Math.abs(f.y - gl.fy) < 0.4 && f.t > 0.6 && /^-\d/.test(f.txt)) { f.col = this.HIT; gl.dyed = 1; break; }
            }
          }
          const x = gl.x * TL, y = gl.y * TL, q = tl / 0.7;
          if (q < 0.3) this.star(g, x, y, 6.5 * Math.sin((1 - q / 0.3) * Math.PI * 0.5 + 0.35));
          this.chips(g, x, y, q, gl.n);
        }
      },
      // the play's beats on each building, seconds after the wave reaches it:
      // the stone climbs (UP), holds, crumbles back to the sleeve by AGE
      UP: 0.3, HOLD: 0.85, AGE: 1.5,
      show: {
        ms: 2600, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (layer === 'sky') {
            if (!s.boom) {
              s.boom = true;
              // a cold DARK breath, never a pale one: a pale flash over the
              // meadow is a mint frame — the runes and the stone carry the light
              if (R.flashAt) R.flashAt(0.34, 0.7, '18,24,36');
              if (R.shakeAt) R.shakeAt(3, 0.4);
            }
            return;
          }
          const TL = TLs(), r = s.t * s.speed, far = s.hit[s.hit.length - 1].d + 1.5;
          const SK = Deck.FX.stone_skin, ST = SK.STONE;
          // the runes roll out over the town — pale stone glyphs set in the
          // turf, a crevice under each, stepping down the ramp as they spread,
          // between two fine rings of the stone; all of it carved strokes at
          // the device's own resolution
          if (r < far + 1) {
            const q = r / (far + 1), rr = r * TL, n = Math.max(10, Math.min(160, Math.round(rr / 4.5)));
            const lit = ST[q < 0.4 ? 5 : q < 0.7 ? 4 : 3], list = [];
            for (let i = 0; i < n; i++) {
              const th = i / n * Math.PI * 2 + s.t * 0.4;
              list.push([s.cx * TL + Math.cos(th) * rr - 3, s.cy * TL + Math.sin(th) * rr * 0.62 - 4, i]);
            }
            SK.runes(g, list, lit, ST[0]);
            g.save();
            g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
            g.lineWidth = Math.max(R.fxDev(g), 1.1 * R.fxPx(g));
            g.strokeStyle = ST[q < 0.5 ? 4 : 3];
            g.beginPath(); g.ellipse(s.cx * TL, s.cy * TL, Math.max(2, rr - 10), Math.max(1.2, (rr - 10) * 0.62), 0, 0, Math.PI * 2); g.stroke();
            g.strokeStyle = ST[q < 0.5 ? 3 : 2];
            g.beginPath(); g.ellipse(s.cx * TL, s.cy * TL, rr + 12, (rr + 12) * 0.62, 0, 0, Math.PI * 2); g.stroke();
            g.restore();
          }
          // the stone crumbling off each building flies (the stone itself is ON
          // the building — show.drawBld)
          for (const h of s.hit) {
            const age = (r - h.d) / s.speed;
            if (age < SK.HOLD || age > SK.AGE) continue;
            const b = Bld.get(h.id);
            if (!b || !TX.bNear(b)) continue;
            const a = TX.art(b), q = (age - SK.HOLD) / (SK.AGE - SK.HOLD), cx = a.rc.x + (a.box.l + a.box.r) / 2 * a.rc.w;
            const ty = a.rc.y + a.box.t * a.rc.h, bh = (a.box.b - a.box.t) * a.rc.h;
            SK.chips(g, cx - a.rc.w * 0.22, ty + bh * 0.25, q, h.id, 6);
            SK.chips(g, cx + a.rc.w * 0.22, ty + bh * 0.45, q, h.id + 31, 6);
            SK.chips(g, cx, ty + bh * 0.1, q, h.id + 57, 5);
          }
        },
        /* each building TURNS TO STONE as the wave reaches it — from its foot
           up, a crest of lit stone climbing it — holds, and crumbles back block
           by block to the sleeve it keeps (drawn on the building, under
           whoever stands in front of it) */
        drawBld(g, b, s, p) {
          const SK = Deck.FX.stone_skin, h = s.hit && s.hit.find(z => z.id === b.id);
          if (!h || b.owner !== 'P') return;
          const age = (s.t * s.speed - h.d) / s.speed;
          if (age < 0 || age > SK.AGE) return;
          const a = TX.art(b);
          if (!a.spr) return;
          const sl = SK._sleeve(a);
          if (age < SK.UP) {
            SK.stone(g, b, a, a.box.b - (a.box.b - a.box.t + 0.06) * eo(age / SK.UP), 1);
          } else SK.stone(g, b, a, a.box.t - 0.06, age < SK.HOLD ? 1 : 1 - (age - SK.HOLD) / (SK.AGE - SK.HOLD), sl);
        },
      },
    },

    /* ENLIGHTENMENT — Unbreakable Hall: for the card's 12 days the player's
       Town Center never drops below a sliver (2% of its strength, never under
       1 hp): Deck.bldTakes caps every blow at what stands above it, on the
       attack path and the wilds' fire alike, and never raises a hall already
       lower. The rival's Wonder still ends the run — that is a race lost,
       not a hall fallen. The play is held: the sky darkens, a tapered LANCE
       of gold comes down out of it onto the hall's ROOF, the ground shakes as
       it lands, short rays break from the crown and a dome rises over the
       hall; while it runs the dome stands, and a blow it swallows flashes its
       outline and throws a gold "HELD!" with a dark edge — every light of it
       drawn at the device's own resolution (the operator's ruling of
       2026-10-27: the lance, the rays, the dome's ribs and the halo were
       rows, dashes and dots on the art's 2px grain).
       When the ward ends the dome breaks and falls, and a note says so — a
       hall under siege must be told its protection is gone.
       The first cut's pillar opened as a flat orange slab under the top bar
       and stood half a screen wide with a flat foot floating over the hall;
       its flash was a FILLED amber half-dome cut flat along the ground; its
       "Held!" was pale; its end was a log line nobody saw. */
    unbreakable_hall: {
      at: 'tc', SLIVER: 0.02, IMPACT: 0.2,
      sliver(b) { return Math.max(1, Math.round(b.maxhp * this.SLIVER)); },
      can() { return TX.tc() ? { ok: true } : { ok: false, why: 'Your Town Center must stand.' }; },
      apply() {
        const tc = TX.tc();
        if (!tc) return this.can();
        const days = Deck.card('unbreakable_hall').days, was = !!Deck.timed('unbreakable_hall');
        const e = Deck.addTimed('unbreakable_hall', days);
        Deck.say(was ? '🏛 The ward on your Town Center holds — ' + days + ' more days.'
          : '🏛 Your Town Center is warded: for ' + days + ' days it cannot fall.');
        TX.show('unbreakable_hall', { tc: tc.id, fresh: !was });
        TX.sound('cardRise');
        return { ok: true, until: e.until };
      },
      // the ward's end is NEWS (a note toast, never the red alarm), and the dome breaks where it stood
      end() {
        G.log('🏛 The ward on your Town Center fades — it can fall again.', 'note', 4200);
        const tc = TX.tc();
        if (tc) TX.show('unbreakable_hall', { tc: tc.id, fall: 1, ms: 1500 });
      },
      // a blow on the warded hall (render state): the dome flares; one it
      // swallows whole is HELD — its float taken over by the ward's own gold
      _hit: 0, _took: 0, _held: [],
      struck(b, took) {
        this._hit = performance.now(); this._took = took;
        TX.sound('cardWard');
      },
      HELD: { col: '#ffd45e', hot: '#fff3cf', ink: '#2a1606', ms: 1300 },
      // the dome over the hall, world px: centre, ground, radius, height — and the roof the lance lands on
      geom(tc) {
        const TL = TLs(), sz = Bld.size(tc), c = TX.crown(tc);
        const cx = Bld.cx(tc) * TL, gy = (tc.y + sz) * TL - 4, rx = (sz / 2 + 0.6) * TL;
        return { cx, gy, rx, ry: rx * 0.42, hd: Math.max(rx * 0.9, gy - c.y + TL * 0.35), roof: c.y + TL * 0.15 };
      },
      /* THE DOME: its ribs drawn as fine lines of the gold's light at the
         device's own resolution (TX.line — never a fill: a body of gold over
         the meadow was a lime blister, then an amber half-dome cut flat along
         the ground; and no longer dots on the 2px grain), a glint running up
         and over its crown. A blow swallowed (`boost` 0..1, smooth) brightens
         and thickens the outline, lays a second skin just inside it, and
         eases back down. */
      dome(g, D, rise, boost, now) {
        const { cx, gy, rx, ry } = D, hd = D.hd * rise;
        if (hd < 2) return;
        const arc = (sx, sy, oy, from, to) => gg => { gg.beginPath(); gg.ellipse(cx, gy - (oy || 0), Math.max(0.5, sx), Math.max(0.5, sy), 0, from, to); };
        TX.line(g, arc(rx, hd, 0, Math.PI, Math.PI * 2), 0.62 + boost * 0.38, 'gold', { css: 1.5 + boost * 1.4 });
        if (boost > 0) TX.line(g, arc(rx - 2.2, hd - 2.2, 0, Math.PI, Math.PI * 2), boost * 0.6, 'gold', { css: 1.1 });
        TX.line(g, arc(rx * 0.55, hd, 0, Math.PI, Math.PI * 2), 0.3 + boost * 0.3, 'gold', { css: 1 });
        TX.line(g, arc(rx, ry, 0, 0, Math.PI), 0.42 + boost * 0.45, 'gold', { css: 1.3 });              // the ring on the ground, in front
        TX.line(g, arc(rx * 0.86, ry * 0.7, hd * 0.5, 0, Math.PI), 0.24 + boost * 0.3, 'gold', { css: 0.9 });
        // a glint running up one side and over the crown, now and then
        const ph = (now * 0.42) % 1;
        if (ph < 0.6) {
          const th = Math.PI + ph / 0.6 * Math.PI, a = Math.sin(ph / 0.6 * Math.PI);
          TX.spark(g, cx + Math.cos(th) * rx, gy + Math.sin(th) * hd, 3.5 + 2.5 * a, 0.85 * a * rise, 'gold', { diag: a > 0.8 });
        }
      },
      /* "HELD!": a blow the ward swallows whole writes the plain float
         Combat.hitBuilding writes for every blow ("Held!" — the contract's
         word); the ward takes it over the frame it appears and throws its own,
         in gold with a dark edge stroked round the letters, rising off the
         roof and fading smoothly (render state) */
      _labels: [],
      takeHeld() {
        const F = typeof R !== 'undefined' && R.floats;
        if (!F) return;
        for (let j = F.length - 1; j >= 0; j--) {
          const f = F[j];
          if (f.txt !== 'Held!' || f.t < 0.8) continue;
          F.splice(j, 1);
          if (this._labels.length > 6) this._labels.shift();
          this._labels.push({ x: f.x, y: f.y, t: performance.now() });
        }
      },
      drawHeld(g) {
        const TL = TLs(), H = this.HELD, now = performance.now();
        g.save();
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        for (let i = this._labels.length - 1; i >= 0; i--) {
          const L = this._labels[i], q = (now - L.t) / H.ms;
          if (q >= 1) { this._labels.splice(i, 1); continue; }
          const x = L.x * TL, y = L.y * TL - eo(Math.min(1, q * 1.6)) * TL * 0.7, pop = q < 0.12 ? 1 + 0.25 * Math.sin(q / 0.12 * Math.PI) : 1;
          g.globalAlpha = q < 0.8 ? 1 : 1 - (q - 0.8) / 0.2;
          g.font = 'bold ' + (11 * pop).toFixed(2) + 'px sans-serif';
          g.lineJoin = 'round'; g.miterLimit = 2; g.lineWidth = Math.max(2, 3 * R.fxPx(g)); g.strokeStyle = H.ink;
          g.strokeText('HELD!', x, y);
          g.fillStyle = q < 0.12 ? H.hot : H.col;
          g.fillText('HELD!', x, y);
        }
        g.restore();
      },
      drawLive(g, e) {
        this.takeHeld();
        if (this._labels.length) this.drawHeld(g);
        const tc = TX.tc();
        if (!tc || !TX.bNear(tc)) return;
        // the dome rises on the play's own clock (render time) after the lance
        // lands; with no fresh play on screen it simply stands
        const now = performance.now() / 1000, sh = TX.fresh('unbreakable_hall');
        const rise = sh ? eo(cl((sh.t - this.IMPACT * sh.ms / 1000) / 1.2)) : 1;
        const sinceHit = (performance.now() - this._hit) / 1000;
        const boost = sinceHit < 0.5 ? Math.pow(1 - sinceHit / 0.5, 1.5) : 0;
        const D = this.geom(tc);
        this.dome(g, D, rise, boost, now);
        // a blow swallowed: a ripple of gold runs out over the ground from the dome's foot
        if (boost > 0) TX.halo(g, D.cx, D.gy, D.rx * (1 + (1 - boost) * 0.35), 0.42, boost, 'gold', 2.2);
      },
      show: {
        ms: 4200, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const tc = Bld.get(s.tc); if (!tc) return;
          const U = Deck.FX.unbreakable_hall, TL = TLs(), D = U.geom(tc), imp = U.IMPACT;
          if (s.fall) {
            // THE WARD BREAKS: the dome's outline flares, cracks into beads of
            // its light and they fall, dimming as they go, and are gone
            if (layer !== 'world') return;
            if (!s.boom) { s.boom = 1; if (R.shakeAt) R.shakeAt(2, 0.3); TX.sound('cardWard'); }
            if (p < 0.25) U.dome(g, D, 1, 1 - p / 0.25, performance.now() / 1000);
            const nO = Math.max(16, Math.round((D.rx + D.hd) / 2));
            for (let i = 0; i <= nO; i++) {
              const th = i / nO * Math.PI, h0 = hs(i, 41), q = cl(p * 1.15 - h0 * 0.15);
              const x = D.cx + Math.cos(th) * D.rx + (h0 - 0.5) * 18 * q, y = D.gy - Math.sin(th) * D.hd + (40 + 90 * h0) * q * q;
              if (y > D.gy + 6) continue;
              TX.mote(g, x, y, 1.15, (1 - q) * (i % 3 ? 0.7 : 1) * cl(p / 0.06), 'gold');
            }
            return;
          }
          if (layer === 'world') {
            // the ground answers the blow: rings of gold rolling out from the hall
            if (p > imp) {
              const q = (p - imp) / 0.5;
              for (const [lag, reach] of [[0, 7], [0.12, 5], [0.24, 3.5]]) {
                const qq = (q - lag) / (1 - lag);
                if (qq <= 0 || qq >= 1) continue;
                TX.halo(g, D.cx, D.gy, D.rx + eo(qq) * reach * TL, 0.42, 0.95 * (1 - qq), 'gold', 2.6 - lag * 4);
              }
            }
            // motes of gold coming down with the lance
            if (p > 0.04 && p < 0.7) {
              for (let k = 0; k < 14; k++) {
                const ph = (s.t * 0.9 + hs(k, 21)) % 1;
                TX.mote(g, D.cx + (hs(21, k) - 0.5) * D.rx * 1.1, D.roof - D.hd * 2.2 * (1 - ph), 1.2, Math.sin(ph * Math.PI) * cl((0.7 - p) / 0.1), 'gold');
              }
            }
            // the dome rises brighter than it will stand — its outline, never a fill
            if (p > imp && p < 0.75) U.dome(g, D, eo(cl((p - imp) / 0.3)), 0.75 * (1 - cl((p - imp) / 0.55)), performance.now() / 1000);
            return;
          }
          // ---- the sky (device pixels) ----
          if (!s.boom && p >= imp) {
            s.boom = true;
            if (R.shakeAt) R.shakeAt(7, 0.8);
            // (no whole-frame flash: gold laid over the meadow was the sepia
            // wash, milk would be a pale green one — the lance striking the
            // roof in the darkened sky, the shake, the rings and the halo
            // bursting across the screen are the blow)
            if (R.startle) R.startle(Bld.cx(tc), Bld.cy(tc), 14);
            TX.sound('cardHall');
          }
          const W = R.cv.width, H = R.cv.height, A = TX.scr(D.cx, D.gy), roof = TX.scr(D.cx, D.roof), apex = TX.scr(D.cx, D.gy - D.hd);
          const dpr = R.dpr || 1;
          // the sky darkens for it, and lifts after — smoothly (a darkening, never a light)
          const veil = p < 0.25 ? cl(p / 0.25) : p < 0.62 ? 1 : 1 - cl((p - 0.62) / 0.3);
          if (veil > 0) { g.fillStyle = 'rgba(12,8,24,' + (0.3 * veil * veil * (3 - 2 * veil)).toFixed(4) + ')'; g.fillRect(0, 0, W, H); }
          // THE LANCE: down out of the sky onto the roof, held, drawn in to a
          // thread, gone — a tapered body of the card's light, wide where it
          // leaves the sky and drawn to its POINT on the roof, a white-hot
          // thread up its heart (TX.taper, at the device's own resolution:
          // it was rows of the art's pixel stepping in)
          const down = cl((p - 0.03) / (imp - 0.03)), narrow = p < 0.62 ? 1 : 1 - cl((p - 0.62) / 0.26);
          if (down > 0 && narrow > 0) {
            const tip = roof.y * eo(down), w0 = TL * 1.7 * A.z * narrow;
            TX.taper(g, A.x, 0, tip, w0, 0, 0.95 * (0.5 + 0.5 * narrow), 'gold', { core: 0.55 });
            TX.taper(g, A.x, 0, tip, w0 * 0.4, 0, 0.9 * narrow, 'white', { core: 0.85 });
            // the point burns where it strikes
            if (down >= 1) R.fxGlow(g, A.x, roof.y, TL * 0.55 * A.z * (0.6 + 0.4 * narrow), 0.85 * narrow, 'gold', { core: 0.35, soft: 2.1 });
          }
          // rays break from the crown, turning slowly — short, slender and
          // smooth (R.fxRays), near the crown: run across the whole screen as
          // wedges of light they read as orange road lines
          if (p > imp && p < 0.9) {
            const k = p < 0.35 ? cl((p - imp) / 0.15) : 1 - cl((p - 0.6) / 0.3), r0 = D.rx * 0.45 * A.z;
            R.fxRays(g, apex.x, apex.y, { n: 16, r0, r1: r0 + TL * 1.7 * A.z, a: 0.9 * k, tone: 'gold', spread: Math.PI * 2, dir: s.t * 0.12,
              w0: 0.9 * dpr, w1: Math.max(2 * dpr, TL * 0.07 * A.z), t: s.t, seed: 17, vary: 0.45, fall: 1.3 });
          }
          // a halo of light bursting out across the whole screen at the blow
          if (p > imp && p < imp + 0.35) {
            const q = (p - imp) / 0.35, rr = eo(q) * Math.hypot(W, H) * 0.7;
            if (rr > 2) R.fxRing(g, roof.x, roof.y, rr, 0.95 * (1 - q), 'gold', { squash: 0.6, css: 2.6 * (1 - 0.5 * q) });
          }
        },
      },
    },
  });

  /* ---------------- STONE — Forager's Cache's moment (the card itself is js/deckfx.js's) ---------------- */
  // the basket and what spills out of it, one world pixel a cell
  GA.basket = () => rowsArt([
    '....aaaaaa....', '...a......a...', '..a........a..', '.bbbbbbbbbbbb.', 'bcdcdcdcdcdcdb', 'bdcdcdcdcdcdcb',
    'bcdcdcdcdcdcdb', '.bdcdcdcdcdcb.', '.bcdcdcdcdcdb.', '..bdcdcdcdcb..', '...bbbbbbbb...'],
    { a: '#6e5024', b: '#5c421f', c: '#c9a84c', d: '#ab8c38' });
  GA.berries = () => rowsArt(['.ab.', 'abca', 'bcab', '.bb.'], { a: '#c01f3a', b: '#6a1030', c: '#e8657a' });
  GA.plums = () => rowsArt(['.ab.', 'abca', 'bcab', '.bb.'], { a: '#7a3a9e', b: '#4a1f66', c: '#b48ad0' });
  GA.loaf = () => rowsArt(['..aaaa..', '.abccba.', 'abccccba', 'bbbbbbbb', '.bbbbbb.'], { a: '#7a4a20', b: '#a8743a', c: '#d4a060' });
  GA.fish = () => rowsArt(['..aaaa..b', '.accccaab', 'acdcccccb', '.aaaaaa.b'], { a: '#4a5a66', b: '#6a7a86', c: '#c8d4dc', d: '#14100a' });
  GA.apple = () => rowsArt(['.c.', 'aba', 'aaa'], { a: '#c01f3a', b: '#e8657a', c: '#3c6f2d' });
  if (Deck.FX.forager_cache) Object.assign(Deck.FX.forager_cache, {
    /* a woven basket comes down the pale light to the hall's door, lands in
       its dust and tips over: the food spills out round it, piece by piece,
       each stepping the food count as it lands; then the lot is gone,
       smoothly, as one picture */
    show: {
      ms: 3400, layer: 'world',
      T0: 0.12, FALL: 0.32, TIP: 0.56, SPILL: 0.62, STEP: 0.07, HOP: 0.28,
      // [dx, dy, piece, how high it is thrown]
      FOOD: [[-12, 1, 'berries', 12], [12, 0, 'loaf', 16], [-5, 3, 'apple', 9], [17, 3, 'fish', 11], [-17, 3, 'plums', 14], [5, 4, 'berries', 8]],
      pays() { const K = this.show; return K.FOOD.map((_, i) => [K.SPILL + i * K.STEP + K.HOP, 'food', i < K.FOOD.length - 1 ? 40 : 0]); },
      draw(g, s, p) {
        TX.settle(s, TX.pays('forager_cache', s));
        const tc = Bld.get(s.tc); if (!tc) return;
        const K = this.show, TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL, t = s.t;
        const land = K.T0 + K.FALL;
        if (!s.down && t >= land) { s.down = 1; TX.thud(px, py, 0.5, 'cardThud'); }
        K.FOOD.forEach((f, i) => { if (t >= K.SPILL + i * K.STEP + K.HOP && !(s.plop || (s.plop = {}))[i]) { s.plop[i] = 1; TX.sound('cardPlop'); } });
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.shaft(g, px, py, t, TX.STONE_LIGHT, TL * 1.25, K.SPILL + K.FOOD.length * K.STEP + K.HOP);
        const dis = cl((p - 0.86) / 0.14);
        if (t >= land) TX.shadow(g, px - 10, px + 10, py - 0.5, 1 - dis);
        const bk = GA.get('basket');
        TX.inked(g, px - 40, py - TL * 3.4, 80, TL * 3.4 + 6, gg => {
          // the basket: falling, landing with a squash, then tipped onto its side toward the food
          let by = py, tip = 0;
          if (t < K.T0) return;
          if (t < land) { const q = (t - K.T0) / K.FALL; by = py - TL * 3 * (1 - q * q); }
          else if (t < land + 0.08) by = py + 1;
          if (t >= K.TIP) tip = eo(Math.min(1, (t - K.TIP) / 0.12));
          gg.save();
          gg.translate(px, by);
          gg.rotate(tip * 0.42);
          gg.drawImage(bk, -7, -11);
          gg.restore();
          // the food thrown out of its mouth, landing round it
          for (let i = 0; i < K.FOOD.length; i++) {
            const tl = t - (K.SPILL + i * K.STEP);
            if (tl < 0) continue;
            const [dx, dy, key, hgt] = K.FOOD[i], pic = GA.get(key), q = Math.min(1, tl / K.HOP);
            const x = px + 4 + (dx - 4) * q, y = py - 6 + (dy + 6) * q - Math.sin(q * Math.PI) * hgt;
            gg.drawImage(pic, x - pic.width / 2, y - pic.height);
          }
        }, dis);
        // the dust where the basket lands and where each piece rolls to a stop
        dust(g, px, py, t - land, 6, AP().soil[3], 30);
        K.FOOD.forEach(([dx, dy], i) => dust(g, px + dx, py + dy, t - (K.SPILL + i * K.STEP + K.HOP), 2, AP().soil[3], 16));
        TX.count(g, s, sp, [{ t: '+250 food' }], K.SPILL + K.FOOD.length * K.STEP + K.HOP + 0.05, 1.8);
      },
    },
  });

  /* ---------------- the voices (js/audio.js: synthesized, never a file) ---------------- */
  if (typeof Sound !== 'undefined' && Sound._VOICES && Sound.GAP) {
    Object.assign(Sound.GAP, {
      cardWood: 0.4, cardStone: 0.4, cardGold: 0.4, cardCaravan: 0.8, cardMend: 0.4, cardBuild: 0.25,
      cardThud: 0.06, cardThunk: 0.08, cardCoin: 0.05, cardBasket: 0.6, cardPlop: 0.05,
      cardFire: 0.4, cardSkin: 0.6, cardGlance: 0.6, cardRise: 0.6, cardHall: 1.6, cardWard: 0.9,
    });
    Object.assign(Sound._VOICES, {
      /* THE LIGHT COMING DOWN (the goods' arrival — each piece's own landing
         is its own voice below, struck by TX.thud on the frame it lands, so a
         sound can never run ahead of the picture) */
      cardWood(t, v) {
        this._noise({ at: t, hz: 900, to: 2600, dur: 0.35, q: 0.6, gain: 0.07 * v, atk: 0.08, filter: 'highpass' });
        [659, 784, 988].forEach((hz, i) => this._note({ at: t, delay: 0.04 + i * 0.05, hz, dur: 0.4, type: 'sine', gain: 0.045 * v }));
      },
      cardStone(t, v) {
        this._noise({ at: t, hz: 160, to: 70, dur: 0.6, q: 0.7, gain: 0.12 * v, atk: 0.1, filter: 'lowpass', rate: 0.6 });
        [523, 659].forEach((hz, i) => this._note({ at: t, delay: 0.04 + i * 0.06, hz, dur: 0.35, type: 'sine', gain: 0.04 * v }));
      },
      // a nugget comes down the gold light; the glint it catches when it rests
      cardGold(t, v) {
        this._noise({ at: t, hz: 1400, to: 3600, dur: 0.35, q: 0.6, gain: 0.06 * v, atk: 0.08, filter: 'highpass' });
        [1568, 2093, 2637, 3136].forEach((hz, i) => this._note({ at: t, delay: 0.84 + i * 0.06, hz, dur: 0.5, type: 'sine', gain: 0.07 * v }));
      },
      // a log landing on the pile: the woody knock
      cardThud(t, v) {
        this._noise({ at: t, hz: 340, to: 120, dur: 0.12, q: 1.1, gain: 0.18 * v });
        this._note({ at: t, hz: 150, to: 92, dur: 0.12, type: 'triangle', gain: 0.09 * v, lp: 900 });
      },
      // a block of stone landing: the deep thud, and the crack of a chip off it
      cardThunk(t, v) {
        this._noise({ at: t, hz: 220, to: 60, dur: 0.24, q: 0.8, gain: 0.26 * v, filter: 'lowpass' });
        this._note({ at: t, hz: 82, to: 42, dur: 0.22, type: 'sine', gain: 0.18 * v });
        this._noise({ at: t, delay: 0.02, hz: 1600, to: 700, dur: 0.07, q: 2, gain: 0.05 * v });
      },
      /* Forager's Cache: the pale light coming down, the wicker's creak as the
         basket lands (0.44 s, its own beat — TX.thud knocks it too) and a
         little woodland tune over the spill */
      cardBasket(t, v) {
        this._noise({ at: t, hz: 900, to: 2600, dur: 0.35, q: 0.6, gain: 0.06 * v, atk: 0.08, filter: 'highpass' });
        for (let i = 0; i < 3; i++) this._noise({ at: t, delay: 0.46 + i * 0.05, hz: 1800 - i * 300, to: 900, dur: 0.05, q: 3, gain: 0.05 * v });
        [523, 659, 784, 1047].forEach((hz, i) => this._note({ at: t, delay: 0.62 + i * 0.09, hz, dur: 0.3, type: 'triangle', gain: 0.05 * v, lp: 2400 }));
      },
      // a piece of food dropping onto the grass
      cardPlop(t, v) {
        this._note({ at: t, hz: 420, to: 260, dur: 0.07, type: 'sine', gain: 0.08 * v });
        this._noise({ at: t, hz: 900, to: 400, dur: 0.05, q: 1.2, gain: 0.04 * v });
      },
      // a coin's clink
      cardCoin(t, v) {
        this._note({ at: t, hz: 2349, to: 2093, dur: 0.12, type: 'triangle', gain: 0.08 * v });
        this._note({ at: t, delay: 0.02, hz: 3520, dur: 0.06, type: 'sine', gain: 0.03 * v });
      },
      // a cart rumbling in, the wheels' knock, coin pouring out, the good news
      cardCaravan(t, v) {
        this._noise({ at: t, hz: 180, to: 120, dur: 1.4, q: 0.7, gain: 0.12 * v, atk: 0.3, filter: 'lowpass', rate: 0.6 });
        for (let i = 0; i < 6; i++) this._noise({ at: t, delay: 0.1 + i * 0.2, hz: 260, to: 110, dur: 0.08, q: 1.2, gain: 0.09 * v });
        for (let i = 0; i < 7; i++) this._note({ at: t, delay: 2.45 + i * 0.05 + (i % 2) * 0.02, hz: 2200 + (i * 211) % 900, dur: 0.1, type: 'triangle', gain: 0.05 * v });
        [523, 659, 784].forEach((hz, i) => this._note({ at: t, delay: 2.7 + i * 0.08, hz, dur: 0.4, type: 'sine', gain: 0.09 * v }));
      },
      // daub and thatch: a soft rising arpeggio under two light taps
      cardMend(t, v) {
        [392, 494, 587, 784].forEach((hz, i) => this._note({ at: t, delay: 0.05 + i * 0.09, hz, dur: 0.5, type: 'sine', gain: 0.07 * v, atk: 0.02 }));
        for (const d of [0.12, 0.3]) this._noise({ at: t, delay: d, hz: 600, to: 260, dur: 0.07, q: 1.4, gain: 0.07 * v });
      },
      // a flurry of hammers, then a bright chord: it stands
      cardBuild(t, v) {
        for (let i = 0; i < 4; i++) this._noise({ at: t, delay: i * 0.06, hz: 560 - i * 30, to: 220, dur: 0.08, q: 1.4, gain: 0.14 * v });
        [523, 659, 784, 1047].forEach((hz, i) => this._note({ at: t, delay: 0.28 + i * 0.04, hz, dur: 0.45, type: 'sine', gain: 0.08 * v }));
      },
      // pitch catching: a whoosh climbing, then the crackle
      cardFire(t, v) {
        this._noise({ at: t, hz: 400, to: 2400, dur: 0.55, q: 0.7, gain: 0.2 * v, atk: 0.12 });
        for (let i = 0; i < 7; i++) this._noise({ at: t, delay: 0.3 + i * 0.07 + (i % 3) * 0.02, hz: 3000 + (i * 370) % 1400, dur: 0.035, q: 3, gain: 0.06 * v });
        this._note({ at: t, delay: 0.05, hz: 110, to: 70, dur: 0.6, type: 'sine', gain: 0.12 * v });
      },
      // stone grinding over the town, and a cold bell above it
      cardSkin(t, v) {
        this._noise({ at: t, hz: 300, to: 70, dur: 1.3, q: 0.8, gain: 0.26 * v, atk: 0.05, filter: 'lowpass', rate: 0.5 });
        this._note({ at: t, hz: 55, to: 46, dur: 1.4, type: 'sine', gain: 0.22 * v });
        this._note({ at: t, delay: 0.08, hz: 880, dur: 1.3, type: 'sine', gain: 0.05 * v });
        this._note({ at: t, delay: 0.08, hz: 1318, dur: 1.1, type: 'sine', gain: 0.03 * v });
      },
      // a blow glancing off stone
      cardGlance(t, v) {
        this._noise({ at: t, hz: 3200, to: 2400, dur: 0.06, q: 4, gain: 0.08 * v });
        this._note({ at: t, hz: 1760, to: 1480, dur: 0.12, type: 'triangle', gain: 0.04 * v });
      },
      // the swell before the pillar lands
      cardRise(t, v) {
        this._note({ at: t, hz: 110, to: 220, dur: 0.85, type: 'sine', gain: 0.12 * v, atk: 0.55 });
        this._note({ at: t, hz: 165, to: 330, dur: 0.85, type: 'sine', gain: 0.06 * v, atk: 0.55 });
        this._noise({ at: t, hz: 2400, to: 6000, dur: 0.85, q: 0.5, gain: 0.05 * v, atk: 0.6, filter: 'highpass' });
      },
      // the pillar lands: a great bell (inharmonic partials), a held chord, the earth's rumble
      cardHall(t, v) {
        [[65, 0.3], [131, 0.18], [180, 0.1], [352, 0.06], [530, 0.03]].forEach(([hz, gn]) =>
          this._note({ at: t, hz, dur: 3.4, type: 'sine', gain: gn * v, atk: 0.006 }));
        [220, 277, 330, 440].forEach((hz, i) => this._note({ at: t, delay: 0.15, hz, dur: 2.6, type: 'sine', gain: 0.05 * v, atk: 0.45 + i * 0.05 }));
        this._noise({ at: t, hz: 160, to: 40, dur: 1.6, q: 0.8, gain: 0.24 * v, filter: 'lowpass', rate: 0.4 });
      },
      // a blow swallowed by the ward: a dull gong
      cardWard(t, v) {
        this._note({ at: t, hz: 196, to: 186, dur: 0.9, type: 'sine', gain: 0.1 * v });
        this._note({ at: t, hz: 294, dur: 0.7, type: 'sine', gain: 0.05 * v });
        this._noise({ at: t, hz: 2400, to: 1200, dur: 0.12, q: 1.5, gain: 0.05 * v });
      },
    });
  }
})();
