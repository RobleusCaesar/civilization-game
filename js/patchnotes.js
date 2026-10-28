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
    build: 108, date: '2026-10-28', title: 'Gold mines change hands',
    items: [
      'Drive the rival\'s miners off a gold mine and it is yours to take: send a villager and they start work, with no building to tear down first.',
    ],
  },
  {
    build: 107, date: '2026-10-28', title: 'A fairer endgame',
    items: [
      'Wonders now rise only in Calm worlds. The rival can no longer win by raising one on Moderate or Hard, and one already rising in a saved game is called off when you load it.',
      'The countdown for a rival Wonder is shorter and fits on every screen, above your messages instead of on top of them.',
      'A defeat that scores 20,000 points or more now earns a Bronze or Iron card, never a Stone one.',
      'Bugs, crash reports and ideas you send from the Feedback tab now land in a proper inbox, where each one is tracked until it is fixed.',
      'When something goes wrong during a game, the game quietly notes it, so crashes nobody reported can be found and fixed too. Nothing personal is sent.',
    ],
  },
  {
    build: 106, date: '2026-10-28', title: 'Cards for everyone',
    items: [
      'Cards are here for every player: win a game to earn a card, and play it in a later game for a one-time boost.',
      'A hard-fought defeat can earn a card too, and every new player starts with three cards to try.',
      'A short guide on the title shows how to earn cards, how to play them and the legends worth chasing. You can open it again from your collection.',
      'The title screen is now the valley at night, with a burning campfire and a falling star over the hall.',
      'Settings is a new carved page with tabs, and these patch notes live there. A red dot tells you when there is something new to read.',
      'You can send a bug, an idea or a crash report straight to the developer from the Feedback tab in Settings.',
    ],
  },
  {
    build: 105, date: '2026-10-28', title: 'A livelier night, in testing',
    items: [
      'How to Play in the card guide shows two cards now, so nothing runs over the frame on a computer or a phone.',
      'A hard-fought defeat is shown as a torn war banner, burnt through and full of arrows.',
      'The night painting behind the title and the card guide has finer pixels, so it sits better beside the cards.',
      'The campfire on the title really burns now, with flickering flames, sparks and smoke, and the comet streaks with light down its tail.',
    ],
  },
  {
    build: 104, date: '2026-10-28', title: 'A tidier card guide, in testing',
    items: [
      'The guide that introduces cards is smaller on a computer screen, so it no longer fills the window.',
      'How to Earn is simpler: a good win earns one card, a hard-fought win two, and a hard-fought defeat still earns one.',
      'The defeat box shows a broken shield now, with blood splattered behind it.',
      'The five card tiers have a page of their own, with one short line on what each tier brings.',
      'The Prizes page is just the two legendary cards and one line: the harder the fight, the rarer the card.',
    ],
  },
  {
    build: 103, date: '2026-10-28', title: 'A calmer victory screen, in testing',
    items: [
      'On a phone the victory and defeat screens are calmer: the list of cards you played and the cards in your deck box are gone, and the deck count stays in the corner.',
      'The title, the card, your score and the Claim button now sit evenly spaced inside the frame, with Claim no longer pushed to the bottom edge.',
      'On a phone the Leaderboard is the small podium button beside Claim, so it is always on screen.',
      'A wide screen keeps the cards you played and your deck count beside the card.',
    ],
  },
  {
    build: 102, date: '2026-10-28', title: 'Cards up close, in testing',
    items: [
      'A card you tap for a closer look is smaller now, so its painting stays crisp instead of blocky.',
      'Turn it over and the words on the back stay about the size they were, only a little smaller on the wordiest cards.',
      'For now the cards show on the card test link only.',
    ],
  },
  {
    build: 101, date: '2026-10-28', title: 'A new title screen, in testing',
    items: [
      'The title screen has a new painting: the valley at night, the village lit, a campfire, and a falling star over the hall.',
      'The menu buttons are carved wood with gold trim, sharp on every screen, with New Game in gold.',
      'Phones get a tall painting and wide screens a wide one.',
      'Feedback you send now simply says Sent. It only says it will wait if you are offline.',
      'For now the new title shows on the card test link only.',
    ],
  },
  {
    build: 100, date: '2026-10-28', title: 'A new settings page, in testing',
    items: [
      'Settings has been rebuilt as one carved page with tabs for General, Audio, Saves, Feedback and Patch Notes.',
      'The autosave choice is now one small bar instead of four big buttons.',
      'You can send a bug, an idea or a crash report straight to the developer from the Feedback tab, with your email so we can write back.',
      'These notes now live in Settings, and every update adds one. A red dot tells you when there is something new to read.',
      'For now the new page shows on the card test link only.',
    ],
  },
  {
    build: 99, date: '2026-10-28', title: 'Cards, announced',
    items: [
      'The first time you open the game with cards on, a short four-page introduction shows how to earn them, how to play them and the legends worth chasing.',
      'You can open it again any time from your collection with How cards work.',
      'Soldiers summoned by a card now land in soft rolling dust.',
      'The ancestors called by a card look like spirits on a phone screen instead of checkered blocks.',
    ],
  },
  {
    build: 98, date: '2026-10-28', title: 'Sharper card effects and a grander victory',
    items: [
      'Every card effect is now drawn at your screen\'s full sharpness: the Golden Age sun, the beams as soldiers arrive, the dragon\'s fire, the kraken\'s splashes and the rest.',
      'The healing ring around a hurt unit and the range rings shown while you place a tower or war camp are now a slow gold orbit.',
      'The timers for running cards in the top bar are crisp on every screen.',
      'The victory and defeat screens have new painted valleys, a carved stone pedestal for your card and more room under the title.',
    ],
  },
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
