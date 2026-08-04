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
    /* ===== LEVEL 1 BUILDING ART — BATCH v2 (ART_PLAN.md 1.1) =====
       Founding-tier art for every non-TC, non-Wonder building. Authored at
       4× the render size like TC (128 for 1×1, 256 for 2×2), no dw/dh, same
       reason: blitBld turns on smoothing whenever the source outsizes the
       destination, so the browser resamples straight from the master.

       Every key here shares ONE image between `building` (player) and
       `building_a` (rival) — the same trick TC uses, and it generalizes to
       13 of these 14 ordinary keys because their procedural L1 art carries
       no faction color at all (house/farm/lumber/quarry/lodge/tower) or
       none until L3 (range/trade/sapper/dock/siege). `barracks` and
       `warcamp` are the two exceptions that DO fly a faction-colored
       banner at L1 in the procedural version (R.BANNER_AT) — but that cloth
       is drawn procedurally over a POLE position, never baked into the
       sprite, so sharing one image is still correct as long as
       R.BANNER_AT.barracks/.warcamp point at an actual post in the new art
       (re-measured below). `trade` genuinely loses its L1 faction color
       (a striped awning baked into the old procedural sprite) — the brief
       for this batch explicitly asked for no awning at L1, so there is
       nothing left to color; accepted. */
    { image: 'assets/house-l1.png',    sprites: { 'building/house/1':    { x: 0, y: 0, w: 128, h: 128 }, 'building_a/house/1':    { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/farm-l1.png',     sprites: { 'building/farm/1':     { x: 0, y: 0, w: 128, h: 128 }, 'building_a/farm/1':     { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/lumber-l1.png',   sprites: { 'building/lumber/1':   { x: 0, y: 0, w: 128, h: 128 }, 'building_a/lumber/1':   { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/quarry-l1.png',   sprites: { 'building/quarry/1':   { x: 0, y: 0, w: 128, h: 128 }, 'building_a/quarry/1':   { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/lodge-l1.png',    sprites: { 'building/lodge/1':    { x: 0, y: 0, w: 128, h: 128 }, 'building_a/lodge/1':    { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/tower-l1.png',    sprites: { 'building/tower/1':    { x: 0, y: 0, w: 128, h: 128 }, 'building_a/tower/1':    { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/barracks-l1.png', sprites: { 'building/barracks/1': { x: 0, y: 0, w: 256, h: 256 }, 'building_a/barracks/1': { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/range-l1.png',    sprites: { 'building/range/1':    { x: 0, y: 0, w: 256, h: 256 }, 'building_a/range/1':    { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/stable-l1.png',   sprites: { 'building/stable/1':   { x: 0, y: 0, w: 256, h: 256 }, 'building_a/stable/1':   { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/siege-l1.png',    sprites: { 'building/siege/1':    { x: 0, y: 0, w: 256, h: 256 }, 'building_a/siege/1':    { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/sapper-l1.png',   sprites: { 'building/sapper/1':   { x: 0, y: 0, w: 256, h: 256 }, 'building_a/sapper/1':   { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/trade-l1.png',    sprites: { 'building/trade/1':    { x: 0, y: 0, w: 256, h: 256 }, 'building_a/trade/1':    { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/warcamp-l1.png',  sprites: { 'building/warcamp/1':  { x: 0, y: 0, w: 256, h: 256 }, 'building_a/warcamp/1':  { x: 0, y: 0, w: 256, h: 256 } } },
    { image: 'assets/dock-l1.png',     sprites: { 'building/dock/1':     { x: 0, y: 0, w: 256, h: 256 }, 'building_a/dock/1':     { x: 0, y: 0, w: 256, h: 256 } } },

    /* WALL & GATE — the "cheapest possible" L1 pass, deliberately partial.
       Both are auto-tiled from a 16-mask atlas (wallMaskAt: N=1,E=2,S=4,W=8)
       with no runtime rotation — a manifest image lands in exactly the mask
       slot it's assigned and nowhere else. This batch covers only the two
       STRAIGHT masks (E-W = mask 10, N-S = mask 5, the second a 90°-rotated
       copy of the first) and both gate orientations (h = the authored face
       view, v = a 90°-rotated copy) — corners, T-junctions and dead-ends
       stay on the old procedural art until a later pass explicitly covers
       them. Acceptable ONLY because L1 posts have no face/flank asymmetry
       (no door leaf, no depth cue) — do not reuse the rotate-a-copy trick
       for L2/L3 gates, which are genuinely different drawings per axis
       (CLAUDE.md). `building/wall/1` and `building/gate/1` additionally
       carry the build-menu thumbnail (Sprites.building.wall/.gate) — a
       separate slot from the on-map atlas, per ASSET_SPEC.md. */
    { image: 'assets/wall-l1.png',    sprites: { 'building/wall/1': { x: 0, y: 0, w: 128, h: 128 }, 'wall/1/10': { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/wall-l1-ns.png', sprites: { 'wall/1/5': { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/gate-l1.png',    sprites: { 'building/gate/1': { x: 0, y: 0, w: 128, h: 128 }, 'gate/1/h': { x: 0, y: 0, w: 128, h: 128 } } },
    { image: 'assets/gate-l1-v.png',  sprites: { 'gate/1/v': { x: 0, y: 0, w: 128, h: 128 } } },

    /* ORIGIN CARDS art goes here when it lands — one `ui/card/<cardKey>`
       entry per card (keys and art briefs: ASSET_SPEC.md). Until then the
       draft screen draws placeholder motifs procedurally (Cards.drawMotif). */
  ],
};
