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
     and a fleet of fat hulls would swallow every harbor. The TALL siege
     engines (a trebuchet's throwing beam, a belfry tower) take the big
     box too; the squat catapult and ballista read fine at 32. */
  UNIT_BOX: { bear: 48, transport: 48, fireship: 48, bombard: 48,
              trebuchet: 48, siegetower: 48 },
  /* ---- VILLAGER TIERS (phase 1 plumbing; the art arrives in phase 2) ----
     Appearance tier by Town Center level — a TABLE, deliberately, so tiers
     can lag or lead the TC later without touching the resolver. */
  VILLAGER_TIER_BY_TC: { 1: 1, 2: 2, 3: 3 },
  VILLAGER_POSES: ['idle', 'walk', 'gather', 'mine', 'farm', 'build', 'guard'],
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
       Derived once from the south walk strip so every direction agrees. */
    // Sprites is a script-level const — `window.Sprites` is undefined (the
    // same trap G, AI and MapGen carry); typeof is the safe guard
    if (pose === 'walk' && dir === 's' && typeof Sprites !== 'undefined' && Sprites.animFps)
      Sprites.animFps[kind] = Math.max(4, Math.round(n / 0.9));
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
