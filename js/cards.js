"use strict";
/* ORIGIN CARDS — the unified draft (player + rival).
   At game start both tribes are dealt 3 cards from one 20-card pool and keep
   one. A card is a clean single-sided boon; for the rival it ALSO sets the
   behavioral persona (the card IS the persona now — AI.PERSONAS are the six
   behavior profiles the cards lean on).

   COORDINATION WITH THE ROLLED START (System 1, G.rollStart) — the offer is
   built per side from that side's rolled package:
     · no-cancel: a card whose primary boon axis matches the roll's rich OR
       poor axis is excluded — cards must never flatten the rolled variance
     · orthogonal preferred: axis-less (transformative) cards weigh more
     · lean-in guaranteed: at least one offered card exploits the roll's
       RICH axis (syn list) — reading your situation is rewarded (and scored:
       CFG.SCORE.leanIn via S.stats.leanIn)
     · map gates: needsWater / landFav (islands) / fav-terrain scarcity
     · winnability clamp: rolled econ + the card's worst-case delta must
       still clear CFG.OPENING.minEcon (all boons are additive, so this is
       a backstop — but it is enforced, and the sweep checks it)

   DIFFICULTY INTEL (S.draft.intel): calm='full' (rival card name+benefit),
   moderate='name', hard='none' (whispers are the only early read).

   All rolls use G.rand — a seed reproduces its whole draft. Everything
   stored in S (S.draft, S.boons) is plain JSON data; the functions live
   here and are looked up by card key. */

const Cards = {
  /* Each card:
     name/motif/flavor — presentation (motif keys the placeholder art)
     axis   — primary boon axis for the no-cancel rule
              ('food'|'wood'|'stone'|'gold'|'crew'|null = orthogonal)
     syn    — rich axes this card EXPLOITS (lean-in candidates)
     cat    — rival pick-weighting bucket: econ|aggro|def|explore|naval
     lean   — AI.PERSONAS key the rival plays when holding this card
     bias   — early-behavior lean consumed by AI.daily (S.ai.opening.bias)
     needsWater/needsDock/landFav/fav — map gates
     whisper — the scouts' behavior hint (never names the card)
     roll() — plain-data magnitudes, seeded; text(r) — benefit headline;
     val(r) — econ-point proxy for the balance sweep (tight power band);
     apply(side, r) — grant the boon ('P'|'A') */
  DEFS: {
    homesteader: {
      name: 'Homesteader', motif: 'hearth', axis: 'crew', syn: ['food'],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Every hand feeds the fire.',
      whisper: 'Their hearth-smoke rises thick — many mouths, many hands.',
      roll() { return { n: 1 + (G.rand() < 0.45 ? 1 : 0) }; },
      text(r) { return `+${r.n} villager${r.n > 1 ? 's' : ''} at the hall`; },
      val(r) { return r.n * 90; },
      apply(side, r) { Cards._crew(side, 'villager', r.n); },
    },
    warlord: {
      name: 'Warlord', motif: 'spears', axis: null, syn: ['gold'],
      cat: 'aggro', lean: 'warlord', bias: 'raid',
      flavor: 'The plough waits; the spear does not.',
      whisper: 'Spearmen already drill outside their hall.',
      roll() { return { n: 2 + (G.rand() < 0.35 ? 1 : 0) }; },
      text(r) { return `+${r.n} defenders standing guard`; },
      val(r) { return r.n * 80; },
      apply(side, r) { Cards._crew(side, 'defender', r.n); },
    },
    horselord: {
      name: 'Horselord', motif: 'rider', axis: null, syn: [],
      cat: 'explore', lean: 'horselord', bias: 'scout', landFav: true,
      flavor: 'The horizon belongs to the mounted.',
      whisper: 'Hoofprints circle far beyond their fields.',
      roll() { return { r: 10 + ((G.rand() * 4) | 0) }; },
      text(r) { return `a mounted scout + wide sight (${r.r} tiles)`; },
      val(r) { return 60 + r.r * 4; },
      apply(side, r) {
        Cards._crew(side, 'rider', 1);
        if (side === 'P') { const tc = Bld.tcOf('P'); if (tc) G.reveal(Bld.cx(tc) | 0, Bld.cy(tc) | 0, r.r); }
      },
    },
    mariner: {
      name: 'Mariner', motif: 'longboat', axis: null, syn: ['wood'],
      cat: 'naval', lean: 'mariner', bias: 'sea', needsWater: true, needsDock: true,
      flavor: 'The sea feeds those who ask it.',
      whisper: 'Fresh-cut hulls dry on their shore.',
      roll() { return { boat: 1 }; },
      text() { return 'a working dock + fishing boat'; },
      val() { return 150; },
      apply(side) {
        const tc = Bld.tcOf(side);
        const site = tc && MapGen.findNear(tc.x, tc.y, 9, (x, y) => Bld.dockSiteOk(x, y, side).ok);
        if (!site) { Cards._res(side).wood += 50; return; }   // gated at offer time; belt and braces
        Bld.place(side, 'dock', site.x, site.y, { free: true, instant: true, noAutoAssign: true });
        const w = MapGen.findNear(site.x, site.y, 3, (x, y) => Units.canFish(x, y));
        const boat = Units.spawn('fishboat', side, (w || site).x, (w || site).y);
        if (w) Units.assignFish(boat, w.x, w.y);
      },
    },
    mason: {
      name: 'Mason', motif: 'chisel', axis: null, syn: ['stone'],
      cat: 'def', lean: 'mason', bias: 'turtle',
      flavor: 'Stone remembers.',
      whisper: 'Their quarry rings from first light.',
      roll() { return { stone: 25 + ((G.rand() * 21) | 0), off: 0.18 + G.rand() * 0.10 }; },
      text(r) { return `+${r.stone} stone; walls & towers ${Math.round(r.off * 100)}% cheaper`; },
      val(r) { return r.stone * 0.8 + r.off * 320; },
      apply(side, r) {
        Cards._res(side).stone += r.stone;
        Cards._boon(side).fortCost = { mult: 1 - r.off };
      },
    },
    forager: {
      name: 'Forager', motif: 'basket', axis: null, syn: [],
      cat: 'econ', lean: 'forager', bias: 'spread',
      flavor: 'The land gives to those who look.',
      whisper: 'Their gatherers fan out in every direction.',
      roll() {
        return { food: 15 + ((G.rand() * 16) | 0), wood: 15 + ((G.rand() * 16) | 0),
                 stone: 10 + ((G.rand() * 16) | 0), mult: 1.10 + G.rand() * 0.08,
                 until: 22 + ((G.rand() * 9) | 0) };
      },
      text(r) { return `mixed stores + gathering +${Math.round((r.mult - 1) * 100)}% until day ${r.until}`; },
      val(r) { return r.food + r.wood + 0.8 * r.stone + (r.mult - 1) * 400; },
      apply(side, r) {
        const res = Cards._res(side);
        res.food += r.food; res.wood += r.wood; res.stone += r.stone;
        Cards._boon(side).gather = { res: null, mult: r.mult, until: r.until };
      },
    },
    timberwright: {
      name: 'Timberwright', motif: 'axe', axis: 'wood', syn: [],
      cat: 'econ', lean: 'forager', bias: 'boom', fav: 'wood',
      flavor: 'Every tree is a house waiting.',
      whisper: 'Axes echo from their treeline all day.',
      roll() { return { wood: 30 + ((G.rand() * 31) | 0), mult: 1.20 + G.rand() * 0.10,
                        until: 25 + ((G.rand() * 11) | 0) }; },
      text(r) { return `+${r.wood} wood; wood-cutting +${Math.round((r.mult - 1) * 100)}% until day ${r.until}`; },
      val(r) { return r.wood + (r.mult - 1) * 280; },
      apply(side, r) {
        Cards._res(side).wood += r.wood;
        Cards._boon(side).gather = { res: 'wood', mult: r.mult, until: r.until };
      },
    },
    grainkeeper: {
      name: 'Grainkeeper', motif: 'wheat', axis: 'food', syn: [],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Full granaries fear no winter.',
      whisper: 'Their first field was furrowed before dawn.',
      roll() { return { farm: 1 }; },
      text() { return 'a finished farm, ready to work'; },
      val() { return 125; },
      apply(side) { Cards._prebuild(side, 'farm', T.FERTILE); },
    },
    stoneheart: {
      name: 'Stoneheart', motif: 'boulder', axis: 'stone', syn: [],
      cat: 'def', lean: 'mason', bias: 'turtle', fav: 'stone',
      flavor: 'Build on rock, outlast everything.',
      whisper: 'Sledges of stone drag toward their hall.',
      roll() { return { stone: 50 + ((G.rand() * 31) | 0) }; },
      text() { return 'a finished quarry — or a pile of stone'; },
      val(r) { return Math.max(100, r.stone * 0.8 + 40); },
      apply(side, r) {
        if (!Cards._prebuild(side, 'quarry', T.HILLS)) Cards._res(side).stone += r.stone;
      },
    },
    tradewind: {
      name: 'Tradewind', motif: 'coins', axis: 'gold', syn: [],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Gold has no season.',
      whisper: 'Strange traders come and go from their camp.',
      roll() { return { gold: 30 + ((G.rand() * 21) | 0), add: 3 + (G.rand() < 0.5 ? 1 : 0),
                        until: 35 + ((G.rand() * 11) | 0) }; },
      text(r) { return `+${r.gold} gold; +${r.add} gold/day until day ${r.until}`; },
      val(r) { return r.gold * 0.9 + r.add * r.until * 0.5; },
      apply(side, r) {
        Cards._res(side).gold += r.gold;
        Cards._boon(side).tcGold = { add: r.add, until: r.until };
      },
    },
    houndmaster: {
      name: 'Houndmaster', motif: 'hound', axis: null, syn: [],
      cat: 'def', lean: 'warlord', bias: null,
      flavor: 'Loyalty with teeth.',
      whisper: 'Something large paces their boundary at night.',
      roll() { return { beast: 1 }; },
      text() { return 'a great guard-beast walks your bounds'; },
      val() { return 160; },
      apply(side) {
        const b = Cards._crew(side, 'bear', 1)[0];
        if (b && side === 'P') G.log('🐻 A tamed great bear pads out beside the hall — wolves will think twice');
      },
    },
    pathfinder: {
      name: 'Pathfinder', motif: 'tracks', axis: null, syn: [],
      cat: 'explore', lean: 'horselord', bias: 'scout',
      flavor: 'Know the land before it knows you.',
      whisper: 'Their scouts walked your valley before you woke.',
      roll() {
        return { r: 12 + ((G.rand() * 4) | 0),
                 spots: [0, 0, 0].map(() => ({ x: (G.rand() * CFG.W) | 0, y: (G.rand() * CFG.H) | 0 })) };
      },
      text(r) { return `the land laid bare — wide sight (${r.r} tiles) + far places known`; },
      val(r) { return 40 + r.r * 5; },
      apply(side, r) {
        if (side !== 'P') return;   // the rival plays without fog — its gift is the lean
        const tc = Bld.tcOf('P');
        if (tc) G.reveal(Bld.cx(tc) | 0, Bld.cy(tc) | 0, r.r);
        for (const s of r.spots) G.reveal(s.x, s.y, 4);
      },
    },
    firekeeper: {
      name: 'Firekeeper', motif: 'campfire', axis: null, syn: ['wood', 'stone'],
      cat: 'econ', lean: 'forager', bias: 'boom',
      flavor: 'A warm crew works twice as fast.',
      whisper: 'Their building sites glow with fires after dark.',
      roll() { return { mult: 0.70 + G.rand() * 0.10, until: 25 + ((G.rand() * 11) | 0) }; },
      text(r) { return `building ${Math.round((1 - r.mult) * 100)}% faster until day ${r.until}`; },
      val(r) { return (1 - r.mult) * 380; },
      apply(side, r) { Cards._boon(side).buildTime = { mult: r.mult, until: r.until }; },
    },
    beastward: {
      name: 'Beastward', motif: 'antlers', axis: null, syn: ['food'],
      cat: 'econ', lean: 'forager', bias: 'spread',
      flavor: 'The wild is a neighbor, not an enemy.',
      whisper: 'Wolves walk past their herds without hunger.',
      roll() { return { mult: 1.8 + G.rand() * 0.4, until: 25 + ((G.rand() * 11) | 0) }; },
      text(r) { return `beasts keep the peace & hunts yield ×${r.mult.toFixed(1)} until day ${r.until}`; },
      val(r) { return 50 + r.mult * 25; },
      apply(side, r) {
        Cards._boon(side).peace = { until: r.until };
        Cards._boon(side).hunt = { mult: r.mult, until: r.until };
      },
    },
    refugeehost: {
      name: 'Refugee Host', motif: 'crowd', axis: 'crew', syn: ['food'],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Open gates, growing tribe.',
      whisper: 'Strangers stream toward their fires, and stay.',
      roll() { return { n: 2 + (G.rand() < 0.4 ? 1 : 0), tithe: 15 + ((G.rand() * 11) | 0) }; },
      text(r) { return `+${r.n} villagers arrive (they eat ${r.tithe} food)`; },
      val(r) { return r.n * 90 - r.tithe; },
      apply(side, r) {
        Cards._crew(side, 'villager', r.n);
        const res = Cards._res(side);
        res.food = Math.max(0, res.food - r.tithe);
      },
    },
    riverborn: {
      name: 'Riverborn', motif: 'reeds', axis: null, syn: ['food'],
      cat: 'naval', lean: 'mariner', bias: 'sea', needsWater: true,
      flavor: 'The river raised us.',
      whisper: 'Their people work the shallows like herons.',
      roll() { return { food: 20 + ((G.rand() * 21) | 0), mult: 1.35 + G.rand() * 0.25 }; },
      text(r) { return `+${r.food} food; all fishing ×${r.mult.toFixed(1)} for good`; },
      val(r) { return r.food + (r.mult - 1) * 200; },
      apply(side, r) {
        Cards._res(side).food += r.food;
        Cards._boon(side).fish = { mult: r.mult };
      },
    },
    seer: {
      name: 'Seer', motif: 'eye', axis: null, syn: [],
      cat: 'def', lean: 'mason', bias: 'turtle',
      flavor: 'The bones never lie.',
      whisper: 'Their fires burn late — someone reads the stars.',
      roll() { return { jx: (G.rand() - 0.5) * 8, jy: (G.rand() - 0.5) * 8 }; },
      text() { return 'raid forewarnings + a far-seeing eye on the land'; },
      val() { return 110; },
      apply(side, r) {
        if (side !== 'P') return;   // no fog on the rival's side — its gift is the lean
        const p = Bld.tcOf('P'), a = Bld.tcOf('A');
        const x = Math.max(0, Math.min(CFG.W - 1, Math.round((p && a ? (p.x + a.x) / 2 : CFG.W / 2) + r.jx)));
        const y = Math.max(0, Math.min(CFG.H - 1, Math.round((p && a ? (p.y + a.y) / 2 : CFG.H / 2) + r.jy)));
        Cards._boon('P').seer = { x, y };
        G.reveal(x, y, 4);
      },
    },
    ironhand: {
      name: 'Ironhand', motif: 'anvil', axis: null, syn: ['gold'],
      cat: 'aggro', lean: 'warlord', bias: 'raid',
      flavor: 'Cheap iron, dear blood.',
      whisper: 'Their anvil rings through the night.',
      roll() { return { off: 0.10 + G.rand() * 0.08, hp: 1.08 + G.rand() * 0.07 }; },
      text(r) { return `soldiers ${Math.round(r.off * 100)}% cheaper & ${Math.round((r.hp - 1) * 100)}% tougher`; },
      val(r) { return r.off * 700 + (r.hp - 1) * 500; },
      apply(side, r) { Cards._boon(side).train = { costMult: 1 - r.off, hpMult: r.hp }; },
    },
    harvestlord: {
      name: 'Harvest Lord', motif: 'sickle', axis: 'food', syn: [],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'The soil answers to me.',
      whisper: 'Their fields stand taller than the season allows.',
      roll() { return { mult: 1.20 + G.rand() * 0.15 }; },
      text(r) { return `farms yield +${Math.round((r.mult - 1) * 100)}%, for good`; },
      val(r) { return (r.mult - 1) * 480; },
      apply(side, r) { Cards._boon(side).farm = { mult: r.mult }; },
    },
    nomad: {
      name: 'Nomad', motif: 'tent', axis: null, syn: ['wood'],
      cat: 'explore', lean: 'forager', bias: 'spread',
      flavor: 'Home is where the fire is lit.',
      whisper: 'Their camp moved twice before it settled.',
      roll() { return { left: 3 + ((G.rand() * 3) | 0), costMult: 0.50 + G.rand() * 0.15 }; },
      text(r) { return `first ${r.left} buildings ${Math.round((1 - r.costMult) * 100)}% cheaper & fast`; },
      val(r) { return r.left * (1 - r.costMult) * 75; },
      apply(side, r) { Cards._boon(side).nomad = { left: r.left, costMult: r.costMult, timeMult: 0.6 }; },
    },
  },

  keys() { return Object.keys(this.DEFS); },

  /* ---------------- the deal ---------------- */

  // build one side's 3-card offer from its rolled start package (see header)
  offer(side, pk) {
    const water = S.map.terrain.includes(T.WATER);
    const [vLo, vHi] = CFG.OPENING.villagers[S.mode] || CFG.OPENING.villagers.moderate;
    const cand = [];
    for (const key of this.keys()) {
      const d = this.DEFS[key];
      if (d.axis && (d.axis === pk.rich || d.axis === pk.poor)) continue;         // no-cancel
      if (d.axis === 'crew' && (pk.villagers <= vLo || pk.villagers >= vHi)) continue;  // crew variance is variance too
      if (d.needsWater && !water) continue;
      if (d.needsDock && !this._dockable(side)) continue;
      if (pk.econ + this._floorDelta(d) < CFG.OPENING.minEcon) continue;          // winnability clamp
      let w = d.axis ? 1 : 1.6;                                                   // orthogonal preferred
      if (d.landFav && S.map.landform === 'islands') w *= 0.45;                   // map gates
      if (d.fav && S.map.scarce === d.fav) w *= 0.45;
      cand.push({ key, w, lean: (d.syn || []).includes(pk.rich) });
    }
    const hand = [];
    const draw = pool => {
      const total = pool.reduce((a, c) => a + c.w, 0);
      let roll = G.rand() * total;
      for (const c of pool) { roll -= c.w; if (roll <= 0) return c.key; }
      return pool[pool.length - 1].key;
    };
    const leans = cand.filter(c => c.lean);
    if (leans.length) hand.push(draw(leans));                                     // ≥1 lean-in
    while (hand.length < 3) {
      const pool = cand.filter(c => !hand.includes(c.key));
      if (!pool.length) break;    // can't happen with a 20-card pool, but never loop
      hand.push(draw(pool));
    }
    return hand;
  },

  // worst-case econ delta a card can inflict (only the Refugee tithe is ever
  // negative on an axis, and its crew more than pays it back)
  _floorDelta(d) { return d === this.DEFS.refugeehost ? 2 * 90 - 25 : 0; },

  _dockable(side) {
    const tc = Bld.tcOf(side);
    return !!(tc && MapGen.findNear(tc.x, tc.y, 9, (x, y) => Bld.dockSiteOk(x, y, side).ok));
  },

  /* deal both hands, resolve the rival's pick (the pick sets its persona and
     its boon), stage the player's hand in S.draft for the draft screen.
     forced = a card key (tests / the six classic persona names) the rival
     must keep — it is slotted into the hand if the offer missed it. */
  deal(pkP, pkA, forced) {
    const handP = this.offer('P', pkP).map(k => ({ key: k, roll: this.DEFS[k].roll() }));
    const leanKeys = handP.filter(h => (this.DEFS[h.key].syn || []).includes(pkP.rich)).map(h => h.key);

    let handA = this.offer('A', pkA);
    // the rival's temperament seed weights its choice — identity reads coherent
    const tr = G.rand();
    const temper = tr < 0.30 ? 'aggro' : tr < 0.60 ? 'econ' : tr < 0.80 ? 'def' : 'explore';
    let pickKey;
    if (forced && this.DEFS[forced]) {
      if (!handA.includes(forced)) handA = [forced].concat(handA.slice(0, 2));
      pickKey = forced;
    } else {
      const pool = handA.map(k => ({ key: k, w: this.DEFS[k].cat === temper ? 2.4 : 1 }));
      const total = pool.reduce((a, c) => a + c.w, 0);
      let roll = G.rand() * total;
      pickKey = pool[pool.length - 1].key;
      for (const c of pool) { roll -= c.w; if (roll <= 0) { pickKey = c.key; break; } }
    }
    const pickA = { key: pickKey, roll: this.DEFS[pickKey].roll() };

    S.draft = {
      hand: handP, leanKeys,
      rival: { hand: handA, pick: pickA, temper },
      intel: S.mode === 'calm' ? 'full' : S.mode === 'moderate' ? 'name' : 'none',
      done: false, pickI: null,
    };

    // the card IS the persona: behavior profile + early lean + boon
    const cd = this.DEFS[pickKey];
    S.ai.persona = cd.lean;
    S.ai.opening = { bias: cd.bias || null, fired: true, until: 13 + ((G.rand() * 8) | 0), card: pickKey };
    this.apply('A', pickA);

    // intel per difficulty; the whisper carries the behavior hint everywhere
    if (S.draft.intel === 'full')
      G.log(`🃏 Rival origin: ${cd.name} — ${cd.text(pickA.roll)}`, false, 6400);
    else if (S.draft.intel === 'name')
      G.log(`🃏 Rival origin: ${cd.name}. What gift it carries, no one knows.`, false, 6400);
    G.log('🕵 Scouts whisper of the rival chief: ' + AI.persona().blurb + ' ' + cd.whisper, false, 6400);
  },

  // the player keeps card i (the draft screen calls this; tests/demo auto-pick)
  pick(i) {
    const D = S.draft;
    if (!D || D.done || !D.hand.length) return null;
    i = Math.max(0, Math.min(D.hand.length - 1, i | 0));
    const c = D.hand[i];
    this.apply('P', c);
    D.done = true; D.pickI = i;
    if (S.stats) S.stats.leanIn = (D.leanKeys || []).includes(c.key) ? 1 : 0;
    const d = this.DEFS[c.key];
    G.log(`🃏 Origin chosen: ${d.name} — ${d.text(c.roll)}`, false, 6400);
    if (window.DEBUG_OPENINGS) console.log('[draft:pick]', c.key, JSON.stringify(c.roll));
    return c;
  },

  apply(side, card) {
    if (!S.boons) S.boons = { P: {}, A: {} };
    const d = this.DEFS[card.key];
    if (d) d.apply(side, card.roll || {});
  },

  /* ---------------- apply helpers ---------------- */
  _res(side) { return side === 'P' ? S.res : S.ai.res; },
  _boon(side) {
    if (!S.boons) S.boons = { P: {}, A: {} };
    return S.boons[side];
  },
  _crew(side, kind, n) {
    const tc = Bld.tcOf(side);
    const out = [];
    for (let i = 0; i < n; i++) {
      const spot = (tc && MapGen.findNear(tc.x + 1, tc.y + Bld.size('tc'), 4,
        (x, y) => Path.passable(x, y, side) && !Bld.at(x, y))) || { x: (tc ? tc.x : 2) + i, y: (tc ? tc.y : 2) + 2 };
      out.push(Units.spawn(kind, side, spot.x, spot.y));
    }
    return out;
  },
  // a finished workplace beside the hall — near its bonus terrain if any is close
  _prebuild(side, key, terr) {
    const tc = Bld.tcOf(side);
    if (!tc) return null;
    let spot = null;
    if (terr !== undefined) {
      spot = MapGen.findNear(tc.x, tc.y, 7, (x, y) => {
        if (!Bld.tileFree(x, y)) return false;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++)
          if (MapGen.inB(x + ox, y + oy) && S.map.terrain[MapGen.idx(x + ox, y + oy)] === terr) return true;
        return false;
      });
      if (key === 'quarry' && !spot) return null;   // Stoneheart: no hills → the stone pile instead
    }
    if (!spot) spot = MapGen.findNear(tc.x + 2, tc.y + 1, 6, (x, y) => Bld.tileFree(x, y));
    if (!spot) return null;
    return Bld.place(side, key, spot.x, spot.y, { free: true, instant: true, noAutoAssign: true });
  },

  /* ---------------- engine hooks (all null-safe, read S.boons) ----------------
     Called from buildings.js / units.js / combat.js / game.js — each is one
     line at the call site. Owners other than P/A always get the neutral value. */
  _b(owner) { return (S && S.boons && S.boons[owner]) || null; },

  // Mason fort discount + Nomad first-buildings discount (placement costs)
  buildCost(owner, key, cost) {
    const b = this._b(owner);
    if (!b) return cost;
    let mult = 1;
    if (b.fortCost && (key === 'wall' || key === 'gate' || key === 'tower')) mult *= b.fortCost.mult;
    if (b.nomad && b.nomad.left > 0) mult *= b.nomad.costMult;
    if (mult === 1) return cost;
    const out = {};
    for (const k in cost) out[k] = Math.max(0, Math.round(cost[k] * mult));
    return out;
  },
  // Firekeeper early haste + Nomad first-buildings haste (construction days)
  buildTimeMult(owner) {
    const b = this._b(owner);
    if (!b) return 1;
    let mult = 1;
    if (b.buildTime && S.day <= b.buildTime.until) mult *= b.buildTime.mult;
    if (b.nomad && b.nomad.left > 0) mult *= b.nomad.timeMult;
    return mult;
  },
  // a paid placement burns one Nomad charge
  notePlaced(owner) {
    const b = this._b(owner);
    if (b && b.nomad && b.nomad.left > 0) b.nomad.left--;
  },
  // Ironhand: cheaper soldiers
  trainCost(owner, kind, cost) {
    const b = this._b(owner);
    if (!b || !b.train || !CFG.UNITS[kind] || kind === 'villager' || kind === 'fishboat') return cost;
    const out = {};
    for (const k in cost) out[k] = Math.max(0, Math.round(cost[k] * b.train.costMult));
    return out;
  },
  // Ironhand: tougher soldiers (every military spawn for the holder)
  onSpawn(u) {
    const b = this._b(u.owner);
    if (b && b.train && Units.isMilitary(u)) {
      u.hp = Math.round(u.hp * b.train.hpMult);
      u.maxhp = Math.round(u.maxhp * b.train.hpMult);
    }
  },
  // Forager (all) / Timberwright (wood) gather pace
  gatherMult(owner, res) {
    const b = this._b(owner);
    if (!b || !b.gather || S.day > b.gather.until) return 1;
    return (b.gather.res === null || b.gather.res === res) ? b.gather.mult : 1;
  },
  // Riverborn: nets and lines alike
  fishMult(owner) {
    const b = this._b(owner);
    return b && b.fish ? b.fish.mult : 1;
  },
  // Beastward: rich hunts…
  huntMult(owner) {
    const b = this._b(owner);
    return b && b.hunt && S.day <= b.hunt.until ? b.hunt.mult : 1;
  },
  // …and a truce with the wild (predators pass this tribe by)
  atPeace(owner) {
    const b = this._b(owner);
    return !!(b && b.peace && S.day <= b.peace.until);
  },
  // Harvest Lord farms
  prodMult(owner, bld) {
    const b = this._b(owner);
    return b && b.farm && bld.key === 'farm' ? b.farm.mult : 1;
  },
  // Tradewind trickle (called from dailyProduction)
  dailyExtras(owner, res) {
    const b = this._b(owner);
    if (b && b.tcGold && S.day <= b.tcGold.until) res.gold += b.tcGold.add;
  },
  // Seer: the bones warn two days ahead of a barbarian band (once per wave)
  seerWatch() {
    const b = this._b('P');
    if (!b || !b.seer || !S.wave) return;
    if (S.wave.next - S.day === 2 && b.warned !== S.wave.next) {
      b.warned = S.wave.next;
      G.log('🔮 The Seer casts the bones: barbarians will move within two days', true, 5200);
    }
  },

  /* ---------------- placeholder card art ----------------
     PLACEHOLDER: simple procedural motifs in the house palette (ART ramps,
     top-left light, chunky 16-bit shapes) until real card art lands. Real
     art drops in through the manifest as `ui/card/<key>` (see ASSET_SPEC.md)
     with zero code change — drawMotif prefers the image when it exists. */
  drawMotif(canvas, key) {
    if (window.Assets && Assets.isImage && Assets.isImage('ui/card/' + key)) {
      const g0 = canvas.getContext('2d');
      g0.imageSmoothingEnabled = false;
      g0.clearRect(0, 0, canvas.width, canvas.height);
      Assets.drawSprite(g0, 'ui/card/' + key, 0, 0, { w: canvas.width, h: canvas.height });
      return;
    }
    const PAL = ART.PALETTE;
    const g = canvas.getContext('2d');
    const s = canvas.width / 24;   // 24-cell logical grid
    g.clearRect(0, 0, canvas.width, canvas.height);
    const p = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * s, y * s, w * s, h * s); };
    const M = this._MOTIFS[this.DEFS[key] ? this.DEFS[key].motif : 'hearth'] || this._MOTIFS.hearth;
    M(p, PAL);
  },
  _MOTIFS: {
    hearth(p, C) {
      ART.shadedRect(p, 5, 16, 14, 4, C.stone, 1);
      p(8, 15, 8, 1, C.wood[1]);
      ART.shadedCircle(p, 12, 11, 4, C.fire, 1);
      p(10, 8, 4, 4, C.fire[2]); p(11, 6, 2, 3, C.fire[3]);
    },
    spears(p, C) {
      for (let i = 0; i < 12; i++) { p(6 + i, 18 - i, 1, 1, C.wood[3]); p(17 - i, 18 - i, 1, 1, C.wood[2]); }
      p(17, 5, 2, 3, C.stone[3]); p(5, 5, 2, 3, C.stone[3]);
      p(16, 4, 2, 2, C.bone[2]); p(6, 4, 2, 2, C.bone[2]);
    },
    rider(p, C) {
      ART.shadedRect(p, 6, 12, 12, 4, C.hide, 2);       // horse body
      p(16, 9, 3, 4, C.hide[2]); p(17, 7, 2, 3, C.hide[3]);   // neck+head
      p(7, 16, 2, 5, C.hide[1]); p(15, 16, 2, 5, C.hide[1]);  // legs
      p(10, 8, 3, 4, C.skin[2]); p(10, 6, 3, 2, C.hair[1]);   // rider
      p(4, 11, 2, 4, C.hide[3]);                               // tail
    },
    longboat(p, C) {
      for (let i = 0; i < 14; i++) p(5 + i, 16 + ((i / 3) | 0) % 2, 1, 1, C.water[3]);
      ART.shadedRect(p, 6, 12, 12, 3, C.wood, 2);
      p(5, 11, 2, 2, C.wood[3]); p(17, 11, 2, 2, C.wood[3]);
      p(11, 4, 1, 8, C.wood[1]); p(12, 5, 5, 5, C.bone[2]);
    },
    chisel(p, C) {
      ART.shadedRect(p, 6, 12, 10, 8, C.stone, 2);
      p(7, 13, 3, 2, C.stone[4]);
      for (let i = 0; i < 6; i++) p(13 + i, 10 - i, 1, 1, C.wood[3]);
      p(12, 11, 2, 2, C.stone[4]);
    },
    basket(p, C) {
      ART.shadedRect(p, 7, 13, 10, 6, C.thatch, 1);
      p(7, 12, 10, 1, C.wood[2]);
      ART.shadedCircle(p, 9, 11, 1, C.bloom, 0);
      ART.shadedCircle(p, 12, 10, 1, [C.leaf[1], C.leaf[2], C.leaf[3]], 1);
      ART.shadedCircle(p, 15, 11, 1, C.fire, 1);
    },
    axe(p, C) {
      ART.shadedRect(p, 5, 15, 14, 5, C.wood, 2);
      p(6, 16, 12, 1, C.wood[4]);
      for (let i = 0; i < 7; i++) p(12 + i, 12 - i, 1, 1, C.wood[3]);
      p(10, 11, 4, 4, C.stone[3]); p(10, 11, 2, 2, C.stone[4]);
    },
    wheat(p, C) {
      for (const dx of [7, 12, 17]) {
        p(dx, 8, 1, 12, C.thatch[1]);
        for (let i = 0; i < 4; i++) { p(dx - 1, 7 + i * 2, 1, 1, C.thatch[3]); p(dx + 1, 8 + i * 2, 1, 1, C.thatch[2]); }
        p(dx, 5, 1, 3, C.thatch[3]);
      }
    },
    boulder(p, C) {
      ART.shadedCircle(p, 12, 13, 6, C.stone, 2);
      p(9, 10, 3, 2, C.stone[4]);
      p(14, 15, 3, 2, C.stone[1]);
    },
    coins(p, C) {
      ART.shadedRect(p, 8, 10, 8, 9, C.hide, 1);
      p(9, 9, 6, 2, C.wood[1]);
      ART.shadedCircle(p, 8, 18, 2, C.gold, 1);
      ART.shadedCircle(p, 15, 19, 2, C.gold, 2);
      ART.shadedCircle(p, 12, 6, 2, C.gold, 2);
    },
    hound(p, C) {
      ART.shadedRect(p, 6, 12, 11, 4, C.pelt, 1);       // body
      p(15, 8, 4, 5, C.pelt[1]); p(17, 7, 3, 3, C.pelt[2]);   // neck+head
      p(19, 6, 1, 2, C.pelt[0]);                               // ear
      p(7, 16, 2, 4, C.pelt[0]); p(14, 16, 2, 4, C.pelt[0]);  // legs
      p(4, 10, 2, 3, C.pelt[2]);                               // tail up
      p(18, 9, 1, 1, C.fire[2]);                               // eye
    },
    tracks(p, C) {
      for (let i = 0; i < 4; i++) {
        p(6 + i * 4, 18 - i * 4, 2, 3, C.soil[1]);
        p(9 + i * 4, 16 - i * 4, 2, 3, C.soil[2]);
      }
    },
    campfire(p, C) {
      p(6, 18, 12, 2, C.wood[1]); p(8, 17, 8, 1, C.wood[2]);
      ART.shadedCircle(p, 12, 12, 4, C.fire, 1);
      p(10, 7, 4, 4, C.fire[2]); p(11, 5, 2, 3, C.fire[3]);
    },
    antlers(p, C) {
      for (const [ox, dir] of [[9, -1], [15, 1]]) {
        p(ox, 8, 1, 10, C.bone[1]);
        p(ox + dir, 8, 1, 2, C.bone[2]); p(ox + dir * 2, 6, 1, 3, C.bone[2]);
        p(ox + dir, 12, 1, 2, C.bone[2]); p(ox + dir * 2, 10, 1, 3, C.bone[1]);
      }
      p(10, 18, 5, 2, C.hide[2]);
    },
    crowd(p, C) {
      for (const [ox, oy, sk] of [[7, 10, 2], [12, 8, 1], [17, 10, 3]]) {
        p(ox, oy, 3, 3, C.skin[sk]); p(ox, oy - 2, 3, 2, C.hair[1]);
        p(ox - 1, oy + 3, 5, 6, C.hide[sk]);
      }
    },
    reeds(p, C) {
      for (let i = 0; i < 14; i++) p(5 + i, 18 + (i % 3 === 0 ? 1 : 0), 1, 1, C.water[3]);
      for (const dx of [8, 11, 14, 16]) {
        p(dx, 7, 1, 11, C.leaf[2]);
        p(dx, 5, 1, 3, C.soil[2]);
      }
    },
    eye(p, C) {
      for (let i = 0; i < 7; i++) { p(5 + i, 12 - (i < 4 ? i : 6 - i), 1, 1, C.bone[2]); p(18 - i, 12 - (i < 4 ? i : 6 - i), 1, 1, C.bone[2]); }
      for (let i = 0; i < 7; i++) { p(5 + i, 12 + (i < 4 ? i : 6 - i), 1, 1, C.bone[1]); p(18 - i, 12 + (i < 4 ? i : 6 - i), 1, 1, C.bone[1]); }
      ART.shadedCircle(p, 12, 12, 3, C.water, 2);
      p(11, 11, 2, 2, C.ink[0]);
      p(12, 4, 1, 2, C.gold[2]); p(7, 6, 1, 2, C.gold[1]); p(17, 6, 1, 2, C.gold[1]);
    },
    anvil(p, C) {
      ART.shadedRect(p, 6, 10, 13, 3, C.stone, 1);
      p(4, 10, 3, 2, C.stone[2]);
      p(10, 13, 4, 4, C.stone[0]);
      ART.shadedRect(p, 8, 17, 8, 3, C.wood, 1);
      p(7, 8, 2, 2, C.fire[2]);
    },
    sickle(p, C) {
      for (let i = 0; i < 8; i++) p(8 + i, 6 + ((i * i) / 8 | 0), 1, 2, C.stone[3]);
      p(15, 12, 2, 2, C.stone[3]);
      for (let i = 0; i < 6; i++) p(14 - i, 14 + i, 1, 1, C.wood[3]);
      p(6, 19, 3, 2, C.thatch[2]);
    },
    tent(p, C) {
      for (let i = 0; i < 8; i++) { p(12 - i, 6 + i * 2, 1, 2, C.hide[2]); p(12 + i, 6 + i * 2, 1, 2, C.hide[1]); }
      for (let i = 1; i < 8; i++) p(12 - i + 1, 6 + i * 2, i * 2 - 1, 2, C.hide[2]);
      p(11, 16, 3, 4, C.ink[0]);
      p(12, 3, 1, 4, C.wood[2]);
    },
  },
};

// classic-script global (const declarations are not window properties)
window.Cards = Cards;
