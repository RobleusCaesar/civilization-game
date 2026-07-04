# ARTSTYLE.md — Neolithic Visual Style Guide

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
9. **Animation discipline.** Static art is pre-rendered once (terrain to the
   offscreen cache, sprites to canvases at boot). Per-frame drawing is
   reserved for: units, water sparkle/foam overlays, smoke/ember particles,
   ambient life, and the day/night tint. **Never regenerate a sprite canvas
   inside the frame loop.** Idle motion uses the shared `animBob`/`animSway`
   curves so everything breathes at the same tempo.
10. **Performance budget:** 60fps on iPhone Safari. Animated overlays iterate
    viewport tiles only. If an effect can't stay cheap, it ships throttled or
    not at all.

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
