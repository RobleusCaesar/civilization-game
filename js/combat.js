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
  // a fumbled arrow FLIES anyway — past the mark. The endpoint slides 0.9
  // tiles on down the flight line so the miss reads on screen (an arrow
  // that stops dead on the man it missed looks like a hit), and the expiry
  // tick below throws a puff of dirt where it lands. Deterministic — no
  // RNG draw, so the seeded combat stream (tests/tower-archer-miss.mjs)
  // is untouched.
  overshoot(s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l = Math.hypot(dx, dy) || 1;
    s.x2 += dx / l * 0.9; s.y2 += dy / l * 0.9; s.miss = true;
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
    /* THE CALM TRUCE (tests/calm-peace.mjs): while S.peace holds, the two
       TRIBES are not at war — no auto-acquisition, no tower fire, no hull
       broadsides, in EITHER direction (the player's own towers must not
       start the war the player never ordered). This is the one predicate
       both unit acquisition and building fire funnel through
       (hostileUnits / hostileToBld), which is why the gate lives here.
       Explicit orders don't ask it — they break the peace instead
       (G.breakPeace at every order site, plus the damage safety net).
       Barbarians and the wilds are untouched: the truce is between towns. */
    if (S && S.peace && ((a === 'P' && b === 'A') || (a === 'A' && b === 'P'))) return false;
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
    /* PREDATOR AND PREY (tests/wild-life.mjs): the wilderness is not one happy
       family. A wolf or a bear hunts deer and wild cattle — the only case
       where same-owner units are hostile, and deliberately ONE-WAY, since
       prey never fights back; it bolts (Units.grazeIdle). */
    if (u.owner === 'W' && o.owner === 'W')
      return Units.isPassive(o) && !Units.isPassive(u);
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
  /* The two funnels every building target is picked through. A structure that
     is NOT ATTACKABLE (Bld.attackable — the gold mine's works, which change
     hands rather than come down) is invisible to both, so nobody ever marches
     up and hammers something that cannot be hurt. */
  nearestBuilding(x, y, owner, pred) {
    let best = null, bd = 1e9;
    for (const b of S.buildings) {
      if (b.owner !== owner || !Bld.attackable(b)) continue;
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
  // vanishes; if no rim is reachable (stranded across a severed crossing, or
  // marooned off its longboat) it simply slips away rather than milling in
  // place forever. The exit is a COMMITTED march stored on u.leaving: while it
  // stands, raiderSeek stops re-planning toward prey every frame — those
  // best-effort setPath calls (canReach's side effect) would stomp the exit
  // route and read as "already walking", which left bands pacing the
  // shoreline forever instead of ever getting off the board.
  raiderLeave(u) {
    if (u.x < 2 || u.y < 2 || u.x > CFG.W - 2 || u.y > CFG.H - 2) {
      S.units.splice(S.units.indexOf(u), 1);   // reached the wilds — gone for good
      return;
    }
    if (u.leaving && Units.moving(u)) return;   // trudging out — let it walk
    const goal = u.leaving || this.nearestEdgeTile(u);
    if (goal) {
      Units.setPath(u, goal.x, goal.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
      if (end && (end.x <= 1 || end.y <= 1 || end.x >= CFG.W - 2 || end.y >= CFG.H - 2)) {
        u.leaving = { x: goal.x, y: goal.y };   // the road out still stands — march it
        return;
      }
    }
    // no road off the board from here — the band melts into the wilds
    S.units.splice(S.units.indexOf(u), 1);
  },

  // is the rival town on the line with too few soldiers to hold it? When an
  // enemy force reaches the hall and the guard can't clearly match it, the
  // townsfolk grab tools and pile on — four or five villagers can drag down a
  // lone attacker, and a tribe should never watch its heart fall without a
  // fight. Computed once per scan (drives the villager-militia branch below).
  MILITIA_RANGE: 9,
  /* What raises the militia. THE ONE PREDICATE, shared by townUnderSiege and
     the villager-militia acquire — it was two hand-rolled copies of
     `o.owner === 'P' && isMilitary`, which never asked hostileUnits, and that
     was THE CALM TRUCE's one leak (tests/calm-peace.mjs, a real day-4 save):
     a player rider merely RIDING PAST the rival hall at peace read as a
     siege, the townsfolk took up arms and stabbed it, and the damage safety
     net then declared the truce broken BY THE PLAYER. A soldier of a tribe
     we are not at war with is a visitor, not an attacker — so the P case
     asks hostile('A','P'), the peace-gated funnel. Barbarians signed
     nothing and still raise the militia. */
  militiaFoe(o) {
    // a LEVIED player villager counts like a soldier (tests/levy.mjs): a levy
    // marched on the rival hall must raise its townsfolk exactly as a war
    // party would — the mirror reflects both ways, and still through the
    // peace-gated funnel
    return (o.owner === 'P' && (Units.isMilitary(o) || Units.isLevied(o)) && this.hostile('A', 'P')) ||
           (o.owner === 'R' && !Units.isTransport(o));
  },
  townUnderSiege() {
    const tc = Bld.tcOf('A');
    if (!tc) return false;
    const cx = Bld.cx(tc), cy = Bld.cy(tc), R = this.MILITIA_RANGE;
    let foes = 0, guards = 0;
    for (const o of S.units) {
      if (Units.isNaval(o) || Math.hypot(o.x - cx, o.y - cy) > R) continue;
      if (this.militiaFoe(o)) foes++;
      else if (o.owner === 'A' && Units.isMilitary(o)) guards++;
    }
    return foes > 0 && guards < foes;
  },

  /* FOCUS FIRE (rival micro): where the player aims their own volleys, the
     rival used to swing at whatever stood NEAREST. Its soldiers now pick
     targets like a decent human: a wounded enemy is finished (removing its
     damage output entirely beats spreading dents), and high-value marks —
     siege engines, ballistae, sappers, then archers — die before chaff.
     Same radius, same reach rules as the nearest-pick it replaces; only the
     CHOICE within them is smarter. Player units are player-commanded and
     keep the plain nearest pick. */
  /* WHAT A FOE IS WORTH KILLING FIRST — in tiles of distance it may outweigh.

     From a real day-299 hard game: the player parked one catapult seven
     tiles off the rival's hall and shelled it flat while SIX defenders piled
     onto the swordsman standing at their feet. The old scorer gave a siege
     engine a flat +4, and an engine stands 5.5–8 tiles back BY DESIGN — its
     whole reason for existing — so the bonus could never outweigh the
     stand-off. The garrison always fought whatever was nearest, which is the
     one thing that was not killing the town.

     The measure of "doing the most damage to our town" is not a taste
     number: it is the unit's OWN anti-building stat. bldAtk is exactly that
     — catapult 110, trebuchet 200, bombard 190, against zero for every
     swordsman — so the ladder is DERIVED from the roster and any engine
     added later joins it for free, in proportion. A sapper carries no bldAtk
     yet breaches walls, so it is floored by hand; everything else adds its
     bite against our people and a tile for reaching us before we reach it.

     Memoised per KIND: it is a pure function of the roster, and this runs
     for every candidate of every scanning unit. */
  THREAT_BLD: 12,     // tiles of pull per point of building damage (110 → ~9)
  THREAT_SAPPER: 6,   // no bldAtk of its own, but it opens the wall
  _threatT: {},
  threatOf(o) {
    const memo = this._threatT;
    if (memo[o.kind] !== undefined) return memo[o.kind];
    const b = CFG.UNITS[o.kind] || {};
    let t = (b.bldAtk || 0) / this.THREAT_BLD;
    if (Units.isSapper(o)) t = Math.max(t, this.THREAT_SAPPER);
    t += (b.atk || 0) / 8;          // what it does to our people
    if (b.rng) t += 1;              // …and it strikes before we can close
    return (memo[o.kind] = t);
  },

  bestFoe(u, cx, cy, maxD, pred) {
    let best = null, bs = 1e9;
    for (const o of S.units) {
      if (o === u || o.hp <= 0) continue;
      const d = Math.hypot(o.x - cx, o.y - cy);
      if (d > maxD) continue;
      if (!pred(o)) continue;
      const base = CFG.UNITS[o.kind] || {};
      // distance still decides between equals, and a nearly-dead foe is worth
      // finishing — but THREAT now leads, which is the whole point
      const s = d - (1 - o.hp / (o.maxhp || base.hp || 1)) * 3 - this.threatOf(o);
      if (s < bs) { bs = s; best = o; }
    }
    return best;
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
        // …and with no one of the tribes to trouble, a wolf does what a wolf
        // does: works the treeline for GAME. It ranges further after deer than
        // it ever does after people, so the pack is seen hunting long before
        // it is ever a threat to a village (tests/wild-life.mjs).
        else {
          const d = this.nearestUnit(u.x, u.y, base.aggro * 2.5, o => Units.isPassive(o));
          if (d) u.tUnit = d.id;
        }
      } else if ((u.kind === 'boar' || u.kind === 'bear') && Units.isWild(u)) {
        const v = this.nearestUnit(u.x, u.y, base.aggro,
          o => (o.owner === 'P' || o.owner === 'A') && this.canEngage(u, o) &&
            !(window.Cards && Cards.atPeace(o.owner)));
        if (v) u.tUnit = v.id;
        else if (u.kind === 'bear') {                 // a bear takes game too
          const d = this.nearestUnit(u.x, u.y, base.aggro * 1.8, o => Units.isPassive(o));
          if (d) u.tUnit = d.id;
        }
      } else if ((u.kind === 'bear' || u.kind === 'wolf' || u.kind === 'boar') &&
                 (u.owner === 'P' || u.owner === 'A')) {
        // ORIGIN CARDS (Houndmaster): a kept guard-beast patrols its home
        // ground — wild predators and enemy soldiers alike answer to it
        const e = this.nearestUnit(u.x, u.y, base.aggro + 1,
          o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o));
        if (e && Math.hypot(e.x - u.anchor.x, e.y - u.anchor.y) < 8) u.tUnit = e.id;
      } else if (Units.isMilitary(u) && !(u.task && u.task.type === 'raid')) {
        /* ARMY STRATEGIES (tests/army-strategies.mjs) — the three assault
           doctrines a war party fights under (u.strat, set from the group
           panel; the rival's campaigns assign the same flags):
             strike — ABSOLUTE focus: never self-acquires anything, holds
                      ground when its ordered target falls, waits for orders
             chaos  — falls on everything in reach, by the priority ladder
             siege  — holds a picket post and guards the guns (siegeGuard) */
        if (u.strat === 'strike') continue;
        if (u.strat === 'chaos') { this.chaosSeek(u); continue; }
        if (u.strat === 'siege') { this.siegeGuard(u); continue; }
        // DEFEND: hold a perimeter round the Town Center / Dock — engage only foes
        // that reach the sortie bound of the POST (not just near the unit), and
        // never chase a provocation across the map (the leash lives in update()).
        if (u.defend) {
          const g = Units.guardCenter(u);
          if (g) {
            if (u.task && u.task.type === 'move') continue;   // still walking back to post
            const dc = Math.hypot(u.x - g.x, u.y - g.y);
            if (dc > Units.holdRadius(g, u.x, u.y) + Math.max(0.5, g.chase)) { Units.returnToGuard(u, g); continue; }
            // engage only a foe we can STRIKE while holding the line: one within the
            // bound (walls OR natural barriers) plus this unit's own weapon reach of
            // the hall. So an archer picks up an enemy still approaching the shore/wall
            // and volleys over it, a melee waits for the foe to reach the perimeter —
            // and neither chases a provocation out past the defended land.
            // A weaponless hull (siege tower) acquires nothing — it has no blow
            // to strike, and a 1-damage poke walk would only get it burned.
            const reach = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE || 1.5;
            const MAXR = CFG.GUARD.maxNatural || 14;
            const gpred = o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o) &&
              Math.hypot(o.x - g.x, o.y - g.y) <= Units.holdRadius(g, o.x, o.y) + reach + 0.5;
            const e = !(CFG.UNITS[u.kind].atk > 0) ? null
              : u.owner === 'A' ? this.bestFoe(u, g.x, g.y, g.r1 + MAXR + reach, gpred)
              : this.nearestUnit(g.x, g.y, g.r1 + MAXR + reach, gpred);
            // BACK TO YOUR POST: remember where the guard STOOD as the fight
            // began — kill or abandoned chase, returnToGuard walks it back to
            // this exact spot, not a generic point on the ring
            if (e) { u.guardPost = { x: u.x, y: u.y }; u.tUnit = e.id; }
            else if (dc > Units.holdRadius(g, u.x, u.y) && !Units.moving(u)) Units.returnToGuard(u, g);   // no foe → drift home
            continue;
          }
          // no Town Center / Dock to guard — fall through to the ordinary leash
        }
        // guards: engage hostiles near them (but don't stray while following an order,
        // and never auto-hunt harmless game — that's the player's call).
        // ENGINES ARE ALWAYS AWAKE: a catapult/trebuchet/ballista ships with
        // aggro 0 so it never WANDERS — but standing watch it still opens fire
        // by itself on anything that walks into its own weapon range (the
        // no-pursuit rule in update() keeps it from crawling after runners).
        if (u.task && u.task.type === 'move') continue;
        const aggroR = (Units.isSiege(u) || u.kind === 'ballista')
          ? Math.max(base.aggro || 0, (CFG.UNITS[u.kind].atk > 0 ? (base.rng || 0) + 0.5 : 0))
          : base.aggro;
        const lpred = o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o) &&
          !this.easedPrey(u, o);   // eased townsfolk are not prey — see easedPrey
        const e = u.owner === 'A' ? this.bestFoe(u, u.x, u.y, aggroR, lpred)
          : this.nearestUnit(u.x, u.y, aggroR, lpred);
        if (e && Math.hypot(e.x - u.anchor.x, e.y - u.anchor.y) < 9) { u.tUnit = e.id; continue; }
        // ASSAULT autonomy: a unit committed to an attack (the order flagged
        // u.assault) whose target has fallen presses on by itself — a fighter in
        // reach first, then the nearest enemy structure, then the hall — so the
        // player commands the assault, not every blow. Bounded to a radius so the
        // army clears the objective it was sent to, never wandering off the map.
        if (u.assault && u.strat !== 'strike') this.assaultSeek(u);   // strike holds and waits instead
      } else if (u.owner === 'A' && Units.isVillager(u)) {
        // rival townsfolk militia: when the town is under siege and
        // undermanned, whoever's near the hall picks up the nearest attacker
        if (this._militiaOn) {
          const tc = Bld.tcOf('A');
          if (tc && Math.hypot(u.x - Bld.cx(tc), u.y - Bld.cy(tc)) <= this.MILITIA_RANGE + 1) {
            // militiaFoe, never a hand-rolled owner check — the truce leak
            const e = this.nearestUnit(u.x, u.y, this.MILITIA_RANGE,
              o => this.militiaFoe(o) && this.canEngage(u, o));
            if (e) { u.tUnit = e.id; u.militia = true; }
          }
        } else if (u.militia) {
          u.militia = false;   // the siege has lifted — back to the lanes
        }
      } else if (Units.isLevied(u)) {
        /* THE LEVY (tests/levy.mjs): the player's mirror of the branch above.
           A villager under arms holds the TOWN'S OWN GROUND — auto-
           acquisition is perimeter-bound BOTH ways (the hand and the foe
           must each stand within MILITIA_RANGE of the hall), so the levy
           never ranges after a runner; an explicit order is the player's
           business and takes whatever bounds the player gives it. A doctrine
           in force is honoured exactly as a soldier's: chaos hunts by its
           own ladder, strike waits for the one ordered mark. hostileUnits is
           the peace-gated funnel, so a levy raised at peace threatens only
           the wilds until the player breaks the calm themselves. */
        if (u.strat === 'strike') continue;
        if (u.strat === 'chaos') { this.chaosSeek(u); continue; }
        /* A SPENT ORDER IS SPENT. An explicit attack sets task
           {type:'attack'|'attackBld'}, and nothing clears it on the kill —
           reaching this line with one still on means the marks are gone
           (a live tUnit/tBld is skipped at the top of the scan), so the
           order is finished and the hand is the levy's again. Left in
           place it wedged the villager forever: this branch read "busy",
           and unitBusy kept a Stop button lit over a hand doing nothing. */
        if (u.task && (u.task.type === 'attack' || u.task.type === 'attackBld')) {
          u.task = null; u.path = null;
        }
        if (u.task) continue;                       // walking / sheltering — busy
        const tc = Bld.tcOf('P');
        if (tc) {
          const cx = Bld.cx(tc), cy = Bld.cy(tc);
          if (Math.hypot(u.x - cx, u.y - cy) <= this.MILITIA_RANGE + 1) {
            const e = this.nearestUnit(u.x, u.y, this.MILITIA_RANGE,
              o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o) &&
                   Math.hypot(o.x - cx, o.y - cy) <= this.MILITIA_RANGE);
            // the anchor is where they STOOD — the chase leash above measures
            // from it, so the pursuit is bounded from the town side out
            if (e) { u.anchor = { x: u.x, y: u.y }; u.tUnit = e.id; }
          }
        }
      }
    }
  },

  // how far a committed attacker will look for its next mark once its target
  // falls. Big enough to clear a whole town's footprint, small enough that the
  // army holds at the objective instead of marching on across the map.
  ASSAULT_R: 15,

  /* ---- ARMY STRATEGIES (tests/army-strategies.mjs) ---- */
  CHAOS_R: 15,        // how far a chaos-stance soldier looks for its next victim
  SIEGE_PROTECT: 4,   // threats within this range of a siege post get engaged
  RAID_SHELL_R: 12,   // how far a raider with no orders looks for the enemy's own
                      // stonework before it gives up and marches home
  RAID_TRIES: 8,      // how many nearest buildings a loose band paths at before
                      // deciding the world is unreachable (one blocked outpost
                      // must never read as "nothing left to attack")

  /* CHAOS — attack anything in reach, in the player's stated order:
     civilians → soldiers → resource buildings → military halls → towers →
     walls → whatever's left. Reachability-checked like every other seek, so
     a villager safe behind a wall doesn't freeze the hunter. */
  chaosSeek(u) {
    if (u.task && u.task.type === 'move') return;   // finish the walk first
    const foe = u.owner === 'P' ? 'A' : 'P';
    const civ = this.nearestUnit(u.x, u.y, this.CHAOS_R, o => this.hostileUnits(u, o) &&
      !Units.isPassive(o) && (Units.isVillager(o) || Units.isSapper(o)) && this.canEngage(u, o));
    if (civ && this.canReach(u, civ.x, civ.y, 1.6)) { u.tUnit = civ.id; u.task = { type: 'attack' }; u.anchor = { x: u.x, y: u.y }; return; }
    const sol = this.nearestUnit(u.x, u.y, this.CHAOS_R, o => this.hostileUnits(u, o) &&
      !Units.isPassive(o) && Units.isMilitary(o) && this.canEngage(u, o));
    if (sol && this.canReach(u, sol.x, sol.y, 1.6)) { u.tUnit = sol.id; u.task = { type: 'attack' }; u.anchor = { x: u.x, y: u.y }; return; }
    const ECON = { farm: 1, house: 1, lumber: 1, quarry: 1, lodge: 1, trade: 1 };
    const MIL = { barracks: 1, range: 1, stable: 1, siege: 1, warcamp: 1, dock: 1, sapper: 1 };
    const tiers = [bb => ECON[bb.key], bb => MIL[bb.key], bb => bb.key === 'tower',
      bb => bb.key === 'wall' || bb.key === 'gate', bb => true];
    for (const pred of tiers) {
      const bld = this.nearestReachableBld(u, foe, this.CHAOS_R, pred);
      if (bld) { Units.orderAttackBuilding(u, bld); return; }
    }
  },

  /* SIEGE — the line stands its ground. A soldier with a siege post engages
     ONLY what comes to the line (SIEGE_PROTECT of the post, a little more
     for bows), walks back when displaced, and otherwise does nothing at all:
     it is there to shield the guns, not to win the battle by itself. */
  siegeGuard(u) {
    const p = u.siegePost;
    if (!p) return;
    if (u.task && u.task.type === 'move') return;   // heading to (or back to) the post
    if (CFG.UNITS[u.kind].atk > 0) {
      const rng = CFG.UNITS[u.kind].rng || 0;
      const R = this.SIEGE_PROTECT + (rng ? rng * 0.6 : 0);
      const e = this.nearestUnit(p.x + 0.5, p.y + 0.5, R, o => this.hostileUnits(u, o) &&
        !Units.isPassive(o) && this.canEngage(u, o));
      if (e) { u.tUnit = e.id; return; }
    }
    if (Math.hypot(u.x - (p.x + 0.5), u.y - (p.y + 0.5)) > 1.3) {
      u.task = { type: 'move', x: p.x, y: p.y, guard: true };
      Units.setPath(u, p.x, p.y);
    }
  },

  // the nearest enemy structure this unit could turn on — measured from its edge,
  // completed only. No pathfind here: if a wall/orchard seals the target off the
  // execution layer (Combat.update's tBld branch) batters the blocker open and
  // resumes, so "nearest" naturally means the outer shell first, then what's within.
  nearestReachableBld(u, owner, within, pred) {
    let best = null, bd = within;
    for (const b of S.buildings) {
      if (b.owner !== owner || !Bld.done(b) || !Bld.attackable(b)) continue;
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
    // how far INTO the town this round's host actually got — the only honest
    // measure of whether a siege plan is working (see AI.notePenetration)
    if (ai) AI.notePenetration(u);
    /* ARMY STRATEGIES (tests/army-strategies.mjs) colour the rival's raids:
       an escort under SIEGE doctrine belongs to the guns — it holds beside
       the column's nearest living engine and engages only what threatens it;
       a STRIKE column takes no opportunistic detours at all (the skips
       below) — one aim, no distractions, no peeling off when hit. */
    const strike = u.strat === 'strike';
    if (u.strat === 'siege' && !((Units.isSiege(u) || u.kind === 'ballista') && CFG.UNITS[u.kind].atk > 0)) {
      let eng = null, ed = 14;
      for (const o of S.units) {
        if (o.owner !== u.owner || !(o.task && o.task.type === 'raid')) continue;
        if (!((Units.isSiege(o) || o.kind === 'ballista') && CFG.UNITS[o.kind].atk > 0)) continue;
        const dd = Math.hypot(o.x - u.x, o.y - u.y);
        if (dd < ed) { ed = dd; eng = o; }
      }
      if (eng) {
        const threat = this.nearestUnit(eng.x, eng.y, this.SIEGE_PROTECT + 1.5,
          o => this.hostileUnits(u, o) && !Units.isPassive(o) && this.canEngage(u, o));
        if (threat && this.canReach(u, threat.x, threat.y, 1.6)) { u.tUnit = threat.id; return; }
        if (ed > 3.5) { if (this.repathOk(u)) { u.repathT = 0.8; Units.setPath(u, eng.x | 0, eng.y | 0); } }
        else u.path = null;   // in position — stand with the guns
        return;
      }
      // the guns are gone — the escort duty is over; fight on normally
    }
    // a probe party carries its OWN lane objective; the main force shares ai.raidObj
    const obj = u.raidObj || (ai && ai.raidObj) || null;
    const canWall = Units.isSiege(u) || u.kind === 'axeman' || !!CFG.UNITS[u.kind].bldAtk;
    // 1) a hostile fighter right in our face — engage (don't get picked apart).
    //    Only lock on if we can actually REACH it: a defender safe behind a wall
    //    must not distract the column from battering its way in.
    const foe = strike ? null : this.bestFoe(u, u.x, u.y, 5, o => this.hostileUnits(u, o) &&
      (Units.isMilitary(o) || (o.owner === 'R' && !Units.isTransport(o))) && this.canEngage(u, o));
    if (foe && this.canReach(u, foe.x, foe.y, 1.6)) { u.tUnit = foe.id; return; }
    /* 1a) EXPEDITION AGAINST A BARBARIAN CAMP (tests/raider-camps.mjs). A
       purge column's whole aim is the camp — none of the player-facing
       detours below apply to it. Tenders that come out to meet the column
       are step 1's problem (they strike at us, we engage what is in our
       face). The camp gone — burned by us or anyone — ends the errand: the
       walker turns for home, and the raid-maintenance block clears the
       ai-side state when the last of them drops off the raid roster. */
    if (obj && obj.type === 'camp') {
      const camp = Bld.get(obj.id);
      if (!camp || camp.key !== 'raidercamp') {
        const home = Bld.tcOf(u.owner);
        u.raidObj = null; u.tUnit = 0; u.tBld = 0;
        if (home) { u.task = { type: 'move', x: home.x, y: home.y + Bld.size(home) }; Units.setPath(u, home.x, home.y + Bld.size(home)); }
        else u.task = null;
        return;
      }
      if (Math.hypot(Bld.cx(camp) - u.x, Bld.cy(camp) - u.y) <= 2.6 + Bld.reach(camp)) {
        u.tBld = camp.id; u.tUnit = 0; return;   // at the fire — pull it down
      }
      if (u.repathT <= 0) { u.repathT = 0.8; Units.setPath(u, camp.x, camp.y); }
      return;
    }
    /* 1b) AN ANCIENT WONDER UNDER CONSTRUCTION beats every other target on the
       board — finishing it simply wins the game, so once a raider is within
       striking distance of the works nothing else is worth a swing. Placed
       AFTER the "engage what's in our face" step, so the column still defends
       itself, and before every opportunistic detour below (tests/wonder.mjs). */
    if (ai && ai.wonderAlarm) {
      const won = Bld.get(ai.wonderAlarm.id);
      if (won && won.owner === 'P' && won.key === 'wonder' &&
          Math.hypot(Bld.cx(won) - u.x, Bld.cy(won) - u.y) <= 2.6 + Bld.reach(won)) {
        u.tBld = won.id; u.tUnit = 0; return;
      }
    }
    // 2) soft targets on the way — an enemy SAPPER (defenceless, mid-work, high
    //    value) is the juiciest, then isolated villagers, then undefended workplaces.
    //    Reachability again: villagers tucked behind the walls are NOT a target —
    //    fixating on them is exactly what left raiders idling at the gate.
    const sap = strike ? null : this.nearestUnit(u.x, u.y, 8, o => o.owner === 'P' && Units.isSapper(o) && this.canEngage(u, o));
    if (sap && this.canReach(u, sap.x, sap.y, 1.6)) { u.tUnit = sap.id; return; }
    const soft = strike ? null : this.nearestUnit(u.x, u.y, 7, o => o.owner === 'P' && Units.isVillager(o) && this.canEngage(u, o));
    if (soft && this.canReach(u, soft.x, soft.y, 1.6)) { u.tUnit = soft.id; return; }
    // a player BRIDGE within reach — cutting the crossing severs an expansion or
    // flanking route. Only worth it if we can actually stand beside it.
    if (!strike && S.bridges && S.bridges.length) {
      let bb = null, bd = 6;
      for (const br of S.bridges) {
        if (br.owner !== 'P') continue;
        const dd = Math.hypot(br.x + 0.5 - u.x, br.y + 0.5 - u.y);
        if (dd < bd && this.tileAdjOpen(br.x, br.y, u.owner)) { bd = dd; bb = br; }
      }
      if (bb) { u.tBridge = { x: bb.x, y: bb.y }; u.tUnit = 0; u.tBld = 0; return; }
    }
    const econ = strike ? null : this.nearestBuilding(u.x, u.y, 'P',
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
    /* 4) NO ORDERS AND NOTHING WE CAN REACH — but we are standing in front of
       their works. A column that can SEE the villagers and cannot get at them
       must NOT stand there waiting to be shot: it turns on the SHELL. Nearest
       wall or gate first (that is the way in), then anything else it can walk
       up to. The raid TASK is kept and only u.tBld set — exactly as the
       objective branch above does — so the chief's own bookkeeping (extend,
       break off, learn the lane) still sees a raid under way. Only a party
       with nothing at all inside RAID_SHELL_R gives up and marches home.
       (tests/siege-progress.mjs) */
    if (!u.harass) {
      const near = (bb) => Math.hypot(Bld.cx(bb) - u.x, Bld.cy(bb) - u.y) <= this.RAID_SHELL_R;
      const reach = (bb) => this.canReach(u, bb.x, bb.y, 1.7 + Bld.reach(bb));
      const shell = this.nearestBuilding(u.x, u.y, 'P', bb => (bb.key === 'wall' || bb.key === 'gate') && near(bb) && reach(bb))
                 || this.nearestBuilding(u.x, u.y, 'P', bb => Bld.done(bb) && near(bb) && reach(bb));
      if (shell) {
        if (ai && ai.memory) ai.memory.wallHit = (ai.memory.wallHit || 0) + 1;
        u.tUnit = 0; u.tBld = shell.id;
        return;
      }
    }
    // nothing left to hit — go home
    u.task = null;
    const atc = Bld.tcOf('A');
    if (atc) { u.anchor = { x: atc.x + 0.5, y: atc.y + 2.5 }; Units.setPath(u, atc.x, atc.y + 2); }
  },

  // raiders + AI raid parties pick their objective. Barbarian bands follow
  // their spawn disposition: the player, the rival tribe, or whoever they find.
  /* THE CHASE IS LEASHED TO THE FIRE TOO (tests/raider-camps.mjs). Keeping a
     tender's ACQUISITION inside the camp's ground was only half the rule: once
     it had a mark, the chase ran on the generic 10-tile anchor leash — twice
     the camp's own ground — and everything a barbarian frightens runs HOME. A
     village's people flee to their hall, so the band followed them there and
     stood outside somebody's town killing whoever came out, day after day.
     Measured on a passive-player sim, that alone cost the rival 47 villagers
     by day 200 on one seed: an economy paid per living hand simply never left
     the ground. So a tender lets a runner go the moment either of them leaves
     the camp's ground, and walks back to its fire. Returns true when the chase
     was called off. Owner-agnostic in spirit — only camps have tenders. */
  campLeash(u, tgt) {
    const camp = Bld.get(u.campId);
    if (!camp || camp.owner !== 'R') { u.campId = 0; return false; }
    const RC = CFG.RAIDER_CAMPS || {};
    const cR = RC.chaseR || 7;
    const reachW = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE || 1.5;
    const hx = camp.x + 0.5, hy = camp.y + 0.5;
    // the quarry has left our ground, or the chase has dragged US off it
    if (Math.hypot(tgt.x - hx, tgt.y - hy) <= cR + reachW + 1.5 &&
        Math.hypot(u.x - hx, u.y - hy) <= cR + 1.5) return false;
    u.tUnit = 0; u.task = null;
    u.anchor = { x: hx, y: hy };
    Units.setPath(u, camp.x, camp.y);
    return true;
  },

  /* THE EASE REACHES EVERY FRESH ACQUISITION (a real day-175 save): raiderSeek's
     hunt filtered eased owners, but two OTHER ways a campless barbarian takes a
     mark did not — the leaving-march's "cut down whatever stands in the way"
     probe, and the generic military acquire scan. Either one re-marked an eased
     villager standing beside the exit road, the ease-drop in update() cleared
     it the very next frame, and the band froze mid-stride vibrating on one tile
     forever: acquire → drop → re-plan → acquire, position never advancing.
     ONE PREDICATE (militiaFoe's lesson), asked at every fresh acquisition.
     Tenders (campId) are exempt — their fight is the camp's, not the war's —
     and Units.damage retaliation doesn't ask it: struck barbarians hit back. */
  easedPrey(u, o) {
    return u.owner === 'R' && !u.campId && o.owner !== 'R' && G.barbEase(o.owner);
  },

  /* the open wilderness network: ground reachable from the map border — or,
     on all-water-border island maps, from beside each camp and the rival's
     town (the camp tile itself is a BUILDING now, and buildings are solid —
     seed the flood from the open ground BESIDE each camp, or the network
     comes back empty; tests/raider-camps.mjs). Shared by spawnWave's musters
     and the Sea Folk sortie's landings (G.seaSortie). */
  openNet() {
    let open = Path.borderReach();
    if (!open) {
      const seeds = [];
      for (const c of (S.map.spawns.camps || [])) {
        const near = MapGen.findNear(c.x, c.y, 3, (x, y) => Path.passable(x, y));
        if (near) seeds.push(near);
      }
      const atc0 = Bld.tcOf('A');
      if (atc0) seeds.push({ x: atc0.x, y: atc0.y + 2 });
      open = Path.reachFrom(seeds);
    }
    return open;
  },

  raiderSeek(u) {
    if (u.owner === 'A') return this.aiRaidSeek(u);   // rival parties think tactically
    const disp = u.owner === 'R' ? (u.hostileTo || 'P') : 'P';
    /* A GUTTED TOWN IS LEFT ALONE (G.barbEase, tests/raider-camps.mjs) — not
       only by the next wave, but by the bands already in the field. A tribe on
       its knees drops off the target list entirely; if that leaves the band
       with nobody to hunt, it does what a band with nothing to hunt has always
       done and walks off the map. Tenders are unaffected: they are defending
       their own ground, not choosing a town to sack. */
    let owners = disp === 'ALL' ? ['P', 'A'] : [disp];
    if (u.owner === 'R') owners = owners.filter(o => !G.barbEase(o));
    // COMMITTED TO LEAVING — walk the stored exit and plan nothing else. Without
    // this, the full seek below re-ran every frame and its best-effort setPath
    // calls stomped the exit route (canReach's side effect reads as "already
    // walking"), leaving the band pacing the shore forever. A departing band
    // still cuts down whatever stands directly in its way, nothing more —
    // but never the people of an eased town (easedPrey): re-marking one only
    // feeds the ease-drop in update() and the band vibrates in place forever.
    if (u.owner === 'R' && u.leaving) {
      const near = this.nearestUnit(u.x, u.y, 2.5,
        o => this.hostileUnits(u, o) && !Units.isNaval(o) && this.canEngage(u, o) &&
             !this.easedPrey(u, o));
      if (near && this.canReach(u, near.x, near.y, 1.6)) { u.tUnit = near.id; u.leaving = null; return; }
      if (near) u.path = null;   // drop canReach's best-effort route — it is NOT the exit march
      this.raiderLeave(u);
      return;
    }
    /* A CAMP'S OWN BAND STAYS AT THE CAMP (tests/raider-camps.mjs). Tenders
       are not a war party: they mill about their own ground, fight whatever
       walks into it, and never set off across the map after a villager they
       glimpsed. That is what makes the far country dangerous WITHOUT turning
       every camp into a permanent invasion. Burn the camp and the band is
       loose — it becomes an ordinary raider band from that moment. */
    if (u.owner === 'R' && u.campId) {
      const camp = Bld.get(u.campId);
      if (!camp || camp.owner !== 'R') {
        u.campId = 0;                                  // the camp is gone; hunt like any other band
      } else {
        const RC = CFG.RAIDER_CAMPS || {};
        const gR = RC.guardR || 5, cR = RC.chaseR || 7;
        const hx = camp.x + 0.5, hy = camp.y + 0.5;
        // HOME IS THE FIRE, ALWAYS. The generic 10-tile chase leash measures
        // from u.anchor, and a walk home that ends short re-anchors the unit
        // where it stopped (the 'move' completion in units.js) — so a tender
        // dragged out once could be dragged out again from there, and again.
        // Re-stamping the anchor every scan keeps that ratchet from ever
        // starting: a tender's home never drifts off its own camp.
        u.anchor = { x: hx, y: hy };
        /* A SEA FOLK HULL RIDES AT ANCHOR (tests/tribe-traits.mjs): the fire
           warship answers whatever drifts into its own arc — a harbor gun,
           no pursuit, never a land path — and a transport just swings on
           its line until the sortie calls it (G.seaSortie). */
        if (Units.isNaval(u)) {
          u.tUnit = 0; u.tBld = 0;
          if ((CFG.UNITS[u.kind].atk || 0) > 0) {
            const arc = (CFG.UNITS[u.kind].rng || 2) + 0.5;
            const prey = this.nearestUnit(u.x, u.y, arc,
              o => this.hostileUnits(u, o) && this.canEngage(u, o));
            if (prey) u.tUnit = prey.id;
          }
          return;
        }
        /* A TENDER NEVER MARCHES TO THE WATERLINE TO GLARE ACROSS IT (a real
           day-20 save: the wolf camp on the north island probed villagers
           working the far side of the channel every scan — canReach failed,
           water between them, but its SIDE EFFECT set a best-effort path
           toward the prey, so the band walked to its own bank and stood at
           the town's doorstep "not entering", oscillating with the amble-home
           below). The leaving-branch above learned this same lesson first:
           when the probe fails, DROP the best-effort route. */
        // anyone hacking at the camp itself is the first business of the day
        const atCamp = this.nearestUnit(hx, hy, cR,
          o => this.hostileUnits(u, o) && !Units.isNaval(o) && this.canEngage(u, o));
        if (atCamp) {
          if (this.canReach(u, atCamp.x, atCamp.y, 1.6)) { u.tUnit = atCamp.id; return; }
          u.path = null;
        }
        // …then anything that has strayed into the camp's ground
        const near = this.nearestUnit(u.x, u.y, cR,
          o => this.hostileUnits(u, o) && !Units.isNaval(o) && this.canEngage(u, o) &&
               Math.hypot(o.x - hx, o.y - hy) <= cR + 2);
        if (near) {
          if (this.canReach(u, near.x, near.y, 1.6)) { u.tUnit = near.id; return; }
          u.path = null;
        }
        u.tUnit = 0; u.tBld = 0;
        const d = Math.hypot(u.x - hx, u.y - hy);
        if (d > gR) {                                  // strayed too far — amble home
          if (u.repathT <= 0) { u.repathT = 1; Units.setPath(u, camp.x, camp.y); }
          return;
        }
        // MILLING: a slow, aimless wander inside the camp's ground. Seeded, so
        // a seed's camp reads the same way twice.
        if (!Units.moving(u) && G.rand() < 0.03) {
          const wx = (hx + (G.rand() * 2 - 1) * gR * 0.75) | 0;
          const wy = (hy + (G.rand() * 2 - 1) * gR * 0.75) | 0;
          if (MapGen.inB(wx, wy) && Path.passable(wx, wy, 'R')) Units.setPath(u, wx, wy);
        }
        return;
      }
    }
    // priority of prey: soldiers first, then ANY other land unit — villagers,
    // sappers, scouts: a barbarian doesn't spare the help just because it
    // carries a spade instead of a spear. The hostileUnits check means an
    // anyone-hating band that reaches the gates mid-siege wades into the
    // rival's raiders too — three-way brawls happen (barbarian warriors count
    // as soldiers for everyone hunting them).
    const fighter = o => Units.isMilitary(o) || (o.owner === 'R' && !Units.isTransport(o));
    // …and the people of a town the wilds have eased off are not prey either.
    // Struck, a barbarian still hits back — that is Units.damage's retaliation,
    // not a hunt.
    const mark = o => u.owner !== 'R' || o.owner === 'R' || !G.barbEase(o.owner);
    const foe = this.nearestUnit(u.x, u.y, 6,
        o => this.hostileUnits(u, o) && mark(o) && fighter(o) && this.canEngage(u, o))
      || this.nearestUnit(u.x, u.y, 6,
        o => this.hostileUnits(u, o) && mark(o) && !Units.isNaval(o) && this.canEngage(u, o));
    // only lock on if the prey is actually reachable — otherwise a band across a
    // severed crossing would freeze staring at a foe it can never close with
    if (foe) {
      if (this.canReach(u, foe.x, foe.y, 1.6)) { u.tUnit = foe.id; return; }
      u.path = null;   // drop canReach's best-effort route before deciding what's next
    }
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
    /* ONE BLOCKED BUILDING IS NOT A BLOCKED WORLD (a QA day-110 lakes map):
       the seek used to try only the single crow-flight-NEAREST building —
       and when that one outpost sat across a lake, the band declared
       EVERYTHING unreachable and walked off the map, with both towns
       provably walkable the long way round. Candidates are now tried
       nearest-first up to RAID_TRIES deep; the first whose path actually
       lands wins. A fully WALLED town still fails all its tries — that is
       what the wall-batter fallback below is for, per failed owner. */
    const cands = [];
    for (const ow of owners) for (const bb of S.buildings) {
      if (bb.owner !== ow || !Bld.attackable(bb)) continue;
      if (bldPred && !bldPred(bb)) continue;
      cands.push(bb);
    }
    cands.sort((a, z) =>
      (Math.hypot(Bld.cx(a) - u.x, Bld.cy(a) - u.y) - Bld.reach(a)) -
      (Math.hypot(Bld.cx(z) - u.x, Bld.cy(z) - u.y) - Bld.reach(z)));
    const tried = cands.slice(0, this.RAID_TRIES);
    for (const b of tried) {
      // walk the path; if it lands beside the target, that's the mark
      Units.setPath(u, b.x, b.y);
      const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x, y: u.y };
      if (Math.hypot(end.x + 0.5 - Bld.cx(b), end.y + 0.5 - Bld.cy(b)) <= 1.6 + Bld.reach(b)) { u.tBld = b.id; return; }
    }
    // every try stopped short — batter through a wall or gate ONLY if we can
    // get to one; a wall we can't even reach means the pocket is sealed off
    for (const ow of [...new Set(tried.map(bb => bb.owner))]) {
      const wall = this.nearestBuilding(u.x, u.y, ow, bb => bb.key === 'wall' || bb.key === 'gate');
      if (wall && this.canReach(u, wall.x, wall.y, 1.6 + Bld.reach(wall))) { u.tBld = wall.id; return; }
    }
    // everything worth attacking is cut off — fall through and leave the board
    // nothing left to attack (or all of it unreachable) — raiders leave, AI goes home
    if (u.owner === 'R') { this.raiderLeave(u); return; }
    if (u.owner === 'A') {
      u.task = null;
      u.strat = null; u.siegePost = null;   // the assault is over — the doctrine stands down with it
      const tc = Bld.tcOf('A');
      if (tc) { u.anchor = { x: tc.x + 0.5, y: tc.y + 2.5 }; Units.setPath(u, tc.x, tc.y + 2); }
    }
  },

  /* THE REPATH BUDGET (a real endgame freeze): an army ordered onto the
     rival's hall acquires its building mark in the same scan, so sixty
     soldiers' 0.8s repath timers expired on the same beat — sixty A*
     calls in one frame, ~17ms on desktop and a rhythmic freeze on the
     phone, every 0.8 seconds for the length of the assault. The budget
     caps repaths per frame; a unit past its timer that misses the budget
     simply goes next frame — and because each unit's NEXT expiry is 0.8s
     after the repath it actually got, one burst through the budget
     de-synchronizes the whole army permanently. Cadence per unit is
     unchanged; the per-frame worst case is capped. */
  REPATH_BUDGET: 6,
  repathOk(u) {
    if (u.repathT > 0) return false;
    // self-resetting on the Units.update frame stamp: raiderSeek spends
    // from this budget during the UNITS phase, before update() below runs
    const f = (typeof Units !== 'undefined' && Units._frame) || 0;
    if (this._rpFrame !== f) { this._rpFrame = f; this._rpBudget = this.REPATH_BUDGET; }
    if (this._rpBudget <= 0) return false;   // spike cap — catch it next frame
    this._rpBudget--;
    return true;
  },

  update(dt) {
    this._rpBudget = this.REPATH_BUDGET;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.4; this.acquire();
      if (window.R && R.noteFights) R.noteFights();   // the birds go up when a fight breaks out
    }

    for (const u of S.units) {
      if (u.repathT > 0) u.repathT -= dt;

      if (u.tUnit) {
        const tgt = Units.get(u.tUnit);
        /* THE EASE REACHES BANDS ALREADY IN THE FIGHT (tests/raider-camps.mjs).
           raiderSeek stops NEW acquisitions of an eased owner, but a band that
           took its mark a minute before the ease flipped kept killing — the
           gutting the ease exists to stop was finished by units it never
           touched. A raider holding an eased owner's unit drops it here.
           Tenders keep defending their own ground (their fight is the camp's,
           not the war's), and Units.damage retaliation re-marks an attacker
           the next time it is actually struck — struck barbarians still
           strike back. Cheap: barbEase is latch-cached per day. */
        if (tgt && u.owner === 'R' && !u.campId && G.barbEase(tgt.owner)) {
          u.tUnit = 0; u.path = null;
        } else
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
            // the trail allowance is the DOCTRINE's, not a flat slack: blades
            // may follow a foe two tiles past the bound, bows one, engines
            // none — then everyone is reined home (tests/defend-hold.mjs)
            const chase = gDef.chase != null ? gDef.chase : 1.8;
            const reachW = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE;
            const dTC = Math.hypot(u.x - gDef.x, u.y - gDef.y);
            // the foe has LEFT the defended ground (its engagement bound plus
            // our weapon plus the trail grace) — let the runner go. Trailing
            // retreating attackers across the field is how guards die.
            if (Math.hypot(tgt.x - gDef.x, tgt.y - gDef.y) > hold + reachW + chase + 0.5) {
              u.tUnit = 0; Units.returnToGuard(u, gDef); continue;
            }
            if (dTC > hold + chase + 0.8) { u.tUnit = 0; Units.returnToGuard(u, gDef); continue; }   // dragged past the leash — home
            if (d > reachW) {   // out of range → about to move toward the foe
              if (dTC > hold + chase + 0.2) { u.tUnit = 0; Units.returnToGuard(u, gDef); continue; }   // standing beyond the bound — fall back in
              const sx = u.x + (tgt.x - u.x) / (d || 1) * 0.5, sy = u.y + (tgt.y - u.y) / (d || 1) * 0.5;
              if (Math.hypot(sx - gDef.x, sy - gDef.y) > hold + chase) { u.path = null; continue; }    // the step would cross the bound — plant feet, wait/volley
            }
          }
        } else if (u.strat === 'siege' && u.siegePost) {
          // THE LINE HOLDS (tests/army-strategies.mjs): fight what comes to
          // the post, never march off after it — a runner is let go and the
          // guard walks back to its place in the line
          const px2 = u.siegePost.x + 0.5, py2 = u.siegePost.y + 0.5;
          const reachW = CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE;
          if (Math.hypot(u.x - px2, u.y - py2) > 3 ||
              Math.hypot(tgt.x - px2, tgt.y - py2) > this.SIEGE_PROTECT + reachW + 1.5) {
            u.tUnit = 0;
            u.task = { type: 'move', x: u.siegePost.x, y: u.siegePost.y, guard: true };
            Units.setPath(u, u.siegePost.x, u.siegePost.y);
            continue;
          }
        } else if (u.campId && this.campLeash(u, tgt)) {
          continue;   // a tender let its quarry go and is walking back to its fire
        } else {
          // A BOMBARD ENGINE MINDS ITS GROUND: unordered (no raid/attack task),
          // it fires on what's in range and lets what walks away go — pursuit
          // is its escort's job. Without this a catapult that opened fire by
          // itself would then crawl off after the runner at 1.0 speed.
          if ((Units.isSiege(u) || u.kind === 'ballista') && !u.assault &&
              !(u.task && (u.task.type === 'raid' || u.task.type === 'attack')) &&
              d > (CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE) + 0.6) { u.tUnit = 0; continue; }
          // guards give up long chases and go home; wild animals lose interest even
          // sooner. Player-ordered attacks are exempt — no leash yanks a soldier
          // back home mid-charge while the rest of the party fights.
          // …and the LEVY is leashed like a guard (tests/levy.mjs): a
          // villager is neither wild nor military, so without this line its
          // chase had leash 0 — a foe that brushed the perimeter and withdrew
          // dragged the whole levy across the map, the exact ranging the
          // perimeter exists to forbid. Ordered attacks stay exempt.
          const leash = Units.isWild(u) ? CFG.ANIMALS.leash
            : ((Units.isMilitary(u) || Units.isLevied(u)) && !(u.task && (u.task.type === 'raid' || u.task.type === 'attack'))) ? 10 : 0;
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
          /* at close range steer straight at the target — grid waypoints can't
             corner moving prey; fall back to pathfinding around water/walls.
             BUT A COMMITTED DETOUR HAS RIGHT OF WAY. The steer used to fire
             whenever ANY micro-step toward the prey was momentarily clear —
             yanking the unit off its freshly planned path, NULLING the path,
             and letting the next half-second repath plan the same detour
             again. At a concave treeline corner that is a perfect trap orbit:
             plan two steps, get yanked back, plan again — a real day-22 game
             had a rival defender jittering beside the villager it was hunting
             for minutes, never landing a blow. While a path is underway the
             steer only takes over for the final LUNGE — one clear step from
             striking range — so the unit walks the detour like it means it. */
          const step = u.speed * dt;
          const nx = u.x + (tgt.x - u.x) / d * step, ny = u.y + (tgt.y - u.y) / d * step;
          if ((!Units.moving(u) || d <= reach + 0.5) &&
              d < 3 && Path.canStep(u.x, u.y, nx, ny, u.owner, Units.domain(u))) {
            u.x = nx; u.y = ny; u.path = null;
          } else {
            if (this.repathOk(u)) {
              u.repathT = 0.5; Units.setPath(u, tgt.x | 0, tgt.y | 0);
              // a barbarian — or the rival's soldier — whose quarry slips
              // beyond reach (a crossing fell behind it, the woods regrew
              // across the lane) abandons the chase instead of staring at
              // prey it can never touch; its own seek picks a reachable mark
              // on the next scan. Player units keep their explicit orders.
              if (u.owner === 'R' || u.owner === 'A') {
                const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
                if (Math.hypot(end.x + 0.5 - tgt.x, end.y + 0.5 - tgt.y) > reach + 1) { u.tUnit = 0; continue; }
              }
            }
            Units.followPath(u, dt);
          }
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN * (CFG.UNITS[u.kind].cdMult || 1);
          const dmg = Math.max(1, Math.round(Units.effAtk(u) - Units.effDef(tgt)));
          if (CFG.UNITS[u.kind].proj) {
            this.launch(u, tgt.x, tgt.y, { kind: 'unit', id: tgt.id, dmg, srcId: u.id });
          } else {
            let sh = null;
            if (CFG.UNITS[u.kind].rng)
              this.shots.push(sh = { x1: u.x, y1: u.y - 0.3, x2: tgt.x, y2: tgt.y, t: 0.24, t0: 0.24, fire: !!CFG.UNITS[u.kind].fire });
            // THE BASE ARCHER FUMBLES 1 IN 4 SHOTS — the cheap early bowman
            // trained straight off a Lv1 Range; the Lv2/Lv3 upgrades (longbow,
            // marksman) are untouched. Owner-agnostic, same as the tower nerf.
            // (push-then-roll order is pinned by the seeded-stream tests; a
            // miss retro-fits the already-pushed shot with the overshoot)
            if (u.kind === 'archer' && G.rand() < 1 / 4) {
              if (sh) this.overshoot(sh);
              R.float(tgt.x, tgt.y - 0.4, 'Miss!', '#cfcfcf');
            } else {
              R.float(tgt.x, tgt.y - 0.4, '-' + dmg, '#f08a7a');
              Units.damage(tgt, dmg, u.id);
            }
          }
        }
        continue;
      }

      if (u.tBld) {
        let b = Bld.get(u.tBld);
        // same ease rule for a building mark (see the tUnit branch above)
        if (b && u.owner === 'R' && !u.campId && G.barbEase(b.owner)) { u.tBld = 0; u.path = null; continue; }
        if (!b) {
          // the thing we were hitting fell. If it was a wall we broke to reach a
          // real target beyond it, resume on that target now the breach is open.
          if (u.task && u.task.finalBld) { const fb = Bld.get(u.task.finalBld); u.task.finalBld = 0; if (fb) { u.tBld = fb.id; b = fb; } }
          if (!b) { u.tBld = 0; continue; }
        }
        // backstop: an order given before the rule (or a legacy save) must not
        // leave somebody swinging forever at works that cannot be hurt
        if (!Bld.attackable(b)) { u.tBld = 0; continue; }
        // fight back defenders that get close while sieging — but a bombard engine
        // (catapult/trebuchet/siege tower: no melee to speak of) never abandons the
        // wall to trade blows it can't win. It keeps hammering the structure and
        // leans on its escort for cover; that's what kept the siege line from
        // dissolving the moment a lone defender wandered up.
        // STRIKE and SIEGE artillery are just as single-minded: absolute focus
        // means nobody peels off the ordered target, whatever hits them
        // (tests/army-strategies.mjs) — escorting them is the player's job.
        if (!Units.isSiege(u) && u.strat !== 'strike' && u.strat !== 'siege') {
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
          if (this.repathOk(u)) {
            u.repathT = 0.8; Units.setPath(u, b.x, b.y);
            const end = u.path && u.path.length ? u.path[u.path.length - 1] : { x: u.x | 0, y: u.y | 0 };
            const landed = Math.hypot(end.x + 0.5 - Bld.cx(b), end.y + 0.5 - Bld.cy(b)) <= bReach + 0.6;
            if (!landed) {
              // barbarians that can no longer reach their mark (the bridge they
              // crossed is gone) give up the siege and leave, not shuffle forever
              if (u.owner === 'R') { u.tBld = 0; continue; }
              if (u.owner === 'P' && b.key !== 'wall' && b.key !== 'gate') {
                // a PLAYER-ordered attack that stalls short of its mark is walled off:
                // batter the blocking wall/gate open, remembering the real target so
                // the unit resumes on it once the breach is made. Otherwise footmen
                // just mill at the wall doing nothing.
                const wall = this.nearestBuilding(u.x, u.y, b.owner, bb => bb.key === 'wall' || bb.key === 'gate');
                if (wall && wall.id !== u.tBld && this.canReach(u, wall.x, wall.y, 1.6 + Bld.reach(wall))) {
                  if (!u.task || u.task.type !== 'attackBld') u.task = { type: 'attackBld' };
                  u.task.finalBld = b.id; u.tBld = wall.id;
                  continue;   // canReach already set the path to the wall
                }
              }
              /* SEALED OFF FOR NOW — and this is the trench freeze: an A*
                 that cannot land floods the whole reachable region before
                 giving up, and a sapper's channel cutting the approach put
                 every stalled attacker on that worst case EVERY 0.8s. Ease
                 to three beats; the world reopening is caught soon enough. */
              u.repathT = 2.4;
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
            let sh = null;
            if (CFG.UNITS[u.kind].rng)
              this.shots.push(sh = { x1: u.x, y1: u.y - 0.3, x2: Bld.cx(b), y2: Bld.cy(b), t: 0.24, t0: 0.24, fire: !!CFG.UNITS[u.kind].fire });
            // same base-archer fumble as the unit-target branch above — a
            // player CAN send an archer straight at a wall, so it has to miss
            // there too, not just when trading blows with soldiers.
            if (u.kind === 'archer' && G.rand() < 1 / 4) {
              if (sh) this.overshoot(sh);
              R.float(Bld.cx(b), b.y - 0.15, 'Miss!', '#cfcfcf');
            } else {
              this.hitBuilding(b, dmg, !!CFG.UNITS[u.kind].fire);
            }
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
          if (this.repathOk(u)) { u.repathT = 0.8; const s = this.tileAdjOpen(br.x, br.y, u.owner); if (s) Units.setPath(u, s.x, s.y); else { u.tBridge = null; continue; } }
          Units.followPath(u, dt);
        } else if (u.cd <= 0) {
          u.cd = CFG.ATTACK_COOLDOWN * (CFG.UNITS[u.kind].cdMult || 1);
          const dmg = CFG.UNITS[u.kind].bldAtk || Math.max(1, Math.round(Units.effAtk(u) * (CFG.UNITS[u.kind].bldMult || 1)));
          if (CFG.UNITS[u.kind].rng) this.shots.push({ x1: u.x, y1: u.y - 0.3, x2: bx, y2: by, t: 0.24, t0: 0.24, fire: !!CFG.UNITS[u.kind].fire });
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
        const sh = { x1: cx, y1: cy - 0.6, x2: tgt.x, y2: tgt.y, t: 0.24, t0: 0.24 };
        this.shots.push(sh);
        // A LEVEL-1 TOWER FUMBLES 1 IN 3 SHOTS — the cheap early shield, not the
        // Lv2/Lv3 upgrades (untouched). A War Camp fires exactly like a Watchtower
        // L1 (see the comment above) so it shares the same miss rate; it has no
        // upgrade path of its own. Owner-agnostic: hits the rival's towers too.
        const l1tower = (b.key === 'tower' && b.level === 1) || b.key === 'warcamp';
        if (l1tower && G.rand() < 1 / 3) {
          this.overshoot(sh);
          R.float(tgt.x, tgt.y - 0.4, 'Miss!', '#cfcfcf');
        } else {
          const dmg = Math.max(1, lv.atk - Units.effDef(tgt));
          R.float(tgt.x, tgt.y - 0.4, '-' + dmg, '#f0d27a');
          Units.damage(tgt, dmg, 0, b.owner);
        }
      } else b.cd = 0.3;
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t -= dt;
      if (s.t > 0) continue;
      // the arrow LANDS: a fire arrow bursts into flame on the ground where
      // its flight ends (hit or miss — the operator's ask), and a fumbled
      // shaft kicks up a puff of dirt where it overshot. Same direct R.*
      // calls the damage floats above have always made.
      if (s.fire) R.arrowStrike(s.x2, s.y2);
      else if (s.miss) R.impact(s.x2, s.y2, 'bolt');
      this.shots.splice(i, 1);
    }
    // advance siege projectiles; when one lands, apply its damage + burst
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.t >= p.dur) { this.impact(p); this.projectiles.splice(i, 1); }
    }
  },

  /* SCORED LANDING — the longboat beaches like a thinking raider, not a ferry.
     The old pick ("first open beach nearest the prey") put the band ashore at
     whatever coast the shortest sail ended on — which, against a fortified
     waterfront, is exactly the gate: the best-defended tiles on the map. Now
     EVERY beach along the sail is a candidate, scored the way the rival AI
     reads a town: closest to the soft underbelly (houses, farms, works —
     anything that isn't a fortification) wins, and a beach under a finished
     tower's / war camp's arrows or right against the wall line pays heavily
     for it. Landing clear of the defenses and walking in beats stepping off
     the gangplank into arrow fire.
     `cells` — the water tiles of the sail (start + route); `tgt` — the prey's
     Town Center (its owner scopes whose defenses/soft targets count); `open` —
     the wilderness-reachability mask (null = everywhere), same gate the land
     spawns use so a landing never materializes inside a sealed ring. */
  pickLanding(cells, tgt, open) {
    const HARD = { wall: 1, gate: 1, tower: 1, warcamp: 1 };
    const seen = new Set();
    let landing = null, bestS = Infinity;
    for (const cell of cells) {
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const lx = cell.x + ox, ly = cell.y + oy, key = lx + ',' + ly;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!Path.passable(lx, ly) || (open && !open[MapGen.idx(lx, ly)])) continue;
        let soft = Infinity, threat = 0;
        for (const b of S.buildings) {
          if (b.owner !== tgt.owner) continue;
          const d = Math.hypot(Bld.cx(b) - (lx + 0.5), Bld.cy(b) - (ly + 0.5));
          if (!HARD[b.key]) { if (d < soft) soft = d; continue; }
          if (!Bld.done(b)) continue;   // a half-built tower shoots nothing
          if (b.key === 'tower' || b.key === 'warcamp') {
            const rng = (CFG.BUILDINGS[b.key].levels[(b.level || 1) - 1] || {}).range || 4.5;
            if (d <= rng + 1.5) threat += 8;   // ashore under fire — close to disqualifying
          } else if (d <= 3) threat += 2.5;    // beaching right against the wall line
        }
        // a town of nothing but walls: fall back to closing on the hall
        if (soft === Infinity) soft = Math.hypot(Bld.cx(tgt) - (lx + 0.5), Bld.cy(tgt) - (ly + 0.5));
        const s = soft + threat;
        if (s < bestS) { bestS = s; landing = { x: lx, y: ly }; }
      }
    }
    return landing;
  },

  /* barbarian war-band spawning, called from the day tick */
  maybeWave() {
    if (S.day < S.wave.next) return;
    const m = G.modeCfg();
    S.wave.count++;
    S.wave.lastDay = S.day;   // so the rival can avoid piling a raid onto a fresh wave
    const gap = CFG.WAVES.minGap + Math.floor(G.rand() * (CFG.WAVES.maxGap - CFG.WAVES.minGap + 1));
    /* A GUTTED TOWN GETS A BREATHER (G.barbEase, tests/raider-camps.mjs).
       While either tribe is on its knees the whole wilderness quietens down —
       the wave clock stretches so the town has days to put hands back on its
       plots. Barbarians season a war; a war they have already decided leaves
       the player nothing to conquer. */
    const easing = G.barbEase('P') || G.barbEase('A');
    S.wave.next = S.day + Math.max(4, Math.round(gap * m.waveGapMult *
      (easing ? (G.BARB_EASE.gapMult || 2) : 1)));
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
    let disp = dr < 0.10 ? 'P' : dr < 0.20 ? 'A' : 'ALL';
    /* …and nobody marches on a town that is already on its knees. The temper
       is re-aimed at whoever is still standing; if BOTH are, the wave simply
       does not muster — the wilds have nothing left to take today. */
    const easeP = G.barbEase('P'), easeA = G.barbEase('A');
    if (easeP && easeA) { G.foeNote('🌫 The war bands keep to the deep country — there is nothing left worth taking.'); return; }
    if (disp === 'ALL' && (easeP || easeA)) disp = easeP ? 'A' : 'P';
    if ((disp === 'P' && easeP) || (disp === 'A' && easeA)) disp = easeP ? 'A' : 'P';
    const brute = i => (S.wave.count >= 4 && i % 3 === 2) ? 'brute' : 'raider';
    /* WHICH PEOPLE IS ON THE MOVE (CFG.TRIBES, tests/raider-camps.mjs). A band
       mustered AT a camp is that camp's own people — walk up to the northern
       fire and it is the same faces every time. A band marching in off the map
       edge is somebody else's, so it takes a roll of its own. Settled here so
       the toast can name them; the sea-borne branch below reads it too, and a
       longboat crew is a SEA FOLK crew nine times in ten. */
    const campTribe = (c) => { const cb = Bld.at(c.x, c.y); return cb && cb.tribe; };
    let bandTribe = G.rollTribe();

    // the open wilderness network (see below) — also gates beach landings so
    // sea raiders can't step off inside someone's sealed walls
    let open = this.openNet();

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
        const landing = this.pickLanding([{ x: start.x, y: start.y }].concat(route), tgt, open);
        if (landing) {
          const kindT = 'transport';   // one troop hull now — a raft carries 5
          const tr = Units.spawn(kindT, 'R', start.x, start.y);
          tr.hostileTo = disp;
          tr.cargo = [];
          if (G.rand() < 0.9) bandTribe = 'sea';     // a crew off the water is nearly always the Sea Folk
          const aboard = Math.min(n, CFG.UNITS[kindT].cap);
          for (let i = 0; i < aboard; i++) {
            const ru = Units.spawn(brute(i), 'R', start.x, start.y, { scale, tribe: bandTribe });
            ru.hostileTo = disp;
            S.units.splice(S.units.indexOf(ru), 1);   // they ride in the hull
            tr.cargo.push(ru);
          }
          Units.orderUnload(tr, landing.x, landing.y);
          G.foeNote('⛵ Sails on the horizon — a longboat of ' + G.tribeName(bandTribe) + ' makes for the shore!');
          return;
        }
      }
    }

    // Most waves march in from a randomized point along the map edge; only
    // occasionally do they muster at an existing raider camp. Keeping the entry
    // point varied stops bands from repeatedly funnelling into the same corner.
    let sx, sy;
    // only camps still STANDING muster a wave — burning one out takes that
    // muster point off the board for good (tests/raider-camps.mjs)
    const camps = (S.map.spawns.camps || []).filter(c => {
      const cb = Bld.at(c.x, c.y);
      return cb && cb.owner === 'R' && cb.key === 'raidercamp';
    });
    if (camps.length && G.rand() < 0.25) {
      const c = camps[(G.rand() * camps.length) | 0];
      sx = c.x; sy = c.y;
      bandTribe = campTribe(c) || bandTribe;   // mustered at a fire: its own people
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
    /* …AND (c) THE BAND CAN ACTUALLY FIND A FIGHT (a QA day-110 lakes map:
       the wolf camp's corner is border-open but water-locked away from BOTH
       towns, so its wave marched nowhere, decided everything was unreachable
       and walked off the map — every wave from that muster was born dead,
       silently). The FIGHT NET is the ground connected to a tile you can
       stand on BESIDE any P/A building — deliberately "beside a building",
       never "at the hall doorstep", because a fully walled town's doorstep
       floods only the inside of its own ring while a raider's business is
       battering the ring from outside. A muster inside the net always has
       SOMETHING raiderSeek can path to; when the rolled corner isn't in it,
       the findNear chain below widens across the whole map until it is —
       which is exactly "their radius expands to find me". */
    const fightSeeds = [];
    for (const fb of S.buildings) {
      if (fb.owner !== 'P' && fb.owner !== 'A') continue;
      const sz = Bld.size(fb);
      for (let i = -1; i <= sz; i++) {
        for (const [ox, oy] of [[i, -1], [i, sz], [-1, i], [sz, i]]) {
          const x = fb.x + ox, y = fb.y + oy;
          if (MapGen.inB(x, y) && Path.passable(x, y)) fightSeeds.push({ x, y });
        }
      }
    }
    const fight = fightSeeds.length ? Path.reachFrom(fightSeeds) : null;
    const inNet = (x, y) => Path.passable(x, y) && (!open || open[MapGen.idx(x, y)]) &&
      (!fight || fight[MapGen.idx(x, y)]);
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
      Units.spawn(brute(i), 'R', p.x, p.y, { scale, tribe: bandTribe }).hostileTo = disp;
    }
    G.foeNote(`⚔ A war band of ${G.tribeName(bandTribe)} is on the move (${n})!`);
  },
};
