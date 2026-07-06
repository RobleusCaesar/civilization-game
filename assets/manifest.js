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
      // placeholder proving the pipeline: the player's Town Center L1 comes
      // from a PNG (baked from the procedural art, so it looks identical);
      // everything else — including the rival's red TC — stays procedural
      image: 'assets/placeholder-tc.png',
      sprites: {
        'building/tc/1': { x: 0, y: 0, w: 32, h: 32 },
      },
    },
  ],
};
