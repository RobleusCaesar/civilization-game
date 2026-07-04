"use strict";
/* Combat: target acquisition, chasing, attacks, tower fire.
   Simple resolution: damage = max(1, attack - defense) per hit. */

const Combat = {
  shots: [],        // tower arrows for rendering: {x1,y1,x2,y2,t}
  scanT: 0,

  // hostility matrix: P<->A, P<->R, P<->W, A<->W
  hostile(a, b) {
    if (a === b) return false;
    if ((a === 'P' && b !== 'P')) return true;
    if ((b === 'P' && a !== 'P')) return true;
    if ((a === 'A' && b === 'W') || (a === 'W' && b === 'A')) return true;
    return false;
  },

  nearestUnit(x, y, maxD, pred) {
    let best = null, bd = maxD;
    for (const u of S.units) {
      if (!pred(u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  nearestBuilding(x, y, owner, pred) {
    let best = null, bd = 1e9;
    for (const b of S.buildings) {
      if (b.owner !== owner) continue;
      if (pred && !pred(b)) continue;
      const d = Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  acquire() {
    for (const u of S.units) {
      if (u.tUnit || u.tBld) continue;
      const base = CFG.UNITS[u.kind];
      if (u.kind === 'wolf') {
        const v = this.nearestUnit(u.x, u.y, base.aggro, o => Units.isVillager(o));
        if (v) u.tUnit = v.id;
      } else if (u.kind === 'boar') {
        const v = this.nearestUnit(u.x, u.y, base.aggro, o => o.owner === 'P' || o.owner === 'A');
        if (v) u.tUnit = v.id;
      } else if (Units.isMilitary(u) && !(u.task && u.task.type === 'raid')) {
        // guards: engage hostiles near them (but don't stray while following an order,
        // and never auto-hunt harmless game — that's the player's call)
        if (u.task && u.task.type === 'move') continue;
        const e = this.nearestUnit(u.x, u.y, base.aggro,
          o => this.hostile(u.owner, o.owner) && !Units.isPassive(o));
        if (e && Math.hypot(e.x - u.anchor.x, e.y - u.anchor.y) < 9) u.tUnit = e.id;
      }
    }
  },

  // raiders + AI raid parties pick their objective
  raiderSeek(u) {
    const foe = this.nearestUnit(u.x, u.y, CFG.UNITS[u.kind].aggro || 2.5,
      o => o.owner === 'P' && (Units.isMilitary(o) || Units.isVillager(o)));
    if (foe && Units.isMilitary(foe)) { u.tUnit = foe.id; return; }
    const b = this.nearestBuilding(u.x, u.y, 'P');
    if (b) {
      // try to reach the target; if walls are in the way the path stops short —
      // then batter the closest wall or gate instead
      Units.setPath(u, b.x, b.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x, y: u.y };
      if (Math.hypot(end.x - b.x, end.y - b.y) <= 1.6) { u.tBld = b.id; return; }
      const wall = this.nearestBuilding(u.x, u.y, 'P', bb => bb.key === 'wall' || bb.key === 'gate');
      if (wall) { u.tBld = wall.id; Units.setPath(u, wall.x, wall.y); return; }
      u.tBld = b.id;   // no wall found — press on regardless
      return;
    }
    if (foe) { u.tUnit = foe.id; return; }
    // nothing left to attack — raiders leave, AI parties go home
    if (u.owner === 'R') {
      const ex = u.x < CFG.W / 2 ? 0 : CFG.W - 1;
      if (Math.abs(u.x - ex) < 1.5) { S.units.splice(S.units.indexOf(u), 1); return; }
      if (!Units.moving(u)) Units.setPath(u, ex, u.y | 0);
      } else if (u.owner === 'A') {
      u.task = null;
      const tc = Bld.tcOf('A');
      if (tc) { u.anchor = { x: tc.x + 0.5, y: tc.y + 2.5 }; Units.setPath(u, tc.x, tc.y + 2); }
    }
  },

  update(dt) {
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.4; this.acquire(); }

    for (const u of S.units) {
      if (u.repathT > 0) u.repathT -= dt;

      if (u.tUnit) {
        const tgt = Units.get(u.tUnit);
        if (!tgt) { u.tUnit = 0; continue; }
        const d = Math.hypot(tgt.x - u.x, tgt.y - u.y);
        // hunting harmless game is a deliberate order — the hunter follows the prey
        if (Units.isPassive(tgt)) u.anchor = { x: u.x, y: u.y };
        // guards give up long chases and go home; wild animals lose interest even sooner
        const leash = Units.isWild(u) ? CFG.ANIMALS.leash
          : (Units.isMilitary(u) && !(u.task && u.task.type === 'raid')) ? 10 : 0;
        if (leash && Math.hypot(u.x - u.anchor.x, u.y - u.anchor.y) > leash) {
          u.tUnit = 0;
          Units.setPath(u, u.anchor.x | 0, u.anchor.y | 0);
          if (!Units.isWild(u)) u.task = { type: 'move', x: u.anchor.x | 0, y: u.anchor.y | 0 };
          continue;
        }
        const reach = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE;
        if (d > reach) {
          // at close range steer straight at the target — grid waypoints can't
          // corner moving prey; fall back to pathfinding around water/walls
          const step = u.speed * dt;
          const nx = u.x + (tgt.x - u.x) / d * step, ny = u.y + (tgt.y - u.y) / d * step;
          if (d < 3 && Path.passable(nx | 0, ny | 0, u.owner)) {
            u.x = nx; u.y = ny; u.path = null;
          } else {
            if (u.repathT <= 0) { u.repathT = 0.5; Units.setPath(u, tgt.x | 0, tgt.y | 0); }
            Units.followPath(u, dt);
          }
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN;
          if (CFG.UNITS[u.kind].rng)
            this.shots.push({ x1: u.x, y1: u.y - 0.3, x2: tgt.x, y2: tgt.y, t: 0.15 });
          const dmg = Math.max(1, Math.round(Units.effAtk(u) - tgt.def));
          R.float(tgt.x, tgt.y - 0.4, '-' + dmg, '#f08a7a');
          Units.damage(tgt, dmg, u.id);
        }
        continue;
      }

      if (u.tBld) {
        const b = Bld.get(u.tBld);
        if (!b) { u.tBld = 0; continue; }
        // fight back defenders that get close while sieging
        const foe = this.nearestUnit(u.x, u.y, 2.2, o => this.hostile(u.owner, o.owner) && Units.isMilitary(o));
        if (foe) { u.tUnit = foe.id; continue; }
        const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
        const bReach = Math.max(1.3, CFG.UNITS[u.kind].rng || 0);
        if (d > bReach) {
          if (u.repathT <= 0) { u.repathT = 0.8; Units.setPath(u, b.x, b.y); }
          Units.followPath(u, dt);
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN;
          if (CFG.UNITS[u.kind].rng)
            this.shots.push({ x1: u.x, y1: u.y - 0.3, x2: b.x + 0.5, y2: b.y + 0.5, t: 0.15 });
          const dmg = Math.max(1, Math.round(Units.effAtk(u)));
          Bld.damage(b, dmg);
          if (b.hp > 0 && b.owner === 'P' && Math.random() < 0.15)
            G.log(`${Bld.def(b.key).name} under attack!`, true);
        }
      }
    }

    // watchtowers
    for (const b of S.buildings) {
      if (b.key !== 'tower' || !Bld.done(b)) continue;
      if (b.cd > 0) { b.cd -= dt; continue; }
      const lv = Bld.lv(b);
      const cx = b.x + 0.5, cy = b.y + 0.5;
      const tgt = this.nearestUnit(cx, cy, lv.range,
        o => this.hostile(b.owner, o.owner) && !Units.isPassive(o));
      if (tgt) {
        b.cd = 1.4;
        const dmg = Math.max(1, lv.atk - tgt.def);
        this.shots.push({ x1: cx, y1: cy - 0.6, x2: tgt.x, y2: tgt.y, t: 0.18 });
        R.float(tgt.x, tgt.y - 0.4, '-' + dmg, '#f0d27a');
        Units.damage(tgt, dmg, 0, b.owner);
      } else b.cd = 0.3;
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      this.shots[i].t -= dt;
      if (this.shots[i].t <= 0) this.shots.splice(i, 1);
    }
  },

  /* raider wave spawning, called from the day tick */
  maybeWave() {
    if (S.day < S.wave.next) return;
    const m = G.modeCfg();
    S.wave.count++;
    const gap = CFG.WAVES.minGap + Math.floor(G.rand() * (CFG.WAVES.maxGap - CFG.WAVES.minGap + 1));
    S.wave.next = S.day + Math.max(4, Math.round(gap * m.waveGapMult));
    const n = Math.max(1, Math.min(10, 1 + Math.ceil(S.wave.count * 0.8) + m.waveSizeAdd));
    const scale = 1 + S.wave.count * CFG.WAVES.scaleHp;

    // spawn near a raider camp if any, else map edge
    let sx, sy;
    const camps = S.map.spawns.camps;
    if (camps.length && G.rand() < 0.6) {
      const c = camps[(G.rand() * camps.length) | 0];
      sx = c.x; sy = c.y;
    } else {
      const side = (G.rand() * 4) | 0;
      sx = side === 0 ? 0 : side === 1 ? CFG.W - 1 : (G.rand() * CFG.W) | 0;
      sy = side === 2 ? 0 : side === 3 ? CFG.H - 1 : (G.rand() * CFG.H) | 0;
    }
    const spot = MapGen.findNear(sx, sy, 6, (x, y) => Path.passable(x, y)) || { x: sx, y: sy };
    for (let i = 0; i < n; i++) {
      const kind = (S.wave.count >= 4 && i % 3 === 2) ? 'brute' : 'raider';
      const p = MapGen.findNear(spot.x, spot.y, 4, (x, y) => Path.passable(x, y));
      Units.spawn(kind, 'R', p.x, p.y, { scale });
    }
    G.log(`⚔ Raider war party sighted (${n})!`, true);
  },
};
