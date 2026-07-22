"use strict";
/* Clanfire — static game configuration (stat tables). */

const T = {
  GRASS: 0, FOREST: 1, WATER: 2, HILLS: 3, FERTILE: 4, CAMP: 5,
  STUMPS: 6, PEBBLES: 7, BARREN: 8, RUIN: 9,   // depleted / destroyed variants
  MOUNTAIN: 10,                                 // impassable, unbuildable
  TRENCH: 11,                                   // sapper-dug ditch — blocks land, not ranged fire
  MOAT: 12,                                     // a trench that flooded from a water source — blocks land, boats can't cross either
  MOUND: 13,                                    // sapper-raised earthwork — passable but 4x slower to cross; or reclaimed land where water was
};

const CFG = {
  SAVE_VERSION: 2,     // bump when the save shape changes; loadJSON migrates older saves
  TILE: 32,
  W: 40,               // current map size — set per game from SIZES
  H: 40,
  SIZES: { medium: 38, large: 50, xlarge: 65 },   // ~25% bigger boards (was 30/40/52)
  DAY_MS: 10000,              // one in-game day
  START_RES: { food: 200, wood: 150, stone: 60, gold: 15 },   // baseline (openings roll around it)
  START_VILLAGERS: 3,                                          // baseline (openings roll around it)

  /* VARIABLE OPENINGS — every game rolls the player's start package from
     these bands (see G.rollStart). Core principle: weighted tendencies
     within bounds, never fixed rules. All rolls use the seeded RNG, so a
     seed reproduces its opening exactly. */
  OPENING: {
    villagers: { calm: [3, 5], moderate: [2, 4], hard: [1, 3] },
    res: { food: [90, 330], wood: [60, 260], stone: [15, 110], gold: [0, 45] },
    scarceLean: 90,      // the package leans AGAINST the map: scarce res gets this much back
    dryLean: 45,         // spawned far from water → a little extra food
    extras: [            // low odds each; almost never more than one
      { key: 'defender', p: 0.10 },
      { key: 'scout',    p: 0.08 },
      { key: 'building', p: 0.08 },
      { key: 'cache',    p: 0.10 },
    ],
    minEcon: 480,        // clamp floor: food + wood + .8*stone + .5*gold + 90/villager
  },
  UNIT_VISION: 3,
  BUILD_RANGE: 8,             // new buildings must be this close to an existing one
  GATHER: {                   // villager gather rate per second, by terrain
    [T.FOREST]:  { res: 'wood',  rate: 0.8 },
    [T.HILLS]:   { res: 'stone', rate: 0.6 },
    [T.FERTILE]: { res: 'food',  rate: 1.0 },
  },
  RES_AMOUNT: {               // starting stock per resource tile [min, max]
    [T.FOREST]:  [80, 140],
    [T.HILLS]:   [70, 130],
    [T.FERTILE]: [80, 140],
    [T.WATER]:   [45, 85],    // fish — harvested by boats, not villagers
  },
  FISH: { res: 'food', rate: 1.2 },   // fishing-boat harvest per second (12/day — a notch under a Lv1 farm's 15)
  SHORE_FISH: { rate: 1.0 },  // villager line-fishing off the shore — same pace as picking berries;
                              // only works on shoals (about a third of shore water, where fish jump)
  DOCK_MIN_WATER: 6,          // a dock needs a water body at least this big
  /* TRADING POST exchange — resource → gold, tuned to be a stingy relief valve.
     Per Trading-Post level: `input` resource units are consumed per caravan,
     `rate` gold is minted per input unit (better at higher levels, still poor),
     and `delay` game-days pass before the caravan returns with the gold. Higher
     levels trade at a better rate but demand a far larger load per run, so gold
     never becomes cheap. gold per trade = floor(input * rate). Tune freely. */
  TRADE: {
    goods: ['food', 'wood', 'stone'],   // which surpluses may be sold
    levels: [
      { input: 80,  rate: 0.10, delay: 1.5 },   // L1: 80 goods → 8 gold  (worst rate, small load)
      { input: 180, rate: 0.14, delay: 2.0 },   // L2: 180 goods → 25 gold (better rate, bigger load)
      { input: 360, rate: 0.18, delay: 2.5 },   // L3: 360 goods → 64 gold (best rate, largest load)
    ],
  },
  DEPLETED: {                 // what a tile becomes once gathered out
    [T.FOREST]:  T.STUMPS,
    [T.HILLS]:   T.PEBBLES,
    [T.FERTILE]: T.BARREN,
  },
  DEMOLISH_REFUND: 0.4,       // fraction of spent resources returned on demolish
  RUIN_DECAY_DAYS: 60,        // base days before stumps/pebbles/spent soil regrow (ruins fade to grass) — cleared land stays cleared a good while
  REGROW_MULT: {              // per-terrain regrowth-time multiplier over the base
    [T.STUMPS]:  2,           // felled forest — twice as slow to grow back
    [T.BARREN]:  2,           // spent orchard/berry soil — twice as slow
    [T.PEBBLES]: 3,           // quarried stone — three times as slow (rock is slowest)
  },
  REGROW_FRACTION: 0.5,       // regrown resource tiles come back at half a fresh stock — slow but never zero
  TC_POP_CAP: [20, 40, 60],   // hard population ceiling by Town Center level — houses only help up to this

  /* WALL UPGRADES aren't instant — masons take days, and the Town Center is
     tied up managing the works (no training / no other upgrades) until done.
     Days to raise EVERY wall & gate one level, indexed by current wall level
     (L1→L2, then L2→L3 a little longer). */
  WALL_UPGRADE_DAYS: [2, 3.5],

  /* FOOD UPKEEP — every mouth eats, every day (see Units.foodUpkeep +
     G.applyFoodUpkeep). Food was a constant constraint through all of ancient
     history: an army you can't feed melts away. Per-unit food/day by role;
     when the granary runs dry, soldiers desert (villagers never do — the town
     must survive to farm its way back). Tune here. */
  FOOD_UPKEEP: {
    villager: 1.0,   // villagers & sappers — the working mouths
    military: 1.5,   // foot soldiers & archers
    cavalry: 2.0,    // riders eat for horse and man both
    siege: 1.5,      // engine crews
    boat: 0.5,       // a hull's small crew (fishing boat / transport)
    warship: 1.0,    // a fighting ship's crew
    cargo: 1.5,      // each soldier riding a transport still eats
  },
  FAMINE_DESERT_DAYS: 1.5,    // days of unbroken famine between desertions

  /* ---- Buildings: 8 types x 3 levels. Level index = level-1. ----
     cost: resources to build/upgrade to this level
     time: build/upgrade time in days
     out: passive production per day
     near: adjacency bonus — output x mult if terrain within radius (0 = on tile) */
  BUILDINGS: {
    tc: {
      name: 'Town Center', unique: true, vision: true,
      size: 2,   // the founding camp claims a 2×2 footprint (every other building is 1×1)
      desc: 'Heart of the village. Trains villagers, stores goods.',
      train: { villager: { cost: { food: 50 }, time: 1 } },
      levels: [
        { cost: {},                                time: 0, hp: 500,  pop: 5,  out: { gold: 4 }, vision: 6 },
        { cost: { wood: 200, stone: 150, gold: 30 }, time: 3, hp: 800,  pop: 8,  out: { gold: 8 }, vision: 7 },
        { cost: { wood: 400, stone: 300, gold: 80 }, time: 4, hp: 1200, pop: 12, out: { gold: 12 }, vision: 8,
          bonus: '+10% production to all buildings' },
      ],
    },
    farm: {
      name: 'Farm', desc: 'Steady food while a villager works it. Thrives beside fertile soil.', needsWorker: true,
      near: { terrain: T.FERTILE, mult: 1.5, radius: 1 },
      levels: [
        { cost: { wood: 60, gold: 5 },     time: 1, hp: 100, out: { food: 15 } },
        { cost: { wood: 120, stone: 40, gold: 10 }, time: 2, hp: 140, out: { food: 30 } },
        { cost: { wood: 240, stone: 100, gold: 25 }, time: 2, hp: 180, out: { food: 50 } },
      ],
    },
    lodge: {
      name: "Hunter's Lodge", desc: 'Food per worker (up to 2). Build near forest.', needsWorker: true,
      maxWorkers: 2,
      near: { terrain: T.FOREST, mult: 1.5, radius: 2 },
      levels: [    // out is PER WORKER — a lone hand yields less than raw foraging
        { cost: { wood: 50, gold: 5 },    time: 1, hp: 120, out: { food: 4.5 } },
        { cost: { wood: 100, stone: 30, gold: 10 }, time: 2, hp: 160, out: { food: 9 } },
        { cost: { wood: 200, stone: 80, gold: 25 }, time: 2, hp: 200, out: { food: 14 },
          bonus: 'Villagers armed with spears (+4 attack)' },
      ],
    },
    /* Lumber camp and quarry are deliberately cross-costed and available from
       TC 1: the quarry never costs stone and the camp never costs wood, so a
       map starved of one resource always leaves a road back to it. */
    lumber: {
      name: 'Lumber Camp', desc: 'Wood per worker (up to 2). Build near forest.', needsWorker: true,
      maxWorkers: 2,
      near: { terrain: T.FOREST, mult: 1.5, radius: 2 },
      levels: [    // out is PER WORKER — a lone hand yields less than chopping forest
        { cost: { stone: 25, gold: 5 },   time: 1, hp: 120, out: { wood: 5 } },
        { cost: { stone: 60, gold: 10 },  time: 2, hp: 160, out: { wood: 10 } },
        { cost: { stone: 130, gold: 25 }, time: 2, hp: 200, out: { wood: 16 } },
      ],
    },
    quarry: {
      name: 'Quarry', desc: 'Stone per worker (up to 2). Build near hills.', needsWorker: true,
      maxWorkers: 2,
      near: { terrain: T.HILLS, mult: 1.5, radius: 2 },
      levels: [    // out is PER WORKER — a lone hand yields less than mining hills
        { cost: { wood: 80, gold: 5 },    time: 1, hp: 120, out: { stone: 3.5 } },
        { cost: { wood: 170, gold: 10 },  time: 2, hp: 170, out: { stone: 7 } },
        { cost: { wood: 320, gold: 25 },  time: 2, hp: 220, out: { stone: 12 } },
      ],
    },
    house: {
      name: 'House', desc: 'Raises population cap.',
      levels: [
        { cost: { wood: 30 },             time: 1, hp: 80,  pop: 4 },
        { cost: { wood: 70 },             time: 1, hp: 110, pop: 7 },
        { cost: { wood: 140, stone: 40 }, time: 2, hp: 140, pop: 10 },
      ],
    },
    tower: {
      // fortifications got a real HP curve (siege engines exist now) — and a
      // matching price curve. L1 stays affordable: it's the early-game shield.
      name: 'Watchtower', desc: 'Shoots raiders and beasts. Extends vision.', vision: true,
      levels: [
        { cost: { wood: 45, stone: 45 },              time: 2, hp: 420,  atk: 8,  range: 4.5, vision: 6 },
        { cost: { wood: 110, stone: 130, gold: 10 },  time: 2, hp: 950,  atk: 13, range: 5,   vision: 7 },
        { cost: { wood: 220, stone: 260, gold: 25 },  time: 3, hp: 1900, atk: 19, range: 5.5, vision: 8,
          bonus: 'Signal fire: nearby defenders +2 attack' },
      ],
    },
    siege: {
      name: 'Siege Workshop', reqTC: 3,
      desc: 'Engines of war — catapults that crush stone, and towers that top walls.',
      train: {
        catapult:   { cost: { wood: 180, stone: 50, gold: 30 }, time: 3 },
        ballista:   { cost: { wood: 160, stone: 30, gold: 25 }, time: 2.5, reqLevel: 2 },
        siegetower: { cost: { wood: 220, stone: 40, gold: 40 }, time: 3.5, reqLevel: 3 },
        trebuchet:  { cost: { wood: 280, stone: 140, gold: 70 }, time: 4.5, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 200, stone: 80, gold: 30 },   time: 3, hp: 380 },
        { cost: { wood: 300, stone: 160, gold: 50 },  time: 3, hp: 520,
          bonus: 'Unlocks Ballista' },
        { cost: { wood: 450, stone: 280, gold: 80 },  time: 4, hp: 700,
          bonus: 'Unlocks Siege Tower' },
      ],
    },
    barracks: {
      name: 'Barracks', desc: 'Trains defenders to protect the village.',
      train: {
        defender: { cost: { food: 40, wood: 30, gold: 5 }, time: 1 },
        axeman:   { cost: { food: 50, wood: 40, gold: 8 }, time: 1.2, reqLevel: 2 },
        elite:    { cost: { food: 90, wood: 30, gold: 35 }, time: 2.4, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 100, stone: 50, gold: 15 },  time: 2, hp: 300 },
        { cost: { wood: 180, stone: 120, gold: 30 }, time: 2, hp: 420,
          bonus: 'Unlocks Axeman' },
        { cost: { wood: 300, stone: 220, gold: 50 }, time: 3, hp: 560,
          bonus: 'Unlocks Bronze Champion' },
      ],
    },
    stable: {
      name: 'Horse Stable', desc: 'Trains fast riders to run down raiders.', reqTC: 2,
      train: {
        rider:  { cost: { food: 60, wood: 20, gold: 8 }, time: 1 },
        horsearcher: { cost: { food: 70, wood: 30, gold: 15 }, time: 1.5, reqLevel: 2 },
        lancer: { cost: { food: 100, gold: 25 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 120, stone: 30, gold: 20 },  time: 2, hp: 320 },
        { cost: { wood: 200, stone: 100, gold: 35 }, time: 2, hp: 450,
          bonus: 'Unlocks Horse Archer' },
        { cost: { wood: 320, stone: 200, gold: 40 }, time: 3, hp: 600,
          bonus: 'Unlocks Lancer' },
      ],
    },
    range: {
      name: 'Archery Range', desc: 'Trains archers who fight from a distance.', reqTC: 2,
      train: {
        archer:   { cost: { food: 40, wood: 40, gold: 6 }, time: 1 },
        longbow:  { cost: { food: 40, wood: 60, gold: 10 }, time: 1.2, reqLevel: 2 },
        marksman: { cost: { food: 70, wood: 45, gold: 30 }, time: 2.2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 90, stone: 20, gold: 15 },   time: 2, hp: 280 },
        { cost: { wood: 160, stone: 80, gold: 30 },  time: 2, hp: 400,
          bonus: 'Unlocks Longbowman' },
        { cost: { wood: 280, stone: 160, gold: 40 }, time: 3, hp: 520,
          bonus: 'Unlocks Fire Archer' },
      ],
    },
    // The terraforming corps. Trains Sappers who reshape the map: dig trenches
    // (they flood into moats beside water), build bridges, and breach resource
    // walls. The building's LEVEL gates the tiers — L1 trenches, L2 bridges,
    // L3 clearing (Bld handles the tier gate in the work order).
    sapper: {
      name: "Sappers' Camp", desc: 'Trains sappers who reshape the land — dig trenches & moats, bridge water, breach resource walls.', reqTC: 2,
      train: {
        sapper: { cost: { food: 30, wood: 40, gold: 10 }, time: 1.4 },
      },
      levels: [
        { cost: { wood: 120, stone: 60, gold: 15 },  time: 2, hp: 300, bonus: 'Sappers dig trenches & moats' },
        { cost: { wood: 200, stone: 130, gold: 30 }, time: 2, hp: 420, bonus: 'Sappers build bridges over water' },
        { cost: { wood: 320, stone: 220, gold: 50 }, time: 3, hp: 560, bonus: 'Sappers clear resource tiles (open ground)' },
      ],
    },
    // FORWARD OPERATING BASE — the only building you can plant away from your
    // settlement. It anchors military construction around it (a mini Town Center for
    // the front line), looses arrows like a Watchtower, and mends troops that stand
    // beside it. No upgrades, and it falls fast — and it shows up on the enemy's map,
    // so a forward camp is a bet, not a free win. Capped so it can't blanket the map.
    warcamp: {
      name: 'War Camp', reqTC: 3, max: 2, freePlace: true, staging: true,
      desc: 'Forward base — raise it anywhere you have scouted, then build military structures around it. Shoots arrows, heals nearby soldiers. No upgrades; falls easily; the enemy sees it.',
      levels: [
        { cost: { wood: 350, stone: 250, gold: 150 }, time: 3, hp: 300, atk: 8, range: 4.5, vision: 6 },
      ],
    },
    dock: {
      name: 'Dock', desc: 'Built on open water (6+ tiles). Fishing boats harvest fish; warships defend the coast.',
      reqTC: 2,   // needs Town Center level 2 before it can be placed
      train: {
        fishboat: { cost: { wood: 40, gold: 5 }, time: 1 },
        transport: { cost: { wood: 60, gold: 10 }, time: 1.5 },
        warship:  { cost: { wood: 80, gold: 20 }, time: 2, reqLevel: 2 },
        bigtransport: { cost: { wood: 120, gold: 30 }, time: 2, reqLevel: 3 },
        fireship: { cost: { wood: 130, gold: 45 }, time: 2.5, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 60, gold: 5 },              time: 2, hp: 220, vision: 5 },
        { cost: { wood: 100, stone: 40, gold: 15 }, time: 2, hp: 340, vision: 6,
          bonus: 'Unlocks Warship' },
        { cost: { wood: 160, stone: 90, gold: 30 }, time: 3, hp: 480, vision: 7,
          bonus: 'Unlocks Fire Warship & War Transport' },
      ],
    },
    /* Trading Post — a late-game relief valve: turn a surplus of food/wood/stone
       into a trickle of gold. Deliberately expensive to raise and stingy to run
       (see CFG.TRADE), so gold stays precious. TC-3 gated. */
    trade: {
      name: 'Trading Post', desc: 'Send caravans out to trade surplus food, wood or stone for gold. Costly to run — gold stays precious.', reqTC: 3,
      levels: [
        { cost: { wood: 260, stone: 180, gold: 40 },  time: 3, hp: 300, bonus: 'Trade goods → gold (small loads, poor rate)' },
        { cost: { wood: 420, stone: 320, gold: 80 },  time: 3, hp: 420, bonus: 'Better rate — but each caravan hauls more' },
        { cost: { wood: 640, stone: 500, gold: 140 }, time: 4, hp: 560, bonus: 'Best rate — largest caravan loads' },
      ],
    },
    /* Wall HP is tuned against soldier dps (defender ≈ 8/s vs buildings):
       L1 falls to a couple of soldiers in ~20s, L2 needs a real party working
       at it, L3 is effectively siege-engine territory (10 soldiers ≈ 30s+).
       Costs rose to match the stronger stone. */
    wall: {
      name: 'Wall', desc: 'Blocks all movement — friend and foe. Enemies must break it.',
      levels: [
        { cost: { wood: 20 },             time: 1, hp: 300 },   // stick-and-grass palisade
        { cost: { stone: 70, gold: 8 },   time: 1, hp: 900 },   // stone wall
        { cost: { stone: 150, gold: 15 }, time: 2, hp: 2600 },  // dressed stone
      ],
    },
    gate: {
      name: 'Town Gate', desc: 'Your people pass through; enemies must break it.',
      levels: [
        { cost: { wood: 55, gold: 12 },              time: 1, hp: 350 },
        { cost: { wood: 80, stone: 70, gold: 25 },   time: 1, hp: 800 },
        { cost: { wood: 130, stone: 150, gold: 50 }, time: 2, hp: 2200 },
      ],
    },
  },

  UNITS: {
    villager: { name: 'Villager',       hp: 40,  atk: 2,  def: 0, speed: 2.2, aggro: 0 },
    sapper:   { name: 'Sapper',         hp: 55,  atk: 3,  def: 1, speed: 2.2, aggro: 0, sapper: true },  // engineer: lightly defended, reshapes terrain — must be protected while it works
    defender: { name: 'Defender',       hp: 60,  atk: 8,  def: 2, speed: 2.4, aggro: 5 },
    // level-2 unlocks: sharper tools with sharper edges — each trades
    // something real for its specialty
    axeman:   { name: 'Axeman',         hp: 55,  atk: 11, def: 0, speed: 2.3, aggro: 5,   bldMult: 1.6 },  // shock troop, chews buildings; no armor
    longbow:  { name: 'Longbowman',     hp: 40,  atk: 6,  def: 0, speed: 2.2, aggro: 6,   rng: 5, cdMult: 1.4 },  // longest human reach; slow, frail
    horsearcher: { name: 'Horse Archer', hp: 55, atk: 6,  def: 0, speed: 3.4, aggro: 5.5, rng: 3 },  // bow at full gallop; light and pricey
    ballista: { name: 'Ballista',       hp: 140, atk: 18, def: 1, speed: 1.0, aggro: 5.5, rng: 5.5, cdMult: 2.0, proj: 'bolt' },  // unit-killer bolt thrower; crawls
    elite:    { name: 'Bronze Champion', hp: 125, atk: 15, def: 4, speed: 2.3, aggro: 5 },  // bronze-age heavy: sword, round shield, cuirass — the premier defender
    rider:    { name: 'Rider',          hp: 70,  atk: 9,  def: 1, speed: 3.4, aggro: 5 },
    lancer:   { name: 'Lancer',         hp: 110, atk: 13, def: 3, speed: 3.2, aggro: 5 },
    archer:   { name: 'Archer',         hp: 45,  atk: 7,  def: 0, speed: 2.3, aggro: 5.5, rng: 3.5 },
    marksman: { name: 'Fire Archer',    hp: 60,  atk: 11, def: 1, speed: 2.3, aggro: 6,   rng: 5, fire: true },  // flaming arrows: longest human reach, fire-tipped shots
    wolf:     { name: 'Wolf',           hp: 24,  atk: 4,  def: 0, speed: 2.4, aggro: 4 },
    boar:     { name: 'Boar',           hp: 48,  atk: 6,  def: 1, speed: 1.8, aggro: 2 },
    bear:     { name: 'Bear',           hp: 110, atk: 13, def: 2, speed: 2.2, aggro: 3.5 },  // very rare forest terror
    raider:   { name: 'Barbarian',       hp: 50,  atk: 7,  def: 1, speed: 2.3, aggro: 2.5 },
    brute:    { name: 'Barbarian Brute', hp: 95,  atk: 12, def: 2, speed: 1.9, aggro: 2.5 },
    deer:     { name: 'Deer',           hp: 20,  atk: 0,  def: 0, speed: 2.0, aggro: 0 },
    cow:      { name: 'Wild Cow',       hp: 35,  atk: 0,  def: 0, speed: 1.2, aggro: 0 },
    // naval — these move only on water
    fishboat: { name: 'Fishing Boat',   hp: 35,  atk: 0,  def: 0, speed: 2.4, aggro: 0,   naval: true },
    warship:  { name: 'Warship',        hp: 95,  atk: 9,  def: 1, speed: 2.6, aggro: 5,   naval: true, rng: 4 },
    fireship: { name: 'Fire Warship',   hp: 140, atk: 14, def: 2, speed: 2.6, aggro: 5.5, naval: true, rng: 4.5, fire: true },
    // troop transports: no weapons, just a hull — cap = soldiers carried
    transport:    { name: 'Transport Raft', hp: 80,  atk: 0, def: 1, speed: 2.2, aggro: 0, naval: true, cap: 3 },
    bigtransport: { name: 'War Transport',  hp: 130, atk: 0, def: 2, speed: 2.4, aggro: 0, naval: true, cap: 5 },
    // siege engines: slow, deliberate, decisive. The catapult lobs boulders
    // (bldAtk vs structures, cdMult stretches its reload); the siege tower
    // carries no weapon — parked on an enemy wall it ferries one nearby
    // soldier per second over the top.
    catapult:   { name: 'Catapult',    hp: 180, atk: 8, def: 1, speed: 1.0, aggro: 0, rng: 5.5, cdMult: 2.5, bldAtk: 110, proj: 'stone' },
    siegetower: { name: 'Siege Tower', hp: 170, atk: 0, def: 0, speed: 1.0, aggro: 0 },
    // trebuchet: the endgame engine — hurls a flaming counterweight ball the
    // FARTHEST (outranges towers), hits HARDEST vs stone, but crawls and reloads
    // slowest; fragile and pricey, so it's a payoff, not an auto-win
    trebuchet:  { name: 'Trebuchet',   hp: 160, atk: 6, def: 1, speed: 0.85, aggro: 0, rng: 8, cdMult: 4.0, bldAtk: 200, proj: 'flame', fire: true },
  },

  /* SAPPER terraforming — deliberate tactical work, protected by an army. Work
     times are seconds per tile: fast enough to reshape a lane in a fight, slow
     enough that it's an investment (and far slower than a resource depletes by
     gathering, ~120s+, yet clearing here is much FASTER than that — it's demolition,
     not harvest). Tune here. */
  TERRAFORM: {
    dig: 5,          // dig a trench tile
    bridge: 6,       // raise a bridge over water
    clear: 4,        // breach a resource tile → open grass (demolition, not gathering)
    clearYield: 0,   // resource returned when clearing (0 = mobility tool, not an economy exploit)
    /* MOUND (Sappers' Camp Lv 3) — raise an earth berm on open ground (passable
       but 4x slower to cross, friend and foe) or RECLAIM land from water. The one
       terraform that costs resources: quarry-heavy + some wood, so paving is a
       real commitment. Reclamation is deliberately slow and hard-capped so short
       land-bridges are fine but nobody fills an ocean (see Terraform.reclaimDepth):
         • only within `reclaimReach` tiles of the ORIGINAL shoreline
         • the far (deep) tile takes `reclaimDeep`, twice the shallow time
       Deep water stays the domain of transports and warships. */
    mound: 6,          // raise a berm on open land (seconds/tile)
    reclaim: 10,       // fill a shallow water tile (1 from shore)
    reclaimDeep: 20,   // fill the deep tile (2 from shore) — twice as slow
    reclaimReach: 2,   // max tiles from natural land you may reclaim (2 = shallow + one deep)
    moundCost: { stone: 35, wood: 10 },   // per tile — lots of quarry, some wood
    moundCross: 0.25,  // a unit crosses a mound at 1/4 speed (4x longer)
  },
  /* BRIDGES — a sapper raises a level-1 timber crossing; it can then be upgraded
     to L2/L3 (stone piers, then a stone arch), each stouter and costing a bit
     MORE than the matching tower upgrade. Attackable — protect your crossings. */
  BRIDGE: {
    levels: [
      { hp: 220 },                                              // L1 timber (sapper-built)
      { hp: 480, cost: { wood: 120, stone: 140, gold: 15 } },   // L2 stone piers
      { hp: 900, cost: { wood: 240, stone: 300, gold: 35 } },   // L3 stone arch
    ],
  },

  MEAT_DROP: 10,               // food gained when a wild animal is killed
  PASSIVE_MAX: 2,              // grazing animals (deer/cow) kept on the map
  HEAL_FOOD: { villager: 50, defender: 40, elite: 110,
               rider: 60, lancer: 100, archer: 40, marksman: 70,
               fishboat: 30, warship: 70, fireship: 110,
               transport: 50, bigtransport: 90,
               catapult: 90, siegetower: 80,
               axeman: 45, longbow: 45, horsearcher: 65, ballista: 85 },  // full-heal cost scales with missing hp

  // units may only be healed on home ground — no patching up in an enemy camp.
  // Land units heal in the town-center grounds; ships heal by a dock. The
  // boundary grows 15% per building level (L2 ×1.15, L3 ×1.15²).
  HEAL_RADIUS: 5,          // tiles from the TC centre at level 1
  HEAL_DOCK_TOUCH: 2,      // ships repair at ANY owned dock, but must be touching it or ≤1 tile off (from the dock's edge)
  HEAL_RADIUS_STEP: 0.15,

  // "group nearby / group fleet" and double-tap-select-same-type both gather units
  // within this radius (tiles) of the tapped one — one grouping sphere for both
  GROUP_R: 6,

  // WAR CAMP: soldiers standing within this many tiles of a forward camp are mended
  // (a field hospital), and the only structures you may raise at a forward camp are
  // these military/support ones — no relocating your economy to the front line.
  WARCAMP_HEAL: 1.5,
  STAGING_BUILD: ['barracks', 'stable', 'range', 'siege', 'sapper', 'tower', 'wall', 'gate', 'warcamp'],

  // barbarian pressure: a spice, not a kingmaker — bands come less often and
  // smaller than they used to, tipping fights without deciding them
  WAVES: { minGap: 14, maxGap: 20, scaleHp: 0.07, scaleAtk: 0.05 },
  ANIMALS: { graceDays: 8, minDistTC: 12, leash: 7 },

  /* Difficulty modes. gather/output scale player income; wave* shape barbarian
     pressure; barbMult scales barbarian hp/atk (1.2 on Hard ≈ rival defenders);
     animal* cap wildlife; aiRaidDay is the rival's earliest attack. */
  /* Arcade scoring (see js/score.js — THE RULE: every new feature feeds a
     line here). Tuned so an average Moderate victory lands 5,000–10,000;
     Calm halves it, Hard nearly doubles it. */
  SCORE: {
    victory: 1500,
    speedBase: 2400, speedPerDay: 14,      // long games bleed the speed bonus dry
    perKill: 9, perRazed: 40,
    perBuilt: 30, perWall: 4, perUpgrade: 70, perTrained: 15,
    perPeakPop: 8, perGathered: 0.15, perExploredPct: 14,
    kraken: 500, dragon: 250,   // (originBonus for hard beginnings is computed at roll time)
    leanIn: 120,                // ORIGIN CARDS: kept the card that leans into your roll
    mult: { calm: 0.5, moderate: 1.0, hard: 1.75 },
  },

  /* SPECIAL EVENTS — rare, once-a-game spectacles (the kraken shares this
     category; its tuning lives with the kraken code in game.js). The black
     dragon: Moderate/Hard only, roughly 1 game in 3.5 rolls the chance at
     all, and it only spends it when an enemy army masses at the player's
     gates with the odds stacked against them. */
  DRAGON: { chance: 0.28, minDay: 25, foesMin: 6, radius: 9 },

  /* Difficulty gates the rival's APPETITE and SCALE, never its decision
     quality — the perception → posture → utility → tactics brain runs at
     every level (see js/ai.js). aiAggro is the exploitation appetite
     (higher = commits to pushes on a smaller edge, all-ins more readily);
     aiOutput/aiArmyCap/aiArmyDiv/aiEliteShare scale its economy and army;
     aiRaidDay is only the non-vulnerability raid floor (a real opening
     beats it at all levels). So Calm is smart-but-gentle, Hard is
     smart-and-ruthless — the difference is aggression and scale, not
     blunders. */
  MODES: {
    calm: {
      name: 'Calm', icon: '🌿', desc: 'Nearly peaceful — the odd wild animal keeps you sharp; raids are rare.',
      gather: 1, output: 1,
      waveFirst: 70, waveGapMult: 2.2, waveSizeAdd: -1, barbMult: 0.9,
      animalMax: 2, animalChance: 0.15, aiRaidDay: 80,
      aiBuildEvery: 3, aiOutput: 0.85, aiArmyCap: 6, aiArmyDiv: 11, aiEliteShare: 0.15, aiAggro: 0.55,
    },
    moderate: {
      name: 'Moderate', icon: '⚔️', desc: 'The intended experience.',
      gather: 1, output: 1, finishTC: true,   // one reprieve, then barbarians finish a collapsed clan
      waveFirst: 40, waveGapMult: 1.5, waveSizeAdd: 0, barbMult: 1,
      animalMax: 3, animalChance: 0.2, aiRaidDay: 50,
      // army volume dialed back ~20% from the original 9/8 tuning — playtesting
      // read as relentless; the player needs a breath between pushes. aiEarly
      // further trims the standing-army target before day 100 (see AI.armyWant)
      // so the opening 100 days ramp up more gently.
      aiBuildEvery: 2, aiOutput: 1.1, aiArmyCap: 7, aiArmyDiv: 10, aiEliteShare: 0.45, aiAggro: 0.9, aiEarly: 0.8,
    },
    hard: {
      name: 'Hard', icon: '💀', desc: 'Slower gathering, relentless enemies.',
      // Difficulty lives on the enemy side (more, smarter, better-paced foes),
      // not in stacked player penalties. A single mild gathering tax keeps the
      // "slower gathering" identity without double-dipping production too, and
      // enemy stats are only lightly inflated (1.1×) — the pressure is VOLUME +
      // competence + timing, not stat sponges. barbSpacing keeps a barbarian
      // wave and a rival raid from landing in the same window (see AI.daily).
      gather: 0.90, output: 1.0, finishTC: true,   // one reprieve, then barbarians finish a collapsed clan
      waveFirst: 33, waveGapMult: 0.9, waveSizeAdd: 1, barbMult: 1.1, barbSpacing: true, bandCap: 8,
      animalMax: 4, animalChance: 0.3, aiRaidDay: 32,
      aiBuildEvery: 1, aiOutput: 1.3, aiArmyCap: 13, aiArmyDiv: 6, aiEliteShare: 0.8, aiAggro: 1.2,
    },
  },

  ATTACK_COOLDOWN: 1.0,        // seconds between melee hits
  MELEE_RANGE: 1.15,           // tiles
  REPAIR_RATE: 0.5,            // fraction of max hp restored per day of villager work
  HOME_TURF: { range: 10, mult: 1.1 },  // +10% attack near your own Town Center
  RALLY_RANGE: 10,             // max distance for a building's rally point

  /* DEFEND stance (see Units.guardCenter / Combat). A soldier told to Defend
     holds a perimeter around its Town Center (warships around the nearest Dock)
     and won't be lured across the map: it engages only foes that reach the
     perimeter, may sortie `sortie` beyond it to strike, and returns the moment
     its target falls or it's dragged past the second bound. The perimeter grows
     `levelStep` per building level (TC for land, Dock for ships). */
  GUARD: {
    radius: 6,        // base hold radius around the Town Center (level 1), tiles — a
                      // TIGHT ring (~4-7 tiles): defenders hold the line, they don't
                      // go hunting across the map at the first provocation
    navalRadius: 12,  // base hold radius for warships around a Dock (level 1)
    levelStep: 0.12,  // +12% per building level above 1 (linear)
    maxRadius: 8,     // hard cap on the OPEN-GROUND perimeter (no barrier near)
    sortie: 0.12,     // a slim leash past the hold radius before it's reined back in
    // NATURAL BARRIERS define the defended area too: toward a threat, the bound
    // extends out to whatever closes off the land there — a wall, water, a moat, a
    // treeline/rock, a mountain — up to this reach. So an island town defends its
    // whole island, a walled town its walls, but a town on open ground stays tight.
    maxNatural: 14,
  },
};
