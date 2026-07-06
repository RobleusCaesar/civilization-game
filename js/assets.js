"use strict";
/* Assets — the image-asset pipeline (see ASSET_SPEC.md for the key grammar
   and manifest format).

   The game is fully playable with zero image files: every sprite is drawn
   procedurally by sprites.js/artstyle.js at boot. This module lets real
   pixel-art PNGs replace any subset of those sprites, one key at a time:

     manifest (assets/manifest.js) ──► atlas PNGs ──► ImageBitmap slices
                                                          │
                          Sprites.* tables ◄── overlay ───┘

   Loaded slices are written into the same Sprites tables the renderer
   already reads, so image art and procedural art coexist per key with no
   render changes and no behavior change. A key missing from the manifest —
   or an atlas that fails to load — simply keeps its procedural drawable.

   Forward-facing draw API (new render code should prefer this):
     Assets.drawSprite(g, key, x, y, opts) — draws the current drawable for
     a key (image if loaded, procedural otherwise). opts: { w, h, alpha }. */

const Assets = {
  ready: false,      // init finished (with or without image assets)
  loaded: {},        // key -> true where an image replaced the procedural art
  failed: [],        // atlas/sprite load problems, for diagnostics

  async init() {
    const man = (typeof window !== 'undefined' && window.ASSET_MANIFEST) || null;
    if (man && Array.isArray(man.atlases)) {
      for (const atlas of man.atlases) {
        try { await this._loadAtlas(atlas); }
        catch (e) { this.failed.push({ image: atlas.image, error: String(e && e.message || e) }); }
      }
    }
    this.ready = true;
    // terrain is pre-baked into a full-map cache at newGame — if any terrain
    // art arrived after that bake, repaint the cache in place (camera, fog
    // and gameplay untouched)
    if (Object.keys(this.loaded).some(k => k.startsWith('terrain')) &&
        window.R && R.terrainCache && window.S) {
      for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) R.drawTileAt(x, y);
    }
    return { ok: true, data: { loaded: Object.keys(this.loaded).length, failed: this.failed.length } };
  },

  async _loadAtlas(atlas) {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('image failed to load: ' + atlas.image));
      i.src = atlas.image;
    });
    for (const key of Object.keys(atlas.sprites || {})) {
      const r = atlas.sprites[key];
      try {
        // one pre-decoded bitmap per sprite: cheap to blit, no atlas math at draw time
        const bmp = await createImageBitmap(img, r.x, r.y, r.w, r.h);
        if (this._place(key, bmp)) this.loaded[key] = true;
        else this.failed.push({ key, error: 'key does not match any sprite slot' });
      } catch (e) {
        this.failed.push({ key, error: String(e && e.message || e) });
      }
    }
  },

  /* ---- key grammar → a slot in the Sprites tables ----
     Returns { get(), set(v) } for a valid key, or null. See ASSET_SPEC.md. */
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
