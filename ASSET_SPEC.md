# ASSET_SPEC.md — Clanfire complete asset manifest & spec sheet

The exhaustive list of **every drawable asset** the game needs, so external art
can be produced and dropped in through the existing manifest pipeline
(`assets/manifest.js` → `js/assets.js`). Every key below is a **real key from
the current build** (enumerated from the live `Sprites.*` tables, `CFG`,
`Cards.DEFS`) — nothing invented, nothing omitted.

The game ships fully playable with **zero image files**: every sprite is drawn
procedurally at boot by `js/sprites.js` + `js/artstyle.js`. A manifest image
**overlays** the matching `Sprites` slot per key; any key without an image keeps
its procedural drawable. So you can supply art incrementally, in any order.

> **Conventions used in the tables**
> **Source px** = the master/atlas slot size the manifest slices to.
> **Render px** = on-screen size at camera zoom 1.0 (1 tile = `CFG.TILE` = 32
> CSS px). Mobile runs at `devicePixelRatio` ≥ 2 and pinch-zoom > 1, so
> everything is commonly upscaled 2–4× on screen — which is exactly why the
> higher source resolutions below pay off.
> **Frames** = animation frames per state (author each as a separate slot key).

---

## 1. Resolution strategy (target: significantly higher fidelity than today)

Today's procedural art is a 16-logical-grid at 2 px/cell. Buildings were
recently doubled to a 64 px master; units/terrain/icons are still 32/16 px.
Because the manifest can **supersample a 4× master down to the slot** at decode
(`dw`/`dh` on the rect, high-quality resize), **author every master at 4× the
slot** and let the pipeline downscale. Per category:

| Category | Author master (4×) | Recommended slot (source px) | Render px @ zoom 1 | Down-ratio | Change needed to raise slot? |
|---|---|---|---|---|---|
| **Building 1×1** | 512×512 | **128×128** (up from 64) | 32 | 4:1 | **None** — buildings draw scaled to footprint (`drawImage(spr,bx,by,bw,bw)`). Bigger source just renders crisper. |
| **Building 2×2 (TC)** | 1024×1024 | **256×256** (up from 64) | 64 | 4:1 | None (same). Current TC L1 master is already 256→64; bump the slot to 256. |
| **Construction 1×1 / 2×2** | 512 / 1024 | **128 / 256** | 32 / 64 | 4:1 | None (drawn at footprint). |
| **Unit (all land+naval)** | 128×128 | **32×32** (supersample down) | 32 | 4:1 | **Flag:** units blit at *natural* size (`drawImage(spr,ux,uy)`, no w/h). A 4× master supersampled to 32 is crisper at the same size with **no code change**. To make units physically *bigger* on screen (e.g. 48–64 px slot) needs a small render change (add w/h + re-anchor) — see §9. |
| **Terrain tile** | 128×128 | **32×32** (supersample down) | 32 | 4:1 | **Flag:** tiles bake into a fixed `CFG.W×32` cache at newGame; source > 32 downsamples to 32 in the bake, so crisper-but-not-larger. True hi-res terrain needs a retina terrain cache (render change) — see §9. |
| **UI icon** | 256×256 | **64×64** (up from 16) | 15–44 | 1–4:1 | None — icons are scaled into their canvas (`UI.iconInto` backs at 64; HUD `res` canvas 16). Author 64, it renders crisp at every use. |
| **Origin Card** | 512×512 | **128×128** (up from ~52) | ~52 CSS (face) / 34 (reveal) | ~2.5:1 | None — card `<canvas>` scales via CSS. |
| **Effect (kraken/fish)** | 128 | **32×32** | 32 | 4:1 | None. |
| **Effect (dragon)** | 384×192 | **96×48** | 96×48 | 4:1 | None. |

**Net recommendation:** author **all** masters at 4×; ship building/construction
slots at **128 (1×1) / 256 (2×2)**, icons at **64**, cards at **128**, and units
/ terrain / kraken / fish at **32** (or adopt the §9 render bumps to ship units
at 48–64 and terrain at 64). This alone is a large, no-code-change fidelity jump
for buildings, icons and cards; units and terrain get crisper immediately and
can go larger with the flagged render tweaks.

---

## 2. Anchor / registration conventions

| Category | Registration point | Renderer math (zoom 1) |
|---|---|---|
| **Building** | **Top-left of the footprint box**; art fills a `size×size` tile square, silhouette bottom-aligned with baked shadow near the base. | `drawImage(spr, b.x*32, b.y*32, size*32, size*32)` |
| **Construction scaffold** | Same as building (fills footprint box). | `drawImage(misc/construction[Big], b.x*32, b.y*32, size*32, size*32)` |
| **Unit** | **Bottom-center-ish**: sprite's horizontal center sits on the unit's tile-x; sprite is lifted 4 px so the **feet rest just below the tile-y**. Keep feet at ~y30 of a 32 px sprite; keep 1–2 px of empty margin at top/sides for the outline. | `drawImage(spr, u.x*32 − 16, u.y*32 − 20)` (natural 32×32) |
| **Terrain** | Top-left, tile-aligned; fills the tile exactly, seamless at edges (no bleed). | `drawTile → drawImage(spr, x*32, y*32)` into the cache |
| **UI icon** | Centered in a square; transparent margin ok. | scaled into 16 / 40 / 44 / 64 canvases |
| **Card** | Square, centered subject; full-bleed background ok. | drawn to the card face `<canvas>` |
| **Effect (misc)** | `construction*` → footprint box (as building). `kraken`/`fish`/`dragon` → centered on their event point. | see §7 |

---

## 3. Style-continuity checklist (binding — from `ARTSTYLE.md` / `js/artstyle.js`)

All external art **must** match, or it will clash with the procedural sprites it
sits beside:

- [ ] **Light from the top-left.** Lit top+left edges, shaded bottom+right. One
  fixed sun for every sprite (`STYLE.LIGHT = 'top-left'`).
- [ ] **1 px dark-ink outline, baked in.** Procedural sprites get it at build
  time (`ART.outline`, ink `rgba(20,16,10,0.8)`, never pure black). PNGs must
  bake it. **Scale the outline with the master**: 1 px at 32, **2 px at 64/128,
  4 px at 256** so it reads the same after downscale.
- [ ] **Soft drop shadow is part of the sprite**, not the renderer
  (`ART.dropShadow`, `rgba(20,16,10,0.30)`, a squashed ellipse under the base).
- [ ] **Master palette only** — the ramps in `ART.PALETTE` (grass, leaf, soil,
  water, stone, wood, thatch, bone, skin, hair, pelt, hide, `blue`=player,
  `red`=rival, `rust`+`teal`=barbarians, fire, gold, bloom, ink). Darkest→lightest,
  index 0 = darkest. No off-palette hex.
- [ ] **Level-tier progression** (`ART.tierDress`): materials roughen→refine —
  **L1 wattle/daub + thatch**, **L2 timber + thatch**, **L3 dressed stone +
  wood-shingle roof**; decoration accumulates (`decor = level−1`); footprint
  inset shrinks; **banners + ember/door glow arrive at L3**. Keep the same
  silhouette across levels so a building reads as "the same building, upgraded."
- [ ] **True alpha transparency**, no matte color.
- [ ] **Pixel-grid aligned**, integer edges; no anti-aliased fringing except the
  intentional supersample softening from the 4× downscale.
- [ ] **Silhouette-first identity**: each building/unit must be recognizable in
  pure black at render size (see per-asset silhouette notes).

---

## 4. BUILDINGS

12 "hero" building types render at **64→(recommend 128) px**, each **3 levels**,
each with a **baked player (`building/…`) and rival (`building_a/…`) sheet**.
Walls & gates are a special case (full-tile, auto-tiling, neutral) — see §4.3.

- **States per building:** exactly **one static idle sprite per level** (no
  per-level idle animation). The "under construction / upgrading" state is a
  **shared scaffold overlay** (`misc/construction*`, §7), not per-building art.
  Small living flourishes (TC hearth flame, dock water ripple, hearth smoke) are
  **procedural render overlays**, not assets (§7 "procedural-only").
- **Frames:** 1 (static). **fps:** n/a.
- **Faction variants:** **baked, two sheets** — `building/<key>/<lv>` (player,
  `blue` accents) and `building_a/<key>/<lv>` (rival, `red` accents). They may
  share a PNG where identical (e.g. TC L1 carries no banner — one image can back
  both keys; banners/faction color only diverge at L2–L3).

### 4.1 Hero buildings — keys (× levels 1,2,3 × {`building`, `building_a`})

| Key stem | Name | Footprint | Source→Render | `near` terrain (bonus) | Gate/req | Silhouette & tier notes |
|---|---|---|---|---|---|---|
| `tc` | Town Center | **2×2** | 64→64 (→**256→64**) | — | unique | The hero asset. L1 thatch roundhouse + fire pit; L2 timber long-hall; L3 dressed-stone grand hall with **faction banner**. Must dominate the skyline. |
| `house` | House | 1×1 | 64→32 (→128) | — | — | L1 wattle hut → L2 timber cottage (window) → L3 stone house (2 windows, flowers). |
| `farm` | Farm | 1×1 | 64→32 | fertile | — | Tilled rows; crop **greens L1–2, golds at L3**; shed + fence; scarecrow at L2+. Full-tile (no outline). |
| `lodge` | Hunter's Lodge | 1×1 | 64→32 | forest | — | Hide tent + antlers; drying rack (L2), smokehouse (L2). |
| `lumber` | Lumber Camp | 1×1 | 64→32 | forest | — | Stacked logs + chopping stump + axe; lean-to (L2), stone store (L3). |
| `quarry` | Quarry | 1×1 | 64→32 | hills | — | Stepped stone pit + cut blocks; crane (L2), timber shoring (L3). Full-tile. |
| `tower` | Watchtower | 1×1 | 64→32 | — | — | Tall shaft + crenellated platform; long shadow = height; **signal fire glows at L3**. |
| `barracks` | Barracks | 1×1 | 64→32 | — | — | Long hall, twin doors, faction shield; pennant (L2), **banner (L3)**. |
| `stable` | Horse Stable | 1×1 | 64→32 | — | reqTC 2 | Big stall door, horse at window, hitching post; paddock (L2), banner (L3). |
| `range` | Archery Range | 1×1 | 64→32 | — | reqTC 2 | Straw target + rings + bow rack; shooting-lane fence (L2), banner (L3). |
| `dock` | Dock | 1×1 (on water) | 64→32 | water | reqTC 2 | Plank deck on pilings over water; crates + mooring (L2); banner + gold (L3). Full-tile; sits on a water tile. |
| `siege` | Siege Workshop | 1×1 | 64→32 | — | reqTC 3 | Open work-yard, catapult on a sled taking shape; seasoned timber (L2), shot pile (L3), banner (L3). |

> **Key examples:** `building/tc/1`, `building/tc/2`, `building/tc/3`,
> `building_a/tc/1…3`, `building/house/1…3`, `building_a/house/1…3`, … through
> `building/siege/3`, `building_a/siege/3`.
> **Count:** 12 types × 3 levels × 2 factions = **72 sprite keys.**

### 4.2 Construction / upgrade scaffold (shared, not per-building)

| Key | Used for | Source→Render | Frames | Notes |
|---|---|---|---|---|
| `misc/construction` | any **1×1** building being built or upgraded | 64→32 (→128) | 1 | Lashed timber scaffold, half-laid stone footing, materials, ladder. Drawn at the building's footprint; owner tag + progress bar are code. |
| `misc/constructionBig` | the **2×2 TC** being built/upgraded | 128→64 (→256) | 1 | Roundhouse-going-up: half-raised ring wall, **partial cone roof (one side thatched, one bare rafters)**, scaffold, gin-pole crane. |

> Walls & gates **under construction** show a **55%-alpha ghost of their own
> oriented sprite** (no separate asset).

### 4.3 Walls & gates (full-tile, auto-tiling, neutral)

Two distinct forms exist per fortification:

**(a) Build-menu / basic icon form** — goes through the faction build loop:
| Keys | Source→Render | Faction | Notes |
|---|---|---|---|
| `building/wall/1..3`, `building_a/wall/1..3` | 32→32 | player + rival | The menu thumbnail: an E–W wall run. L1 stick-and-grass palisade, L2 stone, L3 dressed stone. **Full-tile, no outline.** |
| `building/gate/1..3`, `building_a/gate/1..3` | 32→32 | player + rival | Menu thumbnail: a gate with twin towers + door. |

**(b) On-map auto-tiling atlas** — **neutral** (material by level, not faction);
both tribes' on-map walls look identical:
| Key family | Count | Source→Render | Notes |
|---|---|---|---|
| `wall/<lv>/<mask>` | 3 levels × **16 masks** = **48** | 32→32 | 4-bit neighbor mask (bit 1=N, 2=E, 4=S, 8=W). Mask 0 = lone pillar; author all 16 junctions so runs tile seamlessly (junctions read water/mountain/edge as connected). |
| `gate/<lv>/<h\|v>` | 3 levels × 2 = **6** | 32→32 | `h` horizontal span, `v` vertical span (thick wall + twin flanking towers, no visible door). |

> **Count (fortifications):** menu forms 3×2×2 = **12**, auto-tile **48 + 6 =
> 54**. **Total 66.**

---

## 5. UNITS

**25 kinds**, each pose is a **2-frame loop at ~4 fps (~0.25 s/frame)**, rendered
at **32×32 natural** (see §9 to enlarge). Author 4× (128) masters, supersample
to 32.

- **States (poses) are per kind** — only author the poses a kind actually uses
  (table below). `idle` (gentle bob), `walk` (leg cycle), `gather` (work swing),
  `fight` (weapon strike). Villagers replace the generic set with task tools
  (see §5.1).
- **Faction variants — read carefully (current engine reality):**
  - **Villagers:** **per-village tunic sheets** (§5.1). Only the default
    (`unit/villager/*` = blue) is manifest-addressable today — **the other tunic
    colors have no key and need a grammar extension** (see §9 flag).
  - **Defender / Elite:** player uses `unit/defender/*`, `unit/elite/*`; **the
    rival uses a single shared red sheet `unit/defenderA/*` for both** its
    defenders and elites.
  - **Every other kind** (axeman, longbow, archer, marksman, rider, horsearcher,
    lancer, catapult, ballista, siegetower, all naval, all animals) uses **one
    shared sheet for both owners** (accent baked `blue`). Rival copies currently
    look player-colored — **faction color for these needs new keys** (§9 flag).
  - **Barbarians** (`raider`, `brute`) are their own family (owner `R`,
    rust fur + **teal** war paint) — never confuse with the red rival.

### 5.1 Villager — the working repertoire

`unit/villager/<pose>/<0|1>` — **7 poses**, each 2 frames (14 slots). Manifest
key backs the **blue/default** tunic only.

| Pose | Task shown | Tool / action | Debris on strike (frame 1) |
|---|---|---|---|
| `idle` | standing | — | — |
| `walk` | moving | leg cycle | — |
| `gather` | **cutting wood** | lashed **stone axe**, overhead swing | wood chips |
| `mine` | **quarrying stone** | **pickaxe**, high arc | stone spark |
| `farm` | **tilling soil** | **hoe**, chop to ground | turned earth |
| `build` | **raising a building** | **mallet/hammer** tap | impact spark |
| `guard` | **defending** | **pickaxe swung in anger** | strike flash |

> **Tunic colors** (each a full 7-pose sheet in `Sprites.villager[color]`):
> `blue red yellow green purple teal orange`. Village → color mapping lives in
> `S.tunic = {P, A}` (player pick + auto-contrasting rival). **Only `blue` is
> reachable via `unit/villager/*` today** — supplying per-tunic art needs the
> grammar extension in §9.

### 5.2 All units — kind × poses (2 frames each)

| Kind | Name | Poses (author these) | Owner variants | Notes / silhouette |
|---|---|---|---|---|
| `villager` | Villager | idle, walk, **gather, mine, farm, build, guard** | tunic sheets (blue addressable) | see §5.1 |
| `defender` | Defender | idle, walk, gather, fight | player sheet | spear + faction accent; idle spear overlay |
| `elite` | Elite Defender | idle, walk, gather, fight | player sheet | gold accent + shield |
| `defenderA` | (rival defender/elite) | idle, walk, gather, fight | **rival red sheet** (serves both) | red accent |
| `axeman` | Axeman | idle, walk, gather, fight | shared | bare-armed, broad stone axe over shoulder |
| `longbow` | Longbowman | idle, walk, gather, fight | shared | tall bow, quiver on hip |
| `archer` | Archer | idle, walk, gather, fight | shared | short bow |
| `marksman` | Marksman | idle, walk, gather, fight | shared | elite archer |
| `rider` | Rider | idle, walk, fight | shared | mounted; no gather |
| `horsearcher` | Horse Archer | idle, walk, fight | shared | mounted bow |
| `lancer` | Lancer | idle, walk, fight | shared | mounted lance |
| `catapult` | Catapult | idle, walk, fight | shared | siege engine; `bldAtk` (breaks walls) |
| `ballista` | Ballista | idle, walk, fight | shared | bolt thrower |
| `siegetower` | Siege Tower | idle, walk | shared | rolling tower; no fight frame |
| `raider` | Barbarian | idle, walk, gather, fight | barbarian (owner R) | shaggy fur, teal face paint, bone spear |
| `brute` | Barbarian Brute | idle, walk, gather, fight | barbarian (owner R) | hulking, bone crown, broad teal war-stripe |
| `wolf` | Wolf | idle, walk, fight | neutral wildlife | pelt gray |
| `boar` | Boar | idle, walk, fight | neutral wildlife | dark hide, tusks |
| `bear` | Bear | idle, walk, fight | neutral wildlife | large brown |
| `deer` | Deer | idle, walk, fight | neutral wildlife | passive; flees |
| `cow` | Wild Cow | idle, walk, fight | neutral wildlife | passive |
| `fishboat` | Fishing Boat | idle, walk, **gather** | naval, shared | casts nets (gather) |
| `warship` | Warship | idle, walk, fight | naval, shared | ranged hull |
| `fireship` | Fire Warship | idle, walk, fight | naval, shared | fire-tipped |
| `transport` | Transport Raft | idle, walk | naval, shared | carries 3; no fight |
| `bigtransport` | War Transport | idle, walk | naval, shared | carries 5 |

> **Key examples:** `unit/villager/gather/0`, `unit/villager/gather/1`,
> `unit/axeman/fight/0`, `unit/rider/walk/1`, `unit/fishboat/gather/0`,
> `unit/defenderA/fight/1`, `unit/wolf/idle/0`.
> **Count:** 176 unit slots today (sum of poses×2 across all kinds).

---

## 6. TERRAIN

Every tile draws at **32×32**, tile-aligned, baked into a full-map cache at
newGame. Each terrain type carries **N pre-authored variants** picked
deterministically per tile (subtle noise so fields don't repeat). **The current
engine draws flat per-tile tiles — there are no edge/transition/auto-tile pieces
for terrain** (only walls/gates auto-tile; §4.3). Author each variant to tile
**seamlessly on all four edges** with any neighbor.

| Key stem (`terrain/<name>/<variant>`) | T id | Variants (author 0..N−1) | Represents | Notes |
|---|---|---|---|---|
| `grass` | 0 | **4** | open grass | base ground; keep low-contrast so units/buildings pop |
| `terrain_rare/grass/0..1` | 0 | **2** | rare flower meadow | drawn on ~3% of grass tiles (`terrain_rare/…`) |
| `forest` | 1 | **3** | woodland (wood source) | **impassable** obstacle; dense canopy, tileable |
| `water` | 2 | **2** | water (fish) | impassable to land; procedural sparkle/foam overlay is code (§7) |
| `hills` | 3 | **2** | rocky hills (**"rock/boulders"**, stone source) | impassable obstacle |
| `fertile` | 4 | **4** | **orchards + berry ground** (food source) | impassable obstacle; the 4 variants are the **orchard/berry** tiles |
| `camp` | 5 | **1** | raider (barbarian) camp | neutral hostile-spawn marker |
| `stumps` | 6 | **2** | felled forest | passable; what forest becomes when cut |
| `pebbles` | 7 | **1** | quarried-out hills | passable; what hills become |
| `barren` | 8 | **1** | spent soil | passable; what fertile becomes |
| `ruin` | 9 | **1** | razed-building rubble | passable |
| `mountain` | 10 | **2** | impassable mountain ridge | impassable, unbuildable |

> **Count:** 23 terrain variants + 2 rare grass = **25 terrain keys.**
> **Optional (new, not in engine today):** if you want AoE-style shorelines /
> forest edges, that is an **engine feature to add**, not an existing key — flag
> it in §9; do not ship edge PNGs expecting them to load.

---

## 7. UI, EFFECTS & MISC

### 7.1 HUD resource / population icons — `icon/<name>`

| Key | Meaning | Source→Render |
|---|---|---|
| `icon/food` | food | 16→15 (recommend author **64**) |
| `icon/wood` | wood | 16 (→64) |
| `icon/stone` | stone | 16 (→64) |
| `icon/gold` | gold | 16 (→64) |
| `icon/pop` | population | 16 (→64) |

> **Count: 5.** Author at 64 for crispness — `UI.iconInto` scales the whole
> sprite; the top-bar `res` canvas displays ~15 px, build tooltips larger.

### 7.2 Building-menu & panel thumbnails

**No new assets** — these are **re-scaled building/unit sprites** (`UI.iconInto`
backs a 64 px canvas from `Sprites.building[key][0]` / `R.unitSprite`). Higher-fi
buildings/units automatically sharpen the thumbnails.

### 7.3 Panel / chrome / minimap frame / buttons

**Not sprite assets.** HUD chrome (wood-grain panels, buttons, the minimap
frame, the top bar, the ☰ menu) is **CSS + a procedural wood-texture data-URL**
in `index.html` / `js/ui.js`, plus emoji glyphs — not atlas art. Restyling
chrome is a CSS task, out of the manifest pipeline. (Listed here for
completeness so nothing is assumed missing.)

### 7.4 Effects — addressable sprites (`misc/<name>[/<frame>]`)

| Key | Meaning | Source→Render | Frames | Cadence | Notes |
|---|---|---|---|---|---|
| `misc/construction` | 1×1 work-site scaffold | 64→footprint (→128) | 1 | — | see §4.2 |
| `misc/constructionBig` | 2×2 TC work-site | 128→footprint (→256) | 1 | — | see §4.2 |
| `misc/kraken/0..1` | sea kraken (special event) | 32→32 | **2** | slow | tentacled sea beast |
| `misc/dragon/0..1` | black dragon (special event) | **96×48**→96×48 | **2** | wingbeat (~4 fps) | the two wing-beat frames |
| `misc/fish/0..1` | jumping shore-fish | 32→32 | **2** | ~6–7 fps | breaches over shoals so the player can spot fishing spots |

> **Count: 5 names / 8 addressable slots.**

### 7.5 Effects — procedural-only (drawn in code; **no manifest key today**)

These are drawn directly by `js/render.js` from palette rects — they have **no
sprite slot**, so they **cannot be replaced via the manifest** without adding
new keys + render hooks (flag §9). Listed so the set is complete:

- **Fire / burning** (dragonfire wreath on units, `u.burnT`).
- **TC hearth flame** (flickering flame over the L1 camp fire pit).
- **Hearth smoke** (drifting from settled buildings), **camp embers**.
- **Combat strike flashes** (bone/fire pixels on the `fight`/`guard`/`mine`
  strike frame — these are *inside* the unit sprites, so partly asset-covered).
- **Ambient life:** butterflies / birds drifting over grass; **~12-day dusk
  cycle** tint; **water sparkle & foam**.
- **Float text** (`+wood` etc.), **health bars**, **selection ring**, **owner
  tag** (blue/red corner pip), **stack ×N badge**, **cargo pips**, **rally
  flag**, **fog** (3-state), **minimap dots**.

---

## 8. ORIGIN CARDS — `ui/card/<cardKey>`

**20 cards.** One **square** image per card (draft-screen face ≈ 52 CSS px; the
rival mini-reveal ≈ 34 px). Author **128×128** (or a 4× 512 master with
`dw`/`dh`). Until an image lands each card falls back to a procedural
placeholder motif (`Cards.drawMotif`) — real art needs **zero code change**.

| Key (`ui/card/<key>`) | Card name | Art brief (motif) |
|---|---|---|
| `homesteader` | Homesteader | hearth |
| `warlord` | Warlord | crossed spears |
| `horselord` | Horselord | rider silhouette |
| `mariner` | Mariner | longboat |
| `mason` | Mason | stone block + chisel |
| `forager` | Forager | berry basket |
| `timberwright` | Timberwright | axe in a log |
| `grainkeeper` | Grainkeeper | wheat sheaf |
| `stoneheart` | Stoneheart | boulder |
| `tradewind` | Tradewind | coin pouch |
| `houndmaster` | Houndmaster | hound |
| `pathfinder` | Pathfinder | footprints / tracks |
| `firekeeper` | Firekeeper | campfire |
| `beastward` | Beastward | antlers |
| `refugeehost` | Refugee Host | crowd of figures |
| `riverborn` | Riverborn | reeds |
| `seer` | Seer | eye + stars |
| `ironhand` | Ironhand | anvil |
| `harvestlord` | Harvest Lord | sickle |
| `nomad` | Nomad | tent |

> **Count: 20.** Card frame/border/name plate are drawn by the draft screen
> (CSS/canvas) around your square — supply just the **subject art**, full-bleed,
> matching palette + top-left light.

---

## 9. Gaps & flags (things needing a code change for full coverage)

None of these block the art you can produce today; they bound what the current
**manifest grammar + renderer** can accept. Flagged so external art isn't
authored against keys that won't load.

1. **Per-tunic villager art has no key.** `unit/villager/*` overlays only the
   `blue`/default sheet. The 6 other tunic sheets (`red yellow green purple teal
   orange`) render from `Sprites.villager[color]` with no manifest key. *To
   image-back them:* extend the grammar (e.g. `unit/villager/<tunic>/<pose>/<n>`
   → `Sprites.villager[tunic][pose][n]`). Small `js/assets.js` change.
2. **Faction color for non-defender soldiers.** Only `defender/elite` have a
   rival sheet (`defenderA`); every other soldier/naval kind shares one
   player-accented sheet across owners. *To give the rival distinct art:* add
   `unit_a/<kind>/…` keys + a render pick (mirror `defenderA`).
3. **Bigger units on screen.** Units blit at natural 32 px. A 48–64 px slot needs
   `render.js` to draw with explicit `w/h` and re-anchor the feet.
4. **True hi-res terrain.** The terrain cache bakes at 32 px/tile; source > 32
   downsamples in the bake. A retina cache (`CFG.TILE × scale`) would let terrain
   render sharper than 32.
5. **Terrain edges/transitions & procedural-only effects (§7.5)** are not
   asset-backed; adding them is engine work, not manifest work.

---

## 10. Atlas-packing plan

Pack finished PNGs into a **small number of atlases grouped by category**, each
**≤ 4096 px per side** (iOS Safari hard limit; keep ≤ 2048 where possible for
headroom). Rects need not align to a grid. `assets/manifest.js` maps every
sprite key → its rect (with `dw`/`dh` to downscale 4× masters).

**Recommended atlases** (all fit ≤ 2048 at the recommended slots):

| Atlas file | Contents | Keys | Rough packed size |
|---|---|---|---|
| `assets/buildings-player.png` | `building/<key>/<1..3>` for the 12 hero types @128 (TC @256) | 36 | ~1536² |
| `assets/buildings-rival.png` | `building_a/<key>/<1..3>` @128 (TC @256) | 36 | ~1536² |
| `assets/fortifications.png` | `wall/<lv>/<mask>` (48) + `gate/<lv>/<h\|v>` (6) + menu `building[_a]/wall\|gate/<lv>` (12) @32 | 66 | ~512² |
| `assets/units.png` | all `unit/<kind>/<pose>/<n>` @32 (from 128 masters via dw/dh) | 176 | ~768² |
| `assets/terrain.png` | `terrain/<name>/<v>` + `terrain_rare/grass/<v>` @32 (or 64) | 25 | ~256²–512² |
| `assets/effects.png` | `misc/construction`(128) `misc/constructionBig`(256) `misc/kraken`(2) `misc/dragon`(2×96×48) `misc/fish`(2) | 8 | ~512² |
| `assets/icons.png` | `icon/<name>` @64 | 5 | ~192² |
| `assets/cards.png` | `ui/card/<key>` @128 (20) | 20 | ~640² |

**Folder / naming the manifest expects:**

```
index.html
assets/
  manifest.js            ← the only wiring (maps key → {atlas rect, dw, dh})
  buildings-player.png
  buildings-rival.png
  fortifications.png
  units.png
  terrain.png
  effects.png
  icons.png
  cards.png
  src/                   ← (optional) one self-contained HTML generator per
                           4× master, deterministic + palette-locked (how the
                           TC master is authored today)
```

- Paths in the manifest are **relative to `index.html`** (e.g.
  `image: 'assets/units.png'`).
- **Later atlas entries win** if a key repeats — handy for hot-swapping one
  sprite without repacking.
- Ship the game with `atlases: []` and everything stays procedural; add atlases
  incrementally.

---

## 11. Worked example (format is unambiguous)

Goal: replace the **rival Town Center, level 2** with a hand-drawn 4× master,
supersampled into its 256 px slot.

**1 — author** `assets/src/tc.html` → export a **1024×1024** master, place it in
the `buildings-rival.png` atlas at pixel rect `(0,0,1024,1024)`.

**2 — manifest entry** (`assets/manifest.js`):

```js
window.ASSET_MANIFEST = {
  version: 1,
  atlases: [
    {
      image: 'assets/buildings-rival.png',
      sprites: {
        // 4× master (1024²) downscaled once at decode into the 256² TC slot
        'building_a/tc/2': { x: 0, y: 0, w: 1024, h: 1024, dw: 256, dh: 256 },

        // a 1×1 rival building, 512² master → 128² slot, packed to the right
        'building_a/house/2': { x: 1024, y: 0, w: 512, h: 512, dw: 128, dh: 128 },
      },
    },
    {
      image: 'assets/units.png',
      sprites: {
        // two-frame villager chop; 128² masters → 32² slots
        'unit/villager/gather/0': { x: 0,  y: 0, w: 128, h: 128, dw: 32, dh: 32 },
        'unit/villager/gather/1': { x: 128, y: 0, w: 128, h: 128, dw: 32, dh: 32 },
      },
    },
  ],
};
```

**3 — atlas layout** (`buildings-rival.png`, 2048² example):

```
(0,0)┌──────────────┬────────┬───────────────────────────┐
     │ tc/2         │house/2 │  … more rival buildings …  │
     │ 1024×1024    │512×512 │                            │
     │ → slot 256   │→128    │                            │
     └──────────────┴────────┴───────────────────────────┘
```

**4 — reload.** `building_a/tc/2` now renders from the PNG (downscaled to 256,
drawn to the TC's 2×2 footprint); every other key stays procedural. Check
`Assets.loaded` (swapped in) and `Assets.failed` (rejects, with reasons) in the
console.

---

## 12. Key-grammar reference (canonical; from `js/assets.js`)

Segments join with `/`. Levels 1-based; frames/variants/masks 0-based.

```
building/<key>/<level>            player building, level 1–3
building_a/<key>/<level>          rival  building, level 1–3
   <key> ∈ tc farm lodge lumber quarry house tower siege
           barracks stable range dock wall gate
wall/<level>/<mask>               on-map auto-tile, mask 0–15 (N1 E2 S4 W8)
gate/<level>/<h|v>                on-map gate, horizontal|vertical
unit/<kind>/<pose>/<frame>        frame 0–1; kinds & poses in §5.2
terrain/<name>/<variant>          <name> = grass forest water hills fertile camp
                                    stumps pebbles barren ruin mountain
terrain_rare/grass/<0|1>          rare flower meadows
icon/<name>                       food wood stone gold pop
ui/card/<cardKey>                 20 Origin Cards (§8)
misc/<name>                       construction, constructionBig
misc/<name>/<frame>               kraken/0..1, dragon/0..1, fish/0..1
```

**Grand totals (current addressable keys):** buildings 72 + fortifications 66 +
units 176 + terrain 25 + icons 5 + cards 20 + effects 8 = **372 sprite keys.**
