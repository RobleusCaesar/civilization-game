"use strict";
/* Building placement, construction, upgrades, training, daily production. */

const Bld = {
  _block: null,    // transient movement-blocking grid (walls/gates)

  /* ---- WHAT STANDS IN THE WAY (tests/buildings-block.mjs) ----
     A building is SOLID: nobody — player, rival, barbarian or wild animal —
     walks through a hall, a tower or a house; they go around, and a village
     becomes real ground to navigate. The ONLY exceptions are the worker
     PLOTS (farm, hunter's lodge, lumber camp, quarry): their crews stand ON
     the plot itself (the 'work' task in units.js walks the villager onto
     b.x/b.y and holds it there), so those must stay walkable or they could
     never be worked at all. That is why the rule keys off `needsWorker`
     rather than a hand-listed set — the two facts are the same fact. */
  solid(key) { const d = this.def(key); return !!d && !d.needsWorker; },

  rebuildBlock() {
    // bumped on every rebuild — derived answers that depend on where the walls
    // are (Bld.gateOutside) cache against it instead of recomputing per frame
    this._blockGen = (this._blockGen || 0) + 1;
    this._block = new Uint8Array(CFG.W * CFG.H);
    for (const b of S.buildings) {
      // a building still being RAISED isn't solid yet — builders (and anyone
      // else) walk through the gap until the day it finishes. This is what
      // lets a wall line across a choke be built at all: the far sections
      // stay reachable through the unbuilt near ones (tests/work-order.mjs).
      // Planning code that cares about INTENT (seal checks) treats sites as
      // solid separately — AI.townOut, Terraform.digWouldSeal.
      if (b.construction > 0) continue;
      if (b.key === 'wall') this._block[MapGen.idx(b.x, b.y)] = 1;
      // A GATE WITH ITS BRIDGE UP IS A WALL (tests/drawbridge.mjs) — code 1,
      // which blocks EVERYONE, its owner included. That is the whole point of
      // the lever: you shut your own door and take the consequences.
      else if (b.key === 'gate') this._block[MapGen.idx(b.x, b.y)] =
        b.raised ? 1 : (b.owner === 'P' ? 2 : 3);
      else if (this.solid(b.key)) {
        // every tile of the footprint, so the 2×2 Town Center is solid whole
        const sz = this.size(b);
        for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++)
          if (MapGen.inB(b.x + dx, b.y + dy)) this._block[MapGen.idx(b.x + dx, b.y + dy)] = 4;
      }
    }
  },
  blockAt(x, y) {
    if (!this._block) this.rebuildBlock();
    return this._block[MapGen.idx(x, y)];
  },
  // a WALL or GATE stands here — what the fortification auto-tiling asks, so
  // an ordinary solid building never makes a wall grow a stub toward it
  fortAt(x, y) { const c = this.blockAt(x, y); return c === 1 || c === 2 || c === 3; },

  /* ---- EVERY GATE WORKS (tests/drawbridge.mjs) ----
     The drawbridge began as the third tier's lever, and the playtest verdict
     was that working it is the good part — an immediate hand on the board.
     So every FINISHED gate now opens and closes, each tier with its own
     mechanism: L1 swings its two door leaves outward, L2 raises and drops a
     wood-and-iron portcullis, L3 keeps the drawbridge on chains. `b.raised`
     means the same thing at every tier — THE GATE IS SEALED (block code 1,
     which shuts out the owner too; that is what makes the lever a decision)
     — the mechanism is only what the seal LOOKS like.

     A gate still raising or upgrading has no working door yet. What stays
     the third tier's alone is the DECK: the winch, the chains and the
     gallery to hang them from are exactly what that tier buys, and only a
     drawbridge spans the ditch beyond the gate (canDrawbridge, below). */
  canGateToggle(b) {
    return !!b && b.key === 'gate' &&
      !(b.construction > 0) && !(b.upgrading > 0);
  },
  canDrawbridge(b) {
    return this.canGateToggle(b) && b.level >= 3;
  },
  bridgeRaised(b) { return !!(b && b.key === 'gate' && b.raised); },

  /* ---- THE DECK IS A CROSSING (tests/drawbridge.mjs) ----
     A drawbridge exists to span the ditch in front of the gate. Lowered, it
     makes the ONE TILE it reaches across walkable — that is the whole point,
     and it is why the deck is a full tile long (Sprites' DB_LEN). Raised, the
     crossing goes with it: the gate's own tile turns to block code 1 and the
     moat beyond it is water again, so nobody passes, friend or foe.

     Deliberately owner-AGNOSTIC. Anyone standing on a lowered deck may walk
     across it; what they cannot do is walk through the gate itself unless it
     is theirs (code 2/3). So lowering the bridge lets your army pour out —
     and lets a raid reach your gate to hammer on it. That is the decision.

     Built lazily against _blockGen rather than inside rebuildBlock, because
     working out which way a gate faces needs the block grid to already exist
     (gateOutside → gateVerticalAt → fortAt) and building it from inside the
     rebuild would recurse. */
  _deck: null,
  _deckGen: -1,
  // the single tile a lowered deck reaches across: one step OUTWARD
  drawbridgeSpan(b) {
    if (!this.canDrawbridge(b)) return null;
    const vert = window.R && R.gateVerticalAt ? R.gateVerticalAt(b.x, b.y) : false;
    const d = this.gateOutside(b);
    const x = b.x + (vert ? d : 0), y = b.y + (vert ? 0 : d);
    return MapGen.onBoard(x, y) ? { x, y } : null;
  },
  rebuildDeck() {
    if (!this._block) this.rebuildBlock();
    this._deck = new Uint8Array(CFG.W * CFG.H);
    for (const b of S.buildings) {
      if (b.key !== 'gate' || b.raised || !this.canDrawbridge(b)) continue;
      const t = this.drawbridgeSpan(b);
      if (t) this._deck[MapGen.idx(t.x, t.y)] = 1;
    }
    this._deckGen = this._blockGen;
  },
  deckAt(x, y) {
    // force the block grid FIRST: _blockGen is bumped inside rebuildBlock, so
    // comparing generations while _block is still null reads a stale deck.
    if (!this._block) this.rebuildBlock();
    if (!this._deck || this._deckGen !== this._blockGen) this.rebuildDeck();
    return this._deck[MapGen.idx(x, y)];
  },

  /* ---- WHICH SIDE OF A GATE IS THE OUTSIDE? (tests/drawbridge.mjs) ----
     A gate opens OUTWARD — a drawbridge dropping into the courtyard, or door
     leaves swinging into it, read as the castle opening backwards. The
     answer used to be a ground flood (barriers, hall side, enclosure), and
     it still guessed wrong on part-built rings the player could see plainly.
     The simple rule replaced it (user direction): OUTWARD IS AWAY FROM THE
     TOWN'S OWN ANCHOR — the HALL, or the nearest own finished WAR CAMP when
     that camp is nearer to the gate than the hall is. A forward gate belongs
     to the war camp that planted it, and its outside faces the enemy, not
     home. Pure geometry along the passage axis; a gate dead level with its
     anchor keeps the old default.

     Returns +1 (south for a gate in an east-west wall, east for one in a
     north-south wall) or -1 (north / west). Owner-agnostic. Cached against
     _blockGen, so a war camp raised later re-aims the gates it should. */
  _outDir: {},
  gateOutside(b) {
    if (!b || b.key !== 'gate') return 1;
    // build the block grid FIRST: gateVerticalAt reads it, and a rebuild
    // bumps the generation — read it after and we would stamp the cache
    // with a number already out of date, recomputing on every call
    if (!this._block) this.rebuildBlock();
    const gen = this._blockGen || 0;
    const c = this._outDir[b.id];
    if (c && c.gen === gen) return c.dir;
    const dir = this._computeOutside(b);
    this._outDir[b.id] = { gen, dir };
    return dir;
  },
  _computeOutside(b) {
    const vert = window.R && R.gateVerticalAt ? R.gateVerticalAt(b.x, b.y) : false;
    const tc = this.tcOf(b.owner);
    let anchor = tc;
    let ad = tc ? Math.hypot(b.x + 0.5 - this.cx(tc), b.y + 0.5 - this.cy(tc)) : 1e9;
    for (const o of S.buildings) {
      if (o.owner !== b.owner || o.key !== 'warcamp' || o.construction > 0) continue;
      const d = Math.hypot(b.x + 0.5 - this.cx(o), b.y + 0.5 - this.cy(o));
      if (d < ad) { ad = d; anchor = o; }
    }
    if (!anchor) return 1;                     // no hall, no camp: the old default
    const delta = vert ? (b.x + 0.5 - this.cx(anchor)) : (b.y + 0.5 - this.cy(anchor));
    return delta >= 0 ? 1 : -1;                // away from the anchor
  },
  toggleDrawbridge(b) {
    if (!this.canGateToggle(b)) return false;
    b.raised = !b.raised;
    this._block = null;
    // shutting the gate on somebody standing in the passage would wedge them
    // in solid ground — they step clear, exactly as a finished building's
    // footprint clears itself
    if (b.raised) this.stepOffFootprint(b);
    if (b.owner === 'P')
      G.log(b.level >= 3
        ? (b.raised ? '⛓ The drawbridge is hauled up — the gate is shut fast'
                    : '⛓ The drawbridge is lowered — the gate stands open')
        : b.level === 2
          ? (b.raised ? '⛓ The portcullis drops — the gate is shut fast'
                      : '⛓ The portcullis is winched up — the gate stands open')
          : (b.raised ? '🚪 The gates are barred shut'
                      : '🚪 The gates swing open'));
    return true;
  },

  /* Anyone standing on a footprint that just turned SOLID steps off it, ties
     broken toward home so a builder finishing a wall under its own feet ends
     on the town side rather than sealed out (tests/work-order.mjs). Shared by
     Bld.finish and the drawbridge, which seals its own tile the same way. */
  stepOffFootprint(b) {
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
  },

  /* ---- THE SEAM IS CLAIMED, NOT BUILT (tests/gold-mine.mjs) ----
     A gold seam has no button in the build menu. A villager walks out to it
     and the works go up around them for nothing — the price of a seam is the
     journey and holding the ground, not timber.

     And the LEVEL BELONGS TO THE SEAM. Whoever works it inherits whatever it
     has been raised to, so a mine you sank two thousand stone into is a prize
     the rival can take by clearing your miners off it — which is the whole
     point. Ownership therefore flips only when the current holder has NOBODY
     left on it: you cannot walk up and take a manned mine, you have to take
     the ground first.

     Owner-agnostic: the rival claims and loses seams by exactly this call. */
  seamAt(x, y) {
    return MapGen.inB(x, y) && S.map.terrain[MapGen.idx(x, y)] === T.GOLDORE;
  },
  // who is actually working this mine right now, whatever tribe they are
  mineHands(b, owner) {
    return S.units.filter(u => u.task && u.task.type === 'work' && u.task.id === b.id &&
      (owner === undefined || u.owner === owner)).length;
  },
  // can `owner` put a hand on the works standing here? (null = nothing to take)
  canClaimSeam(owner, x, y) {
    const b = this.at(x, y);
    if (!b || b.key !== 'mine') return { ok: true, why: '' };      // unclaimed seam
    if (b.owner === owner) return { ok: true, why: '' };
    return this.mineHands(b, b.owner) > 0
      ? { ok: false, why: 'Their miners hold it — clear them off first' }
      : { ok: true, why: '' };
  },
  /* Put `owner` on the seam at x,y and hand back the works. Returns null if
     the tile is not a seam, or if somebody else's hands are still on it. */
  claimSeam(owner, x, y) {
    if (!this.seamAt(x, y)) return null;
    let b = this.at(x, y);
    if (b && b.key !== 'mine') return null;                        // something else stands here
    if (!b) {
      b = this.place(owner, 'mine', x, y, { free: true, instant: true, noAutoAssign: true });
      if (b && owner === 'P') G.log('⛏ Gold seam claimed — the works go up');
      return b;
    }
    if (b.owner === owner) return b;
    if (this.mineHands(b, b.owner) > 0) return null;               // still held
    // TAKEN OVER, at whatever level it stands: nothing about the works
    // changes but whose banner is over them
    const was = b.owner;
    b.owner = owner;
    b.rally = null;
    this._block = null;
    if (owner === 'P') G.log(`⛏ The Lv ${b.level} gold mine is yours — the seam changes hands`, true);
    else if (was === 'P') G.log('⚠️ The rival has taken your gold mine!', true);
    return b;
  },
  /* THE WORKS ARE NOT A TARGET. A seam changes hands by clearing the miners
     off it, never by razing it — if a raid could level the shaft, the level
     the loser paid for would be destroyed rather than won, and "the level is
     agnostic to the team" would be a lie. Every target-picking path asks
     this, and Bld.damage refuses as a backstop. */
  attackable(b) { return !!b && b.key !== 'mine'; },
  /* IS THIS A TARGET FOR `owner`? Not "does it belong to the rival" — a
     BARBARIAN CAMP is owned by 'R' and is every bit as attackable, which is
     the whole point of making it a building you can pull down
     (tests/raider-camps.mjs). Keying the tap on `owner === 'A'` left a war
     party standing beside a camp being told ABOUT it, with no way to burn it:
     the order simply never issued. Every target tap goes through here now, so
     the two can never drift apart again. */
  foeBld(b, owner) { return !!b && b.owner !== owner && this.attackable(b); },

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
  /* FOOTPRINT — of a STANDING BUILDING, or of a key about to be placed.

     Pass a building and you get the footprint it was RAISED with (`b.sz`);
     pass a key and you get what a new one would claim today. The two are
     normally the same and deliberately may not be: when the primary works grew
     from 1×1 to 2×2, every barracks, range, stable, workshop, sappers' camp,
     trading post, war camp and dock already standing in somebody's save was
     placed on the old footprint, with neighbours packed tight against it. Had
     they all silently claimed a second row and column on load, they would have
     swallowed each other — a loaded town with buildings inside buildings, and
     no way to tell which was meant to be there.

     So an old building is GRANDFATHERED at the size it was built (loadJSON
     stamps LEGACY_SIZE where `sz` is absent) and anything raised from now on
     takes the current one. Non-destructive by construction: nothing moves,
     nothing is deleted, and the town the player left is the town they get
     back. The cost is cosmetic — an old save's barracks stays a small one
     beside a new large one — and it heals as they rebuild.

     Every INSTANCE call site passes the building, never `b.key`; that is the
     whole discipline this rests on (tests/footprint.mjs pins it). */
  size(k) {
    if (k && typeof k === 'object') {
      if (k.sz) return k.sz;
      const d = this.def(k.key); return (d && d.size) || 1;
    }
    const d = this.def(k); return (d && d.size) || 1;
  },
  /* what each key claimed BEFORE the primary works grew — the footprint a
     pre-migration save was written with. Only keys that differ need an entry;
     everything absent was, and still is, 1×1. */
  LEGACY_SIZE: { tc: 2, wonder: 3 },
  legacySize(key) { return this.LEGACY_SIZE[key] || 1; },
  cx(b) { return b.x + this.size(b) / 2; },       // footprint center (world units)
  cy(b) { return b.y + this.size(b) / 2; },
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
  reach(b) { return (this.size(b) - 1) * 0.5; },  // extra radius past the 1×1 norm
  covers(b, x, y) {
    const s = this.size(b);
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
  /* REINFORCING A SPAN IS A BUILD, NOT A PURCHASE (tests/bridge-resource-shore.mjs).
     It used to be instant: pay, and the timber crossing was a stone arch the
     same frame. It now works exactly like every other upgrade in the game —
     the stone is paid up front, the works stand on the bridge for
     CFG.BRIDGE.levels[lv].time DAYS, and a SAPPER has to be at them the whole
     time, the same hands that raised the level-1 crossing. The clock lives on
     the BRIDGE (br.upgrading / upTotal / upTo), not on the sapper's task, so
     progress survives the sapper being killed mid-span and a second sapper
     genuinely halves the work — the same convention buildings use. */
  canUpgradeBridge(br) {
    return !!br && br.owner === 'P' && !(br.upgrading > 0) && (br.level || 1) < 3 &&
      this.canAfford(CFG.BRIDGE.levels[br.level || 1].cost, S.res);
  },
  orderBridgeUpgrade(br) {
    if (!this.canUpgradeBridge(br)) return false;
    const next = CFG.BRIDGE.levels[br.level];
    this.pay(next.cost, S.res);            // player-only (UI); the AI doesn't upgrade spans
    br.upTo = br.level + 1;
    br.upgrading = br.upTotal = next.time || 2;
    // …and the nearest free sapper walks out to it, the way a laid building
    // site pulls the nearest idle villager (Bld.place)
    const s = Units.nearestIdleSapper(br.x, br.y, 'P');
    if (s && Units.assignTerraform(s, br.x, br.y, 'bridgeup'))
      G.log('Bridge works laid out — a sapper heads over');
    else
      G.log('Bridge works need a sapper — tap one, then the bridge', true);
    if (window.R && R.updateTile) R.updateTile(br.x, br.y);
    return true;
  },
  finishBridgeUpgrade(br) {
    br.level = br.upTo || (br.level + 1);
    br.upgrading = 0; br.upTotal = 0; br.upTo = 0;
    br.maxhp = CFG.BRIDGE.levels[br.level - 1].hp;
    br.hp = br.maxhp;   // the finished span is re-plated and whole
    if (br.owner === 'P') G.log('Bridge reinforced — Lv ' + br.level);
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
    if (!MapGen.onBoard(x, y)) return false;
    const t = S.map.terrain[MapGen.idx(x, y)];
    // grass and anything depleted or ruined is fair ground to build on. Fertile
    // soil (orchard/berry ground) is now a standing obstacle — clear it first,
    // or build on the grass beside it (a farm still draws its bonus from nearby)
    // …and a GOLD SEAM is buildable ground too — but only ever for the mine
    // that belongs on it (the onTerrain clamp in canPlace, tests/gold-mine.mjs)
    const buildable = t === T.GRASS ||
      t === T.STUMPS || t === T.PEBBLES || t === T.BARREN || t === T.RUIN || t === T.GOLDORE;
    if (!buildable) return false;
    if (this.at(x, y)) return false;
    if (this.ashAt(x, y)) return false;   // a burned building's footprint stays unbuildable while its ash cools
    return true;
  },

  // docks stand on open water: the body must be big enough to work, and the
  // pier needs a walkable shore tile beside it so villagers can build/repair it
  /* WHICH SIDE THE LAND IS ON. A dock stands on a 2×2 of open water with a
     walkable shore against one of its flanks — but WHICH flank varies with
     every coastline, and a jetty drawn into the water from the wrong edge is
     the whole reason the old sprite read as a confusing raft. Returns 'n', 'e',
     's' or 'w': the side the shore lies on, i.e. the end the deck is anchored
     at. Cached against _blockGen like the rest of the layout reads, since it
     only changes when the world does.

     Ties are broken N→S→W→E, and a dock with no walkable flank at all (its
     shore was dug away later) keeps its last honest answer of 'n' rather than
     flickering. */
  dockShore(b) {
    if (!this._block) this.rebuildBlock();
    if (this._dockGen !== this._blockGen) { this._dockGen = this._blockGen; this._dockAt = {}; }
    const hit = this._dockAt[b.id];
    if (hit) return hit;
    const sz = this.size(b);
    const sides = [
      ['n', 0, -1], ['s', 0, sz], ['w', -1, 0], ['e', sz, 0],
    ];
    let found = 'n';
    for (const [name, ox, oy] of sides) {
      let land = false;
      for (let k = 0; k < sz && !land; k++) {
        const x = b.x + (ox === -1 ? -1 : ox === sz ? sz : k);
        const y = b.y + (oy === -1 ? -1 : oy === sz ? sz : k);
        if (MapGen.inB(x, y) && Path.passable(x, y, b.owner)) land = true;
      }
      if (land) { found = name; break; }
    }
    this._dockAt[b.id] = found;
    return found;
  },

  dockSiteOk(x, y, owner) {
    owner = owner || 'P';
    /* THE WHOLE QUAY HAS TO FLOAT (tests/footprint.mjs). A dock is a primary
       work and stands on a 2×2 of open water now, so checking the anchor tile
       alone would let three quarters of it sit on dry land or inside another
       building. Derived from the def, never hard-coded: change the size and
       this follows. */
    const sz = this.size('dock');
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      const px = x + dx, py = y + dy;
      if (!MapGen.onBoard(px, py))
        return { ok: false, code: 'edge', why: 'Too close to the map edge' };   // the outer ring is off-map black void
      if (!MapGen.inB(px, py) || S.map.terrain[MapGen.idx(px, py)] !== T.WATER || this.at(px, py))
        return { ok: false, code: 'water', why: 'Docks are built on open water' };
    }
    // …and a walkable shore anywhere along the quay's edge, not just beside its
    // anchor tile — a 2×2 dock may touch land on any of its eight flanks
    let shore = false;
    for (let dy = 0; dy < sz && !shore; dy++) for (let dx = 0; dx < sz && !shore; dx++)
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx + ox, ny = y + dy + oy;
        if (nx >= x && nx < x + sz && ny >= y && ny < y + sz) continue;   // inside the quay itself
        if (MapGen.inB(nx, ny) && Path.passable(nx, ny, owner)) { shore = true; break; }
      }
    if (!shore) return { ok: false, code: 'shore', why: 'Needs a walkable shore beside it' };
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
      return { ok: false, code: 'water', why: `This water is too small (needs ${CFG.DOCK_MIN_WATER}+ tiles)` };
    return { ok: true };
  },

  // a would-be site whose ONLY anchor is a War Camp (out beyond the home settlement)
  // — used to tag forward outposts, which don't themselves anchor further building.
  _isOutpostSite(owner, key, x, y) {
    const mine = this.list(owner);
    const nearHome = mine.some(b => !b.outpost && b.key !== 'warcamp' &&
      Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
    if (nearHome) return false;
    // a station out on its own worked ground (or a seam) is a CLAIM, not a
    // second town: it stands there, but nothing may be anchored off it
    if (this.needsWorkedGround(key)) return true;
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

  /* ===== A STATION STANDS ON GROUND THAT WAS WORKED (tests/worked-ground.mjs) =====
     The economic spine of the game. A resource station may only be raised on
     ground its own resource was taken out of: a lumber camp on a stand you
     felled, a quarry on rock you broke, a farm on soil you picked bare, a
     lodge on a killing ground, a mine on a seam. Nowhere else — and pointedly
     never on ordinary grass.

     WHY: without it a village manufactures resources from nothing. Ten lumber
     camps on an empty meadow out-produce any forest, so wood, stone and bread
     stop being things on the map and become things you buy with wood, stone
     and bread. With it, every station is a claim on a real, finite piece of
     ground that had to be found, worked out by hand, and held — which is what
     makes a scarce map bite, sends the village out to explore, and forces it
     to garrison what it works. The gold seam has always played by this rule;
     this is the same rule for everything else.

     DENSITY DOES NOT MATTER, only that the tile is spent: `T.STUMPS`,
     `T.PEBBLES` and `T.BARREN` are what the gather code leaves behind when a
     tile's stock runs out, and a sapper's `clear` leaves GRASS, so clearing is
     no shortcut — the resource has to actually be taken.

     OWNER-AGNOSTIC, and it is `canPlace` that enforces it, so the chief's own
     plotting obeys it through exactly the same call the player's build menu
     makes. Buildings already standing are never re-checked: an older save's
     stations keep their ground. */
  stationGround(key, x, y) {
    const d = this.def(key);
    if (!d) return { ok: true };
    if (d.onWorked != null) {
      if (S.map.terrain[MapGen.idx(x, y)] !== d.onWorked)
        return { ok: false, why: d.whyGround || 'That ground was never worked' };
    }
    if (d.onHunted && !G.huntedAt(x, y))
      return { ok: false, why: d.whyGround || 'No game has ever fallen here' };
    return { ok: true };
  },
  // does this key care where it stands? (the build menu asks, to explain itself)
  needsWorkedGround(key) {
    const d = this.def(key);
    return !!(d && (d.onWorked != null || d.onHunted || d.onTerrain != null));
  },

  /* ---- NOBODY WORKS ANOTHER TRIBE'S YARD (tests/worked-ground.mjs) ----
     Worked-out ground is the only ground a station may stand on, and early in
     a run the only worked ground on the whole map may be the ENEMY'S. A real
     day-33 game had the chief plot a lumber camp on a stump inside the
     player's town — thirty-five tiles from its own hall, five from theirs,
     under three of their towers — and walk a villager the whole way to raise
     it. It was pulled down three days later, which is the giveaway: siting
     works where the other side can trivially burn them is the same class of
     mistake as the shooting gallery.

     The rule is narrow ON PURPOSE. Standing on worked ground is what lets a
     station skip the build-anchor rule (`onItsGround`) — this takes that free
     pass away inside somebody else's home ground, and nothing else. A War
     Camp may still be planted at the enemy's gate, and the military works it
     anchors are still legal: a forward base you must hold is a real siege, a
     lumber camp in their high street is not.

     FOG-HONEST both ways. The player's hall counts against the chief only once
     the chief has actually seen it (`AI.knownPlayerTC`, its own memory), and
     the rival's counts against the player only once its tile is explored — so
     neither refusal can be read as a hint about where the other lives. */
  HOME_GROUND_R: 10,
  foreignHome(owner, x, y) {
    for (const b of S.buildings) {
      if (b.key !== 'tc' || b.owner === owner) continue;
      if (owner === 'A') { if (!AI.knownPlayerTC()) continue; }
      else if (!S.map.explored || !S.map.explored[MapGen.idx(b.x, b.y)]) continue;
      if (Math.hypot(x - this.cx(b), y - this.cy(b)) <= this.HOME_GROUND_R) return true;
    }
    return false;
  },

  /* THE ONE PLACEMENT TRUTH (tests/placement.mjs). Every consumer of "may a
     building stand here" asks THIS function — the placement grid's tinting,
     the ghost, the confirm re-validation, Bld.place itself, and the rival
     AI's plot/tryBuild — so the player and the chief can never disagree
     about what is buildable. Each refusal carries a machine-readable `code`
     beside its human `why`, so the UI can style states differently (amber
     for `cost`, nothing at all for `unexplored`) without string-matching.

     opts:
       noCost  — skip the resource check (the placement grid uses this: an
                 unaffordable spot is a DIFFERENT state from an unbuildable
                 one, and the player may scout ground they are saving for)
       noSeal  — skip the seal flood (the grid tint uses this; the ghost,
                 confirm and the AI's validate-on-pick all keep it — the
                 same validate-on-the-pick-never-the-scan rule AI.plot
                 follows, tests/wall-line.mjs) */
  canPlace(owner, key, x, y, opts) {
    opts = opts || {};
    const d = this.def(key);
    if (!d) return { ok: false, code: 'key', why: '?' };
    if (!MapGen.onBoard(x, y)) return { ok: false, code: 'edge', why: 'Off the map' };
    if (key === 'dock') {
      const site = this.dockSiteOk(x, y, owner);
      if (!site.ok) return site;
    } else {
      // every tile of the footprint must be buildable ground
      const s = this.size(key);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
        if (!this.tileFree(x + dx, y + dy))
          return this.ashAt(x + dx, y + dy)
            ? { ok: false, code: 'ash', why: 'Ashes still smoulder here' }
            : { ok: false, code: 'blocked', why: this._blockedWhy(x + dx, y + dy) };
      /* A SEAM IS FOR THE MINE, AND THE MINE IS FOR A SEAM (tests/gold-mine.mjs).
         Both halves matter: a mine sited on ordinary grass would be gold from
         nothing, and a house dropped on a seam would spend the map's rarest
         tile on a hut — so the clamp runs in both directions. */
      const seam = S.map.terrain[MapGen.idx(x, y)] === T.GOLDORE;
      if (d.onTerrain === T.GOLDORE && !seam)
        return { ok: false, code: 'needSeam', why: 'A Gold Mine is sunk on a gold seam — go and find one' };
      /* …and a PRIMARY WORK may not pave one over either. The mine is 1×1, so
         its own anchor tile is the whole of it; a 2×2 barracks dropped one
         tile off a seam would bury the map's rarest ground under a hut without
         ever standing on it (tests/footprint.mjs). Whole footprint, both ways. */
      let anySeam = false;
      for (let dy = 0; dy < s && !anySeam; dy++) for (let dx = 0; dx < s; dx++)
        if (S.map.terrain[MapGen.idx(x + dx, y + dy)] === T.GOLDORE) { anySeam = true; break; }
      if (anySeam && d.onTerrain !== T.GOLDORE)
        return { ok: false, code: 'seam', why: 'That is a gold seam — only a Gold Mine belongs there' };
      // …and every OTHER station stands on ground its own resource was worked
      // out of (tests/worked-ground.mjs). Owner-agnostic: the chief obeys it too.
      const gnd = this.stationGround(key, x, y);
      if (!gnd.ok) { gnd.code = gnd.code || 'ground'; return gnd; }
      /* NO ENEMY BUILDING HIDES IN THE MOUNTAIN'S SHADOW (tests/mountain.mjs):
         the extruded rock art covers the tiles just north of a range, and a
         rival or barbarian building seated there is INVISIBLE to the player —
         a reported day-57 game found a camp only by the sliver of tent
         peeking past the ridge. Enemy owners are hard-refused across the
         whole footprint; the PLAYER stays free — they can see their own
         ghost while placing, so hiding a building is a choice, not a trap. */
      if (owner !== 'P') {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
          if (MapGen.mtnShadow(x + dx, y + dy))
            return { ok: false, code: 'shadow', why: 'Hidden behind the mountain' };
      }
    }
    // TC-level gate (player only — the rival's scripted build order sets its own pace)
    if (owner === 'P' && d.reqTC) {
      const tc = this.tcOf('P');
      if (!tc || tc.level < d.reqTC)
        return { ok: false, code: 'reqTC', why: `Needs Town Center Lv ${d.reqTC}` };
    }
    if (owner === 'P') {
      const s = this.size(key);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
        if (!S.map.explored[MapGen.idx(x + dx, y + dy)])
          return { ok: false, code: 'unexplored', why: 'Unexplored' };
    }
    if (d.unique && this.list(owner).some(b => b.key === key)) return { ok: false, code: 'unique', why: 'Already built' };
    // capped structures (War Camp) — only so many forward bases in the field at once
    if (d.max && this.list(owner).filter(b => b.key === key).length >= d.max)
      return { ok: false, code: 'max', why: `Only ${d.max} ${d.name}${d.max > 1 ? 's' : ''} at a time` };
    // ANCHORS & the front line. Fortifications (walls/gates) and the freely-placed
    // War Camp may be raised anywhere explored. Everything else must sit within reach
    // of an ANCHOR: a home building (near the town) or a War Camp (the mini-TC of the
    // front). A forward OUTPOST — a building anchored only by a camp — does NOT itself
    // anchor, so the camp is a linchpin: raze it and the front-line base can't grow.
    const mine = this.list(owner);
    /* A STATION GOES WHERE ITS GROUND IS (tests/worked-ground.mjs). The nearest
       stand of timber may be twelve tiles out; the build-anchor rule would then
       forbid the camp on the very ground you just spent a fortnight felling —
       "I worked this out and now I can't build on it" is the worst possible
       answer. So a station standing on its own proper worked ground is placed
       freely, exactly as the Gold Mine is, and for exactly the same reason:
       being far from home is the whole risk of working a distant seam. It
       ANCHORS NOTHING further (see _isOutpostSite) — you may plant the camp out
       there, but you may not grow a second town around it. */
    /* …EXCEPT IN SOMEBODY ELSE'S YARD (see foreignHome). Only the free PASS is
       withdrawn, never the tile: two halls can sit within ten tiles of each
       other on a small board, and ground that is also beside your own fires is
       still yours to build on — the ordinary anchor rule decides, as it does
       everywhere else. What you may not do is walk across the map and set up
       inside their town because you felled one of their trees. */
    const theirYard = this.foreignHome(owner, x, y);
    const onItsGround = this.needsWorkedGround(key) && this.stationGround(key, x, y).ok && !theirYard;
    const freePlace = d.freePlace || onItsGround || key === 'wall' || key === 'gate';
    const homeAnchors = mine.filter(b => !b.outpost && b.key !== 'warcamp');
    const nearHome = homeAnchors.some(b => Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
    const nearCamp = mine.some(b => b.key === 'warcamp' && Math.hypot(b.x - x, b.y - y) <= CFG.BUILD_RANGE);
    if (!freePlace && mine.length && !nearHome && !nearCamp)
      return { ok: false, code: 'anchor', why: theirYard && this.needsWorkedGround(key)
        ? 'Another tribe keeps its fires here — fell their woods if you like, but the camp goes up by your own'
        : (mine.some(b => b.key === 'warcamp') || homeAnchors.length ? 'Too far — build by your town or a War Camp' : 'Too far from your buildings') };
    // a forward camp is a MILITARY staging ground — no relocating farms/houses/economy
    // to the front. (Near home, anything goes as normal.)
    if (!freePlace && !nearHome && nearCamp && CFG.STAGING_BUILD.indexOf(key) < 0)
      return { ok: false, code: 'staging', why: 'Only military buildings at a War Camp' };
    /* THE SEAL CHECK (tests/placement.mjs). Gates are exempt — a gate opens
       for its owner — and it only fires when the town is currently OPEN (a
       town already sealed can't be made worse, and razing is the cure).
       Behind the cheap perimeter prefilter, and skippable (noSeal) for the
       grid scan: floods are validated on the PICK, never on the scan — the
       same rule AI.plot's pickSealFree follows.
       FOR THE PLAYER IT IS A WARNING, NEVER A REFUSAL (a reported bug: "the
       game won't let me box my people in — but that's the whole point of
       town gates"). Shutting your own people behind stone is a legitimate
       choice and the placement chip says what it costs; only the RIVAL is
       hard-refused — a corked chief is a pathology, and preventing it is
       cheaper than AI.cutTheCork razing its way back out. */
    let warnSeal = false;
    if (!opts.noSeal && key !== 'gate' && this._sealPinch(key, x, y) && this.wouldSeal(owner, key, x, y)) {
      if (owner !== 'P')
        return { ok: false, code: 'sealed', why: 'That would seal your people in — leave a gap or use a gate' };
      warnSeal = true;
    }
    if (!opts.noCost) {
      const res = owner === 'P' ? S.res : S.ai.res;
      if (!this.canAfford(this.effCost(owner, key), res))
        return { ok: false, code: 'cost', why: 'Not enough resources' };
    }
    return warnSeal
      ? { ok: true, warn: 'sealed', warnWhy: 'This walls your town in — nobody leaves without a gate' }
      : { ok: true };
  },

  // why is this tile not buildable ground? — the distinct label the placement
  // UI shows, derived from what actually stands there
  _blockedWhy(x, y) {
    if (!MapGen.onBoard(x, y)) return 'Off the map';
    const b = this.at(x, y);
    if (b) return 'Blocked by a building';
    const t = S.map.terrain[MapGen.idx(x, y)];
    const N = {
      [T.WATER]: 'Open water', [T.FOREST]: 'Blocked by forest',
      [T.MOUNTAIN]: 'Blocked by rock', [T.FERTILE]: 'Blocked by orchards',
      [T.MOAT]: 'A moat is dug here',
    };
    return N[t] || 'Blocked tile';
  },

  /* the seal PREFILTER: if every tile on the footprint's outer perimeter is
     open walkable ground, the perimeter ring itself connects every approach —
     placing the building cannot disconnect anything, so no flood is owed.
     Only a footprint already butted against something solid can pinch. */
  _sealPinch(key, x, y) {
    const s = this.size(key);
    for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) {
      if (dx >= 0 && dx < s && dy >= 0 && dy < s) continue;
      if (!MapGen.inB(x + dx, y + dy) || !Path.passable(x + dx, y + dy)) return true;
    }
    return false;
  },
  /* would this footprint cut the owner's hall doorstep off from the map's
     border ring? Flood owner-aware (own gates pass), wall/gate SITES solid
     (intent counts — tests/work-order.mjs precedent), candidate footprint
     virtually solid; early exit the moment the border band is reached. The
     no-candidate "is the town open today" answer is cached against
     (S.day, _blockGen) — force the lazily-invalidated block grid current
     BEFORE reading the generation (the Bld.deckAt trap). */
  wouldSeal(owner, key, x, y) {
    if (!this._block) this.rebuildBlock();
    const openNow = this._openToBorder(owner, null, null, null, null);
    if (!openNow) return false;                    // already sealed — placing more can't be blamed
    return !this._openToBorder(owner, x, y, this.size(key), key);
  },
  _openToBorder(owner, fx, fy, fs, fkey) {
    const gen = this._blockGen || 0;
    if (fx == null) {
      const c = this._openC;
      if (c && c.day === S.day && c.gen === gen && c.owner === owner) return c.val;
    }
    const W = CFG.W, H = CFG.H;
    const inFoot = (x, y) => fx != null && x >= fx && x < fx + fs && y >= fy && y < fy + fs;
    const seen = new Uint8Array(W * H);
    const q = [];
    const push = (x, y) => {
      if (!MapGen.inB(x, y) || inFoot(x, y)) return;
      const i = MapGen.idx(x, y);
      if (seen[i]) return;
      if (!Path.passable(x, y, owner)) return;
      const b = this.at(x, y);
      if (b && b.construction > 0 && (b.key === 'wall' || (b.key === 'gate' && b.owner !== owner))) return;
      seen[i] = 1; q.push(i);
    };
    for (const i of Units.homeSteps(owner)) push(i % W, (i / W) | 0);
    let open = false, h = 0;
    while (h < q.length) {
      const i = q[h++], x = i % W, y = (i / W) | 0;
      if (x <= 1 || y <= 1 || x >= W - 2 || y >= H - 2) { open = true; break; }
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    /* an EMPTY seed queue reads as NOT OPEN, deliberately, in both forms:
       - candidate form: the footprint smothers the hall's every doorstep —
         that IS the seal, and it must refuse;
       - plain form: the hall has no doorstep at all (or no hall) — openNow
         is then false and wouldSeal short-circuits to "allowed", because a
         town already shut (or gone) can't be made worse by building. */
    if (fx == null) this._openC = { day: S.day, gen, owner, val: open };
    return open;
  },

  // what a placement really costs — ORIGIN CARDS discounts (Mason forts,
  // Nomad first-buildings) apply on top of the base spec
  effCost(owner, key) {
    let cost = this.buildSpec(key, owner).lv.cost;
    /* THE RIVAL'S WONDER BILL IS SCALED THE WAY ITS INCOME IS (CFG.WONDER
       .aiCostFrac, tests/calm-peace.mjs): its whole economy is an
       abstraction paid per living hand at a fraction of player-scale
       income, so at the full 15k-a-resource price the day-350 gate was a
       door that never opened outside a test harness. The player never sees
       the rival's stockpile — only the countdown. */
    if (owner === 'A' && key === 'wonder' && CFG.WONDER.aiCostFrac) {
      const sc = {};
      /* stone weighs a THIRD of the others' fraction: it is the map's one
         finite resource (tests/ore-finite.mjs) and the rival's per-hand
         economy has no late-game stone income at all — its quarry seams are
         spent by day 300 and the gold→goods caravan rate is deliberately
         awful (tests/trade-post.mjs), so a stone bill matched to the other
         resources is a gate that never opens. Measured: a 400-day peace sim
         banked 3.4k wood and 15k gold against 1.5k stone. */
      /* …and FOODLESS: food is the one resource a live town CONSUMES, so the
         chief's granary oscillates with upkeep and hiring and a food term
         made the race land anywhere between day 330 and day 460 across
         sims of the same seed. The tribe's food feeds the builders; the
         monument bill is the durable goods. */
      for (const k in cost)
        sc[k] = k === 'food' ? 0
          : Math.round(cost[k] * CFG.WONDER.aiCostFrac * (k === 'stone' ? 0.35 : 1));
      cost = sc;
    }
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
    const outpost = key !== 'warcamp' && this._isOutpostSite(owner, key, x, y);
    const b = {
      id: S.nextId++, key, owner, x, y, level: spec.level,
      // THE FOOTPRINT IS STAMPED AT PLACEMENT, never re-read from the def (see
      // Bld.size): a building keeps the ground it was raised on for its whole
      // life, so growing a key later can never make somebody's standing town
      // overlap itself. Rides in every save.
      sz: this.size(key),
      // construction sites are fragile until finished
      hp: opts.instant ? spec.lv.hp : this.siteStartHp(spec.lv.hp),
      maxhp: spec.lv.hp,
      construction: opts.instant ? 0 : spec.lv.time * tMult,   // days left
      upgrading: 0, queue: [], cd: 0, outpost,
    };
    S.buildings.push(b);
    if (key === 'warcamp') this._revealCampToFoe(b);   // a forward camp shows on the enemy's map
    /* AN ANCIENT WONDER CANNOT BE BUILT IN SECRET (tests/wonder.mjs). Raising
       one is visible for a day's ride: it shows up on the other side's map
       the moment the ground is broken, and it rings the alarm — the chief
       drops whatever plan it was running and marches on the works. That is
       the price of the peaceful victory: you must hold the site. */
    if (key === 'wonder') {
      this._revealCampToFoe(b);
      if (owner === 'P' && S.ai) S.ai.wonderAlarm = { x: b.x, y: b.y, day: S.day, id: b.id };
      if (owner === 'A') G.log('The rival is raising a monument of their own!', true);
      else G.foeNote(`Word of your great work is carried over the hills — the rival is coming.`);
    }
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
    // …and any remains on the plot: raising a lodge OVER the kill site is the
    // whole point of the cue, and bones under a floor are bones cleaned away
    if (S.corpses && S.corpses.length)
      S.corpses = S.corpses.filter(c => (c.x | 0) < x || (c.x | 0) >= x + sz ||
                                        (c.y | 0) < y || (c.y | 0) >= y + sz);
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
        else if (S.levy) G.log(`${d.name} site laid out — the levy is under arms; the works wait for the stand-down`, true);
        else G.log(`${d.name} needs a builder — tap a villager, then the site`, true);
      }
    }
    /* REPAINT THE GROUND THE BUILDING NOW STANDS ON. The terrain layer draws
       decoration a footprint is meant to suppress, and until now nothing
       dirtied those tiles unless the TERRAIN under them happened to change
       too, so the suppression only took effect on the next full rebake. */
    if (window.R && R.drawTilesAt) {
      const sz = this.size(key), tiles = [];
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) tiles.push([x + dx, y + dy]);
      R.drawTilesAt(tiles);
    }
    return b;
  },

  finish(b, builder) {
    b.construction = 0;
    b.hp = b.maxhp;
    /* A PLAYER GATE IS BORN CLOSED (tests/drawbridge.mjs) — every tier, the
       drawbridge rule generalized: a door nobody chose to open must never be
       a road into the castle, and the first opening runs the ordinary toggle
       path with its block/deck rebuild. Player only: the rival's chief never
       works a door, so a shut gate of its own would seal its army in for
       good. (Upgrades PRESERVE the state the player set — only the L3
       arrival is born up, finishWallUpgrade's own rule, for the deck-grid
       reason documented there.) */
    if (b.key === 'gate' && b.owner === 'P') b.raised = true;
    if (this.solid(b.key)) {
      // the building just became solid (rebuildBlock skips it while raising) —
      // and anyone standing on its footprint steps off, ties broken toward
      // home, so a builder finishing it under its own feet ends on the town
      // side rather than sealed out (tests/work-order.mjs). Every solid
      // building does this now, not just walls: a hall raised over a
      // villager's head would otherwise wedge it (tests/buildings-block.mjs).
      this._block = null;
      this.stepOffFootprint(b);
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
    // THE SECOND WAY TO WIN: the monument is up, the run is decided
    // (tests/wonder.mjs). Last, so the building is fully finished first.
    if (b.key === 'wonder') G.wonderRaised(b);
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

  /* ---- THE HALL RISES ON THE TOWN'S SHOULDERS (tests/tc-upgrade.mjs) ----
     A Town Center storey is no longer a thing you simply save up for: it must
     be EARNED by a village that has actually grown around it. Three finished
     buildings at the hall's own level buy the next one — three level-1
     buildings for Lv 2, three level-2 buildings for Lv 3 — so the hall is
     always a step BEHIND the town rather than a step in front of it.

     The requirement keys off the hall's CURRENT level (`b.level`), which is
     what makes one rule serve both tiers. It cannot deadlock: an ordinary
     building may only reach Lv 2 once the hall is Lv 2 (the Town Center gate
     just above), so the sequence is town → hall → town → hall.

     WALLS AND GATES DO NOT COUNT. They have no upgrade of their own — the
     whole curtain is raised at once from the Town Center at a village-wide
     tier — so counting them would let a line of cheap palisade sections buy
     the hall's next storey, which is precisely the shortcut this rule exists
     to close. Owner-agnostic: the rival's chief builds a town before a hall
     on the same terms. */
  TC_SUPPORT: 3,
  tcSupport(tc) {
    return this.list(tc.owner).filter(o =>
      o.key !== 'tc' && o.key !== 'wall' && o.key !== 'gate' &&
      !(o.construction > 0) && o.level >= tc.level).length;
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
    } else if (this.tcSupport(b) < this.TC_SUPPORT) {
      // the hall rises on the town's shoulders, not the other way round
      return { ok: false, why: `Needs ${this.TC_SUPPORT} buildings at Lv ${b.level} ` +
        `(have ${this.tcSupport(b)})` };
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
            : MapGen.findNear(b.x, b.y + Bld.size(b), 3, (x, y) => Path.passable(x, y) && !Bld.at(x, y)))
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
            // a refused work order (a levied hand, a claimed shoal) falls back
            // to the plain walk — a rally point always MEANS "go there"
            if (Units.isVillager(nu) && CFG.GATHER[S.map.terrain[MapGen.idx(b.rally.x, b.rally.y)]] &&
                Units.assignGather(nu, b.rally.x, b.rally.y)) { /* gathering there */ }
            else if (nu.kind === 'fishboat' && Units.canFish(b.rally.x, b.rally.y) &&
                Units.assignFish(nu, b.rally.x, b.rally.y)) { /* fishing there */ }
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
    const sz = this.size(b);
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      const idx = MapGen.idx(b.x + dx, b.y + dy);
      if (S.map.terrain[idx] === T.WATER) {
        // a broken dock washes away — open water again, no rubble
        R.updateTile(b.x + dx, b.y + dy);
      } else if (S.map.terrain[idx] === T.GOLDORE) {
        /* THE SEAM OUTLIVES THE MINE (tests/gold-mine.mjs). Rubble would erase
           the rarest tile on the map, so a razed mine leaves the gold exactly
           where it was — whoever holds the ground can sink a new shaft, and
           that is precisely what makes a seam worth fighting over rather than
           worth burning. */
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

  /* ---- BURNING (tests/burn-down.mjs) — how far gone is a damaged building?
     Returns -1 (sound), or the destruction stage: 0 = first third of hp lost
     (small fires), 1 = badly hurt (big fires, scorched dark), 2 = the
     partially-DESTROYED look, fires guttering low. Purely a function of hp,
     so the fire burns until a villager's repair puts it out — the persistent
     "this needs mending" signal.
     Stage 2 is deliberately LATE: the broken-open sprite is the last thing a
     building shows before it comes down, so it waits until only RUIN_AT of
     the hp bar is left. Held at a third (as it once was) a building spent
     most of a long fight looking already ruined, and the moment it actually
     fell read as nothing happening. */
  // what a fresh construction site's hp starts at (fragile until finished) —
  // the single source of truth for place() AND burnPhase below
  siteStartHp(maxhp) { return Math.max(30, Math.round(maxhp * 0.4)); },

  burnPhase(b) {
    const max = b.maxhp || this.def(b.key).levels[b.level - 1].hp;
    // a CONSTRUCTION SITE is fragile BY DESIGN — it starts at a fraction of
    // its finished hp, and building work never raises hp (only finish() does).
    // Burn is measured against what the site was GIVEN, never against the
    // finished building's hp, or every fresh site would read as on fire.
    const base = b.construction > 0 ? this.siteStartHp(max) : max;
    const dmg = 1 - b.hp / base;
    if (dmg <= 0.02) return -1;          // a scratch (or an untouched site) doesn't smoulder
    if (dmg >= CFG.RUIN_AT) return 2;    // the last sliver of hp — broken open
    return dmg < 1 / 3 ? 0 : 1;
  },

  // is a cooling ash pile on this tile? (blocks building, never movement)
  ashAt(x, y) {
    if (!S.ashes || !S.ashes.length) return null;
    for (const a of S.ashes)
      if (x >= a.x && x < a.x + a.sz && y >= a.y && y < a.y + a.sz) return a;
    return null;
  },

  damage(b, amt) {
    if (!this.attackable(b)) return;   // the seam's works change hands, they never come down
    b.hp -= amt;
    // ring the rival's town alarm — idle soldiers converge (see AI.daily)
    if (b.owner === 'A' && S.ai) S.ai.alarm = { x: b.x, y: b.y, day: S.day };
    if (b.hp <= 0) {
      const name = this.def(b.key).name, owner = b.owner, key = b.key, underCon = b.construction > 0;
      // a burned-down building leaves an ASH PILE that blocks building on its
      // footprint for CFG.ASH_DAYS (tests/burn-down.mjs). Walls and gates are
      // exempt — a breached line must stay instantly mendable (the AI's
      // mendWallLine loop and the player's own repairs depend on it) — and a
      // broken dock washes into open water, leaving nothing to smoulder.
      if (key !== 'wall' && key !== 'gate' && key !== 'dock') {
        if (!S.ashes) S.ashes = [];
        S.ashes.push({ x: b.x, y: b.y, sz: this.size(key), key, lv: b.level, day: S.day });
      }
      // a building coming down empties the sky above it (tests/wild-life.mjs)
      if (window.R && R.startle) R.startle(this.cx(b), this.cy(b), 12);
      // …and, if its kind has a collapse registered, TOPPLES on screen. Fired
      // here and not in demolish(): this is the DESTROYED path, the one the
      // player earned. Must run BEFORE removeToRuin — the collapse animation
      // is cut from the building's own sprite, and a mural tower's sprite
      // depends on the wall neighbours that are still standing right now.
      if (window.R && R.startCollapse) R.startCollapse(b);
      // …and the fall throws dust — the placement poof, reused at the other
      // end of the building's life (tests/burn-down.mjs). Not the dock: a
      // broken quay washes into open water, and dust over water reads wrong.
      if (window.R && R.startDestructPoof && key !== 'dock') R.startDestructPoof(b);
      this.removeToRuin(b);
      /* the loss ledger the barbarian ease reads (G.noteWorkLost) — finished
         non-fortification works only: a razed wall section is not a town
         coming apart, and a burned work SITE never was a work */
      if ((owner === 'P' || owner === 'A') && key !== 'wall' && key !== 'gate' && !underCon)
        G.noteWorkLost(owner);
      if (owner === 'P') {
        S.breachedP = true;   // the line is broken — positive specials may now answer (G.positiveGate)
        G.log(`${name} destroyed!`, true);
        if (key === 'tc') G.end(false, 'Your Town Center was destroyed.');
      } else if (owner === 'A') {
        // …and the chief REMEMBERS where it lost this one (tests/wall-line.mjs):
        // twice-burned ground is never offered a third building
        // (AI is a script-level const — `window.AI` is undefined, so it is
        // referenced directly, the same trap G and Sprites carry)
        AI.noteLoss(b.x, b.y);
        G.log(`Rival ${name} destroyed!`);
        if (S.stats) S.stats.razed++;
        if (key === 'tc') G.end(true, 'You razed the rival Town Center. The valley is yours!');
      } else if (owner === 'R' && key === 'raidercamp') {
        // the ground is won: no more spears raised here, and no wave musters
        // at it again (tests/raider-camps.mjs). Its band is loose from now on
        // — Combat.raiderSeek drops the post the moment the camp is gone.
        G.log(`A camp of ${G.tribeName(b.tribe)} is burned out — that ground is yours.`, true);
        if (S.stats) S.stats.razed = (S.stats.razed || 0) + 1;
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
    /* THE NEW DRAWBRIDGE STARTS UP (tests/drawbridge.mjs). Two reasons, one
       player-reported. Surprise: a deck the player never chose to lower is an
       open road into the castle the moment the tier lands. And staleness: the
       deck grid caches against _blockGen, which a mere level bump never
       moved — so a gate born with its bridge "down" drew a crossing that
       carried nobody until the winch was worked once. Born shut, the first
       lowering IS that first winch-work, through the ordinary toggle path.
       (The block grid is invalidated here regardless — a raised gate blocks
       differently, and the deck grid must re-read the new tier either way.) */
    if (S.wallLevel >= 3) {
      for (const b of this.forts())
        if (b.key === 'gate' && !b.raised && this.canDrawbridge(b)) b.raised = true;
      this._block = null;              // BEFORE the step-off, the toggle's own order —
      for (const b of this.forts())    // stepping off must read the shut gates as solid
        if (this.bridgeRaised(b)) this.stepOffFootprint(b);
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
