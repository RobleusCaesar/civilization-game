"use strict";
/* THE CARD SYSTEM — ARMY — everything a card summons or raises: Willing Hands, War Band, Hunter's Pack, Iron Legion, Siege Train, Veterans, The Legion Marches, Trebuchet Battery, Ancestors' Host (tests/deck-army.mjs).
   The contract every entry keeps is in js/deckfx.js (the engine) and
   js/deck.js (Deck.play, the one door); a card's own moment in the world
   is its `show` (R.startCardShow, js/render.js).

   Eight of the nine bring people out of the Town Center, and all eight come
   through ONE door, Deck.summon (js/deckfx.js) — the same muster Swift
   Raiders uses: really open ground, one unit to a tile, never a blade of
   Starfall's sky-iron, the card kept with its reason when there is no hall
   or no ground. What each card adds is WHO comes (the kinds and the stamps
   below) and HOW THEY ARRIVE (its show, scaled by its tier). Three of them
   bring people who are not ordinary people, and each of those is a short
   list of rules the game asks by a flag on the unit:

   THE WAR-WOLVES (u.warWolf, Hunter's Pack): a wolf owned by the player is
     the Houndmaster's guard-beast branch (Combat.acquire), which had no leash,
     never struck back and never went home. A war-wolf answers to the HALL:
     it goes for any enemy that comes within PACK.home of the Town Center
     (and within its own nose, PACK.sense), lets a runner IT CHOSE go at
     PACK.leash (u.packMark), and trots back to its own place by the hall
     (u.den — one tile per wolf) after every fight (Units.resolveAfterFight).
     Walked out past home ground by the player it obeys, and when the walk is
     done it goes home: the card says they stay near home. Struck — anywhere,
     on the player's errand too — it fights it out where it stands, and lets
     go only if the fight drags it PACK.leash from where it began (u.packFrom).
     Its march out to its den is its own walk, not an order, so a foe near
     the hall breaks it off. It is not population, eats
     nothing, scores no "greatest tribe" (game.js counts popUsed now), is no
     game (owner 'P' is never wild: no meat, no corpse, no hunting ground),
     and its own soldiers can never mistake it for a foe (same owner). The
     wild sheet is undyed, so it wears a ring of the tribe's dye at its feet.
   THE SPECTRAL HOST (u.spectral, Ancestors' Host): fifteen Bronze Champions
     that are not people. Units.mortal() keeps them out of the census, the
     larder and the famine (popUsed, foodUpkeep, desertHungry — the cargo of
     a hull included); they take no sky-iron (they are a card's); a heal is
     paid in food and a ghost eats nothing, so the Heal button and its ring
     never offer it; they go back to the earth without fifteen red "was
     killed" toasts. Their kills are kills. A ghost still under the ground is
     not drawn, so it cannot be tapped either (R.unitHidden). When the host's days are done
     EVERY ghost fades — the ones riding a transport too, which no S.units
     pass can see (Units.despawn returns on a unit it cannot find).
   THE VETERANS (u.vet, Veterans): a base or second-rank soldier becomes its
     hall's champion OUTRIGHT (the second ranks are sidegrades — an Axeman has
     less health than the Defender it replaced — and the rival's own ADV map
     already jumps base → champion); a champion or an engine that is not a
     Catapult becomes a veteran, u.vet = 1.25: its health and its attack, and
     an engine's stone with it (combat.js reads u.vet where it reads bldAtk).
     A veteran never stacks: a second card finds it already at the top. The
     soldiers aboard a transport rise with the rest. The rank is worn for
     good: two gold chevrons for a veteran, one for a soldier the card raised
     to champion (u.ranked). A Catapult becomes a
     Trebuchet, which had no heal price (CFG.HEAL_FOOD) — it has one now.

   NO CARD DRAWS THE RUN'S RNG: every roll here is Math.random or a hash of
   the unit's id, and Units.spawn never touches S.rngState. What a card's
   people do afterwards is the game's business. */

/* ---------------- the rules the game asks of a card's people ---------------- */
Object.assign(Deck, {
  /* THE HUNTER'S PACK: 70 health, 10 attack, FAST (a defender walks 2.4) —
     the catalog's numbers, restamped after the spawn because opts.scale
     moves health and attack together. home: how far from the hall's middle
     a foe may come before the pack goes for it; sense: how far a wolf smells
     one; leash: where a chase is let go; pace: how often an idle wolf shifts
     about its place, so a guard-pack looks like one. */
  PACK: { hp: 70, atk: 10, speed: 3.4, home: 10, sense: 7, leash: 13, pace: [4, 9] },
  // the middle of home ground: the hall, or (with no hall) the wolf's own place
  packCentre(u) {
    const tc = Bld.tcOf(u.owner);
    if (tc) return { x: Bld.cx(tc), y: Bld.cy(tc) };
    const d = u.den || { x: u.x | 0, y: u.y | 0 };
    return { x: d.x + 0.5, y: d.y + 0.5 };
  },
  // back to its own place by the hall — after a fight, or a walk out past home
  packHome(u) {
    const d = u.den || { x: u.x | 0, y: u.y | 0 };
    u.tUnit = 0; u.tBld = 0; u.packMark = false; u.packFrom = null;
    if ((u.x | 0) === d.x && (u.y | 0) === d.y) { u.task = null; u.path = null; return; }
    u.task = { type: 'move', x: d.x, y: d.y, home: true };
    if (!Units.setPath(u, d.x, d.y)) { u.task = null; u.path = null; }
  },
  /* asked by Combat.acquire for a war-wolf instead of the guard-beast branch
     (it runs every 0.4s, so it is also where an idle wolf is minded) */
  packSense(u) {
    const P = this.PACK, t = u.task;
    // a walk the PLAYER ordered is carried out to the letter; the pack's own
    // walks (home, or out of its light at the muster) may break off for a foe
    if (t && t.type === 'move' && !t.home) return;
    const h = this.packCentre(u);
    const e = Combat.nearestUnit(u.x, u.y, P.sense,
      o => Combat.hostileUnits(u, o) && !Units.isPassive(o) && Combat.canEngage(u, o) &&
        Math.hypot(o.x - h.x, o.y - h.y) <= P.home);
    // a mark the PACK chose (packMark) is leashed to home ground; a mark it
    // was handed — struck, or set on a foe by the player — is not (packLeash)
    if (e) { u.tUnit = e.id; u.task = null; u.path = null; u.packMark = true; u.packFrom = null; return; }
    if (t || Units.moving(u)) return;
    if (Math.hypot(u.x - h.x, u.y - h.y) > P.home) { this.packHome(u); return; }
    // at home, a guard-pack is never quite still: now and then a wolf shifts
    // about its own place (Math.random — never the run's rng)
    u.paceT = (u.paceT == null ? P.pace[0] : u.paceT) - 0.4;
    if (u.paceT > 0 || !u.den) return;
    u.paceT = P.pace[0] + Math.random() * (P.pace[1] - P.pace[0]);
    const d = u.den, k = (Math.random() * 8) | 0, dx = [1, -1, 0, 0, 1, -1, 1, -1][k], dy = [0, 0, 1, -1, 1, 1, -1, -1][k];
    const back = (u.x | 0) !== d.x || (u.y | 0) !== d.y;
    const tx = back ? d.x : d.x + dx, ty = back ? d.y : d.y + dy;
    if (Path.passable(tx, ty, 'P') && !Bld.at(tx, ty)) { u.task = { type: 'move', x: tx, y: ty, home: true }; if (!Units.setPath(u, tx, ty)) u.task = null; }
  },
  /* asked by Combat.update while a war-wolf holds a mark. Only a chase the
     PACK began itself (u.packMark, stamped in packSense) answers to home
     ground: it is let go at PACK.leash from the hall. A wolf STRUCK fights it
     out wherever it was struck — out on the player's errand too, where a
     home-ground leash dropped the fight on the first tick and turned the
     wolf's back to its attacker (the card says "they fight beside you") — and
     is let go only if the fight drags it PACK.leash from where it began
     (u.packFrom, so a runner can never lead it across the map). An attack the
     player ORDERED runs to the kill. Every way it ends, the wolf comes home. */
  packLeash(u, tgt) {
    if (u.task && u.task.type === 'attack') return false;
    const P = this.PACK;
    if (!u.packMark) {
      if (!u.packFrom) u.packFrom = { x: u.x, y: u.y };
      if (Math.hypot(u.x - u.packFrom.x, u.y - u.packFrom.y) <= P.leash) return false;
    } else {
      const h = this.packCentre(u);
      if (Math.hypot(u.x - h.x, u.y - h.y) <= P.leash && Math.hypot(tgt.x - h.x, tgt.y - h.y) <= P.leash + 1) return false;
    }
    this.packHome(u);
    return true;
  },

  /* THE VETERANS */
  VET: 1.25,
  RANK: { defender: 'elite', axeman: 'elite', archer: 'marksman', longbow: 'marksman',
          rider: 'lancer', horsearcher: 'lancer', catapult: 'trebuchet' },
  // every land soldier the player has — the ones riding a hull included
  // ({u, hull}: a soldier below deck is in its transport's cargo, never in S.units).
  // A REAL soldier: the Ancestors' Host's ghosts (u.spectral, Bronze
  // Champions — military by kind) are another card's summons for six days
  // and never rise a rank, nor does a war-wolf; the count Veterans reports
  // is the soldiers it really raised
  landSoldiers() {
    const out = [];
    const real = u => Units.isMilitary(u) && !Units.isNaval(u) && !u.spectral && !u.warWolf;
    for (const u of S.units) {
      if (u.owner !== 'P') continue;
      if (real(u)) out.push({ u, hull: null });
      if (u.cargo && u.cargo.length) for (const c of u.cargo) if (real(c)) out.push({ u: c, hull: u });
    }
    return out;
  },
  /* the new rank's stamps, exactly as Units.spawn would have stamped a fresh
     one — the origin card's Ironhand toughness and Horselord's saddle — the
     health kept in proportion, the sky-iron it already carried kept */
  promote(u, to) {
    const base = CFG.UNITS[to], frac = u.maxhp > 0 ? u.hp / u.maxhp : 1;
    const probe = { kind: to, owner: u.owner, hp: base.hp, maxhp: base.hp, atk: base.atk, def: base.def, speed: base.speed };
    if (window.Cards && Cards.onSpawn) Cards.onSpawn(probe);
    u.kind = to;
    u.ranked = 1;   // raised by the card: one chevron, for good (drawRank)
    u.maxhp = probe.maxhp; u.hp = Math.max(1, Math.round(frac * u.maxhp));
    u.atk = probe.atk + (u.skyIron ? 1 : 0);
    u.def = probe.def; u.speed = probe.speed;
  },
  veteran(u) {
    const frac = u.maxhp > 0 ? u.hp / u.maxhp : 1;
    u.vet = this.VET;
    u.maxhp = Math.round(u.maxhp * this.VET); u.hp = Math.max(1, Math.round(frac * u.maxhp));
    u.atk = u.atk * this.VET;
  },

  /* NAMES AND HINTS for the panel (ui.js) and the casualty line (units.js) */
  unitName(u) {
    if (!u) return null;
    if (u.warWolf) return 'War-wolf';
    if (u.spectral) return 'Spectral ' + CFG.UNITS[u.kind].name;
    if (u.vet) return 'Veteran ' + CFG.UNITS[u.kind].name;
    return null;
  },
  unitHint(u) {
    if (!u || u.owner !== 'P') return null;
    if (u.warWolf) return 'Your war-wolf. It keeps the ground round your Town Center: any enemy that comes near, it goes for, and it trots home after the fight. It needs no roof and eats nothing. Tap an enemy to set it on them.';
    if (u.spectral) return 'One of your ancestors, back for one more fight. It eats nothing, needs no roof and cannot be healed — and when the host’s days are done, it fades.';
    return null;
  },

  /* THE LOOK of a card's people, drawn in R's unit pass in place of the plain
     sprite (render.js). Cheap by construction: one or two drawImage calls
     and a handful of 2px squares; the tinted frame is R.tintOf's cache. */
  drawUnit(g, u, img, x, y, D) {
    const rank = u.vet ? 2 : u.ranked ? 1 : 0;
    if (u.spectral) { this.drawGhost(g, u, img, x, y, D); if (rank) this.drawRank(g, x, y, D, rank); return; }
    if (u.warWolf) this.drawCollar(g, u, x, y, D);     // under the wolf, as a ring on the ground is
    g.drawImage(img, x, y, D, D);
    if (rank) this.drawRank(g, x, y, D, rank);
  },
  // the tribe's dye: a ring of it on the ground at a war-wolf's feet, never
  // on a wild one — the wild sheet is undyed, and this is what says "yours"
  drawCollar(g, u, x, y, D) {
    const dye = (Sprites.tunicCol || {})[G.tunicOf('P')] || { body: '#3f6d99', accent: '#2c4e70' };
    const cx = x + D / 2, cy = y + D - 3, n = 12, rx = D * 0.36, ry = rx * 0.4;
    for (let k = 0; k < n; k++) {
      const th = k / n * Math.PI * 2, px = Math.round((cx + Math.cos(th) * rx) / 2) * 2, py = Math.round((cy + Math.sin(th) * ry) / 2) * 2;
      g.fillStyle = dye.accent || '#2c4e70'; g.fillRect(px, py + 1, 2, 1);
      g.fillStyle = dye.body || '#3f6d99'; g.fillRect(px, py, 2, 1);
    }
  },
  /* THE RANK A CARD GAVE, worn for good over the head: two gold chevrons for
     a veteran, one for a soldier the card raised to its hall's champion — a
     minute after the card, the field still says which ones it made */
  drawRank(g, x, y, D, n) {
    const cx = Math.round(x + D / 2), ty = Math.round(y + D * 0.1);
    for (let c = 0; c < (n || 2); c++) {
      const yy = ty + c * 3;
      for (const [dx, dy] of [[-3, 0], [-2, -1], [-1, -2], [0, -2], [1, -1], [2, 0]]) {
        g.fillStyle = '#5a3a10'; g.fillRect(cx + dx, yy + dy + 1, 1, 1);
        g.fillStyle = '#ffd45e'; g.fillRect(cx + dx, yy + dy, 1, 1);
      }
    }
  },
  /* THE HOST'S GHOST IS COLD FIRST. The first cut drew the champion's own
     frame at a low alpha with a pale tint ADDED over it, which read as a
     faded colour soldier — a red tunic under a blue wash — and put the
     Enlightenment card's people below the Imperial ones in the eye. A ghost
     is now its OWN picture, composed once per frame (cached, like R.tintOf):
     a one-world-pixel rim of pale cyan round the outline, the body in the
     cold of the dead with the frame's own light and shade carried into it
     (the 'luminosity' blend: the sprite's values, the ghost's hue — so the
     helm, the shield and the stride all still read), lifted toward the pale.
     Drawn at a hard-stepped alpha that shimmers slowly, with its light
     ADDED; while its beat in the rising has not come it is still under the
     ground, and as it comes it climbs up out of it, the feet line cutting it
     off below. A frame whose blend the browser does not know keeps a faint
     trace of the sprite's detail instead — never its colours. */
  GHOST: '#bfe2ff', GHOST_RIM: '#7fe8ff', GHOST_BODY: '#7fa8d8',
  _ghostC: new WeakMap(),
  ghostOf(img, D) {
    const r = Math.max(1, Math.round(img.width / Math.max(1, D)));   // one world pixel, in the frame's own pixels
    let e = this._ghostC.get(img);
    if (!e) { e = {}; this._ghostC.set(img, e); }
    if (e[r]) return e[r];
    const c = document.createElement('canvas'); c.width = img.width + 2 * r; c.height = img.height + 2 * r;
    const q = c.getContext('2d');
    q.imageSmoothingEnabled = false;
    const rim = R.tintOf(img, this.GHOST_RIM);
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) q.drawImage(rim, r + dx, r + dy);
    q.drawImage(R.tintOf(img, this.GHOST_BODY), r, r);
    q.globalCompositeOperation = 'luminosity';
    if (q.globalCompositeOperation === 'luminosity') q.drawImage(img, r, r);
    else { q.globalCompositeOperation = 'source-atop'; q.globalAlpha = 0.2; q.drawImage(img, r, r); q.globalAlpha = 1; }
    q.globalCompositeOperation = 'screen'; q.globalAlpha = 0.5;
    q.drawImage(R.tintOf(img, this.GHOST), r, r);
    q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
    c._r = r;
    return (e[r] = c);
  },
  drawGhost(g, u, img, x, y, D) {
    const q = this.riseOf(u);
    if (q <= 0) return;
    const now = performance.now() / 1000, ph = now * 1.6 + u.id * 0.77;
    const left = this.hostLeft();
    const flick = left < 0.6 && ((now * 7 + u.id) % 1) < 0.18;   // the last of its days: it gutters
    const step = flick ? 0 : 1 + Math.min(2, (((Math.sin(ph) + 1) / 2) * 3) | 0);
    const a = [1 / 3, 2 / 3, 3 / 4, 5 / 6][step];
    const lift = this.ghostLift(u, D, q, ph);
    const comp = this.ghostOf(img, D), rw = comp._r * D / img.width;
    g.save();
    try {
      if (q < 1) { g.beginPath(); g.rect(x - D, y - D, D * 3, D * 2); g.clip(); }
      g.globalAlpha = a;
      g.drawImage(comp, x - rw, y + lift - rw, D + 2 * rw, D + 2 * rw);
      // its own light: a spirit glows a little, more as the shimmer swells
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = flick ? 1 / 6 : step / 12;
      g.drawImage(R.tintOf(img, this.GHOST), x, y + lift, D, D);
    } finally { g.restore(); }
  },
  // how far below its standing place a ghost is drawn: still climbing out
  // of the ground, or (risen) bobbing a pixel on its slow breath
  ghostLift(u, D, q, ph) {
    if (q < 1) return Math.round((1 - q) * D * 0.85 / 2) * 2;
    return Math.round(Math.sin((ph != null ? ph : performance.now() / 1000 * 1.6 + u.id * 0.77) * 0.5));
  },
  /* THE GHOST'S OWN LIGHT, laid over the host's darkened sky: the sky layer
     is drawn after the world, so its dark would dim the very ghosts it is
     there to set off — the show adds their cold picture back over it, light
     added, on exactly the frame the unit pass drew (the climb cut at the
     feet line included). */
  ghostGlow(g, u, a) {
    const q = this.riseOf(u);
    if (q <= 0 || a <= 0.02) return;
    const TL = CFG.TILE, img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
    const x = u.x * TL - D / 2, y = R.frameTop(u.y, B, D), lift = this.ghostLift(u, D, q);
    const comp = this.ghostOf(img, D), rw = comp._r * D / img.width;
    g.save();
    try {
      if (q < 1) { g.beginPath(); g.rect(x - D, y - D, D * 3, D * 2); g.clip(); }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.round(a * 6) / 6;   // in hard steps, as every light here
      g.drawImage(comp, x - rw, y + lift - rw, D + 2 * rw, D + 2 * rw);
    } finally { g.restore(); }
  },
  // how far a ghost has climbed out of the ground (1: risen, or never rising)
  RISE_S: 0.9,
  riseOf(u) {
    const L = window.R && R.cardShows;
    if (!L || !L.length) return 1;
    for (const s of L) {
      if (s.id !== 'ancestors_host' || s.mode !== 'rise' || !s.rise) continue;
      const d = s.rise[u.id];
      if (d == null) continue;
      return Math.max(0, Math.min(1, (s.t - d) / this.RISE_S));
    }
    return 1;
  },
  // days left on the host, for its guttering (Infinity while none is running)
  hostLeft() {
    const e = this.timed('ancestors_host');
    return e ? e.until - this.now() : Infinity;
  },
});

/* ---------------- THE LOOK: shared house-style strokes for the shows ----------------
   Hard pixels snapped to a 2px grid in the world, hard alpha steps, rings
   made OF dots, never a stroked arc, never a soft radial gradient, never
   ctx.filter. World-space helpers take tiles × CFG.TILE; the sky helpers
   take device pixels. Every helper bounds its own count, so a show's cost is
   fixed whatever the town looks like.
   THE LIGHT IS GOLD, NOT LIME: a helper handed a TONE ('gold', 'bronze',
   'pale' — R.LIGHT.TONE) in place of an "r,g,b" draws the card's own light
   (render.js): a body (shaft, pool, the sky's rays) is an R.glow — what it
   falls on turns gold, then bright — and a mark (a ring's dots, a glint, a
   mote) opaque ink faded down the tone's ramp, whatever composite the
   caller holds. Any other colour (a ghost's cold blue, steel, white) keeps
   its own additive look, in the caller's composite, as before. */
Deck.armyFx = {
  snap(v) { return Math.round(v / 2) * 2; },
  // every alpha in hard steps of a sixth — a fade the eye reads in steps,
  // never a smooth ramp beside the hard-pixel art
  rgba(col, a) { return 'rgba(' + col + ',' + (Math.round(Math.max(0, Math.min(1, a)) * 6) / 6).toFixed(3) + ')'; },
  // set g for marks in `col` at `a`: a tone's ink (opaque, source-over) or
  // the colour itself; false when there is nothing to draw. The caller hands
  // back the composite and alpha it held (a tone's ink changes both)
  mark(g, col, a) {
    if (R.isTone(col)) return R.inkOn(g, a, col);
    g.fillStyle = this.rgba(col, a);
    return true;
  },
  ring(g, cx, cy, rad, n, col, a, sy) {
    if (a <= 0.02 || rad < 1) return;
    const op = g.globalCompositeOperation, ga = g.globalAlpha;
    if (this.mark(g, col, a)) for (let k = 0; k < n; k++) {
      const th = k / n * Math.PI * 2;
      g.fillRect(this.snap(cx + Math.cos(th) * rad), this.snap(cy + Math.sin(th) * rad * (sy || 0.5)), 2, 2);
    }
    g.globalCompositeOperation = op; g.globalAlpha = ga;
  },
  /* a column of light standing on the ground at (cx, foot): stepped bands,
     a white thread. In a tone, the bands are the card's light (R.glow,
     strongest at the heart) and the thread its white-hot core */
  shaft(g, cx, foot, h, w, col, a) {
    if (a <= 0.02 || h < 2) return;
    const tone = R.isTone(col), y0 = this.snap(foot - h), hh = this.snap(h);
    for (const [wf, al, sv] of [[1, 0.26, 0.6], [0.55, 0.42, 0.8], [0.25, 0.6, 1]]) {
      const ww = Math.max(2, this.snap(w * wf)), x0 = this.snap(cx - ww / 2);
      if (tone) { R.glow(g, sv * a, () => g.fillRect(x0, y0, ww, hh), col); continue; }
      g.fillStyle = this.rgba(col, al * a);
      g.fillRect(x0, y0, ww, hh);
    }
    if (tone) { R.glowHot(g, 0.85 * a, () => g.fillRect(this.snap(cx - 1), y0, 2, hh), col); return; }
    g.fillStyle = this.rgba('255,252,240', 0.85 * a);
    g.fillRect(this.snap(cx - 1), y0, 2, hh);
  },
  /* a beam rising OUT of the ground: brightest at the foot, stepping down
     as it climbs (three hard bands), a white thread up its middle — light
     coming up from below, where the shaft above is light standing on the
     ground, and narrow enough that what stands behind it still reads */
  beam(g, cx, foot, h, w, col, a) {
    if (a <= 0.02 || h < 2) return;
    const H = this.snap(h);
    for (const [y0, y1, k] of [[0, 0.4, 1], [0.4, 0.72, 0.62], [0.72, 1, 0.3]]) {
      const top = this.snap(foot - H * y1), bot = this.snap(foot - H * y0);
      if (bot <= top) continue;
      for (const [wf, al] of [[1, 0.2], [0.5, 0.36]]) {
        const ww = Math.max(2, this.snap(w * wf));
        g.fillStyle = this.rgba(col, al * a * k);
        g.fillRect(this.snap(cx - ww / 2), top, ww, bot - top);
      }
      g.fillStyle = this.rgba('255,255,255', 0.8 * a * k);
      g.fillRect(this.snap(cx - 1), top, 2, bot - top);
    }
  },
  /* a pool of light on the ground — in a colour only: the card's own light
     never pools on the meadow (a warm patch there reads as sand); it lands in
     a ring of dots */
  pool(g, cx, cy, r, col, a) {
    if (a <= 0.02 || R.isTone(col)) return;
    g.fillStyle = this.rgba(col, a);
    R.pxDisc(g, cx, cy, r, 2, 0.5);
  },
  // a four-point glint
  glint(g, x, y, s, col, a) {
    if (a <= 0.02) return;
    const op = g.globalCompositeOperation, ga = g.globalAlpha;
    if (this.mark(g, col, a)) {
      const X = this.snap(x), Y = this.snap(y);
      g.fillRect(X, Y - s * 2, 2, s * 4 + 2); g.fillRect(X - s * 2, Y, s * 4 + 2, 2);
    }
    g.globalCompositeOperation = op; g.globalAlpha = ga;
  },
  // motes rising off a point: n of them, each on its own loop by its seed
  motes(g, cx, cy, n, t, seed, col, a, spread, rise) {
    if (a <= 0.02) return;
    const op = g.globalCompositeOperation, ga = g.globalAlpha;
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.6 + k / n + ((seed * 0.618 + k * 0.37) % 1)) % 1;
      const ma = (ph < 0.2 ? ph / 0.2 : (1 - ph) / 0.8) * a;
      if (ma <= 0.05) continue;
      if (!this.mark(g, col, ma > 0.6 ? 0.9 : ma > 0.3 ? 0.6 : 0.32)) continue;
      const mx = cx + Math.sin(ph * 6.28 + seed + k * 2.1) * spread + (k - n / 2) * 2;
      g.fillRect(this.snap(mx), this.snap(cy - ph * rise), 2, 2);
    }
    g.globalCompositeOperation = op; g.globalAlpha = ga;
  },
  // the world point (tiles) on the screen (device px), for the sky layer
  scr(wx, wy) {
    const z = R.cam.z * R.dpr, TL = CFG.TILE;
    return { x: (wx * TL - R.cam.x) * z, y: (wy * TL - R.cam.y) * z, z };
  },
  /* NOTHING IS DRAWN IN THE BLACK, the sky layer included: the board's own
     rectangle on the screen (R.boardPx through the camera), the clip a sky
     effect lays its light inside — the eclipse's stars ask R.onBoardPx for
     the same reason. The letterbox is the one thing drawn outside it: it is
     a frame on the glass, not light in the world. */
  skyClip(g) {
    const b = R.boardPx(), z = R.cam.z * R.dpr;
    const x0 = Math.round((b.x0 - R.cam.x) * z), y0 = Math.round((b.y0 - R.cam.y) * z);
    g.beginPath(); g.rect(x0, y0, Math.round((b.x1 - R.cam.x) * z) - x0, Math.round((b.y1 - R.cam.y) * z) - y0); g.clip();
  },
  // the screen's grain in the sky layer: one world pixel pair at this zoom
  grain() { return Math.max(2, Math.round(2 * R.cam.z * R.dpr)); },
  dim(g, a, col) {
    if (a <= 0.01) return;
    g.fillStyle = this.rgba(col || '6,8,18', a);
    g.fillRect(0, 0, R.cv.width, R.cv.height);
  },
  /* THE HELD BEAT is a LETTERBOX: two solid bars slide in over the open
     frame — below the status bar, above the build menu, whose heights are
     measured off the DOM (R.topReserve/bottomReserve are learned lazily and
     can still read 0) — each edged with a gilded rule, and slide back out
     when the march lets the beat go. The first cut closed the screen in with
     three stepped vignette bands down every side, which on a phone read as
     dark stripes stuck to the glass. Hard-edged and opaque, a letterbox
     reads as a cut to the moment, which is what the beat is. */
  frame() {
    const now = performance.now();
    if (this._frame && now - this._frame.at < 500) return this._frame;
    const dpr = R.dpr || 1, tb = document.getElementById('topbar'), bb = document.getElementById('bottombar');
    const vis = el => el && el.offsetParent !== null ? el.offsetHeight : 0;
    return (this._frame = { at: now, top: (vis(tb) * dpr) || (R.topReserve || 0) * dpr, bot: (vis(bb) * dpr) || (R.bottomReserve || 0) * dpr });
  },
  edges(g, a, col, rule, size) {
    if (a <= 0.01) return;
    const W = R.cv.width, H = R.cv.height, f = this.frame(), gr = this.grain();
    const open = Math.max(1, H - f.top - f.bot);
    // the bars come in by whole grains, eased: a hard edge on every frame
    // (`size`: the bar's share of the open frame — the Iron tier's is half)
    const e = 1 - (1 - Math.min(1, a)) * (1 - Math.min(1, a));
    const h = Math.round(open * (size || 0.085) * e / gr) * gr;
    if (h <= 0) return;
    g.fillStyle = 'rgb(' + (col || '10,8,6') + ')';
    g.fillRect(0, f.top, W, h); g.fillRect(0, H - f.bot - h, W, h);
    // the gilded rule along each bar's inner edge, a grain thick
    g.fillStyle = this.rgba(rule || '255,212,94', 0.85 * e);
    g.fillRect(0, f.top + h - gr, W, gr); g.fillRect(0, H - f.bot - h, W, gr);
    g.fillStyle = this.rgba('120,80,24', 0.9 * e);
    g.fillRect(0, f.top + h, W, Math.max(1, gr >> 1)); g.fillRect(0, H - f.bot - h - Math.max(1, gr >> 1), W, Math.max(1, gr >> 1));
  },
  /* light coming down out of the sky onto a point on the screen: a cone of
     shafts from high above it, cut in scanlines the height of the world's
     grain so every edge is a hard pixel step (a filled polygon's edge is
     antialiased — the soft line this file never draws), two strengths of
     shaft. `spread` is the cone's half-angle in radians. In a tone each
     shaft is the card's light (R.glow: the meadow under it turned gold, then
     brightened); any other colour is added, as before. */
  rays(g, sx, sy, n, spin, col, a, spread) {
    if (a <= 0.02 || sy < 0) return;
    // cut on the world's own 2px grain: coarser steps read as a glitch
    const H = R.cv.height, gr = this.grain(), oy = -H * 0.3, sp = spread || 0.21, tone = R.isTone(col);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      // a tone's shaft is NARROW (under half the width): laid solid across the
      // meadow at the old width it was a slab, and spread thin it is olive
      const th = (-1 + (2 * k + 1) / n) * sp + Math.sin(spin + k * 1.7) * 0.02, w = (0.016 + (k % 3) * 0.008) * (tone ? 0.42 : 1);
      const t1 = Math.tan(th - w), t2 = Math.tan(th + w);
      const cut = () => {
        for (let y = 0; y < sy; y += gr) {
          const dy = y + gr / 2 - oy;
          const X1 = Math.round((sx + t1 * dy) / gr) * gr, X2 = Math.round((sx + t2 * dy) / gr) * gr;
          if (X2 > X1) g.fillRect(X1, y, X2 - X1, gr);
        }
      };
      if (tone) { R.glow(g, a * (k % 2 ? 0.45 : 0.7), cut, col); continue; }
      g.fillStyle = this.rgba(col, a * (k % 2 ? 0.17 : 0.3));
      cut();
    }
    g.restore();
  },
  /* dust hanging in the light: motes drifting slowly down inside the cone
     the rays cut (the same geometry), each a hard square, a fixed number,
     positions a pure function of the clock — what makes a shaft of light
     read as air rather than as paint */
  dust(g, sx, sy, t, n, col, a, spread) {
    if (a <= 0.02 || sy < 0) return;
    const H = R.cv.height, gr = this.grain(), oy = -H * 0.3, sp = spread || 0.21;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const h = (k * 0.618034) % 1, h2 = (k * 0.381966 + 0.5) % 1;
      const ph = (t * (0.05 + h2 * 0.06) + h) % 1;
      const y = ph * sy, th = (h2 * 2 - 1) * sp * 0.9 + Math.sin(t * 0.7 + k) * 0.01;
      const x = sx + Math.tan(th) * (y - oy) + Math.sin(t * 1.3 + k * 2.3) * gr;
      const tw = ((t * 2.1 + k * 0.37) % 1) < 0.5 ? 1 : 0.55;
      if (!this.mark(g, col, a * tw * (ph < 0.1 ? ph / 0.1 : ph > 0.9 ? (1 - ph) / 0.1 : 1))) continue;   // a tone's mote: opaque ink
      g.fillRect(Math.round(x / gr) * gr, Math.round(y / gr) * gr, gr, gr);
    }
    g.restore();
  },
  /* the ancestors coming home: pale lights falling out of the dark from all
     over the sky and spiralling in to one point, each a hard square with a
     two-step trail (a fixed number, positions a pure function of the clock) */
  spirits(g, sx, sy, t, n, col, a) {
    if (a <= 0.02) return;
    const W = R.cv.width, H = R.cv.height, gr = this.grain();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const h = ((k * 0.618034) % 1), life = 1.6 + h * 1.4;
      const ph = ((t + h * 9) / life) % 1;
      const x0 = sx + (h - 0.5) * W * 1.3, y0 = -H * 0.05 - h * H * 0.2;
      for (let tr = 2; tr >= 0; tr--) {
        const q = Math.max(0, ph - tr * 0.035), e = q * q;
        const x = x0 + (sx - x0) * e + Math.sin(q * 9 + k) * W * 0.04 * (1 - q);
        const y = y0 + (sy - y0) * e;
        g.fillStyle = this.rgba(col, a * [0.9, 0.45, 0.2][tr] * (ph > 0.92 ? (1 - ph) / 0.08 : 1));
        const z = tr || k % 4 ? gr : gr * 2;   // a few bright heads among many small lights
        g.fillRect(Math.round(x / gr) * gr, Math.round(y / gr) * gr, z, z);
      }
    }
    g.restore();
  },
  /* the march shakes the ground: a shake (amp, one number or one per beat;
     0 is a beat felt only in the ears) and a voice (one key, or one per beat,
     null for none) fired once each as p passes its beat — render state on the
     show, never in S. The DRUMS live here and not in the card's opening voice
     because Sound caps the voices sounding at once (MAX_VOICES) and counts a
     note from the moment it is scheduled: a fanfare that booked its whole
     march up front held the cap for four seconds and silenced the landing's
     own chime and the next voice after it. Struck on the beat, every drum
     also lands on the very frame the ground shakes. */
  beats(s, p, at, amp, dur, voice) {
    s.beat = s.beat || 0;
    while (s.beat < at.length && p >= at[s.beat]) {
      const a = Array.isArray(amp) ? amp[s.beat] : amp, v = Array.isArray(voice) ? voice[s.beat] : voice;
      if (a) R.shakeAt(a, dur);
      if (v && typeof Sound !== 'undefined') Sound.play(v);
      s.beat++;
    }
  },
  // is world point (tiles) on screen, with a margin
  near(v, x, y, m) { return x >= v.x0 - m && x <= v.x1 + m && y >= v.y0 - m && y <= v.y1 + m; },
};

/* ---------------- THE SOUND: synthesized voices for the cards' moments ----------------
   Never an audio file (tests/audio.mjs): every one of these is made of the
   two primitives the game already speaks in (Sound._note, Sound._noise),
   added through the one door's own table so the mute switch, the throttle and
   the voice cap hold for them too. */
if (typeof Sound !== 'undefined' && Sound._VOICES) {
  /* A CARD'S OPENING VOICE BOOKS AT MOST SIX NOTES (ARMY_VOICE_MAX): Sound
     lets ten sound at once and counts each from the moment it is scheduled,
     and the landing's own chime (js/deckui.js, UI.cue — three notes) comes
     right after the card's voice. Anything longer is struck on the show's
     beats (Deck.armyFx.beats), one drum or hoof at a time. */
  Object.assign(Sound.GAP, {
    cardHands: 1.0, cardWarHorn: 1.5, cardHowl: 1.5, cardHoof: 0.12, cardDrum: 0.12,
    cardRumble: 1.5, cardRanks: 1.5, cardFanfare: 2.0, cardHost: 2.5, cardFade: 1.5,
  });
  Object.assign(Sound._VOICES, {
    // strangers at the door: two soft knocks, then a warm rising third
    cardHands(t, v) {
      this._noise({ at: t, hz: 340, to: 200, dur: 0.07, q: 1.2, gain: 0.12 * v });
      this._noise({ at: t, delay: 0.16, hz: 320, to: 190, dur: 0.07, q: 1.2, gain: 0.10 * v });
      [392, 494].forEach((hz, i) => this._note({ at: t, delay: 0.32 + i * 0.12, hz, dur: 0.42, type: 'triangle', gain: 0.09 * v, lp: 1800 }));
    },
    // a war horn: a long low call, a fifth up, back down
    cardWarHorn(t, v) {
      this._note({ at: t, hz: 147, dur: 0.6, type: 'sawtooth', gain: 0.11 * v, lp: 700, atk: 0.07 });
      this._note({ at: t, delay: 0.5, hz: 220, dur: 0.55, type: 'sawtooth', gain: 0.12 * v, lp: 820, atk: 0.06 });
      this._note({ at: t, delay: 1.0, hz: 147, dur: 0.9, type: 'sawtooth', gain: 0.10 * v, lp: 600, atk: 0.08 });
      this._noise({ at: t, delay: 1.0, hz: 120, to: 60, dur: 0.25, q: 0.8, gain: 0.16 * v, filter: 'lowpass' });
    },
    // the pack: two wolves, the second a fifth over and a beat behind
    cardHowl(t, v) {
      for (const [d, k, gn] of [[0, 1, 0.10], [0.35, 1.5, 0.07], [0.8, 1.25, 0.05]]) {
        this._note({ at: t, delay: d, hz: 300 * k, to: 520 * k, dur: 0.45, type: 'sine', gain: gn * v, atk: 0.12 });
        this._note({ at: t, delay: d + 0.42, hz: 520 * k, to: 380 * k, dur: 1.1, type: 'sine', gain: gn * v, atk: 0.02 });
      }
    },
    // a hoof-fall: the pair of muffled thuds one stride of a gallop makes
    // (struck on the show's beats, a stride at a time)
    cardHoof(t, v) {
      this._noise({ at: t, hz: 180, to: 80, dur: 0.07, q: 1, gain: 0.13 * v, filter: 'lowpass' });
      this._noise({ at: t, delay: 0.09, hz: 170, to: 76, dur: 0.07, q: 1, gain: 0.11 * v, filter: 'lowpass' });
    },
    // one deep drum, the ground answering it (struck on the show's beats)
    cardDrum(t, v) {
      this._note({ at: t, hz: 96, to: 44, dur: 0.38, type: 'sine', gain: 0.22 * v });
      this._noise({ at: t, hz: 260, to: 90, dur: 0.16, q: 0.8, gain: 0.12 * v, filter: 'lowpass' });
    },
    // timber and iron rolling: a long low rumble and the creak of an axle
    cardRumble(t, v) {
      this._noise({ at: t, hz: 240, to: 70, dur: 2.2, q: 0.7, gain: 0.22 * v, filter: 'lowpass', rate: 0.45, atk: 0.25 });
      this._note({ at: t, delay: 0.3, hz: 190, to: 150, dur: 0.32, type: 'square', gain: 0.035 * v, lp: 900 });
      this._note({ at: t, delay: 1.1, hz: 175, to: 140, dur: 0.36, type: 'square', gain: 0.03 * v, lp: 800 });
    },
    // the ranks rise: a climbing run, then the chord it was climbing to
    cardRanks(t, v) {
      [494, 587, 784].forEach((hz, i) => this._note({ at: t, delay: i * 0.12, hz, dur: 0.3, type: 'triangle', gain: 0.08 * v }));
      [784, 1175].forEach(hz => this._note({ at: t, delay: 0.42, hz, dur: 1.2, type: 'sine', gain: 0.07 * v, atk: 0.04 }));
      this._note({ at: t, delay: 0.42, hz: 98, dur: 0.9, type: 'sine', gain: 0.18 * v });
    },
    // the legion: a bare brass fifth swelling, then the full chord a fourth
    // higher over a deep bass (the march's drums are struck on the show's
    // beats, Deck.armyFx.beats)
    cardFanfare(t, v) {
      [196, 294].forEach(hz => this._note({ at: t, hz, dur: 0.9, type: 'sawtooth', gain: 0.07 * v, lp: 1100, atk: 0.12 }));
      [262, 330, 392].forEach(hz => this._note({ at: t, delay: 0.75, hz, dur: 1.5, type: 'sawtooth', gain: 0.065 * v, lp: 1300, atk: 0.1 }));
      this._note({ at: t, delay: 0.75, hz: 65, dur: 1.4, type: 'sine', gain: 0.2 * v });
    },
    // the ancestors: a drone from under the ground, a pale choir, a shimmer
    // (the ground's thud under it is the show's first beat: a drum)
    cardHost(t, v) {
      this._note({ at: t, hz: 55, dur: 5.5, type: 'sine', gain: 0.24 * v, atk: 0.8 });
      this._note({ at: t, hz: 82.5, dur: 5.0, type: 'sine', gain: 0.12 * v, atk: 1.0 });
      [440, 659, 880].forEach((hz, i) => this._note({ at: t, delay: 0.6 + i * 0.6, hz, dur: 3.2, type: 'sine', gain: 0.05 * v, atk: 0.9 }));
      this._noise({ at: t, delay: 0.3, hz: 5200, to: 2600, dur: 3.6, q: 0.6, gain: 0.04 * v, atk: 1.0 });
    },
    // the host fades: an airy fall, the choir going home
    cardFade(t, v) {
      this._noise({ at: t, hz: 3800, to: 900, dur: 2.0, q: 0.6, gain: 0.05 * v, atk: 0.3 });
      [880, 659, 523].forEach((hz, i) => this._note({ at: t, delay: i * 0.35, hz, to: hz * 0.98, dur: 1.4, type: 'sine', gain: 0.045 * v, atk: 0.3 }));
    },
  });
}

/* ---------------- THE CARDS ---------------- */
{
  const A = Deck.armyFx, TLs = () => CFG.TILE;
  const sound = k => { if (typeof Sound !== 'undefined') Sound.play(k); };
  const show = (id, data) => (window.R && R.startCardShow) ? R.startCardShow(id, data) : null;
  // the summoned, as a show carries them: where they stand and when their
  // flash comes (render state only)
  const roster = (r, stag) => r.units.map((u, i) => ({ id: u.id, x: u.x, y: u.y, d: i * (stag || 0) / 1000 }));
  // the units a show follows, live (a unit gone is simply not drawn)
  const live = id => Units.get(id);
  // a muster's common ground: the doorstep's dust-gold ring, the units'
  // glints as each steps out of its light, motes over the door
  const muster = (g, s, p, col, rings, glints) => {
    const TL = TLs(), fx = s.mx * TL, fy = s.my * TL;
    for (let k = 0; k < rings; k++) {
      const q = (p - k * 0.12) / 0.6;
      if (q > 0 && q < 1) A.ring(g, fx, fy, TL * (0.6 + q * (2.2 + k * 0.6)), 22 + k * 6, col, 0.8 * (1 - q));
    }
    if (glints) for (const m of s.units) {
      const q = (s.t - m.d - 0.25) / 0.45;
      if (q <= 0 || q >= 1) continue;
      const u = live(m.id);
      if (!u) continue;
      A.glint(g, u.x * TL + 4, u.y * TL - TL * 0.55, 1 + (q < 0.5 ? 1 : 0), '255,248,220', 1 - q);
    }
  };

  /* the army cards share ONE apply: summon the list, stamp what the card
     stamps, start the show, sound the voice, say it plainly in the log */
  const summonCard = (id, list, o) => {
    const r = Deck.summon(list, { stagger: o.stagger, hold: o.hold, together: o.together, flash: o.flash, dust: o.dust, stamp: o.stamp, tone: o.tone });
    if (!r.ok) return r;
    if (o.after) o.after(r);
    for (const k of o.voices || []) sound(k);
    if (o.horn && window.R && R.startHorn) R.startHorn(r.x, r.y);
    if (o.startle && window.R && R.startle) R.startle(r.x, r.y, o.startle);
    show(id, Object.assign({ x: r.x, y: r.y, mx: r.first.x + 0.5, my: r.first.y + 0.5, units: roster(r, o.stagger) }, o.data || {}));
    Deck.say(o.log(r));
    return { ok: true, x: r.x, y: r.y, units: r.units.map(u => u.id), msg: o.msg ? o.msg(r) : undefined };
  };
  const PLURAL = { villager: 'villagers', defender: 'Defenders', axeman: 'Axemen', elite: 'Bronze Champions',
    marksman: 'Fire Archers', lancer: 'Lancers', trebuchet: 'Trebuchets' };

  Object.assign(Deck.FX, {
    /* STONE — Willing Hands: three villagers at the Town Center. They may
       take the town over its population cap (Units.spawn never checks it);
       training waits until there is room again — the card's own words, true
       at the hall's ceiling (CFG.TC_POP_CAP) too, which "until houses catch
       up" was not. They step out one after another into the doorstep's warm
       light and walk a few paces out, ready for work. */
    willing_hands: {
      at: 'tc', KIND: 'villager', N: 3, STAGGER: 170, HOLD: 0.4,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        return summonCard('willing_hands', [{ kind: this.KIND, n: this.N }], {
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardHands'], tone: 'pale',   // the Stone tier's pale light
          log: () => '👥 Three strangers walk up to your Town Center, asking for a roof and a job. They are yours now.',
        });
      },
      // a modest moment: the hearth's warm ring once round the door, a little
      // smoke-gold rising off it, and a glint as each one steps into the light
      show: {
        ms: 1800, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE;
          // the Stone tier's pale light, the hearth's warmth in the motes —
          // in ink (added, it was lime), and no pool on the doorstep (a warm
          // patch on the meadow reads as sand)
          muster(g, s, p, 'pale', 1, true);
          A.motes(g, s.mx * TL, s.my * TL, 6, s.t, 3, 'bronze', 1 - p, 10, TL * 1.2);
        },
      },
    },

    /* BRONZE — War Band: five of the best infantry the player can field,
       by the best FINISHED Barracks (a hall mid-upgrade still trains at its
       old level, so it still counts at its old level): Defenders at Lv 1 or
       with no Barracks at all, Axemen at Lv 2, Bronze Champions at Lv 3. */
    war_band: {
      at: 'tc', N: 5, STAGGER: 140, HOLD: 0.5, KINDS: ['defender', 'defender', 'axeman', 'elite'],
      kind() {
        let lv = 0;
        for (const b of S.buildings) if (b.owner === 'P' && b.key === 'barracks' && Bld.done(b)) lv = Math.max(lv, b.level || 1);
        return this.KINDS[Math.min(3, lv)];
      },
      can() { return Deck.summonCan(this.kind()); },
      apply() {
        const k = this.kind();
        return summonCard('war_band', [{ kind: k, n: this.N }], {
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardWarHorn'], horn: true, tone: 'bronze',   // the Bronze tier's light
          log: () => '⚔️ The war band: five ' + PLURAL[k] + ' march out of your Town Center.',
          msg: () => 'War Band: five ' + PLURAL[k] + ' march out of your Town Center.',
        });
      },
      // the horn's gold rings go out over the village (R.startHorn); here, a
      // bronze ring on the doorstep, a spear's glint as each one steps out,
      // and the dust of five pairs of feet
      show: {
        ms: 2400, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE;
          muster(g, s, p, 'bronze', 2, true);
          // the dust of their feet is DUST, laid as itself (added, it went lime)
          for (const m of s.units) {
            const u = live(m.id), q = s.t - m.d;
            if (!u || q < 0.4 || q > 1.6) continue;
            A.motes(g, u.x * TL, u.y * TL + 6, 3, s.t, m.id, '200,160,110', 0.6 * (1 - (q - 0.4) / 1.2), 6, 6);
          }
        },
      },
    },

    /* BRONZE — Hunter's Pack: three war-wolves (the rules are on Deck above:
       PACK, packSense, packLeash, packHome; the look is drawCollar). Each
       one's own place by the hall (u.den) is where its march out ends. */
    hunters_pack: {
      at: 'tc', KIND: 'wolf', N: 3, STAGGER: 260, HOLD: 0.3,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        const P = Deck.PACK;
        return summonCard('hunters_pack', [{ kind: this.KIND, n: this.N }], {
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardHowl'], startle: 12, dust: false, tone: 'bronze',
          stamp(u) { u.warWolf = true; u.hp = u.maxhp = P.hp; u.atk = P.atk; u.speed = P.speed; },
          after: r => Deck.FX.hunters_pack.dens(r),
          log: () => '🐺 Three war-wolves join you at your Town Center. They keep the ground round the hall.',
        });
      },
      /* EACH WOLF ITS OWN PLACE (u.den): the slot its march out ends on —
         but Units.formationMove packs TWO of a kind to a tile, so the slots
         dealt to three wolves are two tiles, and a pack that rests on its
         dens the whole run read as two wolves. A slot already taken (by a
         packmate, or by someone standing still on it) gives way to the
         nearest open tile the doorstep can walk to, and the wolf's march
         is re-aimed at it. */
      dens(r) {
        const W = CFG.W, taken = new Set(), reach = Path.reachFrom([r.first]);
        const still = new Set();
        for (const o of S.units) if (r.units.indexOf(o) < 0 && !Units.moving(o)) still.add((o.y | 0) * W + (o.x | 0));
        const open = (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y) && (!reach || !!reach[y * W + x]) && !taken.has(y * W + x);
        for (const u of r.units) {
          const t = u.task;
          let d = t && t.x != null ? { x: t.x, y: t.y } : { x: u.x | 0, y: u.y | 0 };
          if (!open(d.x, d.y) || still.has(d.y * W + d.x)) {
            const f = MapGen.findNear(d.x, d.y, 4, (x, y) => open(x, y) && !still.has(y * W + x)) || MapGen.findNear(d.x, d.y, 4, open);
            if (f) d = f;
          }
          taken.add(d.y * W + d.x);
          u.den = { x: d.x, y: d.y };
          if (t && t.type === 'muster') { t.x = d.x; t.y = d.y; }
          else if (t && t.type === 'move' && (t.x !== d.x || t.y !== d.y)) { Units.moveTo(u, d.x, d.y); if (u.task) u.task.home = true; }
        }
      },
      /* THE WIND BRINGS THEM: pale-gold motes spiral in to where each wolf
         will step out of the light; then each one DASHES out to its place —
         a streak of hard dots flung out behind it — and as it pulls up at
         its den it howls: two rings of dots going out from it, the tribe's
         dye and a pale one, and a few notes of breath rising off its muzzle.
         No boots, no dust (Deck.summon's `dust: false`): the first cut's
         grey doorstep clouds were the loudest thing in the still. */
      show: {
        ms: 3200, layer: 'world',
        draw(g, s, p, dt) {
          const TL = CFG.TILE;
          muster(g, s, p, 'pale', 1, false);
          const dye = (Sprites.tunicCol || {})[G.tunicOf('P')] || { body: '#3f6d99' };
          const hx = dye.body || '#3f6d99', dyeRgb = [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16)).join(',');
          s.prev = s.prev || {}; s.howl = s.howl || {};
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const m of s.units) {
            const u = live(m.id);
            // the spiral in, to the spot it steps out of
            const q = (s.t - m.d + 0.35) / 0.7;
            if (q > 0 && q < 1) for (let k = 0; k < 10; k++) {
              const th = k / 10 * 6.283 + q * 4, rr = TL * 1.4 * (1 - q);
              if (!A.mark(g, 'gold', 0.85 * q)) continue;   // pale-gold ink, opaque
              g.fillRect(A.snap(m.x * TL + Math.cos(th) * rr), A.snap(m.y * TL + Math.sin(th) * rr * 0.55 - TL * 0.3), 2, 2);
            }
            if (!u) continue;
            // the dash: a streak flung out behind it while it runs
            const pv = s.prev[m.id];
            s.prev[m.id] = { x: u.x, y: u.y };
            if (pv && dt > 0 && Units.moving(u)) {
              const vx = (u.x - pv.x) / dt, vy = (u.y - pv.y) / dt, sp = Math.hypot(vx, vy);
              if (sp > 0.8) {
                const ux = vx / sp, uy = vy / sp;
                for (let j = 1; j <= 5; j++) {
                  if (!A.mark(g, j < 3 ? 'gold' : 'pale', 0.9 * (1 - j / 6))) continue;
                  const bx = (u.x - ux * j * 0.2) * TL, by = (u.y - uy * j * 0.2) * TL + 4;
                  g.fillRect(A.snap(bx - uy * 4), A.snap(by + ux * 2), 2, 2);
                  g.fillRect(A.snap(bx + uy * 4), A.snap(by - ux * 2), 2, 2);
                }
              }
            }
            // the howl, the moment it pulls up at its own place
            const home = u.den && (u.x | 0) === u.den.x && (u.y | 0) === u.den.y && !Units.moving(u);
            if (home && s.howl[m.id] == null) s.howl[m.id] = s.t;
            const h0 = s.howl[m.id];
            if (h0 == null) continue;
            const hq = (s.t - h0) / 0.9;
            if (hq >= 1) continue;
            g.globalCompositeOperation = 'lighter';   // the tribe's dye, added as before
            A.ring(g, u.x * TL, u.y * TL + 6, TL * (0.35 + hq * 1.5), 16, dyeRgb, 0.9 * (1 - hq));
            if (hq > 0.15) A.ring(g, u.x * TL, u.y * TL + 6, TL * (0.3 + (hq - 0.15) * 1.1), 12, 'gold', 0.75 * (1 - hq));
            g.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 4; k++) {
              const lift = (hq * 1.4 + k * 0.18) % 1;
              g.fillStyle = A.rgba('240,236,220', 0.8 * (1 - lift));
              g.fillRect(A.snap(u.x * TL + (k - 1.5) * 3 + lift * 4), A.snap(u.y * TL - TL * 0.55 - lift * TL * 0.6), 2, 2);
            }
          }
          g.restore();
        },
      },
    },

    /* IRON — Iron Legion: six Bronze Champions. Their arrival is a drum's:
       three deep beats under the horn, the ground answering each. */
    iron_legion: {
      at: 'tc', KIND: 'elite', N: 6, STAGGER: 180, HOLD: 0.6,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        return summonCard('iron_legion', [{ kind: this.KIND, n: this.N }], {
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardWarHorn'], horn: true,
          log: () => '🛡️ Six Bronze Champions march out of your Town Center.',
        });
      },
      /* THE IRON TIER'S STEP UP from the War Band below it: a SHORT HELD
         BEAT — the day dims a step and a half-letterbox closes in while the
         six come out — and each champion's shield catching the sun IN TURN,
         a big four-point flare and a ring of light round the boss, one after
         another down the line; the steel ring and the drums under it. (The
         first cut was the War Band's muster with a second ring, and read as
         the same card.) */
      show: {
        ms: 3000, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const TL = CFG.TILE;
          if (layer === 'sky') {
            const hold = p < 0.06 ? p / 0.06 : p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) / 0.2);
            g.save(); A.skyClip(g); A.dim(g, hold > 0.5 ? 1 / 6 : hold > 0.01 ? 1 / 12 : 0, '12,10,8'); g.restore();
            A.edges(g, hold, '10,8,6', '200,214,236', 0.045);   // half the Imperial bars, a steel rule
            return;
          }
          A.beats(s, p, [0.02, 0.16, 0.30, 0.39], 3, 0.22, 'cardDrum');
          muster(g, s, p, 'bronze', 1, true);
          const q2 = (p - 0.1) / 0.6;
          if (q2 > 0 && q2 < 1) A.ring(g, s.mx * TL, s.my * TL, TL * (1 + q2 * 3.4), 32, '170,200,240', 0.7 * (1 - q2));
          flashUnits(g, s, 'gold', 0.45, 0.32);
          shields(g, s, 0.4);
        },
      },
    },

    /* IRON — Siege Train: a Catapult and a Ballista — the engines without the
       hall Lv 3 and the Workshop they normally need, which is the card. */
    siege_train: {
      at: 'tc', LIST: [{ kind: 'catapult', n: 1 }, { kind: 'ballista', n: 1 }], STAGGER: 520, HOLD: 0.5,
      can() { return Deck.summonCan('catapult'); },
      apply() {
        return summonCard('siege_train', this.LIST, {
          // the show lays its own (smaller) dust under each engine: the
          // doorstep's boot-dust on top of it buried them
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardRumble'], dust: false,
          log: () => '🪨 A Catapult and a Ballista roll out of your Town Center.',
        });
      },
      // timber and iron: the ground rolls under them, big dust, sparks off
      // the axles as each one lands in its light
      show: {
        ms: 3200, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE;
          A.beats(s, p, [0.03, 0.18, 0.33, 0.48], 4, 0.4);
          muster(g, s, p, 'bronze', 2, false);
          // dust at half the first cut's (it swallowed the two engines it was
          // there to announce); the sparks are what says iron
          if (!s.dust) { s.dust = 1; for (const m of s.units) if (R.startPlacePoof) R.startPlacePoof(m.x - 1, m.y - 1, 2, { delay: m.d * 1000 + 120, scale: 0.55 }); }
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const m of s.units) {
            const q = (s.t - m.d) / 0.6;
            if (q <= 0 || q >= 1) continue;
            const cx = m.x * TL, cy = m.y * TL;
            if (q < 0.22) A.glint(g, cx, cy - 4, 4, '255,252,230', 1);   // the axle strikes
            // the sparks: white-hot added, the rest opaque in the gold and the
            // bronze inks, fading down their ramps (added, they went lime)
            for (let k = 0; k < 14; k++) {
              const th = k * 0.4488 + m.id, sp = 0.8 + ((k * 7) % 5) * 0.12, rr = TL * (0.25 + q * 1.15 * sp);
              const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr * 0.5 - q * 10 + q * q * 14;   // flung up, falling back
              const a = q < 0.5 ? 1 : 1 - (q - 0.5) / 0.5;
              g.globalCompositeOperation = 'lighter';
              if (A.mark(g, k % 3 === 0 ? '255,255,240' : k % 3 === 1 ? 'gold' : 'bronze', k % 3 === 0 ? a : 0.85 * a)) {
                const z = q < 0.45 && k % 2 === 0 ? 4 : 2;
                g.fillRect(A.snap(x), A.snap(y), z, z);
              }
              if (A.mark(g, 'bronze', a * 0.5))   // its trail
                g.fillRect(A.snap(cx + Math.cos(th) * rr * 0.78), A.snap(cy + Math.sin(th) * rr * 0.39 - q * 8), 2, 2);
            }
          }
          g.restore();
        },
      },
    },

    /* IRON — Veterans: every land soldier rises one rank (the rules are on
       Deck above: RANK, promote, veteran). A soldier already a veteran has
       nowhere left to rise; with nobody who can, the card is kept. */
    veterans: {
      at: 'tc',
      can() {
        const all = Deck.landSoldiers();
        if (!all.length) return { ok: false, why: 'You have no land soldier to raise.' };
        if (!all.some(({ u }) => Deck.RANK[u.kind] || !u.vet)) return { ok: false, why: 'Every soldier you have is already a veteran.' };
        return { ok: true };
      },
      apply() {
        const ok = this.can();
        if (!ok.ok) return ok;
        const tc = Bld.tcOf('P'), all = Deck.landSoldiers();
        const hx = tc ? Bld.cx(tc) : 0, hy = tc ? Bld.cy(tc) : 0;
        let ranks = 0, vets = 0;
        const lit = [];
        for (const { u, hull } of all) {
          const to = Deck.RANK[u.kind];
          if (to) { Deck.promote(u, to); ranks++; }
          else if (!u.vet) { Deck.veteran(u); vets++; }
          else continue;
          const at = hull || u;
          lit.push({ id: u.id, hull: hull ? hull.id : 0, d: tc ? Math.min(2.2, Math.hypot(at.x - hx, at.y - hy) * 0.07) : 0 });
        }
        // the panel names a kind it no longer has (panelSig does not carry it)
        if (UI.sel) UI.renderPanel();
        sound('cardRanks');
        // (no whole-frame flash: gold laid over the meadow is a yellow-green
        // frame — the pillars are the light)
        show('veterans', { x: hx, y: hy, lit });
        const n = ranks + vets;
        Deck.say('🎖️ ' + n + ' soldier' + (n > 1 ? 's' : '') + ' rise a rank' +
          (ranks ? ' — ' + ranks + ' made champion' + (ranks > 1 ? 's' : '') : '') +
          (vets ? (ranks ? ', ' : ' — ') + vets + ' made veteran' + (vets > 1 ? 's' : '') : '') + '.');
        return { ok: true, x: hx, y: hy, units: lit.map(l => l.id),
          msg: 'Veterans: ' + n + ' soldier' + (n > 1 ? 's' : '') + ' rise a rank.' };
      },
      // a wave of gold going out from the hall: each soldier lit in a pillar
      // of gold as its rank comes, its own silhouette blazing, and its new
      // rank's chevrons rising off it
      show: {
        ms: 3600, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE, v = R.viewTiles();
          g.save();
          const q0 = p / 0.7;
          if (q0 < 1) A.ring(g, s.x * TL, s.y * TL, TL * (1 + q0 * 9), 48, 'gold', 0.85 * (1 - q0));
          // pass 1, the light: each soldier's pillar as the wave reaches it,
          // and its new rank rising off it
          const lit = [];
          for (const l of s.lit) {
            const q = (s.t - l.d) / 1.1;
            if (q <= 0 || q >= 1) continue;
            const u = live(l.hull || l.id);
            if (!u || !A.near(v, u.x, u.y, 2) || !G.visibleAt(u.x | 0, u.y | 0)) continue;
            const cx = u.x * TL, foot = u.y * TL + TL * 0.3, a = q < 0.2 ? 1 : 1 - (q - 0.2) / 0.8;
            A.ring(g, cx, foot, TL * (0.4 + q * 0.5), 14, 'gold', 0.9 * a, 0.45);   // the light lands in a ring, never a pool
            A.shaft(g, cx, foot, TL * 2.6 * Math.min(1, q * 6), TL * 0.8 * (1 - q * 0.6), 'gold', a);
            const ry = u.y * TL - TL * (0.8 + q * 0.7), n = u.vet ? 2 : 1;   // the rank it now wears
            if (A.mark(g, 'gold', a)) for (let c = 0; c < n; c++) for (const [dx, dy] of [[-4, 0], [-2, -2], [0, -4], [2, -2], [4, 0]])
              g.fillRect(A.snap(cx + dx), A.snap(ry + c * 4 + dy), 2, 2);
            if (!l.hull && q < 0.45) lit.push([u, q]);
          }
          g.restore();
          /* pass 2, the soldier: its own silhouette blazing, laid OVER every
             pillar and opaque — added like the light, it washed out into the
             pillar's white and the soldier the card was raising disappeared.
             A dark-gold edge round a pale-gold figure: the man in the light. */
          g.save();
          for (const [u, q] of lit) {
            const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
            const x = u.x * TL - D / 2, y = R.frameTop(u.y, B, D);
            g.globalAlpha = q < 0.25 ? 5 / 6 : q < 0.35 ? 2 / 3 : 1 / 2;
            const edge = R.tintOf(img, '#7a4c0e');
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(edge, x + dx, y + dy, D, D);
            g.drawImage(R.tintOf(img, '#ffeaa8'), x, y, D, D);
          }
          g.restore();
        },
      },
    },

    /* IMPERIAL — The Legion Marches: twelve of the best — 5 Bronze Champions,
       4 Fire Archers (the Range's top rank, CFG.UNITS.marksman) and 3
       Lancers — stepping out one after another, and then the HELD BEAT: they
       stand in their light under the horn until the last is out, and march
       together, the ground shaking under them. */
    legion_marches: {
      at: 'tc', LIST: [{ kind: 'elite', n: 5 }, { kind: 'marksman', n: 4 }, { kind: 'lancer', n: 3 }], STAGGER: 120, HOLD: 1.1,
      can() { return Deck.summonCan('elite'); },
      apply() {
        return summonCard('legion_marches', this.LIST, {
          stagger: this.STAGGER, hold: this.HOLD, together: true, voices: ['cardFanfare'], horn: true, startle: 16,
          log: () => '🦅 The Legion marches: five Bronze Champions, four Fire Archers and three Lancers leave your Town Center.',
        });
      },
      show: {
        ms: 4800, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const TL = CFG.TILE;
          if (layer === 'sky') {
            // the held beat: the edges close in and the sky's light comes
            // down on the hall, then the march lets it go
            const hold = p < 0.08 ? p / 0.08 : p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.3);
            const h = A.scr(s.x, s.y);
            g.save(); A.skyClip(g);
            A.rays(g, h.x, h.y, 11, s.t * 0.6, 'gold', 0.7 * hold);
            A.dust(g, h.x, h.y, s.t, 30, 'gold', 0.9 * hold);
            g.restore();
            A.edges(g, hold);   // last: the bars are clean black over the light
            return;
          }
          // the first shake as the horn sounds; then the march, foot by foot,
          // on the drums of the fanfare (Sound cardFanfare: 2.4s, every 0.42s)
          A.beats(s, p, [0.02, 0.5, 0.588, 0.675, 0.763, 0.85], 4, 0.2, [null, 'cardDrum', 'cardDrum', 'cardDrum', 'cardDrum', 'cardDrum']);
          muster(g, s, p, 'gold', 3, true);
          flashUnits(g, s, 'gold', 0.4, 0.3);
          // the standards: a column of light over the doorstep through the beat
          const k = p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.25);
          A.shaft(g, s.mx * TL, s.my * TL + 6, TL * 3.2 * Math.min(1, p * 8), TL * 1.4, 'gold', 0.7 * k);
          stamp(g, s, p, [0.5, 0.588, 0.675, 0.763, 0.85]);
        },
      },
    },

    /* IMPERIAL — Trebuchet Battery: two Trebuchets and a Siege Tower — the
       workshop's whole top tier, out of a hall that never built one. They
       come slow and heavy: a beat between each, the ground rolling. */
    trebuchet_battery: {
      at: 'tc', LIST: [{ kind: 'trebuchet', n: 2 }, { kind: 'siegetower', n: 1 }], STAGGER: 520, HOLD: 0.9,
      can() { return Deck.summonCan('trebuchet'); },
      apply() {
        return summonCard('trebuchet_battery', this.LIST, {
          stagger: this.STAGGER, hold: this.HOLD, together: true, voices: ['cardFanfare'], horn: true, startle: 14,
          log: () => '🏰 Two Trebuchets and a Siege Tower roll out of your Town Center.',
        });
      },
      show: {
        ms: 4600, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const TL = CFG.TILE;
          if (layer === 'sky') {
            const hold = p < 0.1 ? p / 0.1 : p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.3);
            const h = A.scr(s.x, s.y);
            g.save(); A.skyClip(g);
            A.rays(g, h.x, h.y, 9, s.t * 0.5, 'gold', 0.65 * hold);
            A.dust(g, h.x, h.y, s.t, 24, 'gold', 0.85 * hold);
            g.restore();
            A.edges(g, hold);
            return;
          }
          // a shake as each engine lands in its light, then the battery rolling out
          // (the timber's rumble comes in with the first engine's landing,
          // and every landing after it is a drum)
          A.beats(s, p, [0.02, 0.13, 0.24, 0.43, 0.56, 0.69, 0.82], 5, 0.35,
            [null, 'cardRumble', 'cardDrum', 'cardDrum', 'cardDrum', 'cardDrum', 'cardDrum']);
          muster(g, s, p, 'gold', 3, false);
          if (!s.dust) { s.dust = 1; for (const m of s.units) if (R.startPlacePoof) R.startPlacePoof(m.x - 1, m.y - 1, 2, { delay: m.d * 1000 + 150, scale: 1.25 }); }
          flashUnits(g, s, 'gold', 0.5, 0.35);
          stamp(g, s, p, [0.43, 0.56, 0.69, 0.82]);
        },
      },
    },

    /* ENLIGHTENMENT — Ancestors' Host: fifteen spectral Bronze Champions for
       the card's 6 days, then they fade (the rules are on Deck above and in
       Units.mortal: no population, no food, no famine, no sky-iron, no heal,
       no alarm when one falls; every one fades at the end, below deck too).
       A second host while one walks lengthens it (Deck.addTimed): the first
       fifteen stay as long as the second. They do not come out of the
       doorstep's gold: they RISE out of the ground, one after another, in a
       column of pale light under a darkened sky (drawGhost, riseOf). */
    ancestors_host: {
      at: 'tc', KIND: 'elite', N: 15, STAGGER: 300, HOLD: 1.4,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        const days = Deck.card('ancestors_host').days, was = !!Deck.timed('ancestors_host');
        const r = Deck.summon([{ kind: this.KIND, n: this.N }], {
          stagger: this.STAGGER, hold: this.HOLD, together: true, flash: false, stamp(u) { u.spectral = true; } });
        if (!r.ok) return r;
        const e = Deck.addTimed('ancestors_host', days);
        sound('cardHost');
        if (window.R) {
          // the first beat is the hardest blow any army card strikes: the
          // ground itself giving the host up
          if (R.shakeAt) R.shakeAt(10, 1.2);
          if (R.flashAt) R.flashAt(0.32, 0.7, '210,232,255');
          if (R.startle) R.startle(r.x, r.y, 18);
        }
        const rise = {};
        r.units.forEach((u, i) => { rise[u.id] = 0.25 + i * this.STAGGER / 1000; });
        show('ancestors_host', { mode: 'rise', x: r.x, y: r.y, mx: r.first.x + 0.5, my: r.first.y + 0.5,
          units: r.units.map(u => ({ id: u.id, x: u.x, y: u.y, d: rise[u.id] })), rise });
        Deck.say(was ? '👻 Fifteen more of your ancestors rise at the Town Center — the host walks ' + days + ' days longer.'
          : '👻 Fifteen of your ancestors rise at the Town Center. They will fight for you for ' + days + ' days.');
        return { ok: true, x: r.x, y: r.y, units: r.units.map(u => u.id), until: e.until };
      },
      // the days are done: every ghost goes back, the ones below deck too
      end() {
        const gone = [];
        const v = window.R && R.viewTiles ? R.viewTiles() : null;
        for (const u of S.units.slice()) {
          if (u.owner !== 'P' || !u.spectral) continue;
          if (v && gone.length < 24 && Deck.armyFx.near(v, u.x, u.y, 2) && G.visibleAt(u.x | 0, u.y | 0)) {
            try {
              const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
              gone.push({ x: u.x, y: u.y, img, D, top: R.frameTop(u.y, B, D), d: gone.length * 0.09 });
            } catch (err) { /* a picture is never worth the expiry */ }
          }
          Units.despawn(u);
        }
        let below = 0;
        for (const tr of S.units) if (tr.cargo && tr.cargo.length) {
          const n0 = tr.cargo.length;
          tr.cargo = tr.cargo.filter(c => !c.spectral);
          below += n0 - tr.cargo.length;
        }
        if (gone.length) { show('ancestors_host', { mode: 'fade', ms: 2800, ghosts: gone }); sound('cardFade'); }
        // a plain note, never the red alarm: nothing went wrong, the days are done
        G.log('👻 The Ancestors’ Host fades — your ancestors go back to the earth.', false, 6000);
        return below;
      },
      /* THE HOST RISES. The sky goes dark and cold and the northern light
         comes out over the hall; the ground shakes once, hard; pale lights
         fall out of the dark and spiral in to the doorstep, where a narrow
         beam stands up out of the ground. Then, one after another, each
         ghost's own ground CRACKS — a jagged seam of light with the glow
         leaking up through it, a ring of motes drawn in to it — and breaks
         open in a hard white burst as the ghost comes up through it, a thin
         thread of light climbing with it and a ring going out when it
         stands. The first cut's column was a flat pale slab 2.2 tiles wide
         over the hall, and its rising ghost a white rectangle. */
      show: {
        ms: 6400, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (s.mode === 'fade') return drawFade(g, s, p, layer);
          if (layer !== 'sky') {
            // the first beat is the apply's own blow (R.shakeAt in apply);
            // then the ground answers as the host comes up through it
            A.beats(s, p, [0.03, 0.2, 0.4, 0.6], [0, 2, 2.5, 3], 0.3, ['cardDrum']);
            return;
          }
          const dk = p < 0.06 ? p / 0.06 : p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.22);
          const h = A.scr(s.mx, s.my);
          g.save(); A.skyClip(g);
          A.dim(g, [0, 0.25, 0.42, 0.58][Math.min(3, Math.ceil(dk * 3))], '6,10,28');   // the day goes out
          /* THE LIGHT IS LAID OVER THE DARK: the sky layer comes after the
             world, so the beam, the cracks, the bursts and the ghosts' own
             glow are drawn here, in the world's own coordinates (the camera,
             shake and all), on top of the dimmed day — drawn in the world
             layer, the dark put out every light it was there to set off */
          const z = R.cam.z * R.dpr;
          g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
          hostLight(g, s, p, dk);
          g.setTransform(1, 0, 0, 1, 0, 0);
          A.rays(g, h.x, h.y, 5, s.t * 0.3, '170,235,255', 0.75 * dk, 0.1);
          A.spirits(g, h.x, h.y - 10 * h.z, s.t, 26, '215,240,255', dk * (p < 0.7 ? 1 : 0.5));
          g.restore();
          A.edges(g, dk, '4,6,20', '160,225,255');
        },
      },
      /* WHILE THE HOST WALKS: pale motes rising off every ghost and a ring of
         cold light at its feet — culled to the camera and to what is in
         sight, since this layer is drawn over the fog */
      drawLive(g, e) {
        const TL = CFG.TILE, v = R.viewTiles(), t = performance.now() / 1000;
        g.globalCompositeOperation = 'lighter';
        let n = 0;
        for (const u of S.units) {
          if (!u.spectral || u.owner !== 'P' || n > 40) continue;
          if (!A.near(v, u.x, u.y, 1) || !G.visibleAt(u.x | 0, u.y | 0) || Deck.riseOf(u) < 1) continue;
          n++;
          const cx = u.x * TL, cy = u.y * TL;
          A.motes(g, cx, cy - 4, 3, t * 0.7, u.id, '210,232,255', 0.85, 5, TL * 0.9);
          const pulse = ((t * 0.5 + u.id * 0.13) % 1);
          A.ring(g, cx, cy + TL * 0.3, TL * (0.28 + pulse * 0.12), 10, '190,220,255', 0.45 * (1 - pulse));
        }
      },
    },
  });

  /* a unit's own silhouette blazing as it steps out of its light — the
     shield catching the sun (iron and imperial musters). In a tone it is the
     card's light (R.glow over its tinted frame): the soldier turns gold in
     his own light and shade, then bright — added, he flashed lime */
  function flashUnits(g, s, col, a, life) {
    const TL = CFG.TILE, tone = R.isTone(col), hex = tone ? null : '#' + col.split(',').map(n => (+n).toString(16).padStart(2, '0')).join('');
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of s.units) {
      const q = (s.t - m.d - 0.12) / life;
      if (q <= 0 || q >= 1) continue;
      const u = live(m.id);
      if (!u) continue;
      const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B), x = u.x * TL - D / 2, y = R.frameTop(u.y, B, D);
      if (tone) { R.glow(g, a * (q < 0.5 ? 1 : 0.5) / 0.6, c => g.drawImage(R.tintOf(img, c), x, y, D, D), col); continue; }
      g.globalAlpha = a * (q < 0.5 ? 1 : 0.5);
      g.drawImage(R.tintOf(img, hex), x, y, D, D);
    }
    g.restore();
  }

  /* the host's light, in world space over the darkened sky (see the show) */
  function hostLight(g, s, p, dk) {
    const TL = CFG.TILE, fx = s.mx * TL, fy = s.my * TL + 6, v = R.viewTiles();
    const k = p < 0.05 ? p / 0.05 : p < 0.8 ? 1 : Math.max(0, 1 - (p - 0.8) / 0.2);
    // every ghost standing in sight shines through the dark it rose into
    let n = 0;
    for (const m of s.units) {
      const u = live(m.id);
      if (!u || n > 30 || !A.near(v, u.x, u.y, 2) || !G.visibleAt(u.x | 0, u.y | 0)) continue;
      n++;
      Deck.ghostGlow(g, u, (1 / 3) * dk);
    }
    g.save(); g.globalCompositeOperation = 'lighter';
    // the beam the host comes up through: under a tile wide, rising out of
    // the ground and thinning as it climbs, so the hall still reads behind it
    A.beam(g, fx, fy, TL * 4.2 * Math.min(1, p * 10), TL * 0.9, '170,225,255', 0.85 * k);
    A.ring(g, fx, fy, TL * 0.62, 16, '210,240,255', 0.85 * k);
    for (let r = 0; r < 3; r++) {
      const q = ((s.t * 0.55 + r / 3) % 1);
      A.ring(g, fx, fy, TL * (0.8 + q * 3.6), 30, '190,232,255', 0.7 * (1 - q) * k);
    }
    A.motes(g, fx, fy, 10, s.t, 7, '220,242,255', k, TL * 0.35, TL * 3.6);
    for (const m of s.units) {
      const q = (s.t - m.d) / Deck.RISE_S;
      if (q <= -0.75 || q >= 1.8) continue;
      const u = live(m.id), x = (u ? u.x : m.x) * TL, y = (u ? u.y : m.y) * TL + TL * 0.3;
      if (q < 0) groundCrack(g, x, y, (q + 0.75) / 0.75, m.id);
      else if (q < 1) {
        if (q < 0.1) burst(g, x, y);
        A.beam(g, x, y, TL * 1.7 * Math.min(1, q * 3 + 0.25), TL * 0.34, '200,238,255', 0.9 * (1 - q * 0.5));
      } else A.ring(g, x, y, TL * (0.3 + (q - 1) * 1.2), 14, '200,236,255', 0.85 * (1.8 - q) / 0.8);
    }
    g.restore();
  }

  /* EACH SHIELD CATCHES THE SUN IN TURN (Iron Legion): as each champion
     steps out of its light, a big four-point flare on its shield-arm and a
     ring of light round the boss — one after another down the line, on the
     muster's own stagger. Light, added. */
  function shields(g, s, life) {
    const TL = CFG.TILE;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of s.units) {
      const q = (s.t - m.d - 0.15) / life;
      if (q <= 0 || q >= 1) continue;
      const u = live(m.id);
      if (!u) continue;
      const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
      const x = u.x * TL + D * 0.16, y = R.frameTop(u.y, B, D) + D * 0.56;
      const a = q < 0.3 ? 1 : 1 - (q - 0.3) / 0.7;
      A.glint(g, x, y, q < 0.3 ? 5 : 3, '255,250,225', a);
      A.ring(g, x, y, 4 + q * TL * 0.5, 12, 'gold', a * 0.85, 0.8);
      if (q < 0.15) { g.fillStyle = 'rgb(255,255,240)'; R.pxDisc(g, x, y, 4, 2, 1); }
    }
    g.restore();
  }

  /* A GHOST'S GROUND CRACKS before it rises (c: 0 → 1 as its beat comes):
     a jagged seam of light across its tile, hashed off its id so every
     crack is its own, the glow leaking up through it in short hard bars,
     and a ring of motes drawing IN to it — the eye is called to the spot a
     moment before the ghost comes up there. Light, added. */
  function groundCrack(g, x, y, c, id) {
    const TL = CFG.TILE, n = 7, len = TL * (0.25 + c * 0.6);
    let h = (Math.imul(id + 13, 0x9e3779b1) >>> 0);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const jy = ((h >>> (i * 3)) & 3) - 1.5;
      pts.push([x + (i / (n - 1) - 0.5) * len, y + jy * 1.4]);
    }
    const a = c < 0.34 ? 0.5 : c < 0.67 ? 0.67 : 1;
    g.fillStyle = A.rgba('235,250,255', a);
    for (let i = 0; i < n - 1; i++) {
      // the seam is CONTINUOUS: a 2px step every 2px between two points
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], st = Math.max(1, Math.ceil(Math.abs(x2 - x1) / 2));
      for (let j = 0; j <= st; j++) g.fillRect(A.snap(x1 + (x2 - x1) * j / st), A.snap(y1 + (y2 - y1) * j / st), 2, 2);
    }
    // the glow spilling up out of it: a low band over the seam, and a few
    // short sparks of it standing proud — never tall, or the crack reads as
    // a fence
    g.fillStyle = A.rgba('170,230,255', a * 0.34);
    g.fillRect(A.snap(pts[0][0]), A.snap(y - 4), A.snap(len), 4);
    g.fillStyle = A.rgba('200,240,255', a * 0.67);
    for (let i = 1; i < n - 1; i++) {
      if (((h >>> (i * 2 + 1)) & 3) === 0) continue;
      const bh = A.snap(2 + c * 2 + ((h >>> (i * 2)) & 1) * 2);
      g.fillRect(A.snap(pts[i][0]), A.snap(pts[i][1] - bh), 2, bh);
    }
    A.ring(g, x, y, TL * (0.75 - 0.5 * c), 10, '200,238,255', 0.67 * c, 0.45);
  }
  /* …and BREAKS OPEN: one hard white burst as the ghost comes up through
     its ground — a solid white disc, a four-point star and a spray of
     sparks flung clear — over a frame or two; nothing soft about it */
  function burst(g, x, y) {
    const TL = CFG.TILE;
    g.fillStyle = 'rgb(255,255,255)';
    R.pxDisc(g, x, y - TL * 0.25, TL * 0.42, 2, 0.75);
    A.glint(g, x, y - TL * 0.4, 5, '255,255,255', 1);
    g.fillStyle = A.rgba('200,240,255', 1);
    for (let k = 0; k < 10; k++) {
      const th = k / 10 * 6.283;
      g.fillRect(A.snap(x + Math.cos(th) * TL * 0.75), A.snap(y - TL * 0.25 + Math.sin(th) * TL * 0.45), 2, 2);
    }
  }

  /* THE MARCH STAMPS: on each drum of the march a ring of dust goes out
     along the ground round the marching column (its live middle — the
     column moves), the dust the feet throw up in step */
  function stamp(g, s, p, at) {
    const TL = CFG.TILE;
    let n = 0, x = 0, y = 0;
    for (const m of s.units) { const u = live(m.id); if (u) { n++; x += u.x; y += u.y; } }
    if (!n) return;
    x = x / n * TL; y = y / n * TL + TL * 0.35;
    for (const b0 of at) {
      const q = (p - b0) / 0.12;
      if (q <= 0 || q >= 1) continue;
      A.ring(g, x, y, TL * (1.2 + q * 2.4), 30, '196,164,116', 0.75 * (1 - q), 0.42);
      A.ring(g, x, y, TL * (0.8 + q * 1.6), 22, '226,200,150', 0.5 * (1 - q), 0.42);
    }
  }

  /* the host fading: each ghost goes up out of where it stood in its own
     wisp — its frame drawn taller and thinner as it climbs, in hard alpha
     steps, shedding motes — under a brief cold light */
  function drawFade(g, s, p, layer) {
    if (layer === 'sky') { g.save(); A.skyClip(g); A.dim(g, p < 0.15 ? 0.12 : p < 0.7 ? 0.18 : 0.18 * (1 - (p - 0.7) / 0.3), '10,16,34'); g.restore(); return; }
    const TL = CFG.TILE;
    g.save();
    for (const w of s.ghosts) {
      const q = (s.t - w.d) / 1.8;
      if (q <= 0 || q >= 1) continue;
      const a = [0.5, 0.36, 0.22, 0.1][Math.min(3, (q * 4) | 0)];
      const stretch = 1 + q * 0.9, squeeze = 1 - q * 0.55, lift = q * TL * 1.8;
      const cx = w.x * TL, foot = w.top + w.D;
      const dw = w.D * squeeze, dh = w.D * stretch;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = a;
      // the ghost's own cold picture (Deck.ghostOf), its rim scaled with it
      const comp = Deck.ghostOf(w.img, w.D), rx = comp._r * dw / w.img.width, ry = comp._r * dh / w.img.height;
      g.drawImage(comp, cx - dw / 2 - rx, foot - dh - lift - ry, dw + 2 * rx, dh + 2 * ry);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a * 1.2;
      g.drawImage(R.tintOf(w.img, Deck.GHOST), cx - dw / 2, foot - dh - lift, dw, dh);
      g.globalAlpha = 1;
      A.motes(g, cx, foot - lift, 4, s.t, w.x * 7 + w.y, '220,238,255', 1 - q, 6, TL * 1.4);
    }
    g.restore();
  }

  /* SWIFT RAIDERS' moment (the card lives in js/deckfx.js; its look lives
     with the rest of the army's): they come out together and ride — a
     steel-blue ring, the drum of hooves in the ground, dust off every horse */
  if (Deck.FX.swift_raiders) Deck.FX.swift_raiders.show = {
    ms: 2200, layer: 'world',
    draw(g, s, p) {
      const TL = CFG.TILE;
      // a gallop: a stride on every beat, the ground felt under the first four
      A.beats(s, p, [0.05, 0.18, 0.31, 0.44, 0.57, 0.70, 0.83], [2, 2, 2, 1.5, 0, 0, 0], 0.15, 'cardHoof');
      const q = p / 0.6;
      if (q < 1) A.ring(g, s.mx * TL, s.my * TL, TL * (0.7 + q * 3.2), 30, '160,195,240', 0.8 * (1 - q));
      // the dust off every horse is DUST, laid as itself (added, it went lime)
      for (const id of s.ids || []) {
        const u = live(id);
        if (!u || !Units.moving(u)) continue;
        A.motes(g, u.x * TL, u.y * TL + 8, 3, s.t * 1.6, id, '210,180,130', 0.7 * (1 - p), 8, 6);
      }
    },
  };
}
