"use strict";
/* Combat: target acquisition, chasing, attacks, tower fire.
   Simple resolution: damage = max(1, attack - defense) per hit. */

const Combat = {
  shots: [],        // thin-line shots (tower arrows, human archers): {x1,y1,x2,y2,t}
  projectiles: [],  // siege engine shots that carry their damage and land it on impact
  scanT: 0,

  // fire a siege engine's projectile: it flies to (tx,ty) over a short arc and
  // applies its damage at IMPACT (so seeing the hit == the damage registering),
  // spawning a dust/fire burst there. tgt = { kind:'bld'|'unit', id, dmg, srcId }.
  launch(u, tx, ty, tgt) {
    const kind = CFG.UNITS[u.kind].proj;
    this.projectiles.push({
      kind, tgt, owner: u.owner,
      x1: u.x, y1: u.y - 0.35, x2: tx, y2: ty, t: 0,
      dur: kind === 'bolt' ? 0.26 : kind === 'flame' ? 0.72 : 0.5,   // flight time
      arc: kind === 'bolt' ? 0.4 : kind === 'flame' ? 3.0 : 1.6,      // peak height (tiles)
    });
  },
  // a projectile reaches its mark: land the damage and throw a burst
  impact(p) {
    const t = p.tgt, flame = p.kind === 'flame';
    if (t.kind === 'bld') {
      const b = Bld.get(t.id);
      if (b) this.hitBuilding(b, t.dmg, flame);
    } else {
      const tu = Units.get(t.id);
      if (tu) { R.float(tu.x, tu.y - 0.4, '-' + t.dmg, '#f08a7a'); Units.damage(tu, t.dmg, t.srcId || 0, p.owner); }
    }
    R.impact(p.x2, p.y2, p.kind);
  },
  // apply damage to a building + show it landing (shared by instant melee hits
  // and projectile impacts, so buildings always read the hit)
  hitBuilding(b, dmg, flame) {
    Bld.damage(b, dmg);
    R.float(Bld.cx(b), b.y - 0.15, '-' + dmg, flame ? '#f2963a' : '#e8d2a0');
    if (b.hp > 0 && b.owner === 'P' && Math.random() < 0.15)
      G.log(`${Bld.def(b.key).name} under attack!`, true);
  },

  // hostility matrix: P<->A, P<->R, P<->W, A<->W
  hostile(a, b) {
    if (a === b) return false;
    if ((a === 'P' && b !== 'P')) return true;
    if ((b === 'P' && a !== 'P')) return true;
    if ((a === 'A' && b === 'W') || (a === 'W' && b === 'A')) return true;
    return false;
  },

  // a melee land unit has no way to fight a ship — don't let it try.
  // Siege towers are armored against arrows: only melee (necessarily outside
  // the wall with it) and the heavy marksman class can bring one down.
  canEngage(u, o) {
    if (Units.isNaval(o) && !Units.isNaval(u) && !CFG.UNITS[u.kind].rng) return false;
    if (o.kind === 'siegetower' && CFG.UNITS[u.kind].rng && u.kind !== 'marksman') return false;
    return true;
  },

  // unit-level hostility: barbarian bands roll a disposition on spawn
  // (u.hostileTo: 'P' = hunt the player, 'A' = march on the rival, 'ALL' = anyone)
  hostileUnits(u, o) {
    if (u.owner === o.owner) return false;
    if (u.owner === 'R' && o.owner === 'R') return false;
    if (u.owner === 'R')
      return o.owner !== 'W' && ((u.hostileTo || 'P') === 'ALL' || (u.hostileTo || 'P') === o.owner);
    if (o.owner === 'R')
      return u.owner !== 'W' && ((o.hostileTo || 'P') === 'ALL' || (o.hostileTo || 'P') === u.owner);
    return this.hostile(u.owner, o.owner);
  },
  // building vs unit (towers): does this unit threaten the building's tribe?
  hostileToBld(b, o) { return this.hostileUnits({ owner: b.owner }, o); },

  nearestUnit(x, y, maxD, pred) {
    let best = null, bd = maxD;
    for (const u of S.units) {
      if (!pred(u)) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  // an open land tile beside (x,y) to stand on — for hacking down a bridge
  tileAdjOpen(x, y, owner) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (Path.passable(x + ox, y + oy, owner) && !Bld.at(x + ox, y + oy)) return { x: x + ox, y: y + oy };
    return null;
  },
  nearestBuilding(x, y, owner, pred) {
    let best = null, bd = 1e9;
    for (const b of S.buildings) {
      if (b.owner !== owner) continue;
      if (pred && !pred(b)) continue;
      // big footprints measure from their edge, not just their center
      const d = Math.hypot(Bld.cx(b) - x, Bld.cy(b) - y) - Bld.reach(b);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  // Can u actually walk to within `within` tiles of (tx,ty)? Path.find always
  // hands back a best-effort route to the CLOSEST reachable tile, so a truthy
  // path proves nothing — we must check where that route actually ends. This is
  // what keeps a band from fixating on prey across water a bridge no longer spans.
  // Side effect: sets u.path to the computed route (reused by the caller).
  canReach(u, tx, ty, within) {
    Units.setPath(u, tx | 0, ty | 0);
    const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
    return Math.hypot(end.x + 0.5 - tx, end.y + 0.5 - ty) <= within;
  },

  // The nearest reachable spot on the map's inner rim (the outer ring is a hard
  // border land units can't stand on, so we aim one tile in). Returns null when
  // every edge is cut off — the band is stranded on an island and must melt away.
  nearestEdgeTile(u) {
    const W = CFG.W, H = CFG.H;
    const cands = [{ x: 1, y: u.y | 0 }, { x: W - 2, y: u.y | 0 }, { x: u.x | 0, y: 1 }, { x: u.x | 0, y: H - 2 }];
    let best = null, bestD = Infinity;
    for (const c of cands) {
      Units.setPath(u, c.x, c.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
      if (end.x <= 1 || end.y <= 1 || end.x >= W - 2 || end.y >= H - 2) {
        const d = Math.hypot(end.x - u.x, end.y - u.y);
        if (d < bestD) { bestD = d; best = { x: end.x, y: end.y }; }
      }
    }
    return best;
  },

  // A raider with nothing left it can reach heads for the wilds. At the rim it
  // vanishes; if no rim is reachable (stranded across a severed crossing) it
  // simply slips away rather than milling in place forever.
  raiderLeave(u) {
    if (u.x < 2 || u.y < 2 || u.x > CFG.W - 2 || u.y > CFG.H - 2) {
      S.units.splice(S.units.indexOf(u), 1);
      return;
    }
    if (Units.moving(u)) return;            // already trudging out — let it walk
    const edge = this.nearestEdgeTile(u);
    if (!edge) { S.units.splice(S.units.indexOf(u), 1); return; }
    Units.setPath(u, edge.x, edge.y);
  },

  // is the rival town on the line with too few soldiers to hold it? When an
  // enemy force reaches the hall and the guard can't clearly match it, the
  // townsfolk grab tools and pile on — four or five villagers can drag down a
  // lone attacker, and a tribe should never watch its heart fall without a
  // fight. Computed once per scan (drives the villager-militia branch below).
  MILITIA_RANGE: 9,
  townUnderSiege() {
    const tc = Bld.tcOf('A');
    if (!tc) return false;
    const cx = Bld.cx(tc), cy = Bld.cy(tc), R = this.MILITIA_RANGE;
    const isAttacker = o => (o.owner === 'P' && Units.isMilitary(o)) ||
      (o.owner === 'R' && !Units.isTransport(o));
    let foes = 0, guards = 0;
    for (const o of S.units) {
      if (Units.isNaval(o) || Math.hypot(o.x - cx, o.y - cy) > R) continue;
      if (isAttacker(o)) foes++;
      else if (o.owner === 'A' && Units.isMilitary(o)) guards++;
    }
    return foes > 0 && guards < foes;
  },

  acquire() {
    this._militiaOn = this.townUnderSiege();
    for (const u of S.units) {
      if (u.tUnit || u.tBld) continue;
      const base = CFG.UNITS[u.kind];
      if (u.kind === 'wolf' && Units.isWild(u)) {
        // ORIGIN CARDS: a Beastward tribe's people are passed over
        const v = this.nearestUnit(u.x, u.y, base.aggro, o => Units.isVillager(o) &&
          !(window.Cards && Cards.atPeace(o.owner)));
        if (v) u.tUnit = v.id;
      } else if ((u.kind === 'boar' || u.kind === 'bear') && Units.isWild(u)) {
        const v = this.nearestUnit(u.x, u.y, base.aggro,
          o => (o.owner === 'P' || o.owner === 'A') && this.canEngage(u, o) &&
            !(window.Cards && Cards.atPeace(o.owner)));
        if (v) u.tUnit = v.id;
      } else if ((u.kind === 'bear' || u.kind === 'wolf' || u.kind === 'boar') &&
                 (u.owner === 'P' || u.owner === 'A')) {
        // ORIGIN CARDS (Houndmaster): a kept guard-beast patrols its home
        // ground — wild predators and enemy soldiers alike answer to it
        const e = this.nearestUnit(u.x, u.y, base.aggro + 1,
          o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o));
        if (e && Math.hypot(e.x - u.anchor.x, e.y - u.anchor.y) < 8) u.tUnit = e.id;
      } else if (Units.isMilitary(u) && !(u.task && u.task.type === 'raid')) {
        // DEFEND: hold a perimeter round the Town Center / Dock — engage only foes
        // that reach the sortie bound of the POST (not just near the unit), and
        // never chase a provocation across the map (the leash lives in update()).
        if (u.defend) {
          const g = Units.guardCenter(u);
          if (g) {
            if (u.task && u.task.type === 'move') continue;   // still walking back to post
            const dc = Math.hypot(u.x - g.x, u.y - g.y);
            if (dc > Units.holdRadius(g, u.x, u.y) + 1.8) { Units.returnToGuard(u, g); continue; }
            // engage only a foe we can STRIKE while holding the line: one within the
            // bound (walls OR natural barriers) plus this unit's own weapon reach of
            // the hall. So an archer picks up an enemy still approaching the shore/wall
            // and volleys over it, a melee waits for the foe to reach the perimeter —
            // and neither chases a provocation out past the defended land.
            const reach = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE || 1.5;
            const MAXR = CFG.GUARD.maxNatural || 14;
            const e = this.nearestUnit(g.x, g.y, g.r1 + MAXR + reach,
              o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o) &&
                Math.hypot(o.x - g.x, o.y - g.y) <= Units.holdRadius(g, o.x, o.y) + reach + 0.5);
            if (e) u.tUnit = e.id;
            else if (dc > Units.holdRadius(g, u.x, u.y) && !Units.moving(u)) Units.returnToGuard(u, g);   // no foe → drift home
            continue;
          }
          // no Town Center / Dock to guard — fall through to the ordinary leash
        }
        // guards: engage hostiles near them (but don't stray while following an order,
        // and never auto-hunt harmless game — that's the player's call)
        if (u.task && u.task.type === 'move') continue;
        const e = this.nearestUnit(u.x, u.y, base.aggro,
          o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o));
        if (e && Math.hypot(e.x - u.anchor.x, e.y - u.anchor.y) < 9) { u.tUnit = e.id; continue; }
        // ASSAULT autonomy: a unit committed to an attack (the order flagged
        // u.assault) whose target has fallen presses on by itself — a fighter in
        // reach first, then the nearest enemy structure, then the hall — so the
        // player commands the assault, not every blow. Bounded to a radius so the
        // army clears the objective it was sent to, never wandering off the map.
        if (u.assault) this.assaultSeek(u);
      } else if (u.owner === 'A' && Units.isVillager(u)) {
        // rival townsfolk militia: when the town is under siege and
        // undermanned, whoever's near the hall picks up the nearest attacker
        if (this._militiaOn) {
          const tc = Bld.tcOf('A');
          if (tc && Math.hypot(u.x - Bld.cx(tc), u.y - Bld.cy(tc)) <= this.MILITIA_RANGE + 1) {
            const e = this.nearestUnit(u.x, u.y, this.MILITIA_RANGE,
              o => ((o.owner === 'P' && Units.isMilitary(o)) ||
                    (o.owner === 'R' && !Units.isTransport(o))) && this.canEngage(u, o));
            if (e) { u.tUnit = e.id; u.militia = true; }
          }
        } else if (u.militia) {
          u.militia = false;   // the siege has lifted — back to the lanes
        }
      }
    }
  },

  // how far a committed attacker will look for its next mark once its target
  // falls. Big enough to clear a whole town's footprint, small enough that the
  // army holds at the objective instead of marching on across the map.
  ASSAULT_R: 15,

  // the nearest enemy structure this unit could turn on — measured from its edge,
  // completed only. No pathfind here: if a wall/orchard seals the target off the
  // execution layer (Combat.update's tBld branch) batters the blocker open and
  // resumes, so "nearest" naturally means the outer shell first, then what's within.
  nearestReachableBld(u, owner, within, pred) {
    let best = null, bd = within;
    for (const b of S.buildings) {
      if (b.owner !== owner || !Bld.done(b)) continue;
      if (pred && !pred(b)) continue;
      const d = Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y) - Bld.reach(b);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  // autonomous target selection for a player unit in an assault. Priority mirrors
  // the player's own instinct: kill what's fighting you, then tear down the walls
  // and works, then the hall. Clears the stance when nothing hostile is left in
  // reach so the army simply holds the ground it took.
  assaultSeek(u) {
    const R = this.ASSAULT_R, enemy = u.owner === 'P' ? 'A' : 'P';
    const nextBld = () => this.nearestReachableBld(u, enemy, R, bb => bb.key !== 'tc')
                       || this.nearestReachableBld(u, enemy, R, bb => bb.key === 'tc');
    // siege engines are structure-killers: they seek the works first (walls before
    // the hall) and only turn on troops if nothing's left standing to knock down —
    // so they never trundle off to trade melee they can't win.
    if (Units.isSiege(u)) {
      const b = nextBld();
      if (b) { Units.orderAttackBuilding(u, b); return; }
    }
    // 1) a hostile fighter close by — deal with it (protect the siege line, don't
    //    get whittled down). Reachable only, so a defender safe behind the wall
    //    doesn't distract the unit from battering its way in.
    const e = this.nearestUnit(u.x, u.y, R,
      o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o));
    if (e && Math.hypot(e.x - u.x, e.y - u.y) <= R && this.canReach(u, e.x, e.y, 1.7)) {
      u.task = { type: 'attack' }; u.tUnit = e.id; u.tBld = 0; u.anchor = { x: e.x, y: e.y }; return;
    }
    // 2) the nearest enemy structure — walls/works first (never the hall while
    //    anything else stands), so it plays like a real siege from the outside in.
    const b = nextBld();
    if (b) { Units.orderAttackBuilding(u, b); return; }   // keeps u.assault set for the next cascade
    // 3) nothing hostile within reach — the assault is spent. Stand down and hold
    //    here (a fresh order re-arms it); don't trickle back home on a leash.
    u.assault = false; u.task = null; u.tUnit = 0; u.tBld = 0; u.anchor = { x: u.x, y: u.y };
  },

  /* LAYER 4 (execution half) — a rival raid party fights as one toward the
     objective the chief chose (Combat delegates 'A' raiders here). It reads
     the board for expected value: a hostile soldier in its face gets dealt
     with; a SOFT target on the way (an isolated villager, an undefended
     workplace) is worth more than the death-ball — burning economy cripples
     the player; otherwise it marches on the shared objective and only the
     wall-breakers batter walls (combined arms), recording the contact so the
     chief learns to route around next time. */
  // pull a water-blocked MELEE rival raider back out of the enemy towers' range
  // and hold it there — it waits for the chief to bridge the crossing instead of
  // dying on the bank for nothing. If it CAN'T reach safety (boxed into a pocket
  // that's all inside the killzone — e.g. ringed by rock/water), it gives up and
  // marches home rather than jittering in the towers' fire until it dies.
  aiStandoff(u) {
    const nb = this.nearestBuilding(u.x, u.y, 'P', bb => Bld.done(bb));
    if (!nb) { u.path = null; return; }
    const bx = Bld.cx(nb), by = Bld.cy(nb), d = Math.hypot(bx - u.x, by - u.y);
    const SAFE = 8;                                  // clear of tower range (≈4.5–6)
    if (d >= SAFE) { u.path = null; return; }        // already out of the killzone — hold
    const ux = (u.x - bx) / (d || 1), uy = (u.y - by) / (d || 1);
    const spot = MapGen.findNear(Math.round(bx + ux * SAFE), Math.round(by + uy * SAFE), 5,
      (x, y) => Path.passable(x, y, 'A'));
    if (spot && Units.setPath(u, spot.x, spot.y)) {
      const end = u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
      // did the route actually get us meaningfully clear of the building? if the
      // best-effort path stalls right back in the killzone, we're trapped
      if (Math.hypot(end.x + 0.5 - bx, end.y + 0.5 - by) >= SAFE - 2) return;
    }
    this.aiRetreatHome(u);   // can't get clear — abandon the raid and head home
  },

  // a rival raider that's boxed in with nothing it can reach abandons the raid
  // and marches home (escaping the pocket if any way out exists). If home is
  // unreachable too, it's genuinely stranded — hold still instead of jittering.
  aiRetreatHome(u) {
    u.tUnit = 0; u.tBld = 0; u.tBridge = null; u.raidObj = null;
    const atc = Bld.tcOf('A');
    if (atc && Units.setPath(u, atc.x, atc.y + 2)) {
      const end = u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
      if (Math.hypot(end.x - atc.x, end.y - (atc.y + 2)) <= 4) {   // home is reachable → march back
        u.task = { type: 'move', x: atc.x, y: atc.y + 2 };
        u.anchor = { x: atc.x + 0.5, y: atc.y + 2.5 };
        return;
      }
    }
    u.task = null; u.path = null;   // truly stranded — stop, don't thrash
  },

  aiRaidSeek(u) {
    const ai = S.ai;
    // a probe party carries its OWN lane objective; the main force shares ai.raidObj
    const obj = u.raidObj || (ai && ai.raidObj) || null;
    const canWall = Units.isSiege(u) || u.kind === 'axeman' || !!CFG.UNITS[u.kind].bldAtk;
    // 1) a hostile fighter right in our face — engage (don't get picked apart).
    //    Only lock on if we can actually REACH it: a defender safe behind a wall
    //    must not distract the column from battering its way in.
    const foe = this.nearestUnit(u.x, u.y, 5, o => this.hostileUnits(u, o) &&
      (Units.isMilitary(o) || (o.owner === 'R' && !Units.isTransport(o))) && this.canEngage(u, o));
    if (foe && this.canReach(u, foe.x, foe.y, 1.6)) { u.tUnit = foe.id; return; }
    // 2) soft targets on the way — an enemy SAPPER (defenceless, mid-work, high
    //    value) is the juiciest, then isolated villagers, then undefended workplaces.
    //    Reachability again: villagers tucked behind the walls are NOT a target —
    //    fixating on them is exactly what left raiders idling at the gate.
    const sap = this.nearestUnit(u.x, u.y, 8, o => o.owner === 'P' && Units.isSapper(o) && this.canEngage(u, o));
    if (sap && this.canReach(u, sap.x, sap.y, 1.6)) { u.tUnit = sap.id; return; }
    const soft = this.nearestUnit(u.x, u.y, 7, o => o.owner === 'P' && Units.isVillager(o) && this.canEngage(u, o));
    if (soft && this.canReach(u, soft.x, soft.y, 1.6)) { u.tUnit = soft.id; return; }
    // a player BRIDGE within reach — cutting the crossing severs an expansion or
    // flanking route. Only worth it if we can actually stand beside it.
    if (S.bridges && S.bridges.length) {
      let bb = null, bd = 6;
      for (const br of S.bridges) {
        if (br.owner !== 'P') continue;
        const dd = Math.hypot(br.x + 0.5 - u.x, br.y + 0.5 - u.y);
        if (dd < bd && this.tileAdjOpen(br.x, br.y, u.owner)) { bd = dd; bb = br; }
      }
      if (bb) { u.tBridge = { x: bb.x, y: bb.y }; u.tUnit = 0; u.tBld = 0; return; }
    }
    const econ = this.nearestBuilding(u.x, u.y, 'P',
      bb => bb.key !== 'tc' && Bld.def(bb.key).needsWorker && Bld.done(bb));
    if (econ && Math.hypot(Bld.cx(econ) - u.x, Bld.cy(econ) - u.y) < 7) {
      Units.setPath(u, econ.x, econ.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x, y: u.y };
      if (Math.hypot(end.x + 0.5 - Bld.cx(econ), end.y + 0.5 - Bld.cy(econ)) <= 1.6 + Bld.reach(econ)) { u.tBld = econ.id; return; }
    }
    // 3) march on the shared objective the chief set at launch (massing +
    //    focus). No objective means the chief hasn't found a target — the
    //    party engages only what it can physically see, it does NOT home in
    //    on a town across the fog it was never told about.
    const goal = obj || null;
    const ptc = Bld.tcOf('P');
    if (goal) {
      Units.setPath(u, goal.x | 0, goal.y | 0);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x, y: u.y };
      // arrived next to the hall (physically adjacent, so we can see it) → hit it
      if (ptc && Math.hypot(end.x + 0.5 - Bld.cx(ptc), end.y + 0.5 - Bld.cy(ptc)) <= 2.6 + Bld.reach(ptc)) { u.tBld = ptc.id; return; }
      // a wall/gate in the way — batter it, exactly as barbarians do (raiderSeek).
      // "Reachable" means we can path up beside it; if so it's an ATTACKABLE
      // obstacle and MUST win over the "stand off" branch below (which is only for
      // gaps we can't hit, like water). This is what stops a column from idling at
      // the gate: whatever its angle of approach, it commits and marches up to smash.
      const wall = this.nearestBuilding(u.x, u.y, 'P', bb => bb.key === 'wall' || bb.key === 'gate');
      if (wall && this.canReach(u, wall.x, wall.y, 1.7 + Bld.reach(wall))) {
        if (ai && ai.memory) ai.memory.wallHit = (ai.memory.wallHit || 0) + 1;
        u.tBld = wall.id; return;   // combat's tBld branch paths the raider up and batters it
      }
      // BLOCKED BY A GAP: the route bogged down short of the aim and there's no
      // wall to batter — water OR a belt of forest/rock/orchard severs the approach.
      // Don't grind back and forth at the obstacle (or into the towers' teeth).
      // Flag the crossing so the chief breaches it (clear-cut / bridge), then act
      // by arm: bowmen/engines volley across, footmen fall back and wait.
      if (Math.hypot(end.x + 0.5 - goal.x, end.y + 0.5 - goal.y) > 2.5) {
        if (ai) ai.stall = { x: end.x, y: end.y, t: S.day };
        if (CFG.UNITS[u.kind].rng || CFG.UNITS[u.kind].proj) {
          // shell what's shooting us: the nearest tower (then any building). Not in
          // range yet? TARGET it anyway — the siege branch walks the engine up its
          // own bank as far as the ground allows and it fires the moment the first
          // boulder can fly. Engines standing idle out of range while the melee
          // died at the trench line was a real failure: an engine on a raid must
          // always be walking, aiming or firing.
          const tb = this.nearestBuilding(u.x, u.y, 'P', bb => bb.key === 'tower' && Bld.done(bb))
                  || this.nearestBuilding(u.x, u.y, 'P', bb => Bld.done(bb));
          if (tb && Math.hypot(Bld.cx(tb) - u.x, Bld.cy(tb) - u.y) <= 15) { u.tBld = tb.id; u.tUnit = 0; return; }
          return;   // nothing within marching distance to shell — keep on the forward path
        }
        this.aiStandoff(u);   // melee: retreat out of range and hold for a bridge
        return;
      }
      // reachable non-wall building near us (econ/house on the way)
      const b = this.nearestBuilding(u.x, u.y, 'P', bb => bb.key !== 'wall' && bb.key !== 'gate');
      if (b && Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y) < 4) {
        Units.setPath(u, b.x, b.y);
        const e2 = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x, y: u.y };
        if (Math.hypot(e2.x + 0.5 - Bld.cx(b), e2.y + 0.5 - Bld.cy(b)) <= 1.6 + Bld.reach(b)) { u.tBld = b.id; return; }
      }
      // ARRIVED at the objective and the field is bare — the chief pointed at
      // ground that has since been razed (or was never anything). Standing in an
      // empty meadow admiring rubble while the town lives was a real failure
      // (a catapult train parked 9 tiles from the hall, doing nothing): swing to
      // the real prize — the nearest standing tower first (the teeth), then any
      // finished building, then the hall itself. The tBld branch marches us there.
      if (Math.hypot(u.x - goal.x, u.y - goal.y) <= 3.5) {
        const nb = this.nearestBuilding(u.x, u.y, 'P', bb => bb.key === 'tower' && Bld.done(bb))
                || this.nearestBuilding(u.x, u.y, 'P', bb => Bld.done(bb));
        if (nb && Math.hypot(Bld.cx(nb) - u.x, Bld.cy(nb) - u.y) <= 16) { u.tBld = nb.id; u.tUnit = 0; return; }
        if (ptc) { u.tBld = ptc.id; u.tUnit = 0; return; }
      }
      return;   // keep marching toward the objective
    }
    // 4) nothing left to hit — go home
    u.task = null;
    const atc = Bld.tcOf('A');
    if (atc) { u.anchor = { x: atc.x + 0.5, y: atc.y + 2.5 }; Units.setPath(u, atc.x, atc.y + 2); }
  },

  // raiders + AI raid parties pick their objective. Barbarian bands follow
  // their spawn disposition: the player, the rival tribe, or whoever they find.
  raiderSeek(u) {
    if (u.owner === 'A') return this.aiRaidSeek(u);   // rival parties think tactically
    const disp = u.owner === 'R' ? (u.hostileTo || 'P') : 'P';
    const owners = disp === 'ALL' ? ['P', 'A'] : [disp];
    // priority of prey: soldiers first, then villagers, then buildings. The
    // hostileUnits check means an anyone-hating band that reaches the gates
    // mid-siege wades into the rival's raiders too — three-way brawls happen
    // (barbarian warriors count as soldiers for everyone hunting them).
    const fighter = o => Units.isMilitary(o) || (o.owner === 'R' && !Units.isTransport(o));
    const foe = this.nearestUnit(u.x, u.y, 6,
        o => this.hostileUnits(u, o) && fighter(o) && this.canEngage(u, o))
      || this.nearestUnit(u.x, u.y, 6,
        o => this.hostileUnits(u, o) && Units.isVillager(o) && this.canEngage(u, o));
    // only lock on if the prey is actually reachable — otherwise a band across a
    // severed crossing would freeze staring at a foe it can never close with
    if (foe && this.canReach(u, foe.x, foe.y, 1.6)) { u.tUnit = foe.id; return; }
    // barbarians loot and burn everything EXCEPT Town Centers — razing a
    // tribe's heart is normally beyond them, so they can't win the game for
    // anyone; once the rest is ash they wander off the map for good.
    // THE EXCEPTION: a COLLAPSED player (workforce gone for good, Moderate/Hard —
    // see game.js S.collapse) is finished off. Bands hunting the player march on
    // the player's OWN hall to end a lost game cleanly — never the rival's.
    const finishTC = S.collapse && (disp === 'P' || disp === 'ALL');
    const bldPred = u.owner === 'R'
      ? (bb => bb.key !== 'tc' || (finishTC && bb.owner === 'P'))
      : null;
    let b = null;
    for (const ow of owners) {
      const cand = this.nearestBuilding(u.x, u.y, ow, bldPred);
      if (cand && (!b || Math.hypot(cand.x - u.x, cand.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y)))
        b = cand;
    }
    if (b) {
      // try to reach the target; if walls are in the way the path stops short —
      // then batter the closest wall or gate instead
      Units.setPath(u, b.x, b.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x, y: u.y };
      if (Math.hypot(end.x + 0.5 - Bld.cx(b), end.y + 0.5 - Bld.cy(b)) <= 1.6 + Bld.reach(b)) { u.tBld = b.id; return; }
      // target's out of reach — batter through a wall or gate ONLY if we can get
      // to one; a wall we can't even reach means this pocket is sealed off from us
      const wall = this.nearestBuilding(u.x, u.y, b.owner, bb => bb.key === 'wall' || bb.key === 'gate');
      if (wall && this.canReach(u, wall.x, wall.y, 1.6 + Bld.reach(wall))) { u.tBld = wall.id; return; }
      // everything worth attacking is cut off — fall through and leave the board
    }
    // nothing left to attack (or all of it unreachable) — raiders leave, AI goes home
    if (u.owner === 'R') { this.raiderLeave(u); return; }
    if (u.owner === 'A') {
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
        if (!tgt) {
          u.tUnit = 0;
          // a defender falls back to its perimeter the moment its target drops;
          // an ordered attack ends where the fight ended — hold this ground
          if (u.defend) Units.returnToGuard(u);
          else if (u.task && u.task.type === 'attack') { u.task = null; u.anchor = { x: u.x, y: u.y }; }
          continue;
        }
        const d = Math.hypot(tgt.x - u.x, tgt.y - u.y);
        // hunting harmless game is a deliberate order — the hunter follows the prey
        if (Units.isPassive(tgt)) u.anchor = { x: u.x, y: u.y };
        // DEFEND — HOLD THE LINE. A guard never chases a foe out past its bound: it
        // strikes from inside and no further. Beyond the bound it's reined home;
        // inside it, if a step toward the foe would breach the ring it plants its
        // feet (an archer volleys over the wall, a spearman waits at the perimeter)
        // instead of running out to melee. When the foe BREACHES the ring it hunts
        // it down freely inside — that's the "more intelligent up close" behaviour.
        if (u.defend) {
          const gDef = Units.guardCenter(u);
          if (gDef) {
            const hold = Units.holdRadius(gDef, tgt.x, tgt.y);   // the bound TOWARD this foe (out to walls / water / rock)
            const dTC = Math.hypot(u.x - gDef.x, u.y - gDef.y);
            if (dTC > hold + 1.8) { u.tUnit = 0; Units.returnToGuard(u, gDef); continue; }   // dragged past the leash — home
            if (d > (CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE)) {   // out of range → about to move toward the foe
              if (dTC > hold + 0.6) { u.tUnit = 0; Units.returnToGuard(u, gDef); continue; }   // standing beyond the bound — fall back in
              const sx = u.x + (tgt.x - u.x) / (d || 1) * 0.5, sy = u.y + (tgt.y - u.y) / (d || 1) * 0.5;
              if (Math.hypot(sx - gDef.x, sy - gDef.y) > hold) { u.path = null; continue; }    // the step would cross the bound — plant feet, wait/volley
            }
          }
        } else {
          // guards give up long chases and go home; wild animals lose interest even
          // sooner. Player-ordered attacks are exempt — no leash yanks a soldier
          // back home mid-charge while the rest of the party fights.
          const leash = Units.isWild(u) ? CFG.ANIMALS.leash
            : (Units.isMilitary(u) && !(u.task && (u.task.type === 'raid' || u.task.type === 'attack'))) ? 10 : 0;
          if (leash && Math.hypot(u.x - u.anchor.x, u.y - u.anchor.y) > leash) {
            u.tUnit = 0;
            Units.setPath(u, u.anchor.x | 0, u.anchor.y | 0);
            if (!Units.isWild(u)) u.task = { type: 'move', x: u.anchor.x | 0, y: u.anchor.y | 0 };
            continue;
          }
        }
        if (!this.canEngage(u, tgt)) { u.tUnit = 0; continue; }
        const reach = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE;
        if (d > reach) {
          // at close range steer straight at the target — grid waypoints can't
          // corner moving prey; fall back to pathfinding around water/walls
          const step = u.speed * dt;
          const nx = u.x + (tgt.x - u.x) / d * step, ny = u.y + (tgt.y - u.y) / d * step;
          if (d < 3 && Path.canStep(u.x, u.y, nx, ny, u.owner, Units.domain(u))) {
            u.x = nx; u.y = ny; u.path = null;
          } else {
            if (u.repathT <= 0) {
              u.repathT = 0.5; Units.setPath(u, tgt.x | 0, tgt.y | 0);
              // a barbarian whose quarry slips beyond reach (a crossing fell
              // behind it) abandons the chase so it can wander off the map
              if (u.owner === 'R') {
                const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
                if (Math.hypot(end.x + 0.5 - tgt.x, end.y + 0.5 - tgt.y) > reach + 1) { u.tUnit = 0; continue; }
              }
            }
            Units.followPath(u, dt);
          }
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN * (CFG.UNITS[u.kind].cdMult || 1);
          const dmg = Math.max(1, Math.round(Units.effAtk(u) - tgt.def));
          if (CFG.UNITS[u.kind].proj) {
            this.launch(u, tgt.x, tgt.y, { kind: 'unit', id: tgt.id, dmg, srcId: u.id });
          } else {
            if (CFG.UNITS[u.kind].rng)
              this.shots.push({ x1: u.x, y1: u.y - 0.3, x2: tgt.x, y2: tgt.y, t: 0.15, fire: !!CFG.UNITS[u.kind].fire });
            R.float(tgt.x, tgt.y - 0.4, '-' + dmg, '#f08a7a');
            Units.damage(tgt, dmg, u.id);
          }
        }
        continue;
      }

      if (u.tBld) {
        let b = Bld.get(u.tBld);
        if (!b) {
          // the thing we were hitting fell. If it was a wall we broke to reach a
          // real target beyond it, resume on that target now the breach is open.
          if (u.task && u.task.finalBld) { const fb = Bld.get(u.task.finalBld); u.task.finalBld = 0; if (fb) { u.tBld = fb.id; b = fb; } }
          if (!b) { u.tBld = 0; continue; }
        }
        // fight back defenders that get close while sieging — but a bombard engine
        // (catapult/trebuchet/siege tower: no melee to speak of) never abandons the
        // wall to trade blows it can't win. It keeps hammering the structure and
        // leans on its escort for cover; that's what kept the siege line from
        // dissolving the moment a lone defender wandered up.
        if (!Units.isSiege(u)) {
          const foe = this.nearestUnit(u.x, u.y, 2.2,
            o => this.hostileUnits(u, o) && Units.isMilitary(o) && this.canEngage(u, o));
          if (foe) { u.tUnit = foe.id; continue; }
          // A MENDING HAND UNDOES THE BATTERING: a villager repairing or finishing
          // THIS building mid-fight is the smarter target — cut the crew down and
          // the walls stay broken. What any veteran raider would do; and it cuts
          // both ways (the player's soldiers switch onto the rival's builders too).
          const mend = this.nearestUnit(u.x, u.y, 6,
            o => this.hostileUnits(u, o) && Units.isVillager(o) &&
                 o.task && o.task.type === 'build' && o.task.id === b.id && this.canEngage(u, o));
          if (mend && this.canReach(u, mend.x, mend.y, 1.6)) { u.tUnit = mend.id; continue; }
        }
        const d = Math.hypot(Bld.cx(b) - u.x, Bld.cy(b) - u.y);
        // 1.55 floor so a DIAGONALLY-adjacent attacker (√2 ≈ 1.41 from a 1×1 wall's
        // centre) is still in range — at 1.3 a raider that walked up to a corner of
        // a gate just sat there, forever a hair out of reach, never landing a blow.
        const bReach = Math.max(1.55, CFG.UNITS[u.kind].rng || 0) + Bld.reach(b);
        if (d > bReach) {
          if (u.repathT <= 0) {
            u.repathT = 0.8; Units.setPath(u, b.x, b.y);
            // barbarians that can no longer reach their mark (the bridge they
            // crossed is gone) give up the siege and leave, not shuffle forever
            if (u.owner === 'R') {
              const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
              if (Math.hypot(end.x + 0.5 - Bld.cx(b), end.y + 0.5 - Bld.cy(b)) > bReach + 0.6) { u.tBld = 0; continue; }
            } else if (u.owner === 'P' && b.key !== 'wall' && b.key !== 'gate') {
              // a PLAYER-ordered attack that stalls short of its mark is walled off:
              // batter the blocking wall/gate open, remembering the real target so
              // the unit resumes on it once the breach is made. Otherwise footmen
              // just mill at the wall doing nothing.
              const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
              if (Math.hypot(end.x + 0.5 - Bld.cx(b), end.y + 0.5 - Bld.cy(b)) > bReach + 0.6) {
                const wall = this.nearestBuilding(u.x, u.y, b.owner, bb => bb.key === 'wall' || bb.key === 'gate');
                if (wall && wall.id !== u.tBld && this.canReach(u, wall.x, wall.y, 1.6 + Bld.reach(wall))) {
                  if (!u.task || u.task.type !== 'attackBld') u.task = { type: 'attackBld' };
                  u.task.finalBld = b.id; u.tBld = wall.id;
                  continue;   // canReach already set the path to the wall
                }
              }
            }
          }
          Units.followPath(u, dt);
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN * (CFG.UNITS[u.kind].cdMult || 1);
          // catapults/trebuchets break stone — boulders, not spear-pokes; the
          // axeman's heavy blade also bites deeper into timber and thatch
          const dmg = CFG.UNITS[u.kind].bldAtk ||
            Math.max(1, Math.round(Units.effAtk(u) * (CFG.UNITS[u.kind].bldMult || 1)));
          if (CFG.UNITS[u.kind].proj) {
            // siege engine: the boulder/bolt/flaming ball flies and lands the
            // damage on impact (with a dust or fire burst — see R.impact)
            this.launch(u, Bld.cx(b), Bld.cy(b), { kind: 'bld', id: b.id, dmg });
          } else {
            if (CFG.UNITS[u.kind].rng)
              this.shots.push({ x1: u.x, y1: u.y - 0.3, x2: Bld.cx(b), y2: Bld.cy(b), t: 0.15, fire: !!CFG.UNITS[u.kind].fire });
            this.hitBuilding(b, dmg, !!CFG.UNITS[u.kind].fire);
          }
        }
        continue;
      }

      if (u.tBridge) {
        // sever a crossing: walk beside the bridge tile and hack it down
        const br = Bld.bridgeAt ? Bld.bridgeAt(u.tBridge.x, u.tBridge.y) : null;
        if (!br) { u.tBridge = null; continue; }
        const foe = this.nearestUnit(u.x, u.y, 2.2, o => this.hostileUnits(u, o) && Units.isMilitary(o) && this.canEngage(u, o));
        if (foe) { u.tUnit = foe.id; continue; }
        const bx = br.x + 0.5, by = br.y + 0.5, d = Math.hypot(bx - u.x, by - u.y);
        const reach = Math.max(1.3, CFG.UNITS[u.kind].rng || 0);
        if (d > reach) {
          if (u.repathT <= 0) { u.repathT = 0.8; const s = this.tileAdjOpen(br.x, br.y, u.owner); if (s) Units.setPath(u, s.x, s.y); else { u.tBridge = null; continue; } }
          Units.followPath(u, dt);
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN * (CFG.UNITS[u.kind].cdMult || 1);
          const dmg = CFG.UNITS[u.kind].bldAtk || Math.max(1, Math.round(Units.effAtk(u) * (CFG.UNITS[u.kind].bldMult || 1)));
          if (CFG.UNITS[u.kind].rng) this.shots.push({ x1: u.x, y1: u.y - 0.3, x2: bx, y2: by, t: 0.15, fire: !!CFG.UNITS[u.kind].fire });
          R.float(bx, by - 0.3, '-' + dmg, '#e8d2a0');
          Bld.damageBridge(br, dmg);   // removes the span (and re-severs the crossing) at 0 hp
        }
      }
    }

    // watchtowers — and War Camps, which loose arrows like a Watchtower L1
    for (const b of S.buildings) {
      if ((b.key !== 'tower' && b.key !== 'warcamp') || !Bld.done(b) || b.upgrading > 0) continue;
      if (b.cd > 0) { b.cd -= dt; continue; }
      const lv = Bld.lv(b);
      const cx = b.x + 0.5, cy = b.y + 0.5;
      const tgt = this.nearestUnit(cx, cy, lv.range,
        o => this.hostileToBld(b, o) && !Units.isPassive(o) && o.kind !== 'siegetower');
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
    // advance siege projectiles; when one lands, apply its damage + burst
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.t >= p.dur) { this.impact(p); this.projectiles.splice(i, 1); }
    }
  },

  /* barbarian war-band spawning, called from the day tick */
  maybeWave() {
    if (S.day < S.wave.next) return;
    const m = G.modeCfg();
    S.wave.count++;
    S.wave.lastDay = S.day;   // so the rival can avoid piling a raid onto a fresh wave
    const gap = CFG.WAVES.minGap + Math.floor(G.rand() * (CFG.WAVES.maxGap - CFG.WAVES.minGap + 1));
    S.wave.next = S.day + Math.max(4, Math.round(gap * m.waveGapMult));
    // bands stay small — barbarians season a fight, they don't decide the war.
    // Hard lifts the LATE-game cap (bandCap) so the climax comes in numbers, not
    // in stat-inflated sponges; early bands are unaffected (the +count ramp hasn't
    // reached the cap yet), so the opening stays fair while the late game bites.
    const n = Math.max(1, Math.min(m.bandCap || 6, 1 + Math.ceil(S.wave.count * 0.5) + m.waveSizeAdd));
    // waves toughen over time; barbMult sets the mode baseline (Hard ≈ rival defenders)
    const scale = (1 + S.wave.count * CFG.WAVES.scaleHp) * (m.barbMult || 1);

    // every band rolls a temper — 10% hunt the player, 10% march on the rival,
    // 80% attack whomever they find. The village never learns which: the only
    // warning anyone gets is that barbarians are on the move.
    const dr = G.rand();
    const disp = dr < 0.10 ? 'P' : dr < 0.20 ? 'A' : 'ALL';
    const brute = i => (S.wave.count >= 4 && i % 3 === 2) ? 'brute' : 'raider';

    // the open wilderness network (see below) — also gates beach landings so
    // sea raiders can't step off inside someone's sealed walls
    let open = Path.borderReach();
    if (!open) {
      const seeds = (S.map.spawns.camps || []).slice();
      const atc0 = Bld.tcOf('A');
      if (atc0) seeds.push({ x: atc0.x, y: atc0.y + 2 });
      open = Path.reachFrom(seeds);
    }

    // seaborne raid: when open water touches the map edge, some bands arrive
    // by boat like viking raiders — sails first, then a landing on the beach
    // nearest their prey. Later waves come in the big war transports.
    if (G.rand() < 0.35) {
      const edges = [];
      // the outermost ring is off-map black void (impassable to hulls now), so the
      // longboats muster on the FIRST NAVIGABLE water, one tile in — the true coast
      const water = (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y) && Path.passable(x, y, null, 'water');
      for (let x = 1; x < CFG.W - 1; x++) { if (water(x, 1)) edges.push({ x, y: 1 }); if (water(x, CFG.H - 2)) edges.push({ x, y: CFG.H - 2 }); }
      for (let y = 2; y < CFG.H - 2; y++) { if (water(1, y)) edges.push({ x: 1, y }); if (water(CFG.W - 2, y)) edges.push({ x: CFG.W - 2, y }); }
      const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
      const tgt = disp === 'P' ? ptc : disp === 'A' ? atc : (G.rand() < 0.5 && atc ? atc : ptc) || atc;
      if (edges.length && tgt) {
        const start = edges[(G.rand() * edges.length) | 0];
        const route = Path.find(start.x, start.y, tgt.x, tgt.y, 'R', 'water') || [];
        // walk back from the water tile nearest the target to the first open beach
        const cells = [{ x: start.x, y: start.y }].concat(route);
        let landing = null;
        for (let ci = cells.length - 1; ci >= 0 && !landing; ci--) {
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const lx = cells[ci].x + ox, ly = cells[ci].y + oy;
            if (Path.passable(lx, ly) && (!open || open[MapGen.idx(lx, ly)])) { landing = { x: lx, y: ly }; break; }
          }
        }
        if (landing) {
          const kindT = S.wave.count >= 5 ? 'bigtransport' : 'transport';
          const tr = Units.spawn(kindT, 'R', start.x, start.y);
          tr.hostileTo = disp;
          tr.cargo = [];
          const aboard = Math.min(n, CFG.UNITS[kindT].cap);
          for (let i = 0; i < aboard; i++) {
            const ru = Units.spawn(brute(i), 'R', start.x, start.y, { scale });
            ru.hostileTo = disp;
            S.units.splice(S.units.indexOf(ru), 1);   // they ride in the hull
            tr.cargo.push(ru);
          }
          Units.orderUnload(tr, landing.x, landing.y);
          G.log('⛵ Sails on the horizon — a barbarian longboat makes for the shore!', true);
          return;
        }
      }
    }

    // Most waves march in from a randomized point along the map edge; only
    // occasionally do they muster at an existing raider camp. Keeping the entry
    // point varied stops bands from repeatedly funnelling into the same corner.
    let sx, sy;
    const camps = S.map.spawns.camps;
    if (camps.length && G.rand() < 0.25) {
      const c = camps[(G.rand() * camps.length) | 0];
      sx = c.x; sy = c.y;
    } else {
      const side = (G.rand() * 4) | 0;
      sx = side === 0 ? 0 : side === 1 ? CFG.W - 1 : (G.rand() * CFG.W) | 0;
      sy = side === 2 ? 0 : side === 3 ? CFG.H - 1 : (G.rand() * CFG.H) | 0;
    }
    // War parties march in — they never materialize on the player's doorstep.
    // Spawn tiles must be (a) in the open wilderness network: reachable from the
    // map border, or on all-water-border island maps from a raider camp / the
    // rival's town (this also keeps them out of sealed wall rings), and (b) at
    // least CLEAR tiles from every player building, so on island maps a wave
    // rolled near the player's shore relocates across the water instead of
    // landing on their beach.
    const inNet = (x, y) => Path.passable(x, y) && (!open || open[MapGen.idx(x, y)]);
    const CLEAR = 10;
    const farOk = (x, y) => {
      if (!inNet(x, y)) return false;
      for (const b of S.buildings)
        if (b.owner === 'P' && Math.hypot(b.x - x, b.y - y) < CLEAR) return false;
      return true;
    };
    const max = Math.max(CFG.W, CFG.H);
    const spot = MapGen.findNear(sx, sy, 6, farOk) || MapGen.findNear(sx, sy, max, farOk) ||
                 MapGen.findNear(sx, sy, max, inNet) ||
                 MapGen.findNear(sx, sy, max, (x, y) => Path.passable(x, y));
    if (!spot) return;
    for (let i = 0; i < n; i++) {
      const p = MapGen.findNear(spot.x, spot.y, 4, farOk) ||
                MapGen.findNear(spot.x, spot.y, 4, inNet) || spot;
      Units.spawn(brute(i), 'R', p.x, p.y, { scale }).hostileTo = disp;
    }
    G.log(`⚔ A barbarian war band is on the move (${n})!`, true);
  },
};
