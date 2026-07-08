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

  // train toward the persona's army mix; advanced lines come with L3 halls
  trainArmy(m, want) {
    const P = this.persona();
    // siege-minded chiefs keep a catapult battery on top of the standing force
    if (P.mix.some(([k]) => k === 'catapult')) {
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
    let acc = 0, kind = P.mix[0][0];
    for (const [k, w] of P.mix) { acc += w; if (roll < acc + 1e-9) { kind = k; break; } }
    const HALL = { defender: 'barracks', axeman: 'barracks', elite: 'barracks',
                   archer: 'range', longbow: 'range', marksman: 'range',
                   rider: 'stable', horsearcher: 'stable', lancer: 'stable',
                   catapult: 'siege', ballista: 'siege' };
    const hallOf = k => S.buildings.find(bb => bb.owner === 'A' && bb.key === HALL[k] &&
      Bld.done(bb) && !bb.upgrading && bb.queue.length === 0);
    let b = hallOf(kind);
    if (!b) {
      // rolled a unit whose hall isn't up yet — fall back to any open hall
      for (const [k] of P.mix) { const alt = hallOf(k); if (alt) { kind = k; b = alt; break; } }
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

  daily() {
    const ai = S.ai;
    const m = G.modeCfg();
    const P = this.persona();
    const tc = Bld.tcOf('A');
    if (!tc) return;   // rival destroyed

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

    /* ---- savings goals: when the Town Center is due, the chief SAVES for
       it (other construction pauses) instead of the treasury dribbling away
       into huts forever. A goal that can't be met in 15 days is shelved so
       a broken economy never deadlocks on a dream. ---- */
    if (ai.goal) {
      if (tc.level >= 3 || tc.upgrading) ai.goal = null;
      else if (Bld.canUpgrade(tc).ok) { Bld.upgrade(tc); ai.goal = null; }
      else if (S.day > ai.goal.until) { ai.goal = null; ai.goalCd = S.day + 12; }
    }
    if (!ai.goal && tc.level < 3 && !tc.upgrading &&
        S.day > P.tcDays[tc.level - 1] && S.day >= (ai.goalCd || 0)) {
      ai.goal = { cost: CFG.BUILDINGS.tc.levels[tc.level].cost, until: S.day + 15 };
    }

    /* ---- protection floor with teeth: basic defense is not a personality
       trait, and it never loses the argument with the savings jar. A tribe
       past day 16 with no barracks builds one before anything else — the
       hall-upgrade reserve is suspended for the attempt (this was a real
       failure: wood-tight foragers saved for TC2 forever and fielded no
       army at all) ---- */
    if (S.day >= 16 && !S.buildings.some(b => b.owner === 'A' && b.key === 'barracks')) {
      const held = ai.goal;
      ai.goal = null;
      this.tryBuild('barracks');
      ai.goal = held;
    }

    /* ---- bottleneck economy: a chief starved of one resource for days
       digs out FIRST — builds the matching income building even if the
       persona's script never called for it (warlords learn to log too) ---- */
    ai.broke = ai.broke || {};
    let dugOut = false;
    for (const k of ['wood', 'stone', 'food']) {
      ai.broke[k] = ai.res[k] < 40 ? (ai.broke[k] || 0) + 1 : 0;
      if (ai.broke[k] >= 6 && !dugOut) {
        const bk = { wood: 'lumber', stone: 'quarry', food: 'farm' }[k];
        if (this.tryBuild(bk, true)) { ai.broke[k] = 0; dugOut = true; }
      }
    }

    /* ---- build at a difficulty-dependent tempo. Hard lessons encoded:
       (a) one unaffordable entry never stalls the order — skip and circle
       back; (b) anything prescribed but not standing (razed or skipped) is
       rebuilt by the backfill pass, so a sacked town recovers ---- */
    if (S.day % (m.aiBuildEvery || 2) === 0 && !dugOut) {
      let built = false;
      if (ai.orderI < P.order.length) {
        let key = P.order[ai.orderI];
        // the workshop waits for a great hall, same rule the player lives by
        if (key === 'siege' && tc.level < 3) key = null;
        if (key) {
          if (this.tryBuild(key)) { ai.orderI++; ai.stuck = 0; built = true; }
          else {
            ai.stuck = (ai.stuck || 0) + 1;
            if (ai.stuck >= 4) { ai.orderI++; ai.stuck = 0; }   // move on — backfill returns to it
          }
        }
      }
      if (!built) {
        // backfill: first prescribed-but-missing building it can afford
        const have = {};
        for (const b of S.buildings) if (b.owner === 'A') have[b.key] = (have[b.key] || 0) + 1;
        const want = {};
        for (let i2 = 0; i2 < Math.min(ai.orderI, P.order.length); i2++)
          want[P.order[i2]] = (want[P.order[i2]] || 0) + 1;
        for (const k in want) {
          if ((have[k] || 0) >= want[k]) continue;
          if (k === 'siege' && tc.level < 3) continue;
          if (this.tryBuild(k)) { built = true; break; }
        }
      }
      if (!built && ai.orderI >= P.order.length && !ai.goal) {
        const gk = this.growthKey();
        if (gk) built = this.tryBuild(gk);
      }
      if (!built && ai.orderI >= P.order.length && !ai.goal) {
        // town's grown for the day: upgrade —
        // weighted toward what wins fights, random enough to vary
        const ups = S.buildings.filter(b => b.owner === 'A' && b.key !== 'tc' && Bld.canUpgrade(b).ok);
        if (ups.length && G.rand() < 0.8) {
          const prio = { barracks: 3, range: 3, stable: 3, tower: 2, siege: 2, dock: 2 };
          ups.sort((a, b2) => ((prio[b2.key] || 1) - (prio[a.key] || 1)) + (G.rand() - 0.5));
          Bld.upgrade(ups[0]);
        }
      }
    }

    // the town center upgrades the moment its savings goal is met (handled
    // above) — but also opportunistically whenever it's simply affordable
    if (tc.level < 3 && !tc.upgrading && S.day > P.tcDays[tc.level - 1] && Bld.canUpgrade(tc).ok) {
      Bld.upgrade(tc);
      ai.goal = null;
    }

    // the mason walls the town in (never out of the savings jar)
    if (P.walls && !ai.goal) this.maybeWalls(tc);

    // put to sea: a dock when water allows, then boats and warships. Boats
    // are income and always allowed; warships wait their turn behind savings.
    if (tc.level >= P.dockTC && !S.buildings.some(b => b.owner === 'A' && b.key === 'dock')) {
      if (Bld.canAfford(CFG.BUILDINGS.dock.levels[0].cost, ai.res)) {
        const site = MapGen.findNear(tc.x, tc.y, 8, (x, y) => Bld.dockSiteOk(x, y, 'A').ok);
        if (site && Bld.canPlace('A', 'dock', site.x, site.y).ok)
          Bld.place('A', 'dock', site.x, site.y);
      }
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

    // keep a standing force shaped by the persona; a rich tribe drills two
    // recruits a day instead of always one. The cap is a starting line, not
    // a ceiling: it grows with the game clock so a day-150 rival fields a
    // day-150 army, not a day-30 one.
    const capNow = Math.min(Math.round((m.aiArmyCap || 8) * 2.5),
      (m.aiArmyCap || 8) + Math.floor(Math.max(0, S.day - 60) / 15));
    const want = Math.min(2 + Math.floor(S.day / (m.aiArmyDiv || 8)), capNow);
    if (this.trainArmy(m, want) && ai.res.food > 400 && ai.res.gold > 80) this.trainArmy(m, want);

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
    const raiders = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid');
    if (raiders.length) {
      const tooFew = ai.raidN && raiders.length <= Math.max(1, Math.floor(ai.raidN * 0.35));
      const tooLong = ai.raidDay && S.day - ai.raidDay > 8;
      if (tooFew || tooLong) {
        for (const u of raiders) {
          u.task = { type: 'move', x: tc.x, y: tc.y + 2 };
          u.tUnit = 0; u.tBld = 0;
          u.anchor = { x: tc.x + 0.5, y: tc.y + 2.5 };
          Units.setPath(u, tc.x, tc.y + 2);
        }
        ai.raidN = 0;
        if (tooFew) G.log('The rival war party breaks off and retreats!');
      }
    } else ai.raidN = 0;

    if (ai.raidCd > 0) ai.raidCd--;
    const mine = this.power('A'), theirs = this.power('P');
    const openRaid = ai.opening && ai.opening.bias === 'raid' && ai.opening.fired;
    const raidDay = Math.max(16, m.aiRaidDay + P.raidDayAdd - (openRaid ? 6 : 0));
    const boldness = Math.max(1.0,
      P.raidPower - (openRaid ? 0.12 : 0) - Math.max(0, S.day - 90) * 0.005);
    if (S.day >= raidDay && ai.raidCd <= 0 && mine >= 4 && mine > theirs * boldness && !raiders.length) {
      const troops = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) &&
        !Units.isNaval(u) && u.kind !== 'siegetower' && !(u.task && u.task.type === 'raid'));
      const party = troops.slice(0, Math.ceil(troops.length * P.raidShare));
      if (party.length >= 3) {
        for (const u of party) { u.task = { type: 'raid' }; u.tUnit = 0; u.tBld = 0; }
        ai.raidCd = P.raidCd;
        ai.raidN = party.length;
        ai.raidDay = S.day;
        G.log('⚔ The rival tribe marches on your village!', true);
      }
    }
  },
};
