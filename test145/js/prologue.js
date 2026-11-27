"use strict";
/* ============================ THE PROLOGUE ============================
   (CLAUDE.md, THE PROLOGUE) A new device plays three authored games in
   order — The First Fire, The Growing Clan, The Reckoning (js/scenarios.js,
   js/scenario-maps.js) — with the Elder at its side: one line at a time,
   fifteen words at most, one instruction each, no lore. The level is the
   tutorial; the Elder only says what the map already shows.

   What this file owns:
     PROGRESS   which games this device has won (localStorage 'neo-prologue',
                mirrored by the cloud's card_prologue rows), the skip, and the
                one question "is this device on its journey" (active)
     THE TITLE  one dominant BEGIN, a small "Skip the journey", and the next
                world founded behind the title so BEGIN opens it at once
     THE SCRIPT each game's beats: a line, a face, a goal, the target the
                pulse rings and the hand points at, and what completes it —
                read on the SIM's clock (simTick), so the scripted harness
                plays it as a person does
     THE ELDER  the panel (the Settings page's carved frame) fixed at the top
                with the task in its header, its folded strip, the pulse, the
                idle hand, the celebration
     ENDINGS    the Elder's last word before the end screen (holdEnd), the
                chief's name after game 1, the journey's card and the end
                screen's two doors (endCard / endRow / endAct)
   Nothing here draws the run's RNG or writes the world, except what a beat
   itself does on purpose (game 3's raid, the menu unlocks). Off the
   prologue (S.scenario null) every hook is one falsy read. */
const Prologue = {
  KEY: 'neo-prologue',
  up: false,           // the Elder's layer is on screen (G.frame keeps painting it)

  /* ================= PROGRESS ================= */
  _q: (() => { try { return new URLSearchParams(location.search).get('prologue'); } catch (e) { return null; } })(),
  _get() {
    try {
      const v = window.Screens && Screens.lsGet ? Screens.lsGet(this.KEY) : localStorage.getItem(this.KEY);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  },
  _set(p) {
    try {
      const v = JSON.stringify(p);
      if (window.Screens && Screens.lsSet) Screens.lsSet(this.KEY, v); else localStorage.setItem(this.KEY, v);
    } catch (e) {}
  },
  /* the device's record, decided ONCE: a device with any trace of earlier
     play (Screens.gamesFounded — a world founded, a finished run, a slot, a
     crash snapshot, the draft help read) is a veteran and never sent on the
     journey; a fresh one is. ?prologue=reset forgets the record (testing). */
  prog() {
    if (this._q === 'reset' && !this._reset) {
      this._reset = true;
      try { if (window.Screens && Screens.lsDel) Screens.lsDel(this.KEY); else localStorage.removeItem(this.KEY); } catch (e) {}
    }
    let p = this._get();
    if (!p || typeof p !== 'object') {
      let vet = false;
      try { vet = !!(window.Screens && Screens.gamesFounded && Screens.gamesFounded() > 0); } catch (e) {}
      if (this._q === '1' || this._q === 'reset') vet = false;
      p = { v: 1, at: Date.now(), veteran: vet, done: {} };
      this._set(p);
    }
    p.done = p.done || {};
    return p;
  },
  // the scripted test runner never meets the journey unless it asks for it
  automated() { try { return !!navigator.webdriver; } catch (e) { return false; } },
  /* THE ONE QUESTION: is this device on its journey right now? */
  active() {
    if (!(typeof CFG !== 'undefined' && CFG.PROLOGUE && CFG.PROLOGUE.ON) || !window.Scenarios) return false;
    if (this._q === '0') return false;
    if (this.automated() && this._q !== '1' && this._q !== 'reset') return false;
    const p = this.prog();
    if (p.skipped || p.veteran) return false;
    return this.next() <= 3;
  },
  next() { const d = this.prog().done; for (let g = 1; g <= 3; g++) if (!d[g]) return g; return 4; },
  markDone(g) {
    const p = this.prog();
    if (p.done[g]) return;
    p.done[g] = Date.now();
    this._set(p);
  },
  skip(from) {
    const p = this.prog();
    p.skipped = Date.now();
    this._set(p);
    this.track('skip', { from: from || 'title', game: this.next() });
  },

  /* ================= TELEMETRY (Backend.lesson, migration 0018) ================= */
  track(ev, props) {
    try { if (window.Backend && Backend.lesson) Backend.lesson(ev, props || {}); } catch (e) {}
  },

  /* ================= THE TITLE ================= */
  NAMES: { 1: 'The First Fire', 2: 'The Growing Clan', 3: 'The Reckoning' },
  onTitle() {
    const t = document.getElementById('scrTitle');
    if (!t) return;
    this._css();
    const on = this.active();
    t.classList.toggle('pro', on);
    let btn = document.getElementById('btnBegin');
    let skip = document.getElementById('btnSkipJourney');
    if (!on) { if (btn) btn.remove(); if (skip) skip.remove(); return; }
    const menu = t.querySelector('.tmenu');
    if (!menu) return;
    const g = this.next();
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'abtn big'; btn.id = 'btnBegin'; btn.type = 'button';
      // one clean word on the lit plate (TitleScreen.KIND): the strongest
      // button, never a rival to the logo
      btn.setAttribute('aria-label', 'Begin');
      btn.innerHTML = '<span class="bglow" aria-hidden="true"></span><span class="blab">Begin</span><small></small>';
      btn.addEventListener('click', () => this.begin());
      menu.insertBefore(btn, menu.firstChild);
    }
    const sm = btn.querySelector('small');
    if (sm) sm.textContent = this.NAMES[g] + ' · ' + g + ' of 3';
    btn.setAttribute('aria-label', 'Begin: ' + this.NAMES[g] + ', ' + g + ' of 3');
    if (!skip) {
      skip = document.createElement('button');
      skip.id = 'btnSkipJourney'; skip.type = 'button'; skip.className = 'proSkip';
      skip.textContent = 'Skip the journey';
      skip.addEventListener('click', () => this._skipTap(skip));
      menu.parentNode.insertBefore(skip, menu.nextSibling);
    }
    if (window.TitleScreen && TitleScreen.dress) { try { TitleScreen.dress(); } catch (e) {} }
  },
  // two taps: the first asks, the second skips (a slip never ends the journey)
  _skipTap(el) {
    const now = performance.now();
    if (!(this._skipArm && now - this._skipArm < 2800)) {
      this._skipArm = now;
      el.textContent = 'Tap again to skip';
      el.classList.add('arm');
      clearTimeout(this._skipT);
      this._skipT = setTimeout(() => { el.textContent = 'Skip the journey'; el.classList.remove('arm'); this._skipArm = 0; }, 2800);
      return;
    }
    this._skipArm = 0;
    this.skip('title');
    this._pre = null;
    // the world behind the title was the journey's: the ordinary demo takes its place
    if (window.Screens) { Screens._demo = false; try { Screens.ensureDemo(); } catch (e) {} Screens.onTitle(); }
  },

  /* THE NEXT WORLD WAITS BEHIND THE TITLE: founded once the title is up (in
     place of the demo, so the boot founds one world, not two), held still
     and fogged, its ground and art prefetched (G.frame), so BEGIN opens it
     at once. Founded OUTSIDE ensureDemo, so it wears the V4/V5 ground. */
  _pre: null,
  holding() {
    return !!(this._pre && typeof S !== 'undefined' && S === this._pre && S.scenario && S.played === false && !S.over);
  },
  preload() {
    if (!this.active() || !window.Screens) return false;
    if (Screens.opening && Screens.opening()) return false;
    if (this.holding()) return true;
    // a world the player is playing or reading the draft of is never replaced
    if (typeof S !== 'undefined' && S && !Screens._demo && S.played && !S.over) return false;
    if (typeof S !== 'undefined' && S && S.draft && !S.draft.done && !S.over && !Screens._demo) return false;
    const g = this.next();
    return this.found(g, true);
  },
  found(g, still) {
    const id = 'prologue_' + g;
    if (!Scenarios.def(id)) return false;
    // your people's tunic: the same roll a run takes (red stays the rival's) —
    // rolled ONCE for the journey and kept (the record's `tunic`), so the clan
    // wears one colour through its three games and the next game finds its
    // people's strips already dyed and installed (a new dye is a new install)
    const pool = ((typeof Sprites !== 'undefined' && Sprites.villagerTunics) || ['blue']).filter(t => t !== 'red');
    const p = this.prog(), was = typeof S !== 'undefined' && S && S.scenario && S.tunic && S.tunic.P;
    let tunic = [p.tunic, was].find(t => t && pool.indexOf(t) >= 0);
    if (!tunic) tunic = pool[(Math.random() * pool.length) | 0] || 'blue';
    if (p.tunic !== tunic) { p.tunic = tunic; this._set(p); }
    Screens._demo = false;
    G.freeVis = false;
    const prev = R.deferBake; R.deferBake = true;   // the bake in slices behind the title, never a frozen press
    try { Scenarios.found(id, { tunic }); } finally { R.deferBake = prev; }
    /* held for the counted art, as a founded run's is (foundRun): on a 4x phone
       baking beside the people's strips was measured SLOWER (the two share the
       thread, and the strips are what the press waits for last) */
    R.holdBake = !(window.Assets && Assets.artReady && Assets.artReady());
    if (R.holdBake && Screens.waitForArt) { const w = S; Screens.waitForArt(Screens.GAME_ART_FLOOR_MS).then(() => { if (S === w) R.holdBake = false; }); }
    if (window.Backend) { try { Backend.markActiveSlot(null); Backend.activeName = null; } catch (e) {} }
    Screens.lastSavedDay = 1;
    G.updateVisibility();
    if (still) S.paused = true;   // nothing moves until BEGIN
    this._pre = S;
    this._warmGlide();
    this._warmFaces();   // her nine faces, fetched while the world is founded
    return true;
  },
  // the establishing glide's views: their ground asked for too
  _warmGlide() {
    if (!window.TerrainX || !TerrainX.prefetchViews || !TerrainX.on) return;
    try { const v = this.glideViews(); if (v) TerrainX.prefetchViews(v, 0); } catch (e) {}
  },
  /* WHAT THE GLIDE SHOWS (build 207): the views the establishing shot passes
     through, [cx, cy, z] in WORLD PIXELS — its start, three steps of its way
     and its end, each placed by the camera's own clamp — so their ground is
     painted before the world opens (TerrainX.prefetchViews, and the press
     waits for them, Screens.enterGame). The warm-up used to hand TerrainX the
     start's TILE numbers as pixels, which asked for the map's top-left corner,
     and the journey opened on blurred stand-in ground where its glide began.
     Cached per world and screen size; null for a world with no camera. */
  glideViews() {
    const sc = typeof Scenarios !== 'undefined' && Scenarios.live && Scenarios.live();
    if (!sc || !sc.camera || typeof R === 'undefined' || !R.centerOn) return null;
    const key = R.viewW() + 'x' + R.viewH() + (R.defaultZoom ? '@' + R.defaultZoom() : '');
    if (this._gv && this._gv.s === S && this._gv.k === key) return this._gv.v;
    const cam = { x: R.cam.x, y: R.cam.y, z: R.cam.z }, out = [];
    try {
      const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const z1 = R.defaultZoom ? R.defaultZoom() : R.cam.z;
      const b = [sc.camera.x + 0.5, sc.camera.y + 0.5];
      const z0 = sc.glideFrom ? Math.max(R.minZoom ? R.minZoom() : 0.5, Math.min(z1, sc.glideFrom.z || 0.9)) : z1;
      const a = sc.glideFrom && !reduced ? [sc.glideFrom.x + 0.5, sc.glideFrom.y + 0.5] : b;
      const steps = a === b ? [1] : [0, 0.25, 0.5, 0.75, 1];
      for (const e of steps) {
        R.cam.z = z0 + (z1 - z0) * e;
        R.centerOn(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e);
        out.push([R.cam.x + R.viewW() / R.cam.z / 2, R.cam.y + R.viewH() / R.cam.z / 2, R.cam.z]);
      }
    } finally { R.cam.x = cam.x; R.cam.y = cam.y; R.cam.z = cam.z; }
    this._gv = { s: S, k: key, v: out };
    return out;
  },

  /* BEGIN: the held world opens; anything else founds the next game first */
  begin() {
    if (!window.Screens || (Screens.opening && Screens.opening())) return;
    if (Screens._founding) return;
    const g = this.next();
    if (g > 3) { Screens.onTitle(); return; }
    if (window.Backend && Backend.step) Backend.step('newgame');   // the first-minute funnel's door
    if (!(this.holding() && S.scenario === 'prologue_' + g)) this.found(g, true);
    this._pre = null;
    this._enterGame(g);
  },
  _enterGame(g) {
    const sc = Scenarios.live();
    Screens.backTo = 'title';
    // game 3 deals its origin cards first (Cards.offer's curated six): the draft is its first lesson
    if (sc && sc.draft && S.draft && !S.draft.done) { Screens.show('draft'); return; }
    Screens.enterGame();
  },
  // a lost game is played again: its own authored world, afresh
  retry() {
    const g = Scenarios.game() || this.next();
    if (!g || g > 3 || !window.Screens) return;
    this.found(g, true);
    this._pre = null;
    this._enterGame(g);
  },
  // the journey's next game, from the end screen's "Continue the journey"
  journey() {
    const g = this.next();
    if (g > 3) { Screens.backTo = 'title'; Screens.show('newgame'); return; }
    if (!(this.holding() && S.scenario === 'prologue_' + g)) this.found(g, true);
    this._pre = null; this._endS = null;
    this._enterGame(g);
  },

  /* THE NEXT GAME WAITS BEHIND THE REWARD (the brief: "preload the next map,
     under 1 s on a desktop, 2 s on a phone"). Founded at the press, the next
     world paid its founding, its art, its bake and the ground under its
     opening view (4.7 s on a desktop, 7.4 s on a 4x-throttled phone, measured)
     behind a plaque. So once a journey WIN's reward card has settled, the next
     game is founded behind the reward screen — held still and unplayed, the
     title's own preload (holding()) — and its ground asked for (G.frame) while
     the player reads; "Continue the journey" then opens it at once. The
     finished world is KEPT (_endS) for everything the reward screen still asks
     of it: the way back from the collection or the board (asEnd), the game a
     door is tracked for (endGame). Never after a loss (Try again founds that
     world afresh), never after the last game, never over an opening. */
  NEXT_AFTER_MS: 900,   // the reward screen's own entrance first
  NEXT_WAIT_MS: 8000,   // a reveal that never settles is not waited on for longer
  _endS: null, _endG: 0, _nextT: 0,
  _armNext() {
    clearTimeout(this._nextT); this._nextT = 0;
    if (typeof S === 'undefined' || !S || !S.scenario || !S.over || !S.over.win || S === this._endS) return;
    const g = Scenarios.game();
    if (!(g >= 1 && g < 3) || this.next() !== g + 1 || !this.active()) return;
    const w = S, t0 = performance.now();
    const tryNow = () => {
      this._nextT = 0;
      if (typeof S === 'undefined' || S !== w || !S.over || !window.Screens || !(Screens.atEnd && Screens.atEnd())) return;
      // the reward card rising or flying to the deck keeps the thread: the founding waits for it
      const D = window.DeckScreens;
      const busy = (D && (D._flying || (D._view && !D._ready && Screens.current === 'endgame'))) || (Screens.opening && Screens.opening());
      if (busy && performance.now() - t0 < this.NEXT_WAIT_MS) { this._nextT = setTimeout(tryNow, 200); return; }
      this._preNext(w, g);
    };
    this._nextT = setTimeout(tryNow, this.NEXT_AFTER_MS);
  },
  _preNext(w, g) {
    if (typeof S === 'undefined' || S !== w || this.next() !== g + 1) return false;
    this._endS = w; this._endG = g;
    let ok = false;
    try { ok = this.found(g + 1, true); } catch (e) { console.error('prologue: the next world', e); }
    if (!ok) { this._endS = null; if (typeof S !== 'undefined' && S !== w && !this.holding()) S = w; }
    return ok;
  },
  // the game the reward screen is FOR (the next one may already be held behind it)
  endGame() {
    return (this._endS && typeof S !== 'undefined' && S !== this._endS && this._endG) || Scenarios.game();
  },
  /* what the reward screen asks of its own run once the next world is held
     behind it — the way back from the collection or the board re-shows it —
     is asked of the finished world, in one synchronous call */
  asEnd(fn) {
    const E = this._endS;
    if (!E || typeof S === 'undefined' || S === E || !E.over || !this.holding()) return fn();
    const cur = S;
    S = E;
    try { return fn(); } finally { if (S === E) S = cur; }
  },
  /* GAME 3's DRAFT: the Elder says it in one line under the cards; the old
     help panel (its Calm / Moderate / Hard words) is not shown on the journey */
  DRAFT_LINE: 'Every clan begins with a gift. Choose the one you want.',
  onDraft() {
    const on = !!(typeof S !== 'undefined' && S && S.scenario);
    let el = document.getElementById('proDraft');
    if (!on) { if (el) el.style.display = 'none'; return; }
    const ov = document.getElementById('draftOverlay');
    if (ov) ov.style.display = 'none';
    this._css();
    if (!el) {
      const host = document.querySelector('#scrDraft .sbody');
      if (!host) return;
      el = document.createElement('div');
      el.id = 'proDraft';
      el.innerHTML = '<div class="pePic"><img alt="" src="' + this.FACES.pleased + '"></div>' +
        '<div class="peBody"><b class="peName">' + this.NAME + '</b><p class="peTxt"></p></div>';
      host.appendChild(el);
    }
    el.querySelector('.peTxt').textContent = this.DRAFT_LINE;
    el.style.display = '';
  },
  /* "Play a random world": an ordinary Calm world, no difficulty asked — the
     journey waits on the title for whenever the player comes back */
  randomWorld() {
    if (!window.Screens) return;
    Screens.newPrefs.mode = 'calm';
    Screens.backTo = 'title';
    Screens.startNewGame();
  },

  /* ================= THE SCRIPT ================= */
  // the authored mark → a tile-centred world target
  mark(name, r) {
    const sc = Scenarios.live(), m = sc && sc.marks && sc.marks[name];
    return m ? { x: m[0] + 0.5, y: m[1] + 0.5, r: r || 0.8 } : null;
  },
  tc() { return Bld.tcOf('P'); },
  vils() { return S.units.filter(u => u.owner === 'P' && u.kind === 'villager'); },
  /* idle: no task, no mark and not walking — asked the way the game asks it
     (Units.moving: a walk that has ARRIVED keeps its path, pathI at its end,
     and a scout standing at the mark he was sent to read as walking for good) */
  isIdle(u) {
    const U = typeof Units !== 'undefined' ? Units : null;
    const walking = U && U.moving ? !!U.moving(u) : !!(u.path && u.path.length);
    return !u.task && !u.tUnit && !walking && !(U && U.isLevied && U.isLevied(u));
  },
  /* the hand to send: the nearest idle one to the hall — or, given the work
     it is sent to (`near`), the nearest idle one to THAT (operator, build 190:
     "have the villager next to the wood be the one selected, so there isn't
     that tight overlap between villagers": the hand nearest the hall was sent
     to the trees and stood on the spot of the one already beside them); with
     none idle, a hand-gatherer before a builder, and a station's own hand last
     of all — nothing in the lesson puts a station's worker back */
  idleVil(near) {
    const tc = this.tc(); let best = null, bd = 1e9;
    const at = near && near.x != null ? near : (tc ? { x: tc.x + 1, y: tc.y + 1 } : null);
    for (const u of this.vils()) {
      const t = u.task && u.task.type;
      const rank = this.isIdle(u) ? 0 : t === 'build' ? 2 : t === 'work' ? 3 : 1;
      const d = (at ? Math.hypot(u.x - at.x, u.y - at.y) : 0) + rank * 1e6;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  selVil() {
    const s = UI.sel; if (!s) return null;
    const own = id => { const u = Units.get(id); return u && u.owner === 'P' && u.kind === 'villager' ? u : null; };
    if (s.type === 'unit') return own(s.id);
    if (s.type === 'group') for (const id of (s.ids || [])) { const u = own(id); if (u) return u; }
    return null;
  },
  selBld(key) { const s = UI.sel; if (!s || s.type !== 'bld') return null; const b = Bld.get ? Bld.get(s.id) : S.buildings.find(x => x.id === s.id); return b && b.owner === 'P' && (!key || b.key === key) ? b : null; },
  has(key, finished) { return S.buildings.some(b => b.owner === 'P' && b.key === key && (!finished || !(b.construction > 0))); },
  count(key, finished) { return S.buildings.filter(b => b.owner === 'P' && b.key === key && (!finished || !(b.construction > 0))).length; },
  vis(sel) { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null); },
  soldiers() { return S.units.filter(u => u.owner === 'P' && Units.isMilitary && Units.isMilitary(u)); },
  // a works of the player's still going up, and the hands to send to it
  siteOf(key) { return S.buildings.find(b => b.owner === 'P' && b.key === key && b.construction > 0) || null; },
  /* the next pair of hands for a site: one not already at it, idle first, then the
     nearest busy one — and a station's own hand last of all (build 193: game 1's hall
     rose on the lumber camp's two hands, the nearest, and left the camp Mira had just
     praised standing empty; nothing in the lesson sends a station's hand back) */
  handFor(w) {
    let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (this.buildsAt(u, w)) continue;
      const rank = this.isIdle(u) ? 0 : u.task && u.task.type === 'work' ? 2 : 1;
      const d = (Bld.cx(w) - u.x) ** 2 + (Bld.cy(w) - u.y) ** 2 + rank * 1e6;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  buildsAt(u, w) { return !!(u && u.task && u.task.type === 'build' && u.task.id === w.id); },
  siteRing(key) {
    const w = this.siteOf(key); if (!w) return null;
    const at = { x: Bld.cx(w), y: Bld.cy(w), r: 1.6 }, sel = this.selVil();
    if (sel && !this.buildsAt(sel, w)) return at;
    const v = this.handFor(w); return v ? { u: v.id } : null;
  },
  siteTaps(key) {
    const w = this.siteOf(key); if (!w) return [];
    const at = { x: Bld.cx(w), y: Bld.cy(w), r: 1.6 }, sel = this.selVil();
    if (sel && !this.buildsAt(sel, w)) return [at];
    const v = this.handFor(w); return v ? [{ u: v.id }, at] : [];
  },
  /* "send someone to X": hold a villager → ring X; else ring the hands */
  sendTo(target) {
    return () => {
      const t = typeof target === 'function' ? target() : this.mark(target);
      const v = this.selVil();
      if (v || this.sent(t)) return t;
      const iv = this.idleVil(t);
      return iv ? { u: iv.id } : t;
    };
  },
  sendTaps(target) {
    return () => {
      const t = typeof target === 'function' ? target() : this.mark(target);
      if (this.sent(t) && !this.selVil()) return [];   // someone is on the way: nothing to show
      if (this.selVil()) return t ? [t] : [];
      const iv = this.idleVil(t);
      return [iv ? { u: iv.id } : null, t].filter(Boolean);
    };
  },
  // a hand already sent to gather the good a target tile holds
  sent(t) {
    if (!t || t.x === undefined) return false;
    const g = CFG.GATHER[S.map.terrain[(t.y | 0) * CFG.W + (t.x | 0)]];
    return !!g && this.gatherers(g.res).length > 0;
  },
  /* THE BUILD CHAIN: the Build tab → the card (marked NEW) → the ghost
     already standing on the right ground → ✓. One ring at a time, wherever
     the player is in it. */
  // a site by its mark's name, or a site that moves (a function: the lodge's killing ground)
  siteMark(site) { return typeof site === 'function' ? site.call(this) : this.mark(site); },
  buildRing(key, site) {
    return () => {
      if (!UI.placing) this._seated = null;   // a fresh placement seats the ghost again
      if (UI.placing === key) {
        this._seatGhost(key, site);
        // ✓ only while the ghost stands where the building may: a slip of the
        // finger moves it onto ground it cannot take, and a tap on the site
        // jumps it back (the ✓ there is greyed and answers nothing)
        const v = UI.placeVerdict;
        if ((!v || v.ok) && this.vis('#placeOk')) return { sel: '#placeOk' };
        const m = this.siteMark(site); return m || null;
      }
      const card = '.bbtn[data-key="' + key + '"]';
      if (this.vis(card)) return { sel: card };
      return this.buildDoor();
    };
  },
  // the ghost seats itself on the authored site once per placement (never fights a drag)
  _seatGhost(key, site) {
    if (this._seated === UI.placing + ':' + (UI._placeGen || 0) || UI.placeDragging) return;
    const m = this.siteMark(site);
    if (!m) return;
    const x = Math.floor(m.x), y = Math.floor(m.y);
    let v = null;
    try { v = Bld.canPlace('P', key, x, y, { noCost: true, noSeal: true }); } catch (e) {}
    this._seated = UI.placing + ':' + (UI._placeGen || 0);
    if (!v || !v.ok) return;
    UI.placeGhost = { x, y, set: true };
    try { if (UI._placeCheck) UI._placeCheck(); } catch (e) {}
  },
  /* THE WAY INTO THE BUILD MENU: a villager in hand opens it from his panel; with
     anything else in hand (the hall, after a training) its panel's ✕ comes first —
     with a panel up the Build tab only folds that panel and the menu never opens
     (build 195: game 1's road beat rang the tab for good behind the hall's panel) */
  buildDoor() {
    if (this.vis('#panel [data-act="gobuild"]')) return { sel: '#panel [data-act="gobuild"]' };
    if (UI.sel && !this.selVil() && this.vis('#panelClose')) return { sel: '#panelClose' };
    if (this.vis('#bmToggle')) return { sel: '#bmToggle' };
    return null;
  },
  /* THE LINE CHAIN (a road, a wall): the Build tab → the card → the site
     itself, where one tap lays a stretch (a drag lays a longer one: UI's
     line drag, which takes no ✓) */
  lineRing(key, site) {
    return () => {
      if (UI.placing === key) return this.siteMark(site);
      const card = '.bbtn[data-key="' + key + '"]';
      if (this.vis(card)) return { sel: card };
      return this.buildDoor();
    };
  },
  hallRing(sel) {
    return () => {
      if (this.vis(sel)) return { sel };
      const tc = this.tc(); return tc ? { x: tc.x + 1, y: tc.y + 1, r: 1.4 } : null;
    };
  },
  yardRing(key, sel) {
    return () => {
      // the button on THIS yard's panel (another yard's Upgrade is no answer to this line)
      if (this.selBld(key) && this.vis(sel)) return { sel };
      const b = S.buildings.find(o => o.owner === 'P' && o.key === key && !(o.construction > 0));
      return b ? { x: Bld.cx(b), y: Bld.cy(b), r: 1.2 } : null;
    };
  },
  // what the hall's next storey still asks, in a few words ("Wood 40/100 · Food 12/50")
  /* the good the standing goal is shortest of (the beat held for its price,
     or the hall's next storey), by the share still missing */
  /* the price the standing goal asks: the beat's own (`cost`), the building
     it raises (`key`), the unit it trains (`unit`), or the hall's next storey.
     A villager's price is the HALL's (its train line): CFG.UNITS carries none,
     and reading it there left the train beat with no price at all (build 185:
     the line said berries while the ring pointed at the trees) */
  goalCost(b) {
    b = b || this.beat();
    const tc = this.tc();
    if (b && b.cost) return b.cost.call(this);
    if (b && b.key) return Bld.effCost('P', b.key);
    if (b && b.unit) return this.trainPrice(b.unit);
    if (tc && CFG.BUILDINGS.tc.levels[tc.level]) return CFG.BUILDINGS.tc.levels[tc.level].cost;
    return null;
  },
  // a unit's price at the hall, as Bld.canTrain asks it (an origin card's discount included)
  trainPrice(unit) {
    const tc = this.tc(), d = tc && Bld.def(tc.key), spec = d && d.train && d.train[unit];
    if (!spec) return null;
    return window.Cards && Cards.trainCost ? Cards.trainCost('P', unit, spec.cost) : spec.cost;
  },
  /* THE GOOD THE GUIDE NAMES — and the one its ring sends hands to (operator,
     build 185: "after it asked you to build a house it seems like it then says
     collect berries, but it points you to the wood so it's confusing"). The
     good the goal is shortest of, by the share still missing, KEPT while it is
     still short: two goods short by the same share used to trade places with
     every load home, the ring hopping between them under a line naming one.
     Once it is in, the next is chosen and the line naming it is said again
     (the view's key carries it: _goodKey). */
  need() {
    const b = this.beat(), cost = this.goalCost(b), s = this._needS;
    if (s && s.b === b && cost && cost[s.r] && (S.res[s.r] || 0) < cost[s.r]) return s.r;
    let best = null, bw = 0;
    for (const k of ['food', 'wood', 'stone']) {
      const c = cost && cost[k]; if (!c) continue;
      const w = 1 - Math.min(1, (S.res[k] || 0) / c);
      if (w > bw) { bw = w; best = k; }
    }
    if (best) { this._needS = { b, r: best }; return best; }
    // a goal with no price of its own the guide can read: the good the town holds least of
    return ['food', 'wood', 'stone'].reduce((a, k) => ((S.res[k] || 0) < (S.res[a] || 0) ? k : a), 'food');
  },
  // a line names the good it asks for: the view keeps it (its ring sends hands there)
  naming(r) { this._said = r; return r; },
  // what the standing goal asks of a good, in whole units (0 when it asks none)
  needOf(res) { const cost = this.goalCost(); return (cost && cost[res]) || 0; },
  /* an idle hand's work: the good the goal is shortest of, counting the hands
     already on each — so three idle hands spread over food, wood and stone
     rather than crowding one bush */
  spread(u) {
    const cost = this.goalCost();
    let best = null, bw = 0;
    for (const k of ['food', 'wood', 'stone']) {
      const c = cost && cost[k]; if (!c) continue;
      if (u && !this.workFor(u, k)) continue;   // a good across the water is no work for this hand
      const miss = 1 - Math.min(1, (S.res[k] || 0) / c);
      const w = miss / (1 + this.gatherers(k).length);
      if (w > bw) { bw = w; best = k; }
    }
    return best || this.need();
  },
  // the good a hand is gathering, or null
  resOf(u) {
    const t = u && u.task; if (!t || t.type !== 'gather') return null;
    const g = CFG.GATHER[S.map.terrain[t.y * CFG.W + t.x]];
    return g ? g.res : null;
  },
  onRes(u, res) { return this.resOf(u) === res; },
  gatherers(res) { return this.vils().filter(u => this.onRes(u, res)); },
  // the hand to move: the selected one, else the nearest gatherer of another good, else any villager
  // a hand at a works or a station stays there: the guide never pulls one off
  busy(u) { return !!(u && u.task && (u.task.type === 'build' || u.task.type === 'work' || u.task.type === 'claim')); },
  spareHand() {
    const need = this.need(), sel = this.selVil();
    if (sel && !this.busy(sel) && !this.onRes(sel, need) && this.workFor(sel, need)) return sel;
    let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (this.onRes(u, need) || this.busy(u)) continue;
      // only a hand that can reach the good (build 196: game 2's stone lies over the water)
      const t = this.workFor(u, need); if (!t) continue;
      const d = (u.x - t.x) ** 2 + (u.y - t.y) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  // the idle hand nearest the hall that can reach a good (the named one, else the goal's own)
  idleFor(res, not) {
    const tc = this.tc(); let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (u === not || !this.isIdle(u) || this.busy(u)) continue;
      const r = res || this.spread(u);
      if (!r || !this.workFor(u, r)) continue;
      const d = tc ? (u.x - Bld.cx(tc)) ** 2 + (u.y - Bld.cy(tc)) ** 2 : 0;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  /* the nearest tile of a good from a hand, on ground the player has seen — on the HOME
     SIDE of the town's own wall when that side holds any (operator, build 191: "this
     instruction sends someone to build north of the wall we just created (that's no good);
     redesign so we send them to one of the bushes inside the players territory") */
  workFor(u, res) {
    res = res || this.need();
    const W = CFG.W, H = CFG.H, ter = S.map.terrain, amt = S.map.resAmount, ex = S.map.explored;
    // never a tile the lesson keeps the hands off (Scenarios.mayGather): the ring would promise a refusal
    const may = window.Scenarios && Scenarios.mayGather ? Scenarios.mayGather.bind(Scenarios) : null;
    const home = this.homeSide();
    /* …and never across the water (build 196: game 2's stone lies on an islet the
       boat carries hands to): only a tile a hand can stand beside from where it is */
    const lab = this._mass(), um = this._massAt(lab, u.x, u.y);
    const reach = i => um < 0 || lab[i - 1] === um || lab[i + 1] === um || lab[i - W] === um || lab[i + W] === um;
    let best = null, bd = 1e9, near = null, nd = 1e9;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, g = CFG.GATHER[ter[i]];
      if (!g || g.res !== res || !(amt[i] > 0) || (ex && !ex[i])) continue;
      if (may && !may(x, y)) continue;
      if (!reach(i)) continue;
      const d = (x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2;
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
      if (home && d < nd && (home[i - 1] || home[i + 1] || home[i - W] || home[i + W])) { nd = d; near = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
    }
    return near || best;
  },
  /* THE LAND A HAND STANDS ON: every tile a villager could walk, labelled by its
     mass (4-connected) — kept until the day or the block grid moves */
  _mass() {
    const key = S.day + '|' + (Bld._blockGen | 0) + '|' + S.buildings.length;
    if (this._massK === key && this._massL && S === this._massS) return this._massL;
    const W = CFG.W, H = CFG.H, lab = new Int16Array(W * H).fill(-1);
    let n = 0;
    for (let y0 = 1; y0 < H - 1; y0++) for (let x0 = 1; x0 < W - 1; x0++) {
      const i0 = y0 * W + x0;
      if (lab[i0] >= 0 || !Path.passable(x0, y0, 'P')) continue;
      const q = [i0]; lab[i0] = n;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, j = ny * W + nx;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || lab[j] >= 0 || !Path.passable(nx, ny, 'P')) continue;
          lab[j] = n; q.push(j);
        }
      }
      n++;
    }
    this._massK = key; this._massL = lab; this._massS = S;
    return lab;
  },
  // the mass under a point (a building's tile has none: the nearest open tile round it)
  _massAt(lab, x, y) {
    const W = CFG.W, xi = x | 0, yi = y | 0;
    for (let r = 0; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = xi + dx, yy = yi + dy;
      if (xx < 1 || yy < 1 || xx >= CFG.W - 1 || yy >= CFG.H - 1) continue;
      const v = lab[yy * W + xx]; if (v >= 0) return v;
    }
    return -1;
  },
  /* THE HOME SIDE: the ground the hall's own people reach from its doorstep without
     passing the town's wall line — every wall and gate of the player's, built, rising or
     standing open, counts as the line. A tile of a good is on the home side when a hand
     can stand beside it there. Kept until the day, the block grid or the buildings move. */
  homeSide() {
    const tc = Bld.tcOf && Bld.tcOf('P'); if (!tc || !S.map) return null;
    const key = S.day + '|' + (Bld._blockGen | 0) + '|' + S.buildings.length + '|' + tc.id;
    if (this._homeK === key) return this._home;
    const W = CFG.W, H = CFG.H, open = new Uint8Array(W * H), line = new Uint8Array(W * H), q = [];
    for (const b of S.buildings) if (b.owner === 'P' && (b.key === 'wall' || b.key === 'gate')) {
      const sz = Bld.size(b); for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) line[(b.y + dy) * W + b.x + dx] = 1;
    }
    const push = (x, y) => {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
      const i = y * W + x;
      if (open[i] || line[i] || !Path.passable(x, y, 'P')) return;
      open[i] = 1; q.push(i);
    };
    const sz = Bld.size(tc);
    for (let dy = -1; dy <= sz; dy++) for (let dx = -1; dx <= sz; dx++) push(tc.x + dx, tc.y + dy);
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    this._homeK = key; this._home = q.length ? open : null;
    return this._home;
  },
  hallNeeds() {
    const tc = this.tc(); if (!tc) return '';
    const lv = CFG.BUILDINGS.tc.levels[tc.level]; if (!lv) return '';
    const cost = lv.cost || {}, out = [];
    const NM = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' };
    for (const k of ['food', 'wood', 'stone', 'gold']) if (cost[k]) out.push(NM[k] + ' ' + Math.min(cost[k], Math.floor(S.res[k] || 0)) + '/' + cost[k]);
    try {
      const rule = Bld.supportRule ? Bld.supportRule(tc) : null;
      if (rule && Bld.tcSupport) { const have = Bld.tcSupport(tc); if (have < rule.n) out.push('Buildings ' + have + '/' + rule.n); }
    } catch (e) {}
    return out.join(' · ');
  },
  costLine(key) { return this.priceLine(Bld.effCost('P', key)); },
  /* THE BERRY BUSH OF GAME 1 (build 190): what is left on it, and whether it
     is picked bare (its tile spent soil, the farm's ground) */
  bushTile() { const m = this.mark('berries'); return m ? (m.y | 0) * CFG.W + (m.x | 0) : -1; },
  bushLeft() { const i = this.bushTile(); return i >= 0 && S.map.terrain[i] === T.FERTILE ? Math.ceil(S.map.resAmount[i] || 0) : 0; },
  bare() { const i = this.bushTile(); return i < 0 || S.map.terrain[i] !== T.FERTILE; },
  // the farm beat's price: while the bush stands, the food still on it (the line names food); then the farm's
  farmCost() { return this.bare() ? Bld.effCost('P', 'farm') : { food: Math.floor(S.res.food || 0) + Math.max(1, this.bushLeft()) }; },
  // the deed and how far it has come: "Pick the berry bush: Food 33/40" (picked of what it held)
  /* THE GROVE AND THE ROCK (game 1, build 193): a mark's own tile, whether its good is
     spent (stumps, broken rock), what is still on it, and the words that ask for it */
  markIdx(name) { const m = this.mark(name); return m ? (m.y | 0) * CFG.W + (m.x | 0) : -1; },
  spent(name) { const i = this.markIdx(name); return i < 0 || !CFG.GATHER[S.map.terrain[i]]; },
  leftAt(name) { const i = this.markIdx(name); return i >= 0 && CFG.GATHER[S.map.terrain[i]] ? Math.ceil(S.map.resAmount[i] || 0) : 0; },
  // while the mark stands, its good still on it (the line names it); then the station's price
  spentCost(name, key) {
    if (this.spent(name)) return Bld.effCost('P', key);
    const i = this.markIdx(name), res = CFG.GATHER[S.map.terrain[i]].res;
    return { [res]: Math.floor(S.res[res] || 0) + Math.max(1, this.leftAt(name)) };
  },
  spentGoal(name, key, deed, build) {
    if (this.spent(name)) return this.buildGoal(key, build);
    const i = this.markIdx(name), had = Math.round((S.map.resMax && S.map.resMax[i]) || 0), left = this.leftAt(name);
    const res = CFG.GATHER[S.map.terrain[i]].res, NM = { wood: 'Wood', stone: 'Stone', food: 'Food' };
    return had > 0 ? deed + ': ' + NM[res] + ' ' + Math.max(0, Math.min(had, had - left)) + '/' + had : deed;
  },
  fellLine(coming) {
    this.naming('wood');
    return coming ? 'The last trees of the grove are falling. Keep chopping.' : 'Fell the last trees of the grove. A camp stands on the stumps.';
  },
  breakLine(coming) {
    this.naming('stone');
    return coming ? 'The rock is nearly broken. Keep at it.' : 'Break the last of the rock. A quarry stands where it was.';
  },
  // the player's finished station of a kind, and the hands working it
  station(key) { return S.buildings.find(b => b.owner === 'P' && b.key === key && !(b.construction > 0)) || null; },
  crew(key) { const b = this.station(key); return b ? Bld.workersAssigned(b) : 0; },
  stationView(key) { const b = this.station(key) || this.siteOf(key); return b ? { x: Bld.cx(b), y: Bld.cy(b), r: 0.6 } : null; },
  // the hall's rally set ON the station (Units.rallyPlan: a villager trained there works it)
  rallied(key) { const tc = this.tc(), b = this.station(key); return !!(tc && b && tc.rally && tc.rally.bid === b.id); },
  /* the rally's three taps: the hall, its Set rally chip, the station — the last while
     the hall's rally waits for its tap (UI.settingRally) */
  rallyRing(key) {
    const tc = this.tc(), b = this.station(key);
    if (!tc || !b) return null;
    if (UI.settingRally === tc.id) return { x: Bld.cx(b), y: Bld.cy(b), r: 0.9 };
    return this.hallRing('#panel .pchip[data-act="rally"]')();
  },
  // a second villager: one more than the first lesson trained, or one in the hall's queue
  trained2() { const tc = this.tc(); return this.vils().length > this._n0 + 1 || !!(tc && tc.queue && tc.queue.some(q => q.unit === 'villager')); },
  /* the tip's moment (game 1's hall gathering): a villager can be trained now (its
     price, a free place, the hall's queue), none is already on the way, and the
     food left after it still covers the hall's own — the tip never delays the hall */
  spareHands() {
    const tc = this.tc(); if (!tc || tc.upgrading > 0 || !this.afford2('villager')) return false;
    if (tc.queue && tc.queue.some(q => q.unit === 'villager')) return false;
    const price = this.trainPrice('villager') || {}, lv = CFG.BUILDINGS.tc.levels[tc.level], hall = (lv && lv.cost) || {};
    return (S.res.food || 0) - (price.food || 0) >= (hall.food || 0);
  },
  /* the tip's words (build 199): train, and where to send them — the goods the hall
     is still short of, the scarcest first ("stone and wood"); never food, which the
     tip asks for only when there is food to spare */
  tipLine() {
    const c = this.goalCost() || {}, have = k => S.res[k] || 0;
    const short = Object.keys(c).filter(k => k !== 'food' && (c[k] || 0) > have(k))
      .sort((a, b) => (c[b] - have(b)) / c[b] - (c[a] - have(a)) / c[a]);
    const goods = !short.length ? 'wood and stone' : short.length === 1 ? short[0] : short.slice(0, -1).join(', ') + ' and ' + short[short.length - 1];
    return 'Train more villagers and send them for ' + goods + ', to raise our hall.';
  },
  trained3() { const tc = this.tc(); return this.vils().length > this._n0 + 2 || !!(tc && tc.queue && tc.queue.some(q => q.unit === 'villager')); },
  farmGoal() {
    if (this.bare()) return this.buildGoal('farm', 'Build a farm');
    const i = this.bushTile(), had = Math.round((S.map.resMax && S.map.resMax[i]) || 0), left = this.bushLeft();
    return had > 0 ? 'Pick the berry bush: Food ' + Math.max(0, Math.min(had, had - left)) + '/' + had : 'Pick the berry bush bare';
  },
  pickLine(coming) {
    this.naming('food');
    return coming ? 'The berry bush is nearly bare. Keep picking.' : 'Pick the berry bush bare. A farm can grow there.';
  },
  // the train beat held: why a villager, and what to gather for one (naming the good, so the ring agrees)
  trainLine(coming) {
    const r = this.naming(this.need());
    return coming ? 'More hands gather more. The ' + r + ' for a new villager is coming in.'
      : 'Next, gather ' + r + ' at ' + (this.WHERE[r] || 'the hills') + ' to train a new villager.';
  },
  // the newest villager, where the newcomer beat looks
  newcomerView() {
    let u = null; for (const x of this.vils()) if (!u || x.id > u.id) u = x;
    return u ? { x: u.x, y: u.y, r: 0.5 } : this.homeView();
  },
  // the house and the farm side by side: the view the bond is said over
  homeView() {
    const h = S.buildings.find(b => b.owner === 'P' && b.key === 'house'), f = S.buildings.find(b => b.owner === 'P' && b.key === 'farm');
    if (!h || !f) return f ? { x: Bld.cx(f), y: Bld.cy(f), r: 0.5 } : null;
    return { x: (Bld.cx(h) + Bld.cx(f)) / 2, y: (Bld.cy(h) + Bld.cy(f)) / 2, r: 0.5 };
  },
  // the deed, and while it is short the goods it waits on: "Build a house: Wood 20/30"
  buildGoal(key, deed) { return this.afford(key) ? deed : deed + ': ' + this.costLine(key); },
  // a price as the tracker says it ("Food 30/50 · Wood 5/30")
  priceLine(c) {
    c = c || {};
    const NM = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' }, out = [];
    for (const k of ['food', 'wood', 'stone', 'gold']) if (c[k]) out.push(NM[k] + ' ' + Math.min(c[k], Math.floor(S.res[k] || 0)) + '/' + c[k]);
    return out.join(' · ');
  },
  afford(key) { return Bld.canAfford(Bld.effCost('P', key), S.res); },

  /* Each beat: { id, face, text, goal, key, unit, when, hold, ack, site, wait, done, praise, auto, ring, taps, on, unlocks, skipIf }
       text   the guide's line (≤ 12 words, one instruction: a praise of ≤ 3 goes before it)
       goal   the tracker's objective (a string or a function), while the beat stands
       key    the building the beat raises / unit  the unit it trains: its price
              is the goal a `hold` line is short of (goalCost) — never the hall's
       when   the beat is HELD until this is true — and while it is, the `hold`
              line says what to do about it (the good it is short of), ringing
              the hand to move and then its work (gatherRing): never silence
       ack    the ORDER the line asks for has been given: the ring leaves its
              target that frame, and the beat waits on the world (`wait`, a line
              of what is happening now) — or, a `site` with nobody at it, asks
              for the hands to raise it (`hands` of them, the builder chain)
       done   the beat's result: the next line is said in the same tick
       praise words said before the NEXT line (the deed answered at once; the
              old three-second "well done" lines held the next instruction back)
       auto   a line shown this many ms, then the next beat (the last word only)
       ring   the pulse's target: {x,y,r} tile-centred | {u:id} | {sel:'css'}
       taps   the idle hand's taps, in order (same shapes)
       on     done once, when the beat is first asked (an unlock, a raid)
       unlocks a card opened when the beat is done, said or passed over
       skipIf a beat with nothing to teach on this device is passed over
     THE GUIDE ANSWERS A TAP IN THE FRAME IT LANDS (operator, build 181: "the
     next thing … can take between two and three seconds to pop up … shoot
     for a second at Max"): every line follows the ORDER, never its result. */
  SCRIPTS: {
    1() {
      const P = this;
      return [
        { id: 'open', face: 'point', text: "We've arrived in an untamed world. Send people for food so we don't go hungry.",
          goal: 'Gather berries', ring: P.sendTo('berries'), taps: P.sendTaps('berries'),
          done: () => P.ordered('food'), praise: 'Good!' },
        { id: 'wood', face: 'pleased', text: 'Berries for tonight. Now send someone to cut wood.',
          goal: 'Cut wood', ring: P.sendTo('forest'), taps: P.sendTaps('forest'),
          done: () => P.ordered('wood'), praise: 'Good, strong timber!' },
        { id: 'stone', face: 'point', text: 'Now send someone to the grey rocks for stone.',
          goal: 'Gather stone', ring: P.sendTo('stone'), taps: P.sendTaps('stone'),
          done: () => P.ordered('stone'), praise: 'Good stone!' },
        { id: 'house', face: 'point', text: 'A house shelters our people. Build one beside the berry bush.', key: 'house',
          goal: () => P.buildGoal('house', 'Build a house'),
          when: () => P.afford('house') || P.has('house'), hold: (c) => P.needLine('A house', null, c),
          on: () => Scenarios.unlock('house'),
          ring: P.buildRing('house', 'houseSite'), taps: () => { const r = P.buildRing('house', 'houseSite')(); return r ? [r] : []; },
          ack: () => P.has('house'), site: () => P.siteOf('house'), wait: 'The house is going up.',
          done: () => P.has('house', true), praise: 'A home!' },
        /* THE BUSH, THE FARM AND THE HOME (operator, build 190: "build a farm
           after exhausting the berry bush … a house next to the berry bush
           that was picked … teach them about berries, a farm, and the benefits
           of building a home next to the farm"): the bush is picked bare, its
           soil takes the farm beside the house, and the two bond. Held until the bush is bare — the line says to
           pick it — and then until the wood is in. Before the villager is
           trained: the clan eats every day, and the farm (and the bushes
           round it, open once it stands) feed the newcomer; the bond's
           extra room is where the newcomer sleeps */
        { id: 'farm', face: 'point', text: 'The bush is picked bare. Build a farm on its soil.', key: 'farm',
          cost: () => P.farmCost(), goal: () => P.farmGoal(),
          when: () => (P.bare() && P.afford('farm')) || P.has('farm'),
          hold: (c) => P.bare() ? P.needLine('A farm', null, c) : P.pickLine(c),
          on: () => Scenarios.unlock('farm'),
          ring: P.buildRing('farm', 'berries'), taps: () => { const r = P.buildRing('farm', 'berries')(); return r ? [r] : []; },
          ack: () => P.has('farm'), site: () => P.siteOf('farm'), wait: 'The farm is going up.',
          done: () => P.has('farm', true) },
        /* WHAT THE HOMESTEAD GIVES, IN NUMBERS (operator, build 191: "explain what the
           player gets by building a house next to a farm. Make the dazzle a little more
           noticeable"): the food and people chips flutter big */
        { id: 'bond', face: 'excited', text: 'Beside a home, a farm grows 10% more food. The home fits one more villager.', auto: 7000,
          goal: 'Farm + home: more food, more room', look: () => P.homeView(),
          on: () => { P.flutter('food', true); P.flutter('pop', true); } },
        /* WHY WE TRAIN (operator, build 191: "Next we must collect more food so we can
           expand and add more villagers … Make why we create villagers more obvious") */
        { id: 'train', face: 'point', text: 'More hands gather more. Train a new villager at the hall.', unit: 'villager',
          goal: () => 'Train a villager' + (P.afford2('villager') ? '' : ': ' + P.priceLine(P.trainPrice('villager'))),
          when: () => P.afford2('villager') || P.trained(), hold: (c) => P.trainLine(c),
          ring: P.hallRing('#panel [data-act="train"][data-unit="villager"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="train"][data-unit="villager"]')(); return r ? [r] : []; },
          ack: () => P.trained(), wait: 'A new villager is on the way.',
          done: () => P.vils().length > P._n0 },
        /* THE NEWCOMER IS MET (operator, build 191: "when the villager was created the game
           skipped right to 'Raise the hall!' Give Mira a happy look and say, 'A new villager
           joins our clan.'"): a beat of its own before the next instruction */
        { id: 'newcomer', face: 'excited', text: 'A new villager joins our clan! More hands for food, wood and stone.', auto: 5600,
          goal: 'A new villager', look: () => P.newcomerView() },
        /* STATIONS THAT NEVER RUN OUT, AND THE RALLY THAT FILLS THEM (operator, build 193:
           "Have the player create a second villager … teach them how to use the move / set
           rally button to have a villager automatically start traveling to and collecting
           resources when they're created at the Town Center … the creation of a wood
           chopping station and an ore mining station and show the player putting up to two
           villagers on one of those stations … the stations will allow them to collect
           resources much faster and they don't expire which leaves people stranded after
           they chopped down a grove or a berry bush"). The grove Mira named is felled to its
           stumps (its woodcutter left standing idle) and a lumber camp raised there; the
           hall's rally is set on the camp, and the villager trained next walks there and
           works it — two to the camp; then the rock is broken bare and a quarry raised on it.
           The stand round each opens to hand-gathering once its station stands
           (Scenarios.RULES.prologue_1.strict), and game 1's stations outwork a hand
           (CFG.MODES.prologue_1.output), so what Mira says of them is true here */
        { id: 'lumber', face: 'thinking', text: 'Groves run out and leave hands idle. A lumber camp never does. Build one here.', key: 'lumber',
          cost: () => P.spentCost('forest', 'lumber'), goal: () => P.spentGoal('forest', 'lumber', 'Fell the grove', 'Build a lumber camp'),
          when: () => (P.spent('forest') && P.afford('lumber')) || P.has('lumber'),
          hold: (c) => P.spent('forest') ? P.needLine('A lumber camp', null, c) : P.fellLine(c),
          on: () => Scenarios.unlock('lumber'),
          ring: P.buildRing('lumber', 'forest'), taps: () => { const r = P.buildRing('lumber', 'forest')(); return r ? [r] : []; },
          ack: () => P.has('lumber'), site: () => P.siteOf('lumber'), wait: 'The lumber camp is going up.',
          done: () => P.has('lumber', true), praise: 'A lumber camp!' },
        { id: 'rally', face: 'point', text: 'Tap the hall, then Set rally, then the camp. New villagers go straight there.',
          goal: 'Set the hall\'s rally on the camp',
          ring: () => P.rallyRing('lumber'), taps: () => { const r = P.rallyRing('lumber'); return r ? [r] : []; },
          done: () => P.rallied('lumber'), praise: 'Good.' },
        { id: 'train2', face: 'point', text: 'Now train a villager. They walk to the camp and start chopping.', unit: 'villager',
          goal: () => 'Train a villager' + (P.afford2('villager') ? '' : ': ' + P.priceLine(P.trainPrice('villager'))),
          when: () => P.afford2('villager') || P.trained2(), hold: (c) => P.trainLine(c),
          ring: P.hallRing('#panel [data-act="train"][data-unit="villager"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="train"][data-unit="villager"]')(); return r ? [r] : []; },
          ack: () => P.trained2(), wait: 'The new villager is on the way to the camp.',
          done: () => P.crew('lumber') >= 2, look: () => P.stationView('lumber') },
        { id: 'stations', face: 'excited', text: 'Two at the camp! A station works faster than hands, and never runs out.', auto: 6400,
          goal: 'Two at the lumber camp', look: () => P.stationView('lumber'), on: () => P.flutter('wood', true) },
        { id: 'quarry', face: 'point', text: 'Now a quarry where you broke the rock. It never runs out either.', key: 'quarry',
          cost: () => P.spentCost('stone', 'quarry'), goal: () => P.spentGoal('stone', 'quarry', 'Break the rock', 'Build a quarry'),
          when: () => (P.spent('stone') && P.afford('quarry')) || P.has('quarry'),
          hold: (c) => P.spent('stone') ? P.needLine('A quarry', null, c) : P.breakLine(c),
          on: () => Scenarios.unlock('quarry'),
          ring: P.buildRing('quarry', 'stone'), taps: () => { const r = P.buildRing('quarry', 'stone')(); return r ? [r] : []; },
          ack: () => P.has('quarry'), site: () => P.siteOf('quarry'), wait: 'The quarry is going up.',
          done: () => P.has('quarry', true), praise: 'A quarry!' },
        /* …and the rally MOVED there (operator: "the move / set rally button"): the hall's
           chip reads Move rally once a rally stands, and the next villager works the quarry */
        { id: 'rally2', face: 'point', text: 'Tap the hall, then Move rally, then the quarry.',
          goal: 'Move the hall\'s rally to the quarry',
          ring: () => P.rallyRing('quarry'), taps: () => { const r = P.rallyRing('quarry'); return r ? [r] : []; },
          done: () => P.rallied('quarry'), praise: 'Good.' },
        { id: 'train3', face: 'point', text: 'Train one more villager. They go straight to the quarry.', unit: 'villager',
          goal: () => 'Train a villager' + (P.afford2('villager') ? '' : ': ' + P.priceLine(P.trainPrice('villager'))),
          when: () => P.afford2('villager') || P.trained3(), hold: (c) => P.trainLine(c),
          ring: P.hallRing('#panel [data-act="train"][data-unit="villager"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="train"][data-unit="villager"]')(); return r ? [r] : []; },
          ack: () => P.trained3(), wait: 'The new villager is on the way to the quarry.',
          done: () => P.crew('quarry') >= 2, look: () => P.stationView('quarry'), praise: 'Both stations full!' },
        /* THE WAIT IS SPENT ON ROADS AND THE HUNT (operator, build 195: "Teach the player
           about roads while the villagers are collecting resources (pull that back from
           game 2). We need to fill some of the time while the villagers collect resources.
           Do the same with the hunting hut … most key basic economics and movement which
           also gives a resource bump"): the hall is named, and while the stations bring
           its price in a road is laid beside the lumber camp (a building on a road works
           10% better: the camp's twinkle and its gold line say so), a deer is hunted and a
           hunter's lodge raised where it fell */
        { id: 'hallnext', face: 'thinking', text: 'Next, a bigger hall. Our stations will gather what it needs.', auto: 5600,
          goal: () => 'Raise the hall: ' + P.hallNeeds(), look: () => P.stationView('lumber') },
        /* …and the road JOINS the village (operator, build 199: "we don't want them to just
           stick a single individual road in front of the town center … have the road stretch
           between two or three locations cause then we also teach the player how to click and
           drag"): one drag from the lumber camp's door, past the hall's, to the farm's — a ring
           at each end, gold dashes between and the hand sliding from one to the other (roadRing),
           every stretch of it on that line (Scenarios.RULES.prologue_1.strict.sites.road) */
        { id: 'road', face: 'point', text: 'While they work, drag a road from the camp past the hall to the farm.', key: 'road',
          goal: () => 'Lay a road' + (Bld.canAfford(P.roadCost(), S.res) ? '' : ': ' + P.priceLine(P.roadCost())),
          cost: () => P.roadCost(),
          when: () => Bld.canAfford(P.roadCost(), S.res) || P.roadLeft().length < P.roadLine().length, hold: (c) => P.needLine('The road', null, c),
          on: () => Scenarios.unlock('road'),
          ring: () => P.roadRing(), taps: () => { const r = P.roadRing(); return r ? [r] : []; },
          ack: () => P.roadLaid(), site: () => P.siteOf('road'), wait: 'The road is going down.',
          done: () => P.roadPaved(), praise: 'A fine road!' },
        { id: 'roadboost', face: 'excited', text: 'The camp and the hall now work 10% faster. People walk faster on roads.', auto: 6400,
          goal: 'Roads: faster work, faster feet', look: () => P.stationView('lumber'), on: () => P.flutter('wood', true) },
        { id: 'hunt', face: 'point', text: 'A deer grazes nearby. Send someone to hunt it.',
          goal: 'Hunt a deer', ring: () => P.huntRing(), taps: () => P.huntTaps(),
          ack: () => P.hunting() || P.killed(), wait: 'The hunt is on.',
          done: () => P.killed(), praise: 'Fresh meat!' },
        { id: 'lodge', face: 'point', text: "Build a hunter's lodge where the deer fell. It brings food for good.", key: 'lodge',
          goal: () => P.buildGoal('lodge', "Build a hunter's lodge"),
          when: () => P.afford('lodge') || P.has('lodge'), hold: (c) => P.needLine("A hunter's lodge", null, c),
          on: () => Scenarios.unlock('lodge'),
          ring: P.buildRing('lodge', () => P.huntSpot()), taps: () => { const r = P.buildRing('lodge', () => P.huntSpot())(); return r ? [r] : []; },
          ack: () => P.has('lodge'), site: () => P.siteOf('lodge'), wait: "The hunter's lodge is going up.",
          done: () => P.raised('lodge'), praise: 'A lodge!' },
        /* MORE HANDS GATHER FASTER (operator, build 194, on the hall's long wait at
           221/650 wood with 864 food banked: "Give a tip here that the player should
           create more villagers to collect resources faster"): while every hand is at
           work and food is to spare, the waiting line is the tip, ringing the hall's
           Train Villager; the villager it brings stands by the full quarry and the
           gather line sends them out — and the tip comes back until the houses are full.
           It says WHERE they go (operator, build 199: "it has you placed them on the
           quarry and you already have two people on the quarry … create more villagers
           and send them to collect ore and wood so that you can upgrade your town
           center"): to the goods the hall is still short of (tipLine) */
        { id: 'grow', face: 'thinking', text: 'The hall needs more yet. Gather the food, wood and stone.', gather: true,
          gwait: () => 'Our hall must grow. The ' + P.naming(P.need()) + ' is coming in.',
          tip: { when: () => P.spareHands(), face: 'excited', text: () => P.tipLine(),
            ring: P.hallRing('#panel [data-act="train"][data-unit="villager"]') },
          goal: () => 'Raise the hall: ' + P.hallNeeds(), ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); },
          praise: 'We have enough!' },
        // an upgrade rises only with hands on it (the game's rule): the guide sends them
        { id: 'raise', face: 'excited', text: 'Tap the hall, then Upgrade. A bigger hall, a stronger clan.',
          goal: 'Raise the hall', ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="upgrade"]')(); return r ? [r] : []; },
          ack: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0); },
          // one builder (build 193): every other hand stands at a station by now, and the guide never empties one
          site: () => P.tcWorks(), hands: 1, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'Everyone helps. The hall is rising.', waitFace: 'proud',
          done: () => { const tc = P.tc(); return !!tc && tc.level >= 2; } },
      ];
    },
    2() {
      const P = this;
      const R1 = r => (r ? [r] : []);
      return [
        /* THE LAKE ISLES (build 196: "Take what we learned in game one and audit game two
           … roughly 10 minutes … the dock … the map … water and mountains as a natural
           defense, berries and wood"). The clan's home island: the map that shows it, the
           ground that guards it, a card, the soldiers, the tower and the wall; then the dock
           — a boat to fish, a transport to carry hands to the isle where the stone and the
           gold lie — and the hall's third storey, raised on that stone. More room than game
           1 (SPACE[2]): a line's ring waits a few seconds for the player to find the way. */
        { id: 'welcome', face: 'pleased', text: () => 'Welcome back, ' + P.hail() + '. Our clan has grown on these lake isles.', auto: 5200,
          goal: 'The Growing Clan' },
        /* THE MAP (build 196: "We want to teach about the map"): open it, carry the view to
           the isle by a tap on it, come home the same way, fold it away */
        { id: 'map', face: 'point', hint: 'new', text: 'Tap the map button at the top to see all our land.',
          goal: 'Open the map', ring: () => P.mapRing(), taps: () => R1(P.mapRing()),
          done: () => P.miniOpen(), praise: 'Our whole land!' },
        { id: 'mapjump', face: 'point', hint: 'new', text: 'Tap the small isle to the east on the map. The view flies there.',
          goal: 'Look at the isle', ring: () => P.miniRing('islet'), taps: () => R1(P.miniRing('islet')),
          done: () => P.camNear(P.mark('islet'), 6), praise: 'There it is!' },
        { id: 'islet', face: 'excited', text: 'Stone and gold lie on that isle. Our next hall needs them.', auto: 5600,
          goal: 'The isle: stone and gold' },
        { id: 'maphome', face: 'point', text: 'Now tap our village on the map to come home.',
          goal: 'Back home', ring: () => P.miniRing(P.hallMark()), taps: () => R1(P.miniRing(P.hallMark())),
          done: () => P.camNear(P.hallMark(), 7), praise: 'Home again.' },
        { id: 'mapfold', face: 'pleased', text: 'Tap the map button again to fold it. Open it whenever you like.',
          goal: 'Fold the map', ring: () => (P.miniOpen() && P.vis('#mapBtn') ? { sel: '#mapBtn' } : null),
          taps: () => (P.miniOpen() && P.vis('#mapBtn') ? [{ sel: '#mapBtn' }] : []),
          done: () => !P.miniOpen() },
        /* THE LAND ITSELF IS A DEFENCE (build 196: "using water and mountains as a natural
           defense, berries and wood or defenses as well"): each said over its own ground —
           every tile named here blocks a raider's feet (Path.blocksLand) */
        { id: 'nature', face: 'thinking', text: 'Water and mountains guard our isle. No raider can cross them.', auto: 6000,
          goal: 'Water and mountains guard us', look: () => P.mark('mtn') },
        { id: 'nature2', face: 'thinking', text: 'Thick woods and berry bushes block the way too. Only the land bridge is open.', auto: 6400,
          goal: 'Only the land bridge is open', look: () => P.mark('bridge') },
        /* CARDS, SAID PLAINLY (build 196: "make sure that that is sort of well explained"):
           what a card is, then one played where its work is seen (Master Builders, game 1's
           prize: the barracks, the range and the tower stand the moment they are placed) */
        { id: 'cards', face: 'pleased', text: 'Cards are gifts our wins bring. Each one helps once, then it is spent.', auto: 6400,
          goal: 'Cards', skipIf: () => !P.deckOn(), on: () => { P._deckOpen = true; } },
        { id: 'deck', face: 'point',
          text: () => P.holds('master_builders') ? 'Play Master Builders now: our next buildings stand at once.' : 'Tap your deck and play a card.',
          goal: () => P.holds('master_builders') ? 'Play Master Builders' : 'Play a card',
          skipIf: () => !P.deckOn(),
          on: () => { P._deckOpen = true; },
          ring: () => P.deckRing(), taps: () => R1(P.deckRing()),
          // the card's own act answers the Play; the next line comes the moment it is over
          ack: () => P.played(),
          done: () => P.played() && !(window.Deck && Deck.acting && Deck.acting()), praise: 'Well played!' },
        /* WHY A BARRACKS (build 191): a short warning of its own, then the instruction */
        { id: 'danger', face: 'concerned', text: 'Dangerous times. Wolves, raiders, or the clan that burned us may strike.', auto: 5200,
          goal: 'Dangerous times' },
        { id: 'barracks', face: 'determined', text: 'So we need soldiers. Build a barracks to train them.', key: 'barracks',
          goal: () => P.buildGoal('barracks', 'Build a barracks'),
          when: () => P.afford('barracks') || P.has('barracks'), hold: (c) => P.needLine('A barracks', null, c),
          on: () => Scenarios.unlock('barracks'), look: () => P.mark('barracksSite'),
          ring: P.buildRing('barracks', 'barracksSite'), taps: () => R1(P.buildRing('barracks', 'barracksSite')()),
          ack: () => P.has('barracks'), site: () => P.siteOf('barracks'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The barracks is going up.',
          done: () => P.has('barracks', true), praise: 'A barracks, and its first soldier!' },
        { id: 'range', face: 'point', text: 'Archers guard our towers. Build an archery range.', key: 'range',
          goal: () => P.buildGoal('range', 'Build an archery range'),
          when: () => P.afford('range') || P.has('range'), hold: (c) => P.needLine('An archery range', null, c),
          on: () => Scenarios.unlock('range'), look: () => P.mark('rangeSite'),
          ring: P.buildRing('range', 'rangeSite'), taps: () => R1(P.buildRing('range', 'rangeSite')()),
          ack: () => P.has('range'), site: () => P.siteOf('range'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The range is going up.',
          done: () => P.has('range', true), praise: 'A range, and its first archer!' },
        { id: 'tower', face: 'point', text: 'Build a watchtower on the neck of the land bridge.', key: 'tower',
          goal: () => P.buildGoal('tower', 'Build a watchtower'),
          when: () => P.afford('tower') || P.has('tower'), hold: (c) => P.needLine('A tower', null, c),
          on: () => Scenarios.unlock('tower'), look: () => P.mark('towerSite'),
          ring: P.buildRing('tower', 'towerSite'), taps: () => R1(P.buildRing('tower', 'towerSite')()),
          ack: () => P.has('tower'), site: () => P.siteOf('tower'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The tower is going up.',
          done: () => P.has('tower', true), praise: 'A tower!' },
        // the tower shoots only through the bows posted on it (the game's rule since build 148)
        { id: 'man', face: 'point', text: 'A tower shoots only with archers on it. Send your archer up.',
          goal: 'Send the archer up the tower',
          when: () => P.has('tower', true) && !!(P.bow() || P.manned()),
          ring: () => P.manRing(), taps: () => P.manTaps(),
          done: () => P.manned(), praise: 'Sharp eyes up there!' },
        /* THE WALL, THE SCOUT AND THE GATE (build 187): three sections across the land
           bridge, one beside the other; a scout of the wild country shot down from the
           tower; the damage mended; a gate cut into the line, and opened */
        { id: 'wall', face: 'point', text: 'Walls keep raiders out. Build one on the land bridge.', key: 'wall',
          goal: () => P.wallGoal(),
          when: () => P.afford('wall') || P.laidOnLine() >= 1, hold: (c) => P.needLine('A wall', null, c),
          on: () => Scenarios.unlock('wall'), look: () => P.mark('wall2'),
          ring: P.lineRing('wall', () => P.nextLineTile()), taps: () => R1(P.lineRing('wall', () => P.nextLineTile())()),
          ack: () => P.laidOnLine() >= 1, site: () => P.lineSite(),
          done: () => (P.laidOnLine() >= 1 || P.lineDone()) && !P.lineSite(), praise: () => P.lineDone() ? 'The bridge is closed!' : 'Good!' },
        { id: 'wall2', face: 'point', text: 'Now build another right beside it.', key: 'wall',
          goal: () => P.wallGoal(),
          when: () => P.afford('wall') || P.laidOnLine() >= 2, hold: (c) => P.needLine('A wall', null, c),
          ring: P.lineRing('wall', () => P.nextLineTile()), taps: () => R1(P.lineRing('wall', () => P.nextLineTile())()),
          ack: () => P.laidOnLine() >= 2, site: () => P.lineSite(),
          done: () => (P.laidOnLine() >= 2 || P.lineDone()) && !P.lineSite(), praise: () => P.lineDone() ? 'The bridge is closed!' : 'Good!' },
        { id: 'wall3', face: 'point', text: 'And one more to close the bridge.', key: 'wall',
          goal: () => P.wallGoal(),
          skipIf: () => P.lineNeed() < 3,
          when: () => P.afford('wall') || P.laidOnLine() >= 3, hold: (c) => P.needLine('A wall', null, c),
          ring: P.lineRing('wall', () => P.nextLineTile()), taps: () => R1(P.lineRing('wall', () => P.nextLineTile())()),
          ack: () => P.laidOnLine() >= 3, site: () => P.lineSite(), wait: 'The wall is going up.',
          done: () => P.lineDone(), praise: 'The bridge is closed!' },
        // shown, never asked: no ring and no hand — the view on the wall while the archer shoots
        { id: 'scout', face: 'surprised', text: 'A scout comes! Watch our archer on the tower.',
          goal: 'Watch the tower',
          on: () => P.sendScout(), look: () => P.wallView(),
          done: () => P.scoutDone(), praise: () => 'The wall held, ' + P.hail() + '!' },
        { id: 'mend', face: 'point', text: 'Mend the damaged wall: tap a villager, then the wall.',
          goal: 'Mend the wall', skipIf: () => !P.hurtFort(),
          ring: () => P.handsRing({ site: () => P.hurtFort() }), taps: () => P.handsTaps({ site: () => P.hurtFort() }),
          ack: () => { const w = P.hurtFort(); return !w || P.builders(w).length > 0; }, wait: 'The wall is being mended.',
          done: () => !P.hurtFort(), praise: 'Good as new!' },
        { id: 'gate', face: 'point', text: 'A gate opens for us, never raiders. Build one in the wall.',
          goal: () => P.gateGoal(), cost: () => P.gateCost(),
          when: () => P.canGate() || !!P.gateOnLine(), hold: (c) => P.needLine('A gate', null, c),
          ring: () => P.gateRing(), taps: () => R1(P.gateRing()),
          ack: () => !!P.gateOnLine(), site: () => P.gateSite(), wait: 'The gate is going up.',
          done: () => { const g = P.gateOnLine(); return !!g && !(g.construction > 0); }, praise: 'Well built!' },
        { id: 'opengate', face: 'point', text: 'Gates start shut. Tap the gate and open it.',
          goal: 'Open the gate',
          ring: () => P.openRing(), taps: () => R1(P.openRing()),
          done: () => { const g = P.gateOnLine(); return !!g && !(g.construction > 0) && !g.raised; }, praise: 'Our people pass freely!' },
        /* THE DOCK (build 196: "you'll really need to spend some time on teaching the player
           the dock cause that's very important"): the dock on the shore that faces the isle;
           a fishing boat sent out (food from the water); a transport, two villagers aboard,
           the crossing and the landing; the isle's gold seam claimed and its stone broken */
        { id: 'dock', face: 'point', text: 'A dock puts boats on the water. Build one on the east shore.', key: 'dock',
          goal: () => P.buildGoal('dock', 'Build a dock'),
          when: () => P.afford('dock') || P.has('dock'), hold: (c) => P.needLine('A dock', null, c),
          on: () => Scenarios.unlock('dock'), look: () => P.mark('dockSite'),
          ring: P.buildRing('dock', 'dockSite'), taps: () => R1(P.buildRing('dock', 'dockSite')()),
          ack: () => P.has('dock'), site: () => P.siteOf('dock'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The dock is going up.',
          done: () => P.has('dock', true), praise: 'A dock!' },
        { id: 'fishboat', face: 'point', text: 'Boats catch fish for food. Train a fishing boat at the dock.',
          cost: () => P.priceAt('dock', 'fishboat'), goal: () => P.trainGoal('dock', 'fishboat', 'Train a fishing boat'),
          when: () => P.canTrainAt('dock', 'fishboat') || P.coming('dock', 'fishboat') > 0,
          hold: (c) => P.needLine('A boat', null, c), look: () => P.bldView('dock'),
          ring: P.yardRing('dock', '#panel [data-act="train"][data-unit="fishboat"]'),
          taps: () => R1(P.yardRing('dock', '#panel [data-act="train"][data-unit="fishboat"]')()),
          ack: () => P.coming('dock', 'fishboat') > 0, wait: 'The boat is nearly built.',
          done: () => P.units('fishboat').length > 0, praise: 'A boat!' },
        /* ANY water (operator, build 199: "it says to tap the leaping fish … people are gonna
           look for leaping fish … you can tap anywhere in the water and the boat will go and
           start fishing"): a boat fishes any water with fish in it (Units.assignFish slides to
           the nearest free shoal), so the line asks for a spot in the water; the ring still
           offers one, beside the authored shoal (fishSpot) */
        { id: 'fish', face: 'point', text: 'Select the boat, then tap a spot in the water to start fishing.',
          goal: 'Send the boat fishing', ring: () => P.fishRing(), taps: () => P.fishTaps(),
          done: () => P.units('fishboat').some(u => u.task && u.task.type === 'fish'), praise: 'Fresh fish for the clan!' },
        { id: 'transport', face: 'thinking', text: 'Now a transport. It carries our people across the water.',
          cost: () => P.priceAt('dock', 'transport'), goal: () => P.trainGoal('dock', 'transport', 'Train a transport'),
          when: () => P.canTrainAt('dock', 'transport') || P.coming('dock', 'transport') > 0,
          hold: (c) => P.needLine('A transport', null, c), look: () => P.bldView('dock'),
          ring: P.yardRing('dock', '#panel [data-act="train"][data-unit="transport"]'),
          taps: () => R1(P.yardRing('dock', '#panel [data-act="train"][data-unit="transport"]')()),
          ack: () => P.coming('dock', 'transport') > 0, wait: 'The transport is nearly built.',
          done: () => P.units('transport').length > 0, praise: 'A transport!' },
        { id: 'board', face: 'point', text: 'Select a villager, then tap the transport. Send two aboard.',
          goal: () => 'Aboard ' + Math.min(2, P.aboard(true)) + '/2', ring: () => P.boardRing(), taps: () => P.boardTaps(),
          ack: () => P.aboard(true) >= 2, wait: 'They are going aboard.',
          done: () => P.aboard() >= 2 || P.onIsle() > 0, praise: 'All aboard!' },
        { id: 'sail', face: 'point', text: 'Now select the transport and tap the isle. It lands them there.',
          goal: 'Sail to the isle', ring: () => P.sailRing(), taps: () => P.sailTaps(),
          ack: () => P.sailing(), wait: 'Sailing for the isle.',
          done: () => P.onIsle() > 0, praise: 'Landed!' },
        // a seam is claimed, never built: a hand walks onto it and the works go up round them
        { id: 'claim', face: 'point', text: 'Send a villager to claim the gold seam. A mine rises there.',
          goal: 'Claim the gold seam', ring: () => P.isleSend('gold'), taps: () => P.isleTaps('gold'),
          done: () => P.claiming() || P.has('mine'), praise: 'Gold!' },
        { id: 'islestone', face: 'point', text: 'Send the other one to break stone on the isle.',
          goal: 'Gather stone on the isle', ring: () => P.isleSend('stone'), taps: () => P.isleTaps('stone'),
          skipIf: () => !P.isleVils().length,
          done: () => P.ordered('stone') || P.gatherers('stone').length > 0, praise: 'Good stone!' },
        /* A GREY BUTTON SAYS WHAT IT IS MISSING (build 191) */
        { id: 'greyed', face: 'thinking', text: "Grey buttons are not ready. Tap the hall's grey Upgrade.",
          goal: 'Tap the grey Upgrade', skipIf: () => { const tc = P.tc(); return !tc || tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok; },
          ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => R1(P.hallRing('#panel [data-act="upgrade"]')()),
          done: () => P._greyAt > (P._beatT0 || 0) || (() => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); })(),
          praise: 'See? It says what is missing.' },
        { id: 'grow', face: 'thinking', text: () => P.hail(true) + ', our hall can rise again. Gather what it needs.', gather: true,
          gwait: () => 'The hall will rise again. The ' + P.naming(P.need()) + ' is coming in.',
          goal: () => 'Raise the hall: ' + P.hallNeeds(), ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); },
          praise: 'We have enough!' },
        { id: 'raise', face: 'excited', text: 'Raise the hall!',
          goal: 'Raise the hall', ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => R1(P.hallRing('#panel [data-act="upgrade"]')()),
          ack: () => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0); },
          site: () => P.tcWorks(), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'Everyone helps. The hall is rising.', waitFace: 'proud',
          done: () => { const tc = P.tc(); return !!tc && tc.level >= 3; } },
      ];
    },
    3() {
      const P = this;
      const R1 = r => (r ? [r] : []);
      const YARD = (key, unit) => P.yardRing(key, '#panel [data-act="train"][data-unit="' + unit + '"]');
      return [
        /* THE RECKONING (build 196: "in game three create a pitched battle between the two
           villages, but set it up in the way where the player is set up for Success … Focus
           on teaching them how to knock down walls attack the buildings and then ultimately
           destroy the town center for the enemy … in game three, we really wanna back off
           and give them a lot more space"). The clan's grown town on the south bank, the
           rival's walled one on the north. Make ready — a stronger barracks and soldiers
           raised a rank, a siege workshop and its catapult (the stone bought at the trading
           post), a stable and riders, a sapper's bridge over the river's one narrows — then
           the army: grouped, saved to its banner, joined by a card's champions, marched in
           its ranks; the garrison sallies (Chaos), the wall is broken (Siege), a tower and
           then their hall are struck down (Strike). The lines say what and why; the ring
           waits long for the player (SPACE[3]), and the view only shows the subject. */
        { id: 'arrive', face: 'determined', text: () => P.hail(true) + ', the clan that burned us lives across the river. Today it ends.', auto: 6400,
          goal: 'The Reckoning', look: () => P.mark('rivalHall'), on: () => P.lineCount() },
        { id: 'plan', face: 'thinking', text: 'A wall and two towers guard their hall. We make ready, then march.', auto: 6400,
          goal: 'Make ready, then march', look: () => P.mark('gate') },
        // a stronger yard first: its next rank is what the chevrons raise a soldier to
        { id: 'barracks2', face: 'point', text: 'Like our hall, our yards can rise. Upgrade the barracks: it trains stronger soldiers.',
          cost: () => P.upCost('barracks'), goal: () => P.upGoal('barracks', 'Upgrade the barracks'),
          when: () => P.canUp('barracks') || P.upping('barracks') || P.lv('barracks') >= 2,
          hold: (c) => P.needLine('The barracks', null, c), look: () => P.bldView('barracks'),
          ring: P.yardRing('barracks', '#panel [data-act="upgrade"]'), taps: () => R1(P.yardRing('barracks', '#panel [data-act="upgrade"]')()),
          ack: () => P.upping('barracks') || P.lv('barracks') >= 2, site: () => P.upSite('barracks'), hands: 2,
          handsText: 'Send villagers to build it. Many hands, quick work.', wait: 'The barracks is rising.',
          done: () => P.lv('barracks') >= 2, praise: 'Level 2! The barracks trains axemen now.' },
        // raised before she asked (passed over unsaid, S.pro.said 0): the lesson is still said
        { id: 'barracks2told', face: 'proud', text: 'Our barracks already stands at level 2. Every yard can rise.', auto: 5200,
          skipIf: () => S.pro.said.barracks2 !== 0, look: () => P.bldView('barracks') },
        /* A SOLDIER RISES A RANK (build 196: "how you would go about upgrading individual
           units"): the gold chevrons beside the ℹ️ on a soldier's own panel (Units.rankUp) */
        { id: 'rankup', face: 'point', hint: 'new', text: 'Soldiers can rise a rank now. Select a defender, then tap the gold chevrons.',
          goal: () => 'Axemen ' + Math.min(3, P.units('axeman').length) + '/3',
          ring: () => P.rankRing(), taps: () => R1(P.rankRing()),
          done: () => P.units('axeman').length >= 3 || !P.rankable('defender'), praise: 'Axemen hit harder!' },
        { id: 'workshop', face: 'point', text: 'Walls need engines. Build a siege workshop.', key: 'siege',
          goal: () => P.buildGoal('siege', 'Build a siege workshop'),
          when: () => P.afford('siege') || P.has('siege'), hold: (c) => P.needLine('A workshop', null, c),
          on: () => Scenarios.unlock('siege'), look: () => P.mark('workshopSite'),
          ring: P.buildRing('siege', 'workshopSite'), taps: () => R1(P.buildRing('siege', 'workshopSite')()),
          ack: () => P.has('siege'), site: () => P.siteOf('siege'), hands: 2,
          handsText: 'Send villagers to build it. Many hands, quick work.', wait: 'The workshop is going up.',
          done: () => P.has('siege', true), praise: 'A siege workshop!' },
        /* THE TRADING POST (build 196: "the remaining buildings"): no rock on this bank, and the
           war camp at the front wants stone — the caravan buys it with wood (Bld.tradeDeal) and
           is out a while, so the stable rises while it travels */
        { id: 'trade', face: 'thinking', hint: 'new', text: 'Stone runs short on our bank. Trade wood for more at the trading post.',
          goal: 'Trade wood for stone', look: () => P.bldView('trade'),
          when: () => P.canTradeFor('stone') || P.caravanFor('stone'), hold: (c) => P.needLine('The caravan', 'wood', c),
          ring: () => P.tradeRing('stone', 'wood'), taps: () => R1(P.tradeRing('stone', 'wood')),
          done: () => P.caravanFor('stone'), praise: 'The caravan rides out!' },
        { id: 'stable', face: 'point', text: 'While it travels, build a stable. Riders strike fast.', key: 'stable',
          goal: () => P.buildGoal('stable', 'Build a stable'),
          when: () => P.afford('stable') || P.has('stable'), hold: (c) => P.needLine('A stable', null, c),
          on: () => Scenarios.unlock('stable'), look: () => P.mark('stableSite'),
          ring: P.buildRing('stable', 'stableSite'), taps: () => R1(P.buildRing('stable', 'stableSite')()),
          ack: () => P.has('stable'), site: () => P.siteOf('stable'), hands: 2,
          handsText: 'Send villagers to build it. Many hands, quick work.', wait: 'The stable is going up.',
          done: () => P.has('stable', true), praise: 'A stable!' },
        { id: 'riders', face: 'point', text: 'Train two riders at the stable.',
          cost: () => P.priceAt('stable', 'rider'), goal: () => 'Riders ' + Math.min(2, P.coming('stable', 'rider')) + '/2',
          when: () => P.canTrainAt('stable', 'rider') || P.coming('stable', 'rider') >= 2,
          hold: (c) => P.needLine('A rider', null, c), look: () => P.bldView('stable'),
          ring: YARD('stable', 'rider'), taps: () => R1(YARD('stable', 'rider')()),
          done: () => P.coming('stable', 'rider') >= 2, praise: 'Riders!' },
        /* THE BOWS RISE TOO (build 196: "how you would go about upgrading individual units"):
           the same two steps as the barracks — the yard's storey, then each man's chevrons —
           asked a second time with room to think: the line names the deed, the ring waits */
        { id: 'range2', face: 'point', text: 'Every yard can rise. Upgrade the archery range: it trains longbows.',
          cost: () => P.upCost('range'), goal: () => P.upGoal('range', 'Upgrade the range'),
          when: () => P.canUp('range') || P.upping('range') || P.lv('range') >= 2,
          hold: (c) => P.needLine('The range', null, c), look: () => P.bldView('range'),
          ring: P.yardRing('range', '#panel [data-act="upgrade"]'), taps: () => R1(P.yardRing('range', '#panel [data-act="upgrade"]')()),
          ack: () => P.upping('range') || P.lv('range') >= 2, site: () => P.upSite('range'), hands: 2,
          handsText: 'Send villagers to build it.', wait: 'The range is rising.',
          done: () => P.lv('range') >= 2, praise: 'Level 2! The range trains longbows now.' },
        { id: 'range2told', face: 'proud', text: 'Our archery range already stands at level 2. It trains longbows.', auto: 5200,
          skipIf: () => S.pro.said.range2 !== 0, look: () => P.bldView('range') },
        { id: 'longbow', face: 'thinking', text: 'Now raise three archers to longbows. You know the way.',
          goal: () => 'Longbows ' + Math.min(3, P.units('longbow').length) + '/3',
          ring: () => P.rankRing('archer', 'range'), taps: () => R1(P.rankRing('archer', 'range')),
          done: () => P.units('longbow').length >= 3 || !P.rankable('archer'), praise: 'Longbows reach farther!' },
        { id: 'catapult', face: 'point', text: 'Train a catapult at the workshop. Its stones break walls.',
          cost: () => P.priceAt('siege', 'catapult'), goal: () => P.trainGoal('siege', 'catapult', 'Train a catapult'),
          when: () => P.canTrainAt('siege', 'catapult') || P.coming('siege', 'catapult') > 0,
          hold: (c) => P.stoneHold(c), holdRing: () => P.stoneRing(), look: () => P.bldView('siege'),
          ring: YARD('siege', 'catapult'), taps: () => R1(YARD('siege', 'catapult')()),
          done: () => P.coming('siege', 'catapult') > 0, praise: 'A catapult!' },
        /* THE RIVER HAS ONE NARROWS (build 196: water as a natural defence, seen from the
           other side): a sapper spans it (the Bridge tool, the camp's second level) */
        { id: 'sapper', face: 'point', text: "The river stops our march. Train a sapper at the sappers' camp.",
          cost: () => P.priceAt('sapper', 'sapper'), goal: () => P.trainGoal('sapper', 'sapper', 'Train a sapper'),
          when: () => P.canTrainAt('sapper', 'sapper') || P.coming('sapper', 'sapper') > 0 || P.bridged(),
          hold: (c) => P.needLine('A sapper', null, c), look: () => P.bldView('sapper'),
          ring: YARD('sapper', 'sapper'), taps: () => R1(YARD('sapper', 'sapper')()),
          ack: () => P.coming('sapper', 'sapper') > 0, wait: 'The sapper is on the way.',
          done: () => P.units('sapper').length > 0 || P.bridged(), praise: 'A sapper!' },
        { id: 'bridge', face: 'point', hint: 'new', text: "Select the sapper, tap Bridge, then the river's narrow water.", cost: () => Object.assign({}, CFG.TERRAFORM.bridgeCost),
          goal: 'Bridge the river', look: () => P.mark('narrows'),
          when: () => P.canBridge() || P.bridging() || P.bridged(), hold: (c) => P.stoneHold(c, 'A bridge'), holdRing: () => P.stoneRing(),
          ring: () => P.bridgeRing(), taps: () => R1(P.bridgeRing()),
          ack: () => P.bridging() || P.bridged(), wait: 'The sapper builds the bridge.',
          done: () => P.bridged(), praise: 'The river is ours to cross!' },
        /* THE WAR CAMP (build 196: "the remaining buildings" — the one the journey had never
           raised): a forward base over the river, where the hurt mend (Bld.healZoneFor) and
           its own arrows meet a foe; the builders cross the new bridge to raise it */
        { id: 'warcamp', face: 'point', hint: 'new', text: 'Raise a war camp across the river. Our hurt mend beside it.', key: 'warcamp',
          goal: () => P.buildGoal('warcamp', 'Raise a war camp'),
          when: () => P.afford('warcamp') || P.has('warcamp'), hold: (c) => P.stoneHold(c, 'A war camp'), holdRing: () => P.stoneRing(),
          on: () => Scenarios.unlock('warcamp'), look: () => P.mark('campSite'),
          ring: P.buildRing('warcamp', 'campSite'), taps: () => R1(P.buildRing('warcamp', 'campSite')()),
          ack: () => P.has('warcamp'), site: () => P.siteOf('warcamp'), hands: 2,
          handsText: 'Send villagers over the bridge to build it.', wait: 'The war camp is going up.',
          done: () => P.has('warcamp', true), praise: 'A camp at the front!' },
        /* THE ARMY (build 196: "teach about putting units together like soldiers in front
           archers in the middle and siege engines in the back … how you group up armies to
           create armies and then … how you can send the entire army"): Group nearby, saved to
           a banner, the banner calls them all wherever they stand, and a march keeps its ranks
           (Units.formationMove: soldiers lead, archers follow, engines last) */
        /* THE CARD FIRST, THEN THE WHOLE ARMY (operator, build 203: "before we group the
           army, let's play iron Legion. Let's have the soldiers march over next to the rest
           of the army … then let's click a soldier then let's group them up then let's save
           them as army one because that's how it actually happens in the game"): the
           champions land by the hall, are grouped and walked to the muster, and only then
           is the whole army grouped and saved — nothing joins a banner by itself */
        { id: 'legion', face: 'excited', text: 'Cards can turn a battle. Play Iron Legion: six champions join our army.',
          goal: 'Play Iron Legion', skipIf: () => !P.holds('iron_legion') && !P.playedCard('iron_legion'),
          ring: () => P.deckRing(), taps: () => R1(P.deckRing()),
          ack: () => P.playedCard('iron_legion'),
          done: () => P.playedCard('iron_legion') && !(window.Deck && Deck.acting && Deck.acting()) && P.champs().length > 0, praise: 'Six champions!' },
        { id: 'champs', face: 'point', hint: 'new', text: 'Select a champion, then tap Group nearby.',
          goal: 'Group the champions', look: () => P.champsAt(),
          skipIf: () => !S.pro.said.champs && (!P.champs().length || P.champsHome()),
          ring: () => P.champRing(), taps: () => R1(P.champRing()),
          done: () => P.champsInHand() || P.champsSent() || P.champsHome(), praise: 'The champions are with you.' },
        { id: 'join', face: 'point', text: 'Now tap the ground beside our army. They march to join it.',
          goal: 'Join the army', look: () => P.besideArmy(),
          skipIf: () => !S.pro.said.join && (!P.champs().length || P.champsHome()),
          ring: () => P.joinRing(), taps: () => R1(P.joinRing()),
          ack: () => P.champsSent(), wait: 'The champions march to join the army.',
          done: () => P.champsHome(), praise: 'The army stands together!' },
        { id: 'group', face: 'point', text: () => P.champs().length ? 'Now the whole army: select a soldier, then tap Group nearby.' : 'Gather the army: select a soldier on the field, then tap Group nearby.',
          goal: 'Group the army', look: () => P.mark('muster'),
          when: () => !P.training() && (!P.champs().length || P.champsHome()),
          hold: () => P.training() ? 'Our new soldiers are nearly ready.' : 'The champions are on their way.', holdRing: () => null,
          ring: () => P.groupRing(), taps: () => R1(P.groupRing()),
          done: () => P.grouped() || P.army(1).length > 0, praise: 'The whole army, in hand!' },
        { id: 'save', face: 'point', hint: 'new', text: 'Save them as Army 1. Its banner calls them back anytime.',
          goal: 'Save Army 1',
          ring: () => P.saveRing(), taps: () => R1(P.saveRing()),
          // a champion left off the roster is folded in (joinLegion): the card said they join the army
          done: () => P.army(1).length > 0 && (P.joinLegion(), true), praise: () => 'Army 1 is ready, ' + P.hail() + '!' },
        { id: 'banner', face: 'point', hint: 'new', text: "Tap Army 1's banner at the top. Every soldier in it answers.",
          goal: 'Call Army 1', ring: () => P.bannerRing(), taps: () => R1(P.bannerRing()),
          done: () => P._bannerAt > (P._beatT0 || 0), praise: 'All of them, at once.' },
        { id: 'march', still: true, face: 'determined', text: 'Send Army 1 across the bridge. Tap the open field beyond the river.',
          goal: 'March across the river', look: () => P.mark('field'),
          ring: () => P.marchRing(), taps: () => R1(P.marchRing()),
          ack: () => P.marchOrdered(), wait: 'Soldiers lead, archers follow, engines come last. Each in its place.', waitFace: 'proud',
          done: () => (S.pro.sally | 0) >= 1 },
        /* THE THREE DOCTRINES (build 196: "how you can create strategies for those armies"):
           the garrison sallies onto the field — Chaos; their wall — Siege; a tower that shoots
           us, then their hall — Strike. Each under ⚔ Tactics on the army's panel */
        { id: 'sally', still: true, face: 'surprised', hint: 'new', text: 'They march out to fight! Open Tactics and choose Chaos.',
          goal: () => 'Beat their soldiers: ' + P.sallyLeft() + ' left',
          ring: () => P.tacticsRing('chaos'), taps: () => R1(P.tacticsRing('chaos')),
          ack: () => P.armed('chaos'), wait: 'Chaos! They fall on every enemy in reach.', waitFace: 'determined',
          done: () => P.sallyBeaten(), praise: 'Their soldiers are beaten!' },
        /* THE WAR CAMP MENDS (Bld.healZoneFor: beside a War Camp, as at the hall): one
           soldier healed is the lesson; the rest is the player's to choose */
        { id: 'heal', face: 'thinking', hint: 'new', text: 'Hurt soldiers mend by the war camp. Select one, then tap Heal.',
          goal: 'Heal a soldier',
          // passed over only before it is said (nothing to mend, or no camp): once said, it waits for the deed
          skipIf: () => !S.pro.said.heal && (!P.has('warcamp', true) || !P.hurtArmy().length),
          ring: () => P.healRing(), taps: () => R1(P.healRing()),
          done: () => (P._healAt || 0) > (P._beatT0 || 0) || !P.hurtArmy().length, praise: 'Mended!' },
        { id: 'siege', still: true, face: 'point', hint: 'new', text: 'Now their wall. Choose Siege, then tap the wall beside the tower.',
          goal: 'Break their wall', on: () => { S.pro.wall1 = P.foeForts('wall').length + P.foeForts('gate').length; },
          ring: () => P.tacticsRing('siege', () => P.breachWall()), taps: () => R1(P.tacticsRing('siege', () => P.breachWall())),
          ack: () => P.sieging(), wait: 'The line shields the catapult while it breaks the wall.', waitFace: 'determined',
          // a breach counted from its own line (S.pro.wall1): a section lost before it is said never passes it over
          done: () => !!S.pro.said.siege && S.pro.wall1 != null && P.foeForts('wall').length + P.foeForts('gate').length < S.pro.wall1, praise: 'The wall is down!' },
        { id: 'strike', still: true, face: 'determined', hint: 'new', text: 'Their tower shoots at us. Choose Strike, then tap the tower.',
          goal: 'Bring down a tower', skipIf: () => !P.foeForts('tower').length,
          ring: () => P.tacticsRing('strike', () => P.nearTower()), taps: () => R1(P.tacticsRing('strike', () => P.nearTower())),
          ack: () => P.striking('tower'), wait: 'Everyone on that tower!', waitFace: 'determined',
          done: () => P.towersDown() >= 1, praise: 'The tower falls!' },
        /* ATTACK THE BUILDINGS (build 196: "knock down walls attack the buildings and then
           ultimately destroy the town center"): the yard that trains their soldiers falls
           before the hall — the doctrine still armed, one tap. (A reserve marching out of it
           mid-siege was tried and cut: Strike ignores whoever strikes back, so five spears
           took the whole army from behind — the doctrine's price, not the lesson's) */
        { id: 'yard', still: true, face: 'determined', text: 'Their barracks trains their soldiers. Strike it before their hall.',
          goal: 'Bring down their barracks', skipIf: () => !P.foeBld('barracks'),
          ring: () => P.tacticsRing('strike', () => P.foeBld('barracks')), taps: () => R1(P.tacticsRing('strike', () => P.foeBld('barracks'))),
          ack: () => P.striking('barracks'), wait: 'Bring it down! No more soldiers will come.', waitFace: 'determined',
          done: () => !P.foeBld('barracks'), praise: 'Their barracks burns!' },
        { id: 'hall', still: true, face: 'excited', text: 'Destroy their hall! Protect our clan for good and secure our valley home.',
          goal: 'Raze their hall',
          ring: () => P.tacticsRing('strike', () => P.foeHall()), taps: () => R1(P.tacticsRing('strike', () => P.foeHall())),
          ack: () => P.striking('tc'), wait: () => 'Bring it down, ' + P.hail() + '!', waitFace: 'determined',
          done: () => !Bld.tcOf('A') },
      ];
    },
  },
  /* ================= GAMES 2 AND 3's LESSONS (build 196) =================
     Every one a read of the world (never a write), but the three a beat's own
     words promise: game 3's yards rally to the muster field (_rallyYards), the
     card's champions join Army 1 (joinLegion), the garrison sallies (_sallyTick). */
  // the deck is on and holds a card the player could be told to play
  deckOn() { return !!(window.Deck && Deck.on && Deck.on() && Deck.total && Deck.total() > 0); },
  holds(id) { try { return Deck.col().counts[id] > 0 && !!Deck.card(id); } catch (e) { return false; } },
  playedCard(id) { return !!(S.deck && Array.isArray(S.deck.played) && S.deck.played.some(p => (p && (p.id || p)) === id)); },
  /* THE MAP (game 2): the minimap open, its button, a point on it, and whether the
     view has been carried somewhere by a tap on it (_miniAt, the capture listener) */
  miniOpen() { return typeof UI !== 'undefined' && !UI.miniCollapsed && this.vis('#mini'); },
  mapRing() { return !this.miniOpen() && this.vis('#mapBtn') ? { sel: '#mapBtn' } : null; },
  miniRing(m) {
    const t = typeof m === 'string' ? this.mark(m) : m;
    if (!t) return null;
    if (!this.miniOpen()) return this.vis('#mapBtn') ? { sel: '#mapBtn' } : null;
    return { mini: [t.x | 0, t.y | 0] };
  },
  hallMark() { const tc = this.tc(); return tc ? { x: Bld.cx(tc), y: Bld.cy(tc), r: 1.2 } : null; },
  // a tap on the map since this line, and the place it named now in view
  camNear(t) { return !!t && (this._miniAt || 0) > (this._beatT0 || 0) && !!(R.onScreen && R.onScreen(t.x, t.y)); },
  /* THE DOCK (game 2): a yard's own training, read the way Bld.canTrain reads it */
  yard(key) { return S.buildings.find(b => b.owner === 'P' && b.key === key && !(b.construction > 0)) || null; },
  priceAt(key, unit) {
    const d = Bld.def(key), spec = d && d.train && d.train[unit];
    if (!spec) return null;
    return window.Cards && Cards.trainCost ? Cards.trainCost('P', unit, spec.cost) : spec.cost;
  },
  canTrainAt(key, unit) { const b = this.yard(key); return !!b && !!(Bld.canTrain && Bld.canTrain(b, unit).ok); },
  units(kind) { return S.units.filter(u => u.owner === 'P' && u.kind === kind && u.hp > 0); },
  // standing, and in a yard's queue: an order counts the moment it is given
  coming(key, unit) {
    let n = this.units(unit).length;
    for (const b of S.buildings) if (b.owner === 'P' && b.key === key && Array.isArray(b.queue)) n += b.queue.filter(q => q.unit === unit).length;
    return n;
  },
  trainGoal(key, unit, deed) {
    return this.canTrainAt(key, unit) || this.coming(key, unit) > 0 ? deed : deed + ': ' + this.priceLine(this.priceAt(key, unit));
  },
  bldView(key) {
    const b = this.yard(key) || this.siteOf(key) || S.buildings.find(o => o.owner === 'P' && o.key === key);
    return b ? { x: Bld.cx(b), y: Bld.cy(b), r: 1.2 } : null;
  },
  selUnitOf(kind) { const s = UI.sel; if (!s || s.type !== 'unit') return null; const u = Units.get(s.id); return u && u.owner === 'P' && u.kind === kind ? u : null; },
  // the fish nearest the authored shoal (a boat fishes any water with fish in it)
  fishSpot() {
    const m = this.mark('shoal'), d = this.yard('dock');
    const at = m || (d ? { x: Bld.cx(d), y: Bld.cy(d) } : null);
    if (!at) return null;
    if (Units.canFish(at.x | 0, at.y | 0)) return { x: (at.x | 0) + 0.5, y: (at.y | 0) + 0.5, r: 0.8 };
    let best = null, bd = 1e9;
    for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
      if (!Units.canFish(x, y)) continue;
      const dd = (x - at.x) ** 2 + (y - at.y) ** 2;
      if (dd < bd) { bd = dd; best = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
    }
    return best;
  },
  fishRing() {
    const boat = this.units('fishboat').find(u => !(u.task && u.task.type === 'fish'));
    if (!boat) return null;
    if (this.selUnitOf('fishboat')) return this.fishSpot();
    return { u: boat.id };
  },
  fishTaps() { const r = this.fishRing(); if (!r) return []; return r.u !== undefined ? [r, this.fishSpot()].filter(Boolean) : [r]; },
  /* THE CROSSING: the transport, who is aboard (or walking to board), the isle's own
     land (_mass) and who stands on it */
  hull() { return this.units('transport')[0] || null; },
  aboard(claimed) {
    const t = this.hull(); if (!t) return 0;
    let n = (t.cargo || []).length;
    if (claimed) n += this.vils().filter(u => u.task && u.task.type === 'board' && u.task.id === t.id).length;
    return n;
  },
  // the hand to send aboard: idle first, never one already boarding, a station's hand last
  boarder(t) {
    let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (u.task && u.task.type === 'board') continue;
      const rank = this.isIdle(u) ? 0 : this.busy(u) ? 2 : 1;
      const d = (u.x - t.x) ** 2 + (u.y - t.y) ** 2 + rank * 1e6;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  boardRing() {
    const t = this.hull(); if (!t) return null;
    const sel = this.selVil();
    if (sel && !(sel.task && sel.task.type === 'board')) return { u: t.id };
    const v = this.boarder(t); return v ? { u: v.id } : null;
  },
  boardTaps() { const t = this.hull(), r = this.boardRing(); if (!r || !t) return []; return r.u === t.id ? [r] : [r, { u: t.id }]; },
  isleMass() { const m = this.mark('isletShore') || this.mark('islet'); return m ? this._massAt(this._mass(), m.x, m.y) : -1; },
  isleVils() {
    const k = this.isleMass(); if (k < 0) return [];
    const lab = this._mass();
    return this.vils().filter(u => this._massAt(lab, u.x, u.y) === k);
  },
  onIsle() { return this.isleVils().length; },
  sailing() { const t = this.hull(); return !!(t && t.task && t.task.type === 'unload'); },
  sailRing() {
    const t = this.hull(); if (!t || !(t.cargo || []).length) return null;
    if (this.selUnitOf('transport')) return this.mark('isletShore');
    return { u: t.id };
  },
  sailTaps() { const r = this.sailRing(); if (!r) return []; return r.u !== undefined ? [r, this.mark('isletShore')].filter(Boolean) : [r]; },
  // a hand on the isle sent to its work there: the one in hand, else the nearest free one there
  isleTile(res) { if (res === 'gold') return this.mark('gold'); const v = this.isleVils()[0]; return (v && this.workFor(v, res)) || this.mark(res); },
  isleSend(res) {
    const tgt = this.isleTile(res); if (!tgt) return null;
    const sel = this.selVil(), on = this.isleVils();
    if (sel && on.includes(sel) && !this.busy(sel)) return tgt;
    const v = on.find(u => this.isIdle(u)) || on.find(u => !this.busy(u));
    return v ? { u: v.id } : null;
  },
  isleTaps(res) { const r = this.isleSend(res); if (!r) return []; return r.u === undefined ? [r] : [r, this.isleTile(res)].filter(Boolean); },
  /* GAME 3 — a yard's level and its next storey (Bld.canUpgrade's own reading) */
  // the highest storey of the player's yards of a kind (an origin may plant a second range)
  lv(key) { let m = 0; for (const b of S.buildings) if (b.owner === 'P' && b.key === key && !(b.construction > 0)) m = Math.max(m, b.level || 1); return m; },
  upping(key) { return S.buildings.some(o => o.owner === 'P' && o.key === key && o.upgrading > 0); },
  upSite(key) { return S.buildings.find(o => o.owner === 'P' && o.key === key && o.upgrading > 0) || null; },
  canUp(key) { return S.buildings.some(b => b.owner === 'P' && b.key === key && !(b.construction > 0) && Bld.canUpgrade(b).ok); },
  upCost(key) { const b = this.yard(key), nx = b && Bld.def(key).levels[b.level]; return nx ? nx.cost : null; },
  upGoal(key, deed) { return this.canUp(key) || this.upping(key) || this.lv(key) >= 2 ? deed : deed + ': ' + this.priceLine(this.upCost(key)); },
  /* A SOLDIER'S NEXT RANK (Units.rankCheck): the chevrons on the one in hand, else
     the defender nearest the barracks who can rise now */
  rankable(kind) { return S.units.some(u => u.owner === 'P' && (!kind || u.kind === kind) && Units.rankCheck && (Units.rankCheck(u) || {}).ok); },
  rankRing(kind = 'defender', yard = 'barracks') {
    const s = UI.sel, u = s && s.type === 'unit' ? Units.get(s.id) : null;
    // the chevron of a soldier who CAN rise now; a fresh axeman's next rank wants a
    // level-3 yard, so the ring moves on to the next defender rather than his grey chevron
    if (u && u.owner === 'P' && u.kind === kind && (Units.rankCheck(u) || {}).ok && this.vis('#panel .prank')) return { sel: '#panel .prank' };
    const b = this.yard(yard);
    let best = null, bd = 1e9;
    for (const o of S.units) {
      if (o.owner !== 'P' || o.kind !== kind || (UI.sentUp && UI.sentUp(o))) continue;
      const c = Units.rankCheck && Units.rankCheck(o); if (!c || !c.ok) continue;
      const d = b ? (o.x - Bld.cx(b)) ** 2 + (o.y - Bld.cy(b)) ** 2 : 0;
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { u: best.id } : null;
  },
  /* THE TRADING POST: the two steps of its panel (what is needed, what pays), the
     caravan out for a good, and a trade the stores can make now */
  canTradeFor(need, pay) {
    const b = this.yard('trade'); if (!b || b.caravan) return false;
    const c = Bld.canTrade(b, need, pay || 'wood'); return !!(c && c.ok);
  },
  caravanFor(res) {
    const b = this.yard('trade'); if (!b || !b.caravan) return false;
    try { return Bld.caravanHaul(b.caravan).need === res; } catch (e) { return true; }
  },
  tradeRing(need, pay) {
    const b = this.yard('trade'); if (!b || b.caravan) return null;
    if (this.selBld('trade') === b) {
      const s1 = '#panel [data-act="trade"][data-res="' + need + '"][data-pay="' + pay + '"]';
      if (this.vis(s1)) return { sel: s1 };
      const s0 = '#panel [data-act="tradeneed"][data-res="' + need + '"]';
      if (this.vis(s0)) return { sel: s0 };
      return this.vis('#panel [data-act="tradeback"]') ? { sel: '#panel [data-act="tradeback"]' } : null;
    }
    return { x: Bld.cx(b), y: Bld.cy(b), r: 1.3 };
  },
  // the catapult held: for stone the trading post (or the caravan already out), else the goods as ever
  stoneShort() { const c = this.goalCost() || {}; return (S.res.stone || 0) < (c.stone || 0); },
  stoneHold(c, what) {
    if (!this.stoneShort()) return this.needLine(what || 'A catapult', null, c);
    return this.caravanFor('stone') ? 'The caravan brings our stone soon.' : (what || 'A catapult') + ' needs more stone. Trade wood for it at the trading post.';
  },
  stoneRing() { if (!this.stoneShort()) return this.gatherRing(false, true); return this.caravanFor('stone') ? null : this.tradeRing('stone', 'wood'); },
  /* THE BRIDGE: the sapper, his Bridge tool armed (UI.terraMode), the narrows spanned */
  bridged() { const m = this.mark('narrows'); return !!(m && Bld.bridgeAt && Bld.bridgeAt(m.x | 0, m.y | 0)); },
  bridging() { return this.units('sapper').some(u => u.task && u.task.type === 'terraform' && u.task.job === 'bridge'); },
  canBridge() { const f = CFG.TERRAFORM && CFG.TERRAFORM.bridgeCost; return !f || Bld.canAfford(f, S.res); },
  bridgeRing() {
    const sp = this.units('sapper')[0]; if (!sp) return null;
    if (this.selUnitOf('sapper')) {
      if (UI.terraMode === 'bridge') return this.mark('narrows');
      const s = '#panel [data-act="terra"][data-job="bridge"]';
      return this.vis(s) ? { sel: s } : null;
    }
    return { u: sp.id };
  },
  /* THE ARMY: its soldiers (never a bow at his tower post), the one in hand, a saved
     banner's roster, and whether Army 1 is what is in hand */
  armyUnits() { return S.units.filter(u => u.owner === 'P' && u.hp > 0 && Units.isMilitary(u) && !Units.isNaval(u) && !(UI.sentUp && UI.sentUp(u))); },
  selArmy() {
    const s = UI.sel; if (!s) return [];
    const ids = s.type === 'group' ? s.ids || [] : s.type === 'unit' ? [s.id] : [];
    return ids.map(id => Units.get(id)).filter(u => u && u.owner === 'P' && Units.isMilitary(u) && !Units.isNaval(u));
  },
  army(n) { return (UI.armyAlive ? UI.armyAlive(n) : ((S.armies && S.armies[n]) || [])) || []; },
  armySelected() {
    const s = UI.sel, a = this.army(1);
    if (!s || s.type !== 'group' || !a.length) return false;
    const set = new Set(s.ids || []);
    return a.filter(id => set.has(id)).length >= Math.max(1, Math.ceil(a.length * 0.6));
  },
  // a yard of the war still training (the riders, the catapult): the army is grouped once they stand
  training() { return S.buildings.some(b => b.owner === 'P' && (b.key === 'stable' || b.key === 'siege' || b.key === 'barracks' || b.key === 'range') && Array.isArray(b.queue) && b.queue.length > 0); },
  groupRing() {
    const s = UI.sel;
    if (s && s.type === 'unit') {
      const u = Units.get(s.id);
      if (u && u.owner === 'P' && Units.isMilitary(u) && this.vis('#panel [data-act="group"]')) return { sel: '#panel [data-act="group"]' };
    }
    // the soldier whose Group nearby takes the most of the army (ties: nearest the muster)
    const m = this.mark('muster'), us = this.armyUnits().filter(u => u.kind !== 'sapper'), R2 = (CFG.GROUP_R || 6) - 0.5;
    let best = null, bn = -1, bd = 1e9;
    for (const u of us) {
      const n = us.filter(o => Math.hypot(o.x - u.x, o.y - u.y) <= R2).length;
      const d = m ? (u.x - m.x) ** 2 + (u.y - m.y) ** 2 : 0;
      if (n > bn || (n === bn && d < bd)) { bn = n; bd = d; best = u; }
    }
    return best ? { u: best.id } : null;
  },
  saveRing() {
    const s = '#panel [data-act="garmysave"]';
    if (UI.sel && UI.sel.type === 'group' && this.vis(s)) return { sel: s };
    return this.groupRing();
  },
  bannerRing() { const s = '#armyBar button[data-army="1"]'; return this.vis(s) ? { sel: s } : null; },
  // the six champions the card brings join Army 1 (the legion line's own words) — once a beat, idempotent
  joinLegion() {
    const a = this.army(1); if (!a.length || !S.armies) return true;
    // the card's champions muster a beat after its act (Deck.summon): not there yet, not done
    const champs = S.units.filter(u => u.owner === 'P' && u.kind === 'elite' && u.hp > 0 && !u.spectral);
    if (!champs.length) return false;
    const inArmy = new Set();
    for (const n of [1, 2, 3]) for (const id of this.army(n)) inArmy.add(id);
    const add = champs.filter(u => !inArmy.has(u.id)).map(u => u.id);
    if (add.length) { S.armies[1] = a.concat(add); try { UI.renderArmyBar(); } catch (e) {} }
    return true;
  },
  /* THE CHAMPIONS JOIN THE ARMY (build 203): the card's six land by the hall; the
     host is the rest of the army, standing on the muster field (the yards rally there) */
  champs() { return S.units.filter(u => u.owner === 'P' && u.kind === 'elite' && u.hp > 0 && !u.spectral); },
  _mid(us) {
    if (!us.length) return null;
    let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; }
    return { x: x / us.length, y: y / us.length };
  },
  champsAt() { const c = this._mid(this.champs()); return c ? { x: c.x, y: c.y, r: 1.4 } : null; },
  host() { return this.armyUnits().filter(u => u.kind !== 'elite' && u.kind !== 'sapper'); },
  hostAt() {
    const m = this.mark('muster'), h = this.host();
    const near = m ? h.filter(u => Math.hypot(u.x - m.x, u.y - m.y) <= 7) : h;
    return this._mid(near.length ? near : h) || m;
  },
  // two in three of the champions within reach of the host (where Group nearby takes them all)
  _champsBy(test) {
    const c = this.champs(); if (!c.length) return true;
    return c.filter(test).length >= Math.ceil(c.length * 0.67);
  },
  champsHome() {
    const h = this.hostAt(); if (!h) return true;
    return this._champsBy(u => Math.hypot(u.x - h.x, u.y - h.y) <= 5);
  },
  champsSent() {
    const h = this.hostAt(); if (!h) return true;
    return this._champsBy(u => Math.hypot(u.x - h.x, u.y - h.y) <= 5
      || (u.task && u.task.type === 'move' && u.task.x != null && Math.hypot(u.task.x - h.x, u.task.y - h.y) <= 5));
  },
  champsInHand() {
    const c = this.champs(); if (!c.length) return false;
    return this.selArmy().filter(u => u.kind === 'elite').length >= Math.min(4, c.length);
  },
  /* the whole army in hand: six or more, and with the card's champions most of
     them AND at least half the host — the champions' own group (the step
     before) is never the army */
  grouped() {
    const sel = this.selArmy(); if (sel.length < 6) return false;
    const c = this.champs(); if (!c.length) return true;
    const host = this.host().length, hostIn = sel.filter(u => u.kind !== 'elite' && u.kind !== 'sapper').length;
    return sel.filter(u => u.kind === 'elite').length >= Math.min(4, c.length) && hostIn >= Math.max(1, Math.ceil(host * 0.5));
  },
  champRing() {
    const s = UI.sel;
    if (s && s.type === 'unit') {
      const u = Units.get(s.id);
      if (u && u.owner === 'P' && u.kind === 'elite' && this.vis('#panel [data-act="group"]')) return { sel: '#panel [data-act="group"]' };
    }
    const c = this.champs(), m = this._mid(c); if (!m) return null;
    let best = null, bd = 1e9;
    for (const u of c) { const d = (u.x - m.x) ** 2 + (u.y - m.y) ** 2; if (d < bd) { bd = d; best = u; } }
    return best ? { u: best.id } : null;
  },
  // open ground beside the host, toward the champions: a tap there walks them over
  besideArmy() {
    const h = this.hostAt(); if (!h) return null;
    const c = this._mid(this.champs()) || h, riv = this.riverY();
    let best = null, bs = 1e9;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const x = Math.floor(h.x) + dx, y = Math.floor(h.y) + dy, cx = x + 0.5, cy = y + 0.5;
      if (!MapGen.onBoard(x, y) || cy < riv + 0.6 || !Path.passable(x, y, 'P') || Bld.at(x, y)) continue;
      if (S.map.explored && !S.map.explored[MapGen.idx(x, y)]) continue;
      if (S.units.some(u => u.hp > 0 && Math.hypot(u.x - cx, u.y - cy) < 1.1)) continue;
      const dh = Math.hypot(cx - h.x, cy - h.y); if (dh < 2) continue;
      const sc = Math.abs(dh - 3) + 0.2 * Math.hypot(cx - c.x, cy - c.y);
      if (sc < bs) { bs = sc; best = { x: cx, y: cy, r: 0.8 }; }
    }
    return best;
  },
  joinRing() { return this.champsInHand() ? this.besideArmy() : this.champRing(); },
  riverY() { const m = this.mark('narrows'); return m ? (m.y | 0) - 0.5 : 20; },
  marchRing() {
    if (!this.armySelected() && this.selArmy().length < 4) return this.bannerRing() || this.groupRing();
    return this.mark('field');
  },
  marchOrdered() {
    const riv = this.riverY();
    return this.armyUnits().some(u => u.y < riv || (u.task && u.task.type === 'move' && u.task.y != null && u.task.y < riv));
  },
  /* THE DOCTRINES (⚔ Tactics on the army's panel): the army in hand, the doctrine lit,
     then its target */
  armed(mode) {
    const sel = this.selArmy(), us = sel.length ? sel : this.army(1).map(id => Units.get(id)).filter(Boolean);
    return us.some(u => u.strat === mode);
  },
  tacticsRing(mode, tgt) {
    const sel = this.selArmy();
    if (sel.length < 2) return this.bannerRing() || this.groupRing();
    // the doctrine on the WHOLE party (the panel lights it only then, and a tap arms it on all)
    if (!sel.every(u => u.strat === mode || Units.isLevied(u))) {
      const s = '#panel [data-act="gstrat"][data-strat="' + mode + '"]';
      if (this.vis(s)) return { sel: s };
      return this.vis('#panel [data-act="gtactics"]') ? { sel: '#panel [data-act="gtactics"]' } : null;
    }
    const t = tgt ? tgt.call(this) : null;
    return t ? { x: Bld.cx(t), y: Bld.cy(t), r: t.key === 'tc' ? 1.5 : 1.1 } : null;
  },
  /* THEIR LINE (counted when the battle's first line is said: S.pro.line0) */
  lineY() { const g = this.mark('gate'); return g ? (g.y | 0) : 11; },
  foeForts(key) { return S.buildings.filter(b => b.owner === 'A' && b.key === key && b.hp > 0); },
  lineCount() {
    if (!S.pro || S.pro.line0) return;
    S.pro.line0 = { wall: this.foeForts('wall').length, gate: this.foeForts('gate').length, tower: this.foeForts('tower').length };
  },
  towersDown() { const L = S.pro && S.pro.line0; return L ? Math.max(0, L.tower - this.foeForts('tower').length) : 0; },
  breachWall() {
    const m = this.mark('breach'), ws = this.foeForts('wall');
    let best = null, bd = 1e9;
    for (const b of ws) { const d = m ? (b.x - m.x) ** 2 + (b.y - m.y) ** 2 : 0; if (d < bd) { bd = d; best = b; } }
    return best;
  },
  nearTower() {
    const ts = this.foeForts('tower'); if (!ts.length) return null;
    const a = this.selArmy();
    const c = a.length ? { x: a.reduce((s, u) => s + u.x, 0) / a.length, y: a.reduce((s, u) => s + u.y, 0) / a.length } : this.mark('breach');
    let best = null, bd = 1e9;
    for (const b of ts) { const d = c ? (Bld.cx(b) - c.x) ** 2 + (Bld.cy(b) - c.y) ** 2 : 0; if (d < bd) { bd = d; best = b; } }
    return best;
  },
  foeHall() { return Bld.tcOf('A'); },
  sieging() {
    return S.units.some(u => {
      if (u.owner !== 'P' || u.strat !== 'siege') return false;
      if (u.siegePost) return true;
      const b = u.tBld && Bld.get(u.tBld); return !!(b && b.owner === 'A');
    });
  },
  striking(key) {
    return S.units.some(u => { if (u.owner !== 'P' || !u.tBld) return false; const b = Bld.get(u.tBld); return !!b && b.owner === 'A' && b.key === key; });
  },
  /* GAME 3's SALLY: the rival's garrison stands behind its wall (the scripted rival,
     aiOff) until the player's army crosses the river — then it marches out through the
     gate and, once out, falls on the nearest of the army: the open-field fight the Chaos
     line is said over. Once, remembered in the save (S.pro.sally: 1 out, 2 at them). */
  SALLY_OUT_S: 8,
  sallyFoes() { return S.units.filter(u => u.owner === 'A' && u.hp > 0 && Units.isMilitary(u) && !Units.isNaval(u) && !u.perch && !u.climb); },
  sallyLeft() { return this.sallyFoes().length; },
  sallyBeaten() {
    if (!S.pro || (S.pro.sally | 0) < 2) return false;
    const y = this.lineY();
    return !this.sallyFoes().some(u => u.y > y + 0.6);
  },
  _sallyTick() {
    if (!S.pro || !window.Scenarios || Scenarios.game() !== 3) return;
    this._rallyYards();
    if ((S.pro.sally | 0) >= 2) {
      /* the sally beaten, the army stands down its Chaos where it stands (once): left on,
         the doctrine falls on their towers and wall next (Combat.chaosSeek's order), and
         the next lesson is the siege that breaks the wall */
      if (S.pro.sally === 2) {
        this._hunt(this.sallyFoes().filter(u => u.y > this.lineY() + 0.6));
        /* the Chaos lesson is the soldiers': an engine under it that turns on their works
           (Combat.chaosSeek's last tiers — a tower, then the wall) stands down where it is,
           keeping its stones for the wall's own lesson (Siege, next) — measured: the
           catapult broke the wall mid-sally and the siege's line was never said */
        for (const u of this.armyUnits()) {
          if (!Units.isSiege(u) || u.strat !== 'chaos' || !u.tBld) continue;
          const b = Bld.get(u.tBld);
          if (b && b.owner === 'A' && (b.key === 'wall' || b.key === 'gate' || b.key === 'tower')) { u.strat = null; u.tBld = 0; u.task = null; u.path = null; u.assault = false; }
        }
      }
      if (S.pro.sally === 2 && this.sallyBeaten()) { S.pro.sally = 3; this.regroup(); }
      return;
    }
    const gate = this.mark('gate'); if (!gate) return;
    const army = this.armyUnits();
    if (!S.pro.sally) {
      const riv = this.riverY();
      if (!army.some(u => u.y < riv)) return;
      S.pro.sally = 1; S.pro.sallyAt = S.playtime || 0;
      this.sallyFoes().forEach((u, i) => {
        u.tUnit = 0; u.tBld = 0; u.defend = false; u.assault = false;
        Units.moveTo(u, (gate.x | 0) + ((i % 3) - 1), (gate.y | 0) + 2 + ((i / 3) | 0));
      });
      return;
    }
    const foes = this.sallyFoes(), y = this.lineY();
    if (!(foes.every(u => u.y > y + 0.6) || (S.playtime || 0) - (S.pro.sallyAt || 0) > this.SALLY_OUT_S)) return;
    for (const u of foes) {
      let best = null, bd = 1e9;
      for (const o of army) { const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; } }
      if (!best) continue;
      u.task = { type: 'attack', on: best.id }; u.tUnit = best.id; u.tBld = 0; u.anchor = { x: u.x, y: u.y }; u.assault = false;
    }
    S.pro.sally = 2;
  },
  /* out on the field, each of them takes the nearest of the army it can SEE (Combat.sees:
     never through their own wall) when its mark falls. A scripted rival keeps no eyes
     (AI.glance stands down for aiOff), so neither its own seek nor its raid brain
     (u.assault → Combat.aiRaidSeek, which walked a straggler over the bridge into the
     village) can lead them — this does */
  _hunt(list) {
    const army = this.armyUnits();
    for (const u of list) {
      const t = u.tUnit && Units.get(u.tUnit);
      if (t && t.hp > 0 && t.owner === 'P') continue;
      let best = null, bd = 1e9;
      for (const o of army) { const d = Math.hypot(o.x - u.x, o.y - u.y); if (d < bd && d < 14 && Combat.sees(u, o)) { bd = d; best = o; } }
      if (best) { u.task = { type: 'attack', on: best.id }; u.tUnit = best.id; u.tBld = 0; u.anchor = { x: u.x, y: u.y }; u.assault = false; }
    }
  },
  // the army's hurt that a Heal could mend (a spirit eats nothing and is never mended), most hurt first
  hurtArmy() {
    return this.armyUnits().filter(u => u.hp < u.maxhp * 0.85 && CFG.HEAL_FOOD[u.kind] && !u.spectral && !(UI.healThrottled && UI.healThrottled(u)))
      .sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp);
  },
  hurtNearCamp() { return this.hurtArmy().filter(u => Bld.inHealZone(u)); },
  camp() { return S.buildings.find(b => b.owner === 'P' && b.key === 'warcamp' && Bld.done(b)) || null; },
  /* the open tiles round the camp inside its healing ground (Bld.healZoneFor: its reach
     + WARCAMP_HEAL from its middle) — far enough inside that a soldier standing anywhere
     on the tile (two to a tile stand off its middle) mends */
  campRing() {
    const c = this.camp(); if (!c) return [];
    const z = { x: Bld.cx(c), y: Bld.cy(c), r: Bld.reach(c) + CFG.WARCAMP_HEAL - 0.45 }, out = [];
    for (let y = c.y - 3; y <= c.y + 4; y++) for (let x = c.x - 3; x <= c.x + 4; x++)
      if (MapGen.onBoard(x, y) && Path.passable(x, y, 'P') && !Bld.at(x, y) && Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y) <= z.r) out.push({ x, y });
    return out;
  },
  /* the Heal lesson's ring: the button of a hurt soldier in hand beside the camp; one in
     hand but out of reach, the ground beside the camp (a walk there); else the hurt
     soldier nearest the camp */
  healRing() {
    const c = this.camp(); if (!c) return null;
    const s = UI.sel, u = s && s.type === 'unit' ? Units.get(s.id) : null;
    if (u && u.owner === 'P' && u.hp < u.maxhp && CFG.HEAL_FOOD[u.kind]) {
      if (Bld.inHealZone(u)) return this.vis('#panel [data-act="heal"]') ? { sel: '#panel [data-act="heal"]' } : null;
      const ring = this.campRing().sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      return ring.length ? { x: ring[0].x + 0.5, y: ring[0].y + 0.5, r: 0.6 } : null;
    }
    const cx = Bld.cx(c), cy = Bld.cy(c);
    const h = this.hurtArmy().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    return h ? { u: h.id } : null;
  },
  /* the sally beaten: Chaos stood down where it stands (left on, the doctrine falls on
     their towers and wall next — Combat.chaosSeek's order), and the army falls back on
     the war camp, its hurt onto the ground the camp mends (two to a tile, as ranks stand) */
  regroup() {
    const back = [];
    for (const u of this.armyUnits()) {
      if (u.strat !== 'chaos') continue;
      u.strat = null; u.tUnit = 0; u.tBld = 0; u.assault = false; u.path = null;
      if (u.task && /^attack/.test(u.task.type)) u.task = null;
      back.push(u);
    }
    const c = this.camp(); if (!back.length || !c) return;
    const ring = this.campRing(), hurt = back.filter(u => u.hp < u.maxhp * 0.85 && CFG.HEAL_FOOD[u.kind]);
    let i = 0;
    for (const u of hurt) { const t = ring[(i++ >> 1) % Math.max(1, ring.length)]; if (t) Units.moveTo(u, t.x, t.y); }
    const rest = back.filter(u => !hurt.includes(u)).map(u => u.id);
    if (rest.length) Units.groupMove(rest, c.x + 1, c.y - 1);
  },
  foeBld(key) { return S.buildings.find(b => b.owner === 'A' && b.key === key && b.hp > 0 && !(b.construction > 0)) || null; },
  // the yards the lesson raises send their soldiers to the muster field, as the barracks and the range do
  _rallyYards() {
    const m = this.mark('muster'); if (!m) return;
    for (const b of S.buildings) {
      if (b.owner !== 'P' || b.rally || b.construction > 0 || !(b.key === 'stable' || b.key === 'siege')) continue;
      b.rally = { x: m.x | 0, y: m.y | 0 };
    }
  },
  // the battle is the line: a soldier's fall is said by the fight itself, not a toast (one voice)
  _battle() {
    const v = this._shown;
    return !!(v && window.Scenarios && Scenarios.game() === 3 && /^(march|sally|heal|siege|strike|yard|hall)$/.test(v.id));
  },
  /* THE DECK CHAIN: the deck button → a card that plays at once (the starter
     hand is all of that kind) → PLAY; an aimed card's ✓ if one was lifted */
  deckRing() {
    if (window.DeckUI && DeckUI.playing) return null;   // the card is in the air: point at nothing
    if (this.vis('.dkAGo')) return { sel: '.dkAGo' };
    if (this.vis('#dkInsp .dkPlay')) return { sel: '#dkInsp .dkPlay' };
    if (window.DeckUI && DeckUI.open) {
      const id = this.deckPick(), cell = id && '.dkCell[data-card="' + id + '"]';
      return cell && this.vis(cell) ? { sel: cell } : null;
    }
    return this.vis('#deckBtn') ? { sel: '#deckBtn' } : null;
  },
  // the device holds game 1's card (asked before the deck is shown, when nothing can be played yet)
  holdsMB() { return this.holds('master_builders'); },
  // the card a game's lesson plays: game 1's prize in game 2, game 2's in game 3's battle
  deckWant() { return window.Scenarios && Scenarios.game() === 3 ? 'iron_legion' : 'master_builders'; },
  deckPick() {
    let best = null;
    try {
      const k = Deck.col().counts, want = this.deckWant();
      // the lesson's own card, when the device holds it and it can play
      if (k[want] > 0 && Deck.card(want) && Deck.canPlay(want).ok) return want;
      if (want === 'iron_legion') return null;   // game 3's card line is the legion's alone
      for (const id in k) {
        if (!(k[id] > 0)) continue;
        const c = Deck.card(id);
        if (!c || !Deck.canPlay(id).ok) continue;
        if (c.target === 'none') return id;
        if (!best) best = id;
      }
    } catch (e) {}
    return best;
  },
  afford2(unit) { const tc = this.tc(); return !!tc && Bld.canTrain && Bld.canTrain(tc, unit).ok; },
  trained() { const tc = this.tc(); return this.vils().length > this._n0 || !!(tc && tc.queue && tc.queue.some(q => q.unit === 'villager')); },

  /* GAME 2's WALL ACROSS THE LAND BRIDGE (operator, build 187: "get them to
     place it and then place the wall next to it, and then another wall. It
     shows a completed wall"): three sections across the bridge, west to east
     (the marks wall1..3), each laid by hand — Build, Wall, the ringed tile.
     One builder walks a line section by section (units.js), so a section
     waiting while its neighbour goes up is attended, never "nobody building it" */
  LINE: ['wall1', 'wall2', 'wall3'],
  lineTiles() { return this.LINE.map(m => this.mark(m)).filter(Boolean); },
  fortOn(t) {
    if (!t) return null;
    const b = Bld.at(t.x | 0, t.y | 0);
    return b && b.owner === 'P' && (b.key === 'wall' || b.key === 'gate') ? b : null;
  },
  lineForts() { return this.lineTiles().map(t => this.fortOn(t)).filter(Boolean); },
  /* A LINE TILE ALREADY TAKEN (build 205 — operator, game 2: "I did it already on this
     one and now the game is stuck … leave a little flexibility"): the tower is raised ON
     the neck, and a player may set it (or anything else of theirs) on any tile of the
     line. That tile is the line's already: it seals the bridge as a section does, so the
     wall lessons ask only for the tiles still open, and never for ground nobody can build */
  lineTaken(t) {
    if (!t) return false;
    const b = Bld.at(t.x | 0, t.y | 0);
    return !!b && b.owner === 'P' && b.key !== 'wall' && b.key !== 'gate';
  },
  lineNeed() { return this.lineTiles().filter(t => !this.lineTaken(t)).length; },
  // the most hurt finished section of the line (the scout's work), or null when all are whole
  hurtFort() {
    let w = null, wr = 1;
    for (const b of this.lineForts()) {
      if (b.construction > 0 || !(b.maxhp > 0) || b.hp >= b.maxhp - 0.5) continue;
      const r = b.hp / b.maxhp; if (r < wr) { wr = r; w = b; }
    }
    return w;
  },
  laidOnLine() { return this.lineForts().length; },
  // the next section: the first gap beside a section already laid, else the first gap
  nextLineTile() {
    const ts = this.lineTiles(), has = ts.map(t => !!this.fortOn(t) || this.lineTaken(t));
    for (let i = 0; i < ts.length; i++) if (!has[i] && (has[i - 1] || has[i + 1])) return ts[i];
    for (let i = 0; i < ts.length; i++) if (!has[i]) return ts[i];
    return null;
  },
  buildsOn(u, b) { return !!(u.task && u.task.type === 'build' && (u.task.id === b.id || u.task.b === b.id || u.task.bid === b.id)); },
  // a section going up with no hand anywhere on the line: the one to send a builder to
  lineSite() {
    const up = this.lineForts().filter(b => b.construction > 0);
    if (!up.length) return null;
    const crew = S.units.some(u => u.owner === 'P' && up.some(b => this.buildsOn(u, b)));
    return crew ? null : up[0];
  },
  lineDone() { const f = this.lineForts(), n = this.lineNeed(); return f.length >= n && f.every(b => !(b.construction > 0)); },
  wallGoal() {
    const n = this.laidOnLine();
    const need = this.lineNeed();
    return n >= need || this.afford('wall') ? 'Close the bridge: Walls ' + n + '/' + need
      : 'Close the bridge: ' + this.costLine('wall');
  },

  /* THE SCOUT AT THE WALL (operator, build 187: "show an enemy coming to scout
     and getting shot at by the archer. This gives the basic premise of
     protection"): one light raider of the wild country comes out of the wood
     across the bridge at SCOUT_PACE (slow enough to be watched coming), hunting
     the player's works alone (hostileTo 'P'), and batters the closed wall while
     the archer on the tower shoots him down. The guide only SHOWS it — no ring
     (a ring is a tap), the view on the wall (`look`: the mainland he comes down
     above it, the tower below), his ground lit while he comes (watch(), read by
     G.updateVisibility), his blows on the wall the guide's own news (no "under
     attack" toast while her line is up) — and moves on when he falls. With
     nobody up the tower he gives up after SCOUT_DAYS and goes home, so the
     lesson never waits on a fight that cannot happen. */
  SCOUT_DAYS: 4,
  SCOUT_PACE: 0.6,
  /* …and hardier than a raider (build 205): with the tower on the neck its archer reaches him
     from the wood's edge, and at a raider's hp he fell before landing a blow, so the wall
     was never hurt and the mend lesson was passed over */
  SCOUT_HP: 3,
  scout() { return S.units.find(u => u.proScout && u.hp > 0) || null; },
  sendScout() {
    if (!S.pro || S.pro.scouted || typeof G === 'undefined' || !G.spawnBarb) return;   // G is a script const: never window.G
    const from = this.mark('scoutFrom'); if (!from) return;
    let u = null;
    try { u = G.spawnBarb('light', Math.floor(from.x), Math.floor(from.y), { tribe: 'wolf' }); } catch (e) {}
    if (!u) return;
    u.proScout = 1; u.hostileTo = 'P'; u.style = 'band'; u.tribe = u.tribe || 'wolf';
    u.speed = +(u.speed * this.SCOUT_PACE).toFixed(3);   // he creeps in, slow enough to be watched coming
    u.maxhp = Math.round(u.maxhp * this.SCOUT_HP); u.hp = u.maxhp;
    S.pro.scouted = 1;
    S.pro.scoutDay = S.day + (S.dayT || 0) / CFG.DAY_MS;
  },
  scoutDone() { const u = this.scout(); return !!(S.pro && S.pro.scouted) && (!u || !!u.fled); },
  _scoutTick() {
    const u = this.scout();
    if (!u || u.fled || !S.pro || S.pro.scoutDay == null) return;
    if (S.day + (S.dayT || 0) / CFG.DAY_MS - S.pro.scoutDay < this.SCOUT_DAYS) return;
    u.fled = true; u.tUnit = 0; u.tBld = 0; u.path = null;
    try { if (typeof Combat !== 'undefined' && Combat.raiderLeave) Combat.raiderLeave(u); } catch (e) {}
  },
  // his ground, lit while he comes to the wall (G.updateVisibility)
  watch() {
    if (typeof S === 'undefined' || !S || !S.scenario) return null;
    /* game 3: from the moment the army crosses, their wall line and hall stand in
       sight — a siege or a strike is ordered on a building the player SEES, and
       the lesson's targets must never sit in the fog behind the war camp */
    if (window.Scenarios && Scenarios.game() === 3 && S.pro) {
      const out = [];
      // the war camp going up over the river: its builders are sent to a site the player can see
      const site = S.buildings.find(b => b.owner === 'P' && b.key === 'warcamp' && b.construction > 0);
      if (site) out.push({ x: Bld.cx(site), y: Bld.cy(site), r: 2 });
      if ((S.pro.sally | 0) >= 1) {
        const h = this.mark('rivalHall'), g = this.mark('gate'), w = this.mark('breach');
        const yd = this.foeBld('barracks');
        out.push(h && { x: h.x, y: h.y, r: 4 }, w && { x: w.x, y: w.y, r: 3 }, g && { x: g.x, y: g.y, r: 4 }, yd && { x: Bld.cx(yd), y: Bld.cy(yd), r: 2.5 });
      }
      return out.length ? out : null;
    }
    const u = this.scout();
    return u && !u.fled ? { x: u.x, y: u.y, r: 2 } : null;
  },
  // the scene: the bridge's wall with the mainland it faces and the tower behind it
  wallView() { const m = this.mark('wall2'); return m ? { x: m.x, y: m.y, r: 0.5 } : null; },

  /* THE GATE (operator, build 187: "teach the player how to build a gate out
     of a wall and why this is helpful"): a section of the line, selected, is
     cut into a gate ("Build Gate" on its panel); a player's gate is finished
     shut, and its lever opens it — open, it lets the tribe's own people
     through and nobody else. The middle section, unless the scout dented it:
     a villager in hand, tapping a dented wall, is sent to mend it instead of
     choosing it. */
  gateOnLine() { return this.lineForts().find(b => b.key === 'gate') || null; },
  gateSite() { const g = this.gateOnLine(); return g && g.construction > 0 ? g : null; },
  gateWall() {
    const walls = this.lineForts().filter(b => b.key === 'wall' && !(b.construction > 0));
    if (!walls.length) return null;
    const whole = b => b.hp >= b.maxhp, mid = this.fortOn(this.mark('wall2'));
    if (mid && mid.key === 'wall' && !(mid.construction > 0) && whole(mid)) return mid;
    return walls.find(whole) || walls[0];
  },
  gateCost() {
    const w = this.gateWall();
    return w && typeof UI !== 'undefined' && UI.gateConvertCost ? UI.gateConvertCost(w) : Bld.effCost('P', 'gate');
  },
  canGate() { return Bld.canAfford(this.gateCost(), S.res); },
  gateGoal() { return this.canGate() || this.gateOnLine() ? 'Build a gate' : 'Build a gate: ' + this.priceLine(this.gateCost()); },
  gateRing() {
    if (this.gateOnLine()) return null;
    const b = this.selBld('wall');
    if (b && this.lineForts().includes(b) && this.vis('#panel [data-act="togate"]')) return { sel: '#panel [data-act="togate"]' };
    const w = this.gateWall(); return w ? { x: Bld.cx(w), y: Bld.cy(w), r: 0.9 } : null;
  },
  openRing() {
    const g = this.gateOnLine(); if (!g || g.construction > 0) return null;
    if (this.selBld('gate') === g && this.vis('#panel [data-act="drawbridge"]')) return { sel: '#panel [data-act="drawbridge"]' };
    return { x: Bld.cx(g), y: Bld.cy(g), r: 0.9 };
  },

  /* CONTEXTUAL LINES: said over the current beat while their condition holds
     (N seconds steady), then the beat comes back. IDLE HANDS and THE WRONG
     WORK are no longer asides: a beat that waits on goods (held, or a
     gathering beat) rings the hand to move from its first frame (gatherRing)
     — at 8–10 s they read as a guide that had stopped answering. News of the
     world (`quiet`) is said only at a quiet moment — never over a line the
     player is still acting on — keeps the beat's ring (`keepRing`), and is
     let go if no quiet moment comes within QUIET_MAX. */
  QUIET_MAX: 25000,
  ASIDES: [
    // a works going up with nobody at it — not the current beat's own (its `hands` line asks already)
    { id: 'nobuilder', face: 'concerned', text: 'No one is building it. Send a villager to the frame.', hold: 2,
      test() { const v = this._shown; if (v && v.phase === 'hands') return null; return this.unbuilt(); },
      ring() { const b = this.unbuilt(); return b ? (this.selVil() ? { x: Bld.cx(b), y: Bld.cy(b), r: 1.1 } : (this.idleVil() ? { u: this.idleVil().id } : null)) : null; },
      taps() { const b = this.unbuilt(), v = this.idleVil(); return [v && !this.selVil() ? { u: v.id } : null, b ? { x: Bld.cx(b), y: Bld.cy(b), r: 1 } : null].filter(Boolean); } },
    { id: 'rival', face: 'surprised', text: 'Riders! Another clan shares these lakes. Not the ones who burned us.', hold: 0.5, once: true, auto: 4200, quiet: true, keepRing: true,
      test() { return Scenarios.game() === 2 && S.units.some(u => u.owner === 'A' && G.visibleAt && G.visibleAt(u.x | 0, u.y | 0)); } },
    /* THE EASTER EGG (build 210, a playtest: "explored the starter map looking for
       easter eggs"): game 1 hides one of the ten wilderness relics by the south pond,
       where the cattle graze — standing in the remembered fog from the first frame,
       found when one of the clan sees it (Relics.checkDiscovery's `sight`). The find
       is the world's news, which a journey world does not toast (quiet), so she says
       it, once, over whatever she was saying — and her line comes back after */
    { id: 'relic', face: 'surprised', hold: 0, once: true, auto: 5600, keepRing: true,
      get text() {
        const r = typeof S !== 'undefined' && S && S.relic, d = r && window.Relics && Relics.DEFS[r.key];
        return d && r.found ? 'Look, ' + d.name.replace(/^The /, 'the ') + '! Older than any clan. It gave us ' + r.amount + ' ' + d.res + '.'
          : 'Look! Old stones, older than any clan.';
      },
      test() { return !!(S.relic && S.relic.found); } },
  ],
  // the hands building a site or a storey
  builders(b) { return S.units.filter(u => u.owner === 'P' && u.task && u.task.type === 'build' && (u.task.id === b.id || u.task.b === b.id || u.task.bid === b.id)); },
  builderRing() {
    const tc = this.tc(); if (!tc) return null;
    if (this.selVil()) return { x: Bld.cx(tc), y: Bld.cy(tc), r: 1.4 };
    const v = this.idleVil(); return v ? { u: v.id } : { x: Bld.cx(tc), y: Bld.cy(tc), r: 1.4 };
  },
  builderTaps() {
    const tc = this.tc(); if (!tc) return [];
    const at = { x: Bld.cx(tc), y: Bld.cy(tc), r: 1.4 };
    if (this.selVil()) return [at];
    const v = this.idleVil(); return v ? [{ u: v.id }, at] : [];
  },
  /* a site or a storey going up with nobody at it — but a stretch of wall,
     gate or road with a hand on the stretch beside it is attended: the
     builder walks on to the next section by himself (the work order), so
     three sections laid one after the other are one job, not two idle ones */
  LINE_KEYS: { wall: 1, gate: 1, road: 1 },
  unbuilt() {
    const on = (u, b) => u.owner === 'P' && u.task && (u.task.type === 'build') && (u.task.id === b.id || u.task.b === b.id || u.task.bid === b.id);
    for (const b of S.buildings) {
      if (b.owner !== 'P' || !(b.construction > 0 || b.upgrading > 0)) continue;
      if (S.units.some(u => on(u, b))) continue;
      if (this.LINE_KEYS[b.key] && b.construction > 0 && S.buildings.some(o => o !== b && o.owner === 'P' && this.LINE_KEYS[o.key] && o.construction > 0 &&
        Math.hypot(o.x - b.x, o.y - b.y) <= 6 && S.units.some(u => on(u, o)))) continue;
      return b;
    }
    return null;
  },

  /* ---- what the new beats ask of the world (every one a read, never a write) ---- */
  // a hand SENT to a good since its line was first asked — the order, never its first load home
  ordered(res) {
    const n = this.gatherers(res).length, base = this._g0 && this._g0[res] != null ? this._g0[res] : 0;
    return n > base;
  },
  _snapGather() { const o = {}; for (const r of ['food', 'wood', 'stone', 'gold']) o[r] = this.gatherers(r).length; this._g0 = o; },
  // the hall's own storey going up (the works a `raise` beat sends hands to)
  tcWorks() { const tc = this.tc(); return tc && tc.upgrading > 0 ? tc : null; },
  // a station standing, or raised with hands on it: the lesson goes on while it rises
  raised(key) { if (!this.has(key)) return false; const w = this.siteOf(key); return !w || this.builders(w).length > 0; },
  played() { return !!(S.deck && S.deck.played && S.deck.played.length); },
  /* THE HUNT (game 1 since build 195): a villager in hand → the nearest deer in sight (a
     deer in the fog cannot be tapped: its meadow, then); else the hand to
     send. The order is the line's answer; the kill — a killing ground the
     lodge may stand on (G.noteHunt) — is the result */
  prey(from) {
    const tc = this.tc(), o = from || (tc ? { x: Bld.cx(tc), y: Bld.cy(tc) } : { x: CFG.W / 2, y: CFG.H / 2 });
    let best = null, bd = 1e9;
    for (const u of S.units) {
      if (u.owner !== 'W' || !Units.isPassive(u) || !(u.hp > 0) || !G.visibleAt(u.x | 0, u.y | 0)) continue;
      const d = (u.x - o.x) ** 2 + (u.y - o.y) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  huntRing() {
    const v = this.selVil(), d = this.prey(v), at = d ? { u: d.id } : this.mark('deer');
    if (v) return at;
    const iv = this.idleVil(); return iv ? { u: iv.id } : at;
  },
  huntTaps() {
    const v = this.selVil(), d = this.prey(v), at = d ? { u: d.id } : this.mark('deer');
    if (v) return at ? [at] : [];
    const iv = this.idleVil(); return [iv ? { u: iv.id } : null, at].filter(Boolean);
  },
  hunting() { return this.vils().some(u => { const t = u.tUnit && Units.get(u.tUnit); return !!(t && t.owner === 'W'); }); },
  killed() { const h = S.map && S.map.hunted; return !!(h && Object.keys(h).length); },
  // the killing ground nearest the hall that a lodge may stand on (where the deer fell)
  huntSpot() {
    const h = S.map && S.map.hunted, tc = this.tc();
    if (!h) return null;
    let best = null, bd = 1e9;
    for (const k in h) {
      const i = +k, x = i % CFG.W, y = (i / CFG.W) | 0;
      let ok = false;
      try { const v = Bld.canPlace('P', 'lodge', x, y, { noCost: true, noSeal: true }); ok = !!(v && v.ok); } catch (e) {}
      if (!ok) continue;
      const d = tc ? Math.hypot(x - tc.x, y - tc.y) : 0;
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
    }
    return best;
  },
  // a road laid: a stretch still going down, or ground already paved
  laid() { return this.has('road') || !!(S.map && S.map.roads && Object.keys(S.map.roads).length); },
  // ground paved and nothing of the line still going down (the road's boost is a finished road's)
  paved() { return !this.has('road') && !!(S.map && S.map.roads && Object.keys(S.map.roads).length); },
  /* THE ROAD THAT JOINS THE VILLAGE (operator, build 199: "we don't want them to just
     stick a single individual road in front of the town center … have the road stretch
     between two or three locations cause then we also teach the player how to click and
     drag"): game 1's road is the straight line from the map's roadFrom to its roadTo —
     past the lumber camp's door, the hall's and the farm's — and it is DRAGGED */
  roadLine() { return window.Scenarios && Scenarios.pathTiles ? Scenarios.pathTiles(['roadFrom', 'roadTo']) : []; },
  // the stretches of the line not yet laid, in order from the camp
  // a stretch another building already stands on (a save from before the line was kept) is passed over
  roadLeft() { return this.roadLine().filter(t => !Scenarios.roadAt(t[0], t[1]) && !(Scenarios.lineTaken && Scenarios.lineTaken(t[0], t[1]))); },
  // the whole line laid (going down or done): the drag's deed
  roadLaid() { return this.roadLine().length > 0 && !this.roadLeft().length; },
  // …and every stretch of it finished (the road's boost is a finished road's)
  roadPaved() {
    const line = this.roadLine();
    return line.length > 0 && line.every(t => !!(S.map.roads && S.map.roads[t[1] * CFG.W + t[0]]) || !!(Scenarios.lineTaken && Scenarios.lineTaken(t[0], t[1])));
  },
  // the price of the stretches still to lay (the beat's own: its held line names what it is short of)
  roadCost() {
    const c = Bld.effCost('P', 'road') || {}, n = Math.max(1, this.roadLeft().length), out = {};
    for (const k in c) out[k] = c[k] * n;
    return out;
  },
  /* THE DRAG CHAIN: the Build tab → the road's card (NEW) → the line still to lay,
     from its first stretch to its last: a ring at each end, gold dashes marching
     between, and the hand pressing at one end and sliding to the other (a drag —
     a tap lays one stretch). One stretch left is a tap and rings as one */
  roadRing() {
    if (UI.placing === 'road') {
      const left = this.roadLeft();
      if (!left.length) return null;
      const a = left[0], b = left[left.length - 1];
      return { x: a[0] + 0.5, y: a[1] + 0.5, r: 0.7, to: left.length > 1 ? { x: b[0] + 0.5, y: b[1] + 0.5 } : null };
    }
    const card = '.bbtn[data-key="road"]';
    if (this.vis(card)) return { sel: card };
    return this.buildDoor();
  },
  /* what R draws for a drag this frame (R.drawGuideDrag): the ringed line's two ends
     in world tiles, while its ring stands on the ground; null otherwise */
  dragHint() {
    const g = this._gr;
    if (!g || g.w !== S || !g.raw || !g.raw.to) return null;
    // a drag being made shows its own plan (the road's ghost): the dashes stand aside under it
    if (typeof UI !== 'undefined' && UI.wallDrag) return null;
    const E = this._el;
    if (!E || E.root.style.display === 'none' || E.ring.style.display === 'none') return null;
    const now = performance.now() / 1000, F = (typeof R !== 'undefined' && R.GRING && R.GRING.fadeIn) || 0.42;
    const p = Math.max(0, Math.min(1, (now - g.t0) / F));
    return { x0: g.raw.x, y0: g.raw.y, x1: g.raw.to.x, y1: g.raw.to.y, a: 1 - Math.pow(1 - p, 3) };
  },
  /* THE TOWER'S BOW (game 2): an archer on the ground who could go up, the
     one in hand, and whether any is up there (or on the stairs, or on his
     way — the order is the answer, Lookout.sentUp) */
  bow() { return S.units.find(u => u.owner === 'P' && window.Lookout && Lookout.canMan(u) && !Lookout.sentUp(u)) || null; },
  selBow() {
    const s = UI.sel; if (!s || !window.Lookout) return null;
    const ids = s.type === 'unit' ? [s.id] : s.type === 'group' ? s.ids || [] : [];
    for (const id of ids) { const u = Units.get(id); if (u && u.owner === 'P' && Lookout.canMan(u)) return u; }
    return null;
  },
  manned() { return S.units.some(u => u.owner === 'P' && window.Lookout && Lookout.sentUp(u)); },
  post() { return S.buildings.find(b => b.owner === 'P' && b.key === 'tower' && !(b.construction > 0)) || null; },
  manRing() {
    const t = this.post(); if (!t) return null;
    if (this.selBow()) return { x: Bld.cx(t), y: Bld.cy(t), r: 1.1 };
    const a = this.bow(); return a ? { u: a.id } : null;
  },
  manTaps() {
    const t = this.post(); if (!t) return [];
    const at = { x: Bld.cx(t), y: Bld.cy(t), r: 1.1 };
    if (this.selBow()) return [at];
    const a = this.bow(); return a ? [{ u: a.id }, at] : [];
  },
  // a hand sent to claim a gold seam (game 3)
  claiming() { return this.vils().some(u => u.task && u.task.type === 'claim'); },
  /* THE LINE OF A HELD BEAT: what it is short of, in the guide's words —
     true whether or not a hand is free to move (the ring says which) */
  WHERE: { food: 'the berries', wood: 'the trees', stone: 'the grey rocks', gold: 'the gold seam' },
  /* SHE NAMES THE GOOD THAT IS SHORT, AND WHERE IT COMES FROM (operator, build
     202, on game 3's bridge: "it needs more wood but actually what you need is
     more Stone … in general whenever you're short a RESOURCE, the notification
     from Mira should be intelligent about what RESOURCE you're short of"): the
     good is read off the beat's own price (goalCost — a beat that names none
     fell back on the hall's next storey, which asks wood); gold, which no hand
     gathers, is named once the gatherable goods are in, and every good is sent
     where this world really has it: stone to the trading post where no rock
     stands near the hall, gold to the mine, the post, or the hall's own
     trickle (tests/prologue.mjs heldLinesNameTheGoodThatIsShort) */
  goldShort() { const c = this.goalCost() || {}; return (c.gold || 0) > (S.res.gold || 0); },
  gatherShort() { const c = this.goalCost() || {}; return ['food', 'wood', 'stone'].some(k => (c[k] || 0) > (S.res[k] || 0)); },
  rocksNear() {
    const tc = this.tc(); if (!tc) return true;
    for (let y = Math.max(0, tc.y - 18); y <= Math.min(CFG.H - 1, tc.y + 18); y++)
      for (let x = Math.max(0, tc.x - 18); x <= Math.min(CFG.W - 1, tc.x + 18); x++)
        if (S.map.terrain[y * CFG.W + x] === T.HILLS && (S.map.resAmount[y * CFG.W + x] || 0) > 0) return true;
    return false;
  },
  // a good this world gives by trade, not by hand: gold with no mine, stone with no rock near
  byTrade(r) { return this.has('trade', true) && ((r === 'gold' && !this.has('mine', true)) || (r === 'stone' && !this.rocksNear())); },
  payFor(r) { return ['wood', 'food', 'stone'].filter(k => k !== r).reduce((a, k) => ((S.res[k] || 0) > (S.res[a] || 0) ? k : a)); },
  howGet(r, coming) {
    if (this.byTrade(r)) return this.caravanFor(r) ? 'The caravan brings it soon.' : 'Trade ' + this.payFor(r) + ' for it at the trading post.';
    if (r === 'gold') return this.has('mine', true) ? 'Our gold mine brings it in.' : 'Our hall makes a little each day.';
    return coming ? 'It is coming in.' : 'Gather it at ' + (this.WHERE[r] || 'the hills') + '.';
  },
  needLine(thing, res, coming) {
    const r = this.naming(res || (!this.gatherShort() && this.goldShort() ? 'gold' : this.need()));
    return thing + ' needs more ' + r + '. ' + this.howGet(r, coming);
  },
  // what a held line's ring points at: the trading post for a good bought there, nothing for the hall's gold, else the hands
  shortRing(good, taps) {
    if (good && this.byTrade(good)) { const t = this.caravanFor(good) ? null : this.tradeRing(good, this.payFor(good)); return taps ? (t ? [t] : []) : t; }
    if (good === 'gold') return taps ? [] : null;
    return taps ? this.gatherTaps(false, good || false) : this.gatherRing(false, good || false);
  },
  // the line when a gather beat needs a hand again
  gatherLine() {
    const sel = this.selVil(), iv = this.idleVil();
    if ((sel && this.isIdle(sel)) || (!sel && iv && this.isIdle(iv))) return 'A villager is idle. Put them to work.';
    const r = this.naming(this.need());
    return 'We need ' + r + '. Send someone to ' + (this.WHERE[r] || 'gather it') + '.';
  },
  /* THE HAND TO MOVE while the goal waits on goods, and then its work: the
     selected hand when it is idle (to the good the hands are fewest on — or,
     under a line that NAMES a good, to that good) or on another good (to the
     one the goal is shortest of); else an idle hand; else, with nobody on the
     short good at all, a hand on other work. A hand building or stationed is
     never pulled off. Null: every hand is on it. */
  gatherRing(idleOnly, named) {
    const need = (typeof named === 'string' && named) || this.need(), sel = this.selVil(), busy = u => this.busy(u);
    if (sel && !busy(sel)) {
      // a hand in hand that cannot reach the good from where it stands is passed over (build 196)
      if (this.isIdle(sel)) { const t = this.workFor(sel, named ? need : this.spread(sel)); if (t) return t; }
      else if (!idleOnly && !this.onRes(sel, need)) { const t = this.workFor(sel, need); if (t) return t; }
    }
    const iv = this.idleFor(named ? need : null, sel);
    if (iv) return { u: iv.id };
    if (idleOnly || this.gatherers(need).length) return null;
    const h = this.spareHand();
    // never the hand already in hand: a tap on it again would only let it go
    return h && h !== sel ? { u: h.id } : null;
  },
  gatherTaps(idleOnly, named) {
    const r = this.gatherRing(idleOnly, named);
    if (!r) return [];
    if (r.u === undefined) return [r];
    const u = Units.get(r.u), need = (typeof named === 'string' && named) || this.need();
    return [r, u ? this.workFor(u, this.isIdle(u) && !named ? this.spread(u) : need) : null].filter(Boolean);
  },
  // a works of the current beat still wanting hands, and the chain that sends them
  _needsHands(b) {
    const w = b.site ? b.site.call(this) : null;
    if (!w || !(w.construction > 0 || w.upgrading > 0)) return false;
    return this.builders(w).length < Math.max(1, Math.min(b.hands || 1, this.vils().length));
  },
  handsRing(b) {
    const w = b.site.call(this); if (!w) return null;
    const at = { x: Bld.cx(w), y: Bld.cy(w), r: w.key === 'tc' ? 1.4 : 1.2 }, sel = this.selVil();
    if (sel && !this.buildsAt(sel, w)) return at;
    const v = this.handFor(w); return v ? { u: v.id } : null;
  },
  handsTaps(b) {
    const w = b.site.call(this); if (!w) return [];
    const at = { x: Bld.cx(w), y: Bld.cy(w), r: 1.2 }, sel = this.selVil();
    if (sel && !this.buildsAt(sel, w)) return [at];
    const v = this.handFor(w); return v ? [{ u: v.id }, at] : [];
  },

  /* ================= THE RUNNER ================= */
  _got: {},
  _n0: 0,
  _beats: null,
  /* THE SCRIPT'S CLOCK, in ms: the seconds simTick is handed (G.frame's real
     dt, the harness's own step), so a line's reading time, the auto lines,
     the idle hand and the asides run on tools/ai-harness.mjs's virtual clock
     exactly as on a phone, and a paused world holds them. Never the page's
     wall clock: a harness that fast-forwards the sim inside one task would
     wait forever on a 3-second line. */
  _clk: 0,
  now() { return this._clk * 1000; },
  beat() { return this._beats && S.pro ? this._beats[S.pro.i] || null : null; },
  // a world became live (G.newGame / loadJSON): the script is this world's
  onWorldChange() {
    this._got = {};
    this._beats = null;
    this._aside = null; this._asideT = {}; this._asideWait = {};
    this._shown = null; this._viewKey = null; this._lineT0 = 0; this._beatT0 = 0; this._praise = ''; this._g0 = null; this._ackAt = {};
    this._needS = null; this._said = null; this._breathTo = 0; this._hintKey = null; this._bannerAt = 0; this._miniAt = 0; this._healAt = 0;
    this._hand = null; this._handN = 0; this._clk = 0; this._lastIn = 0;
    this._finale = null; this._held = null;
    this._seated = null; this._deckOpen = false; this._collapsed = false;
    this._celebrate = []; this._looked = null; this._lookCam = null; this._lookStuck = null; this._lookAt = 0; this._gliding = false;
    if (typeof S !== 'undefined' && S && S.scenario) {
      const g = Scenarios.game();
      this._beats = (this.SCRIPTS[g] ? this.SCRIPTS[g].call(this) : []);
      if (!S.pro) S.pro = { i: 0, done: {}, said: {}, n0: this.vils().length, t: {}, fl: {}, h0: this.count('house', true) };
      // a save from before the top bar answered: its first harvest, roof and newborn are long past
      if (!S.pro.fl) S.pro.fl = { food: 1, wood: 1, stone: 1, room: 1, born: 1 };
      if (S.pro.h0 == null) S.pro.h0 = this.count('house', true);
      this._n0 = S.pro.n0 != null ? S.pro.n0 : this.vils().length;
      this._deckOpen = !!(S.pro.said && (S.pro.said.deck || S.pro.said.cards));
    } else this.hide();
  },
  /* the deck stays out of the first game, and arrives in the second when the
     Elder teaches it; the third is the real game */
  deckHolds() {
    const g = Scenarios.game();
    if (g === 1) return true;
    if (g === 2) return !(this._deckOpen || (S.pro && S.pro.said && S.pro.said.deck));
    return false;
  },
  modalUp() { return !!(this._held && this._asking); },
  /* the first of each good a journey game brings home flies to its counter
     (whatever line is up) and the counter flutters gold as it lands — once a
     good a game, remembered in the save (S.pro.fl), so a Continue says nothing twice */
  onGather(u, res, take) {
    this._got[res] = (this._got[res] || 0) + take;
    const fl = S.pro && S.pro.fl;
    if (!fl || fl[res] || this._got[res] < 1 || !(res === 'food' || res === 'wood' || res === 'stone')) return;
    fl[res] = 1;
    this.fly(res, u.x, u.y);
  },
  /* THE PEOPLE COUNTER ANSWERS THE HOUSE (operator, build 185: "do the same
     thing as well for the house and then give a little flutter around the
     population and that lets the user know that they've increased their
     population"): the first house a game raises lifts the room (the chip's
     second number), and the first villager born the people (its first) — the
     chip flutters gold the tick either happens, once each a game */
  _chipWatch() {
    const P = S.pro, fl = P && P.fl;
    if (!fl) return;
    if (!fl.room && this.count('house', true) > (P.h0 || 0)) { fl.room = 1; this.flutter('pop'); }
    if (!fl.born && this.vils().length > this._n0) { fl.born = 1; this.flutter('pop', true); }
  },

  /* the script's clock: the SIM's (G.simStep), in real seconds. Every tick
     asks the current beat where it stands (_phaseOf) and says a new line
     the moment that changes — the deed and its answer share a tick. */
  simTick(dt) {
    if (!S || !S.scenario || S.over || !this._beats) return;
    if (!S.pro) return;
    this._clk += (dt > 0 ? dt : 0);
    this._chipWatch();
    this._scoutTick();
    if (this._sallyTick) this._sallyTick();
    const P = S.pro, now = this.now();
    // the breath after a deed (SPACE): its praise stands, nothing new is asked
    if (this._breathTo) {
      if (now < this._breathTo) { this._asides(dt); return; }
      this._breathTo = 0;
    }
    for (let step = 0; step < 4; step++) {
      let b = this.beat();
      // pass over what has nothing to teach here, or is already done
      let guard = 0;
      while (b && guard++ < 20) {
        if (b.skipIf && b.skipIf.call(this)) { this._advance(b, true); b = this.beat(); continue; }
        if (!P.said[b.id] && !b.auto && b.done && b.done.call(this) && !this._viewKey) { this._advance(b, true); b = this.beat(); continue; }
        break;
      }
      if (!b) { if (!this._aside) this._shown = null; this._viewKey = null; break; }
      const ph = this._phaseOf(b);
      this._goalBeat = b;
      if (ph === 'silent') { if (!this._aside) this._shown = null; this._viewKey = null; break; }
      if (this._viewKey !== this._keyOf(b, ph, this._shown) || !this._shown) this._show(b, ph);
      if (b.auto) { if (now - this._beatT0 >= b.auto) { this._advance(b); continue; } break; }
      // the result: the next beat is asked in this same tick
      // (with a breath, the praise stands alone: the next line waits for the breath's end)
      if (!this._heldPh(b, ph) && b.done && b.done.call(this)) { this._complete(b); if (this._breathTo) break; continue; }
      break;
    }
    this._asides(dt);
  },
  /* where a beat stands: held (its `when` not yet true — said only if it has
     a `hold` line, else silent), ask (its line), hands (asked and ordered,
     its works waiting on builders), wait (ordered, the world at work) */
  /* SPACE TO THINK (operator, build 196: "We dictate pretty much every single
     button clicking game one in game two we want to give them a little bit of
     space to determine what to do and then in game three, we really wanna back
     off and give them a lot more space … giving enough time and space for the
     player in between actions"). Per game:
       ring    a line's ring (and the look that brings its target out) waits
               this long with no input before it shows — the player is left
               to find the way first; once shown it follows the chain at once
       fresh   the same wait for a NEW control the line names (`hint: 'new'`:
               the minimap, the rank chevrons, Tactics), shorter: the player
               has never seen it
       idle    the hand's wait (game 1's IDLE_MS)
       breath  after a deed, its praise stands alone this long before the next
               line — game 1 says both in one breath */
  SPACE: {
    1: { ring: 0, fresh: 0, idle: 6000, breath: 0 },
    2: { ring: 3500, fresh: 1500, idle: 9000, breath: 1400 },
    3: { ring: 8000, fresh: 3500, idle: 14000, breath: 2200 },
  },
  space() { const g = typeof Scenarios !== 'undefined' && Scenarios.game ? Scenarios.game() : 0; return this.SPACE[g] || this.SPACE[1]; },
  // a line's ring may show: at once in game 1, else once the player has been left alone with it long enough
  _hintOpen(v, now) {
    if (!v || !v.beat || this._aside === v) return true;
    const sp = this.space(), h = v.beat.hint;
    const wait = typeof h === 'number' ? h : h === 'new' ? sp.fresh : sp.ring;
    if (!wait || (this._hintKey && this._hintKey === this._viewKey)) return true;
    if (now - Math.max(this._lineT0 || 0, this._lastIn || 0) >= wait) { this._hintKey = this._viewKey; return true; }
    return false;
  },
  /* an order given stays given for ACK_HOLD: a soldier between two raiders
     holds no mark for a tick, and the line flickered back to its ask */
  ACK_HOLD: 1500,
  _acked(b) {
    if (!b.ack) return false;
    const now = this.now();
    if (b.ack.call(this)) { this._ackAt[b.id] = now; return true; }
    const t = this._ackAt[b.id];
    return t != null && now - t < this.ACK_HOLD;
  },
  _phaseOf(b) {
    // waiting on goods: 'held' while a hand can still be sent, 'gwait' once every hand is on it
    if (b.when && !S.pro.said[b.id] && !b.when.call(this)) return b.hold ? (b.holdRing || this.gatherRing(false, true) ? 'held' : 'gwait') : 'silent';
    if (this._acked(b)) {
      if (b.site && this._needsHands(b)) return 'hands';
      if (b.wait) return 'wait';
    }
    if (b.gather && b.gwait && S.pro.said[b.id] && !this.gatherRing()) return b.tip && b.tip.when.call(this) ? 'tip' : 'gwait';
    return 'ask';
  },
  // the line a phase says, and what it rings (a view: the bot, the frame and the hand all read it)
  _viewOf(b, ph) {
    const P = this, base = { id: b.id, beat: b, phase: ph, goal: b.goal };
    const txt = t => typeof t === 'function' ? t.call(P) : t;
    // a line that names a good keeps it (`good`), and its ring sends hands to that good
    const named = (o) => { P._said = null; const text = o.text(); return Object.assign(base, o, { text, good: P._said,
      ring: () => P.shortRing(base.good), taps: () => P.shortRing(base.good, true), gather: true }); };
    // a beat that rings its own target while held (game 3's catapult: the trading post)
    if (ph === 'held' && b.holdRing) return Object.assign(base, { face: b.holdFace || 'thinking', text: txt(b.hold),
      ring: b.holdRing, taps: () => { const r = b.holdRing.call(P); return r ? [r] : []; } });
    if (ph === 'held') return named({ face: b.holdFace || 'thinking', text: () => txt(b.hold) });
    // every hand is on it: said at once, so a tap that sent the last one is answered
    if (ph === 'gwait') return named({ face: 'pleased', text: () => b.hold && !S.pro.said[b.id] ? b.hold.call(P, true) : txt(b.gwait) });
    if (ph === 'hands') return Object.assign(base, { face: 'point', text: txt(b.handsText) || 'Now send a villager to build it.', ring: () => P.handsRing(b), taps: () => P.handsTaps(b) });
    // every hand at work and a hand to spare: the beat's tip, ringing what acts on it
    if (ph === 'tip') return Object.assign(base, { face: b.tip.face || 'point', text: txt(b.tip.text), ring: b.tip.ring, taps: () => { const r = b.tip.ring.call(P); return r ? [r] : []; } });
    // a battle's waiting line (`still`) points at nothing: the fight is the thing to watch
    if (ph === 'wait') return Object.assign(base, { face: b.waitFace || 'pleased', text: txt(b.wait),
      ring: () => b.still ? null : P.gatherRing(true), taps: () => b.still ? [] : P.gatherTaps(true) });
    return Object.assign(base, { face: b.face, text: txt(b.text), ring: b.ring, taps: b.taps, auto: b.auto, gather: b.gather, look: b.look });
  },
  /* a view's key: the beat, the phase — and, for a line that names a good, the
     good it would name NOW (need() is kept while still short, so the key moves
     only when that good is in, and the line naming the next is said at once) */
  _keyOf(b, ph, v) {
    const k = b.id + ':' + ph;
    // a held line that rings its own target is said again when its words change
    if (ph === 'held' && b.holdRing && b.hold) { try { return k + ':' + b.hold.call(this); } catch (e) { return k; } }
    return v && v.beat === b && v.phase === ph && v.good ? k + ':' + this.need() : k;
  },
  // a phase that waits on the beat's `when` (its line not yet asked)
  _heldPh(b, ph) { return ph === 'held' || (ph === 'gwait' && !!b.when && !S.pro.said[b.id]); },
  _show(b, ph) {
    const P = S.pro, v = this._viewOf(b, ph), now = this.now(), prev = this._shown;
    const fresh = prev ? prev.beat !== b : true;
    this._shown = v;
    this._lineT0 = now;
    if (fresh) { this._beatT0 = now; this._handN = 0; this._looked = null; }
    this._lastIn = Math.max(this._lastIn, now);   // the idle hand counts from the line
    this._hand = null;
    this._collapsed = false; this._acted = false;
    if (!this._heldPh(b, ph) && !P.said[b.id]) {
      P.said[b.id] = 1;
      P.t[b.id] = Math.round(S.playtime || 0);
      this._snapGather();
      if (b.on) { try { b.on.call(this); } catch (e) { console.error('prologue beat', b.id, e); } }
      this.track('shown', { game: Scenarios.game(), beat: b.id, i: P.i });
    }
    // the last hand sent: the waiting line answers it
    if (ph === 'gwait' && prev && prev.beat === b && (prev.phase === 'held' || prev.phase === 'ask' || prev.phase === 'tip') && !this._praise) this._praise = 'Good.';
    /* a gather line asked again (a hand went idle, a good ran short — or the
       good it named came in and the next is short): why, not the lesson again;
       a line naming a good rings that good */
    if (ph === 'ask' && b.gather && prev && prev.beat === b && (prev.phase === 'gwait' || prev.phase === 'tip' || (prev.phase === 'ask' && prev.good))) {
      this._said = null;
      v.text = this.gatherLine(); v.face = 'point'; v.good = this._said;
      if (v.good) { v.ring = () => this.gatherRing(false, v.good); v.taps = () => this.gatherTaps(false, v.good); }
    }
    this._viewKey = this._keyOf(b, ph, v);
    // the deed just done is praised in the next line's first words
    if (this._praise) {
      const both = this._praise + ' ' + v.text;
      if (both.split(/\s+/).filter(Boolean).length <= 15) v.text = both;
      this._praise = '';
    }
    if (!this._aside) this.say(v.text, v.face);
  },
  _complete(b) {
    const P = S.pro;
    const raw = this._shown && this._shown.beat === b && this._shown.ring ? this._shown.ring.call(this) : null;
    this.celebrate(raw ? this._resolve(raw) : null);
    this.track('beat', { game: Scenarios.game(), beat: b.id, i: P.i,
      shown_ms: Math.round(((P.t[b.id] != null ? P.t[b.id] : 0)) * 1000),
      done_ms: Math.round((S.playtime || 0) * 1000), hints: this._handN, hand: this._handN ? 1 : 0 });
    this._advance(b);
    this._praise = (typeof b.praise === 'function' ? b.praise.call(this) : b.praise) || '';
    /* SPACE: games 2 and 3 let the deed land — its praise stands alone a
       breath (SPACE[g].breath) before the next line asks anything; a deed with
       no praise of its own is answered all the same, so no tap goes unanswered */
    const br = this.space().breath;
    if (br > 0) {
      const t = this._praise || 'Good.';
      this._praise = '';
      this._breathTo = this.now() + br;
      this._lineT0 = this.now();
      /* the praise is the whole view while it stands: no ring, no hand, and the
         goal it earned ticked off (the task line, and the strip a folded card
         keeps, both say it is done); a card the player is working under is
         opened for it — unless the player folded it themselves */
      const g0 = b.goal ? (typeof b.goal === 'function' ? b.goal.call(this) : b.goal) : '';
      const done = g0 ? '✓ ' + String(g0).split(': ')[0] : '';
      this._shown = { id: b.id, beat: b, phase: 'praise', face: 'pleased', text: t, goal: done };
      this._goalBeat = this._shown;
      if (!this._userHid) this._collapsed = false;
      this._acted = false;
      if (!this._aside) this.say(t, 'pleased');
    }
  },
  _advance(b, silent) {
    const P = S.pro;
    P.done[b.id] = 1;
    // a beat passed over unsaid (an origin planted its station) still opens its card
    if (b.unlocks) { try { Scenarios.unlock(b.unlocks); } catch (e) {} }
    P.i++;
    this._viewKey = null;
    this._praise = '';
    if (silent) P.said[b.id] = P.said[b.id] || 0;
  },
  // a moment the player is not acting on the line: no order asked, or a line read and left alone
  _quietNow() {
    const v = this._shown, now = this.now();
    if ((window.DeckUI && DeckUI.open) || (window.Deck && Deck.acting && Deck.acting())) return false;   // her card is hidden: the news would be said to nobody
    if (!v || v.phase === 'wait' || v.phase === 'held' || v.phase === 'gwait' || v.phase === 'tip' || v.auto) return true;
    return now - this._lineT0 > 6000 && now - this._lastIn > 3000;
  },
  _asides(dt) {
    const now = this.now();
    if (this._aside) {
      const a = this._aside;
      const gone = a.auto ? now - this._asideT0 > a.auto : !a.test.call(this);
      if (gone) {   // the beat comes back, as it stands now
        this._aside = null;
        const v = this._shown;
        if (v) { this._lineT0 = now; this.say(v.text, v.face); }
      }
      return;
    }
    for (const a of this.ASIDES) {
      if (a.once && S.pro.said['aside:' + a.id]) continue;
      if (a.test.call(this)) {
        this._asideT[a.id] = (this._asideT[a.id] || 0) + dt;
        if (this._asideT[a.id] < a.hold) continue;
        // the world's news waits for a quiet moment, and is let go if none comes
        if (a.quiet && !this._quietNow()) {
          if (!this._asideWait[a.id]) this._asideWait[a.id] = now;
          if (now - this._asideWait[a.id] > this.QUIET_MAX && a.once) S.pro.said['aside:' + a.id] = 1;
          continue;
        }
        this._asideT[a.id] = 0;
        this._aside = a; this._asideT0 = now;
        if (a.once) S.pro.said['aside:' + a.id] = 1;
        this._lineT0 = now; this._hand = null; this._collapsed = false;
        this.say(a.text, a.face);
        this.track('shown', { game: Scenarios.game(), beat: 'aside:' + a.id, i: S.pro.i });
        return;
      } else this._asideT[a.id] = 0;
    }
  },

  /* ================= ONE VOICE =================
     THE JOURNEY SPEAKS WITH ONE VOICE (operator, build 181: "cut the amount
     of notifications down by like 70% … they clash with the instructions"):
     in a journey world the guide's line IS the instruction, so the world's
     news goes to the chronicle and is not toasted — every line of it still
     lands in S.log. Never quieted: a refusal to the player's own act (tap
     rule 4: G.log's `refusal`, and every refusal ui.js toasts directly),
     and the news a player must act on that the guide does not say — a
     famine, a desertion, a death, the rival's monument, a hall fallen, and
     an attack, except the scripted raid's, which the guide's own line
     announces. */
  KEEP: /☠|famine|desert|starv|was killed|monument|has raised|has fallen/i,
  /* THE LINE TOOL'S OWN WORDS (operator, build 187, laying the bridge's three
     sections): the arming instruction ("Drag along the ground…") and the
     line's summary ("Wall line: 1 section — builder en route…", "…needs a
     builder") are the guide's in a journey world — her ring shows where to tap
     and her line asks for hands; three sections said seven things over her.
     The seal warning is hers too while her own line asked for the closing
     stone (the gate is the next lesson); anywhere else it is said as ever. */
  toolQuiet(what) {
    if (typeof S === 'undefined' || !S || !S.scenario || S.over || (window.Screens && Screens._demo) || !this._beats) return false;
    if (what === 'sealed') { const v = this._shown; return !!(v && /^wall/.test(v.id)); }
    return true;
  },
  quiet(msg, warn, refusal) {
    if (refusal || typeof S === 'undefined' || !S || !S.scenario || (window.Screens && Screens._demo)) return false;
    const m = String(msg == null ? '' : msg);
    if (/under attack/i.test(m)) return this._raidSaid();
    if (/ was killed$/.test(m) && !/^Villager/i.test(m) && this._battle()) return true;
    return !this.KEEP.test(m);
  },
  // the guide is already telling the player about the attack (game 2's scout at the wall, game 3's battle)
  _raidSaid() {
    const v = this._shown;
    if (v && v.id === 'scout' && this.scout()) return true;
    return this._battle();
  },

  /* ================= THE GUIDE ON SCREEN =================
     MIRA, the clan's young storyteller (operator, build 181: "a younger
     woman … pretty but not aggressively beautiful … double or triple the
     number of images"; build 182: "focus more on European ancestors
     somewhere between Scotland, France, Italy, and Greece" — the clan's
     third age is Rome's legions): an auburn-haired Gaulish girl, a braided
     crown, freckles, a terracotta mantle with a Greek-key border pinned at
     the shoulder over a cream tunic. Nine faces, ONE PixelLab portrait
     edited into each expression so she is the same woman in every one
     (assets/ui/mira/: the 128px masters and their Scale2x doubles, shown at
     64/56/48 CSS px). The code keeps the old Elder's ids (#proElder …); the
     player meets Mira. Her faces were redrawn under the same names, so
     their URL carries its own step after the art's version ('.2'): a
     device that held build 181's faces fetches the new ones, and no other
     picture in the game is fetched again for it. */
  NAME: 'Mira',
  FACES: ['neutral', 'pleased', 'concerned', 'point', 'excited', 'thinking', 'proud', 'surprised', 'determined']
    .reduce((o, f) => { o[f] = 'assets/ui/mira/mira-' + f + '-2x.png?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 0) + '.2'; return o; }, {}),
  // asked as the world is founded: a new face never blinks in empty
  _warmFaces() {
    if (this._facesWarm) return;
    this._facesWarm = [];
    for (const k in this.FACES) { const im = new Image(); im.src = this.FACES[k]; this._facesWarm.push(im); }
  },
  _el: null,
  _dom() {
    if (this._el) return this._el;
    this._css();
    const root = document.createElement('div');
    root.id = 'proUI';
    const corners = (window.SettingsPage && SettingsPage.cornerSvg)
      ? [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="pc ${c}">${SettingsPage.cornerSvg('proc' + c, fx, fy)}</i>`).join('') : '';
    /* THE TASK RIDES IN THE CARD (operator, build 186: "instead [of] a separate
       gold tag for the task … incorporate that into the image text … The key is
       not to make the instructions any taller"): the card's header line — where
       her name stood — carries the standing objective, and her name is a gold
       plate on her portrait's frame. Folded, the card is a slim strip in the
       same place: her portrait and the same task line. */
    const task = '<span class="peTask" aria-live="polite"><i class="pgd"></i><span class="pgt"></span><span class="pgn"></span></span>';
    root.innerHTML =
      '<i id="proRing"></i>' +
      '<div id="proElder" role="dialog" aria-label="' + this.NAME + ', your guide">' + corners +
        '<div class="pePic"><img alt="" src="' + this.FACES.neutral + '"><b class="peName">' + this.NAME + '</b></div>' +
        '<div class="peBody">' + task + '<p class="peTxt"></p>' +
          '<div class="peAsk"><input class="peIn" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Your name">' +
          '<button class="peBtn gold" type="button" data-act="me">That\'s me</button></div></div>' +
        '<button class="peHide" type="button" aria-label="Fold her card away">▴</button>' +
      '</div>' +
      '<button id="proMini" type="button" aria-label="' + this.NAME + ', your guide: show her line"><span class="pmPic"><img alt="" src="' + this.FACES.neutral + '"></span>' +
        task + '<i class="pmOpen" aria-hidden="true">▾</i></button>' +
      '<div id="proHand" aria-hidden="true">' + this.HAND_SVG + '<i class="phr"></i></div>' +
      '<div id="proFx" aria-hidden="true"></div>';
    document.body.appendChild(root);
    const E = this._el = {
      root, ring: root.querySelector('#proRing'),
      elder: root.querySelector('#proElder'), pic: root.querySelector('#proElder .pePic img'),
      // the task line: the card's header (E.goal, the objective the tests read) and the folded strip's
      goal: root.querySelector('#proElder .peTask'), miniTask: root.querySelector('#proMini .peTask'),
      txt: root.querySelector('.peTxt'), ask: root.querySelector('.peAsk'), inp: root.querySelector('.peIn'),
      mini: root.querySelector('#proMini'), miniPic: root.querySelector('#proMini img'),
      hand: root.querySelector('#proHand'), fx: root.querySelector('#proFx'),
    };
    this._warmFaces();
    E.mini.addEventListener('click', () => { this._collapsed = false; this._userHid = false; this._lineT0 = this.now(); });
    root.querySelector('.peHide').addEventListener('click', () => { this._collapsed = true; this._userHid = true; });
    root.querySelector('[data-act="me"]').addEventListener('click', () => this._named());
    E.inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this._named(); } });
    // any touch is input: the idle hand stands down and counts again
    document.addEventListener('pointerdown', e => {
      this._lastIn = this.now(); if (this._hand) this._hand = null; if (this._shown) this._acted = true;
      if (e && e.target && e.target.id === 'mini') this._miniAt = this.now() + 1e-3;   // the map lesson's deed: a tap on the map
    }, true);
    // the banner lesson's deed: an army's banner tapped (its own handler stops the click)
    document.addEventListener('click', e => {
      const c = e.target && e.target.closest;
      if (!c) return;
      if (e.target.closest('#armyBar button')) this._bannerAt = this.now() + 1e-3;
      if (e.target.closest('#panel [data-act="heal"]:not(.cant), #panel [data-act="gheal"]:not(.cant)')) this._healAt = this.now() + 1e-3;
    }, true);
    // a tap on a grey (.cant) action in the panel: the greyed lesson's deed (its refusal is the game's own toast)
    document.addEventListener('click', e => { const t = e.target && e.target.closest && e.target.closest('#panel .cant'); if (t) this._greyAt = this.now() + 1e-3; }, true);
    return E;
  },
  say(text, face) {
    const E = this._dom();
    this.up = true;
    if (E.txt.textContent !== text) {
      E.txt.textContent = text;
      E.elder.classList.remove('in'); void E.elder.offsetWidth; E.elder.classList.add('in');
    }
    const src = this.FACES[face] || this.FACES.neutral;
    if (E.pic.getAttribute('src') !== src) E.pic.setAttribute('src', src);
    if (E.miniPic.getAttribute('src') !== src) E.miniPic.setAttribute('src', src);
    E.elder.dataset.face = face || 'neutral';
    E.ask.style.display = this._asking ? '' : 'none';
  },
  hide() {
    this.up = false;
    if (this._el) this._el.root.style.display = 'none';
  },
  // where the Elder sits: never over what its beat points at
  _band() {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const tb = document.getElementById('topbar'), bb = document.getElementById('bottombar'), tg = document.getElementById('bmToggle');
    const top = tb && tb.offsetParent !== null ? tb.getBoundingClientRect().bottom : 0;
    let bot = vh;
    if (bb && bb.offsetParent !== null) bot = Math.min(bot, bb.getBoundingClientRect().top);
    if (tg && tg.offsetParent !== null) bot = Math.min(bot, tg.getBoundingClientRect().top);
    return { vw, vh, top, bot };
  },
  frame(dt) {
    if (!S || !S.scenario || !window.Screens || Screens.current !== 'playing' && !this._held) {
      if (this._el && this._el.root.style.display !== 'none') this._el.root.style.display = 'none';
      if (document.body.classList.contains('pro-nobuild')) document.body.classList.remove('pro-nobuild');
      if (this._goalH) { this._goalH = 0; document.body.style.setProperty('--pro-h', '0px'); }
      if (this._mapH) { this._mapH = 0; document.body.style.setProperty('--pro-map', '0px'); }
      return;
    }
    const E = this._dom();
    E.root.style.display = '';
    // nothing to build yet (game 1's first minute): no Build tab and no empty menu
    const nob = !!(S.allow && !S.allow.length);
    if (document.body.classList.contains('pro-nobuild') !== nob) document.body.classList.toggle('pro-nobuild', nob);
    const now = this.now();
    const B = this._band();
    const line = this._aside || this._shown || (this._held ? { text: E.txt.textContent } : null);
    const b = this._aside || this._shown;
    /* the target the pulse rings, on screen (and brought into view): the
       line's own, or — under the world's news, which keeps it — the beat's.
       Never a target already acted on: between the tap and the next sim
       tick the old line still stands, and its ring would flash back to
       where the player has just been (the Build tab, a ✓ ago) */
    let rb = b && b.ring ? b : (this._aside && this._aside.keepRing ? this._shown : null);
    if (rb && this._stale(rb)) rb = null;
    // games 2 and 3 leave the player to find the way first (SPACE): no ring, and no look, until then
    if (rb && !this._hintOpen(rb, now)) rb = null;
    const raw = rb && rb.ring ? rb.ring.call(this) : null;
    // a ringed build card is brought into the menu's view until it is seen there
    if (raw && raw.sel && raw.sel.indexOf('.bbtn') === 0) this._cardInView(raw.sel); else if (this._cardSt) this._cardSt.sel = '';
    const tgt = raw ? this._resolve(raw) : null;
    /* the ring stands only where a tap can reach it: a target under the
       panel, the minimap or a bar is not ringed until the look has brought
       it into the open — a ring drawn over the hall's panel was tapped, and
       the tap landed on its Cancel */
    const open = Screens.current === 'playing' && !this._held ? this._look(raw, tgt, B) : true;
    /* a line that asks nothing and SHOWS something (game 2's scout at the
       wall): no ring, but the look brings what it is about into the open */
    if (!raw && !this._aside && this._shown && this._shown.look && Screens.current === 'playing' && !this._held) {
      const lk = this._shown.look.call(this);
      if (lk) this._look(lk, this._resolve(lk), B);
    }
    this._ringTo(E, open ? tgt : null, raw);
    // the task line: the standing objective, whatever line is up
    this._task(E);
    // the line: open, or folded to its strip once the player is working on it
    const reading = Math.max(3200, 1200 + 260 * ((line && line.text) || '').split(/\s+/).length);
    if (b && !b.auto && this._acted && !this._userHid && now - this._lineT0 > reading + 4000 && !this._asking) this._collapsed = true;
    // …and opens again for a player who has stopped (the hand comes with it)
    if (this._collapsed && !this._userHid && b && !b.auto && now - this._lastIn > 11000) { this._collapsed = false; this._lineT0 = now; }
    let card = !!line && !this._collapsed && !(window.DeckUI && DeckUI.open) && !(window.Deck && Deck.acting && Deck.acting());
    const seat = this._seat(E, B);
    /* the card never moves: a target it would cover that the look could not
       bring out (the map's edge), or an element under it, folds it to its strip
       for as long as that lasts — and it opens again where it was */
    if (card && open && tgt && this._seatCovers(seat, seat.w, seat.h, tgt)) card = false;
    E.elder.style.display = card ? '' : 'none';
    if (card) { this._cardH = E.elder.offsetHeight || this._cardH; this._fitTask(E.goal); }
    // #proMini and #proHand are hidden by the stylesheet: a show is an explicit value, never ''
    let strip = !card && !!(b || this._held) && !(window.DeckUI && DeckUI.open);
    if (strip) {
      this._seatMini(E, B, seat);
      if (E.mini.style.display !== 'flex') E.mini.style.display = 'flex';
      this._fitTask(E.miniTask);
      // …and a strip that would cover it too stands aside while it does
      if (open && tgt) { const r = E.mini.getBoundingClientRect(); if (this._seatCovers({ x: r.left, y: r.top }, r.width, r.height, tgt)) strip = false; }
    }
    if (!strip && E.mini.style.display !== 'none') E.mini.style.display = 'none';
    this._mapStep(B, card ? seat : null);
    this._toastStep(E, B, card, strip);
    // the idle hand: 6 s of nothing on an action beat, and it shows the taps
    this._handTick(E, b && !this._stale(b) ? b : null, now);
    this._fxTick(E, now);
  },
  /* a line whose deed is already done (or whose order was just given) stands
     only until the next sim tick says the next line: nothing to ring */
  _stale(v) {
    const b = v && v.beat;
    if (!b || b.auto || this._heldPh(b, v.phase)) return false;
    try {
      if (b.done && b.done.call(this)) return true;
      if (v.phase === 'ask' && b.ack && b.ack.call(this)) return true;
    } catch (e) {}
    return false;
  },
  /* a card past the menu's fold is no target at all: it is brought into the
     menu's view until it is SEEN there, and the player's own scrolling is left
     alone after that (UI.cardIntoView) */
  _cardSt: null,
  _cardInView(sel) { if (UI.cardIntoView) UI.cardIntoView(sel, this._cardSt || (this._cardSt = {})); },
  // a target, resolved to the screen: {x,y,r} world, {u} a unit, {sel} an element
  _resolve(t) {
    if (!t) return null;
    /* a point ON THE MINIMAP (`{mini: [x, y]}`, the map lesson): a small box round
       where that tile is drawn on #mini — a tap there carries the view to it */
    if (t.mini) {
      const el = document.getElementById('mini');
      if (!el || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      const x = r.left + (t.mini[0] + 0.5) / CFG.W * r.width, y = r.top + (t.mini[1] + 0.5) / CFG.H * r.height, h = 9;
      return { rect: { left: x - h, top: y - h, right: x + h, bottom: y + h, width: 2 * h, height: 2 * h }, x, y };
    }
    if (t.sel) {
      const el = document.querySelector(t.sel);
      if (!el || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      /* a build card scrolling in (UI.cardIntoView) is ringed from the moment the
         menu opens — the ring rides in with it from past the screen's edge — but
         not while its middle crosses the strip of the bar's own wood between the
         menu's edge and the screen's, where a tap lands on nothing — the menu's
         right edge itself included: a box's right edge is OUTSIDE it to the
         browser's hit test (build 214's wider cards let a scroll rest with the
         Dock card's middle on exactly that pixel, tests/prologue.mjs
         andItsRingWasNeverDrawnWhereATapCannotLand) */
      const box = el.closest && el.closest('#buildmenu');
      if (box) {
        const b = box.getBoundingClientRect(), cx = r.left + r.width / 2;
        if ((cx < b.left && cx >= 0) || (cx >= b.right && cx <= innerWidth)) return null;
      }
      return { rect: r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    let wx = t.x, wy = t.y, rr = t.r || 0.8, lift = 0;
    if (t.u !== undefined) {
      const u = Units.get(t.u);
      if (!u) return null;
      wx = u.x; wy = u.y; rr = 0.75; lift = CFG.SPRITE_LIFT;
    }
    if (wx === undefined) return null;
    const z = R.cam.z, TL = CFG.TILE;
    const cv = R.cv && R.cv.getBoundingClientRect ? R.cv.getBoundingClientRect() : { left: 0, top: 0 };
    const out = { x: cv.left + (wx * TL - R.cam.x) * z, y: cv.top + (wy * TL - R.cam.y) * z - lift * z, r: rr * TL * z };
    // a DRAG (game 1's road): where it ends, on the screen too
    if (t.to) out.to = { x: cv.left + (t.to.x * TL - R.cam.x) * z, y: cv.top + (t.to.y * TL - R.cam.y) * z };
    return out;
  },
  _ringTo(E, t, raw) {
    const r = E.ring;
    /* a target in the world is ringed ON THE GROUND by the renderer (R.drawGRing); the
       element stays, unseen, where it is. A man up a tower's stairs or on its platform
       stands on no ground the renderer rings: his ring stays the element's, as it was */
    let ground = !!(t && !t.rect && raw && (raw.u !== undefined || raw.x !== undefined));
    if (ground && raw.u !== undefined) {
      const u = typeof Units !== 'undefined' && Units.get ? Units.get(raw.u) : null;
      if (!u || u.perch || u.climb) ground = false;
    }
    this._gSet(ground ? raw : null);
    if (!t) { r.style.display = 'none'; return; }
    r.style.display = '';
    r.classList.toggle('ground', ground);
    if (t.rect) {
      /* a box hugs its element 5px outside it — but never past the screen's
         edge: round a full-width button (a panel's one action, the wall's
         Build Gate) three of its four sides stood off the glass (build 187),
         and a box that wide pulses in light, not in size */
      r.classList.add('box');
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const l = Math.max(3, t.rect.left - 5), tp = Math.max(3, t.rect.top - 5);
      const rt = Math.min(vw - 3, t.rect.right + 5), bt = Math.min(vh - 3, t.rect.bottom + 5);
      r.style.left = l + 'px'; r.style.top = tp + 'px';
      r.style.width = Math.max(0, rt - l) + 'px'; r.style.height = Math.max(0, bt - tp) + 'px';
      r.classList.toggle('wide', rt - l > vw * 0.8);
    } else {
      r.classList.remove('box'); r.classList.remove('wide');
      const rad = Math.max(18, t.r);
      r.style.left = (t.x - rad) + 'px'; r.style.top = (t.y - rad) + 'px';
      r.style.width = r.style.height = (rad * 2) + 'px';
    }
  },
  /* THE RING ON THE GROUND (operator, build 188: "it just kind of floats over
     the character … a ring around the character, but the ring is on the
     ground … the fade in and fade out with … gold sparkles"). A target in
     the world — a unit, a tile, a building — is ringed by the renderer
     (R.drawGRing, its 'guide' style: at his feet, behind him, breathing,
     motes rising off it), and #proRing stands over it unseen (`.ground`):
     the taps and the checks still read where the ring is. The ring fades in
     where the line points and out where it pointed; R asks for both each
     frame (groundRings). Render state, never in S or a save. */
  _gr: null,
  _grOut: [],
  _gKey(raw) { return raw.u !== undefined ? 'u' + raw.u : 't' + Math.round(raw.x * 4) + ',' + Math.round(raw.y * 4); },
  _gSet(raw) {
    const now = performance.now() / 1000, k = raw ? this._gKey(raw) : null;
    if (this._gr && this._gr.w !== S) { this._gr = null; this._grOut = []; }
    if ((this._gr ? this._gr.k : null) === k) { if (raw) this._gr.raw = raw; return; }
    if (this._gr) { this._grOut.push({ k: this._gr.k, raw: this._gr.raw, t1: now, seed: this._gr.seed }); if (this._grOut.length > 4) this._grOut.shift(); }
    this._gr = raw ? { k, raw, t0: now, w: S, seed: raw.u !== undefined ? raw.u : Math.round(raw.x * 7 + raw.y * 13) } : null;
  },
  // the rings R draws this frame: { raw, a (its fade), s (its scale), seed }
  groundRings(now) {
    const E = this._el;
    if (!E || E.root.style.display === 'none' || !S || !S.scenario) return [];
    if (this._gr && this._gr.w !== S) { this._gr = null; this._grOut = []; }
    const G = (typeof R !== 'undefined' && R.GRING) || { fadeIn: 0.42, fadeOut: 0.3 }, out = [];
    if (this._gr) {
      const p = Math.max(0, Math.min(1, (now - this._gr.t0) / G.fadeIn)), e = 1 - Math.pow(1 - p, 3);
      out.push({ raw: this._gr.raw, a: e, s: 1 + 0.24 * (1 - e), seed: this._gr.seed });
      // a drag rings its far end too (the gold dashes between are R's: dragHint)
      const to = this._gr.raw.to;
      if (to) out.push({ raw: { x: to.x, y: to.y, r: this._gr.raw.r }, a: e * 0.85, s: 1 + 0.24 * (1 - e), seed: this._gr.seed + 31 });
    }
    this._grOut = this._grOut.filter(o => now - o.t1 < G.fadeOut && now >= o.t1);
    for (const o of this._grOut) {
      const p = (now - o.t1) / G.fadeOut;
      out.push({ raw: o.raw, a: 1 - p, s: 1 + 0.1 * p, seed: o.seed });
    }
    return out;
  },
  /* THE TASK LINE (operator, build 186): the standing objective, in the card's
     header where her name stood, and on the folded strip. A goal is "Head" or
     "Head: Food 30/50 · Wood 5/30"; each good of the tail is drawn with the top
     bar's own icon, so the line and the bar answer each other. Built only when
     the words change. */
  _task(E) {
    const b = this._goalBeat || this._shown;
    let txt = b && b.goal ? (typeof b.goal === 'function' ? b.goal.call(this) : b.goal) : '';
    if (this._held) txt = '';
    txt = String(txt || '');
    if (txt === this._taskTxt) return;
    this._taskTxt = txt;
    const [head, ...rest] = txt.split(': ');
    const html = rest.join(': ').split(' · ').filter(Boolean).map(it => this._taskItem(it)).join('');
    for (const row of [E.goal, E.miniTask]) {
      row.style.display = txt ? '' : 'none';
      row.querySelector('.pgt').textContent = head;
      const n = row.querySelector('.pgn');
      n.innerHTML = html; n.style.display = html ? '' : 'none';
      row.dataset.fit = '';
    }
  },
  TASK_IC: { Food: 'food', Wood: 'wood', Stone: 'stone', Gold: 'gold', Buildings: 'bld', Walls: 'wall' },
  // a building of the hall's support, in the bar's own drawing hand (ink edge, lit plane)
  BLD_SVG: '<svg class="pic" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 23 L10 41.6 L38 41.6 L38 23" fill="#d6bf93" stroke="#140d06" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M12.6 25 L12.6 39.4 L20 39.4 L20 25 Z" fill="#ecdcb6"/><path d="M28 41.6 L28 30.4 Q24 26.6 20 30.4 L20 41.6 Z" fill="#5c3b1c" stroke="#140d06" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<path d="M3.8 26 L24 6.8 L44.2 26 Z" fill="#b5862f" stroke="#140d06" stroke-width="2.6" stroke-linejoin="round"/><path d="M8.6 23.6 L24 9.2 L28.2 13 L14.8 25.2 Z" fill="#efc76c"/>' +
    '<path d="M16.4 22.4 L24.6 14.8 M30.6 16.4 L37.4 22.6 M34 15.2 L39 19.8" stroke="#7d5821" stroke-width="1.3" stroke-linecap="round"/></svg>',
  // a stretch of wall, in the same hand: a crenellated run of dressed stone, lit from the top left
  WALL_SVG: '<svg class="pic" viewBox="0 0 48 48" aria-hidden="true"><path d="M4.6 41.6 L4.6 13.6 L13 13.6 L13 21 L19.8 21 L19.8 13.6 L28.2 13.6 L28.2 21 L35 21 L35 13.6 L43.4 13.6 L43.4 41.6 Z" fill="#a99a7a" stroke="#140d06" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M6.8 15.8 L10.8 15.8 L10.8 19.4 L6.8 19.4 Z M22 15.8 L26 15.8 L26 19.4 L22 19.4 Z M37.2 15.8 L41.2 15.8 L41.2 19.4 L37.2 19.4 Z M6.8 23.2 L41.2 23.2 L41.2 25.6 L6.8 25.6 Z" fill="#e3d6b4"/>' +
    '<path d="M5.8 31 L42.2 31 M5.8 36.4 L42.2 36.4 M16 25.6 L16 31 M30 25.6 L30 31 M10 31 L10 36.4 M23 31 L23 36.4 M36.6 31 L36.6 36.4 M16.4 36.4 L16.4 41 M30.4 36.4 L30.4 41" stroke="#5f5440" stroke-width="1.4" stroke-linecap="round"/></svg>',
  _taskItem(it) {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const m = /^(Food|Wood|Stone|Gold|Buildings|Walls) (\d+)\/(\d+)$/.exec(it);
    if (!m) return '<span class="pgi">' + esc(it) + '</span>';
    let ic = '';
    if (m[1] === 'Buildings') ic = this.BLD_SVG;
    else if (m[1] === 'Walls') ic = this.WALL_SVG;
    else {
      // the bar's own drawn good (an <img> since build 214; the vector before it)
      const s = document.querySelector('#topbar .ric[data-ic="' + this.TASK_IC[m[1]] + '"]');
      if (s) ic = s.outerHTML.replace('class="ric"', 'class="pic"');
    }
    return '<span class="pgi' + (+m[2] >= +m[3] ? ' ok' : '') + '">' + ic + '<span class="sr">' + m[1] + ' </span>' + m[2] + '/' + m[3] + '</span>';
  },
  /* THE TASK LINE NEVER WRAPS (the card is no taller for carrying it): when the
     words do not fit, the goods already in give way, then the type steps down,
     then the diamond goes, then the goods close up; only then is the head cut
     short. Measured when the words or the room change, never per frame. */
  _fitTask(row) {
    if (!row || row.style.display === 'none') return;
    const key = row.clientWidth + '|' + this._taskTxt;
    if (row.dataset.fit === key) return;
    row.classList.remove('f1', 'f2', 'f3', 'f4');
    const t = row.querySelector('.pgt'), over = () => t.scrollWidth > t.clientWidth + 0.5;
    for (const c of ['f1', 'f2', 'f3', 'f4']) { if (!over()) break; row.classList.add(c); }
    row.dataset.fit = key;
  },
  /* THE TOASTS STEP BELOW THE JOURNEY (index.html's #toasts adds --pro-h to
     its top): under the guide's card, or its folded strip — the news is never
     written over the line being read. Measured off the toasts' own column, so
     the step is exact whatever the top bar's height. */
  _toastStep(E, B, card, strip) {
    let bottom = 0;
    const s = this._seatBox;
    if (card && s) bottom = s.y + (this._cardH || s.h);
    else if (strip) bottom = E.mini.getBoundingClientRect().bottom;
    let h = 0;
    if (bottom) {
      const ts = document.getElementById('toasts'), tr = ts && ts.getBoundingClientRect();
      let base;
      if (tr && (tr.top || tr.height)) base = tr.top - (this._goalH || 0);
      else {
        const ww = document.getElementById('wonderWarn');
        base = B.top - 6 + (ww && ww.offsetParent !== null ? ww.offsetHeight + 6 : 0);
      }
      h = Math.max(0, Math.round(bottom + 6 - base));
    }
    if (this._goalH !== h) { this._goalH = h; document.body.style.setProperty('--pro-h', h + 'px'); }
  },
  /* AN OPENED MAP STANDS BELOW HER CARD: on a phone the card takes the whole
     width under the top bar, where the map opens — so the map steps down below
     it (--pro-map, read by #miniWrap and #miniToggle) rather than the card
     moving or covering it. The folded strip leaves the map's corner clear. */
  _mapStep(B, seat) {
    let h = 0;
    const mw = document.getElementById('miniWrap');
    if (seat && mw && getComputedStyle(mw).display !== 'none') {
      const r = mw.getBoundingClientRect(), top0 = r.top - (this._mapH || 0);
      if (seat.x + seat.w > r.left - 4) h = Math.max(0, Math.round(seat.y + (this._cardH || seat.h) + 8 - top0));
    }
    if (this._mapH !== h) { this._mapH = h; document.body.style.setProperty('--pro-map', h + 'px'); }
  },
  /* ONE SEAT, AT THE TOP (operator, build 186: "The instructions keep changing
     from the bottom to the top. Since the build menu is in the bottom, let's fix
     the instructions to the top, so they don't shift all over the place"): under
     the top bar, and under the rival's wonder banner while it stands — a phone's
     whole width, a desktop's 420 at the left, a phone on its side 44% at the
     left. It never moves to clear what a line points at: the look brings the
     target into the ground the card leaves open (_look), and a target that
     cannot be brought out folds the card to its strip (frame). */
  _seat(E, B) {
    const el = E.elder, vw = B.vw, vh = B.vh;
    const side = vw > vh * 1.3 && vh < 520, desk = vw >= 900;
    const w = side ? Math.min(380, Math.round(vw * 0.44)) : desk ? 420 : Math.min(vw - 16, 460);
    const x = desk ? 16 : 8;
    const ww = document.getElementById('wonderWarn');
    const y = Math.round(Math.max(B.top + 6, ww && ww.offsetParent !== null ? ww.getBoundingClientRect().bottom + 6 : 0));
    if (el.style.width !== w + 'px') el.style.width = w + 'px';
    if (el.style.left !== x + 'px') el.style.left = x + 'px';
    if (el.style.top !== y + 'px') el.style.top = y + 'px';
    return (this._seatBox = { x, y, w, h: this._cardH || 96 });
  },
  _seatCovers(s, w, h, tgt) {
    const pad = 22;
    const tr = tgt.rect ? { l: tgt.rect.left - pad, t: tgt.rect.top - pad, r: tgt.rect.right + pad, b: tgt.rect.bottom + pad }
      : { l: tgt.x - (tgt.r || 20) - pad, t: tgt.y - (tgt.r || 20) - pad, r: tgt.x + (tgt.r || 20) + pad, b: tgt.y + (tgt.r || 20) + pad };
    return !(s.x + w < tr.l || s.x > tr.r || s.y + h < tr.t || s.y > tr.b);
  },
  /* THE LOOK: a ring the player cannot see AND tap — off the visible band,
     or under a panel, the minimap or the guide's own card (or its strip) —
     brings its target into the open band: a short glide that lands it in the
     middle of the ground the guide's card leaves open. Asked again whenever
     the line, its target or the selection changes (a villager selected
     opens a panel over the ground the next line points at), and every
     LOOK_MS while the target stays covered and the camera is where the last
     look left it: the camera is the player's the moment they move it. A
     finger down waits for the lift, any touch cancels a glide, reduced
     motion makes the move at once, and a look that cannot move the camera
     (the map's edge) is not tried again for that target. */
  LOOK_MS: 1200,
  _look(raw, tgt, B) {
    if (!raw || raw.sel || raw.mini || !tgt) return true;
    if (this._gliding) return false;
    const v = this._aside || this._shown || {}, cam = R.cam, t = performance.now();
    const us = typeof UI !== 'undefined' && UI.sel ? UI.sel : null;
    const sel = us ? us.type + ':' + (us.id != null ? us.id : (us.ids ? us.ids.join(',') : '')) : '';
    const key = (v.id || '') + ':' + (v.phase || '') + ':' + (raw.u !== undefined ? 'u' + raw.u : (raw.x | 0) + ',' + (raw.y | 0)) + ':' + sel;
    const m = 24, inV = q => q.x > m && q.x < B.vw - m && q.y > B.top + m && q.y < B.bot - m && this._open(q.x, q.y) && !this._cardOver(q);
    // a drag is in view only with BOTH its ends (the road: the camp's door and the farm's)
    const inView = inV(tgt) && (!tgt.to || inV({ x: tgt.to.x, y: tgt.to.y, r: tgt.r }));
    const here = () => ({ x: cam.x, y: cam.y, z: cam.z });
    if (this._looked === key) {
      if (inView || this._lookStuck === key) return true;
      // covered since the last look: again only while the camera is where that look left it
      const lc = this._lookCam;
      if (!lc || Math.abs(cam.x - lc.x) > 2 || Math.abs(cam.y - lc.y) > 2 || Math.abs(cam.z - lc.z) > 0.001) return false;
      if (t - (this._lookAt || 0) < this.LOOK_MS) return false;
    } else if (inView) { this._looked = key; this._lookCam = here(); this._lookAt = t; return true; }
    if (typeof UI !== 'undefined' && UI.pointers && UI.pointers.size) return false;
    this._looked = key; this._lookAt = t;
    let wx = raw.x, wy = raw.y;
    if (raw.u !== undefined) { const u = Units.get(raw.u); if (!u) return false; wx = u.x; wy = u.y - CFG.SPRITE_LIFT / CFG.TILE; }
    // …and a drag is brought out by its middle, so both ends land in the open
    if (raw.to) { wx = (raw.x + raw.to.x) / 2; wy = (raw.y + raw.to.y) / 2; }
    /* into the middle of the ground the card leaves open: beside a narrow card,
       else below it — and below it too when the map's edge holds the target
       under a narrow one (a phone on its side). Each landing is tried where
       the camera can really go (the edge clamps it); the first the card
       leaves clear wins */
    const z = cam.z, TL = CFG.TILE, seat = this._seatBox, ch = this._cardH || (seat ? seat.h : 0);
    const cv = R.cv && R.cv.getBoundingClientRect ? R.cv.getBoundingClientRect() : { left: 0, top: 0 };
    const lands = [];
    if (seat && seat.w < B.vw * 0.6) lands.push([(Math.min(B.vw - 40, seat.x + seat.w) + B.vw) / 2, B.top + (B.bot - B.top) * 0.55]);
    lands.push([B.vw / 2, seat ? (Math.min(B.bot - 40, seat.y + ch) + B.bot) / 2 : B.top + (B.bot - B.top) * 0.55]);
    const x0 = cam.x, y0 = cam.y;
    let best = null;
    for (const [sx, sy] of lands) {
      cam.x = wx * TL - sx / z; cam.y = wy * TL - sy / z; if (R.clampCam) R.clampCam();
      const at = { x: cv.left + (wx * TL - cam.x) * z, y: cv.top + (wy * TL - cam.y) * z, r: tgt.r };
      const c = { x: cam.x, y: cam.y, ok: !(seat && this._seatCovers(seat, seat.w, ch, at)) };
      if (!best || (c.ok && !best.ok)) best = c;
      if (c.ok) break;
    }
    const tx = best.x, ty = best.y;
    cam.x = x0; cam.y = y0;
    // the camera cannot bring it out (the map's edge): ring it where it is, as before
    if (Math.abs(tx - x0) < 2 && Math.abs(ty - y0) < 2) { this._lookStuck = key; this._lookCam = here(); return true; }
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { cam.x = tx; cam.y = ty; this._lookCam = here(); return false; }
    const t0 = t, MS = 450, world = S;
    let stop = false;
    const cancel = () => { stop = true; };
    const end = () => { this._gliding = false; this._lookCam = here(); this._lookAt = performance.now(); document.removeEventListener('pointerdown', cancel, true); };
    document.addEventListener('pointerdown', cancel, { once: true, capture: true });
    this._gliding = true;
    const step = now => {
      if (stop || S !== world) { end(); return; }
      const k = Math.min(1, (now - t0) / MS), e = 1 - Math.pow(1 - k, 3);
      cam.x = x0 + (tx - x0) * e; cam.y = y0 + (ty - y0) * e; if (R.clampCam) R.clampCam();
      if (k < 1) requestAnimationFrame(step); else end();
    };
    requestAnimationFrame(step);
    return false;
  },
  /* would the guide's card stand over this target? Asked of where it SITS, shown
     or not: folded away over a target the look has not yet brought out, the
     card would otherwise vouch for ground it hides the moment it opens again */
  _cardOver(t) {
    const s = this._seatBox, E = this._el;
    if (!s || !t) return false;
    if (!this._collapsed) return this._seatCovers(s, s.w, this._cardH || s.h, t);
    const r = E && E.mini.style.display !== 'none' ? E.mini.getBoundingClientRect() : null;
    return !!(r && r.width) && this._seatCovers({ x: r.left, y: r.top }, r.width, r.height, t);
  },
  /* is this screen point world the player can see AND tap? The band alone is
     not enough: the minimap and the guide's own card (or its strip) stand
     over the world, and a tap under the minimap moves the camera instead of
     sending anyone (a scout's mark under it was never reached) */
  _open(x, y) {
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { return true; }
    if (!el) return true;   // no layout to ask (a page that is not drawn): trust the band
    if (el.id !== 'c') return false;
    const E = this._el;
    for (const o of [E && E.elder, E && E.mini]) {
      if (!o || o.style.display === 'none') continue;
      const r = o.getBoundingClientRect();
      if (r.width && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return false;
    }
    return true;
  },
  // the folded strip: the card's own corner, as wide as its task line — never over an opened map
  _seatMini(E, B, seat) {
    const m = E.mini;
    if (m.style.left !== seat.x + 'px') m.style.left = seat.x + 'px';
    if (m.style.top !== seat.y + 'px') m.style.top = seat.y + 'px';
    let maxW = seat.w;
    const mw = document.getElementById('miniWrap');
    if (mw && getComputedStyle(mw).display !== 'none') maxW = Math.min(maxW, mw.getBoundingClientRect().left - 8 - seat.x);
    const mx = Math.max(150, Math.round(maxW)) + 'px';
    if (m.style.maxWidth !== mx) m.style.maxWidth = mx;
  },
  /* THE HAND: after IDLE_MS (game 1's; SPACE[g].idle in each game) with
     nothing done on an action beat, a hand shows the taps, one after the
     other, until the player acts */
  IDLE_MS: 6000,
  /* A DRAG IS SHOWN, NOT GUESSED (build 199): nobody reads "drag" off a ring — a ring
     says tap, and a tap lays one stretch of road — so the hand shows a drag almost at
     once (DRAG_HAND_MS after the last touch or the new line, never the game's idle
     wait): it rests on the near ring, presses, slides along the gold dashes to the far
     ring, lifts, and fades, over DRAG_CYCLE */
  DRAG_HAND_MS: 900,
  DRAG_CYCLE: 2400,
  _handTick(E, b, now) {
    const h = E.hand;
    const can = b && !b.auto && b.taps && !this._asking && !(window.DeckUI && DeckUI.open) && Screens.current === 'playing';
    if (!can) { h.style.display = 'none'; this._hand = null; return; }
    const taps = (b.taps.call(this) || []).map(t => this._resolve(t)).filter(t => t && (t.rect || this._open(t.x, t.y)));
    const drag = taps.length && taps[0].to ? taps[0] : null;
    // …and never over a finger doing it: a press held on the map is the drag being made
    const held = !!(drag && typeof UI !== 'undefined' && UI.pointers && UI.pointers.size);
    if (held || now - this._lastIn < (drag ? this.DRAG_HAND_MS : this.space().idle)) { h.style.display = 'none'; this._hand = null; return; }
    if (!this._hand) {
      this._hand = { t0: now, i: 0 }; this._handN++; if (this._handN === 1) this._collapsed = false;
      this._looked = null;   // a player who has stopped is shown the target again, wherever the camera went
    }
    if (!taps.length) { h.style.display = 'none'; return; }
    if (drag) {
      const f = ((now - this._hand.t0) % this.DRAG_CYCLE) / this.DRAG_CYCLE;
      const s = f < 0.18 ? 0 : f > 0.78 ? 1 : (f - 0.18) / 0.6, e = s < 0.5 ? 2 * s * s : 1 - Math.pow(2 - 2 * s, 2) / 2;
      const x = drag.x + (drag.to.x - drag.x) * e, y = drag.y + (drag.to.y - drag.y) * e;
      h.style.display = 'block';
      h.style.opacity = f > 0.9 ? String(Math.max(0, (1 - f) / 0.1).toFixed(2)) : '';
      h.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      h.classList.toggle('press', f > 0.12 && f < 0.84);
      return;
    }
    if (h.style.opacity) h.style.opacity = '';
    const CYCLE = 1500, k = (now - this._hand.t0) / CYCLE, i = Math.floor(k) % taps.length, f = k - Math.floor(k);
    const p = taps[i], q = taps[(i + taps.length - 1) % taps.length];
    const mv = Math.min(1, f / 0.35), e = 1 - Math.pow(1 - mv, 3);
    const x = taps.length > 1 && i !== 0 ? q.x + (p.x - q.x) * e : p.x, y = taps.length > 1 && i !== 0 ? q.y + (p.y - q.y) * e : p.y;
    h.style.display = 'block';
    h.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    h.classList.toggle('press', f > 0.45 && f < 0.7);
  },

  /* ================= CELEBRATION ================= */
  celebrate(target, res) {
    try { UI.cue('bond'); } catch (e) {}
    const E = this._dom();
    if (target) this._burst(E, target.x, target.y);
    if (res) this.flutter(res);
  },
  _burst(E, x, y) {
    if (x == null) return;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < (reduced ? 0 : 10); i++) {
      const s = document.createElement('i');
      s.className = 'pfs';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      E.fx.appendChild(s);
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4, d = 26 + Math.random() * 22;
      const an = s.animate([{ transform: 'translate(-50%,-50%) scale(.6) rotate(45deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(45deg)`, opacity: 0 }],
        { duration: 620 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' });
      an.onfinish = () => s.remove();
    }
  },
  /* THE TOP BAR ANSWERS THE DEED (operator, build 185: "once you start
     collecting berries or chopping wood or mining the stone give a little gold
     flutter around the resource bar on the top header for that icon so then
     the player sees collect berries, I get berries at the top"): a gold ring
     hugs the chip, breathes out and fades, a few gold sparks flutter off its
     edge and its number flares gold — all CSS at the screen's own pixels (an
     effect is never chunky), over the bar. `chip` is a data-chip: food, wood,
     stone, gold or pop. Reduced motion: the ring alone, fading. */
  /* …AND IT IS SEEN (operator, build 191: "Make the gold that appears around the
     resources when they're collected a little more obvious, and last a little longer.
     We really want to connect what happens in the game to the resources in the top
     bar"): a thicker ring that breathes twice over 2.8 s, a halo behind the chip, more
     sparks thrown farther, the number gold for longer. `big` (the homestead's two chips:
     "make the dazzle a little more noticeable") breathes three times over 3.6 s with
     twice the sparks in two waves. */
  FLUTTER_MS: 2800,
  FLUTTER_BIG_MS: 3600,
  flutter(chip, big) {
    const box = typeof document !== 'undefined' && document.querySelector(`#topbar [data-chip="${chip}"]`);
    if (!box || !box.getBoundingClientRect || box.offsetParent === null) return false;
    const r = box.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const E = this._dom(), MS = big ? this.FLUTTER_BIG_MS : this.FLUTTER_MS;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._flutters = (this._flutters || 0) + 1;
    // the bar says its new number on the next frame, not the next quarter second (UI is a script const: never window.UI)
    if (typeof UI !== 'undefined') UI.refreshT = 0;
    const ring = document.createElement('i');
    ring.className = 'pflR' + (big ? ' big' : '');
    ring.dataset.chip = chip;
    ring.style.left = (r.left - 4) + 'px'; ring.style.top = (r.top - 4) + 'px';
    ring.style.width = (r.width + 8) + 'px'; ring.style.height = (r.height + 8) + 'px';
    E.fx.appendChild(ring);
    const done = () => { ring.remove(); };
    if (ring.animate) {
      const breaths = big ? 3 : 2, kf = [{ opacity: 0, transform: 'scale(.8)' }];
      for (let k = 0; k < breaths; k++) {
        const o0 = (k + 0.18) / (breaths + 0.35), o1 = (k + 0.62) / (breaths + 0.35);
        kf.push({ opacity: 1, transform: 'scale(1)', offset: +o0.toFixed(3) }, { opacity: 0.72, transform: 'scale(1.07)', offset: +o1.toFixed(3) });
      }
      kf.push({ opacity: 1, transform: 'scale(1)', offset: +(breaths / (breaths + 0.35)).toFixed(3) }, { opacity: 0, transform: 'scale(1.14)' });
      const a = ring.animate(reduced ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }] : kf, { duration: MS, easing: 'ease-out' });
      a.onfinish = done;
    } else setTimeout(done, MS);
    // the number flares gold, and the chip lifts a hair
    const num = box.querySelector('span[id]');
    if (num && num.animate) {
      const c0 = getComputedStyle(num).color;
      num.animate([{ color: '#fff4c4', textShadow: '0 0 10px rgba(255,214,120,1)' }, { color: '#ffd46a', textShadow: '0 0 8px rgba(255,200,90,.9)', offset: 0.7 }, { color: c0, textShadow: 'none' }],
        { duration: MS, easing: 'ease-out' });
    }
    if (!reduced && box.animate) box.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.18 }, { transform: 'scale(1)', offset: 0.5 }, { transform: 'scale(1.08)', offset: 0.68 }, { transform: 'scale(1)' }], { duration: big ? 1400 : 1100, easing: 'ease-out' });
    if (reduced) return true;
    // the sparks: round the chip's edge, each fluttering out — one wave, or two for the big one
    const N = big ? 18 : 16, waves = big ? 2 : 1, cx = r.left + r.width / 2, cy = r.top + r.height / 2, per = 2 * (r.width + r.height);
    for (let w = 0; w < waves; w++) for (let i = 0; i < N; i++) {
      // an even walk round the edge, started at a corner and turned a little each time (the second wave half a step on)
      let d = ((i + 0.35 + w * 0.5) / N) * per, x, y;
      if (d < r.width) { x = r.left + d; y = r.top; }
      else if ((d -= r.width) < r.height) { x = r.right; y = r.top + d; }
      else if ((d -= r.height) < r.width) { x = r.right - d; y = r.bottom; }
      else { d -= r.width; x = r.left; y = r.bottom - d; }
      let nx = x - cx, ny = (y - cy) * 2.2; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const out = 14 + (i % 3) * 6, wob = (i % 2 ? 1 : -1) * 5;
      // never up past the screen's top: a spark on the top edge drifts out sideways
      if (y + ny * out < 2) ny = Math.max(ny, 0);
      const s = document.createElement('i');
      s.className = 'pflS';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.appendChild(document.createElement('b'));
      E.fx.appendChild(s);
      const tx = nx * out, ty = ny * out, px = -ny * wob, py = nx * wob;
      const an = s.animate([
        { transform: 'translate(-50%,-50%) translate(0px,0px) scale(0) rotate(0deg)', opacity: 0 },
        { transform: `translate(-50%,-50%) translate(${(tx * 0.35 + px).toFixed(1)}px,${(ty * 0.35 + py).toFixed(1)}px) scale(1.3) rotate(40deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%,-50%) translate(${(tx * 0.72 - px).toFixed(1)}px,${(ty * 0.72 - py).toFixed(1)}px) scale(.95) rotate(85deg)`, opacity: 0.95, offset: 0.66 },
        { transform: `translate(-50%,-50%) translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(0) rotate(130deg)`, opacity: 0 }],
        { duration: 1000 + (i % 4) * 140, delay: 60 + i * 70 + w * (MS * 0.42), easing: 'cubic-bezier(.2,.7,.35,1)', fill: 'backwards' });
      an.onfinish = () => s.remove();
    }
    return true;
  },
  // THE FIRST HARVEST FLIES HOME: the good's own drawn icon from the deed to its counter, which flutters gold
  fly(res, wx, wy) {
    const E = this._dom();
    const ic = document.querySelector(`#topbar .ric[data-ic="${res}"]`);
    if (!ic) return;
    const from = this._resolve({ x: wx, y: wy }), to = ic.getBoundingClientRect();
    // a hand off the screen (or no world to fly from): the counter answers at once
    if (!from || from.x < 0 || from.y < 0 || from.x > innerWidth || from.y > innerHeight) { this.flutter(res); try { UI.cue('bond'); } catch (e) {} return; }
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = reduced ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const g = ic.cloneNode(true);
      g.setAttribute('class', 'pfly');
      g.style.left = from.x + 'px'; g.style.top = from.y + 'px';
      E.fx.appendChild(g);
      const dx = to.left + to.width / 2 - from.x, dy = to.top + to.height / 2 - from.y;
      const an = g.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.25 + (i - 1) * 18}px), calc(-50% + ${dy * 0.15 - 46}px)) scale(1.25)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)`, opacity: 1 }],
        { duration: reduced ? 400 : 900, delay: i * 90, easing: 'cubic-bezier(.35,0,.6,1)', fill: 'backwards' });
      an.onfinish = () => { g.remove(); if (i === n - 1) { this.flutter(res); try { UI.cue('bond'); } catch (e) {} } };
    }
  },
  _fxTick() {},

  /* ================= ENDINGS ================= */
  // the hall reached the storey its game asks for (Scenarios.onHall): the run is won NOW
  hallWin(b) {
    if (this._finale || !S || S.over) return;
    const sc = Scenarios.live();
    this._finale = { game: Scenarios.game() };
    G.end(true, (sc ? sc.title : 'The journey') + ' — the hall rises.', 'hall');
  },
  /* G.end asks first: book the journey's win at once, and (a hall win) hold
     the end screen for the Elder's last word — and after the first game, the
     chief's name. The run is over; only the screen waits. */
  holdEnd(win, msg, cause) {
    if (typeof S === 'undefined' || !S || !S.scenario || (window.Screens && Screens._demo)) return false;
    const g = Scenarios.game();
    if (win) this.markDone(g);
    this.track('finish', { game: g, outcome: win ? 'win' : (cause === 'struck_banner' ? 'abandoned' : 'loss'), seconds: Math.round(S.playtime || 0) });
    // game 3 is won on their hall's fall: she has the last word over it, as she does over a raised hall
    if (win && !this._finale && g === 3 && cause === 'razed_rival_tc') this._finale = { game: g };
    if (!win || !this._finale || document.hidden || !window.Screens || Screens.current !== 'playing') return false;
    this._held = { win, msg, s0: S, g };
    this._shown = null; this._viewKey = null; this._aside = null; this._goalBeat = null;
    this._collapsed = false; this._userHid = false;
    try { if (typeof Sound !== 'undefined' && Sound.ui) Sound.ui('complete'); } catch (e) {}
    this._endSay(this.endLines(g), 0, () => { if (g === 1) this.askName(); else this.release(); });
    const tc = this.tc(), at = g === 3 ? this.mark('rivalHall') : tc ? { x: tc.x + 1, y: tc.y + 1 } : null;
    if (at) { const t = this._resolve(at); if (t) this._burst(this._dom(), t.x, t.y); }
    if (!this._visL) {
      this._visL = true;
      document.addEventListener('visibilitychange', () => { if (document.hidden && this._held) this.release(); });
    }
    return true;
  },
  /* HER LAST WORDS (game 3, build 203 — operator: "when the fight is over, maybe
     Mira comes back and says congratulations chief … you're free and you won't have
     to be chased out anymore … then we wanna send off now you know the basics future
     games will allow you to explore and build new villages and advance new
     technologies"): the clan that burned them is gone, the chief is thanked by name,
     and the journey hands over to the whole game. Each card stands for its words'
     reading time (a lone line, the old 3.4 s) before the end screen. */
  endLines(g) {
    if (g === 1) return [['Our first fire burns, chief. May the clan that burned our home never see it.', 'proud']];
    if (g === 2) return [['A great hall! The clan is proud of you, ' + this.hail() + '.', 'proud']];
    return [['Their hall is ash. The clan that burned us is no more.', 'proud'],
      ['Congratulations, ' + this.hail(true) + '! We are free. No one will chase us out again.', 'excited'],
      ['You know the basics now. Future games let you explore, build villages and advance technology.', 'pleased']];
  },
  _endSay(lines, i, then) {
    if (!this._held) return;
    const [t, f] = lines[i];
    this.say(t, f);
    const ms = lines.length === 1 ? 3400 : Math.max(3600, 1500 + 270 * t.split(/\s+/).length);
    this._heldT = setTimeout(() => { if (i + 1 < lines.length) this._endSay(lines, i + 1, then); else then(); }, ms);
  },
  release() {
    clearTimeout(this._heldT);
    const h = this._held;
    this._held = null; this._asking = false;
    if (this._el) { this._el.ask.style.display = 'none'; }
    this.hide();
    if (h && typeof S !== 'undefined' && S === h.s0 && S.over) UI.showEnd(h.win, h.msg);
  },
  /* WHAT SHOULD THE PEOPLE CALL YOU? A name ready to accept, one tap — or
     typed. It is the chief's name the Settings page keeps (Backend.setChiefName),
     mirrored on the device. */
  CHIEFS: ['Arn', 'Bera', 'Brann', 'Cael', 'Dagny', 'Edda', 'Finn', 'Gunna', 'Hakon', 'Ivo', 'Kara', 'Leif', 'Mael', 'Nessa', 'Odda', 'Runa', 'Sigrid', 'Tove', 'Ulf', 'Ylva'],
  chiefName() {
    try { const n = localStorage.getItem('neo-chief'); if (n) return n; } catch (e) {}
    const uid = (window.Backend && Backend.uid) || '';
    let h = 2166136261; for (let i = 0; i < uid.length; i++) { h ^= uid.charCodeAt(i); h = Math.imul(h, 16777619); }
    return this.CHIEFS[(h >>> 0) % this.CHIEFS.length] || 'Runa';
  },
  /* THE CHIEF'S NAME IN HER MOUTH (operator, build 200: "Whatever the player
     names themselves at the end of level one, can we dynamically insert it into
     this first text box in level two as well as maybe sprinkle it throughout a
     few other places in level two and level three so it makes the game feel a
     little more customized"): the name chosen after game 1 (`neo-chief`; a
     rename on the Settings page is mirrored there too), never the stand-in
     chiefName() offers a player who has not chosen one — with none she says
     "chief", as she always did. A name typed with the title already on it
     ("Chief Rob") is not hailed twice. Every line that carries it holds a name
     of two words inside her fifteen. */
  named() {
    let n = '';
    try { n = localStorage.getItem('neo-chief') || ''; } catch (e) {}
    return String(n).replace(/\s+/g, ' ').trim().replace(/^chief\s+/i, '').slice(0, 24).trim();
  },
  hail(cap) { const n = this.named(); return n ? 'Chief ' + n : (cap ? 'Chief' : 'chief'); },
  askName() {
    if (!this._held) return;
    this._asking = true;
    const E = this._dom();
    E.inp.value = this.chiefName();
    this.say('What should the people call you?', 'pleased');
    E.ask.style.display = '';
  },
  _named() {
    if (!this._asking) return;
    const E = this._dom();
    const name = String(E.inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 24) || this.chiefName();
    try { localStorage.setItem('neo-chief', name); } catch (e) {}
    try { if (window.Backend && Backend.isReady && Backend.isReady() && Backend.setChiefName) Backend.setChiefName(name); } catch (e) {}
    this.track('choice', { game: 1, choice: 'named' });
    this._asking = false;
    this.say('Welcome, Chief ' + name + '.', 'excited');
    this._heldT = setTimeout(() => this.release(), 1600);
  },
  /* THE JOURNEY'S CARD (Deck.prologue): one of the game's tier, once per player ever */
  endCard(rep) {
    if (!window.Deck || !Deck.prologue) return null;
    const g = Scenarios.game();
    const col = Deck.col ? Deck.col() : null, key = 'pro:' + g;
    // the journey's gold rides with its card (Deck.prologue, CFG.GOLD.PROLOGUE)
    const paid = () => (col && col.goldRuns && col.goldRuns[key]) || 0;
    if (col && col.runs && col.runs[key]) return { ok: true, again: true, cards: col.runs[key].map(c => ({ id: c.id, tier: c.tier, bonus: false })), gold: paid() };
    const got = Deck.prologue(g, S.runId || (window.Backend && Backend.runId) || null);
    return got ? { ok: true, cards: [{ id: got.id, tier: got.tier, bonus: false }], gold: got.gold || 0 } : { ok: false, why: 'journey', gold: 0 };
  },
  // the end screen's two doors, or null off the journey
  endRow(win) {
    if (typeof S === 'undefined' || !S || !S.scenario) return null;
    const g = Scenarios.game();
    if (!win) return [{ act: 'pro-retry', label: 'Try again', gold: true }, { act: 'menu', label: 'Menu' }];
    if (g >= 3) return [{ act: 'pro-open', label: 'Your own world', gold: true }, { act: 'menu', label: 'Menu' }];
    return [{ act: 'pro-next', label: 'Continue the journey', gold: true }, { act: 'pro-random', label: 'Play a random world' }];
  },
  endAct(act) {
    // Menu keeps its own door (DeckScreens._click); the journey only notes it
    if (act === 'menu' && typeof S !== 'undefined' && S && S.scenario) { this.track('choice', { game: this.endGame(), choice: 'menu' }); return false; }
    if (!/^pro-/.test(act) || !window.Screens) return false;
    const g = this.endGame();
    const choice = { 'pro-next': 'journey', 'pro-random': 'random', 'pro-retry': 'retry', 'pro-open': 'open' }[act];
    this.track('choice', { game: g, choice });
    const go = act === 'pro-next' ? () => this.journey()
      : act === 'pro-random' ? () => this.randomWorld()
      : act === 'pro-retry' ? () => this.retry()
      : () => { Screens.backTo = 'title'; Screens.show('newgame'); };
    if (Screens.leaveEnd) Screens.leaveEnd(go); else go();
    return true;
  },
  /* the line under the score: a DEFEAT's reason and its encouragement. A
     win says nothing there (operator, build 192: "eliminate the extra text
     below") — its doors already say "Continue the journey" */
  endLine() {
    if (typeof S === 'undefined' || !S || !S.scenario || !S.over || S.over.win) return '';
    const c = S.over.cause;
    return (c === 'rival_wonder' ? 'The other clan raised their Wonder first.'
      : c === 'tc_destroyed' ? 'Our hall fell this time.' : 'Not this time.') + ' Try again — the clan believes in you.';
  },
  onScreen(name) {
    if (name !== 'playing' && this._el && !this._held) this._el.root.style.display = 'none';
    // the reward screen and its two detours keep the finished world; anything else lets it go
    if (name === 'endgame') this._armNext();
    else if (name !== 'cards' && name !== 'leaders') { clearTimeout(this._nextT); this._nextT = 0; this._endS = null; }
    /* every journey world entered once: `!this._began` let only the first —
       a game opened from the reward screen ("Continue the journey") never
       passed the title that clears it, and opened with no start and no glide */
    if (name === 'playing' && typeof S !== 'undefined' && S && S.scenario && this._began !== S) {
      this._began = S;
      /* A LESSON OPENS CLEAN (operator, build 182: "Start with the map hidden…
         it makes things confusing to have it open"): Mira is the teacher, so
         every journey world opens with the map folded; the top bar's map
         button brings it back. The unit tips need nothing here: they start
         put away for every player now (UI.helpHidden, "Start with the
         villager instructions hidden too"), and a player who asked for them
         with the panel's ℹ️ keeps them — that choice is remembered. */
      if (typeof UI !== 'undefined' && UI.setMiniCollapsed) UI.setMiniCollapsed(true);
      this.track('start', { game: Scenarios.game() });
      this.glide();
    }
    if (name === 'title') this._began = null;
  },
  /* THE ESTABLISHING GLIDE: from over the valley down to the village, eased,
     2.6 s; any touch skips it. Reduced motion cuts straight to the village. */
  glide() {
    const sc = Scenarios.live();
    if (!sc || !sc.glideFrom || !sc.camera) return;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const z1 = R.defaultZoom ? R.defaultZoom() : R.cam.z;
    const end = () => { R.cam.z = z1; R.centerOn(sc.camera.x + 0.5, sc.camera.y + 0.5); };
    if (reduced) { end(); return; }
    const z0 = Math.max(R.minZoom ? R.minZoom() : 0.5, Math.min(z1, sc.glideFrom.z || 0.9));
    const a = { x: sc.glideFrom.x + 0.5, y: sc.glideFrom.y + 0.5 }, b = { x: sc.camera.x + 0.5, y: sc.camera.y + 0.5 };
    const t0 = performance.now(), MS = 2600, world = S;
    let stop = false;
    const cancel = () => { stop = true; };
    document.addEventListener('pointerdown', cancel, { once: true, capture: true });
    const step = now => {
      if (stop || S !== world || Screens.current !== 'playing') { if (S === world) end(); document.removeEventListener('pointerdown', cancel, true); return; }
      const k = Math.min(1, (now - t0) / MS), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      R.cam.z = z0 + (z1 - z0) * e;
      R.centerOn(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e);
      if (k < 1) requestAnimationFrame(step); else { end(); document.removeEventListener('pointerdown', cancel, true); }
    };
    R.cam.z = z0; R.centerOn(a.x, a.y);
    requestAnimationFrame(step);
    // the Elder's first line waits for the view to settle
    this._lineT0 = this.now() + MS;
  },

  /* ================= THE LOOK ================= */
  HAND_SVG: '<svg viewBox="0 0 48 56" width="44" height="52"><path d="M17 4c2.6 0 4.4 2 4.4 4.6V25l1.2-.2V19c0-2.4 1.8-4.3 4.2-4.3s4.2 1.9 4.2 4.3v6.4l1-.2v-3.8c0-2.3 1.8-4.1 4-4.1s4 1.8 4 4.1v5.2l1-.1v-1.4c0-2.2 1.7-3.9 3.8-3.9s3.8 1.7 3.8 3.9V38c0 9.7-7.4 16-17 16h-2.6c-6 0-10.4-2.6-13.6-7.4L4 37.3c-1.2-1.9-.7-4.4 1.2-5.6 1.8-1.2 4.2-.8 5.5.9l1.9 2.6V8.6C12.6 6 14.4 4 17 4z" fill="#fff3d6" stroke="#2a1a0c" stroke-width="2.2" stroke-linejoin="round"/><path d="M21.4 25V9" stroke="#c9a46a" stroke-width="1.4" stroke-linecap="round" opacity=".6"/></svg>',
  _css() {
    if (document.getElementById('proCss')) return;
    const st = document.createElement('style');
    st.id = 'proCss';
    st.textContent = `
body:not(.ingame) #proUI { display: none !important; }
body.pro-nobuild #bmToggle, body.pro-nobuild #buildmenu, body.pro-nobuild #panel [data-act="gobuild"] { display: none !important; }
#proUI { position: fixed; inset: 0; z-index: 16; pointer-events: none; }
#proRing { position: fixed; border-radius: 50%; border: 3px solid #ffd77a; box-shadow: 0 0 0 2px rgba(20,12,4,.75), 0 0 14px 2px rgba(255,205,96,.55);
  pointer-events: none; animation: proPulse 1.4s ease-in-out infinite; box-sizing: border-box; }
#proRing.box { border-radius: 10px; }
#proRing.box.wide { animation-name: proPulseW; }
/* a target in the world is ringed on the ground by the renderer (R.drawGRing): the element stands there unseen */
#proRing.ground { border-color: transparent; box-shadow: none; animation: none; }
@keyframes proPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.12); opacity: .55 } }
@keyframes proPulseW { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
#proElder { position: fixed; display: none; box-sizing: border-box; pointer-events: auto; padding: 12px 34px 13px 12px; gap: 12px; align-items: center;
  display: flex; color: #f1e5cb; border-radius: 2px;
  background: repeating-linear-gradient(92deg, rgba(255,214,150,0.022) 0 1px, rgba(0,0,0,0) 1px 6px, rgba(0,0,0,0.05) 6px 7px, rgba(0,0,0,0) 7px 13px),
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(110,74,34,0.25), rgba(0,0,0,0) 70%), linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 26px rgba(0,0,0,0.65), 0 12px 34px rgba(0,0,0,0.65); }
#proElder.in { animation: proIn .28s ease-out; }
@keyframes proIn { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
#proElder .pc { position: absolute; width: 34px; height: 34px; z-index: 3; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,.6)); }
#proElder .pc svg { width: 100%; height: 100%; overflow: visible; }
#proElder .pc.tl { left: -5px; top: -5px; } #proElder .pc.tr { right: -5px; top: -5px; transform: scaleX(-1); }
#proElder .pc.bl { left: -5px; bottom: -5px; transform: scaleY(-1); } #proElder .pc.br { right: -5px; bottom: -5px; transform: scale(-1,-1); }
#proElder .pePic { flex: none; width: 64px; height: 64px; background: #0d0905; position: relative; z-index: 1;
  box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f0cf76, 0 0 0 5px #4a3210, 0 3px 8px 5px rgba(0,0,0,.45); }
#proElder .pePic img { width: 64px; height: 64px; display: block; image-rendering: pixelated; }
#proElder .peBody { min-width: 0; flex: 1; position: relative; z-index: 1; }
/* HER NAME IS A PLATE ON HER PORTRAIT'S FRAME (build 186): the header line it
   left carries the task, and the card is no taller for it */
#proElder .peName { position: absolute; left: 50%; bottom: -5px; transform: translateX(-50%); z-index: 2; margin: 0; padding: 2px 6px 2px 7px;
  white-space: nowrap; font: 800 8.5px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.4px; text-transform: uppercase; color: #2a1505;
  border-radius: 2px; background: linear-gradient(#fbe49a, #ecc25e 45%, #c99235); box-shadow: 0 0 0 1px #0b0704, inset 0 1px 0 rgba(255,250,220,.6), 0 2px 3px rgba(0,0,0,.6); }
/* THE TASK LINE: where her name stood — one line, exactly the height her name
   took (12px + 4.5px), gold Cinzel for the deed, the top bar's own icons for
   the goods it waits on */
.peTask { display: flex; align-items: center; gap: 6px; min-width: 0; height: 12px; white-space: nowrap; }
/* the line reaches into the card's right margin: the fold arrow sits at the
   card's foot, out of its way */
#proElder .peTask { margin: 0 -20px 4.5px 0; }
.peTask .pgd { flex: none; width: 6px; height: 6px; margin: 0 1px 0 1px; transform: rotate(45deg); background: #e8c15a; box-shadow: 0 0 5px rgba(255,210,110,.75); }
.peTask .pgt { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 700 12.5px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: .5px;
  color: #f2cd6a; text-shadow: 0 1px 0 rgba(0,0,0,.65); }
.peTask .pgn { flex: none; display: flex; align-items: center; gap: 7px; margin-left: 2px; font: 700 12px/1 Georgia,'Times New Roman',serif; color: #eadcb6; text-shadow: 0 1px 0 rgba(0,0,0,.7); }
.peTask .pgi { display: inline-flex; align-items: center; gap: 2px; }
.peTask .pgi.ok { color: #a9d98a; }
.peTask .pic { width: 13px; height: 13px; flex: none; display: block; filter: drop-shadow(0 1px 0 rgba(0,0,0,.5)); }
.peTask .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.peTask.f1 .pgi.ok { display: none; }
.peTask.f2 .pgt { font-size: 11px; letter-spacing: .2px; }
.peTask.f2 .pgn { font-size: 11px; gap: 5px; }
.peTask.f2 .pic { width: 12px; height: 12px; }
.peTask.f3 .pgd { display: none; }
.peTask.f4 .pgn { font-size: 10.5px; gap: 3px; margin-left: 0; }
.peTask.f4 .pgi { gap: 1px; }
.peTask.f4 .pic { width: 11px; height: 11px; }
#proElder .peTxt { margin: 0; font: 600 15.5px/1.38 Georgia,'Times New Roman',serif; color: #f1e5cb; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#proElder .peAsk { display: flex; gap: 8px; margin-top: 9px; }
#proElder .peIn { flex: 1; min-width: 0; height: 38px; box-sizing: border-box; padding: 0 10px; border-radius: 4px; border: 1px solid rgba(214,170,74,.6);
  background: rgba(8,6,3,.6); color: #f3e2b4; font: 600 16px Georgia,serif; }
#proElder .peBtn { height: 38px; padding: 0 14px; border: 0; border-radius: 4px; cursor: pointer; white-space: nowrap;
  font: 700 12.5px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.2px; text-transform: uppercase; color: #2a1505;
  background: linear-gradient(#fbe49a, #ecc25e 40%, #c99235); box-shadow: inset 0 0 0 1px #6b4a16, 0 2px 0 #0b0704; }
#proElder .peHide { position: absolute; right: 9px; bottom: 9px; width: 24px; height: 24px; border: 0; padding: 0; background: none; color: #c9a75e; font-size: 14px; cursor: pointer; z-index: 2; }
/* FOLDED, THE CARD IS A STRIP IN ITS OWN CORNER (build 186): her portrait and
   the same task line, so the standing objective never leaves the screen; a tap
   opens the card again where it was */
#proMini { position: fixed; display: none; align-items: center; gap: 9px; box-sizing: border-box; height: 46px; padding: 0 30px 0 7px;
  border: 0; border-radius: 2px; cursor: pointer; pointer-events: auto; text-align: left; color: #f1e5cb;
  background: radial-gradient(ellipse 80% 70% at 50% 0%, rgba(110,74,34,0.25), rgba(0,0,0,0) 70%), linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 1px #0b0704, inset 0 0 0 3px #b98a32, inset 0 0 0 4px #f3d27a, inset 0 0 0 5px #6b4a16, inset 0 0 0 6px #0b0704,
    inset 0 0 16px rgba(0,0,0,0.55), 0 8px 22px rgba(0,0,0,0.6); }
#proMini .pmPic { flex: none; width: 32px; height: 32px; background: #0d0905; box-shadow: 0 0 0 1px #0b0704, 0 0 0 2px #a87b2e, 0 0 0 3px #f0cf76; }
#proMini .pmPic img { width: 32px; height: 32px; display: block; }
#proMini .peTask { flex: 0 1 auto; }
#proMini .pmOpen { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); color: #c9a75e; font-size: 13px; font-style: normal; line-height: 1; }
#proHand { position: fixed; left: 0; top: 0; display: none; width: 44px; height: 52px; margin: -4px 0 0 -14px; pointer-events: none;
  filter: drop-shadow(0 3px 3px rgba(0,0,0,.55)); transition: transform .08s linear; }
#proHand svg { transition: transform .12s ease-out; transform-origin: 30% 10%; }
#proHand.press svg { transform: scale(.86); }
#proHand .phr { position: absolute; left: 10px; top: 0; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 2px solid #ffd77a; opacity: 0; }
#proHand.press .phr { animation: proTap .45s ease-out; }
@keyframes proTap { from { opacity: 1; transform: scale(.4) } to { opacity: 0; transform: scale(2.2) } }
#proFx { position: fixed; inset: 0; pointer-events: none; }
#proFx .pfs { position: fixed; width: 7px; height: 7px; background: #ffd77a; box-shadow: 0 0 6px rgba(255,214,120,.9); }
#proFx .pfly { position: fixed; width: 26px; height: 26px; filter: drop-shadow(0 2px 2px rgba(0,0,0,.6)); }
#proFx .pflR { position: fixed; box-sizing: border-box; border-radius: 10px; pointer-events: none; border: 3px solid #ffd77a;
  background: radial-gradient(ellipse at center, rgba(255,214,120,.22), rgba(255,214,120,0) 70%);
  box-shadow: 0 0 0 1px rgba(20,12,4,.85), inset 0 0 0 1px rgba(20,12,4,.5), 0 0 16px 4px rgba(255,205,96,.7), inset 0 0 12px rgba(255,214,120,.4); }
#proFx .pflR.big { border-width: 4px; box-shadow: 0 0 0 1px rgba(20,12,4,.85), inset 0 0 0 1px rgba(20,12,4,.5), 0 0 24px 7px rgba(255,205,96,.78), inset 0 0 14px rgba(255,214,120,.5); }
#proFx .pflS { position: fixed; left: 0; top: 0; width: 13px; height: 13px; pointer-events: none; filter: drop-shadow(0 0 2px rgba(255,214,120,.95)) drop-shadow(0 1px 1px rgba(20,12,4,.7)); }
#proFx .pflS b { display: block; width: 100%; height: 100%; background: radial-gradient(circle, #fffdf0 0 20%, #ffe08a 42%, #e9a93a 78%);
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%); }
.bbtn.new { position: relative; box-shadow: 0 0 0 2px #e8c15a, 0 0 14px rgba(255,205,96,.6) !important; }
.bbtn.new::before { content: 'NEW'; position: absolute; top: -6px; right: -4px; z-index: 2; padding: 2px 5px; border-radius: 3px;
  font: 800 9px/1 'Cinzel',Georgia,serif; letter-spacing: 1px; color: #2a1505; background: linear-gradient(#fbe49a, #d9a83f); box-shadow: 0 1px 0 #0b0704; }
#proDraft { display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: min(440px, 100%); margin: 14px auto 0; padding: 12px 14px;
  text-align: left; color: #f1e5cb; border-radius: 2px; background: linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704, 0 10px 26px rgba(0,0,0,.55); }
#proDraft .pePic { flex: none; width: 56px; height: 56px; background: #0d0905; box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f0cf76, 0 0 0 5px #4a3210; }
#proDraft .pePic img { width: 56px; height: 56px; display: block; image-rendering: pixelated; }
#proDraft .peBody { min-width: 0; flex: 1; }
#proDraft .peName { display: block; margin: 0 0 5px; font: 700 11px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.6px; text-transform: uppercase; color: #f2cd6a; }
#proDraft .peTxt { margin: 0; font: 600 15px/1.38 Georgia,'Times New Roman',serif; color: #f1e5cb; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#scrTitle.pro #btnTitleNew, #scrTitle.pro #btnTitleBoard, #scrTitle.pro #btnTitleCards, #scrTitle.pro #btnTitleStore { display: none !important; }
#scrTitle.pro #btnContinue.cant { display: none !important; }
#scrTitle.pro .trow3 { grid-template-columns: 1fr 1fr; }
/* THE BEGIN PLATE (build 206 — the operator, on two Begin buttons: "clean
   and professionally made… re-review the settings menu because I really
   like that"): the settings page's LIT plate (TitleScreen.plaque, kind
   'lit'), the one primary on the title, full width and the tallest; the
   word in cream Roman caps, the chapter a quiet line of small caps under
   it, a soft warm light breathing round it. Hierarchy by light and size,
   never by ornament. */
#scrTitle.t2 .plaques #btnBegin { min-height: 64px; padding: 10px 14px 9px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; isolation: isolate; overflow: visible; }
#scrTitle.t2 #btnBegin .blab { display: block; padding-left: .26em; font: 700 22px/1 'Cinzel','Times New Roman',Georgia,serif;
  letter-spacing: .26em; text-transform: uppercase; color: #fff0bf;
  text-shadow: 0 1px 0 #000, 0 0 1px rgba(0,0,0,.7), 0 0 12px rgba(255,196,96,.35); }
#scrTitle.t2 .plaques #btnBegin small { display: block; margin: 0; white-space: nowrap; opacity: 1;
  font: 600 10.5px/1.2 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: .16em; text-transform: uppercase;
  color: #e8d39b; text-shadow: 0 1px 0 rgba(0,0,0,.9); }
#scrTitle #btnBegin .bglow { position: absolute; z-index: -2; left: -10px; right: -10px; top: -9px; bottom: -9px; pointer-events: none;
  background: radial-gradient(closest-side, rgba(255,186,80,.24), rgba(255,150,50,.07) 72%, rgba(255,140,40,0));
  animation: proGlow 3.6s ease-in-out infinite alternate; }
@keyframes proGlow { from { opacity: .45; } to { opacity: 1; } }
@media (max-height: 600px) {
  #scrTitle.t2 .plaques #btnBegin { min-height: 56px; padding: 7px 12px; gap: 5px; }
  #scrTitle.t2 #btnBegin .blab { font-size: 20px; }
}
@media (prefers-reduced-motion: reduce) { #scrTitle #btnBegin .bglow { animation: none; opacity: .8; } }
/* the third thing on the title: a quiet line of small caps, never a web link */
#scrTitle .proSkip { display: block; min-height: 40px; margin: 8px auto 0; padding: 10px 18px; border: 0; background: none; cursor: pointer;
  color: rgba(232,211,155,.82); font: 600 11.5px/1.2 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: .18em; text-transform: uppercase;
  text-shadow: 0 1px 0 #000, 0 0 6px rgba(0,0,0,.85); -webkit-tap-highlight-color: transparent; }
@media (hover: hover) { #scrTitle .proSkip:hover { color: #f3e2b4; } }
#scrTitle .proSkip.arm { color: #ffd77a; }
`;
    document.head.appendChild(st);
  },
};
window.Prologue = Prologue;
