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

**Only NATURAL ground raises a shore, on both sides of the waterline.** Land a
sapper reclaimed out of the sea gets no beach, and a MOAT — a ditch cut with a
spade and then flooded — raises none of its own either. So a channel dug into
a lake reads as one continuous body of water with the lake: same blue end to
end, no rim of sand between them. A supplied `moat.png` therefore never has a
beach drawn against it, and a `water.png` loses its edge treatment along any
stretch where the water on that side is a moat. Both fade in and out along the
curve rather than switching at a tile, so the lake's beach dies away as it
runs into the cut.

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
| a decal still reads as an object | raise `DECAL_MUTE` |
| the ground looks busy rather than deep | lower `DECAL_DENSITY`, raise `DECAL_GATE` |
| impassable ground does not announce itself | raise `BLOCK_SHADE` |
| the map looks blotchy | lower `BLOCK_SHADE` |
| a resource cluster shows tile-shaped patches | raise `BLOCK_FADE`, soften the density taper |
| a tile grid is visible in flat ground | `TONE_SUB` (must stay above 1), `TONE_STEPS` |
| hills read flat | raise `HILL_SHADOW`, `HILL_SHADOW_MAX` |
| a hill starts looking like a mountain | lower the same two |
| a hill's edges read as ruled lines | raise `HILL_SHADOW_WOBBLE` |
| bare grass shows through a rock core | lower `ROCK_STEP`, raise `ROCK_MIN` |
| a rock field reads as a bead curtain | raise `ROCK_JIT` |
| a deposit's edge is a straight line | raise `ROCK_WANDER` (keep it under 0.5) |
| the fringe ends on a wall | lower `ROCK_FRINGE` |
| stone sits on ground you can walk through | lower `ROCK_WANDER`, `ROCK_SCREE` |
| a wood/thicket has a tidy square ring of medium tiles | raise `DENSE_WANDER` |
| a mountain's outline still steps at right angles | raise `FRACTURE_AMP`, lower `SEG_MAX` |
| a mountain throws thin spikes into the grass | lower `FRACTURE_CAP`, `OUT_MAX` |
| a range reads flat | raise `RISE`, `LIGHT`, `MACRO` |
| cliffs read low / timid | raise `LIFT_MAX` (and `PEAK_LIFT`) |
| a thin ridge reads as a ledge | raise `LIFT_MIN` |
| micro-cliffs stack all over the interior | raise `MERGE_GAP` |
| the cliff face reads as hanging cloth | the strata seams own this — see the face paint in `drawMtnRegion` |
| the cast shadow is invisible / too heavy | `SHADOW_A`, `SHADOW_K` |
| snow reads wrong for the setting | `SNOW: 0` |
| ore boulders read small / gravelly | raise `ROCK_MIN`/`ROCK_MAX`, lower `ROCK_STEP` |
| the rock reads as cobblestones or cracked ceramic | see `mtnFacetSites` — this is a geometry bug, not a dial |
| the faces are too big / too small | `FACET_CELL` |
| the creases are too heavy | lower `CREASE_DARK`, `CREASE` |
| a one-tile mountain looks like a shard | `CLS_OUTCROP`, `OUTCROP_*` |

### Readability comes before atmosphere

The one rule that outranks everything else here: **a player must be able to
tell passable ground from impassable resource terrain instantly, without
looking closely.** Resources are the foreground; ground decoration is
background. If art you supply makes that harder, it is wrong however good it
looks on its own.

What the engine does to keep it true:

- The **core of every blocking resource is closed** — 80–99% of the tile is
  covered at the heart of a wood, an ore body or a thicket, tapering out
  through a near-solid perimeter to a thinned fringe. If you supply art for
  forest, hills or fertile, author it dense. (Measured by baking the map
  twice, once with each resource's drawing suppressed, and counting the
  pixels that differ — a colour test cannot do it, because a wood's canopy is
  as green as the grass it stands on.)
- **Blocked ground carries a shared cue** — a darker, dithered patch beneath
  the cluster. It is derived from `Path.blocksLand`, the same predicate
  movement asks, so it can never disagree with the rules. It is drawn under
  your art, not over it.
- **Ground decals are muted toward the grass** at the point of drawing
  (`LAND.DECAL_MUTE`), so nothing on open ground reads as an object.

**Gold ore, spent quarries and felled stands are WALKABLE** and deliberately
carry none of that cue. A gold seam is meant to be unmistakable by being
*gold*, not by pretending to be an obstruction — marking it blocked would be
the exact lie the cue exists to prevent.

### Ore is round, and deliberately not rock

`hills` is an ORE DEPOSIT, and it breaks the "rock is angular" rule the
mountains follow on purpose: at a glance, round-and-lighter is a resource you
cut, sharp-and-dark is a wall you walk around. The deposit is scattered in
WORLD space (no tile sprite; a boulder straddling a boundary is one whole
rock) out of pre-rendered ROUND boulders — the tree canopy's shape language
on stone: clean dark outline, broad lit cap, a straight quarried facet of
fresh pale stone, the odd glint — fewer and larger, because many small chips
is exactly what reads as gravel. The boulders draw in `oreD`, a couple of
shades darker than the original bright ore ramp, so a deposit sits in the
mountain's own tonal family (it lives at the mountain's foot) while the round
silhouette and the facet keep it plainly a find, not a wall. The gold seam
wears the same round language in pale quartz with real gold nuggets and
veins.

Deposits themselves are few and compact — two or three dense knots per map,
seated IN THE CREVASSES of the mountain base first (the grass tile the most
mountain wraps around wins, so a knot conforms to the fold of the rock's own
foot), then at forest edges, then (small) in open grass — so if you are
authoring a map, put the ore where the geology says.

Supplying `assets/terrain/hills.png` **stands the whole scatter down** and
your tile is drawn instead, the same rule grass, water and mountain follow.
Author it dense, and remember it will be the only thing on that tile.

Loose round pebbles in the deposit's own ramp lie on the walkable ground
just outside a deposit. That is deliberate and honest — the spill says "the
ore is over there" in the ore's own language — and it is the only stone
allowed past the boundary, because a boulder standing on ground a unit can
cross is a lie about the map.

### Mountains are objects, not tiles

`mountain` is the second terrain with **no tile sprite** (the first is
`hills`), and for a stronger reason. A mountain is the only terrain with real
HEIGHT, and a top-down tile grid has nowhere to put height — which is why
every earlier attempt at drawing them tile by tile came out as a flat grey
blob however good the individual tile was.

Each contiguous mountain area is ONE OBJECT: its cells are flooded into a
region, its boundary traced into a polygon and fractured off the lattice, its
interior shaded in hard value steps from a distance field that doubles as the
height — and then the whole plateau is EXTRUDED: drawn shifted north, with the
gap down to the true southern boundary filled by a tall vertical cliff face
(striated, rim-lit, occluded at the foot, casting a real shadow on the ground
below). Peaks are taller extrusions at the field's local maxima. Areas draw
according to their SIZE — one or two cells is a boulder outcrop, not a
mountain — and the cliff height is normalized per region, so even a thin
ridge gets a real face.

The art deliberately leaves its tiles, and there are hard rules about how far.
Sideways and southward it stays within a fifth of a tile of the true
footprint; northward it rises by the lift alone. Because the art is tall, it
OCCLUDES: units and buildings behind a ridge are hidden by it (a hidden unit
comes back as a faint silhouette, still selectable), ones in front draw over
it, and the placement grid is re-drawn above the rock so ground truth is
always inspectable. Nothing about this changes the rules: passability,
placement, fishing and dock siting all still read the tile grid.

Supplying `assets/terrain/mountain.png` **stands the whole thing down** and
your tile is drawn instead, the same rule grass, water and hills follow. Be
aware you are giving up the height treatment when you do — a mountain tile is
the one place where a supplied tile is likely to look worse than the generated
mass, not better.

### One thing on the ground that is not what it looks like

**Hills are shaded only at their edges** — a catch-light on the northern rim
and a cast shadow on the ground to the south. Nothing shades a hill's middle,
because on these map scales a hill is one or two tiles deep and there is no
interior to shade; every attempt at one came out as tile-shaped rectangles.
Author a `hills.png` as flat ground with rocks on it and let the edges do the
elevation.

(There used to be a second entry here: decorative streams, thin creeks drawn
over the ground with no gameplay meaning. They were removed — measured at play
zoom only 10.8% of a stream's pixels read as bluer than green, and a version
vivid enough to read as water would have been a promise the tile could not
keep. See CLAUDE.md if the idea comes back.)

Re-uploading a changed file under a name it already had? Bump `CFG.ART_V`.
