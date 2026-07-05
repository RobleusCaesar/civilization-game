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
      if (u.owner === owner && Units.isMilitary(u))
        p += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman') ? 2 : 1;
    for (const b of S.buildings)
      if (b.owner === owner && b.key === 'tower' && Bld.done(b)) p += 1;
    return p;
  },

  daily() {
    const ai = S.ai;
    const m = G.modeCfg();
    if (!Bld.tcOf('A')) return;   // rival destroyed

    // small base income so the AI never fully stalls (scaled by difficulty)
    ai.res.food += 3 * m.aiOutput; ai.res.wood += 3 * m.aiOutput; ai.res.stone += 1 * m.aiOutput;
    ai.res.gold += 4 * m.aiOutput;   // the AI has no worker mechanic, so gold trickles here
    Bld.dailyProduction('A');

    // build & upgrade at a difficulty-dependent tempo
    if (S.day % (m.aiBuildEvery || 2) === 0) {
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
        // late game: keep upgrading things
        const up = S.buildings.find(b => b.owner === 'A' && Bld.canUpgrade(b).ok);
        if (up && G.rand() < 0.8) Bld.upgrade(up);
      }
    }

    // upgrade the town center on a schedule
    const tc = Bld.tcOf('A');
    if (tc && ((S.day > 25 && tc.level === 1) || (S.day > 60 && tc.level === 2))) {
      if (Bld.canUpgrade(tc).ok) Bld.upgrade(tc);
    }

    // put to sea: once the town matures, a dock goes up on any suitable water,
    // then fishing boats work the shallows and warships patrol the coast
    if (tc && tc.level >= 2 && !S.buildings.some(b => b.owner === 'A' && b.key === 'dock')) {
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
      if (boats < 2) Bld.train(dock, 'fishboat');
      else if (dock.level >= 2 && ships < Math.max(1, Math.floor((m.aiArmyCap || 8) / 4)))
        Bld.train(dock, dock.level >= 3 && ai.res.gold >= 45 ? 'fireship' : 'warship');
    }

    // keep a standing force
    const barracks = S.buildings.find(b => b.owner === 'A' && b.key === 'barracks' && Bld.done(b));
    const want = Math.min(2 + Math.floor(S.day / (m.aiArmyDiv || 8)), m.aiArmyCap || 10);
    if (barracks && Units.count('A', Units.isMilitary.bind(Units)) < want && barracks.queue.length === 0) {
      // elites are rationed by difficulty — Moderate fields a mostly-defender
      // army with a few elites; only Hard goes elite-heavy
      const elites = Units.count('A', u => u.kind === 'elite');
      const eliteOk = barracks.level >= 3 && ai.res.gold >= 20 &&
        elites < Math.floor((m.aiEliteShare || 0) * want);
      Bld.train(barracks, eliteOk ? 'elite' : 'defender');
    }

    // raid the player when clearly ahead militarily
    if (ai.raidCd > 0) ai.raidCd--;
    const mine = this.power('A'), theirs = this.power('P');
    if (S.day >= m.aiRaidDay && ai.raidCd <= 0 && mine >= 4 && mine > theirs * 1.3) {
      const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !(u.task && u.task.type === 'raid'));
      const party = troops.slice(0, Math.ceil(troops.length * 0.6));
      if (party.length >= 3) {
        for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; }
        ai.raidCd = 14;
        G.log('⚔ The rival tribe marches on your village!', true);
      }
    }
  },
};
