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
  // standalone PROPS — composited sprites that are not a building's own
  // rectangle. One fixed URL per prop key; same swap-in rules as buildings.
  PROPS: { 'misc/campfireTc': 'assets/misc/campfire-tc.png' },

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
    for (const tribe of this.campTribes()) this._tryLoadCamp(tribe);
    for (const key of Object.keys(this.PROPS)) this._tryProp(key, this.PROPS[key]);
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
