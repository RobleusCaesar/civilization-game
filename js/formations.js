"use strict";
/* FORMATIONS — multi-tile drawn artwork placed over contiguous same-terrain
   regions (ART_PLAN.md has the full convention). The per-tile override
   (assets/terrain/{name}.png) scales one texture to one tile; a landform
   spanning 6x5 tiles needs the opposite primitive: one region, several
   hand-drawn PIECES, packed to cover it. This module is that primitive —
   generic over terrain; mountains are the first consumer.

   PURELY VISUAL, BY CONSTRUCTION. Nothing here writes to any map array:
   regions are read from S.map.seenTerrain (the player's memory — so an
   unexplored massif places no art at all), placements are derived, never
   persisted, and the solver is seeded from (S.seed, region signature) so a
   map renders the same formations on every reload and after save/load.
   tests/land.mjs §17 pins the invariance; tests/mountain.mjs still pins the
   mountain rules independently.

   THE PIPELINE
     Assets.setFormationArt (js/assets.js — filename convention, sidecars,
     the ?dev=1 drop path) installs pieces here via addPiece; each piece
     carries a COVERAGE MASK derived from its own alpha channel (never
     hand-authored), so an L-shaped massif packs as an L. Regions come from
     R.floodTrace — the same flood the coast and the mountains use. The
     solver greedily packs largest-first with a seeded tie-shuffle,
     anti-repetition, and skirt pieces preferred at the region's edge; a
     region it cannot fully cover falls back per policy: 'tile' (default —
     art covers what it can, leftover tiles keep their tile sprite) or
     'region' (all-or-nothing — right for mountains, whose procedural form
     is ONE extruded object that cannot mix with pieces).

   TWO CONSUMERS
     · the generic layer: R.draw blits each region's composed canvas right
       after the terrain cache — above the ground, below bridges, buildings,
       units and fog. Upward overhang is capped at FORM.OVERHANG_MAX tiles.
     · mountains: R.buildMtnLayer asks mtnRegionStrips() for row strips cut
       from the SAME solved placements, so formation mountains keep the
       shipped occlusion (a unit behind a ridge is hidden by it) — see the
       strip interleave in R.draw. Uncapped overhang: strips occlude
       honestly, that is their whole point.

   INVALIDATION rides the existing repaint paths: R.drawTileAt/drawTilesAt
   call noteTile after any tile repaint; a membership change (terrain edit,
   fog reveal) marks that terrain dirty and only regions whose SIGNATURE
   changed re-solve — cached solutions are keyed by signature, so an edit in
   one region never re-shuffles another. */

const FORM = {
  PIECE_PX: 128,        // master pixels per footprint tile (authoring density)
  MASK_MIN: 0.35,       // alpha coverage fraction for a mask cell to count
  OVERHANG_MAX: 1.5,    // tiles of upward overhang the GENERIC layer draws
  SOLVE_ATTEMPTS: 20000, // fit tests per region before the soft-fail
};

const Formations = {
  /* terrain id -> { stem -> piece }. A piece:
     { t, stem, w, h, shape, letter, img, mask: Uint8Array(w*h),
       maskCells: [[dx,dy],…], maskN, sidecar: {ox,oy,scale}|null }
     Installed only by Assets.setFormationArt / the ?dev=1 drop. */
  catalogs: {},
  // fallback policy when a region cannot be fully covered (see header)
  policy: {},
  // shapes that read as a region's soft edge — preferred on boundary tiles
  SKIRTS: { skirt: 1, talus: 1, scree: 1, taper: 1, edge: 1 },

  _mask: null,          // Uint8 W*H — catalog-terrain membership snapshot
  _dirty: {},           // terrain id -> true: regions need re-flooding
  _regions: {},         // terrain id -> [region, …]
  _solutions: new Map(),// 't:sig' -> solution (survives unrelated edits)
  _canvases: new Map(), // 't:sig' -> {c, x, y} — generic-layer region canvas
  _warned: {},

  /* ---- catalog ---- */
  any() {
    for (const t in this.catalogs) if (this.artTerrain(+t)) return true;
    return false;
  },
  artTerrain(t) {
    const c = this.catalogs[t];
    if (!c) return false;
    for (const k in c) if (c[k].img) return true;
    return false;
  },
  piecesFor(t) {
    const c = this.catalogs[t], out = [];
    if (c) for (const k of Object.keys(c).sort()) if (c[k].img && c[k].maskN) out.push(c[k]);
    return out;
  },
  addPiece(piece) {
    (this.catalogs[piece.t] = this.catalogs[piece.t] || {})[piece.stem] = piece;
    this.invalidate(piece.t);
  },
  removePiece(t, stem) {
    const c = this.catalogs[t];
    if (!c || !c[stem]) return false;
    delete c[stem];
    this.invalidate(t);
    return true;
  },

  /* a catalog change invalidates everything derived for that terrain: the
     membership mask (it only tracks terrains WITH catalogs), the regions,
     and — because a solution depends on which pieces exist — every cached
     solution and canvas for that terrain. Mountains also stand their strip
     layer down so the next frame recuts it. */
  invalidate(t) {
    this._dirty[t] = true;
    this._mask = null;
    for (const key of [...this._solutions.keys()]) if (key.startsWith(t + ':')) this._solutions.delete(key);
    for (const key of [...this._canvases.keys()]) if (key.startsWith(t + ':')) this._canvases.delete(key);
    for (const stem in (this.catalogs[t] || {})) this.catalogs[t][stem]._strip = null;
    if (t === T.MOUNTAIN && window.R) { R._mtnLayerKey = ''; R._mtnDirty = true; }
  },

  onNewGame() {
    this._mask = null;
    this._dirty = {};
    this._regions = {};
    this._solutions = new Map();
    this._canvases = new Map();
  },
  /* iOS purged our canvases along with the terrain cache — drop and rebuild
     lazily. Placements are data and survive; only pixels are lost. */
  reviveArt() {
    this._canvases = new Map();
    for (const t in this.catalogs)
      for (const stem in this.catalogs[t]) this.catalogs[t][stem]._strip = null;
  },

  /* ---- change tracking (called from R.drawTileAt / R.drawTilesAt) ---- */
  _ensureMask() {
    const n = CFG.W * CFG.H;
    if (this._mask && this._mask.length === n) return this._mask;
    const terr = S.map.seenTerrain || S.map.terrain;
    const m = this._mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = this.catalogs[terr[i]] ? terr[i] : 255;
    return m;
  },
  noteTile(x, y) {
    if (!S || !S.map || x < 0 || y < 0 || x >= CFG.W || y >= CFG.H) return;
    const m = this._ensureMask(), i = y * CFG.W + x;
    const terr = S.map.seenTerrain || S.map.terrain;
    const now = this.catalogs[terr[i]] ? terr[i] : 255;
    if (m[i] === now) return;
    if (m[i] !== 255) this._dirty[m[i]] = true;
    if (now !== 255) this._dirty[now] = true;
    m[i] = now;
  },

  /* ---- regions ---- */
  regionSig(cells, t) {
    const sorted = cells.slice().sort((a, b) => a - b);
    let h = (0x811c9dc5 ^ Math.imul(t + 1, 0x9e3779b1) ^ CFG.W) >>> 0;
    for (const k of sorted) { h ^= k; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  },
  _augment(cells, t) {
    const W = CFG.W;
    const set = new Set(cells), boundary = new Set();
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const k of cells) {
      const cx = k % W, cy = (k / W) | 0;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      if (cx === 0 || !set.has(k - 1) || cx === W - 1 || !set.has(k + 1) ||
          cy === 0 || !set.has(k - W) || !set.has(k + W)) boundary.add(k);
    }
    return {
      t, cells, set, boundary, box: [x0, y0, x1, y1],
      area: cells.length, interiorN: cells.length - boundary.size,
      ratio: (x1 - x0 + 1) / Math.max(1, (y1 - y0 + 1)),
      sig: this.regionSig(cells, t),
    };
  },
  regionsFor(t) {
    if (!this._dirty[t] && this._regions[t]) return this._regions[t];
    delete this._dirty[t];
    const W = CFG.W, H = CFG.H, terr = S.map.seenTerrain || S.map.terrain;
    const pred = (x, y) => x >= 0 && y >= 0 && x < W && y < H && terr[y * W + x] === t;
    const raw = (window.R && R.floodTrace) ? R.floodTrace(pred) : [];
    return this._regions[t] = raw.map(r => this._augment(r.cells, t));
  },
  // the mountain layer already flooded its own regions — wrap those cells
  // rather than flooding twice; the signature makes the two views agree
  regionFromCells(cells, t) { return this._augment(cells, t); },

  /* ---- the placement solver ---- */
  _rng(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let z = Math.imul(a ^ (a >>> 15), 1 | a);
      z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  },
  solveSeed(region) {
    const land = (window.R && R.landSeed) ? R.landSeed() : 0;
    return (land ^ region.sig ^ Math.imul(region.t + 1, 0x85ebca6b)) | 0;
  },

  solve(region) {
    const key = region.t + ':' + region.sig;
    const hit = this._solutions.get(key);
    if (hit) return hit;
    const t0 = performance.now();
    const W = CFG.W;
    const rnd = this._rng(this.solveSeed(region));
    const pieces = this.piecesFor(region.t);
    const uncovered = new Set(region.cells);
    const placedAt = new Map();          // cell -> stem, for anti-repetition
    const placements = [];
    let attempts = 0, bailed = false;

    const fits = (p, tx, ty) => {
      attempts++;
      for (const [dx, dy] of p.maskCells) {
        const k = (ty + dy) * W + tx + dx;
        if (!region.set.has(k) || !uncovered.has(k)) return false;
      }
      return true;
    };
    const adjSame = (p, tx, ty) => {
      for (const [dx, dy] of p.maskCells) {
        const x = tx + dx, y = ty + dy;
        if (placedAt.get(y * W + x - 1) === p.stem || placedAt.get(y * W + x + 1) === p.stem ||
            placedAt.get((y - 1) * W + x) === p.stem || placedAt.get((y + 1) * W + x) === p.stem) return true;
      }
      return false;
    };
    const touchesInterior = (p, tx, ty) => {
      for (const [dx, dy] of p.maskCells)
        if (!region.boundary.has((ty + dy) * W + tx + dx)) return true;
      return false;
    };
    const place = (p, tx, ty) => {
      for (const [dx, dy] of p.maskCells) {
        const k = (ty + dy) * W + tx + dx;
        uncovered.delete(k);
        placedAt.set(k, p.stem);
      }
      placements.push({ stem: p.stem, piece: p, tx, ty });
    };
    /* one sweep of one pass group: anchors row-major over the bbox; at each
       anchor the LARGEST fitting size wins, and among that size's fitting
       variants a seeded pick prefers one not identical to a neighbour. The
       rnd sequence depends only on region + catalog, so the same seed packs
       the same pieces on every reload. */
    const sweep = (group, needInterior) => {
      if (!group.length) return;
      const sizes = [...new Set(group.map(p => p.maskN))].sort((a, b) => b - a);
      for (let ty = region.box[1]; ty <= region.box[3] && !bailed; ty++) {
        for (let tx = region.box[0]; tx <= region.box[2] && !bailed; tx++) {
          if (!uncovered.has(ty * W + tx)) continue;
          for (const size of sizes) {
            if (attempts > FORM.SOLVE_ATTEMPTS) { bailed = true; break; }
            const cands = [];
            for (const p of group) {
              if (p.maskN !== size) continue;
              if (tx + p.w - 1 > region.box[2] || ty + p.h - 1 > region.box[3]) continue;
              if (!fits(p, tx, ty)) continue;
              if (needInterior && region.interiorN > 0 && !touchesInterior(p, tx, ty)) continue;
              cands.push(p);
            }
            if (!cands.length) continue;
            const fresh = cands.filter(p => !adjSame(p, tx, ty));
            const pool = fresh.length ? fresh : cands;
            place(pool[(rnd() * pool.length) | 0], tx, ty);
            break;
          }
        }
      }
    };

    const big = pieces.filter(p => p.maskN >= 2 && !this.SKIRTS[p.shape]);
    const skirts = pieces.filter(p => p.maskN >= 2 && this.SKIRTS[p.shape]);
    const ones = pieces.filter(p => p.maskN === 1);
    sweep(big, true);      // the mass: multi-tile pieces reaching the interior
    sweep(big, false);     // …then let them take pure-boundary ground too
    sweep(skirts, false);  // the edge tapers into the grass
    sweep(ones, false);    // leftover single tiles and thin necks

    if (bailed && !this._warned['solve:' + key]) {
      this._warned['solve:' + key] = 1;
      console.warn('Formations: solver bailed at ' + attempts + ' attempts for terrain ' +
        region.t + ' region ' + region.sig.toString(16) + ' — ' + uncovered.size +
        ' tiles fall back to procedural');
    }
    placements.sort((a, b) =>
      (a.ty + a.piece.h) - (b.ty + b.piece.h) || a.tx - b.tx || (a.stem < b.stem ? -1 : 1));
    const covered = new Set();
    for (const k of region.cells) if (!uncovered.has(k)) covered.add(k);
    const sol = {
      placements, covered, holes: [...uncovered].sort((a, b) => a - b),
      fallback: (this.policy[region.t] === 'region') && uncovered.size > 0,
      solveMs: performance.now() - t0,
    };
    this._solutions.set(key, sol);
    return sol;
  },

  /* ---- drawing ---- */
  /* one placed piece into a 2d context whose origin is at world (ox, oy).
     Bottom-center anchored on its footprint, scaled so PIECE_PX maps to the
     tile, aspect preserved; sidecar offsets are footprint fractions and its
     scale multiplies the fit — the building sidecar's exact semantics. */
  drawPieceInto(g2, pl, ox, oy, capOverhang) {
    const TL = CFG.TILE, p = pl.piece, img = p.img;
    const side = p.sidecar || null;
    const sc = (TL / FORM.PIECE_PX) * ((side && side.scale > 0) ? side.scale : 1);
    let sh = img.height, sy = 0;
    if (capOverhang) {
      const maxSrcH = (p.h + FORM.OVERHANG_MAX) * FORM.PIECE_PX;
      if (sh > maxSrcH) { sy = sh - maxSrcH; sh = maxSrcH; }
    }
    const dw = img.width * sc, dh = sh * sc;
    const dx = pl.tx * TL - ox + (side ? side.ox * p.w * TL : 0) + (p.w * TL - dw) / 2;
    const dy = (pl.ty + p.h) * TL - oy - dh + (side ? side.oy * p.h * TL : 0);
    g2.imageSmoothingEnabled = false;
    g2.drawImage(img, 0, sy, img.width, sh, dx, dy, dw, dh);
  },

  regionCanvas(region, sol) {
    const key = region.t + ':' + region.sig;
    const hit = this._canvases.get(key);
    if (hit) return hit;
    const TL = CFG.TILE;
    const pad = Math.ceil(FORM.OVERHANG_MAX * TL);
    const [x0, y0, x1, y1] = region.box;
    const c = document.createElement('canvas');
    c.width = (x1 - x0 + 1) * TL;
    c.height = (y1 - y0 + 1) * TL + pad;
    const g2 = c.getContext('2d');
    const ox = x0 * TL, oy = y0 * TL - pad;
    for (const pl of sol.placements) this.drawPieceInto(g2, pl, ox, oy, true);
    const rec = { c, x: ox, y: oy };
    this._canvases.set(key, rec);
    return rec;
  },

  /* the generic layer — called from R.draw right after the terrain cache
     blit. With no catalogs installed this is one property walk per frame. */
  drawLayer(g) {
    if (!this.any()) return;
    const TL = CFG.TILE;
    const L = R.cam.x - TL, Rt = R.cam.x + R.viewW() / R.cam.z + TL;
    const Tp = R.cam.y - TL * (FORM.OVERHANG_MAX + 1), Bm = R.cam.y + R.viewH() / R.cam.z + TL;
    for (const tKey in this.catalogs) {
      const t = +tKey;
      if (t === T.MOUNTAIN) continue;            // mountains ride the strip layer
      if (!this.artTerrain(t)) continue;
      for (const region of this.regionsFor(t)) {
        const sol = this.solve(region);
        if (!sol.placements.length || sol.fallback) continue;
        const rec = this.regionCanvas(region, sol);
        if (rec.x > Rt || rec.x + rec.c.width < L || rec.y > Bm || rec.y + rec.c.height < Tp) continue;
        g.drawImage(rec.c, rec.x, rec.y);
      }
    }
  },

  /* the mountain consumer — R.buildMtnLayer hands each of ITS regions here;
     a full formation cover returns row strips for the unit-pass interleave
     (row = the piece's bottom footprint row, exactly the outcrop's rule),
     anything less returns null and the procedural extrusion stands. */
  mtnRegionStrips(r) {
    const t = T.MOUNTAIN;
    if (!this.artTerrain(t)) return null;
    const region = this.regionFromCells(r.cells, t);
    const sol = this.solve(region);
    if (!sol.placements.length || sol.holes.length) return null;
    const TL = CFG.TILE;
    const strips = [];
    for (const pl of sol.placements) {
      const c = this._pieceStrip(pl.piece);
      if (!c) return null;
      strips.push({
        row: pl.ty + pl.piece.h - 1,
        x: pl.tx * TL + c._dx,
        y: (pl.ty + pl.piece.h) * TL - c.height + c._dy,
        c,
      });
    }
    return { strips, cover: new Set(r.cells), kind: 'formation' };
  },
  // a piece pre-scaled to tile resolution, cached — strips blit dozens of
  // times a frame and must never rescale the 128px master each time
  _pieceStrip(p) {
    if (p._strip) return p._strip;
    if (!p.img || !p.img.width) return null;
    const TL = CFG.TILE;
    const side = p.sidecar || null;
    const sc = (TL / FORM.PIECE_PX) * ((side && side.scale > 0) ? side.scale : 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(p.img.width * sc));
    c.height = Math.max(1, Math.round(p.img.height * sc));
    const g2 = c.getContext('2d');
    g2.imageSmoothingEnabled = false;
    g2.drawImage(p.img, 0, 0, c.width, c.height);
    c._dx = (side ? side.ox * p.w * TL : 0) + (p.w * TL - c.width) / 2;
    c._dy = side ? side.oy * p.h * TL : 0;
    return p._strip = c;
  },
};

// mountains are one extruded object procedurally — pieces cannot mix with it
Formations.policy[T.MOUNTAIN] = 'region';

// classic-script global: guards elsewhere test window.Formations
window.Formations = Formations;
