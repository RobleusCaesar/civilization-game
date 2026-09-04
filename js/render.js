"use strict";
/* Canvas renderer: camera, cached terrain layer, fog of war, entities, minimap. */

// grass-floored resources: drawn on a transparent floor over one continuous
// painted grass ground (see drawTile/paintGround) so no seam shows at block edges
/* Terrains whose sprite is authored on a TRANSPARENT floor and therefore needs
   paintGround under it. A tile left out of this set falls to the plain
   drawImage branch in drawTile — and a transparent-floored sprite drawn there
   shows the BARE CACHE CANVAS, which composites as black: exactly the "gold
   seam is mostly black" bug. Sprites.blendCol is the matching declaration of
   what floor each one stands on; the two tables must agree. */
const GROUND_GRAIN = new Set([T.FOREST, T.FERTILE, T.HILLS, T.MOUNTAIN, T.STUMPS, T.PEBBLES, T.GOLDORE, T.CAMP]);
const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
/* ground the decal scatter is allowed to dress. Resource tiles carry their own
   art and are left alone; so is anything dug, flooded, burnt or trampled. */
const DECAL_GROUND = new Set([T.GRASS, T.MOUND]);
/* Part 5 — resources whose deposits should THICKEN toward their heart. Forest
   and ore already do it with whole sprite sets (sparse / medium / full, picked
   by how enclosed a tile is). These three have one set each, so they get the
   same gradient additively: a core tile is enriched with extra scatter of its
   own material, an edge tile is left alone, and the deposit reads as one mass
   thinning outward instead of a uniform block. */
/* FERTILE is deliberately NOT here any more. Its 'crop' tussock was added
   when the forage was a soft dull mound and the core needed a richness cue —
   but the fruit itself carries that cue now (a dense thicket tile bears an
   order of magnitude more fruit than a sparse one), and brown stems painted
   OVER a closed canopy read as mud smeared across the thicket, which is
   exactly the "fades into the background" report that forced the forage
   redesign. Dirt on top of leaves enriches nothing. */
const CORE_SCATTER = { [T.PEBBLES]: 'pebble', [T.GOLDORE]: 'vein' };
/* WHAT MAY GROW WHERE. Open ground carries FLAT, ground-level things only —
   nothing with a trunk or a canopy, because a small green silhouette out in a
   meadow reads as scrub and competes with the real woods for the eye. Foliage
   is an UNDERGROWTH FRINGE and belongs only on a tile that actually touches
   forest. Declared here so tests/land.mjs can hold the runtime to it. */
const DECAL_OPEN = new Set(['tuft', 'tuft2', 'clover', 'flower', 'twig', 'pebble', 'scuff', 'stone']);
const DECAL_FOLIAGE = new Set(['fern', 'leaf']);
/* COLOURS THE GROUND MAY NOT WEAR. The map has a colour LANGUAGE and ground
   texture does not get to speak it: `gold` is the gold seam, the resource bar
   and the +gold float; `fire` is a building burning, which is the only
   unprompted alarm in the game; `berry` is forage worth walking to. A decal
   in one of those ramps is a two-pixel promise the ground cannot keep — the
   meadow was scattered with yellow specks that read as dropped loot, and the
   leaf litter along a treeline read as small fires. Ground decals draw from
   grass / leaf / soil / stone / wood / thatch / bone / hide and the two
   muted blooms, and nothing else. Pinned by tests/land.mjs. */
const DECAL_RESERVED = ['gold', 'fire', 'berry'];

/* ---------------------------------------------------------------------------
   LAND — the tunable constants for how the ground LOOKS. Everything here is
   baked into the terrain cache once and costs the frame loop nothing.

   The whole layer is driven by seeded value noise, so a seed's land is the
   same land on every reload and through every save; nothing reads Math.random
   and nothing reads S.rngState (drawing from the run's own RNG would re-deal
   every roll that came after it — the rule G.rollWonder already follows).

   Dial the look from HERE. TONE_AMP and DECAL_DENSITY are the two that
   actually change the feel; err small on both — the goal is ground with form,
   not camouflage. --------------------------------------------------------- */
const LAND = {
  // --- Part 1: broad tonal variation -------------------------------------
  TONE_STEPS: 5,        // discrete steps. HARD-EDGED — no smooth gradients, or
                        // it stops matching the pixel art beside it
  TONE_AMP: 0.105,      // strongest lightness swing at the extremes
  TONE_OCT: [[0.045, 0.60], [0.115, 0.27], [0.290, 0.13]],  // [freq per tile, weight]
  TONE_SUB: 4,          // tone samples per tile side. >1 IS THE WHOLE POINT — see groundTint
  // --- contextual shade, from neighbours ---------------------------------
  SHADE_FOREST: 0.085,  // full shade under a tile ringed by wood (scaled by count)
  SHADE_ROCK: 0.055,    // beside hills / mountain
  SHADE_SHORE: 0.030,   // the damp band immediately inland from water
  // --- Part 2: decal scatter ---------------------------------------------
  /* DECORATION IS BACKGROUND. The resources are the foreground and the ONLY
     things that may look like objects — anything on open ground that reads as
     a discrete thing competes with them and, worse, makes a player wonder
     whether it blocks. Cut DECAL_DENSITY and raise DECAL_GATE together if the
     ground still looks busy; DECAL_MUTE is what pulls every decal's colour
     back toward the grass it sits on, which is the dial that actually decides
     whether the eye stops on one. --- */
  DECAL_MUTE: 0.42,
  DECAL_MUTE_WET: 0.18,   // a wet shore stone stays a touch crisper than a meadow tuft
  /* THE ONE DIAL for the whole scatter — turn it down to quieten the ground,
     0 to switch decoration off entirely. Depth is meant to come from the TONE
     layer and the shading at forest edges, not from object count; when the
     map looks busy rather than deep, this is the number to cut. */
  DECAL_DENSITY: 0.34,
  DECAL_CLUMP: 0.115,   // clump-field frequency: lower = bigger patches
  DECAL_GATE: 0.66,     // clump value a tile must beat to grow anything at all.
                        // RAISING IT WIDENS THE EMPTY GROUND between patches,
                        // which is what makes the patches read as natural —
                        // most of an open field should carry nothing at all
  DECAL_MAX: 3,         // most decals on one tile
  /* --- Part 2b: WILD GRASS COVER (R.grassCover). The meadow itself, not its
     ornaments: low swards of grass scattered over open ground, baked into the
     terrain cache exactly like the decals. THE SAPLING TRAP IS SOLVED BY
     CLUMP SHAPE, NOT HEIGHT — every silhouette is wider than it is tall, a
     sward lying IN the grass rather than a plant standing on it (the same
     ruling the tuft decals already carry, applied to the whole layer).
     Deliberately NO wind animation: the cache is the whole budget. --- */
  GRASS_DENSITY: 1.0,   // the one dial for the whole cover; 0 switches it off
  GRASS_MACRO_F: 0.030, // the above-tile-scale richness field — patches of
                        // lush and bald ground many tiles wide
  GRASS_GATE: 0.34,     // macro value below which nothing grows at all —
                        // a REAL share of the meadow stays bald, which is
                        // what makes the lush valleys read as valleys
  GRASS_MAX: 7,         // most swards on one wild tile
  GRASS_ACCENT: 0.045,  // chance a wild sward carries a dull seed head
  GRASS_TALL: 1.0,      // how often the tall, splayed silhouettes are picked
                        // (1 = the natural mix; 0 = short only; 2 = all tall)
  GRASS_PARCH: 0.45,    // how strongly the sward bleaches where richness
                        // runs dry — thatch blades along the bald margins
  /* --- taming on build (R.tameMask / startTaming): the ground a standing
     building keeps. DERIVED, NEVER STORED — the mask is a pure function of
     the standing buildings and the land seed, so tile data is bit-identical
     with the feature on or off and a razed building's ground simply grows
     back on the next repaint. --- */
  KEPT_DENSITY: 0.32,   // how much of the wild count a tended tile keeps
  TAME_R: 2,            // tiles of tended ground beyond a building's footprint
  TAME_R_FORT: 1,       // …a wall or gate section keeps only its own verge
  TAME_WOBBLE: 1.5,     // tiles of ragged wander on the tended boundary
  TAME_LOUD: 2.2,       // the flatten's voice (drawTamings): blade count,
                        // throw, arc, drop and slide all scale with it;
                        // 0 silences the debris, 2+ is unmistakable
  KEPT_TINT: 0.14,      // the tended verge's lush green wash (R.hueTint):
                        // alpha at full keptness, fading with the boundary
  KEPT_SOFT: 1.2,       // tiles over which keptness fades from full to none
                        // at the ragged boundary — the verge softens into
                        // the wild instead of stopping at a ring
  /* --- Part 2c: GROUND COLOUR (LAND_REFRESH Phase 2). The tone layer only
     lightens and darkens one green; real meadows vary in HUE. A second, far
     lower-frequency field (R.hueTint) shifts the ground between a warm
     yellow-green and a cool blue-green — two chromatic overlays quantized
     to HUE_STEPS hard steps with a hashed dither at every seam, applied
     AFTER the sward and decal passes so the grass clumps take the meadow's
     hue and sit in the same colour world as the ground under them. Water
     ignores it: it has its own depth. --- */
  HUE_AMP: 0.055,       // alpha of the warm / cool overlay at the extreme steps
  HUE_FREQ: 0.02,       // per tile — meadow-sized patches, many tiles wide
  HUE_STEPS: 3,         // hard steps; the middle one is the untinted ground
  HUE_DITHER: 0.35,     // width of the hashed dither band at a step seam, as
                        // a fraction of one step (0 = a ruled edge)
  MEADOW_WARM: 3,       // flower-meadow residues allowed in the WARMEST hue
                        // step: the plain roll is 1 in 61; 3 = three times
                        // as many where the sun is. 1 switches it off
  SUN_BIAS: 0.2,        // one sun for the whole map (cornerShade): a wood
                        // darkens the ground to its S/E more than to its
                        // N/W — 0.2 is the 60/40 split; 0 is radial
  GRAIN_N: 20,          // felt-grain dots per tile in paintGround (10 was
                        // nearly invisible; 20 ≈ 8% of the tile's cells)
  // --- Part 3: transitions ------------------------------------------------
  EDGE_MAX: 5,          // deepest an edge fringe reaches into a tile, in 1/16ths
  EDGE_FREQ: 1.6,       // how fast a boundary wanders. Sampled in WORLD space so
                        // both sides of a seam agree — see terrainEdges
  // --- Part 4: shorelines -------------------------------------------------
  SAND_MIN: 0,          // beach width in 1/16ths — noise rides between these, and
  SAND_MAX: 5,          // MIN 0 is what lets a shore pinch out to bare rock
  SAND_FREQ: 0.30,     // how fast the beach width wanders along a shore
  FOAM_FREQ: 0.42,
  /* --- shoreline region tracing. SHORE_SMOOTH is the dial that decides
     whether a coast reads as a curve or as a staircase: it is corner-cutting
     at a scale LARGER than a tile, so raising it sweeps harder and lowering
     it lets the tile steps back through. SHORE_NOISE puts the ragged back
     afterwards — drop it to zero and the coast becomes a clean vector arc,
     which reads as synthetic. You need both. --- */
  SHORE_SMOOTH: 4,      // Chaikin iterations over the TILE lattice
  SHORE_NOISE: 0.16,    // tiles of ragged displacement after smoothing
  SHORE_NOISE_F: 2.6,   // how fine that raggedness is
  /* …and the two caps that keep a SMALL body of water from tearing itself
     apart. Both are fractions of the loop's own radius: a band is an offset
     of the shore curve, and an offset larger than the radius inverts through
     the centre and sprays outward. Lower BAND_CAP if a pond's shelf still
     looks like a wash rather than a rim; lower SHORE_NOISE_CAP if a small
     pond's outline looks knotted. Neither has any effect on an ordinary
     coast, where the radius is many tiles. */
  SHORE_NOISE_CAP: 0.30,
  BAND_CAP: 0.55,
  BAND_PINCH: 0.12,     // what a collapsed band keeps, so its two rings never touch
  WATER_DIRTY_R: 3,     // tiles of repaint around water that appeared or vanished
  /* HOW MUCH OF A WATER/HILLS REPAINT IS PAID IN THE FRAME THAT ASKED FOR IT
     (R.tickRepaint). A sapper's spadeful that joins a lake makes a NEW traced
     loop, and the roughening is sampled along it, so the drawn shore can move
     a few pixels anywhere on that lake — which is why the whole region is
     repainted and not a radius (see waterDirty). On a big lake that is ~2,500
     tiles: measured at 300ms per dug tile on a desktop, and a trench is a LINE
     of dug tiles, which is the reported freeze ("it always happens with the
     sapper"). So the near work is done at once and the far tail is spread over
     the following frames, exactly as the startup bake is (R.tickBake). */
  REPAINT_NOW: 260,     // tiles repainted immediately; beyond this the tail is queued
  REPAINT_CHUNK: 48,    // tiles per slice while draining
  SHORE_MAXPTS: 9000,   // per-loop cap, so a vast lake stops subdividing
  /* THE SHELF IS MEASURED FROM THE TRACED CURVE, never from the tile grid.
     Stacked translucent bands offset into the water: each adds its own alpha,
     so the water pales continuously toward the shore instead of stepping at a
     tile edge. SHELF_REACH is how far out the shallows go (1/16ths of a tile);
     raise SHELF_STEPS if the ladder is visible as rings, lower SHELF_ALPHA if
     the shallows read as milky. */
  /* 8 × 0.055 rather than 5 × 0.085 (a reported screenshot: "messy water…
     fake"): the coarser ladder showed each step as a scalloped RING arcing
     along every shore — exactly the failure the note above predicts. Total
     shallowing is nearly unchanged (0.44 vs 0.425); the steps are just too
     small to see individually. */
  SHELF_STEPS: 8,
  SHELF_REACH: 11,
  SHELF_ALPHA: 0.055,
  FOAM_W: 1.3,          // the wet lip right at the waterline, in 1/16ths
  SHOAL_BLEND: 6,       // points of running average across a rock/sand changeover
  SHOAL_W: 1.9,         // wet-rock band where a stony coast meets the water
  SHOAL_ALPHA: 0.40,    // …kept low: at 0.85 it reads as an inked outline
  SHOAL_STEP: 2,        // stone scatter stride along a rocky run
  SHOAL_STONES: 0.5,    // peak chance of a stone at each of those, inside a drift
  /* WHAT KEEPS THE STONES OFF A NECKLACE. A fixed stride and a flat chance
     thread beads along the curve at even spacing. SHOAL_FREQ is how fast the
     density field varies ALONG a shore (period is 1/f tiles — too low and the
     rate is constant over a whole bay, which is the bead string) and
     SHOAL_GATE is how much of the run it silences outright. Raise the gate if
     the coast looks cobbled end to end; lower the frequency if the drifts
     start looking like regular clumps of their own. */
  SHOAL_FREQ: 0.55,
  SHOAL_GATE: 0.5,
  SHOAL_THROW: 11,      // 1/16ths of spread either side of the waterline
  /* LIFE IN THE ROCKY SHALLOWS — kelp, coral heads, drowned boulders. Drawn
     BEFORE the shelf so the shallow water washes over them. Sparse on
     purpose: the shallows are background. Raise LIFE_CHANCE if a rocky
     coast looks barren, raise LIFE_GATE if the growth reads as an even
     sprinkle rather than beds, and LIFE_REACH is how far out it grows. */
  LIFE_CHANCE: 0.52,
  LIFE_GATE: 0.45,
  LIFE_REACH: 7,
  /* how hard the underwater life is pulled toward the WATER's own colour.
     At the shore stones' gentle 0.18 mute — and mixed toward GRASS, the
     wrong medium entirely — a kelp bed was a near-black smudge floating on
     the blue, which is what read as dirt in a reported screenshot. Muted
     hard toward the water body it reads as a shape UNDER the surface. */
  LIFE_MUTE: 0.55,
  /* --- Part 4b: THE DEEP RAMP (the Water & Shoreline Overhaul, Part 0 —
     R.waterDepth, paintWater). The body of the water is painted in
     DEEP_STEPS HARD STEPS of ART.PALETTE.deep — a shore-to-heart ramp of
     fourteen palette colours: sand showing through at the waterline, clear
     turquoise, teal, the old body blue, steel, navy — read from a baked
     distance-to-land field: a chamfer distance over the wet tiles (near-
     round contours, not the squares an 8-neighbour count draws around
     every land corner), capped at DEPTH_CAP tiles, held in one Uint8Array
     of sixteenths. Each tile samples it bilinearly per sub-cell and pushes
     the answer about with the same world-space noise the rock fields use
     (the ROCK_WANDER trick), so NO STEP EDGE CAN FOLLOW THE TILE GRID;
     every seam takes a hashed stipple DEPTH_DITHER tiles either side of
     the contour. Many steps and dither, never a gradient — ARTSTYLE rule 5
     as amended. (The four-band basin of LAND_REFRESH Phase 1 read as four
     flat colours; this is what replaced it.)

     THE STEPS ARE FITTED TO THE WATER THE MAP HAS. The shore steps are
     absolute — DEEP_SHORE_STEP tiles apart out to DEEP_SHORE_END, so even a
     pond three tiles across shows three or four of them — and the deep
     steps are spread evenly from there to DEEP_TOP_K of the map's own
     deepest tile. Never per region (a pond is not a basin), but per MAP:
     measured, the field tops out at 4–6 tiles on a lake map and at the cap
     on a sea map, so a fixed deep ramp either never reached the heart or
     flattened a sea into one navy; fitted, the heart appears in the largest
     body at every map size. Below DEEP_TOP_MIN the map's biggest water is
     a pond and the heart stays away. DEPTH_AMP mixes the whole ramp toward
     the old body blue (0 is byte-for-byte the flat water of before);
     DEEP_SAT and DEEP_LIFT are the bench's pull-back knobs on the colours
     themselves, identity at their defaults so what ships is the palette.
     Swell crests and glints pick a step-local lighter shade. The traced
     shelf, foam, beach, shoals and kelp are untouched and lie on top. A
     MOAT is pinned to the shore step: a dug channel is one flat shallow
     cut that meets the lake's own rim with no seam. --- */
  DEEP_STEPS: 16,       // steps in the ramp — ART.PALETTE.deep's length, for the record
  DEEP_SHORE_STEP: 0.25,// tiles between the absolute shore steps…
  DEEP_SHORE_END: 2.0,  // …out to here, where the fitted deep steps take over
  DEEP_TOP_K: 0.92,     // the last edge sits at this share of the map's deepest tile
  DEEP_TOP_MIN: 4.0,    // …but never nearer than this: a map of ponds shows no heart
  DEEP_SAT: 1,          // saturation of every step (1 = the palette; bench pull-back)
  DEEP_LIFT: 0,         // lightness nudge of every step, -1..1 (0 = the palette)
  DEPTH_WANDER: 0.3,    // tiles the drawn contour may leave the true one
  DEPTH_WANDER_F: 0.9,  // …how fast that wander turns, per tile
  DEPTH_AMP: 1,         // 0 = the old flat body; 1 = the full deep ramp
  DEPTH_DITHER: 0.05,   // half-width of the stippled seam, in tiles — a cell or
                        // so either side of the contour; wider fragments every
                        // shore step into single-cell rects and costs the edit gate
  DEPTH_SUB: 8,         // samples per tile side (4px cells at 32px)
  DEPTH_CAP: 15,        // tiles at which the field stops deepening (sea maps reach it)
  WATER_WHISPER: 0,     // the old tonal whisper over the ramp, as a share of its
                        // alpha (0 = off: it read as smudges; the flat body keeps it)
  /* --- Part 4b″: THE BATHYMETRY (R.waterDepth). Distance-to-land alone
     gives every shoreline the same shelf, so a map at min zoom wears a
     uniform ring around every body — the symptom that the water has no
     landform of its own. The distance is therefore WARPED by two seeded
     world-space fields before the steps are cut from it: a LOW-frequency
     one (SLOPE_FREQ, period ~1/f tiles) that scales the SLOPE, so one
     coast shelves gently far out and the next drops off within a tile,
     and a MID-frequency one (BAR_FREQ) that ADDS depth, putting bars and
     tongues in open water and pockets near the shore. Both fade in over
     SLOPE_HOLD tiles from the waterline and land-adjacent water is capped
     inside the shore steps, so a beach still reads as a beach whatever
     the fields say. Seeded from the map seed and sampled in world space:
     deterministic, bake-only, and re-derived with the field whenever the
     water changes.

     BOTH ARE OFF IN PRODUCTION. The warp read as blotches rather than as an
     underwater landform, and the size-aware banding below turned out to be
     the honest way to stop every body shelving alike. The dials stay for
     later experiments — turn either one up in the bench and the field warps
     again — but what ships is the plain distance. --- */
  SLOPE_VAR: 0,         // ± share by which the slope is scaled (0 = even everywhere)
  SLOPE_FREQ: 0.07,     // per tile — a coast keeps its character for ~14 tiles
  BAR_AMP: 0,           // tiles of bar and pocket added on top…
  BAR_FREQ: 0.16,       // …at this frequency: bars a few tiles across
  SLOPE_HOLD: 1.5,      // tiles over which both fields fade in from the waterline
  /* …and THE BANDING SCALES TO THE BODY. The step edges are absolute tiles,
     so a pond three tiles across never left the two palest steps while a
     sea ran the whole ramp — every body wearing the same shelf at the same
     rate is what put a uniform ring on the map. Each region's own deepest
     point now compresses its ramp: a body at least POND_BAND tiles deep
     keeps the full run exactly as before, and anything shallower has its
     depth stretched across the ramp in proportion, so the reef band
     tightens to a fraction of a tile and the pond's middle still reaches
     the ramp's midpoint. The cap that keeps land-adjacent water inside the
     shore steps is untouched — a beach still reads as a beach, it just
     gets narrow on a small body. 0 switches the scaling off. --- */
  POND_BAND: 5,         // tiles of depth a body needs to keep the full ramp
  DEEP_ALT: 0,          // which pale anchor: 0 = ART.PALETTE.deep (bluer, THE
                        // PICK), 1 = deepAlt (tealer) — kept for the bench
  /* --- THE FADE (ARTSTYLE rule 5 as amended twice: water depth is the one
     sanctioned continuous-shading surface). How the body shades BETWEEN
     the ramp's sixteen steps. The interpolation runs on the FIELD — every
     sub-cell's own depth maps to a position along the ramp — so a tile
     edge means nothing to it; a tile-locked gradient would only have
     softened the grid instead of removing it. Smooth mode reads a
     256-entry OKLab LUT baked once per colour change (_deepCols), so the
     bake pays an array lookup per cell and never colourspace math; dither
     mode keeps every pixel on a ramp colour and spreads an 8×8 ordered
     dither across the FULL width of each transition instead of the 1px
     stippled seam. Crest and glint lifts stay counted in steps — the
     steps are equal ΔL by construction, so a step of lift IS the
     equivalent ΔL lift in every mode. --- */
  WATER_FADE: 2,        // 0 = hard steps, stippled seams; 1 = the wide dither;
                        // 2 = the continuous OKLab fade — THE SHIPPED MODE:
                        // the referee picked smooth on the three-way blind
  /* …and every GAMEPLAY SHOAL rides its own sandbar. A shoal is shore
     water where fish school close enough to line-fish from land
     (MapGen.shoal — a hash of the tile, unmoved by anything here); it
     used to look like any other shore tile, and the pale patches players
     took for shoals were in fact the swell. Each one now shallows the
     water around it by SHOAL_BAR tiles over SHOAL_BAR_R, ragged rather
     than round, so it reads as a bar rising toward the surface and the
     fishing spot is legible from the map. Visual only. --- */
  SHOAL_BAR: 0.9,       // tiles of shallowing at a shoal's own cell
  SHOAL_BAR_R: 2.4,     // tiles the bar reaches out into the water
  /* --- the SWELL, which is what those pale blobs in open water were:
     three long sine waves whose interference peaks paint every pixel of a
     rounded region a shade lighter, and at the old gate that region was
     several tiles across. SWELL_GATE raises the bar so only the crest
     line itself catches the light, and the lift is now counted in RAMP
     STEPS — one step for a crest, two for a glint — so a swell can never
     again be a patch of a different colour. --- */
  SWELL_GATE: 2.45,     // sine sum a pixel must beat to catch the light
  SWELL_LIFT: 1,        // ramp steps a crest pixel is lifted…
  GLINT_LIFT: 2,        // …and a pinpoint glint
  /* --- Part 4b′: THE SHORE SHADOW AND THE LIT LIP (Overhaul 2.3). The
     single biggest reason a top-down lake reads as having BANKS: the water
     is darker where it meets them. A darker band SHORE_SHADOW_W tiles wide
     on the water side of every shoreline, its edge riding the same wander
     noise as the steps and quantized to SHORE_SHADOW_STEPS dithered levels
     — dark at the waterline, thinning outward — drawn over the ramp in
     paintWater. SHORE_SHADOW_SUN leans it toward the banks the sun would
     actually throw a shadow from (north and west, light being top-left):
     0 is every shoreline, as specified; 1 is only those. And, behind its
     own dial, a one-pixel LIT LIP on the land side of the shores that face
     the sun — the bank's catch-light — drawn in the shore layer. --- */
  SHORE_SHADOW: 0,      // alpha of the band at the waterline; 0 switches it off.
                        // OFF by default: it cut the bright shallows off from
                        // the beach, so a shallow tongue off a headland read as
                        // a detached blob. The bathymetry above does the same
                        // job — "this water has a floor" — without the cut
  SHORE_SHADOW_W: 1.0,  // tiles it reaches out from the shore
  SHORE_SHADOW_STEPS: 3,// dithered levels between the waterline and its outer edge
  SHORE_SHADOW_SUN: 0,  // 0 = every shoreline; 1 = only banks to the north and west
  SHORE_LIP: 0,         // alpha of the lit lip on the sun-facing land side; 0 = off (A/B)
  SHORE_LIP_W: 1.2,     // its width in 1/16ths of a tile
  /* --- Part 4c: LIVING WATER (LAND_REFRESH 1b–1d — R.drawLivingWater).
     FRAME work, viewport only, and every piece of it a dial that turns to
     0. The shoreline follows the FISH MODEL — a quiet always-on layer and
     a rare placed event, never ambience everywhere: the BASE WATERLINE is
     the traced point-line back at low alpha (parallel to the shore by
     construction, dashes creeping, alpha breathing — felt, not watched),
     and a WAVE ROLL is an authored crest that breaks on one beach stretch
     every WAVE_EVERY seconds, its long axis laid along the local shore
     tangent and its motion along the shore normal. A FISH JUMPS the same
     way: an arc FISH_RISE px high over FISH_TIME seconds up and the same
     down, a squashed frame at the peak, the ripple ring and droplets on
     re-entry — on exactly the tiles and cycles the old gating chose. At
     GOLDEN HOUR the drifting sparkle brightens by SPARKLE_GOLD. --- */
  TREE_MUTE: 0.5,       // the authored-tree mute (0 raw … 1 strong): OKLab
                        // lightness/chroma down + hue toward the world greens,
                        // re-quantized to the leaf ramp at install (assets.js)
  FOAM_MINZ: 1.0,       // below this zoom the waterline AND the waves stand down
  FOAM_LINE: 0.3,       // alpha of the resting waterline dashes; 0 off
  FOAM_PULSE: 0.3,      // how much of that alpha breathes
  FOAM_SPEED: 1.5,      // px per second the dashes creep along the shore
  WAVE_ALPHA: 0.75,     // alpha of the rolling wave crest at its peak; 0 off
  WAVE_EVERY: 14,       // seconds between rolls somewhere on the visible shore
  WAVE_TIME: 2.8,       // seconds one roll lives, one pass through its frames
  WAVE_PUSH: 2.5,       // px the crest translates landward before receding
  /* --- the MOTION PASS (authored art, assets/terrain/water/): the
     scrolling surface and shimmer textures and the wave-roll crests, all
     frame-time and viewport-only. Absent art leaves the water exactly as
     the bake painted it (the base waterline above is procedural and needs
     no art).

     WHAT SHIPS ON BY DEFAULT, AND WHY. The budget is 0.4ms for the whole
     living-water pass on the water-heavy view, raster included, on the
     forced-flush harness — and that harness is SOFTWARE raster, which
     prices a full-water-area composite at ~0.37ms per layer however low
     its alpha (the area is the cost; a phone GPU composites the same
     layer for close to nothing, but the honest instrument we have is the
     CPU one). So the texture layers ship at 0 and are one dial away; the
     default motion is the base waterline plus the wave events, which are
     two or three small sprites at most and fit with room to spare. --- */
  SURF_ALPHA: 0,        // opacity of the scrolling surface arcs; 0.16 is the
                        // authored look — OFF by default: see the note above
  SURF_SPEED: 3.5,      // px per second along its diagonal
  SURF_MINZ: 0.75,      // below this zoom the surface stands down (the bake carries it)
  SHIM_ALPHA: 0,        // opacity of the glint layer; 0.5 is the authored look
  SHIM_SPEED: 5.5,      // px per second, a different heading — never in sync
  SHIM_MINZ: 1.0,       // the shimmer is the first LOD casualty too
  FISH_RISE: 6,         // px a jumping fish clears the water
  FISH_TIME: 0.4,       // seconds up (and the same down); 0 = the old flat flash
  FISH_SIZE: 0.5,       // tiles across, for an AUTHORED fish (assets/fx/fish-N.png).
                        // The strips ship at 16px, so 0.5 draws them 1:1 — keep
                        // this on halves of a tile or the pixels go soft
  /* --- ONE FISH AT A TIME. Every eligible tile used to run the same 2.4s
     clock, so thirty fish leapt in lockstep — sillier than no fish at all.
     The map now shows ONE leap every FISH_EVERY seconds, on a tile chosen
     from the water that is actually worth fishing (a MapGen.shoal whose
     stock is at least FISH_STOCK of the best shoal's), rotating through
     them so the same spot never repeats. Every other stretch of water gets
     the ripple below instead — the surface still moves everywhere, but
     only the good fishing announces itself. --- */
  FISH_EVERY: 30,       // seconds between leaps, for the whole map
  FISH_STOCK: 0.5,      // share of the richest shoal's stock a spot must hold
  /* …and the quiet surface: a slow expanding ring on a hash-chosen share of
     the water, each tile on its own staggered clock, so the lake breathes
     without anything leaping out of it. */
  RIPPLE: 0.20,         // alpha of the ring at its birth; 0 switches it off
  RIPPLE_GATE: 5,       // one water tile in this many ever ripples
  RIPPLE_EVERY: 7,      // seconds between one tile's own rings
  RIPPLE_LEN: 1.5,      // seconds a ring takes to open and fade
  SPARKLE_GOLD: 1.5,    // sparkle alpha at the warm peak of the dusk cycle, × normal
  /* --- HILLS ARE RAISED GROUND, and must stay clearly less than a mountain.
     They are read at their EDGES: hillRelief draws the catch-light along the
     northern rim, hillShadow the cast shadow on the ground to the south, and
     nothing shades the middle (see hillRelief for why that was tried three
     ways and abandoned). The shadow is the strongest cue by a distance —
     raise HILL_SHADOW / HILL_SHADOW_MAX if hills still read flat, lower them
     if a hill starts looking like a mountain. WOBBLE is how much both edges
     wander; drop it to 0 and they become ruled lines. --- */
  HILL_RIM_MAX: 3,      // 1/32nds — how deep the northern catch-light reaches
  HILL_RIM: 0.11,
  HILL_SHADOW: 0.32,
  HILL_SHADOW_MAX: 9,   // 1/32nds of a tile, so the shadow never leaves the tile below
  HILL_SHADOW_WOBBLE: 3.1,
  /* --- THE SHARED "BLOCKED" CUE (R.blockShade). Darker ground under every
     terrain a land unit cannot cross, dithered so its edge is organic. Raise
     BLOCK_SHADE if impassable ground still does not announce itself, lower it
     if the map starts looking blotchy; BLOCK_FADE is how fast it thins toward
     the sides that face open ground (0 = a hard tile-shaped patch, which is
     what this exists to avoid). --- */
  BLOCK_SHADE: 0.16,
  BLOCK_FADE: 1.15,
  BLOCK_SUB: 6,
  /* --- THE ROCK MASS (R.rockMass). A stone field is scattered in WORLD
     space, not stamped per tile: the lattice ignores the tile grid, so a
     boulder straddling a boundary is ONE whole rock spilling into its
     neighbour instead of two halves cut to match. That is what breaks the
     grid, and it is why the old per-tile sets are gone.

     ROCK_STEP is the lattice pitch in 1/32nds of a tile and is the one dial
     for density — it must stay WELL BELOW the diameter of the rocks it
     places (2 x ROCK_MIN at the very least) or bare grass starts showing
     through the core, which is the whole thing this exists to prevent.
     ROCK_JIT knocks the lattice off square; drop it to 0 and the mass reads
     as a bead curtain.

     Size comes from how deep into the deposit the rock stands (the hill
     distance field): ROCK_MIN at the fringe growing by ROCK_GROW per tile of
     depth up to ROCK_MAX at the core — big overlapping boulders in the
     middle, mid rocks in the ring, small stones at the edge.

     THE OUTLINE IS THE SHORELINE'S TRICK. The depth field is sampled
     bilinearly (so the boundary is already off the grid) and then displaced
     by world-space noise: ROCK_WANDER is how far in TILES the drawn edge may
     leave the tile edge, ROCK_EDGE_F how fast it wanders. Raise WANDER and
     the outline gets wilder, but keep it well under 0.5 — a big rock landing
     on genuinely walkable grass is a lie about where a unit may go, which is
     why only the small stuff is allowed past the line at all (ROCK_FRINGE
     thins the last band, and SCREE puts loose chips on the ground beyond
     it). --- */
  ROCK_STEP: 12,
  ROCK_JIT: 3.4,
  ROCK_MIN: 8,
  ROCK_MAX: 14,
  ROCK_GROW: 3.2,
  ROCK_WANDER: 0.26,
  ROCK_EDGE_F: 0.85,
  ROCK_FRINGE: 0.82,     // coverage below which rocks start dropping out
  ROCK_SCREE: 0.34,     // chance of a loose chip on the ground just outside
  DENSE_WANDER: 2.2,    // …and how far the woods'/orchards' own density step wanders
};

/* ================= MOUNTAIN =================
   Every dial for the mountain rewrite. See R.mtnRegions for the architecture;
   the short version is that a mountain is one OBJECT with a traced outline and
   an internal height field, not a grid of tiles. */
const MTN = {
  /* SIZE CLASSES, in cells. A single tile straining to look like a mountain
     is a large part of why this has failed before, so the small classes are
     drawn as what they are. Raise CLS_MOUNTAIN if too much of the map is
     getting the full treatment. */
  CLS_OUTCROP: 2,        // <=  2 cells: a boulder cluster — no peak, no cliff
  CLS_CRAG: 8,           // <=  8 cells: a rocky crag — modest cliff, one high point
  CLS_MOUNTAIN: 25,      // <= 25 cells: a mountain — a peak and a real cliff
  //  above that: a RANGE — several peaks at varied heights along the ridge

  /* THE SILHOUETTE. OUTLINE_JITTER pushes the traced corners off the tile
     lattice; FRACTURE_* then subdivide, displacing each midpoint along the
     segment NORMAL, until nothing is longer than SEG_MAX. Raise FRACTURE_AMP
     for a wilder edge, lower SEG_MAX for finer teeth — but keep SEG_MAX under
     1, or the jaggedness lands at tile scale and draws the grid it is there
     to hide. Nothing here is smoothed: corner-cutting is right for a coast
     and is exactly what turns rock into soft rolling hills. */
  OUTLINE_JITTER: 0.24,  // tiles
  SEG_MAX: 0.55,         // tiles — subdivide until every segment is shorter
  FRACTURE_LEVELS: 4,
  FRACTURE_AMP: 0.26,    // fraction of the segment's own length, at the first level
  FRACTURE_DECAY: 0.82,
  FRACTURE_CAP: 0.85,     // tiles — the longest a single displacement may reach
  FRACTURE_SKEW: 0.5,    // how far off centre a break may fall (0 = midpoints)

  /* THE INTERIOR. STEPS hard values off the `crag` ramp, never a gradient.
     RISE is how much the height field brightens the rock, LIGHT how hard the
     surface gradient is lit from the upper left, RIM how much the outline
     darkens. If a range reads flat, RISE and LIGHT are the two to raise —
     the old painter's narrow value band is what made it a grey blob. */
  STEPS: 7,
  BASE: 0.46,
  RISE: 0.30,
  LIGHT: 0.34,           // each facet's own tilt
  MACRO: 0.50,           // the massif's broad form, from the height field
  LIGHT_REACH: 5,        // px the macro gradient is measured over
  RIM: 0.30,
  CREASE: 0.055,         // tiles — how wide the dark line between two faces is
  CREASE_DARK: 0.19,
  DEPTH_FULL: 0.85,      // fraction of the region's own max depth that reads as "full height"

  /* THE FACETS — flat faces meeting at creases, not noise. FACET_CELL is the
     face size in TILES (bigger = broader planes), FACET_AMP how much each
     face's own base height varies, FACET_TILT how steeply each is tilted (the
     tilt is what gives one face a lit read and its neighbour a shadowed one).
     GRAIN_* is a single fine octave over the lot and must stay small — the
     moment it competes with the facets the mass goes back to being noise. */
  FACET_CELL: 0.62,      // tiles
  FACET_AMP: 0.7,
  FACET_TILT: 1.1,
  GRAIN_F: 3.1,
  GRAIN_AMP: 0.16,

  /* THE LIFT (phase 3) — the extrusion that fakes height in top-down. Every
     column of the plateau draws shifted north by E and the gap down to the
     true south boundary is filled with a vertical FACE; E is what the eye
     reads as elevation. NORMALIZED PER REGION, never raw depth: each region
     spends the LIFT band on its own depth range, so a thin depth-2 ridge
     still gets a real face (LIFT_MIN is the floor that guarantees it) and a
     massif towers over it. Raise LIFT_MAX if big ranges still read low,
     LIFT_MIN if thin ridges read as ledges; SHADOW_K/SHADOW_A are the cast
     shadow's reach and weight on the ground below the face. */
  LIFT_MIN: 0.6,         // tiles — the floor: even a wall gets a real cliff
  LIFT_MAX: 1.55,        // tiles — what a region's deepest column earns
  LIFT_GAMMA: 1.25,      // how fast the lift climbs with normalized depth
  PEAK_LIFT: 0.85,       // tiles of extra lift at a summit, before its own roll
  SHADOW_K: 0.5,         // shadow length as a fraction of the face height
  SHADOW_A: 0.45,        // its peak opacity (kept under 0.5 — it is a shadow)
  MERGE_GAP: 10,         // px — a notch narrower than this is a crevice, not a cliff
  SNOW: 1,               // pale caps on the highest tops (0 switches them off)
  SNOW_MIND: 3,          // …only for regions at least this deep
  SNOW_ABOVE: 0.86,      // …and only above this normalized height
  /* ROOM TO OVERHANG. The art leaves its footprint — NORTH most of all,
     because that is where the extrusion lifts it (PAD_UP must clear
     LIFT_MAX + PEAK_LIFT). Gameplay is unaffected; the face's foot sits on
     the true south boundary, which is what keeps the picture honest. */
  PAD_UP: 3,             // tiles
  PAD_SIDE: 1,
  PAD_DOWN: 2,
  /* ---- THE DRAWN KIT (the chosen path: art, never a procedure) ----
     A region is dressed by CHAINING drawn massifs along its own southern
     edge, west to east, each overlapping the last so their flanks — which
     the art deliberately ends part-way up the slope — merge into one
     continuous crest with a saddle at every join. KIT_OVERLAP is that
     overlap as a share of a piece's width: under about a third the joins
     read as separate mountains, over about a half the summits crowd.
     RANK_STEP sets how far north the next rank sits on a deep region, so a
     massif has depth instead of being one row of cardboard. */
  KIT: 1,                // 0 stands the drawn kit down; the extrusion returns
  KIT_OVERLAP: 0.34,
  KIT_RANK_STEP: 3,      // tiles between peak ranks (bands stay touching)
  KIT_RANK_MAX: 3,
  KIT_SADDLE_EVERY: 0.42,// share of chain slots that take a low link
  /* HOW MANY SUMMITS ONE REGION MAY CARRY. Strung past about this many the
     range stops reading as a range and starts reading as wallpaper; the
     rest of the footprint is carried by the low bands instead. 0 = no cap. */
  KIT_MAX_PEAKS: 6,
  KIT_LOW: 1,            // 0 drops the rolling/foothill bands entirely
  KIT_PAD_UP: 10,         // tiles of northward headroom a drawn peak may use
  KIT_TEAR: 16,           // px of the piece's own left/right/bottom edge torn away
  KIT_COVER_MIN: 0.5,    // share of a tile the rock must hide before a unit on it is ghosted
  KIT_SHORE_GAP: 1,      // tiles of grass kept between the art and any water
  KIT_SHADOW: 10,        // px of ground shadow cast south of a piece's foot
  KIT_SHADOW_A: 0.42,
  KIT_EDGE_TREES: 0.55,  // share of 2x2 apron patches that carry a stand
  KIT_EDGE_CLUMP: 5,     // trees per wooded apron tile, on top of a floor of 2
  KIT_EDGE_BAND: 14,     // px band inside the apron tile the stand plants in
  KIT_EDGE_REACH: 2,     // tiles out from a piece's ground contact the apron covers
  KIT_EDGE_ROCK: 0.25,   // share of a tile the art must cover for it to count as rock
  OUTCROP_N: 4,          // boulders per cell of a 1-2 cell outcrop
  OUTCROP_MIN: 10,
  OUTCROP_MAX: 14,
  MIN_PIECE: 260,        // px — anything smaller adrift from the body is a crumb
  CONTACT: 2,            // px of the dark line at the TRUE tile boundary (north side)
  OUT_MAX: 0.22,         // tiles the silhouette may bulge past its own footprint
  THIN_DEPTH: 2.2,       // depth (tiles) at which the edge gets its full teeth
  THIN_FLOOR: 0.18,      // …and the share of them a one-tile arm still keeps
};

const R = {
  cv: null, g: null,
  mini: null, mg: null,
  cam: { x: 0, y: 0, z: 1.5 },   // world px offset + zoom
  dpr: 1,
  bottomReserve: 0,              // measured open build-menu bar height (CSS px) to keep clear at the bottom
  topReserve: 0,                 // measured top status-bar height (CSS px) so the map's top edge never hides behind it
  terrainCache: null,
  shoreLayer: null,
  fogCv: null, fogG: null, fogDirty: true,
  floats: [],                    // {x,y,txt,col,t}
  particles: [],                 // transient impact debris/fire/smoke {x,y,vx,vy,t,life,col,sz,g}
  miniT: 0,

  init() {
    this.cv = document.getElementById('c');
    this.g = this.cv.getContext('2d');
    this.mini = document.getElementById('mini');
    this.mg = this.mini.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    // the measured-viewport fit (index.html's boot block) re-pins the page
    // height and announces it — the canvas must follow the same measurement
    window.addEventListener('cf-fit', () => this.resize());
    this.resize();
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    /* SIZE FROM THE PAGE BOX, NOT THE WINDOW (the bottom-band report): the
       boot block pins html/body to the MEASURED fixed-position viewport —
       the box a `position:fixed; inset:0` element actually gets, which is
       the one geometry proven to reach the screen's true bottom edge on
       iOS (the splash uses it). innerHeight disagreed with it on device,
       and a canvas sized from innerHeight inside a taller body stretches. */
    const w = document.documentElement.clientWidth || innerWidth;
    const h = document.documentElement.clientHeight || innerHeight;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
  },

  // a loose V of little seagull "M" silhouettes, wings flapping out of phase
  _drawFlock(g, a, ax, ay) {
    g.fillStyle = ART.PALETTE.ink[1];
    for (let k = 0; k < a.n; k++) {
      const bx = ax - a.dir * k * 4.5, by = ay + (k ? ((k & 1) ? 1 : -1) * ((k + 1) >> 1) * 3 : 0) - k * 1.2;
      const flap = Math.sin(a.t * 9 + k * 1.3) > 0 ? 1.4 : 0;
      g.fillRect(bx - 2.6, by - flap, 2.6, 1.4);
      g.fillRect(bx + 0.5, by - flap, 2.6, 1.4);
      g.fillRect(bx - 0.4, by + 0.4, 1, 1);   // body
    }
  },
  // a tiny characterful animal, mirrored by facing; hops when it wanders
  _drawCritter(g, a, ax, ay) {
    const P = ART.PALETTE, f = a.face || 1;
    const hop = a.state === 'wander' ? Math.max(0, Math.sin((a.t + a.ph) * 7)) * 2
      : a.state === 'flee' ? 1.2 : 0;
    const y = ay - hop;
    const px = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(ax + f * dx - (f < 0 ? w : 0), y + dy, w, h); };
    if (a.sub === 'rabbit') {
      px(-2, 0, 4, 3, P.bone[1]);            // body
      px(1, -2, 2, 3, P.bone[2]);            // head/haunch
      px(0, -4, 1, 3, P.bone[1]); px(2, -4, 1, 3, P.bone[1]);   // ears
      px(-3, -1, 1, 1, P.bone[2]);           // white tail puff
      px(2, -1, 1, 1, P.ink[0]);             // eye
    } else if (a.sub === 'fox') {
      px(-3, 0, 5, 2, P.fire[1]);            // body
      px(2, -2, 3, 3, P.fire[1]);            // head
      px(3, -4, 1, 2, P.fire[0]);            // ear
      px(-5, -1, 2, 2, P.fire[1]); px(-6, 0, 1, 1, P.bone[2]);  // bushy white-tipped tail
      px(4, -1, 1, 1, P.ink[0]);             // eye/snout
      px(-2, 2, 1, 1, P.ink[1]); px(1, 2, 1, 1, P.ink[1]);      // legs
    } else {                                 // squirrel
      px(-1, 0, 3, 3, P.hide[2]);            // body
      px(1, -2, 2, 2, P.hide[3]);            // head
      px(-4, -4, 2, 6, P.hide[1]); px(-3, -5, 2, 2, P.hide[2]); // big curled tail
      px(2, -1, 1, 1, P.ink[0]);             // eye
    }
  },

  // The shared grass floor: a flat green fill plus a sparse, near-tone felt grain
  // whose positions come from a fully-mixed hash of the tile's world (x,y) —
  // avalanche-mixed so they decorrelate from x and y (a weak mix left faint
  // vertical streaks). No two tiles share a pattern and nothing lines up with the
  // grid. A gentle DIAGONAL low-frequency field (mixes x AND y, so no axis-aligned
  // banding) leans the grain lighter/darker for soft meadow undulation. Painted
  // identically under open grass AND under every resource, so blocks never seam.
  /* ---- SEEDED VALUE NOISE ----------------------------------------------
     The land's own randomness. Seeded from S.seed (never S.rngState — a draw
     from the run's RNG would shift every roll after it), so the same seed is
     the same land on every reload and across a save/load. Deterministic and
     pure: same (x, y) always answers the same, which is what lets a single
     tile be repainted in isolation and still match its neighbours. */
  _landSeed: 0,
  _landSeedFor: null,
  landSeed() {
    const s = (S && S.seed != null) ? String(S.seed) : '';
    if (this._landSeedFor === s) return this._landSeed;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    this._landSeedFor = s; this._landSeed = h >>> 0;
    return this._landSeed;
  },
  // hash a lattice point to 0..1
  _lh(ix, iy, salt) {
    let n = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)
          ^ Math.imul(salt | 0, 0x9e3779b1) ^ this.landSeed();
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  },

  /* THE LATTICES ARE BAKED, NOT HASHED PER SAMPLE. The tone is sampled at
     sub-tile resolution — tens of thousands of points on a big map — but the
     octaves are LOW frequency, so their lattices are tiny: at 0.045 per tile
     a 65-tile map needs a 4x4 grid. Hashing 12 times per sample re-derives
     those few hundred numbers over and over; building them once and reading
     them back took the full xlarge bake from 131ms to a fraction of it.
     Rebuilt when the seed or the map size changes, and nowhere else. */
  DECAL_OPEN, DECAL_FOLIAGE, DECAL_RESERVED,
  _lat: null, _latKey: '', _latOne: null,
  _mkLat(f, salt) {
    const w = Math.ceil(CFG.W * f) + 3, h = Math.ceil(CFG.H * f) + 3;
    const d = new Float32Array(w * h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++)
      d[yy * w + xx] = this._lh(xx, yy, salt);
    return { w, h, f, d };
  },
  _latRead(o, x, y) {
    const fx = x * o.f, fy = y * o.f;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x0 > o.w - 2) x0 = o.w - 2; if (y0 > o.h - 2) y0 = o.h - 2;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const r0 = y0 * o.w + x0, r1 = r0 + o.w;
    const top = o.d[r0] + (o.d[r0 + 1] - o.d[r0]) * sx;
    const bot = o.d[r1] + (o.d[r1 + 1] - o.d[r1]) * sx;
    return top + (bot - top) * sy;
  },
  landLattices() {
    const key = this.landSeed() + 'x' + CFG.W + 'x' + CFG.H;
    if (this._latKey === key && this._lat) return this._lat;
    const out = [];
    for (let i = 0; i < LAND.TONE_OCT.length; i++)
      out.push(Object.assign(this._mkLat(LAND.TONE_OCT[i][0], i + 1), { wt: LAND.TONE_OCT[i][1] }));
    this._lat = out; this._latKey = key;
    this._latOne = { clump: this._mkLat(LAND.DECAL_CLUMP, 41), sand: this._mkLat(LAND.SAND_FREQ, 57),
                     edge: this._mkLat(LAND.EDGE_FREQ, 73), shoal: this._mkLat(LAND.SHOAL_FREQ, 97),
                     rock: this._mkLat(LAND.ROCK_EDGE_F, 113), grassM: this._mkLat(LAND.GRASS_MACRO_F, 131),
                     hue: this._mkLat(LAND.HUE_FREQ, 1301), depth: this._mkLat(LAND.DEPTH_WANDER_F, 1307),
                     slope: this._mkLat(LAND.SLOPE_FREQ, 1321), bar: this._mkLat(LAND.BAR_FREQ, 1327) };
    return out;
  },
  /* the CLUMP FIELD — what decides where things grow at all. Nature clumps:
     flowers in patches, pebbles in scatters, reeds in stands, and wide bare
     ground between them. A uniform per-tile roll produces an even sprinkle,
     which is the synthetic look this exists to avoid; the emptiness IS the
     feature, so DECAL_GATE deliberately silences most of the map. */
  landClump(x, y) { this.landLattices(); return this._latRead(this._latOne.clump, x, y); },
  landSand(x, y) { this.landLattices(); return this._latRead(this._latOne.sand, x, y); },
  /* the broad tonal field: a few octaves of smoothstep value noise over TILE
     space, so the blotches are many tiles wide and never read as per-tile
     checkering. Pure in (x, y) — which is what lets one tile be repainted on
     its own and still line up with its neighbours. */
  landTone(x, y) {
    const L = this.landLattices();
    let v = 0;
    for (let i = 0; i < L.length; i++) {
      const o = L[i], fx = x * o.f, fy = y * o.f;
      let x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
      if (x0 > o.w - 2) x0 = o.w - 2; if (y0 > o.h - 2) y0 = o.h - 2;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const r0 = y0 * o.w + x0, r1 = r0 + o.w;
      const top = o.d[r0] + (o.d[r0 + 1] - o.d[r0]) * sx;
      const bot = o.d[r1] + (o.d[r1 + 1] - o.d[r1]) * sx;
      v += (top + (bot - top) * sy) * o.wt;
    }
    return v;
  },

  /* ---- THE GROUND'S TONE AND ITS SHADE ---------------------------------
     Applied as an OVERLAY over whatever the floor turned out to be — the
     procedural paint or a dropped-in assets/terrain/grass.png. That is the
     whole point of doing it here rather than inside the painter: supplied
     ground art gets the same form the procedural ground has, instead of
     silently flattening everything this layer achieves.

     Warm and light going up, cool and dark going down, so the swing carries
     a little hue with it rather than reading as grey wash. Quantized to
     TONE_STEPS hard steps — a smooth gradient would be the one thing on
     screen not made of pixels.

     THE STEPS ARE RESOLVED PER SUB-CELL, NEVER PER TILE. One tone per tile
     is the obvious implementation and it is exactly wrong: the steps then
     land on tile boundaries and the quantization DRAWS THE GRID it was
     added to hide. Sampling on a LAND.TONE_SUB grid inside the tile lets a
     step boundary wander across tile borders as an organic stair, which is
     what reads as ground having form.

     The shade is bilinear from the tile's four CORNERS (each corner being
     what the four tiles meeting there imply), for the same reason: a flat
     per-tile shade rectangle beside a wood is a visible square. */
  groundTint(g, x, y, terr) {
    const TL = CFG.TILE, N = LAND.TONE_SUB, cell = TL / N;
    const s00 = this.cornerShade(x, y, terr), s10 = this.cornerShade(x + 1, y, terr);
    const s01 = this.cornerShade(x, y + 1, terr), s11 = this.cornerShade(x + 1, y + 1, terr);
    const flat = s00 === s10 && s00 === s01 && s00 === s11;
    /* THE WHOLE-TILE FAST PATH. The tone field is low-frequency, so the great
       majority of tiles sit entirely inside one step with no shade gradient
       across them — those want ONE rect, not TONE_SUB². Without this the
       layer costs ~67k fills on a 65² map and the bake doubles for a
       difference nobody can see. Checked on the four corners: a step boundary
       that crosses a tile without touching a corner is not possible at these
       frequencies. */
    if (flat) {
      const q = (u, v) => Math.min(LAND.TONE_STEPS - 1, (this.landTone(x + u, y + v) * LAND.TONE_STEPS) | 0);
      const c0 = q(0.02, 0.02);
      if (c0 === q(0.98, 0.02) && c0 === q(0.02, 0.98) && c0 === q(0.98, 0.98)) {
        const a = (c0 / (LAND.TONE_STEPS - 1) - 0.5) * 2 * LAND.TONE_AMP - s00;
        if (Math.abs(a) < 0.005) return;
        g.fillStyle = a > 0 ? 'rgba(232,220,150,' + a.toFixed(3) + ')'
                            : 'rgba(10,26,20,' + (-a).toFixed(3) + ')';
        g.fillRect(x * TL, y * TL, TL, TL);
        return;
      }
    }
    for (let j = 0; j < N; j++) {
      const v = (j + 0.5) / N;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        const tone = this.landTone(x + u, y + v);
        const step = Math.min(LAND.TONE_STEPS - 1, (tone * LAND.TONE_STEPS) | 0);
        let a = (step / (LAND.TONE_STEPS - 1) - 0.5) * 2 * LAND.TONE_AMP;
        if (!flat || s00) {
          const top = s00 + (s10 - s00) * u, bot = s01 + (s11 - s01) * u;
          a -= top + (bot - top) * v;
        }
        if (Math.abs(a) < 0.005) continue;
        g.fillStyle = a > 0 ? 'rgba(232,220,150,' + a.toFixed(3) + ')'    // sun-warmed
                            : 'rgba(10,26,20,' + (-a).toFixed(3) + ')';  // cool shade
        g.fillRect(x * TL + i * cell, y * TL + j * cell, cell, cell);
      }
    }
  },

  /* what the four tiles meeting at a lattice corner imply about shade there.
     Averaged at the CORNER so the value is shared by every tile that touches
     it — that shared value is what makes the shade continuous across tile
     borders instead of stepping at them. */
  cornerShade(cx, cy, terr) {
    let wood = 0, rock = 0, wet = 0, n = 0, wsum = 0;
    const bias = LAND.SUN_BIAS || 0;
    for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 0; ox++) {
      const nx = cx + ox, ny = cy + oy;
      if (!MapGen.inB(nx, ny)) continue;
      const v = terr[MapGen.idx(nx, ny)];
      n++;
      /* ONE SUN (LAND_REFRESH 2c). Light is locked top-left, so a wood casts
         toward its south-east: the corner to a wood's SE — whose NW sample
         the wood is — takes the most shade, the corner to its NW the least.
         Weights are normalised over the samples actually on the map, so a
         corner ringed by wood still returns exactly SHADE_FOREST and the
         tone maths keeps its range; rock and water stay radial. */
      const w = 1 + bias * ((ox === -1 && oy === -1) ? 1 : (ox === 0 && oy === 0) ? -1 : 0);
      wsum += w;
      if (v === T.FOREST) wood += w;
      else if (v === T.HILLS || v === T.MOUNTAIN) rock++;
      else if (v === T.WATER || v === T.MOAT) wet++;
    }
    if (!n) return 0;
    return (wood / wsum) * LAND.SHADE_FOREST + (rock / n) * LAND.SHADE_ROCK + (wet / n) * LAND.SHADE_SHORE;
  },

  /* ---- THE HUE OCTAVE (LAND_REFRESH Phase 2a) ----------------------------
     The tone layer lightens and darkens; this one CHANGES COLOUR. One more
     lattice, far lower in frequency than the tone octaves (HUE_FREQ 0.02 —
     a 5×5 grid on an xlarge map, a few hundred bytes), shifts the ground
     between a warm yellow-green and a cool blue-green: two chromatic
     overlays quantized to HUE_STEPS hard steps, the middle step untinted.
     The seams are DITHERED with a world-continuous hash (the blockShade
     idiom), so a step boundary wanders as an organic stipple and never a
     ruled line — and never on the tile grid, since the hash cell is the
     sub-cell, not the tile.

     Applied as the LAST ground pass — after the sward, the rocks and the
     decals — so everything lying on the meadow takes the meadow's hue and
     sits in the same colour world as the ground under it. Water ignores
     it (it has its own depth); so does the off-board rim. The kept verge's
     lush wash rides the same pass: one rect graded by keptness, whose
     ragged fading boundary is the mask's own, so no ring is ever drawn.

     Pure in (x, y, landSeed): incremental repaint equals rebake, and the
     whole-tile fast path (four inset probes in one step, all clear of a
     seam's dither band) keeps it to one fill on nearly every tile. */
  hueAt(x, y) { this.landLattices(); return this._latRead(this._latOne.hue, x, y); },
  // the undithered step at a point — the meadow roll's gate
  hueStepAt(x, y) {
    const S0 = LAND.HUE_STEPS;
    return Math.min(S0 - 1, (this.hueAt(x, y) * S0) | 0);
  },
  /* the rare flower-meadow tile (drawTile, both the pick and the draw go
     through HERE — a split brain drew `undefined`): 1 in 61 plain grass
     tiles everywhere, and MEADOW_WARM residues in the warmest hue step —
     colour mass where the sun is (LAND_REFRESH 2b). The h%61===0 tiles are
     a subset, so ground outside the warm step is byte-identical to before. */
  meadowRoll(x, y, h) {
    const r = h % 61;
    if (r === 0) return true;
    return LAND.MEADOW_WARM > 1 && r < LAND.MEADOW_WARM &&
      this.hueStepAt(x + 0.5, y + 0.5) === LAND.HUE_STEPS - 1;
  },
  hueTint(g, x, y, terr) {
    if (!(LAND.HUE_AMP > 0) && !(LAND.KEPT_TINT > 0)) return;
    if (!MapGen.onBoard(x, y)) return;
    const t = terr[MapGen.idx(x, y)];
    if (t === T.WATER || t === T.MOAT) return;          // the water has its own depth
    const TL = CFG.TILE;
    const kept = (LAND.KEPT_TINT > 0 && t === T.GRASS) ? this.keptAt(x, y) : 0;
    if (kept > 0) {
      g.fillStyle = 'rgba(64,164,58,' + (LAND.KEPT_TINT * kept).toFixed(3) + ')';
      g.fillRect(x * TL, y * TL, TL, TL);
    }
    if (!(LAND.HUE_AMP > 0)) return;
    const S0 = LAND.HUE_STEPS, N = LAND.TONE_SUB, cell = TL / N;
    const mid = (S0 - 1) / 2;
    const band = LAND.HUE_DITHER / S0;                 // the seam's dither half-band, in field units
    const paint = (step, px0, py0, w, h) => {
      const a = (step - mid) / mid * LAND.HUE_AMP;     // −AMP (cool) … +AMP (warm)
      if (Math.abs(a) < 0.004) return;
      g.fillStyle = a > 0 ? 'rgba(214,196,90,' + a.toFixed(3) + ')'
                          : 'rgba(30,90,110,' + (-a).toFixed(3) + ')';
      g.fillRect(px0, py0, w, h);
    };
    const stepOf = v => Math.min(S0 - 1, (v * S0) | 0);
    const clear = v => { const f = v * S0 - Math.floor(v * S0); return f > band && f < 1 - band; };
    const v00 = this.hueAt(x + 0.02, y + 0.02), v10 = this.hueAt(x + 0.98, y + 0.02);
    const v01 = this.hueAt(x + 0.02, y + 0.98), v11 = this.hueAt(x + 0.98, y + 0.98);
    const s00 = stepOf(v00);
    if (s00 === stepOf(v10) && s00 === stepOf(v01) && s00 === stepOf(v11) &&
        clear(v00) && clear(v10) && clear(v01) && clear(v11)) {
      paint(s00, x * TL, y * TL, TL, TL);
      return;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = this.hueAt(x + (i + 0.5) / N, y + (j + 0.5) / N);
      const dj = (this._lh(x * N + i, y * N + j, 1303) - 0.5) * 2 * band;
      paint(stepOf(Math.min(0.9999, Math.max(0, v + dj))), x * TL + i * cell, y * TL + j * cell, cell, cell);
    }
  },

  /* ---- DECAL SCATTER ----------------------------------------------------
     The blank green tile is the single biggest source of flatness, and this
     is the layer that answers it.

     TWO RULES CARRY THE WHOLE EFFECT.

     SUB-TILE POSITION. Every decal sits at an arbitrary pixel offset in its
     tile and is allowed to hang over the edge. Land them on tile centres —
     or even on a tidy sub-grid — and the eye reads the lattice instantly;
     the whole point is that nothing about the scatter agrees with the grid.

     CLUSTERING. Placement is gated on a low-frequency clump field, not a
     per-tile roll. Most of the map grows NOTHING, and the bare ground
     between patches is what makes the patches read as natural.

     Kind is chosen from the neighbourhood — leaf litter and twigs under
     wood, reeds and rushes by water, loose stone below crags, wildflowers
     out in the open meadow. Everything is hashed from (x, y, seed), so the
     scatter is identical on every reload and through every save. */
  landDecals(g, x, y, terr) {
    if (LAND.DECAL_DENSITY <= 0) return;
    /* NOTHING IS WORKED IN THE BLACK. The outermost ring is off-map void —
       drawTile paints it flat black and returns — but the scatter was asking
       only what TERRAIN a tile held, and the rim's terrain is ordinary grass
       underneath, so tufts and pebbles were being strewn across the world's
       edge. MapGen.onBoard is the single declaration of that rule (CLAUDE.md,
       "Nothing is worked in the BLACK"); this layer had not been asking it.
       The spill from row 1 is clipped separately, where the pass is run. */
    if (!MapGen.onBoard(x, y)) return;
    const t = terr[MapGen.idx(x, y)];
    if (CORE_SCATTER[t]) { this.coreScatter(g, x, y, terr, t); return; }
    if (!DECAL_GROUND.has(t)) return;                 // only open, walkable ground
    // never under a building's footprint — its own art owns that ground
    if (typeof Bld !== 'undefined' && Bld.at && Bld.at(x, y)) return;
    const clump = this.landClump(x, y);
    if (clump < LAND.DECAL_GATE) return;              // the empty ground between patches
    const lush = (clump - LAND.DECAL_GATE) / (1 - LAND.DECAL_GATE);

    let wood = 0, rock = 0, wet = 0;
    for (const [ox, oy] of NEIGH8) {
      const nx = x + ox, ny = y + oy;
      if (!MapGen.inB(nx, ny)) continue;
      const n = terr[MapGen.idx(nx, ny)];
      if (n === T.FOREST || n === T.STUMPS) wood++;
      else if (n === T.HILLS || n === T.MOUNTAIN || n === T.PEBBLES) rock++;
      else if (n === T.WATER || n === T.MOAT) wet++;
    }

    const TL = CFG.TILE, px = TL / 16;
    let hh = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ this.landSeed()) >>> 0;
    const rnd = () => { hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = (hh ^ (hh >>> 12)) >>> 0; return hh / 4294967295; };
    const n = Math.max(1, Math.min(LAND.DECAL_MAX,
      Math.round((0.7 + lush * (LAND.DECAL_MAX - 0.7)) * LAND.DECAL_DENSITY + rnd() * 0.5)));
    for (let i = 0; i < n; i++) {
      // OVERHANG: -3 … TL+3 px, so a decal may straddle the tile border. Capped
      // at one tile so the 3x3 repaint in drawTileAt always covers the spill.
      const dx = x * TL + Math.round(rnd() * (TL + 6)) - 3;
      const dy = y * TL + Math.round(rnd() * (TL + 6)) - 3;
      const r = rnd();
      let kind;
      /* FOLIAGE LIVES ONLY ON THE FOREST'S DOORSTEP. Ferns and leaf litter
         are an UNDERGROWTH FRINGE that softens a wood's edge — one tile deep,
         never out in the meadow, where anything with a stem reads as scrub.
         Open ground gets flat, ground-level, low-contrast things only. */
      if (wet >= 2 && r < 0.55) kind = r < 0.3 ? 'reed' : 'damp';
      else if (wood >= 1 && r < 0.7) kind = r < 0.28 ? 'leaf' : r < 0.5 ? 'twig' : 'fern';
      else if (rock >= 2 && r < 0.6) kind = r < 0.3 ? 'pebble' : 'stone';
      else kind = r < 0.30 ? 'tuft' : r < 0.50 ? 'tuft2' : r < 0.66 ? 'clover'
        : r < 0.80 ? 'flower' : r < 0.88 ? 'twig' : r < 0.95 ? 'pebble' : 'scuff';
      this.drawDecal(g, dx, dy, kind, px, rnd);
    }
    /* MEADOW CHARACTER (LAND_REFRESH 2b): in the warmest hue step one more
       flower comes through the same clump gate — colour mass where the sun
       is. Drawn LAST so every other tile's stream is untouched; DECAL_MUTE
       still governs it, so it reads as ground, not as an object. */
    if (LAND.MEADOW_WARM > 1 && this.hueStepAt(x + 0.5, y + 0.5) === LAND.HUE_STEPS - 1) {
      const dx = x * TL + Math.round(rnd() * (TL + 6)) - 3;
      const dy = y * TL + Math.round(rnd() * (TL + 6)) - 3;
      this.drawDecal(g, dx, dy, 'flower', px, rnd);
    }
  },

  /* the density gradient for deposits that have only one sprite set: count how
     enclosed the tile is, exactly as the forest and ore sets do, and enrich the
     CORE with extra material rather than thinning the edge (thinning would mean
     erasing authored art back to the floor, which reads as damage). */
  coreScatter(g, x, y, terr, t) {
    let cnt = 0;
    for (const [ox, oy] of NEIGH8) {
      const nx = x + ox, ny = y + oy;
      if (MapGen.inB(nx, ny) && terr[MapGen.idx(nx, ny)] === t) cnt++;
    }
    if (cnt < 5) return;                               // an edge tile stays as drawn
    const TL = CFG.TILE, px = TL / 16, AP = ART.PALETTE;
    let hh = (Math.imul(x, 0x2545f491) ^ Math.imul(y, 0x9e3779b1) ^ this.landSeed()) >>> 0;
    const rnd = () => { hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = (hh ^ (hh >>> 12)) >>> 0; return hh / 4294967295; };
    const n = 1 + Math.round((cnt - 5) / 3 * 2);       // 1 at the rim of the core, 3 dead centre
    const kind = CORE_SCATTER[t];
    for (let i = 0; i < n; i++) {
      const dx = x * TL + Math.round(rnd() * (TL - 6)) + 1;
      const dy = y * TL + Math.round(rnd() * (TL - 6)) + 1;
      const q = (ox, oy, w, h, c) => { g.fillStyle = c; g.fillRect(dx + ox * px, dy + oy * px, w * px, h * px); };
      /* Note `vein` KEEPS the gold ramp and is not a colour-audit
         collision — it is drawn only on a gold seam, where gold is exactly
         what is being promised. (FERTILE's old 'crop' tussock — once a
         wheat sheaf as bright as brass, then muted dry stems — is retired
         with the forage redesign; see the CORE_SCATTER table.) */
      if (kind === 'pebble') { q(1, 2, 2, 1, AP.stone[0]); q(0, 0, 3, 2, AP.stone[2]); q(0, 0, 1, 1, AP.stone[3]); }
      else if (kind === 'vein') { q(0, 1, 3, 1, AP.gold[0]); q(0, 0, 2, 1, AP.gold[2]); q(2, 0, 1, 1, AP.gold[3]); }
    }
  },

  /* ---- WILD GRASS COVER -------------------------------------------------
     The meadow itself. Everything the decal layer learned applies here at
     scale: sub-tile position with overhang, clustering with real bare ground
     between the patches, and silhouettes that lie IN the grass — every sward
     is wider than it is tall, which is the whole answer to the sapling trap.

     BIODIVERSITY IS FOUR SEPARATE AXES, all seeded from (x, y, landSeed):
     seven silhouettes; positional jitter; value jitter across the grass ramp
     (with parched thatch blades where the macro field peaks dry); and an
     ABOVE-TILE-SCALE richness field (grassM, many tiles wide) that makes one
     valley lush and the next threadbare — variation no per-tile roll can
     produce. Context rides the neighbourhood exactly as the decals read it:
     damp ground grows thicker, ground under a crag thinner.

     Baked into the terrain cache, so it draws UNDER units with no y-sorting,
     costs the frame loop nothing, and respects fog for free (the cache reads
     seenTerrain and the fog blits over it). NO wind animation — cut on
     purpose: the cache IS the budget.

     `cap` is the taming capture: instead of painting, record every rect the
     tile's WILD swards would paint (cap.rects) so startTaming can lift them
     into the flatten one-shot. Capture always renders the wild look — it is
     asking what stood there before the builders came. */
  grassCover(g, x, y, terr, cap) {
    if (LAND.GRASS_DENSITY <= 0) return;
    if (!MapGen.onBoard(x, y)) return;
    const t = terr[MapGen.idx(x, y)];
    if (t !== T.GRASS) return;
    if (typeof Bld !== 'undefined' && Bld.at && Bld.at(x, y)) return;
    this.landLattices();
    const macro = this._latRead(this._latOne.grassM, x, y);
    if (macro < LAND.GRASS_GATE) return;               // bald ground between valleys
    const rich = (macro - LAND.GRASS_GATE) / (1 - LAND.GRASS_GATE);
    // mid-scale clustering rides the decal clump field a half-phase off, so
    // the two scatters never stack their bare patches on the same tiles
    const mid = this._latRead(this._latOne.clump, x + 17.3, y + 9.1);
    let wood = 0, rock = 0, wet = 0;
    for (const [ox, oy] of NEIGH8) {
      const nx = x + ox, ny = y + oy;
      if (!MapGen.inB(nx, ny)) continue;
      const nb = terr[MapGen.idx(nx, ny)];
      if (nb === T.FOREST || nb === T.STUMPS) wood++;
      else if (nb === T.HILLS || nb === T.MOUNTAIN || nb === T.PEBBLES) rock++;
      else if (nb === T.WATER || nb === T.MOAT) wet++;
    }
    /* keptness is GRADED (tameMask): 0 wild … 1 the tended heart. A capture
       renders what the bake drew BEFORE the new building (cap.kept), which
       is why the flatten lifts exactly what stood there. The rnd stream is
       the same at every keptness — kept changes what a sward looks like,
       never how many rolls it takes. */
    const kept = cap ? (cap.kept || 0) : this.keptAt(x, y);
    const tame = kept > 0.5;                           // the tidy-set threshold
    // the curve is deliberately steep: a valley near the gate carries a few
    // swards, a lush heart is thick with them — flat density is the sprinkle
    // this whole layer exists to avoid
    let d = LAND.GRASS_DENSITY * (0.28 + Math.pow(rich, 1.3) * 0.95) * (0.55 + mid * 0.9);
    if (wet) d *= 1.25;                                // the damp band grows thick
    if (rock >= 2) d *= 0.55;                          // thin soil below a crag
    d *= 1 - kept * (1 - LAND.KEPT_DENSITY);           // a tended verge is cropped, by degree
    const TL = CFG.TILE, px = TL / 32;                 // ONE authored pixel — the 32 grid
    let hh = (Math.imul(x, 0x51ed270b) ^ Math.imul(y, 0x85ebca6b) ^ this.landSeed()) >>> 0;
    const rnd = () => { hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = (hh ^ (hh >>> 12)) >>> 0; return hh / 4294967295; };
    let n = Math.min(LAND.GRASS_MAX, Math.round(d * (2.6 + rnd() * 3.2)));
    if (n <= 0) { if (rnd() < d * 2) n = 1; else return; }
    /* SUPPLIED COVER ART REPLACES THE SILHOUETTE, NEVER THE SCATTER. A frame
       from assets/terrain/cover/grass/{wild|kept}.png is one clump, drawn
       bottom-anchored on the foot of the sward it stands in for — at the
       same jittered anchor, in the same count, under the same gates — so
       the art changes what a sward looks like and never where it grows.
       The accent slot rides the same way, above a sward, at the accent
       rate. Frames are clamped to the one-tile bound the repaint rings
       derive from, so a wide frame never orphans pixels. */
    const artSlot = (window.Assets && Assets.coverImg) ? (tame ? 'kept' : 'wild') : null;
    const AP = ART.PALETTE, GR = AP.grass;
    /* THE WILD IS WILD, THE KEPT IS KEPT (LAND_REFRESH 2.2 / 2.3) — opposite
       on three axes. HEIGHT: the wild draws from twelve silhouettes, the
       tall splayed ones weighted by GRASS_TALL; the verge keeps the three
       shortest. COLOUR: the wild bleaches where richness runs dry (thatch
       blades, GRASS_PARCH) and darkens under a wood; the verge is uniform
       lush green. UNIFORMITY: the wild scatters anywhere with overhang; the
       verge sits its swards on a loose lattice with a small jitter. Every
       roll below is consumed on both roads, so the stream never forks. */
    const parch = wet ? 0 : (1 - rich) * LAND.GRASS_PARCH * (1 - kept);
    const tallBias = LAND.GRASS_TALL;
    const SW = [4, 5, 6, 8, 6, 8, 7, 6, 9, 8, 9, 6];   // each silhouette's width, for the mirror
    for (let i = 0; i < n; i++) {
      let cx0, cy0;
      if (tame) {
        cx0 = x * TL + (i & 1) * 16 + 3 + Math.round(rnd() * 8);
        cy0 = y * TL + ((i >> 1) & 1) * 16 + 4 + Math.round(rnd() * 8);
      } else {
        // overhang −3…+3px past the tile, same bound as the decals: paint
        // ends well inside one tile past the anchor, so the ±3 ring covers it
        cx0 = x * TL + Math.round(rnd() * (TL + 6)) - 3;
        cy0 = y * TL + Math.round(rnd() * (TL + 6)) - 3;
      }
      let sil = (rnd() * (tame ? 2.999 : 11.999)) | 0;
      const rr = rnd();                              // the tall/short remap roll — always consumed
      if (!tame) {
        const tall = sil >= 6;
        if (tallBias < 1 && tall && rr < 1 - tallBias) sil -= 6;
        else if (tallBias > 1 && !tall && rr < tallBias - 1) sil += 6;
      }
      const flip = rnd() < 0.5;                      // a mirrored sward is a new sward
      const vr = rnd();
      const dryOne = rnd() < parch;                  // this sward is parched
      // a parched sward is STRAW — grey-gold bone over dark ochre, never the
      // bright thatch crown, which at play zoom read as a dropped object
      const body = dryOne ? AP.thatch[0] : tame ? (vr < 0.6 ? GR[3] : GR[4])
        : wood >= 2 ? GR[2] : vr < 0.55 ? GR[3] : vr < 0.82 ? GR[2] : GR[4];
      const lit = dryOne ? AP.bone[1] : (wet || tame) ? GR[4] : vr < 0.5 ? GR[4] : GR[3];
      const deep = dryOne ? AP.soil[1] : GR[1];
      const w0 = SW[sil];
      const fr = artSlot ? Assets.coverImg('grass', artSlot, (hh >>> 4) + i * 7) : null;
      if (fr) {
        // the frame's opaque box (measured at install) stands on the sward's
        // foot row; both corners clamped inside one tile past the anchor
        const fw = fr._bw || fr.width, fh = fr._bh || fr.height;
        const ax = Math.max((x - 1) * TL, Math.min((x + 2) * TL - fw, cx0));
        const ay = Math.max((y - 1) * TL, Math.min((y + 2) * TL - fh, cy0 + 4 * px - fh));
        const rec = { x: ax, y: ay, w: fw, h: fh, img: fr, sx: fr._bx || 0, sy: fr._by || 0 };
        if (cap) cap.rects.push(rec); else g.drawImage(fr, rec.sx, rec.sy, fw, fh, ax, ay, fw, fh);
        const acc = (!tame && rnd() < LAND.GRASS_ACCENT * (1 - kept)) ? Assets.coverImg('grass', 'accent', hh >>> 7) : null;
        if (acc) {
          const aw = acc._bw || acc.width, ah = acc._bh || acc.height;
          const bx = Math.max((x - 1) * TL, Math.min((x + 2) * TL - aw, ax + ((fw - aw) >> 1)));
          const by = Math.max((y - 1) * TL, Math.min((y + 2) * TL - ah, ay + 2 * px - ah));
          const arec = { x: bx, y: by, w: aw, h: ah, img: acc, sx: acc._bx || 0, sy: acc._by || 0 };
          if (cap) cap.rects.push(arec); else g.drawImage(acc, arec.sx, arec.sy, aw, ah, bx, by, aw, ah);
        }
        continue;
      }
      const q = cap
        ? (ox, oy, w, h, c) => cap.rects.push({ x: cx0 + (flip ? w0 - ox - w : ox) * px, y: cy0 + oy * px, w: w * px, h: h * px, c })
        : (ox, oy, w, h, c) => { g.fillStyle = c; g.fillRect(cx0 + (flip ? w0 - ox - w : ox) * px, cy0 + oy * px, w * px, h * px); };
      switch (sil) {
        /* every shape: a LIT crown, a body wider than the whole thing is
           tall, and a DARK FOOT — the contact pixel doctrine the decals
           proved. A sward without its foot is invisible against the floor.
           Widest is 9, tallest 4 (plus the seed head above): from an anchor
           at most 3px past the tile that is still inside one tile past it. */
        case 0:                                        // a small sward
          q(1, 0, 2, 1, lit); q(0, 1, 4, 1, body); q(1, 2, 2, 1, deep); break;
        case 1:                                        // a broken row
          q(0, 0, 2, 1, body); q(3, 0, 2, 1, body); q(1, 1, 3, 1, deep); break;
        case 2:                                        // a mid sward, lit crown
          q(1, 0, 3, 1, lit); q(0, 1, 6, 2, body); q(1, 3, 4, 1, deep); break;
        case 3:                                        // a wide sward
          q(2, 0, 4, 1, lit); q(0, 1, 8, 2, body); q(2, 3, 4, 1, deep); break;
        case 4:                                        // an arc, thinning right
          q(0, 0, 3, 1, body); q(4, 0, 2, 1, body); q(0, 1, 5, 1, deep); break;
        case 5:                                        // a dashed fringe
          q(0, 0, 2, 1, body); q(3, 0, 3, 1, body); q(7, 0, 1, 1, body); q(2, 1, 3, 1, deep); break;
        case 6:                                        // a dense tussock
          q(1, 0, 2, 1, lit); q(4, 0, 2, 1, body);
          q(0, 1, 7, 2, body); q(1, 3, 5, 1, deep); break;
        case 7:                                        // a leaning tussock
          q(3, 0, 2, 1, lit); q(1, 1, 5, 1, body); q(0, 2, 6, 1, body); q(1, 3, 3, 1, deep); break;
        case 8:                                        // a splayed fan
          q(1, 0, 2, 1, lit); q(5, 0, 2, 1, lit); q(0, 1, 9, 1, body); q(1, 2, 7, 1, body); q(3, 3, 3, 1, deep); break;
        case 9:                                        // stalks, seed heads up
          q(1, 0, 1, 1, lit); q(4, 0, 1, 1, lit); q(7, 0, 1, 1, lit);
          q(0, 1, 8, 1, body); q(1, 2, 6, 1, body); q(2, 3, 4, 1, deep); break;
        case 10:                                       // a low mound
          q(2, 0, 4, 1, lit); q(0, 1, 9, 2, body); q(1, 3, 6, 1, deep); break;
        case 11:                                       // a clump pair
          q(0, 0, 2, 1, lit); q(4, 0, 2, 1, body); q(0, 1, 3, 1, body); q(3, 1, 3, 1, body); q(1, 2, 4, 1, deep); break;
      }
      // the rare accent: a dull seed head, never the bright brass (the
      // colour-language rule DECAL_RESERVED already states)
      if (!tame && rnd() < LAND.GRASS_ACCENT * (1 - kept)) q(2, -1, 1, 1, dryOne ? AP.bone[2] : AP.bone[1]);
    }
  },

  /* ---- TAMING ON BUILD --------------------------------------------------
     The ground a town stands on is ground somebody keeps. Around every
     STANDING building the wild cover gives way to a cropped, tidier verge —
     less of it, shorter shapes, no seed heads — inside a ragged organic
     boundary (per-tile world noise on the distance, so it is never a disk,
     and overlapping zones union into one smooth kept ground because every
     tile's wobble is its own).

     DERIVED, NEVER STORED. The mask is a pure function of the standing
     buildings and the land seed: nothing rides a save, tile data is
     bit-identical with the feature on or off (tests/wild-grass.mjs pins it),
     and a razed building's verge simply grows wild again on the repaint its
     removal already triggers. Construction sites keep nothing — the ground
     is tamed by the FINISHED building, which is also what lets the flatten
     animation fire exactly once, from Bld.finish. */
  _tameKey: '', _tameMask: null,
  tameMask() {
    if (!S || !S.buildings || typeof Bld === 'undefined') return null;
    let key = this.landSeed() + '|' + CFG.W + '|';
    for (const b of S.buildings) {
      if (b.construction > 0 || b.key === 'raidercamp') continue;   // a war band tends nothing
      key += b.key + b.x + ',' + b.y + ';';
    }
    if (this._tameKey === key && this._tameMask) return this._tameMask;
    const W = CFG.W, H = CFG.H, m = new Uint8Array(W * H);
    for (const b of S.buildings) {
      if (b.construction > 0 || b.key === 'raidercamp') continue;
      const sz = Bld.size(b);
      const R0 = (b.key === 'wall' || b.key === 'gate') ? LAND.TAME_R_FORT : LAND.TAME_R;
      const reach = Math.ceil(R0 + LAND.TAME_WOBBLE);
      for (let y = b.y - reach; y < b.y + sz + reach; y++) {
        if (y < 0 || y >= H) continue;
        for (let x = b.x - reach; x < b.x + sz + reach; x++) {
          if (x < 0 || x >= W) continue;
          const dx = x < b.x ? b.x - x : x >= b.x + sz ? x - (b.x + sz - 1) : 0;
          const dy = y < b.y ? b.y - y : y >= b.y + sz ? y - (b.y + sz - 1) : 0;
          const dd = Math.hypot(dx, dy);
          // the boundary's wobble belongs to the TILE, not the building —
          // which is exactly why overlapping zones union without a seam
          const inner = R0 - 0.75 + this._lh(x, y, 177) * LAND.TAME_WOBBLE;
          if (dd > inner) continue;
          /* KEPTNESS IS GRADED: full in the heart, fading over KEPT_SOFT
             tiles to the ragged boundary, so the verge softens into the
             wild instead of stopping at a ring. Inside the boundary it is
             never 0 (tamedAt stays a clean yes/no), and overlapping zones
             union at their fullest. */
          const lv = Math.min(1, (inner - dd) / Math.max(0.05, LAND.KEPT_SOFT));
          const k = Math.max(1, Math.round(lv * 255)), i = y * W + x;
          if (k > m[i]) m[i] = k;
        }
      }
    }
    this._tameKey = key; this._tameMask = m;
    return m;
  },
  tamedAt(x, y) {
    const m = this.tameMask();
    return !!(m && m[y * CFG.W + x]);
  },
  // graded keptness 0..1 — what the sward and the lush wash actually read
  keptAt(x, y) {
    const m = this.tameMask();
    return m ? m[y * CFG.W + x] / 255 : 0;
  },

  /* a building appeared or vanished: repaint its whole kept zone (plus the
     wobble's reach), through the ordinary exact-invalidation path. This is
     the taming's OWN dirty call — ordinary repaints near a standing building
     already derive the mask correctly, but only the building's arrival or
     departure knows the zone's full extent. */
  tameDirty(b) {
    if (!this.terrainCache || !S || !S.map || typeof Bld === 'undefined') return;
    const sz = Bld.size(b);
    const reach = Math.ceil(((b.key === 'wall' || b.key === 'gate') ? LAND.TAME_R_FORT : LAND.TAME_R) + LAND.TAME_WOBBLE);
    const tiles = [];
    for (let y = b.y - reach; y < b.y + sz + reach; y++)
      for (let x = b.x - reach; x < b.x + sz + reach; x++)
        if (MapGen.inB(x, y)) tiles.push([x, y]);
    if (tiles.length) this.drawTilesAt(tiles);
  },

  /* ---- the flatten: the wild sward goes down as the builders move in ----
     One-shot, the tree-fall's little sibling. On completion the zone's WILD
     swards are lifted — regenerated rect-for-rect by the same pure generator
     that baked them, never read back from the canvas — and each tile's
     swards flatten AWAY from the new building, staggered by distance so the
     whole thing reads as one ripple rolling outward. Then the bake underneath
     already shows the kept ground (tameDirty repainted it), so when the
     lifted pixels fade the tended verge is what remains.

     Fires from Bld.finish and NOWHERE else: never on load, never on an
     instant placement, never on a scroll or a rebake — the same discipline
     the tree fall keeps. Render state only, capped, never in a save. */
  TAMING: { ms: 780, stagger: 0.085, cap: 6, tiles: 48 },
  tamings: [],
  startTaming(b) {
    if (!S || !S.map || !this.terrainCache || typeof Bld === 'undefined') return;
    const sz = Bld.size(b);
    const R0 = (b.key === 'wall' || b.key === 'gate') ? LAND.TAME_R_FORT : LAND.TAME_R;
    const reach = Math.ceil(R0 + LAND.TAME_WOBBLE);
    const bcx = b.x + sz / 2, bcy = b.y + sz / 2;
    const terr = S.map.seenTerrain || S.map.terrain;
    /* what stood BEFORE this building finished: rebuild the mask with b
       counted as a site, so ground a NEIGHBOUR already keeps is skipped —
       lifting "wild" swards off already-kept ground would flatten grass that
       was never standing (the union-smoothly rule, animated). */
    const was = new Uint8Array((2 * reach + sz) * (2 * reach + sz));
    {
      const c0v = b.construction;
      b.construction = 1; this._tameKey = '';
      let i = 0;
      for (let y = b.y - reach; y < b.y + sz + reach; y++)
        for (let x = b.x - reach; x < b.x + sz + reach; x++, i++)
          if (MapGen.inB(x, y)) was[i] = Math.round(this.keptAt(x, y) * 255);
      b.construction = c0v; this._tameKey = '';
    }
    const tiles = [];
    let wi = -1;
    for (let y = b.y - reach; y < b.y + sz + reach; y++) {
      for (let x = b.x - reach; x < b.x + sz + reach; x++) {
        wi++;
        if (!MapGen.inB(x, y) || !this.tamedAt(x, y)) continue;
        // keptness is graded: lift only where the new building made the
        // ground MORE kept than a neighbour already had it
        const before = was[wi] / 255;
        if (this.keptAt(x, y) <= before + 0.02) continue;
        if (!G.visibleAt(x, y)) continue;              // ground nobody can see
        const cap = { rects: [], img: null, kept: before };
        this.grassCover(null, x, y, terr, cap);
        if (!cap.rects.length && !cap.img) continue;
        const ddx = x + 0.5 - bcx, ddy = y + 0.5 - bcy;
        const dl = Math.hypot(ddx, ddy) || 1;
        tiles.push({ x, y, cap, dir: [ddx / dl, ddy / dl], delay: dl * this.TAMING.stagger });
      }
    }
    if (!tiles.length) return;
    tiles.sort((a, c) => a.delay - c.delay);
    if (tiles.length > this.TAMING.tiles) tiles.length = this.TAMING.tiles;
    if (this.tamings.length >= this.TAMING.cap) this.tamings.shift();
    this.tamings.push({ tiles, t: 0 });
  },
  drawTamings(g, dt) {
    if (!this.tamings.length) return;
    const cfg = this.TAMING, TL = CFG.TILE;
    for (let i = this.tamings.length - 1; i >= 0; i--) {
      const tm = this.tamings[i];
      tm.t += dt;
      let live = false;
      for (const td of tm.tiles) {
        const p = (tm.t - td.delay) / (cfg.ms / 1000);
        if (p >= 1) continue;
        live = true;
        if (p < 0) {
          // not reached yet — the wild sward still stands, drawn over the
          // already-kept bake so the ripple has something to knock down
          for (const r of td.cap.rects) {
            if (r.img) g.drawImage(r.img, r.sx, r.sy, r.w, r.h, r.x, r.y, r.w, r.h);
            else { g.fillStyle = r.c; g.fillRect(r.x, r.y, r.w, r.h); }
          }
          continue;
        }
        const ease = Math.min(1, Math.pow(p / 0.85, 1.4));
        const loud = LAND.TAME_LOUD;                   // the bench's loudness dial
        const flat = 1 - ease * Math.min(0.95, 0.8 * Math.max(0.5, loud));   // rows settle toward the ground
        const push = ease * 3 * loud * (TL / 32);      // …and slide away from the build
        const a = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
        g.globalAlpha = a;
        for (const r of td.cap.rects) {
          // every rect — a procedural row or an art clump — settles toward
          // its own foot and slides away from the build, together
          const dx = Math.round(r.x + td.dir[0] * push), dy = Math.round(r.y + td.dir[1] * push * 0.6 + r.h * (1 - flat));
          const dh = Math.max(1, Math.round(r.h * flat));
          if (r.img) g.drawImage(r.img, r.sx, r.sy, r.w, r.h, dx, dy, r.w, dh);
          else { g.fillStyle = r.c; g.fillRect(dx, dy, r.w, dh); }
        }
        /* loose blades thrown along the ripple — the tree fall's torn-leaf
           trick at meadow scale, and what makes a two-pixel sward's flatten
           READ. Hashed off the tile, never rolled. */
        const px1 = Math.max(1, Math.round(TL / 32));
        let bh = (Math.imul(td.x, 0x27d4eb2d) ^ Math.imul(td.y, 0x9e3779b1)) >>> 0;
        const br = () => { bh = Math.imul(bh ^ (bh >>> 15), 0x2c1b3c6d); bh = (bh ^ (bh >>> 12)) >>> 0; return bh / 4294967295; };
        const GR2 = ART.PALETTE.grass;
        const nb = Math.round(4 * loud), bsz = px1 * (loud >= 2 ? 2 : 1);
        for (let k = 0; k < nb; k++) {
          const b0 = br(), b1 = br(), b2 = br();
          const bt = (p - b0 * 0.3) / 0.7;
          if (bt <= 0 || bt >= 1) continue;
          const reach = (5 + b1 * 12) * px1 * bt * loud;
          const bx = td.x * TL + TL / 2 + td.dir[0] * reach + (b2 - 0.5) * 6 * px1;
          const by = td.y * TL + TL / 2 + td.dir[1] * reach * 0.6
            - px1 * 5 * 4 * bt * (1 - bt) * loud;      // a small arc up and back down
          g.globalAlpha = Math.min(a, (1 - bt) * 1.5);
          g.fillStyle = b2 < 0.6 ? GR2[3] : GR2[4];
          g.fillRect(Math.round(bx), Math.round(by), bsz, bsz);
        }
        g.globalAlpha = 1;
      }
      if (!live && tm.t > 0) this.tamings.splice(i, 1);
    }
  },

  /* ---- THE ROCK MASS ----------------------------------------------------
     A stone field is NOT a grid of tile sprites. Three tile sets picked by
     neighbour count could never do better than a staircase of squares —
     which is exactly what a rock deposit looked like: hard vertical and
     horizontal edges, square corners, and the same handful of stamps
     repeating along them. So the mass is scattered in WORLD space instead,
     from one lattice that knows nothing about tiles, and every rock is
     PRE-RENDERED (Sprites.rockStamp) so scattering it is a blit.

     HOW BIG A ROCK IS, AND WHETHER THERE IS ONE AT ALL, both come from the
     hill distance field — the same field the hill relief already keys on, so
     no new bookkeeping. It is sampled BILINEARLY, which alone takes the
     boundary off the tile grid, and then displaced by world-space noise, the
     coastline's own trick: smooth above the tile, roughened below it.

     WHAT MAY CROSS THE LINE IS LIMITED ON PURPOSE. A boulder standing on
     grass a unit can walk through is a lie about the map, and this game's
     governing readability rule says the drawn world may not tell one. So the
     wander is well under half a tile, the last band thins out rather than
     ending on a wall, and past the boundary only loose SCREE chips lie on
     the ground — which is honest, because scree at the foot of a crag is
     walkable and always was. ---- */
  rockMass(g, x, y, terr) {
    if (terr[MapGen.idx(x, y)] !== T.HILLS) { this.rockScree(g, x, y, terr); return; }
    if (window.Assets && Assets.terrainImg(T.HILLS, 0)) return;   // supplied art wins, as everywhere
    const TL = CFG.TILE, W = CFG.W, H = CFG.H, d = this.hillField();
    /* THE SLAB DOOR (the referee's flat-bedrock pick): with the stone
       catalog installed a deposit tile lays a cracked slab flush with the
       turf — rock BENEATH the ground, not boulders on it, and not-gold at
       a glance. Hash-picked from the twelve (plus mirrors), jittered off
       centre; a DEEP tile stacks a second smaller slab behind, so cluster
       hearts still read heavier than their fringes. No catalog: the
       boulder field below stands untouched. */
    const slabs = (typeof Assets !== 'undefined' && Assets._muted) ? Assets._muted('stone-l') : null;
    if (slabs && slabs.length) {
      const h = (x * 73856093 ^ y * 19349663) >>> 0;
      const dep = d[y * W + x];
      // depth decides how much bedrock shows: a fringe tile breaks the turf
      // with one slab, the heart of the deposit is a near-continuous sheet
      const spots = dep > 1.4 ? [[16, 12], [7, 24], [25, 26], [15, 30]]
        : dep > 0.8 ? [[12, 15], [22, 27], [26, 12]] : [[16, 22]];
      for (let si = 0; si < spots.length; si++) {
        const hs = (h ^ Math.imul(si + 1, 0x9E3779B1)) >>> 0;
        const art = slabs[hs % slabs.length];
        const cx = x * TL + spots[si][0] + ((hs >>> 5) % 7) - 3;
        const foot = y * TL + spots[si][1] + ((hs >>> 8) % 5) - 2;
        g.drawImage(art, cx - (art.width >> 1), foot - art.height);
      }
      // …and a few loose chips at the skirt, so the sheet frays into the
      // grass instead of ending on a sprite edge
      g.fillStyle = '#88867b';
      for (let ci = 0; ci < 3; ci++) {
        const hc = (h ^ Math.imul(ci + 9, 0x85EBCA6B)) >>> 0;
        g.fillRect(x * TL + (hc % 28) + 2, y * TL + ((hc >>> 7) % 26) + 4, 2, 1);
      }
      return;
    }
    const step = LAND.ROCK_STEP, jit = LAND.ROCK_JIT;
    // depth in TILES at a fractional tile position — bilinear over tile centres
    const depth = (wx, wy) => {
      const sx = wx - 0.5, sy = wy - 0.5;
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      const at = (a, b) => (a < 0 || b < 0 || a >= W || b >= H) ? 0 : d[b * W + a];
      const t0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
      const t1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
      return t0 + (t1 - t0) * fy;
    };
    if (!this._latOne) this.landLattices();      // not per tile: it hashes a key
    const lat = this._latOne.rock;
    const rocks = [];
    const g0 = Math.floor(x * TL / step) - 1, g1 = Math.ceil((x + 1) * TL / step) + 1;
    const h0 = Math.floor(y * TL / step) - 1, h1 = Math.ceil((y + 1) * TL / step) + 1;
    for (let gy = h0; gy <= h1; gy++) for (let gx = g0; gx <= g1; gx++) {
      const jx = (this._lh(gx, gy, 5) - 0.5) * 2 * jit, jy = (this._lh(gx, gy, 6) - 0.5) * 2 * jit;
      const px2 = gx * step + jx, py = gy * step + jy;
      // each rock belongs to exactly ONE tile — the one its centre falls in —
      // so the 5x5 pass never draws the same stone twice
      if (px2 < x * TL || px2 >= (x + 1) * TL || py < y * TL || py >= (y + 1) * TL) continue;
      const wx = px2 / TL, wy = py / TL;
      const cov = depth(wx, wy) + (this._latRead(lat, wx, wy) - 0.5) * 2 * LAND.ROCK_WANDER;
      if (cov <= 0.5) continue;
      if (cov < LAND.ROCK_FRINGE
        && this._lh(gx, gy, 7) > (cov - 0.5) / (LAND.ROCK_FRINGE - 0.5)) continue;
      const rr = Math.max(LAND.ROCK_MIN, Math.min(LAND.ROCK_MAX,
        Math.round(LAND.ROCK_MIN + (cov - 0.75) * LAND.ROCK_GROW)));
      const vs = (this._lh(gx, gy, 10) * 6) | 0;
      rocks.push([px2, py, rr, vs]);
    }
    /* A WORKABLE TILE IS NEVER INVISIBLE. A lone seeded tile (the start
       guarantee plants singles) reads a bilinear depth well under the fringe
       gate, and with the sparser ore lattice it could come up EMPTY — a
       harvestable resource with nothing drawn on it, the exact lie the
       readability rule exists to prevent. Any hills tile the lattice left
       bare gets one centred boulder of its own. */
    if (!rocks.length) {
      const jx = (this._lh(x, y, 21) - 0.5) * 8, jy = (this._lh(x, y, 22) - 0.5) * 6;
      rocks.push([(x + 0.5) * TL + jx, (y + 0.5) * TL + jy,
        LAND.ROCK_MIN + ((this._lh(x, y, 23) * 3) | 0), (this._lh(x, y, 24) * 6) | 0]);
    }
    // back to front, so a boulder in front occludes the one behind it
    rocks.sort((a, b) => a[1] - b[1]);
    /* ORE, NOT RUBBLE (Part B1): the deposit is built from Sprites.oreStamp —
       round, bright, clean-outlined boulders with a quarried face — while the
       mountains keep the angular rockStamp. The contrast is deliberate: at a
       glance, round-and-bright is a resource you cut, sharp-and-dark is a
       wall you walk around. */
    for (const [px2, py, rr, vs] of rocks) {
      const st = Sprites.oreStamp(rr, vs, false);
      g.drawImage(st, Math.round(px2) - st._ox, Math.round(py) - st._oy);
    }
  },
  /* THE SAME CORE-DENSE / EDGE-SPARSE LOGIC, for the deposits that are made
     of AUTHORED whole-tile art rather than scattered stamps — the woods and
     the orchard/berry ground. Their density still steps sparse -> medium ->
     dense, but the step from sparse to medium used to fall exactly on "four
     neighbours of my own kind", which is a property of the tile grid and
     drew it: a ring of medium tiles in a tidy square around every core.
     Displacing the threshold with the same world-space noise the rock
     outline uses makes that ring wander instead.

     The FULL set keeps its hard `cnt === 8` gate and is deliberately not
     noised: those tiles carry crowns CUT BY THE TILE EDGE, and they only
     match up because every neighbour is the same kind. Promote one to the
     border and the wood shows half a tree against open grass. */
  /* WHICH STAND STANDS HERE. Density from how enclosed the tile is: a
     lone/edge tile is SPARSE, a perimeter tile MEDIUM, a fully-surrounded
     core tile DENSE — a natural gradient of individual trees, thickening
     toward the heart of the wood, with a rare character tile (fallen log /
     cut stumps / bramble) deep inside for flavour. ONLY a tile fully ringed
     by forest (cnt === 8) may use the dense straddling set (whose crowns are
     cut by the tile edge) or a character tile — its cut edges always abut
     more forest; any tile touching a non-forest neighbour uses the
     complete-tree edge sets, so the wood's visible border never shows half a
     tree. Mixed hash for both variant and density, so there is no diagonal
     grid. Factored out of drawTile because startTreeFall needs the SAME
     answer — the stand that topples has to be the stand that was standing. */
  forestSpriteAt(x, y, terr) {
    terr = terr || S.map.seenTerrain || S.map.terrain;
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    let cnt = 0;
    for (const [ox, oy] of NEIGH8)
      if (MapGen.inB(x + ox, y + oy) && terr[MapGen.idx(x + ox, y + oy)] === T.FOREST) cnt++;
    const hp = (h ^ (h >>> 13)) >>> 0;
    const set = cnt === 8
      ? (hp % 11 === 0 ? Sprites.terrainRare[T.FOREST] : Sprites.terrainFull[T.FOREST])
      : this.denseEdge(x, y, cnt) ? Sprites.terrainMed[T.FOREST] : Sprites.terrain[T.FOREST];
    return set[hp % set.length];
  },
  denseEdge(x, y, cnt) {
    if (cnt >= 6) return true;
    if (cnt < 3) return false;
    if (!this._latOne) this.landLattices();
    return cnt + (this._latRead(this._latOne.rock, x + 0.5, y + 0.5) - 0.5) * 2 * LAND.DENSE_WANDER >= 4;
  },

  /* ===== WORLD-SPACE FOREST STAMPING (the Gate B stand-down, part 3) =====
     Self-contained tile canvases could never let a crown cross a tile edge,
     and three density classes step where a wood should thicken smoothly —
     both read as a grid once real art went in. With a tree catalog installed
     the wood is drawn in WORLD SPACE instead: every forest tile derives its
     own layout deterministically (landSeed + tile coords — no more 8 canned
     variants), density is a CONTINUOUS count from the same enclosure+lattice
     field the classes read, and stamps are y-sorted ACROSS tile boundaries
     so crowns overlap and interleave with no rectangular seam anywhere.
     TILE DATA IS NOT TOUCHED — this is a drawing of the wood, not a
     definition of it: yields, occupancy, pathing and fog all keep reading
     the grid. The RARE character tiles keep their whole canvas (feature,
     elder and ring are a composition), a supplied whole-tile forest.png
     override still outranks everything, and an EMPTY catalog never enters
     this path at all — the procedural per-tile wood remains byte-identical
     and remains the A/B baseline. */
  _stampMode() {
    return !!(typeof Assets !== 'undefined' && Assets.trees
      && (Assets.trees['dome-l'] || Assets.trees['dome-s']));
  },
  /* which PLANT a fertile tile drew — the same variant arithmetic drawTile
     uses (set of six, even indices orchard, odd berry), so the harvest pose
     always matches the picture. Pure in (x, y). */
  fertileKindAt(x, y) {
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    const hp = (h ^ (h >>> 13)) >>> 0;
    return (hp % 6) & 1 ? 'berry' : 'orchard';
  },
  forestRareAt(x, y, terr) {
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    let cnt = 0;
    for (const [ox, oy] of NEIGH8)
      if (MapGen.inB(x + ox, y + oy) && terr[MapGen.idx(x + ox, y + oy)] === T.FOREST) cnt++;
    const hp = (h ^ (h >>> 13)) >>> 0;
    return (cnt === 8 && hp % 11 === 0) ? Sprites.terrainRare[T.FOREST][hp % Sprites.terrainRare[T.FOREST].length] : null;
  },
  /* one tile's trees, in world pixels: pure in (landSeed, tile, neighbour
     count, lattice) — the bake, the incremental repaint and the tree-fall
     all call this and always agree. Foot anchors (wy is where trunk meets
     ground); pickRr carries the dense-area small-pieces rule decided at
     layout time, where the density is known. */
  forestLayoutAt(tx, ty, terr) {
    if (terr[MapGen.idx(tx, ty)] !== T.FOREST || this.forestRareAt(tx, ty, terr)) return [];
    let cnt = 0;
    for (const [ox, oy] of NEIGH8)
      if (MapGen.inB(tx + ox, ty + oy) && terr[MapGen.idx(tx + ox, ty + oy)] === T.FOREST) cnt++;
    if (!this._latOne) this.landLattices();
    const wander = (this._latRead(this._latOne.rock, tx + 0.5, ty + 0.5) - 0.5) * 2 * LAND.DENSE_WANDER;
    // a FULLY ENCLOSED tile is full density, full stop — the lattice wander
    // shapes the fringe gradient, exactly as denseEdge only consulted it for
    // the in-between counts; letting it thin the core opened the canopy the
    // occupancy pin insists stays closed
    const d = cnt >= 8 ? 1 : Math.max(0, Math.min(1, (cnt + wander) / 8));
    const n = 2 + d * 23;                       // continuous: ~2 lone … all 25 cells packed
    /* THE SHORELINE SETBACK (the referee's merge note): there is always a
       strip of green between the beach and the first crowns. Any side of
       this tile that faces water — orthogonal or around a corner — culls
       every tree whose crown box would reach within SETBACK px of that
       edge; the trace's own wobble and the drawn sand live inside that
       strip. Culled AFTER the cell's draws are burned, so the layout for
       every inland tile is bit-for-bit what it was. */
    const wetT2 = (x2, y2) => { if (!MapGen.inB(x2, y2)) return false; const t2 = terr[MapGen.idx(x2, y2)]; return t2 === T.WATER || t2 === T.MOAT; };
    const sW = wetT2(tx - 1, ty) || wetT2(tx - 1, ty - 1) || wetT2(tx - 1, ty + 1);
    const sE = wetT2(tx + 1, ty) || wetT2(tx + 1, ty - 1) || wetT2(tx + 1, ty + 1);
    const sN = wetT2(tx, ty - 1) || wetT2(tx - 1, ty - 1) || wetT2(tx + 1, ty - 1);
    const sS = wetT2(tx, ty + 1) || wetT2(tx - 1, ty + 1) || wetT2(tx + 1, ty + 1);
    const SETBACK = 8;
    const KINDS = Sprites.TREE_KINDS;
    // masked to 31 bits: a negative seed sends the Park-Miller step negative
    // and every r() with it — measured as "roll >= keep" never trimming, so
    // half the map's tiles packed all 25 cells whatever their density
    const seed = ((this.landSeed() ^ Math.imul(tx + 7, 0x9E3779B1) ^ Math.imul(ty + 13, 0x85EBCA6B)) & 0x7fffffff) || 1;
    const r = ART.rng(seed);
    const dom = KINDS[(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 13) % KINDS.length];
    const young = ((seed >>> 9) & 3) === 0;     // one sparse tile in four is a growing stand
    const out = [];
    const step = 7, keep = n / 25;              // the 5x5 lattice, thinned to the count
    for (let gy = 1, row = 0; gy <= 29; gy += step, row++)
      for (let gx = (row & 1) ? 4 : 1; gx <= 29; gx += step) {
        const roll = r(), jx = ((r() * 7) | 0) - 3, jy = ((r() * 7) | 0) - 3;
        const rr = 4 + Math.min((r() * 5) | 0, (r() * 5) | 0) + ((r() < 0.18) ? 1 : 0) + (d > 0.8 ? 1 : 0);
        const kind = r() < 0.7 ? dom : KINDS[(r() * KINDS.length) | 0];
        const ramp = Sprites.treeRamp(kind, r);
        if (roll >= keep) continue;             // every cell burns the same draws, kept or not
        const lx = Math.max(2, Math.min(30, gx + jx)), ly = Math.max(3, Math.min(31, gy + jy));
        // the CORE closes its canopy with the big tier from rr 7 up (half its
        // slots — overlapping big crowns are what a closed canopy is, and the
        // y-sort keeps them interleaving instead of Gate A's canvas mud); the
        // in-between densities lean small; the OPEN FRINGE stands TALL (the
        // referee's live-play note: sparse stands are the same trees as the
        // dense wood, just fewer — full crowns with visible trunks, clearly
        // trees) except on the occasional YOUNG stand, one sparse tile in
        // four, where the small tier reads as the forest growing
        const pickRr = d > 0.8 ? (rr >= 7 ? 8 : rr) : d > 0.6 ? Math.min(rr, 8)
          : (young ? rr : Math.max(rr, 8));
        const w2 = pickRr >= 8 ? 11 : 6, hh = pickRr >= 8 ? 22 : 12;   // the crown box
        if (sW && lx - w2 < SETBACK) continue;
        if (sE && lx + w2 > 32 - SETBACK) continue;
        if (sN && ly - hh < SETBACK) continue;
        if (sS && ly > 32 - SETBACK) continue;
        out.push({ wx: tx * CFG.TILE + lx, wy: ty * CFG.TILE + ly, rr, pickRr, kind, ramp });
      }
    /* A FOREST TILE ALWAYS SHOWS A TREE. The setback can cull a lone islet
       or a thin coastal tile down to nothing, and a bare-looking tile that
       blocks movement and yields wood is a lie the player acts on. One
       small tree stands at the tile's most-inland valid spot — inside the
       setback windows by construction. */
    if (!out.length) {
      const lx = sW && !sE ? 22 : sE && !sW ? 10 : 16;
      const ly = sN && !sS ? 26 : 21;
      out.push({ wx: tx * CFG.TILE + lx, wy: ty * CFG.TILE + ly, rr: 4 + (seed >>> 7) % 2,
                 pickRr: 4, kind: dom, ramp: Sprites.treeRamp(dom, r) });
    }
    return out;
  },
  /* stamp a list of trees in global paint order (wy, then wx): an authored
     piece from the catalog where one fits the slot, the slot's own
     procedural DOME otherwise (the species collapse holds here too). */
  _stampForest(g, trees) {
    trees.sort((a, b) => (a.wy - b.wy) || (a.wx - b.wx));
    const fG = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, (w || 1), (h || 1)); };
    for (const t of trees) {
      const h2 = (t.wx * 73856093 ^ t.wy * 19349663) >>> 0;
      const art = Assets.treePiece(t.kind, t.pickRr, h2);
      if (art) g.drawImage(art, t.wx - (art.width >> 1), t.wy - art.height);
      else Sprites.drawTree(fG, t.wx, t.wy - t.rr - 3, t.rr, t.ramp, 'round');
    }
  },
  // the full bake's band: trees whose BASE tile row is in [a, b) — bands run
  // top to bottom and each band y-sorts internally, so the order is the
  // global order, and a crown crossing up into the finished band above is
  // exactly the nearer-tree-drawn-later rule
  forestStampBand(g, a, b) {
    if (!this._stampMode()) return;
    const terr = S.map.seenTerrain || S.map.terrain;
    const trees = [];
    for (let ty = a; ty < b; ty++) for (let tx = 1; tx < CFG.W - 1; tx++)
      if (terr[ty * CFG.W + tx] === T.FOREST) trees.push(...this.forestLayoutAt(tx, ty, terr));
    if (trees.length) this._stampForest(g, trees);
  },
  // the incremental repaint's version: every tree based in the reset set or
  // one ring out (a crown reaches under a tile) — the caller has the reset
  // clip active, so pixels outside the erased ground never re-composite
  forestStampsNear(g, tileKeys, terr) {
    if (!this._stampMode()) return;
    const W = CFG.W, seen = new Set(), trees = [];
    for (const k of tileKeys) {
      const x = k % W, y = (k / W) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy, nk = ny * W + nx;
        if (!MapGen.inB(nx, ny) || seen.has(nk)) continue;
        seen.add(nk);
        if (terr[nk] === T.FOREST) trees.push(...this.forestLayoutAt(nx, ny, terr));
      }
    }
    if (trees.length) this._stampForest(g, trees);
  },

  /* LOOSE CHIPS ON THE GROUND OUTSIDE. Scree is what a crag sheds, it is
     walkable, and it is what lets the deposit's outline fade instead of
     stopping at a line. Only ever 1-2px, and only on ground that touches the
     deposit — never a boulder, which would read as an obstruction. */
  rockScree(g, x, y, terr) {
    const AP = ART.PALETTE, TL = CFG.TILE, W = CFG.W, H = CFG.H;
    const t = terr[MapGen.idx(x, y)];
    if (t !== T.GRASS && t !== T.STUMPS && t !== T.BARREN && t !== T.PEBBLES) return;
    /* an INDEXED neighbour walk, not `for (const [ox, oy] of NEIGH8)`. This
       runs on every tile of the map in the bake, and destructuring an array
       of pairs allocates an iterator and a pair per neighbour — 34,000
       allocations a bake, measured at 11ms of it. */
    let near = false;
    for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && terr[ny * W + nx] === T.HILLS) { near = true; break; }
    }
    if (!near) return;
    let hh = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ this.landSeed()) >>> 0;
    const rnd = () => { hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = (hh ^ (hh >>> 12)) >>> 0; return hh / 4294967295; };
    const P = AP.oreD;
    for (let i = 0; i < 4; i++) {
      if (rnd() > LAND.ROCK_SCREE) continue;
      const cx = x * TL + ((rnd() * TL) | 0), cy = y * TL + ((rnd() * TL) | 0);
      const w = 2 + ((rnd() * 2) | 0);
      // a round pebble in the deposit's OWN ramp (oreD, the darker deposit
      // stone) — the spill that says "the ore is over there", in the ore's
      // own language
      g.fillStyle = P[1]; g.fillRect(cx, cy + 1, w, 2);
      g.fillStyle = P[3]; g.fillRect(cx, cy, w, 2);
      g.fillStyle = P[5]; g.fillRect(cx, cy, 1, 1);
    }
  },

  /* one decal, in the world's own palette. Pixel shapes only — a few
     fillRects at the tile's own 1/16 unit, so they sit in the same rendering
     language as everything drawn beside them. */
  drawDecal(g, dx, dy, kind, px, rnd) {
    const AP = ART.PALETTE;
    /* EVERY GROUND DECAL IS PULLED TOWARD THE GRASS IT LIES ON. Muting at the
       point of drawing rather than by re-picking every colour by hand means
       one dial governs the whole layer and no decal can be forgotten — and it
       applies to the shore stones too, which come through the same door.
       The shore caller passes its own mute so a wet stone can stay a little
       crisper than a tuft in a meadow. */
    const M = (this._decalMute == null ? LAND.DECAL_MUTE : this._decalMute);
    // WHAT the mute pulls toward is the medium the decal lies ON — grass for
    // the meadow scatter, but the underwater life passes the water body
    // instead (this._decalMuteTo): a kelp frond pulled toward GREEN while
    // lying on blue water just goes dark, which is a smudge, not a shadow.
    const MT = this._decalMuteTo || AP.grass[2];
    // …memoised, because this runs several times per decal and thousands of
    // times per bake, and re-parsing two hex strings each time to arrive at an
    // answer that only ever depends on (colour, mute, target) is pure waste
    if (!this._mixC) this._mixC = new Map();
    const cache = this._mixC;
    const mix = (c) => {
      if (!M) return c;
      const k = c + '|' + M + '|' + MT;
      let v = cache.get(k);
      if (v) return v;
      const gr = [parseInt(MT.slice(1, 3), 16), parseInt(MT.slice(3, 5), 16), parseInt(MT.slice(5, 7), 16)];
      const r0 = parseInt(c.slice(1, 3), 16), g0 = parseInt(c.slice(3, 5), 16), b0 = parseInt(c.slice(5, 7), 16);
      const f2 = (a, b) => Math.round(a + (b - a) * M).toString(16).padStart(2, '0');
      v = '#' + f2(r0, gr[0]) + f2(g0, gr[1]) + f2(b0, gr[2]);
      cache.set(k, v);
      return v;
    };
    const q = (ox, oy, w, h, c) => { g.fillStyle = mix(c); g.fillRect(dx + ox * px, dy + oy * px, w * px, h * px); };
    /* EVERY DECAL GETS A DARK FOOT. A tuft painted in the greens either side
       of the grass base is invisible against it — the first version of this
       drew two thousand decals nobody could see. The dark contact pixel is
       what separates a small object from the ground it stands on, and the
       bright tip is what gives it a lit side; between them a five-pixel
       shape reads at a glance. */
    const D = AP.grass[0];                    // the shadow every one of them casts
    switch (kind) {
      /* OPEN-GROUND DECALS ARE FLAT AND WIDE. These were drawn as three
         blades rising to a bright centre — which at 2px a unit is a small
         green triangle with a dark foot, i.e. a SAPLING. Scattered over a
         meadow they read as scrub and compete with the real woods. A tuft
         lying in grass is wider than it is tall; the silhouette is what
         decides whether the eye files it as ground texture or as an object. */
      /* the contact shadow is ONE pixel, not a bar. Flattened, these decals
         are a single row of blades, so a shadow as wide as the splay outweighs
         it and the tuft reads as a dark dash lying in the grass. */
      case 'tuft':                                                  // a low splay
        q(1, 1, 1, 1, D);
        q(0, 0, 1, 1, AP.grass[3]); q(1, 0, 1, 1, AP.grass[4]);
        q(2, 0, 1, 1, AP.grass[4]); q(3, 0, 1, 1, AP.grass[3]); break;
      case 'tuft2':                                                 // wider, broken
        q(2, 1, 1, 1, D);
        q(0, 0, 1, 1, AP.grass[3]); q(1, 0, 1, 1, AP.grass[4]);
        q(3, 0, 1, 1, AP.grass[4]); q(4, 0, 1, 1, AP.grass[3]);
        q(5, 0, 1, 1, AP.grass[3]); break;
      case 'clover':
        q(1, 1, 1, 1, D);
        q(0, 0, 1, 1, AP.grass[4]); q(2, 0, 1, 1, AP.grass[4]); q(1, 0, 1, 1, AP.grass[3]); break;
      case 'fern':
        q(1, 4, 1, 1, D);
        q(1, 0, 1, 4, AP.leaf[3]); q(0, 1, 1, 1, AP.leaf[2]); q(2, 1, 1, 1, AP.leaf[2]);
        q(0, 3, 1, 1, AP.leaf[1]); q(2, 3, 1, 1, AP.leaf[1]); break;
      case 'flower': {                                              // a clump, not a plant
        /* NOT THE ACCENT RAMPS. This drew from bloom[2] and gold[2] — bright
           yellows a couple of percent apart, and gold[2] IS the colour of the
           gold seam, the gold in the resource bar and the +gold float. A
           two-pixel yellow speck in a meadow therefore read as something the
           player could pick up, scattered a thousand times over the map. The
           petals are muted ochre and cream now (see DECAL_RESERVED). */
        const pet = [AP.bloom[0], AP.bone[2], AP.thatch[0], AP.bone[1], AP.bloom[0]][(rnd() * 5) | 0];
        q(1, 1, 1, 1, D);
        q(0, 0, 1, 1, pet); q(1, 0, 1, 1, pet); q(3, 0, 1, 1, pet); break;
      }
      case 'pebble':
        q(0, 2, 2, 1, D);
        q(0, 0, 2, 2, AP.stone[2]); q(0, 0, 1, 1, AP.stone[3]); q(1, 1, 1, 1, AP.stone[1]); break;
      case 'stone':
        q(1, 3, 2, 1, D);
        q(0, 1, 3, 2, AP.stone[2]); q(0, 0, 2, 1, AP.stone[3]); q(2, 2, 1, 1, AP.stone[0]); break;
      case 'twig':
        q(1, 2, 2, 1, D);
        q(0, 1, 3, 1, AP.wood[3]); q(2, 0, 1, 1, AP.wood[2]); q(3, 1, 1, 1, AP.wood[1]); break;
      case 'leaf':                                                  // dead leaf litter
        // russet and ochre, NOT the fire ramp it used to borrow: an orange
        // speck at the treeline is the game's own "this building is burning"
        // signal, which is the last thing ground texture may imitate.
        q(0, 1, 1, 1, D);
        q(0, 0, 2, 1, AP.hide[2]); q(1, 0, 1, 1, AP.thatch[0]); break;
      case 'reed':
        q(1, 5, 1, 1, D);
        q(0, 2, 1, 3, AP.leaf[3]); q(1, 0, 1, 5, AP.grass[4]); q(2, 1, 1, 4, AP.leaf[3]);
        q(1, 0, 1, 1, AP.thatch[0]); break;   // a dull seed head — never the bright brass
      case 'damp':
        q(0, 0, 2, 1, AP.leaf[1]); q(1, 1, 1, 1, AP.leaf[2]); break;
      case 'scuff':
        q(0, 0, 3, 1, AP.soil[2]); q(1, 1, 1, 1, AP.soil[1]); break;
      /* ---- UNDER THE SURFACE (rocky shallows only) --------------------
         These are drawn BEFORE the shelf ribbons, so the five translucent
         bands of shallow water wash over them — which is what actually puts
         them under the surface, and costs nothing. Drawing them on top and
         hand-desaturating each colour would be the same picture arrived at
         by guesswork. They are DARK and low-contrast to begin with: the
         shallows are background, and anything bright down there competes
         with the shore it is supposed to sit behind. */
      case 'kelp':                                                  // fronds, leaning
        q(1, 0, 1, 5, AP.leaf[0]); q(0, 1, 1, 2, AP.leaf[1]);
        q(2, 2, 1, 2, AP.leaf[1]); q(2, 0, 1, 1, AP.leaf[0]); break;
      case 'coral':                                                 // a low branching clump
        q(0, 2, 4, 1, AP.hide[0]);
        q(1, 0, 1, 2, AP.hide[2]); q(0, 1, 1, 1, AP.hide[1]);
        q(2, 1, 1, 1, AP.hide[2]); q(3, 0, 1, 1, AP.hide[1]); break;
      case 'sunkrock':                                              // a dark submerged boulder
        q(0, 1, 4, 2, AP.ore[0]); q(1, 0, 2, 1, AP.ore[1]);
        q(0, 2, 1, 1, AP.ink[1]); break;
    }
  },

  /* ---- TERRAIN TRANSITIONS: THE MASK IS CODE, THE MATERIAL IS THE TERRAIN'S
     Every boundary in the enum gets an irregular fringe of the encroaching
     terrain's OWN material eating into its neighbour, so a stand of barren
     ground bleeds into the turf around it instead of stopping at a ruled
     line. Nothing here is authored art: the geometry is generated and the
     fill is whatever that terrain is made of — which is why it costs no new
     files, covers every pair automatically, and picks up a dropped-in
     assets/terrain/*.png for free.

     THE PROFILE IS SAMPLED IN WORLD SPACE, not per tile. That is what makes a
     long boundary read as one wandering edge rather than as a row of
     identical scallops: neighbouring tiles read the same continuous noise
     and their fringes line up across the seam. The hash gives every stretch
     its own shape, so no two runs repeat.

     Which side gives way is BLEED_RANK — a property of the material, not a
     hand-kept list of pairs; the pairs themselves are derived by walking the
     enum. Equal rank means no fringe (two grass-floored resources already
     share a floor and have nothing to blend). */
  bleedRank(t) {
    if (t === T.WATER || t === T.MOAT) return 0;      // handled by the shoreline
    if (t === T.TRENCH) return 1;
    if (t === T.RUIN) return 6;
    if (t === T.CAMP) return 5;
    if (t === T.BARREN) return 4;
    if (t === T.PEBBLES || t === T.STUMPS) return 3;
    return 2;                                          // grass and its resources
  },
  floorInk(t) { return Sprites.blendCol[t] || null; },

  /* depth of the fringe at a point ON the seam, in 1/16ths of a tile. Reads
     the shared world-space profile, so both sides of a seam agree. */
  edgeDepth(wx, wy) {
    this.landLattices();
    const v = this._latRead(this._latOne.edge, wx, wy);
    const d = Math.round(v * v * (LAND.EDGE_MAX + 1.2));       // squared: mostly shallow, occasionally deep
    return d > LAND.EDGE_MAX ? LAND.EDGE_MAX : d;
  },

  terrainEdges(g, x, y, terr) {
    const t = terr[MapGen.idx(x, y)];
    const mine = this.bleedRank(t), ink = this.floorInk(t);
    if (mine === 0) return;                    // water: the shoreline owns it
    const TL = CFG.TILE, px = TL / 16;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (!MapGen.inB(nx, ny)) continue;
      const tt = terr[MapGen.idx(nx, ny)];
      if (tt === t) continue;
      const rank = this.bleedRank(tt);
      if (rank <= mine) continue;              // only the stronger material intrudes
      const c = this.floorInk(tt);
      if (!c || c === ink) continue;           // same floor — nothing to blend
      g.fillStyle = c;
      for (let i = 0; i < 16; i++) {
        // sample ON the shared seam so the neighbour's own fringe agrees with ours
        const wx = ox ? x + (ox > 0 ? 1 : 0) : x + (i + 0.5) / 16;
        const wy = oy ? y + (oy > 0 ? 1 : 0) : y + (i + 0.5) / 16;
        const d = this.edgeDepth(wx * 1.0 + (ox ? (i + 0.5) / 16 : 0), wy * 1.0 + (oy ? (i + 0.5) / 16 : 0));
        if (d <= 0) continue;
        if (ox === 1) g.fillRect(x * TL + TL - d * px, y * TL + i * px, d * px, px);
        else if (ox === -1) g.fillRect(x * TL, y * TL + i * px, d * px, px);
        else if (oy === 1) g.fillRect(x * TL + i * px, y * TL + TL - d * px, px, d * px);
        else g.fillRect(x * TL + i * px, y * TL, px, d * px);
      }
    }
  },

  /* =====================================================================
     SHORELINE BY REGION TRACING

     A coast drawn PER TILE cannot stop looking like tiles. Irregular fringes
     and wandering widths help, but the staircase underneath is tile-SCALE, so
     no amount of within-tile detail removes it — the eye reads the 45-degree
     run of corners straight through the decoration. The only fix is to stop
     drawing the edge tile by tile and start drawing it as a CURVE.

     So each contiguous body of water is treated as one region:

       1. FLOOD  4-connected water cells into regions (WATER and MOAT alike).
       2. TRACE  the boundary as closed loops of unit edges — one loop for the
                 outer shore, one more for every island inside it.
       3. SMOOTH with Chaikin, several iterations, operating on the TILE-scale
                 lattice. This is the step that does the work: corner-cutting
                 at a scale LARGER than a tile turns a staircase into a
                 sweeping curve. Smoothing inside a tile would achieve nothing.
       4. RAGGED again — displace the smoothed points along their normals with
                 fine sub-tile noise. Smooth alone is a clean vector curve and
                 reads as synthetic; noise alone leaves the staircase. Both.

     The bands (sand, shelf, foam) are then offset OUTWARD and INWARD from
     that curve, not from tile edges, and the beach width rides its own noise
     along the run so it still swells and pinches to nothing.

     TILE DATA IS NOT TOUCHED. This is a drawing of the water, not a
     definition of it: passability, dock siting, shore orientation, fishing
     and naval movement all keep reading the tile grid, so the drawn sand may
     spill across a seam and the traced curve may cut inside a tile without
     any of them noticing. tests/land.mjs pins that invariance.

     Everything is cached: regions trace once per water change, the bands bake
     into a layer that is blitted, and nothing here runs per frame. ===== */

  _shore: null, _shoreKey: '',
  /* a cheap signature of WHERE THE WATER IS. Regions are re-traced only when
     this changes — a sapper flooding a ditch, a bridge, reclaimed land. */
  waterKey() {
    const terr = (S.map.seenTerrain || S.map.terrain);
    let h = 0x811c9dc5 ^ this.landSeed();
    for (let i = 0; i < terr.length; i++) {
      const t = terr[i];
      if (t === T.WATER || t === T.MOAT) { h ^= i; h = Math.imul(h, 0x01000193); }
    }
    return (h >>> 0) + ':' + CFG.W + 'x' + CFG.H;
  },

  /* FLOOD AND TRACE, for any predicate. Water and mountain both need "the
     contiguous areas of X, each as closed boundary polygons", and the tracer
     is the delicate half — see the vertex-list note below. One implementation,
     two callers. Loops come back RAW, on the tile lattice; what each caller
     does to them afterwards (the coast smooths then roughens, a mountain
     fractures) is its own business. */
  floodTrace(pred) {
    const W = CFG.W, H = CFG.H;
    const seen = new Uint8Array(W * H), regions = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!pred(x, y) || seen[y * W + x]) continue;
      // ---- 1. FLOOD (4-connected) ----
      const cells = [], st = [y * W + x];
      seen[y * W + x] = 1;
      while (st.length) {
        const k = st.pop(), cx = k % W, cy = (k / W) | 0;
        cells.push(k);
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + ox, ny = cy + oy;
          if (!pred(nx, ny) || seen[ny * W + nx]) continue;
          seen[ny * W + nx] = 1; st.push(ny * W + nx);
        }
      }
      // ---- 2. TRACE: every inside/outside edge, directed so loops chain ----
      /* A VERTEX CAN HAVE TWO EDGES LEAVING IT. Where two cells touch only at
         a CORNER, the boundary passes through that lattice point twice — once
         for each cell — and a Map keyed by the start vertex silently kept the
         second and threw the first away. The lost edge left the chain unable
         to close, so the walk produced a figure-of-eight that crossed itself
         and a stretch of real boundary that was never drawn at all. Each
         vertex therefore holds a LIST, and the walk takes one edge at a time.
         (Which of the two a walk takes at a diagonal pinch is arbitrary and
         does not matter: both are real boundary, and between them the two
         walks cover it exactly once.)

         The rotational order below is also load-bearing: every cell's edges
         are emitted top -> right -> bottom -> left, so the INSIDE is always
         on the left-hand normal of the direction of travel. Everything that
         offsets from one of these loops depends on that being a fact about
         how the loop was built rather than something sampled per point. */
      const edges = new Map();                 // "x,y" -> [[ax,ay,bx,by], …]
      const add = (ax, ay, bx, by) => {
        const k2 = ax + ',' + ay, cur = edges.get(k2);
        if (cur) cur.push([ax, ay, bx, by]); else edges.set(k2, [[ax, ay, bx, by]]);
      };
      for (const k of cells) {
        const cx = k % W, cy = (k / W) | 0;
        if (!pred(cx, cy - 1)) add(cx, cy, cx + 1, cy);              // top    →
        if (!pred(cx + 1, cy)) add(cx + 1, cy, cx + 1, cy + 1);      // right  ↓
        if (!pred(cx, cy + 1)) add(cx + 1, cy + 1, cx, cy + 1);      // bottom ←
        if (!pred(cx - 1, cy)) add(cx, cy + 1, cx, cy);              // left   ↑
      }
      const take = (k2) => {
        const list = edges.get(k2);
        if (!list || !list.length) return null;
        const e = list.pop();
        if (!list.length) edges.delete(k2);
        return e;
      };
      const loops = [];
      while (edges.size) {
        const first = edges.keys().next().value;
        const loop = [];
        let cur = first, e;
        while ((e = take(cur))) {
          loop.push([e[0], e[1]]);
          cur = e[2] + ',' + e[3];
        }
        if (loop.length >= 4) loops.push(loop);   // a degenerate stub is not a boundary
      }
      regions.push({ id: regions.length, cells, loops });
    }
    return regions;
  },

  waterRegions() {
    const key = this.waterKey();
    if (this._shoreKey === key && this._shore) return this._shore;
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const wet = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const t = terr[y * W + x];
      return t === T.WATER || t === T.MOAT;
    };
    // ---- 3 + 4. SMOOTH ABOVE TILE SCALE, THEN ROUGHEN BELOW IT ----
    const regions = this.floodTrace(wet);
    for (const r of regions) r.loops = r.loops.map(l => this.roughen(this.chaikin(l, LAND.SHORE_SMOOTH)));
    this._shore = regions; this._shoreKey = key;
    return regions;
  },

  /* HOW MUCH BAND A LOOP CAN CARRY. A band is an OFFSET of the shore curve,
     and no offset can reach further than the loop's own radius without
     turning inside out — pushed past the centre, the offset polyline inverts
     and the fill sprays outward instead of hugging the curve. A one-tile
     pond has a radius of about 0.4 tiles and the shelf reaches 0.69, which
     is exactly how a pond came to throw a pale wash four tiles across the
     grass. Effective radius from the enclosed area, so a long thin inlet is
     correctly judged narrow rather than large. */
  loopRadius(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.sqrt(Math.abs(a) / 2 / Math.PI);
  },

  /* CHAIKIN on a CLOSED loop. Each pass replaces every edge with points at
     1/4 and 3/4 of it, so corners are cut and the outline converges on a
     smooth curve. Run over the tile lattice, this is what dissolves a
     45-degree staircase into a sweep. */
  chaikin(pts, iters) {
    let p = pts;
    for (let it = 0; it < iters; it++) {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      p = out;
      if (p.length > LAND.SHORE_MAXPTS) break;      // a huge lake needs no more detail
    }
    return p;
  },

  /* …and put the ragged back. A Chaikin curve is a clean vector arc; a real
     waterline is not. Displaced along the normal from noise sampled in WORLD
     space, so the wobble is continuous along the run and identical on reload. */
  roughen(pts) {
    this.landLattices();
    const n = pts.length, out = new Array(n);
    // …but never by more than the loop can take: on a pond a couple of tiles
    // across, the full amplitude is a sizeable fraction of the radius and the
    // curve ties itself in a knot.
    const amp = Math.min(LAND.SHORE_NOISE, this.loopRadius(pts) * LAND.SHORE_NOISE_CAP);
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], p = pts[i];
      let nx = -(b[1] - a[1]), ny = (b[0] - a[0]);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      /* TWO OCTAVES, THE COARSE ONE DOMINANT. One octave at SHORE_NOISE_F
         put the lattice period at about two point-spacings along the curve —
         textbook aliasing, invisible on a curved shore where the chord
         directions scramble it, but on a dead-straight run it resolved into
         a REGULAR SAWTOOTH: a zigzag waterline with clockwork teeth eaten
         out of the beach, seen the day map generation started making long
         straight lake edges. The coarse octave carries the wander well above
         the sample spacing; the old frequency stays as a small detail term. */
      const d = ((this._latRead(this._latOne.edge, p[0] * LAND.SHORE_NOISE_F * 0.38, p[1] * LAND.SHORE_NOISE_F * 0.38) - 0.5)
        * 1.5 + (this._latRead(this._latOne.edge, p[0] * LAND.SHORE_NOISE_F + 40, p[1] * LAND.SHORE_NOISE_F + 40) - 0.5) * 0.5)
        * amp;
      out[i] = [p[0] + nx * d, p[1] + ny * d];
    }
    return out;
  },

  /* ---- THE BANDS, OFFSET FROM THE TRACED CURVE ------------------------
     Baked ONCE into its own transparent layer, which is then blitted over
     the tiles. Keeping it separate is what makes an incremental repaint
     exact: a changed tile re-blits its own rectangle of this layer instead
     of trying to re-derive a curve that belongs to the whole region.

     Widths ride their own noise along the run, so the beach still swells and
     pinches to nothing — but now along the curve rather than along the grid.
     Rocky coasts are handled here too (see landAt / the shoal branch). */
  _layerKey: '',
  buildShoreLayer() {
    /* THE LAYER HAS ITS OWN KEY, and it must: `_shoreKey` is the cache key for
       the traced REGIONS, and `waterRegions()` stamps it the moment anything
       asks for the geometry. Sharing it meant that any call which only wanted
       the regions — `paintWaterIn` asking `waterBodyPath`, say — silently
       marked the BANDS fresh without anyone having redrawn them, so `blitShore`
       skipped the rebuild and composited the old shore. That is what left a
       beach running down the middle of a flooded moat: the geometry knew the
       moat and the lake were one body, and the picture still had the sand. */
    this._layerKey = this.waterKey();
    const W = CFG.W, H = CFG.H, TL = CFG.TILE, AP = ART.PALETTE;
    const px = TL / 16;
    this._beachStrips = [];       // the beach rings, captured for the wave clamp
    if (!this._waveMaskC) {       // the clamp's scratch pair, allocated at bake
      this._waveMaskC = document.createElement('canvas');
      this._waveMaskC.width = 224; this._waveMaskC.height = 224;
      this._waveScratchC = document.createElement('canvas');
      this._waveScratchC.width = 224; this._waveScratchC.height = 224;
    }
    if (!this.shoreLayer) this.shoreLayer = document.createElement('canvas');
    this.shoreLayer.width = W * TL; this.shoreLayer.height = H * TL;
    const g = this.shoreLayer.getContext('2d');
    g.clearRect(0, 0, W * TL, H * TL);
    /* NOTHING IS DRAWN IN THE BLACK. The outermost ring is off-map void
       (MapGen.onBoard — the single declaration), painted flat black by
       drawTile; this layer is composited AFTERWARDS, so a sea that reaches
       the rim would lay its beach and its foam straight over the border.
       Every band is offset from a curve that can itself run along the rim,
       so clamping the geometry would mean clamping five different offsets —
       one clip is the honest version of the same rule. */
    g.save();
    g.beginPath(); g.rect(TL, TL, (W - 2) * TL, (H - 2) * TL); g.clip();
    const terr = (S.map.seenTerrain || S.map.terrain);
    const wetT = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const t = terr[y * W + x]; return t === T.WATER || t === T.MOAT;
    };
    /* WHICH SIDE THE LAND IS ON IS A PROPERTY OF THE LOOP, NOT OF A POINT.
       This used to ask the MAP, per point — step a little way along the
       normal and see whether you landed in water. That is fragile exactly
       where the roughened curve wobbles across a tile boundary or turns a
       tight corner, and on a real map 2.4% of points came back with a normal
       pointing the OPPOSITE way to both their neighbours'. One flipped point
       puts its offset on the far side of the curve, and since a band is
       filled as (base forward + offset reversed) the fill spans the jump —
       which is what painted pale blue wedges two tiles inland out of a tight
       bay. Nothing about a coastline is per-point, so nothing here samples
       per point any more.

       The tracer walks every water cell's own boundary in a fixed rotational
       order (top →, right ↓, bottom ←, left ↑), so the water is ALWAYS on
       the left-hand normal: for the top edge, direction (1,0) and (-dy, dx)
       = (0,1), which points down into the cell — and the same holds for the
       other three, and for an island's loop, whose edges still belong to the
       water cells around it. Chaikin and the roughening preserve point
       order, so they preserve the tangent, so they preserve this. It is a
       fact about how the loop was built, and it cannot flip. */
    const outward = (p, a, b) => {
      const nx = (b[1] - a[1]), ny = -(b[0] - a[0]);   // (dy, -dx): away from the water
      const len = Math.hypot(nx, ny) || 1;
      return [nx / len, ny / len];
    };
    // the land tile this point looks out onto, or -1 off the board
    const landAt = (p, nx, ny) => {
      const lx = Math.floor(p[0] + nx * 0.8), ly = Math.floor(p[1] + ny * 0.8);
      return (lx < 0 || ly < 0 || lx >= W || ly >= H) ? -1 : ly * W + lx;
    };
    // is the land off this point stony? -> a shoal, not a beach (Part 3)
    const stony = (p, nx, ny) => {
      const k = landAt(p, nx, ny);
      if (k < 0) return 0;
      const t = terr[k];
      return (t === T.HILLS || t === T.MOUNTAIN || t === T.PEBBLES) ? 1 : 0;
    };
    // the WATER tile this point looks back into — the inverse of landAt
    const wetAt = (p, nx, ny) => {
      const wx = Math.floor(p[0] - nx * 0.8), wy = Math.floor(p[1] - ny * 0.8);
      return (wx < 0 || wy < 0 || wx >= W || wy >= H) ? -1 : wy * W + wx;
    };
    /* ONLY NATURAL GROUND RAISES A SHORE — on BOTH sides of the waterline.
       Where a sapper filled water in, the sea beyond the new isthmus must
       read exactly as it did before it was built: no beach on ground that
       was open water last week, and the deep stays deep against it. (That
       half used to live in drawTile's `shoreLand` and came with the shore
       when it moved to the traced curve.)

       The other half is the same rule read the other way round. A MOAT is a
       CUT — a ditch a sapper dug and then let the water into — so its banks
       are spade-cut earth, not a beach that took a thousand years to build.
       Drawing the full shoreline treatment along one put a rim of sand and
       foam down both sides of the channel, and where the channel met the
       lake it fed it out of, that rim read as a SHORELINE SEPARATING THE
       TWO: a bar across a passage that is in fact open water end to end.
       So a moat's own waterline raises nothing, and since the changeover is
       smoothed like every other along the loop, the lake's beach simply
       fades out as it runs into the cut.  */
    const natural = (p, nx, ny) => {
      const w = wetAt(p, nx, ny);
      if (w >= 0 && terr[w] === T.MOAT) return 0;       // a dug channel has no shore
      const k = landAt(p, nx, ny);
      if (k < 0) return 1;
      return (S.map.reclaimed && S.map.reclaimed[k]) ? 0 : 1;
    };
    /* A BAND IS AN ANNULUS BETWEEN TWO CLOSED RINGS, and it is drawn as two
       closed SUBPATHS filled even-odd — never as one path that runs out along
       the base, back along the offset and joins the two ends. Those joins are
       real segments: they cut straight across the band at the loop's seam,
       and stacked five deep for the shelf they drew a dark mark at the start
       of every loop (the vertical streak at the top-left corner of every
       lake). With two rings there is no connector to draw, and even-odd
       fills between them whichever way round they are — which matters,
       because the shelf's offset lies inside the base and the beach's lies
       outside it. */
    const ribbon = (pts, offs, col) => {
      if (!offs || pts.length < 3 || offs.length < 3) return;
      g.beginPath();
      g.moveTo(pts[0][0] * TL, pts[0][1] * TL);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * TL, pts[i][1] * TL);
      g.closePath();
      // …the inner ring REVERSED, and filled NONZERO. Even-odd gives the same
      // annulus but flips on any self-intersection, and a roughened ring on a
      // tight curve does sometimes cross itself — which punched radial streaks
      // out of the shelf all round a bay. Opposite winding gets the annulus
      // from nonzero instead, which simply fills through a crossing.
      const last = offs.length - 1;
      g.moveTo(offs[last][0] * TL, offs[last][1] * TL);
      for (let i = last - 1; i >= 0; i--) g.lineTo(offs[i][0] * TL, offs[i][1] * TL);
      g.closePath();
      g.fillStyle = col; g.fill();
    };

    /* EACH BAND IS PENNED INTO ITS OWN SIDE. The geometry above should never
       stray now, but a band drawn from a curve has five offsets and any one
       of them is a place a future edit can get wrong — so the last word is a
       CLIP, which cannot be argued with. A water-side band (shelf, foam) may
       paint on water tiles and one tile of land beyond; a land-side band
       (beach, shoal, stones) on land tiles and one tile of water. The one
       tile of slack is what keeps the clip off the visible edge: every real
       band lives well inside it, so the waterline itself is still drawn by
       the traced curve and the grid never shows through. Two passes rather
       than two clips per loop — regions do not overlap, so the only order
       that matters is within a loop, and that is preserved. */
    const side = this.shoreSideMasks();
    for (const pass of [0, 1]) {
      g.save();
      g.clip(pass ? side.land : side.water);
      /* …AND THE WATER-SIDE BANDS ARE PENNED INSIDE THE PAINTED BODY ITSELF
         (LAND_REFRESH 1e, the concave-bay artifact). The tile mask above
         allows one tile of slack past the water, and on a tight concave bay
         the stacked shelf offsets cross the inlet's axis and land beyond the
         far shore — inside that slack, so the clip let them through: pale
         blue sprayed onto the grass ("blue shoreline artifacts"). Nested
         clips intersect, and the body path is exactly where paintWaterIn
         put the water, so a shelf can no longer exist where there is no
         body under it. Not a tile-exact mask: Chaikin cuts every concave
         corner, and the body legitimately lies over land-tile pixels there
         — a tile clip would notch the shelf at every one. One clip per
         layer bake, never per loop. The land-side pass keeps its slack:
         its offsets are a few sixteenths and never fold. */
      if (!pass) g.clip(this.waterBodyPath());
      for (const reg of this.waterRegions()) for (const loop of reg.loops) {
      const n = loop.length;
      if (n < 4) continue;
      const nrm = new Array(n), rock = new Array(n), nat = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = loop[(i - 1 + n) % n], b = loop[(i + 1) % n];
        nrm[i] = outward(loop[i], a, b);
        rock[i] = stony(loop[i], nrm[i][0], nrm[i][1]);
        nat[i] = natural(loop[i], nrm[i][0], nrm[i][1]);
      }
      /* BLEND THE CHANGEOVERS along the coast. Switching at the tile where the
         terrain changes puts a hard join in the middle of a curve; a short
         running average makes one give way to the other. Both the rock/sand
         changeover and the natural/reclaimed one are smoothed this way. */
      const R2 = LAND.SHOAL_BLEND;
      const smooth = (src) => {
        const o = new Array(n);
        for (let i = 0; i < n; i++) {
          let s = 0, c = 0;
          for (let k = -R2; k <= R2; k++) { s += src[(i + k + n) % n]; c++; }
          o[i] = s / c;
        }
        return o;
      };
      const rockS = smooth(rock), natS = smooth(nat);
      /* the beach's own width wanders along the run — the same noise the old
         per-tile band used, now sampled along the CURVE, so a shore still
         swells and pinches to nothing without any reference to the grid. */
      const wAt = i => this._latRead(this._latOne.sand,
        loop[i][0] * LAND.SAND_FREQ * 3.1, loop[i][1] * LAND.SAND_FREQ * 3.1);
      /* AN OFFSET CURVE EATS ITSELF ON A TIGHT CONCAVE TURN. Where the radius
         of curvature is smaller than the offset distance — the head of a
         narrow inlet, the neck of a one-tile channel — the offset points
         overtake each other and the polyline doubles back, which fills as a
         spurious loop hanging off the band. The reversal is exactly the
         signal: an offset segment whose direction OPPOSES the base segment it
         came from is inside such a loop, so those points are dropped. The
         band then bridges the pinch in a straight line, which is what a
         beach does at the head of an inlet anyway. */
      const prune = (o) => {
        /* …and where it does, the offset point is COLLAPSED ONTO THE BASE
           rather than dropped. A band is filled as one closed path — the base
           forward, then the offset reversed — so the two arrays must stay
           index-for-index aligned: dropping points slides the correspondence
           and the closing connector becomes a long chord straight across the
           band, which drew a dark streak at the start of every loop (visible
           as a vertical mark at the top-left corner of every lake). Collapsed
           to zero width the band simply pinches shut there, which is what it
           should do at the head of an inlet anyway — and if the whole offset
           has turned inside out the band collapses entirely and nothing is
           drawn, with no special case needed. */
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const bx = loop[j][0] - loop[i][0], by = loop[j][1] - loop[i][1];
          const ox = o[j][0] - o[i][0], oy = o[j][1] - o[i][1];
          /* …nearly onto the base, never EXACTLY onto it. Collapsed the whole
             way the two rings TOUCH, and an even-odd fill flips wherever its
             two boundaries meet — which punched triangular wedges of missing
             shelf out of every small lake. Leaving a hair of offset keeps the
             rings strictly separate, and at this width the band is invisible
             there anyway, which is what "pinched shut" is supposed to mean. */
          if (bx * ox + by * oy < 0)
            o[i] = [loop[i][0] + (o[i][0] - loop[i][0]) * LAND.BAND_PINCH,
                    loop[i][1] + (o[i][1] - loop[i][1]) * LAND.BAND_PINCH];
        }
        return o;
      };
      // an offset polyline: + is outward onto the land, - is out into the water.
      // The magnitude is CLAMPED to the loop's own radius, so a band on a small
      // pond narrows to fit instead of inverting through its centre.
      const cap = this.loopRadius(loop) * LAND.BAND_CAP * 16;
      const off = (fn) => {
        const o = new Array(n);
        let maxd = 0;
        for (let i = 0; i < n; i++) {
          const p = loop[i], nn = nrm[i];
          let d = fn(i);
          if (d > cap) d = cap; else if (d < -cap) d = -cap;
          d /= 16;
          if (Math.abs(d) > maxd) maxd = Math.abs(d);
          o[i] = [p[0] + nn[0] * d, p[1] + nn[1] * d];
        }
        /* A FAR OFFSET IS RELAXED BEFORE IT IS FILLED (a reported screenshot:
           thin dark streaks fanning out from every shore, through the whole
           shelf, along the normals). Where the roughened base zigzags at
           point scale, the normals of neighbouring points CROSS once the
           offset is deep enough — the ring folds, the fold cancels the
           nonzero winding, and an UNFILLED radial sliver is punched through
           the band. Every stacked shelf ribbon shares the same base, so the
           slivers line up into one hairline of un-painted water per fold: a
           comb of dark spokes. The prune above only catches a fold that has
           fully REVERSED; a light 1-2-1 smoothing of the deep rings (same
           point count, so the base/offset index alignment the fill depends on
           is untouched) opens the near-folds instead. Shallow rings — the
           beach, the foam lip — keep their fine ragged edge: their offsets
           are too small to fold in the first place. */
        if (maxd > 0.25) {
          for (let pass2 = 0; pass2 < 2; pass2++) {
            const s = o.map((p, i) => {
              const a = o[(i - 1 + n) % n], b2 = o[(i + 1) % n];
              return [(a[0] + 2 * p[0] + b2[0]) / 4, (a[1] + 2 * p[1] + b2[1]) / 4];
            });
            for (let i = 0; i < n; i++) o[i] = s[i];
          }
        }
        const pr = prune(o);
        /* A RING THAT TURNED INSIDE OUT IS NOT A BAND (1e). The cap keeps an
           offset inside a small pond's radius, and the prune pinches the
           vertices that reversed — but a whole ring can still come out
           wound the other way, or collapsed to nothing, in the neck of a
           narrow inlet, and nonzero fill paints an inverted ring as a solid
           blob. Its signed area says so at once: opposite in sign to the
           base loop, or under a twentieth of it, and the band is dropped
           rather than drawn wrong. */
        const area = (pts) => {
          let a = 0;
          for (let i = 0, m = pts.length; i < m; i++) { const p = pts[i], q = pts[(i + 1) % m]; a += p[0] * q[1] - q[0] * p[1]; }
          return a;
        };
        const aB = area(loop), aO = area(pr);
        if (aB * aO < 0 || Math.abs(aO) < Math.abs(aB) * 0.05) return null;
        return pr;
      };
      /* THE SHELF, STACKED. One band would put a hard rim wherever it ended;
         several translucent bands of decreasing reach each add their own alpha,
         so the water pales continuously from deep to shore. Painted widest
         first, and every one of them measured from the curve. */
      if (!pass) {
      /* WHAT LIVES IN A ROCKY SHALLOW. Sand shelves carry nothing worth
         drawing at this scale; a rocky one has weed, coral heads and drowned
         boulders, and they are the whole reason to look at the water instead
         of past it. Gated on the SAME drift field the shore stones use, so
         the growth gathers where the stones gather — one rocky headland is
         busy and the next stretch is bare, which is what stops a scatter
         reading as wallpaper. Never on a sandy shore. */
      for (let i = 0; i < n; i += LAND.SHOAL_STEP) {
        if (rockS[i] < 0.35 || natS[i] < 0.5) continue;
        const p = loop[i], [nx, ny] = nrm[i];
        let hh = (Math.imul(Math.round(p[0] * 16) + 7, 0x85ebca6b)
          ^ Math.imul(Math.round(p[1] * 16) + 13, 0xc2b2ae35) ^ this.landSeed()) >>> 0;
        const rnd = () => { hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = (hh ^ (hh >>> 12)) >>> 0; return hh / 4294967295; };
        const drift = this._latRead(this._latOne.shoal, p[0] + 3.7, p[1] - 2.1);
        const gate = drift <= LAND.LIFE_GATE ? 0 : (drift - LAND.LIFE_GATE) / (1 - LAND.LIFE_GATE);
        if (rnd() > LAND.LIFE_CHANCE * rockS[i] * gate) continue;
        const d = -(1.5 + rnd() * LAND.LIFE_REACH) / 16;      // out into the shallows
        const u = rnd();
        // pulled hard toward the WATER, not the grass — see LIFE_MUTE
        this._decalMute = LAND.LIFE_MUTE; this._decalMuteTo = ART.PALETTE.water[1];
        this.drawDecal(g, (p[0] + nx * d) * TL, (p[1] + ny * d) * TL,
          u < 0.4 ? 'kelp' : u < 0.72 ? 'coral' : 'sunkrock', px * (0.75 + rnd() * 0.7), rnd);
        this._decalMute = null; this._decalMuteTo = null;
      }
      for (let k = LAND.SHELF_STEPS; k >= 1; k--) {
        const f = k / LAND.SHELF_STEPS;
        ribbon(loop, off(i => -(0.8 + wAt(i) * 0.55) * LAND.SHELF_REACH * f * natS[i]),
          'rgba(126,192,216,' + LAND.SHELF_ALPHA.toFixed(3) + ')');
      }
      ribbon(loop, off(i => -(0.5 + wAt(i)) * LAND.FOAM_W * natS[i]), AP.water[4]);  // the wet lip
      continue;
      }
      const beach = off(i => {                                             // the beach
        const w = wAt(i);
        return (LAND.SAND_MIN + w * w * (LAND.SAND_MAX - LAND.SAND_MIN)) * (1 - rockS[i]) * natS[i];
      });
      /* THE WAVE CLAMP borrows this exact ring: drawLivingWater clips a wave
         roll to water plus THIS band, so the crest may wash to the beach's
         inland edge — the drawn one, pinch-outs and rock gating included —
         and never a pixel past it. Captured as flat px pairs (base, then
         offset) with a bbox for the pick-time reject. */
      if (beach) {
        const m = loop.length, bs = new Float32Array(m * 4);
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (let i = 0; i < m; i++) {
          const bpx = loop[i][0] * TL, bpy = loop[i][1] * TL;
          bs[i * 4] = bpx; bs[i * 4 + 1] = bpy;
          bs[i * 4 + 2] = beach[i][0] * TL; bs[i * 4 + 3] = beach[i][1] * TL;
          if (bpx < bx0) bx0 = bpx; if (bpx > bx1) bx1 = bpx;
          if (bpy < by0) by0 = bpy; if (bpy > by1) by1 = bpy;
        }
        this._beachStrips.push({ p: bs, x0: bx0 - 14, y0: by0 - 14, x1: bx1 + 14, y1: by1 + 14 });
      }
      ribbon(loop, beach, AP.bone[2]);
      /* THE LIT LIP (Overhaul 2.3, behind SHORE_LIP): the bank's catch-light,
         a pixel or so of pale along the land side of the shores that FACE
         the sun — light is top-left, so a bank whose land lies south or
         east of the water shows the lit top of its edge. Weighted by the
         outward normal's lean toward south-east and smoothed along the run
         like the other changeovers, so it fades in and out around a bay
         rather than switching. */
      if (LAND.SHORE_LIP > 0) {
        const lipS = smooth(nrm.map(nn => Math.max(0, (nn[0] + nn[1]) * 0.7071)));
        ribbon(loop, off(i => LAND.SHORE_LIP_W * lipS[i] * natS[i]), 'rgba(255,248,222,' + (+LAND.SHORE_LIP).toFixed(3) + ')');
      }
      ribbon(loop, off(i => LAND.SHOAL_W * rockS[i] * natS[i]),            // wet rock
        'rgba(58,66,64,' + LAND.SHOAL_ALPHA.toFixed(2) + ')');
      /* THE STONES THEMSELVES. Stepping a fixed stride and rolling a fixed
         chance threads them along the curve at even spacing — a necklace of
         beads, which is exactly what a rocky shore is not. The roll is biased
         by a low-frequency field along the run instead, so they GATHER into
         drifts with bare stretches between, and each one is thrown a random
         distance either side of the waterline so some sit in the water. */
      for (let i = 0; i < n; i += LAND.SHOAL_STEP) {
        if (rockS[i] < 0.35 || natS[i] < 0.5) continue;
        const p = loop[i], [nx, ny] = nrm[i];
        let hh = (Math.imul(Math.round(p[0] * 16), 0x27d4eb2d)
          ^ Math.imul(Math.round(p[1] * 16), 0x165667b1) ^ this.landSeed()) >>> 0;
        const rnd = () => { hh = Math.imul(hh ^ (hh >>> 15), 0x2c1b3c6d); hh = (hh ^ (hh >>> 12)) >>> 0; return hh / 4294967295; };
        const drift = this._latRead(this._latOne.shoal, p[0], p[1]);
        const gate = drift <= LAND.SHOAL_GATE ? 0 : (drift - LAND.SHOAL_GATE) / (1 - LAND.SHOAL_GATE);
        if (rnd() > LAND.SHOAL_STONES * rockS[i] * gate) continue;
        const d = (rnd() - 0.45) * LAND.SHOAL_THROW / 16;
        this._decalMute = LAND.DECAL_MUTE_WET;
        this.drawDecal(g, (p[0] + nx * d) * TL, (p[1] + ny * d) * TL,
          rnd() < 0.55 ? 'pebble' : 'stone', px * (0.8 + rnd() * 0.9), rnd);
        this._decalMute = null;
      }
      }
      // …and the shore shadow last on the water side, over the shelf wash
      if (!pass) this.paintShoreShadow(g);
      g.restore();
    }
    g.restore();
  },

  /* THE TWO SIDES, AS CLIP PATHS. Water tiles dilated by one, and land tiles
     dilated by one — built once per water change and cached on the same key
     the regions use, since that is exactly when they can change. Rows are
     merged into runs so the path is a few hundred rectangles rather than
     four thousand. */
  /* THE WATER'S OWN OUTLINE, AS A CLIP PATH. Chaikin INSCRIBES its curve —
     the limit of corner-cutting a square is a B-spline that touches the edge
     midpoints and cuts every corner off — so the traced waterline sits INSIDE
     the tile boundary at every convex corner. `paintWater` was still filling
     the whole tile square, so the raw blue poked out past the sand at those
     corners: a sliver on a long coast, and on a SMALL lake the entire shape,
     which read as a hard-edged rectangle with stair steps sitting behind a
     correctly-traced pond. (Reported exactly that way.)

     The cure is to stop drawing water in squares at all: a water tile paints
     the ordinary grass floor first, then paints its water CLIPPED to this
     path, so the body of the water ends exactly where its own bands begin
     and there is nothing left to stick out. Cached on the same key the
     regions use, since that is precisely when it can change. */
  /* THE DEPTH FIELD — how far every wet tile is from land, in sixteenths of
     a tile, capped at DEPTH_CAP. A (3,4) chamfer distance in two raster
     passes: within a few percent of Euclidean, so the iso-contours are
     near-round before any noise touches them — an 8-neighbour count gives
     Chebyshev distance, whose contours are axis-aligned squares around
     every land corner, and no wander hides a square. Land is 0. The map's
     edge counts as land, exactly as the tracer treats out-of-bounds as dry,
     so a sea at the rim wears the same shallow the shelf already gives it.
     A MOAT is overwritten with the shallow constant afterwards (a dug
     channel has one depth). ONE global field, not one per region —
     distance-to-land does not care which region a cell belongs to, and a
     global answer is trivially consistent across a diagonal pinch.

     Keyed on waterKey like the body path, so it re-derives exactly when the
     wet tiles change and never otherwise; read once per repaint by
     paintWaterIn (the hillHeight discipline: re-keying per TILE would be
     ruinous, since the key itself walks the map). Typed array, ~4KB on
     xlarge. */
  _depthD: null, _depthKey: '',
  waterDepth() {
    const key = this.waterKey();
    if (this._depthKey === key && this._depthD) return this._depthD;
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const wet = t => t === T.WATER || t === T.MOAT;
    const BIG = 1 << 20, d = new Int32Array(W * H);
    for (let i = 0; i < d.length; i++) d[i] = wet(terr[i]) ? BIG : 0;
    // forward: left, up, up-left, up-right — a missing neighbour is land (3 / 4 away)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      let m = d[i];
      let c = x > 0 ? d[i - 1] + 3 : 3; if (c < m) m = c;
      c = y > 0 ? d[i - W] + 3 : 3; if (c < m) m = c;
      c = (x > 0 && y > 0) ? d[i - W - 1] + 4 : 4; if (c < m) m = c;
      c = (x < W - 1 && y > 0) ? d[i - W + 1] + 4 : 4; if (c < m) m = c;
      d[i] = m;
    }
    // backward: right, down, down-right, down-left
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!d[i]) continue;
      let m = d[i];
      let c = x < W - 1 ? d[i + 1] + 3 : 3; if (c < m) m = c;
      c = y < H - 1 ? d[i + W] + 3 : 3; if (c < m) m = c;
      c = (x < W - 1 && y < H - 1) ? d[i + W + 1] + 4 : 4; if (c < m) m = c;
      c = (x > 0 && y < H - 1) ? d[i + W - 1] + 4 : 4; if (c < m) m = c;
      d[i] = m;
    }
    /* …AND THE FLOOR IS NOT A CONTOUR MAP OF THE COAST. Pure distance gives
       every shoreline the same shelf at the same rate, which is what put a
       uniform ring around every body at min zoom. Two seeded world-space
       fields warp it into a landform (see the LAND block's Part 4b″): the
       slope is scaled by a low-frequency field, a mid-frequency field adds
       bars and pockets, both fade in over SLOPE_HOLD tiles so the beach is
       untouched, and land-adjacent water is capped inside the shore steps
       whatever they say. Sampled in world space from the map's own
       lattices: identical on reload, and re-derived with the field. */
    const out = new Uint8Array(W * H), cap = Math.min(255, LAND.DEPTH_CAP * 16);
    const SV = +LAND.SLOPE_VAR || 0, BA = +LAND.BAR_AMP || 0;
    const HOLD = Math.max(0.1, +LAND.SLOPE_HOLD || 1), shoreCap = LAND.DEEP_SHORE_END - 0.1;
    if (SV > 0 || BA > 0) this.landLattices();
    const latS = (SV > 0 && this._latOne) ? this._latOne.slope : null;
    const latB = (BA > 0 && this._latOne) ? this._latOne.bar : null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!d[i]) continue;
      const raw = d[i] / 3;                                  // chamfer units → tiles
      let dw = raw;
      if (latS || latB) {
        const t = Math.min(1, Math.max(0, (raw - 0.5) / HOLD));
        const sc = latS ? (this._latRead(latS, x, y) - 0.5) * 2 * SV : 0;
        const bar = latB ? (this._latRead(latB, x, y) - 0.5) * 2 * BA : 0;
        dw = raw + (raw * sc + bar) * t;
      }
      if (dw < 0.5) dw = 0.5;
      if (raw <= 1.05 && dw > shoreCap) dw = shoreCap;       // a beach stays a beach
      const v = Math.round(dw * 16);
      out[i] = terr[i] === T.MOAT ? 16 : (v > cap ? cap : v);
    }
    /* EVERY GAMEPLAY SHOAL RIDES A SANDBAR. MapGen.shoal is a pure hash of
       the tile — nothing here moves a fishing spot — and the bar is cut
       into the field rather than painted over it, so it comes out as one
       or two ramp steps of shallowing that the shelf, the life decals and
       the swell all sit on top of, never as a floating pale patch. The
       radius is jittered per cell so a bar is ragged, not a disc. */
    // …NOT `window.MapGen`: MapGen is a script-level const, so the window
    // lookup is undefined and the guard would silently skip every bar (the
    // same trap window.S sets, documented in CLAUDE.md and in rebuildTerrain)
    const SB = +LAND.SHOAL_BAR || 0, SR = +LAND.SHOAL_BAR_R || 0;
    if (SB > 0 && SR > 0 && typeof MapGen !== 'undefined' && MapGen.shoal) {
      const r = Math.ceil(SR);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!MapGen.shoal(x, y)) continue;
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (!out[k] || terr[k] === T.MOAT) continue;      // a dug channel keeps its flat depth
          const dist = Math.hypot(ox, oy) * (0.82 + this._lh(nx, ny, 1331) * 0.36);
          if (dist >= SR) continue;
          const f = 1 - dist / SR;
          const cut = Math.round(SB * 16 * f * f * (3 - 2 * f));
          out[k] = out[k] - cut < 8 ? 8 : out[k] - cut;
        }
      }
    }
    let maxD = 0;
    for (let i = 0; i < out.length; i++) if (out[i] > maxD) maxD = out[i];
    /* …and EVERY BODY'S OWN DEEPEST POINT, stamped across its cells, so the
       banding can scale to the water it is actually painting (POND_BAND).
       The regions are already traced and keyed on the same water, so this
       is a walk over cells, not a second flood. */
    const rmax = new Uint8Array(W * H);
    for (const reg of this.waterRegions()) {
      let m = 0;
      for (const c of reg.cells) if (out[c] > m) m = out[c];
      for (const c of reg.cells) rmax[c] = m;
    }
    this._regionMax = rmax;
    /* THE SHORE SHADOW'S OWN FIELD: distance from land that lies to the
       north or west — the forward chamfer pass alone (left, up, up-left),
       which reaches a wet cell only through cells above or to its left.
       Capped at four tiles; the shadow never reaches that far. */
    const dn = new Int32Array(W * H);
    for (let i = 0; i < dn.length; i++) dn[i] = wet(terr[i]) ? BIG : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!dn[i]) continue;
      let m = dn[i];
      let c = x > 0 ? dn[i - 1] + 3 : 3; if (c < m) m = c;
      c = y > 0 ? dn[i - W] + 3 : 3; if (c < m) m = c;
      c = (x > 0 && y > 0) ? dn[i - W - 1] + 4 : 4; if (c < m) m = c;
      dn[i] = m;
    }
    const sh = new Uint8Array(W * H);
    for (let i = 0; i < dn.length; i++) if (dn[i]) { const v = Math.round(dn[i] * 16 / 3); sh[i] = v > 64 ? 64 : v; }
    /* THE STEP EDGES, FITTED TO THIS MAP (see the LAND block): absolute
       shore steps, then the deep steps spread to DEEP_TOP_K of the deepest
       tile, never nearer than DEEP_TOP_MIN. Stored beside the field. */
    const n = Math.max(2, (ART.PALETTE.deep || []).length || LAND.DEEP_STEPS), edges = new Float32Array(n - 1);
    let k = 0;
    // the waterline sits at d 0.5 (halfway between a land centre and a water
    // centre), so the first step gets a real width before its first edge
    for (let e = 0.5 + LAND.DEEP_SHORE_STEP * 0.6; e < LAND.DEEP_SHORE_END && k < n - 2; e += LAND.DEEP_SHORE_STEP) edges[k++] = e;
    const from = LAND.DEEP_SHORE_END, rest = n - 1 - k;
    const top = Math.max(from + 0.5, LAND.DEEP_TOP_MIN, (maxD / 16) * LAND.DEEP_TOP_K);   // always beyond the shore steps
    for (let j = 0; j < rest; j++) edges[k + j] = from + (top - from) * (j + 1) / rest;
    this._depthD = out; this._shadowD = sh; this._deepEdges = edges; this._depthMax = maxD / 16; this._depthKey = key;
    return out;
  },
  /* the ramp's shades at the current dials: every step of ART.PALETTE.deep
     put through DEEP_SAT and DEEP_LIFT (identity at 1 / 0) and then mixed
     from the old body blue by DEPTH_AMP, with the crest and glint partners
     that keep a swell readable over every step — three and five steps
     lighter, the two lightest shore steps taking the foam-lip white.
     Memoised on the three dials. */
  _deepC: null,
  _deepCols() {
    const amp = Math.max(0, Math.min(1, +LAND.DEPTH_AMP || 0));
    const sat = Math.max(0, +LAND.DEEP_SAT || 0), lift = Math.max(-1, Math.min(1, +LAND.DEEP_LIFT || 0));
    const CL = Math.max(0, LAND.SWELL_LIFT | 0), GL = Math.max(0, LAND.GLINT_LIFT | 0);
    const key = amp + '|' + sat + '|' + lift + '|' + CL + '|' + GL + '|' + (LAND.DEEP_ALT ? 1 : 0);
    if (this._deepC && this._deepC.key === key) return this._deepC;
    /* THE PAINTER STANDS DOWN FOR ART THAT ISN'T THERE. This dereferenced
       ART.PALETTE.deep bare, and a browser holding a CACHED OLDER
       js/artstyle.js beside a fresh js/render.js — the script tags carried
       no version, so the two files cache independently — got a TypeError
       here, thrown from paintWaterIn INSIDE the terrain bake. A bake that
       throws dies mid-plan: the decal, rock, cover and shore steps that
       come after the water never run, so the map lost every tree, rock,
       berry and gold seam, tiles whose band had not been reached stayed
       unpainted black, and every later frame threw again and left the
       previous frame's chrome smeared across the edges. Reported from a
       real phone on a day-90 save.
       A missing ramp is now simply a flat body, which is what this code
       drew before the ramp existed — one layer degrades, nothing dies.
       (index.html now versions its script tags too, so the mixed load
       should not recur; this is the belt to that pair of braces.) */
    const W = ART.PALETTE.water;
    const DR = (LAND.DEEP_ALT ? ART.PALETTE.deepAlt : ART.PALETTE.deep) || ART.PALETTE.deep;
    if (!DR || !DR.length) {
      const flatFill = [W[1]], flatCrest = [W[2]], flatGlint = [W[3]];
      this._deepC = { key, n: 1, fill: flatFill, crest: flatCrest, glint: flatGlint, body: 0, absent: true };
      return this._deepC;
    }
    const n = DR.length;
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const adjust = (c) => {
      const m = (c[0] + c[1] + c[2]) / 3;
      let o = c.map(v => m + (v - m) * sat);
      if (lift > 0) o = o.map(v => v + (255 - v) * lift); else if (lift < 0) o = o.map(v => v * (1 + lift));
      return o;
    };
    const mixFrom = (base, target) => { const A = hex(base); return toHex(A.map((v, i) => v + (target[i] - v) * amp)); };
    const step = k => adjust(hex(DR[Math.max(0, Math.min(n - 1, k))]));
    /* A CREST IS A STEP OF THE RAMP, NOT A COLOUR OF ITS OWN. Lifting the
       swell toward water[4] put a near-white cyan over the shallow steps,
       which is half of why the shallows shouted; a crest is now simply the
       ramp one step lighter (a glint two), clamped at the top so nothing
       brighter than the ramp's own shallow end can appear anywhere. */
    const fill = [], crest = [], glint = [];
    for (let k = 0; k < n; k++) {
      fill.push(mixFrom(W[1], step(k)));
      crest.push(mixFrom(W[2], step(k - CL)));
      glint.push(mixFrom(W[3], step(k - GL)));
    }
    // where the body blue sits on the ramp — the step the flat water uses
    const body = Math.max(0, DR.indexOf(W[1]));
    /* …AND THE FADE'S LUT: 256 colours along the ramp, adjacent steps mixed
       in OKLab (the space the ramp was built in, so the fade inherits its
       even lightness), baked here once per colour change. Smooth mode pays
       an array lookup per cell; the colourspace math never runs in a bake
       loop, let alone a frame. */
    const lut = [];
    {
      const l2s = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
      const s2l = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      const lab = (h) => {
        const r = s2l(parseInt(h.slice(1, 3), 16) / 255), g2 = s2l(parseInt(h.slice(3, 5), 16) / 255), b2 = s2l(parseInt(h.slice(5, 7), 16) / 255);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g2 + 0.0514459929 * b2);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g2 + 0.1073969566 * b2);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g2 + 0.6299787005 * b2);
        return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
      };
      const rgb = ([L, a, b2]) => {
        const l = (L + 0.3963377774 * a + 0.2158037573 * b2) ** 3;
        const m = (L - 0.1055613458 * a - 0.0638541728 * b2) ** 3;
        const s = (L - 0.0894841775 * a - 1.2914855480 * b2) ** 3;
        const c = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                   -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
        return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(l2s(v) * 255))).toString(16).padStart(2, '0')).join('');
      };
      const labs = fill.map(lab);
      for (let i = 0; i < 256; i++) {
        const p = n < 2 ? 0 : i * (n - 1) / 255;
        const k = Math.min(Math.max(0, n - 2), p | 0), f = p - k;
        const A = labs[k], B = labs[Math.min(n - 1, k + 1)];
        lut.push(rgb([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]));
      }
    }
    this._deepC = { key, n, fill, crest, glint, body, lut };
    return this._deepC;
  },
  // the 8×8 ordered-dither thresholds (Bayer), 0..1 — indexed by WORLD cell
  // coordinates, so a tile repainted alone still meshes with its neighbours
  _BAYER8: [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
            12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
            3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
            15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map(v => (v + 0.5) / 64),
  /* THE SHORE SHADOW (Overhaul 2.3), painted into the SHORE LAYER — over
     the shelf wash — rather than into the body under it: the shelf's stacked
     pale ribbons lighten exactly the tiles the shadow darkens, and under
     them the band never read (measured: the waterline came out LIGHTER
     with the shadow on). Per wet tile within reach: the same nine-centre
     bilinear read of the depth field and the same wander as the steps, so
     its edge follows no grid; quantized to SHORE_SHADOW_STEPS levels with
     the stipple at each seam, darkest at the waterline; SHORE_SHADOW_SUN
     leans it toward the banks the sun throws a shadow from (the forward-
     pass field). Bake-time only: the layer is keyed on the water, the
     bench's rebake drops its key, and blitShore carries it into every
     repaint. Runs inside pass 0's clips, so it can never leave the body. */
  paintShoreShadow(g) {
    const SA = +LAND.SHORE_SHADOW || 0, SW = +LAND.SHORE_SHADOW_W || 0;
    if (!(SA > 0 && SW > 0)) return;
    const W = CFG.W, H = CFG.H, TL = CFG.TILE, terr = (S.map.seenTerrain || S.map.terrain);
    const wet = t => t === T.WATER || t === T.MOAT;
    const D = this.waterDepth(), SD = this._shadowD;
    const N = LAND.DEPTH_SUB, cell = TL / N, DI = LAND.DEPTH_DITHER, LV = Math.max(1, LAND.SHORE_SHADOW_STEPS | 0);
    const SUN = Math.max(0, Math.min(1, +LAND.SHORE_SHADOW_SUN || 0));
    this.landLattices();
    const lat = this._latOne.depth, WA = LAND.DEPTH_WANDER * 2;
    const at = (F, cx, cy) => F[(cy < 0 ? 0 : cy >= H ? H - 1 : cy) * W + (cx < 0 ? 0 : cx >= W ? W - 1 : cx)] / 16;
    // a bilinear sampler over the nine centres around (x, y), u/v in 0..1
    const sampler = (F, x, y) => {
      const d00 = at(F, x - 1, y - 1), d10 = at(F, x, y - 1), d20 = at(F, x + 1, y - 1);
      const d01 = at(F, x - 1, y), d11 = at(F, x, y), d21 = at(F, x + 1, y);
      const d02 = at(F, x - 1, y + 1), d12 = at(F, x, y + 1), d22 = at(F, x + 1, y + 1);
      return (u, v) => {
        const mid = u < 0.5 ? d01 + (d11 - d01) * (u + 0.5) : d11 + (d21 - d11) * (u - 0.5);
        const far = v < 0.5
          ? (u < 0.5 ? d00 + (d10 - d00) * (u + 0.5) : d10 + (d20 - d10) * (u - 0.5))
          : (u < 0.5 ? d02 + (d12 - d02) * (u + 0.5) : d12 + (d22 - d12) * (u - 0.5));
        const t = v < 0.5 ? 0.5 - v : v - 0.5;
        return mid + (far - mid) * t;
      };
    };
    const cols = [];
    for (let lv = 1; lv <= LV; lv++) cols[lv] = 'rgba(8,22,38,' + (SA * lv / LV).toFixed(3) + ')';
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!wet(terr[i]) || !MapGen.onBoard(x, y)) continue;
      if (D[i] / 16 - WA * 0.5 > SW + 1.2) continue;               // beyond the band's reach
      const dep = sampler(D, x, y), sun = SUN > 0 ? sampler(SD, x, y) : null;
      const w00 = (this._latRead(lat, x, y) - 0.5) * WA, w10 = (this._latRead(lat, x + 1, y) - 0.5) * WA;
      const w01 = (this._latRead(lat, x, y + 1) - 0.5) * WA, w11 = (this._latRead(lat, x + 1, y + 1) - 0.5) * WA;
      for (let j = 0; j < N; j++) {
        const v = (j + 0.5) / N;
        let run = 0, runL = -1;
        for (let k = 0; k <= N; k++) {
          let lv = -1;
          if (k < N) {
            const u = (k + 0.5) / N;
            const wn = (w00 + (w10 - w00) * u) * (1 - v) + (w01 + (w11 - w01) * u) * v;
            let ds = dep(u, v) + wn;
            if (sun) ds = ds + (sun(u, v) + wn - ds) * SUN;
            const t = 1 - (ds - 0.5) / SW;                          // 1 at the waterline, 0 at the outer edge
            if (t <= 0) lv = 0;
            else {
              const f = t * LV;
              lv = Math.floor(f);
              const frac = f - lv, dz = DI * LV / SW;
              // the seam between two levels takes the stipple, like every other seam
              if (frac > 0.5 - dz && frac < 0.5 + dz) { if (this._lh(x * N + k + 977, y * N + j + 977, 1311) < frac) lv++; }
              else if (frac >= 0.5) lv++;
              if (lv > LV) lv = LV;
            }
          }
          if (lv !== runL) {
            if (runL > 0) { g.fillStyle = cols[runL]; g.fillRect(x * TL + run * cell, y * TL + j * cell, (k - run) * cell, cell); }
            run = k; runL = lv;
          }
        }
      }
    }
  },
  _bodyPath: null, _bodyKey: '',
  waterBodyPath() {
    const key = this.waterKey();
    if (this._bodyKey === key && this._bodyPath) return this._bodyPath;
    const TL = CFG.TILE, p = new Path2D();
    for (const reg of this.waterRegions()) for (const loop of reg.loops) {
      if (loop.length < 3) continue;
      p.moveTo(loop[0][0] * TL, loop[0][1] * TL);
      for (let i = 1; i < loop.length; i++) p.lineTo(loop[i][0] * TL, loop[i][1] * TL);
      p.closePath();
    }
    this._bodyPath = p; this._bodyKey = key;
    return p;
  },

  /* ---- WHEN THE WATER MOVES, THE SHORE MOVES WITH IT --------------------
     A dug moat that reaches a lake JOINS it: the two become one region and
     the beach that used to run between them is not a shore any more. But an
     incremental repaint only ever redrew the edited tile's own neighbourhood,
     and `blitShore` COMPOSITES the shore layer onto the terrain cache — it
     cannot erase. So the old sand stayed baked into the cache and a flooded
     channel kept a beach down the middle of open water, with the moat reading
     as a separate body in a slightly different blue. (Reported from a real
     day-82 game, and measured here at 38 stale tiles for one eight-tile
     channel — the moat tiles themselves were never repainted as water at all,
     because `floodMoats` converts them one at a time and each conversion
     re-traced the region under the tiles already drawn.)

     The cure is to notice that the water itself changed and widen the repaint
     to everything whose shore could have moved: the tiles that became (or
     stopped being) water, grown by WATER_DIRTY_R. Geometry further away is
     genuinely unchanged — the tracer walks the same cell edges and the
     roughening is sampled in WORLD space, so a point far from the junction
     gets the same displacement whichever region it now belongs to. */
  /* THE HILLS HAVE THE SAME CONTRACT, SMALLER. The rock scatter and the
     relief/shadow cues are driven by the hill distance FIELD, which is a
     property of a hills CLUSTER — quarrying one tile of a knot re-deepens the
     whole knot and moves stones and shadows up to two tiles past it, while
     the ordinary repaint ring only resets one. So a change in hills/pebbles
     membership repaints the affected cluster whole, plus the scatter's own
     reach — the waterDirty rule scaled down to a field whose influence is
     local rather than loop-global (measured: a fog reveal that synced a
     quarried knot into memory left 10px of stale rock/shadow two tiles
     outside its repaint ring). Consume-once, baselined in rebuildTerrain,
     exactly like the water mask. */
  _hillMask: null,
  hillsDirty() {
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const now = new Uint8Array(W * H);
    for (let i = 0; i < now.length; i++) {
      const t = terr[i];
      if (t === T.HILLS || t === T.PEBBLES) now[i] = 1;
    }
    const was = this._hillMask;
    this._hillMask = now;
    if (!was || was.length !== now.length) return null;
    const changed = [];
    for (let i = 0; i < now.length; i++) if (now[i] !== was[i]) changed.push(i);
    if (!changed.length) return null;
    // flood the touched clusters (8-connected, like the field itself), over
    // the union of old and new membership so a shrunk knot repaints whole
    const inC = i => now[i] || was[i];
    const seen = new Set(), out = [], outK = new Set();
    const push = (cx, cy) => {
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (outK.has(k)) continue;
        outK.add(k); out.push([nx, ny]);
      }
    };
    for (const c of changed) {
      if (seen.has(c)) continue;
      const st = [c]; seen.add(c);
      while (st.length) {
        const k = st.pop(), cx = k % W, cy = (k / W) | 0;
        push(cx, cy);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (!seen.has(nk) && inC(nk)) { seen.add(nk); st.push(nk); }
        }
      }
    }
    return out.length ? out : null;
  },
  _waterMask: null,
  waterDirty() {
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const now = new Uint8Array(W * H);
    for (let i = 0; i < now.length; i++) {
      const t = terr[i];
      if (t === T.WATER || t === T.MOAT) now[i] = 1;
    }
    const was = this._waterMask;
    this._waterMask = now;
    if (!was || was.length !== now.length) return null;      // nothing to compare against
    const changed = [];
    for (let i = 0; i < now.length; i++) if (now[i] !== was[i]) changed.push(i);
    if (!changed.length) return null;
    /* THE WHOLE REGION'S SHORE, not a radius around the edit. A band is
       offset from a curve, and several things about that curve are properties
       of the LOOP rather than of a point — its enclosed area caps how far a
       band may reach, and the loop is what the ribbon fill is computed over.
       So joining a moat to a lake can move the drawn shore anywhere along
       that lake, and a fixed-radius repaint left slivers of the old beach
       behind at the far end of it. Repainting the region is unarguable, and
       water only moves when a sapper digs, floods, bridges or reclaims —
       rare, deliberate, already-multi-tile events. */
    const seen = new Set(), out = [];
    const add = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      const k = ny * W + nx;
      if (seen.has(k)) return;
      seen.add(k); out.push([nx, ny]);
    };
    const R2 = LAND.WATER_DIRTY_R;
    for (const i of changed) {
      const cx = i % W, cy = (i / W) | 0;
      for (let oy = -R2; oy <= R2; oy++) for (let ox = -R2; ox <= R2; ox++) add(cx + ox, cy + oy);
    }
    // …and every cell (plus its ring) of any region the edit touched
    const hit = new Set(changed);
    for (const reg of this.waterRegions()) {
      let touches = false;
      for (const c of reg.cells) {
        if (!hit.has(c)) continue;
        touches = true; break;
      }
      if (!touches) for (const c of reg.cells) {           // …or merely adjacent to one
        const cx = c % W;
        if ((cx > 0 && hit.has(c - 1)) || (cx < W - 1 && hit.has(c + 1))
          || hit.has(c - W) || hit.has(c + W)) { touches = true; break; }
      }
      if (!touches) continue;
      for (const c of reg.cells) {
        const cx = c % W, cy = (c / W) | 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) add(cx + ox, cy + oy);
      }
    }
    return out.length ? out : null;
  },

  _sideMask: null, _sideKey: '',
  shoreSideMasks() {
    const key = this.waterKey();
    if (this._sideKey === key && this._sideMask) return this._sideMask;
    const W = CFG.W, H = CFG.H, TL = CFG.TILE;
    const terr = (S.map.seenTerrain || S.map.terrain);
    const wetM = new Uint8Array(W * H), dryM = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = terr[i];
      if (t === T.WATER || t === T.MOAT) wetM[i] = 1; else dryM[i] = 1;
    }
    const dilate = (src) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!src[y * W + x]) continue;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) o[ny * W + nx] = 1;
        }
      }
      return o;
    };
    const toPath = (m) => {
      const p = new Path2D();
      for (let y = 0; y < H; y++) {
        let run = -1;
        for (let x = 0; x <= W; x++) {
          const on = x < W && m[y * W + x];
          if (on && run < 0) run = x;
          else if (!on && run >= 0) { p.rect(run * TL, y * TL, (x - run) * TL, TL); run = -1; }
        }
      }
      return p;
    };
    this._sideMask = { water: toPath(dilate(wetM)), land: toPath(dilate(dryM)) };
    this._sideKey = key;
    return this._sideMask;
  },

  /* (the per-tile `shoreBand` that used to draw the beach lived here. It is
     gone, not disabled: it was the LAST thing on the grid at the water's
     edge, and once every band came off the traced curve — moats and sappers'
     ditches included, since they flood into water regions like anything else
     — nothing called it. `landSand` stays: the beach's width still rides that
     same noise, sampled along the curve instead of along a tile edge.) */

  /* stamp supplied ground art into one tile. Scaled to the tile from
     WHATEVER it was authored at — 32, 64, 128 — so the art can carry more
     detail than the grid, and drawn with smoothing OFF so it stays crisp
     rather than turning to soup against the procedural pixels beside it. */
  blitTile(g, img, x, y) {
    if (!img) return;
    const TL = CFG.TILE, sm = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x * TL, y * TL, TL, TL);
    g.imageSmoothingEnabled = sm;
  },

  paintGround(g, x, y, h) {
    const TL = CFG.TILE, px = TL / 16, AP = ART.PALETTE;
    /* SUPPLIED GRASS ART REPLACES THE WHOLE FLOOR, not just the grass tiles.
       Every grass-floored resource (forest, hills, fertile, stumps, pebbles,
       the seam) is authored on a TRANSPARENT floor and painted over this, so
       if the two disagreed every resource tile would show a patch of the old
       green under new grass. One override, read here, keeps the floor
       continuous — which is the same reason the procedural floor is shared. */
    if (window.Assets && Assets.hasTerrainArt(T.GRASS)) {
      this.blitTile(g, Assets.terrainImg(T.GRASS, h >>> 3), x, y);
      this.groundTint(g, x, y, S.map.seenTerrain || S.map.terrain);
      return;                       // …supplied art gets the tone layer TOO
    }
    g.fillStyle = AP.grass[2];
    g.fillRect(x * TL, y * TL, TL, TL);
    const lean = (Math.sin((x * 0.8 + y * 0.6) * 0.09) + Math.sin((x * 0.5 - y * 0.9) * 0.075)) * 0.2;
    for (let k = 0; k < LAND.GRAIN_N; k++) {         // the felt grain — every dot ONE cell, inside the box
      let hh = (h ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
      hh = Math.imul(hh ^ (hh >>> 15), 0x85ebca6b) >>> 0;
      hh = Math.imul(hh ^ (hh >>> 13), 0xc2b2ae35) >>> 0;
      hh = (hh ^ (hh >>> 16)) >>> 0;
      const gx = hh & 15, gy = (hh >> 4) & 15;
      g.fillStyle = (((hh >> 8) & 255) / 255) < 0.5 + lean ? AP.grass[3] : AP.grass[1];
      g.fillRect(x * TL + gx * px, y * TL + gy * px, px, px);
    }
    if ((h & 3) === 0) {                          // a short blade on ~1/4 of tiles for texture
      g.fillStyle = AP.grass[3];
      /* the blade is 2 sub-cells TALL, so its row is capped at 14 — at 15 it
         wrote 2px into the tile below, which the bake covers (the southern
         neighbour paints later) but an incremental repaint leaves stamped on
         ground it never resets. drawTile must stay box-exact: it is the one
         pass the repaint paths cannot clip-and-restamp their way around. */
      g.fillRect(x * TL + ((h >> 6) & 15) * px, y * TL + Math.min((h >> 10) & 15, 14) * px, px, px * 2);
    }
    this.groundTint(g, x, y, S.map.seenTerrain || S.map.terrain);
  },

  // WATER — calm and smooth. A flat body colour with long, LOW-contrast swells
  // computed in WORLD space (the bands run straight across tile borders, so a lake
  // can never show a per-tile pattern), plus a few hash-scattered wave dashes and
  // pinpoint glints. Shore tiles use the lighter shallow ramp; the live sparkle /
  // foam / fish animation layers on top at frame time.
  /* ONE WATER, ONE SWELL. This used to take a `shore` flag — true if the tile
     touched land — and brighten the swell crests and glints on it. That is a
     WHOLE-TILE switch, so a run of shore tiles lit up together as a pale
     rectangle several tiles across sitting in the middle of a bay: the same
     grid-drawing fault as the old shelf, wearing different clothes. The
     near-shore lightening is the TRACED SHELF's job now (buildShoreLayer),
     and it is measured off a curve, so the body of the water can simply be
     uniform. */
  paintWater(g, x, y, D) {
    const TL = CFG.TILE, px = TL / 16, W = ART.PALETTE.water;
    /* SHALLOWNESS IS A FIELD, NOT A FLAG. The body colour used to switch
       wholesale on "does this tile touch land", which paints a hard rectangle
       into the middle of every lake — the same grid-drawing mistake as a
       per-tile tone. It is now bilinear from the tile's corners (each corner
       being how much land meets there) and resolved per sub-cell, so a bay
       shelves gradually and the step edges wander instead of following the
       tile boundaries. */
    /* THE DEEP RAMP (the Overhaul's Part 0). The body is painted in hard
       depth steps read from the baked distance field D (waterDepth) against
       the step edges fitted to this map — see the LAND block's Part 4b for
       the design. The field is per tile centre; this tile straddles four of
       its cells, so the read is bilinear over the nine centres around it,
       plus the wander noise read at the tile's corners and interpolated
       inside. A tile lying wholly in one step and clear of every seam is
       ONE rect; a seam tile is painted per sub-cell in row runs, with a
       hashed stipple where each contour passes. Every step's colour comes
       from _deepCols, so at DEPTH_AMP 0 all of this paints exactly the flat
       body it replaced. Then the SHORE SHADOW (Part 4b′): the same cells,
       darkened in a few dithered levels by their distance from the bank. */
    const cols = this._deepCols(), N = LAND.DEPTH_SUB, cell = TL / N, NS = cols.n;
    const bands = this._bandScr || (this._bandScr = new Uint8Array(256));
    let uniform = NS - 1;                   // the whole tile's step, or -1 when mixed
    // …and with no ramp (a stale artstyle.js) the body is flat, not broken
    const flat = !D || LAND.DEPTH_AMP <= 0 || cols.absent || !this._deepEdges;
    if (flat) uniform = cols.body;          // the body blue's own step, so crests keep their old shade
    let depth = null;
    if (flat) {
      g.fillStyle = cols.fill[cols.body];
      g.fillRect(x * TL, y * TL, TL, TL);
    } else {
      const CW = CFG.W, CH = CFG.H, E = this._deepEdges, NE = E.length;
      const at = (cx, cy) => D[(cy < 0 ? 0 : cy >= CH ? CH - 1 : cy) * CW + (cx < 0 ? 0 : cx >= CW ? CW - 1 : cx)] / 16;
      const d00 = at(x - 1, y - 1), d10 = at(x, y - 1), d20 = at(x + 1, y - 1);
      const d01 = at(x - 1, y), d11 = at(x, y), d21 = at(x + 1, y);
      const d02 = at(x - 1, y + 1), d12 = at(x, y + 1), d22 = at(x + 1, y + 1);
      this.landLattices();
      const lat = this._latOne.depth, WA = LAND.DEPTH_WANDER * 2;
      const w00 = (this._latRead(lat, x, y) - 0.5) * WA, w10 = (this._latRead(lat, x + 1, y) - 0.5) * WA;
      const w01 = (this._latRead(lat, x, y + 1) - 0.5) * WA, w11 = (this._latRead(lat, x + 1, y + 1) - 0.5) * WA;
      const DI = LAND.DEPTH_DITHER;
      /* THE RAMP COMPRESSES TO THE BODY (POND_BAND). A pond three tiles
         across never left the two palest steps while a sea ran the whole
         ramp — the edges are absolute tiles. Scaling the tile's depth by
         its own region's deepest point fixes that: a body at least
         POND_BAND deep is untouched (inv 1), and a shallower one has its
         depth stretched so its middle still reaches the ramp's middle and
         its reef band tightens to a fraction of a tile. Per TILE, not per
         sub-cell: a region's cells all share the factor and regions are
         separated by land, so no seam can fall inside the scaling. */
      let inv = 1;
      const RM = this._regionMax, PB = +LAND.POND_BAND || 0;
      if (RM && PB > 0) {
        const rm = RM[y * CW + x] / 16;
        if (rm > 0 && rm < PB) inv = PB / rm;
      }
      // depth at (u, v) inside the tile, 0..1 each, in tiles-from-land
      depth = (u, v) => {
        const mid = u < 0.5 ? d01 + (d11 - d01) * (u + 0.5) : d11 + (d21 - d11) * (u - 0.5);
        const far = v < 0.5
          ? (u < 0.5 ? d00 + (d10 - d00) * (u + 0.5) : d10 + (d20 - d10) * (u - 0.5))
          : (u < 0.5 ? d02 + (d12 - d02) * (u + 0.5) : d12 + (d22 - d12) * (u - 0.5));
        const t = v < 0.5 ? 0.5 - v : v - 0.5;
        const wn = (w00 + (w10 - w00) * u) * (1 - v) + (w01 + (w11 - w01) * u) * v;
        return (mid + (far - mid) * t + wn) * inv;
      };
      const stepOf = d => { let k = 0; while (k < NE && d >= E[k]) k++; return k; };   // 0 shore … NS-1 heart
      // distance to the nearest edge (no allocation: this runs per cell)
      const seamDist = (d, k) => {
        const lo = k > 0 ? d - E[k - 1] : 1e9, hi = k < NE ? E[k] - d : 1e9;
        return lo < hi ? lo : hi;
      };
      const fade = LAND.WATER_FADE | 0;
      /* the CONTINUOUS ramp position of a depth, in step units, band
         centres landing exactly on their step so every mode agrees where
         the middle of a band is. Piecewise linear through the fitted
         edges; the heart extends at the last span's rate and clamps. */
      const pos = (d) => {
        let k = 0; while (k < NE && d >= E[k]) k++;
        const lo = k > 0 ? E[k - 1] : 0.5;
        const hi = k < NE ? E[k] : (NE > 1 ? E[NE - 1] * 2 - E[NE - 2] : lo + 1);
        let f = hi > lo ? (d - lo) / (hi - lo) : 0.5;
        if (f < 0) f = 0; else if (f > 1) f = 1;
        const p = k + f - 0.5;
        return p < 0 ? 0 : p > NS - 1 ? NS - 1 : p;
      };
      const dc = depth(0.5, 0.5), b0 = stepOf(dc);
      if (fade === 0) {
      let one = seamDist(dc, b0) > DI + 0.02;
      if (one) {
        const d1 = depth(0, 0), d2 = depth(1, 0), d3 = depth(0, 1), d4 = depth(1, 1);
        one = stepOf(d1) === b0 && stepOf(d2) === b0 && stepOf(d3) === b0 && stepOf(d4) === b0
          && seamDist(d1, b0) > DI + 0.02 && seamDist(d2, b0) > DI + 0.02
          && seamDist(d3, b0) > DI + 0.02 && seamDist(d4, b0) > DI + 0.02;
      }
      if (one) {
        uniform = b0;
        g.fillStyle = cols.fill[b0];
        g.fillRect(x * TL, y * TL, TL, TL);
      } else {
        uniform = -1;
        for (let j = 0; j < N; j++) {
          const v = (j + 0.5) / N;
          let run = 0, runB = -2;
          for (let i = 0; i <= N; i++) {
            let b = -1;
            if (i < N) {
              const d = depth((i + 0.5) / N, v);
              b = stepOf(d);
              const lo = b > 0 ? d - E[b - 1] : 1e9, hi = b < NE ? E[b] - d : 1e9;
              const sd = lo < hi ? lo : hi;
              if (sd < DI) {
                // the stipple: the far side of the contour wins more often
                // the nearer the cell lies to it — hashed per cell in WORLD
                // cells, so a tile repainted alone still matches its neighbours
                if (this._lh(x * N + i, y * N + j, 1309) < (DI - sd) / (2 * DI)) b = lo < hi ? b - 1 : b + 1;
              }
              bands[j * N + i] = b;
            }
            if (b !== runB) {
              if (runB >= 0) { g.fillStyle = cols.fill[runB]; g.fillRect(x * TL + run * cell, y * TL + j * cell, (i - run) * cell, cell); }
              run = i; runB = b;
            }
          }
        }
      }
      } else if (fade === 2) {
        /* THE SMOOTH FADE: every cell reads the LUT at its own depth's ramp
           position. A tile whose five probes land on one LUT entry is one
           rect — most of a deep basin — and everything else merges runs on
           the entry, which stays effective because a 256-level quantisation
           makes neighbouring cells of slowly-varying depth identical. */
        const lut = cols.lut, LN = lut.length - 1, SC = LN / (NS - 1);
        const idx = (p) => (p * SC + 0.5) | 0;
        const pc = pos(dc), i0 = idx(pc);
        if (idx(pos(depth(0, 0))) === i0 && idx(pos(depth(1, 0))) === i0 &&
            idx(pos(depth(0, 1))) === i0 && idx(pos(depth(1, 1))) === i0) {
          uniform = Math.round(pc);
          g.fillStyle = lut[i0];
          g.fillRect(x * TL, y * TL, TL, TL);
        } else {
          uniform = -1;
          for (let j = 0; j < N; j++) {
            const v = (j + 0.5) / N;
            let run = 0, runI = -2;
            for (let i = 0; i <= N; i++) {
              let li = -1;
              if (i < N) {
                const p = pos(depth((i + 0.5) / N, v));
                li = idx(p);
                bands[j * N + i] = (p + 0.5) | 0;          // the crest's step stays integer
              }
              if (li !== runI) {
                if (runI >= 0) { g.fillStyle = lut[runI]; g.fillRect(x * TL + run * cell, y * TL + j * cell, (i - run) * cell, cell); }
                run = i; runI = li;
              }
            }
          }
        }
      } else {
        /* THE WIDE DITHER: the same sixteen colours, but the mix between a
           step and its neighbour is an ordered 8×8 dither spread across the
           FULL width of the transition — at play zoom it reads as a fade
           while every pixel stays on a ramp colour. Thresholds are indexed
           by WORLD cell, so a lone repainted tile meshes with the bake. */
        const BY = this._BAYER8;
        uniform = -1;
        for (let j = 0; j < N; j++) {
          const v = (j + 0.5) / N, byRow = ((y * N + j) & 7) * 8;
          let run = 0, runB = -2;
          for (let i = 0; i <= N; i++) {
            let b = -1;
            if (i < N) {
              const p = pos(depth((i + 0.5) / N, v));
              const k = p | 0, f = p - k;
              b = (f > BY[byRow + ((x * N + i) & 7)] && k < NS - 1) ? k + 1 : k;
              bands[j * N + i] = b;
            }
            if (b !== runB) {
              if (runB >= 0) { g.fillStyle = cols.fill[runB]; g.fillRect(x * TL + run * cell, y * TL + j * cell, (i - run) * cell, cell); }
              run = i; runB = b;
            }
          }
        }
      }
      // (the shore shadow is NOT painted here: it lives in the shore layer,
      // over the shelf wash — see paintShoreShadow)
    }
    // the step under an art pixel (jx, jy in 0..15), for the crests and glints
    const bandAt = (jx, jy) => uniform >= 0 ? uniform : bands[((jy * N) >> 4) * N + ((jx * N) >> 4)];
    /* THE SHALLOWS ARE NOT DRAWN HERE. They used to be: a bilinear field of
       "how much land meets this corner", resolved per sub-cell. Making it a
       field rather than a per-tile flag fixed the hard rectangles, but it could
       never fix the STAIRCASE — a contour of a piecewise-bilinear function on
       the tile lattice can only ever turn at 45 degrees, so the shelf's own
       edge stepped down the grid in the middle of a bay, in plain sight beside
       a coastline that no longer did. Shelving is now measured from the TRACED
       SHORE POLYGON (buildShoreLayer), which is the only geometry in this file
       that is not made of tile corners. */
    /* DEPTH. The same tonal field the land uses, so a body of water is lighter
       over its shallows and darker out in the middle instead of one flat blue.
       SLOWER AND QUIETER THAN THE GROUND'S (a reported screenshot: "messy
       water… fake"): sampled at the land's own frequency the field made
       tile-and-a-half dark BLOBS, which over water read as dirt smudges or
       drowned shadows — the ground has grass texture to absorb its tone
       steps, open water has nothing. The field is stretched (~×0.4, so a
       feature spans several tiles and reads as a deep basin, not a stain)
       and the steps are softer. */
    /* …AND SILENT UNDER THE DEEP RAMP (WATER_WHISPER 0): fourteen steps
       carry the depth now, and a fixed-alpha lift over the dark steps read
       as pale smudges three tiles across in open water — the blob failure
       the note above records, back in new clothes. Kept in full on the flat
       body, so DEPTH_AMP 0 is still byte-for-byte the water of before. */
    if (flat || LAND.WATER_WHISPER > 0) {
      const N = LAND.TONE_SUB, cell = TL / N, wa = flat ? 1 : +LAND.WATER_WHISPER;
      const lightC = flat ? 'rgba(150,205,225,0.045)' : 'rgba(150,205,225,' + (0.045 * wa).toFixed(3) + ')';
      const darkC = flat ? 'rgba(4,16,30,0.05)' : 'rgba(4,16,30,' + (0.05 * wa).toFixed(3) + ')';
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const d3 = Math.min(2, (this.landTone((x + (i + 0.5) / N) * 0.4, (y + (j + 0.5) / N) * 0.4) * 3) | 0);
        if (d3 === 1) continue;
        g.fillStyle = d3 > 1 ? lightC : darkC;
        g.fillRect(x * TL + i * cell, y * TL + j * cell, cell, cell);
      }
    }
    for (let jy = 0; jy < 16; jy++) for (let jx = 0; jx < 16; jx++) {
      const wx = x + jx / 16, wy = y + jy / 16;
      // three long slow sine swells, wavelengths of several tiles, gently angled
      const v = Math.sin(wx * 1.7 + wy * 0.55 + 1.3) + Math.sin(wx * 0.4 - wy * 1.35 + 4.1)
        + Math.sin((wx + wy) * 0.75 + 2.2) * 0.8;
      // per-pixel hash softens the band edges so the swell never reads as stripes.
      // CRESTS ONLY: the navy trough pixels used to draw too (v < -2.15), and
      // chained along the sine bands they read as diagonal SCRATCHES across the
      // water — dark debris, not swell. Light catching a crest is the honest
      // cue; the trough is simply the body colour (same report as the depth fix).
      let hh = (Math.imul(x * 16 + jx, 73856093) ^ Math.imul(y * 16 + jy, 19349663)) >>> 0;
      hh = ((Math.imul(hh ^ (hh >>> 13), 0x85ebca6b) >>> 0) >>> 8) / 16777215;
      // …in the band-local lighter shade, so a crest still reads over the deep
      if (v > LAND.SWELL_GATE + (hh - 0.5) * 0.5) g.fillStyle = cols.crest[bandAt(jx, jy)];
      else continue;
      g.fillRect(x * TL + jx * px, y * TL + jy * px, px, px);
    }
    // sparse life: two short crest dashes + one pinpoint glint per tile, hash-placed
    let hh = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b)) >>> 0;
    for (let k = 0; k < 3; k++) {
      hh = (Math.imul(hh ^ (hh >>> 15), 0xc2b2ae35) >>> 0);
      const gx = hh & 15, gy = (hh >> 4) & 15;
      if (k < 2) { g.fillStyle = cols.crest[bandAt(gx, gy)]; g.fillRect(x * TL + Math.min(gx, 13) * px, y * TL + gy * px, px * (2 + (hh >> 9 & 1)), px); }
      else if ((hh & 3) === 0) { g.fillStyle = cols.glint[bandAt(gx, gy)]; g.fillRect(x * TL + gx * px, y * TL + gy * px, px, px); }
    }
  },

  // MOUNTAIN HEIGHT FIELD — the graph distance of every mountain tile from the
  // nearest non-mountain tile (1 at the rocky footprint, rising toward the
  // interior). A whole range shares one continuous field, so bilinear-sampling it
  // gives real slopes that fall away to the ground and ridgelines that run between
  // summits — no per-tile slabs. Computed once (mountains never move).
  /* THE WATER, PAINTED ONCE PER REPAINT INSIDE ITS OWN OUTLINE. Chaikin
     inscribes its curve, so the traced waterline sits inside the tile
     boundary at every convex corner; filling water by the square left raw
     blue poking out past the sand there — a sliver on a long coast, and on a
     small lake the entire shape, which read as a hard-edged rectangle with
     stair steps behind a correctly-traced pond. Clipping fixes it, and doing
     the clip ONCE for a whole repaint rather than per tile is what makes it
     affordable. Runs after the ground pass and before the decals. */
  /* `only`, when given, is the exact set of tile keys this call may paint.
     THE RESTRICTION IS A SET, NOT A CLIP, and that is the whole point: the
     body is painted inside waterBodyPath, a traced CURVE, whose clip edge
     the canvas antialiases. Nesting a second clip inside it — which
     drawTilesAt used to do to keep the repaint inside its reset ground —
     makes the rasterizer intersect two coverage masks and round the
     boundary pixels differently from the bake, which clips to the curve
     alone. That was worth up to a dozen pixels of drift per repaint along
     the waterline, byte-visible against a rebake and caught by
     tests/wild-grass.mjs. A membership test costs nothing and is exact. */
  paintWaterIn(g, x0, y0, x1, y1, only) {
    const terr = (S.map.seenTerrain || S.map.terrain), W = CFG.W;
    const wet = t => t === T.WATER || t === T.MOAT;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(CFG.W - 1, x1); y1 = Math.min(CFG.H - 1, y1);
    let any = false;
    for (let y = y0; y <= y1 && !any; y++) for (let x = x0; x <= x1; x++)
      if (wet(terr[y * W + x])) { any = true; break; }
    if (!any) return;
    const D = this.waterDepth();             // re-keyed ONCE per repaint, never per tile
    /* TWO PASSES: THE INTERIOR UNCLIPPED, THE EDGE UNDER THE OUTLINE. The
       traced curve runs along the wet/dry cell edges, and smoothing keeps
       it inside the lattice polygon while the roughening moves it less
       than a fifth of a tile — so a tile whose eight neighbours are all
       wet can never meet it, and painting that tile without the clip is
       byte-identical to painting it with one. It matters because the clip
       is a several-thousand-point path and a rasterizer pays for it on
       EVERY rect drawn under it: with the basin's seam tiles painted as
       runs of small rects, the deferred raster of a shore edit came due in
       35ms flushes (tests/land.mjs §5). The seams lie one to three tiles
       from land, which is exactly the interior. */
    const paint = (x, y) => {
      const t = terr[y * W + x];
      const h = (x * 73856093 ^ y * 19349663) >>> 0;
      const ovr = window.Assets ? Assets.terrainImg(t, h >>> 3) : null;
      if (ovr) this.blitTile(g, ovr, x, y); else this.paintWater(g, x, y, D);
    };
    const edgeOf = (x, y) => {
      for (const [ox, oy] of NEIGH8) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= CFG.H || !wet(terr[ny * W + nx])) return true;
      }
      return false;
    };
    let edges = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!wet(terr[y * W + x]) || !MapGen.onBoard(x, y)) continue;
      if (only && !only.has(y * W + x)) continue;
      if (edgeOf(x, y)) { edges++; continue; }
      paint(x, y);
    }
    if (!edges) return;
    g.save();
    g.clip(this.waterBodyPath());
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!wet(terr[y * W + x]) || !MapGen.onBoard(x, y) || !edgeOf(x, y)) continue;
      if (only && !only.has(y * W + x)) continue;
      paint(x, y);
    }
    g.restore();
  },

  /* THE ONE CUE ALL BLOCKED GROUND SHARES. A player has to be able to tell
     passable ground from impassable at a glance, and the surest way to make a
     signal trustworthy is to DERIVE IT FROM THE RULE IT SIGNALS: this asks
     `Path.blocksLand`, the same predicate movement itself asks, so the shading
     can never drift out of agreement with what units can actually do. Add a
     terrain to BLOCK_TERR and it gets the cue; take one out and it loses it.

     Deliberately quiet — a darker patch of ground beneath the cluster, no
     outline and no tint, so it reads as the shade under a solid mass rather
     than as an overlay. The boundary is DITHERED against the tile's own hash,
     because a flat fill over a tile-shaped footprint draws the tile: the
     dither thins toward whichever sides face open ground, so the shade fades
     out into the meadow instead of stopping at a straight line.

     Note what does NOT get it: a gold seam, a spent quarry and a felled stand
     are all WALKABLE, and marking them blocked would be exactly the lie this
     is meant to prevent. Gold is made unmistakable by being gold, not by
     pretending to be an obstruction. */
  blockShade(g, x, y, terr) {
    if (!Path.blocksLand(terr[MapGen.idx(x, y)])) return;
    const TL = CFG.TILE, N = LAND.BLOCK_SUB, cell = TL / N;
    const open = [];      // which sides look out onto ground you CAN walk
    for (const [ox, oy] of NEIGH8) {
      const nx = x + ox, ny = y + oy;
      open.push(MapGen.inB(nx, ny) && !Path.blocksLand(terr[MapGen.idx(nx, ny)]) ? [ox, oy] : null);
    }
    const edges = open.filter(Boolean);
    g.fillStyle = 'rgba(20,30,14,' + LAND.BLOCK_SHADE.toFixed(3) + ')';
    // DEEP INSIDE a mass every side is blocked, so there is no edge to fade
    // toward and nothing for the dither to do — the whole tile takes the
    // shade. One rect instead of sixty-four hashed cells, and in a big wood or
    // a big ore body that is most of the tiles.
    if (!edges.length) { g.fillRect(x * TL, y * TL, TL, TL); return; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N, v = (j + 0.5) / N;
      let near = 0;                                  // how close to an open side?
      for (const [ox, oy] of edges) {
        const d = Math.max(ox > 0 ? u : ox < 0 ? 1 - u : 0, oy > 0 ? v : oy < 0 ? 1 - v : 0);
        if (d > near) near = d;
      }
      const keep = 1 - near * LAND.BLOCK_FADE;
      if (keep <= 0) continue;
      if (this._lh(x * N + i, y * N + j, 113) > keep) continue;
      g.fillRect(x * TL + i * cell, y * TL + j * cell, cell, cell);
    }
  },

  /* ---- HILLS: HOW DEEP INTO THE HILL AM I? ------------------------------
     The same distance transform the mountain height field uses, over
     contiguous HILLS instead — 1 at the outer fringe, rising toward the
     middle of a mass. It is what lets a hill be shaded like a raised thing
     (interior lighter, edge darker) and what scales the cast shadow, so a
     broad upland throws a longer one than a single knoll.

     Unlike the mountains, hills MOVE: a quarry works a hill out to PEBBLES.
     So the field is keyed on a signature of where the hills are — the same
     device waterKey uses for the coast — and recomputed only when that
     actually changes, rather than computed once and quietly going stale. */
  _hillH: null, _hillKey: '', _hillMax: 1,
  /* the field WITHOUT re-checking the key. hillHeight() hashes the whole
     terrain array to decide whether the hills have moved, which is fine once
     per repaint and ruinous per TILE — and hillRelief/hillShadow run on every
     tile of the map. The three entry points that repaint (rebuildTerrain,
     drawTilesAt, drawTileAt) re-key once at the top; everything inside a
     repaint reads the answer they settled on. Measured: 169ms of bake back
     down to 135ms. */
  hillField() { return this._hillH || this.hillHeight(); },
  hillHeight() {
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    let k = 0x811c9dc5 ^ this.landSeed();
    for (let i = 0; i < terr.length; i++) if (terr[i] === T.HILLS) { k ^= i; k = Math.imul(k, 0x01000193); }
    const key = (k >>> 0) + ':' + W + 'x' + H;
    if (this._hillKey === key && this._hillH) return this._hillH;
    const d = new Int32Array(W * H), q = [];
    for (let i = 0; i < W * H; i++) { if (terr[i] === T.HILLS) d[i] = 1e6; else { d[i] = 0; q.push(i); } }
    for (let head = 0; head < q.length; head++) {
      const i = q[head], cx = i % W, cy = (i / W) | 0, nd = d[i] + 1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (terr[j] === T.HILLS && d[j] > nd) { d[j] = nd; q.push(j); }
      }
    }
    let max = 1;
    for (let i = 0; i < W * H; i++) { if (terr[i] !== T.HILLS) d[i] = 0; else if (d[i] > max) max = d[i]; }
    this._hillH = d; this._hillKey = key; this._hillMax = max;
    return d;
  },

  /* THE HILL ITSELF — a few hard value steps, lit from the upper left, with a
     catch-light along the northern edge where the ground turns to face the
     sun. Sampled from the tile's four CORNERS and resolved per sub-cell, for
     the same reason the ground tone is: one value per tile puts the steps on
     the tile boundaries and DRAWS the grid it is meant to hide. */
  /* A HILL IS READ AT ITS EDGES, NOT ACROSS ITS MIDDLE. Three passes were
     tried at shading the interior from the depth field — quantized steps,
     noise-perturbed steps, and a dithered slope term — and every one of them
     landed as tile-shaped rectangles, for a reason that is not a bug: on
     these maps a hill is ONE OR TWO TILES DEEP, so the depth field takes two
     distinct values and its gradient is near-constant within a tile and jumps
     between them. There is no interior to shade, and pretending otherwise
     just draws the grid.

     What is left is the pair of EDGE cues, which is what actually carries
     height anyway: a catch-light along the northern rim where the ground
     turns to face the sun, and the cast shadow on the ground to the south
     (hillShadow, below). Both are dithered with a per-cell hash so their
     boundaries are organic rather than ruled, and neither touches the middle
     of a hill, so neither can draw a rectangle. Restrained on purpose — a
     hill must stay clearly less than a mountain. */
  hillRelief(g, x, y, terr) {
    const d = this.hillField(), W = CFG.W, H = CFG.H, TL = CFG.TILE;
    const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= W || cy >= H) ? 0 : d[cy * W + cx];
    if (at(x, y - 1) !== 0) return;                 // not the northern rim of anything
    const px = TL / 32;
    g.fillStyle = 'rgba(240,248,225,' + LAND.HILL_RIM.toFixed(3) + ')';
    for (let i = 0; i < 32; i++) {
      const wob = this._latRead(this._latOne.edge,
        (x + i / 32) * LAND.HILL_SHADOW_WOBBLE, y * LAND.HILL_SHADOW_WOBBLE);
      const len = 1 + Math.round(wob * LAND.HILL_RIM_MAX);
      for (let k = 0; k < len; k++)
        if (this._lh(x * 32 + i, y * 32 + k, 57) < 1 - k / (len + 1))
          g.fillRect(x * TL + i * px, y * TL + k * px, px, px);
    }
  },

  /* …AND THE SHADOW IT THROWS. The cheapest and by far the most effective
     height cue there is: a dark band on the ground immediately SOUTH of a
     hill, its length scaled to how deep the hill behind it runs, with an
     irregular edge so it never reads as a drawn rectangle. Capped below one
     tile, which is what keeps the whole effect inside the 3x3 that a terrain
     edit already repaints. */
  hillShadow(g, x, y, terr) {
    const d = this.hillField(), W = CFG.W, TL = CFG.TILE, px = TL / 32;
    const above = (y - 1 >= 0) ? d[(y - 1) * W + x] : 0;
    if (!above) return;
    const reach = Math.min(LAND.HILL_SHADOW_MAX, 3 + above * 1.6);
    for (let i = 0; i < 32; i++) {
      const wob = this._latRead(this._latOne.edge,
        (x + i / 32) * LAND.HILL_SHADOW_WOBBLE, y * LAND.HILL_SHADOW_WOBBLE);
      const len = Math.max(1, Math.round(reach * (0.55 + wob * 0.75)));
      for (let k = 0; k < len; k++) {
        // fades out along its length, so the far edge is a falling-off rather
        // than a line — a hard-edged slab reads as a hole in the ground
        const a = LAND.HILL_SHADOW * (1 - k / len) * (1 - k / len);
        g.fillStyle = 'rgba(18,26,12,' + a.toFixed(3) + ')';
        g.fillRect(x * TL + i * px, y * TL + k * px, px, px);
      }
    }
  },

  /* =====================================================================
     MOUNTAINS ARE OBJECTS, NOT TILES

     Every previous attempt at this failed for the same architectural reason,
     not an artistic one. Mountains were drawn as a grid of tiles, and a
     mountain is the ONLY terrain in the game with real HEIGHT. A top-down
     tile grid has nowhere to put height: whatever is drawn inside one tile's
     square, the mass it belongs to still ends on the lattice, so the result
     reads as a flat grey blob however good the individual tile is. Sharpening
     the texture only makes a busier blob.

     So a mountain is not a set of tiles here. Each contiguous MOUNTAIN area
     is ONE OBJECT with a traced outline and an internal height field, drawn
     once into its own layer, and the layer is composited over the ground.

       1. FLOOD  contiguous mountain cells (4-connected) into regions, and
                 TRACE each region's boundary into closed polygons — the same
                 machinery the coast uses (R.floodTrace).
       2. FIELD  a distance transform: how far each mountain cell is from the
                 nearest cell that is NOT mountain. This one array is the
                 backbone of everything — it IS the height (edges low, deep
                 cells high), its local maxima are the ridge and the peak
                 candidates, and its maximum says how big the range is.
       3. CLASS  by cell count, because a single tile trying to look like a
                 mountain is a large part of why this has always failed.
       4. SHAPE  fracture the traced polygon off the lattice: displace its
                 corners, then subdivide with displacement until the segments
                 are shorter than a tile. Rock wants ANGULAR, so displacement
                 runs along the segment normal and is never smoothed.
       5. SHADE  the interior in hard value steps from the field — no
                 gradients, light from the upper left, wide value range.

     GAMEPLAY TRUTH IS TILE-BASED AND IS NOT TOUCHED. The art overhangs its
     footprint; passability, placement, pathing, projectiles, fog and the
     rival AI all still read S.map.terrain and cannot tell. What the player is
     owed in exchange is an unambiguous CONTACT EDGE at the true tile
     boundary, which is drawn along the base of every region.

     Cost: this replaces a per-tile painter that cost ~1.3ms a tile (eighty
     integer-hash noise evaluations per pixel) and ~1.1s of first bake on a
     range-heavy map. Region rendering pays one pass over each region's own
     pixels, reading two BAKED noise lattices rather than hashing. ===== */
  MTN,
  _mtnKey: '', _mtn: null, _mtnArt: null, _mtnLayerKey: '', _mtnCover: null,

  /* the mountains' own cache key. Mountains never change during a run (no
     terraform tool touches MOUNTAIN), so in practice this is computed once —
     but it is a hash of the actual cells, not a flag, so an editor or a
     future rule that does move one invalidates everything by itself. */
  mtnKey() {
    const terr = (S.map.seenTerrain || S.map.terrain);
    let h = 0x811c9dc5 ^ this.landSeed();
    for (let i = 0; i < terr.length; i++) if (terr[i] === T.MOUNTAIN) { h ^= i; h = Math.imul(h, 0x01000193); }
    return (h >>> 0) + ':' + CFG.W + 'x' + CFG.H;
  },

  /* THE DISTANCE TRANSFORM, over the whole map at once. 8-connected on
     purpose: a 4-connected transform grows diamonds, and a mountain whose
     height field is a diamond has a visible cross through its summit. Cells
     that are not mountain stay 0, so the field doubles as the membership
     test.

     OFF THE MAP COUNTS AS MOUNTAIN, deliberately — the wavefront starts only
     at in-bounds non-mountain cells, so nothing outside the board ever pushes
     the height down. A range running into the border therefore stays TALL at
     the edge and reads as continuing past it, which is what a range at the
     edge of the world should look like; seeded from the void it would taper
     to nothing against a black rim instead. */
  mtnField() {
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const d = new Int32Array(W * H), q = new Int32Array(W * H);
    let head = 0, tail = 0;
    for (let i = 0; i < W * H; i++) {
      if (terr[i] === T.MOUNTAIN) d[i] = 0x7fffffff;
      else { d[i] = 0; q[tail++] = i; }
    }
    while (head < tail) {
      const i = q[head++], cx = i % W, cy = (i / W) | 0, nd = d[i] + 1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (d[j] > nd) { d[j] = nd; q[tail++] = j; }
      }
    }
    /* …AND THE SAME TRANSFORM RUN OUTWARD. How far a point lies OUTSIDE the
       footprint is what keeps the fractured silhouette honest: the art may
       leave its tiles, but only upward, and only by the room the cliff needs.
       Sideways and southward it stays within MTN.OUT_MAX of the true
       boundary, so the mass's own dark rim IS the contact edge the player
       needs, to within a fraction of a tile. */
    const o = new Int32Array(W * H);
    head = 0; tail = 0;
    for (let i = 0; i < W * H; i++) {
      if (terr[i] !== T.MOUNTAIN) o[i] = 0x7fffffff;
      else { o[i] = 0; q[tail++] = i; }
    }
    while (head < tail) {
      const i = q[head++], cx = i % W, cy = (i / W) | 0, nd = o[i] + 1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (o[j] > nd) { o[j] = nd; q[tail++] = j; }
      }
    }
    for (let i = 0; i < W * H; i++) if (terr[i] !== T.MOUNTAIN) d[i] = 0; else o[i] = 0;
    return { inD: d, outD: o };
  },

  /* SIZE CLASS. Not every mountain area should be drawn as a mountain: one
     cell straining to look like a peak is exactly the failure this rewrite
     exists to end. The thresholds are MTN.CLS_*. */
  mtnClass(n) {
    if (n <= MTN.CLS_OUTCROP) return 0;      // boulder cluster — no peak, no cliff
    if (n <= MTN.CLS_CRAG) return 1;         // rocky crag — modest cliff, one high point
    if (n <= MTN.CLS_MOUNTAIN) return 2;     // a mountain — a peak and a real cliff
    return 3;                                // a range — several peaks along the ridge
  },

  mtnRegions() {
    const key = this.mtnKey();
    if (this._mtnKey === key && this._mtn) return this._mtn;
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const isM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && terr[y * W + x] === T.MOUNTAIN;
    const F = this.mtnField(), field = F.inD, outD = F.outD;
    /* how far outside the footprint a point lies, in tiles — nearest-cell is
       accurate enough at this scale and costs nothing */
    const outAt = (x, y) => {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return 99;
      return outD[cy * W + cx];
    };
    /* HOW THICK THE ROCK IS BEHIND A STRETCH OF EDGE. A one-tile arm has an
       edge on both sides of it, and displacing both by a third of a tile
       throws spikes and cuts the arm into detached shards. The teeth are
       therefore scaled by how much mountain there is to bite into. */
    const depthAt = (x, y) => {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) return 0;
      let m = field[cy * W + cx];
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (field[ny * W + nx] > m) m = field[ny * W + nx];
      }
      return m;
    };
    const regions = this.floodTrace(isM);
    for (const r of regions) {
      let maxD = 1, sx = 0, sy = 0;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const k of r.cells) {
        const cx = k % W, cy = (k / W) | 0;
        if (field[k] > maxD) maxD = field[k];
        sx += cx; sy += cy;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      }
      r.maxD = maxD;
      r.cls = this.mtnClass(r.cells.length);
      r.cx = sx / r.cells.length; r.cy = sy / r.cells.length;
      r.box = [x0, y0, x1, y1];
      /* THE OUTLINE IS SEEDED FROM THE REGION, not from where it happens to
         sit, so two ranges of the same shape on the same seed still differ —
         and the same seed always draws the same mountain. */
      r.seed = (Math.imul(r.cells.length, 0x9e3779b1)
        ^ Math.imul(x0 * 73856093 ^ y0 * 19349663, 0x85ebca6b) ^ this.landSeed()) >>> 0;
      r.loops = r.loops.map((l, i) => this.fractureLoop(l, r.seed + i * 7919, r.cls, outAt, depthAt));
      /* PEAKS — the field's local maxima, thinned so no two crowd, capped by
         class: a range carries several at varied heights along its ridge, a
         mountain one or two, a crag at most one, and only where there is
         genuine depth to stand them on. Each rolls its own height and width
         from the region seed, so a range's silhouette never repeats one
         shape. They feed the lift (drawMtnRegion's E) as gaussian bumps —
         a peak IS a taller extrusion, not a pasted-on triangle. */
      {
        const hsh = (a, b3) => this._lh(a | 0, b3 | 0, (r.seed & 511) + 601);
        const cand = [];
        for (const k of r.cells) {
          if (field[k] < 2) continue;
          const cx = k % W, cy = (k / W) | 0;
          let isMax = true;
          for (let oy = -1; oy <= 1 && isMax; oy++) for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = cx + ox, ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const dj = field[ny * W + nx];
            if (dj > field[k] || (dj === field[k] && (oy < 0 || (oy === 0 && ox < 0)))) { isMax = false; break; }
          }
          if (isMax) cand.push({ x: cx + 0.5 + (hsh(cx, cy) - 0.5) * 0.6, y: cy + 0.5, d: field[k] });
        }
        cand.sort((a, b3) => b3.d - a.d);
        const capN = r.cls === 3 ? Math.min(5, 1 + ((r.cells.length / 22) | 0)) : r.cls === 2 ? 2 : 1;
        r.peaks = [];
        for (const c of cand) {
          if (r.peaks.length >= capN) break;
          if (r.peaks.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 2.4)) continue;
          c.h = MTN.PEAK_LIFT * (0.55 + 0.5 * c.d / r.maxD) * (0.75 + hsh(c.x * 13, c.y * 7) * 0.5);
          c.sg = 0.45 + hsh(c.x * 5, c.y * 17) * 0.65;
          r.peaks.push(c);
        }
      }
    }
    this._mtn = regions; this._mtnKey = key; this._mtnH = field; this._mtnOut = outD;
    return regions;
  },
  mtnHeight() { this.mtnRegions(); return this._mtnH; },

  /* ---- 4. THE SILHOUETTE ------------------------------------------------
     The make-or-break step. A traced tile loop is all right angles and long
     straight runs, and no amount of interior detail hides that. Three moves,
     in order:

       CORNERS   collapse the loop's unit edges to the points where the
                 direction actually changes, so a five-tile straight run
                 becomes one segment rather than five.
       DISPLACE  push every corner off the lattice by sub-tile noise.
       FRACTURE  subdivide, displacing each midpoint along the segment's
                 NORMAL, until no segment is longer than MTN.SEG_MAX. The
                 amplitude falls with the level, so the edge is jagged at
                 several scales at once, which is what rock does.

     Displacement runs along the normal and the result is NEVER smoothed:
     Chaikin is right for a coastline and wrong here — corner-cutting is
     precisely what turns rock into a soft rolling curve. */
  fractureLoop(loop, seed, cls, outAt, depthAt) {
    const rnd = ART.rng((seed | 1) >>> 0);
    // CORNERS: keep a point only where the run changes direction
    const pts = [];
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
      if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) pts.push([b[0], b[1]]);
    }
    if (pts.length < 3) return loop.map(p => [p[0], p[1]]);
    // DISPLACE the corners themselves
    const jit = MTN.OUTLINE_JITTER * (cls === 0 ? 0.6 : 1);
    /* NEVER BULGE PAST THE FOOTPRINT. A displacement that would put the edge
       more than OUT_MAX outside its own tiles is TURNED INWARD instead — the
       teeth stay, they just bite in rather than out. Without this the mass
       covered walkable ground on every side, and the honest contact line the
       player needs then had to be scratched across the middle of the rock in
       long right-angled runs, which looked exactly as bad as it sounds. */
    const keep = (x, y, ox2, oy2) =>
      (outAt && outAt(x, y) > MTN.OUT_MAX) ? [ox2 * 2 - x, oy2 * 2 - y] : [x, y];
    for (const p of pts) {
      const ox2 = p[0], oy2 = p[1];
      const thick = depthAt ? Math.min(1, depthAt(ox2, oy2) / MTN.THIN_DEPTH) : 1;
      const j2 = jit * (MTN.THIN_FLOOR + (1 - MTN.THIN_FLOOR) * thick);
      const c = keep(ox2 + (rnd() - 0.5) * 2 * j2, oy2 + (rnd() - 0.5) * 2 * j2, ox2, oy2);
      p[0] = c[0]; p[1] = c[1];
    }
    // FRACTURE: midpoint subdivision along the normal
    let cur = pts, amp = MTN.FRACTURE_AMP * (cls === 0 ? 0.55 : 1);
    for (let lvl = 0; lvl < MTN.FRACTURE_LEVELS; lvl++) {
      const out = [];
      let any = false;
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i], b = cur[(i + 1) % cur.length];
        out.push(a);
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        if (len <= MTN.SEG_MAX) continue;
        any = true;
        const nx = -dy / len, ny = dx / len;
        const t = 0.5 + (rnd() - 0.5) * MTN.FRACTURE_SKEW;   // the break is off-centre
        /* THE DISPLACEMENT IS PROPORTIONAL TO THE SEGMENT, which is what
           makes this fractal — the same relative roughness at every scale, so
           the edge is jagged whether you are looking at a whole flank or at
           four pixels of it. The first version decayed the amplitude on TOP
           of the length factor and the finest levels moved by a fifth of a
           pixel: the polygon was genuinely fractured (431 vertices, 12%
           axis-aligned) and still read as straight runs on screen, because
           nothing had actually moved. The cap keeps a long opening segment
           from throwing a spike across two tiles. */
        const mx = a[0] + dx * t, my = a[1] + dy * t;
        const thick = depthAt ? Math.min(1, depthAt(mx, my) / MTN.THIN_DEPTH) : 1;
        const d = (rnd() - 0.5) * 2 * amp * Math.min(len, MTN.FRACTURE_CAP) * (MTN.THIN_FLOOR + (1 - MTN.THIN_FLOOR) * thick);
        const c = keep(mx + nx * d, my + ny * d, mx, my);
        out.push(c);
      }
      cur = out;
      amp *= MTN.FRACTURE_DECAY;
      if (!any) break;
    }
    return cur;
  },

  /* THE FACETS ARE PLANES, NOT NOISE. Smooth value noise added to the height
     field gives soft blobby plateaus — amoebas, not rock — however hard the
     value steps that quantize it. Real rock is flat faces meeting at creases,
     so the mass is broken into irregular cells (nearest of a jittered
     lattice — a Worley F1 partition, whose boundaries are straight lines) and
     each cell is given its own base height AND its own tilt. Inside a cell
     the surface is a plane, so the light over it is constant; between cells
     the gradient jumps, which is exactly a crease. Coarse on purpose: fine
     faceting is mush at play zoom and is another reason previous attempts
     read as noise. */
  mtnFacetSites(seed, x0, y0, x1, y1, scale) {
    const g = MTN.FACET_CELL * (scale || 1), sites = [];
    const i0 = Math.floor(x0 / g) - 1, i1 = Math.ceil(x1 / g) + 1;
    const j0 = Math.floor(y0 / g) - 1, j1 = Math.ceil(y1 / g) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = this._lh(i, j, seed & 1023), b = this._lh(i + 7919, j, (seed >> 5) & 1023);
      const c = this._lh(i, j + 7919, (seed >> 11) & 1023), e = this._lh(i + 31, j + 31, (seed >> 3) & 1023);
      /* UNWEIGHTED distance, deliberately. A multiplicative weight varies the
         face sizes but bends every bisector into an arc, and the mass came
         out as cobblestones — rounded pebbles with grouting. Plain distance
         gives straight bisectors, which is what a fractured plane looks like;
         the sizes vary enough from the jitter alone. */
      sites.push([(i + a) * g, (j + b) * g, (c - 0.5) * 2, (e - 0.5) * 2, (a + c - 1)]);
    }
    return { sites, g, i0, j0, iw: i1 - i0 + 1 };
  },

  /* ---- 5. THE INTERIOR --------------------------------------------------
     Rasterised once per region over its own bounding box. Two passes: build a
     height buffer at pixel resolution (bilinear field + two COARSE noise
     octaves), then read the buffer's own gradient for the light. Doing the
     light from a buffer rather than re-sampling four neighbours per pixel is
     what keeps this cheap — and coarse is deliberate: fine texture turns to
     mush at play zoom and is another reason previous attempts read as noise.

     Values are quantized to MTN.STEPS hard steps of the `crag` ramp. No
     gradients, no anti-aliasing: the same language as the building art. */
  /* ---- THE LAYER: ONCE PER MAP, EACH REGION AS ROW STRIPS ---------------
     Mountains never move in a run, so the art is a pure function of the map.
     What changed in phase 3 is WHERE it lives: it is no longer composited
     into the terrain cache at all, because an extruded mountain has to
     OCCLUDE — a unit walking behind a ridge is hidden by it, one walking in
     front draws over it — and art baked under the unit pass can never do
     that. Each region's art is cut into ROW STRIPS, one per footprint row
     (`owner`, stamped during the warp: every pixel knows which ground row it
     stands on), and the frame's unit pass interleaves strips and units by
     row. Cheap: a few dozen visible drawImage calls a frame.

     Rebuilt when the SEEN mountains change (fog reveals go through
     drawTilesAt, which flags `_mtnDirty` when a repainted tile is mountain),
     and the key check inside makes a spurious rebuild a no-op. */
  buildMtnLayer() {
    const W = CFG.W, H = CFG.H;
    const key = this.mtnKey();
    if (this._mtnLayerKey === key && this._mtnArt) return;
    this._mtnLayerKey = key;
    const regions = this.mtnRegions();
    this._mtnArt = []; this._mtnStrips = [];
    this._mtnCover = new Uint8Array(W * H);
    this._mtnOcc = new Set();
    if (!regions.length) return;
    /* which art dresses a region, in order of preference: FORMATION pieces
       (hand-drawn multi-tile artwork, js/formations.js — strips cut per
       placed piece so the occlusion interleave below still holds), then a
       supplied mountain.png tile override (stands the whole layer down, the
       old rule), then the procedural extrusion. A region the solver cannot
       FULLY cover keeps the procedural drawing — the extrusion is one
       object and cannot mix with pieces (the 'region' fallback policy). */
    const haveFormations = window.Formations && Formations.artTerrain(T.MOUNTAIN);
    /* the ?dev=1 force-place pin: the workbench pins one dropped piece onto
       the LARGEST region, solver be damned — a 5x4 range is unviewable on
       the 2-cell crags the solver would leave it. Gated on DevArt.on, so
       normal play never takes this branch. */
    const pin = (window.DevArt && DevArt.on && DevArt.formationPin && haveFormations)
      ? DevArt.formationPin : null;
    let pinRegion = null;
    if (pin) for (const r of regions)
      if (!pinRegion || r.cells.length > pinRegion.cells.length) pinRegion = r;
    if (!haveFormations && window.Assets && Assets.terrainImg(T.MOUNTAIN, 0)) return;   // supplied tile art wins
    this.landLattices();
    const terr = (S.map.seenTerrain || S.map.terrain);
    for (const r of regions) {
      let art = (r === pinRegion) ? Formations.pinnedStrips(r, pin.stem) : null;
      if (!art && haveFormations) art = Formations.mtnRegionStrips(r);
      /* the DRAWN KIT outranks the extrusion wherever it is installed: a
         region big enough to carry a chain of massifs gets art, a boulder
         outcrop stays a boulder outcrop, and with no kit on disk nothing
         below this line has changed at all. */
      if (!art && MTN.KIT && r.cls > 0 && typeof Assets !== 'undefined' && Assets.mtnKitReady && Assets.mtnKitReady())
        art = this.drawMtnChained(r);
      if (!art) art = (r.cls === 0) ? this.drawMtnOutcrop(r) : this.drawMtnRegion(r);
      if (!art) continue;
      this._mtnArt.push(art);
      for (const s of art.strips) this._mtnStrips.push(s);
      for (const k of art.cover) {
        this._mtnCover[k] = 1;
        if (terr[k] !== T.MOUNTAIN) this._mtnOcc.add(k);   // art over walkable ground
      }
    }
    this._mtnStrips.sort((a, b) => a.row - b.row);
    // the borrowed pixel buffers go back now the layer is built
    if (typeof Assets !== 'undefined' && Assets.releaseMtnPx) Assets.releaseMtnPx();
  },
  mtnKitOn() {
    return !!(MTN.KIT && typeof Assets !== 'undefined' && Assets.mtnKitReady && Assets.mtnKitReady());
  },
  mtnStrips() {
    if (!this._mtnArt || this._mtnDirty) { this._mtnDirty = false; this.buildMtnLayer(); }
    return this._mtnStrips || [];
  },

  drawMtnOutcrop(r) {
    const TL = CFG.TILE, W = CFG.W;
    const [bx0, by0, bx1, by1] = r.box;
    const ax = Math.max(0, (bx0 - MTN.PAD_SIDE) * TL), ay = Math.max(0, (by0 - MTN.PAD_UP) * TL);
    const c = document.createElement('canvas');
    c.width = (bx1 - bx0 + 1 + MTN.PAD_SIDE * 2) * TL;
    c.height = (by1 - by0 + 1 + MTN.PAD_UP + MTN.PAD_DOWN) * TL;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(-ax, -ay);
    const put = [], cover = new Set();
    for (const k of r.cells) {
      const cx = k % W, cy = (k / W) | 0;
      cover.add(k);
      const n = MTN.OUTCROP_N + ((this._lh(cx, cy, 3) * 2) | 0);
      for (let i = 0; i < n; i++) {
        const a = this._lh(cx * 31 + i, cy, 11), b = this._lh(cx, cy * 31 + i, 13);
        const c2 = this._lh(cx + i, cy + i, 17), d = this._lh(cx * 7 + i, cy * 5, 19);
        const rr = MTN.OUTCROP_MIN + ((c2 * (MTN.OUTCROP_MAX - MTN.OUTCROP_MIN + 1)) | 0);
        /* a boulder's whole stamp (body + padding) stays within OUT_MAX of
           its own cell — a rock lying on the neighbour's walkable grass is
           the lie the bound exists to prevent */
        const slack = MTN.OUT_MAX * TL - 4, lo = Math.max(rr + 3 - slack, 4), hi = TL - (rr + 3) + slack;
        put.push([cx * TL + lo + a * Math.max(1, hi - lo), cy * TL + lo + b * Math.max(1, hi - lo), rr,
          (d * Sprites.ROCK_KINDS) | 0, Sprites.STONE_MIX[(a * Sprites.STONE_MIX.length) | 0],
          (b * 4) | 0]);
      }
    }
    put.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rr, kind, pal, vs] of put) {
      const st = Sprites.rockStamp(kind, rr, pal, vs);
      g.drawImage(st, Math.round(x) - st._ox, Math.round(y) - st._oy);
    }
    // one strip: a boulder cluster stands at ground level and occludes like
    // any other row of stone — its ground row is its bottom cell
    return { c, x: ax, y: ay, cover, kind: 'outcrop', strips: [{ row: by1, x: ax, y: ay, c }] };
  },

  /* ---- THE CHAINED KIT: a region dressed in drawn massifs -------------
     The composition is an illustrator's, not a solver's, and it follows the
     operator's rules for how a range is read:

       SMALL IN FRONT, BIG BEHIND. You do not step from meadow to alp. The
       southern edge — the edge nearest the camera — takes FOOTHILLS; the
       big peaks stand in ranks behind them, drawn first so the small stuff
       overlaps their feet. A region too shallow to hold both is foothills
       and nothing else, which is what a low rocky region should be.

       NO TWO SADDLES IN A ROW. A saddle is the low link BETWEEN summits;
       two of them side by side is a dent, not a range.

       NEVER OVER WATER, AND NEVER ONTO THE BEACH. Art may overhang bare
       ground, but a mountain growing out of a lake is a lie, so the
       overhang stops short of the water with a little grass to spare.

       NO STRAIGHT LINES. Nothing is cut on a tile boundary: the art is
       masked by the region's own FRACTURED polygon (organic by
       construction) extended north per column, so every edge the player
       sees is either drawn rock or a jagged outline.

       TREES IN FRONT WIN. A wood standing south of the range is nearer the
       camera than the rock is, so its crowns draw OVER the mountain's foot.
       Trees behind it are hidden, as they should be. */
  mtnChainPlan(r) {
    const W = CFG.W, kit = Assets.mtnKit;
    const peaks = kit.peak || [];
    if (!peaks.length) return null;
    const saddles = (kit.saddle && kit.saddle.length) ? kit.saddle : null;
    const low = MTN.KIT_LOW !== 0;
    const hills = (low && kit.hill && kit.hill.length) ? kit.hill : null;
    const rolls = (low && kit.roll && kit.roll.length) ? kit.roll : null;
    const foots = (kit.foot && kit.foot.length) ? kit.foot : null;
    const [bx0, by0, bx1, by1] = r.box;
    const cw = bx1 - bx0 + 1;
    const north = new Int32Array(cw).fill(1e9), south = new Int32Array(cw).fill(-1);
    for (const k of r.cells) {
      const tx = (k % W) - bx0, ty = (k / W) | 0;
      if (ty < north[tx]) north[tx] = ty;
      if (ty > south[tx]) south[tx] = ty;
    }
    const hsh = (a, b) => this._lh(a | 0, b | 0, (r.seed & 511) + 811);
    /* A MOUNTAIN IS NEVER PLACED WHERE THE WATER WOULD CUT IT. The wet ban
       clears art drawn over a lake and its beach, and a peak whose summit
       rose into that band came out with its top sliced flat — the rule was
       protecting the shoreline and butchering the mountain. So the test
       moves to PLACEMENT: if any tile this piece's rock would touch is
       banned, the piece does not go there at all. A shorter one may still
       fit, which is what the small pieces in the kit are for; if none fits,
       the slot stays empty and the ground is simply left open. */
    const TLp = CFG.TILE, Hp = CFG.H;
    const terrP = (S.map.seenTerrain || S.map.terrain);
    const wetAt = new Map();
    const wet = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= Hp) return true;
      const k = ty * W + tx;
      const hit = wetAt.get(k);
      if (hit !== undefined) return hit;
      const t0 = terrP[k];
      let v = false;
      if (t0 !== T.MOUNTAIN) {
        if (t0 === T.WATER || t0 === T.MOAT) v = true;
        else {
          const gap = MTN.KIT_SHORE_GAP | 0;
          for (let oy = -gap; oy <= gap && !v; oy++) for (let ox = -gap; ox <= gap; ox++) {
            const nx = tx + ox, ny = ty + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= Hp) continue;
            const tt = terrP[ny * W + nx];
            if (tt === T.WATER || tt === T.MOAT) { v = true; break; }
          }
        }
      }
      wetAt.set(k, v);
      return v;
    };
    // every tile this piece's rock would touch, including its far edges
    const clipped = (piece, tx, fyTile) => {
      const bb = piece.bb;
      if (!bb) return false;
      const x0 = tx * TLp + bb.x0, x1 = tx * TLp + bb.x1;
      const y0 = fyTile * TLp - piece.h + bb.y0, y1 = fyTile * TLp - piece.h + bb.y1;
      for (let y = y0; ; y += TLp) {
        const yy = Math.min(y, y1);
        for (let x = x0; ; x += TLp) {
          const xx = Math.min(x, x1);
          if (wet((xx / TLp) | 0, (yy / TLp) | 0)) return true;
          if (xx >= x1) break;
        }
        if (yy >= y1) break;
      }
      return false;
    };
    const plan = [];
    /* THE BANDS, and why they are only a tile or two apart. A range is read
       the way the forest is: the land does not jump from meadow to alp, it
       THICKENS — small rolling rises first, then foothills, then the peaks
       behind them — and each band must TOUCH the one behind it. The step is
       therefore measured against the art's own height, not in whole ranks:
       a foothill set one tile back still overlaps the rolling rise in front
       of it, and the peak set two tiles behind still overlaps the foothill.
       Any wider and grass shows between the bands, which is the tell that
       gave the last round away. Bands are listed front to back and walked
       BACK to front, so the plan is built in draw order. */
    const bands = [];
    if (rolls) bands.push({ up: 0, kind: 'roll' });
    if (hills) bands.push({ up: 0, kind: 'hill' });
    /* ALL THREE FRONT BANDS SHARE THE FOOT ROW. Setting the peaks even one
       tile back left a strip of grass between them and the foothills — the
       art's own opaque top sits a little below its canvas top, so a nominal
       overlap was no overlap at all. Standing them on the SAME line and
       letting the low bands (drawn last, and shorter) cover the peaks' feet
       is what stacks them one on top of the other. */
    const peakBase = 0;
    for (let i = 0; i < MTN.KIT_RANK_MAX; i++) bands.push({ up: peakBase + i * MTN.KIT_RANK_STEP, kind: 'peak' });
    bands.reverse();
    // the ground line goes on absolutely last, over everything's feet
    if (foots) bands.push({ up: 0, kind: 'foot' });
    let slot = 0, nPeaks = 0;
    /* WHICH member of an only-one group this region gets, decided ONCE and
       by the region's own seed. Left to the rotation alone the first member
       always won and the second was never drawn at all: the exclusion only
       bites after one is placed, so the later one never got a turn. */
    const onlyPick = new Map();
    for (const pl of (kit.peak || [])) {
      if (!pl.only || onlyPick.has(pl.only)) continue;
      const mates = (kit.peak || []).filter(q => q.only === pl.only);
      onlyPick.set(pl.only, mates[(hsh(mates.length * 31, 71) * mates.length) | 0].stem);
    }
    const usedOnly = new Set();   // only-one groups already standing in this region
    for (const rank of bands) {
      let x = bx0, prevSaddle = false, any = false;
      while (x <= bx1) {
        /* WHICH PIECE. The front bands are the low ground; behind them a
           peak. The pool is tried in a hashed ROTATION and the first piece
           that actually fits takes the slot — a tall mountain fails wherever
           the water would clip it, and a smaller one steps in. If nothing in
           the pool fits, the slot is left empty and the ground stays open,
           which is far better than a summit sliced off by a lake. */
        let pool = peaks, kind = 'peak';
        if (rank.kind === 'foot') { pool = foots; kind = 'foot'; }
        else if (rank.kind === 'roll') { pool = rolls; kind = 'roll'; }
        else if (rank.kind === 'hill') { pool = hills; kind = 'hill'; }
        else if (saddles && !prevSaddle && slot > 0 && hsh(slot, 13) < MTN.KIT_SADDLE_EVERY) { pool = saddles; kind = 'saddle'; }
        if (kind === 'peak' && MTN.KIT_MAX_PEAKS > 0 && nPeaks >= MTN.KIT_MAX_PEAKS) { x += 1; continue; }
        /* the rotation starts among the TALL pieces, so a big mountain is
           tried wherever one will stand; the small knolls further down the
           pool only get a slot when nothing taller fits — which is what they
           are in the kit for */
        const tallN = Math.max(1, pool.filter(pp => pp.h >= pool[0].h * 0.75).length);
        const start = (hsh(slot, 29) * tallN) | 0;
        let piece = null, useFy = -1;
        for (let pi = 0; pi < pool.length; pi++) {
          const cand = pool[(start + pi) % pool.length];
          /* a SPARING piece has to win a roll before it is even considered,
             so it turns up here and there instead of carrying a whole range */
          if (cand.rare < 1 && hsh(slot * 7 + pi, 53) > cand.rare) continue;
          // …and at most one member of an ONLY-ONE group stands in a region:
          // two pieces that are the same rock at the same size read as a copy
          if (cand.only && (usedOnly.has(cand.only) || onlyPick.get(cand.only) !== cand.stem)) continue;
          /* CEIL, not round: a 168px piece is 5.25 tiles wide, and rounding
             down let a quarter-tile of rock hang past the footprint onto
             walkable ground — which is precisely what the honesty pin
             measures. Demand every tile the art spans. */
          const span = Math.max(1, Math.ceil(cand.w / CFG.TILE));
          /* THE FOOT goes on the NORTHERNMOST of the southern rows this piece
             spans, pulled north by the rank: every column it covers then has
             mountain at or below it, so no piece hangs off a ragged edge. */
          let fy = 1e9, cols = 0;
          for (let q = 0; q < span; q++) {
            const cx = x - bx0 + q;
            if (cx < 0 || cx >= cw || south[cx] < 0) continue;
            cols++;
            const f = south[cx] - rank.up;
            if (f < fy) fy = f;
          }
          if (cols < span || fy >= 1e9 || fy < 0) continue;
          let onRock = 0;
          for (let q = 0; q < span; q++) {
            const cx = x - bx0 + q;
            if (cx >= 0 && cx < cw && south[cx] >= fy && north[cx] <= fy) onRock++;
          }
          if (onRock < span * 0.7) continue;
          /* A TALL MOUNTAIN NEEDS DEEP GROUND UNDER IT. The honesty contract
             lets art rise north of its footprint only by the lift's reach
             (PAD_UP); stand a five-tile-tall drawing on a two-tile strip of
             rock and its summit is floating over meadow with nothing beneath
             it. So the ground each column spans must come up to within
             PAD_UP tiles of the piece's own top — otherwise a shorter piece
             takes the slot, which is what the knolls are for. */
          const topTile = fy + 1 - Math.ceil(cand.h / CFG.TILE);
          let deepEnough = true;
          for (let q = 0; q < span && deepEnough; q++) {
            const cx = x - bx0 + q;
            if (cx < 0 || cx >= cw || south[cx] < 0) continue;
            if (topTile + MTN.PAD_UP < north[cx]) deepEnough = false;
          }
          if (!deepEnough) continue;
          /* THE LOW BANDS HUG THE ROCK, and stand at the MOUNTAIN'S own foot
             rather than at their own column's southern edge — the rock a low
             piece belongs to is the only thing that can tell it where the
             ground is, and half its span has to sit under that rock or it
             ends up marooned on the grass beside it. */
          let hugFy = -1;
          if (kind !== 'peak' && kind !== 'saddle') {
            for (const q of plan) {
              if (q.kind !== 'peak' && q.kind !== 'saddle') continue;
              const qs = q.tx, qe = q.tx + Math.round(q.piece.w / CFG.TILE);
              const ov = Math.min(x + span, qe) - Math.max(x, qs);
              if (ov >= span * 0.5 && q.fy > hugFy) hugFy = q.fy;
            }
            if (hugFy < 0) continue;
            /* …but never SOUTH of its own ground. A foothill takes the
               mountain's foot row, and where the blob's edge steps north that
               row can lie past the low piece's own columns — which is the last
               place art was found hanging over open meadow. */
            for (let q = 0; q < span; q++) {
              const cx = x - bx0 + q;
              if (cx >= 0 && cx < cw && south[cx] >= 0 && south[cx] + 1 < hugFy) { hugFy = -1; break; }
            }
            if (hugFy < 0) continue;
          }
          const fyTile = hugFy >= 0 ? hugFy : fy + 1;
          if (clipped(cand, x, fyTile)) continue;      // the water would cut it
          piece = cand; useFy = fyTile;
          break;
        }
        if (!piece) { x += 1; continue; }
        if (kind === 'peak') nPeaks++;
        if (piece.only) usedOnly.add(piece.only);
        plan.push({ piece, kind, tx: x, fy: useFy, up: rank.up, front: kind === 'foot' || rank === bands[bands.length - (foots ? 2 : 1)] });
        prevSaddle = (kind === 'saddle');
        any = true; slot++;
        /* the step is measured on the piece's TORN width — the tear takes
           a bite out of both flanks, and stepping by the untorn width left a
           strip of grass between every pair */
        const bite = Math.max(2, Math.min(MTN.KIT_TEAR, Math.round(Math.min(piece.w, piece.h) * 0.17)));
        x += Math.max(1, Math.round((piece.w - 2 * bite) * (1 - MTN.KIT_OVERLAP) / CFG.TILE));
      }
      if (!any && rank.up > 0) continue;      // no room for this rank; the shallower ones still stand
    }
    /* NO SUMMIT, NO KIT. A region too narrow to stand a single mountain in
       was being dressed in foothills and ground lines alone, which left low
       strips standing on open grass with nothing behind them. If the rock
       cannot be the subject, the region keeps its old drawing. */
    if (!nPeaks) return null;
    return plan.length ? plan : null;
  },

  /* A WOOD AT THE FOOT. Real forest tiles already draw over the rock where
     they stand (THE WOOD IN FRONT, below), but a massif rising straight out
     of bare meadow reads as dropped onto the map. So the ground around the
     rock grows a scatter of small stands whose crowns lap over its bottom
     edge, the way a wood at the foot of a mountain does.
     ANCHORED TO THE ART, NOT THE FOOTPRINT. A region's tiles and its drawn
     rock are not the same shape — the solver places a handful of pieces
     inside a footprint that can be several times their span, so an apron
     measured from the region would seed woods in open meadow nowhere near a
     mountain. The apron is measured from `hits`, the per-tile record of
     where opaque rock actually landed: the open, dry tiles just south of
     and beside a tile the art really covers, never behind it. That also
     settles the depth for free — nothing in the region plants a foot south
     of its own art — so the stands need no special ordering.
     Art only. No tile becomes T.FOREST, none of this is harvestable and
     none of it blocks; the stands claim no cover, so nothing standing among
     them is hidden, and the map answers exactly as it did. The trees are
     ordinary tree records handed to _stampForest, so they take the same
     species, the same catalog art and the same procedural fallback as every
     other tree in the world. One strip per row keeps the frame paying for a
     handful of blits. */
  mtnEdgeTrees(hits, placed, terrK, banned, strips) {
    if (!(MTN.KIT_EDGE_TREES > 0)) return;
    const TL = CFG.TILE, W = CFG.W, H = CFG.H;
    const KINDS = Sprites.TREE_KINDS;
    const need = TL * TL * MTN.KIT_EDGE_ROCK;
    const rock = new Set();
    for (const [k, n] of hits) if (n >= need) rock.add(k);
    const byRow = new Map(), done = new Set();
    const reach = MTN.KIT_EDGE_REACH | 0;
    /* THE GROUND CONTACT, not the whole silhouette. A peak is two hundred
       pixels of rock filed against the tiles it crosses, most of them high
       on the mountain; an apron measured from those would seed woods in
       mid-air behind the range. What a wood grows at is where the piece
       MEETS THE GROUND — its foot row, across the columns it spans — so
       the sweep starts there and reaches a tile or two out and down. */
    for (const q of placed) {
      const fr = Math.min(H - 1, Math.max(0, ((q.foot - 1) / TL) | 0));
      const c0 = (q.x / TL) | 0, c1 = ((q.x + q.p.piece.w) / TL) | 0;
      for (let tx = c0 - reach; tx <= c1 + reach; tx++)
        for (let ay = fr; ay <= fr + reach; ay++) {
          if (ay >= H - 1 || ay < 1 || tx < 1 || tx >= W - 1) continue;
          const ak = ay * W + tx;
          if (rock.has(ak) || done.has(ak)) continue;
          done.add(ak);
          const t0 = terrK[ak];
          if (t0 === T.FOREST || banned(tx, ay)) continue;                    // open, dry ground the wood can take
          if (this._lh(tx >> 1, ay >> 1, 181) > MTN.KIT_EDGE_TREES) continue; // stands, not an outline
          const seed = ((this.landSeed() ^ Math.imul(tx + 31, 0x9E3779B1) ^ Math.imul(ay + 17, 0x85EBCA6B)) & 0x7fffffff) || 1;
          const rng = ART.rng(seed);
          const dom = KINDS[(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 13) % KINDS.length];
          const n = 2 + ((rng() * MTN.KIT_EDGE_CLUMP) | 0);
          for (let i = 0; i < n; i++) {
            const wx = tx * TL + 4 + ((rng() * (TL - 8)) | 0);
            // high in the tile: the crowns lap over the bottom of the rock
            const wy = ay * TL + 4 + ((rng() * MTN.KIT_EDGE_BAND) | 0);
            const kind = rng() < 0.7 ? dom : KINDS[(rng() * KINDS.length) | 0];
            const ramp = Sprites.treeRamp(kind, rng);
            /* an OPEN stand: full crowns with visible trunks, the tier the
               forest's own sparse fringe stands at. */
            const rr = 7 + ((rng() * 2) | 0);
            let a = byRow.get(ay);
            if (!a) byRow.set(ay, a = []);
            a.push({ wx, wy, rr, pickRr: rr >= 8 ? 8 : rr, kind, ramp });
          }
        }
    }
    const nRock = strips.length;                 // the stands scan the ROCK strips, not each other
    for (const [row, trees] of byRow) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const t of trees) {
        const hw = 20, hh = 34;                              // room for the widest crown either tier draws
        if (t.wx - hw < x0) x0 = t.wx - hw;
        if (t.wx + hw > x1) x1 = t.wx + hw;
        if (t.wy - hh < y0) y0 = t.wy - hh;
        if (t.wy + 2 > y1) y1 = t.wy + 2;
      }
      const w = x1 - x0, h = y1 - y0;
      if (w <= 0 || h <= 0) continue;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.save(); g.translate(-x0, -y0);
      this._stampForest(g, trees);
      g.restore();
      /* THE STAND DRAWS WITH THE ROCK IT HUGS. A piece is filed under the
         row its foot lands in, but its body climbs a couple of hundred
         pixels north of that, so a stand filed under its own row would be
         painted over by any massif whose foot is further south — which,
         beside a mountain, is most of them. A wood at the foot of a
         mountain is in front of it: the stand takes the row of the
         frontmost piece it overlaps, and draws just after it. This is the
         same trade THE WOOD IN FRONT already makes for real forest tiles
         standing against the rock. */
      let row2 = row;
      for (let s = 0; s < nRock; s++) {
        const st = strips[s];
        if (st.row > row2 && st.x < x1 && st.x + st.c.width > x0
          && st.y < y1 && st.y + st.c.height > y0) row2 = st.row;
      }
      strips.push({ row: row2, x: x0, y: y0, c });
    }
  },

  /* ONE PIECE, ONE STRIP. The earlier version composited every piece into a
     region-sized canvas, masked that canvas to the footprint, then cut it
     back apart into row strips — three chances to slice a mountain on a
     straight line, and it took all three. This does none of it: each placed
     piece becomes its own strip, drawn at its own foot row, keeping its own
     silhouette. Overlap is just draw order, which the strip interleave
     already gives us for free. The only pixels ever removed are the honest
     ones: over water or its beach, and off the board. */
  drawMtnChained(r) {
    const TL = CFG.TILE, W = CFG.W, H = CFG.H;
    const plan = this.mtnChainPlan(r);
    if (!plan) return null;
    const terrK = (S.map.seenTerrain || S.map.terrain);
    const banCache = new Map();
    const banned = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      const k = ty * W + tx;
      let v = banCache.get(k);
      if (v !== undefined) return v;
      const t0 = terrK[k];
      v = false;
      if (t0 !== T.MOUNTAIN) {
        if (t0 === T.WATER || t0 === T.MOAT) v = true;
        else {
          const gap = MTN.KIT_SHORE_GAP | 0;
          for (let oy = -gap; oy <= gap && !v; oy++) for (let ox = -gap; ox <= gap; ox++) {
            const nx = tx + ox, ny = ty + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const tt = terrK[ny * W + nx];
            if (tt === T.WATER || tt === T.MOAT) { v = true; break; }
          }
        }
      }
      banCache.set(k, v);
      return v;
    };
    /* BACK TO FRONT: the deepest rank first, and within a rank by foot row.
       The strips carry this order into the frame, so a nearer massif — and
       the low ground in front of it — draws over the one behind. */
    const placed = plan.map(p => ({ p, x: p.tx * TL, y: p.fy * TL - p.piece.h, foot: p.fy * TL }))
      .sort((a, b) => (b.p.up - a.p.up) || (a.foot - b.foot));
    const TEARMAX = Math.max(0, MTN.KIT_TEAR | 0);
    const strips = [], cover = new Set(), hits = new Map();
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const q of placed) {
      const pc = q.p.piece, sp = Assets.mtnPx(pc);
      const sw = pc.w, sh = pc.h + (MTN.KIT_SHADOW | 0);
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const sg = sc.getContext('2d');
      sg.imageSmoothingEnabled = false;
      if (!sp) { sg.drawImage(pc.c, 0, 0); }                   // tainted: draw it whole
      else {
        const im = sg.createImageData(sw, sh), d = im.data;
        /* the tear takes the piece's exposed flanks — and its foot only on
           the frontmost band, since a foot torn under another band opens a
           window onto the grass between them. The top is never torn: that is
           the summit, and a piece that needed one torn was refused at load. */
        const tear = Math.max(2, Math.min(TEARMAX, Math.round(Math.min(pc.w, pc.h) * 0.17)));
        for (let sy = 0; sy < pc.h; sy++) for (let sx = 0; sx < pc.w; sx++) {
          const so = (sy * pc.w + sx) * 4;
          if (sp[so + 3] < 128) continue;
          if (tear > 0) {
            const dd = q.p.front ? Math.min(sx, pc.w - 1 - sx, pc.h - 1 - sy) : Math.min(sx, pc.w - 1 - sx);
            if (dd < tear && this._lh(((q.x + sx) / 5) | 0, ((q.y + sy) / 5) | 0, 61) > (dd + 0.5) / tear) continue;
          }
          if (banned(((q.x + sx) / TL) | 0, ((q.y + sy) / TL) | 0)) continue;
          const oo = (sy * sw + sx) * 4;
          d[oo] = sp[so]; d[oo + 1] = sp[so + 1]; d[oo + 2] = sp[so + 2]; d[oo + 3] = 255;
        }
        // the ground shadow, cast from what actually survived the tear
        const len = MTN.KIT_SHADOW | 0;
        if (len > 0 && q.p.kind !== 'foot') {
          for (let sx = 0; sx < sw; sx++) {
            let low = -1;
            for (let sy = pc.h - 1; sy >= 0; sy--) if (d[(sy * sw + sx) * 4 + 3] >= 128) { low = sy; break; }
            if (low < 0) continue;
            for (let k = 1; k <= len; k++) {
              const yy = low + k;
              if (yy >= sh) break;
              const oo = (yy * sw + sx) * 4;
              if (d[oo + 3] >= 128) break;
              if (banned(((q.x + sx) / TL) | 0, ((q.y + yy) / TL) | 0)) break;
              const t = 1 - k / len;
              d[oo] = 12; d[oo + 1] = 15; d[oo + 2] = 11;
              d[oo + 3] = (MTN.KIT_SHADOW_A * t * t * 255) | 0;
            }
          }
        }
        sg.putImageData(im, 0, 0);
        /* A TILE COUNTS AS COVERED ONLY WHEN THE ROCK ACTUALLY HIDES IT.
           Marking every tile the art so much as grazes meant a unit standing
           where a torn edge or a thin flank barely reached was ghosted to a
           silhouette while still in plain sight — tests/mountain.mjs catches
           exactly that, and it is right to. Half the tile has to be rock. */
        for (let sy = 0; sy < pc.h; sy++) for (let sx = 0; sx < pc.w; sx++)
          if (d[(sy * sw + sx) * 4 + 3] >= 128) {
            const k = (((q.y + sy) / TL) | 0) * W + (((q.x + sx) / TL) | 0);
            hits.set(k, (hits.get(k) || 0) + 1);
          }
      }
      /* TRIM THE STRIP TO ITS ROCK. Each piece is authored as a sticker with
         a wide empty margin on every side — that framing is what stops the
         art being cropped, but blitting the margin every frame is pure waste,
         and with sixteen full-height foothills in the kit it showed up in the
         frame budget. The strip carries only the opaque box, and its origin
         moves to match. */
      let tx0 = sw, ty0 = sh, tx1 = -1, ty1 = -1;
      {
        const td = sg.getImageData(0, 0, sw, sh).data;
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++)
          if (td[(y * sw + x) * 4 + 3]) {
            if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
            if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
          }
      }
      if (tx1 < 0) continue;                       // nothing survived the bans
      let outC = sc, ox = q.x, oy = q.y;
      if (tx0 > 0 || ty0 > 0 || tx1 < sw - 1 || ty1 < sh - 1) {
        const tw = tx1 - tx0 + 1, th = ty1 - ty0 + 1;
        const tc = document.createElement('canvas');
        tc.width = tw; tc.height = th;
        const tg = tc.getContext('2d');
        tg.imageSmoothingEnabled = false;
        tg.drawImage(sc, tx0, ty0, tw, th, 0, 0, tw, th);
        outC = tc; ox = q.x + tx0; oy = q.y + ty0;
      }
      const row = Math.min(H - 1, Math.max(0, ((q.foot - 1) / TL) | 0));
      strips.push({ row, x: ox, y: oy, c: outC });
      if (ox < bx0) bx0 = ox; if (ox + outC.width > bx1) bx1 = ox + outC.width;
      if (oy < by0) by0 = oy; if (oy + outC.height > by1) by1 = oy + outC.height;
    }
    if (!strips.length) return null;
    { const need = TL * TL * MTN.KIT_COVER_MIN; for (const [k, n] of hits) if (n >= need) cover.add(k); }
    const nRockStrips = strips.length;           // the composite below measures ROCK, not the wood
    this.mtnEdgeTrees(hits, placed, terrK, banned, strips);
    strips.sort((a, b) => a.row - b.row);

    /* THE WOOD IN FRONT. Trees standing south of a piece's foot are nearer
       the camera than it is, so they draw over it; trees behind stay hidden.
       Stamped onto the piece's own strip, which is what the frame draws. */
    if (this._stampMode && this._stampMode() && this.forestLayoutAt) {
      for (const st of strips) {
        const trees = [];
        const t0x = Math.max(1, (st.x / TL | 0) - 1), t1x = Math.min(W - 2, ((st.x + st.c.width) / TL | 0) + 1);
        const t0y = Math.max(1, (st.y / TL | 0)), t1y = Math.min(H - 2, ((st.y + st.c.height) / TL | 0) + 1);
        for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
          if (terrK[ty * W + tx] !== T.FOREST || ty < st.row) continue;
          trees.push(...this.forestLayoutAt(tx, ty, terrK));
        }
        if (!trees.length) continue;
        const g2 = st.c.getContext('2d');
        g2.save(); g2.translate(-st.x, -st.y);
        this._stampForest(g2, trees);
        g2.restore();
      }
    }
    // the whole-region composite, which is what the contract tests measure
    const cw = Math.max(1, bx1 - bx0), ch = Math.max(1, by1 - by0);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    /* THE COMPOSITE IS THE ROCK. Nothing draws it — the frame draws the
       strips — but the mountain contract measures it, and what that
       contract is about is where the ROCK may stand. The wood at the foot
       is ordinary vegetation on ordinary ground, so it stays out of it. */
    for (let s = 0; s < nRockStrips; s++) {
      const st = strips[s];
      g.drawImage(st.c, st.x - bx0, st.y - by0);
    }
    return { c, x: bx0, y: by0, cover, kind: 'chain', box: r.box, strips };
  },

  drawMtnRegion(r) {
    const TL = CFG.TILE, W = CFG.W, AP = ART.PALETTE, C = AP.crag, field = this._mtnH;
    const one = this._latOne;
    const [bx0, by0, bx1, by1] = r.box;
    // the box the art may occupy: the footprint, the side slack, and the
    // NORTH headroom the extrusion lifts into
    const px0 = Math.max(0, Math.floor((bx0 - MTN.PAD_SIDE) * TL));
    const py0 = Math.max(0, Math.floor((by0 - MTN.PAD_UP) * TL));
    const px1 = Math.min(CFG.W * TL, Math.ceil((bx1 + 1 + MTN.PAD_SIDE) * TL));
    const py1 = Math.min(CFG.H * TL, Math.ceil((by1 + 1 + MTN.PAD_DOWN) * TL));
    const w = px1 - px0, h = py1 - py0;
    if (w <= 0 || h <= 0) return null;
    // ---- the SOURCE mask: rasterise the fractured polygon once
    const mc = document.createElement('canvas');
    mc.width = w; mc.height = h;
    const mg = mc.getContext('2d');
    mg.imageSmoothingEnabled = false;
    mg.fillStyle = '#fff';
    mg.beginPath();
    for (const loop of r.loops) {
      mg.moveTo(loop[0][0] * TL - px0, loop[0][1] * TL - py0);
      for (let i = 1; i < loop.length; i++) mg.lineTo(loop[i][0] * TL - px0, loop[i][1] * TL - py0);
      mg.closePath();
    }
    mg.fill();
    const mask = mg.getImageData(0, 0, w, h).data;
    /* THE SILHOUETTE IS CLAMPED TO ITS OWN GROUND. Turning a displacement
       inward when it would leave the footprint (fractureLoop's `keep`) is a
       per-vertex rule, and per-vertex rules compound: a corner nudged out,
       then its two midpoints nudged further, then theirs, threw thin glassy
       SPIKES a tile and a half into the grass. The mask is where the bound
       can be made unarguable — a pixel more than OUT_MAX outside the true
       tiles is simply not part of the mountain. (The EXTRUSION then lifts
       this mask north, which is the one direction the art may genuinely
       leave its tiles — the warp moves nothing sideways or south, so the
       clamp holds in those directions by construction.) */
    const outside = this.mtnOutsideFn();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const m = (j * w + i) * 4;
      if (mask[m + 3] < 128) continue;
      if (outside((px0 + i + 0.5) / TL, (py0 + j + 0.5) / TL) > MTN.OUT_MAX) mask[m + 3] = 0;
    }
    /* …and DETACHED CRUMBS ARE SWEPT UP. Trimming a spike can leave a few
       dozen pixels of rock stranded in the grass, which reads as a flying
       shard rather than as a mountain. */
    {
      const lab = new Int32Array(w * h).fill(-1), stack = [];
      let comp = 0;
      const sizes = [];
      for (let start = 0; start < w * h; start++) {
        if (mask[start * 4 + 3] < 128 || lab[start] >= 0) continue;
        let n = 0; stack.push(start); lab[start] = comp;
        while (stack.length) {
          const k = stack.pop(); n++;
          const cx2 = k % w, cy2 = (k / w) | 0;
          if (cx2 > 0 && mask[(k - 1) * 4 + 3] >= 128 && lab[k - 1] < 0) { lab[k - 1] = comp; stack.push(k - 1); }
          if (cx2 < w - 1 && mask[(k + 1) * 4 + 3] >= 128 && lab[k + 1] < 0) { lab[k + 1] = comp; stack.push(k + 1); }
          if (cy2 > 0 && mask[(k - w) * 4 + 3] >= 128 && lab[k - w] < 0) { lab[k - w] = comp; stack.push(k - w); }
          if (cy2 < h - 1 && mask[(k + w) * 4 + 3] >= 128 && lab[k + w] < 0) { lab[k + w] = comp; stack.push(k + w); }
        }
        sizes.push(n); comp++;
      }
      if (comp > 1) for (let k = 0; k < w * h; k++)
        if (lab[k] >= 0 && sizes[lab[k]] < MTN.MIN_PIECE) mask[k * 4 + 3] = 0;
    }
    // ---- the height buffer (SOURCE space — the unlifted plateau)
    const hgt = new Float32Array(w * h);
    const fAt = (x, y) => (x < 0 || y < 0 || x >= CFG.W || y >= CFG.H) ? 0 : field[y * W + x];
    const samp = (wx, wy) => {                       // bilinear over tile centres
      const sx = wx - 0.5, sy = wy - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const t0 = fAt(x0, y0) + (fAt(x0 + 1, y0) - fAt(x0, y0)) * fx;
      const t1 = fAt(x0, y0 + 1) + (fAt(x0 + 1, y0 + 1) - fAt(x0, y0 + 1)) * fx;
      return t0 + (t1 - t0) * fy;
    };
    /* facet size grows with the class: a massif is built of broad slabs, a
       crag of small ones — one cell size across every scale is exactly the
       cobblestone failure coming back through the side door */
    const fcScale = r.cls === 3 ? 1.55 : r.cls === 2 ? 1.2 : 1;
    const F = this.mtnFacetSites(r.seed, px0 / TL - 1, py0 / TL - 1, px1 / TL + 1, py1 / TL + 1, fcScale);
    const cells = F.iw, gs = F.g;
    const lit = new Float32Array(w * h), crease = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (mask[(j * w + i) * 4 + 3] < 128) continue;
      const wx = (px0 + i + 0.5) / TL, wy = (py0 + j + 0.5) / TL;
      // nearest TWO facet sites — F1 gives the face, F2-F1 gives the crease
      const ci = Math.floor(wx / gs) - F.i0, cj = Math.floor(wy / gs) - F.j0;
      let d1 = 1e9, d2 = 1e9, bs = null;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const s2 = F.sites[(cj + oy) * cells + (ci + ox)];
        if (!s2) continue;
        const dx = wx - s2[0], dy = wy - s2[1], dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; bs = s2; } else if (dd < d2) d2 = dd;
      }
      const k = j * w + i;
      /* THE LIGHT COMES FROM THE FACE'S OWN TILT, and only from that. The
         first version lit the gradient of the height BUFFER, so every place
         two faces met threw a bright line — and since the faces tile the
         plane, those lines joined into a continuous web and the mountain read
         as cracked ceramic. A face is a plane: its light is CONSTANT over it,
         and what happens at its edge is a CREASE, which is dark. */
      lit[k] = bs ? -(bs[2] + bs[3]) * 0.5 : 0;
      hgt[k] = samp(wx, wy) + (bs ? bs[4] * MTN.FACET_AMP : 0)
        + (this._latRead(one.rock, wx * MTN.GRAIN_F, wy * MTN.GRAIN_F) - 0.5) * 2 * MTN.GRAIN_AMP;
      if (Math.sqrt(d2) - Math.sqrt(d1) < MTN.CREASE) crease[k] = 1;
    }
    // ---- shade the TOP SURFACE (still in source space; the warp lifts it)
    const src = mg.createImageData(w, h), sd = src.data;
    const rgb = C.map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    const pk = AP.peak.map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    const steps = Math.min(MTN.STEPS, C.length);
    const full = Math.max(1.2, r.maxD * MTN.DEPTH_FULL);
    const snowy = MTN.SNOW && r.maxD >= MTN.SNOW_MIND;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const m = (j * w + i) * 4;
      if (mask[m + 3] < 128) continue;
      const k = j * w + i;
      // the big form still reads through the faces: a broad light across the
      // massif from the height field itself
      const e = MTN.LIGHT_REACH;
      const xl = Math.max(0, i - e), xr = Math.min(w - 1, i + e);
      const yu = Math.max(0, j - e), yd = Math.min(h - 1, j + e);
      const macro = -((hgt[j * w + xr] - hgt[j * w + xl]) + (hgt[yd * w + i] - hgt[yu * w + i]));
      /* the dark rim marks where the plateau ENDS — but never on the south
         edge, which the warp turns into the LIP above the cliff: a dark line
         there sits directly over the face's rim highlight and reads as a
         crack along every clifftop */
      let rim = 0;
      if (mask[(j * w + Math.max(0, i - 1)) * 4 + 3] < 128 || mask[(j * w + Math.min(w - 1, i + 1)) * 4 + 3] < 128
        || mask[(Math.max(0, j - 1) * w + i) * 4 + 3] < 128) rim = 1;
      let v = MTN.BASE + Math.min(1, hgt[k] / full) * MTN.RISE
        + lit[k] * MTN.LIGHT + macro * MTN.MACRO;
      if (crease[k]) v -= MTN.CREASE_DARK;
      if (rim) v -= MTN.RIM;
      let idx = Math.round(v * (steps - 1));
      if (idx < 0) idx = 0; if (idx > steps - 1) idx = steps - 1;
      /* SNOW, high and lit only, behind a constant. Drawn from the same value
         the rock would have taken, so the caps follow the lit crests rather
         than sitting as a painted-on disc. */
      const c = (snowy && v > MTN.SNOW_ABOVE && idx >= 4) ? pk[Math.min(5, idx - 1)] : rgb[idx];
      sd[m] = c[0]; sd[m + 1] = c[1]; sd[m + 2] = c[2]; sd[m + 3] = 255;
    }
    /* ---- THE LIFT — the structural move that fakes height in top-down.
       Every column of the plateau is drawn shifted NORTH by E, and the gap
       between the shifted plateau and the true southern boundary is filled
       with a VERTICAL ROCK FACE. That band IS the height: it is what the eye
       reads as elevation, and its bottom edge sits exactly on the true tile
       boundary, which is what keeps the picture honest about where the
       walkable ground stops.

       E IS NORMALIZED TO THE REGION, NEVER RAW DEPTH (A0.2): a thin ridge
       has almost no interior, and keyed off absolute depth its cliff came
       out three pixels tall — a failed cliff. Each region spends the same
       LIFT_MIN..LIFT_MAX band on its OWN depth range, scaled by class, so a
       depth-2 wall still gets a real face and a massif still towers over it.
       Peaks ride on top as gaussian bumps at the field's local maxima. */
    const E = new Float32Array(w);
    {
      const cw = bx1 - bx0 + 1;
      const colD = new Float32Array(cw);
      for (const k of r.cells) {
        const cx = k % W;
        if (field[k] > colD[cx - bx0]) colD[cx - bx0] = field[k];
      }
      const clsK = r.cls === 1 ? 0.72 : r.cls === 3 ? 1.12 : 1;
      for (let i = 0; i < w; i++) {
        const wx = (px0 + i + 0.5) / TL;
        const cc = Math.min(cw - 1, Math.max(0, wx - bx0 - 0.5));
        const c0 = Math.floor(cc), fx = cc - c0;
        const dcol = colD[c0] + ((colD[Math.min(cw - 1, c0 + 1)] || 0) - colD[c0]) * fx;
        const nd = Math.min(1, dcol / r.maxD);
        let e2 = TL * (MTN.LIFT_MIN + Math.pow(nd, MTN.LIFT_GAMMA) * (MTN.LIFT_MAX - MTN.LIFT_MIN)) * clsK;
        for (const p of (r.peaks || [])) {
          const dx = wx - p.x;
          e2 += TL * p.h * Math.exp(-(dx * dx) / (2 * p.sg * p.sg));
        }
        e2 += (this._latRead(one.rock, wx * 2.9 + 31, r.id * 7.3) - 0.5) * 2 * TL * 0.10;
        E[i] = e2;
      }
      // one box smooth so the top edge undulates instead of stepping
      const sm = new Float32Array(w);
      for (let i = 0; i < w; i++) {
        let s2 = 0, n2 = 0;
        for (let o = -3; o <= 3; o++) { const q = i + o; if (q >= 0 && q < w) { s2 += E[q]; n2++; } }
        sm[i] = Math.max(TL * MTN.LIFT_MIN * 0.7, Math.min(MTN.PAD_UP * TL - 3, s2 / n2));
      }
      E.set(sm);
    }
    // ---- THE WARP: per column, per run — top lifted, face below, shadow last
    const out = mg.createImageData(w, h), od = out.data;
    const owner = new Int16Array(w * h).fill(-1);
    const shC = [12, 15, 11];                        // the cast shadow's dark green-black
    /* RUNS FIRST, THEN THE FOOT LINE. Each column's rock is a list of RUNS
       (top..bottom spans of the mask), and two things have to be cleaned
       before any pixel lands. Small notches between runs are BRIDGED
       (MERGE_GAP): the fractured outline bites concave nicks into the mass,
       and warped naively every nick grew a full-height cliff dropping into a
       three-pixel sliver of grass — stacked teeth all over the interior. And
       the SOUTHMOST FOOT of each column is smoothed across its neighbours:
       the fracture noise that makes a fine silhouette makes a terrible
       ground line, jittering the face bottom per pixel; the foot is a line
       the eye follows, so it wanders gently (clamped to the true mask foot
       +2px, so the honesty bound holds). */
    const runsAt = new Array(w), footRaw = new Float32Array(w).fill(-1);
    for (let i = 0; i < w; i++) {
      const runs = [];
      let j = 0;
      while (j < h) {
        while (j < h && mask[(j * w + i) * 4 + 3] < 128) j++;
        if (j >= h) break;
        const y0r = j;
        while (j < h && mask[(j * w + i) * 4 + 3] >= 128) j++;
        const prev = runs[runs.length - 1];
        if (prev && y0r - prev[1] < MTN.MERGE_GAP) prev[1] = j;
        else runs.push([y0r, j]);
      }
      runsAt[i] = runs;
      if (runs.length) footRaw[i] = runs[runs.length - 1][1];
    }
    const foot = new Float32Array(w);
    for (let i = 0; i < w; i++) {
      if (footRaw[i] < 0) { foot[i] = -1; continue; }
      let s2 = 0, n2 = 0;
      for (let o = -6; o <= 6; o++) { const q = i + o; if (q >= 0 && q < w && footRaw[q] >= 0) { s2 += footRaw[q]; n2++; } }
      foot[i] = Math.min(footRaw[i], Math.max(footRaw[i] - 10, s2 / n2));
    }
    for (let i = 0; i < w; i++) {
      const Ei = Math.max(3, Math.round(E[i]));
      const colSt = (this._lh((px0 + i) >> 1, r.id, 77) - 0.5) * 2;  // striation at 2px pitch — 1px reads as corduroy
      const crack = this._lh((px0 + i) >> 1, r.id * 3 + 1, 91) < 0.045;  // an occasional dark column
      const runs = runsAt[i];
      for (let ri = 0; ri < runs.length; ri++) {
        const y0r = runs[ri][0];
        const y1r = ri === runs.length - 1 ? Math.round(foot[i]) : runs[ri][1];
        const ownerRow = Math.min(CFG.H - 1, Math.max(0, ((py0 + y1r - 1) / TL) | 0));
        // TOP SURFACE — the shaded plateau, lifted. A bridged notch has no
        // source pixel of its own; the nearest shaded rock below stands in.
        for (let q = Math.max(0, y0r - Ei); q < y1r - Ei; q++) {
          let so = ((q + Ei) * w + i) * 4;
          if (!sd[so + 3]) {
            for (let step = 1; step <= MTN.MERGE_GAP && !sd[so + 3]; step++)
              if (q + Ei + step < h) so = ((q + Ei + step) * w + i) * 4;
            if (!sd[so + 3]) continue;
          }
          const oo = (q * w + i) * 4;
          od[oo] = sd[so]; od[oo + 1] = sd[so + 1]; od[oo + 2] = sd[so + 2]; od[oo + 3] = 255;
          owner[q * w + i] = ownerRow;
        }
        // THE FACE — vertical rock from the plateau's lip down to the ground.
        // Value separation does the work: the face lives in the ramp's dark
        // half while the top surface keeps the light one. Structure is
        // VERTICAL (per-column striation, occasional crack columns) because
        // vertical structure reads as a wall and horizontal banding as ground.
        for (let q = Math.max(0, y1r - Ei); q < Math.min(h, y1r); q++) {
          const d0 = q - (y1r - Ei), d1 = y1r - 1 - q;
          const frac = d0 / Ei;
          let fi;
          if (d0 <= 2) fi = colSt > 0.2 ? 7 : 6;                  // rim light along the lip
          else if (d1 <= 1) fi = 0;                               // ambient occlusion at the foot
          else if (d1 <= 3) fi = ((i + q) & 1) ? 0 : 1;           // …dithered up out of it
          else {
            /* a WALL, not a curtain: per-column striation carries the
               vertical structure, a wobble that varies down the face keeps
               the columns from being ruled, and broken STRATA seams — one
               dark pixel row at hashed heights, offset per column so no seam
               runs level — are what make it masonry-of-the-mountain rather
               than hanging cloth */
            const wob = (this._latRead(one.clump, (px0 + i) / TL * 2.2, (py0 + q) / TL * 1.6 + 5) - 0.5) * 1.4;
            const band = ((d0 * 7 + ((colSt * 13) | 0) + (this._lh((px0 + i) >> 4, r.id, 111) * 40) | 0) % 23);
            fi = Math.round(3.4 - frac * 1.6 + colSt * 0.55 + wob);
            if (band === 0) fi -= 1.5;                            // a strata seam
            if (fi < 1) fi = 1; if (fi > 4) fi = 4;
            if (crack) fi = Math.max(0, fi - 1);
            fi = Math.round(fi);
          }
          const oo = (q * w + i) * 4, c = rgb[fi];
          od[oo] = c[0]; od[oo + 1] = c[1]; od[oo + 2] = c[2]; od[oo + 3] = 255;
          owner[q * w + i] = ownerRow;
        }
        // CAST SHADOW on the ground south of the face — translucent, length
        // proportional to the face, edge roughened per column. Later (more
        // southern) runs of rock simply overwrite it.
        /* length from the LOW-FREQUENCY lattice, never a per-column hash —
           independent column lengths comb the shadow's edge into drips */
        const shLen = Math.round(Ei * MTN.SHADOW_K *
          (0.75 + (this._latRead(one.rock, (px0 + i) / TL * 1.3 + 71, r.id * 3.7) - 0.5) * 0.7));
        for (let q = y1r; q < Math.min(h, y1r + shLen); q++) {
          const t2 = (q - y1r) / shLen;
          const a = MTN.SHADOW_A * 255 * Math.pow(1 - t2, 1.5);
          const oo = (q * w + i) * 4;
          if (a > od[oo + 3]) {
            od[oo] = shC[0]; od[oo + 1] = shC[1]; od[oo + 2] = shC[2]; od[oo + 3] = a;
            owner[q * w + i] = ownerRow;
          }
        }
      }
    }
    // the board's own clip, applied to the pixels: the rim is off-map void
    // and nothing may be painted there (the strips draw with no clip path)
    const cover = new Set();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const oo = (j * w + i) * 4;
      if (!od[oo + 3]) continue;
      const xw = px0 + i, yw = py0 + j;
      if (xw < TL || xw >= (CFG.W - 1) * TL || yw < TL || yw >= (CFG.H - 1) * TL) { od[oo + 3] = 0; owner[j * w + i] = -1; continue; }
      if (od[oo + 3] >= 128) cover.add(((yw / TL) | 0) * W + ((xw / TL) | 0));
    }
    // ---- cut the art into ROW STRIPS for the frame's occlusion interleave
    const rowBox = new Map();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ow = owner[j * w + i];
      if (ow < 0 || !od[(j * w + i) * 4 + 3]) continue;
      let bb = rowBox.get(ow);
      if (!bb) rowBox.set(ow, bb = { x0: i, x1: i, y0: j, y1: j });
      if (i < bb.x0) bb.x0 = i; if (i > bb.x1) bb.x1 = i;
      if (j < bb.y0) bb.y0 = j; if (j > bb.y1) bb.y1 = j;
    }
    const strips = [];
    for (const [row, bb] of rowBox) {
      const sw = bb.x1 - bb.x0 + 1, sh = bb.y1 - bb.y0 + 1;
      const sc = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      const sg = sc.getContext('2d');
      const im = sg.createImageData(sw, sh);
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        const kk = (bb.y0 + j) * w + (bb.x0 + i);
        if (owner[kk] !== row) continue;
        const so = kk * 4, oo = (j * sw + i) * 4;
        im.data[oo] = od[so]; im.data[oo + 1] = od[so + 1];
        im.data[oo + 2] = od[so + 2]; im.data[oo + 3] = od[so + 3];
      }
      sg.putImageData(im, 0, 0);
      strips.push({ row, x: px0 + bb.x0, y: py0 + bb.y0, c: sc });
    }
    // …and the whole-region composite, which is what the contract measures
    mg.clearRect(0, 0, w, h);
    mg.putImageData(out, 0, 0);
    return { c: mc, x: px0, y: py0, cover, kind: 'region', box: r.box, strips };
  },

  /* the exact sub-tile distance from a point to the mountain footprint, in
     tiles — 0 inside. Only the near band needs precision, so a cell more than
     one tile out answers "far" without measuring. */
  mtnOutsideFn() {
    const W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const outD = this._mtnOut;
    return (wx, wy) => {
      const tx = Math.floor(wx), ty = Math.floor(wy);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 9;
      if (terr[ty * W + tx] === T.MOUNTAIN) return 0;
      if (!outD || outD[ty * W + tx] > 1) return 9;
      let best = 9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = tx + ox, ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (terr[ny * W + nx] !== T.MOUNTAIN) continue;
        const dx = wx < nx ? nx - wx : (wx > nx + 1 ? wx - (nx + 1) : 0);
        const dy = wy < ny ? ny - wy : (wy > ny + 1 ? wy - (ny + 1) : 0);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) best = d;
      }
      return best;
    };
  },

  drawTile(g, x, y) {
    // THE MAP EDGE — the outermost ring is the hard border no unit may enter and
    // nothing may be built on (Path.passable / Bld.tileFree). Paint it as the same
    // off-map black as the void beyond the map, so it reads as exterior: the player
    // sees the world end at the black edge and raises walls/gates on row 1, the
    // first passable ground, flush against it — none the wiser that a hidden rim
    // lies underneath. Keeps the edge unusable without any movement-rule change.
    if (!MapGen.onBoard(x, y)) {
      g.fillStyle = '#0d0b08';
      g.fillRect(x * CFG.TILE, y * CFG.TILE, CFG.TILE, CFG.TILE);
      return;
    }
    // render from last-seen memory, not live truth — grey fog shows the past
    const terr = S.map.seenTerrain || S.map.terrain;
    const t = terr[MapGen.idx(x, y)];
    const at = (xx, yy) => MapGen.inB(xx, yy) ? terr[MapGen.idx(xx, yy)] : t;
    const TL = CFG.TILE, px = TL / 16, AP = ART.PALETTE;
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    const variants = Sprites.terrain[t];
    let img;
    // a sapper MOAT is just water filling a ditch — it renders exactly like the
    // lake (same blue, same shore treatment) so a dug channel reads as one body
    // of water with no per-tile seams
    const wet = v => v === T.WATER || v === T.MOAT;
    // only NATURAL land makes a shore (shallows + foam). Reclaimed land — where a
    // sapper filled water into ground — must NOT shallow the deep water it abuts:
    // the sea beyond a man-made isthmus reads exactly as it did before it was built.
    if (t === T.GRASS && this.meadowRoll(x, y, h))
      img = Sprites.terrainRare[T.GRASS][h % Sprites.terrainRare[T.GRASS].length];   // rare flower meadow
    else if (wet(t)) {
      // water is painted procedurally in the ground-layer step below (paintWater):
      // calm world-space swells that run across tile borders, so no per-tile pattern
    } else if (t === T.MOUND) {
      const gr = Sprites.terrain[T.GRASS];               // a berm sits on a grass base
      img = gr[(x * 7 + y * 13) % gr.length];
    } else if (t === T.FOREST) {
      // density from how enclosed the tile is: a lone/edge tile is SPARSE, a
      // perimeter tile MEDIUM, a fully-surrounded core tile DENSE — a natural
      // gradient of individual trees, thickening toward the heart of the wood.
      // Deep in the interior a rare character tile (fallen log / stumps / bramble)
      // rolls in for flavour. Mixed hash for both variant and density so there's
      // no diagonal grid.
      // WORLD-STAMP MODE: with a tree catalog installed the wood is stamped
      // in world space (forestStampBand / forestStampsNear) so crowns cross
      // tile edges — this branch then owes only the ground. Rare character
      // tiles keep their whole canvas, and a supplied forest.png override
      // (checked below as ovr) still outranks everything.
      img = this._stampMode() ? this.forestRareAt(x, y, terr) : this.forestSpriteAt(x, y, terr);
    } else if (Sprites.terrainFull[t] && Sprites.terrainMed[t] && t !== T.HILLS) {
      /* ANY terrain that ships all three density sets takes the forest's
         gradient — sparse at the fringe, medium on the perimeter, and the
         packed straddling core only where the tile is ringed by its own kind,
         so a cut crown always abuts more of the same. FERTILE joined on these
         terms; adding another is a matter of supplying the sets. */
      let cnt = 0;
      for (const [ox, oy] of NEIGH8)
        if (MapGen.inB(x + ox, y + oy) && terr[MapGen.idx(x + ox, y + oy)] === t) cnt++;
      const hp = (h ^ (h >>> 13)) >>> 0;
      const set = cnt === 8 ? Sprites.terrainFull[t]
        : this.denseEdge(x, y, cnt) ? Sprites.terrainMed[t] : Sprites.terrain[t];
      img = set[hp % set.length];
    } else if (t === T.HILLS) {
      /* NO TILE SPRITE. The rock field is scattered in world space by
         R.rockMass in its own pass, because three sets picked by neighbour
         count can only ever draw a staircase of squares — see rockMass. What
         this branch still owes the tile is its grass floor and the blocked
         cue, which the GROUND_GRAIN branch below lays down. */
    } else if (t !== T.MOUNTAIN) img = variants[(x * 7 + y * 13) % variants.length];
    // MOUNTAIN is drawn procedurally from a height field in the ground-layer step
    // below — the mountain strips draw the rock itself, in the frame's unit
    // pass, so it can OCCLUDE (see buildMtnLayer); no img is selected here.

    // GROUND LAYER. Grass and every grass-floored resource (forest, fertile,
    // hills, mountain, stumps, pebbles) share ONE continuous painted grass floor
    // — flat green + a world-hash felt grain — so there is no shade mismatch and
    // no seam where a forest/resource block meets open grass. The resource sprites
    // are authored on a TRANSPARENT floor and drawn ON TOP of this ground.
    /* SUPPLIED GROUND ART, if any, stands in for whatever this terrain would
       have drawn — a sprite variant, or one of the three procedural painters
       (grass, water, mountain), which have no sprite to swap and so need
       asking for by name. Everything layered on afterwards — the shore foam,
       the trench clods, the fog — is untouched, so a dropped-in tile still
       gets the world's own edges drawn over it. */
    const ovr = window.Assets ? Assets.terrainImg(t, h >>> 3) : null;
    if (t === T.GRASS && img && this.meadowRoll(x, y, h) && !ovr) {
      g.drawImage(img, x * TL, y * TL);           // rare flower meadow (self-contained)
    } else if (t === T.GRASS) {
      this.paintGround(g, x, y, h);               // plain grass (reads the override itself)
    } else if (t === T.MOUNTAIN) {
      this.paintGround(g, x, y, h);                               // grass floor under the irregular rocky footprint
      if (ovr) this.blitTile(g, ovr, x, y);
      // …and the ROCK is not drawn here at all. A mountain is one object with
      // a traced outline and a height field, drawn as row strips in the
      // frame's unit pass (R.mtnRegions / buildMtnLayer / mtnStrips) — a tile
      // has nowhere to put height, which is the whole reason for the rewrite.
    } else if (wet(t)) {
      /* …and the water itself is NOT painted here. It goes down in one
         clipped pass afterwards (paintWaterIn), because clipping to the
         traced outline per tile means handing the canvas a several-thousand
         point path three hundred times over — measured at 740ms of a 930ms
         bake. One clip for the whole repaint costs nothing. What this branch
         leaves behind is the ordinary ground, so the corner the smoothing cut
         off shows grass rather than a square of raw blue. */
      let edge = false;
      for (const [ox, oy] of NEIGH8) if (!wet(at(x + ox, y + oy))) { edge = true; break; }
      if (edge) this.paintGround(g, x, y, h);
    } else if (GROUND_GRAIN.has(t)) {
      this.paintGround(g, x, y, h);               // continuous floor...
      /* …and the "you cannot walk here" shade — EXCEPT under drawn mountain
         art. That shade is a slab the size of the tile, and wherever the
         kit's art does not happen to cover a mountain tile it showed through
         as a grey RECTANGLE with hard edges: the straight lines that survived
         every attempt to remove them from the art itself. With the kit
         installed the ROCK is the cue, and bare ground under it reads as
         ordinary ground, which the foothills and the wood then cover. */
      if (!(t === T.MOUNTAIN && this.mtnKitOn())) this.blockShade(g, x, y, terr);
      if (ovr) this.blitTile(g, ovr, x, y);       // ...then the transparent-floored resource on top
      else if (img) g.drawImage(img, x * TL, y * TL);   // (hills have no tile sprite — see rockMass)
    } else if (ovr) {
      this.blitTile(g, ovr, x, y);
    } else {
      g.drawImage(img, x * TL, y * TL);           // water / barren / ruin / camp / mound base
    }

    /* THE NATURAL COAST IS NOT DRAWN HERE. It comes from the traced region
       curve (buildShoreLayer) — a per-tile band cannot escape the tile grid,
       which is the whole reason the tracing exists. The rule this branch used
       to carry, that RECLAIMED land raises no shore, went with it: see `nat`
       in buildShoreLayer. */
    /* (an empty `if (t === T.TRENCH) {}` stood here since fa08f38, which made
       the branch below unreachable — a dug ditch has been drawing its bare
       floor with no clods and no earth walls ever since.) */
    if (t === T.TRENCH) {
      // scattered clods of overturned soil, placed from the tile's own map hash so
      // no two ditch tiles share a pattern — a wide floor never shows a grid
      let hh = h;
      for (let k = 0; k < 5; k++) {
        hh = (hh * 1103515245 + 12345) >>> 0;
        g.fillStyle = (hh & 1) ? AP.ink[0] : AP.soil[1];
        g.fillRect(x * TL + (1 + (hh >> 4) % 13) * px, y * TL + (1 + (hh >> 12) % 13) * px, px, px);
      }
      // dry ditch: raise a sloped earth wall only on edges facing solid ground, so
      // a dug line of tiles merges into ONE continuous channel (no per-tile borders
      // between neighbouring ditches). Near walls (N/W) catch light and far walls
      // (S/E) drop into shadow, so the uniform floor reads as a sunken divot.
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tt = at(x + ox, y + oy);
        if (tt === T.TRENCH || tt === T.MOAT) continue;   // same channel — floor runs straight through
        const band = (col, off) => {
          g.fillStyle = col;
          if (ox === 1) g.fillRect(x * TL + TL - (off + 1) * px, y * TL, px, TL);
          else if (ox === -1) g.fillRect(x * TL + off * px, y * TL, px, TL);
          else if (oy === 1) g.fillRect(x * TL, y * TL + TL - (off + 1) * px, TL, px);
          else g.fillRect(x * TL, y * TL + off * px, TL, px);
        };
        const lit = ox === -1 || oy === -1;               // top & left walls face the light
        band(lit ? AP.soil[3] : AP.soil[1], 0);           // ground-level lip at the rim
        band(lit ? AP.soil[2] : AP.ink[0], 1);            // slope wall dropping toward the floor
      }
    } else if (t === T.MOUND) {
      // a raised grassy earthwork — brighter than the surrounding turf, with a lit
      // top-left crown and a shadowed lower-right that sell the elevation; a line of
      // them merges into one continuous embankment (shared edges, no seams)
      const mnd = v => v === T.MOUND;
      const li = mnd(at(x - 1, y)) ? 0 : 2, ri = mnd(at(x + 1, y)) ? 0 : 2;
      const ti = mnd(at(x, y - 1)) ? 0 : 2, bi = mnd(at(x, y + 1)) ? 0 : 2;
      const bx = x * TL, by = y * TL, w = TL - (li + ri) * px, hgt = TL - (ti + bi) * px;
      g.fillStyle = AP.grass[3]; g.fillRect(bx + li * px, by + ti * px, w, hgt);            // raised grassy body
      g.fillStyle = AP.grass[4];                                                            // sunlit crown
      g.fillRect(bx + li * px, by + ti * px, w, 2 * px);
      if (!mnd(at(x - 1, y))) g.fillRect(bx + li * px, by + ti * px, px, hgt);              // lit left face
      let hh = h;   // a scrape of bare earth + a few stones so it reads as heaped-up ground
      for (let k = 0; k < 6; k++) {
        hh = (hh * 1103515245 + 12345) >>> 0;
        const r3 = hh & 3;
        g.fillStyle = r3 === 0 ? AP.soil[2] : r3 === 1 ? AP.stone[2] : AP.grass[2];
        g.fillRect(bx + (3 + (hh >> 4) % 10) * px, by + (5 + (hh >> 12) % 6) * px, px, px);
      }
      if (!mnd(at(x + 1, y))) { g.fillStyle = AP.leaf[1]; g.fillRect(bx + TL - (ri + 2) * px, by + ti * px, 2 * px, hgt); g.fillStyle = AP.ink[0]; g.fillRect(bx + TL - (ri + 1) * px, by + ti * px, px, hgt); }   // shaded right slope + dark edge
      if (!mnd(at(x, y + 1))) { g.fillStyle = AP.leaf[1]; g.fillRect(bx + li * px, by + TL - (bi + 2) * px, w, 2 * px); g.fillStyle = AP.ink[0]; g.fillRect(bx + li * px, by + TL - bi * px, w, px); }            // shaded foot
    }
    /* ELEVATION HINTS ON HILLS. Drawn over whatever the ground layer put
       down — procedural or a supplied override — so a dropped-in hills.png
       is raised ground too. `t === T.HILLS` shades the hill; anything else
       may be catching the shadow of a hill to its north. Both are pure
       overlays: they read the terrain and write only pixels. */
    if (t === T.HILLS) this.hillRelief(g, x, y, terr);
    else if (!wet(t)) this.hillShadow(g, x, y, terr);
    // IRREGULAR FRINGES at every land boundary (replaces the old 1px dithered
    // checker, which only ran between differing floor colours and was invisible)
    this.terrainEdges(g, x, y, terr);
  },

  // live terrain changed (depletion, ruins, terraforming) — only players watching see it
  updateTile(x, y) {
    if (!G.visibleAt(x, y)) return;   // hidden changes stay hidden until revisited
    S.map.seenTerrain[MapGen.idx(x, y)] = S.map.terrain[MapGen.idx(x, y)];
    // drawTileAt repaints the whole 3x3 (ground, then decals) — a tile's edge
    // art comes from its neighbours and the scatter spills over borders, so the
    // ring is never optional. It used to be a hand-rolled 4-neighbour loop here,
    // which is what left the moat "squares" a reload had to clear.
    this.drawTileAt(x, y);
  },
  /* (re)bake the whole terrain layer. Called once per new game, and again
     whenever supplied ground art decodes — the map is a baked cache, so a
     PNG that lands after the world was built would otherwise not show until
     something else happened to dirty its tile. Safe before a map exists:
     there is nothing to draw and nothing to invalidate. */
  /* THE BAKE IS A LIST OF STEPS, AND THE LIST IS THE ONLY COPY OF THE ORDER.
     rebuildTerrain runs every step back to back — the whole-map bake exactly
     as it always was — and tickBake runs the same steps a few at a time under
     a time budget. Because both walk ONE list, a sliced bake and a full bake
     are byte-identical by construction rather than by care; there is no second
     ordering to keep in sync (tests/land.mjs pins it).

     Why slice at all: founding a run is most of a second of solid painting on
     a big map, and it used to land in one lump. Off the Begin press (see
     R.deferBake) that lump moved behind the draft screen, where the player is
     reading cards — and spread over that screen's frames it stops being a
     freeze at all. */
  BAKE_ROWS: 2,                    // tile rows per slice — one band is a few ms
  _bake: null,                     // the live plan: {steps, i}
  _bakeSteps() {
    if (!S || !S.map || !S.map.terrain) return [];
    const steps = [], W = CFG.W, H = CFG.H, R0 = this.BAKE_ROWS;
    let g = null;
    /* THE COSTLY ONE-OFFS GET A STEP EACH. Steps are atomic — the budget can
       only stop BETWEEN them — so anything measured in tens of milliseconds
       is worth standing on its own rather than riding on a band that would
       otherwise be a few ms. Each of these is a cache fill the passes below
       would trigger anyway on first use; doing it here only decides WHEN. */
    steps.push(() => {
      const px = W * CFG.TILE;
      if (!this.terrainCache) this.terrainCache = document.createElement('canvas');
      this.terrainCache.width = px; this.terrainCache.height = px;
      g = this.terrainCache.getContext('2d');
      g.imageSmoothingEnabled = false;
    });
    steps.push(() => this.hillHeight());     // re-key the hill field ONCE for this repaint
    steps.push(() => { this.waterDirty(); this.hillsDirty(); });   // …re-baseline both masks
    steps.push(() => this.waterRegions());   // trace the coast once (cached on _shoreKey)
    steps.push(() => this.waterBodyPath());  // …and the outline the water is painted inside
    steps.push(() => this.waterDepth());     // …and the depth field the body is banded from
    /* TWO PASSES, and they may not be merged: decals overhang their tile, so
       every tile's ground must be down before any decal is laid — otherwise a
       neighbour's ground, painted later, erases the spill. (Which is also why
       each pass is banded SEPARATELY, whole-map, rather than one band doing
       ground-then-decals: banding them together would be the merge.) */
    const band = (fn) => { for (let y0 = 0; y0 < H; y0 += R0) {
      const a = y0, b = Math.min(H, y0 + R0);
      steps.push(() => fn(a, b));
    } };
    band((a, b) => { for (let y = a; y < b; y++) for (let x = 0; x < W; x++) this.drawTile(g, x, y); });
    // the water bands paint through the SAME cached body path, so splitting
    // the one call into rows changes nothing but when it happens
    band((a, b) => this.paintWaterIn(g, 0, a, W - 1, b - 1));
    /* …decals clipped to the board, since one may overhang its own tile and
       the tile beside the rim would throw a tuft out onto the black.
       THE ROCK PASS RUNS WITH THE DECALS, and for the same reason: a stone
       overhangs its own tile, so every tile's ground has to be down before
       any of them is laid. It goes FIRST of the two — a tuft in the grass
       belongs in front of the crag it grows beside, not behind it. */
    const terr = () => S.map.seenTerrain || S.map.terrain;
    // the grass cover goes down FIRST of the three: stones and flowers sit on
    // the meadow, never under it
    band((a, b) => this.clipBoard(g, () => {
      for (let y = a; y < b; y++) for (let x = 0; x < W; x++) this.grassCover(g, x, y, terr());
    }));
    band((a, b) => this.clipBoard(g, () => {
      for (let y = a; y < b; y++) for (let x = 0; x < W; x++) this.rockMass(g, x, y, terr());
    }));
    /* …then the WOOD, stamped in world space where a catalog is installed —
       AFTER the stones on purpose (the referee's live-play note: a hillside
       boulder was sitting on top of a neighbouring stand's overhanging
       crown; the canopy covers ground clutter at its skirt, never the other
       way round) and BEFORE the decals and the hue coat, so the fringe
       ferns still read in front and the tint still lands on the leaves. */
    band((a, b) => this.clipBoard(g, () => this.forestStampBand(g, a, b)));
    band((a, b) => this.clipBoard(g, () => {
      for (let y = a; y < b; y++) for (let x = 0; x < W; x++) this.landDecals(g, x, y, terr());
    }));
    // …then the HUE octave over everything lying on the ground (hueTint):
    // last of the ground passes, so sward, stone and flower take the meadow's
    // colour with it; water and the rim are skipped inside
    band((a, b) => this.clipBoard(g, () => {
      for (let y = a; y < b; y++) for (let x = 0; x < W; x++) this.hueTint(g, x, y, terr());
    }));
    // …then the traced coast over the top, from its own cached layer. One
    // step: the tracer's work belongs to whole regions, not to rows.
    steps.push(() => { this.buildShoreLayer(); g.drawImage(this.shoreLayer, 0, 0); });
    /* …and the mountains NOT AT ALL. Their art lives outside the cache now —
       drawn as row strips interleaved with the units every frame, because an
       extruded mountain must OCCLUDE what stands behind it, and art baked
       under the unit pass never can. The bake only flags them fresh. */
    steps.push(() => { this._mtnDirty = true; });
    /* …and their strips are CUT here rather than in the first frame that
       wants them. buildMtnLayer is lazy by design (a fog reveal or a quarried
       tile re-flags it mid-game), but on a fresh world it is a guaranteed
       ~180ms — measured landing inside the first draw behind the draft, which
       is exactly the frame this whole plan exists to keep free. Doing it here
       only decides WHEN; the laziness elsewhere is untouched. */
    steps.push(() => { this._mtnDirty = false; this.buildMtnLayer(); });
    return steps;
  },
  rebuildTerrain() {
    // NOT `window.S` — S is a script-level var, so window.S is undefined and
    // the guard would be permanently true (the same trap window.G/window.Sprites
    // set, documented in CLAUDE.md). Reference it directly.
    if (!S || !S.map || !S.map.terrain) return;
    this._bake = null; this._bakeDue = false;    // a full bake supersedes any plan
    this._repaintQ = null;                       // …and any queued repaint tail with it
    for (const step of this._bakeSteps()) step();
  },
  /* THE BENCH'S RE-DERIVE (js/dev.js, the ?dev=1 Land bench — LAND_REFRESH.md
     Phase 0). A dial can change things rebuildTerrain alone never re-derives:
     a lattice FREQUENCY (the baked lattices key on seed and size only), the
     shore smoothing (the traced regions key on the wet tiles), the hill
     field, the kept-ground mask, the decal colour memo, the mountain
     classes and painter. Drop every derived key, then bake — the map comes
     back as if this seed had always been dialled this way. Dev-only by use;
     harmless anywhere, and never on the frame loop. */
  rebakeAll() {
    this._lat = null; this._latKey = ''; this._latOne = null;
    this._shoreKey = ''; this._layerKey = ''; this._waterMask = null;
    this._beachStrips = null; this._waveEpoch = -1; this._wavePick = null;
    this._bodyPath = null; this._bodyKey = '';
    this._depthD = null; this._shadowD = null; this._deepEdges = null; this._regionMax = null;
    this._depthKey = ''; this._deepC = null;
    this._hillH = null; this._hillKey = '';
    this._tameKey = ''; this._tameMask = null;
    this._mixC = null;
    this._mtn = null; this._mtnKey = ''; this._mtnH = null;
    this._mtnArt = null; this._mtnLayerKey = ''; this._mtnCover = null;
    this._mtnStrips = null; this._mtnOcc = null; this._mtnDirty = true;
    this.rebuildTerrain();
  },
  // run a due bake a slice at a time. Steps are atomic, so the budget is a
  // floor on the work done, not a ceiling — BAKE_ROWS is what keeps a band small.
  tickBake(budgetMs) {
    if (!this._bake) {
      if (!this._bakeDue) return false;
      this._bakeDue = false;
      this._bake = { steps: this._bakeSteps(), i: 0 };
    }
    const b = this._bake, t0 = performance.now();
    while (b.i < b.steps.length) {
      b.steps[b.i++]();
      if (performance.now() - t0 >= budgetMs) break;
    }
    if (b.i >= b.steps.length) { this._bake = null; return false; }
    return true;
  },

  /* REPAINT A TILE AND ITS RING, GROUND FIRST THEN DECALS. A tile's own look
     is computed from its neighbours (edge fringes, shore, ditch walls, forest
     density) and the decal scatter spills across tile borders, so a change is
     never confined to one tile. Callers ask for the tile that changed; the
     3x3 and the phase order are this function's business, which is why they
     no longer hand-roll neighbour loops of their own. */
  /* MANY TILES AT ONCE, EACH PAINTED ONCE. A fog reveal changes hundreds of
     tiles in a single tick, and calling drawTileAt for each would repaint
     every one of them nine times over for the ground and twenty-five for the
     decals — the neighbourhoods overlap almost completely. Collecting the
     union first turns that back into roughly one paint per tile. (This is not
     a micro-optimisation: done naively it slowed the game enough to fail
     tests/raider-camps.mjs, which runs a long real-time simulation.) */
  /* run a drawing pass with the off-map ring masked off. The rim is the
     world's hard border and the only thing that may be painted there is the
     void's own black — see MapGen.onBoard, the single declaration. */
  /* AN OVERLAPPING LAYER CAN ONLY BE REPAIRED INSIDE THE GROUND THAT WAS
     ERASED. Rocks from neighbouring tiles overlap, and the bake composites
     them in one global row-major order — so redrawing a tile's stone on top
     of a neighbour that was NOT redrawn puts it on the wrong side of that
     neighbour, and the patch comes out different from a rebake (measured at
     8 tiles after a single moat dig, six tiles away from it, where the water
     repaint's own outer ring happened to cross a deposit).

     Clipping the pass to the tiles whose ground was actually repainted makes
     it exact: every rock that covers any of that ground is redrawn, in the
     same order the bake would, and no pixel outside it is touched — the
     spill that was already there stays as the bake left it. */
  clipTiles(g, keys, fn) {
    const TL = CFG.TILE, W = CFG.W;
    g.save();
    g.beginPath();
    for (const k of keys) g.rect((k % W) * TL, ((k / W) | 0) * TL, TL, TL);
    g.clip();
    try { fn(); } finally { g.restore(); }
  },
  clipBoard(g, fn) {
    const TL = CFG.TILE;
    g.save();
    g.beginPath(); g.rect(TL, TL, (CFG.W - 2) * TL, (CFG.H - 2) * TL); g.clip();
    try { fn(); } finally { g.restore(); }
  },
  /* THE SLOW TAIL OF A TERRAIN REPAINT, PAID OVER THE NEXT FEW FRAMES.
     `drawTilesAt` is correct and must stay so — reset once, composite once,
     row-major — but a water edit hands it the whole affected REGION, and on a
     big lake that is thousands of tiles in one synchronous call. Nothing about
     the picture requires it to land in a single frame: the tiles the caller
     actually changed are painted at once (that is what the player is looking
     at), and the rest of the region drains under a budget. Anyone who needs
     the cache exact right now calls flushRepaint; rebuildTerrain supersedes the
     queue outright. Render state only — never in a save (the R.collapses rule). */
  _repaintQ: null,
  pendRepaint(tiles) {
    if (!tiles || !tiles.length) return;
    (this._repaintQ = this._repaintQ || []).push(...tiles);
  },
  /* the ONE place that decides how much of a grown repaint is paid now. Both
     entry points (drawTileAt for a single tile, drawTilesAt for a batch) ask
     it, so they can never drift apart — which they did on the first cut of
     this fix: drawTileAt expanded the region itself and handed the whole
     thing over as an ordinary list, and the split never saw it. */
  splitGrow(grew) {
    if (!grew || !grew.length) return null;
    if (grew.length <= LAND.REPAINT_NOW) return grew;
    const W = CFG.W;
    grew.sort((a, b) => (a[1] * W + a[0]) - (b[1] * W + b[0]));   // row-major: coherent slices
    this.pendRepaint(grew);
    return null;
  },
  _drainRepaint(n) {
    const q = this._repaintQ;
    if (!q || !q.length) return false;
    /* CUT THE SLICE ON A ROW BOUNDARY. The queue is sorted row-major, and the
       full bake paints row by row — so a slice that is a whole number of rows
       composites its overlapping pieces (rocks and decals straddle tiles) in
       exactly the order the bake would. Splitting mid-row does not, and that
       shows up as a few stray pixels against a fresh rebake. */
    let k = Math.min(n, q.length);
    while (k < q.length && q[k][1] === q[k - 1][1]) k++;      // …finish the row
    const chunk = q.splice(0, k);
    if (!q.length) this._repaintQ = null;
    this.drawTilesAt(chunk, true);          // true: this IS the tail, never re-queue
    return !!this._repaintQ;
  },
  tickRepaint(budgetMs) {
    if (!this._repaintQ) return false;
    const t0 = performance.now();
    let more = true;
    while (more && performance.now() - t0 < budgetMs) more = this._drainRepaint(LAND.REPAINT_CHUNK);
    return more;
  },
  flushRepaint() {
    // drained in the SAME slices the live path uses, so what the contract
    // measures is what the player actually gets
    while (this._drainRepaint(LAND.REPAINT_CHUNK)) { /* to the last tile */ }
  },

  drawTilesAt(list, isTail) {
    if (!this.terrainCache || !list || !list.length) return;
    const moved = this.waterDirty();
    const movedH = this.hillsDirty();        // a quarried knot repaints whole
    const grew = (moved || []).concat(movedH || []);
    /* IF THAT GREW INTO A WHOLE REGION, PAINT WHAT THE PLAYER IS LOOKING AT
       AND QUEUE THE REST. The split is by LOCALITY, not by count: every pass
       below is bounded by the BOUNDING BOX of the tiles it is given (the water
       fill and the shore blit both work in that rect), so 260 tiles scattered
       the length of a lake cost as much as the whole lake. The caller's own
       tiles are one small neighbourhood; the region's far cells are sorted
       row-major before queueing, so each drained slice is a contiguous band
       with a small box of its own. */
    if (grew.length) {
      const now = isTail ? grew : this.splitGrow(grew);
      if (now) list = list.concat(now);
    }
    const g = this.terrainCache.getContext('2d');
    const terr = S.map.seenTerrain || S.map.terrain;
    this.hillHeight();                       // re-key the hill field ONCE for this repaint
    /* THE GROUND RESET REACHES ±2, THE DECAL RESTAMP ±3 — and the bound is
       derived, not padding: a decal's LOOK depends on terrain within one tile
       of its anchor (the fern's touches-forest gate is the widest read), and
       its paint reaches under one tile past that anchor, so a changed tile's
       pixels end inside ±2. A ±1 reset left ORPHANS — a fern whose forest
       burned kept its overhang pixels one ring out, where nothing ever erased
       them (found as 8px of stale frond after a fog reveal synced a felled
       stand into memory). Every pass below is clipped to the reset ground, so
       widening the rings keeps the reset-once/composite-once rule exact. */
    const W = CFG.W, ground = new Set(), deco = new Set();
    for (const [x, y] of list) {
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
        const nx = x + ox, ny = y + oy;
        if (!MapGen.inB(nx, ny)) continue;
        deco.add(ny * W + nx);
        if (ox >= -2 && ox <= 2 && oy >= -2 && oy <= 2) ground.add(ny * W + nx);
      }
    }
    /* ROW-MAJOR, LIKE THE FULL BAKE. A Set iterates in insertion order, and
       the insertion order here is "each tile in the caller's list, then its
       ring" — nothing like the y-then-x order rebuildTerrain paints in. That
       does not matter for a layer whose pieces never overlap, and it matters
       a great deal for one whose pieces do: two rocks from neighbouring
       tiles composite in whichever order they are drawn, so an incremental
       repaint of a stone field came out different from a rebake (measured at
       8 tiles after one moat dig). The keys ARE y*W+x, so a numeric sort is
       exactly row-major. */
    const groundL = [...ground].sort((a, b) => a - b), decoL = [...deco].sort((a, b) => a - b);
    // the ground pass is clipped to its own tiles too: a painter that strays a
    // pixel past its box is covered by its neighbour in the bake's full sweep,
    // but an incremental repaint has no later neighbour coming to cover it
    this.clipTiles(g, groundL, () => {
      for (const k of groundL) this.drawTile(g, k % W, (k / W) | 0);
    });
    let gx0 = 1e9, gy0 = 1e9, gx1 = -1e9, gy1 = -1e9;
    for (const k of groundL) {
      const cx = k % W, cy = (k / W) | 0;
      if (cx < gx0) gx0 = cx; if (cx > gx1) gx1 = cx;
      if (cy < gy0) gy0 = cy; if (cy > gy1) gy1 = cy;
    }
    /* EVERYTHING BELOW IS CLIPPED TO THE GROUND THAT WAS ACTUALLY RESET.
       The shore bands are TRANSLUCENT, so "reset, then composite once" is the
       only order that reproduces the bake — compositing them over ground that
       was NOT just erased stacks the ribbons a step darker every repaint (the
       day-108 lakeland report: a hundred days of felling and building along a
       shore hammered the nearby water into opaque platforms with comb-fold
       "planks"; measured at 476 stale tiles after three passes over the shore
       ring). The decal restamp takes the same clip for the same reason: a
       decal is opaque on its OWN pixels, but restamped over un-reset water it
       COVERS the bands that the bake draws on top of it — which is exactly
       why the blit used to be wider, and the wider blit is what stacked the
       ribbons. Rocks learned this first (the moat-dig measurement); now all
       three passes obey it, and the hammer scenario in tests/land.mjs pins
       cache == rebake byte for byte. */
    // …the water restricted by SET, not by a nested clip: see paintWaterIn
    if (gx1 >= gx0) this.paintWaterIn(g, gx0, gy0, gx1, gy1, ground);
    this.clipBoard(g, () => {
      this.clipTiles(g, groundL, () => {
        for (const k of decoL) this.grassCover(g, k % W, (k / W) | 0, terr);
        for (const k of decoL) this.rockMass(g, k % W, (k / W) | 0, terr);
        // the wood re-stamped in the bake's own layer slot — after the
        // stones, before the decals — trees based in the reset or one ring
        // out, y-sorted; the clip keeps it byte-equal to a rebake
        this.forestStampsNear(g, groundL, terr);
        for (const k of decoL) this.landDecals(g, k % W, (k / W) | 0, terr);
        // the hue coat paints inside its own tile only, so the RESET set is
        // exactly the set that takes one coat — never the ring
        for (const k of groundL) this.hueTint(g, k % W, (k / W) | 0, terr);
      });
    });
    if (gx1 >= gx0) this.clipTiles(g, groundL, () =>
      this.blitShore(g, gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1));
    // a fog reveal that uncovered mountain re-derives the strip layer (its
    // regions read seenTerrain); everything else leaves it alone
    for (const [x, y] of list)
      if (terr[y * W + x] === T.MOUNTAIN) { this._mtnDirty = true; break; }
    // …and the formation layer tracks membership the same way, per terrain
    if (window.Formations) for (const [x, y] of list) Formations.noteTile(x, y);
  },

  drawTileAt(x, y) {
    if (!this.terrainCache) return;
    /* if the WATER or a HILLS cluster moved, this is no longer a local
       repaint — hand the whole affected stretch to drawTilesAt, which paints
       each tile once */
    const moved = this.waterDirty(), movedH = this.hillsDirty();
    if (moved || movedH) {
      // the same split the batch path takes: the far cells of a whole region
      // are queued, this tile and any near ones are painted now
      const now = this.splitGrow((moved || []).concat(movedH || [])) || [];
      now.push([x, y]);
      this.drawTilesAt(now, true);     // the change is already consumed above
      return;
    }
    const g = this.terrainCache.getContext('2d');
    const terr = S.map.seenTerrain || S.map.terrain;
    this.hillHeight();                       // re-key the hill field ONCE for this repaint
    // ground reset ±2, decals ±3, everything clipped to the reset — the bound
    // and the reset-once/composite-once rule are derived in drawTilesAt above
    const inner5 = [];
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++)
      if (MapGen.inB(x + ox, y + oy)) inner5.push((y + oy) * CFG.W + (x + ox));
    this.clipTiles(g, inner5, () => {
      for (const k of inner5) this.drawTile(g, k % CFG.W, (k / CFG.W) | 0);
    });
    this.paintWaterIn(g, x - 2, y - 2, x + 2, y + 2);
    /* THE DECAL PASS REACHES ONE RING FURTHER THAN THE GROUND PASS — a decal
       anchored in the ring spills INTO the erased ground and must be
       restamped — but it paints CLIPPED TO THE GROUND THIS CALL ERASED,
       exactly like the rock pass. A decal is opaque on its own pixels, but
       restamped over un-reset water it covers the shore bands the bake draws
       on top of it — and the wide band re-blit that used to compensate is
       what stacked the translucent ribbons a step darker on every repaint
       (the day-108 lakeland report; see drawTilesAt). Reset once, composite
       once: the shore blit covers the same ground and nothing outside it. */
    this.clipBoard(g, () => {
      this.clipTiles(g, inner5, () => {         // …only the ground this call erased
        for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
          const nx = x + ox, ny = y + oy;
          if (MapGen.inB(nx, ny)) this.grassCover(g, nx, ny, terr);
        }
        for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
          const nx = x + ox, ny = y + oy;
          if (MapGen.inB(nx, ny)) this.rockMass(g, nx, ny, terr);
        }
        this.forestStampsNear(g, inner5, terr);   // the bake's layer slot: after stones, before decals
        for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
          const nx = x + ox, ny = y + oy;
          if (MapGen.inB(nx, ny)) this.landDecals(g, nx, ny, terr);
        }
        for (const k of inner5) this.hueTint(g, k % CFG.W, (k / CFG.W) | 0, terr);   // one coat on the reset ground
      });
    });
    this.clipTiles(g, inner5, () => this.blitShore(g, x - 2, y - 2, 5, 5));
    if (terr[y * CFG.W + x] === T.MOUNTAIN) this._mtnDirty = true;
    if (window.Formations) Formations.noteTile(x, y);
  },

  /* put the traced coast back over a patch that was just repainted. The layer
     is re-derived only if the WATER ITSELF changed (waterKey), so an ordinary
     edit — felling a tree, laying a wall — costs one blit and no tracing. */
  blitShore(g, x0, y0, w, h) {
    if (this._layerKey !== this.waterKey() || !this.shoreLayer) this.buildShoreLayer();
    if (!this.shoreLayer) return;
    const TL = CFG.TILE;
    const sx = Math.max(0, x0 * TL), sy = Math.max(0, y0 * TL);
    const sw = Math.min(this.shoreLayer.width - sx, w * TL);
    const sh = Math.min(this.shoreLayer.height - sy, h * TL);
    if (sw <= 0 || sh <= 0) return;
    g.drawImage(this.shoreLayer, sx, sy, sw, sh, sx, sy, sw, sh);
  },

  drawTileOnly(x, y) {
    if (this.terrainCache) this.drawTile(this.terrainCache.getContext('2d'), x, y);
  },

  /* A WORLD BEING ASSEMBLED IS NOT A WORLD BEING LOOKED AT.
     G.newGame / G.loadJSON lay a hall, plant camps and paint camp ground
     BEFORE they call onNewGame — and every one of those goes through
     Bld.place → R.updateTile → drawTileAt, which happily painted those tiles
     into the PREVIOUS run's terrain cache (the title demo's, on a fresh
     start). Wrong map, wrong data, and thrown away seconds later by the full
     bake at the end of onNewGame anyway. Worse than wasted: each of those
     repaints re-traces the coast and re-bakes the shore layer, so the cost is
     nothing like a tile — measured at ~370ms of a ~1.0s newGame on xlarge,
     which is most of the freeze between the Begin press and the draft screen.

     Every incremental painter already early-returns without a cache
     (drawTileAt / drawTilesAt / updateTile all guard on it), so dropping it
     is the whole mechanism: the world assembles in silence and onNewGame's
     rebuildTerrain paints the finished thing, once. */
  /* THE GROUND CAME BACK BLACK (reported with a day-107 screenshot: every
     building and unit drawn, the whole map behind them empty). Nothing in the
     game had cleared it. iOS Safari PURGES CANVAS BACKING STORES under memory
     pressure — most often while the tab is in the background — and the canvas
     object survives with its width, its height and no pixels. Everything this
     game draws per frame (buildings, units, decals) is unaffected; the layers
     that live in a canvas between frames are exactly what vanishes, and on an
     xlarge map those are the two biggest objects it owns (the terrain cache
     and the shore layer, 16.5MB each).

     There is no event for it, so it is DETECTED: a few pixels of the cache are
     sampled about once a second, and a cache that is transparent at every one
     of them has been thrown away (a baked cache is opaque everywhere — even
     the off-map rim is painted black). Cheap enough at that rate, and the read
     is wrapped because a tainted canvas throws rather than answering. The
     revive drops the keys of every layer that went with it, or blitShore would
     happily composite a shore layer whose pixels are gone and the coast would
     be missing instead. */
  CACHE_WATCH_MS: 1000,
  _cacheCheckAt: 0,
  /* 'ok' | 'lost' | 'unknown'. THE THIRD ANSWER IS THE IMPORTANT ONE: drawing
     a PNG into a canvas TAINTS it when the art is not same-origin (every
     file:// page, and any future CDN), and getImageData then THROWS rather
     than answering. Reported as a boolean, that read would come back "not
     lost" forever and the recovery would be dead code exactly where it could
     never be noticed — the swallowed-guard trap this file keeps relearning.
     So "I cannot tell" is its own answer, and the caller decides. */
  cacheState() {
    const c = this.terrainCache;
    if (!c || !c.width || !c.height) return 'ok';            // nothing baked yet is not "lost"
    let g;
    try { g = c.getContext('2d'); } catch (e) { return 'unknown'; }
    const w = c.width, h = c.height;
    const pts = [[w >> 1, h >> 1], [w >> 2, h >> 2], [(w * 3) >> 2, h >> 1], [w >> 1, (h * 3) >> 2]];
    for (const [x, y] of pts) {
      let d;
      try { d = g.getImageData(x, y, 1, 1).data; } catch (e) { return 'unknown'; }
      if (d[3] !== 0) return 'ok';                           // still painted somewhere — fine
    }
    return 'lost';
  },
  reviveTerrain() {
    // every cached layer shares the cache's fate — drop their keys so each one
    // is rebuilt rather than blitted from pixels that are no longer there
    this._layerKey = ''; this._shoreKey = ''; this._depthKey = '';
    this._mtnLayerKey = ''; this._mtnDirty = true;
    this._waterMask = null; this._hillKey = '';
    this._repaintQ = null;
    if (window.Formations) Formations.reviveArt();   // its canvases were purged too
    this.rebuildTerrain();
    this.fogDirty = true;
  },
  /* THE WATCHDOG MUST NOT BECOME THE DISEASE (measured: with the OS taking the
     pixels back every 0.7s, an un-paced revive rebaked 19 times in 20 seconds,
     spent 11.5s of that on baking and dragged a DESKTOP to 20fps — on a phone
     mid-battle that is the reported "seizing and a really low frame rate").
     Losing the ground is not always a one-off: a big fight is exactly when the
     renderer allocates the most new canvases (burn variants, collapse sheets,
     dust), which is exactly when a phone is most likely to take some back. So
     each revive at least doubles the wait before the next, up to REVIVE_MAX_MS.
     A single purge still recovers within the second; a storm of them costs a
     rebake now and then instead of a treadmill, and the game stays playable —
     which is the whole point of recovering at all. Staying healthy for a good
     stretch forgets the backoff, so an ordinary purge tomorrow is answered as
     promptly as the first one was. */
  REVIVE_MIN_MS: 1500,
  REVIVE_MAX_MS: 30000,
  _reviveAt: 0,
  _reviveGap: 0,
  watchCache(now) {
    if (!this.terrainCache) return;
    if (now - this._cacheCheckAt < this.CACHE_WATCH_MS) return;
    this._cacheCheckAt = now;
    if (this.cacheState() !== 'lost') {
      // healthy well past the last backoff — the pressure has passed
      if (this._reviveGap && now - this._reviveAt > this._reviveGap * 2) this._reviveGap = 0;
      return;
    }
    const gap = this._reviveGap || this.REVIVE_MIN_MS;
    if (now - this._reviveAt < gap) return;          // still inside the backoff
    this._reviveAt = now;
    this._reviveGap = Math.min(this.REVIVE_MAX_MS, gap * 2);
    this.reviveTerrain();
  },
  /* COMING BACK TO THE TAB. This is where the pixels are actually found
     missing, and where 'unknown' must be treated as lost: the cost of a
     needless rebake on return is one beat the player spends re-orienting
     anyway, and the cost of guessing wrong the other way is the black map
     they reported. */
  cacheReturned() {
    if (!this.terrainCache) return false;
    if (this.cacheState() === 'ok') return false;
    // a real return to the tab is rare and deliberate, so it is answered at
    // once — and it clears the backoff, because whatever pressure was on the
    // page while it was hidden is a different situation from this one
    this._reviveAt = (typeof performance !== 'undefined' ? performance.now() : 0);
    this._reviveGap = this.REVIVE_MIN_MS;
    this.reviveTerrain();
    return true;
  },

  holdTerrain() { this.terrainCache = null; },
  /* …AND THE BAKE ITSELF NEED NOT BLOCK THE PRESS THAT ASKED FOR THE WORLD.
     The full terrain bake is most of a second on a big map, and founding a
     run used to spend it INSIDE the Begin handler, before the draft screen
     had ever been shown — so the wait was the player's, on a dead screen.
     But the draft is a screen you READ: several seconds of cards, over a
     backdrop, with the map nowhere in sight. That is the honest place for it.

     `deferBake` is opt-in and set by ONE caller (Screens' new-run flow), so
     every other path — loads, tests, the title demo — bakes synchronously in
     onNewGame exactly as before. When it is set the bake is only marked DUE;
     ensureTerrain performs it, and draw() calls ensureTerrain before it
     touches the cache, so a due bake can never reach the screen unbaked
     however the player got there. */
  deferBake: false,
  _bakeDue: false,
  ensureTerrain() {
    while (this.tickBake(1e9)) { /* finish whatever is left, now */ }
  },
  onNewGame() {
    this.mini.width = CFG.W * 2; this.mini.height = CFG.H * 2;   // map size varies per game
    this._vTier = null;                                          // villager tiers recompute from THIS run's Town Centers
    this._sTier = null;                                          // …and sapper tiers from its Sappers' Camps
    this._mtn = null; this._mtnKey = '';                         // re-trace the mountain regions for the new map
    this._mtnH = null;                                           // …and their height field (the same fact)
    this._mtnArt = null; this._mtnLayerKey = ''; this._mtnCover = null;     // …and the art they were drawn into
    this._mtnStrips = null; this._mtnOcc = null; this._mtnDirty = true;
    this._hillH = null; this._hillKey = '';                      // hills move (a quarry works one out), so this is keyed, not one-shot
    this._sideMask = null; this._sideKey = '';
    this._mixC = null;
    this._bodyPath = null; this._bodyKey = '';
    this._waterMask = null;
    if (window.Formations) Formations.onNewGame();               // regions/placements are per-map
    this.placePoofs = [];                                        // no dust carried across runs (the R.collapses rule)
    this.bondSparks = [];                                        // …nor a homestead's gold
    this._repaintQ = null;                                       // …nor a half-drained repaint tail
    // pre-render the full terrain layer once — or mark it due, when the
    // caller has somewhere better to spend the wait (see deferBake)
    this._bakeDue = false;
    if (this.deferBake) { this.terrainCache = null; this._bakeDue = true; }
    else this.rebuildTerrain();
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = CFG.W; this.fogCv.height = CFG.H;
    this.fogG = this.fogCv.getContext('2d');
    this.fogDirty = true;
    this.floats = [];
    this.collapses = [];       // render-side only — never in a save (same rule as _fighting)
    this.treefalls = [];       // …so are the woods going over…
    this.tamings = [];         // …and the swards going down before the builders
    this._tameKey = ''; this._tameMask = null;   // the kept-ground mask is the old run's
    this.horns = [];           // …and the horn's rings…
    this.deaths = [];          // …so are villagers going over…
    this.marvel = null;        // …and so is the wonder's held frame
    this._dbA = {};            // …and each gate's drawbridge swing (reused ids
                               //    must not inherit another run's deck angle)
    this._workFloatAt = {};    // …and the per-worker "+wood" tick throttle
    this.particles = [];
    this.arrowFires = [];      // …and last run's guttering fire-arrow strikes
    this.slashes = [];         // …and its sword nicks
    this.blasts = [];          // …and its bombard craters
    this.blazes = [];          // …and its trebuchet ground fires
    Combat.shots.length = 0; Combat.projectiles.length = 0;
    const tc = Bld.tcOf('P');
    if (tc) this.centerOn(tc.x + 0.5, tc.y + 0.5);
  },

  redrawFog() {
    const g = this.fogG;
    g.clearRect(0, 0, CFG.W, CFG.H);
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      if (!S.map.explored[i]) {
        g.fillStyle = '#0d0b08';               // never seen: black
        g.fillRect(x, y, 1, 1);
      } else if (!(G.vis && G.vis[i])) {
        g.fillStyle = 'rgba(16,16,22,0.45)';   // remembered but out of sight: grey
        g.fillRect(x, y, 1, 1);
      }
    }
    /* Feather the reveal edge. The fog is one pixel per tile, so a straight
       upscale leaves a blocky per-tile staircase where lit meets unexplored —
       it reads as a hard rectangular outline around whatever sits at the vision
       edge (forests, resource nodes). Pre-blur an intermediate at 4px/tile so the
       edge dissolves into a soft gradient. Runs ONLY here (on fogDirty), never
       per frame; the frame loop just blits the result.
       THE BLUR IS DONE BY HAND, NEVER VIA ctx.filter (a reported phone
       screenshot set: hard tile-stepped pale rectangles across every bay —
       the lit water inside the town's own vision against the fog-dimmed
       memory beyond it, upscaled RAW). iOS Safari builds in the field ignore
       canvas filters entirely, and a feather that silently no-ops is a
       feather that ships blocky to exactly the players who can't debug it.
       A separable premultiplied box blur over the 4px/tile intermediate is
       deterministic on every engine; premultiplied, because blurring straight
       RGBA bleeds the black of fully-transparent pixels into the lit edge. */
    /* The blur runs at 1px/TILE — 4k pixels, not the 68k of the upscaled
       intermediate (measured: 8.5ms median there, ~0.3ms here) — and the
       two bilinear upscales (1px→4px baked here, 4px→tile at blit time)
       carry the smoothed field out to screen resolution for free. */
    this._boxBlurPremul(g, CFG.W, CFG.H, 1, 2);
    const scale = 4, bw = CFG.W * scale, bh = CFG.H * scale;
    if (!this.fogBlurCv) this.fogBlurCv = document.createElement('canvas');
    if (this.fogBlurCv.width !== bw) { this.fogBlurCv.width = bw; this.fogBlurCv.height = bh; }
    const bg = this.fogBlurCv.getContext('2d');
    bg.clearRect(0, 0, bw, bh);
    bg.imageSmoothingEnabled = true;
    bg.drawImage(this.fogCv, 0, 0, CFG.W, CFG.H, 0, 0, bw, bh);
    this.fogDirty = false;
  },

  // separable box blur on premultiplied alpha — the engine-proof feather
  // redrawFog leans on. Radius r px; `rounds` repeats both passes inside ONE
  // ImageData round-trip (get/putImageData is the real cost at this size).
  _boxBlurPremul(ctx2, w, h, r, rounds) {
    const img = ctx2.getImageData(0, 0, w, h), d = img.data, n = w * h;
    // premultiply into a working float-free copy (Uint16 to keep precision)
    const pm = new Uint16Array(n * 4);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = d[j + 3];
      pm[j] = d[j] * a; pm[j + 1] = d[j + 1] * a; pm[j + 2] = d[j + 2] * a; pm[j + 3] = a * 255;
    }
    const tmp = new Uint16Array(n * 4);
    const span = r * 2 + 1;
    const pass = (src, dst, stride, lineLen, lines, lineStride) => {
      for (let l = 0; l < lines; l++) {
        const base = l * lineStride;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const kk = Math.min(lineLen - 1, Math.max(0, k));
            sum += src[base + kk * stride + c];
          }
          for (let i2 = 0; i2 < lineLen; i2++) {
            dst[base + i2 * stride + c] = sum / span;
            const drop = Math.max(0, i2 - r), add = Math.min(lineLen - 1, i2 + r + 1);
            sum += src[base + add * stride + c] - src[base + drop * stride + c];
          }
        }
      }
    };
    for (let rd = 0; rd < (rounds || 1); rd++) {
      pass(pm, tmp, 4, w, h, w * 4);        // horizontal
      pass(tmp, pm, w * 4, h, w, 4);        // vertical
    }
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = pm[j + 3] / 255;
      d[j + 3] = Math.round(a);
      const ua = a > 0 ? a : 1;
      d[j] = Math.min(255, Math.round(pm[j] / ua));
      d[j + 1] = Math.min(255, Math.round(pm[j + 1] / ua));
      d[j + 2] = Math.min(255, Math.round(pm[j + 2] / ua));
    }
    ctx2.putImageData(img, 0, 0);
  },

  viewW() { return this.cv.width / this.dpr; },
  viewH() { return this.cv.height / this.dpr; },

  clampCam() {
    const world = CFG.W * CFG.TILE;
    const vw = this.viewW() / this.cam.z, vh = this.viewH() / this.cam.z;
    // lazily learn the open build-menu bar's true height (once), so we can reserve
    // exactly that much at the bottom — measured, so it's right on any device/safe-area
    if (!this.bottomReserve) {
      const bar = document.getElementById('bottombar'), bm = document.getElementById('buildmenu');
      if (bar && bm && bm.style.display !== 'none' && bar.offsetHeight > 40) this.bottomReserve = bar.offsetHeight;
    }
    // whatever the bottom bar is showing RIGHT NOW (collapsed Build button, open
    // menu, or a unit panel) is a live floor — so the last rows never hide behind
    // it even before the build menu has been opened once this session
    const barNowEl = document.getElementById('bottombar');
    const barNow = barNowEl ? barNowEl.offsetHeight : 0;
    // the top status bar overlays the canvas — measure it once so a fully-up pan
    // seats the map's TOP edge right below the bar. Without this, the outermost
    // rows (where units legitimately route around walls) hide behind the bar and
    // characters appear to "walk off the top of the map".
    if (!this.topReserve) {
      const tb = document.getElementById('topbar');
      if (tb && tb.offsetHeight > 20) this.topReserve = tb.offsetHeight;
    }
    // sides pan ~10% past the edge; the TOP reserves the status-bar height and the
    // BOTTOM the full build-menu height, so a fully-panned view seats that map edge
    // right at the UI's inner border — neither bar ever covers the map.
    const padX = vw * 0.10;
    const padTop = Math.max(vh * 0.10, (this.topReserve || 0) / this.cam.z);
    // reserve HALF AGAIN the bottom bar's height, so a comfortable band of open
    // ground always sits below the last row and the menu/panel never crowds the
    // bottom tiles — the map's last few rows were hiding behind the UI.
    const bottomBar = Math.max(this.bottomReserve || 0, barNow) * 1.5;
    const padBottom = Math.max(vh * 0.10, bottomBar / this.cam.z);
    this.cam.x = Math.max(-padX, Math.min(world - vw + padX, this.cam.x));
    this.cam.y = Math.max(-padTop, Math.min(world - vh + padBottom, this.cam.y));
  },

  centerOn(tx, ty) {
    this.cam.x = tx * CFG.TILE - this.viewW() / this.cam.z / 2;
    this.cam.y = ty * CFG.TILE - this.viewH() / this.cam.z / 2;
    this.clampCam();
  },

  /* Is this world point actually on the player's screen right now? Used by the
     army banners, which only haul the camera when NOTHING of the army can be
     seen (tests/army-groups.mjs). The band excludes what the HUD covers — the
     top bar and the open build menu — because a soldier hidden behind the
     interface is not a soldier the player can see. A unit counts as visible
     when its SPRITE BOX overlaps the band, so one standing half off the edge
     still counts: the ask was "slightly in frame". */
  onScreen(wx, wy) {
    const z = this.cam.z, TL = CFG.TILE, half = TL * z * 0.5;
    const sx = (wx * TL - this.cam.x) * z;
    const sy = (wy * TL - this.cam.y) * z - CFG.SPRITE_LIFT * z;
    const top = this.topReserve || 0, bot = this.bottomReserve || 0;
    return sx + half > 0 && sx - half < this.viewW() &&
           sy + half > top && sy - half < this.viewH() - bot;
  },

  screenToWorld(sx, sy) {
    return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y };
  },
  screenToTile(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / CFG.TILE), y: Math.floor(w.y / CFG.TILE) };
  },

  float(x, y, txt, col) {
    if (this.floats.length > 40) this.floats.shift();
    this.floats.push({ x, y, txt, col, t: 1.0 });
  },

  /* ---- THE WORK TICK (tests/mortality.mjs … see workLine's neighbours) ----
     The white "+wood" over a worker's head is a GLANCE cue — an occasional
     tick so you can tell at sight what somebody is doing, without selecting
     them. It is NOT a running readout, and it used to behave like one: every
     gather step and every production step rolled for a float, so a working
     village wrote text over itself continuously (and the faster the game ran,
     the worse it got).

     It is now throttled per UNIT to roughly one float every WORK_FLOAT_S
     seconds. Measured, the old rules fired about once every 4 seconds per
     worker (a gather step's 0.3 roll on each integer tick; a station's
     dt*0.7), so 20s is about a FIFTH of what it was — which is the point:
     a tick, occasionally, not a readout. A village of ten still writes
     something every couple of seconds somewhere, which is what makes it
     readable at a glance; no single villager ever chatters.

     REAL time, not game days, for the same reason the heal limit is
     (UI.healThrottled): this is a rule about what the eye can take, not
     about the calendar — and it must not get worse as the game speeds up.
     The jitter is derived from the unit's id so a row of woodcutters never
     pulses in lockstep, and the log is render-side only — never on the unit,
     never in a save (same rule as R._dbA), cleared in onNewGame so reused
     ids can't inherit another run's timer. */
  WORK_FLOAT_S: 20,
  _workFloatAt: {},
  workFloat(u, txt) {
    const now = performance.now() / 1000;
    const last = this._workFloatAt[u.id];
    const gap = this.WORK_FLOAT_S * (0.75 + ((u.id * 37) % 50) / 100);
    // NO ENTRY means "due now", not "last ticked at time zero": the clock is
    // time-since-page-load, so treating a missing entry as 0 silently ate the
    // first tick of every worker for the first WORK_FLOAT_S seconds of a
    // session — the one tick that most wants to be seen, right after you give
    // somebody a job.
    if (last != null && now - last < gap) return false;
    this._workFloatAt[u.id] = now;
    this.float(u.x, u.y - 0.5, txt, '#d8e8b0');
    return true;
  },

  /* ---- FIRE-ARROW GROUND STRIKES (the operator's showpiece) ----
     Where a flaming arrow's flight ends — a struck man's feet, a wall's
     base, a fumbled shot's dirt — the ground catches for a heartbeat:
     an instant ember-and-smoke burst (the shared impact pool) plus a
     LINGERING guttering flame drawn from the same 4-frame flameSmall
     sprites the burning houses wear, over a small scorch that fades as
     the flame dies. A micro-pool of plain literals, hard-capped: a
     volley that lands twelve fire arrows in one second simply stops
     adding tongues — nobody counts flames in a firestorm. */
  arrowFires: [],
  ARROWFIRE_LIFE: 1.25,
  arrowStrike(x, y) {
    this.impact(x, y, 'flame');
    if (this.arrowFires.length < 12) this.arrowFires.push({ x, y, t: 0 });
  },
  /* ---- SWORD SLASHES (the operator's "tiny amount of realism") ----
     A short crimson nick at the sword's reach when a blade lands — one
     bowed stroke in the berry ramp plus two flicked droplets, 0.18s and
     gone. Small by design: the brief was noticeable, never grotesque.
     Fired from the melee strike tick for sword-armed kinds only; zero
     G.rand draws (Math.random, the impact-burst precedent), render-side
     state only, so every seeded combat stream stays byte-identical. */
  slashes: [],
  SLASH_LIFE: 0.18,
  _slashFlip: 1,
  meleeSlash(ax, ay, tx, ty) {
    const dx = tx - ax, dy = ty - ay, dl = Math.hypot(dx, dy) || 1;
    const reach = Math.max(0.2, Math.min(dl * 0.72, dl - 0.12));
    const x = ax + dx / dl * reach, y = ay + dy / dl * reach - 0.35;
    this._slashFlip = -this._slashFlip;
    const ang = Math.atan2(dy, dx) + this._slashFlip * Math.PI / 3;
    if (this.slashes.length >= 10) this.slashes.shift();
    this.slashes.push({ x, y, ang, t: 0 });
    const AP = ART.PALETTE;
    for (let i = 0; i < 2; i++) {
      if (this.particles.length >= 220) break;
      this.particles.push({ x, y, vx: dx / dl * 1.4 + (Math.random() - 0.5) * 1.6,
        vy: -0.8 - Math.random() * 1.2, t: 1, life: 0.3 + Math.random() * 0.15,
        col: i ? AP.berry[0] : AP.berry[1], sz: 1.4, g: 9 });
    }
  },
  // impact burst at (x,y): 'stone'/'bolt' throw pale dust + dark debris that
  // fall and fade; 'flame' throws rising fire embers + a puff of grey smoke.
  // Particles are spawned once per hit (not per frame) and capped, so no
  // allocation storms — the draw loop only mutates them in place.
  /* ---- BOMBARD BLASTS (the operator's "big poof") ----
     Where a Bombard Ship's stone lands — ground, wall or deck — the world
     answers: a tripled dust-and-debris burst with rising smoke through the
     shared particle pool, plus an expanding shockwave ring and a lingering
     scorch from a micro-pool of its own (so one big landing never evicts
     everyone else's particles). A stone landing on WATER swaps dust for
     white spray and a ripple — stone dust never puffs on open sea. */
  blasts: [],
  BLAST_LIFE: 1.8,
  /* ---- TREBUCHET BLAZES ---- where the flaming ball lands, the ground
     BURNS: three flame tongues over a wide scorch, alive for seconds —
     the fire-arrow strike's big sibling, in its own capped micro-pool. */
  blazes: [],
  BLAZE_LIFE: 3.6,
  impact(x, y, kind, fx) {
    const P = this.particles, AP = ART.PALETTE, add = (o) => { if (P.length < 220) P.push(o); };
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (fx === 'blast') {
      const wet = (() => {
        const t = S.map.terrain[MapGen.idx(x | 0, y | 0)];
        return t === T.WATER || t === T.MOAT;
      })();
      for (let i = 0; i < 26; i++) {                     // the ring of thrown dust / spray
        const a = rnd(-Math.PI, Math.PI), s = rnd(1.6, 4.6);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.55 - rnd(0.4, 1.6), t: 1,
              life: rnd(0.35, 0.7), col: wet ? (i & 1 ? '#dceef4' : '#b8dce8') : (i & 1 ? AP.stone[3] : AP.bone[1]),
              sz: rnd(1.8, 3.4), g: wet ? 6 : 4 });
      }
      for (let i = 0; i < 12; i++) {                     // dark chunks, thrown hard
        const a = rnd(-Math.PI, 0), s = rnd(2.5, 5.5);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.4, t: 1, life: rnd(0.4, 0.8),
              col: wet ? '#8fc3d6' : AP.stone[1], sz: rnd(1.8, 3), g: 8 });
      }
      for (let i = 0; i < 7; i++)                        // the poof: smoke, rising and fat
        add({ x, y: y - 0.2, vx: rnd(-0.9, 0.9), vy: rnd(-1.8, -0.6), t: 1, life: rnd(0.8, 1.3),
              col: wet ? '#cfe6ee' : (i & 1 ? '#6a6258' : '#8a8276'), sz: rnd(3.5, 6), g: -0.4, smoke: 1 });
      if (this.blasts.length >= 8) this.blasts.shift();
      this.blasts.push({ x, y, t: 0, wet });
      return;
    }
    if (fx === 'firestorm') {
      // the trebuchet's ball lands: a fire-arrow strike scaled to siege — a
      // wide ember splash, heavy smoke, and a BLAZE that burns on the ground
      // long after (R.blazes below). The plain flame branch is untouched.
      for (let i = 0; i < 22; i++) {
        const a = rnd(-Math.PI, Math.PI), s = rnd(1.4, 4.2);
        add({ x, y, vx: Math.cos(a) * s * 0.7, vy: Math.sin(a) * s * 0.5 - rnd(0.6, 1.8), t: 1,
              life: rnd(0.5, 1.0), col: AP.fire[(Math.random() * 3 + 1) | 0], sz: rnd(1.8, 3.6), g: -1.2 });
      }
      for (let i = 0; i < 8; i++)
        add({ x, y: y - 0.2, vx: rnd(-0.9, 0.9), vy: rnd(-1.9, -0.8), t: 1, life: rnd(0.9, 1.5),
              col: i & 1 ? '#5a5248' : '#7a7268', sz: rnd(3.5, 6), g: -0.5, smoke: 1 });
      if (this.blazes.length >= 6) this.blazes.shift();
      this.blazes.push({ x, y, t: 0 });
      return;
    }
    if (kind === 'flame') {
      for (let i = 0; i < 12; i++) {                       // fire embers, rising
        const a = rnd(-Math.PI, 0), s = rnd(1.2, 3.4);
        add({ x, y, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s - 1.2, t: 1, life: rnd(0.4, 0.8),
              col: AP.fire[(Math.random() * 3 + 1) | 0], sz: rnd(1.5, 3), g: -1.6 });
      }
      for (let i = 0; i < 5; i++)                           // smoke puff, drifts up
        add({ x, y: y - 0.2, vx: rnd(-0.6, 0.6), vy: rnd(-1.6, -0.7), t: 1, life: rnd(0.7, 1.1),
              col: i & 1 ? '#5a5248' : '#7a7268', sz: rnd(2.5, 4.5), g: -0.5, smoke: 1 });
    } else {
      const dust = kind === 'bolt' ? 6 : 10, deb = kind === 'bolt' ? 3 : 6;
      for (let i = 0; i < dust; i++) {                      // pale dust cloud
        const a = rnd(-Math.PI, 0), s = rnd(1, 3);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - 0.6, t: 1, life: rnd(0.3, 0.6),
              col: i & 1 ? AP.stone[3] : AP.bone[1], sz: rnd(1.5, 3), g: 4 });
      }
      for (let i = 0; i < deb; i++) {                       // dark chunks, thrown + falling
        const a = rnd(-Math.PI, 0), s = rnd(2, 4.5);
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, t: 1, life: rnd(0.35, 0.7),
              col: kind === 'bolt' ? AP.wood[1] : AP.stone[1], sz: rnd(1.5, 2.5), g: 7 });
      }
    }
  },

  explored(x, y) { return S.map.explored[MapGen.idx(x, y)]; },

  /* ---- THE WOOD REACTS (tests/wild-life.mjs) ----
     Ambience that only ever ignores the world is wallpaper; ambience that
     REACTS is a living system. A fight breaking out, or a building coming
     down, throws every flock within earshot up and away and sends the
     critters bolting for cover. Cheap by construction: the ambient pool is
     capped at a handful of entities, so this is a short loop over ≤7 items,
     and it only ever retargets things that are already on screen. */
  /* who was fighting last frame — render-side only, so it never reaches a save
     file. A unit that gains a target it did not have is a fight STARTING, and
     that is the moment the birds go up. */
  _fighting: null,
  noteFights() {
    const now = new Set();
    for (const u of S.units) if (u.tUnit || u.tBld) now.add(u.id);
    if (this._fighting) {
      for (const id of now) {
        if (this._fighting.has(id)) continue;
        const u = Units.get(id);
        if (u) { this.startle(u.x, u.y, 8); break; }   // one scatter per outbreak is plenty
      }
    }
    this._fighting = now;
  },
  startle(x, y, r) {
    if (!this.ambient || !this.ambient.length) return;
    r = r || 9;
    for (const a of this.ambient) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d > r) continue;
      const dx = (a.x - x) || (Math.random() - 0.5), dy = (a.y - y) || (Math.random() - 0.5);
      const dd = Math.hypot(dx, dy) || 1;
      if (a.kind === 'flock') {
        a.vx = dx / dd * 3.4; a.vy = dy / dd * 1.9 - 1.5;   // climb, and get out
        a.dir = a.vx < 0 ? -1 : 1;
        a.ttl = Math.min(a.ttl, a.t + 2.2);
      } else if (a.kind === 'critter') {
        a.state = 'flee';                                    // straight back into cover
        a.ttl = Math.min(a.ttl, a.t + 1.6);
      } else {
        a.vx = dx / dd * 1.1; a.vy = dy / dd * 0.9;          // butterflies just scatter
        a.ttl = Math.min(a.ttl, a.t + 2.5);
      }
    }
  },

  // fortification auto-tiling: connect to any adjacent wall/gate — and brace
  // flush against water, mountains, and the map edge, so a wall anchored on an
  // obstacle reads as a stout, sealed junction instead of an open end-cap
  wallMaskAt(x, y, extra) {
    const conn = (xx, yy) => {
      if (!MapGen.inB(xx, yy)) return true;                 // map edge
      if (Bld.fortAt(xx, yy)) return true;                  // wall / gate ONLY (a house is not a curtain)
      // a finished TOWER standing IN the line bonds to it (see towerLinkMask)
      const tb = Bld.at(xx, yy);
      if (tb && tb.key === 'tower' && !(tb.construction > 0)) {
        const back = xx === x ? (yy < y ? 4 : 1) : (xx < x ? 2 : 8);   // dir from that tower back to us
        if (this.towerLinkMask(xx, yy).mask & back) return true;
      }
      const t = S.map.terrain[MapGen.idx(xx, yy)];
      if (t === T.WATER || t === T.MOUNTAIN) return true;   // natural barrier
      return !!(extra && extra.has(xx + ',' + yy));
    };
    return (conn(x, y - 1) ? 1 : 0) | (conn(x + 1, y) ? 2 : 0) |
           (conn(x, y + 1) ? 4 : 0) | (conn(x - 1, y) ? 8 : 0);
  },

  /* ---- WALL ↔ TOWER BOND (tests/wall-tower-bond.mjs) ----
     A tower raised IN a wall line should read as part of the curtain, the
     way a real castle's mural towers do — no gap, corners and T-junctions
     included. A tower merely standing BEHIND or IN FRONT of a line must not
     grow a stub toward it, so the rule is that the wall run has to pass
     THROUGH the tower along that axis:

       link toward a neighbouring wall/gate if the run continues on the
       tower's far side (a wall two out along the same axis), or the tower
       has a wall on the opposite side (it sits mid-line), or that
       neighbour is a lone stub with no run of its own yet (the first
       section a player lays out from a tower), or — THE ELBOW (a reported
       screenshot: a run turning its corner one tile short of the tower) —
       that neighbour is the END of a run coming in PERPENDICULAR to the
       tower: exactly one wall continuing sideways out of it and none
       straight past, so the line genuinely terminates on the tower and the
       tower is its corner post. A tower merely behind a mid-run stays
       unbonded — its neighbour has walls on BOTH sides, never one.

     Reads walls and gates only — never other towers — so it can never
     recurse. PURELY COSMETIC: Bld.blockAt and Path.passable are untouched,
     so a tower in the line stays a walkable door exactly as before (that is
     the wall-line contract, tests/wall-line.mjs). */
  _wgAt(x, y) {
    if (!MapGen.inB(x, y)) return null;
    const b = Bld.at(x, y);
    return b && (b.key === 'wall' || b.key === 'gate') ? b : null;
  },
  towerLinkMask(x, y) {
    let mask = 0, level = 0;
    for (const [dx, dy, bit] of [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]) {
      const nb = this._wgAt(x + dx, y + dy);
      if (!nb || nb.construction > 0) continue;
      let lone = true, perp = 0;                           // a stub? or a run turning here?
      for (const [ex, ey] of [[0, -1], [1, 0], [0, 1], [-1, 0]])
        if (this._wgAt(nb.x + ex, nb.y + ey)) {
          lone = false;
          if (ex * dx + ey * dy === 0) perp++;             // sideways out of the neighbour
        }
      const past = this._wgAt(x + dx * 2, y + dy * 2);     // straight on through it
      if (past || this._wgAt(x - dx, y - dy) || lone || perp === 1) {
        mask |= bit;
        if (!level) level = nb.level;                      // wear the curtain's own tier
      }
    }
    return { mask, level: level || 1 };
  },
  // the curtain's stonework reaching in to meet the tower, drawn UNDER it so
  // the tower's own body always sits on top of the joint
  drawTowerBond(g, b, bx, by, bw) {
    if (b.construction > 0) return;
    const lk = this.towerLinkMask(b.x, b.y);
    if (!lk.mask) return;
    const fam = Sprites.wallMask[Math.min(lk.level, Sprites.wallMask.length) - 1];
    g.drawImage(fam[lk.mask], bx, by, bw, bw);
    /* THE SEAM. A tower is drawn as an elevation — you see its face — while the
       curtain running north of it is drawn flat, from above. Butted together
       with nothing between, the wall reads as running ONTO the tower's roof
       ("the top tower is sitting on top of the wall"). A shadow line where the
       walk meets the tower's back reads instead as the wall passing BEHIND it,
       which is what is actually happening. Only the north link needs it: a wall
       to the south is nearer than the tower and is drawn over it anyway (the
       building list is sorted by footprint bottom edge). */
    if (lk.mask & 1) {
      g.fillStyle = 'rgba(24,18,12,0.55)';
      g.fillRect(bx + bw * 10 / 32, by, bw * 12 / 32, Math.max(1, bw * 2 / 32));
    }
  },
  /* Which way does this gate face? It faces the way its LINE runs — and the
     line is made of more than walls. A gate flanked by two towers (the classic
     gatehouse the player builds) read as neither axis under the old wall-only
     test, so it drew its east-west self inside a north-south curtain: the
     "tore down a wall, built a second gate, it never went back" bug. Towers
     that have bonded into the line now count, and the axes are SCORED rather
     than compared as booleans, so one wall to the east no longer cancels two
     towers north and south. Terrain deliberately does NOT count: a wall
     running east-west to a lake shore has water north and south of its gate,
     and counting it would spin the gate exactly the wrong way. */
  /* A curtain running SOUTH out of a mural tower must meet its flank at WALK
     HEIGHT, partway up the shaft — not at the tower's foot, where it reads as
     bolted onto the bottom of the tower. The tower's body is drawn OVER the
     bond stub, so the southern arm is drawn again on top of it, clipped to the
     curtain's own width and to everything below TOWER_WALK. The north arm
     needs the opposite treatment (it passes behind — see the seam in
     drawTowerBond), and the east/west arms already emerge at the right height
     because the wall band crosses the tower's middle. */
  TOWER_WALK: 17 / 32,
  drawTowerWalk(g, b, bx, by, bw) {
    if (b.construction > 0) return;
    const lk = this.towerLinkMask(b.x, b.y);
    if (!(lk.mask & 4)) return;                          // nothing coming from the south
    const fam = Sprites.wallMask[Math.min(lk.level, Sprites.wallMask.length) - 1];
    const y0 = by + bw * this.TOWER_WALK;
    g.save();
    g.beginPath();
    g.rect(bx + bw * 10 / 32, y0, bw * 12 / 32, by + bw - y0);   // the curtain's own width only
    g.clip();
    g.drawImage(fam[lk.mask], bx, by, bw, bw);
    g.restore();
  },
  /* ---- THE DRAWBRIDGE (tests/drawbridge.mjs) ----
     The deck is drawn OVER the finished gate sprite, from its own little
     atlas of stills (Sprites.drawbridge), because it moves and a baked sprite
     cannot. `_dbA` eases each gate's deck from lying flat (0) to standing
     against the arch (1) so the order plays as a swing rather than a snap —
     and it is RENDER STATE, kept off the building and out of every save, the
     same rule R._fighting and R.collapses follow. The rule the game actually
     obeys is Bld.rebuildBlock's: the tile seals the instant the order is
     given; the swing is what the player SEES happen. A gate first met already
     shut (a loaded save) starts settled rather than slamming on sight. */
  DB_SPEED: 1.7,          // a full swing in a little over half a second
  _dbA: {},
  /* A DRAWBRIDGE FALLS OUTWARD (tests/drawbridge.mjs). Which way that is comes
     from Bld.gateOutside, which reads the ground rather than the wall line —
     a stronghold is half masonry and half lake and mountain, so the wall alone
     never tells you which side is the courtyard.

     Three strips, and the deck's own geometry decides where each is drawn:
       flank, east   the authored side view
       flank, west   the same view MIRRORED about the tile's centre line — a
                     picture-plane rotation, so a mirror is exactly right
       face, south   the authored toward-the-camera view, drawn OVER the gate
       face, north   deckFaceAway, drawn UNDER it, so the curtain and the
                     gatehouse occlude its near end the way they really would
     `front` says which pass this is: the caller draws once before the gate
     sprite and once after, and each strip answers on the pass it belongs to. */
  drawDrawbridge(g, b, bx, by, bw, dt, front) {
    if (!Sprites.drawbridge || !Bld.canDrawbridge(b)) return;
    const vert = this.gateVerticalAt(b.x, b.y);
    const dir = Bld.gateOutside(b);          // +1 south / east, -1 north / west
    const away = !vert && dir < 0;           // the only case drawn behind the gate
    if (away === !!front) return;
    // the swing is eased here, on the pass that actually draws — never twice
    const tgt = b.raised ? 1 : 0;
    let a = this._dbA[b.id];
    if (a == null) a = tgt;
    else if (a !== tgt) {
      const step = Math.max(0, Math.min(0.2, dt || 0)) * this.DB_SPEED;
      a = tgt > a ? Math.min(tgt, a + step) : Math.max(tgt, a - step);
    }
    this._dbA[b.id] = a;
    const fam = Sprites.drawbridge[away ? 2 : vert ? 1 : 0];
    const fr = Math.max(0, Math.min(fam.length - 1, Math.round(a * (fam.length - 1))));
    // TWO tiles in the direction the deck falls — it spans a whole one
    if (away) {
      // the gate's tile is the BOTTOM half of that canvas; the tile above it is
      // the ground beyond the wall
      g.drawImage(fam[fr], bx, by - bw, bw, bw * 2);
    } else if (vert) {
      if (dir < 0) {                          // …falling WEST: mirror about the tile
        g.save();
        g.translate(bx + bw / 2, 0); g.scale(-1, 1); g.translate(-(bx + bw / 2), 0);
        g.drawImage(fam[fr], bx, by, bw * 2, bw);
        g.restore();
      } else g.drawImage(fam[fr], bx, by, bw * 2, bw);
    } else {
      g.drawImage(fam[fr], bx, by, bw, bw * 2);
    }
  },
  /* ---- THE EARLY GATES WORK TOO (tests/drawbridge.mjs) ----
     The drawbridge's little ceremony turned out to be the good part, so the
     first two tiers got mechanisms of their own: L1 swings its two door
     leaves outward, L2 winches a wood-and-iron portcullis straight up (just
     far enough that you can SEE it is up). Drawn here rather than baked,
     because they move — chunky fine-grid rects painted straight onto the
     world canvas, sharing the drawbridge's eased `_dbA` (1 = sealed) and its
     two passes: leaves that swing AWAYS from the camera go down on the back
     pass so the gate's own art occludes their near ends.

     The CLOSED L1 face draws nothing — the baked sprite's braced door IS the
     closed state, and the swing takes over the moment the door starts to
     move. The L2 face is ALWAYS overdrawn while the gate stands finished:
     its closure is the portcullis itself, so the grate replaces the baked
     plank door in the world (fog-memory ghosts keep the sprite, which is
     all a memory ever holds). Outward comes from Bld.gateOutside — away
     from the hall, or from the war camp that stands nearer. */
  drawGateWorks(g, b, bx, by, bw, dt, front) {
    // PLAYER gates only: the rival never works a lever, and its always-open
    // state drawn literally would show the player a passage they cannot use —
    // the rival's gate keeps the baked closed-door art it has always worn
    if (!Bld.canGateToggle(b) || b.level >= 3 || b.owner !== 'P') return;
    const vert = this.gateVerticalAt(b.x, b.y);
    const dir = Bld.gateOutside(b);
    // ease on the BACK pass (always runs first); the front pass reads it
    const tgt = b.raised ? 1 : 0;
    let a = this._dbA[b.id];
    if (a == null) a = tgt;
    else if (!front && a !== tgt) {
      const step = Math.max(0, Math.min(0.2, dt || 0)) * this.DB_SPEED;
      a = tgt > a ? Math.min(tgt, a + step) : Math.max(tgt, a - step);
    }
    if (!front) this._dbA[b.id] = a;
    const o = 1 - a;                                     // openness
    const AP = ART.PALETTE, WD = AP.wood, IN = AP.ink[0], SO = AP.soil;
    const px = bw / 32;
    const cell = (cx, cy, w, h, col) => { g.fillStyle = col; g.fillRect(bx + cx * px, by + cy * px, w * px, h * px); };

    if (b.level === 2) {
      /* THE PORTCULLIS. Face: the passage is painted open behind it and the
         grate slides in the arch — never fully out of sight, so a raised
         gate still says "portcullis" at a glance. Flank: the grate lives at
         the OUTWARD mouth; shut it bars the slot, open its toothed edge
         stands proud of the coping. */
      if (!vert) {
        if (!front) return;
        cell(12, 13, 8, 17, IN);                          // the open passage
        cell(12, 26, 8, 4, SO[2]); cell(12, 26, 8, 1, SO[1]);   // the road through
        const h = Math.max(4, Math.round(4 + a * 13));    // grate: 4 cells showing even fully up
        cell(11, 13, 1, h, WD[2]); cell(20, 13, 1, h, WD[2]);   // the frame in its grooves
        for (const gx of [13, 15, 17, 19]) cell(gx, 13, 1, h, WD[1]);   // upright bars
        for (let gy = 13; gy < 13 + h - 1; gy += 4) { cell(11, gy, 10, 1, WD[0]); }  // iron-dark rails
        cell(11, 13 + h - 1, 10, 1, WD[0]);               // the foot rail…
        for (const gx of [13, 15, 17, 19]) cell(gx, 13 + h, 1, 1, IN);  // …and its spike tips
      } else {
        if (!front) return;
        // the outward mouth: JUST PROUD of the block's edge (block G0..G1 =
        // 7..24), so the dark grate reads against grass, not wood-on-wood
        const mx = dir > 0 ? 24.5 : 5.5;
        const rise = Math.round(o * 7);                   // how far the foot has climbed the slot
        if (o > 0.4) { cell(dir > 0 ? 25 : 5, 20, 2, 4, SO[2]); }   // open: lit ground through the mouth
        if (rise < 7) {                                   // the grate still in the slot
          cell(mx, 17, 2, 1, WD[2]);                      // its lintel groove
          cell(mx, 18, 2, 8 - rise, WD[0]);
          cell(mx, 18 + (8 - rise), 2, 1, IN);            // its toothed foot
        }
        const up = Math.round(o * 6);                     // …and its edge above the coping
        if (up > 0) { cell(mx, 4 - up, 2, up, WD[0]); cell(mx, 3 - up, 2, 1, IN); }
      }
      return;
    }

    /* L1 — TWO DOOR LEAVES SWING OUTWARD. Fully shut the baked sprite's own
       braced door is the drawing; the moment it moves, the passage is
       painted open and the leaves take over. */
    if (a >= 0.995) {
      // the flank keeps a visible closed door bar in its outward mouth — the
      // baked flank art has only a shadow there, and a door you can work
      // should read as a door from every side
      if (vert && front) {
        // just proud of the block's edge (block G0..G1 = 8..23), against the
        // grass — inside it, wood-on-wood, the door disappeared entirely
        const mx = dir > 0 ? 23.5 : 6.5;
        cell(mx, 17.5, 2, 9, WD[1]); cell(mx, 17.5, 2, 1, WD[3]);
        cell(mx + 0.5, 17.5, 1, 9, WD[2]);                // the two leaves' seam line
        cell(mx, 21.5, 2, 1, AP.thatch[1]);               // the lashing
        cell(mx, 25.5, 2, 1, WD[0]);                      // the dark foot
      }
      return;
    }
    // swing angle: capped at ~62°, NOT 90 — at square-open cos→0 stacks every
    // column back on its hinge and the leaves vanish into slivers
    const th = Math.min(1, o * 1.15) * 1.08;
    const cs = Math.cos(th), sn = Math.sin(th);
    if (!vert) {
      const away = dir < 0;
      if (front) {
        cell(11, 9, 10, 21, IN);                          // the open gap
        cell(11, 25, 10, 5, SO[2]); cell(11, 25, 10, 1, SO[1]);   // the road through
      }
      if (!away && front) {
        // leaves swinging TOWARD you: honest vertical-hinge foreshortening —
        // the leaf narrows to width·cos(θ), walked over SCREEN columns so the
        // panel stays solid (source-indexed columns collide when cos is small
        // and the door dissolved into slivers), with the free edge dropping
        // toward the camera as it comes
        const leafW = 5, proj = Math.max(1, Math.round(leafW * cs));
        for (const [hx, sgn] of [[11, 1], [21, -1]]) {
          for (let j = proj; j >= 1; j--) {
            const f = j / proj;                           // 0 hinge → 1 free edge
            const cx = hx + sgn * j;
            const dTop = f * leafW * sn * 0.5, dBot = f * leafW * sn * 0.95;
            const y0 = 9 + dTop, y1 = 30 + dBot;
            cell(cx, y0, 1, y1 - y0, j % 2 ? WD[1] : WD[2]);
            cell(cx, y0, 1, 1, WD[3]);                    // the lit top edge
            cell(cx, y1 - 1, 1, 1, WD[0]);                // the dark foot
            g.fillStyle = 'rgba(24,18,12,0.35)';          // its shadow on the ground
            g.fillRect(bx + cx * px, by + (y1 + 0.4) * px, px, px);
          }
          cell(hx + sgn * proj, 9 + leafW * sn * 0.5, 1,
               21 + leafW * sn * 0.45, WD[0]);            // the dark free edge
          cell(hx, 9, 1, 21, WD[0]);                      // the hinge post edge
        }
      } else if (away && front) {
        // leaves swung AWAY: plan view on the ground beyond the wall — drawn
        // on the FRONT pass, since ground north of the band is open grass and
        // a back-pass draw hid them under the sprite entirely
        for (const [hx, sgn] of [[11.5, 1], [20.5, -1]]) {
          for (let s = 0; s < 6; s++) {
            const cx = hx + sgn * s * cs - 1, cy = 10 - s * sn - 1;
            cell(cx, cy, 2, 2, s % 2 ? WD[1] : WD[2]);
            cell(cx, cy + 1.4, 2, 0.6, WD[0]);            // the under-edge
          }
        }
      }
    } else {
      if (!front) return;
      // the flank: plan-view leaves at the OUTWARD mouth, sweeping east or
      // west, one from each jamb — the classic double door seen from above
      const mx = (dir > 0 ? 23.5 : 8.5);   // the block's own face (G0..G1 = 8..23)
      for (const [hy, sgn] of [[18.5, 1], [25.5, -1]]) {
        for (let s = 0; s < 4; s++) {
          const cx = mx + dir * (0.5 + s * sn) - 1, cy = hy + sgn * s * cs - 1;
          cell(cx, cy, 2, 2, s % 2 ? WD[1] : WD[2]);
          cell(cx, cy + 1.4, 2, 0.6, WD[0]);
        }
      }
      if (o > 0.4) { cell(dir > 0 ? 22 : 8, 20, 2, 4, SO[2]); }   // lit ground through the mouth
    }
  },
  gateVerticalAt(x, y) {
    const score = (xx, yy) => {
      if (!MapGen.inB(xx, yy)) return 0;
      if (Bld.fortAt(xx, yy)) return 2;                    // wall or gate — the line itself
      const t = Bld.at(xx, yy);
      return t && t.key === 'tower' && !(t.construction > 0) ? 2 : 0;   // a mural tower stands IN it
    };
    const ns = score(x, y - 1) + score(x, y + 1), ew = score(x - 1, y) + score(x + 1, y);
    return ns > ew;
  },
  /* `lv` overrides which LEVEL's art to draw. Defaults to what the building
     is today — but a work site nearing completion must show the level it is
     becoming, not the one it is leaving (during an upgrade `b.level` is still
     the OLD level; it only increments in Bld.finishUpgrade). See the staged
     work-site branch below and tests/build-stages.mjs. */
  /* BLIT A BUILDING SPRITE, RESAMPLING HONESTLY.

     The world is drawn with `imageSmoothingEnabled = false` (see draw()) —
     right for pixel art authored at the tile grid, where a hard nearest-
     neighbour upscale is the whole look. But a sprite supplied by the asset
     manifest may be a SUPERSAMPLED MASTER several times the size of the tile
     rect it lands in (the Town Center L1 hut is 256×256 into ~110 screen px),
     and nearest-neighbour DOWN is not a look, it is decimation: seven of every
     eight pixels thrown away, on whichever phase the camera happens to land,
     so the thatch crawls and shimmers as you scroll.

     So: scaling a source DOWN turns smoothing on for that one blit and puts it
     straight back. Sprites at or below their destination size — every
     procedural sprite in the game — take the untouched nearest-neighbour path
     and are pixel-identical to before. */
  blitBld(g, spr, x, y, w, h) {
    /* HAND-AUTHORED ART TAKES THE ONE SHARED ANCHORING RULE (ART_PLAN.md):
       bottom-center on the footprint, scaled to footprint width, aspect
       preserved — a tall roof overhangs UPWARD past the tile. artRect is the
       single source of that geometry (tested directly by
       tests/art-pipeline.mjs); nothing per-building is tuned in code — the
       sidecar JSON's offsets/scale ride in on spr._cfArt. A square PNG lands
       pixel-identical to the old square blit, so the shipped hall art is
       untouched by this. */
    if (spr._cfArt) {
      const r = this.artRect(spr, x, y, w, h);
      const down = spr.width > r.w * 1.02;
      if (down) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
      g.drawImage(spr, r.x, r.y, r.w, r.h);
      if (down) g.imageSmoothingEnabled = false;
      return;
    }
    const down = spr.width > w * 1.02;
    if (down) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
    g.drawImage(spr, x, y, w, h);
    if (down) g.imageSmoothingEnabled = false;
  },
  // where a _cfArt drawable lands in a footprint rect — offsets are fractions
  // of the footprint, scale is a multiplier, and the FLOOR of the image sits
  // on the floor of the footprint
  artRect(spr, x, y, w, h) {
    const a = spr._cfArt || {};
    const dw = w * (a.scale || 1);
    const dh = dw * (spr.height / spr.width);
    return { x: x + (w - dw) / 2 + (a.ox || 0) * w,
             y: y + h - dh + (a.oy || 0) * h,
             w: dw, h: dh };
  },

  /* ============== PLACEMENT MODE RENDERING (tests/placement.mjs) ==============
     The design brief: quiet, legible, and never color-alone. Valid cells wear
     a soft green pane with corner ticks; invalid cells a fainter red pane cut
     by a diagonal slash (the SHAPE difference carries the meaning for
     colorblind players); the amber "saving up" state re-dresses the valid
     cells without changing their shape. All three are pre-rendered once at
     tile size and blitted — the per-frame cost is a lookup and a drawImage
     per visible cell. */
  _placeCells: null,
  _placeCellBucket: 0,
  /* cell art is re-rendered per ZOOM BUCKET (k ≈ 1/cam.z, quantized) so the
     lattice reads ~1px on screen at every zoom — baked at tile size it
     fattened into bright brackets zoomed in and dissolved to sub-pixel noise
     zoomed out (the design review). Buckets change rarely (a pinch crossing
     a quarter-step), and the full-map cache repaints with them. */
  _placeCell(kind) {
    const k = Math.round(Math.max(0.4, Math.min(2, 1 / this.cam.z)) * 4) / 4;
    if (this._placeCellBucket !== k) { this._placeCells = null; this._placeCellBucket = k; }
    if (!this._placeCells) {
      const TL = CFG.TILE;
      /* the VALID field is a surveyor's grid — a whisper of a pane and four
         corner dots, calm enough that the town still reads over it. The
         louder framed look is reserved for NEAR cells (around the ghost,
         where the eye is working) and the invalid slash for near
         obstructions only — detail follows the finger, the far field
         stays quiet. */
      const k = this._placeCellBucket;
      const pane = (fill, line, dim) => {
        const c = document.createElement('canvas'); c.width = c.height = TL;
        const q = c.getContext('2d');
        q.fillStyle = fill; q.fillRect(1, 1, TL - 2, TL - 2);
        q.strokeStyle = dim; q.lineWidth = 1 * k;      // a hairline lattice, screen-true
        q.strokeRect(1.5, 1.5, TL - 3, TL - 3);
        q.fillStyle = line;
        const ps = 3 * k;
        for (const [px, py] of [[1, 1], [TL - 1 - ps, 1], [1, TL - 1 - ps], [TL - 1 - ps, TL - 1 - ps]])
          q.fillRect(px, py, ps, ps);                  // surveyor's corner pips
        return c;
      };
      const framed = (fill, line) => {
        const c = document.createElement('canvas'); c.width = c.height = TL;
        const q = c.getContext('2d');
        q.fillStyle = fill; q.fillRect(1, 1, TL - 2, TL - 2);
        q.strokeStyle = line; q.lineWidth = 1.2 * k;
        q.strokeRect(1.5, 1.5, TL - 3, TL - 3);
        return c;
      };
      const slashed = (fill, line) => {
        const c = document.createElement('canvas'); c.width = c.height = TL;
        const q = c.getContext('2d');
        q.fillStyle = fill; q.fillRect(1, 1, TL - 2, TL - 2);
        q.strokeStyle = line; q.lineWidth = 1.2 * k;
        q.strokeRect(1.5, 1.5, TL - 3, TL - 3);
        // the refused-plot cue: one slash — carried by LUMINANCE, not hue
        // (red-on-green is the classic deuteranopia trap): a dark underlay
        // stroke with a light stroke over it reads for every eye
        q.lineWidth = 4 * k; q.strokeStyle = 'rgba(20,12,8,0.55)'; q.beginPath();
        q.moveTo(8, TL - 8); q.lineTo(TL - 8, 8); q.stroke();
        q.lineWidth = 2 * k; q.strokeStyle = line; q.beginPath();
        q.moveTo(8, TL - 8); q.lineTo(TL - 8, 8); q.stroke();
        return c;
      };
      this._placeCells = {
        ok:       pane('rgba(125,187,94,0.09)', 'rgba(190,235,150,0.7)', 'rgba(170,220,130,0.18)'),
        amber:    pane('rgba(226,178,74,0.08)', 'rgba(240,210,140,0.7)', 'rgba(232,200,130,0.18)'),
        okNear:   framed('rgba(125,187,94,0.12)', 'rgba(170,220,130,0.55)'),
        amberNear: framed('rgba(226,178,74,0.11)', 'rgba(232,200,130,0.5)'),
        badNear:  slashed('rgba(214,84,62,0.11)', 'rgba(230,116,92,0.48)'),
      };
    }
    return this._placeCells[kind];
  },
  PLACE_NEAR: 2.5,   // Chebyshev tiles around the ghost that get the detailed cells
  /* THE FAR LATTICE IS CACHED LIKE THE TERRAIN (the frame must never pay for
     bookkeeping): every valid cell's quiet pane is painted ONCE into a
     full-map offscreen canvas whenever the validity map (or the amber state)
     actually changes, and each frame blits the one visible slice of it —
     zoomed all the way out over a dense late-game base, the grid costs one
     drawImage plus the handful of live near-ring cells around the ghost.
     Freed on exitPlacement (drawPlaceGrid nulls it when the map is gone). */
  _placeGridCv: null,
  _placeGridStamp: null,
  _paintPlaceGridCache(m, amber) {
    const TL = CFG.TILE;
    if (!this._placeGridCv) {
      this._placeGridCv = document.createElement('canvas');
      this._placeGridCv.width = CFG.W * TL; this._placeGridCv.height = CFG.H * TL;
    }
    const q = this._placeGridCv.getContext('2d');
    q.clearRect(0, 0, this._placeGridCv.width, this._placeGridCv.height);
    const far = this._placeCell(amber ? 'amber' : 'ok');
    for (let i = 0; i < m.length; i++)
      if (m[i] === 0) q.drawImage(far, (i % CFG.W) * TL, ((i / CFG.W) | 0) * TL);
  },
  drawPlaceGrid(g) {
    const m = UI.placeMap, gh = UI.placeGhost;
    if (!m || !UI.placing || UI.placing === 'wall' || !gh) {
      if (!m && this._placeGridCv) { this._placeGridCv = null; this._placeGridStamp = null; }
      return;
    }
    const TL = CFG.TILE, sz = Bld.size(UI.placing);
    const amber = !!(UI.placeVerdict && !UI.placeVerdict.afford);
    const stamp = UI.placeMapStamp;
    const bucket = Math.round(Math.max(0.4, Math.min(2, 1 / this.cam.z)) * 4) / 4;
    if (!this._placeGridCv || this._placeGridStamp !== stamp || this._placeGridAmber !== amber ||
        this._placeGridBucket !== bucket) {
      this._paintPlaceGridCache(m, amber);
      this._placeGridStamp = stamp; this._placeGridAmber = amber; this._placeGridBucket = bucket;
    }
    // one blit of the visible slice of the cached lattice
    const wx = Math.max(0, this.cam.x), wy = Math.max(0, this.cam.y);
    const ww = Math.min(this._placeGridCv.width - wx, this.viewW() / this.cam.z);
    const wh = Math.min(this._placeGridCv.height - wy, this.viewH() / this.cam.z);
    if (ww > 0 && wh > 0) g.drawImage(this._placeGridCv, wx, wy, ww, wh, wx, wy, ww, wh);
    // …and the LIVE detail ring around the ghost: framed valid cells, slashed
    // obstructions — a few dozen cells at most, redrawn as the ghost moves
    const near = this._placeCell(amber ? 'amberNear' : 'okNear');
    const bad = this._placeCell('badNear');
    const NR = Math.ceil(this.PLACE_NEAR + (sz - 1) / 2);
    const gx = gh.x + ((sz / 2) | 0), gy = gh.y + ((sz / 2) | 0);
    for (let y = Math.max(1, gy - NR); y <= Math.min(CFG.H - 2, gy + NR); y++)
      for (let x = Math.max(1, gx - NR); x <= Math.min(CFG.W - 2, gx + NR); x++) {
        const v = m[y * CFG.W + x];
        if (v === 255) continue;
        // the framed cell draws OVER the cached pane (never clearRect here —
        // that would punch a hole through to the page under the terrain)
        g.drawImage(v === 0 ? near : bad, x * TL, y * TL);
      }
  },

  // a drawable tinted to one flat color, silhouette-true — cached per base
  // canvas per color (the darkOf/WeakMap pattern); _cfArt rides along so a
  // tinted PNG ghost keeps its anchoring
  _tintCache: new WeakMap(),
  tintOf(base, col) {
    let e = this._tintCache.get(base);
    if (!e) { e = {}; this._tintCache.set(base, e); }
    if (e[col]) return e[col];
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const q = c.getContext('2d');
    q.drawImage(base, 0, 0);
    q.globalCompositeOperation = 'source-atop';
    q.fillStyle = col; q.fillRect(0, 0, c.width, c.height);
    c._cfArt = base._cfArt;
    return e[col] = c;
  },

  /* ---- FALLEN GAME (tests/wild-life.mjs): every kill leaves its mark. Both
     looks are CUT FROM THE BEAST'S OWN SPRITE (the deathSheet/collapseSheet
     convention), so all five kinds — and any future beast — get remains for
     free. Phase 'meat': the animal on its side, a modest darkening, a small
     blood pool and a couple of open patches — an animal died here, told
     plainly, not gorily. Phase 'bone': the same silhouette bleached and
     eroded to an outline with a rib-cage across the middle. Cached per
     (kind, phase); never in a save (S.corpses carries only x/y/kind/day). */
  _corpseC: {},
  corpseOf(kind, phase) {
    const k = kind + '/' + phase;
    if (this._corpseC[k] !== undefined) return this._corpseC[k];
    const set = Sprites.unit[kind];
    const base = set && set.idle && set.idle[0];
    if (!base) return this._corpseC[k] = null;
    const w = base.width, h = base.height;
    const side = Math.max(w, h);
    const c = document.createElement('canvas'); c.width = c.height = side;
    const q = c.getContext('2d');
    q.imageSmoothingEnabled = false;
    /* the beast, fallen: FLIPPED on its back, legs in the air — the one pose
       that reads "dead" at a glance from any distance. (A quarter-turn
       rotation was tried first: a side-view quadruped rotated 90° is a
       nose-down totem pole, not a carcass.) The living sprite's soft baked
       ground-shadow is ERASED first — flipped, that line rode above the feet
       and read as an upside-down animal standing on a ceiling. Body pixels
       are full-alpha (the ink-outline pass), the shadow is translucent, so
       alpha is the honest separator. */
    const clean = document.createElement('canvas'); clean.width = w; clean.height = h;
    const qc = clean.getContext('2d');
    qc.drawImage(base, 0, 0);
    try {
      const px = qc.getImageData(0, 0, w, h);
      for (let i = 3; i < px.data.length; i += 4)
        if (px.data[i] > 0 && px.data[i] < 190) px.data[i] = 0;
      qc.putImageData(px, 0, 0);
    } catch (e) { /* tainted (never for procedural beasts) — keep the shadow */ }
    const lay = document.createElement('canvas'); lay.width = lay.height = side;
    const ql = lay.getContext('2d');
    ql.imageSmoothingEnabled = false;
    ql.translate(side / 2, side / 2);
    ql.scale(1, -0.86);                      // …and settled: a carcass slumps flat
    ql.drawImage(clean, -w / 2, -h / 2);
    if (phase === 'meat') {
      /* the blood is the GROUND the carcass lies on, not a disc beneath it: an
         irregular stain of overlapping blots spreading out AROUND the body —
         wider by the head and belly, ragged at the rim — with the body settled
         INTO it so the pool shows past it on every side. A neat ellipse read
         as a shadow, and a shadow reads as floating. */
      const r = ART.rng(side * 7 + kind.length);
      const bx = side / 2, by2 = side * 0.56;        // where the body mass lies
      q.fillStyle = 'rgba(96,22,16,0.42)';
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, d2 = r() * side * 0.20;
        q.beginPath();
        q.ellipse(bx + Math.cos(a) * d2 * 1.5, by2 + Math.sin(a) * d2 * 0.7,
          side * (0.10 + r() * 0.13), side * (0.05 + r() * 0.07), r() * 1.2, 0, Math.PI * 2);
        q.fill();
      }
      // a darker heart to the stain, right under the wound side
      q.fillStyle = 'rgba(74,14,10,0.5)';
      q.beginPath();
      q.ellipse(bx - side * 0.08, by2, side * 0.16, side * 0.08, 0.3, 0, Math.PI * 2);
      q.fill();
      // two thin runs where it crept along the ground
      q.strokeStyle = 'rgba(96,22,16,0.4)'; q.lineWidth = Math.max(1, side / 24);
      q.beginPath();
      q.moveTo(bx + side * 0.12, by2 + side * 0.05);
      q.lineTo(bx + side * 0.30, by2 + side * (0.08 + r() * 0.05));
      q.moveTo(bx - side * 0.14, by2 + side * 0.06);
      q.lineTo(bx - side * 0.30, by2 + side * (0.10 + r() * 0.04));
      q.stroke();
      q.drawImage(lay, 0, 6);                        // settled low, lying IN the stain
      q.globalCompositeOperation = 'source-atop';
      q.fillStyle = 'rgba(58,38,30,0.35)';           // the life gone out of the hide
      q.fillRect(0, 0, side, side);
      q.globalCompositeOperation = 'source-over';
      // meat still on it: two modest open patches along the upper flank
      q.fillStyle = '#a84438';
      for (let i = 0; i < 2; i++) {
        const px = side * (0.35 + r() * 0.3), py = side * (0.40 + r() * 0.16);
        q.fillRect(px, py, 3 + (r() * 3 | 0), 2 + (r() * 2 | 0));
        q.fillStyle = '#c86a52';
      }
    } else {
      /* bones: the lying shape as a faint pale shade — the OUTLINE of the
         animal that fell there — with the spine, a rib-cage and the skull
         drawn over it. The suggestion of the beast, not an anatomy lesson.
         (A first draft eroded the silhouette to a 1px outline; on sprites
         that are mostly 1px lines already, nothing survived the erosion.) */
      const bone = document.createElement('canvas'); bone.width = bone.height = side;
      const qb = bone.getContext('2d');
      qb.drawImage(lay, 0, 4);
      qb.globalCompositeOperation = 'source-atop';
      qb.fillStyle = '#ded4b8'; qb.fillRect(0, 0, side, side);
      q.globalAlpha = 0.30;
      q.drawImage(bone, 0, 0);
      q.globalAlpha = 1;
      const W2 = side, cy2 = side * 0.52, rh = side * 0.15;
      q.strokeStyle = '#ece4cc'; q.lineWidth = Math.max(1.5, side / 20);
      // the spine, nose to tail
      q.beginPath(); q.moveTo(W2 * 0.22, cy2 - rh); q.lineTo(W2 * 0.76, cy2 - rh); q.stroke();
      // the rib-cage — the one shape that says SKELETON at a glance
      q.beginPath();
      for (let i = 0; i < 4; i++) {
        const rx = W2 * 0.36 + i * W2 * 0.09;
        q.moveTo(rx, cy2 - rh); q.quadraticCurveTo(rx + W2 * 0.05, cy2, rx, cy2 + rh);
      }
      q.stroke();
      // the skull at the head end, a socket dotted into it
      q.fillStyle = '#ece4cc';
      q.beginPath(); q.ellipse(W2 * 0.20, cy2 - rh * 0.4, W2 * 0.07, W2 * 0.055, -0.3, 0, Math.PI * 2); q.fill();
      q.fillStyle = 'rgba(40,32,22,0.8)';
      q.fillRect(W2 * 0.185, cy2 - rh * 0.55, Math.max(1.5, side / 24), Math.max(1.5, side / 24));
    }
    return this._corpseC[k] = c;
  },

  /* ---- THE CONFIRM POOF (tests/placement.mjs): the materials land. When ✓
     is tapped, a ring of dust billows out from UNDER the new work site on
     all four sides — as if the timber and stone just dropped out of the sky
     onto the plot. Seven pre-rendered frames per footprint size (≥5 by
     contract), one run lasting under a second: a cool beat that never
     overstays. Render-side only (R.placePoofs, the R.collapses rule) —
     never in a save, cleared in onNewGame. */
  POOF_FRAMES: 10,   // more stills, shorter run: the cloud rolls, then it's gone
  POOF_MS: 600,
  _poofSheets: {},
  poofSheet(sz) {
    if (this._poofSheets[sz]) return this._poofSheets[sz];
    const TL = CFG.TILE, pad = TL, side = sz * TL + pad * 2;
    const frames = [];
    const r = ART.rng(97 + sz * 13);
    // fixed puff seeds around the footprint's perimeter, so the ring is the
    // same shape every frame and reads as ONE cloud billowing, not noise
    const seeds = [];
    const N = 10 + sz * 4;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + r() * 0.4;
      seeds.push({ a, sp: 0.7 + r() * 0.6, sz: 0.6 + r() * 0.7, wob: r() * Math.PI * 2 });
    }
    const DUST = ['#8a7355', '#a89272', '#c9b896', '#e0d4b4'];
    /* PIXEL DUST: every shipped sprite is hard-edged, so smooth alpha-graded
       balloons read as pasted in from another engine (the design review).
       Each frame is drawn at HALF resolution with alpha quantized to three
       steps, then blitted up nearest-neighbour — chunky stepped puffs in the
       same rendering language as the buildings, geometry untouched. */
    const K = 2;                                          // the pixelation factor
    const qa = (a) => Math.round(a * 3) / 3;              // 3-step alpha, no gradients
    for (let f = 0; f < this.POOF_FRAMES; f++) {
      const t = f / (this.POOF_FRAMES - 1);              // 0..1 through the second
      const lo = document.createElement('canvas'); lo.width = lo.height = Math.ceil(side / K);
      const q = lo.getContext('2d');
      q.scale(1 / K, 1 / K);
      const cx = side / 2, cy = side / 2;
      const spread = Math.sin(Math.min(1, t * 1.15) * Math.PI / 2);   // fast burst, drifting finish
      const fade = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
      // the ground wash under the plot — the impact itself
      if (t < 0.5) {
        q.globalAlpha = qa(0.35 * (1 - t * 2));
        q.fillStyle = DUST[2];
        q.beginPath(); q.ellipse(cx, cy, sz * TL * 0.5, sz * TL * 0.34, 0, 0, Math.PI * 2); q.fill();
      }
      // the billowing ring: each puff pushes outward from the footprint edge,
      // swells as it travels, thins as it dies — biased wide (dust hugs
      // ground), the travel scaled by footprint so a razed hut is visibly a
      // smaller event than a razed barracks
      for (const s of seeds) {
        const dist = (sz * TL * 0.5) + spread * s.sp * (TL * (0.3 + sz * 0.14) + sz * 3);
        const px = cx + Math.cos(s.a) * dist * 1.12;
        const py = cy + Math.sin(s.a) * dist * 0.72 - spread * 2;   // squashed: seen from above
        const pr = (3 + s.sz * 4 + spread * s.sz * 5) * (0.75 + sz * 0.12);
        q.globalAlpha = qa(0.75 * fade * (0.7 + 0.3 * Math.sin(s.wob + t * 5)));
        // two-tone puff: dark core, light crown — reads as a rolling cloud
        q.fillStyle = DUST[(f + (s.wob * 3 | 0)) % 2];
        q.beginPath(); q.arc(px, py + 1, pr, 0, Math.PI * 2); q.fill();
        q.fillStyle = DUST[2 + ((s.wob * 7 | 0) % 2)];
        q.beginPath(); q.arc(px - pr * 0.25, py - pr * 0.3, pr * 0.62, 0, Math.PI * 2); q.fill();
      }
      // a few motes thrown clear of the ring
      q.globalAlpha = qa(0.7 * fade);
      q.fillStyle = DUST[3];
      for (let i = 0; i < 6 + sz * 3; i++) {
        const a = r() * Math.PI * 2, d2 = (sz * TL * 0.5) + spread * (TL * 0.8 + r() * TL * 0.5);
        q.fillRect(cx + Math.cos(a) * d2 * 1.1, cy + Math.sin(a) * d2 * 0.7 - spread * 4, K * 2, K * 2);
      }
      q.globalAlpha = 1;
      const c = document.createElement('canvas'); c.width = c.height = side;
      const cg = c.getContext('2d');
      cg.imageSmoothingEnabled = false;
      cg.drawImage(lo, 0, 0, side, side);
      frames.push(c);
    }
    return this._poofSheets[sz] = { frames, pad };
  },
  placePoofs: [],
  /* opts.delay (ms) holds a cloud back before its first frame — the residual
     puff after a destruction, and the tower's landing beat. Implemented as a
     NEGATIVE t that drawPlacePoofs advances through and skips while below
     zero; the frame index is clamped ≥ 0 so a stray negative can never index
     frames[-1]. opts.scale draws the same sheet smaller/larger about the
     footprint's center (the residual puff is a 0.65 echo of the first). */
  /* ================= THE HOMESTEAD'S GOLDEN BURST =================
     (Bld.celebrateHomestead, tests/homestead.mjs.) The placement dust's twin,
     in gold: a ring of sparks thrown outward from the pair, saying "that was
     worth doing" the instant a house and a field bond. Built exactly like
     poofSheet — pre-rendered frames, PIXEL sparks (drawn at half resolution
     with alpha quantized to three steps, then blitted up nearest-neighbour),
     because a smooth glow would be the only soft-edged thing on screen.

     What makes it read as REWARD rather than debris: it rises instead of
     hugging the ground, the ring is a clean expanding circle rather than a
     billow, and every spark is a hard two-pixel gleam with a bright core. */
  BOND_FRAMES: 12,
  _bondSheet: null,
  bondSheet() {
    if (this._bondSheet) return this._bondSheet;
    const TL = CFG.TILE, pad = TL, side = TL + pad * 2;
    const frames = [];
    const r = ART.rng(613);
    /* THE RING IS MADE OF SPARKS, not drawn as a hoop. A stroked arc upscaled
       through the pixelation step comes out as a soft blurred circle — the one
       smooth-edged thing on a hard-edged screen, and it swallows the sparks
       inside it. Twenty-odd hard gold pixels thrown outward on a common radius
       read as what was actually asked for: a ring of sparks. */
    const N = 22;
    const seeds = [];
    for (let i = 0; i < N; i++)
      seeds.push({ a: (i / N) * Math.PI * 2 + r() * 0.22, sp: 0.86 + r() * 0.28,
        sz: 0.7 + r() * 0.8, rise: 0.16 + r() * 0.26, lag: r() * 0.05 });
    /* SATURATED gold, not pale. The first cut leaned on near-white for the
       spark core and thin low-alpha strokes for the ring, and over green grass
       that reads as a soft white glow — a lighting effect, not treasure. The
       body of every mark is the game's own gold (--gold, #e8c15a) with only a
       one-pixel hot core above it. */
    const GOLD = ['#8a6410', '#d8a52c', '#e8c15a', '#ffe9a3'];
    const K = 2;                                   // the same pixelation factor as the dust
    const qa = a => Math.round(a * 3) / 3;
    for (let f = 0; f < this.BOND_FRAMES; f++) {
      const t = f / (this.BOND_FRAMES - 1);
      const lo = document.createElement('canvas'); lo.width = lo.height = Math.ceil(side / K);
      const q = lo.getContext('2d');
      q.scale(1 / K, 1 / K);
      const cx = side / 2, cy = side / 2;
      const spread = Math.sin(Math.min(1, t * 1.1) * Math.PI / 2);
      const fade = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
      // THE SPARKS ARE the ring: each rides outward on a common radius and
      // LIFTS as it goes, so the circle opens and drifts up rather than
      // splashing flat the way the placement dust does
      for (const sp of seeds) {
        const st = Math.max(0, Math.min(1, (t - sp.lag) / (1 - sp.lag)));
        const sprd = Math.sin(Math.min(1, st * 1.1) * Math.PI / 2);
        const dist = 3 + sprd * sp.sp * TL * 0.62;
        const px = cx + Math.cos(sp.a) * dist;
        // only a GENTLE lift: enough to say the sparks are rising rather than
        // splashing, not so much that the ring stops being a ring
        const py = cy + Math.sin(sp.a) * dist * 0.82 - sprd * sp.rise * TL * 0.34;
        const w = Math.max(2, Math.round(sp.sz * 3 * (1 - t * 0.45)));
        const X = Math.round(px), Y = Math.round(py);
        q.globalAlpha = qa(fade);
        q.fillStyle = GOLD[2];                     // the spark's BODY is gold…
        q.fillRect(X, Y, w, w);
        q.fillStyle = GOLD[3];                     // …with one hot pixel in it
        q.fillRect(X, Y, Math.max(1, w - 1), 1);
        q.globalAlpha = qa(0.67 * fade);           // and a deep skirt beneath
        q.fillStyle = GOLD[0];
        q.fillRect(X - 1, Y + w, w + 1, 1);
      }
      q.globalAlpha = 1;
      const hi = document.createElement('canvas'); hi.width = hi.height = side;
      const h = hi.getContext('2d');
      h.imageSmoothingEnabled = false;
      h.drawImage(lo, 0, 0, side, side);
      frames.push(hi);
    }
    this._bondSheet = { frames, pad };
    return this._bondSheet;
  },
  // x,y are TILE coordinates of the burst's centre
  startBondSpark(x, y) {
    if (!this.bondSparks) this.bondSparks = [];
    if (this.bondSparks.length > 8) this.bondSparks.shift();
    this.bondSparks.push({ x, y, t: 0 });
  },
  drawBondSparks(g, dt) {
    if (!this.bondSparks || !this.bondSparks.length) return;
    const TL = CFG.TILE, MS = (CFG.HOMESTEAD && CFG.HOMESTEAD.sparkMs) || 800;
    const sheet = this.bondSheet();
    for (let i = this.bondSparks.length - 1; i >= 0; i--) {
      const p = this.bondSparks[i];
      p.t += dt * 1000;
      if (p.t >= MS) { this.bondSparks.splice(i, 1); continue; }
      const f = Math.max(0, Math.min(this.BOND_FRAMES - 1, (p.t / MS * this.BOND_FRAMES) | 0));
      g.drawImage(sheet.frames[f], p.x * TL - sheet.pad - TL / 2, p.y * TL - sheet.pad - TL / 2);
    }
  },

  startPlacePoof(x, y, sz, opts) {
    if (this.placePoofs.length > 16) this.placePoofs.shift();   // a razed town block stays a scene, not a whiteout
    opts = opts || {};
    this.placePoofs.push({ x, y, sz: sz || 1, t: -(opts.delay || 0), scale: opts.scale || 1 });
  },
  drawPlacePoofs(g, dt) {
    if (!this.placePoofs.length) return;
    const TL = CFG.TILE;
    for (let i = this.placePoofs.length - 1; i >= 0; i--) {
      const p = this.placePoofs[i];
      p.t += dt * 1000;
      if (p.t < 0) continue;                                    // still waiting its beat
      if (p.t >= this.POOF_MS) { this.placePoofs.splice(i, 1); continue; }
      const sheet = this.poofSheet(p.sz);
      const f = Math.max(0, Math.min(this.POOF_FRAMES - 1, (p.t / this.POOF_MS * this.POOF_FRAMES) | 0));
      const sc = p.scale || 1;
      if (sc === 1) {
        g.drawImage(sheet.frames[f], p.x * TL - sheet.pad, p.y * TL - sheet.pad);
      } else {
        const side = sheet.frames[f].width, w = side * sc;
        const cx = p.x * TL + p.sz * TL / 2, cy = p.y * TL + p.sz * TL / 2;
        g.drawImage(sheet.frames[f], cx - w / 2, cy - w / 2, w, w);
      }
    }
  },
  /* THE FALL THROWS THE SAME DUST THE MATERIALS DID (tests/burn-down.mjs).
     A destroyed building's sprite drops off the map in a frame — the poof is
     what SELLS the weight: one full-size burst under the footprint (bigger
     ground, bigger cloud — poofSheet already scales, and its bias is already
     outward and low), then a smaller residual puff a beat later as the last
     of it settles. A kind registered in R.COLLAPSE holds its dust for the
     LANDING instead — the tower's block hits the ground at ~0.84 of its
     topple, and dust on the killing blow would give the ending away (the
     same reasoning that holds its ash and its ground back). Fired from
     Bld.damage's destroy branch only — a demolition is a teardown, not a
     kill — and fog-gated: dust nobody can see is a cloud drawn for nobody. */
  startDestructPoof(b) {
    const sz = Bld.size(b);
    let seen = false;
    for (let vy = 0; vy < sz && !seen; vy++) for (let vx = 0; vx < sz; vx++)
      if (G.visibleAt(b.x + vx, b.y + vy)) { seen = true; break; }
    if (!seen) return;
    const cfg = this.COLLAPSE[b.key];
    const delay = (cfg && !(b.construction > 0)) ? cfg.ms * 0.84 : 0;
    this.startPlacePoof(b.x, b.y, sz, { delay });
    this.startPlacePoof(b.x, b.y, sz, { delay: delay + 250, scale: 0.65 });
  },

  /* the ghost: the building's TRUE art (image or procedural, via the same
     bldSprite + blitBld path the standing building will use) at its TRUE
     footprint, translucent, washed green/red/amber, with a ✓ / ⃠ / ⏳ badge
     so state never rides on color alone — plus any effect radius the
     placement decision should know about. */
  drawPlaceGhost(g) {
    const gh = UI.placeGhost, key = UI.placing;
    if (!gh || !key || key === 'wall') return;
    const TL = CFG.TILE, sz = Bld.size(key), bw = sz * TL;
    const bx = gh.x * TL, by = gh.y * TL;
    const v = UI.placeVerdict || { ok: true, afford: true };
    const state = !v.ok ? 'bad' : (v.afford ? 'ok' : 'amber');
    const line = state === 'ok' ? 'rgba(158,214,120,0.95)'
               : state === 'amber' ? 'rgba(232,196,120,0.95)' : 'rgba(230,106,84,0.95)';
    const wash = state === 'ok' ? 'rgba(125,187,94,0.30)'
               : state === 'amber' ? 'rgba(226,178,74,0.30)' : 'rgba(220,80,58,0.34)';

    // EFFECT RADIUS — a soft ring under everything: a tower's arrows, a war
    // camp's arrows + its forward build reach, a farm's orchard bonus reach
    const d = CFG.BUILDINGS[key];
    const spec = Bld.buildSpec(key, 'P');
    const lv = (spec.level || 1);
    const rings = [];
    const lvDef = d.levels[Math.min(lv, d.levels.length) - 1];
    if (lvDef && lvDef.range) rings.push({ r: lvDef.range, col: 'rgba(224,140,96,0.55)' });
    if (d.near && d.near.radius) rings.push({ r: d.near.radius, col: 'rgba(150,210,110,0.5)' });
    if (key === 'warcamp') rings.push({ r: CFG.BUILD_RANGE, col: 'rgba(210,190,140,0.4)' });
    const cx = bx + bw / 2, cy = by + bw / 2;
    for (const ring of rings) {
      g.beginPath();
      g.setLineDash([6, 5]);
      g.arc(cx, cy, ring.r * TL, 0, Math.PI * 2);
      g.strokeStyle = ring.col; g.lineWidth = 1.5; g.stroke();
      g.setLineDash([]);
      g.fillStyle = ring.col.replace(/[\d.]+\)$/, '0.05)');
      g.fill();
    }

    // footprint pane + strong outline
    g.fillStyle = wash.replace(/[\d.]+\)$/, '0.16)');
    g.fillRect(bx, by, bw, bw);
    g.strokeStyle = line; g.lineWidth = 2;
    g.strokeRect(bx + 1, by + 1, bw - 2, bw - 2);

    // the building itself — true art, true anchor, translucent, with only a
    // BREATH of wash: the pane, outline and badge carry the validity, and a
    // heavier tint flattened the art into a green blob (the design review)
    const bobj = { key, owner: 'P', level: lv, x: gh.x, y: gh.y, construction: 0,
                   sz, id: 'g' + gh.x + '_' + gh.y };
    const spr = this.bldSprite(bobj);
    g.globalAlpha = 0.78;
    this.blitBld(g, spr, bx, by, bw, bw);
    g.globalAlpha = 0.15;
    this.blitBld(g, this.tintOf(spr, line), bx, by, bw, bw);
    g.globalAlpha = 1;

    /* the badge: shape, not just color — ✓ ready · ⃠ refused · hourglass
       saving. Drawn only while the ghost is UNPARKED (dragging or hover):
       once it is set, the ✓/✗ buttons themselves carry the state and a
       second glyph would just be clutter. */
    if (!gh.set || UI.placeDragging) {
      // CONSTANT SCREEN SIZE (design review): the badge is a touch-scale read,
      // so it holds its size whatever the zoom — divide by cam.z in world space
      const k = Math.max(0.6, 1 / this.cam.z);
      const r = 8 * k, bxc = bx + bw - 1, byc = by + 1;
      g.beginPath(); g.arc(bxc, byc, r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(24,18,12,0.85)'; g.fill();
      g.strokeStyle = line; g.lineWidth = 2 * k; g.stroke();
      g.lineWidth = 2.2 * k; g.strokeStyle = line; g.beginPath();
      if (state === 'ok') {
        g.moveTo(bxc - 4 * k, byc + 0.5 * k); g.lineTo(bxc - 1.5 * k, byc + 3 * k); g.lineTo(bxc + 4 * k, byc - 3 * k);
      } else if (state === 'bad') {
        g.arc(bxc, byc, 4.5 * k, 0, Math.PI * 2);
        g.moveTo(bxc - 3.2 * k, byc + 3.2 * k); g.lineTo(bxc + 3.2 * k, byc - 3.2 * k);
      } else {
        // an hourglass: still saving up
        g.moveTo(bxc - 3.2 * k, byc - 3.8 * k); g.lineTo(bxc + 3.2 * k, byc - 3.8 * k); g.lineTo(bxc - 3.2 * k, byc + 3.8 * k);
        g.lineTo(bxc + 3.2 * k, byc + 3.8 * k); g.closePath();
      }
      g.stroke();
    }
  },

  bldSprite(b, lv) {
    const L = Math.max(1, lv || b.level);
    /* A DOCK FACES ITS SHORE. The deck runs out from the land, and which flank
       that is depends on the coastline — so the sprite is chosen by
       Bld.dockShore, not baked. 'n' returns the canonical slot so a manifest
       image still overrides it (see Sprites.dockFace). */
    if (b.key === 'dock') {
      // hand-authored dock art (one rectangle) overrides ALL orientations —
      // the per-shore procedural faces only serve while no PNG exists
      const famD = (b.owner === 'A' ? Sprites.buildingA : Sprites.building).dock;
      const over = famD && famD[Math.min(L, famD.length) - 1];
      if (!(over && over._cfArt)) {
        const side = Bld.dockShore(b);
        if (side !== 'n') {
          const set = (Sprites.dockFace || {})[b.owner === 'A' ? 'A' : 'P'];
          const f = set && set[Math.min(L, 3) - 1] && set[Math.min(L, 3) - 1][side];
          if (f) return f;
        }
      }
    }
    if (b.key === 'wall') return Sprites.wallMask[Math.min(L, Sprites.wallMask.length) - 1][this.wallMaskAt(b.x, b.y)];
    if (b.key === 'gate') return Sprites.gateMask[Math.min(L, Sprites.gateMask.length) - 1][this.gateVerticalAt(b.x, b.y) ? 1 : 0];
    /* A TOWER HAS TWO SELVES. Built onto a wall it is a MURAL TOWER — a
       thicker, taller piece of the curtain in the same stone, no outline of
       its own, no door in its foot, the walk running into its flanks. Standing
       alone in open ground it stays the free-standing Watchtower, which is
       what a lone scout tower should look like. Work sites keep the ordinary
       sprite: what is being raised is the building, not the bond. */
    if (b.key === 'tower' && !(b.construction > 0) && Sprites.towerMural &&
        MapGen.inB(b.x, b.y) && this.towerLinkMask(b.x, b.y).mask)
      return Sprites.towerMural[Math.min(L, Sprites.towerMural.length) - 1];
    // a camp is the home of one of the five peoples, and looks like it
    if (b.key === 'raidercamp' && Sprites.camp && Sprites.camp[b.tribe]) return Sprites.camp[b.tribe];
    const fam = (b.owner === 'A' ? Sprites.buildingA : Sprites.building)[b.key];
    return fam[Math.min(L, fam.length) - 1];
  },

  /* ============ THE RAISING, DERIVED (tests/build-stages.mjs) ============
     The hand-made PNGs replace finished buildings faster than authored stage
     art could ever follow them, so a work site's three looks are now DERIVED
     — from the footprint, the tier's materials and the TARGET SPRITE itself
     — instead of hand-drawn per key:

       stage 0  THE CLEARED SITE — trodden bare earth in the chocolate brown
                of the shipped yard art (SITE_EARTH, sampled from the
                sapper/siege PNGs — never tan), corner stakes and a taut
                cord marking the plot, a few Neolithic tools (wooden spade,
                antler pick, woven basket) and the tier's first deliveries:
                rough poles at tier 1, fieldstones at 2, drystone slabs at 3
       stage 1  THE FRAMING — a lashed post-and-beam skeleton traced from
                the target sprite's own silhouette: rough poles at tier 1,
                the same frame on a fieldstone footing at tier 2, drystone
                piers at tier 3. The massing is the building's own, so a
                wide yard frames wide and a tall hall frames tall — and a
                roofed kind sketches its ridge and rafters (stageRoof; a
                worker plot or a ground-level yard frames flat)
       stage 2  THE PARTIAL BUILD — the target sprite itself with its top
                taken off above the wall line, pale fresh-cut ends along
                the break and post stubs above it: walls up, roof to come

     No sawn lumber, no scaffolding towers, no metal — the tools on site are
     the tools this world has. Hard-edged fills only, dark outlines on the
     frame (ART.outline), and the derived canvases carry the base's _cfArt
     so a PNG's stages land exactly where its finished art will.

     Derivation is LAZY and cached per target sprite (WeakMap — the
     _burnCache pattern) because PNG art decodes late and swaps in whenever
     it lands; the stages simply re-derive from whatever sprite the building
     would draw today. Pixel reads on a file:// PNG throw (canvas taint), so
     every read here try/catches down to honest margins — the stages always
     render, just less silhouette-aware. Bespoke `misc/<key>Build1..3` art
     still wins the route (the tower today), and the dock, the wonder and
     the wall/gate ghosts keep their own raisings. */
  SITE_EARTH: ['#482820', '#503020', '#806040', '#886040', '#a07850'],
  _siteCache: {},
  _stageCache: new WeakMap(),
  _stageEntry(base) {
    let e = this._stageCache.get(base);
    if (!e) { e = {}; this._stageCache.set(base, e); }
    return e;
  },
  // the opaque bounding box of a drawable, as fractions of its canvas —
  // pixel-read where the canvas allows it, honest margins where taint forbids
  _artBox(base) {
    const e = this._stageEntry(base);
    if (e.box) return e.box;
    let box = { l: 0.08, r: 0.92, t: 0.08, b: 0.94 };
    try {
      let c = base;
      if (!c.getContext) {
        c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
        c.getContext('2d').drawImage(base, 0, 0);
      }
      const W = c.width, H = c.height;
      const d = c.getContext('2d').getImageData(0, 0, W, H).data;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (d[(y * W + x) * 4 + 3] > 40) {
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      if (n > 50) box = { l: x0 / W, r: (x1 + 1) / W, t: y0 / H, b: (y1 + 1) / H };
    } catch (_) { /* tainted — the margins stand */ }
    return e.box = box;
  },
  // does this kind's frame sketch a roof? A worker plot or a ground-level
  // yard (the FIRE_AT ground entries know which) frames flat.
  stageRoof(key, lv) {
    const fa = this.smokeAnchor(this.FIRE_AT, key, lv || 1);
    if (fa && fa.ground) return false;
    const d = CFG.BUILDINGS[key];
    return !(d && d.needsWorker);
  },
  /* the ROUND kinds — a square gabled frame under a conical hut meant the
     player watched a square building turn round overnight (the design
     review). Roundness cannot be read off a silhouette bbox, so it is the
     one per-key fact the derivation carries: the levels whose art is a
     roundhouse. */
  STAGE_ROUND: { tc: [1], house: [1] },
  stageRound(key, lv) {
    const e = this.STAGE_ROUND[key];
    return !!(e && e.indexOf(lv || 1) >= 0);
  },
  /* the GROUND PLAN of a site — which shape of patch gets cleared. Derived
     from the target art: round kinds break a round plot, everything else a
     squared one as wide as its own art. lv may exceed the family (a wall
     preview) — clamped inside. */
  padShape(key, lv, base) {
    if (!base) {
      const fam = Sprites.building[key];
      base = fam ? fam[Math.min(lv || 1, fam.length) - 1] : null;
    }
    const box = base ? this._artBox(base) : null;
    const qz = (v) => Math.round(v * 16) / 16;                 // quantized — the cache key reads it
    return {
      round: this.stageRound(key, lv),
      l: qz(box ? Math.max(0.02, box.l - 0.04) : 0.06),
      r: qz(box ? Math.min(0.98, box.r + 0.04) : 0.94),
    };
  },
  /* the trodden work-ground alone — drawn under every stage. NOT a blob: the
     patch is the building's own PLAN (square, long or round), broken to a
     ragged clod edge, and only PARTLY cleared — tongues of the real grass
     still stand inside it (erased holes, so the live terrain shows through).
     A ground decal in this projection is seen from above, so the plan fills
     the footprint's depth and takes its WIDTH from the art. */
  padOf(sz, shape) {
    shape = shape || { round: false, l: 0.06, r: 0.94 };
    const ck = ['pad', sz, shape.round ? 'o' : 'q', shape.l, shape.r].join(':');
    if (this._siteCache[ck]) return this._siteCache[ck];
    const side = sz * 64, px = 2, E = this.SITE_EARTH;
    const c = document.createElement('canvas'); c.width = c.height = side;
    const q = c.getContext('2d');
    const r = ART.rng(31 + sz * 7 + (shape.round ? 3 : 0) + ((shape.l * 61) | 0));
    const X0 = shape.l * side, X1 = shape.r * side;
    const Y0 = side * 0.08, Y1 = side * 0.97;
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const hw = (X1 - X0) / 2, hh = (Y1 - Y0) / 2;
    const cr = Math.min(hw, hh) * 0.35;                        // squared, not sharp — a dug edge
    // signed outside-ness of the plan, in px: <0 inside, >0 outside
    const out = (x, y) => {
      if (shape.round) {
        const dx = (x - cx) / hw, dy = (y - cy) / hh;
        return (Math.hypot(dx, dy) - 1) * Math.min(hw, hh);
      }
      const qx = Math.max(Math.abs(x - cx) - (hw - cr), 0);
      const qy = Math.max(Math.abs(y - cy) - (hh - cr), 0);
      const inx = Math.min(hw - Math.abs(x - cx), hh - Math.abs(y - cy));
      return qx || qy ? Math.hypot(qx, qy) - cr : -Math.min(inx, cr);
    };
    for (let y = 0; y < side; y += px) for (let x = 0; x < side; x += px) {
      const o = out(x + 1, y + 1);
      if (o > (r() - 0.7) * 5) continue;                       // ragged clod edge, never a stamp
      q.fillStyle = o > -4 ? E[1] : (x * 7 + y * 13) % 23 === 0 ? E[3] : E[2];
      q.fillRect(x, y, px, px);
    }
    // trodden dark patches and scattered clods
    for (let i = 0; i < 8 + sz * 6; i++) {
      q.fillStyle = i % 3 ? E[0] : E[1];
      q.fillRect(((cx + (r() - 0.5) * hw * 1.6) / px | 0) * px,
        ((cy + (r() - 0.5) * hh * 1.6) / px | 0) * px, px * (1 + (i % 2)), px);
    }
    for (let i = 0; i < 6 + sz * 4; i++) {                     // lit crumbs
      q.fillStyle = E[4];
      q.fillRect(((cx + (r() - 0.5) * hw * 1.7) / px | 0) * px,
        ((cy + (r() - 0.5) * hh * 1.7) / px | 0) * px, px, px);
    }
    /* a little still grass: erase tongues and nicks so the LIVE terrain
       grows through — clearing a plot is a morning's work, not a stamp */
    q.globalCompositeOperation = 'destination-out';
    q.fillStyle = '#000';
    for (let i = 0; i < 3 + sz * 2; i++) {
      const gx = cx + (r() - 0.5) * hw * 1.5, gy = cy + (r() - 0.5) * hh * 1.5;
      const gr = (2 + r() * 3) * px;
      q.beginPath(); q.ellipse(gx, gy, gr, gr * 0.7, 0, 0, Math.PI * 2); q.fill();
      q.fillRect(gx - px, gy - gr * 0.7 - px, px, px);         // a stray tuft at the tongue's tip
    }
    for (let i = 0; i < 8 + sz * 6; i++)                       // single-cell nicks
      q.fillRect(((cx + (r() - 0.5) * hw * 1.9) / px | 0) * px,
        ((cy + (r() - 0.5) * hh * 1.9) / px | 0) * px, px, px);
    q.globalCompositeOperation = 'source-over';
    return this._siteCache[ck] = c;
  },
  // stage 0 — the cleared site: the pad, the plot staked and corded, the
  // tools down and the tier's first deliveries by the edge
  siteOf(key, sz, tier) {
    const ck = key + ':' + sz + ':' + tier;
    if (this._siteCache[ck]) return this._siteCache[ck];
    const side = sz * 64, px = 2, N = side / px;               // N cells on a side
    const c = document.createElement('canvas'); c.width = c.height = side;
    const q = c.getContext('2d');
    q.drawImage(this.padOf(sz, this.padShape(key, tier)), 0, 0);
    const W = ART.PALETTE.wood, ST = ART.PALETTE.stone, TH = ART.PALETTE.thatch, BO = ART.PALETTE.bone;
    const DK = '#2c1c10';                                       // the props' own dark edge
    // every prop sits on a one-cell dark under-shadow, or it sinks into the pad
    const h = (x, y, w, ht, col) => { q.fillStyle = col; q.fillRect(x * px, y * px, (w || 1) * px, (ht || 1) * px); };
    const sh = (x, y, w, ht) => h(x - 0.5, y + 0.5, (w || 1) + 1, ht || 1, 'rgba(30,18,10,0.5)');
    let sd = 5; for (let i = 0; i < key.length; i++) sd = (sd * 31 + key.charCodeAt(i)) >>> 0;
    const r = ART.rng(sd % 997), j = () => ((r() * 5) | 0) - 2; // per-key jitter, so two sites differ
    const s = N / 32;                                           // prop-position scale
    // corner stakes + the taut cord squaring the plot
    const m = (4 * s) | 0;
    for (const [kx, ky] of [[m, m], [N - m - 1, m], [m, N - m - 1], [N - m - 1, N - m - 1]]) {
      h(kx, ky - 2, 1, 3, W[2]); h(kx, ky - 2, 1, 1, W[3] || W[2]);
      h(kx, ky + 1, 1, 0.5, DK);
    }
    q.fillStyle = TH[3]; q.globalAlpha = 0.8;
    q.fillRect(m * px, m * px, (N - 2 * m) * px, 1); q.fillRect(m * px, (N - m - 1) * px, (N - 2 * m) * px, 1);
    q.fillRect(m * px, m * px, 1, (N - 2 * m) * px); q.fillRect((N - m - 1) * px, m * px, 1, (N - 2 * m) * px);
    q.globalAlpha = 1;
    // a pile of rough poles laid ready — the biggest thing on the site.
    // LOGS, not lumber (the design review): dark log-brown bodies, uneven
    // lengths, and a round butt at each end — a dark ring around a pale core
    const pll = (12 * s) | 0;
    const plx = ((N - pll) / 3 | 0) + j(), ply = ((22 * s) | 0) + j();
    sh(plx, ply + 5 * s | 0, pll, 1);
    for (let i = 0; i < (sz >= 2 ? 4 : 3); i++) {
      const py2 = ply + i * 2, ind = (i % 2) * 2;               // staggered like a real stack
      const len = pll - (i % 3);                                // no two poles the same length
      h(plx + ind, py2, len, 2, W[1]); h(plx + ind, py2, len, 1, W[2]);
      h(plx + ind, py2, 1, 2, W[0]); h(plx + ind, py2 + 0.5, 0.5, 1, BO[2]);   // ringed butt, pale core
      h(plx + ind + len - 1, py2, 1, 2, W[0]);
      h(plx + ind + len - 1, py2 + 0.5, 0.5, 1, BO[1]);
    }
    // a wooden spade stuck upright by the dig
    const spx = ((24 * s) | 0) + j(), spy = ((5 * s) | 0) + Math.abs(j());
    const spl = (7 * s) | 0;
    sh(spx - 1, spy + spl + 2, 4, 1);
    h(spx, spy, 1, spl, W[2]); h(spx, spy, 0.5, spl, W[3]);
    h(spx - 1, spy + spl, 3, 3, W[2]); h(spx - 1, spy + spl, 3, 1, W[3]);
    h(spx - 1, spy + spl + 2, 3, 1, DK);
    // a woven basket
    const bx2 = ((24 * s) | 0) + j(), by2 = ((22 * s) | 0) + j(), bw2 = Math.max(4, (5 * s) | 0);
    sh(bx2, by2 + 3 * s | 0, bw2, 1);
    for (let i = 0; i < (3 * s | 0); i++) h(bx2, by2 + i, bw2, 1, i % 2 ? TH[1] : TH[2]);
    h(bx2, by2, bw2, 1, TH[3]);
    h(bx2 - 1, by2 + 1, 1, (2 * s) | 0, TH[1]); h(bx2 + bw2, by2 + 1, 1, (2 * s) | 0, TH[0]);
    // the bigger plots get the antler pick too
    if (sz >= 2) {
      const ax = ((10 * s) | 0) + j(), ay = ((8 * s) | 0) + Math.abs(j());
      sh(ax, ay + 1, 7, 1);
      h(ax, ay, 6, 1, BO[1]); h(ax, ay, 6, 0.5, BO[2]);        // the beam
      h(ax + 1, ay - 2, 1, 2, BO[2]); h(ax + 4, ay - 3, 1, 3, BO[1]);   // tines, uneven
      h(ax + 5, ay - 2, 1, 1, BO[2]);
      h(ax, ay, 1, 1, BO[0]);                                  // the burr end, darkest
    }
    // the tier's deliveries: more poles at 1, fieldstones at 2, drystone at 3
    const dx2 = ((4 * s) | 0) + Math.abs(j()), dy2 = ((6 * s) | 0) + Math.abs(j());
    if (tier >= 3) {
      const sw = (6 * s) | 0;
      sh(dx2, dy2 + 4, sw, 1);
      for (let i = 0; i < 4; i++) { h(dx2 + (i % 2), dy2 + i, sw - i, 1, ST[i % 2 ? 2 : 1]); }
      h(dx2, dy2, sw, 0.5, ST[3]);
    } else if (tier === 2) {
      sh(dx2, dy2 + 3, 7 * s | 0, 1);
      for (const [fx, fy, fw] of [[0, 1, 3], [3, 0, 3], [6, 1, 3], [1.5, 2.5, 4]]) {
        h(dx2 + fx * s, dy2 + fy * s, fw * s * 0.7, 2 * s * 0.8, ST[(fx + fy) % 2 ? 2 : 1]);
        h(dx2 + fx * s, dy2 + fy * s, fw * s * 0.7, 1, ST[3]);
      }
    } else {
      const ph2 = (7 * s) | 0;
      sh(dx2, dy2 + ph2, 5, 1);
      h(dx2, dy2, 2, ph2, W[1]); h(dx2, dy2, 1, ph2, W[2]);
      h(dx2, dy2, 2, 1, W[0]); h(dx2 + 0.5, dy2, 1, 0.5, BO[2]);   // ringed butt
      h(dx2 + 3, dy2 + 1, 2, ph2 - 2, W[1]);
      h(dx2 + 3, dy2 + 1, 2, 1, W[0]); h(dx2 + 3.5, dy2 + 1, 1, 0.5, BO[1]);
    }
    return this._siteCache[ck] = c;
  },
  // stage 1 — the framing, traced from the target sprite's own silhouette
  frameOf(base, tier, roof, round) {
    const e = this._stageEntry(base);
    const k = 'frame' + tier + (roof ? 'r' : '') + (round ? 'o' : '');
    if (e[k]) return e[k];
    const W = base.width, H = base.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const q = c.getContext('2d');
    const box = this._artBox(base);
    const px = Math.max(2, Math.round(W / 32));                 // one frame-cell
    const WD = ART.PALETTE.wood, ST = ART.PALETTE.stone;
    const LASH = '#3a2a18';
    const l = Math.round(box.l * W), rgt = Math.round(box.r * W);
    const top = Math.round(box.t * H), bot = Math.round(box.b * H);
    const bw = rgt - l, bh = bot - top;
    if (round) {
      /* A ROUNDHOUSE FRAME: a ring of posts on the footprint's oval, a bent
         ring-beam at the wall head, cone rafters lashed to the apex — the
         skeleton of the conical hut the finished art shows, never a box. */
      const cx2 = (l + rgt) / 2, ex = bw / 2 - px;
      const eyR = Math.max(px * 2, bh * 0.10);
      const baseY = bot - px - eyR, headY = Math.round(top + bh * 0.52);
      const apexY = Math.round(top + bh * 0.10);
      const cell = (x, y, col) => { q.fillStyle = col; q.fillRect(Math.round(x), Math.round(y), px, px); };
      // the wall-head RING, stepped around the full oval
      for (let i = 0; i < 40; i++) {
        const a2 = (i / 40) * Math.PI * 2;
        cell(cx2 + Math.cos(a2) * ex * 0.86 - px / 2, headY + Math.sin(a2) * eyR - px / 2,
          Math.sin(a2) > 0 ? WD[3] : WD[2]);
      }
      // posts on the front arc, rising from the ground oval to the ring
      const posts = [];
      for (let i2 = 0; i2 < 5; i2++) {
        const a2 = (i2 / 4) * Math.PI;                     // 0..π: the visible half
        const x = cx2 + Math.cos(a2) * ex * 0.86 - px / 2;
        const y0 = baseY + Math.sin(a2) * eyR;
        q.fillStyle = WD[2]; q.fillRect(Math.round(x), headY, px, Math.round(y0 - headY) + px);
        q.fillStyle = WD[4] || WD[3]; q.fillRect(Math.round(x), headY, Math.max(1, px >> 1), Math.round(y0 - headY) + px);
        q.fillStyle = LASH; q.fillRect(Math.round(x) - 1, headY, px + 2, Math.max(2, px >> 1));
        posts.push(x);
      }
      // cone rafters from the ring up to the lashed apex
      for (const x of posts) {
        const steps = Math.max(3, Math.round(Math.abs(cx2 - x) / px) + 2);
        for (let i2 = 0; i2 <= steps; i2++)
          cell(x + (cx2 - px / 2 - x) * (i2 / steps), headY - (headY - apexY) * (i2 / steps), WD[2]);
      }
      q.fillStyle = LASH; q.fillRect(Math.round(cx2 - px), apexY - 1, px * 2, Math.max(2, px >> 1) + 1);
      q.fillStyle = ART.PALETTE.thatch[3]; q.fillRect(Math.round(cx2 - px / 2), apexY, 1, 1);
      // the tier-2/3 kinds are never round today, but keep the footing honest
      if (tier >= 2) for (let i = 0; i < 40; i++) {
        const a2 = (i / 40) * Math.PI;
        cell(cx2 + Math.cos(a2) * ex * 0.9 - px / 2, baseY + Math.sin(a2) * eyR, ST[i % 2 ? 2 : 1]);
      }
      try { ART.outline(c, px >= 4 ? 2 : 1); } catch (_) { }
      c._cfArt = base._cfArt;
      return e[k] = c;
    }
    const plateY = Math.round(top + bh * (roof ? 0.42 : 0.5));
    const beam = (y, col, lit) => {
      q.fillStyle = col; q.fillRect(l, y, bw, px);
      q.fillStyle = lit; q.fillRect(l, y, bw, Math.max(1, px >> 1));
    };
    // uprights: poles at tiers 1–2, drystone piers at 3
    const nPost = Math.max(2, Math.min(6, Math.round(bw / (px * 7))));
    const posts = [];
    for (let i = 0; i < nPost; i++) posts.push(Math.round(l + (bw - px) * (i / (nPost - 1))));
    const LIT = WD[4] || WD[3];        // the frame must stand OFF the dark pad
    for (const x of posts) {
      if (tier >= 3) {
        const pw = Math.round(px * 1.5);
        for (let y = bot - px; y >= plateY; y -= px) {
          q.fillStyle = ST[((y / px) | 0) % 2 ? 3 : 2]; q.fillRect(x - ((pw - px) >> 1), y, pw, px);
        }
        q.fillStyle = ST[3]; q.fillRect(x - ((pw - px) >> 1), plateY, pw, Math.max(1, px >> 1));
      } else {
        q.fillStyle = WD[2]; q.fillRect(x, plateY, px, bot - plateY);
        q.fillStyle = LIT; q.fillRect(x, plateY, Math.max(1, px >> 1), bot - plateY);
      }
    }
    // sill along the ground, wall plate on the post-tops, a mid rail
    beam(bot - px, WD[1], WD[2]);
    beam(plateY, WD[2], LIT);
    beam(Math.round((plateY + bot) / 2), WD[2], WD[3]);
    // two diagonal braces stepped between the outer bays
    const brace = (x0, x1) => {
      const steps = Math.max(2, Math.round(Math.abs(x1 - x0) / px));
      for (let i = 0; i <= steps; i++) {
        q.fillStyle = WD[2];
        q.fillRect(Math.round(x0 + (x1 - x0) * (i / steps)),
          Math.round(bot - px - (bot - px - plateY) * (i / steps)), px, px);
      }
    };
    if (posts.length >= 2) { brace(posts[0] + px, posts[1]); brace(posts[posts.length - 1] - px, posts[posts.length - 2]); }
    // rope lashings at every post/beam joint (a drystone pier needs none)
    if (tier < 3) for (const x of posts) for (const y of [plateY, bot - px]) {
      q.fillStyle = LASH; q.fillRect(x - 1, y - 1, px + 2, Math.max(2, px >> 1) + 1);
      q.fillStyle = ART.PALETTE.thatch[3]; q.fillRect(x + (px >> 1), y, 1, 1);
    }
    // the tier-2 frame stands on a fieldstone footing course
    if (tier === 2) for (let x = l; x < rgt; x += Math.round(px * 1.6)) {
      const fw = Math.round(px * (1.2 + ((x / px) % 2) * 0.6));
      q.fillStyle = ST[((x / px) | 0) % 2 ? 2 : 1]; q.fillRect(x, bot - px, Math.min(fw, rgt - x), px);
      q.fillStyle = ST[3]; q.fillRect(x, bot - px, Math.min(fw, rgt - x), Math.max(1, px >> 1));
    }
    if (roof) {
      // the roof to come: king post, ridge pole, and two stepped rafters
      const midX = Math.round(l + bw / 2 - px / 2), ridgeY = Math.round(top + bh * 0.16);
      q.fillStyle = WD[1]; q.fillRect(midX, ridgeY, px, plateY - ridgeY);
      q.fillStyle = WD[3]; q.fillRect(midX, ridgeY, Math.max(1, px >> 1), plateY - ridgeY);
      const rl = Math.round(l + bw * 0.18), rr2 = Math.round(rgt - bw * 0.18);
      q.fillStyle = WD[2]; q.fillRect(rl, ridgeY, rr2 - rl, px);
      q.fillStyle = WD[3]; q.fillRect(rl, ridgeY, rr2 - rl, Math.max(1, px >> 1));
      const rafter = (x0) => {
        const steps = Math.max(3, Math.round(Math.abs(midX - x0) / px));
        for (let i = 0; i <= steps; i++) {
          q.fillStyle = WD[2];
          q.fillRect(Math.round(x0 + (midX - x0) * (i / steps)),
            Math.round(plateY - (plateY - ridgeY - px) * (i / steps)), px, px);
        }
      };
      rafter(posts[0]); rafter(posts[posts.length - 1]);
      q.fillStyle = LASH; q.fillRect(midX - 1, ridgeY, px + 2, Math.max(2, px >> 1));
    }
    try { ART.outline(c, px >= 4 ? 2 : 1); } catch (_) { /* never tainted, but stay safe */ }
    c._cfArt = base._cfArt;   // a PNG's frame lands where its finished art will
    return e[k] = c;
  },
  /* stage 2 — the partial build: the target sprite with its top taken off,
     pale fresh-cut ends along the break, post stubs above it. A FLAT kind (a
     yard, a field, a dug pit — anything stageRoof frames flat) has no wall
     line to cut: it keeps much more of itself (the work is horizontal) and
     never wears the stub row — pale ends over a pit mouth read as teeth. */
  partialOf(base, flat) {
    const e = this._stageEntry(base);
    const ck = 'partial' + (flat ? 'f' : '');
    if (e[ck]) return e[ck];
    const W = base.width, H = base.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const q = c.getContext('2d'); q.imageSmoothingEnabled = false;
    q.drawImage(base, 0, 0);
    const box = this._artBox(base);
    const px = Math.max(2, Math.round(W / 32));
    const cutY = Math.round((box.t + (box.b - box.t) * (flat ? 0.28 : 0.45)) * H);
    // which columns still hold wall at the cut — read before the erase, so
    // the pale ends land on real material (taint → an even dashed band).
    // For a flat kind the end is drawn only where the material is BRIGHT
    // (timber, straw): a dark pit mouth stays a pit mouth.
    let cols = null;
    try {
      const d = q.getImageData(0, 0, W, H).data;
      cols = [];
      for (let x = 0; x < W; x += px) {
        let hit = false, bright = false;
        for (let xx = x; xx < Math.min(W, x + px) && !hit; xx++) {
          const i2 = ((cutY + px) * W + xx) * 4;
          if (d[i2 + 3] > 40) { hit = true; bright = d[i2] + d[i2 + 1] + d[i2 + 2] > 260; }
        }
        cols.push(hit && (!flat || bright));
      }
    } catch (_) { /* tainted — the dashed band stands in (roofed only) */ }
    q.globalCompositeOperation = 'destination-out';
    q.fillStyle = '#000';                                       // FULL-alpha eraser (the ruinOf lesson)
    q.fillRect(0, 0, W, cutY);
    q.globalCompositeOperation = 'source-over';
    const lpx = Math.round(box.l * W), rpx = Math.round(box.r * W);
    const PALE = '#e0d0a0', PALE2 = '#c4ae7e', DARKW = '#503020';
    let stub = 0;
    for (let x = lpx, i = 0; x < rpx; x += px, i++) {
      const hit = cols ? cols[(x / px) | 0] : (!flat && i % 2 === 0);
      if (!hit) continue;
      // the fresh-cut end — alternating pale tones, 1–2 cells deep
      q.fillStyle = i % 2 ? PALE : PALE2;
      q.fillRect(x, cutY, px, px * (1 + (i % 3 === 0 ? 1 : 0)));
      // every few bays a post stub still stands proud of the cut (walls only)
      if (!flat && ++stub % 5 === 0) {
        q.fillStyle = DARKW; q.fillRect(x, cutY - px * 3, px, px * 3);
        q.fillStyle = PALE; q.fillRect(x, cutY - px * 3, px, Math.max(1, px >> 1));
      }
    }
    c._cfArt = base._cfArt;
    return e[ck] = c;
  },
  // the panel's work-site icon takes the same routing the map draw does
  stageIcon(b) {
    const stage = Bld.stageOf(b), up = b.upgrading > 0, tgt = up ? b.level + 1 : b.level;
    // the wonder before the bespoke check, same order as the map draw: its
    // shared masons' stages stop at wonderBuild2, and the last third is the
    // monument's own art (tests/wonder.mjs)
    if (b.key === 'wonder')
      return stage < 2 ? Sprites.misc['wonderBuild' + (stage + 1)] : this.bldSprite(b, tgt);
    if (b.key === 'dock' && Sprites.dockBuildFace)
      return Sprites.dockBuildFace[Bld.dockShore(b)][stage];
    if (Sprites.misc[b.key + 'Build1'])
      return Sprites.misc[b.key + (up ? 'Up' : 'Build') + (stage + 1)];
    // a fortification's bldSprite is its auto-tiled mask — the wrong picture
    // for a panel; derive from the straight-run preview instead
    const fam = (b.key === 'wall' || b.key === 'gate') ? Sprites.building[b.key] : null;
    const base = fam ? fam[Math.min(tgt, fam.length) - 1] : this.bldSprite(b, tgt);
    const bs = Bld.size(b), tier = Math.min(3, tgt);
    if (stage === 0) return this.siteOf(b.key, bs, tier);
    if (stage === 1) return this.frameOf(base, tier, this.stageRoof(b.key, tgt), this.stageRound(b.key, tgt));
    return this.partialOf(base, !this.stageRoof(b.key, tgt));
  },

  /* ---- BURNING BUILDINGS (tests/burn-down.mjs) ----
     A damaged building shows its destruction in thirds (Bld.burnPhase):
       phase 0  small fires, the building itself untouched
       phase 1  bigger fires, the sprite scorched DARKER (darkOf)
       phase 2  a partially-DESTROYED look (ruinOf: roofline bitten out,
                remains charred), the fires guttering small again
     Variants are generated lazily per base canvas and cached in a WeakMap,
     so every building level, the rival's red set, and even wall/gate
     auto-tile masks get their scorched and ruined selves for free. */
  _burnCache: new WeakMap(),
  _burnEntry(base) {
    let e = this._burnCache.get(base);
    if (!e) { e = {}; this._burnCache.set(base, e); }
    return e;
  },
  darkOf(base) {
    const e = this._burnEntry(base);
    if (e.dark) return e.dark;
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';        // scorch ONLY the sprite's own pixels
    g.fillStyle = 'rgba(28,18,10,0.34)';
    g.fillRect(0, 0, c.width, c.height);
    const r = ART.rng(base.width * 7 + base.height);   // soot licks climbing from openings
    g.fillStyle = 'rgba(15,10,6,0.45)';
    for (let i = 0; i < Math.max(4, c.width >> 4); i++) {
      const sx = r() * c.width, sh = (0.2 + r() * 0.3) * c.height;
      g.fillRect(sx, r() * c.height * 0.5, Math.max(2, c.width * 0.03), sh);
    }
    c._cfArt = base._cfArt;   // a burning PNG building keeps its anchoring
    return e.dark = c;
  },
  ruinOf(base) {
    const e = this._burnEntry(base);
    if (e.ruin) return e.ruin;
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-atop';        // char what still stands
    g.fillStyle = 'rgba(24,15,8,0.48)';
    g.fillRect(0, 0, c.width, c.height);
    const r = ART.rng(base.width * 13 + base.height * 3);
    // BITE the structure apart — collapsed chunks torn out, biased hard to
    // the top half so the roofline reads fallen while the base still stands.
    // Bite ADAPTIVELY: keep tearing until the silhouette has measurably
    // shrunk (a dense full-tile mask needs more bites than an airy sprite).
    const count = (cv) => {
      try {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
        return n;
      } catch (_) { return null; }   // asset-pack image taint — bite blind
    };
    const before = count(c);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';                              // FULL-alpha eraser — a translucent one only singes
    g.fillRect(0, 0, c.width, c.height * 0.12);        // the very crown is always gone
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < Math.max(5, c.width >> 4); i++) {
        const bw = c.width * (0.05 + r() * 0.09), bh = c.height * (0.06 + r() * 0.12);
        g.fillRect(r() * (c.width - bw), r() * c.height * (i % 3 ? 0.4 : 0.7), bw, bh);
      }
      const now = count(c);
      if (before === null || now === null || now <= before * 0.87) break;
    }
    // charred rafter stubs and embers ON the remains (source-atop — the
    // wounds stay open; ruin must always read as LESS building, never more)
    g.globalCompositeOperation = 'source-atop';
    const AF = ART.PALETTE.fire;
    for (let i = 0; i < Math.max(3, c.width >> 5); i++) {
      const sx = (0.15 + r() * 0.7) * c.width, sy = (0.1 + r() * 0.3) * c.height;
      g.fillStyle = '#241a10';
      g.fillRect(sx, sy, Math.max(2, c.width * 0.025), (0.1 + r() * 0.12) * c.height);
      if (r() < 0.7) { g.fillStyle = AF[0]; g.fillRect(sx + 1, sy + 2, 2, 2); }
    }
    g.globalCompositeOperation = 'source-over';
    c._cfArt = base._cfArt;   // a ruined PNG building keeps its anchoring too
    return e.ruin = c;
  },

  // the animated fires themselves, planted on the roof and at the foot of the
  // building; count and size follow the phase (small → BIG → small)
  /* ---- A TOWER DOESN'T BLAZE, IT CRUMBLES (tests/burn-down.mjs) ----
     There is next to nothing in a stone shaft to burn: what a battered tower
     does is SHED ITSELF. Small fires only (never the big roof blaze a timber
     hall gets), and the real signal is masonry spalling off the shaft and
     falling to the ground — each stone on its own falling cycle, seeded from
     the building id so it is deterministic per tower rather than jittering
     every frame, dust puffing where it breaks loose and again where it
     lands, and a rubble heap at the foot that grows with each third. The
     sprite phases underneath (scorched → part-destroyed) are unchanged. */
  drawTowerCrumble(g, b, bx, by, bw, ph) {
    const now = performance.now() / 1000;
    const ST = ART.PALETTE.stone;
    const hsh = (n) => ((((b.id * 2654435761 + n * 97531) >>> 0) >>> 5) % 1000) / 1000;
    const px = bw / 32, ground = 0.86;                  // one sprite-pixel; the foot of the shaft
    // --- rubble already down, banked around the base ---
    const piles = [2, 4, 7][ph];
    for (let i = 0; i < piles; i++) {
      const rx = bx + (0.22 + hsh(i + 40) * 0.56) * bw;
      const ry = by + (ground + hsh(i + 60) * 0.05) * bw;
      const w = (1 + (i % 3)) * px;
      g.fillStyle = i % 3 ? ST[1] : ST[2];
      g.fillRect(rx, ry, w * 2, w);
      g.fillStyle = ST[0];
      g.fillRect(rx, ry + w, w * 2, Math.max(1, w * 0.6));
    }
    /* --- stones breaking loose and falling. They tear off the SHAFT'S EDGE
       and fall clear of it, alternating sides: a grey stone dropping down a
       grey wall is invisible, and real spalling sheds away from the face
       anyway. Each carries a dark edge so it reads against grass and stone
       alike. --- */
    const live = [2, 3, 5][ph];
    for (let i = 0; i < live; i++) {
      const s = hsh(i);
      const period = 1.2 + s * 1.1;
      const t = ((now + s * 9) % period) / period;      // 0..1 through this stone's fall
      const left = i % 2 === 0;
      const x0 = left ? 0.30 - hsh(i + 10) * 0.04 : 0.70 + hsh(i + 10) * 0.04;
      const y0 = 0.26 + hsh(i + 20) * 0.30;             // from the upper shaft
      const out = (0.04 + hsh(i + 30) * 0.06) * (left ? -1 : 1);   // shed away from the face
      const fx = bx + (x0 + out * t) * bw;
      const fy = by + (y0 + (ground - y0) * t * t) * bw;   // gravity, not a drift
      const w = px * (i % 2 ? 2.4 : 1.6);                // chips of masonry, not boulders
      if (t < 0.10) {                                    // the spall: dust where it tears away
        g.globalAlpha = 0.55 * (1 - t / 0.10);
        g.fillStyle = ST[3];
        g.fillRect(bx + x0 * bw - px, by + y0 * bw, px * 3, px * 2);
        g.globalAlpha = 1;
      }
      if (t > 0.93) {                                    // it lands: a low puff, no stone
        g.globalAlpha = 0.5 * (1 - (t - 0.93) / 0.07);
        g.fillStyle = ST[2];
        g.fillRect(fx - px * 2, by + ground * bw, px * 5, px);
        g.globalAlpha = 1;
        continue;
      }
      g.fillStyle = ART.PALETTE.ink[0];                            // dark edge, so it always reads
      g.fillRect(fx - px * 0.4, fy - px * 0.4, w + px * 0.8, w + px * 0.8);
      g.fillStyle = ST[1]; g.fillRect(fx, fy, w, w);               // the chip
      g.fillStyle = ST[3]; g.fillRect(fx, fy, w, w * 0.5);         // its lit top face
      if (t > 0.3) {                                     // dust trailing the fall
        g.globalAlpha = 0.28;
        g.fillStyle = ST[2];
        g.fillRect(fx + w * 0.25, fy - w * 2, w * 0.5, w * 1.6);
        g.globalAlpha = 1;
      }
    }
    // --- and a little fire, never a blaze ---
    const beat = (performance.now() / 130) | 0;
    const fires = ph === 1 ? [[0.40, 0.42], [0.62, 0.66]] : [[0.52, 0.55]];
    for (let i = 0; i < fires.length; i++) {
      const sz = 0.3 * bw;
      Assets.drawSprite(g, 'misc/flameSmall/' + ((beat + i * 2 + b.id) % 4),
        bx + fires[i][0] * bw - sz / 2, by + fires[i][1] * bw - sz * 0.9, { w: sz, h: sz });
    }
  },

  /* ============ THE STAND COMES DOWN (tests/tree-fall.mjs) ============
     Felling a wood is the most-watched work in the early game, and until now
     its payoff was a tile POPPING from canopy to stumps between two frames.
     A tree that falls is the same trade the tower's collapse makes: a second
     of animation for a minute of work.

     The frames are CUT FROM THE TILE'S OWN FOREST ART, exactly the way
     collapseSheet cuts a tower out of its sprite — so every one of the eight
     forest variants, all three densities, the rare character tiles and a
     dropped-in `assets/terrain/forest.png` override all topple for free, with
     no art authored and nothing to keep in sync. The stand pivots about the
     tile's own GROUND LINE (its bottom edge) rather than a break part way up:
     a tree comes out of the earth, a tower snaps.

     Three rules it shares with the rest of the effects layer: it is FOG-GATED
     at the trigger (timber nobody can see is drawn for nobody), it is CAPPED
     (a sapper clearing a lane is a scene, not a whiteout), and it lives on R
     and NEVER in a save — same rule as R.collapses and R._fighting.

     It fires from the ONE place a wood actually leaves a tile: the gather
     task's exhaustion branch in units.js, and Terraform.clear. Owner-agnostic
     — the rival fells timber too, and its woods fall the same way. */
  TREEFALL: { frames: 10, ms: 1150, lean: 1.45 },
  // how much roomier than the tile a fall frame is: a 32px stand lying flat
  // reaches a whole tile to the side, and the dust rolls out past its crown
  TREEFALL_PAD: { w: 2.6, h: 1.75, x: 0.8, y: 0.55 },
  treefalls: [],                 // live one-shots: {x,y,spr,t,right} — never in S

  startTreeFall(x, y, byX, byY) {
    if (!G.visibleAt(x, y)) return;               // timber nobody can see
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    // it goes over AWAY from whoever felled it; with nobody standing there
    // (a sapper's cleared lane, a tile spent off screen) the tile decides
    const right = byX == null ? (h & 1) === 1 : byX < x + 0.5;
    /* THE INDIVIDUAL FALL (Gate B stand-down, part 4). With the wood
       world-stamped, the tile-sheet shear read as a deflating balloon —
       so an art tile fells its OWN trees: each stamp rotates about its
       trunk-base pivot toward the fall direction, ease-in (slow tip,
       fast crash), a canopy squash on impact, a few leaves off the
       crown — start frames hash-staggered so a stand crackles down
       rather than toppling in one motion. The layout is read BEFORE the
       tile flips to stumps, so the falling trees are exactly the
       standing ones. Procedural tiles (no catalog) keep the old shear. */
    if (this._stampMode() && !(window.Assets && Assets.terrainImg(T.FOREST, h >>> 3))
      && !this.forestRareAt(x, y, S.map.terrain)) {
      const trees = this.forestLayoutAt(x, y, S.map.terrain);
      if (trees.length) {
        for (const t of trees) {
          const h2 = (t.wx * 73856093 ^ t.wy * 19349663) >>> 0;
          let spr = Assets.treePiece(t.kind, t.pickRr, h2);
          if (!spr) {
            // the procedural fallback tree, rasterized once for its fall
            const w = t.rr * 2 + 10, hh2 = t.rr * 2 + 12;
            const c = document.createElement('canvas'); c.width = w; c.height = hh2;
            const g2 = c.getContext('2d');
            const f2 = (px2, py2, ww, ph, col) => { g2.fillStyle = col; g2.fillRect(px2, py2, (ww || 1), (ph || 1)); };
            Sprites.drawTree(f2, w >> 1, hh2 - t.rr - 3, t.rr, t.ramp, 'round');
            spr = c;
          }
          this.treefalls.push({ solo: 1, wx: t.wx, wy: t.wy, spr, right,
            t: -(((h2 >>> 6) % 25) / 100) });    // 0–0.24s hash stagger
        }
        if (this.treefalls.length > 60) this.treefalls.splice(0, this.treefalls.length - 60);
        this.startle(x + 0.5, y + 0.5, 7);
        return;
      }
    }
    const spr = (window.Assets && Assets.terrainImg(T.FOREST, h >>> 3))
      || this.forestSpriteAt(x, y, S.map.terrain);
    if (!spr || !spr.width) return;
    if (this.treefalls.length > 10) this.treefalls.shift();
    this.treefalls.push({ x, y, spr, t: 0, right });
    this.startle(x + 0.5, y + 0.5, 7);        // the crack throws the birds up
  },

  _fallCache: new WeakMap(),
  fallSheet(base, right) {
    let e = this._fallCache.get(base);
    if (!e) { e = {}; this._fallCache.set(base, e); }
    const key = right ? 'r' : 'l';
    if (e[key]) return e[key];
    const cfg = this.TREEFALL, N = cfg.frames, W = base.width, H = base.height;
    const PD = this.TREEFALL_PAD;
    const cw = Math.ceil(W * PD.w), ch = Math.ceil(H * PD.h);
    const ox = W * PD.x, oy = H * PD.y;
    const px = W / 32;                        // one authored pixel
    const Q = (v) => Math.round(v / px) * px;  // every particle on the pixel grid
    const gy = oy + H;                        // the tile's own ground line
    const pivX = ox + W * 0.5, sgn = right ? 1 : -1;
    const AP = ART.PALETTE, LF = AP.leaf, WDp = AP.wood, SO = AP.soil, INK = AP.ink;
    const sheet = [];
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;

      /* --- 1. EVERY TREE GOES OVER ABOUT ITS OWN FOOT. Rotating the tile's
         art rigidly about one pivot was the first thing tried and it is
         plainly wrong: what you see is a SQUARE OF FOREST SPINNING, because a
         rigid rotation moves a tree on the left of the tile through a
         completely different arc from one on the right, and it carries the
         tile's own edge round with it.

         The honest transform is a SHEAR. A source row keeps its x — so every
         trunk stays where it was rooted — and only its HEIGHT above the
         ground is projected: a row `hh` up lands `hh·sin θ` to the side and
         `hh·cos θ` above the ground line. That is each tree pivoting about
         its own base, all of them together, which is exactly what a stand
         being felled looks like. Rows are drawn top-first so the roots paint
         last and stay in front of the crown lying past them.

         The easing accelerates (a felled tree hangs on the hinge of uncut
         wood and then goes) but not so slowly that the first frames of a
         nine-frame sheet are spent standing still. --- */
      const ease = Math.min(1, Math.pow(p / 0.88, 1.55));
      const th = cfg.lean * ease, sn = Math.sin(th), cs = Math.cos(th);
      const gone = Math.max(0, (p - 0.84) / 0.16);   // …then it settles into the stumps
      if (gone < 1) {
        g.save();
        g.globalAlpha = 1 - gone * 0.9;
        const rowH = Math.max(1, Math.ceil(cs) + 1);
        for (let sy = 0; sy < H; sy++) {
          const hh = H - sy;                          // how far up the stand this row sits
          g.drawImage(base, 0, sy, W, 1,
            Math.round(ox + sgn * hh * sn), Math.round(gy - hh * cs), W, rowH);
        }
        g.restore();
      }

      /* --- 2. leaves and chips torn loose, thrown along the sweep --- */
      const rc = ART.rng(4211);
      for (let k = 0; k < 16; k++) {
        const a0 = rc(), a1 = rc(), a2 = rc(), a3 = rc();
        const t = (p - (0.16 + a0 * 0.42)) / 0.52;
        if (t <= 0 || t >= 1) continue;
        const reach = (0.25 + a1 * 0.85) * H;
        const fx = Q(pivX + sgn * reach * t);
        const fy = Q(gy - H * (0.25 + a2 * 0.5) * (1 - t) - H * 0.16 * 4 * t * (1 - t));
        g.globalAlpha = Math.min(1, (1 - t) * 1.6);
        g.fillStyle = a3 < 0.72 ? LF[1 + ((k % 3) | 0)] : WDp[2];
        g.fillRect(fx, fy, px, px);
      }
      g.globalAlpha = 1;

      /* --- 3. the DUST the crown throws when it lands. Pixel dust: quantized
         alpha in three steps, hard squares — the same language the placement
         and destruction poofs speak, never a smooth-graded balloon. --- */
      const land = Math.max(0, (p - 0.58) / 0.42);
      if (land > 0) {
        const rd = ART.rng(8677);
        for (let k = 0; k < 30; k++) {
          const b0 = rd(), b1 = rd(), b2 = rd();
          if (b0 > land * 1.2) continue;
          const along = (0.12 + b1 * 0.95) * H;
          const dx = Q(pivX + sgn * along + (b2 - 0.5) * px * 5);
          const dy = Q(gy - px * (1 + b2 * 5) * land);
          const a = 0.42 * (1 - land) + 0.12;
          g.globalAlpha = Math.round(a * 3) / 3;    // three steps, like the poof
          g.fillStyle = b2 < 0.4 ? SO[3] : b2 < 0.75 ? SO[2] : INK[1];
          g.fillRect(dx, dy, px * (1 + (k % 2)), px);
        }
        g.globalAlpha = 1;
      }
      sheet.push(c);
    }
    e[key] = sheet;
    return sheet;
  },

  drawTreeFalls(g, dt) {
    if (!this.treefalls.length) return;
    const TL = CFG.TILE, cfg = this.TREEFALL, PD = this.TREEFALL_PAD;
    for (let i = this.treefalls.length - 1; i >= 0; i--) {
      const f = this.treefalls[i];
      f.t += dt;
      if (f.solo) {
        /* the individual fall: pivot at the trunk base, ease-in rotation
           (slow tip, fast crash), a canopy squash on impact, a fade — and
           four leaf flecks off the crown as it lands. */
        const D = 1.05, SQ = 0.12, FADE = 0.3, tt = f.t;
        if (tt >= D + SQ + FADE) { this.treefalls.splice(i, 1); continue; }
        const dir = f.right ? 1 : -1;
        g.save();
        g.imageSmoothingEnabled = false;
        g.translate(f.wx, f.wy);
        if (tt <= 0) {
          g.drawImage(f.spr, -(f.spr.width >> 1), -f.spr.height);
        } else if (tt < D) {
          const p2 = tt / D;
          g.rotate(dir * (Math.PI / 2) * p2 * p2);
          g.drawImage(f.spr, -(f.spr.width >> 1), -f.spr.height);
        } else {
          const k2 = tt - D;
          const sq = k2 < SQ ? 1 - 0.22 * Math.sin(Math.PI * k2 / SQ) : 1;
          if (k2 > SQ) g.globalAlpha = Math.max(0, 1 - (k2 - SQ) / FADE);
          g.rotate(dir * Math.PI / 2);
          g.scale(1, sq);                        // the squash runs down the trunk axis
          g.drawImage(f.spr, -(f.spr.width >> 1), -f.spr.height);
          g.globalAlpha = 1;
        }
        g.restore();
        if (tt > D - 0.05 && tt < D + 0.4) {     // leaves and a puff of dust off the crash
          const lp = (tt - (D - 0.05)) / 0.45, h3 = (f.wx * 31 + f.wy * 17) >>> 0;
          g.globalAlpha = 0.9 * (1 - lp);
          for (let li = 0; li < 4; li++) {
            const sp = 3 + ((h3 >> (li * 2)) & 7);
            const lx = f.wx + dir * (f.spr.height * 0.6 + sp) + Math.sin(lp * 4 + li) * 2;
            const ly = f.wy - 4 - sp * 0.4 + lp * 7;
            g.fillStyle = li === 3 ? '#8a7f6a' : (li & 1 ? '#3c6f2d' : '#569244');
            g.fillRect(lx | 0, ly | 0, 1, 1);
          }
          g.globalAlpha = 1;
        }
        continue;
      }
      const p = f.t / (cfg.ms / 1000);
      if (p >= 1) { this.treefalls.splice(i, 1); continue; }
      const sheet = this.fallSheet(f.spr, f.right);
      const fr = sheet[Math.min(sheet.length - 1, (p * sheet.length) | 0)];
      // the art may be authored at any resolution (a supplied PNG is often
      // 64 or 128) — land it on the tile the same way blitTile would
      const k = TL / f.spr.width;
      g.drawImage(fr, f.x * TL - f.spr.width * PD.x * k, f.y * TL - f.spr.height * PD.y * k,
        fr.width * k, fr.height * k);
    }
  },

  /* ============ THE MUSTER HORN (tests/muster-horn.mjs) ============
     What a horn looks like from above: rings of sound going out over the
     village, and every bird in the valley leaving. Three waves of hard pixel
     dots (never a smooth stroked circle — the ground beneath them is drawn in
     hard steps and a soft ring reads as UI laid over the scene), fading as
     they widen. Render state only, like every other one-shot here. */
  HORN: { ms: 1600, rings: 3, reach: 12 },
  horns: [],
  startHorn(x, y) {
    if (this.horns.length > 3) this.horns.shift();
    this.horns.push({ x, y, t: 0 });
    this.startle(x, y, 11);
  },
  drawHorns(g, dt) {
    if (!this.horns.length) return;
    const TL = CFG.TILE, cfg = this.HORN, px = Math.max(2, Math.round(TL / 8));
    for (let i = this.horns.length - 1; i >= 0; i--) {
      const hn = this.horns[i];
      hn.t += dt;
      const p = hn.t / (cfg.ms / 1000);
      if (p >= 1) { this.horns.splice(i, 1); continue; }
      const cx = hn.x * TL, cy = hn.y * TL;
      for (let k = 0; k < cfg.rings; k++) {
        const q = (p - k * 0.17) / (1 - k * 0.17);
        if (q <= 0 || q >= 1) continue;
        const rad = cfg.reach * TL * Math.pow(q, 0.6);
        const a = (1 - q) * 0.6;
        if (a <= 0.03 || rad < px) continue;
        g.fillStyle = 'rgba(240,212,126,' + a.toFixed(2) + ')';
        const n = Math.max(16, Math.round(rad / px * 1.7));
        for (let sIdx = 0; sIdx < n; sIdx++) {
          const th = sIdx / n * Math.PI * 2;
          g.fillRect(Math.round((cx + Math.cos(th) * rad) / px) * px,
            Math.round((cy + Math.sin(th) * rad) / px) * px, px, px);
        }
      }
    }
  },

  /* ================= THE COLLAPSE (tests/burn-down.mjs) =================
     Burning is the long signal; the COLLAPSE is the payoff. When a building
     whose kind is registered below is DESTROYED it topples once, on screen,
     in its own cloud of dust — the reward for the minute of work it took to
     chew through a stone shaft.

     The registry is the whole extension point: put a key in R.COLLAPSE and
     that building gets a collapse, with no other code touched. Today only the
     TOWER has one — walls, gates and every other building come down exactly
     as they always did (they simply aren't in the table).

     Frames are CUT FROM THE BUILDING'S OWN SPRITE by default, not drawn by
     hand, so a collapse is free for every level, the rival's red set, and the
     mural tower's bonded self alike: the block above the break line rotates
     about the break, the stump below crumbles down after it, masonry is
     thrown clear, and dust rolls out along the ground and rises over the
     rubble. Sheets cache per base canvas — one generation per artwork.

     A kind that wants BESPOKE art instead just draws it, the same way the
     build stages do: sprites labelled `misc/<key>Fall1..N` take over the whole
     animation (R.COLLAPSE_ART). They are drawn over the same roomy canvas the
     generated frames use — COLLAPSE_PAD is the single source of truth for that
     geometry, so authored art and cut art land in exactly the same place.

     The live animations live on R and NEVER in S — same rule as R._fighting.
     A save file has no business remembering a puff of dust. */
  COLLAPSE: {
    // key → how that kind comes down.
    //   frames  how many looks the topple is cut into (5–10 reads as a fall)
    //   ms      how long the whole thing takes
    //   pivot   where the shaft SNAPS, as a fraction of the sprite's height
    //   lean    radians the toppling block sweeps through
    //   spread  how far the dust rolls, in sprite widths
    tower: { frames: 8, ms: 1500, pivot: 0.62, lean: 1.55, spread: 1.15 },
    /* A CAMP DOESN'T TOPPLE LIKE A TOWER — it comes apart. Hide, lashed poles
       and a skull standard have no masonry to swing over: the break is high
       (the standard and the lodge's crown go first), the lean is a short
       sideways slump rather than a felled trunk, and the debris spreads wide
       and low because what falls is light. Quicker than stone, too. */
    raidercamp: { frames: 7, ms: 1050, pivot: 0.34, lean: 0.85, spread: 1.35 },
  },
  // how much ROOMIER than the building's own footprint a collapse frame is —
  // shared by the generated sheet and by any authored `<key>Fall` art
  COLLAPSE_PAD: { w: 2.5, h: 1.6, x: 0.75, y: 0.45 },
  collapses: [],                 // live one-shots: {x,y,sz,spr,cfg,t,flip,art}
  marvel: null,                  // the wonder's held frame: {x,y,t,name,blurb} — never in S

  // does this kind carry hand-drawn collapse art? (returns the frame count)
  collapseArt(key, frames) {
    if (!Sprites.misc || !Sprites.misc[key + 'Fall1']) return 0;
    let n = 0;
    while (n < frames && Sprites.misc[key + 'Fall' + (n + 1)]) n++;
    return n;
  },

  startCollapse(b) {
    const cfg = this.COLLAPSE[b.key];
    if (!cfg) return;                              // this kind doesn't topple
    /* A WORK SITE HAS NOTHING TO TOPPLE. The collapse is cut from the
       BUILDING'S OWN SPRITE (bldSprite), and a site's sprite is the finished
       tower — so knocking down a half-raised shaft played the frame sequence
       staked plot → scaffold → a whole finished tower → the whole thing
       falling over, which is the building's life story run backwards in one
       second. A site simply stops being a site and leaves its rubble, the
       same way every other unfinished building dies. An UPGRADING tower is a
       standing tower and still comes down. */
    if (b.construction > 0) return;
    if (this.collapses.length > 12) this.collapses.shift();
    const TL = CFG.TILE, sz = Bld.size(b);
    /* THE GROUND KEEPS ITS FACE UNTIL THE TOWER IS DOWN. Bld.removeToRuin
       lays rubble the instant the building dies and bakes it straight into
       the terrain cache — so without this the brown scar appeared UNDER a
       tower that was still standing, giving the ending away a second early.
       (The ash pile is held back for the same reason — see collapseAt.)
       Snapshot the ground NOW, while it is still whole; drawCollapseGround
       stamps it back over the cache each frame until the topple ends. It
       rides on the one-shot, so like everything else here it never reaches a
       save. startCollapse must therefore keep running BEFORE removeToRuin. */
    let ground = null;
    if (this.terrainCache) {
      ground = document.createElement('canvas');
      ground.width = sz * TL; ground.height = sz * TL;
      ground.getContext('2d').drawImage(this.terrainCache,
        b.x * TL, b.y * TL, sz * TL, sz * TL, 0, 0, sz * TL, sz * TL);
    }
    this.collapses.push({
      x: b.x, y: b.y, sz, cfg, t: 0, key: b.key,
      spr: this.bldSprite(b),                      // snapshot: it's about to be gone
      art: this.collapseArt(b.key, cfg.frames),    // …unless this kind draws its own
      flip: (b.id & 1) === 1,                      // half the towers fall the other way
      ground,
    });
  },
  // the held ground, stamped straight after the terrain layer so bridges,
  // buildings, units and effects all still draw on top of it as normal
  drawCollapseGround(g) {
    const TL = CFG.TILE;
    for (const c of this.collapses) if (c.ground) g.drawImage(c.ground, c.x * TL, c.y * TL);
  },

  _collapseCache: new WeakMap(),
  collapseSheet(base, cfg) {
    let sheet = this._collapseCache.get(base);
    if (sheet) return sheet;
    const N = cfg.frames, W = base.width, H = base.height;
    // the frames are ROOMIER than the tile: the dust rolls out to either side
    // and rises well above where the crown used to be
    const PD = this.COLLAPSE_PAD;
    const cw = W * PD.w, ch = H * PD.h, ox = W * PD.x, oy = H * PD.y;
    const px = W / 32;                             // one sprite pixel
    const Q = (v) => Math.round(v / px) * px;      // keep every particle on the pixel grid
    const gy = oy + H * (30 / 32);                 // the ground line every fortification stands on
    const pivX = ox + W * 0.5, pivY = oy + H * cfg.pivot;
    const ST = ART.PALETTE.stone, RK = ART.PALETTE.rock, INK = ART.PALETTE.ink;
    const DUST = [ST[2], ST[3], RK[3], ST[4]];
    sheet = [];
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;

      /* --- 1. the block ABOVE the break, sweeping down about the break ---
         Squared easing, because a falling tower doesn't tip at a constant
         rate — it hangs, then goes. It shatters as it lands (`gone`), which
         is what hands the frame over to the rubble heap. */
      const ease = Math.min(1, Math.pow(p / 0.82, 1.8));
      const ang = cfg.lean * ease;                   // ~90° by the time it lands
      // …and it SLIDES DOWN the stump as it goes, so it finishes lying ON the
      // ground rather than pivoting in mid-air at the height of the break
      const drop = (gy - pivY) * Math.min(1, Math.pow(p / 0.85, 2));
      const gone = Math.max(0, (p - 0.84) / 0.16);   // only then does it break up
      if (gone < 1) {
        g.save();
        g.globalAlpha = 1 - gone;
        g.translate(pivX, pivY + drop);
        g.rotate(ang);
        g.translate(-pivX, -pivY);
        g.beginPath(); g.rect(0, 0, cw, pivY); g.clip();   // cut at the break line
        g.drawImage(base, ox, oy);
        g.restore();
      }

      /* --- 2. the STUMP still standing. It judders early (the shaft losing
         its footing) and then crumbles DOWN from the break to the ground. --- */
      const eaten = Math.min(1, Math.max(0, (p - 0.42) / 0.5));
      const stumpTop = pivY + (gy - pivY) * eaten;
      if (stumpTop < gy - px) {
        g.save();
        const jit = p > 0.05 && p < 0.5 ? (i % 2 ? px : -px) : 0;
        g.beginPath(); g.rect(0, stumpTop, cw, ch - stumpTop); g.clip();
        g.drawImage(base, ox + jit, oy);
        if (p > 0.2) {                               // and darkens as it breaks up
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = 'rgba(26,20,12,' + (0.45 * Math.min(1, (p - 0.2) * 2)).toFixed(2) + ')';
          g.fillRect(0, 0, cw, ch);
        }
        g.restore();
      }

      /* --- 3. masonry thrown clear. Each stone breaks loose on its own beat
         and flies a parabola from the break out to the ground. --- */
      const rc = ART.rng(9173);
      for (let k = 0; k < 13; k++) {
        const a0 = rc(), a1 = rc(), a2 = rc(), a3 = rc();
        const t = (p - (0.14 + a0 * 0.36)) / 0.58;
        if (t <= 0 || t >= 1) continue;
        const side = a1 < 0.42 ? -1 : 1;             // biased with the topple
        const fx = Q(pivX + side * (0.18 + a2 * 0.52) * W * t);
        const fy = Q(pivY - H * 0.05 + (gy - pivY) * t * t - H * (0.08 + a3 * 0.14) * 4 * t * (1 - t));
        const w = px * (1 + (k % 2));
        // a chip of masonry, not a die: dark under-edge only (so it still
        // reads flying over grass), stone body, one lit pixel on top
        g.fillStyle = INK[0]; g.fillRect(fx, fy + px * 0.5, w + px * 0.5, w);
        g.fillStyle = ST[1]; g.fillRect(fx, fy, w, w);
        g.fillStyle = ST[2]; g.fillRect(fx, fy, w, px * 0.5);
      }

      /* --- 4. the RUBBLE the tower becomes: a heap banked over its own
         footprint, growing from the moment the block lands. --- */
      const heap = Math.max(0, (p - 0.48) / 0.52);
      if (heap > 0) {
        const rr = ART.rng(5501);
        const hw = W * 0.34 * (0.6 + heap * 0.4);    // a MOUND: banked high in the
        for (let k = 0; k < 34; k++) {               // middle, thinning to nothing at its skirts
          const b0 = rr(), b1 = rr(), b2 = rr();
          if (b0 > heap * 1.25) continue;            // stones arrive as the heap builds
          const u = (b1 - 0.5) * 2;
          const crest = H * 0.21 * heap * (1 - u * u);
          const hx = Q(pivX + u * hw);
          const hy = Q(gy - px * 2 - crest * (0.25 + b2 * 0.75));
          const w = px * (1 + (k % 2));
          g.fillStyle = INK[0]; g.fillRect(hx, hy + px * 0.5, w * 2 + px * 0.5, w);
          g.fillStyle = k % 3 ? ST[1] : ST[2]; g.fillRect(hx, hy, w * 2, w);
          g.fillStyle = ST[3]; g.fillRect(hx, hy, w * 2, px * 0.5);
        }
      }

      /* --- 5. THE DUST. Half of it puffs off the shaft as it goes over; the
         rest bursts at the impact and ROLLS OUT ALONG THE GROUND, which is
         what a real collapse looks like. Blocky puffs, on the pixel grid,
         because everything else in this game is. --- */
      const rp = ART.rng(3121);
      for (let k = 0; k < 38; k++) {
        const d0 = rp(), d1 = rp(), d2 = rp(), d3 = rp();
        // even puffs come off the falling shaft, odd ones burst at the impact
        const birth = k % 2 ? 0.50 + d0 * 0.22 : 0.10 + d0 * 0.34;
        const t = (p - birth) / (1 - birth);
        if (t <= 0) continue;
        const side = d1 < 0.5 ? -1 : 1;
        const roll = Math.min(1, t * 1.3);
        const cx = Q(pivX + side * (0.12 + d2 * cfg.spread) * W * roll);
        const rise = (k % 2 ? 0.06 + d3 * 0.34 : 0.16 + d3 * 0.52) * H;
        const cy = Q(gy - rise * roll);
        const sz = Q(px * (1.8 + d3 * 3.2) * (0.6 + t * 1.4));
        // it thins as it drifts but never wipes clean — a haze still hangs
        // over the rubble on the last frame
        g.globalAlpha = Math.max(0, 0.30 * (1 - t * 0.86) * Math.min(1, t * 5));
        g.fillStyle = DUST[k % DUST.length];
        g.fillRect(cx - sz, cy - sz * 0.6, sz * 2, sz * 1.2);
        g.fillRect(cx - sz * 0.6, cy - sz, sz * 1.2, sz * 2);
        g.globalAlpha = 1;
      }
      // the low wash rolling out along the ground — the signature of a real
      // collapse, and the last thing to settle
      if (p > 0.45) {
        const wash = Math.min(1, (p - 0.45) / 0.25);
        for (let k = 0; k < 3; k++) {
          g.globalAlpha = 0.13 * wash * (1 - Math.max(0, (p - 0.66) / 0.5)) * (1 - k * 0.28);
          g.fillStyle = DUST[k];
          const ww = W * (0.45 + wash * (0.5 + k * 0.30));
          const wh = px * (3 + k * 3) * wash;
          g.fillRect(Q(pivX - ww), Q(gy - wh), Q(ww * 2), Q(wh));
        }
        g.globalAlpha = 1;
      }
      sheet.push(c);
    }
    this._collapseCache.set(base, sheet);
    return sheet;
  },

  /* ================= KEELING OVER (tests/mortality.mjs) =================
     A villager's time is up. Six frames, cut from THAT VILLAGER'S OWN sprite
     — so the tunic dye and the man/woman variants come along for free — of
     them going over: a stagger, the slow tip about their own heels, flat on
     the ground, and then gone, with a puff of dust where they land. The body
     disappears at the end of the sheet; the station they were standing at is
     simply empty from that moment.

     Frames are the SAME SIZE as an ordinary unit sprite, so they draw through
     the identical box at the identical offset (a figure lying flat is about
     as wide as it was tall, and both fit inside the 64px sheet). The live
     one-shots sit on R.deaths and never in S — same rule as R.collapses. */
  DEATH_FRAMES: 6,
  deaths: [],                    // live one-shots: {x,y,spr,t,flip}
  _deathCache: new WeakMap(),
  deathSheet(base) {
    let sheet = this._deathCache.get(base);
    if (sheet) return sheet;
    const N = this.DEATH_FRAMES, W = base.width, H = base.height;
    const px = W / 32;
    const pivX = W * 0.5, pivY = H * 0.82;      // their heels: what they turn about
    const ST = ART.PALETTE.stone, SO = ART.PALETTE.soil;
    sheet = [];
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      // the tip: a slow stagger, then over they go, faster as they fall
      const ang = 1.55 * Math.min(1, Math.pow(p / 0.82, 1.9));
      // they lie there plainly for a beat before fading — a body that starts
      // dissolving on the way down never reads as having LANDED
      const gone = Math.max(0, (p - 0.74) / 0.26);
      g.save();
      g.globalAlpha = 1 - gone;   // GONE by the last frame — only the dust is left
      g.translate(pivX, pivY);
      g.rotate(ang);
      g.translate(-pivX, -pivY);
      // a small sag as the knees give, so it isn't a rigid plank falling over
      g.drawImage(base, 0, Math.round(px * 2 * Math.sin(p * Math.PI)));
      g.restore();
      if (p > 0.45) {                            // dust where they come down
        const d = Math.min(1, (p - 0.45) / 0.35);
        const rr = ART.rng(97);
        for (let k = 0; k < 7; k++) {
          const s = rr(), side = k % 2 ? 1 : -1;
          const dx = pivX + side * (2 + s * 12) * d * px * 0.6;
          const dy = pivY + px * (1 + s * 2) - d * px * 3;
          g.globalAlpha = 0.5 * (1 - d) + 0.08;
          g.fillStyle = k % 3 ? SO[2] : ST[3];
          const sz = px * (1.6 + s * 2.2);
          g.fillRect(Math.round(dx - sz / 2), Math.round(dy), Math.round(sz), Math.round(px));
          g.globalAlpha = 1;
        }
      }
      sheet.push(c);
    }
    this._deathCache.set(base, sheet);
    return sheet;
  },
  startDeath(u) {
    if (this.deaths.length > 8) this.deaths.shift();
    this.deaths.push({
      x: u.x, y: u.y, t: 0,
      spr: this.unitSprite(u),                   // snapshot: they are about to be gone
      box: this.unitBox(u),                      // …at the kind's own draw box (the bear falls big)
      flip: (u.id & 1) === 1,                    // half of them fall the other way
    });
  },
  drawDeaths(g, dt) {
    const TL = CFG.TILE, ms = (CFG.MORTALITY && CFG.MORTALITY.animMs) || 1500;
    for (let i = this.deaths.length - 1; i >= 0; i--) {
      const d = this.deaths[i];
      d.t += dt;
      const p = d.t / (ms / 1000);
      if (p >= 1) { this.deaths.splice(i, 1); continue; }
      if (!G.visibleAt(d.x | 0, d.y | 0)) continue;
      const sheet = this.deathSheet(d.spr);
      const f = Math.min(sheet.length - 1, (p * sheet.length) | 0);
      const B = d.box || TL;
      const ux = d.x * TL - B / 2, uy = d.y * TL + TL / 2 - CFG.SPRITE_LIFT - B;
      g.save();
      if (d.flip) { g.translate(ux + B / 2, 0); g.scale(-1, 1); g.translate(-(ux + B / 2), 0); }
      g.drawImage(sheet[f], ux, uy, B, B);
      g.restore();
    }
  },

  // is a topple still playing over this tile? (the ash it leaves waits for it)
  collapseAt(x, y) {
    for (const c of this.collapses)
      if (x >= c.x && x < c.x + c.sz && y >= c.y && y < c.y + c.sz) return c;
    return null;
  },

  // advance and draw the live topples. Called from the frame loop AFTER the
  // units, so the dust rolls over whoever knocked the thing down.
  drawCollapses(g, dt) {
    const TL = CFG.TILE;
    for (let i = this.collapses.length - 1; i >= 0; i--) {
      const c = this.collapses[i];
      c.t += dt;
      const p = c.t / (c.cfg.ms / 1000);
      if (p >= 1) { this.collapses.splice(i, 1); continue; }
      if (!G.visibleAt(c.x, c.y)) continue;        // a tower falling in the fog is not seen
      const PD = this.COLLAPSE_PAD;
      const bw = c.sz * TL, bx = c.x * TL, by = c.y * TL;
      const dx = bx - bw * PD.x, dy = by - bw * PD.y, dw = bw * PD.w, dh = bw * PD.h;
      g.save();
      if (c.flip) { g.translate(bx + bw / 2, 0); g.scale(-1, 1); g.translate(-(bx + bw / 2), 0); }
      if (c.art) {                                 // this kind draws its own fall
        const f = Math.min(c.art - 1, (p * c.art) | 0);
        Assets.drawSprite(g, 'misc/' + c.key + 'Fall' + (f + 1), dx, dy, { w: dw, h: dh });
      } else {
        const sheet = this.collapseSheet(c.spr, c.cfg);
        const f = Math.min(sheet.length - 1, (p * sheet.length) | 0);
        g.drawImage(sheet[f], dx, dy, dw, dh);
      }
      g.restore();
    }
  },

  /* ---- THE WONDER'S SHINE (tests/wonder.mjs) ----
     Seventy thousand of everything and forty-five days went into this, and
     for the rest of the run it has to look like it. Not a glow filter — a
     slow warm radiance that breathes over the monument, and gold motes that
     drift up off it and fade, drawn on a CONTINUOUS clock so nothing snaps.
     Cheap: one gradient and a dozen little rects. */
  drawWonderShine(g, b, bx, by, bw) {
    const now = performance.now() / 1000;
    const cx = bx + bw / 2, cy = by + bw * 0.55;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.8);
    const rad = bw * (0.62 + pulse * 0.05);
    const grd = g.createRadialGradient(cx, cy, bw * 0.10, cx, cy, rad);
    grd.addColorStop(0, 'rgba(255,238,175,' + (0.16 + pulse * 0.07).toFixed(3) + ')');
    grd.addColorStop(0.55, 'rgba(240,200,110,' + (0.07 + pulse * 0.03).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(232,193,90,0)');
    const old = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grd;
    g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    g.globalCompositeOperation = old;
    // motes lifting off the stone, each on its own slow cycle
    const GD = ART.PALETTE.gold, px = bw / 96;
    for (let i = 0; i < 11; i++) {
      const s = ((i * 2654435761) >>> 8) % 1000 / 1000;
      const period = 3.4 + s * 2.6;
      const t = ((now + s * 11) % period) / period;
      const mx = bx + (0.14 + s * 0.72) * bw + Math.sin(now * 0.9 + i) * bw * 0.03;
      const my = by + bw * (0.86 - t * 0.78);
      g.globalAlpha = Math.min(1, t * 4) * (1 - t) * 0.85;
      g.fillStyle = i % 3 ? GD[3] : GD[2];
      g.fillRect(mx, my, px * 2, px * 2);
      g.globalAlpha = 1;
    }
  },

  /* ---- THE MARVEL (tests/wonder.mjs) ----
     The monument is finished and the run is won — but the player is NOT
     snapped straight to a score screen. The world holds still for
     CFG.WONDER.marvelMs with the camera on the thing and its name across the
     bottom of the frame, and only then does the victory screen come up.
     G.wonderRaised owns the clock; this only draws it. Screen space, so it
     runs after the world transform has been reset. */
  drawMarvel(g, dt) {
    const m = this.marvel;
    if (!m) return;
    m.t += dt;
    const W = this.cv.width, H = this.cv.height;
    const fade = Math.min(1, m.t * 1.2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    /* The canvas runs the WHOLE viewport, but the HUD sits on top of it in the
       DOM — so the caption has to live in the open band between the status bar
       and the bottom bar, or it is drawn underneath them and nobody ever sees
       it. Measure BOTH bars as they stand right now, once, when the marvel
       starts: R.topReserve/bottomReserve are learned lazily elsewhere and are
       still 0 in a session where the camera has not been clamped yet. Canvas
       pixels are CSS pixels × dpr. */
    if (m.top == null) {
      const tb = document.getElementById('topbar'), bb = document.getElementById('bottombar');
      const dpr = this.dpr || 1;
      m.top = (tb ? tb.offsetHeight : 0) * dpr || (this.topReserve || 0);
      m.bot = (bb ? bb.offsetHeight : 0) * dpr || (this.bottomReserve || 0);
    }
    const top = m.top, bot = m.bot;
    const openH = Math.max(120, H - top - bot);
    const midY = top + openH * 0.5;
    // a warm vignette closing gently in from the edges of the open frame
    const vg = g.createRadialGradient(W / 2, midY, Math.min(W, openH) * 0.16,
      W / 2, midY, Math.max(W, openH) * 0.72);
    vg.addColorStop(0, 'rgba(255,236,180,0)');
    vg.addColorStop(0.6, 'rgba(90,60,20,' + (0.20 * fade).toFixed(3) + ')');
    vg.addColorStop(1, 'rgba(24,16,8,' + (0.55 * fade).toFixed(3) + ')');
    g.fillStyle = vg; g.fillRect(0, top, W, openH);
    const band = Math.min(92, openH * 0.24), bandY = top + openH - band;
    g.fillStyle = 'rgba(18,14,9,' + (0.72 * fade).toFixed(3) + ')';
    g.fillRect(0, bandY, W, band);
    g.fillStyle = 'rgba(232,193,90,' + (0.9 * fade).toFixed(3) + ')';
    g.fillRect(0, bandY, W, 2);
    g.textAlign = 'center';
    g.globalAlpha = fade;
    g.fillStyle = '#f3dc9a';
    g.font = 'bold ' + Math.round(Math.min(26, W / 15)) + 'px sans-serif';
    g.fillText((m.name || '').toUpperCase(), W / 2, bandY + Math.round(band * 0.42));
    g.fillStyle = '#cbb98a';
    g.font = Math.round(Math.min(14, W / 30)) + 'px sans-serif';
    // the blurb can be longer than a phone is wide — wrap it onto two lines
    const words = String(m.blurb || '').split(' ');
    const lines = [''];
    for (const wd of words) {
      const t2 = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd;
      if (g.measureText(t2).width > W - 28 && lines.length < 2) lines.push(wd);
      else lines[lines.length - 1] = t2;
    }
    lines.forEach((ln, i) => g.fillText(ln, W / 2, bandY + Math.round(band * (0.66 + i * 0.20))));
    g.globalAlpha = 1;
    g.textAlign = 'left';
  },

  /* ---- BANNERS THAT FLY (tests/banners-smoke.mjs) ----
     The POLES are baked into the building sprites; the CLOTH is drawn here,
     every frame, for two reasons: it can ripple, and it can wear the tribe's
     own tunic dye instead of the generic blue/red the sprite sets are built
     in — a purple village flies purple. Anchors are tile FRACTIONS measured
     off the sprite art (the 16-grid ones are c/16, the fine 32-grid ones
     c/32), so they scale with zoom and with the 2×2 hall for free. `lv` is
     the level the pole first appears at — ART.tierDress puts most banners at
     3, while the barracks and the war camp carry theirs from the start. */
  /* ---- THE ART CARRIES ITSELF (both off for now, an art-direction call) ----
     Two owner cues used to ride on every building's top-left corner: a waving
     cloth BANNER and a 4px faction PIP. Against the new building art they
     crowd the silhouette and read as UI stuck onto the scene rather than part
     of it. So they are switched off HERE, at the call sites — never deleted:
     drawBanners, BANNER_AT's measured anchors, the tunic-dye lookup and their
     contract checks all still stand, so flipping a flag back to true restores
     the feature exactly as it was.
     The rival's FORT pip is a different thing and stays: walls, gates and
     towers share one faction-less atlas, so that small centre mark is the
     only way to tell whose stonework you are looking at (it never appears on
     your own — see the Owner tag note below). */
  SHOW_BANNERS: false,
  SHOW_OWNER_PIP: false,

  BANNER_AT: {
    barracks: [{ x: 4 / 32, y: 2 / 32, w: 6 / 32, h: 7 / 32, lv: 1 }],
    warcamp:  [{ x: 21 / 32, y: 9 / 32, w: 4 / 32, h: 5 / 32, lv: 1, left: true }],
    range:    [{ x: 14 / 16, y: 0, w: 3 / 16, h: 3 / 16, lv: 3 }],
    trade:    [{ x: 15 / 16, y: 0, w: 3 / 16, h: 3 / 16, lv: 3 }],
    sapper:   [{ x: 1 / 16, y: 0, w: 3 / 16, h: 3 / 16, lv: 3 }],
    dock:     [{ x: 4 / 32, y: 3 / 32, w: 3 / 32, h: 3 / 32, lv: 3 }],
    siege:    [{ x: 3 / 32, y: 4 / 32, w: 3 / 32, h: 3 / 32, lv: 3 }],
    tc:       [{ x: 10.6 / 32, y: 4.375 / 32, w: 4 / 32, h: 4 / 32, lv: 3 },   // the L3 hall's upper-left roof slope
               { x: 22.3 / 32, y: 4.375 / 32, w: 4 / 32, h: 4 / 32, lv: 3, left: true }],  // …and upper-right
    // the gatehouse flies a standard from each flanking tower — and its poles
    // move with the gate's ORIENTATION, so it keeps a set of anchors per axis
    gate:     [{ x: 7 / 32, y: 1 / 32, w: 4 / 32, h: 4 / 32, lv: 3 },
               { x: 22 / 32, y: 1 / 32, w: 4 / 32, h: 4 / 32, lv: 3, left: true }],
    gateV:    [{ x: 9 / 32, y: 0, w: 4 / 32, h: 4 / 32, lv: 3 },
               { x: 9 / 32, y: 17 / 32, w: 4 / 32, h: 4 / 32, lv: 3 }],
  },
  drawBanners(g, b, bx, by, bw) {
    const set = b.key === 'gate'
      ? (this.gateVerticalAt(b.x, b.y) ? this.BANNER_AT.gateV : this.BANNER_AT.gate)
      : this.BANNER_AT[b.key];
    if (!set || b.construction > 0) return;                 // no colours over a work site
    const dye = (Sprites.tunicCol || {})[G.tunicOf(b.owner)] || { body: '#3f6d99', accent: '#2c4e70' };
    const now = performance.now() / 1000;
    for (let s = 0; s < set.length; s++) {
      const a = set[s];
      if (b.level < a.lv) continue;                          // the pole isn't there yet
      const w = a.w * bw, h = a.h * bw, x0 = bx + a.x * bw, y0 = by + a.y * bw;
      const cols = Math.max(3, Math.round(w));
      const cw = w / cols;
      const ph = b.id * 0.7 + s * 1.9;
      for (let i = 0; i < cols; i++) {
        // the ripple: each column further from the pole lags a little more and
        // swings a little wider, which is what reads as cloth catching wind
        const f = a.left ? (cols - 1 - i) / cols : i / cols;
        const wave = Math.sin(now * 3.1 - f * 2.6 + ph) * h * 0.16 * (0.25 + f);
        const cx = x0 + i * cw;
        const cy = y0 + wave;
        // the fly end tapers, so the banner reads as cloth and not a slab
        const ch = h * (1 - f * 0.18);
        g.fillStyle = dye.body; g.fillRect(cx, cy, Math.ceil(cw), ch);
        g.fillStyle = dye.accent; g.fillRect(cx, cy + ch - Math.max(1, h * 0.16), Math.ceil(cw), Math.max(1, h * 0.16));
        if (i === 0) { g.fillStyle = dye.accent; g.fillRect(cx, cy, Math.max(1, cw * 0.5), ch); }  // shadowed fold at the pole
      }
    }
  },

  /* ---- HEARTH SMOKE (tests/banners-smoke.mjs) ----
     A village should look INHABITED. Homes and halls breathe a thin column of
     smoke that drifts and fades as it rises — three puffs on a slow loop,
     seeded per building so no two chimneys pulse together. Only finished
     buildings smoke (a work site has no hearth yet), and a building far gone
     in flames doesn't bother — its own fire is already the story. */
  SMOKE_AT: {
    house:   { x: 21.5 / 32, y: 3 / 32 },     // the chimney pot
    /* the hall is the one key whose roofline really CHANGES shape between
       tiers, and it is the only one still carrying manifest art — so it alone
       is a per-level list. Everything else here is back to procedural art and
       keeps its single flat anchor; smokeAnchor accepts both shapes. */
    tc:      [{ lv: 1, x: 15.7 / 32, y: 3 / 32 },      // the L1 cone's roof-hole
              { lv: 2, x: 15.7 / 32, y: 1.4 / 32 },    // the L2 longhouse's ridge
              { lv: 3, x: 21.7 / 32, y: 3 / 32 }],     // the L3 hall's CHIMNEY top
    lodge:   { x: 12 / 32, y: 7 / 32 },       // the smoking rack's fire
    warcamp: { x: 15.5 / 32, y: 9 / 32 },     // the campfire under the ridge pole
    trade:   { x: 3 / 16, y: 1 / 16 },        // the trader's brazier
  },
  /* AN ANCHOR THAT MAY VARY BY LEVEL. A key whose art genuinely changes shape
     between tiers (today only the hall, the one building still served by the
     manifest) lists its anchors as [{lv, x, y}, …] and takes the highest lv at
     or below the building's own. Every other key keeps a single flat {x, y}
     and is returned untouched — so this stayed a two-line change when the
     generated building art was reverted and those keys went back to one
     procedural sprite per level. */
  smokeAnchor(table, key, lv) {
    const e = table[key];
    if (!e) return null;
    if (!Array.isArray(e)) return e;                 // a flat anchor: same at every level
    let best = null;
    for (const a of e) if (a.lv <= lv && (!best || a.lv > best.lv)) best = a;
    return best;
  },
  drawHearthSmoke(g, b, bx, by, bw) {
    const a = this.smokeAnchor(this.SMOKE_AT, b.key, b.level);
    if (!a || b.construction > 0) return;
    if (Bld.burnPhase(b) >= 1) return;                       // it's on fire; that's smoke enough
    const now = performance.now() / 1000;
    const ox = bx + a.x * bw, oy = by + a.y * bw;
    const seed = (b.id * 0.37) % 1;
    for (let i = 0; i < 3; i++) {
      const t = ((now * 0.42 + seed + i / 3) % 1);           // 0..1 up the column
      const rise = t * bw * 0.55;
      const drift = Math.sin(now * 0.9 + i * 2 + b.id) * bw * 0.09 * t;
      const sz = Math.max(1, bw * (0.05 + t * 0.055));
      g.globalAlpha = 0.34 * (1 - t) * (1 - t * 0.3);
      g.fillStyle = '#cfcac0';
      g.fillRect(ox + drift - sz / 2, oy - rise - sz, sz, sz);
      if (t > 0.35) {                                        // the column frays as it climbs
        g.globalAlpha *= 0.7;
        g.fillRect(ox + drift * 1.5 + sz * 0.4, oy - rise - sz * 1.6, sz * 0.7, sz * 0.7);
      }
    }
    g.globalAlpha = 1;
  },

  /* ---- THE DOORYARD CAMPFIRE ----
     A standalone sprite (assets/tc-l1-fire.png, manifest key misc/campfireTc),
     composited here rather than baked into the hut master — the hut and the
     fire can now each carry their own supersampled detail density without
     one dragging the other's downscale math along. CAMPFIRE_AT is measured
     against the ACTUAL art (the old baked-in position, 0.78/1.64 tile units,
     was tuned for a composition this hut replaced and had drifted loose of
     the stone ring — the floating-glyph bug). blitBld, not Assets.drawSprite,
     because this master is supersampled exactly like the hut's and needs the
     same smoothing-on-downscale treatment or it shimmers as the camera moves.
     A light scale/alpha pulse stands in for the flicker the old baked flame
     used to fake with three raw fillRects — cheap, and never fights the
     fine-grained flame already painted into the master. */
  CAMPFIRE_AT: {
    tc: [{ lv: 1, x: 10.9 / 32, y: 29.4 / 32 },   // the L1 dooryard, before the door
         { lv: 2, x: 16 / 32, y: 31 / 32 },       // the L2 longhouse's dooryard, between its doors
         { lv: 3, x: 16 / 32, y: 30.5 / 32 }],    // the L3 hall's threshold
  },
  /* CAMP DRESSING (tests/raider-camps.mjs): the props a people strews about
     its own fire — Sprites.campPropsFor(tribe), four per people. Placement is
     SEEDED by the camp's id so a camp reads the same way every visit: each
     prop takes one of the eight yard tiles (skipping water and any solid
     building) with a small sub-tile drift. Drawn only for a STANDING camp —
     burn the camp out and the litter goes with the band; the worn ground is
     what remains (the T.CAMP tile). Render-only: nothing here touches S. */
  drawCampDress(g, b) {
    /* a COMPOUND camp PNG (sidecar scale past ~1.5 footprints) paints its own
       yard — lodge, trophies, fire and clearing in one composed piece — so
       the procedural strewing stands down rather than double-dressing it.
       Keyed off the installed art's own sidecar, not a hand-kept list: a
       tribe whose PNG ships without the compound scale keeps its litter. */
    const own = Sprites.camp && Sprites.camp[b.tribe];
    if (own && own._cfArt && (own._cfArt.scale || 1) > 1.5) return;
    const props = Sprites.campPropsFor(b.tribe);
    /* a dropped-in PNG wins the slot, one prop at a time — the override keys
       on the RESOLVED tribe (the wolf fallback), so an unknown-tribe camp
       wearing the Wolfskins' look also wears their overrides */
    const tk = Assets.campTribes().indexOf(b.tribe) >= 0 ? b.tribe : 'wolf';
    const over = (Assets.campProps && Assets.campProps[tk]) || {};
    const TL = CFG.TILE;
    let s = (b.id * 2654435761) >>> 0;
    const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const ring = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (let i = ring.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t2 = ring[i]; ring[i] = ring[j]; ring[j] = t2; }
    let k = 0;
    for (const [dx, dy] of ring) {
      if (k >= props.length) break;
      const x = b.x + dx, y = b.y + dy;
      if (!MapGen.inB(x, y)) continue;
      const t = S.map.terrain[MapGen.idx(x, y)];
      if (t === T.WATER || t === T.MOAT || t === T.MOUNTAIN) continue;
      const ob = Bld.at(x, y);
      if (ob && ob !== b) continue;
      const ox = ((r() - 0.5) * 8) | 0, oy = ((r() - 0.5) * 6) | 0;
      g.drawImage(over[k + 1] || props[k], x * TL + ox, y * TL + oy, TL, TL);   // files are 1-based
      k++;
    }
  },

  drawCampfire(g, b, bx, by, bw) {
    const a = this.smokeAnchor(this.CAMPFIRE_AT, b.key, b.level);
    if (!a || b.construction > 0) return;
    const spr = Assets.resolve('misc/campfireTc');
    if (!spr) return;
    const now = performance.now() / 1000;
    const pulse = 1 + Math.sin(now * 5.3 + b.id) * 0.035;       // a slow flicker breathing
    const w = bw * 0.24 * pulse, h = w * (spr.height / spr.width);
    const ox = bx + a.x * bw - w / 2, oy = by + a.y * bw - h / 2;
    g.globalAlpha = 0.94 + Math.sin(now * 9.1 + b.id * 3) * 0.06;
    this.blitBld(g, spr, ox, oy, w, h);
    g.globalAlpha = 1;
  },

  /* ---- WHERE A BUILDING BURNS (tests/burn-down.mjs) ----
     The hand-made art gave every building a real roof, a real doorway and a
     real yard — so the fire is anchored to THEM instead of to three fixed
     fractions of the tile. Anchors are fractions of the ART RECT (identical
     to the tile box for square art, but honest under a sidecar's offsets),
     per key and per level via the same [{lv, …}] resolver the smoke anchors
     use. Two treatments:

       roofed  spots carry big/behind flags. Catching (ph0) lights the first
               two front spots small; the blaze (ph1) puts flameBig on the
               big spots — the `behind` ones drawn BEFORE the sprite, so the
               fire licks up from behind the ridge — and flameSmall on the
               rest; guttering (ph2) falls back to small fires at the
               doorway/foot spots. The BLAZE stays phase 1's alone: ph0 and
               ph2 never draw flameBig.
       ground  (farm, the sapper's pit, the siege yard, the open training
               grounds) — nothing stands tall enough to blaze: smoldering
               scorch patches that deepen with the phase, embers, low small
               flames, drifting smoke. NEVER flameBig, at any phase.

     A key with no entry keeps the old three-fraction look, and a WORK SITE
     always uses it too (what burns on a site is the piled materials, not
     the building they were going to be). Every burning building now also
     breathes a proper smoke column above its roofline. */
  FIRE_AT: {
    house: [
      { lv: 1, spots: [{ x: 0.51, y: 0.12, big: 1, behind: 1 }, { x: 0.34, y: 0.32, big: 1 },
                       { x: 0.61, y: 0.70 }, { x: 0.16, y: 0.74 }] },
      { lv: 2, spots: [{ x: 0.32, y: 0.18, big: 1, behind: 1 }, { x: 0.60, y: 0.16, big: 1 },
                       { x: 0.42, y: 0.66 }, { x: 0.79, y: 0.50 }] },
      { lv: 3, spots: [{ x: 0.42, y: 0.16, big: 1, behind: 1 }, { x: 0.71, y: 0.14, big: 1 },
                       { x: 0.48, y: 0.64 }, { x: 0.80, y: 0.74 }] },
    ],
    tc: [
      { lv: 1, spots: [{ x: 0.50, y: 0.12, big: 1, behind: 1 }, { x: 0.33, y: 0.40, big: 1 },
                       { x: 0.67, y: 0.40, big: 1 }, { x: 0.40, y: 0.72 }] },
      { lv: 2, spots: [{ x: 0.44, y: 0.10, big: 1, behind: 1 }, { x: 0.60, y: 0.20, big: 1 },
                       { x: 0.62, y: 0.32 }, { x: 0.43, y: 0.70 }] },
      { lv: 3, spots: [{ x: 0.42, y: 0.12, big: 1, behind: 1 }, { x: 0.66, y: 0.24, big: 1 },
                       { x: 0.46, y: 0.66 }, { x: 0.20, y: 0.80 }] },
    ],
    barracks: [
      { lv: 1, ground: 1, spots: [{ x: 0.45, y: 0.52 }, { x: 0.80, y: 0.16 }, { x: 0.18, y: 0.80 }] },
      { lv: 2, spots: [{ x: 0.42, y: 0.10, big: 1, behind: 1 }, { x: 0.42, y: 0.14, big: 1 },
                       { x: 0.46, y: 0.55 }, { x: 0.22, y: 0.85 }] },
      { lv: 3, spots: [{ x: 0.50, y: 0.08, big: 1, behind: 1 }, { x: 0.50, y: 0.14, big: 1 },
                       { x: 0.50, y: 0.55 }, { x: 0.12, y: 0.38 }] },
    ],
    range: [
      { lv: 1, ground: 1, spots: [{ x: 0.28, y: 0.24 }, { x: 0.55, y: 0.60 }, { x: 0.80, y: 0.85 }] },
      { lv: 2, spots: [{ x: 0.50, y: 0.10, big: 1, behind: 1 }, { x: 0.50, y: 0.15, big: 1 },
                       { x: 0.35, y: 0.44 }, { x: 0.62, y: 0.66 }] },
      { lv: 3, spots: [{ x: 0.72, y: 0.16, big: 1, behind: 1 }, { x: 0.68, y: 0.26, big: 1 },
                       { x: 0.30, y: 0.52 }, { x: 0.25, y: 0.78 }] },
    ],
    farm:   [{ lv: 1, ground: 1, spots: [{ x: 0.30, y: 0.36 }, { x: 0.65, y: 0.52 }, { x: 0.45, y: 0.76 }] }],
    sapper: [{ lv: 1, ground: 1, spots: [{ x: 0.60, y: 0.32 }, { x: 0.75, y: 0.14 }, { x: 0.16, y: 0.76 }] }],
    siege:  [{ lv: 1, ground: 1, spots: [{ x: 0.50, y: 0.52 }, { x: 0.24, y: 0.44 }, { x: 0.70, y: 0.56 }] }],
  },
  // the anchors for THIS building, in art-rect space — or null (legacy look).
  // Sites and upgrades are always legacy: they draw stage art, not the roof.
  fireAnchors(b) {
    if (b.construction > 0 || b.upgrading > 0) return null;
    return this.smokeAnchor(this.FIRE_AT, b.key, b.level);
  },
  // the rect the flames anchor to — the art rect when the sprite carries one
  fireRect(b, bx, by, bw) {
    const spr = this.bldSprite(b);
    return (spr && spr._cfArt) ? this.artRect(spr, bx, by, bw, bw)
                               : { x: bx, y: by, w: bw, h: bw };
  },
  _flame(g, b, i, big, x, y, s) {
    const beat = (performance.now() / 130) | 0;
    Assets.drawSprite(g, 'misc/' + (big ? 'flameBig' : 'flameSmall') + '/' + ((beat + i * 2 + b.id) % 4),
      x - s / 2, y - s * 0.9, { w: s, h: s });
  },
  // the blaze breaking out BEHIND the ridge — drawn before the sprite, so the
  // building's own silhouette occludes the flame's foot
  drawBurnBack(g, b, bx, by, bw) {
    const ph = Bld.burnPhase(b);
    if (ph !== 1) return;
    const a = this.fireAnchors(b);
    if (!a || a.ground) return;
    const rct = this.fireRect(b, bx, by, bw);
    for (let i = 0; i < a.spots.length; i++) {
      const sp = a.spots[i];
      if (!sp.behind) continue;
      this._flame(g, b, i + 5, 1, rct.x + sp.x * rct.w, rct.y + sp.y * rct.h, 0.62 * rct.w);
    }
  },
  // the smoke of a real fire — darker and denser than a hearth's, climbing
  // from the roofline (or off the smoldering ground) and fraying downwind
  drawBurnSmoke(g, cx, topY, w, ph, seed) {
    // WARM grey-brown and near-opaque low down: a translucent grey wash over
    // grass composited to a mossy green smudge (the design review); the
    // column should read as solid smoke at its root and fray only as it dies
    const now = performance.now() / 1000;
    const n = ph === 1 ? 5 : 3, dark = ph === 1 ? '#3f382f' : '#57503f';
    for (let i = 0; i < n; i++) {
      const t = ((now * 0.5 + seed + i / n) % 1);
      const rise = t * w * (ph === 1 ? 1.05 : 0.7);
      const drift = Math.sin(now * 0.8 + i * 2.1 + seed * 9) * w * 0.14 * t + t * w * 0.08;
      const sz = Math.max(2, w * (0.10 + t * 0.11) * (ph === 1 ? 1.25 : 1));
      g.globalAlpha = (ph === 1 ? 0.8 : 0.6) * (1 - t * 0.85);
      g.fillStyle = dark;
      g.fillRect(cx + drift - sz / 2, topY - rise - sz, sz, sz);
      if (t > 0.3) {
        g.globalAlpha *= 0.65;
        g.fillStyle = '#8a7f70';
        g.fillRect(cx + drift + sz * 0.5, topY - rise - sz * 1.5, sz * 0.6, sz * 0.6);
      }
    }
    g.globalAlpha = 1;
  },
  // smoldering ground: scorch that deepens with the phase, embers, low flames
  drawGroundBurn(g, b, rct, spots, ph) {
    const hsh = (n) => ((((b.id * 2654435761 + n * 40503) >>> 0) >>> 7) % 1000) / 1000;
    const now = performance.now() / 1000;
    const live = ph === 0 ? 1 : spots.length;      // the smolder spreads patch by patch
    for (let i = 0; i < live; i++) {
      const sp = spots[i];
      const px = rct.x + sp.x * rct.w, py = rct.y + sp.y * rct.h;
      const rad = rct.w * (ph === 0 ? 0.10 : ph === 1 ? 0.14 : 0.17) * (0.8 + hsh(i) * 0.4);
      // scorched earth — near-opaque char (a translucent multiply over green
      // grass read as moss), two offset blots so the patch stays irregular
      g.globalAlpha = ph === 2 ? 0.92 : 0.62;
      g.fillStyle = '#1c140c';
      g.beginPath(); g.ellipse(px, py, rad, rad * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a2c1c';
      g.beginPath(); g.ellipse(px + rad * 0.5 * (hsh(i + 9) - 0.5), py + rad * 0.3,
        rad * 0.6, rad * 0.4, 0, 0, Math.PI * 2); g.fill();
      // guttering leaves ASH — a pale grey drift on the char, the one phase
      // whose whole job is "this yard is nearly gone"
      if (ph === 2) {
        g.globalAlpha = 0.8;
        g.fillStyle = '#78716a';
        g.beginPath(); g.ellipse(px - rad * 0.25, py - rad * 0.1, rad * 0.5, rad * 0.28, 0, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      // embers winking in the char
      const F = ART.PALETTE.fire;
      for (let e = 0; e < (ph === 1 ? 5 : 3); e++) {
        const wink = Math.sin(now * (2 + hsh(i * 7 + e) * 3) + e * 2.2 + b.id) * 0.5 + 0.5;
        if (wink < 0.3) continue;
        g.globalAlpha = 0.5 + wink * 0.5;
        g.fillStyle = F[e % 2];
        g.fillRect(px + (hsh(i * 11 + e) - 0.5) * rad * 1.6,
                   py + (hsh(i * 13 + e) - 0.5) * rad * 0.9, 2, 2);
      }
      g.globalAlpha = 1;
      // a low tongue of flame — small at every phase; the ground never blazes
      if (ph === 1 || (i === 0 && ph === 0))
        this._flame(g, b, i, 0, px, py + rad * 0.2, (ph === 1 ? 0.34 : 0.30) * rct.w);
      // each patch breathes its own wisp
      this.drawBurnSmoke(g, px, py - rad * 0.3, rct.w * 0.55, ph, (b.id * 0.37 + i * 0.29) % 1);
    }
  },
  drawBurn(g, b, bx, by, bw) {
    const ph = Bld.burnPhase(b);
    if (ph < 0) return;
    // stone sheds; timber burns
    if (b.key === 'tower') return this.drawTowerCrumble(g, b, bx, by, bw, ph);
    const hsh = (n) => ((((b.id * 2654435761 + n * 40503) >>> 0) >>> 7) % 1000) / 1000;
    const a = this.fireAnchors(b);
    if (a && a.ground) return this.drawGroundBurn(g, b, this.fireRect(b, bx, by, bw), a.spots, ph);
    if (a) {
      const rct = this.fireRect(b, bx, by, bw);
      const front = a.spots.filter(sp => !sp.behind);
      const list = ph === 0 ? front.slice(0, 2)                 // catching: the first two licks
        : ph === 1 ? front                                       // the blaze: every front anchor
        : front.filter(sp => !sp.big);                           // guttering: down at the door and the foot
      for (let i = 0; i < list.length; i++) {
        const sp = list[i];
        const jx = (hsh(i) - 0.5) * 0.10 * rct.w, jy = (hsh(i + 3) - 0.5) * 0.06 * rct.h;
        const big = ph === 1 && sp.big ? 1 : 0;                  // the BLAZE is phase 1's alone
        this._flame(g, b, i, big, rct.x + sp.x * rct.w + jx, rct.y + sp.y * rct.h + jy,
          (big ? 0.56 : 0.42) * rct.w);
      }
      // the column above the roofline — anchored over the big spots' center
      const bigs = a.spots.filter(sp => sp.big);
      const cx = rct.x + (bigs.length
        ? bigs.reduce((s, sp) => s + sp.x, 0) / bigs.length : 0.5) * rct.w;
      this.drawBurnSmoke(g, cx, rct.y + rct.h * 0.10, rct.w, ph, (b.id * 0.37) % 1);
      return;
    }
    // no anchors (a work site, or a key without a table entry): the classic
    // three-fraction look — what burns on a site is the piled materials
    const spots = ph === 1
      ? [[0.5, 0.2, 1], [0.24, 0.62, 1], [0.74, 0.5, 1]]   // the blaze: roof + two faces
      : [[0.42, 0.24, 0], [0.66, 0.6, 0]];                 // catching / guttering: two small fires
    for (let i = 0; i < spots.length; i++) {
      const [sx, sy, big] = spots[i];
      const jx = (hsh(i) - 0.5) * 0.18 * bw, jy = (hsh(i + 3) - 0.5) * 0.1 * bw;
      this._flame(g, b, i, big, bx + sx * bw + jx, by + sy * bw + jy, (big ? 0.56 : 0.42) * bw);
    }
    this.drawBurnSmoke(g, bx + bw / 2, by + bw * 0.16, bw, ph, (b.id * 0.37) % 1);
  },

  /* ---- ASH PILES (tests/burn-down.mjs) — what a burned building leaves ----
     Generated from the building's OWN finished sprite: each column's pixel
     mass becomes the heap's height there, so a tall tower leaves a tall
     narrow cone and a broad hall a long low mound — unique to each building
     by construction. Charcoal base, grey ash body, pale blown-ash crown,
     a few charred beam stubs, embers still pinpricking the fresh pile. */
  _ashCache: {},
  ashOf(key, lv) {
    const ck = key + ':' + (lv || 1);
    if (this._ashCache[ck]) return this._ashCache[ck];
    const fam = Sprites.building[key] || Sprites.building.house;
    const base = fam[Math.min((lv || 1) - 1, fam.length - 1)] || fam[0];
    const W = base.width, H = base.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const COLS = 16, cw = W / COLS;
    let mass = new Array(COLS).fill(0);
    try {
      const d = base.getContext('2d').getImageData(0, 0, W, H).data;
      for (let x = 0; x < W; x++) {
        let n = 0;
        for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 96) n++;
        mass[Math.min(COLS - 1, (x / cw) | 0)] += n;
      }
    } catch (_) {
      // an asset-pack image can taint its canvas — fall back to a settled dome
      mass = mass.map((_, i) => 1 - Math.abs(i - COLS / 2) / (COLS / 2) * 0.7);
    }
    const peak = Math.max(...mass, 1);
    const ST = ART.PALETTE.stone, INK = ART.PALETTE.ink, BO = ART.PALETTE.bone, F = ART.PALETTE.fire;
    const r = ART.rng(ck.length * 31 + key.charCodeAt(0) * 7);
    const ground = H * 0.86;
    g.fillStyle = 'rgba(0,0,0,0.25)';                       // scorched contact shadow
    g.fillRect(W * 0.1, ground + H * 0.02, W * 0.8, H * 0.06);
    for (let i = 0; i < COLS; i++) {
      // the heap: this column's share of the building's mass, softened by its
      // neighbours so the profile reads as one settled pile
      const m = (mass[i] + (mass[i - 1] || mass[i]) + (mass[i + 1] || mass[i])) / 3;
      const hh = Math.max(H * 0.05, (m / peak) * H * 0.3) * (0.85 + r() * 0.3);
      const x = i * cw;
      g.fillStyle = INK[1]; g.fillRect(x, ground - hh, cw, hh);              // charcoal body
      g.fillStyle = ST[1]; g.fillRect(x, ground - hh, cw, Math.max(1, hh * 0.55));   // grey ash over it
      if (r() < 0.65) { g.fillStyle = ST[2]; g.fillRect(x + r() * cw * 0.4, ground - hh, cw * (0.3 + r() * 0.5), Math.max(1, hh * 0.22)); }  // lit crown, settled unevenly
      if (r() < 0.4) { g.fillStyle = BO[1]; g.fillRect(x + r() * cw, ground - hh - 1, Math.max(1, cw * 0.3), 1); }  // blown pale ash
    }
    for (let i = 0; i < 3; i++) {                            // charred beam stubs leaning out of the pile
      const x = (0.2 + r() * 0.6) * W, hh2 = (0.08 + r() * 0.08) * H;
      g.fillStyle = '#241a10';
      g.fillRect(x, ground - (mass[(x / cw) | 0] / peak) * H * 0.25 - hh2, Math.max(2, W * 0.025), hh2);
    }
    for (let i = 0; i < 4; i++) {                            // embers dying in the ash
      g.fillStyle = i % 2 ? F[0] : F[1];
      g.fillRect((0.2 + r() * 0.6) * W, ground - r() * H * 0.12, 2, 2);
    }
    return this._ashCache[ck] = c;
  },

  unitPose(u) {
    const vil = u.kind === 'villager';
    /* in a fight: villagers swing a pickaxe (guard), soldiers thrust a
       spear — but only within striking distance, the same gate the
       building branch below has always had. A unit still CLOSING on its
       mark walks; it was invisible while fight borrowed the walk sheet,
       but the bear's real fight sheet rears it up on its hind legs, and
       a bear galloping across the map mid-roar reads as broken. The
       cheap answer comes first: a STANDING unit with a target is at
       range or waiting out its swing — fight, no target lookup. Only a
       MOVER pays the O(n) Units.get, and movers-with-targets are the
       few dozen chasers, not the whole brawl (adversarial review timed
       the unguarded version at the render loop's worst moment). */
    if (u.tUnit) {
      if (!Units.moving(u)) return vil ? 'guard' : 'fight';
      const ft = Units.get(u.tUnit);
      const rng = (CFG.UNITS[u.kind].rng || CFG.MELEE_RANGE || 1.5) + 0.3;
      if (!ft || Math.hypot(ft.x - u.x, ft.y - u.y) <= rng)
        return vil ? 'guard' : 'fight';
      return 'walk';
    }
    const fb = u.tBld && Bld.get(u.tBld);
    // ranged units volley buildings from their OWN reach, not melee's: an
    // archer loosing at a wall from five tiles is fighting, and with real
    // shoot art it must look like it (the old 1.5-tile gate left ranged
    // attackers idling through their own volleys)
    if (fb && Math.hypot(Bld.cx(fb) - u.x, Bld.cy(fb) - u.y) <
        Math.max(1.5, (CFG.UNITS[u.kind].rng || 0) + 0.3) + Bld.reach(fb)) return vil ? 'guard' : 'fight';
    if (Units.moving(u)) return 'walk';
    const t = u.task;
    if (t) {
      if (t.type === 'shorefish') return 'idle';                 // the rod overlay tells the story
      if (t.type === 'gather') {                                 // tool by resource
        if (t.res === 'stone') return 'mine';
        if (t.res === 'food') {
          /* FORAGING LOOKS LIKE FORAGING (the referee's live-play note: a
             villager at a berry bush read as chopping until the floating
             text said otherwise). On fertile ground the pose follows the
             PLANT the tile actually drew: kneel and PICK at a berry bush,
             stretch up and REACH into an orchard tree. Farm plots and
             everything else keep the field pose, and a missing sheet
             falls back gracefully in sheetFrames as every pose does. */
          if (S.map.terrain[MapGen.idx(t.x, t.y)] === T.FERTILE)
            return this.fertileKindAt(t.x, t.y) === 'berry' ? 'pick' : 'reach';
          return 'farm';
        }
        return 'gather';                                         // wood → axe
      }
      if (t.type === 'build') return 'build';
      if (t.type === 'terraform') {
        // the sapper's craft, by JOB (the operator's four): trench-digging,
        // bridge-laying (reinforcement shares it), clearing, mound-raising.
        // TERRA_POSE also gates the sited tile-facing in sheetFrames, and
        // the procedural fallback folds all four back onto its 'work' swing.
        if (u.kind !== 'sapper') return 'build';
        return this.TERRA_POSE[t.job] || 'dig';
      }
      if (t.type === 'work') {                                   // stationed at a workplace → its craft
        const wb = Bld.get(t.id), k = wb && wb.key;
        return (k === 'quarry' || k === 'mine') ? 'mine' : k === 'farm' ? 'farm'
          : (k === 'lumber' || k === 'lodge') ? 'gather' : 'build';
      }
      if (t.type === 'fish') return 'gather';
    }
    return 'idle';
  },
  /* ============== 8-WAY FACING (tests/animal-art.mjs) ==============
     Derived at DRAW time from how the unit has actually displaced, and
     kept in a WeakMap keyed by the unit object — never on the unit, so
     nothing here can ride into a save, the seeded sim, or a fixture.
     The anchor point only moves when the unit has covered ~0.02 tiles
     since the last read: micro-jitter (collision shoves, path snaps)
     can't flip the facing, slow drift still accumulates into an honest
     direction, and a unit that stops HOLDS its last facing. Y grows
     downward on the map, so +y is south. */
  _faceMap: new WeakMap(),
  FACE8: ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'],   // atan2 octants, y-down
  unitFacing(u) {
    let f = this._faceMap.get(u);
    if (!f) { f = { x: u.x, y: u.y, dir: 's' }; this._faceMap.set(u, f); return f.dir; }
    const dx = u.x - f.x, dy = u.y - f.y;
    if (dx * dx + dy * dy >= 0.0004) {                    // ≥ 0.02 tiles of real travel
      const oct = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      f.dir = this.FACE8[oct];
      f.x = u.x; f.y = u.y;
    }
    return f.dir;
  },

  /* DOES THIS KIND DRAW FROM AN INSTALLED PNG SHEET? (tests/animal-art.mjs)
     The gate for the contact-shadow pass below, and the reason it exists:
     EVERY procedural sprite in the game bakes its own contact shadow into
     its frames — villagers, soldiers, hulls and the procedural beasts alike
     (js/sprites.js). Character-class PNGs deliberately carry none (the
     reference doctrine keeps character art off the ground), so the renderer
     owes them one — and owes the whole existing cast nothing, or every
     villager on the map gets a second shadow under the first. */
  /* ONE RESOLVER, so the gate and the sprite can never disagree. A
     kind-level gate was wrong: sheets resolve per (direction, pose), and
     a deer whose facing direction has not loaded yet — the 16 strips
     arrive asynchronously, in any order — falls through to its
     procedural frames, which carry a baked shadow. Gating on "the kind
     has some art" then painted a second shadow under it for the length
     of the load. Returns the frame list or null; both callers use it. */
  /* VILLAGER TIERS (the tier overhaul, phase 1): a villager's appearance
     tier derives from its owner's Town Center level — resolved through a
     TABLE (Assets.VILLAGER_TIER_BY_TC), never hardcoded, so tiers can lag
     or lead the TC later. Cached per owner; Bld.finishUpgrade and
     R.onNewGame drop the cache, so an upgrade re-skins every villager on
     the map the same frame and a loaded save recomputes from its TC. */
  villagerTier(owner) {
    const c = this._vTier || (this._vTier = {});
    if (c[owner]) return c[owner];
    // typeof, not window.: Bld is a script-level const (the same trap G,
    // Sprites and MapGen carry — window.Bld is undefined)
    const tc = typeof Bld !== 'undefined' && Bld.tcOf(owner);
    const lv = (tc && tc.level) || 1;
    const tbl = (window.Assets && Assets.VILLAGER_TIER_BY_TC) || {};
    return c[owner] = tbl[lv] || 1;
  },
  /* SAPPER TIER — appearance by the owner's best finished Sappers' Camp
     (the operator's "one character per building level"). Same doctrine as
     the villager tier: derived, cached, never stored; the cache drops on
     new game / load (onNewGame) and when a camp finishes an upgrade
     (Bld.finishUpgrade). No camp still resolves 1 — a living sapper
     implies a camp existed, and the L1 look is the honest default. */
  sapperTier(owner) {
    const c = this._sTier || (this._sTier = {});
    if (c[owner]) return c[owner];
    let lv = 1;
    if (typeof Bld !== 'undefined' && window.S && S.buildings)
      for (const b of S.buildings)
        if (b.key === 'sapper' && b.owner === owner && Bld.done(b) && (b.level || 1) > lv) lv = b.level;
    return c[owner] = Math.min(3, lv);
  },
  /* the key a unit's sheet art resolves under. Every kind is its own key —
     except the villager, whose art varies by (faction, TUNIC, tier,
     gender): villager-{p|a}-{tunic}-l{tier}-{m|f}. THE TUNIC IS IN THE
     KEY on purpose (adversarial review): the frames are recolored to the
     rolled tunic at install, tunics re-roll every run, and unitArt
     survives across runs in one browser session — a tunic-less key served
     the PREVIOUS run's colors and let in-flight installs from the old run
     race the new one. Keys that carry the tunic can never go stale: a new
     run's key simply misses and re-asks. ONE key function feeds
     sheetFrames, so the sprite and the shadow gate can never disagree
     (the deer's lesson, pinned in tests/animal-art.mjs). */
  unitArtKey(u) {
    if (u.kind !== 'villager') {
      // the sapper tiers by its camp like the villager tiers by its hall
      if (u.kind === 'sapper')
        return 'sapper-' + (u.owner === 'A' ? 'a' : 'p') + '-' + G.tunicOf(u.owner) +
          '-l' + this.sapperTier(u.owner);
      // military kinds with sheet art resolve per (faction, tunic) — the
      // same recolor law and the same tunic-in-key staleness armor as the
      // villagers. An owner with no tunic (a raider save oddity) builds a
      // key that simply never loads, and the procedural rig stands.
      // OWNERS OUTSIDE P/A NEVER WEAR A VILLAGE DYE: tunicOf defaults any
      // stranger to 'blue', so without this gate a Sea Folk hull of a
      // military kind would sail in the player's livery.
      if (window.Assets && Assets.MILITARY_ART && Assets.MILITARY_ART[u.kind]) {
        if (u.owner !== 'P' && u.owner !== 'A') return u.kind;
        return u.kind + '-' + (u.owner === 'A' ? 'a' : 'p') + '-' + G.tunicOf(u.owner);
      }
      return u.kind;
    }
    return 'villager-' + (u.owner === 'A' ? 'a' : 'p') + '-' + G.tunicOf(u.owner) +
      '-l' + this.villagerTier(u.owner) + (u.female ? '-f' : '-m');
  },
  /* WORKERS NEVER SHOW THE PLAYER THEIR BACK (operator report: a
     villager who walked NORTH to its work tile held that facing for the
     whole task — minutes of shoulder blades). Facing is draw-time
     cosmetics, so the turn lives here in the resolver, not in the sim:
     while a WORK pose is playing, the three away facings rotate to the
     nearest front-or-profile — n turns fully around, the diagonals turn
     sideways — and the untouched _faceMap restores the true displacement
     facing the moment the unit walks again. Combat (fight/guard) and
     plain walking keep their honest facing; a spear thrust at the
     camera while the enemy stands behind you would be worse than a
     back. */
  WORK_TURN: { gather: 1, mine: 1, farm: 1, build: 1, work: 1,
               dig: 1, bridge: 1, clear: 1, mound: 1 },
  AWAY_TO_FRONT: { n: 's', ne: 'e', nw: 'w' },
  // terraform job → sheet pose (bridgeup reinforces a span: same craft)
  TERRA_POSE: { dig: 'dig', bridge: 'bridge', bridgeup: 'bridge', clear: 'clear', mound: 'mound' },
  TERRA_POSES: { dig: 1, bridge: 1, clear: 1, mound: 1 },
  sheetFrames(u) {
    // the variant key first, then the kind's own plain slot (a villager
    // with no tiered art yet falls through to the procedural cast below)
    const key = this.unitArtKey(u);
    const ua = window.Assets && Assets.unitArt &&
      (Assets.unitArt[key] || Assets.unitArt[u.kind]);
    this._sheetKey = (window.Assets && Assets.unitArt && Assets.unitArt[key]) ? key : u.kind;
    if (!ua) return null;
    const pose = this.unitPose(u);
    let face = this.unitFacing(u);
    /* A HULL HOLDS ITS HEADING. Every facing correction below is written
       for people — turn to your mark, never show the camera your back.
       A boat is not a person: it points where it last SAILED, because a
       multi-ton hull snapping through the compass every time its target
       circles reads as a toy, and its shot line is drawn to the target
       regardless. So naval kinds keep the honest displacement facing
       through combat and work alike. */
    const afloat = typeof Units !== 'undefined' && Units.isNaval && Units.isNaval(u);
    // A FIGHTER FACES WHAT IT FIGHTS (operator report: a champion battering
    // a wall while looking due south). Combat facing derives from the live
    // TARGET, not from the last displacement — a duel tracks a circling
    // enemy, an archer turns with its mark, a wall-batterer squares up to
    // the wall. Honest facing, deliberately un-clamped: backs are correct
    // in combat when the enemy stands north.
    if (!afloat && (pose === 'fight' || pose === 'guard')) {
      let tx = null, ty = null;
      if (u.tUnit) { const ft = Units.get(u.tUnit); if (ft) { tx = ft.x; ty = ft.y; } }
      else if (u.tBld && typeof Bld !== 'undefined') {
        const fb = Bld.get(u.tBld); if (fb) { tx = Bld.cx(fb); ty = Bld.cy(fb); }
      }
      if (tx != null) {
        const fdx = tx - u.x, fdy = ty - u.y;
        if (fdx * fdx + fdy * fdy > 0.01)
          face = this.FACE8[((Math.round(Math.atan2(fdy, fdx) / (Math.PI / 4)) % 8) + 8) % 8];
      }
    }
    if (this.WORK_TURN[pose] && !afloat) {
      // a BUILDER faces his site, full stop — the operator's ruling: for
      // construction the PHYSICS win, a back turned to the camera is fine
      // when the site stands north (a mallet pointed away from the site
      // is what's wrong). Only siteless work keeps the no-backs clamp.
      let sited = false;
      if (pose === 'build' && u.task && u.task.type === 'build' && typeof Bld !== 'undefined') {
        const wb = Bld.get(u.task.id);
        if (wb) {
          const bdx = Bld.cx(wb) - u.x, bdy = Bld.cy(wb) - u.y;
          if (bdx * bdx + bdy * bdy > 0.01) {
            face = this.FACE8[((Math.round(Math.atan2(bdy, bdx) / (Math.PI / 4)) % 8) + 8) % 8];
            sited = true;
          }
        }
      }
      // a SAPPER faces the tile it reshapes — same physics ruling. The sim
      // already stands it on a 4-edge neighbor leaning in, so this facing
      // is always an exact cardinal: the four work sheets ship n/e/s/w only.
      if (this.TERRA_POSES[pose] && u.task && u.task.type === 'terraform') {
        const tdx = u.task.x + 0.5 - u.x, tdy = u.task.y + 0.5 - u.y;
        if (tdx * tdx + tdy * tdy > 0.01) {
          face = this.FACE8[((Math.round(Math.atan2(tdy, tdx) / (Math.PI / 4)) % 8) + 8) % 8];
          sited = true;
        }
      }
      if (!sited) face = this.AWAY_TO_FRONT[face] || face;
    }
    const d = ua.dirs[face] || ua.dirs.s;
    if (!d) return null;
    // the sheet's own pose first; a missing pose borrows sensibly
    // (fight falls to walk — motion — and gather-ish poses to idle)
    const fr = d[pose] || (pose === 'fight' ? d.walk : d.idle) || d.walk || d.idle || null;
    this._sheetPose = (fr && fr === d.idle) ? 'idle' : pose;   // what actually resolved (for the idle tempo)
    /* A STATIONARY POSE BORROWED FROM THE WALK IS HELD, NOT PLAYED (the
       stuck-cow report: her graze sheets ship after the generation reset,
       and until then a standing cow cycling her walk read as "walking
       into the shed and never turning"). Motion poses may borrow motion;
       a standing animal on borrowed legs stands still. */
    if (fr && fr === d.walk && !d[pose] && pose !== 'fight' && pose !== 'walk')
      this._sheetHold = true;
    else this._sheetHold = false;
    return fr;
  },
  sheetUnit(u) { return !!this.sheetFrames(u); },
  /* the square box a unit's sprite draws into, in world px. CFG.TILE for
     the whole cast; a character-class kind may declare a bigger one
     (Assets.UNIT_BOX — the bear's 48) at the same exact 2:1 sheet
     density. THE BIG BOX APPLIES ONLY WHEN THE SPRITE ACTUALLY CAME FROM
     A SHEET (adversarial review): the procedural fallback is authored
     for the 32px box, and stretching it 1.5× into 48 is the exact
     non-integer resample the density doctrine exists to prevent — during
     an async strip load (or with the PNGs deleted) the procedural bear
     draws at its own native 32 instead. Feet stay put either way: every
     box is bottom-aligned where the 32px box has always ended, so the
     extra size rises and widens from the feet and a bigger animal never
     floats or sinks. */
  /* THE BUILDER STANDS AT THE WALL (operator report, day 120): the sim
     accepts a working spot anywhere inside ~1.55+reach of the site — the
     right rule for crowds and pathing — but a mallet swung from the
     middle of the next tile reads as striking air. So the DRAW leans:
     a unit playing the build pose renders at the nearest point just
     outside its site's footprint (capped, so a far worker leans rather
     than teleports), while the sim position, taps and combat stay
     exactly where they were. Returns the draw position or null. */
  workLean(u) {
    /* a WOODCUTTER leans INTO the stand (the referee's live-play note: the
       axe should land on the trees, not swing at open grass beside them).
       The sim keeps the villager on the walkable edge tile it stands on —
       taps, pathing, combat all unchanged — only the sprite steps toward
       the wood's tile centre, the same draw-time-only rule as the builder's
       wall lean below. Forest only: berries, stone and gold are gathered
       standing over them already. */
    if (u.task && u.task.type === 'gather' && S && S.map) {
      const pose = this.unitPose(u);
      const tt = S.map.terrain[u.task.y * CFG.W + u.task.x];
      // …and a forager leans to the bush or under the bough the same way —
      // a shorter step than the woodcutter's: the plant is smaller
      const max = (pose === 'gather' && tt === T.FOREST) ? 0.34
        : ((pose === 'pick' || pose === 'reach') && tt === T.FERTILE) ? 0.24 : 0;
      if (max) {
        const dx = (u.task.x + 0.5) - u.x, dy = (u.task.y + 0.5) - u.y;
        const dd = Math.hypot(dx, dy) || 1;
        const step = Math.min(max, Math.max(0, dd - 0.30));
        if (step > 0.05) return { x: u.x + dx / dd * step, y: u.y + dy / dd * step };
        return null;
      }
      return null;
    }
    if (typeof Bld === 'undefined') return null;
    if (!(u.task && u.task.type === 'build') && !u.tBld) return null;   // the cheap common case
    // a hull never leans onto a building footprint — that padded ring is LAND
    if (Units.isNaval && Units.isNaval(u)) return null;
    let b = null;
    const pose = this.unitPose(u);
    if (u.task && u.task.type === 'build') {
      if (pose !== 'build') return null;              // still walking up: no lean
      b = Bld.get(u.task.id);
    } else if (u.tBld && !CFG.UNITS[u.kind].rng && (pose === 'fight' || pose === 'guard')) {
      // a MELEE attacker squares up to the wall it batters (operator report:
      // a champion swinging from the middle of the next tile). Ranged kinds
      // are excluded on purpose — their arrows spawn at the sim position,
      // and a leaned archer would loose from behind its own sprite.
      b = Bld.get(u.tBld);
    }
    if (!b) return null;
    const sz = (Bld.def(b.key) && Bld.def(b.key).size) || 1;
    const pad = 0.38;                                  // sprite centre just off the wall
    const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + sz + pad, y1 = b.y + sz + pad;
    let lx = Math.max(x0, Math.min(u.x, x1));
    let ly = Math.max(y0, Math.min(u.y, y1));
    if (lx > x0 && lx < x1 && ly > y0 && ly < y1) {
      // standing inside the padded ring (a site tile): push OUT the short way
      const dl_ = Math.min(lx - x0, x1 - lx), dr_ = Math.min(ly - y0, y1 - ly);
      if (dl_ <= dr_) lx = (lx - x0 < x1 - lx) ? x0 : x1;
      else ly = (ly - y0 < y1 - ly) ? y0 : y1;
    }
    const dx = lx - u.x, dy = ly - u.y, dl = Math.hypot(dx, dy);
    if (dl < 0.05) return null;                        // already at the wall
    const CAP = 1.35;
    if (dl > CAP) { lx = u.x + dx / dl * CAP; ly = u.y + dy / dl * CAP; }
    return { x: lx, y: ly };
  },
  unitBox(u) {
    const b = window.Assets && Assets.UNIT_BOX && Assets.UNIT_BOX[u.kind];
    return (b && this.sheetUnit(u)) ? b : CFG.TILE;
  },
  // the shadow itself: a flat ellipse at the feet, in the same ink and
  // alpha the procedural beasts use, so a sheet animal and a drawn one
  // sit on the ground identically (scaled with the kind's draw box)
  drawUnitShadow(g, u, wx, wy) {
    const TL = CFG.TILE, s = this.unitBox(u) / TL;
    g.fillStyle = 'rgba(20,16,10,0.26)';
    g.beginPath();
    g.ellipse((wx != null ? wx : u.x) * TL, (wy != null ? wy : u.y) * TL + 11, 8 * s, 3 * s, 0, 0, Math.PI * 2);
    g.fill();
  },

  unitSprite(u) {
    /* CHARACTER-CLASS PNG SHEETS (Assets.unitArt — animals first, the
       villagers later): 8 directions × real frame counts, preferred over
       the procedural sheet PER LOOKUP — a kind shipping only its south
       walk still falls back everywhere else, and deleting the PNGs
       restores the procedural cast untouched. */
    const fr2 = this.sheetFrames(u);
    if (fr2 && fr2.length) {
      if (this._sheetHold) return fr2[0];   // standing on borrowed walk legs: hold the stance
      // fps by the SHEET's key (villager variants carry their own rate;
      // the 2-frame procedural villager below keeps its own 4fps default)
      const fps2 = (Sprites.animFps && (Sprites.animFps[this._sheetKey] || Sprites.animFps[u.kind])) || 8;
      /* THE IDLE DWELLS AND SNAPS (two operator reports, one lesson).
         First report: the walk-derived rate ran the 12-frame graze once a
         second — "like they're tweaking out". A flat 3× slowdown answered
         it and earned the second report: now the HEAD RISES in slow
         motion. What reads natural is neither: an animal HOLDS its poses
         and MOVES between them — long head-down eating, long head-up
         watching, and the swing between at the old quick tempo. So the
         idle runs on a warped clock: a 3×-length cycle whose phase
         plateaus at its two opposite poses (the sin-warp, applied twice
         for sharp dwells) and sweeps quickly through the transitions —
         the same shape serves the wolf scenting the air and the bear's
         sway. Walks and fights stay on the straight clock. */
      // …but water never dwells: a boat's idle is a bob, and a bob that
      // plateaus reads as running aground. Hulls ride the straight clock.
      if (this._sheetPose === 'idle' &&
          !(typeof Units !== 'undefined' && Units.isNaval && Units.isNaval(u))) {
        // 4×, not arbitrary: the double sin-warp's peak phase speed is 4×
        // its average, so a 4×-length cycle swings the head at EXACTLY the
        // walk-clock tempo it always had — only the holds got long.
        const cyc = (fr2.length / fps2) * 4;
        let ph = (u.animT % cyc) / cyc;
        const w = (x) => x - Math.sin(4 * Math.PI * x) / (4 * Math.PI);
        ph = w(w(ph));
        return fr2[Math.min(fr2.length - 1, (ph * fr2.length) | 0)];
      }
      return fr2[((u.animT * fps2) | 0) % fr2.length];
    }
    let sheet;
    if (u.kind === 'villager') {
      const tunic = G.tunicOf(u.owner);
      sheet = (u.female && Sprites.villagerF[tunic]) || Sprites.villager[tunic] || Sprites.unit.villager;
    } else if ((u.kind === 'raider' || u.kind === 'brute') && Sprites.barbFor) {
      /* THE FIVE PEOPLES (CFG.TRIBES, tests/raider-camps.mjs): a war band wears
         the look of the people that raised it — the camp's own, for its whole
         life — and its men and women are drawn apart like the villages'. */
      const set = Sprites.barbFor(u.tribe);
      sheet = (set[u.kind] || set.raider)[u.female ? 1 : 0];
    } else {
      // military units wear the village colour on their collar/stripe; barbarians,
      // siege engines and civilian boats fall through to their single sheet
      const mil = Sprites.militaryFor && Sprites.militaryFor(G.tunicOf(u.owner));
      sheet = (mil && mil[u.kind]) || Sprites.unit[u.kind] || Sprites.unit.villager;
    }
    let up = this.unitPose(u);   // once — the pose gate does real work now
    // the four terraform crafts exist only on the sapper's hand-drawn
    // sheets; the procedural rig folds them back onto its 'work' swing
    if (this.TERRA_POSES[up] && !sheet[up] && sheet.work) up = 'work';
    const pose = sheet[up] ? up : (sheet.walk ? 'walk' : 'idle');
    const fr = sheet[pose];
    // beasts run their longer cycles faster than a villager's four frames a
    // second, so an 8-frame stride still reads as one stride (Sprites.animFps)
    const fps = (Sprites.animFps && Sprites.animFps[u.kind]) || 4;
    return fr[((u.animT * fps) | 0) % fr.length];
  },

  /* WHERE THE DAY IS in the dusk cycle, once per frame: after ~10 bright
     days night eases in and out across ~2 (k), with a warm glow either side
     of the dark (warm). The ?dev=1 Land bench can HOLD a moment of it for a
     screenshot (DevArt.forceDayF — golden hour is 10.16); render-only,
     never in S. Read by the dusk tint at the end of draw and by the
     living water's sparkle (1d), which brightens and warms at the peak. */
  dayPhase() {
    const dayF = (window.DevArt && DevArt.on && DevArt.forceDayF != null) ? +DevArt.forceDayF
      : ((S.day - 1) % 12) + Math.min(1, S.dayT / CFG.DAY_MS);
    let k = 0;
    if (dayF > 10) k = Math.sin((dayF - 10) / 2 * Math.PI);
    const warm = k > 0.02 ? 0.07 * Math.sin(Math.min(1, k * 2) * Math.PI) : 0;   // dusk/dawn glow
    return { dayF, k, warm };
  },

  /* THE FOAM LINE'S GEOMETRY (1b), cut once per water change and keyed like
     the body path: every traced loop walked at ONE PIXEL of arc length,
     each step a point (x, y, and its place in the 8px dash period), in
     runs of FOAM_CHUNK points with a bounding box and a mid tile, so a
     frame touches only the runs inside the viewport and the dash phase
     carries across the cuts. NOT a dashed Path2D stroke: that was the
     first cut, and with a forced flush it cost 0.34ms of software raster
     on the water view against 0.10ms for the same dashes as 1px rects —
     the dash machinery is what a rasterizer pays for, not the pixels.
     Int16, ~6 bytes a point, ~60KB on the biggest map. Runs whose shore is
     a dug channel or reclaimed ground raise no foam — the shore layer's
     own rule for the wet lip. */
  FOAM_CHUNK: 96,
  _foam: null, _foamKey: '',
  foamChunks() {
    const key = this.waterKey();
    if (this._foamKey === key && this._foam) return this._foam;
    const TL = CFG.TILE, W = CFG.W, H = CFG.H, terr = (S.map.seenTerrain || S.map.terrain);
    const natural = (p, a, b) => {
      const nx = (b[1] - a[1]), ny = -(b[0] - a[0]);          // outward, as buildShoreLayer
      const len = Math.hypot(nx, ny) || 1;
      const ox = nx / len, oy = ny / len;
      const wx = Math.floor(p[0] - ox * 0.8), wy = Math.floor(p[1] - oy * 0.8);
      if (wx >= 0 && wy >= 0 && wx < W && wy < H && terr[wy * W + wx] === T.MOAT) return 0;
      const lx = Math.floor(p[0] + ox * 0.8), ly = Math.floor(p[1] + oy * 0.8);
      if (lx < 0 || ly < 0 || lx >= W || ly >= H) return 1;
      return (S.map.reclaimed && S.map.reclaimed[ly * W + lx]) ? 0 : 1;
    };
    const out = [], N = this.FOAM_CHUNK;
    let buf = new Int16Array(N * 3), fill = 0, natSum = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, mx = 0, my = 0;
    const flush = () => {
      if (fill >= 6 && natSum / (fill / 3) >= 0.5)
        out.push({ pts: buf.slice(0, fill), x0, y0, x1, y1, mx, my });
      buf = new Int16Array(N * 3); fill = 0; natSum = 0; x0 = 1e9; y0 = 1e9; x1 = -1e9; y1 = -1e9;
    };
    for (const reg of this.waterRegions()) for (const loop of reg.loops) {
      const n = loop.length;
      if (n < 8) continue;
      let s = 0, next = 0;
      for (let i = 0; i < n; i++) {
        const a = loop[i], b = loop[(i + 1) % n];
        const ax = a[0] * TL, ay = a[1] * TL, bx = b[0] * TL, by = b[1] * TL;
        const len = Math.hypot(bx - ax, by - ay);
        if (!(len > 0)) continue;
        const nat = natural(a, loop[(i - 1 + n) % n], b);
        while (next <= s + len) {
          const t = (next - s) / len, px = Math.round(ax + (bx - ax) * t), py = Math.round(ay + (by - ay) * t);
          if (fill === 0) { mx = Math.floor(a[0]); my = Math.floor(a[1]); }
          buf[fill] = px; buf[fill + 1] = py; buf[fill + 2] = next & 7; fill += 3; natSum += nat;
          if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
          if (fill === N * 3) flush();
          next++;
        }
        s += len;
      }
      flush();                                              // a loop never shares a run
    }
    this._foam = out; this._foamKey = key;
    return out;
  },

  /* THE LIVING WATER (the frame's water pass — 1b, 1c, 1d). Viewport-only,
     drawn before the mountains-and-units pass on purpose: all of it lives
     ON the water's surface, so a hull floats OVER a jumping fish, never
     under one (the operator's transport-raft report). R._prof, when a test
     sets it, accumulates the foam stroke and the tile pass separately so
     the new frame work can be measured in isolation. */
  _prof: null,
  drawLivingWater(g, dt) {
    const TL = CFG.TILE;
    this.fishClock = (this.fishClock || 0) + dt;
    const t0 = this.fishClock, prof = this._prof;
    /* ---- THE MOVING SURFACE (the motion pass). Two seamless authored
       textures scrolled over the body, clipped to the water: the SURFACE
       (near-white ground, darker wavelet arcs — installed grayscale so
       MULTIPLY modulates the ramp without recolouring it) on one slow
       diagonal, and the SHIMMER (glints on pure black, which adds nothing
       under 'lighter') on a different heading and speed — two rates never
       in sync is the anti-tiling mechanism. Each pattern is created ONCE
       per installed texture and only the offset moves; offsets snap to
       whole pixels so the pattern never smears. LOD: the shimmer stands
       down first (SHIM_MINZ), then the surface (SURF_MINZ) — the bake
       carries the zoomed-out view. The dusk tint and the fog are painted
       after this pass, so both apply to all of it for free. ---- */
    const vx0 = this.cam.x - TL, vy0 = this.cam.y - TL;
    const vx1 = this.cam.x + this.viewW() / this.cam.z + TL, vy1 = this.cam.y + this.viewH() / this.cam.z + TL;
    const fx = (window.Assets && Assets.waterFx) || null;
    if (fx && this.cam.z >= LAND.SURF_MINZ &&
        ((fx.surface && LAND.SURF_ALPHA > 0) || (fx.shimmer && LAND.SHIM_ALPHA > 0 && this.cam.z >= LAND.SHIM_MINZ))) {
      const tA = prof ? performance.now() : 0;
      /* NOT A CLIP. Rasterizing the whole-map body path as a clip EVERY
         FRAME cost over a millisecond on its own — the same lesson the
         bake learnt at 740ms and solved the same way. The visible water
         is gathered into per-row RUNS of wet tiles (a few dozen rects)
         and each layer fills those directly; the traced line cuts at
         most a corner sliver inside a shore tile, and at these alphas a
         modulation layer spilling onto that sliver is invisible where a
         clip would have been ruinous. */
      const terrF = S.map.seenTerrain || S.map.terrain;
      const wetF = v => v === T.WATER || v === T.MOAT;
      const runs = this._fxRuns || (this._fxRuns = []);
      runs.length = 0;
      const tx0 = Math.max(1, (vx0 / TL) | 0), ty0 = Math.max(1, (vy0 / TL) | 0);
      const tx1 = Math.min(CFG.W - 2, (vx1 / TL) | 0), ty1 = Math.min(CFG.H - 2, (vy1 / TL) | 0);
      for (let ty = ty0; ty <= ty1; ty++) {
        let run = -1;
        for (let tx = tx0; tx <= tx1 + 1; tx++) {
          const w = tx <= tx1 && wetF(terrF[ty * CFG.W + tx]);
          if (w && run < 0) run = tx;
          else if (!w && run >= 0) { runs.push(ty, run, tx); run = -1; }
        }
      }
      if (runs.length) {
        g.save();
        g.imageSmoothingEnabled = false;
        if (fx.surface && LAND.SURF_ALPHA > 0) {
          if (this._surfPatFor !== fx.surface) { this._surfPat = g.createPattern(fx.surface, 'repeat'); this._surfPatFor = fx.surface; }
          const o = t0 * LAND.SURF_SPEED, ox = Math.round(o * 0.7071), oy = Math.round(o * 0.7071);
          g.globalAlpha = LAND.SURF_ALPHA;
          g.translate(ox, oy); g.fillStyle = this._surfPat;
          for (let k = 0; k < runs.length; k += 3)
            g.fillRect(runs[k + 1] * TL - ox, runs[k] * TL - oy, (runs[k + 2] - runs[k + 1]) * TL, TL);
          g.translate(-ox, -oy);
        }
        if (fx.shimmer && LAND.SHIM_ALPHA > 0 && this.cam.z >= LAND.SHIM_MINZ) {
          if (this._shimPatFor !== fx.shimmer) { this._shimPat = g.createPattern(fx.shimmer, 'repeat'); this._shimPatFor = fx.shimmer; }
          const o = t0 * LAND.SHIM_SPEED, ox = Math.round(-o * 0.5), oy = Math.round(o * 0.866);
          g.globalAlpha = LAND.SHIM_ALPHA;
          g.translate(ox, oy); g.fillStyle = this._shimPat;
          for (let k = 0; k < runs.length; k += 3)
            g.fillRect(runs[k + 1] * TL - ox, runs[k] * TL - oy, (runs[k + 2] - runs[k + 1]) * TL, TL);
          g.translate(-ox, -oy);
        }
        g.restore();
      }
      if (prof) prof.scroll += performance.now() - tA;
    }
    // ---- 1b: the BASE WATERLINE — cached 1px points along the traced shore,
    // lit three of every eight, the pattern creeping FOAM_SPEED px a second,
    // the alpha breathing by FOAM_PULSE. Parallel to the shore because it IS
    // the shore. Quiet everywhere; the wave roll below is the event. ----
    if (LAND.FOAM_LINE > 0 && this.cam.z >= LAND.FOAM_MINZ) {
      const tA = prof ? performance.now() : 0;
      const a = LAND.FOAM_LINE * (1 - LAND.FOAM_PULSE + LAND.FOAM_PULSE * (0.5 + 0.5 * Math.sin(t0 * 1.3)));
      const creep = Math.round(t0 * LAND.FOAM_SPEED);
      g.fillStyle = 'rgba(235,244,248,' + a.toFixed(3) + ')';
      for (const c of this.foamChunks()) {
        if (c.x1 < vx0 || c.x0 > vx1 || c.y1 < vy0 || c.y0 > vy1) continue;
        if (!G.visibleAt(c.mx, c.my)) continue;
        const P = c.pts;
        for (let k = 0; k < P.length; k += 3)
          if (((P[k + 2] + creep) & 7) < 3) g.fillRect(P[k], P[k + 1], 1, 1);
      }
      if (prof) prof.foam += performance.now() - tA;
    }
    // ---- the tile pass: drifting sparkle, foam dots, ripples, the one fish ----
    const tB = prof ? performance.now() : 0;
    /* WHICH FISH, AND WHEN. One leap per FISH_EVERY seconds: the epoch picks
       a spot out of the good fishing water (rebuilt each epoch, so a shoal
       that has been fished out drops off the list), and only that tile
       animates. Everything else ripples. */
    const every = Math.max(1, +LAND.FISH_EVERY || 30);
    const ep = Math.floor(t0 / every);
    if (ep !== this._fishEpoch) {
      this._fishEpoch = ep;
      const spots = this.fishSpots();
      this._fishPick = spots.length ? spots[(Math.imul(ep + 1, 0x9e3779b1) >>> 8) % spots.length] : null;
    }
    const pick = this._fishPick, fishT = t0 - ep * every;
    const fishOn = !!pick && fishT < LAND.FISH_TIME * 2 + 0.6;
    const RA = +LAND.RIPPLE || 0, RG = Math.max(1, LAND.RIPPLE_GATE | 0);
    const RE = Math.max(0.5, +LAND.RIPPLE_EVERY || 7), RL = Math.max(0.2, +LAND.RIPPLE_LEN || 1.5);
    // 1d, in two lines: at golden hour the sparkle brightens by SPARKLE_GOLD and warms
    const wk = Math.min(1, (this._dusk || this.dayPhase()).warm / 0.07);
    const spark = wk > 0.01 ? 'rgba(' + Math.round(190 + 65 * wk) + ',' + Math.round(224 - 10 * wk) + ',' + Math.round(238 - 88 * wk)
      + ',' + (0.45 * (1 + (LAND.SPARKLE_GOLD - 1) * wk)).toFixed(3) + ')' : 'rgba(190,224,238,0.45)';
    const terr = S.map.terrain;
    // clamp to the PLAYABLE interior (1 … W-2): the outer ring is off-map black
    // void, so no fish jump, no sparkle, no foam is drawn on it (see R.drawTile)
    const x0 = Math.max(1, (this.cam.x / TL) | 0), y0 = Math.max(1, (this.cam.y / TL) | 0);
    const x1 = Math.min(CFG.W - 2, ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0);
    const y1 = Math.min(CFG.H - 2, ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0);
    const wet = v => v === T.WATER || v === T.MOAT;   // moats animate like the lake
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = MapGen.idx(x, y);
      if (!wet(terr[i])) continue;
      if (!G.visibleAt(x, y)) continue;
      const h = (x * 73856093 ^ y * 19349663) >>> 0;
      if (h % 3 === 0) {                                  // slow drifting sparkle dash
        const ph = t0 * 0.6 + (h % 13);
        const sx = x * TL + 4 + (Math.sin(ph) * 0.5 + 0.5) * (TL - 14);
        const sy = y * TL + 5 + ((h >> 4) % (TL - 10));
        g.fillStyle = spark;
        g.fillRect(sx | 0, sy | 0, 5, 2);
      }
      // (the blinking foam dots lived here; the authored foam sprites along
      // the traced shoreline replaced them — drawn after the tile pass)
      // the ONE leap, on the good fishing water this epoch chose
      if (fishOn && x === pick[0] && y === pick[1]) this.drawFishJump(g, x, y, h, fishT);
      // …and the quiet surface everywhere else: a slow ring on its own clock
      else if (RA > 0 && (h % RG) === 0) {
        const ph = t0 / RE + ((h >>> 7) % 997) / 997;
        const k = (ph - Math.floor(ph)) * RE;                // seconds into this tile's cycle
        if (k < RL) {
          const kk = k / RL, lw = g.lineWidth;
          g.globalAlpha = RA * (1 - kk) * (1 - kk);
          g.strokeStyle = '#cfe6ee'; g.lineWidth = 1;
          const rr = TL * (0.08 + kk * 0.26);
          g.beginPath(); g.ellipse(x * TL + 16, y * TL + 16, rr, rr * 0.55, 0, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1; g.lineWidth = lw;
        }
      }
    }
    if (prof) prof.tiles += performance.now() - tB;
    /* ---- THE WAVE ROLL (the motion pass): a wave is an EVENT, not
       ambience — the fish model on the shoreline. Every WAVE_EVERY
       seconds the epoch picks ONE eligible beach stretch from the shore
       visible at that moment (wavePick: sandy, not rocky, not moat) and
       an authored crest breaks there once: its long axis lies along the
       LOCAL SHORE TANGENT — sampled from the traced polyline under the
       placement — and its motion is along the shore normal, WAVE_PUSH px
       landward and back. A curved stretch splits the roll into two short
       crests, each on its own tangent. The line is parallel to shore;
       the movement is onto shore; never the reverse. One pass through
       the frames per roll, alpha enveloped in and out. Absent art means
       no wave — the base waterline above carries the shore alone. ---- */
    const wv = fx && fx.waves;
    if (wv && wv.length && LAND.WAVE_ALPHA > 0 && this.cam.z >= LAND.FOAM_MINZ) {
      const tA = prof ? performance.now() : 0;
      const wevery = Math.max(4, +LAND.WAVE_EVERY || 14);
      const wep = Math.floor(t0 / wevery);
      if (wep !== this._waveEpoch) { this._waveEpoch = wep; this._wavePick = this.wavePick(wep); }
      const wp = this._wavePick, wt = t0 - wep * wevery, WT = Math.max(0.5, +LAND.WAVE_TIME || 2.8);
      if (wp && wt < WT) {
        const p = wt / WT;
        const env = Math.max(0, Math.min(1, p / 0.18) * Math.min(1, (1 - p) / 0.28));
        // landward over the first half, receding through the second, still by 7/8
        const push = LAND.WAVE_PUSH * Math.sin(Math.PI * Math.min(1, p * 1.15));
        // the crests render in a small scratch, are kept 'destination-in'
        // the pick's beach mask (the clamp), and land on the frame as one
        // little blit — see wavePick for why it is built this way
        const sc = this._waveScratchC, drawTo = wp.mask ? sc.getContext('2d') : g;
        if (wp.mask) {
          drawTo.setTransform(1, 0, 0, 1, 0, 0);
          drawTo.globalCompositeOperation = 'source-over';
          drawTo.clearRect(0, 0, wp.mw, wp.mh);
          drawTo.imageSmoothingEnabled = false;
          drawTo.translate(-wp.mx0, -wp.my0);
        } else {
          g.globalAlpha = LAND.WAVE_ALPHA * env;
        }
        for (const sg of wp.segs) {
          const F = wv[sg.v] || wv[0];
          const fr = F[Math.min(F.length - 1, (p * F.length) | 0)];
          drawTo.save();
          drawTo.translate(sg.x + sg.nx * push, sg.y + sg.ny * push);
          drawTo.rotate(sg.ang);
          if (sg.m) drawTo.scale(-1, 1);         // the second crest of a split mirrors
          // the crest line is authored ~70% down the canvas: anchor it on the shore
          drawTo.drawImage(fr, -(fr.width >> 1), -Math.round(fr.height * 0.7));
          drawTo.restore();
        }
        if (wp.mask) {
          drawTo.setTransform(1, 0, 0, 1, 0, 0);
          drawTo.globalCompositeOperation = 'destination-in';
          drawTo.drawImage(this._waveMaskC, 0, 0, wp.mw, wp.mh, 0, 0, wp.mw, wp.mh);
          drawTo.globalCompositeOperation = 'source-over';
          g.globalAlpha = LAND.WAVE_ALPHA * env;
          const sm = g.imageSmoothingEnabled;
          g.imageSmoothingEnabled = false;      // a bilinear blit smears foam a
          g.drawImage(sc, 0, 0, wp.mw, wp.mh, wp.mx0, wp.my0, wp.mw, wp.mh);
          g.imageSmoothingEnabled = sm;         // pixel past the clamp's edge
        }
        g.globalAlpha = 1;
      }
      if (prof) prof.foam += performance.now() - tA;
    }
    if (prof) prof.frames++;
  },

  /* THE BEACH WORTH BREAKING ON: candidate stretches of the shore visible
     right now, rebuilt when the wave epoch turns (an O(visible shoreline)
     walk every WAVE_EVERY seconds — nothing). A stretch qualifies when the
     water side is open water (never a moat), the land behind it is not
     rocky (no mountain, no hills), and the trace is straight enough at
     crest scale to lie a sprite on. The pick carries everything the draw
     needs precomputed: segment centres, angles, landward normals. */
  _waveEpoch: -1, _wavePick: null,
  wavePick(ep) {
    if (!S || !S.map) return null;
    const TL = CFG.TILE, W = CFG.W, H = CFG.H, terr = S.map.terrain;
    const vx0 = this.cam.x - TL, vy0 = this.cam.y - TL;
    const vx1 = this.cam.x + this.viewW() / this.cam.z + TL, vy1 = this.cam.y + this.viewH() / this.cam.z + TL;
    const SPAN = 24 * 3, STRIDE = 48 * 3;         // tangent span and candidate spacing, in flat triplets
    const cand = [];
    for (const c of this.foamChunks()) {
      if (c.x1 < vx0 || c.x0 > vx1 || c.y1 < vy0 || c.y0 > vy1) continue;
      if (!G.visibleAt(c.mx, c.my)) continue;
      const P = c.pts;
      for (let k = SPAN; k < P.length - SPAN - 1; k += STRIDE) {
        const px = P[k], py = P[k + 1];
        if (px < vx0 || px > vx1 || py < vy0 || py > vy1) continue;
        if (!this.waveTangent(P, k, SPAN, terr, W, H, TL)) continue;
        cand.push([c, k]);
      }
    }
    if (!cand.length) return null;
    const [c, k] = cand[(Math.imul(ep + 1, 0x85ebca6b) >>> 8) % cand.length];
    const P = c.pts, base = this.waveTangent(P, k, SPAN, terr, W, H, TL);
    // curvature at crest scale: if the half-span tangents disagree hard,
    // split the roll into two short crests, each on its own local tangent
    const S2 = 18 * 3, OFF = 15 * 3;
    const tA2 = this.waveTangent(P, Math.max(S2, k - OFF), S2, terr, W, H, TL);
    const tB2 = this.waveTangent(P, Math.min(P.length - S2 - 1, k + OFF), S2, terr, W, H, TL);
    const segs = [];
    if (tA2 && tB2 && (tA2.tx * tB2.tx + tA2.ty * tB2.ty) < 0.94) {
      const kA = Math.max(S2, k - OFF), kB = Math.min(P.length - S2 - 1, k + OFF);
      segs.push({ x: P[kA], y: P[kA + 1], ang: Math.atan2(tA2.ty, tA2.tx), nx: tA2.nx, ny: tA2.ny, v: 2 });
      segs.push({ x: P[kB], y: P[kB + 1], ang: Math.atan2(tB2.ty, tB2.tx), nx: tB2.nx, ny: tB2.ny, v: 2, m: -1 });
    } else {
      const h = (P[k] * 73856093 ^ P[k + 1] * 19349663) >>> 0;
      segs.push({ x: P[k], y: P[k + 1], ang: Math.atan2(base.ty, base.tx), nx: base.nx, ny: base.ny, v: h % 2 });
    }
    /* THE CLAMP. The roll may wash to the DRAWN beach's inland edge — the
       exact rings buildShoreLayer filled, pinch-outs and rock gating
       included — and never a pixel past it onto grass, trees or rock. The
       eligible region (local water tiles plus the nearby stretch of each
       captured ring as a quad-strip polygon) is filled ONCE per pick into a
       small bake-allocated mask canvas; each live frame draws the crests
       into a scratch of the same size, keeps them 'destination-in' the
       mask, and blits — every per-frame op is bounded by the roll's own
       little box. Never a terrain test per frame, never the whole-map body
       path (the bake's 740ms lesson), never a canvas made in the loop. */
    const mc = this._waveMaskC;
    if (!mc) return { segs, mask: null };
    // the box hugs the crests: half the sprite diagonal plus the push is
    // every pixel a rotated crest can reach — the per-frame ops below are
    // priced by THIS area, so it stays the size of the roll, not a pad
    const pad = 42;
    let cx0 = 1e9, cy0 = 1e9, cx1 = -1e9, cy1 = -1e9;
    for (const sg of segs) {
      if (sg.x - pad < cx0) cx0 = sg.x - pad; if (sg.x + pad > cx1) cx1 = sg.x + pad;
      if (sg.y - pad < cy0) cy0 = sg.y - pad; if (sg.y + pad > cy1) cy1 = sg.y + pad;
    }
    if (cx1 - cx0 > mc.width) { const c = (cx0 + cx1) / 2; cx0 = c - mc.width / 2; cx1 = c + mc.width / 2; }
    if (cy1 - cy0 > mc.height) { const c = (cy0 + cy1) / 2; cy0 = c - mc.height / 2; cy1 = c + mc.height / 2; }
    cx0 = Math.floor(cx0); cy0 = Math.floor(cy0);
    const mw = Math.min(mc.width, Math.ceil(cx1 - cx0)), mh = Math.min(mc.height, Math.ceil(cy1 - cy0));
    const mg = mc.getContext('2d');
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.clearRect(0, 0, mc.width, mc.height);
    mg.translate(-cx0, -cy0);
    mg.fillStyle = '#fff';
    mg.beginPath();
    const ctx0 = Math.max(0, (cx0 / TL) | 0), cty0 = Math.max(0, (cy0 / TL) | 0);
    const ctx1 = Math.min(W - 1, (cx1 / TL) | 0), cty1 = Math.min(H - 1, (cy1 / TL) | 0);
    for (let ty = cty0; ty <= cty1; ty++) for (let tx = ctx0; tx <= ctx1; tx++)
      if (terr[ty * W + tx] === T.WATER) mg.rect(tx * TL, ty * TL, TL, TL);
    for (const st of (this._beachStrips || [])) {
      if (st.x1 < cx0 || st.x0 > cx1 || st.y1 < cy0 || st.y0 > cy1) continue;
      const p2 = st.p, m = p2.length / 4;
      let run = -1;
      for (let i = 0; i <= m; i++) {
        const ok = i < m && p2[i * 4] >= cx0 && p2[i * 4] <= cx1 && p2[i * 4 + 1] >= cy0 && p2[i * 4 + 1] <= cy1;
        if (ok && run < 0) run = i;
        else if (!ok && run >= 0) {
          if (i - run >= 2) {
            mg.moveTo(p2[run * 4], p2[run * 4 + 1]);
            for (let j = run + 1; j < i; j++) mg.lineTo(p2[j * 4], p2[j * 4 + 1]);
            for (let j = i - 1; j >= run; j--) mg.lineTo(p2[j * 4 + 2], p2[j * 4 + 3]);
            mg.closePath();
          }
          run = -1;
        }
      }
    }
    mg.fill();
    mg.setTransform(1, 0, 0, 1, 0, 0);
    /* HARDEN THE EDGE. The fill antialiases, and a crest through a 30%-alpha
       fringe pixel is still foam past the beach. Four destination-in
       self-draws raise every alpha to its 16th power: the interior (1.0)
       holds, the fringe collapses to nothing — the mask CONTRACTS by its
       own antialiasing, which is the conservative direction. */
    mg.globalCompositeOperation = 'destination-in';
    for (let i = 0; i < 4; i++) mg.drawImage(mc, 0, 0, mw, mh, 0, 0, mw, mh);
    mg.globalCompositeOperation = 'source-over';
    return { segs, mask: true, mx0: cx0, my0: cy0, mw, mh };
  },

  /* The local shore frame at point k of a chunk polyline: unit tangent
     along the trace and unit normal pointing LANDWARD (verified against
     the terrain, not trusted from the winding). Returns null where the
     trace folds too tightly, the land behind is rocky, or the water in
     front is a moat — i.e. where no wave belongs. */
  waveTangent(P, k, span, terr, W, H, TL) {
    let tx = P[k + span] - P[k - span], ty = P[k + span + 1] - P[k - span + 1];
    const tl = Math.hypot(tx, ty);
    if (tl < span / 3 * 1.7) return null;          // folded back on itself
    tx /= tl; ty /= tl;
    let nx = ty, ny = -tx;                         // landward by the trace's winding…
    const px = P[k], py = P[k + 1];
    let lx = ((px + nx * 10) / TL) | 0, ly = ((py + ny * 10) / TL) | 0;
    if (lx < 1 || ly < 1 || lx >= W - 1 || ly >= H - 1) return null;
    let lt = terr[ly * W + lx];
    if (lt === T.WATER || lt === T.MOAT) {         // …but verified, never trusted
      nx = -nx; ny = -ny; tx = -tx; ty = -ty;
      lx = ((px + nx * 10) / TL) | 0; ly = ((py + ny * 10) / TL) | 0;
      if (lx < 1 || ly < 1 || lx >= W - 1 || ly >= H - 1) return null;
      lt = terr[ly * W + lx];
      if (lt === T.WATER || lt === T.MOAT) return null;
    }
    if (lt === T.MOUNTAIN || lt === T.HILLS) return null;
    const wx = ((px - nx * 10) / TL) | 0, wy = ((py - ny * 10) / TL) | 0;
    if (wx < 0 || wy < 0 || wx >= W || wy >= H || terr[wy * W + wx] !== T.WATER) return null;
    return { tx, ty, nx, ny };
  },
  /* THE WATER WORTH FISHING: the shoals whose stock is still a real share
     of the best one's. MapGen.shoal is a pure hash of the tile, so the set
     of spots never moves; the STOCK does, so this is rebuilt each epoch
     (once every FISH_EVERY seconds — an O(map) scan at that rate is
     nothing) and a fished-out shoal quietly drops out of the rotation. */
  _fishEpoch: -1, _fishPick: null,
  fishSpots() {
    if (typeof MapGen === 'undefined' || !MapGen.shoal || !S || !S.map || !S.map.resAmount) return [];
    const W = CFG.W, H = CFG.H, res = S.map.resAmount, all = [];
    let best = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!res[i] || !MapGen.shoal(x, y)) continue;
      all.push([x, y, res[i]]);
      if (res[i] > best) best = res[i];
    }
    const floor = best * Math.max(0, Math.min(1, +LAND.FISH_STOCK || 0));
    const rich = all.filter(s => s[2] >= floor);
    return (rich.length ? rich : all).map(s => [s[0], s[1]]);
  },

  /* ONE FISH, ONE JUMP (1c): tw is seconds into the cycle's jump window.
     A short per-tile delay so a lake full of shoals is not a metronome;
     then the arc — FISH_RISE px at the top of a sine over FISH_TIME up and
     the same down, the squashed frame around the peak — and on re-entry
     the authored splash frame, the ripple ring the bombard's water hit
     draws (same stroke, its own timeline: no pool, the tile hash and the
     clock are the state), and two or three droplets. Everything here is a
     stroke or a 2px rect, so the shore hooks in the bridge tests never
     see a plank. */
  drawFishJump(g, x, y, h, tw) {
    const TL = CFG.TILE, F = Sprites.misc.fish;
    const t = tw - ((h >>> 8) % 3) * 0.05;
    if (t < 0) return;
    const A = LAND.FISH_TIME * 2;
    // the authored leap, when a strip is installed: the sprite walks the
    // SAME arc the procedural fish flew, so nothing about the path, the
    // splash or the gating changes — only what the fish looks like
    const art = (window.Assets && Assets.fishFrames) ? Assets.fishFrames(h >>> 5) : null;
    if (t < A) {
      const k = t / A, rise = Math.round(Math.sin(k * Math.PI) * LAND.FISH_RISE);
      if (art) {
        const n = art.length, fr = art[Math.min(n - 1, (k * n) | 0)];
        const s = Math.round(TL * LAND.FISH_SIZE), o = (TL - s) >> 1;
        g.drawImage(fr, 0, 0, fr.width, fr.height, x * TL + o, y * TL + o - rise, s, s);
        return;
      }
      const fr = (k > 0.35 && k < 0.65 && F[2]) ? F[2] : F[0];
      g.drawImage(fr, x * TL, y * TL - rise);
      return;
    }
    const k = (t - A) / 0.4;                               // the splash
    if (k >= 1) return;
    if (k < 0.5) g.drawImage(F[1], x * TL, y * TL);
    const cx = x * TL + 15, cy = y * TL + 15, lw = g.lineWidth;
    g.globalAlpha = 0.3 * (1 - k);
    g.strokeStyle = '#dceef4'; g.lineWidth = 1.5;
    // the bombard's ring at a fish's size: half a tile at most, not a shell's
    const rr = TL * (0.15 + k * 0.35);
    g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.55, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = ART.PALETTE.bone[2];
    const nd = 2 + ((h >> 12) & 1);
    for (let d = 0; d < nd; d++) {
      const dx = ((h >> (14 + d * 3)) % 7) - 3;
      const px = cx + dx * (2 + k * 6), py = cy - Math.sin(k * Math.PI) * (6 + d * 3) + k * 4;
      g.fillRect(px | 0, py | 0, 2, 2);
    }
    g.globalAlpha = 1; g.lineWidth = lw;
  },

  draw(dt) {
    if (!S) return;
    /* A DUE BAKE IS PAID IN FULL BEFORE THE WORLD IS PLAYED, and only then.
       On a shell screen — the draft, which is where founding a run leaves it
       (R.deferBake) — the frame loop spreads it over frames with tickBake
       instead, and the map fills in behind the cards. Entering the game can
       never show a half-painted world, because this forces the rest. */
    if (window.Screens && Screens.current === 'playing') this.ensureTerrain();
    const g = this.g, TL = CFG.TILE, z = this.cam.z * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d0b08';
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    if (!this.terrainCache) return;          // the bake has not laid its canvas yet
    this._dusk = this.dayPhase();            // read once: the sparkle and the dusk tint share it
    g.setTransform(z, 0, 0, z, -this.cam.x * z, -this.cam.y * z);
    g.imageSmoothingEnabled = false;

    // terrain
    g.drawImage(this.terrainCache, 0, 0);
    // formation art — multi-tile drawn landforms composed over whole regions
    // (js/formations.js): above the baked ground, below bridges, buildings,
    // units and the fog blit. Mountains are NOT drawn here — their formation
    // pieces feed the strip layer below so they keep occluding.
    if (window.Formations) Formations.drawLayer(g);
    // the WILDERNESS RELIC lies in the land the same way (js/relics.js):
    // above the ground, below everything that moves or stands
    if (window.Relics) Relics.draw(g);
    // …and the swards flattening before a new building lie in the grass they
    // came from — over the kept bake, under everything that moves or stands
    this.drawTamings(g, dt);
    // …but a tower still coming down keeps the ground it stood on (startCollapse)
    if (this.collapses.length) this.drawCollapseGround(g);

    // sapper bridges: faction-trimmed plank decks over water/moat (above terrain,
    // below units). Dynamic structures, so drawn per-frame, not baked into the cache.
    if (S.bridges && S.bridges.length) {
      const WP = ART.PALETTE.wood, ST = ART.PALETTE.stone;
      for (const br of S.bridges) {
        if (!S.map.explored[MapGen.idx(br.x, br.y)]) continue;
        const bx = br.x * TL, by = br.y * TL, lv = br.level || 1, dir = br.dir || 'h';
        const stone = lv >= 3;                                            // L3 deck is dressed stone
        const deck = stone ? ST[2] : WP[2], lit = stone ? ST[3] : WP[3], seam = stone ? ST[1] : WP[1];
        const fac = br.owner === 'P' ? ART.PALETTE.blue[2] : ART.PALETTE.red[2];
        if (dir === 'v') {   // deck spans N–S: planks run N–S (horizontal seams), rails E/W
          g.fillStyle = deck; g.fillRect(bx + 5, by, TL - 10, TL);
          g.fillStyle = lit; g.fillRect(bx + 5, by, 3, TL);
          g.fillStyle = seam; for (let py = 3; py < TL; py += 6) g.fillRect(bx + 5, by + py, TL - 10, 1);
          if (lv >= 2) { g.fillStyle = ST[1]; g.fillRect(bx + 4, by, TL - 8, 4); g.fillRect(bx + 4, by + TL - 4, TL - 8, 4); g.fillStyle = ST[3]; g.fillRect(bx + 4, by, 3, 4); g.fillRect(bx + 4, by + TL - 4, 3, 4); }  // stone piers
          g.fillStyle = fac; g.fillRect(bx + 4, by, 2, TL); g.fillRect(bx + TL - 6, by, 2, TL);
        } else {             // deck spans E–W: planks run E–W (vertical seams), rails N/S
          g.fillStyle = deck; g.fillRect(bx, by + 5, TL, TL - 10);
          g.fillStyle = lit; g.fillRect(bx, by + 5, TL, 3);
          g.fillStyle = seam; for (let px = 3; px < TL; px += 6) g.fillRect(bx + px, by + 5, 1, TL - 10);
          if (lv >= 2) { g.fillStyle = ST[1]; g.fillRect(bx, by + 4, 4, TL - 8); g.fillRect(bx + TL - 4, by + 4, 4, TL - 8); g.fillStyle = ST[3]; g.fillRect(bx, by + 4, 4, 3); g.fillRect(bx + TL - 4, by + 4, 4, 3); }  // stone piers
          g.fillStyle = fac; g.fillRect(bx, by + 4, TL, 2); g.fillRect(bx, by + TL - 6, TL, 2);
        }
        if (lv > 1) { g.fillStyle = ART.PALETTE.gold[2]; for (let i = 0; i < lv; i++) g.fillRect(bx + 4 + i * 4, by + TL / 2 - 1, 2, 2); }  // level pips
        /* WORKS ON THE SPAN: reinforcing to the next tier takes days and a
           sapper standing at it, so the bridge wears a work site — lashed
           poles along the rails and the usual gold build bar. It stays
           CROSSABLE the whole time; this is a re-facing, not a rebuild. */
        if (br.upgrading > 0) {
          // dressed blocks waiting along the span and straw-coloured lashings
          // over the rails: PALE marks, because at 32px anything in the deck's
          // own brown reads as a hole in the planking rather than work on it
          const TH2 = ART.PALETTE.thatch, ST2 = ART.PALETTE.stone;
          if (dir === 'v') {
            for (let py = 4; py < TL - 7; py += 9) {
              g.fillStyle = ST2[2]; g.fillRect(bx + 10, by + py, 12, 5);
              g.fillStyle = ST2[4]; g.fillRect(bx + 10, by + py, 12, 2);
            }
            g.fillStyle = TH2[2]; g.fillRect(bx + 6, by, 2, TL); g.fillRect(bx + TL - 8, by, 2, TL);
          } else {
            for (let px = 4; px < TL - 7; px += 9) {
              g.fillStyle = ST2[2]; g.fillRect(bx + px, by + 10, 5, 12);
              g.fillStyle = ST2[4]; g.fillRect(bx + px, by + 10, 2, 12);
            }
            g.fillStyle = TH2[2]; g.fillRect(bx, by + 6, TL, 2); g.fillRect(bx, by + TL - 8, TL, 2);
          }
          this.bar(g, bx + 3, by + TL - 4, TL - 6, 3, 1 - br.upgrading / (br.upTotal || 1), '#e8c15a');
        }
        if (br.hp < br.maxhp) this.bar(g, bx + 3, by - 3, TL - 6, 3, br.hp / br.maxhp, '#c98a4a');
      }
    }
    // BRIDGE PLACEMENT PREVIEW: with the bridge tool armed, tint nearby water
    // green where a bridge can span land-to-land, red where it can't
    if (window.UI && UI.terraMode === 'bridge' && UI.sel && UI.sel.type === 'unit') {
      const su = Units.get(UI.sel.id);
      if (su && su.kind === 'sapper') {
        for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
          const x = (su.x | 0) + dx, y = (su.y | 0) + dy;
          if (!MapGen.inB(x, y)) continue;
          const i = MapGen.idx(x, y), terr = S.map.terrain[i];
          if ((terr !== T.WATER && terr !== T.MOAT) || !S.map.explored[i] || Bld.bridgeAt(x, y)) continue;
          g.fillStyle = Terraform.bridgeCrossing(x, y, 'P') ? 'rgba(120,224,120,0.42)' : 'rgba(220,92,80,0.38)';
          g.fillRect(x * TL, y * TL, TL, TL);
        }
      }
    }

    // planned sapper work: a highlighted square on the tile being worked and on
    // every tile still queued behind it, so it's plain where the sapper is headed
    // and what it will do (persists like a wall's build marker until each is done)
    for (const u of S.units) {
      if (u.owner !== 'P' || u.kind !== 'sapper') continue;
      const marks = [];
      if (u.task && u.task.type === 'terraform') marks.push(u.task);
      if (u.jobs) for (const j of u.jobs) marks.push(j);
      for (let mi = 0; mi < marks.length; mi++) {
        const m = marks[mi];
        if (!S.map.explored[MapGen.idx(m.x, m.y)]) continue;
        const mx = m.x * TL, my = m.y * TL, activeMark = mi === 0 && u.task;
        g.fillStyle = activeMark ? 'rgba(244,222,150,0.18)' : 'rgba(244,222,150,0.10)';
        g.fillRect(mx + 2, my + 2, TL - 4, TL - 4);
        g.strokeStyle = 'rgba(244,222,150,' + (activeMark ? '0.9' : '0.6') + ')';
        g.lineWidth = 2;
        // dashed-look corner ticks so a queued run reads as a plan, not solid fill
        const c = 7;
        for (const [cx, cy, sxx, syy] of [[2, 2, 1, 1], [TL - 2, 2, -1, 1], [2, TL - 2, 1, -1], [TL - 2, TL - 2, -1, -1]]) {
          g.beginPath();
          g.moveTo(mx + cx, my + cy + syy * c); g.lineTo(mx + cx, my + cy); g.lineTo(mx + cx + sxx * c, my + cy);
          g.stroke();
        }
      }
    }

    // active sapper WORKSITES: turned earth, a stuck tool, flying dirt and a
    // progress bar, so a tile being reshaped plainly reads as under work
    for (const u of S.units) {
      if (u.kind !== 'sapper' || !u.task || u.task.type !== 'terraform') continue;
      const t = u.task;
      const ex = t.stx != null ? t.stx : t.sx + 0.5, ey = t.sty != null ? t.sty : t.sy + 0.5;
      if (Math.hypot(u.x - ex, u.y - ey) > 1.4) continue;               // only once at the edge, actually working
      if (!S.map.explored[MapGen.idx(t.x, t.y)]) continue;
      const wx = t.x * TL, wy = t.y * TL, SO = ART.PALETTE.soil, WO = ART.PALETTE.wood;
      const prog = t.total ? 1 - t.t / t.total : 0.5;
      if (t.job === 'bridge') {
        /* A SPAN IS BUILT ACROSS THE WATER, NOT ALONG IT. The site used to
           draw one fixed pattern of slats whatever way the crossing ran, so a
           north-south bridge went up as a raft of planks floating sideways on
           the channel. It now takes the crossing's OWN direction — the same
           Terraform.bridgeCrossing that decides br.dir when the deck lands —
           and builds the way a real one goes up: two stringers thrown bank to
           bank first, then the decking planked over them from the near shore
           out as the work proceeds. Falls back to E–W if the crossing has
           since been invalidated (the task's own revalidation will drop it).  */
        const bdir = Terraform.bridgeCrossing(t.x, t.y, u.owner) || 'h';
        const laid = 0.18 + prog * 0.82;
        if (bdir === 'v') {
          g.fillStyle = WO[1];                                             // the stringers, shore to shore
          g.fillRect(wx + 8, wy, 3, TL); g.fillRect(wx + TL - 11, wy, 3, TL);
          g.fillStyle = WO[3];                                             // decking, laid across them
          for (let py = 1; py < TL * laid; py += 5) g.fillRect(wx + 5, wy + py, TL - 10, 3);
        } else {
          g.fillStyle = WO[1];
          g.fillRect(wx, wy + 8, TL, 3); g.fillRect(wx, wy + TL - 11, TL, 3);
          g.fillStyle = WO[3];
          for (let px = 1; px < TL * laid; px += 5) g.fillRect(wx + px, wy + 5, 3, TL - 10);
        }
      } else if (t.job === 'bridgeup') {
        /* REINFORCING a standing span is MASONRY, not digging: the generic
           turned-earth patch below would put a hole of dark soil in the middle
           of a plank deck. The span already wears its own works (the bridge
           loop draws the blocks and lashings) — all this adds is the mason's
           mortar tub, so the tile reads as actively worked. */
        const ST3 = ART.PALETTE.stone;
        g.fillStyle = WO[1]; g.fillRect(wx + 4, wy + TL - 10, 7, 5);
        g.fillStyle = ART.PALETTE.bone[1]; g.fillRect(wx + 5, wy + TL - 9, 5, 2);
        g.fillStyle = ST3[4]; g.fillRect(wx + TL - 12, wy + TL - 11, 4, 4);
      } else {
        const r = Math.round((TL * 0.32) * (0.6 + prog * 0.4));         // a growing patch of turned soil
        g.fillStyle = SO[1]; g.fillRect(wx + TL / 2 - r, wy + TL / 2 - r, r * 2, r * 2);
        g.fillStyle = SO[0]; g.fillRect(wx + TL / 2 - r + 2, wy + TL / 2 - r + 2, Math.max(0, r * 2 - 4), Math.max(0, r * 2 - 4));
        g.fillStyle = SO[3]; g.fillRect(wx + 6, wy + 8, 3, 2); g.fillRect(wx + TL - 11, wy + TL - 13, 3, 2);  // clods
      }
      const ph = ((u.animT * 6) | 0) % 3;
      g.fillStyle = WO[1]; g.fillRect(wx + TL - 10, wy + 4, 2, 9);      // stuck tool haft
      g.fillStyle = ART.PALETTE.stone[3]; g.fillRect(wx + TL - 12, wy + 3, 4, 3);  // tool head
      g.fillStyle = SO[2]; g.fillRect(wx + TL / 2 + ph * 2 - 2, wy + 5 - ph, 2, 2);  // flying earth
      if (t.total) this.bar(g, wx + 3, wy - 3, TL - 6, 3, prog, '#c9a84c');
    }

    // PLACEMENT GRID (tests/placement.mjs): the validity map as quiet ground
    // markings — under the buildings, so the town reads over it. Viewport
    // cells only; three pre-rendered cell sprites, so the whole overlay is
    // one small blit per visible cell and nothing is computed here.
    this.drawPlaceGrid(g);

    // remembered buildings (ghosts in the grey fog) — drawn as last seen.
    // CLIPPED TO THE VIEWPORT: seenB spans the whole explored map and only
    // ever grows, so late in a run this loop was issuing hundreds of blits
    // (each with mask lookups, some with smoothing flips) for ghosts nowhere
    // near the screen, every frame. The 3-tile margin covers the biggest
    // footprint (the wonder) anchored just off the top-left edge.
    const gvx0 = ((this.cam.x / TL) | 0) - 3, gvy0 = ((this.cam.y / TL) | 0) - 3;
    const gvx1 = ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0;
    const gvy1 = ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0;
    for (const k in S.map.seenB) {
      const i = +k, gx = i % CFG.W, gy = (i / CFG.W) | 0;
      if (gx < gvx0 || gx > gvx1 || gy < gvy0 || gy > gvy1) continue;
      if ((G.vis && G.vis[i]) || !S.map.explored[i]) continue;
      const snap = S.map.seenB[k];
      // a remembered camp is still the home of whichever people held it —
      // same routing bldSprite uses live (render.js:4136), keyed off the
      // tribe stamped into the snapshot at G.updateVisibility time
      const spr = snap.key === 'wall' ? Sprites.wallMask[snap.level - 1][this.wallMaskAt(gx, gy)]
        : snap.key === 'gate' ? Sprites.gateMask[snap.level - 1][this.gateVerticalAt(gx, gy) ? 1 : 0]
        : (snap.key === 'raidercamp' && Sprites.camp && Sprites.camp[snap.tribe]) ? Sprites.camp[snap.tribe]
        : (snap.owner === 'A' ? Sprites.buildingA : Sprites.building)[snap.key][snap.level - 1];
      const gs = Bld.size(snap) * TL;
      // a remembered tower keeps its bond to the line, same as the wall
      // ghosts beside it (which already mask from live neighbours)
      if (snap.key === 'tower') this.drawTowerBond(g, { x: gx, y: gy, construction: 0 }, gx * TL, gy * TL, gs);
      this.blitBld(g, spr, gx * TL, gy * TL, gs, gs);
    }

    // fallen game (tests/wild-life.mjs) — a carcass for CORPSE_DAYS.meat
    // days, then bleached bones until .bone: the standing cue for where a
    // Hunter's Lodge may rise. Explored memory is enough — a landmark you
    // found is a landmark you remember, which is the feature's whole point.
    if (S.corpses) for (const c of S.corpses) {
      if (!S.map.explored[MapGen.idx(c.x | 0, c.y | 0)]) continue;
      const spr = this.corpseOf(c.kind, S.day - c.day < CFG.CORPSE_DAYS.meat ? 'meat' : 'bone');
      // the same TL×TL box a living unit draws through, so the remains are
      // exactly the beast's own size on the ground
      if (spr) g.drawImage(spr, c.x * TL - TL / 2, c.y * TL - TL / 2, TL, TL);
    }

    // ash piles — what burned-down buildings left, cooling on the ground
    // (drawn under everything that walks or stands; explored memory is enough,
    // a cold heap doesn't move)
    if (S.ashes) for (const a of S.ashes) {
      if (!S.map.explored[MapGen.idx(a.x, a.y)]) continue;
      // a building still TOPPLING owns its own ground — the ash is what it
      // leaves, and showing it under a tower that is visibly still falling
      // gives the ending away a second and a half early
      if (this.collapseAt(a.x, a.y)) continue;
      g.drawImage(this.ashOf(a.key, a.lv), a.x * TL, a.y * TL, a.sz * TL, a.sz * TL);
    }

    // buildings (sorted by footprint bottom edge)
    const blds = S.buildings.slice().sort((a, b) =>
      (a.y + Bld.size(a)) - (b.y + Bld.size(b)));
    for (const b of blds) {
      const bs = Bld.size(b);
      let seen = false;
      for (let vy = 0; vy < bs && !seen; vy++) for (let vx = 0; vx < bs; vx++)
        if (G.visibleAt(b.x + vx, b.y + vy)) { seen = true; break; }
      if (!seen) continue;
      const bx = b.x * TL, by = b.y * TL, bw = bs * TL;
      if (b.construction > 0 || b.upgrading > 0) {
        // a work site — going up for the first time OR being upgraded. Both
        // wear the scaffold so it's plainly unusable until the work is done.
        const up = b.upgrading > 0;
        if (!up && (b.key === 'wall' || b.key === 'gate')) {
          // fortifications show their oriented shape while first going up
          g.globalAlpha = 0.55; this.blitBld(g, this.bldSprite(b), bx, by, bw, bw); g.globalAlpha = 1;
        } else {
          /* WORK-SITE STAGES (tests/build-stages.mjs): three looks at 1/3
             intervals — ground broken → the raising → the building standing
             in scaffold — then the finished sprite. 2×2 (TC) raisings still
             match the shape going up: the timber long-hall (→L2) or the
             stone keep (→L3). Upgrades wear their own sprite labels (the
             same art for now) so their looks can diverge later. */
          const tgt = up ? b.level + 1 : b.level;
          const stage = Bld.stageOf(b);
          if (b.key === 'wonder') {
            /* THE GREAT WORKS (tests/wonder.mjs). Two shared raising stages —
               every wonder is raised by the same masons, off the same
               drawings — and then the MONUMENT'S OWN ART under a scaffold for
               the last third, which is the moment the valley finally sees
               what it is getting. Forty-five days is a long time to look at a
               building site. */
            if (stage < 2) {
              Assets.drawSprite(g, 'misc/wonderBuild' + (stage + 1), bx, by, { w: bw, h: bw });
            } else {
              this.blitBld(g, this.bldSprite(b, tgt), bx, by, bw, bw);
              Assets.drawSprite(g, 'misc/wonderScaffold', bx, by, { w: bw, h: bw });
            }
          } else if (b.key === 'dock' && Sprites.dockBuildFace) {
            /* A DOCK SITE POINTS THE WAY THE DOCK WILL. Its stages live in the
               same jetty frame as the finished deck (Sprites.dockBuildFace), so
               the piles march out from the shore rather than from a fixed edge.
               'n' goes through the ordinary misc/ name so a manifest image can
               still override the canonical set. */
            const side = Bld.dockShore(b);
            if (side === 'n') {
              Assets.drawSprite(g, 'misc/dock' + (up ? 'Up' : 'Build') + (stage + 1), bx, by, { w: bw, h: bw });
            } else {
              this.blitBld(g, Sprites.dockBuildFace[side][stage], bx, by, bw, bw);
            }
          } else if (Sprites.misc[b.key + 'Build1']) {
            // BESPOKE stage art still wins the route (the tower today —
            // tests/build-stages.mjs): its own three raising sprites for ALL
            // three stages, no derived look
            Assets.drawSprite(g, 'misc/' + b.key + (up ? 'Up' : 'Build') + (stage + 1), bx, by, { w: bw, h: bw });
          } else {
            /* THE DERIVED STAGES (tests/build-stages.mjs): cleared site →
               framing → partial build, generated from the footprint, the
               TARGET tier's materials and the target sprite itself — see the
               big block above padOf/siteOf/frameOf/partialOf. `tgt`, not
               b.level: during an upgrade b.level is still the old level, and
               deriving from it would run the sequence backwards. */
            const tier = Math.min(3, tgt);
            if (stage === 0) {
              g.drawImage(this.siteOf(b.key, bs, tier), bx, by, bw, bw);
            } else {
              const base = this.bldSprite(b, tgt);
              g.drawImage(this.padOf(bs, this.padShape(b.key, tgt, base)), bx, by, bw, bw);
              this.blitBld(g, stage === 1
                ? this.frameOf(base, tier, this.stageRoof(b.key, tgt), this.stageRound(b.key, tgt))
                : this.partialOf(base, !this.stageRoof(b.key, tgt)), bx, by, bw, bw);
            }
          }
        }
        const total = up ? (b.upgTotal || Bld.def(b.key).levels[b.level].time) : Bld.def(b.key).levels[b.level - 1].time;
        this.bar(g, bx + 4, by + bw - 4, bw - 8, 3, 1 - (up ? b.upgrading : b.construction) / total, '#e8c15a');
        // still tag the owner so a work site reads as friend or foe
        if (this.SHOW_OWNER_PIP) {
          g.fillStyle = b.owner === 'P' ? '#4a90c2' : '#c2564a';
          g.fillRect(bx + 1, by + 1, 4, 4);
        }
      } else {
        // a damaged building wears its destruction phase (tests/burn-down.mjs):
        // untouched → scorched dark → partially destroyed (Bld.burnPhase).
        // A GROUND-LEVEL yard (the FIRE_AT ground keys) never takes ruinOf —
        // biting the "roofline" out of a flat field just punches green holes
        // in it; scorched-dark plus the spreading char patches is its ruin.
        const bph = Bld.burnPhase(b);
        const bfa = this.fireAnchors(b);
        const spr = bph === 1 ? this.darkOf(this.bldSprite(b))
          : bph === 2 ? ((bfa && bfa.ground) ? this.darkOf(this.bldSprite(b)) : this.ruinOf(this.bldSprite(b)))
          : this.bldSprite(b);
        // a tower in a wall line wears the curtain's own stonework as
        // connecting stubs, under its body — one unbroken castle wall
        if (b.key === 'tower') this.drawTowerBond(g, b, bx, by, bw);
        // a drawbridge that falls to the FAR side lies beyond the wall, so it
        // goes down before the gatehouse does and is occluded by it — and so
        // do L1 door leaves swinging away from the camera (drawGateWorks)
        if (b.key === 'gate') { this.drawDrawbridge(g, b, bx, by, bw, dt, false); this.drawGateWorks(g, b, bx, by, bw, dt, false); }
        // a war band's yard is strewn with its own people's litter — drawn
        // before the tent so nothing rides over its silhouette
        if (b.key === 'raidercamp') this.drawCampDress(g, b);
        // the blaze breaking out BEHIND the ridge goes down first too, so the
        // roof's own silhouette occludes its foot (tests/burn-down.mjs)
        this.drawBurnBack(g, b, bx, by, bw);
        this.blitBld(g, spr, bx, by, bw, bw);
        // …and the walk running south out of it meets its flank at WALK height
        if (b.key === 'tower') this.drawTowerWalk(g, b, bx, by, bw);
        // …and one that falls toward us swings over its own archway — the
        // early tiers' doors and portcullis ride the same two passes
        if (b.key === 'gate') { this.drawDrawbridge(g, b, bx, by, bw, dt, true); this.drawGateWorks(g, b, bx, by, bw, dt, true); }
        /* Owner tag. On a FORTIFICATION the tile's top-left corner is bare
           ground — the curtain runs down the middle of the tile — so the pip
           floated out on the grass beside the wall like a UI glitch, one per
           section the whole length of the line. Walls and gates share one
           faction-less atlas, so the pip can't simply be dropped either: it is
           their only owner cue. It now marks only the RIVAL's stonework, and
           sits ON it. Nobody else builds walls, so an unmarked curtain is
           yours by elimination — and your own castle reads clean. */
        const fort = b.key === 'wall' || b.key === 'gate' || b.key === 'tower';
        // barbarian works wear the band's own rust, never the rival's red —
        // a camp is nobody's tribe (tests/raider-camps.mjs)
        g.fillStyle = b.owner === 'P' ? '#4a90c2' : b.owner === 'R' ? '#6e5b40' : '#c2564a';
        if (!fort) { if (this.SHOW_OWNER_PIP) g.fillRect(bx + 1, by + 1, 4, 4); }
        else if (b.owner !== 'P') g.fillRect(bx + bw / 2 - 1.5, by + bw / 2 - 1.5, 3, 3);
        this.drawCampfire(g, b, bx, by, bw);
      }
      if (this.SHOW_BANNERS) this.drawBanners(g, b, bx, by, bw);   // cloth in the tribe's own dye
      this.drawHearthSmoke(g, b, bx, by, bw);  // and the hearths breathe
      // a finished WONDER is never just another building on the map
      if (b.key === 'wonder' && !(b.construction > 0)) this.drawWonderShine(g, b, bx, by, bw);
      this.drawBurn(g, b, bx, by, bw);   // fires ride on work sites and finished buildings alike
      if (b.hp < b.maxhp) this.bar(g, bx + 3, by - 4, bw - 6, 3, b.hp / b.maxhp, '#7dbb5e');
      if (UI.sel && UI.sel.type === 'bld' && UI.sel.id === b.id) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bw - 1);
      }
    }

    // the dragon's FIRE LINE — the hero shot. Not scattered campfires: one
    // CONNECTED wall of flame. Pass 1 lays a continuous charred, glowing ember
    // bed under the whole line; pass 2 raises big overlapping tongues (a main
    // tongue plus two offset side-tongues per point, all on their own beats),
    // so the wall roars as a single blaze and dies down to embers and smoke.
    if (S.dragon && S.dragon.fire && S.dragon.fire.length) {
      const F = ART.PALETTE.fire, now = performance.now() / 1000;
      // ---- pass 1: charred ground + ember glow, overlapping into one bed ----
      for (const fp of S.dragon.fire) {
        const fx = fp.x * TL, fy = fp.y * TL;
        const life = Math.min(1, fp.ttl / 1.4);
        g.globalAlpha = 0.55 * Math.min(1, fp.ttl);
        g.fillStyle = '#171310'; g.fillRect(fx - 9, fy - 2, 18, 6);           // scorched earth, fused with its neighbours
        g.globalAlpha = 0.28 * life;
        g.fillStyle = F[1];
        g.beginPath(); g.ellipse(fx, fy + 1, 14, 6, 0, 0, Math.PI * 2); g.fill();   // the shared ember glow
        g.globalAlpha = 0.5 * life;
        g.fillStyle = F[0];                                                    // embers pulsing in the bed
        g.fillRect(fx - 7 + ((fp.seed * 5) % 11), fy + 1 + ((fp.seed * 3) % 3), 2, 2);
      }
      // ---- pass 2: the wall of tongues, 2x tall, bases overlapping ----
      for (const fp of S.dragon.fire) {
        const fx = fp.x * TL, fy = fp.y * TL;
        const life = Math.min(1, fp.ttl / 1.4);
        const tongue = (ox, phMul, hMul, wMul) => {
          const lick = Math.sin(now * (10 + phMul * 3) + fp.seed * phMul) * 0.5 + 0.5;
          const h = (10 + lick * 12) * hMul * life;
          const w = 12 * wMul;
          if (h < 1) return;
          g.globalAlpha = 0.9 * life;
          g.fillStyle = F[1]; g.fillRect(fx + ox - w / 2, fy - h, w, h);                         // outer flame
          g.fillStyle = F[2]; g.fillRect(fx + ox - w * 0.32, fy - h * 0.74, w * 0.64, h * 0.74); // hot middle
          g.fillStyle = F[3] || '#ffd28a'; g.fillRect(fx + ox - w * 0.16, fy - h * 0.42, w * 0.32, h * 0.42);  // white-hot core
          if (lick > 0.7) {                                                    // sparks off the crest
            g.fillStyle = F[2];
            g.fillRect(fx + ox - 2 + ((fp.seed * 7 + phMul * 13) % 5), fy - h - 3 - lick * 4, 2, 2);
          }
        };
        tongue(0, 1, 1, 1);                    // the main tongue
        tongue(-6, 2, 0.6, 0.7);               // side tongues knit the wall together
        tongue(6, 3, 0.7, 0.7);
        // rolling smoke as the blaze gutters
        if (fp.ttl < 2.6) {
          const life2 = Math.min(1, fp.ttl / 1.4);
          g.globalAlpha = 0.24 * life2;
          g.fillStyle = '#4a4a52';
          g.fillRect(fp.x * TL - 2 + Math.sin(now * 2 + fp.seed) * 4, fp.y * TL - 24 - ((now * 6 + fp.seed) % 8), 4, 4);
          g.fillRect(fp.x * TL + 2 + Math.sin(now * 1.6 + fp.seed * 2) * 5, fp.y * TL - 30 - ((now * 5 + fp.seed) % 6), 3, 3);
        }
      }
      g.globalAlpha = 1;
    }
    // dragonfire ash: what is left of an army, blowing away
    if (S.dragon && S.dragon.ash) for (const a of S.dragon.ash) {
      const al = Math.min(1, a.ttl / 1.4);
      const ax = a.x * TL, ay = a.y * TL;
      g.globalAlpha = al;
      g.fillStyle = ART.PALETTE.stone[1];
      g.fillRect(ax - 4, ay - 1, 8, 3);
      g.fillRect(ax - 2, ay - 3, 5, 2);
      g.fillStyle = ART.PALETTE.ink[2];
      g.fillRect(ax - 3, ay, 3, 2); g.fillRect(ax + 1, ay - 2, 2, 2);
      g.fillStyle = ART.PALETTE.stone[2];
      g.fillRect(ax - 1, ay - 4, 2, 1);
      g.globalAlpha = 1;
    }

    // units (y-sorted)
    const selIds = !UI.sel ? null
      : UI.sel.type === 'unit' ? new Set([UI.sel.id])
      : UI.sel.type === 'group' ? new Set(UI.sel.ids) : null;
    // heal-zone ring: when a hurt, healable friendly unit is selected, show where
    // it can be healed — the town-center grounds for land units, a dock for ships
    if (selIds && [...selIds].some(id => { const u = Units.get(id); return u && u.owner === 'P' && u.hp < u.maxhp && CFG.HEAL_FOOD[u.kind]; })) {
      const seen = new Set();
      g.save();
      g.strokeStyle = 'rgba(138,224,138,0.45)'; g.lineWidth = 1.5; g.setLineDash([6, 5]);
      for (const id of selIds) {
        const u = Units.get(id);
        if (!u || u.owner !== 'P' || u.hp >= u.maxhp || !CFG.HEAL_FOOD[u.kind]) continue;
        const z = Bld.healZoneFor(u);
        if (!z) continue;
        const k = z.x + ',' + z.y + ',' + z.r;
        if (seen.has(k)) continue; seen.add(k);
        g.beginPath(); g.ellipse(z.x * TL, z.y * TL, z.r * TL, z.r * TL, 0, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
    // living water: the lapping waterline, drifting sparkles, blinking
    // shoreline foam, jumping fish — viewport-only, in its own method so the
    // frame's water work can be measured on its own (tests/land.mjs §19).
    // Drawn HERE — before the mountains-and-units pass — on purpose: all of
    // it lives ON the water's surface, so a hull floats OVER a jumping fish,
    // never under one (the operator's transport-raft report).
    this.drawLivingWater(g, dt);

    /* THE MOUNTAINS DRAW HERE, interleaved with the units by ground row —
       the whole point of cutting each region into row strips (buildMtnLayer).
       A strip whose ground row is north of a unit's feet draws BEFORE it
       (the unit walks in front of that rock); one south of it draws AFTER
       (the unit is behind the ridge and the cliff hides it). Units are
       already sorted by y, so this is one pointer walked forward — never a
       sort, never a per-pixel test. Buildings all drew earlier, which lands
       right too: a building north of a range is behind it and the strips
       cover it, one south of the range is clear of the art entirely. */
    const mstrips = this.mtnStrips();
    let msI = 0;
    const msL = this.cam.x - TL * 2, msR = this.cam.x + this.viewW() / this.cam.z + TL * 2;
    const msT = this.cam.y - TL * 4, msB = this.cam.y + this.viewH() / this.cam.z + TL * 2;
    const msFlush = (uptoY) => {
      while (msI < mstrips.length && mstrips[msI].row + 1 <= uptoY) {
        const st = mstrips[msI++];
        if (st.x > msR || st.x + st.c.width < msL || st.y > msB || st.y + st.c.height < msT) continue;
        g.drawImage(st.c, st.x, st.y);
      }
    };
    const units = S.units.slice().sort((a, b) => a.y - b.y);
    for (const u of units) {
      msFlush(u.y);
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      // B: the kind's draw box (unitBox). Bottom edges align across sizes —
      // for B === TILE these are exactly the coordinates they always were.
      const B = this.unitBox(u);
      // a builder leans to his site's wall at draw time (workLean); the sim
      // position — taps, combat, pathing — stays exactly where it was
      const lean = this.workLean(u);
      const wx = lean ? lean.x : u.x, wy = lean ? lean.y : u.y;
      const ux = wx * TL - B / 2, uy = wy * TL + TL / 2 - CFG.SPRITE_LIFT - B;
      if (selIds && selIds.has(u.id)) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(wx * TL, wy * TL + 10, 10, 5, 0, 0, Math.PI * 2); g.stroke();
      }
      // draw every unit into a TILE-sized box: 32px sheets render 1:1 (unchanged),
      // while the hi-res 64px villager sheet shows at the SAME size but twice as crisp
      if (u.dieT != null && u.dieT > 0) {
        // DEATH BY PLAGUE — a slow, visible fall: the villager sways, keels
        // over under a sickly green pall, and fades into the ground
        const p2 = Math.min(1, Math.max(0, 1 - u.dieT / 2.4));
        const fade2 = p2 > 0.75 ? Math.max(0, (1 - p2) / 0.25) : 1;
        const cx3 = u.x * TL, cy3 = u.y * TL;
        g.save();
        g.globalAlpha = fade2;
        g.translate(cx3, cy3 + p2 * 5);
        g.rotate((u.id % 2 ? 1 : -1) * Math.min(1, p2 * 1.5) * Math.PI / 2 +
          Math.sin(u.animT * 7) * 0.06 * (1 - p2));            // a last sway before the fall
        g.drawImage(this.unitSprite(u), -B / 2, TL / 2 - CFG.SPRITE_LIFT - B, B, B);
        g.globalAlpha = fade2 * 0.35 * Math.min(1, p2 * 2);    // the sickness's green cast
        g.fillStyle = '#86b04a';
        g.fillRect(-TL / 2 + 6, -TL / 2, TL - 12, TL - 6);
        g.restore();
        g.globalAlpha = 1;
      } else if (u.burnT > 0) {
        // DEATH BY DRAGONFIRE — a last animation before the ash lands:
        // soldiers topple sideways ablaze; siege engines char, sag and
        // collapse where they stand. Both are wreathed in half-transparent
        // fire and fade out just before they vanish into ash.
        const p = Math.min(1, Math.max(0, 1 - u.burnT / 1.6));       // 0 -> 1 across the burn
        const fade = p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1;
        const cx2 = u.x * TL, cy2 = u.y * TL;
        const F = ART.PALETTE.fire;
        const engine = Units.isSiege(u) || u.kind === 'ballista';
        g.save();
        g.globalAlpha = fade;
        g.translate(cx2, cy2 + p * 4);
        if (engine) g.scale(1, 1 - p * 0.35);                        // the timber frame sags and collapses
        else g.rotate((u.id % 2 ? 1 : -1) * Math.pow(p, 1.4) * Math.PI / 2);   // toppling over
        g.drawImage(this.unitSprite(u), -B / 2, TL / 2 - CFG.SPRITE_LIFT - B, B, B);
        if (engine) {                                                // blackening timber
          g.globalAlpha = fade * 0.6 * p;
          g.fillStyle = '#14100c';
          g.fillRect(-TL / 2 + 4, -TL / 2 - 2, TL - 8, TL - 4);
        }
        g.restore();
        // the half-transparent fire wash over the body, and licking tongues
        const lk = Math.sin(u.animT * 13 + u.id) * 0.5 + 0.5, ph = ((u.animT * 9) | 0) % 2;
        g.globalAlpha = fade * 0.5;
        g.fillStyle = F[1]; g.fillRect(cx2 - 8, cy2 - 12 + p * 6, 16, 14);
        g.globalAlpha = fade * 0.9;
        const hh = 8 + lk * 5;
        g.fillStyle = F[1]; g.fillRect(cx2 - 5, cy2 - 4 - hh + p * 5, 4, hh);
        g.fillStyle = F[2]; g.fillRect(cx2 + 1 - ph, cy2 - 2 - hh * 0.8 + p * 5, 3, hh * 0.8);
        g.fillStyle = F[3] || '#ffd28a'; g.fillRect(cx2 - 1, cy2 - hh * 0.5 + p * 5, 2, hh * 0.5);
        if (lk > 0.65) { g.fillStyle = F[2]; g.fillRect(cx2 - 3 + ph * 5, cy2 - hh - 7, 2, 2); }   // sparks
        g.globalAlpha = 1;
      } else {
        // sheet units get the renderer's shadow; the procedural cast has
        // its own baked in and must never receive a second (sheetUnit).
        // Naval sheets bake their own WATER shadow — a ground ellipse
        // under a hull reads as a sandbar, so boats are skipped too.
        if (this.sheetUnit(u) && !Units.isNaval(u)) this.drawUnitShadow(g, u, wx, wy);
        g.drawImage(this.unitSprite(u), ux, uy, B, B);
      }
      if (u.cargo && u.cargo.length) {                 // one pip per soldier aboard
        g.fillStyle = u.owner === 'P' ? '#c0e8ff' : '#ffb0a0';
        for (let ci = 0; ci < u.cargo.length; ci++)
          g.fillRect(ux + 7 + ci * 4, uy - 1, 3, 3);
      }
      // the bar keeps the cast's own width, centred over the kind's box
      if (u.hp < u.maxhp) this.bar(g, ux + (B - TL) / 2 + 6, uy - 2, TL - 12, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }
    msFlush(1e9);
    /* A UNIT BEHIND A MOUNTAIN IS HIDDEN, NOT LOST. Anyone standing on
       ground the lifted art covers (`_mtnOcc` — walkable tiles only, stamped
       at bake) just vanished under the strips above, which is the depth cue
       working — but they must stay selectable and legible, so they come back
       as a quiet silhouette: the sprite at low alpha, the selection ring,
       and the health bar when it matters. */
    if (this._mtnOcc && this._mtnOcc.size) for (const u of units) {
      if (!this._mtnOcc.has(((u.y | 0) * CFG.W) + (u.x | 0))) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const B = this.unitBox(u);
      const ux = u.x * TL - B / 2, uy = u.y * TL + TL / 2 - CFG.SPRITE_LIFT - B;
      if (selIds && selIds.has(u.id)) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(u.x * TL, u.y * TL + 10, 10, 5, 0, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 0.32;
      g.drawImage(this.unitSprite(u), ux, uy, B, B);
      g.globalAlpha = 1;
      if (u.hp < u.maxhp) this.bar(g, ux + (B - TL) / 2 + 6, uy - 2, TL - 12, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }
    /* …and the PLACEMENT GRID keeps the last word over the rock (the hard
       rule from the phase-2 brief: the grid reads from tile data and renders
       ON TOP of overhanging mountain art). The main grid pass drew under the
       buildings, where the town reads over it; here it is drawn again,
       clipped to exactly the tiles the mountain art covers — those pixels'
       first coat is buried under opaque rock, so nothing doubles up. */
    if (window.UI && UI.placing && UI.placing !== 'wall' && this._mtnCover) {
      const c0x = Math.max(0, (msL / TL) | 0), c1x = Math.min(CFG.W - 1, Math.ceil(msR / TL));
      const c0y = Math.max(0, (msT / TL) | 0), c1y = Math.min(CFG.H - 1, Math.ceil(msB / TL));
      let any = false;
      g.save();
      g.beginPath();
      for (let ty = c0y; ty <= c1y; ty++) for (let tx = c0x; tx <= c1x; tx++)
        if (this._mtnCover[ty * CFG.W + tx]) { g.rect(tx * TL, ty * TL, TL, TL); any = true; }
      if (any) { g.clip(); this.drawPlaceGrid(g); }
      g.restore();
    }

    // cast lines: every settled shore-fisher shows a rod, a line, and a
    // bobbing float out on the shoal — unmistakably fishing
    for (const u of S.units) {
      if (!u.task || u.task.type !== 'shorefish') continue;
      if ((u.x | 0) !== u.task.sx || (u.y | 0) !== u.task.sy) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const dirx = u.task.x - u.task.sx, diry = u.task.y - u.task.sy;
      const tipX = (u.x + dirx * 0.38) * TL, tipY = (u.y + diry * 0.30) * TL - 9;
      const bobX = (u.task.x + 0.5) * TL + Math.sin(u.animT * 1.3) * 3;
      const bobY = (u.task.y + 0.5) * TL + Math.sin(u.animT * 2.1) * 2;
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(110,80,36,0.95)';                      // wood rod
      g.beginPath(); g.moveTo(u.x * TL + dirx * 2, u.y * TL - 2); g.lineTo(tipX, tipY); g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(216,207,174,0.55)';                    // gut line
      g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(bobX, bobY); g.stroke();
      g.fillStyle = ART.PALETTE.fire[2];                           // bright float
      g.fillRect(bobX - 1.5, bobY - 1.5, 3, 3);
      if (Math.sin(u.animT * 2.1) > 0.75) {                        // nibble ripple
        g.strokeStyle = 'rgba(235,244,248,0.35)';
        g.beginPath(); g.ellipse(bobX, bobY + 1, 5, 2.5, 0, 0, Math.PI * 2); g.stroke();
      }
    }

    // the buried cache (special event): the hoard waiting for a spade — with a
    // beckoning golden shimmer so the player can't miss the errand
    if (S.cache && S.cache.ev) {
      const ev = S.cache.ev;
      if (S.map.explored[MapGen.idx(ev.x, ev.y)]) {
        const now2 = performance.now() / 1000;
        const fr = Sprites.misc.cache[((now2 * 2) | 0) % 2];
        g.drawImage(fr, ev.x * TL, ev.y * TL - 4, TL, TL);
        g.globalAlpha = 0.35 + 0.25 * Math.sin(now2 * 3);
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(ev.x * TL + TL / 2, ev.y * TL + TL / 2 + 4, 14 + Math.sin(now2 * 3) * 2, 7, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
    }

    // the kraken: a once-a-game terror breaking the surface
    if (S.kraken && S.kraken.ev) {
      const ev = S.kraken.ev;
      if (G.visibleAt(ev.x | 0, ev.y | 0)) {
        const k = ev.phase === 'rise' ? Math.min(1, ev.t / 1.0)
          : ev.phase === 'sink' ? Math.max(0, 1 - ev.t / 1.2) : 1;
        const fr = Sprites.misc.kraken[((ev.t * 5) | 0) % 4];
        const size = TL * 3;                                   // 96px native — pixel-perfect at zoom 1
        g.globalAlpha = k;
        g.drawImage(fr, ev.x * TL - size / 2, ev.y * TL - size / 2 - k * 6, size, size);
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(235,244,248,' + (0.4 * k).toFixed(2) + ')';
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(ev.x * TL, ev.y * TL + 12, 24 + Math.sin(ev.t * 5) * 5, 9, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();                                          // a second, wider churn ring
        g.globalAlpha = 0.5 * k;
        g.ellipse(ev.x * TL, ev.y * TL + 12, 34 + Math.sin(ev.t * 4 + 1.5) * 6, 12, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // hearth smoke drifting from settled buildings, embers over camp fires —
    // transient render-side particles, bounded, visible tiles only
    this.smoke = this.smoke || [];
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.45;
      if (this.smoke.length < 36) {
        for (const b of S.buildings) {
          if (b.construction > 0) continue;
          const rate = b.key === 'tc' ? 0.9 : (b.key === 'house' || b.key === 'lodge') ? 0.2 : 0;
          if (!rate || Math.random() > rate) continue;
          if (!G.visibleAt(b.x, b.y)) continue;
          // the L1 roundhouse hearth is the fire pit in the dooryard — a very
          // faint wisp curls up from it; every other hearth smokes from the roof
          const pit = b.key === 'tc' && b.level === 1;
          // the campfire's own anchor (R.CAMPFIRE_AT.tc), in tile units rather
          // than bw-fraction — the smoke must rise from the SAME stone ring
          // the sprite actually draws, not the composition it replaced
          this.smoke.push({ x: b.x + (pit ? 0.969 : 0.5) + (Math.random() - 0.5) * 0.12,
                            y: b.y + (pit ? 1.594 : 0.18),
                            t: 0, ttl: (pit ? 1.6 : 2) + Math.random() * 1.2,
                            a: pit ? 0.15 : 0.30 });
          if (this.smoke.length >= 36) break;
        }
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.t += dt;
      if (s.t > s.ttl) { this.smoke.splice(i, 1); continue; }
      const k = s.t / s.ttl;
      const sx = (s.x + Math.sin((s.t + s.x * 7) * 1.6) * 0.06 + s.t * 0.03) * TL;
      const sy = (s.y - s.t * 0.28) * TL;
      const a0 = s.a || 0.30;
      const size = (a0 < 0.2 ? 1.5 : 2) + k * (a0 < 0.2 ? 4 : 5);
      g.fillStyle = 'rgba(206,200,190,' + (a0 * (1 - k)).toFixed(3) + ')';
      g.fillRect(sx - size / 2, sy - size / 2, size, size);
    }

    // hostiles piled on one tile: a head-count badge so the stack is readable
    const stacks = new Map();
    for (const u of S.units) {
      if (u.owner === 'P' || Units.isPassive(u)) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const k = (u.x | 0) * 4096 + (u.y | 0);
      const s = stacks.get(k);
      if (s) { s.n++; if (u.y < s.y) { s.x = u.x; s.y = u.y; } }
      else stacks.set(k, { x: u.x, y: u.y, n: 1 });
    }
    g.font = '700 9px -apple-system, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of stacks.values()) {
      if (s.n < 2) continue;
      const bx = s.x * TL, by = s.y * TL - TL / 2 - 11;
      const w = g.measureText('×' + s.n).width + 8;
      g.fillStyle = 'rgba(20,15,11,0.85)';
      g.beginPath();
      if (g.roundRect) g.roundRect(bx - w / 2, by - 6.5, w, 13, 4);
      else g.rect(bx - w / 2, by - 6.5, w, 13);
      g.fill();
      g.strokeStyle = 'rgba(224,101,80,0.9)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#ffb0a0';
      g.fillText('×' + s.n, bx, by + 0.5);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';

    // ---- arrows in flight: a real shaft travels the line now (operator's
    // "give the arrows weight"), on a shallow arc with a ground shadow —
    // the siege-projectile grammar scaled down. Damage still lands the
    // instant the shot is loosed (combat is untouched); at 0.24s of flight
    // the eye never catches the gap. Flaming arrows carry a lagged ember
    // trail and a burning head; catapult stones arc high and land hard.
    for (const s of Combat.shots) {
      if (s.rock) {
        const k = Math.max(0, 1 - s.t / 0.35);
        const px = (s.x1 + (s.x2 - s.x1) * k) * TL;
        const py = (s.y1 + (s.y2 - s.y1) * k - Math.sin(k * Math.PI) * 1.1) * TL;
        g.fillStyle = ART.PALETTE.stone[1];
        g.fillRect(px - 3, py - 3, 6, 6);
        g.fillStyle = ART.PALETTE.stone[3];
        g.fillRect(px - 3, py - 3, 3, 3);
        continue;
      }
      const t0 = s.t0 || 0.15;
      const k = Math.max(0, Math.min(1, 1 - s.t / t0));
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, dl = Math.hypot(dx, dy) || 1;
      const arc = Math.min(0.34, dl * 0.09);          // longer shots loft higher
      const wx = s.x1 + dx * k, wy = s.y1 + dy * k - Math.sin(k * Math.PI) * arc;
      const px = wx * TL, py = wy * TL;
      // the shadow slides along the flat ground track under the lofted shaft
      g.fillStyle = 'rgba(20,16,10,0.22)';
      g.fillRect((s.x1 + dx * k) * TL - 2, (s.y1 + dy * k) * TL, 4, 2);
      // a short fading wake behind the head, not the old full-length tracer
      const kb = Math.max(0, k - 0.2);
      g.strokeStyle = s.fire ? 'rgba(242,150,58,0.5)' : 'rgba(240,210,122,0.4)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo((s.x1 + dx * kb) * TL, (s.y1 + dy * kb - Math.sin(kb * Math.PI) * arc) * TL);
      g.lineTo(px, py);
      g.stroke();
      // the shaft, aligned to the true flight tangent (the arc's slope rides
      // in the y term) — wood-dark, 6px, with a bone fletch at the tail
      const vy = dy - Math.cos(k * Math.PI) * Math.PI * arc;
      const vl = Math.hypot(dx, vy) || 1, ux = dx / vl, uy = vy / vl;
      g.strokeStyle = ART.PALETTE.wood[1]; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px - ux * 6, py - uy * 6); g.lineTo(px, py); g.stroke();
      g.fillStyle = ART.PALETTE.bone[1];
      g.fillRect(px - ux * 6 - 1, py - uy * 6 - 1, 2, 2);
      if (s.fire) {
        // three lagged embers trail the burning head down the arc
        for (let j = 1; j <= 3; j++) {
          const kk = Math.max(0, k - j * 0.07);
          const es = 4 - j;
          g.fillStyle = 'rgba(232,138,58,' + (0.55 - j * 0.14) + ')';
          g.fillRect((s.x1 + dx * kk) * TL - es / 2,
                     (s.y1 + dy * kk - Math.sin(kk * Math.PI) * arc) * TL - es / 2, es, es);
        }
        g.fillStyle = 'rgba(255,200,80,0.9)'; g.fillRect(px - 2.5, py - 2.5, 5, 5);
        g.fillStyle = ART.PALETTE.fire[3];    g.fillRect(px - 1.5, py - 1.5, 3, 3);
      } else {
        g.fillStyle = ART.PALETTE.stone[4];   // flint head
        g.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }

    // ---- siege projectiles in flight: boulder / bolt / flaming ball on an arc,
    // each trailing a ground shadow that tightens as it nears the target ----
    for (const p of Combat.projectiles) {
      const k = p.t / p.dur;
      const wx = p.x1 + (p.x2 - p.x1) * k;
      const wy = p.y1 + (p.y2 - p.y1) * k - Math.sin(k * Math.PI) * p.arc;
      const px = wx * TL, py = wy * TL;
      const sh = 2 + 2 * k;
      g.fillStyle = 'rgba(20,16,10,0.28)';
      g.fillRect(wx * TL - sh, p.y2 * TL - 1, sh * 2, 2);            // shadow on the ground line
      if (p.kind === 'flame') {
        // fx 'firestorm' (the trebuchet): the same flaming ball, just BIGGER —
        // a longer ember wake, a fatter core, and a smoke smudge chasing it
        const big = p.fx === 'firestorm' ? 1.7 : 1;
        const trail = big > 1 ? 5 : 3;
        for (let j = 1; j <= trail; j++) {                          // ember trail
          const kk = Math.max(0, k - j * 0.06);
          const tx = (p.x1 + (p.x2 - p.x1) * kk) * TL;
          const ty = (p.y1 + (p.y2 - p.y1) * kk - Math.sin(kk * Math.PI) * p.arc) * TL;
          const es = Math.max(2, (4 - j * 0.4) * big);
          g.fillStyle = 'rgba(232,138,58,' + Math.max(0.08, 0.5 - j * 0.09) + ')';
          g.fillRect(tx - es / 2, ty - es / 2, es, es);
        }
        if (big > 1) {                                              // the smoke smudge
          const ks = Math.max(0, k - 0.1);
          const sx = (p.x1 + (p.x2 - p.x1) * ks) * TL;
          const sy = (p.y1 + (p.y2 - p.y1) * ks - Math.sin(ks * Math.PI) * p.arc) * TL;
          g.fillStyle = 'rgba(90,82,72,0.35)';
          g.fillRect(sx - 4, sy - 6, 8, 8);
        }
        g.fillStyle = ART.PALETTE.fire[1]; g.fillRect(px - 4 * big, py - 4 * big, 8 * big, 8 * big);   // outer glow
        g.fillStyle = ART.PALETTE.fire[2]; g.fillRect(px - 3 * big, py - 3 * big, 6 * big, 6 * big);
        g.fillStyle = ART.PALETTE.fire[3]; g.fillRect(px - 2 * big, py - 3 * big, 3 * big, 3 * big);   // hot core
      } else if (p.kind === 'bolt') {
        const dx = p.x2 - p.x1, dy = p.y2 - p.y1, dl = Math.hypot(dx, dy) || 1;
        g.strokeStyle = ART.PALETTE.wood[2]; g.lineWidth = 2;
        g.beginPath(); g.moveTo(px - dx / dl * 7, py - dy / dl * 7); g.lineTo(px, py); g.stroke();
        g.fillStyle = ART.PALETTE.stone[4]; g.fillRect(px - 1.5, py - 1.5, 3, 3);   // iron head
      } else {                                                       // stone boulder
        g.fillStyle = ART.PALETTE.stone[1]; g.fillRect(px - 3, py - 3, 6, 6);
        g.fillStyle = ART.PALETTE.stone[3]; g.fillRect(px - 3, py - 3, 3, 3);       // lit top-left
        g.fillStyle = ART.PALETTE.stone[0]; g.fillRect(px + 1, py + 1, 2, 2);       // shaded
      }
    }

    // ---- fire-arrow ground strikes: a guttering tongue of flame where the
    // arrow landed, over a scorch that fades with it. flameSmall on the
    // wall-clock beat (the burning-house idiom), shrinking through the
    // last third of its short life. ----
    for (let i = this.arrowFires.length - 1; i >= 0; i--) {
      const f = this.arrowFires[i];
      f.t += dt;
      const kf = f.t / this.ARROWFIRE_LIFE;
      if (kf >= 1) { this.arrowFires.splice(i, 1); continue; }
      const px = f.x * TL, py = f.y * TL;
      const fade = kf < 0.7 ? 1 : 1 - (kf - 0.7) / 0.3;
      // the scorch: near-opaque char (translucent grey over grass reads as
      // moss — the ground-burn lesson), blooming fast and dying with the flame
      g.globalAlpha = 0.55 * Math.min(1, f.t * 8) * fade;
      g.fillStyle = '#1c140c';
      g.beginPath(); g.ellipse(px, py + 1, TL * 0.16, TL * 0.10, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      // the flame itself, licking on the shared 130ms beat
      const beat = (performance.now() / 130) | 0;
      const fs = TL * 0.5 * (0.75 + 0.25 * Math.min(1, f.t * 6)) * fade;
      if (fs > 2)
        Assets.drawSprite(g, 'misc/flameSmall/' + ((beat + i) % 4),
          px - fs / 2, py - fs * 0.85, { w: fs, h: fs });
    }

    // ---- trebuchet blazes: a REAL ground fire where the ball came down —
    // one tall tongue flanked by two smaller ones, each on its own beat
    // phase, over a wide char that blooms fast and outlasts the flames ----
    for (let i = this.blazes.length - 1; i >= 0; i--) {
      const f = this.blazes[i];
      f.t += dt;
      const kf = f.t / this.BLAZE_LIFE;
      if (kf >= 1) { this.blazes.splice(i, 1); continue; }
      const px = f.x * TL, py = f.y * TL;
      const fade = kf < 0.65 ? 1 : 1 - (kf - 0.65) / 0.35;
      g.globalAlpha = 0.6 * Math.min(1, f.t * 6) * Math.max(fade, 0.4);
      g.fillStyle = '#1c140c';
      g.beginPath(); g.ellipse(px, py + 1, TL * 0.42, TL * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      const beat = (performance.now() / 130) | 0;
      const grow = Math.min(1, f.t * 4);
      const tongues = [[0, 0, 0.85], [-0.28, 0.06, 0.5], [0.26, 0.1, 0.44]];
      for (let ti = 0; ti < 3; ti++) {
        const [ox, oy, sc] = tongues[ti];
        const fs = TL * sc * grow * fade;
        if (fs > 2)
          Assets.drawSprite(g, 'misc/flameSmall/' + ((beat + i + ti * 2) % 4),
            px + ox * TL - fs / 2, py + oy * TL - fs * 0.85, { w: fs, h: fs });
      }
    }

    // ---- bombard blasts: an expanding shockwave ring for the first beat,
    // then a lingering scorch (or a fading ripple on water) ----
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const bl = this.blasts[i];
      bl.t += dt;
      const k = bl.t / this.BLAST_LIFE;
      if (k >= 1) { this.blasts.splice(i, 1); continue; }
      const px = bl.x * TL, py = bl.y * TL;
      if (bl.t < 0.12) {                                 // the first instant: a hot flash
        const fk = bl.t / 0.12;
        g.globalAlpha = 0.85 * (1 - fk);
        g.fillStyle = '#fff3d6';
        const fr2 = TL * (0.28 + fk * 0.5);
        g.beginPath(); g.ellipse(px, py, fr2, fr2 * 0.7, 0, 0, Math.PI * 2); g.fill();
      }
      if (bl.t < 0.45) {                                 // the poof ring
        const rk = bl.t / 0.45;
        const rad = TL * (0.3 + rk * 1.1);
        g.globalAlpha = 0.55 * (1 - rk);
        g.strokeStyle = bl.wet ? '#e4f2f8' : '#cfc4ae'; g.lineWidth = 3 - rk * 2;
        g.beginPath(); g.ellipse(px, py, rad, rad * 0.62, 0, 0, Math.PI * 2); g.stroke();
      }
      if (!bl.wet) {                                     // the crater scorch, fading out
        g.globalAlpha = 0.5 * (1 - k);
        g.fillStyle = '#241a10';
        g.beginPath(); g.ellipse(px, py, TL * 0.42, TL * 0.26, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3d2f1e';
        g.beginPath(); g.ellipse(px + 3, py + 2, TL * 0.24, TL * 0.14, 0, 0, Math.PI * 2); g.fill();
      } else if (bl.t >= 0.3 && k < 0.7) {               // ripple rings on water
        g.globalAlpha = 0.3 * (1 - k / 0.7);
        g.strokeStyle = '#dceef4'; g.lineWidth = 1.5;
        const rr = TL * (0.3 + k * 0.9);
        g.beginPath(); g.ellipse(px, py, rr, rr * 0.55, 0, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
    }

    // ---- impact particles: dust/debris fall & shrink, embers & smoke rise ----
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.t -= dt / pt.life;
      if (pt.t <= 0) { this.particles.splice(i, 1); continue; }
      pt.vy += pt.g * dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      g.globalAlpha = pt.smoke ? Math.min(0.55, pt.t * 0.55) : Math.min(1, pt.t * 1.4);
      g.fillStyle = pt.col;
      const s = pt.sz * (pt.smoke ? (1.4 - pt.t) + 0.6 : pt.t);      // smoke expands, debris shrinks
      g.fillRect(pt.x * TL - s / 2, pt.y * TL - s / 2, s, s);
    }
    g.globalAlpha = 1; g.lineWidth = 1.5;

    // ---- sword slashes: a short bowed crimson nick at the blade's reach,
    // opening over two frames and gone in 0.18s — dark berry underlay with
    // a bright core, round caps. Small on purpose. ----
    if (this.slashes.length) {
      const AP = ART.PALETTE;
      g.lineCap = 'round';
      for (let i = this.slashes.length - 1; i >= 0; i--) {
        const sl = this.slashes[i];
        sl.t += dt;
        const k = sl.t / this.SLASH_LIFE;
        if (k >= 1) { this.slashes.splice(i, 1); continue; }
        const grow = Math.min(1, sl.t * 25);
        const half = 4 * grow;                          // 8 world px full length
        const px = sl.x * TL, py = sl.y * TL;
        const ux = Math.cos(sl.ang), uy = Math.sin(sl.ang);
        const bx = px - uy * 2.2, by = py + ux * 2.2;   // control point bows the stroke
        g.globalAlpha = 1 - k * k;
        g.strokeStyle = AP.berry[0]; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(px - ux * half, py - uy * half);
        g.quadraticCurveTo(bx, by, px + ux * half, py + uy * half);
        g.stroke();
        g.strokeStyle = AP.berry[1]; g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(px - ux * half, py - uy * half);
        g.quadraticCurveTo(bx, by, px + ux * half, py + uy * half);
        g.stroke();
      }
      g.globalAlpha = 1; g.lineCap = 'butt'; g.lineWidth = 1.5;
    }

    // ambient life: bird flocks glide over the forest, butterflies flutter over
    // open grass, and shy critters (rabbit/fox/squirrel) creep out of the forest
    // edge, potter about, then dart back into cover and vanish. Pure decoration —
    // transient, pooled render-side particles (never in S), a handful of fillRects
    // each, viewport-only. No per-frame allocation beyond the entity objects.
    this.ambient = this.ambient || [];
    this.ambientT = (this.ambientT || 0) - dt;
    if (this.ambientT <= 0 && this.ambient.length < 7) {
      this.ambientT = 0.8 + Math.random() * 1.5;
      const vx0 = Math.max(1, (this.cam.x / TL) | 0), vy0 = Math.max(1, (this.cam.y / TL) | 0);
      const vw = Math.min(CFG.W - 2, ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0) - vx0;
      const vh = Math.min(CFG.H - 2, ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0) - vy0;
      for (let tries = 0; tries < 10; tries++) {
        const tx = vx0 + (Math.random() * Math.max(1, vw)) | 0;
        const ty = vy0 + (Math.random() * Math.max(1, vh)) | 0;
        if (!G.visibleAt(tx, ty)) continue;
        const tt = S.map.terrain[MapGen.idx(tx, ty)];
        if (tt === T.FOREST) {                              // a small gliding flock
          const dir = Math.random() < 0.5 ? -1 : 1;
          this.ambient.push({
            kind: 'flock', x: tx + Math.random(), y: ty + Math.random(), dir,
            vx: dir * (1.3 + Math.random() * 0.7), vy: (Math.random() - 0.5) * 0.4,
            t: 0, ttl: 5 + Math.random() * 3, ph: Math.random() * 10, n: 2 + (Math.random() * 3 | 0),
          });
          break;
        }
        if (tt !== T.GRASS) continue;
        // is this a forest-edge grass tile? if so a critter can emerge from it
        let fx = 0, fy = 0, edge = false;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          if (MapGen.inB(tx + ox, ty + oy) && S.map.terrain[MapGen.idx(tx + ox, ty + oy)] === T.FOREST) {
            fx = ox; fy = oy; edge = true; break;
          }
        }
        if (edge && Math.random() < 0.65) {
          this.ambient.push({
            kind: 'critter', sub: ['rabbit', 'fox', 'squirrel'][Math.random() * 3 | 0],
            x: tx + 0.5 - fx * 0.35, y: ty + 0.5 - fy * 0.35,
            homeX: tx + fx, homeY: ty + fy,                 // forest tile to bolt back to
            vx: -fx * (0.45 + Math.random() * 0.3), vy: -fy * (0.45 + Math.random() * 0.3),
            t: 0, ttl: 4 + Math.random() * 3, ph: Math.random() * 10, face: fx > 0 ? -1 : 1, state: 'emerge',
          });
        } else {
          this.ambient.push({
            kind: 'fly', x: tx + Math.random(), y: ty + Math.random(),
            vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.4,
            t: 0, ttl: 8 + Math.random() * 4, ph: Math.random() * 10,
            col: ART.PALETTE.bloom[(Math.random() * 3) | 0],
          });
        }
        break;
      }
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.t += dt;
      if (a.kind === 'critter') {
        if (a.state === 'emerge' && a.t > 0.8) a.state = 'wander';
        if (a.state !== 'flee' && a.t > a.ttl - 1.6) a.state = 'flee';
        if (a.state === 'wander') {
          if (Math.sin((a.t + a.ph) * 3.1) > 0.985) { a.vx = (Math.random() - 0.5) * 0.6; a.vy = (Math.random() - 0.5) * 0.5; }
          const hop = Math.max(0, Math.sin((a.t + a.ph) * 7));      // scurry between little pauses
          a.x += a.vx * dt * hop; a.y += a.vy * dt * hop;
        } else if (a.state === 'flee') {
          const dx = (a.homeX + 0.5) - a.x, dy = (a.homeY + 0.5) - a.y, d = Math.hypot(dx, dy) || 1;
          a.vx = dx / d * 2.3; a.vy = dy / d * 2.3;
          a.x += a.vx * dt; a.y += a.vy * dt;
          if (d < 0.4) { this.ambient.splice(i, 1); continue; }     // reached cover, gone
        } else { a.x += a.vx * dt; a.y += a.vy * dt; }
        if (a.vx) a.face = a.vx < 0 ? -1 : 1;
      } else if (a.kind === 'flock') {
        a.x += a.vx * dt; a.y += a.vy * dt + Math.sin((a.t + a.ph) * 1.5) * 0.006;
      } else {
        a.x += a.vx * dt; a.y += a.vy * dt + Math.sin((a.t + a.ph) * 5) * 0.010;
        if (Math.sin((a.t + a.ph) * 2.3) > 0.97) { a.vx = (Math.random() - 0.5) * 0.5; a.vy = (Math.random() - 0.5) * 0.4; }
      }
      if (a.t > a.ttl || !MapGen.inB(a.x | 0, a.y | 0)) { this.ambient.splice(i, 1); continue; }
      if (!G.visibleAt(a.x | 0, a.y | 0)) continue;
      const ax = a.x * TL, ay = a.y * TL;
      const fade = Math.min(1, Math.min(a.t, a.ttl - a.t) * 2);
      g.globalAlpha = Math.max(0, fade * 0.9);
      if (a.kind === 'flock') this._drawFlock(g, a, ax, ay);
      else if (a.kind === 'critter') this._drawCritter(g, a, ax, ay);
      else {
        g.fillStyle = a.col;
        const open = Math.sin((a.t + a.ph) * 10) > 0;
        g.fillRect(ax - (open ? 2.5 : 1.5), ay, 2, 2);
        g.fillRect(ax + (open ? 0.5 : -0.5), ay, 2, 2);
        g.fillStyle = ART.PALETTE.ink[1]; g.fillRect(ax - 0.5, ay, 1, 2);   // slim body
      }
      g.globalAlpha = 1;
    }

    // construction-start dust — drawn over the units, so the cloud rolls
    // over whoever is standing at the new site (the collapse-dust rule)
    this.drawPlacePoofs(g, dt);
    // the homestead's gold rides above the dust — it is a reward, not debris
    this.drawBondSparks(g, dt);

    // placement ghost
    if (UI.placing === 'wall' && UI.wallGhost && UI.wallGhost.length) {
      // dragged wall line: oriented pieces, green when buildable+affordable
      for (const t of UI.wallGhost) {
        g.globalAlpha = 0.65;
        g.drawImage(Sprites.wallMask[0][t.mask], t.x * TL, t.y * TL);
        g.globalAlpha = 1;
        g.fillStyle = t.ok ? 'rgba(125,187,94,0.35)' : 'rgba(224,101,80,0.45)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
      }
    } else if (UI.placing) {
      // the true-art, true-footprint placement ghost + its ✓/⃠ badge and any
      // effect radius — the whole look lives in drawPlaceGhost
      this.drawPlaceGhost(g);
    }

    // sapper dig/clear line being dragged: amber where workable, red where not
    if (UI.terraDrag && UI.terraGhost && UI.terraGhost.length) {
      for (const t of UI.terraGhost) {
        g.fillStyle = t.ok ? 'rgba(210,168,86,0.38)' : 'rgba(224,101,80,0.42)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
        g.strokeStyle = t.ok ? 'rgba(244,222,150,0.95)' : 'rgba(224,101,80,0.95)';
        g.lineWidth = 2;
        g.strokeRect(t.x * TL + 1, t.y * TL + 1, TL - 2, TL - 2);
      }
    }

    // DRAG-TO-MOVE tether: a dashed gold line from the dragged selection to the
    // finger, an arrowhead on the business end, and a pulsing ring on the
    // destination tile — green-gold over known ground, red over the unexplored
    if (UI.moveDrag) {
      const md = UI.moveDrag;
      const w = this.screenToWorld(md.sx, md.sy);
      const tw = this.screenToTile(md.sx, md.sy);
      const known = MapGen.inB(tw.x, tw.y) && S.map.explored[MapGen.idx(tw.x, tw.y)];
      const ax = md.ax * TL, ay = md.ay * TL, tx = w.x, ty = w.y;
      const col = known ? '232,193,90' : '224,101,80';
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
      g.save();
      g.setLineDash([7, 6]);
      g.lineDashOffset = -(performance.now() / 40) % 13;   // the dashes MARCH toward the target
      g.strokeStyle = 'rgba(' + col + ',0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(tx, ty); g.stroke();
      g.setLineDash([]);
      // arrowhead pointing along the tether
      const angA = Math.atan2(ty - ay, tx - ax);
      g.fillStyle = 'rgba(' + col + ',0.95)';
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(tx - Math.cos(angA - 0.42) * 11, ty - Math.sin(angA - 0.42) * 11);
      g.lineTo(tx - Math.cos(angA + 0.42) * 11, ty - Math.sin(angA + 0.42) * 11);
      g.fill();
      // the destination tile, breathing
      if (MapGen.inB(tw.x, tw.y)) {
        g.strokeStyle = 'rgba(' + col + ',' + (0.45 + 0.4 * pulse) + ')'; g.lineWidth = 2;
        g.strokeRect(tw.x * TL + 2, tw.y * TL + 2, TL - 4, TL - 4);
        g.beginPath();
        g.arc((tw.x + 0.5) * TL, (tw.y + 0.5) * TL, TL * (0.38 + 0.1 * pulse), 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
    // …and the "order landed" pulse where a drag was released: a quick green
    // double-ring that expands and fades, so the hand-off is unmistakable
    if (UI.moveFlash) {
      const f = UI.moveFlash;
      f.t -= dt;
      if (f.t <= 0) { UI.moveFlash = null; }
      else {
        const k = f.t / f.life, done = 1 - k;
        const fx = (f.x + 0.5) * TL, fy = (f.y + 0.5) * TL;
        g.strokeStyle = 'rgba(138,224,138,' + (0.75 * k) + ')'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(fx, fy, 4 + done * 15, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(138,224,138,' + (0.45 * k) + ')'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(fx, fy, 2 + done * 9, 0, Math.PI * 2); g.stroke();
      }
    }

    // rally point flag / rally-setting range ring
    if (UI.settingRally) {
      const rb = Bld.get(UI.settingRally);
      if (rb) {
        g.strokeStyle = 'rgba(232,193,90,0.6)'; g.lineWidth = 2;
        g.beginPath();
        g.arc((rb.x + 0.5) * TL, (rb.y + 0.5) * TL, CFG.RALLY_RANGE * TL, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (UI.sel && UI.sel.type === 'bld') {
      const rb = Bld.get(UI.sel.id);
      if (rb && rb.rally) {
        const fx = (rb.rally.x + 0.5) * TL, fy = (rb.rally.y + 0.5) * TL;
        g.strokeStyle = 'rgba(232,193,90,0.5)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(Bld.cx(rb) * TL, Bld.cy(rb) * TL); g.lineTo(fx, fy); g.stroke();
        g.strokeStyle = '#e8c15a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx, fy + 6); g.lineTo(fx, fy - 8); g.stroke();
        g.fillStyle = '#e8c15a';
        g.beginPath(); g.moveTo(fx, fy - 8); g.lineTo(fx + 8, fy - 5); g.lineTo(fx, fy - 2); g.fill();
      }
    }
    // rally CONFIRM flourish: a placed rally auto-deselects, so flash the flag it
    // dropped for a beat — an expanding pulse + a popped-in flag that fades out —
    // so the player sees exactly where it landed before the panel closes.
    if (UI.rallyFlash) {
      const f = UI.rallyFlash;
      f.t -= dt;
      if (f.t <= 0) { UI.rallyFlash = null; }
      else {
        const k = f.t / f.life;                        // 1 → 0 over its life
        const done = 1 - k;                            // 0 → 1
        const fx = (f.x + 0.5) * TL, fy = (f.y + 0.5) * TL;
        const a = k > 0.35 ? 1 : k / 0.35;             // hold, then fade in the last beat
        const pop = Math.min(1, done / 0.14);          // quick scale-in on arrival
        // tether from the building to the flag
        g.strokeStyle = 'rgba(232,193,90,' + (0.5 * a) + ')'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(f.bx * TL, f.by * TL); g.lineTo(fx, fy); g.stroke();
        // an expanding ring that fades as it grows — the "it landed" pulse
        g.strokeStyle = 'rgba(232,193,90,' + (0.55 * k) + ')'; g.lineWidth = 2;
        g.beginPath(); g.arc(fx, fy, 3 + done * 13, 0, Math.PI * 2); g.stroke();
        // the flag itself, popping up from the ground
        const h = 16 * pop;
        g.strokeStyle = 'rgba(232,193,90,' + a + ')'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx, fy + 6); g.lineTo(fx, fy + 6 - h); g.stroke();
        g.fillStyle = 'rgba(232,193,90,' + a + ')';
        g.beginPath(); g.moveTo(fx, fy + 6 - h); g.lineTo(fx + 8 * pop, fy + 9 - h); g.lineTo(fx, fy + 12 - h); g.fill();
      }
    }

    // fog of war — blit the pre-blurred, feathered fog (built in redrawFog)
    if (this.fogDirty || !this.fogBlurCv) this.redrawFog();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogBlurCv, 0, 0, this.fogBlurCv.width, this.fogBlurCv.height, 0, 0, CFG.W * TL, CFG.H * TL);
    g.imageSmoothingEnabled = false;

    // ?dev=1 formation workbench: the per-cell coverage grid over placed
    // pieces, above the fog so it always reads. One short-circuit in play.
    if (window.DevArt && DevArt.on && DevArt.maskOverlay) DevArt.drawMasks(g);

    // SPECIAL EVENT — the long winter's pall: a cold blue cast and drifting
    // snow over the whole view while the freeze holds
    if (S.winter && S.winter.days > 0) {
      const vw = this.viewW() / this.cam.z, vh = this.viewH() / this.cam.z;
      g.fillStyle = 'rgba(168,192,226,0.14)';
      g.fillRect(this.cam.x, this.cam.y, vw, vh);
      const now3 = performance.now() / 1000;
      g.fillStyle = 'rgba(240,246,252,0.7)';
      for (let i = 0; i < 26; i++) {
        const fx3 = this.cam.x + ((i * 137 + now3 * (14 + (i % 5) * 4)) % vw);
        const fy3 = this.cam.y + ((i * 71 + now3 * (26 + (i % 3) * 9)) % vh);
        g.fillRect(fx3, fy3, 1.6, 1.6);
      }
    }

    // SPECIAL EVENT — the black dragon, drawn over the fog: nothing hides it
    if (S.dragon && S.dragon.ev) {
      const ev = S.dragon.ev;
      const dx2 = ev.x * TL, dy2 = ev.y * TL;
      const spr = Sprites.misc.dragon[((ev.t * 6) | 0) % 4];   // four-beat wing cycle
      // its shadow races along the ground below
      g.fillStyle = 'rgba(10,8,5,0.30)';
      g.beginPath(); g.ellipse(dx2, dy2 + 8, 32, 9, 0, 0, Math.PI * 2); g.fill();
      // fire breath during the strafe: a roaring cone from the jaws to the ground
      if (ev.phase === 'burn') {
        const F = ART.PALETTE.fire;
        const mx = dx2 + ev.dir * 72, my = dy2 - 52;           // the jaws (see sprite head position)
        for (let i = 0; i < 18; i++) {
          const t2 = i / 18;
          const bx2 = mx + ev.dir * t2 * 26 + Math.sin(ev.t * 22 + i * 2.4) * (2 + t2 * 4);
          const by2 = my + t2 * 58;
          const sz = 2.5 + t2 * 8;
          g.fillStyle = F[t2 < 0.3 ? 3 : t2 < 0.65 ? 2 : 1];
          g.fillRect(bx2 - sz / 2, by2 - sz / 2, sz, sz);
        }
        for (let i = 0; i < 6; i++) {                     // embers skittering at the impact
          g.fillStyle = F[i % 2 ? 0 : 1];
          g.fillRect(dx2 + ev.dir * (60 + i * 9) + Math.sin(ev.t * 17 + i * 3) * 5, dy2 + 4 + (i % 3) * 2, 3, 3);
        }
      }
      g.save();
      g.translate(dx2, dy2 - 34);
      if (ev.dir < 0) g.scale(-1, 1);
      g.drawImage(spr, -96, -48);
      g.restore();
    }

    // buildings coming DOWN — over the units, so the dust rolls across them
    this.drawTreeFalls(g, dt);
    this.drawHorns(g, dt);
    this.drawCollapses(g, dt);
    this.drawDeaths(g, dt);     // …and villagers keeling over where they stood

    // floating text
    g.textAlign = 'center';
    g.font = 'bold 9px sans-serif';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t -= dt; f.y -= dt * 0.6;
      if (f.t <= 0) { this.floats.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, f.t * 2);
      g.fillStyle = f.col;
      g.fillText(f.txt, f.x * TL, f.y * TL);
      g.globalAlpha = 1;
    }

    // gentle long-cycle dusk: after ~10 bright days, night eases in and out
    // across ~2 days — one slow, calm breath, never a strobe. Screen-space
    // tint only; costs one or two fillRects.
    {
      // read once at the top of the frame (R.dayPhase — the bench's golden
      // hour hold lives there too); the living water's sparkle shares it
      const { k, warm } = this._dusk || this.dayPhase();
      if (k > 0.02) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = 'rgba(22,28,64,' + (0.20 * k).toFixed(3) + ')';
        g.fillRect(0, 0, this.cv.width, this.cv.height);
        if (warm > 0.01) {
          g.fillStyle = 'rgba(240,150,70,' + warm.toFixed(3) + ')';
          g.fillRect(0, 0, this.cv.width, this.cv.height);
        }
      }
    }

    // the monument is finished: hold the frame on it (tests/wonder.mjs)
    this.drawMarvel(g, dt);

    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.5; this.drawMini(); }
  },

  bar(g, x, y, w, h, frac, col) {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, y, w, h);
    g.fillStyle = col;
    g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  },

  // small minimap snapshot for cloud-save slot cards
  thumb() {
    try {
      const c = document.createElement('canvas');
      c.width = 72; c.height = 72;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(this.mini, 0, 0, 72, 72);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  },

  drawMini() {
    const AP = ART.PALETTE;
    const g = this.mg, COLORS = [AP.grass[3], AP.leaf[1], AP.water[2], AP.stone[2], AP.soil[2], AP.rust[1],
      AP.grass[2], AP.stone[3], AP.soil[3], AP.stone[1], AP.stone[0], AP.soil[0], AP.water[1], AP.soil[3],
      AP.gold[2]];
      // grass forest water hills fertile camp stumps pebbles barren ruin mountain trench moat mound goldore
      // (INDEXED BY TERRAIN — a new T.* needs a colour here or its tiles read as
      //  undefined and the minimap paints holes where they stand)
    const shadeCache = {};
    const shade = c => shadeCache[c] || (shadeCache[c] = c.replace(/[0-9a-f]{2}/gi,
      h => Math.max(0, (parseInt(h, 16) * 0.55) | 0).toString(16).padStart(2, '0')));
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      const edge = !MapGen.onBoard(x, y);
      const col = COLORS[S.map.seenTerrain[i]] || AP.grass[3];   // any unmapped terrain id falls back, never undefined
      g.fillStyle = edge ? '#0d0b08'                             // the black off-map rim (see drawTile)
        : !S.map.explored[i] ? '#060504'
        : (G.vis && G.vis[i]) ? col
        : shade(col);
      g.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const b of S.buildings) {
      if (!G.visibleAt(b.x, b.y)) continue;
      if (Bld.size(b) > 1) {
        g.fillStyle = b.owner === 'P' ? '#7ab4dc' : '#d98a80';
        g.fillRect(b.x * 2 - 1, b.y * 2 - 1, Bld.size(b) * 2 + 2, Bld.size(b) * 2 + 2);
        continue;
      }
      g.fillStyle = b.owner === 'P' ? '#5ab4f0' : '#f0645a';
      g.fillRect(b.x * 2 - 1, b.y * 2 - 1, 4, 4);
    }
    for (const k in S.map.seenB) {
      const i = +k;
      if ((G.vis && G.vis[i]) || !S.map.explored[i]) continue;
      g.fillStyle = S.map.seenB[k].owner === 'P' ? '#3a6a8a' : '#8a4a44';
      g.fillRect((i % CFG.W) * 2 - 1, ((i / CFG.W) | 0) * 2 - 1, 4, 4);
    }
    for (const u of S.units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      g.fillStyle = u.owner === 'P' ? '#c0e8ff' : u.owner === 'A' ? '#ffb0a8' : u.owner === 'R' ? '#3fd0b0' : '#e8d8a0';
      g.fillRect((u.x * 2) | 0, (u.y * 2) | 0, 2, 2);
    }
    // a DISCOVERED wilderness relic is a landmark worth finding again
    if (window.Relics) Relics.drawMini(g);
    // camera rect
    const TL = CFG.TILE;
    g.strokeStyle = '#f0e6d0'; g.lineWidth = 1;
    g.strokeRect(this.cam.x / TL * 2, this.cam.y / TL * 2,
      this.viewW() / this.cam.z / TL * 2, this.viewH() / this.cam.z / TL * 2);
  },
};
// classic-script top-level `const` bindings are NOT global-object properties,
// so map.js / buildings.js / assets.js guards like `if (window.R && ...)` were
// silently false — terrain never repainted after a dig, flood, clear or bridge.
// Mirror R onto window (as game.js does for S) so those guards fire.
window.R = R;
