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
    const rMax = P.walls ? 4 : 7;   // wall-builders keep the town inside the ring
    const free = (x, y) => Bld.tileFree(x, y) && Math.hypot(x - tc.x, y - tc.y) >= 2;
    const d = CFG.BUILDINGS[key];
    if (d && d.near) {
      // hunt the bonus terrain: best-scoring free tile near town
      let best = null, bs = -1;
      for (let dy = -rMax; dy <= rMax; dy++) for (let dx = -rMax; dx <= rMax; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (!MapGen.inB(x, y) || !free(x, y)) continue;
        let bonus = 0;
        const r = d.near.radius;
        for (let oy = -r; oy <= r && !bonus; oy++) for (let ox = -r; ox <= r; ox++)
          if (MapGen.inB(x + ox, y + oy) && S.map.terrain[MapGen.idx(x + ox, y + oy)] === d.near.terrain) { bonus = 1; break; }
        const s = bonus * 10 - Math.hypot(dx, dy) * 0.4 + G.rand();
        if (s > bs) { bs = s; best = { x, y }; }
      }
      return best;
    }
    if (key === 'tower') {
      // watchtowers face the likely threat — the player's town
      const ptc = Bld.tcOf('P');
      const ang = ptc ? Math.atan2(ptc.y - tc.y, ptc.x - tc.x) + (G.rand() - 0.5) * 1.2
                      : G.rand() * Math.PI * 2;
      const dist = 3 + G.rand() * Math.max(1, rMax - 3);
      const spot = MapGen.findNear(Math.round(tc.x + Math.cos(ang) * dist),
                                   Math.round(tc.y + Math.sin(ang) * dist), 3, free);
      if (spot) return spot;
    }
    for (let tries = 0; tries < 12; tries++) {
      const ang = G.rand() * Math.PI * 2, dist = 2 + G.rand() * (rMax - 2);
      const spot = MapGen.findNear(Math.round(tc.x + Math.cos(ang) * dist),
                                   Math.round(tc.y + Math.sin(ang) * dist), 2, free);
      if (spot) return spot;
    }
    // crowded town (a full wall ring, a tight peninsula): spill outward
    // rather than never building again
    return MapGen.findNear(tc.x, tc.y, rMax, free) ||
           MapGen.findNear(tc.x, tc.y, rMax + 4, free);
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

  // the mason rings the town in walls, two gates, a few sections a day
  maybeWalls(tc) {
    if (S.day < 22 || S.ai.res.wood < 80) return;
    if (!S.ai.wallPlan) {
      const R = 5, plan = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== R) continue;
        plan.push({ x: tc.x + dx, y: tc.y + dy, gate: dx === 0 && Math.abs(dy) === R });
      }
      S.ai.wallPlan = plan;
    }
    let placed = 0;
    for (const t of S.ai.wallPlan) {
      if (placed >= 2) break;
      if (!MapGen.inB(t.x, t.y) || Bld.at(t.x, t.y)) continue;
      const key = t.gate ? 'gate' : 'wall';
      if (!Bld.canPlace('A', key, t.x, t.y).ok) continue;
      Bld.place('A', key, t.x, t.y);
      placed++;
    }
  },

  // train toward a mix (defaults to the persona's; Layer 3 passes a
  // counter-weighted one); advanced lines come with L3 halls
  trainArmy(m, want, mix) {
    const P = this.persona();
    mix = mix || P.mix;
    // siege-minded chiefs keep a catapult battery on top of the standing force
    if (mix.some(([k]) => k === 'catapult')) {
      const wantCats = Math.max(1, Math.floor(want / 6));
      if (Units.count('A', u => u.kind === 'catapult') < wantCats) {
        const ws = S.buildings.find(bb => bb.owner === 'A' && bb.key === 'siege' &&
          Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
        if (ws && Bld.train(ws, 'catapult')) return true;
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
     LAYER 1 — PERCEPTION.  Once a day the chief takes stock of the whole
     board and writes a compact "world read" into S.ai.read. The rest of
     the brain reasons about this read instead of re-scanning the map. The
     rival plays without fog, so reading the true board is cognition, not
     cheating. Everything here is pure measurement — no actions, no side
     effects beyond S.ai.read (and the optional debug overlay).
     =================================================================== */
  ECON_W: { food: 1, wood: 1, stone: 0.8, gold: 0.5 },
  econOf(res) {
    let e = 0; for (const k in this.ECON_W) e += (res[k] || 0) * this.ECON_W[k]; return e;
  },
  assess() {
    const ai = S.ai;
    const tc = Bld.tcOf('A'), ptc = Bld.tcOf('P');
    const prevFoe = (ai.read && ai.read.foePower) || 0;
    const myPower = this.power('A'), foePower = this.power('P');

    // --- player army & where it is (the vulnerability read) ---
    let foeHome = 0, foeAway = 0, foeCav = 0, foeArch = 0, foeSiege = 0, foeMelee = 0;
    const pcx = ptc ? Bld.cx(ptc) : CFG.W / 2, pcy = ptc ? Bld.cy(ptc) : CFG.H / 2;
    for (const u of S.units) {
      if (u.owner !== 'P' || !Units.isMilitary(u) || Units.isNaval(u)) continue;
      (Math.hypot(u.x - pcx, u.y - pcy) <= 12 ? foeHome++ : foeAway++, 0);
      const k = u.kind;
      if (k === 'rider' || k === 'horsearcher' || k === 'lancer') foeCav++;
      else if (k === 'archer' || k === 'longbow' || k === 'marksman') foeArch++;
      else if (Units.isSiege(u) || k === 'ballista') foeSiege++;
      else foeMelee++;
    }

    // --- player defenses around the hall, and the weakest flank ---
    let foeWall = 0, foeTower = 0, weakFlank = null;
    if (ptc) {
      let worst = 1e9;
      for (const b of S.buildings) {
        if (b.owner !== 'P' || !Bld.done(b)) continue;
        const dd = Math.hypot(Bld.cx(b) - pcx, Bld.cy(b) - pcy);
        if (dd > 14) continue;
        if (b.key === 'wall' || b.key === 'gate') foeWall++;
        else if (b.key === 'tower') foeTower += Bld.lv(b).atk || 0;
      }
      for (let a = 0; a < 8; a++) {
        const ang = a / 8 * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
        let def = 0;
        for (const b of S.buildings) {
          if (b.owner !== 'P' || (b.key !== 'wall' && b.key !== 'gate' && b.key !== 'tower')) continue;
          const bx = Bld.cx(b) - pcx, by = Bld.cy(b) - pcy, dist = Math.hypot(bx, by);
          if (dist < 2 || dist > 12) continue;
          if ((bx * dx + by * dy) / dist > 0.45) def += b.key === 'tower' ? 2 : 1;
        }
        if (def < worst) { worst = def; weakFlank = { x: Math.round(pcx + dx * 8), y: Math.round(pcy + dy * 8), dx, dy, def }; }
      }
    }

    // --- player economic exposure: soft, undefended targets worth raiding ---
    const exposed = [];
    const guarded = (x, y) => S.buildings.some(t => t.owner === 'P' && t.key === 'tower' &&
      Bld.done(t) && Math.hypot(Bld.cx(t) - x, Bld.cy(t) - y) <= 6);
    for (const b of S.buildings) {
      if (b.owner !== 'P' || !Bld.done(b) || !Bld.def(b.key).needsWorker) continue;
      if (!guarded(Bld.cx(b), Bld.cy(b)))
        exposed.push({ x: Bld.cx(b), y: Bld.cy(b), id: b.id, kind: b.key, bld: true });
    }
    for (const u of S.units) {
      if (u.owner !== 'P' || !Units.isVillager(u)) continue;
      if (Math.hypot(u.x - pcx, u.y - pcy) < 8) continue;                     // homebodies aren't exposed
      if (S.units.some(s => s.owner === 'P' && Units.isMilitary(s) && Math.hypot(s.x - u.x, s.y - u.y) < 6)) continue;   // escorted
      exposed.push({ x: u.x, y: u.y, id: u.id, kind: 'villager', villager: true });
    }

    // --- threat at my own hall right now ---
    let threat = 0;
    if (tc) {
      const mcx = Bld.cx(tc), mcy = Bld.cy(tc);
      for (const u of S.units) {
        if (Units.isNaval(u) || Math.hypot(u.x - mcx, u.y - mcy) > 11) continue;
        if ((u.owner === 'P' && Units.isMilitary(u)) || (u.owner === 'R' && !Units.isTransport(u)))
          threat += (u.kind === 'elite' || u.kind === 'lancer' || u.kind === 'brute') ? 2 : 1;
      }
    }

    // --- economies (full-knowledge: the player's treasury is in S.res) ---
    const myEcon = this.econOf(ai.res), foeEcon = this.econOf(S.res);
    const myBld = Bld.list('A').length, foeBld = Bld.list('P').length;
    const underCon = Bld.list('A').filter(b => !Bld.done(b)).length;
    ai.peakBld = Math.max(ai.peakBld || 0, myBld);   // to notice a sacking (→ REBUILD)

    // vulnerability window: the player's home is thin (army committed away or
    // tiny) OR two-plus soft targets sit undefended
    const foeVuln = (foePower >= 2 && foeHome * 1.5 < foePower) || exposed.length >= 2;

    ai.read = {
      day: S.day,
      myPower, foePower, powerRatio: myPower / Math.max(1, foePower),
      foeTrend: foePower > prevFoe + 1 ? 1 : foePower < prevFoe - 1 ? -1 : 0,
      foeHome, foeAway, foeVuln,
      foeWall, foeTower, weakFlank,
      foeCav, foeArch, foeSiege, foeMelee,
      foeCavHeavy: foeCav >= 2 && foeCav >= foeArch && foeCav >= foeMelee,
      foeArchHeavy: foeArch >= 2 && foeArch > foeCav && foeArch >= foeMelee,
      foeSiegeSeen: foeSiege > 0,
      exposed, softCount: exposed.length,
      myEcon, foeEcon, econEdge: myEcon - foeEcon,
      myBld, foeBld, underCon,
      aheadPower: myPower - foePower,
      aheadTempo: myBld - foeBld,
      threat, underThreat: threat >= 3,
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
    const ai = S.ai, r = ai.read, pl = this.plan();
    let want = this.arcPosture(pl, S.day);          // the persona's game-plan by default
    // --- the read overrides the plan when the board demands ---
    if (r.sacked) want = 'REBUILD';
    else if (r.underThreat && r.threat > this._homeGuard()) want = 'DEFEND';
    else if (r.foeVuln && r.myPower >= 3 && r.powerRatio >= 1.05 - pl.aggression * 0.35)
      want = pl.aggression >= 0.6 ? 'PUSH' : 'PRESSURE';     // a real opening — take it
    else if (r.powerRatio >= 1.7 && r.myPower >= 5) want = 'PUSH';    // clearly ahead, end it
    else if (r.powerRatio < 0.65 && r.foePower >= 4) want = 'DEFEND'; // clearly behind, dig in
    else if (r.econEdge < -180 && r.threat === 0 && !r.foeVuln && pl.win === 'economy') want = 'EXPAND';
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
    catapult: 'siege', ballista: 'siege' },

  // re-weight the army mix toward the hard counters the read calls for
  counterMix(mix, read) {
    const out = mix.map(([k, w]) => {
      let x = w;
      if (read.foeCavHeavy && (k === 'defender' || k === 'archer' || k === 'longbow' || k === 'elite')) x *= 1.9;
      if (read.foeArchHeavy && (k === 'rider' || k === 'horsearcher' || k === 'lancer')) x *= 1.9;
      if (read.foeSiegeSeen && (k === 'rider' || k === 'horsearcher' || k === 'lancer')) x *= 1.4;
      return [k, x];
    });
    const tot = out.reduce((a, [, w]) => a + w, 0) || 1;
    return out.map(([k, w]) => [k, w / tot]);
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
    if (read.foeCavHeavy) wantHalls.add('range');
    if (read.foeArchHeavy) wantHalls.add('stable');
    for (const hall of wantHalls) {
      if (!hall || have[hall]) continue;
      if (hall === 'siege' && tc.level < 3) continue;
      let u = 48;
      if (post === 'CONSOLIDATE' || post === 'PUSH' || post === 'PRESSURE') u += 28;
      if (hall === 'range' && read.foeCavHeavy) u += 40;   // massed arrows/spears beat horse
      if (hall === 'stable' && read.foeArchHeavy) u += 40; // cavalry closes on archers
      add(u, () => this.tryBuild(hall));
    }

    // tower / walls (defense)
    add(16 + (P.walls ? 18 : 0) + (post === 'DEFEND' ? 40 : 0) - (have.tower || 0) * 5,
      () => this.tryBuild('tower'));
    if ((P.walls || post === 'DEFEND') && S.day >= 20)
      add((P.walls ? 30 : 12) + (post === 'DEFEND' ? 30 : 0), () => { this.maybeWalls(tc); return true; });

    // dock (naval)
    if (tc.level >= P.dockTC && !have.dock) add(pl.win === 'naval' ? 55 : 14, () => this._buildDock());

    // houses (AI ignores pop cap — just a lived-in look)
    add(9 + (post === 'EXPAND' ? 5 : 0) - (have.house || 0) * 2, () => this.tryBuild('house'));

    // Town Center upgrade
    if (tc.level < 3 && !tc.upgrading && Bld.canUpgrade(tc).ok) {
      let u = S.day > P.tcDays[tc.level - 1] ? 66 : 18;
      if (post === 'EXPAND') u += 18;
      if (read.underThreat) u -= 45;
      add(u, () => { Bld.upgrade(tc); return true; });
    }

    // upgrade a standing building (stronger units / stouter defense)
    const ups = Bld.list('A').filter(b => b.key !== 'tc' && Bld.canUpgrade(b).ok);
    if (ups.length) {
      const prio = { barracks: 3, range: 3, stable: 3, siege: 2, tower: 2, dock: 2 };
      ups.sort((a, b2) => (prio[b2.key] || 1) - (prio[a.key] || 1));
      const b = ups[0];
      add(24 + (prio[b.key] || 1) * 6 + (post === 'PUSH' ? 18 : 0) - (post === 'EXPAND' ? 10 : 0),
        () => Bld.upgrade(b));
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
    const ai = S.ai, atc = Bld.tcOf('A'), ptc = Bld.tcOf('P');
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
    const r = S.ai.read, P = this.persona();
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
    ].join('\n');
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

    /* ---- VARIABLE OPENINGS, early behaviors (first minutes only) ---- */
    if (op.bias === 'scout' && op.fired && !op.scoutDone && S.day >= 2) {
      // the horselord's rider goes to look at YOUR camp — eyes, then hooves
      const rider = S.units.find(u => u.owner === 'A' &&
        (u.kind === 'rider' || u.kind === 'horsearcher') && !u.tUnit && !u.tBld);
      const ptc = Bld.tcOf('P');
      if (rider && ptc) {
        op.scoutDone = true;
        const spot = MapGen.findNear(ptc.x, ptc.y + 4, 5, (x, y) => Path.passable(x, y, 'A'));
        if (spot) { rider.task = { type: 'move', x: spot.x, y: spot.y }; Units.setPath(rider, spot.x, spot.y); }
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

    /* ---- townsfolk: a living village. A few villagers walk the lanes,
       staffing the town in spirit — killable, worth raiding, and slowly
       replaced. No more empty ghost towns. ---- */
    if (Units.count('A', u => Units.isVillager(u)) < 2 + tc.level &&
        ai.res.food >= 60 && G.rand() < 0.5) {
      const spot = MapGen.findNear(tc.x, tc.y + Bld.size(tc.key), 4, (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
      if (spot) { ai.res.food -= 50; Units.spawn('villager', 'A', spot.x, spot.y); }
    }

    /* ---- raids: launch when strong, RETREAT when it goes wrong. A party
       cut below a third of its strength (or bogged down for 8+ days) breaks
       off and marches home to fight another day. And a long stalemate makes
       any chief bolder — the power bar to raid decays slowly after day 90,
       so a turtled game still ends in fire and iron. ---- */
    const mem = ai.memory || (ai.memory = { wallStop: false, wallHit: 0 });
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
        for (const u of raiders) {
          u.task = { type: 'move', x: tc.x, y: tc.y + 2 };
          u.tUnit = 0; u.tBld = 0;
          u.anchor = { x: tc.x + 0.5, y: tc.y + 2.5 };
          Units.setPath(u, tc.x, tc.y + 2);
        }
        ai.raidN = 0; ai.raidObj = null;
        if (tooFew) G.log('The rival war party breaks off and retreats!');
      }
    } else { ai.raidN = 0; ai.raidObj = null; }

    if (ai.raidCd > 0) ai.raidCd--;
    /* ---- LAYER 2 drives IF we attack; the read drives WHEN. Only the
       attack postures march, and a real opening (foeVuln) beats any day
       timer — so the rival strikes an undefended player on the state of
       the board, not the calendar. PUSH masses a decisive force; PRESSURE
       sends a smaller party to pick off soft targets and retreat. ---- */
    const mine = this.power('A'), theirs = this.power('P');
    const pl = this.plan();
    const attackPosture = ai.posture === 'PUSH' || ai.posture === 'PRESSURE';
    const boldness = Math.max(0.85,
      P.raidPower - pl.aggression * 0.45 - (read.foeVuln ? 0.35 : 0) - Math.max(0, S.day - 90) * 0.005);
    const dayFloor = read.foeVuln ? 12 : Math.max(16, m.aiRaidDay + P.raidDayAdd);
    if (attackPosture && ai.raidCd <= 0 && !raiders.length && S.day >= dayFloor && mine >= 3) {
      const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
        !Units.isNaval(u) && u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
      const push = ai.posture === 'PUSH';
      const share = push ? Math.max(0.66, P.raidShare) : Math.min(0.5, P.raidShare);
      const need = push ? Math.max(4, Math.ceil(theirs * boldness) + 1) : 3;
      const strong = push ? (mine >= 4 && mine > theirs * boldness)
        : (read.foeVuln || read.softCount > 0 || mine > theirs * boldness);
      if (strong && troops.length >= need) {
        const party = troops.slice(0, Math.max(need, Math.ceil(troops.length * share)));
        for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; }
        // LAYER 4: give the party a shared objective and start fresh memory
        ai.raidObj = this.chooseRaidObj(read, push);
        ai.raidFoeBld = Bld.list('P').length;
        mem.wallHit = 0;
        ai.raidCd = push ? P.raidCd : Math.max(6, P.raidCd - 4);
        ai.raidN = party.length;
        ai.raidDay = S.day;
        G.log(push ? '⚔ The rival tribe masses and marches on your village!'
          : '⚔ A rival raiding party rides out!', true);
      }
    }
  },
};
