"use strict";
/* THE CARD SYSTEM — the effects (tests/deck-fx.mjs). One entry per card in
   Deck.FX (the contract is in js/deck.js): can() says whether it may be
   played now and why not, valid(x, y) whether an aimed card may land there,
   warn(tgt) what the player must be told before it does, apply(tgt) makes it
   happen and returns {ok, why, …extras for the play animation}, `at` is
   where that animation bursts ('bar' | 'tc' | 'target'), end(entry) runs
   when a timed card's days are up.

   An aimed card's `tgt` is a WORLD POINT in tile units ({x: 12.5, y: 7.5}
   is the middle of tile 12,7) — the strike lands exactly there, so a tap
   is aimed where the finger was, not snapped to a tile. What apply() hands
   the play animation (js/deckui.js) beside {ok}:
     forager_cache     fly: {food: 250}     the goods, to fly into the bar
     harvest_festival  until                the game day it runs out
     swift_raiders     x, y, units          the hall's middle, the riders' ids
                                          (and every card in js/deckfx-army.js
                                          that summons: Deck.summon)
     starfall          x, y, lands          where it strikes, seconds to the blow
     dragonfire        x, y, lands          where it burns, seconds to the breath
   A refusal is {ok: false, why} and the card stays in the hand (Deck.play).

   Under the five cards of the slice sits THE ENGINE every later card plugs
   into, assigned onto Deck here so the game's hooks ask one global:

     Deck.mult(kind, owner, ctx)  the product of every LIVE timed card's
                                  multiplier for that kind of work —
                                  'gather' (Units.gatherYield: hand gathering,
                                  both fishings, the meat of a kill — a YIELD
                                  on the credit, never the pace), 'produce'
                                  (Bld.dailyProduction, the rival hall's
                                  trickle, Units.workReport's station line)
                                  and 'build' (Deck.buildRate,
                                  js/deckfx-growth.js); two DIFFERENT live
                                  cards multiply, the same card extends
     Deck.cue(name)               whether a live timed card wants a world cue
                                  drawn (R.drawCardWorld)
     the STRIKE slot              S.deck.strike: one thing falling out of the
                                  sky at a time, on sim time, riding the save
     the BLAST                    who a strike reaches, and the one rule that
                                  keeps a card from ever razing a Town Center

   FOUR RULES, each a promise the approved design makes:
   1. A CARD IS A PLAYER'S ACT, NOT THE WORLD'S. Its kills are kills and its
      razes are razes (Units.damage / Bld.damage with the player as the hand),
      but nothing a card summons ever scores as if the world had sent it — a
      card's dragon never sets dragonSeen, never calls G.specialFired, and
      never touches the rolled event's own state (S.starfall stays the run's).
   2. A STRIKE IS AN ATTACK ORDER. Aimed at the rival during the Calm truce it
      ENDS the truce, at the play, exactly as an attack order does — and warn()
      says so before the player confirms.
   3. NO ONE-CARD WINS. A strike can bring the rival's hall low, never down.
   4. NOTHING HERE DRAWS FROM THE RUN'S RNG (S.rngState) — the borrowed
      dragon act included: G.dragonTick draws a CARD's dragon's fire line and
      ash (the flames' jitter, their lifetimes, the piles') from Math.random
      (`ev.card ? Math.random : G.rand`), so a card never re-deals the rest of
      the run; only the ROLLED dragon keeps the G.rand draws it always made.

   Effects already in a run's state run to their end whatever the kill switch
   says — the switch gates PLAYING (js/deck.js canPlay), the same way the
   core's Deck.tick expires a timer it finds in a save. With the switch off no
   play can happen, so no state can exist, so every hook below answers exactly
   what the game answered before cards existed (tests/deck-fx.mjs pins it). */

/* ---------------- THE ENGINE ---------------- */
Object.assign(Deck, {
  /* THE MULTIPLIER. Each live entry of S.deck.fx whose card declares
     `mult[kind]` multiplies in: a NUMBER is the player's own work and only
     the player's (the festival); a FUNCTION (owner, ctx, entry) → factor is
     for a card that reaches part of a town or the rival's (ground near the
     hall, a blight). `ctx` is what the work is done by or at — the unit for
     'gather', a {x, y, res} point for a kill's meat, the building for
     'produce' and 'build' (the rival's hall for its trickle). Asked per
     gatherer per frame, so the fast path is the whole
     cost of a run with no card running: one length check. A timer is live
     until `until` even if the expiry pass (Deck.tick) runs a frame later. */
  mult(kind, owner, ctx) {
    const fx = typeof S !== 'undefined' && S && S.deck && S.deck.fx;
    if (!fx || !fx.length) return 1;
    const now = this.now();
    let m = 1;
    for (const e of fx) {
      if (!(e.until > now)) continue;
      const d = this.FX[e.id], r = d && d.mult && d.mult[kind];
      if (r == null) continue;
      m *= typeof r === 'function' ? r.call(d, owner, ctx, e) : (owner === 'P' ? r : 1);
    }
    return m;
  },
  /* THE ART A HELD CARD WILL NEED. A card whose act draws a monster names
     its art set (`art`, an Assets.FX_SETS key — 'dragon', 'kraken'), and the
     set is asked for at HIGH priority the moment the player HOLDS the card:
     the deck built or opened (DeckUI), the card lifted, a run founded or
     loaded with it in the collection (G.warmFx). Asked at the aim or the
     play, on a phone's cold cache it queued behind the whole boot and the
     act opened on the procedural stand-in. `id` narrows it to one card;
     a card not held asks nothing. Draws no RNG, writes nothing to S. */
  wantArt(id) {
    if (typeof Assets === 'undefined' || !Assets.wantFx) return;
    for (const k of id ? [id] : Object.keys(this.FX)) {
      const fx = this.FX[k];
      if (fx && fx.art && this.count(k) > 0) Assets.wantFx(fx.art, { prio: 'high' });
    }
  },
  // a live timed card that asks for a world cue by name (R.drawCardWorld)
  cue(name) {
    const fx = typeof S !== 'undefined' && S && S.deck && S.deck.fx;
    if (!fx || !fx.length) return false;
    const now = this.now();
    return fx.some(e => e.until > now && this.FX[e.id] && this.FX[e.id].cue === name);
  },

  /* THE STRIKE SLOT. A card that comes out of the sky holds ONE slot in the
     run's state: { id, n, x, y, phase: 'fall' | 'down', t }. It rides every
     save, so a star caught mid-air in a save lands after the load; its clock
     runs on SIM time (G.frame), so a pause holds it in the sky. The card
     says how long each beat lasts (FALL_S, DOWN_S) and what the blow does
     (impact, called once, on the frame it lands). `n` tells one strike's
     sky from the next (R.drawCardStrike); the sky itself is render state. */
  strikeTick(dt) {
    const st = S.deck && S.deck.strike;
    if (!st) return;
    const fx = this.FX[st.id];
    if (!fx || !fx.impact) { S.deck.strike = null; return; }
    st.t += dt;
    if (st.phase === 'fall') {
      if (st.t >= fx.FALL_S) {
        st.phase = 'down'; st.t = 0;
        // the blow is dealt once; a fault in its pictures or sound must not
        // take the rest of the frame's world block down with it
        try { fx.impact(st); } catch (e) { console.error('card strike', st.id, e); }
      }
    } else if (st.t >= fx.DOWN_S) S.deck.strike = null;
  },
  // the ground a card's act keeps in sight while it plays (G.updateVisibility
  // lights only tiles already explored — a card never charts the map)
  sights() {
    const out = [], st = S.deck && S.deck.strike, ev = S.dragon && S.dragon.ev;
    const sf = st && this.FX[st.id];
    if (sf && sf.SIGHT) out.push({ x: st.x | 0, y: st.y | 0, r: sf.SIGHT });
    if (ev && ev.card) out.push({ x: ev.card.x | 0, y: ev.card.y | 0, r: this.FX.dragonfire.SIGHT });
    return out;
  },

  /* WHO A STRIKE REACHES. A strike is an explicit order, the same act as a
     tap on a foe: it reaches the rival's people and works and the
     barbarians' (whichever town a band was marching on — a tap reaches them
     too), never the wilds and never the player's own. The tribe-level funnel
     is still asked (Combat.hostile — never a hand-rolled owner check), so
     while the Calm truce holds the rival is no target at all: a strike aimed
     at it ends the truce at the play (truce(), BEFORE any blow is dealt), and
     one aimed at barbarians alone spares a rival who wanders into the blast.
     That order is load-bearing: the truce's safety net lives in Units.damage
     alone — Bld.damage never ends the peace, it only rings the rival's alarm
     — so a strike that reached a rival building at peace would shell a town
     whose army is forbidden to answer. */
  foe(owner) { return (owner === 'A' || owner === 'R') && Combat.hostile('P', owner); },
  // distance from a point to a building's footprint — 0 anywhere on it, so a
  // 2x2 hall is struck by the blast that touches its corner, like a hut is
  bldDist(b, x, y) {
    const s = Bld.size(b);
    return Math.hypot(Math.max(b.x - x, 0, x - (b.x + s)), Math.max(b.y - y, 0, y - (b.y + s)));
  },
  // what a blast at (x, y) reaches: units within ur, buildings within br. The
  // gold mine is never in it: its works change hands, they never come down.
  blast(x, y, ur, br, who) {
    who = who || (o => this.foe(o));
    const units = [], blds = [];
    for (const u of S.units) {
      if (!who(u.owner)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d <= ur) units.push({ u, d });
    }
    for (const b of S.buildings) {
      if (!who(b.owner) || !Bld.attackable(b)) continue;
      const d = this.bldDist(b, x, y);
      if (d <= br) blds.push({ b, d });
    }
    return { units, blds };
  },
  /* NO ONE-CARD WINS. The rival's hall takes at most `cap` of its full
     strength from one card and never its last sliver — it is left standing
     for an army to take. The clamp is applied HERE, before Bld.damage is
     asked anything, so it holds whatever the cause: Bld.damage's own rival
     ending is skipped for the wilds' 'fire', which would take a hall off the
     board and leave the run going against a rival with none. The card
     strikes name their own causes ('starfall', 'dragonfire') and never
     'fire' — a strike is the player's blow, not a summer's — so everything
     else takes the blow as it lands, through Bld.damage: the rival's alarm,
     the razed credit and the chief's ledger of burned ground all follow, as
     they would from a catapult. */
  hitBld(b, amt, cap, cause) {
    if (b.owner === 'A' && b.key === 'tc') amt = Math.min(amt, cap * b.maxhp, b.hp - 1);
    if (amt > 0) Bld.damage(b, amt, cause);
  },
  TRUCE: 'This ends the truce — from today the rival fights back.',
  /* WHETHER A STRIKE REACHES THE RIVAL is asked of what the PLAYER KNOWS,
     never of S: a rival unit on ground in sight now, or a rival building
     the player's own memory holds (S.map.seenB — kept in step with every
     building while it is in sight, so a building in view is in it too).
     The warning is re-asked on every move of the mark (js/deckui.js
     _aimSync), so a read of hidden state here would sweep the fog like a
     lamp — and the truce's END asks the same question, so a card never
     breaks the peace over a soldier the player never saw. A hidden rival
     thing in the blast is spared all the same while the truce holds: the
     blow asks Combat.hostile (foe()), and at peace the rival is no target. */
  reachesRival(tgt, ur, br) {
    for (const u of S.units) {
      if (u.owner !== 'A' || Math.hypot(u.x - tgt.x, u.y - tgt.y) > ur) continue;
      if (G.visibleAt(Math.floor(u.x), Math.floor(u.y))) return true;
      // …or one the player sees through a SPY in their hall (js/deckfx-rival.js)
      if (this.spySees && this.spySees(u)) return true;
    }
    const seen = S.map && S.map.seenB, W = CFG.W;
    if (seen) for (const k in seen) {
      const m = seen[k];
      if (!m || m.owner !== 'A' || m.key === 'mine') continue;
      const s = Bld.size(m.key), bx = k % W, by = (k / W) | 0;
      if (this.bldDist({ x: bx, y: by, sz: s, key: m.key }, tgt.x, tgt.y) <= br) return true;
    }
    return false;
  },
  truceWarn(tgt, ur, br) { return S.peace && tgt && this.reachesRival(tgt, ur, br) ? this.TRUCE : null; },
  truce(tgt, ur, br) { if (S.peace && this.reachesRival(tgt, ur, br)) G.breakPeace(); },
  // an aimed strike lands on the board, on ground the player has seen — with
  // their own people's eyes, never a card's map (Deck.eyesAt, js/deckfx-rival.js)
  ground(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    return MapGen.onBoard(tx, ty) && (this.eyesAt ? this.eyesAt(tx, ty) : !!S.map.explored[MapGen.idx(tx, ty)]);
  },
  /* THE MUSTER: every card that brings people out of the Town Center comes
     through here (Swift Raiders, js/deckfx-army.js's eight). `list` is
     [{kind, n}] in marching order; `opts`:
       stamp(u, i)   marks a unit as the card's own (a war-wolf, a ghost)
       stagger (ms)  the flashes come one after another, this far apart, and
                     each unit is not drawn until its own (R.startSummon)
       hold (s)      the first stands in its light this long before the march
       together      the whole muster waits for its last flash and marches
                     as one (the held beat of the Imperial and Enlightenment
                     cards); otherwise each goes on its own beat
       flash         false: the card draws its own arrival (the ghosts rise)
       dust          false: no boots, no doorstep dust (the war-wolves)
       march         false: they stay where they arrived
     Four promises, each one a fault the obvious version had:
     1. REALLY OPEN GROUND (Bld.spawnRoom, tests/train-spawn.mjs), the first
        on the very doorstep a trained unit takes (Bld.spawnSpotAt), the rest
        on the next open tiles round it — and only tiles the first can WALK
        to (Path.reachFrom), so nobody is put down across a stream.
     2. NEVER ONE STACK. Bld.spawnSpotAt asks only the ground, never who is
        standing on it, so asked fifteen times it answers one tile fifteen
        times. One unit per tile; on a doorstep too cramped for all of them
        the tiles found are shared round in turn, never piled on the first.
     3. A CARD'S SOLDIER IS NOT A TRAINED ONE. Units.spawn(…, {card: true})
        keeps the origin card's stamps (Ironhand, Horselord) and never takes
        a blade of Starfall's sky-iron, which belongs to soldiers the yards
        raise; nothing here counts as training (S.stats.trained).
     4. THE CARD'S OWN WORDS ON REFUSAL: no hall, or no open ground in reach,
        and the card is kept (Deck.play) with the reason in as many words.
     They count as population and eat like any of their kind, and may take
     the town over its cap — training simply waits (Units.spawn never checks
     the cap); a card that says otherwise stamps them so (the war-wolves,
     the host). Then they MARCH OUT in formation, a few tiles beyond the
     doorstep, as the Returning Sons march in. */
  summonDoor(kind) {
    const tc = Bld.tcOf('P');
    if (!tc) return { why: 'Your Town Center must stand.' };
    const first = Bld.spawnSpotAt('P', kind || 'defender', tc.x, tc.y + Bld.size(tc));
    if (!first) return { why: 'There is no open ground beside your Town Center.' };
    return { tc, first };
  },
  summonCan(kind) {
    const d = this.summonDoor(kind);
    return d.why ? { ok: false, why: d.why } : { ok: true };
  },
  SUMMON_MUSTER: 3,
  summon(list, opts) {
    opts = opts || {};
    const kinds = [];
    for (const g of list) for (let k = 0; k < g.n; k++) kinds.push(g.kind);
    const d = this.summonDoor(kinds[0]);
    if (d.why) return { ok: false, why: d.why };
    const { tc, first } = d, W = CFG.W;
    const sx = tc.x, sy = tc.y + Bld.size(tc);
    const reach = Path.reachFrom([first]);
    const used = new Set(), spots = [], units = [];
    const stag = opts.stagger || 0;
    for (let i = 0; i < kinds.length; i++) {
      const s = i === 0 ? first : (MapGen.findNear(sx, sy, Bld.SPAWN_R,
        (x, y) => !used.has(y * W + x) && (!reach || !!reach[y * W + x]) && Bld.spawnRoom('P', 'land', x, y)) || spots[i % spots.length]);
      if (!used.has(s.y * W + s.x)) { used.add(s.y * W + s.x); spots.push(s); }
      const u = Units.spawn(kinds[i], 'P', s.x, s.y, { card: true });
      if (opts.stamp) opts.stamp(u, i);
      units.push(u);
      // each arrives in a shaft of light and kicks up the doorstep's dust
      // (render one-shots — never in S)
      if (window.R && opts.flash !== false) {
        if (R.startSummon) R.startSummon(u.x, u.y, i * stag, stag ? u.id : 0, opts.tone);   // the tier's light (R.LIGHT.TONE; gold unless named)
        if (R.startPlacePoof && i < 8 && opts.dust !== false) R.startPlacePoof(s.x, s.y, 1, { delay: i * Math.max(60, stag), scale: 0.8 });
      }
    }
    if (opts.march !== false) {
      const m = this.summonMuster(tc, first, opts.muster || this.SUMMON_MUSTER);
      if (m) {
        Units.formationMove(units, m.x, m.y, 'land');
        // a STAGGERED muster stands each unit in its own light until its beat
        // has come and gone, then marches it to the slot it was dealt
        if (stag || opts.hold)
          for (let i = 0; i < units.length; i++) {
            const u = units[i], t = u.task;
            if (!t || t.type !== 'move') continue;
            u.task = { type: 'muster', x: t.x, y: t.y, wait: (opts.hold || 0) + (opts.together ? units.length - 1 : i) * stag / 1000 };
            u.path = null; u.pathI = 0;
          }
      }
    }
    return { ok: true, units, tc, first, x: Bld.cx(tc), y: Bld.cy(tc) };
  },
  // a few tiles straight out from the hall through the doorstep, on ground
  // the muster can actually walk to; null leaves them where they arrived
  summonMuster(tc, from, dist) {
    let dx = from.x + 0.5 - Bld.cx(tc), dy = from.y + 0.5 - Bld.cy(tc);
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const reach = Path.reachFrom([from]);
    return MapGen.findNear(Math.round(from.x + dx * dist), Math.round(from.y + dy * dist), dist,
      (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y) && !!reach && !!reach[y * CFG.W + x] &&
        Math.hypot(x - from.x, y - from.y) >= 2);
  },

  /* What a card did goes in the event log, never in a toast: the play
     animation IS the announcement (js/deckui.js), and a toast over it would
     say it twice. The narration of an act still unfolding — the star
     landing, the dragon's ash — toasts, as the world's own events do, but
     in the NOTE style: the red alarm is for being attacked, never for the
     player's own blow. A strike whose act narrates itself says so
     (`narrates`) and its landing toast stands down (DeckUI._land): the
     card's name, the act's line and a second line stacked three deep over
     the world on a phone. One play, one toast — the result. */
  say(msg) {
    S.log.unshift({ day: S.day, msg });
    if (S.log.length > 60) S.log.pop();
  },
});

/* ---------------- THE CARDS ---------------- */
Object.assign(Deck.FX, {
  /* STONE — Forager's Cache: +250 food, flown into the bar. */
  forager_cache: {
    at: 'bar', FOOD: 250,
    can() { return { ok: true }; },
    apply() {
      S.res.food += this.FOOD;
      Deck.say('🧺 A forager’s cache: +' + this.FOOD + ' food.');
      return { ok: true, fly: { food: this.FOOD } };
    },
  },

  /* BRONZE — Harvest Festival lives with the other cards of richer work and
     faster building (js/deckfx-growth.js). */

  /* IRON — Swift Raiders: five Horse Archers ride out of the Town Center,
     through the muster every summoning card shares (Deck.summon: really open
     ground, one rider per tile, no sky-iron, the card's own refusals). They
     come out together — riders do not wait in line — and ride straight out
     to the muster under the drum of their own hooves. Kills they make are
     ordinary kills; raising them is not training, so no "units trained"
     point is earned by the card. */
  swift_raiders: {
    at: 'tc', KIND: 'horsearcher', N: 5, STAGGER: 90, HOLD: 1.2,
    can() { return Deck.summonCan(this.KIND); },
    apply() {
      // they land on the army's fan round the hall (Deck.summonFan,
      // js/deckfx-army.js) — guarded on the method, the shared-?v= lesson
      const fan = !!Deck.summonFan;
      const r = fan ? Deck.summonFan([{ kind: this.KIND, n: this.N }], { stagger: this.STAGGER, hold: this.HOLD, tone: 'steel' })
        : Deck.summon([{ kind: this.KIND, n: this.N }]);
      if (!r.ok) return r;
      if (typeof Sound !== 'undefined') Sound.play('train');   // the hooves are struck on the show's beats
      const mid = fan ? { x: r.units.reduce((a, u) => a + u.x, 0) / r.units.length, y: r.units.reduce((a, u) => a + u.y, 0) / r.units.length }
        : { x: r.first.x + 0.5, y: r.first.y + 0.5 };
      if (window.R && R.startCardShow) R.startCardShow('swift_raiders', { x: r.x, y: r.y, ids: r.units.map(u => u.id), at: r.at, free: r.free,
        units: r.units.map((u, i) => ({ id: u.id, x: u.x, y: u.y, d: r.at ? r.at[i] : 0 })), mx: mid.x, my: mid.y });
      Deck.say('🏹 Five Horse Archers ride out of your Town Center.');
      return { ok: true, x: r.x, y: r.y, units: r.units.map(u => u.id) };
    },
  },

  /* IMPERIAL — Starfall: a falling star strikes the chosen ground. 900 to
     every enemy building within 2 tiles of it, falling linearly to half at
     the edge; 250 to every enemy unit within 3, FLAT (the approved text: 250
     kills every unit in the game but a siege engine, edge included); the player's
     own spared; the rival's hall loses at most 40% of its strength. It comes
     down through the rolled event's own fall (R.starAct) on its OWN state
     (S.deck.strike) — S.starfall, the run's rolled star, is never touched,
     no seams are written and no claim race is started — and its fall is
     SHORT: the blow lands as the play animation ends. While the run's own
     star is falling, or another strike is still landing, it waits (kept). */
  starfall: {
    at: 'target', radius: 3, inner: 2,   // the aim's rings: the units' reach and the buildings'
    narrates: true,       // its blow says what it did (impact): no landing toast (Deck.say)
    FALL_S: 1.3,          // the meteor's streak, sky to ground (the event's takes CFG.STARFALL.fallS 3.6)
    DOWN_S: 3,            // the beat after the blow: the dark lifts, the ground stays in sight
    DIM_IN: 0.35, DIM_HOLD: 0.8,   // the night deepens with the fall and lifts after the blow (R.cardStarDim)
    SMOKE: 0.12,          // a puff off the scorch every this many seconds while it is down
    SIGHT: 4,             // the ground kept in sight round the strike while it lands
    BLD_R: 2, BLD: [900, 450],    // buildings: within 2 tiles, 900 at the heart to 450 at the edge
    UNIT_R: 3, UNIT: 250,         // units: within 3 tiles, 250 flat — the card's own words, no falloff
    TC_CAP: 0.4,                  // the rival's hall loses at most 40% of its max strength
    can() {
      if (S.starfall && S.starfall.phase === 'fall') return { ok: false, why: 'A star is already falling.' };
      if (S.deck && S.deck.strike) return { ok: false, why: 'The last strike is still landing.' };
      return { ok: true };
    },
    // the meteor, the blow and the smoke are the event's art, fetched on
    // demand; aiming the card is the moment to ask, a tap before it falls
    prepare() { if (window.Assets && Assets.wantFx) Assets.wantFx('starfall'); },
    valid(x, y) { this.prepare(); return Deck.ground(x, y); },
    warn(tgt) { return Deck.truceWarn(tgt, this.UNIT_R, this.BLD_R); },
    apply(tgt) {
      const ok = this.can();
      if (!ok.ok) return ok;
      this.prepare();
      Deck.truce(tgt, this.UNIT_R, this.BLD_R);
      Deck.run().strike = { id: 'starfall', n: Deck.playedCount(), x: tgt.x, y: tgt.y, phase: 'fall', t: 0 };
      Deck.say('☄️ You chose where the star would land.');
      return { ok: true, x: tgt.x, y: tgt.y, lands: this.FALL_S };
    },
    impact(st) {
      const fall = (ab, d, r) => ab[0] + (ab[1] - ab[0]) * Math.min(1, d / r);
      const hit = Deck.blast(st.x, st.y, this.UNIT_R, this.BLD_R);
      let razed = 0, slain = 0;
      for (const { b, d } of hit.blds) {
        Deck.hitBld(b, Math.round(fall(this.BLD, d, this.BLD_R)), this.TC_CAP, 'starfall');
        if (b.hp <= 0) razed++;
      }
      for (const { u } of hit.units) {
        Units.damage(u, this.UNIT, 0, 'P');
        if (u.hp <= 0) slain++;
      }
      // the blow on the ground: the bombard's own scorch and dust, the
      // event's dust ring, the birds; the flash and the shake are the sky's
      // (R.starAct, the frame it lands)
      if (window.R) {
        if (R.impact) R.impact(st.x, st.y, 'stone', 'blast');
        if (R.startPlacePoof) { R.startPlacePoof(st.x - 1, st.y - 1, 2); R.startPlacePoof(st.x - 1, st.y - 1, 2, { delay: 260, scale: 0.7 }); }
        if (R.startle) R.startle(st.x, st.y, 16);
      }
      if (typeof Sound !== 'undefined') Sound.play('impact');
      const n = hit.blds.length + hit.units.length;
      G.log(n ? '☄️ The star strikes! ' + n + ' of theirs caught in the blast' +
          (razed + slain ? ' — ' + (razed ? razed + ' building' + (razed > 1 ? 's' : '') + ' down' : '') +
            (razed && slain ? ', ' : '') + (slain ? slain + ' slain' : '') : '') + '.'
        : '☄️ The star strikes — and finds nothing of theirs there.', 'note', 6000);   // the player's blow: never the alarm
    },
  },

  /* ENLIGHTENMENT — Dragonfire: the black dragon flies in to the chosen
     ground. Every enemy unit within 3 tiles of it burns to ash (any kind,
     the rival's and the barbarians'), every enemy building within 2.5 takes
     1,200 fire damage — the rival's hall at most half its strength — and the
     line of fire burns on behind it. The event's own dragon is borrowed
     (S.dragon.ev, flagged `card`, G.dragonTick does the flying): called in
     CLOSE, not from the world's edge, so it is breathing within FLY_S of the
     play. Its victims are whoever stands in the fire as the breath begins
     (breathe(), called from G.dragonTick) and they die through Units.damage
     — kills, with the chief's ledger — where the event's are taken off the
     board without a word. The rolled dragon's avail/done are never touched,
     so a run that rolled one still has it; while either dragon is on the
     wing the card waits (kept). */
  dragonfire: {
    at: 'target', radius: 3, inner: 2.5,
    narrates: true,       // its ash says what it did (G.dragonTick): no landing toast (Deck.say)
    FLY_S: 1.2,           // the fly-in: G.dragonTick flies 9 tiles/s and breathes 2.5 short of its mark
    UNIT_R: 3, BLD_R: 2.5, BLD: 1200, TC_CAP: 0.5, SIGHT: 4,
    // the strafe lays its fire from 0.4 tiles short of its mark to ~5 past it
    // (3.2 tiles/s for 1.7s): aimed 2.3 short, the line runs THROUGH the ground chosen
    LEAD: 2.3,
    can() {
      if (S.dragon && S.dragon.ev) return { ok: false, why: 'The dragon is already on the wing.' };
      return { ok: true };
    },
    // the beast's own art (js/beasts.js): asked the moment the card is HELD
    // (Deck.wantArt), and again — high, a no-op once asked — at the aim
    art: 'dragon',
    prepare() { if (window.Assets && Assets.wantFx) Assets.wantFx('dragon', { prio: 'high' }); },
    valid(x, y) { this.prepare(); return Deck.ground(x, y); },
    warn(tgt) { return Deck.truceWarn(tgt, this.UNIT_R, this.BLD_R); },
    apply(tgt) {
      const ok = this.can();
      if (!ok.ok) return ok;
      this.prepare();
      Deck.truce(tgt, this.UNIT_R, this.BLD_R);
      if (!S.dragon) S.dragon = { avail: false, done: false, ev: null, ash: [], fire: [] };
      // it comes in from the nearer side of the world, as the event's does
      const dir = tgt.x < CFG.W / 2 ? 1 : -1, tx = tgt.x - dir * this.LEAD;
      S.dragon.ev = { phase: 'fly', t: 0, x: tx - dir * (2.5 + 9 * this.FLY_S), y: tgt.y - 3, tx, ty: tgt.y, dir,
        victims: [], card: { x: tgt.x, y: tgt.y } };
      Deck.say('🐉 You called, and the black dragon answered.');
      return { ok: true, x: tgt.x, y: tgt.y, lands: this.FLY_S };
    },
    /* the breath begins: who stands in the fire now burns, and what it
       reaches is marked to catch — each building CATCHES AS THE LINE OF FIRE
       REACHES IT (burnTick, from G.dragonTick through the strafe), never
       before: struck at the first breath, a hut two tiles down the line fell
       in its own dust while the flame was still landing on the far side of
       the ground chosen, the dragon not yet over it. Who catches is still
       decided here; only WHEN moves (`ev.catch`, ids, in the save). */
    breathe(ev) {
      const c = ev.card, hit = Deck.blast(c.x, c.y, this.UNIT_R, this.BLD_R);
      ev.victims = hit.units.map(e => e.u.id);
      ev.catch = hit.blds.map(e => e.b.id);
      this.burnTick(ev);
      if (typeof Sound !== 'undefined') Sound.play('impact');
    },
    /* THE VIEW TAKES THE BEAST IN (DeckUI.frame calls this every frame; all
       of it render state, never in S). The dragon is ~8 tiles wingtip to
       wingtip, its body hangs ~4 behind its jaws, and it comes in from 13
       tiles off — and a phone at the play zoom shows about 8 tiles across,
       so the whole fly-in and the first beat of the breath played OFF the
       screen and the beast slid in already burning. While the card's dragon
       is on the wing the view eases OUT (never in) and over just enough to
       hold the line of fire and the beast above it; once it has gone and its
       fire has caught, the view eases back to the zoom and the place the
       player had. A touch or the wheel gives the camera back on the spot,
       and it is never yanked back after (the tutorial's borrowed zoom keeps
       the same terms). A view that already holds it all is never touched. */
    CAM: { w: 12, up: 7.5, down: 2, lead: 2.3, glide: 0.7, hold: 0.7 },
    _cam: null, _camFor: null,
    cam(dt) {
      const ev = S.dragon && S.dragon.ev, Rr = window.R;
      if (!Rr || !Rr.cam || !Rr.viewW) return;
      let c = this._cam;
      if (c && c.map !== S.map) c = this._cam = null;          // a new world: the old framing is nobody's
      if (!c) {
        if (!ev || !ev.card || this._camFor === ev) return;
        this._camFor = ev;
        if (window.DeckUI && DeckUI._calm && DeckUI._calm()) return;
        const C = this.CAM, TL = CFG.TILE, z = Rr.cam.z, vw = Rr.viewW(), vh = Rr.viewH();
        const top = Rr.topReserve || 0, bot = Rr.bottomReserve || 0, band = Math.max(160, vh - top - bot);
        // the act's box: from the beast's middle at the first breath (7 tiles
        // back up its flight) to the far end of the line it lays (2.7 on), a
        // tile spare each side, and from its wings in the sky to the flames
        const cx = ev.card.x - ev.dir * C.lead, cy = ev.card.y - (C.up - C.down) / 2;
        const bx0 = cx - C.w / 2, bx1 = cx + C.w / 2, by0 = ev.card.y - C.up, by1 = ev.card.y + C.down;
        const vx0 = Rr.cam.x / TL, vx1 = (Rr.cam.x + vw / z) / TL, vy0 = (Rr.cam.y + top / z) / TL, vy1 = (Rr.cam.y + (vh - bot) / z) / TL;
        if (bx0 >= vx0 && bx1 <= vx1 && by0 >= vy0 && by1 <= vy1) return;
        const tz = Math.max(Rr.minZoom ? Rr.minZoom() : 0.5, Math.min(z, vw / (C.w * TL), band / ((C.up + C.down) * TL)));
        const home = { x: Rr.cam.x, y: Rr.cam.y, z };
        const at = zz => ({ x: cx * TL - vw / zz / 2, y: cy * TL - (top + band / 2) / zz, z: zz });
        c = this._cam = { map: S.map, ev, t: 0, from: home, to: at(tz), home, back: false, gone: 0 };
        this._camArm();
      }
      c.t += dt;
      if (!c.back) {
        if (S.dragon && S.dragon.ev === c.ev) c.gone = 0;
        else if ((c.gone += dt) > this.CAM.hold) { c.back = true; c.t = 0; c.from = { x: Rr.cam.x, y: Rr.cam.y, z: Rr.cam.z }; c.to = c.home; }
      }
      const k = Math.min(1, c.t / this.CAM.glide), e = k * k * (3 - 2 * k);
      Rr.cam.z = c.from.z + (c.to.z - c.from.z) * e;
      Rr.cam.x = c.from.x + (c.to.x - c.from.x) * e;
      Rr.cam.y = c.from.y + (c.to.y - c.from.y) * e;
      if (Rr.clampCam) Rr.clampCam();
      if (c.back && k >= 1) this._cam = null;
    },
    // the player's own hand on the camera ends the borrowing, then and there
    _camArm() {
      if (this._camOn) return;
      this._camOn = true;
      const give = () => { this._cam = null; };
      const cv = (window.R && R.cv) || document.getElementById('c');
      if (cv) { cv.addEventListener('pointerdown', give, { passive: true }); cv.addEventListener('wheel', give, { passive: true }); }
    },
    // the fire front (where G.dragonTick lays its flames, `reach` 2.1 ahead of
    // the strafe) reaching a marked building's footprint sets it alight; the
    // breath's end catches whatever the line ran past to one side (`all`)
    REACH: 2.1,
    burnTick(ev, all) {
      if (!ev.catch || !ev.catch.length) return;
      const front = ev.x + ev.dir * this.REACH;
      ev.catch = ev.catch.filter(id => {
        const b = Bld.get(id);
        if (!b || b.hp <= 0 || !Deck.foe(b.owner)) return false;
        const s = Bld.size(b);
        if (!all && (ev.dir > 0 ? front < b.x - 0.5 : front > b.x + s + 0.5)) return true;
        Deck.hitBld(b, this.BLD, this.TC_CAP, 'dragonfire');
        return false;
      });
    },
  },
});
