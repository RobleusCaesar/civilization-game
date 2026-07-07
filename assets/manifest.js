"use strict";
/* Asset manifest — which image files replace which procedural sprites.
   Plain JS (not JSON) so it loads as a classic script tag and works on
   file:// during tests. Grammar and authoring rules: ASSET_SPEC.md.

   Ship the game with an empty `atlases` list and every sprite stays
   procedural. Each atlas maps sprite keys to pixel rects in one PNG. */

window.ASSET_MANIFEST = {
  version: 1,
  atlases: [
    {
      // Town Center L1 — the founding camp on a 2×2 footprint, authored at 4×
      // (256×256, generator in assets/src/) and supersampled down to the
      // 64×64 slot at decode. Both tribes share the camp: faction banners
      // only arrive at L3, per the level design
      image: 'assets/tc-l1.png',
      sprites: {
        'building/tc/1':   { x: 0, y: 0, w: 256, h: 256, dw: 64, dh: 64 },
        'building_a/tc/1': { x: 0, y: 0, w: 256, h: 256, dw: 64, dh: 64 },
      },
    },
  ],
};
