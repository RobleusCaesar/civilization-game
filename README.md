# Neolithic — Browser Civ-Builder

A single-era, mobile-first civilization builder that runs entirely in the browser.
Vanilla HTML/CSS/JS + Canvas 2D — **no build step, no dependencies, no backend**.
All sprites are generated procedurally at load, so the whole game works offline
from a static file server.

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
- **The map**: pick 🏕 Small, 🏞 Medium, or 🗺 Large when starting a new game.
  Each map rolls a landform — green valleys, lake-dotted lakelands, rugged
  highlands with impassable mountain ridges, or island chains linked by
  causeways (mountains and water can't be crossed or built on, so terrain
  shapes your defenses). Starting corners vary each game, and every map is
  critically short on one resource (wood, stone, or food) — even on Large the
  scarce resource stays a single small pocket, so scouting and holding it
  remains the strategic heart of the match.
- **Time**: each turn is one in-game day and auto-advances every 10 seconds;
  a full playthrough runs about 20 minutes.
  ⏸ pauses; ☰ opens the menu (save / load / new game / seed / event log).
- **Camera**: drag to pan, pinch (or mouse wheel) to zoom, tap the minimap to jump.
- **Decluttering**: the ▾ tab on the build menu tucks it away for a bigger view
  (🔨 Build brings it back — a villager's *Build…* button reopens it too), and
  the ▾ tab over the minimap collapses the map to a small 🗺 button.
- **Gathering**: tap a villager, then tap a **forest** (wood), **hills** (stone), or
  **fertile soil** (food) tile — they gather automatically. Tapping a resource tile
  with nothing selected sends an idle villager. Every tile holds a finite stock:
  once gathered out it turns to stumps / pebbles / spent soil, the villager goes
  idle, and you'll need farms, lumber camps, and quarries for steady income.
  Depleted tiles (and ruins) are open ground — build right on top of them and
  the old stumps/rubble vanish, leaving only the clean new building. Left
  alone, stumps, pebbles, spent soil, and ruins green back over into grass
  after 20 days.
- **Building**: tap a button in the bottom bar, then tap a clear tile near your
  village — the nearest idle villager is sent to work the site. Or start from the
  villager: tap them, hit *Build…*, pick a building, tap a site, and that villager
  goes to build it.
- **Workers**: farms, hunter's lodges, lumber camps, and quarries only produce
  while a villager is **stationed** there — the builder stays on automatically
  when construction finishes, and you can re-staff any time (tap the building →
  *Station worker*, or tap a villager then the building). Pull the worker away
  and production stops.
- **Gold**: the Town Center mints a little gold each day, and almost everything
  beyond houses and watchtowers costs some — budget it.
- **Repair**: damaged buildings can be repaired the same way — tap the building
  and hit *Repair* (or tap a villager, then the building). Repairs cost only a
  villager's working time.
- **Demolish**: tap a building → *Demolish* (tap twice to confirm) to reclaim 40%
  of everything spent on it — handy for moving your layout around. Destroyed or
  demolished buildings leave ruins you can build over. The Town Center can't be
  demolished.
- **Upgrades**: tap a building → *Upgrade*. Like construction, upgrades need a
  villager working the site. Levels 2–3 need a matching Town Center
  level and unlock bigger output or passive bonuses (level-3 Hunter's Lodge arms
  your villagers; level-3 Watchtower buffs nearby defenders; level-3 Barracks
  unlocks Elite Defenders).
- **Military**: the **Barracks** trains defenders (level 3: elites), the **Horse
  Stable** trains fast riders (level 3: lancers), and the **Archery Range** trains
  archers who shoot from a distance (level 3: marksmen). The **Town Center** trains
  villagers; houses raise the population cap. Tap a soldier, then a tile to move or
  an enemy to attack.
- **Shelter & muster**: the Town Center can *Shelter villagers* — everyone runs
  inside and vanishes from the map until you *Release all* after the threat
  passes. *Call idle* musters idle villagers outside the TC.
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
- **Healing**: tap a hurt villager or defender → *Heal*. It costs food in
  proportion to their training cost and how badly they're hurt.
- **Saving**: ☰ → *Save game* downloads a JSON save; *Load game* imports it.
  Maps are seeded — share a seed to share a map.

## Threats

- **Wild animals** — wolves and boars roam the forests and go after villagers,
  while harmless deer and wild cows graze the map. Any wild animal killed by
  your tribe yields **+10 food** — tap a villager or defender, then the animal,
  to hunt it.
- **Raiders** — war parties arrive from map edges and camps — rarely on Calm, regularly on Hard —
  growing bigger and tougher; they attack your nearest buildings. Watchtowers and
  defenders are your answer.
- **The rival tribe** — an AI settlement across the valley builds, upgrades, trains
  defenders, and will march on you if it out-scales your military. Scout it through
  the fog of war.
- **Fog of war** — unexplored land is black; places you've visited but left turn
  grey and show only what you last saw there: buildings frozen at their old state,
  no units, no new construction, upgrades, or terrain changes until you scout again.

## Win / lose

One way in, one way out: **destroy the rival tribe's Town Center to win; if
yours falls, you lose.** Nothing else ends the game.

## Code layout

```
index.html          shell, UI chrome, styles
js/config.js        all stat tables (buildings ×3 levels, units, waves, win rules)
js/sprites.js       procedural pixel-art sprite generation (terrain, 24 building
                    sprites, animated unit sheets, icons)
js/map.js           seeded map generation (sizes + landforms) + BFS pathfinding
js/buildings.js     placement, construction, upgrades, training, production
js/units.js         villagers/defenders/animals/raiders: movement & tasks
js/combat.js        target acquisition, melee/tower combat, raider waves
js/ai.js            rival civilization brain
js/render.js        camera, cached terrain layer, fog of war, minimap
js/ui.js            touch input, build menu, selection panel, save/load
js/game.js          state, main loop, day ticks, win/loss
```

State is one plain JSON-serializable object (`S`), which is what save files
contain. No localStorage is used.
