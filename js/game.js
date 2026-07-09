"use strict";
/* Game state, main loop, day ticks, win/loss, save/load, boot. */

var S = null;   // the whole game state — plain data, JSON-serializable

const G = {
  autosave: null,
  autosaveT: 0,
  lastT: 0,

  // seeded runtime RNG (state lives in S so saves stay coherent)
  rand() {
    S.rngState = (S.rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(S.rngState ^ (S.rngState >>> 15), 1 | S.rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  modeCfg() { return CFG.MODES[S && S.mode] || CFG.MODES.moderate; },

  // game-start guarantee: the ground under a founding Town Center is made
  // buildable whatever the map rolled there — both tribes must always stand up
  clearFootprint(x, y, key) {
    const s = Bld.size(key);
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const i = MapGen.idx(x + dx, y + dy);
      if (!Bld.tileFree(x + dx, y + dy)) {
        S.map.terrain[i] = T.GRASS;
        if (S.map.resAmount) S.map.resAmount[i] = 0;
        S.map.seenTerrain[i] = T.GRASS;
      }
    }
  },

  /* ---- VARIABLE OPENINGS: the player's start package, rolled per game ----
     Weighted tendencies inside CFG.OPENING's bands — anti-correlated wealth
     (rich in one thing, lean in another), leaning AGAINST the map's scarce
     resource, rare extras, and a hard clamp so no roll is unwinnable. */
  rollStart(gen, mode, sp) {
    const O = CFG.OPENING;
    const keys = ['food', 'wood', 'stone', 'gold'];
    // villagers: band by difficulty, weighted toward the middle
    const [vLo, vHi] = O.villagers[mode] || O.villagers.moderate;
    let villagers = vLo + Math.round(((G.rand() + G.rand()) / 2) * (vHi - vLo));
    // resources: one axis runs rich, one runs lean — never all-high or all-low
    const rich = keys[(G.rand() * 4) | 0];
    let poor = keys[(G.rand() * 4) | 0];
    while (poor === rich) poor = keys[(G.rand() * 4) | 0];
    const res = {};
    for (const k of keys) {
      const [lo, hi] = O.res[k];
      const t = k === rich ? 0.62 + G.rand() * 0.38
        : k === poor ? G.rand() * 0.35
        : 0.2 + G.rand() * 0.6;
      res[k] = Math.round(lo + t * (hi - lo));
    }
    // lean AGAINST the map: the scarce resource gets a head start back
    if (res[gen.scarce] !== undefined) res[gen.scarce] += O.scarceLean;
    // a dry start (no water within reach) carries extra food
    let nearWater = false;
    sp = sp || gen.spawns.player;   // ORIGIN CARDS: the rival rolls a package too
    for (let dy = -8; dy <= 8 && !nearWater; dy++) for (let dx = -8; dx <= 8; dx++) {
      const x = sp.x + dx, y = sp.y + dy;
      if (MapGen.inB(x, y) && gen.terrain[MapGen.idx(x, y)] === T.WATER) { nearWater = true; break; }
    }
    if (!nearWater) res.food += O.dryLean;
    // extras: low odds each, almost never two
    const extras = [];
    for (const ex of O.extras) {
      if (G.rand() >= ex.p) continue;
      if (extras.length === 0) extras.push(ex.key);
      else if (extras.length === 1 && G.rand() < 0.2) extras.push(ex.key);
    }
    // CLAMP 1: the scarce pocket must be HARVESTABLE on foot — a flooded open
    // tile sitting next to it (the scarce terrain itself is now impassable, so
    // "reached" means "reachable to stand beside and work"). Else the package
    // carries the difference (a soft nudge, never a dead map).
    const scarceTerr = { wood: T.FOREST, stone: T.HILLS, food: T.FERTILE }[gen.scarce];
    let scarceReached = false;
    {
      const blocks = tt => tt === T.WATER || tt === T.MOUNTAIN ||
        tt === T.FOREST || tt === T.HILLS || tt === T.FERTILE;
      const seen = new Uint8Array(CFG.W * CFG.H);
      const q = [MapGen.idx(sp.x, sp.y)];
      seen[q[0]] = 1;
      let head = 0;
      while (head < q.length && !scarceReached) {
        const cur = q[head++], cx = cur % CFG.W, cy = (cur / CFG.W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!MapGen.inB(nx, ny)) continue;
          const ni = MapGen.idx(nx, ny);
          const tt = gen.terrain[ni];
          if (tt === scarceTerr) { scarceReached = true; break; }   // adjacent → harvestable
          if (seen[ni] || blocks(tt)) continue;                     // don't flood through obstacles
          seen[ni] = 1; q.push(ni);
        }
      }
      if (!scarceReached) res[gen.scarce] = (res[gen.scarce] || 0) + 60;
    }
    // CLAMP 2: a minimum effective economy — nudge the weakest axis up
    const econOf = () => res.food + res.wood + 0.8 * res.stone + 0.5 * res.gold +
      villagers * 90 + extras.length * 70;
    let nudged = false;
    if (econOf() < O.minEcon) {
      nudged = true;
      if (villagers < vHi) villagers++;
      if (econOf() < O.minEcon) res.food += Math.round(O.minEcon - econOf());
    }
    // arcade: a lean start is worth points at the end (see Score.compute)
    const B = CFG.START_RES;
    const baseline = B.food + B.wood + 0.8 * B.stone + 0.5 * B.gold + CFG.START_VILLAGERS * 90;
    const originBonus = Math.min(300, Math.max(0, Math.round((baseline - econOf()) / 20) * 10));
    // the one-line village origin, so the roll is legible
    const RICH = { food: 'well-fed', wood: 'timber-rich', stone: 'stone-laden', gold: 'gold-heavy' };
    const POOR = { food: 'hungry', wood: 'timber-poor', stone: 'stone-poor', gold: 'penniless' };
    const CREW = villagers <= 1 ? 'A lone family arrives' : villagers === 2 ? 'A small band arrives'
      : villagers >= 4 ? 'A strong caravan arrives' : 'Your people arrive';
    const EXTRA = { defender: ' — an old spearman walks with them', scout: ' — a rider scouts ahead',
      building: ' — earlier settlers left a workplace standing', cache: ' — and the land nearby is unusually rich' };
    const origin = `${CREW} ${RICH[rich]} but ${POOR[poor]}` +
      extras.map(e => EXTRA[e] || '').join('') + '.';
    return { villagers, res, extras, rich, poor, origin, originBonus,
             econ: Math.round(econOf()), nudged, scarceReached, nearWater };
  },

  newGame(seed, modeKey, sizeKey, persona) {
    const mode = CFG.MODES[modeKey] ? modeKey : 'moderate';
    const size = CFG.SIZES[sizeKey] ? sizeKey : 'medium';
    CFG.W = CFG.H = CFG.SIZES[size];
    const gen = MapGen.generate(seed, mode);
    S = {
      seed: String(seed),
      mode,
      sizeKey: size,
      rngState: hashSeed(String(seed)) | 0,
      day: 1, dayT: 0,
      paused: false, over: null,
      res: Object.assign({}, CFG.START_RES),
      wallLevel: 1,                         // village-wide fortification tier (all walls & gates)
      map: {
        W: CFG.W, H: CFG.H,
        terrain: gen.terrain,
        resAmount: gen.resAmount,
        fishStocked: true,                  // water tiles carry fish from generation

        scarce: gen.scarce,
        landform: gen.landform,
        decay: {},                          // idx -> day the depleted/ruined tile regrows to grass
        explored: new Array(CFG.W * CFG.H).fill(0),
        seenTerrain: gen.terrain.slice(),   // what the player last saw, per tile
        seenB: {},                          // last-seen buildings: idx -> {key, level, owner}
        spawns: gen.spawns,
      },
      buildings: [], units: [],
      garrison: [],                         // villagers sheltered inside the Town Center
      playtime: 0,                          // unpaused seconds, for save metadata
      // run stats — the raw material of the arcade score (js/score.js)
      stats: { trained: 0, razed: 0, gathered: 0, kills: 0, built: 0,
               walls: 0, upgrades: 0, peakPop: 0, krakenSlain: 0, dragonSeen: 0, originBonus: 0 },
      nextId: 1,
      wave: { next: CFG.MODES[mode].waveFirst, count: 0 },
      ai: null,
      boons: { P: {}, A: {} },   // ORIGIN CARDS: each side's kept-card modifiers
      log: [],
    };
    Bld._block = null;
    const p = gen.spawns.player;
    G.clearFootprint(p.x, p.y, 'tc');
    Bld.place('P', 'tc', p.x, p.y, { free: true, instant: true });
    this.reveal(p.x, p.y, 6);
    // VARIABLE OPENINGS: roll the start package (seeded — a seed reproduces it)
    const pk = this.rollStart(gen, mode, gen.spawns.player);
    S.res = pk.res;
    S.stats.originBonus = pk.originBonus;
    S.origin = pk.origin;
    for (let i = 0; i < pk.villagers; i++)
      Units.spawn('villager', 'P', p.x - 1 + (i % 4), p.y + 2 + (i / 4 | 0));
    for (const ex of pk.extras) this.applyStartExtra(ex, p, gen);
    // the rival rolls its own package (same bands), then ORIGIN CARDS deals
    // both hands: the rival keeps a card at once (the card IS its persona);
    // the player's hand waits in S.draft for the draft screen / Cards.pick
    const pkA = this.rollStart(gen, mode, gen.spawns.ai);
    AI.init(gen.spawns.ai, pkA);
    Cards.deal(pk, pkA, persona);
    S.opening = { player: pk,
      rival: { villagers: pkA.villagers, res: pkA.res, rich: pkA.rich, poor: pkA.poor,
               econ: pkA.econ, card: S.draft.rival.pick.key } };
    if (window.DEBUG_OPENINGS)
      console.log('[openings]', JSON.stringify(S.opening), '[draft]', JSON.stringify(S.draft));
    Units.spawnWild('deer', 8);
    Units.spawnWild('cow', 8);
    // the kraken's clock: each village is owed at most one visit, on a day
    // rolled from an early, middle, or late band — if its waters ever reach
    // the map's edge and its boats are out
    const kd = () => {
      const band = G.rand();
      return Math.round(band < 0.34 ? 20 + G.rand() * 30
        : band < 0.67 ? 60 + G.rand() * 40 : 100 + G.rand() * 50);
    };
    S.kraken = { day: { P: kd(), A: kd() }, done: {}, ev: null };
    // SPECIAL EVENT: the black dragon — Moderate/Hard only, most games never
    // roll it, and it waits for a dark hour at the player's gates
    S.dragon = { avail: mode !== 'calm' && G.rand() < CFG.DRAGON.chance,
                 done: false, ev: null, ash: [] };

    this.freeVis = false;   // every real game starts fogged; the title demo re-enables it
    this.vis = null;
    R.onNewGame();
    this.updateVisibility();
    UI.deselect();
    UI.placing = null;
    UI.builderFor = null;
    UI.settingRally = null;
    document.getElementById('btnPause').textContent = '⏸';
    // opening notes linger twice as long — there's a lot to take in on day 1
    const LAND = { valley: 'a green valley', lakeland: 'a land of lakes', highlands: 'rugged highlands', islands: 'a chain of islands' };
    this.log(`A new tribe settles ${LAND[gen.landform] || 'the wilds'} (${this.modeCfg().name}). Destroy the rival Town Center to win.`, false, 6400);
    this.log('🏕 ' + S.origin, false, 6400);
    this.log(`Scouts report: ${gen.scarce} is scarce in this valley — claim it before the rival does.`, true, 6400);
    this.log('First barbarian raids expected around day ' + S.wave.next, false, 6400);
  },

  // the rare start extras: a spearman, a scout, a standing workplace, a rich cache
  applyStartExtra(ex, p, gen) {
    const below = MapGen.findNear(p.x + 2, p.y + Bld.size('tc'), 4,
      (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: p.x, y: p.y + 3 };
    if (ex === 'defender') Units.spawn('defender', 'P', below.x, below.y);
    else if (ex === 'scout') Units.spawn('rider', 'P', below.x, below.y);
    else if (ex === 'building') {
      const key = gen.scarce === 'wood' ? 'lumber' : gen.scarce === 'stone' ? 'quarry' : 'farm';
      const spot = MapGen.findNear(p.x + 3, p.y + 1, 5, (x, y) => Bld.tileFree(x, y));
      if (spot) Bld.place('P', key, spot.x, spot.y, { free: true, instant: true, noAutoAssign: true });
    } else if (ex === 'cache') {
      const terr = { wood: T.FOREST, stone: T.HILLS, food: T.FERTILE }[gen.scarce] || T.FERTILE;
      const spot = MapGen.findNear(p.x - 3, p.y + 3, 5, (x, y) =>
        S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y));
      if (spot) {
        const i = MapGen.idx(spot.x, spot.y);
        S.map.terrain[i] = terr;
        S.map.resAmount[i] = 170;                  // heavy with fruit / timber / stone
        S.map.seenTerrain[i] = terr;
      }
    }
  },

  log(msg, warn, ms) {
    S.log.unshift({ day: S.day, msg });
    if (S.log.length > 60) S.log.pop();
    // game-event notes dedupe (repeat "under attack" spam collapses); the
    // full history always lands in the event log above
    UI.toast(msg, warn, ms, true);
  },

  reveal(cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      const x = cx + dx, y = cy + dy;
      if (MapGen.inB(x, y) && !S.map.explored[MapGen.idx(x, y)]) {
        S.map.explored[MapGen.idx(x, y)] = 1;
        R.fogDirty = true;
      }
    }
  },

  /* ---- three-state fog: black (unexplored), grey (remembered), clear (visible).
     Visibility comes from player buildings and units; while a tile is visible its
     last-seen memory (terrain + buildings) is kept in sync. ---- */
  vis: null,
  visT: 0,
  freeVis: false,   // title-screen demo world: no fog, the whole map on show
  visibleAt(x, y) {
    const i = MapGen.idx(x, y);
    return this.vis ? !!this.vis[i] : !!S.map.explored[i];
  },
  updateVisibility() {
    const W = CFG.W, H = CFG.H;
    if (!this.vis || this.vis.length !== W * H) this.vis = new Uint8Array(W * H);
    else this.vis.fill(0);
    const vis = this.vis, expl = S.map.explored;
    const mark = (cx, cy, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const x = cx + dx, y = cy + dy;
        if (!MapGen.inB(x, y)) continue;
        const i = MapGen.idx(x, y);
        vis[i] = 1;
        if (!expl[i]) { expl[i] = 1; }
      }
    };
    if (this.freeVis) {
      vis.fill(1);
      for (let i = 0; i < expl.length; i++) expl[i] = 1;
    } else {
      // a building lights up the land only once it's FINISHED — while a site
      // goes up the fog stays close, lit by the builder alone (the reward for
      // finishing is the wider view). Upgrades keep their current sight.
      for (const b of S.buildings)
        if (b.owner === 'P' && Bld.done(b)) mark(b.x, b.y, Bld.lv(b).vision || 4);
      for (const u of S.units)
        if (u.owner === 'P') mark(u.x | 0, u.y | 0, CFG.UNIT_VISION);
      // ORIGIN CARDS: the Seer's far-seeing eye never closes
      const sn = S.boons && S.boons.P && S.boons.P.seer;
      if (sn) mark(sn.x, sn.y, 3);
    }
    // sync last-seen memory on every visible tile
    const liveB = new Map();
    for (const b of S.buildings) {
      const bs = Bld.size(b.key);
      for (let dy = 0; dy < bs; dy++) for (let dx = 0; dx < bs; dx++)
        liveB.set(MapGen.idx(b.x + dx, b.y + dy), b);
    }
    for (let i = 0; i < W * H; i++) {
      if (!vis[i]) continue;
      if (S.map.seenTerrain[i] !== S.map.terrain[i]) {
        S.map.seenTerrain[i] = S.map.terrain[i];
        R.drawTileAt(i % W, (i / W) | 0);
      }
      const b = liveB.get(i);
      if (b) {
        // the memory ghost lives at the footprint's top-left tile
        const ti = MapGen.idx(b.x, b.y);
        const sb = S.map.seenB[ti];
        if (!sb || sb.key !== b.key || sb.level !== b.level)
          S.map.seenB[ti] = { key: b.key, level: b.level, owner: b.owner };
        if (i !== ti && S.map.seenB[i]) delete S.map.seenB[i];
      } else if (S.map.seenB[i]) delete S.map.seenB[i];
    }
    R.fogDirty = true;
  },

  // a freshly depleted or ruined tile greens over after RUIN_DECAY_DAYS, scaled
  // by what it is: felled forest / spent orchard take twice as long to come
  // back, quarried stone three times (rock is slowest of all); ruins as base.
  scheduleRevert(idx) {
    if (!S.map.decay) S.map.decay = {};
    const mult = CFG.REGROW_MULT[S.map.terrain[idx]] || 1;
    S.map.decay[idx] = S.day + CFG.RUIN_DECAY_DAYS * mult;
  },

  // a tile just became impassable (regrowth) — shove any unit standing on it to
  // the nearest open ground so nothing is ever trapped inside solid terrain
  pushOffBlocked(rx, ry) {
    for (const u of S.units) {
      if ((u.x | 0) !== rx || (u.y | 0) !== ry) continue;
      if (Units.isNaval(u)) continue;   // boats live on water; terrain regrowth is a land thing
      const spot = MapGen.findNear(rx, ry, 6, (x, y) => Path.passable(x, y, u.owner) && !Bld.blockAt(x, y));
      if (spot) {
        u.x = spot.x + 0.5; u.y = spot.y + 0.5;
        u.path = null; u.pathI = 0; u.task = null; u.tUnit = 0; u.tBld = 0;
        if (u.anchor) u.anchor = { x: u.x, y: u.y };
      }
    }
  },

  dayTick() {
    // victory and defeat come only through Town Centers falling (see Bld.damage)
    S.day++;
    // worked-out land recovers: stumps, pebbles and spent soil regrow into
    // their source terrain with a lean restock, so no resource is ever gone
    // for good — a starved player can always grind back, just slowly.
    // Ruins simply fade to grass.
    if (S.map.decay) {
      const SOURCE = { [T.STUMPS]: T.FOREST, [T.PEBBLES]: T.HILLS, [T.BARREN]: T.FERTILE };
      const scarceTerr = { wood: T.FOREST, stone: T.HILLS, food: T.FERTILE }[S.map.scarce];
      let regrown = false;
      for (const k in S.map.decay) {
        if (S.day < S.map.decay[k]) continue;
        const i = +k, t = S.map.terrain[i];
        const rx = i % CFG.W, ry = (i / CFG.W) | 0;
        if (SOURCE[t] !== undefined) {
          // regrowth RE-BLOCKS the tile. Never do it under a building (would trap
          // impassable terrain beneath it) — hold it a while longer. And if a unit
          // stands there, push it to the nearest open tile so nothing gets sealed in.
          if (Bld.at(rx, ry)) { S.map.decay[k] = S.day + 20; continue; }
          const src = SOURCE[t];
          const r = CFG.RES_AMOUNT[src];
          let amt = (r[0] + r[1]) / 2 * CFG.REGROW_FRACTION;
          if (src === scarceTerr) amt *= 0.6;      // the scarce resource stays lean
          S.map.terrain[i] = src;
          S.map.resAmount[i] = Math.round(amt);
          R.updateTile(rx, ry);
          this.pushOffBlocked(rx, ry);
          regrown = true;
        } else if (t === T.RUIN) {
          S.map.terrain[i] = T.GRASS;
          R.updateTile(i % CFG.W, (i / CFG.W) | 0);
        }
        delete S.map.decay[k];
      }
      if (regrown && !S.regrowSeen) {
        S.regrowSeen = true;
        this.log('🌱 Worked-out land recovers in time — old clearings and pits are worth working again');
      }
    }
    Bld.dailyProduction('P');
    Units.dailySpawns();
    if (window.Cards) Cards.seerWatch();   // ORIGIN CARDS: the Seer's forewarning
    Combat.maybeWave();
    AI.daily();
    // arcade tally: the tribe at its greatest
    if (S.stats) {
      const pop = S.units.reduce((n, u) => n + (u.owner === 'P' ? 1 : 0), 0) + S.garrison.length;
      if (pop > (S.stats.peakPop || 0)) S.stats.peakPop = pop;
    }

    // the kraken stirs: only where open water touches the map's edge, only
    // against a village with a fishing boat out, and only once per village
    if (S.kraken && !S.kraken.ev) {
      for (const ow of ['P', 'A']) {
        if (S.kraken.done[ow] || S.day < S.kraken.day[ow]) continue;
        let edge = false;
        for (let x = 0; x < CFG.W && !edge; x++)
          edge = S.map.terrain[MapGen.idx(x, 0)] === T.WATER || S.map.terrain[MapGen.idx(x, CFG.H - 1)] === T.WATER;
        for (let y = 0; y < CFG.H && !edge; y++)
          edge = S.map.terrain[MapGen.idx(0, y)] === T.WATER || S.map.terrain[MapGen.idx(CFG.W - 1, y)] === T.WATER;
        if (!edge) { S.kraken.done[ow] = true; continue; }   // landlocked waters — safe forever
        const boat = S.units.find(u => u.owner === ow && u.kind === 'fishboat');
        if (!boat) continue;                                  // it waits for a boat
        S.kraken.done[ow] = true;
        S.kraken.ev = { x: boat.x, y: boat.y, boatId: boat.id, owner: ow, phase: 'rise', t: 0 };
        if (ow === 'P') this.log('🐙 Something vast stirs beneath the water…', true);
        break;
      }
    }

    // the tribe endures: if every villager is dead (none on the map, none
    // sheltering, none in training), two survivors step out of the Town
    // Center — a wiped workforce is a setback, never a soft game-over
    {
      const tc = Bld.tcOf('P');
      if (tc && Bld.done(tc) &&
          !S.units.some(u => u.owner === 'P' && Units.isVillager(u)) &&
          S.garrison.length === 0 &&
          !tc.queue.some(q => q.unit === 'villager')) {
        for (let i = 0; i < 2; i++) {
          const spot = MapGen.findNear(tc.x, tc.y + Bld.size(tc.key), 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: tc.x, y: tc.y + Bld.size(tc.key) };
          Units.spawn('villager', 'P', spot.x, spot.y);
        }
        this.log('🛖 Two villagers emerge from the Town Center — the tribe endures', true);
      }
    }

    // cloud autosave cadence (Backend also drops a local crash-net snapshot);
    // the title demo never saves — it must not clobber a real crash net or slot
    if (window.Backend && Backend.autosaveDays > 0 &&
        !(window.Screens && Screens._demo) &&
        S.day - (Backend._lastAutosaveDay || 0) >= Backend.autosaveDays)
      Backend.autosaveNow('cadence');
  },

  // the kraken's three acts: rise under the boat, thrash (the fleet answers,
  // or doesn't), sink back into the deep. Real-time, a few seconds in all.
  krakenTick(dt) {
    const ev = S.kraken && S.kraken.ev;
    if (!ev) return;
    ev.t += dt;
    if (ev.phase === 'rise' && ev.t > 1.6) {
      const boat = Units.get(ev.boatId);
      if (boat) {
        Units.damage(boat, 99999, 0, 'K');
        if (ev.owner === 'P') this.log('🐙 A kraken drags your fishing boat under!', true);
        else if (G.visibleAt(ev.x | 0, ev.y | 0)) this.log('🐙 A kraken takes one of the rival\'s boats!');
      }
      ev.phase = 'thrash'; ev.t = 0;
    } else if (ev.phase === 'thrash' && ev.t > 2.2) {
      const ships = S.units.filter(u => u.owner === ev.owner &&
        (u.kind === 'warship' || u.kind === 'fireship') &&
        Math.hypot(u.x - ev.x, u.y - ev.y) <= 4.5);
      if (ships.length >= 2) {
        // two hulls together can beat it back — one barely stays afloat
        ships[0].hp = Math.max(8, Math.round(ships[0].maxhp * 0.15));
        if (ev.owner === 'P') {
          this.log('⚔ Your warships drive the kraken back into the deep — one barely afloat!');
          if (S.stats) S.stats.krakenSlain = 1;   // a tale worth 500 points
        }
      } else if (ships.length === 1) {
        Units.damage(ships[0], 99999, 0, 'K');
        if (ev.owner === 'P') this.log('🐙 The kraken wrecks your lone warship and slips beneath the waves!', true);
      } else if (ev.owner === 'P') {
        this.log('🐙 The kraken sinks back into the deep…', true);
      }
      ev.phase = 'sink'; ev.t = 0;
    } else if (ev.phase === 'sink' && ev.t > 1.6) {
      S.kraken.ev = null;
    }
  },

  /* ---- SPECIAL EVENT: the black dragon ----
     It owes the player nothing; it just likes fire. When an enemy army masses
     at the gates and the odds are stacked, it sweeps in from the horizon,
     burns the line to ash, and leaves. Once per game, if the game rolled it
     at all (Moderate/Hard, ~1 in 3.5). */
  maybeDragon() {
    const D = S.dragon;
    if (!D || !D.avail || D.done || D.ev || S.over) return;
    if (S.day < CFG.DRAGON.minDay) return;
    const tc = Bld.tcOf('P');
    if (!tc) return;
    const cx = Bld.cx(tc), cy = Bld.cy(tc);
    // "the army": rival soldiers and barbarian raiders alike
    const foes = S.units.filter(u => (u.owner === 'A' || u.owner === 'R') &&
      (Units.isMilitary(u) || u.owner === 'R') && !Units.isNaval(u) &&
      Math.hypot(u.x - cx, u.y - cy) < CFG.DRAGON.radius);
    if (foes.length < CFG.DRAGON.foesMin) return;
    const mine = S.units.reduce((n, u) => n + (u.owner === 'P' && Units.isMilitary(u) &&
      Math.hypot(u.x - cx, u.y - cy) < CFG.DRAGON.radius + 3 ? 1 : 0), 0);
    if (mine * 2 > foes.length) return;          // only when the hour is dark
    D.done = true;
    const mx = foes.reduce((a, u) => a + u.x, 0) / foes.length;
    const my = foes.reduce((a, u) => a + u.y, 0) / foes.length;
    const fromLeft = mx < CFG.W / 2;
    D.ev = { phase: 'fly', t: 0, x: fromLeft ? -3 : CFG.W + 3, y: my - 5,
             tx: mx, ty: my, dir: fromLeft ? 1 : -1,
             victims: foes.map(u => u.id) };
    this.log('🐉 A vast black shape crests the horizon…', true, 5200);
  },

  dragonTick(dt) {
    const D = S.dragon;
    if (!D) return;
    for (let i = (D.ash || []).length - 1; i >= 0; i--) {   // ash blows away
      D.ash[i].ttl -= dt;
      if (D.ash[i].ttl <= 0) D.ash.splice(i, 1);
    }
    const ev = D.ev;
    if (!ev) return;
    ev.t += dt;
    if (ev.phase === 'fly') {
      ev.x += ev.dir * 9 * dt;
      ev.y += (ev.ty - ev.y) * Math.min(1, dt * 1.6);
      if ((ev.dir > 0 && ev.x >= ev.tx - 2.5) || (ev.dir < 0 && ev.x <= ev.tx + 2.5)) {
        ev.phase = 'burn'; ev.t = 0;
        for (const id of ev.victims) { const u = Units.get(id); if (u) u.burnT = 1.6; }
        this.log('🐉 The dragon banks and BREATHES — the enemy line is a wall of fire!', true, 5200);
      }
    } else if (ev.phase === 'burn') {
      ev.x += ev.dir * 3.2 * dt;                  // a slow strafe along the line
      if (ev.t > 1.7) {
        for (const id of ev.victims) {
          const u = Units.get(id);
          if (!u) continue;
          D.ash.push({ x: u.x, y: u.y, ttl: 3 + G.rand() * 2 });
          S.units.splice(S.units.indexOf(u), 1);
          for (const o of S.units) if (o.tUnit === u.id) o.tUnit = 0;
          if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) UI.deselect();
        }
        S.stats.dragonSeen = 1;                   // worth points — and a story
        ev.phase = 'leave'; ev.t = 0;
        this.log('🐉 Where an army stood: piles of ash. It owes you nothing — it just likes fire.', false, 6400);
      }
    } else if (ev.phase === 'leave') {
      ev.x += ev.dir * 10 * dt;
      ev.y -= dt * 1.4;
      if (ev.x < -4 || ev.x > CFG.W + 4) D.ev = null;
    }
  },

  end(win, msg) {
    if (S.over) return;
    S.over = { win, msg };
    // the title screen's demo world ends quietly — the shell rolls a new one
    if (window.Screens && Screens._demo) return;
    S.paused = false;
    // the run is over: its save slot is stamped finished and the crash net
    // cleared — the title's Continue will not walk back into a told story
    if (window.Backend) Backend.finalizeRun();
    UI.showEnd(win, msg);
  },

  /* ---------------- save / load ---------------- */
  saveJSON() { S.v = CFG.SAVE_VERSION; return JSON.stringify(S); },
  loadJSON(json) {
    const data = JSON.parse(json);
    if (!data || !data.map || !Array.isArray(data.map.terrain))
      throw new Error('not a Clanfire save file');
    // version gate: anything below the current version flows through the
    // field-backfill migration below (that IS the migration path — every
    // legacy field gets a default), then plays on the current engine
    if ((data.v || 1) > CFG.SAVE_VERSION)
      throw new Error('save is from a newer version of the game');
    const w = data.map.W || 40, h = data.map.H || 40;
    if (data.map.terrain.length !== w * h)
      throw new Error('not a Clanfire save file');
    CFG.W = w; CFG.H = h;
    // size labels shifted a tier (old small/medium/large → medium/large/xlarge):
    // re-key old saves by their actual map width so the menu reads true
    if (!CFG.SIZES[data.sizeKey] || CFG.SIZES[data.sizeKey] !== w) {
      const match = Object.keys(CFG.SIZES).find(k => CFG.SIZES[k] === w);
      data.sizeKey = match || (w <= 34 ? 'medium' : w <= 45 ? 'large' : 'xlarge');
    }
    if (!data.wallLevel) data.wallLevel = 1;
    if (!data.map.resAmount) {
      // older save: give surviving resource tiles an average stock
      data.map.resAmount = data.map.terrain.map(t => {
        const r = CFG.RES_AMOUNT[t];
        return r ? Math.round((r[0] + r[1]) / 2) : 0;
      });
    }
    if (!data.garrison) data.garrison = [];
    if (data.ai && !data.ai.persona) data.ai.persona = 'homesteader';   // pre-persona save: the classic temperament
    if (!data.kraken) data.kraken = { day: { P: 60, A: 90 }, done: {}, ev: null };   // older saves owe the deep a visit too
    if (!data.dragon) data.dragon = { avail: false, done: true, ev: null, ash: [] };  // legacy runs: no dragon this time
    if (!data.origin) data.origin = 'An old tribe, from before the tellers kept count.';
    if (data.ai && !data.ai.opening) data.ai.opening = { bias: null, fired: false, until: 0 };
    if (!data.boons) data.boons = { P: {}, A: {} };   // pre-cards save: no boons in play
    if (!data.draft)                                   // pre-cards save: the draft is history
      data.draft = { hand: [], leanKeys: [], rival: { hand: [], pick: null }, intel: 'none', done: true, pickI: null };
    if (!data.playtime) data.playtime = 0;
    if (!data.stats) data.stats = {};
    for (const k of ['trained', 'razed', 'gathered', 'kills', 'built', 'walls',
                     'upgrades', 'peakPop', 'krakenSlain', 'dragonSeen', 'originBonus', 'leanIn'])
      if (!data.stats[k]) data.stats[k] = 0;
    if (!data.map.seenTerrain) data.map.seenTerrain = data.map.terrain.slice();
    if (!data.map.seenB) data.map.seenB = {};
    if (!data.map.decay) data.map.decay = {};
    if (!data.map.fishStocked) {
      // pre-dock save: stock its waters so fishing works after loading
      const fr = CFG.RES_AMOUNT[T.WATER];
      for (let i = 0; i < data.map.terrain.length; i++)
        if (data.map.terrain[i] === T.WATER && !data.map.resAmount[i])
          data.map.resAmount[i] = Math.round((fr[0] + fr[1]) / 2);
      data.map.fishStocked = true;
    }
    S = data;
    Bld._block = null;
    // a save caught mid-draft (belt and braces): the first card is kept
    if (S.draft && !S.draft.done && S.draft.hand && S.draft.hand.length && window.Cards)
      Cards.pick(0);
    // pre-2×2 saves: the Town Center now claims a 2×2 footprint — pull it
    // inside the map, nudge any building the grown footprint swallows, and
    // make the ground under it buildable
    for (const tc of S.buildings.filter(b => b.key === 'tc')) {
      const sz = Bld.size('tc');
      tc.x = Math.max(0, Math.min(tc.x, CFG.W - sz));
      tc.y = Math.max(0, Math.min(tc.y, CFG.H - sz));
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
        const x = tc.x + dx, y = tc.y + dy, i = MapGen.idx(x, y);
        const other = S.buildings.find(o => o !== tc && Bld.covers(o, x, y));
        if (other) {
          const spot = MapGen.findNear(x, y, 5, (nx, ny) => Bld.tileFree(nx, ny));
          if (spot) { other.x = spot.x; other.y = spot.y; }
          else S.buildings.splice(S.buildings.indexOf(other), 1);
        }
        const t = S.map.terrain[i];
        const buildable = t === T.GRASS || t === T.STUMPS ||
          t === T.PEBBLES || t === T.BARREN || t === T.RUIN;
        if (!buildable) {
          S.map.terrain[i] = T.GRASS;
          if (S.map.resAmount) S.map.resAmount[i] = 0;
          S.map.seenTerrain[i] = T.GRASS;
        }
      }
    }
    Bld._block = null;
    S.paused = true;
    document.getElementById('btnPause').textContent = '▶';
    UI.deselect();
    UI.placing = null;
    this.freeVis = false;
    this.vis = null;
    R.onNewGame();
    this.updateVisibility();
    if (S.over) UI.showEnd(S.over.win, S.over.msg);
  },

  /* ---------------- main loop ---------------- */
  frame(t) {
    const dt = Math.min(0.1, (t - G.lastT) / 1000 || 0.016);
    G.lastT = t;
    if (S && !S.paused && !S.over) {
      S.playtime = (S.playtime || 0) + dt;
      const dtDays = dt * 1000 / CFG.DAY_MS;
      S.dayT += dt * 1000;
      let guard = 0;
      while (S.dayT >= CFG.DAY_MS && guard++ < 4) {
        S.dayT -= CFG.DAY_MS;
        G.dayTick();
        if (!S || S.over) break;
      }
      if (S && !S.over) {
        Bld.update(dtDays);
        Units.update(dt);
        Combat.update(dt);
        G.krakenTick(dt);
        G.dragonTick(dt);
        G.dragonT = (G.dragonT || 0) - dt;
        if (G.dragonT <= 0) { G.dragonT = 1.3; G.maybeDragon(); }
        G.visT -= dt;
        if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
        G.autosaveT -= dt;
        if (G.autosaveT <= 0) { G.autosaveT = 10; G.autosave = G.saveJSON(); }
      }
    }
    if (S) {
      R.draw(dt);
      UI.refresh(dt);
    }
    requestAnimationFrame(G.frame);
  },
};

window.addEventListener('load', () => {
  R.init();
  UI.init();
  if (window.Assets) Assets.init();   // async; image art swaps in as it decodes
  if (window.Backend) {
    Backend.init();   // async; the game never waits on the network
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && window.S && !S.over &&
          !(window.Screens && Screens._demo)) Backend.autosaveNow('hide');
    });
  }
  Screens.init();
  Screens.show('title');   // builds the demo world behind the logo
  requestAnimationFrame(t => { G.lastT = t; requestAnimationFrame(G.frame); });
});
