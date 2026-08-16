# Ground art

Drop a PNG in here and the map uses it. No code change, no manifest — the
same rule `assets/buildings/` follows.

    grass.png        every grass tile (and the floor under every resource)
    forest.png       every forest tile
    grass-2.png      a second grass variant, -3, -4 … as many as you like

The name is the terrain's own name in lowercase. The full set:

    grass  forest  water  hills  fertile  stumps  pebbles  barren
    ruin   mountain  trench  moat  mound  goldore  camp

## What to author

- **Any size.** 32, 64, 128 — it is scaled to the tile with smoothing off,
  so a 64px tile just carries more detail than the grid.
- **Resource tiles want a TRANSPARENT floor.** forest, hills, fertile,
  stumps, pebbles, goldore and mountain are painted OVER the grass floor, so
  draw the trees/rocks/crop and leave the ground clear. Grass, water, ruin,
  barren, trench, moat, mound and camp are full-tile.
- **One file is enough.** Supply `forest.png` alone and every forest tile
  wears it. Add `-2`/`-3` and the map picks between them by the same tile
  hash the procedural variants use, which is what stops a supplied set
  reading as wallpaper.
- Replacing `grass.png` changes the floor under every resource too — that is
  deliberate, and the only way the two stay seam-free.

Bump `CFG.ART_V` in js/config.js when you re-upload a file under a name it
already had, or the Pages CDN keeps serving the old one. New names don't
need it.
