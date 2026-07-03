"use strict";
/* Units: villagers, defenders, wild animals, raiders — spawning, movement, tasks. */

const Units = {
  get(id) { return S.units.find(u => u.id === id); },

  spawn(kind, owner, x, y, opts) {
    opts = opts || {};
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

  isMilitary(u) { return u.kind === 'defender' || u.kind === 'elite'; },
  isVillager(u) { return u.kind === 'villager'; },
  isWild(u) { return u.owner === 'W'; },
  isRaider(u) { return u.owner === 'R'; },

  popUsed(owner) {
    let n = 0;
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
    if (u.owner === 'P' && this.isVillager(u) && this.villagerArmed()) return u.atk + 4;
    if (u.owner === 'P' && this.isMilitary(u)) {
      // Watchtower L3 signal fire aura
      for (const b of S.buildings)
        if (b.owner === 'P' && b.key === 'tower' && b.level >= 3 && Bld.done(b) &&
            Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y) < 6) return u.atk + 2;
    }
    return u.atk;
  },

  setPath(u, tx, ty) {
    const p = Path.find(u.x | 0, u.y | 0, tx, ty);
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
          const g = CFG.GATHER[S.map.terrain[MapGen.idx(t.x, t.y)]];
          if (!g) { u.task = null; continue; }
          const before = S.res[g.res];
          S.res[g.res] += g.rate * dt;
          if ((before | 0) !== (S.res[g.res] | 0) && Math.random() < 0.3)
            R.float(u.x, u.y - 0.5, '+' + g.res, '#d8e8b0');
        }
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

  damage(u, amt, attackerId) {
    u.hp -= Math.max(1, amt);
    if (u.hp <= 0) {
      S.units.splice(S.units.indexOf(u), 1);
      for (const o of S.units) if (o.tUnit === u.id) o.tUnit = 0;
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
      if (u.owner === 'P') G.log(`${CFG.UNITS[u.kind].name} was killed`, true);
      return;
    }
    // retaliation / flee
    if (u.tUnit || u.tBld) return;
    const attacker = attackerId ? this.get(attackerId) : null;
    if (!attacker) return;
    if (this.isVillager(u) && u.owner === 'P' && !this.villagerArmed()) {
      const tc = Bld.tcOf('P');
      if (tc) { u.task = { type: 'flee' }; this.setPath(u, tc.x, tc.y + 1); }
    } else if (this.isMilitary(u) || this.isWild(u) || this.isVillager(u)) {
      u.tUnit = attacker.id;
    }
  },

  // daily upkeep: wild animal spawning near forests
  dailySpawns() {
    if (S.day < CFG.ANIMALS.graceDays) return;   // early grace period — get established first
    if (this.count('W') >= CFG.ANIMALS.max) return;
    if (G.rand() > CFG.ANIMALS.spawnChance) return;
    // pick a random forest tile away from the player TC
    const tc = Bld.tcOf('P');
    for (let tries = 0; tries < 40; tries++) {
      const x = (G.rand() * CFG.W) | 0, y = (G.rand() * CFG.H) | 0;
      if (S.map.terrain[MapGen.idx(x, y)] !== T.FOREST) continue;
      if (tc && Math.hypot(x - tc.x, y - tc.y) < CFG.ANIMALS.minDistTC) continue;
      const kind = G.rand() < 0.6 ? 'wolf' : 'boar';
      this.spawn(kind, 'W', x, y);
      return;
    }
  },
};
