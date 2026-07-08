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
     apply(side, r) — grant the boon ('P'|'A')

     DIFFICULTY TILT (the request): a card is MOST helpful on Calm and only
     marginally helpful on Hard. Every roll reads Cards.diff():
       · mag  scales the magnitudes — Calm 1.35× / Moderate 1.10× / Hard 0.72×
       · kick sets the one-time "kicker" — Calm 2 / Moderate 1 / Hard 0.
     So (e.g.) Ironhand on Calm is soldiers much cheaper + 2 free at the first
     barracks; on Moderate cheaper + 1 free; on Hard just a little cheaper.
     The tilt is uniform across all cards, so the power band WITHIN a mode
     stays tight (no auto-pick) while Calm > Moderate > Hard overall. */
  DIFF: {
    calm:     { mag: 1.35, kick: 2 },
    moderate: { mag: 1.10, kick: 1 },
    hard:     { mag: 0.72, kick: 0 },
  },
  diff() { return this.DIFF[(S && S.mode)] || this.DIFF.moderate; },

  DEFS: {
    homesteader: {
      name: 'Homesteader', motif: 'hearth', axis: 'crew', syn: ['food'],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Every hand feeds the fire.',
      whisper: 'Their hearth-smoke rises thick — many mouths, many hands.',
      roll() { const D = Cards.diff();
        return { n: 1 + D.kick, gm: 1 + 0.14 * D.mag, until: 22 + ((G.rand() * 8) | 0), food: 40 * D.kick }; },
      text(r) { return `+${r.n} villager${r.n > 1 ? 's' : ''} & a food-rich early boom`; },
      val(r) { return r.n * 90 + (r.food || 0) + (r.gm - 1) * 320; },
      apply(side, r) {
        Cards._crew(side, 'villager', r.n);
        Cards._res(side).food += r.food || 0;
        Cards._boon(side).gather = { res: 'food', mult: r.gm, until: r.until };
      },
    },
    warlord: {
      name: 'Warlord', motif: 'spears', axis: null, syn: ['gold'],
      cat: 'aggro', lean: 'warlord', bias: 'raid',
      flavor: 'The plough waits; the spear does not.',
      whisper: 'Spearmen already drill outside their hall.',
      roll() { const D = Cards.diff(); return { n: 1 + D.kick, onB: D.kick }; },
      text(r) { return `+${r.n} defenders now${r.onB ? ` + ${r.onB} free at the barracks` : ''}`; },
      val(r) { return r.n * 80 + r.onB * 80; },
      apply(side, r) {
        Cards._crew(side, 'defender', r.n);
        Cards._onBuild(side, 'barracks', 'defender', r.onB);
      },
    },
    horselord: {
      name: 'Horselord', motif: 'rider', axis: null, syn: [],
      cat: 'explore', lean: 'horselord', bias: 'scout', landFav: true,
      flavor: 'The horizon belongs to the mounted.',
      whisper: 'Hoofprints circle far beyond their fields.',
      roll() { const D = Cards.diff();
        return { r: Math.round((10 + (G.rand() * 4 | 0)) * D.mag), onB: D.kick }; },
      text(r) { return `a scout + wide sight (${r.r})${r.onB ? ` + ${r.onB} free rider${r.onB > 1 ? 's' : ''} at the stable` : ''}`; },
      val(r) { return 60 + r.r * 4 + r.onB * 70; },
      apply(side, r) {
        Cards._crew(side, 'rider', 1);
        Cards._onBuild(side, 'stable', 'rider', r.onB);
        if (side === 'P') { const tc = Bld.tcOf('P'); if (tc) G.reveal(Bld.cx(tc) | 0, Bld.cy(tc) | 0, r.r); }
      },
    },
    mariner: {
      name: 'Mariner', motif: 'longboat', axis: null, syn: ['wood'],
      cat: 'naval', lean: 'mariner', bias: 'sea', needsWater: true, needsDock: true,
      flavor: 'The sea feeds those who ask it.',
      whisper: 'Fresh-cut hulls dry on their shore.',
      roll() { const D = Cards.diff(); return { boats: 1 + D.kick }; },
      text(r) { return `a working dock + ${r.boats} fishing boat${r.boats > 1 ? 's' : ''}`; },
      val(r) { return 90 + r.boats * 70; },
      apply(side, r) {
        const tc = Bld.tcOf(side);
        const site = tc && MapGen.findNear(tc.x, tc.y, 9, (x, y) => Bld.dockSiteOk(x, y, side).ok);
        if (!site) { Cards._res(side).wood += 40 + 25 * (r.boats || 1); return; }   // gated at offer; belt & braces
        Bld.place(side, 'dock', site.x, site.y, { free: true, instant: true, noAutoAssign: true });
        for (let i = 0; i < r.boats; i++) {
          const w = MapGen.findNear(site.x, site.y, 4, (x, y) => Units.canFish(x, y));
          const boat = Units.spawn('fishboat', side, (w || site).x, (w || site).y);
          if (w) Units.assignFish(boat, w.x, w.y);
        }
      },
    },
    mason: {
      name: 'Mason', motif: 'chisel', axis: null, syn: ['stone'],
      cat: 'def', lean: 'mason', bias: 'turtle',
      flavor: 'Stone remembers.',
      whisper: 'Their quarry rings from first light.',
      roll() { const D = Cards.diff();
        return { stone: Math.round((26 + (G.rand() * 20 | 0)) * D.mag) + 50 * D.kick,
                 off: Math.min(0.34, (0.16 + G.rand() * 0.08) * D.mag) }; },
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
      roll() { const D = Cards.diff();
        return { food: Math.round((16 + (G.rand() * 14 | 0)) * D.mag),
                 wood: Math.round((16 + (G.rand() * 14 | 0)) * D.mag),
                 stone: Math.round((10 + (G.rand() * 14 | 0)) * D.mag),
                 kick: 30 * D.kick, gm: 1 + 0.12 * D.mag, until: 22 + ((G.rand() * 9) | 0) }; },
      text(r) { return `mixed stores + all gathering +${Math.round((r.gm - 1) * 100)}%`; },
      val(r) { return r.food + r.wood + 0.8 * r.stone + (r.kick || 0) + (r.gm - 1) * 400; },
      apply(side, r) {
        const res = Cards._res(side);
        res.food += r.food + (r.kick || 0); res.wood += r.wood; res.stone += r.stone;
        Cards._boon(side).gather = { res: null, mult: r.gm, until: r.until };
      },
    },
    timberwright: {
      name: 'Timberwright', motif: 'axe', axis: 'wood', syn: [],
      cat: 'econ', lean: 'forager', bias: 'boom', fav: 'wood',
      flavor: 'Every tree is a house waiting.',
      whisper: 'Axes echo from their treeline all day.',
      roll() { const D = Cards.diff();
        return { wood: Math.round((32 + (G.rand() * 30 | 0)) * D.mag) + 40 * D.kick,
                 gm: 1 + 0.22 * D.mag, until: 25 + ((G.rand() * 11) | 0) }; },
      text(r) { return `+${r.wood} wood; wood-cutting +${Math.round((r.gm - 1) * 100)}%`; },
      val(r) { return r.wood + (r.gm - 1) * 300; },
      apply(side, r) {
        Cards._res(side).wood += r.wood;
        Cards._boon(side).gather = { res: 'wood', mult: r.gm, until: r.until };
      },
    },
    grainkeeper: {
      name: 'Grainkeeper', motif: 'wheat', axis: 'food', syn: [],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Full granaries fear no winter.',
      whisper: 'Their first field was furrowed before dawn.',
      roll() { const D = Cards.diff();
        return { vill: D.kick, food: 40 * D.kick, fmult: 1 + 0.12 * D.mag }; },
      text(r) { return `a worked farm${r.vill ? ` + ${r.vill} villager${r.vill > 1 ? 's' : ''}` : ''} & +yield fields`; },
      val(r) { return 120 + r.vill * 90 + (r.food || 0) + (r.fmult - 1) * 300; },
      apply(side, r) {
        const farm = Cards._prebuild(side, 'farm', T.FERTILE);
        const hand = Cards._crew(side, 'villager', 1 + r.vill)[0];
        if (farm && hand && side === 'P') hand.task = { type: 'work', id: farm.id };
        Cards._res(side).food += r.food || 0;
        Cards._boon(side).farm = { mult: r.fmult };
      },
    },
    stoneheart: {
      name: 'Stoneheart', motif: 'boulder', axis: 'stone', syn: [],
      cat: 'def', lean: 'mason', bias: 'turtle', fav: 'stone',
      flavor: 'Build on rock, outlast everything.',
      whisper: 'Sledges of stone drag toward their hall.',
      roll() { const D = Cards.diff();
        return { stone: Math.round((45 + (G.rand() * 30 | 0)) * D.mag), kick: 50 * D.kick }; },
      text(r) { return `a worked quarry (or a pile of stone) + stone`; },
      val(r) { return Math.max(110, r.stone * 0.8 + r.kick * 0.8 + 50); },
      apply(side, r) {
        const q = Cards._prebuild(side, 'quarry', T.HILLS);
        if (q) { const v = Cards._crew(side, 'villager', 1)[0]; if (v && side === 'P') v.task = { type: 'work', id: q.id }; }
        else Cards._res(side).stone += r.stone;
        Cards._res(side).stone += r.kick || 0;
      },
    },
    tradewind: {
      name: 'Tradewind', motif: 'coins', axis: 'gold', syn: [],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Gold has no season.',
      whisper: 'Strange traders come and go from their camp.',
      roll() { const D = Cards.diff();
        return { gold: Math.round((28 + (G.rand() * 20 | 0)) * D.mag) + 25 * D.kick,
                 add: 3 + D.kick, until: 35 + ((G.rand() * 11) | 0) }; },
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
      roll() { const D = Cards.diff(); return { beasts: 1 + (D.kick > 1 ? 1 : 0), hpMult: D.mag }; },
      text(r) { return r.beasts > 1 ? `${r.beasts} great guard-beasts on the bounds` : 'a great guard-beast on the bounds'; },
      val(r) { return r.beasts * 140 * r.hpMult; },
      apply(side, r) {
        const bs = Cards._crew(side, 'bear', r.beasts);
        for (const b of bs) { b.maxhp = Math.round(b.maxhp * r.hpMult); b.hp = b.maxhp; }   // stouter on Calm, leaner on Hard
        if (side === 'P' && bs.length) G.log(bs.length > 1
          ? `🐻 ${bs.length} tamed great bears pace the bounds — wolves think twice`
          : '🐻 A tamed great bear paces the bounds — wolves think twice');
      },
    },
    pathfinder: {
      name: 'Pathfinder', motif: 'tracks', axis: null, syn: [],
      cat: 'explore', lean: 'horselord', bias: 'scout',
      flavor: 'Know the land before it knows you.',
      whisper: 'Their scouts walked your valley before you woke.',
      roll() { const D = Cards.diff();
        return { r: Math.round((11 + (G.rand() * 3 | 0)) * D.mag), scout: D.kick > 0 ? 1 : 0,
                 spots: [0, 0, 0, 0].slice(0, 2 + D.kick).map(() =>
                   ({ x: (G.rand() * CFG.W) | 0, y: (G.rand() * CFG.H) | 0 })) }; },
      text(r) { return `the land laid bare (sight ${r.r})${r.scout ? ' + a scout' : ''}`; },
      val(r) { return 40 + r.r * 5 + r.scout * 70 + r.spots.length * 8; },
      apply(side, r) {
        if (r.scout) Cards._crew(side, 'rider', 1);
        if (side !== 'P') return;   // the rival plays without fog — its gift is the scout + lean
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
      roll() { const D = Cards.diff();
        return { fast: D.kick, mult: 1 - 0.22 * D.mag, until: 25 + ((G.rand() * 11) | 0) }; },
      text(r) { return `building ${Math.round((1 - r.mult) * 100)}% faster${r.fast ? ` — first ${r.fast} near-instant` : ''}`; },
      val(r) { return (1 - r.mult) * 380 + r.fast * 90; },
      apply(side, r) { Cards._boon(side).haste = { fast: r.fast, mult: r.mult, until: r.until }; },
    },
    beastward: {
      name: 'Beastward', motif: 'antlers', axis: null, syn: ['food'],
      cat: 'econ', lean: 'forager', bias: 'spread',
      flavor: 'The wild is a neighbor, not an enemy.',
      whisper: 'Wolves walk past their herds without hunger.',
      roll() { const D = Cards.diff();
        return { hm: 1.5 + 0.55 * D.mag + G.rand() * 0.2, until: 25 + ((G.rand() * 11) | 0), kick: 30 * D.kick }; },
      text(r) { return `a truce with the wild & hunts yield ×${r.hm.toFixed(1)}`; },
      val(r) { return 55 + r.hm * 30 + (r.kick || 0); },
      apply(side, r) {
        Cards._boon(side).peace = { until: r.until };
        Cards._boon(side).hunt = { mult: r.hm, until: r.until };
        Cards._res(side).food += r.kick || 0;
      },
    },
    refugeehost: {
      name: 'Refugee Host', motif: 'crowd', axis: 'crew', syn: ['food'],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Open gates, growing tribe.',
      whisper: 'Strangers stream toward their fires, and stay.',
      roll() { const D = Cards.diff(); return { n: 2 + D.kick, tithe: Math.max(0, 18 - 6 * D.kick) }; },
      text(r) { return `+${r.n} villagers arrive${r.tithe ? ` (they eat ${r.tithe} food)` : ''}`; },
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
      roll() { const D = Cards.diff();
        return { food: Math.round((18 + (G.rand() * 18 | 0)) * D.mag) + 15 * D.kick,
                 fm: 1.2 + 0.32 * D.mag + G.rand() * 0.12 }; },
      text(r) { return `+${r.food} food; all fishing ×${r.fm.toFixed(1)} for good`; },
      val(r) { return r.food + (r.fm - 1) * 200; },
      apply(side, r) {
        Cards._res(side).food += r.food;
        Cards._boon(side).fish = { mult: r.fm };
      },
    },
    seer: {
      name: 'Seer', motif: 'eye', axis: null, syn: [],
      cat: 'def', lean: 'mason', bias: 'turtle',
      flavor: 'The bones never lie.',
      whisper: 'Their fires burn late — someone reads the stars.',
      roll() { const D = Cards.diff();
        return { jx: (G.rand() - 0.5) * 8, jy: (G.rand() - 0.5) * 8, lead: 2 + D.kick, spy: D.kick > 1 ? 1 : 0 }; },
      text(r) { return `raid warnings (${r.lead}d) + a far-seeing eye${r.spy ? ' on the rival' : ''}`; },
      val(r) { return 100 + r.lead * 20 + r.spy * 50; },
      apply(side, r) {
        if (side !== 'P') return;   // no fog on the rival's side — its gift is the lean
        const p = Bld.tcOf('P'), a = Bld.tcOf('A');
        const x = Math.max(0, Math.min(CFG.W - 1, Math.round((p && a ? (p.x + a.x) / 2 : CFG.W / 2) + r.jx)));
        const y = Math.max(0, Math.min(CFG.H - 1, Math.round((p && a ? (p.y + a.y) / 2 : CFG.H / 2) + r.jy)));
        Cards._boon('P').seer = { x, y, lead: r.lead };
        G.reveal(x, y, 4);
        if (r.spy && a) G.reveal(a.x, a.y, 5);
      },
    },
    ironhand: {
      name: 'Ironhand', motif: 'anvil', axis: null, syn: ['gold'],
      cat: 'aggro', lean: 'warlord', bias: 'raid',
      flavor: 'Cheap iron, dear blood.',
      whisper: 'Their anvil rings through the night.',
      roll() { const D = Cards.diff();
        return { off: (0.10 + G.rand() * 0.05) * D.mag, hp: 1 + 0.10 * D.mag, onB: D.kick }; },
      text(r) { return `soldiers ${Math.round(r.off * 100)}% cheaper & tougher${r.onB ? ` + ${r.onB} free at the barracks` : ''}`; },
      val(r) { return r.off * 700 + (r.hp - 1) * 500 + r.onB * 80; },
      apply(side, r) {
        Cards._boon(side).train = { costMult: 1 - r.off, hpMult: r.hp };
        Cards._onBuild(side, 'barracks', 'defender', r.onB);
      },
    },
    harvestlord: {
      name: 'Harvest Lord', motif: 'sickle', axis: 'food', syn: [],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'The soil answers to me.',
      whisper: 'Their fields stand taller than the season allows.',
      roll() { const D = Cards.diff();
        return { mult: 1 + (0.18 + G.rand() * 0.10) * D.mag, food: 40 * D.kick }; },
      text(r) { return `farms yield +${Math.round((r.mult - 1) * 100)}% for good`; },
      val(r) { return (r.mult - 1) * 480 + (r.food || 0); },
      apply(side, r) { Cards._boon(side).farm = { mult: r.mult }; Cards._res(side).food += r.food || 0; },
    },
    nomad: {
      name: 'Nomad', motif: 'tent', axis: null, syn: ['wood'],
      cat: 'explore', lean: 'forager', bias: 'spread',
      flavor: 'Home is where the fire is lit.',
      whisper: 'Their camp moved twice before it settled.',
      roll() { const D = Cards.diff();
        return { left: 3 + D.kick, costMult: Math.max(0.35, 1 - (0.35 + G.rand() * 0.10) * D.mag), timeMult: 0.55 }; },
      text(r) { return `first ${r.left} buildings ${Math.round((1 - r.costMult) * 100)}% cheaper & fast`; },
      val(r) { return r.left * (1 - r.costMult) * 90; },
      apply(side, r) { Cards._boon(side).nomad = { left: r.left, costMult: r.costMult, timeMult: r.timeMult }; },
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

  // worst-case econ delta a card can inflict — every boon is net-positive
  // (even the Refugee tithe is dwarfed by the villagers it brings), so this
  // backstop clamp never actually excludes a card; it stays as a guard rail
  _floorDelta() { return 0; },

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
      G.log(`🃏 Rival origin: ${cd.name}.`, false, 6400);
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
  // register a "when you first build X, N free units muster" kicker
  _onBuild(side, key, kind, n) {
    if (!n || n <= 0) return;
    const b = this._boon(side);
    b.onBuild = b.onBuild || {};
    b.onBuild[key] = { kind, n };
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
  // Firekeeper early haste (+ near-instant first builds) + Nomad first-buildings haste
  buildTimeMult(owner) {
    const b = this._b(owner);
    if (!b) return 1;
    let mult = 1;
    if (b.haste) {
      if (b.haste.fast > 0) mult *= 0.15;                              // the kicker: near-instant
      else if (S.day <= b.haste.until) mult *= b.haste.mult;
    }
    if (b.nomad && b.nomad.left > 0) mult *= b.nomad.timeMult;
    return mult;
  },
  // a paid placement burns one Nomad charge / one Firekeeper instant-build charge
  notePlaced(owner) {
    const b = this._b(owner);
    if (!b) return;
    if (b.nomad && b.nomad.left > 0) b.nomad.left--;
    if (b.haste && b.haste.fast > 0) b.haste.fast--;
  },
  // the "N free units when you first build X" kicker fires as the building finishes
  onBuildFinish(owner, bld) {
    const b = this._b(owner);
    if (!b || !b.onBuild) return;
    const k = b.onBuild[bld.key];
    if (!k) return;
    delete b.onBuild[bld.key];   // one-time
    const made = [];
    for (let i = 0; i < k.n; i++) {
      const s = MapGen.findNear(bld.x, bld.y + Bld.size(bld.key), 4,
        (x, y) => Path.passable(x, y, owner) && !Bld.at(x, y)) || { x: bld.x, y: bld.y + 1 };
      made.push(Units.spawn(k.kind, owner, s.x, s.y));
    }
    if (owner === 'P' && made.length)
      G.log(`⚔ ${CFG.UNITS[k.kind].name}${made.length > 1 ? ' ×' + made.length : ''} muster at the new ${Bld.def(bld.key).name}!`);
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
    const lead = b.seer.lead || 2;
    if (S.wave.next - S.day === lead && b.warned !== S.wave.next) {
      b.warned = S.wave.next;
      G.log(`🔮 The Seer casts the bones: barbarians will move within ${lead} day${lead > 1 ? 's' : ''}`, true, 5200);
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
    const C = ART.PALETTE;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const W = canvas.width, s = W / 32;   // 32-cell grid — higher fidelity than the old 24
    g.clearRect(0, 0, W, canvas.height);
    // plot on the 32-grid; drawn on transparency so the outline pass frames
    // every shape crisply against the card's wood panel
    const p = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect((x * s) | 0, (y * s) | 0, Math.ceil(w * s), Math.ceil(h * s)); };
    const M = this._MOTIFS[this.DEFS[key] ? this.DEFS[key].motif : 'hearth'] || this._MOTIFS.hearth;
    M(p, C, ART);
    if (window.ART && ART.outline) ART.outline(canvas);   // 1px dark ink edge = clarity
  },
  /* Higher-resolution placeholder motifs (32-grid, top-left light, 2–3
     shades each + an outline pass). Each reads clearly as the thing it
     represents. Real art still supersedes these via `ui/card/<key>`. */
  _MOTIFS: {
    hearth(p, C, A) {                                   // a home with its fire lit
      A.shadedRect(p, 8, 15, 15, 13, C.wood, 2);        // hut body
      for (let i = 0; i < 9; i++) p(6 + i, 14 - i, 20 - 2 * i, 1, i < 3 ? C.thatch[3] : C.thatch[2]);  // roof
      p(5, 14, 22, 2, C.thatch[1]);                     // eaves
      p(9, 16, 13, 1, C.wood[3]);                        // lit wall top
      p(18, 19, 5, 9, C.wood[1]);                        // window/shutter
      p(11, 20, 5, 8, C.ink[0]); p(12, 21, 3, 6, C.fire[1]);  // doorway, fire-glow within
      A.shadedCircle(p, 13, 25, 3, C.fire, 1); p(12, 21, 2, 4, C.fire[2]); p(13, 19, 1, 3, C.fire[3]);
    },
    spears(p, C, A) {                                   // crossed spears over a shield
      for (let i = 0; i < 26; i++) { p(4 + i, 29 - i, 2, 1, C.wood[3]); p(28 - i, 29 - i, 2, 1, C.wood[1]); }
      p(27, 3, 3, 4, C.stone[4]); p(28, 2, 2, 3, C.stone[3]);   // right spearhead
      p(3, 3, 3, 4, C.stone[4]); p(2, 2, 2, 3, C.stone[3]);     // left spearhead
      A.shadedCircle(p, 16, 17, 7, C.wood, 2);           // round shield
      A.shadedCircle(p, 16, 17, 3, C.gold, 1); p(15, 12, 2, 10, C.wood[1]);
    },
    rider(p, C, A) {                                    // horse and rider in profile
      A.shadedRect(p, 7, 15, 15, 6, C.hide, 2);          // barrel
      p(20, 10, 5, 6, C.hide[2]); p(23, 8, 3, 4, C.hide[3]); p(24, 7, 3, 2, C.hide[1]);  // neck, head, ear
      p(8, 21, 3, 6, C.hide[1]); p(12, 21, 3, 6, C.hide[2]); p(18, 21, 3, 6, C.hide[1]); p(15, 21, 3, 6, C.hide[2]);  // legs
      p(3, 13, 4, 6, C.hide[3]);                          // tail
      p(12, 9, 5, 6, C.skin[2]); p(12, 6, 5, 3, C.hair[1]); p(14, 3, 2, 3, C.hair[2]);   // rider torso + head
      p(17, 11, 3, 2, C.wood[2]);                         // arm/rein
    },
    longboat(p, C, A) {                                 // longboat with a sail on the water
      for (let i = 0; i < 26; i++) p(3 + i, 24 + (i % 4 < 2 ? 1 : 0), 1, 2, C.water[i % 3 + 1]);  // waves
      A.shadedRect(p, 6, 19, 20, 4, C.wood, 2);          // hull
      p(4, 17, 4, 3, C.wood[3]); p(24, 17, 4, 3, C.wood[3]);   // prow + stern rise
      p(15, 5, 2, 14, C.wood[1]);                         // mast
      A.shadedRect(p, 17, 6, 8, 9, C.bone, 1); p(17, 6, 8, 1, C.red[2]);  // sail with a red stripe
      p(15, 5, 10, 1, C.wood[3]);                         // yard
    },
    chisel(p, C, A) {                                   // dressed block, chisel and mallet
      A.shadedRect(p, 5, 15, 13, 13, C.stone, 2);        // stone block
      p(6, 16, 11, 1, C.stone[4]); p(6, 21, 11, 1, C.stone[1]); p(11, 16, 1, 12, C.stone[1]);  // courses
      for (let i = 0; i < 9; i++) p(16 + i, 13 - i, 2, 2, C.stone[3]);   // chisel shaft
      p(14, 14, 4, 3, C.stone[4]);                        // chisel tip on the block
      A.shadedRect(p, 22, 3, 7, 5, C.wood, 2); p(25, 7, 2, 6, C.wood[1]);  // mallet head + handle
    },
    basket(p, C, A) {                                   // a basket heaped with forage
      A.shadedCircle(p, 15, 11, 3, C.bloom, 0); A.shadedCircle(p, 11, 12, 2, C.fire, 1);
      A.shadedCircle(p, 19, 12, 2, [C.leaf[1], C.leaf[2], C.leaf[3]], 1); A.shadedCircle(p, 15, 9, 2, C.gold, 2);
      A.shadedRect(p, 8, 14, 16, 12, C.thatch, 1);        // basket body
      p(8, 14, 16, 2, C.wood[2]);                         // rim
      for (let i = 0; i < 4; i++) p(9 + i * 4, 16, 1, 10, C.wood[1]);   // weave verticals
      p(8, 20, 16, 1, C.wood[3]); p(8, 23, 16, 1, C.wood[3]);          // weave bands
    },
    axe(p, C, A) {                                      // axe buried in a log
      A.shadedRect(p, 4, 18, 22, 8, C.wood, 2);          // log
      A.shadedCircle(p, 9, 22, 2, C.wood[1]); A.shadedCircle(p, 20, 22, 2, C.wood[1]);  // end grain rings
      for (let i = 0; i < 12; i++) p(14 + i, 17 - i, 2, 2, C.wood[3]);   // haft
      A.shadedRect(p, 9, 10, 8, 8, C.stone, 3);          // axe head
      p(8, 11, 2, 6, C.stone[4]);                         // bit edge (lit)
      p(6, 26, 3, 2, C.wood[0]); p(22, 26, 3, 2, C.wood[0]);   // chips
    },
    wheat(p, C, A) {                                    // a bound sheaf
      for (const [dx, sh] of [[10, 2], [16, 3], [22, 1]]) {
        p(dx, 6, 2, 16, C.thatch[sh]);                   // stalk
        for (let i = 0; i < 5; i++) { p(dx - 2, 6 + i * 2, 2, 2, C.thatch[3]); p(dx + 2, 7 + i * 2, 2, 2, C.thatch[2]); }
        p(dx, 3, 2, 3, C.thatch[3]);                     // top grain
      }
      p(8, 21, 18, 3, C.wood[2]); p(8, 24, 18, 1, C.wood[1]);   // binding cord
    },
    boulder(p, C, A) {                                  // a great cracked rock
      A.shadedCircle(p, 16, 17, 10, C.stone, 2);
      p(10, 10, 5, 3, C.stone[4]); p(20, 22, 5, 3, C.stone[1]);   // lit crown / shaded base
      for (let i = 0; i < 6; i++) p(16 + i, 11 + i, 1, 2, C.stone[0]);   // crack
      p(12, 20, 3, 1, C.stone[0]); p(9, 15, 2, 1, C.stone[0]);           // chips
    },
    coins(p, C, A) {                                    // a spilling coin pouch
      A.shadedRect(p, 9, 12, 12, 13, C.hide, 1);         // pouch
      p(10, 11, 10, 2, C.wood[1]); p(13, 9, 4, 3, C.wood[2]);   // drawstring neck
      for (const [cx, cy, b] of [[7, 24, 2], [12, 26, 1], [18, 25, 2], [24, 24, 1], [15, 6, 2]])
        { A.shadedCircle(p, cx, cy, 2, C.gold, b); p(cx, cy, 1, 1, C.gold[3]); }   // coins
    },
    hound(p, C, A) {                                    // an alert seated hound
      A.shadedRect(p, 9, 16, 8, 9, C.pelt, 2);           // haunch/body
      p(15, 9, 6, 8, C.pelt[1]); p(19, 7, 4, 5, C.pelt[2]);   // chest, head
      p(18, 4, 2, 4, C.pelt[0]); p(22, 5, 2, 4, C.pelt[0]);   // ears
      p(21, 9, 2, 2, C.fire[2]);                          // eye-shine
      p(10, 25, 3, 4, C.pelt[0]); p(15, 24, 3, 5, C.pelt[1]);  // forelegs
      for (let i = 0; i < 6; i++) p(6 - i, 14 + i, 2, 2, C.pelt[2]);   // curved tail
    },
    tracks(p, C, A) {                                   // a compass rose
      A.shadedCircle(p, 16, 16, 11, C.wood, 2); A.shadedCircle(p, 16, 16, 8, C.bone, 1);
      for (let i = 0; i < 9; i++) { p(16, 5 + i, 2, 1, C.red[2]); }   // N needle
      for (let i = 0; i < 8; i++) { p(16, 16 + i, 2, 1, C.stone[2]); }  // S needle
      p(13, 7, 6, 3, C.red[1]);                           // N head
      p(15, 15, 3, 3, C.gold[2]);                          // hub
      p(16, 3, 1, 2, C.ink[0]); p(16, 27, 1, 2, C.ink[0]);
    },
    campfire(p, C, A) {                                 // stacked logs and a tall flame
      p(6, 24, 20, 3, C.wood[2]); p(9, 23, 14, 1, C.wood[3]);   // log pile
      for (let i = 0; i < 5; i++) p(8 + i * 4, 24, 2, 3, C.wood[0]);   // log ends
      A.shadedCircle(p, 16, 18, 5, C.fire, 1);
      p(13, 10, 4, 8, C.fire[2]); p(14, 6, 3, 5, C.fire[3]); p(15, 4, 2, 3, C.gold[3]);   // flame tongues
      p(19, 13, 2, 4, C.fire[2]);
    },
    antlers(p, C, A) {                                  // a stag's head
      A.shadedRect(p, 12, 17, 8, 9, C.hide, 2); p(13, 24, 6, 3, C.hide[1]);   // muzzle
      p(11, 14, 10, 4, C.hide[3]);                        // brow
      p(10, 20, 2, 2, C.ink[0]); p(20, 20, 2, 2, C.ink[0]);   // eyes
      for (const [ox, dir] of [[12, -1], [19, 1]]) {     // antlers
        for (let i = 0; i < 10; i++) p(ox + dir * (i < 5 ? 0 : i - 5), 14 - i, 2, 1, C.bone[1]);
        p(ox + dir * 3, 6, 2, 4, C.bone[2]); p(ox + dir, 9, 2, 3, C.bone[2]); p(ox + dir * 4, 3, 2, 3, C.bone[1]);
      }
    },
    crowd(p, C, A) {                                    // a gathering of newcomers
      for (const [ox, oy, sk] of [[6, 13, 1], [22, 13, 3], [13, 10, 2]]) {
        p(ox + 1, oy - 5, 5, 5, C.skin[sk]); p(ox + 1, oy - 7, 5, 2, C.hair[1]);   // head + hair
        A.shadedRect(p, ox, oy, 7, 11, C.hide, sk === 2 ? 2 : 1);                   // body/cloak
      }
    },
    reeds(p, C, A) {                                    // reeds and a leaping fish
      for (let i = 0; i < 28; i++) p(2 + i, 23 + (i % 5 < 2 ? 1 : 0), 1, 3, C.water[i % 3 + 1]);
      for (const [dx, h] of [[7, 15], [10, 18], [23, 16], [26, 13]]) {
        p(dx, 24 - h, 2, h, C.leaf[2]); p(dx, 24 - h - 2, 2, 3, C.soil[2]);   // reed + cattail
      }
      A.shadedRect(p, 13, 12, 8, 4, C.blue, 2); p(20, 12, 4, 4, C.blue[1]);   // fish body + tail
      p(14, 13, 1, 1, C.bone[2]); p(13, 11, 3, 2, C.blue[3]);                  // eye, splash
    },
    eye(p, C, A) {                                      // an all-seeing eye ringed in stars
      for (let i = 0; i < 9; i++) { p(7 + i, 16 - (i < 5 ? i : 8 - i), 2, 1, C.bone[2]); p(7 + i, 16 + (i < 5 ? i : 8 - i), 2, 1, C.bone[1]); }
      A.shadedCircle(p, 16, 16, 4, C.water, 2);
      p(14, 14, 3, 3, C.ink[0]); p(15, 15, 1, 1, C.bone[2]);   // pupil + glint
      for (const [sx, sy] of [[16, 4], [6, 8], [26, 8], [8, 24], [24, 24]])   // stars
        { p(sx, sy - 1, 1, 3, C.gold[2]); p(sx - 1, sy, 3, 1, C.gold[2]); }
    },
    anvil(p, C, A) {                                    // anvil, hammer and sparks
      A.shadedRect(p, 6, 14, 18, 4, C.stone, 2);         // face
      p(4, 14, 4, 2, C.stone[3]); p(23, 15, 3, 3, C.stone[1]);   // horn / heel
      p(12, 18, 6, 4, C.stone[0]); A.shadedRect(p, 9, 22, 12, 4, C.wood, 1);   // waist + base
      for (let i = 0; i < 8; i++) p(20 + i, 10 - i, 2, 2, C.wood[3]);   // hammer haft
      A.shadedRect(p, 16, 6, 6, 4, C.stone, 3);          // hammer head
      p(9, 11, 2, 2, C.gold[3]); p(13, 9, 1, 1, C.fire[3]); p(7, 13, 1, 1, C.gold[2]);   // sparks
    },
    sickle(p, C, A) {                                   // a sickle over cut grain
      for (let i = 0; i < 14; i++) { const y = 6 + ((i * i) / 11 | 0); p(8 + i, y, 2, 2, C.stone[3]); p(8 + i, y - 1, 1, 1, C.stone[4]); }
      p(20, 15, 3, 3, C.stone[3]);                        // blade root
      for (let i = 0; i < 8; i++) p(20 - i, 16 + i, 2, 2, C.wood[3]);   // handle
      for (const dx of [10, 14, 18]) { p(dx, 22, 2, 5, C.thatch[2]); p(dx - 1, 21, 4, 2, C.thatch[3]); }   // grain sheaf
    },
    tent(p, C, A) {                                     // a nomad's tent by the fire
      for (let i = 0; i < 11; i++) { p(15 - i, 6 + i * 2, 1, 2, C.hide[3]); p(16 + i, 6 + i * 2, 1, 2, C.hide[1]); }
      for (let i = 1; i < 11; i++) p(16 - i, 6 + i * 2, 2 * i, 2, i % 2 ? C.hide[2] : C.hide[1]);   // fill
      p(14, 18, 4, 8, C.ink[0]);                          // door flap
      p(15, 3, 2, 4, C.wood[2]); p(13, 4, 6, 1, C.wood[1]);   // pole + ties
      A.shadedCircle(p, 25, 24, 2, C.fire, 1); p(25, 21, 1, 3, C.fire[3]);   // campfire
    },
  },
};

// classic-script global (const declarations are not window properties)
window.Cards = Cards;
