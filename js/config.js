"use strict";
/* Neolithic — static game configuration (stat tables). */

const T = { GRASS: 0, FOREST: 1, WATER: 2, HILLS: 3, FERTILE: 4, CAMP: 5 };

const CFG = {
  TILE: 32,
  W: 40,
  H: 40,
  DAY_MS: 10000,              // one in-game day
  START_RES: { food: 200, wood: 150, stone: 60, gold: 0 },
  START_VILLAGERS: 3,
  UNIT_VISION: 3,
  BUILD_RANGE: 8,             // new buildings must be this close to an existing one
  GATHER: {                   // villager gather rate per second, by terrain
    [T.FOREST]:  { res: 'wood',  rate: 0.8 },
    [T.HILLS]:   { res: 'stone', rate: 0.6 },
    [T.FERTILE]: { res: 'food',  rate: 1.0 },
  },

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
        { cost: {},                                time: 0, hp: 500,  pop: 5,  out: { gold: 5 }, vision: 6 },
        { cost: { wood: 200, stone: 150 },         time: 3, hp: 800,  pop: 8,  out: { gold: 10 }, vision: 7 },
        { cost: { wood: 400, stone: 300, gold: 80 }, time: 4, hp: 1200, pop: 12, out: { gold: 15 }, vision: 8,
          bonus: '+10% production to all buildings' },
      ],
    },
    farm: {
      name: 'Farm', desc: 'Steady food. Thrives on fertile soil.',
      near: { terrain: T.FERTILE, mult: 1.5, radius: 0 },
      levels: [
        { cost: { wood: 60 },              time: 1, hp: 100, out: { food: 15 } },
        { cost: { wood: 120, stone: 40 },  time: 2, hp: 140, out: { food: 30 } },
        { cost: { wood: 240, stone: 100 }, time: 2, hp: 180, out: { food: 50 } },
      ],
    },
    lodge: {
      name: "Hunter's Lodge", desc: 'Food from the wild. Build near forest.',
      near: { terrain: T.FOREST, mult: 1.5, radius: 2 },
      levels: [
        { cost: { wood: 50 },             time: 1, hp: 120, out: { food: 13 } },
        { cost: { wood: 100, stone: 30 }, time: 2, hp: 160, out: { food: 25 } },
        { cost: { wood: 200, stone: 80 }, time: 2, hp: 200, out: { food: 40 },
          bonus: 'Villagers armed with spears (+4 attack)' },
      ],
    },
    lumber: {
      name: 'Lumber Camp', desc: 'Wood income. Build near forest.',
      near: { terrain: T.FOREST, mult: 1.5, radius: 2 },
      levels: [
        { cost: { wood: 40 },             time: 1, hp: 120, out: { wood: 15 } },
        { cost: { wood: 80, stone: 30 },  time: 2, hp: 160, out: { wood: 30 } },
        { cost: { wood: 160, stone: 80 }, time: 2, hp: 200, out: { wood: 50 } },
      ],
    },
    quarry: {
      name: 'Quarry', desc: 'Stone income. Build near hills.',
      near: { terrain: T.HILLS, mult: 1.5, radius: 2 },
      levels: [
        { cost: { wood: 80 },             time: 1, hp: 120, out: { stone: 13 } },
        { cost: { wood: 140, stone: 20 }, time: 2, hp: 170, out: { stone: 25 } },
        { cost: { wood: 260, stone: 60 }, time: 2, hp: 220, out: { stone: 40 } },
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
        defender: { cost: { food: 40, wood: 30 }, time: 1 },
        elite:    { cost: { food: 80, wood: 40, gold: 20 }, time: 2, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 100, stone: 50 },            time: 2, hp: 300 },
        { cost: { wood: 180, stone: 120 },           time: 2, hp: 420 },
        { cost: { wood: 300, stone: 220, gold: 50 }, time: 3, hp: 560,
          bonus: 'Unlocks Elite Defender' },
      ],
    },
  },

  UNITS: {
    villager: { name: 'Villager',       hp: 40,  atk: 2,  def: 0, speed: 2.2, aggro: 0 },
    defender: { name: 'Defender',       hp: 60,  atk: 8,  def: 2, speed: 2.4, aggro: 5 },
    elite:    { name: 'Elite Defender', hp: 110, atk: 14, def: 4, speed: 2.4, aggro: 5 },
    wolf:     { name: 'Wolf',           hp: 24,  atk: 4,  def: 0, speed: 2.4, aggro: 4 },
    boar:     { name: 'Boar',           hp: 48,  atk: 6,  def: 1, speed: 1.8, aggro: 2 },
    raider:   { name: 'Raider',         hp: 45,  atk: 6,  def: 1, speed: 2.3, aggro: 2.5 },
    brute:    { name: 'Raider Brute',   hp: 95,  atk: 12, def: 2, speed: 1.9, aggro: 2.5 },
    deer:     { name: 'Deer',           hp: 20,  atk: 0,  def: 0, speed: 2.0, aggro: 0 },
    cow:      { name: 'Wild Cow',       hp: 35,  atk: 0,  def: 0, speed: 1.2, aggro: 0 },
  },

  MEAT_DROP: 10,               // food gained when a wild animal is killed
  PASSIVE_MAX: 2,              // grazing animals (deer/cow) kept on the map
  HEAL_FOOD: { villager: 50, defender: 40, elite: 80 },  // full-heal cost scales with missing hp

  WAVES: { minGap: 10, maxGap: 14, scaleHp: 0.07, scaleAtk: 0.05 },
  ANIMALS: { graceDays: 8, minDistTC: 12, leash: 7 },

  /* Difficulty modes. gather/output scale player income; wave* shape raider
     pressure; animal* cap wildlife; aiRaidDay is the rival's earliest attack. */
  MODES: {
    calm: {
      name: 'Calm', icon: '🌿', desc: 'Nearly peaceful — the odd wild animal keeps you sharp; raids are rare.',
      gather: 1, output: 1,
      waveFirst: 60, waveGapMult: 2.2, waveSizeAdd: -1,
      animalMax: 2, animalChance: 0.15, aiRaidDay: 999,
    },
    moderate: {
      name: 'Moderate', icon: '⚔️', desc: 'The intended experience.',
      gather: 1, output: 1,
      waveFirst: 30, waveGapMult: 1.3, waveSizeAdd: 0,
      animalMax: 3, animalChance: 0.2, aiRaidDay: 70,
    },
    hard: {
      name: 'Hard', icon: '💀', desc: 'Slower gathering, relentless enemies.',
      gather: 0.85, output: 0.85,
      waveFirst: 20, waveGapMult: 0.9, waveSizeAdd: 1,
      animalMax: 4, animalChance: 0.3, aiRaidDay: 50,
    },
  },

  WIN: { econTotal: 4000, econPop: 20, surviveDay: 120 },

  ATTACK_COOLDOWN: 1.0,        // seconds between melee hits
  MELEE_RANGE: 1.15,           // tiles
  REPAIR_RATE: 0.5,            // fraction of max hp restored per day of villager work
};
