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
      order: ['farm', 'house', 'barracks', 'lodge', 'tower', 'farm', 'house', 'lumber',
              'tower', 'quarry', 'house', 'farm', 'range', 'farm', 'house'],
      mix: [['defender', 0.45], ['archer', 0.3], ['longbow', 0.25]],
      raidPower: 1.7, raidDayAdd: 25, raidShare: 0.5, raidCd: 16,
      walls: false, dockTC: 2, boats: 2, shipDiv: 4, tcDays: [22, 55],
      blurb: 'a patient farmer-chief, slow to anger, rich in grain.',
    },
    warlord: {
      name: 'Warlord',
      order: ['barracks', 'house', 'farm', 'range', 'farm', 'house', 'stable', 'tower',
              'farm', 'barracks', 'house', 'farm', 'house', 'tower', 'siege'],
      mix: [['defender', 0.3], ['axeman', 0.2], ['archer', 0.2], ['rider', 0.2], ['catapult', 0.1]],
      raidPower: 1.1, raidDayAdd: -15, raidShare: 0.7, raidCd: 10,
      walls: false, dockTC: 2, boats: 1, shipDiv: 4, tcDays: [30, 70],
      blurb: 'a warmonger who prizes the spear over the plough.',
    },
    horselord: {
      name: 'Horselord',
      order: ['farm', 'house', 'barracks', 'stable', 'tower', 'farm', 'lumber', 'house',
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
      order: ['quarry', 'house', 'barracks', 'tower', 'farm', 'lumber', 'house', 'tower',
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

  /* find a plot with some character instead of spiral-filling a square:
     terrain-hunters sit beside their bonus terrain, towers push toward the
     player, everything else scatters at a random angle from the hall */
  plot(key) {
    const tc = Bld.tcOf('A');
    if (!tc) return null;
    const P = this.persona();
    const rMax = P.walls ? 5 : 7;   // wall-builders keep the town inside the ring
    const isWall = (key === 'wall' || key === 'gate');
    const free = (x, y) => Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2;
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
    // crowded town (a full wall ring, a tight peninsula): spill outward rather than stall
    return MapGen.findNear(tc.x, tc.y, rMax, free) || MapGen.findNear(tc.x, tc.y, rMax + 4, free);
  },

  /* COVERAGE-AWARE tower placement. The old heuristic dropped every tower on the
     single widest seam — redundant, clustered coverage with whole flanks left
     open. Instead: score candidate tiles by the MARGINAL new coverage they add
     over the towers already standing. A tile that guards an otherwise-uncovered
     approach seam scores high; one whose range merely duplicates an existing
     tower is penalised (and pure duplicates are rejected). Towers spread to
     cover the town's whole frontage instead of piling up. */
  towerSpot(tc) {
    const free = (x, y) => Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2;
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
  playerLanes() {
    const tc = this.knownPlayerTC(); if (!tc) return [];
    const cx = Math.round(tc.x + Bld.size('tc') / 2), cy = Math.round(tc.y + Bld.size('tc') / 2);
    const gaps = this.perimeterGaps(cx, cy, 6);
    const kb = S.ai.knownB || {}, ld = (S.ai.memory && S.ai.memory.laneDef) || {};
    return gaps.map(g => {
      const key = g.dir.x + ',' + g.dir.y;
      let staticDef = 0;
      for (const k in kb) {
        const b = kb[k];
        if (b.key !== 'tower' && b.key !== 'wall' && b.key !== 'gate') continue;
        const bx = b.x + 0.5 - cx, by = b.y + 0.5 - cy, dist = Math.hypot(bx, by) || 1;
        if (dist < 2 || dist > 11) continue;
        if ((bx * g.dir.x + by * g.dir.y) / dist > 0.45) staticDef += b.key === 'tower' ? 2 : 1;
      }
      return { mid: g.mid, dir: g.dir, width: g.width, key, def: staticDef + (ld[key] || 0) * 2 };
    }).sort((a, b) => a.def - b.def);
  },

  /* Turtling done right: PLUG THE SEAMS, and actually invest in it. Terrain does
     most of the walling; the chief closes the open gaps on its perimeter. It
     seals the SHORTEST seams first (a narrow gap is cheap to close completely and
     removes a whole attack route), gates the widest seam so its own parties can
     still sortie, and reinforces the flank the player keeps attacking from
     (Layer-5 memory). Wall investment per call scales with threat and posture, so
     a threatened or turtling chief actually fortifies instead of dribbling. */
  maybeWalls(tc) {
    const P = this.persona(), ai = S.ai, read = ai.read || {};
    if (S.day < 16 || ai.res.wood < 45) return;
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
    for (const g of order) {
      for (const [x, y] of g.tiles) {
        if (placed >= budget) return;
        if (!MapGen.inB(x, y) || Bld.at(x, y)) continue;
        const isGate = x === gateMid.x && y === gateMid.y;
        const key = isGate ? 'gate' : 'wall';
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
    if (count >= want) return false;
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
    const advN = Units.count('A', u => u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'marksman');
    const adv = ADV[kind] && b.level >= 3 && S.ai.res.gold >= 25 &&
      advN < Math.floor((m.aiEliteShare || 0) * want);
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
    const wish = [
      ['farm',     2 + Math.floor(S.day / 45)],
      ['house',    2 + Math.floor(S.day / 40)],
      ['tower',    2 + Math.floor(S.day / 50)],
      ['lumber',   1 + Math.floor(S.day / 80)],
      ['quarry',   1 + Math.floor(S.day / 80)],
      ['barracks', 1 + Math.floor(S.day / 90)],
    ];
    for (const [k, n] of wish) if ((have[k] || 0) < n) return k;
    return null;
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
    const cost = CFG.BUILDINGS[key].levels[0].cost;
    if (ignoreGoal ? !Bld.canAfford(cost, S.ai.res) : !this.affordFree(cost)) return false;
    const spot = this.plot(key);
    if (!spot || !Bld.canPlace('A', key, spot.x, spot.y).ok) return false;
    Bld.place('A', key, spot.x, spot.y);
    return true;
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

    ai.read = {
      day: S.day,
      knownTC: knownTC ? { x: knownTC.x, y: knownTC.y, seen: knownTC.seen } : null, scouted: !!knownTC,
      myPower, foePower, powerRatio: myPower / Math.max(1, foePower),
      foeTrend: foePower > prevFoe + 1 ? 1 : foePower < prevFoe - 1 ? -1 : 0,
      foeHome, foeAway, foeVuln,
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
      (m.aiArmyCap || 8) + Math.floor(Math.max(0, S.day - 60) / 15));
    let want = Math.min(2 + Math.floor(S.day / (m.aiArmyDiv || 8)), cap);
    if (post === 'EXPAND') want = Math.min(want, 4);          // boom: keep a token guard
    else if (post === 'PUSH') want = cap;                     // mass for the kill
    else if (post === 'DEFEND') want = Math.min(cap, want + 2);
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
        if (this.tryBuild(bk, true)) { ai.broke[k] = 0; return true; }
      }
    }
    /* A town needs an ARMY HALL before it fortifies — an army is not a
       personality trait. Past a few days with no hall, build the persona's
       core hall the moment it's affordable; and if a resource is blocking
       it, dig THAT out first so it becomes affordable (this fixed a real
       failure: a wall-happy Mason spent its wood on towers and never
       afforded a 100-wood barracks, fielding no army at all). ---- */
    const ML = ['barracks', 'range', 'stable'];
    if (S.day >= 8 && !S.buildings.some(b => b.owner === 'A' && ML.includes(b.key))) {
      const want = P.mix.map(([k]) => this.HALL_OF[k]).find(h => ML.includes(h)) || 'barracks';
      if (this.tryBuild(want, true)) return true;
      const cost = CFG.BUILDINGS[want].levels[0].cost;   // dig toward the blocking resource
      for (const [res, key] of [['wood', 'lumber'], ['stone', 'quarry'], ['food', 'farm']])
        if ((cost[res] || 0) > (ai.res[res] || 0) && this.tryBuild(key, true)) return true;
    }
    // under attack with thin walls → raise a tower now (savings jar be damned)
    if (read.underThreat && Bld.list('A').filter(b => b.key === 'tower').length < 2 + tc.level &&
        this.tryBuild('tower', true)) return true;
    return false;
  },

  _buildDock() {
    const tc = Bld.tcOf('A');
    if (!Bld.canAfford(CFG.BUILDINGS.dock.levels[0].cost, S.ai.res)) return false;
    const site = MapGen.findNear(tc.x, tc.y, 8, (x, y) => Bld.dockSiteOk(x, y, 'A').ok);
    if (site && Bld.canPlace('A', 'dock', site.x, site.y).ok) { Bld.place('A', 'dock', site.x, site.y); return true; }
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

    // income buildings
    for (const [res, key] of [['wood', 'lumber'], ['stone', 'quarry'], ['food', 'farm']]) {
      let u = 26 - (have[key] || 0) * 7 + Math.max(0, (60 - ai.res[res]) * 0.4);
      if (post === 'EXPAND') u += 24;
      if (pl.win === 'economy' || pl.win === 'timing') u += 6;
      add(u, () => this.tryBuild(key));
    }
    add(14 - (have.lodge || 0) * 8 + (P.name === 'Forager' ? 12 : 0), () => this.tryBuild('lodge'));

    // military halls for the mix, plus counters the read demands
    const wantHalls = new Set();
    for (const [k] of P.mix) wantHalls.add(this.HALL_OF[k]);
    if (read.foeCavHeavy || read.foeMassed === 'cav') wantHalls.add('range');   // counter the trend, not one glimpse
    if (read.foeArchHeavy || read.foeMassed === 'arch') wantHalls.add('stable');
    if (read.foeWall >= 3 && tc.level >= 3) wantHalls.add('siege');             // player turtled → tech to siege to crack it
    for (const hall of wantHalls) {
      if (!hall || have[hall]) continue;
      if (hall === 'siege' && tc.level < 3) continue;
      let u = 48;
      if (hall === 'siege' && read.foeWall >= 3) u += 30;   // a walled foe makes a workshop worth the wood
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
    add(14 + (P.walls ? 14 : 0) + (post === 'DEFEND' ? 38 : 0) + (read.underThreat ? 20 : 0) +
        (read.foeRush ? 16 : 0) + (threatened ? Math.min(18, (read.homeExposed || 0) * 1.4) : 0) -
        (have.tower || 0) * 7,
      () => this.tryBuild('tower'));
    // WALLS scale with THREAT and posture — a wall-persona or a threatened chief
    // fortifies; a safe non-wall chief doesn't burn wood ringing open ground
    // against nobody (that starves the offence against a passive foe).
    if ((S.day >= 18 || read.foeRush) && read.homeGapCount > 0 && (P.walls || threatened)) {
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
    add(9 + (post === 'EXPAND' ? 5 : 0) - (have.house || 0) * 2, () => this.tryBuild('house'));

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
    const stalledClear = ai.stallClearT && S.day - ai.stallClearT <= 6;
    const ups = Bld.list('A').filter(b => b.key !== 'tc' && Bld.canUpgrade(b).ok);
    if (ups.length) {
      const prio = { barracks: 3, range: 3, stable: 3, siege: 2, tower: 2, dock: 2 };
      ups.sort((a, b2) => (prio[b2.key] || 1) - (prio[a.key] || 1));
      const sapUp = stalledClear && ups.find(b => b.key === 'sapper');
      const b = sapUp || ups[0];
      add(24 + (prio[b.key] || 1) * 6 + (post === 'PUSH' ? 18 : 0) - (post === 'EXPAND' ? 10 : 0) +
          (sapUp ? 40 : 0),
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
    }

    // endless growth backfill
    const gk = this.growthKey();
    if (gk) add(18, () => this.tryBuild(gk));

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
    if (this.trainArmy(m, want, mix) && ai.res.food > 400 && ai.res.gold > 80)
      this.trainArmy(m, want, mix);
    // WALL-BREAKERS: a walled player needs siege to crack, whatever the persona.
    // With a workshop up, keep a catapult (or a trebuchet once L3) on hand so a
    // PUSH doesn't stall poking stone — combat already routes the rest through
    // the gap while the engines batter the wall.
    if (read.foeWall >= 2) {
      const ws = S.buildings.find(b => b.owner === 'A' && b.key === 'siege' &&
        Bld.done(b) && !b.upgrading && b.queue.length === 0);
      if (ws) {
        const breakers = Units.count('A', u => u.kind === 'catapult' || u.kind === 'trebuchet');
        if (breakers < (read.foeWall >= 5 ? 2 : 1)) {
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
    if (campStrat === 'TIDEWRACK' && dock && !dock.upgrading && dock.queue.length === 0) {
      const trs = Units.count('A', u => Units.isTransport(u));
      const big = dock.level >= 3;
      const key = big ? 'bigtransport' : 'transport';
      if (trs < 3 && this.affordFree(CFG.BUILDINGS.dock.train[key].cost)) Bld.train(dock, key);
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
        const seam = ctx.openSeam;
        if (!seam) return 1.5;
        return Math.max(0.5, 3 + Math.min(5, seam.width) - (seam.def || 0) * 1.5);
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
    // an OPPORTUNISTIC plan is left to run (its own evaluation rotates it); a GRIND
    // is re-checked below so it can break off IF a real opening finally appears.
    if (ai.camp.strat && !ai.camp.grind) return;
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
    for (const k of pool) { const s = this._campScore(k, ctx) + G.rand() * 1.2; if (s > best) { best = s; strat = k; } }
    if (!strat) return;
    // ESCAPE HATCH: already grinding — only break off for a GENUINE new opening
    // (a different plan that now clears the threshold), else keep battering.
    if (ai.camp.strat && ai.camp.grind) {
      if (best >= this.CAMP_OPENING && strat !== ai.camp.strat) {
        ai.camp.strat = strat; ai.camp.grind = false; ai.camp.since = S.day; ai.camp.rounds = 0; ai.camp.baseBld = Bld.list('P').length;
        G.log(this.CAMPAIGN_CRY[strat], true);
      }
      return;
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
      case 'TIDEWRACK': return Units.count('A', u => Units.isTransport(u)) >= 1 && infantry >= 3;
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
    // EVALUATE a finished round (its deadline has passed). PROGRESS = razed a
    // building OR knocked ≥10% off the player's walls/towers (so a siege line that's
    // steadily chewing stone counts as working). An OPPORTUNISTIC plan that made
    // progress stands down (the way's proven); two dry rounds → rotate to the
    // next-best fit. A GRIND never rotates — it keeps battering (campaignSelect's
    // escape hatch is the only thing that pulls it off, and only for a real opening).
    if (camp.rounds > 0 && S.day >= (camp.roundEnd || 0)) {
      if (!camp.grind) {
        const razed = Bld.list('P').length < (camp.roundBaseBld != null ? camp.roundBaseBld : 1e9);
        const chipped = camp.roundBaseHp != null && this._foeFortHp() < camp.roundBaseHp * 0.9;
        if (razed || chipped) { camp.tried = []; camp.strat = null; return false; }
        if (camp.rounds >= 2) { camp.tried.push(strat); camp.strat = null; return false; }
      }
      // grind: fall through and mount another round
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
    if (S.units.some(u => u.owner === 'A' && u.task && u.task.type === 'raid')) return true;
    if (!this.campaignReady(strat)) return true;
    if (this._launchCampRaid(read, strat)) startRound();
    return true;
  },

  // commit the relevant host (siege for IRONBELLY, towers for HIGHREACH, everyone for
  // WARHORN) at the softest wall segment, via the ordinary raid machinery
  _launchCampRaid(read, strat) {
    const ai = S.ai, ctx = this.probeAssault(read) || {};
    const seam = ctx.wallSeam || (ctx.siegeWall && { x: ctx.siegeWall.x, y: ctx.siegeWall.y }) || read.knownTC;
    const withTowers = strat === 'HIGHREACH';
    const party = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
      (withTowers || u.kind !== 'siegetower') && !(u.task && u.task.type === 'raid'));
    if (party.length < 3) return false;
    const laneKey = (ctx.lane && ctx.lane.key) || strat;
    for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; u.probe = false; u.raidLane = laneKey; u.raidObj = null; u.defend = false; }
    ai.raidObj = { type: 'tc', x: seam.x, y: seam.y, lane: laneKey };
    ai.raidLane = laneKey; ai.raidN = party.length; ai.raidDay = S.day;
    ai.raidFoeBld = Bld.list('P').length;
    if (ai.memory) ai.memory.wallHit = 0;
    ai.raidCd = Math.max(4, Math.round(this.persona().raidCd));
    G.log(this.CAMPAIGN_CRY[strat], true);
    return true;
  },

  // MUDLARK's spade: bridge the water / clear the woods / mound the shallows on the
  // frontier tile nearest the player, so each day's work extends ONE connected lane.
  breachToPlayer(read, reach) {
    const ai = S.ai;
    if (Units.sapperTier('A') < 2) return false;
    const idle = S.units.find(u => u.owner === 'A' && u.kind === 'sapper' && (!u.task || u.task.type === 'move'));
    if (!idle) return false;
    const ctx = this.probeAssault(read, reach);
    const b = ctx && ctx.breach; if (!b) return false;
    const t = S.map.terrain[MapGen.idx(b.x, b.y)], water = (t === T.WATER || t === T.MOAT), tier = Units.sapperTier('A');
    let mode = null;
    if (water && Terraform.bridgeable(b.x, b.y) && !Bld.bridgeAt(b.x, b.y)) mode = 'bridge';
    else if (tier >= 3 && Terraform.isClearable(b.x, b.y)) mode = 'clear';
    else if (tier >= 3 && water && Terraform.isMoundable(b.x, b.y, 'A') && Bld.canAfford(CFG.TERRAFORM.moundCost, ai.res)) mode = 'mound';
    if (!mode) return false;
    if (Units.assignTerraform(idle, b.x, b.y, mode)) { this._escort(idle); return true; }
    return false;
  },

  // TIDEWRACK's landing: load troops into the transports and sail for the player's
  // shore (warships screen). Troops resume the assault the moment they hit the beach.
  _launchAmphib(read) {
    const ai = S.ai, ptc = read.knownTC, ctx = this.probeAssault(read);
    if (!ptc || !ctx || !ctx.shore || !ctx.shore.land) return false;
    const land = ctx.shore.land;
    const transports = S.units.filter(u => u.owner === 'A' && Units.isTransport(u) && (!u.cargo || !u.cargo.length) && !(u.task && u.task.type === 'unload'));
    if (!transports.length) return false;
    const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) &&
      u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
    if (troops.length < 3) return false;
    let ti = 0, sailed = 0;
    for (const tr of transports) {
      const cap = Units.cargoCap(tr); tr.cargo = tr.cargo || [];
      let n = 0;
      while (n < cap && ti < troops.length) {
        const u = troops[ti++];
        u.raidObj = { type: 'tc', x: ptc.x, y: ptc.y };   // resume the assault when they land
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
    ai.raidObj = { type: 'tc', x: ptc.x, y: ptc.y }; ai.raidLane = 'TIDEWRACK'; ai.raidN = troops.length; ai.raidDay = S.day;
    G.log(this.CAMPAIGN_CRY.TIDEWRACK, true);
    return true;
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

    // small base income so the AI never fully stalls (scaled by difficulty).
    // A boom-opening chief works the fields harder in the first minutes.
    const op = ai.opening || {};
    const boomMult = op.bias === 'boom' && S.day <= (op.until || 0)
      ? (op.fired ? 1.2 : 1.08) : 1;
    ai.res.food += 3 * m.aiOutput * boomMult;
    ai.res.wood += 3 * m.aiOutput * boomMult;
    ai.res.stone += 1 * m.aiOutput * boomMult;
    ai.res.gold += 4 * m.aiOutput;   // the AI has no worker mechanic, so gold trickles here
    Bld.dailyProduction('A');

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
    if (ai.goal && (tc.level >= 3 || tc.upgrading || S.day > ai.goal.until)) ai.goal = null;
    if (!ai.goal && tc.level < 3 && !tc.upgrading && S.day > P.tcDays[tc.level - 1])
      ai.goal = { cost: CFG.BUILDINGS.tc.levels[tc.level].cost, until: S.day + 20 };
    const didSafety = this.digAndProtect(read);
    if (!didSafety && S.day % (m.aiBuildEvery || 2) === 0) this.bestBuild(read);
    this.trainForces(m, read);
    // SAPPERS: first priority is breaching where a raid party is stuck — clear the
    // woods or bridge the water so the assault gets through — then defensive moats
    // and offensive breaches
    this.breachStall(read);
    this.terraform(read);

    /* ---- townsfolk: a living village. A few villagers walk the lanes,
       staffing the town in spirit — killable, worth raiding, and slowly
       replaced. No more empty ghost towns. ---- */
    if (Units.count('A', u => Units.isVillager(u)) < 2 + tc.level &&
        ai.res.food >= 60 && G.rand() < 0.5) {
      const spot = MapGen.findNear(tc.x, tc.y + Bld.size(tc.key), 4, (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
      if (spot) { ai.res.food -= 50; Units.spawn('villager', 'A', spot.x, spot.y); }
    }

    /* ---- SCOUTING: the rival is blind beyond its own eyes, so it must go
       LOOK. When it hasn't found the player's town — or its memory of it has
       gone stale — it dispatches a probe toward the far unknown (or toward
       where the player was last seen) to refresh what it knows. It won't
       strip its home guard to do it: a spare rider goes first, else a
       villager, and only a spare soldier if there are several to spare. ---- */
    const scout = ai.scoutId && S.units.find(u => u.id === ai.scoutId);
    if (!scout || !(scout.task && scout.task.type === 'move')) ai.scoutId = 0;
    const kTC = read.knownTC;
    const needScout = !kTC || (S.day - (kTC.seen || 0) > 40);
    if (needScout && !ai.scoutId && !read.underThreat) {
      const dst = kTC || this.scoutTarget();
      const busy = u => u.tUnit || u.tBld || (u.task && (u.task.type === 'raid' || u.task.type === 'move'));
      const spares = S.units.filter(u => u.owner === 'A' && !Units.isNaval(u) && !busy(u));
      const soldiers = spares.filter(u => Units.isMilitary(u) && u.kind !== 'siegetower');
      const pick = soldiers.find(u => u.kind === 'rider' || u.kind === 'horsearcher')
        || spares.find(u => Units.isVillager(u))
        || (soldiers.length >= 3 ? soldiers[0] : null);
      if (dst && pick) {
        const spot = MapGen.findNear(dst.x, dst.y, 5, (x, y) => Path.passable(x, y, 'A')) || dst;
        pick.task = { type: 'move', x: spot.x, y: spot.y };
        pick.anchor = { x: spot.x + 0.5, y: spot.y + 0.5 };
        Units.setPath(pick, spot.x, spot.y);
        ai.scoutId = pick.id;
      }
    }

    /* ---- raids: launch when strong, RETREAT when it goes wrong. A party
       cut below a third of its strength (or bogged down for 8+ days) breaks
       off and marches home to fight another day. And a long stalemate makes
       any chief bolder — the power bar to raid decays slowly after day 90,
       so a turtled game still ends in fire and iron. ---- */
    const mem = ai.memory || (ai.memory = { wallStop: false, wallHit: 0 });
    if (!mem.laneDef) mem.laneDef = {};
    const raiders = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid');
    if (raiders.length) {
      const tooFew = ai.raidN && raiders.length <= Math.max(1, Math.floor(ai.raidN * 0.35));
      const tooLong = ai.raidDay && S.day - ai.raidDay > 8;
      if (tooFew || tooLong) {
        // LAYER 5: learn from how this raid went. Razing something means the
        // approach worked; stalling on walls means try the flank next time —
        // so the chief never suicides into the same wall twice.
        const razed = Bld.list('P').length < (ai.raidFoeBld || 1e9);
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
        ai.raidN = 0; ai.raidObj = null; ai.raidLane = null;
        if (tooFew) G.log('The rival war party breaks off and retreats!');
      }
    } else { ai.raidN = 0; ai.raidObj = null; ai.raidLane = null; }

    if (ai.raidCd > 0) ai.raidCd--;
    // SIEGE CAMPAIGN owns the attack decision when a named plan is live — it launches
    // its tailored assault (siege train / landing / escalade / breach / storm) or
    // deliberately HOLDS while it tools up, so the chief commits instead of throwing
    // an ordinary doomed raid at the same wall. Falls through to normal raids otherwise.
    const campOwns = this.campaignLaunch(read, m);
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
      P.raidPower - aggro * 0.5 - (read.foeVuln ? 0.35 : 0) - Math.max(0, S.day - 90) * 0.005);
    const dayFloor = read.foeVuln ? 12 : Math.max(16, m.aiRaidDay + P.raidDayAdd);
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
      const strong = push ? (mine >= 4 && mine > theirs * boldness)
        : (read.foeVuln || read.softCount > 0 || mine > theirs * boldness);
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
    if (!read.knownTC && !read.underThreat && ai.raidCd <= 0 && !raiders.length &&
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
          ai.raidLane = 'hunt'; ai.raidN = party.length; ai.raidDay = S.day;
          ai.raidFoeBld = Bld.list('P').length; mem.wallHit = 0;
          ai.raidCd = Math.max(6, Math.round(P.raidCd));
          G.log('⚔ The rival tribe marches out in force, hunting for your village!', true);
        }
      }
    }

    // Home guards hold their perimeter — the rival's Defend stance (Combat.acquire).
    // Only a committed raider marches free; everyone else defends the Town Center,
    // so the garrison can't be lured off across the map (as the player's can't).
    for (const u of S.units)
      if (u.owner === 'A' && Units.isMilitary(u)) u.defend = !(u.task && u.task.type === 'raid');
  },
};
