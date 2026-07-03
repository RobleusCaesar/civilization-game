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
  builderFor: null,      // villager id that will build the next placed building
  MENU_KEYS: ['house', 'farm', 'lumber', 'quarry', 'lodge', 'tower', 'barracks'],

  init() {
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
      const co = document.createElement('div'); co.className = 'bcost'; co.textContent = Bld.costStr(d.levels[0].cost);
      btn.appendChild(nm); btn.appendChild(co);
      btn.addEventListener('click', () => {
        if (this.placing === key) { this.placing = null; this.builderFor = null; }
        else {
          const can = Bld.canAfford(d.levels[0].cost);
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
    document.querySelectorAll('.bbtn').forEach(b => {
      const d = CFG.BUILDINGS[b.dataset.key];
      b.classList.toggle('sel', this.placing === b.dataset.key);
      b.classList.toggle('cant', !Bld.canAfford(d.levels[0].cost));
    });
  },

  /* ---------------- canvas input ---------------- */
  bindCanvas() {
    const cv = R.cv;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1)
        this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        this.downAt = null;
      }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (this.placing) this.placeTile = R.screenToTile(e.clientX, e.clientY);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8)
          this.downAt.moved = true;
        if (this.downAt && this.downAt.moved) {
          R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
          R.clampCam();
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
      if (this.downAt && !this.downAt.moved && performance.now() - this.downAt.t < 400)
        this.handleTap(e.clientX, e.clientY);
      if (this.pointers.size < 2) this.pinchD = 0;
      if (this.pointers.size === 0) this.downAt = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.downAt = null; });
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

    // placement mode
    if (this.placing) {
      const can = Bld.canPlace('P', this.placing, tile.x, tile.y);
      if (can.ok) {
        Bld.place('P', this.placing, tile.x, tile.y, { builderId: this.builderFor });
        this.placing = null; this.placeTile = null; this.builderFor = null;
      } else this.toast(can.why, true);
      this.refreshMenu();
      return;
    }

    const explored = S.map.explored[MapGen.idx(tile.x, tile.y)];
    // hit-test a unit near the tap point
    let hitUnit = null, hd = 0.7;
    for (const u of S.units) {
      if (!S.map.explored[MapGen.idx(u.x | 0, u.y | 0)]) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      const dd = d - (u.owner === 'P' ? 0.15 : 0); // bias towards own units
      if (dd < hd) { hd = dd; hitUnit = u; }
    }
    const hitBld = explored ? Bld.at(tile.x, tile.y) : null;

    // orders for a selected player unit
    const sel = this.sel && this.sel.type === 'unit' ? Units.get(this.sel.id) : null;
    if (sel && sel.owner === 'P') {
      if (hitUnit && hitUnit.owner !== 'P' && Combat.hostile('P', hitUnit.owner)) {
        sel.task = null; sel.tUnit = hitUnit.id; sel.tBld = 0;
        this.toast('Attack!');
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
      if (!hitUnit && (!hitBld || hitBld.owner !== 'P')) {
        if (!explored) { this.toast('Unexplored', true); return; }
        if (Units.isVillager(sel) && CFG.GATHER[S.map.terrain[MapGen.idx(tile.x, tile.y)]]) {
          if (Units.assignGather(sel, tile.x, tile.y)) this.toast('Gathering ' + sel.task.res);
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
    this.renderPanel();
  },
  deselect() {
    this.sel = null;
    document.getElementById('panel').classList.remove('show');
    document.getElementById('buildmenu').style.display = 'flex';
  },

  /* ---------------- selection panel ---------------- */
  _panelSig: '',
  panelSig() {
    if (!this.sel) return '';
    if (this.sel.type === 'bld') {
      const b = Bld.get(this.sel.id);
      if (!b) return 'gone';
      const d = Bld.def(b.key);
      let sig = ['b', b.id, b.level, b.construction > 0, b.upgrading > 0, b.queue.length,
        b.level < 3 && Bld.canUpgrade(b).ok, b.hp < b.maxhp, Bld.hasWorker(b)].join('|');
      if (d.train) for (const uk in d.train) sig += '|' + Bld.canTrain(b, uk).ok;
      return sig;
    }
    const u = Units.get(this.sel.id);
    if (!u) return 'gone';
    return ['u', u.id, u.hp < u.maxhp,
      !!CFG.HEAL_FOOD[u.kind] && S.res.food >= this.healCost(u)].join('|');
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
      else if (lv.out) sub += ' — ' + Object.entries(lv.out).map(([k, v]) => `+${Math.round(v * Bld.nearBonus(b) * 10) / 10} ${k}/day`).join(', ');
      if (lv.pop) sub += ` — +${lv.pop} pop`;
      if (lv.bonus) sub += ` — ${lv.bonus}`;
      return sub;
    }
    const u = Units.get(this.sel.id);
    return u ? `HP ${Math.ceil(u.hp)}/${u.maxhp} · ATK ${Units.effAtk(u)} · DEF ${u.def}` : '';
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
        if (!b.construction && !b.upgrading && b.hp < b.maxhp && !worker)
          html += `<button class="abtn" data-act="sendworker">🔨 Repair<small>a villager does the work</small></button>`;
        if (b.level < 3 && !b.construction) {
          const up = Bld.canUpgrade(b);
          const cost = d.levels[b.level].cost;
          html += `<button class="abtn ${up.ok ? '' : 'cant'}" data-act="upgrade">⬆ Upgrade to Lv ${b.level + 1}<small>${Bld.costStr(cost)}${up.ok ? '' : ' — ' + up.why}</small></button>`;
        }
        if (d.train && !b.construction) {
          for (const [uk, spec] of Object.entries(d.train)) {
            const ct = Bld.canTrain(b, uk);
            html += `<button class="abtn ${ct.ok ? '' : 'cant'}" data-act="train" data-unit="${uk}">Train ${CFG.UNITS[uk].name}<small>${Bld.costStr(spec.cost)}${ct.ok ? '' : ' — ' + ct.why}</small></button>`;
          }
          if (b.queue.length) html += `<span class="psub" style="align-self:center">Queue: ${b.queue.length}</span>`;
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
        else if (btn.dataset.act === 'train') { if (!Bld.train(b2, btn.dataset.unit)) this.toast(Bld.canTrain(b2, btn.dataset.unit).why, true); }
        else if (btn.dataset.act === 'sendworker') {
          const v = Units.nearestIdleVillager(b2.x, b2.y);
          if (!v) this.toast('No idle villager — free one up first', true);
          else if (Units.assignBuild(v, b2)) this.toast('Villager on the way');
        }
        this.renderPanel();
        this.refreshMenu();
      }));
    } else {
      const u = Units.get(this.sel.id);
      if (!u) { this.deselect(); return; }
      const nm = CFG.UNITS[u.kind].name;
      const own = u.owner === 'P';
      const hint = !own ? (
          Units.isPassive(u) ? `Wild game — send a villager or defender to hunt it (+${CFG.MEAT_DROP} food).`
          : u.owner === 'W' ? `Wild beast — dangerous, but worth +${CFG.MEAT_DROP} food.`
          : u.owner === 'R' ? 'Raider!' : 'Rival tribe')
        : Units.isVillager(u) ? 'Tap forest 🌲 / hills 🪨 / fertile soil to gather, a work site to build, or a tile to walk.'
        : 'Tap a tile to move, or an enemy to attack.';
      html += `<div class="phead"><canvas id="pIcon"></canvas><div>
        <div class="ptitle">${own ? '' : '☠ '}${nm}</div>
        <div class="psub">HP ${Math.ceil(u.hp)}/${u.maxhp} · ATK ${Units.effAtk(u)} · DEF ${u.def}</div></div>
        <button class="abtn" id="panelClose">✕</button></div>
        <div class="pactions"><span class="psub">${hint}</span>`;
      if (own && u.hp < u.maxhp && CFG.HEAL_FOOD[u.kind]) {
        const hc = this.healCost(u);
        html += `<button class="abtn ${S.res.food >= hc ? '' : 'cant'}" data-act="heal">❤️ Heal<small id="healCost">${hc} 🍖</small></button>`;
      }
      if (own && Units.isVillager(u)) html += `<button class="abtn" data-act="gobuild">🔨 Build…</button>`;
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
        this.deselect();          // brings the build menu back
        this.builderFor = vid;    // after deselect/select bookkeeping
        this.toast('Pick a building, then tap a site — this villager will build it');
      });
    }
    panel.querySelector('#panelClose').addEventListener('click', () => this.deselect());
    panel.classList.add('show');
    document.getElementById('buildmenu').style.display = 'none';
  },

  /* ---------------- top bar / periodic refresh ---------------- */
  refresh(dt) {
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.25;
    document.getElementById('rFood').textContent = S.res.food | 0;
    document.getElementById('rWood').textContent = S.res.wood | 0;
    document.getElementById('rStone').textContent = S.res.stone | 0;
    document.getElementById('rGold').textContent = S.res.gold | 0;
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
    document.getElementById('btnMenu').addEventListener('click', () => {
      S.paused = true;
      document.getElementById('btnPause').textContent = '▶';
      document.getElementById('seedShow').textContent =
        `Current game: ${G.modeCfg().icon} ${G.modeCfg().name} — seed ${S.seed}`;
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
      G.newGame(seed, this.newMode);
    });
    document.getElementById('btnEndNew').addEventListener('click', () => {
      document.getElementById('endModal').classList.remove('show');
      G.newGame(String((Math.random() * 1e9) | 0), S.mode);
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
