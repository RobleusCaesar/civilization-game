"use strict";
/* Building placement, construction, upgrades, training, daily production. */

const Bld = {
  _block: null,    // transient movement-blocking grid (walls/gates)

  rebuildBlock() {
    this._block = new Uint8Array(CFG.W * CFG.H);
    for (const b of S.buildings) {
      if (b.key === 'wall') this._block[MapGen.idx(b.x, b.y)] = 1;
      else if (b.key === 'gate') this._block[MapGen.idx(b.x, b.y)] = b.owner === 'P' ? 2 : 3;
    }
  },
  blockAt(x, y) {
    if (!this._block) this.rebuildBlock();
    return this._block[MapGen.idx(x, y)];
  },

  def(key) { return CFG.BUILDINGS[key]; },
  // what a new building of this type costs/produces right now — walls and
  // gates are built at the village-wide wall level
  buildSpec(key, owner) {
    const d = CFG.BUILDINGS[key];
    const lvN = (owner !== 'A' && (key === 'wall' || key === 'gate')) ? ((S && S.wallLevel) || 1) : 1;
    return { level: lvN, lv: d.levels[lvN - 1] };
  },
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
    // grass, fertile soil, and anything depleted or ruined is fair ground to build on
    const buildable = t === T.GRASS || t === T.FERTILE ||
      t === T.STUMPS || t === T.PEBBLES || t === T.BARREN || t === T.RUIN;
    if (!buildable) return false;
    if (this.at(x, y)) return false;
    return true;
  },

  // docks stand on open water: the body must be big enough to work, and the
  // pier needs a walkable shore tile beside it so villagers can build/repair it
  dockSiteOk(x, y) {
    if (!MapGen.inB(x, y) || S.map.terrain[MapGen.idx(x, y)] !== T.WATER || this.at(x, y))
      return { ok: false, why: 'Docks are built on open water' };
    let shore = false;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (MapGen.inB(x + ox, y + oy) && Path.passable(x + ox, y + oy, 'P')) { shore = true; break; }
    if (!shore) return { ok: false, why: 'Needs a walkable shore beside it' };
    // flood the water body up to the required size
    const seen = new Set([x + ',' + y]);
    const q = [{ x, y }];
    let n = 0;
    while (q.length && n < CFG.DOCK_MIN_WATER) {
      const c = q.shift();
      n++;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + ox, ny = c.y + oy, k = nx + ',' + ny;
        if (seen.has(k) || !MapGen.inB(nx, ny) || S.map.terrain[MapGen.idx(nx, ny)] !== T.WATER) continue;
        seen.add(k);
        q.push({ x: nx, y: ny });
      }
    }
    if (n < CFG.DOCK_MIN_WATER)
      return { ok: false, why: `This water is too small (needs ${CFG.DOCK_MIN_WATER}+ tiles)` };
    return { ok: true };
  },

  canPlace(owner, key, x, y) {
    const d = this.def(key);
    if (!d) return { ok: false, why: '?' };
    if (key === 'dock') {
      const site = this.dockSiteOk(x, y);
      if (!site.ok) return site;
    } else if (!this.tileFree(x, y)) return { ok: false, why: 'Blocked tile' };
    // TC-level gate (player only — the rival's scripted build order sets its own pace)
    if (owner === 'P' && d.reqTC) {
      const tc = this.tcOf('P');
      if (!tc || tc.level < d.reqTC)
        return { ok: false, why: `Needs Town Center Lv ${d.reqTC}` };
    }
    if (owner === 'P' && !S.map.explored[MapGen.idx(x, y)]) return { ok: false, why: 'Unexplored' };
    if (d.unique && this.list(owner).some(b => b.key === key)) return { ok: false, why: 'Already built' };
    const mine = this.list(owner);
    if (mine.length && !mine.some(b => Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE))
      return { ok: false, why: 'Too far from your buildings' };
    const res = owner === 'P' ? S.res : S.ai.res;
    if (!this.canAfford(this.buildSpec(key, owner).lv.cost, res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  },

  place(owner, key, x, y, opts) {
    opts = opts || {};
    const d = this.def(key);
    const spec = this.buildSpec(key, owner);
    const res = owner === 'P' ? S.res : S.ai.res;
    if (!opts.free) this.pay(spec.lv.cost, res);
    const b = {
      id: S.nextId++, key, owner, x, y, level: spec.level,
      // construction sites are fragile until finished
      hp: opts.instant ? spec.lv.hp : Math.max(30, Math.round(spec.lv.hp * 0.4)),
      maxhp: spec.lv.hp,
      construction: opts.instant ? 0 : spec.lv.time,   // days left
      upgrading: 0, queue: [], cd: 0,
    };
    S.buildings.push(b);
    this._block = null;
    // fresh construction clears old stumps/rubble — only the new building shows
    const ti = MapGen.idx(x, y);
    const t0 = S.map.terrain[ti];
    if (t0 === T.STUMPS || t0 === T.PEBBLES || t0 === T.BARREN || t0 === T.RUIN) {
      S.map.terrain[ti] = T.GRASS;
      if (S.map.resAmount) S.map.resAmount[ti] = 0;
      if (S.map.decay) delete S.map.decay[ti];
      R.updateTile(x, y);
    }
    if (owner === 'P') {
      G.reveal(x, y, d.levels[0].vision || 4);
      if (!opts.instant && !opts.noAutoAssign) {
        // an explicitly chosen builder is pulled off whatever it was doing
        let v = opts.builderId
          ? S.units.find(u => u.id === opts.builderId && u.owner === 'P' && Units.isVillager(u))
          : null;
        if (!v) v = Units.nearestIdleVillager(x, y);
        if (v && Units.assignBuild(v, b)) G.log(`${d.name} site laid out — a villager heads over`);
        else G.log(`${d.name} needs a builder — tap a villager, then the site`, true);
      }
    }
    return b;
  },

  finish(b, builder) {
    b.construction = 0;
    b.hp = b.maxhp;
    if (b.owner === 'P') {
      const lv = this.lv(b);
      if (lv.vision) G.reveal(b.x, b.y, lv.vision);
      // production buildings need a hand on deck — the builder stays to work it
      if (this.def(b.key).needsWorker && builder && Units.isVillager(builder)) {
        builder.task = { type: 'work', id: b.id };
        G.log(`${this.def(b.key).name} complete — the builder stays on to work it`);
      } else if (this.def(b.key).needsWorker) {
        G.log(`${this.def(b.key).name} complete — needs a villager to work it`, true);
      } else {
        G.log(`${this.def(b.key).name} complete`);
      }
    }
  },

  // any player villager currently working this site (construction/upgrade/repair)?
  hasWorker(b) {
    return S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'build' && u.task.id === b.id);
  },

  maxWorkers(b) { return this.def(b.key).maxWorkers || 1; },
  // assigned = headed here or on site (caps staffing); active = on site (drives production)
  workersAssigned(b) {
    return S.units.filter(u => u.owner === 'P' && u.task && u.task.type === 'work' &&
      u.task.id === b.id).length;
  },
  workersActive(b) {
    return S.units.filter(u => u.owner === 'P' && u.task && u.task.type === 'work' &&
      u.task.id === b.id && Math.hypot(u.x - b.x - 0.5, u.y - b.y - 0.5) <= 1.4).length;
  },

  canUpgrade(b) {
    const d = this.def(b.key);
    if (b.key === 'wall' || b.key === 'gate')
      return { ok: false, why: 'Walls upgrade together — see the Town Center' };
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
    if (b.owner === 'P') {
      // upgrades need a villager on site, same as construction
      const v = this.hasWorker(b) ? null : Units.nearestIdleVillager(b.x, b.y);
      if (v && Units.assignBuild(v, b)) G.log(`${d.name} upgrading to Lv ${b.level + 1} — a villager heads over`);
      else if (this.hasWorker(b)) G.log(`${d.name} upgrading to Lv ${b.level + 1}`);
      else G.log(`${d.name} upgrade needs a builder — tap a villager, then the building`, true);
    }
    return true;
  },

  finishUpgrade(b) {
    b.upgrading = 0;
    b.level++;
    const lv = this.lv(b);
    b.maxhp = lv.hp; b.hp = lv.hp;
    if (b.owner === 'P') {
      G.log(`${this.def(b.key).name} reached Lv ${b.level}!`);
      if (lv.vision) G.reveal(b.x, b.y, lv.vision);
    }
  },

  /* training queue: entries { unit, t } (days remaining) */
  canTrain(b, unitKey) {
    const d = this.def(b.key);
    const spec = d.train && d.train[unitKey];
    if (!spec) return { ok: false, why: '?' };
    if (b.construction) return { ok: false, why: 'Under construction' };
    if (b.upgrading) return { ok: false, why: 'Upgrading — training paused' };
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
      if (b.upgrading > 0 && b.owner === 'A') {
        // the rival's crews upgrade off-screen; player upgrades need a villager
        b.upgrading -= dtDays;
        if (b.upgrading <= 0) this.finishUpgrade(b);
      }
      if (b.queue.length && !b.upgrading) {   // level-up works pause the training yard
        b.queue[0].t -= dtDays;
        if (b.queue[0].t <= 0) {
          const item = b.queue.shift();
          const naval = !!CFG.UNITS[item.unit].naval;
          const spot = (naval
            ? MapGen.findNear(b.x, b.y, 3, (x, y) => Path.passable(x, y, b.owner, 'water') && !Bld.at(x, y))
            : MapGen.findNear(b.x, b.y + 1, 3, (x, y) => Path.passable(x, y) && !Bld.at(x, y)))
            || { x: b.x, y: b.y + 1 };
          const nu = Units.spawn(item.unit, b.owner, spot.x, spot.y);
          if (b.owner === 'P') G.log(`${CFG.UNITS[item.unit].name} ready`);
          // rally point: fresh units head there; villagers rallied onto a
          // resource tile (or boats onto stocked water) start gathering immediately
          if (b.owner === 'P' && b.rally) {
            if (Units.isVillager(nu) && CFG.GATHER[S.map.terrain[MapGen.idx(b.rally.x, b.rally.y)]])
              Units.assignGather(nu, b.rally.x, b.rally.y);
            else if (nu.kind === 'fishboat' && Units.canFish(b.rally.x, b.rally.y))
              Units.assignFish(nu, b.rally.x, b.rally.y);
            else Units.moveTo(nu, b.rally.x, b.rally.y);
          }
        }
      }
    }
  },

  /* once per day: passive production */
  dailyProduction(owner) {
    const res = owner === 'P' ? S.res : S.ai.res;
    const tc = this.tcOf(owner);
    const tcBoost = tc && tc.level >= 3 && this.done(tc) ? 1.1 : 1;
    const modeMult = owner === 'P' ? G.modeCfg().output : (G.modeCfg().aiOutput || 1);
    for (const b of this.list(owner)) {
      if (!this.done(b) || b.upgrading) continue;
      const out = this.lv(b).out;
      if (!out) continue;
      // worker buildings produce PER STATIONED VILLAGER, up to their crew cap;
      // the AI has no worker mechanic, so it's treated as fully crewed
      let crew = 1;
      if (this.def(b.key).needsWorker) {
        crew = owner === 'P' ? Math.min(this.workersActive(b), this.maxWorkers(b))
                             : this.maxWorkers(b);
        if (!crew) continue;
      }
      const mult = crew * this.nearBonus(b) * tcBoost * modeMult;
      for (const k in out) res[k] += out[k] * mult;
    }
  },

  // remove a building and leave rubble behind (buildable like any depleted tile)
  removeToRuin(b) {
    S.buildings.splice(S.buildings.indexOf(b), 1);
    this._block = null;
    const idx = MapGen.idx(b.x, b.y);
    if (S.map.terrain[idx] === T.WATER) {
      // a broken dock washes away — open water again, no rubble
      R.updateTile(b.x, b.y);
    } else {
      S.map.terrain[idx] = T.RUIN;
      if (S.map.resAmount) S.map.resAmount[idx] = 0;
      G.scheduleRevert(idx);
      R.updateTile(b.x, b.y);
    }
    for (const u of S.units) if (u.tBld === b.id) u.tBld = 0;
    if (UI.sel && UI.sel.type === 'bld' && UI.sel.id === b.id) UI.deselect();
  },

  damage(b, amt) {
    b.hp -= amt;
    if (b.hp <= 0) {
      const name = this.def(b.key).name, owner = b.owner, key = b.key;
      this.removeToRuin(b);
      if (owner === 'P') {
        G.log(`${name} destroyed!`, true);
        if (key === 'tc') G.end(false, 'Your Town Center was destroyed.');
      } else if (owner === 'A') {
        G.log(`Rival ${name} destroyed!`);
        if (key === 'tc') G.end(true, 'You razed the rival Town Center. The valley is yours!');
      }
    }
  },

  demolishRefund(b) {
    const d = this.def(b.key);
    const out = {};
    if (b.key === 'wall' || b.key === 'gate') {
      // fortifications refund on their current level only (village-wide upgrades)
      for (const k in d.levels[b.level - 1].cost) {
        const back = Math.floor(d.levels[b.level - 1].cost[k] * CFG.DEMOLISH_REFUND);
        if (back) out[k] = (out[k] || 0) + back;
      }
      return out;
    }
    const paidLevels = b.level + (b.upgrading > 0 ? 1 : 0);
    for (let i = 0; i < paidLevels; i++)
      for (const k in d.levels[i].cost) {
        const back = Math.floor(d.levels[i].cost[k] * CFG.DEMOLISH_REFUND);
        if (back) out[k] = (out[k] || 0) + back;
      }
    return out;
  },

  /* ---- village-wide wall level (walls + gates upgrade together via the TC) ---- */
  forts() {
    return S.buildings.filter(b => b.owner === 'P' && (b.key === 'wall' || b.key === 'gate'));
  },
  wallUpgradeCost() {
    const nextI = (S.wallLevel || 1);          // index of next level
    const out = {};
    for (const b of this.forts()) {
      const cost = CFG.BUILDINGS[b.key].levels[nextI].cost;
      for (const k in cost) out[k] = (out[k] || 0) + cost[k];
    }
    return out;
  },
  canUpgradeWalls() {
    if ((S.wallLevel || 1) >= 3) return { ok: false, why: 'Max level' };
    if (!this.forts().length) return { ok: false, why: 'No walls built' };
    const tc = this.tcOf('P');
    if (!tc || tc.level < S.wallLevel + 1)
      return { ok: false, why: `Needs Town Center Lv ${S.wallLevel + 1}` };
    const cost = this.wallUpgradeCost();
    if (!this.canAfford(cost)) return { ok: false, why: 'Not enough resources' };
    return { ok: true, cost };
  },
  upgradeWalls() {
    const c = this.canUpgradeWalls();
    if (!c.ok) return false;
    this.pay(c.cost, S.res);
    S.wallLevel++;
    for (const b of this.forts()) {
      const lv = CFG.BUILDINGS[b.key].levels[S.wallLevel - 1];
      b.hp = Math.max(1, Math.round(lv.hp * (b.hp / b.maxhp)));
      b.maxhp = lv.hp;
      b.level = S.wallLevel;
    }
    G.log(`⚒ Every wall and gate reinforced to Lv ${S.wallLevel}!`);
    return true;
  },

  demolish(b) {
    if (b.owner !== 'P' || b.key === 'tc') return false;   // the Town Center stays
    const refund = this.demolishRefund(b);
    for (const k in refund) S.res[k] += refund[k];
    const name = this.def(b.key).name;
    this.removeToRuin(b);
    G.log(`${name} demolished — recovered ${this.costStr(refund)}`);
    return true;
  },
};
