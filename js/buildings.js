"use strict";
/* Building placement, construction, upgrades, training, daily production. */

const Bld = {
  _block: null,    // transient movement-blocking grid (walls/gates)

  rebuildBlock() {
    this._block = new Uint8Array(CFG.W * CFG.H);
    for (const b of S.buildings) {
      // a section still being RAISED isn't solid yet — builders (and anyone
      // else) walk through the gap until the day it finishes. This is what
      // lets a wall line across a choke be built at all: the far sections
      // stay reachable through the unbuilt near ones (tests/work-order.mjs).
      // Planning code that cares about INTENT (seal checks) treats sites as
      // solid separately — AI.townOut, Terraform.digWouldSeal.
      if (b.construction > 0) continue;
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
    // walls & gates are built at their tribe's village-wide wall tier — the player's
    // S.wallLevel, or the rival's own S.ai.wallLevel (so the AI can reinforce too)
    const lvN = (key === 'wall' || key === 'gate')
      ? ((owner === 'A' ? (S && S.ai && S.ai.wallLevel) : (S && S.wallLevel)) || 1) : 1;
    return { level: lvN, lv: d.levels[lvN - 1] };
  },
  lv(b) { return CFG.BUILDINGS[b.key].levels[b.level - 1]; },
  get(id) { return S.buildings.find(b => b.id === id); },
  /* ---- footprints: b.x/b.y is the top-left tile; most buildings are 1×1,
     the Town Center claims size×size. All hit-testing, placement and
     distance math flows through these helpers. ---- */
  size(key) { const d = this.def(key); return (d && d.size) || 1; },
  cx(b) { return b.x + this.size(b.key) / 2; },       // footprint center (world units)
  cy(b) { return b.y + this.size(b.key) / 2; },
  /* WORK-SITE STAGE (tests/build-stages.mjs): 0, 1 or 2 at exact 1/3
     intervals of the build (or upgrade) time — ground broken, the raising,
     the target standing in scaffold — until the finished building appears. */
  stageOf(b) {
    const up = b.upgrading > 0;
    const total = up ? (b.upgTotal || this.def(b.key).levels[b.level].time || 1)
      : (this.def(b.key).levels[b.level - 1].time || 1);
    const left = up ? b.upgrading : b.construction;
    const prog = Math.max(0, Math.min(0.9999, 1 - left / (total || 1)));
    return Math.min(2, Math.floor(prog * 3));
  },
  reach(b) { return (this.size(b.key) - 1) * 0.5; },  // extra radius past the 1×1 norm
  covers(b, x, y) {
    const s = this.size(b.key);
    return x >= b.x && x < b.x + s && y >= b.y && y < b.y + s;
  },
  at(x, y) { return S.buildings.find(b => this.covers(b, x, y)); },

  list(owner) { return S.buildings.filter(b => b.owner === owner); },
  tcOf(owner) { return S.buildings.find(b => b.owner === owner && b.key === 'tc'); },
  done(b) { return !b.construction; },

  /* BRIDGES (Sapper tier 2) — a crossing over a water/moat tile. A standing
     bridge makes the tile passable to land (Path checks S.map.bridge); it has HP
     and is attackable, so destroying it re-severs the crossing. Kept in S.bridges
     with a fast 0/1 mirror in S.map.bridge for the pathfinding hot loop. */
  bridgeAt(x, y) { if (!S.bridges) return null; for (const br of S.bridges) if (br.x === x && br.y === y) return br; return null; },
  buildBridge(owner, x, y) {
    if (!window.Terraform || this.bridgeAt(x, y)) return false;
    const dir = Terraform.bridgeCrossing(x, y, owner);   // must span water land-to-land
    if (!dir) return false;
    const hp = CFG.BRIDGE.levels[0].hp;
    const br = { x, y, owner, level: 1, dir, hp, maxhp: hp };
    (S.bridges || (S.bridges = [])).push(br);
    if (S.map.bridge) S.map.bridge[MapGen.idx(x, y)] = 1;
    if (window.R && R.updateTile) R.updateTile(x, y);
    return true;
  },
  canUpgradeBridge(br) { return !!br && (br.level || 1) < 3 && this.canAfford(CFG.BRIDGE.levels[br.level || 1].cost, S.res); },
  upgradeBridge(br) {
    if (!this.canUpgradeBridge(br)) return false;
    this.pay(CFG.BRIDGE.levels[br.level].cost, S.res);   // player-only (UI); AI doesn't upgrade spans
    br.level++;
    br.maxhp = CFG.BRIDGE.levels[br.level - 1].hp;
    br.hp = br.maxhp;   // upgrading re-plates and fully restores the span
    if (window.R && R.updateTile) R.updateTile(br.x, br.y);
    return true;
  },
  damageBridge(br, dmg) { br.hp -= dmg; if (br.hp <= 0) this.removeBridge(br); },
  removeBridge(br) {
    const i = S.bridges ? S.bridges.indexOf(br) : -1; if (i >= 0) S.bridges.splice(i, 1);
    if (S.map.bridge) S.map.bridge[MapGen.idx(br.x, br.y)] = 0;
    if (window.R && R.updateTile) R.updateTile(br.x, br.y);
    if (br.owner === 'P') G.log('A bridge is destroyed — the crossing is severed!', true);
  },
  // the healing grounds for a unit — the only place it can be healed. Land units
  // heal at the Town Center (a radius that grows 15% per level). Ships heal at ANY
  // owned Dock — but they must be RIGHT ON it: touching the dock or at most a tile
  // off its edge, not merely somewhere inside a wide radius. More places to mend,
  // but the ship has to come in close. Null if there's no home building to heal at.
  healZoneFor(u) {
    if (Units.isNaval(u)) {
      let best = null, bd = Infinity;                          // nearest owned, finished dock
      for (const b of S.buildings) {
        if (b.owner !== u.owner || b.key !== 'dock' || !this.done(b)) continue;
        const d = Math.hypot(u.x - this.cx(b), u.y - this.cy(b));
        if (d < bd) { bd = d; best = b; }
      }
      // radius measured from the dock's EDGE (reach) so the touch band is the same
      // however big the footprint — no level scaling: closeness is the whole point.
      return best ? { x: this.cx(best), y: this.cy(best), r: this.reach(best) + CFG.HEAL_DOCK_TOUCH } : null;
    }
    // land units mend at the Town Center — or beside a forward War Camp (a field
    // hospital), whichever healing ground is nearer, so troops on campaign can patch
    // up at the front instead of marching all the way home.
    const cands = [];
    const tc = this.tcOf(u.owner);
    if (tc) cands.push({ x: this.cx(tc), y: this.cy(tc), r: CFG.HEAL_RADIUS * Math.pow(1 + CFG.HEAL_RADIUS_STEP, (tc.level || 1) - 1) });
    for (const b of S.buildings)
      if (b.owner === u.owner && b.key === 'warcamp' && this.done(b))
        cands.push({ x: this.cx(b), y: this.cy(b), r: this.reach(b) + CFG.WARCAMP_HEAL });
    if (!cands.length) return null;
    let best = cands[0], bd = Math.hypot(u.x - best.x, u.y - best.y);
    for (const z of cands) { const d = Math.hypot(u.x - z.x, u.y - z.y); if (d < bd) { bd = d; best = z; } }
    return best;
  },
  inHealZone(u) {
    const z = this.healZoneFor(u);
    return !!z && Math.hypot(u.x - z.x, u.y - z.y) <= z.r;
  },

  canAfford(cost, res) {
    res = res || S.res;
    for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
    return true;
  },
  pay(cost, res) {
    res = res || S.res;
    for (const k in cost) res[k] -= cost[k];
  },
  /* every price in the game reads ICON FIRST, then the number (🪵 120 🪨 40) —
     the icon labels the number that follows it, so a multi-resource cost can't
     be misread as "120 wood-and-stone". The resource bar reads the same way.
     Use this for ANY price shown to the player; never hand-format one. */
  RES_ICON: { food: '🍖', wood: '🪵', stone: '🪨', gold: '✨' },
  resIcon(k) { return this.RES_ICON[k] || k; },
  costStr(cost) {
    // A NBSP binds each icon to ITS number so a pair can never wrap apart
    // (the old format could drop an icon onto the next line, away from its
    // figure). Pairs are separated by a normal space, which keeps the string
    // exactly as wide as before — the narrow build-menu buttons wrap the
    // longest prices onto a third line if the gap is any wider.
    const parts = [];
    for (const k in cost) parts.push(this.resIcon(k) + ' ' + cost[k]);
    return parts.join(' ') || 'free';
  },

  tileFree(x, y) {
    if (!MapGen.inB(x, y)) return false;
    // the outermost ring is the map's HARD BORDER, rendered as black off-map void
    // (see R.draw). It reads to the player as exterior, so nothing may be built on
    // it — they raise their walls and gates on row 1, the first passable ground,
    // flush against the black. (This is why a gate never lands on an impassable
    // rim tile where no soldier could reach it.)
    if (x === 0 || y === 0 || x === CFG.W - 1 || y === CFG.H - 1) return false;
    const t = S.map.terrain[MapGen.idx(x, y)];
    // grass and anything depleted or ruined is fair ground to build on. Fertile
    // soil (orchard/berry ground) is now a standing obstacle — clear it first,
    // or build on the grass beside it (a farm still draws its bonus from nearby)
    const buildable = t === T.GRASS ||
      t === T.STUMPS || t === T.PEBBLES || t === T.BARREN || t === T.RUIN;
    if (!buildable) return false;
    if (this.at(x, y)) return false;
    return true;
  },

  // docks stand on open water: the body must be big enough to work, and the
  // pier needs a walkable shore tile beside it so villagers can build/repair it
  dockSiteOk(x, y, owner) {
    owner = owner || 'P';
    if (x === 0 || y === 0 || x === CFG.W - 1 || y === CFG.H - 1)
      return { ok: false, why: 'Too close to the map edge' };   // the outer ring is off-map black void
    if (!MapGen.inB(x, y) || S.map.terrain[MapGen.idx(x, y)] !== T.WATER || this.at(x, y))
      return { ok: false, why: 'Docks are built on open water' };
    let shore = false;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (MapGen.inB(x + ox, y + oy) && Path.passable(x + ox, y + oy, owner)) { shore = true; break; }
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

  // a would-be site whose ONLY anchor is a War Camp (out beyond the home settlement)
  // — used to tag forward outposts, which don't themselves anchor further building.
  _isOutpostSite(owner, x, y) {
    const mine = this.list(owner);
    const nearHome = mine.some(b => !b.outpost && b.key !== 'warcamp' &&
      Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
    if (nearHome) return false;
    return mine.some(b => b.key === 'warcamp' && Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
  },
  // a forward camp shows up on the OTHER side's map — a bet, not a hidden win. A
  // player's camp is remembered by the rival chief; a rival's camp is revealed on
  // the player's map so it can be answered.
  _revealCampToFoe(b) {
    if (b.owner === 'P') {
      if (S.ai) { S.ai.knownB = S.ai.knownB || {}; S.ai.knownB[MapGen.idx(b.x, b.y)] = { key: b.key, level: b.level, owner: 'P', x: b.x, y: b.y, seen: S.day }; }
    } else if (b.owner === 'A') {
      G.reveal(b.x, b.y, this.def(b.key).levels[0].vision || 4);
      if (S.map.seenB) S.map.seenB[MapGen.idx(b.x, b.y)] = { key: b.key, level: b.level, owner: 'A' };
      R.fogDirty = true;
    }
  },

  canPlace(owner, key, x, y) {
    const d = this.def(key);
    if (!d) return { ok: false, why: '?' };
    if (key === 'dock') {
      const site = this.dockSiteOk(x, y, owner);
      if (!site.ok) return site;
    } else {
      // every tile of the footprint must be buildable ground
      const s = this.size(key);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
        if (!this.tileFree(x + dx, y + dy)) return { ok: false, why: 'Blocked tile' };
    }
    // TC-level gate (player only — the rival's scripted build order sets its own pace)
    if (owner === 'P' && d.reqTC) {
      const tc = this.tcOf('P');
      if (!tc || tc.level < d.reqTC)
        return { ok: false, why: `Needs Town Center Lv ${d.reqTC}` };
    }
    if (owner === 'P' && !S.map.explored[MapGen.idx(x, y)]) return { ok: false, why: 'Unexplored' };
    if (owner === 'P' && this.size(key) > 1) {
      const s = this.size(key);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
        if (!S.map.explored[MapGen.idx(x + dx, y + dy)]) return { ok: false, why: 'Unexplored' };
    }
    if (d.unique && this.list(owner).some(b => b.key === key)) return { ok: false, why: 'Already built' };
    // capped structures (War Camp) — only so many forward bases in the field at once
    if (d.max && this.list(owner).filter(b => b.key === key).length >= d.max)
      return { ok: false, why: `Only ${d.max} ${d.name}${d.max > 1 ? 's' : ''} at a time` };
    // ANCHORS & the front line. Fortifications (walls/gates) and the freely-placed
    // War Camp may be raised anywhere explored. Everything else must sit within reach
    // of an ANCHOR: a home building (near the town) or a War Camp (the mini-TC of the
    // front). A forward OUTPOST — a building anchored only by a camp — does NOT itself
    // anchor, so the camp is a linchpin: raze it and the front-line base can't grow.
    const mine = this.list(owner);
    const freePlace = d.freePlace || key === 'wall' || key === 'gate';
    const homeAnchors = mine.filter(b => !b.outpost && b.key !== 'warcamp');
    const nearHome = homeAnchors.some(b => Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
    const nearCamp = mine.some(b => b.key === 'warcamp' && Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
    if (!freePlace && mine.length && !nearHome && !nearCamp)
      return { ok: false, why: mine.some(b => b.key === 'warcamp') || homeAnchors.length ? 'Too far — build by your town or a War Camp' : 'Too far from your buildings' };
    // a forward camp is a MILITARY staging ground — no relocating farms/houses/economy
    // to the front. (Near home, anything goes as normal.)
    if (!freePlace && !nearHome && nearCamp && CFG.STAGING_BUILD.indexOf(key) < 0)
      return { ok: false, why: 'Only military buildings at a War Camp' };
    const res = owner === 'P' ? S.res : S.ai.res;
    if (!this.canAfford(this.effCost(owner, key), res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true };
  },

  // what a placement really costs — ORIGIN CARDS discounts (Mason forts,
  // Nomad first-buildings) apply on top of the base spec
  effCost(owner, key) {
    const cost = this.buildSpec(key, owner).lv.cost;
    return window.Cards ? Cards.buildCost(owner, key, cost) : cost;
  },

  // AI ACTION BUDGET — the rival has one pair of hands too. Starting a
  // construction, an upgrade, a training run or a caravan spends one of its few
  // daily macro actions (AI.daily refills S.ai.acts from the mode's aiActions;
  // emergency/safety works run under S.ai._free). Purely a THROUGHPUT limit —
  // the utility scoring still picks the best actions first, so the chief does
  // the two smartest things a day instead of all seven at once, like a human.
  aiAct(owner) {
    if (owner !== 'A' || !S.ai || S.ai.acts == null || S.ai._free) return true;
    if (S.ai.acts <= 0) return false;
    S.ai.acts--; return true;
  },

  place(owner, key, x, y, opts) {
    opts = opts || {};
    if (owner === 'A' && !opts.free && !this.aiAct(owner)) return null;
    const d = this.def(key);
    const spec = this.buildSpec(key, owner);
    const res = owner === 'P' ? S.res : S.ai.res;
    // ORIGIN CARDS: discounts and haste read BEFORE the Nomad charge burns
    const tMult = window.Cards ? Cards.buildTimeMult(owner) : 1;
    if (!opts.free) {
      this.pay(this.effCost(owner, key), res);
      if (window.Cards) Cards.notePlaced(owner);
    }
    // is this a FORWARD OUTPOST — a structure whose only anchor is a War Camp, out
    // beyond the home settlement? Such buildings don't themselves anchor further
    // construction, so razing the camp stops the front-line base from growing. The
    // camp itself is never an outpost (it's the anchor).
    const outpost = key !== 'warcamp' && this._isOutpostSite(owner, x, y);
    const b = {
      id: S.nextId++, key, owner, x, y, level: spec.level,
      // construction sites are fragile until finished
      hp: opts.instant ? spec.lv.hp : Math.max(30, Math.round(spec.lv.hp * 0.4)),
      maxhp: spec.lv.hp,
      construction: opts.instant ? 0 : spec.lv.time * tMult,   // days left
      upgrading: 0, queue: [], cd: 0, outpost,
    };
    S.buildings.push(b);
    if (key === 'warcamp') this._revealCampToFoe(b);   // a forward camp shows on the enemy's map
    this._block = null;
    // fresh construction clears old stumps/rubble — only the new building shows
    const sz = this.size(key);
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      const ti = MapGen.idx(x + dx, y + dy);
      const t0 = S.map.terrain[ti];
      if (t0 === T.STUMPS || t0 === T.PEBBLES || t0 === T.BARREN || t0 === T.RUIN) {
        S.map.terrain[ti] = T.GRASS;
        if (S.map.resAmount) S.map.resAmount[ti] = 0;
        if (S.map.decay) delete S.map.decay[ti];
        R.updateTile(x + dx, y + dy);
      }
    }
    if (owner === 'P') {
      // a work site reveals nothing while it goes up — only a finished
      // building (or one placed already-built) expands the view
      if (opts.instant) G.reveal(x + (this.size(key) >> 1), y + (this.size(key) >> 1), d.levels[0].vision || 4);
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
    if (b.key === 'wall' || b.key === 'gate') {
      // the section just became solid (rebuildBlock skips it while raising) —
      // and anyone standing on the tile steps off, ties broken toward home,
      // so a builder finishing a section under its own feet ends on the town
      // side rather than sealed out (tests/work-order.mjs)
      this._block = null;
      for (const w of S.units) {
        if (Units.isNaval(w) || !this.covers(b, w.x | 0, w.y | 0)) continue;
        if (Path.passable(w.x | 0, w.y | 0, w.owner)) continue;   // an own gate stays open to its owner
        const tcH = this.tcOf(w.owner);
        let spot = null, sd = 1e9;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = (w.x | 0) + dx, y = (w.y | 0) + dy;
          if ((!dx && !dy) || !Path.passable(x, y, w.owner)) continue;
          const d = Math.hypot(dx, dy) +
            (tcH ? Math.hypot(x + 0.5 - this.cx(tcH), y + 0.5 - this.cy(tcH)) * 0.1 : 0);
          if (d < sd) { sd = d; spot = { x, y }; }
        }
        if (spot) {
          w.x = spot.x + 0.5; w.y = spot.y + 0.5; w.path = null; w.pathI = 0;
          // a march in progress re-plans from the new footing (a nulled path
          // reads as "arrived" to the move task, which would eat the order)
          if (w.task && w.task.type === 'move' && w.task.x != null) Units.setPath(w, w.task.x, w.task.y);
        }
      }
    }
    if (b.owner === 'P' && S.stats) {   // arcade tally: every raising scores
      if (b.key === 'wall' || b.key === 'gate') S.stats.walls = (S.stats.walls || 0) + 1;
      else S.stats.built = (S.stats.built || 0) + 1;
    }
    if (b.owner === 'P') {
      const lv = this.lv(b);
      G.reveal(b.x, b.y, lv.vision || 4);   // finished at last — the view opens up
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
    // ORIGIN CARDS: "N free units when you first build X" kickers fire here
    if (window.Cards) Cards.onBuildFinish(b.owner, b);
  },

  // any of the OWNER'S villagers currently working this site (construction/upgrade/repair)?
  hasWorker(b) {
    return S.units.some(u => u.owner === b.owner && u.task && u.task.type === 'build' && u.task.id === b.id);
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
    const next = d.levels[b.level];
    if (!next) return { ok: false, why: 'No upgrades' };   // single-tier buildings (War Camp)
    if (b.construction || b.upgrading) return { ok: false, why: 'Busy' };
    if (b.wallUp > 0) return { ok: false, why: 'Reinforcing walls — Town Center busy' };
    if (b.key !== 'tc') {
      const tc = this.tcOf(b.owner);
      if (!tc || tc.level < b.level + 1)
        return { ok: false, why: `Needs Town Center Lv ${b.level + 1}` };
    }
    const res = b.owner === 'P' ? S.res : S.ai.res;
    if (!this.canAfford(next.cost, res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true, cost: next.cost };
  },

  // upgrade time for a building going from its current level to the next. Resource
  // stations (farm/lodge/lumber/quarry) take deliberately longer to level while a
  // villager works it: DOUBLE the base time L1→L2, and DOUBLE AGAIN L2→L3.
  upgradeTime(b) {
    const d = this.def(b.key);
    let t = d.levels[b.level].time;
    if (d.needsWorker) t *= (b.level >= 2 ? 4 : 2);
    return t;
  },
  upgrade(b) {
    const c = this.canUpgrade(b);
    if (!c.ok) return false;
    if (!this.aiAct(b.owner)) return false;
    const d = this.def(b.key);
    this.pay(d.levels[b.level].cost, b.owner === 'P' ? S.res : S.ai.res);
    b.upgrading = this.upgradeTime(b);
    b.upgTotal = b.upgrading;   // remembered so the progress bar knows the full span
    if (b.owner === 'P') {
      /* EVERY HAND ON THE SCAFFOLD. Upgrades need a villager on site, same as
         construction — and a station's OWN crew are the obvious hands, since
         production is paused for the whole upgrade anyway (`dailyProduction`
         skips a building that's upgrading). A two-hand camp used to send one
         worker to build and leave the other standing beside it doing nothing
         at all. Now both down tools, both build — every builder on site ticks
         the works, so two hands raise it in half the time — and both go back
         to the seam the moment it's done (see finishUpgrade → resumeCrew). */
      const crew = S.units.filter(u => u.owner === 'P' && u.task &&
        u.task.type === 'work' && u.task.id === b.id);
      let hands = 0;
      for (const w of crew) {
        Units.assignBuild(w, b);        // a hand already on site "paths" nowhere — still a builder
        if (w.task && w.task.type === 'build') { w.task.resumeWork = true; hands++; }
      }
      if (hands) {
        G.log(`${d.name} upgrading to Lv ${b.level + 1} — ` +
          (hands > 1 ? `both hands down tools to build it` : 'the worker downs tools to build it'));
      } else if (this.hasWorker(b)) {
        G.log(`${d.name} upgrading to Lv ${b.level + 1}`);   // someone is already on it
      } else {
        const v = Units.nearestIdleVillager(b.x, b.y);
        if (v) Units.assignBuild(v, b);
        if (v && v.task && v.task.type === 'build') G.log(`${d.name} upgrading to Lv ${b.level + 1} — a villager heads over`);
        else G.log(`${d.name} upgrade needs a builder — tap a villager, then the building`, true);
      }
    }
    return true;
  },

  /* BACK TO THE SEAM — every hand that downed tools to raise this station
     returns to its post, up to the station's crew cap. It lives here rather
     than in the builder's own tick because with two builders only ONE of them
     crosses the finish line; the other would find the works already done and
     simply be let go. Which of them got there first shouldn't decide who keeps
     their job. Returns how many went back. */
  resumeCrew(b) {
    if (b.owner !== 'P' || !this.def(b.key).needsWorker) return 0;
    const cap = this.maxWorkers(b);
    let n = this.workersAssigned(b), back = 0;
    for (const u of S.units) {
      if (u.owner !== 'P' || !u.task || u.task.type !== 'build' || u.task.id !== b.id) continue;
      if (!u.task.resumeWork) continue;
      if (n >= cap) { u.task = null; continue; }
      u.task = { type: 'work', id: b.id }; n++; back++;
    }
    return back;
  },

  finishUpgrade(b) {
    b.upgrading = 0;
    b.level++;
    this.resumeCrew(b);
    if (b.owner === 'P' && S.stats) S.stats.upgrades = (S.stats.upgrades || 0) + 1;
    const lv = this.lv(b);
    b.maxhp = lv.hp; b.hp = lv.hp;
    if (b.owner === 'P') {
      G.log(`${this.def(b.key).name} reached Lv ${b.level}!`);
      if (lv.vision) G.reveal(b.x, b.y, lv.vision);
    }
  },

  /* training queue: entries { unit, t } (days remaining) */
  // higher-level training buildings hold a longer queue: 3 / 4 / 5
  queueCap(b) { return 2 + b.level; },
  canTrain(b, unitKey) {
    const d = this.def(b.key);
    const spec = d.train && d.train[unitKey];
    if (!spec) return { ok: false, why: '?' };
    if (b.construction) return { ok: false, why: 'Under construction' };
    if (b.upgrading) return { ok: false, why: 'Upgrading — training paused' };
    if (b.wallUp > 0) return { ok: false, why: 'Reinforcing walls — Town Center busy' };
    if (unitKey === 'villager' && b.owner === 'P' && S.plague && S.plague.until && S.day < S.plague.until)
      return { ok: false, why: `Plague — village recovering (${Math.ceil(S.plague.until - S.day)}d)` };
    if (unitKey === 'villager' && b.owner === 'P' && S.plague && S.plague.until && S.day < S.plague.until)
      return { ok: false, why: `Plague — village recovering (${Math.ceil(S.plague.until - S.day)}d)` };
    if (spec.reqLevel && b.level < spec.reqLevel) return { ok: false, why: `Needs Lv ${spec.reqLevel}` };
    if (b.queue.length >= this.queueCap(b)) return { ok: false, why: 'Queue full' };
    if (b.owner === 'P' && Units.popUsed('P') + b.queue.length >= Bld.popCap('P'))
      return { ok: false, why: 'Population cap — build houses' };
    const res = b.owner === 'P' ? S.res : S.ai.res;
    // ORIGIN CARDS: the Ironhand's soldiers come cheaper
    const cost = window.Cards ? Cards.trainCost(b.owner, unitKey, spec.cost) : spec.cost;
    if (!this.canAfford(cost, res)) return { ok: false, why: 'Not enough resources' };
    return { ok: true, cost };
  },

  train(b, unitKey) {
    const c = this.canTrain(b, unitKey);
    if (!c.ok) return false;
    if (!this.aiAct(b.owner)) return false;
    const spec = this.def(b.key).train[unitKey];
    this.pay(c.cost, b.owner === 'P' ? S.res : S.ai.res);
    let time = spec.time;
    if (b.owner === 'P' && S.trainDiscount > 0) {   // the cache's work songs: next 5 recruits at half time
      time *= 0.5; S.trainDiscount--;
      if (S.trainDiscount === 0) G.log('🎶 The last work song fades — training returns to its usual pace.');
    }
    b.queue.push({ unit: unitKey, t: time });
    return true;
  },

  popCap(owner) {
    let cap = 0;
    for (const b of this.list(owner))
      if (this.done(b)) cap += this.lv(b).pop || 0;
    // the Town Center sets a hard ceiling — houses only help up to it
    const tc = this.tcOf(owner);
    const ceil = tc ? CFG.TC_POP_CAP[tc.level - 1] : CFG.TC_POP_CAP[0];
    return Math.min(cap, ceil);
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

  /* ---- Trading Post: any resource for any other (see CFG.TRADE) ---- */
  tradeSpec(b) { return CFG.TRADE.levels[Math.min(b.level, CFG.TRADE.levels.length) - 1]; },
  /* THE DEAL for one caravan: what it hauls out (`pay` of `payRes`) and what it
     brings back (`get` of `needRes`). Three directions, three rates — see the
     CFG.TRADE note for why `buy` is bounded by `swap`. Returns null for a pair
     that isn't a trade at all (same resource in and out, unknown resource). */
  tradeDeal(b, needRes, payRes) {
    const s = b && b.key === 'trade' && this.tradeSpec(b);
    if (!s || !needRes || !payRes || needRes === payRes) return null;
    if (CFG.TRADE.goods.indexOf(needRes) < 0 || CFG.TRADE.goods.indexOf(payRes) < 0) return null;
    // goods → gold: the old caravan, at the old poor rate
    if (needRes === 'gold') return { pay: s.input, get: Math.floor(s.input * s.gold) };
    // gold → goods: the load is the gold a full caravan of goods would earn
    if (payRes === 'gold') {
      const load = Math.max(1, Math.round(s.input * s.gold));
      return { pay: load, get: Math.floor(load * s.buy) };
    }
    // goods → goods
    return { pay: s.input, get: Math.floor(s.input / s.swap) };
  },
  // can this Trading Post send a caravan out for `needRes`, paying `payRes`?
  canTrade(b, needRes, payRes) {
    if (!b || b.key !== 'trade' || !this.done(b) || b.upgrading) return { ok: false, why: 'Not ready' };
    const deal = this.tradeDeal(b, needRes, payRes);
    if (!deal) return { ok: false, why: 'Not a trade' };
    if (b.caravan) return { ok: false, why: 'A caravan is already out' };
    const bag = b.owner === 'P' ? S.res : S.ai.res;
    if ((bag[payRes] || 0) < deal.pay) return { ok: false, why: `Needs ${deal.pay} ${payRes}` };
    return { ok: true };
  },
  // spend the load now; the goods arrive when the caravan returns (Bld.update)
  startTrade(b, needRes, payRes) {
    if (!this.canTrade(b, needRes, payRes).ok) return false;
    if (!this.aiAct(b.owner)) return false;
    const spec = this.tradeSpec(b), deal = this.tradeDeal(b, needRes, payRes);
    const bag = b.owner === 'P' ? S.res : S.ai.res;
    bag[payRes] -= deal.pay;
    b.caravan = { need: needRes, pay: payRes, cost: deal.pay, amt: deal.get, t: spec.delay, total: spec.delay };
    return true;
  },
  // what a caravan (new shape, or a legacy resource→gold one) is bringing home
  caravanHaul(c) {
    if (!c) return null;
    // legacy saves: { res, gold } — a goods-for-gold run, already paid for
    return { need: c.need || 'gold', pay: c.pay || c.res, amt: c.amt != null ? c.amt : (c.gold || 0) };
  },

  /* continuous updates: construction/upgrade progress + training (measured in days) */
  update(dtDays) {
    for (const b of S.buildings) {
      // a Trading Post caravan is out — count it down and pay out on return
      if (b.caravan) {
        b.caravan.t -= dtDays;
        if (b.caravan.t <= 0) {
          const bag = b.owner === 'P' ? S.res : S.ai.res;
          const haul = this.caravanHaul(b.caravan);
          bag[haul.need] = (bag[haul.need] || 0) + haul.amt;
          if (b.owner === 'P') {
            G.log(`Caravan returns — +${haul.amt} ${this.resIcon(haul.need)} from the ${this.def(b.key).name}`);
            if (S.stats && haul.need === 'gold') S.stats.traded = (S.stats.traded || 0) + haul.amt;
          }
          b.caravan = null;
        }
      }
      if (b.construction > 0) {
        // EVERY site needs a villager builder on the ground — the rival's crews
        // no longer work off-screen. Its buildings rise under a real hammer
        // (see Units build task + AI.daily's crew dispatcher), so raiders can
        // cut the builder down and stop the work, exactly as happens to the
        // player. Ghost construction was a real fairness complaint.
        continue;
      }
      // village-wide wall reinforcement ties up the Town Center until it's done
      if (b.wallUp > 0) {
        b.wallUp -= dtDays;
        if (b.wallUp <= 0) this.finishWallUpgrade(b);
      }
      if (b.queue.length && !b.upgrading && !(b.wallUp > 0)) {   // level-up / wall works pause the training yard
        b.queue[0].t -= dtDays;
        if (b.queue[0].t <= 0) {
          const item = b.queue.shift();
          const naval = !!CFG.UNITS[item.unit].naval;
          const spot = (naval
            ? MapGen.findNear(b.x, b.y, 3, (x, y) => Path.passable(x, y, b.owner, 'water') && !Bld.at(x, y))
            : MapGen.findNear(b.x, b.y + Bld.size(b.key), 3, (x, y) => Path.passable(x, y) && !Bld.at(x, y)))
            || { x: b.x, y: b.y + 1 };
          const nu = Units.spawn(item.unit, b.owner, spot.x, spot.y);
          if (b.owner === 'P') {
            G.log(`${CFG.UNITS[item.unit].name} ready`);
            if (S.stats) S.stats.trained++;
          }
          // the rival's fresh fishing boats put their nets straight out
          if (b.owner === 'A' && nu.kind === 'fishboat') {
            const fs = MapGen.findNear(b.x, b.y, 5, (x, y) => Units.canFish(x, y));
            if (fs) Units.assignFish(nu, fs.x, fs.y);
          }
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
    // THE RIVAL'S WORKFORCE IS REAL NOW: its worker buildings no longer run at
    // phantom full crew — they draw hands from its LIVING villagers, one villager
    // one crew slot. Hands are dealt round-robin, one at a time across the
    // stations, so farms, camps and quarries all stay manned in proportion (a
    // human spreads their villagers the same way). Its income curve now
    // resembles a village that trains workers one at a time, and killing its
    // villagers cuts its production exactly like it cuts yours.
    let aiCrew = null;
    if (owner === 'A') {
      // a hand out on a build site isn't at a station — construction costs the
      // rival production attention exactly as it costs the player
      let pool = S.units.reduce((n, u) => n + (u.owner === 'A' && Units.isVillager(u) &&
        !(u.task && u.task.type === 'build') ? 1 : 0), 0);
      aiCrew = {};
      const stations = this.list('A').filter(b =>
        this.done(b) && !b.upgrading && this.def(b.key).needsWorker && this.lv(b).out);
      /* DEMAND-DRIVEN CREWS. Hands used to be dealt round-robin, so the town
         produced a flat mix whatever it actually needed — and a rival would sit
         on ten thousand food with an empty quarry, unable to afford the stone
         for a wall tier, a tower or a workshop. A real player moves people to
         what the town is SHORT of. Each station is scored by the shortfall of
         what it produces (counting what's being saved for), and the scarcer the
         resource the sooner it gets the next hand. Round-robin remains the
         tie-break, so a balanced town still spreads out. */
      const goal = (S.ai && S.ai.goal && S.ai.goal.cost) || {};
      const BASELINE = { food: 260, wood: 300, stone: 260, gold: 120 };
      // a PROJECTION of the stores, credited as each hand is placed, so the
      // next hand sees the town a little less short of what that one will
      // bring in — this is what spreads the crew instead of piling everyone
      // onto whichever resource happens to be lowest today
      const proj = {};
      for (const k in S.ai.res) proj[k] = S.ai.res[k] || 0;
      const shortOf = (k) => {
        const want = (BASELINE[k] || 200) + (goal[k] || 0);
        return Math.max(0, want - (proj[k] || 0)) / Math.max(1, want);   // 0 = flush, 1 = empty
      };
      const stationNeed = (b) => {
        const out = this.lv(b).out || {};
        let n = 0;
        for (const k in out) n = Math.max(n, shortOf(k));
        return n;
      };
      while (pool > 0) {
        const open = stations.filter(b => (aiCrew[b.id] || 0) < this.maxWorkers(b));
        if (!open.length) break;
        // one hand to the neediest station with room; crew size breaks ties, so
        // an empty station is manned before a second hand joins another
        open.sort((a, b2) => (stationNeed(b2) - stationNeed(a)) ||
          ((aiCrew[a.id] || 0) - (aiCrew[b2.id] || 0)));
        const pick = open[0];
        aiCrew[pick.id] = (aiCrew[pick.id] || 0) + 1;
        pool--;
        const out = this.lv(pick).out || {};   // credit a season's worth to the projection
        for (const k in out) proj[k] = (proj[k] || 0) + out[k] * 30;
      }
    }
    for (const b of this.list(owner)) {
      if (!this.done(b) || b.upgrading) continue;
      const out = this.lv(b).out;
      if (!out) continue;
      // worker buildings produce PER VILLAGER: stationed crew for the player,
      // dealt from the living-villager pool for the rival
      let crew = 1;
      if (this.def(b.key).needsWorker) {
        crew = owner === 'P' ? Math.min(this.workersActive(b), this.maxWorkers(b))
                             : (aiCrew[b.id] || 0);
        if (!crew) continue;
      }
      const mult = crew * this.nearBonus(b) * tcBoost * modeMult *
        (window.Cards ? Cards.prodMult(owner, b) : 1);   // ORIGIN CARDS: Harvest Lord farms
      for (const k in out) res[k] += out[k] * mult;
    }
    if (window.Cards) Cards.dailyExtras(owner, res);      // ORIGIN CARDS: Tradewind trickle
  },

  // remove a building and leave rubble behind (buildable like any depleted tile)
  removeToRuin(b) {
    S.buildings.splice(S.buildings.indexOf(b), 1);
    this._block = null;
    const sz = this.size(b.key);
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      const idx = MapGen.idx(b.x + dx, b.y + dy);
      if (S.map.terrain[idx] === T.WATER) {
        // a broken dock washes away — open water again, no rubble
        R.updateTile(b.x + dx, b.y + dy);
      } else {
        S.map.terrain[idx] = T.RUIN;
        if (S.map.resAmount) S.map.resAmount[idx] = 0;
        G.scheduleRevert(idx);
        R.updateTile(b.x + dx, b.y + dy);
      }
    }
    for (const u of S.units) if (u.tBld === b.id) u.tBld = 0;
    if (UI.sel && UI.sel.type === 'bld' && UI.sel.id === b.id) UI.deselect();
  },

  damage(b, amt) {
    b.hp -= amt;
    // ring the rival's town alarm — idle soldiers converge (see AI.daily)
    if (b.owner === 'A' && S.ai) S.ai.alarm = { x: b.x, y: b.y, day: S.day };
    if (b.hp <= 0) {
      const name = this.def(b.key).name, owner = b.owner, key = b.key;
      this.removeToRuin(b);
      if (owner === 'P') {
        S.breachedP = true;   // the line is broken — positive specials may now answer (G.positiveGate)
        G.log(`${name} destroyed!`, true);
        if (key === 'tc') G.end(false, 'Your Town Center was destroyed.');
      } else if (owner === 'A') {
        G.log(`Rival ${name} destroyed!`);
        if (S.stats) S.stats.razed++;
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
  forts(owner) {
    owner = owner || 'P';
    return S.buildings.filter(b => b.owner === owner && (b.key === 'wall' || b.key === 'gate'));
  },
  // the rival reinforces its whole ring a tier at once (mirrors the player's, but
  // the chief simply pays and it lands — no multi-day masons animation to track on
  // the AI's hall). Gated by the same TC-tier requirement, so it can't outrun tech.
  aiWallUpgradeCost() {
    const lv = (S.ai.wallLevel || 1), out = {};
    for (const b of this.forts('A')) {
      const cost = CFG.BUILDINGS[b.key].levels[lv].cost;
      for (const k in cost) out[k] = (out[k] || 0) + cost[k];
    }
    return out;
  },
  aiCanUpgradeWalls() {
    const lv = (S.ai.wallLevel || 1);
    if (lv >= 3) return false;
    const tc = this.tcOf('A');
    if (!tc || tc.level < lv + 1) return false;              // needs the next TC tier, like the player
    if (!this.forts('A').length) return false;
    const cost = this.aiWallUpgradeCost();
    if (!this.canAfford(cost, S.ai.res)) return false;
    return cost;
  },
  aiUpgradeWalls() {
    const cost = this.aiCanUpgradeWalls();
    if (!cost) return false;
    if (!this.aiAct('A')) return false;
    this.pay(cost, S.ai.res);
    S.ai.wallLevel = (S.ai.wallLevel || 1) + 1;
    for (const b of this.forts('A')) {
      const lv = CFG.BUILDINGS[b.key].levels[S.ai.wallLevel - 1];
      b.hp = Math.max(1, Math.round(lv.hp * (b.hp / b.maxhp)));
      b.maxhp = lv.hp;
      b.level = S.ai.wallLevel;
    }
    return true;
  },

  /* RE-FACING THE RING, SECTION BY SECTION. Upgrading the whole ring at once is
     the player's move — they pay for every section in one go. A rival that has
     ringed its town can never afford that (thirty sections of dressed stone is
     a fortune), so its wall tier never moved off sticks-and-grass all game.
     A real village re-faces its wall a stretch at a time, starting with the
     side it keeps getting hit from. Returns true if any section was re-faced. */
  aiRefaceWalls(batch) {
    const ai = S.ai, tc = this.tcOf('A');
    if (!tc) return false;
    const target = Math.min(3, tc.level);            // same tech gate as the player
    const forts = this.forts('A').filter(b => (b.level || 1) < target);
    if (!forts.length) return false;
    const hit = (ai.memory && ai.memory.hitFlank) || null;
    const cx = this.cx(tc), cy = this.cy(tc);
    // the threatened flank first, gates before plain wall (a gate is the way in)
    forts.sort((a, b) => {
      const face = (f) => hit ? -((Math.sign(f.x - cx) === hit.x ? 1 : 0) + (Math.sign(f.y - cy) === hit.y ? 1 : 0)) : 0;
      return (face(a) - face(b)) || ((b.key === 'gate' ? 1 : 0) - (a.key === 'gate' ? 1 : 0)) || ((a.level || 1) - (b.level || 1));
    });
    let done = 0;
    for (const b of forts) {
      if (done >= (batch || 4)) break;
      const nextLv = (b.level || 1) + 1;
      const cost = CFG.BUILDINGS[b.key].levels[nextLv - 1].cost;
      if (!this.canAfford(cost, ai.res)) break;
      // never re-face out of the war chest: the hall tier is what unlocks the
      // workshop, the engines and the veteran troops, and it must come first
      let raidsGoal = false;
      for (const k in cost) if (((ai.res[k] || 0) - cost[k]) < ((ai.goal && ai.goal.cost[k]) || 0)) raidsGoal = true;
      if (raidsGoal) break;
      this.pay(cost, ai.res);
      const lv = CFG.BUILDINGS[b.key].levels[nextLv - 1];
      b.hp = Math.max(1, Math.round(lv.hp * (b.hp / b.maxhp)));
      b.maxhp = lv.hp;
      b.level = nextLv;
      done++;
    }
    if (!done) return false;
    // new sections are laid at the tier the ring has actually reached
    let low = 3;
    for (const f of this.forts('A')) low = Math.min(low, f.level || 1);
    ai.wallLevel = low;
    return true;
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
    const tc = this.tcOf('P');
    if (tc && tc.wallUp > 0) return { ok: false, why: 'Walls already reinforcing' };
    if (!this.forts().length) return { ok: false, why: 'No walls built' };
    if (!tc || tc.level < S.wallLevel + 1)
      return { ok: false, why: `Needs Town Center Lv ${S.wallLevel + 1}` };
    const cost = this.wallUpgradeCost();
    if (!this.canAfford(cost)) return { ok: false, why: 'Not enough resources' };
    return { ok: true, cost };
  },
  // village-wide reinforcement isn't instant — the masons work for days while
  // the Town Center manages the effort (no training / no upgrades until done).
  wallUpgradeDays() {
    const i = (S.wallLevel || 1) - 1;
    return (CFG.WALL_UPGRADE_DAYS && CFG.WALL_UPGRADE_DAYS[i]) || 2;
  },
  upgradeWalls() {
    const c = this.canUpgradeWalls();
    if (!c.ok) return false;
    const tc = this.tcOf('P');
    if (!tc) return false;
    this.pay(c.cost, S.res);
    const days = this.wallUpgradeDays();
    tc.wallUp = days;
    tc.wallUpTotal = days;                       // progress bar span
    tc.wallUpTarget = (S.wallLevel || 1) + 1;    // the level being built toward
    G.log(`⚒ Masons set to work — every wall & gate reinforcing to Lv ${tc.wallUpTarget}. The Town Center is busy (${Math.ceil(days)}d).`);
    return true;
  },
  finishWallUpgrade(tc) {
    const target = tc.wallUpTarget || (S.wallLevel || 1) + 1;
    tc.wallUp = 0; tc.wallUpTotal = 0; tc.wallUpTarget = 0;
    S.wallLevel = target;
    if (S.stats) S.stats.upgrades = (S.stats.upgrades || 0) + 1;   // village-wide, still one feat
    for (const b of this.forts()) {
      const lv = CFG.BUILDINGS[b.key].levels[S.wallLevel - 1];
      b.hp = Math.max(1, Math.round(lv.hp * (b.hp / b.maxhp)));
      b.maxhp = lv.hp;
      b.level = S.wallLevel;
    }
    G.log(`⚒ Every wall and gate reinforced to Lv ${S.wallLevel}!`);
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
