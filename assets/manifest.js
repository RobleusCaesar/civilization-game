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
      // Town Center L1 — authored at 4× (128×128, generator in assets/src/)
      // and supersampled down to the 32×32 slot at decode (dw/dh); the
      // rival's red TC and every other sprite stay procedural for now
      image: 'assets/tc-l1.png',
      sprites: {
        'building/tc/1': { x: 0, y: 0, w: 128, h: 128, dw: 32, dh: 32 },
      },
    },
  ],
};
