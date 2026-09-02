# LAND_REFRESH.md — Clanfire terrain beautification pass

**Run in:** Claude Code cloud, repo `RobleusCaesar/civilization-game`, branch `main`.
**Rhythm:** one phase at a time, in order. At the end of every phase: run tests, then **commit and push to main** (Pages auto-deploys; the workflow self-retries — never the "Re-run" button). Never leave main mid-phase.
**Before writing any code:** read `ARTSTYLE.md`, the `LAND` block (js/render.js:61) and `MTN` block (js/render.js:243) comment-by-comment. They encode hard-won lessons; this brief *extends* them and never overrides them. Use latest stable everything; pin nothing.

## Why this pass exists

Clanfire's land tech is already strong — traced shoreline polygons with shelf/foam/shoals, a quantized tone field, disciplined decal scatter, region-object mountains, a deterministic full-map bake at ~0.3–0.8ms frame p95. And yet the map still reads bland. The gap is **not** more systems and **not** more objects. It is three things the current layers deliberately whisper:

1. **Color** — the ground varies only in lightness, never in hue; the water body is one flat blue.
2. **Macro composition** — nothing changes across 30 tiles; every screenshot is the same screenshot.
3. **Motion** — the living-water layer exists but is nearly subliminal; the world barely moves.

The standing doctrines still bind: *depth comes from tone and edges, not object count* — and *decoration is background; resources are the only foreground*. Every change below is a tone/edge/color/motion move, lands in the bake unless marked **FRAME**, and ships behind a dial.

**Hard perf gates (checked every phase):**

- First bake ≤ 1.3s on the worst map (mountain-heavy baseline was ~1.1s).
- Terrain-edit repaint within +10% of the re-baselined workloads (`tests/land.mjs` §18, 2026-09-01, headless Chromium on the baseline desktop): an open-ground edit **0.92ms → gate 1.01ms**; an edit within two tiles of water **2.33ms → gate 2.56ms** (in-suite baselines; a cold standalone page reads ~8% lower: 0.84 / 2.28). Timed as whole batches of 49 edits (`performance.now()` is clamped to 0.1ms, so single edits cannot be timed), min over 9 batches, no CI multiplier. The bench's *edit ms* button runs the same measurement on the phone; re-baseline from that when it disagrees.
- World-pass frame p95 ≤ 1.5ms desktop; all new FRAME work combined ≤ 0.4ms at default zoom; 60fps on iPhone Safari stands.
- New memory ≤ ~100KB total (typed arrays only — no new full-map canvases).
- No canvas creation, sprite regeneration, or getImageData in the frame loop. Animated overlays iterate viewport tiles only.

---

## Phase 0 — the tuning bench (build this first)

Every later phase is 20% code, 80% tuning. The creator whose game inspired this pass says the single highest-leverage thing he built was in-game editors, and that "screenshots are the referee." Adopt both.

In `js/dev.js` (the `?dev=1` panel), add a **Land bench** section:

1. **Dials.** Sliders/steppers bound to a whitelisted set of `LAND.*`, `MTN.*`, and the new dials added below (each declared with min/max/step). A change triggers the existing full-repaint path (same as a terrain edit), debounced ~250ms.
2. **Copy values.** Button that emits every dial that differs from default as a JS object literal — that's how a tuning session on the phone becomes a commit.
3. **A/B.** Snapshot the current viewport to an offscreen PNG; hold two snapshots; tap to flip between them, blind-labeled 1/2. Ship a look only when it wins blind.
4. **Same-view bookmark.** Seed input + saved camera (x, y, zoom) so before/after screenshots are pixel-comparable across reloads.

**Tests:** extend `tests/land.mjs` with the perf gates above (generous CI multipliers) so later phases can't regress silently.

**Accept when:** dials retune the live map without reload; values export; A/B flips on tap; gates run in CI.

---

## Phase 1 — water: depth and life (the single biggest win)

Reference point: in the fishing game Rob admires, ~70% of the beauty is water — deep navy far from shore, luminous shallows near it, glints everywhere. Clanfire paints one flat `W[1]` body (js/render.js `paintWater`, ~line 1853) with a ±0.05-alpha tone whisper, and the traced shelf only reaches ~0.7 tiles (`SHELF_REACH: 11` sixteenths).

### 1a. Baked depth bands (BAKE)

- At bake, for each flood-filled water region (the shoreline tracer already builds these), run a BFS distance transform: tiles-to-nearest-land, capped ~10. Store as one `Uint8Array(W*H)` (≈4–17KB).
- Paint the body in **3–4 quantized depth bands** from that field instead of uniform `W[1]`: band edges near d ≈ 1.5 / 4 / 8 tiles. Sample the field bilinearly per sub-cell and displace each edge with the existing world-space noise (the `ROCK_WANDER` trick), then dither the 1px seam (`ART.dither`) — **no band edge may follow the tile grid**, and no smooth gradients (ARTSTYLE rule 5).
- Colors: deepest band = `water[0]` or one new deeper navy; add one warm turquoise between `water[2]` and the shelf so shallows glow. Extend `ART.PALETTE.water` deliberately and document it in ARTSTYLE.md. Keep saturation modest and A/B it — the goal is "basin," not "tropical resort."
- The traced shelf, foam, sand, shoals, and kelp/coral (`LIFE_*`) stay exactly as they are, layered on top. Moats/trenches keep constant depth.
- New dials: `WATER_DEPTH = { EDGES, WANDER, AMP }` in the bench.
- Swell-crest pixels and glints: unchanged logic, but pick the band-local lighter shade so crests still read over the deep band.

### 1b. Foam that moves (FRAME)

Along the *visible* portion of each traced shore polyline, stroke a 1px broken foam line whose dash offset advances slowly (~2px/s) with a gentle alpha pulse — a lapping waterline. Halve the existing blinking foam-dot count in the living-water block (~line 7593) to compensate. One clipped stroke per visible region per frame; skip below a zoom threshold.

### 1c. Fish that actually jump (FRAME)

Replace the flat 2-frame `drawImage` with a small performance: sprite rises ~6px over ~0.4s along an arc with a peak-squash frame, splash ring on re-entry (reuse the water ripple-ring drawing at ~line 8104), 2–3 white droplet pixels. Keep the existing frequency gating exactly — shoal-often / open-water-rare is good design (it's the fishing tell).

### 1d. Golden-hour sparkle (FRAME, two lines)

During the dusk cycle's warm phase (~line 8461), multiply sparkle alpha ×1.5 and warm-tint it. That's the whole feature.

### 1e. Kill the concave-bay artifact (BAKE, known bug)

The stacked shelf/band offsets self-intersect on concave bays and spray color outside the water ("blue shoreline artifacts"). Clip every water-side band to actual water tiles and drop inverted loops. Do this while you're in the geometry.

**Accept when:** a large lake reads as a basin — dark heart, glowing rim — at every zoom with zero visible rings, staircases, or bay artifacts; the waterline visibly laps at rest; a jumping fish catches the eye; frame gates hold on the biggest map.

---

## Phase 2 — ground: color composition, not objects

The tone layer (`groundTint`, ~line 534) only lightens/darkens one green. Real meadows vary in **hue**.

### 2a. Hue octave (BAKE)

A second, much lower-frequency field (~0.02/tile — reuse `landTone` with a different seed/frequency so it costs zero storage) shifts grass between warm yellow-green and cool blue-green: two chromatic overlays (warm ~`rgba(214,196,90,a)`, cool ~`rgba(30,90,110,a)`, a ≤ 0.06), quantized to 3 hard steps, dithered seams. Water ignores it (it has its own depth now). Dials: `HUE_AMP`, `HUE_FREQ`.

### 2b. Meadow character patches (BAKE)

Only inside the warmest hue step: raise the rare flower-meadow tile roll (currently `h % 61`, ~line 2977) ~3×, and allow +1 flower decal through the existing clump gate. Color mass where the sun is; `DECAL_MUTE` still applies, so flowers read as ground, not objects.

### 2c. One sun for the whole map (BAKE)

`cornerShade` darkens ground near woods radially. Light is locked top-left — so weight `SHADE_FOREST` toward S/E corners (~60/40). Woods now cast southeast, and the entire map agrees on a sun with the buildings and units for free.

### 2d. Felt-grain audit (BAKE)

`paintGround`'s per-pixel grass grain is nearly invisible. Raise it one step (two adjacent `grass` ramp shades, ~8% of pixels). Judge at min and max zoom: grain must disappear with distance, never shimmer.

**Accept when:** two screenshots 20 tiles apart look like different places in the same valley; bare grass is never a flat fill at 1×; nothing added reads as an object or fights a resource (squint test).

---

## Phase 3 — features that sit in the world

- **3a. Trees (build-time, sprites.js).** Canopy relight only: one darker under-shade at the S/E of each of the four silhouettes plus a lit crown crescent on the N/W. Add a fifth *rare* stand variant with an olive/autumn cast for deep cores (`terrainRare`). No wind — the bake stays static; the startle birds already animate the woods.
- **3b. Rocks, ore, hills.** 1px S/E contact shadow under `rockMass` boulders and `oreStamp`; then bench-tune `HILL_SHADOW` upward (~0.32 → ~0.38 candidate) and the shoal-life visibility (`LIFE_*`) which is currently almost subliminal.
- **3c. Gold twinkle (FRAME, tiny).** Viewport `GOLDORE` tiles: one 2px star glint in the gold ramp per tile every few seconds, hash-staggered. Gold stays in `DECAL_RESERVED` — this twinkle becomes the only moving gold on the map, which is exactly why it works.
- **3d. Orchards & berries (BAKE + one PixelLab option).** First fix the known stray warm-yellow tuft appearing near orchards/berries (a decal color passing the whitelist it shouldn't). Then: berry bushes get 3–5 berry clusters in two ramp reds with a 1px highlight; orchard FERTILE tiles get loose rows with fruit-dot color and a dropped-fruit ring; bias butterfly spawns (ambient pool, ~line 8158) toward orchards and flower meadows. If procedural fruit trees won't sing, author orchard/berry tile variants in PixelLab per the asset appendix — the terrain override pipeline (`assets/terrain/README.md`) already carries them with zero code.

**Accept when:** resources visibly outrank decoration; gold catches the eye within ~3s at rest; orchard (cultivated) vs berries (wild) reads at a glance; villager pathing legibility is untouched.

---

## Phase 4 — mountains: land the hand-art track; make the painter honest meanwhile

The decided hero path stands: **hand-authored formation PNGs** (external design AI + the `?dev=1` conform tool + `mountain-{W}x{H}-{shape}-{letter}.png` contract, infra live-but-inert in `js/formations.js`). Code's job:

1. **Wire and verify formation art end-to-end** as pieces land: alpha-derived coverage, strip occlusion (units walk in front of south faces, vanish behind ridges), fog ghosts, minimap, and the no-art procedural fallback per region.
2. **Avoid a style cliff:** convert by size class, not at random — RANGE/MOUNTAIN regions get art first; CRAG/OUTCROP stay procedural (they already read fine). One map should never show two mountain languages at the same scale.
3. **Tune the painter via the bench, not blind edits.** The `crag` ramp spans near-black → near-white (8 shades); verify big ranges actually *reach* both ends (`BASE`/`RISE`/`MACRO`/`LIGHT`), confirm the snow threshold (`MTN.SNOW`/`SNOW_MIND`) fires on all three map sizes, and strengthen the conifer scatter on lower skirts. Target read: several summits, near-white lit crests, near-black gullies, trees up the toes.

**Accept when:** a range reads as one lit massif at any zoom; no grey-blob regions; art and procedural coexist without a visible seam in language.

---

## Phase 5 — the frame: grade and ambient (every item behind a dev toggle, shipped only if it wins blind A/B)

- **Vignette:** pre-render one radial-gradient canvas on resize (4–6% corner darkening), one `drawImage` per frame.
- **Constant warmth:** a +2–3% warm full-screen fillRect — the fishing game's golden grade in one line. The dusk cycle already proves the mechanism costs nothing.
- **Ambient reach:** let bird flocks occasionally cross open water so lakes get life between fish jumps. Pool cap stays 7.
- **Stretch — decorative streams:** 1-tile meanders from hills to lakes drawn at bake (darker grass channel + water glints), zero gameplay meaning, zero pathing effect. Only after everything above ships.

---

## What NOT to do

- **No engine/renderer migration.** Canvas 2D + the deterministic bake is the right architecture for this game and it is nowhere near its ceiling. WebGL/PixiJS would buy shaders we can fake for pennies and cost a rewrite.
- **No Blender, no Godot.** The fishing game is 3D — Blender models and Godot water shaders solve *its* problems. Clanfire's equivalents are the bake (our "shader") and authored PNGs (our "models").
- **No new object types on open grass.** Doctrine. When a phase looks busy rather than deep, turn dials down.
- **No smooth gradients anywhere.** Quantized steps + dither, always.
- **No copying the fishing game's identity.** We are taking its *lessons* — water depth, warm grade, living surface, in-game tuning, screenshots-as-referee — not its look. Clanfire stays elevated 16-bit top-down, warm and earthy.

## Asset appendix (Rob, outside this CC session)

Code covers everything except two optional art tracks:

- **Orchard/berry tiles (Phase 3d fallback):** PixelLab, transparent floor per `assets/terrain/README.md` (they layer over the painted grass), 64px source, top-left light, hard-edged pixel shading, no ground patch, ≤3 elements per tile (the staging rule). Drop into `assets/terrain/` — no code needed.
- **Mountain formations (Phase 4):** continue the current external-AI → conform-tool → GitHub-web-UI path per ART_PLAN.md.
- **Meshy:** not in the runtime pipeline. Legitimate uses only as *reference* — render a low-poly massif top-down to study lighting before prompting mountain PNGs, or for marketing/endgame stills. Skippable entirely.

## Working agreement (every phase)

1. Implement behind dials; pick defaults with the Phase-0 bench.
2. Before/after screenshots: same seed, same bookmarked camera, min/mid/max zoom, plus one golden-hour shot. Blind A/B; score /10 against the live build; **ship ≥8, revert <7**.
3. Run `tests/land.mjs`, `tests/art-pipeline.mjs`, boot test, and the perf gates.
4. Document every new dial where it lives (render.js comment style) and list it in ART_PLAN.md.
5. Commit and push to main.
