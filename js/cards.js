"use strict";
/* ORIGIN CARDS — the unified draft (player + rival).
   At game start both tribes are dealt 3 cards from one 26-card pool and keep
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
    // Hard's opening was gutted (half-strength boons AND no free units) right as
    // the first wave lands — the hardest turn to survive. It still draws the
    // weakest hand (mag below Moderate), but now gets the one-unit kicker so a
    // "start with defenders" card actually fields a defender or two.
    hard:     { mag: 0.82, kick: 1 },
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
        return { r: Math.round((10 + (G.rand() * 4 | 0)) * D.mag), onB: D.kick,
                 cm: 1 + Math.round(8 * D.mag) / 100 }; },
      text(r) { return `a scout + far sight; swifter riders${r.onB ? `, ${r.onB} free at the stable` : ''}`; },
      val(r) { return 60 + r.r * 4 + r.onB * 70 + (r.cm - 1) * 500; },
      apply(side, r) {
        Cards._boon(side).cav = { mult: r.cm };   // stamped at spawn — see onSpawn
        Cards._crew(side, 'rider', 1);
        Cards._onBuild(side, 'stable', 'rider', r.onB);
        for (const u of S.units) if (u.owner === side &&
          (u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer'))
          u.speed = Math.round(u.speed * r.cm * 100) / 100;
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
      whisper: 'Their gatherers range farther than most dare.',
      roll() { const D = Cards.diff();
        return { food: Math.round((16 + (G.rand() * 14 | 0)) * D.mag),
                 wood: Math.round((16 + (G.rand() * 14 | 0)) * D.mag),
                 stone: Math.round((10 + (G.rand() * 14 | 0)) * D.mag),
                 kick: 30 * D.kick, pm: 1 + Math.round(8 * D.mag + 3) / 100 }; },
      text(r) { return `mixed stores; your folk walk ${Math.round((r.pm - 1) * 100)}% faster for good`; },
      val(r) { return r.food + r.wood + 0.8 * r.stone + (r.kick || 0) + (r.pm - 1) * 900; },
      apply(side, r) {
        const res = Cards._res(side);
        res.food += r.food + (r.kick || 0); res.wood += r.wood; res.stone += r.stone;
        // QUICK FEET, not a gather multiplier: the pace is STAMPED on the unit
        // at spawn (and on the hands already standing), never read per frame —
        // the same spawn-time convention Ironhand's toughness uses
        Cards._boon(side).pace = { mult: r.pm };
        for (const u of S.units) if (u.owner === side && u.kind === 'villager')
          u.speed = Math.round(u.speed * r.pm * 100) / 100;
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
      text(r) { return `a worked Lumber Camp on a felled stand + ${r.wood} wood`; },
      val(r) { return 130 + r.wood + (r.gm - 1) * 260; },
      apply(side, r) {
        /* fell ONE stand by hand so the camp keeps the worked-ground rule's
           spirit: the stand is SPENT (stumps), then the camp is raised on it —
           the trio is complete now (Grainkeeper=farm, Stoneheart=quarry) */
        const tc = Bld.tcOf(side);
        const stand = tc && MapGen.findNear(tc.x, tc.y, 7, (x, y) =>
          S.map.terrain[MapGen.idx(x, y)] === T.FOREST);
        let camp = null;
        if (stand) {
          const ti = MapGen.idx(stand.x, stand.y);
          S.map.terrain[ti] = T.STUMPS;
          if (S.map.resAmount) S.map.resAmount[ti] = 0;
          if (window.R && R.updateTile) R.updateTile(stand.x, stand.y);
          camp = Bld.place(side, 'lumber', stand.x, stand.y, { free: true, instant: true, noAutoAssign: true });
        }
        if (camp) { const v = Cards._crew(side, 'villager', 1)[0]; if (v && side === 'P') v.task = { type: 'work', id: camp.id }; }
        else r.wood += 60;   // no stand in reach — a taller wood pile instead
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
      name: 'Caravan Master', motif: 'cart', axis: null, syn: ['gold'],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'Everything is for sale somewhere.',
      whisper: 'Laden carts already creak out of their camp.',
      roll() { const D = Cards.diff();
        return { gold: Math.round((30 + (G.rand() * 16 | 0)) * D.mag) + 20 * D.kick }; },
      text(r) { return `a Trading Post from day one + ${r.gold} gold`; },
      val(r) { return 200 + r.gold * 0.9; },
      apply(side, r) {
        /* the post normally waits on a level-3 hall — the caravan that never
           left home doesn't. Trade what the map denies you, at the post's own
           stingy rates (CFG.TRADE untouched: the gift is the DOOR, not the price) */
        const post = Cards._prebuild(side, 'trade');
        if (!post) r.gold += 120;   // nowhere to stand it — a fat purse instead
        Cards._res(side).gold += r.gold;
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
      name: 'Hearthbond', motif: 'bond', axis: null, syn: ['food'],
      cat: 'econ', lean: 'homesteader', bias: 'boom',
      flavor: 'The field loves the family that sleeps beside it.',
      whisper: 'Their houses go up beside their fields, always.',
      roll() { const D = Cards.diff();
        return { food: Math.round(10 * D.mag) / 100, pop: 1, kick: 30 * D.kick }; },
      text(r) { return `homesteads bond double: +${Math.round((0.10 + r.food) * 100)}% food & +${1 + r.pop} folk`; },
      val(r) { return 150 + r.food * 900 + r.pop * 60 + (r.kick || 0); },
      apply(side, r) {
        /* the town-planning card: every house-beside-farm bond (the homestead,
           tests/homestead.mjs) runs deeper for this tribe — the boon reads
           through Bld.homesteadMult/homesteadPop, so it is as DERIVED as the
           bond itself and vanishes with either half exactly as the base does */
        Cards._boon(side).home = { food: r.food, pop: r.pop };
        Cards._res(side).food += r.kick || 0;
      },
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
    /* ---- the strategy-openers: each plants a BUILDING the tech tree would
       make you wait for, so the run starts already leaning a direction ---- */
    bowyer: {
      name: 'Bowyer', motif: 'bow', axis: null, syn: ['wood'],
      cat: 'def', lean: 'warlord', bias: null,
      flavor: 'A wall of air and arrows.',
      whisper: 'Straw targets stand bristling outside their camp.',
      roll() { const D = Cards.diff(); return { n: 1 + (D.kick > 1 ? 1 : 0) }; },
      text(r) { return `an Archery Range stands built + ${r.n} archer${r.n > 1 ? 's' : ''}`; },
      val(r) { return 150 + r.n * 75; },
      apply(side, r) {
        // the range normally waits on a level-2 hall; the bowyer brought his own
        const b = Cards._prebuild(side, 'range');
        if (!b) Cards._res(side).wood += 90;
        Cards._crew(side, 'archer', r.n);
      },
    },
    seareaver: {
      name: 'Sea-Reaver', motif: 'warship', axis: null, syn: [],
      cat: 'naval', lean: 'mariner', bias: 'sea', needsShore: true,
      flavor: 'We did not walk here.',
      whisper: 'A war-hull rides at anchor off their shore.',
      roll() { const D = Cards.diff(); return { hpMult: D.mag, raft: D.kick > 1 ? 1 : 0 }; },
      text(r) { return `the old Fire Warship${r.raft ? ' + a transport' : ''} — no dock behind her`; },
      val(r) { return 200 * r.hpMult + r.raft * 60; },
      apply(side, r) {
        /* the hull that carried the tribe here — a dock-L2 warship on day one,
           and the other edge of that sword: no yard stands behind her. Lose
           her and the sea is closed until you build one yourself */
        const tc = Bld.tcOf(side);
        const at = tc && MapGen.findNear(tc.x, tc.y, 11, (x, y) =>
          S.map.terrain[MapGen.idx(x, y)] === T.WATER);
        if (!at) { Cards._res(side).wood += 120; return; }   // gated at offer; belt & braces
        const ship = Units.spawn('fireship', side, at.x, at.y);
        ship.maxhp = Math.round(ship.maxhp * r.hpMult); ship.hp = ship.maxhp;
        if (r.raft) {
          const at2 = MapGen.findNear(at.x, at.y, 3, (x, y) =>
            (x !== at.x || y !== at.y) && S.map.terrain[MapGen.idx(x, y)] === T.WATER) || at;
          Units.spawn('transport', side, at2.x, at2.y);
        }
        if (side === 'P') G.reveal(at.x, at.y, 4);
      },
    },
    delver: {
      name: 'Delver', motif: 'spade', axis: null, syn: ['stone'],
      cat: 'def', lean: 'mason', bias: 'turtle',
      flavor: 'The ground is only a suggestion.',
      whisper: 'Fresh-turned earth scars the land around their camp.',
      roll() { const D = Cards.diff(); return { lv: D.kick > 1 ? 2 : 1 }; },
      text(r) { return `a Sappers' Camp${r.lv > 1 ? ' (Lv 2)' : ''} + a sapper, from day one`; },
      val(r) { return 170 + (r.lv - 1) * 70; },
      apply(side, r) {
        // the camp normally waits on a level-2 hall — moats and causeways
        // from the first morning are this hand's whole identity
        const camp = Cards._prebuild(side, 'sapper', undefined, { level: r.lv });
        if (!camp) Cards._res(side).stone += 80;
        Cards._crew(side, 'sapper', 1);
      },
    },
    prospector: {
      name: 'Prospector', motif: 'vein', axis: null, syn: ['gold'],
      cat: 'explore', lean: 'horselord', bias: 'scout',
      flavor: 'The mountain whispers where it bleeds.',
      whisper: 'They tap every rock they pass, listening.',
      roll() { const D = Cards.diff();
        return { mm: 1 + Math.round(45 * D.mag) / 100, gold: 15 * D.kick + Math.round(10 * D.mag) }; },
      text(r) { return `every gold seam marked on the map; mines +${Math.round((r.mm - 1) * 100)}%`; },
      val(r) { return 90 + (r.mm - 1) * 260 + r.gold; },
      apply(side, r) {
        Cards._res(side).gold += r.gold;
        Cards._boon(side).mine = { mult: r.mm };
        const terr = S.map.terrain;
        if (side === 'P') {
          for (let i = 0; i < terr.length; i++)
            if (terr[i] === T.GOLDORE) G.reveal(i % CFG.W, (i / CFG.W) | 0, 2);
        } else if (S.ai) {
          /* the rival plays fogless, but its CHIEF acts only on remembered
             ground (ai.seen — tests/gold-mine.mjs) — the prospector's gift is
             that memory, pre-written, so maybeMine can race for the seams */
          if (!S.ai.seen || S.ai.seen.length !== terr.length) S.ai.seen = new Array(terr.length).fill(0);
          for (let i = 0; i < terr.length; i++) if (terr[i] === T.GOLDORE) S.ai.seen[i] = 1;
        }
      },
    },
    warden: {
      name: 'Warden', motif: 'watchtower', axis: null, syn: ['stone'],
      cat: 'def', lean: 'mason', bias: 'turtle',
      flavor: 'Nothing crosses the bounds unseen.',
      whisper: 'A tower already watches from their boundary.',
      roll() { const D = Cards.diff(); return { add: Math.max(1, Math.round(2 * D.mag)) }; },
      text(r) { return `a Watchtower stands; all towers see +${r.add} farther`; },
      val(r) { return 130 + r.add * 45; },
      apply(side, r) {
        const t = Cards._prebuild(side, 'tower');
        if (!t) Cards._res(side).stone += 60;
        Cards._boon(side).sight = { add: r.add };   // read in G.updateVisibility
      },
    },
    huntlord: {
      name: 'Master of the Hunt', motif: 'horn', axis: null, syn: ['food'],
      cat: 'econ', lean: 'forager', bias: 'spread',
      flavor: 'Meat walks. We follow.',
      whisper: 'Horns and hounds sound from their woods at dawn.',
      roll() { const D = Cards.diff();
        return { hm: 1.2 + Math.round(15 * D.mag) / 100, game: 2 + D.kick }; },
      text(r) { return `a worked Hunter's Lodge, game near, hunts ×${r.hm.toFixed(1)}`; },
      val(r) { return 120 + (r.hm - 1) * 200 + r.game * 15; },
      apply(side, r) {
        const tc = Bld.tcOf(side);
        // blood the ground first — a lodge stands only on a killing ground
        let lodge = null;
        if (tc) {
          const spot = MapGen.findNear(tc.x, tc.y, 7, (x, y) => Bld.tileFree(x, y));
          if (spot) {
            G.noteHunt(spot.x, spot.y);
            lodge = Bld.place(side, 'lodge', spot.x, spot.y, { free: true, instant: true, noAutoAssign: true });
          }
        }
        if (lodge) { const v = Cards._crew(side, 'villager', 1)[0]; if (v && side === 'P') v.task = { type: 'work', id: lodge.id }; }
        else Cards._res(side).food += 60;
        if (tc) Units.seedGameNear(tc.x, tc.y, r.game);
        Cards._boon(side).hunt = { mult: r.hm, until: 100000 };   // a life's craft, not a season's
      },
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
      if (d.needsShore && !this._shore(side)) continue;   // a warship needs water at the door
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
      if (!pool.length) break;    // can't happen with a 26-card pool, but never loop
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
  // open water within a warship's reach of the hall — the Sea-Reaver's gate
  _shore(side) {
    const tc = Bld.tcOf(side);
    return !!(tc && MapGen.findNear(tc.x, tc.y, 11, (x, y) =>
      S.map.terrain[MapGen.idx(x, y)] === T.WATER));
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
  /* a finished workplace beside the hall — near its bonus terrain if any is
     close. FOOTPRINT-AWARE: the primary works claim 2×2 (tests/footprint.mjs)
     and Bld.place with free+instant validates NOTHING, so every tile of the
     plot is checked here or a gifted range lands inside somebody's house. */
  _prebuild(side, key, terr, opts) {
    const tc = Bld.tcOf(side);
    if (!tc) return null;
    const sz = Bld.size(key);
    const fits = (x, y) => {
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++)
        if (!Bld.tileFree(x + dx, y + dy)) return false;
      return true;
    };
    let spot = null;
    if (terr !== undefined) {
      spot = MapGen.findNear(tc.x, tc.y, 7, (x, y) => {
        if (!fits(x, y)) return false;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++)
          if (MapGen.inB(x + ox, y + oy) && S.map.terrain[MapGen.idx(x + ox, y + oy)] === terr) return true;
        return false;
      });
      if (key === 'quarry' && !spot) return null;   // Stoneheart: no hills → the stone pile instead
    }
    if (!spot) spot = MapGen.findNear(tc.x + 2, tc.y + 1, 6 + sz, fits);
    if (!spot) return null;
    const b = Bld.place(side, key, spot.x, spot.y, { free: true, instant: true, noAutoAssign: true });
    // an origin gift can arrive a tier up (the Delver's Lv 2 camp on Calm)
    if (b && opts && opts.level > 1) {
      const lv = Math.min(opts.level, Bld.def(key).levels.length);
      b.level = lv;
      const spec = Bld.def(key).levels[lv - 1];
      b.maxhp = spec.hp; b.hp = spec.hp;
    }
    return b;
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
      const s = MapGen.findNear(bld.x, bld.y + Bld.size(bld), 4,
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
  // spawn-time stat stamps: Ironhand toughness, Forager quick feet,
  // Horselord saddle-born cavalry — stamped ONCE, never read per frame
  onSpawn(u) {
    const b = this._b(u.owner);
    if (!b) return;
    if (b.train && Units.isMilitary(u)) {
      u.hp = Math.round(u.hp * b.train.hpMult);
      u.maxhp = Math.round(u.maxhp * b.train.hpMult);
    }
    if (b.pace && u.kind === 'villager')
      u.speed = Math.round(u.speed * b.pace.mult * 100) / 100;
    if (b.cav && (u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer'))
      u.speed = Math.round(u.speed * b.cav.mult * 100) / 100;
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
  // legacy Harvest Lord farms + the Prospector's mines
  prodMult(owner, bld) {
    const b = this._b(owner);
    if (!b) return 1;
    if (b.farm && bld.key === 'farm') return b.farm.mult;
    if (b.mine && bld.key === 'mine') return b.mine.mult;
    return 1;
  },
  // Hearthbond: every homestead bond runs deeper for its holder — read through
  // Bld.homesteadMult/homesteadPop so the boon stays as DERIVED as the bond
  homeAdd(owner) { const b = this._b(owner); return b && b.home ? b.home.food : 0; },
  homePop(owner) { const b = this._b(owner); return b && b.home ? b.home.pop : 0; },
  // Warden: towers watch farther (read in G.updateVisibility's building mark)
  towerSight(owner) { const b = this._b(owner); return b && b.sight ? b.sight.add : 0; },
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
     PLACEHOLDER: procedural motifs in the house palette (ART ramps, top-left
     light, hard value steps, ink outline) until real card art lands. Real
     art loads by FILENAME (assets/icons/origins/{motif}.png — see
     Assets.setOriginArt) into `ui/card/<key>` with zero code change here —
     drawMotif prefers the image when it exists. The `_cfCardKey` stamp is
     how a late-decoding icon finds an already-dealt card to repaint. */
  drawMotif(canvas, key) {
    canvas._cfCardKey = key;
    if (window.Assets && Assets.isImage && Assets.isImage('ui/card/' + key)) {
      /* the backing store adopts the image's NATIVE size (CSS keeps the
         shown size; image-rendering: pixelated does the final scale) — a
         128px icon squeezed into the rival reveal's 96px canvas with
         smoothing off would drop every fourth row, and a high-DPR phone
         gets the full source instead of a pre-shrunk copy. */
      const img = Assets.resolve('ui/card/' + key);
      if (img && img.width && (canvas.width !== img.width || canvas.height !== img.height)) {
        canvas.width = img.width; canvas.height = img.height;
      }
      const g0 = canvas.getContext('2d');
      g0.imageSmoothingEnabled = false;
      g0.clearRect(0, 0, canvas.width, canvas.height);
      Assets.drawSprite(g0, 'ui/card/' + key, 0, 0, { w: canvas.width, h: canvas.height });
      return;
    }
    const C = ART.PALETTE;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const W = canvas.width, s = W / 64;   // 64-cell grid — 4× the pixel count of the old 32
    g.clearRect(0, 0, W, canvas.height);
    // plot on the 64-grid; drawn on transparency so the outline pass frames
    // every shape crisply against the card's wood panel
    const p = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect((x * s) | 0, (y * s) | 0, Math.ceil(w * s), Math.ceil(h * s)); };
    const M = this._MOTIFS[this.DEFS[key] ? this.DEFS[key].motif : 'hearth'] || this._MOTIFS.hearth;
    M(p, C, ART);
    /* the ink edge. NOT guarded with `window.ART &&` — ART is a script-level
       const, so window.ART is UNDEFINED and that guard silently disabled the
       whole outline pass (the window.G / window.Sprites / window.UI trap,
       again). ART.PALETTE is already read bare five lines up. */
    ART.outline(canvas);
  },
  /* 64-grid motifs (finer than the 32-grid set they replace): top-left light,
     3+ hard value steps each, a dark under-rim where mass meets ground, and
     the outline pass for the ink edge. Each reads as the thing it names at
     the 64px the card shows it at. Real art still supersedes these via
     `ui/card/<key>`. */
  _MOTIFS: {
    hearth(p, C, A) {                                   // a roundhouse, hearth lit, smoke rising
      p(12, 57, 40, 2, C.ink[1]);                        // ground shadow
      A.shadedRect(p, 14, 36, 36, 21, C.wood, 2);        // wattle wall
      for (let x = 17; x < 48; x += 6) p(x, 38, 1, 18, C.wood[1]);   // stakes
      for (let i = 0; i < 25; i++) {                     // conical thatch roof
        const w = 4 + i * 2.1, y = 12 + i;
        p(32 - w / 2, y, w, 1, i < 7 ? C.thatch[3] : (i % 5 === 4 ? C.thatch[1] : C.thatch[2]));
      }
      p(6, 36, 52, 3, C.thatch[1]);                      // deep eaves
      p(6, 36, 26, 1, C.thatch[2]);                      // lit eave edge
      p(30, 8, 4, 5, C.thatch[1]);                       // smoke-hole collar
      p(27, 44, 10, 13, C.ink[0]);                       // doorway
      p(29, 47, 6, 10, C.fire[1]);                       // hearth-glow within
      p(30, 49, 4, 8, C.fire[2]); p(31, 51, 2, 5, C.fire[3]);
      p(28, 44, 1, 13, C.wood[3]); p(35, 44, 1, 13, C.wood[3]);   // door posts
      for (const [sx, sy] of [[33, 5], [35, 2], [30, 1]]) p(sx, sy, 2, 2, C.bone[1]);   // smoke
    },
    spears(p, C, A) {                                   // crossed spears behind a bossed shield
      for (let i = 0; i < 48; i++) {                     // the two shafts
        p(8 + i, 58 - i, 3, 1, C.wood[3]);
        p(53 - i, 58 - i, 3, 1, C.wood[1]);
      }
      p(52, 8, 6, 8, C.slate[4]); p(54, 4, 3, 6, C.slate[5]); p(53, 6, 2, 4, C.bone[2]);  // right head
      p(6, 8, 6, 8, C.slate[4]); p(7, 4, 3, 6, C.slate[5]);                               // left head
      A.shadedCircle(p, 32, 34, 15, C.wood, 2);          // round shield
      for (let a = 0; a < 8; a++) {                      // iron rim studs
        const th = a * Math.PI / 4 + 0.4;
        p(32 + Math.round(Math.cos(th) * 12), 34 + Math.round(Math.sin(th) * 12), 2, 2, C.slate[3]);
      }
      A.shadedCircle(p, 32, 34, 6, C.gold, 1);           // the boss
      p(29, 30, 3, 3, C.gold[3]);                        // boss glint
      p(20, 34, 24, 1, C.wood[1]);                       // plank seam
    },
    rider(p, C, A) {                                    // horse and rider at the trot
      p(10, 56, 46, 2, C.ink[1]);
      A.shadedRect(p, 14, 32, 25, 12, C.hide, 2);        // barrel
      for (let i = 0; i < 16; i++) p(35 + (i * 0.65 | 0), 31 - i, 7, 4, C.hide[2]);   // arched neck
      p(46, 12, 10, 8, C.hide[3]);                       // head, below the rider's
      p(54, 16, 5, 5, C.hide[1]);                        // muzzle
      p(57, 19, 2, 2, C.ink[1]);                         // nostril
      p(52, 20, 4, 3, C.hide[2]);                        // jaw
      p(46, 7, 3, 6, C.hide[1]);                         // ear
      p(50, 14, 2, 2, C.ink[0]);                         // eye
      for (let i = 0; i < 16; i++) p(34 + (i * 0.65 | 0), 29 - i, 3, 2, C.pelt[0]);   // mane down the neck
      p(16, 43, 4, 12, C.hide[1]); p(22, 43, 4, 12, C.hide[2]);      // hind legs
      p(31, 43, 4, 12, C.hide[2]); p(37, 40, 4, 9, C.hide[1]);       // forelegs, one lifted
      p(16, 54, 4, 2, C.ink[1]); p(22, 54, 4, 2, C.ink[1]); p(31, 54, 4, 2, C.ink[1]);   // hooves
      for (let i = 0; i < 12; i++) p(10 + (i / 3 | 0), 28 + i, 3, 2, C.pelt[1]);     // tail
      p(20, 30, 14, 3, C.red[1]);                        // saddle-cloth
      p(23, 32, 3, 9, C.red[1]);                         // rider's near leg
      A.shadedRect(p, 21, 16, 11, 15, C.red, 2);         // rider tunic
      p(21, 16, 3, 15, C.red[3]);                        // lit shoulder
      p(26, 22, 2, 2, C.gold[2]);                        // belt clasp
      p(23, 8, 7, 7, C.skin[2]); p(23, 6, 7, 3, C.hair[1]);          // head + hair — the highest thing
      p(31, 19, 8, 3, C.skin[2]);                        // rein arm to the crest
      for (let i = 0; i < 8; i++) p(39 + i * 2, 21 - (i / 3 | 0), 2, 1, C.hide[0]);  // the rein
    },
    longboat(p, C, A) {                                 // fishing longboat under sail
      for (let i = 0; i < 56; i++)                       // swell
        p(4 + i, 50 + (Math.sin(i * 0.5) > 0.2 ? 1 : 0), 1, 3, C.water[1 + (i % 3)]);
      for (let i = 0; i < 6; i++) p(8 + i * 2, 44 + i, 48 - i * 4, 1, C.wood[2 - (i > 3 ? 1 : 0)]);  // hull sweep
      p(10, 42, 44, 3, C.wood[3]);                       // gunwale
      p(6, 34, 5, 10, C.wood[3]); p(53, 34, 5, 10, C.wood[3]);   // prow + stern posts
      p(6, 32, 3, 4, C.wood[4]);                         // prow curl
      p(31, 8, 2, 34, C.wood[1]);                        // mast
      p(20, 9, 25, 2, C.wood[3]);                        // yard
      A.shadedRect(p, 21, 11, 23, 18, C.bone, 1);        // sail
      p(21, 15, 23, 3, C.red[2]); p(21, 22, 23, 3, C.red[2]);    // stripes
      p(21, 11, 2, 18, C.bone[0]);                       // sail shade at the luff
      for (const x of [16, 26, 38, 48]) p(x, 40, 2, 4, C.slate[2]);   // oars shipped
      p(33, 4, 6, 3, C.red[1]);                          // masthead pennant
    },
    chisel(p, C, A) {                                   // the mason at his block
      p(6, 56, 40, 2, C.ink[1]);
      // the block: lit top face, two working faces, one corner chiselled away
      A.shadedRect(p, 8, 26, 32, 30, C.granite, 3);
      p(9, 26, 30, 3, C.granite[4]);                     // lit crown
      p(9, 26, 30, 1, C.granite[5]);
      for (let i = 0; i < 7; i++) p(8, 28 + i * 4, 2, 2, C.granite[2]);   // rough undressed west edge
      p(8, 44, 13, 1, C.granite[1]); p(25, 44, 15, 1, C.granite[1]);      // broken course joint
      p(30, 30, 10, 10, C.bone[2]);                      // the fresh-cut scar
      p(31, 31, 7, 3, C.bone[1]);
      for (let i = 0; i < 14; i++) p(37 + i, 29 - i, 4, 4, C.slate[3]);   // chisel, thick, biting the corner
      p(37, 27, 4, 4, C.slate[5]);                       // the edge at the stone
      p(33, 24, 3, 3, C.bone[2]); p(29, 21, 2, 2, C.bone[1]); p(36, 18, 2, 2, C.bone[2]);   // struck chips
      A.shadedRect(p, 46, 34, 12, 9, C.wood, 2);         // mallet at rest
      p(49, 43, 4, 13, C.wood[1]);
      p(47, 35, 10, 2, C.wood[3]);
      p(12, 50, 5, 3, C.granite[2]); p(20, 52, 4, 2, C.granite[1]);   // spall on the ground
    },
    basket(p, C, A) {                                   // a basket heaped with forage
      p(10, 57, 44, 2, C.ink[1]);
      A.shadedCircle(p, 25, 27, 5, C.berry, 1);          // heap: dark berries
      A.shadedCircle(p, 36, 25, 5, C.berry, 2); p(34, 23, 2, 2, C.berry[3]);
      A.shadedCircle(p, 45, 29, 4, [C.leaf[1], C.leaf[2], C.leaf[3]], 1);   // greens
      A.shadedCircle(p, 18, 30, 4, C.gold, 2); p(17, 28, 2, 2, C.gold[3]);  // wild apple
      p(30, 17, 2, 5, C.wood[1]); p(28, 15, 6, 3, C.leaf[2]);              // a sprig
      A.shadedRect(p, 12, 30, 40, 26, C.thatch, 1);      // basket body
      p(12, 30, 40, 3, C.wood[2]); p(12, 30, 20, 1, C.wood[3]);            // rim
      for (let i = 0; i < 7; i++) p(15 + i * 6, 34, 2, 22, C.wood[1]);     // weave ribs
      p(12, 39, 40, 2, C.thatch[3]); p(12, 47, 40, 2, C.thatch[3]);        // weave bands
      p(12, 54, 40, 2, C.thatch[0]);                     // under-rim shade
    },
    axe(p, C, A) {                                      // the felling axe in a stump
      p(12, 57, 40, 2, C.ink[1]);
      A.shadedRect(p, 16, 36, 32, 21, C.wood, 2);        // stump body
      for (let x = 19; x < 46; x += 5) p(x, 40, 1, 14, C.wood[1]);   // bark ribs
      p(18, 32, 28, 6, C.bone[1]);                       // cut face (pale heartwood)
      p(20, 33, 24, 1, C.bone[2]);
      for (let r = 3; r < 12; r += 4) {                  // growth rings
        p(32 - r, 34, r * 2, 1, C.bone[0]);
      }
      for (let i = 0; i < 20; i++) p(38 + (i * 0.8 | 0), 30 - i, 4, 3, C.wood[3]);   // haft
      A.shadedRect(p, 26, 20, 13, 12, C.slate, 3);       // axe head, hung on the haft
      p(37, 22, 4, 4, C.wood[1]);                        // the eye where they meet
      p(24, 22, 3, 10, C.bone[2]);                       // honed bit, buried in the cut
      p(24, 30, 4, 3, C.bone[1]);
      p(8, 52, 5, 3, C.wood[0]); p(52, 50, 4, 3, C.wood[0]);   // chips
      p(10, 50, 3, 2, C.bone[1]);
    },
    wheat(p, C, A) {                                    // the bound sheaves
      p(12, 57, 40, 2, C.ink[1]);
      for (const [dx, sh, tall] of [[20, 2, 0], [32, 3, 3], [44, 1, 1]]) {
        p(dx - 1, 16 - tall, 3, 40 + tall, C.thatch[sh]);          // stalk bundle
        p(dx - 4, 20 - tall, 2, 32 + tall, C.thatch[sh === 3 ? 2 : 1]);
        p(dx + 3, 20 - tall, 2, 32 + tall, C.thatch[sh === 1 ? 2 : 1]);
        for (let i = 0; i < 7; i++) {                    // grain head + awns
          p(dx - 3 - (i % 2), 8 - tall + i * 2, 3, 2, C.thatch[3]);
          p(dx + 1 + (i % 2), 9 - tall + i * 2, 3, 2, C.thatch[2]);
        }
        p(dx - 1, 4 - tall, 3, 4, C.thatch[3]);
      }
      A.shadedRect(p, 14, 42, 36, 5, C.wood, 2);         // binding cord
      p(30, 40, 4, 9, C.wood[1]);                        // the knot
    },
    boulder(p, C, A) {                                  // the great cracked rock
      p(10, 56, 44, 3, C.ink[1]);
      // angular mass: three planes, never a circle (the rock language)
      for (let i = 0; i < 20; i++) p(16 - (i > 12 ? i - 12 : 0), 18 + i, 34 + i, 1, C.granite[3]);   // body
      for (let i = 0; i < 18; i++) p(12, 38 + i, 42 - (i > 12 ? (i - 12) * 2 : 0), 1, C.granite[2]); // base plane
      for (let i = 0; i < 9; i++) p(20 + i, 14 + i, 22 - i, 1, C.granite[5]);   // lit crown plane
      for (let i = 0; i < 22; i++) p(40 + (i / 3 | 0), 22 + i, 8 - (i / 4 | 0), 1, C.granite[1]);   // shadow plane
      for (let i = 0; i < 16; i++) p(30 + (i % 5 < 2 ? 1 : 0), 20 + i, 2, 1, C.granite[0]);   // the crack
      p(28, 36, 3, 2, C.granite[0]); p(33, 40, 2, 2, C.granite[0]);
      p(14, 34, 8, 6, C.bone[2]); p(15, 35, 5, 2, C.bone[1]);    // quarried pale scar
      p(8, 52, 4, 3, C.granite[2]); p(52, 50, 5, 4, C.granite[1]);   // fallen chips
    },
    cart(p, C, A) {                                     // the laden trade cart
      p(4, 56, 56, 2, C.ink[1]);
      A.shadedCircle(p, 19, 43, 12, C.wood, 2);          // wheels — big, spoked
      A.shadedCircle(p, 45, 43, 12, C.wood, 2);
      for (const cx of [19, 45]) {
        A.shadedCircle(p, cx, 43, 8, [C.ink[1], C.ink[1], C.ink[1]], 1);   // between rim and hub
        p(cx - 1, 33, 2, 21, C.wood[2]);                 // spokes
        p(cx - 10, 42, 21, 2, C.wood[2]);
        A.shadedCircle(p, cx, 43, 3, C.rust, 2);         // iron hub
      }
      A.shadedRect(p, 6, 22, 52, 9, C.wood, 2);          // the bed over the axles
      p(7, 23, 50, 2, C.wood[3]);
      p(6, 29, 52, 2, C.wood[1]);
      A.shadedCircle(p, 17, 17, 7, C.hide, 2);           // grain sacks
      A.shadedCircle(p, 29, 14, 7, C.hide, 1); p(26, 10, 4, 3, C.hide[3]);
      p(27, 8, 3, 3, C.wood[1]);                          // tied sack neck
      A.shadedRect(p, 39, 8, 9, 15, C.rust, 2);          // amphora
      p(41, 5, 5, 4, C.rust[3]); p(40, 9, 2, 12, C.rust[3]);
      A.shadedCircle(p, 52, 18, 4, C.gold, 2); p(51, 16, 2, 2, C.gold[3]);   // the purse on top
      for (let i = 0; i < 8; i++) p(57 + (i / 2 | 0), 24 + i, 3, 2, C.wood[3]);   // pull-pole, grounded
    },
    hound(p, C, A) {                                    // the great guard-beast, seated
      p(12, 56, 42, 2, C.ink[1]);
      A.shadedCircle(p, 42, 42, 14, C.pelt, 2);          // haunches
      for (let i = 0; i < 14; i++) p(28 + i, 28 + (i / 2 | 0), 10, 4, C.pelt[2]);   // sloping back
      A.shadedRect(p, 20, 28, 14, 24, C.pelt, 2);        // chest
      p(20, 30, 4, 20, C.pelt[3]);                       // lit breast
      p(16, 12, 16, 13, C.pelt[2]);                      // skull, broad
      p(16, 12, 4, 13, C.pelt[3]);
      p(8, 18, 9, 6, C.pelt[1]);                         // muzzle, reaching left
      p(9, 24, 6, 2, C.pelt[0]);                         // jaw
      p(7, 19, 3, 3, C.ink[0]);                          // nose
      for (let i = 0; i < 9; i++) p(17 + (i / 4 | 0), 12 - i, 4, 2, C.pelt[1]);     // near ear
      for (let i = 0; i < 8; i++) p(27 + (i / 4 | 0), 13 - i, 4, 2, C.pelt[0]);     // far ear (a gap between)
      p(20, 16, 3, 3, C.fire[2]); p(21, 16, 2, 2, C.fire[3]);    // eye-shine, watching
      p(20, 26, 12, 3, C.rust[2]); p(25, 26, 3, 3, C.gold[2]);   // collar + stud
      p(21, 50, 5, 6, C.pelt[1]); p(29, 50, 5, 6, C.pelt[2]);    // forelegs
      p(19, 55, 8, 2, C.pelt[0]); p(28, 55, 7, 2, C.pelt[0]);    // paws
      for (let i = 0; i < 14; i++) p(52 + (i / 5 | 0), 48 - i, 3, 2, C.pelt[1]);    // tail swept up
      p(54, 33, 3, 3, C.pelt[3]);                        // tail tip, lit
    },
    tracks(p, C, A) {                                   // the wayfinder's compass
      A.shadedCircle(p, 32, 32, 23, C.wood, 2);          // case
      A.shadedCircle(p, 32, 32, 19, C.bone, 1);          // face
      for (let a = 0; a < 8; a++) {                      // the winds
        const th = a * Math.PI / 4;
        const x = 32 + Math.round(Math.cos(th) * 16), y = 32 + Math.round(Math.sin(th) * 16);
        p(x, y, 2, 2, a % 2 ? C.ink[1] : C.wood[1]);
      }
      for (let i = 0; i < 18; i++) {                     // north needle (red kite)
        const w = 1 + (i / 3 | 0);
        p(32 - w / 2 + 1, 13 + i, w, 1, C.red[2]);
      }
      p(31, 10, 3, 4, C.red[3]);
      for (let i = 0; i < 16; i++) {                     // south needle (pale)
        const w = 6 - (i / 3 | 0);
        p(32 - w / 2 + 1, 34 + i, w, 1, C.stone[3]);
      }
      A.shadedCircle(p, 32, 32, 3, C.gold, 2); p(31, 31, 2, 1, C.gold[3]);   // hub
    },
    campfire(p, C, A) {                                 // the builders' fire, banked high
      p(10, 57, 44, 2, C.ink[1]);
      for (const [cx, r] of [[14, 3], [24, 3], [34, 3], [44, 3], [51, 3]])
        A.shadedCircle(p, cx, 54, r, C.granite, 2);      // stone ring
      for (let i = 0; i < 16; i++) { p(14 + i, 50 - (i / 4 | 0), 3, 3, C.wood[2]); p(46 - i, 50 - (i / 4 | 0), 3, 3, C.wood[1]); }  // crossed logs
      p(12, 48, 5, 4, C.wood[0]); p(47, 48, 5, 4, C.wood[0]);   // log ends
      for (let i = 0; i < 26; i++) {                     // the flame, layered
        const w = 22 - Math.abs(i - 8) * 1.6;
        if (w > 0) p(32 - w / 2, 46 - i, w, 1, C.fire[1]);
      }
      for (let i = 0; i < 22; i++) {
        const w = 14 - Math.abs(i - 6) * 1.4;
        if (w > 0) p(32 - w / 2 + 1, 42 - i, w, 1, C.fire[2]);
      }
      for (let i = 0; i < 14; i++) {
        const w = 8 - Math.abs(i - 4);
        if (w > 0) p(32 - w / 2 + 1, 36 - i, w, 1, C.fire[3]);
      }
      p(31, 26, 3, 5, C.gold[3]);                        // white heart
      p(24, 12, 2, 2, C.fire[3]); p(40, 8, 2, 2, C.fire[2]); p(34, 4, 2, 2, C.gold[3]);   // sparks
    },
    antlers(p, C, A) {                                  // the stag, head-on
      A.shadedRect(p, 27, 30, 10, 16, C.hide, 2);        // face
      p(27, 30, 3, 16, C.hide[3]);                       // lit cheek
      p(28, 46, 8, 6, C.hide[1]);                        // muzzle
      p(30, 49, 4, 3, C.ink[0]);                         // nose
      p(28, 35, 3, 3, C.ink[0]); p(34, 35, 3, 3, C.ink[0]);     // eyes
      p(29, 35, 1, 1, C.bone[2]); p(35, 35, 1, 1, C.bone[2]);
      for (let i = 0; i < 6; i++) { p(20 - i, 32 + i, 7, 3, C.hide[1]); p(38 + i, 32 + i, 7, 3, C.hide[2]); }   // ears, dropped
      for (const [ox, dir, tall] of [[26, -1, 0], [38, 1, 3]]) { // the rack — swept, branched, uneven
        for (let i = 0; i < 24; i++)                     // main beam: up and boldly OUT
          p(ox + dir * (i * 0.9 | 0), 28 - i - tall, 3, 3, C.bone[1]);
        for (let i = 0; i < 24; i += 3)                  // lit fore-edge
          p(ox + dir * (i * 0.9 | 0), 28 - i - tall, 1, 2, C.bone[2]);
        for (const [t, len] of [[6, 7], [12, 8], [18, 6]])         // tines branching inward-up
          for (let j = 0; j < len; j++)
            p(ox + dir * ((t * 0.9 | 0) - j), 28 - t - tall - j - 1, 2, 2, C.bone[2]);
      }
    },
    crowd(p, C, A) {                                    // the newcomers on the road
      p(4, 56, 56, 2, C.ink[1]);
      // the one behind, road-worn
      p(11, 17, 8, 7, C.skin[1]); p(11, 14, 8, 4, C.hair[0]);
      A.shadedRect(p, 9, 24, 12, 28, C.hide, 1);
      p(11, 52, 3, 4, C.ink[1]); p(16, 52, 3, 4, C.ink[1]);
      // the lead, bundle on the shoulder, staff in hand
      p(29, 11, 9, 8, C.skin[2]); p(29, 8, 9, 4, C.hair[1]);
      A.shadedRect(p, 26, 19, 15, 33, C.hide, 2);
      p(26, 19, 4, 33, C.hide[3]);                       // lit cloak edge
      A.shadedCircle(p, 42, 15, 6, C.thatch, 2);         // the bundle
      p(40, 9, 3, 3, C.wood[1]);                         // its tie
      p(45, 12, 2, 42, C.wood[2]);                       // the staff
      p(29, 52, 4, 4, C.ink[1]); p(35, 52, 4, 4, C.ink[1]);
      // the child, hurrying to keep up
      p(52, 26, 6, 6, C.skin[3]); p(52, 23, 6, 4, C.hair[2]);
      A.shadedRect(p, 50, 32, 9, 20, C.rust, 1);
      p(51, 32, 2, 20, C.rust[2]);
      p(52, 52, 3, 4, C.ink[1]);
    },
    reeds(p, C, A) {                                    // the shallows: reeds and a leaping fish
      for (let i = 0; i < 56; i++)                       // water band
        p(4 + i, 46 + (Math.sin(i * 0.6) > 0.3 ? 1 : 0), 1, 4, C.water[1 + (i % 3)]);
      p(4, 50, 56, 6, C.water[1]);
      for (const [dx, h, sh] of [[10, 26, 2], [15, 32, 3], [48, 28, 2], [54, 22, 1]]) {
        p(dx, 46 - h, 2, h, C.leaf[sh]);                 // reed stems
        p(dx - 1, 42 - h, 4, 6, C.soil[2]);              // cattail heads
        p(dx - 1, 42 - h, 4, 1, C.soil[3]);
      }
      // the fish, hanging in the air over the shallows
      for (let i = 0; i < 18; i++) {                     // lens-shaped body, nose-up tilt
        const h = Math.round(Math.sin((i + 1) / 19 * Math.PI) * 5);
        p(22 + i, 22 - (i / 4 | 0) - h, 1, h * 2, C.blue[2]);
      }
      for (let i = 0; i < 18; i++) {
        const h = Math.round(Math.sin((i + 1) / 19 * Math.PI) * 5);
        p(22 + i, 22 - (i / 4 | 0) - h, 1, 2, C.blue[3]);   // lit back
      }
      p(38, 15, 3, 4, C.blue[3]);                        // head tip
      p(37, 16, 2, 2, C.ink[0]);                         // eye
      p(28, 10, 4, 4, C.blue[1]);                        // dorsal fin
      p(18, 22, 4, 4, C.blue[1]); p(18, 26, 4, 3, C.blue[2]);   // forked tail
      p(24, 40, 3, 2, C.bone[2]); p(30, 38, 2, 2, C.bone[1]);   // spray beneath
      p(20, 42, 3, 2, C.bone[2]); p(26, 44, 2, 2, C.bone[2]); p(33, 43, 2, 2, C.bone[1]);   // splash
    },
    eye(p, C, A) {                                      // the seer's unblinking eye
      for (let i = 0; i < 25; i++) {                     // the lids — an almond
        const h = Math.round(Math.sin((i + 1) / 26 * Math.PI) * 11);
        p(8 + i * 2, 32 - h, 2, h * 2, C.bone[1]);
      }
      for (let i = 0; i < 25; i++) {
        const h = Math.round(Math.sin((i + 1) / 26 * Math.PI) * 11);
        p(8 + i * 2, 32 - h, 2, 2, C.bone[2]);           // lit upper lid
      }
      A.shadedCircle(p, 32, 32, 8, C.water, 2);          // iris
      A.shadedCircle(p, 32, 32, 4, [C.ink[0], C.ink[0], C.ink[0]], 1);   // pupil
      p(29, 28, 3, 3, C.bone[2]);                        // the glint
      for (const [sx, sy] of [[32, 6], [10, 12], [54, 12], [12, 52], [52, 52]]) {   // stars
        p(sx, sy - 2, 2, 6, C.gold[2]); p(sx - 2, sy, 6, 2, C.gold[2]);
        p(sx, sy, 2, 2, C.gold[3]);
      }
    },
    anvil(p, C, A) {                                    // the anvil under the hammer
      p(10, 57, 44, 2, C.ink[1]);
      A.shadedRect(p, 20, 48, 26, 9, C.wood, 1);         // the stump base
      p(21, 49, 24, 2, C.wood[2]);
      p(24, 38, 16, 10, C.slate[1]);                     // waist
      A.shadedRect(p, 14, 28, 36, 10, C.slate, 3);       // body
      p(15, 28, 34, 3, C.slate[5]);                      // the face, lit
      for (let i = 0; i < 10; i++) p(13 - i, 29 + (i / 2 | 0), 3, 6 - (i / 2 | 0), C.slate[2]);   // the horn
      p(50, 30, 6, 6, C.slate[2]);                       // the heel
      for (let i = 0; i < 14; i++) p(40 + (i * 0.7 | 0), 20 - i, 3, 2, C.wood[3]);   // hammer haft
      A.shadedRect(p, 32, 8, 12, 8, C.slate, 4);         // hammer head
      p(26, 22, 3, 3, C.gold[3]); p(22, 18, 2, 2, C.fire[3]); p(31, 19, 2, 2, C.fire[2]);   // sparks off the face
      p(19, 24, 2, 2, C.gold[2]);
    },
    bond(p, C, A) {                                     // house and field, bonded in gold
      p(4, 55, 56, 2, C.ink[1]);
      // the house, left
      A.shadedRect(p, 7, 34, 20, 21, C.wood, 2);
      for (let i = 0; i < 12; i++) p(5 + i, 33 - i, 24 - i * 2, 1, i < 4 ? C.thatch[3] : C.thatch[2]);   // roof
      p(4, 33, 26, 2, C.thatch[1]);                      // eaves
      p(13, 44, 6, 11, C.ink[0]);                        // door — facing the field
      p(14, 46, 4, 9, C.fire[1]);
      // the field, right
      A.shadedRect(p, 36, 36, 24, 19, C.soil, 2);
      for (let r = 0; r < 5; r++) {
        p(36, 38 + r * 4, 24, 1, C.soil[0]);             // furrows
        for (let x = 38; x < 58; x += 4) p(x, 36 + r * 4, 2, 2, C.leaf[2]);   // sprouting rows
      }
      p(36, 36, 24, 1, C.leaf[3]);
      // the seam of gold between them — the homestead spark, standing still
      for (const [gy, hot] of [[30, 0], [36, 1], [42, 0], [48, 1], [52, 0]]) {
        p(31, gy, 2, 2, C.gold[2]);
        if (hot) p(31, gy, 1, 1, C.gold[3]);
        p(33, gy + 2, 1, 1, C.gold[1]);
      }
      p(30, 24, 3, 3, C.gold[3]); p(31, 25, 1, 1, C.bone[2]);   // the crown spark
    },
    tent(p, C, A) {                                     // the nomad camp at dusk
      p(8, 56, 40, 2, C.ink[1]);
      for (let i = 0; i < 22; i++) {                     // the hide tent, seamed
        const w = 3 + i * 2;
        p(30 - w / 2, 12 + i * 2, w, 2, i % 4 === 3 ? C.hide[1] : C.hide[2]);
      }
      for (let i = 0; i < 22; i++) p(30 - (3 + i * 2) / 2, 12 + i * 2, 2, 2, C.hide[3]);   // lit west face
      p(26, 40, 9, 16, C.ink[0]);                        // door flap
      p(28, 43, 5, 13, C.hide[0]);
      p(29, 4, 3, 9, C.wood[2]); p(25, 6, 11, 2, C.wood[1]);    // crossed poles at the peak
      A.shadedCircle(p, 52, 51, 4, C.fire, 1);           // the fire beside
      p(51, 44, 2, 6, C.fire[2]); p(52, 41, 1, 4, C.fire[3]);
      p(48, 55, 9, 2, C.wood[1]);                        // its log
    },
    bow(p, C, A) {                                      // the bowyer's work, drawn
      for (let i = 0; i < 48; i++) {                     // the stave — a working recurve
        const bend = Math.round(Math.sin((i + 1) / 49 * Math.PI) * 14);
        p(24 + bend, 8 + i, 3, 1, C.wood[3]);
        p(24 + bend + 2, 8 + i, 1, 1, C.wood[1]);        // shaded back
      }
      p(22, 6, 4, 4, C.wood[2]); p(22, 54, 4, 4, C.wood[2]);    // nocks
      p(23, 8, 1, 48, C.bone[2]);                        // the string, taut
      p(36, 29, 6, 6, C.rust[2]);                        // the grip wrap
      // the arrow, nocked and level
      p(10, 31, 34, 2, C.wood[2]);
      p(44, 30, 5, 4, C.slate[4]); p(48, 31, 3, 2, C.slate[5]);  // head
      p(10, 29, 4, 2, C.red[2]); p(10, 33, 4, 2, C.red[1]);      // fletching
      p(8, 31, 3, 2, C.red[2]);
    },
    warship(p, C, A) {                                  // the fire warship, brazier lit
      for (let i = 0; i < 56; i++)
        p(4 + i, 52 + (Math.sin(i * 0.5) > 0.2 ? 1 : 0), 1, 3, C.water[1 + (i % 3)]);
      for (let i = 0; i < 6; i++) p(8 + i * 2, 46 + i, 48 - i * 4, 1, C.wood[1]);   // dark war hull
      p(10, 44, 44, 3, C.wood[2]);
      for (const x of [16, 24, 32, 40, 48]) {            // shield row on the gunwale
        A.shadedCircle(p, x, 44, 3, x % 16 ? C.red : C.gold, 1);
      }
      p(6, 34, 5, 12, C.wood[2]); p(53, 36, 5, 10, C.wood[2]);   // prow + stern
      p(33, 6, 2, 38, C.wood[1]);                        // tall mast
      p(22, 7, 25, 2, C.wood[3]);                        // yard
      A.shadedRect(p, 23, 9, 23, 20, C.bone, 1);         // sail, full
      p(23, 13, 23, 4, C.red[1]); p(23, 21, 23, 4, C.red[1]);   // war stripes
      p(23, 9, 2, 20, C.bone[0]);
      p(35, 2, 7, 3, C.red[2]);                          // war pennant
      // the brazier at the prow — the ship's whole name
      p(5, 28, 7, 5, C.rust[1]);                         // iron basket
      p(6, 24, 5, 4, C.fire[1]); p(7, 21, 3, 4, C.fire[2]); p(8, 18, 2, 3, C.fire[3]);
      p(3, 16, 2, 2, C.fire[2]); p(10, 13, 2, 2, C.gold[3]);    // embers on the wind
    },
    spade(p, C, A) {                                    // the delver's cut, water finding it
      // the ground in section: turf over earth, and a trench cut clean through
      A.shadedRect(p, 4, 38, 20, 18, C.soil, 2);         // left bank
      A.shadedRect(p, 40, 38, 20, 18, C.soil, 2);        // right bank
      p(4, 36, 20, 3, C.leaf[2]); p(40, 36, 20, 3, C.leaf[2]);   // the turf line
      p(4, 36, 8, 1, C.leaf[3]); p(40, 36, 8, 1, C.leaf[3]);
      p(24, 38, 16, 18, C.soil[0]);                      // the cut walls
      p(26, 40, 12, 16, C.ink[0]);
      p(26, 48, 12, 8, C.water[2]);                      // water finding the trench
      p(27, 48, 8, 2, C.water[4]);                       // glint
      p(24, 36, 2, 3, C.soil[3]); p(38, 36, 2, 3, C.soil[3]);   // fresh-cut lips
      A.shadedCircle(p, 12, 32, 6, C.soil, 1);           // the thrown-up spoil
      A.shadedCircle(p, 19, 34, 4, C.soil, 2);
      p(9, 27, 3, 2, C.soil[3]); p(16, 29, 3, 2, C.soil[3]);    // clods
      p(46, 8, 3, 26, C.wood[3]);                        // the spade, standing in the bank
      p(47, 8, 1, 26, C.wood[1]);
      p(42, 4, 11, 4, C.wood[2]); p(42, 4, 11, 1, C.wood[4]);   // T-handle
      A.shadedRect(p, 44, 32, 7, 9, C.slate, 3);         // the blade, bitten in
      p(44, 39, 7, 2, C.slate[5]);
    },
    vein(p, C, A) {                                     // the seam in the rock face
      p(8, 56, 48, 3, C.ink[1]);
      // the face: two hard planes of dark rock
      for (let i = 0; i < 44; i++) {                     // a ragged-edged face, not a slab
        const l = 10 + (i % 9 < 3 ? 2 : 0) - (i > 34 ? 2 : 0);
        const r = 54 - (i % 7 < 2 ? 3 : 0) - (i < 8 ? 4 : 0);
        p(l, 12 + i, r - l, 1, C.granite[2]);
      }
      for (let i = 0; i < 20; i++) p(36 + (i / 2 | 0), 14 + i * 2, 16 - (i / 2 | 0), 2, C.granite[1]);   // shadow plane
      p(12, 13, 38, 3, C.granite[4]);                    // lit brow
      p(12, 13, 12, 2, C.granite[5]);
      for (let i = 0; i < 12; i++) p(44 - i, 24 + i * 2, 2, 1, C.granite[0]);   // a dry crack
      // THE VEIN — a live zigzag of gold through the face
      let vx = 17;
      for (let i = 0; i < 40; i++) {
        vx += (i % 9 < 4 ? 0.9 : -0.35);
        p(vx, 14 + i, 4, 2, C.gold[2]);
        p(vx + 1, 14 + i, 2, 1, C.gold[3]);
        if (i % 7 === 3) { p(vx - 2, 14 + i, 8, 2, C.gold[2]); p(vx, 14 + i, 3, 1, C.gold[3]); }   // nugget bulges
      }
      p(30, 20, 2, 2, C.gold[3]); p(27, 38, 2, 2, C.gold[3]);   // glints
      A.shadedCircle(p, 15, 53, 3, C.gold, 2);           // spilled nuggets at the foot
      A.shadedCircle(p, 50, 54, 2, C.gold, 1);
    },
    watchtower(p, C, A) {                               // the warden's tower, beacon lit
      p(16, 57, 32, 2, C.ink[1]);
      A.shadedRect(p, 24, 24, 16, 33, C.granite, 3);     // the shaft
      p(25, 25, 3, 31, C.granite[5]);                    // lit western face
      for (let y = 28; y < 56; y += 6) p(24, y, 16, 1, C.granite[1]);   // courses
      p(30, 48, 5, 9, C.ink[0]);                         // the door
      p(30, 48, 1, 9, C.granite[4]);
      p(29, 36, 2, 4, C.ink[0]); p(34, 36, 2, 4, C.ink[0]);     // arrow slits
      A.shadedRect(p, 20, 16, 24, 8, C.wood, 2);         // timber hoarding at the crown
      for (let x = 21; x < 43; x += 4) p(x, 13, 3, 4, C.wood[3]);   // the parapet, crenellated
      p(20, 16, 24, 2, C.wood[3]);
      // the beacon — lit, always
      p(29, 8, 6, 4, C.rust[1]);                         // fire-basket
      p(30, 4, 4, 4, C.fire[2]); p(31, 1, 2, 4, C.fire[3]);
      p(26, 3, 2, 2, C.fire[2]); p(37, 5, 2, 2, C.gold[3]);     // thrown light
    },
    horn(p, C, A) {                                     // the master's hunting horn
      // the crescent: mouthpiece high, the bell swinging down and under
      for (let i = 0; i <= 30; i++) {
        const a = -1.5 + (i / 30) * 3.0;                 // -86°..+86° about the centre
        const cx = 27 + Math.round(Math.cos(a) * 21);
        const cy = 28 + Math.round(Math.sin(a) * 21);
        A.shadedCircle(p, cx, cy, 2 + Math.round((i / 30) * 5), C.bone, 1);
      }
      for (let i = 0; i <= 30; i += 2) {                 // lit outer edge along the sweep
        const a = -1.5 + (i / 30) * 3.0;
        const cx = 27 + Math.round(Math.cos(a) * (23 + (i / 30) * 4));
        const cy = 28 + Math.round(Math.sin(a) * (23 + (i / 30) * 4));
        p(cx, cy, 2, 2, C.bone[2]);
      }
      p(26, 3, 6, 5, C.wood[2]); p(26, 3, 6, 2, C.wood[3]);     // mouthpiece
      A.shadedCircle(p, 27, 51, 8, [C.wood[0], C.wood[1], C.wood[2]], 1);   // the bell rim
      p(23, 47, 8, 7, C.ink[0]);                         // its dark mouth
      p(44, 16, 6, 6, C.gold[2]); p(45, 16, 4, 2, C.gold[3]);   // gold band, high
      p(46, 36, 7, 6, C.gold[2]); p(47, 36, 5, 2, C.gold[3]);   // gold band at the swell
      p(12, 22, 2, 12, C.red[1]);                        // the cord
      p(10, 34, 6, 5, C.red[2]); p(11, 39, 4, 4, C.red[1]);     // tassel
    },
  },

};

// classic-script global (const declarations are not window properties)
window.Cards = Cards;
