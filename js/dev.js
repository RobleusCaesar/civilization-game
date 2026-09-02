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

    /* ---- THE LAND BENCH (LAND_REFRESH.md Phase 0) ----
       "Screenshots are the referee." Whitelisted LAND / MTN dials retune the
       LIVE map through the same re-derive-and-bake path a terrain edit takes
       (R.rebakeAll, debounced ~250ms — a full bake is up to a second on
       xlarge, so never per slider tick); values that differ from their
       defaults export as a JS object literal, which is how a tuning session
       on the phone becomes a commit; two viewport snapshots flip BLIND
       (labelled 1/2 in a shuffled order — reveal only after you have
       chosen); a seed + camera bookmark makes before/after shots
       pixel-comparable across reloads; and golden hour can be HELD
       (DevArt.forceDayF, read by the dusk tint in R.draw) for the one warm
       shot every phase owes.

       Bench state lives on DevArt, never in `overrides` — revertAll is the
       art's, and tests/art-pipeline.mjs expects it empty. Nothing here
       touches S except the founding path, which is replayRun's own.

       Whitelist entries: [group, key, min, max, step]. A dial is offered
       only if its group object exists and carries the key, so a renamed
       constant drops out of the bench instead of writing a stray field. */
    BENCH_DIALS: [
      ['LAND', 'TONE_STEPS', 2, 9, 1], ['LAND', 'TONE_AMP', 0, 0.3, 0.005], ['LAND', 'TONE_SUB', 1, 8, 1],
      ['LAND', 'SHADE_FOREST', 0, 0.3, 0.005], ['LAND', 'SHADE_ROCK', 0, 0.3, 0.005], ['LAND', 'SHADE_SHORE', 0, 0.2, 0.005],
      ['LAND', 'HUE_AMP', 0, 0.15, 0.005], ['LAND', 'HUE_FREQ', 0.005, 0.1, 0.0025], ['LAND', 'HUE_STEPS', 2, 5, 1],
      ['LAND', 'HUE_DITHER', 0, 0.8, 0.05], ['LAND', 'SUN_BIAS', 0, 1, 0.05], ['LAND', 'GRAIN_N', 0, 40, 1],
      ['LAND', 'MEADOW_WARM', 1, 8, 1],
      ['LAND', 'DECAL_MUTE', 0, 1, 0.02], ['LAND', 'DECAL_DENSITY', 0, 1.5, 0.02], ['LAND', 'DECAL_CLUMP', 0.02, 0.5, 0.005],
      ['LAND', 'DECAL_GATE', 0, 1, 0.02], ['LAND', 'DECAL_MAX', 0, 6, 1],
      ['LAND', 'GRASS_DENSITY', 0, 3, 0.05], ['LAND', 'GRASS_MACRO_F', 0.005, 0.2, 0.005], ['LAND', 'GRASS_GATE', 0, 1, 0.02],
      ['LAND', 'GRASS_MAX', 0, 12, 1], ['LAND', 'GRASS_ACCENT', 0, 0.3, 0.005], ['LAND', 'GRASS_TALL', 0, 2, 0.05],
      ['LAND', 'GRASS_PARCH', 0, 1, 0.02],
      ['LAND', 'KEPT_DENSITY', 0, 1, 0.02], ['LAND', 'KEPT_TINT', 0, 0.3, 0.005], ['LAND', 'KEPT_SOFT', 0, 3, 0.1],
      ['LAND', 'TAME_R', 0, 5, 1], ['LAND', 'TAME_R_FORT', 0, 3, 1], ['LAND', 'TAME_WOBBLE', 0, 3, 0.1], ['LAND', 'TAME_LOUD', 0, 4, 0.1],
      ['LAND', 'EDGE_MAX', 0, 8, 1], ['LAND', 'EDGE_FREQ', 0.2, 4, 0.1],
      ['LAND', 'SAND_MAX', 0, 8, 1], ['LAND', 'SHORE_SMOOTH', 0, 6, 1], ['LAND', 'SHORE_NOISE', 0, 0.5, 0.01],
      ['LAND', 'SHELF_STEPS', 1, 12, 1], ['LAND', 'SHELF_REACH', 0, 24, 1], ['LAND', 'SHELF_ALPHA', 0, 0.2, 0.005],
      ['LAND', 'LIFE_CHANCE', 0, 1, 0.02], ['LAND', 'LIFE_GATE', 0, 1, 0.02],
      ['LAND', 'DEEP_SHORE_STEP', 0.1, 0.6, 0.05], ['LAND', 'DEEP_SHORE_END', 1, 4, 0.25], ['LAND', 'DEEP_TOP_K', 0.5, 1, 0.02],
      ['LAND', 'DEEP_TOP_MIN', 2, 10, 0.5], ['LAND', 'DEEP_SAT', 0, 1.6, 0.05], ['LAND', 'DEEP_LIFT', -0.5, 0.5, 0.05],
      ['LAND', 'SLOPE_VAR', 0, 1.2, 0.05], ['LAND', 'SLOPE_FREQ', 0.02, 0.3, 0.01], ['LAND', 'BAR_AMP', 0, 3, 0.1],
      ['LAND', 'BAR_FREQ', 0.04, 0.5, 0.02], ['LAND', 'SLOPE_HOLD', 0.5, 4, 0.1],
      ['LAND', 'SHOAL_BAR', 0, 3, 0.1], ['LAND', 'SHOAL_BAR_R', 0, 5, 0.2],
      ['LAND', 'SWELL_GATE', 1.5, 2.8, 0.05], ['LAND', 'SWELL_LIFT', 0, 4, 1], ['LAND', 'GLINT_LIFT', 0, 6, 1],
      ['LAND', 'DEPTH_WANDER', 0, 1, 0.01], ['LAND', 'DEPTH_WANDER_F', 0.1, 3, 0.05], ['LAND', 'DEPTH_AMP', 0, 1, 0.02],
      ['LAND', 'DEPTH_DITHER', 0, 0.3, 0.01], ['LAND', 'DEPTH_SUB', 4, 16, 4], ['LAND', 'WATER_WHISPER', 0, 2, 0.1],
      ['LAND', 'SHORE_SHADOW', 0, 0.6, 0.02], ['LAND', 'SHORE_SHADOW_W', 0.3, 3, 0.1], ['LAND', 'SHORE_SHADOW_STEPS', 1, 6, 1],
      ['LAND', 'SHORE_SHADOW_SUN', 0, 1, 0.1], ['LAND', 'SHORE_LIP', 0, 0.8, 0.05], ['LAND', 'SHORE_LIP_W', 0.5, 4, 0.1],
      ['LAND', 'FOAM_LINE', 0, 0.8, 0.01], ['LAND', 'FOAM_PULSE', 0, 1, 0.05], ['LAND', 'FOAM_SPEED', 0, 10, 0.25],
      ['LAND', 'FOAM_MINZ', 0.5, 3.5, 0.1], ['LAND', 'FOAM_DOTS', 0, 2, 1],
      ['LAND', 'FISH_RISE', 0, 12, 1], ['LAND', 'FISH_TIME', 0, 1, 0.05], ['LAND', 'SPARKLE_GOLD', 1, 3, 0.05],
      ['LAND', 'HILL_RIM', 0, 0.4, 0.01], ['LAND', 'HILL_SHADOW', 0, 0.8, 0.01], ['LAND', 'HILL_SHADOW_MAX', 0, 16, 1],
      ['LAND', 'BLOCK_SHADE', 0, 0.5, 0.01],
      ['LAND', 'ROCK_STEP', 4, 24, 1], ['LAND', 'ROCK_MIN', 4, 16, 1], ['LAND', 'ROCK_MAX', 6, 24, 1],
      ['LAND', 'ROCK_WANDER', 0, 0.5, 0.01], ['LAND', 'ROCK_SCREE', 0, 1, 0.02],
      ['LAND', 'POND_BAND', 0, 12, 0.5], ['LAND', 'DEEP_ALT', 0, 1, 1], ['LAND', 'WATER_FADE', 0, 2, 1],
      ['LAND', 'FISH_EVERY', 5, 90, 5], ['LAND', 'FISH_STOCK', 0, 1, 0.05], ['LAND', 'FISH_SIZE', 0.5, 2, 0.5],
      ['LAND', 'RIPPLE', 0, 0.6, 0.02], ['LAND', 'RIPPLE_GATE', 1, 12, 1],
      ['LAND', 'RIPPLE_EVERY', 2, 20, 0.5], ['LAND', 'RIPPLE_LEN', 0.5, 4, 0.1],
      ['MTN', 'STEPS', 3, 9, 1], ['MTN', 'BASE', 0, 1, 0.01], ['MTN', 'RISE', 0, 1, 0.01], ['MTN', 'LIGHT', 0, 1, 0.01],
      ['MTN', 'MACRO', 0, 1, 0.01], ['MTN', 'RIM', 0, 1, 0.01], ['MTN', 'CREASE', 0, 0.2, 0.005],
      ['MTN', 'FACET_AMP', 0, 1.5, 0.05], ['MTN', 'GRAIN_AMP', 0, 0.5, 0.01],
      ['MTN', 'LIFT_MIN', 0, 2, 0.05], ['MTN', 'LIFT_MAX', 0, 3, 0.05], ['MTN', 'PEAK_LIFT', 0, 2, 0.05],
      ['MTN', 'SHADOW_K', 0, 1.5, 0.05], ['MTN', 'SHADOW_A', 0, 1, 0.05],
      ['MTN', 'SNOW', 0, 1, 1], ['MTN', 'SNOW_MIND', 0, 6, 1], ['MTN', 'SNOW_ABOVE', 0.5, 1, 0.01],
    ],
    BENCH_KEY: 'neo-dev-bench',           // localStorage: the seed + camera bookmark
    GOLDEN_HOUR: 10.16,                   // dayF at the warm peak (R.draw's dusk block)
    forceDayF: null,
    _bench: null,
    _benchGroup(g) {
      try { return g === 'LAND' ? LAND : g === 'MTN' ? MTN : null; } catch (e) { return null; }
    },
    benchDials() {
      const out = [];
      for (const [g, k, min, max, step] of this.BENCH_DIALS) {
        const o = this._benchGroup(g);
        if (o && typeof o[k] === 'number') out.push({ g, k, min, max, step, o });
      }
      return out;
    },
    openBench() {
      if (this._bench) { this._benchClose(); return; }
      const defaults = {};
      for (const d of this.benchDials()) defaults[d.g + '.' + d.k] = d.o[d.k];
      this._bench = { panel: null, defaults, timer: 0, snaps: [null, null], order: [0, 1], showing: -1, filter: '', ab: null };
      this._benchPanel();
    },
    _benchClose() {
      const bn = this._bench;
      if (!bn) return;
      clearTimeout(bn.timer);
      this._benchHideAB();
      if (bn.panel) bn.panel.remove();
      this._bench = null;
    },
    // a dial changed: re-derive and bake, debounced — the whole point of the
    // debounce is that a full bake is the cost of one honest repaint
    _benchSchedule() {
      const bn = this._bench;
      if (!bn) return;
      clearTimeout(bn.timer);
      bn.timer = setTimeout(() => { bn.timer = 0; this._benchApply(); }, 250);
    },
    _benchApply() {
      if (!window.R || typeof S === 'undefined' || !S || !S.map) return;
      R.rebakeAll();
      if (window.Formations && Formations.onNewGame) { /* regions unchanged — nothing to re-solve */ }
    },
    // every dial that differs from its default, as the literal to paste into
    // the LAND / MTN blocks
    benchExport() {
      const bn = this._bench, out = {};
      if (!bn) return '{}';
      for (const d of this.benchDials()) {
        const v = d.o[d.k], def = bn.defaults[d.g + '.' + d.k];
        if (v !== def) (out[d.g] || (out[d.g] = {}))[d.k] = v;
      }
      const lines = [];
      for (const g of Object.keys(out)) {
        lines.push('  ' + g + ': {');
        for (const k of Object.keys(out[g])) lines.push('    ' + k + ': ' + out[g][k] + ',');
        lines.push('  },');
      }
      return lines.length ? '{\n' + lines.join('\n') + '\n}' : '{}  // every dial at its default';
    },
    benchReset() {
      const bn = this._bench;
      if (!bn) return;
      for (const d of this.benchDials()) d.o[d.k] = bn.defaults[d.g + '.' + d.k];
      this._benchRows();
      this._benchApply();
    },
    /* ---- blind A/B: two snapshots of the live canvas, flipped by tap ----
       The canvas is copied whole (drawImage — a tainted source is fine for
       drawing), so what you compare is exactly what the player would see,
       HUD and all. The order the two are shown in is shuffled once both
       exist; reveal maps the labels back after you have picked. */
    benchSnap(i) {
      const bn = this._bench;
      if (!bn || !window.R || !R.cv) return;
      const c = document.createElement('canvas');
      c.width = R.cv.width; c.height = R.cv.height;
      c.getContext('2d').drawImage(R.cv, 0, 0);
      bn.snaps[i] = c;
      if (bn.snaps[0] && bn.snaps[1]) bn.order = Math.random() < 0.5 ? [0, 1] : [1, 0];
      this._benchRender();
    },
    benchFlip() {
      const bn = this._bench;
      if (!bn || !bn.snaps[0] || !bn.snaps[1]) return;
      bn.showing = bn.showing < 0 ? 0 : 1 - bn.showing;
      this._benchShowAB();
    },
    _benchShowAB() {
      const bn = this._bench;
      if (!bn) return;
      if (!bn.ab) {
        const ov = document.createElement('div');
        ov.id = 'devBenchAB';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#000;cursor:pointer';
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        const tag = document.createElement('div');
        tag.style.cssText = 'position:absolute;left:12px;top:12px;font:bold 22px monospace;color:#e8c15a;' +
          'background:rgba(0,0,0,.55);padding:4px 10px;border-radius:4px;pointer-events:none';
        ov.appendChild(cv); ov.appendChild(tag);
        ov.onclick = () => this.benchFlip();
        document.body.appendChild(ov);
        bn.ab = { ov, cv, tag };
      }
      const which = bn.order[bn.showing];        // which SNAPSHOT this label shows
      const src = bn.snaps[which];
      const cv = bn.ab.cv;
      cv.width = src.width; cv.height = src.height;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 0, 0);
      bn.ab.tag.textContent = String(bn.showing + 1) + '  (tap to flip · esc to close)';
      if (!bn.ab.key) {
        bn.ab.key = (e) => { if (e.key === 'Escape') this._benchHideAB(); };
        addEventListener('keydown', bn.ab.key);
      }
    },
    _benchHideAB() {
      const bn = this._bench;
      if (!bn || !bn.ab) return;
      if (bn.ab.key) removeEventListener('keydown', bn.ab.key);
      bn.ab.ov.remove();
      bn.ab = null;
      bn.showing = -1;
    },
    benchReveal() {
      const bn = this._bench;
      if (!bn || !bn.snaps[0] || !bn.snaps[1]) return 'take two snapshots first';
      return '1 = snap ' + (bn.order[0] === 0 ? 'A' : 'B') + ', 2 = snap ' + (bn.order[1] === 0 ? 'A' : 'B');
    },
    /* ---- the same-view bookmark: seed, size, camera ----
       Founding follows Screens.replayRun's own recipe (no draft, no cloud
       slot, the HUD on), then the map is opened whole (G.freeVis) and
       paused, so a bookmarked camera lands on identical pixels every reload.
       localStorage in this project is always try/catch, `neo-` prefixed. */
    benchBookmark() {
      // the viewport rides along: clampCam pads by the HUD and the window, so
      // a phone's bookmark on a desktop lands a few pixels off — say so
      const b = { seed: S && S.seed, mode: S && S.mode, size: S && S.sizeKey, tunic: S && S.tunic && S.tunic.P,
                  x: R.cam.x, y: R.cam.y, z: R.cam.z, vw: Math.round(R.viewW()), vh: Math.round(R.viewH()) };
      try { localStorage.setItem(this.BENCH_KEY, JSON.stringify(b)); } catch (e) {}
      return b;
    },
    benchLoadBookmark() {
      try { return JSON.parse(localStorage.getItem(this.BENCH_KEY) || 'null'); } catch (e) { return null; }
    },
    benchFound(seed, size, mode, tunic) {
      if (window.Screens && Screens._founding) return false;
      this._conformClose();                    // its stashes belong to the old world
      Screens._demo = false; G.freeVis = false;
      G.newGame(String(seed), mode || 'moderate', size || 'medium', undefined, tunic || 'blue');
      if (window.Backend) { Backend.markActiveSlot(null); Backend.activeName = null; }
      Screens.lastSavedDay = 1;
      if (window.Cards && S.draft && S.draft.hand && S.draft.hand.length && !S.draft.done) Cards.pick(0);
      Screens.enterGame();
      G.freeVis = true; G.updateVisibility(); R.fogDirty = true;
      S.paused = true;
      return true;
    },
    benchGo(bm) {
      if (!bm) return false;
      if (!S || String(S.seed) !== String(bm.seed) || S.sizeKey !== bm.size) this.benchFound(bm.seed, bm.size, bm.mode, bm.tunic);
      if (bm.z) R.cam.z = bm.z;
      if (bm.x != null) R.cam.x = bm.x;
      if (bm.y != null) R.cam.y = bm.y;
      R.clampCam();
      return true;
    },
    /* ---- the edit-cost readout: tests/land.mjs §18's terrain-edit
       measurement, run on THIS device against the map on screen. The gate
       is baselined on a desktop in headless Chromium; the phone in hand is
       the real target, and this is the one tap that puts its number beside
       the gate's. Two 7x7 workloads are found on the current map — open
       grass with no water within 8 tiles, and a shore patch of 15–34 water
       tiles — each timed as whole batches of 49 drawTileAt (mean per edit:
       performance.now() is clamped, so single edits cannot be timed), the
       MIN over 9 batches after two warm-ups. ~1,100 repaints of pixels that
       come out identical (the repaint is byte-exact), so a second or two
       and nothing visible. ---- */
    EDIT_GATE: { grass: 1.01, shore: 2.56 },   // the desktop gate (tests/land.mjs §18), for the readout
    benchEditCost() {
      if (!window.R || !R.terrainCache || typeof S === 'undefined' || !S || !S.map) return 'no map';
      const W = CFG.W, H = CFG.H, terr = S.map.terrain;
      const near = (cx, cy, r) => {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < W && y < H && terr[y * W + x] === T.WATER) return true;
        }
        return false;
      };
      let gp = null, sp = null;
      for (let y = 2; y < H - 9 && !(gp && sp); y++) for (let x = 2; x < W - 9 && !(gp && sp); x++) {
        let grass = 0, water = 0;
        for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
          const t = terr[(y + dy) * W + x + dx];
          if (t === T.GRASS) grass++; else if (t === T.WATER) water++;
        }
        if (!gp && grass === 49 && !near(x + 3, y + 3, 8)) gp = [x, y];
        if (!sp && water >= 15 && water <= 34) sp = [x, y];
      }
      const batch = (p) => {
        const t = performance.now();
        for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) R.drawTileAt(p[0] + dx, p[1] + dy);
        return (performance.now() - t) / 49;
      };
      const minOfMeans = (p) => {
        if (!p) return null;
        batch(p); batch(p);
        let m = Infinity;
        for (let k = 0; k < 9; k++) m = Math.min(m, batch(p));
        return m;
      };
      const eg = minOfMeans(gp), es = minOfMeans(sp);
      const f = v => v == null ? 'n/a' : v.toFixed(2) + 'ms';
      return 'edit: grass ' + f(eg) + ' · shore ' + f(es) + '  (desktop gate ' +
        this.EDIT_GATE.grass + ' / ' + this.EDIT_GATE.shore + ')';
    },
    _benchPanel() {
      const bn = this._bench;
      const p = document.createElement('div');
      p.id = 'devBench';
      p.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;background:rgba(26,20,14,.94);' +
        'border:1px solid #6b5636;padding:8px 10px;font:12px monospace;color:#e8dfc8;' +
        'width:min(330px,92vw);max-height:62vh;overflow:auto;border-radius:4px';
      p.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<b>LAND BENCH</b><button id="dbClose" style="font:12px monospace">×</button></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0">' +
        '<button id="dbSnapA" style="font:11px monospace">snap A</button>' +
        '<button id="dbSnapB" style="font:11px monospace">snap B</button>' +
        '<button id="dbFlip" style="font:11px monospace">A/B flip</button>' +
        '<button id="dbReveal" style="font:11px monospace">reveal</button>' +
        '<span id="dbABInfo" style="opacity:.7;font:11px monospace"></span></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0">' +
        'seed <input id="dbSeed" style="font:11px monospace;width:90px"> ' +
        '<select id="dbSize" style="font:11px monospace"><option>medium</option><option>large</option><option>xlarge</option></select>' +
        '<button id="dbFound" style="font:11px monospace">found</button>' +
        '<button id="dbSave" style="font:11px monospace">save cam</button>' +
        '<button id="dbGo" style="font:11px monospace">go</button>' +
        '<label style="font:11px monospace;display:flex;align-items:center;gap:3px">' +
        '<input type="checkbox" id="dbGolden">golden hour</label></div>' +
        '<div id="dbBm" style="opacity:.6;font:10px monospace;margin:2px 0"></div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0">' +
        '<input id="dbFilter" placeholder="filter dials…" style="font:11px monospace;flex:1">' +
        '<button id="dbReset" style="font:11px monospace">defaults</button>' +
        '<button id="dbCopy" style="font:11px monospace">copy values</button></div>' +
        '<textarea id="dbOut" style="display:none;width:100%;height:80px;font:10px monospace;background:#1a140e;color:#9d9;border:1px solid #4a3c28"></textarea>' +
        '<div id="dbRows"></div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin:6px 0 2px">' +
        '<button id="dbEdit" style="font:11px monospace">edit ms</button>' +
        '<span id="dbPerf" style="opacity:.8;font:10px monospace"></span></div>' +
        '<div style="opacity:.55;font:10px monospace;margin-top:6px">a dial re-derives and bakes the whole map (~250ms after the last change)</div>';
      document.body.appendChild(p);
      bn.panel = p;
      p.querySelector('#dbClose').onclick = () => this._benchClose();
      p.querySelector('#dbEdit').onclick = () => {
        const el = p.querySelector('#dbPerf');
        el.textContent = 'measuring…';
        setTimeout(() => { el.textContent = this.benchEditCost(); }, 30);
      };
      p.querySelector('#dbSnapA').onclick = () => this.benchSnap(0);
      p.querySelector('#dbSnapB').onclick = () => this.benchSnap(1);
      p.querySelector('#dbFlip').onclick = () => this.benchFlip();
      p.querySelector('#dbReveal').onclick = () => { p.querySelector('#dbABInfo').textContent = this.benchReveal(); };
      const seedIn = p.querySelector('#dbSeed'), sizeSel = p.querySelector('#dbSize');
      if (typeof S !== 'undefined' && S) { seedIn.value = S.seed || ''; sizeSel.value = S.sizeKey || 'medium'; }
      p.querySelector('#dbFound').onclick = () => {
        if (!seedIn.value) return;
        this.benchFound(seedIn.value, sizeSel.value, 'moderate', (S && S.tunic && S.tunic.P) || 'blue');
        this._benchRender();
      };
      p.querySelector('#dbSave').onclick = () => { this.benchBookmark(); this._benchRender(); };
      p.querySelector('#dbGo').onclick = () => { this.benchGo(this.benchLoadBookmark()); this._benchRender(); };
      p.querySelector('#dbGolden').onchange = (e) => { this.forceDayF = e.target.checked ? this.GOLDEN_HOUR : null; };
      p.querySelector('#dbFilter').oninput = (e) => { bn.filter = e.target.value.toLowerCase(); this._benchRows(); };
      p.querySelector('#dbReset').onclick = () => this.benchReset();
      p.querySelector('#dbCopy').onclick = async () => {
        const txt = this.benchExport();
        const ta = p.querySelector('#dbOut');
        ta.style.display = ''; ta.value = txt;
        try { await navigator.clipboard.writeText(txt); } catch (e) { ta.select(); try { document.execCommand('copy'); } catch (e2) {} }
      };
      this._benchRows();
      this._benchRender();
    },
    _benchRows() {
      const bn = this._bench;
      if (!bn || !bn.panel) return;
      const box = bn.panel.querySelector('#dbRows');
      box.innerHTML = '';
      for (const d of this.benchDials()) {
        const name = d.g + '.' + d.k;
        if (bn.filter && name.toLowerCase().indexOf(bn.filter) < 0) continue;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:2px 0;font:11px monospace';
        const lab = document.createElement('span');
        lab.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        lab.textContent = name;
        const def = bn.defaults[name];
        if (d.o[d.k] !== def) lab.style.color = '#e8c15a';
        const rng = document.createElement('input');
        rng.type = 'range'; rng.min = d.min; rng.max = d.max; rng.step = d.step;
        rng.value = d.o[d.k]; rng.style.width = '110px';
        const val = document.createElement('span');
        val.style.cssText = 'width:52px;text-align:right';
        val.textContent = String(d.o[d.k]);
        rng.oninput = () => {
          const v = +rng.value;
          d.o[d.k] = d.step >= 1 ? Math.round(v) : +v.toFixed(4);
          val.textContent = String(d.o[d.k]);
          lab.style.color = d.o[d.k] !== def ? '#e8c15a' : '';
          this._benchSchedule();
        };
        row.appendChild(lab); row.appendChild(rng); row.appendChild(val);
        box.appendChild(row);
      }
    },
    _benchRender() {
      const bn = this._bench;
      if (!bn || !bn.panel) return;
      const bm = this.benchLoadBookmark();
      const vpOff = bm && bm.vw && window.R && (bm.vw !== Math.round(R.viewW()) || bm.vh !== Math.round(R.viewH()));
      bn.panel.querySelector('#dbBm').textContent = bm
        ? 'bookmark: ' + bm.seed + ' · ' + bm.size + ' · cam ' + Math.round(bm.x) + ',' + Math.round(bm.y) + ' @' + bm.z +
          (vpOff ? ' · ⚠ saved at ' + bm.vw + '×' + bm.vh + ', not this viewport' : '')
        : 'no bookmark saved';
      const info = bn.panel.querySelector('#dbABInfo');
      info.textContent = (bn.snaps[0] ? 'A✓ ' : 'A– ') + (bn.snaps[1] ? 'B✓' : 'B–');
    },

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
      '<button id="devArtBenchBtn" style="font:11px monospace">land bench…</button>' +
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
    // the LAND BENCH: dials, blind A/B, the same-view bookmark (LAND_REFRESH.md Phase 0)
    p.querySelector('#devArtBenchBtn').onclick = () => DevArt.openBench();
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
