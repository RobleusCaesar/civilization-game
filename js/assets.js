"use strict";
/* Assets — the hand-authored art pipeline (full rules + workflow: ART_PLAN.md).

   The game is fully playable with zero image files: every sprite is drawn
   procedurally by sprites.js/artstyle.js at boot. Real PNG art replaces a
   building's procedural sprite BY FILENAME ALONE — no manifest, no code:

       assets/buildings/{id}-l{level}.png        (all lowercase — GitHub
                                                  Pages is case-sensitive)

   At startup every valid id/level slot's URL is tried. A load success swaps
   the image into BOTH tribes' sprite tables (the architecture is shared;
   banners and owner pips carry the faction — the same deal the old manifest
   made for the hall); a miss keeps the procedural drawable. There is no
   loading gate and no blank frame: procedural art renders from the first
   frame and each PNG swaps in whenever it decodes.

   Optional per-asset sidecar, read only AFTER its PNG loads (a missing file
   is the default, never an error):

       assets/buildings/{id}-l{level}.json
       { "offsetX": 0, "offsetY": 0, "scale": 1 }

   offsets are fractions of the footprint, scale is a multiplier — they feed
   the ONE shared anchoring rule in R.blitBld (bottom-center on the
   footprint, scaled to footprint width, aspect preserved, tall art
   overhangs upward). Per-building tuning lives in the sidecar, never in code.

   ?dev=1 (js/dev.js) drops PNGs into these same slots live, through
   setBuildingArt below, so the preview is byte-for-byte what ships.

   A raider camp is the one exception to "one id, one PNG": its look belongs
   to its PEOPLE (wolf/flint/broken/woad/sea — CFG.TRIBES, not to be confused
   with the two player factions above), so it gets its own parallel
   convention, assets/buildings/camp-{tribe}.png, just below.

   The legacy `_slot` key grammar and drawSprite() survive for the
   procedural tables they address (misc/ work-site art, ui/card motifs) —
   only the atlas manifest is gone. */

const Assets = {
  ready: false,      // init has kicked off (loads resolve in the background)
  loaded: {},        // slot key -> true where an image replaced procedural art
  failed: [],        // kept for diagnostics symmetry (a missing PNG is EXPECTED, never recorded)
  art: {},           // 'id-lN' -> HTMLImageElement, or null once its URL 404'd
  ui: { card: {} },  // ui/card/<key> drawables (Origin Cards art)

  ART_DIR: 'assets/buildings/',
  /* what the {id}-l{level}.png convention does NOT cover, and why
     (ART_PLAN.md): walls and gates tile from 16-mask atlases (one rectangle
     cannot be a curtain); the wonder's art is per-monument, rolled per run
     (one PNG would stamp all ten); a raider camp's look belongs to its
     PEOPLE, not its building id — it has its OWN convention just below
     (camp-{tribe}.png), because one id would otherwise need five looks. */
  EXCLUDE: ['wall', 'gate', 'wonder', 'raidercamp'],

  /* ---- CAMP ART: one PNG per PEOPLE, not per building id ----

       assets/buildings/camp-{tribe}.png

     {tribe} is a CFG.TRIBES key (wolf, flint, broken, woad, sea today) —
     derived, never hand-kept, so a new tribe added to CFG.TRIBES gets a slot
     for free. A hit replaces Sprites.camp[tribe] (the drawable R.bldSprite
     and the panel icon already read by tribe — see render.js/ui.js); a miss
     leaves the procedural TRIBE_CAMP look. Same _cfArt marker, same sidecar,
     same cache-buster, same ?dev=1 injection path as building art — just a
     different filename shape and a different install point. */
  campTribes() { return CFG.TRIBES.map(t => t.key); },
  campSlotKey(tribe) { return 'camp-' + tribe; },
  campName(tribe) { return this.campSlotKey(tribe).toLowerCase() + '.png'; },
  campUrl(tribe) { return this.ART_DIR + this.campName(tribe) + '?v=' + (CFG.ART_V || 1); },

  _tryLoadCamp(tribe) {
    const img = new Image();
    const k = this.campSlotKey(tribe);
    img.onload = async () => {
      let meta = null;
      if (location.protocol !== 'file:') try {
        const r = await fetch(this.ART_DIR + k + '.json?v=' + (CFG.ART_V || 1));
        if (r.ok) meta = await r.json();
      } catch (e) { /* no sidecar — defaults */ }
      if (window.DevArt && DevArt.overrides && DevArt.overrides[k]) return;
      this.setCampArt(tribe, img, meta);
    };
    img.onerror = () => { this.art[k] = null; };
    img.src = this.campUrl(tribe);
  },

  /* install a PNG as one people's camp look — startup and ?dev=1 both land
     HERE. Sprites.camp[tribe] is what R.bldSprite (render.js) and the panel
     icon (ui.js) already read by tribe; no other code needed to change for
     the swap to take. */
  setCampArt(tribe, img, meta) {
    if (this.campTribes().indexOf(tribe) < 0 || !Sprites.camp) return false;
    img._cfArt = {
      ox: (meta && isFinite(+meta.offsetX)) ? +meta.offsetX : 0,
      oy: (meta && isFinite(+meta.offsetY)) ? +meta.offsetY : 0,
      scale: (meta && isFinite(+meta.scale) && +meta.scale > 0) ? +meta.scale : 1,
    };
    Sprites.camp[tribe] = img;
    const k = this.campSlotKey(tribe);
    this.art[k] = img;
    this.loaded[k] = true;
    return true;
  },
  /* ---- CAMP PROP ART: override ONE prop of one people's dressing ----

       assets/buildings/camp-{tribe}-prop{1..4}.png

     The index is the prop's position in that people's set — the order
     CLAUDE.md lists them in (e.g. wolf: 1 skull pike, 2 pelt frame, 3 bone
     heap, 4 strung game). A hit replaces exactly that prop; the other three
     keep their procedural look, so a set can be upgraded one file at a
     time. Drawn by R.drawCampDress into a ONE-TILE box — author at 64 or
     128px square on a transparent ground, feet at the bottom. Same
     cache-buster and the same ?dev=1 injection path as every other PNG. */
  CAMP_PROP_N: 4,
  campPropSlotKey(tribe, i) { return 'camp-' + tribe + '-prop' + i; },
  campPropName(tribe, i) { return this.campPropSlotKey(tribe, i).toLowerCase() + '.png'; },
  campPropUrl(tribe, i) { return this.ART_DIR + this.campPropName(tribe, i) + '?v=' + (CFG.ART_V || 1); },
  campProps: {},               // tribe -> { [1..4]: img }
  _tryLoadCampProp(tribe, i) {
    const img = new Image();
    const k = this.campPropSlotKey(tribe, i);
    img.onload = () => {
      if (window.DevArt && DevArt.overrides && DevArt.overrides[k]) return;
      this.setCampPropArt(tribe, i, img);
    };
    img.onerror = () => { this.art[k] = null; };
    img.src = this.campPropUrl(tribe, i);
  },
  setCampPropArt(tribe, i, img) {
    if (this.campTribes().indexOf(tribe) < 0) return false;
    i = +i;
    if (!(i >= 1 && i <= this.CAMP_PROP_N)) return false;
    (this.campProps[tribe] = this.campProps[tribe] || {})[i] = img;
    const k = this.campPropSlotKey(tribe, i);
    this.art[k] = img;
    this.loaded[k] = true;
    return true;
  },
  /* ---- WONDER ART: one PNG per MONUMENT, not per building id ----

       assets/buildings/wonder-{key}.png

     {key} is a CFG.WONDERS key (henge, colossus, moai, …) — DERIVED, never
     hand-kept, so an eleventh monument gets a slot for free. The single
     `wonder` building id serves all ten (rolled per run), which is exactly
     why it was left out of the {id}-l{level}.png convention — one PNG would
     stamp every monument. This shape keys the art the way the game keys the
     roll. A hit lands in Sprites.wonders[key] — the dictionary
     Sprites.useWonder copies the run's monument out of — so the menu icon,
     panel, R.bldSprite, burn variants, fog ghost and the scaffold's
     stage-three reveal all take it with no call-site changes; a 404 keeps
     the procedural drawing. The _cfArt marker rides along so a TALL
     monument (the obelisk) keeps its aspect and overhangs upward through
     artRect instead of being squashed into the 3x3 square. */
  wonderKeys() { return (CFG.WONDERS || []).map(w => w.key); },
  wonderSlotKey(key) { return 'wonder-' + key; },
  wonderArtName(key) { return this.wonderSlotKey(key).toLowerCase() + '.png'; },
  wonderArtUrl(key) { return this.ART_DIR + this.wonderArtName(key) + '?v=' + (CFG.ART_V || 1); },
  _tryLoadWonder(key) {
    const img = new Image();
    const k = this.wonderSlotKey(key);
    img.onload = async () => {
      let meta = null;
      if (location.protocol !== 'file:') try {
        const r = await fetch(this.ART_DIR + k + '.json?v=' + (CFG.ART_V || 1));
        if (r.ok) meta = await r.json();
      } catch (e) { /* no sidecar — defaults */ }
      if (window.DevArt && DevArt.overrides && DevArt.overrides[k]) return;
      this.setWonderArt(key, img, meta);
    };
    img.onerror = () => { this.art[k] = null; };
    img.src = this.wonderArtUrl(key);
  },
  setWonderArt(key, img, meta) {
    // bare `Sprites`, never window.Sprites — it is a script-level const (the
    // same trap G.setWonder's comment records)
    if (this.wonderKeys().indexOf(key) < 0 || typeof Sprites === 'undefined' || !Sprites.wonders) return false;
    img._cfArt = {
      ox: (meta && isFinite(+meta.offsetX)) ? +meta.offsetX : 0,
      oy: (meta && isFinite(+meta.offsetY)) ? +meta.offsetY : 0,
      scale: (meta && isFinite(+meta.scale) && +meta.scale > 0) ? +meta.scale : 1,
    };
    Sprites.wonders[key] = img;
    // the run's monument may already be standing — re-point the live slot
    if (window.S && S.wonder === key && Sprites.useWonder) Sprites.useWonder(key);
    const k = this.wonderSlotKey(key);
    this.art[k] = img;
    this.loaded[k] = true;
    return true;
  },

  // standalone PROPS — composited sprites that are not a building's own
  // rectangle. One fixed URL per prop key; same swap-in rules as buildings.
  PROPS: { 'misc/campfireTc': 'assets/misc/campfire-tc.png' },

  /* ---- ORIGIN CARD ICONS: one PNG per MOTIF, not per card ----

       assets/icons/origins/{motif}.png

     {motif} is a Cards.DEFS motif key (hearth, spears, rider, …) — DERIVED
     from the card table, never hand-kept, so a new card gets a slot for
     free. A hit installs into the ui/card/<cardKey> slot of EVERY card
     wearing that motif (1:1 today, but shared motifs stay correct), which
     is exactly what Cards.drawMotif already prefers over the procedural
     64-grid drawing — so every render site (draft screen, rival reveal)
     takes the image with zero code at the call sites. A 404 keeps the
     procedural motif, the same deal every other convention makes. Same
     lowercase rule, same ?v= cache-buster. */
  ORIGIN_DIR: 'assets/icons/origins/',
  originMotifs() {
    if (!window.Cards || !Cards.DEFS) return [];
    const seen = {}, out = [];
    for (const k of Object.keys(Cards.DEFS)) {
      const m = Cards.DEFS[k].motif;
      if (m && !seen[m]) { seen[m] = true; out.push(m); }
    }
    return out;
  },
  // the canonical filename — ALWAYS lowercase; Pages serves case-sensitively
  originName(motif) { return String(motif).toLowerCase() + '.png'; },
  originUrl(motif) { return this.ORIGIN_DIR + this.originName(motif) + '?v=' + (CFG.ART_V || 1); },
  _tryLoadOrigin(motif) {
    const img = new Image();
    img.onload = () => { this.setOriginArt(motif, img); };
    img.onerror = () => { /* no icon — the procedural motif stands */ };
    img.src = this.originUrl(motif);
  },
  /* install a PNG as a motif's card icon. Cards draw ONCE into DOM
     canvases (not per frame), so an image that decodes after a card was
     dealt must repaint it — drawMotif stamps `_cfCardKey` on every canvas
     it paints, and this walks them. */
  setOriginArt(motif, img) {
    if (!window.Cards || !Cards.DEFS) return false;
    let hit = false;
    for (const k of Object.keys(Cards.DEFS)) {
      if (Cards.DEFS[k].motif !== motif) continue;
      if (this._place('ui/card/' + k, img)) { this.loaded['ui/card/' + k] = true; hit = true; }
    }
    if (hit && typeof document !== 'undefined') {
      for (const c of document.querySelectorAll('canvas')) {
        const ck = c._cfCardKey;
        if (ck && Cards.DEFS[ck] && Cards.DEFS[ck].motif === motif) Cards.drawMotif(c, ck);
      }
    }
    return hit;
  },

  /* ---- ENDGAME ART: one folder per (outcome, difficulty), any number of
     pictures (assets/endgame/README.md) ----

       assets/endgame/win/{calm|moderate|hard}/1.png, 2.png, 3.png, …
       assets/endgame/loss/{calm|moderate|hard}/1.png, 2.png, 3.png, …

     Drop as many numbered PNGs as you like into a bucket; js/defeatart.js
     and js/victoryart.js each pick one at random when that screen opens. An
     empty/missing bucket leaves the procedural scene exactly as it always
     drew — real art SITS ON TOP of (replaces) the procedural fallback, never
     a hard requirement. Difficulty is derived from CFG.MODES, never a
     hand-kept list, so a new mode gets a bucket for free.

     Probing CASCADES like ground art: only 1.png is tried for every bucket
     at startup, 2.png only once 1.png hit, and so on — a bare repo pays one
     404 per bucket (6 requests total), not ENDGAME_MAX of them. */
  ENDGAME_DIR: 'assets/endgame/',
  ENDGAME_MAX: 12,                 // most pictures probed per bucket
  ENDGAME_OUTCOMES: ['win', 'loss'],
  endgameModes() { return Object.keys(CFG.MODES); },
  endgame: {},                     // 'win/calm' -> [img, …] in the order they were found
  endgameKey(outcome, mode) { return outcome + '/' + mode; },
  endgameUrl(outcome, mode, n) {
    return this.ENDGAME_DIR + outcome + '/' + mode + '/' + n + '.png?v=' + (CFG.ART_V || 1);
  },
  _tryEndgame(outcome, mode, n) {
    if (n > this.ENDGAME_MAX) return;
    const img = new Image();
    img.onload = () => { this.setEndgameArt(outcome, mode, img); this._tryEndgame(outcome, mode, n + 1); };
    img.onerror = () => { /* no more pictures in this bucket — the ones already found still stand */ };
    img.src = this.endgameUrl(outcome, mode, n);
  },
  setEndgameArt(outcome, mode, img) {
    const k = this.endgameKey(outcome, mode);
    const a = this.endgame[k] || (this.endgame[k] = []);
    if (a.indexOf(img) < 0) a.push(img);
    this.loaded['endgame/' + k] = true;
    return true;
  },
  // every picture loaded for this bucket, or an empty array — Defeat/
  // VictoryArt pick one of these themselves (their own seeded `pick()`)
  endgameImgs(outcome, mode) { return this.endgame[this.endgameKey(outcome, mode)] || []; },

  /* ---- GROUND ART: the same deal as buildings, for the map itself ----

       assets/terrain/{name}.png        the whole terrain
       assets/terrain/{name}-2.png      a second variant, -3, -4 … as many
                                        as you like

     {name} is the terrain's own name in lowercase: grass, forest, water,
     hills, fertile, stumps, pebbles, barren, ruin, mountain, trench, moat,
     mound, goldore, camp. Drop a file in and it is used; drop nothing and
     the procedural tile stands, exactly as with a building.

     ONE FILE IS ENOUGH. Supply `forest.png` alone and every forest tile
     wears it; add `-2`/`-3` and the map picks between them by the same tile
     hash the procedural variants use, so a supplied set breaks up its own
     tiling for free.

     Probing CASCADES: only `{name}.png` is tried for every terrain at
     startup (15 requests), and `-2` is only tried once the blanket loaded,
     `-3` once `-2` did. A repo with no ground art pays 15 404s; an artist
     working on one terrain pays a handful more.

     The overrides live HERE and never touch Sprites.terrain — the
     procedural tables stay whole, so the variant-picking maths in
     R.drawTile is unchanged and removing a file restores the old look with
     no other moving part. */
  TERRAIN_DIR: 'assets/terrain/',
  TERRAIN_MAX: 8,          // most variants probed for one terrain
  terrain: {},             // T value -> [img, …] in the order they were found
  terrainName(t) {
    for (const k of Object.keys(T)) if (T[k] === t) return k.toLowerCase();
    return null;
  },
  terrainUrl(name, n) {
    return this.TERRAIN_DIR + (n > 1 ? name + '-' + n : name) + '.png?v=' + (CFG.ART_V || 1);
  },
  /* the drawable for terrain t at variant index i, or null to draw
     procedurally. Wraps, so one supplied file answers for every index. */
  terrainImg(t, i) {
    const a = this.terrain[t];
    if (!a || !a.length) return null;
    return a[((i | 0) % a.length + a.length) % a.length];
  },
  hasTerrainArt(t) { const a = this.terrain[t]; return !!(a && a.length); },

  /* ---- TERRAIN COVER ART: the wild grass and its tended cut ----

       assets/terrain/cover/{terrain}/{slot}.png       (all lowercase)
       e.g.  assets/terrain/cover/grass/wild.png

     The per-tile terrain override above replaces the FLOOR; cover art
     replaces what GROWS on it (R.grassCover — the wild sward layer and the
     kept verge a standing building keeps). Terrain-generic by construction —
     the convention takes any terrain name — but only the terrains in
     COVER_CATALOG are probed, and today that is grass alone.

     THREE SLOTS, three separate files: `wild` (the open meadow's sward),
     `kept` (the cropped tended cut inside a building's verge), `accent`
     (the rare seed-head/bloom overlay, wild ground only). A partial set is
     fine — supply `wild` alone and the kept/accent looks stay procedural;
     a 404 is the default state, never an error.

     A file is a horizontal STRIP of 32×32 frames, ONE CLUMP PER FRAME:
     width a multiple of 32, height exactly 32, the clump's ink wider than
     it is tall (a taller-than-wide frame is dropped at install — the
     sapling trap), authored at native density, 32 art px per tile. The
     frame's opaque box is measured at install and R.grassCover draws it
     bottom-anchored on the foot of the procedural sward it replaces — at
     the same jittered anchor, in the same count, under the same gates —
     so art changes what a sward looks like and never where it grows. Add
     more frames to one file, or more files via the `-2`/`-3` cascade, and
     the picker hashes between all of them. Alpha is snapped HARD BINARY at
     install (A<128 → 0, else 255) — the cover bakes into the terrain
     cache, whose repaint discipline is built on opaque idempotent
     restamps. Same ?v= cache-buster as everything. */
  COVER_DIR: 'assets/terrain/cover/',
  COVER_SLOTS: ['wild', 'kept', 'accent'],
  COVER_CATALOG: ['grass'],       // terrains probed at startup (grass only today)
  COVER_MAX: 6,                   // most variant files probed per slot
  COVER_PX: 32,
  cover: {},                      // tName -> slot -> [32×32 frames…]
  coverUrl(tName, slot, n) {
    return this.COVER_DIR + tName + '/' + (n > 1 ? slot + '-' + n : slot) + '.png?v=' + (CFG.ART_V || 1);
  },
  coverSlotKey(tName, slot) { return 'cv|' + tName + '|' + slot; },
  _tryCover(tName, slot, n) {
    if (n > this.COVER_MAX) return;
    const img = new Image();
    img.onload = () => { if (this.setCoverArt(tName, slot, img)) this._tryCover(tName, slot, n + 1); };
    img.onerror = () => { /* no art at this slot — the procedural sward stands */ };
    img.src = this.coverUrl(tName, slot, n);
  },
  setCoverArt(tName, slot, img) {
    tName = String(tName).toLowerCase(); slot = String(slot).toLowerCase();
    if (this.COVER_SLOTS.indexOf(slot) < 0) return false;
    const PX = this.COVER_PX;
    if (!img || !img.width || img.height !== PX || img.width % PX) return false;
    const frames = [];
    for (let i = 0; i < img.width / PX; i++) {
      const c = document.createElement('canvas'); c.width = PX; c.height = PX;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, i * PX, 0, PX, PX, 0, 0, PX, PX);
      // the frame's opaque box: a clump is drawn bottom-anchored on the sward
      // it replaces, so R.grassCover needs to know where the ink actually is
      let bx = 0, by = 0, bw = PX, bh = PX;
      try {
        // hard binary alpha — the bake's restamp discipline needs opaque pixels
        const d = g.getImageData(0, 0, PX, PX);
        let x0 = PX, y0 = PX, x1 = -1, y1 = -1;
        for (let p = 3; p < d.data.length; p += 4) {
          d.data[p] = d.data[p] < 128 ? 0 : 255;
          if (d.data[p]) {
            const k = (p - 3) >> 2, px = k % PX, py = (k / PX) | 0;
            if (px < x0) x0 = px; if (px > x1) x1 = px;
            if (py < y0) y0 = py; if (py > y1) y1 = py;
          }
        }
        g.putImageData(d, 0, 0);
        if (x1 < 0) continue;                             // an empty frame is not a clump
        bx = x0; by = y0; bw = x1 - x0 + 1; bh = y1 - y0 + 1;
        if (bh > bw) continue;                            // the sapling trap: wider than tall, or not at all
      } catch (e) { /* tainted (file://) — ship as decoded; the QC gate is authoring-time */ }
      c._bx = bx; c._by = by; c._bw = bw; c._bh = bh;
      frames.push(c);
    }
    if (!frames.length) return false;
    const t = this.cover[tName] || (this.cover[tName] = {});
    (t[slot] || (t[slot] = [])).push(...frames);
    this.loaded[this.coverSlotKey(tName, slot)] = true;
    // the cover bakes into the terrain cache — a PNG landing after the world
    // was built has to ask for the repaint, exactly as terrain art does
    if (window.R && typeof R.rebuildTerrain === 'function') R.rebuildTerrain();
    return true;
  },
  /* the frame for (terrain, slot) at hash i, or null to draw procedurally.
     Wraps over every frame from every cascade file. */
  coverImg(tName, slot, i) {
    const t = this.cover[tName], a = t && t[slot];
    if (!a || !a.length) return null;
    return a[(i >>> 0) % a.length];
  },

  /* ---- THE JUMPING FISH: one animation strip per variant --------------

       assets/fx/fish-1.png, fish-2.png …

     A horizontal strip of FISH_PX square frames, one per beat of the leap
     — out of the water, over the arc, back down. R.drawFishJump walks the
     strip along the arc it already drew, so the sprite replaces the FISH
     and never the path, the splash ring, the droplets or the frequency
     gating (shoal-often, open-water-rare). A missing file leaves the
     procedural fish jumping, and a variant is picked per tile so a lake is
     never one cloned fish.

     Authored at 64px and shipped at 16 — a 4:1 box downscale, done
     downscale, done offline where a box filter and a palette snap can be
     applied. Binary alpha is enforced here too: a soft edge over water is
     exactly the halo the doctrine forbids. */
  FISH_DIR: 'assets/fx/',
  FISH_PX: 16,
  FISH_MAX: 4,                    // most variant strips probed
  fishArt: [],                    // [variant] -> [frame canvases…]
  fishUrl(n) { return this.FISH_DIR + 'fish-' + n + '.png?v=' + (CFG.ART_V || 1); },
  _tryFish(n) {
    if (n > this.FISH_MAX) return;
    const img = new Image();
    img.onload = () => { if (this.setFishArt(n, img)) this._tryFish(n + 1); };
    img.onerror = () => { /* no strip at this slot — the procedural fish jumps */ };
    img.src = this.fishUrl(n);
  },
  setFishArt(n, img) {
    const PX = this.FISH_PX;
    if (!img || !img.width || img.height !== PX || img.width % PX) return false;
    const frames = [];
    for (let i = 0; i < img.width / PX; i++) {
      const c = document.createElement('canvas'); c.width = PX; c.height = PX;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, i * PX, 0, PX, PX, 0, 0, PX, PX);
      try {
        const d = g.getImageData(0, 0, PX, PX);
        for (let k = 3; k < d.data.length; k += 4) d.data[k] = d.data[k] >= 128 ? 255 : 0;
        g.putImageData(d, 0, 0);
      } catch (e) { /* tainted on file:// — the strip still draws, unsnapped */ }
      frames.push(c);
    }
    if (!frames.length) return false;
    this.fishArt[n - 1] = frames;
    return true;
  },
  // the frames of one fish variant, or null while the procedural fish stands
  fishFrames(i) {
    const a = this.fishArt.filter(Boolean);
    return a.length ? a[(i >>> 0) % a.length] : null;
  },

  /* ---- THE WATER'S MOTION PASS: three authored files -----------------

       assets/terrain/water/surface.png   a seamless grayscale texture the
                                          frame scrolls over the body at
                                          MULTIPLY — near-white ground so
                                          it modulates without recolouring
       assets/terrain/water/shimmer.png   a seamless glint layer on PURE
                                          black, scrolled under 'lighter'
       assets/terrain/water/wave-{a,b,c}.png
                                          the wave-roll crests: a horizontal
                                          strip of frames, each frame FOUR
                                          TIMES as wide as the strip is tall
                                          (64x16 shipped), a = long crest,
                                          b = medium, c = short — c is the
                                          one a curved shore doubles up

     Each loads independently; a 404 leaves that one layer to the
     procedural water, never an error. R.drawLivingWater builds ONE
     CanvasPattern per installed texture and only moves the offset. Wave
     frames get binary alpha enforced here, like every sprite. */
  WATERFX_DIR: 'assets/terrain/water/',
  waterFx: { surface: null, shimmer: null, waves: [] },
  waterFxUrl(name) { return this.WATERFX_DIR + name + '.png?v=' + (CFG.ART_V || 1); },
  _tryWaterFx() {
    for (const name of ['surface', 'shimmer', 'wave-a', 'wave-b', 'wave-c']) {
      const img = new Image();
      img.onload = () => this.setWaterFx(name, img);
      img.onerror = () => { /* that layer stays procedural */ };
      img.src = this.waterFxUrl(name);
    }
  },
  setWaterFx(name, img) {
    if (!img || !img.width || !img.height) return false;
    if (name.startsWith('wave-')) {
      const FW = img.height * 4;                   // the strip convention
      if (img.width % FW) return false;
      const frames = [];
      for (let i = 0; i < img.width / FW; i++) {
        const c = document.createElement('canvas'); c.width = FW; c.height = img.height;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(img, i * FW, 0, FW, img.height, 0, 0, FW, img.height);
        try {
          const d = g.getImageData(0, 0, FW, img.height);
          for (let k = 3; k < d.data.length; k += 4) d.data[k] = d.data[k] >= 128 ? 255 : 0;
          g.putImageData(d, 0, 0);
        } catch (e) { /* tainted on file:// — the frames still draw */ }
        frames.push(c);
      }
      if (!frames.length) return false;
      // a=0 b=1 c=2; a sparse catalog packs down so waves[] is dense
      this.waterFx['_' + name] = frames;
      this.waterFx.waves = ['wave-a', 'wave-b', 'wave-c']
        .map(n => this.waterFx['_' + n]).filter(Boolean);
      return true;
    }
    if (name !== 'surface' && name !== 'shimmer') return false;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    this.waterFx[name] = c;
    return true;
  },

  /* ---- THE TREE DOOR: single-tree pieces composed into the forest tiles ----

       assets/terrain/trees/{style}-{size}-{letter}.png
       style ∈ dome|oak|conifer|birch|stump|snag|log, size ∈ s|l, letters
       from 'a', all lowercase. Pieces ship at WORLD scale (an l tree is a
       ~24px canvas, an s tree ~12px) with the trunk base on the bottom
       edge, hard binary alpha; every installed piece also bakes its
       MIRROR, so a catalog letter is two stamps. Sprites.rebuildForest
       recomposes the 28 forest tile canvases through the same lattice,
       jitter and density gradient the procedural wood uses — a partial
       catalog composes with procedural trees filling the gaps, and no
       catalog at all leaves the wood byte-identical. 404 is a look,
       never an error. hueTint coats these pixels at runtime like every
       tree pixel, so pieces are authored NEUTRAL green — no pre-baked
       warm or cool casts (ART_PLAN: the tint rule). */
  TREES_DIR: 'assets/terrain/trees/',
  // …the catalog outgrew its name: orchard and berry are the fertile
  // ground's plants, stone and gold the ore deposits — all probed, muted
  // and mirrored through the same machinery as the wood
  TREE_STYLES: ['dome', 'oak', 'conifer', 'birch', 'stump', 'snag', 'log',
    'orchard', 'berry', 'stone', 'gold'],
  trees: {}, treesRev: 0,
  treeUrl(style, size, letter) { return this.TREES_DIR + style + '-' + size + '-' + letter + '.png?v=' + (CFG.ART_V || 1); },
  _tryTrees() {
    for (const style of this.TREE_STYLES) for (const size of ['s', 'l', 'xl'])
      this._tryTreePiece(style, size, 0);   // xl exists only for dome (the elder) — 404s are free
  },
  /* ---- THE MOUNTAIN KIT: drawn massifs, CHAINED into ranges ----

       assets/terrain/mountain/{kind}-{letter}.png     kinds: peak | saddle | end

     The third mountain attempt, and the one the operator chose: the rock is
     DRAWN, never painted by a procedure. A region is dressed by chaining
     pieces west to east along its own southern edge — each overlapping its
     neighbour by MTN.KIT_OVERLAP, so the flanks (which the art deliberately
     ends part-way up the slope) merge into one continuous crest with a
     saddle at every join. Peaks carry the summits, saddles are the low links
     between them.

     ONE ART-PIXEL PER WORLD-PIXEL. These are placed, never scaled: the
     density canon forbids resampling shipped pixels, so a piece is drawn at
     1:1 or at an integer box ÷2 and at no other size.

     NEVER MIRRORED. The light is locked to the upper left; a mirrored piece
     lights from the upper right, and a range built of alternating mirrors
     shows a butterfly seam at every join. Variety comes from having several
     pieces, not from flipping one.

     Absent files are the default state — with no kit the procedural
     extrusion stands exactly as it always has. */
  MTN_KIT_DIR: 'assets/terrain/mountain/',
  MTN_KIT_KINDS: ['peak', 'saddle', 'hill', 'roll', 'foot'],   // hill/roll = the low front bands
  mtnKit: {}, mtnKitRev: 0,
  mtnKitUrl(kind, letter) { return this.MTN_KIT_DIR + kind + '-' + letter + '.png?v=' + (CFG.ART_V || 1); },
  _tryMtnKit() { for (const kind of this.MTN_KIT_KINDS) this._tryMtnPiece(kind, 0); },
  _tryMtnPiece(kind, li) {
    if (li >= 16) return;                         // letters a..p; the cascade stops at the first 404
    const img = new Image();
    img.onload = () => { this.setMtnPiece(kind, img); this._tryMtnPiece(kind, li + 1); };
    img.onerror = () => { /* the kit ends here */ };
    img.src = this.mtnKitUrl(kind, String.fromCharCode(97 + li));
  },
  /* the low bands are drawn at half size — small rolling ground should
     READ small beside a peak, and halving is the only resize the density
     canon allows (an integer box downscale, never a resample) */
  MTN_KIT_DIV: { roll: 2, hill: 2 },
  setMtnPiece(kind, img) {
    if (!img || !img.width || !img.height) return false;
    const div = this.MTN_KIT_DIV[kind] || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, (img.width / div) | 0); c.height = Math.max(1, (img.height / div) | 0);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (div === 1) g.drawImage(img, 0, 0);
    else {
      const s2 = document.createElement('canvas');
      s2.width = img.width; s2.height = img.height;
      const sg = s2.getContext('2d');
      sg.imageSmoothingEnabled = false;
      sg.drawImage(img, 0, 0);
      try {
        const sd = sg.getImageData(0, 0, img.width, img.height).data;
        const od = g.createImageData(c.width, c.height);
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          let r2 = 0, g2 = 0, b2 = 0, n = 0;
          for (let oy = 0; oy < div; oy++) for (let ox = 0; ox < div; ox++) {
            const o = ((y * div + oy) * img.width + (x * div + ox)) * 4;
            if (sd[o + 3] < 128) continue;
            r2 += sd[o]; g2 += sd[o + 1]; b2 += sd[o + 2]; n++;
          }
          const oo = (y * c.width + x) * 4;
          if (n * 2 >= div * div) { od.data[oo] = r2 / n; od.data[oo + 1] = g2 / n; od.data[oo + 2] = b2 / n; od.data[oo + 3] = 255; }
        }
        g.putImageData(od, 0, 0);
      } catch (e) { g.drawImage(img, 0, 0, c.width, c.height); }
    }
    /* the FOOT PROFILE — the lowest opaque row in each column. It is what
       the ground shadow is cast from and what decides which tile row owns
       each column of the piece, so the occlusion strips stay honest. */
    let foot = null;
    try {
      const d = g.getImageData(0, 0, c.width, c.height);
      for (let k = 3; k < d.data.length; k += 4) d.data[k] = d.data[k] >= 128 ? 255 : 0;
      g.putImageData(d, 0, 0);
      foot = new Int32Array(c.width).fill(-1);
      for (let x = 0; x < c.width; x++) for (let y = c.height - 1; y >= 0; y--)
        if (d.data[(y * c.width + x) * 4 + 3] > 0) { foot[x] = y; break; }
    } catch (e) { /* tainted on file:// — the piece still draws, shadowless */ }
    /* the pixels are kept alongside the canvas: the chain composites by
       hand so it can TEAR each piece's exposed edges, and reading them back
       once here beats reading them per placement */
    let px = null;
    try { px = g.getImageData(0, 0, c.width, c.height).data; } catch (e) { px = null; }
    /* A CLIPPED SUMMIT IS NOT A MOUNTAIN. Generated rock whose highest
       pixels run off the top of its own canvas has had its peak sliced
       flat, and no amount of placing will put it back — it reads as a
       mesa in the back of every range it lands in. A piece that touches
       its own top edge is refused here, once, rather than debugged in the
       world later. The low bands are exempt: a rolling rise has no summit
       to lose and is authored flush to its top. */
    if (foot && kind !== 'roll' && kind !== 'hill' && kind !== 'foot') {
      let touches = false;
      for (let x = 0; x < c.width && !touches; x++) if (foot[x] >= 0) {
        const d2 = g.getImageData(x, 0, 1, 1).data;
        if (d2[3] > 0) touches = true;
      }
      if (touches) {
        if (!this._mtnWarned) this._mtnWarned = {};
        const wk = kind + ':' + (this.mtnKit[kind] || []).length;
        if (!this._mtnWarned[wk]) { this._mtnWarned[wk] = 1; console.warn('[mountain kit] ' + wk + ': summit runs off the top of the art — refused'); }
        return false;
      }
    }
    const a = this.mtnKit[kind] || (this.mtnKit[kind] = []);
    a.push({ c, w: c.width, h: c.height, foot, px });
    this.mtnKitRev++;
    if (typeof R !== 'undefined' && R.rebakeAll) { R._mtnArt = null; R._mtnLayerKey = ''; R._mtnDirty = true; }
    return true;
  },
  mtnKitReady() { return !!(this.mtnKit.peak && this.mtnKit.peak.length); },

  _tryTreePiece(style, size, li) {
    if (li >= 12) return;                         // letters a..l, the cascade stops at the first 404
    const img = new Image();
    img.onload = () => { this.setTreePiece(style + '-' + size, img); this._tryTreePiece(style, size, li + 1); };
    img.onerror = () => { /* the catalog ends here — procedural fills the gaps */ };
    img.src = this.treeUrl(style, size, String.fromCharCode(97 + li));
  },
  setTreePiece(key, img) {
    if (!img || !img.width || !img.height) return false;
    const cut = (flip) => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      if (flip) { g.translate(img.width, 0); g.scale(-1, 1); }
      g.drawImage(img, 0, 0);
      try {
        const d = g.getImageData(0, 0, c.width, c.height);
        for (let k = 3; k < d.data.length; k += 4) d.data[k] = d.data[k] >= 128 ? 255 : 0;
        g.putImageData(d, 0, 0);
      } catch (e) { /* tainted on file:// — the piece still draws */ }
      return c;
    };
    const a = this.trees[key] || (this.trees[key] = []);
    a.push(cut(false), cut(true));                // the piece and its pre-baked mirror
    this.treesRev++;
    this._muteK = -1;                             // raw changed: the muted cache is stale
    /* ONE recompose per burst, not one per piece: boot decodes a dozen
       pieces in a blink, and recomposing the whole wood for each was a
       dozen full rebuilds nobody saw between. A synchronous caller (the
       door pin, a ?dev=1 drop that wants the result NOW) calls
       Sprites.rebuildForest itself.
       NOT `window.Sprites` — Sprites is a script-level const, so that
       guard is silently false forever (the cards.js ART lesson, again). */
    if (!this._treeRebuildDue) {
      this._treeRebuildDue = true;
      const run = () => {
        // …and never during the splash: a full rebake on the boot thread
        // freezes the fade's style recalcs, and the splash covers the map
        // anyway — wait it out, then recompose once
        if (document.getElementById('splash')) { setTimeout(run, 200); return; }
        this._treeRebuildDue = false;
        if (typeof Sprites !== 'undefined' && Sprites.rebuildForest) Sprites.rebuildForest();
        if (typeof R !== 'undefined' && typeof R.rebuildTerrain === 'function') R.rebuildTerrain();
      };
      setTimeout(run, 40);
    }
    return true;
  },

  /* ---- THE MUTE (Gate B stand-down, part 2). The generated set is too
     bright for the world, so every piece the composer serves is passed
     through a uniform OKLab transform — lightness down, chroma down, hue
     nudged toward the muted world greens — and RE-QUANTIZED to the
     documented ramps (leaf for foliage, wood/soil/bone for the rest), so
     an authored tree ends strictly on the world's own colours. Strength
     is LAND.TREE_MUTE (0 raw … 1 strong), on the bench; the transform
     lives HERE, in the installer — the frozen master files are never
     touched. `trees` holds the raw decoded pieces; the composer reads
     the muted cache, rebuilt whenever the dial moves. ---- */
  _muteK: -1, _treesMuted: {},
  _muteRamps() {
    const AP = ART.PALETTE;
    return { leaf: AP.leaf.slice(),
      warm: [AP.wood[1], AP.wood[2], AP.wood[3], AP.soil[1], AP.soil[2], AP.soil[3], AP.bone[1], AP.bone[2]],
      // the deposit and fruit targets: ore grey for slab rock, the gold
      // ramp for veins and nuggets, the berry reds for fruit — so every
      // piece family ends on its own documented world ramp
      grey: AP.ore.slice(), gold: AP.gold.slice(),
      red: [AP.berry[0], AP.berry[1], AP.berry[2], AP.red[3]] };
  },
  _muteCanvas(src, k, ramps) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0);
    if (k <= 0) return c;
    const s2l = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const l2s = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    const lab = (r, g2, b2) => {
      r = s2l(r / 255); g2 = s2l(g2 / 255); b2 = s2l(b2 / 255);
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g2 + 0.0514459929 * b2);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g2 + 0.1073969566 * b2);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g2 + 0.6299787005 * b2);
      return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
    };
    const hex2lab = h => lab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
    const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const mk = key => ({ L: ramps[key].map(hex2lab), C: ramps[key].map(hex2rgb) });
    const sets = { leaf: mk('leaf'), warm: mk('warm'), grey: mk('grey'), gold: mk('gold'), red: mk('red') };
    // the world's green: the middle of the leaf ramp, where hue is nudged toward
    const mid = sets.leaf.L[2] || sets.leaf.L[0];
    const hTarget = Math.atan2(mid[2], mid[1]);
    try {
      const d = g.getImageData(0, 0, c.width, c.height);
      for (let o = 0; o < d.data.length; o += 4) {
        if (!d.data[o + 3]) continue;
        let [L, A, B] = lab(d.data[o], d.data[o + 1], d.data[o + 2]);
        const C = Math.hypot(A, B);
        let h = Math.atan2(B, A);
        L *= 1 - 0.16 * k;                       // lightness down
        const C2 = C * (1 - 0.35 * k);           // chroma down
        /* WHICH WORLD RAMP a pixel belongs to, by where it lives in OKLab:
           near-neutral is slab rock (the ore greys); bright saturated
           yellow is gold before green can claim it; magenta-to-red is
           fruit; the green range is foliage (hue-nudged toward the world's
           leaf); everything warm left over is trunk, soil and cut face. */
        const fam = (C < 0.032 && L > 0.42) ? 'grey'
          : (h > 1.05 && h < 1.85 && C > 0.11 && L > 0.5) ? 'gold'
          : (h > -0.6 && h < 0.75 && C > 0.10) ? 'red'
          : (h > 1.5 && h < 3.1) ? 'leaf' : 'warm';
        if (fam === 'leaf') { let dh = hTarget - h; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI; h += dh * 0.5 * k; }
        A = C2 * Math.cos(h); B = C2 * Math.sin(h);
        const set = sets[fam].L, cols = sets[fam].C;
        let bi = 0, bd = 1e9;
        for (let i = 0; i < set.length; i++) {
          const dd = (L - set[i][0]) ** 2 + (A - set[i][1]) ** 2 * 0.6 + (B - set[i][2]) ** 2 * 0.6;
          if (dd < bd) { bd = dd; bi = i; }
        }
        d.data[o] = cols[bi][0]; d.data[o + 1] = cols[bi][1]; d.data[o + 2] = cols[bi][2];
      }
      g.putImageData(d, 0, 0);
    } catch (e) { /* tainted on file:// — the raw piece stands */ }
    return c;
  },
  _remute() {
    const k = (typeof LAND !== 'undefined' && typeof LAND.TREE_MUTE === 'number') ? LAND.TREE_MUTE : 0;
    const ramps = this._muteRamps();
    this._treesMuted = {};
    for (const key of Object.keys(this.trees)) {
      this._treesMuted[key] = this.trees[key].map((c, i) => {
        const m = this._muteCanvas(c, k, ramps);
        // FRUIT IS FAT AND BRIGHT (the referee's live report, and the same
        // lesson the procedural orchard learned once already): the 2:1
        // downscale left one-pixel fruit and the mute sank it to the ramp's
        // darkest crimson — invisible at play zoom, so the fertile ground
        // read as plain trees. Repaint the fruit after the mute.
        if (key.startsWith('orchard-') || key.startsWith('berry-'))
          this._fruitPass(m, key, i);
        return m;
      });
    }
    this._muteK = k; this._muteRev = this.treesRev;
  },
  /* find what fruit survived, fatten every cluster to a 2x2 with a lit
     corner, and guarantee a minimum count by planting more on the crown —
     deterministic per piece, so recomposes and repaints always agree. */
  _fruitPass(c, key, idx) {
    const AP = ART.PALETTE;
    const body = AP.berry[1], lit = AP.berry[2];
    const g = c.getContext('2d');
    let d;
    try { d = g.getImageData(0, 0, c.width, c.height); } catch (e) { return; }
    const W = c.width, H = c.height, px = d.data;
    /* TRUE CRIMSON ONLY (the referee's red-trunk report): warm trunk bark
       also keeps red above green, but never this far — without the green
       cap the old rule matched brown bark and studded orchard trunks with
       fat fruit. Real fruit reds hold green under 60% of red. */
    const reddish = o => px[o + 3] > 0 && px[o] > px[o + 1] + 20 && px[o] > px[o + 2] + 10 &&
      px[o + 1] < px[o] * 0.6;
    const greenish = o => px[o + 3] > 0 && px[o + 1] > px[o] + 10 && px[o + 1] > px[o + 2] + 10;
    const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    /* TRUNK SCRUB (orchard pieces): red below the crown line is not fruit —
       it is generator noise on the trunk, and the mute keeps it red. Repaint
       each such pixel with its commonest clean neighbour so the trunk reads
       bark again; the crown-line rule matches the top-up planter's own. */
    if (key.startsWith('orchard-')) {
      const line = (H * 0.72) | 0;
      const marked = [], mark = new Uint8Array(W * H);
      for (let y = line; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (reddish(o)) { marked.push([x, y]); mark[y * W + x] = 1; }
      }
      const woodC = hex(AP.wood[2]);
      for (const [x, y] of marked) {
        const tally = {};
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || mark[ny * W + nx]) continue;
          const o = (ny * W + nx) * 4;
          if (!px[o + 3] || reddish(o)) continue;
          const k2 = px[o] + ',' + px[o + 1] + ',' + px[o + 2];
          tally[k2] = (tally[k2] || 0) + 1;
        }
        const top = Object.entries(tally).sort((a, b2) => b2[1] - a[1])[0];
        const col = top ? top[0].split(',').map(Number) : woodC;
        const o = (y * W + x) * 4;
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
      }
    }
    // clusters of surviving fruit (any reddish pixel not adjacent to an
    // already-claimed one), plus the crown pixels fruit could sit on
    const spots = [], crown = [];
    const claimed = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (greenish(o)) crown.push(y * W + x);
      if (!reddish(o) || claimed[y * W + x]) continue;
      spots.push([x, y]);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) claimed[ny * W + nx] = 1;
      }
    }
    // …topped up from the crown to the piece's minimum, spaced apart
    const want = key.startsWith('orchard-l') ? 5 : 3;
    let h = (Math.imul(idx + 3, 0x9E3779B1) ^ key.length * 2654435761) >>> 0;
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return (h >>> 0) / 4294967296; };
    let guard = 0;
    while (spots.length < want && crown.length && guard++ < 60) {
      const k2 = crown[(rnd() * crown.length) | 0];
      const x = k2 % W, y = (k2 / W) | 0;
      if (y > H * 0.68) continue;                        // fruit hangs in the crown, not the trunk
                                                         // (under the scrub line even after the 2x2 fatten)
      if (spots.some(s => Math.abs(s[0] - x) + Math.abs(s[1] - y) < 4)) continue;
      spots.push([x, y]);
    }
    const put = (x, y, w2, col) => { for (let oy = 0; oy < w2; oy++) for (let ox = 0; ox < w2; ox++) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const o = (ny * W + nx) * 4;
      if (!px[o + 3]) continue;                          // fruit never floats off the silhouette
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2];
    } };
    const bodyC = hex(body), litC = hex(lit);
    for (const [x, y] of spots) {
      put(x - 1, y - 1, 2, bodyC);
      put(x - 1, y - 1, 1, litC);                        // the lit corner sells the sphere
    }
    g.putImageData(d, 0, 0);
  },
  _muted(key) {
    const k = (typeof LAND !== 'undefined' && typeof LAND.TREE_MUTE === 'number') ? LAND.TREE_MUTE : 0;
    // stale on a dial move OR any catalog change — a cleared catalog must
    // never keep serving its old muted pieces from this cache
    if (k !== this._muteK || this._muteRev !== this.treesRev) this._remute();
    return this._treesMuted[key];
  },
  /* the composer's pick: a piece for this kind at this radius, or null.
     rr under 7 reaches for the small tier, either tier stands in for a
     missing other, and h picks the letter and mirror deterministically.
     THE SPECIES COLLAPSE (Gate B rule): a TREE kind the catalog lacks is
     served from the dome set instead — a stand never mixes art trees
     with procedural trees of another species; the species mix becomes a
     variant and size mix. Ground accents (stump, snag, log) never
     collapse: a missing stump must not sprout a whole tree. */
  treePiece(kind, rr, h) {
    let style = kind === 'round' ? 'dome' : kind;
    if ((style === 'conifer' || style === 'oak' || style === 'birch')
      && !this.trees[style + '-l'] && !this.trees[style + '-s']) style = 'dome';
    // rr >= 8, not 7: the l stamp sits at the very top of the procedural
    // 9-22px distribution, so it stays the OCCASIONAL big tree (the Gate B
    // stand-down's scale audit — most slots take the small)
    const a = this._muted(style + '-' + (rr >= 8 ? 'l' : 's'))
      || this._muted(style + '-' + (rr >= 8 ? 's' : 'l'));
    if (!a || !a.length) return null;
    return a[(h >>> 0) % a.length];
  },
  /* the ELDER: the xl dome, reserved for the rare character tiles — the
     only slot that may draw it, and never served by treePiece above. */
  treeXl(h) {
    const a = this._muted('dome-xl');
    return a && a.length ? a[(h >>> 0) % a.length] : null;
  },

  /* ---- FORMATION ART: multi-tile drawn pieces over terrain REGIONS ----

       assets/terrain/formations/{terrain}/{terrain}-{W}x{H}-{shape}-{letter}.png
       e.g.  assets/terrain/formations/mountain/mountain-4x3-ridge-a.png

     The per-tile override above scales ONE texture to ONE tile; a landform
     spanning 6x5 tiles needs the opposite primitive — hand-drawn PIECES
     packed over whole regions (js/formations.js owns regions, the solver
     and drawing; ART_PLAN.md has the authoring rules). All lowercase.
     {W}x{H} is the ground footprint in tiles; image width MUST equal
     W * FORMATION_PX, image height MAY exceed H * FORMATION_PX — the
     excess is upward overhang (peaks rising north of the footprint), and
     the bottom edge is the baseline. Optional sidecar {same-name}.json
     with offsetX/offsetY (footprint fractions) and scale — the building
     sidecar's exact shape.

     DISCOVERY is a known stem list per terrain (FORMATION_CATALOG below —
     a list of filenames in code, not a manifest of metadata: everything
     else is derived from the name and the pixels). A 404 = piece absent,
     never an error; a partial catalog covers what it can and procedural
     art fills the rest. Same ?v= cache-buster as everything.

     THE COVERAGE MASK IS DERIVED FROM THE ALPHA CHANNEL, never
     hand-authored: on decode the bottom H*FORMATION_PX band is downsampled
     to a WxH grid and a cell counts as covered when its mean alpha
     coverage exceeds FORMATION_MASK_MIN — so an L-shaped or tapered massif
     packs as its real shape, not its bounding rectangle. On file:// the
     pixels are unreadable (canvas taint); the mask degrades to the full
     rectangle there, which only ever OVER-claims ground — dev drops use
     object URLs and keep real masks. */
  FORMATION_DIR: 'assets/terrain/formations/',
  FORMATION_PX: 128,
  FORMATION_MASK_MIN: 0.35,
  // the known stem list per terrain directory. Empty until the hand-authored
  // catalog lands — preview unlisted pieces live via the ?dev=1 workbench.
  FORMATION_CATALOG: {
    mountain: [],
  },
  formationStemRe: /^([a-z]+)-(\d+)x(\d+)-([a-z0-9]+)-([a-z])$/,
  formationTerrains() { return Object.keys(this.FORMATION_CATALOG); },
  formationName(stem) { return String(stem).toLowerCase() + '.png'; },
  formationUrl(tName, stem) {
    return this.FORMATION_DIR + tName + '/' + this.formationName(stem) + '?v=' + (CFG.ART_V || 1);
  },
  formationSlotKey(tName, stem) { return 'fm|' + tName + '|' + stem; },
  // parse a stem into {tName, tId, w, h, shape, letter} — null if malformed,
  // if the terrain is not a real T member, or if the stem's terrain does not
  // match the directory it claims to live in
  parseFormationStem(stem, tName) {
    const m = this.formationStemRe.exec(String(stem).toLowerCase());
    if (!m) return null;
    if (tName && m[1] !== tName) return null;
    const tId = T[m[1].toUpperCase()];
    if (tId === undefined) return null;
    const w = +m[2], h = +m[3];
    // 24 tiles is the ceiling — room for a range that spans half an xlarge
    // map; anything past it is a typo, not a mountain
    if (!(w >= 1 && h >= 1 && w <= 24 && h <= 24)) return null;
    return { tName: m[1], tId, w, h, shape: m[4], letter: m[5] };
  },
  _tryLoadFormation(tName, stem) {
    const img = new Image();
    img.onload = async () => {
      let meta = null;
      if (location.protocol !== 'file:') try {
        const r = await fetch(this.FORMATION_DIR + tName + '/' + stem + '.json?v=' + (CFG.ART_V || 1));
        if (r.ok) meta = await r.json();
      } catch (e) { /* no sidecar — defaults */ }
      if (window.DevArt && DevArt.overrides && DevArt.overrides[this.formationSlotKey(tName, stem)]) return;
      this.setFormationArt(tName, stem, img, meta);
    };
    img.onerror = () => { this.art[this.formationSlotKey(tName, stem)] = null; };
    img.src = this.formationUrl(tName, stem);
  },
  /* ---- WILDERNESS RELIC ART (js/relics.js): the formation conventions
     pointed at a DECOR directory ----

       assets/features/relic/relic-{W}x{H}-{key}-{letter}.png

     The stem carries the footprint exactly as a formation's does, the same
     128 art-px-per-tile rule applies, and the same ?v= cache-buster rides
     the URL. The footprint in the name must MATCH the relic def's own
     (placement used the def; art that disagrees is refused with one plain
     warning and the procedural placeholder keeps standing). A relic is
     decor by definition: its alpha is a silhouette, never a passability —
     the blocked set is EMPTY and nothing here can touch a map array. */
  RELIC_DIR: 'assets/features/relic/',
  relicArt: {},
  relicKeys() { return window.Relics ? Object.keys(Relics.DEFS) : []; },
  relicStem(key) {
    const d = window.Relics && Relics.DEFS[key];
    return d ? ('relic-' + d.w + 'x' + d.h + '-' + key + '-a') : null;
  },
  relicSlotKey(key) { return 'rl|' + key; },
  relicUrl(key) { return this.RELIC_DIR + this.relicStem(key) + '.png?v=' + (CFG.ART_V || 1); },
  _tryLoadRelic(key) {
    const img = new Image();
    const k = this.relicSlotKey(key);
    img.onload = () => {
      if (window.DevArt && DevArt.overrides && DevArt.overrides[k]) return;
      this.setRelicArt(key, img);
    };
    img.onerror = () => { this.art[k] = null; };
    img.src = this.relicUrl(key);
  },
  setRelicArt(key, img) {
    const d = window.Relics && Relics.DEFS[key];
    if (!d || !img) return false;
    if (img.width !== d.w * this.FORMATION_PX) {
      if (!this._relicWarned) this._relicWarned = {};
      if (!this._relicWarned[key]) {
        this._relicWarned[key] = 1;
        console.warn('[relic art] ' + key + ': width ' + img.width + ' ≠ footprint ' +
          d.w + '×128 = ' + (d.w * this.FORMATION_PX) + ' — refused, placeholder stands');
      }
      return false;
    }
    this.relicArt[key] = img;
    const k = this.relicSlotKey(key);
    this.art[k] = img;
    this.loaded[k] = true;
    return true;
  },
  removeRelicArt(key) {
    delete this.relicArt[key];
    const k = this.relicSlotKey(key);
    delete this.art[k]; delete this.loaded[k];
  },

  /* ================= UNIT SHEETS: the CHARACTER-CLASS art path =================
     (tests/animal-art.mjs.) The first PNG pipeline for things that MOVE.
     Animals are the test case before villagers get the same treatment
     (ART_PLAN's reference doctrine): 8 directions, real frame counts, and
     a fidelity bar ABOVE the procedural cast — that mismatch is intentional.

     One file per (kind, direction, pose), a HORIZONTAL STRIP of square
     frames — frame size = strip height, frame count = width/height:

       assets/units/unit-{kind}-{dir}-{pose}.png     dir ∈ s,se,e,ne,n,nw,w,sw

     Frames install into Assets.unitArt[kind].dirs[dir][pose] as sliced
     canvases; R.unitSprite prefers them (facing from R.unitFacing) and
     falls back per-LOOKUP to the procedural sheet, so a kind with only a
     south walk shipped still animates every other way it always did.
     Character sprites carry NO ground stain, plate or baked shadow — the
     renderer's own contact pass draws that. A non-integer strip width is
     refused with one plain warning and the procedural look stands. */
  UNIT_DIR: 'assets/units/',
  UNIT_DIRS8: ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'],
  // kinds and the poses each may ship — probed at boot, 404s are the norm.
  // 'idle' is each species' standing life: the deer and cow graze, the boar
  // roots, the wolf scents the air (fight borrows walk via R.sheetFrames)
  UNIT_ART: { deer: ['walk', 'idle'], wolf: ['walk', 'idle'], boar: ['walk', 'idle'], cow: ['walk', 'idle'],
              bear: ['walk', 'idle', 'fight'],     // the bear carries the roster's first real fight sheet
              /* the UNDYED hulls. Deliberately here and not MILITARY_ART:
                 no plank of these boats wears a village colour, so one
                 neutral sheet serves every owner — including the Sea
                 Folk, whose 'R'-owned longboats ARE this transport (an
                 accepted, flagged consequence: their hull matches yours;
                 their plumed crew pips and red bar still read apart).
                 'idle' is a derived at-anchor bob composed from the walk,
                 not a generated sheet; 'gather' is the fishing haul. */
              fishboat: ['walk', 'idle', 'gather'],
              transport: ['walk', 'idle'],
              fireship: ['walk', 'idle', 'fight'] },
  /* the DRAW BOX per kind, in world px — default CFG.TILE (32). A bigger
     animal is a draw-box question, not a canvas question (ART_PLAN): the
     bear ships 96px frames into a 48px box, the same exact 2:1 native
     density as the rest of the cast, just a genuinely bigger animal on
     the map. Operator-approved before the bear was built. */
  /* the working hulls draw at 48 like the bear — a cog or a bombard ship
     alongside a 32px fishing boat is a genuinely bigger vessel, same 2:1
     density (96px frames). The fishboat STAYS 32: players raise dozens,
     and a fleet of fat hulls would swallow every harbor. The WHOLE siege
     train and the cavalry ride the big box too — the operator's ruling,
     twice: an engine should stand ship-sized, and a horse and rider
     must never read as a midget on a pony beside their own footmen. */
  UNIT_BOX: { bear: 48, transport: 48, fireship: 48, bombard: 48,
              trebuchet: 48, siegetower: 48, catapult: 48, ballista: 48,
              rider: 48, horsearcher: 48, lancer: 48 },
  /* ---- VILLAGER TIERS (phase 1 plumbing; the art arrives in phase 2) ----
     Appearance tier by Town Center level — a TABLE, deliberately, so tiers
     can lag or lead the TC later without touching the resolver. */
  VILLAGER_TIER_BY_TC: { 1: 1, 2: 2, 3: 3 },
  VILLAGER_POSES: ['idle', 'walk', 'gather', 'mine', 'farm', 'build', 'guard', 'pick', 'reach'],
  /* THE RECOLOR KEY RAMP. Hand-authored villager sheets are authored
     NEUTRAL, wearing the blue tunic's exact two-color ramp — and at load
     time those two colors (and only those) are swapped to the faction's
     rolled tunic ramp. Designated palette indices, not a mask layer and
     not per-color pre-bakes: zero extra files, one lossless pass per
     canvas, memoized per faction exactly like Sprites.militaryFor.
     HARD AUTHORING CONSTRAINT (ART_PLAN): these two hex values may
     appear NOWHERE in a villager frame except the tunic itself — never
     on skin, hair, tools or shadow — and the tunic must wear this same
     ramp in every master, or the recolor reads differently per tier. */
  TUNIC_KEY: { body: '#3f6d99', accent: '#2c4e70' },
  recolorTunic(canvas, tunic) {
    // typeof, never window.: Sprites is a script-level const (the trap
    // setUnitFrames below already documents — window.Sprites is undefined)
    const t = typeof Sprites !== 'undefined' && Sprites.tunicCol && Sprites.tunicCol[tunic];
    if (!t || tunic === 'blue') return canvas;         // blue IS the key — nothing to swap
    const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const kb = hx(this.TUNIC_KEY.body), ka = hx(this.TUNIC_KEY.accent);
    const nb = hx(t.body), na = hx(t.accent);
    const g = canvas.getContext('2d');
    let d;
    try { d = g.getImageData(0, 0, canvas.width, canvas.height); }
    catch (e) { return canvas; }                       // tainted (file://) — recolor is a no-op there
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      if (p[i] === kb[0] && p[i + 1] === kb[1] && p[i + 2] === kb[2]) { p[i] = nb[0]; p[i + 1] = nb[1]; p[i + 2] = nb[2]; }
      else if (p[i] === ka[0] && p[i + 1] === ka[1] && p[i + 2] === ka[2]) { p[i] = na[0]; p[i + 1] = na[1]; p[i + 2] = na[2]; }
    }
    g.putImageData(d, 0, 0);
    return canvas;
  },
  /* fetch one faction's tier art: NEUTRAL files on disk
     (unit-villager-l{tier}-{m|f}-{dir}-{pose}.png), installed under the
     faction's own key (villager-{p|a}-l{tier}-{m|f}) with the tunic ramp
     swapped to the faction's rolled color. Called when the tunics are
     known (new game / load) and again when a Town Center levels up. A
     missing file is the default state — the procedural villager stands. */
  loadVillagerArt(owner) {
    // typeof guards — G is a script-level const (window.G is undefined)
    if (!window.R || typeof G === 'undefined') return;
    const tier = R.villagerTier(owner);
    const fac = owner === 'A' ? 'a' : 'p';
    const tunic = G.tunicOf(owner);
    for (const sex of ['m', 'f']) for (const dir of this.UNIT_DIRS8) for (const pose of this.VILLAGER_POSES) {
      // the tunic rides IN the key (matching R.unitArtKey): a new run's
      // fresh tunic can never be served last run's baked colors, and an
      // install still in flight from the old run lands under the old key
      const key = 'villager-' + fac + '-' + tunic + '-l' + tier + '-' + sex;
      if (this.unitArt[key] && this.unitArt[key].dirs[dir] && this.unitArt[key].dirs[dir][pose]) continue;
      const img = new Image();
      img.onload = () => { this.setUnitFrames(key, dir, pose, img, tunic); };
      img.onerror = () => {};
      img.src = this.UNIT_DIR + 'unit-villager-l' + tier + '-' + sex + '-' + dir + '-' + pose +
        '.png?v=' + (CFG.ART_V || 1);
    }
  },
  /* ---- MILITARY SHEET ART (the archer line ships first) ----
     Same recolor law as the villagers: files on disk are NEUTRAL
     (unit-{kind}-{dir}-{pose}.png wearing the blue key ramp), installed
     under a faction key ({kind}-{p|a}-{tunic}) with the tunic swapped
     exactly once at install. Kinds listed here must NEVER also appear in
     UNIT_ART: the boot probe would install un-recolored frames under the
     plain kind slot, and sheetFrames' kind-level fallback would then
     serve blue-keyed art to BOTH factions whenever a faction install was
     still in flight — friend and foe would stop reading apart. */
  MILITARY_ART: { archer:   ['idle', 'walk', 'fight'],
                  longbow:  ['idle', 'walk', 'fight'],
                  marksman: ['idle', 'walk', 'fight'],
                  defender: ['idle', 'walk', 'fight'],
                  axeman:   ['idle', 'walk', 'fight'],
                  elite:    ['idle', 'walk', 'fight'],
                  // the one dyed hull: the bombard ship flies its village's
                  // colours on the stern banner (the ONLY keyed region)
                  bombard:  ['idle', 'walk', 'fight'],
                  /* the siege train: wooden machines with a keyed pennant
                     (the only dyed region — a captured-looking engine is a
                     friend/foe bug). No idle sheets on purpose: a machine
                     that stops simply HOLDS its walk frame 0 (the
                     stationary-borrow rule in R.sheetFrames); only water
                     needed a bob. The siege tower never attacks, so it
                     ships no fight sheet either. */
                  catapult:   ['walk', 'fight'],
                  ballista:   ['walk', 'fight'],
                  trebuchet:  ['walk', 'fight'],
                  siegetower: ['walk'],
                  // the stable: horse and rider dye through the saddle
                  // cloth and tunic, same key ramp as the foot soldiers
                  rider:       ['idle', 'walk', 'fight'],
                  horsearcher: ['idle', 'walk', 'fight'],
                  lancer:      ['idle', 'walk', 'fight'] },
  loadMilitaryArt(owner) {
    // typeof guards — G is a script-level const (window.G is undefined)
    if (!window.R || typeof G === 'undefined') return;
    const fac = owner === 'A' ? 'a' : 'p';
    const tunic = G.tunicOf(owner);
    for (const kind in this.MILITARY_ART) for (const dir of this.UNIT_DIRS8) for (const pose of this.MILITARY_ART[kind]) {
      // the tunic rides IN the key, same anti-staleness armor as the
      // villager loader above: a new run's rolled color can never be
      // served frames baked for last run's
      const key = kind + '-' + fac + '-' + tunic;
      if (this.unitArt[key] && this.unitArt[key].dirs[dir] && this.unitArt[key].dirs[dir][pose]) continue;
      const img = new Image();
      img.onload = () => { this.setUnitFrames(key, dir, pose, img, tunic); };
      img.onerror = () => {};                  // absent art is the default state
      img.src = this.UNIT_DIR + 'unit-' + kind + '-' + dir + '-' + pose + '.png?v=' + (CFG.ART_V || 1);
    }
  },
  /* ---- SAPPER TIER ART: villager doctrine, camp-leveled, no sex axis ----
     Neutral files unit-sapper-l{tier}-{dir}-{pose}.png install under
     sapper-{p|a}-{tunic}-l{tier}. The four terraform crafts ship the four
     CARDINAL directions only — the sim always stands a working sapper on
     a 4-edge neighbor facing straight at its tile — while walk/idle ship
     all eight. Called beside the other loaders and again when a Sappers'
     Camp finishes an upgrade. */
  SAPPER_POSE_DIRS: { idle: ['s','se','e','ne','n','nw','w','sw'],
                      walk: ['s','se','e','ne','n','nw','w','sw'],
                      dig: ['s','e','n','w'], bridge: ['s','e','n','w'],
                      clear: ['s','e','n','w'], mound: ['s','e','n','w'] },
  loadSapperArt(owner) {
    if (!window.R || typeof G === 'undefined') return;
    const tier = R.sapperTier(owner);
    const fac = owner === 'A' ? 'a' : 'p';
    const tunic = G.tunicOf(owner);
    const key = 'sapper-' + fac + '-' + tunic + '-l' + tier;
    for (const pose in this.SAPPER_POSE_DIRS) for (const dir of this.SAPPER_POSE_DIRS[pose]) {
      if (this.unitArt[key] && this.unitArt[key].dirs[dir] && this.unitArt[key].dirs[dir][pose]) continue;
      const img = new Image();
      img.onload = () => { this.setUnitFrames(key, dir, pose, img, tunic); };
      img.onerror = () => {};                  // absent art is the default state
      img.src = this.UNIT_DIR + 'unit-sapper-l' + tier + '-' + dir + '-' + pose + '.png?v=' + (CFG.ART_V || 1);
    }
  },
  unitArt: {},
  unitStem(kind, dir, pose) { return 'unit-' + kind + '-' + dir + '-' + pose; },
  unitUrl(kind, dir, pose) {
    return this.UNIT_DIR + this.unitStem(kind, dir, pose) + '.png?v=' + (CFG.ART_V || 1);
  },
  _tryLoadUnit(kind, dir, pose) {
    const img = new Image();
    img.onload = () => { this.setUnitFrames(kind, dir, pose, img); };
    img.onerror = () => {};                    // absent art is the default state
    img.src = this.unitUrl(kind, dir, pose);
  },
  setUnitFrames(kind, dir, pose, img, tunic) {
    if (!img || !img.height) return false;
    const fh = img.height, n = Math.floor(img.width / fh);
    if (n < 1 || img.width !== n * fh) {
      if (!this._unitWarned) this._unitWarned = {};
      const wk = kind + '|' + dir + '|' + pose;
      if (!this._unitWarned[wk]) {
        this._unitWarned[wk] = 1;
        console.warn('[unit art] ' + wk + ': strip ' + img.width + '×' + fh +
          ' is not a whole number of square frames — refused, procedural stands');
      }
      return false;
    }
    const frames = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas');
      c.width = fh; c.height = fh;
      c.getContext('2d').drawImage(img, i * fh, 0, fh, fh, 0, 0, fh, fh);
      // villager variants bake their faction's tunic at install — once,
      // here, and never again (the recolor-exactly-once rule)
      frames.push(tunic ? this.recolorTunic(c, tunic) : c);
    }
    const ua = this.unitArt[kind] || (this.unitArt[kind] = { dirs: {} });
    const d = ua.dirs[dir] || (ua.dirs[dir] = {});
    d[pose] = frames;
    /* playback rate: a full walk cycle takes ~0.9s REGARDLESS of how many
       frames it ships — more frames buy smoothness, never slow motion.
       Derived once from the south walk strip so every direction agrees.
       VILLAGERS RUN AT HALF THAT (the referee's live-play ruling: "everyone
       looks like they're on speed") — one uniform 1.8s cycle across every
       tier, sex and pose. Animals and military keep the 0.9s clock. */
    // Sprites is a script-level const — `window.Sprites` is undefined (the
    // same trap G, AI and MapGen carry); typeof is the safe guard
    if (pose === 'walk' && dir === 's' && typeof Sprites !== 'undefined' && Sprites.animFps)
      Sprites.animFps[kind] = Math.max(4, Math.round(n / (kind.startsWith('villager-') ? 1.8 : 0.9)));
    return true;
  },
  removeUnitArt(kind) { delete this.unitArt[kind]; },

  /* mean alpha coverage of each footprint cell, as fractions 0..1 —
     the ?dev=1 workbench reports these in plain words. Null on a taint
     error (file://), where the pixels cannot be read. */
  formationCoverage(img, w, h) {
    try {
      const S2 = 16;                       // samples per cell side
      const c = document.createElement('canvas');
      c.width = w * S2; c.height = h * S2;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = true;      // averaging IS the point here
      const bandH = Math.min(img.height, h * this.FORMATION_PX);
      g.drawImage(img, 0, img.height - bandH, img.width, bandH,
        0, (h * S2) * (1 - bandH / (h * this.FORMATION_PX)), w * S2, (h * S2) * (bandH / (h * this.FORMATION_PX)));
      const d = g.getImageData(0, 0, w * S2, h * S2).data;
      const fr = new Float32Array(w * h);
      for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
        let sum = 0;
        for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++)
          sum += d[((cy * S2 + y) * w * S2 + cx * S2 + x) * 4 + 3];
        fr[cy * w + cx] = sum / (S2 * S2 * 255);
      }
      return fr;
    } catch (e) {
      return null;
    }
  },
  /* downsample the footprint band of the alpha channel to a WxH coverage
     grid. Mean alpha per cell against FORMATION_MASK_MIN; a taint error
     (file://) falls back to the full rectangle. */
  deriveFormationMask(img, w, h) {
    const mask = new Uint8Array(w * h);
    const fr = this.formationCoverage(img, w, h);
    if (!fr) { mask.fill(1); return mask; }   // file:// taint — full-rect claim
    for (let i = 0; i < w * h; i++) if (fr[i] >= this.FORMATION_MASK_MIN) mask[i] = 1;
    return mask;
  },
  /* install one piece — startup and the ?dev=1 drop both land HERE. Returns
     false (with a one-shot warning) for a malformed stem or a width that
     does not match the declared footprint: a wrong-width piece would scale
     to the wrong number of tiles and lie about the ground it stands on. */
  setFormationArt(tName, stem, img, meta) {
    if (!window.Formations) return false;
    stem = String(stem).toLowerCase();
    const p = this.parseFormationStem(stem, null);
    if (!p || (p.tName !== String(tName).toLowerCase())) return false;
    if (!img || img.width !== p.w * this.FORMATION_PX) {
      const k = 'fmw:' + stem;
      if (!this._fmWarned) this._fmWarned = {};
      if (!this._fmWarned[k]) {
        this._fmWarned[k] = 1;
        console.warn('Formation piece ' + stem + ': width ' + (img && img.width) +
          ' != ' + (p.w * this.FORMATION_PX) + ' (' + p.w + ' tiles x ' + this.FORMATION_PX + 'px) — refused');
      }
      return false;
    }
    const mask = this.deriveFormationMask(img, p.w, p.h);
    const maskCells = [];
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++)
      if (mask[dy * p.w + dx]) maskCells.push([dx, dy]);
    if (!maskCells.length) return false;   // fully transparent footprint
    Formations.addPiece({
      t: p.tId, stem, w: p.w, h: p.h, shape: p.shape, letter: p.letter,
      img, mask, maskCells, maskN: maskCells.length,
      sidecar: meta ? {
        ox: isFinite(+meta.offsetX) ? +meta.offsetX : 0,
        oy: isFinite(+meta.offsetY) ? +meta.offsetY : 0,
        scale: (isFinite(+meta.scale) && +meta.scale > 0) ? +meta.scale : 1,
      } : null,
      _strip: null,
    });
    const k = this.formationSlotKey(p.tName, stem);
    this.art[k] = img;
    this.loaded[k] = true;
    return true;
  },
  removeFormationArt(tName, stem) {
    if (!window.Formations) return false;
    const p = this.parseFormationStem(stem, String(tName).toLowerCase());
    if (!p) return false;
    const k = this.formationSlotKey(p.tName, stem);
    delete this.art[k];
    delete this.loaded[k];
    return Formations.removePiece(p.tId, String(stem).toLowerCase());
  },
  formationPiece(tName, stem) {
    const p = this.parseFormationStem(stem, String(tName).toLowerCase());
    if (!p || !window.Formations) return null;
    const c = Formations.catalogs[p.tId];
    return (c && c[String(stem).toLowerCase()]) || null;
  },

  artIds() { return Object.keys(CFG.BUILDINGS).filter(k => this.EXCLUDE.indexOf(k) < 0); },
  artSlots() {
    const out = [];
    for (const id of this.artIds())
      for (let lv = 1; lv <= CFG.BUILDINGS[id].levels.length; lv++) out.push({ id, lv });
    return out;
  },
  slotKey(id, lv) { return id + '-l' + lv; },
  // the canonical filename — ALWAYS lowercase; Pages serves case-sensitively
  artName(id, lv) { return (String(id) + '-l' + lv + '.png').toLowerCase(); },
  artUrl(id, lv) { return this.ART_DIR + this.artName(id, lv) + '?v=' + (CFG.ART_V || 1); },

  async init() {
    for (const s of this.artSlots()) this._tryLoad(s.id, s.lv);
    for (const tribe of this.campTribes()) {
      this._tryLoadCamp(tribe);
      for (let i = 1; i <= this.CAMP_PROP_N; i++) this._tryLoadCampProp(tribe, i);
    }
    for (const w of this.wonderKeys()) this._tryLoadWonder(w);
    for (const k of this.relicKeys()) this._tryLoadRelic(k);
    for (const kind of Object.keys(this.UNIT_ART))
      for (const dir of this.UNIT_DIRS8)
        for (const pose of this.UNIT_ART[kind]) this._tryLoadUnit(kind, dir, pose);
    for (const outcome of this.ENDGAME_OUTCOMES)
      for (const mode of this.endgameModes()) this._tryEndgame(outcome, mode, 1);
    for (const key of Object.keys(this.PROPS)) this._tryProp(key, this.PROPS[key]);
    for (const m of this.originMotifs()) this._tryLoadOrigin(m);
    for (const tName of this.formationTerrains())
      for (const stem of this.FORMATION_CATALOG[tName]) this._tryLoadFormation(tName, stem);
    for (const k of Object.keys(T)) this._tryTerrain(T[k], 1);
    for (const tName of this.COVER_CATALOG)
      for (const slot of this.COVER_SLOTS) this._tryCover(tName, slot, 1);
    this._tryFish(1);
    this._tryWaterFx();
    this._tryTrees();
    this._tryMtnKit();
    this.ready = true;
    return { ok: true, data: { slots: this.artSlots().length + this.campTribes().length } };
  },

  /* probe one ground slot; on a hit, install it and reach for the next
     variant. The cascade is what keeps a bare repo at one request per
     terrain instead of TERRAIN_MAX of them. */
  _tryTerrain(t, n) {
    const name = this.terrainName(t);
    if (!name || n > this.TERRAIN_MAX) return;
    const img = new Image();
    img.onload = () => {
      this.setTerrainArt(t, img);
      this._tryTerrain(t, n + 1);
    };
    img.onerror = () => { /* no art at this slot — the procedural tile stands */ };
    img.src = this.terrainUrl(name, n);
  },

  /* install ground art. The map is baked into R.terrainCache, so a PNG that
     decodes after the world was built has to ask for a repaint or it will
     not show until something else happens to dirty a tile. */
  setTerrainArt(t, img) {
    const a = this.terrain[t] || (this.terrain[t] = []);
    if (a.indexOf(img) < 0) a.push(img);
    this.loaded['terrain/' + this.terrainName(t)] = true;
    if (window.R && typeof R.rebuildTerrain === 'function') R.rebuildTerrain();
    return true;
  },

  _tryLoad(id, lv) {
    const img = new Image();
    img.onload = async () => {
      // the sidecar is fetched only for art that actually exists — and only
      // over http(s): on file:// the Fetch API rejects the scheme outright
      // (and logs a console error per attempt), so defaults apply there
      let meta = null;
      if (location.protocol !== 'file:') try {
        const r = await fetch(this.ART_DIR + this.slotKey(id, lv) + '.json?v=' + (CFG.ART_V || 1));
        if (r.ok) meta = await r.json();
      } catch (e) { /* no sidecar — defaults */ }
      // a ?dev=1 drop that landed while this was still in flight wins —
      // a startup load must never clobber the artist's live preview
      if (window.DevArt && DevArt.overrides && DevArt.overrides[this.slotKey(id, lv)]) return;
      this.setBuildingArt(id, lv, img, meta);
    };
    img.onerror = () => { this.art[this.slotKey(id, lv)] = null; };
    img.src = this.artUrl(id, lv);
  },

  _tryProp(key, url) {
    const img = new Image();
    img.onload = () => { if (this._place(key, img)) this.loaded[key] = true; };
    img.onerror = () => { /* no art for this prop — its procedural fallback stands */ };
    img.src = url + '?v=' + (CFG.ART_V || 1);
  },

  /* install a PNG into a building slot — startup and the ?dev=1 preview both
     land HERE, one code path. The _cfArt marker is what routes the drawable
     through R.blitBld's shared anchoring rule (and darkOf/ruinOf carry it
     onto their burn variants). */
  setBuildingArt(id, lv, img, meta) {
    const fam = Sprites.building[id], famA = Sprites.buildingA[id];
    if (!fam || !famA || lv < 1 || lv > fam.length) return false;
    img._cfArt = {
      ox: (meta && isFinite(+meta.offsetX)) ? +meta.offsetX : 0,
      oy: (meta && isFinite(+meta.offsetY)) ? +meta.offsetY : 0,
      scale: (meta && isFinite(+meta.scale) && +meta.scale > 0) ? +meta.scale : 1,
    };
    fam[lv - 1] = img;
    famA[lv - 1] = img;
    const k = this.slotKey(id, lv);
    this.art[k] = img;
    this.loaded[k] = true;
    return true;
  },

  /* ---- key grammar → a slot in the Sprites tables ----
     Returns { get(), set(v) } for a valid key, or null. Addresses the
     procedural tables (misc work-site art, ui/card motifs, terrain, units);
     building art now arrives via the filename convention above instead. */
  _slot(key) {
    const p = String(key).split('/');
    const at = (obj, prop) => obj && obj[prop] !== undefined
      ? { get: () => obj[prop], set: v => { obj[prop] = v; } } : null;
    switch (p[0]) {
      case 'building':   return at((Sprites.building[p[1]] || {}), +p[2] - 1);
      case 'building_a': return at((Sprites.buildingA[p[1]] || {}), +p[2] - 1);
      case 'wall':       return at((Sprites.wallMask[+p[1] - 1] || {}), +p[2]);
      case 'gate':       return at((Sprites.gateMask[+p[1] - 1] || {}), p[2] === 'v' ? 1 : 0);
      case 'unit':       return at(((Sprites.unit[p[1]] || {})[p[2]] || {}), +p[3]);
      case 'terrain': {
        const t = T[String(p[1]).toUpperCase()];
        return t === undefined ? null : at((Sprites.terrain[t] || {}), +p[2]);
      }
      case 'terrain_rare': {
        const t = T[String(p[1]).toUpperCase()];
        return t === undefined ? null : at((Sprites.terrainRare[t] || {}), +p[2]);
      }
      case 'icon':       return at(Sprites.icons, p[1]);
      case 'ui': {
        // ui/card/<cardKey> — Origin Card art. No procedural slot backs
        // these: the draft screen falls back to Cards.drawMotif until real
        // art lands here.
        if (p[1] !== 'card' || !p[2] || !window.Cards || !Cards.DEFS[p[2]]) return null;
        const o = this.ui.card;
        return { get: () => o[p[2]], set: v => { o[p[2]] = v; } };
      }
      case 'misc':       return p.length > 2
        ? at((Sprites.misc[p[1]] || {}), +p[2])   // animated misc: misc/kraken/0
        : at(Sprites.misc, p[1]);
      default:           return null;
    }
  },

  _place(key, drawable) {
    const slot = this._slot(key);
    if (!slot) return false;
    slot.set(drawable);
    return true;
  },

  // the current drawable for a key — image if one loaded, procedural otherwise
  resolve(key) {
    const slot = this._slot(key);
    return slot ? slot.get() : null;
  },

  isImage(key) { return !!this.loaded[key]; },

  drawSprite(g, key, x, y, opts) {
    const spr = this.resolve(key);
    if (!spr) return false;
    opts = opts || {};
    const w = opts.w || spr.width, h = opts.h || spr.height;
    if (opts.alpha !== undefined) {
      const a = g.globalAlpha;
      g.globalAlpha = opts.alpha;
      g.drawImage(spr, x, y, w, h);
      g.globalAlpha = a;
    } else g.drawImage(spr, x, y, w, h);
    return true;
  },
};

// classic-script global: guards elsewhere test window.Assets
window.Assets = Assets;
