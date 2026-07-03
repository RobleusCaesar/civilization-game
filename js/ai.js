"use strict";
/* AI rival civilization: builds, upgrades, trains defenders, raids when ahead. */

const AI = {
  BUILD_ORDER: ['farm', 'house', 'lumber', 'farm', 'barracks', 'quarry', 'house', 'tower',
                'farm', 'house', 'lumber', 'quarry', 'tower', 'house', 'farm'],

  init(spawn) {
    S.ai = {
      res: { food: 200, wood: 150, stone: 60, gold: 0 },
      orderI: 0,
      raidCd: 0,
      warned: false,
    };
    Bld.place('A', 'tc', spawn.x, spawn.y, { free: true, instant: true });
  },

  // find a free plot near the AI town center
  plot() {
    const tc = Bld.tcOf('A');
    if (!tc) return null;
    return MapGen.findNear(tc.x, tc.y, 7, (x, y) =>
      Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2);
  },

  power(owner) {
    let p = 0;
    for (const u of S.units)
      if (u.owner === owner && Units.isMilitary(u)) p += u.kind === 'elite' ? 2 : 1;
    for (const b of S.buildings)
      if (b.owner === owner && b.key === 'tower' && Bld.done(b)) p += 1;
    return p;
  },

  daily() {
    const ai = S.ai;
    if (!Bld.tcOf('A')) return;   // rival destroyed

    // small base income so the AI never fully stalls
    ai.res.food += 3; ai.res.wood += 3; ai.res.stone += 1;
    Bld.dailyProduction('A');

    // follow the build order
    if (ai.orderI < this.BUILD_ORDER.length) {
      const key = this.BUILD_ORDER[ai.orderI];
      const d = CFG.BUILDINGS[key];
      if (Bld.canAfford(d.levels[0].cost, ai.res)) {
        const spot = this.plot();
        if (spot && Bld.canPlace('A', key, spot.x, spot.y).ok) {
          Bld.place('A', key, spot.x, spot.y);
          ai.orderI++;
        }
      }
    } else {
      // late game: keep upgrading things (also drains the AI hoard)
      const up = S.buildings.find(b => b.owner === 'A' && Bld.canUpgrade(b).ok);
      if (up && G.rand() < 0.8) Bld.upgrade(up);
    }

    // upgrade the town center on a schedule
    const tc = Bld.tcOf('A');
    if (tc && ((S.day > 40 && tc.level === 1) || (S.day > 90 && tc.level === 2))) {
      if (Bld.canUpgrade(tc).ok) Bld.upgrade(tc);
    }

    // keep a standing force
    const barracks = S.buildings.find(b => b.owner === 'A' && b.key === 'barracks' && Bld.done(b));
    const want = Math.min(2 + Math.floor(S.day / 12), 10);
    if (barracks && Units.count('A', Units.isMilitary.bind(Units)) < want && barracks.queue.length === 0) {
      const kind = barracks.level >= 3 && ai.res.gold >= 20 ? 'elite' : 'defender';
      Bld.train(barracks, kind);
    }

    // raid the player when clearly ahead militarily
    if (ai.raidCd > 0) ai.raidCd--;
    const mine = this.power('A'), theirs = this.power('P');
    if (S.day >= G.modeCfg().aiRaidDay && ai.raidCd <= 0 && mine >= 4 && mine > theirs * 1.3) {
      const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !(u.task && u.task.type === 'raid'));
      const party = troops.slice(0, Math.ceil(troops.length * 0.6));
      if (party.length >= 3) {
        for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; }
        ai.raidCd = 14;
        G.log('⚔ The rival tribe marches on your village!', true);
      }
    }

    // rival economic victory pressure — needs a decisive lead over the player's target
    const aiTarget = CFG.WIN.econTotal * 1.25;
    const total = ai.res.food + ai.res.wood + ai.res.stone + ai.res.gold;
    const aiPop = Bld.popCap('A');
    if (!ai.warned && total > aiTarget * 0.75) {
      ai.warned = true;
      G.log('The rival tribe is prospering — outpace them or raze them!', true);
    }
    if (total >= aiTarget && aiPop >= CFG.WIN.econPop)
      G.end(false, 'The rival tribe amassed great wealth first. The valley follows them now.');
  },
};
