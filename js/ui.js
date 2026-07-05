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
  newMode: 'moderate',   // difficulty picked for the next game
  newSize: 'medium',     // map size picked for the next game
  menuCollapsed: false,  // build menu tucked away for a bigger view
  miniCollapsed: false,  // minimap hidden
  builderFor: null,      // villager id that will build the next placed building
  confirmDemolish: 0,    // building id awaiting demolish confirmation
  wallDrag: null,        // tile chain while dragging a wall line
  wallGhost: null,       // [{x,y,ok,mask}] preview of the dragged line
  settingRally: null,    // building id waiting for a rally-point tap
  MENU_KEYS: ['house', 'farm', 'lumber', 'quarry', 'lodge', 'tower', 'barracks', 'stable', 'range', 'dock', 'wall', 'gate'],

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
      ic.width = 32; ic.height = 32;
      ic.getContext('2d').drawImage(Sprites.building[key][0], 0, 0);
      btn.appendChild(ic);
      const nm = document.createElement('div'); nm.className = 'bname'; nm.textContent = d.name;
      const co = document.createElement('div'); co.className = 'bcost'; co.textContent = Bld.costStr(Bld.buildSpec(key).lv.cost);
      btn.appendChild(nm); btn.appendChild(co);
      btn.addEventListener('click', () => {
        if (this.placing === key) { this.placing = null; this.builderFor = null; }
        else {
          const tc = Bld.tcOf('P');
          if (d.reqTC && (!tc || tc.level < d.reqTC)) { this.toast(`Needs Town Center Lv ${d.reqTC}`, true); return; }
          const can = Bld.canAfford(Bld.buildSpec(key).lv.cost);
          if (!can) { this.toast('Not enough resources', true); return; }
          this.placing = key;
          this.deselect();
          this.toast(`Tap a clear tile to place the ${d.name}`);
        }
        this.refreshMenu();
      });
      el.appendChild(btn);
    }
  },

  refreshMenu() {
    const tc = Bld.tcOf('P');
    document.querySelectorAll('.bbtn').forEach(b => {
      const spec = Bld.buildSpec(b.dataset.key);
      const gated = CFG.BUILDINGS[b.dataset.key].reqTC && (!tc || tc.level < CFG.BUILDINGS[b.dataset.key].reqTC);
      b.classList.toggle('sel', this.placing === b.dataset.key);
      b.classList.toggle('cant', gated || !Bld.canAfford(spec.lv.cost));
      const co = b.querySelector('.bcost');
      if (co) {
        const txt = Bld.costStr(spec.lv.cost);
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
        } else {
          this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        this.downAt = null;
        this.wallDrag = null; this.wallGhost = null;   // pinch cancels the line
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
    const okTiles = [];
    this.wallGhost = chain.map(t => {
      let ok = Bld.tileFree(t.x, t.y) && !!S.map.explored[MapGen.idx(t.x, t.y)];
      if (ok) {
        // reach: near an existing building, or chained off an already-valid tile
        ok = S.buildings.some(b => b.owner === 'P' && Math.hypot(b.x - t.x, b.y - t.y) <= CFG.BUILD_RANGE) ||
             okTiles.some(o => Math.hypot(o.x - t.x, o.y - t.y) <= CFG.BUILD_RANGE);
      }
      if (ok) {
        for (const k in cost) if ((budget[k] || 0) < cost[k]) { ok = false; break; }
        if (ok) for (const k in cost) budget[k] -= cost[k];
      }
      if (ok) okTiles.push(t);
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
      this.settingRally = null;
      if (rb && Math.hypot(rb.x - tile.x, rb.y - tile.y) <= CFG.RALLY_RANGE) {
        rb.rally = { x: tile.x, y: tile.y };
        const gatherable = !!CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]];
        this.toast(gatherable && rb.key === 'tc'
          ? 'Rally set — new villagers will gather here'
          : 'Rally point set — new units will head here');
      } else this.toast(`Too far — rally must be within ${CFG.RALLY_RANGE} tiles`, true);
      if (this.sel) this.renderPanel();
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
      const dd = d - (u.owner === 'P' ? 0.15 : 0); // bias towards own units
      if (dd < hd) { hd = dd; hitUnit = u; }
    }
    const hitBld = G.visibleAt(tile.x, tile.y) ? Bld.at(tile.x, tile.y) : null;

    // orders for a selected war party
    if (this.sel && this.sel.type === 'group') {
      const ids = this.sel.ids.filter(id => Units.get(id));
      if (!ids.length) { this.deselect(); return; }
      this.sel.ids = ids;
      if (hitUnit && hitUnit.owner !== 'P') {
        for (const id of ids) { const u = Units.get(id); u.task = null; u.tUnit = hitUnit.id; u.tBld = 0; }
        this.toast('⚔️ War party attacks!');
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
        for (const id of ids) Units.orderAttackBuilding(Units.get(id), hitBld);
        this.toast('⚔️ War party attacks ' + Bld.def(hitBld.key).name);
        return;
      }
      if (!hitUnit && !hitBld) {
        if (!explored) { this.toast('Unexplored', true); return; }
        Units.groupMove(ids, tile.x, tile.y);
        this.toast('War party moving — melee front, archers behind');
        return;
      }
      // tapped one of our own units/buildings: fall through and reselect it
    }

    // orders for a selected player unit
    const sel = this.sel && this.sel.type === 'unit' ? Units.get(this.sel.id) : null;
    if (sel && sel.owner === 'P') {
      if (hitUnit && hitUnit.owner !== 'P') {
        sel.task = null; sel.tUnit = hitUnit.id; sel.tBld = 0;
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
        Units.orderAttackBuilding(sel, hitBld);
        this.toast('Attacking ' + Bld.def(hitBld.key).name);
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
          if (Units.assignGather(sel, tile.x, tile.y)) this.toast('Gathering ' + sel.task.res);
          return;
        }
        if (sel.kind === 'fishboat' && Units.canFish(tile.x, tile.y)) {
          if (Units.assignFish(sel, tile.x, tile.y)) this.toast('Nets out — fishing 🐟');
          return;
        }
        if (Units.isTransport(sel) && sel.cargo && sel.cargo.length && Path.passable(tile.x, tile.y)) {
          Units.orderUnload(sel, tile.x, tile.y);
          this.toast('Making for that shore — soldiers will land there');
          return;
        }
        Units.moveTo(sel, tile.x, tile.y);
        return;
      }
    }

    // (re)selection
    if (hitUnit) { this.select('unit', hitUnit.id); return; }
    if (hitBld) { this.select('bld', hitBld.id); return; }

    // convenience: tap a resource tile with nothing selected → send an idle villager
    if (explored && CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]] && !this.sel) {
      const idle = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task && !u.tUnit);
      if (idle && Units.assignGather(idle, tile.x, tile.y)) {
        this.toast('Idle villager sent to gather');
        return;
      }
    }
    this.deselect();
  },

  select(type, id) {
    this.sel = { type, id };
    this.builderFor = null;
    this.confirmDemolish = 0;
    this.renderPanel();
  },
  deselect() {
    this.sel = null;
    this.confirmDemolish = 0;
    this.settingRally = null;
    document.getElementById('panel').classList.remove('show');
    document.getElementById('buildmenu').style.display = this.menuCollapsed ? 'none' : 'flex';
  },

  setMenuCollapsed(v) {
    this.menuCollapsed = v;
    const t = document.getElementById('bmToggle');
    t.textContent = v ? '🔨 Build ▴' : '▾';
    if (!document.getElementById('panel').classList.contains('show'))
      document.getElementById('buildmenu').style.display = v ? 'none' : 'flex';
    if (v && this.placing) { this.placing = null; this.builderFor = null; this.refreshMenu(); }
  },
  setMiniCollapsed(v) {
    this.miniCollapsed = v;
    document.getElementById('miniWrap').style.display = v ? 'none' : '';
    const t = document.getElementById('miniToggle');
    t.textContent = v ? '🗺' : '▾';
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
      if (b.key === 'tc')
        sig += '|' + (S.wallLevel || 1) + '|' + Bld.forts().length;
      return sig;
    }
    if (this.sel.type === 'group') {
      const alive = this.sel.ids.filter(id => Units.get(id)).length;
      return alive ? 'g|' + alive : 'gone';
    }
    const u = Units.get(this.sel.id);
    if (!u) return 'gone';
    let stack = 0;
    if (u.owner !== 'P' && !Units.isPassive(u))
      stack = S.units.filter(o => o.owner !== 'P' && !Units.isPassive(o) &&
        (o.x | 0) === (u.x | 0) && (o.y | 0) === (u.y | 0)).length;
    return ['u', u.id, u.hp < u.maxhp, stack, u.cargo ? u.cargo.length : 0,
      !!CFG.HEAL_FOOD[u.kind] && S.res.food >= this.healCost(u)].join('|');
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
      if (u) hc.textContent = this.healCost(u) + ' 🍖';
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
      if (shN) {
        const vills = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length;
        shN.textContent = vills + ' outside';
        shN.closest('.abtn').classList.toggle('cant', !vills);
      }
      const rlN = document.getElementById('releaseN');
      if (rlN) {
        rlN.textContent = S.garrison.length + ' sheltered';
        rlN.closest('.abtn').classList.toggle('cant', !S.garrison.length);
      }
      const upw = panel.querySelector('[data-act="upwalls"]');
      if (upw) upw.classList.toggle('cant', !Bld.canUpgradeWalls().ok);
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
            html += `<button class="abtn ${ct.ok ? '' : 'cant'}" data-act="train" data-unit="${uk}">Train ${CFG.UNITS[uk].name}<small>${Bld.costStr(spec.cost)}</small></button>`;
          }
          html += `<span class="psub" id="qLine">Queue: ${b.queue.length}/${Bld.queueCap(b)}</span>`;
          html += b.rally
            ? `<button class="abtn" data-act="rally">🚩 Rally set<small>tap to clear</small></button>`
            : `<button class="abtn" data-act="rally">🚩 Set rally<small>tap ground within ${CFG.RALLY_RANGE} tiles</small></button>`;
        }
        if (b.key === 'tc' && !b.construction) {
          const vills = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length;
          html += `<button class="abtn ${vills ? '' : 'cant'}" data-act="shelter">🛖 Shelter villagers<small id="shelterN">${vills} outside</small></button>`;
          html += `<button class="abtn ${S.garrison.length ? '' : 'cant'}" data-act="release">🚪 Release all<small id="releaseN">${S.garrison.length} sheltered</small></button>`;
          html += `<button class="abtn" data-act="callidle">📣 Call idle<small>muster at the Town Center</small></button>`;
          if ((S.wallLevel || 1) < 3 && Bld.forts().length) {
            const upw = Bld.canUpgradeWalls();
            html += `<button class="abtn wide ${upw.ok ? '' : 'cant'}" data-act="upwalls">🧱 Upgrade all walls to Lv ${(S.wallLevel || 1) + 1}<small>${Bld.costStr(Bld.wallUpgradeCost())} — every wall & gate</small></button>`;
          }
        }
        if (b.key === 'wall' && !b.construction && !b.upgrading) {
          const net = this.gateConvertCost(b);
          html += `<button class="abtn wide ${Bld.canAfford(net) ? '' : 'cant'}" data-act="togate">🚪 Build Gate<small>${Bld.costStr(net)} — replaces this section</small></button>`;
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
      ic.width = 32; ic.height = 32;
      ic.getContext('2d').drawImage(b.construction > 0 ? Sprites.misc.construction : Sprites.building[b.key][b.level - 1], 0, 0);
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
          if (b2.rally) { b2.rally = null; this.toast('Rally point cleared'); this.renderPanel(); }
          else {
            this.settingRally = b2.id;
            this.toast('Tap a spot near the building — new units will head there (a resource tile sends villagers gathering)');
          }
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
            const spot = MapGen.findNear(b2.x, b2.y + 1, 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: b2.x, y: b2.y + 1 };
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
              const spot = MapGen.findNear(b2.x, b2.y + 2, 3, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: b2.x, y: b2.y + 2 };
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
    } else if (this.sel.type === 'group') {
      this.sel.ids = this.sel.ids.filter(id => Units.get(id));
      if (this.sel.ids.length === 0) { this.deselect(); return; }
      if (this.sel.ids.length === 1) { this.sel = { type: 'unit', id: this.sel.ids[0] }; this.renderPanel(); return; }
      const first = Units.get(this.sel.ids[0]);
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">⚔️ War Party <span style="color:var(--gold)">(${this.sel.ids.length})</span></div>
        <div class="psub">${this.groupComposition(this.sel.ids)}</div></div>
        <button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions"><span class="psub">Tap a tile to march (melee front, archers behind), or an enemy / rival building to attack together.</span>
        <button class="abtn" data-act="stop">✋ Halt</button></div>`;
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      ic.width = 32; ic.height = 32;
      ic.getContext('2d').drawImage(R.unitSprite(first), 0, 0);
      panel.querySelector('[data-act="stop"]').addEventListener('click', () => {
        for (const id of this.sel.ids) {
          const u2 = Units.get(id);
          if (u2) { u2.task = null; u2.tUnit = 0; u2.tBld = 0; u2.path = null; }
        }
        this.toast('War party halted');
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
        : Units.isVillager(u) ? 'Tap forest 🌲 / hills 🪨 / an orchard to gather, a work site to build, or a tile to walk.'
        : u.kind === 'fishboat' ? 'Tap water where fish jump 🐟 to fish, or open water to row there.'
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
        html += `<button class="abtn ${S.res.food >= hc ? '' : 'cant'}" data-act="heal">❤️ Heal<small id="healCost">${hc} 🍖</small></button>`;
      }
      if (own && Units.isTransport(u)) {
        const cap = CFG.UNITS[u.kind].cap, aboard = (u.cargo || []).length;
        html += `<button class="abtn ${aboard ? '' : 'cant'}" data-act="unload">⚓ Unload here<small>${aboard}/${cap} aboard</small></button>`;
      }
      if (own && Units.isVillager(u)) html += `<button class="abtn" data-act="gobuild">🔨 Build…</button>`;
      if (own && Units.isMilitary(u) && !Units.isNaval(u)) html += `<button class="abtn" data-act="group">👥 Group nearby</button>`;
      if (own) html += `<button class="abtn" data-act="stop">✋ Stop</button>`;
      html += '</div>';
      panel.innerHTML = html;
      const ic = panel.querySelector('#pIcon');
      ic.width = 32; ic.height = 32;
      ic.getContext('2d').drawImage(R.unitSprite(u), 0, 0);
      const stop = panel.querySelector('[data-act="stop"]');
      if (stop) stop.addEventListener('click', () => {
        const u2 = Units.get(this.sel.id);
        if (u2) { u2.task = null; u2.tUnit = 0; u2.tBld = 0; u2.path = null; }
      });
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
        const ids = S.units
          .filter(o => o.owner === 'P' && Units.isMilitary(o) && !Units.isNaval(o) && Math.hypot(o.x - u2.x, o.y - u2.y) <= 6)
          .map(o => o.id);
        if (ids.length < 2) { this.toast('No other soldiers within reach', true); return; }
        this.sel = { type: 'group', ids };
        this.renderPanel();
        this.toast(`War party formed: ${this.groupComposition(ids)}`);
      });
    }
    panel.querySelector('#panelClose').addEventListener('click', () => this.deselect());
    panel.classList.add('show');
    document.getElementById('buildmenu').style.display = 'none';
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
    document.getElementById('rWood').textContent = this.fmtRes(S.res.wood);
    document.getElementById('rStone').textContent = this.fmtRes(S.res.stone);
    document.getElementById('rGold').textContent = this.fmtRes(S.res.gold);
    document.getElementById('rPop').textContent = Units.popUsed('P') + '/' + Bld.popCap('P');
    document.getElementById('rDay').textContent = 'Day ' + S.day;
    this.refreshMenu();
    if (this.sel) this.refreshPanel();
  },

  toast(msg, warn) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { el.style.opacity = '0'; }, 3200);
    setTimeout(() => { el.remove(); }, 3900);
  },

  /* ---------------- menus / save / load ---------------- */
  bindButtons() {
    const menu = document.getElementById('menuModal');
    document.querySelectorAll('#modeRow .mode').forEach(btn => btn.addEventListener('click', () => {
      this.newMode = btn.dataset.mode;
      document.querySelectorAll('#modeRow .mode').forEach(b => b.classList.toggle('sel', b === btn));
      document.getElementById('modeDesc').textContent = CFG.MODES[this.newMode].desc;
    }));
    document.getElementById('bmToggle').addEventListener('click', () =>
      this.setMenuCollapsed(!this.menuCollapsed));
    document.getElementById('miniToggle').addEventListener('click', () =>
      this.setMiniCollapsed(!this.miniCollapsed));
    document.querySelectorAll('#sizeRow .mode').forEach(btn => btn.addEventListener('click', () => {
      this.newSize = btn.dataset.size;
      document.querySelectorAll('#sizeRow .mode').forEach(b => b.classList.toggle('sel', b === btn));
    }));
    document.getElementById('btnMenu').addEventListener('click', () => {
      S.paused = true;
      document.getElementById('btnPause').textContent = '▶';
      const SIZE_LABEL = { small: '🏕 Small', medium: '🏞 Medium', large: '🗺 Large' };
      document.getElementById('seedShow').textContent =
        `Current game: ${G.modeCfg().icon} ${G.modeCfg().name} · ${SIZE_LABEL[S.sizeKey] || '🏞 Medium'} map · day ${S.day} · seed ${S.seed}`;
      // pickers preset to the running game's setup — they only apply to a new game
      this.newMode = CFG.MODES[S.mode] ? S.mode : 'moderate';
      this.newSize = CFG.SIZES[S.sizeKey] ? S.sizeKey : 'medium';
      document.querySelectorAll('#modeRow .mode').forEach(b => b.classList.toggle('sel', b.dataset.mode === this.newMode));
      document.getElementById('modeDesc').textContent = CFG.MODES[this.newMode].desc;
      document.querySelectorAll('#sizeRow .mode').forEach(b => b.classList.toggle('sel', b.dataset.size === this.newSize));
      const log = document.getElementById('logList');
      log.innerHTML = S.log.slice(0, 30).map(l => `<div>Day ${l.day}: ${l.msg}</div>`).join('');
      menu.classList.add('show');
    });
    document.getElementById('btnResume').addEventListener('click', () => {
      menu.classList.remove('show');
      S.paused = false;
      document.getElementById('btnPause').textContent = '⏸';
    });
    document.getElementById('btnPause').addEventListener('click', e => {
      S.paused = !S.paused;
      e.target.textContent = S.paused ? '▶' : '⏸';
    });
    document.getElementById('btnNew').addEventListener('click', () => {
      const seed = document.getElementById('seedInput').value.trim() || String((Math.random() * 1e9) | 0);
      menu.classList.remove('show');
      G.newGame(seed, this.newMode, this.newSize);
    });
    document.getElementById('btnEndNew').addEventListener('click', () => {
      document.getElementById('endModal').classList.remove('show');
      G.newGame(String((Math.random() * 1e9) | 0), S.mode, S.sizeKey);
    });
    document.getElementById('btnSave').addEventListener('click', () => {
      const blob = new Blob([G.saveJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'neolithic-day' + S.day + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.toast('Game saved');
    });
    document.getElementById('btnLoad').addEventListener('click', () => document.getElementById('fileLoad').click());
    document.getElementById('fileLoad').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          G.loadJSON(rd.result);
          menu.classList.remove('show');
          this.toast('Game loaded');
        } catch (err) { this.toast('Could not load save: ' + err.message, true); }
      };
      rd.readAsText(f);
      e.target.value = '';
    });
  },

  showEnd(win, msg) {
    document.getElementById('endTitle').textContent = win ? '🏆 Victory!' : '💀 Defeat';
    document.getElementById('endTitle').style.color = win ? 'var(--gold)' : 'var(--danger)';
    document.getElementById('endMsg').textContent = msg + ` (${G.modeCfg().name}, day ${S.day}, seed ${S.seed})`;
    document.getElementById('endModal').classList.add('show');
  },
};
