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
      silhouette is ONE world-pixel-sized copy per sprite, coloured at draw
      time (TX.mask / TX.paint) — never a full-size copy per colour held for
      the session, on the frames a phone is likeliest to purge canvases.
   8. THE GOODS' MOMENT IS NEVER CULLED: they play at the bar, and the play
      brings the hall on screen first (showAtHall, js/deckui.js _dest).

   PRESENTATION scales with the tier: Stone a small, satisfying beat at the
   hall's door (the goods come down in a shaft of the tier's own light onto
   ground nobody is standing on, the stone as the map's own ore boulders);
   Bronze warmer (a laden cart rolling in beside its pile, a building rising
   in gold, beacons catching on every tower); Iron dramatic (a cold flash, a
   shake, a wave of runes); Enlightenment held — the sky darkens, a pillar
   of gold comes down on the hall, the ground shakes, a dome rises. House
   style throughout: hard pixels on a 2px grid, hard alpha steps, rings made
   of dots, no ctx.filter, no soft gradients, culled to the camera, nothing
   drawn while nothing is in play — and THE LIGHT IS GOLD, NOT LIME (R.glow,
   render.js): a body of the tier's light turns what it falls on to the
   light's own colour and then brightens it, a mark of it (a ring's dots, a
   spark) is laid opaque in its ink, never gold ADDED over the meadow. */
(() => {
  const PX = 2;
  const sn = v => Math.round(v / PX) * PX;                         // the 2px grid
  const stp = (a, n) => { n = n || 4; return a <= 0 ? 0 : a >= 1 ? 1 : Math.round(a * n) / n; };   // a hard alpha step
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
      g.globalAlpha = stp(a, 3);
      const INK = '#0d0b08';
      lines.forEach((l, i) => {
        if (l.at != null && s.t < l.at) return;    // a line not yet due holds its place in the block
        const tx = Math.round(b.x), ty = Math.round(b.y - this.RISE * cl(k || 0) + i * LH);
        g.fillStyle = INK;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillText(l.t, tx + ox, ty + oy);
        g.fillStyle = l.col || '#ffd45e';
        g.fillText(l.t, tx, ty);
      });
      g.restore();
    },
    /* THE CARD'S OWN LIGHT where its goods come down: a shaft of the tier's
       light slammed onto the spot and narrowing away, and a ring of dots
       running out over the ground — so the pile arrives as a gift, not as
       logs falling out of an empty sky. `tone` names the tier's light
       (R.LIGHT.TONE: the Stone tier's 'pale', the Bronze tier's 'bronze',
       'gold'): the shaft is R.glow, the ring its ink. */
    arrive(g, x, y, t, tone, H) {
      if (t < 0 || t > 0.6) return;
      const k = t < 0.07 ? 1 : 1 - (t - 0.07) / 0.53, h = H * Math.min(1, t / 0.07 + 0.2);
      for (const [w, sv] of [[26, 0.45], [14, 0.7], [4, 1]]) {
        const ww = Math.max(PX, sn(w * k));
        R.glow(g, sv * k, () => g.fillRect(sn(x - ww / 2), sn(y - h), ww, sn(h)), tone);
      }
      const q = t / 0.6;
      g.save();
      if (R.inkOn(g, 0.9 * (1 - q), tone)) this.ring(g, x, y - 2, 6 + eo(q) * 34, 0.5);
      g.restore();
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
    /* A SPRITE'S SHAPE IN ONE FLAT COLOUR, at WORLD-PIXEL size: each sprite
       keeps ONE copy of itself the size of its art rect (32-128 px — the
       world transform scales it up nearest-neighbour like everything else,
       so the silhouette's edge is the same hard pixel as the art's), and the
       colour is laid on at draw time through one shared scratch canvas. A
       copy per colour at the PNG's own 256 px was a quarter of a megabyte a
       building a colour, held for the session — and canvas memory is what
       iOS purges the terrain cache to win back (CLAUDE.md, THE GROUND CAME
       BACK BLACK), on the very frames a ward is played mid-fight. No pixel
       reads: a tainted PNG draws into it as happily as a procedural canvas. */
    _mask: new WeakMap(),
    mask(spr, w, h) {
      const k = w + 'x' + h, m = this._mask.get(spr);
      if (m && m.k === k) return m;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(spr, 0, 0, w, h);
      const out = { k, c, w, h, rim: null };
      this._mask.set(spr, out);
      return out;
    },
    _tint: null,
    // the colour laid over a mask, in the shared scratch (its 0..w × 0..h corner)
    tinted(src, w, h, col) {
      let t = this._tint;
      if (!t) t = this._tint = document.createElement('canvas');
      if (t.width < w || t.height < h) { t.width = Math.max(t.width, w); t.height = Math.max(t.height, h); }
      const x = t.getContext('2d');
      x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
      return t;
    },
    // rows f0..f1 (fractions from the top) of a building's shape in `col`, laid over its art rect
    paint(g, a, col, f0, f1) {
      if (!a.spr) return;
      const w = Math.max(1, Math.round(a.rc.w)), h = Math.max(1, Math.round(a.rc.h));
      const s0 = Math.max(0, Math.floor(cl(f0) * h)), s1 = Math.min(h, Math.ceil(cl(f1) * h));
      if (s1 <= s0) return;
      const t = this.tinted(this.mask(a.spr, w, h).c, w, h, col);
      g.drawImage(t, 0, s0, w, s1 - s0, a.rc.x, a.rc.y + s0 / h * a.rc.h, a.rc.w, (s1 - s0) / h * a.rc.h);
    },
    /* the building's EDGE, two world pixels proud of its roof and walls and
       never along its foot (the ground line is not an edge anyone sees): the
       shape stepped left, right and up, less the shape itself — cached with
       the mask, coloured at draw time */
    rim(g, a, col) {
      if (!a.spr) return;
      const w = Math.max(1, Math.round(a.rc.w)), h = Math.max(1, Math.round(a.rc.h)), m = this.mask(a.spr, w, h);
      if (!m.rim) {
        const c = document.createElement('canvas');
        c.width = w + 2 * PX; c.height = h + PX;
        const x = c.getContext('2d');
        for (const [dx, dy] of [[0, PX], [2 * PX, PX], [PX, 0]]) x.drawImage(m.c, dx, dy);
        x.globalCompositeOperation = 'destination-out'; x.drawImage(m.c, PX, PX);
        m.rim = c;
      }
      const sx = a.rc.w / w, sy = a.rc.h / h, t = this.tinted(m.rim, w + 2 * PX, h + PX, col);
      g.drawImage(t, 0, 0, w + 2 * PX, h + PX, a.rc.x - PX * sx, a.rc.y - PX * sy, (w + 2 * PX) * sx, (h + PX) * sy);
    },
    // a ring of hard dots on the ground plane (sy squashes it into perspective)
    ring(g, cx, cy, r, sy, n, gap) {
      n = n || Math.max(14, Math.min(420, Math.round(Math.PI * r * (1 + sy) / (gap || 5))));
      for (let i = 0; i < n; i++) {
        const th = i / n * Math.PI * 2;
        g.fillRect(sn(cx + Math.cos(th) * r), sn(cy + Math.sin(th) * r * sy), PX, PX);
      }
    },
    // a four-point glint: a hard cross, arms `arm` cells long
    star(g, x, y, arm, col, hot) {
      g.fillStyle = col;
      for (let k = 1; k <= arm; k++) {
        g.fillRect(sn(x) + k * PX, sn(y), PX, PX); g.fillRect(sn(x) - k * PX, sn(y), PX, PX);
        g.fillRect(sn(x), sn(y) + k * PX, PX, PX); g.fillRect(sn(x), sn(y) - k * PX, PX, PX);
      }
      g.fillStyle = hot || '#ffffff'; g.fillRect(sn(x), sn(y), PX, PX);
    },
    /* A picture laid down with a hard dark outline round its whole silhouette
       — how every object in this world stands off the grass (the boulders',
       the crowns', the bushes' own rule). Drawn into a scratch canvas at
       world-pixel scale (x, y, w, h in world px, on the 2px grid; fn draws
       in world coordinates), outlined in the ink ramp, then blitted: the
       world's transform scales it up nearest-neighbour like everything else. */
    _ink: null,
    /* (`bare`: drawn and dissolved with no outline of its own — the cast's
       sprites carry theirs. A picture inside a picture — the caravan's cart
       inside the caravan — takes the next scratch down, never the one its
       maker is drawing into.) */
    _inkD: 0,
    inked(g, x, y, w, h, fn, dis, bare) {
      x = sn(x); y = sn(y); w = sn(w) + PX; h = sn(h) + PX;
      const stack = this._ink || (this._ink = []);
      let K = stack[this._inkD];
      if (!K) K = stack[this._inkD] = { a: document.createElement('canvas'), b: document.createElement('canvas') };
      if (K.a.width < w || K.a.height < h) {
        K.a.width = K.b.width = Math.max(K.a.width, w); K.a.height = K.b.height = Math.max(K.a.height, h);
      }
      const ga = K.a.getContext('2d'), gb = K.b.getContext('2d');
      ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, w, h);
      ga.imageSmoothingEnabled = false;
      ga.translate(-x, -y);
      this._inkD++;
      try { fn(ga); } finally { this._inkD--; }
      ga.setTransform(1, 0, 0, 1, 0, 0);
      gb.globalCompositeOperation = 'copy'; gb.drawImage(K.a, 0, 0, w, h, 0, 0, w, h);
      gb.globalCompositeOperation = 'source-in'; gb.fillStyle = AP().ink[0]; gb.fillRect(0, 0, w, h);
      gb.globalCompositeOperation = 'source-over';
      // `dis` 0..1: the picture dissolving in hard dither steps (TX.holes),
      // the outline with it — cut on the world's 2px grid, never an alpha
      const hole = dis > 0 && this.holes ? this.holes(dis) : null;
      if (hole) for (const c of [ga, gb]) {
        c.save(); c.globalCompositeOperation = 'destination-out';
        c.translate(-x % (8 * PX), -y % (8 * PX));
        c.fillStyle = c.createPattern(hole, 'repeat'); c.fillRect(0, 0, w + 8 * PX, h + 8 * PX);
        c.restore();
      }
      if (!bare) for (const [dx, dy] of [[-PX, 0], [PX, 0], [0, -PX], [0, PX]]) g.drawImage(K.b, 0, 0, w, h, x + dx, y + dy, w, h);
      g.drawImage(K.a, 0, 0, w, h, x, y, w, h);
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
  // a log lying east-west (pose 0), half over (1) or end over end (2), its foot at (x, y)
  function log(g, x, y, pose) {
    const W = AP().wood;
    if (pose === 2) {
      g.fillStyle = W[1]; g.fillRect(sn(x - 3), sn(y - 14), 6, 14);
      g.fillStyle = W[3]; g.fillRect(sn(x - 3), sn(y - 14), 2, 12);
      g.fillStyle = '#c8a978'; g.fillRect(sn(x - 3), sn(y - 14), 6, 4);
      return;
    }
    if (pose === 1) {
      // half over: one slanted trunk — rows stepped a cell at a time, its lit
      // edge up-left and its shade down-right, so it reads as ONE log at a
      // slant rather than three blocks on a stair
      for (let r = 0; r < 6; r++) {
        const xx = sn(x - 10 + r * 2), yy = sn(y - 2 - r * 2);
        g.fillStyle = W[1]; g.fillRect(xx, yy, 8, 2);
        g.fillStyle = W[3]; g.fillRect(xx, yy, 2, 2);
        g.fillStyle = W[0]; g.fillRect(xx + 6, yy, 2, 2);
      }
      g.fillStyle = '#c8a978'; g.fillRect(sn(x), sn(y - 14), 4, 4);       // the cut end, pale heartwood
      g.fillStyle = '#8a6a3a'; g.fillRect(sn(x + 2), sn(y - 12), 2, 2);
      return;
    }
    g.fillStyle = W[1]; g.fillRect(sn(x - 8), sn(y - 6), 16, 6);
    g.fillStyle = W[3]; g.fillRect(sn(x - 8), sn(y - 6), 12, 2);
    g.fillStyle = W[2]; g.fillRect(sn(x - 4), sn(y - 4), 4, 2);      // a knot in the bark
    g.fillStyle = W[0]; g.fillRect(sn(x - 8), sn(y - 2), 16, 2);
    g.fillStyle = '#c8a978'; g.fillRect(sn(x + 4), sn(y - 6), 4, 6);   // the cut end, pale heartwood
    g.fillStyle = '#8a6a3a'; g.fillRect(sn(x + 4), sn(y - 4), 2, 2);   // …and its pith
  }
  // a broken block of stone, its foot at (x, y): lit planes up and left, a crack, a chipped corner
  function block(g, x, y, w, h, i) {
    const S = AP().stone, x0 = sn(x - w / 2), y0 = sn(y - h);
    g.fillStyle = S[2]; g.fillRect(x0, y0 + 2, w, h - 2); g.fillRect(x0, y0, w - 2, 2);
    g.fillStyle = S[3]; g.fillRect(x0, y0, w - 4, 2); g.fillRect(x0, y0, 2, h - 2);
    g.fillStyle = S[4]; g.fillRect(x0 + 2, y0, 2, 2);
    g.fillStyle = S[1]; g.fillRect(x0, y0 + h - 2, w, 2); g.fillRect(x0 + w - 2, y0 + 2, 2, h - 2);
    g.fillStyle = S[0]; g.fillRect(x0 + (i % 2 ? 4 : w - 6), y0 + 2, 2, h - 4);
  }
  function nugget(g, x, y) {
    const Gd = AP().gold, x0 = sn(x - 6), y0 = sn(y - 8);
    g.fillStyle = Gd[0]; g.fillRect(x0, y0 + 4, 12, 4); g.fillRect(x0 + 2, y0 + 2, 10, 2);
    g.fillStyle = Gd[1]; g.fillRect(x0 + 2, y0, 6, 2); g.fillRect(x0, y0 + 2, 8, 4); g.fillRect(x0 + 8, y0 + 4, 2, 2);
    g.fillStyle = Gd[2]; g.fillRect(x0 + 2, y0 + 2, 4, 2); g.fillRect(x0 + 4, y0 + 4, 2, 2);
    g.fillStyle = Gd[3]; g.fillRect(x0 + 2, y0, 2, 2); g.fillRect(x0 + 2, y0 + 2, 2, 2);
  }
  function sack(g, x, y) {
    const B = AP().bone, x0 = sn(x - 4), y0 = sn(y - 8);
    g.fillStyle = B[1]; g.fillRect(x0, y0 + 2, 8, 6); g.fillRect(x0 + 2, y0, 4, 2);
    g.fillStyle = B[2]; g.fillRect(x0, y0 + 2, 2, 4);
    g.fillStyle = B[0]; g.fillRect(x0 + 2, y0 + 2, 4, 2); g.fillRect(x0 + 6, y0 + 4, 2, 4);
  }
  function chest(g, x, y) {
    const W = AP().wood, Gd = AP().gold, x0 = sn(x - 5), y0 = sn(y - 6);
    g.fillStyle = W[1]; g.fillRect(x0, y0, 10, 6);
    g.fillStyle = W[3]; g.fillRect(x0, y0, 10, 2);
    g.fillStyle = Gd[2]; g.fillRect(x0 + 4, y0 + 2, 2, 2);
  }
  // dust thrown along the ground where something landed `age` seconds ago
  function dust(g, x, y, age, n, col, reach) {
    if (age < 0 || age > 0.36) return;
    const a = stp(1 - age / 0.36, 3);
    if (!a) return;
    g.globalAlpha = a; g.fillStyle = col;
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1, d = (3 + (k >> 1) * 4 + age * (reach || 34)) * side;
      g.fillRect(sn(x + d), sn(y - 2 - (k >> 1) * 2 - age * 8 * (k % 3)), PX, PX);
    }
    g.globalAlpha = 1;
  }
  const fade = (g, p, from) => { g.globalAlpha = p > from ? stp(1 - (p - from) / (1 - from), 3) : 1; };

  /* ================= THE GOODS COME DOWN (the playtest's critics: "a hard
     cream RECTANGLE with a flat bottom and a flat top cut ~250 px above the
     ground — it reads as a stray UI bar, and over grass it reads olive";
     "the heaviest drop has no impact at all") ================= */
  /* THE LIGHT FROM THE SKY: a TAPERED shaft — a thread at the top of the
     view widening to the pile's breadth at the ground — that runs the FULL
     height of the view (the show is clipped to the board, R.drawCardShows),
     cut in 2px cells whose bands thin out to its edge by ORDERED DITHER: a
     hot thread at the heart, then three bands lit at 1/2, 1/4 and 1/8 of
     their cells in the tier's ramp, darker as they go out. Every lit cell is
     OPAQUE ink — the light is never gold laid over the meadow at an alpha,
     which is the olive and the lime — and the grass between the cells is
     the shaft's translucency. Three frames of flicker (the dither's phase
     and a breath of width), cached per (tone, width, height, frame): a
     frame of the shaft is one drawImage. */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const lit = (cx, cy, k) => BAYER[((cy & 3) << 2) | (cx & 3)] < k * 16;
  TX.SHAFT = { TOP: 4, FLICK: [1, 0.9, 1.08], FPS: 12 };
  TX._shafts = new Map();
  TX.shaftArt = function (tone, wBot, h, f) {
    wBot = Math.max(4, sn(wBot)); h = Math.max(16, Math.ceil(h / 16) * 16);
    const key = tone + '|' + wBot + '|' + h + '|' + f, hit = this._shafts.get(key);
    if (hit) return hit;
    const T = R.LIGHT.TONE[tone] || R.LIGHT.TONE.gold, W = wBot + 8;
    const c = document.createElement('canvas'); c.width = W; c.height = h;
    const x = c.getContext('2d'), mid = W / 2;
    const band = [[0.08, 1, T.hot], [0.36, 0.5, T.ramp[3]], [0.66, 0.25, T.ramp[2]], [1, 0.125, T.ramp[1]]];
    for (let r = 0; r < h; r += PX) {
      const q = r / h, hw = (this.SHAFT.TOP + (wBot - this.SHAFT.TOP) * Math.pow(q, 1.35)) / 2;
      for (let cx = 0; cx < W / PX; cx++) {
        const d = Math.abs(cx * PX + PX / 2 - mid) / Math.max(1, hw);
        if (d > 1) continue;
        const b = band.find(e => d <= e[0]);
        if (b[1] < 1 && !lit(cx + f, (r >> 1) + f * 2, b[1])) continue;
        x.fillStyle = b[2]; x.fillRect(cx * PX, r, PX, PX);
      }
    }
    if (this._shafts.size > 24) this._shafts.delete(this._shafts.keys().next().value);
    this._shafts.set(key, c);
    return c;
  };
  /* the shaft over (x, foot), world px, `t` seconds into its life: down out
     of the sky in a breath (its foot falls from the top of the view to the
     ground), held to `hold`, then narrowed in three hard steps to its thread
     and gone. False once it is over. */
  TX.shaft = function (g, x, foot, t, tone, wBot, hold) {
    if (t < 0) return true;
    const SLAM = 0.09, OUT = 0.3;
    if (t > hold + OUT) return false;
    const top = R.cam.y - 8, h = foot - top;
    if (h < 16) return true;
    const f = ((performance.now() / 1000 * this.SHAFT.FPS) | 0) % 3;
    const k = t <= hold ? 1 : [0.66, 0.33, 0.1][Math.min(2, ((t - hold) / OUT * 3) | 0)];
    const a = this.shaftArt(tone, wBot * k * this.SHAFT.FLICK[f], h, f);
    const dh = Math.max(PX, sn(a.height * (t < SLAM ? eo(t / SLAM) : 1)));
    g.drawImage(a, 0, 0, a.width, dh, sn(x - a.width / 2), sn(foot - a.height), a.width, dh);
    return true;
  };

  /* A PICTURE DISSOLVED IN HARD STEPS (never an alpha crossfade: two half-
     transparent piles read as a ghost): `k` 0..1 of its 2px cells gone, in
     the ordered dither's order, four steps — the hole pattern TX.inked cuts */
  TX._holes = [];
  TX.holes = function (k) {
    const n = Math.min(4, Math.max(0, Math.round(k * 4)));
    if (!n) return null;
    let c = this._holes[n];
    if (!c) {
      // the cells go in a SCATTERED order (a hash per cell of an 8×8 tile), so
      // the pile crumbles away rather than turning into a regular mesh
      c = this._holes[n] = document.createElement('canvas'); c.width = c.height = 8 * PX;
      const x = c.getContext('2d'); x.fillStyle = '#000';
      for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) if (hs(cx * 13 + 5, cy * 7 + 3) < n / 4) x.fillRect(cx * PX, cy * PX, PX, PX);
    }
    return c;
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
    // a log in the air, side-on, and the four turns of its tumble (45° apart)
    logSide() {
      const W = AP().wood;
      return art(20, 7, f => {
        f(0, 1, 17, 5, W[1]); f(0, 1, 17, 1, W[3]); f(0, 2, 17, 1, W[2]); f(0, 5, 17, 1, W[0]);
        f(5, 3, 3, 1, W[0]); f(11, 2, 1, 3, W[0]);
        f(16, 0, 4, 7, '#7a5a30'); f(17, 1, 3, 5, '#c8a978'); f(18, 3, 1, 1, '#6e4a26');
      });
    },
    turns() {
      const src = this.get('logSide');
      return [0, 1, 2, 3].map(q => art(24, 24, (f, x) => {
        x.imageSmoothingEnabled = false;
        x.translate(12, 12); x.rotate(q * Math.PI / 4); x.drawImage(src, -10, -4);
      }));
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
      return { ok: true, fly: { [res]: n }, pay: tc ? { ms: TX.PAY_MS } : undefined };
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
        const turns = GA.get('turns'), end = GA.get('logEnd'), dis = cl((p - 0.84) / 0.16);
        // the pile's hard shadow, as wide as what is down
        const down = now.filter(n => n.down && !n.it.dy);
        if (down.length && dis < 0.5) {
          const x0 = Math.min(...down.map(n => n.x)) - 6, x1 = Math.max(...down.map(n => n.x)) + 6;
          g.fillStyle = 'rgba(20,14,8,0.35)'; g.fillRect(sn(x0), sn(py - 1), sn(x1 - x0), PX);
        }
        TX.inked(g, px - 26, py - TL * 3.4, 52, TL * 3.4 + 4, gg => {
          for (const n of now) {
            if (n.down) gg.drawImage(end, Math.round(n.x - 4.5), Math.round(n.y - 13));
            else gg.drawImage(turns[((n.q * 6) | 0) % 4], Math.round(n.x - 12), Math.round(n.y - 16));
          }
        }, dis);
        // the storm's leaves, drifting down the light after the wood
        const L2 = AP().leaf, T2 = AP().thatch;
        for (let k = 0; k < 7; k++) {
          const t0 = 0.2 + hs(k, 3) * 0.6, tl = s.t - t0;
          if (tl < 0 || dis >= 1) continue;
          const y = Math.min(py - 2, py - TL * 2.6 + tl * TL * 1.3), x = px + (hs(k, 5) - 0.5) * 40 + Math.sin(tl * 5 + k) * 5;
          g.fillStyle = k % 3 === 0 ? T2[2] : L2[k % 2 ? 3 : 4];
          g.fillRect(sn(x), sn(y), PX, PX);
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
        if (down.length && dis < 0.5) {
          const x0 = Math.min(...down.map(n => n.x)) - 8, x1 = Math.max(...down.map(n => n.x)) + 8;
          g.fillStyle = 'rgba(20,14,8,0.35)'; g.fillRect(sn(x0), sn(py - 1), sn(x1 - x0), PX);
        }
        const stamps = typeof Sprites !== 'undefined' && Sprites.oreStamp;
        TX.inked(g, px - 30, py - TL * 3.6, 60, TL * 3.6 + 4, gg => {
          for (const n of now) {
            const [, , rr, v] = K.BLOCKS[n.i];
            if (stamps) { const st = Sprites.oreStamp(rr, v, false); gg.drawImage(st, Math.round(n.x - st._ox), Math.round(n.y - st._oy - rr)); }
            else block(gg, n.x, n.y, rr * 2, rr + 2, n.i);
          }
        }, dis);
        // every block lands throwing chips of itself: rubble bouncing out
        const O = AP().oreD;
        K.BLOCKS.forEach(([dx, dy, rr], i) => {
          const age = s.t - K.land(i);
          if (age < 0 || age > 0.46) return;
          for (let k = 0; k < 8; k++) {
            const a = -Math.PI * (0.06 + 0.88 * hs(i * 7 + k, 17)), v = 20 + hs(k, i + 31) * 30;
            const cx = px + dx + Math.cos(a) * v * age * 1.5, cy = py + dy - rr - Math.sin(a) * v * age * 1.5 + 90 * age * age;
            g.fillStyle = k % 3 === 0 ? O[5] : k % 3 === 1 ? O[3] : O[1];
            g.fillRect(sn(cx), sn(Math.min(py + 2, cy)), PX, PX);
          }
        });
        // and once down, the fresh faces wink in the pale light, one after another
        const settled = s.t - K.land(K.BLOCKS.length - 1);
        if (settled > 0 && dis < 0.5) {
          g.save();
          if (settled < 0.6 && R.inkOn(g, 0.8 * (1 - settled / 0.6), TX.STONE_LIGHT)) TX.ring(g, px, py - 2, 10 + eo(settled / 0.6) * 34, 0.5);
          K.BLOCKS.forEach(([dx, dy, rr], i) => {
            const ph = (settled * 1.6 + i * 0.37) % 1;
            if (ph > 0.4) return;
            const k = Math.sin(ph / 0.4 * Math.PI);
            TX.star(g, px + dx - rr * 0.35, py + dy - rr * 1.25, k > 0.6 ? 2 : 1, '#e6e2d6', '#ffffff');
          });
          g.restore();
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
        if (dis < 0.5) { g.fillStyle = 'rgba(20,14,8,0.32)'; g.fillRect(sn(px - 6), sn(py - 1), 12, 2); }
        const nug = GA.get('nugget');
        TX.inked(g, px - 10, y - 14, 20, 16, gg => gg.drawImage(nug, Math.round(px - 6), Math.round(y - 10)), dis);
        if (t >= K.LAND && t < rest) dust(g, px, py, t - K.LAND, 4, AP().soil[3], 24);
        // the glint: a hard four-point star caught, held and let go, its arms in steps
        const gt = (t - rest) / 0.6;
        if (gt > 0 && gt < 1 && dis < 0.5) {
          const arm = [1, 2, 4, 5, 4, 2, 1][Math.min(6, (gt * 7) | 0)];
          TX.star(g, px - 2, py - 7, arm, '#fff2c0', '#ffffff');
          g.save();
          if (R.inkOn(g, (1 - gt) * 0.95)) TX.ring(g, px, py - 4, 6 + gt * 26, 0.55, 14);
          g.restore();
        }
        // the coins flip up out of it, turning over, before they make for the bar
        const coins = GA.get('coins');
        for (let i = 0; i < K.COINS; i++) {
          const tl = t - (K.COIN + i * K.COIN_STEP);
          if (tl < 0 || tl > 0.16) continue;
          const a = -Math.PI / 2 + (i - 1.5) * 0.5, q = tl / 0.16;
          const cx = px + Math.cos(a) * 14 * q, cy = py - 8 + Math.sin(a) * 14 * q;
          g.drawImage(coins[((tl * 30) | 0) % 3], Math.round(cx - 2), Math.round(cy - 2));
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
        return { ok: true, fly: { food: this.FOOD, wood: this.WOOD, gold: this.GOLD }, pay: tc ? { ms: TX.PAY_MS } : undefined };
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
          // the caravan comes out of and goes back into the world in hard dither steps, never an alpha
          const gone = rd ? Math.max(1 - cl(p / 0.08), cl((p - 0.9) / 0.1)) : 1;
          if (moving && gone < 1) {
            g.fillStyle = AP().soil[3];
            for (let k = 0; k < 8; k++) {
              const ph = (rolled / 9 + k / 8) % 1;
              g.globalAlpha = stp(0.8 * (1 - ph) * (1 - gone), 3);
              g.fillRect(sn(cx - dir * (CART_BACK + ph * 22)), sn(rowY - 2 - ph * 8 - (k % 2) * 2), PX + (k % 2) * PX, PX);
            }
            g.globalAlpha = 1;
            g.save();
            for (let k = 0; k < 8; k++) {
              const ph = (rolled / 14 + k / 8) % 1;
              if (!R.inkOn(g, 0.9 * (1 - ph) * (1 - gone), k % 2 ? 'gold' : 'bronze')) continue;   // warm motes, in ink
              g.fillRect(sn(cx - dir * (20 + ph * 26)), sn(rowY - 30 - ph * 18 + (k % 3) * 3), PX, PX);
            }
            g.restore();
          }
          // the goods: off the bed, through the air, onto the pile at the door
          const aboard = PILE.map((_, k) => t < U[k]);
          const bedX = stopX - dir * 13, bedY = rd ? rowY - 22 : pile.y - TL * 3;
          const dis = cl((p - 0.9) / 0.1);
          const down = PILE.filter((it, k) => t - U[k] >= hop && !it[1]);
          if (down.length && dis < 0.5) {
            const x0 = Math.min(...down.map(it => it[0])) - 5, x1 = Math.max(...down.map(it => it[0])) + 8;
            g.fillStyle = 'rgba(20,14,8,0.3)'; g.fillRect(sn(pile.x + x0), sn(pile.y - 1), sn(x1 - x0), PX);
          }
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
              gg.drawImage(pic, Math.round(x - pic.width / 2), Math.round(y - pic.height));
            }
          }, dis);
          // the strongbox lands in the tier's light and spills: coins leap out and land round the pile, winking
          const ct = t - U[PILE.length - 1] - hop;
          if (ct > 0 && dis < 0.5) {
            if (ct < 0.7) {
              g.save();
              const q = ct / 0.7;
              if (R.inkOn(g, 0.9 * (1 - q), TX.BRONZE_LIGHT)) TX.ring(g, pile.x, pile.y - 2, 10 + eo(q) * 40, 0.5);
              if (R.inkOn(g, 0.8 * (1 - q), 'gold')) TX.ring(g, pile.x, pile.y - 2, 6 + eo(q) * 24, 0.5);
              g.restore();
            }
            const coins = GA.get('coins');
            for (let k = 0; k < 10; k++) {
              const ang = -Math.PI * (0.06 + 0.88 * hs(k, 11)), sp2 = 12 + hs(k, 13) * 18, f = Math.min(1, ct / 0.32);
              const x = pile.x - 1 + Math.cos(ang) * sp2 * f, y = pile.y - 14 + (f * 14) - Math.sin(f * Math.PI) * 14;
              g.drawImage(coins[f < 1 ? ((ct * 30 + k) | 0) % 3 : 0], Math.round(x - 2), Math.round(y - 4));
              if (f >= 1 && ((ct * 6 + k) % 3) < 0.4) TX.star(g, x, y - 3, 1, '#fff2c0');
            }
          }
          // the caravan itself: the cast's ox and drover and the cart, on its road
          if (rd && gone < 1) {
            const x0 = dir > 0 ? cx - CART_BACK : cx - CART_FRONT;
            if (gone < 0.5) { g.fillStyle = 'rgba(20,14,8,0.32)'; g.fillRect(sn(x0 + 2), sn(rowY - 1), sn(CART_BACK - 4), PX); }   // the cart's shadow
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
        for (const b of list) b.hp = b.maxhp;
        const n = list.length, tc = TX.tc();
        Deck.say('🧵 Mending: ' + n + ' building' + (n > 1 ? 's' : '') + ' made whole' +
          (fires ? ' and ' + fires + ' fire' + (fires > 1 ? 's' : '') + ' put out' : '') + '.');
        const c = tc ? { x: Bld.cx(tc), y: Bld.cy(tc) } : { x: Bld.cx(list[0]), y: Bld.cy(list[0]) };
        const hit = list.map(b => ({ id: b.id, d: Math.hypot(Bld.cx(b) - c.x, Bld.cy(b) - c.y) })).sort((a, b) => a.d - b.d);
        const far = hit[hit.length - 1].d, speed = Math.max(14, far / 1.1);
        TX.show('mending', { cx: c.x, cy: c.y, hit, speed, ms: Math.min(3200, (far / speed + 1.0) * 1000) });
        TX.sound('cardMend');
        return { ok: true, msg: 'Mending: ' + n + ' building' + (n > 1 ? 's' : '') + ' made whole.' };
      },
      show: {
        ms: 1800, layer: 'world',
        draw(g, s, p) {
          const TL = TLs(), r = s.t * s.speed, far = s.hit[s.hit.length - 1].d + 1;
          // the wave: a ring of warm dots rolling out over the town, and a
          // fainter one behind it — gold ink, laid opaque (a lime-green ring
          // ADDED over the meadow was the colour of nothing this card does)
          g.save();
          for (const [lag, a0] of [[0, 1], [0.7, 0.45]]) {
            const rr = r - lag;
            if (rr <= 0 || rr > far + 2) continue;
            const k = rr / (far + 2), a = a0 * (1 - k * k);
            if (R.inkOn(g, 0.75 * a)) TX.ring(g, s.cx * TL, s.cy * TL, rr * TL, 0.62, 0, 4);
            if (R.inkOn(g, a)) TX.ring(g, s.cx * TL, s.cy * TL, rr * TL - 3, 0.62, 0, 8);
          }
          g.restore();
          // each building as the light reaches it
          for (const h of s.hit) {
            const age = (r - h.d) / s.speed;
            if (age < 0 || age > 0.9) continue;
            const b = Bld.get(h.id);
            if (!b || !TX.bNear(b)) continue;
            const a = TX.art(b);
            // the building flares GOLD as it is made whole (R.glow over its own
            // worn shape: it turns gold in its own light and shade, then bright)
            if (age < 0.6) R.glow(g, 1 - age / 0.6, c => TX.paint(g, a, c, 0, 1));
            g.save();
            // the sparks of a town patched up: crosses rising off the roof, a mending + above it
            for (let k = 0; k < 6; k++) {
              const tl = age - k * 0.05;
              if (tl < 0 || tl > 0.55) continue;
              const x = a.rc.x + (a.box.l + (a.box.r - a.box.l) * hs(h.id, k)) * a.rc.w;
              const y = a.rc.y + (a.box.t + (a.box.b - a.box.t) * hs(k, h.id) * 0.8) * a.rc.h - tl * 22;
              const ink = R.goldInk(1 - tl / 0.55);
              if (ink) TX.star(g, x, y, tl < 0.25 ? 2 : 1, ink, '#fff8e8');
            }
            const cx = a.rc.x + (a.box.l + a.box.r) / 2 * a.rc.w, cy = a.rc.y + a.box.t * a.rc.h - 4 - age * 16;
            if (R.inkOn(g, 1.2 * (1 - age / 0.9))) { g.fillRect(sn(cx) - 1, sn(cy) - 5, 2, 6); g.fillRect(sn(cx) - 3, sn(cy) - 3, 6, 2); }
            g.restore();
          }
        },
      },
    },

    /* BRONZE — Master Builders: three charges in S.deck.charges (a second
       card adds three more). The next buildings the player places through
       the placement confirm stand complete at once, at full strength, still
       paid for — never walls or gates, never the Wonder (Rule 4). A column
       of gold comes down on the site and the building fills with light from
       its foot to its crown. */
    master_builders: {
      at: 'bar', N: 3, NOT: { wonder: 1, wall: 1, gate: 1, tc: 1 },
      can() { return { ok: true }; },
      apply() {
        const run = Deck.run(), n = (run.charges.master_builders | 0) + this.N;
        run.charges.master_builders = n;
        Deck.say('⚒ Master Builders: the next ' + n + ' buildings you place stand complete the moment they are placed.');
        TX.sound('cardBuild');
        return { ok: true, charges: n, msg: 'Master Builders: your next ' + n + ' buildings stand complete the moment they are placed.' };
      },
      // the strip's chip (js/deckui.js): the count in hand, the ring a card's worth
      chip(n) {
        n = n | 0;
        return n > 0 ? { label: '×' + n, frac: Math.min(1, n / this.N), words: n + (n === 1 ? ' building' : ' buildings') } : null;
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
        if (typeof R !== 'undefined' && R.startPlacePoof) R.startPlacePoof(b.x, b.y, Bld.size(b), { delay: 300, scale: 1.25 });
        TX.sound('cardBuild');
        return true;
      },
      show: {
        ms: 1600, layer: 'world',
        draw(g, s, p) {
          const b = Bld.get(s.bid); if (!b || !TX.bNear(b)) return;
          const TL = TLs(), a = TX.art(b), rc = a.rc, top = rc.y + a.box.t * rc.h, foot = rc.y + a.box.b * rc.h;
          const x0 = sn(rc.x + a.box.l * rc.w), x1 = sn(rc.x + a.box.r * rc.w), w = x1 - x0;
          // the column of gold, slammed down, held, then narrowing to a thread
          // (the card's light, R.glow: what stands in it turns gold, then bright)
          const up = cl(p / 0.08), down = p < 0.5 ? 1 : 1 - cl((p - 0.5) / 0.3);
          if (down > 0) {
            const colTop = top - TL * 3, h = (foot - colTop) * up;
            for (const [wf, sv] of [[1.15, 0.5], [0.6, 0.7], [0.18, 0.9]]) {
              const ww = Math.max(PX, sn(w * wf * down));
              R.glow(g, sv, () => g.fillRect(sn((x0 + x1) / 2 - ww / 2), sn(colTop), ww, sn(h)));
            }
          }
          // the building fills with gold light from its foot to its crown, then
          // lets it go — in its own light and shade, over its worn shape
          if (a.spr) {
            const rise = cl((p - 0.06) / 0.42), fy = a.box.b - (a.box.b - a.box.t) * eo(rise);
            const fl = p < 0.55 ? 0.75 : 0.75 * (1 - (p - 0.55) / 0.3);
            if (fl > 0) R.glow(g, fl, c => TX.paint(g, a, c, fy, 1));
            if (rise > 0 && rise < 1) R.glowHot(g, 1, c => TX.paint(g, a, c, fy, fy + 2 / rc.h));
          }
          g.save();
          // sparks off the scaffold that was never needed, in the gold's ink
          for (let k = 0; k < 12; k++) {
            const tl = p - 0.1 - k * 0.04;
            if (tl < 0 || tl > 0.45) continue;
            const x = x0 + hs(k, s.bid) * w, y = foot - hs(s.bid, k) * (foot - top) - tl * 40;
            if (!R.inkOn(g, (k % 3 ? 0.75 : 1) * (1 - tl / 0.45))) continue;
            g.fillRect(sn(x), sn(y), PX, PX);
          }
          // and a ring of dots runs out over the ground as the dust settles
          if (p > 0.45) {
            const q = (p - 0.45) / 0.55;
            if (R.inkOn(g, 0.9 * (1 - q))) TX.ring(g, (x0 + x1) / 2, foot - 2, w * 0.6 + q * TL * 1.4, 0.5);
          }
          g.restore();
          if (!s.floated && p > 0.5) {
            s.floated = true;
            TX.float(Bld.cx(b), b.y - 0.2, s.left ? '⚒ ' + s.left + ' left' : '⚒ the last');
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
        return { ok: true, until: e.until };
      },
      end() { G.log('🔥 The watchfires burn down — your towers shoot as they did before.'); },
      // the beacon on one tower: a brazier, its flame, its light, its embers
      beacon(g, b, k, now) {
        const TL = TLs(), c = TX.crown(b), s = TL * (b.key === 'warcamp' ? 0.62 : 0.5) * k;
        if (s < 2) return;
        const fx = c.x, fy = c.y + 2;
        // its light round the crown: the bronze of firelight, never lime
        const fl = 0.9 + 0.1 * Math.sin(now * 9 + b.id);
        R.glow(g, 0.12, () => R.pxDisc(g, fx, fy - s * 0.35, TL * 0.95 * k * fl, 2, 0.8), 'bronze');
        R.glow(g, 0.3, () => R.pxDisc(g, fx, fy - s * 0.35, TL * 0.5 * k * fl, 2, 0.8), 'bronze');
        // the iron basket it burns in
        g.fillStyle = AP().ink[1]; g.fillRect(sn(fx - 5), sn(fy - 2), 10, 2); g.fillRect(sn(fx - 3), sn(fy), 6, 2);
        TX.flame(g, fx, fy - 1, s, ((now * 7.7) | 0) + b.id);
        // embers rising off it
        const F = AP().fire;
        for (let i = 0; i < 4; i++) {
          const ph = (now * 0.8 + i / 4 + (b.id * 0.37) % 1) % 1;
          g.fillStyle = F[i % 2 ? 2 : 3]; g.globalAlpha = stp(1 - ph, 3);
          g.fillRect(sn(fx + Math.sin(ph * 7 + i * 2 + b.id) * 5), sn(fy - s * 0.8 - ph * TL * 1.1), PX, PX);
        }
        g.globalAlpha = 1;
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
            // the bronze of firelight (R.glow), its sparks in the fire's ink
            if (s.fresh && tl < 0.45) {
              const c = TX.crown(b), q = tl / 0.45, h = TL * 1.4 * eo(q);
              for (const [w, sv] of [[6, 0.58], [2, 1]]) R.glow(g, sv * (1 - q), () => g.fillRect(sn(c.x - w / 2), sn(c.y - h), w, sn(h)), 'bronze');
              for (let k = 0; k < 8; k++) {
                const a = k / 8 * Math.PI * 2, d = 4 + q * 18;
                if (!R.inkOn(g, (k % 2 ? 1 : 0.7) * (1 - q), k % 2 ? 'gold' : 'bronze')) continue;
                g.fillRect(sn(c.x + Math.cos(a) * d), sn(c.y - 6 + Math.sin(a) * d * 0.7 - q * 6), PX, PX);
              }
            }
            // the reach: the old ring faint, then a ring of fire-dots growing out
            // to the new one — opaque fire ink (added over the meadow, lime)
            const gq = cl((tl - 0.15) / 0.7), r = f.r0 + (f.r1 - f.r0) * eo(gq);
            const a = gq < 1 ? 0.9 : stp(0.9 * (1 - (tl - 0.85) / 1.2), 4);
            if (a > 0) {
              if (R.inkOn(g, a * 0.35, 'bronze')) TX.ring(g, f.ox * TL, f.oy * TL, f.r0 * TL, 1);
              if (R.inkOn(g, a, 'bronze')) TX.ring(g, f.ox * TL, f.oy * TL, r * TL, 1);
            }
            g.restore();
          }
        },
      },
    },

    /* IRON — Stone Skin: the player's buildings take half damage for the
       card's 8 days — every blow, an attack or the wilds' fire, halved in
       Bld.damage before the subtraction (Deck.bldTakes), and the float says
       the half. A cold flash and a jolt at the play, a wave of runes rolling
       out from the hall, each building encased in grey as it passes; while
       it runs a cold sheen climbs each one in turn and a blow that glances
       off throws a spark. */
    stone_skin: {
      at: 'tc', mult: { bldHurt: 0.5 },
      can() { return { ok: true }; },
      apply() {
        const days = Deck.card('stone_skin').days, was = !!Deck.timed('stone_skin');
        const e = Deck.addTimed('stone_skin', days), tc = TX.tc();
        Deck.say(was ? '🪨 Stone Skin holds — ' + days + ' more days.'
          : '🪨 Stone Skin: your buildings take half damage for ' + days + ' days.');
        const mine = S.buildings.filter(b => b.owner === 'P' && !(b.construction > 0));
        if (tc && mine.length) {
          const hit = mine.map(b => ({ id: b.id, d: Math.hypot(Bld.cx(b) - Bld.cx(tc), Bld.cy(b) - Bld.cy(tc)) })).sort((a, b) => a.d - b.d);
          const far = hit[hit.length - 1].d, speed = Math.max(12, far / 1.3);
          TX.show('stone_skin', { cx: Bld.cx(tc), cy: Bld.cy(tc), hit, speed, ms: Math.min(3400, (far / speed + 1.2) * 1000) });
        }
        TX.sound('cardSkin');
        return { ok: true, until: e.until };
      },
      end() { G.log('🪨 Stone Skin wears off — your buildings take blows in full again.'); },
      // a blow glanced off: where, and when (render state — never in S)
      _glints: [],
      glance(b) {
        if (this._glints.length > 15) this._glints.shift();
        const s = Bld.size(b);
        this._glints.push({ x: Bld.cx(b) + (Math.random() - 0.5) * 0.7 * s, y: b.y + s * 0.5 + (Math.random() - 0.5) * 0.5 * s, t: performance.now() });
        TX.sound('cardGlance');
      },
      RUNES: [['#.#', '.#.', '#.#', '.#.'], ['##.', '#.#', '##.', '#..'], ['.#.', '###', '.#.', '.#.'], ['#..', '##.', '#.#', '#..'], ['###', '.#.', '.#.', '###']],
      rune(g, x, y, i) {
        const R0 = this.RUNES[i % this.RUNES.length];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) if (R0[r][c] === '#') g.fillRect(sn(x) + c * PX, sn(y) + r * PX, PX, PX);
      },
      drawLive(g, e) {
        const now = performance.now() / 1000;
        // the whole town breathes together, slow and cold — one phase for every
        // building, so the skin reads as one ward and never as a flicker
        const breath = stp(0.5 + 0.12 * Math.sin(now * 1.9), 10);
        let n = 0;
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const b of S.buildings) {
          if (b.owner !== 'P' || b.construction > 0 || !TX.bNear(b)) continue;
          if (++n > 60) break;
          const a = TX.art(b);
          if (!a.spr) continue;
          /* THE SKIN ITSELF, for all eight days: a cold rim of stone-light
             round every roof and wall. Without it a warded town read as an
             ordinary one — a sheen on each building a quarter of the time,
             faint, was 48 marks over six frames for a whole town. */
          g.globalAlpha = breath; TX.rim(g, a, '#7fa6d2');
          // the sheen climbs each building in its own turn, every few seconds
          const ph = (now / 3.4 + (b.id * 0.618) % 1) % 1;
          if (ph > 0.3) continue;
          const k = ph / 0.3, f = a.box.b - (a.box.b - a.box.t) * k;
          g.globalAlpha = 0.4; TX.paint(g, a, '#d8e8f8', f - 0.1, f);
          // and a rune shows on its face for a moment
          if (k > 0.3 && k < 0.8) {
            g.globalAlpha = stp(0.8 * Math.sin((k - 0.3) / 0.5 * Math.PI), 3); g.fillStyle = '#e6f2ff';
            this.rune(g, a.rc.x + (a.box.l + (a.box.r - a.box.l) * hs(b.id, 3)) * a.rc.w - 3,
              a.rc.y + (a.box.t + (a.box.b - a.box.t) * (0.3 + 0.4 * hs(3, b.id))) * a.rc.h, b.id);
          }
        }
        g.globalAlpha = 1;
        // a blow that glances off: a cold spark, thrown wide
        const ms = performance.now(), TL = TLs();
        for (let i = this._glints.length - 1; i >= 0; i--) {
          const gl = this._glints[i], tl = (ms - gl.t) / 1000;
          if (tl > 0.4) { this._glints.splice(i, 1); continue; }
          const x = gl.x * TL, y = gl.y * TL, q = tl / 0.4;
          g.globalAlpha = stp(1 - q, 3);
          TX.star(g, x, y, q < 0.4 ? 3 : 2, '#cfe0f4', '#ffffff');
          g.fillStyle = '#e6f2ff';
          for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.4; g.fillRect(sn(x + Math.cos(a) * (4 + q * 14)), sn(y + Math.sin(a) * (3 + q * 10)), PX, PX); }
        }
        g.restore();
      },
      show: {
        ms: 2600, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (layer === 'sky') {
            if (!s.boom) {
              s.boom = true;
              if (R.flashAt) R.flashAt(0.24, 0.5, '200,216,236');
              if (R.shakeAt) R.shakeAt(3, 0.4);
            }
            return;
          }
          const TL = TLs(), r = s.t * s.speed, far = s.hit[s.hit.length - 1].d + 1.5;
          const SK = Deck.FX.stone_skin;
          // the runes roll out over the town, cold and quick
          if (r < far + 1) {
            g.save(); g.globalCompositeOperation = 'lighter';
            g.globalAlpha = stp(1.1 * (1 - r / (far + 1)), 4); g.fillStyle = '#dbe8f8';
            const rr = r * TL, n = Math.max(10, Math.min(160, Math.round(rr / 4.5)));
            for (let i = 0; i < n; i++) {
              const th = i / n * Math.PI * 2 + s.t * 0.4;
              SK.rune(g, s.cx * TL + Math.cos(th) * rr - 3, s.cy * TL + Math.sin(th) * rr * 0.62 - 4, i);
            }
            g.globalAlpha = stp(0.7 * (1 - r / (far + 1)), 4);
            TX.ring(g, s.cx * TL, s.cy * TL, Math.max(2, rr - 10), 0.62, 0, 4);
            TX.ring(g, s.cx * TL, s.cy * TL, rr + 12, 0.62, 0, 4);
            g.restore();
          }
          // each building, encased in grey as the wave passes, then the grey sinks in
          for (const h of s.hit) {
            const age = (r - h.d) / s.speed;
            if (age < 0 || age > 1.0) continue;
            const b = Bld.get(h.id);
            if (!b || !TX.bNear(b)) continue;
            const a = TX.art(b);
            if (!a.spr) continue;
            const up = cl(age / 0.22), f = a.box.b - (a.box.b - a.box.t) * eo(up);
            g.globalAlpha = age < 0.4 ? 0.6 : stp(0.6 * (1 - (age - 0.4) / 0.6), 4);
            if (g.globalAlpha > 0) TX.paint(g, a, '#8ea2b6', f, 1);
            if (up < 1) { g.globalAlpha = 1; g.save(); g.globalCompositeOperation = 'lighter'; TX.paint(g, a, '#eef6ff', f, f + 2 / a.rc.h); g.restore(); }
            g.globalAlpha = 1;
          }
        },
      },
    },

    /* ENLIGHTENMENT — Unbreakable Hall: for the card's 12 days the player's
       Town Center never drops below a sliver (2% of its strength, never under
       1 hp): Deck.bldTakes caps every blow at what stands above it, on the
       attack path and the wilds' fire alike, and never raises a hall already
       lower. The rival's Wonder still ends the run — that is a race lost,
       not a hall fallen. The play is held: the sky darkens, a pillar of gold
       comes down on the hall, the ground shakes as it lands and a dome of
       light rises over it; while it runs the dome stands, and flares where
       a blow is swallowed. */
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
      end() { G.log('🏛 The ward on your Town Center fades — it can fall again.'); },
      // a blow on the warded hall (render state): the dome flares
      _hit: 0, _took: 0,
      struck(b, took) {
        this._hit = performance.now(); this._took = took;
        TX.sound('cardWard');
      },
      // the dome over the hall, world px: centre, ground, radius, height
      geom(tc) {
        const TL = TLs(), sz = Bld.size(tc), c = TX.crown(tc);
        const cx = Bld.cx(tc) * TL, gy = (tc.y + sz) * TL - 4, rx = (sz / 2 + 0.6) * TL;
        return { cx, gy, rx, ry: rx * 0.42, hd: Math.max(rx * 0.9, gy - c.y + TL * 0.35) };
      },
      /* ONE RAY OF THE SKY, in hard pixels (device px, the sky layer): the
         wedge between angles a±wa from (ax, ay), cut into px-wide columns —
         or rows, for a ray nearer the vertical — each column the wedge's own
         span snapped to the px grid. A stepped band of light in the dome's
         language; a vector wedge was the one soft edge in the show. */
      ray(g, ax, ay, a, wa, px, W, H) {
        const c = Math.cos(a), s0 = Math.sin(a), t0 = Math.tan(a - wa), t1 = Math.tan(a + wa);
        const snap = v => Math.round(v / px) * px;
        if (Math.abs(c) >= Math.abs(s0)) {
          const sg = c > 0 ? 1 : -1;
          for (let k = 0; ; k++) {
            const x = ax + sg * k * px;
            if (x < -px || x > W + px) break;
            const dx = x - ax, y0 = ay + dx * t0, y1 = ay + dx * t1;
            const lo = snap(Math.min(y0, y1)), hi = snap(Math.max(y0, y1));
            if (hi < 0 || lo > H) continue;              // off the screen here: the ray may still come on
            g.fillRect(snap(x), lo, px, Math.max(px, hi - lo));
          }
        } else {
          const sg = s0 > 0 ? 1 : -1, c0 = 1 / t0, c1 = 1 / t1;
          for (let k = 0; ; k++) {
            const y = ay + sg * k * px;
            if (y < -px || y > H + px) break;
            const dy = y - ay, x0 = ax + dy * c0, x1 = ax + dy * c1;
            const lo = snap(Math.min(x0, x1)), hi = snap(Math.max(x0, x1));
            if (hi < 0 || lo > W) continue;
            g.fillRect(lo, snap(y), Math.max(px, hi - lo), px);
          }
        }
      },
      dome(g, D, rise, boost, now) {
        const { cx, gy, rx, ry } = D, hd = D.hd * rise;
        if (hd < 2) return;
        /* the light inside it: two hard bands, stepped, never a gradient —
           and only while it is LIT (rising, or a blow being swallowed): a
           dome of gold ADDED stood over the town for twelve days as a lime
           blister, and any standing tint of the meadow under it reads olive.
           Lit, it is the card's light at its faint steps (R.glow: the hall in
           it turns gold and its thatch still shows through) */
        if (boost > 0) for (const [k, sv] of [[1, 0.35], [0.62, 0.55]]) {
          R.glow(g, boost * sv, () => {
            for (let y = 0; y < hd * k; y += PX) {
              const w = Math.sqrt(Math.max(0, 1 - (y / (hd * k)) * (y / (hd * k)))) * rx * k;
              g.fillRect(sn(cx - w), sn(gy - y), Math.max(PX, sn(w * 2)), PX);
            }
          });
        }
        g.save();
        // its ribs: the outline, two meridians and a girdle, made of dots, a
        // shimmer running round — opaque gold ink, faded down the ramp
        const dots = (fx, fy, n, base) => {
          for (let i = 0; i <= n; i++) {
            const th = i / n * Math.PI, x = fx(th), y = fy(th);
            const sh = Math.max(0, Math.sin(th * 3 - now * 2.2));
            if (!R.inkOn(g, base + sh * 0.35 + boost * 0.4)) continue;
            g.fillRect(sn(x), sn(y), PX, PX);
          }
        };
        const nO = Math.max(16, Math.round((rx + hd) / 2));
        dots(th => cx + Math.cos(th) * rx, th => gy - Math.sin(th) * hd, nO, 0.6);
        dots(th => cx + Math.cos(th) * rx * 0.55, th => gy - Math.sin(th) * hd, Math.round(nO * 0.7), 0.25);
        dots(th => cx + Math.cos(th + Math.PI) * rx, th => gy + Math.sin(th) * ry, nO, 0.4);     // the ring on the ground, in front
        dots(th => cx + Math.cos(th) * rx * 0.86, th => gy - hd * 0.5 + Math.sin(th) * ry * 0.7, Math.round(nO * 0.8), 0.22);
        g.restore();
        g.globalAlpha = 1;
      },
      drawLive(g, e) {
        const tc = TX.tc();
        if (!tc || !TX.bNear(tc)) return;
        // the dome rises on the play's own clock (render time) after the pillar
        // lands; with no fresh play on screen it simply stands
        const now = performance.now() / 1000, sh = TX.fresh('unbreakable_hall');
        const rise = sh ? eo(cl((sh.t - this.IMPACT * sh.ms / 1000) / 1.2)) : 1;
        const sinceHit = (performance.now() - this._hit) / 1000;
        const boost = sinceHit < 0.5 ? stp(1 - sinceHit / 0.5, 4) : 0;
        const D = this.geom(tc);
        this.dome(g, D, rise, boost, now);
        // a blow swallowed: a ripple of gold runs out over the dome's skin
        if (boost > 0) {
          g.save();
          if (R.inkOn(g, boost)) TX.ring(g, D.cx, D.gy, D.rx * (1 + (1 - boost) * 0.35), 0.42);
          g.restore();
        }
      },
      show: {
        ms: 4200, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const tc = Bld.get(s.tc); if (!tc) return;
          const U = Deck.FX.unbreakable_hall, TL = TLs(), D = U.geom(tc), imp = U.IMPACT;
          if (layer === 'world') {
            // the ground answers the blow: rings of gold rolling out from the hall
            if (p > imp) {
              const q = (p - imp) / 0.5;
              g.save();
              for (const [lag, reach] of [[0, 7], [0.12, 5], [0.24, 3.5]]) {
                const qq = (q - lag) / (1 - lag);
                if (qq <= 0 || qq >= 1) continue;
                if (R.inkOn(g, 0.95 * (1 - qq))) TX.ring(g, D.cx, D.gy, D.rx + eo(qq) * reach * TL, 0.42);
              }
              g.restore();
            }
            // motes of gold coming down in the pillar, in the gold's ink
            if (p > 0.04 && p < 0.7) {
              g.save();
              for (let k = 0; k < 14; k++) {
                const ph = (s.t * 0.9 + hs(k, 21)) % 1;
                if (!R.inkOn(g, Math.sin(ph * Math.PI))) continue;
                g.fillRect(sn(D.cx + (hs(21, k) - 0.5) * D.rx * 1.3), sn(D.gy - D.hd * 2.6 * (1 - ph)), PX, PX);
              }
              g.restore();
            }
            // the dome rises brighter than it will stand
            if (p > imp && p < 0.75) U.dome(g, D, eo(cl((p - imp) / 0.3)), stp(0.6 * (1 - cl((p - imp) / 0.55)), 4), performance.now() / 1000);
            return;
          }
          // ---- the sky (device pixels) ----
          if (!s.boom && p >= imp) {
            s.boom = true;
            if (R.shakeAt) R.shakeAt(7, 0.8);
            // (no whole-frame flash: gold laid over the meadow was the sepia
            // wash, milk would be a pale green one — the pillar landing in
            // the darkened sky, the shake, the rings and the halo of dots
            // bursting across the screen are the blow)
            if (R.startle) R.startle(Bld.cx(tc), Bld.cy(tc), 14);
            TX.sound('cardHall');
          }
          const W = R.cv.width, H = R.cv.height, A = TX.scr(D.cx, D.gy), apex = TX.scr(D.cx, D.gy - D.hd);
          // the sky darkens for it, and lifts after
          const veil = p < 0.25 ? cl(p / 0.25) : p < 0.62 ? 1 : 1 - cl((p - 0.62) / 0.3);
          if (veil > 0) { g.fillStyle = 'rgba(12,8,24,' + stp(0.3 * veil, 6) + ')'; g.fillRect(0, 0, W, H); }
          g.save();
          // the pillar: down from the top of the sky onto the hall, held, then
          // a thread, then gone — the card's light (R.glow: what stands in it
          // turns gold, then cream), a white-hot thread at its heart
          const down = cl((p - 0.03) / (imp - 0.03)), narrow = p < 0.62 ? 1 : 1 - cl((p - 0.62) / 0.26);
          if (down > 0 && narrow > 0) {
            const bottom = A.y * eo(down), wide = D.rx * 2 * A.z;
            for (const [wf, sv] of [[1.25, 0.5], [0.7, 0.7], [0.3, 0.9], [0.08, 1]]) {
              const ww = Math.max(2, Math.round(wide * wf * narrow / 2) * 2);
              R.glow(g, sv, () => g.fillRect(Math.round(A.x - ww / 2), 0, ww, Math.round(bottom)));
            }
            const hw = Math.max(2, Math.round(wide * 0.03 * narrow / 2) * 2);
            R.glowHot(g, 0.75, () => g.fillRect(Math.round(A.x - hw / 2), 0, hw, Math.round(bottom)));
          }
          // rays from the dome's crown, turning slowly, while it rises and
          // holds — NARROW bands of the card's light (added, they were lime;
          // laid solid at their old width across the meadow, orange slabs)
          if (p > imp && p < 0.9) {
            const k = p < 0.35 ? cl((p - imp) / 0.15) : 1 - cl((p - 0.6) / 0.3);
            const rot = s.t * 0.12, px = Math.max(2, Math.round(A.z * 2));
            for (let i = 0; i < 14; i++)
              R.glow(g, (i % 2 ? 0.4 : 0.6) * k, () => U.ray(g, apex.x, apex.y, rot + i / 14 * Math.PI * 2, 0.012 + (i % 2) * 0.006, px, W, H));
          }
          // a halo of hard dots bursting out across the whole screen at the blow
          if (p > imp && p < imp + 0.35) {
            const q = (p - imp) / 0.35, rr = q * Math.hypot(W, H) * 0.7, px = Math.max(2, Math.round(A.z * 2));
            const n = Math.min(220, Math.max(24, Math.round(rr / (px * 3))));
            if (R.inkOn(g, 1 - q)) for (let i = 0; i < n; i++) {
              const th = i / n * Math.PI * 2;
              g.fillRect(Math.round((A.x + Math.cos(th) * rr) / px) * px, Math.round((A.y + Math.sin(th) * rr * 0.6) / px) * px, px, px);
            }
          }
          g.restore();
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
       each stepping the food count as it lands; then the lot is gone in
       hard steps */
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
        if (t >= land && dis < 0.5) { g.fillStyle = 'rgba(20,14,8,0.32)'; g.fillRect(sn(px - 10), sn(py - 1), 20, PX); }
        const bk = GA.get('basket');
        TX.inked(g, px - 40, py - TL * 3.4, 80, TL * 3.4 + 6, gg => {
          // the basket: falling, landing with a squash, then tipped onto its side toward the food
          let by = py, tip = 0;
          if (t < K.T0) return;
          if (t < land) { const q = (t - K.T0) / K.FALL; by = py - TL * 3 * (1 - q * q); }
          else if (t < land + 0.08) by = py + 1;
          if (t >= K.TIP) tip = Math.min(1, (t - K.TIP) / 0.1);
          gg.save();
          gg.translate(Math.round(px), Math.round(by));
          gg.rotate(tip * 0.42);
          gg.drawImage(bk, -7, -11);
          gg.restore();
          // the food thrown out of its mouth, landing round it
          for (let i = 0; i < K.FOOD.length; i++) {
            const tl = t - (K.SPILL + i * K.STEP);
            if (tl < 0) continue;
            const [dx, dy, key, hgt] = K.FOOD[i], pic = GA.get(key), q = Math.min(1, tl / K.HOP);
            const x = px + 4 + (dx - 4) * q, y = py - 6 + (dy + 6) * q - Math.sin(q * Math.PI) * hgt;
            gg.drawImage(pic, Math.round(x - pic.width / 2), Math.round(y - pic.height));
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
