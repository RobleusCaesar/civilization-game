"use strict";
/* Clanfire — static game configuration (stat tables). */

const T = {
  GRASS: 0, FOREST: 1, WATER: 2, HILLS: 3, FERTILE: 4, CAMP: 5,
  STUMPS: 6, PEBBLES: 7, BARREN: 8, RUIN: 9,   // depleted / destroyed variants
  MOUNTAIN: 10,                                 // impassable, unbuildable
  TRENCH: 11,                                   // sapper-dug ditch — blocks land, not ranged fire
  MOAT: 12,                                     // a trench that flooded from a water source — blocks land; open water to boats
  MOUND: 13,                                    // sapper-raised earthwork — passable but 4x slower to cross; or reclaimed land where water was
  GOLDORE: 14,                                  // a GOLD SEAM (tests/gold-mine.mjs) — rare, found by exploring, the only
                                                // ground a Gold Mine may be sunk on. Walkable and buildable, but never
                                                // diggable/clearable/mound-able: a seam cannot be paved over or trenched away
                                                // (the three terraform whitelists in map.js exclude it by construction)
};

const CFG = {
  SAVE_VERSION: 2,     // bump when the save shape changes; loadJSON migrates older saves
  ART_V: 1,            // cache-buster on every art URL (?v=N) — bump when a PNG in
                       // assets/ is RE-UPLOADED under the same name, so the Pages
                       // CDN stops serving the stale copy. New filenames don't need it.
  TILE: 32,
  SPRITE_LIFT: 4,      // px a unit sprite draws ABOVE its logical position. Render (render.js)
                       // and tap hit-testing (ui.js) BOTH read this — change it here only,
                       // or taps land below what the player sees. See tests/tap-audit.mjs.
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
    [T.WATER]:   [45, 85],    // fish — before the shallow/deep split below
  },
  /* A FISHERY, NOT A MINE (tests/fishery.mjs). A shoal yields less than the
     raw stock above — HALF in the SHALLOWS (water touching land: the shore
     shoals a villager can line-fish and the coast a boat hugs) and three
     quarters in DEEP water, so rowing out is worth more than paddling at the
     edge — and a fished-out tile comes back after FISH_RETURN_DAYS. Fish are
     the one resource that renews on a clock rather than by terrain regrowth:
     the water never changes, only its stock. */
  FISH_STOCK: { shallow: 0.5, deep: 0.75 },
  FISH_RETURN_DAYS: 120,
  FISH: { res: 'food', rate: 1.2 },   // fishing-boat harvest per second (12/day — a notch under a Lv1 farm's 15)
  SHORE_FISH: { rate: 1.0 },  // villager line-fishing off the shore — same pace as picking berries;
                              // only works on shoals (about a third of shore water, where fish jump)
  DOCK_MIN_WATER: 6,          // a dock needs a water body at least this big
  /* TRADING POST exchange — ANY resource for any other, and a stingy relief
     valve in every direction. One caravan at a time; `delay` game-days before
     it returns; `input` is the load it hauls, growing with the post's level so
     a bigger post trades better but demands far more per run.

     Three rates, because the three directions are not the same trade:
       `gold` — goods → GOLD, gold minted per unit hauled. Unchanged and
                deliberately awful: gold stays the hardest thing to acquire.
       `swap` — goods → GOODS, units paid per 1 unit received. A convenience,
                never a free conversion: you lose over half at every level.
       `buy`  — GOLD → goods, units received per gold spent.

     `buy` is capped by arithmetic, not taste: the round trip goods→gold→goods
     is worth `gold * buy` per unit, and that MUST stay under `1 / swap` or
     laundering through gold beats swapping directly and the direct trade
     becomes pointless. L1 0.10*2.0 = 0.20 < 0.25; L2 0.14*2.2 = 0.31 < 0.33;
     L3 0.18*2.4 = 0.43 < 0.45. Raise `buy` and you must lower `swap` with it.

     The gold load is `input * gold` — the very gold a full caravan of goods
     would have earned — so selling 360 stone brings 64 gold and spending 64
     gold brings 140 stone back. Legible, symmetrical, and plainly lossy. */
  TRADE: {
    goods: ['food', 'wood', 'stone', 'gold'],   // every resource, on both sides
    levels: [
      // L1: 80 goods → 8 gold | 80 goods → 20 goods | 8 gold → 16 goods
      { input: 80,  delay: 1.5, gold: 0.10, swap: 4.0, buy: 2.0 },
      // L2: 180 → 25 gold | 180 → 60 goods | 25 gold → 55 goods
      { input: 180, delay: 2.0, gold: 0.14, swap: 3.0, buy: 2.2 },
      // L3: 360 → 64 gold | 360 → 163 goods | 65 gold → 156 goods
      { input: 360, delay: 2.5, gold: 0.18, swap: 2.2, buy: 2.4 },
    ],
  },
  DEPLETED: {                 // what a tile becomes once gathered out
    [T.FOREST]:  T.STUMPS,
    [T.HILLS]:   T.PEBBLES,
    [T.FERTILE]: T.BARREN,
  },
  DEMOLISH_REFUND: 0.4,       // fraction of spent resources returned on demolish
  RUIN_DECAY_DAYS: 60,        // base days before felled forest / spent soil regrow — cleared land stays cleared a good while
  RUIN_FADE_DAYS: 20,         // days before a demolished/razed building's rubble greens over (tests/ore-finite.mjs).
                              // Its OWN clock, not the regrowth base: sweeping up a building site is not the same
                              // job as a forest growing back, and the player should not stare at their own rubble
  ASH_DAYS: 5,                // a burned-down building's ash pile blocks building on its footprint this many days (tests/burn-down.mjs)
  RUIN_AT: 0.9,               // fraction of hp that must be GONE before the broken-open sprite shows (Bld.burnPhase,
                              // tests/burn-down.mjs) — the last look before a building falls, so it waits for the
                              // last tenth of the hp bar rather than arriving two thirds of the way through a fight
  /* WHAT GROWS BACK, and into what — the single source of truth for regrowth
     (G.scheduleRevert schedules only these; G.dayTick turns them back).
     LIVING things return: felled forest and spent orchard/berry soil.
     ORE DOES NOT. A quarried seam is gone for good — worked-out rock stays
     PEBBLES forever, so stone is a genuinely finite resource on the map and
     the late game leans on the Trading Post for it. */
  REGROW_TO: {
    [T.STUMPS]:  T.FOREST,    // felled forest grows back
    [T.BARREN]:  T.FERTILE,   // spent orchard/berry soil recovers
  },
  REGROW_MULT: {              // per-terrain regrowth-time multiplier over the base
    [T.STUMPS]:  2,           // felled forest — twice as slow to grow back
    [T.BARREN]:  2,           // spent orchard/berry soil — twice as slow
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
    warship: 1.0,    // a fighting ship's crew (fire warship, bombard)
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
      size: 2,   // the founding hall — see Bld.size / tests/footprint.mjs
      desc: 'Heart of the village. Trains villagers, stores goods.',
      train: { villager: { cost: { food: 50 }, time: 1 } },
      levels: [
        { cost: {},                                 time: 0, hp: 500,  pop: 5,  out: { gold: 4 }, vision: 6 },
        // the hall is the spine of the run, so its storeys are dear — and they
        // are gated on a town that has actually GROWN (Bld.tcSupport)
        { cost: { wood: 300, stone: 225, gold: 45 },  time: 3, hp: 800,  pop: 8,  out: { gold: 8 }, vision: 7 },
        { cost: { wood: 600, stone: 450, gold: 120 }, time: 4, hp: 1200, pop: 12, out: { gold: 12 }, vision: 8,
          bonus: '+10% production to all buildings' },
      ],
    },
    /* ===== A STATION STANDS ON GROUND THAT WAS WORKED (tests/worked-ground.mjs) =====
       `onWorked` is the terrain a station may be raised on — the SPENT ground
       its own resource leaves behind — and `whyGround` is what the player is
       told when they try to put it anywhere else. Together they are the whole
       of the rule: no station may be raised on ordinary grass, so a village
       cannot conjure infinite wood, stone or bread by stamping camps across an
       empty meadow. It has to go out, find the resource, work it out by hand,
       and hold that ground long enough to raise the works on it.

       The Hunter's Lodge is the one that has no terrain of its own — game is
       not a tile, it is a thing that dies somewhere — so it names a MARK
       instead (`onHunted`, S.map.hunted). See Bld.stationGround. */
    farm: {
      name: 'Farm', desc: 'Steady food while a villager works it. Thrives beside fertile soil.', needsWorker: true,
      near: { terrain: T.FERTILE, mult: 1.5, radius: 1 },
      onWorked: T.BARREN,
      whyGround: 'Nothing has ever grown here and nothing plans to start. A farm goes on soil already picked bare — an orchard or a berry patch your people have harvested out.',
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
      onHunted: true,
      whyGround: 'No animal has ever died on this spot. A lodge is raised on a killing ground — go and make one, then come back.',
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
      onWorked: T.STUMPS,
      whyGround: 'There are no trees on this tile. Your woodcutters would be standing in the grass looking at each other — a lumber camp goes on a stand you have already felled.',
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
      onWorked: T.PEBBLES,
      whyGround: 'You could dig here until your grandchildren are old and never strike stone. A quarry goes where the rock has already been broken open.',
      levels: [    // out is PER WORKER — a lone hand yields less than mining hills
        { cost: { wood: 80, gold: 5 },    time: 1, hp: 120, out: { stone: 3.5 } },
        { cost: { wood: 170, gold: 10 },  time: 2, hp: 170, out: { stone: 7 } },
        { cost: { wood: 320, gold: 25 },  time: 2, hp: 220, out: { stone: 12 } },
      ],
    },
    /* BARBARIAN CAMP (tests/raider-camps.mjs) — the one building neither
       tribe raises. The map puts them down in the wild country, they are
       ALWAYS tended by a few barbarians, and they can be pulled down: a camp
       is a place on the board, so a trip out to the far woods is a trip past
       somebody's spears. Owned by 'R', so it is hostile ground to both tribes.
       No cost and no build time — it is placed, never built. */
    raidercamp: {
      name: 'Barbarian Camp', wild: true,
      desc: 'A barbarian war camp. Its band musters here — burn it out and they lose the ground.',
      levels: [{ cost: {}, time: 0, hp: 420, vision: 5 }],
    },
    /* THE GOLD MINE IS NOT BUILT — IT IS CLAIMED (tests/gold-mine.mjs).
       It is the ONE structure with no button in the build menu (`noMenu`):
       you find a gold seam by exploring, walk a villager out to it, and the
       works go up around them for nothing. What you pay for is the SHAFT —
       levels 2 and 3 are the dearest station upgrades in the game, on the
       station rule (Bld.upgradeTime doubles then quadruples a worker plot's
       time), so L2 is six days of work and L3 sixteen.

       And the level belongs to the SEAM, not to a tribe. Clear the hands off
       a mine and put your own on it and you inherit whatever it has been
       raised to — which is why the works cannot be attacked at all
       (Bld.attackable): the only way to take a seam is to take the ground. */
    mine: {
      // freePlace, like the War Camp: a seam is wherever the map put it, and
      // the anchor rule ("build near your town") would forbid every one of
      // them. Being far from home is the whole risk of the richest income
      // there is — the mine anchors nothing further, so it stays a claim
      // rather than a beachhead.
      name: 'Gold Mine', needsWorker: true, maxWorkers: 2, freePlace: true, noMenu: true,
      onTerrain: T.GOLDORE,
      desc: 'A claimed gold seam. Gold per worker (up to 2) — the richest income there is, and the one you have to go out and hold.',
      levels: [    // out is PER WORKER, like every other station
        // the CLAIM is free: walking out there and holding it is the price
        { cost: {},                                     time: 1, hp: 260, out: { gold: 4 } },
        { cost: { wood: 400, stone: 500, gold: 120 },   time: 3, hp: 420, out: { gold: 9 },
          bonus: 'Deeper shaft — a windlass over the adit' },
        { cost: { wood: 800, stone: 1000, gold: 300 },  time: 4, hp: 600, out: { gold: 16 },
          bonus: 'Full headframe and wash-house — the richest seam works' },
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
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      desc: 'Engines of war — catapults that crush stone, and towers that top walls.',
      train: {
        catapult:   { cost: { wood: 180, stone: 50 }, time: 3 },
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
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      train: {
        defender: { cost: { food: 40, wood: 30 }, time: 1 },
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
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      train: {
        rider:  { cost: { food: 60, wood: 20 }, time: 1 },
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
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      train: {
        archer:   { cost: { food: 40, wood: 40 }, time: 1 },
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
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
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
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      desc: 'Forward base — raise it anywhere you have scouted, then build military structures around it. Shoots arrows, heals nearby soldiers. No upgrades; falls easily; the enemy sees it.',
      levels: [
        { cost: { wood: 350, stone: 250, gold: 150 }, time: 3, hp: 300, atk: 8, range: 4.5, vision: 6 },
      ],
    },
    dock: {
      name: 'Dock', desc: 'Built on open water (6+ tiles). Fishing boats harvest fish; rafts carry soldiers, fire warships hold the coast and bombards break it.',
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      reqTC: 2,   // needs Town Center level 2 before it can be placed
      train: {
        fishboat: { cost: { wood: 40, gold: 5 }, time: 1 },
        transport: { cost: { wood: 90, gold: 20 }, time: 1.8 },
        fireship: { cost: { wood: 130, gold: 45 }, time: 2.5, reqLevel: 3 },
        bombard:  { cost: { wood: 200, stone: 60, gold: 60 }, time: 3.5, reqLevel: 3 },
      },
      levels: [
        { cost: { wood: 60, gold: 5 },              time: 2, hp: 220, vision: 5 },
        { cost: { wood: 100, stone: 40, gold: 15 }, time: 2, hp: 340, vision: 6,
          bonus: 'Sturdier hulls, wider watch' },
        { cost: { wood: 160, stone: 90, gold: 30 }, time: 3, hp: 480, vision: 7,
          bonus: 'Unlocks Fire Warship & Bombard Ship' },
      ],
    },
    /* Trading Post — a late-game relief valve: turn a surplus of food/wood/stone
       into a trickle of gold. Deliberately expensive to raise and stingy to run
       (see CFG.TRADE), so gold stays precious. TC-3 gated. */
    trade: {
      name: 'Trading Post', desc: 'Send caravans out to trade any resource for any other. Costly to run — every exchange loses more than half, and gold stays precious.', reqTC: 3,
      size: 2,   // a PRIMARY work — two tiles on a side (tests/footprint.mjs)
      levels: [
        { cost: { wood: 260, stone: 180, gold: 40 },  time: 3, hp: 300, bonus: 'Trade any resource for any other (small loads, poor rates)' },
        { cost: { wood: 420, stone: 320, gold: 80 },  time: 3, hp: 420, bonus: 'Better rates — but each caravan hauls more' },
        { cost: { wood: 640, stone: 500, gold: 140 }, time: 4, hp: 560, bonus: 'Best rates — largest caravan loads' },
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
    /* THE ANCIENT WONDER (tests/wonder.mjs) — the second way to win, and the
       only one that isn't a war. ONE building key; WHICH monument it is, is
       rolled once per run into S.wonder from CFG.WONDERS, and its name, blurb
       and sprite all follow that roll (G.setWonder). The biggest footprint in
       the game at 3×3, the last entry in the build menu, and priced so only a
       genuinely enormous economy can reach it. Finishing it wins the run. */
    wonder: {
      name: 'Ancient Wonder', unique: true, vision: true, wonder: true,
      size: 3,   // the only 3×3 in the game — the hall is 2×2, everything else 1×1
      desc: 'A monument for the ages. Finishing it wins the game.',
      levels: [
        // 45 days is over four times what the level-3 hall takes, and the hp is
        // the largest on the map by a wide margin — a work site still starts at
        // Bld.siteStartHp (40%), so the works CAN be broken and holding them is
        // the whole tension of the peaceful victory
        { cost: { food: 15000, wood: 15000, stone: 15000, gold: 4000 },
          time: 45, hp: 15000, vision: 9 },
      ],
    },
  },

  /* THE TEN WONDERS. One is rolled per run (seeded, so a seed always raises
     the same monument) — every one is a compact silhouette that reads at 3×3
     in this pixel system: no towers, no sprawling walls, no hanging gardens.
     Adding an eleventh is: an entry here plus a drawing in sprites.js keyed
     by the same `key`. */
  WONDERS: [
    { key: 'henge',    name: 'The Stone Circle',
      blurb: 'A ring of trilithons raised to the turning sky.' },
    { key: 'colossus', name: 'The Bronze Colossus',
      blurb: 'A giant of hammered bronze, spear levelled at the horizon.' },
    { key: 'moai',     name: 'The Great Stone Heads',
      blurb: 'Long-faced guardians cut from the quarry, watching the sea.' },
    { key: 'pyramid',  name: 'The Step Pyramid',
      blurb: 'Terrace upon terrace of dressed stone, a stair climbing to the sun.' },
    { key: 'obelisk',  name: 'The Sun Obelisk',
      blurb: 'One needle of granite, gold-capped, laying its shadow across the valley.' },
    { key: 'temple',   name: 'The Temple of Dawn',
      blurb: 'A colonnade beneath a carved pediment, facing the first light.' },
    { key: 'sphinx',   name: 'The Great Sphinx',
      blurb: 'A crowned lion couchant, keeping a riddle nobody has answered.' },
    { key: 'flame',    name: 'The Eternal Flame',
      blurb: 'A fire altar on a stepped platform that has never once gone out.' },
    { key: 'totems',   name: 'The Ancestor Totems',
      blurb: 'Cedar poles carved with every face the clan remembers.' },
    { key: 'sundial',  name: 'The Great Sundial',
      blurb: 'A stone dial ringed with the marks of the year, keeping time for the ages.' },
  ],
  WONDER: {
    aiDay: 350,        // the rival may not LAY a wonder before this day
    marvelMs: 7000,    // how long the finished monument is left on screen before the win screen
    alarmR: 40,        // how far the chief's whole host is called in from when the works are seen
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
    fireship: { name: 'Fire Warship',   hp: 140, atk: 14, def: 2, speed: 2.6, aggro: 5.5, naval: true, rng: 4.5, fire: true },
    /* ONE troop hull, not two. A 3-cap raft and a 5-cap War Transport were the
       same decision twice — you always wanted the bigger one — so they are
       merged: one Transport Raft carrying 5, available from the first dock, at
       a price between the two it replaces. */
    transport: { name: 'Transport Raft', hp: 110, atk: 0, def: 2, speed: 2.3, aggro: 0, naval: true, cap: 5 },
    /* BOMBARD — the siege engine of the water, and the fourth distinct hull.
       Historically this is a BOMB VESSEL (the French galiote à bombes, Renau
       d'Eliçagaray, first thrown against Algiers in 1682, and the English bomb
       ketches after it): a beamy, slow hull built around one heavy piece
       firing on a high arc, framed to absorb its own recoil, and famously
       hopeless in a ship fight. It exists to break a fortified SHORE.

       So the numbers say exactly that, in the vocabulary the land engines
       already use: bldAtk 190 (between catapult's 110 and trebuchet's 200),
       cdMult 4.0 (the trebuchet's own reload), and rng 7.5 — which must stay
       ABOVE the level-3 Watchtower's 5.5, or the whole point of the ship is
       gone. Against UNITS it is nearly harmless (atk 5) and it dies if caught
       (hp 150, def 1, speed 1.6): a Fire Warship eats it. aggro 0 so it never
       chases; it fires when ordered, and on watch inside its own range. */
    bombard:   { name: 'Bombard Ship',  hp: 150, atk: 5,  def: 1, speed: 1.6, aggro: 0, naval: true,
                 rng: 7.5, vision: 9, cdMult: 4.0, bldAtk: 190, proj: 'stone' },
    // siege engines: slow, deliberate, decisive. The catapult lobs boulders
    // (bldAtk vs structures, cdMult stretches its reload); the siege tower
    // carries no weapon — parked on an enemy wall it ferries one nearby
    // soldier per second over the top.
    catapult:   { name: 'Catapult',    hp: 180, atk: 8, def: 1, speed: 1.0, aggro: 0, rng: 5.5, cdMult: 2.5, bldAtk: 110, proj: 'stone' },
    siegetower: { name: 'Siege Tower', hp: 170, atk: 0, def: 0, speed: 1.0, aggro: 0 },
    // trebuchet: the endgame engine — hurls a flaming counterweight ball the
    // FARTHEST (outranges towers), hits HARDEST vs stone, but crawls and reloads
    // slowest; fragile and pricey, so it's a payoff, not an auto-win.
    // vision 9: its spotters see at least as far as it throws (rng 8) — an
    // engine must never shell ground it can't watch (per-unit `vision`
    // overrides CFG.UNIT_VISION in G.updateVisibility / AI.assess).
    trebuchet:  { name: 'Trebuchet',   hp: 160, atk: 6, def: 1, speed: 0.85, aggro: 0, rng: 8, vision: 9, cdMult: 4.0, bldAtk: 200, proj: 'flame', fire: true },
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
    /* SERVICE FEES (tests/sapper-fees.mjs) — the sappers' guild works for pay,
       billed PER TILE when the work lands (a failed or skipped tile charges
       nothing). The later the tier that unlocks a tool, the dearer it runs:
       T1 dig is cheap fed spadework, T2 bridge buys timber and pilings, the
       T3 tools cost real material. No gold in any fee — gold-poor tribes
       (the rival included) must still be able to field their engineers. */
    digCost: { food: 10 },                // tier 1 — spadework
    bridgeCost: { wood: 30, stone: 10 },  // tier 2 — timber + pilings
    clearCost: { food: 30, wood: 25 },    // tier 3 — demolition crews
    moundCost: { stone: 35, wood: 10 },   // tier 3, per tile — lots of quarry, some wood
    moundCross: 0.25,  // a unit crosses a mound at 1/4 speed (4x longer)
  },
  /* BRIDGES — a sapper raises a level-1 timber crossing; it can then be upgraded
     to L2/L3 (stone piers, then a stone arch), each stouter and costing a bit
     MORE than the matching tower upgrade. Attackable — protect your crossings.
     `time` is the upgrade's build time in DAYS: reinforcing a span is real
     masonry, and like the level-1 crossing it needs a SAPPER standing at the
     works for the whole of it (tests/bridge-resource-shore.mjs). The numbers
     match the Watchtower's stone tiers, the closest thing to it in the game. */
  BRIDGE: {
    levels: [
      { hp: 220 },                                                        // L1 timber (sapper-built)
      { hp: 480, time: 2, cost: { wood: 120, stone: 140, gold: 15 } },    // L2 stone piers
      { hp: 900, time: 3, cost: { wood: 240, stone: 300, gold: 35 } },    // L3 stone arch
    ],
  },

  /* GOLD SEAMS (tests/gold-mine.mjs) — how many T.GOLDORE tiles a map carries,
     scaled with its size, and how far they must sit from either town so gold
     is always something you go and FIND rather than something you start on
     top of. `aiDay` is the earliest the rival will march out and sink one. */
  GOLD_SEAMS: { count: 3, perTile: 0.0008, minFromTown: 10, aiDay: 40 },

  /* MORTALITY (tests/mortality.mjs) — every so often, a villager simply dies.
     Life was short and full of surprises, and mechanically it means a station
     you staffed and forgot about occasionally needs a hand put back on it.
     `deathEvery` is the day band between deaths, per difficulty (Calm waits
     longest, Hard shortest); MORTALITY.every is the fallback for a mode that
     names none. Never the LAST villager — a random roll must not be able to
     end a run the player is still playing. Player-side only: the rival hires
     its workforce back on a timer of its own, so mortality there would be
     invisible bookkeeping that only re-tunes its economy. */
  //  warnMs — the beat between the NEWS and the fall, so the player has time
  //           to look up and actually see it happen (G.tickMortality → dyingTick)
  MORTALITY: { every: [25, 40], animMs: 1500, warnMs: 1000 },

  /* HOW THEY WENT. Keyed by what the villager was DOING — the station it was
     stationed at, the resource it was gathering, whether it was building or
     fishing — so the news reads like a small story rather than a dice roll.
     `general` covers everyone caught idling, walking or sheltering. Adding a
     new station is one more key here, nothing else. */
  DEATHS: {
    /* Every line is a WHOLE SENTENCE that says a villager died — the log
       prints it as-is behind a skull, so it has to stand on its own and read
       plainly at a glance. Keyed by what they were DOING when it happened. */
    general: [
      'A villager lay down under a hawthorn for a short rest and never got up.',
      'A villager died of a fever nobody could name. The moon was blamed.',
      'A villager has died, having eaten the thing the elders warned about.',
      'A villager lost an argument with a goat on a narrow path, and the fall killed them.',
      'A villager drank from the downstream well twice, and died of the second cup.',
      'A villager was struck dead by lightning while insisting it never strikes twice.',
      'A villager tripped over the dog, went into the doorpost, and did not get up.',
      'A villager has died of an ache the healer treated with a louder ache.',
      'A villager went to see what the noise in the woods was, and was never seen alive again.',
      'A villager died of old age, which in these years means thirty-one.',
      'A villager choked to death on a barley loaf at an otherwise excellent feast.',
      'A villager caught a chill admiring the new walls and was dead within the week.',
      'A villager died of a bite from something small, green and entirely unbothered.',
      'A villager sat on a warm rock to rest and died there. The rock outlasted them.',
      'A villager has died, insisting to the last that the mushrooms were the good sort.',
    ],
    farm: [
      'A villager was trampled to death by the ox they had just called gentle.',
      'A villager bent to pull one last weed from the barley and died where they stooped.',
      'A villager put a scythe clean through their own boot at harvest, and died of it.',
      'A villager was stung to death by every bee in the orchard at more or less once.',
    ],
    lumber: [
      'A villager shouted TIMBER, stepped back to admire it, and was killed by it.',
      'A villager died beneath the very tree they were leaning on for a rest.',
      'A villager spent the night at the ale barrel, swung an axe at dawn, and died by noon.',
      'A villager misjudged which way an elm falls, and was crushed learning otherwise.',
    ],
    quarry: [
      'A villager was crushed by the very block they had just called a good one.',
      'A villager tested a chisel with their thumb, then a boulder with their head, and died.',
      'A villager died learning that a stone bench can also be a stone ceiling.',
      'A villager was on the wrong side of the wedge when the seam let go, and was killed.',
    ],
    mine: [
      'A villager went back in for one more nugget and was buried by the roof.',
      'A villager died carrying more gold up the ladder than one pair of lungs allows.',
      'A villager lit a lamp in a shaft that had waited years for exactly that, and died.',
      'A villager was run down and killed by an ore cart with no brake and firm opinions.',
    ],
    lodge: [
      'A villager was killed by a boar they had described as more of a large pig.',
      'A villager was outrun by dinner, then caught by it, and did not survive the meeting.',
      'A villager mistook a bear\'s den for a berry patch and died correcting the error.',
      'A villager was gored to death mid-sentence, explaining that this one looked friendly.',
    ],
    gatherWood: [
      'A villager was killed by a dead branch nobody had thought to look up at.',
      'A villager chopped through the limb they were standing on, and died of the drop.',
      'A villager was crushed to death under a bundle of firewood twice their own height.',
      'A villager put an axe into a wasps\' nest on the last blow of the day, and died of it.',
    ],
    gatherStone: [
      'A villager levered out the one rock holding up the others, and died beneath them.',
      'A villager was killed by a chip of flint travelling faster than the eye follows.',
      'A villager went to fetch the crowbar and came back under the pile, quite dead.',
      'A villager died hauling stone up a slope they had already lost an argument with.',
    ],
    gatherFood: [
      'A villager reached deep into the bramble, met something already living there, and died.',
      'A villager was seen off by a territorial swan and never recovered from the encounter.',
      'A villager sampled the berries very thoroughly before bringing any home, and died.',
      'A villager fell out of the apple tree — the good one — and did not get up again.',
    ],
    build: [
      'A villager was under the roof beam at the exact moment the rope was not, and died.',
      'A villager fell to their death from scaffolding everyone agreed was perfectly sound.',
      'A villager died in — and is now part of — the mortar they mixed a little too well.',
      'A villager hit their thumb with the mallet, sat down heavily, and never rose again.',
    ],
    fish: [
      'A villager hooked something larger than the shore they stood on, and drowned.',
      'A villager leaned out for the float, kept on leaning, and drowned in four feet of water.',
      'A villager slipped in the shallows, was far too proud to shout, and drowned.',
      'A villager was pulled under and drowned by a pike that had clearly held a grudge.',
    ],
  },

  /* BARBARIAN CAMPS (tests/raider-camps.mjs). How many the map carries is the
     size factor times the mode's `campMult`; how many barbarians tend each is
     rolled from the mode's `campGuard` band. A tender that falls is replaced
     after `remanDays`, so a camp is only cleared for good by pulling the camp
     itself down. `guardR` is how far from home a tender will stray. */
  /* WHAT EVERY SEAT IS GUARANTEED (tests/worked-ground.mjs). Since a station
     may only stand on ground its own resource was worked out of, a seat with
     no timber in reach can never raise a lumber camp at all. Both tribes get
     at least `min` workable tiles of every gatherable kind within `r`, and at
     least `game` head of game within reach of a lodge's killing ground. THREE
     is the number because three camps still produce meaningfully — a lean
     start should be hard, not dead. */
  START_RESOURCE: { min: 3, r: 14, game: 4 },

  RAIDER_CAMPS: { perArea: 2, min: 2, guardR: 5, remanDays: 6, chaseR: 7 },

  /* THE FIVE PEOPLES OF THE WILD COUNTRY (tests/raider-camps.mjs). The wild
     country is not one undifferentiated mass of "barbarians": five distinct
     peoples walk it, each with its own look, its own camp and its own name in
     the log. A camp is DEALT one when the map is made and keeps it for its
     whole life, so the band you meet at the northern fire is the same people
     every time you go back — and burning that camp out takes those people off
     the board. Every entry needs matching art in sprites.js (TRIBE_ART):
     miss one and the unit falls back to the wolfskins. */
  TRIBES: [
    { key: 'wolf',   name: 'Wolfskins',    note: 'Pelt-hooded raiders who take the wolf as a war-mask' },
    { key: 'flint',  name: 'Flintfolk',    note: 'Old blood of the stone country, antler-crowned' },
    { key: 'broken', name: 'the Broken',   note: 'What is left of a third village, still in its ragged mail' },
    { key: 'woad',   name: 'Woadkin',      note: 'Painted fighters with hair limed white' },
    { key: 'sea',    name: 'the Sea Folk', note: 'Plumed crews off the water, come to take what floats' },
  ],

  MEAT_DROP: 10,               // fallback: food when a wild animal has no MEAT entry
  // the bigger the beast, the deeper the larder — a cow outfeeds a deer, a
  // bear feeds the village, and a wolf is lean eating for the trouble it is
  MEAT: { deer: 8, wolf: 6, boar: 12, cow: 15, bear: 30 },
  PASSIVE_MAX: 10,             // grazing animals kept on the map — two herds' worth
                               // (Units.spawnHerd puts them down 3–5 at a time)
  // full-heal cost scales with missing hp. sapper: 30 matches its food line
  // item at training (cost: { food: 30, wood: 40, gold: 10 }) — the same
  // convention as villager/defender/archer, whose heal price is exactly their
  // training food cost. It's fragile and unarmed (hp 55, atk 3) and expensive
  // to lose mid-dig, so it's worth mending like any other unit — it already
  // stood in the same TC healing ground (Bld.healZoneFor treats every
  // non-naval unit alike); this missing price tag alone gated the heal UI off.
  HEAL_FOOD: { villager: 50, defender: 40, elite: 110,
               rider: 60, lancer: 100, archer: 40, marksman: 70,
               fishboat: 30, fireship: 110, bombard: 120,
               transport: 70,
               catapult: 90, siegetower: 80,
               axeman: 45, longbow: 45, horsearcher: 65, ballista: 85,
               sapper: 30 },

  // units may only be healed on home ground — no patching up in an enemy camp.
  // Land units heal in the town-center grounds; ships heal by a dock. The
  // boundary grows 15% per building level (L2 ×1.15, L3 ×1.15²).
  HEAL_RADIUS: 5,          // tiles from the TC centre at level 1
  HEAL_DOCK_TOUCH: 2,      // ships repair at ANY owned dock, but must be touching it or ≤1 tile off (from the dock's edge)
  HEAL_RADIUS_STEP: 0.15,
  // PER-UNIT HEAL LIMIT — closes the "stand in the TC ring and spam Heal
  // through a live fight" exploit: a unit takes free hits forever if you can
  // just top it off between blows. At most HEAL_LIMIT_N heals per unit in any
  // HEAL_LIMIT_MS real-time window (UI.healLog — wall-clock, not game days:
  // the exploit is spam-clicking in real time during a live fight).
  HEAL_LIMIT_N: 3,
  HEAL_LIMIT_MS: 60000,

  // "group nearby / group fleet" and double-tap-select-same-type both gather units
  // within this radius (tiles) of the tapped one — one grouping sphere for both
  GROUP_R: 6,

  // WAR CAMP: soldiers standing within this many tiles of a forward camp are mended
  // (a field hospital), and the only structures you may raise at a forward camp are
  // these military/support ones — no relocating your economy to the front line.
  // The Dock counts as military here: a beachhead needs its warships and
  // transports staged at the front, not a long sail from home.
  WARCAMP_HEAL: 1.5,
  STAGING_BUILD: ['barracks', 'stable', 'range', 'siege', 'sapper', 'tower', 'wall', 'gate', 'warcamp', 'dock'],

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

  /* SPECIAL EVENTS — rare spectacles. A game rolls AT MOST ONE special event,
     and only `chance` of games roll any at all: when something vast finally
     surfaces, it stays special. `pool` maps each event to the modes it can
     appear in; the roll happens once in G.newGame (seeded).
     TO ADD A NEW EVENT: (1) register it here (plus its own tuning const like
     DRAGON below), (2) init its state in G.newGame gated on S.special === key
     (and a legacy default in G.loadJSON), (3) trigger + drive it with a tick
     fn from G.update, (4) give it Sprites.misc.<key> — an ARRAY of frames the
     renderer cycles (4+ frames reads smooth), drawn oversized like the
     kraken/dragon, (5) score it in CFG.SCORE if it's worth points. */
  /* pool: modes each event may appear in, and whether it lands as a NEGATIVE
     (punishment) — the roll leans posWeight toward the delights. The dragon
     counts as a delight: it burns the army at YOUR gates.
     The player-helping delights (sons, cache) additionally sit behind
     G.positiveGate: defenses breached + zero soldiers + 5 real minutes played. */
  SPECIALS: {
    chance: 0.33, posWeight: 0.6,
    pool: {
      kraken: { modes: ['calm', 'moderate', 'hard'], neg: true },
      dragon: { modes: ['moderate', 'hard'] },
      sons:   { modes: ['calm', 'moderate', 'hard'] },
      cache:  { modes: ['calm', 'moderate', 'hard'] },
      winter: { modes: ['moderate', 'hard'], neg: true },
      plague: { modes: ['moderate', 'hard'], neg: true },
    },
  },
  DRAGON: { minDay: 25, foesMin: 6, radius: 9 },

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
      // Softened after a playtest read Calm as "a little too hard": the sword
      // arm is dialed well back (later first wave, rarer and smaller bands, a
      // much later and smaller rival army that commits reluctantly) while the
      // rival's HOMESTEAD grows richer — more villagers trained sooner, more
      // build actions, full output — so the town you eventually visit is a
      // living farm sprawl, not a war camp. Calm = watch it farm, not fight.
      waveFirst: 85, waveGapMult: 2.8, waveSizeAdd: -2, barbMult: 0.75,
      campMult: 0.6, campGuard: [1, 2],
      deathEvery: [34, 52],   // days between villager deaths (tests/mortality.mjs)
      animalMax: 2, animalChance: 0.15, aiRaidDay: 110,
      aiBuildEvery: 2, aiOutput: 1.0, aiArmyCap: 5, aiArmyDiv: 14, aiEliteShare: 0.1, aiAggro: 0.4,
      aiVillCap: 12, aiVillEvery: 11, aiActions: 2, aiHarass: 0,   // calm: no harassment parties
      foeNoteChance: 1,   // enemy/raider intel toasts (see G.foeNote) — Calm always warns you
      // THE WONDER (tests/wonder.mjs) works on EVERY difficulty — the rules
      // never ask what mode you are in. This flag only decides whether the
      // build menu SHOWS the button, and for now that is Calm alone: the
      // peaceful mode is the one that needed a way to win without a war.
      wonderMenu: true,
    },
    moderate: {
      name: 'Moderate', icon: '⚔️', desc: 'The intended experience.',
      gather: 1, output: 1, finishTC: true,   // one reprieve, then barbarians finish a collapsed clan
      waveFirst: 40, waveGapMult: 1.5, waveSizeAdd: 0, barbMult: 1,
      campMult: 1, campGuard: [1, 3],
      deathEvery: [25, 40],   // days between villager deaths (tests/mortality.mjs)
      animalMax: 3, animalChance: 0.2, aiRaidDay: 50,
      // army volume dialed back ~20% from the original 9/8 tuning — playtesting
      // read as relentless; the player needs a breath between pushes. aiEarly
      // further trims the standing-army target before day 100 (see AI.armyWant)
      // so the opening 100 days ramp up more gently.
      // Retuned after a day-159 game read as too easy: the rival finished with
      // thousands of food it had no way to spend, because its army target
      // topped out around thirteen. A bigger standing force (and a faster ramp)
      // turns that dead granary into pressure without touching its judgement.
      aiBuildEvery: 2, aiOutput: 1.0, aiArmyCap: 10, aiArmyDiv: 8, aiEliteShare: 0.45, aiAggro: 0.95, aiEarly: 0.9,
      // HUMANIZED THROUGHPUT (not intelligence): the rival's economy now runs on a
      // real villager workforce (aiVillCap / aiVillEvery — kill its workers, cut its
      // income) and it has one pair of hands: aiActions macro actions per day
      // (build/upgrade/train/caravan each spend one). Strategy layers untouched.
      aiVillCap: 15, aiVillEvery: 10, aiActions: 3,
      aiHarass: 8,   // days between two-rider harassment sorties at scouted, exposed workers
      foeNoteChance: 0.5,   // enemy/raider intel toasts (see G.foeNote) — half get through
    },
    hard: {
      name: 'Hard', icon: '💀', desc: 'Slower gathering, relentless enemies.',
      // Difficulty lives on the enemy side (more, smarter, better-paced foes),
      // not in stacked player penalties. A single mild gathering tax keeps the
      // "slower gathering" identity without double-dipping production too, and
      // enemy stats are only lightly inflated (1.1×) — the pressure is VOLUME +
      // competence + timing, not stat sponges. barbSpacing keeps a barbarian
      // wave and a rival raid from landing in the same window (see AI.daily).
      // Dialed up a notch after a day-167 Hard win read as too easy: the
      // rival's push mass (cap 13, ramping 2 + day/6) never truly threatened
      // a walled, towered town that teched to elites + engines by day 150.
      // Still VOLUME + tempo, not stat sponges: a bigger standing army that
      // ramps faster, a slightly richer economy to sustain it, and barbarian
      // waves a shade heavier and closer together.
      gather: 0.90, output: 1.0, finishTC: true,   // one reprieve, then barbarians finish a collapsed clan
      waveFirst: 33, waveGapMult: 0.85, waveSizeAdd: 1, barbMult: 1.15, barbSpacing: true, bandCap: 9,
      campMult: 1.5, campGuard: [2, 3],
      deathEvery: [18, 28],   // days between villager deaths (tests/mortality.mjs)
      animalMax: 4, animalChance: 0.3, aiRaidDay: 32,
      aiBuildEvery: 1, aiOutput: 1.25, aiArmyCap: 15, aiArmyDiv: 5, aiEliteShare: 0.8, aiAggro: 1.2,
      aiVillCap: 18, aiVillEvery: 8, aiActions: 4, aiHarass: 5,
      foeNoteChance: 0,   // enemy/raider intel toasts (see G.foeNote) — none get through: everything a surprise
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
    radius: 6,        // fallback hold radius (land classes below override), tiles
    // LAND HOLDS BY DOCTRINE (tests/defend-hold.mjs): fixed, no level scaling —
    // the whole point of Defend is a TIGHT ring. The workshop's engines stand
    // closest to the hall, the ranges' bows a ring further, the barracks'
    // blades the outer watch. Tower lanes / wall ceilings still apply on top.
    holdByClass: { melee: 5, ranged: 4, siege: 3 },
    // how far past the bound an ENGAGED guard may trail its foe before it's
    // reined home — blades commit a couple of steps, bows one, engines none
    chaseByClass: { melee: 2, ranged: 1, siege: 0 },
    navalRadius: 12,  // base hold radius for warships around a Dock (level 1)
    levelStep: 0.12,  // +12% per building level above 1 (naval only now)
    maxRadius: 8,     // hard cap on the OPEN-GROUND perimeter (no barrier near)
    sortie: 0.12,     // a slim leash past the hold radius before it's reined back in
    // ceiling for tower-lane extensions of the watch (see Units.holdRadius)
    maxNatural: 14,
  },
};
