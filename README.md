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

- **Time**: each turn is one in-game day and auto-advances every 3 seconds.
  ⏸ pauses; ☰ opens the menu (save / load / new game / seed / event log).
- **Camera**: drag to pan, pinch (or mouse wheel) to zoom, tap the minimap to jump.
- **Gathering**: tap a villager, then tap a **forest** (wood), **hills** (stone), or
  **fertile soil** (food) tile — they gather automatically. Tapping a resource tile
  with nothing selected sends an idle villager.
- **Building**: tap a button in the bottom bar, then tap a clear tile near your
  village. Buildings finish after a few days, then produce every day.
- **Upgrades**: tap a building → *Upgrade*. Levels 2–3 need a matching Town Center
  level and unlock bigger output or passive bonuses (level-3 Hunter's Lodge arms
  your villagers; level-3 Watchtower buffs nearby defenders; level-3 Barracks
  unlocks Elite Defenders).
- **Town Center** trains villagers; **Barracks** trains defenders. Houses raise the
  population cap. Tap a defender, then a tile to move or an enemy to attack.
- **Saving**: ☰ → *Save game* downloads a JSON save; *Load game* imports it.
  Maps are seeded — share a seed to share a map.

## Threats

- **Wild animals** — wolves and boars roam the forests and go after villagers.
- **Raiders** — war parties arrive every 5–8 days from map edges and raider camps,
  growing bigger and tougher; they attack your nearest buildings. Watchtowers and
  defenders are your answer.
- **The rival tribe** — an AI settlement across the valley builds, upgrades, trains
  defenders, and will march on you if it out-scales your military. Scout it through
  the fog of war.

## Win / lose

Any one of these wins the game:

1. **Economic** — stockpile **3000 total resources** while holding **20 population**.
2. **Military** — destroy the rival tribe's Town Center.
3. **Survival** — reach **day 60** with your Town Center standing.

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
