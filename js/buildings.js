"use strict";
/* Building placement, construction, upgrades, training, daily production. */

const Bld = {
  def(key) { return CFG.BUILDINGS[key]; },
  lv(b) { return CFG.BUILDINGS[b.key].levels[b.level - 1]; },
  get(id) { return S.buildings.find(b => b.id === id); },
  at(x, y) { return S.buildings.find(b => b.x === x && b.y === y); },

  list(owner) { return S.buildings.filter(b => b.owner === owner); },
  tcOf(owner) { return S.buildings.find(b => b.owner === owner && b.key === 'tc'); },
  done(b) { return !b.construction; },

  canAfford(cost, res) {
    res = res || S.res;
    for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
    return true;
  },
  pay(cost, res) {
    res = res || S.res;
    for (const k in cost) res[k] -= cost[k];
  },
  costStr(cost) {
    const ic = { food: '🍖', wood: '🪵', stone: '🪨', gold: '✨' };
    const parts = [];
    for (const k in cost) parts.push(cost[k] + ' ' + (ic[k] || k));
    return parts.join(' ') || 'free';
  },

  tileFree(x, y) {
    if (!MapGen.inB(x, y)) return false;
    const t = S.map.terrain[MapGen.idx(x, y)];
    if (t === T.WATER || t === T.FOREST || t === T.HILLS || t === T.CAMP) return false;
    if (this.at(x, y)) return false;
    return true;
  },

  canPlace(owner, key, x, y) {
    const d = this.def(key);
    if (!d) return { ok: false, why: '?' };
    if (!this.tileFree(x, y)) return { ok: false, why: 'Blocked tile' };
    if (owner === 'P' && !S.map.explored[MapGen.idx(x, y)]) return { ok: false, why: 'Unexplored' };
    if (d.unique && this.list(owner).some(b => b.key === key)) return { ok: false, why: 'Already built' };
    const mine = this.list(owner);
    if (mine.length && !mine.some(b => Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE))
      return { ok: false, why: 'Too far from your buildings' };
    const res = owner === 'P' ? S.res : S.ai.res;
    if (!this.canAfford(d.levels[0].cost, res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  },

  place(owner, key, x, y, opts) {
    opts = opts || {};
    const d = this.def(key);
    const res = owner === 'P' ? S.res : S.ai.res;
    if (!opts.free) this.pay(d.levels[0].cost, res);
    const b = {
      id: S.nextId++, key, owner, x, y, level: 1,
      hp: d.levels[0].hp, maxhp: d.levels[0].hp,
      construction: opts.instant ? 0 : d.levels[0].time,   // days left
      upgrading: 0, queue: [], cd: 0,
    };
    if (opts.instant) b.construction = 0;
    S.buildings.push(b);
    if (owner === 'P') {
      G.reveal(x, y, d.levels[0].vision || 4);
      if (!opts.instant) {
        const v = Units.nearestIdleVillager(x, y);
        if (v && Units.assignBuild(v, b)) G.log(`${d.name} site laid out — a villager heads over`);
        else G.log(`${d.name} needs a builder — tap a villager, then the site`, true);
      }
    }
    return b;
  },

  finish(b) {
    b.construction = 0;
    if (b.owner === 'P') {
      G.log(`${this.def(b.key).name} complete`);
      const lv = this.lv(b);
      if (lv.vision) G.reveal(b.x, b.y, lv.vision);
    }
  },

  // any player villager currently working this site?
  hasWorker(b) {
    return S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'build' && u.task.id === b.id);
  },

  canUpgrade(b) {
    const d = this.def(b.key);
    if (b.level >= 3) return { ok: false, why: 'Max level' };
    if (b.construction || b.upgrading) return { ok: false, why: 'Busy' };
    const next = d.levels[b.level];
    if (b.key !== 'tc') {
      const tc = this.tcOf(b.owner);
      if (!tc || tc.level < b.level + 1)
        return { ok: false, why: `Needs Town Center Lv ${b.level + 1}` };
    }
    const res = b.owner === 'P' ? S.res : S.ai.res;
    if (!this.canAfford(next.cost, res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true, cost: next.cost };
  },

  upgrade(b) {
    const c = this.canUpgrade(b);
    if (!c.ok) return false;
    const d = this.def(b.key);
    this.pay(d.levels[b.level].cost, b.owner === 'P' ? S.res : S.ai.res);
    b.upgrading = d.levels[b.level].time;
    if (b.owner === 'P') G.log(`${d.name} upgrading to Lv ${b.level + 1}`);
    return true;
  },

  /* training queue: entries { unit, t } (days remaining) */
  canTrain(b, unitKey) {
    const d = this.def(b.key);
    const spec = d.train && d.train[unitKey];
    if (!spec) return { ok: false, why: '?' };
    if (b.construction) return { ok: false, why: 'Under construction' };
    if (spec.reqLevel && b.level < spec.reqLevel) return { ok: false, why: `Needs Lv ${spec.reqLevel}` };
    if (b.queue.length >= 3) return { ok: false, why: 'Queue full' };
    if (b.owner === 'P' && Units.popUsed('P') + b.queue.length >= Bld.popCap('P'))
      return { ok: false, why: 'Population cap — build houses' };
    const res = b.owner === 'P' ? S.res : S.ai.res;
    if (!this.canAfford(spec.cost, res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true, cost: spec.cost };
  },

  train(b, unitKey) {
    const c = this.canTrain(b, unitKey);
    if (!c.ok) return false;
    const spec = this.def(b.key).train[unitKey];
    this.pay(spec.cost, b.owner === 'P' ? S.res : S.ai.res);
    b.queue.push({ unit: unitKey, t: spec.time });
    return true;
  },

  popCap(owner) {
    let cap = 0;
    for (const b of this.list(owner))
      if (this.done(b)) cap += this.lv(b).pop || 0;
    return cap;
  },

  nearBonus(b) {
    const d = this.def(b.key);
    if (!d.near) return 1;
    const r = d.near.radius;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (MapGen.inB(x, y) && S.map.terrain[MapGen.idx(x, y)] === d.near.terrain) return d.near.mult;
    }
    return 1;
  },

  /* continuous updates: construction/upgrade progress + training (measured in days) */
  update(dtDays) {
    for (const b of S.buildings) {
      if (b.construction > 0) {
        // the rival's crews work off-screen; player sites need a villager builder
        if (b.owner === 'A') {
          b.construction -= dtDays;
          if (b.construction <= 0) this.finish(b);
        }
        continue;
      }
      if (b.upgrading > 0) {
        b.upgrading -= dtDays;
        if (b.upgrading <= 0) {
          b.upgrading = 0;
          b.level++;
          const lv = this.lv(b);
          b.maxhp = lv.hp; b.hp = lv.hp;
          if (b.owner === 'P') {
            G.log(`${this.def(b.key).name} reached Lv ${b.level}!`);
            if (lv.vision) G.reveal(b.x, b.y, lv.vision);
          }
        }
      }
      if (b.queue.length) {
        b.queue[0].t -= dtDays;
        if (b.queue[0].t <= 0) {
          const item = b.queue.shift();
          const spot = MapGen.findNear(b.x, b.y + 1, 3, (x, y) => Path.passable(x, y) && !Bld.at(x, y)) || { x: b.x, y: b.y + 1 };
          Units.spawn(item.unit, b.owner, spot.x, spot.y);
          if (b.owner === 'P') G.log(`${CFG.UNITS[item.unit].name} ready`);
        }
      }
    }
  },

  /* once per day: passive production */
  dailyProduction(owner) {
    const res = owner === 'P' ? S.res : S.ai.res;
    const tc = this.tcOf(owner);
    const tcBoost = tc && tc.level >= 3 && this.done(tc) ? 1.1 : 1;
    const modeMult = owner === 'P' ? G.modeCfg().output : 1;
    for (const b of this.list(owner)) {
      if (!this.done(b) || b.upgrading) continue;
      const out = this.lv(b).out;
      if (!out) continue;
      const mult = this.nearBonus(b) * tcBoost * modeMult;
      for (const k in out) res[k] += out[k] * mult;
    }
  },

  damage(b, amt) {
    b.hp -= amt;
    if (b.hp <= 0) {
      S.buildings.splice(S.buildings.indexOf(b), 1);
      const name = this.def(b.key).name;
      if (b.owner === 'P') {
        G.log(`${name} destroyed!`, true);
        if (b.key === 'tc') G.end(false, 'Your Town Center was destroyed.');
      } else if (b.owner === 'A') {
        G.log(`Rival ${name} destroyed!`);
        if (b.key === 'tc') G.end(true, 'You razed the rival Town Center. The valley is yours!');
      }
      // clear attackers targeting it
      for (const u of S.units) if (u.tBld === b.id) u.tBld = 0;
    }
  },
};
