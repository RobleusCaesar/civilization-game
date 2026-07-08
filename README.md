# Clanfire — Browser Civ-Builder

A single-era, mobile-first civilization builder that runs entirely in the browser.
Vanilla HTML/CSS/JS + Canvas 2D — **no build step, no bundler, a static site**.
Cloud saves are optional: point `js/config.supabase.js` at a Supabase project
(see `BACKEND.md`) and every player gets an anonymous identity with five named
save slots; without it the game still plays fully, with file export/import.
All art is elevated 16-bit-style pixel work generated procedurally at load from
a single style system (`js/artstyle.js`, rules in `ARTSTYLE.md`) — master
palette, locked top-left lighting, outlines, drop shadows, material textures,
and a level-tier visual language. The whole game works offline from a static
file server. Expect living touches: animated water with foam shorelines,
hearth smoke, jumping fish, butterflies and birds, and a gentle dusk that
drifts through every ~12 days.

## Play it

Serve the repo as a static site and open `index.html` — e.g.:

```sh
npx http-server .          # then open http://localhost:8080 on your phone
# or
python3 -m http.server     # http://localhost:8000
```

(It also works opened directly as a local file — there are no module imports or
fetches.) Optimized for portrait phones / mobile Safari; works fine with mouse
on desktop too.

## How to play

- **Difficulty**: pick 🌿 Calm, ⚔️ Moderate, or 💀 Hard when starting a new game
  (☰ menu). Calm is nearly peaceful — the occasional wild animal, rare raids, and
  a slow, compact rival tribe; Hard gathers ~15% slower with earlier, bigger,
  more frequent raids, bolder wildlife, and a rival that builds and arms fast.
- **The map**: pick 🏞 Medium, 🗺 Large, or 🌍 Extra Large when starting a new
  game. Each map rolls a landform — green valleys, lake-dotted lakelands, rugged
  highlands with impassable mountain ridges, or island chains linked by
  causeways (mountains and water can't be crossed or built on, so terrain
  shapes your defenses). Both tribes settle somewhere along the map's outer
  band — never the middle, never predictable corners, always far apart — and
  every map is critically short on one resource (wood, stone, or food) — even
  on Extra Large the scarce resource stays a single small pocket (always at
  least 6–8 workable tiles, so the map is never unwinnable), and scouting and
  holding it remains the strategic heart of the match.
- **Time**: each turn is one in-game day and auto-advances every 10 seconds;
  a full playthrough runs about 20 minutes.
  ⏸ pauses; ☰ opens the pause menu (save / load / settings / event log /
  quit to title — quitting warns about unsaved progress).
- **Camera**: drag to pan, pinch (or mouse wheel) to zoom, tap the minimap to jump.
- **Decluttering**: the ▾ tab at the bottom-left tucks the build menu away for
  a bigger view (🔨 Build brings it back — a villager's *Build…* button reopens
  it too), and the ▾ button beside the minimap collapses the map to a small 🗺
  button.
- **The shell**: the game opens on a title screen over a live, self-playing
  world — Continue (newest cloud save, or a crash-recovery snapshot), New game
  (difficulty / map size / landform), Load, Settings, and a swipeable
  How-to-play. After New game comes the **Origin draft** (below); setup is
  fixed once a game starts. Win or lose, the end screen shows the run's
  arcade tally and offers the next game.
- **Gathering**: tap a villager, then tap a **forest** (wood), **hills** (stone), or
  **orchard / berry thicket** (food) tile — they gather automatically; the village
  forages long before it farms. Villagers can also **fish from the shore**:
  about a third of shore water is a *shoal*, and the tell is fish jumping
  there often — tap a villager, then the jumping fish, and they'll cast a
  line from the beach (same pace as berry-picking, and the shoal depletes
  like any tile). Tap water with no fish and you'll hear about it — watch
  the surface first. Tapping a resource tile
  with nothing selected sends an idle villager. Every tile holds a finite stock:
  once gathered out it turns to stumps / pebbles / spent soil, the villager goes
  idle, and you'll need farms, lumber camps, and quarries for steady income.
  Depleted tiles (and ruins) are open ground — build right on top of them and
  the old stumps/rubble vanish, leaving only the clean new building. Left
  alone, nature recovers: after ~60 days stumps regrow into forest, pebbles
  back into stony hills, and spent soil into fertile ground — at about half
  their original stock — so no resource is ever gone for good, even the
  scarce one; grinding it back is just slow, and cleared land stays cleared
  a good long while. Ruins simply fade to grass.
- **Building**: tap a button in the bottom bar, then tap a clear tile near your
  village — the nearest idle villager is sent to work the site. Or start from the
  villager: tap them, hit *Build…*, pick a building, tap a site, and that villager
  goes to build it.
- **Workers**: farms, hunter's lodges, lumber camps, and quarries only produce
  while a villager is **stationed** there — the builder stays on automatically
  when construction finishes, and you can re-staff any time (tap the building →
  *Station worker*, or tap a villager then the building). Pull the worker away
  and production stops. Lumber camps, quarries, and hunter's lodges take **up
  to 2 workers** and produce per worker — but each hand yields a bit less than
  a villager gathering straight from forest, hills, or wild orchards, so raw
  terrain is the better bet early and buildings win once tiles run dry.
- **Town Center level 2 unlocks** the Archery Range, Horse Stable, and Dock.
  The Lumber Camp and Quarry are available from the start, and they're
  deliberately cross-costed — the quarry never costs stone and the camp never
  costs wood — so a map starved of one resource always leaves a road back to it.
- **Gold**: the Town Center mints a little gold each day. Almost every building
  beyond houses and watchtowers costs some — and so does every soldier, from
  defenders to fire warships — so a standing army keeps draining the treasury.
  Budget it.
- **Repair**: damaged buildings can be repaired the same way — tap the building
  and hit *Repair* (or tap a villager, then the building). Repairs cost only a
  villager's working time.
- **Demolish**: tap a building → *Demolish* (tap twice to confirm) to reclaim 40%
  of everything spent on it — handy for moving your layout around. Destroyed or
  demolished buildings leave ruins you can build over. The Town Center can't be
  demolished.
- **Upgrades**: tap a building → *Upgrade*. Like construction, upgrades need a
  villager working the site. While a building is leveling up it's out of
  action: training yards (Town Center, Barracks, Stable, Range, Dock) pause
  their queues, and Watchtowers hold their fire (they also can't shoot while
  first being built). Levels 2–3 need a matching Town Center
  level and unlock bigger output or passive bonuses (level-3 Hunter's Lodge arms
  your villagers; level-3 Watchtower buffs nearby defenders; level-3 Barracks
  unlocks Elite Defenders).
- **Military**: every war building now unlocks a unit at **every level**, and
  each level-2 unit is a specialist with real trade-offs:
  - **Barracks**: defender → **Axeman** (L2: brutal attack, chops buildings
    1.6× harder — but unarmored; archers shred him) → Elite Defender (L3)
  - **Archery Range**: archer → **Longbowman** (L2: 5-tile reach, outranges
    level-1/2 watchtowers — but weak per shot, slow to reload, paper-thin up
    close) → Marksman (L3)
  - **Horse Stable**: rider → **Horse Archer** (L2: a bow at full gallop for
    hit-and-run — but light damage and fragile for the price) → Lancer (L3)
  - **Siege Workshop**: catapult → **Ballista** (L2: a bolt-thrower that
    deletes *units* at long range, the anti-army twin of the anti-building
    catapult — but crawls, costs plenty, and dies to anything that reaches
    it) → Siege Tower (L3)
  The **Town Center** trains
  villagers; houses raise the population cap — up to a hard ceiling set by
  your Town Center: 20 at level 1, 40 at level 2, 60 at level 3, so growing a
  big tribe means growing the town's heart first. Training queues grow with
  the building: 3 slots at level 1, 4 at level 2, 5 at level 3. Tap a soldier,
  then a tile to move or an enemy to attack.
- **The Siege Workshop** (needs Town Center level 3): engines of war for
  cracking a fortified town. The **Catapult** (workshop level 1) is slow and
  soft in a brawl but lobs boulders that crush walls, towers, and buildings —
  it even slightly outranges watchtowers. The **Siege Tower** (workshop level
  3) carries no weapon at all: roll it flush against an enemy wall and nearby
  soldiers climb up and over, **one per second**, dropping down inside with
  the wall still standing. It's armored against arrows — watchtowers and
  ordinary archers can't touch it; only **melee troops** (necessarily outside
  the wall with it) and the heavy **marksman** class can bring one down, so
  kill it before it docks or pay in blood inside.
- **The Dock** (needs Town Center level 2): built **on open water** — any lake or
  sea at least 6 tiles big with a walkable shore beside it. Water tiles hold a
  finite stock of fish (watch for the occasional fish jumping — that means
  there's still something to catch). The dock trains **Fishing Boats** that
  harvest fish for food, drifting to nearby stocked water when a tile runs dry.
  A level-2 dock unlocks the **Warship** — a sailed vessel whose archers hit
  enemies and buildings within a few tiles of the water — and level 3 unlocks
  the **Fire Warship**, tougher, longer-ranged, and shooting flaming arrows.
  The dock also builds **troop transports**: the Transport Raft carries **3
  soldiers**, and a level-3 dock's War Transport carries **5**. Select soldiers
  (or a war party) and tap the hull to board; select the transport and tap a
  shore tile to land them — that's how you cross water and take the fight to
  an island. The rival tribe runs the same playbook: expect its fishing boats
  on the water and warships guarding its coast once its town matures.
  Fishing is a touch slower than a farm, but fish don't need fertile ground —
  though when **food** is the valley's scarce resource, the waters run lean
  too (fish are food; a dock must not quietly cancel the scarcity). And
  beware: where open water touches the map's edge, the deep is not empty.
  **Once per game, per village**, a kraken may breach — early, mid, or late,
  you never know — and drag a fishing boat under. A lone warship nearby is
  outmatched and follows it down; two warships together can drive the beast
  back into the deep, though one will barely stay afloat. Landlocked lakes
  are safe forever.
  Ships never leave the water (and land units can't touch them) — and enemies
  know it: melee troops with no way to shoot back break off and retreat out of
  a warship's range instead of standing on the shore taking arrows; only
  archers will trade fire with your ships. A destroyed dock washes away to
  open water.
- **Shelter & muster**: the Town Center can *Shelter villagers* — everyone runs
  inside and vanishes from the map until you *Release all* after the threat
  passes. *Call idle* musters idle villagers outside the TC. And if the worst
  happens — every villager dead, none sheltered, none in training — two
  survivors step out of the Town Center the next day: a wiped workforce is a
  setback, never a stalemate.
- **Rally points**: every training building (Town Center, Barracks, Stable,
  Range) has *Set rally* — tap ground within 10 tiles and new units head there
  on completion. Rally the TC onto a forest/hills/fertile tile and fresh
  villagers start gathering immediately; rally the barracks at the front line
  to reinforce a war party.
- **Home turf**: units within 10 tiles of their own Town Center hit 10% harder,
  so equal fights near your walls tip to the defender (the rival gets the same
  bonus at home).
- **War parties**: tap a soldier → *Group nearby* to gather every soldier within
  6 tiles into one selection. One tap then marches them together — everyone
  converges tightly on the tapped tile by the shortest route (melee take the
  front spots, archers settle in behind) — or throws them all at an enemy unit
  or rival building. *Halt* stops everyone.
- **Enemy stacks**: when several hostiles pile onto one tile, a red ×N badge
  floats over the pile, and tapping one shows the stack's combined attack and
  hit points in the panel.
- **Walls & Gates**: pick Wall, then **drag** across the map — a ghost line follows
  your finger (green where buildable and affordable, red where not), snakes around
  corners, and connects automatically with the right straight/corner/T/cross pieces.
  Release to start construction (placement mode ends so stray taps are safe): one
  villager builds the line section by section, and you can tap more villagers onto
  the wall to speed it up. Level-1 walls are stick-and-grass palisades (wood);
  upgrading brings stone. Fortifications level up **village-wide**: the Town
  Center's *Upgrade all walls* button raises every wall **and gate** to the next
  level at once (it needs a matching TC level and the summed cost of every
  section — individual sections have no upgrade button). New walls and gates are
  then built straight at your current wall level. Walls block *all* movement —
  yours included — so add a
  **Town Gate**: tap any finished wall section → *Build Gate* to convert it in
  place (crediting the wall's salvage), or place one from the menu. Gates auto-fit
  the wall direction — north-south gates read as a thicker span flanked by twin
  towers. Your people pass through gates, enemies can't; attackers who can't find
  a way around batter the nearest wall or gate and pour through once it falls.
  Walls anchored on a lake, mountain, or the map edge brace flush against the
  obstacle — a stout, sealed junction — and those seams really are sealed:
  nothing can slip through the corner where a wall meets water, rock, or
  another wall diagonally, and raiding parties never materialize inside a
  fully walled-off area. Fortifications are genuinely tough now (and priced
  accordingly): a palisade falls to a couple of soldiers in about twenty
  seconds, a stone wall needs a real war party working at it, and dressed
  stone (level 3) is siege-engine territory — ten soldiers hammering for half
  a minute, or catapults. Towers follow the same curve, though the level-1
  watchtower stays cheap: it's your early-game shield.
- **Healing**: tap a hurt villager or defender → *Heal*. It costs food in
  proportion to their training cost and how badly they're hurt.
- **Saving**: five named cloud slots with minimap thumbnails (pause → *Save*),
  autosaved every 2 in-game days and on tab-hide, plus a local crash-recovery
  snapshot; Settings → *Download current game* still exports a JSON save file
  and the Load screen imports one. A recovery token (Settings) moves your
  cloud identity to another device. Maps are seeded — share a seed to share
  a map.

## Threats

- **Wild animals** — wolves and boars roam the forests and go after villagers,
  while harmless deer and wild cows graze the map. Very rarely a **bear** pads
  out of the deep woods — one at a time, far stronger than any wolf, worth
  triple meat to the tribe that brings it down. Any other wild animal killed by
  your tribe yields **+10 food** — tap a villager or defender, then the animal,
  to hunt it.
- **Barbarians** — wildling war bands in furs, bone, and teal war paint (their
  own colour, so they never read as the red rival tribe) arrive from map edges
  and camps — rarely on Calm, more often on Hard — in small bands meant to tip
  a fight, never to win the war for either side. Every band rolls a hidden
  temper when it appears: **10%** hunt you, **10%** march on the rival, and
  **80%** attack whomever they find first — and nothing tells you which; the
  only warning is that barbarians are on the move. Anyone-hating bands that
  arrive mid-battle wade in on their own account, so barbarians and rival
  raiders will happily fight each other at your gates. Raiders prioritize
  **soldiers first, villagers second, buildings third** — but **Town Centers
  are beyond them entirely**: a band that runs out of people to fight razes
  every other building, then trudges off the map for good in search of easier
  prey. Barbarians can therefore never win (or lose) the game for anyone —
  finishing a tribe off is always your job. Where open water touches the map edge,
  some bands arrive **by sea** like viking raiders — a longboat (a big war
  transport in later waves) makes for the beach nearest its prey and puts its
  warriors ashore; sink it before it lands if you can. Land-marching bands
  still muster in the open wilds, never on your shores or inside your walls.
- **The rival tribe** — an AI settlement across the valley builds, upgrades,
  trains, and will march on you when it feels strong enough. Every game its
  chief keeps an **Origin card** of its own (see below), and that card sets
  its whole temperament — your scouts whisper a hint at first light. The
  classic natures are all in the deck: the patient **Homesteader**, the
  spear-happy **Warlord**, the cavalry-mad **Horselord**, the fleet-building
  **Mariner**, the walled-in **Mason**, the fast-growing **Forager** — and
  fourteen more besides. Each shapes the whole tribe:
  the build order, an organic village layout (terrain-hunting farms and
  camps, watchtowers facing *you*), the army mix (riders, archers, or walls
  of spears), how early and often it raids, and how hard it takes to the
  water. Whatever the temperament, every chief raises a barracks and a couple
  of watchtowers early — basic protection isn't a personality trait. The Mason
  really does ring its town in palisades and gates; the
  Horselord really will run you down with lancers. Army size and elite share
  still scale with difficulty. And the chief thinks on its feet: it **saves
  up** for its next Town Center instead of dribbling the treasury into huts,
  **digs out of poverty** by building whatever income it's starved of (even
  off-script), **rebuilds** anything barbarians or you raze, **repairs** chip
  damage between fights, rings a **town alarm** that pulls its soldiers to
  wherever you strike (rushing emergency recruits if you catch it armyless),
  and **retreats** a mauled raid party to fight another day. Catch its hall
  undefended and its **townsfolk take up tools** — a handful of villagers
  will pile onto a lone attacker rather than watch their heart fall, so a
  one-soldier rush at an empty-looking town is no free win. Turtle too long
  and it grows bolder — after day 90 its bar to march drops steadily, so a
  stalemate always breaks. Scout early — knowing who you're up against
  changes everything.
- **Fog of war** — unexplored land is black; places you've visited but left turn
  grey and show only what you last saw there: buildings frozen at their old state,
  no units, no new construction, upgrades, or terrain changes until you scout again.

## Origin Cards

Every game opens with a draft: **you're dealt three Origin cards and keep
one** — the gift your people begin with. A card might be extra hands at the
hall, spearmen standing guard, a finished farm or dock, faster building,
richer hunts, a tamed guard-beast, or a seer who reads the raids before they
come. Magnitudes roll fresh each game, and the offer is dealt to fit the
start you rolled: it never just refills whatever your village happens to be
short of — but one card always **leans into** your situation, and reading
which one is worth points at the tally.

**Your rival drafts too.** How much you learn of their pick depends on the
difficulty: on 🌿 Calm you see their card and exactly what it gave them; on
⚔️ Moderate only its name; on 💀 Hard nothing at all — watch how they move,
or go and scout it.

## Win / lose

One way in, one way out: **destroy the rival tribe's Town Center to win; if
yours falls, you lose.** Nothing else ends the game.

## Whispers

Old sailors and older shepherds tell stories — of something vast beneath open
water, and of a shadow that crosses the sun when a battle is already lost.
Most games, nothing happens. Keep watch.

## Score & the global leaderboard

Every run is tallied like an arcade cabinet when it ends: kills, razed rival
buildings, buildings raised, fortifications, upgrades, units trained, your
greatest population, resources gathered, map explored, the kraken driven off,
a hard beginning overcome, an Origin chosen with a canny eye — plus a victory
bonus and a **swift-conquest bonus that drains as the days pass**. The subtotal is multiplied by difficulty: 🌿 Calm ×0.5, ⚔️ Moderate
×1.0, 💀 **Hard ×1.75** — the board is meant to belong to Hard players. An
average Moderate victory lands around 5,000–10,000.

Win, and your run goes to the **global top-10** (🏆 on the title screen)
**automatically** — the moment the tally lands, under the name saved to your
cloud profile. The only time you're asked to type anything is the very first
victory on a device, when there's no name on file yet: pick one (up to 7
characters, arcade-style, kept family-friendly — rude names are refused) and
hit Save, and every win after that posts on its own. Reopening a finished
victory re-posts it too, so a score is never lost. The board shows name,
score, and the difficulty it was earned on. Defeats show your tally too, but
only victories reach the board.

## Code layout

```
index.html            HUD chrome + the shell's screens, all styles
js/config.js          all stat tables (buildings ×3 levels, units, waves, win rules)
js/config.supabase.js Supabase project URL + anon key (placeholders = cloud off)
js/vendor/supabase.js vendored supabase-js v2 UMD (auth only, no CDN at runtime)
js/backend.js         the ONLY Supabase touchpoint: anonymous auth, 5 save slots,
                      autosave, crash net, recovery tokens (contract: BACKEND.md)
js/artstyle.js        the style system: palette, lighting, textures, tier language
js/sprites.js         procedural pixel-art sprite generation (terrain, buildings,
                      animated unit sheets, icons)
assets/manifest.js    which PNG atlases replace which sprites (spec: ASSET_SPEC.md)
js/assets.js          image-asset pipeline: atlas loader + per-key procedural fallback
js/map.js             seeded map generation (sizes + landforms) + BFS pathfinding
js/buildings.js       placement, construction, upgrades, training, production
js/units.js           villagers/defenders/animals/barbarians: movement & tasks
js/combat.js          target acquisition, melee/tower combat, barbarian waves
js/ai.js              rival civilization brain (persona profiles the cards lean on)
js/cards.js           Origin Cards: the 20-card draft, boons, placeholder card art
js/render.js          camera, cached terrain layer, fog of war, minimap
js/ui.js              touch input, build menu, selection panel, HUD
js/screens.js         the game shell: title / new game / origin draft / load /
                      settings / pause / endgame / how-to-play state machine
js/game.js            state, main loop, day ticks, win/loss, boot
supabase/migrations/  SQL schema + RLS policies for the cloud-save tables
```

State is one plain JSON-serializable object (`S`), which is what save files
contain. localStorage holds only the Supabase session, the emergency
crash-net snapshot, and small preferences — never the authoritative save.
