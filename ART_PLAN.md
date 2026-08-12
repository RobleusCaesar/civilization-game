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
