# Clanfire — Developer Handoff

Everything you need to pick this project up cold (e.g. in Claude Code on a laptop).
Last updated after Phase 3 (cloud saves + game shell + asset pipeline). The game
is fully shipped and live; there is **no uncommitted work**.

- **Live game:** https://robleuscaesar.github.io/civilization-game/
- **Repo:** `RobleusCaesar/civilization-game`, default branch `main`
- **Deploy:** every push to `main` runs `.github/workflows/pages.yml`
  (checkout → configure-pages → upload-pages-artifact `path: .` → deploy-pages)

## What this is

A single-era, mobile-first civ-builder in **vanilla HTML/CSS/JS + Canvas 2D**.
Hard constraints that have shaped everything:

- **No build step, no bundler.** Classic `<script>` tags with globals; the
  vendored supabase-js UMD is the only third-party file (no CDN at runtime).
- **One optional backend, one touchpoint.** Supabase (anonymous auth + RLS)
  powers five cloud save slots, autosave, and recovery tokens — all through
  `js/backend.js` and nothing else (contract in `BACKEND.md`). With
  placeholder credentials in `js/config.supabase.js` the game runs fully
  offline with file export/import. localStorage holds only the Supabase
  session, the crash-net snapshot, and small prefs — never the real save.
- Optimized for portrait phones (390×844, mobile Safari); mouse works too.
- All art is generated procedurally at load in `js/sprites.js`; PNG atlases
  can replace any sprite per key via `assets/manifest.js` + `js/assets.js`
  with automatic procedural fallback (`ASSET_SPEC.md`).
- **Visual layer is governed by `js/artstyle.js` + `ARTSTYLE.md` (binding).**
  Master palette ramps, top-left light, build-time outlines, drop shadows,
  material textures, `tierDress(level)` progression, `Sprites.buildingA` red
  faction set, animated overlays (water sparkle/foam, hearth smoke, ambient
  butterflies/birds, ~12-day dusk cycle) — all viewport-bounded, ~0.1ms/frame.
  No sprite may be added without complying with ARTSTYLE.md.

## Architecture

Script load order matters (globals, no modules):
`config.js → config.supabase.js → vendor/supabase.js → backend.js → score.js
→ cards.js → artstyle.js → sprites.js → assets/manifest.js → assets.js →
map.js → buildings.js → units.js → combat.js → ai.js → render.js → ui.js →
screens.js → game.js`

| File | Owns |
|---|---|
| `js/config.js` | Every stat table: `T` terrain enum, `CFG` (buildings ×3 levels, units, waves, modes, costs) |
| `js/sprites.js` | Procedural pixel art: terrain variants, buildings, wall/gate auto-tile atlases, animated unit sheets, boats, icons |
| `js/map.js` | `MapGen` (seeded generation, landforms) + `Path` (BFS pathfinding, passability, reach floods) |
| `js/buildings.js` | `Bld`: placement, construction, upgrades, training queues, production, demolish/ruins, wall block-grid |
| `js/units.js` | `Units`: spawning, movement, tasks (gather/fish/build/work/garrison/flee), group moves, wildlife |
| `js/combat.js` | `Combat`: target acquisition, chase/attack, towers, barbarian wave spawning |
| `js/ai.js` | `AI`: the rival tribe — builds, upgrades, trains, raids when ahead |
| `js/render.js` | `R`: camera, cached terrain layer, three-state fog, minimap, unit/building draw, badges, fish jumps |
| `js/ui.js` | `UI`: touch input, build menu, selection panel (signature-based refresh), HUD buttons |
| `js/screens.js` | `Screens`: the shell state machine — title (live demo world), new game, load/save slots, settings, pause, endgame, how-to |
| `js/backend.js` | `Backend`: the only Supabase touchpoint — anonymous auth, slots, autosave, crash net, recovery tokens, leaderboard reads/inserts; typed `{ok, data/error}` results, mockable via `window.__NEO_BACKEND_MOCK` |
| `js/score.js` | `Score`: the arcade tally (`CFG.SCORE` table) + arcade-name validation/profanity filter |
| `js/cards.js` | `Cards`: ORIGIN CARDS — the 20-card draft (player + rival), offer filters, boon application, engine-hook modifiers (`S.boons`), placeholder motif painter |
| `js/assets.js` | `Assets`: manifest-driven PNG atlases overlaid onto the Sprites tables, per-key procedural fallback, `drawSprite()` |
| `js/game.js` | `G` + global `var S`: state, main loop, day ticks, decay, visibility, save/load, boot |

### State model — the one rule that matters

`S` is a **single plain JSON-serializable object**; `G.saveJSON()` is just
`JSON.stringify(S)`. Never put class instances, functions, `Date`s, or typed
arrays into `S`. Transient caches live *outside* `S` and must be invalidated on
`newGame`/`loadJSON`:

- `Bld._block` — Uint8Array wall/gate blocking grid (0 open, 1 wall, 2 P-gate, 3 A-gate); set to `null` whenever fortifications change.
- `G.vis` — current-visibility Uint8Array, recomputed every 0.35 s.
- `R.terrainCache` — offscreen canvas of the whole map, rebuilt in `R.onNewGame()`.

**Save compatibility:** `loadJSON` backfills every field older saves lack
(`resAmount`, `garrison`, `seenTerrain`, `seenB`, `decay`, `wallLevel`,
`sizeKey`, `fishStocked`, map `W`/`H` defaulting to 40). Keep doing this for
any new field. `CFG.W`/`CFG.H` are **mutable** and must be set from the save
*before* validating array lengths.

### Key systems and their invariants

- **Map sizes & landforms:** `CFG.SIZES` {small 30, medium 40, large 52}, set in
  `G.newGame(seed, modeKey, sizeKey)`. `MapGen.generate` rolls a landform:
  valley / lakeland / highlands (impassable `T.MOUNTAIN` ridges) / islands
  (causeway-linked). A BFS safeguard carves a causeway if player↔AI aren't
  connected. Resource density scales with area (`f = W*H/1600`) but the **scarce
  resource is always exactly one half-size pocket** regardless of size.
- **Fog of war (3 states):** black = unexplored, grey = explored-but-not-visible
  (renders `S.map.seenTerrain` + `S.map.seenB` ghosts frozen at last sight),
  clear = currently visible. `G.updateVisibility()` syncs the memory for visible
  tiles. `R.updateTile` is a no-op for tiles the player can't currently see —
  hidden changes stay hidden until re-scouted. **If you mutate terrain in tests,
  call `G.updateVisibility()` (or sync `seenTerrain` + redraw) or the display
  won't change.**
- **Walls & gates:** drag-to-build with orthogonal Bresenham; auto-tiling via 16
  neighbor masks (`R.wallMaskAt`), which also count water/mountain/map-edge as
  connections so anchored walls draw flush ("stout") junctions. Village-wide
  level `S.wallLevel` (1–3): upgraded only from the TC (`Bld.upgradeWalls()`),
  needs TC level ≥ wallLevel+1, costs the summed per-section price; new
  walls/gates build at the current level (`Bld.buildSpec`). L1 is a
  stick-and-grass palisade, L2 stone, L3 dressed stone. Vertical gates render as
  thick wall + twin towers (no visible door).
- **Movement domains:** `Path.passable(x, y, owner, domain)` — `'land'`
  (default; water+mountain block, walls block, own gates open) vs `'water'`
  (T.WATER only). `Path.find` and `Path.canStep` take the domain;
  `Units.domain(u)` derives it from `CFG.UNITS[kind].naval`. **`Path.canStep`
  exists because close-range chase steering once slipped through the corner
  where a wall meets water diagonally** — any new continuous movement code must
  use it, not just check the destination tile.
- **Hostile spawning (fairness rules):** barbarian waves must spawn (a) in the
  "open wilderness network" — `Path.borderReach()`, or `Path.reachFrom(camps ∪
  AI town)` on all-water-border island maps (this also keeps them out of sealed
  wall rings) — and (b) ≥ 10 tiles from every player building. Wild animals:
  ≥ 8 from TC + network check. The rival tribe trains units at its own
  buildings via the same code as the player.
- **Resources:** finite per-tile stock (`S.map.resAmount`); depleted tiles turn
  to stumps/pebbles/spent soil, ruins come from destroyed buildings. After
  `CFG.RUIN_DECAY_DAYS` (20) via `S.map.decay`, depleted tiles **regrow into
  their source terrain at `REGROW_FRACTION` (50%) stock** (scarce keeps its
  0.6 lean) so no resource can permanently zero out; ruins fade to grass.
  Building on top cancels the timer. The scarce pocket is generated as exactly
  6-8 tiles (single-tile growth, immune to mountain/lake blob-eating) and
  normal resources have a 12-tile floor. Water tiles hold fish — see Dock.
- **Dock & navy:** Dock requires TC L2, is placed *on* water
  (body ≥ `CFG.DOCK_MIN_WATER` = 6 tiles, walkable shore orthogonally adjacent
  for builders — `Bld.dockSiteOk(x,y,owner)` is owner-aware), 3 levels. Trains
  `fishboat` (L1), `transport` (L1, carries 3), `warship` (L2, rng 4),
  `bigtransport` (L3, carries 5), `fireship` (L3, rng 4.5, `fire: true`).
  Fishing = task `{type:'fish'}`, credits `S.res` or `S.ai.res` by owner,
  auto-drifts ≤ 4 tiles to the next stocked tile, else idles. Naval units spawn
  onto water beside the dock, are excluded from land war-party grouping, count
  toward pop. Destroyed docks revert to water (no ruin).
- **Troop transports:** `u.cargo` = array of whole unit objects (spliced out of
  `S.units`, JSON-serializable, counted by `popUsed`). Board: soldier task
  `{type:'board', id}` walks to shore within 1.6 of the hull, then rides;
  `Units.orderBoard` refuses past capacity (counting boarders en route).
  Land: `Units.orderUnload(tr, x, y)` water-paths toward the shore tile
  (best-effort BFS stops at the nearest water), then `Units.disembark` beaches
  everyone on adjacent passable land. UI: select soldiers/war party → tap hull
  to board; select hull → tap shore to land, panel has ⚓ Unload; cargo pips
  render over the hull. A sunk transport drowns its cargo.
- **AI navy:** in `AI.daily` — dock placed near the rival TC once it hits L2
  (needs affordable cost + valid site), keeps ~2 fishboats (auto-assigned to
  fish on spawn in `Bld.update`) and up to `aiArmyCap/4` warships/fireships.
- **Barbarians (ex-"raiders"):** owner `'R'`, keys still `raider`/`brute` (save
  compat) but named Barbarian / Barbarian Brute, **teal** identity
  (`#3fb094` war paint, teal minimap dots) vs the red rival tribe. Each band
  rolls `u.hostileTo` on spawn — **10% 'P', 10% 'A', 80% 'ALL'** — and the roll
  is deliberately never surfaced (neutral wave log, neutral panel hint).
  `Combat.hostileUnits(u,o)` / `hostileToBld(b,o)` are the unit-level hostility
  checks (guards/towers only engage bands that threaten their tribe; barbs
  retaliate when struck). `raiderSeek` targets **soldiers first (barbarian
  warriors count as soldiers to their enemies), villagers second, buildings
  third** — so 'ALL' bands and rival raid parties brawl at the player's gates.
  Per-mode strength `barbMult` (calm 0.9 / moderate 1.0 / hard 1.2), waves
  scale `(1 + count*0.07) * barbMult`, party size `1 + ceil(count*0.5) +
  waveSizeAdd` (cap 6), gaps 14–20 days × `waveGapMult`. **Sea raids:** 35% of
  waves where water touches the map edge spawn a barbarian transport there
  (wave ≥ 5 uses `bigtransport`), route via water-domain path toward the target
  town, beach on the nearest open shore (never inside sealed walls — landing
  tile must be in the wilderness network), raiders disembark, empty hull is
  removed.
- **Combat conventions:** damage = `max(1, atk − def)`; home-turf +10 % attack
  within 10 tiles of your own TC (both tribes); tower L3 aura +2; melee front /
  archers behind on group moves (flood-fill goals from the tapped tile —
  **never** compute formation slots geometrically, that's what caused units to
  wander around lakes). Enemy stacks on one tile get a red ×N badge and a
  combined-strength line in the panel.
- **Win/lose:** destroying a Town Center is the **only** end condition, ever.
- **UI conventions:** panel rebuilds only when `UI.panelSig()` changes (rebuild
  swallows taps otherwise); build menu and minimap have collapse toggles
  (bottom-left tab / button beside the map); the ☰ menu shows read-only current
  setup and folds New game / How to play / Event log into `<details>` sections.

## Balance snapshot (moderate)

Day = 10 s (`DAY_MS`), ~20-minute games. Start: 200 food, 150 wood, 60 stone,
15 gold, 3 villagers. Defender 60 hp/8 atk; barbarian 50/7; boar 48/6; wolf
24/4; brute 95/12 ≈ elite-lite; warship 95/9 rng 4; fireship 140/14 rng 4.5.
Gold on everything except houses/towers. Farms/lodges/lumber/quarries need a
**stationed** villager; construction/upgrades/repair need a villager builder.
Demolish refunds 40 % (TC can't be demolished; wall/gate refund current level
only). Heal costs food ∝ missing hp (`HEAL_FOOD`).

## Development workflow

### Testing (the established pattern)

No test framework — headless Playwright scripts drive the real page and poke
the globals. Historically these lived in the session scratchpad (not the repo);
you may want to commit a `tests/` directory going forward. Skeleton:

```js
const { chromium } = require('playwright');   // remote env used an absolute path
const browser = await chromium.launch();       // + executablePath if needed
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errors.push(e.message));   // ALWAYS collect these
await page.goto('file:///…/civilization-game/index.html');
await page.waitForTimeout(800);                // sprites build at load
const r = await page.evaluate(() => {
  G.newGame('seed', 'calm', 'medium'); S.paused = true;
  /* poke Bld/Units/Combat directly; step time with
     Units.update(0.02); Combat.update(0.02); Bld.update(days); G.dayTick(); */
  return { … };                                // JSON-serializable only
});
```

Hard-won pitfalls (each cost a debugging session):

1. **Set `R.cam.z` BEFORE `R.centerOn(...)`** — centerOn uses the current zoom;
   changing zoom afterwards shifts the view (camera is top-left anchored).
2. Real-pointer taps must land inside the 390×844 viewport — `R.centerOn` the
   target first; screen = `(worldTile+0.5)*CFG.TILE − cam) * cam.z`. Off-screen
   taps fail silently.
3. Terrain painted in tests isn't visible until `G.updateVisibility()` runs
   (terrain cache + seenTerrain), and `Bld._block = null` after fake walls.
4. Corner spawns + `clampCam` can push your staging area off-screen — stage
   test scenes mid-map, away from both TCs (and check `CFG.W` before writing
   near `tc.x + 8`).
5. Python bulk edits: replace whole unique lines, `assert count == 1`,
   all-or-nothing — chained `.replace` collisions once swapped two levels'
   costs silently.
6. Known stale test: `smoke9`'s "AI upgrade" check expects level 2, gets 1 —
   pre-existing since upgrades started needing villager builders; harmless.
7. `smoke12b`'s `allTargeting` assertion is flaky (target dies mid-sample) —
   also pre-existing.
8. Since the shell landed, boot creates a **self-playing demo world** and lands
   on the title screen. `G.newGame(...)` inside `evaluate` still works for
   gameplay tests (it resets the demo's free-vision fog itself), but UI-level
   tests should drive `Screens` and real clicks. Mock the backend by setting
   `window.__NEO_BACKEND_MOCK = { auth, rest }` in an `addInitScript` BEFORE
   `goto` — never let a test reach the network.
9. Since ORIGIN CARDS, the New-game button lands on the **draft screen**, not
   `playing` — UI tests must wait for `Screens.current === 'draft'`, hide
   `#draftOverlay`, wait for three `.ocard.flip`, double-click a card, then
   click `#btnDraftGo`. Direct `G.newGame(...)` calls leave `S.draft` pending
   (fine for AI/engine tests — no player card is applied); call
   `Cards.pick(i)` when the test needs the player's boon.

### Deploying

Push to `main` → Pages workflow. **`actions/deploy-pages` fails transiently**
("Deployment failed, try again later") maybe 1 run in 5 — the tell is checkout/
upload green, only the deploy step red after ~6 s. The workflow now self-heals:
three in-run deploy retries with pauses, and artifact names unique per
run/attempt (a bare "Re-run all jobs" used to die on duplicate `github-pages`
artifacts). If all three retries fail, re-trigger via `workflow_dispatch` on
`pages.yml`, ref `main`. One-time setup already done: repo public, Pages
source = GitHub Actions.

Commit style used throughout: imperative summary + wrapped body explaining
what/why.

### Conventions

- **VARIABLE OPENINGS (two systems, both weighted tendencies in bounds —
  never fixed rules, never unwinnable):**
  (1) *Player start package* — `G.rollStart` (bands in `CFG.OPENING`):
  villagers 3-5/2-4/1-3 by calm/moderate/hard weighted to the middle;
  food/wood/stone/gold each roll a band with one axis rich and one lean
  (anti-correlated); the package leans AGAINST the map (+90 of the scarce
  resource, +45 food on dry spawns); rare extras (~10% each, almost never
  two): spearman, scout rider, standing workplace, rich cache tile. Clamps:
  scarce pocket must be walkable from spawn (else the package carries +60),
  and effective economy ≥ `minEcon` (nudge villagers, then food). The roll
  surfaces as the one-line "village origin" note (`S.origin`), lean starts
  score `stats.originBonus` (≤300), and `window.DEBUG_OPENINGS = true`
  console-logs every roll (`S.opening` holds it either way). Spawn
  surroundings also roll (seedNear counts in map.js).
  (2) *Rival openings* — the rival rolls its own package too
  (`G.rollStart(gen, mode, gen.spawns.ai)` → `S.ai.res` + cosmetic
  townsfolk), and its persona, opening bias and starting boon all come from
  its ORIGIN CARD (below). Biases (scout/raid/boom/sea/turtle/spread) lean
  the first ~13-20 days; the scout whisper carries the card's behavior
  hint. Protection floor with teeth: past day 16 a barracks outranks the
  TC savings reserve (wood-tight tribes used to save forever and field no
  army).
- **ORIGIN CARDS (`js/cards.js` — one draft, both tribes):** at game start
  each side is dealt 3 cards from a 20-card pool and keeps 1. A card is a
  clean single-sided boon whose magnitude ROLLS from a band every game
  (`Cards.DEFS[key].roll()`, seeded); the rival's kept card also sets its
  persona (`lean` → `AI.PERSONAS`) and early bias — **the card IS the
  persona now** (`S.ai.opening = {bias, fired: true, until, card}`).
  The 20 frameworks (axis → no-cancel axis; all values roll in bands):
  Homesteader (+1-2 villagers, crew), Warlord (+2-3 defenders), Horselord
  (scout + vision 10-13), Mariner (dock + boat, water), Mason (+25-45 stone,
  forts 18-28% off), Forager (mixed stores + gather ×1.10-1.18 early),
  Timberwright (+30-60 wood + wood pace ×1.2-1.3 early, wood), Grainkeeper
  (prebuilt farm, food), Stoneheart (prebuilt quarry or +50-80 stone,
  stone), Tradewind (+30-50 gold + 3-4/day early, gold), Houndmaster (tame
  guard-bear), Pathfinder (wide reveal + far patches), Firekeeper (build
  20-30% faster early), Beastward (wildlife truce + hunts ×1.8-2.2 early),
  Refugee Host (+2-3 villagers, small food tithe, crew), Riverborn (fishing
  ×1.35-1.6 persistent, water), Seer (wave forewarnings + vision node),
  Ironhand (soldiers 10-18% cheaper, 8-15% tougher), Harvest Lord (farms
  +20-35% persistent, food), Nomad (first 3-5 buildings ~half cost & fast).
  **The coordination rule (binding):** each side's offer is built from ITS
  rolled start — a card whose `axis` matches the roll's rich OR poor axis
  is excluded (no-cancel: cards never flatten System 1's variance);
  axis-less transformative cards weigh more; at least one offered card is a
  *lean-in* (its `syn` lists the roll's rich axis — kept lean-ins score
  `CFG.SCORE.leanIn` via `stats.leanIn`); water/island/scarce-terrain gates
  apply; and rolled econ + worst-case card delta must clear
  `CFG.OPENING.minEcon`. **Difficulty intel (`S.draft.intel`):** Calm =
  rival card name + rolled benefit, Moderate = name only, Hard = nothing
  (the whispers are the only early read). The rival picks from its 3 by a
  rolled temperament (aggro/econ/def/explore ×2.4 weight on matching `cat`).
  Boon modifiers live in plain-data `S.boons.{P,A}` read by one-line hooks
  (build cost/time, train cost/hp, gather/fish/hunt pace, farm yield, gold
  trickle, wildlife truce, seer). Draft state is `S.draft` (hand rolls,
  rival hand/pick, intel, done/pickI); `Cards.pick(i)` applies the player's
  card (the draft screen, the title demo, and loadJSON's mid-draft backfill
  all call it). THE RULE: a new rival temperament = a new CARD with a
  `lean` (plus a persona profile if none fits) — no new wiring. Balance:
  keep every card's `val(roll)` proxy inside roughly a 2× band (smoke46
  sweeps it) so no card is an auto-pick. Real card art lands via manifest
  keys `ui/card/<key>` (ASSET_SPEC.md) — placeholder motifs are procedural
  (`Cards.drawMotif`).
- **SPECIAL EVENTS (a design category):** rare, once-per-game spectacles
  meant to make a player laugh out loud — currently the kraken (S.kraken,
  G.krakenTick) and the black dragon (S.dragon, G.maybeDragon/dragonTick;
  Moderate/Hard, ~1 game in 3.5, fires only when an enemy army masses at the
  player's gates with the odds stacked). New events follow the same shape:
  availability rolled at newGame, plain-data event state in S, a tick
  function, a G.log narration, a score line. Do not spoil them in README.
- **THE SCORING RULE (binding):** every new gameplay feature must feed the
  arcade score — either through an existing `S.stats` counter or a new one
  (add it to `newGame`'s stats init, `loadJSON`'s backfill list, a line in
  `Score.compute`, and a constant in `CFG.SCORE`). No silent features.
- Match the existing code style: 2-space indent, single quotes, comments only
  for non-obvious *why*, small flat objects, no classes.
- Every user-visible change gets: implementation → headless test → (visual
  check via screenshot if art/UI) → README update → commit → push → verify the
  Pages run is green.
- README.md is the player-facing manual and has been kept current — update it
  with any gameplay change.

## Product history (why things are the way they are)

The owner iterated ~24 requests to get here; standing decisions **not** to
regress: TC-destruction as sole win/lose; slow early game (first raids day
20–60 by mode, wildlife grace period); villagers do all construction/repair;
war parties converge exactly where tapped; walls deselect after drag; barbarian
identity distinct from the red rival; hostiles never materialize on shores,
inside walls, or near player buildings; menu stays compact with setup fixed
mid-game.

## Backlog ideas (discussed or natural next steps — NOT committed to)

- Destructible barbarian camps ("raze the camp to stop that spawn point") —
  explicitly floated to the owner as an option, no answer yet.
- Fish never regrow (deliberate for now); land regrows to source terrain at
  half stock after a long fallow.
- Real PNG art: the pipeline is live (`ASSET_SPEC.md`) but only the
  placeholder TC atlas ships — every other sprite is still procedural.
- Supabase credentials: `js/config.supabase.js` still holds placeholders;
  filling them (plus running `supabase/migrations/0001_init.sql` and enabling
  anonymous sign-ins) turns cloud saves on with no other changes.
- Warship pathing to distant coastal targets is best-effort BFS — fine on
  lakes, untested on huge island maps.

## Quick start on a laptop

```sh
git clone https://github.com/RobleusCaesar/civilization-game.git
cd civilization-game
python3 -m http.server        # or just open index.html — file:// works
npm i -D playwright && npx playwright install chromium   # for headless tests
for f in js/*.js; do node --check $f; done               # fast sanity
```
