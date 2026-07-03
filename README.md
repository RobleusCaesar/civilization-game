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
  (☰ menu). Calm is nearly peaceful — the occasional wild animal, with only a
  couple of small raids late; Hard gathers ~15% slower with earlier, bigger,
  more frequent raids and bolder wildlife.
- **Time**: each turn is one in-game day and auto-advances every 10 seconds;
  a full playthrough runs about 20 minutes.
  ⏸ pauses; ☰ opens the menu (save / load / new game / seed / event log).
- **Camera**: drag to pan, pinch (or mouse wheel) to zoom, tap the minimap to jump.
- **Gathering**: tap a villager, then tap a **forest** (wood), **hills** (stone), or
  **fertile soil** (food) tile — they gather automatically. Tapping a resource tile
  with nothing selected sends an idle villager.
- **Building**: tap a button in the bottom bar, then tap a clear tile near your
  village — the nearest idle villager is sent to work the site. Or start from the
  villager: tap them, hit *Build…*, pick a building, tap a site, and that villager
  goes to build it. Once done they're free again, and the building produces every
  day.
- **Repair**: damaged buildings can be repaired the same way — tap the building
  and hit *Repair* (or tap a villager, then the building). Repairs cost only a
  villager's working time.
- **Upgrades**: tap a building → *Upgrade*. Like construction, upgrades need a
  villager working the site. Levels 2–3 need a matching Town Center
  level and unlock bigger output or passive bonuses (level-3 Hunter's Lodge arms
  your villagers; level-3 Watchtower buffs nearby defenders; level-3 Barracks
  unlocks Elite Defenders).
- **Town Center** trains villagers; **Barracks** trains defenders. Houses raise the
  population cap. Tap a defender, then a tile to move or an enemy to attack.
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

## Win / lose

Any one of these wins the game:

1. **Economic** — stockpile **4000 total resources** while holding **20 population**.
2. **Military** — destroy the rival tribe's Town Center.
3. **Survival** — reach **day 120** (~20 minutes) with your Town Center standing.

You lose if your Town Center is destroyed — or if the rival tribe hits the
economic target first.

## Code layout

```
index.html          shell, UI chrome, styles
js/config.js        all stat tables (buildings ×3 levels, units, waves, win rules)
js/sprites.js       procedural pixel-art sprite generation (terrain, 24 building
                    sprites, animated unit sheets, icons)
js/map.js           seeded 40×40 map generation + BFS pathfinding
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
