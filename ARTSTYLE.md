# ARTSTYLE.md — Clanfire Visual Style Guide

> **Binding rule: every sprite, icon, or UI element added or changed in this
> repo MUST be built from `js/artstyle.js` and comply with this document.
> No exceptions. A change that draws with raw hex colors, skips the outline,
> or invents its own lighting does not merge.**

## The look

Elevated 16-bit pixel art, strictly top-down, warm and earthy. Everything is
procedural canvas drawing on a **16×16 logical grid rendered at 2× (32px
tiles)** — no image files, ever. The game must remain a self-contained
offline static site.

## Hard rules

1. **Palette only.** Colors come from `ART.PALETTE.<ramp>[index]` — named
   ramps of 3–5 shades, darkest at index 0. Never write a hex literal in a
   sprite. If a color is missing, extend the palette deliberately (keep it
   ~48 colors) and document why here.
2. **Light is top-left, locked** (`ART.STYLE.LIGHT`). Highlights on top/left
   faces, shade on bottom/right. `shadedRect` / `shadedCircle` encode this —
   compose from them instead of hand-lighting.
3. **Outline everything.** Every entity/building sprite gets a 1px outline in
   the darkest ink shade (never pure black) via `ART.outline(canvas)` at
   build time. Terrain tiles are the exception (they tile seamlessly).
4. **Drop shadows ground everything.** Entities and buildings sit on an
   `ART.dropShadow` contact ellipse.
5. **Ramp transitions dither.** Use `ART.dither` (2×2 checker) between
   adjacent color fields — no unrelated-color hard seams, no gradients.
   *Amended (the Water & Shoreline Overhaul, 2026-09):* "no gradients"
   never meant "four bands." Water depth uses a **deep ramp** of 12–16
   hard steps with dithered seams — the `deep` ramp below — which reads as
   a continuous shore-to-depth transition at play zoom while every pixel
   stays on a ramp colour. No linear gradient fills, no alpha fades:
   steps and dither, just many more of them.
6. **Materials come from the texture kit**: `thatchTexture`,
   `woodPlankTexture`, `stoneTexture`, `wattleTexture`, `foliageCluster`.
   Don't hand-roll a new thatch.
7. **Faction identity:** player = warm blue ramp (`blue`), rival tribe = deep
   red (`red`), barbarians = charcoal/rust furs (`rust`) + teal war paint
   (`teal`). Faction color appears on cloth/trim/banners only — silhouettes
   distinguish unit types, color distinguishes allegiance.
8. **Level-tier language comes from `ART.tierDress(level)`** — a progression
   curve (materials refine, decoration accumulates, footprint grows, banners
   and ember glow arrive at the refined tiers). Never hardcode "the level 2
   look"; read the dress object so L4/L5 can extend the curve later.
   - L1: rough — wattle/mud/thatch, small footprint, no decoration
   - L2: better — timber frame, tighter thatch, +decoration, larger
   - L3: refined — stone foundation, wood-shingle roofs, faction banner,
     ember/glow details, largest footprint

8b. **Material vocabulary is TIER-SCOPED for VILLAGER DRESS** (amended on
    the record for the villager tier overhaul — this deliberately breaks
    the old blanket "Neolithic only, no metal" reading, but ONLY for what
    villagers wear; buildings, work-site tools, and military kit keep the
    standing no-metal / no-sawn-lumber world until amended separately):
    - **L1 villagers** — hide, fur, rough-spun cloth with a ragged raw
      hem, cord and sinew; bone/antler/wood ornament only. No visible
      weave, no leather craft, no metal of any kind.
    - **L2 villagers** — woven cloth (a visible constructed garment:
      straight hems, seamed shoulders), worked leather (belt, straps,
      leg-wraps), fired-clay or bead ornament. Metal enters the world
      here at RATION SIZE ONLY: a single 1–2px bronze buckle/pin glint,
      nothing larger. Still no iron.
    - **L3 villagers** — draped dyed cloth in the Mediterranean civic
      language (fall of fabric, no waist cinch), leather sandals,
      dressed hair; bronze at ration size (a fibula/brooch or arm-ring
      glint, 1–2px each). The refined read comes from DRAPE AND BEARING,
      never from hardware — no armor, no weapons, still no iron.
9. **Animation discipline.** Static art is pre-rendered once (terrain to the
   offscreen cache, sprites to canvases at boot). Per-frame drawing is
   reserved for: units, water sparkle/foam overlays, smoke/ember particles,
   ambient life, and the day/night tint. **Never regenerate a sprite canvas
   inside the frame loop.** Idle motion uses the shared `animBob`/`animSway`
   curves so everything breathes at the same tempo.
10. **Performance budget:** 60fps on iPhone Safari. Animated overlays iterate
    viewport tiles only. If an effect can't stay cheap, it ships throttled or
    not at all.

## Palette notes

- **`deep`** (the Water & Shoreline Overhaul, 2026-09; it supersedes the
  four-band `basin` of LAND_REFRESH Phase 1, which read as four flat
  colours): the water body's shore-to-heart ramp, **lightest first**
  because it runs from the waterline outward, fourteen hard steps:

  | step | value | reads as |
  |---|---|---|
  | 0 | `#9dd5be` | sand showing through — `bone[2]` tinted toward turquoise |
  | 1 | `#74d3c2` | sand-through, deeper |
  | 2 | `#43d0c7` | clear shallow turquoise |
  | 3 | `#2fc6c6` | shallow |
  | 4 | `#2ca7af` | turquoise |
  | 5 | `#2b8b9c` | mid teal |
  | 6 | `#2b748c` | teal-blue |
  | 7 | `#2e6b8a` | = `water[2]` |
  | 8 | `#295b7a` | blue |
  | 9 | `#265674` | = `water[1]`, the body |
  | 10 | `#244d6b` | steel |
  | 11 | `#214868` | steel, deeper |
  | 12 | `#1e4364` | navy |
  | 13 | `#1d4060` | the heart — at `water[0]`'s luminance (57), never below it, since the swell contract treats `water[0]` itself as a trough scratch |

  Saturation is deliberately higher than the basin's. Only `R.paintWater`
  reads it; `water` keeps its indexes, which are load-bearing across
  sprites, cards and the minimap. The step edges are fitted to each map's
  measured depth (`LAND.DEEP_*` in `js/render.js`), the seams are stippled
  (rule 5 as amended), `DEEP_SAT` / `DEEP_LIFT` are the bench's pull-back
  knobs (identity at their defaults, so what ships is this table), and
  `DEPTH_AMP 0` restores the flat body byte for byte.

## Checklist for any new building / unit / icon

- [ ] Colors: `ART.PALETTE` references only
- [ ] Light from top-left (`shadedRect`/`shadedCircle` or equivalent)
- [ ] 1px `ART.outline` at build time (entities/buildings/icons)
- [ ] `ART.dropShadow` contact shadow
- [ ] Materials via the artstyle texture kit
- [ ] Level looks derived from `ART.tierDress(level)`
- [ ] Faction color on cloth/trim only; silhouette carries identity
- [ ] Readable at a glance at 32px against grass — squint test
- [ ] No canvas creation or sprite regeneration in the frame loop
- [ ] Building menu icon comes from the real sprite (auto-derived), not
      bespoke icon art

## File roles

- `js/artstyle.js` — palette, style constants, tier system, drawing
  primitives, material textures, animation curves, outline pass. Loaded
  before `sprites.js`.
- `js/sprites.js` — composes everything visible from artstyle primitives.
- `js/render.js` — camera, caches, per-frame overlays (water, smoke, ambient
  life, day/night), fog. Owns *when* things draw; artstyle owns *how they
  look*.
