"use strict";
/* PATCH NOTES — what changed, in the players' own words (tests/patch-notes.mjs).

   THE RULE: every push to main adds an entry here, at the TOP, and its
   `build` is the shared code version every `js/` script tag in index.html
   carries (`?v=N`). The contract fails the moment the two disagree, so a
   deploy without a note cannot pass the sweep.

   HOW TO WRITE ONE. Newest first. `date` is the day it shipped (YYYY-MM-DD),
   `title` a few words a player would use, and `items` the changes a PLAYER
   would notice, each a plain sentence: what you will see, never how it was
   done. No function names, file names, version jargon or brackets — the
   contract refuses camelCase, dotted names and parentheses, because those
   are the tells that a line was written for us and not for them. Group a
   day's work into one entry; a fix nobody can see does not need a line.

   Shown by the settings page's Patch Notes tab (js/settings.js): the newest
   open, the rest folded, and a red dot on the tab until the newest has been
   seen on this device. */
const PATCH_NOTES = [
  {
    build: 97, date: '2026-10-27', title: 'Cards: the playtest build',
    items: [
      'All 36 cards can be tried on the card test link, no earning needed.',
      'Every card\'s effect has been reworked so you can see exactly what it did, where it did it.',
      'Cards that work over an area now mark it with a slow gold orbit instead of a plain circle.',
      'The timers for running cards are smaller and sharper, so they no longer cover the map.',
      'The stone card frame lost a few stray pixels.',
    ],
  },
  {
    build: 96, date: '2026-10-27', title: 'Every card has its painting',
    items: [
      'All 36 cards now carry their own hand-made illustration.',
      'The dragon and the kraken have been redrawn as real beasts: the dragon flies high over the fire it breathes, and the kraken rises out of open water.',
      'Both monsters now roar, breathe and splash with their own sounds.',
    ],
  },
  {
    build: 95, date: '2026-10-27', title: 'The card deck arrives, in testing',
    items: [
      'Win a game and you earn a card to keep. Lose after a real fight and you can earn one too.',
      'Play a card in any later game for a one-time boost: goods, soldiers, a blessing, or a blow against your rival.',
      'A new reward screen shows the card you earned on its pedestal, and the collection shows every card you hold.',
      'Cards are being tested before everyone gets them, so for now they only appear on the test link.',
    ],
  },
  {
    build: 94, date: '2026-10-25', title: 'Builders face their work',
    items: [
      'Villagers raising or working a building now face it, instead of hammering at the open meadow with their backs to it.',
      'The two hands at a lumber camp, quarry or mine face each other across the work.',
    ],
  },
  {
    build: 93, date: '2026-10-22', title: 'A clearer top bar on iPhone',
    items: [
      'On iPhone, the food, wood, stone and gold counters now sit clear of the blurred strip under the clock.',
      'The game added to your home screen now keeps a solid black band behind the clock, so nothing in the game sits under it.',
    ],
  },
  {
    build: 92, date: '2026-10-18', title: 'Forts that go up and come down',
    items: [
      'Walls, gates and towers are now built in three drawn stages, and show two drawn levels of damage as they are battered.',
      'A broken gatehouse hangs a broken door, and a wrecked watchtower topples as a ruin.',
      'Bears now have true side views, and turn to face the way they are really walking.',
    ],
  },
  {
    build: 90, date: '2026-10-06', title: 'A new wall kit',
    items: [
      'Walls, wall towers and gatehouses are newly drawn at all three tiers: a turf rampart with a wattle fence, an oak palisade, and a stone curtain.',
      'Wall towers are roofed and seen from the same high angle as the rest of the town.',
      'Walls and gates are a quarter smaller, and nothing in the wall stands taller than a watchtower.',
      'Open gates are see-through, and units no longer pop in front of a gatehouse as they walk through it.',
    ],
  },
  {
    build: 86, date: '2026-10-04', title: 'Buildings rise as they are built',
    items: [
      'Lumber camps, quarries, mines, lodges and farms now go up through their own construction stages instead of a generic building site.',
      'The barracks, archery range, stable, siege workshop, sappers\' camp, trading post and war camp are redrawn, each with its own stages.',
      'The watchtower is redrawn bigger, on a turf mound, at the same scale as your villagers.',
    ],
  },
];
window.PATCH_NOTES = PATCH_NOTES;
