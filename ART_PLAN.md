# Clanfire — hand-authored art pipeline

PNG art replaces a building's procedural sprite **by filename alone** — no
manifest, no code change, no registration. Drop a correctly named file into
`assets/buildings/` and the game uses it; delete the file and the procedural
drawing comes back. The old atlas manifest (`assets/manifest.js`) is gone.

Contract test: `node tests/art-pipeline.mjs` — run it after touching
`js/assets.js`, `js/dev.js`, `R.blitBld` / `R.artRect` / `R.bldSprite`, or
`UI.iconInto`.

## The filename convention

```
assets/buildings/{id}-l{level}.png
```

**All lowercase, always.** GitHub Pages is case-sensitive: `Barracks-L1.png`
is a 404 and a silent fallback to procedural art. The dev panel's
"copy filename" button (below) exists so you never type these by hand.

Every valid filename (46 slots):

| id | levels | files |
|---|---|---|
| tc | 3 | `tc-l1.png` `tc-l2.png` `tc-l3.png` *(shipped)* |
| house | 3 | `house-l1.png` `house-l2.png` `house-l3.png` |
| farm | 3 | `farm-l1.png` `farm-l2.png` `farm-l3.png` |
| lodge | 3 | `lodge-l1.png` `lodge-l2.png` `lodge-l3.png` |
| lumber | 3 | `lumber-l1.png` `lumber-l2.png` `lumber-l3.png` |
| quarry | 3 | `quarry-l1.png` `quarry-l2.png` `quarry-l3.png` |
| mine | 3 | `mine-l1.png` `mine-l2.png` `mine-l3.png` |
| tower | 3 | `tower-l1.png` `tower-l2.png` `tower-l3.png` |
| barracks | 3 | `barracks-l1.png` `barracks-l2.png` `barracks-l3.png` |
| range | 3 | `range-l1.png` `range-l2.png` `range-l3.png` |
| stable | 3 | `stable-l1.png` `stable-l2.png` `stable-l3.png` |
| siege | 3 | `siege-l1.png` `siege-l2.png` `siege-l3.png` |
| sapper | 3 | `sapper-l1.png` `sapper-l2.png` `sapper-l3.png` |
| dock | 3 | `dock-l1.png` `dock-l2.png` `dock-l3.png` |
| trade | 3 | `trade-l1.png` `trade-l2.png` `trade-l3.png` |
| warcamp | 1 | `warcamp-l1.png` |

**Not in the convention, on purpose:**
- `wall`, `gate` — they tile from 16-mask atlases; one rectangle cannot be a
  curtain that auto-joins its neighbours.
- `wonder` — its art is per-monument, rolled per run (ten monuments share the
  one `wonder` building id); a single PNG would stamp all ten.
- `raidercamp` — a camp's look belongs to its **people** (`Sprites.camp`, five
  looks for one id).
- A dock PNG overrides **all four shore orientations** with the same image;
  the per-shore procedural faces only serve while no PNG exists.
- A tower PNG covers the **free-standing** Watchtower. A tower bonded into a
  wall line keeps its procedural mural-tower self, because that drawing has to
  match the curtain it joins.

Both tribes share each image (the same deal the shipped hall art always made):
banners fly the tribe's dye and the owner pip marks the rival, so the
architecture itself is faction-neutral.

## The anchoring rule (one rule, no per-building tuning)

Every PNG is drawn the same way (`R.blitBld` → `R.artRect`):

- **bottom-center** anchored on the building's footprint,
- scaled to **footprint width**, aspect ratio preserved,
- extra height **overhangs upward** — a tall roof rises above the tile.

A square image therefore fills its footprint exactly. Author art with the
building's *feet* at the image's bottom edge and the width matched to the
footprint; make the canvas taller when the silhouette needs headroom.
Supersampled masters (e.g. 256×256 for a 2×2 building) are correct and
encouraged — the renderer resamples from the master at every zoom.

The same rule follows the sprite everywhere it appears: burn/ruin variants,
fog ghosts, and the build menu icon (fit-within, feet on the floor).

## Optional sidecar (per-asset override)

```
assets/buildings/{id}-l{level}.json      ← beside the PNG, same name
{ "offsetX": 0, "offsetY": 0, "scale": 1 }
```

- `offsetX` / `offsetY` — fractions of the footprint (+x right, +y down);
  `0.1` shifts the art 10% of the footprint.
- `scale` — multiplier on the footprint-width fit.
- The file is **never required**; missing file = all defaults. It is only
  fetched for a PNG that actually loaded.

## Cache-busting

Every art URL carries `?v=` from `CFG.ART_V` (js/config.js). **Bump `ART_V`
when you re-upload a changed PNG under the same name**, or the Pages CDN keeps
serving the stale copy. Brand-new filenames don't need a bump.

## The `?dev=1` preview workflow

Open the normal site with `?dev=1` (e.g. `…/index.html?dev=1`). Without the
flag there is zero dev UI and zero behavior change.

1. **Drag PNGs anywhere onto the game window** — one or many at once. A file
   named to the convention takes its slot silently (case is normalized); any
   other name opens a picker listing every valid slot. Nothing is guessed,
   nothing silently overwritten.
2. Every matching building on the map redraws with the drop on the next
   frame, through the **same** anchoring path that ships — the preview is
   what you get.
3. The **ART DEV panel** (top-left) lists the overridden slots, with
   per-slot *revert* and *revert all* (back to the shipped state — the
   shipped PNG if one exists, else procedural).
4. **copy filename** — pick a slot, copy its canonical lowercase filename,
   and rename your file to it *before* committing, so a typo can never cause
   a silent procedural fallback.

Nothing uploads, nothing writes to disk, nothing commits: drops live in the
tab as in-memory object URLs and are gone on refresh.

## Shipping an asset

1. Preview it with `?dev=1` until it sits right (use the sidecar for nudges).
2. Rename the file with the panel's *copy filename* button.
3. Drop it into `assets/buildings/`, commit, push. That's the whole pipeline.
4. Re-uploading a *changed* file under the same name? Bump `CFG.ART_V`.

## Standalone props

Composited props that are not a building's own rectangle load from fixed
paths listed in `Assets.PROPS` (currently one: the hall's dooryard campfire,
`assets/misc/campfire-tc.png` → `misc/campfireTc`). Adding a prop key is a
one-line entry there — still no manifest.

## Ground art

`assets/terrain/{name}.png`, plus `{name}-2.png`, `-3` … for variants.
`{name}` is the terrain's own name in lowercase, derived from the `T` enum by
`Assets.terrainName` — never a hand-kept list, so a new terrain gets a slot
for free:

    grass  forest  water  hills  fertile  stumps  pebbles  barren
    ruin   mountain  trench  moat  mound  goldore  camp

**One file is enough.** Supply `forest.png` alone and every forest tile wears
it; add `-2`/`-3` and the map picks between them by the same tile hash the
procedural variants use, which is what stops a supplied set reading as
wallpaper. Probing cascades — only the blanket is tried for each terrain at
startup, `-2` only once the blanket loaded — so a bare repo pays 15 requests.

**Any size.** 32, 64, 128; it is scaled to the tile with smoothing off, so a
larger tile just carries more detail than the grid.

**Resource tiles want a TRANSPARENT floor.** forest, hills, fertile, stumps,
pebbles, goldore and mountain are painted OVER the grass floor — draw the
trees/rocks/crop and leave the ground clear. grass, water, ruin, barren,
trench, moat, mound and camp are full-tile.

**Replacing `grass.png` changes the floor under every resource too.** That is
deliberate and the only way the two stay seam-free.

### What the engine adds on top of your tile

Supplied ground is not stamped raw — it receives the same treatment the
procedural ground gets (`tests/land.mjs` pins this, because it is the
regression most likely to slip through):

- the **tonal layer** — broad seeded blotches, quantized to hard steps
- **contextual shade** — under wood, at crags, inland of water
- the **decal scatter** — flat, ground-level things on open grass (tufts,
  clover, flowers, pebbles, twigs, scuffs); ferns and leaf litter only in the
  one-tile undergrowth fringe beside real forest; reeds only by water. Nothing
  with a trunk or a canopy stands in open meadow. Turn the whole layer up or
  down with `LAND.DECAL_DENSITY`, and widen the bare ground between patches
  with `LAND.DECAL_GATE`
- **irregular edge fringes** where your terrain meets another
- **the traced coast** — shelf, foam, beach and rocky shoal where it meets
  water (see below)

So author a FLAT, even tile. Do not bake lighting, blotches or scatter into
it: the engine's layers will land on top and the two will fight. Tunables for
all of it live in the `LAND` block at the top of `js/render.js`.

### The coast is not made of tiles

Worth knowing before you draw a `water.png`, because it is the one layer that
does not follow the grid at all.

The waterline is **traced**, not banded per tile. The engine floods the water
into connected REGIONS, walks each region's boundary into closed polygons
(an outer shore and every island's shore come out separately), smooths them
with Chaikin corner-cutting at a scale **larger than one tile** — which is
what turns a 45° staircase into a sweep — and then displaces the result with
fine world-space noise, which is what stops the sweep reading as a clean
vector arc. Both halves are needed; either alone looks wrong in its own way.

Everything you see at the water's edge is then **offset from that curve**: a
stack of translucent shelf bands reaching into the water, a foam lip, the
beach, and wet dark rock with scattered stones where the land behind it is
hills, mountain or pebbles. So a supplied `water.png` supplies the BODY of
the water; the edge treatment is drawn over it from the curve and is not
something a tile can carry. A supplied land tile is likewise unaffected —
the beach lands on top of whatever you drew.

None of this touches tile DATA. Where a boat may sail, where a dock may
stand and which way it faces, where a villager may fish, what is passable —
all of it still reads the tile grid, so the painted waterline is free to cut
inside a tile without any rule noticing.

Tunables, all in the `LAND` block:

| symptom | dial |
|---|---|
| the coast still steps at 45° | raise `SHORE_SMOOTH` |
| the coast reads as a clean vector arc | raise `SHORE_NOISE` |
| the wobble is too fine / too coarse | `SHORE_NOISE_F` |
| the shallows are milky, or read as rings | `SHELF_ALPHA`, `SHELF_STEPS` |
| the shallows reach too far out | `SHELF_REACH` |
| beaches too wide, or never pinch out | `SAND_MAX`, `SAND_MIN`, `SAND_FREQ` |
| the rocky coast reads as an inked outline | lower `SHOAL_ALPHA` |
| shore stones look like beads on a string | raise `SHOAL_GATE`, lower `SHOAL_FREQ` |
| too many / too few shore stones | `SHOAL_STONES`, `SHOAL_STEP` |
| the shallows look barren on a rocky coast | raise `LIFE_CHANCE` |
| kelp and coral look evenly sprinkled | raise `LIFE_GATE` |
| the ground looks busy rather than deep | lower `DECAL_DENSITY`, raise `DECAL_GATE` |
| a tile grid is visible in flat ground | `TONE_SUB` (must stay above 1), `TONE_STEPS` |
| hills read flat | raise `HILL_SHADOW`, `HILL_SHADOW_MAX` |
| a hill starts looking like a mountain | lower the same two |
| a hill's edges read as ruled lines | raise `HILL_SHADOW_WOBBLE` |
| the world looks dry | raise `STREAM_DENSITY` |
| a creek reads as a river | lower `STREAM_IDEAL_RUN` |
| a creek runs too straight | raise `STREAM_WANDER`, `STREAM_SIDE_MAX` |
| a creek is too loud | lower `STREAM_W`, `STREAM_DAMP` |

### Two things on the ground that are not what they look like

**Streams are a drawing.** They are not water tiles and have no gameplay
effect of any kind — no blocking, no docks, no fishing, no naval movement, no
bridges, no sappers, not on the minimap. They write to no map array. If you
supply terrain art, streams are drawn over it and change nothing about how
that tile behaves.

**Hills are shaded only at their edges** — a catch-light on the northern rim
and a cast shadow on the ground to the south. Nothing shades a hill's middle,
because on these map scales a hill is one or two tiles deep and there is no
interior to shade; every attempt at one came out as tile-shaped rectangles.
Author a `hills.png` as flat ground with rocks on it and let the edges do the
elevation.

Re-uploading a changed file under a name it already had? Bump `CFG.ART_V`.
