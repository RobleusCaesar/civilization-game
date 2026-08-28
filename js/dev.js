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
      // formation pieces: {terrain}-{W}x{H}-{shape}-{letter}.png — validated
      // by the same parser the loader uses; the stem needs no catalog entry,
      // so an artist can preview a brand-new piece before it is listed
      if (/^[a-z]+-\d+x\d+-[a-z0-9]+-[a-z]\.png$/.test(lower)) {
        const stem = lower.slice(0, -4);
        const pf = Assets.parseFormationStem(stem, null);
        return pf ? { kind: 'formation', terrain: pf.tName, stem } : null;
      }
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
      }
      g.restore();
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
      '<input type="file" id="devArtFile" accept="image/png,.png" multiple style="display:none">' +
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
