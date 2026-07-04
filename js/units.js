"use strict";
/* Units: villagers, defenders, wild animals, raiders — spawning, movement, tasks. */

const Units = {
  get(id) { return S.units.find(u => u.id === id); },

  spawn(kind, owner, x, y, opts) {
    opts = opts || {};
    x = Math.max(0, Math.min(CFG.W - 1, x));
    y = Math.max(0, Math.min(CFG.H - 1, y));
    const base = CFG.UNITS[kind];
    const scale = opts.scale || 1;
    const u = {
      id: S.nextId++, kind, owner,
      x: x + 0.5, y: y + 0.5,
      hp: Math.round(base.hp * scale), maxhp: Math.round(base.hp * scale),
      atk: Math.round(base.atk * scale), def: base.def, speed: base.speed,
      path: null, pathI: 0,
      task: null,             // {type:'gather'|'move'|'flee'|'raid'|'attackBld', ...}
      tUnit: 0, tBld: 0,      // combat targets (ids)
      anchor: { x: x + 0.5, y: y + 0.5 },
      cd: 0, animT: Math.random() * 10, wanderT: 1 + Math.random() * 3,
      repathT: 0,
    };
    S.units.push(u);
    return u;
  },

  isMilitary(u) {
    return u.kind === 'defender' || u.kind === 'elite' || u.kind === 'rider' ||
           u.kind === 'lancer' || u.kind === 'archer' || u.kind === 'marksman';
  },
  isVillager(u) { return u.kind === 'villager'; },
  isWild(u) { return u.owner === 'W'; },
  isPassive(u) { return u.kind === 'deer' || u.kind === 'cow'; },
  isRaider(u) { return u.owner === 'R'; },

  popUsed(owner) {
    let n = owner === 'P' && S.garrison ? S.garrison.length : 0;
    for (const u of S.units) if (u.owner === owner && (this.isVillager(u) || this.isMilitary(u))) n++;
    return n;
  },
  count(owner, pred) {
    let n = 0;
    for (const u of S.units) if (u.owner === owner && (!pred || pred(u))) n++;
    return n;
  },

  villagerArmed() {
    return S.buildings.some(b => b.owner === 'P' && b.key === 'lodge' && b.level >= 3 && Bld.done(b));
  },
  effAtk(u) {
    let atk = u.atk;
    if (u.owner === 'P' && this.isVillager(u) && this.villagerArmed()) atk += 4;
    if (u.owner === 'P' && this.isMilitary(u)) {
      // Watchtower L3 signal fire aura
      for (const b of S.buildings)
        if (b.owner === 'P' && b.key === 'tower' && b.level >= 3 && Bld.done(b) &&
            Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y) < 6) { atk += 2; break; }
    }
    // home turf: fighting near your own Town Center favors the defender (+10%)
    if (u.owner === 'P' || u.owner === 'A') {
      const tc = Bld.tcOf(u.owner);
      if (tc && Math.hypot(tc.x + 0.5 - u.x, tc.y + 0.5 - u.y) <= CFG.HOME_TURF.range)
        atk *= CFG.HOME_TURF.mult;
    }
    return atk;
  },

  setPath(u, tx, ty) {
    const p = Path.find(u.x | 0, u.y | 0, tx, ty, u.owner);
    if (p) { u.path = p; u.pathI = 0; }
    return !!p;
  },

  moveTo(u, tx, ty) {
    u.task = { type: 'move', x: tx, y: ty };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, tx, ty);
  },

  assignGather(u, tx, ty) {
    const g = CFG.GATHER[S.map.terrain[MapGen.idx(tx, ty)]];
    if (!g) return false;
    u.task = { type: 'gather', x: tx, y: ty, res: g.res };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, tx, ty);
  },

  nearestIdleVillager(x, y) {
    let best = null, bd = 1e9;
    for (const u of S.units) {
      if (u.owner !== 'P' || !this.isVillager(u) || u.task || u.tUnit) continue;
      const d = Math.hypot(u.x - x - 0.5, u.y - y - 0.5);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },

  // send a villager to construct or repair a building; frees up when done
  assignBuild(u, b) {
    u.task = { type: 'build', id: b.id };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, b.x, b.y);
  },

  // formation move: everyone converges on the clicked tile. Goals are picked by
  // flood-filling walkable ground outward from the click, so every spot is
  // guaranteed reachable and clustered where the player tapped — no unit ever
  // wanders off to a "nearby" tile that's actually across a lake or ridge.
  // Melee take the spots toward the approach front, ranged fill in behind.
  groupMove(ids, tx, ty) {
    const units = ids.map(id => this.get(id)).filter(Boolean);
    if (!units.length) return;
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    let dx = tx + 0.5 - cx, dy = ty + 0.5 - cy;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const start = Path.passable(tx, ty, 'P') ? { x: tx, y: ty }
      : MapGen.findNear(tx, ty, 6, (x, y) => Path.passable(x, y, 'P'));
    if (!start) { for (const u of units) this.moveTo(u, tx, ty); return; }
    const spots = [];
    const seen = new Set([start.x + ',' + start.y]);
    const q = [start];
    while (q.length && spots.length < units.length) {
      const c = q.shift();
      spots.push(c);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + ox, ny = c.y + oy, k = nx + ',' + ny;
        if (seen.has(k) || !Path.passable(nx, ny, 'P')) continue;
        seen.add(k);
        q.push({ x: nx, y: ny });
      }
    }
    // frontmost spots (furthest along the direction of travel) first
    spots.sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy));
    const melee = units.filter(u => !CFG.UNITS[u.kind].rng);
    const ranged = units.filter(u => CFG.UNITS[u.kind].rng);
    melee.concat(ranged).forEach((u, i) => {
      const spot = spots[i % spots.length];
      this.moveTo(u, spot.x, spot.y);
    });
  },

  orderAttackBuilding(u, b) {
    u.task = { type: 'attackBld' };
    u.tBld = b.id; u.tUnit = 0;
    this.setPath(u, b.x, b.y);
  },

  // advance along path; returns true when path finished
  followPath(u, dt) {
    if (!u.path || u.pathI >= u.path.length) return true;
    const wp = u.path[u.pathI];
    const tx = wp.x + 0.5, ty = wp.y + 0.5;
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    const step = u.speed * dt;
    if (d <= step) {
      u.x = tx; u.y = ty; u.pathI++;
      return u.pathI >= u.path.length;
    }
    u.x += dx / d * step; u.y += dy / d * step;
    return false;
  },

  moving(u) { return u.path && u.pathI < u.path.length; },

  update(dt) {
    for (let i = S.units.length - 1; i >= 0; i--) {
      const u = S.units[i];
      u.animT += dt;
      if (u.cd > 0) u.cd -= dt;

      // combat engagement (chasing/attacking) is driven by combat.js
      if (u.tUnit || u.tBld) continue;

      if (this.isWild(u)) { this.wildIdle(u, dt); continue; }

      if (this.isRaider(u) || (u.owner === 'A' && u.task && u.task.type === 'raid')) {
        Combat.raiderSeek(u);
        continue;
      }

      const t = u.task;
      if (!t) continue;
      if (t.type === 'move') {
        if (this.followPath(u, dt)) { u.task = null; u.anchor = { x: u.x, y: u.y }; }
      } else if (t.type === 'flee') {
        if (this.followPath(u, dt)) u.task = null;
      } else if (t.type === 'gather') {
        const onTile = (u.x | 0) === t.x && (u.y | 0) === t.y;
        if (!onTile) {
          if (this.followPath(u, dt) && !onTile && !((u.x | 0) === t.x && (u.y | 0) === t.y)) {
            // path ended but not on the tile (blocked) — give up
            u.task = null;
          }
        } else {
          const idx = MapGen.idx(t.x, t.y);
          const terr = S.map.terrain[idx];
          const g = CFG.GATHER[terr];
          if (!g) { u.task = null; continue; }
          const before = S.res[g.res];
          const take = Math.min(S.map.resAmount[idx], g.rate * dt * G.modeCfg().gather);
          S.res[g.res] += take;
          S.map.resAmount[idx] -= take;
          if ((before | 0) !== (S.res[g.res] | 0) && Math.random() < 0.3)
            R.float(u.x, u.y - 0.5, '+' + g.res, '#d8e8b0');
          if (S.map.resAmount[idx] <= 0.001) {
            // tile exhausted — it turns to stumps/pebbles/spent soil and frees the villager
            S.map.resAmount[idx] = 0;
            S.map.terrain[idx] = CFG.DEPLETED[terr];
            G.scheduleRevert(idx);
            R.updateTile(t.x, t.y);
            const what = terr === T.FOREST ? 'The forest here is felled'
              : terr === T.HILLS ? 'The stone here is quarried out' : 'The soil here is spent';
            G.log(`${what} — villager idle`, true);
            u.task = null;
          }
        }
      } else if (t.type === 'build') {
        const b = Bld.get(t.id);
        if (!b || b.owner !== 'P' || (b.construction <= 0 && b.upgrading <= 0 && b.hp >= b.maxhp)) {
          u.task = null;   // done (or site gone) — villager is free again
          continue;
        }
        const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
        if (d > 1.25) {
          if (this.moving(u)) this.followPath(u, dt);
          else if (!this.setPath(u, b.x, b.y)) u.task = null;
        } else {
          u.path = null;
          const dtDays = dt * 1000 / CFG.DAY_MS;
          if (b.construction > 0) {
            b.construction -= dtDays;
            if (b.construction <= 0) {
              Bld.finish(b, u);   // may station the builder as the worker
              if (u.task && u.task.type === 'build') {
                u.task = null;
                // walk the wall line: continue to the nearest unmanned site
                let best = null, bd = 6;
                for (const nb of S.buildings) {
                  if (nb.owner !== 'P' || nb.construction <= 0 || Bld.hasWorker(nb)) continue;
                  const dd = Math.hypot(nb.x + 0.5 - u.x, nb.y + 0.5 - u.y);
                  if (dd < bd) { bd = dd; best = nb; }
                }
                if (best) this.assignBuild(u, best);
              }
            }
          } else if (b.upgrading > 0) {
            b.upgrading -= dtDays;
            if (b.upgrading <= 0) { Bld.finishUpgrade(b); u.task = null; }
          } else {
            b.hp = Math.min(b.maxhp, b.hp + b.maxhp * CFG.REPAIR_RATE * dtDays);
            if (b.hp >= b.maxhp) { u.task = null; G.log(`${Bld.def(b.key).name} repaired`); }
          }
        }
      } else if (t.type === 'garrison') {
        // heading into the Town Center for shelter
        const tc = Bld.tcOf('P');
        if (!tc) { u.task = null; continue; }
        const d = Math.hypot(tc.x + 0.5 - u.x, tc.y + 0.5 - u.y);
        if (d > 1.4) {
          if (this.moving(u)) this.followPath(u, dt);
          else if (!this.setPath(u, tc.x, tc.y)) u.task = null;
        } else {
          S.garrison.push({ hp: u.hp, maxhp: u.maxhp });
          if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
          S.units.splice(i, 1);
        }
      } else if (t.type === 'work') {
        // stationed at a production building — stand there and keep it running
        const b = Bld.get(t.id);
        if (!b || b.owner !== 'P' || !Bld.def(b.key).needsWorker) { u.task = null; continue; }
        const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
        if (d > 1.25) {
          if (this.moving(u)) this.followPath(u, dt);
          else if (!this.setPath(u, b.x, b.y)) u.task = null;
        } else u.path = null;
      } else if (t.type === 'attackBld') {
        // target destroyed while en route
        u.task = null;
      }
    }
  },

  wildIdle(u, dt) {
    if (this.moving(u)) { this.followPath(u, dt); return; }
    u.wanderT -= dt;
    if (u.wanderT <= 0) {
      u.wanderT = 2 + Math.random() * 4;
      const tx = (u.x | 0) + ((Math.random() * 9) | 0) - 4;
      const ty = (u.y | 0) + ((Math.random() * 9) | 0) - 4;
      if (Path.passable(tx, ty)) this.setPath(u, tx, ty);
    }
  },

  damage(u, amt, attackerId, attackerOwner) {
    u.hp -= Math.max(1, amt);
    const attacker = attackerId ? this.get(attackerId) : null;
    if (u.hp <= 0) {
      S.units.splice(S.units.indexOf(u), 1);
      for (const o of S.units) if (o.tUnit === u.id) o.tUnit = 0;
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
      if (u.owner === 'P') G.log(`${CFG.UNITS[u.kind].name} was killed`, true);
      // any wild animal killed by a tribe yields meat
      if (this.isWild(u)) {
        const owner = (attacker && attacker.owner) || attackerOwner;
        if (owner === 'P') {
          S.res.food += CFG.MEAT_DROP;
          R.float(u.x, u.y - 0.5, '+' + CFG.MEAT_DROP + ' food', '#d8e8b0');
        } else if (owner === 'A') S.ai.res.food += CFG.MEAT_DROP;
      }
      return;
    }
    // retaliation / flee
    if (u.tUnit || u.tBld) return;
    if (this.isPassive(u)) {
      // game animals bolt away from whatever hurt them
      const ax = attacker ? attacker.x : u.x + 1, ay = attacker ? attacker.y : u.y;
      const d = Math.hypot(u.x - ax, u.y - ay) || 1;
      const tx = Math.round(u.x + (u.x - ax) / d * 6), ty = Math.round(u.y + (u.y - ay) / d * 6);
      const spot = MapGen.findNear(tx, ty, 4, (x, y) => Path.passable(x, y));
      if (spot) this.setPath(u, spot.x, spot.y);
      return;
    }
    if (!attacker) return;
    if (this.isVillager(u) && u.owner === 'P' && !this.villagerArmed()) {
      const tc = Bld.tcOf('P');
      if (tc) { u.task = { type: 'flee' }; this.setPath(u, tc.x, tc.y + 1); }
    } else if (this.isMilitary(u) || this.isWild(u) || this.isVillager(u)) {
      u.tUnit = attacker.id;
    }
  },

  // daily upkeep: wildlife spawning
  dailySpawns() {
    const m = G.modeCfg();
    // grazing game animals (harmless, huntable) — kept around in small numbers
    if (this.count('W', u => this.isPassive(u)) < CFG.PASSIVE_MAX && G.rand() < 0.4)
      this.spawnWild(G.rand() < 0.5 ? 'deer' : 'cow', 8);
    // predators
    if (S.day < CFG.ANIMALS.graceDays) return;   // early grace period — get established first
    if (this.count('W', u => !this.isPassive(u)) >= m.animalMax) return;
    if (G.rand() > m.animalChance) return;
    this.spawnWild(G.rand() < 0.6 ? 'wolf' : 'boar', CFG.ANIMALS.minDistTC);
  },

  spawnWild(kind, minDistTC) {
    const passive = kind === 'deer' || kind === 'cow';
    const tc = Bld.tcOf('P');
    const open = Path.borderReach();   // keep beasts from popping up inside sealed walls
    for (let tries = 0; tries < 40; tries++) {
      const x = (G.rand() * CFG.W) | 0, y = (G.rand() * CFG.H) | 0;
      const t = S.map.terrain[MapGen.idx(x, y)];
      if (t !== T.FOREST && !(passive && t === T.GRASS)) continue;
      if (Bld.at(x, y)) continue;
      if (tc && Math.hypot(x - tc.x, y - tc.y) < minDistTC) continue;
      if (open && !open[MapGen.idx(x, y)]) continue;
      return this.spawn(kind, 'W', x, y);
    }
    return null;
  },
};
