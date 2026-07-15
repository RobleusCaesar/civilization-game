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
    if (window.Cards) Cards.onSpawn(u);   // ORIGIN CARDS: Ironhand toughness
    S.units.push(u);
    return u;
  },

  isMilitary(u) {
    return u.kind === 'defender' || u.kind === 'axeman' || u.kind === 'elite' ||
           u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer' ||
           u.kind === 'archer' || u.kind === 'longbow' || u.kind === 'marksman' ||
           u.kind === 'warship' || u.kind === 'fireship' ||
           u.kind === 'catapult' || u.kind === 'ballista' || u.kind === 'siegetower';
  },
  isSiege(u) { return u.kind === 'catapult' || u.kind === 'siegetower' || u.kind === 'trebuchet'; },
  isVillager(u) { return u.kind === 'villager'; },
  isSapper(u) { return u.kind === 'sapper'; },
  isNaval(u) { return !!CFG.UNITS[u.kind].naval; },
  isTransport(u) { return u.kind === 'transport' || u.kind === 'bigtransport'; },
  // groups up as a fleet: any war/transport hull, but NOT a working fishing boat
  isFleetable(u) { return this.isNaval(u) && u.kind !== 'fishboat'; },
  domain(u) { return CFG.UNITS[u.kind].naval ? 'water' : 'land'; },
  isWild(u) { return u.owner === 'W'; },
  isPassive(u) { return u.kind === 'deer' || u.kind === 'cow'; },
  isRaider(u) { return u.owner === 'R'; },

  popUsed(owner) {
    let n = owner === 'P' && S.garrison ? S.garrison.length : 0;
    for (const u of S.units)
      if (u.owner === owner && (this.isVillager(u) || this.isMilitary(u) ||
          u.kind === 'fishboat' || this.isTransport(u))) {
        n++;
        if (this.isTransport(u) && u.cargo) n += u.cargo.length;   // soldiers below deck still eat
      }
    return n;
  },
  count(owner, pred) {
    let n = 0;
    for (const u of S.units) if (u.owner === owner && (!pred || pred(u))) n++;
    return n;
  },

  // total food eaten PER DAY by everything an owner keeps — villagers, soldiers,
  // ships and the troops riding them (see CFG.FOOD_UPKEEP / G.applyFoodUpkeep).
  foodUpkeep(owner) {
    const U = CFG.FOOD_UPKEEP; if (!U) return 0;
    let f = 0;
    // garrisoned player defenders still eat
    if (owner === 'P' && S.garrison) f += S.garrison.length * U.military;
    for (const u of S.units) {
      if (u.owner !== owner) continue;
      if (this.isVillager(u) || this.isSapper(u)) f += U.villager;
      else if (u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer') f += U.cavalry;
      else if (this.isSiege(u) || u.kind === 'ballista') f += U.siege;
      else if (u.kind === 'fishboat' || this.isTransport(u)) {
        f += U.boat;
        if (u.cargo) f += u.cargo.length * U.cargo;   // soldiers below deck still eat
      }
      else if (u.kind === 'warship' || u.kind === 'fireship') f += U.warship;
      else if (this.isMilitary(u)) f += U.military;
    }
    return f;
  },
  // famine: a soldier walks off in search of food. Villagers NEVER desert — the
  // town must survive to farm its way back — so only fighters (hungriest first:
  // cavalry, then engines, then foot) leave. Field troops go before the garrison.
  desertHungry(owner) {
    const rank = u => (u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer') ? 3
                    : (this.isSiege(u) || u.kind === 'ballista') ? 2
                    : this.isMilitary(u) ? 1 : 0;
    let victim = null, best = 0;
    for (const u of S.units) {
      if (u.owner !== owner) continue;
      const r = rank(u);
      if (r > best) { best = r; victim = u; }
    }
    if (victim) {
      const name = CFG.UNITS[victim.kind].name;
      this.despawn(victim);
      if (owner === 'P') G.log(`🥀 A hungry ${name} deserts — there was no food to give.`, true);
      return true;
    }
    // no field soldiers left — a garrisoned defender slips away instead
    if (owner === 'P' && S.garrison && S.garrison.length) {
      S.garrison.pop();
      G.log('🥀 A hungry defender abandons the garrison — the stores are empty.', true);
      return true;
    }
    return false;   // only villagers remain; the town simply tightens its belt
  },
  // cleanly pull a unit off the map (used by desertion)
  despawn(u) {
    const i = S.units.indexOf(u);
    if (i < 0) return;
    S.units.splice(i, 1);
    for (const o of S.units) if (o.tUnit === u.id) o.tUnit = 0;
    if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
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
      if (tc && Math.hypot(Bld.cx(tc) - u.x, Bld.cy(tc) - u.y) <= CFG.HOME_TURF.range + Bld.reach(tc))
        atk *= CFG.HOME_TURF.mult;
    }
    return atk;
  },

  setPath(u, tx, ty) {
    const p = Path.find(u.x | 0, u.y | 0, tx, ty, u.owner, this.domain(u));
    if (p) { u.path = p; u.pathI = 0; }
    return !!p;
  },

  moveTo(u, tx, ty) {
    u.task = { type: 'move', x: tx, y: ty };
    u.tUnit = 0; u.tBld = 0;
    if (u.jobs) u.jobs = null;   // an explicit walk order cancels any queued sapper work
    return this.setPath(u, tx, ty);
  },

  /* ---- DEFEND stance: hold a perimeter around the Town Center / Dock ---- */
  // which units can be told to Defend — every land soldier and every warship
  canDefend(u) { return this.isMilitary(u); },
  // the guard post for a defending unit: {x,y, r1 (hold radius), r2 (sortie/leash)}
  // centred on its own Town Center (land) or nearest Dock (warships). null = no home.
  guardCenter(u) {
    const naval = this.isNaval(u);
    let b = null;
    if (naval) {
      let bd = 1e9;
      for (const o of S.buildings)
        if (o.owner === u.owner && o.key === 'dock' && Bld.done(o)) {
          const d = Math.hypot(Bld.cx(o) - u.x, Bld.cy(o) - u.y);
          if (d < bd) { bd = d; b = o; }
        }
    } else b = Bld.tcOf(u.owner);
    if (!b) return null;
    const G2 = CFG.GUARD;
    const r1 = (naval ? G2.navalRadius : G2.radius) * (1 + G2.levelStep * ((b.level || 1) - 1));
    return { x: Bld.cx(b), y: Bld.cy(b), r1, r2: r1 * (1 + G2.sortie) };
  },
  // walk back to just inside the perimeter (a 'guard' move task, which acquire()
  // leaves alone until it lands — that's the hysteresis that stops jittering)
  returnToGuard(u, g) {
    g = g || this.guardCenter(u);
    if (!g) return;
    const d = Math.hypot(u.x - g.x, u.y - g.y) || 1, rr = g.r1 * 0.82;
    const tx = (g.x + (u.x - g.x) / d * rr) | 0, ty = (g.y + (u.y - g.y) / d * rr) | 0;
    u.tUnit = 0; u.tBld = 0; u.tBridge = null;
    u.task = { type: 'move', x: tx, y: ty, guard: true };
    if (!this.setPath(u, tx, ty)) u.task = null;
  },
  // toggle the stance; turning it on pulls a strayed unit back to its perimeter
  setDefend(u, on) {
    if (!this.canDefend(u)) return;
    u.defend = !!on;
    if (!on) return;
    const g = this.guardCenter(u);
    if (g && Math.hypot(u.x - g.x, u.y - g.y) > g.r1) this.returnToGuard(u, g);
    else { u.task = null; u.tUnit = 0; u.tBld = 0; u.tBridge = null; u.path = null; }
  },

  // stand on an OPEN tile beside the resource and work it — the wood/rock/
  // orchard tile itself is impassable now, so the villager harvests from the
  // edge (and felling it opens the ground). Returns false if it's fully walled.
  assignGather(u, tx, ty) {
    const g = CFG.GATHER[S.map.terrain[MapGen.idx(tx, ty)]];
    if (!g) return false;
    let best = null, bd = 1e9;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ox, y = ty + oy;
      if (!Path.passable(x, y, u.owner) || Bld.at(x, y)) continue;
      // prefer an edge no one else is already working this node from, so a crew
      // spreads around the resource instead of stacking on one side
      const taken = S.units.some(o => o !== u && o.task && o.task.type === 'gather' &&
        o.task.x === tx && o.task.y === ty && o.task.sx === x && o.task.sy === y);
      const dd = Math.hypot(u.x - x, u.y - y) + (taken ? 100 : 0);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    if (!best) return false;
    // stand at the NEAR edge of the chosen tile, hard up against the resource
    // (offset the resting point toward the node, but stay within the tile)
    const STAND = 0.4;
    u.task = {
      type: 'gather', x: tx, y: ty, sx: best.x, sy: best.y, res: g.res,
      stx: best.x + 0.5 + (tx - best.x) * STAND, sty: best.y + 0.5 + (ty - best.y) * STAND,
    };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, best.x, best.y);
  },

  // fishing boats harvest fish from stocked water tiles
  canFish(tx, ty) {
    const i = MapGen.idx(tx, ty);
    return S.map.terrain[i] === T.WATER && S.map.resAmount[i] > 0 && !Bld.at(tx, ty);
  },
  assignFish(u, tx, ty) {
    if (u.kind !== 'fishboat' || !this.canFish(tx, ty)) return false;
    u.task = { type: 'fish', x: tx, y: ty };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, tx, ty);
  },

  // villagers can line-fish a shoal from the beach beside it
  assignShoreFish(u, tx, ty) {
    if (!this.isVillager(u) || !MapGen.shoal(tx, ty) || S.map.resAmount[MapGen.idx(tx, ty)] <= 0)
      return false;
    let best = null, bd = 1e9;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ox, y = ty + oy;
      if (!Path.passable(x, y, u.owner) || Bld.at(x, y)) continue;
      const dd = Math.hypot(u.x - x, u.y - y);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    if (!best) return false;
    u.task = { type: 'shorefish', x: tx, y: ty, sx: best.x, sy: best.y };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, best.x, best.y);
  },

  // highest finished Sappers' Camp level for a tribe — gates the tiers
  // (1 trench/moat, 2 bridge, 3 clear)
  sapperTier(owner) {
    let lv = 0;
    for (const b of S.buildings)
      if (b.owner === owner && b.key === 'sapper' && Bld.done(b) && !b.upgrading) lv = Math.max(lv, b.level);
    return lv;
  },
  // which terraform job (if any) a sapper of this tribe can do on a tile
  terraformJob(owner, tx, ty) {
    const tier = this.sapperTier(owner); if (tier < 1) return null;
    if (Terraform.isDiggable(tx, ty)) return 'dig';
    if (tier >= 2 && Terraform.bridgeCrossing(tx, ty, owner) && !(Bld.bridgeAt && Bld.bridgeAt(tx, ty))) return 'bridge';
    if (tier >= 3 && Terraform.isClearable(tx, ty)) return 'clear';
    return null;
  },
  // can a sapper of this tribe do a SPECIFIC job on this tile? (tier + tile type)
  canTerraform(owner, tx, ty, job) {
    const tier = this.sapperTier(owner); if (tier < 1) return false;
    if (job === 'dig') return Terraform.isDiggable(tx, ty);
    if (job === 'bridge') return tier >= 2 && !!Terraform.bridgeCrossing(tx, ty, owner) && !(Bld.bridgeAt && Bld.bridgeAt(tx, ty));
    if (job === 'clear') return tier >= 3 && Terraform.isClearable(tx, ty);
    if (job === 'mound') return tier >= 3 && Terraform.isMoundable(tx, ty, owner);
    return false;
  },
  // order a sapper to reshape a tile: path to the open edge beside it, then work.
  // forceJob (from a panel tool) picks the job explicitly; else it's auto-detected.
  assignTerraform(u, tx, ty, forceJob) {
    if (u.kind !== 'sapper') return false;
    const job = forceJob ? (this.canTerraform(u.owner, tx, ty, forceJob) ? forceJob : null)
                         : this.terraformJob(u.owner, tx, ty);
    if (!job) return false;
    if (job === 'dig' && Terraform.digWouldSeal(tx, ty)) return false;   // reachability clamp, checked up front too
    let best = null, bd = 1e9;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ox, y = ty + oy;
      if (!Path.passable(x, y, u.owner) || Bld.at(x, y)) continue;
      const dd = Math.hypot(u.x - x, u.y - y);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    if (!best) return false;
    const time = job === 'dig' ? CFG.TERRAFORM.dig : job === 'bridge' ? CFG.TERRAFORM.bridge
      : job === 'mound' ? Terraform.moundTime(tx, ty) : CFG.TERRAFORM.clear;
    const STAND = 0.4;
    u.task = {
      type: 'terraform', job, x: tx, y: ty, sx: best.x, sy: best.y,
      stx: best.x + 0.5 + (tx - best.x) * STAND, sty: best.y + 0.5 + (ty - best.y) * STAND,
      t: time, total: time,
    };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, best.x, best.y);
  },

  // WORK QUEUE — a sapper can be handed a whole line of tiles to dig/clear (from
  // a click-drag, like a wall line) and works them one after another. `u.jobs`
  // holds the pending {x,y,job}; `u.task` is the one it's on right now.
  queueTerraform(u, list) {
    if (u.kind !== 'sapper' || !list || !list.length) return 0;
    u.jobs = u.jobs || [];
    const active = u.task && u.task.type === 'terraform' ? u.task : null;
    let added = 0;
    for (const it of list) {
      if (u.jobs.some(j => j.x === it.x && j.y === it.y)) continue;      // already queued
      if (active && active.x === it.x && active.y === it.y) continue;     // already digging it
      u.jobs.push({ x: it.x, y: it.y, job: it.job });
      added++;
    }
    if (added && !active) this.startNextTerraform(u);   // idle sapper: begin at once
    return added;
  },
  // pull the next still-valid job off the queue and start it; clears the task
  // (idle) when nothing workable remains.
  startNextTerraform(u) {
    u.jobs = u.jobs || [];
    while (u.jobs.length) {
      const it = u.jobs.shift();
      if (this.canTerraform(u.owner, it.x, it.y, it.job) &&
          !(it.job === 'dig' && Terraform.digWouldSeal(it.x, it.y)) &&
          this.assignTerraform(u, it.x, it.y, it.job)) return true;
      // else the tile was already reshaped / sealed / unreachable — skip it
    }
    u.task = null;
    return false;
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
  // keep every land unit off the impassable map rim — after loading a save made
  // before the hard border existed, or one that ended a move on the very edge, a
  // unit could be sitting on the outermost ring. Nudge it to the nearest open tile.
  clampToBoard() {
    const W = CFG.W, H = CFG.H;
    for (const u of S.units) {
      if (this.isNaval(u)) continue;   // boats live on the water rim quite legally
      const x = u.x | 0, y = u.y | 0;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) continue;
      const sx = Math.max(1, Math.min(W - 2, x)), sy = Math.max(1, Math.min(H - 2, y));
      const spot = MapGen.findNear(sx, sy, 8, (px, py) => Path.passable(px, py, u.owner) && !Bld.at(px, py));
      if (spot) {
        u.x = spot.x + 0.5; u.y = spot.y + 0.5;
        u.path = null; u.pathI = 0;
        if (u.anchor) u.anchor = { x: u.x, y: u.y };
      }
    }
  },

  groupMove(ids, tx, ty) {
    // ships and land troops can't share a formation (different domains), so each
    // half forms up on its own — a fleet spreads over water, a war party over land
    const all = ids.map(id => this.get(id)).filter(Boolean);
    const navy = all.filter(o => this.isNaval(o));
    const land = all.filter(o => !this.isNaval(o));
    if (navy.length) this.formationMove(navy, tx, ty, 'water');
    if (land.length) this.formationMove(land, tx, ty);
  },

  // spread a same-domain group into a block of open tiles around the target, the
  // front ranks (melee) leading. domain 'water' routes ships over water tiles.
  formationMove(units, tx, ty, domain) {
    if (!units.length) return;
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
    const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
    let dx = tx + 0.5 - cx, dy = ty + 0.5 - cy;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const start = Path.passable(tx, ty, 'P', domain) ? { x: tx, y: ty }
      : MapGen.findNear(tx, ty, 6, (x, y) => Path.passable(x, y, 'P', domain));
    if (!start) { for (const u of units) this.moveTo(u, tx, ty); return; }
    const spots = [];
    const seen = new Set([start.x + ',' + start.y]);
    const q = [start];
    while (q.length && spots.length < units.length) {
      const c = q.shift();
      spots.push(c);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + ox, ny = c.y + oy, k = nx + ',' + ny;
        if (seen.has(k) || !Path.passable(nx, ny, 'P', domain)) continue;
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
    u.anchor = { x: b.x + 0.5, y: b.y + 0.5 };   // the siege line is home now
    this.setPath(u, b.x, b.y);
  },
  // send a unit to hack down a bridge (own or enemy — demolishing your own is a
  // valid defensive move); Combat's tBridge branch does the pathing + damage
  orderAttackBridge(u, br) {
    u.task = { type: 'attack' }; u.tBridge = { x: br.x, y: br.y }; u.tUnit = 0; u.tBld = 0;
    const s = Combat.tileAdjOpen(br.x, br.y, u.owner); if (s) this.setPath(u, s.x, s.y);
  },

  /* ---- troop transports: board, sail, land ---- */
  cargoCap(tr) { return CFG.UNITS[tr.kind].cap || 0; },
  // soldiers already aboard plus those marching to the pier
  cargoClaimed(tr) {
    let n = (tr.cargo || []).length;
    for (const o of S.units) if (o.task && o.task.type === 'board' && o.task.id === tr.id) n++;
    return n;
  },
  orderBoard(u, tr) {
    if (!this.isTransport(tr) || tr.owner !== u.owner) return false;
    if (this.cargoClaimed(tr) >= this.cargoCap(tr)) return false;
    const spot = MapGen.findNear(tr.x | 0, tr.y | 0, 2, (x, y) => Path.passable(x, y, u.owner));
    if (!spot) return false;   // the hull is out at sea — bring it to shore first
    u.task = { type: 'board', id: tr.id };
    u.tUnit = 0; u.tBld = 0;
    this.setPath(u, spot.x, spot.y);
    return true;
  },
  // sail to the water beside the marked shore tile, then put everyone ashore
  orderUnload(u, tx, ty) {
    u.task = { type: 'unload', x: tx, y: ty };
    u.tUnit = 0; u.tBld = 0;
    this.setPath(u, tx, ty);   // water-domain path ends at the closest water tile
  },
  // an open LAND tile orthogonally beside a water tile — i.e. the hull is beached
  // against the shore there. null if this water tile isn't touching walkable land.
  _shoreBeside(wx, wy, owner) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = wx + ox, ly = wy + oy;
      if (MapGen.inB(lx, ly) && Path.passable(lx, ly, owner) && !Bld.at(lx, ly)) return { x: lx, y: ly };
    }
    return null;
  },
  disembark(u) {
    const cargo = u.cargo || [];
    if (!cargo.length) { u.task = null; return; }
    const hx = u.x | 0, hy = u.y | 0;
    const tries = (u.task && u.task.unloadTries) || 0;
    // TROOPS ONLY LAND WHEN THE HULL TOUCHES SHORE. If we're still out in the
    // water, nose up to the nearest water tile that abuts open land and try again
    // — no more dropping soldiers several tiles out on the surf.
    if (!this._shoreBeside(hx, hy, u.owner)) {
      const dock = MapGen.findNear(hx, hy, 24, (x, y) =>
        S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y) && this._shoreBeside(x, y, u.owner));
      if (tries < 10 && dock && !(dock.x === hx && dock.y === hy) && this.setPath(u, dock.x, dock.y)) {
        u.task = { type: 'unload', x: dock.x, y: dock.y, unloadTries: tries + 1 };
        return;   // sail up against the coast, then land
      }
      u.task = null;
      if (u.owner === 'P') G.log('No shore to land on — sail the transport up against the coast', true);
      return;
    }
    // beached — put each soldier on its own open shore tile right beside the hull
    // (used-set = no stacking; radius 2 keeps them at the waterline, never far out)
    const used = new Set();
    let landed = 0;
    const place = () => {
      const spot = MapGen.findNear(hx, hy, 2,
        (x, y) => !used.has(x + ',' + y) && Path.passable(x, y, u.owner) && !Bld.at(x, y));
      if (!spot) return false;
      used.add(spot.x + ',' + spot.y);
      const c = cargo.pop();
      c.x = spot.x + 0.5; c.y = spot.y + 0.5;
      c.anchor = { x: c.x, y: c.y };
      c.path = null; c.pathI = 0; c.task = null; c.tUnit = 0; c.tBld = 0; c.cd = 0;
      S.units.push(c);
      landed++;
      return true;
    };
    while (cargo.length && place()) { /* land them at the waterline */ }
    // this stretch of beach filled up — coast along to the next landing for the rest
    if (cargo.length) {
      const next = MapGen.findNear(hx, hy, 14, (x, y) =>
        S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y) &&
        !(x === hx && y === hy) && this._shoreBeside(x, y, u.owner));
      if (tries < 10 && next && this.setPath(u, next.x, next.y)) {
        u.task = { type: 'unload', x: next.x, y: next.y, unloadTries: tries + 1 };
        if (u.owner === 'P' && landed) G.log(`${landed} ashore — coasting along to land the rest`);
        return;
      }
    }
    u.task = null;
    if (u.owner === 'P' && landed) G.log(`${landed} soldier${landed > 1 ? 's' : ''} ashore`);
    else if (u.owner === 'P' && cargo.length) G.log('No open shore beside the hull — sail closer to land', true);
    // an emptied raider / rival hull has done its job — beach and abandon it
    if ((u.owner === 'R' || u.owner === 'A') && !cargo.length && S.units.includes(u)) S.units.splice(S.units.indexOf(u), 1);
  },

  // advance along path; returns true when path finished
  followPath(u, dt) {
    if (!u.path || u.pathI >= u.path.length) return true;
    const wp = u.path[u.pathI];
    // the ground can change under a walking unit — a sapper digs a moat straight
    // across its route. A precomputed path isn't re-planned, so without this a
    // unit strides onto open water. If the next step is no longer passable (and
    // isn't a bridged crossing, which Path.passable allows), drop the stale path
    // so the unit re-plans from where it stands instead of walking on the water.
    // Pass the unit's DOMAIN so a boat's water waypoints aren't read as blocked.
    if (!Path.passable(wp.x, wp.y, u.owner, this.domain(u))) { u.path = null; u.pathI = 0; return true; }
    const tx = wp.x + 0.5, ty = wp.y + 0.5;
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    // a raised mound is passable but slow going — crossing one (or stepping onto
    // it) drags every land unit to a quarter speed, friend and foe alike
    let sp = u.speed;
    if (this.domain(u) !== 'water') {
      const here = S.map.terrain[MapGen.idx(u.x | 0, u.y | 0)];
      const next = S.map.terrain[MapGen.idx(wp.x, wp.y)];
      if (here === T.MOUND || next === T.MOUND) sp *= (CFG.TERRAFORM.moundCross || 0.25);
    }
    const step = sp * dt;
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
      if (u.burnT) u.burnT = Math.max(0, u.burnT - dt);   // dragonfire clings

      // a siege tower parked against an enemy wall ferries one nearby soldier
      // per second up, over, and down the far side
      if (u.kind === 'siegetower' && !this.moving(u)) {
        u.ladderT = (u.ladderT || 0) - dt;
        if (u.ladderT <= 0) {
          u.ladderT = 1;
          const ux = u.x | 0, uy = u.y | 0;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const wb = Bld.at(ux + ox, uy + oy);
            if (!wb || (wb.key !== 'wall' && wb.key !== 'gate') || wb.owner === u.owner) continue;
            const fx = ux + ox * 2, fy = uy + oy * 2;
            if (!Path.passable(fx, fy, u.owner) || Bld.at(fx, fy)) continue;
            const s = S.units.find(o => o.owner === u.owner && this.isMilitary(o) &&
              !this.isNaval(o) && !this.isSiege(o) && !o.tUnit &&
              Math.hypot(o.x - u.x, o.y - u.y) <= 1.7);
            if (!s) break;
            s.x = fx + 0.5; s.y = fy + 0.5;
            s.path = null; s.pathI = 0; s.task = null;
            s.anchor = { x: s.x, y: s.y };   // the far side is home now — no leash pullback
            R.float(u.x, u.y - 0.8, '⬆ over the top!', '#f0d27a');
            break;
          }
        }
      }

      // combat engagement (chasing/attacking) is driven by combat.js
      if (u.tUnit || u.tBld) continue;

      if (this.isWild(u)) { this.wildIdle(u, dt); continue; }

      // the rival's townsfolk drift between the huts when idle — a village
      // that looks lived-in, and something for raiders to menace
      if (u.owner === 'A' && this.isVillager(u) && !u.task) {
        if (this.moving(u)) { this.followPath(u, dt); continue; }
        const tc = Bld.tcOf('A');
        // THREAT REACTION: a soldier close by sends the villager scurrying home
        // instead of wandering into it — the town pulls back from a raided flank
        // and drifts out again once it's safe (throttled scan, cheap).
        u.fleeT = (u.fleeT || 0) - dt;
        if (u.fleeT <= 0) {
          u.fleeT = 0.4;
          const foe = Combat.nearestUnit(u.x, u.y, 5,
            o => (o.owner === 'P' && this.isMilitary(o)) || (o.owner === 'R' && !this.isTransport(o)));
          if (foe && tc && Math.hypot(u.x - Bld.cx(tc), u.y - Bld.cy(tc)) > 2.5) {
            const sx = tc.x + ((Math.random() * 5) | 0) - 2, sy = tc.y + Bld.size('tc') + ((Math.random() * 3) | 0) - 1;
            if (Path.passable(sx, sy, 'A')) this.setPath(u, sx, sy);
            u.wanderT = 2 + Math.random() * 2;
            continue;
          }
        }
        u.wanderT -= dt;
        if (u.wanderT <= 0) {
          u.wanderT = 3 + Math.random() * 5;
          if (tc) {
            const tx = tc.x + ((Math.random() * 9) | 0) - 4, ty = tc.y + ((Math.random() * 9) | 0) - 4;
            if (Path.passable(tx, ty, 'A')) this.setPath(u, tx, ty);
          }
        }
        continue;
      }

      // barbarian transports run their landing orders like any other unit;
      // every other barbarian is driven by raiderSeek. Any march it ordered
      // (closing on a target, or trudging off the map when the looting's
      // done) is advanced here — raiders skip normal task processing.
      if ((this.isRaider(u) && !this.isTransport(u) && !(u.task && u.task.type === 'flee')) ||
          (u.owner === 'A' && u.task && u.task.type === 'raid')) {
        Combat.raiderSeek(u);
        if (S.units[i] === u && !u.tUnit && !u.tBld && this.moving(u)) this.followPath(u, dt);
        continue;
      }

      const t = u.task;
      if (!t) continue;
      if (t.type === 'move') {
        if (this.followPath(u, dt)) { u.task = null; u.anchor = { x: u.x, y: u.y }; }
      } else if (t.type === 'flee') {
        if (this.followPath(u, dt)) u.task = null;
      } else if (t.type === 'gather') {
        // walk to the open tile beside the resource, then harvest it from there
        const sx = t.sx == null ? t.x : t.sx, sy = t.sy == null ? t.y : t.sy;
        if ((u.x | 0) !== sx || (u.y | 0) !== sy) {
          if (this.followPath(u, dt) && !((u.x | 0) === sx && (u.y | 0) === sy)) {
            // path ended but not beside the tile (blocked) — give up
            u.task = null;
          }
        } else {
          u.path = null;
          // ease right up to the resource edge so the villager touches what it
          // harvests, instead of resting at the middle of the adjacent tile
          if (t.stx != null) {
            const dx = t.stx - u.x, dy = t.sty - u.y, dd = Math.hypot(dx, dy), step = u.speed * dt;
            if (dd > step) { u.x += dx / dd * step; u.y += dy / dd * step; }
            else { u.x = t.stx; u.y = t.sty; }
          }
          const idx = MapGen.idx(t.x, t.y);
          const terr = S.map.terrain[idx];
          const g = CFG.GATHER[terr];
          if (!g) { u.task = null; continue; }   // already felled/cleared by someone
          const before = S.res[g.res];
          const take = Math.min(S.map.resAmount[idx], g.rate * dt * G.modeCfg().gather *
            (window.Cards ? Cards.gatherMult(u.owner, g.res) : 1));   // ORIGIN CARDS pace
          S.res[g.res] += take;
          if (S.stats) S.stats.gathered += take;
          S.map.resAmount[idx] -= take;
          if ((before | 0) !== (S.res[g.res] | 0) && Math.random() < 0.3)
            R.float(u.x, u.y - 0.5, '+' + g.res, '#d8e8b0');
          if (S.map.resAmount[idx] <= 0.001) {
            // tile exhausted — it turns to stumps/pebbles/spent soil, which is
            // now PASSABLE: felling the wood opens a new route through it
            S.map.resAmount[idx] = 0;
            S.map.terrain[idx] = CFG.DEPLETED[terr];
            G.scheduleRevert(idx);
            R.updateTile(t.x, t.y);
            const what = terr === T.FOREST ? 'The forest here is felled — a path opens'
              : terr === T.HILLS ? 'The stone here is quarried out — a path opens' : 'The soil here is spent';
            G.log(`${what} — villager idle`);
            u.task = null;
          }
        }
      } else if (t.type === 'terraform') {
        // walk to the open tile beside the target, then work it over a dig time.
        // The sapper is exposed here — it doesn't fight back; guard it.
        const sx = t.sx, sy = t.sy;
        if ((u.x | 0) !== sx || (u.y | 0) !== sy) {
          if (this.followPath(u, dt) && !((u.x | 0) === sx && (u.y | 0) === sy)) this.startNextTerraform(u);   // couldn't reach — on to the next queued tile
        } else {
          u.path = null;
          if (t.stx != null) {
            const dx = t.stx - u.x, dy = t.sty - u.y, dd = Math.hypot(dx, dy), step = u.speed * dt;
            if (dd > step) { u.x += dx / dd * step; u.y += dy / dd * step; } else { u.x = t.stx; u.y = t.sty; }
          }
          const stillValid = t.job === 'dig' ? Terraform.isDiggable(t.x, t.y)
            : t.job === 'clear' ? Terraform.isClearable(t.x, t.y)
            : t.job === 'mound' ? Terraform.isMoundable(t.x, t.y, u.owner) : Terraform.bridgeable(t.x, t.y);
          if (!stillValid) { this.startNextTerraform(u); continue; }
          t.t -= dt;
          if (Math.random() < 0.16) R.float(u.x + (Math.random() - 0.5), u.y - 0.4, '·', '#cdbb90');   // spadefuls of earth
          if (t.t <= 0) {
            let done = false, moat = false, berm = false, cost = false;
            if (t.job === 'dig') { done = Terraform.dig(t.x, t.y); moat = done && S.map.terrain[MapGen.idx(t.x, t.y)] === T.MOAT; }
            else if (t.job === 'clear') { done = Terraform.clear(t.x, t.y); }
            else if (t.job === 'mound') {
              // the one paid earthwork — quarry-heavy; skip (and warn) if broke
              const res = u.owner === 'P' ? S.res : S.ai.res, mc = CFG.TERRAFORM.moundCost;
              if (Bld.canAfford(mc, res)) { Bld.pay(mc, res); done = Terraform.mound(t.x, t.y); berm = done && S.map.terrain[MapGen.idx(t.x, t.y)] === T.MOUND; }
              else cost = true;
            }
            else if (t.job === 'bridge' && Bld.buildBridge) { done = Bld.buildBridge(u.owner, t.x, t.y); }
            if (u.owner === 'P') {
              if (done) G.log(t.job === 'dig' ? (moat ? 'Your sappers open a moat — the channel floods!' : 'Your sappers dig a trench')
                : t.job === 'clear' ? 'Your sappers breach the ground — a path opens'
                : t.job === 'mound' ? (berm ? 'Your sappers raise an earth mound — slow to cross' : 'Your sappers reclaim solid ground from the water')
                : 'Your sappers raise a bridge');
              else if (t.job === 'dig') UI.toast('Can’t dig there — it would seal the town in', true);
              else if (cost) UI.toast('Not enough stone & wood to raise a mound', true);
            }
            this.startNextTerraform(u);   // tile done — walk the line to the next queued job
          }
        }
      } else if (t.type === 'fish') {
        const onTile = (u.x | 0) === t.x && (u.y | 0) === t.y;
        if (!onTile) {
          if (this.followPath(u, dt) && !((u.x | 0) === t.x && (u.y | 0) === t.y)) u.task = null;
        } else {
          const idx = MapGen.idx(t.x, t.y);
          if (S.map.terrain[idx] !== T.WATER) { u.task = null; continue; }
          // fish feed whichever tribe cast the nets — the rival runs boats too
          const bag = u.owner === 'P' ? S.res : S.ai.res;
          const before = bag.food;
          const take = Math.min(S.map.resAmount[idx], CFG.FISH.rate * dt * G.modeCfg().gather *
            (window.Cards ? Cards.fishMult(u.owner) : 1));   // ORIGIN CARDS: Riverborn nets
          bag.food += take;
          if (u.owner === 'P' && S.stats) S.stats.gathered += take;
          S.map.resAmount[idx] -= take;
          if (u.owner === 'P' && (before | 0) !== (bag.food | 0) && Math.random() < 0.3)
            R.float(u.x, u.y - 0.5, '+food', '#d8e8b0');
          if (S.map.resAmount[idx] <= 0.001) {
            S.map.resAmount[idx] = 0;
            // drift to the next stocked water tile nearby, or go idle
            const next = MapGen.findNear(t.x, t.y, 4, (x, y) => this.canFish(x, y));
            if (next && this.assignFish(u, next.x, next.y)) continue;
            if (u.owner === 'P') G.log('These waters are fished out — boat idle');
            u.task = null;
          }
        }
      } else if (t.type === 'shorefish') {
        // stand on the beach and work the shoal beside it
        if ((u.x | 0) !== t.sx || (u.y | 0) !== t.sy) {
          if (this.followPath(u, dt) && !((u.x | 0) === t.sx && (u.y | 0) === t.sy)) u.task = null;
        } else {
          u.path = null;
          // ease right up to the water line — toes at the shoal's edge, so the
          // fisher visibly stands ON the shore instead of a half-tile inland
          const ex = t.sx + 0.5 + (t.x - t.sx) * 0.42;
          const ey = t.sy + 0.5 + (t.y - t.sy) * 0.42;
          u.x += (ex - u.x) * Math.min(1, dt * 4);
          u.y += (ey - u.y) * Math.min(1, dt * 4);
          const idx = MapGen.idx(t.x, t.y);
          if (S.map.terrain[idx] !== T.WATER) { u.task = null; continue; }
          const bag = u.owner === 'P' ? S.res : S.ai.res;
          const before = bag.food;
          const take = Math.min(S.map.resAmount[idx], CFG.SHORE_FISH.rate * dt * G.modeCfg().gather *
            (window.Cards ? Cards.fishMult(u.owner) : 1));   // ORIGIN CARDS: Riverborn lines
          bag.food += take;
          if (u.owner === 'P' && S.stats) S.stats.gathered += take;
          S.map.resAmount[idx] -= take;
          if (u.owner === 'P' && (before | 0) !== (bag.food | 0) && Math.random() < 0.3)
            R.float(u.x, u.y - 0.5, '+food', '#d8e8b0');
          if (S.map.resAmount[idx] <= 0.001) {
            S.map.resAmount[idx] = 0;
            if (u.owner === 'P') G.log('This shoal is fished out — villager idle');
            u.task = null;
          }
        }
      } else if (t.type === 'build') {
        const b = Bld.get(t.id);
        if (!b || b.owner !== 'P' || (b.construction <= 0 && b.upgrading <= 0 && b.hp >= b.maxhp)) {
          u.task = null;   // done (or site gone) — villager is free again
          continue;
        }
        const d = Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y);
        if (d > 1.25 + Bld.reach(b)) {
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
                  const dd = Math.hypot(Bld.cx(nb) - u.x, Bld.cy(nb) - u.y);
                  if (dd < bd) { bd = dd; best = nb; }
                }
                if (best) this.assignBuild(u, best);
              }
            }
          } else if (b.upgrading > 0) {
            b.upgrading -= dtDays;
            if (b.upgrading <= 0) {
              const resume = u.task && u.task.resumeWork;
              Bld.finishUpgrade(b);
              // a stationed hand goes straight back to their post
              if (resume && Bld.def(b.key).needsWorker &&
                  Bld.workersAssigned(b) < Bld.maxWorkers(b))
                u.task = { type: 'work', id: b.id };
              else u.task = null;
            }
          } else {
            b.hp = Math.min(b.maxhp, b.hp + b.maxhp * CFG.REPAIR_RATE * dtDays);
            if (b.hp >= b.maxhp) { u.task = null; G.log(`${Bld.def(b.key).name} repaired`); }
          }
        }
      } else if (t.type === 'garrison') {
        // heading into the Town Center for shelter
        const tc = Bld.tcOf('P');
        if (!tc) { u.task = null; continue; }
        const d = Math.hypot(Bld.cx(tc) - u.x, Bld.cy(tc) - u.y);
        if (d > 1.4 + Bld.reach(tc)) {
          if (this.moving(u)) this.followPath(u, dt);
          else if (!this.setPath(u, tc.x, tc.y)) u.task = null;
        } else {
          S.garrison.push({ hp: u.hp, maxhp: u.maxhp });
          if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
          S.units.splice(i, 1);
        }
      } else if (t.type === 'work') {
        // stationed at a production building — stand ON the plot itself and
        // keep it running (workers idling beside the field just cluttered the ground)
        const b = Bld.get(t.id);
        if (!b || b.owner !== 'P' || !Bld.def(b.key).needsWorker) { u.task = null; continue; }
        if ((u.x | 0) !== b.x || (u.y | 0) !== b.y) {
          if (this.moving(u)) this.followPath(u, dt);
          else if (!this.setPath(u, b.x, b.y)) u.task = null;
        } else {
          u.path = null;
          // a two-hand crew shares the plot side by side
          const twin = S.units.find(o => o !== u && o.task && o.task.type === 'work' &&
            o.task.id === b.id && (o.x | 0) === b.x && (o.y | 0) === b.y);
          const tx2 = b.x + (twin ? (twin.x <= b.x + 0.5 ? 0.75 : 0.25) : 0.5);
          u.x += (tx2 - u.x) * Math.min(1, dt * 4);
          u.y += (b.y + 0.62 - u.y) * Math.min(1, dt * 4);
        }
      } else if (t.type === 'board') {
        // march to the pier and step aboard the transport
        const tr = this.get(t.id);
        if (!tr || !this.isTransport(tr) || tr.owner !== u.owner) { u.task = null; continue; }
        if (Math.hypot(tr.x - u.x, tr.y - u.y) <= 1.6) {
          if (!tr.cargo) tr.cargo = [];
          if (tr.cargo.length >= this.cargoCap(tr)) { u.task = null; continue; }
          u.task = null; u.path = null; u.pathI = 0; u.tUnit = 0; u.tBld = 0;
          for (const o of S.units) if (o.tUnit === u.id) o.tUnit = 0;
          if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
          tr.cargo.push(u);
          S.units.splice(i, 1);
        } else if (this.moving(u)) {
          this.followPath(u, dt);
        } else if (u.repathT <= 0) {
          // the hull may have drifted — walk to the shore beside where it is now
          u.repathT = 0.8;
          const spot = MapGen.findNear(tr.x | 0, tr.y | 0, 2, (x, y) => Path.passable(x, y, u.owner));
          if (!spot || !this.setPath(u, spot.x, spot.y)) u.task = null;
        }
      } else if (t.type === 'unload') {
        if (this.moving(u)) { if (this.followPath(u, dt)) this.disembark(u); }
        else this.disembark(u);
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
      {   // arcade tally: rival and barbarian kills score
        const ko = (attackerId && this.get(attackerId) && this.get(attackerId).owner) || attackerOwner;
        if (ko === 'P' && (u.owner === 'A' || u.owner === 'R') && S.stats)
          S.stats.kills = (S.stats.kills || 0) + 1;
      }
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
      if (u.owner === 'P') G.log(`${CFG.UNITS[u.kind].name} was killed`, true);
      if (u.owner === 'P' && this.isTransport(u) && u.cargo && u.cargo.length)
        G.log(`💀 ${u.cargo.length} soldier${u.cargo.length > 1 ? 's' : ''} lost with the hull`, true);
      // any wild animal killed by a tribe yields meat
      if (this.isWild(u)) {
        const owner = (attacker && attacker.owner) || attackerOwner;
        const meat = Math.round((u.kind === 'bear' ? CFG.MEAT_DROP * 3 : CFG.MEAT_DROP) *   // a bear feeds the village
          (window.Cards ? Cards.huntMult(owner) : 1));   // ORIGIN CARDS: Beastward hunts
        if (owner === 'P') {
          S.res.food += meat;
          R.float(u.x, u.y - 0.5, '+' + meat + ' food', '#d8e8b0');
        } else if (owner === 'A') S.ai.res.food += meat;
      }
      return;
    }
    // shot by a ship it has no way to answer — break off and retreat inland,
    // out of the warship's reach, instead of standing on the shore taking fire
    if (attacker && this.isNaval(attacker) && !this.isNaval(u) && !CFG.UNITS[u.kind].rng) {
      const d = Math.hypot(u.x - attacker.x, u.y - attacker.y) || 1;
      const reach = (CFG.UNITS[attacker.kind].rng || 4) + 2.5;
      const tx = Math.round(attacker.x + (u.x - attacker.x) / d * reach);
      const ty = Math.round(attacker.y + (u.y - attacker.y) / d * reach);
      const spot = MapGen.findNear(tx, ty, 5, (x, y) => Path.passable(x, y, u.owner));
      if (spot) {
        u.tUnit = 0; u.tBld = 0;
        u.task = { type: 'flee' };
        this.setPath(u, spot.x, spot.y);
        return;
      }
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
      if (tc) { u.task = { type: 'flee' }; this.setPath(u, tc.x, tc.y + Bld.size(tc.key)); }
    } else if (this.isVillager(u) && u.owner === 'A') {
      // a townsfolk militiaman stands and fights (see Combat.acquire);
      // otherwise the rival's people run for their hall when struck
      if (u.militia) { u.tUnit = attacker.id; }
      else {
        const tc = Bld.tcOf('A');
        if (tc) { u.task = { type: 'flee' }; this.setPath(u, tc.x, tc.y + Bld.size(tc.key)); }
      }
    } else if (this.isMilitary(u) || this.isWild(u) || this.isVillager(u) || this.isRaider(u)) {
      u.tUnit = attacker.id;   // barbarians hit back no matter whom they came for
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
    // a lone bear pads out of the deep woods on rare occasion — one at a time,
    // and far more dangerous than any wolf pack
    if (this.count('W', u => u.kind === 'bear') === 0 && G.rand() < m.animalChance * 0.2)
      this.spawnWild('bear', CFG.ANIMALS.minDistTC);
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
