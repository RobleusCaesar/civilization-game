"use strict";
/* Touch/mouse input, build menu, selection panel, top bar, toasts, save/load. */

const UI = {
  sel: null,          // {type:'unit'|'bld', id}
  placing: null,      // building key while placing
  placeTile: null,
  /* ---- PLACEMENT MODE (tests/placement.mjs) ---- a tap arms a key from the
     build menu; a translucent true-art ghost then rides the finger over a
     green/red validity grid, and a ✓/✗ pair commits or discards. All state is
     UI-local and never saved; exitPlacement() is the ONLY way out and clears
     every scrap of it. The wall keeps its own proven line-drag flow. */
  placeGhost: null,     // {x, y, set} — snapped footprint origin; set = ✓/✗ showing
  placeMap: null,       // Uint8Array W*H: 0 valid · 1 invalid · 255 no grid cell
  placeMapStamp: null,  // {gen, day, t} — what the cached validity map was built against
  placeVerdict: null,   // {ok, why, afford} for the ghost's tile (live, seal included)
  placeDragging: false, // a finger is dragging the ghost right now
  placePtr: null,       // {x, y, touch} last pointer position while placing (edge scroll)
  _placeAffordT: 0,     // afford re-check cadence
  _placeCueOk: null,    // last verdict for the valid↔invalid crossing cue
  pointers: new Map(),
  pinchD: 0,
  downAt: null,
  lastTap: null,         // {x,y,t} of the last committed tap — for double-tap detection
  refreshT: 0,
  menuCollapsed: false,  // build menu tucked away for a bigger view
  panelHidden: false,    // selection panel tucked away — the selection itself survives
  miniCollapsed: false,  // minimap hidden
  builderFor: null,      // villager id that will build the next placed building
  confirmDemolish: 0,    // building id awaiting demolish confirmation
  wallDrag: null,        // tile chain while dragging a wall line
  wallGhost: null,       // [{x,y,ok,mask}] preview of the dragged line
  terraDrag: null,       // tile chain while dragging a sapper dig/clear line
  terraGhost: null,      // [{x,y,ok}] preview of the dragged terraform line
  moveDragArm: null,     // {ax,ay} press landed ON the selection — a drag becomes a move order
  moveDrag: null,        // {ax,ay,sx,sy} live drag-to-move: tether anchor (tiles) + finger (screen)
  moveFlash: null,       // {x,y,t,life} confirmation pulse where a drag order landed
  settingRally: null,    // building id waiting for a rally-point tap
  /* The build menu. NO GATE HERE — a gate is not raised on open ground, it is
     cut into a wall you have already built: select a standing section and use
     "🚪 Build Gate" (see the wall panel in renderPanel / the `togate` action).
     Wall sits immediately left of the Watchtower: the two defensive works read
     together. */
  // …and LAST, always last, the Ancient Wonder (tests/wonder.mjs) — the end of
  // the list because it is the end of the game
  // the Gold Mine is deliberately NOT here (CFG.BUILDINGS.mine.noMenu): a seam
  // is found and claimed in the field, never raised from the menu
  MENU_KEYS: ['house', 'farm', 'lumber', 'quarry', 'lodge', 'wall', 'tower', 'barracks', 'stable', 'range', 'dock', 'siege', 'sapper', 'warcamp', 'trade', 'wonder'],
  RES_NAME: { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' },
  tradeNeed: null,            // Trading Post step 1 → 2: what the caravan brings home

  // paint a sprite into an icon canvas: back it at 64px and scale the WHOLE
  // sprite in (sprites are now 64px — a naive drawImage would clip to a corner),
  // so menu/panel thumbnails read clearly whatever the source resolution.
  /* THE ART IS THE ICON, ALWAYS (tests/art-pipeline.mjs). Every icon in the
     game is painted straight from the SAME drawable the map draws, so a
     redesigned building — procedural edit or a dropped-in PNG — shows up in
     the build menu and the panel with no manifest and no code change.

     Painting is IDEMPOTENT: a canvas remembers the sprite it currently holds
     and re-drawing the same one costs nothing. That is what lets the callers
     below simply ask on every frame instead of trying to guess WHEN art
     changed — and guessing is exactly what was broken, since building PNGs
     decode asynchronously LONG after the menu was laid out at boot, so the
     icon kept the procedural drawing for the whole session. */
  iconInto(ic, spr) {
    if (!spr) return;
    if (ic._cfIcon === spr) return;   // already showing this exact drawable
    ic._cfIcon = spr;
    ic.width = 64; ic.height = 64;
    const g = ic.getContext('2d');
    // hand-authored PNG art keeps its aspect in the menu too — fit within the
    // icon, feet on the floor (the same reading as R.blitBld's anchor rule)
    if (spr._cfArt && spr.height !== spr.width) {
      g.imageSmoothingEnabled = true;
      const s = Math.min(64 / spr.width, 64 / spr.height);
      const w = spr.width * s, h = spr.height * s;
      g.drawImage(spr, (64 - w) / 2, 64 - h, w, h);
      return;
    }
    // PNG art downscales smoothly (a 256px master decimated nearest-neighbour
    // shimmers); procedural pixel art keeps its hard-edged look
    g.imageSmoothingEnabled = !!spr._cfArt;
    g.drawImage(spr, 0, 0, spr.width, spr.height, 0, 0, 64, 64);
  },

  init() {
    /* desktop parity for placement mode: Esc = the ✗ (discard the ghost,
       menu back with the choice intact), Enter = the ✓. Installed ONCE, for
       the session — gated on state, so entering/exiting placement a hundred
       times leaks nothing (tests/placement.mjs). */
    document.addEventListener('keydown', e => {
      if (!this.placing || this.placing === 'wall' || !window.S) return;
      if (e.key === 'Escape') { this.cancelPlacement(); e.preventDefault(); }
      else if (e.key === 'Enter' && this.placeGhost && this.placeGhost.set) {
        this.confirmPlacement(); e.preventDefault();
      }
    });
    // remembered preference: once the player knows the ropes they can tuck the
    // unit help-text away (− button); ℹ️ brings it back. Persists across games.
    try { this.helpHidden = localStorage.getItem('neo-unit-help') === '1'; } catch (e) { this.helpHidden = false; }
    // saved-army heartbeat: banners follow their soldiers (see tickArmies)
    setInterval(() => { try { this.tickArmies(); } catch (e) {} }, 900);
    // rival-wonder countdown (tests/calm-peace.mjs): a standing warning while
    // the enemy monument rises — the days on it are the whole endgame clock
    setInterval(() => { try { this.tickWonderWarn(); } catch (e) {} }, 900);
    // procedural UI chrome (ARTSTYLE): a dark plank texture generated once and
    // handed to CSS — panels, bars, and cards all share it. No image files.
    {
      const AP = ART.PALETTE;
      const tex = document.createElement('canvas');
      tex.width = tex.height = 64;
      const g = tex.getContext('2d');
      g.fillStyle = AP.ink[1]; g.fillRect(0, 0, 64, 64);
      const r = ART.rng(97);
      for (let x = 0; x < 64; x += 16) {                 // plank strips
        g.fillStyle = 'rgba(62,44,20,' + (0.22 + r() * 0.10).toFixed(2) + ')';   // wood[0] tone
        g.fillRect(x + 1, 0, 14, 64);
        g.fillStyle = 'rgba(20,16,10,0.8)';
        g.fillRect(x, 0, 1, 64);
      }
      g.fillStyle = 'rgba(165,133,77,0.05)';             // faint grain highlights
      for (let i = 0; i < 26; i++) g.fillRect((r() * 64) | 0, (r() * 64) | 0, 1, 3 + (r() * 6) | 0);
      g.fillStyle = 'rgba(20,16,10,0.5)';                // knots
      for (let i = 0; i < 5; i++) g.fillRect((r() * 62) | 0, (r() * 62) | 0, 2, 2);
      document.documentElement.style.setProperty('--wood-tex', 'url(' + tex.toDataURL() + ')');
    }
    // resource icons in the top bar
    document.querySelectorAll('.ric').forEach(c => {
      c.width = 16; c.height = 16;
      const ic = Sprites.icons[c.dataset.ic];
      if (ic) c.getContext('2d').drawImage(ic, 0, 0);
    });
    this.buildMenu();
    this.bindCanvas();
    this.bindButtons();
  },

  /* ---------------- build menu ---------------- */
  buildMenu() {
    const el = document.getElementById('buildmenu');
    el.innerHTML = '';
    for (const key of this.MENU_KEYS) {
      const d = CFG.BUILDINGS[key];
      if (d.noMenu) continue;   // claimed in the field, never bought (the Gold Mine)
      const btn = document.createElement('button');
      btn.className = 'bbtn'; btn.dataset.key = key;
      // the wonder's button is BUILT here but only SHOWN where the mode offers
      // it (refreshMenu) — the menu is laid out once, at boot, long before a
      // difficulty has been chosen
      if (key === 'wonder') btn.style.display = 'none';
      const ic = document.createElement('canvas');
      this.iconInto(ic, this.menuIconSprite(key));
      btn.appendChild(ic);
      const nm = document.createElement('div'); nm.className = 'bname'; nm.textContent = d.name;
      const co = document.createElement('div'); co.className = 'bcost'; co.textContent = Bld.costStr(Bld.effCost('P', key));
      btn.appendChild(nm); btn.appendChild(co);
      btn.addEventListener('click', () => {
        if (this.placing === key) { this.exitPlacement(); return; }   // tapping the lit button quits cleanly
        const tc = Bld.tcOf('P');
        if (d.reqTC && (!tc || tc.level < d.reqTC)) { this.toast(`Needs Town Center Lv ${d.reqTC}`, true); return; }
        // NOT affordable is no longer a refusal — placement opens in its amber
        // "scout the spot you're saving for" state, with ✓ disabled
        if (key === 'wall' && !Bld.canAfford(Bld.effCost('P', key))) { this.toast('Not enough resources', true); return; }
        this.deselect();
        // tuck the build menu away so the whole map is visible to pick a site
        // (keepPlacing: don't cancel the building we just chose)
        this.setMenuCollapsed(true, true);
        if (key === 'wall') this.placing = key;   // the wall keeps its line-drag flow
        else this.enterPlacement(key);
        this.refreshMenu();
      });
      el.appendChild(btn);
    }
  },

  /* What tier a NEW building of this key would be raised at. Everything is
     raised at Lv 1 — except walls and gates, which go up at the village-wide
     fort tier (Bld.buildSpec). So once the ring has been re-faced in stone the
     button shows stone, matching what the villager will actually build, instead
     of the starter palisade for the rest of the game. */
  menuIconLevel(key) {
    const spec = Bld.buildSpec(key, 'P');
    const n = (Sprites.building[key] || []).length || 1;
    return Math.min(n, Math.max(1, spec.level || 1));
  },

  /* The drawable a build-menu button shows: the building this key would
     actually raise, at the tier it would be raised at (menuIconLevel). It
     reads the LIVE sprite family — which is where Assets.setBuildingArt
     installs hand-authored PNGs — so new art lands here automatically.
     The wonder is the one key whose art is rolled per run. */
  menuIconSprite(key) {
    if (key === 'wonder') return (Sprites.building.wonder || [])[0];
    const fam = Sprites.building[key] || [];
    return fam[Math.min(fam.length, this.menuIconLevel(key)) - 1];
  },

  /* The drawable a BUILDING's panel icon shows. A work site follows its
     raising stage; a camp wears its people's art; everything else is simply
     the building at its level — read live, so redesigned art lands here too.
     R.bldSprite is deliberately NOT used: it hands a wall or gate its
     AUTO-TILED mask, which is the wrong picture for an icon. */
  panelIconSprite(b) {
    if (b.construction > 0 && Bld.stageOf(b) < 3) return R.stageIcon(b);
    if (b.key === 'raidercamp' && Sprites.camp && Sprites.camp[b.tribe]) return Sprites.camp[b.tribe];
    const fam = Sprites.building[b.key] || [];
    return fam[Math.min(fam.length, b.level) - 1];
  },

  /* Is the ANCIENT WONDER offered in the build menu right now? The wonder
     RULES work on every difficulty — nothing in Bld/AI/G asks what mode you
     are in — but for now only Calm SHOWS the button, because Calm is the mode
     that needed a way to win without a war. Flip `wonderMenu` on a mode in
     config.js and it appears there too, no other change. */
  wonderOffered() {
    // `G` is a script-level const, not a window property — never window.G here
    const m = G && G.modeCfg ? G.modeCfg() : null;
    return !!(m && m.wonderMenu);
  },

  refreshMenu() {
    const tc = Bld.tcOf('P');
    document.querySelectorAll('.bbtn').forEach(b => {
      const key = b.dataset.key;
      if (key === 'wonder') {
        const show = this.wonderOffered();
        b.style.display = show ? '' : 'none';
        if (!show) { if (this.placing === 'wonder') this.exitPlacement(); return; }
        // the NAME follows THIS RUN's monument (the icon is repainted below,
        // with every other key's, by the one rule)
        if (b.dataset.wonder !== S.wonder) {
          b.dataset.wonder = S.wonder;
          const nm = b.querySelector('.bname');
          if (nm) nm.textContent = CFG.BUILDINGS.wonder.name;
        }
      }
      const cost = Bld.effCost('P', key);   // card discounts show true prices
      const gated = CFG.BUILDINGS[key].reqTC && (!tc || tc.level < CFG.BUILDINGS[key].reqTC);
      b.classList.toggle('sel', this.placing === key);
      b.classList.toggle('cant', gated || !Bld.canAfford(cost));
      const co = b.querySelector('.bcost');
      if (co) {
        const txt = Bld.costStr(cost);
        if (co.textContent !== txt) co.textContent = txt;
      }
      /* THE ICON FOLLOWS THE ART, every frame. iconInto no-ops unless the
         drawable actually changed, so this covers all of it with one rule:
         a PNG that decoded after boot, the ?dev=1 live preview swapping art
         under the running game, the wall's tier stepping to stone, and this
         run's rolled monument. */
      const ic = b.querySelector('canvas');
      if (ic) this.iconInto(ic, this.menuIconSprite(key));
    });
  },

  /* ---------------- canvas input ---------------- */
  bindCanvas() {
    const cv = R.cv;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        if (this.placing === 'wall') {
          // drag paints a wall line instead of panning
          this.wallDrag = [R.screenToTile(e.clientX, e.clientY)];
          this.updateWallGhost();
          this.downAt = null;
        } else if (this.placing && this.placeGhost && this._onPlaceGhost(e.clientX, e.clientY)) {
          // the press landed ON the ghost: this drag moves the BUILDING, not
          // the camera. A press elsewhere still pans — sighting the ground is
          // half of placing well.
          this.placeDragging = true;
          this.placePtr = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
          this.placeGhostTo(e.clientX, e.clientY, e.pointerType === 'touch');
          this.downAt = null;
        } else if (this.armedSapper()) {
          // a sapper tool is armed: drag paints a line of tiles to dig/clear
          this.terraDrag = [R.screenToTile(e.clientX, e.clientY)];
          this.updateTerraGhost();
          this.downAt = null;
        } else {
          this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
          // DRAG-TO-MOVE: a press that lands ON the current selection arms a
          // move order instead of a camera pan — dragging then pulls a tether
          // to the destination and release sends them. A press that never
          // moves past the tap threshold falls through to the ordinary tap,
          // so plain taps on your own units are completely unchanged.
          this.moveDragArm = (!this.placing && !this.settingRally) ? this.dragMoveAnchor(e.clientX, e.clientY) : null;
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        this.downAt = null;
        this.wallDrag = null; this.wallGhost = null;   // pinch cancels the line
        this.terraDrag = null; this.terraGhost = null;
        this.moveDrag = null; this.moveDragArm = null; // …and the move tether
        this.placeDragging = false; this.placePtr = null;   // ghost stays put; fingers zoom
      }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      // desktop hover: with nothing pressed, the ghost rides the mouse until
      // it is parked — placement reads the ground as you sweep it
      if (!p && this.placing && this.placing !== 'wall' && this.placeGhost &&
          !this.placeGhost.set && e.pointerType === 'mouse')
        this.placeGhostTo(e.clientX, e.clientY, false);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        if (this.placeDragging) {
          this.placePtr = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
          this.placeGhostTo(e.clientX, e.clientY, e.pointerType === 'touch');
        } else if (this.wallDrag) {
          this.extendWallDrag(R.screenToTile(e.clientX, e.clientY));
        } else if (this.terraDrag) {
          this.extendTerraDrag(R.screenToTile(e.clientX, e.clientY));
        } else {
          if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8)
            this.downAt.moved = true;
          if (this.downAt && this.downAt.moved) {
            if (this.moveDragArm) {
              // the press started on the selection — this drag is an order, not
              // a pan: keep the tether pinned to the finger for the ghost
              this.moveDrag = { ax: this.moveDragArm.ax, ay: this.moveDragArm.ay, sx: e.clientX, sy: e.clientY };
            } else {
              R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
              R.clampCam();
            }
          }
        }
      } else if (this.pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchD > 0) {
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this.zoomAt(mid.x, mid.y, d / this.pinchD);
        }
        this.pinchD = d;
      }
      p.x = e.clientX; p.y = e.clientY;
      e.preventDefault();
    });
    const up = e => {
      this.pointers.delete(e.pointerId);
      if (this.placeDragging) {
        // release parks the ghost where it sits and offers ✓/✗
        this.placeDragging = false;
        this.placePtr = null;
        if (this.placeGhost) { this.placeGhost.set = true; this._placeCheck(); }
      } else if (this.wallDrag) {
        this.commitWallDrag();
        this.wallDrag = null; this.wallGhost = null;
      } else if (this.terraDrag) {
        this.commitTerraDrag();
        this.terraDrag = null; this.terraGhost = null;
      } else if (this.moveDrag) {
        // release = the order lands where the finger lifted
        this.commitMoveDrag(e.clientX, e.clientY);
        this.moveDrag = null; this.moveDragArm = null;
      } else if (this.downAt && !this.downAt.moved && performance.now() - this.downAt.t < 400) {
        // a second quick tap on (nearly) the same spot is a DOUBLE-TAP: select every
        // like unit within the grouping sphere, so a whole trebuchet line / fleet of
        // transports peels out of a mixed army in one gesture. Otherwise, a normal tap.
        const now = performance.now(), lt = this.lastTap;
        const dbl = lt && (now - lt.t) < 350 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 24;
        this.lastTap = dbl ? null : { x: e.clientX, y: e.clientY, t: now };
        if (dbl) this.handleDoubleTap(e.clientX, e.clientY);
        else this.handleTap(e.clientX, e.clientY);
      }
      if (this.pointers.size < 2) this.pinchD = 0;
      if (this.pointers.size === 0) { this.downAt = null; this.moveDragArm = null; }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => {
      this.pointers.delete(e.pointerId);
      this.downAt = null;
      this.wallDrag = null; this.wallGhost = null;
      this.terraDrag = null; this.terraGhost = null;
      this.moveDrag = null; this.moveDragArm = null;
      this.placeDragging = false; this.placePtr = null;   // ghost survives, unparked
    });
    cv.addEventListener('wheel', e => {
      this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
      e.preventDefault();
    }, { passive: false });

    document.getElementById('mini').addEventListener('pointerdown', e => {
      const r = e.target.getBoundingClientRect();
      const tx = (e.clientX - r.left) / r.width * CFG.W;
      const ty = (e.clientY - r.top) / r.height * CFG.H;
      R.centerOn(tx, ty);
      e.preventDefault(); e.stopPropagation();
    });
  },

  /* ================= PLACEMENT MODE (tests/placement.mjs) =================
     The touch-first building placement flow. One source of truth for "may it
     stand here": Bld.canPlace — the grid, the ghost, the confirm and the
     rival AI all ask it, so nobody can disagree. The VALIDITY MAP is built
     once on entry and re-built only when something that can change it does
     (a building placed → Bld._blockGen; a day tick → terrain/regrowth; a
     slow heartbeat covers fog creep) — never per frame. Seal floods are
     validated on the PICK (the ghost's own tile and the confirm), never on
     the scan — the same rule AI.plot's pickSealFree follows. */
  PLACE_HYST: 0.18,      // tiles of stickiness past a cell boundary before the snap moves
  PLACE_EDGE: 44,        // css px band at the viewport edge that auto-pans while dragging

  // did a press land on the ghost's drawn footprint? The forgiveness margin
  // is a SCREEN-space read (≥ ~26px), so a zoomed-out ghost is still a real
  // touch target instead of a 16px sliver (the design review's 44px floor)
  _onPlaceGhost(clientX, clientY) {
    const g = this.placeGhost; if (!g) return false;
    const sz = Bld.size(this.placing), TL = CFG.TILE;
    const m = Math.max(0.5, 26 / (TL * R.cam.z));
    const w = R.screenToWorld(clientX, clientY);
    const wx = w.x / TL, wy = w.y / TL;
    return wx >= g.x - m && wx <= g.x + sz + m &&
           wy >= g.y - m && wy <= g.y + sz + m;
  },

  enterPlacement(key) {
    this.placing = key;
    this.placeGhost = null;
    this.placeVerdict = null;
    this.placeDragging = false;
    this._placeCueOk = null;
    this.buildPlaceMap();
    // the ghost starts at the nearest valid cell to the middle of the view —
    // the player sees a real suggestion, not an empty field
    const c = R.screenToTile(R.viewW() / 2, R.viewH() / 2);
    const spot = this._nearestValidCell(c.x, c.y);
    if (spot) { this.placeGhost = { x: spot.x, y: spot.y, set: false }; this._placeCheck(); return; }
    /* NOWHERE TO STAND AT ALL (a farm before any soil is picked bare, a dock
       with no explored water): entering a mode with no ghost, no grid and no
       word of why is the design-review finding this closes — say why in the
       building's own voice and stay in the menu. */
    const d = CFG.BUILDINGS[key];
    this.toast(d.whyGround || (key === 'dock' ? 'No open water in reach of your town yet'
      : 'No ground for this yet — explore or clear more land'), true);
    this.exitPlacement();
    this.setMenuCollapsed(false);
  },

  /* the cached validity map: 0 = valid origin, 1 = invalid, 255 = draw no
     grid cell at all. Cells are computed with canPlace (noCost — amber is a
     STATE, not a refusal; noSeal — floods never run on a scan), only over
     explored ground, only inside the anchor region for anchored keys, and
     then trimmed to the neighbourhood of the valid cells so the grid reads
     as "the region you may build in, with its obstructions marked" instead
     of painting the whole map red. */
  buildPlaceMap() {
    const key = this.placing;
    if (!key || key === 'wall') { this.placeMap = null; return; }
    if (!Bld._block) Bld.rebuildBlock();     // gen must be CURRENT (the deckAt trap)
    const W = CFG.W, H = CFG.H, sz = Bld.size(key), d = CFG.BUILDINGS[key];
    const t0 = performance.now();
    const m = new Uint8Array(W * H); m.fill(255);
    // region prefilter: anchored keys only ever place near an anchor — skip
    // the rest of the board before canPlace is even asked
    const freeKey = d.freePlace || Bld.needsWorkedGround(key) || key === 'gate';
    let anchors = null;
    if (!freeKey) {
      anchors = Bld.list('P').filter(b => (!b.outpost && b.key !== 'warcamp') || b.key === 'warcamp');
      if (!anchors.length) anchors = null;   // first building of a run places freely
    }
    const R2 = CFG.BUILD_RANGE + 1;
    const ok = [];
    for (let y = 1; y < H - 1 - (sz - 1); y++) for (let x = 1; x < W - 1 - (sz - 1); x++) {
      const i = MapGen.idx(x, y);
      if (!S.map.explored[i]) continue;                       // fog stays clean — no grid, no hints
      if (anchors) {
        let near = false;
        for (const b of anchors) if (Math.hypot(b.x - x, b.y - y) <= R2) { near = true; break; }
        if (!near) continue;
      }
      const r = Bld.canPlace('P', key, x, y, { noCost: true, noSeal: true });
      m[i] = r.ok ? 0 : 1;
      if (r.ok) ok.push(i);
    }
    // trim: an invalid cell earns its slot only within 2 tiles of a valid one —
    // "cells far outside any plausible build area draw no grid at all"
    const keep = new Uint8Array(W * H);
    for (const i of ok) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) keep[MapGen.idx(nx, ny)] = 1;
      }
    }
    for (let i = 0; i < m.length; i++) if (m[i] === 1 && !keep[i]) m[i] = 255;
    this.placeMap = m;
    this.placeMapStamp = { gen: Bld._blockGen || 0, day: S.day, t: performance.now() };
    this.placeMapMs = this.placeMapStamp.t - t0;   // profiled; tests/placement.mjs reads it
  },

  _nearestValidCell(cx, cy) {
    const m = this.placeMap; if (!m) return null;
    const W = CFG.W;
    let best = null, bd = 1e9;
    for (let i = 0; i < m.length; i++) {
      if (m[i] !== 0) continue;
      const x = i % W, y = (i / W) | 0;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  },

  // the ghost's own tile gets the FULL check (seal flood included; cost still
  // separate — amber is a state of its own)
  _placeCheck() {
    const g = this.placeGhost;
    if (!g || !this.placing) { this.placeVerdict = null; return; }
    const r = Bld.canPlace('P', this.placing, g.x, g.y, { noCost: true });
    const afford = Bld.canAfford(Bld.effCost('P', this.placing));
    this.placeVerdict = { ok: r.ok, why: r.why || '', code: r.code || '', afford,
      warn: r.warn || '', warnWhy: r.warnWhy || '' };
    // the valid↔invalid crossing cue (subtle; never on the first look)
    if (this._placeCueOk !== null && this._placeCueOk !== r.ok) this.cue(r.ok ? 'ok' : 'bad');
    this._placeCueOk = r.ok;
  },

  /* snap the ghost to the pointer with hysteresis, footprint centered on the
     EXACT point under the finger — sticky enough that a finger resting on a
     cell boundary never flickers between neighbours. (An earlier draft
     lifted the ghost ~2 tiles above a touch to dodge the thumb; in play
     that read as the building landing above where you pointed — the ghost's
     translucency and the framed footprint keep it legible under a thumb,
     so the building goes where the finger IS.) */
  placeGhostTo(clientX, clientY, touch) {
    const key = this.placing; if (!key || key === 'wall') return;
    const sz = Bld.size(key), TL = CFG.TILE;
    const w = R.screenToWorld(clientX, clientY);
    const fox = w.x / TL - sz / 2, foy = w.y / TL - sz / 2;   // fractional footprint origin
    const g = this.placeGhost;
    let nx = Math.round(fox), ny = Math.round(foy);
    if (g && Math.abs(fox - g.x) < 0.5 + this.PLACE_HYST) nx = g.x;
    if (g && Math.abs(foy - g.y) < 0.5 + this.PLACE_HYST) ny = g.y;
    nx = Math.max(1, Math.min(CFG.W - 1 - sz, nx));
    ny = Math.max(1, Math.min(CFG.H - 1 - sz, ny));
    if (g && g.x === nx && g.y === ny) return;
    this.placeGhost = { x: nx, y: ny, set: g ? g.set : false };
    this._placeCheck();
  },

  // a tap (or a released drag) parks the ghost and offers ✓/✗
  placeGhostSet(tx, ty) {
    const key = this.placing; if (!key || key === 'wall') return;
    const sz = Bld.size(key);
    const nx = Math.max(1, Math.min(CFG.W - 1 - sz, tx - ((sz / 2) | 0)));
    const ny = Math.max(1, Math.min(CFG.H - 1 - sz, ty - ((sz / 2) | 0)));
    this.placeGhost = { x: nx, y: ny, set: true };
    this.setMenuCollapsed(true, true);       // sighting needs the whole map
    this._placeCheck();
  },

  /* CONFIRM re-validates from scratch — the tint is never trusted (the world
     can change between release and ✓: a building finished, a villager felled
     the anchor, the treasury drained). The one placement truth runs with
     everything on: seal flood AND cost. */
  confirmPlacement() {
    const key = this.placing, g = this.placeGhost;
    if (!key || !g || !g.set) return;
    const r = Bld.canPlace('P', key, g.x, g.y);
    if (!r.ok) {
      this.toast(r.why, true);
      this.buildPlaceMap();                  // the world moved — show the new truth
      this._placeCheck();
      return;
    }
    Bld.place('P', key, g.x, g.y, { builderId: this.builderFor });
    // a sealing placement was allowed, and is ACKNOWLEDGED — the player chose
    // to shut their own people in, and the toast marks the moment they did
    if (r.warn === 'sealed') this.toast('Your town is walled in — only a gate lets your people out', true);
    // the materials land: a ring of dust billows out from under the new site
    if (R.startPlacePoof) R.startPlacePoof(g.x, g.y, Bld.size(key));
    this.cue('confirm');
    this.exitPlacement();
  },
  // ✗ / Esc: the ghost is discarded, the menu reopens with the selection
  // intact — one tap on the map tries again, one tap on the lit button quits
  cancelPlacement() {
    this.placeGhost = null;
    this.placeVerdict = null;
    this.placeDragging = false;
    this._placeCueOk = null;
    this._placeDom(false);
    this.setMenuCollapsed(false, true);
    this.refreshMenu();
  },
  // the ONLY full exit — no orphaned ghost, no stuck overlay, no stale state
  exitPlacement() {
    this.placing = null;
    this.placeTile = null;
    this.builderFor = null;
    this.placeGhost = null;
    this.placeMap = null;
    this.placeMapStamp = null;
    this.placeVerdict = null;
    this.placeDragging = false;
    this.placePtr = null;
    this._placeCueOk = null;
    this._placeDom(false);
    this.refreshMenu();
  },

  /* per-frame placement upkeep, called from UI.refresh BEFORE its 0.25s
     throttle: edge scrolling, the staleness checks on the cached validity
     map, and the DOM widget riding the ghost. Cheap when idle: three field
     compares and out. */
  tickPlacement(dt) {
    if (!this.placing || this.placing === 'wall' || !window.S || !S.map) {
      if (this._placeUIVisible) this._placeDom(false);
      return;
    }
    // EDGE SCROLL: dragging the ghost against the viewport edge pans the map
    if (this.placeDragging && this.placePtr) {
      const E = this.PLACE_EDGE, vw = R.viewW(), vh = R.viewH();
      const top = (R.topReserve || 0) + E, bot = vh - (R.bottomReserve || 0) - E;
      const p = this.placePtr;
      let px = 0, py = 0;
      if (p.x < E) px = -(E - p.x); else if (p.x > vw - E) px = p.x - (vw - E);
      if (p.y < top) py = -(top - p.y); else if (p.y > bot) py = p.y - bot;
      if (px || py) {
        const v = 12 * dt / R.cam.z;         // smooth, zoom-honest
        R.cam.x += Math.max(-1, Math.min(1, px / E)) * v * 60;
        R.cam.y += Math.max(-1, Math.min(1, py / E)) * v * 60;
        R.clampCam();
        this.placeGhostTo(p.x, p.y, p.touch);   // the ghost stays under the finger
      }
    }
    // STALE MAP? rebuild only on real change: a placement (blockGen), a day
    // tick (terrain/regrowth), or the 1.2s heartbeat that covers fog creep
    const st = this.placeMapStamp;
    if (!Bld._block) Bld.rebuildBlock();
    if (!st || st.gen !== (Bld._blockGen || 0) || st.day !== S.day ||
        performance.now() - st.t > 1200) {
      this.buildPlaceMap();
      this._placeCheck();
    }
    // afford is global, not per-tile — re-check on its own quick cadence
    this._placeAffordT -= dt;
    if (this._placeAffordT <= 0) {
      this._placeAffordT = 0.3;
      if (this.placeVerdict) {
        const a = Bld.canAfford(Bld.effCost('P', this.placing));
        if (a !== this.placeVerdict.afford) { this.placeVerdict.afford = a; }
      }
    }
    this._placeDomSync();
  },

  /* ---- the ✓/✗ pair and the reason chip: persistent DOM, built once ---- */
  _placeUIVisible: false,
  _ensurePlaceDom() {
    if (this._placeEl) return this._placeEl;
    const el = document.createElement('div');
    el.id = 'placeUI';
    el.innerHTML =
      '<div id="placeWhy"></div>' +
      '<div id="placeBtns">' +
      '<button id="placeNo" aria-label="Cancel placement">✕</button>' +
      '<button id="placeOk" aria-label="Confirm placement">✓</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#placeNo').addEventListener('click', () => this.cancelPlacement());
    el.querySelector('#placeOk').addEventListener('click', () => this.confirmPlacement());
    this._placeEl = el;
    return el;
  },
  _placeDom(show) {
    const el = this._ensurePlaceDom();
    el.style.display = show ? 'block' : 'none';
    this._placeUIVisible = show;
  },
  _placeDomSync() {
    const g = this.placeGhost, v = this.placeVerdict;
    if (!g) { if (this._placeUIVisible) this._placeDom(false); return; }
    const el = this._ensurePlaceDom();
    if (!this._placeUIVisible) this._placeDom(true);
    const TL = CFG.TILE, z = R.cam.z, sz = Bld.size(this.placing);
    const sx = (g.x * TL - R.cam.x) * z, sy = (g.y * TL - R.cam.y) * z, sw = sz * TL * z;
    const vw = R.viewW(), vh = R.viewH();
    // buttons: visible only when the ghost is parked; positioned above the
    // footprint, flipped below when the top is tight, always fully on-screen
    const btns = el.querySelector('#placeBtns');
    const showBtns = g.set && !this.placeDragging;
    btns.style.display = showBtns ? 'flex' : 'none';
    let btnsBelow = false;
    if (showBtns) {
      // the pair sits BENEATH the footprint — under the doorstep, not on a
      // neighbour's roof — and flips above only when the bottom bar is tight
      const bw = 116, bh = 46;
      const floor = vh - (R.bottomReserve || 0) - bh - 10;
      let bx = sx + sw / 2 - bw / 2, by = sy + sw + 12;
      btnsBelow = true;
      if (by > floor) { by = sy - bh - 14; btnsBelow = false; }
      bx = Math.max(8, Math.min(vw - bw - 8, bx));
      by = Math.max((R.topReserve || 0) + 8, Math.min(vh - bh - 8, by));
      btns.style.transform = `translate(${bx | 0}px, ${by | 0}px)`;
      const okB = el.querySelector('#placeOk');
      const usable = v && v.ok && v.afford;
      okB.classList.toggle('off', !usable);
    }
    // the chip: the reason when invalid, the missing goods when amber —
    // never leave the player guessing, never chatter when everything is fine.
    // It always takes the OPPOSITE side of the ✓/✗ pair, so they can't collide.
    const why = el.querySelector('#placeWhy');
    let msg = '';
    if (v && !v.ok) msg = '⃠ ' + v.why;
    else if (v && !v.afford) msg = '⏳ Need ' + this._missingCostStr();
    // a WARNING rides a valid spot (sealing your own town in is allowed —
    // the chip just says what it means, so the choice is an informed one)
    else if (v && v.warn) msg = '⚠ ' + v.warnWhy;
    if (msg) {
      why.style.display = 'block';
      if (why.textContent !== msg) why.textContent = msg;
      const cw = Math.min(260, why.offsetWidth || 160), ch = 30;
      let cx2 = sx + sw / 2 - cw / 2;
      // opposite side of the pair: buttons beneath → chip above, and back —
      // and above the ghost during a touch drag, where the thumb owns below
      const thumb = this.placeDragging && this.placePtr && this.placePtr.touch;
      let cy2 = ((showBtns && btnsBelow) || thumb) ? sy - 44 : sy + sw + 8;
      if (!showBtns && cy2 > vh - 120) cy2 = sy - 44;
      cx2 = Math.max(8, Math.min(vw - cw - 8, cx2));
      cy2 = Math.max((R.topReserve || 0) + 4, Math.min(vh - 40, cy2));
      // never across the minimap (design review): slide left of it, or drop
      // under the ghost when the ghost itself is up in that corner
      const mini = this._miniRect || (this._miniRect = (document.getElementById('mini') || {}).getBoundingClientRect
        ? document.getElementById('mini').getBoundingClientRect() : null);
      if (mini && cx2 + cw > mini.left - 4 && cy2 < mini.bottom + 4 && cy2 + ch > mini.top - 4) {
        if (mini.left - 12 - cw >= 8) cx2 = mini.left - 12 - cw;
        else cy2 = Math.min(vh - 40, mini.bottom + 8);
      }
      why.style.transform = `translate(${cx2 | 0}px, ${cy2 | 0}px)`;
      why.classList.toggle('amber', !!(v && v.ok && !v.afford));
    } else why.style.display = 'none';
  },
  _missingCostStr() {
    const cost = Bld.effCost('P', this.placing), out = [];
    const IC = { food: '🍖', wood: '🪵', stone: '🪨', gold: '🪙' };
    for (const k in cost) {
      const short = cost[k] - (S.res[k] || 0);
      if (short > 0) out.push((IC[k] || k) + ' ' + short);   // icon-first, the Bld.costStr convention
    }
    return out.join('   ') || '…';
  },

  /* a whisper of feedback: valid↔invalid crossings and the confirm. WebAudio
     built lazily on first use (needs a user gesture anyway); haptics where
     the platform has them. The game has no sound system yet, so the switch
     is a stored preference future settings can surface: localStorage
     neo-sfx = '0' silences everything. */
  cue(kind) {
    try {
      if (localStorage.getItem('neo-sfx') === '0') return;
    } catch (e) {}
    try {
      if (navigator.vibrate) navigator.vibrate(kind === 'bad' ? 16 : 8);
    } catch (e) {}
    try {
      const ctx = this._sfx || (this._sfx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'triangle';
      const f = kind === 'bad' ? 196 : kind === 'confirm' ? 660 : 440;
      o.frequency.value = f;
      if (kind === 'confirm') o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.09);
      gn.gain.value = 0.045;
      gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (kind === 'confirm' ? 0.12 : 0.06));
      o.connect(gn).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.13);
    } catch (e) { /* no audio — the visuals carry it */ }
  },

  /* ---------------- sapper dig/clear line dragging ---------------- */
  // the selected unit, if it's an OWN sapper with a dig/clear tool armed
  armedSapper() {
    if (!this.terraMode || this.terraMode === 'bridge' || !this.sel || this.sel.type !== 'unit') return null;
    const u = Units.get(this.sel.id);
    return (u && u.owner === 'P' && u.kind === 'sapper') ? u : null;
  },
  extendTerraDrag(t) {
    const chain = this.terraDrag;
    const keyOf = (x, y) => x + ',' + y;
    const seen = new Set(chain.map(c => keyOf(c.x, c.y)));
    let { x: x0, y: y0 } = chain[chain.length - 1];
    if (x0 === t.x && y0 === t.y) return;
    // orthogonally-stepped Bresenham (same as the wall line) so the chain is a
    // connected run of tiles with no diagonal gaps
    const dx = Math.abs(t.x - x0), dy = -Math.abs(t.y - y0);
    const sx = x0 < t.x ? 1 : -1, sy = y0 < t.y ? 1 : -1;
    let err = dx + dy, guard = 0;
    const push = () => {
      if (!MapGen.inB(x0, y0)) return;
      const k = keyOf(x0, y0);
      if (!seen.has(k)) { seen.add(k); chain.push({ x: x0, y: y0 }); }
    };
    while (!(x0 === t.x && y0 === t.y) && guard++ < 400) {
      const e2 = 2 * err;
      if (e2 >= dy && x0 !== t.x) { err += dy; x0 += sx; push(); }
      if (e2 <= dx && y0 !== t.y) { err += dx; y0 += sy; push(); }
    }
    this.updateTerraGhost();
  },
  updateTerraGhost() {
    const u = this.armedSapper(), job = this.terraMode, chain = this.terraDrag || [];
    if (!u) { this.terraGhost = chain.map(t => ({ x: t.x, y: t.y, ok: false })); return; }
    // the guild bills per tile — the drag ghost spends a running budget just
    // like the wall ghost, so a line you can half afford queues half the line
    const fee = CFG.TERRAFORM[job + 'Cost'];
    const budget = Object.assign({}, S.res);
    this.terraGhost = chain.map(t => {
      let ok = !!S.map.explored[MapGen.idx(t.x, t.y)] && Units.canTerraform(u.owner, t.x, t.y, job);
      if (ok && job === 'dig' && Terraform.digWouldSeal(t.x, t.y)) ok = false;
      if (ok && fee) {
        for (const k in fee) if ((budget[k] || 0) < fee[k]) { ok = false; break; }
        if (ok) for (const k in fee) budget[k] -= fee[k];
      }
      return { x: t.x, y: t.y, ok };
    });
  },
  commitTerraDrag() {
    const u = this.armedSapper(), job = this.terraMode;
    const list = (this.terraGhost || []).filter(t => t.ok).map(t => ({ x: t.x, y: t.y, job }));
    // reclamation must work SHORE-FIRST: a deep tile needs the shallow one ahead of
    // it filled so the sapper has ground to stand on. Order the line by depth.
    if (job === 'mound') list.sort((a, b) => Terraform.reclaimDepth(a.x, a.y) - Terraform.reclaimDepth(b.x, b.y));
    if (u && list.length) {
      const n = Units.queueTerraform(u, list);
      const noun = job === 'dig' ? 'Trench' : job === 'mound' ? 'Mound' : 'Clear';
      // `n` counts tiles QUEUED, not tiles that will actually get worked — a
      // queued tile with no passable neighbour to stand beside fails silently
      // inside startNextTerraform, leaving nothing running and nothing left
      // in the queue. Only call this a real dispatch when something is
      // genuinely underway: either the sapper is now actively on the job, or
      // (already mid-job elsewhere) this order is truly waiting behind it.
      const working = n > 0 && ((u.task && u.task.type === 'terraform') || (u.jobs && u.jobs.length > 0));
      this.toast(n
        ? (working ? `${noun} line: ${n} tile${n > 1 ? 's' : ''} — the sapper works them in order`
                   : 'No clear ground to stand beside — try a different tile')
        : 'Those tiles are already queued');
      if (working) this.dispatchedWorker();
      else { this.terraMode = null; this.renderPanel(); }   // nothing actually underway — stays selected
    } else if ((this.terraGhost || []).length) {
      this.toast(job === 'dig' ? 'No open ground to dig there'
        : job === 'mound' ? 'Nothing to mound there — open ground or near-shore water' : 'Nothing to clear there', true);
    }
  },

  /* ---------------- wall line dragging ---------------- */
  extendWallDrag(t) {
    const chain = this.wallDrag;
    const keyOf = (x, y) => x + ',' + y;
    const seen = new Set(chain.map(c => keyOf(c.x, c.y)));
    let { x: x0, y: y0 } = chain[chain.length - 1];
    if (x0 === t.x && y0 === t.y) return;
    // orthogonally-stepped Bresenham so the chain stays connected (no diagonal gaps)
    const dx = Math.abs(t.x - x0), dy = -Math.abs(t.y - y0);
    const sx = x0 < t.x ? 1 : -1, sy = y0 < t.y ? 1 : -1;
    let err = dx + dy, guard = 0;
    const push = () => {
      if (!MapGen.inB(x0, y0)) return;
      const k = keyOf(x0, y0);
      if (!seen.has(k)) { seen.add(k); chain.push({ x: x0, y: y0 }); }
    };
    while (!(x0 === t.x && y0 === t.y) && guard++ < 200) {
      const e2 = 2 * err;
      if (e2 >= dy && x0 !== t.x) { err += dy; x0 += sx; push(); }
      if (e2 <= dx && y0 !== t.y) { err += dx; y0 += sy; push(); }
    }
    this.updateWallGhost();
  },

  updateWallGhost() {
    const chain = this.wallDrag || [];
    const cost = Bld.buildSpec('wall').lv.cost;
    const budget = Object.assign({}, S.res);
    const chainSet = new Set(chain.map(c => c.x + ',' + c.y));
    this.wallGhost = chain.map(t => {
      // walls raise anywhere explored (no build-range gate) — just clear ground
      // you can afford; canPlace re-checks on commit
      let ok = Bld.tileFree(t.x, t.y) && !!S.map.explored[MapGen.idx(t.x, t.y)];
      if (ok) {
        for (const k in cost) if ((budget[k] || 0) < cost[k]) { ok = false; break; }
        if (ok) for (const k in cost) budget[k] -= cost[k];
      }
      return { x: t.x, y: t.y, ok, mask: R.wallMaskAt(t.x, t.y, chainSet) };
    });
  },

  commitWallDrag() {
    const ghost = this.wallGhost || [];
    let placed = 0, first = null, sealed = false;
    const sites = [];
    for (const t of ghost) {
      if (!t.ok) continue;
      const r = Bld.canPlace('P', 'wall', t.x, t.y);   // re-check with live resources
      if (!r.ok) continue;
      if (r.warn === 'sealed') sealed = true;          // allowed — sealing is the player's choice
      const b = Bld.place('P', 'wall', t.x, t.y, { noAutoAssign: true });
      if (!first) first = b;
      sites.push(b);
      placed++;
    }
    if (sealed) this.toast('Your town is walled in — only a gate lets your people out', true);
    if (placed) {
      const v = Units.nearestIdleVillager(first.x, first.y);
      // start at the RIGHT end of the line: the nearest section whose finished
      // wall doesn't cut the builder off from the rest (Units.pickWorkOrder —
      // tests/work-order.mjs). Across a choke the pick falls to the FAR side,
      // so the line closes from far back toward home instead of walling the
      // far half off behind the first stone.
      let start = first;
      if (v && sites.length > 1) {
        const pick = Units.pickWorkOrder(v, sites.map(b2 => ({ x: b2.x, y: b2.y, diag: true, blocks: true, ref: b2 })));
        if (pick) start = pick.ref;
      }
      if (v && Units.assignBuild(v, start))
        this.toast(`Wall line: ${placed} section${placed > 1 ? 's' : ''} — builder en route. Tap villagers → wall to add hands.`);
      else this.toast(`Wall line placed (${placed}) — needs a builder`, true);
      // done drawing — drop out of placement so stray taps don't add walls
      this.placing = null;
      this.placeTile = null;
    } else if (ghost.length) {
      this.toast('No valid ground (or resources) for that line', true);
    }
    this.refreshMenu();
  },

  zoomAt(sx, sy, factor) {
    const before = R.screenToWorld(sx, sy);
    R.cam.z = Math.max(0.5, Math.min(3.5, R.cam.z * factor));
    const after = R.screenToWorld(sx, sy);
    R.cam.x += before.x - after.x; R.cam.y += before.y - after.y;
    R.clampCam();
  },

  /* ============================ TAP HANDLING ============================
     Under contract: tests/tap-audit.mjs (see CLAUDE.md, "Tap & selection
     contract"). Run it after any change to the tap/selection/order flow —
     hit radii, snapNear, sprite offsets, order gating — before shipping. */

  // SNAP: at phone zoom a thumb rarely lands square on the intended tile. When
  // the tapped tile can't take the order, forgive a sliver of a miss — scan the
  // eight neighbouring tiles for one that can, and take the one whose edge sits
  // closest to the true tap point (within snapR of it).
  /* CAN THIS TILE ACTUALLY BE WORKED — is it a live resource with somewhere to
     stand? Asks Units.gatherEdge, the same question assignGather asks, so the
     tap layer never promises an order the task layer refuses. */
  gatherable(u, x, y) {
    if (!MapGen.inB(x, y)) return false;
    const i = MapGen.idx(x, y);
    if (!S.map.explored[i]) return false;
    if (!CFG.GATHER[S.map.terrain[i]] || !(S.map.resAmount[i] > 0)) return false;
    return !!Units.gatherEdge(u, x, y);
  },
  /* …AND IF IT CANNOT, TAKE THE NEAREST TILE OF THE SAME STAND THAT CAN.

     A thumb landing in the INTERIOR of a dense wood or crag hits a real
     resource tile with no clear ground on any of its four sides — so the order
     was refused outright and the player got a toast for tapping the middle of
     a forest, which is exactly where a forest looks most like a forest. The
     near-miss snap could not help: it only fires when the tile under the
     finger is not a resource, and this one is.

     So: same resource, within STAND_R, nearest wins. This can only ever fire
     where the order would otherwise be REFUSED, so it cannot steal a tap that
     already works — which is what keeps it clear of the tap contract's rule 3
     (every snap gated by what the selection could actually do there). */
  STAND_R: 2,
  gatherFallback(u, x, y) {
    const i = MapGen.idx(x, y);
    const g = CFG.GATHER[S.map.terrain[i]];
    if (!g) return null;
    let best = null, bd = 1e9;
    const R = this.STAND_R;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!MapGen.inB(nx, ny)) continue;
      const ng = CFG.GATHER[S.map.terrain[MapGen.idx(nx, ny)]];
      if (!ng || ng.res !== g.res) continue;          // the same stand, not a different crop
      if (!this.gatherable(u, nx, ny)) continue;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
    return best;
  },

  snapNear(wx, wy, okFn, snapR = 0.45) {
    const tx = Math.floor(wx), ty = Math.floor(wy);
    let best = null, bd = snapR;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = tx + dx, y = ty + dy;
      if (!MapGen.inB(x, y) || !okFn(x, y)) continue;
      // distance from the tap point to the candidate tile's nearest point
      const d = Math.hypot(wx - Math.max(x, Math.min(wx, x + 1)),
                           wy - Math.max(y, Math.min(wy, y + 1)));
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  },

  /* ---------------- drag-to-move ----------------
     The second movement gesture, born of the crowded-tile problem: with six
     archers packed on one tile, TAPPING a destination near them mostly lands
     on a bystander archer and steals the selection instead of moving anyone.
     So a press that starts ON the selection and DRAGS becomes an order: a
     tether follows the finger, and wherever it lifts, the selected unit or
     party goes. The release NEVER re-selects — that is the whole point.
     Release semantics stay movement-first but honour the obvious intents:
     an enemy under the finger is attacked, an own transport is boarded, a
     villager dropped on a resource gathers it; everything else is a walk. */

  // does this press land on the current selection? → the tether's anchor
  // (visual sprite center — same SPRITE_LIFT math as tap hit-testing)
  dragMoveAnchor(sx, sy) {
    if (!S || S.over || !this.sel) return null;
    const w = R.screenToWorld(sx, sy), wx = w.x / CFG.TILE, wy = w.y / CFG.TILE;
    const UOFF = CFG.SPRITE_LIFT / CFG.TILE;
    const near = u => u && u.owner === 'P' && Math.hypot(u.x - wx, u.y - UOFF - wy) <= 0.6;
    if (this.sel.type === 'unit') {
      const u = Units.get(this.sel.id);
      return near(u) ? { ax: u.x, ay: u.y - UOFF } : null;
    }
    if (this.sel.type === 'group') {
      for (const id of this.sel.ids) {
        const u = Units.get(id);
        if (near(u)) return { ax: u.x, ay: u.y - UOFF };
      }
    }
    return null;
  },

  /* THE FOG IS NOT A WALL (tests/drag-move.mjs §8 — from a playtest: pushing
     a scout forward felt "stilted", because the vision frontier is ragged and
     a tap that LOOKS just past the faded edge lands on black and got a
     refusal). A WALK order now tolerates the dark: explored ground works as
     it always did, the FIRST RANK of unexplored tiles beside it counts as
     ground you can point at (you can see its near edge), and a tap DEEPER
     into the black walks the unit to the nearest pointable tile instead of
     refusing — "as far as you know" is the graceful answer to "go there".
     Only the plain walk gets this tolerance: gather/claim/fish/terraform
     orders all read what a tile HOLDS, which the fog exists to hide, so they
     keep the hard explored gate. A tap into deep void with nothing known
     within FOG_REACH still refuses — there is no intent to honour out there. */
  FOG_REACH: 14,
  fogWalkTarget(tile) {
    const expl = S.map.explored;
    const open = (x, y) => {
      if (!MapGen.inB(x, y)) return false;
      if (expl[MapGen.idx(x, y)]) return true;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++)
        if (MapGen.inB(x + ox, y + oy) && expl[MapGen.idx(x + ox, y + oy)]) return true;
      return false;
    };
    if (open(tile.x, tile.y)) return tile;
    return MapGen.findNear(tile.x, tile.y, this.FOG_REACH, open);
  },

  commitMoveDrag(sx, sy) {
    if (!S || S.over || !this.sel) return;
    const tile = R.screenToTile(sx, sy);
    if (!MapGen.inB(tile.x, tile.y)) return;
    const w = R.screenToWorld(sx, sy), wx = w.x / CFG.TILE, wy = w.y / CFG.TILE;
    const explored = S.map.explored[MapGen.idx(tile.x, tile.y)];
    const UOFF = CFG.SPRITE_LIFT / CFG.TILE;
    let hitUnit = null, hd = 0.7;
    for (const u of S.units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const d = Math.hypot(u.x - wx, u.y - UOFF - wy);
      if (d < hd) { hd = d; hitUnit = u; }
    }
    const hitBld = G.visibleAt(tile.x, tile.y) ? Bld.at(tile.x, tile.y) : null;
    const hitBridge = (explored && Bld.bridgeAt) ? Bld.bridgeAt(tile.x, tile.y) : null;
    const foeBldNear = () => {
      // anything not ours that can be hurt — the rival's works AND a
      // barbarian camp (Bld.foeBld)
      if (Bld.foeBld(hitBld, 'P')) return hitBld;
      const n = this.snapNear(wx, wy, (x, y) => {
        const b2 = G.visibleAt(x, y) ? Bld.at(x, y) : null; return Bld.foeBld(b2, 'P');
      }, 0.42);
      return n ? Bld.at(n.x, n.y) : null;
    };
    const flash = (at) => { const p2 = at || tile; this.moveFlash = { x: p2.x, y: p2.y, t: 0.9, life: 0.9 }; };

    if (this.sel.type === 'group') {
      const ids = this.sel.ids.filter(id => Units.get(id));
      if (!ids.length) { this.deselect(); return; }
      this.sel.ids = ids;
      const fleet = ids.every(id => { const o = Units.get(id); return o && Units.isNaval(o); });
      // ARMY STRATEGIES colour the orders (tests/army-strategies.mjs):
      // a SIEGE army treats a building tap as "form the line and bombard THIS";
      // a STRIKE army attacks with the assault autonomy OFF — when the target
      // falls it holds its ground and waits for the next order.
      const anySiege = ids.some(id => { const o = Units.get(id); return o && o.strat === 'siege'; });
      const anyStrike = ids.some(id => { const o = Units.get(id); return o && o.strat === 'strike'; });
      if (hitUnit && hitUnit.owner !== 'P') {
        if (anySiege) { this.toast('Siege targets structures — Chaos or Strike to hunt units', true); return; }
        if (hitUnit.owner === 'A') G.breakPeace();   // the first strike ends the calm truce
        for (const id of ids) {
          const u = Units.get(id);
          if (Units.isTransport(u)) continue;
          u.task = { type: 'attack' }; u.tUnit = hitUnit.id; u.tBld = 0;
          u.anchor = { x: hitUnit.x, y: hitUnit.y };
          u.defend = false; u.assault = !anyStrike && u.strat !== 'strike';
        }
        this.toast(anyStrike ? '⚡ Strike! Everyone on that one' : fleet ? '⚓ Fleet attacks!' : '⚔️ War party attacks!');
        return;
      }
      if (hitUnit && hitUnit.owner === 'P' && Units.isTransport(hitUnit)) {
        let n = 0;
        for (const id of ids) {
          const u = Units.get(id);
          if (u && Units.isBoardable(u) && Units.orderBoard(u, hitUnit)) n++;
        }
        this.toast(n ? `${n} boarding — the ${CFG.UNITS[hitUnit.kind].name} holds ${CFG.UNITS[hitUnit.kind].cap}`
          : 'Transport is full (or away from shore)', !n);
        return;
      }
      const foeB = foeBldNear();
      if (foeB) {
        if (anySiege && Units.siegeOrder(ids, foeB)) {
          this.toast('⚙️ Laying siege to the ' + Bld.def(foeB.key).name + ' — the line holds, the guns work');
          return;
        }
        for (const id of ids) { const u = Units.get(id); if (u && !Units.isTransport(u)) { u.defend = false; u.assault = !anyStrike && u.strat !== 'strike'; Units.orderAttackBuilding(u, foeB); } }
        this.toast((anyStrike ? '⚡ Strike! Everyone on the ' : fleet ? '⚔️ Fleet bombards ' : '⚔️ War party attacks ') + Bld.def(foeB.key).name);
        return;
      }
      if (hitBridge && hitBridge.owner !== 'P') {
        for (const id of ids) { const u = Units.get(id); if (u && Units.isMilitary(u)) { u.defend = false; Units.orderAttackBridge(u, hitBridge); } }
        this.toast('⚔️ War party moves to sever the bridge');
        return;
      }
      const wt = explored ? tile : this.fogWalkTarget(tile);   // the fog is not a wall
      if (!wt) { this.toast('Unexplored', true); return; }
      for (const id of ids) { const u = Units.get(id); if (u) u.defend = false; }
      Units.groupMove(ids, wt.x, wt.y);
      flash(wt);
      return;
    }

    if (this.sel.type !== 'unit') return;
    const sel = Units.get(this.sel.id);
    if (!sel || sel.owner !== 'P') return;
    if (hitUnit && hitUnit.owner !== 'P' && Combat.canEngage(sel, hitUnit)) {
      if (hitUnit.owner === 'A') G.breakPeace();   // the first strike ends the calm truce
      sel.task = { type: 'attack' }; sel.tUnit = hitUnit.id; sel.tBld = 0;
      sel.anchor = { x: hitUnit.x, y: hitUnit.y };
      sel.defend = false; sel.assault = true;
      this.toast('Attack!');
      return;
    }
    if (hitUnit && hitUnit.owner === 'P' && Units.isTransport(hitUnit) && Units.isBoardable(sel)) {
      this.toast(Units.orderBoard(sel, hitUnit)
        ? `Boarding — the ${CFG.UNITS[hitUnit.kind].name} holds ${CFG.UNITS[hitUnit.kind].cap}`
        : 'Transport is full (or away from shore)', true);
      return;
    }
    const foeB = foeBldNear();
    if (foeB && Units.isMilitary(sel)) {
      sel.defend = false; sel.assault = true;
      Units.orderAttackBuilding(sel, foeB);
      this.toast('⚔️ Attacking ' + Bld.def(foeB.key).name);
      return;
    }
    if (hitBridge && hitBridge.owner !== 'P' && Units.isMilitary(sel)) {
      sel.defend = false; Units.orderAttackBridge(sel, hitBridge);
      this.toast('Moving to sever the bridge');
      return;
    }
    // a villager dropped square on a resource goes to gather it (near-miss
    // snapping like a tap, and same dispatch: job handed off → deselect)
    if (Units.isVillager(sel) && explored) {
      let rt = CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]] && S.map.resAmount[MapGen.idx(tile.x, tile.y)] > 0
        ? { x: tile.x, y: tile.y }
        : this.snapNear(wx, wy, (x, y) => S.map.explored[MapGen.idx(x, y)] &&
            CFG.GATHER[S.map.terrain[MapGen.idx(x, y)]] && S.map.resAmount[MapGen.idx(x, y)] > 0, 0.42);
      if (rt) {
        const wk = this.gatherable(sel, rt.x, rt.y) ? rt : this.gatherFallback(sel, rt.x, rt.y);
        if (wk && Units.assignGather(sel, wk.x, wk.y)) this.dispatchedWorker();
        else this.toast('No clear ground to stand beside that resource', true);
        return;
      }
    }
    if (Units.isTransport(sel) && sel.cargo && sel.cargo.length && Path.passable(tile.x, tile.y)) {
      Units.orderUnload(sel, tile.x, tile.y);
      this.toast('Making for that shore — soldiers will land there');
      return;
    }
    const wt = explored ? tile : this.fogWalkTarget(tile);   // the fog is not a wall
    if (!wt) { this.toast('Unexplored', true); return; }
    sel.defend = false;
    Units.moveTo(sel, wt.x, wt.y);
    flash(wt);
  },

  handleTap(sx, sy) {
    if (!S || S.over) return;
    const tile = R.screenToTile(sx, sy);
    if (!MapGen.inB(tile.x, tile.y)) return;
    const w = R.screenToWorld(sx, sy);
    const wx = w.x / CFG.TILE, wy = w.y / CFG.TILE;

    // rally-point placement
    if (this.settingRally) {
      const rb = Bld.get(this.settingRally);
      if (!rb) { this.settingRally = null; return; }
      if (Bld.covers(rb, tile.x, tile.y)) {              // tapped the building itself → clear / cancel
        rb.rally = null; this.settingRally = null;
        this.toast('Rally cleared — new units stay by the building');
        if (this.sel) this.renderPanel();
      } else if (Math.hypot(rb.x - tile.x, rb.y - tile.y) <= CFG.RALLY_RANGE) {
        rb.rally = { x: tile.x, y: tile.y };
        this.settingRally = null;
        const gatherable = !!CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]];
        this.toast(gatherable && rb.key === 'tc'
          ? 'Rally set — new villagers will gather here'
          : 'Rally point set — new units will head here');
        // leave a brief flag flourish where it landed so the player sees it took,
        // then deselect — the marker plays on after the panel closes (see R.draw)
        this.rallyFlash = { x: tile.x, y: tile.y, bx: Bld.cx(rb), by: Bld.cy(rb), t: 1.25, life: 1.25 };
        this.deselect();
      } else {
        // out of range — keep the tool armed so a second tap can still land it
        this.toast(`Too far — rally must be within ${CFG.RALLY_RANGE} tiles`, true);
      }
      return;
    }

    // placement mode: a tap is never the commit — it JUMPS the ghost there
    // and offers ✓/✗ (tests/placement.mjs). The wall never reaches this
    // branch (its pointerdown starts a line drag instead of a tap).
    if (this.placing) {
      this.placeGhostSet(tile.x, tile.y);
      return;
    }

    const explored = S.map.explored[MapGen.idx(tile.x, tile.y)];
    // hit-test a unit near the tap point (only what we can actually see).
    // Sprites are drawn SPRITE_LIFT px ABOVE their logical position, so the
    // comparison point is lifted to match what the player is actually aiming at.
    const UOFF = CFG.SPRITE_LIFT / CFG.TILE;
    let hitUnit = null, hd = 0.7;
    for (const u of S.units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const d = Math.hypot(u.x - wx, u.y - UOFF - wy);
      const dd = d - (u.owner === 'P' ? 0.15 : 0); // bias towards own units
      if (dd < hd) { hd = dd; hitUnit = u; }
    }
    // "dead-on" = the finger landed square on the sprite, not merely near it
    const unitD = hitUnit ? Math.hypot(hitUnit.x - wx, hitUnit.y - UOFF - wy) : 9;
    const deadOn = unitD <= 0.55;
    const hitBld = G.visibleAt(tile.x, tile.y) ? Bld.at(tile.x, tile.y) : null;
    // near-miss lookup: the building a sliver away that the finger was probably
    // aiming at — each caller states what kind of building would make sense, so
    // a walk order beside a wall is never stolen by it
    const bldNear = (r, ok) => {
      const n = this.snapNear(wx, wy, (x, y) => {
        const b2 = G.visibleAt(x, y) ? Bld.at(x, y) : null; return !!(b2 && ok(b2));
      }, r);
      return n ? Bld.at(n.x, n.y) : null;
    };
    // When the tap lands on a building's footprint: the WORKER of that building
    // wins the tap — pointing at a villager on their plot means the villager
    // (their panel carries the station's upgrade anyway). Same for the builder
    // raising it. The building takes the tap only from a clear part of its
    // plot, or once nobody is standing on it. Any OTHER unit passing by still
    // yields to the building unless it's right under the finger, so a soldier
    // strolling past a barracks doesn't steal the tap.
    if (hitBld && hitUnit) {
      const ht = hitUnit.task;
      const worksHere = ht && (ht.type === 'work' || ht.type === 'build') && ht.id === hitBld.id;
      if (!worksHere && !deadOn) hitUnit = null;
    }
    const hitBridge = (explored && Bld.bridgeAt) ? Bld.bridgeAt(tile.x, tile.y) : null;

    // orders for a selected war party
    if (this.sel && this.sel.type === 'group') {
      const ids = this.sel.ids.filter(id => Units.get(id));
      if (!ids.length) { this.deselect(); return; }
      this.sel.ids = ids;
      const fleet = ids.every(id => { const o = Units.get(id); return o && Units.isNaval(o); });
      // taps are ORDERS while a party is selected: another own unit only steals
      // the tap when hit dead-on (transports stay easy to board)
      const tapUnit = (hitUnit && hitUnit.owner === 'P' && !deadOn && !Units.isTransport(hitUnit)) ? null : hitUnit;
      if (tapUnit && tapUnit.owner !== 'P') {
        if (tapUnit.owner === 'A') G.breakPeace();   // the first strike ends the calm truce
        for (const id of ids) {
          const u = Units.get(id);
          if (Units.isTransport(u)) continue;   // troop hulls hold back — they don't charge with their cargo aboard
          // an explicit attack order: no guard leash yanking stragglers home mid-charge
          u.task = { type: 'attack' }; u.tUnit = tapUnit.id; u.tBld = 0;
          u.anchor = { x: tapUnit.x, y: tapUnit.y };
          u.defend = false;   // direct command ends the guard stance
          u.assault = true;   // and commits them to press on once this target drops
        }
        this.toast(fleet ? '⚓ Fleet attacks!' : '⚔️ War party attacks!');
        return;
      }
      if (tapUnit && tapUnit.owner === 'P' && Units.isTransport(tapUnit)) {
        let n = 0;
        for (const id of ids) {
          const u = Units.get(id);
          if (u && Units.isBoardable(u) && Units.orderBoard(u, tapUnit)) n++;
        }
        this.toast(n ? `${n} boarding — the ${CFG.UNITS[tapUnit.kind].name} holds ${CFG.UNITS[tapUnit.kind].cap}`
          : 'Transport is full (or away from shore)', !n);
        return;
      }
      const foeBld = Bld.foeBld(hitBld, 'P') ? hitBld
        : (!hitBld && !tapUnit ? bldNear(0.42, b2 => Bld.foeBld(b2, 'P')) : null);
      if (foeBld) {
        for (const id of ids) { const u = Units.get(id); if (u && !Units.isTransport(u)) { u.defend = false; u.assault = true; Units.orderAttackBuilding(u, foeBld); } }
        this.toast('⚔️ ' + (fleet ? 'Fleet bombards ' : 'War party attacks ') + Bld.def(foeBld.key).name);
        return;
      }
      if (hitBridge && hitBridge.owner !== 'P') {
        for (const id of ids) { const u = Units.get(id); if (u && Units.isMilitary(u)) { u.defend = false; Units.orderAttackBridge(u, hitBridge); } }
        this.toast('⚔️ War party moves to sever the bridge');
        return;
      }
      if (!tapUnit && !hitBld) {
        const wt = explored ? tile : this.fogWalkTarget(tile);   // the fog is not a wall
        if (!wt) { this.toast('Unexplored', true); return; }
        for (const id of ids) { const u = Units.get(id); if (u) u.defend = false; }
        Units.groupMove(ids, wt.x, wt.y);
        this.toast(fleet ? '⚓ Fleet sailing out' : 'War party moving — melee front, archers behind');
        return;
      }
      // tapped one of our own units/buildings: fall through and reselect it
    }

    // orders for a selected player unit
    const sel = this.sel && this.sel.type === 'unit' ? Units.get(this.sel.id) : null;
    if (sel && sel.owner === 'P') {
      // taps are ORDERS while one of ours is selected: another own unit only
      // steals the selection when hit dead-on (transports stay easy to board).
      // And a resource under the finger outranks a bystander: an own unit merely
      // overlapping the tapped resource tile doesn't steal a villager's order.
      const tT = S.map.terrain[MapGen.idx(tile.x, tile.y)];
      const gatherAim = Units.isVillager(sel) && explored && CFG.GATHER[tT];
      const steal = deadOn && !(gatherAim && unitD > 0.32);
      const tapUnit = (hitUnit && hitUnit.owner === 'P' && !steal && !Units.isTransport(hitUnit)) ? null : hitUnit;
      if (tapUnit && tapUnit.owner !== 'P') {
        if (tapUnit.owner === 'A') G.breakPeace();   // the first strike ends the calm truce
        sel.task = { type: 'attack' }; sel.tUnit = tapUnit.id; sel.tBld = 0;
        sel.anchor = { x: tapUnit.x, y: tapUnit.y };
        sel.defend = false;   // taking direct control ends the guard stance
        sel.assault = true;   // press on to the next mark once this one falls
        this.toast('Attack!');
        return;
      }
      if (tapUnit && tapUnit.owner === 'P' && Units.isTransport(tapUnit) &&
          Units.isBoardable(sel)) {
        if (Units.orderBoard(sel, tapUnit)) this.toast('Boarding the ' + CFG.UNITS[tapUnit.kind].name);
        else this.toast('Transport is full (or away from shore)', true);
        return;
      }
      // anything not ours that can be hurt: the rival's works and a barbarian
      // camp alike. A mine is never a target (Bld.attackable) — tapping a seam
      // with soldiers walks them onto it, which is how you actually take it.
      const foeBld = Bld.foeBld(hitBld, 'P') ? hitBld
        : (!hitBld && !tapUnit && Units.isMilitary(sel)
            ? bldNear(0.42, b2 => Bld.foeBld(b2, 'P')) : null);
      if (foeBld && Units.isMilitary(sel)) {
        sel.defend = false;
        sel.assault = true;
        Units.orderAttackBuilding(sel, foeBld);
        this.toast('Attacking ' + Bld.def(foeBld.key).name);
        return;
      }
      if (hitBridge && hitBridge.owner !== 'P' && Units.isMilitary(sel)) {
        sel.defend = false;
        Units.orderAttackBridge(sel, hitBridge);
        this.toast('Moving to sever the bridge');
        return;
      }
      // a build site / repairable / crewed building a sliver away counts too —
      // but never when the finger actually landed on a resource or water tile
      const ownBld = (hitBld && hitBld.owner === 'P') ? hitBld
        : (!hitBld && !tapUnit && Units.isVillager(sel) && !gatherAim && tT !== T.WATER
            ? bldNear(0.42, b2 => b2.owner === 'P' && (b2.construction > 0 || b2.upgrading > 0 ||
                b2.hp < b2.maxhp || Bld.def(b2.key).needsWorker))
            : null);
      if (ownBld && ownBld.owner === 'P' && Units.isVillager(sel) &&
          (ownBld.construction > 0 || ownBld.upgrading > 0 || ownBld.hp < ownBld.maxhp)) {
        Units.assignBuild(sel, ownBld);
        this.toast(ownBld.hp < ownBld.maxhp && !ownBld.construction && !ownBld.upgrading
          ? 'Villager sent to repair' : 'Villager sent to build');
        this.dispatchedWorker();   // job handed off — clear the selection like any other dispatch
        return;
      }
      if (ownBld && ownBld.owner === 'P' && Units.isVillager(sel) &&
          Bld.def(ownBld.key).needsWorker && !ownBld.construction) {
        /* A FULL STATION TAKES THE TAP AS A LOOK, NOT AN ORDER
           (tests/tap-audit.mjs). Tapping a fully-crewed plot with a villager
           already selected used to refuse the order and hold the selection —
           so walking your eye along five lumber camps to see which ones the
           new hall lets you upgrade cost a deselect between every one. The
           order is IMPOSSIBLE here, and the only thing the player can have
           meant is "show me that one": the tap falls through to exactly what
           it would have done with nothing selected, which by the tap
           contract's rule 5 is the worker standing on the plot (or the
           building once nobody works it). A station with ROOM is untouched —
           there the order is real, and the villager walks over and joins. */
        if (Bld.workersAssigned(ownBld) >= Bld.maxWorkers(ownBld)) {
          if (!this._stationLook) {          // one bounce only: the second pass has no selection
            this._stationLook = true;
            this.deselect();
            try { this.handleTap(sx, sy); } finally { this._stationLook = false; }
          }
          return;
        }
        sel.task = { type: 'work', id: ownBld.id }; sel.tUnit = 0; sel.tBld = 0;
        Units.setPath(sel, ownBld.x, ownBld.y);
        this.toast('Villager stationed at the ' + Bld.def(ownBld.key).name);
        this.dispatchedWorker();   // stationed — no further orders needed
        return;
      }
      if (!tapUnit && (!hitBld || hitBld.owner !== 'P')) {
        if (!explored) {
          /* THE FOG IS NOT A WALL — but only for the plain WALK. Every branch
             below reads what the tile HOLDS (a resource, a seam, a shoal, a
             bridge), which is exactly what the fog exists to hide, so an
             unexplored tap goes straight to the clamped walk instead. */
          const wt = this.fogWalkTarget(tile);
          if (!wt) { this.toast('Unexplored', true); return; }
          sel.defend = false;
          Units.moveTo(sel, wt.x, wt.y);
          return;
        }
        if (Units.isVillager(sel)) {
          // the tapped tile itself, or — forgiving a sliver of a miss — the
          // nearest gatherable neighbour the finger clearly aimed at
          const gt = CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]] ? tile
            : this.snapNear(wx, wy, (x, y) => S.map.explored[MapGen.idx(x, y)] &&
                CFG.GATHER[S.map.terrain[MapGen.idx(x, y)]] && S.map.resAmount[MapGen.idx(x, y)] > 0);
          if (gt) {
            // the finger may have landed in the INTERIOR of the stand, where
            // there is nothing to stand on — take the nearest tile of the same
            // stand that can be worked before refusing (see gatherFallback)
            const wk = this.gatherable(sel, gt.x, gt.y) ? gt : this.gatherFallback(sel, gt.x, gt.y);
            if (wk && Units.assignGather(sel, wk.x, wk.y)) { this.toast('Gathering ' + sel.task.res); this.dispatchedWorker(); }
            else this.toast('No clear ground to stand beside that resource', true);
            return;
          }
        }
        /* A GOLD SEAM IS CLAIMED IN THE FIELD (tests/gold-mine.mjs): there is
           no build button for it, so tapping the seam with a villager IS the
           order. It sits after the gather branch — a seam is in no GATHER
           table, so the two can never contend for the same tap. */
        if (Units.isVillager(sel) && Bld.seamAt(tile.x, tile.y)) {
          const c = Bld.canClaimSeam('P', tile.x, tile.y);
          if (!c.ok) { this.toast(c.why, true); return; }
          const held = Bld.at(tile.x, tile.y);
          if (Units.assignMine(sel, tile.x, tile.y)) {
            this.toast(held && held.owner !== 'P' ? 'Marching out to take the gold mine ⛏'
              : held ? 'Villager heading to the gold mine ⛏'
              : 'Villager heading out to claim the gold seam ⛏');
            this.dispatchedWorker();
          } else this.toast(held ? 'The mine is fully crewed' : 'No way through to that seam', true);
          return;
        }
        if (Units.isVillager(sel) && S.map.terrain[MapGen.idx(tile.x, tile.y)] === T.WATER) {
          // shore fishing — but only where the fish actually are
          if (MapGen.shoal(tile.x, tile.y) && S.map.resAmount[MapGen.idx(tile.x, tile.y)] > 0) {
            if (Units.assignShoreFish(sel, tile.x, tile.y)) { this.toast('Line out — fishing from the shore 🎣'); this.dispatchedWorker(); }
            else this.toast('No clear shore to fish from', true);
          } else this.toast('No fish here — watch for fish breaking the surface', true);
          return;
        }
        if (sel.kind === 'fishboat' && Units.canFish(tile.x, tile.y)) {
          if (Units.assignFish(sel, tile.x, tile.y)) this.toast('Nets out — fishing 🐟');
          return;
        }
        /* A SPAN BEING REINFORCED wants a sapper on it (tests/bridge-resource-shore.mjs).
           Tapping the works with a sapper selected puts it to work — no tool
           needs arming, because the bridge itself already says what the job
           is. Checked before the armed-tool branch: a sapper with the bridge
           tool up would otherwise be told "bridges span water" on its own
           standing bridge. */
        if (sel.kind === 'sapper') {
          const brW = Bld.bridgeAt(tile.x, tile.y);
          if (brW && brW.owner === sel.owner && brW.upgrading > 0) {
            if (Units.assignTerraform(sel, tile.x, tile.y, 'bridgeup')) {
              this.toast('Sapper reinforcing the bridge 🌉');
              this.dispatchedWorker();
            } else this.toast('No clear footing beside the bridge', true);
            return;
          }
        }
        if (sel.kind === 'sapper' && this.terraMode) {
          // a terraform tool is armed (from the panel): force that job, with a
          // clear reason when the tile is the wrong type
          const mode = this.terraMode, tier = Units.sapperTier(sel.owner);
          if (mode === 'dig' && !Terraform.isDiggable(tile.x, tile.y)) { this.toast('Dig needs open ground — grass or cleared earth', true); return; }
          if (mode === 'dig' && Terraform.digWouldSeal(tile.x, tile.y)) { this.toast('Can’t dig there — it would seal the town in', true); return; }
          if (mode === 'bridge' && (tier < 2 || !Terraform.bridgeable(tile.x, tile.y) || Bld.bridgeAt(tile.x, tile.y))) { this.toast('Bridges span water or a moat', true); return; }
          if (mode === 'clear' && (tier < 3 || !Terraform.isClearable(tile.x, tile.y))) { this.toast('Clear a forest 🌲 / rock 🪨 / orchard tile', true); return; }
          if (mode === 'mound' && (tier < 3 || !Terraform.isMoundable(tile.x, tile.y, sel.owner))) { this.toast('Mound: raise open ground, or fill water within 2 tiles of shore', true); return; }
          const fee = CFG.TERRAFORM[mode + 'Cost'];
          if (fee && !Bld.canAfford(fee)) { this.toast(`The sappers want paying — ${Bld.costStr(fee)} per tile`, true); return; }
          if (Units.assignTerraform(sel, tile.x, tile.y, mode)) {
            this.toast(mode === 'dig' ? 'Sapper digging ⛏' : mode === 'bridge' ? 'Sapper raising a bridge 🌉'
              : mode === 'mound' ? 'Sapper raising a mound ⛰' : 'Sapper breaching ⛏');
            this.dispatchedWorker();   // job handed off — clear the selection like any other dispatch
          } else this.toast('Can’t reshape that tile', true);
          return;
        }
        if (Units.isTransport(sel) && sel.cargo && sel.cargo.length && Path.passable(tile.x, tile.y)) {
          Units.orderUnload(sel, tile.x, tile.y);
          this.toast('Making for that shore — soldiers will land there');
          return;
        }
        sel.defend = false;   // a walk order overrides the guard stance
        Units.moveTo(sel, tile.x, tile.y);
        return;
      }
    }

    // (re)selection
    if (hitUnit) { this.select('unit', hitUnit.id); return; }
    if (hitBld) { this.select('bld', hitBld.id); return; }
    if (hitBridge) { this.selectBridge(hitBridge.x, hitBridge.y); return; }
    // near-miss: a tap a sliver off a building's plot still opens it (resource
    // tiles keep their tap — the idle-villager convenience below wants them)
    if (!(explored && CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]])) {
      const nearB = bldNear(0.35, () => true);
      if (nearB) { this.select('bld', nearB.id); return; }
    }

    // convenience: tap a resource tile (or a jumping-fish shoal) with nothing
    // selected → send an idle villager
    if (explored && CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]] && !this.sel) {
      const idle = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
      if (idle && Units.assignGather(idle, tile.x, tile.y)) {
        this.toast('Idle villager sent to gather');
        return;
      }
    }
    // …and the same convenience on a gold seam nobody has claimed yet
    if (explored && !this.sel && Bld.seamAt(tile.x, tile.y) && !Bld.at(tile.x, tile.y)) {
      const idle = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
      if (idle && Units.assignMine(idle, tile.x, tile.y)) {
        this.toast('Idle villager sent to claim the gold seam ⛏');
        return;
      }
    }
    if (explored && !this.sel && MapGen.shoal(tile.x, tile.y) && S.map.resAmount[MapGen.idx(tile.x, tile.y)] > 0) {
      const idle = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
      if (idle && Units.assignShoreFish(idle, tile.x, tile.y)) {
        this.toast('Idle villager sent to fish the shoal 🎣');
        return;
      }
    }
    this.deselect();
  },

  // two units count as the SAME selection type when their kind matches — except the
  // two transport hulls (Raft + War Transport), which group together as "transports"
  // since they do the same job. A double-tap gathers everything that matches this.
  sameSelType(a, b) {
    if (Units.isTransport(a) && Units.isTransport(b)) return true;
    return a.kind === b.kind;
  },
  // can a unit anchor a double-tap group? only army/fleet units — the same set the
  // "Group nearby / Group fleet" button forms (soldiers & siege on land; warships,
  // fireships & transports at sea). Villagers, sappers and fishing boats are left out.
  groupable(u) { return Units.isMilitary(u) || Units.isFleetable(u); },

  // DOUBLE-TAP: select every like unit (see sameSelType) within the grouping sphere
  // of the tapped one — a trebuchet line, a wing of cavalry, a flotilla of transports
  // pulled cleanly out of a mixed army so it can be ordered on its own.
  handleDoubleTap(sx, sy) {
    if (!S || S.over) return;
    // while placing, a fast second tap is just another placement tap — the
    // ghost jumps, nothing gets group-selected out from under the mode
    if (this.placing) { this.handleTap(sx, sy); return; }
    const w = R.screenToWorld(sx, sy);
    const wx = w.x / CFG.TILE, wy = w.y / CFG.TILE;
    // find the OWN unit under the tap (a touch more forgiving than a single tap,
    // since a double-tap is deliberate)
    let hit = null, hd = 0.9;
    for (const u of S.units) {
      if (u.owner !== 'P' || !G.visibleAt(u.x | 0, u.y | 0)) continue;
      const d = Math.hypot(u.x - wx, u.y - CFG.SPRITE_LIFT / CFG.TILE - wy);   // sprites sit above their logic pos
      if (d < hd) { hd = d; hit = u; }
    }
    // not on one of our army/fleet units → treat it as an ordinary tap so nothing is lost
    if (!hit || !this.groupable(hit)) { this.handleTap(sx, sy); return; }
    const R2 = CFG.GROUP_R;
    const ids = S.units
      .filter(o => o.owner === 'P' && this.groupable(o) && this.sameSelType(o, hit) &&
        Math.hypot(o.x - hit.x, o.y - hit.y) <= R2)
      .map(o => o.id);
    if (ids.length <= 1) { this.select('unit', hit.id); return; }   // it's the only one — just select it
    this.sel = { type: 'group', ids };
    this.builderFor = null; this.confirmDemolish = 0; this.terraMode = null; this.panelHidden = false; this.tacticsOpen = false;
    this.renderPanel();
    const label = Units.isTransport(hit) ? 'transport' : CFG.UNITS[hit.kind].name.toLowerCase();
    this.toast(`Selected ${ids.length} ${label}${ids.length > 1 ? 's' : ''} nearby`);
  },

  select(type, id) {
    this.sel = { type, id };
    this.builderFor = null;
    this.confirmDemolish = 0;
    this.terraMode = null;      // a fresh selection drops any armed sapper tool
    this.tradeNeed = null;      // …and rewinds the Trading Post to "what do you need?"
    this.panelHidden = false;   // a fresh selection brings its panel back
    this.tacticsOpen = false;   // …and starts the Tactics expander closed
    this.renderPanel();
  },
  selectBridge(x, y) {
    this.sel = { type: 'bridge', x, y };
    this.builderFor = null; this.confirmDemolish = 0; this.terraMode = null; this.panelHidden = false; this.tacticsOpen = false;
    this.renderPanel();
  },
  deselect() {
    this.sel = null;
    this.confirmDemolish = 0;
    this.settingRally = null;
    this.terraMode = null;
    this.panelHidden = false;
    this.tacticsOpen = false;
    document.getElementById('panel').classList.remove('show');
    document.getElementById('buildmenu').style.display = this.menuCollapsed ? 'none' : 'flex';
    this.syncBottomToggle();
  },

  /* Is the bottom-bar toggle a plain PANEL minimize right now, rather than
     the Build-menu toggle? True whenever ANYTHING is selected: with a
     selection the bar shows the selection's panel — never the build menu —
     so the tab can only mean "tuck this panel away / bring it back". (It
     used to exempt villagers "because they build", but a selected villager's
     Build lives on their own panel button; the tab flipping menuCollapsed
     instead just relabeled itself "🔨 Build" over a panel it would restore —
     a label that lied, reported from a playtest as confusing.) */
  panelMinMode() { return !!this.sel; },
  /* THE ONE LABEL AUTHORITY (called on select, renderPanel, deselect, and
     after any minimize — setMenuCollapsed defers here too, so no second
     writer can disagree). A CLOSED state names what tapping brings back
     ("🔨 Build ▴" / "▴ Panel"); the OPEN state says what tapping does
     ("▾ Hide") — the bare ▾ read as decoration, not a control, in the same
     playtest that found the six-button war party filling the screen. */
  syncBottomToggle() {
    const t = document.getElementById('bmToggle');
    if (!t) return;
    t.textContent = this.panelMinMode()
      ? (this.panelHidden ? '▴ Panel' : '▾ Hide')            // one panel minimize/restore
      : (this.menuCollapsed ? '🔨 Build ▴' : '▾ Hide');      // the Build-menu toggle
  },
  // minimize/restore the selection panel for a non-villager (keeps the selection
  // live so the unit still answers taps on the open board below)
  togglePanelMin() {
    this.panelHidden = !this.panelHidden;
    document.getElementById('panel').classList.toggle('show', !this.panelHidden);
    document.getElementById('buildmenu').style.display = 'none';
    this.syncBottomToggle();
  },

  // a worker sent off on a job — a villager to gather/build/station, a sapper
  // to dig/clear/mound/bridge — needs no further orders right away — drop the
  // selection and tuck the menu away so the board is clear for the next pick
  dispatchedWorker() {
    this.deselect();
    this.setMenuCollapsed(true, true);
  },

  // the − / ℹ️ button on unit panels: tuck the how-to text away (or bring it
  // back), and remember the choice on this device across games
  toggleUnitHelp() {
    this.helpHidden = !this.helpHidden;
    try { localStorage.setItem('neo-unit-help', this.helpHidden ? '1' : '0'); } catch (e) {}
    this.renderPanel();
  },

  setMenuCollapsed(v, keepPlacing) {
    this.menuCollapsed = v;
    if (this.sel) {
      // the ▾ tucks the selection panel away but KEEPS the selection — the
      // villager/soldier still answers taps on the open ground below
      this.panelHidden = v;
      document.getElementById('panel').classList.toggle('show', !v);
      document.getElementById('buildmenu').style.display = 'none';
    } else {
      document.getElementById('buildmenu').style.display = v ? 'none' : 'flex';
    }
    this.syncBottomToggle();   // the label has ONE writer — and it reads panelHidden, set above
    if (v && !keepPlacing && this.placing) this.exitPlacement();
    // opening the build menu: capture its bar height so the camera reserves that
    // much clear space at the bottom (see R.clampCam), then re-clamp to apply it
    if (window.R) {
      const bar = document.getElementById('bottombar');
      if (!v && !this.sel && bar && document.getElementById('buildmenu').style.display !== 'none' && bar.offsetHeight > 40)
        R.bottomReserve = bar.offsetHeight;
      if (R.clampCam) R.clampCam();
    }
  },
  setMiniCollapsed(v) {
    this.miniCollapsed = v;
    document.getElementById('miniWrap').style.display = v ? 'none' : '';
    const t = document.getElementById('miniToggle');
    t.textContent = v ? '🗺' : '▴';
    t.classList.toggle('collapsed', v);
  },

  /* ---------------- selection panel ---------------- */
  _panelSig: '',
  /* THE PANEL SHOWS ONLY WHAT CAN ACT (tests/army-groups.mjs). A button whose
     only possible answer is "nothing to do" is clutter, not control — the
     playtest that asked for this had a war party's six buttons plus the open
     map covering two thirds of the board. So Halt/Stop render only while
     unitBusy says there is anything to stop, and this one predicate is what
     they render by. Defend is deliberately NOT "busy": Stand Down is that
     stance's own control, and Halt vanishing on a quietly-holding garrison is
     the feature. Hiding is not a silent failure (the tap contract's rule 4):
     absence of an impossible order is the panel telling the truth. */
  unitBusy(u) {
    return !!(u.task || (u.path && u.path.length) || u.tUnit || u.tBld ||
      u.tBridge || u.strat || u.assault || (u.jobs && u.jobs.length));
  },
  // is there anyone in reach this unit could actually band with? Same domain
  // filter the Group button's own handler uses, so the button only renders
  // when tapping it would form something instead of toasting a refusal
  groupmatesNear(u) {
    if (!u || u.owner !== 'P') return false;
    const naval = Units.isNaval(u);
    if (!(Units.isFleetable(u) || (Units.isMilitary(u) && !naval))) return false;
    return S.units.some(o => o.owner === 'P' && o.id !== u.id &&
      (naval ? Units.isFleetable(o) : (Units.isMilitary(o) && !Units.isNaval(o))) &&
      Math.hypot(o.x - u.x, o.y - u.y) <= CFG.GROUP_R);
  },
  /* THE TACTICS EXPANDER (tests/army-strategies.mjs): the three assault
     doctrines live behind one ⚔ Tactics button, CLOSED by default — they are
     the war party panel's biggest block and the rarest-used, and a doctrine
     in force is still never invisible because the closed label carries it
     ("⚔ Tactics: Siege", lit). Transient UI state, never in a save; every
     fresh selection starts closed. */
  tacticsOpen: false,
  /* ---------------- SAVED ARMIES (tests/army-groups.mjs) ----------------
     Up to three war parties saved to numbered banners. Save from the group
     panel (auto-assigned the lowest free slot of 1-3), recall from the
     right-rail buttons under the minimap — the view jumps to the army and
     it's selected, ready for orders. Removing a banner frees its number
     without renumbering the others; a banner whose last soldier falls
     vanishes on its own (tickArmies). Armies live in S.armies (slot →
     [unit ids]) so they ride along in every save. */
  armyAlive(n) {
    const ids = (S.armies || {})[n] || [];
    return ids.filter(id => { const u = Units.get(id); return u && u.hp > 0 && u.owner === 'P'; });
  },
  pruneArmies() {
    if (!S || !S.armies) return false;
    let changed = false;
    for (const n of [1, 2, 3]) {
      if (!S.armies[n]) continue;
      const alive = this.armyAlive(n);
      if (alive.length !== S.armies[n].length) {
        changed = true;
        if (alive.length) S.armies[n] = alive; else delete S.armies[n];
      }
    }
    if (changed) this.renderArmyBar();
    return changed;
  },
  // which saved army IS this selection? (set equality against the living roster)
  armyOf(ids) {
    if (!S.armies || !ids || !ids.length) return 0;
    const set = new Set(ids);
    for (const n of [1, 2, 3]) {
      const a = this.armyAlive(n);
      if (a.length && a.length === set.size && a.every(id => set.has(id))) return n;
    }
    return 0;
  },
  nextArmySlot() {
    for (const n of [1, 2, 3]) if (!this.armyAlive(n).length) return n;
    return 0;
  },
  /* Is this ONE soldier the whole of a saved army? An army worn down to its
     last man selects as a single unit (renderPanel collapses a one-member
     group), so the unit panel has to be able to free the banner too — see the
     Remove button there. Deliberately NOT "is a member of": disbanding a
     five-strong army from one man's panel would be a surprise. */
  armyOfUnit(u) {
    if (!u || !S.armies) return 0;
    for (const n of [1, 2, 3]) {
      const a = this.armyAlive(n);
      if (a.length === 1 && a[0] === u.id) return n;
    }
    return 0;
  },
  saveArmy(ids) {
    this.pruneArmies();
    const live = (ids || []).filter(id => Units.get(id));
    if (!live.length) return 0;
    const n = this.nextArmySlot();
    if (!n) { this.toast('All three banners are taken — remove one first', true); return 0; }
    S.armies = S.armies || {};
    // one banner per soldier — units joining a new army leave their old one
    for (const m of [1, 2, 3]) if (m !== n && S.armies[m]) {
      S.armies[m] = S.armies[m].filter(id => !live.includes(id));
      if (!S.armies[m].length) delete S.armies[m];
    }
    S.armies[n] = live.slice();
    this.toast(`🪖 Army ${n} mustered — tap its banner to return to it`);
    this.renderArmyBar(); this.renderPanel();
    return n;
  },
  removeArmy(n) {
    if (S.armies && S.armies[n]) {
      delete S.armies[n];
      this.toast(`Army ${n} disbanded — its soldiers keep their posts`);
    }
    this.renderArmyBar(); this.renderPanel();
  },
  // banner tapped: jump the view to the army and select it, ready for orders
  selectArmy(n) {
    this.pruneArmies();
    const alive = this.armyAlive(n);
    if (!alive.length) { this.renderArmyBar(); return; }
    S.armies[n] = alive;
    /* Only HAUL THE CAMERA when the army is nowhere to be seen. If any of them
       is on screen — even half off the edge — the view stays put: yanking it
       to re-centre on soldiers the player is already looking at loses their
       place for nothing (tests/army-groups.mjs). */
    let cx = 0, cy = 0, seen = false;
    for (const id of alive) {
      const u = Units.get(id);
      cx += u.x; cy += u.y;
      if (R.onScreen(u.x, u.y)) seen = true;
    }
    if (!seen) R.centerOn(cx / alive.length, cy / alive.length);
    this.sel = { type: 'group', ids: alive.slice() };
    this.builderFor = null; this.confirmDemolish = 0; this.terraMode = null; this.panelHidden = false; this.tacticsOpen = false;
    this.renderPanel();
  },
  // Centurion helmet, front view, 21x28 — tall serrated crest on a dark
  // stand, bronze dome, and the bold one-piece dark T-visor that makes the
  // silhouette read HELMET at a glance. K is the black outline the sprite
  // carries everywhere (the buttons have no background box of their own).
  ARMY_HELM: [
    '.....K.KK.KK.K.......',
    '....KrKrrKrrKrK......',
    '...KrRrRrRrRrRrK.....',
    '..KrRrRrRrRrRrRrK....',
    '..KrRrRrRrRrRrRrK....',
    '..KrRrRrRrRrRrRrK....',
    '..KrrRrRrRrRrRrrK....',
    '...KrrrrrrrrrrrK.....',
    '...KKDDDDDDDDDKK.....',
    '..KKKKKKKKKKKKKKKK...',
    '.KhhHHHHHHHHHHhhdK...',
    'KhhHHHHHHHHHHHHhhdK..',
    'KhHHHHHHHHHHHHHhhddK.',
    'KhHHHHHHHHHHHHHhhddK.',
    'KhHHHHHHHHHHHHhhhddK.',
    'KhhHhhhhhhhhhhhhhddK.',
    'KhhhhhhhhhhhhhhhhddK.',
    'KhhhKKKKKKKKKKKKKddK.',
    'KhhhKsssssssssssKddK.',
    'KhhhKsssssssssssKddK.',
    'KhhhKKKKKssKKKKKKddK.',
    '.KhhhhhhKssKhhhhhdK..',
    '.KhhhhhhKssKhhhhhdK..',
    '.KdhhhhhKssKhhhhddK..',
    '..KdhhhhKssKhhhddK...',
    '..KKddhhKssKhhddKK...',
    '...KKKdhKKKKhdKK.....',
    '.....KKKK..KKKK......',
  ],
  /* Bronze and crest sit 20% DOWN from their first values (every channel
     ×0.8) so the right-rail buttons read as part of the UI instead of
     shouting over it. The black outline K and the near-black visor s are
     left alone — they carry the silhouette, and darkening near-black buys
     no subtlety. Original: r a92f24 / R d84a2f / D 54401b / h c9a24a /
     H e6c878 / d 96742f. */
  ARMY_HELM_COL: {
    K: '#17110a', r: '#87261d', R: '#ad3b26', D: '#433316',
    h: '#a1823b', H: '#b8a060', d: '#785d26', s: '#241a0c',
  },
  /* THE FLEET'S OWN MARK. A saved army whose soldiers float gets a SHIP on its
     banner instead of a helmet — the same 21x28 footprint and the same dulled
     palette, so the rail reads as one set, but unmistakable at a glance: square
     sail on its yard, masthead pennant, clinker hull with a row of shields
     along the gunwale, stem and stern posts, and the water under her keel. */
  ARMY_SHIP: [
    '..........Krr........',
    '.........KmKrr.......',
    '.........KmK.........',
    '..KmmmmmmmmmmmmmmmK..',
    '..KKKKKKKKKKKKKKKKK..',
    '..KsssssssssssssssK..',
    '..KsssssssssssssssK..',
    '..KsssSSSSSSSSSsssK..',
    '..KrrrrrrrrrrrrrrrK..',
    '..KrrrrrrrrrrrrrrrK..',
    '..KsssssssssssssssK..',
    '..KsssSSSSSSSSSsssK..',
    '..KsssssssssssssssK..',
    '..KsssssssssssssssK..',
    '..KSSSSSSSSSSSSSSSK..',
    '..KKKKKKKKKKKKKKKKK..',
    '.........KmmK........',
    '.........KmmK........',
    '.KK......KmmK.....KK.',
    '.KbK.....KmmK....KbK.',
    'KbbWWWWWWWmmWWWWWWbbK',
    'KbWbWbWbWbWbWbWbWbWbK',
    'KwwwwwwwwwwwwwwwwwwwK',
    '.KwwwwwwwwwwwwwwwwwK.',
    '..KwwwwwwwwwwwwwwwK..',
    '...KKwwwwwwwwwwwKK...',
    '.....KKKKKKKKKKK.....',
    '...uu...uuu...uu.....',
  ],
  ARMY_SHIP_COL: {
    K: '#17110a', m: '#7a5a2c', s: '#bdb28f', S: '#9c8f6a', r: '#8c3a2a',
    W: '#8a6534', w: '#66471f', b: '#a1823b', u: '#4a6b86',
  },
  _stamp(g, art, col, x, y) {
    for (let ry = 0; ry < art.length; ry++)
      for (let rx = 0; rx < art[ry].length; rx++) {
        const c = art[ry][rx];
        if (c === '.') continue;
        g.fillStyle = col[c];
        g.fillRect(x + rx, y + ry, 1, 1);
      }
  },
  drawHelmet(g, x, y) { this._stamp(g, this.ARMY_HELM, this.ARMY_HELM_COL, x, y); },
  drawShip(g, x, y) { this._stamp(g, this.ARMY_SHIP, this.ARMY_SHIP_COL, x, y); },
  // a banner flies the ship when MOST of its roster floats — one scout tagging
  // along with a fleet should not turn it back into an army
  armyIsNaval(n) {
    const alive = this.armyAlive(n);
    if (!alive.length) return false;
    let sea = 0;
    for (const id of alive) { const u = Units.get(id); if (u && Units.isNaval(u)) sea++; }
    return sea * 2 > alive.length;
  },
  // 1 mark for Army 1, 2 fanned for Army 2, 3 fanned for Army 3 — full-size
  // sprites overlapped (never downscaled), so every copy stays pixel-crisp
  drawArmyIcon(g, n) {
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 34, 34);
    const mark = this.armyIsNaval(n) ? (gg, x, y) => this.drawShip(gg, x, y)
                                     : (gg, x, y) => this.drawHelmet(gg, x, y);
    if (n === 1) mark(g, 6, 3);
    else if (n === 2) { mark(g, 11, 0); mark(g, 2, 6); }
    else { mark(g, 13, 0); mark(g, 7, 3); mark(g, 0, 6); }
  },
  renderArmyBar() {
    const bar = document.getElementById('armyBar');
    if (!bar) return;
    bar.innerHTML = '';
    if (!window.S || !S.armies) return;
    for (const n of [1, 2, 3]) {
      if (!this.armyAlive(n).length) continue;
      const btn = document.createElement('button');
      btn.dataset.army = n;
      btn.title = this.armyIsNaval(n) ? `Fleet ${n}` : `Army ${n}`;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 34;
      this.drawArmyIcon(cv.getContext('2d'), n);
      btn.appendChild(cv);
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.selectArmy(n); });
      bar.appendChild(btn);
    }
  },
  /* THE RIVAL-WONDER COUNTDOWN (tests/calm-peace.mjs). The moment the enemy
     monument's ground is broken it is revealed on the map (Bld.place →
     _revealCampToFoe) and logged at every difficulty — this is the standing
     half of that warning: a pinned banner with the days of work left on the
     works, held until the monument finishes (the run ends) or its site is
     destroyed. Reads S.buildings fresh each beat, so it survives save/load
     with no bookkeeping of its own. */
  tickWonderWarn() {
    const el = document.getElementById('wonderWarn');
    if (!el || !window.S || !S.buildings) return;
    const w = S.buildings.find(b => b.owner === 'A' && b.key === 'wonder' && b.construction > 0);
    if (!w) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    const days = Math.max(1, Math.ceil(w.construction));
    const txt = '🏛️ The rival\'s Wonder rises — ' + days + ' day' + (days === 1 ? '' : 's') +
      ' of work left. Finish yours, or stop theirs.';
    if (el.textContent !== txt) el.textContent = txt;
    if (el.style.display !== 'block') el.style.display = 'block';
  },

  // ~1s heartbeat from init(): fallen soldiers leave their banner, an army
  // wiped out takes its button with it — and a new/loaded game re-syncs
  tickArmies() {
    if (!window.S || !S.units) return;
    this.pruneArmies();
    const sig = S.armies ? [1, 2, 3].map(n => (S.armies[n] || []).length).join(',') : '';
    if (sig !== this._armySig) { this._armySig = sig; this.renderArmyBar(); }
  },

  /* the live work line (Units.workReport): an icon, what the unit is doing,
     and — when the job actually pays — what it is worth per day, coloured by
     the resource so a glance is enough. Rates are the real applied numbers,
     so a Lumber Camp that has been upgraded visibly nets more. */
  RES_TINT: { food: '#d8e8b0', wood: '#c9a24a', stone: '#b8b8b0', gold: '#e8c15a' },
  workLine(u) {
    const w = Units.workReport(u);
    if (!w) return '';
    const esc = (s) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    let extra = '';
    if (w.rate) {
      const n = w.rate.n >= 10 ? Math.round(w.rate.n) : Math.round(w.rate.n * 10) / 10;
      extra = ` <b style="color:${this.RES_TINT[w.rate.res] || '#e8d9b0'}">+${n} ${w.rate.res}/day</b>`;
    } else if (w.left != null) {
      extra = ` <b>${Math.ceil(w.left * 10) / 10}d left</b>`;
    } else if (w.pct != null) {
      extra = ` <b>${w.pct}%</b>`;
    }
    return `${w.icon} ${esc(w.what)}${extra}`;
  },

  panelSig() {
    if (!this.sel) return '';
    if (this.sel.type === 'bld') {
      const b = Bld.get(this.sel.id);
      if (!b) return 'gone';
      const d = Bld.def(b.key);
      // NOTE: queue length, per-unit affordability, garrison and villager
      // counts are deliberately NOT in the signature — refreshPanel updates
      // those in place so the layout doesn't jump every time you queue a unit
      let sig = ['b', b.id, b.level, b.construction > 0, b.upgrading > 0,
        b.level < 3 && Bld.canUpgrade(b).ok, b.hp < b.maxhp, Bld.hasWorker(b),
        d.needsWorker ? Bld.workersAssigned(b) + '/' + Bld.workersActive(b) : '-',
        !!b.rally, this.confirmDemolish === b.id,
        // the drawbridge lever reads the OPPOSITE of the deck's state, so the
        // label has to flip the moment the order lands (tests/drawbridge.mjs)
        Bld.canDrawbridge(b) ? (b.raised ? 'up' : 'down') : '-'].join('|');
      if (b.key === 'tc') {
        // visibility bits: pointless buttons unrender the moment they empty
        const vills = S.units.some(u => u.owner === 'P' && Units.isVillager(u));
        const idle = S.units.some(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
        // the upgrade button's reason counts the town up ("have 2 of 3") — that
        // number changes without `ok` flipping, so it has to be in the signature
        sig += '|' + Bld.tcSupport(b) + '|' + (S.wallLevel || 1) + '|' + Bld.forts().length +
               '|' + vills + '|' + (S.garrison.length > 0) + '|' + idle +
               '|' + (b.wallUp > 0 ? 'w' + b.wallUpTarget : '-');
      }
      // Trading Post: caravan out/in flips the whole panel; per-good affordability
      // greys the buttons. (The countdown itself ticks in place via refreshPanel.)
      if (b.key === 'trade')
        sig += '|' + (b.caravan ? 'car'
          : (this.tradeNeed || '?') + CFG.TRADE.goods.map(r =>
              Bld.canTrade(b, this.tradeNeed || 'gold', r).ok ? '1' : '0').join(''));
      return sig;
    }
    if (this.sel.type === 'group') {
      const mem = this.sel.ids.map(id => Units.get(id)).filter(Boolean);
      if (!mem.length) return 'gone';
      // Defend eligibility moves with the party's feet — the button must
      // appear/vanish as they march in and out of the defended ground
      const defEl = mem.filter(o => Units.canDefend(o) && (o.defend || Units.inDefendBounds(o))).length;
      const land = mem.filter(o => Units.canDefend(o) && !Units.isNaval(o));
      const gStrat = land.length && land.every(o => o.strat === land[0].strat) ? (land[0].strat || '-') : 'mix';
      // Halt renders only while there is anything to halt; Siege only while
      // the party could lay one; Unload-all only while anyone is aboard —
      // all three move without a tap, so all three live in the signature
      const busy = mem.some(o => this.unitBusy(o));
      const siegeable = land.length > 0 && Units.siegeArtillery(land).length > 0;
      const aboard = mem.reduce((n, o) => n + (Units.isTransport(o) && o.cargo ? o.cargo.length : 0), 0);
      return 'g|' + mem.length + '|' + (defEl > 0) + '|' + mem.every(o => !Units.canDefend(o) || !o.defend) + '|' + gStrat +
        '|' + busy + '|' + siegeable + '|' + (aboard > 0);
    }
    if (this.sel.type === 'bridge') {
      const br = Bld.bridgeAt(this.sel.x, this.sel.y);
      if (!br) return 'gone';
      // the works' countdown is IN the signature (to a tenth of a day), so the
      // "N days left / no sapper on site" line actually ticks
      const wk = br.upgrading > 0 ? br.upgrading.toFixed(1) + ':' +
        S.units.filter(u2 => u2.owner === 'P' && u2.task && u2.task.type === 'terraform' &&
          u2.task.job === 'bridgeup' && u2.task.x === br.x && u2.task.y === br.y).length : '';
      return ['br', br.owner, br.level, br.hp < br.maxhp, Bld.canUpgradeBridge(br), wk, this.confirmDemolish === 'bridge'].join('|');
    }
    const u = Units.get(this.sel.id);
    if (!u) return 'gone';
    let stack = 0;
    if (u.owner !== 'P' && !Units.isPassive(u))
      stack = S.units.filter(o => o.owner !== 'P' && !Units.isPassive(o) &&
        (o.x | 0) === (u.x | 0) && (o.y | 0) === (u.y | 0)).length;
    const sig = ['u', u.id, u.hp < u.maxhp, stack, u.cargo ? u.cargo.length : 0,
      !!CFG.HEAL_FOOD[u.kind] && S.res.food >= this.healCost(u), Bld.inHealZone(u), this.healThrottled(u),
      Units.canDefend(u) && (u.defend || Units.inDefendBounds(u)),   // Defend button follows the bounds
      u.owner === 'P' && !Units.isVillager(u) && this.unitBusy(u),   // Stop renders only while there is anything to stop
      this.groupmatesNear(u),                // …and Group only while there is anyone to band with
      this.armyOfUnit(u)];   // …and Remove Army appears the moment this one is the last of it
    // villager resource-station upgrade state (level, phase, affordability) — the
    // continuously-shrinking day count is NOT here; refreshPanel ticks it in place
    const wb = this.villagerResBld(u);
    if (wb) sig.push('r' + wb.id + ':' + wb.level + ':' +
      (wb.upgrading > 0 ? 'up' : wb.level >= 3 ? 'max' : Bld.canUpgrade(wb).ok ? 'can' : 'no'));
    return sig.join('|');
  },

  groupComposition(ids) {
    const byKind = {};
    for (const id of ids) {
      const u = Units.get(id);
      if (u) byKind[u.kind] = (byKind[u.kind] || 0) + 1;
    }
    return Object.entries(byKind)
      .map(([k, n]) => `${n} ${CFG.UNITS[k].name}${n > 1 ? 's' : ''}`).join(', ');
  },

  // gate price for replacing a wall section, with the wall's demolish refund credited
  gateConvertCost(b) {
    const gcost = Bld.buildSpec('gate').lv.cost;
    const refund = Bld.demolishRefund(b);
    const net = {};
    for (const k in gcost) net[k] = Math.max(0, gcost[k] - (refund[k] || 0));
    return net;
  },

  healCost(u) {
    const base = CFG.HEAL_FOOD[u.kind];
    if (!base) return 0;
    return Math.max(1, Math.ceil((1 - u.hp / u.maxhp) * base));
  },
  /* HEAL LIMIT — at most CFG.HEAL_LIMIT_N heals per unit inside any real
     HEAL_LIMIT_MS window, so a unit standing in the TC ring can't just be
     topped off between every blow of a live fight and outlast an attacker for
     free. Tracked in real wall-clock time (performance.now()) because the
     exploit IS real-time click-spamming during a fight, not anything tied to
     the in-game calendar — and kept UI-local, never on the unit/S itself, so
     it never touches the save file (a stray old timestamp surviving a
     load would be meaningless — real time from a past browser session).
     Cleared on every new game / load (G.newGame, G.loadJSON) so a fresh
     game's low unit ids can never inherit a stale cooldown from the last one. */
  _healLog: {},
  healLog(u) {
    const log = (this._healLog[u.id] || []).filter(t => performance.now() - t < CFG.HEAL_LIMIT_MS);
    this._healLog[u.id] = log;
    return log;
  },
  healThrottled(u) { return this.healLog(u).length >= CFG.HEAL_LIMIT_N; },
  noteHeal(u) { this.healLog(u).push(performance.now()); },
  // the OWN resource-station a villager is stationed at (or building an upgrade
  // for) — so its Upgrade control can live on the villager's own panel
  villagerResBld(u) {
    if (!u || u.owner !== 'P' || !Units.isVillager(u) || !u.task) return null;
    if (u.task.type !== 'work' && u.task.type !== 'build') return null;
    const b = Bld.get(u.task.id);
    return (b && b.owner === 'P' && Bld.def(b.key).needsWorker && !b.construction) ? b : null;
  },
  // cheap periodic update: rewrite the sub-line only, rebuild DOM when structure changes
  refreshPanel() {
    if (!this.sel) return;
    const sig = this.panelSig();
    if (sig === 'gone') { this.deselect(); return; }
    if (sig !== this._panelSig) { this.renderPanel(); return; }
    const el = document.querySelector('#panel .phead .psub');
    if (el) el.textContent = this.panelSub();
    // THE LIVE LINE: what the unit is doing and what it is netting, patched in
    // place every tick so it can change without relaying out the whole panel
    if (this.sel.type === 'unit') {
      const wk = document.getElementById('pWork');
      const wu = Units.get(this.sel.id);
      if (wk && wu && wu.owner === 'P') wk.innerHTML = this.workLine(wu);
    }
    // the panel icon follows the art too (a PNG that decoded after the panel
    // was laid out, or the ?dev=1 preview swapping it under a live game) —
    // iconInto no-ops unless the drawable actually changed
    if (this.sel.type === 'bld') {
      const pb = Bld.get(this.sel.id), pic = document.getElementById('pIcon');
      if (pb && pic) this.iconInto(pic, this.panelIconSprite(pb));
    }
    const hc = document.getElementById('healCost');
    if (hc && this.sel.type === 'unit') {
      const u = Units.get(this.sel.id);
      // sig already covers throttled TRANSITIONS (forces the full rebuild
      // above); this patches the drifting cost number in between them, so it
      // must agree with the same throttled branch or it overwrites a settled
      // "Cooldown…" label with a stale price the button no longer honours.
      if (u) hc.textContent = this.healThrottled(u) ? 'Cooldown…'
        : Bld.inHealZone(u) ? Bld.costStr({ food: this.healCost(u) }) : 'near ' + (Units.isNaval(u) ? 'Dock' : 'Town Center');
    }
    // tick the resource-station upgrade progress in place (no relayout)
    if (this.sel.type === 'unit') {
      const left = document.getElementById('upresLeft');
      if (left) {
        const u = Units.get(this.sel.id), wb = u && this.villagerResBld(u);
        if (wb && wb.upgrading > 0) {
          left.textContent = Math.ceil(wb.upgrading) + 'd';
          const bar = document.getElementById('upresBar');
          if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, 1 - wb.upgrading / (wb.upgTotal || wb.upgrading))) * 100) + '%';
        }
      }
    }
    if (this.sel.type === 'bld') {
      const b = Bld.get(this.sel.id);
      if (!b) return;
      const panel = document.getElementById('panel');
      const q = document.getElementById('qLine');
      if (q) q.textContent = `Queue: ${b.queue.length}/${Bld.queueCap(b)}`;
      panel.querySelectorAll('[data-act="train"]').forEach(btn =>
        btn.classList.toggle('cant', !Bld.canTrain(b, btn.dataset.unit).ok));
      const shN = document.getElementById('shelterN');
      if (shN) shN.textContent =
        S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length + ' outside';
      const rlN = document.getElementById('releaseN');
      if (rlN) rlN.textContent = S.garrison.length + ' sheltered';
      const idN = document.getElementById('idleN');
      if (idN) idN.textContent =
        S.units.filter(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit).length + ' idle — muster here';
      const upw = panel.querySelector('[data-act="upwalls"]');
      if (upw) upw.classList.toggle('cant', !Bld.canUpgradeWalls().ok);
      // tick a Trading Post caravan's return countdown in place
      const carLeft = document.getElementById('carLeft');
      if (carLeft && b.caravan) {
        carLeft.textContent = Math.ceil(b.caravan.t) + 'd';
        const cb = document.getElementById('carBar');
        if (cb) cb.style.width = Math.round(Math.max(0, Math.min(1, 1 - b.caravan.t / (b.caravan.total || 1))) * 100) + '%';
      }
      // tick the wall-reinforcement countdown in place
      const wallLeft = document.getElementById('wallLeft');
      if (wallLeft && b.wallUp > 0) {
        wallLeft.textContent = Math.ceil(b.wallUp) + 'd';
        const wb = document.getElementById('wallBar');
        if (wb) wb.style.width = Math.round(Math.max(0, Math.min(1, 1 - b.wallUp / (b.wallUpTotal || 1))) * 100) + '%';
      }
    }
  },
  panelSub() {
    if (this.sel.type === 'bld') {
      const b = Bld.get(this.sel.id);
      if (!b) return '';
      const lv = Bld.lv(b);
      let sub = `HP ${Math.ceil(b.hp)}/${b.maxhp}`;
      if (b.construction > 0)
        sub += ` — ${Math.ceil(b.construction)}d of work left${Bld.hasWorker(b) ? '' : ' (awaiting builder)'}`;
      else if (b.upgrading > 0)
        sub += ` — upgrading ${Math.ceil(b.upgrading)}d left${Bld.hasWorker(b) ? '' : ' (awaiting builder)'}`;
      else if (b.hp < b.maxhp && Bld.hasWorker(b)) sub += ' — under repair';
      if (b.owner === 'P' && !b.construction && Bld.def(b.key).needsWorker) {
        const w = Bld.workersActive(b), max = Bld.maxWorkers(b);
        sub += w ? ` — 🧑‍🌾 ${w}/${max} working` : ' — ⚠️ NO WORKER, no production';
      }
      if (b.key === 'tc' && b.owner === 'P' && S.garrison.length)
        sub += ` — 🛖 ${S.garrison.length} sheltered`;
      else if (lv.out) {
        const crew = Bld.def(b.key).needsWorker ? Math.min(Bld.workersActive(b), Bld.maxWorkers(b)) : 1;
        const shown = Bld.def(b.key).needsWorker ? (crew || 1) : 1;   // preview per-worker rate when idle
        sub += ' — ' + Object.entries(lv.out).map(([k, v]) => `+${Math.round(v * shown * Bld.nearBonus(b) * 10) / 10} ${k}/day`).join(', ');
        if (Bld.maxWorkers(b) > 1) sub += crew ? '' : ' (per worker)';
      }
      if (lv.pop) sub += ` — +${lv.pop} pop`;
      if (lv.bonus) sub += ` — ${lv.bonus}`;
      return sub;
    }
    if (this.sel.type === 'group') return this.groupComposition(this.sel.ids);
    if (this.sel.type === 'bridge') { const br = Bld.bridgeAt(this.sel.x, this.sel.y); return br ? `HP ${Math.ceil(br.hp)}/${br.maxhp} · a crossing over water` : ''; }
    const u = Units.get(this.sel.id);
    return u ? `HP ${Math.ceil(u.hp)}/${u.maxhp} · ATK ${Math.round(Units.effAtk(u))} · DEF ${u.def}` : '';
  },
  renderPanel() {
    const panel = document.getElementById('panel');
    if (!this.sel) { this.deselect(); return; }
    this._panelSig = this.panelSig();
    let html = '';
    if (this.sel.type === 'bld') {
      const b = Bld.get(this.sel.id);
      if (!b) { this.deselect(); return; }
      const d = Bld.def(b.key);
      const sub = this.panelSub();
      // A CAMP IS SOMEBODY'S (CFG.TRIBES): the panel names the people whose
      // fire it is, so walking up to a strange camp actually tells you who
      // lives there — that is the whole point of five distinct peoples.
      const nm = b.key === 'raidercamp' && b.tribe
        ? `Camp of ${G.tribeName(b.tribe)}` : d.name;
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${b.owner === 'A' ? 'Rival ' : ''}${nm} <span style="color:var(--gold)">Lv ${b.level}</span></div>
        <div class="psub">${sub}</div></div>
        <button class="abtn" id="panelClose">✕</button></div>`;
      html += '<div class="pactions">';
      if (b.owner === 'P') {
        const worker = Bld.hasWorker(b);
        if ((b.construction > 0 || b.upgrading > 0) && !worker)
          html += `<button class="abtn" data-act="sendworker">👷 Send builder<small>needs an idle villager</small></button>`;
        if (!b.construction && d.needsWorker && Bld.workersAssigned(b) < Bld.maxWorkers(b))
          html += `<button class="abtn" data-act="staff">🧑‍🌾 Station worker<small>${Bld.workersAssigned(b)}/${Bld.maxWorkers(b)} assigned</small></button>`;
        if (!b.construction && !b.upgrading && b.hp < b.maxhp && !worker)
          html += `<button class="abtn" data-act="sendworker">🔨 Repair<small>a villager does the work</small></button>`;
        if (b.level < 3 && !b.construction && d.levels[b.level] && b.key !== 'wall' && b.key !== 'gate') {
          const up = Bld.canUpgrade(b);
          const cost = d.levels[b.level].cost;
          html += `<button class="abtn wide ${up.ok ? '' : 'cant'}" data-act="upgrade">⬆ Upgrade to Lv ${b.level + 1}<small>${Bld.costStr(cost)}${up.ok ? '' : ' — ' + up.why}</small></button>`;
        }
        if ((b.key === 'wall' || b.key === 'gate') && !b.construction && b.level < 3)
          html += `<span class="psub">Walls upgrade together — use the Town Center.</span>`;
        /* THE DRAWBRIDGE LEVER (tests/drawbridge.mjs). One button, and it says
           what pulling it will DO — raise the deck when it is down, lower it
           when it is up — so the gate's state is readable from the button
           alone. Only the third tier has the winch to work it. */
        if (Bld.canDrawbridge(b))
          html += b.raised
            ? `<button class="abtn wide" data-act="drawbridge">⬇ Lower the drawbridge<small>the gate opens — your people pass again</small></button>`
            : `<button class="abtn wide" data-act="drawbridge">⬆ Raise the drawbridge<small>shuts the gate fast — to your own people too</small></button>`;
        if (d.train && !b.construction) {
          for (const [uk, spec] of Object.entries(d.train)) {
            const ct = Bld.canTrain(b, uk);
            const tCost = window.Cards ? Cards.trainCost('P', uk, spec.cost) : spec.cost;
            html += `<button class="abtn ${ct.ok ? '' : 'cant'}" data-act="train" data-unit="${uk}">Train ${CFG.UNITS[uk].name}<small>${Bld.costStr(tCost)}</small></button>`;
          }
          // the TC's shelter button rides beside Train Villager so the grid
          // stays packed — pointless buttons below simply don't render
          if (b.key === 'tc') {
            const vills = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length;
            if (vills) html += `<button class="abtn" data-act="shelter">🛖 Shelter villagers<small id="shelterN">${vills} outside</small></button>`;
          }
          html += `<span class="psub" id="qLine">Queue: ${b.queue.length}/${Bld.queueCap(b)}</span>`;
          html += b.rally
            ? `<button class="abtn" data-act="rally">🚩 Move rally<small>tap a new spot, or the building to clear</small></button>`
            : `<button class="abtn" data-act="rally">🚩 Set rally<small>tap ground within ${CFG.RALLY_RANGE} tiles</small></button>`;
        }
        if (b.key === 'tc' && !b.construction) {
          if (S.garrison.length)
            html += `<button class="abtn" data-act="release">🚪 Release all<small id="releaseN">${S.garrison.length} sheltered</small></button>`;
          const idle = S.units.filter(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit).length;
          if (idle)
            html += `<button class="abtn" data-act="callidle">📣 Call idle<small id="idleN">${idle} idle — muster here</small></button>`;
          if (b.wallUp > 0) {
            const frac = Math.max(0, Math.min(1, 1 - b.wallUp / (b.wallUpTotal || 1)));
            html += `<div class="abtn cant wide" style="pointer-events:none">🧱 Reinforcing walls → Lv ${b.wallUpTarget}` +
              `<small>Town Center busy — <span id="wallLeft">${Math.ceil(b.wallUp)}d</span> left</small>` +
              `<div style="height:4px;margin-top:5px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden">` +
              `<div id="wallBar" style="height:100%;width:${Math.round(frac * 100)}%;background:var(--gold)"></div></div></div>`;
          } else if ((S.wallLevel || 1) < 3 && Bld.forts().length) {
            const upw = Bld.canUpgradeWalls();
            html += `<button class="abtn wide ${upw.ok ? '' : 'cant'}" data-act="upwalls">🧱 Upgrade all walls to Lv ${(S.wallLevel || 1) + 1}<small>${Bld.costStr(Bld.wallUpgradeCost())} — every wall & gate</small></button>`;
          }
        }
        if (b.key === 'wall' && !b.construction && !b.upgrading) {
          const net = this.gateConvertCost(b);
          html += `<button class="abtn wide ${Bld.canAfford(net) ? '' : 'cant'}" data-act="togate">🚪 Build Gate<small>${Bld.costStr(net)} — replaces this section</small></button>`;
        }
        if (b.key === 'trade' && !b.construction && !b.upgrading) {
          const spec = Bld.tradeSpec(b), ic = r => Bld.resIcon(r);
          if (b.caravan) {
            const haul = Bld.caravanHaul(b.caravan);
            const frac = Math.max(0, Math.min(1, 1 - b.caravan.t / (b.caravan.total || 1)));
            html += `<div class="abtn cant" style="pointer-events:none">🐫 Caravan out — ${ic(haul.pay)} for ${ic(haul.need)} +${haul.amt}` +
              `<small><span id="carLeft">${Math.ceil(b.caravan.t)}d</span> to return</small>` +
              `<div style="height:4px;margin-top:5px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden">` +
              `<div id="carBar" style="height:100%;width:${Math.round(frac * 100)}%;background:var(--gold)"></div></div></div>`;
          } else if (!this.tradeNeed) {
            /* STEP 1 — what do you need? Pick the resource coming BACK first:
               that's the question a player actually arrives with ("I'm out of
               wood"), and it keeps the second step down to three choices. */
            html += `<span class="psub">🐫 <b>What do you need?</b> Pick what the caravan brings home — Lv ${b.level} post, ${spec.delay}d each way.</span>`;
            for (const res of CFG.TRADE.goods)
              html += `<button class="abtn" data-act="tradeneed" data-res="${res}">${ic(res)} ${this.RES_NAME[res]}<small>${res === 'gold' ? 'the dearest thing to buy' : 'paid for in goods or gold'}</small></button>`;
          } else {
            // STEP 2 — and what will you pay with? Live rate per pair, then go.
            const need = this.tradeNeed;
            html += `<span class="psub">🐫 Bringing home ${ic(need)} <b>${this.RES_NAME[need]}</b> — <b>what will you trade for it?</b></span>`;
            let payN = 0;
            for (const pay of CFG.TRADE.goods) {
              if (pay === need) continue;
              const deal = Bld.tradeDeal(b, need, pay), c = Bld.canTrade(b, need, pay);
              if (!deal) continue;
              html += `<button class="abtn ${c.ok ? '' : 'cant'}" data-act="trade" data-res="${need}" data-pay="${pay}">` +
                `${ic(pay)} ${deal.pay} → ${ic(need)} ${deal.get}` +
                `<small>${c.ok ? `back in ${spec.delay}d` : c.why}</small></button>`;
              payN++;
            }
            // an odd pay option stays BUTTON-sized, left, with the half-row
            // held by a spacer (the grid packer would otherwise stretch it
            // panel-wide) — and Back shares its row with Demolish below, so
            // the whole panel stays as condensed as any other building menu
            if (payN % 2) html += '<span></span>';
            html += `<button class="abtn" data-act="tradeback">← Pick something else</button>`;
          }
        }
        if (b.key !== 'tc') {
          const refund = Bld.costStr(Bld.demolishRefund(b));
          html += this.confirmDemolish === b.id
            ? `<button class="abtn danger" data-act="demolish">⚠️ Confirm demolish<small>get back ${refund}</small></button>`
            : `<button class="abtn" data-act="demolish">💥 Demolish<small>refund ${refund}</small></button>`;
        }
      } else {
        html += `<span class="psub">Enemy structure — order defenders to attack it.</span>`;
      }
      html += '</div>';
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      // the panel icon follows the work-site stage (tests/build-stages.mjs):
      // ground broken → the raising → the (nearly finished) building itself
      this.iconInto(ic, this.panelIconSprite(b));
      panel.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
        const b2 = Bld.get(this.sel.id);
        if (!b2) return;
        if (btn.dataset.act === 'upgrade') { if (!Bld.upgrade(b2)) this.toast(Bld.canUpgrade(b2).why, true); }
        else if (btn.dataset.act === 'train') {
          if (!Bld.train(b2, btn.dataset.unit)) this.toast(Bld.canTrain(b2, btn.dataset.unit).why, true);
          this.refreshMenu();
          this.refreshPanel();   // in-place queue/affordability update — no rebuild, no layout jump
          return;
        }
        else if (btn.dataset.act === 'tradeneed') {
          this.tradeNeed = btn.dataset.res;          // step 1 → step 2
          this.renderPanel();
          return;
        }
        else if (btn.dataset.act === 'tradeback') {
          this.tradeNeed = null;                     // step 2 → step 1
          this.renderPanel();
          return;
        }
        else if (btn.dataset.act === 'trade') {
          const need = btn.dataset.res, pay = btn.dataset.pay, c = Bld.canTrade(b2, need, pay);
          if (!c.ok) { this.toast(c.why, true); return; }
          const deal = Bld.tradeDeal(b2, need, pay);
          if (Bld.startTrade(b2, need, pay)) {
            this.tradeNeed = null;
            this.toast(`Caravan sets out with the ${pay} — ${deal.get} ${need} on its return`);
          }
          this.renderPanel(); this.refreshMenu();
          return;
        }
        else if (btn.dataset.act === 'sendworker') {
          const v = Units.nearestIdleVillager(b2.x, b2.y);
          if (!v) this.toast('No idle villager — free one up first', true);
          else if (Units.assignBuild(v, b2)) this.toast('Villager on the way');
        }
        else if (btn.dataset.act === 'staff') {
          if (Bld.workersAssigned(b2) >= Bld.maxWorkers(b2)) { this.toast('Fully staffed', true); return; }
          const v = Units.nearestIdleVillager(b2.x, b2.y);
          if (!v) this.toast('No idle villager — free one up first', true);
          else {
            v.task = { type: 'work', id: b2.id }; v.tUnit = 0; v.tBld = 0;
            Units.setPath(v, b2.x, b2.y);
            this.toast('Worker heading to the ' + Bld.def(b2.key).name);
          }
        }
        else if (btn.dataset.act === 'rally') {
          // arm placement straight away — even when a rally is already set, no
          // clear-first click — and tuck the menu away for a full view of the board
          this.settingRally = b2.id;
          this.setMenuCollapsed(true, true);
          this.toast(b2.rally
            ? 'Tap a new spot to move the rally — or tap the building to clear it'
            : 'Tap a spot to rally — new units head there (tap the building to cancel)');
        }
        else if (btn.dataset.act === 'shelter') {
          let n = 0;
          for (const u of S.units)
            if (u.owner === 'P' && Units.isVillager(u)) {
              u.task = { type: 'garrison' }; u.tUnit = 0; u.tBld = 0;
              Units.setPath(u, b2.x, b2.y);
              n++;
            }
          this.toast(n ? `${n} villager${n > 1 ? 's' : ''} heading to shelter` : 'No villagers on the map', !n);
        }
        else if (btn.dataset.act === 'release') {
          const n = S.garrison.length;
          if (!n) { this.toast('Nobody is sheltered inside', true); return; }
          for (const gv of S.garrison) {
            const spot = MapGen.findNear(b2.x, b2.y + Bld.size(b2), 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: b2.x, y: b2.y + Bld.size(b2) };
            const v = Units.spawn('villager', 'P', spot.x, spot.y);
            v.hp = Math.min(gv.hp, v.maxhp);
          }
          S.garrison = [];
          this.toast(`${n} villager${n > 1 ? 's' : ''} back outside`);
          this.renderPanel();
        }
        else if (btn.dataset.act === 'callidle') {
          let n = 0;
          for (const u of S.units)
            if (u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit) {
              const spot = MapGen.findNear(b2.x, b2.y + Bld.size(b2) + 1, 3, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: b2.x, y: b2.y + Bld.size(b2) + 1 };
              Units.moveTo(u, spot.x, spot.y);
              n++;
            }
          this.toast(n ? `${n} idle villager${n > 1 ? 's' : ''} called in` : 'Nobody is idle', !n);
        }
        else if (btn.dataset.act === 'togate') {
          const net = this.gateConvertCost(b2);
          if (!Bld.canAfford(net)) { this.toast('Not enough resources', true); return; }
          Bld.pay(net, S.res);
          const spec = Bld.buildSpec('gate');
          const lv = spec.lv;
          b2.key = 'gate'; b2.level = spec.level; b2.upgrading = 0;
          b2.maxhp = lv.hp;
          b2.hp = Math.max(30, Math.round(lv.hp * 0.4));
          b2.construction = lv.time;
          Bld._block = null;
          const v = Units.nearestIdleVillager(b2.x, b2.y);
          if (v) Units.assignBuild(v, b2);
          G.log('Wall section being rebuilt as a gate' + (v ? ' — a villager heads over' : ' — needs a builder'));
          this.renderPanel();
        }
        else if (btn.dataset.act === 'drawbridge') {
          if (!Bld.toggleDrawbridge(b2)) { this.toast('This gate has no winch — only a Lv 3 gatehouse does', true); return; }
          this.toast(b2.raised
            ? 'Drawbridge up — nobody comes through, yourself included'
            : 'Drawbridge down — the gate is open');
          this.renderPanel();
          return;
        }
        else if (btn.dataset.act === 'upwalls') {
          if (!Bld.upgradeWalls()) this.toast(Bld.canUpgradeWalls().why, true);
        }
        else if (btn.dataset.act === 'demolish') {
          if (this.confirmDemolish !== b2.id) { this.confirmDemolish = b2.id; this.renderPanel(); return; }
          this.confirmDemolish = 0;
          if (Bld.demolish(b2)) return;   // demolish deselects via removeToRuin
        }
        this.renderPanel();
        this.refreshMenu();
      }));
    } else if (this.sel.type === 'bridge') {
      const br = Bld.bridgeAt(this.sel.x, this.sel.y);
      if (!br) { this.deselect(); return; }
      const own = br.owner === 'P', lv = br.level || 1;
      const names = ['Timber Bridge', 'Stone-Pier Bridge', 'Stone Arch Bridge'];
      const works = br.upgrading > 0;
      const onWorks = works && S.units.filter(u => u.owner === 'P' && u.task &&
        u.task.type === 'terraform' && u.task.job === 'bridgeup' &&
        u.task.x === br.x && u.task.y === br.y).length;
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${own ? '' : 'Rival '}${names[lv - 1]} <span style="color:var(--gold)">Lv ${lv}</span></div>
        <div class="psub">HP ${Math.ceil(br.hp)}/${br.maxhp} · a crossing over water</div></div>
        <button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions"><span class="psub">${own ? 'Reinforce for more stone and HP, or demolish to sever the crossing. Guard it — the enemy can hack it down.' : 'A rival crossing. Send soldiers here to sever it.'}</span>`;
      if (own && works) {
        // the works are standing: show the clock, and say plainly whose hands
        // it is waiting on. A span is reinforced by SAPPERS, like it was built.
        const left = Math.max(0, br.upgrading).toFixed(1);
        html += `<span class="psub">⬆ Reinforcing to Lv ${br.upTo} — ${left} of ${br.upTotal} days left` +
          (onWorks ? ` · ${onWorks} sapper${onWorks > 1 ? 's' : ''} on site` : ' · <b>no sapper on site</b> — tap a sapper, then the bridge') +
          `</span>`;
      } else if (own && lv < 3) {
        const cost = CFG.BRIDGE.levels[lv].cost, ok = Bld.canUpgradeBridge(br);
        const days = CFG.BRIDGE.levels[lv].time || 2;
        html += `<button class="abtn wide ${ok ? '' : 'cant'}" data-act="brup">⬆ Reinforce to Lv ${lv + 1}<small>${Bld.costStr(cost)} · ${days}d · needs a sapper${ok ? '' : ' — need resources'}</small></button>`;
      }
      if (own) html += `<button class="abtn ${this.confirmDemolish === 'bridge' ? 'danger' : ''}" data-act="brdemo">💥 ${this.confirmDemolish === 'bridge' ? 'Confirm — sever it' : 'Demolish'}</button>`;
      html += '</div>';
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      if (ic) { ic.width = ic.height = 44; const g2 = ic.getContext('2d'); g2.imageSmoothingEnabled = false;
        g2.fillStyle = lv >= 3 ? '#8f8f86' : '#6e5024'; g2.fillRect(4, 15, 36, 14);
        g2.fillStyle = lv >= 3 ? '#adada2' : '#8a6b3a'; g2.fillRect(4, 15, 36, 3);
        if (lv >= 2) { g2.fillStyle = '#6f6f66'; g2.fillRect(4, 14, 5, 16); g2.fillRect(35, 14, 5, 16); }
        g2.fillStyle = own ? '#4a90c2' : '#c2564a'; g2.fillRect(4, 13, 36, 2); g2.fillRect(4, 29, 36, 2); }
      const close = panel.querySelector('#panelClose'); if (close) close.addEventListener('click', () => this.deselect());
      const up = panel.querySelector('[data-act="brup"]');
      if (up) up.addEventListener('click', () => {
        const b2 = Bld.bridgeAt(this.sel.x, this.sel.y); if (!b2) return;
        // orders the WORKS — the stone is paid now, the span is raised over the
        // next few days by a sapper standing at it (no more instant arches)
        if (Bld.orderBridgeUpgrade(b2)) { this.toast('Bridge works laid out — Lv ' + b2.upTo); this.renderPanel(); this.refreshMenu(); }
        else this.toast('Not enough resources', true);
      });
      const demo = panel.querySelector('[data-act="brdemo"]');
      if (demo) demo.addEventListener('click', () => {
        if (this.confirmDemolish !== 'bridge') { this.confirmDemolish = 'bridge'; this.renderPanel(); return; }
        this.confirmDemolish = 0;
        const b2 = Bld.bridgeAt(this.sel.x, this.sel.y); if (b2) Bld.removeBridge(b2);
        this.deselect();
      });
    } else if (this.sel.type === 'group') {
      this.sel.ids = this.sel.ids.filter(id => Units.get(id));
      if (this.sel.ids.length === 0) { this.deselect(); return; }
      if (this.sel.ids.length === 1) { this.sel = { type: 'unit', id: this.sel.ids[0] }; this.renderPanel(); return; }
      const first = Units.get(this.sel.ids[0]);
      const fleet = this.sel.ids.every(id => { const o = Units.get(id); return o && Units.isNaval(o); });
      const gMil = this.sel.ids.map(id => Units.get(id)).filter(o => o && Units.canDefend(o));
      // Defend shows only for members on ground the stance would hold (or
      // already in the stance — Stand Down stays available anywhere)
      const gDefEligible = gMil.filter(o => o.defend || Units.inDefendBounds(o));
      const gAllDef = gDefEligible.length > 0 && gDefEligible.every(o => o.defend);
      // troop-carrier count aboard the whole selection — a fleet of transports can
      // put everyone ashore in one order (each hull lands beside wherever it sits)
      const gLaden = this.sel.ids.map(id => Units.get(id)).filter(o => o && Units.isTransport(o) && o.cargo && o.cargo.length);
      const gAboard = gLaden.reduce((n, o) => n + o.cargo.length, 0);
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${fleet ? '⚓ Fleet' : '⚔️ War Party'} <span style="color:var(--gold)">(${this.sel.ids.length})</span></div>
        <div class="psub">${this.groupComposition(this.sel.ids)}</div></div>
        <button class="abtn" id="helpToggle" title="${this.helpHidden ? 'Show unit tips' : 'Hide unit tips'}">${this.helpHidden ? 'ℹ️' : '−'}</button><button class="abtn" id="panelClose">✕</button></div>`;
      // SAVED ARMIES (tests/army-groups.mjs): a military group can be saved to
      // a numbered banner — lowest free slot of three — and recalled from the
      // right-rail helmet buttons. A group that IS a saved army offers Remove.
      const armyN = gMil.length ? this.armyOf(this.sel.ids) : 0;
      const armySlot = gMil.length && !armyN ? this.nextArmySlot() : 0;
      // ARMY STRATEGIES (tests/army-strategies.mjs) — the land army's three
      // assault doctrines, folded behind ONE ⚔ Tactics expander (closed by
      // default; a doctrine in force shows in the closed label, lit). Siege
      // renders only for a party that could lay one — the SAME artillery
      // pick siegeOrder itself makes, so bows keep the button when there are
      // no engines and only a pure-melee (or all-horse) party loses it.
      const gAll = this.sel.ids.map(id => Units.get(id)).filter(Boolean);
      const gBusy = gAll.some(o => this.unitBusy(o));
      const gLand = gMil.filter(o => !Units.isNaval(o));
      const gStrat = gLand.length && gLand.every(o => o.strat === gLand[0].strat) ? (gLand[0].strat || '') : '';
      const gSiegeable = gLand.length > 0 && Units.siegeArtillery(gLand).length > 0;
      const STRAT_NAME = { siege: 'Siege', chaos: 'Chaos', strike: 'Strike' };
      const armed = STRAT_NAME[gStrat] || '';
      const tacticsBtn = !fleet && gLand.length ?
        `<button class="abtn ${armed ? 'sel' : ''}" data-act="gtactics">⚔ Tactics${armed ? ': ' + armed : ''} ${this.tacticsOpen ? '▾' : '▸'}` +
        `<small>${this.tacticsOpen ? (armed ? 'tap the lit doctrine to stand it down' : 'how shall they fight?')
          : armed ? 'in force — tap to change' : 'Siege · Chaos · Strike'}</small></button>` : '';
      const stratBtns = tacticsBtn && this.tacticsOpen ? (
        (gSiegeable ? `<button class="abtn ${gStrat === 'siege' ? 'sel' : ''}" data-act="gstrat" data-strat="siege">⚙️ Siege<small>the line shields the guns</small></button>` : '') +
        `<button class="abtn ${gStrat === 'chaos' ? 'sel' : ''}" data-act="gstrat" data-strat="chaos">🔥 Chaos<small>attack all within reach</small></button>` +
        `<button class="abtn ${gStrat === 'strike' ? 'sel' : ''}" data-act="gstrat" data-strat="strike">⚡ Strike<small>everyone on ONE target</small></button>`) : '';
      html += `<div class="pactions">${this.helpHidden ? '' : `<span class="psub">${fleet ? 'Tap water to sail together, or an enemy ship / coastal target to attack.' : 'Tap a tile to march (melee front, archers behind), or an enemy / rival building to attack together.'}</span>`}` +
        (gLaden.length ? `<button class="abtn" data-act="gunload">⚓ Unload all<small>${gAboard} aboard</small></button>` : '') +
        (gDefEligible.length ? `<button class="abtn ${gAllDef ? 'sel' : ''}" data-act="gdefend">${gAllDef ? '🛡 Stand Down' : '🛡 Defend'}</button>` : '') +
        (gBusy ? `<button class="abtn" data-act="stop">✋ Halt</button>` : '') +
        tacticsBtn + stratBtns +
        (armyN ? `<button class="abtn" data-act="garmyremove">🪖 Remove Army ${armyN}<small>frees its banner</small></button>`
          : armySlot ? `<button class="abtn" data-act="garmysave">🪖 Save as Army ${armySlot}<small>recall it from the banner</small></button>`
          : gMil.length ? `<button class="abtn cant" data-act="garmysave">🪖 Armies full<small>remove one to save</small></button>` : '') +
        `</div>`;
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      this.iconInto(ic, R.unitSprite(first));
      const gsave = panel.querySelector('[data-act="garmysave"]');
      if (gsave) gsave.addEventListener('click', () => {
        if (gsave.classList.contains('cant')) { this.toast('All three banners are taken — remove one first', true); return; }
        this.saveArmy(this.sel.ids);
      });
      const gremove = panel.querySelector('[data-act="garmyremove"]');
      if (gremove) gremove.addEventListener('click', () => this.removeArmy(armyN));
      const gstop = panel.querySelector('[data-act="stop"]');   // renders only while gBusy
      if (gstop) gstop.addEventListener('click', () => {
        for (const id of this.sel.ids) {
          const u2 = Units.get(id);
          if (u2) { u2.task = null; u2.tUnit = 0; u2.tBld = 0; u2.tBridge = null; u2.path = null; u2.defend = false; u2.strat = null; u2.siegePost = null; u2.assault = false; }
        }
        this.toast('War party halted');
        this.renderPanel();
      });
      const gtac = panel.querySelector('[data-act="gtactics"]');
      if (gtac) gtac.addEventListener('click', () => {
        this.tacticsOpen = !this.tacticsOpen;
        this.renderPanel();
      });
      panel.querySelectorAll('[data-act="gstrat"]').forEach(btn => btn.addEventListener('click', () => {
        const mode = btn.dataset.strat;
        const mem = this.sel.ids.map(id => Units.get(id)).filter(o => o && Units.isMilitary(o) && !Units.isNaval(o));
        if (!mem.length) return;
        const on = !mem.every(o => o.strat === mode);   // tapping the lit button stands it down
        for (const o of mem) {
          o.strat = on ? mode : null;
          o.defend = false; o.assault = false;
          if (!on || mode !== 'siege') o.siegePost = null;
          if (on && mode === 'chaos') { o.tUnit = 0; o.tBld = 0; if (o.task && o.task.type !== 'move') o.task = null; }
        }
        this.toast(!on ? 'Doctrine stood down'
          : mode === 'siege' ? '⚙️ Siege — tap a building to bombard; the line shields the guns'
          : mode === 'chaos' ? '🔥 Chaos — the army falls on everything within reach'
          : '⚡ Strike — tap ONE target; the whole army hits it and nothing else');
        // the choice is made — the expander folds and its closed label wears it
        this.tacticsOpen = false;
        this.renderPanel();
      }));
      const gunload = panel.querySelector('[data-act="gunload"]');
      if (gunload) gunload.addEventListener('click', () => {
        let n = 0;
        for (const id of this.sel.ids) {
          const o = Units.get(id);
          if (o && Units.isTransport(o) && o.cargo && o.cargo.length) { n += o.cargo.length; Units.disembark(o); }
        }
        this.toast(n ? 'Landing everyone — hulls put their troops ashore' : 'Nobody aboard', !n);
        this.renderPanel();
      });
      const gdef = panel.querySelector('[data-act="gdefend"]');
      if (gdef) gdef.addEventListener('click', () => {
        const mem = this.sel.ids.map(id => Units.get(id)).filter(o => o && Units.canDefend(o));
        // turning the stance ON only takes members standing on defended
        // ground — it must never yank the far half of a mixed party home.
        // Standing DOWN releases everyone.
        const elig = mem.filter(o => o.defend || Units.inDefendBounds(o));
        const turnOn = !(elig.length && elig.every(o => o.defend));
        for (const o of (turnOn ? elig : mem)) Units.setDefend(o, turnOn);
        this.toast(turnOn ? 'Holding the line — guarding home' : 'Standing down');
        this.renderPanel();
      });
    } else {
      const u = Units.get(this.sel.id);
      if (!u) { this.deselect(); return; }
      const nm = CFG.UNITS[u.kind].name;
      const own = u.owner === 'P';
      let hint = !own ? (
          Units.isPassive(u) ? `Wild game — send a villager or defender to hunt it (+${(CFG.MEAT && CFG.MEAT[u.kind]) || CFG.MEAT_DROP} food).`
          : u.owner === 'W' ? `Wild beast — dangerous, but worth +${(CFG.MEAT && CFG.MEAT[u.kind]) || CFG.MEAT_DROP} food.`
          // barbarian tempers stay hidden — you find out who they're after
          // the same way everyone else does
          : u.owner === 'R' ? 'Barbarian — nothing but trouble. Who they strike at, only they know.'
          : 'Rival tribe')
        : u.kind === 'sapper' ? 'Pick a tool below, then tap or drag a line of tiles — dig trenches (a moat where it touches water), clear resources, or (Camp Lv 3) raise mounds — slow-to-cross berms, or reclaim near-shore water into land (costs stone & wood). The sapper works the line in order. Bridge spans water. Tool down = tap to walk. Sappers can’t fight — keep them guarded.'
        /* the BANISH explanation lives here, not under the button
           (tests/banish.mjs): the panel's hint line is where this unit's
           options are explained, and a caption under every button turns the
           action row into a wall of small print. */
        : Units.isVillager(u) ? 'Tap forest 🌲 / hills 🪨 / an orchard to gather, jumping fish 🐟 to fish off the shore, a work site to build, or a tile to walk. Banish sends them out of the valley for good — nothing is returned, but their place in the population is freed.'
        : u.kind === 'fishboat' ? 'Tap water where fish jump 🐟 to fish, or open water to row there.'
        : u.kind === 'catapult' ? 'Slow, but stone breaks stone — tap a rival wall, tower, or building to bombard it.'
        : u.kind === 'siegetower' ? 'Roll it flush against an enemy wall — nearby soldiers climb over, one per second. Only melee and marksmen can harm it.'
        : Units.isTransport(u) ? `Select soldiers or villagers and tap this hull to board — it carries ${CFG.UNITS[u.kind].cap}. Tap a shore tile to land them, or water to row.`
        : Units.isNaval(u) ? 'Tap an enemy or rival building near the shore to attack, or water to sail.'
        : 'Tap a tile to move, or an enemy to attack.';
      if (!own && !Units.isPassive(u)) {
        const stack = S.units.filter(o => o.owner !== 'P' && !Units.isPassive(o) &&
          (o.x | 0) === (u.x | 0) && (o.y | 0) === (u.y | 0));
        if (stack.length > 1) {
          const atk = Math.round(stack.reduce((s, o) => s + Units.effAtk(o), 0));
          const hp = Math.ceil(stack.reduce((s, o) => s + o.hp, 0));
          hint += ` ⚠️ ${stack.length} enemies stacked here — combined ATK ${atk}, HP ${hp}.`;
        }
      }
      // the how-to text is collapsible for OWN units (enemy hints carry live
      // tactical info like stacked-attack warnings, so those always show):
      // − tucks it away, ℹ️ brings it back; the choice is remembered on-device
      const helpBtn = own ? `<button class="abtn" id="helpToggle" title="${this.helpHidden ? 'Show unit tips' : 'Hide unit tips'}">${this.helpHidden ? 'ℹ️' : '−'}</button>` : '';
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${own ? '' : '☠ '}${nm}</div>
        <div class="psub">HP ${Math.ceil(u.hp)}/${u.maxhp} · ATK ${Math.round(Units.effAtk(u))} · DEF ${u.def}</div>
        <div class="pwork" id="pWork">${own ? this.workLine(u) : ''}</div></div>
        ${helpBtn}<button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions">${own && this.helpHidden ? '' : `<span class="psub">${hint}</span>`}`;
      if (own && u.hp < u.maxhp && CFG.HEAL_FOOD[u.kind]) {
        const hc = this.healCost(u);
        const inZone = Bld.inHealZone(u);
        const throttled = this.healThrottled(u);
        const ok = inZone && S.res.food >= hc && !throttled;
        const sub = throttled ? 'Cooldown…' : inZone ? Bld.costStr({ food: hc }) : 'near ' + (Units.isNaval(u) ? 'Dock' : 'Town Center');
        html += `<button class="abtn ${ok ? '' : 'cant'}" data-act="heal">❤️ Heal<small id="healCost">${sub}</small></button>`;
      }
      // Unload renders only with someone aboard — an empty hull's button could
      // only toast a refusal, and the capacity now rides in the hint line
      if (own && Units.isTransport(u) && (u.cargo || []).length) {
        const cap = CFG.UNITS[u.kind].cap;
        html += `<button class="abtn" data-act="unload">⚓ Unload here<small>${u.cargo.length}/${cap} aboard</small></button>`;
      }
      // SCUTTLE (tests/boats-moat-scuttle.mjs): any own hull can be sunk on
      // purpose — no resources come back, but its place in the population is
      // freed. Two taps, same confirm pattern as demolish.
      if (own && Units.isNaval(u)) {
        html += this.confirmDemolish === u.id
          ? `<button class="abtn danger" data-act="scuttle">⚠️ Confirm — sink her<small>no resources returned</small></button>`
          : `<button class="abtn" data-act="scuttle">🌊 Scuttle<small>sink the hull, free its place in the population</small></button>`;
      }
      if (own && u.kind === 'sapper') {
        const tier = Units.sapperTier(u.owner);
        const tool = (job, icon, label, minTier) => {
          const locked = tier < minTier;
          const active = this.terraMode === job && !locked;
          const fee = CFG.TERRAFORM[job + 'Cost'];
          const sub = locked ? `Camp Lv ${minTier}` : fee ? `${Bld.costStr(fee)} / tile` : '';
          return `<button class="abtn ${locked ? 'cant' : ''}${active ? ' sel' : ''}" data-act="terra" data-job="${job}">${icon} ${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
        };
        html += tool('dig', '🕳', 'Trench / Moat', 1);
        html += tool('bridge', '🌉', 'Bridge', 2);
        html += tool('clear', '⛏', 'Clear', 3);
        html += tool('mound', '⛰', 'Mound', 3);
      }
      /* BUILD and BANISH share a row (tests/banish.mjs). Banish is the
         villager's Scuttle: nothing comes back but the place in the
         population, which late on — when the fields are staffed and you want
         spears instead — is the only thing you actually wanted. Two taps, the
         same confirm pattern the hulls and demolition use, because it cannot
         be undone once they reach the rim. */
      if (own && Units.isVillager(u)) {
        html += `<button class="abtn" data-act="gobuild">🔨 Build</button>`;
        html += this.confirmDemolish === u.id
          ? `<button class="abtn danger" data-act="banish">⚠️ Confirm — send them away</button>`
          : `<button class="abtn" data-act="banish">👋 Banish</button>`;
      }
      // resource-station upgrade, right on the worker's panel
      const wb = own ? this.villagerResBld(u) : null;
      if (wb) {
        const rn = Bld.def(wb.key).name;
        if (wb.upgrading > 0) {
          const frac = Math.max(0, Math.min(1, 1 - wb.upgrading / (wb.upgTotal || wb.upgrading)));
          html += `<div class="abtn cant" style="pointer-events:none">🏗 Upgrading ${rn} → Lv ${wb.level + 1}` +
            `<small><span id="upresLeft">${Math.ceil(wb.upgrading)}d</span> left</small>` +
            `<div style="height:4px;margin-top:5px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden">` +
            `<div id="upresBar" style="height:100%;width:${Math.round(frac * 100)}%;background:var(--gold)"></div></div></div>`;
        } else if (wb.level >= 3) {
          html += `<button class="abtn cant" disabled>⭐ ${rn} — Max level</button>`;
        } else {
          const up = Bld.canUpgrade(wb), cost = CFG.BUILDINGS[wb.key].levels[wb.level].cost;
          html += `<button class="abtn wide ${up.ok ? '' : 'cant'}" data-act="upres">⬆ Upgrade ${rn} to Lv ${wb.level + 1}` +
            `<small>${Bld.costStr(cost)}${up.ok ? '' : ' — ' + up.why}</small></button>`;
        }
      }
      // Group renders only with somebody in reach to band with (groupmatesNear
      // is the handler's own filter — the button never offers an empty muster)
      if (own && this.groupmatesNear(u))
        html += `<button class="abtn" data-act="group">${Units.isNaval(u) ? '⚓ Group fleet' : '👥 Group nearby'}</button>`;
      // Military units (land soldiers + warships) get DEFEND in place of Stop —
      // a held perimeter round the Town Center / Dock. Stop renders only while
      // unitBusy says there is anything to stop (the sapper's old working-only
      // Stop was this rule already; it now holds for every unit).
      // Defend is offered only on ground the stance would actually hold — a
      // soldier out beyond the defended bounds is attacking, not defending
      // (a unit already in the stance keeps Stand Down wherever it is)
      if (own && Units.canDefend(u) && (u.defend || Units.inDefendBounds(u)))
        html += `<button class="abtn ${u.defend ? 'sel' : ''}" data-act="defend">${u.defend ? '🛡 Stand Down' : '🛡 Defend'}</button>`;
      else if (own && !Units.isVillager(u) && this.unitBusy(u))
        html += `<button class="abtn" data-act="stop">✋ Stop</button>`;
      /* THE LAST OF AN ARMY (tests/army-groups.mjs). A war party ground down to
         one soldier still flies its banner, but a one-member group renders as
         the UNIT panel (see the group branch above) — which used to leave the
         player tapping the banner, getting this panel, and having no way to
         free the number. Remove appears here too when this soldier IS the
         whole of a saved army; it never appears for one member of a larger
         one, where disbanding the lot from a single man's panel would be a
         surprise. */
      const soleArmy = own ? this.armyOfUnit(u) : 0;
      if (soleArmy)
        html += `<button class="abtn wide" data-act="armyremove">🪖 Remove Army ${soleArmy}<small>the last of it — frees its banner</small></button>`;
      html += '</div>';
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      this.iconInto(ic, R.unitSprite(u));
      const stop = panel.querySelector('[data-act="stop"]');
      if (stop) stop.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        // Stop clears everything unitBusy counts (the button renders by that
        // predicate, so anything left uncleared would leave a Stop that does
        // nothing) — doctrine included, the group Halt's own rule
        if (u2) { u2.task = null; u2.tUnit = 0; u2.tBld = 0; u2.tBridge = null; u2.path = null; u2.jobs = null;
          u2.strat = null; u2.siegePost = null; u2.assault = false; }
        this.terraMode = null;   // downing tools stops the terraform tool too
        this.renderPanel();
      });
      const armyRm = panel.querySelector('[data-act="armyremove"]');
      if (armyRm) armyRm.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id); if (!u2) return;
        const n = this.armyOfUnit(u2);
        if (n) this.removeArmy(n);
        this.renderPanel();
      });
      const defBtn = panel.querySelector('[data-act="defend"]');
      if (defBtn) defBtn.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id); if (!u2) return;
        Units.setDefend(u2, !u2.defend);
        this.toast(u2.defend
          ? (Units.isNaval(u2) ? 'Holding station — guarding the Dock' : 'Holding the line — guarding the Town Center')
          : 'Standing down');
        this.renderPanel();
      });
      const upres = panel.querySelector('[data-act="upres"]');
      if (upres) upres.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id); if (!u2) return;
        const b2 = this.villagerResBld(u2); if (!b2) return;
        const c = Bld.canUpgrade(b2);
        if (!c.ok) { this.toast(c.why, true); return; }
        if (Bld.upgrade(b2)) {
          this.toast(`${Bld.def(b2.key).name} upgrading to Lv ${b2.level + 1} — the crew builds it, then back to work`);
          this.dispatchedWorker();   // the villager is off building the upgrade — deselect like any dispatch
        } else this.renderPanel();
      });
      // sapper terraform tools — arm a job; the next tile tap performs it
      panel.querySelectorAll('[data-act="terra"]').forEach(btn => btn.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id); if (!u2) return;
        const job = btn.dataset.job, tier = Units.sapperTier(u2.owner);
        const minTier = (job === 'clear' || job === 'mound') ? 3 : job === 'bridge' ? 2 : 1;
        if (tier < minTier) { this.toast(`Needs a Sappers’ Camp Lv ${minTier}`, true); return; }
        this.terraMode = this.terraMode === job ? null : job;   // toggle the tool
        this.toast(this.terraMode
          ? (job === 'dig' ? 'Dig tool — tap or drag a line of ground (a moat forms beside water)'
            : job === 'bridge' ? 'Bridge tool — tap water or a moat to span it'
            : job === 'mound' ? 'Mound tool — raise slow-to-cross berms, or reclaim near-shore water (costs stone & wood)'
            : 'Clear tool — tap or drag across forest 🌲 / rock 🪨 / orchard')
          : 'Tool down — tap a tile to walk');
        this.renderPanel();
      }));
      const unload = panel.querySelector('[data-act="unload"]');
      if (unload) unload.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (!u2 || !u2.cargo || !u2.cargo.length) { this.toast('Nobody aboard', true); return; }
        Units.disembark(u2);   // logs the outcome either way
        this.renderPanel();
      });
      const ban = panel.querySelector('[data-act="banish"]');
      if (ban) ban.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (!u2 || !Units.canBanish(u2)) return;
        if (this.confirmDemolish !== u2.id) { this.confirmDemolish = u2.id; this.renderPanel(); return; }
        this.confirmDemolish = 0;
        Units.banish(u2);
        this.toast('Banished — they are walking out of the valley');
        this.deselect();
      });
      const scut = panel.querySelector('[data-act="scuttle"]');
      if (scut) scut.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (!u2) return;
        // never send soldiers down with the ship — an accidental tap would be brutal
        if (Units.isTransport(u2) && u2.cargo && u2.cargo.length) { this.toast('Soldiers are aboard — unload before scuttling', true); return; }
        if (this.confirmDemolish !== u2.id) { this.confirmDemolish = u2.id; this.renderPanel(); return; }
        R.float(u2.x, u2.y - 0.3, '🌊', '#9fc7e8');
        Units.despawn(u2);   // deselects; population headcount follows the roster
        G.log('Hull scuttled — she slips beneath the water');
        this.toast('Scuttled — its place in the population is freed');
      });
      const heal = panel.querySelector('[data-act="heal"]');
      if (heal) heal.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (!u2 || u2.hp >= u2.maxhp) return;
        // rate-limited BEFORE the zone/afford checks: this is the reason that
        // actually applies mid-fight, where both of those are already fine
        if (this.healThrottled(u2)) { this.toast('Healed enough — let them rest', true); return; }
        if (!Bld.inHealZone(u2)) { this.toast(Units.isNaval(u2) ? 'Ships heal at a Dock — move closer' : 'Can only heal within the Town Center grounds', true); return; }
        const cost = this.healCost(u2);
        if (S.res.food < cost) { this.toast('Not enough food', true); return; }
        S.res.food -= cost;
        this.noteHeal(u2);
        u2.hp = u2.maxhp;
        R.float(u2.x, u2.y - 0.5, '❤', '#8ae08a');
        this.toast(`Healed for ${cost} food`);
        this.renderPanel();
      });
      const gobuild = panel.querySelector('[data-act="gobuild"]');
      if (gobuild) gobuild.addEventListener('click', () => {
        const vid = this.sel.id;
        if (this.menuCollapsed) this.setMenuCollapsed(false);
        this.deselect();          // brings the build menu back
        this.builderFor = vid;    // after deselect/select bookkeeping
        this.toast('Pick a building, then tap a site — this villager will build it');
      });
      const grp = panel.querySelector('[data-act="group"]');
      if (grp) grp.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (!u2) return;
        // gather nearby craft/fighters of the SAME domain — a fleet forms from any
        // war or transport hull (never fishing boats), a war party from land
        // troops; the two can't march/sail together
        const naval = Units.isNaval(u2);
        const ids = S.units
          .filter(o => o.owner === 'P' && (naval ? Units.isFleetable(o) : (Units.isMilitary(o) && !Units.isNaval(o))) &&
            Math.hypot(o.x - u2.x, o.y - u2.y) <= CFG.GROUP_R)
          .map(o => o.id);
        if (ids.length < 2) { this.toast(naval ? 'No other ships within reach' : 'No other soldiers within reach', true); return; }
        this.sel = { type: 'group', ids };
        this.confirmDemolish = 0; this.tacticsOpen = false;   // a fresh group starts clean
        this.renderPanel();
        this.toast(`${naval ? 'Fleet' : 'War party'} formed: ${this.groupComposition(ids)}`);
      });
    }
    panel.querySelector('#panelClose').addEventListener('click', () => this.deselect());
    const helpT = panel.querySelector('#helpToggle');
    if (helpT) helpT.addEventListener('click', () => this.toggleUnitHelp());
    // pack the grid: any button left alone in its two-column row stretches to
    // full width — no half-empty rows, no ragged stacking
    {
      const kids = [...panel.querySelectorAll('.pactions > *')];
      let col = 0;
      kids.forEach((el, i) => {
        const spans = c => c.classList.contains('wide') || c.classList.contains('psub');
        if (spans(el)) { col = 0; return; }
        if (col === 0) {
          const next = kids[i + 1];
          if (!next || spans(next)) el.classList.add('wide');
          else col = 1;
        } else col = 0;
      });
    }
    panel.classList.toggle('show', !this.panelHidden);   // a tucked-away panel stays tucked
    document.getElementById('buildmenu').style.display = 'none';
    this.syncBottomToggle();   // non-villagers get a single ▾ minimize, not "🔨 Build"
  },

  /* ---------------- top bar / periodic refresh ---------------- */
  fmtRes(n) {
    n |= 0;
    return n >= 10000 ? (Math.round(n / 100) / 10 + '').replace(/\.0$/, '') + 'k' : String(n);
  },
  refresh(dt) {
    this.tickPlacement(dt);   // per-frame: edge scroll + ghost DOM must not wait on the throttle
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.25;
    document.getElementById('rFood').textContent = this.fmtRes(S.res.food);
    const fnet = document.getElementById('rFoodNet');
    if (fnet) {
      const eat = Units.foodUpkeep('P');
      fnet.textContent = eat > 0 ? '−' + Math.round(eat) + '/d' : '';
      fnet.classList.toggle('bad', !!S._famineWarned || (eat > 0 && S.res.food <= 0));
    }
    document.getElementById('rWood').textContent = this.fmtRes(S.res.wood);
    document.getElementById('rStone').textContent = this.fmtRes(S.res.stone);
    document.getElementById('rGold').textContent = this.fmtRes(S.res.gold);
    document.getElementById('rPop').textContent = Units.popUsed('P') + '/' + Bld.popCap('P');
    document.getElementById('rDay').textContent = 'Day ' + S.day;
    this.refreshMenu();
    if (this.sel) this.refreshPanel();
  },

  _toastAt: {},
  // Popups are reserved for things that need attention NOW: danger alerts and
  // "why that didn't work" errors — both flagged `warn`. Everything else (build
  // confirmations, orders, routine events, enemy micro-actions) is quietly
  // recorded in the event log instead of popping a toast, so the screen stays
  // calm. A near-identical note within a few seconds is also collapsed
  // ("House under attack!" ×9 → one), so even alerts never spam.
  toast(msg, warn, ms) {
    if (!warn) return;                       // routine notes live only in the event log
    const key = msg.replace(/\d+/g, '#');
    const now = performance.now();
    if (now - (this._toastAt[key] || -1e9) < 6000) return;
    this._toastAt[key] = now;
    const hold = ms || 3200;
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { el.style.opacity = '0'; }, hold);
    setTimeout(() => { el.remove(); }, hold + 700);
  },

  /* ---------------- HUD buttons (menus live in the Screens shell) ---------------- */
  bindButtons() {
    document.getElementById('bmToggle').addEventListener('click', () => {
      // a selected non-villager: the toggle is a single panel minimize, not the
      // Build menu (which it can't use). Villagers / no-selection keep the Build toggle.
      if (this.panelMinMode()) this.togglePanelMin();
      else this.setMenuCollapsed(!this.menuCollapsed);
    });
    document.getElementById('miniToggle').addEventListener('click', () =>
      this.setMiniCollapsed(!this.miniCollapsed));
    document.getElementById('btnMenu').addEventListener('click', () => Screens.show('paused'));
    document.getElementById('btnPause').addEventListener('click', e => {
      S.paused = !S.paused;
      e.target.textContent = S.paused ? '▶' : '⏸';
    });
  },

  showEnd(win, msg) { Screens.showEnd(win, msg); },
};
