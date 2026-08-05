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
      /* Town Center L1 — the founding camp on a 2×2 footprint, authored and
         KEPT at its full 256×256.

         No dw/dh here, deliberately. A sprite's on-screen size never came from
         its slot: render.js blits it with `drawImage(spr, bx, by, bw, bw)`,
         where bw is footprint × CFG.TILE × cam.z. Downscaling to a 64×64 slot
         at decode therefore threw away three quarters of the master and then
         let the camera stretch what was left — at the default zoom (1.5) a 2×2
         hall covers ~96 screen px, so the engine was UPSCALING a 64px bitmap
         to 96. Held at 256 the browser resamples straight from the master to
         whatever the camera asks for, and it only gets sharper as you zoom in
         (see R.blitBld, which turns smoothing on only for this kind of blit).

         Safe because everything downstream sizes itself off the source canvas
         rather than assuming 64: R.darkOf / ruinOf / ashOf / collapseSheet all
         read base.width, and the work-site scaffold overlay is blitted into
         the same world rect rather than composited onto the sprite.

         Both tribes share the camp: faction banners only arrive at L3, per
         the level design */
      image: 'assets/tc-l1.png',
      sprites: {
        'building/tc/1':   { x: 0, y: 0, w: 256, h: 256 },
        'building_a/tc/1': { x: 0, y: 0, w: 256, h: 256 },
      },
    },
    {
      /* Town Center L2 — the timber longhouse. Pre-approved art, wired in
         step 0 of the L2 batch and KEPT when that batch's generated building
         art was reverted: the hall is the one building still served by the
         manifest, everything else falls back to its procedural sprite simply
         by having no entry here. Same 256×256-kept, no-dw/dh convention as L1
         (see the L1 block above for why). Both tribes share one image —
         banners don't arrive until L3. R.SMOKE_AT.tc and R.CAMPFIRE_AT.tc
         carry lv:2 entries for this roofline's ridge and dooryard. */
      image: 'assets/tc-l2.png',
      sprites: {
        'building/tc/2':   { x: 0, y: 0, w: 256, h: 256 },
        'building_a/tc/2': { x: 0, y: 0, w: 256, h: 256 },
      },
    },
    {
      /* Town Center L3 — the drystone great hall: stacked-stone walls, thatch
         roof, stone CHIMNEY, carved totem. Also pre-approved, also kept.
         R.SMOKE_AT.tc's lv:3 entry is measured to the CHIMNEY TOP rather than
         a roof smoke-hole (unlike L1/L2), and R.BANNER_AT.tc's twin lv:3
         poles are measured against this art's own roof slopes. */
      image: 'assets/tc-l3.png',
      sprites: {
        'building/tc/3':   { x: 0, y: 0, w: 256, h: 256 },
        'building_a/tc/3': { x: 0, y: 0, w: 256, h: 256 },
      },
    },
    {
      /* The dooryard campfire — split out of the hut master so a small prop
         can carry its own supersampled detail density instead of sharing the
         hut's downscale math (or being baked in at the hut's own resolution
         and looking soft/blocky next to it). Composited by R.drawCampfire at
         R.CAMPFIRE_AT.tc, same blitBld smoothing-on-downscale treatment as
         the hut. No dw/dh for the same reason the hut has none. */
      image: 'assets/tc-l1-fire.png',
      sprites: {
        'misc/campfireTc': { x: 0, y: 0, w: 180, h: 160 },
      },
    },
    /* ORIGIN CARDS art goes here when it lands — one `ui/card/<cardKey>`
       entry per card (keys and art briefs: ASSET_SPEC.md). Until then the
       draft screen draws placeholder motifs procedurally (Cards.drawMotif). */
  ],
};
