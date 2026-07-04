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
  SIZES: { small: 30, medium: 40, large: 52 },
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
  DOCK_MIN_WATER: 6,          // a dock needs a water body at least this big
  DEPLETED: {                 // what a tile becomes once gathered out
    [T.FOREST]:  T.STUMPS,
    [T.HILLS]:   T.PEBBLES,
    [T.FERTILE]: T.BARREN,
  },
  DEMOLISH_REFUND: 0.4,       // fraction of spent resources returned on demolish
  RUIN_DECAY_DAYS: 20,        // stumps / pebbles / spent soil / ruins regrow to grass after this many days

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
    lumber: {
      name: 'Lumber Camp', desc: 'Wood per worker (up to 2). Build near forest.', needsWorker: true,
      maxWorkers: 2, reqTC: 2,
      near: { terrain: T.FOREST, mult: 1.5, radius: 2 },
      levels: [    // out is PER WORKER — a lone hand yields less than chopping forest
        { cost: { wood: 40, gold: 5 },    time: 1, hp: 120, out: { wood: 5 } },
        { cost: { wood: 80, stone: 30, gold: 10 }, time: 2, hp: 160, out: { wood: 10 } },
        { cost: { wood: 160, stone: 80, gold: 25 }, time: 2, hp: 200, out: { wood: 16 } },
      ],
    },
    quarry: {
      name: 'Quarry', desc: 'Stone per worker (up to 2). Build near hills.', needsWorker: true,
      maxWorkers: 2, reqTC: 2,
      near: { terrain: T.HILLS, mult: 1.5, radius: 2 },
      levels: [    // out is PER WORKER — a lone hand yields less than mining hills
        { cost: { wood: 80, gold: 5 },    time: 1, hp: 120, out: { stone: 3.5 } },
        { cost: { wood: 140, stone: 20, gold: 10 }, time: 2, hp: 170, out: { stone: 7 } },
        { cost: { wood: 260, stone: 60, gold: 25 }, time: 2, hp: 220, out: { stone: 12 } },
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
      name: 'Watchtower', desc: 'Shoots raiders and beasts. Extends vision.', vision: true,
      levels: [
        { cost: { wood: 40, stone: 40 },   time: 2, hp: 250, atk: 8,  range: 4.5, vision: 6 },
        { cost: { wood: 80, stone: 90 },   time: 2, hp: 400, atk: 13, range: 5,   vision: 7 },
        { cost: { wood: 150, stone: 180 }, time: 3, hp: 600, atk: 19, range: 5.5, vision: 8,
          bonus: 'Signal fire: nearby defenders +2 attack' },
      ],
    },
    barracks: {
      name: 'Barracks', desc: 'Trains defenders to protect the village.',
      train: {
        defender: { cost: { food: 40, wood: 30, gold: 5 }, time: 1 },
        elite:    { cost: { food: 80, wood: 40, gold: 20 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 100, stone: 50, gold: 15 },  time: 2, hp: 300 },
        { cost: { wood: 180, stone: 120, gold: 30 }, time: 2, hp: 420 },
        { cost: { wood: 300, stone: 220, gold: 50 }, time: 3, hp: 560,
          bonus: 'Unlocks Elite Defender' },
      ],
    },
    stable: {
      name: 'Horse Stable', desc: 'Trains fast riders to run down raiders.', reqTC: 2,
      train: {
        rider:  { cost: { food: 60, wood: 20, gold: 8 }, time: 1 },
        lancer: { cost: { food: 100, gold: 25 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 120, stone: 30, gold: 20 },  time: 2, hp: 320 },
        { cost: { wood: 200, stone: 100, gold: 35 }, time: 2, hp: 450 },
        { cost: { wood: 320, stone: 200, gold: 40 }, time: 3, hp: 600,
          bonus: 'Unlocks Lancer' },
      ],
    },
    range: {
      name: 'Archery Range', desc: 'Trains archers who fight from a distance.', reqTC: 2,
      train: {
        archer:   { cost: { food: 40, wood: 40, gold: 6 }, time: 1 },
        marksman: { cost: { food: 70, wood: 60, gold: 15 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 90, stone: 20, gold: 15 },   time: 2, hp: 280 },
        { cost: { wood: 160, stone: 80, gold: 30 },  time: 2, hp: 400 },
        { cost: { wood: 280, stone: 160, gold: 40 }, time: 3, hp: 520,
          bonus: 'Unlocks Marksman' },
      ],
    },
    dock: {
      name: 'Dock', desc: 'Built on open water (6+ tiles). Fishing boats harvest fish; warships defend the coast.',
      reqTC: 2,   // needs Town Center level 2 before it can be placed
      train: {
        fishboat: { cost: { wood: 40, gold: 5 }, time: 1 },
        warship:  { cost: { wood: 80, gold: 20 }, time: 2, reqLevel: 2 },
        fireship: { cost: { wood: 130, gold: 45 }, time: 2.5, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 60, gold: 5 },              time: 2, hp: 220, vision: 5 },
        { cost: { wood: 100, stone: 40, gold: 15 }, time: 2, hp: 340, vision: 6,
          bonus: 'Unlocks Warship' },
        { cost: { wood: 160, stone: 90, gold: 30 }, time: 3, hp: 480, vision: 7,
          bonus: 'Unlocks Fire Warship' },
      ],
    },
    wall: {
      name: 'Wall', desc: 'Blocks all movement — friend and foe. Enemies must break it.',
      levels: [
        { cost: { wood: 15 },             time: 1, hp: 250 },   // stick-and-grass palisade
        { cost: { stone: 50, gold: 5 },   time: 1, hp: 650 },   // stone wall
        { cost: { stone: 110, gold: 10 }, time: 2, hp: 1000 },  // dressed stone
      ],
    },
    gate: {
      name: 'Town Gate', desc: 'Your people pass through; enemies must break it.',
      levels: [
        { cost: { wood: 45, gold: 10 },             time: 1, hp: 300 },
        { cost: { wood: 60, stone: 50, gold: 20 },  time: 1, hp: 550 },
        { cost: { wood: 100, stone: 110, gold: 40 }, time: 2, hp: 850 },
      ],
    },
  },

  UNITS: {
    villager: { name: 'Villager',       hp: 40,  atk: 2,  def: 0, speed: 2.2, aggro: 0 },
    defender: { name: 'Defender',       hp: 60,  atk: 8,  def: 2, speed: 2.4, aggro: 5 },
    elite:    { name: 'Elite Defender', hp: 110, atk: 14, def: 4, speed: 2.4, aggro: 5 },
    rider:    { name: 'Rider',          hp: 70,  atk: 9,  def: 1, speed: 3.4, aggro: 5 },
    lancer:   { name: 'Lancer',         hp: 120, atk: 15, def: 3, speed: 3.2, aggro: 5 },
    archer:   { name: 'Archer',         hp: 45,  atk: 7,  def: 0, speed: 2.3, aggro: 5.5, rng: 3.5 },
    marksman: { name: 'Marksman',       hp: 60,  atk: 11, def: 1, speed: 2.3, aggro: 6,   rng: 4.5 },
    wolf:     { name: 'Wolf',           hp: 24,  atk: 4,  def: 0, speed: 2.4, aggro: 4 },
    boar:     { name: 'Boar',           hp: 48,  atk: 6,  def: 1, speed: 1.8, aggro: 2 },
    raider:   { name: 'Barbarian',       hp: 50,  atk: 7,  def: 1, speed: 2.3, aggro: 2.5 },
    brute:    { name: 'Barbarian Brute', hp: 95,  atk: 12, def: 2, speed: 1.9, aggro: 2.5 },
    deer:     { name: 'Deer',           hp: 20,  atk: 0,  def: 0, speed: 2.0, aggro: 0 },
    cow:      { name: 'Wild Cow',       hp: 35,  atk: 0,  def: 0, speed: 1.2, aggro: 0 },
    // naval — these move only on water
    fishboat: { name: 'Fishing Boat',   hp: 35,  atk: 0,  def: 0, speed: 2.4, aggro: 0,   naval: true },
    warship:  { name: 'Warship',        hp: 95,  atk: 9,  def: 1, speed: 2.6, aggro: 5,   naval: true, rng: 4 },
    fireship: { name: 'Fire Warship',   hp: 140, atk: 14, def: 2, speed: 2.6, aggro: 5.5, naval: true, rng: 4.5, fire: true },
  },

  MEAT_DROP: 10,               // food gained when a wild animal is killed
  PASSIVE_MAX: 2,              // grazing animals (deer/cow) kept on the map
  HEAL_FOOD: { villager: 50, defender: 40, elite: 80,
               rider: 60, lancer: 100, archer: 40, marksman: 70,
               fishboat: 30, warship: 70, fireship: 110 },  // full-heal cost scales with missing hp

  WAVES: { minGap: 10, maxGap: 14, scaleHp: 0.07, scaleAtk: 0.05 },
  ANIMALS: { graceDays: 8, minDistTC: 12, leash: 7 },

  /* Difficulty modes. gather/output scale player income; wave* shape barbarian
     pressure; barbMult scales barbarian hp/atk (1.2 on Hard ≈ rival defenders);
     animal* cap wildlife; aiRaidDay is the rival's earliest attack. */
  MODES: {
    calm: {
      name: 'Calm', icon: '🌿', desc: 'Nearly peaceful — the odd wild animal keeps you sharp; raids are rare.',
      gather: 1, output: 1,
      waveFirst: 60, waveGapMult: 2.2, waveSizeAdd: -1, barbMult: 0.9,
      animalMax: 2, animalChance: 0.15, aiRaidDay: 999,
      aiBuildEvery: 4, aiOutput: 0.6, aiArmyCap: 5, aiArmyDiv: 14,
    },
    moderate: {
      name: 'Moderate', icon: '⚔️', desc: 'The intended experience.',
      gather: 1, output: 1,
      waveFirst: 30, waveGapMult: 1.5, waveSizeAdd: 0, barbMult: 1,
      animalMax: 3, animalChance: 0.2, aiRaidDay: 70,
      aiBuildEvery: 2, aiOutput: 1, aiArmyCap: 10, aiArmyDiv: 8,
    },
    hard: {
      name: 'Hard', icon: '💀', desc: 'Slower gathering, relentless enemies.',
      gather: 0.85, output: 0.85,
      waveFirst: 20, waveGapMult: 0.8, waveSizeAdd: 1, barbMult: 1.2,
      animalMax: 4, animalChance: 0.3, aiRaidDay: 50,
      aiBuildEvery: 1, aiOutput: 1.15, aiArmyCap: 12, aiArmyDiv: 6,
    },
  },

  ATTACK_COOLDOWN: 1.0,        // seconds between melee hits
  MELEE_RANGE: 1.15,           // tiles
  REPAIR_RATE: 0.5,            // fraction of max hp restored per day of villager work
  HOME_TURF: { range: 10, mult: 1.1 },  // +10% attack near your own Town Center
  RALLY_RANGE: 10,             // max distance for a building's rally point
};
