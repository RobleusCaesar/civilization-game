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
   style throughout: hard pixels on a 2px grid, hard alpha steps, light
   ADDED ('lighter'), rings made of dots, no ctx.filter, no soft gradients,
   culled to the camera, nothing drawn while nothing is in play. */
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
    // open ground at the hall's door on `side` (+1 east, -1 west), in tiles —
    // a picture's footing, never a rule: ground nobody is standing on, so the
    // pile is not laid across a villager's feet; falls back to any open ground
    // there, then to the doorstep itself
    spot(tc, side) {
      const sz = Bld.size(tc), fx = side > 0 ? tc.x + sz : tc.x - 1, fy = tc.y + sz;
      const open = (x, y) => MapGen.onBoard(x, y) && Path.passable(x, y, 'P') && !Bld.at(x, y);
      const clear = (x, y) => open(x, y) && !S.units.some(u => Math.abs(u.x - x - 0.5) < 0.9 && Math.abs(u.y - y - 0.6) < 0.8);
      const s = MapGen.findNear(fx, fy, 4, clear) || MapGen.findNear(fx, fy, 3, open);
      return s ? { x: s.x + 0.5, y: s.y + 0.7 } : { x: Bld.cx(tc) + side * (sz / 2 + 0.5), y: tc.y + sz + 0.5 };
    },
    /* THE CARD'S OWN LIGHT where its goods come down: a shaft of the tier's
       colour slammed onto the spot and narrowing away, and a ring of dots
       running out over the ground — so the pile arrives as a gift, not as
       logs falling out of an empty sky. `col` is an "r,g,b" string. */
    arrive(g, x, y, t, col, H) {
      if (t < 0 || t > 0.6) return;
      g.save(); g.globalCompositeOperation = 'lighter';
      const k = t < 0.07 ? 1 : 1 - (t - 0.07) / 0.53, h = H * Math.min(1, t / 0.07 + 0.2);
      for (const [w, al] of [[26, 0.16], [14, 0.28], [4, 0.6]]) {
        const ww = Math.max(PX, sn(w * k));
        g.fillStyle = 'rgba(' + col + ',' + stp(al * k, 8) + ')';
        g.fillRect(sn(x - ww / 2), sn(y - h), ww, sn(h));
      }
      const q = t / 0.6;
      g.globalAlpha = stp(0.9 * (1 - q), 4); g.fillStyle = 'rgb(' + col + ')';
      this.ring(g, x, y - 2, 6 + eo(q) * 34, 0.5);
      g.restore();
      g.globalAlpha = 1;
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
    inked(g, x, y, w, h, fn) {
      x = sn(x); y = sn(y); w = sn(w) + PX; h = sn(h) + PX;
      let K = this._ink;
      if (!K) K = this._ink = { a: document.createElement('canvas'), b: document.createElement('canvas') };
      if (K.a.width < w || K.a.height < h) {
        K.a.width = K.b.width = Math.max(K.a.width, w); K.a.height = K.b.height = Math.max(K.a.height, h);
      }
      const ga = K.a.getContext('2d'), gb = K.b.getContext('2d');
      ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, w, h);
      ga.imageSmoothingEnabled = false;
      ga.translate(-x, -y); fn(ga); ga.setTransform(1, 0, 0, 1, 0, 0);
      gb.globalCompositeOperation = 'copy'; gb.drawImage(K.a, 0, 0, w, h, 0, 0, w, h);
      gb.globalCompositeOperation = 'source-in'; gb.fillStyle = AP().ink[0]; gb.fillRect(0, 0, w, h);
      gb.globalCompositeOperation = 'source-over';
      for (const [dx, dy] of [[-PX, 0], [PX, 0], [0, -PX], [0, PX]]) g.drawImage(K.b, 0, 0, w, h, x + dx, y + dy, w, h);
      g.drawImage(K.a, 0, 0, w, h, x, y, w, h);
    },
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
    STONE_LIGHT: '228,222,208',    // the Stone tier's pale light (Deck.TIERS' stone, lifted)
    BRONZE_LIGHT: '255,186,112',   // …and the Bronze tier's warm one
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
  // the pile and its falling: `items` [{dx, dy, t0, fall, draw(g,x,y,f)}], foot at (px, py) world px
  function fallPile(g, s, items, px, py, H, col, bare) {
    const t = s.t;
    // a hard contact shadow under what has landed — as wide as the pile and
    // no wider, or it reads as a line ruled under the goods
    const down = items.filter(it => t - it.t0 >= it.fall && !it.dy);
    if (down.length) {
      const x0 = Math.min(...down.map(it => it.dx)) - 8, x1 = Math.max(...down.map(it => it.dx)) + 8;
      g.fillStyle = 'rgba(20,14,8,0.32)'; g.fillRect(sn(px + x0), sn(py - 1), sn(x1 - x0), PX);
    }
    // `bare`: art that carries its own outline (the rock stamps) is laid as it is
    (bare ? (g0, x0, y0, w, h, fn) => fn(g0) : TX.inked.bind(TX))(g, px - 34, py - H - 24, 68, H + 28, gg => {
      for (const it of items) {
        const tl = t - it.t0;
        if (tl < 0) continue;
        const land = it.fall, x = px + it.dx;
        if (tl < land) {
          const f = tl / land;
          it.draw(gg, x, py + it.dy - H * (1 - f * f), f);
        } else {
          const b = tl - land, bounce = b < 0.1 ? Math.sin(b / 0.1 * Math.PI) * (it.bounce || 2) : 0;
          it.draw(gg, x, py + it.dy - bounce, 1);
        }
      }
    });
    for (const it of items) dust(g, px + it.dx, py, t - it.t0 - it.fall, it.dust || 4, col);
  }
  const fade = (g, p, from) => { g.globalAlpha = p > from ? stp(1 - (p - from) / (1 - from), 3) : 1; };

  /* ---------------- the caravan ---------------- */
  /* A picture drawn from rows of letters, one letter a 2px cell ('.' is
     bare): how the ox and its drover are built, so their silhouettes are
     drawn rather than assembled from boxes — a brown box with a stub of a
     head was what the first cut's ox read as at play zoom. Facing +x;
     (x, y) is the top-left; `pal` maps a letter to its colour. */
  function cells(g, rows, pal, x, y) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let k = 0; k < row.length; k++) {
        const ch = row[k];
        if (ch === '.') continue;
        g.fillStyle = pal[ch]; g.fillRect(x + k * PX, y + r * PX, PX, PX);
      }
    }
  }
  /* THE OX: a draft ox under the yoke — the hump high at the withers, the
     back falling to the rump, the head carried LOW and forward with a pale
     crescent of horn above it, the far legs a shade darker than the near.
     Two strides; 22 × 13 cells. */
  const OX_BODY = [
    '......................',
    '...........LLL........',
    '..LLLLLLLLLBBBL.......',
    '.tMBBBBBBBBBBBBBL.h...',
    '.tMBBBBBBBBBBBBBBMhh.h',
    '.tMMBBBBBBBBBBBBBMLBhH',
    '.t.MMBBBBBBBBBBBBMBBeB',
    '.t.DMMMMMMMMMMMMMMBBBB',
    'tt..DDDMMMMMDDDDMDBBnn',
  ];
  const OX_LEGS = [
    ['....DM.MM....DM.MM.Mnn', '....DM.MM....DM.MM....', '....DM.MM....DM.MM....', '....oo.oo....oo.oo....'],
    ['...DM..MM...DM...MMMnn', '..DM....MM.DM.....MM..', '..DM....MM.DM.....MM..', '..oo....oo.oo.....oo..'],
  ];
  /* THE DROVER leading it by a rope, a goad over his shoulder: a pale wool
     tunic against the grass and the brown beast, so the eye finds a PERSON
     at the head of the cart — the one cue that says "a caravan came" rather
     than "an animal wandered by". 8 × 14 cells, two strides. */
  const DROVER = [
    '..aaa...',
    '.aasS..g',
    '..ssS.g.',
    '..WWW.g.',
    '.WwwwWg.',
    '.SwwwW..',
    '..www...',
    '..kkk...',
    '..wwW...',
    '..wWW...',
  ];
  const DROVER_LEGS = [
    ['..l.l...', '..l.l...', '..l.l...', '.ff.ff..'],
    ['.l...l..', '.l...l..', 'l.....l.', 'ff....ff'],
  ];
  // an ox and its laden cart and its drover, the cart's bed front on the ground at (x, y), heading dir (±1);
  // roll is ground covered in px (it turns the wheel and walks the legs); `aboard` the load still on it
  function caravan(g, x, y, dir, roll, aboard) {
    const P = AP(), W = P.wood, HI = P.hide, B = P.bone, INK = P.ink, SK = P.skin, HR = P.hair;
    g.save();
    g.translate(sn(x), sn(y));
    if (dir < 0) g.scale(-1, 1);
    const step = (Math.floor(roll / 6) % 2);
    // the shafts, behind the beast: bed front to the yoke at its withers
    g.fillStyle = W[0]; g.fillRect(0, -14, 40, PX);
    // the ox (feet on the ground line)
    const oxPal = { L: HI[3], B: HI[2], M: HI[1], D: HI[0], h: B[2], H: B[1], e: INK[0], n: INK[2], o: INK[0], t: INK[1] };
    cells(g, OX_BODY, oxPal, 6, -26);
    cells(g, OX_LEGS[step], oxPal, 6, -8);
    // the yoke across its withers
    g.fillStyle = W[1]; g.fillRect(36, -28, 4, 10); g.fillStyle = W[3]; g.fillRect(36, -28, 4, 2);
    // the rope from the drover's fist to the ox's nose
    g.fillStyle = W[3];
    for (let k = 0; k < 4; k++) g.fillRect(50 + k * 2, -10 - k * 2, PX, PX);
    // the drover, walking ahead
    const dPal = { a: HR[1], s: SK[2], S: SK[1], W: B[1], w: B[2], k: INK[1], g: W[3], l: SK[1], f: INK[0] };
    cells(g, DROVER, dPal, 56, -28);
    cells(g, DROVER_LEGS[step], dPal, 56, -8);
    // the bed: a plank box on its axle, rails, a darker floor line
    g.fillStyle = W[2]; g.fillRect(-34, -22, 34, 10);
    g.fillStyle = W[3]; g.fillRect(-34, -22, 34, 2);
    g.fillStyle = W[1]; for (let k = -30; k < 0; k += 8) g.fillRect(k, -20, 2, 8);
    g.fillStyle = W[0]; g.fillRect(-34, -14, 34, 2); g.fillRect(-36, -24, 2, 12); g.fillRect(-2, -24, 2, 12);
    // the load piled high: three sacks of grain, two bundles of logs, the strongbox on top
    if (aboard[0]) sack(g, -28, -22);
    if (aboard[1]) sack(g, -20, -22);
    if (aboard[2]) sack(g, -24, -30);
    if (aboard[3]) { log(g, -8, -22, 0); log(g, -10, -28, 0); }
    if (aboard[4]) log(g, -14, -30, 0);
    if (aboard[5]) chest(g, -28, -30);
    // the wheel: a rim of hard cells, four spokes turning, the hub
    const wx = -18, wy = -8, a = roll / 8;
    g.fillStyle = W[0];
    for (let k = 0; k < 20; k++) { const th = k / 20 * Math.PI * 2; g.fillRect(sn(wx + Math.cos(th) * 8) - 1, sn(wy + Math.sin(th) * 8) - 1, PX, PX); }
    g.fillStyle = W[2];
    for (let q = 0; q < 4; q++) { const th = a + q * Math.PI / 2; for (const r of [3, 5]) g.fillRect(sn(wx + Math.cos(th) * r) - 1, sn(wy + Math.sin(th) * r) - 1, PX, PX); }
    g.fillStyle = W[3]; g.fillRect(wx - 1, wy - 1, PX, PX);
    g.restore();
  }
  // the caravan's reach from its bed front, in px: what the ROAD must carry
  const CART_BACK = 38, CART_FRONT = 74;

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
      if (tc) TX.show(id, { tc: tc.id, side: TX.openSide(tc), floated: false });
      TX.sound(show.sound);
      return { ok: true, fly: { [res]: n } };
    },
    show,
  });

  Object.assign(Deck.FX, {
    /* STONE — Fallen Timber: +200 wood. Six logs tumble down end over end
       onto a pile at the hall's door, leaves drifting after them. */
    fallen_timber: goods('fallen_timber', 'wood', 200, '🪵', 'Fallen timber carried home', {
      ms: 1800, layer: 'world', sound: 'cardWood',
      LOGS: [[-16, 0], [0, 0], [16, 0], [-8, -6], [8, -6], [0, -12]],
      draw(g, s, p) {
        const tc = Bld.get(s.tc); if (!tc) return;
        const TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL;
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.arrive(g, px, py, s.t, TX.STONE_LIGHT, TL * 2.6);
        fade(g, p, 0.82);
        const items = this.show.LOGS.map(([dx, dy], i) => ({ dx, dy, t0: 0.05 + i * 0.11, fall: 0.34, bounce: 2, dust: 4,
          draw: (gg, x, y, f) => log(gg, x, y, f >= 1 ? 0 : [1, 2, 1, 2, 1][Math.min(4, (f * 5) | 0)]) }));
        fallPile(g, s, items, px, py, TL * 1.9, AP().soil[3]);
        // the storm's leaves, drifting down after the wood
        const L = AP().leaf, T2 = AP().thatch;
        for (let k = 0; k < 7; k++) {
          const t0 = 0.1 + hs(k, 3) * 0.5, tl = s.t - t0;
          if (tl < 0) continue;
          const y = Math.min(py - 2, py - TL * 2.3 + tl * TL * 1.3), x = px + (hs(k, 5) - 0.5) * 44 + Math.sin(tl * 5 + k) * 5;
          g.fillStyle = k % 3 === 0 ? T2[2] : L[k % 2 ? 3 : 4];
          g.fillRect(sn(x), sn(y), PX, PX);
        }
        g.globalAlpha = 1;
        if (!s.floated && s.t > 0.05 + 5 * 0.11 + 0.4) { s.floated = true; TX.float(sp.x, sp.y - 0.9, '+200 wood', 1.9); }
      },
    }),

    /* STONE — Loose Stone: +150 stone. Five broken blocks come down hard,
       one after another, each landing in its own dust — the biggest with a
       jolt you feel. The blocks are the map's own ORE (Sprites.oreStamp —
       the round, outlined boulder with its quarried facet that every stone
       deposit is built of), so what lands at the door reads at a glance as
       the stuff a quarry cuts, never as a stray crag. */
    loose_stone: goods('loose_stone', 'stone', 150, '🪨', 'Loose stone hauled in', {
      ms: 1800, layer: 'world', sound: 'cardStone',
      // dx, dy (world px off the pile's foot), radius, the stamp's variant
      BLOCKS: [[-12, 0, 7, 1], [2, 0, 8, 4], [14, 0, 6, 2], [-5, -7, 6, 6], [8, -8, 5, 3]],
      draw(g, s, p) {
        const tc = Bld.get(s.tc); if (!tc) return;
        const TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL;
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.arrive(g, px, py, s.t, TX.STONE_LIGHT, TL * 2.8);
        fade(g, p, 0.82);
        const stamps = typeof Sprites !== 'undefined' && Sprites.oreStamp;
        const items = this.show.BLOCKS.map(([dx, dy, rr, v], i) => ({ dx, dy, t0: 0.05 + i * 0.16, fall: 0.26, bounce: 1, dust: 6,
          draw: stamps ? (gg, x, y) => {
            const st = Sprites.oreStamp(rr, v, false);
            gg.drawImage(st, sn(x - st._ox), sn(y - st._oy - rr));
          } : (gg, x, y) => block(gg, x, y, rr * 2, rr + 2, i) }));
        fallPile(g, s, items, px, py, TL * 2.2, AP().stone[3], !!stamps);
        /* what makes it a DELIVERY and not a deposit: every block lands
           throwing chips of itself, and once the pile is down its fresh-cut
           faces wink in the card's pale light — a natural knot of ore has
           neither, and at rest the first cut read exactly like one */
        const O = AP().oreD;
        this.show.BLOCKS.forEach(([dx, dy, rr], i) => {
          const age = s.t - (0.05 + i * 0.16) - 0.26;
          if (age < 0 || age > 0.42) return;
          const q = age / 0.42;
          g.globalAlpha = stp(1 - q * q, 3);
          for (let k = 0; k < 7; k++) {
            const a = -Math.PI * (0.08 + 0.84 * hs(i * 7 + k, 17)), v = 18 + hs(k, i + 31) * 26;
            const cx = px + dx + Math.cos(a) * v * age * 1.6, cy = py + dy - rr - Math.sin(a) * v * age * 1.6 + 60 * age * age;
            g.fillStyle = k % 3 === 0 ? O[5] : k % 3 === 1 ? O[3] : O[1];
            g.fillRect(sn(cx), sn(Math.min(py, cy)), PX, PX);
          }
        });
        g.globalAlpha = 1;
        const settled = s.t - (0.05 + 4 * 0.16 + 0.26);
        if (settled > 0) {
          g.save(); g.globalCompositeOperation = 'lighter';
          // the pale ring the last block lands in
          if (settled < 0.6) {
            const q = settled / 0.6;
            g.globalAlpha = stp(0.8 * (1 - q), 4); g.fillStyle = 'rgb(' + TX.STONE_LIGHT + ')';
            TX.ring(g, px, py - 2, 10 + eo(q) * 34, 0.5);
          }
          // and the fresh faces catch the light, one after another
          this.show.BLOCKS.forEach(([dx, dy, rr], i) => {
            const ph = (settled * 1.6 + i * 0.37) % 1;
            if (ph > 0.4) return;
            const k = Math.sin(ph / 0.4 * Math.PI);
            g.globalAlpha = stp(k * (p < 0.82 ? 1 : 1 - (p - 0.82) / 0.18), 3);
            TX.star(g, px + dx - rr * 0.35, py + dy - rr * 1.25, k > 0.6 ? 2 : 1, '#e6e2d6', '#ffffff');
          });
          g.restore();
        }
        // the biggest block lands with a jolt
        if (!s.jolt && s.t > 0.05 + 0.16 + 0.26) { s.jolt = true; if (R.shakeAt) R.shakeAt(1.6, 0.16); }
        g.globalAlpha = 1;
        if (!s.floated && s.t > 0.05 + 4 * 0.16 + 0.36) { s.floated = true; TX.float(sp.x, sp.y - 0.9, '+150 stone', 1.9); }
      },
    }),

    /* STONE — Gold Nugget: +60 gold. One nugget drops, bounces twice, comes
       to rest — and catches the light: a hard four-point glint and a ring of
       gold dots running out from it. */
    gold_nugget: goods('gold_nugget', 'gold', 60, '🪙', 'A gold nugget turned up', {
      ms: 1700, layer: 'world', sound: 'cardGold',
      draw(g, s, p) {
        const tc = Bld.get(s.tc); if (!tc) return;
        const TL = TLs(), sp = s.at || (s.at = TX.spot(tc, s.side)), px = sp.x * TL, py = sp.y * TL;
        if (!TX.near(px - TL, py - 3 * TL, px + TL, py + TL)) return;
        TX.arrive(g, px, py, s.t, '255,232,160', TL * 2.2);
        fade(g, p, 0.84);
        const t = s.t, land = 0.32;
        // the fall and two bounces, each lower than the last
        let y = py;
        if (t < land) y = py - TL * 1.7 * (1 - (t / land) * (t / land));
        else if (t < land + 0.22) y = py - Math.sin((t - land) / 0.22 * Math.PI) * 10;
        else if (t < land + 0.36) y = py - Math.sin((t - land - 0.22) / 0.14 * Math.PI) * 4;
        g.fillStyle = 'rgba(20,14,8,0.3)'; g.fillRect(sn(px - 6), sn(py - 1), 12, 2);
        TX.inked(g, px - 10, y - 12, 20, 16, gg => nugget(gg, px, y));
        dust(g, px, py, t - land, 4, AP().soil[3], 24);
        // the glint: the light caught, held, let go
        const gt = (t - (land + 0.42)) / 0.5;
        if (gt > 0 && gt < 1) {
          g.save(); g.globalCompositeOperation = 'lighter';
          const arm = Math.max(1, Math.round(Math.sin(gt * Math.PI) * 6));
          g.globalAlpha = stp(Math.sin(gt * Math.PI) + 0.25, 4);
          TX.star(g, px - 2, py - 7, arm, '#fff2c0');
          g.fillStyle = 'rgba(255,212,94,1)'; g.globalAlpha = stp(1 - gt, 4) * 0.85;
          TX.ring(g, px, py - 4, 6 + gt * 26, 0.55, 14);
          g.restore();
        }
        // a few motes rising off it as it settles
        for (let k = 0; k < 6; k++) {
          const tl = t - (land + 0.45 + k * 0.06);
          if (tl < 0 || tl > 0.5) continue;
          g.fillStyle = k % 2 ? '#ffd45e' : '#fff2c0';
          g.fillRect(sn(px + (hs(k, 9) - 0.5) * 16), sn(py - 6 - tl * 30), PX, PX);
        }
        g.globalAlpha = 1;
        if (!s.floated && t > land + 0.5) { s.floated = true; TX.float(sp.x, sp.y - 0.9, '+60 gold', 1.9); }
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
        return { ok: true, fly: { food: this.FOOD, wood: this.WOOD, gold: this.GOLD } };
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
        // the pile at the door: [dx, dy, draw] — three sacks, logs, the strongbox on top
        PILE: [[-12, 0, sack], [-3, 0, sack], [-8, -7, sack],
          [10, 0, (gg, x, y) => { log(gg, x, y, 0); log(gg, x - 2, y - 6, 0); }], [8, -12, (gg, x, y) => log(gg, x, y, 0)], [-1, -12, chest]],
        draw(g, s, p) {
          const tc = Bld.get(s.tc); if (!tc) return;
          const TL = TLs(), K = this.show, side = s.side || 1;
          const sp = s.at || (s.at = TX.spot(tc, side));
          if (s.road === undefined) s.road = this.road(sp, side);
          const rd = s.road, pile = { x: sp.x * TL, y: sp.y * TL };
          const dir = rd ? rd.dir : -side, rowY = rd ? (rd.ty + 0.8) * TL : pile.y;
          const stopX = rd ? rd.stop : pile.x;
          if (!TX.near(Math.min(pile.x, stopX) - 9 * TL, pile.y - 3 * TL, Math.max(pile.x, stopX) + 9 * TL, rowY + TL)) return;
          const from = stopX - dir * (rd ? rd.inN : 0) * TL, onTo = stopX + dir * (rd ? rd.outN : 0) * TL;
          let cx;
          if (p < K.IN) cx = from + (stopX - from) * eo(p / K.IN);
          else if (p < K.ON) cx = stopX;
          else cx = stopX + (onTo - stopX) * Math.pow((p - K.ON) / (1 - K.ON), 1.6);
          const rolled = Math.abs(cx - from);
          // no road at all: the load comes down in the card's own light
          if (!rd) TX.arrive(g, pile.x, pile.y, s.t - K.UNLOAD[0] * s.ms / 1000 + 0.1, TX.BRONZE_LIGHT, TL * 2.8);
          // the dust it raises while it moves, and the card's warm motes in its wake
          const moving = rd && (p < K.IN || p > K.ON);
          const vis = rd ? Math.min(stp(p / 0.08, 4), p > 0.9 ? stp(1 - (p - 0.9) / 0.1, 3) : 1) : 0;
          if (moving && vis > 0) {
            g.fillStyle = AP().soil[3];
            for (let k = 0; k < 8; k++) {
              const ph = (rolled / 9 + k / 8) % 1;
              g.globalAlpha = stp(0.8 * (1 - ph) * vis, 3);
              g.fillRect(sn(cx - dir * (CART_BACK + ph * 22)), sn(rowY - 2 - ph * 8 - (k % 2) * 2), PX + (k % 2) * PX, PX);
            }
            g.save(); g.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 8; k++) {
              const ph = (rolled / 14 + k / 8) % 1;
              g.globalAlpha = stp(0.9 * (1 - ph) * vis, 3); g.fillStyle = k % 2 ? '#ffd45e' : '#ffb870';
              g.fillRect(sn(cx - dir * (24 + ph * 30)), sn(rowY - 30 - ph * 18 + (k % 3) * 3), PX, PX);
            }
            g.restore();
            g.globalAlpha = 1;
          }
          // the goods: off the bed, through the air, onto the pile at the door
          const t = p * s.ms / 1000, U = K.UNLOAD.map(u => u * s.ms / 1000), hop = 0.34, PILE = K.PILE;
          const aboard = PILE.map((_, k) => t < U[k]);
          const bedX = stopX - dir * 18, bedY = rd ? rowY - 26 : pile.y - TL * 2.6;
          fade(g, p, 0.92);
          const down = PILE.filter((it, k) => t - U[k] >= hop && !it[1]);
          if (down.length) {
            const x0 = Math.min(...down.map(it => it[0])) - 8, x1 = Math.max(...down.map(it => it[0])) + 10;
            g.fillStyle = 'rgba(20,14,8,0.3)'; g.fillRect(sn(pile.x + x0), sn(pile.y - 1), sn(x1 - x0), PX);
          }
          const iy0 = Math.min(pile.y, bedY) - 60, iy1 = Math.max(pile.y, bedY) + 20;   // the arcs' peaks to the pile's foot
          TX.inked(g, Math.min(pile.x, bedX) - 40, iy0, Math.abs(pile.x - bedX) + 80, iy1 - iy0, gg => {
            for (let k = 0; k < PILE.length; k++) {
              const tl = t - U[k], [dx, dy, fn] = PILE[k];
              if (tl < 0) continue;
              const ex = pile.x + dx, ey = pile.y + dy;
              if (tl < hop) {
                const f = tl / hop, sx = bedX + (k - 2.5) * 3;
                fn(gg, sx + (ex - sx) * f, bedY + (ey - bedY) * f - (rd ? Math.sin(f * Math.PI) * 26 : 0));
              } else fn(gg, ex, ey);
            }
          });
          for (let k = 0; k < PILE.length; k++) dust(g, pile.x + PILE[k][0], pile.y, t - U[k] - hop, 4, AP().soil[3], 22);
          // the strongbox lands in the tier's light and spills: coins leap and land round the pile, glinting
          const ct = t - U[PILE.length - 1] - hop;
          if (ct > 0) {
            if (ct < 0.7) {
              g.save(); g.globalCompositeOperation = 'lighter';
              const q = ct / 0.7;
              g.globalAlpha = stp(0.9 * (1 - q), 4); g.fillStyle = 'rgb(' + TX.BRONZE_LIGHT + ')';
              TX.ring(g, pile.x, pile.y - 2, 10 + eo(q) * 46, 0.5);
              g.globalAlpha = stp(0.7 * (1 - q), 4); g.fillStyle = '#ffd45e';
              TX.ring(g, pile.x, pile.y - 2, 6 + eo(q) * 28, 0.5);
              g.restore();
            }
            for (let k = 0; k < 14; k++) {
              const ang = -Math.PI * (0.06 + 0.88 * hs(k, 11)), sp2 = 14 + hs(k, 13) * 22, f = Math.min(1, ct / 0.32);
              const x = pile.x - 1 + Math.cos(ang) * sp2 * f, y = pile.y - 14 + (f * 14) - Math.sin(f * Math.PI) * 16;
              g.fillStyle = k % 2 ? '#ffd45e' : AP().gold[1]; g.fillRect(sn(x), sn(y), PX, PX);
              if (f >= 1 && ((ct * 6 + k) % 3) < 0.5) {
                g.save(); g.globalCompositeOperation = 'lighter'; TX.star(g, x, y, 1, '#fff2c0'); g.restore();
              }
            }
          }
          g.globalAlpha = 1;
          // the cart itself, fading in at the end of its road and out as it leaves
          if (rd && vis > 0) {
            g.globalAlpha = vis;
            const x0 = dir > 0 ? cx - CART_BACK : cx - CART_FRONT;
            g.fillStyle = 'rgba(20,14,8,0.35)'; g.fillRect(sn(x0 + 4), sn(rowY - 2), sn(CART_BACK + CART_FRONT - 8), 4);   // one hard shadow under the lot
            TX.inked(g, x0 - 4, rowY - 46, CART_BACK + CART_FRONT + 8, 50, gg => caravan(gg, cx, rowY, dir, rolled, aboard));
            g.globalAlpha = 1;
          }
          if (!s.floated && t > U[PILE.length - 1] + hop + 0.2) { s.floated = true; TX.float(sp.x, sp.y - 1.1, '+250 food  +250 wood  +100 gold', 2.2); }
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
          // the wave: a ring of warm dots rolling out over the town, and a fainter one behind it
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const [lag, a0] of [[0, 1], [0.7, 0.45]]) {
            const rr = r - lag;
            if (rr <= 0 || rr > far + 2) continue;
            const k = rr / (far + 2);
            g.globalAlpha = stp(a0 * (1 - k * k), 4);
            g.fillStyle = '#dcf09a';
            TX.ring(g, s.cx * TL, s.cy * TL, rr * TL, 0.62, 0, 4);
            g.fillStyle = '#fff6c8';
            TX.ring(g, s.cx * TL, s.cy * TL, rr * TL - 3, 0.62, 0, 8);
          }
          g.globalAlpha = 1;
          g.restore();
          // each building as the light reaches it
          for (const h of s.hit) {
            const age = (r - h.d) / s.speed;
            if (age < 0 || age > 0.9) continue;
            const b = Bld.get(h.id);
            if (!b || !TX.bNear(b)) continue;
            const a = TX.art(b);
            g.save(); g.globalCompositeOperation = 'lighter';
            if (age < 0.6) { g.globalAlpha = stp(0.6 * (1 - age / 0.6), 4); TX.paint(g, a, '#fff0b0', 0, 1); }
            g.globalAlpha = 1;
            // the sparks of a town patched up: crosses rising off the roof, a mending + above it
            for (let k = 0; k < 6; k++) {
              const tl = age - k * 0.05;
              if (tl < 0 || tl > 0.55) continue;
              const x = a.rc.x + (a.box.l + (a.box.r - a.box.l) * hs(h.id, k)) * a.rc.w;
              const y = a.rc.y + (a.box.t + (a.box.b - a.box.t) * hs(k, h.id) * 0.8) * a.rc.h - tl * 22;
              g.globalAlpha = stp(1 - tl / 0.55, 3);
              TX.star(g, x, y, tl < 0.25 ? 2 : 1, '#e8f6b0', '#ffffff');
            }
            const cx = a.rc.x + (a.box.l + a.box.r) / 2 * a.rc.w, cy = a.rc.y + a.box.t * a.rc.h - 4 - age * 16;
            g.globalAlpha = stp(1 - age / 0.9, 3);
            g.fillStyle = '#c8f08a'; g.fillRect(sn(cx) - 1, sn(cy) - 5, 2, 6); g.fillRect(sn(cx) - 3, sn(cy) - 3, 6, 2);
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
          g.save(); g.globalCompositeOperation = 'lighter';
          // the column of gold, slammed down, held, then narrowing to a thread
          const up = cl(p / 0.08), down = p < 0.5 ? 1 : 1 - cl((p - 0.5) / 0.3);
          if (down > 0) {
            const colTop = top - TL * 3, h = (foot - colTop) * up;
            for (const [wf, al] of [[1.15, 0.16], [0.6, 0.26], [0.18, 0.5]]) {
              const ww = Math.max(PX, sn(w * wf * down));
              g.fillStyle = 'rgba(255,214,94,' + al + ')';
              g.fillRect(sn((x0 + x1) / 2 - ww / 2), sn(colTop), ww, sn(h));
            }
          }
          // the building fills with light from its foot to its crown, then lets it go
          if (a.spr) {
            const rise = cl((p - 0.06) / 0.42), fy = a.box.b - (a.box.b - a.box.t) * eo(rise);
            g.globalAlpha = p < 0.55 ? 0.75 : stp(0.75 * (1 - (p - 0.55) / 0.3), 4);
            if (g.globalAlpha > 0) TX.paint(g, a, '#ffd45e', fy, 1);
            if (rise > 0 && rise < 1) { g.globalAlpha = 1; TX.paint(g, a, '#fff6d0', fy, fy + 2 / rc.h); }
          }
          g.globalAlpha = 1;
          // sparks off the scaffold that was never needed
          for (let k = 0; k < 12; k++) {
            const tl = p - 0.1 - k * 0.04;
            if (tl < 0 || tl > 0.45) continue;
            const x = x0 + hs(k, s.bid) * w, y = foot - hs(s.bid, k) * (foot - top) - tl * 40;
            g.fillStyle = k % 3 ? '#ffd45e' : '#fff2c0';
            g.globalAlpha = stp(1 - tl / 0.45, 3);
            g.fillRect(sn(x), sn(y), PX, PX);
          }
          // and a ring of dots runs out over the ground as the dust settles
          if (p > 0.45) {
            const q = (p - 0.45) / 0.55;
            g.globalAlpha = stp(0.8 * (1 - q), 4); g.fillStyle = '#ffd45e';
            TX.ring(g, (x0 + x1) / 2, foot - 2, w * 0.6 + q * TL * 1.4, 0.5);
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
        g.save(); g.globalCompositeOperation = 'lighter';
        const fl = 0.9 + 0.1 * Math.sin(now * 9 + b.id);
        g.fillStyle = 'rgba(255,140,50,0.10)'; R.pxDisc(g, fx, fy - s * 0.35, TL * 0.95 * k * fl, 2, 0.8);
        g.fillStyle = 'rgba(255,190,90,0.14)'; R.pxDisc(g, fx, fy - s * 0.35, TL * 0.5 * k * fl, 2, 0.8);
        g.restore();
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
            g.save(); g.globalCompositeOperation = 'lighter';
            // the pitch catches: a streak of fire shooting up off the crown
            if (s.fresh && tl < 0.45) {
              const c = TX.crown(b), q = tl / 0.45, h = TL * 1.4 * eo(q);
              for (const [w, al] of [[6, 0.35], [2, 0.9]]) {
                g.fillStyle = 'rgba(255,200,110,' + stp(al * (1 - q), 4) + ')';
                g.fillRect(sn(c.x - w / 2), sn(c.y - h), w, sn(h));
              }
              for (let k = 0; k < 8; k++) {
                const a = k / 8 * Math.PI * 2, d = 4 + q * 18;
                g.fillStyle = k % 2 ? '#ffe9a0' : '#f2c14a'; g.globalAlpha = stp(1 - q, 3);
                g.fillRect(sn(c.x + Math.cos(a) * d), sn(c.y - 6 + Math.sin(a) * d * 0.7 - q * 6), PX, PX);
              }
              g.globalAlpha = 1;
            }
            // the reach: the old ring faint, then a ring of fire-dots growing out to the new one
            const gq = cl((tl - 0.15) / 0.7), r = f.r0 + (f.r1 - f.r0) * eo(gq);
            const a = gq < 1 ? 0.9 : stp(0.9 * (1 - (tl - 0.85) / 1.2), 4);
            if (a > 0) {
              g.globalAlpha = stp(a * 0.35, 4); g.fillStyle = '#e88a3a'; TX.ring(g, f.ox * TL, f.oy * TL, f.r0 * TL, 1);
              g.globalAlpha = a; g.fillStyle = '#ffb34a'; TX.ring(g, f.ox * TL, f.oy * TL, r * TL, 1);
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
        g.save(); g.globalCompositeOperation = 'lighter';
        // the light inside it: two hard bands, stepped, never a gradient
        for (const [k, al] of [[1, 0.05 + boost * 0.14], [0.62, 0.05 + boost * 0.1]]) {
          g.fillStyle = 'rgba(255,214,94,' + stp(al, 20) + ')';
          for (let y = 0; y < hd * k; y += PX) {
            const w = Math.sqrt(Math.max(0, 1 - (y / (hd * k)) * (y / (hd * k)))) * rx * k;
            g.fillRect(sn(cx - w), sn(gy - y), Math.max(PX, sn(w * 2)), PX);
          }
        }
        // its ribs: the outline, two meridians and a girdle, made of dots, a shimmer running round
        const dots = (fx, fy, n, base) => {
          for (let i = 0; i <= n; i++) {
            const th = i / n * Math.PI, x = fx(th), y = fy(th);
            const sh = Math.max(0, Math.sin(th * 3 - now * 2.2));
            g.globalAlpha = stp(base + sh * 0.35 + boost * 0.4, 4);
            g.fillRect(sn(x), sn(y), PX, PX);
          }
        };
        g.fillStyle = '#ffe9a0';
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
          g.save(); g.globalCompositeOperation = 'lighter';
          g.globalAlpha = boost; g.fillStyle = '#fff2c0';
          TX.ring(g, D.cx, D.gy, D.rx * (1 + (1 - boost) * 0.35), 0.42);
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
              g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ffd45e';
              for (const [lag, reach] of [[0, 7], [0.12, 5], [0.24, 3.5]]) {
                const qq = (q - lag) / (1 - lag);
                if (qq <= 0 || qq >= 1) continue;
                g.globalAlpha = stp(0.9 * (1 - qq), 4);
                TX.ring(g, D.cx, D.gy, D.rx + eo(qq) * reach * TL, 0.42);
              }
              g.restore();
            }
            // motes of gold coming down in the pillar
            if (p > 0.04 && p < 0.7) {
              g.fillStyle = '#fff2c0';
              for (let k = 0; k < 14; k++) {
                const ph = (s.t * 0.9 + hs(k, 21)) % 1;
                g.globalAlpha = stp(0.9 * Math.sin(ph * Math.PI), 3);
                g.fillRect(sn(D.cx + (hs(21, k) - 0.5) * D.rx * 1.3), sn(D.gy - D.hd * 2.6 * (1 - ph)), PX, PX);
              }
              g.globalAlpha = 1;
            }
            // the dome rises brighter than it will stand
            if (p > imp && p < 0.75) U.dome(g, D, eo(cl((p - imp) / 0.3)), stp(0.6 * (1 - cl((p - imp) / 0.55)), 4), performance.now() / 1000);
            return;
          }
          // ---- the sky (device pixels) ----
          if (!s.boom && p >= imp) {
            s.boom = true;
            if (R.shakeAt) R.shakeAt(7, 0.8);
            if (R.flashAt) R.flashAt(0.5, 0.8, '255,198,98');     // gold, never milk
            if (R.startle) R.startle(Bld.cx(tc), Bld.cy(tc), 14);
            TX.sound('cardHall');
          }
          const W = R.cv.width, H = R.cv.height, A = TX.scr(D.cx, D.gy), apex = TX.scr(D.cx, D.gy - D.hd);
          // the sky darkens for it, and lifts after
          const veil = p < 0.25 ? cl(p / 0.25) : p < 0.62 ? 1 : 1 - cl((p - 0.62) / 0.3);
          if (veil > 0) { g.fillStyle = 'rgba(12,8,24,' + stp(0.3 * veil, 6) + ')'; g.fillRect(0, 0, W, H); }
          g.save(); g.globalCompositeOperation = 'lighter';
          // the pillar: down from the top of the sky onto the hall, held, then a thread, then gone
          const down = cl((p - 0.03) / (imp - 0.03)), narrow = p < 0.62 ? 1 : 1 - cl((p - 0.62) / 0.26);
          if (down > 0 && narrow > 0) {
            const bottom = A.y * eo(down), wide = D.rx * 2 * A.z;
            for (const [wf, al] of [[1.25, 0.14], [0.7, 0.22], [0.3, 0.38], [0.08, 0.7]]) {
              const ww = Math.max(2, Math.round(wide * wf * narrow / 2) * 2);
              g.fillStyle = 'rgba(255,220,130,' + al + ')';
              g.fillRect(Math.round(A.x - ww / 2), 0, ww, Math.round(bottom));
            }
          }
          // rays from the dome's crown, turning slowly, while it rises and holds
          if (p > imp && p < 0.9) {
            const k = p < 0.35 ? cl((p - imp) / 0.15) : 1 - cl((p - 0.6) / 0.3);
            g.fillStyle = 'rgba(255,214,94,' + stp(0.16 * k, 8) + ')';
            const rot = s.t * 0.12, px = Math.max(2, Math.round(A.z * 2));
            for (let i = 0; i < 14; i++) U.ray(g, apex.x, apex.y, rot + i / 14 * Math.PI * 2, 0.035 + (i % 2) * 0.02, px, W, H);
          }
          // a halo of hard dots bursting out across the whole screen at the blow
          if (p > imp && p < imp + 0.35) {
            const q = (p - imp) / 0.35, rr = q * Math.hypot(W, H) * 0.7, px = Math.max(2, Math.round(A.z * 2));
            g.fillStyle = 'rgba(255,233,160,' + stp(0.8 * (1 - q), 4) + ')';
            const n = Math.min(220, Math.max(24, Math.round(rr / (px * 3))));
            for (let i = 0; i < n; i++) {
              const th = i / n * Math.PI * 2;
              g.fillRect(Math.round((A.x + Math.cos(th) * rr) / px) * px, Math.round((A.y + Math.sin(th) * rr * 0.6) / px) * px, px, px);
            }
          }
          g.restore();
        },
      },
    },
  });

  /* ---------------- the voices (js/audio.js: synthesized, never a file) ---------------- */
  if (typeof Sound !== 'undefined' && Sound._VOICES && Sound.GAP) {
    Object.assign(Sound.GAP, {
      cardWood: 0.4, cardStone: 0.4, cardGold: 0.4, cardCaravan: 0.8, cardMend: 0.4, cardBuild: 0.25,
      cardFire: 0.4, cardSkin: 0.6, cardGlance: 0.6, cardRise: 0.6, cardHall: 1.6, cardWard: 0.9,
    });
    Object.assign(Sound._VOICES, {
      // six logs landing in turn, the woody knock of each
      cardWood(t, v) {
        for (let i = 0; i < 6; i++) {
          const d = 0.39 + i * 0.11;
          this._noise({ at: t, delay: d, hz: 340 - i * 14, to: 120, dur: 0.12, q: 1.1, gain: 0.17 * v });
          this._note({ at: t, delay: d, hz: 150 + (i % 3) * 14, to: 92, dur: 0.12, type: 'triangle', gain: 0.08 * v, lp: 900 });
        }
      },
      // broken stone coming down, each block a deep thud
      cardStone(t, v) {
        for (let i = 0; i < 5; i++) {
          const d = 0.31 + i * 0.16;
          this._noise({ at: t, delay: d, hz: 220, to: 60, dur: 0.24, q: 0.8, gain: (i === 1 ? 0.3 : 0.22) * v, filter: 'lowpass' });
          this._note({ at: t, delay: d, hz: 82, to: 42, dur: 0.22, type: 'sine', gain: 0.16 * v });
          this._noise({ at: t, delay: d + 0.02, hz: 1600, to: 700, dur: 0.07, q: 2, gain: 0.05 * v });
        }
      },
      // a nugget's two clinks, then the light it catches
      cardGold(t, v) {
        for (const [d, g0] of [[0.32, 0.1], [0.54, 0.06]]) this._note({ at: t, delay: d, hz: 2349, to: 2093, dur: 0.12, type: 'triangle', gain: g0 * v });
        [1568, 2093, 2637, 3136].forEach((hz, i) => this._note({ at: t, delay: 0.74 + i * 0.06, hz, dur: 0.5, type: 'sine', gain: 0.07 * v }));
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
