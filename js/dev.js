"use strict";
/* DevArt — the ?dev=1 drag-and-drop art preview (workflow: ART_PLAN.md).

   Without ?dev=1 in the query string this file does NOTHING: no listeners,
   no DOM, no state, zero player-facing change. With it, PNGs dropped
   anywhere on the game window are read as in-memory object URLs and
   injected into the live art cache through Assets.setBuildingArt — the
   exact code path startup art takes, so the preview is byte-for-byte what
   ships. Nothing uploads, nothing writes to disk; a refresh clears it all.

   Slot inference: a file named to the {id}-l{level}.png convention takes
   its slot silently (case is normalized — the canonical name is always
   lowercase). Anything else gets a picker listing every valid slot; the
   tool never guesses and never silently overwrites. Multi-drop injects the
   whole set (pickers queue one at a time). */
(() => {
  const on = /[?&]dev=1(?:&|$)/.test(location.search);

  const DevArt = window.DevArt = {
    on,
    overrides: {},   // slot key -> dropped filename (what the panel lists)
    _saved: {},      // slot key -> { p, a } — the SHIPPED drawables, for revert

    /* ---- the formation workbench ----
       maskOverlay: draw the derived per-cell coverage grid over placed
       pieces (render.js consults it behind the DevArt.on gate).
       formationPin: {terrain, stem} — R.buildMtnLayer pins that piece onto
       the LARGEST region, solver be damned, so a big piece is viewable on a
       map whose regions are all small.
       _formInfo: stem -> plain-words contract report, rendered in the panel
       (never the console — the artist is on a phone). */
    maskOverlay: false,
    formationPin: null,
    _formInfo: {},

    // filename -> {kind:'building', id, lv} or {kind:'camp', tribe} per the
    // two conventions, or null (case-insensitive in, canonical lowercase out
    // — Pages is case-sensitive, people are not)
    parseName(name) {
      const lower = String(name).toLowerCase();
      // the PROP pattern first — the plain camp match would eat it otherwise
      const mp = lower.match(/^camp-([a-z0-9]+)-prop([0-9])\.png$/);
      if (mp) return (Assets.campTribes().indexOf(mp[1]) < 0 || +mp[2] < 1 || +mp[2] > Assets.CAMP_PROP_N)
        ? null : { kind: 'campProp', tribe: mp[1], i: +mp[2] };
      const mc = lower.match(/^camp-([a-z0-9]+)\.png$/);
      if (mc) return Assets.campTribes().indexOf(mc[1]) < 0 ? null : { kind: 'camp', tribe: mc[1] };
      // wonder art: one PNG per monument (wonder-{key}.png), same deal as camps
      const mw = lower.match(/^wonder-([a-z0-9]+)\.png$/);
      if (mw) return Assets.wonderKeys().indexOf(mw[1]) < 0 ? null : { kind: 'wonder', wkey: mw[1] };
      // relic decor: relic-{W}x{H}-{key}-{letter}.png — the footprint in the
      // name must match the relic def's own, or the drop is refused outright
      const mr = lower.match(/^relic-(\d+)x(\d+)-([a-z0-9]+)-([a-z])\.png$/);
      if (mr) {
        const d = window.Relics && Relics.DEFS[mr[3]];
        return (d && d.w === +mr[1] && d.h === +mr[2]) ? { kind: 'relic', rkey: mr[3] } : null;
      }
      // formation pieces: {terrain}-{W}x{H}-{shape}-{letter}.png — validated
      // by the same parser the loader uses; the stem needs no catalog entry,
      // so an artist can preview a brand-new piece before it is listed
      if (/^[a-z]+-\d+x\d+-[a-z0-9]+-[a-z]\.png$/.test(lower)) {
        const stem = lower.slice(0, -4);
        const pf = Assets.parseFormationStem(stem, null);
        return pf ? { kind: 'formation', terrain: pf.tName, stem } : null;
      }
      // terrain cover: {terrain}-{wild|kept|accent}[-N].png ships under
      // assets/terrain/cover/{terrain}/{slot}[-N].png — the drop carries the
      // terrain in its name because a basename has no directory
      const mv = lower.match(/^([a-z]+)-(wild|kept|accent)(?:-\d+)?\.png$/);
      if (mv) return Assets.COVER_CATALOG.indexOf(mv[1]) < 0 ? null
        : { kind: 'cover', tName: mv[1], slot: mv[2] };
      const m = lower.match(/^([a-z0-9]+)-l(\d+)\.png$/);
      if (!m) return null;
      const id = m[1], lv = +m[2];
      if (Assets.artIds().indexOf(id) < 0) return null;
      if (lv < 1 || lv > CFG.BUILDINGS[id].levels.length) return null;
      return { kind: 'building', id, lv };
    },
    canonicalName(id, lv) { return Assets.artName(id, lv); },

    inject(id, lv, img, name) {
      const k = Assets.slotKey(id, lv);
      if (!this._saved[k])
        this._saved[k] = { p: Sprites.building[id][lv - 1], a: Sprites.buildingA[id][lv - 1],
                           art: Assets.art[k], loaded: !!Assets.loaded[k] };
      if (!Assets.setBuildingArt(id, lv, img, null)) return false;
      this.overrides[k] = name || this.canonicalName(id, lv);
      this._renderPanel();
      return true;
    },
    // a camp's slot is one PNG for the whole people, not an {id,lv} pair —
    // same shipping path (Assets.setCampArt), same override/revert bookkeeping
    injectCamp(tribe, img, name) {
      const k = Assets.campSlotKey(tribe);
      if (!this._saved[k])
        this._saved[k] = { spr: Sprites.camp[tribe], art: Assets.art[k], loaded: !!Assets.loaded[k] };
      if (!Assets.setCampArt(tribe, img, null)) return false;
      this.overrides[k] = name || Assets.campName(tribe);
      this._renderPanel();
      return true;
    },
    // one prop of one people's dressing — same shipping path
    // (Assets.setCampPropArt), same override/revert bookkeeping
    injectCampProp(tribe, i, img, name) {
      const k = Assets.campPropSlotKey(tribe, i);
      if (!this._saved[k])
        this._saved[k] = { prop: (Assets.campProps[tribe] || {})[i],
                           art: Assets.art[k], loaded: !!Assets.loaded[k] };
      if (!Assets.setCampPropArt(tribe, i, img)) return false;
      this.overrides[k] = name || Assets.campPropName(tribe, i);
      this._renderPanel();
      return true;
    },
    // one formation piece — same shipping path (Assets.setFormationArt, so
    // a relic's slot is one PNG per Relics.DEFS key — same shipping path
    // (Assets.setRelicArt), same override/revert bookkeeping
    injectRelic(rkey, img, name) {
      const k = Assets.relicSlotKey(rkey);
      if (!this._saved[k])
        this._saved[k] = { art: Assets.relicArt[rkey], slot: Assets.art[k], loaded: !!Assets.loaded[k] };
      if (!Assets.setRelicArt(rkey, img)) return false;
      this.overrides[k] = name || (Assets.relicStem(rkey) + '.png');
      this._renderPanel();
      return true;
    },
    // one terrain-cover slot — same shipping path (Assets.setCoverArt), same
    // override/revert bookkeeping. A drop REPLACES the slot's whole frame set
    // (an artist previewing wants their file, not their file appended to the
    // shipped one); revert restores whatever the startup cascade had loaded.
    injectCover(tName, slot, img, name) {
      const k = Assets.coverSlotKey(tName, slot);
      const prior = { arr: (Assets.cover[tName] || {})[slot] || null, loaded: !!Assets.loaded[k] };
      if (Assets.cover[tName]) Assets.cover[tName][slot] = [];
      if (!Assets.setCoverArt(tName, slot, img)) {
        // refused (wrong grid) — put the shipped frames back untouched
        if (prior.arr && Assets.cover[tName]) Assets.cover[tName][slot] = prior.arr;
        return false;
      }
      if (!this._saved[k]) this._saved[k] = prior;
      this.overrides[k] = name || (tName + '-' + slot + '.png');
      this._renderPanel();
      return true;
    },
    // a monument's slot is one PNG per CFG.WONDERS key — same shipping path
    // (Assets.setWonderArt), same override/revert bookkeeping as a camp's
    injectWonder(wkey, img, name) {
      const k = Assets.wonderSlotKey(wkey);
      if (!this._saved[k])
        this._saved[k] = { spr: Sprites.wonders[wkey], art: Assets.art[k], loaded: !!Assets.loaded[k] };
      if (!Assets.setWonderArt(wkey, img, null)) return false;
      this.overrides[k] = name || Assets.wonderArtName(wkey);
      this._renderPanel();
      return true;
    },
    // the drop derives its coverage mask from the alpha exactly as a shipped
    // file would), same override/revert bookkeeping. Every drop leaves a
    // plain-words contract report in the panel, accepted or refused.
    injectFormation(terrain, stem, img, name) {
      const k = Assets.formationSlotKey(terrain, stem);
      const prior = { piece: Assets.formationPiece(terrain, stem),
                      art: Assets.art[k], loaded: !!Assets.loaded[k] };
      const ok = Assets.setFormationArt(terrain, stem, img, null);
      this._formInfo[stem] = this._formationReport(terrain, stem, img, ok);
      if (!ok) { this._renderPanel(); return false; }
      if (!this._saved[k]) this._saved[k] = prior;
      this.overrides[k] = name || Assets.formationName(stem);
      this._renderPanel();
      return true;
    },
    /* the contract, in plain words: what the filename promises vs what the
       pixels deliver. Width must equal W*FORMATION_PX; every footprint cell
       should carry at least FORMATION_MASK_MIN mean alpha or its tile shows
       bare ground under the art. */
    _formationReport(terrain, stem, img, accepted) {
      const pf = Assets.parseFormationStem(stem, terrain);
      if (!pf) return 'refused — the name does not match {terrain}-{W}x{H}-{shape}-{letter}.png';
      const wantW = pf.w * Assets.FORMATION_PX;
      if (!img || img.width !== wantW)
        return 'refused — image is ' + (img && img.width) + 'px wide but the name says ' +
          pf.w + ' tile' + (pf.w > 1 ? 's' : '') + ' (' + pf.w + '×' + Assets.FORMATION_PX + ' = ' + wantW + 'px)';
      const min = Assets.FORMATION_MASK_MIN;
      const fr = Assets.formationCoverage(img, pf.w, pf.h);
      const over = Math.max(0, img.height - pf.h * Assets.FORMATION_PX);
      const overNote = over ? ' · +' + (over / Assets.FORMATION_PX).toFixed(1) + ' tiles of peak overhang' : '';
      if (!fr) return (accepted ? '' : 'refused — ') + img.width + '×' + img.height +
        ' — pixels unreadable here (file://), mask assumed the full ' + pf.w + '×' + pf.h + overNote;
      const low = [];
      let covered = 0;
      for (let cy = 0; cy < pf.h; cy++) for (let cx = 0; cx < pf.w; cx++) {
        const f = fr[cy * pf.w + cx];
        if (f >= min) covered++;
        else low.push('(col ' + (cx + 1) + ', row ' + (cy + 1) + ') ' + Math.round(f * 100) + '%');
      }
      if (!accepted)
        return 'refused — the footprint band is effectively empty: best cell ' +
          Math.round(Math.max(0, ...fr) * 100) + '% painted, needs ' + Math.round(min * 100) + '%';
      if (!low.length)
        return '✓ ' + img.width + '×' + img.height + ' — mask covers all ' +
          (pf.w * pf.h) + ' cells (footprint ' + pf.w + '×' + pf.h + ')' + overNote;
      return '⚠ mask ' + covered + '/' + (pf.w * pf.h) + ' cells' + overNote +
        ' — under ' + Math.round(min * 100) + '% painted: ' + low.join(', ') +
        '; those tiles will show bare ground under the art';
    },
    // pin/unpin one dropped piece onto the largest mountain region — the
    // solver is bypassed for that region until unpinned (R.buildMtnLayer)
    setFormationPin(terrain, stem) {
      const cur = this.formationPin;
      this.formationPin = (cur && cur.stem === stem) ? null : (stem ? { terrain, stem } : null);
      if (window.R) { R._mtnLayerKey = ''; R._mtnDirty = true; }
      this._renderPanel();
    },
    /* the coverage grid: green = cells the derived mask claims, red =
       footprint cells it does NOT claim (bare ground will show there).
       Drawn from the same solutions the renderer used — the pinned piece on
       its region, solved placements everywhere else. */
    drawMasks(g) {
      if (!window.Formations || !window.R || !window.S || !S.map || !S.map.terrain) return;
      const t = T.MOUNTAIN, TL = CFG.TILE;
      const pin = this.formationPin;
      if (!Formations.artTerrain(t)) return;
      const regions = R.mtnRegions();
      let pinRegion = null;
      if (pin) for (const r of regions)
        if (!pinRegion || r.cells.length > pinRegion.cells.length) pinRegion = r;
      g.save();
      g.lineWidth = 1;
      for (const r of regions) {
        let placements = null;
        if (r === pinRegion) {
          const pl = Formations.pinPlacement(r, pin.stem);
          if (pl) placements = [pl];
        } else {
          const sol = Formations.solve(Formations.regionFromCells(r.cells, t));
          if (sol.placements.length && !sol.holes.length) placements = sol.placements;
        }
        if (!placements) continue;
        for (const pl of placements) {
          const pc = pl.piece;
          for (let dy = 0; dy < pc.h; dy++) for (let dx = 0; dx < pc.w; dx++) {
            const covered = pc.mask[dy * pc.w + dx];
            const x = (pl.tx + dx) * TL, y = (pl.ty + dy) * TL;
            g.fillStyle = covered ? 'rgba(90,220,130,0.22)' : 'rgba(230,80,80,0.30)';
            g.fillRect(x, y, TL, TL);
            g.strokeStyle = covered ? 'rgba(90,220,130,0.9)' : 'rgba(230,80,80,0.9)';
            g.strokeRect(x + 0.5, y + 0.5, TL - 1, TL - 1);
          }
        }
        // the BASELINE of a pinned piece, in gold: where the image's bottom
        // edge meets the footprint's southern edge (the conform tool's
        // "show me where that line falls")
        if (r === pinRegion && placements.length) {
          const pl0 = placements[0];
          g.strokeStyle = '#e8c15a'; g.lineWidth = 2;
          g.beginPath();
          g.moveTo(pl0.tx * TL, (pl0.ty + pl0.piece.h) * TL);
          g.lineTo((pl0.tx + pl0.piece.w) * TL, (pl0.ty + pl0.piece.h) * TL);
          g.stroke();
          g.lineWidth = 1;
        }
      }
      g.restore();
    },

    /* ---- CONFORM: raw art of ANY size and name → a contract-true piece,
       from a phone, with no image editor. The pipeline is pure canvas:
       optionally key a flat corner-colour background, trim transparent
       margins, nearest-downsample so the trimmed width spans W tiles at N
       art-pixels each, then integer-upscale back onto the 128px/tile grid
       (N is a divisor of 128 — 8/16/32/64/128 — so the upscale factor is
       whole and every art pixel lands crisp; 32 is the game's own density,
       where one art pixel is one map pixel at base zoom). The trimmed
       bottom edge IS the baseline — the southern edge of the footprint.
       The result previews live on a real region through the ordinary
       formation machinery (a temporary piece, force-pinned), and exports
       as a correctly named PNG at exactly W×128 wide. The filename stays
       the only source of footprint truth — this tool only produces files
       that tell it. */
    _conform: null,
    DENSITIES: [8, 16, 32, 64, 128],
    openConform(src, name) {
      this._conformClose();
      this._conform = {
        src, name: name || 'raw.png', W: 2, H: 2, N: 32,
        keyBg: false, shape: 'wip', letter: 'a',
        target: 'mountain',
        rkey: (window.Relics && Object.keys(Relics.DEFS)[0]) || 'aqueduct',
        relicStash: null,
        slot: 'wild', coverStash: null,
        tempStem: null, centered: false, prevMask: this.maskOverlay,
      };
      // suggest keying when the corner is opaque — external art loves a backdrop
      try {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const g = c.getContext('2d');
        g.drawImage(src, 0, 0);
        if (g.getImageData(0, 0, 1, 1).data[3] > 0) this._conform.keyBg = true;
      } catch (e) { /* unreadable pixels — leave the key off */ }
      this.maskOverlay = true;                 // the grid is the point here
      this._conformPanel();
      this._conformApply();
    },
    _conformClose() {
      const c0 = this._conform;
      if (!c0) return;
      if (c0.tempStem) {
        Assets.removeFormationArt('mountain', c0.tempStem);
        delete this._formInfo[c0.tempStem];
        if (this.formationPin && this.formationPin.stem === c0.tempStem)
          this.setFormationPin(null, null);
      }
      // a relic preview leaves NOTHING behind: art and S.relic both restored
      if (c0.relicStash) {
        if (c0.relicStash.art) Assets.relicArt[c0.rkey] = c0.relicStash.art;
        else Assets.removeRelicArt(c0.rkey);
        S.relic = c0.relicStash.relic;
      }
      // …and neither does a cover preview: the slot's shipped frames return
      if (c0.coverStash) {
        const st = c0.coverStash, kk = Assets.coverSlotKey('grass', st.slot);
        if (Assets.cover.grass) {
          if (st.arr) Assets.cover.grass[st.slot] = st.arr;
          else delete Assets.cover.grass[st.slot];
        }
        if (st.loaded) Assets.loaded[kk] = true; else delete Assets.loaded[kk];
        if (window.R && R.rebuildTerrain) R.rebuildTerrain();
      }
      this.maskOverlay = c0.prevMask;
      if (c0.panel) c0.panel.remove();
      this._conform = null;
      this._renderPanel();
    },
    _conformStem() {
      const c0 = this._conform;
      const letter = ((c0.letter || '').toLowerCase().replace(/[^a-z]/g, '')[0]) || 'a';
      // relic target: the footprint and the shape ARE the def's — only the
      // letter is the author's to choose, so the name can never disagree
      // with the placement footprint the game actually uses
      if (c0.target === 'relic') {
        const d = window.Relics && Relics.DEFS[c0.rkey];
        return d ? ('relic-' + d.w + 'x' + d.h + '-' + d.key + '-' + letter) : 'relic-wip';
      }
      // cover target: the drop convention's own name — grass-{slot}.png
      if (c0.target === 'cover') return 'grass-' + (c0.slot || 'wild');
      const shape = (c0.shape || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'wip';
      return 'mountain-' + c0.W + 'x' + c0.H + '-' + shape + '-' + letter;
    },
    // key + trim, shared by every conform target: edge-flood the corner
    // colour when asked, then measure the opaque content box
    _conformKeyTrim() {
      const c0 = this._conform;
      if (!c0) return null;
      const src = c0.src, w = src.width, h = src.height;
      if (!w || !h) return null;
      const work = document.createElement('canvas');
      work.width = w; work.height = h;
      const g = work.getContext('2d', { willReadFrequently: true });
      g.drawImage(src, 0, 0);
      let d;
      try { d = g.getImageData(0, 0, w, h).data; }
      catch (e) { return null; }               // tainted source — cannot conform
      if (c0.keyBg && d[3] > 0) {
        // edge-flood the corner colour to transparency (the finish-pilot rule)
        const bg = [d[0], d[1], d[2]], tol = 4;
        const isBg = i => d[i + 3] > 0 && Math.abs(d[i] - bg[0]) <= tol &&
          Math.abs(d[i + 1] - bg[1]) <= tol && Math.abs(d[i + 2] - bg[2]) <= tol;
        const gone = new Uint8Array(w * h), q = [];
        const seed = k => { if (!gone[k] && isBg(k * 4)) { gone[k] = 1; q.push(k); } };
        for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
        while (q.length) {
          const k = q.pop(), x = k % w, y = (k / w) | 0;
          if (x > 0) seed(k - 1);
          if (x < w - 1) seed(k + 1);
          if (y > 0) seed(k - w);
          if (y < h - 1) seed(k + w);
        }
        const id2 = g.getImageData(0, 0, w, h);
        for (let k = 0; k < w * h; k++) if (gone[k]) id2.data[k * 4 + 3] = 0;
        g.putImageData(id2, 0, 0);
        d = g.getImageData(0, 0, w, h).data;
      }
      // trim transparent margins — the trimmed bottom edge becomes the baseline
      let x0 = w, x1 = -1, y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] >= 16) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      if (x1 < 0) return null;                 // nothing but transparency
      return { work, w, h, x0, y0, tw: x1 - x0 + 1, th: y1 - y0 + 1 };
    },
    _conformBuild() {
      const c0 = this._conform;
      const kt = this._conformKeyTrim();
      if (!kt) return null;
      const work = kt.work, w = kt.w, h = kt.h, x0 = kt.x0, y0 = kt.y0, tw = kt.tw, th = kt.th;
      // nearest-downsample: trimmed width spans W tiles at N art-px per tile
      const PX = Assets.FORMATION_PX || 128;
      const dw = c0.W * c0.N;
      const dh = Math.max(1, Math.round(th * dw / tw));
      const down = document.createElement('canvas');
      down.width = dw; down.height = dh;
      const gd = down.getContext('2d');
      gd.imageSmoothingEnabled = false;
      gd.drawImage(work, x0, y0, tw, th, 0, 0, dw, dh);
      // integer upscale back onto the 128px/tile grid
      const k2 = PX / c0.N;
      const out = document.createElement('canvas');
      out.width = dw * k2; out.height = dh * k2;
      const go = out.getContext('2d');
      go.imageSmoothingEnabled = false;
      go.drawImage(down, 0, 0, out.width, out.height);
      const foot = c0.H * PX;
      return {
        canvas: out,
        overhangTiles: Math.max(0, (out.height - foot) / PX),
        shortTiles: Math.max(0, (foot - out.height) / PX),
        trimmed: tw + '×' + th + ' of ' + w + '×' + h,
      };
    },
    /* the COVER build: any-size art → a {W frames × 32}×32 strip on the
       32px grid, aspect preserved, bottom-anchored (a sward stands ON its
       ground line). setCoverArt slices the frames back out and snaps the
       alpha binary — the same door a shipped file comes through. */
    _conformBuildCover() {
      const c0 = this._conform;
      const kt = this._conformKeyTrim();
      if (!kt) return null;
      const PXC = (window.Assets && Assets.COVER_PX) || 32;
      const out = document.createElement('canvas');
      out.width = c0.W * PXC; out.height = PXC;
      const go = out.getContext('2d');
      go.imageSmoothingEnabled = false;
      const k = Math.min(out.width / kt.tw, PXC / kt.th);
      const dw = Math.max(1, Math.round(kt.tw * k)), dh = Math.max(1, Math.round(kt.th * k));
      go.drawImage(kt.work, kt.x0, kt.y0, kt.tw, kt.th, ((out.width - dw) / 2) | 0, PXC - dh, dw, dh);
      return { canvas: out, overhangTiles: 0, shortTiles: 0,
               trimmed: kt.tw + '×' + kt.th + ' of ' + kt.w + '×' + kt.h };
    },
    // rebuild and live-preview: the conformed piece is a real (temporary)
    // formation piece, force-pinned onto the largest region — every control
    // change lands on actual ground within a frame
    _conformApply() {
      const c0 = this._conform;
      if (!c0) return;
      if (c0.tempStem) {
        Assets.removeFormationArt('mountain', c0.tempStem);
        delete this._formInfo[c0.tempStem];
        c0.tempStem = null;
      }
      /* RELIC TARGET: the conformed piece installs as the relic's live art
         (Assets.setRelicArt), and a TEMPORARY found relic is stood at the
         camera's centre so the preview lands on real ground within a frame.
         Both are stashed once and restored on close — in-memory only. */
      /* COVER TARGET: the conformed strip installs as the live grass-cover
         slot (Assets.setCoverArt — the shipping door), replacing the slot's
         frames for the preview; stash once, restore on close. The rebake the
         installer already requests is the live preview. */
      if (c0.target === 'cover') {
        c0.built = this._conformBuildCover();
        if (c0.built) {
          const kk = Assets.coverSlotKey('grass', c0.slot);
          if (!c0.coverStash)
            c0.coverStash = { slot: c0.slot, arr: (Assets.cover.grass || {})[c0.slot] || null, loaded: !!Assets.loaded[kk] };
          if (Assets.cover.grass) Assets.cover.grass[c0.slot] = [];
          Assets.setCoverArt('grass', c0.slot, c0.built.canvas);
        }
        this._conformRender();
        this._renderPanel();
        return;
      }
      if (c0.target === 'relic') {
        const d = window.Relics && Relics.DEFS[c0.rkey];
        c0.built = this._conformBuild();
        if (d && c0.built) {
          if (!c0.relicStash) c0.relicStash = { art: Assets.relicArt[c0.rkey], relic: S.relic };
          Assets.setRelicArt(c0.rkey, c0.built.canvas);
          if (window.S && S.map) {
            const TL = CFG.TILE;
            const cx = Math.round((R.cam.x + R.viewW() / R.cam.z / 2) / TL - d.w / 2);
            const cy = Math.round((R.cam.y + R.viewH() / R.cam.z / 2) / TL - d.h / 2);
            S.relic = { key: d.key, x: cx, y: cy, w: d.w, h: d.h, found: S.day || 1, amount: 0, devPreview: 1 };
          }
        }
        this._conformRender();
        this._renderPanel();
        return;
      }
      c0.built = this._conformBuild();
      if (c0.built) {
        const stem = this._conformStem();
        if (Assets.setFormationArt('mountain', stem, c0.built.canvas, null)) {
          c0.tempStem = stem;
          this._formInfo[stem] = this._formationReport('mountain', stem, c0.built.canvas, true);
          this.formationPin = { terrain: 'mountain', stem };
          if (window.R) { R._mtnLayerKey = ''; R._mtnDirty = true; }
          if (!c0.centered && window.S && S.map && S.map.terrain && window.R && R.mtnRegions) {
            let big = null;
            for (const r of R.mtnRegions()) if (!big || r.cells.length > big.cells.length) big = r;
            if (big) {
              R.centerOn((big.box[0] + big.box[2]) / 2 + 0.5, (big.box[1] + big.box[3]) / 2 + 0.5);
              c0.centered = true;
            }
          }
        }
      }
      this._conformRender();
      this._renderPanel();
    },
    _conformDownload() {
      const c0 = this._conform;
      if (!c0 || !c0.built) return;
      const a = document.createElement('a');
      a.download = this._conformStem() + '.png';
      a.href = c0.built.canvas.toDataURL('image/png');
      document.body.appendChild(a); a.click(); a.remove();
    },
    _conformPanel() {
      const c0 = this._conform;
      const p = document.createElement('div');
      p.id = 'devConform';
      p.style.cssText = 'position:fixed;right:8px;top:120px;z-index:9999;background:rgba(26,20,14,.94);' +
        'border:1px solid #6b5636;padding:8px 10px;font:12px monospace;color:#e8dfc8;' +
        'width:min(300px,86vw);max-height:70vh;overflow:auto;border-radius:4px';
      p.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<b>CONFORM — raw art → piece</b><button id="dcClose" style="font:12px monospace">×</button></div>' +
        '<div id="dcSrc" style="opacity:.7;margin-bottom:6px;word-break:break-word"></div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:4px 0">target ' +
        '<select id="dcTarget" style="font:12px monospace">' +
        '<option value="mountain">mountain piece</option><option value="relic">relic decor</option>' +
        '<option value="cover">grass cover</option></select>' +
        '<select id="dcRelic" style="font:12px monospace;display:none"></select>' +
        '<select id="dcSlot" style="font:12px monospace;display:none">' +
        '<option value="wild">wild</option><option value="kept">kept</option><option value="accent">accent</option></select></div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin:4px 0">footprint ' +
        'W <select id="dcW" style="font:12px monospace"></select> × ' +
        'H <select id="dcH" style="font:12px monospace"></select></div>' +
        '<div style="margin:6px 0">density <span id="dcNLabel"></span><br>' +
        '<input id="dcN" type="range" min="0" max="4" step="1" style="width:100%"></div>' +
        '<label style="display:flex;gap:4px;align-items:center;margin:4px 0">' +
        '<input type="checkbox" id="dcKey"> key flat background (corner colour)</label>' +
        '<label style="display:flex;gap:4px;align-items:center;margin:4px 0">' +
        '<input type="checkbox" id="dcMask"> coverage grid + gold baseline</label>' +
        '<div id="dcInfo" style="margin:6px 0;color:#9d9"></div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        'shape <input id="dcShape" style="font:12px monospace;width:80px" value="wip"> ' +
        'letter <input id="dcLetter" style="font:12px monospace;width:28px" maxlength="1" value="a"></div>' +
        '<div id="dcName" style="margin:4px 0;word-break:break-all;color:#e8c15a"></div>' +
        '<button id="dcDownload" style="font:12px monospace;padding:4px 10px">download PNG</button>' +
        '<div id="dcHint" style="opacity:.6;margin-top:6px"></div>';
      document.body.appendChild(p);
      c0.panel = p;
      const wSel = p.querySelector('#dcW'), hSel = p.querySelector('#dcH');
      for (let i = 1; i <= 24; i++) {
        wSel.appendChild(new Option(i, i));
        hSel.appendChild(new Option(i, i));
      }
      wSel.value = c0.W; hSel.value = c0.H;
      const nR = p.querySelector('#dcN');
      nR.value = this.DENSITIES.indexOf(c0.N);
      p.querySelector('#dcKey').checked = c0.keyBg;
      p.querySelector('#dcMask').checked = this.maskOverlay;
      const re = () => this._conformApply();
      /* the RELIC target: which relic is being dressed (its def pins the
         footprint — a relic's art may never disagree with the ground its
         placement actually measured, so W/H lock to the def) */
      const tSel = p.querySelector('#dcTarget'), rSel = p.querySelector('#dcRelic');
      if (window.Relics) for (const rk of Object.keys(Relics.DEFS)) rSel.appendChild(new Option(rk, rk));
      rSel.value = c0.rkey;
      tSel.value = c0.target;
      const relicRestore = () => {
        if (!c0.relicStash) return;
        if (c0.relicStash.art) Assets.relicArt[c0.rkey] = c0.relicStash.art;
        else Assets.removeRelicArt(c0.rkey);
        S.relic = c0.relicStash.relic;
        c0.relicStash = null;
      };
      /* the COVER target: which slot is being dressed. W becomes the FRAME
         COUNT of the 32px strip; H and density are the convention's (1 tile
         tall, game-native), so they lock. */
      const sSel = p.querySelector('#dcSlot');
      sSel.value = c0.slot || 'wild';
      const coverRestore = () => {
        if (!c0.coverStash) return;
        const st = c0.coverStash, kk = Assets.coverSlotKey('grass', st.slot);
        if (Assets.cover.grass) {
          if (st.arr) Assets.cover.grass[st.slot] = st.arr;
          else delete Assets.cover.grass[st.slot];
        }
        if (st.loaded) Assets.loaded[kk] = true; else delete Assets.loaded[kk];
        c0.coverStash = null;
      };
      const syncTarget = () => {
        const rel = c0.target === 'relic', cov = c0.target === 'cover';
        rSel.style.display = rel ? '' : 'none';
        sSel.style.display = cov ? '' : 'none';
        p.querySelector('#dcShape').disabled = rel || cov;
        wSel.disabled = rel; hSel.disabled = rel || cov;
        nR.disabled = cov;
        if (rel && window.Relics && Relics.DEFS[c0.rkey]) {
          c0.W = Relics.DEFS[c0.rkey].w; c0.H = Relics.DEFS[c0.rkey].h;
          wSel.value = c0.W; hSel.value = c0.H;
        }
        if (cov) { c0.H = 1; hSel.value = 1; }
      };
      syncTarget();
      tSel.onchange = () => { relicRestore(); coverRestore(); c0.target = tSel.value; syncTarget(); re(); };
      rSel.onchange = () => { relicRestore(); c0.rkey = rSel.value; syncTarget(); re(); };
      sSel.onchange = () => { coverRestore(); c0.slot = sSel.value; syncTarget(); re(); };
      wSel.onchange = () => { c0.W = +wSel.value; re(); };
      hSel.onchange = () => { c0.H = +hSel.value; re(); };
      nR.oninput = () => { c0.N = this.DENSITIES[+nR.value]; re(); };
      p.querySelector('#dcKey').onchange = e => { c0.keyBg = !!e.target.checked; re(); };
      p.querySelector('#dcMask').onchange = e => { this.maskOverlay = !!e.target.checked; };
      p.querySelector('#dcShape').oninput = e => { c0.shape = e.target.value; this._conformRename(); };
      p.querySelector('#dcLetter').oninput = e => { c0.letter = e.target.value; this._conformRename(); };
      p.querySelector('#dcDownload').onclick = () => this._conformDownload();
      p.querySelector('#dcClose').onclick = () => this._conformClose();
      this._conformRender();
    },
    // the temp piece rides the WIP stem; renaming shape/letter re-installs it
    // under the new stem so the preview and the export never disagree
    _conformRename() { this._conformApply(); },
    _conformRender() {
      const c0 = this._conform;
      if (!c0 || !c0.panel) return;
      const p = c0.panel, PX = (window.Assets && Assets.FORMATION_PX) || 128;
      p.querySelector('#dcSrc').textContent = c0.name + ' — ' + c0.src.width + '×' + c0.src.height + 'px source';
      p.querySelector('#dcNLabel').textContent =
        c0.N + ' art-px / tile' + (c0.N === 32 ? ' (game-native)' : c0.N > 32 ? ' (finer than the world)' : ' (chunkier)');
      const info = p.querySelector('#dcInfo');
      if (!c0.built) {
        info.style.color = '#e88';
        info.textContent = 'nothing to conform — the source is empty or unreadable';
      } else {
        const b2 = c0.built;
        info.style.color = b2.shortTiles > 0.5 ? '#e8c15a' : '#9d9';
        info.textContent = '→ ' + b2.canvas.width + '×' + b2.canvas.height + 'px (' +
          c0.W + '×' + c0.H + ' tiles' +
          (b2.overhangTiles ? ' + ' + b2.overhangTiles.toFixed(1) + ' overhang' : '') + ') · trimmed ' +
          b2.trimmed + ' · baseline = image bottom = footprint south edge' +
          (b2.shortTiles > 0.5 ? ' · ⚠ art is ' + b2.shortTiles.toFixed(1) + ' tiles SHORTER than the footprint' : '');
      }
      p.querySelector('#dcName').textContent = this._conformStem() + '.png';
      p.querySelector('#dcDownload').disabled = !c0.built;
      p.querySelector('#dcHint').textContent =
        (window.Screens && Screens.current === 'playing')
          ? 'previewing pinned on the largest mountain region — the panel report below-left grades the mask'
          : 'start a game to see the live preview on real ground';
    },
    revert(k) {
      const s = this._saved[k];
      if (!s) return false;
      // the FORMATION branch first — its key carries its own 'fm|' prefix
      if (k.indexOf('fm|') === 0) {
        const [, terrain, stem] = k.split('|');
        if (s.piece) Formations.addPiece(s.piece);
        else Assets.removeFormationArt(terrain, stem);
        if (s.loaded) { Assets.art[k] = s.art; Assets.loaded[k] = true; }
        else { delete Assets.art[k]; delete Assets.loaded[k]; if (s.art === null) Assets.art[k] = null; }
        delete this._formInfo[stem];
        if (this.formationPin && this.formationPin.stem === stem) this.setFormationPin(null, null);
        delete this._saved[k];
        delete this.overrides[k];
        this._renderPanel();
        return true;
      }
      // the COVER branch — its key carries its own 'cv|' prefix
      if (k.indexOf('cv|') === 0) {
        const [, tName, slot] = k.split('|');
        if (Assets.cover[tName]) {
          if (s.arr) Assets.cover[tName][slot] = s.arr;
          else delete Assets.cover[tName][slot];
        }
        if (s.loaded) Assets.loaded[k] = true; else delete Assets.loaded[k];
        if (window.R && R.rebuildTerrain) R.rebuildTerrain();
        delete this._saved[k];
        delete this.overrides[k];
        this._renderPanel();
        return true;
      }
      // the PROP branch next — the camp branch's prefix test would eat it
      const kp = k.match(/^camp-([a-z0-9]+)-prop([0-9])$/);
      if (kp) {
        const tribe = kp[1], i = +kp[2];
        if (s.prop) Assets.campProps[tribe][i] = s.prop;
        else if (Assets.campProps[tribe]) delete Assets.campProps[tribe][i];
        if (s.loaded) { Assets.art[k] = s.art; Assets.loaded[k] = true; }
        else { delete Assets.art[k]; delete Assets.loaded[k]; if (s.art === null) Assets.art[k] = null; }
        delete this._saved[k];
        delete this.overrides[k];
        this._renderPanel();
        return true;
      }
      if (k.indexOf('rl|') === 0) {
        const rkey = k.slice(3);
        if (s.art) Assets.relicArt[rkey] = s.art; else delete Assets.relicArt[rkey];
        if (s.loaded) { Assets.art[k] = s.slot; Assets.loaded[k] = true; }
        else { delete Assets.art[k]; delete Assets.loaded[k]; if (s.slot === null) Assets.art[k] = null; }
        delete this.overrides[k];
        this._renderPanel();
        return true;
      }
      if (k.indexOf('wonder-') === 0) {
        const wkey = k.slice('wonder-'.length);
        Sprites.wonders[wkey] = s.spr;
        if (window.S && S.wonder === wkey && Sprites.useWonder) Sprites.useWonder(wkey);
        if (s.loaded) { Assets.art[k] = s.art; Assets.loaded[k] = true; }
        else { delete Assets.art[k]; delete Assets.loaded[k]; if (s.art === null) Assets.art[k] = null; }
        delete this.overrides[k];
        this._renderPanel();
        return true;
      }
      if (k.indexOf('camp-') === 0) {
        const tribe = k.slice('camp-'.length);
        Sprites.camp[tribe] = s.spr;
        if (s.loaded) { Assets.art[k] = s.art; Assets.loaded[k] = true; }
        else { delete Assets.art[k]; delete Assets.loaded[k]; if (s.art === null) Assets.art[k] = null; }
        delete this._saved[k];
        delete this.overrides[k];
        this._renderPanel();
        return true;
      }
      const m = k.match(/^(.+)-l(\d+)$/), id = m[1], lv = +m[2];
      Sprites.building[id][lv - 1] = s.p;
      Sprites.buildingA[id][lv - 1] = s.a;
      if (s.loaded) { Assets.art[k] = s.art; Assets.loaded[k] = true; }
      else { delete Assets.art[k]; delete Assets.loaded[k]; if (s.art === null) Assets.art[k] = null; }
      delete this._saved[k];
      delete this.overrides[k];
      this._renderPanel();
      return true;
    },
    revertAll() { for (const k of Object.keys(this.overrides)) this.revert(k); },

    // every slot the picker / canonical-filename dropdown can offer, building
    // and camp alike — value is 'b|id|lv' or 'c|tribe', label the canonical
    // filename each would ship under
    _allSlots() {
      const out = Assets.artSlots().map(s => ({ value: 'b|' + s.id + '|' + s.lv, label: Assets.artName(s.id, s.lv) }));
      for (const tribe of Assets.campTribes()) {
        out.push({ value: 'c|' + tribe, label: Assets.campName(tribe) });
        for (let i = 1; i <= Assets.CAMP_PROP_N; i++)
          out.push({ value: 'p|' + tribe + '|' + i, label: Assets.campPropName(tribe, i) });
      }
      for (const tName of Assets.formationTerrains())
        for (const stem of Assets.FORMATION_CATALOG[tName])
          out.push({ value: 'fm|' + tName + '|' + stem, label: Assets.formationName(stem) });
      return out;
    },
    // inject whatever the picker/panel dropdown's value string names
    _injectByValue(v, img, name) {
      if (v.indexOf('fm|') === 0) { const [, terrain, stem] = v.split('|'); return this.injectFormation(terrain, stem, img, name); }
      if (v.indexOf('p|') === 0) { const [, tribe, i] = v.split('|'); return this.injectCampProp(tribe, +i, img, name); }
      if (v.indexOf('c|') === 0) return this.injectCamp(v.slice(2), img, name);
      if (v.indexOf('rl|') === 0) return this.injectRelic(v.slice(3), img, name);
      const [, id, lv] = v.split('|');
      return this.inject(id, +lv, img, name);
    },

    _pickQueue: [],
    _queuePicker(name, img) {
      this._pickQueue.push({ name, img });
      if (this._pickQueue.length === 1) this._showPicker();
    },
    _showPicker() {
      const job = this._pickQueue[0];
      if (!job) return;
      const ov = document.createElement('div');
      ov.id = 'devArtPick';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10000;' +
        'display:flex;align-items:center;justify-content:center;font:13px monospace;color:#e8dfc8';
      const box = document.createElement('div');
      box.style.cssText = 'background:#2a2118;border:1px solid #6b5636;padding:14px 16px;max-width:320px';
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;margin:8px 0;font:13px monospace';
      for (const s of this._allSlots()) {
        const o = document.createElement('option');
        o.value = s.value;
        o.textContent = s.label;
        sel.appendChild(o);
      }
      const mk = (label, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'font:13px monospace;margin-right:8px;padding:3px 10px';
        b.onclick = fn;
        return b;
      };
      const done = () => {
        document.body.removeChild(ov);
        this._pickQueue.shift();
        this._showPicker();          // next queued file, if any
      };
      box.innerHTML = '<div>"' + job.name.replace(/[<>&]/g, '') +
        '" doesn’t match {id}-l{level}.png, camp-{tribe}.png or ' +
        '{terrain}-{W}x{H}-{shape}-{letter}.png — pick its slot:</div>';
      box.appendChild(sel);
      box.appendChild(mk('Use this slot', () => {
        this._injectByValue(sel.value, job.img, job.name);
        done();
      }));
      box.appendChild(mk('Conform as formation piece', () => {
        const img = job.img, name = job.name;
        done();
        this.openConform(img, name);
      }));
      box.appendChild(mk('Skip', done));
      ov.appendChild(box);
      document.body.appendChild(ov);
    },

    _panel: null,
    _renderPanel() {
      if (!on || !this._panel) return;
      const keys = Object.keys(this.overrides).sort();
      const list = this._panel.querySelector('#devArtList');
      list.innerHTML = '';
      if (!keys.length) {
        list.innerHTML = '<div style="opacity:.6">drop PNGs anywhere — no overrides yet</div>';
      }
      for (const k of keys) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:2px 0';
        const label = document.createElement('span');
        label.textContent = k + ' ← ' + this.overrides[k];
        label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        row.appendChild(label);
        // formation rows get the force-place pin — the solver is bypassed
        // and the piece lands on the largest mountain region
        if (k.indexOf('fm|') === 0) {
          const [, terrain, stem] = k.split('|');
          const pinned = this.formationPin && this.formationPin.stem === stem;
          const pin = document.createElement('button');
          pin.textContent = pinned ? 'unpin' : 'pin';
          pin.style.cssText = 'font:11px monospace' + (pinned ? ';background:#8a6a1e;color:#fff' : '');
          pin.onclick = () => this.setFormationPin(terrain, stem);
          row.appendChild(pin);
        }
        const rv = document.createElement('button');
        rv.textContent = 'revert';
        rv.style.cssText = 'font:11px monospace';
        rv.onclick = () => this.revert(k);
        row.appendChild(rv);
        list.appendChild(row);
      }
      // the formation contract reports — accepted and refused drops alike
      const info = this._panel.querySelector('#devFormInfo');
      if (info) {
        const stems = Object.keys(this._formInfo).sort();
        info.style.display = stems.length ? '' : 'none';
        info.innerHTML = '';
        for (const stem of stems) {
          const line = document.createElement('div');
          line.style.cssText = 'margin:3px 0;word-break:break-word' +
            (/^refused/.test(this._formInfo[stem]) ? ';color:#e88'
              : /^⚠/.test(this._formInfo[stem]) ? ';color:#e8c15a' : ';color:#9d9');
          line.textContent = stem + ': ' + this._formInfo[stem];
          info.appendChild(line);
        }
      }
    },
  };

  if (!on) return;   // players: nothing below this line ever runs

  const boot = () => {
    /* ---- ONE intake for every route a PNG can arrive by: the desktop
       drag-drop AND the file-picker button (mobile Safari has no drag-drop —
       the picker is how an artist works from a phone). Same inference, same
       injection, same object-URL lifetime. */
    const handleFiles = (fileList) => {
      const files = Array.from(fileList || [])
        .filter(f => f.type === 'image/png' || /\.png$/i.test(f.name));
      for (const f of files) {
        const img = new Image();
        img.onload = () => {
          const slot = DevArt.parseName(f.name);
          if (!slot) { DevArt._queuePicker(f.name, img); return; }
          if (slot.kind === 'campProp') DevArt.injectCampProp(slot.tribe, slot.i, img, f.name);
          else if (slot.kind === 'camp') DevArt.injectCamp(slot.tribe, img, f.name);
          else if (slot.kind === 'wonder') DevArt.injectWonder(slot.wkey, img, f.name);
          else if (slot.kind === 'relic') DevArt.injectRelic(slot.rkey, img, f.name);
          else if (slot.kind === 'cover') DevArt.injectCover(slot.tName, slot.slot, img, f.name);
          else if (slot.kind === 'formation') DevArt.injectFormation(slot.terrain, slot.stem, img, f.name);
          else DevArt.inject(slot.id, slot.lv, img, f.name);
        };
        img.src = URL.createObjectURL(f);   // in-memory only; gone on refresh
      }
    };
    DevArt._handleFiles = handleFiles;      // the contract test drives this

    // ---- the drop target: the whole window ----
    addEventListener('dragover', e => { e.preventDefault(); });
    addEventListener('drop', e => {
      e.preventDefault();
      handleFiles(e.dataTransfer && e.dataTransfer.files);
    });

    // ---- the panel ----
    const p = document.createElement('div');
    p.id = 'devArtPanel';
    p.style.cssText = 'position:fixed;left:8px;top:120px;z-index:9999;background:rgba(26,20,14,.92);' +
      'border:1px solid #6b5636;padding:8px 10px;font:12px monospace;color:#e8dfc8;' +
      'max-width:270px;max-height:45vh;overflow:auto;border-radius:4px';
    p.innerHTML =
      '<div style="font-weight:bold;margin-bottom:4px">ART DEV — drop PNGs to preview</div>' +
      '<div id="devArtList"></div>' +
      '<div id="devFormInfo" style="display:none;margin-top:6px;border-top:1px solid #4a3c28;padding-top:4px;font:11px monospace"></div>' +
      '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
      '<button id="devArtRevertAll" style="font:11px monospace">revert all</button>' +
      '<button id="devArtFileBtn" style="font:11px monospace">load PNGs…</button>' +
      '<button id="devArtConformBtn" style="font:11px monospace">conform raw PNG…</button>' +
      '<input type="file" id="devArtFile" accept="image/png,.png" multiple style="display:none">' +
      '<input type="file" id="devArtConformFile" accept="image/png,.png" style="display:none">' +
      '<label style="font:11px monospace;display:flex;align-items:center;gap:3px">' +
      '<input type="checkbox" id="devArtMaskTgl">coverage grid</label></div>' +
      '<div style="margin-top:4px;opacity:.55;font:10px monospace">formations: {terrain}-{W}x{H}-{shape}-{letter}.png, width = W×128</div>' +
      '<div style="margin-top:8px;border-top:1px solid #4a3c28;padding-top:6px">' +
      'canonical filename:<br><select id="devArtSlot" style="width:100%;font:11px monospace;margin:4px 0"></select>' +
      '<button id="devArtCopy" style="font:11px monospace">copy filename</button>' +
      '<span id="devArtCopied" style="margin-left:6px;opacity:0">copied ✓</span></div>';
    document.body.appendChild(p);
    DevArt._panel = p;
    // the phone route: no drag-drop in mobile Safari, so a real file input
    const fileInput = p.querySelector('#devArtFile');
    p.querySelector('#devArtFileBtn').onclick = () => fileInput.click();
    fileInput.onchange = () => { handleFiles(fileInput.files); fileInput.value = ''; };
    // the CONFORM route: any PNG, any size, any name — straight to the tool
    const conformInput = p.querySelector('#devArtConformFile');
    p.querySelector('#devArtConformBtn').onclick = () => conformInput.click();
    conformInput.onchange = () => {
      const f = conformInput.files && conformInput.files[0];
      conformInput.value = '';
      if (!f) return;
      const img = new Image();
      img.onload = () => DevArt.openConform(img, f.name);
      img.src = URL.createObjectURL(f);
    };
    p.querySelector('#devArtMaskTgl').onchange = (e) => { DevArt.maskOverlay = !!e.target.checked; };
    const sel = p.querySelector('#devArtSlot');
    for (const s of DevArt._allSlots()) {
      const o = document.createElement('option');
      o.value = s.value;
      o.textContent = s.label;
      sel.appendChild(o);
    }
    p.querySelector('#devArtRevertAll').onclick = () => DevArt.revertAll();
    p.querySelector('#devArtCopy').onclick = async () => {
      const v = sel.value;
      let name;
      if (v.indexOf('fm|') === 0) name = Assets.formationName(v.split('|')[2]);
      else if (v.indexOf('p|') === 0) { const [, tribe, i] = v.split('|'); name = Assets.campPropName(tribe, +i); }
      else if (v.indexOf('c|') === 0) name = Assets.campName(v.slice(2));
      else { const [, id, lv] = v.split('|'); name = DevArt.canonicalName(id, +lv); }
      try { await navigator.clipboard.writeText(name); }
      catch (e) {
        // clipboard API needs a secure context — fall back to a selectable box
        const ta = document.createElement('textarea');
        ta.value = name; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta);
      }
      const ok = p.querySelector('#devArtCopied');
      ok.style.opacity = 1;
      setTimeout(() => { ok.style.opacity = 0; }, 1200);
    };
    DevArt._renderPanel();
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
