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
      if (this.vis('#panel [data-act="gobuild"]')) return { sel: '#panel [data-act="gobuild"]' };
      if (this.vis('#bmToggle')) return { sel: '#bmToggle' };
      return null;
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
  /* THE LINE CHAIN (a road, a wall): the Build tab → the card → the site
     itself, where one tap lays a stretch (a drag lays a longer one: UI's
     line drag, which takes no ✓) */
  lineRing(key, site) {
    return () => {
      if (UI.placing === key) return this.siteMark(site);
      const card = '.bbtn[data-key="' + key + '"]';
      if (this.vis(card)) return { sel: card };
      if (this.vis('#panel [data-act="gobuild"]')) return { sel: '#panel [data-act="gobuild"]' };
      if (this.vis('#bmToggle')) return { sel: '#bmToggle' };
      return null;
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
      if (this.vis(sel)) return { sel };
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
    return (S.res.food || 0) < (S.res.wood || 0) ? 'food' : 'wood';
  },
  // a line names the good it asks for: the view keeps it (its ring sends hands there)
  naming(r) { this._said = r; return r; },
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
    let best = null, bd = 1e9, near = null, nd = 1e9;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, g = CFG.GATHER[ter[i]];
      if (!g || g.res !== res || !(amt[i] > 0) || (ex && !ex[i])) continue;
      if (may && !may(x, y)) continue;
      const d = (x + 0.5 - u.x) ** 2 + (y + 0.5 - u.y) ** 2;
      if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
      if (home && d < nd && (home[i - 1] || home[i + 1] || home[i - W] || home[i + W])) { nd = d; near = { x: x + 0.5, y: y + 0.5, r: 0.8 }; }
    }
    return near || best;
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
        { id: 'grow', face: 'thinking', text: 'Next, a bigger hall. Gather the food, wood and stone it needs.', gather: true,
          gwait: () => 'Our hall must grow. The ' + P.naming(P.need()) + ' is coming in.',
          goal: () => 'Raise the hall: ' + P.hallNeeds(), ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); },
          praise: 'We have enough!' },
        // an upgrade rises only with hands on it (the game's rule): the guide sends them
        { id: 'raise', face: 'excited', text: 'Tap the hall, then Upgrade. A bigger hall, a stronger clan.',
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
        /* THE LAKE ISLES (operator, build 184: "Add roads, hunters lodge,
           barracks, archers towers and walls to level 2 … something like
           islands and lakes"): six things to raise, paid from the stores,
           and the hall's storey the only thing gathered for */
        { id: 'hunt', face: 'point', text: 'Welcome back, chief. A deer grazes nearby. Send someone to hunt it.',
          goal: 'Hunt a deer', ring: () => P.huntRing(), taps: () => P.huntTaps(),
          ack: () => P.hunting() || P.killed(), wait: 'The hunt is on.',
          done: () => P.killed(), praise: 'Fresh meat!' },
        { id: 'lodge', face: 'point', text: "Build a hunter's lodge where the deer fell.", key: 'lodge',
          goal: () => P.buildGoal('lodge', "Build a hunter's lodge"),
          when: () => P.afford('lodge') || P.has('lodge'), hold: (c) => P.needLine("A hunter's lodge", null, c),
          on: () => Scenarios.unlock('lodge'),
          ring: P.buildRing('lodge', () => P.huntSpot()), taps: () => { const r = P.buildRing('lodge', () => P.huntSpot())(); return r ? [r] : []; },
          ack: () => P.has('lodge'), site: () => P.siteOf('lodge'),
          done: () => P.raised('lodge'), praise: 'A lodge!' },
        { id: 'road', face: 'point', text: 'Roads speed our people. Lay one beside the hall.', key: 'road',
          goal: 'Lay a road',
          when: () => P.afford('road') || P.laid(), hold: (c) => P.needLine('A road', null, c),
          on: () => Scenarios.unlock('road'),
          ring: P.lineRing('road', 'roadSite'), taps: () => { const r = P.lineRing('road', 'roadSite')(); return r ? [r] : []; },
          ack: () => P.laid(), site: () => P.siteOf('road'),
          done: () => P.laid() && (!P.siteOf('road') || P.builders(P.siteOf('road')).length > 0), praise: 'A fine road!' },
        /* THE CARD LESSON PLAYS MASTER BUILDERS, WHERE ITS WORK IS SEEN (operator, build 191:
           "For game 1, make Master Builder the default card … If we don't have a specific card
           we play for a specific reason in game 2 … we could rely on this card for the
           teaching"): game 1's win pays it, and the lesson comes before the barracks, so the
           barracks, the range and the tower stand the moment they are placed. Any other card
           (a device that holds none) is played as before, and the line says so plainly. */
        { id: 'deck', face: 'point',
          text: () => P.holdsMB() ? 'Cards can help. Play Master Builders: our next buildings stand at once.' : 'You carry cards. Tap your deck and play one.',
          goal: () => P.holdsMB() ? 'Play Master Builders' : 'Play a card',
          skipIf: () => !(window.Deck && Deck.on && Deck.on() && Deck.total && Deck.total() > 0),
          on: () => { P._deckOpen = true; },
          ring: () => P.deckRing(), taps: () => { const r = P.deckRing(); return r ? [r] : []; },
          // the card's own act answers the Play; the next line comes the moment it is over
          ack: () => P.played(),
          done: () => P.played() && !(window.Deck && Deck.acting && Deck.acting()), praise: 'Well played!' },
        /* WHY A BARRACKS (operator, build 191: "add a little more context … these are
           dangerous times. We could be attacked by animals, enemy villagers, or the others …
           If it can't fit on 1 card, maybe we expand to 2 cards"): a short warning of its own,
           then the instruction */
        { id: 'danger', face: 'concerned', text: 'Dangerous times. Wolves, raiders, or the clan that burned us may strike.', auto: 5200,
          goal: 'Dangerous times' },
        { id: 'barracks', face: 'determined', text: 'So we need soldiers. Build a barracks to train them.', key: 'barracks',
          goal: () => P.buildGoal('barracks', 'Build a barracks'),
          when: () => P.afford('barracks') || P.has('barracks'), hold: (c) => P.needLine('A barracks', null, c),
          on: () => Scenarios.unlock('barracks'),
          ring: P.buildRing('barracks', 'barracksSite'), taps: () => { const r = P.buildRing('barracks', 'barracksSite')(); return r ? [r] : []; },
          ack: () => P.has('barracks'), site: () => P.siteOf('barracks'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The barracks is going up.',
          done: () => P.has('barracks', true), praise: 'A barracks, and its first soldier!' },
        { id: 'range', face: 'point', text: 'Archers guard our towers. Build an archery range.', key: 'range',
          goal: () => P.buildGoal('range', 'Build an archery range'),
          when: () => P.afford('range') || P.has('range'), hold: (c) => P.needLine('An archery range', null, c),
          on: () => Scenarios.unlock('range'),
          ring: P.buildRing('range', 'rangeSite'), taps: () => { const r = P.buildRing('range', 'rangeSite')(); return r ? [r] : []; },
          ack: () => P.has('range'), site: () => P.siteOf('range'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The range is going up.',
          done: () => P.has('range', true), praise: 'A range, and its first archer!' },
        { id: 'tower', face: 'point', text: 'Build a watchtower by the land bridge.', key: 'tower',
          goal: () => P.buildGoal('tower', 'Build a watchtower'),
          when: () => P.afford('tower') || P.has('tower'), hold: (c) => P.needLine('A tower', null, c),
          on: () => Scenarios.unlock('tower'),
          ring: P.buildRing('tower', 'towerSite'), taps: () => { const r = P.buildRing('tower', 'towerSite')(); return r ? [r] : []; },
          ack: () => P.has('tower'), site: () => P.siteOf('tower'), hands: 2, handsText: 'Send villagers to build it. Many hands, quick work.',
          wait: 'The tower is going up.',
          done: () => P.has('tower', true), praise: 'A tower!' },
        // the tower shoots only through the bows posted on it (the game's rule since build 148)
        { id: 'man', face: 'point', text: 'A tower shoots only with archers on it. Send your archer up.',
          goal: 'Send the archer up the tower',
          when: () => P.has('tower', true) && !!(P.bow() || P.manned()),
          ring: () => P.manRing(), taps: () => P.manTaps(),
          done: () => P.manned(), praise: 'Sharp eyes up there!' },
        /* THE WALL, THE SCOUT AND THE GATE (operator, build 187: "get them to
           place it and then place the wall next to it, and then another wall.
           It shows a completed wall. Then show an enemy coming to scout and
           getting shot at by the archer … Then maybe teach the player how to
           build a gate out of a wall and why this is helpful. THEN we can move
           on to the Town Center upgrade"): three sections across the land
           bridge, one beside the other, each with a hand on it; the finished
           line; a scout of the wild country who comes to it and is shot down
           from the tower; a gate cut into it, and opened */
        { id: 'wall', face: 'point', text: 'Walls keep raiders out. Build one on the land bridge.', key: 'wall',
          goal: () => P.wallGoal(),
          when: () => P.afford('wall') || P.laidOnLine() >= 1, hold: (c) => P.needLine('A wall', null, c),
          on: () => Scenarios.unlock('wall'),
          ring: P.lineRing('wall', () => P.nextLineTile()), taps: () => { const r = P.lineRing('wall', () => P.nextLineTile())(); return r ? [r] : []; },
          ack: () => P.laidOnLine() >= 1, site: () => P.lineSite(),
          done: () => P.laidOnLine() >= 1 && !P.lineSite(), praise: 'Good!' },
        { id: 'wall2', face: 'point', text: 'Now build another right beside it.', key: 'wall',
          goal: () => P.wallGoal(),
          when: () => P.afford('wall') || P.laidOnLine() >= 2, hold: (c) => P.needLine('A wall', null, c),
          ring: P.lineRing('wall', () => P.nextLineTile()), taps: () => { const r = P.lineRing('wall', () => P.nextLineTile())(); return r ? [r] : []; },
          ack: () => P.laidOnLine() >= 2, site: () => P.lineSite(),
          done: () => P.laidOnLine() >= 2 && !P.lineSite(), praise: 'Good!' },
        { id: 'wall3', face: 'point', text: 'And one more to close the bridge.', key: 'wall',
          goal: () => P.wallGoal(),
          when: () => P.afford('wall') || P.laidOnLine() >= 3, hold: (c) => P.needLine('A wall', null, c),
          ring: P.lineRing('wall', () => P.nextLineTile()), taps: () => { const r = P.lineRing('wall', () => P.nextLineTile())(); return r ? [r] : []; },
          ack: () => P.laidOnLine() >= 3, site: () => P.lineSite(), wait: 'The wall is going up.',
          done: () => P.lineDone(), praise: 'The bridge is closed!' },
        // shown, never asked: no ring and no hand — the view on the wall while the archer shoots
        { id: 'scout', face: 'surprised', text: 'A scout comes! Watch our archer on the tower.',
          goal: 'Watch the tower',
          on: () => P.sendScout(), look: () => P.wallView(),
          done: () => P.scoutDone(), praise: 'The wall held!' },
        /* MEND WHAT HE BROKE (operator, build 191: "right after we defeat the attacker, teach
           the player how to repair a wall by clicking on the wall that is on fire"): a villager
           in hand, a tap on the hurt section, and the section is whole again. Passed over when
           the scout never landed a blow. */
        { id: 'mend', face: 'point', text: 'Mend the damaged wall: tap a villager, then the wall.',
          goal: 'Mend the wall', skipIf: () => !P.hurtFort(),
          ring: () => P.handsRing({ site: () => P.hurtFort() }), taps: () => P.handsTaps({ site: () => P.hurtFort() }),
          ack: () => { const w = P.hurtFort(); return !w || P.builders(w).length > 0; }, wait: 'The wall is being mended.',
          done: () => !P.hurtFort(), praise: 'Good as new!' },
        { id: 'gate', face: 'point', text: 'A gate opens for us, never raiders. Build one in the wall.',
          goal: () => P.gateGoal(), cost: () => P.gateCost(),
          when: () => P.canGate() || !!P.gateOnLine(), hold: (c) => P.needLine('A gate', null, c),
          ring: () => P.gateRing(), taps: () => { const r = P.gateRing(); return r ? [r] : []; },
          ack: () => !!P.gateOnLine(), site: () => P.gateSite(), wait: 'The gate is going up.',
          done: () => { const g = P.gateOnLine(); return !!g && !(g.construction > 0); }, praise: 'Well built!' },
        { id: 'opengate', face: 'point', text: 'Gates start shut. Tap the gate and open it.',
          goal: 'Open the gate',
          ring: () => P.openRing(), taps: () => { const r = P.openRing(); return r ? [r] : []; },
          done: () => { const g = P.gateOnLine(); return !!g && !(g.construction > 0) && !g.raised; }, praise: 'Our people pass freely!' },
        /* A GREY BUTTON SAYS WHAT IT IS MISSING (operator, build 191: "The player might be
           confused when they need to raise the hall to level 3 … teach them that they can click
           on greyed out things and then see a notification about what they're missing … right
           beneath Mira and her comment"): the hall's Upgrade, grey, is tapped; the refusal names
           the goods still wanting (Bld.canUpgrade's `short`) under her card. Passed over when the
           hall can already rise. */
        { id: 'greyed', face: 'thinking', text: "Grey buttons are not ready. Tap the hall's grey Upgrade.",
          goal: 'Tap the grey Upgrade', skipIf: () => { const tc = P.tc(); return !tc || tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok; },
          ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="upgrade"]')(); return r ? [r] : []; },
          done: () => P._greyAt > (P._beatT0 || 0) || (() => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); })(),
          praise: 'See? It says what is missing.' },
        { id: 'grow', face: 'thinking', text: 'Now raise the hall again. Gather what it needs.', gather: true,
          gwait: () => 'The hall will rise again. The ' + P.naming(P.need()) + ' is coming in.',
          goal: () => 'Raise the hall: ' + P.hallNeeds(), ring: () => P.gatherRing(), taps: () => P.gatherTaps(),
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
        { id: 'barracks', face: 'determined', text: 'They have found us, chief. Build a barracks.', key: 'barracks',
          goal: () => P.buildGoal('barracks', 'Build a barracks'),
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
        /* THE OTHER KEY BUILDINGS (operator, build 184: "Add the other key
           buildings to level 3"): each station on the ground its own work
           left, and the gold seam claimed by a hand — while the soldiers drill.
           An origin that planted one (Timberwright, Stoneheart, Grainkeeper)
           has already answered its line, which is passed over unsaid — its
           card is opened all the same (`unlocks`). */
        { id: 'lumber', face: 'point', text: 'Old felled trees lie nearby. Build a lumber camp there.', key: 'lumber',
          goal: () => P.buildGoal('lumber', 'Build a lumber camp'),
          when: () => P.afford('lumber') || P.has('lumber'), hold: (c) => P.needLine('A lumber camp', null, c),
          on: () => Scenarios.unlock('lumber'), unlocks: 'lumber',
          ring: P.buildRing('lumber', 'stumps'), taps: () => { const r = P.buildRing('lumber', 'stumps')(); return r ? [r] : []; },
          ack: () => P.has('lumber'), site: () => P.siteOf('lumber'),
          done: () => P.raised('lumber'), praise: 'A lumber camp!' },
        { id: 'quarry', face: 'point', text: 'Now a quarry, on the broken rock.', key: 'quarry',
          goal: () => P.buildGoal('quarry', 'Build a quarry'),
          when: () => P.afford('quarry') || P.has('quarry'), hold: (c) => P.needLine('A quarry', null, c),
          on: () => Scenarios.unlock('quarry'), unlocks: 'quarry',
          ring: P.buildRing('quarry', 'pebbles'), taps: () => { const r = P.buildRing('quarry', 'pebbles')(); return r ? [r] : []; },
          ack: () => P.has('quarry'), site: () => P.siteOf('quarry'),
          done: () => P.raised('quarry'), praise: 'A quarry!' },
        { id: 'farm', face: 'point', text: 'And a farm, where the berries were picked bare.', key: 'farm',
          goal: () => P.buildGoal('farm', 'Build a farm'),
          when: () => P.afford('farm') || P.has('farm'), hold: (c) => P.needLine('A farm', null, c),
          on: () => Scenarios.unlock('farm'), unlocks: 'farm',
          ring: P.buildRing('farm', 'barren'), taps: () => { const r = P.buildRing('farm', 'barren')(); return r ? [r] : []; },
          ack: () => P.has('farm'), site: () => P.siteOf('farm'),
          done: () => P.raised('farm'), praise: 'A farm!' },
        // a seam is claimed, never built: a hand walks out and the works go up round them
        { id: 'mine', face: 'point', text: 'A gold seam lies by the woods. Send someone to claim it.',
          goal: 'Claim the gold seam', ring: P.sendTo('gold'), taps: P.sendTaps('gold'),
          done: () => P.claiming() || P.has('mine'), praise: 'Gold!' },
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
          goal: () => 'Raise the Wonder: ' + P.costLine('wonder'), cost: () => Bld.effCost('P', 'wonder'),
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
  // the device holds game 1's card (asked before the deck is shown, when nothing can be played yet)
  holdsMB() { try { return Deck.col().counts.master_builders > 0 && !!Deck.card('master_builders'); } catch (e) { return false; } },
  deckPick() {
    let best = null;
    try {
      const k = Deck.col().counts;
      // the lesson's own card, when the device holds it and it can play (game 1's reward)
      if (k.master_builders > 0 && Deck.card('master_builders') && Deck.canPlay('master_builders').ok) return 'master_builders';
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
    const ts = this.lineTiles(), has = ts.map(t => !!this.fortOn(t));
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
  lineDone() { const f = this.lineForts(); return f.length === this.LINE.length && f.every(b => !(b.construction > 0)); },
  wallGoal() {
    const n = this.laidOnLine();
    return n >= this.LINE.length || this.afford('wall') ? 'Close the bridge: Walls ' + n + '/' + this.LINE.length
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
  scout() { return S.units.find(u => u.proScout && u.hp > 0) || null; },
  sendScout() {
    if (!S.pro || S.pro.scouted || typeof G === 'undefined' || !G.spawnBarb) return;   // G is a script const: never window.G
    const from = this.mark('scoutFrom'); if (!from) return;
    let u = null;
    try { u = G.spawnBarb('light', Math.floor(from.x), Math.floor(from.y), { tribe: 'wolf' }); } catch (e) {}
    if (!u) return;
    u.proScout = 1; u.hostileTo = 'P'; u.style = 'band'; u.tribe = u.tribe || 'wolf';
    u.speed = +(u.speed * this.SCOUT_PACE).toFixed(3);   // he creeps in, slow enough to be watched coming
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
  /* THE HUNT (game 2): a villager in hand → the nearest deer in sight (a
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
    const r = this.naming(res || this.need());
    return thing + ' needs more ' + r + (coming ? '. It is coming in.' : '. Gather it at ' + (this.WHERE[r] || 'the hills') + '.');
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
      if (this.isIdle(sel)) return this.workFor(sel, named ? need : this.spread());
      if (!idleOnly && !this.onRes(sel, need)) return this.workFor(sel, need);
    }
    const iv = this.idleVil();
    if (iv && iv !== sel && this.isIdle(iv) && !busy(iv)) return { u: iv.id };
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
    return [r, u ? this.workFor(u, this.isIdle(u) && !named ? this.spread() : need) : null].filter(Boolean);
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
    this._needS = null; this._said = null;
    this._hand = null; this._handN = 0; this._clk = 0; this._lastIn = 0;
    this._finale = null; this._held = null; this._raided = false;
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
      if (this._viewKey !== this._keyOf(b, ph, this._shown) || !this._shown) this._show(b, ph);
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
    if (b.when && !S.pro.said[b.id] && !b.when.call(this)) return b.hold ? (this.gatherRing(false, true) ? 'held' : 'gwait') : 'silent';
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
    // a line that names a good keeps it (`good`), and its ring sends hands to that good
    const named = (o) => { P._said = null; const text = o.text(); return Object.assign(base, o, { text, good: P._said,
      ring: () => P.gatherRing(false, base.good || false), taps: () => P.gatherTaps(false, base.good || false), gather: true }); };
    if (ph === 'held') return named({ face: b.holdFace || 'thinking', text: () => txt(b.hold) });
    // every hand is on it: said at once, so a tap that sent the last one is answered
    if (ph === 'gwait') return named({ face: 'pleased', text: () => b.hold && !S.pro.said[b.id] ? b.hold.call(P, true) : txt(b.gwait) });
    if (ph === 'hands') return Object.assign(base, { face: 'point', text: txt(b.handsText) || 'Now send a villager to build it.', ring: () => P.handsRing(b), taps: () => P.handsTaps(b) });
    if (ph === 'wait') return Object.assign(base, { face: b.waitFace || 'pleased', text: txt(b.wait), ring: () => P.gatherRing(true), taps: () => P.gatherTaps(true) });
    return Object.assign(base, { face: b.face, text: txt(b.text), ring: b.ring, taps: b.taps, auto: b.auto, gather: b.gather, look: b.look });
  },
  /* a view's key: the beat, the phase — and, for a line that names a good, the
     good it would name NOW (need() is kept while still short, so the key moves
     only when that good is in, and the line naming the next is said at once) */
  _keyOf(b, ph, v) {
    const k = b.id + ':' + ph;
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
    if (ph === 'gwait' && prev && prev.beat === b && (prev.phase === 'held' || prev.phase === 'ask') && !this._praise) this._praise = 'Good.';
    /* a gather line asked again (a hand went idle, a good ran short — or the
       good it named came in and the next is short): why, not the lesson again;
       a line naming a good rings that good */
    if (ph === 'ask' && b.gather && prev && prev.beat === b && (prev.phase === 'gwait' || (prev.phase === 'ask' && prev.good))) {
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
    this._praise = b.praise || '';
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
    return !this.KEEP.test(m);
  },
  // the guide is already telling the player about the raiders (game 3's raid line, raiders in the field — or game 2's scout at the wall)
  _raidSaid() {
    const v = this._shown;
    if (v && v.id === 'scout' && this.scout()) return true;
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
    document.addEventListener('pointerdown', () => { this._lastIn = this.now(); if (this._hand) this._hand = null; if (this._shown) this._acted = true; }, true);
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
      /* a build card scrolling in (UI.cardIntoView) is ringed from the moment the
         menu opens — the ring rides in with it from past the screen's edge — but
         not while its middle crosses the strip of the bar's own wood between the
         menu's edge and the screen's, where a tap lands on nothing */
      const box = el.closest && el.closest('#buildmenu');
      if (box) {
        const b = box.getBoundingClientRect(), cx = r.left + r.width / 2;
        if ((cx < b.left && cx >= 0) || (cx > b.right && cx <= innerWidth)) return null;
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
    return { x: cv.left + (wx * TL - R.cam.x) * z, y: cv.top + (wy * TL - R.cam.y) * z - lift * z, r: rr * TL * z };
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
      const s = document.querySelector('#topbar svg.ric[data-ic="' + this.TASK_IC[m[1]] + '"]');
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
    if (!raw || raw.sel || !tgt) return true;
    if (this._gliding) return false;
    const v = this._aside || this._shown || {}, cam = R.cam, t = performance.now();
    const us = typeof UI !== 'undefined' && UI.sel ? UI.sel : null;
    const sel = us ? us.type + ':' + (us.id != null ? us.id : (us.ids ? us.ids.join(',') : '')) : '';
    const key = (v.id || '') + ':' + (v.phase || '') + ':' + (raw.u !== undefined ? 'u' + raw.u : (raw.x | 0) + ',' + (raw.y | 0)) + ':' + sel;
    const m = 24, inView = tgt.x > m && tgt.x < B.vw - m && tgt.y > B.top + m && tgt.y < B.bot - m && this._open(tgt.x, tgt.y) && !this._cardOver(tgt);
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
    if (!win || !this._finale || document.hidden || !window.Screens || Screens.current !== 'playing') return false;
    this._held = { win, msg, s0: S, g };
    this._shown = null; this._viewKey = null; this._aside = null; this._goalBeat = null;
    this._collapsed = false; this._userHid = false;
    this.say(g === 1 ? 'Our first fire burns, chief. May the clan that burned our home never see it.' : g === 2 ? 'A great hall! The clan is proud, chief.' : 'Well done, chief.', 'proud');
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
