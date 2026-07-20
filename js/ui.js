"use strict";
/* Touch/mouse input, build menu, selection panel, top bar, toasts, save/load. */

const UI = {
  sel: null,          // {type:'unit'|'bld', id}
  placing: null,      // building key while placing
  placeTile: null,
  pointers: new Map(),
  pinchD: 0,
  downAt: null,
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
  settingRally: null,    // building id waiting for a rally-point tap
  MENU_KEYS: ['house', 'farm', 'lumber', 'quarry', 'lodge', 'tower', 'barracks', 'stable', 'range', 'dock', 'siege', 'sapper', 'trade', 'wall', 'gate'],

  // paint a sprite into an icon canvas: back it at 64px and scale the WHOLE
  // sprite in (sprites are now 64px — a naive drawImage would clip to a corner),
  // so menu/panel thumbnails read clearly whatever the source resolution.
  iconInto(ic, spr) {
    if (!spr) return;
    ic.width = 64; ic.height = 64;
    const g = ic.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(spr, 0, 0, spr.width, spr.height, 0, 0, 64, 64);
  },

  init() {
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
      const btn = document.createElement('button');
      btn.className = 'bbtn'; btn.dataset.key = key;
      const ic = document.createElement('canvas');
      this.iconInto(ic, Sprites.building[key][0]);
      btn.appendChild(ic);
      const nm = document.createElement('div'); nm.className = 'bname'; nm.textContent = d.name;
      const co = document.createElement('div'); co.className = 'bcost'; co.textContent = Bld.costStr(Bld.effCost('P', key));
      btn.appendChild(nm); btn.appendChild(co);
      btn.addEventListener('click', () => {
        if (this.placing === key) { this.placing = null; this.builderFor = null; }
        else {
          const tc = Bld.tcOf('P');
          if (d.reqTC && (!tc || tc.level < d.reqTC)) { this.toast(`Needs Town Center Lv ${d.reqTC}`, true); return; }
          const can = Bld.canAfford(Bld.effCost('P', key));   // card discounts count
          if (!can) { this.toast('Not enough resources', true); return; }
          this.placing = key;
          this.deselect();
          this.toast(`Tap a clear tile to place the ${d.name}`);
          // tuck the build menu away so the whole map is visible to pick a site
          // (keepPlacing: don't cancel the building we just chose)
          this.setMenuCollapsed(true, true);
        }
        this.refreshMenu();
      });
      el.appendChild(btn);
    }
  },

  refreshMenu() {
    const tc = Bld.tcOf('P');
    document.querySelectorAll('.bbtn').forEach(b => {
      const cost = Bld.effCost('P', b.dataset.key);   // card discounts show true prices
      const gated = CFG.BUILDINGS[b.dataset.key].reqTC && (!tc || tc.level < CFG.BUILDINGS[b.dataset.key].reqTC);
      b.classList.toggle('sel', this.placing === b.dataset.key);
      b.classList.toggle('cant', gated || !Bld.canAfford(cost));
      const co = b.querySelector('.bcost');
      if (co) {
        const txt = Bld.costStr(cost);
        if (co.textContent !== txt) co.textContent = txt;
      }
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
        } else if (this.armedSapper()) {
          // a sapper tool is armed: drag paints a line of tiles to dig/clear
          this.terraDrag = [R.screenToTile(e.clientX, e.clientY)];
          this.updateTerraGhost();
          this.downAt = null;
        } else {
          this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        this.downAt = null;
        this.wallDrag = null; this.wallGhost = null;   // pinch cancels the line
        this.terraDrag = null; this.terraGhost = null;
      }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (this.placing) this.placeTile = R.screenToTile(e.clientX, e.clientY);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        if (this.wallDrag) {
          this.extendWallDrag(R.screenToTile(e.clientX, e.clientY));
        } else if (this.terraDrag) {
          this.extendTerraDrag(R.screenToTile(e.clientX, e.clientY));
        } else {
          if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8)
            this.downAt.moved = true;
          if (this.downAt && this.downAt.moved) {
            R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
            R.clampCam();
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
      if (this.wallDrag) {
        this.commitWallDrag();
        this.wallDrag = null; this.wallGhost = null;
      } else if (this.terraDrag) {
        this.commitTerraDrag();
        this.terraDrag = null; this.terraGhost = null;
      } else if (this.downAt && !this.downAt.moved && performance.now() - this.downAt.t < 400) {
        this.handleTap(e.clientX, e.clientY);
      }
      if (this.pointers.size < 2) this.pinchD = 0;
      if (this.pointers.size === 0) this.downAt = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => {
      this.pointers.delete(e.pointerId);
      this.downAt = null;
      this.wallDrag = null; this.wallGhost = null;
      this.terraDrag = null; this.terraGhost = null;
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
    this.terraGhost = chain.map(t => {
      let ok = !!S.map.explored[MapGen.idx(t.x, t.y)] && Units.canTerraform(u.owner, t.x, t.y, job);
      if (ok && job === 'dig' && Terraform.digWouldSeal(t.x, t.y)) ok = false;
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
      this.toast(n
        ? `${noun} line: ${n} tile${n > 1 ? 's' : ''} — the sapper works them in order`
        : 'Those tiles are already queued');
      this.terraMode = null;   // planning done — disarm so the next tap walks (no accidental digs)
      this.renderPanel();
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
    let placed = 0, first = null;
    for (const t of ghost) {
      if (!t.ok) continue;
      if (!Bld.canPlace('P', 'wall', t.x, t.y).ok) continue;   // re-check with live resources
      const b = Bld.place('P', 'wall', t.x, t.y, { noAutoAssign: true });
      if (!first) first = b;
      placed++;
    }
    if (placed) {
      const v = Units.nearestIdleVillager(first.x, first.y);
      if (v && Units.assignBuild(v, first))
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

    // placement mode
    if (this.placing) {
      const can = Bld.canPlace('P', this.placing, tile.x, tile.y);
      if (can.ok) {
        Bld.place('P', this.placing, tile.x, tile.y, { builderId: this.builderFor });
        this.builderFor = null;
        this.placing = null; this.placeTile = null;
      } else this.toast(can.why, true);
      this.refreshMenu();
      return;
    }

    const explored = S.map.explored[MapGen.idx(tile.x, tile.y)];
    // hit-test a unit near the tap point (only what we can actually see)
    let hitUnit = null, hd = 0.7;
    for (const u of S.units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      let dd = d - (u.owner === 'P' ? 0.15 : 0); // bias towards own units
      // a worker standing on their plot yields the tap to the building unless hit dead-on
      if (u.task && u.task.type === 'work') dd += 0.3;
      if (dd < hd) { hd = dd; hitUnit = u; }
    }
    const hitBld = G.visibleAt(tile.x, tile.y) ? Bld.at(tile.x, tile.y) : null;
    // When the tap lands squarely on a building's footprint, the building wins the
    // tap — UNLESS a unit is sitting essentially dead-on the tap point. Without this,
    // a villager stationed on its plot steals every tap and the building takes two or
    // three tries plus a zoom to finally select. Two guards: a worker OF this building
    // always yields to it (tap the plot, get the plot), and any other unit yields
    // unless it's right under the finger. A unit you mean to grab is still one tap
    // away — put your finger on its sprite (distance ~0 always wins).
    if (hitBld && hitUnit) {
      const worksHere = hitUnit.task && hitUnit.task.type === 'work' && hitUnit.task.id === hitBld.id;
      if (worksHere || Math.hypot(hitUnit.x - wx, hitUnit.y - wy) > 0.42) hitUnit = null;
    }
    const hitBridge = (explored && Bld.bridgeAt) ? Bld.bridgeAt(tile.x, tile.y) : null;

    // orders for a selected war party
    if (this.sel && this.sel.type === 'group') {
      const ids = this.sel.ids.filter(id => Units.get(id));
      if (!ids.length) { this.deselect(); return; }
      this.sel.ids = ids;
      const fleet = ids.every(id => { const o = Units.get(id); return o && Units.isNaval(o); });
      if (hitUnit && hitUnit.owner !== 'P') {
        for (const id of ids) {
          const u = Units.get(id);
          if (Units.isTransport(u)) continue;   // troop hulls hold back — they don't charge with their cargo aboard
          // an explicit attack order: no guard leash yanking stragglers home mid-charge
          u.task = { type: 'attack' }; u.tUnit = hitUnit.id; u.tBld = 0;
          u.anchor = { x: hitUnit.x, y: hitUnit.y };
          u.defend = false;   // direct command ends the guard stance
          u.assault = true;   // and commits them to press on once this target drops
        }
        this.toast(fleet ? '⚓ Fleet attacks!' : '⚔️ War party attacks!');
        return;
      }
      if (hitUnit && hitUnit.owner === 'P' && Units.isTransport(hitUnit)) {
        let n = 0;
        for (const id of ids) {
          const u = Units.get(id);
          if (u && Units.isMilitary(u) && !Units.isNaval(u) && Units.orderBoard(u, hitUnit)) n++;
        }
        this.toast(n ? `${n} boarding — the ${CFG.UNITS[hitUnit.kind].name} holds ${CFG.UNITS[hitUnit.kind].cap}`
          : 'Transport is full (or away from shore)', !n);
        return;
      }
      if (hitBld && hitBld.owner === 'A') {
        for (const id of ids) { const u = Units.get(id); if (u && !Units.isTransport(u)) { u.defend = false; u.assault = true; Units.orderAttackBuilding(u, hitBld); } }
        this.toast('⚔️ ' + (fleet ? 'Fleet bombards ' : 'War party attacks ') + Bld.def(hitBld.key).name);
        return;
      }
      if (hitBridge && hitBridge.owner !== 'P') {
        for (const id of ids) { const u = Units.get(id); if (u && Units.isMilitary(u)) { u.defend = false; Units.orderAttackBridge(u, hitBridge); } }
        this.toast('⚔️ War party moves to sever the bridge');
        return;
      }
      if (!hitUnit && !hitBld) {
        if (!explored) { this.toast('Unexplored', true); return; }
        for (const id of ids) { const u = Units.get(id); if (u) u.defend = false; }
        Units.groupMove(ids, tile.x, tile.y);
        this.toast(fleet ? '⚓ Fleet sailing out' : 'War party moving — melee front, archers behind');
        return;
      }
      // tapped one of our own units/buildings: fall through and reselect it
    }

    // orders for a selected player unit
    const sel = this.sel && this.sel.type === 'unit' ? Units.get(this.sel.id) : null;
    if (sel && sel.owner === 'P') {
      if (hitUnit && hitUnit.owner !== 'P') {
        sel.task = { type: 'attack' }; sel.tUnit = hitUnit.id; sel.tBld = 0;
        sel.anchor = { x: hitUnit.x, y: hitUnit.y };
        sel.defend = false;   // taking direct control ends the guard stance
        sel.assault = true;   // press on to the next mark once this one falls
        this.toast('Attack!');
        return;
      }
      if (hitUnit && hitUnit.owner === 'P' && Units.isTransport(hitUnit) &&
          Units.isMilitary(sel) && !Units.isNaval(sel)) {
        if (Units.orderBoard(sel, hitUnit)) this.toast('Boarding the ' + CFG.UNITS[hitUnit.kind].name);
        else this.toast('Transport is full (or away from shore)', true);
        return;
      }
      if (hitBld && hitBld.owner === 'A' && Units.isMilitary(sel)) {
        sel.defend = false;
        sel.assault = true;
        Units.orderAttackBuilding(sel, hitBld);
        this.toast('Attacking ' + Bld.def(hitBld.key).name);
        return;
      }
      if (hitBridge && hitBridge.owner !== 'P' && Units.isMilitary(sel)) {
        sel.defend = false;
        Units.orderAttackBridge(sel, hitBridge);
        this.toast('Moving to sever the bridge');
        return;
      }
      if (hitBld && hitBld.owner === 'P' && Units.isVillager(sel) &&
          (hitBld.construction > 0 || hitBld.upgrading > 0 || hitBld.hp < hitBld.maxhp)) {
        Units.assignBuild(sel, hitBld);
        this.toast(hitBld.hp < hitBld.maxhp && !hitBld.construction && !hitBld.upgrading
          ? 'Villager sent to repair' : 'Villager sent to build');
        return;
      }
      if (hitBld && hitBld.owner === 'P' && Units.isVillager(sel) &&
          Bld.def(hitBld.key).needsWorker && !hitBld.construction) {
        if (Bld.workersAssigned(hitBld) >= Bld.maxWorkers(hitBld)) {
          this.toast(`${Bld.def(hitBld.key).name} is fully staffed (${Bld.maxWorkers(hitBld)})`, true);
          return;
        }
        sel.task = { type: 'work', id: hitBld.id }; sel.tUnit = 0; sel.tBld = 0;
        Units.setPath(sel, hitBld.x, hitBld.y);
        this.toast('Villager stationed at the ' + Bld.def(hitBld.key).name);
        return;
      }
      if (!hitUnit && (!hitBld || hitBld.owner !== 'P')) {
        if (!explored) { this.toast('Unexplored', true); return; }
        if (Units.isVillager(sel) && CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]]) {
          if (Units.assignGather(sel, tile.x, tile.y)) { this.toast('Gathering ' + sel.task.res); this.dispatchedVillager(); }
          return;
        }
        if (Units.isVillager(sel) && S.map.terrain[MapGen.idx(tile.x, tile.y)] === T.WATER) {
          // shore fishing — but only where the fish actually are
          if (MapGen.shoal(tile.x, tile.y) && S.map.resAmount[MapGen.idx(tile.x, tile.y)] > 0) {
            if (Units.assignShoreFish(sel, tile.x, tile.y)) { this.toast('Line out — fishing from the shore 🎣'); this.dispatchedVillager(); }
            else this.toast('No clear shore to fish from', true);
          } else this.toast('No fish here — watch for fish breaking the surface', true);
          return;
        }
        if (sel.kind === 'fishboat' && Units.canFish(tile.x, tile.y)) {
          if (Units.assignFish(sel, tile.x, tile.y)) this.toast('Nets out — fishing 🐟');
          return;
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
          if (Units.assignTerraform(sel, tile.x, tile.y, mode))
            this.toast(mode === 'dig' ? 'Sapper digging ⛏' : mode === 'bridge' ? 'Sapper raising a bridge 🌉'
              : mode === 'mound' ? 'Sapper raising a mound ⛰' : 'Sapper breaching ⛏');
          else this.toast('Can’t reshape that tile', true);
          return;   // tool stays armed — tap on to dig a whole channel
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

    // convenience: tap a resource tile (or a jumping-fish shoal) with nothing
    // selected → send an idle villager
    if (explored && CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]] && !this.sel) {
      const idle = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
      if (idle && Units.assignGather(idle, tile.x, tile.y)) {
        this.toast('Idle villager sent to gather');
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

  select(type, id) {
    this.sel = { type, id };
    this.builderFor = null;
    this.confirmDemolish = 0;
    this.terraMode = null;      // a fresh selection drops any armed sapper tool
    this.panelHidden = false;   // a fresh selection brings its panel back
    this.renderPanel();
  },
  selectBridge(x, y) {
    this.sel = { type: 'bridge', x, y };
    this.builderFor = null; this.confirmDemolish = 0; this.terraMode = null; this.panelHidden = false;
    this.renderPanel();
  },
  deselect() {
    this.sel = null;
    this.confirmDemolish = 0;
    this.settingRally = null;
    this.terraMode = null;
    this.panelHidden = false;
    document.getElementById('panel').classList.remove('show');
    document.getElementById('buildmenu').style.display = this.menuCollapsed ? 'none' : 'flex';
    this.syncBottomToggle();
  },

  // Is the bottom-bar toggle a plain PANEL minimize right now (▾/▴), rather than
  // the Build-menu toggle? True whenever a NON-VILLAGER is selected — a boat,
  // soldier, sapper, siege engine, or a whole war party can't build, so offering
  // "🔨 Build" there is meaningless and made minimizing take two taps. Villagers
  // (who do build) and the no-selection state keep the Build toggle untouched.
  panelMinMode() {
    if (!this.sel) return false;
    if (this.sel.type === 'group') return true;
    if (this.sel.type === 'unit') {
      const u = Units.get(this.sel.id);
      return !!(u && u.owner === 'P' && !Units.isVillager(u));
    }
    return false;
  },
  // set the toggle's glyph to match the current mode/state (called on select,
  // renderPanel, deselect, and after a minimize)
  syncBottomToggle() {
    const t = document.getElementById('bmToggle');
    if (!t) return;
    t.textContent = this.panelMinMode()
      ? (this.panelHidden ? '▴' : '▾')                       // one panel minimize/restore
      : (this.menuCollapsed ? '🔨 Build ▴' : '▾');           // the Build-menu toggle
  },
  // minimize/restore the selection panel for a non-villager (keeps the selection
  // live so the unit still answers taps on the open board below)
  togglePanelMin() {
    this.panelHidden = !this.panelHidden;
    document.getElementById('panel').classList.toggle('show', !this.panelHidden);
    document.getElementById('buildmenu').style.display = 'none';
    this.syncBottomToggle();
  },

  // a villager sent off to a resource job needs no further orders — drop the
  // selection and tuck the menu away so the board is clear for the next pick
  dispatchedVillager() {
    this.deselect();
    this.setMenuCollapsed(true, true);
  },

  setMenuCollapsed(v, keepPlacing) {
    this.menuCollapsed = v;
    const t = document.getElementById('bmToggle');
    t.textContent = v ? '🔨 Build ▴' : '▾';
    if (this.sel) {
      // the ▾ tucks the selection panel away but KEEPS the selection — the
      // villager/soldier still answers taps on the open ground below
      this.panelHidden = v;
      document.getElementById('panel').classList.toggle('show', !v);
      document.getElementById('buildmenu').style.display = 'none';
    } else {
      document.getElementById('buildmenu').style.display = v ? 'none' : 'flex';
    }
    if (v && !keepPlacing && this.placing) { this.placing = null; this.builderFor = null; this.refreshMenu(); }
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
        !!b.rally, this.confirmDemolish === b.id].join('|');
      if (b.key === 'tc') {
        // visibility bits: pointless buttons unrender the moment they empty
        const vills = S.units.some(u => u.owner === 'P' && Units.isVillager(u));
        const idle = S.units.some(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
        sig += '|' + (S.wallLevel || 1) + '|' + Bld.forts().length +
               '|' + vills + '|' + (S.garrison.length > 0) + '|' + idle +
               '|' + (b.wallUp > 0 ? 'w' + b.wallUpTarget : '-');
      }
      // Trading Post: caravan out/in flips the whole panel; per-good affordability
      // greys the buttons. (The countdown itself ticks in place via refreshPanel.)
      if (b.key === 'trade')
        sig += '|' + (b.caravan ? 'car' : CFG.TRADE.goods.map(r => (S.res[r] || 0) >= Bld.tradeSpec(b).input ? '1' : '0').join(''));
      return sig;
    }
    if (this.sel.type === 'group') {
      const alive = this.sel.ids.filter(id => Units.get(id)).length;
      return alive ? 'g|' + alive : 'gone';
    }
    if (this.sel.type === 'bridge') {
      const br = Bld.bridgeAt(this.sel.x, this.sel.y);
      if (!br) return 'gone';
      return ['br', br.owner, br.level, br.hp < br.maxhp, Bld.canUpgradeBridge(br), this.confirmDemolish === 'bridge'].join('|');
    }
    const u = Units.get(this.sel.id);
    if (!u) return 'gone';
    let stack = 0;
    if (u.owner !== 'P' && !Units.isPassive(u))
      stack = S.units.filter(o => o.owner !== 'P' && !Units.isPassive(o) &&
        (o.x | 0) === (u.x | 0) && (o.y | 0) === (u.y | 0)).length;
    const sig = ['u', u.id, u.hp < u.maxhp, stack, u.cargo ? u.cargo.length : 0,
      !!CFG.HEAL_FOOD[u.kind] && S.res.food >= this.healCost(u), Bld.inHealZone(u)];
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
    const hc = document.getElementById('healCost');
    if (hc && this.sel.type === 'unit') {
      const u = Units.get(this.sel.id);
      if (u) hc.textContent = Bld.inHealZone(u) ? this.healCost(u) + ' 🍖' : 'near ' + (Units.isNaval(u) ? 'Dock' : 'Town Center');
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
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${b.owner === 'A' ? 'Rival ' : ''}${d.name} <span style="color:var(--gold)">Lv ${b.level}</span></div>
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
        if (b.level < 3 && !b.construction && b.key !== 'wall' && b.key !== 'gate') {
          const up = Bld.canUpgrade(b);
          const cost = d.levels[b.level].cost;
          html += `<button class="abtn wide ${up.ok ? '' : 'cant'}" data-act="upgrade">⬆ Upgrade to Lv ${b.level + 1}<small>${Bld.costStr(cost)}${up.ok ? '' : ' — ' + up.why}</small></button>`;
        }
        if ((b.key === 'wall' || b.key === 'gate') && !b.construction && b.level < 3)
          html += `<span class="psub">Walls upgrade together — use the Town Center.</span>`;
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
          const spec = Bld.tradeSpec(b), gold = Bld.tradeGold(b), ic = { food: '🍖', wood: '🪵', stone: '🪨' };
          if (b.caravan) {
            const frac = Math.max(0, Math.min(1, 1 - b.caravan.t / (b.caravan.total || 1)));
            html += `<div class="abtn cant" style="pointer-events:none">🐫 Caravan out — ${ic[b.caravan.res] || ''} for +${b.caravan.gold} ✨` +
              `<small><span id="carLeft">${Math.ceil(b.caravan.t)}d</span> to return</small>` +
              `<div style="height:4px;margin-top:5px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden">` +
              `<div id="carBar" style="height:100%;width:${Math.round(frac * 100)}%;background:var(--gold)"></div></div></div>`;
          } else {
            html += `<span class="psub">Send a load out → +${gold} ✨ back in ${spec.delay}d (Lv ${b.level} rate). Gold stays scarce — trade sparingly.</span>`;
            for (const res of CFG.TRADE.goods) {
              const can = Bld.canTrade(b, res).ok;
              html += `<button class="abtn ${can ? '' : 'cant'}" data-act="trade" data-res="${res}">🐫 Sell ${ic[res] || res}<small>${spec.input} ${ic[res] || res} → +${gold} ✨</small></button>`;
            }
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
      this.iconInto(ic, b.construction > 0
        ? (Bld.size(b.key) >= 2 ? Sprites.misc.constructionBig : Sprites.misc.construction)
        : Sprites.building[b.key][b.level - 1]);
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
        else if (btn.dataset.act === 'trade') {
          const res = btn.dataset.res, c = Bld.canTrade(b2, res);
          if (!c.ok) { this.toast(c.why, true); return; }
          if (Bld.startTrade(b2, res)) this.toast(`Caravan sets out with the ${res} — gold on its return`);
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
            const spot = MapGen.findNear(b2.x, b2.y + Bld.size(b2.key), 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: b2.x, y: b2.y + Bld.size(b2.key) };
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
              const spot = MapGen.findNear(b2.x, b2.y + Bld.size(b2.key) + 1, 3, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: b2.x, y: b2.y + Bld.size(b2.key) + 1 };
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
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${own ? '' : 'Rival '}${names[lv - 1]} <span style="color:var(--gold)">Lv ${lv}</span></div>
        <div class="psub">HP ${Math.ceil(br.hp)}/${br.maxhp} · a crossing over water</div></div>
        <button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions"><span class="psub">${own ? 'Reinforce for more stone and HP, or demolish to sever the crossing. Guard it — the enemy can hack it down.' : 'A rival crossing. Send soldiers here to sever it.'}</span>`;
      if (own && lv < 3) {
        const cost = CFG.BRIDGE.levels[lv].cost, ok = Bld.canUpgradeBridge(br);
        html += `<button class="abtn wide ${ok ? '' : 'cant'}" data-act="brup">⬆ Reinforce to Lv ${lv + 1}<small>${Bld.costStr(cost)}${ok ? '' : ' — need resources'}</small></button>`;
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
        if (Bld.upgradeBridge(b2)) { this.toast('Bridge reinforced — Lv ' + b2.level); this.renderPanel(); this.refreshMenu(); }
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
      const gAllDef = gMil.length > 0 && gMil.every(o => o.defend);
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${fleet ? '⚓ Fleet' : '⚔️ War Party'} <span style="color:var(--gold)">(${this.sel.ids.length})</span></div>
        <div class="psub">${this.groupComposition(this.sel.ids)}</div></div>
        <button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions"><span class="psub">${fleet ? 'Tap water to sail together, or an enemy ship / coastal target to attack.' : 'Tap a tile to march (melee front, archers behind), or an enemy / rival building to attack together.'}</span>` +
        (gMil.length ? `<button class="abtn ${gAllDef ? 'sel' : ''}" data-act="gdefend">${gAllDef ? '🛡 Stand Down' : '🛡 Defend'}</button>` : '') +
        `<button class="abtn" data-act="stop">✋ Halt</button></div>`;
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      this.iconInto(ic, R.unitSprite(first));
      panel.querySelector('[data-act="stop"]').addEventListener('click', () => {
        for (const id of this.sel.ids) {
          const u2 = Units.get(id);
          if (u2) { u2.task = null; u2.tUnit = 0; u2.tBld = 0; u2.path = null; u2.defend = false; }
        }
        this.toast('War party halted');
      });
      const gdef = panel.querySelector('[data-act="gdefend"]');
      if (gdef) gdef.addEventListener('click', () => {
        const mem = this.sel.ids.map(id => Units.get(id)).filter(o => o && Units.canDefend(o));
        const turnOn = !mem.every(o => o.defend);
        for (const o of mem) Units.setDefend(o, turnOn);
        this.toast(turnOn ? 'Holding the line — guarding home' : 'Standing down');
        this.renderPanel();
      });
    } else {
      const u = Units.get(this.sel.id);
      if (!u) { this.deselect(); return; }
      const nm = CFG.UNITS[u.kind].name;
      const own = u.owner === 'P';
      let hint = !own ? (
          Units.isPassive(u) ? `Wild game — send a villager or defender to hunt it (+${CFG.MEAT_DROP} food).`
          : u.owner === 'W' ? `Wild beast — dangerous, but worth +${CFG.MEAT_DROP} food.`
          // barbarian tempers stay hidden — you find out who they're after
          // the same way everyone else does
          : u.owner === 'R' ? 'Barbarian — nothing but trouble. Who they strike at, only they know.'
          : 'Rival tribe')
        : u.kind === 'sapper' ? 'Pick a tool below, then tap or drag a line of tiles — dig trenches (a moat where it touches water), clear resources, or (Camp Lv 3) raise mounds — slow-to-cross berms, or reclaim near-shore water into land (costs stone & wood). The sapper works the line in order. Bridge spans water. Tool down = tap to walk. Sappers can’t fight — keep them guarded.'
        : Units.isVillager(u) ? 'Tap forest 🌲 / hills 🪨 / an orchard to gather, jumping fish 🐟 to fish off the shore, a work site to build, or a tile to walk.'
        : u.kind === 'fishboat' ? 'Tap water where fish jump 🐟 to fish, or open water to row there.'
        : u.kind === 'catapult' ? 'Slow, but stone breaks stone — tap a rival wall, tower, or building to bombard it.'
        : u.kind === 'siegetower' ? 'Roll it flush against an enemy wall — nearby soldiers climb over, one per second. Only melee and marksmen can harm it.'
        : Units.isTransport(u) ? 'Select soldiers and tap this hull to board. Tap a shore tile to land them, or water to row.'
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
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${own ? '' : '☠ '}${nm}</div>
        <div class="psub">HP ${Math.ceil(u.hp)}/${u.maxhp} · ATK ${Math.round(Units.effAtk(u))} · DEF ${u.def}</div></div>
        <button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions"><span class="psub">${hint}</span>`;
      if (own && u.hp < u.maxhp && CFG.HEAL_FOOD[u.kind]) {
        const hc = this.healCost(u);
        const inZone = Bld.inHealZone(u);
        const ok = inZone && S.res.food >= hc;
        html += `<button class="abtn ${ok ? '' : 'cant'}" data-act="heal">❤️ Heal<small id="healCost">${inZone ? hc + ' 🍖' : 'near ' + (Units.isNaval(u) ? 'Dock' : 'Town Center')}</small></button>`;
      }
      if (own && Units.isTransport(u)) {
        const cap = CFG.UNITS[u.kind].cap, aboard = (u.cargo || []).length;
        html += `<button class="abtn ${aboard ? '' : 'cant'}" data-act="unload">⚓ Unload here<small>${aboard}/${cap} aboard</small></button>`;
      }
      if (own && u.kind === 'sapper') {
        const tier = Units.sapperTier(u.owner);
        const tool = (job, icon, label, minTier) => {
          const locked = tier < minTier;
          const active = this.terraMode === job && !locked;
          return `<button class="abtn ${locked ? 'cant' : ''}${active ? ' sel' : ''}" data-act="terra" data-job="${job}">${icon} ${label}${locked ? `<small>Camp Lv ${minTier}</small>` : ''}</button>`;
        };
        html += tool('dig', '🕳', 'Trench / Moat', 1);
        html += tool('bridge', '🌉', 'Bridge', 2);
        html += tool('clear', '⛏', 'Clear', 3);
        html += tool('mound', '⛰', 'Mound', 3);
      }
      if (own && Units.isVillager(u)) html += `<button class="abtn" data-act="gobuild">🔨 Build…</button>`;
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
      if (own && (Units.isFleetable(u) || (Units.isMilitary(u) && !Units.isNaval(u))))
        html += `<button class="abtn" data-act="group">${Units.isNaval(u) ? '⚓ Group fleet' : '👥 Group nearby'}</button>`;
      // Military units (land soldiers + warships) get DEFEND in place of Stop — a
      // held perimeter round the Town Center / Dock. Stop remains for villagers'
      // absence, transports, and working sappers.
      const sapperWorking = u.kind === 'sapper' && !!(u.task || (u.jobs && u.jobs.length));
      if (own && Units.canDefend(u))
        html += `<button class="abtn ${u.defend ? 'sel' : ''}" data-act="defend">${u.defend ? '🛡 Stand Down' : '🛡 Defend'}</button>`;
      else if (own && !Units.isVillager(u) && (u.kind !== 'sapper' || sapperWorking))
        html += `<button class="abtn" data-act="stop">✋ Stop</button>`;
      html += '</div>';
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      this.iconInto(ic, R.unitSprite(u));
      const stop = panel.querySelector('[data-act="stop"]');
      if (stop) stop.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (u2) { u2.task = null; u2.tUnit = 0; u2.tBld = 0; u2.path = null; u2.jobs = null; }   // drop any queued sapper line too
        this.terraMode = null;   // downing tools stops the terraform tool too
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
        if (Bld.upgrade(b2)) this.toast(`${Bld.def(b2.key).name} upgrading to Lv ${b2.level + 1} — the crew builds it, then back to work`);
        this.renderPanel();
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
      const heal = panel.querySelector('[data-act="heal"]');
      if (heal) heal.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (!u2 || u2.hp >= u2.maxhp) return;
        if (!Bld.inHealZone(u2)) { this.toast(Units.isNaval(u2) ? 'Ships heal at a Dock — move closer' : 'Can only heal within the Town Center grounds', true); return; }
        const cost = this.healCost(u2);
        if (S.res.food < cost) { this.toast('Not enough food', true); return; }
        S.res.food -= cost;
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
            Math.hypot(o.x - u2.x, o.y - u2.y) <= 6)
          .map(o => o.id);
        if (ids.length < 2) { this.toast(naval ? 'No other ships within reach' : 'No other soldiers within reach', true); return; }
        this.sel = { type: 'group', ids };
        this.renderPanel();
        this.toast(`${naval ? 'Fleet' : 'War party'} formed: ${this.groupComposition(ids)}`);
      });
    }
    panel.querySelector('#panelClose').addEventListener('click', () => this.deselect());
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
