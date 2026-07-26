"use strict";
/* AI rival civilization. Every game the rival chief rolls a personality that
   shapes the whole tribe: what it builds and where, what soldiers it fields,
   whether it walls itself in, how much it loves the water, and how eager it
   is to march on you. No more identical square villages of spearmen. */

const AI = {
  /* Each persona:
     order      — build order (keys from CFG.BUILDINGS; duplicates allowed).
                  Every chief, whatever their temper, raises a barracks and a
                  couple of watchtowers early — basic protection is not a
                  personality trait
     mix        — army composition weights [kind, share]; kinds map to their
                  training building, advanced lines unlock at building L3
     raidPower  — attack when my power > theirs × this (lower = bolder)
     raidDayAdd — shift on the mode's earliest raid day
     raidShare  — fraction of the army that marches
     raidCd     — days between raids
     walls      — build a wall ring (with gates) around town
     dockTC     — TC level needed before it goes to sea (0 = never bothers)
     boats/ships— fishing fleet size / warship cap divisor of aiArmyCap
     tcDays     — [day for TC2, day for TC3]
     blurb      — what your scouts whisper at first light

     ORIGIN CARDS (js/cards.js) sit on top of these profiles: the rival is
     dealt 3 cards and keeps 1, and the kept card sets BOTH its starting boon
     and its persona (each card's `lean` names one of these profiles — the
     card IS the persona now). The card also sets S.ai.opening = { bias,
     fired: true, until, card }, which drives the early behavior leans in
     daily() ('scout' | 'raid' | 'boom' | 'sea' | 'turtle' | 'spread').
     THE RULE: a new rival temperament is added as a CARD with a `lean`
     (and, if needed, a new persona profile here) — no new wiring. */
  PERSONAS: {
    homesteader: {
      name: 'Homesteader',
      order: ['farm', 'house', 'barracks', 'lumber', 'lodge', 'tower', 'farm', 'house',
              'tower', 'quarry', 'house', 'farm', 'range', 'farm', 'house'],
      mix: [['defender', 0.45], ['archer', 0.3], ['longbow', 0.25]],
      raidPower: 1.7, raidDayAdd: 25, raidShare: 0.5, raidCd: 16,
      walls: false, dockTC: 2, boats: 2, shipDiv: 4, tcDays: [22, 55],
      blurb: 'a patient farmer-chief, slow to anger, rich in grain.',
    },
    warlord: {
      name: 'Warlord',
      order: ['barracks', 'house', 'lumber', 'farm', 'range', 'farm', 'house', 'stable', 'tower',
              'farm', 'barracks', 'house', 'farm', 'house', 'tower', 'siege'],
      mix: [['defender', 0.3], ['axeman', 0.2], ['archer', 0.2], ['rider', 0.2], ['catapult', 0.1]],
      raidPower: 1.1, raidDayAdd: -15, raidShare: 0.7, raidCd: 10,
      walls: false, dockTC: 2, boats: 1, shipDiv: 4, tcDays: [30, 70],
      blurb: 'a warmonger who prizes the spear over the plough.',
    },
    horselord: {
      name: 'Horselord',
      order: ['farm', 'house', 'barracks', 'lumber', 'stable', 'tower', 'farm', 'house',
              'tower', 'farm', 'stable', 'house', 'farm'],
      mix: [['rider', 0.45], ['horsearcher', 0.25], ['defender', 0.15], ['archer', 0.15]],
      raidPower: 1.15, raidDayAdd: -8, raidShare: 0.6, raidCd: 8,
      walls: false, dockTC: 2, boats: 1, shipDiv: 4, tcDays: [26, 62],
      blurb: 'a horselord — swift riders strike and are gone.',
    },
    mariner: {
      name: 'Mariner',
      order: ['farm', 'house', 'barracks', 'lumber', 'tower', 'house', 'farm', 'range',
              'tower', 'house', 'farm'],
      mix: [['archer', 0.35], ['longbow', 0.25], ['defender', 0.4]],
      raidPower: 1.3, raidDayAdd: 5, raidShare: 0.6, raidCd: 14,
      walls: false, dockTC: 1, boats: 3, shipDiv: 3, tcDays: [25, 58],
      blurb: 'a mariner-chief — nets in the shallows, warships off the coast.',
    },
    mason: {
      name: 'Mason',
      order: ['quarry', 'house', 'barracks', 'lumber', 'tower', 'farm', 'house', 'tower',
              'farm', 'range', 'tower', 'house', 'siege'],
      mix: [['defender', 0.3], ['archer', 0.3], ['longbow', 0.2], ['ballista', 0.1], ['catapult', 0.1]],
      raidPower: 1.9, raidDayAdd: 30, raidShare: 0.5, raidCd: 18,
      walls: true, dockTC: 2, boats: 2, shipDiv: 5, tcDays: [24, 58],
      blurb: 'a cautious mason — stone towers, and walls going up.',
    },
    forager: {
      name: 'Forager',
      order: ['lodge', 'farm', 'barracks', 'lumber', 'house', 'tower', 'quarry', 'farm',
              'house', 'tower', 'lumber', 'quarry', 'farm', 'house', 'range'],
      mix: [['defender', 0.3], ['axeman', 0.15], ['archer', 0.35], ['rider', 0.2]],
      raidPower: 1.4, raidDayAdd: 15, raidShare: 0.6, raidCd: 14,
      walls: false, dockTC: 2, boats: 2, shipDiv: 4, tcDays: [18, 45],
      blurb: 'a hoarder of timber and stone — weak now, but growing fast.',
    },
  },

  persona() { return this.PERSONAS[S.ai && S.ai.persona] || this.PERSONAS.homesteader; },

  init(spawn, pk) {
    /* VARIABLE OPENINGS: the rival opens on its own rolled package (same
       bands as the player's — see G.rollStart). Its persona, opening bias
       and starting boon are set by the ORIGIN CARDS draft (Cards.deal),
       which newGame runs immediately after this. */
    S.ai = {
      res: Object.assign({}, pk ? pk.res : { food: 200, wood: 150, stone: 60, gold: 0 }),
      orderI: 0,
      raidCd: 0,
      persona: 'homesteader',   // provisional — the kept card names the persona
      // LAYER 5: within-game memory — what it has learned about this opponent
      memory: { wallStop: false, wallHit: 0, lastRaidRazed: false },
    };
    G.clearFootprint(spawn.x, spawn.y, 'tc');
    Bld.place('A', 'tc', spawn.x, spawn.y, { free: true, instant: true });
    // the rolled crew walks the lanes — a village that starts lived-in
    const n = Math.min(3, (pk && pk.villagers) || 2);
    for (let i = 0; i < n; i++) {
      const spot = MapGen.findNear(spawn.x + 1, spawn.y + Bld.size('tc'), 4,
        (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y)) || { x: spawn.x, y: spawn.y + 2 };
      Units.spawn('villager', 'A', spot.x, spot.y);
    }
  },

  /* ================= THE WALL LINE — reserved ground ===================
     A BUILDING IS NOT A WALL. A farm has 100 hp where a wall has 300–2600 —
     and, far worse, it does not block movement at all: `Path.passable` stops
     only on wall/gate, so a hut standing in the ring is a doorway an attacker
     strolls through without swinging once. A real game showed exactly that —
     a farm predating the ring, the wall builder stopping either side of it,
     and the whole defence undone by one soft tile.

     Three rules keep the line whole, in priority order:
       1. RESERVE  (prevention) — the intended ring is off-limits to every
          economy/military building from day one, walls and gates excepted.
       2. REPAIR   (`mendWallLine`) — a builder that meets a friendly building
          on the line bulges the wall OUTWARD around it (enclosing it), or, if
          the ground won't take a bulge, moves the building inside and closes
          the tile. It never leaves the building AS the segment.
       3. AUDIT    (`wallAudit`) — the standing line is walked each build cycle
          for soft segments and for holes a razed section left behind; those
          are closed AHEAD of any new frontage.
     `WALL_R` is the single source of truth for where the line runs — it must
     match the radius `maybeWalls` seals (`perimeterGaps(cx, cy, 5)`). */
  WALL_R: 5,
  wallCenter(tc) {
    tc = tc || Bld.tcOf('A');
    if (!tc) return null;
    return { cx: Bld.cx(tc) | 0, cy: Bld.cy(tc) | 0 };
  },
  onWallLine(x, y, tc) {
    const c = this.wallCenter(tc);
    if (!c) return false;
    return Math.max(Math.abs(x - c.cx), Math.abs(y - c.cy)) === this.WALL_R;
  },
  // the ring walked in order, so neighbours in the array are neighbours on the ground
  wallRing(tc) {
    const c = this.wallCenter(tc);
    if (!c) return [];
    const R = this.WALL_R, cx = c.cx, cy = c.cy, ring = [];
    for (let dx = -R; dx <= R; dx++) ring.push([cx + dx, cy - R]);
    for (let dy = -R + 1; dy <= R; dy++) ring.push([cx + R, cy + dy]);
    for (let dx = R - 1; dx >= -R; dx--) ring.push([cx + dx, cy + R]);
    for (let dy = R - 1; dy >= -R + 1; dy--) ring.push([cx - R, cy + dy]);
    return ring;
  },
  isFort(b) { return !!b && (b.key === 'wall' || b.key === 'gate'); },

  /* find a plot with some character instead of spiral-filling a square:
     terrain-hunters sit beside their bonus terrain, towers push toward the
     player, everything else scatters at a random angle from the hall */
  plot(key) {
    let tc = Bld.tcOf('A');
    if (!tc) return null;
    const isFortKey = (key === 'wall' || key === 'gate');
    // RULE 1 — nothing but the ring itself may be sited on the ring. The centre is
    // resolved ONCE: this predicate runs on every candidate tile of the scan.
    const line = isFortKey ? null : this.wallCenter(tc);   // reserved around the HALL, not a forward camp
    const R = this.WALL_R;
    const offLine = (x, y) => !line || Math.max(Math.abs(x - line.cx), Math.abs(y - line.cy)) !== R;
    // FORWARD STAGING: while pushing, raise military halls around a standing War Camp
    // (the mini-TC of the front) instead of back home, so the assault trains, spawns
    // and mends at the front line rather than a long march away.
    if ((key === 'barracks' || key === 'stable' || key === 'range' || key === 'siege') &&
        (S.ai.posture === 'PUSH' || S.ai.posture === 'PRESSURE')) {
      const camp = Bld.list('A').find(b => b.key === 'warcamp' && Bld.done(b));
      if (camp) tc = camp;
    }
    const P = this.persona();
    const rMax = P.walls ? 5 : 7;   // wall-builders keep the town inside the ring
    const isWall = isFortKey;
    const free = (x, y) => Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2 && offLine(x, y);
    // how many of the 8 neighbours are already built on (crowding) — real buildings
    // want ELBOW ROOM so the town reads as a settlement, not a packed maze
    const crowd = (x, y) => { let n = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (Bld.at(x + ox, y + oy)) n++; return n; };
    const wetAdj = (x, y) => { for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ox, ny = y + oy; if (MapGen.inB(nx, ny)) { const t = S.map.terrain[MapGen.idx(nx, ny)]; if (t === T.WATER || t === T.MOAT) return true; } } return false; };
    // spacing/dryness score for a normal building (walls exempt — they belong on the seam)
    const layout = (x, y, dx, dy) => {
      let s = G.rand() * 0.8;
      if (isWall) return s;
      s -= crowd(x, y) * 1.4;                                          // keep a little air around each hut
      if (wetAdj(x, y)) s -= 3;                                        // stay off the waterline (no huts in the future moat)
      s -= Math.abs(Math.hypot(dx, dy) - Math.min(rMax - 0.6, 4)) * 0.35;   // settle on a loose ring, not on top of the hall
      return s;
    };
    const d = CFG.BUILDINGS[key];
    if (d && d.near) {
      // hunt the bonus terrain, but still with spacing + off the waterline
      let best = null, bs = -1e9;
      for (let dy = -rMax; dy <= rMax; dy++) for (let dx = -rMax; dx <= rMax; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (!MapGen.inB(x, y) || !free(x, y)) continue;
        let bonus = 0; const r = d.near.radius;
        for (let oy = -r; oy <= r && !bonus; oy++) for (let ox = -r; ox <= r; ox++)
          if (MapGen.inB(x + ox, y + oy) && S.map.terrain[MapGen.idx(x + ox, y + oy)] === d.near.terrain) { bonus = 1; break; }
        const s = bonus * 10 + layout(x, y, dx, dy);
        if (s > bs) { bs = s; best = { x, y }; }
      }
      if (best) return best;
    }
    if (key === 'tower') { const s = this.towerSpot(tc); if (s) return s; }
    // score every free tile in the ring for elbow room + dry ground, so the town
    // grows as a spaced-out settlement instead of packing huts wall-to-wall (which
    // is what left a crowded maze the AI then dug moats straight through)
    let best = null, bs = -1e9;
    for (let dy = -rMax; dy <= rMax; dy++) for (let dx = -rMax; dx <= rMax; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y) || !free(x, y)) continue;
      const s = layout(x, y, dx, dy);
      if (s > bs) { bs = s; best = { x, y }; }
    }
    if (best) return best;
    // crowded town (a full wall ring, a tight peninsula): spill outward rather than
    // stall — but NEVER onto the reserved line. A hut outside the ring is a hut the
    // rival may lose; a hut IN the ring is the ring lost.
    return MapGen.findNear(tc.x, tc.y, rMax, free) ||
           MapGen.findNear(tc.x, tc.y, rMax + 4, free) ||
           MapGen.findNear(tc.x, tc.y, rMax + 8, (x, y) => Bld.tileFree(x, y) && offLine(x, y));
  },

  /* COVERAGE-AWARE tower placement. The old heuristic dropped every tower on the
     single widest seam — redundant, clustered coverage with whole flanks left
     open. Instead: score candidate tiles by the MARGINAL new coverage they add
     over the towers already standing. A tile that guards an otherwise-uncovered
     approach seam scores high; one whose range merely duplicates an existing
     tower is penalised (and pure duplicates are rejected). Towers spread to
     cover the town's whole frontage instead of piling up. */
  towerSpot(tc) {
    // a tower is NOT a wall segment either — it doesn't block a single step — so
    // the reserved line is off-limits to it too. It guards the line from behind.
    const line = this.wallCenter(), R = this.WALL_R;
    const free = (x, y) => Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2 &&
      (!line || Math.max(Math.abs(x - line.cx), Math.abs(y - line.cy)) !== R);
    const cov = (CFG.BUILDINGS.tower.levels[0].range || 4.5) + 0.6;   // effective guard radius
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0;
    // the approach tiles worth guarding: the open perimeter seams attackers must
    // cross. If terrain seals the town, fall back to a coverage ring.
    let seam = [];
    for (const g of this.perimeterGaps(cx, cy, 5)) for (const t of g.tiles) seam.push(t);
    for (const g of this.perimeterGaps(cx, cy, 7)) for (const t of g.tiles) seam.push(t);
    if (!seam.length)
      for (let a = 0; a < 12; a++) { const ang = a / 12 * Math.PI * 2; seam.push([Math.round(tc.x + Math.cos(ang) * 5), Math.round(tc.y + Math.sin(ang) * 5)]); }
    const towers = Bld.list('A').filter(b => b.key === 'tower').map(b => ({ x: Bld.cx(b), y: Bld.cy(b) }));
    const covered = (sx, sy) => towers.some(t => Math.hypot(sx - t.x, sy - t.y) <= cov);
    const ptc = this.knownPlayerTC();
    let best = null, bs = -1e9;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y) || !free(x, y)) continue;
      let fresh = 0, dupe = 0;
      for (const [sx, sy] of seam) {
        if (Math.hypot(sx - x, sy - y) > cov) continue;
        if (covered(sx, sy)) dupe++; else fresh++;
      }
      if (towers.length && fresh === 0) continue;             // rejects a pure-duplicate tower
      let s = fresh * 3 - dupe * 1.4 - Math.hypot(dx, dy) * 0.12;
      if (ptc && ((x - tc.x) * (ptc.x - tc.x) + (y - tc.y) * (ptc.y - tc.y)) > 0) s += 1.5;  // slight bias to the player-facing frontage
      const hf = S.ai.memory && S.ai.memory.hitFlank;                                         // reinforce the flank the player keeps hitting
      if (hf && ((x - tc.x) * hf.x + (y - tc.y) * hf.y) > 0) s += 2.2;
      s += G.rand() * 0.6;                                    // break ties differently game-to-game
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return best;
  },

  power(owner) {
    let p = 0;
    for (const u of S.units)
      if (u.owner === owner && Units.isMilitary(u))
        p += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman' ||
              u.kind === 'catapult' || u.kind === 'ballista') ? 2 : 1;
    for (const b of S.buildings)
      if (b.owner === owner && b.key === 'tower' && Bld.done(b)) p += 1;
    return p;
  },

  /* CHOKEPOINTS — the open seams on a town's perimeter ring. Impassable terrain
     (wood/rock/orchard/water/mountain) already walls most of the ring; the gaps
     are where an attacker gets in. Returns each contiguous run of open ring
     tiles as a seam {tiles, width, mid, dir}, sorted widest-first. This is the
     map's tactical geometry: you plug seams, not open ground. */
  perimeterGaps(cx, cy, R) {
    const ring = [];
    for (let dx = -R; dx <= R; dx++) ring.push([cx + dx, cy - R]);
    for (let dy = -R + 1; dy <= R; dy++) ring.push([cx + R, cy + dy]);
    for (let dx = R - 1; dx >= -R; dx--) ring.push([cx + dx, cy + R]);
    for (let dy = R - 1; dy >= -R + 1; dy--) ring.push([cx - R, cy + dy]);
    const n = ring.length;
    const open = ring.map(([x, y]) => MapGen.inB(x, y) && Path.passable(x, y, 'A') && Bld.blockAt(x, y) === 0);
    let start = open.findIndex(o => !o); if (start < 0) start = 0;   // anchor on a closed tile (cyclic)
    const runs = []; let cur = null;
    for (let k = 0; k < n; k++) {
      const idx = (start + k) % n;
      if (open[idx]) { (cur || (cur = { tiles: [] })).tiles.push(ring[idx]); }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    return runs.map(r => {
      const mid = r.tiles[r.tiles.length >> 1];
      return { tiles: r.tiles, width: r.tiles.length, mid: { x: mid[0], y: mid[1] },
        dir: { x: Math.sign(mid[0] - cx), y: Math.sign(mid[1] - cy) } };
    }).sort((a, b) => b.width - a.width);
  },

  /* APPROACH LANES into the player's KNOWN town — the open seams an attacker
     can come through, ranked LEAST-DEFENDED first. Defense = remembered towers/
     walls covering that seam PLUS within-game memory of where past raids were
     beaten back (mem.laneDef). This is what lets the chief feint one lane and
     commit to the one the player left open. */
  /* SOFT DOORS — and the mistake cuts both ways. A player hut, farm or tower
     standing in their OWN wall line is worth a fraction of a wall's hp and
     stops not a single step (only wall/gate block movement). The chief keeps
     its own line clean of them (`mendWallLine`); here it looks for the player's.
     A remembered non-fort building with walls on two sides of it is a door. */
  foeSoftDoors() {
    const kb = S.ai.knownB || {}, forts = {}, out = [];
    for (const k in kb) { const b = kb[k]; if (b.key === 'wall' || b.key === 'gate') forts[b.x + ',' + b.y] = 1; }
    for (const k in kb) {
      const b = kb[k];
      if (b.key === 'wall' || b.key === 'gate' || b.key === 'tc') continue;
      let n = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]])
        if (forts[(b.x + ox) + ',' + (b.y + oy)]) n++;
      if (n >= 2) out.push(b);
    }
    return out;
  },

  playerLanes() {
    const tc = this.knownPlayerTC(); if (!tc) return [];
    const cx = Math.round(tc.x + Bld.size('tc') / 2), cy = Math.round(tc.y + Bld.size('tc') / 2);
    const gaps = this.perimeterGaps(cx, cy, 6);
    const kb = S.ai.knownB || {}, ld = (S.ai.memory && S.ai.memory.laneDef) || {};
    const doors = this.foeSoftDoors();
    const facing = (b, dir) => {
      const bx = b.x + 0.5 - cx, by = b.y + 0.5 - cy, dist = Math.hypot(bx, by) || 1;
      return dist >= 2 && dist <= 11 && (bx * dir.x + by * dir.y) / dist > 0.45;
    };
    return gaps.map(g => {
      const key = g.dir.x + ',' + g.dir.y;
      let staticDef = 0;
      for (const k in kb) {
        const b = kb[k];
        if (b.key !== 'tower' && b.key !== 'wall' && b.key !== 'gate') continue;
        if (!facing(b, g.dir)) continue;
        staticDef += b.key === 'tower' ? 2 : 1;
      }
      // a door in this stretch is worth more than the sections either side of it
      let door = 0;
      for (const d of doors) if (facing(d, g.dir)) door++;
      return { mid: g.mid, dir: g.dir, width: g.width, key, door,
        def: Math.max(0, staticDef + (ld[key] || 0) * 2 - door * 2.5) };
    }).sort((a, b) => a.def - b.def);
  },

  /* Turtling done right: PLUG THE SEAMS, and actually invest in it. Terrain does
     most of the walling; the chief closes the open gaps on its perimeter. It
     seals the SHORTEST seams first (a narrow gap is cheap to close completely and
     removes a whole attack route), gates the widest seam so its own parties can
     still sortie, and reinforces the flank the player keeps attacking from
     (Layer-5 memory). Wall investment per call scales with threat and posture, so
     a threatened or turtling chief actually fortifies instead of dribbling. */
  /* how much RING this town can actually carry. A ring isn't free once it's up:
     every section has to be paid for again at each wall tier, and the upgrade is
     village-wide. A chief that palisades its whole horizon on a two-farm economy
     can never afford to turn any of it to stone — which is exactly how a real
     game ended with 35 sticks-and-grass sections, no quarry, and a wall tier
     that never moved. So the ring is capped by what the STONE economy can
     maintain: quarries buy you wall. */
  wallCap(tc) {
    const P = this.persona();
    const q = Bld.list('A').filter(b => b.key === 'quarry' && Bld.done(b)).length;
    return 6 + (tc.level || 1) * 3 + q * 4 + (P.walls ? 6 : 0);
  },

  /* RULE 3 — WALK THE LINE. Classify every tile of the intended ring, so the
     chief can tell a wall from a hut standing where a wall should be, and a
     stretch terrain seals from a hole a razed section left behind:
       fort   — our own wall/gate: sealed, and it stops movement
       soft   — any OTHER friendly building: sealed to the eye, open to a boot
       edge   — impassable ground (or someone else's building): sealed by nature
       open   — passable and empty: honest frontage, not yet walled
     A `soft` tile the wall has already reached (a fort beside it) is an open
     door and gets fixed first; an `open` tile with forts on BOTH sides is a
     breach in a finished stretch and gets re-closed before any new frontage. */
  wallAudit(tc) {
    tc = tc || Bld.tcOf('A');
    const out = { soft: [], breach: [], forts: 0, open: 0 };
    if (!tc) return out;
    const ring = this.wallRing(tc), n = ring.length;
    const cls = ring.map(([x, y]) => {
      if (!MapGen.inB(x, y)) return 'edge';
      const b = Bld.at(x, y);
      if (b) return b.owner !== 'A' ? 'edge' : (this.isFort(b) ? 'fort' : 'soft');
      return Path.passable(x, y, 'A') ? 'open' : 'edge';
    });
    for (let i = 0; i < n; i++) {
      if (cls[i] === 'fort') out.forts++;
      else if (cls[i] === 'open') out.open++;
      const prev = cls[(i - 1 + n) % n], next = cls[(i + 1) % n];
      if (cls[i] === 'soft') {
        const [x, y] = ring[i];
        // the wall has ARRIVED at this building if it stands beside a section
        out.soft.push({ x, y, b: Bld.at(x, y), reached: prev === 'fort' || next === 'fort' });
      } else if (cls[i] === 'open' && prev === 'fort' && next === 'fort') {
        out.breach.push({ x: ring[i][0], y: ring[i][1] });
      }
    }
    return out;
  },

  /* RULE 2a — the OUTWARD BULGE. The cheapest way past a friendly building on
     the line is to carry the wall one tile around the outside of it, which
     leaves the building safe INSIDE the perimeter. Those tiles are exactly the
     8-neighbours that lie beyond the ring: wall them and the only way to the
     building's tile is from the town side. Returns the tiles still to lay
     (already-walled ones are skipped, so a part-built bulge resumes), or
     `null` when the ground won't take one. */
  _detourTiles(x, y, tc) {
    const c = this.wallCenter(tc);
    if (!c) return null;
    const R = this.WALL_R, out = [];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (Math.max(Math.abs(nx - c.cx), Math.abs(ny - c.cy)) <= R) continue;   // on or inside the line
      if (!MapGen.inB(nx, ny)) continue;                                       // the map's own edge seals it
      const b = Bld.at(nx, ny);
      if (b) { if (this.isFort(b) && b.owner === 'A') continue; return null; }  // something else stands there
      if (!Path.passable(nx, ny, 'A')) continue;                               // terrain already seals it
      if (!Bld.canPlace('A', 'wall', nx, ny).ok) return null;                  // open ground we can't build on
      out.push([nx, ny]);
    }
    return out;
  },
  // lay the bulge. Returns the number of sections laid (0 = it was already
  // closed, nothing to do), or null when no bulge is possible here.
  wallDetour(flaw, tc) {
    const tiles = this._detourTiles(flaw.x, flaw.y, tc);
    if (!tiles) return null;
    if (!tiles.length) return 0;
    const unit = CFG.BUILDINGS.wall.levels[0].cost, need = {};
    for (const k in unit) need[k] = unit[k] * tiles.length;
    if (!this.affordFree(need)) return 0;      // save up and bulge in one piece
    let laid = 0;
    for (const [x, y] of tiles) if (Bld.place('A', 'wall', x, y)) laid++;
    return laid;
  },

  /* RULE 2b — MOVE THE WORKS, NOT THE WALL. When the ground won't take a bulge,
     the building comes down and goes back up inside the perimeter, and the tile
     it vacated is walled on the next pass. The works are re-raised at the level
     they held (it is a relocation, not a demolition — the chief loses the days
     of construction, not the investment). The hall, a forward camp and a dock
     are never moved: the first can't be, and the last two can't be re-sited. */
  wallRelocate(flaw, tc) {
    const b = flaw.b, ai = S.ai;
    if (!b || b.key === 'tc' || b.key === 'warcamp' || b.key === 'dock') return false;
    if ((ai.read || {}).underThreat) return false;      // not while it's being stormed
    const spot = this.plot(b.key);                      // plot() already refuses the line
    if (!spot || !Bld.canPlace('A', b.key, spot.x, spot.y).ok) return false;
    const lv = b.level || 1;
    Bld.removeToRuin(b);
    const nb = Bld.place('A', b.key, spot.x, spot.y, { free: true });
    if (nb && lv > 1) {
      const L = CFG.BUILDINGS[b.key].levels[lv - 1];
      nb.level = lv; nb.maxhp = L.hp; nb.hp = Math.max(30, Math.round(L.hp * 0.4));
      nb.construction = L.time;
    }
    return true;
  },

  /* RULE 3 (act) — mend before you extend. Runs ahead of the ring cap and the
     re-facing gate, because those exist to stop the ring SPRAWLING, not to
     leave it broken: an attacker only has to find one soft tile. */
  mendWallLine(tc) {
    const ai = S.ai;
    const audit = this.wallAudit(tc);
    if (!audit.forts) return false;                     // no ring yet — nothing to keep whole
    const fix = ai.wallFix || (ai.wallFix = { detour: 0, relocate: 0, breach: 0 });
    for (const f of audit.soft) {
      if (!f.reached) continue;                         // the wall hasn't got here yet
      const laid = this.wallDetour(f, tc);
      if (laid === null) { if (this.wallRelocate(f, tc)) { fix.relocate++; return true; } continue; }
      if (laid > 0) { fix.detour++; return true; }
    }
    for (const h of audit.breach) {
      if (!this.affordFree(CFG.BUILDINGS.wall.levels[0].cost)) break;
      if (Bld.canPlace('A', 'wall', h.x, h.y).ok && Bld.place('A', 'wall', h.x, h.y)) { fix.breach++; return true; }
    }
    return false;
  },

  maybeWalls(tc) {
    const P = this.persona(), ai = S.ai, read = ai.read || {};
    if (S.day < 16 || ai.res.wood < 45) return;
    // RULES 2+3 — a hole in the standing ring outranks every metre of new frontage
    if (this.mendWallLine(tc)) return;
    // a ring already at the limit of what this economy can re-tier: stop laying
    // more sections and let the wood go to the works that raise the cap
    const forts = Bld.forts('A');
    if (forts.length >= this.wallCap(tc)) return;
    /* FINISH THE RING BEFORE EXTENDING IT. An attacker only has to break ONE
       section, so a short ring of stone is worth far more than a long one of
       sticks — and every section laid is another to pay for at the next tier.
       While a good part of the ring is still below the tier the hall allows,
       the stone goes into re-facing, not into more frontage. */
    const target = Math.min(3, tc.level || 1);
    if (forts.length >= 6 && forts.filter(b => (b.level || 1) < target).length > forts.length * 0.34) return;
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0;
    const gaps = this.perimeterGaps(cx, cy, 5);
    if (!gaps.length) return;                       // terrain already seals the town
    // how many tiles to lay this call — a real budget, not a flat 3
    let budget = 3 + (P.walls ? 2 : 0) + (ai.posture === 'DEFEND' ? 2 : 0) + (read.underThreat ? 2 : 0);
    const gateSeam = gaps[0];                        // widest = the gated sortie lane
    const gateMid = gateSeam.mid;
    // order seams: the flank the player keeps hitting first, then narrowest
    // (cheapest full seals) — reinforce where it hurts, seal what's quick to close
    const hit = (ai.memory && ai.memory.hitFlank) || null;
    const order = gaps.slice().sort((a, b) => {
      const ha = hit ? (a.dir.x === hit.x && a.dir.y === hit.y ? -100 : 0) : 0;
      const hb = hit ? (b.dir.x === hit.x && b.dir.y === hit.y ? -100 : 0) : 0;
      return (ha + a.width) - (hb + b.width);
    });
    let placed = 0;
    const cap = this.wallCap(tc);
    for (const g of order) {
      for (const [x, y] of g.tiles) {
        if (placed >= budget) return;
        if (Bld.forts('A').length >= cap) return;
        if (!MapGen.inB(x, y) || Bld.at(x, y)) continue;
        const isGate = x === gateMid.x && y === gateMid.y;
        const key = isGate ? 'gate' : 'wall';
        // THE RING NEVER RAIDS THE WAR CHEST. Walling ran outside the savings
        // reservation, so a chief saving for its next Town Center tier spent the
        // fund on palisade a fistful at a time and never got there (a real game
        // sat at Lv 2 to day 159, so no workshop, no engines, no elites).
        if (!this.affordFree(CFG.BUILDINGS[key].levels[0].cost)) return;
        if (!Bld.canPlace('A', key, x, y).ok) continue;
        Bld.place('A', key, x, y);
        placed++;
      }
    }
  },

  // train toward a mix (defaults to the persona's; Layer 3 passes a
  // counter-weighted one); advanced lines come with L3 halls
  trainArmy(m, want, mix) {
    const P = this.persona();
    mix = mix || P.mix;
    // siege-minded chiefs keep a siege battery on top of the standing force
    if (mix.some(([k]) => k === 'catapult')) {
      const ws = S.buildings.find(bb => bb.owner === 'A' && bb.key === 'siege' &&
        Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
      if (ws) {
        // the endgame payoff: a trebuchet or two once the workshop is fully raised
        if (ws.level >= 3 && Units.count('A', u => u.kind === 'trebuchet') < Math.max(1, Math.floor(want / 10)) &&
          Bld.train(ws, 'trebuchet')) return true;
        const wantCats = Math.max(1, Math.floor(want / 6));
        if (Units.count('A', u => u.kind === 'catapult') < wantCats && Bld.train(ws, 'catapult')) return true;
      }
    }
    const count = Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u) && !Units.isSiege(u));
    const advN = Units.count('A', u => u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman');
    const vetWant = Math.floor((m.aiEliteShare || 0) * want);
    if (count >= want) {
      /* AT STRENGTH, BUT RAW. Training stopped dead the moment the muster was
         full — so a host raised early out of cheap levies stayed cheap levies
         forever, and veterans only ever appeared to replace a casualty. The
         chief ended games with grown halls, a target of nine veterans, ONE in
         the field and eight hundred gold it had no other use for. Quantity is
         capped; quality is not. While the host is short of its veteran share,
         keep drilling the good troops — that is what the treasury is for. */
      if (advN >= vetWant) return false;
      const VET = { barracks: 'elite', range: 'marksman', stable: 'lancer' };
      const vh = S.buildings.find(bb => bb.owner === 'A' && VET[bb.key] &&
        bb.level >= 3 && Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
      if (!vh) return false;
      return Bld.train(vh, VET[vh.key]);
    }
    const roll = G.rand();
    let acc = 0, kind = mix[0][0];
    for (const [k, w] of mix) { acc += w; if (roll < acc + 1e-9) { kind = k; break; } }
    const HALL = this.HALL_OF;
    const hallOf = k => S.buildings.find(bb => bb.owner === 'A' && bb.key === HALL[k] &&
      Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
    let b = hallOf(kind);
    if (!b) {
      // rolled a unit whose hall isn't up yet — fall back to any open hall
      for (const [k] of mix) { const alt = hallOf(k); if (alt) { kind = k; b = alt; break; } }
      if (!b) return false;
    }
    const ADV = { defender: 'elite', archer: 'marksman', rider: 'lancer' };
    const adv = ADV[kind] && b.level >= 3 && S.ai.res.gold >= 25 && advN < vetWant;
    if (Bld.train(b, adv ? ADV[kind] : kind)) return true;
    // rolled a unit the hall can't make yet (still level 1) — drill the basic line
    const BASIC = { barracks: 'defender', range: 'archer', stable: 'rider', siege: 'catapult' };
    return Bld.train(b, BASIC[b.key]);
  },

  /* the build order is an OPENING, not a life plan — after it's done the
     town keeps developing forever: more farms, houses, towers, camps and
     halls on a clock, capped only by a sane town size. This is what makes
     the rival still feel like a player at day 150 instead of a museum. */
  growthKey() {
    const have = {};
    let total = 0;
    for (const b of Bld.list('A')) {
      if (b.key === 'wall' || b.key === 'gate') continue;
      have[b.key] = (have[b.key] || 0) + 1;
      total++;
    }
    if (total >= 34) return null;
    /* The backfill used to want a new farm every 45 days but a timber camp or
       quarry only every 80 — backwards for what a war economy actually burns.
       Food piled past ten thousand while wood and stone (every hall tier, wall
       tier, tower and unit) ran at a few dozen. Timber and stone now lead. */
    const wish = [
      ['lumber',   1 + Math.floor(S.day / 50)],
      ['quarry',   1 + Math.floor(S.day / 50)],
      ['farm',     2 + Math.floor(S.day / 60)],
      ['house',    2 + Math.floor(S.day / 40)],
      ['tower',    2 + Math.floor(S.day / 50)],
      ['barracks', 1 + Math.floor(S.day / 90)],
    ];
    for (const [k, n] of wish) if ((have[k] || 0) < n) return k;
    return null;
  },

  /* THE OPENING BOOK — a human is strong early because the opening is
     REHEARSED. The persona's `order` list is played move by move for the
     first stretch of the game: each entry is placed the day it's affordable;
     an unaffordable entry becomes a SAVINGS GOAL (the reserve stops other
     spending from eating its pot) instead of a shrug; a station the village
     can't crew yet — or an entry with no ground for it — is skipped so the
     book never stalls. Returns true while the book owns construction. */
  openingBook() {
    const ai = S.ai, P = this.persona();
    if (ai.orderI == null) ai.orderI = 0;
    const order = P.order || [];
    if (ai.orderI >= order.length || S.day > 45) {
      if (ai.goal && ai.goal.book) ai.goal = null;
      return false;
    }
    const key = order[ai.orderI];
    // the move may already be MADE — a safety rule (hall bootstrap, dig-out,
    // emergency tower) can build the book's next entry out of turn. The book
    // tracks the town's SHAPE, not its own hammer-blows: when the town already
    // holds as many of this key as the order has asked for so far, the move is
    // done — advance. (This is what un-sticks a book that once sat at move 1
    // forever, saving for a second barracks while the first stood finished.)
    const wantCount = order.slice(0, ai.orderI + 1).filter(k => k === key).length;
    const haveCount = Bld.list('A').filter(b => b.key === key).length;
    if (haveCount >= wantCount) { ai.orderI++; if (ai.goal && ai.goal.book) ai.goal = null; return true; }
    if (CFG.BUILDINGS[key].needsWorker) {
      // no hands free for another station yet — the book flows on
      const pool = Units.count('A', u => Units.isVillager(u));
      let slots = 0;
      for (const b of Bld.list('A')) if (Bld.def(b.key).needsWorker) slots += Bld.maxWorkers(b);
      if (slots >= pool + 1) { ai.orderI++; return true; }
    }
    const cost = CFG.BUILDINGS[key].levels[0].cost;
    if (!Bld.canAfford(cost, ai.res)) {
      if (!ai.goal) ai.goal = { cost, until: S.day + 15, book: true };   // save for the next move
      return true;
    }
    if (ai.acts != null && ai.acts <= 0) return true;   // hands full today — place it tomorrow
    const spot = this.plot(key);
    if (!spot || !Bld.canPlace('A', key, spot.x, spot.y).ok) { ai.orderI++; return true; }   // no ground — skip the move
    if (Bld.place('A', key, spot.x, spot.y)) { ai.orderI++; if (ai.goal && ai.goal.book) ai.goal = null; }
    return true;
  },

  // afford a cost AND keep the current savings goal intact — big projects
  // (the next Town Center) are saved for like a human would, instead of the
  // treasury forever leaking into huts
  affordFree(cost) {
    const ai = S.ai;
    for (const k in cost) {
      const reserve = (ai.goal && ai.goal.cost[k]) || 0;
      if ((ai.res[k] || 0) - cost[k] < reserve) return false;
    }
    return Bld.canAfford(cost, ai.res);
  },

  tryBuild(key, ignoreGoal) {
    // WORKFORCE-AWARE GROWTH: don't sprawl worker stations the village can't
    // crew — a field of empty farms is how a chief LOOKS busy while starving.
    // One slot ahead of the pool is allowed (the next hand trains into it).
    // Safety works (S.ai._free) bypass, so a broke chief can still dig out.
    if (CFG.BUILDINGS[key].needsWorker && !S.ai._free) {
      const pool = Units.count('A', u => Units.isVillager(u));
      let slots = 0;
      for (const b of Bld.list('A')) if (Bld.def(b.key).needsWorker) slots += Bld.maxWorkers(b);
      if (slots >= pool + 1) return false;
    }
    const cost = CFG.BUILDINGS[key].levels[0].cost;
    if (ignoreGoal ? !Bld.canAfford(cost, S.ai.res) : !this.affordFree(cost)) return false;
    const spot = this.plot(key);
    if (!spot || !Bld.canPlace('A', key, spot.x, spot.y).ok) return false;
    return !!Bld.place('A', key, spot.x, spot.y);   // null = out of daily actions
  },

  // FORWARD OPERATING BASE — the rival plants a War Camp out toward the player when
  // it commits to a push, so its assault stages, spawns and mends at the front. It
  // stakes just ONE (the player's cap is 2), sites it on reachable ground near the
  // foe but clear of their tower fire, and won't keep re-staking a lost camp (a long
  // cooldown), so a razed camp is a real setback rather than a resource leak.
  aiWarCamp(read) {
    const ai = S.ai, tc = Bld.tcOf('A');
    if (!tc || tc.level < 3) return;
    if (ai.posture !== 'PUSH' && ai.posture !== 'PRESSURE') return;
    const ptc = read.knownTC; if (!ptc) return;
    if (Bld.list('A').some(b => b.key === 'warcamp')) return;                 // one forward camp is plenty
    if (ai.memory && ai.memory.warCampAt && S.day - ai.memory.warCampAt < 40) return;   // don't re-stake a lost camp too soon
    const def = CFG.BUILDINGS.warcamp;
    if (!this.affordFree(def.levels[0].cost)) return;
    const reach = this.aiLandReach(); if (!reach) return;
    const towers = [], kb = ai.knownB || {};
    for (const k in kb) if (kb[k].key === 'tower') towers.push(kb[k]);
    const nearTower = (x, y) => towers.some(t => Math.hypot(t.x + 0.5 - x, t.y + 0.5 - y) <= 7);
    // the reachable, buildable tile nearest the player that's genuinely FORWARD (out
    // from home) and clear of their towers — a strongpoint to push from
    let best = null, bd = 1e9;
    for (let i = 0; i < reach.length; i++) {
      if (!reach[i]) continue;
      const x = i % CFG.W, y = (i / CFG.W) | 0;
      if (Math.hypot(x - tc.x, y - tc.y) < 10) continue;                      // must be well out from the home hall
      const dP = Math.hypot(x - ptc.x, y - ptc.y);
      if (dP < 8 || dP > 24) continue;                                        // near the foe, not in the wall's teeth
      if (!Bld.tileFree(x, y) || nearTower(x, y)) continue;
      if (dP < bd) { bd = dP; best = { x, y }; }
    }
    if (best && Bld.canPlace('A', 'warcamp', best.x, best.y).ok) {
      Bld.place('A', 'warcamp', best.x, best.y);
      if (ai.memory) ai.memory.warCampAt = S.day;
      G.log('⚔ The rival throws up a War Camp on your doorstep — a forward base for the assault!', true);
    }
  },

  /* ===================================================================
     LAYER 1 — PERCEPTION, UNDER FOG OF WAR.  The rival is bound by the
     same fog as the player: it knows ONLY what it has seen. Each day it
     refreshes its own vision (from its buildings and units), remembers the
     player buildings it has laid eyes on (S.ai.knownB, with staleness),
     and writes a world-read from that — currently-visible player units +
     remembered player structures. It cannot read the player's treasury;
     it ESTIMATES the enemy economy from the buildings it has seen. If it
     hasn't found the player at all, it simply doesn't know they're there,
     and must SCOUT (see daily) to learn more. Pure measurement — the only
     side effects are S.ai.read / S.ai.seen / S.ai.knownB.
     =================================================================== */
  ECON_W: { food: 1, wood: 1, stone: 0.8, gold: 0.5 },
  econOf(res) {
    let e = 0; for (const k in this.ECON_W) e += (res[k] || 0) * this.ECON_W[k]; return e;
  },
  // rough worth of a seen player building, for estimating their economy
  VIS_EST: { tc: 130, farm: 40, lodge: 35, lumber: 35, quarry: 35, house: 18,
    tower: 32, barracks: 55, range: 48, stable: 55, siege: 75, dock: 42, trade: 60, wall: 6, gate: 9 },

  // refresh what the rival can see this day, and remember player buildings seen
  updateVision() {
    const W = CFG.W, H = CFG.H, N = W * H;
    if (!this._vis || this._vis.length !== N) this._vis = new Uint8Array(N); else this._vis.fill(0);
    if (!S.ai.seen || S.ai.seen.length !== N) S.ai.seen = new Array(N).fill(0);
    if (!S.ai.knownB) S.ai.knownB = {};
    const vis = this._vis, seen = S.ai.seen;
    const mark = (cx, cy, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const x = cx + dx, y = cy + dy;
        if (!MapGen.inB(x, y)) continue;
        const i = MapGen.idx(x, y); vis[i] = 1; seen[i] = 1;
      }
    };
    for (const b of Bld.list('A')) {
      if (b.key === 'wall' || b.key === 'gate') continue;
      mark(Bld.cx(b) | 0, Bld.cy(b) | 0, Bld.done(b) ? (Bld.lv(b).vision || 4) : 2);
    }
    for (const u of S.units) if (u.owner === 'A') mark(u.x | 0, u.y | 0, CFG.UNIT_VISION);
    // remember player buildings we can currently see; forget razed ones we can see are gone
    const kb = S.ai.knownB, liveTL = new Set();
    for (const b of S.buildings) {
      if (b.owner !== 'P') continue;
      const s = Bld.size(b.key), tl = MapGen.idx(b.x, b.y);
      liveTL.add(tl);
      let visible = false;
      for (let dy = 0; dy < s && !visible; dy++) for (let dx = 0; dx < s; dx++)
        if (vis[MapGen.idx(b.x + dx, b.y + dy)]) { visible = true; break; }
      if (visible) kb[tl] = { key: b.key, level: b.level, owner: 'P', x: b.x, y: b.y, seen: S.day };
    }
    for (const k in kb) if (vis[+k] && !liveTL.has(+k)) delete kb[k];   // seen it, it's gone
  },
  canSee(u) {
    if (!this._vis) return false;
    const x = u.x | 0, y = u.y | 0;
    return MapGen.inB(x, y) && !!this._vis[MapGen.idx(x, y)];
  },
  knownPlayerTC() {
    const kb = S.ai.knownB || {};
    for (const k in kb) if (kb[k].key === 'tc') return kb[k];
    return null;
  },
  // a far, still-unexplored tile to probe toward (never reads the player's spot)
  scoutTarget() {
    const tc = Bld.tcOf('A'); if (!tc) return null;
    const seen = S.ai.seen || [];
    let best = null, bs = -1;
    for (let t = 0; t < 60; t++) {
      const x = (G.rand() * CFG.W) | 0, y = (G.rand() * CFG.H) | 0;
      if (seen[MapGen.idx(x, y)] || !Path.passable(x, y, 'A')) continue;
      const d = Math.hypot(x - tc.x, y - tc.y);
      if (d > bs) { bs = d; best = { x, y }; }
    }
    return best;
  },

  // where to sweep toward when hunting for a player we've never located. First
  // choice: the farthest REACHABLE-but-unexplored tile — real new ground the
  // column can actually march to (a reachable-but-hidden enemy is found there).
  // If the whole reachable region is already explored, the enemy is walled off
  // or across water: a strong, blind chief stops circling and commits to the
  // player's stronghold, and breachStall carves a path to it on the way in.
  /* WHERE TO LOOK NEXT. A search party needs a target that is (a) real ground
     it can walk to, (b) somewhere it hasn't already looked, and (c) not where
     the OTHER scout is already headed — two riders combing the same meadow is
     one wasted rider. When we've been attacked, the bearing the attackers came
     from is the best lead we have: they walked here from somewhere, so the
     search leans that way instead of spiralling at random. */
  searchTarget(forUnit) {
    const ai = S.ai, tc = Bld.tcOf('A'); if (!tc) return null;
    const seen = ai.seen || [];
    const reach = Path.reachFrom([{ x: tc.x, y: tc.y + 2 }]);
    const cx = Bld.cx(tc), cy = Bld.cy(tc);
    // where other search parties are already headed — don't double up
    const taken = [];
    for (const id of (ai.scouts || [])) {
      if (forUnit && id === forUnit.id) continue;
      const u = S.units.find(x => x.id === id);
      if (u && u.task && u.task.type === 'move') taken.push({ x: u.task.x, y: u.task.y });
    }
    // the bearing trouble keeps arriving from (Layer-5 memory)
    const hf = (ai.memory && ai.memory.hitFlank) || null;
    let best = null, bs = -1e9;
    const consider = (x, y) => {
      const i = MapGen.idx(x, y);
      if (seen[i]) return;                                   // already looked here
      if (reach && !reach[i]) return;                        // can't walk there
      if (!Path.passable(x, y, 'A')) return;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
      let s = d;                                             // far ground first — the enemy isn't next door
      if (hf) s += ((dx / d) * hf.x + (dy / d) * hf.y) * 26;  // …and lean into the bearing they hit us from
      for (const t of taken) s -= Math.max(0, 22 - Math.hypot(x - t.x, y - t.y)) * 2.2;
      if (s > bs) { bs = s; best = { x, y }; }
    };
    for (let y = 1; y < CFG.H - 1; y += 2) for (let x = 1; x < CFG.W - 1; x += 2) consider(x, y);
    if (best) return best;
    // every reachable tile already seen — they're across water or walled off;
    // make for their spawn corner and let the breach/landing logic take over
    return this.huntTarget();
  },

  huntTarget() {
    const ai = S.ai, tc = Bld.tcOf('A'); if (!tc) return null;
    const seen = ai.seen || [];
    const reach = Path.reachFrom([{ x: tc.x, y: tc.y + 2 }]);
    let best = null, bs = -1;
    if (reach) {
      for (let i = 0; i < reach.length; i++) {
        if (!reach[i] || seen[i]) continue;
        const x = i % CFG.W, y = (i / CFG.W) | 0;
        const d = Math.hypot(x - tc.x, y - tc.y);
        if (d > bs) { bs = d; best = { x, y }; }
      }
    }
    if (best) return best;                       // reachable frontier to explore
    const ptc = Bld.tcOf('P');                   // fully explored — go break the siege
    return ptc ? { x: ptc.x, y: ptc.y + 3 } : this.scoutTarget();
  },

  assess() {
    const ai = S.ai;
    this.updateVision();
    const tc = Bld.tcOf('A');
    const kb = ai.knownB || {};
    const knownTC = this.knownPlayerTC();
    const pcx = knownTC ? knownTC.x + Bld.size('tc') / 2 : CFG.W / 2;
    const pcy = knownTC ? knownTC.y + Bld.size('tc') / 2 : CFG.H / 2;
    const prevFoe = (ai.read && ai.read.foePower) || 0;
    const myPower = this.power('A');

    // --- player military we can SEE right now (fog-limited) ---
    let foePower = 0, foeHome = 0, foeAway = 0, foeCav = 0, foeArch = 0, foeSiege = 0, foeMelee = 0;
    for (const u of S.units) {
      if (u.owner !== 'P' || !Units.isMilitary(u) || Units.isNaval(u) || !this.canSee(u)) continue;
      foePower += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman' ||
        u.kind === 'catapult' || u.kind === 'ballista') ? 2 : 1;
      if (knownTC && Math.hypot(u.x - pcx, u.y - pcy) <= 12) foeHome++; else foeAway++;
      const k = u.kind;
      if (k === 'rider' || k === 'horsearcher' || k === 'lancer') foeCav++;
      else if (k === 'archer' || k === 'longbow' || k === 'marksman') foeArch++;
      else if (Units.isSiege(u) || k === 'ballista') foeSiege++;
      else foeMelee++;
    }

    // --- player buildings we REMEMBER: defenses, weak flank, economy estimate ---
    const known = [];
    for (const key in kb) { const b = kb[key]; if (b.owner === 'P') known.push(b); }
    let foeWall = 0, foeTower = 0, weakFlank = null, foeEconEst = 0;
    for (const b of known) {
      foeEconEst += (this.VIS_EST[b.key] || 12) * (b.level || 1);
      if (knownTC && Math.hypot(b.x - knownTC.x, b.y - knownTC.y) <= 14) {
        if (b.key === 'wall' || b.key === 'gate') foeWall++;
        else if (b.key === 'tower') foeTower += (CFG.BUILDINGS.tower.levels[(b.level || 1) - 1].atk) || 0;
      }
    }
    if (knownTC) {
      let worst = 1e9;
      for (let a = 0; a < 8; a++) {
        const ang = a / 8 * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
        let def = 0;
        for (const b of known) {
          if (b.key !== 'wall' && b.key !== 'gate' && b.key !== 'tower') continue;
          const bx = (b.x + 0.5) - pcx, by = (b.y + 0.5) - pcy, dist = Math.hypot(bx, by);
          if (dist < 2 || dist > 12) continue;
          if ((bx * dx + by * dy) / dist > 0.45) def += b.key === 'tower' ? 2 : 1;
        }
        if (def < worst) { worst = def; weakFlank = { x: Math.round(pcx + dx * 8), y: Math.round(pcy + dy * 8), dx, dy, def }; }
      }
    }

    // --- exposure: remembered undefended workplaces + VISIBLE isolated gatherers ---
    const exposed = [];
    const knownTowers = known.filter(b => b.key === 'tower');
    const guarded = (x, y) => knownTowers.some(t => Math.hypot(t.x + 0.5 - x, t.y + 0.5 - y) <= 6);
    for (const b of known) {
      if (!(b.key === 'farm' || b.key === 'lodge' || b.key === 'lumber' || b.key === 'quarry')) continue;
      if (!guarded(b.x + 0.5, b.y + 0.5)) exposed.push({ x: b.x + 0.5, y: b.y + 0.5, kind: b.key, bld: true });
    }
    for (const u of S.units) {
      if (u.owner !== 'P' || !Units.isVillager(u) || !this.canSee(u)) continue;
      if (knownTC && Math.hypot(u.x - pcx, u.y - pcy) < 8) continue;
      if (S.units.some(s => s.owner === 'P' && Units.isMilitary(s) && this.canSee(s) && Math.hypot(s.x - u.x, s.y - u.y) < 6)) continue;
      exposed.push({ x: u.x, y: u.y, id: u.id, kind: 'villager', villager: true });
    }

    // --- threat at my own hall — I can always see my own ground ---
    let threat = 0;
    if (tc) {
      const mcx = Bld.cx(tc), mcy = Bld.cy(tc);
      for (const u of S.units) {
        if (Units.isNaval(u) || Math.hypot(u.x - mcx, u.y - mcy) > 11) continue;
        if ((u.owner === 'P' && Units.isMilitary(u)) || (u.owner === 'R' && !Units.isTransport(u)))
          threat += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'brute') ? 2 : 1;
      }
    }

    const myEcon = this.econOf(ai.res);
    const myBld = Bld.list('A').length;
    const underCon = Bld.list('A').filter(b => !Bld.done(b)).length;
    ai.peakBld = Math.max(ai.peakBld || 0, myBld);

    // --- MY OWN terrain: how many open seams does my town still have, and how
    //     wide is the main one? Fewer/narrower seams = terrain is doing the
    //     walling; the chief only needs to close what's left (see maybeWalls) ---
    const homeGaps = tc ? this.perimeterGaps(Bld.cx(tc) | 0, Bld.cy(tc) | 0, 5) : [];
    const homeExposed = homeGaps.reduce((s, g) => s + g.width, 0);

    // a vulnerability window is only real if we've FOUND the player and can
    // see their home is thin (or their gatherers are out unguarded)
    const foeVuln = !!knownTC && ((foePower >= 2 && foeHome * 1.5 < foePower) || exposed.length >= 2);
    // STRIKE WINDOW — timing, read off genuine scouting: intel on the town is
    // fresh AND the army we can SEE is away from home (or home stands nearly
    // empty while their soldiers are known to exist elsewhere). A human hits
    // you the moment your army marches out; now so does the chief. Fog-honest:
    // every term below comes from units currently visible to its own eyes.
    const kFresh = !!knownTC && S.day - (knownTC.seen || 0) <= 6;
    const strikeWindow = kFresh && foePower >= 2 &&
      (foeAway >= foeHome + 3 || (foeHome === 0 && foeAway >= 2));

    ai.read = {
      day: S.day,
      knownTC: knownTC ? { x: knownTC.x, y: knownTC.y, seen: knownTC.seen } : null, scouted: !!knownTC,
      myPower, foePower, powerRatio: myPower / Math.max(1, foePower),
      foeTrend: foePower > prevFoe + 1 ? 1 : foePower < prevFoe - 1 ? -1 : 0,
      foeHome, foeAway, foeVuln, strikeWindow,
      foeWall, foeTower, weakFlank,
      foeCav, foeArch, foeSiege, foeMelee,
      foeCavHeavy: foeCav >= 2 && foeCav >= foeArch && foeCav >= foeMelee,
      foeArchHeavy: foeArch >= 2 && foeArch > foeCav && foeArch >= foeMelee,
      foeSiegeSeen: foeSiege > 0,
      exposed, softCount: exposed.length,
      myEcon, foeEcon: foeEconEst, econEdge: myEcon - foeEconEst,
      myBld, foeBld: known.length, underCon,
      aheadPower: myPower - foePower, aheadTempo: myBld - known.length,
      threat, underThreat: threat >= 3,
      homeGapCount: homeGaps.length, homeGapWidest: homeGaps[0] ? homeGaps[0].width : 0, homeExposed,
      sacked: ai.peakBld >= 5 && myBld < ai.peakBld * 0.5,
    };
    if (window.DEBUG_AI) this._drawRead();
    return ai.read;
  },

  /* ===================================================================
     LAYER 2 — STRATEGIC POSTURE.  The card is the tribe's PERSONALITY;
     posture is its CURRENT PLAN, chosen from the read and allowed to
     change as the game turns. Each persona has a game-plan: a preferred
     posture arc (its identity played well) and an aggression appetite.
     The read can override the arc when the board demands (a boom chief
     getting rushed drops to DEFEND). Hysteresis (minimum dwell times)
     makes the chief COMMIT to a plan instead of flip-flopping.

       EXPAND      — boom economy, minimal army (safe + behind on econ)
       CONSOLIDATE — build army + defenses toward a target (default)
       PRESSURE    — harass exposed targets, deny expansion, retreat
       PUSH        — mass a force and commit to end it
       DEFEND      — rally, wall the flank, turtle (behind / under threat)
       REBUILD     — recover after a sacking
     =================================================================== */
  PLANS: {
    homesteader: { aggression: 0.30, win: 'economy',   arc: [[0, 'EXPAND'], [50, 'CONSOLIDATE'], [120, 'PUSH']] },
    warlord:     { aggression: 0.92, win: 'military',   arc: [[0, 'CONSOLIDATE'], [16, 'PRESSURE'], [38, 'PUSH']] },
    horselord:   { aggression: 0.72, win: 'attrition', harass: true, arc: [[0, 'CONSOLIDATE'], [18, 'PRESSURE']] },
    mariner:     { aggression: 0.52, win: 'naval',      arc: [[0, 'CONSOLIDATE'], [55, 'PRESSURE']] },
    mason:       { aggression: 0.38, win: 'defense',    arc: [[0, 'DEFEND'], [38, 'CONSOLIDATE'], [85, 'PUSH']] },
    forager:     { aggression: 0.48, win: 'timing',     arc: [[0, 'EXPAND'], [38, 'CONSOLIDATE'], [78, 'PUSH']] },
  },
  plan() { return this.PLANS[S.ai && S.ai.persona] || this.PLANS.homesteader; },
  arcPosture(pl, day) { let p = pl.arc[0][1]; for (const [d, post] of pl.arc) if (day >= d) p = post; return p; },

  /* CREATIVITY dial (0..1) — how much the chief varies its execution: feints,
     split forces, unexpected timing, opportunistic plays. Derived from the
     persona (aggressive/harassing chiefs are craftier) and SCALED BY DIFFICULTY
     (Calm plays it straighter, Hard is unpredictable). All variation it drives
     stays inside tactically-sound bounds — this makes behaviour hard to memorise,
     never self-defeating. */
  creativity() {
    const pl = this.plan(), m = G.modeCfg();
    let c = 0.22 + pl.aggression * 0.42 + (pl.harass ? 0.16 : 0);
    c *= 0.55 + 0.5 * (m.aiAggro || 1);   // difficulty: Calm ~0.83×, Hard ~1.15×
    return Math.max(0.05, Math.min(1, c));
  },
  DWELL: { DEFEND: 3, REBUILD: 4, PUSH: 5, PRESSURE: 5, CONSOLIDATE: 6, EXPAND: 7 },

  // soldiers standing near my own hall (my ability to hold a defense)
  _homeGuard() {
    const tc = Bld.tcOf('A'); if (!tc) return 0;
    const cx = Bld.cx(tc), cy = Bld.cy(tc); let g = 0;
    for (const u of S.units)
      if (u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) && Math.hypot(u.x - cx, u.y - cy) <= 11)
        g += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman') ? 2 : 1;
    return g;
  },

  choosePosture() {
    const ai = S.ai, r = ai.read, pl = this.plan(), m = G.modeCfg();
    // difficulty is APPETITE, not decision quality: it scales how readily the
    // chief commits, never whether it reads the board (which it always does)
    const app = m.aiAggro || 1;
    const aggro = Math.min(1.25, pl.aggression * (0.5 + 0.6 * app));
    let want = this.arcPosture(pl, S.day);          // the persona's game-plan by default
    // --- the read overrides the plan when the board demands ---
    if (r.sacked) want = 'REBUILD';
    else if (r.underThreat && r.threat > this._homeGuard()) want = 'DEFEND';
    else if (r.foeVuln && r.myPower >= 3 && r.powerRatio >= 1.05 - aggro * 0.35)
      want = aggro >= 0.6 ? 'PUSH' : 'PRESSURE';     // a real opening — take it
    else if (r.powerRatio >= 1.7 / app && r.myPower >= 4) want = 'PUSH';   // ahead enough to end it
    else if (r.powerRatio < 0.65 && r.foePower >= 4) want = 'DEFEND'; // clearly behind, dig in
    else if (r.econEdge < -180 && r.threat === 0 && !r.foeVuln && pl.win === 'economy') want = 'EXPAND';
    // you cannot commit to an attack on a town you have not FOUND: with no
    // known enemy home, an attack plan falls back to massing (CONSOLIDATE)
    // while the scouts go looking. DEFEND still holds against what's on us.
    if (!r.knownTC && (want === 'PUSH' || want === 'PRESSURE')) want = 'CONSOLIDATE';
    // --- hysteresis: commit to a plan unless an emergency forces a change ---
    const emergency = (want === 'DEFEND' && r.underThreat) || want === 'REBUILD';
    if (!ai.posture) { ai.posture = want; ai.postureSince = S.day; }
    else if (want !== ai.posture &&
             (emergency || (S.day - (ai.postureSince || 0)) >= (this.DWELL[ai.posture] || 6))) {
      ai.posture = want; ai.postureSince = S.day;
    }
    return ai.posture;
  },

  /* ===================================================================
     LAYER 3 — UTILITY-SCORED ACTIONS.  The old daily pipeline ran ~10
     construction rules in a FIXED ORDER, each firing on a hard edge —
     which read as mechanical. Now the chief enumerates candidate actions
     and scores each as f(posture × read × persona × resources × timing),
     then spends the day on the best. The old safety nets aren't
     pre-empting steps anymore — they're just very high-utility candidates
     that COMPOSE. Utilities are continuous, so behavior shifts smoothly.
     =================================================================== */
  HALL_OF: { defender: 'barracks', axeman: 'barracks', elite: 'barracks',
    archer: 'range', longbow: 'range', marksman: 'range',
    rider: 'stable', horsearcher: 'stable', lancer: 'stable',
    catapult: 'siege', ballista: 'siege', trebuchet: 'siege' },

  // re-weight the army mix toward the hard counters the read calls for
  counterMix(mix, read) {
    // counters key off BOTH the current sighting AND the persistent read of what
    // the player keeps massing (memory) — so the chief counter-builds on the
    // trend, not a single lucky glimpse
    const cav = read.foeCavHeavy || read.foeMassed === 'cav';
    const arch = read.foeArchHeavy || read.foeMassed === 'arch';
    const siege = read.foeSiegeSeen || read.foeMassed === 'siege';
    const out = mix.map(([k, w]) => {
      let x = w;
      if (cav && (k === 'defender' || k === 'archer' || k === 'longbow' || k === 'elite')) x *= 1.9;
      if (arch && (k === 'rider' || k === 'horsearcher' || k === 'lancer')) x *= 1.9;
      if (siege && (k === 'rider' || k === 'horsearcher' || k === 'lancer')) x *= 1.4;
      return [k, x];
    });
    const tot = out.reduce((a, [, w]) => a + w, 0) || 1;
    return out.map(([k, w]) => [k, w / tot]);
  },

  /* LAYER 5 — LEARN & ADAPT within the match. Folds fresh observations into a
     decaying memory so the chief gets harder to read the longer you play:
       · hitFlank  — the direction the player keeps attacking FROM (reinforce it:
                     towerSpot and maybeWalls bias toward this flank)
       · foeMassed — what the player keeps fielding, over time (counterMix keys
                     off the trend, not one sighting)
       · foeRush   — got hit at home early → a rusher, so fortify sooner
     laneDef / wallStop (Layer 4) already adapt the OFFENSE; this adapts defence
     and production. Everything decays, so stale reads fade. */
  learn(read) {
    const ai = S.ai, tc = Bld.tcOf('A'), mem = ai.memory || (ai.memory = {});
    if (!mem.hitDir) mem.hitDir = {};
    if (!mem.comp) mem.comp = { cav: 0, arch: 0, melee: 0, siege: 0 };
    // where are we being hit? use the last alarm, else the closest hostile at home
    if (tc) {
      const cx = Bld.cx(tc), cy = Bld.cy(tc);
      let src = (ai.alarm && S.day - ai.alarm.day <= 2) ? { x: ai.alarm.x + 0.5, y: ai.alarm.y + 0.5 } : null;
      if (!src) { let bd = 11; for (const u of S.units) { if (!(u.owner === 'P' && Units.isMilitary(u)) || Units.isNaval(u)) continue; const d = Math.hypot(u.x - cx, u.y - cy); if (d < bd) { bd = d; src = { x: u.x, y: u.y }; } } }
      if (src) {
        const ddx = src.x - cx, ddy = src.y - cy;   // zero out near-axis components so a due-E hit reads {1,0}, not {1,1}
        const dx = Math.abs(ddx) < 1 ? 0 : Math.sign(ddx), dy = Math.abs(ddy) < 1 ? 0 : Math.sign(ddy);
        if (dx || dy) mem.hitDir[dx + ',' + dy] = Math.min(10, (mem.hitDir[dx + ',' + dy] || 0) + 1);
        if (S.day <= 35) mem.foeRush = true;   // attacked at home early → a rusher
      }
    }
    let bk = null, bw = 0.8;
    for (const k in mem.hitDir) { mem.hitDir[k] *= 0.93; if (mem.hitDir[k] > bw) { bw = mem.hitDir[k]; bk = k; } if (mem.hitDir[k] < 0.2) delete mem.hitDir[k]; }
    mem.hitFlank = bk ? { x: +bk.split(',')[0], y: +bk.split(',')[1] } : null;
    // what is the player massing? decaying tally of the seen composition
    mem.comp.cav = mem.comp.cav * 0.9 + read.foeCav;
    mem.comp.arch = mem.comp.arch * 0.9 + read.foeArch;
    mem.comp.melee = mem.comp.melee * 0.9 + read.foeMelee;
    mem.comp.siege = mem.comp.siege * 0.9 + read.foeSiege;
    const dom = Object.entries(mem.comp).sort((a, b) => b[1] - a[1])[0];
    mem.foeMassed = dom && dom[1] >= 1.5 ? dom[0] : null;
    read.foeMassed = mem.foeMassed;   // expose to counterMix / bestBuild this day
    read.foeRush = !!mem.foeRush;
  },

  // the standing-army target, shaped by difficulty AND posture appetite
  armyWant(m, post) {
    const cap = Math.min(Math.round((m.aiArmyCap || 8) * 2.5),
      (m.aiArmyCap || 8) + Math.floor(Math.max(0, S.day - 60) / 12));
    let want = Math.min(2 + Math.floor(S.day / (m.aiArmyDiv || 8)), cap);
    // BLIND: keep enough spears to send a search party out AND hold the hall —
    // finding the enemy is the gate on every offensive plan, so it outranks
    // even a boom chief's preference for a token guard
    if (!(S.ai.read && S.ai.read.knownTC) && S.day >= 10) want = Math.max(want, 4);
    else if (post === 'EXPAND') want = Math.min(want, 4);     // boom: keep a token guard
    else if (post === 'PUSH') want = cap;                     // mass for the kill
    else if (post === 'DEFEND') want = Math.min(cap, want + 2);
    // gentler opening: modes with aiEarly < 1 field a lighter army through the
    // first 100 days, so the young village gets room to breathe before the
    // full-weight pushes begin
    if (S.day < 100 && m.aiEarly) want = Math.max(2, Math.round(want * m.aiEarly));
    return want;
  },

  // SAFETY actions — high utility, allowed to fire on ANY day. They
  // compose with the rest instead of pre-empting a fixed pipeline slot.
  digAndProtect(read) {
    const ai = S.ai, tc = Bld.tcOf('A'), P = this.persona();
    ai.broke = ai.broke || {};
    for (const k of ['wood', 'stone', 'food']) {   // starved for days → dig out now
      ai.broke[k] = ai.res[k] < 40 ? (ai.broke[k] || 0) + 1 : 0;
      if (ai.broke[k] >= 5) {
        const bk = { wood: 'lumber', stone: 'quarry', food: 'farm' }[k];
        // capped: a dig-out is ONE extra station the crews can rotate onto, never
        // an uncrewed field of them (under the crewed economy an empty camp
        // produces nothing while its cost starves whatever we were saving for)
        const have = Bld.list('A').filter(b => b.key === bk).length;
        const pool = Units.count('A', u => Units.isVillager(u));
        if (have < Math.max(2, Math.ceil(pool / 2)) && this.tryBuild(bk, true)) { ai.broke[k] = 0; return true; }
      }
    }
    /* A town needs an ARMY HALL before it fortifies — an army is not a
       personality trait. Past a few days with no hall, build the persona's
       core hall the moment it's affordable. If it ISN'T affordable, SAVE
       for it (a goal reservation walls the pot off from other spending)
       instead of "digging out" a new income building every day — under the
       crewed economy those uncrewed camps produce nothing, and their cost
       ate the very wood the hall needed (the no-army spiral that left a
       Hard chief with 16 quarries, no stable and one soldier at day 60). */
    /* THE FIRST HALL IS THE EYES, not just the spears. Nothing offensive can
       start until the tribe has found its enemy, and a pair of soldiers is what
       does the finding — so the first barracks is wanted EARLY, well before any
       wall or second camp. */
    const ML = ['barracks', 'range', 'stable'];
    const hasHall = S.buildings.some(b => b.owner === 'A' && ML.includes(b.key));
    if (ai.goal && ai.goal.hall && hasHall) ai.goal = null;   // saved up and built — release the reserve
    if (S.day >= 5 && !hasHall) {
      const want = P.mix.map(([k]) => this.HALL_OF[k]).find(h => ML.includes(h)) || 'barracks';
      if (this.tryBuild(want, true)) { if (ai.goal && ai.goal.hall) ai.goal = null; return true; }
      const cost = CFG.BUILDINGS[want].levels[0].cost;
      if (!ai.goal || (!ai.goal.hall && !ai.goal.book))
        ai.goal = { cost, until: S.day + 20, hall: true };
      // at most ONE dig-out toward the blocking resource — then wait and save
      for (const [res, key] of [['wood', 'lumber'], ['stone', 'quarry'], ['food', 'farm']]) {
        if ((cost[res] || 0) > (ai.res[res] || 0)) {
          const have = Bld.list('A').filter(b => b.key === key).length;
          if (have < 2 && this.tryBuild(key, true)) return true;
        }
      }
    }
    // under attack with thin walls → raise a tower now (savings jar be damned)
    if (read.underThreat && Bld.list('A').filter(b => b.key === 'tower').length < 2 + tc.level &&
        this.tryBuild('tower', true)) return true;
    /* THE HOME FLOOR — prudence, not paranoia. A punch can land before the
       scouts see it coming, so the chief keeps a BASELINE of guard-works even
       in peacetime instead of betting everything on the offence (a real game
       was lost with one tower and no walls the moment the player hit back):
       - towers up to the hall's level (one more late-game), coverage-sited;
       - once the town is established, walls close the open seams — paid only
         from a wood SURPLUS and paced every few days, so the army and economy
         are never starved for the ring. */
    const towerFloor = Math.min(4, tc.level + (S.day > 90 ? 1 : 0));
    if (S.day >= 12 && Bld.list('A').filter(b => b.key === 'tower').length < towerFloor &&
        this.tryBuild('tower', true)) return true;
    if (S.day >= 35 && tc.level >= 2 && S.day % 3 === 0 && (ai.res.wood || 0) > 160 &&
        (read.homeGapCount || 0) > 0) { this.maybeWalls(tc); return true; }
    return false;
  },

  _buildDock() {
    const tc = Bld.tcOf('A');
    if (!Bld.canAfford(CFG.BUILDINGS.dock.levels[0].cost, S.ai.res)) return false;
    const site = MapGen.findNear(tc.x, tc.y, 8,
      (x, y) => Bld.dockSiteOk(x, y, 'A').ok && !this.onWallLine(x, y, tc));
    if (site && Bld.canPlace('A', 'dock', site.x, site.y).ok) return !!Bld.place('A', 'dock', site.x, site.y);
    return false;
  },

  // score every construction/upgrade candidate; act on the best affordable one
  bestBuild(read) {
    const ai = S.ai, P = this.persona(), pl = this.plan(), post = ai.posture, tc = Bld.tcOf('A');
    const have = {}; for (const b of Bld.list('A')) have[b.key] = (have[b.key] || 0) + 1;
    const C = [];
    const add = (util, run) => { if (util > 0) C.push({ util, run }); };

    // SIEGE-CAMPAIGN SUPPORT — the committed plan needs an enabling building; give
    // it a commanding priority so the chief actually tools up for its chosen assault
    // (a workshop for the engines, a dock for the landing, a sappers' camp to breach).
    const camp = ai.camp && ai.camp.strat;
    if (camp === 'IRONBELLY' || camp === 'HIGHREACH') { if (!have.siege && tc.level >= 3) add(95, () => this.tryBuild('siege')); }
    if (camp === 'TIDEWRACK' && !have.dock && tc.level >= 2) add(95, () => this._buildDock());
    if (camp === 'MUDLARK' && !have.sapper && tc.level >= 2) add(95, () => this.tryBuild('sapper'));

    // income buildings — but NOT while raiders are in the yard: a farm started
    // under fire is wood handed to the torch (the day's actions belong to
    // towers, walls and spears until the field is clear)
    const calm = read.underThreat ? 0.2 : 1;
    // IDLE HANDS: villagers with no station to crew are dead weight — the pool
    // grows on a clock whether or not there's work, so a town that stops laying
    // stations quietly pays for hands that produce nothing.
    const pool = Units.count('A', u => Units.isVillager(u));
    let slots = 0;
    for (const b of Bld.list('A')) if (Bld.def(b.key).needsWorker) slots += Bld.maxWorkers(b);
    const idleHands = Math.max(0, pool - slots);
    /* WHAT THE TOWN IS SHORT OF, not a fixed ratio of camps. The old score
       keyed off a stock threshold (below 60 in hand) and a flat penalty per
       existing camp, which is why a rival would run a single quarry for a
       hundred days — stone starved every tower, wall tier and hall upgrade
       while its granary climbed past four thousand food it had no use for.
       Shortfall counts what's being SAVED for as well, so saving for the next
       hall tier is itself a reason to open another quarry. */
    const goalCost = (ai.goal && ai.goal.cost) || {};
    const WANT = { food: 300, wood: 350, stone: 320 };
    const shortfall = (r) => {
      const want = (WANT[r] || 300) + (goalCost[r] || 0);
      return Math.max(-1, Math.min(1.5, (want - (ai.res[r] || 0)) / want));   // >0 short, <0 drowning
    };
    for (const [res, key] of [['wood', 'lumber'], ['stone', 'quarry'], ['food', 'farm']]) {
      let u = 20 - (have[key] || 0) * 5 + shortfall(res) * 46;
      if (post === 'EXPAND') u += 20;
      if (pl.win === 'economy' || pl.win === 'timing') u += 6;
      // NO STATION AT ALL for a resource is a hole in the economy, not a
      // preference — a chief with no quarry simply stops developing.
      if (!have[key] && S.day > 20) u += 45;
      u += Math.min(30, idleHands * 10);            // put the idle hands to work
      add(u * calm, () => this.tryBuild(key));
    }
    add((14 - (have.lodge || 0) * 8 + (P.name === 'Forager' ? 12 : 0)) * calm, () => this.tryBuild('lodge'));

    // military halls for the mix, plus counters the read demands
    const wantHalls = new Set();
    for (const [k] of P.mix) wantHalls.add(this.HALL_OF[k]);
    if (read.foeCavHeavy || read.foeMassed === 'cav') wantHalls.add('range');   // counter the trend, not one glimpse
    if (read.foeArchHeavy || read.foeMassed === 'arch') wantHalls.add('stable');
    /* SIEGE TECH. This used to demand THREE seen wall sections before the chief
       would even consider a workshop — a bar a compact, well-towered town never
       trips, so a mature rival reached day 160 with a full treasury and no
       engine to its name. Any real fortification (a wall line OR standing
       towers) now justifies the workshop once the hall is grown, and a rich
       late-game chief builds one on principle: engines are how you crack a
       town, and having none is why an attack stalls at the gate. */
    const foeFortified = read.foeWall >= 2 || (read.foeTower || 0) > 0;
    if (tc.level >= 3 && (foeFortified || (S.day > 90 && ai.res.wood > 260 && ai.res.stone > 160)))
      wantHalls.add('siege');
    for (const hall of wantHalls) {
      if (!hall || have[hall]) continue;
      if (hall === 'siege' && tc.level < 3) continue;
      let u = 48;
      if (hall === 'siege' && foeFortified) u += 30;   // a fortified foe makes a workshop worth the wood
      if (post === 'CONSOLIDATE' || post === 'PUSH' || post === 'PRESSURE') u += 28;
      if (hall === 'range' && read.foeCavHeavy) u += 40;   // massed arrows/spears beat horse
      if (hall === 'stable' && read.foeArchHeavy) u += 40; // cavalry closes on archers
      add(u, () => this.tryBuild(hall));
    }

    // tower / walls (defense). Towers now COVER (spread across seams) and walls
    // are a real investment, not a token. Tower utility rises with uncovered
    // frontage so the chief keeps building until its approaches are guarded, then
    // tapers; walls fire for any chief with open seams, heavier when threatened.
    // a safe chief keeps a couple of watchtowers (vision + a deterrent); a
    // threatened one builds toward covering its whole frontage. Coverage-aware
    // placement (towerSpot) means each new tower earns its keep.
    const threatened = read.underThreat || read.foeRush || read.threat > 0 || post === 'DEFEND';
    add(18 + (P.walls ? 14 : 0) + (post === 'DEFEND' ? 38 : 0) + (read.underThreat ? 20 : 0) +
        (read.foeRush ? 16 : 0) + (threatened ? Math.min(18, (read.homeExposed || 0) * 1.4) : 0) -
        (have.tower || 0) * 5,
      () => this.tryBuild('tower'));
    // WALLS scale with THREAT and posture — a wall-persona or a threatened chief
    // fortifies; a safe non-wall chief doesn't burn wood ringing open ground
    // against nobody (that starves the offence against a passive foe).
    // ...and a MATURE town closes its seams whatever the persona — by day 60 an
    // open village is an invitation, and every chief knows it
    if ((S.day >= 18 || read.foeRush) && read.homeGapCount > 0 && (P.walls || threatened || S.day >= 60)) {
      const wu = (P.walls ? 26 : 10) + (post === 'DEFEND' ? 34 : 0) + (read.underThreat ? 26 : 0) +
        (read.foeRush ? 18 : 0) + (threatened ? Math.min(22, read.homeExposed * 2) : 0);
      add(wu, () => { this.maybeWalls(tc); return true; });
    }

    // dock (naval)
    if (tc.level >= P.dockTC && !have.dock) add(pl.win === 'naval' ? 55 : 14, () => this._buildDock());

    // sappers' camp — the terraforming corps. A turtling/threatened chief moats
    // its approaches; a wall-persona especially loves it (layers with walls).
    if (tc.level >= 2 && !have.sapper) {
      const nearWater = S.buildings.some(b => b.owner === 'A' && b.key === 'dock') ||
        (read.homeGapCount > 0);   // cheap proxy; the dig routine checks real water adjacency
      // a raid party stuck at a crossing badly wants a bridging corps
      const stalled = ai.stall && S.day - (ai.stall.t || 0) <= 6;
      add(8 + (P.walls ? 24 : 0) + (post === 'DEFEND' ? 22 : 0) + (read.underThreat ? 14 : 0) +
          (read.homeExposed > 4 ? 10 : 0) + (nearWater ? 4 : 0) + (stalled ? 26 : 0),
        () => this.tryBuild('sapper'));
    }

    // trading post — a late-game coin sink. The rival raises one once it's TC3
    // and sitting on a resource surplus it could turn into gold. Low priority so
    // it never crowds out army or defense; affordFree keeps it from raiding the
    // savings goal (and it's expensive), so it only appears when genuinely rich.
    if (tc.level >= 3 && !have.trade) {
      const surplus = Math.max(ai.res.wood, ai.res.stone, ai.res.food) > 320;
      add(13 + (surplus ? 18 : 0) + (pl.win === 'economy' ? 6 : 0), () => this.tryBuild('trade'));
    }

    // houses (AI ignores pop cap — just a lived-in look)
    add((9 + (post === 'EXPAND' ? 5 : 0) - (have.house || 0) * 2) * calm, () => this.tryBuild('house'));

    // Town Center upgrade
    if (tc.level < 3 && !tc.upgrading && Bld.canUpgrade(tc).ok) {
      let u = S.day > P.tcDays[tc.level - 1] ? 66 : 18;
      if (post === 'EXPAND') u += 18;
      if (read.underThreat) u -= 45;
      add(u, () => { Bld.upgrade(tc); return true; });
    }

    // upgrade a standing building (stronger units / stouter defense). A raid party
    // stuck at woods it can't clear (needs a TIER-3 corps) makes upgrading the
    // sapper camp the priority — a bridging corps that can also clear-cut breaks
    // the deadlock.
    // an assault stalled at an obstacle its corps can't yet overcome — woods
    // needing tier 3, or WATER needing tier 2 — makes the sappers' camp the
    // most valuable upgrade on the board: it's the thing unblocking the war
    const stalledClear = ai.stallClearT && S.day - ai.stallClearT <= 6;
    const stalledBridge = ai.stallBridgeT && S.day - ai.stallBridgeT <= 6;
    const ups = Bld.list('A').filter(b => b.key !== 'tc' && Bld.canUpgrade(b).ok);
    if (ups.length) {
      const prio = { barracks: 3, range: 3, stable: 3, siege: 2, tower: 2, dock: 2 };
      ups.sort((a, b2) => (prio[b2.key] || 1) - (prio[a.key] || 1));
      const sapUp = (stalledClear || stalledBridge) && ups.find(b => b.key === 'sapper');
      // the hall we're saving for outranks the rest of the queue — that tier is
      // the veteran unlock, and veterans are worth double their number
      const vetHall = ai.goal && ai.goal.vet &&
        ups.find(b => ['barracks', 'range', 'stable'].includes(b.key) && (b.level || 1) < 3);
      const b = sapUp || vetHall || ups[0];
      add(24 + (prio[b.key] || 1) * 6 + (post === 'PUSH' ? 18 : 0) - (post === 'EXPAND' ? 10 : 0) +
          (sapUp ? 40 : 0) + (b === vetHall ? 34 : 0),
        () => Bld.upgrade(b));
    }

    // reinforce the WHOLE wall ring a tier (the rival's equivalent of the player's
    // Town-Center wall upgrade). A chief sitting on stone with a flimsy L1 ring and
    // the TC tech to improve it should stiffen the walls — heavily so when it's
    // turtling or under threat, and a wall-persona always values it.
    if (Bld.aiCanUpgradeWalls()) {
      const wallUp = 22 + (P.walls ? 18 : 0) + (post === 'DEFEND' ? 20 : 0) +
        (read.underThreat ? 22 : 0) + (read.foeSiege > 0 ? 16 : 0);
      add(wallUp, () => Bld.aiUpgradeWalls());
    } else if (tc.level >= 2 && Bld.forts('A').some(b => (b.level || 1) < Math.min(3, tc.level))) {
      // can't re-face the whole ring in one go (few rivals ever can) — re-face
      // the most exposed stretch instead, so the palisade keeps turning to stone
      const wallUp = 20 + (P.walls ? 16 : 0) + (post === 'DEFEND' ? 18 : 0) +
        (read.underThreat ? 20 : 0) + (read.foeSiege > 0 ? 14 : 0);
      add(wallUp, () => Bld.aiRefaceWalls(4));
    }

    // endless growth backfill
    const gk = this.growthKey();
    if (gk) add(18 * calm, () => this.tryBuild(gk));

    C.sort((a, b) => b.util - a.util);
    for (const a of C) if (a.run()) return true;   // best affordable action wins the day
    return false;
  },

  /* LAYER 4 (planning half) — pick the raid's OBJECTIVE at launch, so the
     party fights as one toward a real aim instead of dribbling at whatever's
     nearest. PRESSURE goes for the juiciest soft target (cripple economy,
     then leave); PUSH marches on the hall — but if the player is walled and
     the chief either remembers a wall-stall (memory) or brings no siege, it
     comes in through the WEAKEST FLANK instead of battering the front gate. */
  chooseRaidObj(read, push) {
    const ai = S.ai, atc = Bld.tcOf('A'), ptc = read.knownTC;   // only what we've found
    const mem = ai.memory || {};
    if (!push && read.exposed && read.exposed.length) {
      let best = null, bd = 1e9;
      for (const e of read.exposed) {
        const d = atc ? Math.hypot(e.x - atc.x, e.y - atc.y) : 0;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) return { type: 'econ', x: Math.round(best.x), y: Math.round(best.y) };
    }
    if (ptc) {
      const carrySiege = S.units.some(u => u.owner === 'A' && u.task && u.task.type === 'raid' && Units.isSiege(u));
      const wf = read.weakFlank;
      const flank = read.foeWall > 0 && wf && (mem.wallStop || !carrySiege);
      return { type: 'tc', x: flank ? wf.x : ptc.x, y: flank ? wf.y : ptc.y, flank: !!flank };
    }
    return null;
  },

  // posture- and counter-weighted training toward the army target, plus navy
  trainForces(m, read) {
    const ai = S.ai, P = this.persona();
    const want = this.armyWant(m, ai.posture);
    const mix = this.counterMix(P.mix, read);
    // drill until the halls refuse (want reached, resources dry, or the day's
    // action budget spent) — a behind chief catches up instead of one-a-day
    for (let drills = 0; drills < 3 && this.trainArmy(m, want, mix); drills++);
    // WALL-BREAKERS: a walled player needs siege to crack, whatever the persona.
    // With a workshop up, keep a catapult (or a trebuchet once L3) on hand so a
    // PUSH doesn't stall poking stone — combat already routes the rest through
    // the gap while the engines batter the wall.
    /* A WORKSHOP THAT NEVER BUILDS AN ENGINE is wasted wood. Engines used to be
       trained only against a wall the chief had already SEEN (foeWall >= 2), so
       a rival could raise a workshop, sit on a full treasury and still march on
       a fortified town with nothing to break it — the exact reason an assault
       stalls at the gate. Once the workshop stands, it keeps a small battery on
       hand: engines are the answer to towers as well as walls. */
    if (read.foeWall >= 2 || (read.foeTower || 0) > 0 || ai.posture === 'PUSH') {
      const ws = S.buildings.find(b => b.owner === 'A' && b.key === 'siege' &&
        Bld.done(b) && !b.upgrading && b.queue.length === 0);
      if (ws) {
        const breakers = Units.count('A', u => u.kind === 'catapult' || u.kind === 'trebuchet');
        // a lone engine only pecks at a fortress — scale the siege TRAIN to how much
        // wall there is to break, and a full PUSH brings one more. So a heavily
        // fortified hall meets three or four engines pounding a segment, not one.
        const towered = (read.foeTower || 0) > 0 ? 1 : 0;
        const wantBreak = Math.min(4, 1 + Math.floor(read.foeWall / 2) + towered + (ai.posture === 'PUSH' ? 1 : 0));
        if (breakers < wantBreak) {
          if (ws.level >= 3 && ai.res.gold >= 70) Bld.train(ws, 'trebuchet');
          else Bld.train(ws, 'catapult');
        }
      }
    }
    // keep a sapper or two if the camp is up — the terraforming crew
    const camp = S.buildings.find(b => b.owner === 'A' && b.key === 'sapper' && Bld.done(b) && !b.upgrading && b.queue.length === 0);
    if (camp) {
      const have = Units.count('A', u => u.kind === 'sapper');
      const want = (this.persona().walls || ai.posture === 'DEFEND') ? 2 : 1;
      if (have < want && this.affordFree(CFG.BUILDINGS.sapper.train.sapper.cost)) Bld.train(camp, 'sapper');
    }
    const dock = S.buildings.find(b => b.owner === 'A' && b.key === 'dock' && Bld.done(b));
    if (dock && !dock.upgrading && dock.queue.length === 0) {
      const boats = Units.count('A', u => u.kind === 'fishboat');
      const ships = Units.count('A', u => u.kind === 'warship' || u.kind === 'fireship');
      const seaLean = ai.opening && ai.opening.bias === 'sea' && ai.opening.fired && S.day < 45 ? 1 : 0;
      if (boats < P.boats + seaLean) Bld.train(dock, 'fishboat');
      else if (dock.level >= 2 && ships < Math.max(1, Math.floor((m.aiArmyCap || 8) / P.shipDiv)) &&
               this.affordFree(CFG.BUILDINGS.dock.train.warship.cost))
        Bld.train(dock, dock.level >= 3 && ai.res.gold >= 45 ? 'fireship' : 'warship');
    }

    // SIEGE-CAMPAIGN units — the engines the ordinary training never builds:
    // siege towers for an escalade, transports (+ a warship screen) for a landing.
    const campStrat = ai.camp && ai.camp.strat;
    if (campStrat === 'HIGHREACH') {
      const ws = S.buildings.find(b => b.owner === 'A' && b.key === 'siege' && Bld.done(b) && !b.upgrading && b.queue.length === 0);
      if (ws && ws.level >= 3 && Units.count('A', u => u.kind === 'siegetower') < 2 &&
          this.affordFree(CFG.BUILDINGS.siege.train.siegetower.cost)) Bld.train(ws, 'siegetower');
    }
    // IRONBELLY grinds a wall down with STONE — a lone catapult only pecks at a
    // fortress, so a committed batter wants a real siege TRAIN (three or four
    // engines pounding one segment). The generic wall-breaker rule above tops out
    // at two; here, while the plan is to batter, keep building engines to four.
    if (campStrat === 'IRONBELLY') {
      const ws = S.buildings.find(b => b.owner === 'A' && b.key === 'siege' && Bld.done(b) && !b.upgrading && b.queue.length === 0);
      if (ws) {
        const breakers = Units.count('A', u => u.kind === 'catapult' || u.kind === 'trebuchet');
        const heavy = ws.level >= 3 && ai.res.gold >= 70;
        const key = heavy ? 'trebuchet' : 'catapult';
        if (breakers < 4 && this.affordFree(CFG.BUILDINGS.siege.train[key].cost)) Bld.train(ws, key);
      }
    }
    /* HULLS FOR A SECOND FRONT. Transports used to be built only while the
       TIDEWRACK campaign held the slot, so a chief with a grown dock whose land
       assault was beached at a moat never built a single one — it had the sea
       right there and no way to use it. A stalled land attack is itself the
       reason to put boats in the water. */
    const beachedNow = ai.stall && S.day - (ai.stall.t || 0) <= 6;
    if ((campStrat === 'TIDEWRACK' || beachedNow) && dock && !dock.upgrading && dock.queue.length === 0) {
      const big = dock.level >= 3;
      const key = big ? 'bigtransport' : 'transport';
      const cap = CFG.UNITS[big ? 'bigtransport' : 'transport'].cap || 3;
      // enough hulls to put a DECISIVE wave ashore in a single crossing rather than
      // trickling three troops at a time into the teeth of the defense: ferry the
      // whole landing force (up to ~10) at once, fleet capped at five hulls.
      const infantry = Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u) && u.kind !== 'siegetower' && !Units.isSiege(u));
      const wantHulls = Math.max(2, Math.min(5, Math.ceil(Math.min(infantry, 10) / cap)));
      const trs = Units.count('A', u => Units.isTransport(u));
      if (trs < wantHulls && this.affordFree(CFG.BUILDINGS.dock.train[key].cost)) Bld.train(dock, key);
    }
  },

  // send an idle nearby soldier to guard a working sapper (they don't fight back)
  _escort(sapper) {
    if (!sapper.task) return;
    const gx = sapper.task.sx, gy = sapper.task.sy;
    const guard = S.units.find(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
      u.kind !== 'siegetower' && !u.tUnit && !u.tBld &&
      !(u.task && (u.task.type === 'raid' || u.task.type === 'attack')) &&
      Math.hypot(u.x - sapper.x, u.y - sapper.y) < 16);
    if (guard) { guard.task = { type: 'move', x: gx, y: gy }; guard.anchor = { x: gx + 0.5, y: gy + 0.5 }; Units.setPath(guard, gx, gy); }
  },

  /* OFFENSIVE breach — walk the line from our hall toward the player's and clear
     the first resource wall (tier 3) or bridge the first water (tier 2) that
     blocks it, opening a shorter/surprise attack lane the army then routes
     through. The sapper is escorted (it can't defend itself). */
  offensiveBreach(idle, read) {
    const atc = Bld.tcOf('A'), ptc = read.knownTC; if (!atc || !ptc) return false;
    const tier = Units.sapperTier('A');
    const dx = ptc.x - atc.x, dy = ptc.y - atc.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    for (let s = 3; s < len - 2; s++) {
      const x = Math.round(atc.x + ux * s), y = Math.round(atc.y + uy * s);
      if (!MapGen.inB(x, y)) continue;
      if (tier >= 3 && Terraform.isClearable(x, y) && Units.assignTerraform(idle, x, y)) { this._escort(idle); return true; }
      if (tier >= 2 && Terraform.bridgeable(x, y) && !Bld.bridgeAt(x, y) && Units.assignTerraform(idle, x, y)) { this._escort(idle); return true; }
      // no plank crossing here? a Lv-3 corps can reclaim a short land-bridge across
      // the near-shore shallows instead (costs stone/wood — only if it can pay)
      if (tier >= 3 && Terraform.isMoundable(x, y, 'A') &&
          (S.map.terrain[MapGen.idx(x, y)] === T.WATER || S.map.terrain[MapGen.idx(x, y)] === T.MOAT) &&
          Bld.canAfford(CFG.TERRAFORM.moundCost, S.ai.res) &&
          Units.assignTerraform(idle, x, y, 'mound')) { this._escort(idle); return true; }
    }
    return false;
  },

  /* A raid party bogged down short of its objective (combat.js records ai.stall
     whenever a party can't reach its aim — a river, a lake, or a belt of forest/
     rock/orchard severs the approach). Rush an idle sapper to BREACH the obstacle
     right where the assault stalled, spanning outward from the stall point toward
     the objective: clear-cut the woods, bridge the water, or reclaim a land-bridge
     across the shallows — whichever blocks the lane first. This is what turns
     "soldiers chilling at the tree line" into "sappers open a gap, army pours in".
     Records ai.stallClearT when the blocker is a resource wall it can't yet cut
     (tier < 3) so the chief invests in a higher-tier engineering corps. */
  breachStall(read) {
    const ai = S.ai, st = ai.stall;
    if (!st || S.day - (st.t || 0) > 3) return false;      // no fresh stall on record
    const tier = Units.sapperTier('A');
    if (tier < 1) return false;                            // no engineering corps at all
    const aim = read.knownTC || Bld.tcOf('P') || st;
    const dx = aim.x - st.x, dy = aim.y - st.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // first, learn what's actually blocking the lane so the chief can react even
    // when it can't breach yet (needs a higher-tier corps). Persist the signal on
    // `ai` (not ai.stall, which combat rebuilds each frame) so bestBuild sees it.
    const idle = S.units.find(u => u.owner === 'A' && u.kind === 'sapper' && (!u.task || u.task.type === 'move'));
    for (let s = 0; s <= 8; s++) {
      const x = Math.round(st.x + ux * s), y = Math.round(st.y + uy * s);
      if (!MapGen.inB(x, y)) continue;
      const terr = S.map.terrain[MapGen.idx(x, y)];
      const clearable = Terraform.isClearable(x, y);
      const water = terr === T.WATER || terr === T.MOAT;
      if (clearable && tier < 3) ai.stallClearT = S.day;              // woods we can't cut yet
      // WATER WE CAN'T SPAN YET. Bridging needs a tier-2 corps; with only a
      // level-1 camp the chief would sit a siege train on the bank for the rest
      // of the game (a real game: ten engines parked across a moat, day 164).
      // Record it so the works get the upgrade that unblocks the assault.
      if (water && tier < 2 && Terraform.bridgeable(x, y) && !Bld.bridgeAt(x, y)) ai.stallBridgeT = S.day;
      if (!idle) continue;                                            // note the blocker, but no sapper to send
      // clear-cut a resource wall (forest / rock / orchard) that blocks the lane
      if (tier >= 3 && clearable && Units.assignTerraform(idle, x, y, 'clear')) { this._escort(idle); return true; }
      // bridge the open water / moat
      if (tier >= 2 && water && Terraform.bridgeable(x, y) && !Bld.bridgeAt(x, y) && Units.assignTerraform(idle, x, y, 'bridge')) { this._escort(idle); return true; }
      // reclaim a short land-bridge across near-shore shallows (costs stone/wood)
      if (tier >= 3 && water && Terraform.isMoundable(x, y, 'A') &&
          Bld.canAfford(CFG.TERRAFORM.moundCost, ai.res) && Units.assignTerraform(idle, x, y, 'mound')) { this._escort(idle); return true; }
    }
    return false;
  },

  /* SAPPER employment — the rival terraforms too. DEFENSIVELY a threatened or
     turtling chief moats its perimeter seams (layering with towers/walls);
     OFFENSIVELY a pusher breaches a resource wall or bridges water to open a lane
     to the player. Its sappers are escorted and the reachability clamp keeps it
     from sealing itself in. Scaled by the creativity dial (Hard terraforms
     cleverly, Calm sparingly). */
  terraform(read) {
    if (!window.Terraform) return;
    const ai = S.ai, tc = Bld.tcOf('A'); if (!tc) return;
    if (Units.sapperTier('A') < 1) return;
    const idle = S.units.find(u => u.owner === 'A' && u.kind === 'sapper' && (!u.task || u.task.type === 'move'));
    if (!idle) return;
    const P = this.persona();
    // OFFENSIVE first when pushing and we've found the player — open a lane in
    if ((ai.posture === 'PUSH' || ai.posture === 'PRESSURE') && read.knownTC &&
        Units.sapperTier('A') >= 2 && G.rand() < 0.55 * this.creativity() &&
        this.offensiveBreach(idle, read)) return;
    const defensive = ai.posture === 'DEFEND' || P.walls || read.underThreat || read.homeExposed > 3;
    if (!defensive) return;
    // Calm chiefs terraform sparingly; craft rises with creativity/difficulty
    if (G.rand() > 0.35 + 0.6 * this.creativity()) return;
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, ptc = this.knownPlayerTC();
    // A Lv-3 corps also raises earth berms on the threatened flank: passable but
    // 4x slower to cross, so an assault crawls through the wall/tower killzone.
    // Quarry-heavy, so only when the treasury can bear it.
    if (Units.sapperTier('A') >= 3 && ptc && Bld.canAfford(CFG.TERRAFORM.moundCost, ai.res) &&
        G.rand() < 0.4 * this.creativity()) {
      const mc = [];
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const d = Math.hypot(dx, dy); if (d < 2.5 || d > 6) continue;
        const x = cx + dx, y = cy + dy;
        if (!Terraform.isMoundable(x, y, 'A')) continue;
        const terr = S.map.terrain[MapGen.idx(x, y)];
        if (terr === T.WATER || terr === T.MOAT) continue;              // berms on land, not reclamation here
        if ((dx * (ptc.x - cx) + dy * (ptc.y - cy)) <= 0) continue;     // the player-facing side only
        mc.push({ x, y, s: (6 - Math.abs(d - 4) * 0.3) + G.rand() * 0.5 });
      }
      mc.sort((a, b) => b.s - a.s);
      for (let k = 0; k < Math.min(4, mc.length); k++)
        if (Units.assignTerraform(idle, mc[k].x, mc[k].y, 'mound')) { this._escort(idle); return; }
    }
    const dryOK = P.walls || ai.posture === 'DEFEND';   // only turtles bother with dry trenches
    // scan a defensive BAND around town for the best dig — a water-adjacent tile
    // (floods to a moat) beats a dry trench, the player-facing side beats the
    // rear, and the clamp keeps us from sealing ourselves in. Walls sit ON the
    // seams, so the moat layer forms just outside them.
    const cand = [];
    const bldAdj = (x, y) => { for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const bb = Bld.at(x + ox, y + oy); if (bb && bb.owner === 'A') return true; } return false; };
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dy); if (d < 2.5 || d > 6) continue;
      const x = cx + dx, y = cy + dy;
      if (!Terraform.isDiggable(x, y)) continue;
      // NEVER dig among the huts — a moat/trench that touches a building threads a
      // waterway straight through the town (houses stranded, ugly, impassable). The
      // moat layer belongs on the OUTER perimeter, clear of the built-up ground.
      if (bldAdj(x, y)) continue;
      const water = Terraform.waterAdj(x, y);
      if (!water && !dryOK) continue;
      if (Terraform.digWouldSeal(x, y)) continue;
      let s = (water ? 6 : 1) - Math.abs(d - 4) * 0.3;
      if (ptc && (dx * (ptc.x - cx) + dy * (ptc.y - cy)) > 0) s += 2;   // moat the threatened flank
      s += G.rand() * 0.5;
      cand.push({ x, y, s });
    }
    cand.sort((a, b) => b.s - a.s);
    for (let k = 0; k < Math.min(6, cand.length); k++)
      if (Units.assignTerraform(idle, cand[k].x, cand[k].y)) { this._escort(idle); return; }
  },

  // debug overlay (window.DEBUG_AI = true): a compact dump of the world read,
  // so QA can see what the chief perceives before any behavior depends on it
  _drawRead() {
    let el = document.getElementById('aiDebug');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'aiDebug';
      el.style.cssText = 'position:fixed;left:6px;top:calc(env(safe-area-inset-top) + 92px);z-index:40;' +
        'margin:0;padding:6px 8px;background:rgba(10,8,5,0.82);color:#8fe08f;font:10px/1.35 monospace;' +
        'border:1px solid #3a3324;border-radius:6px;pointer-events:none;white-space:pre;max-width:60vw;';
      document.body.appendChild(el);
    }
    const r = S.ai.read, P = this.persona(), mem = S.ai.memory || {};
    el.textContent = [
      `RIVAL ${P.name}${S.ai.posture ? ' · ' + S.ai.posture : ''}  day ${r.day}`,
      `power  me ${r.myPower} vs ${r.foePower}  ratio ${r.powerRatio.toFixed(2)}  trend ${r.foeTrend > 0 ? '↑' : r.foeTrend < 0 ? '↓' : '–'}`,
      `foe army  home ${r.foeHome} away ${r.foeAway}  ${r.foeVuln ? 'VULN!' : ''}`,
      `foe comp  cav ${r.foeCav} arch ${r.foeArch} melee ${r.foeMelee} siege ${r.foeSiege}` +
        `${r.foeCavHeavy ? ' [CAV]' : ''}${r.foeArchHeavy ? ' [ARCH]' : ''}`,
      `foe def  walls ${r.foeWall} towers ${r.foeTower}  weakFlank def ${r.weakFlank ? r.weakFlank.def : '-'}`,
      `soft targets ${r.softCount}`,
      `econ  me ${r.myEcon | 0} vs ${r.foeEcon | 0}  edge ${r.econEdge | 0}  tempo ${r.aheadTempo}`,
      `home threat ${r.threat}${r.underThreat ? ' UNDER ATTACK' : ''}  building ${r.underCon}`,
      `creativity ${this.creativity().toFixed(2)}  gaps ${r.homeGapCount}(w${r.homeGapWidest})` +
        `${mem && mem.hitFlank ? '  hitFlank ' + mem.hitFlank.x + ',' + mem.hitFlank.y : ''}` +
        `${mem && mem.foeMassed ? '  foeMassed ' + mem.foeMassed : ''}`,
    ].join('\n');
  },

  /* ============================================================================
     SIEGE CAMPAIGN — five named ways to crack a town the army can't just walk into.
     When the chief knows where the player is but its raids can't get in (walled in,
     or cut off by a lake / a belt of woods), it stops flinging bodies at the same
     stone. It PROBES the defenses, PICKS one of five strategies (at random, among
     the ones the ground and its tech actually allow), BUILDS the force that plan
     needs, commits a round or two — and if it fails, ROTATES to a different plan it
     hasn't tried yet. So the assault is intelligent AND never a memorisable script.

       IRONBELLY — a siege train: catapults/trebuchets batter a wall segment open.
       MUDLARK   — engineers bridge the water / clear-cut a NEW land lane in.
       TIDEWRACK — an amphibious landing: transports ferry troops, warships screen.
       HIGHREACH — siege towers roll to the wall and pour infantry over the top.
       WARHORN   — a massed combined-arms rush at the single least-defended seam.
     ========================================================================== */
  CAMPAIGNS: ['IRONBELLY', 'MUDLARK', 'TIDEWRACK', 'HIGHREACH', 'WARHORN'],
  CAMPAIGN_CRY: {
    IRONBELLY: '⚔ The rival wheels up a siege train — stone will answer your walls!',
    MUDLARK:   '⚔ Rival engineers move out to carve a new road to your gates!',
    TIDEWRACK: '⛵ Sails on the water — the rival is mounting a landing on your shore!',
    HIGHREACH: '⚔ Siege towers roll forward — the rival means to come over your walls!',
    WARHORN:   '📯 A warhorn sounds — the rival hurls its whole host at your weakest gate!',
  },

  // owner-aware land reachability from the rival hall (passes ITS OWN gates, unlike
  // the generic Path.reachFrom). The frontier of this mask is where a breach connects.
  aiLandReach() {
    const atc = Bld.tcOf('A'); if (!atc) return null;
    const W = CFG.W, H = CFG.H, mask = new Uint8Array(W * H), q = [];
    const seed = (x, y) => { if (MapGen.inB(x, y) && Path.passable(x, y, 'A')) { const i = MapGen.idx(x, y); if (!mask[i]) { mask[i] = 1; q.push(i); } } };
    const s = Bld.size('tc');
    for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) seed(atc.x + dx, atc.y + dy);
    let h = 0;
    while (h < q.length) { const c = q[h++], cx = c % W, cy = (c / W) | 0; seed(cx + 1, cy); seed(cx - 1, cy); seed(cx, cy + 1); seed(cx, cy - 1); }
    return mask;
  },
  // does our land touch the player's hall? (a plain raid can walk in — no campaign needed)
  _reachesTown(reach, ptc) {
    if (!reach || !ptc) return false;
    const s = Bld.size('tc');
    for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) { const x = ptc.x + dx, y = ptc.y + dy; if (MapGen.inB(x, y) && reach[MapGen.idx(x, y)]) return true; }
    return false;
  },

  // study the player's town + the ground to it, so a strategy is chosen on evidence
  probeAssault(read, reach) {
    const atc = Bld.tcOf('A'), ptc = read.knownTC || this.knownPlayerTC();
    if (!atc || !ptc) return null;
    reach = reach || this.aiLandReach();
    const W = CFG.W, H = CFG.H, idx = MapGen.idx, tier = Units.sapperTier('A');
    const rc = (x, y) => MapGen.inB(x, y) && reach[idx(x, y)];
    const adjReach = (x, y) => rc(x + 1, y) || rc(x - 1, y) || rc(x, y + 1) || rc(x, y - 1);
    const ctx = { ptc, tier, landToTown: false, meleeWall: null, siegeWall: null, breach: null, shore: null, wallSeam: null, lane: null };
    // only what we've SEEN of their town (fog binds the chief) — this is exactly the
    // recon its scouts/soldiers/villagers have gathered, and it's what the strategy
    // score below reads, so probing a flank literally changes which plan gets picked
    const kb = S.ai.knownB || {}, blds = [], forts = [], towersK = [];
    for (const k in kb) { const b = kb[k]; if (b.owner !== 'P') continue; blds.push(b); if (b.key === 'wall' || b.key === 'gate') forts.push(b); else if (b.key === 'tower') towersK.push(b); }
    const targets = blds.length ? blds : [{ x: ptc.x, y: ptc.y, key: 'tc' }];
    // can our land walk up to (melee/batter) any known structure?
    let bestMelee = null, bmd = 1e9;
    for (const b of targets) {
      const bx = b.x + 0.5, by = b.y + 0.5;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = b.x + dx, y = b.y + dy;
        if (rc(x, y)) { const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by); if (d <= 1.6 && d < bmd) { bmd = d; bestMelee = b; } }
      }
    }
    ctx.landToTown = !!bestMelee;
    ctx.meleeWall = bestMelee && (bestMelee.key === 'wall' || bestMelee.key === 'gate') ? bestMelee : null;
    // can our land stand within siege reach (~8) of a known wall to bombard it?
    let bestSiege = null, bsd = 1e9;
    for (const b of (forts.length ? forts : targets)) {
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        const x = b.x + dx, y = b.y + dy; if (!rc(x, y)) continue;
        const d = Math.hypot(dx, dy); if (d <= 8 && d < bsd) { bsd = d; bestSiege = b; }
      }
    }
    ctx.siegeWall = bestSiege;
    // MUDLARK: the breachable frontier tile (adjacent to our land) nearest the player
    if (tier >= 2) {
      let best = null, bs = 1e9;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = idx(x, y); if (reach[i] || Bld.at(x, y) || !adjReach(x, y)) continue;
        const t = S.map.terrain[i], water = (t === T.WATER || t === T.MOAT);
        const breachable = (water && Terraform.bridgeable(x, y) && !Bld.bridgeAt(x, y)) ||
          (tier >= 3 && Terraform.isClearable(x, y)) || (tier >= 3 && water && Terraform.isMoundable(x, y, 'A'));
        if (!breachable) continue;
        const d = Math.hypot(x - ptc.x, y - ptc.y); if (d < bs) { bs = d; best = { x, y, water }; }
      }
      ctx.breach = best;
    }
    const lanes = this.playerLanes();
    ctx.lane = lanes[0] || null;
    ctx.wallSeam = read.weakFlank || (ctx.lane ? ctx.lane.mid : null);
    ctx.shore = this._assaultShore(reach, ptc);

    /* ---- DISCRIMINATING SIGNALS — turn the recon into evidence each strategy is
       scored on, so the plan fits the weakness the chief actually observed:
         · an undefended far shore  → a landing (Tidewrack)
         · a THIN treeline/water gap → one sapper cut opens it (Mudlark)
         · a long, poorly-towered wall → climb over it (Highreach)
         · an open, lightly-held seam → just storm it (Warhorn) ---- */
    const towersNear = (x, y, r) => { let n = 0; for (const t of towersK) if (Math.hypot(t.x + 0.5 - x, t.y + 0.5 - y) <= r) n++; return n; };
    ctx.towers = towersK.length;
    // TIDEWRACK: how exposed is the beach we'd land on? (towers shred a beachhead)
    ctx.shoreTowers = ctx.shore ? towersNear(ctx.shore.land.x + 0.5, ctx.shore.land.y + 0.5, 6) : 0;
    // MUDLARK: how THICK is the barrier at the breach? march from it toward the player
    // and count the impassable tiles — 1 means a single cut pours the army through.
    if (ctx.breach) {
      const dx = ptc.x - ctx.breach.x, dy = ptc.y - ctx.breach.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      let n = 0;
      for (let s = 0; s < 14; s++) { const x = Math.round(ctx.breach.x + ux * s), y = Math.round(ctx.breach.y + uy * s); if (!MapGen.inB(x, y)) break; if (Path.passable(x, y, 'A')) { if (s >= 1) break; else continue; } n++; }
      ctx.breachThick = Math.max(1, n);
    }
    // HIGHREACH / IRONBELLY: how much wall can our land actually reach, and how well
    // is the target segment towered? (a long wall the towers don't cover = climb it)
    let wallLen = 0;
    for (const f of forts) { for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rc(f.x + ox, f.y + oy)) { wallLen++; break; } }
    ctx.wallReachLen = wallLen;
    const twTarget = ctx.meleeWall || ctx.siegeWall;
    ctx.wallTowers = twTarget ? towersNear(twTarget.x + 0.5, twTarget.y + 0.5, 6) : 0;
    // WARHORN: the least-defended OPEN seam (a real gap in the ring), if reachable
    ctx.openSeam = (ctx.lane && ctx.landToTown) ? { width: ctx.lane.width, def: ctx.lane.def } : null;
    // a building embedded in their ring is a door, not a wall — storming beats siege
    ctx.softDoor = (ctx.lane && ctx.lane.door) || 0;
    return ctx;
  },

  /* Evidence-based FIT of each strategy to the defenses the chief has scouted — a
     higher score means "this is the smart way in HERE". This is what makes a large
     undefended lake mean a landing, a one-tile treeline mean a sapper cut, and a
     long open wall mean siege towers — instead of a blind dice roll. */
  _campScore(k, ctx) {
    switch (k) {
      case 'MUDLARK': {   // thinner barrier = more decisive; cutting woods is cleaner than a long bridge
        if (!ctx.breach) return 0;
        let s = 13 - (ctx.breachThick || 4) * 3;
        if (!ctx.breach.water) s += 2;
        return Math.max(1, s);
      }
      case 'TIDEWRACK': { // a landing shines against an undefended shore, dies against towers
        if (!ctx.shore) return 0;
        return Math.max(0.5, 9 - (ctx.shoreTowers || 0) * 3);
      }
      case 'HIGHREACH': { // long wall, few towers → pour over the top where nothing shoots
        if (!ctx.meleeWall) return 0;
        return Math.max(0.5, 4 + Math.min(8, ctx.wallReachLen || 1) - (ctx.wallTowers || 0) * 2.5);
      }
      case 'IRONBELLY': { // battering answers ANY wall (engines outrange towers), so it's steady
        if (!ctx.siegeWall) return 0;
        return Math.max(0.5, 6 + Math.min(3, (ctx.wallReachLen || 1) * 0.5) - (ctx.wallTowers || 0) * 0.6);
      }
      case 'WARHORN': {   // a straight rush wants an OPEN, lightly held gap — worst vs a walled town
        if (!ctx.landToTown) return 0;
        // …or a SOFT DOOR: a hut left standing in their wall line is a gap that
        // merely looks shut. Storm it — no engines, no ladders, just go through.
        const door = Math.min(2, ctx.softDoor || 0) * 3;
        const seam = ctx.openSeam;
        if (!seam) return Math.max(0.5, 1.5 + door);
        return Math.max(0.5, 3 + Math.min(5, seam.width) - (seam.def || 0) * 1.5 + door);
      }
    }
    return 0;
  },

  // a sea lane for a landing: navigable water joining OUR coast to the player's.
  // Returns { embark (our shore tile), land (their shore tile) } or null.
  _assaultShore(reach, ptc) {
    const W = CFG.W, H = CFG.H, idx = MapGen.idx;
    const water = (x, y) => MapGen.inB(x, y) && S.map.terrain[idx(x, y)] === T.WATER;
    const rc = (x, y) => MapGen.inB(x, y) && reach[idx(x, y)];
    const seeds = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++)
      if (water(x, y) && (rc(x + 1, y) || rc(x - 1, y) || rc(x, y + 1) || rc(x, y - 1))) seeds.push({ x, y });
    if (!seeds.length) return null;
    const wr = new Uint8Array(W * H), q = [];
    for (const s of seeds) { const i = idx(s.x, s.y); if (!wr[i]) { wr[i] = 1; q.push(i); } }
    let h = 0;
    while (h < q.length) { const c = q[h++], cx = c % W, cy = (c / W) | 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + ox, ny = cy + oy; if (water(nx, ny) && !wr[idx(nx, ny)]) { wr[idx(nx, ny)] = 1; q.push(idx(nx, ny)); } } }
    let land = null, best = 1e9;
    for (let i = 0; i < wr.length; i++) {
      if (!wr[i]) continue; const x = i % W, y = (i / W) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const lx = x + ox, ly = y + oy;
        if (!MapGen.inB(lx, ly) || !Path.passable(lx, ly) || rc(lx, ly)) continue;   // the FAR (player) shore
        const d = Math.hypot(lx - ptc.x, ly - ptc.y);
        if (d < best && d < 20) { best = d; land = { x: lx, y: ly }; }
      }
    }
    if (!land) return null;
    let embark = null;
    for (const s of seeds) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const lx = s.x + ox, ly = s.y + oy; if (rc(lx, ly)) { embark = { x: lx, y: ly }; break; } }
    return { land, embark };
  },

  _campViable(k, ctx, tc) {
    switch (k) {
      case 'IRONBELLY': return !!ctx.siegeWall && (tc.level >= 3 || Units.count('A', u => Units.isSiege(u) && u.kind !== 'siegetower'));
      case 'HIGHREACH': return !!ctx.meleeWall && (tc.level >= 3 || Units.count('A', u => u.kind === 'siegetower'));
      case 'WARHORN':   return ctx.landToTown;
      case 'MUDLARK':   return !!ctx.breach && (tc.level >= 2 || Units.sapperTier('A') >= 1);
      case 'TIDEWRACK': return !!ctx.shore && (tc.level >= 2 || S.buildings.some(b => b.owner === 'A' && b.key === 'dock'));
    }
    return false;
  },

  // a score at/above this means a GENUINE soft spot the chief should exploit; below
  // it, no angle is really open, so it stops shopping and commits to the grind.
  CAMP_OPENING: 7,

  /* THE SCORECARD — punch, block, punch differently. The chief remembers how
     each named plan actually FARED against this particular player: a plan that
     drew blood is worth returning to, a plan that spent two rounds achieving
     nothing sinks down the list. Crucially the memory FADES (~60 days), because
     the board keeps changing — a landing that was hopeless before the dock was
     grown, or a bridge that was impossible at a tier-1 corps, deserves another
     look later. So nothing is ever permanently written off, and nothing is
     repeated forever either. */
  _noteStrat(k, won) {
    const mem = S.ai.memory || (S.ai.memory = {});
    const sl = mem.strat || (mem.strat = {});
    const e = sl[k] || (sl[k] = { tries: 0, prog: 0, dry: 0, last: 0 });
    e.tries++; e.last = S.day;
    if (won) { e.prog++; e.dry = Math.max(0, e.dry - 1); } else e.dry++;
  },
  _campLearn(k) {
    const sl = (S.ai.memory && S.ai.memory.strat) || {};
    const e = sl[k]; if (!e) return 0;
    const fade = Math.max(0, 1 - (S.day - (e.last || 0)) / 60);
    return (e.prog * 2.5 - e.dry * 3) * fade;
  },
  // fit to the ground the chief has scouted, PLUS what it has learned trying
  _campFit(k, ctx) { return this._campScore(k, ctx) + this._campLearn(k); },
  // total HP of the player's walls/gates/towers — the grind's progress yardstick, so
  // a siege line steadily chipping stone isn't misjudged as "failing" for not yet
  // razing a whole building.
  _foeFortHp() {
    let hp = 0;
    for (const b of S.buildings) if (b.owner === 'P' && (b.key === 'wall' || b.key === 'gate' || b.key === 'tower')) hp += b.hp || 0;
    return hp;
  },
  // the reliable GRIND when no soft spot exists: batter a reachable wall (siege
  // outranges towers, so it breaks any ring given time); if no wall is even
  // reachable, OPEN a lane first — bridge (Mudlark), then a landing (Tidewrack) —
  // which then makes a wall reachable and Ironbelly takes over. `tried` demotes a
  // fallback that couldn't assemble its force, cycling back to Ironbelly when spent.
  _grindFallback(ctx, tc, best, tried) {
    const order = ['IRONBELLY', 'MUDLARK', 'TIDEWRACK'];
    return order.find(k => this._campViable(k, ctx, tc) && tried.indexOf(k) < 0)
        || order.find(k => this._campViable(k, ctx, tc))
        || best;
  },

  // choose (or hold) a siege-campaign strategy when a plain raid can't get in
  campaignSelect(read) {
    const ai = S.ai, ptc = read.knownTC;
    const attack = ai.posture === 'PUSH' || ai.posture === 'PRESSURE';
    ai.camp = ai.camp || { strat: null, since: 0, rounds: 0, tried: [], baseBld: 0, grind: false };
    if (!ptc || !attack) { ai.camp.strat = null; ai.camp.grind = false; return; }
    /* A LIVE PLAN THAT IS PHYSICALLY BEACHED gets re-opened. An opportunistic
       plan is normally left alone to run its round — but a host bogged on the
       far bank of a moat isn't "in progress", it's stuck, and the answers
       (bridge it, or sail around it) can never be chosen while the old plan
       holds the slot. A real game ended with ten engines parked across a moat
       for a hundred days because WARHORN kept renewing itself. Only land plans
       can be beached this way, and only after the plan has had time to work. */
    const beached = ai.stall && S.day - (ai.stall.t || 0) <= 2 &&
      S.day - (ai.camp.since || 0) >= 8 &&
      ai.camp.strat !== 'MUDLARK' && ai.camp.strat !== 'TIDEWRACK';
    if (ai.camp.strat && !ai.camp.grind && !beached) return;
    if (beached) {
      if (ai.camp.tried.indexOf(ai.camp.strat) < 0) ai.camp.tried.push(ai.camp.strat);
      ai.camp.strat = null;
    }
    const reach = this.aiLandReach();
    const routeToTown = this._reachesTown(reach, ptc);
    const wallStalled = !!(ai.memory && ai.memory.wallStop);
    if (routeToTown && !wallStalled) { ai.camp.tried = []; ai.camp.strat = null; ai.camp.grind = false; return; }
    const tc = Bld.tcOf('A'); if (!tc) return;
    const ctx = this.probeAssault(read, reach); if (!ctx) return;
    let pool = this.CAMPAIGNS.filter(k => this._campViable(k, ctx, tc) && ai.camp.tried.indexOf(k) < 0);
    if (!pool.length) { ai.camp.tried = []; pool = this.CAMPAIGNS.filter(k => this._campViable(k, ctx, tc)); }
    if (!pool.length) return;                           // nothing the ground allows — fall back to raids
    // EVIDENCE-DRIVEN CHOICE: score every viable plan by fit to the scouted defenses;
    // a light jitter only separates near-ties, so a clearly softer angle always wins.
    let strat = null, best = -1e9;
    for (const k of pool) { const s = this._campFit(k, ctx) + G.rand() * 1.2; if (s > best) { best = s; strat = k; } }
    if (!strat) return;
    // GRIND re-evaluation. While the plan we're grinding can STILL hit its target,
    // we keep battering and only break off for a GENUINE new opening (a different
    // plan that now clears the threshold) — that's what stops it thrashing.
    if (ai.camp.strat && ai.camp.grind) {
      if (this._campViable(ai.camp.strat, ctx, tc)) {
        if (best >= this.CAMP_OPENING && strat !== ai.camp.strat) {
          ai.camp.strat = strat; ai.camp.grind = false; ai.camp.since = S.day; ai.camp.rounds = 0; ai.camp.baseBld = Bld.list('P').length;
          G.log(this.CAMPAIGN_CRY[strat], true);
        }
        return;
      }
      // …but the grind's own plan has EVAPORATED — the wall it battered is razed, or
      // the player just moated / forted us off so no wall is reachable to batter at
      // all. Battering nothing is the "chief just sits there" bug: adapt now, and
      // reconsider EVERY plan (even ones we'd shelved) so the best lane we can still
      // force — a sapper cut through the treeline, a bridge, or a landing — is back
      // on the table instead of an impossible siege we can never mount.
      ai.camp.tried = [];
      pool = this.CAMPAIGNS.filter(k => this._campViable(k, ctx, tc));
      if (!pool.length) { ai.camp.strat = null; ai.camp.grind = false; return; }   // truly no way by land or sea → back to raids
      best = -1e9; strat = null;
      for (const k of pool) { const s = this._campFit(k, ctx) + G.rand() * 1.2; if (s > best) { best = s; strat = k; } }
      // fall through to the commit below, which re-picks grind-vs-exploit for the new plan
    }
    // FRESH choice: a real opening → exploit it (rotate on failure); no soft spot
    // anywhere → COMMIT to the reliable grind and stop shopping (never thrash).
    if (best >= this.CAMP_OPENING) { ai.camp.grind = false; }
    else { strat = this._grindFallback(ctx, tc, strat, ai.camp.tried); ai.camp.grind = true; }
    ai.camp.strat = strat; ai.camp.since = S.day; ai.camp.rounds = 0; ai.camp.baseBld = Bld.list('P').length;
    G.log(this.CAMPAIGN_CRY[strat], true);
  },

  // does the chosen campaign have the force it needs to launch its assault yet?
  campaignReady(strat) {
    const cnt = k => Units.count('A', u => u.kind === k);
    const infantry = Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u) && u.kind !== 'siegetower' && !Units.isSiege(u));
    switch (strat) {
      case 'IRONBELLY': return (cnt('catapult') + cnt('trebuchet')) >= 1 && infantry >= 3;
      case 'HIGHREACH': return cnt('siegetower') >= 1 && infantry >= 4;
      case 'TIDEWRACK': {
        // hold until enough hull capacity AND a real landing party have gathered, so
        // the crossing puts a decisive wave on the beach instead of a doomed trickle.
        let cap = 0; for (const u of S.units) if (u.owner === 'A' && Units.isTransport(u)) cap += Units.cargoCap(u);
        return cap >= 5 && infantry >= 5;
      }
      case 'MUDLARK':   return Units.sapperTier('A') >= 2;
      case 'WARHORN':   return infantry >= 6;
    }
    return false;
  },

  // EXECUTE the committed campaign when the raid window opens. Returns true when the
  // campaign "owns" the attack this turn — launched, or deliberately HOLDING while it
  // tools up — so the ordinary raid block stands down and the chief commits to its plan.
  campaignLaunch(read, m) {
    const ai = S.ai, camp = ai.camp;
    if (!camp || !camp.strat) return false;
    const strat = camp.strat, ptc = read.knownTC;
    if (!ptc) return false;
    // a held main column commits the moment its feint has had time to work
    if (camp.pending && S.day >= camp.pending.due) { this._commitMain(read); return true; }
    if (camp.pending) return true;                      // still letting the feint pull
    // MUDLARK earns its keep by CARVING LAND, not razing buildings — so credit its
    // progress before any give-up test: while the reachable lane is still growing
    // toward the town, reset the abandon clock so a long belt of woods actually gets
    // cut through instead of the dig being called a failure at a blind 30-day mark.
    if (strat === 'MUDLARK') {
      const rc = this._reachCount(this.aiLandReach());
      if (camp.mudReach == null) camp.mudReach = rc;
      else if (rc > camp.mudReach) { camp.mudReach = rc; camp.since = S.day; }
    }
    // EVALUATE a finished round (its deadline has passed). PROGRESS = razed a
    // building OR knocked ≥10% off the player's walls/towers (so a siege line that's
    // steadily chewing stone counts as working). An OPPORTUNISTIC plan that made
    // progress stands down (the way's proven); two dry rounds → rotate to the
    // next-best fit. A GRIND never rotates — it keeps battering (campaignSelect's
    // escape hatch is the only thing that pulls it off, and only for a real opening).
    if (camp.rounds > 0 && S.day >= (camp.roundEnd || 0)) {
      const razed = Bld.list('P').length < (camp.roundBaseBld != null ? camp.roundBaseBld : 1e9);
      const chipped = camp.roundBaseHp != null && this._foeFortHp() < camp.roundBaseHp * 0.9;
      const won = razed || chipped;
      this._noteStrat(strat, won);              // remember how this plan fared
      // …and whether the door we chose actually gave way, so the next assault
      // either returns to it or tries a different one (see composeAssault)
      if (S.ai.memory) S.ai.memory.lastMainWorked = won;
      if (won) {
        // the way is proven: an opportunistic plan stands down having made its
        // point; a grind that is genuinely chewing through keeps at it
        if (!camp.grind) { camp.tried = []; camp.strat = null; return false; }
      } else if (camp.rounds >= (camp.grind ? 3 : 2)) {
        /* DRY ROUNDS — ROTATE. A grind used to be exempt from this: no opening
           scored well enough, so the chief committed to battering and battered
           the same stone for the rest of the game however little it achieved.
           That is the fixation. Now every plan answers for its results: three
           dry rounds and even a grind yields the slot, is marked tried, and the
           chief comes back through the door with a different plan. */
        if (camp.tried.indexOf(strat) < 0) camp.tried.push(strat);
        camp.strat = null; camp.grind = false;
        return false;
      }
      // otherwise: fall through and mount another round of the same plan
    }
    // abandon a plan that can never even assemble its force (kept us waiting too
    // long). For a grind this DEMOTES the fallback (Ironbelly→Mudlark→Tidewrack) via
    // `tried`, so a plan it can't build for gives way to one it can.
    if (!camp.rounds && S.day - camp.since > 30) { camp.tried.push(strat); camp.strat = null; return false; }
    const startRound = () => { camp.rounds++; camp.roundBaseBld = Bld.list('P').length; camp.roundBaseHp = this._foeFortHp(); camp.roundEnd = S.day + 12; };
    // MUDLARK — carve the lane a tile a day; when the road finally reaches the town,
    // stand the campaign down so an ordinary raid pours through the new gap.
    if (strat === 'MUDLARK') {
      const reach = this.aiLandReach();
      if (this._reachesTown(reach, ptc)) { camp.tried = []; camp.strat = null; return false; }
      this.breachToPlayer(read, reach);
      return true;
    }
    if (ai.raidCd > 0) return true;
    // TIDEWRACK — put to sea once a hull and a landing party are ready
    if (strat === 'TIDEWRACK') {
      if (!this.campaignReady('TIDEWRACK')) return true;
      if (this._launchAmphib(read)) { startRound(); ai.raidDay = S.day; ai.raidFoeBld = Bld.list('P').length; ai.raidCd = Math.max(6, Math.round(this.persona().raidCd)); }
      return true;
    }
    // land assaults — hold while the engines/host gather, then commit at the weak spot
    if (S.units.some(u => u.owner === 'A' && u.task && u.task.type === 'raid' && !u.harass)) return true;
    if (!this.campaignReady(strat)) return true;
    if (this._launchCampRaid(read, strat)) startRound();
    return true;
  },

  // commit the relevant host (siege for IRONBELLY, towers for HIGHREACH, everyone for
  // WARHORN) at the softest wall segment, via the ordinary raid machinery
  /* ================= COMBINED ARMS =================
     Which way in, and whether to come two ways at once. The named plan says
     HOW to breach; this says WHERE, and whether the host is strong enough to
     spare a feint that drags defenders off the real door.

     A FULL, UNDIVIDED ATTACK IS OFTEN CORRECT and stays the default — a split
     host is a weaker host, and against a small garrison or a single way in,
     concentration wins. A second prong is only bought when it is genuinely
     affordable and there is something to pull. */
  composeAssault(read, partyN) {
    const ai = S.ai, mem = ai.memory || (ai.memory = {});
    const lanes = this.playerLanes();
    if (!lanes.length) return { main: null, feint: null, feintN: 0, why: 'no lane read' };
    // AIM-POINT ROTATION: least-defended first, but don't walk into the same
    // door twice running unless it actually gave way last time.
    let main = lanes[0];
    if (lanes.length > 1 && mem.lastMainLane === main.key && !mem.lastMainWorked) main = lanes[1];
    const others = lanes.filter(l => l.key !== main.key);
    // Is a feint worth its bodies? Needs a real surplus, a second way in, and
    // defenders worth drawing (an undefended town needs no theatre). The
    // scorecard can also tell us feints simply haven't worked on this player.
    const combo = (mem.combo && mem.combo[main.key]) || null;
    const comboSour = combo && combo.tries >= 2 && combo.pulled === 0;
    /* A FEINT ONLY PAYS IF THERE IS A GARRISON TO DRAW. Towers don't march —
       drawing works on SOLDIERS. Against a thinly-held town the theatre costs
       a third of the host and buys nothing, and one undivided punch lands
       sooner; measured, feinting an unmanned wall pushed a won siege out by
       seventy days. So the second prong is bought only when live defenders are
       actually standing where we mean to hit. */
    const garrison = this._defendersNear(main, 11);
    const worthFeint = partyN >= 10 && others.length > 0 && main.def > 0 && garrison >= 3 && !comboSour;
    if (!worthFeint) return { main, feint: null, feintN: 0,
      why: partyN < 10 ? 'host too small to split' : comboSour ? 'feints not working here'
        : garrison < 3 ? 'no garrison to draw — one full attack' : 'nothing to draw' };
    // the feint goes at the LOUDEST door — the best-defended other lane, since
    // that's where the garrison already is and where a threat reads as real
    const feint = others.slice().sort((a, b) => b.def - a.def)[0];
    const feintN = Math.max(2, Math.min(5, Math.round(partyN * 0.28)));
    return { main, feint, feintN, why: 'two prongs' };
  },
  // did the feint actually drag the garrison off the main door?
  _noteCombo(laneKey, pulled) {
    const mem = S.ai.memory || (S.ai.memory = {});
    const c = mem.combo || (mem.combo = {});
    const e = c[laneKey] || (c[laneKey] = { tries: 0, pulled: 0, last: 0 });
    e.tries++; e.last = S.day; if (pulled) e.pulled++;
  },
  _defendersNear(lane, r) {
    if (!lane) return 0;
    let n = 0;
    for (const u of S.units)
      if (u.owner === 'P' && Units.isMilitary(u) && !Units.isNaval(u) &&
          Math.hypot(u.x - lane.mid.x, u.y - lane.mid.y) <= (r || 9)) n++;
    return n;
  },
  // commit the held main prong once the feint has had time to pull the garrison
  _commitMain(read) {
    const ai = S.ai, camp = ai.camp, pend = camp && camp.pending;
    if (!pend) return false;
    const host = pend.ids.map(id => Units.get(id)).filter(u => u && !(u.task && u.task.type === 'raid'));
    camp.pending = null;
    if (!host.length) return false;
    // score the feint: are more of their soldiers at the feint door than ours?
    const pulled = this._defendersNear(pend.feintLane) > this._defendersNear(pend.mainLane);
    if (pend.feintLane) this._noteCombo(pend.mainLane.key, pulled);
    for (const u of host) {
      u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.probe = false; u.feint = false;
      u.raidLane = pend.mainLane.key; u.raidObj = null; u.defend = false;
    }
    ai.raidObj = { type: 'tc', x: pend.x, y: pend.y, lane: pend.mainLane.key };
    ai.raidLane = pend.mainLane.key; ai.raidN = host.length; ai.raidDay = S.day;
    ai.raidFoeBld = Bld.list('P').length;
    if (ai.memory) { ai.memory.wallHit = 0; ai.memory.lastMainLane = pend.mainLane.key; ai.memory.lastMainWorked = false; }
    G.log(pulled ? '⚔ The feint draws them off — the rival’s main column storms the far side!'
                 : '⚔ The rival’s main column commits!', true);
    return true;
  },

  _launchCampRaid(read, strat) {
    const ai = S.ai, ctx = this.probeAssault(read) || {};
    const seam = ctx.wallSeam || (ctx.siegeWall && { x: ctx.siegeWall.x, y: ctx.siegeWall.y }) || read.knownTC;
    const withTowers = strat === 'HIGHREACH';
    const party = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
      (withTowers || u.kind !== 'siegetower') && !(u.task && u.task.type === 'raid'));
    if (party.length < 3) return false;
    const plan = this.composeAssault(read, party.length);
    ai.raidCd = Math.max(4, Math.round(this.persona().raidCd));
    ai.raidFoeBld = Bld.list('P').length;
    if (ai.memory) ai.memory.wallHit = 0;

    /* TWO PRONGS: the feint marches now at the loudest door; the main column is
       held two days so the garrison has time to commit to the wrong side, then
       drives home somewhere else (see _commitMain). Engines never feint — they
       belong with the real attack. */
    if (plan.feint && plan.main) {
      const light = party.filter(u => !Units.isSiege(u) && u.kind !== 'siegetower' && u.kind !== 'ballista');
      const feintParty = light.slice(0, plan.feintN);
      if (feintParty.length >= 2) {
        const rest = party.filter(u => feintParty.indexOf(u) < 0);
        for (const u of feintParty) {
          u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.defend = false;
          u.probe = true; u.feint = true; u.raidLane = plan.feint.key;
          u.raidObj = { type: 'tc', x: plan.feint.mid.x, y: plan.feint.mid.y };
        }
        ai.camp.pending = { strat, ids: rest.map(u => u.id), due: S.day + 2,
          mainLane: plan.main, feintLane: plan.feint, x: plan.main.mid.x, y: plan.main.mid.y };
        ai.raidObj = { type: 'tc', x: plan.feint.mid.x, y: plan.feint.mid.y, lane: plan.feint.key };
        ai.raidLane = plan.feint.key; ai.raidN = feintParty.length; ai.raidDay = S.day;
        G.log('⚔ ' + this.CAMPAIGN_CRY[strat] + ' — riders feint at the near gate!', true);
        return true;
      }
    }
    // ONE FULL ATTACK — the whole host through the chosen door. The right call
    // whenever the garrison is thin, there's only one way in, or splitting
    // would leave neither prong strong enough to matter.
    const lane = plan.main;
    const aim = lane ? lane.mid : seam;
    const laneKey = (lane && lane.key) || (ctx.lane && ctx.lane.key) || strat;
    for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.probe = false; u.feint = false; u.raidLane = laneKey; u.raidObj = null; u.defend = false; }
    ai.raidObj = { type: 'tc', x: aim.x, y: aim.y, lane: laneKey };
    ai.raidLane = laneKey; ai.raidN = party.length; ai.raidDay = S.day;
    if (ai.memory) { ai.memory.lastMainLane = laneKey; ai.memory.lastMainWorked = false; }
    G.log(this.CAMPAIGN_CRY[strat], true);
    return true;
  },

  // count of reachable land tiles — MUDLARK's progress yardstick (a growing figure
  // means the lane is being carved), and a cheap connectivity probe elsewhere.
  _reachCount(mask) { if (!mask) return 0; let n = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) n++; return n; },

  // MUDLARK's spade: carve a CONNECTED lane through the barrier toward the player.
  // The old version nibbled a single frontier tile a day and, re-probing next dawn,
  // often drifted to a different tile — so a belt of woods more than one tile deep
  // never actually opened. Now it marches the thin barrier from the frontier tile
  // straight at the town and QUEUES the whole connected run of breachable tiles, so
  // the sapper cuts one lane end-to-end (clear woods / bridge water / mound shallows)
  // and the reachable land genuinely grows through to the far side.
  breachToPlayer(read, reach) {
    const ai = S.ai;
    if (Units.sapperTier('A') < 2) return false;
    const idle = S.units.find(u => u.owner === 'A' && u.kind === 'sapper' && (!u.task || u.task.type === 'move'));
    if (!idle) return false;
    const ctx = this.probeAssault(read, reach);
    const b = ctx && ctx.breach; if (!b) return false;
    const ptc = read.knownTC || this.knownPlayerTC(); if (!ptc) return false;
    const tier = Units.sapperTier('A');
    const modeFor = (x, y) => {
      const t = S.map.terrain[MapGen.idx(x, y)], water = (t === T.WATER || t === T.MOAT);
      if (water && Terraform.bridgeable(x, y) && !Bld.bridgeAt(x, y)) return 'bridge';
      if (tier >= 3 && Terraform.isClearable(x, y)) return 'clear';
      if (tier >= 3 && water && Terraform.isMoundable(x, y, 'A') && Bld.canAfford(CFG.TERRAFORM.moundCost, ai.res)) return 'mound';
      return null;
    };
    // walk from the frontier tile straight toward the hall, collecting the connected
    // run of tiles we must (and can) breach until open ground opens up on the far side
    const dx = ptc.x - b.x, dy = ptc.y - b.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const line = [], seen = new Set();
    for (let s = 0; s < 8; s++) {
      const x = Math.round(b.x + ux * s), y = Math.round(b.y + uy * s);
      if (!MapGen.inB(x, y)) break;
      const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      if (Path.passable(x, y, 'A')) { if (s >= 1) break; else continue; }   // reached open ground past the barrier
      const mode = modeFor(x, y); if (!mode) break;                          // hit something we can't breach (deep water / mountain) → stop the lane here
      line.push({ x, y, job: mode });
    }
    if (line.length && Units.queueTerraform(idle, line)) { this._escort(idle); return true; }
    // couldn't line up a run (e.g. the frontier tile itself is all we can take): fall
    // back to the single tile so the dig still inches forward
    const mode = modeFor(b.x, b.y);
    if (mode && Units.assignTerraform(idle, b.x, b.y, mode)) { this._escort(idle); return true; }
    return false;
  },

  // TIDEWRACK's landing: load troops into the transports and sail for the player's
  // shore (warships screen). Troops resume the assault the moment they hit the beach.
  _launchAmphib(read, parallel) {
    const ai = S.ai, ptc = read.knownTC, ctx = this.probeAssault(read);
    if (!ptc || !ctx || !ctx.shore || !ctx.shore.land) return false;
    const land = ctx.shore.land;
    const transports = S.units.filter(u => u.owner === 'A' && Units.isTransport(u) && (!u.cargo || !u.cargo.length) && !(u.task && u.task.type === 'unload'));
    if (!transports.length) return false;
    const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
      u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
    if (troops.length < 3) return false;
    // BEACHHEAD OBJECTIVE: a light landing party can't crack a walled hall, but it
    // CAN put the undefended economy behind the shore to the torch — which is how a
    // sea raid actually hurts. Aim for the nearest exposed farm / lodge / camp the
    // scouts have seen; only march on the hall itself if nothing softer is known.
    let obj = { type: 'tc', x: ptc.x, y: ptc.y };
    if (read.exposed && read.exposed.length) {
      let best = null, bd = 1e9;
      for (const e of read.exposed) { const d = Math.hypot(e.x - land.x, e.y - land.y); if (d < bd) { bd = d; best = e; } }
      if (best) obj = { type: best.bld ? 'econ' : 'tc', x: Math.round(best.x), y: Math.round(best.y) };
    }
    let ti = 0, sailed = 0;
    for (const tr of transports) {
      const cap = Units.cargoCap(tr); tr.cargo = tr.cargo || [];
      let n = 0;
      while (n < cap && ti < troops.length) {
        const u = troops[ti++];
        u.raidObj = { type: obj.type, x: obj.x, y: obj.y };   // hit the beachhead objective on landing
        u.assault = true;                                     // then cascade on to the next mark
        u.task = null; u.tUnit = 0; u.tBld = 0; u.defend = false;
        S.units.splice(S.units.indexOf(u), 1);            // aboard the hull
        tr.cargo.push(u); n++;
      }
      if (n > 0) { Units.orderUnload(tr, land.x, land.y); sailed++; }
      if (ti >= troops.length) break;
    }
    if (!sailed) return false;
    // warship / fireship screen stands off the landing zone and covers the beach
    for (const sh of S.units.filter(u => u.owner === 'A' && (u.kind === 'warship' || u.kind === 'fireship') && !(u.task && u.task.type === 'unload'))) {
      const wspot = MapGen.findNear(land.x, land.y, 6, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.WATER && !Bld.at(x, y));
      if (wspot) { sh.task = { type: 'move', x: wspot.x, y: wspot.y }; sh.tUnit = 0; sh.tBld = 0; Units.setPath(sh, wspot.x, wspot.y); }
    }
    // a SECOND FRONT keeps its own orders: the landing party carries per-unit
    // objectives, so it must not overwrite the land assault's bookkeeping
    if (!parallel) {
      ai.raidObj = obj; ai.raidLane = 'TIDEWRACK'; ai.raidN = Math.min(troops.length, ti); ai.raidDay = S.day;
      G.log(this.CAMPAIGN_CRY.TIDEWRACK, true);
    } else {
      G.log('⛵ Rival sails slip past the moat — a second force is landing on your shore!', true);
    }
    return true;
  },

  /* THE SECOND FRONT. The campaign system commits to ONE plan at a time, which
     is usually right — but when the main assault is beached at a moat while a
     dock and loaded hulls sit idle, the sea is a free extra axis. This puts the
     RESERVE (troops not already committed to the land raid) ashore behind the
     ditch while the siege line holds the far bank, so a moat buys time rather
     than immunity. Bounded: only while genuinely stalled, only with hulls to
     spare, and on its own long cooldown so it can't become a boat parade. */
  secondFront(read) {
    const ai = S.ai;
    if (!read.knownTC) return false;
    if (!(ai.stall && S.day - (ai.stall.t || 0) <= 6)) return false;      // the land route is open — no need
    if ((ai.seaCd || 0) > 0) { ai.seaCd--; return false; }
    const hulls = S.units.filter(u => u.owner === 'A' && Units.isTransport(u) &&
      (!u.cargo || !u.cargo.length) && !(u.task && u.task.type === 'unload'));
    if (!hulls.length) return false;
    const reserve = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
      u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
    if (reserve.length < 3) return false;                                 // don't strip the home guard for a token landing
    if (this._launchAmphib(read, true)) { ai.seaCd = 24; return true; }
    return false;
  },

  daily() {
    const ai = S.ai;
    const m = G.modeCfg();
    const P = this.persona();
    this.assess();          // LAYER 1: read the board before deciding anything
    const tc = Bld.tcOf('A');
    if (!tc) return;        // rival destroyed
    this.choosePosture();   // LAYER 2: pick / hold the current plan
    const read = ai.read;
    this.learn(read);       // LAYER 5: fold observations into adaptive memory
    this.campaignSelect(read);   // SIEGE CAMPAIGN: if a plain raid can't get in, commit to a named plan (before we choose what to build, so support can bias it)

    // THE DAY'S HANDS: the chief gets a few macro actions per day (mode-scaled).
    // Every construction start / upgrade / training run / caravan spends one
    // (Bld.aiAct), so it does the best-scored few things a human could — the
    // utility layers still decide WHAT, this only decides HOW MUCH per day.
    ai.acts = m.aiActions != null ? m.aiActions : 2;

    // small base income so the AI never fully stalls (scaled by difficulty).
    // A boom-opening chief works the fields harder in the first minutes.
    // Kept modest — the real income comes from its villager-crewed stations now.
    const op = ai.opening || {};
    const boomMult = op.bias === 'boom' && S.day <= (op.until || 0)
      ? (op.fired ? 1.2 : 1.08) : 1;
    /* A TRIBE WIPED OF ITS WORKERS still has hands. With the crewed economy, a
       chief whose last villager falls has NO income at all — it cannot afford
       the 50 food to hire another, so it sits inert behind its walls forever
       while the player mops up at leisure (a real game ended that way). When
       the fields are empty the whole village turns out to forage: enough to put
       a hand back on a plot in a week or so, never enough to fight from. */
    const relief = Units.count('A', u => Units.isVillager(u)) === 0 && Bld.tcOf('A') ? 4 : 1;
    ai.res.food += 2 * m.aiOutput * boomMult * relief;
    ai.res.wood += 2 * m.aiOutput * boomMult * relief;
    ai.res.stone += 1 * m.aiOutput * boomMult;
    ai.res.gold += 3 * m.aiOutput;   // gold has no worker source for the rival — it trickles here
    Bld.dailyProduction('A');

    /* ---- WORKFORCE FIRST: villagers ARE the rival's economy now (see
       Bld.dailyProduction — each living villager crews one station slot).
       Hiring happens BEFORE any other spending, the way a real player
       protects villager production: the pool grows toward a target that
       rises one hand every aiVillEvery days up to the mode's cap, at most
       one per day, each paid in food. Raiders that cut down its workers
       cut its income exactly like it cuts the player's. ---- */
    const wantV = Math.min(m.aiVillCap || 8, 3 + Math.floor(S.day / (m.aiVillEvery || 12)));
    if (Units.count('A', u => Units.isVillager(u)) < wantV) {
      // skim a little of each day's food into a hiring purse the army can't
      // eat — otherwise daily training drains the pot and the workforce never
      // grows (exactly the trap a sloppy human falls into)
      const put = Math.min(ai.res.food, 15);
      ai.res.food -= put; ai.purse = (ai.purse || 0) + put;
      if (ai.purse >= 50) {
        const spot = MapGen.findNear(tc.x, tc.y + Bld.size(tc.key), 4, (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
        if (spot) { ai.purse -= 50; Units.spawn('villager', 'A', spot.x, spot.y); }
      }
    } else if (ai.purse) { ai.res.food += ai.purse; ai.purse = 0; }   // workforce full — bank the change

    /* ---- BUILD CREWS: no ghost construction. The rival's buildings rise only
       under a villager's hammer, exactly like the player's — every unmanned
       site or upgrade pulls the nearest free villager over (their build sprite
       plays on site). Kill the builder and the work STOPS until another hand
       is hired and walks out. Free to order (micro, not a macro action). ---- */
    {
      const sites = Bld.list('A').filter(b => b.construction > 0 || b.upgrading > 0);
      if (sites.length) {
        const busy = new Set();
        for (const u of S.units) if (u.owner === 'A' && u.task && u.task.type === 'build') busy.add(u.task.id);
        for (const site of sites) {
          if (busy.has(site.id)) continue;
          let best = null, bd = 1e9;
          for (const u of S.units) {
            if (u.owner !== 'A' || !Units.isVillager(u)) continue;
            if (u.task && u.task.type === 'build') continue;
            const dd = Math.hypot(u.x - Bld.cx(site), u.y - Bld.cy(site));
            if (dd < bd) { bd = dd; best = u; }
          }
          if (!best) break;                    // no hands left alive — the works stand idle
          Units.assignBuild(best, site);
          busy.add(site.id);
        }
      }
    }

    // run any Trading Posts: send a caravan out with a genuine surplus good,
    // like a player would. Stingy — keeps a reserve, one caravan per post, and
    // doesn't bother once the treasury is already flush with gold.
    if ((ai.res.gold || 0) < 400) {
      for (const b of Bld.list('A')) {
        if (b.key !== 'trade' || !Bld.done(b) || b.upgrading || b.caravan) continue;
        const need = Bld.tradeSpec(b).input;
        let best = null, bestAmt = 0;
        for (const res of CFG.TRADE.goods) {
          const amt = ai.res[res] || 0;
          if (amt >= need + 150 && amt > bestAmt) { bestAmt = amt; best = res; }   // trade only a real surplus
        }
        if (best) Bld.startTrade(b, best);
      }
    }

    /* ---- VARIABLE OPENINGS, early behaviors (first minutes only) ---- */
    if (op.bias === 'scout' && op.fired && !op.scoutDone && S.day >= 2) {
      // the horselord's rider rides out to LOOK for the player — eyes under
      // fog, not a homing beacon. It probes toward the far unknown and the
      // memory of where the player was last seen guides later hooves.
      const rider = S.units.find(u => u.owner === 'A' &&
        (u.kind === 'rider' || u.kind === 'horsearcher') && !u.tUnit && !u.tBld);
      const dst = this.knownPlayerTC() || this.scoutTarget();
      if (rider && dst) {
        op.scoutDone = true;
        const spot = MapGen.findNear(dst.x, dst.y, 5, (x, y) => Path.passable(x, y, 'A')) || dst;
        rider.task = { type: 'move', x: spot.x, y: spot.y }; Units.setPath(rider, spot.x, spot.y);
        ai.scoutId = rider.id;
      } else if (S.day > 10) op.scoutDone = true;   // no horse this life — let it go
    }
    if (op.bias === 'turtle' && op.fired && !op.towerDone && S.day <= (op.until || 0)) {
      // the mason raises a watchtower before almost anything else
      if (Bld.list('A').some(b => b.key === 'tower')) op.towerDone = true;
      else if (this.tryBuild('tower')) op.towerDone = true;
    }

    /* ---- repair crews: chip damage must not accumulate forever. Any
       damaged building heals slowly once no enemy stands over it ---- */
    for (const b of Bld.list('A')) {
      if (!Bld.done(b) || b.hp >= b.maxhp) continue;
      const foe = Combat.nearestUnit(Bld.cx(b), Bld.cy(b), 6 + Bld.reach(b),
        o => Combat.hostileToBld(b, o) && !Units.isPassive(o));
      if (!foe) b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.05);
    }

    /* ---- the town alarm: when buildings burn, idle soldiers converge on
       the fight instead of holding posts across town, and a tribe caught
       with NO army rushes spears into hands, savings be damned ---- */
    if (ai.alarm && S.day - ai.alarm.day <= 1) {
      for (const u of S.units) {
        if (u.owner !== 'A' || !Units.isMilitary(u) || Units.isNaval(u) || u.kind === 'siegetower') continue;
        if (u.tUnit || u.tBld || (u.task && u.task.type === 'raid')) continue;
        if (Math.hypot(u.x - ai.alarm.x, u.y - ai.alarm.y) <= 4) continue;
        u.task = { type: 'move', x: ai.alarm.x, y: ai.alarm.y };
        u.anchor = { x: ai.alarm.x + 0.5, y: ai.alarm.y + 0.5 };
        Units.setPath(u, ai.alarm.x, ai.alarm.y);
      }
      if (Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u)) === 0) {
        const hall = S.buildings.find(b => b.owner === 'A' && !b.upgrading && Bld.done(b) &&
          (b.key === 'barracks' || b.key === 'stable' || b.key === 'range'));
        if (hall) {
          const kind = hall.key === 'stable' ? 'rider' : hall.key === 'range' ? 'archer' : 'defender';
          Bld.train(hall, kind); Bld.train(hall, kind);
        }
      }
    }

    /* ---- LAYER 3: utility-scored economy, defense, construction & army.
       (a) reserve the next Town Center's cost so cheap builds don't drain
       the jar (utility still decides WHAT to build with the surplus);
       (b) safety actions may fire any day; (c) on the build cadence, the
       single best-scored construction/upgrade; (d) posture- and
       counter-weighted training plus navy. No fixed order — the choice is
       continuous, so behavior shifts smoothly instead of on cliff edges. ---- */
    if (ai.goal && ((ai.goal.book || ai.goal.hall || ai.goal.vet) ? S.day > ai.goal.until
        : (tc.level >= 3 || tc.upgrading || S.day > ai.goal.until))) ai.goal = null;
    if (!ai.goal && tc.level < 3 && !tc.upgrading && S.day > P.tcDays[tc.level - 1])
      ai.goal = { cost: CFG.BUILDINGS.tc.levels[tc.level].cost, until: S.day + 20 };
    /* SAVE FOR THE VETERAN UNLOCK. Champions, lancers and fire archers all
       need their hall at Lv 3, and that tier is a lump (300 wood + 220 stone
       for a barracks) that never gets saved for — so timber dribbled away into
       towers, walls and basic troops while the chief sat on eight hundred gold
       it had no way to spend and fielded ZERO veterans against a target of
       nine. Once there's a real army to upgrade, the next hall tier becomes a
       reservation like the Town Center's, and the treasury stops leaking. */
    if (!ai.goal && tc.level >= 3) {
      const army = Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u));
      if (army >= 5) {
        const hall = Bld.list('A')
          .filter(b => ['barracks', 'range', 'stable'].includes(b.key) && (b.level || 1) < 3 && Bld.done(b) && !b.upgrading)
          .sort((a, b) => (b.level || 1) - (a.level || 1))[0];   // finish the closest one first
        if (hall) ai.goal = { cost: CFG.BUILDINGS[hall.key].levels[hall.level].cost, until: S.day + 25, vet: true };
      }
    }
    ai._free = true;                              // emergencies don't queue behind the day's chores
    const didSafety = this.digAndProtect(read);
    ai._free = false;
    /* ARMY BEFORE BRICKS when the yard is empty: a chief with half (or less)
       of its target force drills FIRST, so the day's resources arm hands
       before they roof houses — no more all-city-no-army mornings. Otherwise
       construction leads and training takes what's left. Safety acting no
       longer swallows the whole day: the action budget is the throughput
       limit, so the best build/upgrade still runs after an emergency. */
    const standing = Units.count('A', u => Units.isMilitary(u) && !Units.isNaval(u) && !Units.isSiege(u));
    const wantNow = this.armyWant(m, ai.posture);
    const armyFirst = standing * 2 < wantNow;
    if (armyFirst) this.trainForces(m, read);
    // THE OPENING BOOK: the persona's rehearsed build order, played crisply —
    // while it runs it owns construction (bestBuild dithering starts after)
    const inBook = this.openingBook();
    if (!inBook && S.day % (m.aiBuildEvery || 2) === 0) this.bestBuild(read);
    if (S.day % 4 === 0) this.aiWarCamp(read);   // occasionally stake a forward base for a push
    if (!armyFirst) this.trainForces(m, read);
    // SAPPERS: first priority is breaching where a raid party is stuck — clear the
    // woods or bridge the water so the assault gets through — then defensive moats
    // and offensive breaches
    this.breachStall(read);
    this.terraform(read);

    /* ---- SCOUTING: the rival is blind beyond its own eyes, so it must go
       LOOK. When it hasn't found the player's town — or its memory of it has
       gone stale — it dispatches a probe toward the far unknown (or toward
       where the player was last seen) to refresh what it knows. It won't
       strip its home guard to do it: a spare rider goes first, else a
       villager, and only a spare soldier if there are several to spare.
       PACED, never a death march: dispatches sit at least 8 days apart, each
       scout that never comes home stretches the wait (the road is clearly
       watched), and after two lost villagers no villager is risked again —
       hands belong on farms and building sites, not a daily parade into the
       player's tower fire. Fresh eyes on the town reset the caution. ---- */
    const kTC = read.knownTC;
    if (kTC && S.day - (kTC.seen || 0) <= 2) ai.scoutFail = 0;   // intel refreshed — the road worked
    const blind = !kTC;                                          // never laid eyes on their town
    const needScout = blind || (S.day - (kTC.seen || 0) > 40);
    if (!ai.scouts) ai.scouts = [];
    // retire scouts that died, arrived, or are no longer needed
    ai.scouts = ai.scouts.filter(id => {
      const u = S.units.find(x => x.id === id);
      if (!u) { ai.scoutFail = (ai.scoutFail || 0) + 1; return false; }
      if (!needScout) {                       // FOUND THEM — the search is over
        u.task = null; u.scouting = false;    // fall in as a soldier again
        return false;
      }
      if (u.task && u.task.type === 'move') return true;         // still walking its leg
      // leg done and we're still blind: sweep ON to the next unexplored frontier
      const maxLegs = Units.isVillager(u) ? 1 : 6;
      if ((u.scoutLegs || 0) >= maxLegs) { u.scouting = false; return false; }
      const nxt = this.searchTarget(u);
      if (!nxt) { u.scouting = false; return false; }
      u.task = { type: 'move', x: nxt.x, y: nxt.y };
      u.anchor = { x: nxt.x + 0.5, y: nxt.y + 0.5 };
      Units.setPath(u, nxt.x, nxt.y);
      u.scoutLegs = (u.scoutLegs || 0) + 1;
      return true;
    });
    ai.scoutId = ai.scouts[0] || 0;                              // legacy field, kept for saves
    /* HOW HARD TO LOOK. Two different problems wear the same word:
         BLIND  — we have never found them. Nothing offensive can happen until
                  we do (every attack layer is gated on knowing their hall), so
                  this is an emergency: send a PAIR, keep them out, and do it
                  even while we are being hit — especially then, since someone
                  is clearly out there and we still don't know where from.
         STALE  — we found them once and the memory has aged. No emergency:
                  the old cautious pacing applies so we don't parade the
                  workforce into their towers for a map update.
       Once their hall is known the search stops dead and those hands go back
       to soldiering — see the retirement pass above. */
    /* Even blind, the road can be lethal — scouts that never come home mean the
       way is watched. Being blind is existential, so the search never stops
       outright, but it backs off hard as parties are lost (5d, then 12, 19, 26…
       up to 40) and stops sending them in pairs. Otherwise a chief with a
       tower-lined approach feeds its whole army down the same path a few at a
       time — which is exactly the death-march this pacing was added to stop. */
    const fails = Math.min(5, ai.scoutFail || 0);
    const wantScouts = blind && S.day >= 8 && fails <= 1 ? 2 : 1;
    const gap = blind ? 5 + fails * 7 : 8 + Math.min(4, ai.scoutFail || 0) * 12;
    const mayLook = needScout && ai.scouts.length < wantScouts &&
      (blind || !read.underThreat) &&
      S.day - (ai.scoutDay == null ? -99 : ai.scoutDay) >= gap;
    if (mayLook) {
      /* WHO CAN BE SPARED. Ordinarily anyone already swinging at something is
         off the list. But a BLIND tribe under attack has every hand drafted
         into the militia (Combat gives them a target the moment the town is
         besieged), so "everyone is busy" became a permanent deadlock: nobody
         could be spared, so it never learned who was hitting it, so it never
         fought back — the punching bag the day-74 game ended as. While blind,
         a body fighting at home can be pulled out and sent to look; knowing
         where the enemy lives is worth more than one extra militiaman. */
      const engaged = u => u.tBld || u.scouting ||
        (u.task && (u.task.type === 'raid' || u.task.type === 'move' || u.task.type === 'build'));
      const busy = u => u.tUnit || engaged(u);
      const spares = S.units.filter(u => u.owner === 'A' && !Units.isNaval(u) &&
        (blind ? !engaged(u) : !busy(u)));
      const soldiers = spares.filter(u => Units.isMilitary(u) && u.kind !== 'siegetower' && !Units.isSiege(u));
      const villagers = spares.filter(u => Units.isVillager(u));
      // a horse is the born scout; otherwise a spear can be spared while blind
      // (a home guard is still kept back), and only then a villager
      const guard = blind ? (fails >= 2 ? 2 : 1) : 3;   // a proven-deadly road doesn't get the home guard too
      const pick = soldiers.find(u => u.kind === 'rider' || u.kind === 'horsearcher')
        || (soldiers.length > guard ? soldiers[0] : null)
        || (((ai.scoutFail || 0) < 2 || blind) && villagers.length >= (blind ? 3 : 4) ? villagers[0] : null);
      const dst = pick ? this.searchTarget(pick) : null;
      if (dst && pick) {
        pick.tUnit = 0; pick.militia = false;   // stood down from the line, sent to look
        pick.task = { type: 'move', x: dst.x, y: dst.y };
        pick.anchor = { x: dst.x + 0.5, y: dst.y + 0.5 };
        Units.setPath(pick, dst.x, dst.y);
        pick.scouting = true; pick.scoutLegs = 1;
        ai.scouts.push(pick.id);
        ai.scoutId = ai.scouts[0];
        ai.scoutDay = S.day;                                     // starts the between-scouts clock
      }
    }

    /* ---- raids: launch when strong, RETREAT when it goes wrong. A party
       cut below a third of its strength (or bogged down for 8+ days) breaks
       off and marches home to fight another day. And a long stalemate makes
       any chief bolder — the power bar to raid decays slowly after day 90,
       so a turtled game still ends in fire and iron. ---- */
    const mem = ai.memory || (ai.memory = { wallStop: false, wallHit: 0 });
    if (!mem.laneDef) mem.laneDef = {};
    const raiders = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid' && !u.harass);
    if (raiders.length) {
      const tooFew = ai.raidN && raiders.length <= Math.max(1, Math.floor(ai.raidN * 0.35));
      const tooLong = ai.raidDay && S.day - ai.raidDay > 8;
      // NO MERCY AT THE GATES: a party standing over a battered Town Center
      // presses the kill instead of breaking off — a nearly-razed hall is the
      // one prize worth dying for (villagers sheltering inside change nothing).
      // Requires the party actually AT the hall; a beaten party scattered far
      // from it still retreats as usual.
      const ptc = Bld.tcOf('P');
      const killShot = ptc && ptc.hp < ptc.maxhp * 0.35 && raiders.length >= 2 &&
        raiders.some(u => Math.hypot(u.x - Bld.cx(ptc), u.y - Bld.cy(ptc)) < 12);
      if (killShot) {
        ai.raidDay = Math.max(ai.raidDay || 0, S.day - 4);        // hold the break-off clock while the kill is on
        for (const u of raiders)                                   // idle hands swing at the hall itself
          if (!u.tBld && !u.tUnit) Units.orderAttackBuilding(u, ptc);
      } else if (tooFew || tooLong) {
        // LAYER 5: learn from how this raid went. Razing something means the
        // approach worked; stalling on walls means try the flank next time —
        // so the chief never suicides into the same wall twice.
        const razed = Bld.list('P').length < (ai.raidFoeBld || 1e9);
        // PRESS THE ADVANTAGE: a party that's WINNING (razed something, still
        // mostly intact) doesn't march home on a timer — it rolls on to the
        // next mark. A human snowballs a won fight; now so does the chief.
        // Bounded to two extensions so a stalemate still ends in a withdrawal.
        if (!tooFew && razed && raiders.length >= Math.ceil((ai.raidN || 1) * 0.6) && (ai.raidExt || 0) < 2) {
          ai.raidExt = (ai.raidExt || 0) + 1;
          ai.raidDay = S.day;                              // fresh clock for the next push
          ai.raidFoeBld = Bld.list('P').length;            // fresh yardstick — progress must continue
          mem.wallStop = false;
        } else {
          if (razed) mem.wallStop = false;
          else if ((mem.wallHit || 0) > 0) mem.wallStop = true;
          // remember which LANE this was: a stalled/beaten push marks its lane as
          // defended (next time commit elsewhere); a productive one softens it
          if (ai.raidLane) {
            const cur = mem.laneDef[ai.raidLane] || 0;
            mem.laneDef[ai.raidLane] = razed ? Math.max(0, cur - 1) : Math.min(6, cur + (tooFew ? 2 : 1));
          }
          for (const k in mem.laneDef) mem.laneDef[k] = Math.max(0, mem.laneDef[k] - 0.15);   // slow decay
          for (const u of raiders) {
            u.task = { type: 'move', x: tc.x, y: tc.y + 2 };
            u.tUnit = 0; u.tBld = 0; u.tBridge = null; u.probe = false; u.raidObj = null;
            u.anchor = { x: tc.x + 0.5, y: tc.y + 2.5 };
            Units.setPath(u, tc.x, tc.y + 2);
          }
          ai.raidN = 0; ai.raidObj = null; ai.raidLane = null; ai.raidExt = 0;
          if (tooFew) G.log('The rival war party breaks off and retreats!');
        }
      }
    } else { ai.raidN = 0; ai.raidObj = null; ai.raidLane = null; }

    if (ai.raidCd > 0) ai.raidCd--;
    // SIEGE CAMPAIGN owns the attack decision when a named plan is live — it launches
    // its tailored assault (siege train / landing / escalade / breach / storm) or
    // deliberately HOLDS while it tools up, so the chief commits instead of throwing
    // an ordinary doomed raid at the same wall. Falls through to normal raids otherwise.
    const campOwns = this.campaignLaunch(read, m);
    // …and while that plan grinds at the ditch, the reserve can go by sea
    this.secondFront(read);
    /* ---- LAYER 2 drives IF we attack; the read drives WHEN. Only the
       attack postures march, and a real opening (foeVuln) beats any day
       timer — so the rival strikes an undefended player on the state of
       the board, not the calendar. PUSH masses a decisive force; PRESSURE
       sends a smaller party to pick off soft targets and retreat. ---- */
    // it can only march on a town it has FOUND, and it sizes the enemy by what
    // it has SEEN (read.foePower), not the true roster — fog binds the chief
    const mine = this.power('A'), theirs = read.foePower;
    const pl = this.plan();
    const attackPosture = ai.posture === 'PUSH' || ai.posture === 'PRESSURE';
    // exploitation appetite (difficulty) sets how much of an edge it needs
    const aggro = Math.min(1.25, pl.aggression * (0.5 + 0.6 * (m.aiAggro || 1)));
    const boldness = Math.max(0.8,
      P.raidPower - aggro * 0.5 - ((read.foeVuln || read.strikeWindow) ? 0.35 : 0) - Math.max(0, S.day - 90) * 0.005);
    const dayFloor = (read.foeVuln || read.strikeWindow) ? 12 : Math.max(16, m.aiRaidDay + P.raidDayAdd);
    // a SCOUTED strike window cuts the raid clock short: the enemy's army is
    // seen away from home NOW — waiting out a cooldown wastes the moment
    if (read.strikeWindow && attackPosture && ai.raidCd > 1 && mine > theirs) ai.raidCd = 1;
    // TWO-FRONT SPACING: on Hard, the chief won't march while a barbarian wave is
    // imminent or still fresh on the field — piling a rival raid onto a raider
    // wave stacks into an unsurvivable window. It HOLDS (this cycle only), then
    // strikes on the next clear day, so it's no less aggressive, just better
    // timed. A wide-open player (foeVuln) is still too tempting to pass up.
    const waveNear = m.barbSpacing && !read.foeVuln &&
      ((S.wave.next - S.day) <= 3 || (S.day - (S.wave.lastDay || -99)) <= 4);
    if (!campOwns && read.knownTC && attackPosture && ai.raidCd <= 0 && !raiders.length && S.day >= dayFloor && mine >= 3 && !waveNear) {
      const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
        !Units.isNaval(u) && u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
      const push = ai.posture === 'PUSH';
      const cr = this.creativity();
      // vary the committed fraction within sound bounds so two games with the
      // same posture don't send the same-sized party every time
      const shareJit = 1 + (G.rand() - 0.5) * 0.5 * cr;
      const share = Math.max(0.4, Math.min(1, (push ? Math.max(0.66, P.raidShare) : Math.min(0.5, P.raidShare)) * shareJit));
      const need = push ? Math.max(4, Math.ceil(theirs * boldness) + 1) : 3;
      const strong = push ? (mine >= 4 && (mine > theirs * boldness || (read.strikeWindow && mine > theirs)))
        : (read.foeVuln || read.strikeWindow || read.softCount > 0 || mine > theirs * boldness);
      if (strong && troops.length >= need) {
        const party = troops.slice(0, Math.max(need, Math.ceil(troops.length * share)));
        // LAYER 4: pick the main objective. Prefer the LEAST-DEFENDED approach
        // lane (memory + remembered towers) when committing a PUSH.
        const lanes = this.playerLanes();
        const mainObj = this.chooseRaidObj(read, push);
        const mainLane = lanes[0] || null;
        if (push && mainLane && mainObj && mainObj.type === 'tc' && !mainObj.flank) {
          mainObj.x = mainLane.mid.x; mainObj.y = mainLane.mid.y; mainObj.lane = mainLane.key;
        }
        /* MULTI-LANE PROBING (difficulty-scaled). Calm marches one telegraphed
           column. Moderate occasionally peels off a feint down a second lane.
           Hard actively probes 2+ lanes — harass parties on alternate routes to
           find the undefended gap and pull the player's defenders — then the
           main force commits to the lane memory says is softest. Probes are
           small; if they meet a defended lane the retreat logic pulls them
           home (no suicidal dribbles), and that lane is remembered as defended. */
        // feint/split likelihood is driven by CREATIVITY (which scales with
        // difficulty): a straight chief marches one column, a creative one peels
        // off probes on alternate lanes — so the approach isn't memorisable.
        let probes = 0;
        if (lanes.length >= 2) {
          if (m.aiRaidDay <= 32) probes = G.rand() < 0.45 + 0.45 * cr ? 2 : 1;  // hard: mostly splits
          else probes = G.rand() < cr ? (G.rand() < cr * 0.5 ? 2 : 1) : 0;      // others feint when feeling crafty
        }
        const spare = party.length - Math.max(3, need);
        probes = Math.max(0, Math.min(probes, lanes.length - 1, Math.floor(spare / 2)));

        let cut = 0;
        for (let pI = 0; pI < probes; pI++) {
          const lane = lanes[1 + pI];
          const pp = party.slice(cut, cut + 2); cut += 2;
          for (const u of pp) {
            u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.probe = true; u.raidLane = lane.key;
            u.raidObj = { type: 'tc', x: lane.mid.x, y: lane.mid.y };
          }
        }
        const mainForce = party.slice(cut);
        for (const u of mainForce) {
          u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.probe = false;
          u.raidLane = mainLane ? mainLane.key : 'main'; u.raidObj = null;   // shares ai.raidObj
        }
        ai.raidObj = mainObj;
        ai.raidLane = mainLane ? mainLane.key : null;
        ai.raidFoeBld = Bld.list('P').length;
        mem.wallHit = 0;
        // jitter the cooldown so raids don't arrive on a fixed metronome
        ai.raidCd = Math.max(3, Math.round((push ? P.raidCd : Math.max(6, P.raidCd - 4)) * (1 + (G.rand() - 0.5) * 0.6 * cr)));
        ai.raidN = party.length;
        ai.raidDay = S.day;
        ai.raidExt = 0;
        G.log(push ? (probes ? '⚔ The rival splits its host — probes on the flanks, the main column marching in!'
                             : '⚔ The rival tribe masses and marches on your village!')
          : '⚔ A rival raiding party rides out!', true);
      }
    }
    /* ---- RECONNAISSANCE IN FORCE: a strong rival that has NEVER found the
       player (blind — no knownTC) must not sit forever on a full army waiting
       for the enemy to come to it. When it's genuinely strong and not itself
       under attack, it marches the bulk of its host out to LOOK — sweeping
       toward the deepest unexplored ground, where the enemy must be. A moving
       column reveals the map as it goes; the moment it sights the player's hall
       (or runs into their army/economy), aiRaidSeek engages it directly, and
       assess() flips the posture to PUSH so the full siege logic commits next
       day. A home guard stays back, and the raid retreat logic still pulls the
       column home if a hunt turns up nothing after several days. ---- */
    // NOT gated on being unthreatened any more: a strong tribe that has never
    // found its enemy must go and look precisely BECAUSE someone is hitting it
    if (!read.knownTC && ai.raidCd <= 0 && !raiders.length &&
        S.day >= Math.max(20, (m.aiRaidDay || 40) - 8)) {
      const host = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
        !Units.isNaval(u) && u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
      if (host.length >= 6 && mine >= 5) {
        const dest = this.huntTarget();
        if (dest) {
          const party = host.slice(0, Math.max(6, Math.ceil(host.length * 0.7)));   // leave a home guard
          for (const u of party) {
            u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.probe = false;
            u.raidLane = 'hunt'; u.raidObj = { type: 'tc', x: dest.x, y: dest.y };
          }
          ai.raidObj = { type: 'tc', x: dest.x, y: dest.y };
          ai.raidLane = 'hunt'; ai.raidN = party.length; ai.raidDay = S.day; ai.raidExt = 0;
          ai.raidFoeBld = Bld.list('P').length; mem.wallHit = 0;
          ai.raidCd = Math.max(6, Math.round(P.raidCd));
          G.log('⚔ The rival tribe marches out in force, hunting for your village!', true);
        }
      }
    }

    /* ---- HARASSMENT: the constant small pressure a human opponent applies.
       Two fast riders slip out at SCOUTED, exposed workers (read.exposed —
       what its own eyes have actually seen), kill what they catch, and come
       home on a short leash: hurt (<40%), out of work, or out of days (6) →
       they break off. It never strips the guard (only fires with 4+ soldiers
       free, takes 2), never blocks the main raid machinery (u.harass parties
       are excluded from its bookkeeping), and rests aiHarass days between
       sorties — Calm never does it at all. The tax on the player is having
       to LOOK UP from their build order, over and over. ---- */
    for (const u of S.units) {
      if (u.owner !== 'A' || !u.harass) continue;
      const hurt = u.hp < (u.maxhp || CFG.UNITS[u.kind].hp) * 0.4;
      const raiding = u.task && u.task.type === 'raid';
      if (!raiding || hurt || S.day > (u.harassUntil || 0)) {
        u.harass = false;
        if (raiding) {
          u.task = { type: 'move', x: tc.x, y: tc.y + 2 };
          u.tUnit = 0; u.tBld = 0; u.probe = false; u.raidObj = null;
          u.anchor = { x: tc.x + 0.5, y: tc.y + 2.5 };
          Units.setPath(u, tc.x, tc.y + 2);
        }
      }
    }
    if (ai.harassCd == null) ai.harassCd = 0;
    if (ai.harassCd > 0) ai.harassCd--;
    if (m.aiHarass && read.knownTC && ai.harassCd <= 0 && !read.underThreat &&
        ai.posture !== 'DEFEND' && ai.posture !== 'REBUILD' &&
        S.day >= Math.max(16, (m.aiRaidDay || 40) - 16)) {
      const targets = (read.exposed || []);
      if (targets.length) {
        const free = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
          !Units.isSiege(u) && u.kind !== 'siegetower' && !u.harass && !(u.task && u.task.type === 'raid'));
        if (free.length >= 4) {
          const fast = free.slice().sort((a, b2) => (CFG.UNITS[b2.kind].speed || 2) - (CFG.UNITS[a.kind].speed || 2)).slice(0, 2);
          const tgt = targets[(G.rand() * targets.length) | 0];
          for (const u of fast) {
            u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.defend = false;
            u.probe = true; u.harass = true; u.harassUntil = S.day + 6;
            u.raidLane = 'harass';
            u.raidObj = { type: 'econ', x: Math.round(tgt.x), y: Math.round(tgt.y) };
          }
          ai.harassCd = Math.max(3, Math.round(m.aiHarass * (0.8 + G.rand() * 0.6)));
          if (!ai.harassLogged) { ai.harassLogged = true; G.log('⚔ Rival riders slip out to harry your workers — guard your fields!', true); }
        }
      }
    }

    // Home guards hold their perimeter — the rival's Defend stance (Combat.acquire).
    // Only a committed raider marches free; everyone else defends the Town Center,
    // so the garrison can't be lured off across the map (as the player's can't).
    for (const u of S.units)
      if (u.owner === 'A' && Units.isMilitary(u))
        u.defend = !u.scouting && !(u.task && u.task.type === 'raid');   // a search party isn't leashed to the hall
  },
};
