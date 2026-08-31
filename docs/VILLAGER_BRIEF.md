# Villager Tier Overhaul — Gate A Design Brief

Six characters: 3 tiers × 2 genders, tied to Town Center level. Written
before any generation, per the sprint order. **Nothing in this document has
been generated — zero spend so far.** The plumbing (Phase 1) is live and
tested; the recolor law is settled and proven lossless
(`tests/villager-tiers.mjs`); ARTSTYLE §8b now scopes material vocabulary
per villager tier, on the record.

## The silhouette split (the whole game at 32px)

Judged as black shapes first, per the animal doctrine. Three cues carry the
tiers — **hem height, shoulder treatment, and overall proportion** — and
each tier owns exactly one signature:

| | L1 Forager | L2 Settler | L3 Citizen |
|---|---|---|---|
| **Signature** | ASYMMETRY | THE BELT | THE COLUMN |
| **Shape** | short ragged wedge | belted rectangle | tall smooth column |
| **Hem** | mid-thigh, ragged diagonal (one side longer) | knee, straight cut | mid-calf ♂ / ankle ♀, straight fall |
| **Shoulders** | narrow, sloped; fur ruff bulks ONE shoulder | squared, seamed, symmetric | broadened by the drape's diagonal fold, smooth |
| **Waist** | none (loose wrap) | CINCHED — the only tier with a waist | none — the drape falls through |
| **Height feel** | shortest (hunched carriage, shaggy hair) | mid (upright, neat hair) | tallest (+1 head cell: erect carriage, dressed hair) |

Any two tiers differ in at least two of the three cues, so the read
survives the 2:1 downscale. L1's asymmetry is reserved: L2 and L3 are
strictly symmetric silhouettes.

## The six designs

Shared spec (frozen, from the deer work): ~60px ask on an 80px pro canvas
(the model draws its subject at ~75% of canvas), 64px committed composer
window, exact 2:1 into the 32px box, hard binary alpha, continuous 1px ink
outline including hem and legs, limbs ≥2px with dark feet, light locked
top-left, NO baked shadow (the renderer draws contact), camera = the
character-class low top-down 3/4 (the stag master doubles as the camera
anchor).

**The tunic region — the recolor law in every design.** The garment's lit
face is EXACTLY `#3f6d99` and its shade face EXACTLY `#2c4e70`
(`Assets.TUNIC_KEY`), same two hexes in the same roles in all six masters,
appearing nowhere else in any frame. Generated art gets a ramp-snap pass
before install; QC counts key pixels and verifies exclusivity.

### L1 male — THE FROZEN VILLAGER-CLASS MASTER (generated first, Gate B)
- **Garment:** a rough cloth wrap knotted over one shoulder — lit face in
  the tunic body hex, under-fold shade in the accent — with a hide fur
  ruff over the OTHER shoulder (hide-brown ramp, never the key hexes).
  Ragged diagonal hem at mid-thigh; bare 2px legs, dark feet.
- **Palette beyond the tunic:** existing skin ramp, `PAL.hair` shaggy and
  jaw-length, hide-brown fur/cord.
- **Specular ration:** one 1px bone-tooth pendant on the cord — the tier's
  single near-white element.
- **vs L2:** no waist, ragged vs straight hem, asymmetric bulk, bare legs.

### L1 female
- Same wrap language and fur ruff, hem carried as a ragged A-line to just
  below the knee (the dress flare = the standing gender cue), shaggy hair
  longer, past the shoulders. Same bone pendant ration.
- **Honesty:** hip/chest difference at this size is 1–2px and reads only
  under a magnifier; hem length + flare + hair length carry the read.

### L2 male
- **Garment:** straight woven knee-length tunic (lit = body hex; right
  side and under-belt shade = accent hex), seamed square shoulders, dark
  leather belt at the waist — THE tier signature — and leather leg-wraps
  darkening the shins over 2px legs.
- **Specular ration:** one 1–2px bronze buckle glint at the belt
  (ARTSTYLE §8b ration size).
- **vs L1:** waist exists, hems straight, symmetric, covered shins.
  **vs L3:** hem at the knee not the calf, waist cinched not falling,
  shoulders squared not draped.

### L2 female
- Belted woven dress, belt riding slightly higher, skirt flaring from the
  belt to mid-calf (longer than the male, keeping the flare cue), hair in
  a neat bun (a distinct silhouette bump the male lacks). Same single
  buckle glint.

### L3 male
- **Garment:** a draped robe falling shoulder-to-mid-calf in one column —
  lit column in the body hex, and the diagonal drape fold band across the
  torso rendered in the ACCENT hex (its shade role; in the red faction it
  reads as the deeper dye of the fold — the recolor holds by
  construction). No belt. Leather sandals: feet stay dark per doctrine,
  sandal read via a single lighter ankle-strap pixel.
- **Specular ration:** one 1–2px bronze fibula glint where the drape
  gathers at the shoulder.
- **Bearing:** erect, +1 head cell over L2 via carriage and combed hair —
  the tallest, narrowest, smoothest shape on the map.
- **vs L2:** no waist, longest hem, the diagonal fold is the only interior
  line.

### L3 female
- Same column language to the ankle (longest hem in the game), drape
  gathered at BOTH shoulders with the fold band lower across the body,
  hair piled high (an updo silhouette taller than the male's combed
  head — the pair's gender cue at this tier, since the column mutes the
  flare). Fibula glint ration.

## Gender — what actually carries it (asked for honestly)

At 32 world px: hem length/flare (~50% of the read), hair silhouette
(~40%: shaggy-long / bun / updo vs shaggy-short / neat / combed), and 1–2px
of hip width (~10%, honestly near-invisible). Chest rendering at this size
is noise and is not attempted. Every female hem is longer than its male
counterpart at the same tier, and no female hem is longer than the next
tier's male hem — so gender never masquerades as a tier.

## Contrast note (stated plainly)

The tunic body hex sits AT the grass floor (#3f6d99 ≈ lum 102), not below
it — villagers have always read through their continuous outline, accent
shading, and skin/hair mass rather than a dark body mass, and the recolor
law fixes the ramp. The DARK masses per tier (L1 fur, L2 belt/leg-wraps,
L3 fold band + hair) keep each figure's median below the floor.

## Anchoring (per the reference doctrine)

L1 male generates first, anchored to `assets/masters/animal-deer-60.png`
for density, outline weight, and contrast — via `style_image_url` +
`style_copy [outline, detail, shading]`, never `reference_images` (the
bear proved labelled references pull identity) and never `color_palette`
(the tunic key must land exactly). On approval it freezes as
`assets/masters/villager-l1m-60.png`, and the other five anchor to IT
directly — never to each other, never to the newest piece. A drifting
tier re-anchors to L1♂ and regenerates. Rotation guides are 64×64 FILES
(the bear's canvas-is-the-size-control lesson).

## Cost model (required before generating)

Observed rates this session: pro master call ≈ 25 gens (16 candidates at
≤85px canvas), v3 rotation 1–2, v3 animation billed per direction on the
padded canvas — 1/dir likely at the villager's 64px reference, 2/dir
budgeted (the standing "quotes run 2× low" rule).

Poses per character (7): walk 12fr — the most-looked-at cycle, matching
the animals — and idle, gather, mine, farm, build, guard at 8fr each. All
8 directions for everything: at this canvas a whole 8-direction animation
costs 8–16 gens, so direction-cutting saves almost nothing and buys
workers that stand idle when facing the wrong way.

| Item | Likely | Budgeted (2× rule) |
|---|---|---|
| Master pro call ×6 | 150 | 150 |
| Master re-roll reserve | 50 | 100 |
| Rotation ×6 | 12 | 12 |
| Walk (12fr × 8dir) ×6 | 48 | 96 |
| Six 8fr anims × 8dir ×6 chars | 288 | 576 |
| Problem-direction re-rolls (bear precedent) | 30 | 60 |
| **Total** | **≈580** | **≈1,000** |

Against the 37-generation deer: per ANIMATION villagers are cheaper (small
canvas), but the set is 6 characters × 7 poses = 42 animation groups vs
the deer's 2. **~6–10% of the 10,000 budget.**

Economies taken: task/idle anims at 8fr instead of 12 (saves ~290
budgeted; a work-swing loops cleanly at 8 frames — the walk keeps 12).
Economies offered and NOT recommended: 4-direction task anims (saves
~180–360 but diagonal-facing workers would borrow the idle and read as
loafing); 8fr walk (saves ~50–100 on the single most-watched cycle).

## The gates from here

- **Gate A (this document):** sign-off on the six designs + the spend.
- **Gate B:** L1 male master — 8 directions, one animation, shown at
  0.5×/1.5×/3.5× zoom beside a deer and a current villager. Stop.
- **Gate C:** the remaining five as ONE batch, all six side by side at all
  three zooms, tunic recolor applied in two faction colors. Failures
  regenerate and the batch re-shows whole.
