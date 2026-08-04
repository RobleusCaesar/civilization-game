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
    if (kind === 'villager') u.female = Math.random() < 0.5;   // ~50/50 men & women (stays with the unit through saves)
    /* THE FIVE PEOPLES OF THE WILD COUNTRY (tests/raider-camps.mjs). A war
       band belongs to a PEOPLE — wolfskins, flintfolk, the broken, woadkin,
       sea peoples — and wears its look. The tribe is passed in by whoever
       raises the band (a camp hands out its own, kept for the camp's whole
       life); anything spawned without one takes a roll, so no barbarian is
       ever tribeless. Men and women both, like the villages. */
    if (kind === 'raider' || kind === 'brute') {
      u.tribe = opts.tribe || G.rollTribe();
      u.female = Math.random() < 0.5;
    }
    if (window.Cards) Cards.onSpawn(u);   // ORIGIN CARDS: Ironhand toughness
    S.units.push(u);
    return u;
  },

  isMilitary(u) {
    return u.kind === 'defender' || u.kind === 'axeman' || u.kind === 'elite' ||
           u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer' ||
           u.kind === 'archer' || u.kind === 'longbow' || u.kind === 'marksman' ||
           u.kind === 'warship' || u.kind === 'fireship' ||
           u.kind === 'catapult' || u.kind === 'ballista' || u.kind === 'siegetower' ||
           u.kind === 'trebuchet';
  },
  isSiege(u) { return u.kind === 'catapult' || u.kind === 'siegetower' || u.kind === 'trebuchet'; },
  isVillager(u) { return u.kind === 'villager'; },
  isSapper(u) { return u.kind === 'sapper'; },
  isNaval(u) { return !!CFG.UNITS[u.kind].naval; },
  isTransport(u) { return u.kind === 'transport' || u.kind === 'bigtransport'; },
  // a land unit that can ride a transport hull: soldiers and siege, AND villagers
  // (settlers ferried across to a new shore). A boat can't board a boat.
  isBoardable(u) { return !this.isNaval(u) && (this.isMilitary(u) || this.isVillager(u)); },
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
    for (const o of S.units) if (o.tUnit === u.id) { o.tUnit = 0; this.resolveAfterFight(o); }
    if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
  },

  /* ================= BANISHMENT (tests/banish.mjs) =================
     The villager's answer to Scuttle. Late on, a town that has finished
     building has hands it would rather have as spears, and the population cap
     is the only thing standing in the way — so a villager can be sent away for
     good. NOTHING comes back: no food, no wood, not even the training cost.
     The one thing it buys is the place in the population, and that is the
     whole point of the button.

     They LEAVE UNDER THEIR OWN FEET rather than vanishing on the tap, so the
     road is real: a barbarian can cut them down on the way, and the order can
     be called off by giving them any other order before they reach the rim.
     Deliberately villagers only for now — soldiers keep their posts. */
  canBanish(u) { return !!u && u.owner === 'P' && this.isVillager(u); },
  atMapEdge(u) {
    const x = u.x | 0, y = u.y | 0;
    return x <= 1 || y <= 1 || x >= CFG.W - 2 || y >= CFG.H - 2;
  },
  // the nearest walkable tile on the board's outermost usable ring — the black
  // rim itself is off-map void, so "off the map" means row/column 1 or W-2/H-2
  edgeTarget(u) {
    const cand = [];
    const push = (x, y) => { if (MapGen.onBoard(x, y) && Path.passable(x, y, u.owner)) cand.push({ x, y }); };
    for (let x = 1; x < CFG.W - 1; x++) { push(x, 1); push(x, CFG.H - 2); }
    for (let y = 1; y < CFG.H - 1; y++) { push(1, y); push(CFG.W - 2, y); }
    let best = null, bd = 1e9;
    for (const c of cand) {
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  },
  sendToEdge(u) {
    const e = this.edgeTarget(u);
    if (!e) return false;
    if ((u.x | 0) === e.x && (u.y | 0) === e.y) return false;   // already there — leave now
    this.setPath(u, e.x, e.y);
    return this.moving(u);
  },
  banish(u) {
    if (!this.canBanish(u)) return false;
    u.tUnit = 0; u.tBld = 0; u.jobs = null; u.defend = false;
    u.task = { type: 'banish' };
    if (!this.sendToEdge(u) && !this.atMapEdge(u)) {
      // nowhere to walk to (sealed in) — they slip away all the same
      this.leaveTheMap(u);
      return true;
    }
    return true;
  },
  // gone for good: no rubble, no refund, just a place freed in the population
  leaveTheMap(u) {
    R.float(u.x, u.y - 0.6, '👋', '#d8cfae');
    G.log('A villager is banished — they walk out of the valley for good');
    this.despawn(u);
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

  /* ---- WHAT AM I DOING, AND WHAT AM I NETTING? (tests/work-report.mjs) ----
     The panel's live line. Everything static about a unit (HP, ATK, DEF) you
     learn once; what it is DOING and what that is worth per day changes all
     the time, and is the thing worth watching. The rates here are computed
     from the SAME constants the gather/production code actually applies —
     mode multiplier, origin-card multipliers, the station's terrain bonus and
     the level-3 hall boost — so the number on the panel is the number going
     into the granary, not a nominal figure from the config table.
     Returns { icon, what, rate, working } — `rate` is null when the job pays
     no resource (building, marching), `working` is false while still walking
     to the job, so "on the way" never claims income it isn't earning yet. */
  dayLen() { return CFG.DAY_MS / 1000; },     // seconds of real time in one in-game day
  workReport(u) {
    if (!u) return null;
    const t = u.task, at = (x, y) => (u.x | 0) === x && (u.y | 0) === y;
    const mode = G.modeCfg();
    const per = (rate, res) => ({ res, n: rate * this.dayLen() });
    if (u.tUnit) return { icon: '⚔️', what: 'In combat', rate: null, working: true };
    if (u.tBld) return { icon: '⚔️', what: 'Attacking a building', rate: null, working: true };
    if (!t) {
      if (u.stance === 'guard') return { icon: '🛡️', what: 'Defending', rate: null, working: true };
      return { icon: '💤', what: 'Idle', rate: null, working: false };
    }
    if (t.type === 'banish') return { icon: '👋', what: 'Leaving the valley', rate: null, working: false };
    if (t.type === 'gather') {
      const g = CFG.GATHER[S.map.terrain[MapGen.idx(t.x, t.y)]];
      const sx = t.sx == null ? t.x : t.sx, sy = t.sy == null ? t.y : t.sy;
      const on = at(sx, sy);
      const name = { wood: 'Felling timber', stone: 'Quarrying stone', food: 'Harvesting food' };
      const ico = { wood: '🪓', stone: '⛏️', food: '🧺' };
      if (!g) return { icon: '🚶', what: 'Heading out', rate: null, working: false };
      const n = g.rate * this.dayLen() * mode.gather * (window.Cards ? Cards.gatherMult(u.owner, g.res) : 1);
      return { icon: ico[g.res] || '🧺', what: on ? name[g.res] : 'Walking to the ' + g.res,
        rate: on ? { res: g.res, n } : null, working: on };
    }
    if (t.type === 'fish' || t.type === 'shorefish') {
      const shore = t.type === 'shorefish';
      const on = shore ? at(t.sx, t.sy) : at(t.x, t.y);
      const n = (shore ? CFG.SHORE_FISH.rate : CFG.FISH.rate) * this.dayLen() * mode.gather *
        (window.Cards ? Cards.fishMult(u.owner) : 1);
      return { icon: '🎣', what: on ? (shore ? 'Line-fishing the shoal' : 'Nets out') : 'Rowing to the shoal',
        rate: on ? { res: 'food', n } : null, working: on };
    }
    if (t.type === 'work') {                       // stationed on a plot
      const b = Bld.get(t.id);
      if (!b) return { icon: '💤', what: 'Idle', rate: null, working: false };
      const nm = Bld.def(b.key).name;
      const on = at(b.x, b.y);
      const out = (Bld.lv(b).out) || {};
      const key = Object.keys(out)[0];
      if (!on) return { icon: '🚶', what: 'Walking to the ' + nm, rate: null, working: false };
      if (b.upgrading > 0) return { icon: '🔨', what: nm + ' — upgrading', rate: null, working: true };
      if (!key) return { icon: '🛠️', what: 'Working the ' + nm, rate: null, working: true };
      const tc = Bld.tcOf(u.owner);
      const tcBoost = tc && tc.level >= 3 && Bld.done(tc) ? 1.1 : 1;
      const modeMult = u.owner === 'P' ? mode.output : (mode.aiOutput || 1);
      const n = out[key] * Bld.nearBonus(b) * tcBoost * modeMult *
        (window.Cards ? Cards.prodMult(u.owner, b) : 1);
      return { icon: '🛠️', what: 'Working the ' + nm, rate: { res: key, n }, working: true };
    }
    if (t.type === 'build') {
      const b = Bld.get(t.id);
      if (!b) return { icon: '💤', what: 'Idle', rate: null, working: false };
      const nm = Bld.def(b.key).name;
      const near = Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y) <= 1.55 + Bld.reach(b);
      if (!near) return { icon: '🚶', what: 'Walking to the ' + nm, rate: null, working: false };
      if (b.construction > 0) return { icon: '🔨', what: 'Raising the ' + nm, rate: null, working: true, left: b.construction };
      if (b.upgrading > 0) return { icon: '🔨', what: 'Upgrading the ' + nm, rate: null, working: true, left: b.upgrading };
      return { icon: '🔧', what: 'Mending the ' + nm, rate: null, working: true,
        pct: Math.round(b.hp / b.maxhp * 100) };
    }
    if (t.type === 'terraform') {
      const nm = { dig: 'Digging a trench', bridge: 'Raising a bridge', clear: 'Clearing the ground',
        mound: 'Raising a mound', bridgeup: 'Reinforcing the bridge' };
      return { icon: '⛏️', what: nm[t.job] || 'Working the ground', rate: null, working: true };
    }
    if (t.type === 'garrison') return { icon: '🛖', what: 'Taking shelter', rate: null, working: false };
    if (t.type === 'board') return { icon: '⚓', what: 'Boarding', rate: null, working: false };
    if (t.type === 'move') return { icon: '🚶', what: 'Marching', rate: null, working: false };
    if (t.type === 'flee') return { icon: '💨', what: 'Fleeing', rate: null, working: false };
    return { icon: '💤', what: 'Idle', rate: null, working: false };
  },

  setPath(u, tx, ty) {
    const p = Path.find(u.x | 0, u.y | 0, tx, ty, u.owner, this.domain(u));
    if (p) { u.path = p; u.pathI = 0; }
    return !!p;
  },

  moveTo(u, tx, ty) {
    u.task = { type: 'move', x: tx, y: ty };
    u.tUnit = 0; u.tBld = 0; u.assault = false;   // a plain walk order stands the assault down
    if (u.jobs) u.jobs = null;   // an explicit walk order cancels any queued sapper work
    return this.setPath(u, tx, ty);
  },

  /* ---- DEFEND stance: hold a perimeter around the Town Center / Dock ---- */
  // which units can be told to Defend — every land soldier and every warship
  canDefend(u) { return this.isMilitary(u); },
  // which guard doctrine a defender fights under (CFG.GUARD.holdByClass /
  // chaseByClass): the workshop's engines hold closest and never chase, the
  // ranges' bows a ring further with one step of trail, the barracks' blades
  // the outer watch with two. Warships keep their own dock rules.
  guardClass(u) {
    if (this.isNaval(u)) return 'naval';
    if (this.isSiege(u) || u.kind === 'ballista') return 'siege';
    return CFG.UNITS[u.kind].rng ? 'ranged' : 'melee';
  },
  // the guard post for a defending unit: {x,y, r1 (hold radius), chase (trail
  // allowance while engaged), r2 (sortie/leash)} centred on its own Town
  // Center (land) or nearest Dock (warships). null = no home.
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
    const G2 = CFG.GUARD, cx = Bld.cx(b), cy = Bld.cy(b);
    let r1, chase;
    if (naval) {
      r1 = G2.navalRadius * (1 + G2.levelStep * ((b.level || 1) - 1));
      chase = 1.8;
    } else {
      // land holds are FIXED per doctrine — no level scaling: a bigger hall
      // doesn't mean the watch stands further from it
      const cls = this.guardClass(u);
      r1 = Math.min((G2.holdByClass && G2.holdByClass[cls]) || G2.radius, G2.maxRadius || 8);
      chase = (G2.chaseByClass && G2.chaseByClass[cls] != null) ? G2.chaseByClass[cls] : 1.8;
    }
    return { x: cx, y: cy, r1, chase, r2: r1 + Math.max(1.2, r1 * G2.sortie), naval: !!naval, owner: u.owner };
  },
  /* the max distance a defender may hold from its hall TOWARD a given point.
     REDESIGNED after a real day-148 game ("my soldiers keep ranging out too
     far… out of the range of my towers for support, and getting killed"):
     natural barriers used to stretch the watch — a treeline thirteen tiles
     out counted as "the walls of home", so guards held at it, far past every
     tower, and died piecemeal. A treeline is not a wall. The defended ground
     is now built from the DEFENSES the player actually raised:
       · base — the tight Town Center ring (r1, ~6-8 tiles);
       · a finished own tower / war camp TOWARD the threat extends the watch
         to stand under its arrows (its distance + ~70% of its range), so
         soldiers balance the hall and the batteries that cover them;
       · the own wall line along the ray is a hard CEILING — guards hold
         INSIDE their wall and wait for the breach, never volunteering past
         it. When a section falls the ray stops hitting it, the ceiling
         lifts, and the garrison meets whatever comes through.
     Want soldiers further out than the defenses reach? Turn Defend off —
     that is exactly what the stance toggle means. */
  holdRadius(g, fx, fy) {
    if (g.naval) return g.r1;                       // ships keep their fixed dock radius
    const MAXR = CFG.GUARD.maxNatural || 14;
    const dx = fx - g.x, dy = fy - g.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    let hold = g.r1;
    for (const b of S.buildings) {
      if (b.owner !== g.owner || (b.key !== 'tower' && b.key !== 'warcamp') || !Bld.done(b)) continue;
      const tx = Bld.cx(b) - g.x, ty = Bld.cy(b) - g.y;
      const along = tx * ux + ty * uy;                        // how far out along this ray the battery sits
      if (along < 0.5 || along > MAXR) continue;
      const lv = CFG.BUILDINGS[b.key].levels[(b.level || 1) - 1] || {};
      const rng = lv.range || 4.5;
      // the extension is only real where the lane actually passes UNDER the
      // battery's arrows — a tower far off the ray covers nothing here
      if (Math.abs(tx * uy - ty * ux) > rng + 1) continue;
      hold = Math.max(hold, Math.min(MAXR, along + rng * 0.7));
    }
    // the own wall line caps the hold INSIDE it — walk the ray at half-tiles
    // so a diagonal line can't be stepped over
    for (let s = 1; s <= Math.min(MAXR, hold + 1.5); s += 0.5) {
      const b = Bld.at(Math.round(g.x + ux * s), Math.round(g.y + uy * s));
      if (b && b.owner === g.owner && (b.key === 'wall' || b.key === 'gate') && Bld.done(b))
        return Math.max(1.5, Math.min(hold, s - 0.6));
    }
    return hold;
  },
  // walk back to just inside the perimeter (a 'guard' move task, which acquire()
  // leaves alone until it lands — that's the hysteresis that stops jittering).
  // BACK TO YOUR POST (tests/defend-hold.mjs): a guard remembers where it stood
  // when the fight began (u.guardPost, stamped in Combat.acquire) and returns to
  // THAT spot after the kill or an abandoned chase — not to a generic point on
  // the ring. The post is forgotten on arrival; the next fight stamps a fresh one.
  returnToGuard(u, g) {
    g = g || this.guardCenter(u);
    if (!g) return;
    const p = u.guardPost;
    let tx, ty;
    if (p && Math.hypot(p.x - g.x, p.y - g.y) <= this.holdRadius(g, p.x, p.y) + 0.5) {
      tx = p.x | 0; ty = p.y | 0;
    } else {
      const d = Math.hypot(u.x - g.x, u.y - g.y) || 1, rr = g.r1 * 0.82;
      tx = (g.x + (u.x - g.x) / d * rr) | 0; ty = (g.y + (u.y - g.y) / d * rr) | 0;
    }
    u.tUnit = 0; u.tBld = 0; u.tBridge = null;
    u.task = { type: 'move', x: tx, y: ty, guard: true };
    if (!this.setPath(u, tx, ty)) { u.task = null; u.guardPost = null; }
  },
  // is this soldier standing on ground its Defend stance would actually hold?
  // Past the bound (+ its chase allowance) the stance is meaningless — you
  // don't Defend while attacking the enemy — so the UI hides the button out
  // there (tests/defend-hold.mjs). A unit already IN the stance always keeps
  // its Stand Down button wherever it is.
  inDefendBounds(u) {
    const g = this.guardCenter(u);
    if (!g) return false;
    const d = Math.hypot(u.x - g.x, u.y - g.y);
    return d <= this.holdRadius(g, u.x, u.y) + (g.chase != null ? g.chase : 1.8) + 0.8;
  },
  // a fighter whose lock just cleared resolves to wherever its doctrine says
  // home is: defenders to their guard post, siege-line soldiers to their line
  // post. Used by the death-cleanup sites, which clear attacker locks directly.
  resolveAfterFight(o) {
    if (o.defend) this.returnToGuard(o);
    else if (o.strat === 'siege' && o.siegePost) {
      o.task = { type: 'move', x: o.siegePost.x, y: o.siegePost.y, guard: true };
      this.setPath(o, o.siegePost.x, o.siegePost.y);
    }
  },
  // toggle the stance; turning it on pulls a strayed unit back to its perimeter
  setDefend(u, on) {
    if (!this.canDefend(u)) return;
    u.defend = !!on;
    u.strat = null; u.siegePost = null;   // Defend and the assault doctrines are exclusive
    if (on) u.assault = false;   // holding a perimeter ends any standing assault
    if (!on) return;
    const g = this.guardCenter(u);
    if (g && Math.hypot(u.x - g.x, u.y - g.y) > g.r1) this.returnToGuard(u, g);
    else { u.task = null; u.tUnit = 0; u.tBld = 0; u.tBridge = null; u.path = null; }
  },

  // stand on an OPEN tile beside the resource and work it — the wood/rock/
  // orchard tile itself is impassable now, so the villager harvests from the
  // edge (and felling it opens the ground). Returns false if it's fully walled.
  /* WHERE A GATHERER WOULD STAND to work this tile, or null if there is
     nowhere. Split out of assignGather so the UI can ASK the question before
     issuing an order that would only be refused (UI.gatherable) — the two must
     never drift, or the tap layer starts promising work the task layer won't
     take. */
  gatherEdge(u, tx, ty) {
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
    return best;
  },

  assignGather(u, tx, ty) {
    const g = CFG.GATHER[S.map.terrain[MapGen.idx(tx, ty)]];
    if (!g) return false;
    const best = this.gatherEdge(u, tx, ty);
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

  /* Send a villager out to claim (or take over) the gold seam at tx,ty. The
     works are only raised when they get there — see the 'claim' task. The
     miner stands ON the seam, like every other worker plot's crew, so the
     tile itself has to be walkable, which it is by construction (T.GOLDORE is
     in no BLOCK_TERR set, and Bld.solid leaves worker plots open). */
  assignMine(u, tx, ty) {
    if (!this.isVillager(u) || !Bld.seamAt(tx, ty)) return false;
    const b = Bld.at(tx, ty);
    if (b && b.key === 'mine' && b.owner === u.owner) {
      // already ours — this is just a normal stationing order
      if (Bld.workersAssigned(b) >= Bld.maxWorkers(b)) return false;
      u.task = { type: 'work', id: b.id }; u.tUnit = 0; u.tBld = 0;
      return this.setPath(u, tx, ty);
    }
    if (!Bld.canClaimSeam(u.owner, tx, ty).ok) return false;
    u.task = { type: 'claim', x: tx, y: ty }; u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, tx, ty);
  },

  // fishing boats harvest fish from stocked water tiles
  // water worth casting in at all: stocked, unbuilt, off the black rim
  fishableTile(tx, ty) {
    if (!MapGen.onBoard(tx, ty)) return false;   // off-map black rim — no fishing there
    const i = MapGen.idx(tx, ty);
    return S.map.terrain[i] === T.WATER && S.map.resAmount[i] > 0 && !Bld.at(tx, ty);
  },
  /* ONE BOAT PER TILE (tests/fishery.mjs). The fish task pins a boat ON its
     tile for as long as it works there, so two boats sent to the same water
     sit hull-in-hull: you cannot see how many you have, and you cannot pick
     one out to give it an order. A tile is CLAIMED by the boat working it,
     by one on its way to it, and by any idle hull parked on it. */
  fisherAt(tx, ty, except) {
    for (const u of S.units) {
      if (u.kind !== 'fishboat' || u === except) continue;
      if (u.task && u.task.type === 'fish') { if (u.task.x === tx && u.task.y === ty) return u; continue; }
      if ((u.x | 0) === tx && (u.y | 0) === ty) return u;      // idling right there
    }
    return null;
  },
  canFish(tx, ty, except) { return this.fishableTile(tx, ty) && !this.fisherAt(tx, ty, except); },
  assignFish(u, tx, ty) {
    if (u.kind !== 'fishboat' || !this.fishableTile(tx, ty)) return false;
    // the water is good but another hull already has it — take the nearest
    // free shoal instead of stacking on top of it (or refusing the order)
    if (this.fisherAt(tx, ty, u)) {
      const alt = MapGen.findNear(tx, ty, 4, (x, y) => this.canFish(x, y, u));
      if (!alt) return false;
      tx = alt.x; ty = alt.y;
    }
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
    // an own bridge with WORKS STANDING ON IT wants the same hands that raised
    // it — and it comes first, since the tile is no longer bridgeable anyway
    if (tier >= 2 && this._bridgeWorks(owner, tx, ty)) return 'bridgeup';
    if (Terraform.isDiggable(tx, ty)) return 'dig';
    if (tier >= 2 && Terraform.bridgeCrossing(tx, ty, owner) && !(Bld.bridgeAt && Bld.bridgeAt(tx, ty))) return 'bridge';
    if (tier >= 3 && Terraform.isClearable(tx, ty)) return 'clear';
    return null;
  },
  // an own bridge here that has been ordered reinforced and is still building?
  _bridgeWorks(owner, tx, ty) {
    const br = Bld.bridgeAt && Bld.bridgeAt(tx, ty);
    return br && br.owner === owner && br.upgrading > 0 ? br : null;
  },
  // can a sapper of this tribe do a SPECIFIC job on this tile? (tier + tile type)
  canTerraform(owner, tx, ty, job) {
    const tier = this.sapperTier(owner); if (tier < 1) return false;
    if (job === 'dig') return Terraform.isDiggable(tx, ty);
    if (job === 'bridge') return tier >= 2 && !!Terraform.bridgeCrossing(tx, ty, owner) && !(Bld.bridgeAt && Bld.bridgeAt(tx, ty));
    if (job === 'bridgeup') return tier >= 2 && !!this._bridgeWorks(owner, tx, ty);
    if (job === 'clear') return tier >= 3 && Terraform.isClearable(tx, ty);
    if (job === 'mound') return tier >= 3 && Terraform.isMoundable(tx, ty, owner);
    return false;
  },
  // the nearest sapper with nothing on: who a fresh set of bridge works calls out
  nearestIdleSapper(x, y, owner) {
    let best = null, bd = 1e9;
    for (const u of S.units) {
      if (u.owner !== (owner || 'P') || u.kind !== 'sapper' || u.task || u.tUnit) continue;
      const d = Math.hypot(u.x - x - 0.5, u.y - y - 0.5);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  // order a sapper to reshape a tile: path to the open edge beside it, then work.
  // forceJob (from a panel tool) picks the job explicitly; else it's auto-detected.
  assignTerraform(u, tx, ty, forceJob) {
    if (u.kind !== 'sapper') return false;
    const job = forceJob ? (this.canTerraform(u.owner, tx, ty, forceJob) ? forceJob : null)
                         : this.terraformJob(u.owner, tx, ty);
    if (!job) return false;
    if (job === 'dig' && Terraform.digWouldSeal(tx, ty)) return false;   // reachability clamp, checked up front too
    const opts = [];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = tx + ox, y = ty + oy;
      if (!Path.passable(x, y, u.owner) || Bld.at(x, y)) continue;
      opts.push({ x, y, d: Math.hypot(u.x - x, u.y - y) });
    }
    opts.sort((a, b) => a.d - b.d);
    let best = opts[0] || null;
    if (best && job === 'dig' && opts.length > 1) {
      // KEEP A WAY HOME (tests/work-order.mjs): dig standing on the side that
      // still connects to the town once this tile is a trench. The nearest
      // side can be a one-tile pocket between two cuts of the sapper's own
      // line — dig from there and it maroons itself on the wrong bank.
      const steps = this.homeSteps(u.owner);
      if (steps.length) {
        const home = opts.find(o => {
          const R = this._floodReach(o.x, o.y, u.owner, MapGen.idx(tx, ty));
          return steps.some(hi => R[hi]);
        });
        if (home) best = home;
      }
    }
    if (!best) return false;
    // 'bridgeup' is the odd one out: its clock lives on the BRIDGE and counts
    // DAYS, not seconds (see the terraform tick) — the task only mirrors it so
    // the panel has a bar to draw
    const works = job === 'bridgeup' ? this._bridgeWorks(u.owner, tx, ty) : null;
    const time = job === 'dig' ? CFG.TERRAFORM.dig : job === 'bridge' ? CFG.TERRAFORM.bridge
      : job === 'bridgeup' ? (works ? works.upgrading : 1)
      : job === 'mound' ? Terraform.moundTime(tx, ty) : CFG.TERRAFORM.clear;
    const STAND = 0.4;
    u.task = {
      type: 'terraform', job, x: tx, y: ty, sx: best.x, sy: best.y,
      stx: best.x + 0.5 + (tx - best.x) * STAND, sty: best.y + 0.5 + (ty - best.y) * STAND,
      t: time, total: works ? (works.upTotal || time) : time,
    };
    u.tUnit = 0; u.tBld = 0;
    return this.setPath(u, best.x, best.y);
  },

  /* ---------- WORK-ORDER INTELLIGENCE (tests/work-order.mjs) ----------
     A finished wall blocks the tile it stands on; so does a dug trench. A
     worker handed a LINE of such jobs must not take the near one first when
     finishing it would cut them off from the rest — "if I do spot 2 first I
     can't reach spot 1, so spot 1 comes first." pickWorkOrder returns the
     next job to do: the NEAREST one whose completion leaves every other
     pending job still workable. When the near job IS the cut, the pick falls
     past it to the far side — cross first, then work back homeward. */

  /* THE TOWN'S DOORSTEP — the passable tiles touching the hall. "Can I still
     get home?" must never ask for the hall's OWN tile: buildings are solid
     now (Bld.solid), so no flood can ever land inside the Town Center and
     every home check would silently answer "no" forever. Asking for the
     doorstep is the same question with an honest target. */
  homeSteps(owner) {
    const tc = Bld.tcOf(owner);
    if (!tc) return [];
    const sz = Bld.size('tc'), out = [];
    for (let dy = -1; dy <= sz; dy++) for (let dx = -1; dx <= sz; dx++) {
      if (dx >= 0 && dx < sz && dy >= 0 && dy < sz) continue;   // skip the footprint itself
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y) && Path.passable(x, y, owner)) out.push(MapGen.idx(x, y));
    }
    return out;
  },

  // 4-dir land flood from (sx,sy) for this owner; blockIdx (a MapGen.idx, or
  // -1) is treated as solid — "what can I still reach once that tile is done?"
  _floodReach(sx, sy, owner, blockIdx) {
    const W = CFG.W;
    const seen = new Uint8Array(W * CFG.H);
    if (!MapGen.inB(sx, sy)) return seen;
    const q = [MapGen.idx(sx, sy)]; seen[q[0]] = 1;
    let head = 0;
    while (head < q.length) {
      const i = q[head++], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!MapGen.inB(nx, ny)) continue;
        const ni = MapGen.idx(nx, ny);
        if (seen[ni] || ni === blockIdx || !Path.passable(nx, ny, owner)) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    return seen;
  },
  // tiles a worker could stand on to work a job: the ring around its footprint.
  // Builders reach the diagonal (the 1.55 floor); a sapper digs from the four
  // edges only — j.diag says which.
  _jobStands(j) {
    const s = j.size || 1, out = [];
    for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) {
      if (dx > -1 && dy > -1 && dx < s && dy < s) continue;              // the footprint itself
      if (!j.diag && (dx === -1 || dx === s) && (dy === -1 || dy === s)) continue;   // corners
      out.push([j.x + dx, j.y + dy]);
    }
    return out;
  },
  // pending: [{x, y, size?, diag?, blocks?, noStandBld?, ref}] — candidates to
  // do next. protect (default pending): jobs that must STAY workable. Returns
  // the chosen entry, or null when nothing is reachable at all.
  pickWorkOrder(u, pending, protect) {
    protect = protect || pending;
    const R0 = this._floodReach(u.x | 0, u.y | 0, u.owner, -1);
    const standIn = (j, R) => this._jobStands(j).some(([x, y]) =>
      MapGen.inB(x, y) && R[MapGen.idx(x, y)] && !(j.noStandBld && Bld.at(x, y)));
    const cand = [];
    for (const j of pending) {
      let stand = null, bd = 1e9;
      for (const [x, y] of this._jobStands(j)) {
        if (!MapGen.inB(x, y) || !R0[MapGen.idx(x, y)]) continue;
        if (j.noStandBld && Bld.at(x, y)) continue;
        const d = Math.hypot(u.x - (x + 0.5), u.y - (y + 0.5));
        if (d < bd) { bd = d; stand = [x, y]; }
      }
      if (stand) cand.push({ j, d: bd, stand });
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a.d - b.d);
    const live = protect.filter(pj => standIn(pj, R0));   // only guard what's reachable NOW
    let fallback = null, fbCut = 1e9;
    for (const c of cand) {
      if (!c.j.blocks) return c.j;   // finishing it blocks nothing — safe by nature
      // the worker ends this job standing beside it: from there, with the tile
      // now solid, every other live job must still have a stand tile
      const R1 = this._floodReach(c.stand[0], c.stand[1], u.owner, MapGen.idx(c.j.x, c.j.y));
      let cut = 0;
      for (const pj of live) {
        if (pj === c.j || (pj.x === c.j.x && pj.y === c.j.y)) continue;
        if (!standIn(pj, R1)) cut++;
      }
      if (!cut) return c.j;
      if (cut < fbCut) { fbCut = cut; fallback = c.j; }   // every order cuts something — least damage first
    }
    return fallback;
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
      let it;
      if (u.jobs.length > 1 && u.jobs.every(j => j.job === 'dig')) {
        // a trench LINE is order-sensitive: each dug tile blocks the ground
        // it's on, so pick the tile whose completion doesn't wall the sapper
        // off from the rest (pickWorkOrder — tests/work-order.mjs). Bridge /
        // clear / mound lines OPEN ground, and their queue order carries
        // meaning (the AI's breach lanes chain landings; mounds are sorted
        // shore-first) — those stay strictly first-in-first-out.
        const pick = this.pickWorkOrder(u, u.jobs.map(j =>
          ({ x: j.x, y: j.y, blocks: true, noStandBld: true, ref: j })));
        it = pick ? pick.ref : u.jobs[0];
        u.jobs.splice(u.jobs.indexOf(it), 1);
      } else it = u.jobs.shift();
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
      const x = u.x | 0, y = u.y | 0;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) continue;
      const sx = Math.max(1, Math.min(W - 2, x)), sy = Math.max(1, Math.min(H - 2, y));
      // the outer ring is now off-map void — pull ANY unit off it, boats included
      // (a hull left on the old navigable rim by a pre-lockdown save floats to the
      // nearest real water), onto ground/water it can legally occupy
      const naval = this.isNaval(u), dom = naval ? 'water' : this.domain(u);
      const ok = naval
        ? (px, py) => Path.passable(px, py, u.owner, 'water') && !Bld.at(px, py)
        : (px, py) => Path.passable(px, py, u.owner, dom) && !Bld.at(px, py);
      const spot = MapGen.findNear(sx, sy, 10, ok);
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
  // DENSE RANKS (tests/army-groups.mjs): two units of the same KIND share a
  // tile, so a war party lands as a tight block instead of a sprawl — half the
  // footprint, same melee-front / ranged-behind order.
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
    // melee front, and same kinds adjacent so they pair onto shared tiles
    const rank = u => (CFG.UNITS[u.kind].rng ? 1 : 0);
    const order = units.slice().sort((a, b) => rank(a) - rank(b) ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
    let needed = 0;
    for (let i = 0; i < order.length; i++) {
      needed++;
      if (order[i + 1] && order[i + 1].kind === order[i].kind) i++;   // this pair shares a tile
    }
    const spots = [];
    const seen = new Set([start.x + ',' + start.y]);
    const q = [start];
    while (q.length && spots.length < needed) {
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
    let si = 0;
    for (let i = 0; i < order.length; i++) {
      const spot = spots[Math.min(si++, spots.length - 1)];
      this.moveTo(order[i], spot.x, spot.y);
      if (order[i + 1] && order[i + 1].kind === order[i].kind) {
        this.moveTo(order[i + 1], spot.x, spot.y);
        i++;
      }
    }
  },

  /* SIEGE ORDER (tests/army-strategies.mjs) — the army splits by role:
     ARTILLERY (engines with a throw; the ranges' bows stand in when the party
     has no engines) bombards the chosen building; the FOOT LINE posts up
     between the guns and the target and stands its ground; bows and horses
     not on the guns post just behind the line as the reaction force. Nobody
     free-hunts: siegeGuard only engages what comes to the line. */
  siegeOrder(ids, b) {
    const mem = ids.map(id => this.get(id)).filter(o => o && this.isMilitary(o) && !this.isNaval(o));
    if (!mem.length) return false;
    const isEngine = o => (this.isSiege(o) || o.kind === 'ballista') && CFG.UNITS[o.kind].atk > 0;
    const isCav = o => o.kind === 'rider' || o.kind === 'lancer' || o.kind === 'horsearcher';
    const engines = mem.filter(isEngine);
    const bows = mem.filter(o => !isEngine(o) && !isCav(o) && CFG.UNITS[o.kind].rng);
    const artillery = engines.length ? engines : bows;
    if (!artillery.length) return false;   // nothing that can lay a siege — caller falls back
    const line = mem.filter(o => !isEngine(o) && !isCav(o) && !CFG.UNITS[o.kind].rng);
    const support = mem.filter(o => artillery.indexOf(o) < 0 && line.indexOf(o) < 0);
    const cx = mem.reduce((s, o) => s + o.x, 0) / mem.length;
    const cy = mem.reduce((s, o) => s + o.y, 0) / mem.length;
    const tx = Bld.cx(b), ty = Bld.cy(b);
    let dx = tx - cx, dy = ty - cy;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    // the guns stand off at their own range; the line holds between guns and
    // target, the reaction force a step behind the line
    const rng = Math.min(...artillery.map(o => CFG.UNITS[o.kind].rng || 3.5));
    const standoff = Math.max(3, rng - 0.5);
    const px = -dy, py = dx;
    const post = (D, k) => {
      const wx = Math.round(tx - dx * D + px * k), wy = Math.round(ty - dy * D + py * k);
      if (Path.passable(wx, wy, mem[0].owner) && !Bld.at(wx, wy)) return { x: wx, y: wy };
      return MapGen.findNear(wx, wy, 3, (x, y) => Path.passable(x, y, mem[0].owner) && !Bld.at(x, y));
    };
    const place = (units, D) => {
      // same dense pairing as formation moves: two of a kind to a tile
      const order = units.slice().sort((a2, b2) => a2.kind < b2.kind ? -1 : a2.kind > b2.kind ? 1 : 0);
      let slot = 0;
      for (let i = 0; i < order.length; i++) {
        const k = (slot % 2 ? 1 : -1) * Math.ceil(slot / 2); slot++;
        const p = post(D, k);
        const pair = order[i + 1] && order[i + 1].kind === order[i].kind ? [order[i], order[i + 1]] : [order[i]];
        for (const o of pair) {
          o.strat = 'siege'; o.defend = false; o.assault = false;
          o.tUnit = 0; o.tBld = 0; o.tBridge = null;
          if (p) {
            o.siegePost = { x: p.x, y: p.y };
            o.task = { type: 'move', x: p.x, y: p.y, guard: true };
            this.setPath(o, p.x, p.y);
          }
        }
        if (pair.length === 2) i++;
      }
    };
    for (const o of artillery) {
      o.strat = 'siege'; o.siegePost = null; o.defend = false; o.assault = false; o.tUnit = 0;
      this.orderAttackBuilding(o, b);
    }
    place(line, Math.max(1.8, standoff - 1.6));
    place(support, Math.max(2.4, standoff - 0.6));
    return true;
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
      else if (u.owner === 'R') this.sailOff(u);   // the raid is off — never park a full longboat forever
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
      c.path = null; c.pathI = 0; c.tUnit = 0; c.tBld = 0; c.cd = 0;
      // a rival landing party resumes its assault the instant it hits the beach (its
      // raidObj was stashed at embarkation) — otherwise it stands idle on the shore
      c.task = (c.owner === 'A' && c.raidObj) ? { type: 'raid' } : null;
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
    if (u.owner === 'P' && landed) G.log(`${landed} put ashore`);
    else if (u.owner === 'P' && cargo.length) G.log('No open shore beside the hull — sail closer to land', true);
    // an emptied raider / rival hull has done its job — beach and abandon it
    if ((u.owner === 'R' || u.owner === 'A') && !cargo.length && S.units.includes(u)) S.units.splice(S.units.indexOf(u), 1);
    // a barbarian hull that STILL holds warriors it couldn't land gives up the
    // raid entirely — it must never idle at the coast with a band stuck aboard
    else if (u.owner === 'R' && cargo.length) this.sailOff(u);
  },

  // a barbarian longboat that can't put its warriors ashore abandons the raid:
  // it stands out for the map rim and vanishes there, warriors and all — the
  // same "melt into the wilds" every stranded land raider gets. If not even
  // open water leads off the board, it slips away on the spot; the one thing
  // it never does is float at the coast forever with a full hold.
  sailOff(u) {
    const W = CFG.W, H = CFG.H;
    for (const c of [{ x: u.x | 0, y: 1 }, { x: u.x | 0, y: H - 2 }, { x: 1, y: u.y | 0 }, { x: W - 2, y: u.y | 0 }]) {
      this.setPath(u, c.x, c.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
      if (end && (end.x <= 1 || end.y <= 1 || end.x >= W - 2 || end.y >= H - 2)) {
        u.task = { type: 'sailoff' };
        return;
      }
    }
    if (S.units.includes(u)) S.units.splice(S.units.indexOf(u), 1);
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
    this.herdClock = (this.herdClock || 0) + dt;   // the shared slow beat every herd breathes to
    for (let i = S.units.length - 1; i >= 0; i--) {
      const u = S.units[i];
      u.animT += dt;
      if (u.cd > 0) u.cd -= dt;
      if (u.burnT) {
        u.burnT = Math.max(0, u.burnT - dt);   // dragonfire clings
        u.path = null;                         // the doomed don't march — they fall where the fire found them
        continue;
      }
      if (u.dieT != null && u.dieT > 0) {      // the plague's slow fall — keel over, then gone
        u.dieT -= dt; u.path = null;
        if (u.dieT <= 0) {
          for (const o of S.units) if (o.tUnit === u.id) { o.tUnit = 0; this.resolveAfterFight(o); }
          if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
          S.units.splice(i, 1);
        }
        continue;
      }

      /* GROUND-TRUTH RESCUE: the world reshapes under standing feet — a logged
         stump regrows to forest, a sapper's channel floods to a moat — and a
         land unit left ON a tile that now blocks it is wedged for good: it can
         neither strike (its prey sits a hair past reach) nor path away
         (Path.find can never get CLOSER than where it already stands, so it
         re-plans to nowhere every half-second, forever). A real day-22 game
         had a rival defender rooted in regrown trees beside the villager it
         was hunting. Slide it to the nearest open tile — orders intact — and
         let it re-plan from honest ground. */
      // (asks Path.passable outright, so it catches a BUILDING raised over a
      // unit's head exactly as it catches regrown forest — same wedge, same
      // cure; an own gate reads as open to its owner and needs no rescue)
      if (!this.isNaval(u)) {
        if (!Path.passable(u.x | 0, u.y | 0, u.owner)) {
          const spot = MapGen.findNear(u.x | 0, u.y | 0, 3, (x, y) => Path.passable(x, y, u.owner) && !Bld.blockAt(x, y));
          if (spot) {
            u.x = spot.x + 0.5; u.y = spot.y + 0.5; u.path = null; u.pathI = 0;
            // a march in progress re-plans from the new footing (a nulled path
            // reads as "arrived" to the move task, which would eat the order)
            if (u.task && u.task.type === 'move' && u.task.x != null) this.setPath(u, u.task.x, u.task.y);
          }
        }
      }

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
        if (S.units[i] === u && !u.tUnit && !u.tBld) {
          if (this.moving(u)) { u.stallT = 0; this.followPath(u, dt); }
          // …but a CAMP TENDER standing at its own fire is not stranded — it is
          // doing its job (tests/raider-camps.mjs). Melting those away would
          // empty every camp on the map within a minute of the game starting.
          else if (u.owner === 'R' && !u.campId && (u.stallT = (u.stallT || 0) + dt) > 8) {
            // BACKSTOP: no prey, no path, going nowhere for 8 straight seconds —
            // whatever wedged this raider (marooned on water, a pocket with no
            // exit, a state the seek logic never anticipated), it does not get
            // to stand around glitching forever. The band melts into the wilds.
            S.units.splice(i, 1);
          }
        }
        continue;
      }

      const t = u.task;
      if (!t) continue;
      if (t.type === 'move') {
        if (this.followPath(u, dt)) {
          u.task = null; u.anchor = { x: u.x, y: u.y };
          if (t.guard) u.guardPost = null;   // back at the post — forget it (a fresh fight stamps a new one)
        }
      } else if (t.type === 'banish') {
        /* BANISHED (tests/banish.mjs): they down tools and walk off the map for
           good. The pop cap is the only thing this gives back — nothing is
           refunded — so it is the villager's answer to Scuttle: a way to make
           room for soldiers late on when the fields no longer need the hands.
           They leave under their own feet, so the walk is real: a barbarian
           can still cut them down on the road, and a banishment can be called
           off by giving them any other order before they reach the edge. */
        // (the roster is walked BACKWARDS, so despawning from inside it is safe)
        if (this.followPath(u, dt) || !this.moving(u)) {
          if (this.atMapEdge(u)) { this.leaveTheMap(u); continue; }
          // the road ended short (the way out was blocked, or the ground
          // reshaped under them) — pick a fresh way off the board
          if (!this.sendToEdge(u)) { this.leaveTheMap(u); continue; }
        }
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
          /* THE HARVEST GOES TO ITS OWN TRIBE'S STORES (tests/worked-ground.mjs).
             This used to credit S.res flat — the PLAYER's stockpile — because
             only the player ever hand-gathered. The rival works the land by
             hand now (AI.workTheLand), and it has to: worked-out ground is the
             only ground a station may stand on, so a chief that never fells a
             tree could never raise a lumber camp. */
          const store = u.owner === 'P' ? S.res : (S.ai && S.ai.res);
          if (!store) { u.task = null; continue; }
          const before = store[g.res];
          const take = Math.min(S.map.resAmount[idx], g.rate * dt * G.modeCfg().gather *
            (window.Cards ? Cards.gatherMult(u.owner, g.res) : 1));   // ORIGIN CARDS pace
          store[g.res] += take;
          if (u.owner === 'P' && S.stats) S.stats.gathered += take;
          S.map.resAmount[idx] -= take;
          // an occasional glance-tick, throttled per worker (R.workFloat)
          if ((before | 0) !== (store[g.res] | 0)) R.workFloat(u, '+' + g.res);
          if (S.map.resAmount[idx] <= 0.001) {
            // tile exhausted — it turns to stumps/pebbles/spent soil, which is
            // now PASSABLE (felling the wood opens a new route through it) and,
            // from here on, the ONE kind of ground that station belongs on
            S.map.resAmount[idx] = 0;
            S.map.terrain[idx] = CFG.DEPLETED[terr];
            G.scheduleRevert(idx);
            R.updateTile(t.x, t.y);
            if (u.owner === 'P') {
              const what = terr === T.FOREST ? 'The forest here is felled — a lumber camp may stand on it'
                : terr === T.HILLS ? 'The stone here is quarried out — a quarry may stand on it'
                : 'The soil here is spent — a farm may stand on it';
              G.log(`${what} — villager idle`);
            }
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
            : t.job === 'mound' ? Terraform.isMoundable(t.x, t.y, u.owner)
            : t.job === 'bridgeup' ? !!this._bridgeWorks(u.owner, t.x, t.y)   // the span (and its works) still stand
            : !(Bld.bridgeAt && Bld.bridgeAt(t.x, t.y)) && !!Terraform.bridgeCrossing(t.x, t.y, u.owner);   // not just "still water" — the span must still land on both sides
          if (!stillValid) { this.startNextTerraform(u); continue; }
          /* REINFORCING A SPAN is a BUILD, so it runs on the building clock:
             DAYS, counted down on the bridge itself rather than on this task.
             Two consequences that are the whole point — the work survives the
             sapper being cut down at the waterline, and a second sapper on the
             same works genuinely halves it, exactly as two builders do. */
          if (t.job === 'bridgeup') {
            const br = this._bridgeWorks(u.owner, t.x, t.y);
            br.upgrading -= dt * 1000 / CFG.DAY_MS;
            t.t = Math.max(0, br.upgrading); t.total = br.upTotal || t.total;
            if (Math.random() < 0.10) R.float(u.x + (Math.random() - 0.5), u.y - 0.4, '·', '#adada2');   // stone dust
            if (br.upgrading <= 0) { Bld.finishBridgeUpgrade(br); this.startNextTerraform(u); }
            continue;
          }
          t.t -= dt;
          if (Math.random() < 0.16) R.float(u.x + (Math.random() - 0.5), u.y - 0.4, '·', '#cdbb90');   // spadefuls of earth
          if (t.t <= 0) {
            let done = false, moat = false, berm = false, cost = false;
            // SERVICE FEES (tests/sapper-fees.mjs): every job bills per tile —
            // dig/bridge/clear/mound, the deeper the tier the dearer. Checked
            // before the work lands, PAID only when it does: a job that fails
            // (a seal-guarded dig, a fallen-through crossing) charges nothing,
            // and a tribe that can't pay skips the tile with a warning.
            const res = u.owner === 'P' ? S.res : S.ai.res;
            const fee = CFG.TERRAFORM[t.job + 'Cost'];
            if (fee && !Bld.canAfford(fee, res)) cost = true;
            else {
              if (t.job === 'dig') { done = Terraform.dig(t.x, t.y); moat = done && S.map.terrain[MapGen.idx(t.x, t.y)] === T.MOAT; }
              else if (t.job === 'clear') { done = Terraform.clear(t.x, t.y); }
              else if (t.job === 'mound') { done = Terraform.mound(t.x, t.y); berm = done && S.map.terrain[MapGen.idx(t.x, t.y)] === T.MOUND; }
              else if (t.job === 'bridge' && Bld.buildBridge) { done = Bld.buildBridge(u.owner, t.x, t.y); }
              if (done && fee) Bld.pay(fee, res);
            }
            if (u.owner === 'P') {
              if (done) G.log(t.job === 'dig' ? (moat ? 'Your sappers open a moat — the channel floods!' : 'Your sappers dig a trench')
                : t.job === 'clear' ? 'Your sappers breach the ground — a path opens'
                : t.job === 'mound' ? (berm ? 'Your sappers raise an earth mound — slow to cross' : 'Your sappers reclaim solid ground from the water')
                : 'Your sappers raise a bridge');
              else if (cost) UI.toast(`The sappers want paying — ${Bld.costStr(fee)} per tile`, true);
              else if (t.job === 'dig') UI.toast('Can’t dig there — it would seal the town in', true);
              else if (t.job === 'bridge') UI.toast('The crossing fell through — can’t bridge there', true);
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
          if (u.owner === 'P' && (before | 0) !== (bag.food | 0)) R.workFloat(u, '+food');
          if (S.map.resAmount[idx] <= 0.001) {
            S.map.resAmount[idx] = 0;
            G.scheduleFishReturn(idx);   // the shoal comes back in time
            // drift to the next stocked water tile nearby, or go idle
            const next = MapGen.findNear(t.x, t.y, 4, (x, y) => this.canFish(x, y));
            if (next && this.assignFish(u, next.x, next.y)) continue;
            if (u.owner === 'P') G.log('These waters are fished out — boat idle');
            u.task = null;
          }
        }
      } else if (t.type === 'claim') {
        /* WALK OUT AND TAKE THE SEAM (tests/gold-mine.mjs). The works go up
           only when a hand actually reaches the gold — claiming on the ORDER
           would let a tribe stake every seam on the map from its own doorstep.
           On arrival the claim becomes an ordinary 'work' task, so everything
           downstream (production, the work line, the panel, the pick-swing
           pose) sees the same station every other plot is. */
        if (!Bld.seamAt(t.x, t.y)) { u.task = null; continue; }
        if ((u.x | 0) !== t.x || (u.y | 0) !== t.y) {
          if (this.followPath(u, dt) && !((u.x | 0) === t.x && (u.y | 0) === t.y)) {
            if (u.owner === 'P') G.log('The gold seam cannot be reached', true);
            u.task = null;
          }
        } else {
          u.path = null;
          const b = Bld.claimSeam(u.owner, t.x, t.y);
          if (!b) {                                     // still held — clear them off first
            if (u.owner === 'P') UI.toast(Bld.canClaimSeam(u.owner, t.x, t.y).why, true);
            u.task = null;
          } else if (Bld.workersAssigned(b) >= Bld.maxWorkers(b)) {
            if (u.owner === 'P') UI.toast('The mine is fully crewed', true);
            u.task = null;
          } else {
            u.task = { type: 'work', id: b.id };
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
          if (u.owner === 'P' && (before | 0) !== (bag.food | 0)) R.workFloat(u, '+food');
          if (S.map.resAmount[idx] <= 0.001) {
            S.map.resAmount[idx] = 0;
            G.scheduleFishReturn(idx);   // the shoal comes back in time
            if (u.owner === 'P') G.log('This shoal is fished out — villager idle');
            u.task = null;
          }
        }
      } else if (t.type === 'build') {
        // owner-agnostic: the rival's villagers raise their buildings with the
        // same hands (and the same hammer sprite) the player's do
        const b = Bld.get(t.id);
        if (!b || b.owner !== u.owner || (b.construction <= 0 && b.upgrading <= 0 && b.hp >= b.maxhp)) {
          u.task = null;   // done (or site gone) — villager is free again
          continue;
        }
        const d = Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y);
        // 1.55 floor so a DIAGONALLY-adjacent builder (√2 ≈ 1.41 from a 1×1 wall's
        // centre) counts as "at the site" — at 1.25 a villager that could only stand
        // on the diagonal (walls above/below in the line, a river or another wall on
        // the flank) sat right beside the wall and never built it. Matches the same
        // diagonal-reach floor combat uses for battering a wall.
        if (d > 1.55 + Bld.reach(b)) {
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
                // walk the wall line: continue to a nearby unmanned site — but
                // never one whose finished wall would cut us off from the rest
                // of the line (pickWorkOrder — tests/work-order.mjs). Nearest
                // SAFE site wins; when the near section IS the cut, the pick
                // falls past it and the line closes from the far side back.
                const near = [], line = [];
                for (const nb of S.buildings) {
                  if (nb.owner !== u.owner || nb.construction <= 0 || Bld.hasWorker(nb)) continue;
                  const dd = Math.hypot(Bld.cx(nb) - u.x, Bld.cy(nb) - u.y);
                  if (dd >= 24) continue;   // guard the whole line, not the whole map
                  const desc = { x: nb.x, y: nb.y, size: Bld.size(nb), diag: true, blocks: nb.key === 'wall', ref: nb };
                  line.push(desc);
                  if (dd < 6) near.push(desc);
                }
                if (near.length) {
                  const pick = this.pickWorkOrder(u, near, line);
                  if (pick) this.assignBuild(u, pick.ref);
                }
              }
            }
          } else if (b.upgrading > 0) {
            b.upgrading -= dtDays;
            if (b.upgrading <= 0) {
              // finishUpgrade sends EVERY hand that downed tools back to its post
              // (Bld.resumeCrew) — with two builders only one of us gets here, and
              // which one shouldn't decide who keeps their job
              Bld.finishUpgrade(b);
              if (u.task && u.task.type === 'build' && u.task.id === b.id) u.task = null;
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
          /* WHAT THIS HAND IS BRINGING IN. A gatherer out on a forest tile
             floats "+wood" as it works (the gather branch above); a villager
             stationed at a plot used to show nothing at all, even though a
             station's whole job is producing. Same white vanishing text, same
             colour, at about the same cadence — so a miner reads "+gold" the
             way a woodcutter reads "+wood", and gold needs no special
             treatment of its own. Production itself is still the once-a-day
             lump in Bld.dailyProduction; this only SAYS so. */
          const out = Bld.lv(b).out;
          if (out && !b.upgrading) R.workFloat(u, '+' + Object.keys(out)[0]);
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
      } else if (t.type === 'sailoff') {
        // a defeated longboat stands out to sea; at the rim (or if its route
        // ever runs dry) it is gone — cargo and all
        const done = this.followPath(u, dt);
        if (done || u.x < 2 || u.y < 2 || u.x > CFG.W - 2 || u.y > CFG.H - 2)
          S.units.splice(i, 1);
      } else if (t.type === 'attackBld') {
        // target destroyed while en route
        u.task = null;
      }
    }
    this.separateIdle(dt);
  },

  /* DE-STACKING: units that come to rest on the exact same tile (a war party sent
     to one spot, a rallied army, defenders converging on the hall) used to pile
     invisibly — a stack of 18 looked like one sprite and only the top unit could
     be tapped, so the rest were unselectable. Resting units now drift a little
     apart until each has elbow room, then STOP: a dead-zone at MINSEP means once
     they're ~half a tile apart nothing pushes, so there's no jitter and no
     frenetic shuffling. Only truly idle land units move — anything with a job
     (walking, gathering, fighting, en route to a post) is left exactly where it is. */
  separateIdle(dt) {
    const rest = [];
    for (const u of S.units) {
      if (u.tUnit || u.tBld || u.task || this.moving(u)) continue;      // busy or en route
      if (this.isWild(u) || this.isPassive(u) || this.isNaval(u)) continue;   // animals wander; boats sit on water
      rest.push(u);
    }
    const MIN = 0.55, MIN2 = MIN * MIN, MAXSTEP = Math.min(0.09, dt * 2.2);
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      for (let j = i + 1; j < rest.length; j++) {
        const b = rest[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 >= MIN2) continue;                                        // far enough — dead zone, no push
        let d = Math.sqrt(d2);
        if (d < 1e-4) {                                                  // perfectly stacked — split on a stable, id-derived heading
          const ang = ((a.id * 13 + b.id * 7) % 628) / 100;
          dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
        }
        const step = Math.min((MIN - d) / 2, MAXSTEP);
        const nx = dx / d * step, ny = dy / d * step;
        this._nudge(a, nx, ny);
        this._nudge(b, -nx, -ny);
      }
    }
  },
  // shift a resting unit by (dx,dy), but never onto a tile it can't stand on
  // (water/wall/resource/the map's hard border) — a de-stack must not strand it
  _nudge(u, dx, dy) {
    const tx = u.x + dx, ty = u.y + dy;
    if (Path.passable(tx | 0, ty | 0, u.owner, this.domain(u))) { u.x = tx; u.y = ty; }
  },

  /* ---- WILD BEHAVIOUR (tests/wild-life.mjs) ----
     Predators roam alone; GRAZERS keep company and bolt TOGETHER. A herd that
     scatters as one — because the panic spreads from whichever animal actually
     saw the wolf — reads as a living wood in a way that a field of
     independently-wandering deer never does.

     And a herd BREATHES. Real cattle and deer draw in close, fan out across the
     feed, and gather again; they never converge on one point and they never
     trail into a single file. So every grazer keeps its own slowly-drifting
     BEARING from the herd's centre and steps to a radius that swings between
     HERD_TIGHT and HERD_LOOSE on one clock shared by every animal on the map
     (Units.herdClock, advanced in update) — the whole group opens and closes
     as a body. The oldest animal in company leads: it picks the feeding ground
     and the centre follows it, which is what walks a herd across a field. */
  HERD_R: 6,        // how far a herd-mate counts as company
  SPOOK_R: 5.5,     // how close a predator (or an armed stranger) gets before they run
  HERD_TIGHT: 1.3,  // how close they draw in at the top of the breath
  HERD_LOOSE: 3.6,  // how far they fan out at the bottom of it
  HERD_BREATH: 22,  // seconds for one gather → spread → gather
  HERD_JOIN: 30,    // how far a separated animal will walk to rejoin its herd
  HERD_DRIFT: 1.2,  // how far past the ring the leader steps — the herd's slow travel
  spook(u, tx, ty) { u.spookT = 2.2 + Math.random() * 1.6; u.spookX = tx; u.spookY = ty; },
  wildIdle(u, dt) {
    if (this.isPassive(u)) return this.grazeIdle(u, dt);
    if (this.moving(u)) { this.followPath(u, dt); return; }
    u.wanderT -= dt;
    if (u.wanderT <= 0) {
      u.wanderT = 2 + Math.random() * 4;
      const tx = (u.x | 0) + ((Math.random() * 9) | 0) - 4;
      const ty = (u.y | 0) + ((Math.random() * 9) | 0) - 4;
      if (Path.passable(tx, ty)) this.setPath(u, tx, ty);
    }
  },
  grazeIdle(u, dt) {
    // already bolting — keep running until the fright wears off
    if (u.spookT > 0) {
      u.spookT -= dt;
      if (this.moving(u)) { this.followPath(u, dt); return; }
      const ax = u.x - u.spookX, ay = u.y - u.spookY, d = Math.hypot(ax, ay) || 1;
      const tx = Math.round(u.x + ax / d * 6), ty = Math.round(u.y + ay / d * 6);
      if (!Path.passable(tx, ty) || !this.setPath(u, tx, ty)) u.spookT = 0;
      return;
    }
    // a look up from the grass every half second: a predator, or anyone armed
    u.lookT = (u.lookT || 0) - dt;
    if (u.lookT <= 0) {
      u.lookT = 0.5;
      let threat = null;
      for (const o of S.units) {
        if (o === u || this.isPassive(o) || this.isNaval(o)) continue;
        const scary = this.isWild(o) || !this.isVillager(o);   // beasts and soldiers, not farmhands
        if (!scary) continue;
        if (Math.hypot(o.x - u.x, o.y - u.y) > this.SPOOK_R) continue;
        threat = o; break;
      }
      if (threat) {
        // PANIC SPREADS — the whole herd goes, not just the one that saw it
        this.spook(u, threat.x, threat.y);
        for (const o of S.units)
          if (o !== u && this.isPassive(o) && Math.hypot(o.x - u.x, o.y - u.y) <= this.HERD_R)
            this.spook(o, threat.x, threat.y);
        return;
      }
    }
    if (this.moving(u)) { this.followPath(u, dt); return; }
    // grazing: short steps on the herd's breath (see the note above)
    u.wanderT -= dt;
    if (u.wanderT > 0) return;
    u.wanderT = 1.6 + Math.random() * 1.8;
    let hx = u.x, hy = u.y, n = 0, lead = u;
    for (const o of S.units) {
      if (o === u || !this.isPassive(o)) continue;
      if (Math.hypot(o.x - u.x, o.y - u.y) > this.HERD_R * 1.8) continue;   // company reaches
      hx += o.x; hy += o.y; n++;                                            // further than panic does
      if (o.id < lead.id) lead = o;
    }
    // every step is measured from the HERD'S CENTRE, never from the animal's own
    // feet — a bearing off its own position lets the lead animal walk away from
    // its band (and off the map); a bearing off the centre cannot
    let cx = n ? hx / (n + 1) : u.x, cy = n ? hy / (n + 1) : u.y;
    if (!n) {
      // SEPARATED — a bolt, or one wide step, can leave an animal on its own.
      // It makes its way back: without this a straggler roams for good and the
      // herd bleeds a head every time something frightens it
      let best = null, bd = this.HERD_JOIN;
      for (const o of S.units) {
        if (o === u || !this.isPassive(o)) continue;
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { cx = best.x; cy = best.y; lead = best; }
    }
    const breath = 0.5 - 0.5 * Math.cos((this.herdClock || 0) / this.HERD_BREATH * Math.PI * 2);
    let r = this.HERD_TIGHT + (this.HERD_LOOSE - this.HERD_TIGHT) * breath;
    let a;
    if (lead === u) {
      // the oldest animal in company leads: it takes the leading edge on a
      // heading that only DRIFTS, and the herd's centre is dragged after it
      u.roamA = u.roamA === undefined ? Math.random() * Math.PI * 2
                                      : u.roamA + (Math.random() - 0.5) * 0.5;
      a = u.roamA;
      r = n ? r + this.HERD_DRIFT : 2.2;
    } else {
      if (u.herdA === undefined) u.herdA = Math.random() * Math.PI * 2;
      u.herdA += (Math.random() - 0.5) * 0.9;                    // they trade places as they feed
      a = u.herdA;
    }
    // a blocked bearing turns the animal rather than stalling it against a shore
    for (let k = 0; k < 4; k++) {
      const aa = a + k * 1.7;
      const tx = Math.round(cx + Math.cos(aa) * r + (Math.random() - 0.5));
      const ty = Math.round(cy + Math.sin(aa) * r + (Math.random() - 0.5));
      if (tx < 1 || ty < 1 || tx >= CFG.W - 1 || ty >= CFG.H - 1) continue;
      if (!Path.passable(tx, ty) || !this.setPath(u, tx, ty)) continue;
      if (lead === u) u.roamA = aa; else u.herdA = aa;
      return;
    }
  },

  damage(u, amt, attackerId, attackerOwner) {
    u.hp -= Math.max(1, amt);
    const attacker = attackerId ? this.get(attackerId) : null;
    if (u.hp <= 0) {
      S.units.splice(S.units.indexOf(u), 1);
      // BACK TO YOUR POST: death cleanup clears every attacker's lock directly,
      // so the combat branch's "target gone" return never fires — send each
      // defending hunter home from HERE or it idles at the kill site forever
      for (const o of S.units) if (o.tUnit === u.id) { o.tUnit = 0; this.resolveAfterFight(o); }
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
        /* AND THE GROUND REMEMBERS IT (tests/worked-ground.mjs). A Hunter's
           Lodge is the one station with no terrain of its own to stand on —
           game is not a tile, it is a thing that dies somewhere — so the tile
           it fell on becomes a killing ground, and that is where a lodge may
           be raised. Stamped for ANY wild death, a wolf taking a deer
           included: a place where animals die is a hunting ground whoever
           made it so, and it keeps the rule symmetric without asking the
           chief to take its soldiers off to chase deer. */
        G.noteHunt(u.x | 0, u.y | 0);
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
      if (tc) { u.task = { type: 'flee' }; this.setPath(u, tc.x, tc.y + Bld.size(tc)); }
    } else if (this.isVillager(u) && u.owner === 'A') {
      // a townsfolk militiaman stands and fights (see Combat.acquire);
      // otherwise the rival's people run for their hall when struck
      if (u.militia) { u.tUnit = attacker.id; }
      else {
        const tc = Bld.tcOf('A');
        if (tc) { u.task = { type: 'flee' }; this.setPath(u, tc.x, tc.y + Bld.size(tc)); }
      }
    } else if (this.isMilitary(u) || this.isWild(u) || this.isVillager(u) || this.isRaider(u)) {
      // ABSOLUTE FOCUS (tests/army-strategies.mjs): a strike-stance soldier
      // never retaliates — it hits what it was ordered to hit, or waits
      if (u.strat === 'strike') return;
      u.tUnit = attacker.id;   // barbarians hit back no matter whom they came for
    }
  },

  // daily upkeep: wildlife spawning
  dailySpawns() {
    const m = G.modeCfg();
    // grazing game animals (harmless, huntable) — kept around in small numbers
    if (this.count('W', u => this.isPassive(u)) < CFG.PASSIVE_MAX - 3 && G.rand() < 0.25)
      this.spawnHerd(G.rand() < 0.5 ? 'deer' : 'cow', 8);
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

  // grazers arrive as a BAND, never as a single beast — a herd is the unit of
  // wildlife here, and grazeIdle's breathing needs company to breathe with
  /* GAME WITHIN REACH OF BOTH SEATS (tests/worked-ground.mjs). A Hunter's
     Lodge stands on ground where an animal fell, so a tribe that never sees a
     deer can never raise one. The world's ordinary herds wander wherever the
     roll puts them; this puts a band near each town on day one so both sides
     start with a hunt they could actually go and make. Seeded rng, so a seed's
     opening is still its own. */
  seedGameNear(x, y, n) {
    let put = 0;
    for (let tries = 0; tries < 60 && put < n; tries++) {
      const ax = Math.round(x + (G.rand() * 2 - 1) * 9), ay = Math.round(y + (G.rand() * 2 - 1) * 9);
      if (!MapGen.onBoard(ax, ay) || !Path.passable(ax, ay) || Bld.at(ax, ay)) continue;
      if (Math.hypot(ax - x, ay - y) < 4) continue;      // not milling on the doorstep
      this.spawn(G.rand() < 0.5 ? 'deer' : 'cow', 'W', ax, ay);
      put++;
    }
    return put;
  },

  spawnHerd(kind, minDistTC) {
    const first = this.spawnWild(kind, minDistTC);
    if (!first) return null;
    const mates = 2 + ((G.rand() * 3) | 0);              // 3–5 head all told
    const open = Path.borderReach();                     // no beast pops up inside a sealed town
    for (let i = 0; i < mates; i++) {
      if (this.count('W', u => this.isPassive(u)) >= CFG.PASSIVE_MAX) break;
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.round(first.x + G.rand() * 5 - 2.5), y = Math.round(first.y + G.rand() * 5 - 2.5);
        if (!Path.passable(x, y) || Bld.at(x, y)) continue;
        if (open && !open[MapGen.idx(x, y)]) continue;
        this.spawn(kind, 'W', x, y); break;
      }
    }
    return first;
  },
};
