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
     (and within its own nose, PACK.sense), lets a runner go at PACK.leash and
     trots back to its own place by the hall (u.den) after every fight
     (Units.resolveAfterFight). Walked out past home ground by the player it
     obeys, and when the walk is done it goes home: the card says they stay
     near home. It strikes back when struck. It is not population, eats
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
     killed" toasts. Their kills are kills. When the host's days are done
     EVERY ghost fades — the ones riding a transport too, which no S.units
     pass can see (Units.despawn returns on a unit it cannot find).
   THE VETERANS (u.vet, Veterans): a base or second-rank soldier becomes its
     hall's champion OUTRIGHT (the second ranks are sidegrades — an Axeman has
     less health than the Defender it replaced — and the rival's own ADV map
     already jumps base → champion); a champion or an engine that is not a
     Catapult becomes a veteran, u.vet = 1.25: its health and its attack, and
     an engine's stone with it (combat.js reads u.vet where it reads bldAtk).
     A veteran never stacks: a second card finds it already at the top. The
     soldiers aboard a transport rise with the rest. A Catapult becomes a
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
    u.tUnit = 0; u.tBld = 0;
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
    if (e) { u.tUnit = e.id; u.task = null; u.path = null; return; }
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
  /* asked by Combat.update while a war-wolf holds a mark: a chase it began
     itself (or answered, struck) is let go at the edge of home ground; an
     attack the player ORDERED runs to the kill, and then the wolf comes home */
  packLeash(u, tgt) {
    if (u.task && u.task.type === 'attack') return false;
    const P = this.PACK, h = this.packCentre(u);
    if (Math.hypot(u.x - h.x, u.y - h.y) <= P.leash && Math.hypot(tgt.x - h.x, tgt.y - h.y) <= P.leash + 1) return false;
    this.packHome(u);
    return true;
  },

  /* THE VETERANS */
  VET: 1.25,
  RANK: { defender: 'elite', axeman: 'elite', archer: 'marksman', longbow: 'marksman',
          rider: 'lancer', horsearcher: 'lancer', catapult: 'trebuchet' },
  // every land soldier the player has — the ones riding a hull included
  // ({u, hull}: a soldier below deck is in its transport's cargo, never in S.units)
  landSoldiers() {
    const out = [];
    for (const u of S.units) {
      if (u.owner !== 'P') continue;
      if (Units.isMilitary(u) && !Units.isNaval(u)) out.push({ u, hull: null });
      if (u.cargo && u.cargo.length) for (const c of u.cargo) if (Units.isMilitary(c) && !Units.isNaval(c)) out.push({ u: c, hull: u });
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
    if (u.spectral) { this.drawGhost(g, u, img, x, y, D); if (u.vet) this.drawRank(g, x, y, D); return; }
    if (u.warWolf) this.drawCollar(g, u, x, y, D);     // under the wolf, as a ring on the ground is
    g.drawImage(img, x, y, D, D);
    if (u.vet) this.drawRank(g, x, y, D);
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
  // a veteran's rank: two gold chevrons over the head
  drawRank(g, x, y, D) {
    const cx = Math.round(x + D / 2), ty = Math.round(y + D * 0.1);
    for (let c = 0; c < 2; c++) {
      const yy = ty + c * 3;
      for (const [dx, dy] of [[-3, 0], [-2, -1], [-1, -2], [0, -2], [1, -1], [2, 0]]) {
        g.fillStyle = '#5a3a10'; g.fillRect(cx + dx, yy + dy + 1, 1, 1);
        g.fillStyle = '#ffd45e'; g.fillRect(cx + dx, yy + dy, 1, 1);
      }
    }
  },
  // the host's ghost: the champion's own frame at a low hard-stepped alpha
  // with its pale-blue silhouette ADDED over it, shimmering slowly; while its
  // beat in the rising has not come it is still under the ground, and as it
  // comes it climbs up out of it, the feet line cutting it off below
  GHOST: '#bfe2ff',
  drawGhost(g, u, img, x, y, D) {
    const q = this.riseOf(u);
    if (q <= 0) return;
    const now = performance.now() / 1000, ph = now * 1.6 + u.id * 0.77;
    const left = this.hostLeft();
    const flick = left < 0.6 && ((now * 7 + u.id) % 1) < 0.18;   // the last of its days: it gutters
    const step = flick ? 0 : Math.min(2, (((Math.sin(ph) + 1) / 2) * 3) | 0);
    const a = [0.22, 0.32, 0.42][step];
    const off = q < 1 ? Math.round((1 - q) * D * 0.85 / 2) * 2 : 0;
    const bob = q >= 1 ? Math.round(Math.sin(ph * 0.5)) : 0;
    g.save();
    try {
      if (q < 1) { g.beginPath(); g.rect(x - D, y - D, D * 3, D * 2); g.clip(); }
      g.globalAlpha = a;
      g.drawImage(img, x, y + off + bob, D, D);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = flick ? 0.18 : 0.38 + step * 0.06;
      g.drawImage(R.tintOf(img, this.GHOST), x, y + off + bob, D, D);
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
   Hard pixels snapped to a 2px grid in the world, hard alpha steps, light
   ADDED where it is light, rings made OF dots, never a stroked arc, never a
   soft radial gradient, never ctx.filter. World-space helpers take tiles ×
   CFG.TILE; the sky helpers take device pixels. Every helper bounds its own
   count, so a show's cost is fixed whatever the town looks like. */
Deck.armyFx = {
  snap(v) { return Math.round(v / 2) * 2; },
  // every alpha in hard steps of a sixth — a fade the eye reads in steps,
  // never a smooth ramp beside the hard-pixel art
  rgba(col, a) { return 'rgba(' + col + ',' + (Math.round(Math.max(0, Math.min(1, a)) * 6) / 6).toFixed(3) + ')'; },
  ring(g, cx, cy, rad, n, col, a, sy) {
    if (a <= 0.02 || rad < 1) return;
    g.fillStyle = this.rgba(col, a);
    for (let k = 0; k < n; k++) {
      const th = k / n * Math.PI * 2;
      g.fillRect(this.snap(cx + Math.cos(th) * rad), this.snap(cy + Math.sin(th) * rad * (sy || 0.5)), 2, 2);
    }
  },
  // a column of light standing on the ground at (cx, foot): stepped bands, a white thread
  shaft(g, cx, foot, h, w, col, a) {
    if (a <= 0.02 || h < 2) return;
    for (const [wf, al] of [[1, 0.26], [0.55, 0.42], [0.25, 0.6]]) {
      const ww = Math.max(2, this.snap(w * wf));
      g.fillStyle = this.rgba(col, al * a);
      g.fillRect(this.snap(cx - ww / 2), this.snap(foot - h), ww, this.snap(h));
    }
    g.fillStyle = this.rgba('255,252,240', 0.85 * a);
    g.fillRect(this.snap(cx - 1), this.snap(foot - h), 2, this.snap(h));
  },
  pool(g, cx, cy, r, col, a) {
    if (a <= 0.02) return;
    g.fillStyle = this.rgba(col, a);
    R.pxDisc(g, cx, cy, r, 2, 0.5);
  },
  // a four-point glint
  glint(g, x, y, s, col, a) {
    if (a <= 0.02) return;
    g.fillStyle = this.rgba(col, a);
    const X = this.snap(x), Y = this.snap(y);
    g.fillRect(X, Y - s * 2, 2, s * 4 + 2); g.fillRect(X - s * 2, Y, s * 4 + 2, 2);
  },
  // motes rising off a point: n of them, each on its own loop by its seed
  motes(g, cx, cy, n, t, seed, col, a, spread, rise) {
    if (a <= 0.02) return;
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.6 + k / n + ((seed * 0.618 + k * 0.37) % 1)) % 1;
      const ma = (ph < 0.2 ? ph / 0.2 : (1 - ph) / 0.8) * a;
      if (ma <= 0.05) continue;
      g.fillStyle = this.rgba(col, ma > 0.6 ? 0.9 : ma > 0.3 ? 0.6 : 0.32);
      const mx = cx + Math.sin(ph * 6.28 + seed + k * 2.1) * spread + (k - n / 2) * 2;
      g.fillRect(this.snap(mx), this.snap(cy - ph * rise), 2, 2);
    }
  },
  // the world point (tiles) on the screen (device px), for the sky layer
  scr(wx, wy) {
    const z = R.cam.z * R.dpr, TL = CFG.TILE;
    return { x: (wx * TL - R.cam.x) * z, y: (wy * TL - R.cam.y) * z, z };
  },
  // the screen's grain in the sky layer: one world pixel pair at this zoom
  grain() { return Math.max(2, Math.round(2 * R.cam.z * R.dpr)); },
  dim(g, a, col) {
    if (a <= 0.01) return;
    g.fillStyle = this.rgba(col || '6,8,18', a);
    g.fillRect(0, 0, R.cv.width, R.cv.height);
  },
  // the held beat: the screen's edges closed in by three hard bands
  edges(g, a, col) {
    if (a <= 0.01) return;
    const W = R.cv.width, H = R.cv.height, b = Math.round(Math.min(W, H) * 0.06);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = this.rgba(col || '8,6,4', a * (0.55 - k * 0.15));
      const i = b * k;
      g.fillRect(i, i, W - i * 2, b); g.fillRect(i, H - i - b, W - i * 2, b);
      g.fillRect(i, i + b, b, H - i * 2 - b * 2); g.fillRect(W - i - b, i + b, b, H - i * 2 - b * 2);
    }
  },
  /* light coming down out of the sky onto a point on the screen: a cone of
     shafts from high above it, cut in scanlines the height of the world's
     grain so every edge is a hard pixel step (a filled polygon's edge is
     antialiased — the soft line this file never draws), two strengths of
     shaft, added. `spread` is the cone's half-angle in radians. */
  rays(g, sx, sy, n, spin, col, a, spread) {
    if (a <= 0.02 || sy < 0) return;
    const H = R.cv.height, gr = this.grain() * 2, oy = -H * 0.3, sp = spread || 0.21;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const th = (-1 + (2 * k + 1) / n) * sp + Math.sin(spin + k * 1.7) * 0.02, w = 0.016 + (k % 3) * 0.008;
      const t1 = Math.tan(th - w), t2 = Math.tan(th + w);
      g.fillStyle = this.rgba(col, a * (k % 2 ? 0.17 : 0.3));
      for (let y = 0; y < sy; y += gr) {
        const dy = y + gr / 2 - oy;
        const X1 = Math.round((sx + t1 * dy) / gr) * gr, X2 = Math.round((sx + t2 * dy) / gr) * gr;
        if (X2 > X1) g.fillRect(X1, y, X2 - X1, gr);
      }
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
  // the march shakes the ground: shake pulses fired once each as p passes
  // its beat (render state on the show — never in S)
  beats(s, p, at, amp, dur) {
    s.beat = s.beat || 0;
    while (s.beat < at.length && p >= at[s.beat]) { R.shakeAt(amp, dur); s.beat++; }
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
  Object.assign(Sound.GAP, {
    cardHands: 1.0, cardWarHorn: 1.5, cardHowl: 1.5, cardHooves: 1.5, cardDrums: 1.5,
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
    // hooves: a gallop of muffled thuds
    cardHooves(t, v) {
      for (let i = 0; i < 10; i++) {
        const d = (i >> 1) * 0.28 + (i & 1) * 0.09;
        this._noise({ at: t, delay: d, hz: 180, to: 80, dur: 0.07, q: 1, gain: (0.13 - i * 0.008) * v, filter: 'lowpass' });
      }
    },
    // three deep drums, the ground answering each
    cardDrums(t, v) {
      [0, 0.42, 0.84, 1.1].forEach((d, i) => {
        this._note({ at: t, delay: d, hz: 96, to: 44, dur: 0.38, type: 'sine', gain: (i === 3 ? 0.26 : 0.2) * v });
        this._noise({ at: t, delay: d, hz: 260, to: 90, dur: 0.16, q: 0.8, gain: 0.12 * v, filter: 'lowpass' });
      });
    },
    // timber and iron rolling: a long low rumble and the creak of an axle
    cardRumble(t, v) {
      this._noise({ at: t, hz: 240, to: 70, dur: 2.2, q: 0.7, gain: 0.22 * v, filter: 'lowpass', rate: 0.45, atk: 0.25 });
      this._note({ at: t, delay: 0.3, hz: 190, to: 150, dur: 0.32, type: 'square', gain: 0.035 * v, lp: 900 });
      this._note({ at: t, delay: 1.1, hz: 175, to: 140, dur: 0.36, type: 'square', gain: 0.03 * v, lp: 800 });
    },
    // the ranks rise: a climbing run, then the chord it was climbing to
    cardRanks(t, v) {
      [392, 494, 587, 784].forEach((hz, i) => this._note({ at: t, delay: i * 0.11, hz, dur: 0.3, type: 'triangle', gain: 0.08 * v }));
      [392, 494, 587].forEach(hz => this._note({ at: t, delay: 0.55, hz: hz * 2, dur: 1.2, type: 'sine', gain: 0.06 * v, atk: 0.04 }));
      this._note({ at: t, delay: 0.55, hz: 98, dur: 0.9, type: 'sine', gain: 0.18 * v });
    },
    // the legion: a brass chord swelling, a second a fourth higher, and drums
    cardFanfare(t, v) {
      [196, 247, 294].forEach(hz => this._note({ at: t, hz, dur: 0.9, type: 'sawtooth', gain: 0.06 * v, lp: 1100, atk: 0.12 }));
      [262, 330, 392].forEach(hz => this._note({ at: t, delay: 0.75, hz, dur: 1.5, type: 'sawtooth', gain: 0.065 * v, lp: 1300, atk: 0.1 }));
      this._note({ at: t, delay: 0.75, hz: 65, dur: 1.4, type: 'sine', gain: 0.2 * v });
      [2.4, 2.82, 3.24, 3.66, 4.08].forEach(d => {
        this._note({ at: t, delay: d, hz: 90, to: 42, dur: 0.34, type: 'sine', gain: 0.2 * v });
        this._noise({ at: t, delay: d, hz: 240, to: 80, dur: 0.14, q: 0.8, gain: 0.1 * v, filter: 'lowpass' });
      });
    },
    // the ancestors: a drone from under the ground, a pale choir, a shimmer
    cardHost(t, v) {
      this._note({ at: t, hz: 55, dur: 5.5, type: 'sine', gain: 0.24 * v, atk: 0.8 });
      this._note({ at: t, hz: 82.5, dur: 5.0, type: 'sine', gain: 0.12 * v, atk: 1.0 });
      [440, 523, 659, 880].forEach((hz, i) => this._note({ at: t, delay: 0.6 + i * 0.5, hz, dur: 3.2, type: 'sine', gain: 0.045 * v, atk: 0.9 }));
      this._noise({ at: t, delay: 0.3, hz: 5200, to: 2600, dur: 3.6, q: 0.6, gain: 0.04 * v, atk: 1.0 });
      this._noise({ at: t, hz: 160, to: 50, dur: 1.6, q: 0.8, gain: 0.2 * v, filter: 'lowpass', atk: 0.3 });
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
    const r = Deck.summon(list, { stagger: o.stagger, hold: o.hold, together: o.together, flash: o.flash, stamp: o.stamp });
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
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardHands'],
          log: () => '👥 Three strangers walk up to your Town Center, asking for a roof and a job. They are yours now.',
        });
      },
      // a modest moment: the hearth's warm ring once round the door, a little
      // smoke-gold rising off it, and a glint as each one steps into the light
      show: {
        ms: 1800, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE;
          muster(g, s, p, '255,206,128', 1, true);
          g.save(); g.globalCompositeOperation = 'lighter';
          A.pool(g, s.mx * TL, s.my * TL + 4, TL * 0.9, '255,190,110', 0.22 * (1 - p));
          A.motes(g, s.mx * TL, s.my * TL, 6, s.t, 3, '255,214,140', 1 - p, 10, TL * 1.2);
          g.restore();
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
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardWarHorn'], horn: true,
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
          muster(g, s, p, '232,150,80', 2, true);
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const m of s.units) {
            const u = live(m.id), q = s.t - m.d;
            if (!u || q < 0.4 || q > 1.6) continue;
            A.motes(g, u.x * TL, u.y * TL + 6, 3, s.t, m.id, '200,160,110', 0.6 * (1 - (q - 0.4) / 1.2), 6, 6);
          }
          g.restore();
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
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardHowl'], startle: 12,
          stamp(u) { u.warWolf = true; u.hp = u.maxhp = P.hp; u.atk = P.atk; u.speed = P.speed; },
          // its place by the hall: the slot its march out ends on
          after(r) { for (const u of r.units) { const t = u.task; u.den = t && t.x != null ? { x: t.x, y: t.y } : { x: u.x | 0, y: u.y | 0 }; } },
          log: () => '🐺 Three war-wolves join you at your Town Center. They keep the ground round the hall.',
        });
      },
      // the wind brings them: pale-gold motes spiralling in to where each
      // wolf will stand, a ring of the tribe's dye going out under it
      show: {
        ms: 2600, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE;
          muster(g, s, p, '226,214,170', 1, false);
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const m of s.units) {
            const q = (s.t - m.d + 0.35) / 0.7;
            if (q <= 0 || q >= 1.6) continue;
            const cx = m.x * TL, cy = m.y * TL;
            if (q < 1) for (let k = 0; k < 10; k++) {
              const th = k / 10 * 6.283 + q * 4, rr = TL * 1.4 * (1 - q);
              g.fillStyle = A.rgba('255,236,180', 0.85 * q);
              g.fillRect(A.snap(cx + Math.cos(th) * rr), A.snap(cy + Math.sin(th) * rr * 0.55 - TL * 0.3), 2, 2);
            }
            else A.ring(g, cx, cy + 6, TL * (0.3 + (q - 1) * 1.4), 14, '255,236,180', 0.8 * (1.6 - q) / 0.6);
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
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardWarHorn', 'cardDrums'], horn: true,
          log: () => '🛡️ Six Bronze Champions march out of your Town Center.',
        });
      },
      // bronze shields catching the light: each champion flashes in its own
      // silhouette as it steps out; two rings, steel and bronze; the drums
      // shake the ground on their beats
      show: {
        ms: 3000, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE;
          A.beats(s, p, [0.02, 0.16, 0.30, 0.39], 3, 0.22);
          muster(g, s, p, '232,150,80', 1, true);
          const q2 = (p - 0.1) / 0.6;
          if (q2 > 0 && q2 < 1) A.ring(g, s.mx * TL, s.my * TL, TL * (1 + q2 * 3.4), 32, '170,200,240', 0.7 * (1 - q2));
          flashUnits(g, s, '255,236,190', 0.35, 0.3);
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
          stagger: this.STAGGER, hold: this.HOLD, voices: ['cardRumble'],
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
          muster(g, s, p, '210,170,120', 2, false);
          if (!s.dust) { s.dust = 1; for (const m of s.units) if (R.startPlacePoof) R.startPlacePoof(m.x - 1, m.y - 1, 2, { delay: m.d * 1000 + 120, scale: 1.1 }); }
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const m of s.units) {
            const q = (s.t - m.d) / 0.5;
            if (q <= 0 || q >= 1) continue;
            for (let k = 0; k < 8; k++) {
              const th = k * 0.785 + m.id, rr = TL * (0.3 + q * 0.9);
              g.fillStyle = A.rgba(k % 2 ? '255,200,110' : '255,244,200', 1 - q);
              g.fillRect(A.snap(m.x * TL + Math.cos(th) * rr), A.snap(m.y * TL + Math.sin(th) * rr * 0.5 - q * 8), 2, 2);
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
        if (window.R && R.flashAt) R.flashAt(0.22, 0.5, '255,226,140');
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
          g.save(); g.globalCompositeOperation = 'lighter';
          const q0 = p / 0.7;
          if (q0 < 1) A.ring(g, s.x * TL, s.y * TL, TL * (1 + q0 * 9), 48, '255,214,110', 0.7 * (1 - q0));
          for (const l of s.lit) {
            const q = (s.t - l.d) / 1.1;
            if (q <= 0 || q >= 1) continue;
            const u = live(l.hull || l.id);
            if (!u || !A.near(v, u.x, u.y, 2) || !G.visibleAt(u.x | 0, u.y | 0)) continue;
            const cx = u.x * TL, foot = u.y * TL + TL * 0.3, a = q < 0.2 ? 1 : 1 - (q - 0.2) / 0.8;
            A.shaft(g, cx, foot, TL * 2.6 * Math.min(1, q * 6), TL * 0.8 * (1 - q * 0.6), '255,214,120', a);
            A.pool(g, cx, foot, TL * 0.5, '255,206,110', 0.4 * a);
            if (!l.hull && q < 0.45) {
              const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
              g.globalAlpha = (0.45 - q) / 0.45 * 0.8;
              g.drawImage(R.tintOf(img, '#ffe6a0'), u.x * TL - D / 2, R.frameTop(u.y, B, D), D, D);
              g.globalAlpha = 1;
            }
            // the new rank, rising
            const ry = u.y * TL - TL * (0.8 + q * 0.7);
            g.fillStyle = A.rgba('255,226,140', a);
            for (let c = 0; c < 2; c++) for (const [dx, dy] of [[-4, 0], [-2, -2], [0, -4], [2, -2], [4, 0]])
              g.fillRect(A.snap(cx + dx), A.snap(ry + c * 4 + dy), 2, 2);
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
            A.edges(g, 0.85 * hold);
            const h = A.scr(s.x, s.y);
            A.rays(g, h.x, h.y, 9, s.t * 0.6, '255,222,140', 0.75 * hold);
            return;
          }
          // the first shake as the horn sounds; then the march, foot by foot,
          // on the drums of the fanfare (Sound cardFanfare: 2.4s, every 0.42s)
          A.beats(s, p, [0.02, 0.5, 0.588, 0.675, 0.763, 0.85], 4, 0.2);
          muster(g, s, p, '255,214,110', 3, true);
          flashUnits(g, s, '255,240,200', 0.4, 0.3);
          // the standards: a column of light over the doorstep through the beat
          g.save(); g.globalCompositeOperation = 'lighter';
          const k = p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.25);
          A.shaft(g, s.mx * TL, s.my * TL + 6, TL * 3.2 * Math.min(1, p * 8), TL * 1.4, '255,214,120', 0.7 * k);
          g.restore();
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
          stagger: this.STAGGER, hold: this.HOLD, together: true, voices: ['cardFanfare', 'cardRumble'], horn: true, startle: 14,
          log: () => '🏰 Two Trebuchets and a Siege Tower roll out of your Town Center.',
        });
      },
      show: {
        ms: 4600, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const TL = CFG.TILE;
          if (layer === 'sky') {
            const hold = p < 0.1 ? p / 0.1 : p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.3);
            A.edges(g, 0.8 * hold);
            const h = A.scr(s.x, s.y);
            A.rays(g, h.x, h.y, 7, s.t * 0.5, '255,214,150', 0.7 * hold);
            return;
          }
          // a shake as each engine lands in its light, then the battery rolling out
          A.beats(s, p, [0.02, 0.13, 0.24, 0.43, 0.56, 0.69, 0.82], 5, 0.35);
          muster(g, s, p, '255,206,120', 3, false);
          if (!s.dust) { s.dust = 1; for (const m of s.units) if (R.startPlacePoof) R.startPlacePoof(m.x - 1, m.y - 1, 2, { delay: m.d * 1000 + 150, scale: 1.25 }); }
          flashUnits(g, s, '255,232,180', 0.5, 0.35);
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
          if (R.shakeAt) R.shakeAt(6, 0.9);
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
        G.log('👻 The Ancestors’ Host fades — your ancestors go back to the earth.', true, 6000);
        return below;
      },
      show: {
        ms: 6400, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (s.mode === 'fade') return drawFade(g, s, p, layer);
          const TL = CFG.TILE;
          if (layer === 'sky') {
            // the sky goes dark and cold, the northern light comes out over
            // it, and holds while the host rises; then the day comes back
            const dk = p < 0.06 ? p / 0.06 : p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.22);
            A.dim(g, [0, 0.2, 0.34, 0.46][Math.min(3, Math.ceil(dk * 3))], '6,10,28');
            A.edges(g, 0.6 * dk, '4,6,20');
            const h = A.scr(s.mx, s.my);
            A.rays(g, h.x, h.y, 5, s.t * 0.3, '190,220,255', 0.7 * dk, 0.12);
            A.spirits(g, h.x, h.y - 10 * h.z, s.t, 26, '215,235,255', dk * (p < 0.7 ? 1 : 0.5));
            return;
          }
          A.beats(s, p, [0.03, 0.2, 0.4, 0.6], 2, 0.3);
          const fx = s.mx * TL, fy = s.my * TL + 6;
          const k = p < 0.05 ? p / 0.05 : p < 0.8 ? 1 : Math.max(0, 1 - (p - 0.8) / 0.2);
          g.save(); g.globalCompositeOperation = 'lighter';
          // the column of pale light the host comes up through
          A.pool(g, fx, fy, TL * 1.6, '170,210,255', 0.3 * k);
          A.shaft(g, fx, fy, TL * 6 * Math.min(1, p * 10), TL * 2.2, '180,215,255', 0.75 * k);
          for (let r = 0; r < 3; r++) {
            const q = ((s.t * 0.55 + r / 3) % 1);
            A.ring(g, fx, fy, TL * (0.8 + q * 3.6), 30, '200,228,255', 0.7 * (1 - q) * k);
          }
          A.motes(g, fx, fy, 12, s.t, 7, '220,238,255', k, TL * 0.7, TL * 4);
          // each ghost: a thread of light at its spot as it climbs, a ring as it stands
          for (const m of s.units) {
            const q = (s.t - m.d) / Deck.RISE_S;
            if (q <= -0.15 || q >= 1.8) continue;
            const u = live(m.id), x = (u ? u.x : m.x) * TL, y = (u ? u.y : m.y) * TL + TL * 0.3;
            if (q < 1) A.shaft(g, x, y, TL * 1.8 * Math.max(0.1, q + 0.15), TL * 0.55, '200,228,255', 0.8);
            else A.ring(g, x, y, TL * (0.3 + (q - 1) * 1.2), 14, '200,228,255', 0.8 * (1.8 - q) / 0.8);
          }
          g.restore();
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
     shield catching the sun (iron and imperial musters) */
  function flashUnits(g, s, col, a, life) {
    const TL = CFG.TILE, hex = '#' + col.split(',').map(n => (+n).toString(16).padStart(2, '0')).join('');
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const m of s.units) {
      const q = (s.t - m.d - 0.12) / life;
      if (q <= 0 || q >= 1) continue;
      const u = live(m.id);
      if (!u) continue;
      const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
      g.globalAlpha = a * (q < 0.5 ? 1 : 0.5);
      g.drawImage(R.tintOf(img, hex), u.x * TL - D / 2, R.frameTop(u.y, B, D), D, D);
    }
    g.restore();
  }

  /* the host fading: each ghost goes up out of where it stood in its own
     wisp — its frame drawn taller and thinner as it climbs, in hard alpha
     steps, shedding motes — under a brief cold light */
  function drawFade(g, s, p, layer) {
    if (layer === 'sky') { A.dim(g, p < 0.15 ? 0.12 : p < 0.7 ? 0.18 : 0.18 * (1 - (p - 0.7) / 0.3), '10,16,34'); return; }
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
      g.drawImage(w.img, cx - dw / 2, foot - dh - lift, dw, dh);
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
      A.beats(s, p, [0.05, 0.18, 0.31, 0.44], 2, 0.15);
      const q = p / 0.6;
      if (q < 1) A.ring(g, s.mx * TL, s.my * TL, TL * (0.7 + q * 3.2), 30, '160,195,240', 0.8 * (1 - q));
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const id of s.ids || []) {
        const u = live(id);
        if (!u || !Units.moving(u)) continue;
        A.motes(g, u.x * TL, u.y * TL + 8, 3, s.t * 1.6, id, '210,180,130', 0.7 * (1 - p), 8, 6);
      }
      g.restore();
    },
  };
}
