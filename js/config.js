"use strict";
/* Neolithic — static game configuration (stat tables). */

const T = {
  GRASS: 0, FOREST: 1, WATER: 2, HILLS: 3, FERTILE: 4, CAMP: 5,
  STUMPS: 6, PEBBLES: 7, BARREN: 8, RUIN: 9,   // depleted / destroyed variants
  MOUNTAIN: 10,                                 // impassable, unbuildable
};

const CFG = {
  TILE: 32,
  W: 40,               // current map size — set per game from SIZES
  H: 40,
  SIZES: { medium: 30, large: 40, xlarge: 52 },   // labels shifted up a tier; xlarge is the old large
  DAY_MS: 10000,              // one in-game day
  START_RES: { food: 200, wood: 150, stone: 60, gold: 15 },
  START_VILLAGERS: 3,
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
  DEPLETED: {                 // what a tile becomes once gathered out
    [T.FOREST]:  T.STUMPS,
    [T.HILLS]:   T.PEBBLES,
    [T.FERTILE]: T.BARREN,
  },
  DEMOLISH_REFUND: 0.4,       // fraction of spent resources returned on demolish
  RUIN_DECAY_DAYS: 60,        // days before stumps/pebbles/spent soil regrow (ruins fade to grass) — cleared land stays cleared a good while
  REGROW_FRACTION: 0.5,       // regrown resource tiles come back at half a fresh stock — slow but never zero
  TC_POP_CAP: [20, 40, 60],   // hard population ceiling by Town Center level — houses only help up to this

  /* ---- Buildings: 8 types x 3 levels. Level index = level-1. ----
     cost: resources to build/upgrade to this level
     time: build/upgrade time in days
     out: passive production per day
     near: adjacency bonus — output x mult if terrain within radius (0 = on tile) */
  BUILDINGS: {
    tc: {
      name: 'Town Center', unique: true, vision: true,
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
      name: 'Farm', desc: 'Steady food while a villager works it. Thrives on fertile soil.', needsWorker: true,
      near: { terrain: T.FERTILE, mult: 1.5, radius: 0 },
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
        elite:    { cost: { food: 80, wood: 40, gold: 20 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 100, stone: 50, gold: 15 },  time: 2, hp: 300 },
        { cost: { wood: 180, stone: 120, gold: 30 }, time: 2, hp: 420,
          bonus: 'Unlocks Axeman' },
        { cost: { wood: 300, stone: 220, gold: 50 }, time: 3, hp: 560,
          bonus: 'Unlocks Elite Defender' },
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
        marksman: { cost: { food: 70, wood: 60, gold: 15 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 90, stone: 20, gold: 15 },   time: 2, hp: 280 },
        { cost: { wood: 160, stone: 80, gold: 30 },  time: 2, hp: 400,
          bonus: 'Unlocks Longbowman' },
        { cost: { wood: 280, stone: 160, gold: 40 }, time: 3, hp: 520,
          bonus: 'Unlocks Marksman' },
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
    defender: { name: 'Defender',       hp: 60,  atk: 8,  def: 2, speed: 2.4, aggro: 5 },
    // level-2 unlocks: sharper tools with sharper edges — each trades
    // something real for its specialty
    axeman:   { name: 'Axeman',         hp: 55,  atk: 11, def: 0, speed: 2.3, aggro: 5,   bldMult: 1.6 },  // shock troop, chews buildings; no armor
    longbow:  { name: 'Longbowman',     hp: 40,  atk: 6,  def: 0, speed: 2.2, aggro: 6,   rng: 5, cdMult: 1.4 },  // longest human reach; slow, frail
    horsearcher: { name: 'Horse Archer', hp: 55, atk: 6,  def: 0, speed: 3.4, aggro: 5.5, rng: 3 },  // bow at full gallop; light and pricey
    ballista: { name: 'Ballista',       hp: 140, atk: 18, def: 1, speed: 1.0, aggro: 5.5, rng: 5.5, cdMult: 2.0 },  // unit-killer bolt thrower; crawls
    elite:    { name: 'Elite Defender', hp: 100, atk: 12, def: 3, speed: 2.4, aggro: 5 },
    rider:    { name: 'Rider',          hp: 70,  atk: 9,  def: 1, speed: 3.4, aggro: 5 },
    lancer:   { name: 'Lancer',         hp: 110, atk: 13, def: 3, speed: 3.2, aggro: 5 },
    archer:   { name: 'Archer',         hp: 45,  atk: 7,  def: 0, speed: 2.3, aggro: 5.5, rng: 3.5 },
    marksman: { name: 'Marksman',       hp: 60,  atk: 10, def: 1, speed: 2.3, aggro: 6,   rng: 4.5 },
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
    catapult:   { name: 'Catapult',    hp: 180, atk: 8, def: 1, speed: 1.0, aggro: 0, rng: 5.5, cdMult: 2.5, bldAtk: 110 },
    siegetower: { name: 'Siege Tower', hp: 170, atk: 0, def: 0, speed: 1.0, aggro: 0 },
  },

  MEAT_DROP: 10,               // food gained when a wild animal is killed
  PASSIVE_MAX: 2,              // grazing animals (deer/cow) kept on the map
  HEAL_FOOD: { villager: 50, defender: 40, elite: 80,
               rider: 60, lancer: 100, archer: 40, marksman: 70,
               fishboat: 30, warship: 70, fireship: 110,
               transport: 50, bigtransport: 90,
               catapult: 90, siegetower: 80,
               axeman: 45, longbow: 45, horsearcher: 65, ballista: 85 },  // full-heal cost scales with missing hp

  // barbarian pressure: a spice, not a kingmaker — bands come less often and
  // smaller than they used to, tipping fights without deciding them
  WAVES: { minGap: 14, maxGap: 20, scaleHp: 0.07, scaleAtk: 0.05 },
  ANIMALS: { graceDays: 8, minDistTC: 12, leash: 7 },

  /* Difficulty modes. gather/output scale player income; wave* shape barbarian
     pressure; barbMult scales barbarian hp/atk (1.2 on Hard ≈ rival defenders);
     animal* cap wildlife; aiRaidDay is the rival's earliest attack. */
  MODES: {
    calm: {
      name: 'Calm', icon: '🌿', desc: 'Nearly peaceful — the odd wild animal keeps you sharp; raids are rare.',
      gather: 1, output: 1,
      waveFirst: 70, waveGapMult: 2.2, waveSizeAdd: -1, barbMult: 0.9,
      animalMax: 2, animalChance: 0.15, aiRaidDay: 999,
      aiBuildEvery: 4, aiOutput: 0.6, aiArmyCap: 5, aiArmyDiv: 14, aiEliteShare: 0,
    },
    moderate: {
      name: 'Moderate', icon: '⚔️', desc: 'The intended experience.',
      gather: 1, output: 1,
      waveFirst: 40, waveGapMult: 1.5, waveSizeAdd: 0, barbMult: 1,
      animalMax: 3, animalChance: 0.2, aiRaidDay: 70,
      aiBuildEvery: 2, aiOutput: 1.1, aiArmyCap: 8, aiArmyDiv: 8, aiEliteShare: 0.4,
    },
    hard: {
      name: 'Hard', icon: '💀', desc: 'Slower gathering, relentless enemies.',
      gather: 0.85, output: 0.85,
      waveFirst: 30, waveGapMult: 0.8, waveSizeAdd: 1, barbMult: 1.2,
      animalMax: 4, animalChance: 0.3, aiRaidDay: 50,
      aiBuildEvery: 1, aiOutput: 1.25, aiArmyCap: 12, aiArmyDiv: 6, aiEliteShare: 0.75,
    },
  },

  ATTACK_COOLDOWN: 1.0,        // seconds between melee hits
  MELEE_RANGE: 1.15,           // tiles
  REPAIR_RATE: 0.5,            // fraction of max hp restored per day of villager work
  HOME_TURF: { range: 10, mult: 1.1 },  // +10% attack near your own Town Center
  RALLY_RANGE: 10,             // max distance for a building's rally point
};
