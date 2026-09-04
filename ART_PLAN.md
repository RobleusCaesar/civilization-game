# Clanfire — hand-authored art pipeline

PNG art replaces a building's procedural sprite **by filename alone** — no
manifest, no code change, no registration. Drop a correctly named file into
`assets/buildings/` and the game uses it; delete the file and the procedural
drawing comes back. The old atlas manifest (`assets/manifest.js`) is gone.

Contract test: `node tests/art-pipeline.mjs` — run it after touching
`js/assets.js`, `js/dev.js`, `js/formations.js`, `R.blitBld` / `R.artRect` /
`R.bldSprite`, the fog-of-war ghost lookup or `G.updateVisibility`'s
`S.map.seenB` snapshot, or `UI.iconInto`. Formation-art changes also want
`node tests/land.mjs` (§17) and `node tests/mountain.mjs`.

## The filename convention

```
assets/buildings/{id}-l{level}.png
```

**All lowercase, always.** GitHub Pages is case-sensitive: `Barracks-L1.png`
is a 404 and a silent fallback to procedural art. The dev panel's
"copy filename" button (below) exists so you never type these by hand.

Every valid filename (46 slots):

| id | levels | files |
|---|---|---|
| tc | 3 | `tc-l1.png` `tc-l2.png` `tc-l3.png` *(shipped)* |
| house | 3 | `house-l1.png` `house-l2.png` `house-l3.png` |
| farm | 3 | `farm-l1.png` `farm-l2.png` `farm-l3.png` |
| lodge | 3 | `lodge-l1.png` `lodge-l2.png` `lodge-l3.png` |
| lumber | 3 | `lumber-l1.png` `lumber-l2.png` `lumber-l3.png` |
| quarry | 3 | `quarry-l1.png` `quarry-l2.png` `quarry-l3.png` |
| mine | 3 | `mine-l1.png` `mine-l2.png` `mine-l3.png` |
| tower | 3 | `tower-l1.png` `tower-l2.png` `tower-l3.png` |
| barracks | 3 | `barracks-l1.png` `barracks-l2.png` `barracks-l3.png` |
| range | 3 | `range-l1.png` `range-l2.png` `range-l3.png` |
| stable | 3 | `stable-l1.png` `stable-l2.png` `stable-l3.png` |
| siege | 3 | `siege-l1.png` `siege-l2.png` `siege-l3.png` |
| sapper | 3 | `sapper-l1.png` `sapper-l2.png` `sapper-l3.png` |
| dock | 3 | `dock-l1.png` `dock-l2.png` `dock-l3.png` |
| trade | 3 | `trade-l1.png` `trade-l2.png` `trade-l3.png` |
| warcamp | 1 | `warcamp-l1.png` |

**Not in the `{id}-l{level}.png` convention, on purpose:**
- `wall`, `gate` — they tile from 16-mask atlases; one rectangle cannot be a
  curtain that auto-joins its neighbours.
- `wonder` — its art is per-monument, rolled per run (ten monuments share the
  one `wonder` building id); a single PNG would stamp all ten. It has its
  own per-monument convention instead — see below.
- `raidercamp` — a camp's look belongs to its **people**, not its building id.
  It has its own convention instead — see below.
- A dock PNG overrides **all four shore orientations** with the same image;
  the per-shore procedural faces only serve while no PNG exists.
- A tower PNG covers the **free-standing** Watchtower. A tower bonded into a
  wall line keeps its procedural mural-tower self, because that drawing has to
  match the curtain it joins.

Both factions share each image (the same deal the shipped hall art always
made): banners fly the tribe's dye and the owner pip marks the rival, so the
architecture itself is faction-neutral.

## Raider camps: one PNG per people, not per building id

```
assets/buildings/camp-{tribe}.png
```

A raider camp is owned by neither faction — it is the home of one of the
**five peoples of the wild country** (`CFG.TRIBES`), dealt to each camp when
the map is made and kept for the camp's whole life. One building id
(`raidercamp`) therefore needs **five different looks**, which the
`{id}-l{level}.png` convention has no way to express — so it gets its own,
parallel filename shape instead.

`{tribe}` is a `CFG.TRIBES` key, **derived, never hand-kept** — a tribe added
to `CFG.TRIBES` gets a slot for free, no code change:

| tribe | name | file |
|---|---|---|
| wolf | Wolfskins | `camp-wolf.png` |
| flint | Flintfolk | `camp-flint.png` |
| broken | the Broken | `camp-broken.png` |
| woad | Woadkin | `camp-woad.png` |
| sea | the Sea Folk | `camp-sea.png` |

Same rules as building art in every other respect: all-lowercase filenames,
loaded image-first with the procedural `Sprites.camp[tribe]` look as fallback
(a 404 changes nothing), the same `_cfArt` marker and the same `R.artRect`
anchoring, the same optional sidecar (`camp-{tribe}.json`, same shape), the
same `?v=` cache-buster, and the same `?dev=1` live-preview path — drop a
`camp-wolf.png` on the window and it slots in exactly like a `barracks-l2.png`
would, no picker needed. `Assets.setCampArt` is the install point (the analog
of `setBuildingArt`); it writes straight into `Sprites.camp[tribe]`, which is
the one place `R.bldSprite` and the building panel's icon already read a
live camp's look from — so no other rendering code needed to change for a
dropped PNG to appear on a placed camp. The one place that DID need a change
is the **fog-of-war ghost** (a remembered building, drawn from `S.map.seenB`
after it passes out of sight): that lookup read `Sprites.building`/
`Sprites.buildingA` directly rather than going through `R.bldSprite`, so a
remembered camp always showed the generic fallback look regardless of tribe.
The snapshot written in `G.updateVisibility` now carries `tribe` alongside
`key`/`level`/`owner`, and the fog-ghost lookup in `render.js` special-cases
`raidercamp` the same way `bldSprite` does.

**Shipped (2026-08-29): all five camps are COMPOUND pieces.** Each
`camp-{tribe}.png` is one composed scene — a dominant central structure,
3–4 shorter peripherals from the people's own prop lore, and a ragged
organic stain of trampled earth — authored 192px (the 192 masters live in
`assets/masters/`), shipped at 2× nearest-neighbor (384). The sidecar
(`{"scale": 2, "offsetY": 1}`) renders it 2×2 tiles centered on the 1×1
footprint through the ordinary `artRect` path (operator sized it down from
3×3, day 160 — the compounds crowded their ground); footprint, pathing and
hit-testing are untouched. Only the fire's own tile is T.CAMP — the old
3×3 worn-yard stamp drew the same single-variant patch eight times around
every camp and is gone; loads sweep legacy rings back to grass. `R.drawCampDress` stands its procedural litter
down when the installed camp art declares compound scale (> 1.5), so a
compound is never double-dressed — delete the PNG (or ship one without the
sidecar) and the litter comes back. Recipe that worked: PixelLab pro with
the shipped `tc-l3.png` as a labelled camera reference and the approved
Wolfskins piece as the style reference (plain pixen kept baking isometric
diorama plinths); hard-alpha QC + dither-trim of edge contacts.

### Camp dressing: one PNG per prop, one prop at a time

```
assets/buildings/camp-{tribe}-prop{1..4}.png
```

Each people strews **four props** on the worn yard around its tent
(`Sprites.campPropsFor`, drawn by `R.drawCampDress`). A dropped PNG replaces
**exactly one prop of one people** — the other three keep their procedural
look, so a set can be upgraded file by file. The index is the prop's position
in the people's set:

| tribe | prop1 | prop2 | prop3 | prop4 |
|---|---|---|---|---|
| wolf | wolf-skull pike | pelt on a frame | bone heap | game on a tripod |
| flint | antler totem | fish-drying rack | knapping floor | shell midden |
| broken | prisoner cage | looted crates | torn banner | arms rack |
| woad | two-skull pike | woad-daubed stone | wicker idol | shield + carnyx |
| sea | beached prow | plunder + amphorae | net rack | horned helm |

Each prop is drawn into a **one-tile box** — author square (64 or 128px) on a
transparent ground with the prop's feet at the bottom edge. Same lowercase
rule, same `?v=` cache-buster, same `?dev=1` drag-and-drop preview (the
filename routes itself; the picker lists every prop slot).
`Assets.setCampPropArt(tribe, i, img)` is the install point; unknown tribes
and out-of-range indices are refused. No sidecar — a prop has no footprint to
offset against.

## Wonder art: one PNG per monument, not per building id

```
assets/buildings/wonder-{key}.png
```

`{key}` is a `CFG.WONDERS` key (henge, colossus, moai, pyramid, obelisk,
temple, sphinx, flame, totems, sundial) — **derived, never hand-kept**; an
eleventh monument gets a slot for free. A hit lands in
`Sprites.wonders[key]` (`Assets.setWonderArt`, the analog of `setCampArt`) —
the dictionary `Sprites.useWonder` copies the run's rolled monument out of —
so the build menu, panel, `R.bldSprite`, burn variants, fog ghost and the
scaffold's stage-three reveal all take the image with no call-site changes.
A 404 keeps the procedural drawing. Same lowercase rule, `?v=` cache-buster,
optional sidecar, and `?dev=1` drop path (`wonder-{key}.png` routes itself).
The `_cfArt` marker rides along, so a tall monument (the obelisk) authors a
taller canvas and overhangs upward rather than being squashed into the 3×3.

## Wilderness relic decor: the formation conventions, zero gameplay weight

```
assets/features/relic/relic-{W}x{H}-{key}-{letter}.png
```

One hidden relic per map (js/relics.js — `Relics.DEFS` holds the ten).
Relics are a DECOR category on the formation pipeline's rules: footprint in
the filename, 128 art-px per tile, `?v=` cache-busting, and the same
`?dev=1` paths — a correctly named drop routes itself, and the CONFORM tool
has a `relic decor` target that locks W×H to the relic's own def (the
footprint placement actually measured; art may never disagree with it, and
a mismatched name is refused). The conform preview stands a temporary found
relic at the camera's centre and restores everything on close. The alpha is
a silhouette only — the blocked set is EMPTY, nothing touches passability
or any map array, and a 404 leaves the procedural weathered-stone
placeholder standing. Contract: `tests/relics.mjs`. Ragged organic ground
edge always — never a straight line, never a diamond, never a terrain slab.

**THE CAMERA IS THE CAMPS' CAMERA** (operator-approved on the shipped
pieces, overriding the earlier high-top-down idea): dead-on frontal,
slightly above, screen-aligned orthographic, uprights vertical, standing
on the flat ragged worn-ground stain — a relic reads like a camp compound
that nobody has tended for a thousand years.

**THE RECIPE THAT WORKS** (aqueduct + leviathan shipped this way; use it
for the remaining eight): PixelLab `create_image_pro`, one call per relic
(~20 generations each), canvas `W*64 × H*64` (the camp density; 2× NN to
the shipped `W*128`), with TWO labelled references —
`https://clanfire.online/assets/buildings/tc-l3.png` for "camera angle
and lighting only", and the approved wolf camp master
(`assets/masters/camp-wolf-192.png` via raw.githubusercontent) for "art
style, palette, outline weight, shading and the flat ragged ground-stain
treatment". Prompt must still spell out: flat ragged stain like a decal,
NO platform/slab/plinth/diamond/isometric, verticals vertical, empty
margins on all four sides. QC: zero semi-alpha pixels, zero edge
contacts (dither-trim strays), then 2× nearest-neighbor and install.
DO NOT use pixen or pixflux for this category: pixen bakes isometric
diorama slabs on ruins (three straight failures), and pixflux's
transparent mode deletes semi-alpha ground fades. Hand-authored
procedural masters were tried and rejected by the operator — generate,
don't draw. 192 masters in `assets/masters/relic-{key}-256.png`.

## The gathering stations (lumber / quarry / lodge, L1–L3 — SHIPPED)

Nine pieces on the camps recipe above (64×72 canvas, 16 candidates/call,
tc-l3 camera ref + wolf-camp style ref, finish = alpha snap → border trim
→ 2× NN → 128×144). Masters in `assets/masters/station-{key}-l{n}.png`.
The composition rule that makes them work as WORKER PLOTS: the structure
sits at the BACK and sides of the stain, the front-center of the yard
stays open trampled ground — that is where the crew stands, so the art
must read complete when empty and stay readable behind two villagers.

Three traps this batch found, all prompt-level or rescue-level:

- **"where a worker will stand" BAKES A WORKER.** Pro read the phrase as
  set dressing and drew a villager front-center in most candidates (all
  16, for quarry-l3). The refire clause that cleared it completely:
  "COMPLETELY UNMANNED — no people, no figures, nobody anywhere", placed
  EARLY in the prompt. Describe the open ground without mentioning who
  will use it.
- **THE ROLLED SHEET.** Two lumber/quarry batches came back with every
  64×72 crop containing the bottom of one scene and the top of the next:
  the model drew its 4×4 candidate sheet at a ~55px scene pitch and the
  API sliced at 72. The candidates are NOT garbage — the crops are
  contiguous column slices, so stitch each column (c_i, c_i+4, c_i+8,
  c_i+12) into 64×288, segment on fully-transparent rows (≥2-row gaps),
  drop segments touching the column ends, and re-anchor each complete
  scene bottom-center on a fresh 64×72. Both rescues yielded 12–16 whole
  scenes for zero extra generations.
- **THE FULL-BLEED WALL.** "A taller cut rock face at the BACK" made pro
  paint the rock face to all four canvas edges as a backdrop (whole
  batch unusable, transparent-background flag ignored). The language
  that fixed it: "a SMALL isolated outcrop … NOT a wall, NOT a backdrop,
  nothing touches any canvas edge", plus extending the style ref's usage
  note with "and how the scene floats isolated on transparency".

## Reference doctrine: designated masters, never chains

Two rules govern EVERY PixelLab reference, for every asset class, and
they exist because each closes a real failure mode:

**1. ANCHOR EVERY GENERATION IN A SERIES TO THE SAME DESIGNATED STYLE
MASTER. NEVER CHAIN.** Chaining (A is approved, so B references A; B is
approved, so C references B…) compounds drift silently — each hop copies
the last piece's small deviations plus its own, and nobody notices until
piece eight no longer matches piece one. The designated master is a
FIXED file, named here per asset class; every piece in the class
references that file directly, and approval of a new piece never
promotes it to master. The masters:

| Asset class                     | Style master (fixed)                   |
| ------------------------------- | -------------------------------------- |
| Buildings / camps / relics      | `assets/masters/camp-wolf-192.png`     |
| Animals (and later characters)  | `assets/masters/animal-deer-60.png` (the native-density stag — FROZEN; doubles as the character-class camera master). The earlier 96px master was RETIRED, not referenced: it carried the flaws this one fixes (mid-brown body barely separated from grass, bone-white 1px antler filigree that aliased into specks). Retire and replace, never chain off a piece you are correcting. |
| The bear (its own strips only)  | `assets/masters/animal-bear-84.png` — the bear's OWN identity master (84×89 content on a 96 canvas, feet at y=91), itself anchored to the stag at generation time. Referenced only for bear poses; every OTHER animal still anchors to the stag. Lesson recorded: pro `reference_images` pull IDENTITY (a 16-candidate batch labelled "style master" came back all deer) — anchor a NEW species with `style_image_url` + `style_copy: [outline, detail, shading]` (never color_palette: each species keeps its own hue), and size the canvas so the model's natural ~75% subject ratio lands the content where you need it, because "fill the frame" prompting does nothing. And THE CANVAS IS THE SIZE CONTROL for v3 rotation too: the rotation redraws at its own preferred fill of the reference CANVAS and ignores how small the content sits inside it (a 76px guide on a 96 canvas came back 90 wide with clipped edges) — a shrink-guide must be a SMALLER FILE (`animal-bear-ref84c.png`, 84×84), exactly why the wolf's ref54 was a 54px file. |

**2. THE CAMERA REFERENCE MUST BE CLASS-MATCHED.**
`https://clanfire.online/assets/buildings/tc-l3.png` is the camera
master for BUILDINGS AND OTHER GROUNDED OBJECTS only — it teaches the
frontal orthographic building projection AND the no-ground-plate rule
for things that stand still. Characters and animals move across the
terrain: they take a CHARACTER-CLASS camera master (the animal style
master doubles as it once approved), and NEVER a building — a building
reference drags in grounded-object framing (baseline weight, plate
logic, static lighting) that a walking sprite must not have. Character
sprites also get NO ground stain of any kind: no decal, no plate, no
shadow baked into the art — the renderer draws the contact shadow.

## Character-class sprites: native density, and what generation really costs

**EVERY ANIMAL SHIPS ON A 64×64 FRAME — so REQUEST ~60px, not 64.** Units are
drawn into a `CFG.TILE` (32px) box, and the whole procedural cast authors at
64: an exact **2:1 integer downscale**, 2 art-px per world-px. 64 is the
*window*, not the ask — the composer crops content into it and hard-errors if
the art does not fit, so generate at ~56–60px and let it seat with a little
air. (Asking for 64 outright risks content that overflows the window and
stops the build.) The first deer shipped at 104px (3.25:1)
and the nearest-neighbour pass threw away ~69% of it: 1px antler tines and
legs sampled in and out as the camera moved, which reads as shimmer. Worse,
at default zoom (`cam.z` 1.5, dpr capped at 2) the game UPSCALES everything
~1.5× — a 104px sprite was the only thing on screen being squeezed down.
`tools/compose-unit-strips.ps1` enforces the window and REFUSES to rescale;
content that does not fit is a regeneration, never a resample.

A bigger animal is a draw-box question, not a canvas question: a 96px sheet
into a 48px box is also exact 2:1. The per-kind draw scale is BUILT
(`Assets.UNIT_BOX` → `R.unitBox`; boxes are bottom-aligned where the 32px
box has always ended so feet never move, and the shadow, health bar, and
death fall all ride the kind's box). The bear ships on it, operator-approved:
96px window (`compose-unit-strips.ps1 -Target 96`) into a 48px box.

**THE WINDOW IS GROUND-ANCHORED, AND A STRIKE MAY FOLLOW THROUGH BELOW
IT** (learned on the bear's fight sheet): the composer anchors each
direction's window bottom on the STANDING poses' feet (walk+idle union),
not on the union of everything — a strike pose legitimately lands 2-5px
below the animal's own feet, and anchoring on that floated the walking
bear above its shadow. Sub-ground strike pixels crop at the ground line
(where the slam lands anyway); width and top overflow stay hard errors.
And FIGHT WIDTH is the pose that blows the window: a natural swipe
swings the paw far outside the standing silhouette (south came back
112px in a 96 window). The wording that converged: "strikes straight
DOWNWARD with one front paw held close in front of its chest, elbows
tucked, never swinging out sideways" — and for away-facing views where
a rear-up reads poorly anyway, a grounded head-lunge strike ("does NOT
rear up, the back stays level") holds both axes. Expect two or three
re-rolls per problem direction; they cost 2 generations each.

**HORIZONTAL QUADRUPEDS ROTATE FROM A 54px REFERENCE, NOT 60.** Measured,
twice: the wolf's walk union came out 67px wide and the boar's 68 from a
60px character — v3 animations stride a long-bodied animal ~13% wider than
its standing master, and the composer's fit check refuses both. The tall
deer fit at 60 only because its axis is vertical (57×60). And the shrink
CANNOT be asked for via `size`: **v3 ignores the size parameter when given
a reference URL** and locks the character to the reference image's own
dimensions (size 54 requested → 60×60 characters and 84px canvases came
back). The working mechanism: keep the frozen 60px master as the style
document, and rotate from a `animal-{kind}-ref54.png` — a high-quality
downscale used ONLY as a generative guide for v3's redraw; no shipped
pixel is ever resampled.

**POSES REGISTER BY FEET, AND THE WINDOW CROPS TOOL EXTREMES, NEVER THE
BODY** (the villager sprint's two composition lessons). v3 batches have
no cross-group registration: a re-rolled pose can sit shifted on its
canvas, blowing the shared per-direction window and teleporting the body
on pose change — `register-poses` (scratchpad) aligns every pose's
frame-0 feet centroid to its direction's walk before composing. And a
swung tool is the thing that overflows windows: expect a handful of
per-direction re-rolls per character (1 gen each; the wording ladder
that converges — "compact, elbows tucked, never swinging out" → "held
vertical against the chest" → "stubby tool, tip never passes the
elbows"), and the composer tolerates ≤2px of a tool TIP cropped at the
window top for action poses, symmetric with the below-ground strike
crop; standing poses still hard-error in both axes.

**CHARACTER ART CARRIES NO SHADOW.** The procedural cast bakes a contact
shadow into every frame; sheet units get one from the renderer instead
(`R.sheetUnit` gates `R.drawUnitShadow` — the gate exists so the existing
cast never gets a second shadow under its first).

**TOOLS ARE CARRIED AT THE CHEST, AND WORKERS FACE THE PLAYER** (the
operator's field report on the shipped set — the wood axe hung beside
the legs, and a villager who walked north to its tile worked
back-to-camera for the whole task). Two fixes, one per layer:

- *Generation:* the gather wording that converged — "the axe rises just
  above the shoulder and chops straight down in front of the chest,
  stopping at waist height, the axe head never below the waist, elbows
  tucked". "Never dropping below the waist" alone did NOT hold (half the
  cycle still dipped to the knees); the shoulder-to-chest arc plus the
  stubby-tool clause is the rung that works. Use it for every future
  hand-tool action pose.
- *Render:* `R.sheetFrames` turns the three away facings to the nearest
  front-or-profile while a WORK pose plays (n→s, ne→e, nw→w —
  `R.WORK_TURN`/`R.AWAY_TO_FRONT`); the displacement facing is untouched
  and returns the moment the unit walks, and combat/walk keep their
  honest facing. Pinned in tests/villager-tiers.mjs
  (`workersTurnToFaceThePlayer`).

**THE TOOL MUST BE NAMED, AND THE TOOL ZOO BANNED BY NAME** (the
woodcutting rebuild, operator round 3): "a small crude stone hand-axe"
let the generator draw a PLUNGER on the l3 woman, a red mallet and a
pickaxe on the l3 man, and unidentifiable blobs elsewhere — and a
worker whose "axe" looks like a mallet is indistinguishable from the
honest build pose (repair, station upgrade), which is exactly what the
operator reported as a bug. The gather spec that ships: 12 frames, a
full arc named phase by phase ("low carry at the thigh, up across the
chest, wind-up with the blade just above the shoulder, strike at knee
height straight out in front"), the tool described positively ("a wide
flat pale stone wedge blade on a short brown wooden haft") AND the
alternatives banned by name ("never a mallet, hammer, pickaxe, sickle
or club"). Expect the full arc to blow the 64px window sideways on
~1-2 directions per character (65-70px measured) — the compact fallback
rung ("stubby... never reaching further forward than the knees", then
"tool head never passing beyond the elbows") recovers each for 1 gen.

**AUDIT THE STAGED FRAMES BEFORE THE FIRST COMPOSE** (the archer line's
efficiency lesson — the operator's standing order is to bank every
PixelLab win): compose failures surface ONE direction at a time in hash
order, so iterating compose→fail→re-roll→compose costs a full cycle per
offender. Instead, after staging run `span-report` (width) and
`top-report` (ground-anchored top overflow) across ALL 8 directions
FIRST, and fire every needed re-roll as ONE wave. Keep the helper
scripts' pose lists complete — span-report silently omitted 'fight' and
mis-blamed a width failure. BOW-CLASS LADDERS (archers, and any future
tall-weapon kind): raised-tip TOP overflow (~1/char, ne/n quadrant) —
"the bow tips NEVER rising above the top of his head", then "held
nearly horizontal, level between shoulder and waist" for a stubborn ne;
extended-draw WIDTH overflow (~1-2 dirs/char) — the proven
"elbows tucked to the ribs, the bow limbs never reaching far from the
torso" rung. COST TEMPLATE for a 3-pose military character (idle 8fr /
walk 12fr / fight 12fr, all 8 dirs): 25 master + 1 rotation + 24 anims
+ ~1.3 re-rolls ≈ 51 gens — the archer trio landed at ~152 total
against the villager program's ~148 PER character.

**ARMOR AND ARMS: PROMPT LANGUAGE THAT FAILED, AND WHAT WON** (the
barracks program — operator's standing order, bank every fight):
"muscled bronze cuirass" reads as BARE MUSCLED SKIN (a shirtless
bodybuilder in a kilt, two 25-gen batches lost to it); "blazon
stripes/bars in [the key blues]" can flood the WHOLE shield face blue —
which turned out to be a WIN, kept deliberately: a key-blue shield face
dyes whole per faction (the rival champion carries a red shield), the
strongest friend/foe read on the roster. Heroic-age bare-torso +
crested helm + greaves + faction shield IS a legitimate premier-soldier
read at 32px — the identity carriers are helm/crest/shield/sword, not
a chest plate. Melee fight-cycle ladders (all one-gen recoveries):
spear thrust width — "gripped at mid-shaft, the tip never further than
one arm's length"; sword/axe top — "the blade tip never rising above
the crest/cap"; the tool-VISIBILITY clause that fixed the mine pose —
"the [tool] head always plainly VISIBLE in front of the torso in every
single frame, never hidden behind the body" (absent-tool profiles and
behind-the-back carries are the same failure family as the mallet).

**THE SAPPER LINE'S THREE LESSONS** (cheapest program yet, ~44
gens/character): (1) A THIN TOOL DIES IN A NARROW ROTATION REF — the
L1 sapper's shovel haft faded out of its 27px-wide ref and two
rotations came back empty-handed; the recovery that WORKED was
re-describing the tool in every animation's action text ("the shovel
plainly present in every frame"), which restored it consistently
across all directions — cheaper than re-rolling rotations. (2) CRAFT
POSES CAN EACH FIT THE WINDOW AND STILL BREAK IT TOGETHER: feet-anchor
registration leaves each pose's tool leaning its own way, and the
per-direction UNION exceeds 64 even when every pose alone fits —
compute the union across ALL poses per direction before the first
compose (the span audit must list every pose the character ships).
(3) WORK POSES WHOSE STANDS ARE 4-EDGE ONLY ship the four cardinals —
the sim's stand-tile rule makes the diagonal facings unreachable, and
the anim bill halves.

**PIXELLAB OPS TRAPS (all hit in one session):** (1) the server DEDUPES
an animate_character call with an identical action_description — a
re-fire after a silent truncation returns "already queued or complete"
and renders nothing; VARY THE WORDING to force a real re-render. (2)
5-direction groups can silently truncate (arrive with 1-3 dirs at the
wrong frame count) — count frames in the bundle, never trust the job
list. (3) a character's `/download` bundle can serve a STALE zip while
the character itself already holds the frames — `get_character` lists
per-direction frame URLs (`animations/{animId}/{dir}/{n}.png`); download
those and inject them into a local bundle copy (finish-villager.ps1
`-LocalBundle`). (4) when duplicate animation names collide, the bundle
disambiguates folders as `{name}-{groupid8}` — which no longer matches
the `_{pose}[0-9]$` override regex; rename inside the local bundle.
(5) job slots cap at 20 across the account — two 8-direction groups fill
16, and the third call errors with "need 8 slots"; queue two groups,
wait, queue the rest. (6) v3 animation cost scales with canvas AREA:
1 gen/dir at 64px but 2 gens/dir at 96px — budget the 48-box kinds at
double.

**THE DOCK LINE: BOATS ROTATE LIKE CHARACTERS, AND THE SEA HAS ITS OWN
RULES** (first vehicle program, ~140 gens for four hulls):

- **v3 `create_character` rotation WORKS on a non-humanoid vehicle** —
  no skeleton assumption bit. The contract: a TRUE bow-on, south-facing
  reference plus "the hull pointing straight in the facing direction"
  in the description; all 8 views came back consistent on the first
  try. A double-ended hull (faering, knarr) is a free win: its e/w
  profiles cannot read as sailing backwards. `create_8_direction_object`
  was never needed.
- **Getting the bow-on ref**: `create_image_pro` RESPECTS "bow pointing
  south toward the viewer" (12/16 candidates complied); pixen drifts to
  a 3/4 SW beauty shot no matter what `direction` says. But a 1-gen
  `edit_image_pixen` "redraw the same ship seen bow-on, pointing
  straight south toward the viewer" CONVERTS a 3/4 master faithfully —
  cheaper than re-generating when the design is already right.
- **The model believes ships sail.** A furled-sail reference fights the
  prior: the rotator kept s/n furled (pinned by the ref) and sprouted a
  half-set sail on every diagonal — a sail that pops in and out as the
  hull turns. Either set the sail IN the ref (1-gen edit, then
  re-rotate) or accept the pop. The ref pins south; the description
  steers the other seven.
- **No water in the sprite.** Pro + "transparent background, no water
  around the hull" ships a clean hull; pixen ALWAYS bakes a water pool
  (asked for a thin foam ring, painted a lake) — strip it with a 1-gen
  edit: "remove the pool of blue water around the ship entirely... end
  the hull cleanly at its dark waterline." The dark waterline row is
  what seats the boat on the game's water — naval kinds skip
  `drawUnitShadow` (a ground ellipse under a hull reads as a sandbar),
  and on screen the hulls sit convincingly with no shadow at all.
- **A pixen edit does ONE thing.** "Furl the sail AND mount a cannon"
  landed only the cannon; the sail edit had to be its own call. Write
  single-instruction edits.
- **Idle is derived, never generated**: a boat's at-anchor bob is walk
  frame 0 plus the same frame lifted ONE pixel (shift UP, so the
  ground-anchor union never moves) — `finish-boat.ps1` builds it at
  stage time, $0. Boats also skip the idle dwell-warp in the renderer
  (a bob that plateaus reads as running aground) — R.unitSprite gates
  on Units.isNaval.
- **The registries split by DYE, not by job**: fishboat/transport/
  fireship ship UNDYED in UNIT_ART (one neutral sheet serves every
  owner — the Sea Folk's 'R' longboats ARE the transport, accepted and
  flagged); the bombard alone is faction-dyed in MILITARY_ART, and
  `unitArtKey` guards non-P/A owners from tunicOf's blue default
  (tests/naval-art.mjs pins all of it).

**THE SIEGE LINE'S FOUR LESSONS** (engines are boats that fight —
same rotate-a-vehicle pipeline, ~135 gens for four engines):

- **An 84-canvas pro batch can come back as a captioned VARIATIONS
  SHEET**: every candidate arrived labeled ("Standard", "No Crew",
  "Viewed from Behind") with the caption TEXT BAKED under the sprite —
  find the row-occupancy gap and clip the caption band before using
  any candidate. Unasked-for; assume it can happen to any pro batch.
- **A machine whose identity is its PROFILE dies bow-on.** Two edit
  attempts turned the trebuchet into a lifeguard chair — beam,
  counterweight and crew all gone; foreshortening has nowhere to put
  them. The rotate-from-3/4 path WORKS instead: feed the 3/4 master
  as the south ref with "pointing straight in the facing direction"
  and v3 normalizes the octants itself — no slot skew. Squat engines
  (catapult, ballista, tower) still convert bow-on fine.
- **A blurry ref ships a blurry SOUTH.** make-ref's bicubic UPSCALE
  (67px content stretched to 84) left the pinned s frame soft while
  the other seven re-rendered crisp, plus white rope streaks and a
  drifted red pennant. Fix at the master, not the rotation: a 1-gen
  pixen edit re-renders at a larger OUTPUT size crisp ("redraw the
  same X crisp and clean, filling the frame") and can fix pennant
  color and artifacts in the same pass.
- **Pennant dye is per-kind calibration**: the standard banner gate
  (B>R+40, B>G+25) missed the ballista's near-black navy (3,7,22) —
  snap-banner takes -DR/-DG overrides; loosen ONLY after a histogram
  proves nothing else in that kind's art leans blue. Engines ship NO
  idle sheets (a stopped machine holds walk f0 via the
  stationary-borrow rule) — delete the derived idle strips before
  install, and their fight ladders are the tool ladders: "the stone
  gone instantly and never drawn in the air" cures width blowouts
  (a drawn projectile IS the overflow), "nothing rising taller than
  the standing engine" cures walk-bounce top overflow.

**THE STABLE LINE: CAVALRY IS JUST A TALL CHARACTER** (~118 gens for
three mounted characters, ZERO window re-rolls — the cheapest military
line yet): horse-and-rider rotates from a bow-on ref54 exactly like a
footman (horses have a real frontal read — unlike a beam-machine, the
foreshortened view keeps head/chest/legs). Pixen draws cavalry
side-view no matter what `direction` says; the 1-gen "seen from the
front, facing straight south, the horse's head and chest nearest the
camera" edit converts faithfully. A pro cavalry batch can look
DISMOUNTED at thumbnail scale — all 16 were mounted bow-on at full
size; zoom before re-rolling. The zero-re-roll wording that landed
every anim first try: gallops get "hooves staying under the horse and
never reaching far out", lance/spear thrusts get the proven "gripped
at mid-shaft, the tip never further than one arm's length", mounted
bows get "limbs staying close in front of the chest, elbows tucked",
idles get "within the standing footprint". Cavalry deserves REAL idle
sheets (stamp, tail swish, head toss — 8 gens/char); finish-boat's
derived-idle step now fills only the gap, never clobbers a staged
real idle.

**THE SCALE PASS (operator rulings, twice in one day): READ RELATIVE
SIZE AGAINST THE CAST BEFORE SHIPPING A NEW CLASS.** The 32-box
cavalry shipped technically perfect and read as midgets on ponies
beside their own footmen; the 32-box catapult and ballista read as
toys beside the ships. The rebuild recipe is cheap and keeps the
approved designs: 1-gen pixen re-render of the SAME master at 96
output ("redraw the same X crisp and clean, larger, filling the
frame") → ref84 on 96 → v3 re-rotation → re-anim at 2 gens/dir →
compose Target 96 into the 48 box (~70 gens per kind). Watch the
re-render: it can DROP identity features (the catapult lost pennant
and crew; the ballista flipped to side view) — one corrective edit
each. The projectile ladder held again everywhere: "the bolt gone
instantly and never drawn in the air" fixed both ballista blowouts.
Sizing rule of thumb going forward: anything a person RIDES or
CREWS belongs in the 48 box; only the lone footman-scale kinds and
the swarm-count fishboat stay 32.

**⚠ POWERSHELL PIPELINE KILL (cost a broken install):** `script.ps1 |
Select-Object -First 4` STOPS THE SCRIPT after 4 output lines — the
snap pass silently processed 4 of 16 strips and the copy installed a
mixed raw/snapped set. Never pipe a working script through -First;
capture to a variable and slice that.

## Villager tiers: the recolor law (settled BEFORE the art sprint)

Villager appearance tier derives from the owner's Town Center level
(`Assets.VILLAGER_TIER_BY_TC` — a table, so tiers may lag or lead later),
resolved per (faction, tier, gender) through `R.unitArtKey` → the ONE
sheet resolver. Files are authored NEUTRAL as
`assets/units/unit-villager-l{tier}-{m|f}-{dir}-{pose}.png` and installed
per faction with the tunic recolor baked once at load
(`Assets.loadVillagerArt` → `Assets.recolorTunic`).

**THE MECHANISM IS DESIGNATED PALETTE KEYS** (chosen over a mask layer —
which doubles the file count — and over per-color pre-bakes — 9 tunics
would ×9 it): the tunic in every hand-authored villager frame wears the
blue tunic's EXACT two-color ramp, and at install those two values (and
only those) are swapped to the faction's rolled ramp. Proven lossless
against the procedural cast itself before any art was generated:
recolorTunic(blue procedural sheet → red) is byte-identical to the
procedurally-drawn red sheet (tests/villager-tiers.mjs
`theRecolorIsLossless`).

**THE HARD AUTHORING CONSTRAINT this buys:**
- The tunic region is EXACTLY two flat colors: body `#3f6d99`, accent
  `#2c4e70` (`Assets.TUNIC_KEY`). No third shade, no gradient, no
  anti-aliasing into neighbors — a computed in-between shade will not
  recolor and will read as dirt on every non-blue faction.
- Those two hex values may appear NOWHERE else in the frame — never on
  skin, hair, tools, eyes or shadow. QC must verify exclusivity before
  install (count key pixels, eyeball where they sit).
- The tunic must wear this same ramp IN THE SAME ROLE across all six
  masters (3 tiers × 2 genders) — body as the garment's lit face, accent
  as its shade — or the recolor reads differently per tier.
- Generated art must be POST-PROCESSED to snap near-ramp pixels to the
  exact key values (the pipeline already snaps alpha hard-binary; the
  tunic snap rides the same pass). The composer's hard-binary-alpha
  contract also makes the recolor's canvas round-trip exact.

**THE CONTRAST DOCTRINE (character class — every animal, and the villagers
when their turn comes).** This is the rule that actually made the deer
work, and it is measurable, not taste:

- **The body sits WELL AWAY from the grass floor in value.** The painted
  floor is `#4d7c33`, luminance ~102, and the body's median luminance must
  land clearly off it — normally BELOW (the approved stag reads 24), so the
  animal is one dark mass against green. The first deer failed at 129 — 27
  above grass — and disappeared into the field. The cow is the one
  sanctioned LIGHT exception (operator call): a white coat far above the
  floor separates just as hard, and its unbroken dark outline is what
  holds the shape.
- **ONE HUE PER SPECIES, so the roster reads apart at a glance** (operator
  palette split): deer = russet brown · wolf = grey · boar = deep red ·
  cow = white · bear (the final animal, reserved) = dark brown. Never let
  two species share a hue family.
- **Near-white is rationed to a 1–2px specular on the SINGLE most
  structural element of the species** — antler beams, tusks, horn tips —
  and nowhere else. The failed deer's bone-white antler filigree carried
  five times the body's contrast, so the eye landed on speckle instead of
  a silhouette.
- **Legs minimum 2px with dark feet.** Thinner vanishes in the 2:1
  downscale and the animal floats.
- **A continuous dark outline all the way round — belly and legs
  included.** One closed shape is what reads at 32 world px; the villager
  has always worked because it is one dark mass with one outline.
- **The SILHOUETTE differentiates the species, never colour or detail.**
  Committed splits: deer = high antler crown; wolf = low and long,
  horizontal back, head at shoulder height, brush tail carried low;
  boar = front-heavy wedge, high shoulder hump falling to the rear, no
  visible neck; cow (an aurochs — dark, per the body rule) = tall level
  rectangle, squared muzzle, forward horns; bear = massive round-backed
  dome, high rounded shoulder, broad head carried low and forward, small
  round ears, no visible tail — read apart from the boar by sheer mass
  and the rounded (not wedge-shaped) back. Judge every new species as a
  black shape first.

**v3 BILLS ON THE PADDED CANVAS, NOT THE SIZE YOU ASK FOR.** `create_character`
returns a canvas ~40% larger than the requested size to leave animation room,
and `animate_character` charges `ceil(canvas² × frames / 65536)` per direction
against THAT number. The deer was quoted 2/direction from its requested 96 and
actually billed 4/direction from the padded 132 — **quoted costs run about 2×
low**. Estimate with the padded figure: `ceil((size × 1.4)² × frames / 65536)`.

## The anchoring rule (one rule, no per-building tuning)

Every PNG is drawn the same way (`R.blitBld` → `R.artRect`):

- **bottom-center** anchored on the building's footprint,
- scaled to **footprint width**, aspect ratio preserved,
- extra height **overhangs upward** — a tall roof rises above the tile.

A square image therefore fills its footprint exactly. Author art with the
building's *feet* at the image's bottom edge and the width matched to the
footprint; make the canvas taller when the silhouette needs headroom.
Supersampled masters (e.g. 256×256 for a 2×2 building) are correct and
encouraged — the renderer resamples from the master at every zoom.

The same rule follows the sprite everywhere it appears: burn/ruin variants,
fog ghosts, and the build menu icon (fit-within, feet on the floor).

## Optional sidecar (per-asset override)

```
assets/buildings/{id}-l{level}.json      ← beside the PNG, same name
{ "offsetX": 0, "offsetY": 0, "scale": 1 }
```

- `offsetX` / `offsetY` — fractions of the footprint (+x right, +y down);
  `0.1` shifts the art 10% of the footprint.
- `scale` — multiplier on the footprint-width fit.
- The file is **never required**; missing file = all defaults. It is only
  fetched for a PNG that actually loaded.

## Cache-busting

Every art URL carries `?v=` from `CFG.ART_V` (js/config.js). **Bump `ART_V`
when you re-upload a changed PNG under the same name**, or the Pages CDN keeps
serving the stale copy. Brand-new filenames don't need a bump.

## The `?dev=1` preview workflow

Open the normal site with `?dev=1` (e.g. `…/index.html?dev=1`). Without the
flag there is zero dev UI and zero behavior change.

1. **Drag PNGs anywhere onto the game window** — one or many at once. A file
   named to the convention takes its slot silently (case is normalized); any
   other name opens a picker listing every valid slot. Nothing is guessed,
   nothing silently overwritten.
2. Every matching building on the map redraws with the drop on the next
   frame, through the **same** anchoring path that ships — the preview is
   what you get.
3. The **ART DEV panel** (top-left) lists the overridden slots, with
   per-slot *revert* and *revert all* (back to the shipped state — the
   shipped PNG if one exists, else procedural).
4. **copy filename** — pick a slot, copy its canonical lowercase filename,
   and rename your file to it *before* committing, so a typo can never cause
   a silent procedural fallback.

Nothing uploads, nothing writes to disk, nothing commits: drops live in the
tab as in-memory object URLs and are gone on refresh.

## Shipping an asset

1. Preview it with `?dev=1` until it sits right (use the sidecar for nudges).
2. Rename the file with the panel's *copy filename* button.
3. Drop it into `assets/buildings/`, commit, push. That's the whole pipeline.
4. Re-uploading a *changed* file under the same name? Bump `CFG.ART_V`.

## Standalone props

Composited props that are not a building's own rectangle load from fixed
paths listed in `Assets.PROPS` (currently one: the hall's dooryard campfire,
`assets/misc/campfire-tc.png` → `misc/campfireTc`). Adding a prop key is a
one-line entry there — still no manifest.

## Origin Card icons: one PNG per motif

```
assets/icons/origins/{motif}.png       128×128, true alpha
```

`{motif}` is a `Cards.DEFS` motif key (hearth, spears, rider, … — 26 today),
**derived from the card table, never hand-kept** — a new card gets a slot for
free. A hit installs into the `ui/card/<cardKey>` slot of every card wearing
that motif, which is exactly what `Cards.drawMotif` already prefers over the
procedural 64-grid drawing — so the draft screen and the rival reveal take the
image with zero code at the call sites, and a 404 keeps the procedural motif.
Same lowercase rule, same `?v=` cache-buster (bump `ART_V` on a re-upload
under the same name).

Authoring rules (these are ICONS, not buildings): flat frontal view, zero
perspective, no ground plane or cast shadow, one bold centered silhouette
(max ~3 elements), nothing touching the canvas edges, hard-edged shading with
3–5 tones per material, thin dark outline, the low-saturation earthy palette
(pale timber, thatch gold, fieldstone grey, dark chocolate), and it must read
at the 64px the card shows it at. Hard alpha only — no anti-aliased fringe,
or it halos on the card's wood panel.

The shown size stays the CSS size; `drawMotif` adopts the image's NATIVE size
as the canvas backing store (128 ≥ any shown-size × devicePixelRatio in play),
so icons stay crisp on a 3× phone and the 96px rival-reveal canvas never
nearest-neighbor-crushes a 128px source. Cards draw ONCE into DOM canvases,
so a late-decoding icon repaints any dealt card through the `_cfCardKey`
stamp (`Assets.setOriginArt` walks them). Contract: the 1d section of
`tests/art-pipeline.mjs`, plus a node-side completeness check that every
motif named in js/cards.js ships a well-formed 128×128 true-alpha PNG.

A contact sheet of the whole set lives at
`assets/review/origin-icons-sheet.png` (untracked — `assets/review/` is the
local review harness).

## Guide page icons

```
assets/ui/guide/{key}.png              128×128, true alpha
```

One per Guide swipe page (`#howPanels` in index.html — campfire, hall,
gather, wheat, cards, wolf, arms, horn, tower, ship, banner, laurel today).
Referenced by plain `<img>` tags, shown at 96px with `image-rendering:
pixelated` — no loader, no manifest; a new page is an `<img>` + a PNG.
Authored to the SAME rules as the Origin Card icons above (flat frontal,
centered single silhouette, hard alpha, thin dark outline, the earthy
palette) — PixelLab pixen, `no_background: true`, one generation each.

## Win / loss screen art

`assets/endgame/{win|loss}/{calm|moderate|hard}/{n}.png` — full details and
what to author in `assets/endgame/README.md`. One bucket per (outcome,
difficulty) pair, six total; drop as many numbered PNGs (`1.png`, `2.png`, …
up to `Assets.ENDGAME_MAX`) into a bucket as you like and one is picked at
random each time that screen shows (`js/defeatart.js` / `js/victoryart.js`).
Probes cascade like ground art — `1.png` first, `2.png` only once `1.png`
hit. Difficulty is derived from `CFG.MODES`, never hand-kept.

The built-in painted scene for each of the six buckets is also just ONE
fixed look now (no landform, no time-of-day roll, no random scene pick) — a
supplied picture replaces it outright; an empty bucket leaves it standing.

**Not wired into the `?dev=1` live-preview panel** — that panel only lists
the `{id}-l{level}.png` / `camp-{tribe}.png` building slots. Preview an
endgame picture by dropping the file into `assets/endgame/…/` and reloading.

## Formation art: multi-tile pieces over terrain REGIONS

```
assets/terrain/formations/{terrain}/{terrain}-{W}x{H}-{shape}-{letter}.png
e.g.  assets/terrain/formations/mountain/mountain-4x3-ridge-a.png
```

The per-tile override below scales ONE texture to ONE tile — the wrong
primitive for a landform spanning 6×5 tiles. Formation art is the right one:
contiguous same-terrain regions are flooded (the shoreline tracer's own
flood), and hand-drawn PIECES are packed over each region by a deterministic
solver. Generic over terrain — mountains are the first consumer; forest, ore
and future terrain can join by shipping a catalog. `js/formations.js` owns
regions, the solver and drawing; `js/assets.js` owns loading.

**The filename carries the truth.** All lowercase. `{W}x{H}` is the ground
footprint in tiles. Image width MUST equal `W × 128` (`Assets.FORMATION_PX`;
a lying width is refused with a console warning — it would claim the wrong
ground). Image height MAY exceed `H × 128`: the excess is upward overhang —
peaks rising north of the footprint — and the bottom edge is the baseline.
`{shape}` is a free word (`ridge`, `peak`, `crag`, …); `skirt`/`talus`/
`scree`/`taper`/`edge` mark EDGE pieces the solver prefers at a region's
boundary so a massif tapers into the grass. `{letter}` separates variants.
Optional sidecar `{same-name}.json` beside the PNG — `offsetX`/`offsetY`
(footprint fractions) and `scale`, the building sidecar's exact shape.

**Discovery is a known stem list, not a manifest**: `Assets.FORMATION_CATALOG`
lists the stems per terrain (filenames only — footprint, shape and mask are
all derived from the name and the pixels). A 404 is a piece that does not
exist yet, never an error; a partial catalog covers what it can and the
procedural drawing fills the rest. `?v=` cache-buster as everywhere.

**The coverage mask comes from the ALPHA CHANNEL — never hand-authored.** On
decode the bottom `H × 128` band is downsampled to a W×H grid; a cell counts
as covered when its mean alpha coverage exceeds `Assets.FORMATION_MASK_MIN`
(0.35). An L-shaped or tapered massif therefore packs as its real shape, not
its bounding rectangle. (On `file://` the pixels are taint-locked and the
mask degrades to the full rectangle; `?dev=1` drops use object URLs and keep
real masks.)

**Placement is derived, never persisted.** The solver is seeded from
(S.seed, region signature): the same map packs the same pieces on every
reload and across save/load, and nothing about it enters a save file.
Greedy largest-first with a seeded tie-shuffle, no same-variant adjacency
where an alternative fits, skirts at the boundary, 1×1 pieces for leftover
tiles, and a hard attempt bound that fails SOFT to procedural (logged). An
edit re-solves ONLY the region whose signature changed — cached solutions
keep every other region exactly as it was.

**Drawing**: bottom-anchored at the footprint, `128px → one tile`, aspect
preserved, smoothing off, pieces within a region in ascending baseline
order (southern pieces overlap northern ones). Two consumers:

- **generic layer** — each region composes into one canvas, blitted right
  after the terrain cache: above the ground, below bridges/buildings/units,
  and under the fog (regions are read from `seenTerrain`, so an unexplored
  massif places nothing at all). Upward overhang is CAPPED at 1.5 tiles
  here (`FORM.OVERHANG_MAX`), and units always draw over the art.
- **mountains** — pieces feed `R.buildMtnLayer` as row strips instead, so
  formation mountains keep the shipped occlusion (a unit behind a ridge is
  hidden; the strip interleave in the unit pass is untouched). Overhang is
  NOT capped there — strips occlude honestly. Mountains use the 'region'
  fallback policy: a region the solver cannot FULLY cover keeps the whole
  procedural extrusion, because that extrusion is ONE object and cannot mix
  with pieces. (Per-tile terrains default to the 'tile' policy: art covers
  what it can, leftover tiles keep their sprite.)

**Gameplay safety is pinned, not promised**: the system writes to no map
array and flips no rule answer — tests/land.mjs §17 measures map-array
signatures, rule answers and the terrain cache byte-for-byte with
formations on vs off, determinism across reloads, full coverage, no-spill,
the single-region re-solve (<5ms) and 404 tolerance; tests/art-pipeline.mjs
§1e pins the convention, the alpha mask, width validation and the ?dev=1
drop path.

**A NEW terrain joining the system** needs: a directory + stems in
`FORMATION_CATALOG`, and — for terrains whose tile sprite paints the
resource itself (forest canopies, ore boulders) — a floor-only branch in
`R.drawTile` so the baked sprite does not show through the piece's gaps
(mountain already paints floor-only; that is why it consumes formations
cleanly). Watch total canvas memory for large-coverage terrains: each
region holds a bbox-sized canvas.

`?dev=1` is the formation WORKBENCH — the artist's whole loop without a
commit. A convention-named PNG takes its slot silently (and needs NO
catalog entry — preview a brand-new stem before it is listed), by
drag-drop or by the panel's **load PNGs…** button (mobile Safari has no
drag-drop; the button is how you author from a phone). Every drop leaves a
plain-words contract report in the panel — accepted or refused: a width
that does not match the name's footprint is refused and told why; cells of
the footprint under the mask threshold are listed per cell with their
painted percentage ("those tiles will show bare ground under the art").
The **coverage grid** checkbox draws the derived per-cell mask over every
placed piece (green = claimed, red = footprint the alpha did not earn).
**pin** on a formation row force-places that piece onto the LARGEST
mountain region on the current map, solver bypassed — a 5×4 range is
otherwise unviewable on a map of small crags; unpin or revert restores the
solver's own placement. Per-slot revert and revert-all as everywhere.
Dropped pieces re-solve and repaint the affected regions immediately.

**conform raw PNG…** turns art of ANY size and filename into a
contract-true piece, phone-first, no image editor: pick the file, choose
the footprint (W×H, 1–24 each — the target width W×128 and the overhang
implied by the source aspect are shown live), and dial the DENSITY — the
source is nearest-downsampled to N art-pixels per tile and
integer-upscaled back onto the 128px/tile grid, so external fine detail
becomes honest chunky pixels instead of noise at map zoom. N is a divisor
of 128 (8/16/32/64/128; **32 is the game's own density** — one art pixel
per map pixel at base zoom — start there and dial by eye against the
trees and units). A flat corner-colour backdrop can be keyed off
(suggested automatically when the corner is opaque); transparent margins
are trimmed, and the trimmed bottom edge IS the baseline — drawn in gold
on the live preview, which pins the conformed piece on the largest
mountain region and re-runs on every control change, coverage grid
toggleable. Fields for {shape} and {letter} name the export, and
**download PNG** saves `mountain-{W}x{H}-{shape}-{letter}.png` at exactly
W×128 wide, ready to commit. The filename remains the only source of
footprint truth — the tool only produces files that tell it.

## Ground COVER art: the wild grass and its tended cut

    assets/terrain/cover/{terrain}/{slot}.png        (all lowercase)
    e.g.  assets/terrain/cover/grass/wild.png

The per-tile ground art below replaces the FLOOR; cover art replaces what
GROWS on it (`R.grassCover` — the wild sward layer, and the kept verge a
standing building derives around itself). Terrain-generic by convention,
but only `grass` is probed today (`Assets.COVER_CATALOG`).

**Three slots, three separate files**: `wild` (the open meadow's swards),
`kept` (the cropped tended cut inside a building's verge), `accent` (the
rare seed-head overlay, wild ground only). A partial set is fine — supply
`wild` alone and the other looks stay procedural; a 404 is the default
state, never an error.

**A file is a horizontal strip of 32×32 frames, one CLUMP per frame** —
width a multiple of 32, height exactly 32, native density (32 art px per
tile, no exceptions), the clump bottom-anchored in its frame and its ink
**wider than it is tall** (a taller-than-wide frame is dropped at install —
the sapling trap binds art exactly as it binds the procedural sward). The
install measures each frame's opaque box and `R.grassCover` draws it
bottom-anchored on the foot of the procedural sward it replaces — same
jittered anchor, same count, same gates — so **art changes what a sward
looks like and never where it grows**. More frames in one file, or more
files via the `-2`/`-3` cascade, and the picker hashes over all of them.
**Alpha must be HARD BINARY** — the install snaps A<128 → 0, else 255,
because the cover bakes into the terrain cache, whose exact repaint
discipline is built on opaque idempotent restamps. Palette-snap every clump
to the grass ramp before it ships (`reduce_colors` with the ramp as the
palette image) so art never introduces a green the tone field does not
already speak. Bump `CFG.ART_V` when re-uploading under a name a phone has
cached.

**`?dev=1`**: drop a file named `{terrain}-{slot}[-N].png` (e.g.
`grass-wild.png`) and it installs live through `Assets.setCoverArt` — the
shipping path. The CONFORM tool has a `grass cover` target: any-size art is
keyed, trimmed and gridded to a W-frame strip, previewed live on the real
meadow, and downloads under the drop-convention name.

Where the art appears is still the PROCEDURAL layer's decision — the macro
richness field, the clump gate, the taming mask. Supplied art changes what
a sward looks like, never where grass grows; bald ground stays bald.
Contract: `tests/wild-grass.mjs`.

**THE FIRST ART PASS LOST TO THE PROCEDURAL SWARD, blind, at every gate
(2026-09-01, 161 generations).** Recorded so nobody pays for it twice:

- `create_1_direction_object` at ≤42px returns 64 candidates per call — the
  candidate-grid trick works, and the packs were handsome on the sheet
  (wild tussocks with straw and seed heads, tidy kept hedgelets, muted
  bloom clusters). Style images must be ≤42px too, or the pack drops to
  16; a base64 style image over ~500 chars was truncated in transit.
- **A 40px canvas gets FILLED**: every wild clump came back 31–34 wide ×
  31–37 tall — taller than wide, the sapling trap. A "squat, bottom third
  of the frame" prompt fixed the aspect (32×16) but not the size.
- **Scale is the killer, not style.** The procedural sward is 4–9 art px
  wide; the smallest usable authored clump (24px canvas) is 17×17 and a
  squat one is a full tile wide. Drawn at the sward's own count (up to
  seven a tile) the meadow became a carpet of distinct objects — the
  object-count failure the doctrine names — and the straw ones fought the
  berry bushes for the eye. Procedural 8/10 vs art ~5/10 at 1.5.
- Kept hedgelets (18×10, uniform) read as shrubs, not cropped pasture; the
  procedural tidy lattice + lush wash won. Accent art only rides art
  clumps, so it was moot once wild lost.
- If this is ever retried: author at the sward's scale (an 8–12px clump on
  a 16px canvas — the style image must be 16px too), or accept that art
  on this layer is a different feature (a rarer, larger "landmark tussock"
  at decal density, not the sward).
- **Know the seat before you diagnose the sward.** Grey "slabs" beside a
  test house on `refresh-ab` were chased through the cover art and then
  the parched swards for an hour; they were the relic placeholder
  (`S.relic`, `Relics._placeholder` — worked stones half-sunk in old
  ground), because the seed's ruin site sits at (41,9), right where the
  house went. Sample the canvas pixels and match them to a palette ramp
  (`ART.PALETTE.stone` here) before touching any grass code; and check
  `S.relic` when something un-grassy appears near the start.

The engine door stays: `assets/terrain/cover/grass/{wild,kept,accent}.png`
installs exactly as documented, one clump per frame, and a future set
that beats procedural blind ships with a `CFG.ART_V` bump and nothing else.

## Ground art

`assets/terrain/{name}.png`, plus `{name}-2.png`, `-3` … for variants.
`{name}` is the terrain's own name in lowercase, derived from the `T` enum by
`Assets.terrainName` — never a hand-kept list, so a new terrain gets a slot
for free:

    grass  forest  water  hills  fertile  stumps  pebbles  barren
    ruin   mountain  trench  moat  mound  goldore  camp

**One file is enough.** Supply `forest.png` alone and every forest tile wears
it; add `-2`/`-3` and the map picks between them by the same tile hash the
procedural variants use, which is what stops a supplied set reading as
wallpaper. Probing cascades — only the blanket is tried for each terrain at
startup, `-2` only once the blanket loaded — so a bare repo pays 15 requests.

**Any size.** 32, 64, 128; it is scaled to the tile with smoothing off, so a
larger tile just carries more detail than the grid.

**Resource tiles want a TRANSPARENT floor.** forest, hills, fertile, stumps,
pebbles, goldore and mountain are painted OVER the grass floor — draw the
trees/rocks/crop and leave the ground clear. grass, water, ruin, barren,
trench, moat, mound and camp are full-tile.

**Replacing `grass.png` changes the floor under every resource too.** That is
deliberate and the only way the two stay seam-free.

### What the engine adds on top of your tile

Supplied ground is not stamped raw — it receives the same treatment the
procedural ground gets (`tests/land.mjs` pins this, because it is the
regression most likely to slip through):

- the **tonal layer** — broad seeded blotches, quantized to hard steps
- **contextual shade** — under wood, at crags, inland of water
- the **decal scatter** — flat, ground-level things on open grass (tufts,
  clover, flowers, pebbles, twigs, scuffs); ferns and leaf litter only in the
  one-tile undergrowth fringe beside real forest; reeds only by water. Nothing
  with a trunk or a canopy stands in open meadow. Turn the whole layer up or
  down with `LAND.DECAL_DENSITY`, and widen the bare ground between patches
  with `LAND.DECAL_GATE`
- **irregular edge fringes** where your terrain meets another
- **the traced coast** — shelf, foam, beach and rocky shoal where it meets
  water (see below)

So author a FLAT, even tile. Do not bake lighting, blotches or scatter into
it: the engine's layers will land on top and the two will fight. Tunables for
all of it live in the `LAND` block at the top of `js/render.js`.

### The coast is not made of tiles

Worth knowing before you draw a `water.png`, because it is the one layer that
does not follow the grid at all.

The waterline is **traced**, not banded per tile. The engine floods the water
into connected REGIONS, walks each region's boundary into closed polygons
(an outer shore and every island's shore come out separately), smooths them
with Chaikin corner-cutting at a scale **larger than one tile** — which is
what turns a 45° staircase into a sweep — and then displaces the result with
fine world-space noise, which is what stops the sweep reading as a clean
vector arc. Both halves are needed; either alone looks wrong in its own way.

Everything you see at the water's edge is then **offset from that curve**: a
stack of translucent shelf bands reaching into the water, a foam lip, the
beach, and wet dark rock with scattered stones where the land behind it is
hills, mountain or pebbles. So a supplied `water.png` supplies the BODY of
the water; the edge treatment is drawn over it from the curve and is not
something a tile can carry. A supplied land tile is likewise unaffected —
the beach lands on top of whatever you drew.

**The body has depth** (the Water & Shoreline Overhaul, Part 0 — it
replaced LAND_REFRESH Phase 1's four bands, which read as four flat
colours). Inside that curve the water is painted in **fourteen hard steps**
of the `deep` ramp in `js/artstyle.js` — sand showing through at the
waterline, clear turquoise, teal, the body blue, steel, navy, a heart —
from a baked distance-to-land field (a chamfer distance, so its contours
are round). The shore steps are absolute, a quarter tile apart, so even a
pond shows three or four; the deep steps are fitted to each MAP's own
deepest water, never per region, so the heart appears in the largest body
at every map size and a sea does not flatten into one navy. Every step edge
is sampled bilinearly, pushed about by world-space noise and stippled at the
seam, so none can follow the tile grid (ARTSTYLE rule 5 as amended: many
steps and dither, never a gradient). A **shore shadow** — a darker,
dithered band on the water side of every bank — is what makes the banks
read as having height, with an optional lit lip on the sun-facing land
side. A moat is pinned to the shore step so a dug channel meets the lake's
own rim with no seam. `DEPTH_AMP 0` is the old flat body byte for byte. A
supplied `water.png` replaces the whole body, steps included. And the surface LIVES
(1b–1d, frame time, viewport only): the waterline laps — a 1px broken foam
line creeping along the traced shore, drawn as cached 1px points rather
than a dashed stroke, which a software rasterizer pays three times over —
a fish that jumps rises in an arc
and splashes down with the bombard's own ripple ring, and the drifting
sparkle brightens and warms at golden hour. All of it is dials in the
`LAND` block and can be turned to 0.

None of this touches tile DATA. Where a boat may sail, where a dock may
stand and which way it faces, where a villager may fish, what is passable —
all of it still reads the tile grid, so the painted waterline is free to cut
inside a tile without any rule noticing.

**Only NATURAL ground raises a shore, on both sides of the waterline.** Land a
sapper reclaimed out of the sea gets no beach, and a MOAT — a ditch cut with a
spade and then flooded — raises none of its own either. So a channel dug into
a lake reads as one continuous body of water with the lake: same blue end to
end, no rim of sand between them. A supplied `moat.png` therefore never has a
beach drawn against it, and a `water.png` loses its edge treatment along any
stretch where the water on that side is a moat. Both fade in and out along the
curve rather than switching at a tile, so the lake's beach dies away as it
runs into the cut.

Tunables, all in the `LAND` block:

| symptom | dial |
|---|---|
| the coast still steps at 45° | raise `SHORE_SMOOTH` |
| the coast reads as a clean vector arc | raise `SHORE_NOISE` |
| the wobble is too fine / too coarse | `SHORE_NOISE_F` |
| the shallows are milky, or read as rings | `SHELF_ALPHA`, `SHELF_STEPS` |
| the shallows reach too far out | `SHELF_REACH` |
| beaches too wide, or never pinch out | `SAND_MAX`, `SAND_MIN`, `SAND_FREQ` |
| the rocky coast reads as an inked outline | lower `SHOAL_ALPHA` |
| shore stones look like beads on a string | raise `SHOAL_GATE`, lower `SHOAL_FREQ` |
| too many / too few shore stones | `SHOAL_STONES`, `SHOAL_STEP` |
| the shallows look barren on a rocky coast | raise `LIFE_CHANCE` |
| kelp and coral look evenly sprinkled | raise `LIFE_GATE` |
| the water is one flat blue / a lake has no depth | `DEPTH_AMP` (0 = the old flat body, 1 = the full `deep` ramp) |
| a pond shows too few steps / the shore steps are too coarse | lower `DEEP_SHORE_STEP`; `DEEP_SHORE_END` is where the fitted deep steps take over |
| the heart never appears / a sea flattens into one navy | `DEEP_TOP_K` (share of the map's deepest tile the last edge sits at), `DEEP_TOP_MIN` (a map of ponds shows no heart below this) |
| a step edge reads as a ring or a staircase | raise `DEPTH_WANDER`, `DEPTH_DITHER` (keep it under half a shore step); lower `DEPTH_WANDER_F` for a slower wander; `DEPTH_SUB` for finer cells |
| the shallows read as a resort / the ramp is too loud | `DEEP_SAT` (saturation of every step), `DEEP_LIFT` (lightness nudge) — identity at 1 / 0. The ramp itself is muted by construction; these are the pull-backs |
| the depth bands show their seams | `WATER_FADE`: 0 hard steps + stippled seams, 1 the same steps under a full-width ordered dither, 2 a continuous OKLab fade (rule 5's one sanctioned continuous surface — the water body only) |
| a small body runs the wrong share of the ramp | `POND_BAND` (tiles of depth a body needs to keep the full run; shallower bodies compress in proportion) |
| the pale end should be tealer / bluer | `DEEP_ALT` (0 = `deep`, the shipped bluer anchor; 1 = `deepAlt`, the tealer one) |
| **every shoreline shelves at the same rate / a uniform ring at min zoom** | `SLOPE_VAR` (how much the slope varies from coast to coast), `SLOPE_FREQ` (how far a coast keeps its character) — 0 restores the plain distance field |
| the open water wants bars, tongues and pockets | `BAR_AMP`, `BAR_FREQ`; `SLOPE_HOLD` is how far from the waterline both fields fade in |
| a fishing shoal is invisible on the map | `SHOAL_BAR` (tiles of shallowing at a shoal), `SHOAL_BAR_R` (how far the bar reaches) |
| pale rounded patches float in open water | that is the SWELL, not a shoal: raise `SWELL_GATE` so only the crest line catches light, and lower `SWELL_LIFT` / `GLINT_LIFT` (ramp steps, never a colour of their own) |
| open water wants the old tonal blotches back | `WATER_WHISPER` (0 = off under the ramp; they read as smudges over the dark steps) |
| the banks read flat / no sense of height | `SHORE_SHADOW` (the dark band on the water side — OFF by default: it cut the shallows off from the beach), `SHORE_SHADOW_W`, `SHORE_SHADOW_STEPS`, `SHORE_SHADOW_SUN` |
| the sun-facing banks want a catch-light | `SHORE_LIP` (0 = off), `SHORE_LIP_W` |
| the jumping fish is too small / too big | `FISH_SIZE` (whole tiles only, or the pixels go soft), `FISH_RISE`, `FISH_TIME` |
| the waterline does not lap / laps too loud | `FOAM_LINE` (0 off), `FOAM_PULSE`, `FOAM_SPEED`, `FOAM_MINZ` (the zoom it starts at), `FOAM_DOTS` |
| the fish flash instead of jumping | `FISH_TIME` (0 = the old flash), `FISH_RISE` |
| golden hour leaves the water dull | `SPARKLE_GOLD` |
| a decal still reads as an object | raise `DECAL_MUTE` |
| the ground looks busy rather than deep | lower `DECAL_DENSITY`, raise `DECAL_GATE` |
| impassable ground does not announce itself | raise `BLOCK_SHADE` |
| the map looks blotchy | lower `BLOCK_SHADE` |
| the meadow is threadbare / a carpet | `GRASS_DENSITY`, `GRASS_GATE` (the bald share), `GRASS_MAX` |
| the lush valleys do not read as valleys | lower `GRASS_MACRO_F` (bigger patches), raise `GRASS_GATE` |
| the kept verge is not visibly kept | lower `KEPT_DENSITY`; `TAME_R`, `TAME_WOBBLE` for its reach and rag |
| the flatten on build is too quiet / too loud | `TAME_LOUD` (0 silences the debris, 2+ is unmistakable) |
| the kept verge stops at a ring / is not lush enough | `KEPT_SOFT` (tiles of fade), `KEPT_TINT` (the green wash) |
| the wild is not wild enough / reads as scrub | `GRASS_TALL` (the tall splayed share), `GRASS_PARCH` (straw where richness runs dry) |
| every screenshot is the same green | raise `HUE_AMP` (≤ 0.06 — a grade, not a paint job), lower `HUE_FREQ` for bigger patches |
| the hue steps show a ruled seam | raise `HUE_DITHER` |
| flowers do not gather where the sun is | `MEADOW_WARM` (residues of the meadow roll allowed in the warmest step) |
| woods cast no direction | `SUN_BIAS` (0.2 = the 60/40 south-east cast; 0 = radial) |
| bare grass is a flat fill at 1× | `GRAIN_N` (felt-grain dots per tile; 20 ≈ 8%) |

**Tune through the bench, never by blind edits** (`?dev=1` → *land bench…*,
LAND_REFRESH.md Phase 0): every whitelisted `LAND`/`MTN` dial retunes the
live map through `R.rebakeAll` — the same re-derive-and-bake a terrain edit
would owe, debounced — *copy values* exports only what moved as the literal
to paste into the block, *snap A / snap B / A/B flip* compares two viewport
snapshots BLIND (labels shuffled; *reveal* after choosing), *save cam / go*
bookmarks seed + camera so before/after shots are pixel-comparable across
reloads, and *golden hour* holds the dusk cycle's warm peak for the one warm
shot every phase owes. The perf gates in `tests/land.mjs` §18 are what stop a
tuning session from shipping a regression — and *edit ms* runs §18's
terrain-edit measurement on the device in hand (an open-grass patch and a
shore patch, batch-timed), because the gate is baselined on a desktop and
the phone's number is the truth.
| a resource cluster shows tile-shaped patches | raise `BLOCK_FADE`, soften the density taper |
| a tile grid is visible in flat ground | `TONE_SUB` (must stay above 1), `TONE_STEPS` |
| hills read flat | raise `HILL_SHADOW`, `HILL_SHADOW_MAX` |
| a hill starts looking like a mountain | lower the same two |
| a hill's edges read as ruled lines | raise `HILL_SHADOW_WOBBLE` |
| bare grass shows through a rock core | lower `ROCK_STEP`, raise `ROCK_MIN` |
| a rock field reads as a bead curtain | raise `ROCK_JIT` |
| a deposit's edge is a straight line | raise `ROCK_WANDER` (keep it under 0.5) |
| the fringe ends on a wall | lower `ROCK_FRINGE` |
| stone sits on ground you can walk through | lower `ROCK_WANDER`, `ROCK_SCREE` |
| a wood/thicket has a tidy square ring of medium tiles | raise `DENSE_WANDER` |
| a mountain's outline still steps at right angles | raise `FRACTURE_AMP`, lower `SEG_MAX` |
| a mountain throws thin spikes into the grass | lower `FRACTURE_CAP`, `OUT_MAX` |
| a range reads flat | raise `RISE`, `LIGHT`, `MACRO` |
| cliffs read low / timid | raise `LIFT_MAX` (and `PEAK_LIFT`) |
| a thin ridge reads as a ledge | raise `LIFT_MIN` |
| micro-cliffs stack all over the interior | raise `MERGE_GAP` |
| the cliff face reads as hanging cloth | the strata seams own this — see the face paint in `drawMtnRegion` |
| the cast shadow is invisible / too heavy | `SHADOW_A`, `SHADOW_K` |
| snow reads wrong for the setting | `SNOW: 0` |
| ore boulders read small / gravelly | raise `ROCK_MIN`/`ROCK_MAX`, lower `ROCK_STEP` |
| the rock reads as cobblestones or cracked ceramic | see `mtnFacetSites` — this is a geometry bug, not a dial |
| the faces are too big / too small | `FACET_CELL` |
| the creases are too heavy | lower `CREASE_DARK`, `CREASE` |
| a one-tile mountain looks like a shard | `CLS_OUTCROP`, `OUTCROP_*` |

### Readability comes before atmosphere

The one rule that outranks everything else here: **a player must be able to
tell passable ground from impassable resource terrain instantly, without
looking closely.** Resources are the foreground; ground decoration is
background. If art you supply makes that harder, it is wrong however good it
looks on its own.

What the engine does to keep it true:

- The **core of every blocking resource is closed** — 80–99% of the tile is
  covered at the heart of a wood, an ore body or a thicket, tapering out
  through a near-solid perimeter to a thinned fringe. If you supply art for
  forest, hills or fertile, author it dense. (Measured by baking the map
  twice, once with each resource's drawing suppressed, and counting the
  pixels that differ — a colour test cannot do it, because a wood's canopy is
  as green as the grass it stands on.)
- **Blocked ground carries a shared cue** — a darker, dithered patch beneath
  the cluster. It is derived from `Path.blocksLand`, the same predicate
  movement asks, so it can never disagree with the rules. It is drawn under
  your art, not over it.
- **Ground decals are muted toward the grass** at the point of drawing
  (`LAND.DECAL_MUTE`), so nothing on open ground reads as an object.

**Gold ore, spent quarries and felled stands are WALKABLE** and deliberately
carry none of that cue. A gold seam is meant to be unmistakable by being
*gold*, not by pretending to be an obstruction — marking it blocked would be
the exact lie the cue exists to prevent.

### Ore is round, and deliberately not rock

`hills` is an ORE DEPOSIT, and it breaks the "rock is angular" rule the
mountains follow on purpose: at a glance, round-and-lighter is a resource you
cut, sharp-and-dark is a wall you walk around. The deposit is scattered in
WORLD space (no tile sprite; a boulder straddling a boundary is one whole
rock) out of pre-rendered ROUND boulders — the tree canopy's shape language
on stone: clean dark outline, broad lit cap, a straight quarried facet of
fresh pale stone, the odd glint — fewer and larger, because many small chips
is exactly what reads as gravel. The boulders draw in `oreD`, a couple of
shades darker than the original bright ore ramp, so a deposit sits in the
mountain's own tonal family (it lives at the mountain's foot) while the round
silhouette and the facet keep it plainly a find, not a wall. The gold seam
wears the same round language in pale quartz with real gold nuggets and
veins.

Deposits themselves are few and compact — two or three dense knots per map,
seated IN THE CREVASSES of the mountain base first (the grass tile the most
mountain wraps around wins, so a knot conforms to the fold of the rock's own
foot), then at forest edges, then (small) in open grass — so if you are
authoring a map, put the ore where the geology says.

Supplying `assets/terrain/hills.png` **stands the whole scatter down** and
your tile is drawn instead, the same rule grass, water and mountain follow.
Author it dense, and remember it will be the only thing on that tile.

Loose round pebbles in the deposit's own ramp lie on the walkable ground
just outside a deposit. That is deliberate and honest — the spill says "the
ore is over there" in the ore's own language — and it is the only stone
allowed past the boundary, because a boulder standing on ground a unit can
cross is a lie about the map.

### Mountains are objects, not tiles

`mountain` is the second terrain with **no tile sprite** (the first is
`hills`), and for a stronger reason. A mountain is the only terrain with real
HEIGHT, and a top-down tile grid has nowhere to put height — which is why
every earlier attempt at drawing them tile by tile came out as a flat grey
blob however good the individual tile was.

Each contiguous mountain area is ONE OBJECT: its cells are flooded into a
region, its boundary traced into a polygon and fractured off the lattice, its
interior shaded in hard value steps from a distance field that doubles as the
height — and then the whole plateau is EXTRUDED: drawn shifted north, with the
gap down to the true southern boundary filled by a tall vertical cliff face
(striated, rim-lit, occluded at the foot, casting a real shadow on the ground
below). Peaks are taller extrusions at the field's local maxima. Areas draw
according to their SIZE — one or two cells is a boulder outcrop, not a
mountain — and the cliff height is normalized per region, so even a thin
ridge gets a real face.

The art deliberately leaves its tiles, and there are hard rules about how far.
Sideways and southward it stays within a fifth of a tile of the true
footprint; northward it rises by the lift alone. Because the art is tall, it
OCCLUDES: units and buildings behind a ridge are hidden by it (a hidden unit
comes back as a faint silhouette, still selectable), ones in front draw over
it, and the placement grid is re-drawn above the rock so ground truth is
always inspectable. Nothing about this changes the rules: passability,
placement, fishing and dock siting all still read the tile grid.

Supplying `assets/terrain/mountain.png` **stands the whole thing down** and
your tile is drawn instead, the same rule grass, water and hills follow. Be
aware you are giving up the height treatment when you do — a mountain tile is
the one place where a supplied tile is likely to look worse than the generated
mass, not better.

### One thing on the ground that is not what it looks like

**Hills are shaded only at their edges** — a catch-light on the northern rim
and a cast shadow on the ground to the south. Nothing shades a hill's middle,
because on these map scales a hill is one or two tiles deep and there is no
interior to shade; every attempt at one came out as tile-shaped rectangles.
Author a `hills.png` as flat ground with rocks on it and let the edges do the
elevation.

(There used to be a second entry here: decorative streams, thin creeks drawn
over the ground with no gameplay meaning. They were removed — measured at play
zoom only 10.8% of a stream's pixels read as bluer than green, and a version
vivid enough to read as water would have been a promise the tile could not
keep. See CLAUDE.md if the idea comes back.)

Re-uploading a changed file under a name it already had? Bump `CFG.ART_V`.

## Tree pieces: the forest door (single trees composed into tiles)

`assets/terrain/trees/{style}-{size}-{letter}.png` — style ∈ `dome | oak |
conifer | birch | stump | snag | log`, size ∈ `s | l`, letters from `a`,
all lowercase. A 404 ends that style-size run; a partial catalog composes
with procedural trees filling the gaps; an empty catalog leaves the
procedural wood byte-identical. Same `?v=` cache-buster as everything.

WHAT A PIECE IS. One tree at WORLD scale — an `l` piece on a canvas
around 24px (authored 48px at 2 art-px per world-px and box-downscaled by
exactly 2), an `s` piece around 12px — trunk base ON the bottom edge,
centred; hard binary alpha; its own small dark contact shadow baked in
(the composer draws no shadow under authored pieces). Frontal with the
game's slight top-down lean, zero isometric, no ground plate. Every
installed piece also bakes its mirror, so one letter is two stamps.

THE TINT RULE (settled at Part 3): `hueTint` is the ONLY tint that
touches tree pixels at runtime, and it applies to authored pieces exactly
as it does to procedural ones — biome warmth, autumn, whatever ships
later, all of it lands at runtime. Pieces are therefore authored NEUTRAL
green on the documented tree ramp: no pre-baked warm or cool casts, no
autumn variants in the catalog. A piece that ships tinted double-tints.

COMPOSITION. `Sprites.rebuildForest()` re-renders the 28 forest tile
canvases (8 sparse / 8 medium / 8 dense / 4 rare) and the stump tiles
through the same seeds, lattice, jitter and density gradient as the
procedural wood — the catalog changes which trees are stamps, never
where trees stand, so occupancy and the tile grid are untouched (pinned
in tests). The sparse fringe and medium perimeter keep whole trees: an
authored piece that would overhang a contained tile falls back to the
procedural tree at that slot. Tree-fall shears whichever canvas the tile
shows; the whole-tile `forest.png` override outranks composition where
it exists, exactly as before.

### Tree pieces, Gate B additions (the dome-species set)

THE BASELINE IS THE MASTER. `assets/masters/tree-dome-48.png` is the
approved tree; every catalog piece anchors to it directly — variants are
different INDIVIDUALS of that tree (crown lobe arrangement, slight
height-to-width, trunk lean), never a new species and never a chain off
another variant. The `s` tier is the integer 2:1 downscale of the
matching `l` piece (hand-repaired where the downscale loses the crown
specular or trunk base — never regenerated). The `xl` tier is the ELDER:
one broader, older dome (2 variants), reserved for the rare character
tiles alone — `treeXl`, never served through `treePiece`.

THE SPECIES COLLAPSE. While the catalog carries any tree, every tree
slot in the 28 composed tiles and 4 rares draws from the catalog's
species — a kind with no pieces is served dome, and even the
cannot-fit fallback draws a procedural DOME in the slot's own ramp. No
stand mixes art trees with procedural trees of another species. Only an
empty catalog restores the mixed-species procedural wood (which also
remains the A/B baseline).

ACCENTS. `stump-s`, `snag-s`, `log-s` render in the master's language:
the stump tiles and the rare 'stumps' feature take the stump piece per
slot; one hash-chosen ring slot on each rare tile stands a snag when one
exists; the rare 'log' feature takes the log piece. All fall back to
the procedural drawings piece-by-piece.

## THE FOREST STYLE CARD — reuse this for every future land mass

Everything needed to author new vegetation (another biome's trees, an
orchard, scrub for a new continent) in the shipped forest's voice:

- MASTERS. `assets/masters/tree-dome-48.png` is the canopy voice;
  `assets/masters/mountain-peak-256.png` the rock voice. Reference these
  directly in generation (labelled refs) — never a chain off a variant.
- SCALE. Author at 2 art-px per world-px, ship at world scale by integer
  box-downscale. A large tree is ~44px art on a 48 canvas → 22px world;
  small = the large's exact 2:1 downscale (hand-repair lost trunk/specular
  pixels, never regenerate); an elder ~60px art → 30px world.
- SILHOUETTE. Frontal with a slight top-down lean, zero isometric, no
  ground plate; lit crescent upper-left, deep under-shade to the
  south-east; trunk base ON the bottom edge with root flare and a small
  dark contact shadow; hard binary alpha; dark outline.
- COLOUR. Author NEUTRAL on the documented ramps (leaf
  #1d3a17 #2e5c25 #3c6f2d #417a33 #569244; wood/soil for trunks; bone
  for cut faces). The installer's OKLab mute (LAND.TREE_MUTE — lightness
  x(1-0.16k), chroma x(1-0.35k), hue half-way to the leaf-ramp mid at
  full k, then re-quantize to the ramps) does the world-fitting;
  hueTint does the runtime seasons. Ship nothing pre-tinted.
- THE WORLD’S EARTH is one ramp, and drawn art is brought onto it rather
  than authored against it: #1f1812 #312920 #443b2e #584e3e #6d624e (the
  referee’s pick, “deep peat” — OKLab L 0.215-0.50, chroma under 0.033,
  hue 67-81°). Warm pixels in a generated piece are remapped through it BY
  THEIR OWN LIGHTNESS, so the art keeps every shading step it was drawn
  with and only the colour of the earth moves; greys, greens and alpha are
  never touched. Going dark AND saturated at a red hue is what reads as
  chocolate rather than soil, which is why the chroma cap matters more than
  the darkness does.
- COMPOSITION. World-space stamping (forestLayoutAt/forestStampBand):
  continuous density from the enclosure field, y-sorted stamps across
  tile edges, an 8px shoreline setback with green between sand and
  crowns, one tree minimum per resource tile, sparse stands TALL (the
  same trees, fewer) with one young stand in four, small pieces on the
  packed lattice. Layer slot: after the stones, before the decals and
  the hue coat.
  A drawn massif also grows its own wood: R.mtnEdgeTrees scatters stands on
  the open ground around each placed piece's GROUND CONTACT (its foot row
  across the columns it spans, never the tiles its tall body merely
  crosses), and files each stand under the row of the rock it hugs so it
  draws in front of it. Art only — no tile becomes forest and no stand
  claims cover — and it stays out of the region composite, which the
  mountain contract measures as ROCK.
