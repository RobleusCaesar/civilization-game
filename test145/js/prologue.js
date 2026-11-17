"use strict";
/* ============================ THE PROLOGUE ============================
   (CLAUDE.md, THE PROLOGUE) A new device plays three authored games in
   order — The First Fire, The Growing Clan, The Two Roads (js/scenarios.js,
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
     THE ELDER  the panel (the Settings page's carved frame), the pulse, the
                idle hand, the goal tracker, the celebration
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
     play (the old lesson's veteran rule — a finished run, a slot, a crash
     snapshot, the draft help read) is a veteran and never sent on the
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
  // the old lesson stands down for a device the journey has taught, or that skipped it
  taught() {
    const p = this._get();
    return !!(p && !p.veteran && (p.skipped || (p.done && p.done[1])));
  },
  next() { const d = this.prog().done; for (let g = 1; g <= 3; g++) if (!d[g]) return g; return 4; },
  markDone(g) {
    const p = this.prog();
    if (p.done[g]) return;
    p.done[g] = Date.now();
    this._set(p);
    // the journey over, the old lesson's two teaching games are spent too
    if (g >= 3 && window.Screens && Screens.lsSet && Screens.gamesFounded && Screens.gamesFounded() < 2) Screens.lsSet('neo-games', '2');
  },
  skip(from) {
    const p = this.prog();
    p.skipped = Date.now();
    this._set(p);
    this.track('skip', { from: from || 'title', game: this.next() });
    if (window.Screens && Screens.lsSet && Screens.gamesFounded && Screens.gamesFounded() < 2) Screens.lsSet('neo-games', '2');
  },

  /* ================= TELEMETRY (Backend.lesson, migration 0018) ================= */
  track(ev, props) {
    try { if (window.Backend && Backend.lesson) Backend.lesson(ev, props || {}); } catch (e) {}
  },

  /* ================= THE TITLE ================= */
  NAMES: { 1: 'The First Fire', 2: 'The Growing Clan', 3: 'The Two Roads' },
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
      btn.innerHTML = '<span class="blab">Begin</span><small></small>';
      btn.addEventListener('click', () => this.begin());
      menu.insertBefore(btn, menu.firstChild);
    }
    const sm = btn.querySelector('small');
    if (sm) sm.textContent = this.NAMES[g] + ' · ' + g + ' of 3';
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
  // the establishing glide's opening view: its ground asked for too
  _warmGlide() {
    const sc = Scenarios.live();
    if (!sc || !sc.glideFrom || !window.TerrainX || !TerrainX.prefetch || !TerrainX.on) return;
    try { const z = Math.max(R.minZoom ? R.minZoom() : 0.5, sc.glideFrom.z || 0.9); TerrainX.prefetch(sc.glideFrom.x + 0.5, sc.glideFrom.y + 0.5, z, 0); } catch (e) {}
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
  /* the hand to send: the nearest idle one to the hall; with none idle, a
     hand-gatherer before a builder, and a station's own hand last of all —
     nothing in the lesson puts a station's worker back */
  idleVil() {
    const tc = this.tc(); let best = null, bd = 1e9;
    for (const u of this.vils()) {
      const t = u.task && u.task.type;
      const rank = this.isIdle(u) ? 0 : t === 'build' ? 2 : t === 'work' ? 3 : 1;
      const d = (tc ? Math.hypot(u.x - tc.x - 1, u.y - tc.y - 1) : 0) + rank * 1e6;
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
  /* THE OTHER ROAD: the player has struck the rival (the truce broken, or a
     soldier sent at its works) — remembered for the rest of the game */
  marching() {
    if (S.pro && S.pro.march) return true;
    let m = !!(CFG.MODES[S.mode] && CFG.MODES[S.mode].peace && S.peace === false);
    if (!m) for (const u of S.units) {
      if (u.owner !== 'P' || !u.tBld || !u.task || u.task.type !== 'attackBld') continue;
      const t = Bld.get(u.tBld);
      if (t && t.owner === 'A') { m = true; break; }
    }
    if (m && S.pro) S.pro.march = 1;
    return m;
  },
  // a works of the player's still going up, and the hands to send to it
  siteOf(key) { return S.buildings.find(b => b.owner === 'P' && b.key === key && b.construction > 0) || null; },
  // the next pair of hands for a site: one not already at it, idle first, then the nearest
  handFor(w) {
    let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (this.buildsAt(u, w)) continue;
      const d = (Bld.cx(w) - u.x) ** 2 + (Bld.cy(w) - u.y) ** 2 - (this.isIdle(u) ? 1e6 : 0);
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
  // soldiers standing, and those already in a yard's queue
  armyComing() {
    let n = this.soldiers().length;
    for (const b of S.buildings) if (b.owner === 'P' && b.key === 'barracks' && Array.isArray(b.queue)) n += b.queue.length;
    return n;
  },

  /* "send someone to X": hold a villager → ring X; else ring the hands */
  sendTo(target) {
    return () => {
      const t = typeof target === 'function' ? target() : this.mark(target);
      const v = this.selVil();
      if (v || this.sent(t)) return t;
      const iv = this.idleVil();
      return iv ? { u: iv.id } : t;
    };
  },
  sendTaps(target) {
    return () => {
      const t = typeof target === 'function' ? target() : this.mark(target);
      if (this.sent(t) && !this.selVil()) return [];   // someone is on the way: nothing to show
      if (this.selVil()) return t ? [t] : [];
      const iv = this.idleVil();
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
        const m = this.mark(site); return m || null;
      }
      const card = '.bbtn[data-key="' + key + '"]';
      if (this.vis(card)) return { sel: card };
      if (this.vis('#panel [data-act="gobuild"]')) return { sel: '#panel [data-act="gobuild"]' };
      if (this.vis('#bmToggle')) return { sel: '#bmToggle' };
      return null;
    };
  },
  // the ghost seats itself on the authored site once per placement (never fights a drag)
  _seatGhost(key, site) {
    if (this._seated === UI.placing + ':' + (UI._placeGen || 0) || UI.placeDragging) return;
    const m = this.mark(site);
    if (!m) return;
    const x = Math.floor(m.x), y = Math.floor(m.y);
    let v = null;
    try { v = Bld.canPlace('P', key, x, y, { noCost: true, noSeal: true }); } catch (e) {}
    this._seated = UI.placing + ':' + (UI._placeGen || 0);
    if (!v || !v.ok) return;
    UI.placeGhost = { x, y, set: true };
    try { if (UI._placeCheck) UI._placeCheck(); } catch (e) {}
  },
  hallRing(sel) {
    return () => {
      if (this.vis(sel)) return { sel };
      const tc = this.tc(); return tc ? { x: tc.x + 1, y: tc.y + 1, r: 1.4 } : null;
    };
  },
  yardRing(key, sel) {
    return () => {
      if (this.vis(sel)) return { sel };
      const b = S.buildings.find(o => o.owner === 'P' && o.key === key && !(o.construction > 0));
      return b ? { x: Bld.cx(b), y: Bld.cy(b), r: 1.2 } : null;
    };
  },
  // what the hall's next storey still asks, in a few words ("Wood 40/100 · Food 12/50")
  /* the good the standing goal is shortest of (the beat held for its price,
     or the hall's next storey), by the share still missing */
  // the price the standing goal asks: the beat's own, a house, a villager, or the hall's next storey
  goalCost() {
    const b = this.beat(), tc = this.tc();
    if (b && b.cost) return b.cost.call(this);
    if (b && b.id === 'house') return Bld.effCost('P', 'house');
    if (b && b.id === 'train') return (CFG.UNITS.villager && CFG.UNITS.villager.cost) || null;
    if (tc && CFG.BUILDINGS.tc.levels[tc.level]) return CFG.BUILDINGS.tc.levels[tc.level].cost;
    return null;
  },
  need() {
    const cost = this.goalCost();
    let best = null, bw = 0;
    for (const k of ['food', 'wood', 'stone']) {
      const c = cost && cost[k]; if (!c) continue;
      const w = 1 - Math.min(1, (S.res[k] || 0) / c);
      if (w > bw) { bw = w; best = k; }
    }
    return best || ((S.res.food || 0) < (S.res.wood || 0) ? 'food' : 'wood');
  },
  // what the standing goal asks of a good, in whole units (0 when it asks none)
  needOf(res) { const cost = this.goalCost(); return (cost && cost[res]) || 0; },
  /* an idle hand's work: the good the goal is shortest of, counting the hands
     already on each — so three idle hands spread over food, wood and stone
     rather than crowding one bush */
  spread() {
    const cost = this.goalCost();
    let best = null, bw = 0;
    for (const k of ['food', 'wood', 'stone']) {
      const c = cost && cost[k]; if (!c) continue;
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
    if (sel && !this.busy(sel) && !this.onRes(sel, need)) return sel;
    const t = this.workFor({ x: (this.tc() ? Bld.cx(this.tc()) : CFG.W / 2), y: (this.tc() ? Bld.cy(this.tc()) : CFG.H / 2) }, need);
    let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (this.onRes(u, need) || this.busy(u)) continue;
      const d = t ? (u.x - t.x) ** 2 + (u.y - t.y) ** 2 : 0;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  },
  // the nearest tile of a good from a hand, on ground the player has seen
  workFor(u, res) {
    res = res || this.need();
    const W = CFG.W, H = CFG.H, ter = S.map.terrain, amt = S.map.resAmount, ex = S.map.explored;
    let best = null, bd = 1e9;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, g = CFG.GATHER[ter[i]];
      if (!g || g.res !== res || !(amt[i] > 0) || (ex && !ex[i])) continue;
      const d = (x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2;
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
    }
    return best;
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
  costLine(key) {
    const c = Bld.effCost('P', key) || {}, out = [];
    const NM = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' };
    for (const k of ['food', 'wood', 'stone', 'gold']) if (c[k]) out.push(NM[k] + ' ' + Math.min(c[k], Math.floor(S.res[k] || 0)) + '/' + c[k]);
    return out.join(' · ');
  },
  afford(key) { return Bld.canAfford(Bld.effCost('P', key), S.res); },

  /* Each beat: { id, face, text, goal, when, hold, ack, site, wait, done, praise, auto, ring, taps, on, skipIf }
       text   the guide's line (≤ 12 words, one instruction: a praise of ≤ 3 goes before it)
       goal   the tracker's objective (a string or a function), while the beat stands
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
       skipIf a beat with nothing to teach on this device is passed over
     THE GUIDE ANSWERS A TAP IN THE FRAME IT LANDS (operator, build 181: "the
     next thing … can take between two and three seconds to pop up … shoot
     for a second at Max"): every line follows the ORDER, never its result. */
  SCRIPTS: {
    1() {
      const P = this;
      return [
        { id: 'open', face: 'point', text: 'Another clan burned our home. We few escaped. Send someone to gather berries.',
          goal: 'Gather berries', ring: P.sendTo('berries'), taps: P.sendTaps('berries'),
          done: () => P.ordered('food'), praise: 'Good!' },
        { id: 'wood', face: 'pleased', text: 'Berries for tonight. Now send someone to cut wood.',
          goal: 'Cut wood', ring: P.sendTo('forest'), taps: P.sendTaps('forest'),
          done: () => P.ordered('wood'), praise: 'Good, strong timber!' },
        { id: 'house', face: 'point', text: 'We need a roof. Build a house beside the fire.',
          goal: () => P.afford('house') ? 'Build a house' : 'Gather wood for a house: ' + P.costLine('house'),
          when: () => P.afford('house') || P.has('house'), hold: (c) => P.needLine('A house', null, c),
          on: () => Scenarios.unlock('house'),
          ring: P.buildRing('house', 'houseSite'), taps: () => { const r = P.buildRing('house', 'houseSite')(); return r ? [r] : []; },
          ack: () => P.has('house'), site: () => P.siteOf('house'), wait: 'The house is going up.',
          done: () => P.has('house', true), praise: 'A home!' },
        { id: 'train', face: 'point', text: 'Now train a new villager at the hall.',
          goal: () => P.afford2('villager') ? 'Train a villager' : 'Gather food for a villager: Food ' + Math.floor(S.res.food || 0) + '/50',
          when: () => P.afford2('villager') || P.trained(), hold: (c) => P.needLine('A villager', 'food', c),
          ring: P.hallRing('#panel [data-act="train"][data-unit="villager"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="train"][data-unit="villager"]')(); return r ? [r] : []; },
          ack: () => P.trained(), wait: 'A new villager is on the way.',
          done: () => P.vils().length > P._n0, praise: 'Welcome, little one!' },
        { id: 'work', face: 'excited', text: 'Give the newcomer some work.',
          goal: 'Put the newcomer to work',
          ring: () => { const n = P.newcomer(); if (!n) return null; return P.selVil() === n ? P.mark('forest') : { u: n.id }; },
          taps: () => { const n = P.newcomer(); return n ? [{ u: n.id }, P.mark('forest')].filter(Boolean) : []; },
          done: () => { const n = P.newcomer(); return !n || !!n.task; }, praise: 'Good.' },
        { id: 'grow', face: 'thinking', text: 'Now our hall must grow. Gather what it needs.', gather: true,
          gwait: () => 'Our hall must grow. The ' + P.need() + ' is coming in.',
          goal: () => 'Hall Lv 2: ' + P.hallNeeds(), ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); },
          praise: 'We have enough!' },
        // an upgrade rises only with hands on it (the game's rule): the guide sends them
        { id: 'raise', face: 'excited', text: 'Raise the hall!',
          goal: 'Raise the hall', ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="upgrade"]')(); return r ? [r] : []; },
          ack: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0); },
          site: () => P.tcWorks(), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'Everyone helps. The hall is rising.', waitFace: 'proud',
          done: () => { const tc = P.tc(); return !!tc && tc.level >= 2; } },
      ];
    },
    2() {
      const P = this;
      return [
        { id: 'stone', face: 'point', text: 'Welcome back, chief. We need stone. Send someone to the grey rocks.',
          goal: 'Gather stone', ring: P.sendTo('stone'), taps: P.sendTaps('stone'),
          done: () => P.ordered('stone'), praise: 'Good stone!' },
        { id: 'lumber', face: 'point', text: 'Old felled trees lie nearby. Build a lumber camp there.',
          goal: () => P.afford('lumber') ? 'Build a lumber camp' : 'Gather for a lumber camp: ' + P.costLine('lumber'),
          when: () => P.afford('lumber') || P.has('lumber'), hold: (c) => P.needLine('A lumber camp', null, c),
          on: () => Scenarios.unlock('lumber'),
          ring: P.buildRing('lumber', 'stumps'), taps: () => { const r = P.buildRing('lumber', 'stumps')(); return r ? [r] : []; },
          ack: () => P.has('lumber'), site: () => P.siteOf('lumber'),
          done: () => P.raised('lumber'), praise: 'A lumber camp!' },
        { id: 'quarry', face: 'point', text: 'Now a quarry, on the broken rock.',
          goal: () => P.afford('quarry') ? 'Build a quarry' : 'Gather for a quarry: ' + P.costLine('quarry'),
          when: () => P.afford('quarry') || P.has('quarry'), hold: (c) => P.needLine('A quarry', null, c),
          on: () => Scenarios.unlock('quarry'),
          ring: P.buildRing('quarry', 'pebbles'), taps: () => { const r = P.buildRing('quarry', 'pebbles')(); return r ? [r] : []; },
          ack: () => P.has('quarry'), site: () => P.siteOf('quarry'),
          done: () => P.raised('quarry'), praise: 'A quarry!' },
        { id: 'farm', face: 'point', text: 'And a farm, where the berries were picked bare.',
          goal: () => P.afford('farm') ? 'Build a farm' : 'Gather for a farm: ' + P.costLine('farm'),
          when: () => P.afford('farm') || P.has('farm'), hold: (c) => P.needLine('A farm', null, c),
          on: () => Scenarios.unlock('farm'),
          ring: P.buildRing('farm', 'barren'), taps: () => { const r = P.buildRing('farm', 'barren')(); return r ? [r] : []; },
          ack: () => P.has('farm'), site: () => P.siteOf('farm'),
          done: () => P.raised('farm'), praise: 'A farm!' },
        // the find is news when it comes (the relic aside): the lesson goes on while the scout walks
        { id: 'scout', face: 'point', text: 'Something old lies out there. Send someone to look.',
          goal: 'Explore', ring: P.sendTo(() => P.mark('scoutTo', 1) || P.mark('relic', 1)),
          taps: P.sendTaps(() => P.mark('scoutTo', 1) || P.mark('relic', 1)),
          skipIf: () => !S.relic,
          done: () => !!(S.relic && S.relic.found) || P.scouting(), praise: 'Good.' },
        { id: 'deck', face: 'point', text: 'You carry cards. Tap your deck and play one.',
          goal: 'Play a card',
          skipIf: () => !(window.Deck && Deck.on && Deck.on() && Deck.total && Deck.total() > 0),
          on: () => { P._deckOpen = true; },
          ring: () => P.deckRing(), taps: () => { const r = P.deckRing(); return r ? [r] : []; },
          // the card's own act answers the Play; the next line comes the moment it is over
          ack: () => P.played(),
          done: () => P.played() && !(window.Deck && Deck.acting && Deck.acting()), praise: 'Well played!' },
        { id: 'grow', face: 'thinking', text: 'Now raise the hall again. Gather what it needs.', gather: true,
          gwait: () => 'The hall will rise again. The ' + P.need() + ' is coming in.',
          goal: () => 'Hall Lv 3: ' + P.hallNeeds(), ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); },
          praise: 'We have enough!' },
        { id: 'raise', face: 'excited', text: 'Raise the hall!',
          goal: 'Raise the hall', ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="upgrade"]')(); return r ? [r] : []; },
          ack: () => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0); },
          site: () => P.tcWorks(), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'Everyone helps. The hall is rising.', waitFace: 'proud',
          done: () => { const tc = P.tc(); return !!tc && tc.level >= 3; } },
      ];
    },
    3() {
      const P = this;
      return [
        // the two roads are said once the raid is beaten, where the choice is the player's
        { id: 'barracks', face: 'determined', text: 'They have found us, chief. Build a barracks.',
          goal: () => P.afford('barracks') ? 'Build a barracks' : 'Gather for a barracks: ' + P.costLine('barracks'),
          when: () => P.afford('barracks') || P.has('barracks'), hold: (c) => P.needLine('A barracks', null, c),
          on: () => Scenarios.unlock('barracks'),
          ring: P.buildRing('barracks', 'barracksSite'), taps: () => { const r = P.buildRing('barracks', 'barracksSite')(); return r ? [r] : []; },
          ack: () => P.has('barracks'), site: () => P.siteOf('barracks'), wait: 'The barracks is going up.',
          done: () => P.has('barracks', true), praise: 'A barracks, and its first soldier!' },
        { id: 'soldiers', face: 'point', text: 'Train more soldiers at the barracks.',
          // counted the moment they are ordered: each tap on Train moves the tally
          goal: () => 'Soldiers ' + Math.min(3, P.armyComing()) + '/3',
          when: () => P.has('barracks', true),
          // three trained or on the way: the guide points at nothing more (no spending the larder on a fourth)
          ring: () => P.yardRing('barracks', '#panel [data-act="train"]')(),
          taps: () => { const r = P.yardRing('barracks', '#panel [data-act="train"]')(); return r ? [r] : []; },
          ack: () => P.armyComing() >= 3, wait: 'Good. They will be ready soon.',
          done: () => P.soldiers().length >= 2 || S.day >= 22 },
        { id: 'raid', face: 'determined', text: 'Raiders! Send your soldiers to meet them.',
          goal: 'Drive off the raiders',
          on: () => P.raid(),
          // a soldier first (he stands in sight), then the raiders — the view goes to them once he is in hand
          ring: () => { const r = P.raiders()[0]; if (!r) return null; const s = P.soldiers()[0]; return P.selSoldier() || !s ? { u: r.id } : { u: s.id }; },
          taps: () => { const s = P.soldiers()[0], r = P.raiders()[0]; return [s && !P.selSoldier() ? { u: s.id } : null, r ? { u: r.id } : null].filter(Boolean); },
          ack: () => P.attacking(), wait: 'Good! Drive them off.', waitFace: 'determined',
          done: () => P._raided && !P.raiders().length, praise: 'They\'re beaten!' },
        /* THE WONDER'S ROAD, guided: save, raise, build. A player who strikes
           the rival instead (marching) has chosen the other road, and the
           guide stands aside from the Wonder for the rest of the game. The
           fight over, every hand goes back to the work it left (the horn's own rule). */
        { id: 'save', face: 'neutral', text: 'Now choose: raise a Wonder here, or march on their hall.', gather: true,
          gwait: 'Everyone is gathering. A Wonder here, or march on their hall?',
          goal: () => 'Wonder: ' + P.costLine('wonder'), cost: () => Bld.effCost('P', 'wonder'),
          on: () => { Scenarios.unlock('wonder'); try { if (typeof Units !== 'undefined' && Units.backToWork) Units.backToWork('P'); } catch (e) {} },
          ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
          skipIf: () => P.marching(),
          done: () => P.afford('wonder') || P.has('wonder'), praise: 'We have enough!' },
        // three pairs of hands raise it in a third of the days one does
        { id: 'wonder', face: 'excited', text: 'Raise the Wonder here!',
          goal: () => { const w = P.siteOf('wonder'); return w ? 'Builders ' + Math.min(3, P.builders(w).length) + '/3' : 'Raise the Wonder'; },
          skipIf: () => P.marching(),
          ring: P.buildRing('wonder', 'wonderSite'), taps: () => { const r = P.buildRing('wonder', 'wonderSite')(); return r ? [r] : []; },
          ack: () => P.has('wonder'), site: () => P.siteOf('wonder'), hands: 3, handsText: 'Send villagers to build it. Many hands, quick work.',
          done: () => { const w = P.siteOf('wonder'); return P.has('wonder') && (!w || P.builders(w).length >= Math.min(3, P.vils().length)); } },
        { id: 'go', face: 'proud', text: 'The clan is with you, chief. See it through.', auto: 3600,
          goal: () => P.marching() ? 'Raze their hall' : 'The Wonder is rising' },
      ];
    },
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
  deckPick() {
    let best = null;
    try {
      const k = Deck.col().counts;
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
  newcomer() { const v = this.vils(); return v.length > this._n0 ? v.reduce((a, b) => (b.id > a.id ? b : a)) : null; },
  selSoldier() { const s = UI.sel; if (!s) return false; const ids = s.type === 'unit' ? [s.id] : s.type === 'group' ? s.ids || [] : []; return ids.some(id => { const u = Units.get(id); return u && u.owner === 'P' && Units.isMilitary && Units.isMilitary(u); }); },

  /* GAME 3's RAID: a small band the player can see coming, from the map's far
     edge, on the side away from the rival. Light raiders of the wild country,
     hostile to everyone; they seek the town like any band. */
  raiders() { return S.units.filter(u => u.proRaid && u.hp > 0); },
  raid() {
    if (this._raided || typeof G === 'undefined' || !G.spawnBarb) return;   // G is a script const: never window.G
    const from = this.mark('raidFrom'), tc = this.tc();
    if (!from || !tc) return;
    this._raided = true;
    if (S.pro) S.pro.raided = 1;
    for (let i = 0; i < 2; i++) {
      try {
        const u = G.spawnBarb('light', Math.floor(from.x) + (i % 2), Math.floor(from.y) + ((i / 2) | 0), { tribe: 'wolf' });
        if (u) { u.proRaid = 1; u.style = 'band'; u.tribe = u.tribe || 'wolf'; }
      } catch (e) {}
    }
    G.reveal && G.reveal(Math.floor(from.x), Math.floor(from.y), 3);
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
    { id: 'rival', face: 'surprised', text: 'Riders! Another clan shares this valley. Not the ones who burned us.', hold: 0.5, once: true, auto: 4200, quiet: true, keepRing: true,
      test() { return Scenarios.game() === 2 && S.units.some(u => u.owner === 'A' && G.visibleAt && G.visibleAt(u.x | 0, u.y | 0)); } },
    { id: 'relic', face: 'surprised', text: 'Old stones! Our people will put them to use.', hold: 0.2, once: true, auto: 3200, quiet: true, keepRing: true,
      test() { return Scenarios.game() === 2 && !!(S.relic && S.relic.found); } },
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
  // a site or a storey going up with nobody at it
  unbuilt() {
    for (const b of S.buildings) {
      if (b.owner !== 'P' || !(b.construction > 0 || b.upgrading > 0)) continue;
      const at = S.units.some(u => u.owner === 'P' && u.task && (u.task.type === 'build') && (u.task.id === b.id || u.task.b === b.id || u.task.bid === b.id));
      if (!at) return b;
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
  // a hand walking to the scout's mark (or already there)
  scouting() {
    const m = this.mark('scoutTo', 1) || this.mark('relic', 1);
    if (!m) return false;
    return this.vils().some(u => u.task && u.task.type === 'move' && Math.hypot(u.task.x + 0.5 - m.x, u.task.y + 0.5 - m.y) < 3.5);
  },
  played() { return !!(S.deck && S.deck.played && S.deck.played.length); },
  /* a soldier of ours set on a raider — the order, the fight he found
     himself, or a march onto them: a raider not yet in sight cannot be
     tapped (the fog), so the tap is a walk to where he is, and that is the
     order the line asked for */
  attacking() {
    const rs = this.raiders();
    if (!rs.length) return false;
    const ids = new Set(rs.map(r => r.id));
    return this.soldiers().some(s => (s.tUnit && ids.has(s.tUnit)) ||
      (s.task && s.task.type === 'move' && s.task.x != null && rs.some(r => Math.hypot(s.task.x + 0.5 - r.x, s.task.y + 0.5 - r.y) < 4)));
  },
  /* THE LINE OF A HELD BEAT: what it is short of, in the guide's words —
     true whether or not a hand is free to move (the ring says which) */
  WHERE: { food: 'the berries', wood: 'the trees', stone: 'the grey rocks', gold: 'the gold seam' },
  needLine(thing, res, coming) {
    const r = res || this.need();
    return thing + ' needs more ' + r + (coming ? '. It is coming in.' : '. Gather it at ' + (this.WHERE[r] || 'the hills') + '.');
  },
  // the line when a gather beat needs a hand again
  gatherLine() {
    const sel = this.selVil(), iv = this.idleVil(), r = this.need();
    if ((sel && this.isIdle(sel)) || (!sel && iv && this.isIdle(iv))) return 'A villager is idle. Put them to work.';
    return 'We need ' + r + '. Send someone to ' + (this.WHERE[r] || 'gather it') + '.';
  },
  /* THE HAND TO MOVE while the goal waits on goods, and then its work: the
     selected hand when it is idle (to the good the hands are fewest on) or
     on another good (to the one the goal is shortest of); else an idle hand;
     else, with nobody on the short good at all, a hand on other work. A hand
     building or stationed is never pulled off. Null: every hand is on it. */
  gatherRing(idleOnly) {
    const need = this.need(), sel = this.selVil(), busy = u => this.busy(u);
    if (sel && !busy(sel)) {
      if (this.isIdle(sel)) return this.workFor(sel, this.spread());
      if (!idleOnly && !this.onRes(sel, need)) return this.workFor(sel, need);
    }
    const iv = this.idleVil();
    if (iv && iv !== sel && this.isIdle(iv) && !busy(iv)) return { u: iv.id };
    if (idleOnly || this.gatherers(need).length) return null;
    const h = this.spareHand();
    // never the hand already in hand: a tap on it again would only let it go
    return h && h !== sel ? { u: h.id } : null;
  },
  gatherTaps(idleOnly) {
    const r = this.gatherRing(idleOnly);
    if (!r) return [];
    if (r.u === undefined) return [r];
    const u = Units.get(r.u);
    return [r, u ? this.workFor(u, this.isIdle(u) ? this.spread() : this.need()) : null].filter(Boolean);
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
    this._got = {}; this._flown = {};
    this._beats = null;
    this._aside = null; this._asideT = {}; this._asideWait = {};
    this._shown = null; this._viewKey = null; this._lineT0 = 0; this._beatT0 = 0; this._praise = ''; this._g0 = null; this._ackAt = {};
    this._hand = null; this._handN = 0; this._clk = 0; this._lastIn = 0;
    this._finale = null; this._held = null; this._raided = false;
    this._seated = null; this._deckOpen = false; this._collapsed = false;
    this._celebrate = []; this._looked = null; this._lookCam = null; this._lookStuck = null; this._lookAt = 0; this._gliding = false;
    if (typeof S !== 'undefined' && S && S.scenario) {
      const g = Scenarios.game();
      this._beats = (this.SCRIPTS[g] ? this.SCRIPTS[g].call(this) : []);
      if (!S.pro) S.pro = { i: 0, done: {}, said: {}, n0: this.vils().length, t: {} };
      this._n0 = S.pro.n0 != null ? S.pro.n0 : this.vils().length;
      this._raided = !!S.pro.raided;
      this._deckOpen = !!(S.pro.said && S.pro.said.deck);
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
  // the first of each good a journey game brings home flies to its counter (whatever line is up)
  onGather(u, res, take) {
    this._got[res] = (this._got[res] || 0) + take;
    if (!this._flown[res] && this._got[res] >= 1 && (res === 'food' || res === 'wood' || res === 'stone')) {
      this._flown[res] = true;
      this.fly(res, u.x, u.y);
    }
  },

  /* the script's clock: the SIM's (G.simStep), in real seconds. Every tick
     asks the current beat where it stands (_phaseOf) and says a new line
     the moment that changes — the deed and its answer share a tick. */
  simTick(dt) {
    if (!S || !S.scenario || S.over || !this._beats) return;
    if (!S.pro) return;
    this._clk += (dt > 0 ? dt : 0);
    const P = S.pro, now = this.now();
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
      if (this._viewKey !== b.id + ':' + ph || !this._shown) this._show(b, ph);
      if (b.auto) { if (now - this._beatT0 >= b.auto) { this._advance(b); continue; } break; }
      // the result: the next beat is asked in this same tick
      if (!this._heldPh(b, ph) && b.done && b.done.call(this)) { this._complete(b); continue; }
      break;
    }
    this._asides(dt);
  },
  /* where a beat stands: held (its `when` not yet true — said only if it has
     a `hold` line, else silent), ask (its line), hands (asked and ordered,
     its works waiting on builders), wait (ordered, the world at work) */
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
    if (b.when && !S.pro.said[b.id] && !b.when.call(this)) return b.hold ? (this.gatherRing() ? 'held' : 'gwait') : 'silent';
    if (this._acked(b)) {
      if (b.site && this._needsHands(b)) return 'hands';
      if (b.wait) return 'wait';
    }
    if (b.gather && b.gwait && S.pro.said[b.id] && !this.gatherRing()) return 'gwait';
    return 'ask';
  },
  // the line a phase says, and what it rings (a view: the bot, the frame and the hand all read it)
  _viewOf(b, ph) {
    const P = this, base = { id: b.id, beat: b, phase: ph, goal: b.goal };
    const txt = t => typeof t === 'function' ? t.call(P) : t;
    if (ph === 'held') return Object.assign(base, { face: b.holdFace || 'thinking', text: txt(b.hold), ring: () => P.gatherRing(), taps: () => P.gatherTaps(), gather: true });
    // every hand is on it: said at once, so a tap that sent the last one is answered
    if (ph === 'gwait') return Object.assign(base, { face: 'pleased', text: b.hold && !S.pro.said[b.id] ? b.hold.call(P, true) : txt(b.gwait), ring: () => P.gatherRing(), taps: () => P.gatherTaps(), gather: true });
    if (ph === 'hands') return Object.assign(base, { face: 'point', text: txt(b.handsText) || 'Now send a villager to build it.', ring: () => P.handsRing(b), taps: () => P.handsTaps(b) });
    if (ph === 'wait') return Object.assign(base, { face: b.waitFace || 'pleased', text: txt(b.wait), ring: () => P.gatherRing(true), taps: () => P.gatherTaps(true) });
    return Object.assign(base, { face: b.face, text: txt(b.text), ring: b.ring, taps: b.taps, auto: b.auto, gather: b.gather });
  },
  // a phase that waits on the beat's `when` (its line not yet asked)
  _heldPh(b, ph) { return ph === 'held' || (ph === 'gwait' && !!b.when && !S.pro.said[b.id]); },
  _show(b, ph) {
    const P = S.pro, v = this._viewOf(b, ph), now = this.now(), prev = this._shown;
    const fresh = prev ? prev.beat !== b : true;
    this._viewKey = b.id + ':' + ph;
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
    if (ph === 'gwait' && prev && prev.beat === b && (prev.phase === 'held' || prev.phase === 'ask') && !this._praise) this._praise = 'Good.';
    // a gather line asked again (a hand went idle, a good ran short): why, not the lesson again
    if (ph === 'ask' && b.gather && prev && prev.beat === b && prev.phase === 'gwait') { v.text = this.gatherLine(); v.face = 'point'; }
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
    this._praise = b.praise || '';
  },
  _advance(b, silent) {
    const P = S.pro;
    P.done[b.id] = 1;
    P.i++;
    this._viewKey = null;
    this._praise = '';
    if (silent) P.said[b.id] = P.said[b.id] || 0;
  },
  // a moment the player is not acting on the line: no order asked, or a line read and left alone
  _quietNow() {
    const v = this._shown, now = this.now();
    if ((window.DeckUI && DeckUI.open) || (window.Deck && Deck.acting && Deck.acting())) return false;   // her card is hidden: the news would be said to nobody
    if (!v || v.phase === 'wait' || v.phase === 'held' || v.phase === 'gwait' || v.auto) return true;
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
  quiet(msg, warn, refusal) {
    if (refusal || typeof S === 'undefined' || !S || !S.scenario || (window.Screens && Screens._demo)) return false;
    const m = String(msg == null ? '' : msg);
    if (/under attack/i.test(m)) return this._raidSaid();
    return !this.KEEP.test(m);
  },
  // the guide is already telling the player about the raiders (game 3's raid line, raiders in the field)
  _raidSaid() {
    const v = this._shown;
    return !!(v && v.id === 'raid' && this.raiders && this.raiders().length);
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
    root.innerHTML =
      '<div id="proGoal" aria-live="polite"><i class="pgd"></i><span class="pgt"></span><small class="pgn"></small></div>' +
      '<i id="proRing"></i>' +
      '<div id="proElder" role="dialog" aria-label="' + this.NAME + ', your guide">' + corners +
        '<div class="pePic"><img alt="" src="' + this.FACES.neutral + '"></div>' +
        '<div class="peBody"><b class="peName">' + this.NAME + '</b><p class="peTxt"></p>' +
          '<div class="peAsk"><input class="peIn" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Your name">' +
          '<button class="peBtn gold" type="button" data-act="me">That\'s me</button></div></div>' +
        '<button class="peHide" type="button" aria-label="Hide">▾</button>' +
      '</div>' +
      '<button id="proMini" type="button" aria-label="' + this.NAME + ', your guide: show her line"><img alt="" src="' + this.FACES.neutral + '"></button>' +
      '<div id="proHand" aria-hidden="true">' + this.HAND_SVG + '<i class="phr"></i></div>' +
      '<div id="proFx" aria-hidden="true"></div>';
    document.body.appendChild(root);
    const E = this._el = {
      root, goal: root.querySelector('#proGoal'), ring: root.querySelector('#proRing'),
      elder: root.querySelector('#proElder'), pic: root.querySelector('#proElder .pePic img'),
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
    document.addEventListener('pointerdown', () => { this._lastIn = this.now(); if (this._hand) this._hand = null; if (this._shown) this._acted = true; }, true);
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
    const raw = rb && rb.ring ? rb.ring.call(this) : null;
    // a ringed build card is brought into the menu's view until it is seen there
    if (raw && raw.sel && raw.sel.indexOf('.bbtn') === 0) this._cardInView(raw.sel); else if (this._cardSt) this._cardSt.sel = '';
    const tgt = raw ? this._resolve(raw) : null;
    /* the ring stands only where a tap can reach it: a target under the
       panel, the minimap or a bar is not ringed until the look has brought
       it into the open — a ring drawn over the hall's panel was tapped, and
       the tap landed on its Cancel */
    const open = Screens.current === 'playing' && !this._held ? this._look(raw, tgt, B) : true;
    this._ringTo(E, open ? tgt : null);
    // the goal tracker: the standing objective, whatever line is up
    this._goal(E, B);
    // the line: open, or folded to a portrait once the player is working on it
    const reading = Math.max(3200, 1200 + 260 * ((line && line.text) || '').split(/\s+/).length);
    if (b && !b.auto && this._acted && !this._userHid && now - this._lineT0 > reading + 4000 && !this._asking) this._collapsed = true;
    // …and opens again for a player who has stopped (the hand comes with it)
    if (this._collapsed && !this._userHid && b && !b.auto && now - this._lastIn > 11000) { this._collapsed = false; this._lineT0 = now; }
    const card = !!line && !this._collapsed && !(window.DeckUI && DeckUI.open) && !(window.Deck && Deck.acting && Deck.acting());
    E.elder.style.display = card ? '' : 'none';
    // #proGoal, #proMini and #proHand are hidden by the stylesheet: a show is an explicit value, never ''
    E.mini.style.display = !card && (b || this._held) && !(window.DeckUI && DeckUI.open) ? 'block' : 'none';
    if (card) this._seat(E, B, tgt);
    else this._seatMini(E, B);
    this._toastStep(E, B, card);
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
     alone after that (UI.cardIntoView — the lesson's rule too) */
  _cardSt: null,
  _cardInView(sel) { if (UI.cardIntoView) UI.cardIntoView(sel, this._cardSt || (this._cardSt = {})); },
  // a target, resolved to the screen: {x,y,r} world, {u} a unit, {sel} an element
  _resolve(t) {
    if (!t) return null;
    if (t.sel) {
      const el = document.querySelector(t.sel);
      if (!el || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
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
    return { x: cv.left + (wx * TL - R.cam.x) * z, y: cv.top + (wy * TL - R.cam.y) * z - lift * z, r: rr * TL * z };
  },
  _ringTo(E, t) {
    const r = E.ring;
    if (!t) { r.style.display = 'none'; return; }
    r.style.display = '';
    if (t.rect) {
      r.classList.add('box');
      r.style.left = (t.rect.left - 5) + 'px'; r.style.top = (t.rect.top - 5) + 'px';
      r.style.width = (t.rect.width + 10) + 'px'; r.style.height = (t.rect.height + 10) + 'px';
    } else {
      r.classList.remove('box');
      const rad = Math.max(18, t.r);
      r.style.left = (t.x - rad) + 'px'; r.style.top = (t.y - rad) + 'px';
      r.style.width = r.style.height = (rad * 2) + 'px';
    }
  },
  _goal(E, B) {
    const b = this._goalBeat || this._shown;
    let txt = b && b.goal ? (typeof b.goal === 'function' ? b.goal.call(this) : b.goal) : '';
    if (this._held) txt = '';
    const el = E.goal;
    if (!txt) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'block';
    const [head, ...rest] = String(txt).split(': ');
    const t = el.querySelector('.pgt'), n = el.querySelector('.pgn');
    const tail = rest.join(': ');
    if (t.textContent !== head) t.textContent = head;
    if (n.textContent !== tail) n.textContent = tail;
    n.style.display = tail ? '' : 'none';
    // under the top bar (and under the rival's wonder banner when it stands)
    const ww = document.getElementById('wonderWarn');
    const wwH = ww && ww.offsetParent !== null ? ww.offsetHeight + 6 : 0;
    el.style.top = (B.top + 6 + wwH) + 'px';
  },
  /* THE TOASTS STEP BELOW THE JOURNEY (index.html's #toasts adds --pro-h to
     its top): under the goal tracker, and under the Elder's card while it is
     seated at the top over the toasts' column — the news is never written
     over the line being read. */
  _toastStep(E, B, open) {
    let bottom = 0;
    if (E.goal.style.display !== 'none') bottom = E.goal.getBoundingClientRect().bottom;
    const s = this._seatBox;
    if (open && s && s.y < (B.top + B.bot) / 2 && s.x < B.vw * 0.66) bottom = Math.max(bottom, s.y + s.h);
    let h = 0;
    if (bottom) {
      const ww = document.getElementById('wonderWarn');
      const wwH = ww && ww.offsetParent !== null ? ww.offsetHeight + 6 : 0;
      h = Math.max(0, Math.round(bottom + 6 - (B.top - 6 + wwH)));
    }
    if (this._goalH !== h) { this._goalH = h; document.body.style.setProperty('--pro-h', h + 'px'); }
  },
  _seat(E, B, tgt) {
    const el = E.elder, vw = B.vw, vh = B.vh;
    const side = vw > vh * 1.3 && vh < 520, desk = vw >= 900;
    const w = side ? Math.min(380, Math.round(vw * 0.44)) : desk ? 420 : Math.min(vw - 16, 460);
    el.style.width = w + 'px';
    const h = el.offsetHeight || 96;
    const goalBottom = E.goal.style.display !== 'none' ? E.goal.getBoundingClientRect().bottom + 6 : B.top + 8;
    const seats = side
      ? [{ x: 8, y: Math.max(B.top + 8, Math.min(B.bot - h - 8, (B.top + B.bot - h) / 2)) },
         { x: vw - w - 8, y: Math.max(B.top + 8, Math.min(B.bot - h - 8, (B.top + B.bot - h) / 2)) }]
      : desk
        ? [{ x: 16, y: B.bot - h - 12 }, { x: 16, y: goalBottom }, { x: vw - w - 16, y: B.bot - h - 12 }]
        : [{ x: (vw - w) / 2, y: B.bot - h - 8 }, { x: (vw - w) / 2, y: goalBottom }];
    // the first seat that leaves the target clear (a little room round it)
    let pick = seats[0];
    if (tgt) {
      const pad = 22;
      const tr = tgt.rect ? { l: tgt.rect.left - pad, t: tgt.rect.top - pad, r: tgt.rect.right + pad, b: tgt.rect.bottom + pad }
        : { l: tgt.x - (tgt.r || 20) - pad, t: tgt.y - (tgt.r || 20) - pad, r: tgt.x + (tgt.r || 20) + pad, b: tgt.y + (tgt.r || 20) + pad };
      const over = s => !(s.x + w < tr.l || s.x > tr.r || s.y + h < tr.t || s.y > tr.b);
      pick = seats.find(s => !over(s)) || seats[0];
    }
    // hold a seat a moment before moving (no flicker on a target at the edge) —
    // but never a seat that covers the target: then it moves at once
    const key = pick.x + ',' + Math.round(pick.y);
    if (this._seatKey !== key) {
      const [ox, oy] = (this._seatKey || key).split(',');
      const coversNow = tgt && this._seatCovers && this._seatCovers({ x: +ox, y: +oy }, w, h, tgt);
      if (coversNow || !this._seatAt || performance.now() - this._seatAt > 350) { this._seatKey = key; this._seatAt = performance.now(); }
      else pick = { x: +ox, y: +oy };
    }
    this._seatBox = { x: pick.x, y: pick.y, w, h };
    el.style.left = Math.round(pick.x) + 'px';
    el.style.top = Math.round(pick.y) + 'px';
  },
  _seatCovers(s, w, h, tgt) {
    const pad = 22;
    const tr = tgt.rect ? { l: tgt.rect.left - pad, t: tgt.rect.top - pad, r: tgt.rect.right + pad, b: tgt.rect.bottom + pad }
      : { l: tgt.x - (tgt.r || 20) - pad, t: tgt.y - (tgt.r || 20) - pad, r: tgt.x + (tgt.r || 20) + pad, b: tgt.y + (tgt.r || 20) + pad };
    return !(s.x + w < tr.l || s.x > tr.r || s.y + h < tr.t || s.y > tr.b);
  },
  /* THE LOOK: a ring the player cannot see AND tap — off the visible band,
     or under a panel, the minimap, the goal tracker or the guide's own card
     — brings its target into the open band: a short glide that lands it in
     the half of the band the guide does not sit in. Asked again whenever
     the line, its target or the selection changes (a villager selected
     opens a panel over the ground the next line points at), and every
     LOOK_MS while the target stays covered and the camera is where the last
     look left it: the camera is the player's the moment they move it. A
     finger down waits for the lift, any touch cancels a glide, reduced
     motion makes the move at once, and a look that cannot move the camera
     (the map's edge) is not tried again for that target. */
  LOOK_MS: 1200,
  _look(raw, tgt, B) {
    if (!raw || raw.sel || !tgt) return true;
    if (this._gliding) return false;
    const v = this._aside || this._shown || {}, cam = R.cam, t = performance.now();
    const us = typeof UI !== 'undefined' && UI.sel ? UI.sel : null;
    const sel = us ? us.type + ':' + (us.id != null ? us.id : (us.ids ? us.ids.join(',') : '')) : '';
    const key = (v.id || '') + ':' + (v.phase || '') + ':' + (raw.u !== undefined ? 'u' + raw.u : (raw.x | 0) + ',' + (raw.y | 0)) + ':' + sel;
    const m = 24, inView = tgt.x > m && tgt.x < B.vw - m && tgt.y > B.top + m && tgt.y < B.bot - m && this._open(tgt.x, tgt.y);
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
    const z = cam.z, TL = CFG.TILE, seat = this._seatBox;
    const low = !seat || seat.y > (B.top + B.bot) / 2;
    const sy = B.top + (B.bot - B.top) * (low ? 0.38 : 0.66), sx = B.vw / 2;
    // where the camera can really go (the map's edge clamps it): nowhere new, no glide
    const x0 = cam.x, y0 = cam.y;
    cam.x = wx * TL - sx / z; cam.y = wy * TL - sy / z; if (R.clampCam) R.clampCam();
    const tx = cam.x, ty = cam.y;
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
  /* is this screen point world the player can see AND tap? The band alone is
     not enough: the minimap, the Elder's own card and the goal tracker stand
     over the world, and a tap under the minimap moves the camera instead of
     sending anyone (a scout's mark under it was never reached) */
  _open(x, y) {
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { return true; }
    if (!el) return true;   // no layout to ask (a page that is not drawn): trust the band
    if (el.id !== 'c') return false;
    const E = this._el;
    for (const o of [E && E.goal, E && E.elder]) {
      if (!o || o.style.display === 'none') continue;
      const r = o.getBoundingClientRect();
      if (r.width && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return false;
    }
    return true;
  },
  _seatMini(E, B) {
    const m = E.mini;
    m.style.left = '10px';
    m.style.top = Math.round(B.bot - 54) + 'px';
  },
  /* THE HAND: after IDLE_MS with nothing done on an action beat, a hand
     shows the taps, one after the other, until the player acts */
  IDLE_MS: 6000,
  _handTick(E, b, now) {
    const h = E.hand;
    const can = b && !b.auto && b.taps && !this._asking && !(window.DeckUI && DeckUI.open) && Screens.current === 'playing';
    if (!can || now - this._lastIn < this.IDLE_MS) { h.style.display = 'none'; this._hand = null; return; }
    if (!this._hand) {
      this._hand = { t0: now, i: 0 }; this._handN++; if (this._handN === 1) this._collapsed = false;
      this._looked = null;   // a player who has stopped is shown the target again, wherever the camera went
    }
    const taps = (b.taps.call(this) || []).map(t => this._resolve(t)).filter(t => t && (t.rect || this._open(t.x, t.y)));
    if (!taps.length) { h.style.display = 'none'; return; }
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
    if (res) this._bumpChip(res);
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
  _bumpChip(res) {
    const chip = document.querySelector(`#topbar .ric[data-ic="${res}"]`);
    const box = chip && chip.closest('[data-chip]');
    if (box && box.animate) box.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
  },
  // THE FIRST HARVEST FLIES HOME: the good's own drawn icon from the deed to its counter
  fly(res, wx, wy) {
    const E = this._dom();
    const ic = document.querySelector(`#topbar .ric[data-ic="${res}"]`);
    if (!ic) return;
    const from = this._resolve({ x: wx, y: wy }), to = ic.getBoundingClientRect();
    if (!from) return;
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
      an.onfinish = () => { g.remove(); if (i === n - 1) { this._bumpChip(res); try { UI.cue('bond'); } catch (e) {} } };
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
    if (!win || !this._finale || document.hidden || !window.Screens || Screens.current !== 'playing') return false;
    this._held = { win, msg, s0: S, g };
    this._shown = null; this._viewKey = null; this._aside = null; this._goalBeat = null;
    this._collapsed = false; this._userHid = false;
    this.say(g === 1 ? 'Our first fire burns, chief. May they never see its smoke.' : g === 2 ? 'A great hall! The clan is proud, chief.' : 'Well done, chief.', 'proud');
    try { if (typeof Sound !== 'undefined' && Sound.ui) Sound.ui('complete'); } catch (e) {}
    const tc = this.tc();
    if (tc) { const t = this._resolve({ x: tc.x + 1, y: tc.y + 1 }); if (t) this._burst(this._dom(), t.x, t.y); }
    this._heldT = setTimeout(() => { if (g === 1) this.askName(); else this.release(); }, 3400);
    if (!this._visL) {
      this._visL = true;
      document.addEventListener('visibilitychange', () => { if (document.hidden && this._held) this.release(); });
    }
    return true;
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
    if (col && col.runs && col.runs[key]) return { ok: true, again: true, cards: col.runs[key].map(c => ({ id: c.id, tier: c.tier, bonus: false })) };
    const got = Deck.prologue(g, S.runId || (window.Backend && Backend.runId) || null);
    return got ? { ok: true, cards: [{ id: got.id, tier: got.tier, bonus: false }] } : { ok: false, why: 'journey' };
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
  // the line under the score
  endLine() {
    if (typeof S === 'undefined' || !S || !S.scenario || !S.over) return '';
    const g = Scenarios.game();
    if (!S.over.win) {
      const c = S.over.cause;
      return (c === 'rival_wonder' ? 'The other clan raised their Wonder first.'
        : c === 'tc_destroyed' ? 'Our hall fell this time.' : 'Not this time.') + ' Try again — the clan believes in you.';
    }
    if (g === 1) return 'Your journey has begun: ' + this.NAMES[2] + ' is next.';
    if (g === 2) return 'One road left: ' + this.NAMES[3] + '.';
    return 'The journey is complete. Every world is yours now.';
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
@keyframes proPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.12); opacity: .55 } }
#proGoal { position: fixed; left: 8px; display: none; max-width: min(66%, calc(100% - 130px)); box-sizing: border-box; pointer-events: none;
  padding: 6px 12px 6px 10px; border-radius: 8px; background: linear-gradient(#2a1d11, #1a120a); color: #f3e2b4;
  box-shadow: inset 0 0 0 1px #0b0704, inset 0 0 0 2px rgba(214,170,74,.65), 0 4px 12px rgba(0,0,0,.5);
  font: 700 12.5px/1.3 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: .6px; }
#proGoal .pgd { display: inline-block; width: 7px; height: 7px; margin: 0 8px 1px 0; transform: rotate(45deg); background: #e8c15a; box-shadow: 0 0 6px rgba(255,210,110,.8); }
#proGoal .pgn { display: block; margin-top: 2px; font: 600 12px/1.25 Georgia,serif; letter-spacing: 0; color: #d8c79c; }
#proElder { position: fixed; display: none; box-sizing: border-box; pointer-events: auto; padding: 12px 34px 13px 12px; gap: 12px; align-items: center;
  display: flex; color: #f1e5cb; border-radius: 2px;
  background: repeating-linear-gradient(92deg, rgba(255,214,150,0.022) 0 1px, rgba(0,0,0,0) 1px 6px, rgba(0,0,0,0.05) 6px 7px, rgba(0,0,0,0) 7px 13px),
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(110,74,34,0.25), rgba(0,0,0,0) 70%), linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 26px rgba(0,0,0,0.65), 0 12px 34px rgba(0,0,0,0.65); }
#proElder.in { animation: proIn .28s ease-out; }
@keyframes proIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
#proElder .pc { position: absolute; width: 34px; height: 34px; z-index: 3; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,.6)); }
#proElder .pc svg { width: 100%; height: 100%; overflow: visible; }
#proElder .pc.tl { left: -5px; top: -5px; } #proElder .pc.tr { right: -5px; top: -5px; transform: scaleX(-1); }
#proElder .pc.bl { left: -5px; bottom: -5px; transform: scaleY(-1); } #proElder .pc.br { right: -5px; bottom: -5px; transform: scale(-1,-1); }
#proElder .pePic { flex: none; width: 64px; height: 64px; background: #0d0905; position: relative; z-index: 1;
  box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f0cf76, 0 0 0 5px #4a3210, 0 3px 8px 5px rgba(0,0,0,.45); }
#proElder .pePic img { width: 64px; height: 64px; display: block; image-rendering: pixelated; }
#proElder .peBody { min-width: 0; flex: 1; position: relative; z-index: 1; }
#proElder .peName { display: block; font: 700 11.5px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.6px; text-transform: uppercase;
  background: linear-gradient(#fff3c8, #f2cd6a 45%, #c08a2c); -webkit-background-clip: text; background-clip: text; color: transparent; margin: 0 0 5px; }
#proElder .peTxt { margin: 0; font: 600 15.5px/1.38 Georgia,'Times New Roman',serif; color: #f1e5cb; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#proElder .peAsk { display: flex; gap: 8px; margin-top: 9px; }
#proElder .peIn { flex: 1; min-width: 0; height: 38px; box-sizing: border-box; padding: 0 10px; border-radius: 4px; border: 1px solid rgba(214,170,74,.6);
  background: rgba(8,6,3,.6); color: #f3e2b4; font: 600 16px Georgia,serif; }
#proElder .peBtn { height: 38px; padding: 0 14px; border: 0; border-radius: 4px; cursor: pointer; white-space: nowrap;
  font: 700 12.5px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.2px; text-transform: uppercase; color: #2a1505;
  background: linear-gradient(#fbe49a, #ecc25e 40%, #c99235); box-shadow: inset 0 0 0 1px #6b4a16, 0 2px 0 #0b0704; }
#proElder .peHide { position: absolute; right: 10px; top: 8px; width: 24px; height: 24px; border: 0; padding: 0; background: none; color: #c9a75e; font-size: 14px; cursor: pointer; z-index: 2; }
#proMini { position: fixed; display: none; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; pointer-events: auto; overflow: hidden; background: #0d0905;
  box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f0cf76, 0 0 0 5px #4a3210, 0 4px 10px rgba(0,0,0,.55); }
#proMini img { width: 48px; height: 48px; display: block; image-rendering: pixelated; }
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
.bbtn.new { position: relative; box-shadow: 0 0 0 2px #e8c15a, 0 0 14px rgba(255,205,96,.6) !important; }
.bbtn.new::before { content: 'NEW'; position: absolute; top: -7px; right: -4px; z-index: 2; padding: 2px 5px; border-radius: 3px;
  font: 800 9px/1 'Cinzel',Georgia,serif; letter-spacing: 1px; color: #2a1505; background: linear-gradient(#fbe49a, #d9a83f); box-shadow: 0 1px 0 #0b0704; }
#proDraft { display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: min(440px, 100%); margin: 14px auto 0; padding: 12px 14px;
  text-align: left; color: #f1e5cb; border-radius: 2px; background: linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704, 0 10px 26px rgba(0,0,0,.55); }
#proDraft .pePic { flex: none; width: 56px; height: 56px; background: #0d0905; box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f0cf76, 0 0 0 5px #4a3210; }
#proDraft .pePic img { width: 56px; height: 56px; display: block; image-rendering: pixelated; }
#proDraft .peBody { min-width: 0; flex: 1; }
#proDraft .peName { display: block; margin: 0 0 5px; font: 700 11px/1 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.6px; text-transform: uppercase; color: #f2cd6a; }
#proDraft .peTxt { margin: 0; font: 600 15px/1.38 Georgia,'Times New Roman',serif; color: #f1e5cb; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#scrTitle.pro #btnTitleNew, #scrTitle.pro #btnTitleBoard, #scrTitle.pro #btnTitleCards, #scrTitle.pro #btnTitleLoad { display: none !important; }
#scrTitle.pro #btnContinue.cant { display: none !important; }
#scrTitle.pro .trow3 { grid-template-columns: 1fr 1fr; }
#scrTitle #btnBegin small { display: block; margin-top: 3px; font: 600 12px/1.2 Georgia,serif; letter-spacing: .3px; text-transform: none; opacity: .85; }
/* THE BEGIN PLATE (the night title's gold): the word and the game's name
   share one centre line — the flame hangs left of the word and an empty
   twin balances it on the right — and both sit inside the carved groove
   (8.6px in from the rim), the name struck into the gold in dark ink like
   the word (cream on gold could not be read, and on a 58px plate the line
   lay across the bottom bevel) */
#scrTitle.t2 .plaques #btnBegin { --bi: 27px; min-height: 76px; padding: 10px 14px; }
#scrTitle.t2 #btnBegin .t2i { width: var(--bi); height: var(--bi); }
#scrTitle.t2 #btnBegin .blab::after { content: ''; flex: 0 0 auto; width: var(--bi); }
#scrTitle.t2 .plaques #btnBegin small { margin-top: 4px; font: 700 13px/1.15 'Cinzel','Times New Roman',Georgia,serif; letter-spacing: 1.3px;
  text-transform: none; white-space: nowrap; color: #4a2709; opacity: 1; text-shadow: 0 1px 0 rgba(255,243,205,.62); }
@media (max-height: 600px) {
  #scrTitle.t2 .plaques #btnBegin { --bi: 23px; min-height: 64px; padding: 8px 12px; }
  #scrTitle.t2 .plaques #btnBegin small { margin-top: 2px; font-size: 12px; }
}
#scrTitle .proSkip { display: block; margin: 14px auto 0; padding: 8px 14px; border: 0; background: none; cursor: pointer;
  color: rgba(243,226,180,.72); font: 600 13px/1 Georgia,serif; text-decoration: underline; text-underline-offset: 3px; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#scrTitle .proSkip.arm { color: #ffd77a; }
`;
    document.head.appendChild(st);
  },
};
window.Prologue = Prologue;
