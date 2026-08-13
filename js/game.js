"use strict";
/* Game state, main loop, day ticks, win/loss, save/load, boot. */

var S = null;   // the whole game state — plain data, JSON-serializable

const G = {
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

  newGame(seed, modeKey, sizeKey, persona, tunic) {
    const mode = CFG.MODES[modeKey] ? modeKey : 'moderate';
    const size = CFG.SIZES[sizeKey] ? sizeKey : 'medium';
    CFG.W = CFG.H = CFG.SIZES[size];
    const gen = MapGen.generate(seed, mode);
    // village tunic colours — your people vs the rival's, at a glance. The rival
    // always takes a contrasting colour so the two never blur together.
    const pTunic = (Sprites.villager && Sprites.villager[tunic]) ? tunic : 'blue';
    const aTunic = pTunic === 'red' ? 'yellow' : 'red';
    // pre-build both sides' military sprite sets now so the first soldier on
    // screen never causes a mid-game hitch
    if (Sprites.militaryFor) { Sprites.militaryFor(pTunic); Sprites.militaryFor(aTunic); }
    S = {
      seed: String(seed),
      mode,
      sizeKey: size,
      tunic: { P: pTunic, A: aTunic },
      rngState: hashSeed(String(seed)) | 0,
      day: 1, dayT: 0,
      paused: false, over: null,
      res: Object.assign({}, CFG.START_RES),
      wallLevel: 1,                         // village-wide fortification tier (all walls & gates)
      wonder: null,                         // this run's ANCIENT WONDER key (set by G.setWonder, below)
      nextDeath: 0,                         // the day the next villager goes (tests/mortality.mjs)
      map: {
        W: CFG.W, H: CFG.H,
        terrain: gen.terrain,
        resAmount: gen.resAmount,
        fishStocked: true,                  // water tiles carry fish from generation

        scarce: gen.scarce,
        landform: gen.landform,
        decay: {},                          // idx -> day the depleted/ruined tile regrows to grass
        fishBack: {},                       // idx -> day a fished-out shoal restocks (tests/fishery.mjs)
        hunted: {},                         // idx -> day an animal fell here (a lodge's ground)
        reclaimed: {},                      // idx -> 1 where a sapper filled water into land (never counts as shore again)
        explored: new Array(CFG.W * CFG.H).fill(0),
        seenTerrain: gen.terrain.slice(),   // what the player last saw, per tile
        seenB: {},                          // last-seen buildings: idx -> {key, level, owner}
        bridge: new Array(CFG.W * CFG.H).fill(0),   // sapper bridges: 1 where a standing bridge crosses water/moat
        spawns: gen.spawns,
      },
      buildings: [], units: [],
      bridges: [],                          // {x,y,owner,hp,maxhp} — attackable crossings (Sapper tier 2)
      ashes: [],                            // burned-down buildings: {x,y,sz,key,lv,day} — unbuildable for CFG.ASH_DAYS (tests/burn-down.mjs)
      corpses: [],                          // fallen game: {x,y,kind,day} — carcass then skeleton, the lodge-ground cue (tests/wild-life.mjs)
      garrison: [],                         // villagers sheltered inside the Town Center
      armies: {},                           // saved war parties: slot (1-3) → [unit ids] (see UI.saveArmy)
      reprieveUsed: false,                  // the one-time "two survivors emerge" reprieve (competitive modes)
      breachedP: false,                     // set when the player loses a building to enemy fire — gates the positive specials
      collapse: false,                      // player's clan is finished — barbarians push the hall (Moderate/Hard)
      playtime: 0,                          // unpaused seconds, for save metadata
      // run stats — the raw material of the arcade score (js/score.js)
      stats: { trained: 0, razed: 0, gathered: 0, kills: 0, built: 0,
               walls: 0, upgrades: 0, peakPop: 0, krakenSlain: 0, dragonSeen: 0, originBonus: 0 },
      nextId: 1,
      wave: { next: CFG.MODES[mode].waveFirst, count: 0, lastDay: 0 },
      peakTown: { P: 0, A: 0 },
      workLost: { P: [], A: [] },  // the ease's loss ledger (G.noteWorkLost)
      eased: { P: false, A: false },             // biggest each town ever stood (G.barbEase)
      ai: null,
      boons: { P: {}, A: {} },   // ORIGIN CARDS: each side's kept-card modifiers
      log: [],
    };
    Bld._block = null;
    this._marvel = false;
    this._dying = null;
    this._easeC = null;    // the ease day-cache must not leak across runs (day numbers collide)    // …and no announced death is left pending
    this._easeC = null;    // the ease day-cache must not leak across runs (day numbers collide)
    S.nextDeath = S.day + this.rollDeathGap();   // the first villager's day, rolled now
    // which ANCIENT WONDER this run may raise — hashed off the seed, so it
    // never disturbs the run's own RNG sequence (see G.rollWonder)
    this.setWonder(this.rollWonder(seed).key);
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
    /* THE BARBARIAN CAMPS (tests/raider-camps.mjs). MapGen marked the ground;
       the camps themselves go down here as BUILDINGS owned by 'R' — hostile
       to both tribes, and burnable. Each is manned at once, so the wild
       country is dangerous from day one and a lone villager sent across the
       map is a villager sent past somebody's spears. */
    for (const c of (gen.spawns.camps || [])) this.plantRaiderCamp(c.x, c.y);
    // …and a band within reach of EACH seat, so both sides start with a hunt
    // they could go and make (a lodge needs a killing ground — CFG.START_RESOURCE)
    {
      const g = (CFG.START_RESOURCE || {}).game || 4;
      for (const s of [gen.spawns.player, gen.spawns.ai]) Units.seedGameNear(s.x, s.y, g);
    }
    Units.spawnHerd('deer', 8);
    Units.spawnHerd('cow', 8);
    // SPECIAL EVENTS — one roll for the whole game (see CFG.SPECIALS): at most
    // ONE event, and only a third of games get any. The rolled event's own
    // machinery arms; everything else stays cold. Extensible: new events join
    // the registry pool and gate on S.special the same way.
    {
      const SP = CFG.SPECIALS;
      const keys = Object.keys(SP.pool).filter(k => SP.pool[k].modes.includes(mode));
      const pos = keys.filter(k => !SP.pool[k].neg), neg = keys.filter(k => SP.pool[k].neg);
      S.special = null;
      if (keys.length && G.rand() < SP.chance) {
        // lean toward the delights: posWeight of rolled events are positive
        const bag = G.rand() < (SP.posWeight || 0.6) ? (pos.length ? pos : neg) : (neg.length ? neg : pos);
        S.special = bag[(G.rand() * bag.length) | 0];
      }
    }
    // the kraken's clock: a visit on a day rolled from an early, middle, or
    // late band — when a fishing boat is out on water that reaches the map's
    // edge (it comes up from the open ocean, never a landlocked lake)
    const kd = () => {
      const band = G.rand();
      return Math.round(band < 0.34 ? 20 + G.rand() * 30
        : band < 0.67 ? 60 + G.rand() * 40 : 100 + G.rand() * 50);
    };
    S.kraken = { avail: S.special === 'kraken', day: { P: kd(), A: kd() }, done: {}, ev: null };
    // the black dragon waits for a dark hour at the player's gates
    S.dragon = { avail: S.special === 'dragon', done: false, ev: null, ash: [], fire: [] };
    // the lost sons ride only when the village's own line has broken
    S.sons = { avail: S.special === 'sons', done: false };
    // a buried hoard surfaces only when the larders scrape empty
    S.cache = { avail: S.special === 'cache', done: false, ev: null };
    S.trainDiscount = 0;   // fast-training charges left (the cache's work songs)
    // the long winter waits for fat granaries; the plague for crowded lanes
    S.winter = { avail: S.special === 'winter', done: false, days: 0 };
    S.plague = { avail: S.special === 'plague', done: false, until: 0, lifted: true };

    this.freeVis = false;   // every real game starts fogged; the title demo re-enables it
    this.vis = null;
    Units.clampToBoard();   // nobody stands on the impassable map rim
    R.onNewGame();
    this.updateVisibility();
    UI.deselect();
    if (UI.exitPlacement) UI.exitPlacement();   // ghost, grid, ✓/✗ — all of it
    UI.builderFor = null;
    UI.settingRally = null;
    UI._healLog = {};   // real-time heal-spam limit is UI-local — a fresh game must not
                         // inherit a stale cooldown on whatever unit id collides with an old one
    document.getElementById('btnPause').textContent = '⏸';
    // opening notes linger twice as long — there's a lot to take in on day 1
    const LAND = { valley: 'a green valley', lakeland: 'a land of lakes', highlands: 'rugged highlands', islands: 'a chain of islands' };
    this.log(`A new tribe settles ${LAND[gen.landform] || 'the wilds'} (${this.modeCfg().name}). Destroy the rival Town Center to win.`, false, 6400);
    this.log('🏕 ' + S.origin, false, 6400);
    this.log(`Scouts report: ${gen.scarce} is scarce in this valley — claim it before the rival does.`, false, 6400);
    this.log('First barbarian raids expected around day ' + S.wave.next, false, 6400);
    this.warmTribes();
  },

  /* build the sprite rigs for the peoples actually ON this map, now, while
     the world is being set up — Sprites.barbFor is lazy by design (a map
     that meets two peoples never pays for five), but left fully lazy the
     FIRST SIGHTING of each people built its whole rig inside one frame: a
     visible hitch in the middle of play. The camps carry every resident
     tribe; 'sea' rides along because nine longboat crews in ten are the Sea
     Folk whatever the camps rolled. A band that marches in off the map with
     a sixth look still builds lazily, exactly as before. */
  warmTribes() {
    if (typeof Sprites === 'undefined' || !Sprites.barbFor) return;
    const want = new Set(['sea']);
    for (const b of S.buildings) if (b.key === 'raidercamp' && b.tribe) want.add(b.tribe);
    for (const u of S.units) if (u.owner === 'R' && u.tribe) want.add(u.tribe);
    for (const t of want) Sprites.barbFor(t);
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

  /* ENEMY / RAIDER INTEL — telegraphs of the rival's plans (campaigns, war
     camps, marching hosts, harassment sorties) and barbarian sightings.
     Difficulty controls how much of it interrupts play: Calm always warns you,
     Moderate is a coin flip, Hard never does — on Hard the enemy's plans are
     always a surprise (CFG.MODES[mode].foeNoteChance). The event log always
     gets the full entry regardless — a player who goes digging through their
     own history hasn't been handed anything unfair; the surprise is in not
     being PROACTIVELY told.
     This is deliberately separate from "X under attack!" (Combat's own-
     building damage alarm via G.log): that one always fires at every
     difficulty. The fog is over the rival's PLANS, never over your own walls
     actively burning — there's no other alarm for that in the game, so
     silencing it would leave the player with no way to know to react. */
  foeNote(msg, ms) {
    S.log.unshift({ day: S.day, msg });
    if (S.log.length > 60) S.log.pop();
    const chance = this.modeCfg().foeNoteChance;
    if (chance == null || chance >= 1 || this.rand() < chance) UI.toast(msg, true, ms, true);
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
        if (u.owner === 'P') mark(u.x | 0, u.y | 0, CFG.UNITS[u.kind].vision || CFG.UNIT_VISION);
      // ORIGIN CARDS: the Seer's far-seeing eye never closes
      const sn = S.boons && S.boons.P && S.boons.P.seer;
      if (sn) mark(sn.x, sn.y, 3);
    }
    // sync last-seen memory on every visible tile
    const liveB = new Map();
    for (const b of S.buildings) {
      const bs = Bld.size(b);
      for (let dy = 0; dy < bs; dy++) for (let dx = 0; dx < bs; dx++)
        liveB.set(MapGen.idx(b.x + dx, b.y + dy), b);
    }
    for (let i = 0; i < W * H; i++) {
      if (!vis[i]) continue;
      if (S.map.seenTerrain[i] !== S.map.terrain[i]) {
        S.map.seenTerrain[i] = S.map.terrain[i];
        const rx = i % W, ry = (i / W) | 0;
        R.drawTileAt(rx, ry);
        // a tile's edge art (water shore/foam, trench & mound walls, biome blends)
        // is computed from its neighbours — so a change first revealed here leaves
        // a stale seam on each of them. Repaint every explored neighbour too, or
        // the rival's fog-hidden sapper work (moats / reclaimed land / mounds)
        // reads as a grid of hard-edged squares the moment the player sees it.
        // ALL EIGHT: forest/ore density counts diagonals, so felling a tree must
        // also thin the diagonal neighbour's art, not just the orthogonal ones.
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = rx + ox, ny = ry + oy;
          if (MapGen.inB(nx, ny) && S.map.explored[MapGen.idx(nx, ny)]) R.drawTileAt(nx, ny);
        }
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

  // which tunic colour a village wears (defaults keep player blue / rival red)
  tunicOf(owner) {
    return (S && S.tunic && S.tunic[owner]) || (owner === 'A' ? 'red' : 'blue');
  },

  // a freshly depleted or ruined tile greens over after RUIN_DECAY_DAYS, scaled
  // by what it is: felled forest / spent orchard take twice as long to come
  // back, quarried stone three times (rock is slowest of all); ruins as base.
  /* ---- THE FISHERY (tests/fishery.mjs) — fish are the one resource that
     renews on a CLOCK rather than by terrain regrowth: the water never
     changes, only its stock. A shoal fished to nothing comes back after
     CFG.FISH_RETURN_DAYS, at the stock its own water is worth (shallow
     shore water is the leaner half — CFG.FISH_STOCK). ---- */
  fishStockAt(x, y) {
    const r = CFG.RES_AMOUNT[T.WATER];
    const mult = MapGen.shallowWater(x, y) ? CFG.FISH_STOCK.shallow : CFG.FISH_STOCK.deep;
    // food-scarce maps keep lean waters, exactly as at generation
    const lean = S.map.scarce === 'food' ? 0.5 : 1;
    return Math.max(1, Math.round((r[0] + r[1]) / 2 * mult * lean));
  },
  scheduleFishReturn(idx) {
    if (S.map.terrain[idx] !== T.WATER) return;
    if (!S.map.fishBack) S.map.fishBack = {};
    S.map.fishBack[idx] = S.day + CFG.FISH_RETURN_DAYS;
  },

  scheduleRevert(idx) {
    const t = S.map.terrain[idx];
    // ORE NEVER COMES BACK: a quarried seam (PEBBLES) is not on the regrow
    // table, so there is nothing to schedule — the scar stays. Ruins are
    // still scheduled: rubble fades to grass, which is cleanup, not regrowth.
    if (!CFG.REGROW_TO[t] && t !== T.RUIN) return;
    if (!S.map.decay) S.map.decay = {};
    // rubble is CLEANUP and runs on its own short clock; everything else is
    // regrowth, on the base scaled by what it is
    if (t === T.RUIN) { S.map.decay[idx] = S.day + CFG.RUIN_FADE_DAYS; return; }
    const mult = CFG.REGROW_MULT[t] || 1;
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

  // FOOD UPKEEP — deduct the day's rations. A surplus is fine; running dry is a
  // famine: food clamps to zero and, if it drags on, a soldier deserts each
  // FAMINE_DESERT_DAYS (see Units.desertHungry). Symmetric — the rival eats too,
  // and its economy brain answers a shortfall by building farms (see AI.daily).
  /* NO WAY BACK — the run is decided long before the Town Center actually
     falls, and watching a hall get chipped down over twenty days with nothing
     you can do about it is not a game, it's a wait. When the village can no
     longer feed itself the chief offers the player the choice: strike the
     banner, or stay and watch it burn.

     The three conditions are FACTS about the board, not a guess:
       · no villagers  — nothing left that can gather, build or work a farm
       · food under a villager's price (50) — none can be trained back either
       · no Trading Post — and no way to turn the wood and stone you're sitting
         on into a meal (the post trades any resource for any other, and the
         hall's own gold trickle keeps it fed, so owning one IS a way back)
     Rather than reason about whether some fishing boat might still be working
     a shoal, we MEASURE it: the granary must also have failed to rise for
     DOOM_DAYS running. Anything still producing food shows up as food coming
     in, and the offer is never made. Asked once per run. */
  DOOM_DAYS: 3,
  checkDoom() {
    if (!S || S.over || S.doomShown) return;
    const tc = Bld.tcOf('P');
    const price = ((CFG.BUILDINGS.tc.train || {}).villager || {}).cost;
    const seed = (price && price.food) || 50;
    const post = S.buildings.some(b => b.owner === 'P' && b.key === 'trade' && Bld.done(b) && !b.upgrading);
    const food = S.res.food || 0;
    const spent = !!tc && !post && food < seed &&
      Units.count('P', u => Units.isVillager(u)) === 0 &&
      food <= (S._doomFood != null ? S._doomFood : 1e9);       // …and nothing is coming in
    S._doomFood = food;
    S.doomT = spent ? (S.doomT || 0) + 1 : 0;
    if (S.doomT >= this.DOOM_DAYS && window.Screens) { S.doomShown = true; Screens.show('doomed'); }
  },

  applyFoodUpkeep(owner) {
    const store = owner === 'P' ? S : S.ai;
    if (!store || !store.res) return;
    const res = store.res;
    res.food -= Units.foodUpkeep(owner);
    if (res.food >= 0) {
      store._famineT = 0;
      if (owner === 'P' && store._famineWarned) {
        store._famineWarned = false;
        this.log('🌾 The granaries fill again — the village eats its fill.');
      }
      return;
    }
    // the stores are empty
    res.food = 0;
    store._famineT = (store._famineT || 0) + 1;
    if (owner === 'P' && !store._famineWarned) {
      store._famineWarned = true;
      this.log('⚠️ Famine! Food has run out — raise farms, lodges or fishing boats before your soldiers desert.', true);
    }
    if (store._famineT >= (CFG.FAMINE_DESERT_DAYS || 1.5)) {
      store._famineT -= (CFG.FAMINE_DESERT_DAYS || 1.5);
      Units.desertHungry(owner);
    }
  },

  dayTick() {
    // victory and defeat come only through Town Centers falling (see Bld.damage)
    S.day++;
    this.notePeaks();         // how big each town ever got — what "gutted" is measured against
    this.tickRaiderCamps();   // a camp raises another spear when one falls
    this.tickMortality();     // …and every so often a villager simply goes
    /* LIVING land recovers: felled forest and spent orchard/berry soil grow
       back with a lean restock, so a starved player can always grind wood
       and food back — just slowly. ORE DOES NOT (CFG.REGROW_TO): a quarried
       seam stays PEBBLES for good, which makes stone the one finite resource
       on the map. Ruins simply fade to grass. Legacy saves carrying decay
       entries for old quarried tiles are safe: PEBBLES matches no branch
       below, so the entry is simply dropped and the scar stays. */
    if (S.map.decay) {
      const SOURCE = CFG.REGROW_TO;
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
        this.log('🌱 Felled woods and spent soil recover in time — but a quarried seam never does');
      }
    }
    // THE SHOALS RETURN: a fished-out tile restocks after FISH_RETURN_DAYS.
    // The water itself never changed — only what swims in it — so this is its
    // own clock, not the terrain-regrowth table (tests/fishery.mjs).
    if (S.map.fishBack) {
      let back = false;
      for (const k in S.map.fishBack) {
        if (S.day < S.map.fishBack[k]) continue;
        const i = +k, fx = i % CFG.W, fy = (i / CFG.W) | 0;
        // a shoal a sapper filled in is simply gone; so is one already restocked
        if (S.map.terrain[i] === T.WATER && !(S.map.resAmount[i] > 0)) {
          S.map.resAmount[i] = this.fishStockAt(fx, fy);
          back = true;
        }
        delete S.map.fishBack[k];
      }
      if (back && !S.fishBackSeen) {
        S.fishBackSeen = true;
        this.log('🐟 The shoals return — waters fished out long ago are worth casting in again');
      }
    }
    // ash piles cool: after ASH_DAYS the footprint of a burned building is
    // buildable ground again (the ruined tiles beneath fade on their own clock)
    if (S.ashes && S.ashes.length)
      S.ashes = S.ashes.filter(a => S.day - a.day < CFG.ASH_DAYS);
    // fallen game weathers away: meat for CORPSE_DAYS.meat, bone until .bone
    if (S.corpses && S.corpses.length)
      S.corpses = S.corpses.filter(c => S.day - c.day < CFG.CORPSE_DAYS.bone);
    Bld.dailyProduction('P');
    Units.dailySpawns();
    if (window.Cards) Cards.seerWatch();   // ORIGIN CARDS: the Seer's forewarning
    Combat.maybeWave();
    AI.daily();
    // every mouth eats — food is a standing cost, not a one-time price at training
    this.applyFoodUpkeep('P');
    this.applyFoodUpkeep('A');
    this.checkDoom();
    // arcade tally: the tribe at its greatest
    if (S.stats) {
      const pop = S.units.reduce((n, u) => n + (u.owner === 'P' ? 1 : 0), 0) + S.garrison.length;
      if (pop > (S.stats.peakPop || 0)) S.stats.peakPop = pop;
    }

    // the plague passes on its appointed day
    if (S.plague && S.plague.until && !S.plague.lifted && S.day >= S.plague.until) {
      S.plague.lifted = true;
      this.log('🕊 The sickness passes — the village drums for new hands again.');
    }

    // the long winter thaws after a few days — the pall lifts
    if (S.winter && S.winter.days > 0) {
      S.winter.days--;
      if (S.winter.days === 0) this.log('🌤 The wind turns at last — the thaw comes, and the valley breathes again.');
    }

    // the kraken stirs (SPECIAL EVENT): only under a boat whose OWN body of
    // water reaches the map's edge — it rises from the open ocean, so a boat
    // on a landlocked lake is safe forever. One visit per game, total.
    if (S.kraken && S.kraken.avail && !S.kraken.ev) {
      for (const ow of ['P', 'A']) {
        if (S.kraken.done[ow] || S.day < S.kraken.day[ow]) continue;
        // the FIRST boat sailing edge-connected water is the one the deep takes
        const boat = S.units.find(u => u.owner === ow && u.kind === 'fishboat' &&
          this.waterReachesEdge(u.x | 0, u.y | 0));
        if (!boat) continue;                                  // it waits for a boat on open water
        S.kraken.avail = false;                               // ONE visit per game — the deep is spent
        S.kraken.done[ow] = true;
        S.kraken.ev = { x: boat.x, y: boat.y, boatId: boat.id, owner: ow, phase: 'rise', t: 0 };
        if (ow === 'P') this.log('🐙 Something vast stirs beneath the water…', true);
        break;
      }
    }

    // the tribe endures — but only so far. If every villager is dead (none on
    // the map, none sheltering, none in training), two survivors step out of the
    // Town Center. On the competitive modes this reprieve comes ONCE: a first
    // wipe is a setback, a second means the clan is genuinely finished. On Calm
    // the hall keeps sending out survivors, so a gentle game never hard-stops.
    {
      const tc = Bld.tcOf('P');
      const m = this.modeCfg();
      const noVills = tc && Bld.done(tc) &&
        !S.units.some(u => u.owner === 'P' && Units.isVillager(u)) &&
        S.garrison.length === 0 &&
        !tc.queue.some(q => q.unit === 'villager');
      const gaveReprieve = noVills && !(m.finishTC && S.reprieveUsed);
      if (gaveReprieve) {
        for (let i = 0; i < 2; i++) {
          const spot = MapGen.findNear(tc.x, tc.y + Bld.size(tc), 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: tc.x, y: tc.y + Bld.size(tc) };
          Units.spawn('villager', 'P', spot.x, spot.y);
        }
        S.reprieveUsed = true;
        this.log('🛖 Two villagers emerge from the Town Center — the tribe endures', true);
      }
      // COLLAPSE: on Moderate/Hard, once the reprieve is spent and the workforce
      // is gone for good, the clan is done. Barbarians hunting the player stop
      // sparing the hall and march to raze it — a clean, timely end instead of a
      // slow bleed-out (see Combat.raiderSeek). Never on Calm, never the rival's,
      // and never on the very tick the reprieve just refilled the village.
      S.collapse = !!(m.finishTC && S.reprieveUsed && noVills && !gaveReprieve);
    }

    // cloud autosave cadence (Backend also drops a local crash-net snapshot);
    // the title demo never saves — it must not clobber a real crash net or slot
    if (window.Backend && Backend.autosaveDays > 0 &&
        !(window.Screens && Screens._demo) &&
        S.day - (Backend._lastAutosaveDay || 0) >= Backend.autosaveDays)
      Backend.autosaveNow('cadence');
  },

  /* ================= THE WILDS EASE OFF A GUTTED TOWN =================
     (tests/raider-camps.mjs)

     Barbarians SEASON a war; they must never decide it. A rival ground down
     to a hall and a field of ash by war bands robs the player of the victory
     they spent two hundred days working toward — you march up expecting the
     fight of the game and find an empty village. The run is only satisfying
     if conquering the enemy is HARD and EARNED; an opponent the wilds already
     killed for you is neither.

     So a tribe that is genuinely on its knees gets a breather: no band takes
     it as a mark (Combat.raiderSeek / spawnWave's disposition roll), and the
     whole wave clock stretches while it rebuilds (spawnWave's gap). The test
     is the town's STATE, not blame — nobody can attribute a burned farm to a
     barbarian rather than a player — so it reads exactly like a chief looking
     at a smoking village and deciding there is nothing left worth taking.

     Deliberately owner-AGNOSTIC: a player being wiped out by the wilds is
     robbed of their game just as surely. The one exception is a COLLAPSED
     player (S.collapse — workforce gone for good on Moderate/Hard), where the
     bands are there to end a lost run cleanly rather than to bleed it.

     `S.peakTown` is what makes "gutted" measurable: how big each town ever
     got, counting FINISHED buildings and never the curtain (a wall line is
     raised and razed constantly and says nothing about whether a village is
     alive). It rides in every save; loadJSON backfills it from the towns as
     they stand, so an old save simply starts its record from today.

     BOTH tests are gated on `minPeak` — the ease is for a town that got
     ESTABLISHED and then fell apart, never for a three-villager opening. A
     player struggling on day six is having a hard game, which is theirs to
     have; a player arriving on day two hundred deserves an enemy. */
  /* lossN-in-lossDays is the LEADING prong (see barbEase); releaseFrac/relVil
     are the latch's release bar. */
  BARB_EASE: { vil: 3, bldFrac: 0.55, minPeak: 6, gapMult: 2,
               lossN: 4, lossDays: 12, releaseFrac: 0.7, relVil: 5 },
  townSize(owner) {
    return Bld.list(owner).filter(b => Bld.done(b) && b.key !== 'wall' && b.key !== 'gate').length;
  },
  notePeaks() {
    if (!S.peakTown) S.peakTown = { P: 0, A: 0 };
    for (const o of ['P', 'A']) S.peakTown[o] = Math.max(S.peakTown[o] || 0, this.townSize(o));
  },
  /* EVERY FALLEN WORK IS ON THE RECORD (tests/raider-camps.mjs). Stamped from
     Bld.damage's destroy branch for finished non-fortification buildings of
     either tribe — attacker-agnostic, like everything the ease reads, because
     nobody can attribute a burned farm. S.workLost rides in every save. */
  noteWorkLost(owner) {
    if (owner !== 'P' && owner !== 'A') return;
    if (!S.workLost) S.workLost = { P: [], A: [] };
    const l = S.workLost[owner]; l.push(S.day);
    if (l.length > 24) l.splice(0, l.length - 24);
    this._easeC = null;                                 // a loss can flip the ease TODAY
  },
  /* THE EASE LEADS THE COLLAPSE NOW, instead of trailing it. A real day-320
     game (hard, xlarge) was gutted by a nine-strong band over days 299-303
     while both original prongs still read "healthy": eleven works burned in
     five days, and only once the town was ALREADY below the thresholds did
     the wilds stand off — a lagging indicator by construction. Two changes:

     RATE OF LOSS is a prong of its own — lossN finished works inside
     lossDays reads as a town being torn down whoever is doing the tearing,
     and it fires DURING the gutting, not after.

     AND THE EASE LATCHES (S.eased, in every save): once the wilds stand off
     a town they STAY off until it has genuinely recovered — townSize back
     past releaseFrac of peak AND relVil villagers — so a town bouncing on
     the threshold doesn't flicker between hunted and spared. The latch is
     also what makes the per-frame reads cheap: computed at most once per
     day (G._easeC, render-side only, never saved; busted by noteWorkLost so
     a mid-day gutting still flips it the same day). */
  barbEase(owner) {
    if (!S || (owner !== 'P' && owner !== 'A') || !Bld.tcOf(owner)) return false;
    if (owner === 'P' && S.collapse) return false;      // a lost run is ENDED, not nursed
    const c = this._easeC;
    if (c && c.day === S.day && c[owner] != null) return c[owner];
    const E = this.BARB_EASE;
    const peak = (S.peakTown && S.peakTown[owner]) || 0;
    let val = false;
    if (peak >= E.minPeak) {                            // it must have been ESTABLISHED
      if (!S.eased) S.eased = { P: false, A: false };
      const vils = Units.count(owner, u => Units.isVillager(u));
      const size = this.townSize(owner);
      if (S.eased[owner]) {
        // latched: only a real recovery releases it
        val = !(size >= peak * E.releaseFrac && vils >= E.relVil);
      } else {
        const lost = ((S.workLost && S.workLost[owner]) || [])
          .filter(d => S.day - d <= E.lossDays).length;
        val = vils < E.vil || size < peak * E.bldFrac || lost >= E.lossN;
      }
      S.eased[owner] = val;
    }
    const cc = this._easeC && this._easeC.day === S.day ? this._easeC : (this._easeC = { day: S.day });
    cc[owner] = val;
    return val;
  },

  // does this water tile's whole BODY of water touch the map's edge? A
  // landlocked lake never reaches the rim, so nothing that lives in the deep
  // ocean can surface there. One multi-source flood from the rim, cached and
  // recomputed at most once per day (sappers can reshape the water).
  waterReachesEdge(sx, sy) {
    const W = CFG.W, H = CFG.H, T_ = S.map.terrain;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H || T_[sy * W + sx] !== T.WATER) return false;
    if (this._ewDay !== S.day || !this._ew) {
      this._ewDay = S.day;
      const m = this._ew = new Uint8Array(W * H), q = [];
      const seed = i => { if (T_[i] === T.WATER && !m[i]) { m[i] = 1; q.push(i); } };
      for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
      for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (m[j] || T_[j] !== T.WATER) continue;
          m[j] = 1; q.push(j);
        }
      }
    }
    return !!this._ew[sy * W + sx];
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

  /* ---- gate for the POSITIVE specials (Returning Sons, Buried Cache) ----
     Help only comes to a village truly on its knees: the defenses have been
     BREACHED (a building lost to enemy fire), every soldier is gone, and at
     least five real minutes have been played. Before that, no miracles. */
  positiveGate() {
    if ((S.playtime || 0) < 300) return false;                          // 5 minutes of real play
    if (!S.breachedP) return false;                                     // the wall must have failed first
    return !S.units.some(u => u.owner === 'P' && Units.isMilitary(u));  // and nobody left to hold the line
  },

  /* ---- SPECIAL EVENT: the Returning Sons ----
     Years ago, sons and daughters of this village rode out and never wrote
     home. When the line breaks — defenses breached, foes at the hall, not a
     soldier left to hold them — the horn is finally answered: five riders
     appear at the world's edge and ride in, the player's to command. A
     lifeline, not an army. */
  maybeSons() {
    const E = S.sons;
    if (!E || !E.avail || E.done || S.over) return;
    if (S.day < 15 || !this.positiveGate()) return;
    const tc = Bld.tcOf('P'); if (!tc) return;
    const cx = Bld.cx(tc), cy = Bld.cy(tc);
    const foes = S.units.filter(u => (u.owner === 'A' || u.owner === 'R') &&
      (Units.isMilitary(u) || u.owner === 'R') && !Units.isNaval(u) &&
      Math.hypot(u.x - cx, u.y - cy) < 10);
    if (foes.length < 4) return;
    E.done = true; E.avail = false;
    // they appear at the EDGE of the map, about a fifth of the map out from
    // home, on whatever stretch of the border lies farthest from the foe
    const mx = foes.reduce((a, u) => a + u.x, 0) / foes.length;
    const my = foes.reduce((a, u) => a + u.y, 0) / foes.length;
    const want = Math.max(CFG.W, CFG.H) * 0.2;
    const cands = [];
    const consider = (x, y) => cands.push({
      x, y,
      s: Math.abs(Math.hypot(x - cx, y - cy) - want)                      // ~20% of the map from home…
        + Math.max(0, 16 - Math.hypot(x - mx, y - my)) * 1.5,             // …and never on the foe's side
    });
    for (let x = 1; x < CFG.W - 1; x++) { consider(x, 1); consider(x, CFG.H - 2); }
    for (let y = 2; y < CFG.H - 2; y++) { consider(1, y); consider(CFG.W - 2, y); }
    cands.sort((a, b) => a.s - b.s);
    // the best-scoring stretch of border that actually offers open ground —
    // a tight search (r 2) so the arrival stays pressed against the world's edge
    let ex = cx, ey = cy;
    for (const c of cands) {
      const spot2 = MapGen.findNear(c.x, c.y, 2, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
      if (spot2) { ex = spot2.x; ey = spot2.y; break; }
    }
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const spot = MapGen.findNear(ex, ey, 3, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
      if (!spot) continue;
      const r = Units.spawn('rider', 'P', spot.x + (i % 2) * 0.4, spot.y + (i % 3) * 0.3);
      const home = MapGen.findNear(cx | 0, (cy | 0) + 2, 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
      if (home) Units.moveTo(r, home.x, home.y);
      R.float(spot.x + 0.5, spot.y, '🐎', '#e8c15a');
      n++;
    }
    if (n) this.log('🐎 Hoofbeats on the wind — the horn is answered! Your sons and daughters heed the call for support: ' + n + ' riders appear at the world\u2019s edge and race for home!', true, 8000);
  },

  /* ---- SPECIAL EVENT: the Buried Cache ----
     When the village is scraping the bottom of every basket, an old map
     corner surfaces: a hoard buried a stone's throw from camp, on the side
     away from any foes. A villager must WALK to it and dig — then food,
     timber and stone pour out, along with a dead uncle's legendary work
     songs (the next 5 recruits train in half the time). */
  maybeCache() {
    const E = S.cache;
    if (!E || E.done || S.over) return;
    if (E.ev) return this.cacheClaimCheck();   // buried and waiting for a spade
    if (!E.avail) return;
    if (S.day < 12 || !this.positiveGate()) return;
    if (S.res.food > 60 || S.res.wood > 50) return;   // true desperation, not a dip
    const tc = Bld.tcOf('P'); if (!tc) return;
    const cx = Bld.cx(tc), cy = Bld.cy(tc);
    // bury it opposite the nearest hostile (or any open side when at peace)
    const foe = Combat.nearestUnit(cx, cy, 30, o => (o.owner === 'A' || o.owner === 'R') && Units.isMilitary(o));
    const ang = foe ? Math.atan2(cy - foe.y, cx - foe.x) : G.rand() * Math.PI * 2;
    for (let tries = 0; tries < 14; tries++) {
      const a2 = ang + (G.rand() - 0.5) * 1.2, d = 5 + G.rand() * 3;
      const x = Math.round(cx + Math.cos(a2) * d), y = Math.round(cy + Math.sin(a2) * d);
      if (!MapGen.inB(x, y) || !Path.passable(x, y, 'P') || Bld.at(x, y)) continue;
      E.avail = false; E.ev = { x, y, t: 0 };
      G.reveal(x, y, 2);
      this.log('✨ A weathered map corner pokes from the soil — a hoard lies buried just beyond the huts! Send a villager to dig it up.', true, 7000);
      return;
    }
  },
  cacheClaimCheck() {
    const ev = S.cache.ev; if (!ev) return;
    const digger = S.units.find(u => u.owner === 'P' && Units.isVillager(u) &&
      Math.hypot(u.x - (ev.x + 0.5), u.y - (ev.y + 0.5)) < 0.9);
    if (!digger) return;
    S.cache.ev = null; S.cache.done = true;
    S.res.food += 300; S.res.wood += 300; S.res.stone += 300;
    S.trainDiscount = 5;
    R.float(ev.x + 0.5, ev.y, '🍖 🪵 🪨 +300', '#e8c15a');   // icon-first, like every other price
    this.log('🪙 The spade rings on oak — your great-uncle\u2019s lost hoard! Food, timber, stone… and his legendary work songs (next 5 recruits train TWICE as fast).', false, 8000);
  },

  /* ---- SPECIAL EVENT: the Long Winter ----
     It does not strike the desperate — it strikes the COMFORTABLE. When the
     player's granary swells fat, a killing winter falls on the whole valley:
     BOTH villages lose half their food and two of their food-works (farms
     razed, fishing boats crushed in the ice), fairly, from what each side
     actually has. A cold pall hangs over the world for a few days. */
  maybeWinter() {
    const E = S.winter;
    if (!E || !E.avail || E.done || S.over) return;
    if (S.day < 30) return;
    if (S.res.food < 800) return;                       // punishes the boom, never the bust
    E.done = true; E.avail = false; E.days = 3;
    const cull = (owner) => {
      const bag = owner === 'P' ? S.res : S.ai.res;
      bag.food = Math.round(bag.food * 0.5);
      // two food-works fall: farms and fishing boats, whatever they actually have
      const works = [];
      for (const b of Bld.list(owner)) if (b.key === 'farm' && Bld.done(b)) works.push({ farm: b });
      for (const u of S.units) if (u.owner === owner && u.kind === 'fishboat') works.push({ boat: u });
      let lost = 0;
      for (let k = 0; k < 2 && works.length; k++) {
        const w = works.splice((G.rand() * works.length) | 0, 1)[0];
        if (w.farm) { Bld.removeToRuin(w.farm); lost++; }
        else { Units.damage(w.boat, 99999, 0, 'W'); lost++; }
      }
      return lost;
    };
    const pl = cull('P'), al = cull('A');
    this.log('❄️ A wind out of the north that does not stop — the LONG WINTER falls on the valley. Granaries dwindle by half and the fields lie dead under the snow (' + pl + ' of your food-works lost; the rival suffers the same).', true, 8000);
  },

  /* ---- SPECIAL EVENT: the Plague ----
     It comes when the lanes are fullest. At the village's crowded peak, a
     sickness walks hut to hut: FIVE villagers keel over where they stand
     (a visible dying fall, not a number), and no new villagers can be
     trained for 5 days while the village buries and scrubs and grieves. */
  maybePlague() {
    const E = S.plague;
    if (!E || !E.avail || E.done || S.over) return;
    if (S.day < 25) return;
    const vills = S.units.filter(u => u.owner === 'P' && Units.isVillager(u) && !u.dieT);
    if (vills.length < 7) return;
    if (Units.popUsed('P') < Bld.popCap('P') * 0.85) return;   // strikes the boom, not the bust
    E.done = true; E.avail = false;
    E.until = S.day + 5; E.lifted = false;
    for (let k = 0; k < 5 && vills.length; k++) {
      const v = vills.splice((G.rand() * vills.length) | 0, 1)[0];
      v.dieT = 2.4; v.task = null; v.tUnit = 0; v.tBld = 0; v.path = null;
      R.float(v.x, v.y - 0.6, '☠', '#a5c86a');
    }
    this.log('☠️ A sickness walks hut to hut — five villagers fall where they stand. No new hands will answer the drum for 5 days.', true, 8000);
  },

  dragonTick(dt) {
    const D = S.dragon;
    if (!D) return;
    for (let i = (D.ash || []).length - 1; i >= 0; i--) {   // ash blows away
      D.ash[i].ttl -= dt;
      if (D.ash[i].ttl <= 0) D.ash.splice(i, 1);
    }
    for (let i = (D.fire || []).length - 1; i >= 0; i--) {  // the fire line burns down to embers
      D.fire[i].ttl -= dt;
      if (D.fire[i].ttl <= 0) D.fire.splice(i, 1);
    }
    const ev = D.ev;
    if (!ev) return;
    ev.t += dt;
    if (ev.phase === 'fly') {
      ev.x += ev.dir * 9 * dt;
      ev.y += (ev.ty - ev.y) * Math.min(1, dt * 1.6);
      if ((ev.dir > 0 && ev.x >= ev.tx - 2.5) || (ev.dir < 0 && ev.x <= ev.tx + 2.5)) {
        ev.phase = 'burn'; ev.t = 0; ev.fireT = 0;
        for (const id of ev.victims) { const u = Units.get(id); if (u) u.burnT = 1.6; }
        this.log('🐉 The dragon banks and BREATHES — the enemy line is a wall of fire!', true, 5200);
      }
    } else if (ev.phase === 'burn') {
      ev.x += ev.dir * 3.2 * dt;                  // a slow strafe along the line
      // the breath leaves a LINE OF FIRE on the ground beneath the strafe —
      // flames that keep burning after the dragon has moved on
      ev.fireT = (ev.fireT || 0) - dt;
      if (ev.fireT <= 0 && (D.fire || (D.fire = [])).length < 60) {
        ev.fireT = 0.09;
        D.fire.push({ x: ev.x + ev.dir * 2.1 + (G.rand() - 0.5) * 0.5,
                      y: ev.ty + (G.rand() - 0.5) * 0.7,
                      ttl: 4.5 + G.rand() * 2.5, seed: (G.rand() * 100) | 0 });
      }
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

  /* ================= MORTALITY (tests/mortality.mjs) =====================
     Life is short here. Every `deathEvery` days one villager simply goes —
     with a keeling-over animation where they stood, a line in the log saying
     what did for them, and their post left EMPTY. That last part is the point
     of the whole feature: a station you staffed on day forty and forgot about
     will, sooner or later, want a hand put back on it.

     Two deliberate limits. It never takes the LAST villager — a random roll
     must not be able to end a run the player is still playing — and it is
     player-side only: the rival hires its workforce back on a timer of its
     own, so mortality there would be invisible bookkeeping that only re-tunes
     its economy. */
  rollDeathGap() {
    const band = this.modeCfg().deathEvery || (CFG.MORTALITY || {}).every || [25, 40];
    return Math.max(1, Math.round(band[0] + this.rand() * (band[1] - band[0])));
  },
  /* WHAT DID FOR THEM, keyed to what they were DOING (CFG.DEATHS) — the
     station they were stationed at, the resource they were gathering,
     whether they were building or fishing. A woodcutter goes the way a
     woodcutter goes; everyone caught idling or walking draws from `general`. */
  deathCause(u) {
    const D = CFG.DEATHS || {};
    const t = u && u.task;
    let bucket = 'general';
    if (t && t.type === 'work') {
      const b = Bld.get(t.id);
      if (b && D[b.key]) bucket = b.key;
    } else if (t && t.type === 'gather') {
      bucket = { wood: 'gatherWood', stone: 'gatherStone', food: 'gatherFood' }[t.res] || 'general';
    } else if (t && t.type === 'build') bucket = 'build';
    else if (t && t.type === 'shorefish') bucket = 'fish';
    const list = D[bucket] && D[bucket].length ? D[bucket] : (D.general || ['died.']);
    return { bucket, line: list[(this.rand() * list.length) | 0] };
  },
  tickMortality() {
    if (!S || S.over) return;
    // 0 / null / undefined all mean "not rolled yet" — a fresh game, or a
    // pre-mortality save being loaded. Roll it and wait; never fire on the
    // very first tick after a load.
    if (!S.nextDeath) { S.nextDeath = S.day + this.rollDeathGap(); return; }
    if (S.day < S.nextDeath) return;
    const pool = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    // never the last hand — try again in a couple of days
    if (pool.length < 2) { S.nextDeath = S.day + 2; return; }
    const u = pool[(this.rand() * pool.length) | 0];
    const cause = this.deathCause(u);
    /* THE NEWS COMES FIRST (CFG.MORTALITY.warnMs). The fall itself is a
       second and a half of animation somewhere in a village the player may
       not be looking at, so telling them at the same instant means they read
       the line and look up at nothing. The word goes out, and the villager
       goes over a beat later — long enough to lift your eyes, short enough
       that it still reads as one event. The pending fall lives on G, never in
       a save (same rule as G._marvel): save inside that beat and the villager
       simply survives it, which is a kindness rather than a bug. */
    this._dying = { id: u.id, t: ((CFG.MORTALITY || {}).warnMs || 1000) / 1000 };
    // NEVER foeNote: that is difficulty-gated enemy intel. A death in the
    // village is the player's own news and is told at every difficulty.
    this.log('☠ ' + cause.line, true, 5200);
    S.nextDeath = S.day + this.rollDeathGap();
    return cause;
  },
  // …and the beat later, they go. Driven from the frame loop.
  dyingTick(dt) {
    const d = this._dying;
    if (!d) return;
    d.t -= dt;
    if (d.t > 0) return;
    this._dying = null;
    const u = S.units.find(o => o.id === d.id);
    if (!u) return;                                   // taken by something else first — the news stands
    if (window.R && R.startDeath) R.startDeath(u);    // …keel over where they stood
    Units.despawn(u);                                 // …and their post is empty
  },

  /* ================= BARBARIAN CAMPS (tests/raider-camps.mjs) =============
     A camp is a BUILDING owned by 'R' standing on trampled ground, always
     with a few barbarians about it. That is the whole point: the far country
     is not empty scenery, and a trip out to a distant seam or a fat forest is
     a trip past somebody's spears. Burn the camp and the ground is yours —
     its band stops being replaced and no wave musters there again. */
  /* ===== HUNTING GROUNDS (tests/worked-ground.mjs) =====
     Every other station stands on spent TERRAIN; the Hunter's Lodge has none
     to stand on, because game is not a tile. So the ground itself remembers
     where an animal fell, and a lodge may be raised there and nowhere else.
     The marks are PERMANENT for the run — a game trail is a game trail, and
     an expiring mark would mean hunting a spot twice for one building — and
     they ride in the save (`S.map.hunted`, idx → the day of the kill; an older
     save simply starts its record empty). */
  noteHunt(x, y) {
    if (!S || !S.map || !MapGen.onBoard(x, y)) return;
    if (!S.map.hunted) S.map.hunted = {};
    S.map.hunted[MapGen.idx(x, y)] = S.day;
  },
  huntedAt(x, y) {
    return !!(S && S.map && S.map.hunted && MapGen.onBoard(x, y) &&
      S.map.hunted[MapGen.idx(x, y)] != null);
  },

  /* WHICH PEOPLE (CFG.TRIBES, tests/raider-camps.mjs). Rolled on the SEEDED
     rng so a seed's wild country is the same wild country twice. */
  rollTribe() {
    const list = CFG.TRIBES || [];
    return list.length ? list[(this.rand() * list.length) | 0].key : 'wolf';
  },
  tribeDef(key) {
    return (CFG.TRIBES || []).find(t => t.key === key) || (CFG.TRIBES || [])[0] ||
      { key: 'wolf', name: 'Barbarians' };
  },
  tribeName(key) { return this.tribeDef(key).name; },

  plantRaiderCamp(x, y, tribe) {
    if (!MapGen.inB(x, y) || Bld.at(x, y)) return null;
    S.map.terrain[MapGen.idx(x, y)] = T.CAMP;
    const b = Bld.place('R', 'raidercamp', x, y, { free: true, instant: true });
    if (!b) return null;
    /* A CAMP KEEPS ITS PEOPLE FOR ITS WHOLE LIFE. Everything raised here wears
       this look, so the band at the northern fire is the same band every time
       you come back — and burning the camp out takes those people off the
       board with it. Rides in every save on the building itself. */
    b.tribe = tribe || this.rollTribe();
    // the camp's own quota, rolled once and REMEMBERED: it is what the camp
    // re-mans back up to, so a band you cut down comes back the same size
    b.reman = 0;
    b.quota = this.campQuota();
    this.manRaiderCamp(b, b.quota);
    return b;
  },
  // how many tend a camp on this difficulty — rolled per camp from the mode's
  // band, so no two camps are quite the same errand
  campQuota() {
    const band = (this.modeCfg().campGuard) || [1, 3];
    return band[0] + ((this.rand() * (band[1] - band[0] + 1)) | 0);
  },
  campTenders(b) {
    return S.units.filter(u => u.owner === 'R' && u.campId === b.id);
  },
  // put `n` barbarians on a camp — anchored to it, and marked as its tenders
  // so the seek logic keeps them home (Combat.raiderSeek) and the
  // stranded-raider backstop in units.js never melts them away
  manRaiderCamp(b, n) {
    let put = 0;
    for (let i = 0; i < n; i++) {
      const spot = MapGen.findNear(b.x, b.y, 3, (sx, sy) =>
        Path.passable(sx, sy, 'R') && !Bld.at(sx, sy));
      if (!spot) break;
      const kind = this.rand() < 0.25 ? 'brute' : 'raider';
      const u = Units.spawn(kind, 'R', spot.x, spot.y, { tribe: b.tribe });
      u.hostileTo = 'ALL';          // a camp band answers to nobody
      u.campId = b.id;
      u.anchor = { x: b.x + 0.5, y: b.y + 0.5 };
      put++;
    }
    return put;
  },
  /* A CAMP RE-MANS ITSELF. Kill the band and the camp simply raises another
     in a few days — "always tended" has to mean always, or clearing one is a
     free afternoon's work and the ground is won without ever facing the camp
     itself. Called once a day from G.dayTick. */
  tickRaiderCamps() {
    const RC = CFG.RAIDER_CAMPS || {};
    for (const b of Bld.list('R')) {
      if (b.key !== 'raidercamp' || b.construction > 0) continue;
      if (b.quota == null) b.quota = this.campQuota();
      const have = this.campTenders(b).length;
      if (have >= b.quota) { b.reman = 0; continue; }
      b.reman = (b.reman || 0) + 1;
      if (b.reman >= (RC.remanDays || 6)) { b.reman = 0; this.manRaiderCamp(b, 1); }
    }
  },

  /* ================= THE ANCIENT WONDER (tests/wonder.mjs) =================
     The second way to win, and the only one that isn't a war: raise the
     monument and the run is yours. WHICH monument is rolled once per run from
     CFG.WONDERS — but NOT off S.rngState. Consuming a draw from the run's own
     RNG would shift every roll after it (start package, cards, specials), so
     a seed played yesterday would deal a different hand today. The pick is
     hashed straight off the SEED STRING instead: stable per seed, and it
     costs the sequence nothing. */
  rollWonder(seed) {
    const list = CFG.WONDERS;
    const h = Math.abs(hashSeed(String(seed == null ? '' : seed) + '::wonder') | 0);
    return list[h % list.length];
  },
  wonderDef() { return CFG.WONDERS.find(z => z.key === (S && S.wonder)) || CFG.WONDERS[0]; },
  // point the single `wonder` building key at this run's monument: its name,
  // its blurb and its artwork. Everything downstream — the build menu, the
  // panel, R.bldSprite, the burn variants — then finds it exactly where it
  // finds every other building's, with no special case anywhere.
  setWonder(key) {
    const w = CFG.WONDERS.find(z => z.key === key) || CFG.WONDERS[0];
    S.wonder = w.key;
    const d = CFG.BUILDINGS.wonder;
    d.name = w.name;
    d.desc = w.blurb + ' Finishing it wins the game.';
    // `Sprites` is a script-level const, NOT a window property (window.Sprites
    // is undefined) — reference it directly or the artwork never swaps
    if (Sprites.useWonder) Sprites.useWonder(w.key);
    return w;
  },
  /* The monument is finished. The player does NOT get snapped to a score
     screen mid-cheer: the valley holds still, the camera settles on the
     thing, and it is left on screen for CFG.WONDER.marvelMs before the run is
     called. The rival finishing one is simply the run lost — the defeat scene
     has its own staging and does not want a pause bolted in front of it. */
  wonderRaised(b) {
    if (!S || S.over) return;
    const w = this.wonderDef();
    if (b.owner !== 'P') {
      this.log(`The rival has raised ${w.name}.`, true);
      this.end(false, `The rival raised ${w.name} while your masons idled. The age will remember their name, not yours.`);
      return;
    }
    if (this._marvel) return;
    this._marvel = true;
    S.paused = true;                       // let the valley hold its breath
    this.log(`${w.name} is finished!`, true);
    if (window.R) {
      R.centerOn(Bld.cx(b), Bld.cy(b));
      R.marvel = { x: Bld.cx(b), y: Bld.cy(b), t: 0, name: w.name, blurb: w.blurb };
    }
    setTimeout(() => {
      G._marvel = false;
      if (window.R) R.marvel = null;
      G.end(true, `You raised ${w.name}. ${w.blurb} Long after the last spear has rusted, it will still be standing.`);
    }, CFG.WONDER.marvelMs);
  },
  _marvel: false,   // render/flow only — never in S, so it can't survive a save

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
    if (!data.tunic) data.tunic = { P: 'blue', A: 'red' };   // pre-tunic save: classic blue vs red
    if (!data.map.resAmount) {
      // older save: give surviving resource tiles an average stock
      data.map.resAmount = data.map.terrain.map(t => {
        const r = CFG.RES_AMOUNT[t];
        return r ? Math.round((r[0] + r[1]) / 2) : 0;
      });
    }
    if (!data.garrison) data.garrison = [];
    if (!data.armies) data.armies = {};   // pre-army saves: no standing banners
    if (!Array.isArray(data.ashes)) data.ashes = [];   // pre-burn saves: no smouldering ground
    // pre-sapper saves: no bridges, and rebuild the fast passability mirror
    if (!Array.isArray(data.bridges)) data.bridges = [];
    if (!Array.isArray(data.map.bridge)) data.map.bridge = new Array(w * h).fill(0);
    for (const br of data.bridges) if (br) {
      data.map.bridge[br.y * w + br.x] = 1;
      if (br.level == null) br.level = 1;                 // pre-level saves: default L1 timber
      if (!br.dir) br.dir = 'h';
      if (br.maxhp == null) br.maxhp = (CFG.BRIDGE.levels[(br.level || 1) - 1] || CFG.BRIDGE.levels[0]).hp;
      if (br.upgrading == null) br.upgrading = 0;   // pre-timer saves: reinforcing used to be instant
    }
    // pre-drawbridge saves: every gate stood open, and always could
    for (const b of data.buildings) if (b && b.key === 'gate' && b.raised == null) b.raised = false;
    /* PRE-FOOTPRINT saves: the primary works (barracks, range, stable, siege,
       sapper, trade, warcamp, dock) were 1×1 when these towns were built, and
       their neighbours are packed against them accordingly. Stamp each one
       with the footprint it was RAISED on, not the one its key claims today —
       otherwise every one of them grows a row and a column on load and eats
       whatever was standing there. Grandfathered, never migrated: the town
       loads exactly as it was left, and new construction is 2×2 from here.
       (tests/footprint.mjs measures a real pre-change save for overlaps.) */
    for (const b of data.buildings) if (b && !b.sz) b.sz = Bld.legacySize(b.key);
    /* RETIRED HULLS (the dock's four-vessel roster). The generic Warship and
       the War Transport no longer exist as unit kinds, and a save full of them
       would put `undefined` through every CFG.UNITS[u.kind] lookup in the game
       — a crash on load, not a cosmetic problem. So they are RECREWED, not
       deleted: nobody loses a ship they paid for.
         warship      → fireship   (the surviving fighting hull)
         bigtransport → transport  (which now carries 5 anyway, so the
                                    player's capacity is unchanged)
       Cargo rides along untouched. Training queues are migrated too — a yard
       part-way through building a retired hull finishes its replacement
       instead of stalling on a key that is gone. */
    const RECREW = { warship: 'fireship', bigtransport: 'transport' };
    for (const u of (data.units || [])) if (u && RECREW[u.kind]) u.kind = RECREW[u.kind];
    for (const bd of (data.buildings || []))
      for (const q of (bd && bd.queue) || []) if (q && RECREW[q.unit]) q.unit = RECREW[q.unit];
    if (data.ai && !data.ai.persona) data.ai.persona = 'homesteader';   // pre-persona save: the classic temperament
    if (!data.kraken) data.kraken = { day: { P: 60, A: 90 }, done: {}, ev: null };   // older saves owe the deep a visit too
    if (!data.dragon) data.dragon = { avail: false, done: true, ev: null, ash: [] };  // legacy runs: no dragon this time
    if (!data.dragon.fire) data.dragon.fire = [];
    if (!data.sons) data.sons = { avail: false, done: true };   // legacy: no sons this run
    if (!data.cache) data.cache = { avail: false, done: true, ev: null };
    if (data.breachedP === undefined) data.breachedP = false;
    if (data.trainDiscount === undefined) data.trainDiscount = 0;
    if (!data.winter) data.winter = { avail: false, done: true, days: 0 };
    if (!data.plague) data.plague = { avail: false, done: true, until: 0, lifted: true };
    // legacy saves predate the one-event registry: derive S.special from what
    // the old flags had armed (dragon first — it was the rarer roll)
    if (data.special === undefined) {
      data.special = data.dragon.avail && !data.dragon.done ? 'dragon'
        : (data.kraken.ev || !(data.kraken.done || {}).P) ? 'kraken' : null;
    }
    if (data.kraken.avail === undefined)
      data.kraken.avail = data.special === 'kraken' && !data.kraken.ev;
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
    // pre-RUIN_FADE saves scheduled rubble on the 60-day regrowth clock; bring
    // any tile that is still rubble onto its own shorter one
    for (const k in data.map.decay) {
      if (data.map.terrain[+k] !== T.RUIN) continue;
      const due = data.day + CFG.RUIN_FADE_DAYS;
      if (data.map.decay[k] > due) data.map.decay[k] = due;
    }
    // pre-wonder saves: derive the run's monument from its own seed, exactly
    // as newGame does, so an old save keeps playing with a stable wonder
    if (!data.wonder) data.wonder = G.rollWonder(data.seed).key;
    if (!data.nextDeath) data.nextDeath = 0;   // pre-mortality saves: rolled on the next dayTick
    if (!data.peakTown) data.peakTown = null;  // pre-ease saves: the record starts today (notePeaks)
    /* PRE-PEOPLES SAVES (CFG.TRIBES): every camp is dealt a people and its own
       standing band takes it, so a loaded old game looks exactly like a new
       one from the next frame. Barbarians with no camp take a roll each. The
       deal is off `data.seed`, not the live rng, so loading a save twice deals
       the same peoples — and never disturbs the run's own roll sequence. */
    {
      let n = 0;
      const pick = () => {
        const list = CFG.TRIBES || [];
        if (!list.length) return 'wolf';
        let h = 0; const s = String(data.seed || '') + '::tribe' + (n++);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return list[Math.abs(h) % list.length].key;
      };
      const byCamp = {};
      for (const b of (data.buildings || []))
        if (b.key === 'raidercamp') byCamp[b.id] = (b.tribe = b.tribe || pick());
      for (const u of (data.units || []))
        if ((u.kind === 'raider' || u.kind === 'brute') && !u.tribe) {
          u.tribe = (u.campId && byCamp[u.campId]) || pick();
          if (u.female == null) u.female = Math.random() < 0.5;
        }
    }
    if (!data.map.fishBack) data.map.fishBack = {};   // pre-fishery saves: no shoals on the clock yet
    if (!data.map.hunted) data.map.hunted = {};       // pre-worked-ground saves: the record starts empty
    if (!data.corpses) data.corpses = [];             // pre-corpse saves: no remains on the ground yet
    if (!data.workLost) data.workLost = { P: [], A: [] };   // pre-ease-reshape saves: empty ledger
    if (!data.eased) data.eased = { P: false, A: false };   // …and no latch held
    if (!data.map.reclaimed) data.map.reclaimed = {};
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
    this.setWonder(S.wonder);   // name, blurb and artwork follow the saved roll
    S.paused = true;
    document.getElementById('btnPause').textContent = '▶';
    UI.deselect();
    if (UI.exitPlacement) UI.exitPlacement();   // a load mid-placement cancels the mode whole
    UI._healLog = {};   // see newGame — a loaded save must not inherit a stale cooldown
    this._marvel = false;   // a save loaded mid-marvel is just a save
    this._dying = null;     // …and an announced-but-unfallen villager lives
    this._easeC = null;    // the ease day-cache must not leak across runs (day numbers collide)
    this.freeVis = false;
    this.vis = null;
    Units.clampToBoard();   // pull any unit off the (now impassable) map rim — e.g. a pre-border save
    R.onNewGame();
    this.updateVisibility();
    this.warmTribes();      // build the resident peoples' rigs here, not on first sighting
    if (S.over) UI.showEnd(S.over.win, S.over.msg);
  },

  /* ---------------- main loop ---------------- */
  // run one subsystem for the frame, but NEVER let a thrown error escape and
  // kill the animation loop — a single unhandled exception used to leave the
  // game frozen solid (loop dead, only the DOM menu still alive). Each step is
  // isolated so a fault in one (say combat) can't stop the others or rendering;
  // the error is recorded (G.lastFrameError) and logged once so the true cause
  // is diagnosable, and the game keeps running.
  _safe(fn, tag) {
    try { fn(); }
    catch (e) {
      G.lastFrameError = tag + ' — ' + ((e && e.stack) || String(e));
      const key = tag + '|' + String(e);
      if (G._lastErrKey !== key) {
        G._lastErrKey = key;
        try { console.error('[Clanfire] recovered from a ' + tag + ' error (loop continues):', e); } catch (_) {}
        if (window.UI && UI.toast) { try { UI.toast('⚠️ Hit a ' + tag + ' glitch but recovered — game continues', true); } catch (_) {} }
      }
    }
  },
  frame(t) {
    const dt = Math.min(0.1, (t - G.lastT) / 1000 || 0.016);
    G.lastT = t;
    if (S && !S.paused && !S.over) {
      const dtDays = dt * 1000 / CFG.DAY_MS;
      S.playtime = (S.playtime || 0) + dt;
      G._safe(() => {
        S.dayT += dt * 1000;
        let guard = 0;
        while (S.dayT >= CFG.DAY_MS && guard++ < 4) {
          S.dayT -= CFG.DAY_MS;
          G.dayTick();
          if (!S || S.over) break;
        }
      }, 'day');
      if (S && !S.over) {
        G._safe(() => Bld.update(dtDays), 'buildings');
        G._safe(() => Units.update(dt), 'units');
        G._safe(() => Combat.update(dt), 'combat');
        G._safe(() => {
          G.dyingTick(dt);       // the villager whose death was announced a beat ago
          G.krakenTick(dt);
          G.dragonTick(dt);
          G.dragonT = (G.dragonT || 0) - dt;
          if (G.dragonT <= 0) {
            G.dragonT = 1.3;   // the special-event pulse: each maybe* self-gates on its armed state
            G.maybeDragon(); G.maybeSons();
            if (G.maybeCache) G.maybeCache();
            if (G.maybeWinter) G.maybeWinter();
            if (G.maybePlague) G.maybePlague();
          }
          G.visT -= dt;
          if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
          /* G.autosave is GONE, on purpose: it serialized the ENTIRE game
             state (a multi-megabyte JSON.stringify) every 10 real seconds
             into a field nothing ever read — a metronome of frame hitches
             for zero benefit. The real safety nets are Backend.autosaveNow
             (cadence + tab-hide), which drops the local crash snapshot. */
        }, 'world');
      }
    }
    if (S) {
      G._safe(() => R.draw(dt), 'render');
      G._safe(() => UI.refresh(dt), 'ui');
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
