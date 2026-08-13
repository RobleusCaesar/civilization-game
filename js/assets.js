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
  /* what the convention does NOT cover, and why (ART_PLAN.md): walls and
     gates tile from 16-mask atlases (one rectangle cannot be a curtain);
     the wonder's art is per-monument, rolled per run (one PNG would stamp
     all ten); a raider camp's look belongs to its PEOPLE (Sprites.camp by
     tribe, five looks for one building id). */
  EXCLUDE: ['wall', 'gate', 'wonder', 'raidercamp'],
  // standalone PROPS — composited sprites that are not a building's own
  // rectangle. One fixed URL per prop key; same swap-in rules as buildings.
  PROPS: { 'misc/campfireTc': 'assets/misc/campfire-tc.png' },

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
    for (const key of Object.keys(this.PROPS)) this._tryProp(key, this.PROPS[key]);
    this.ready = true;
    return { ok: true, data: { slots: this.artSlots().length } };
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
