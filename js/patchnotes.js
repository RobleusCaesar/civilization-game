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
    build: 151, date: '2026-11-05', title: 'Archers on the towers',
    items: [
      'The watchtowers have lost their roofs: every tower now has an open lookout platform on top.',
      'Select archers and tap one of your towers to send up to two of them onto it. Climbing up or down the stairs takes a second, and they cannot be hit on the way.',
      'Archers you send up a tower are let go from your selection, so your next tap is a fresh one and never calls them back down.',
      'Archers up there stand inside the platform, behind its rail or its battlements, two side by side.',
      'Tap an archer on a tower, then tap an enemy soldier or building, and he shoots at it from up there.',
      'Selecting all the soldiers around a spot, grouping nearby soldiers or tapping an army banner leaves the archers on your towers at their posts. Only a tap on the archer himself selects him.',
      'An archer on a tower has no Defend button, since guarding is what he is up there for.',
      'An archer on a tower sees twice as far and shoots over walls. He shoots only enemies you can see, and no farther than the lit ground around his tower. Only archers and siege engines can hit them up there.',
      'Your towers no longer shoot on their own. A tower fights only when archers are on it, so send some up to defend it.',
      'Archers on a tower hit 25 percent harder and are 25 percent tougher than they are on the ground. Every kind of archer gets the same boost on every tower, so a better archer on the ground is a better archer up there.',
      'Upgrading a tower makes it harder to knock down, and a taller tower sees a little farther, so its archers can shoot a little farther. It does not change how hard they hit.',
      'The Watchfires card now makes the archers on your towers, and your War Camps, hit harder and shoot farther.',
      'If a tower falls, the archers on it fall with it.',
      'Walls now block sight. Soldiers on either side of an unbroken wall can no longer shoot or strike each other through it, until a breach or an open gate lets them see through.',
      'A lowered drawbridge now reaches all the way across the ditch in front of its gate and rests on the far bank.',
      'Soldiers crossing a drawbridge walk on top of it, and pass under the arch of the gate as they go through.',
    ],
  },
  {
    build: 144, date: '2026-11-04', title: 'A new look for Load and the Guide',
    items: [
      'The Load page has been rebuilt to match Settings: each save shows its map, its day, the land and how long you have played, with a clear Load button.',
      'Renaming and deleting a save are small buttons beside it, and deleting asks you once more before it goes.',
      'The Guide now turns like a book: a picture for each page, Back and Next, and a dot for every page you can jump to.',
      'Both pages stand on the night sky when opened from the title screen.',
    ],
  },
  {
    build: 143, date: '2026-11-04', title: 'The board on one page',
    items: [
      'The leaderboard now shows the top ten chiefs on a single page, with nothing to scroll.',
      'Each place now shows just the name, the score and the difficulty.',
      'The difficulty and week filters are gone for now, so there is one board to climb.',
      'On a phone turned on its side, the podium stands beside the rankings.',
    ],
  },
  {
    build: 142, date: '2026-11-04', title: 'A new world board',
    items: [
      'The leaderboard has been rebuilt: the three best chiefs stand on a podium under gold, silver and bronze medals, with everyone else ranked beneath them.',
      'Each chief now appears once, at their best victory, with how many victories they have won.',
      'Every place shows the difficulty, the day of the win and the origin card the clan was founded with.',
      'Look at the board for one difficulty at a time, or for this week alone.',
      'Your own place is marked in gold, and if you are not on the list your best victory waits at the bottom.',
      'Finish in the top ten and your reward card may rise a tier. Finish in the top three and it always does.',
      'Wins that used cards now go on the board too, marked with a small card and how many were played.',
      'Wins from test builds no longer go on the board.',
    ],
  },
  {
    build: 141, date: '2026-11-04', title: 'Build your own roads',
    items: [
      'A new Road sits beside the House in the build menu: drag across the ground and a villager lays it, quickly, for 10 wood and 5 stone a stretch.',
      'Your villagers and soldiers walk faster on a road and keep to the roads when they can.',
      'Roads grow with your Town Center, at no cost: a worn track at first, then a packed earth road, then a paved stone road with kerbs and milestones.',
      'Roads turn, meet and cross, and lie worn into the land with ruts, stones and grass along their edges.',
      'The paths your villagers used to wear by themselves are gone. You build the roads now.',
      'A builder shows Build and Cancel side by side, so the panel takes less room.',
      'While something is being built or upgraded, its Upgrade button turns into Cancel and shows how far along the work is. That goes for every building, the wall works and bridge works too, and calling it off gives back everything you paid.',
      'Every panel now lays its buttons out two to a row, with no long buttons, so a Barracks fits Upgrade and its three soldiers in two rows.',
      'Every gate now has a road running through it and a little way out either side, so a road you lay up to a gate carries on through it. It is always your own road, worn track, earth road or paved, whatever level your Town Center has reached.',
      'The bar of earth across the foot of the wooden gateway is gone, so villagers walking through a gate no longer look cut off at the knees.',
    ],
  },
  {
    build: 135, date: '2026-11-03', title: 'Buildings settle into the land',
    items: [
      'Every building now casts a soft shadow across the grass, so it sits on the ground instead of floating over it.',
      'The hall and the workplaces stand in a yard of worn earth, wider at the door where the comings and goings are.',
      'Houses and watchtowers are wrapped in bushes, ferns and long grass, with the doorway always left clear.',
    ],
  },
  {
    build: 134, date: '2026-11-03', title: 'Vote and get a free card',
    items: [
      'A new gold banner under the title menu: tap it, vote for Clanfire on Vibe Top List, and a free card joins your deck. Your first vote earns Swift Raiders, and every vote after that earns a random Stone card.',
      'You can vote once every 12 hours. The banner rests while you wait and comes back when you can vote again.',
      'After you claim a card at the end of a game, the reward screen offers another the same way. The vote link has moved off the Cards screen.',
    ],
  },
  {
    build: 133, date: '2026-11-03', title: 'Vote for a card',
    items: [
      'Vote for Clanfire on Vibe Top List from the Cards screen and a Swift Raiders card joins your deck. You can earn one every 12 hours.',
    ],
  },
  {
    build: 132, date: '2026-11-03', title: 'The village opens looking right',
    items: [
      'When a game opens, the ground around your village is now painted before you see it, instead of starting as flat colour and filling in. The loading screen can stay up a few seconds longer while this happens. Ground hidden in the dark still fills in once you are playing.',
    ],
  },
  {
    build: 131, date: '2026-11-02', title: 'Quieter red buttons',
    items: [
      'The small Demolish, Banish and Scuttle buttons are toned down so they no longer draw the eye. They only turn bright red once you tap them to confirm.',
    ],
  },
  {
    build: 130, date: '2026-11-02', title: 'Tidier panels',
    items: [
      'Demolish, Banish and Scuttle are now a small red button beside the close button, so they no longer take up a big space in every panel. Tap it once and a warning shows what you lose and what comes back. Tap again to confirm.',
    ],
  },
  {
    build: 129, date: '2026-11-02', title: 'Fewer animals near home',
    items: [
      'Far fewer deer and cattle wander near your town and your rival’s, so food is scarcer at the start and the herds no longer crowd your village. The wild country further out is as full of game as before.',
    ],
  },
  {
    build: 128, date: '2026-11-02', title: 'A game that answers you',
    items: [
      'A message that explains why something can’t be done now stays up long enough to read, and tapping again brings it back with a small shake.',
      'Tap any number in the top bar to see where it comes from: what your workers, farms, mines and hall bring in, what is eaten, how much room your town has and how long a day lasts. The number beside your food now shows what your larder really gains or loses each day.',
      'When a villager’s tree, rock, field or fishing spot runs out, a note tells you, so idle hands don’t go unnoticed.',
      'Rally, a villager’s Build button, army tactics, sapper tools, saving an army and laying a wall now tell you what to tap next. A farm, lumber camp, quarry or lodge you can’t place yet says in one short line what to do first.',
      'When you choose a building to place, a cancel button and a short how-to show straight away.',
      '“Under attack!” now shows on the first blow, and a short note tells you when a building finishes, a unit is trained or a building rises a level where you can’t see it.',
      'Two fingers now pan the map, a pinch keeps the ground under your fingers, and panning no longer lags behind your finger. A slow, deliberate tap now selects, and a tap made while the game is busy is no longer lost.',
      'On a computer, trackpad scrolling and pinching zoom smoothly, and right-clicking the map no longer opens the browser’s menu.',
      'A quick double-tap on Demolish, Banish, Scuttle or Cancel no longer confirms it by accident: tap once to arm it, then again a moment later.',
      'On phones, the Build tab, the Pause and Menu buttons and the small arrow under the minimap catch a tap that lands a little short of them.',
      'The tutorial moves the view so the tree, bush or rock it asks you to tap is never hidden, its tips can be dismissed, its messages appear below its card, and news about your rival waits until you can read it.',
      'Continue opens your game on the first tap and greets you with the day you left off on. When a saved game can’t be opened, or the cloud doesn’t answer, the menu now says why and every button keeps working. Saving, importing a file and restoring your identity now say whether they worked.',
      'A save you asked to load and then left by going back to your game no longer opens over it later, Load tells you when a game is already opening, and cloud problems, the world board’s included, are explained in plain words.',
      'With a phone held sideways, a message on the title screen no longer covers the Load and Cards buttons.',
      'The loading bar moves steadily while the world is prepared, and the loading screen can no longer get stuck.',
      'New games and Continue open sooner, phones most of all: the game no longer waits to download soldiers and boats you don’t have yet.',
      'The ground of a new game is prepared while you choose your card, so it is usually ready the moment the world opens.',
      'If your connection drops for a moment while a game is loading, your villagers get their proper look back as soon as it returns.',
      'Leaving the game for another app or tab silences it even with the music off, and a tune that fades out really stops.',
      'The Guide’s page on food, the music line in Settings and a war party’s title now say what is true.',
    ],
  },
  {
    build: 127, date: '2026-11-02', title: 'Your games, kept safe',
    items: [
      'Continue now always opens the game you saved. Before, it could sometimes open a random world with no controls instead, most often on a phone right after the page loaded.',
      'The title screen no longer freezes when you open the game without a connection.',
      'Starting a new game and leaving before you play it no longer replaces the unfinished game that Continue was keeping for you.',
      'A second game in the same visit is now kept safe from its first days, just like the first.',
    ],
  },
  {
    build: 126, date: '2026-11-01', title: 'Every land its own country',
    items: [
      'Each world now has the character of a real countryside, chosen by its landform: rolling Tuscan fields of wheat and green, grey limestone karst with red earth in its hollows, a pale steppe with salt flats, Mediterranean garrigue on the islands, and meadow foothills under the high peaks.',
      'Gentle hills rise and fall across the land, lit by the sun, and the colours of dry and lush ground blend gradually into each other.',
      'Dry country is drawn with care: tufts of grass thin out over dusty soil, pebbles and small stones lie about, clay and salt crust crack, and bare rock breaks through as weathered outcrops.',
      'Mountains rise out of their own fallen stone instead of sitting on top of the land.',
      'Berry bushes and orchards always grow in lush green ground.',
      'A few low plants that belong to each dry land grow in small patches: thyme and lavender, creeping juniper, feather grass and broom.',
      'The water shimmers more gently, so it no longer pulls the eye.',
    ],
  },
  {
    build: 125, date: '2026-11-01', title: 'A new look for the land',
    items: [
      'Water is brighter and clearer. You can see sand and stones through the shallows, small waves drift across open water, and sunlight sparkles on it.',
      'Every pond has its own character: some are ringed with reeds and lilies, some are rocky, some are clear over pale sand, and some are deep.',
      'Grass is crisper, with drier and lusher patches that blend into each other.',
      'Mountains are drawn as one continuous mass of weathered stone with grassy ledges and foothills, and their edges no longer end in straight cuts.',
      'Beaches narrow and fade into the grass instead of ending in square blocks of sand.',
      'Orchards mix big and small trees and no longer stand in neat rows.',
    ],
  },
  {
    build: 124, date: '2026-10-30', title: 'The stone gate and its drawbridge',
    items: [
      'A stone gate in a wall running north to south no longer looks like another tower. The wall ends in its round towers on either side, a cobbled road runs between them, and the wall walk crosses over the road on an arch.',
      'Where that walk reaches the round tower beside the gate, it goes in through a doorway half way up the tower instead of stopping at its foot.',
      'The drawbridge stays. Lowered, it lies along the road. Raised, it stands upright beside the arch with its chain running up to the walk.',
    ],
  },
  {
    build: 123, date: '2026-10-30', title: 'Gates that look like gates',
    items: [
      'A gate in a wall running north to south no longer looks like another tower. The wall now ends on either side of it, a road runs through the gap, and two gateposts hold the doors.',
      'Closing one of these gates swings its doors across the road. Opening it swings them aside, so you can see at a glance that the way is clear.',
      'A timber gate in a north to south wall now hangs two heavy iron-strapped doors instead of a portcullis, and its button says Open or Close the gates.',
    ],
  },
  {
    build: 122, date: '2026-10-30', title: 'Timber and stone walls',
    items: [
      'A wall that is still being built now joins the sections beside it, so a new line goes up as one wall instead of a row of separate stumps and towers.',
      'The round towers at the ends and corners of stone walls are round all the way up, with no dark slab standing beside them.',
      'Stone wall footings no longer leave a short trench of stones running out past the end of the line.',
      'The log blocks on timber walls have whole corners again.',
      'On a timber gatehouse seen from the side, the portcullis hangs against the gatehouse and climbs its wall when raised, instead of floating in the grass.',
    ],
  },
  {
    build: 121, date: '2026-10-29', title: 'More music',
    items: [
      'Three new pieces of music join the theme. Every five minutes or so the music fades into the next one, and round it goes, so a long game no longer plays the same tune over and over.',
    ],
  },
  {
    build: 120, date: '2026-10-29', title: 'Tighter walls',
    items: [
      'Towers no longer slip underneath mountains, and a mountain behind a wall stays behind it.',
      'Walls and towers in a long north to south line no longer flicker over and under each other as people walk past.',
      'A wall running north to south now climbs halfway up each tower and goes in by a doorway, so the line reads as one wall.',
      'Walls stop at the edge of the map instead of hanging over the black.',
      'Walls no longer reach out into water or up into a mountain. A line that meets them ends neatly instead.',
      'The ends of earthen walls are tidy rounded mounds with no cut off fence, and the log blocks on timber walls are as wide as the walkway they cap.',
    ],
  },
  {
    build: 119, date: '2026-10-29', title: 'Quieter sounds',
    items: [
      'Every sound effect is about 40 percent quieter.',
      'The click when you tap or select is much softer, since you hear it so often.',
    ],
  },
  {
    build: 118, date: '2026-10-29', title: 'The sound of the valley',
    items: [
      'A new theme plays over the title and your town.',
      'Battle music builds as your army marches on the rival town and beats through the fight, then fades back to the theme when it is over.',
      'New sounds for the work and the wars of your people: axes, picks, rakes and hammers, blades, bows, siege engines and hooves.',
      'You hear what you are looking at. Sounds off screen are silent, those at the edges are soft, and your own soldiers lead the battle sound.',
    ],
  },
  {
    build: 117, date: '2026-10-29', title: 'A higher top bar',
    items: [
      'On an iPhone home-screen app, the top bar sits higher, so your food, wood, stone and gold are closer to the clock and the map has a little more room.',
      'The thin gold line where the top and bottom bars meet the map now runs straight across, a shade quieter.',
    ],
  },
  {
    build: 116, date: '2026-10-29', title: 'A calmer Town Center',
    items: [
      'The Town Center keeps only what you need. Raise the levy and Sound the horn now appear when your town is in danger: something of yours is under attack, or an enemy you can see comes close to the hall.',
      'Set rally and Call idle are small buttons on one line beside the training queue, so the panel is shorter, especially on a phone.',
    ],
  },
  {
    build: 115, date: '2026-10-29', title: 'A finer frame',
    items: [
      'The top and bottom bars are now dark walnut with a fine gold inlay, sharp on every screen, in place of the old blocky planks.',
      'The building cards along the bottom are smooth raised plates, so the row reads clean.',
    ],
  },
  {
    build: 114, date: '2026-10-29', title: 'A tidier top bar',
    items: [
      'The map button now sits in the top bar beside your cards. Tap it to open or fold the minimap, which still opens in its corner with the arrow beneath it.',
    ],
  },
  {
    build: 113, date: '2026-10-29', title: 'Cards worth keeping',
    items: [
      'The difficulty and origin cards are redrawn with carved gold frames, glowing pictures and sharper art on every screen.',
      'Each difficulty has its own painted picture: an olive branch for Calm, a spear and shield for Moderate, a horned skull for Hard.',
      'The origin cards you pass over now truly burn up: they catch at one corner, char, and go up in flames, sparks and ash.',
      'The cards are made ready while you are on the title screen, so New Game opens on finished cards straight away.',
      'The new game and origin screens stand on the night valley instead of a black screen while your world loads.',
    ],
  },
  {
    build: 111, date: '2026-10-29', title: 'A quicker start',
    items: [
      'Starting a new game is much smoother: the origin cards deal and turn over straight away instead of stalling while the game loads its people.',
      'The game opens a little faster, especially on older phones.',
    ],
  },
  {
    build: 110, date: '2026-10-29', title: 'Roomier end screens',
    items: [
      'On a phone, the victory and defeat screens show your final score on one line and drop the day and difficulty, so the buttons fit on the screen.',
    ],
  },
  {
    build: 109, date: '2026-10-29', title: 'Clearer prices',
    items: [
      'When you are short of something you want to build, the note now shows a whole number and the right resource. Gold no longer looks like stone.',
    ],
  },
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
