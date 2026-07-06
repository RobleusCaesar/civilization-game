"use strict";
/* AI rival civilization. Every game the rival chief rolls a personality that
   shapes the whole tribe: what it builds and where, what soldiers it fields,
   whether it walls itself in, how much it loves the water, and how eager it
   is to march on you. No more identical square villages of spearmen. */

const AI = {
  /* Each persona:
     order      — build order (keys from CFG.BUILDINGS; duplicates allowed)
     mix        — army composition weights [kind, share]; kinds map to their
                  training building, advanced lines unlock at building L3
     raidPower  — attack when my power > theirs × this (lower = bolder)
     raidDayAdd — shift on the mode's earliest raid day
     raidShare  — fraction of the army that marches
     raidCd     — days between raids
     walls      — build a wall ring (with gates) around town
     dockTC     — TC level needed before it goes to sea (0 = never bothers)
     boats/ships— fishing fleet size / warship cap divisor of aiArmyCap
     tcDays     — [day for TC2, day for TC3]
     blurb      — what your scouts whisper at first light */
  PERSONAS: {
    homesteader: {
      name: 'Homesteader',
      order: ['farm', 'house', 'lodge', 'farm', 'house', 'lumber', 'barracks', 'farm',
              'quarry', 'house', 'tower', 'farm', 'house', 'range', 'farm', 'house'],
      mix: [['defender', 0.6], ['archer', 0.4]],
      raidPower: 1.7, raidDayAdd: 25, raidShare: 0.5, raidCd: 16,
      walls: false, dockTC: 2, boats: 2, shipDiv: 4, tcDays: [22, 55],
      blurb: 'a patient farmer-chief, slow to anger, rich in grain.',
    },
    warlord: {
      name: 'Warlord',
      order: ['barracks', 'house', 'farm', 'range', 'farm', 'house', 'stable', 'tower',
              'farm', 'barracks', 'house', 'farm', 'house', 'tower', 'siege'],
      mix: [['defender', 0.4], ['archer', 0.3], ['rider', 0.2], ['catapult', 0.1]],
      raidPower: 1.1, raidDayAdd: -15, raidShare: 0.7, raidCd: 10,
      walls: false, dockTC: 2, boats: 1, shipDiv: 4, tcDays: [30, 70],
      blurb: 'a warmonger who prizes the spear over the plough.',
    },
    horselord: {
      name: 'Horselord',
      order: ['farm', 'house', 'stable', 'farm', 'lumber', 'house', 'barracks', 'farm',
              'stable', 'house', 'tower', 'farm', 'house', 'farm'],
      mix: [['rider', 0.6], ['defender', 0.25], ['archer', 0.15]],
      raidPower: 1.15, raidDayAdd: -8, raidShare: 0.6, raidCd: 8,
      walls: false, dockTC: 2, boats: 1, shipDiv: 4, tcDays: [26, 62],
      blurb: 'a horselord — swift riders strike and are gone.',
    },
    mariner: {
      name: 'Mariner',
      order: ['farm', 'house', 'lumber', 'barracks', 'house', 'farm', 'range', 'house',
              'farm', 'tower', 'house', 'farm'],
      mix: [['archer', 0.5], ['defender', 0.5]],
      raidPower: 1.3, raidDayAdd: 5, raidShare: 0.6, raidCd: 14,
      walls: false, dockTC: 1, boats: 3, shipDiv: 3, tcDays: [25, 58],
      blurb: 'a mariner-chief — nets in the shallows, warships off the coast.',
    },
    mason: {
      name: 'Mason',
      order: ['quarry', 'house', 'farm', 'tower', 'lumber', 'house', 'farm', 'tower',
              'barracks', 'house', 'range', 'farm', 'tower', 'house', 'siege'],
      mix: [['defender', 0.45], ['archer', 0.45], ['catapult', 0.1]],
      raidPower: 1.9, raidDayAdd: 30, raidShare: 0.5, raidCd: 18,
      walls: true, dockTC: 2, boats: 2, shipDiv: 5, tcDays: [24, 58],
      blurb: 'a cautious mason — stone towers, and walls going up.',
    },
    forager: {
      name: 'Forager',
      order: ['lodge', 'farm', 'lumber', 'house', 'quarry', 'farm', 'house', 'lumber',
              'quarry', 'farm', 'house', 'barracks', 'tower', 'range', 'house'],
      mix: [['defender', 0.4], ['archer', 0.4], ['rider', 0.2]],
      raidPower: 1.4, raidDayAdd: 15, raidShare: 0.6, raidCd: 14,
      walls: false, dockTC: 2, boats: 2, shipDiv: 4, tcDays: [18, 45],
      blurb: 'a hoarder of timber and stone — weak now, but growing fast.',
    },
  },

  persona() { return this.PERSONAS[S.ai && S.ai.persona] || this.PERSONAS.homesteader; },

  init(spawn) {
    const keys = Object.keys(this.PERSONAS);
    S.ai = {
      res: { food: 200, wood: 150, stone: 60, gold: 0 },
      orderI: 0,
      raidCd: 0,
      persona: keys[(G.rand() * keys.length) | 0],
    };
    Bld.place('A', 'tc', spawn.x, spawn.y, { free: true, instant: true });
    G.log('🕵 Scouts whisper of the rival chief: ' + this.persona().blurb);
  },

  /* find a plot with some character instead of spiral-filling a square:
     terrain-hunters sit beside their bonus terrain, towers push toward the
     player, everything else scatters at a random angle from the hall */
  plot(key) {
    const tc = Bld.tcOf('A');
    if (!tc) return null;
    const P = this.persona();
    const rMax = P.walls ? 4 : 7;   // wall-builders keep the town inside the ring
    const free = (x, y) => Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2;
    const d = CFG.BUILDINGS[key];
    if (d && d.near) {
      // hunt the bonus terrain: best-scoring free tile near town
      let best = null, bs = -1;
      for (let dy = -rMax; dy <= rMax; dy++) for (let dx = -rMax; dx <= rMax; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (!MapGen.inB(x, y) || !free(x, y)) continue;
        let bonus = 0;
        const r = d.near.radius;
        for (let oy = -r; oy <= r && !bonus; oy++) for (let ox = -r; ox <= r; ox++)
          if (MapGen.inB(x + ox, y + oy) && S.map.terrain[MapGen.idx(x + ox, y + oy)] === d.near.terrain) { bonus = 1; break; }
        const s = bonus * 10 - Math.hypot(dx, dy) * 0.4 + G.rand();
        if (s > bs) { bs = s; best = { x, y }; }
      }
      return best;
    }
    if (key === 'tower') {
      // watchtowers face the likely threat — the player's town
      const ptc = Bld.tcOf('P');
      const ang = ptc ? Math.atan2(ptc.y - tc.y, ptc.x - tc.x) + (G.rand() - 0.5) * 1.2
                      : G.rand() * Math.PI * 2;
      const dist = 3 + G.rand() * Math.max(1, rMax - 3);
      const spot = MapGen.findNear(Math.round(tc.x + Math.cos(ang) * dist),
                                   Math.round(tc.y + Math.sin(ang) * dist), 3, free);
      if (spot) return spot;
    }
    for (let tries = 0; tries < 12; tries++) {
      const ang = G.rand() * Math.PI * 2, dist = 2 + G.rand() * (rMax - 2);
      const spot = MapGen.findNear(Math.round(tc.x + Math.cos(ang) * dist),
                                   Math.round(tc.y + Math.sin(ang) * dist), 2, free);
      if (spot) return spot;
    }
    return MapGen.findNear(tc.x, tc.y, rMax, free);
  },

  power(owner) {
    let p = 0;
    for (const u of S.units)
      if (u.owner === owner && Units.isMilitary(u))
        p += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman' ||
              u.kind === 'catapult') ? 2 : 1;
    for (const b of S.buildings)
      if (b.owner === owner && b.key === 'tower' && Bld.done(b)) p += 1;
    return p;
  },

  // the mason rings the town in walls, two gates, a few sections a day
  maybeWalls(tc) {
    if (S.day < 22 || S.ai.res.wood < 80) return;
    if (!S.ai.wallPlan) {
      const R = 5, plan = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== R) continue;
        plan.push({ x: tc.x + dx, y: tc.y + dy, gate: dx === 0 && Math.abs(dy) === R });
      }
      S.ai.wallPlan = plan;
    }
    let placed = 0;
    for (const t of S.ai.wallPlan) {
      if (placed >= 2) break;
      if (!MapGen.inB(t.x, t.y) || Bld.at(t.x, t.y)) continue;
      const key = t.gate ? 'gate' : 'wall';
      if (!Bld.canPlace('A', key, t.x, t.y).ok) continue;
      Bld.place('A', key, t.x, t.y);
      placed++;
    }
  },

  // train toward the persona's army mix; advanced lines come with L3 halls
  trainArmy(m, want) {
    const P = this.persona();
    // siege-minded chiefs keep a catapult battery on top of the standing force
    if (P.mix.some(([k]) => k === 'catapult')) {
      const wantCats = Math.max(1, Math.floor((m.aiArmyCap || 8) / 6));
      if (Units.count('A', u => u.kind === 'catapult') < wantCats) {
        const ws = S.buildings.find(bb => bb.owner === 'A' && bb.key === 'siege' &&
          Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
        if (ws && Bld.train(ws, 'catapult')) return;
      }
    }
    const count = Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u) && !Units.isSiege(u));
    if (count >= want) return;
    const roll = G.rand();
    let acc = 0, kind = P.mix[0][0];
    for (const [k, w] of P.mix) { acc += w; if (roll < acc + 1e-9) { kind = k; break; } }
    const HALL = { defender: 'barracks', elite: 'barracks', archer: 'range',
                   marksman: 'range', rider: 'stable', lancer: 'stable', catapult: 'siege' };
    const hallOf = k => S.buildings.find(bb => bb.owner === 'A' && bb.key === HALL[k] &&
      Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
    let b = hallOf(kind);
    if (!b) {
      // rolled a unit whose hall isn't up yet — fall back to any open hall
      for (const [k] of P.mix) { const alt = hallOf(k); if (alt) { kind = k; b = alt; break; } }
      if (!b) return;
    }
    const ADV = { defender: 'elite', archer: 'marksman', rider: 'lancer' };
    const advN = Units.count('A', u => u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman');
    const adv = ADV[kind] && b.level >= 3 && S.ai.res.gold >= 25 &&
      advN < Math.floor((m.aiEliteShare || 0) * want);
    Bld.train(b, adv ? ADV[kind] : kind);
  },

  daily() {
    const ai = S.ai;
    const m = G.modeCfg();
    const P = this.persona();
    if (!Bld.tcOf('A')) return;   // rival destroyed

    // small base income so the AI never fully stalls (scaled by difficulty)
    ai.res.food += 3 * m.aiOutput; ai.res.wood += 3 * m.aiOutput; ai.res.stone += 1 * m.aiOutput;
    ai.res.gold += 4 * m.aiOutput;   // the AI has no worker mechanic, so gold trickles here
    Bld.dailyProduction('A');

    // build & upgrade at a difficulty-dependent tempo
    if (S.day % (m.aiBuildEvery || 2) === 0) {
      if (ai.orderI < P.order.length) {
        const key = P.order[ai.orderI];
        const d = CFG.BUILDINGS[key];
        // the workshop waits for a great hall, same rule the player lives by
        const tcNow = Bld.tcOf('A');
        if (key === 'siege' && (!tcNow || tcNow.level < 3)) { /* not yet — try again another day */ }
        else if (Bld.canAfford(d.levels[0].cost, ai.res)) {
          const spot = this.plot(key);
          if (spot && Bld.canPlace('A', key, spot.x, spot.y).ok) {
            Bld.place('A', key, spot.x, spot.y);
            ai.orderI++;
          }
        }
      } else {
        // late game: keep upgrading things
        const up = S.buildings.find(b => b.owner === 'A' && Bld.canUpgrade(b).ok);
        if (up && G.rand() < 0.8) Bld.upgrade(up);
      }
    }

    // upgrade the town center on the persona's schedule
    const tc = Bld.tcOf('A');
    if (tc && ((S.day > P.tcDays[0] && tc.level === 1) || (S.day > P.tcDays[1] && tc.level === 2))) {
      if (Bld.canUpgrade(tc).ok) Bld.upgrade(tc);
    }

    // the mason walls the town in
    if (P.walls && tc) this.maybeWalls(tc);

    // put to sea: a dock when water allows, then boats and warships. The
    // mariner goes early, keeps a bigger fleet, and loves fire on the water.
    if (tc && tc.level >= P.dockTC && !S.buildings.some(b => b.owner === 'A' && b.key === 'dock')) {
      if (Bld.canAfford(CFG.BUILDINGS.dock.levels[0].cost, ai.res)) {
        const site = MapGen.findNear(tc.x, tc.y, 8, (x, y) => Bld.dockSiteOk(x, y, 'A').ok);
        if (site && Bld.canPlace('A', 'dock', site.x, site.y).ok)
          Bld.place('A', 'dock', site.x, site.y);
      }
    }
    const dock = S.buildings.find(b => b.owner === 'A' && b.key === 'dock' && Bld.done(b));
    if (dock && !dock.upgrading && dock.queue.length === 0) {
      const boats = Units.count('A', u => u.kind === 'fishboat');
      const ships = Units.count('A', u => u.kind === 'warship' || u.kind === 'fireship');
      if (boats < P.boats) Bld.train(dock, 'fishboat');
      else if (dock.level >= 2 && ships < Math.max(1, Math.floor((m.aiArmyCap || 8) / P.shipDiv)))
        Bld.train(dock, dock.level >= 3 && ai.res.gold >= 45 ? 'fireship' : 'warship');
    }

    // keep a standing force shaped by the persona
    const want = Math.min(2 + Math.floor(S.day / (m.aiArmyDiv || 8)), m.aiArmyCap || 10);
    this.trainArmy(m, want);

    // raid the player when the persona feels strong enough
    if (ai.raidCd > 0) ai.raidCd--;
    const mine = this.power('A'), theirs = this.power('P');
    const raidDay = Math.max(20, m.aiRaidDay + P.raidDayAdd);
    if (S.day >= raidDay && ai.raidCd <= 0 && mine >= 4 && mine > theirs * P.raidPower) {
      const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
        !Units.isNaval(u) && !(u.task && u.task.type === 'raid'));
      const party = troops.slice(0, Math.ceil(troops.length * P.raidShare));
      if (party.length >= 3) {
        for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; }
        ai.raidCd = P.raidCd;
        G.log('⚔ The rival tribe marches on your village!', true);
      }
    }
  },
};
