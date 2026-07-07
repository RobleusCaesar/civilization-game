# ASSET_SPEC.md — Clanfire image-asset pipeline

How to replace the game's procedural pixel art with real PNG files, one
sprite at a time. The pipeline is **infrastructure only**: shipping zero
image files is a fully supported state (today's default — only one
placeholder ships), and any sprite not covered by an image keeps its
procedural drawable from `js/sprites.js`. Nothing about gameplay, layout
or timing changes when images are added.

## How it works

```
assets/manifest.js  ──►  atlas PNGs  ──►  ImageBitmap slices (pre-decoded)
                                                │
            Sprites.* tables  ◄── overlaid ─────┘
                    ▲
        renderer reads these (unchanged)
```

- `assets/manifest.js` declares atlases: one PNG plus a map of
  **sprite key → pixel rect**. It's a classic script (not JSON) so it
  loads with a plain `<script>` tag and works on `file://` in tests.
- `js/assets.js` (`Assets.init()`, called at boot, async) loads each
  atlas image, slices each declared sprite into its own pre-decoded
  `ImageBitmap` via `createImageBitmap`, and writes it into the same
  `Sprites` table slot the renderer already reads.
- **Fallback is per key and automatic.** A key absent from the manifest,
  a PNG that 404s, or a malformed rect simply leaves the procedural
  canvas in place (problems are recorded in `Assets.failed`). The game
  renders on the very first frame either way — images swap in as they
  decode.
- Terrain is pre-baked into a full-map cache at `newGame`; if terrain
  images finish decoding after that bake, `Assets.init()` repaints the
  cache in place.

### Draw API

New render code should draw through the resolver instead of touching the
tables:

```js
Assets.drawSprite(g, key, x, y, opts)   // opts: { w, h, alpha } — true if drawn
Assets.resolve(key)                     // the current drawable (bitmap or canvas)
Assets.isImage(key)                     // did an image replace this key?
```

## Manifest format

```js
window.ASSET_MANIFEST = {
  version: 1,
  atlases: [
    {
      image: 'assets/units.png',           // path relative to index.html
      sprites: {
        'unit/villager/idle/0': { x: 0,  y: 0, w: 32, h: 32 },
        'unit/villager/idle/1': { x: 32, y: 0, w: 32, h: 32 },
      },
    },
    // more atlases; later entries win if a key repeats
  ],
};
```

## Authoring rules

- **Canvas size:** world sprites are 32×32 px (a 16×16 logical grid at
  2 px per cell). Icons are 16×16. Draw at native size — no upscaling;
  the renderer scales with `image-rendering: pixelated` semantics.
- **Palette:** use the master palette ramps in `js/artstyle.js`
  (`ART.PALETTE`) — see `ARTSTYLE.md`. Player accents use the `blue`
  ramp, the rival uses `red`, barbarians use `rust`.
- **Outline:** finished art carries the 1 px dark ink outline
  (procedural sprites get it applied at build time; PNGs must bake it in).
- **Shadow:** ground sprites include the soft drop shadow (see
  `ART.dropShadow`) — it is part of the sprite, not the renderer.
- **Transparency:** true alpha; no matte color.

## Key grammar — full enumeration

Segments join with `/`. Levels are 1-based; frames and variants 0-based.

### `building/<key>/<level>` and `building_a/<key>/<level>`
`building` = player (blue), `building_a` = rival (red). Levels 1–3.
Keys: `tc` `farm` `lodge` `lumber` `quarry` `house` `tower` `siege`
`barracks` `stable` `range` `dock` `wall` `gate`
(the `wall`/`gate` entries here are the build-menu/basic forms — oriented
forms come from the families below).

### `wall/<level>/<mask>`
Auto-tiling wall pieces. Level 1–3, mask 0–15 (bit 1 = neighbor N,
2 = E, 4 = S, 8 = W).

### `gate/<level>/<h|v>`
Gates by orientation: `h` horizontal, `v` vertical. Level 1–3.

### `unit/<kind>/<pose>/<frame>`
Frames are 0–1 (two-frame animation). Poses per kind:

| kinds | poses |
|---|---|
| `villager` `defender` `elite` `defenderA` `axeman` `longbow` `archer` `marksman` `raider` `brute` | `idle` `walk` `gather` `fight` |
| `rider` `horsearcher` `lancer` | `idle` `walk` `fight` |
| `wolf` `boar` `bear` `deer` `cow` | `idle` `walk` `fight` |
| `fishboat` | `idle` `walk` `gather` |
| `warship` `fireship` | `idle` `walk` `fight` |
| `transport` `bigtransport` `siegetower` | `idle` `walk` |
| `catapult` `ballista` | `idle` `walk` `fight` |

`defenderA` is the rival-tinted defender/elite sheet; all other units are
tinted by their team ring at draw time, not by separate sheets.

### `terrain/<name>/<variant>`
Names: `grass` `forest` `water` `hills` `fertile` `camp` `stumps`
`pebbles` `barren` `ruin` `mountain`. Variant indices are 0-based; the
current procedural counts are the minimum to supply (check
`Sprites.terrain[T.<NAME>].length` in the console — e.g. grass has 4,
water 3). `terrain_rare/grass/<0|1>` are the rare flower meadows.

### `icon/<name>`
16×16 HUD icons: `food` `wood` `stone` `gold` `pop`.

### `misc/<name>[/<frame>]`
`misc/construction` — the scaffold shown while any building goes up.
`misc/kraken/0..1` — the kraken's two animation frames.
`misc/fish/0..1` — the jumping shore-fish frames.

## Adding art, step by step

1. Draw your PNG atlas (any packing; rects don't need to align to a grid).
2. Drop it in `assets/`.
3. Add an atlas entry to `assets/manifest.js` mapping each sprite key to
   its rect.
4. Reload. Check `Assets.loaded` (what swapped in) and `Assets.failed`
   (what didn't, and why) in the console.

No build step, no code changes — the manifest is the only wiring.
