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

  /* THE FORMATION (playtest g2/g3/g4: "summons PILE UP and wander off
     screen"). The muster every card used to share (Deck.summon) put the
     first unit on the doorstep and the rest on the next open tiles round
     it, then marched the lot to ONE spot three tiles out: a War Band stood
     four men in one column, the battery's two trebuchets came to rest 0.14
     tiles apart (six pairs closer than 0.6), the riders and wolves settled
     4-6 tiles off half under the screen's edge, and a Legion played over a
     garrison heaped under the build bar. Now every summoned unit LANDS ON
     ITS OWN SLOT of a fan round the hall and is never marched anywhere:

       THE SIDE   the fan opens on the hall's open side — the side whose
                  slots stand on really open ground the doorstep can walk to
                  (Bld.spawnRoom, Path.reachFrom), ON THE SCREEN between the
                  bars (R.onScreen, which leaves out what the HUD covers) and
                  clear of a standing unit, with the doorstep's own south
                  side first among equals and the north (behind the hall's
                  roof) last;
       THE RANKS  arcs about the hall's middle: the foot in front — two
                  ranks when there are four or more and no bows behind them —
                  then the bows, the horse, the engines; each unit facing
                  OUTWARD (its facing set at draw-time state, R._faceMap);
       THE ROOM   a slot keeps its kind's elbow room from every other slot —
                  FAN.gap: a tile for a man or a wolf, 1.3 for a horse, 1.55
                  for an engine — so no two land within a tile and no two
                  engines within a tile and a half;
       THE HOLD   each one stands where it landed until the whole muster is
                  out and the formation has held its beat (FAN.hold after the
                  last), and then it is simply free: it stays where it
                  formed (the 'muster' task's `stay`, js/units.js).

     A pure function of the ground, the camera and the units standing — no
     RNG of any kind. When the fan runs out of good ground the rest spill to
     the next arc out, and with no arc left at all to the nearest open tiles
     round the doorstep, shared in turn, as the old muster did. */
  FAN: { r0: 2.3, arc: 1.35, gap: { foot: 1.0, bow: 1.0, horse: 1.3, engine: 1.55 }, hold: 1.2, spill: 6 },
  fanClass(kind) {
    if (kind === 'catapult' || kind === 'trebuchet' || kind === 'siegetower' || kind === 'ballista') return 'engine';
    if (kind === 'rider' || kind === 'horsearcher' || kind === 'lancer') return 'horse';
    if (CFG.UNITS[kind] && CFG.UNITS[kind].rng) return 'bow';
    return 'foot';
  },
  // the ranks, front to back: [{cls, kinds}] — the foot split in two when
  // there are enough of them and no bows to stand behind them
  fanRanks(kinds) {
    const by = { foot: [], bow: [], horse: [], engine: [] };
    for (const k of kinds) by[this.fanClass(k)].push(k);
    const ranks = [];
    if (by.foot.length >= 4 && !by.bow.length) {
      const front = Math.ceil(by.foot.length / 2);
      ranks.push({ cls: 'foot', kinds: by.foot.slice(0, front) }, { cls: 'foot', kinds: by.foot.slice(front) });
    } else if (by.foot.length) ranks.push({ cls: 'foot', kinds: by.foot });
    for (const c of ['bow', 'horse', 'engine']) if (by[c].length) ranks.push({ cls: c, kinds: by[c] });
    return ranks;
  },
  /* the plan for one side `a` (radians from due south, +x toward the east):
     every slot {kind, cls, x, y, rank, spill, on} in arrival order — the
     front rank first, each rank from its middle outwards */
  fanSide(tc, kinds, a, ctx) {
    const F = this.FAN, hx = Bld.cx(tc), hy = Bld.cy(tc), sz = Bld.size(tc), W = CFG.W;
    const north = Math.abs(a) > 2.2;
    let R = (sz / 2) * Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) + F.r0 - 1 + (north ? 1.2 : 0) + (ctx.out || 0);
    const taken = [], plan = [];
    // its kind's room from every slot laid (the larger of the two kinds': an
    // engine keeps its tile and a half from a man as well as from an engine)
    const roomOk = (x, y, gap) => taken.every(t => Math.hypot(t.x - x, t.y - y) >= Math.max(gap, t.gap) * 0.98);
    const ok = (x, y, gap) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!MapGen.onBoard(tx, ty) || !Bld.spawnRoom('P', 'land', tx, ty)) return false;
      if (ctx.reach && !ctx.reach[ty * W + tx]) return false;
      // never on the hall's own ground, nor tucked under its roof to the north
      if (x > tc.x - 0.45 && x < tc.x + sz + 0.45 && y > tc.y - 1.3 && y < tc.y + sz + 0.4) return false;
      // clear of whoever already stands there: their kind's room too (strict),
      // and at the least an engine's tile and a half from any engine (always)
      for (const o of ctx.stand) {
        const d = Math.hypot(o.x - x, o.y - y), big = Math.max(gap, o.gap);
        if (ctx.strict ? d < big * 0.95 : (big > 1.4 && d < big * 0.95)) return false;
      }
      return roomOk(x, y, gap);
    };
    const ranks = this.fanRanks(kinds);
    let spill = 0;
    for (let ri = 0; ri < ranks.length; ri++) {
      const rk = ranks[ri], gap = F.gap[rk.cls];
      if (ri) R += Math.max(gap, F.gap[ranks[ri - 1].cls]);
      let todo = rk.kinds.slice(), r = R, guard = 0;
      while (todo.length && guard++ < F.spill) {
        // the arc's step for this kind's room at this radius (a chord, so the
        // straight-line room is what is kept), the rank centred on the side
        const step = 2 * Math.asin(Math.min(1, gap / (2 * r)));
        const fit = Math.max(1, Math.floor((2 * F.arc) / step) + 1);
        const want = Math.min(todo.length, fit);
        // the rank's own places first, centred on the side (an even rank
        // straddles the middle), then every half-step between and beyond
        // them, nearest the middle first — so a place blocked by a tree gives
        // way to the next open spot beside it, never to a heap
        const offs = [];
        for (let k = 0; k <= fit + 1; k++) offs.push((want % 2 ? k : k + 0.5) * step);
        const more = [];
        for (let k = 0; k <= 2 * fit + 4; k++) more.push(k * step / 2);
        more.sort((p, q) => p - q);
        const cand = [];
        let lattice = 0;   // how many of the candidates are the rank's own evenly spaced places
        offs.concat(more).forEach((o, oi) => {
          if (o > F.arc + step * 0.5) return;
          for (const th of [a + o, a - o]) if (!cand.some(c => Math.abs(c - th) < 1e-6)) { cand.push(th); if (oi < offs.length) lattice = cand.length; }
        });
        const got = [], nPrim = lattice;
        for (let ci = 0; ci < cand.length && got.length < want; ci++) {
          const th = cand[ci], x = hx + Math.sin(th) * r, y = hy + Math.cos(th) * r;
          if (!ok(x, y, gap)) continue;
          taken.push({ x, y, gap });
          got.push({ x, y, th, prim: ci < nPrim });
        }
        // the rank reads left to right of its middle: middle first, then out
        got.sort((p, q) => Math.abs(p.th - a) - Math.abs(q.th - a));
        for (const s of got) {
          const kind = todo.shift();
          plan.push({ kind, cls: rk.cls, x: s.x, y: s.y, rank: ri, spill, prim: s.prim, on: !!ctx.on && ctx.on(s.x, s.y, rk.cls) });
        }
        if (todo.length) { r += gap; spill++; }
      }
      for (const kind of todo) plan.push({ kind, cls: rk.cls, x: null, y: null, rank: ri, spill: 99, on: false });
    }
    return plan;
  },
  /* is a slot's WHOLE sprite on the open screen — inside the frame by a
     margin, below the top bar, above the bottom bar (measured off the DOM,
     as the letterbox measures them: R.topReserve/bottomReserve are learned
     lazily) and clear of the minimap? R.onScreen counts a unit half off the
     edge as seen (the army banners' "slightly in frame"), which is exactly
     how the riders came to rest half cut off by the screen's edge. */
  fanView() {
    if (!window.R || !R.cv || !R.cv.width || typeof document === 'undefined') return null;
    const vw = R.viewW(), vh = R.viewH(), rect = id => {
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null || !el.offsetWidth) return null;
      return el.getBoundingClientRect();
    };
    const tb = rect('topbar'), bb = rect('bottombar'), mm = rect('miniWrap');
    return { vw, vh, top: Math.max(tb ? tb.bottom : 0, R.topReserve || 0), bot: Math.min(bb ? bb.top : vh, vh - (R.bottomReserve || 0)), mm };
  },
  fanOnScreen(V, x, y, cls) {
    const TL = CFG.TILE, z = R.cam.z, B = cls === 'engine' || cls === 'horse' ? 48 : 32, m = 6;
    // the drawn box (R.frameTop): its bottom SPRITE_LIFT above the tile's middle line
    const sx = (x * TL - R.cam.x) * z, foot = (y * TL + TL / 2 - CFG.SPRITE_LIFT - R.cam.y) * z, top = foot - B * z, hw = B * z / 2;
    if (sx - hw < m || sx + hw > V.vw - m || top < V.top + m || foot > V.bot - m) return false;
    if (V.mm && sx + hw > V.mm.left && sx - hw < V.mm.right && top < V.mm.bottom && foot > V.mm.top) return false;
    return true;
  },
  // the whole plan: the best side, scored on what the player will see
  fanPlan(tc, first, kinds) {
    const reach = Path.reachFrom([first]);
    const stand = S.units.filter(o => !Units.isNaval(o)).map(o => ({ x: o.x, y: o.y, gap: this.FAN.gap[this.fanClass(o.kind)] }));
    const V = this.fanView(), scr = V ? (x, y, cls) => this.fanOnScreen(V, x, y, cls) : null;
    /* every side, and each a rank or two further out (a garrison already
       standing at the door: the fan forms in front of it, never threaded
       through it), scored: a slot on the open screen counts most, then a slot
       at all, then a slot on its rank's own evenly spaced place; a slot pushed
       out an arc, a side away from the doorstep and the far reach cost */
    let best = null;
    for (const strict of [true, false]) {
      for (const out of [0, 1, 2]) for (const a of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI]) {
        const plan = this.fanSide(tc, kinds, a, { reach, stand, strict, on: scr, out });
        let sc = -Math.abs(a) * 0.35 - (Math.abs(a) > 2.2 ? 1.5 : 0) - out * 0.25 * plan.length;
        for (const s of plan) sc += s.x == null ? -6 : (s.on ? 3 : 0) + 1 + (s.prim ? 0.5 : 0) - Math.min(3, s.spill) * 0.6;
        if (!best || sc > best.sc + 1e-9) best = { sc, plan, a };
      }
      if (best && best.plan.every(s => s.x != null)) break;
    }
    // with no arc left at all: the nearest open tiles round the doorstep,
    // shared in turn when there are too few (the old muster's last word)
    const plan = best.plan, W = CFG.W, used = new Set(), spots = [];
    for (const s of plan) if (s.x != null) {
      const k = Math.floor(s.y) * W + Math.floor(s.x);
      if (!used.has(k)) { used.add(k); spots.push({ x: Math.floor(s.x), y: Math.floor(s.y) }); }
    }
    let turn = 0;
    for (const s of plan) {
      if (s.x != null) continue;
      const f = MapGen.findNear(first.x, first.y, Bld.SPAWN_R,
        (x, y) => !used.has(y * W + x) && (!reach || !!reach[y * W + x]) && Bld.spawnRoom('P', 'land', x, y));
      const t = f || (spots.length ? spots[turn++ % spots.length] : first);
      if (f) { used.add(f.y * W + f.x); spots.push(f); }
      s.x = t.x + 0.5; s.y = t.y + 0.5;
    }
    plan.side = best.a;
    return plan;
  },
  /* THE MUSTER ON THE FAN: every army card that brings people out of the
     hall (Swift Raiders too) comes through here. The refusals are the old
     muster's own (Deck.summonDoor): no hall, or no open ground beside it, and
     the card is kept in as many words. Units.spawn's card opt keeps the
     origin card's stamps and refuses Starfall's sky-iron, exactly as before.
     `opts`: stamp(u, i) as before; stagger (ms) between ARRIVALS; tone (the
     tier's light); hold (s) after the last arrival before they are free;
     beam: false — the card draws its own arrival (the host rises out of the
     ground); dust: false — no landing dust (the wolves). Returns the units in
     arrival order with each one's arrival beat (`at`, seconds after the play)
     and the moment the hold lets go (`free`). */
  summonFan(list, opts) {
    opts = opts || {};
    const kinds = [];
    for (const g of list) for (let k = 0; k < g.n; k++) kinds.push(g.kind);
    const d = this.summonDoor(kinds[0]);
    if (d.why) return { ok: false, why: d.why };
    const { tc, first } = d, plan = this.fanPlan(tc, first, kinds);
    // a wheel ends on a tile's middle (a path's last step): its riders' slots
    // are stood there first, when every one has a tile of its own
    if (opts.wheel && new Set(plan.map(s => Math.floor(s.x) + ',' + Math.floor(s.y))).size === plan.length)
      for (const s of plan) { s.x = Math.floor(s.x) + 0.5; s.y = Math.floor(s.y) + 0.5; }
    // the first lands only once its beam has fallen (BEAM_T.drop)
    const hx = Bld.cx(tc), hy = Bld.cy(tc), stag = (opts.stagger || 0) / 1000,
      lead = opts.lead != null ? opts.lead : (opts.beam === false ? 0 : Deck.armyFx.BEAM_T.drop);
    const units = [], at = [];
    plan.forEach((sl, i) => {
      const u = Units.spawn(sl.kind, 'P', Math.floor(sl.x), Math.floor(sl.y), { card: true });
      u.x = sl.x; u.y = sl.y; u.anchor = { x: sl.x, y: sl.y };
      if (opts.stamp) opts.stamp(u, i);
      // facing OUTWARD from the hall, held until it really moves
      if (window.R && R._faceMap) {
        const oct = ((Math.round(Math.atan2(sl.y - hy, sl.x - hx) / (Math.PI / 4)) % 8) + 8) % 8;
        R._faceMap.set(u, { x: u.x, y: u.y, dir: R.FACE8[oct] });
      }
      units.push(u); at.push(lead + i * stag);
    });
    const free = (at.length ? at[at.length - 1] : 0) + (opts.hold != null ? opts.hold : this.FAN.hold);
    // a WHEEL (Swift Raiders): once the last is down they gallop once round
    // the hall together and pull up on their places — all of them or none
    const wheel = opts.wheel ? this.fanWheel(tc, units, at, opts.wheel) : null;
    units.forEach((u, i) => {
      u.task = wheel ? wheel[i] : { type: 'muster', x: Math.floor(u.x), y: Math.floor(u.y), wait: free, stay: true };
      u.path = null; u.pathI = 0;
      // unseen until its beam lands (the card's show draws the beam itself)
      if (window.R && opts.beam !== false && R.startSummon) R.startSummon(u.x, u.y, at[i] * 1000, u.id, 'none');
      if (window.R && R.startPlacePoof && opts.dust !== false && i < 12)
        R.startPlacePoof(u.x - 0.5, u.y - 0.5, 1, { delay: at[i] * 1000, scale: this.fanClass(u.kind) === 'engine' ? 1 : 0.7 });
    });
    return { ok: true, units, at, free, wheel: !!wheel, go: wheel ? wheel.go : null, tc, first, side: plan.side, x: hx, y: hy };
  },
  /* THE WHEEL (Swift Raiders, playtest g2 #8 / judge g2): the riders used to
     ride straight out to a muster four tiles off and park half under the
     screen's edge. Now they land on their places, and the moment the last is
     down they BURST OUT together and wheel ONCE round the hall at a gallop
     (the task's `gallop`, a multiple of their own pace read by followPath)
     — a carousel, each from its own place round the whole ring and back to
     it — and pull up there. A rider's place is its slot's own tile (a path
     ends on a tile's middle), so the slots are first stood on their tiles'
     middles; a ring the town has built across (more than a short detour
     round a hut), or two riders whose slots share a tile, and nobody wheels:
     they hold on the fan like every other card's people. Returns one
     'muster' task per rider (its `via` the ring, sim state that rides a
     save), or null. */
  WHEEL: { gallop: 2.2, delay: 0.15, steps: 28, detour: 6 },
  fanWheel(tc, units, at, o) {
    const Wh = Object.assign({}, this.WHEEL, o === true ? {} : o), hx = Bld.cx(tc), hy = Bld.cy(tc);
    const tiles = new Set();
    for (const u of units) { const k = Math.floor(u.x) + ',' + Math.floor(u.y); if (tiles.has(k)) return null; tiles.add(k); }
    if (!units.every(u => u.x % 1 === 0.5 && u.y % 1 === 0.5)) return null;   // stood on their tiles' middles (summonFan)
    const go = (at.length ? at[at.length - 1] : 0) + Wh.delay, out = [];
    // the ring clears the hall's corners by a good tile, whatever the slot
    const rMin = Bld.size(tc) / 2 * Math.SQRT2 + 1.1;
    for (const u of units) {
      const slot = { x: Math.floor(u.x), y: Math.floor(u.y) };
      const via = this.wheelPath(tc, slot, Math.max(rMin, Math.hypot(slot.x + 0.5 - hx, slot.y + 0.5 - hy)), Wh);
      if (!via) return null;
      out.push({ type: 'muster', x: slot.x, y: slot.y, wait: go, via, gallop: Wh.gallop });
    }
    out.go = go;
    return out;
  },
  // once round the hall at radius R from `from` back to it, as tile waypoints
  // (Path.find stitches each step round anything standing on the ring)
  wheelPath(tc, from, R, Wh) {
    const hx = Bld.cx(tc), hy = Bld.cy(tc), out = [];
    const a0 = Math.atan2(from.x + 0.5 - hx, from.y + 0.5 - hy);
    let cur = { x: from.x, y: from.y };
    const leg = (tx, ty) => {
      const seg = Path.find(cur.x, cur.y, tx, ty, 'P', 'land');
      if (!seg || !seg.length || seg.length > Wh.detour) return false;
      const end = seg[seg.length - 1];
      if (end.x !== tx || end.y !== ty) return false;
      out.push(...seg); cur = { x: tx, y: ty };
      return true;
    };
    for (let k = 1; k < Wh.steps; k++) {
      const a = a0 - 2 * Math.PI * k / Wh.steps;   // round the hall the sun's way, as the screen sees it
      const tx = Math.floor(hx + Math.sin(a) * R), ty = Math.floor(hy + Math.cos(a) * R);
      if (tx === cur.x && ty === cur.y) continue;
      if (!Path.passable(tx, ty, 'P') || Bld.at(tx, ty)) continue;   // a tree on the ring: ride round it
      if (!leg(tx, ty)) return null;
    }
    if ((cur.x !== from.x || cur.y !== from.y) && !leg(from.x, from.y)) return null;
    return out.length >= Wh.steps / 2 ? out : null;
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
    if (this._swingUntil) img = this.swingFrame(u) || img;   // an engine set down swings its arm once
    const rank = u.vet ? 2 : u.ranked ? 1 : 0;
    if (u.spectral) { this.drawGhost(g, u, img, x, y, D); if (rank) this.drawRank(g, x, y, D, rank); return; }
    if (u.warWolf) this.drawCollar(g, u, x, y, D);     // under the wolf, as a ring on the ground is
    g.drawImage(img, x, y, D, D);
    if (rank) this.drawRank(g, x, y, D, rank);
  },
  /* THE ARM SWINGS ONCE AS IT LANDS (Trebuchet Battery, Siege Train — judge
     g3: "there is no sense of weight"): an engine set down by a card plays
     its own loosing strip (the fight sheet: the counterweight drops, the arm
     whips over) once through, from its first frame, at the unit pass's own
     draw (R's unit pass hands every unit to drawUnit while one is swinging).
     Render state only — a WeakMap keyed by the unit and a count that keeps
     the unit pass's fast path free the rest of the time; never in a save;
     the tap hits the same box (the strip's frames are the walk's size). */
  _swing: new WeakMap(), _swingUntil: 0, SWING_MS: 1100,
  swingAt(u, ms) {
    const t0 = performance.now(), d = ms || this.SWING_MS;
    this._swing.set(u, { t0, ms: d });
    this._swingUntil = Math.max(this._swingUntil, t0 + d);
  },
  // is any engine mid-swing? (the unit pass's one cheap question)
  swinging() { return this._swingUntil > performance.now(); },
  swingFrame(u) {
    const sw = this._swing.get(u);
    if (!sw) return null;
    const el = performance.now() - sw.t0;
    if (el >= sw.ms) { this._swing.delete(u); return null; }
    const ua = window.Assets && Assets.unitArt && (Assets.unitArt[R.unitArtKey(u)] || Assets.unitArt[u.kind]);
    const d = ua && ua.dirs && ua.dirs[R.unitFacing(u)], fr = d && d.fight;
    if (!fr || !fr.length) return null;
    return fr[Math.min(fr.length - 1, Math.floor(el / sw.ms * fr.length))];
  },
  // the player's tribe's dye ({body, accent}), as its tunics wear it
  dyeOf() { return (Sprites.tunicCol || {})[G.tunicOf('P')] || { body: '#3f6d99', accent: '#2c4e70' }; },
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

  /* THE BEAM THAT BRINGS EACH ONE (judges g2/g3, playtest g2): the summons
     came down in two beams for five men (four stacked in one column, a
     totem pole), each a pillar with a FLAT TOP 250 device px off the ground,
     the light a translucent hue laid over the meadow that went olive at its
     edges, the hall swallowed by a square-shouldered gold slab, confetti on
     the grass for seconds after — and every tier the same yellow. Now:
       ONE BEAM PER UNIT, on its own beat, running the FULL HEIGHT of the
         view down onto the slot (so it has no top to see), clipped to the
         board like every geometry pass;
       TAPERED IN HARD STEPS (beamTaper: the foot widest, three narrower
         courses as it climbs), its body OPAQUE stepped bands of the tier's
         own ramp — never alpha over grass — and it narrows away band by band
         (outer, middle, core, then the white thread) in about half a second;
       IT DROPS, then STRIKES: the leading edge falls from the top of the view
         in BEAM_T.drop, and the frame it lands is one white frame — the
         column and a burst at the feet — then a hard-pixel SHOCK RING runs
         out along the ground and a few clods are thrown, all gone within
         BEAM_T.ring (no confetti left on the grass after half a second);
       DRAWN IN THE GROUND PASS (a show's 'ground' layer), under every
         building and unit: the hall stands OVER the light, the soldier
         stands in front of his own, and only the foot burst is laid over
         him, for its one frame;
       THE TIER ESCALATES IN THE LIGHT ITSELF: bronze for the Bronze cards,
         steel-white for Iron, gold for Imperial, white-gold for the
         Enlightenment. */
  BEAM: {
    bronze: { ramp: ['#a2582a', '#d98c4e', '#f6c08a'], hot: '#fff0dc', ring: ['#b8642e', '#f6c08a'] },
    steel:  { ramp: ['#7a8ea6', '#b9c8da', '#e6eef8'], hot: '#ffffff', ring: ['#8ea2bc', '#eef4fb'] },
    gold:   { ramp: ['#c88a26', '#f2be4a', '#ffe7a2'], hot: '#fffbea', ring: ['#d89a30', '#ffe7a2'] },
    white:  { ramp: ['#e0c88a', '#f8ecc4', '#fffbf2'], hot: '#ffffff', ring: ['#ead8a4', '#fffbf2'] },
  },
  BEAM_T: { drop: 0.08, life: 0.5, ring: 0.34 },
  // the beam's width at h tiles above the feet, in hard steps
  beamTaper(h) { return h < 1.1 ? 1 : h < 2.4 ? 0.78 : h < 4.4 ? 0.58 : 0.42; },
  // one tapered column from `top` (world px) down to `foot`, `w` wide at the foot
  beamColumn(g, cx, foot, top, w) {
    const TL = CFG.TILE, steps = [[0, 1.1], [1.1, 2.4], [2.4, 4.4], [4.4, 1e4]];
    for (const [h0, h1] of steps) {
      const yb = this.snap(foot - h0 * TL), yt = Math.max(top, this.snap(foot - h1 * TL));
      if (yb <= yt) continue;
      const ww = Math.max(2, this.snap(w * this.beamTaper(h0)));
      g.fillRect(this.snap(cx - ww / 2), yt, ww, yb - yt);
    }
  },
  /* the arrivals of a show's units (s.units: {id, x, y, d — the beat it
     lands}) in `layer`: 'ground' the columns, the shock rings and the clods;
     'world' the one-frame burst at the feet. `tone` names a BEAM ramp;
     `wide` multiplies the width (an engine is a broad thing to set down). */
  arrive(g, s, layer, tone, wide) {
    const TL = CFG.TILE, P = this.BEAM[tone] || this.BEAM.gold, T = this.BEAM_T;
    const top = R.viewTiles().y0 * TL - TL;
    s.fl = s.fl || {};
    if (layer === 'world') {
      // the frame it lands: a white burst over the feet (one frame, by the
      // ground pass's own stamp — the same frame the column went white)
      for (const m of s.units) {
        if (s.fl[m.id] !== s.t) continue;
        const u = Units.get(m.id), x = (u ? u.x : m.x) * TL, y = (u ? u.y : m.y) * TL + TL * 0.3, k = this.engine(u) ? 1.5 : 1;
        g.fillStyle = P.hot; R.pxDisc(g, x, y - TL * 0.2, TL * 0.42 * k, 2, 0.8);
        g.fillStyle = '#ffffff'; R.pxDisc(g, x, y - TL * 0.2, TL * 0.24 * k, 2, 0.8);
        this.glint(g, x, y - TL * 0.55 * k, 4, '255,255,255', 1);
      }
      return;
    }
    if (layer !== 'ground') return;
    R.clipBoard(g, () => {
      for (const m of s.units) {
        const t = s.t - m.d;
        if (t < -T.drop || t > T.life + 0.1) continue;
        const u = Units.get(m.id), eng = this.engine(u) || (wide && wide > 1);
        const x = (u ? u.x : m.x) * TL, foot = (u ? u.y : m.y) * TL + TL * 0.3;
        const w = TL * 0.78 * (eng ? 1.6 : 1) * (wide || 1);
        if (t < 0) {
          // THE DROP: the leading edge falls out of the top of the view
          const bot = top + (foot - top) * (1 + t / T.drop);
          g.fillStyle = P.ramp[2]; g.fillRect(this.snap(x - w * 0.15), this.snap(top), Math.max(2, this.snap(w * 0.3)), Math.max(2, this.snap(bot - top)));
          g.fillStyle = P.hot; g.fillRect(this.snap(x - w * 0.15), this.snap(bot - 6), Math.max(2, this.snap(w * 0.3)), 6);
          continue;
        }
        // THE STRIKE: its first frame is white, then the bands go out in turn
        if (s.fl[m.id] == null) s.fl[m.id] = s.t;
        const first = s.fl[m.id] === s.t;
        const ph = first ? -1 : Math.floor(t / (T.life / 4));
        if (ph < 4) {
          const bands = first ? [[1.15, P.hot], [0.5, '#ffffff']] : [[1, P.ramp[0]], [0.62, P.ramp[1]], [0.34, P.ramp[2]]].slice(Math.max(0, ph));
          for (const [f, c] of bands) { g.fillStyle = c; this.beamColumn(g, x, foot, top, w * f); }
          g.fillStyle = P.hot; this.beamColumn(g, x, foot, top, 2 / this.beamTaper(0));
        }
        // the shock ring along the ground, and its trailing twin
        for (const [lag, c, sp] of [[0, P.ring[1], 1], [0.06, P.ring[0], 0.7]]) {
          const q = (t - lag) / T.ring;
          if (q < 0 || q >= 1) continue;
          const rx = TL * (0.3 + Math.pow(q, 0.6) * 1.15 * sp) * (eng ? 1.4 : 1);
          g.fillStyle = c; this.ellipseDots(g, x, foot, rx, rx * 0.42);
        }
        // a few clods thrown off the ground, up and back down
        const q = t / T.ring;
        if (q < 1) for (let k = 0; k < 7; k++) {
          const th = k * 0.897 + m.id * 1.3, dd = TL * (0.3 + q * (0.8 + (k % 3) * 0.2)) * (eng ? 1.3 : 1);
          g.fillStyle = k % 2 ? '#6b5236' : '#8a6c48';
          g.fillRect(this.snap(x + Math.cos(th) * dd), this.snap(foot + Math.sin(th) * dd * 0.42 - Math.sin(q * Math.PI) * 10), 2, 2);
        }
      }
    });
  },
  engine(u) { return !!u && Deck.fanClass(u.kind) === 'engine'; },
  // an ellipse's outline in touching 2px squares — a ring, never a dotted one
  ellipseDots(g, cx, cy, rx, ry) {
    const n = Math.max(16, Math.ceil(Math.PI * (rx + ry) / 2));
    let px = null, py = null;
    for (let k = 0; k < n; k++) {
      const th = k / n * Math.PI * 2, x = this.snap(cx + Math.cos(th) * rx), y = this.snap(cy + Math.sin(th) * ry);
      if (x === px && y === py) continue;
      g.fillRect(x, y, 2, 2); px = x; py = y;
    }
  },
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
  /* the army cards land on the FAN (Deck.summonFan) and hold there; the
     Stone tier's villagers (o.fan unset) keep the old doorstep muster */
  const summonCard = (id, list, o) => {
    const fan = o.fan && Deck.summonFan;
    const r = fan ? Deck.summonFan(list, { stagger: o.stagger, hold: o.hold, beam: o.flash, dust: o.dust, stamp: o.stamp, tone: o.tone })
      : Deck.summon(list, { stagger: o.stagger, hold: o.hold, together: o.together, flash: o.flash, dust: o.dust, stamp: o.stamp, tone: o.tone });
    if (!r.ok) return r;
    if (o.after) o.after(r);
    for (const k of o.voices || []) sound(k);
    if (o.horn && window.R && R.startHorn) R.startHorn(r.x, r.y);
    if (o.startle && window.R && R.startle) R.startle(r.x, r.y, o.startle);
    const units = fan ? r.units.map((u, i) => ({ id: u.id, x: u.x, y: u.y, d: r.at[i] })) : roster(r, o.stagger);
    // the muster's middle: the fan's own centre, or the old doorstep
    const mid = fan ? { x: units.reduce((a, m) => a + m.x, 0) / units.length, y: units.reduce((a, m) => a + m.y, 0) / units.length }
      : { x: r.first.x + 0.5, y: r.first.y + 0.5 };
    show(id, Object.assign({ x: r.x, y: r.y, mx: mid.x, my: mid.y, units, free: r.free }, o.data || {}));
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
      at: 'tc', N: 5, STAGGER: 100, HOLD: 1.2, KINDS: ['defender', 'defender', 'axeman', 'elite'],
      kind() {
        let lv = 0;
        for (const b of S.buildings) if (b.owner === 'P' && b.key === 'barracks' && Bld.done(b)) lv = Math.max(lv, b.level || 1);
        return this.KINDS[Math.min(3, lv)];
      },
      can() { return Deck.summonCan(this.kind()); },
      apply() {
        const k = this.kind();
        return summonCard('war_band', [{ kind: k, n: this.N }], {
          fan: true, stagger: this.STAGGER, hold: this.HOLD, voices: ['cardWarHorn'], horn: true, tone: 'bronze',   // the Bronze tier's light
          log: () => '⚔️ The war band: five ' + PLURAL[k] + ' march out of your Town Center.',
          msg: () => 'War Band: five ' + PLURAL[k] + ' march out of your Town Center.',
        });
      },
      // the horn's gold rings go out over the village (R.startHorn); five
      // bronze beams come down one after another, one on each man's place,
      // and the band holds its two ranks facing out before it is free
      show: {
        ms: 2000, layers: ['ground', 'world'],
        draw(g, s, p, dt, layer) {
          A.arrive(g, s, layer, 'bronze');
          if (layer === 'world') spears(g, s, 0.35);
        },
      },
    },

    /* BRONZE — Hunter's Pack: three war-wolves (the rules are on Deck above:
       PACK, packSense, packLeash, packHome; the look is drawCollar). Each
       one's own place by the hall (u.den) is where its march out ends. */
    hunters_pack: {
      at: 'tc', KIND: 'wolf', N: 3, STAGGER: 120, HOLD: 1.5,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        const P = Deck.PACK;
        return summonCard('hunters_pack', [{ kind: this.KIND, n: this.N }], {
          fan: true, stagger: this.STAGGER, hold: this.HOLD, voices: ['cardHowl'], startle: 12, dust: false, tone: 'bronze',
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
          // a wolf that landed on its den holds there; one whose place gave
          // way walks to its den when the hold lets it go
          if (t && t.type === 'muster') { t.x = d.x; t.y = d.y; if ((u.x | 0) !== d.x || (u.y | 0) !== d.y) t.stay = false; }
          else if (t && t.type === 'move' && (t.x !== d.x || t.y !== d.y)) { Units.moveTo(u, d.x, d.y); if (u.task) u.task.home = true; }
        }
      },
      /* AT HEEL: three bronze beams come down at the hall's side, one after
         another, and each wolf lands on its own place IN the beam — at heel,
         facing out, held there for its beat (FAN: hold) — and as it lands it
         HOWLS: one ring of hard pixels in the tribe's dye going out from its
         feet, and its breath rising off the muzzle. No boots, no dust
         (`dust: false`): the first cut's grey doorstep clouds were the loudest
         thing in the still, and the dash out to a den four tiles off — half
         off the screen — is gone with the march. */
      show: {
        ms: 2200, layers: ['ground', 'world'],
        draw(g, s, p, dt, layer) {
          A.arrive(g, s, layer, 'bronze');
          if (layer !== 'world') return;
          const TL = CFG.TILE, dye = Deck.dyeOf();
          for (const m of s.units) {
            const u = live(m.id), hq = (s.t - m.d - 0.15) / 0.6;
            if (!u || hq <= 0 || hq >= 1) continue;
            const r = TL * (0.35 + hq * 1.1);
            g.fillStyle = hq < 0.5 ? dye.body : dye.accent;
            A.ellipseDots(g, u.x * TL, u.y * TL + 6, r, r * 0.42);
            // its breath, rising off the muzzle in hard pale steps
            for (let k = 0; k < 3; k++) {
              const lift = (hq * 1.3 + k * 0.22) % 1;
              g.fillStyle = lift < 0.5 ? '#eeeae0' : '#c9c4b8';
              g.fillRect(A.snap(u.x * TL + (k - 1) * 3 + lift * 4), A.snap(u.y * TL - TL * 0.5 - lift * TL * 0.5), 2, 2);
            }
          }
        },
      },
    },

    /* IRON — Iron Legion: six Bronze Champions. Their arrival is a drum's:
       three deep beats under the horn, the ground answering each. */
    iron_legion: {
      at: 'tc', KIND: 'elite', N: 6, STAGGER: 100, HOLD: 1.2,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        return summonCard('iron_legion', [{ kind: this.KIND, n: this.N }], {
          fan: true, stagger: this.STAGGER, hold: this.HOLD, voices: ['cardWarHorn'], horn: true,
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
        ms: 2600, layers: ['ground', 'world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (layer === 'sky') {
            const hold = p < 0.06 ? p / 0.06 : p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.2);
            g.save(); A.skyClip(g); A.dim(g, hold > 0.5 ? 1 / 6 : hold > 0.01 ? 1 / 12 : 0, '12,10,8'); g.restore();
            A.edges(g, hold, '10,8,6', '200,214,236', 0.045);   // half the Imperial bars, a steel rule
            return;
          }
          // a drum on every other landing, the ground answering each
          if (layer === 'world') { A.beats(s, s.t, landings(s, 2), 3, 0.22, 'cardDrum'); shields(g, s, 0.4, 'steel'); }
          A.arrive(g, s, layer, 'steel');
        },
      },
    },

    /* IRON — Siege Train: a Catapult and a Ballista — the engines without the
       hall Lv 3 and the Workshop they normally need, which is the card. */
    siege_train: {
      at: 'tc', LIST: [{ kind: 'catapult', n: 1 }, { kind: 'ballista', n: 1 }], STAGGER: 450, HOLD: 1.2,
      can() { return Deck.summonCan('catapult'); },
      apply() {
        return summonCard('siege_train', this.LIST, {
          // the show lays its own (smaller) dust under each engine: the
          // doorstep's boot-dust on top of it buried them
          fan: true, stagger: this.STAGGER, hold: this.HOLD, voices: ['cardRumble'], dust: false,
          log: () => '🪨 A Catapult and a Ballista roll out of your Town Center.',
        });
      },
      // timber and iron: each engine set down hard in its own steel beam —
      // the ground shakes, the dust skids out from under it, sparks fly off
      // the axles — a tile and a half from its fellow
      show: {
        ms: 2600, layers: ['ground', 'world'],
        draw(g, s, p, dt, layer) {
          const TL = CFG.TILE;
          A.arrive(g, s, layer, 'steel');
          if (layer !== 'world') return;
          A.beats(s, s.t, landings(s, 1), 5, 0.4);
          skid(s); swing(s);
          g.save(); g.globalCompositeOperation = 'lighter';
          for (const m of s.units) {
            const q = (s.t - m.d) / 0.45;
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
      at: 'tc', LIST: [{ kind: 'elite', n: 5 }, { kind: 'marksman', n: 4 }, { kind: 'lancer', n: 3 }], STAGGER: 90, HOLD: 1.4,
      can() { return Deck.summonCan('elite'); },
      apply() {
        return summonCard('legion_marches', this.LIST, {
          fan: true, stagger: this.STAGGER, hold: this.HOLD, voices: ['cardFanfare'], horn: true, startle: 16,
          log: () => '🦅 The Legion marches: five Bronze Champions, four Fire Archers and three Lancers leave your Town Center.',
        });
      },
      /* THE HELD BEAT: the day dims and the bars close in; twelve gold beams
         come down one after another, each on its own place in the fan — the
         champions in front, the archers behind them, the lancers last — and
         the legion stands its ranks, stamping in step on the fanfare's drums,
         before the bars open and it is free where it stands. */
      show: {
        ms: 3400, layers: ['ground', 'world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (layer === 'sky') {
            const hold = p < 0.06 ? p / 0.06 : p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.2);
            g.save(); A.skyClip(g); A.dim(g, hold > 0.5 ? 1 / 6 : hold > 0.01 ? 1 / 12 : 0, '10,8,6'); g.restore();
            A.edges(g, hold);   // last: the bars are clean black over the light
            return;
          }
          A.arrive(g, s, layer, 'gold');
          if (layer !== 'world') return;
          // the first shake as the horn sounds; then the held ranks stamp in
          // step on the fanfare's drums (Sound cardFanfare)
          const st = stampBeats(s, 5, 0.42);
          A.beats(s, s.t, [0.02].concat(st), 4, 0.2, [null].concat(st.map(() => 'cardDrum')));
          spears(g, s, 0.35, 'gold');
          stamp(g, s, st);
        },
      },
    },

    /* IMPERIAL — Trebuchet Battery: two Trebuchets and a Siege Tower — the
       workshop's whole top tier, out of a hall that never built one. They
       come slow and heavy: a beat between each, the ground rolling. */
    trebuchet_battery: {
      at: 'tc', LIST: [{ kind: 'trebuchet', n: 2 }, { kind: 'siegetower', n: 1 }], STAGGER: 450, HOLD: 1.3,
      can() { return Deck.summonCan('trebuchet'); },
      apply() {
        return summonCard('trebuchet_battery', this.LIST, {
          fan: true, stagger: this.STAGGER, hold: this.HOLD, voices: ['cardFanfare'], horn: true, startle: 14,
          log: () => '🏰 Two Trebuchets and a Siege Tower roll out of your Town Center.',
        });
      },
      /* EACH ENGINE IS SET DOWN WITH ITS WEIGHT: a broad gold beam, the
         ground jolting (a hard shake), the dust skidding out from under it,
         and a trebuchet's arm swinging once over as if loosing — the timber's
         rumble under the first landing, a drum under every one after. */
      show: {
        ms: 3400, layers: ['ground', 'world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (layer === 'sky') {
            const hold = p < 0.08 ? p / 0.08 : p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.2);
            g.save(); A.skyClip(g); A.dim(g, hold > 0.5 ? 1 / 6 : hold > 0.01 ? 1 / 12 : 0, '10,8,6'); g.restore();
            A.edges(g, hold);
            return;
          }
          A.arrive(g, s, layer, 'gold');
          if (layer !== 'world') return;
          const at = landings(s, 1);
          A.beats(s, s.t, [0.02].concat(at), [0].concat(at.map(() => 7)), 0.45, [null].concat(at.map((x, i) => i ? 'cardDrum' : 'cardRumble')));
          skid(s);
          swing(s);
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
      at: 'tc', KIND: 'elite', N: 15, STAGGER: 200, HOLD: 1.4,
      can() { return Deck.summonCan(this.KIND); },
      apply() {
        const days = Deck.card('ancestors_host').days, was = !!Deck.timed('ancestors_host');
        // they rise on the fan, each from its own ground, and hold their
        // ranks until the last is up (Deck.summonFan; the rise is their beam)
        const r = Deck.summonFan([{ kind: this.KIND, n: this.N }], {
          stagger: this.STAGGER, hold: this.HOLD, lead: 0.25, beam: false, dust: false, stamp(u) { u.spectral = true; } });
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
        r.units.forEach((u, i) => { rise[u.id] = r.at[i]; });
        const mx = r.units.reduce((a, u) => a + u.x, 0) / r.units.length, my = r.units.reduce((a, u) => a + u.y, 0) / r.units.length;
        show('ancestors_host', { mode: 'rise', x: r.x, y: r.y, mx, my, free: r.free,
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

  /* the beats a show strikes on its units' landings: every `every`-th one
     (seconds after the play, as s.t runs) */
  function landings(s, every) {
    return s.units.filter((m, i) => i % (every || 1) === 0).map(m => m.d);
  }
  // `n` drums `gap` apart, starting a beat after the last one has landed
  function stampBeats(s, n, gap) {
    const last = s.units.length ? s.units[s.units.length - 1].d : 0;
    return Array.from({ length: n }, (x, k) => last + 0.18 + k * gap);
  }
  /* A SPEAR'S GLINT as each one lands — over its head, a hard four-point
     star in the tier's own hottest step, gone in `life` (opaque: a glint
     added over grass is a lime one) */
  function spears(g, s, life, tone) {
    const TL = CFG.TILE, P = A.BEAM[tone] || A.BEAM.bronze;
    for (const m of s.units) {
      const q = (s.t - m.d - 0.1) / life;
      if (q <= 0 || q >= 1) continue;
      const u = live(m.id);
      if (!u) continue;
      const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
      const x = A.snap(u.x * TL + D * 0.22), y = A.snap(R.frameTop(u.y, B, D) + D * 0.12), s2 = q < 0.4 ? 2 : 1;
      g.fillStyle = q < 0.5 ? P.hot : P.ramp[2];
      g.fillRect(x, y - s2 * 2, 2, s2 * 4 + 2); g.fillRect(x - s2 * 2, y, s2 * 4 + 2, 2);
    }
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
     lands, a big four-point flare on its shield-arm and a ring of hard
     pixels round the boss — one after another down the ranks, on the
     muster's own stagger. Opaque, in the tier's steel (cold light ADDED over
     the meadow went mint). */
  function shields(g, s, life, tone) {
    const TL = CFG.TILE, P = A.BEAM[tone] || A.BEAM.steel;
    for (const m of s.units) {
      const q = (s.t - m.d - 0.12) / life;
      if (q <= 0 || q >= 1) continue;
      const u = live(m.id);
      if (!u) continue;
      const img = R.unitSprite(u), B = R.unitBox(u), D = R.frameBox(u, img, B);
      const x = u.x * TL + D * 0.16, y = R.frameTop(u.y, B, D) + D * 0.56, k = q < 0.3 ? 5 : 3;
      g.fillStyle = q < 0.3 ? '#ffffff' : P.ramp[2];
      g.fillRect(A.snap(x), A.snap(y) - k * 2, 2, k * 4 + 2); g.fillRect(A.snap(x) - k * 2, A.snap(y), k * 4 + 2, 2);
      g.fillStyle = q < 0.5 ? P.ramp[2] : P.ramp[1];
      A.ellipseDots(g, x, y, 4 + q * TL * 0.45, (4 + q * TL * 0.45) * 0.8);
      if (q < 0.15) { g.fillStyle = '#ffffff'; R.pxDisc(g, x, y, 4, 2, 1); }
    }
  }
  /* THE DUST SKIDS OUT from under an engine as it is set down: a short
     streak of the place-dust thrown out behind it along the ground (away
     from the hall — the way it faces), one puff after another, once a show */
  function skid(s) {
    if (s.skid || !window.R || !R.startPlacePoof) return;
    s.skid = 1;
    for (const m of s.units) {
      const u = live(m.id);
      if (!u || !A.engine(u)) continue;
      let dx = m.x - s.x, dy = m.y - s.y;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      for (let k = 0; k < 3; k++)
        R.startPlacePoof(m.x - 0.5 - dy * (k - 1) * 0.55 + dx * 0.15 * k, m.y - 0.5 + dx * (k - 1) * 0.55 * 0.5 + dy * 0.15 * k, 1,
          { delay: m.d * 1000 + 30 + k * 70, scale: k === 1 ? 1 : 0.7 });
    }
  }
  /* …and AN ARM SWINGS ONCE as each throwing engine settles (Deck.swingAt:
     a trebuchet's counterweight drops and its arm whips over, a catapult's
     arm kicks up), a beat after it lands, once a show */
  function swing(s) {
    s.sw = s.sw || {};
    for (const m of s.units) {
      if (s.sw[m.id] || s.t - m.d < 0.12) continue;
      s.sw[m.id] = 1;
      const u = live(m.id);
      if (u && (u.kind === 'trebuchet' || u.kind === 'catapult')) Deck.swingAt(u);
    }
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

  /* THE RANKS STAMP IN STEP: on each drum of the held beat every man's feet
     throw a small ring of dust along the ground — touching hard pixels in
     the earth's own browns, opaque (a translucent dust ring over the meadow
     is an olive one), gone before the next drum */
  function stamp(g, s, at) {
    const TL = CFG.TILE;
    for (const b0 of at) {
      const q = (s.t - b0) / 0.2;
      if (q <= 0 || q >= 1) continue;
      g.fillStyle = q < 0.5 ? '#9a7a52' : '#7a5e3e';
      for (const m of s.units) {
        const u = live(m.id);
        if (!u) continue;
        const r = TL * (0.28 + q * 0.32);
        A.ellipseDots(g, u.x * TL, u.y * TL + TL * 0.32, r, r * 0.4);
      }
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
  /* …now: five steel beams, a rider landing in each on its place by the hall;
     the moment the last is down they BURST OUT and wheel once round the hall
     together at a gallop (Deck.fanWheel), the drum of hooves in the ground
     and a trail of kicked-up dust behind every horse — hard clods of earth
     in three browns, thrown up and settling, laid in the ground pass under
     the horses — and pull up on their places. */
  if (Deck.FX.swift_raiders) Deck.FX.swift_raiders.show = {
    ms: 3600, layers: ['ground', 'world'],
    draw(g, s, p, dt, layer) {
      if (s.units) A.arrive(g, s, layer, 'steel');   // the Iron tier's steel light
      if (layer === 'ground') { hoofDust(g, s); return; }
      if (layer !== 'world') return;
      // a gallop: a stride on every beat of the wheel, the ground felt under the first four
      const go = s.go != null ? s.go : 0.2, at = [0, 1, 2, 3, 4, 5, 6].map(k => go + k * 0.34);
      A.beats(s, s.t, at, [2, 2, 2, 1.5, 0, 0, 0], 0.15, 'cardHoof');
    },
  };
  /* THE DUST OFF EVERY HORSE: a few positions behind each galloping rider
     (sampled on the show, render state), each a clump of hard 2px squares
     thrown up behind the hooves and settling as it ages — opaque, in the
     earth's own browns (a translucent dust over the meadow is olive) */
  function hoofDust(g, s) {
    const TL = CFG.TILE, T = s.trail || (s.trail = {});
    for (const id of s.ids || []) {
      const u = live(id), tr = T[id] || (T[id] = []);
      if (u && u.task && u.task.gallop && Units.moving(u) && (!tr.length || s.t - tr[tr.length - 1].t >= 0.05)) tr.push({ x: u.x, y: u.y, t: s.t });
      while (tr.length && s.t - tr[0].t > 0.6) tr.shift();
      R.clipBoard(g, () => {
        for (const q of tr) {
          const a = s.t - q.t, h = (Math.imul(id * 31 + ((q.t * 100) | 0), 0x9e3779b1) >>> 0);
          const n = a < 0.15 ? 4 : a < 0.35 ? 3 : 2;
          g.fillStyle = a < 0.15 ? '#c9ad80' : a < 0.35 ? '#a6885e' : '#7f6646';
          for (let k = 0; k < n; k++) {
            const ox = (((h >>> (k * 4)) & 15) - 7.5) * 0.9, oy = (((h >>> (k * 4 + 2)) & 7) - 3.5) * 0.6;
            g.fillRect(A.snap(q.x * TL + ox), A.snap(q.y * TL + TL * 0.3 + oy - a * 10), a < 0.2 ? 4 : 2, a < 0.2 ? 4 : 2);
          }
        }
      });
    }
  }
}
