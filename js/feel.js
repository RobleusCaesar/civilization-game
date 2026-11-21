/* =============================================================================
   FEEL — the small things that should simply work (build 211, tests/feel.mjs)

   A polish pass: every piece of it is a PICTURE or an INPUT CONVENIENCE. No
   rule reads anything here, nothing lands in S or a save, and no RNG is ever
   drawn (Math.random included) — the sim cannot tell this file exists.

     1  A PAUSE YOU CAN SEE. The player's own pause (the ⏸ button, or Space)
        dims the edges of the world and says PAUSED in the middle of it. A
        pause somebody else holds — the deck's sheet, a card in the air, the
        Wonder's held frame — wears none of it: only the player's own.
     2  THE KEYBOARD ON A DESKTOP. Arrows or WASD glide the view (one screen
        pace at every zoom, easing in), + and − zoom, Space pauses, Escape
        steps back (a placement, an armed rally or tool, the selection, then
        the menu; on the menu it resumes), 1–9 call a saved army's banner, H
        brings the view home to the hall, B the build menu, M the map. A key
        is never a key while a field has the focus, a modifier is held, or a
        card, a modal or the journey's own question has the screen.
     3  THE MINIMAP DRAGS. A press on the map that slides sweeps the view
        with it, and the view's frame follows the camera every frame
        (R.drawMiniView) where it used to wait for the half-second repaint.
     4  ALERTS SHOW WHERE. "X under attack!" pings the minimap at the spot
        (the map button glows when the map is folded) and its toast carries a
        small ➜ that carries the view there. Only the ➜ takes a tap: the rest
        of the toast lets the map have it, as every toast does.
     5  A CURSOR THAT SAYS WHAT A CLICK WILL DO (a mouse only). A sword over a
        foe with fighters in hand, an axe / a pick / a sickle over work a
        villager in hand can take, a hammer over a site or a hurt building of
        the player's, a hand over anything that can be taken in hand.
     6  HOVER TO READ (a mouse only). Rest the pointer for a beat: wood left
        in a stand, a beast's or a soldier's health, a building's level and
        its crew, a spent tile's next use. Fog-honest: nothing it says is
        anything the player cannot see.
     7  THE BUILD CARDS EXPLAIN THEMSELVES (a mouse only): what the building
        does, and what it still waits on — a hall level, or the goods short.
     8  THE BAR POINTS AT WHAT IS MISSING. A refusal for want of goods flashes
        the chips of the goods short (Feel.short), a full town the people
        chip (Feel.popFull) — the answer and its reason in one glance.

   The boat wakes are the renderer's (R.drawWakes), the villagers' names
   Units.personName's, the Resume that keeps the view Screens.enterGame's.
   Every hook elsewhere guards on the method it calls (`typeof Feel` — the
   window trap: a script-level const is never on window, so window.Feel is
   set at the foot for anything that asks it that way). */
const Feel = {
  ON: true,                 // the kill switch: false builds nothing and hears nothing

  // ---- tunables ----
  PAN_PX: 820,              // screen px a second the keys glide the view
  PAN_EASE: 0.18,           // seconds to come up to pace
  ZOOM_STEP: 1.2,           // + / − one step
  CUR_MS: 45,               // the cursor's hit-test, at most this often
  TIP_REST_MS: 450,         // a resting pointer reads after this long
  TIP_SLOP: 6,              // …and the reading goes when it moves this far
  PING_MS: 2600,

  // ---- state: UI-local, never in S or a save ----
  _held: null, _panK: 0, _glide: null,
  _userPause: false, _userPauseS: null, _veilOn: false,
  _cursor: '', _cur: null, _curT: 0, _curDirty: false,
  _mx: 0, _my: 0, _mAt: 0, _over: false, _tip: null, _tipKind: '', _tipAt: null, _tipKey: '',
  _miniPtr: null,

  /* ---------------- shared ---------------- */
  inGame() {
    return typeof S !== 'undefined' && !!S && !!S.map && typeof Screens !== 'undefined' &&
      Screens.current === 'playing' && !Screens._demo && !S.over &&
      document.body.classList.contains('ingame');
  },
  _deckHas() {
    return typeof DeckUI !== 'undefined' && !!(DeckUI.open || DeckUI.aim || DeckUI.lifted || DeckUI.playing ||
      (DeckUI.hasFloor && DeckUI.hasFloor()));
  },
  // a modal, the journey's own question or a card has the screen
  blocked() {
    return (typeof Screens !== 'undefined' && Screens.modalUp && Screens.modalUp()) || this._deckHas();
  },
  _editable(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')); },
  _reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } },

  init() {
    if (!this.ON || this._inited || typeof document === 'undefined') return;
    this._inited = true;
    this._held = new Set();
    this._css();
    // the pause veil and the reading tip, gated on a game like every HUD piece
    const veil = document.createElement('div');
    veil.id = 'pauseVeil'; veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML = '<div class="pvPlate">' + this.PAUSE_SVG + '<b>Paused</b><small class="pvHint">Tap ▶ to resume</small></div>';
    const tip = document.createElement('div');
    tip.id = 'feelTip'; tip.setAttribute('aria-hidden', 'true');
    const shell = document.getElementById('shell');
    document.body.insertBefore(veil, shell || null);
    document.body.insertBefore(tip, shell || null);
    this._veil = veil; this._tip = tip;
    this._buildCursors();
    // the keys
    document.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('keyup', e => { if (this._held) this._held.delete(e.code); });
    window.addEventListener('blur', () => { this._held.clear(); this.hideTip(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._held.clear(); });
    // the mouse over the map: the cursor and the reading
    const cv = typeof R !== 'undefined' && R.cv;
    if (cv) {
      cv.addEventListener('pointermove', e => this.onMove(e));
      cv.addEventListener('pointerleave', () => { this._over = false; this.hideTip(); this.setCursor(''); });
      // a press takes the view back from a glide, and puts the reading away
      cv.addEventListener('pointerdown', () => { this._glide = null; this.hideTip(); }, true);
      // a click may have changed what is in hand: the cursor reads again
      cv.addEventListener('pointerup', () => { this._curDirty = true; this._curT = 0; });
      cv.addEventListener('wheel', () => this.hideTip(), { passive: true });
    }
    // the minimap: a press that slides sweeps the view along with it
    const mini = document.getElementById('mini');
    if (mini) {
      mini.addEventListener('pointerdown', e => {
        this._miniPtr = e.pointerId; this._glide = null;
        try { mini.setPointerCapture(e.pointerId); } catch (x) {}
        this.miniView();
      });
      mini.addEventListener('pointermove', e => {
        if (this._miniPtr !== e.pointerId) return;
        this.miniTo(mini, e.clientX, e.clientY);
        e.preventDefault();
      });
      const end = e => { if (this._miniPtr === e.pointerId) this._miniPtr = null; };
      mini.addEventListener('pointerup', end);
      mini.addEventListener('pointercancel', end);
    }
    // the build cards: hover reads what the building does
    const menu = document.getElementById('buildmenu');
    if (menu) {
      menu.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const b = e.target && e.target.closest && e.target.closest('.bbtn');
        if (b && b.dataset.key) this.cardTip(b);
      });
      menu.addEventListener('pointerout', e => {
        const b = e.target && e.target.closest && e.target.closest('.bbtn');
        const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.bbtn');
        if (b && to !== b && this._tipKind === 'card') this.hideTip();
      });
      menu.addEventListener('click', () => { if (this._tipKind === 'card') this.hideTip(); }, true);
      menu.addEventListener('scroll', () => { if (this._tipKind === 'card') this.hideTip(); }, { passive: true });
    }
    this.titles();
  },

  // the buttons say their keys where a mouse can ask
  titles() {
    const t = (id, s) => { const el = document.getElementById(id); if (el) el.title = s; };
    t('btnPause', 'Pause or resume (Space)');
    t('btnMenu', 'Menu (Esc)');
    t('mapBtn', 'Map (M)');
    t('bmToggle', 'Build menu (B)');
  },

  /* ---------------- 1. the pause ---------------- */
  // the player's own pause: the ⏸ button and Space
  setPause(on) {
    if (typeof S === 'undefined' || !S) return;
    S.paused = !!on;
    const b = document.getElementById('btnPause');
    if (b) b.textContent = S.paused ? '▶' : '⏸';
    this.playerPaused(S.paused);
  },
  playerPaused(on) {
    this._userPause = !!on;
    this._userPauseS = on ? S : null;
    this.syncVeil();
  },
  syncVeil() {
    const v = this._veil;
    if (!v) return;
    // the pause is the player's only while it is still THEIR world's and still held
    if (this._userPause && (typeof S === 'undefined' || !S || !S.paused || this._userPauseS !== S)) {
      this._userPause = false; this._userPauseS = null;
    }
    const on = this._userPause && this.inGame() && !this._deckHas();
    if (on === this._veilOn) return;
    this._veilOn = on;
    if (on) {
      const h = v.querySelector('.pvHint');
      if (h) h.textContent = this._mouse ? 'Press Space or ▶ to resume' : 'Tap ▶ to resume';
    }
    v.classList.toggle('on', on);
    // a reading under the plate is clutter: it goes, and waits for the next move
    if (on) { this.hideTip(); this._mAt = performance.now() + 1e5; }
  },

  /* ---------------- 2. the keyboard ---------------- */
  PAN: {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1],
  },
  onKey(e) {
    try {
      if (!this.ON || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this._editable(e.target)) return;
      // the menu: Escape is Resume
      if (typeof Screens !== 'undefined' && Screens.current === 'paused' && e.key === 'Escape') {
        if (!e.repeat && Screens.enterGame) Screens.enterGame();
        e.preventDefault(); return;
      }
      if (!this.inGame() || this.blocked()) return;
      const code = e.code;
      if (this.PAN[code]) { this._held.add(code); this._mouse = true; e.preventDefault(); return; }
      if (e.repeat) return;
      if (code === 'Space') {
        // a focused button would also be pressed by the Space: the game has it
        const ae = document.activeElement;
        if (ae && ae !== document.body && ae.blur && /^(BUTTON|A)$/.test(ae.tagName)) ae.blur();
        this._mouse = true;
        this.setPause(!S.paused);
        e.preventDefault(); return;
      }
      if (e.key === 'Escape') { this.escape(); e.preventDefault(); return; }
      if (e.key === '+' || e.key === '=' || code === 'NumpadAdd') { this.zoom(this.ZOOM_STEP); e.preventDefault(); return; }
      if (e.key === '-' || e.key === '_' || code === 'NumpadSubtract') { this.zoom(1 / this.ZOOM_STEP); e.preventDefault(); return; }
      const d = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (d) { if (this.army(+d[1])) e.preventDefault(); return; }
      if (code === 'KeyH' || e.key === 'Home') { if (this.home()) e.preventDefault(); return; }
      if (code === 'KeyB') { this.buildKey(); e.preventDefault(); return; }
      if (code === 'KeyM') { if (typeof UI !== 'undefined' && UI.setMiniCollapsed) UI.setMiniCollapsed(!UI.miniCollapsed); e.preventDefault(); }
    } catch (err) { /* a key never throws into the game */ }
  },
  // Escape steps back one thing at a time, and from nothing to the menu
  escape() {
    if (typeof UI === 'undefined') return;
    if (UI.placing) {
      // a building's ghost answers Escape itself (UI.init's own key); a wall
      // or a road line has no ghost, so Escape puts the line tool down here
      if (UI.isLine && UI.isLine(UI.placing)) {
        UI.wallDrag = null; UI.wallGhost = null;
        UI.exitPlacement();
        if (UI.setMenuCollapsed) UI.setMenuCollapsed(false);
      }
      return;
    }
    if (UI.settingRally) { UI.settingRally = null; if (UI.sel) UI.renderPanel(); return; }
    if (UI.terraMode) { UI.terraMode = null; UI.terraDrag = null; UI.terraGhost = null; if (UI.sel) UI.renderPanel(); return; }
    if (UI.sel) { UI.deselect(); return; }
    if (typeof Screens !== 'undefined') Screens.show('paused');
  },
  zoom(f) {
    if (typeof UI === 'undefined' || !UI.zoomAt || typeof R === 'undefined') return;
    this._glide = null;
    UI.zoomAt(R.viewW() / 2, R.viewH() / 2, f);
    this.hideTip();
  },
  army(n) {
    if (typeof UI === 'undefined' || !UI.selectArmy || !S.armies || !(S.armies[n] || []).length) return false;
    if (UI.placing) return false;
    UI.selectArmy(n);
    return true;
  },
  // H: home — the view glides to the hall, and the hall is taken in hand
  home() {
    const tc = typeof Bld !== 'undefined' && Bld.tcOf ? Bld.tcOf('P') : null;
    if (!tc) return false;
    this.glideTo(Bld.cx(tc), Bld.cy(tc));
    if (typeof UI !== 'undefined' && !UI.placing) UI.select('bld', tc.id);
    return true;
  },
  buildKey() {
    if (typeof UI === 'undefined' || UI.placing || !UI.setMenuCollapsed) return;
    // the journey's first game has no build menu yet (body.pro-nobuild): B
    // must not drop the selection Mira just asked for
    if (document.body.classList.contains('pro-nobuild')) return;
    const open = !UI.sel && !UI.menuCollapsed;
    if (open) UI.setMenuCollapsed(true);
    else { if (UI.sel) UI.deselect(); UI.setMenuCollapsed(false); }
  },

  /* a glide to a world point (tiles): eased, ~a third of a second, the end
     clamped as R.centerOn clamps it. Reduced motion lands it at once. */
  glideTo(tx, ty) {
    if (typeof R === 'undefined' || !R.cam) return;
    const c = R.cam, x0 = c.x, y0 = c.y;
    R.centerOn(tx, ty);
    const x1 = c.x, y1 = c.y;
    if (this._reduced()) { this._glide = null; return; }
    c.x = x0; c.y = y0;
    const far = Math.hypot(x1 - x0, y1 - y0) * c.z;
    if (far < 2) { c.x = x1; c.y = y1; this._glide = null; return; }
    this._glide = { x0, y0, x1, y1, t: 0, T: 0.3 + Math.min(0.3, far / 4000) };
  },

  /* per frame, from UI.refresh: the held keys, a glide, the veil, the cursor
     and the reading's rest timer. Idle, it is a handful of reads. */
  tick(dt) {
    if (!this.ON || !this._inited) return;
    dt = Math.max(0, Math.min(0.05, dt || 0));
    this.syncVeil();
    const g = this._glide;
    if (g) {
      g.t += dt;
      const p = Math.min(1, g.t / g.T), e = 1 - Math.pow(1 - p, 3);
      R.cam.x = g.x0 + (g.x1 - g.x0) * e; R.cam.y = g.y0 + (g.y1 - g.y0) * e;
      R.clampCam();
      if (p >= 1) this._glide = null;
    }
    if (this._held.size && this.inGame() && !this.blocked()) {
      let vx = 0, vy = 0;
      for (const c of this._held) { const v = this.PAN[c]; if (v) { vx += v[0]; vy += v[1]; } }
      vx = Math.sign(vx); vy = Math.sign(vy);
      if (vx || vy) {
        this._panK = Math.min(1, this._panK + dt / this.PAN_EASE);
        const k = 0.35 + 0.65 * this._panK * this._panK;
        const n = vx && vy ? Math.SQRT1_2 : 1;
        const sp = this.PAN_PX * k / R.cam.z;
        R.cam.x += vx * n * sp * dt; R.cam.y += vy * n * sp * dt;
        R.clampCam();
        this._glide = null;
        if (this._tipKind === 'map') this.hideTip();
      } else this._panK = 0;
    } else this._panK = 0;
    // the cursor follows a camera that moves under a still mouse
    if (this._over && (this._curDirty || this._held.size || this._glide) && performance.now() - this._curT >= this.CUR_MS) {
      this._curDirty = false; this._curT = performance.now();
      this.cursorAt(this._mx, this._my);
    }
    // the camera moving under a still mouse puts its reading away, and the
    // rest clock starts again (a glide, an edge scroll, a jump on the map)
    if (this._tipKind === 'map' && this._tipCam) {
      const c = R.cam, k = this._tipCam;
      if (Math.abs(c.x - k.x) > 2 || Math.abs(c.y - k.y) > 2 || c.z !== k.z) { this.hideTip(); this._mAt = performance.now(); this._curDirty = true; }
    }
    // a resting mouse reads what it rests on
    if (this._over && !this._tipKind && performance.now() - this._mAt >= this.TIP_REST_MS) this.mapTip();
  },

  /* ---------------- 3. the minimap ---------------- */
  miniTo(mini, cx, cy) {
    if (typeof R === 'undefined' || !mini) return;
    const r = mini.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fx = Math.max(0, Math.min(1, (cx - r.left) / r.width)), fy = Math.max(0, Math.min(1, (cy - r.top) / r.height));
    R.centerOn(fx * CFG.W, fy * CFG.H);
    this.miniView();
  },
  miniView() { if (typeof R !== 'undefined' && R.drawMiniView) R.drawMiniView(true); },

  /* ---------------- 4. alerts that show where ---------------- */
  alarm(node, x, y) {
    try {
      this.ping(x, y);
      if (node && node.isConnected && !node.querySelector('.tgo')) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tgo';
        b.title = 'Go there'; b.setAttribute('aria-label', 'Go there');
        b.innerHTML = this.GO_SVG;
        b.addEventListener('click', ev => { ev.stopPropagation(); this.glideTo(x, y); });
        node.classList.add('hasGo');
        node.appendChild(b);
      }
    } catch (e) {}
  },
  ping(x, y) {
    const wrap = document.getElementById('miniWrap');
    const folded = typeof UI !== 'undefined' && UI.miniCollapsed;
    if (!wrap || folded || wrap.style.display === 'none') {
      const mb = document.getElementById('mapBtn');
      if (mb) { mb.classList.remove('alarm'); void mb.offsetWidth; mb.classList.add('alarm'); clearTimeout(mb._alarmT); mb._alarmT = setTimeout(() => mb.classList.remove('alarm'), this.PING_MS); }
      return;
    }
    const old = wrap.querySelectorAll('.mping');
    if (old.length >= 4) old[0].remove();
    const p = document.createElement('i');
    p.className = 'mping';
    p.style.left = (Math.max(0, Math.min(1, x / CFG.W)) * 100) + '%';
    p.style.top = (Math.max(0, Math.min(1, y / CFG.H)) * 100) + '%';
    wrap.appendChild(p);
    setTimeout(() => p.remove(), this.PING_MS);
  },

  /* ---------------- 5–6. the mouse over the map ---------------- */
  onMove(e) {
    if (e.pointerType !== 'mouse') return;
    this._mouse = true; this._over = true;
    const moved = Math.hypot(e.clientX - this._mx, e.clientY - this._my);
    this._mx = e.clientX; this._my = e.clientY;
    if (moved > 0.5) this._mAt = performance.now();
    if (this._tipKind === 'map' && this._tipAt && Math.hypot(e.clientX - this._tipAt.x, e.clientY - this._tipAt.y) > this.TIP_SLOP) this.hideTip();
    if (e.buttons) { this.hideTip(); return; }
    const now = performance.now();
    if (now - this._curT < this.CUR_MS) { this._curDirty = true; return; }
    this._curT = now; this._curDirty = false;
    this.cursorAt(e.clientX, e.clientY);
  },
  // the units under the mouse (fog-honest): the one a click would take
  unitAt(wx, wy) {
    let best = null, bd = 0.55;
    for (const u of S.units) {
      if (Math.abs(u.x - wx) > 2.5 || Math.abs(u.y - wy) > 3) continue;
      if (u.owner !== 'P' && !G.visibleAt(u.x | 0, u.y | 0)) continue;
      if (R.unitHidden && R.unitHidden(u)) continue;
      const d = R.unitHit(u, wx, wy);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  bldAt(tx, ty) {
    const b = Bld.at(tx, ty);
    return b && (b.owner === 'P' || G.visibleAt(tx, ty)) ? b : null;
  },
  _selUnits() {
    const s = typeof UI !== 'undefined' && UI.sel;
    if (!s) return [];
    const ids = s.type === 'unit' ? [s.id] : s.type === 'group' ? s.ids : [];
    const out = [];
    for (const id of ids) { const u = Units.get(id); if (u && u.owner === 'P') out.push(u); }
    return out;
  },
  STATION_TOOL: { lumber: 'wood', quarry: 'stone', mine: 'gold', farm: 'food', lodge: 'food' },
  /* what a click here would do, as a cursor's name ('' the plain arrow). A
     read of the board and the selection — never an order, never a state
     write — kept in step with the tap's own reading where it matters (the
     dead-on unit radius, the foe building, the villager's gather gate). */
  intent(sx, sy) {
    if (typeof UI === 'undefined') return '';
    if (UI.placing || UI.wallDrag || UI.terraDrag || UI.moveDrag || (UI.pointers && UI.pointers.size)) return '';
    if (UI.settingRally || UI.terraMode) return 'aim';
    const w = R.screenToWorld(sx, sy), TL = CFG.TILE, wx = w.x / TL, wy = w.y / TL;
    const tx = Math.floor(wx), ty = Math.floor(wy);
    if (!MapGen.onBoard(tx, ty)) return '';
    const i = MapGen.idx(tx, ty);
    if (!S.map.explored[i]) return '';
    const sel = this._selUnits();
    const levied = u => !!(Units.isLevied && Units.isLevied(u));
    const fighters = sel.some(u => Units.isMilitary(u) || levied(u));
    const hands = sel.filter(u => Units.isVillager(u) && !levied(u));
    const hu = this.unitAt(wx, wy);
    if (hu) {
      if (hu.owner !== 'P' && (fighters || (hands.length && hu.owner === 'W'))) return 'attack';
      return 'pointer';
    }
    const hb = this.bldAt(tx, ty);
    if (hb && hb.owner !== 'P') return fighters && Bld.foeBld(hb, 'P') ? 'attack' : 'pointer';
    if (hb) {
      if (hands.length) {
        if (hb.construction > 0 || hb.hp < hb.maxhp) return 'build';
        const d = Bld.def(hb.key);
        if (d && d.needsWorker && Bld.workersAssigned(hb) < Bld.maxWorkers(hb)) return this.STATION_TOOL[hb.key] || 'build';
      }
      return 'pointer';
    }
    if (hands.length) {
      const t = S.map.terrain[i], g = CFG.GATHER[t];
      if (g && S.map.resAmount[i] > 0 && (!UI.lessonOk || UI.lessonOk(tx, ty))) return g.res === 'wood' ? 'wood' : g.res === 'stone' ? 'stone' : 'food';
      if (t === T.GOLDORE) return 'gold';
    }
    return '';
  },
  cursorAt(sx, sy) {
    let c = '';
    try { if (this.inGame() && !this.blocked()) c = this.intent(sx, sy); } catch (e) { c = ''; }
    this.setCursor(c);
  },
  setCursor(name) {
    if (name === this._cursor || typeof R === 'undefined' || !R.cv) return;
    this._cursor = name;
    const cur = this._cur || {};
    R.cv.style.cursor = !name ? '' : name === 'pointer' ? 'pointer' : name === 'aim' ? 'crosshair' : (cur[name] || 'pointer');
  },

  /* the reading: one short title and a line, near the mouse */
  infoAt(sx, sy) {
    const w = R.screenToWorld(sx, sy), TL = CFG.TILE, wx = w.x / TL, wy = w.y / TL;
    const tx = Math.floor(wx), ty = Math.floor(wy);
    if (!MapGen.onBoard(tx, ty)) return null;
    const i = MapGen.idx(tx, ty);
    if (!S.map.explored[i]) return null;
    const hp = o => `${Math.max(0, Math.ceil(o.hp))}/${o.maxhp} health`;
    const u = this.unitAt(wx, wy);
    if (u) {
      const own = u.owner === 'P';
      const pn = own && Units.personName ? Units.personName(u) : null;
      const base = Units.nameOf ? Units.nameOf(u) : CFG.UNITS[u.kind].name;
      const who = u.owner === 'A' ? 'Rival ' + base : u.owner === 'R' ? this._people(u, base) : base;
      return { key: 'u' + u.id + ':' + Math.ceil(u.hp), title: pn || who, sub: (pn ? who + ' · ' : '') + hp(u) };
    }
    const b = this.bldAt(tx, ty);
    if (b) {
      const d = Bld.def(b.key) || {};
      const lv = d.levels && d.levels.length > 1 && b.key !== 'wall' && b.key !== 'gate' ? ` · Lv ${b.level}` : '';
      const name = (b.owner === 'A' ? 'Rival ' : '') + (b.key === 'raidercamp' ? this._camp(b, d.name) : d.name) + lv;
      const bits = [];
      if (b.construction > 0) bits.push('being built');
      else if (b.upgrading) bits.push('rising a level');
      if (!(b.construction > 0) && b.hp < b.maxhp) bits.push(hp(b));
      if (b.owner === 'P' && d.needsWorker && !(b.construction > 0)) bits.push(`${Bld.workersAssigned(b)}/${Bld.maxWorkers(b)} at work`);
      return { key: 'b' + b.id + ':' + Math.ceil(b.hp) + ':' + (b.construction > 0), title: name, sub: bits.join(' · ') };
    }
    // the ground: what it holds, what it is good for — the amount only in sight
    const seen = G.visibleAt(tx, ty);
    const t = seen ? S.map.terrain[i] : S.map.seenTerrain[i];
    const amt = seen ? Math.floor(S.map.resAmount[i] || 0) : 0;
    // a stock is read only where someone of the clan can see it; in the fog
    // the tile is memory, and says so
    const left = (n, res) => !seen ? 'Last seen' : n > 0 ? `${n} ${res} left` : '';
    let title = '', sub = '';
    if (t === T.FOREST) { title = 'Woods'; sub = left(amt, 'wood'); }
    else if (t === T.HILLS) { title = 'Stone'; sub = left(amt, 'stone'); }
    else if (t === T.FERTILE) { title = R.fertileKindAt && R.fertileKindAt(tx, ty) === 'berry' ? 'Berry bushes' : 'Orchard'; sub = left(amt, 'food'); }
    else if (t === T.GOLDORE) { title = 'Gold seam'; sub = 'A villager can claim it as a mine'; }
    else if (t === T.WATER && seen && amt > 0) { title = 'Fishing water'; sub = `${amt} food in its fish`; }
    else if (t === T.STUMPS) { title = 'Felled stand'; sub = 'A lumber camp can stand here'; }
    else if (t === T.PEBBLES) { title = 'Broken rock'; sub = 'A quarry can stand here'; }
    else if (t === T.BARREN) { title = 'Picked bare'; sub = 'A farm can stand here'; }
    else if (t === T.MOUNTAIN) { title = 'Mountain'; sub = 'No way across'; }
    else if (t === T.TRENCH) { title = 'Trench'; sub = 'Blocks the way on foot'; }
    else if (t === T.MOAT) { title = 'Moat'; sub = 'Open water to a boat'; }
    else if (t === T.RUIN) { title = 'Rubble'; sub = 'It clears in time'; }
    if (!title) return null;
    return { key: 't' + i + ':' + title + ':' + sub, title, sub };
  },
  _people(u, base) {
    const tr = (CFG.TRIBES || {})[u.tribe];
    return tr && tr.name ? tr.name + ' — ' + base.toLowerCase() : base;
  },
  _camp(b, name) {
    const tr = (CFG.TRIBES || {})[b.tribe];
    return tr && tr.name ? tr.name + ' camp' : name;
  },
  mapTip() {
    if (!this._tip || !this._over || this._tipKind) return;
    if (!this.inGame() || this.blocked()) return;
    if (typeof UI !== 'undefined' && (UI.placing || UI.wallDrag || UI.terraDrag || UI.moveDrag || (UI.pointers && UI.pointers.size))) return;
    let info = null;
    try { info = this.infoAt(this._mx, this._my); } catch (e) { info = null; }
    if (!info) { this._mAt = performance.now() + 1e5; return; }   // nothing here: wait for the next move
    this.showTip('map', info.title, info.sub, '', this._mx + 16, this._my + 20, false);
    this._tipAt = { x: this._mx, y: this._my };
    this._tipCam = { x: R.cam.x, y: R.cam.y, z: R.cam.z };
  },

  /* ---------------- 7. the build cards ---------------- */
  cardTip(btn) {
    const key = btn.dataset.key, d = CFG.BUILDINGS[key];
    if (!d || !this._tip) return;
    let note = '', warn = '';
    try {
      const tc = Bld.tcOf('P');
      if (d.reqTC && (!tc || tc.level < d.reqTC)) { note = `Needs Town Center Lv ${d.reqTC}`; warn = 'bad'; }
      else {
        const short = Bld.shortfall(Bld.effCost('P', key));
        if (short) { note = 'Still needs ' + short; warn = 'short'; }
      }
    } catch (e) {}
    const r = btn.getBoundingClientRect();
    this.showTip('card', d.name, d.desc || '', note, r.left + r.width / 2, r.top - 8, true, warn);
  },

  /* the one tip element, two uses: near the mouse, or above a card */
  showTip(kind, title, sub, note, x, y, above, warn) {
    const el = this._tip;
    if (!el) return;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = '<b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') +
      (note ? '<em class="' + (warn || '') + '">' + esc(note) + '</em>' : '');
    el.className = 'on ' + kind;
    this._tipKind = kind;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const tw = el.offsetWidth, th = el.offsetHeight;
    let left = above ? x - tw / 2 : x, top = above ? y - th : y;
    if (!above && left + tw > vw - 8) left = x - 24 - tw;
    if (!above && top + th > vh - 8) top = y - 28 - th;
    left = Math.max(8, Math.min(vw - tw - 8, left));
    top = Math.max(8, Math.min(vh - th - 8, top));
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  },
  hideTip() {
    if (!this._tipKind || !this._tip) return;
    this._tip.className = '';
    this._tipKind = ''; this._tipAt = null; this._tipCam = null;
  },

  /* ---------------- 8. the bar points at what is missing ---------------- */
  short(cost) {
    if (!cost || typeof S === 'undefined' || !S || !S.res) return;
    for (const k of ['food', 'wood', 'stone', 'gold'])
      if ((cost[k] || 0) > 0 && (S.res[k] || 0) < cost[k]) this.flashChip(k);
  },
  popFull() { this.flashChip('pop'); },
  flashChip(k) {
    const el = document.querySelector('#topbar [data-chip="' + k + '"]');
    if (!el) return;
    el.classList.remove('short');
    void el.offsetWidth;   // the flash starts again on a second refusal
    el.classList.add('short');
    clearTimeout(el._shortT);
    el._shortT = setTimeout(() => el.classList.remove('short'), 1000);
  },

  /* ---------------- art: the cursors, drawn once at the screen's pixels ---------------- */
  CURSOR_SVG: {
    // [svg body in a 32 box, hotspot x, y, fallback]
    attack: ["<path d='M3 3 L8.5 4.6 L21.4 17.5 L17.5 21.4 L4.6 8.5 Z' fill='#e9edf0' stroke='#140d06' stroke-width='1.6' stroke-linejoin='round'/><path d='M5 5 L19.4 19.4' stroke='#98a4ab' stroke-width='1.1'/><path d='M14.2 24.8 L24.8 14.2' stroke='#140d06' stroke-width='5.4' stroke-linecap='round'/><path d='M14.2 24.8 L24.8 14.2' stroke='#d9a43a' stroke-width='2.8' stroke-linecap='round'/><path d='M21 21 L26.6 26.6' stroke='#140d06' stroke-width='5.2' stroke-linecap='round'/><path d='M21 21 L26.6 26.6' stroke='#7a4a22' stroke-width='2.8' stroke-linecap='round'/><circle cx='27.8' cy='27.8' r='2.7' fill='#d9a43a' stroke='#140d06' stroke-width='1.4'/>", 3, 3, 'crosshair'],
    wood: ["<path d='M10.5 10.5 L28 28' stroke='#140d06' stroke-width='5.2' stroke-linecap='round'/><path d='M10.5 10.5 L28 28' stroke='#a8743a' stroke-width='2.8' stroke-linecap='round'/><path d='M3.4 13.6 Q2.4 6.4 8.6 3.2 L15 9.6 L9.4 15.2 Z' fill='#d9dfe2' stroke='#140d06' stroke-width='1.6' stroke-linejoin='round'/><path d='M4.6 12.4 Q4.2 7.2 8.4 4.8' stroke='#ffffff' stroke-width='1.1' fill='none' stroke-linecap='round'/>", 3, 10, 'pointer'],
    stone: ["<path d='M10 10 L28 28' stroke='#140d06' stroke-width='5.2' stroke-linecap='round'/><path d='M10 10 L28 28' stroke='#a8743a' stroke-width='2.8' stroke-linecap='round'/><path d='M2.6 14.4 Q4.4 4.4 14.4 2.6 L15.2 5 Q7.6 7.4 5 15.2 Z' fill='#c9d0d4' stroke='#140d06' stroke-width='1.6' stroke-linejoin='round'/><path d='M4.4 12 Q6 6 12 4.4' stroke='#ffffff' stroke-width='1' fill='none' stroke-linecap='round'/>", 3, 13, 'pointer'],
    gold: ["<path d='M10 10 L28 28' stroke='#140d06' stroke-width='5.2' stroke-linecap='round'/><path d='M10 10 L28 28' stroke='#a8743a' stroke-width='2.8' stroke-linecap='round'/><path d='M2.6 14.4 Q4.4 4.4 14.4 2.6 L15.2 5 Q7.6 7.4 5 15.2 Z' fill='#f2c94e' stroke='#140d06' stroke-width='1.6' stroke-linejoin='round'/><path d='M4.4 12 Q6 6 12 4.4' stroke='#fff3c2' stroke-width='1' fill='none' stroke-linecap='round'/>", 3, 13, 'pointer'],
    food: ["<path d='M12.6 20.6 L18.6 28.4' stroke='#140d06' stroke-width='5.2' stroke-linecap='round'/><path d='M12.6 20.6 L18.6 28.4' stroke='#a8743a' stroke-width='2.8' stroke-linecap='round'/><path d='M12.4 21.4 Q3.2 13 8 6.6 Q13.2 1 22.6 4.4 Q14.4 4.6 11.4 9.2 Q8.8 14 14.6 19.4 Z' fill='#d9dfe2' stroke='#140d06' stroke-width='1.6' stroke-linejoin='round'/><path d='M10.6 18.4 Q6.2 12.4 9.4 8' stroke='#ffffff' stroke-width='1' fill='none' stroke-linecap='round'/>", 21, 4, 'pointer'],
    build: ["<path d='M11 11 L27.6 27.6' stroke='#140d06' stroke-width='5.2' stroke-linecap='round'/><path d='M11 11 L27.6 27.6' stroke='#a8743a' stroke-width='2.8' stroke-linecap='round'/><path d='M2.4 9.2 L9.2 2.4 L15.4 8.6 L8.6 15.4 Z' fill='#9fa8ad' stroke='#140d06' stroke-width='1.6' stroke-linejoin='round'/><path d='M3.8 9.2 L9.2 3.8' stroke='#e1e6e9' stroke-width='1.2' stroke-linecap='round'/>", 4, 4, 'pointer'],
  },
  _buildCursors() {
    this._cur = {};
    const set = (name, css) => { this._cur[name] = css; };
    for (const name in this.CURSOR_SVG) {
      const [body, hx, hy, fb] = this.CURSOR_SVG[name];
      const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g style='filter:drop-shadow(0 1px 1px rgba(0,0,0,.55))'>" + body + '</g></svg>';
      const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
      set(name, `url("${url}") ${hx} ${hy}, ${fb}`);
      // …and at twice the pixels for a sharp screen, once the image is drawn
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const mk = s => { const c = document.createElement('canvas'); c.width = c.height = 32 * s; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32 * s, 32 * s); return c.toDataURL('image/png'); };
            const a = mk(1), b = mk(2);
            const probe = document.createElement('div');
            for (const fn of ['image-set', '-webkit-image-set']) {
              const css = `${fn}(url("${a}") 1x, url("${b}") 2x) ${hx} ${hy}, ${fb}`;
              probe.style.cursor = ''; probe.style.cursor = css;
              if (probe.style.cursor) { set(name, css); break; }
            }
            if (this._cursor === name && R.cv) R.cv.style.cursor = this._cur[name];
          } catch (e) {}
        };
        img.src = url;
      } catch (e) {}
    }
  },
  PAUSE_SVG: '<svg class="pvIcon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="4" width="4.6" height="16" rx="1.4" fill="#f2cf73" stroke="#140d06" stroke-width="1.2"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.4" fill="#f2cf73" stroke="#140d06" stroke-width="1.2"/></svg>',
  GO_SVG: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="#f2cf73" stroke-width="1.4"/><circle cx="8" cy="8" r="2.2" fill="#f2cf73"/><path d="M8 0.6 V3.4 M8 12.6 V15.4 M0.6 8 H3.4 M12.6 8 H15.4" stroke="#f2cf73" stroke-width="1.4" stroke-linecap="round"/></svg>',

  _css() {
    if (document.getElementById('feelCss')) return;
    const st = document.createElement('style');
    st.id = 'feelCss';
    st.textContent = `
#pauseVeil { position: absolute; inset: 0; z-index: 8; pointer-events: none; display: none;
  background: radial-gradient(ellipse at 50% 48%, rgba(10,8,5,0.08) 30%, rgba(6,5,3,0.46) 100%); }
#pauseVeil.on { display: flex; align-items: center; justify-content: center; animation: pvIn .22s ease-out; }
body:not(.ingame) #pauseVeil, body:not(.ingame) #feelTip { display: none !important; }
#pauseVeil .pvPlate { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 26px 10px;
  background: rgba(18,13,8,0.88); border: 1px solid rgba(214,174,90,0.6); border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.65), 0 8px 26px rgba(0,0,0,0.55); }
#pauseVeil .pvIcon { width: 26px; height: 26px; display: block; }
#pauseVeil b { font-family: var(--menufont, serif); font-size: 21px; letter-spacing: 4px; text-transform: uppercase;
  color: #f2cf73; font-weight: 700; text-shadow: 0 2px 0 #000; animation: pvBreath 2.6s ease-in-out infinite; }
#pauseVeil small { font-size: 12px; color: #cbbd98; letter-spacing: .2px; }
@keyframes pvIn { from { opacity: 0; } }
@keyframes pvBreath { 50% { opacity: .7; } }
#feelTip { position: fixed; left: 0; top: 0; z-index: 11; pointer-events: none; display: none; max-width: 240px;
  padding: 6px 10px 7px; border-radius: 6px; background: rgba(18,13,8,0.93); border: 1px solid rgba(214,174,90,0.55);
  box-shadow: 0 4px 14px rgba(0,0,0,0.5); color: #e9dcbd; font-size: 12px; line-height: 1.35; }
#feelTip.on { display: block; animation: pvIn .14s ease-out; }
#feelTip b { display: block; color: #f2cf73; font-size: 12.5px; font-weight: 700; }
#feelTip span { display: block; color: #d8cba8; }
#feelTip em { display: block; margin-top: 3px; font-style: normal; color: #e7c27a; }
#feelTip em.bad { color: #ff9a86; }
#feelTip.card { max-width: 260px; text-align: left; }
#toasts .toast.hasGo { display: flex; align-items: center; gap: 8px; }
#toasts .toast .tgo { pointer-events: auto; position: relative; flex: none; width: 26px; height: 22px; margin: -2px -3px -2px auto;
  padding: 0; display: grid; place-items: center; cursor: pointer; border-radius: 4px;
  border: 1px solid rgba(214,174,90,0.65); background: rgba(70,46,18,0.95); }
#toasts .toast .tgo::after { content: ''; position: absolute; inset: -6px; }
#toasts .toast .tgo:hover { background: rgba(110,74,28,0.95); }
#toasts .toast .tgo svg { width: 14px; height: 14px; display: block; }
#miniWrap .mping { position: absolute; width: 0; height: 0; pointer-events: none; }
#miniWrap .mping::before, #miniWrap .mping::after { content: ''; position: absolute; left: -13px; top: -13px; width: 26px; height: 26px;
  border-radius: 50%; border: 2px solid #ff5a3c; box-shadow: 0 0 6px rgba(255,90,60,.85); opacity: 0;
  animation: mping 1.1s ease-out 2 both; }
#miniWrap .mping::after { animation-delay: .45s; }
@keyframes mping { from { transform: scale(.12); opacity: 1; } to { transform: scale(1); opacity: 0; } }
#mapBtn.alarm { animation: mapAlarm .75s ease-in-out 3; }
@keyframes mapAlarm { 50% { box-shadow: 0 0 0 2px #ff5a3c, 0 0 12px rgba(255,90,60,.9); } }
#topbar .res.short { animation: chipShort .9s ease-out; }
#topbar .res.short > span { color: #ff9a86; }
@keyframes chipShort {
  0% { box-shadow: inset 0 1px 2px rgba(0,0,0,.55), 0 0 0 0 rgba(255,96,64,0); transform: none; }
  12% { box-shadow: inset 0 1px 2px rgba(0,0,0,.55), 0 0 0 2px rgba(255,96,64,.95), 0 0 12px rgba(255,80,50,.75); transform: translateY(-1px) scale(1.06); }
  30% { transform: none; }
  100% { box-shadow: inset 0 1px 2px rgba(0,0,0,.55), 0 0 0 2px rgba(255,96,64,0), 0 0 12px rgba(255,80,50,0); } }
@media (prefers-reduced-motion: reduce) {
  #pauseVeil.on, #pauseVeil b, #feelTip.on { animation: none; }
  #miniWrap .mping::before, #miniWrap .mping::after { animation: none; opacity: .9; transform: scale(.6); }
  #topbar .res.short { animation: none; box-shadow: inset 0 1px 2px rgba(0,0,0,.55), 0 0 0 2px rgba(255,96,64,.9); }
  #mapBtn.alarm { animation: none; box-shadow: 0 0 0 2px #ff5a3c; }
}`;
    document.head.appendChild(st);
  },
};
window.Feel = Feel;
