"use strict";
/* Screens — the game shell: a tiny state machine over full-viewport screens
   (title / newgame / load / settings / playing / paused / endgame / howto).
   'playing' is the absence of a screen: the shell hides and the HUD returns.
   All chrome uses the established wood/16-bit identity. Mobile-first. */

const Screens = {
  current: null,
  saveMode: false,          // the Load screen doubles as a save-slot picker
  backTo: 'title',          // where Load/Settings/HowTo return to
  lastSavedDay: 0,          // quit-guard: unsaved progress since this day
  _demo: false,             // S currently holds the title's demo world
  _confirmQuit: false,
  // difficulty is the ONLY choice a new game asks for — the world (landform,
  // variant, size) is rolled in foundRun. Arriving somewhere unknown is the
  // feature; there is no preview and no picker.
  newPrefs: { mode: 'moderate' },

  el(id) { return document.getElementById(id); },

  /* which window the trial cards were built for: a count of resizes, so the
     tap never reads the window's size (reading innerWidth after the screen
     has changed forces a whole layout inside the handler) */
  _vpGen: 0,
  init() {
    this.bind();
    window.addEventListener('resize', () => { this._vpGen++; });
    // the test slot says so on every menu screen (Backend.testSlot); in play
    // it would sit on the build menu, so a game hides it
    if (window.Backend && Backend.testSlot && Backend.testSlot()) {
      const st = document.createElement('style');
      st.textContent = 'body.ingame #testBadge{display:none}';
      document.head.appendChild(st);
      const tb = document.createElement('div');
      tb.id = 'testBadge'; tb.textContent = 'TEST BUILD';
      tb.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 4px);transform:translateX(-50%);' +
        'z-index:99;pointer-events:none;font:700 10px/1 sans-serif;letter-spacing:2px;color:#ffd27a;' +
        'background:rgba(90,20,10,0.82);border:1px solid #e0a040;border-radius:4px;padding:3px 7px;';
      document.body.appendChild(tb);
    }
    window.addEventListener('backend-status', e => {
      this.renderChip(e.detail);
      // the backend often comes up after the title first renders — re-resolve
      // the Continue button so cloud saves win over the local crash net
      if (this.current === 'title') this.onTitle();
    });
    // title camera drift
    const pan = () => {
      if (this.current === 'title' && window.S && R.terrainCache) {
        // a demo world that plays itself to a finish quietly rolls a new one
        if (S.over && this._demo) { this._demo = false; this.ensureDemo(); }
        R.cam.x += 0.22; R.cam.y += 0.09;
        const world = CFG.W * CFG.TILE;
        if (R.cam.x > world - R.viewW() / R.cam.z) { R.cam.x = -40; R.cam.y = 40 + Math.random() * world * 0.3; }
        R.clampCam();
      }
      requestAnimationFrame(pan);
    };
    requestAnimationFrame(pan);
  },

  renderChip(d) {
    const chip = this.el('cloudChip');
    if (!chip) return;
    if (!d.configured) { chip.textContent = '☁ cloud saves off'; return; }
    chip.textContent = d.uid ? (d.online ? '☁ ' + Backend.villageName(d.uid) : '☁ offline') : '☁ connecting…';
  },

  show(name, opts) {
    opts = opts || {};
    this.current = name;
    this.el('shell').classList.toggle('show', name !== 'playing');
    const night = this.nightBehind(name) && !!this.wearNight();
    this.el('shell').classList.toggle('night', night);
    document.body.classList.toggle('shell', name !== 'playing');
    /* IN-GAME CHROME IS GATED ON A GAME EXISTING (index.html, tests/boot.mjs).
       The HUD is hidden by default and this class is the only thing that
       brings it back, so nothing renders before the player is actually in a
       game. `playing` alone is not the test: the title runs a DEMO world in
       S, which must never wear a resource bar. */
    document.body.classList.toggle('ingame',
      name === 'playing' && !!window.S && !this._demo);
    // …and entering a game always retires the boot splash, whatever the timer
    if (name === 'playing' && window.Boot) Boot.force();
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('show');
    let scr = this.el('scr' + name[0].toUpperCase() + name.slice(1));
    /* THE NEW SETTINGS PAGE IS STAGED (js/settings.js): on a device the card
       test link turned on it stands in for #scrSettings; everywhere else the
       old screen shows exactly as it did. One predicate, SettingsPage.live(). */
    if (name === 'settings' && window.SettingsPage && SettingsPage.live()) scr = SettingsPage.mount();
    if (scr) scr.classList.add('show');
    this._confirmQuit = false;
    if (name === 'title') this.onTitle();
    else if (name === 'draft') this.onDraft();
    else if (name === 'newgame') this.onNewgame();
    else if (name === 'load') this.onLoad(opts);
    else if (name === 'settings') this.onSettings();
    else if (name === 'paused') this.onPaused();
    else if (name === 'leaders') this.onLeaders();
    else if (name === 'endgame') this.onEndgame(opts);
    else if (name === 'doomed') this.onDoomed();
    else if (name === 'playing') {
      if (window.S) S.paused = false;
      if (window.S && !this._demo) S.played = true;   // analytics: this world is a game somebody played
      if (!this._demo && typeof G !== 'undefined' && G.warmFx) G.warmFx();   // the event's own art, if the run holds one
      // a real game, settled in: the endgame gallery may start loading, one
      // picture at a time, once the wire has been quiet for half a minute
      if (window.S && !this._demo && window.Assets && Assets.startEndgameArt) {
        clearTimeout(this._galleryT);
        this._galleryT = setTimeout(() => { if (this.current === 'playing' && !this._demo) Assets.startEndgameArt(); }, 30000);
      }
    }
    if (name !== 'playing' && window.S && !this._demo) S.paused = true;
    // leaving the game takes the victory modal with it (it was stamped seen
    // when shown, so it never comes back over a resumed or reloaded world)
    if (name !== 'playing' && this.hideVictoryPaths) this.hideVictoryPaths();
    // the card announcement stands over one screen only (js/cardintro.js):
    // leaving it takes the announcement away — a no-op when none is open
    if (window.CardIntro) { try { CardIntro.onScreen(name); } catch (e) {} }
  },

  /* ---------------- title ---------------- */
  /* the art, or a floor: resolves when Assets has no request in flight, or
     after ms — whichever first. Without Assets (a test stub) it is now. */
  DEMO_ART_FLOOR_MS: 20000,   // a dead link still gets a title; a slow one gets its art
  GAME_ART_FLOOR_MS: 15000,
  waitForArt(ms) {
    if (!window.Assets || !Assets.whenIdle || Assets.artReady()) return Promise.resolve();
    return Promise.race([Assets.whenIdle(), new Promise(r => setTimeout(r, ms))]);
  },
  // the world's own families only — what the demo's bake composes with
  waitForWorldArt(ms) {
    if (!window.Assets || !Assets.whenWorldIdle || Assets.worldReady()) return Promise.resolve();
    return Promise.race([Assets.whenWorldIdle(), new Promise(r => setTimeout(r, ms))]);
  },
  ensureDemo() {
    if (window.S && this._demo) return;
    /* A PENDING DRAFT OUTRANKS THE DEMO. Backing all the way to the title
       with a founded world and an un-kept hand must not roll the demo over
       it — that was a four-tap free re-deal (title round trip → same trial
       → fresh cards). The title simply drifts over the pending world
       instead; New game → the same trial resumes it, any explicit act that
       replaces S (Continue, Load, a different trial) forfeits it honestly. */
    if (window.S && S.draft && !S.draft.done && !S.over) return;
    this._demo = true;
    /* THE DEMO BAKES ONCE, WITH THE ART. Founded here at page load, it used
       to bake at once — procedural, since no PNG had decoded yet — and then
       be rebaked family by family as the art landed: the freeze-and-snap the
       operator watched every launch. The bake is deferred and HELD
       (R.holdBake) until every art request has settled, with a floor so a
       dead network still gets a title; the frame loop then bakes it in
       slices behind the logo, and Boot is told the title is ready from the
       first frame that draws it (G.frame). */
    R.deferBake = true;
    try { G.newGame(String((Math.random() * 1e9) | 0), 'moderate', 'large'); }
    finally { R.deferBake = false; }
    R.holdBake = true;
    this.waitForWorldArt(this.DEMO_ART_FLOOR_MS).then(() => { R.holdBake = false; });
    Cards.pick((Math.random() * 3) | 0);   // the demo world drafts for itself
    G.freeVis = true;         // newGame resets fog; the demo shows the whole map
    G.updateVisibility();
    S.paused = false;                       // the world lives behind the logo
    document.getElementById('toasts').innerHTML = '';
    R.cam.z = 1.7;
    const tc = Bld.tcOf('P');            // open on the village, drift from there
    if (tc) R.centerOn(tc.x, tc.y); else { R.cam.x = 0; R.cam.y = CFG.W * CFG.TILE * 0.3; }
  },

  /* THE NIGHT STANDS BEHIND THE CARD SCREENS (operator, on the test build:
     "the game map in the background in general is slow to load, it's black
     for the first few seconds"). The world behind the new-game screen and
     the draft is not drawn until its art has landed and its bake is done
     (R.holdBake) — on a phone that is seconds of a black canvas under the
     cards. Those two screens stand on the title's own painting instead: the
     same picture by the same URL (Boot.t2wear), already decoded, so it costs
     nothing, and the world under it is not drawn at all (G.frame asks
     nightUp), which leaves the thread to the cards. A painting that 404s
     stands down: the world shows through as it always did. */
  nightBehind(name) { return name === 'newgame' || name === 'draft'; },
  wearNight() {
    if (this._night !== undefined) return this._night;
    this._night = null;
    const sh = this.el('shell');
    if (!sh || !(window.Boot && Boot.t2wear)) return null;
    const box = document.createElement('div');
    box.id = 'shellNight'; box.setAttribute('aria-hidden', 'true');
    sh.insertBefore(box, sh.firstChild);
    const img = Boot.t2wear(box);
    if (img) img.addEventListener('error', () => { this._night = null; sh.classList.remove('night'); });
    return (this._night = img ? box : null);
  },
  nightUp() {
    if (!this._night || !this.nightBehind(this.current)) return false;
    const img = this._night.querySelector('img.t2img');
    return !!(img && img.complete && img.naturalWidth);
  },

  /* THE CARDS ARE READY BEFORE THE TAP (operator: "the current build, when
     you click New Game, loads the difficulty select instantly. We've
     reintroduced delays"). Building the framed trial cards inside the tap —
     a forced layout, three frames, the pictures asked for then — cost a slow
     phone ~120ms before the screen moved and ~1s before the pictures were
     in. So once the splash has lifted and the title is quiet, the trial
     screen is laid out unseen and dressed (`.screen.prep`), its pictures
     asked for at high priority, the origin cards' frames built, their
     pictures fetched and the burn's fire made — a few small steps, one per
     task. The boot itself still fetches no card art (tests/draft-cards.mjs);
     a tap that beats all this simply builds what it needs, as before. */
  CARD_PREP_MS: 400,
  armCardPrep() {
    if (this._cardPrep || !window.CardFace) return;
    const go = () => {
      if (this._cardPrep) return;
      if (window.Boot && !Boot.done) { setTimeout(go, 200); return; }
      this._cardPrep = true;
      setTimeout(() => this.prepCards(), this.CARD_PREP_MS);
    };
    go();
  },
  prepCards() {
    this._cardPrepAt = performance.now();
    const steps = [
      () => { for (const m of ['calm', 'moderate', 'hard']) CardFace.trialImg(m, () => {}); },
      () => this.wearNight(),
      () => this.prepTrial(),
      () => { if (this._ngSize) CardFace.prewarm(this._ngSize); },
      () => { if (window.Assets && Assets.wantOrigins && Assets.originMotifs) Assets.wantOrigins(Assets.originMotifs()); },
      () => { if (!this._fireTex) this.fireTex(); },
    ];
    const run = () => {
      const s = steps.shift();
      if (!s) return;
      try { s(); } catch (e) {}
      setTimeout(run, 30);
    };
    run();
  },
  prepTrial() {
    if (this.current === 'newgame' || !window.CardFace) return;
    const scr = this.el('scrNewgame'), box = this.el('ngMode');
    if (!scr || !box) return;
    scr.classList.add('prep');
    const c0 = box.querySelector('.dcard');
    this._ngSize = c0 && c0.offsetWidth ? { w: c0.offsetWidth, h: c0.offsetHeight } : null;
    this._ngVP = this._vpGen;
    if (this._ngSize) box.querySelectorAll('.dcard').forEach(b => CardFace.dressTrial(b, this._ngSize));
    CardFace.refitWhenFontsLand();
    // the words are fitted in the next frame (fitLater); the screen goes back
    // out of the layout right after them
    requestAnimationFrame(() => scr.classList.remove('prep'));
  },

  onTitle() {
    this.ensureDemo();
    this.armCardPrep();
    this.backTo = 'title';
    // Continue = newest cloud slot (or the crash-net snapshot if it's all we have)
    const btn = this.el('btnContinue');
    btn.classList.add('cant');
    btn.querySelector('small').textContent = 'looking for saves…';
    this._newestSlot = null;
    let snap = window.Backend ? Backend.readLocalSnapshot() : null;
    try {   // a finished run in the crash net is a told story, not a Continue
      if (snap && snap.json && JSON.parse(snap.json).over) snap = null;
      // …and nothing OLDER than the last finish continues either (the net is
      // cleared at game end; this guards a stale or imported snapshot)
      if (snap && Backend.lastFinishAt && !((snap.at || 0) > Backend.lastFinishAt())) snap = null;
    } catch (e) { snap = null; }
    const finish = (label, ok) => {
      btn.querySelector('small').textContent = label;
      btn.classList.toggle('cant', !ok);
    };
    if (window.Backend && Backend.isReady()) {
      Backend.listSaves().then(r => {
        const rows = ((r.ok && r.data) || []).slice()
          .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        /* a run that FINISHED is a told story in ALL its snapshots, not just
           the one that carries the trophy: a mid-run save of a won game must
           not resurrect the Continue button (the slots themselves stay fully
           loadable from the Load screen — savescumming is the player's
           right, Continue just doesn't walk back into it). Finished runs are
           known two ways: rows stamped over (legacy saves), and the local
           finished-seeds ledger finalizeRun keeps. AND the finish is a hard
           line in time: once a game ends, Continue offers nothing older than
           that moment — not even an unfinished OTHER run from last week.
           "My game is over, New Game is my only option." A save written
           after the finish (a new run, or an old slot loaded and played)
           brings the button back. */
        const finAt = Backend.lastFinishAt ? Backend.lastFinishAt() : 0;
        const done = new Set((Backend.finishedSeeds ? Backend.finishedSeeds() : []).map(String));
        for (const row of rows) if (row.over && row.map_seed != null) done.add(String(row.map_seed));
        const live = rows.find(row => !row.over && !done.has(String(row.map_seed)) &&
          (Date.parse(row.updated_at) || 0) > finAt);   // newest live snapshot of an UNFINISHED run, saved SINCE the last finish
        // Continue = the MOST RECENT playable game. An unfinished run that was
        // never saved to a slot lives only in the crash net, and can be newer
        // than any cloud slot — don't let a stale cloud save shadow it.
        const liveAt = live ? (Date.parse(live.updated_at) || 0) : 0;
        if (snap && snap.json && (snap.at || 0) > liveAt) {
          this._newestSlot = 'local';
          finish('recover last session (day ' + snap.day + ')', true);
        } else if (live) {
          this._newestSlot = live.slot;
          finish(`${live.name} — day ${live.day}`, true);
        } else if (snap && snap.json) { this._newestSlot = 'local'; finish('recover last session (day ' + snap.day + ')', true); }
        else if (rows.length) finish('last run complete — start a new game', false);
        else finish('no saves yet', false);
      });
    } else if (snap && snap.json) { this._newestSlot = 'local'; finish('recover last session (day ' + snap.day + ')', true); }
    else finish(window.Backend && Backend.configured ? 'no saves yet' : 'cloud saves off', false);
    // THE CARD SYSTEM's plaque and starter hand (js/deckscreens.js) — an early return with the switch off
    if (window.DeckScreens) { try { DeckScreens.onTitle(); } catch (e) { console.error('card title plaque', e); } }
    // THE NIGHT TITLE (js/titlescreen.js) — staged; an early return everywhere else.
    // After the deck's plaque, so the Cards plaque is dressed with the rest.
    if (window.TitleScreen) { try { TitleScreen.onTitle(); } catch (e) { console.error('night title', e); } }
  },

  async continueGame() {
    if (this._newestSlot == null) return;
    if (this._newestSlot === 'local') {
      const snap = Backend.readLocalSnapshot();
      if (!snap) return;
      R.deferBake = true; try { G.loadJSON(snap.json); } finally { R.deferBake = false; }
      if (snap.slot) Backend.markActiveSlot(snap.slot);
      this.enterGame();
      UI.toast('Recovered your last session — save it to a slot to keep it');
      return;
    }
    const r = await Backend.loadSlot(this._newestSlot);
    if (!r.ok) { UI.toast(r.error.message, true); return; }
    this.loadRow(r.data);
  },

  loadRow(row) {
    R.deferBake = true; try { G.loadJSON(typeof row.state === 'string' ? row.state : JSON.stringify(row.state)); } finally { R.deferBake = false; }
    Backend.markActiveSlot(row.slot);
    Backend.activeName = row.name;
    this.lastSavedDay = S.day;
    this._demo = false;
    // a finished run reopens at its tally (loadJSON already raised it) —
    // the score can still be saved to the board from there
    if (S.over) { G.freeVis = false; return; }
    this.enterGame();
  },

  enterGame() {
    this._demo = false;
    G.freeVis = false;
    R.cam.z = R.defaultZoom();   // never the demo's leftover (tests/desktop-layout.mjs)
    /* THE WORLD IS PLAYED WITH ITS ART ON. A run founded on a cold cache
       could reach this press before the strips and the kit had landed; it
       used to enter anyway, procedural, and snap a few seconds in. Now the
       press waits — behind a plaque that only appears when there is
       something to wait for — for the art and for the held bake to finish
       in slices, and only then shows the game. A warm cache never sees the
       plaque: the art settled behind the title long before. */
    const ready = () => window.Assets && Assets.artReady && Assets.artReady() && !R._bakeDue && !R._bake;
    if (ready()) { this._enterNow(); return; }
    this.showPrep(true);
    this.waitForArt(this.GAME_ART_FLOOR_MS).then(() => {
      R.holdBake = false;
      const tick = () => {
        if (!R._bakeDue && !R._bake) { this.showPrep(false); this._enterNow(); return; }
        R.tickBake(30); requestAnimationFrame(tick);   // behind the plaque: big slices, the bar still moves
      };
      tick();
    });
  },
  _enterNow() {
    /* ANALYTICS: a run BEGINS here — after the draft, so the kept card is
       known, and only for a world G.newGame just founded (G._freshRun), so
       loading a save is never counted as a new run. A start with no matching
       end is how the dashboard sees an abandoned run. */
    try {
      if (G._freshRun && !this._demo && window.Backend && Backend.logRunStart) {
        G._freshRun = false;
        const card = (S.draft && S.draft.done && S.draft.hand && S.draft.pickI != null
          && S.draft.hand[S.draft.pickI]) ? S.draft.hand[S.draft.pickI].key : null;
        Backend.logRunStart({
          mode: S.mode, landform: S.map && S.map.landform, size: S.sizeKey,
          tutorial: !!(S.tut && S.tut.on), card, origin: S.origin || null, seed: String(S.seed || ''),
        });
        S.runId = Backend.runId;   // rides in the save, so a Continue ends the same run
        if (window.Feedback) Feedback.runKey = S.runId;   // the error tally is this run's
      }
    } catch (e) { /* analytics may never keep a player out of their game */ }
    S.paused = false;
    document.getElementById('btnPause').textContent = '⏸';
    this.show('playing');
    // the first Calm game's modal, deferred from draftTap to the moment the
    // world is actually on screen (never under the art plaque)
    if (this._victoryPathsPending) {
      this._victoryPathsPending = false;
      if (this.victoryPathsDue()) this.showVictoryPaths();
    }
  },
  /* the plaque: made on first use, inline-styled like the splash so it needs
     no stylesheet, and it says what it waits for */
  showPrep(on) {
    let el = document.getElementById('prep');
    if (!el && !on) return;
    if (!el) {
      el = document.createElement('div'); el.id = 'prep';
      el.setAttribute('style', 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(13,11,8,0.55);pointer-events:none');
      el.innerHTML = '<div style="padding:14px 22px;border-radius:10px;background:#1a1610;color:#e8dcc0;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,0.5);text-align:center"><div>Preparing the world…</div><div id="prepBar" style="margin-top:10px;height:6px;width:180px;background:#3a3125;border-radius:3px;overflow:hidden"><div id="prepFill" style="height:100%;width:0;background:#e8c15a"></div></div></div>';
      document.body.appendChild(el);
    }
    el.style.display = on ? 'flex' : 'none';
    if (on) {
      const fill = document.getElementById('prepFill');
      const total = Math.max(1, (window.Assets && Assets.pending) || 1); this._prepTotal = Math.max(this._prepTotal || 0, total);
      const step = () => { if (el.style.display === 'none') return; const left = (window.Assets && Assets.pending) || 0;
        fill.style.width = Math.round(100 * (1 - left / this._prepTotal)) + '%'; requestAnimationFrame(step); };
      step();
    } else this._prepTotal = 0;
  },

  /* ---------------- new game ---------------- */
  // what each trial actually changes — shown under the cards for the
  // SELECTED one only, so reading all three costs three taps
  MODE_DESC: {
    calm: 'Begins at peace — no one attacks until you do. Raids are rare, your scouts always bring warning, and the land rolls wide.',
    moderate: 'The intended game. The rival presses, raids come on their own clock, and a warning reaches you half the time.',
    hard: 'An aggressive rival, frequent raids, and no warnings at all. The land rolls small — contact comes early.',
  },
  onNewgame() {
    // the three trial cards share one size: read it once — or not at all,
    // when the title's quiet moments already built them (prepTrial) for
    // this very window
    if (!this._ngSize || this._ngVP !== this._vpGen) {
      const c0 = this.el('ngMode').querySelector('.dcard');
      this._ngSize = c0 && c0.offsetWidth ? { w: c0.offsetWidth, h: c0.offsetHeight } : null;
      this._ngVP = this._vpGen;
    }
    this.el('ngMode').querySelectorAll('.dcard').forEach(b => {
      b.classList.toggle('sel', b.dataset.v === this.newPrefs.mode);
      // the framed face, built to its box (and its picture asked for) the
      // first time the screen shows — never at boot
      if (window.CardFace) { CardFace.dressTrial(b, this._ngSize); CardFace.watch(b); }
    });
    if (window.CardFace) CardFace.prewarm(this._ngSize);   // the origin cards' frames, while the trial is read
    if (window.CardFace) CardFace.refitWhenFontsLand();
    this.el('ngDesc').textContent = this.MODE_DESC[this.newPrefs.mode] || '';
    // entering the screen disarms any half-made choice: the remembered
    // trial shows selected, but starting always takes the two taps
    this._trialArmed = null;
    this.el('ngHint').textContent = '';
  },

  /* THE PRESS ANSWERS IN THE FRAME IT HAPPENS IN.
     Founding a run is most of a second of solid main-thread work on a big
     map — the seed hunt for a wished landform, generation, the spawns, and
     the full terrain bake — and it all used to run INSIDE the click handler.
     A handler that never returns paints nothing: the plaque never lit, the
     screen never changed, and the app read as hung until the draft appeared
     (reported as "stuttering and not starting right away"). Nothing about
     that work got slower than the eye can take; it simply had no way to say
     it had started.

     So the handler does the one cheap thing it can — say what it is doing —
     and hands the work to the frame AFTER the next paint. It takes TWO rAFs:
     the first fires before the browser paints, so work scheduled there is
     still in front of the pixels that announce it. `_founding` swallows a
     second press, which would otherwise found two worlds over each other. */
  startNewGame() {
    if (this._founding) return;
    /* BACKING OUT IS NOT A REROLL. The draft's back button returns here
       with the world already founded and the hand already dealt; a second
       tap on the SAME trial resumes that exact draft — map, cards and
       all. A fresh roll is only ever paid for with a different trial, so
       there is no free re-draw loop. */
    if (window.S && !this._demo && S.draft && !S.draft.done &&
        S.mode === this.newPrefs.mode) { this.show('draft'); return; }
    this._founding = true;
    // the founding announcement now lives on the hint line the second tap
    // just used — same spot the eye is already on (the next screen entry
    // clears it via onNewgame)
    const hint = this.el('ngHint');
    if (hint) hint.textContent = '🏕 Founding the valley…';
    const done = () => { this._founding = false; };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { this.foundRun(); } finally { done(); }
    }));
  },
  /* the size lean per difficulty — soft, never hard: every size stays
     possible at every difficulty. Calm gets room to build; Hard runs
     cramped, so contact comes early. (tests/variants.mjs) */
  SIZE_LEAN: {
    calm: [['xlarge', 0.40], ['large', 0.40], ['medium', 0.20]],
    moderate: [['large', 0.40], ['medium', 0.35], ['xlarge', 0.25]],
    hard: [['medium', 0.45], ['large', 0.35], ['xlarge', 0.20]],
  },
  foundRun() {
    const p = this.newPrefs;
    /* THE WORLD IS ROLLED, NOT PICKED. Landform lands uniform across the
       four (the generator's own seed-roll leans valley-heavy, so the wish
       is enforced the way the old landform picker enforced it: roll seeds
       until the draw comes up — generation is cheap). The variant rides the
       seed itself (map.js), so whatever seed satisfies the landform brings
       its own variant honestly. Size leans by difficulty (SIZE_LEAN).

       THE TUTORIAL NEVER GAMBLES: a first game with the teacher on is
       forced onto Valley · Classic at medium — its lessons anchor to
       forest, water and open ground, and a player learning the game should
       not be learning it on an archipelago. */
    /* …and THE PIN OUTRANKS THE AUTO-ON. "The tutorial outranks the pin"
       (below) was written when `tut` meant the checkbox; with the teacher on
       by default for a device's first two games, a new player who arrives
       by a shared ?seed= link would be handed Valley·Classic·medium instead
       of the world they were sent — and the pin silently consumed. An
       EXPLICIT checkbox still wins; an auto want yields to the pin, and the
       pinned run neither arms the teacher nor spends one of the two slots
       (draftTap reads _pinnedRun). */
    const pinRaw = (location.search.match(/[?&]seed=([^&]+)/) || [])[1] || '';
    this._pinnedRun = !!pinRaw && !this.tutorialExplicit();
    const tut = this.tutorialWanted() && !this._pinnedRun;
    const lean = this.SIZE_LEAN[p.mode] || this.SIZE_LEAN.moderate;
    let roll = Math.random(), size = lean[0][0];
    for (const [k, w] of lean) { if ((roll -= w) <= 0) { size = k; break; } }
    if (tut) size = 'medium';
    /* A PINNED WORLD (?seed=…&size=…): the URL names the seed and the run
       founds exactly that world instead of rolling one — the replay door
       for a seed read off the victory screen, and the only way to reach a
       named world on a phone. Size must ride along (the same seed lays a
       different map at a different size); it defaults to medium when the
       URL names only the seed. Everything else — difficulty, tunic, the
       card deal — plays out as normal. Three rules the adversarial review
       wrote: THE TUTORIAL OUTRANKS THE PIN (its Valley·Classic·medium
       force exists so lessons anchored to forest and water always can
       complete — a shared link must not gamble a first game away); a
       malformed percent-escape falls back to the raw string instead of
       throwing New Game dead; and the pin is ONE-SHOT — consumed on the
       found, so the NEXT New Game rolls fresh (an iOS home-screen launch
       keeps its query string forever, and a sticky pin would refound the
       same world for eternity with no way off it). */
    const qSeedRaw = (!tut && (location.search.match(/[?&]seed=([^&]+)/) || [])[1]) || '';
    let qSeed = '';
    if (qSeedRaw) { try { qSeed = decodeURIComponent(qSeedRaw); } catch (e) { qSeed = qSeedRaw; } }
    const qSize = (location.search.match(/[?&]size=(medium|large|xlarge)/) || [])[1] || '';
    if (qSeed) size = qSize || 'medium';
    let seed = '';
    CFG.W = CFG.H = CFG.SIZES[size];
    if (qSeed) {
      seed = qSeed;
      try {
        const usp = new URLSearchParams(location.search);
        usp.delete('seed'); usp.delete('size');
        const q = usp.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
      } catch (e) { /* an exotic embedder without history — the pin just stays */ }
    } else {
      const wantLf = tut ? 'valley'
        : ['valley', 'lakeland', 'highlands', 'islands'][(Math.random() * 4) | 0];
      for (let i = 0; i < 160; i++) {
        const s = String((Math.random() * 1e9) | 0);
        const g = MapGen.generate(s, undefined, true);   // the name alone (MapGen.generate's peek)
        if (g.landform === wantLf && (!tut || g.variant === 'classic')) { seed = s; break; }
      }
      if (!seed) seed = String((Math.random() * 1e9) | 0);   // the roll stands anyway
    }
    p.size = size;   // what G.newGame founds with (and the save records)
    this._demo = false;
    G.freeVis = false;
    // your people's tunic is rolled at random; red stays the rival tribe's colour
    const pool = (Sprites.villagerTunics || ['blue']).filter(t => t !== 'red');
    const tunic = pool[(Math.random() * pool.length) | 0];
    /* THE TERRAIN BAKE WAITS FOR THE DRAFT (R.deferBake). It is the single
       biggest piece of founding a run, and the draft screen that comes next
       is one the player READS — so the bake is marked due here and paid on
       the first frame drawn behind the cards, instead of in front of a
       player staring at the screen they just left. R.draw pays it before it
       touches the cache, so it can never be skipped. */
    R.deferBake = true;
    try { G.newGame(seed, p.mode, p.size, undefined, tunic); }   // the rival chief is always a fresh roll
    finally { R.deferBake = false; }
    // …and waits for the art before it bakes, so the world behind the cards
    // is composed with everything (enterGame finishes it if the player is quicker)
    R.holdBake = !(window.Assets && Assets.artReady && Assets.artReady());
    if (R.holdBake) this.waitForArt(this.GAME_ART_FLOOR_MS).then(() => { R.holdBake = false; });
    Backend.markActiveSlot(null);          // fresh run: no cloud slot until first save
    Backend.activeName = null;
    this.lastSavedDay = 1;
    this.show('draft');                    // ORIGIN CARDS: pick before the world moves
  },

  /* REPLAY — the endgame's second chance (operator direction): the SAME
     world, the SAME kept card, no new choices anywhere. The finished run's
     state is still standing behind the end screen, so the seed, mode, size
     and tunic are read straight off it; re-founding with the same seed
     deals the same hand (the deal rides the seeded stream), and the
     recorded pick (S.draft.pickI) is re-kept off-screen — no draft, no
     burn theater. The card floats over the opening world for five seconds
     as a reminder of what the tribe carries; a tap waves it away early.
     A player who wants a FRESH world goes Menu → New Game. */
  replayRun() {
    const ok = window.S && S.seed != null && CFG.SIZES[S.sizeKey];
    if (!ok) { this.backTo = 'title'; this.show('newgame'); return; }   // nothing to replay
    const r = {
      seed: S.seed, mode: S.mode, size: S.sizeKey,
      tunic: S.tunic && S.tunic.P,
      pickI: (S.draft && S.draft.pickI) | 0,
    };
    this._demo = false;
    G.freeVis = false;
    CFG.W = CFG.H = CFG.SIZES[r.size];
    // the bake defers exactly as foundRun's does; with no draft screen to
    // hide behind, R.draw pays it on the first game frame instead
    R.deferBake = true;
    try { G.newGame(r.seed, r.mode, r.size, undefined, r.tunic); }   // the rival chief re-rolls; the world does not
    finally { R.deferBake = false; }
    Backend.markActiveSlot(null);
    Backend.activeName = null;
    this.lastSavedDay = 1;
    let kept = null;
    const D = S.draft;
    if (D && D.hand && D.hand.length)
      kept = Cards.pick(Math.max(0, Math.min(D.hand.length - 1, r.pickI)));
    this.enterGame();
    if (window.Cards) Cards.announceRival();
    // deliberately NO Tutorial.maybeStart: a replay is never a first game —
    // and so it spends none of the two teaching games (noteGameFounded)
    if (kept) this._replayCardNote(kept);
  },

  /* ================= THE FIRST TWO GAMES TEACH THEMSELVES =================
     (tests/tutorial.mjs, the retention pass) The tutorial ran THREE times in
     the first 191 real games: an opt-in checkbox on a screen a new player is
     already reading past. It is on by default for a player's first two games
     now and off from the third, on a LOCAL count of games founded (the two
     founding sites below — keeping a card, and Replay). The checkbox stays
     and still wins: an explicit choice ('1'/'0' in neo-tutorial-ask) is
     honoured whatever the count says, and a two-tap Skip mid-lesson RECORDS
     the opt-out (Tutorial.skip), so game two never re-arms a lesson the
     player has already refused. A returning player with any local trace of
     earlier play (a finished-run ledger, a bound slot, a crash snapshot, the
     draft help dismissed) is seeded as a veteran — the first launch after
     this ships must not teach the people who taught us. */
  TUT_AUTO_GAMES: 2,
  /* THE MEMORY HAS A FALLBACK (from the adversarial review): every read here
     used to swallow a storage that THROWS (iOS "Block All Cookies", Firefox
     with storage off, a partitioned iframe) and fall through to the auto-on
     default — and every WRITE was swallowed too, so the toggle could not
     turn it off, the count never stepped, and the Calm modal came back every
     game: on, forever, with no way out. With storage unavailable the keys
     live in a per-session map instead: the promise holds for the session
     (two games, the modal once, a toggle that answers) and nothing is
     permanent because nothing was ever remembered. */
  _mem: {},
  lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(this._mem, k) ? this._mem[k] : null; } },
  lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { this._mem[k] = v; } },
  lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} delete this._mem[k]; },
  gamesFounded() {
    const raw = this.lsGet('neo-games');
    if (raw != null) return +raw || 0;
    // first read ever: seed from the evidence, then remember the seed
    const veteran = !!(this.lsGet('neo-finished-seeds') || this.lsGet('neo-active-slot') ||
      this.lsGet('neo-emergency') || this.lsGet('neo-draft-help'));
    const n = veteran ? this.TUT_AUTO_GAMES : 0;
    this.lsSet('neo-games', String(n));
    return n;
  },
  /* the count is of TEACHABLE foundings — keeping a card. A Replay never
     arms the teacher (a replay is never a first game), so it must not spend
     one of the two: a new player who loses game one early and taps Replay
     would otherwise reach their next New Game with both slots gone. */
  noteGameFounded() {
    const n = this.gamesFounded() + 1;
    this.lsSet('neo-games', String(n));
    return n;
  },
  // the ONE read of "does this run get the teacher": the explicit switch, else the count
  tutorialWanted() {
    const v = this.lsGet('neo-tutorial-ask');
    if (v === '1') return true;
    if (v === '0') return false;
    return this.gamesFounded() < this.TUT_AUTO_GAMES;
  },
  tutorialExplicit() { return this.lsGet('neo-tutorial-ask') === '1'; },
  // the world foundRun forces for a lesson: the only one the lesson promises
  teachableWorld() {
    return !!(window.S && S.map && S.map.landform === 'valley' && S.map.variant === 'classic' && S.sizeKey === 'medium');
  },
  // found the run again under the tutorial's rule, the startNewGame way:
  // say so first, do the work after the next paint, swallow a second press
  refoundForLesson() {
    if (this._founding) return;
    this._founding = true;
    const b = this.el('btnTutToggle');
    if (b) b.classList.add('busy');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { this.foundRun(); }
      finally { this._founding = false; if (b) b.classList.remove('busy'); }
    }));
  },

  /* ================= TWO ROADS TO VICTORY (the Calm modal) =================
     (tests/tutorial.mjs) Nobody has ever won by the Wonder — 0 of every Calm
     game logged — and the tutorial's one line about it arrives fifteen steps
     in, on a run that opted in. So the FIRST Calm game opens on a short
     modal: the rival's hall on one side, this run's own monument on the
     other, the price under it, and where the button is. Once per device
     (neo-victory-seen, stamped when it is SHOWN, so a pause or a reload
     never re-deals it), only where the mode actually offers the Wonder
     (UI.wonderOffered — the same gate the build menu asks), dismissed by
     its button, the backdrop or Escape. The tutorial holds its notes while
     it is up (Screens.modalUp), so the two never stack. */
  victoryPathsDue() {
    if (!window.S || this._demo || S.over) return false;
    // bare UI, NEVER window.UI — UI is a script-level const and window.UI is
    // undefined, so that guard silently answers "no modal" forever (the
    // window.G trap; the contract's Calm check is what caught it)
    if (typeof UI === 'undefined' || !UI.wonderOffered || !UI.wonderOffered()) return false;
    if (this.lsGet('neo-victory-seen')) return false;
    return true;
  },
  /* _modalUp is a flag, not a DOM query: G.frame reads it every frame to
     slow the world while the modal has the floor (the tutorial's own ×0.2,
     Tutorial.SLOW — a first-time player reading two paragraphs on day one
     should not hand the rival a day and a half for free) */
  _modalUp: false,
  // …and so does the in-game deck while its sheet, aim or flight is up
  // (js/deckui.js) — a lesson note under a card is two things to read at once
  modalUp() {
    return (this._modalUp && !!document.getElementById('victoryModal')) ||
      !!(window.DeckUI && DeckUI.hasFloor());
  },
  hideVictoryPaths() {
    const el = document.getElementById('victoryModal');
    if (el) el.remove();
    this._modalUp = false;
    if (this._vpKey) { document.removeEventListener('keydown', this._vpKey); this._vpKey = null; }
  },
  showVictoryPaths() {
    this.hideVictoryPaths();
    this.lsSet('neo-victory-seen', '1');
    this._modalUp = true;
    const d = CFG.BUILDINGS.wonder, lv = (d.levels || [])[0] || {}, cost = lv.cost || {};
    const price = Bld.costStr ? Bld.costStr(cost) : '';
    const el = document.createElement('div');
    el.id = 'victoryModal';
    el.innerHTML =
      '<div class="vpCard">' +
        '<h3>Two roads to victory</h3>' +
        '<div class="vpRoads">' +
          '<div class="vpRoad"><canvas class="vpArt" data-art="hall"></canvas>' +
            '<b>Raze their hall</b>' +
            '<p>Find the rival tribe and bring down their <b>Town Center</b>.' +
            (S.peace ? ' They keep the peace until you strike first.' : '') + '</p></div>' +
          '<div class="vpRoad"><canvas class="vpArt" data-art="wonder"></canvas>' +
            // "Raise the The Sun Obelisk": half the monuments carry their own article
            '<b>Raise ' + (/^the\b/i.test(d.name || '') ? '' : 'the ') + (d.name || 'Ancient Wonder') + '</b>' +
            '<p>Build it — <span class="vpPrice">' + price + '</span>, ' + (lv.time || 45) + ' days of work — and win without a war. ' +
            'It waits at the <b>end of your Build menu</b>. The rival is racing for their own.</p></div>' +
        '</div>' +
        '<button class="abtn big gold" id="vpGotIt">Got it</button>' +
      '</div>';
    document.body.appendChild(el);
    // the two pictures are the game's own art: the rival's red hall and
    // THIS run's monument — the same drawables the build menu paints
    const paint = (cv, spr) => {
      if (!spr) return;
      cv.width = 96; cv.height = 96;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = !!spr._cfArt;
      const s = Math.min(96 / spr.width, 96 / spr.height), w = spr.width * s, h = spr.height * s;
      g.drawImage(spr, (96 - w) / 2, 96 - h, w, h);
    };
    const hallFam = (Sprites.buildingA && Sprites.buildingA.tc) || Sprites.building.tc || [];
    paint(el.querySelector('[data-art="hall"]'), hallFam[Math.min(hallFam.length, 2) - 1] || hallFam[0]);
    paint(el.querySelector('[data-art="wonder"]'), (Sprites.building.wonder || [])[0]);
    const done = () => this.hideVictoryPaths();
    el.querySelector('#vpGotIt').addEventListener('click', done);
    el.addEventListener('click', e => { if (e.target === el) done(); });
    this._vpKey = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', this._vpKey);
    if (typeof UI !== 'undefined' && UI.cue) UI.cue('ok');
    return el;
  },

  // the kept origin, standing face-up over the opening world for a beat
  _replayCardNote(c) {
    const d = Cards.DEFS[c.key];
    if (!d) return;
    const old = this.el('replayCardNote');
    if (old) old.remove();
    const w = document.createElement('div');
    w.id = 'replayCardNote';
    w.innerHTML =
      `<div class="ocard dealt flip">${this.originCardHTML(d, c)}</div>
       <div class="rcnTip">Your origin, kept from last time &#8212; tap to dismiss</div>`;
    let dropped = false;
    const drop = () => {
      if (dropped) return;
      dropped = true;
      w.classList.add('fade');
      setTimeout(() => w.remove(), 500);
    };
    w.addEventListener('click', drop);
    setTimeout(drop, 5000);
    document.body.appendChild(w);
    this.dealOrigin(w.querySelector('.ocard'), c.key);
  },
  /* one origin card's markup — the draft's and the replay note's alike.
     CardFace dresses it once it is in the page (it needs its own size). */
  originCardHTML(d, c) {
    return `<div class="ocardIn">
         <div class="oface oback">&#10050;</div>
         <div class="oface ofront"><canvas width="128" height="128"></canvas>
           <div class="oname"><span>${this.esc(d.name)}</span></div>
           <div class="otext"><div class="oboon">${this.esc(d.text(c.roll))}</div>
             <div class="oflavor">${this.esc(d.flavor)}</div></div></div>
       </div>`;
  },
  // a card in the page: ask for its picture, dress its faces, keep them fitted
  dealOrigin(el, key, sz) {
    if (!el) return;
    const d = Cards.DEFS[key];
    el._cfKey = key;
    if (window.Assets && Assets.wantOrigins && d) Assets.wantOrigins([d.motif]);
    if (window.CardFace) { CardFace.dressOrigin(el, sz); CardFace.watch(el); CardFace.refitWhenFontsLand(); }
    if (!el._cfW) Cards.drawMotif(el.querySelector('canvas'), key);   // the frame stood down: the wood face
  },

  /* ---------------- ORIGIN CARDS: the draft ----------------
     Three face-down cards deal in, flip staggered, tap to lift, tap again
     to keep. The chosen card steps forward, the rest burn away; the rival's
     card is revealed per difficulty (full / name / face-down). */
  // what world did we draw? "Highlands · Karst" — generated maps carry
  // worldName; saves from before variants carry only the landform, and the
  // title's demo world shows nothing
  worldLabel() {
    const m = window.S && S.map;
    if (!m || this._demo) return '';
    // MapGen is a script-level const — `window.MapGen` is undefined, the
    // same trap G, AI and Sprites carry; reference it directly
    return m.worldName || MapGen.worldName(m.landform) || '';
  },

  onDraft() {
    const D = window.S && S.draft;
    if (!D || D.done || !D.hand.length) { this.enterGame(); return; }   // nothing to draft
    this.el('btnDraftBack').style.display = '';    // the keep-tap hides it
    // NAME THE WORLD — the draft is the arrival moment, the rolled country
    // visible behind the cards. Without the name the variety is invisible.
    const wn = this.worldLabel();
    this.el('draftWorld').textContent = wn ? '🗺 ' + wn : '';
    /* A RESUMED DRAFT DOES NOT RE-DEAL. Backing out to the trial screen and
       returning keeps the same hand (startNewGame's resume) — but replaying
       the deal-and-flip theater made it LOOK like a fresh deal, which is
       precisely the impression "backing out is never a reroll" exists to
       kill. The choreography plays once per run; a return finds the cards
       already standing face-up. */
    const replay = this._dealtFor === S.seed;
    const box = this.el('draftCards');
    box.innerHTML = '';
    this.el('draftHint').textContent = 'Tap a card to look it over';
    this._draftSel = -1;
    // the three pictures are asked for together, before any card is dressed
    if (window.Assets && Assets.wantOrigins) Assets.wantOrigins(D.hand.map(c => Cards.DEFS[c.key].motif));
    // all three go into the row FIRST, then one read of the size they share
    // (read with one card in, the row had not yet squeezed them to fit — the
    // first card was dressed at the wrong size and then dressed again)
    const els = D.hand.map((c, i) => {
      const el = document.createElement('div');
      el.className = 'ocard';
      el.innerHTML = this.originCardHTML(Cards.DEFS[c.key], c);
      el.addEventListener('click', () => this.draftTap(i, el));
      box.appendChild(el);
      return el;
    });
    const sz = els[0] && els[0].offsetWidth ? { w: els[0].offsetWidth, h: els[0].offsetHeight } : null;
    D.hand.forEach((c, i) => {
      const el = els[i];
      this.dealOrigin(el, c.key, sz);
      if (replay) { el.classList.add('dealt', 'flip'); return; }
      setTimeout(() => el.classList.add('dealt'), 60 + i * 130);        // deal in…
      setTimeout(() => el.classList.add('flip'), 560 + i * 150);        // …then flip
    });
    this._dealtFor = S.seed;
    // the fire's noise, built while the cards deal (the keep-tap pays nothing)
    if (!this._fireTex) setTimeout(() => { try { this.fireTex(); } catch (e) {} }, 900);
    let seen = false;
    try { seen = !!localStorage.getItem('neo-draft-help'); } catch (e) {}
    this.el('draftOverlay').style.display = seen ? 'none' : 'flex';
    this.syncTutToggle();
    /* SETTINGS CAN TICK THE LESSON ON TOO (js/settings.js). A pending draft on
       a world the lesson cannot teach is founded again here — the draft
       toggle's own rule (audit MAP-V01) — so the lesson is never armed on an
       archipelago. The flag is set by that one toggle alone, so no other road
       into the draft changes. */
    if (this._lessonRefound) {
      this._lessonRefound = false;
      if (this.tutorialWanted() && !this.teachableWorld()) this.refoundForLesson();
    }
  },

  // the Tutorial choice remembers itself across runs. The button carries its
  // own checkmark span (.tik) — state is the .sel class, never rewritten text
  syncTutToggle() {
    const b = this.el('btnTutToggle');
    if (!b) return;
    b.classList.toggle('sel', this.tutorialWanted());   // the EFFECTIVE state: auto-on shows as on
  },

  draftTap(i, el) {
    const D = window.S && S.draft;
    if (!D || D.done || !el.classList.contains('flip')) return;
    if (this._draftSel !== i) {                    // first tap: lift and consider
      this._draftSel = i;
      for (const o of this.el('draftCards').children) o.classList.remove('lift');
      el.classList.add('lift');
      this.el('draftHint').textContent =
        'Tap again to keep ' + Cards.DEFS[D.hand[i].key].name;
      return;
    }
    /* SECOND TAP: kept — AND THE GAME BEGINS. There is no Begin button and
       no rival panel: keeping a card is the decision, so asking for a third
       tap to confirm a confirmation was a toll on every single run. The
       burn plays for a beat so the choice still lands, then the world
       opens. THE TUTORIAL'S ONE ENTRY POINT lives here now (it was on the
       old Begin): a loaded save and the pause screen's Resume also pass
       through enterGame and must never arm one. */
    Cards.pick(i);
    /* THE KEEP SEALS THE DOOR. The pick is applied and the run is committed
       — the burn is the transition INTO the game, not a screen the player
       is still on. The back button disappears the same instant, or a
       mid-burn tap on it would strand a committed run outside the game
       (and startNewGame's resume only knows un-kept drafts). */
    this.el('btnDraftBack').style.display = 'none';
    const kids = Array.from(this.el('draftCards').children);
    kids.forEach((o, j) => {
      o.classList.remove('lift');
      if (j === i) { o.classList.add('chosen'); return; }
      o.classList.add('burn');
      this._burnCard(o, j);                         // real pixel fire eats it away
    });
    this.el('draftHint').textContent = '';
    /* the timer knows WHICH run it belongs to: the seed is captured at arm
       time and re-checked at fire time, so a timer from an abandoned world
       can never walk the player into a different one (the screen-name guard
       alone stopped matching reality the day the draft could be left) */
    const runSeed = S.seed;
    setTimeout(() => {
      if (!window.S || S.seed !== runSeed || this.current !== 'draft') return;
      this._demo = false;
      /* THE TEACHER IS ARMED BEFORE THE RUN IS LOGGED: enterGame → _enterNow
         writes the run_start row with `tutorial: !!(S.tut && S.tut.on)`, and
         maybeStart used to run AFTER it — so the row said "no tutorial" for
         every lesson that ever ran (the board's "3 in 191" was the count of
         cold-cache runs where the art plaque happened to delay the log).
         And the games-founded count steps AFTER the arming read, so game
         two reads 1, not 2. A PINNED run (a shared ?seed= link that beat an
         auto want, foundRun) arms nothing and spends nothing. */
      if (!this._pinnedRun) {
        if (window.Tutorial) Tutorial.maybeStart();
        this.noteGameFounded();
      }
      this._pinnedRun = false;
      /* the Calm modal is DUE here but SHOWN by _enterNow, once the playing
         screen is actually up: on a cold cache enterGame parks behind the
         art plaque for seconds, and a modal appended under the shell then
         was stamped seen, its Escape live, and invisible */
      this._victoryPathsPending = this.victoryPathsDue();
      this.enterGame();
      // the rival's origin is a NOTIFICATION now, difficulty-gated, and it
      // has to land in-game: toasts are hidden on every shell screen
      if (window.Cards) Cards.announceRival();
    }, this.DRAFT_BURN_MS);
  },
  /* the world opens once the fire has eaten the cards and is guttering —
     the burn (BURN.ms) crosses a card in a second, and the run walks in on
     its last flames rather than cutting it off a third of the way up */
  DRAFT_BURN_MS: 1150,

  /* AN UNCHOSEN CARD BURNS UP (operator: "increase pixel count and frames for
     the flame animations to really sell the idea of the cards burning up").
     It used to be a 46x62 fire buffer blown up to the card — fire cells
     nearly three CSS pixels square — climbing a straight line. Now:

     - THE FIRE IS FINE-GRAINED: one cell is two device pixels on a 2x/3x
       screen and one on a 1x (`cell`), roughly sixty times the cells, so the
       flames read as flames rather than blocks. Still pixel fire, hard-edged
       and nearest-neighbour; never smeared.
     - IT BURNS FROM A POINT: the card catches at one spot on its foot and the
       front spreads up it as a ragged curve (a seeded jag plus a flicker),
       the card's own body clipped away under the front (clip-path polygon),
       so it is the CARD that burns, not a wipe.
     - THE PAPER CHARS BEFORE IT GOES: a scorch band rides just above the
       front, brown to black, with the front itself a white-hot line — the
       fire's source row — and flames licking up over what is left.
     - IT THROWS EMBERS, ASH AND SMOKE: sparks that rise and wink out, flakes
       of ash that tumble up on the heat and drift with the wind (outward from
       the centre), and thin smoke over the flame tips.
     - EVERY FRAME IS A FRAME: the flames are noise scrolling up through a
       shape that hugs the front, drawn fresh on every animation frame on the
       clock — full height however fast the front climbs, as smooth at 120Hz
       as at 60, and the same burn on a slow phone as a fast one.

     The card MUST go whatever the fire does: a failsafe collapses it if the
     canvas cannot be had or the frames never come, and leaving the draft
     tears the fire down at once. A player who asks for reduced motion sees
     the card simply fade. */
  BURN: { ms: 1000, die: 450 },
  /* THE FIRE'S NOISE: one 256x256 tile of two-octave value noise, wrapping
     at its edges, built once per session (onDraft builds it while the cards
     deal, so the keep-tap pays nothing) and shared by every burning card. */
  _fireTex: null,
  fireTex() {
    if (this._fireTex) return this._fireTex;
    const N = 256, T = new Uint8Array(N * N);
    let sd = 0x2545f491;
    const r = () => { sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; return (sd >>> 0) / 4294967296; };
    const oct = L => {
      const gr = new Float32Array(L * L);
      for (let i = 0; i < gr.length; i++) gr[i] = r();
      return (x, y) => {
        const fx = x * L / N, fy = y * L / N, xi = fx | 0, yi = fy | 0, xf = fx - xi, yf = fy - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), x1 = (xi + 1) % L, y1 = (yi + 1) % L;
        const a = gr[yi * L + xi], b = gr[yi * L + x1], c = gr[y1 * L + xi], d = gr[y1 * L + x1];
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      };
    };
    const o1 = oct(16), o2 = oct(32);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) T[y * N + x] = (o1(x, y) * 0.64 + o2(x, y) * 0.36) * 255;
    return (this._fireTex = T);
  },
  _burnCard(card, idx) {
    const box = this.el('draftCards'), B = this.BURN;
    const failsafe = setTimeout(() => card.classList.add('gone'), B.ms + B.die + 400);
    const W = card.offsetWidth, H = card.offsetHeight;
    if (!W || !H) { clearTimeout(failsafe); card.classList.add('gone'); return; }   // not laid out — just drop it
    let reduce = false;
    try { reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    if (reduce) {
      card.style.transition = 'opacity .35s ease'; card.style.opacity = '0';
      setTimeout(() => { clearTimeout(failsafe); card.classList.add('gone'); }, 380);
      return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cell = Math.max(1, Math.round(dpr * 0.75)), cs = cell / dpr;   // a fire cell: device px / CSS px
    const HR = Math.round(H * 0.62), MX = Math.round(W * 0.14);            // headroom above, margin either side
    const GW = Math.ceil((W + 2 * MX) / cs), GH = Math.ceil((H + HR) / cs);
    const ry0 = HR / cs;                                                    // the card's top, in cells
    // the canvas can fail on a memory-tight phone: skip the fire, keep the failsafe
    let cvs, g, img, px;
    try {
      cvs = document.createElement('canvas');
      cvs.width = GW; cvs.height = GH;
      cvs.className = 'burnfx';
      cvs.style.cssText = `position:absolute;left:${card.offsetLeft - MX}px;top:${card.offsetTop - HR}px;` +
        `width:${(GW * cs).toFixed(2)}px;height:${(GH * cs).toFixed(2)}px;z-index:2;pointer-events:none;image-rendering:pixelated;`;
      g = cvs.getContext('2d');
      if (!g) throw new Error('no 2d context');
      img = g.createImageData(GW, GH);
      px = new Uint32Array(img.data.buffer);
      box.appendChild(cvs);
    } catch (e) {
      if (cvs) cvs.remove();
      return;   // the failsafe still collapses the card a beat later
    }
    cvs._cfCell = cell;   // read by the contract: the fire's grain, in device pixels
    // a seeded stream per card, so the two never burn alike
    let sd = (0x9e3779b9 ^ Math.imul(idx + 1, 0x85ebca6b)) >>> 0;
    const rnd = () => { sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; return (sd >>> 0) / 4294967296; };
    const wind = card.offsetLeft + W / 2 < box.offsetWidth / 2 ? -1 : 1;   // smoke and ash blow outward
    const MAXH = 64;
    const le = new DataView(new ArrayBuffer(4));
    le.setUint32(0, 0x01020304, true);
    const LE = new Uint32Array(le.buffer)[0] === 0x01020304;
    const rgba = (r, gg, b, a) => LE ? ((a << 24) | (b << 16) | (gg << 8) | r) >>> 0 : ((r << 24) | (gg << 16) | (b << 8) | a) >>> 0;
    // the fire's ramp: smoke-red at its cool edge, through orange, to a
    // white-yellow core — hard steps, the pixel art's own way of shading
    const PAL = new Uint32Array(MAXH + 1);
    for (let h = 0; h <= MAXH; h++) {
      const t = h / MAXH;
      let r, gg, b, a;
      if (t < 0.06) { r = gg = b = a = 0; }
      else if (t < 0.2) { r = 96; gg = 20; b = 10; a = 150; }
      else if (t < 0.34) { r = 168; gg = 34; b = 12; a = 235; }
      else if (t < 0.48) { r = 222; gg = 70; b = 14; a = 255; }
      else if (t < 0.62) { r = 248; gg = 122; b = 22; a = 255; }
      else if (t < 0.76) { r = 255; gg = 176; b = 44; a = 255; }
      else if (t < 0.9) { r = 255; gg = 220; b = 98; a = 255; }
      else { r = 255; gg = 246; b = 196; a = 255; }
      PAL[h] = rgba(r, gg, b, a);
    }
    // sparks (hot to dying red), ash (glowing grey to faint), smoke — by life
    const EMB = [], ASH = [], SMK = [];
    for (let k = 0; k < 8; k++) {
      const lf = (k + 0.5) / 8;
      EMB.push(lf > 0.5 ? rgba(255, (200 + lf * 50) | 0, (90 + lf * 120) | 0, 255) : rgba(255, (90 + lf * 160) | 0, 30, Math.min(255, lf * 2 * 255) | 0));
      ASH.push(rgba((44 + lf * 30) | 0, (38 + lf * 26) | 0, (34 + lf * 22) | 0, (lf * 0.9 * 255) | 0));
      SMK.push(rgba(52, 46, 42, (lf * 0.18 * 255) | 0));
    }
    // the char: deep brown at the band's top to black at the front
    const CHAR = [], CN = 12;
    for (let k = 0; k <= CN; k++) {
      const u = k / CN;   // 0 = top of the band, 1 = the front
      CHAR.push(rgba((60 - u * 50) | 0, (34 - u * 30) | 0, (16 - u * 14) | 0, Math.min(255, (u * u * 0.9 + u * 0.25) * 255) | 0));
    }
    // the flames are noise scrolling UP through a shape that hugs the front,
    // drawn fresh every frame — so they stand at full height whatever speed
    // the front climbs at. The noise is ONE tiling texture (fireTex), built
    // once while the cards were being dealt: two reads a pixel, no maths.
    const TEX = this.fireTex(), ox = (rnd() * 256) | 0, oy = (rnd() * 256) | 0;
    const vn = (x, y) => TEX[(((y * 1.6) | 0) & 255) * 256 + (((x * 1.6 + ox) | 0) & 255)] / 255;   // a slow 1-D-ish read for tongue heights
    // THE FRONT: where the card is still standing, per column of the card
    const x0 = 0.25 + rnd() * 0.5;                        // where it catches, along the foot
    const JN = 48, jag = new Float32Array(JN + 1);        // a seeded ragged edge, smoothed
    let wv = 0;
    for (let k = 0; k <= JN; k++) { wv = wv * 0.62 + (rnd() - 0.5); jag[k] = wv; }
    const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
    const burnt = u => Math.pow(u, 1.4) * 1.5;            // catches slowly, then races (and burns through)
    const frontAt = (xf, u, tS) => {                      // card-space y of the front at fraction xf
      const k = xf * JN, j = jag[Math.min(JN, k | 0)] * (1 - (k % 1)) + jag[Math.min(JN, (k | 0) + 1)] * (k % 1);
      const lag = 0.62 * (xf - x0) * (xf - x0);           // the edges lag the point it caught at
      const ripple = 0.012 * Math.sin(xf * 19 + tS * 11 + ph1) + 0.008 * Math.sin(xf * 41 - tS * 17 + ph2);
      return H * (1 - burnt(u) + lag + j * 0.07 + ripple);
    };
    const CLIPN = 28, burntAt = new Float32Array(GW).fill(-1);
    const FL = H * 0.36;                                   // a tongue's full height, CSS px
    const parts = [];
    const t0 = performance.now();
    let last = t0, frames = 0, cellsLit = 0, collapsed = false;
    const spawn = (kind, x, y) => {
      if (parts.length > 340) return;
      const e = kind === 'ember', a = kind === 'ash';
      parts.push({ kind, x, y,
        vx: wind * (e ? 10 + rnd() * 26 : a ? 12 + rnd() * 30 : 6 + rnd() * 10) + (rnd() - 0.5) * (e ? 34 : 16),
        vy: -(e ? 50 + rnd() * 80 : a ? 24 + rnd() * 36 : 16 + rnd() * 16),
        age: 0, life: e ? 0.35 + rnd() * 0.6 : a ? 0.8 + rnd() * 0.7 : 0.7 + rnd() * 0.5,
        sz: kind === 'smoke' ? 3 + ((rnd() * 4) | 0) : a ? 1 + ((rnd() * 2) | 0) : 1, spin: rnd() * 6.28 });
    };
    let pY0 = 0, pY1 = 0;                                 // the rows the last frame drew
    const draw = (u, el) => {
      const tS = el / 1000, rise = tS * 150;              // the flames' features climb 150 CSS px a second
      if (pY1 > pY0) px.fill(0, pY0 * GW, pY1 * GW);
      let y0 = GH, y1 = 0;
      const band = Math.max(4, H * 0.075) / cs, drift = wind * tS * 24;
      let lit = 0;
      for (let gx = 0; gx < GW; gx++) {
        const X = gx * cs - MX;                           // card-space x
        if (X < -2 || X >= W + 2) continue;
        const xf = Math.max(0, Math.min(1, X / W));
        let fy = frontAt(xf, u, tS), k = 1;
        if (fy >= H) continue;                            // not caught here yet
        if (fy <= 0) {                                    // burnt through: the last flames lift off and gutter
          if (burntAt[gx] < 0) burntAt[gx] = el;
          const age = el - burntAt[gx];
          k = 1 - age / B.die;
          if (k <= 0) continue;
          fy = -(age / 1000) * FL * 0.8;
        }
        // the char band, then the burning edge, then the tongues over both
        const gyF = ry0 + fy / cs;
        if (k === 1) {
          const ya = Math.max(Math.ceil(ry0), Math.floor(gyF - band)), yb = Math.min(GH, Math.ceil(gyF));
          for (let y = ya; y < yb; y++) px[y * GW + gx] = CHAR[Math.max(0, Math.min(CN, Math.round(((y - (gyF - band)) / band) * CN)))];
          if (ya < y0) y0 = ya;
          if (yb > y1) y1 = yb;
        }
        const colH = FL * k * (0.55 + 0.75 * vn(X / 16 + 31, tS * 1.7));   // each tongue its own height, breathing
        const gy0 = Math.max(0, Math.floor(ry0 + (fy - colH * 1.45) / cs)), gy1 = Math.min(GH - 1, Math.round(gyF) + 1);
        const tx1 = ((X * 2 + ox) | 0) & 255, tx2 = ((X * 2 + 97 + drift) | 0) & 255, inv = 1 / colH;
        for (let gy = gy0; gy <= gy1; gy++) {
          const Y = gy * cs - HR, d = (fy - Y) * inv;
          const n = (TEX[((((Y + rise) * 1.25 + oy) | 0) & 255) * 256 + tx1] * 0.6 +
                     TEX[((((Y + rise * 1.35) * 1.25 + 53) | 0) & 255) * 256 + tx2] * 0.4) * (1 / 255);
          let h = (1 - d) * 1.12 + (n - 0.5) * 1.35 - 0.06;
          if (k === 1) { if (d < 0.06) h += 0.35; }       // the burning edge itself, white-hot
          else if (d < 0.34) h -= (0.34 - d) * 3.2 * Math.min(1, 0.4 + (1 - k) * 2);   // a lifting flame burns away from its foot
          if (h <= 0.06) continue;
          px[gy * GW + gx] = PAL[h >= 1 ? MAXH : (h * MAXH) | 0];
          lit++;
          if (gy < y0) y0 = gy;
          if (gy >= y1) y1 = gy + 1;
        }
      }
      cellsLit = lit;
      // embers, ash and smoke go into the same buffer, cell for cell — no
      // per-spark canvas calls (a colour string parsed per spark per frame
      // cost more than the whole fire)
      for (const p of parts) {
        const lf = 1 - p.age / p.life, x = Math.round(p.x / cs), y = Math.round(p.y / cs), b = Math.min(7, (lf * 8) | 0);
        if (x < 0 || x >= GW - 2 || y < 0 || y >= GH - 2) continue;
        const i = y * GW + x;
        if (p.kind === 'ember') {
          px[i] = EMB[b];
          if (p.age < 0.12) px[i + 1] = EMB[b];
        } else if (p.kind === 'ash') {
          const c = p.age < 0.22 ? EMB[Math.max(0, b - 3)] : ASH[b];
          const wide = Math.cos(p.spin + p.age * 9) > 0;
          px[i] = c;
          for (let q = 1; q <= p.sz; q++) px[wide ? i + q : i + q * GW < px.length ? i + q * GW : i] = c;
        } else {
          const r = Math.min(6, (p.sz + (1 - lf) * 5) | 0), c = SMK[b];
          for (let yy = 0; yy < r; yy++) for (let xx = 0; xx < r; xx++) {
            const j = (y - (r >> 1) + yy) * GW + x - (r >> 1) + xx;
            if (j >= 0 && j < px.length && !px[j]) px[j] = c;
          }
        }
        if (y - 4 < y0) y0 = Math.max(0, y - 4);
        if (y + p.sz + 4 > y1) y1 = Math.min(GH, y + p.sz + 4);
      }
      // only the rows that hold fire go up to the canvas (the rest is clear)
      g.clearRect(0, 0, GW, GH);
      if (y1 > y0) g.putImageData(img, 0, 0, 0, y0, GW, y1 - y0);
      pY0 = y0; pY1 = y1;
      // the card's own body, clipped away under the front
      if (!collapsed) {
        let poly = '0px 0px,' + W + 'px 0px';
        for (let q = CLIPN; q >= 0; q--) {
          const xf = q / CLIPN, fy = Math.max(0, Math.min(H, frontAt(xf, u, tS)));
          poly += ',' + (xf * W).toFixed(1) + 'px ' + fy.toFixed(1) + 'px';
        }
        const clip = 'polygon(' + poly + ')';
        card.style.webkitClipPath = clip; card.style.clipPath = clip;
      }
      frames++;
    };
    const tick = now => {
      if (this.current !== 'draft') { clearTimeout(failsafe); cvs.remove(); card.classList.add('gone'); return; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      const el = now - t0, u = Math.min(1, el / B.ms), tS = el / 1000;
      // throw sparks and ash off the burning front, smoke off the flame tips
      if (el < B.ms + 120) {
        const nE = 2 + ((rnd() * 3) | 0), nA = rnd() < 0.7 ? 1 + ((rnd() * 2) | 0) : 0;
        for (let k = 0; k < nE + nA; k++) {
          const xf = rnd(), fy = frontAt(xf, u, tS);
          if (fy <= 0 || fy >= H) continue;
          spawn(k < nE ? 'ember' : 'ash', MX + xf * W, HR + fy - 2 - rnd() * FL * 0.6);
        }
        if (rnd() < 0.55) { const xf = rnd(), fy = frontAt(xf, u, tS); if (fy > 0 && fy < H) spawn('smoke', MX + xf * W, HR + fy - FL * 1.1); }
      }
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'ember') { p.vy += 30 * dt; p.vx += Math.sin(p.spin + p.age * 14) * 40 * dt; }
        else if (p.kind === 'ash') { p.vy += 10 * dt; p.vx += Math.sin(p.spin + p.age * 5) * 22 * dt; p.vx *= 0.995; }
        else { p.vy *= 0.99; }
      }
      draw(u, el);
      // burnt through: collapse the slot as the last flames gutter
      if (!collapsed && el >= B.ms) {
        collapsed = true; clearTimeout(failsafe);
        if (this.current === 'draft') card.classList.add('gone');
      }
      if ((el < B.ms + B.die || parts.length) && el < B.ms + B.die + 900) { requestAnimationFrame(tick); return; }
      cvs.remove();
    };
    // the contract reads the fire's grain and pace
    this._burnStats = () => ({ cell, cs, GW, GH, frames, cellsLit, MAXH });
    requestAnimationFrame(tick);
  },

  /* ---------------- load / save slots ---------------- */
  async onLoad(opts) {
    this.saveMode = !!opts.saveMode;
    this.el('loadTitle').textContent = this.saveMode ? 'Save to a slot' : 'Load game';
    const box = this.el('slotList');
    box.innerHTML = '<p class="hint">Fetching slots…</p>';
    if (!window.Backend || !Backend.isReady()) {
      box.innerHTML = '<p class="hint">Cloud saves are ' +
        (Backend && Backend.configured ? 'connecting…' : 'not configured yet.') +
        ' You can still import a save file below.</p>';
      return;
    }
    const r = await Backend.listSaves();
    if (!r.ok) { box.innerHTML = '<p class="hint">Could not reach the cloud: ' + r.error.message + '</p>'; return; }
    const bySlot = {};
    for (const row of r.data) bySlot[row.slot] = row;
    box.innerHTML = '';
    for (let slot = 1; slot <= 5; slot++) {
      const row = bySlot[slot];
      const card = document.createElement('div');
      card.className = 'scard';
      if (row) {
        const mins = Math.round((row.playtime_seconds || 0) / 60);
        const fin = row.over ? (row.over.win ? ' · 🏆 won' : ' · 💀 lost') : '';
        card.innerHTML =
          `<img class="sthumb" ${row.thumbnail ? 'src="' + row.thumbnail + '"' : ''} alt="">
           <div class="smeta"><b>${this.esc(row.name)}</b>
             <small>Day ${row.day} · ${row.landform || '?'} · ${mins}m${fin}</small></div>
           <div class="sacts"></div>`;
        const acts = card.querySelector('.sacts');
        if (this.saveMode) this.act(acts, '💾 Overwrite', () => this.saveToSlot(slot, row.name));
        else this.act(acts, '▶ Load', async () => {
          const l = await Backend.loadSlot(slot);
          if (l.ok) this.loadRow(l.data); else UI.toast(l.error.message, true);
        });
        this.act(acts, '✏️', async () => {
          const name = prompt('Rename save', row.name);
          if (name != null && name.trim()) { await Backend.renameSlot(slot, name.trim()); this.onLoad({ saveMode: this.saveMode }); }
        });
        this.act(acts, '🗑', async () => {
          if (!card.dataset.confirm) { card.dataset.confirm = '1'; acts.lastChild.textContent = '⚠ sure?'; return; }
          await Backend.deleteSlot(slot);
          if (Backend.activeSlot === slot) Backend.markActiveSlot(null);
          this.onLoad({ saveMode: this.saveMode });
        });
      } else {
        card.innerHTML = `<div class="sthumb empty">·</div>
          <div class="smeta"><b>Empty slot ${slot}</b><small>&nbsp;</small></div><div class="sacts"></div>`;
        if (this.saveMode)
          this.act(card.querySelector('.sacts'), '💾 Save here', () => this.saveToSlot(slot, null));
      }
      box.appendChild(card);
    }
  },

  act(parent, label, fn) {
    const b = document.createElement('button');
    b.className = 'abtn';
    b.textContent = label;
    b.addEventListener('click', fn);
    parent.appendChild(b);
  },

  async saveToSlot(slot, existingName) {
    const name = prompt('Name this save', existingName || Backend.activeName ||
      (window.Backend && Backend.uid ? Backend.villageName(Backend.uid) : 'My Village'));
    if (name == null) return;
    Backend.markActiveSlot(slot);
    Backend.activeName = name.trim() || 'Village';
    const r = await Backend.autosaveNow('manual');
    if (r.ok) {
      this.lastSavedDay = S.day;
      UI.toast('Saved to slot ' + slot);
      this.show(this.backTo === 'paused' ? 'paused' : 'load', { saveMode: this.saveMode });
      if (this.backTo === 'paused') this.show('paused');
    } else UI.toast('Save failed: ' + r.error.message, true);
  },

  /* ---------------- settings ---------------- */
  onSettings() {
    if (window.SettingsPage && SettingsPage.live()) { SettingsPage.onShow(); return; }
    this.renderLog();          // the event log lives on this page now
    const days = String(window.Backend ? Backend.autosaveDays : 2);
    for (const b of this.el('setCadence').querySelectorAll('.abtn'))
      b.classList.toggle('sel', b.dataset.v === days);
    // the audio switches read their LIVE state, so the row tells the truth
    // even when localStorage is unavailable and Sound is keeping the choice
    // in memory for the session (Sound.lsGet's fallback)
    this.paintAudioRows();
    const idBox = this.el('setIdentity');
    idBox.textContent = window.Backend && Backend.uid
      ? 'Your village: ' + Backend.villageName(Backend.uid) : 'cloud saves not connected';
    if (window.Backend && Backend.isReady())
      Backend.getProfile().then(r => {
        if (r.ok && r.data && r.data.chief_name) this.el('chiefInput').value = r.data.chief_name;
      });
  },

  /* ONE writer for both audio rows (the hornBackLine convention), shared by
     the settings render, the speaker and the dial, so the three can never
     drift apart. The speaker shows whether anything will be HEARD, which is
     the switch and the dial together — a speaker reading "on" over a dial at
     zero is a control that lies. A muted row keeps its number on the dial
     (that is the level it will come back at) and says "Off" beside it. */
  paintAudioRows() {
    if (typeof Sound === 'undefined') return;
    for (const [id, bus] of [['setSfx', 'sfx'], ['setMusic', 'music']]) {
      const row = this.el(id); if (!row) continue;
      const on = bus === 'sfx' ? Sound.sfxOn() : Sound.musicOn();
      const v = Sound.vol(bus);
      const spk = row.querySelector('.spk'), sl = row.querySelector('.vol'), pct = row.querySelector('.vpct');
      if (spk) {
        spk.textContent = on ? '\u{1F50A}' : '\u{1F507}';
        spk.classList.toggle('off', !on);
        spk.setAttribute('aria-label', (on ? 'Mute ' : 'Unmute ') + (bus === 'sfx' ? 'sound effects' : 'music'));
      }
      // never write over a finger that is mid-drag — the dial is the input —
      // but the FILL always follows, because the value it draws is the one
      // the drag just set (--p, see .arow .vol in index.html)
      if (sl) {
        if (document.activeElement !== sl) sl.value = String(v);
        sl.style.setProperty('--p', v + '%');
      }
      if (pct) pct.textContent = on ? v + '%' : 'Off';
      row.classList.toggle('muted', !on);
    }
  },

  /* ---------------- pause ---------------- */
  onPaused() {
    this.backTo = 'paused';
    if (window.S) S.paused = true;
    // no world-name line here (operator: the landform label is not always
    // an accurate read of the map, and the wordmark carries the screen)
    const q = this.el('btnQuitTitle');
    q.textContent = 'Menu';
    q.classList.remove('danger');
    const r = this.el('btnResign');
    if (r) { r.textContent = 'Resign'; r.classList.remove('danger'); }
    this._confirmResign = false;
  },

  // the running chronicle — rendered wherever it lives (Settings, now)
  renderLog() {
    const log = this.el('logList');
    if (!log || !window.S || !S.log) return;
    // if the loop caught and recovered from an error, surface its first line at
    // the top of the log so it can be reported (the game kept running past it)
    const errLine = G.lastFrameError
      ? `<div style="color:#e8a04a">⚠️ ${this.esc(String(G.lastFrameError).split('\n')[0]).slice(0, 160)}</div>`
      : '';
    log.innerHTML = errLine + S.log.slice(0, 30).map(l => `<div>Day ${l.day}: ${this.esc(l.msg)}</div>`).join('');
  },

  /* RESIGN — concede the game. It ends the run for good, so it takes a second
     tap to confirm (the same pattern as quitting with unsaved progress), then
     drops straight into the Game Over screen. */
  /* NO WAY BACK — the choice offered when the village can no longer feed
     itself (G.checkDoom). It is already a two-button decision, so Resign here
     goes straight through rather than asking to be tapped twice. */
  onDoomed() {
    const b = this.el('doomBody');
    if (b) b.textContent = 'Your last villager is gone and the granary is empty — ' +
      'no one left to gather, nothing to train a new hand with, and no Trading Post ' +
      'to buy a meal. The Town Center will fall in its own time.';
  },
  /* Resign HERE is not a struck banner: the offer only comes to a village
     that is already lost (G.checkDoom measured it), and its own words say
     the hall "will fall in its own time". Accepting that is the honest
     answer and must never cost what waiting would have earned — so it ends
     the run as the defeat it is ('doomed': logged a loss, never abandoned,
     and a card is judged on the deeds like any defeat), not 'struck_banner'. */
  doomResign() {
    if (!window.S || S.over) return;
    this._confirmResign = false;
    S.resigned = true;
    G.end(false, 'The granary was empty and no one was left to fill it. You let the last fire go out.', 'doomed');
  },
  doomStay() {
    if (window.UI) UI.toast('So be it. The fire burns low.', true);
    this.show('playing');
  },

  resign(force) {
    if (!window.S || S.over) return;
    const r = this.el('btnResign');
    if (!force && !this._confirmResign) {
      this._confirmResign = true;
      if (r) { r.textContent = 'Concede — tap again'; r.classList.add('danger'); }
      return;
    }
    this._confirmResign = false;
    if (r) { r.textContent = 'Resign'; r.classList.remove('danger'); }
    S.resigned = true;
    G.end(false, 'You struck your banner and left the valley.', 'struck_banner');
  },

  quitToTitle() {
    const unsaved = window.S && S.day > this.lastSavedDay && !this._demo;
    if (unsaved && !this._confirmQuit) {
      this._confirmQuit = true;
      const q = this.el('btnQuitTitle');
      q.textContent = 'Unsaved — tap again';
      q.classList.add('danger');
      if (window.Backend) Backend.snapshotLocal(G.saveJSON());   // belt and braces
      return;
    }
    if (window.Backend && Backend.activeSlot) Backend.autosaveNow('quit');
    /* the run is LEFT here as surely as by a closed tab: say so, the same
       provisional ending (G.noteLeaving), superseded if it is ever Continued
       — or a game quit to the menu stays "no signal yet" on the dashboard for
       good, since the demo world that replaces it sends nothing */
    G.noteLeaving();
    this._demo = false;   // force a fresh demo world
    this.show('title');
  },

  /* ---------------- endgame: the arcade tally ---------------- */
  showEnd(win, msg) {
    this.show('endgame', { win, msg });
    // the prize draw (js/competition.js) — delete this line with the file. It
    // draws into the old scenes, so it stands down while the card system's
    // reward screen has the end (ceMode): an entry offered there is invisible
    if (window.Competition && !this.el('scrEndgame').classList.contains('ceMode')) Competition.offer(!!win);
  },
  onEndgame(opts) {
    /* THE CARD SYSTEM's reward screen takes the end when its switch is on
       (js/deckscreens.js); off, it answers false and everything below runs
       exactly as it always has */
    /* …and a fault in it must cost the cards, never the ending: the old
       scenes are drawn instead (a painter stands down rather than throwing) */
    try { if (window.DeckScreens && DeckScreens.takeEnd(opts)) return; }
    catch (e) {
      console.error('card reward screen', e);
      try { DeckScreens._giveBack(); this.el('scrEndgame').classList.remove('ceMode'); } catch (e2) {}
    }
    const def = this.el('defeatScene'), vic = this.el('victoryPane'), scr = this.el('scrEndgame');
    const vs = this.el('victoryScene');
    if (!opts.win) {
      scr.classList.remove('victoryMode');
      if (window.VictoryArt) VictoryArt.stop();
      vs.style.display = 'none';
      // DEFEAT — no score, no tally, no leaderboard. The clan simply fades into
      // the depths of history: a quiet grave in the dark (see js/defeatart.js).
      scr.classList.add('defeatMode');
      vic.style.display = 'none';
      def.style.display = 'flex';   // flex column (see CSS) — centres content vertically in the frame
      this._score = null; this._entry = null; this._submitted = false; this._leaveWarned = false;
      // the scene answers to the difficulty alone now: set that up BEFORE the
      // subtitle, which is difficulty-flavoured (js/defeatart.js)
      if (window.Defeat) Defeat.begin(S.mode);
      // two voices: the headline and the poetic, land-specific subtitle
      this.el('defeatTitleText').textContent = window.Defeat ? Defeat.title() : 'THE FIRE HAS GONE OUT';
      this.el('defeatEpitaph').textContent = window.Defeat ? Defeat.subtitle() : '';
      // the story stats: day survived, time played, difficulty
      this.el('dsDay').textContent = S.day;
      const secs = Math.max(0, Math.round(S.playtime || 0));
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
      this.el('dsTime').textContent = h ? `${h}h ${m}m` : m ? `${m}m` : `${secs}s`;
      this.el('dsDiff').textContent = (G.modeCfg().name || '').toUpperCase();
      // render the pixel icons (stat card + button glyphs)
      if (window.Defeat)
        for (const c of def.querySelectorAll('canvas[data-icon]')) Defeat.drawIcon(c, c.dataset.icon);
      // restart the fade-from-black each time we land here
      def.style.animation = 'none'; void def.offsetWidth; def.style.animation = 'defeatIn 1.6s ease-out both';
      if (window.Defeat) Defeat.start();
      return;
    }
    // VICTORY — "A New Dawn": the celebration scene up front, the arcade tally
    // waiting behind the SCORE button
    if (window.Defeat) Defeat.stop();
    scr.classList.remove('defeatMode');
    scr.classList.add('victoryMode');
    def.style.display = 'none';
    vic.style.display = 'none';
    vs.style.display = 'flex';
    this._score = Score.compute(true);
    /* THE RUN'S ENTRY, TAKEN NOW. A post can outlive this screen (REPLAY
       fires one on the way out and the next world is founded a beat later),
       so the board's row is captured here, not read off S when the network
       finally answers. A card-assisted run is HELD off the board exactly as
       the card system's reward screen holds it (boardHold) — whatever the
       switch says now: the cards were played, and that is a fact of the run. */
    const bh = this.boardHold(true);
    this._entry = bh.hold ? null : { score: this._score.total, mode: S.mode, day: S.day, seed: S.seed, cards_played: bh.played };
    this._submitted = false;
    this._leaveWarned = false;
    this._winMsg = opts.msg || '';
    // the scene answers to the difficulty you conquered alone now (js/victoryart.js)
    if (window.VictoryArt) {
      VictoryArt.begin(S.mode);
      this.el('victoryTitleText').textContent = VictoryArt.title();
      this.el('victoryEpitaph').textContent = VictoryArt.subtitle();
      for (const c of vs.querySelectorAll('canvas[data-vicon]')) VictoryArt.drawIcon(c, c.dataset.vicon);
    }
    // the headline card: difficulty · time · score, with the run's fingerprint below
    this.el('vsDiff').textContent = (G.modeCfg().name || '').toUpperCase();
    const vsecs = Math.max(0, Math.round(S.playtime || 0));
    const vh = Math.floor(vsecs / 3600), vm = Math.floor((vsecs % 3600) / 60);
    this.el('vsTime').textContent = vh ? `${vh}h ${vm}m` : vm ? `${vm}m` : `${vsecs}s`;
    this.el('vsScore').textContent = this._score.total.toLocaleString();
    this.el('vicRank').style.display = 'none';
    this.el('vicMeta').textContent = `Day ${S.day} · seed ${S.seed}`;
    // reset the tally stage behind the Score button
    this.el('endMsg').textContent = this._winMsg;
    this.el('scoreLines').innerHTML = '';
    this.el('scoreMult').textContent = '';
    this.el('scoreTotal').textContent = 'SCORE 0';
    this.el('hsBanner').style.display = 'none';
    this.el('nameRow').style.display = 'none';
    this.el('savedNote').style.display = 'none';
    this.el('savedNote').textContent = '';   // never let a prior run's note linger
    if (bh.hold) this._note(bh.hold, 'var(--dim)');   // the missing name box is never a mystery
    this.el('endBoard').innerHTML = '';
    vs.style.animation = 'none'; void vs.offsetWidth; vs.style.animation = 'defeatIn 1.2s ease-out both';
    if (window.VictoryArt) VictoryArt.start();
    // post the run right away so the GLOBAL RANK banner can land on this screen
    this._offerSubmit();
  },

  // SCORE ⇄ scene: the tally page slides in over the celebration and a plain
  // Back returns to it (the board post is idempotent — no double submits)
  openTally() {
    if (window.VictoryArt) VictoryArt.stop();
    this.el('victoryScene').style.display = 'none';
    this.el('scoreLines').innerHTML = '';
    this.el('scoreMult').textContent = '';
    this.el('victoryPane').style.display = 'flex';
    this._tally(this._score, true);
  },
  closeTally() {
    clearInterval(this._tallyT);
    this.el('victoryPane').style.display = 'none';
    this.el('victoryScene').style.display = 'flex';
    if (window.VictoryArt) VictoryArt.start();
  },

  // the cabinet ritual: lines land one by one while the total ticks up
  _tally(sc, win) {
    clearInterval(this._tallyT);
    const box = this.el('scoreLines'), totalEl = this.el('scoreTotal');
    let i = 0, run = 0;
    totalEl.textContent = 'SCORE 0';
    const step = () => {
      if (this.current !== 'endgame') { clearInterval(this._tallyT); return; }
      if (i < sc.lines.length) {
        const l = sc.lines[i++];
        run += l.pts;
        box.insertAdjacentHTML('beforeend',
          `<div class="srow"><span>${l.icon} ${this.esc(l.label)}</span><span class="dots"></span><b>+${l.pts.toLocaleString()}</b></div>`);
        totalEl.textContent = 'SCORE ' + Math.round(run * sc.mult).toLocaleString();
      } else {
        clearInterval(this._tallyT);
        this.el('scoreMult').textContent =
          `${G.modeCfg().icon} ${G.modeCfg().name} difficulty × ${sc.mult}`;
        totalEl.textContent = 'SCORE ' + sc.total.toLocaleString();
        if (win) this._offerSubmit();
      }
    };
    step();
    this._tallyT = setInterval(step, 150);
  },

  /* EVERY VICTORY GOES ON THE WORLD BOARD. The chief's saved arcade name
     posts the run the moment the scene lands; a first-time winner is asked
     for a name ON THE SCENE — the box used to sit behind the SCORE button,
     and a board wiped on 8 Sep had gained one name in eleven wins by the
     11th: nothing on the celebration screen said a name was wanted, and the
     prize draw's button (10 Sep) then stood above SCORE as the one thing to
     tap. Leaving without a name no longer loses the win either — see
     _postBeforeLeaving.

     The cloud gets a second chance here too: a boot that failed to sign in
     (offline for a moment, or the sign-in rate-limited) used to make this
     return in silence, with no box, no note and no board. Now it reconnects,
     and if that fails it SAYS so, with a Retry. */
  async _offerSubmit() {
    if (this._submitted || !this._entry || this._offering) return;
    if (!window.Backend || !Backend.configured) return;   // no cloud in this build: nothing to promise
    this._offering = true;
    try {
      if (!Backend.isReady()) {
        this._note('Reaching the world board…', 'var(--dim)');
        const r = await Backend.reconnect();
        if (!r.ok || !Backend.isReady()) { this._promptName('The world board is out of reach — tap Retry', '↻ Retry'); return; }
      }
      const inp = this.el('arcadeName');
      const r = await Backend.getProfile().catch(() => ({ ok: false }));
      const saved = r.ok && r.data && r.data.arcade_name;
      if (saved) { if (!inp.value) inp.value = saved; await this.submitScore(saved); }
      else this._promptName('Name your chief to put this score on the board');
    } finally { this._offering = false; }
  },

  /* WHETHER A WIN MAY GO ON THE WORLD BOARD — the ONE rule, asked by the old
     victory scene above and by the card system's reward screen
     (DeckScreens._armBoard) alike. A card-assisted run is MARKED on the
     board (approved at Gate 1), and two wins never go up at all: a TEST
     deck's (?cards=all — every card dealt free is nobody's record), and any
     card-assisted win while the board cannot wear the mark —
     Backend.submitScore sends named parameters only, and until submit_score
     learns p_cards_played (Backend.BOARD_MARKS_CARDS) an assisted score
     would stand UNMARKED beside real players'. Read off S.deck.played, never
     off the switch: a run that played cards and ended with the switch off
     (?cards=0, an older save) was still assisted. → { hold, played }: hold is
     the line the score box says instead of offering a name ('' = post). */
  boardHold(win) {
    const P = typeof S !== 'undefined' && S && S.deck && Array.isArray(S.deck.played) ? S.deck.played : [];
    const played = P.filter(x => x && (!window.Deck || !Deck.card || Deck.card(x.id))).length;
    if (!win || !played) return { hold: '', played };
    const hold = window.Deck && Deck.isTest && Deck.isTest() ? 'Test-deck run — not posted to the world board.'
      : !(window.Backend && Backend.BOARD_MARKS_CARDS) ? 'Not posted to the world board — it cannot wear the card mark yet.' : '';
    return { hold, played };
  },

  // the one line under the name box
  _note(msg, color) {
    const note = this.el('savedNote');
    note.textContent = msg; note.style.color = color || ''; note.style.display = msg ? 'block' : 'none';
  },
  // reveal the name + Save row (prefilled name kept), with a one-line note
  _promptName(msg, label) {
    this.el('nameRow').style.display = 'flex';
    const btn = this.el('btnSubmitScore');
    btn.textContent = label || '💾 Save score'; btn.classList.remove('cant');
    if (msg) this._note(msg, 'var(--dim)');
  },

  /* THE WIN GOES UP EVEN WITHOUT A NAME. REPLAY, MENU or closing the page
     with the box still empty posts the run under the village's stand-in
     name (Score.fallbackName) — never remembered as the chief's name, so the
     next victory asks again. A name typed but never saved is used as typed.
     Fired as the page closes, the post goes keepalive and skips the
     pre-check so the request is on the wire before the page is gone. */
  _postBeforeLeaving(unloading) {
    if (!this._entry || this._submitted || this._posting) return;
    if (!window.Backend || !Backend.isReady()) return;
    const chk = Score.cleanName(this.el('arcadeName').value);
    const name = chk.ok ? chk.name : Score.fallbackName(Backend.uid);
    this.submitScore(name, { remember: chk.ok, fallback: !chk.ok, keepalive: !!unloading, quiet: true });
  },

  /* the end of a run is on screen: the end screen itself, or the board or
     the collection the card system's reward screen opened from it (both of
     which lead back to it) — closing the page from any of them posts the run */
  atEnd() {
    return this.current === 'endgame' || (this.current === 'leaders' && this.backTo === 'endgame') ||
      (this.current === 'cards' && !!window.DeckScreens && DeckScreens._colFrom === 'endgame');
  },
  /* LEAVING THE END SCREEN, by REPLAY or MENU — the old scenes' buttons and
     the card system's reward screen alike. Leaving a victory with the name
     box empty: one warning that says exactly what the second tap does, then
     the win goes up under the stand-in name on the way out (a typed name is
     used as typed, no warning). Closing the page instead fires the same
     post keepalive (the pagehide hook in bind). */
  leaveEnd(go) {
    if (this._entry && !this._submitted && window.Backend && Backend.isReady() && !this._leaveWarned
        && !Score.cleanName(this.el('arcadeName').value).ok) {
      this._leaveWarned = true;
      /* said in the score box's own note line: toasts are hidden on every
         screen but the playing one, so a toast here was a silent first tap */
      const warn = `Name your chief for the board — or tap again to leave and go up as ${Score.fallbackName(Backend.uid)}`;
      this._note(warn, 'var(--warn, #e39a5b)');
      UI.toast(warn, true, 4200);
      return;
    }
    this._postBeforeLeaving(false);
    go();
  },
  // REPLAY, not Play Again (operator direction): "Play Again" rolled a
  // DIFFERENT world, which reads as a broken replay — especially after a
  // loss, when what the player wants is another go at the same one
  endReplay() { this.leaveEnd(() => this.replayRun()); },
  endMenu() { this.leaveEnd(() => { this._demo = false; this.show('title'); }); },

  // auto === the saved name for the automatic post; a manual Save reads the box
  async submitScore(auto, opts) {
    opts = opts || {};
    if (this._submitted || !this._entry || this._posting) return;
    const entry = this._entry;
    const chk = Score.cleanName(auto || this.el('arcadeName').value);
    if (!chk.ok) {
      if (auto) this._promptName('Name your chief to put this score on the board');
      else UI.toast(chk.why, true);
      return;
    }
    const btn = this.el('btnSubmitScore');
    if (!auto) { btn.textContent = '…'; btn.classList.add('cant'); }
    this._posting = true;
    try {
      // idempotent: never double-post the same run — reopening a finished
      // victory, or an auto-post that already landed, just shows the board
      let already = false;
      if (!opts.keepalive) {
        const pre = await Backend.topScores(50);
        if (pre.ok) already = pre.data.some(x =>
          x.name === chk.name && x.score === entry.score && x.mode === entry.mode);
      }
      if (!already) {
        const sub = await Backend.submitScore(chk.name, entry,
          { remember: opts.remember !== false, keepalive: !!opts.keepalive });
        // the server refusing a DUPLICATE means the row is already up (a post
        // whose answer was lost, retried) — that is success, not failure
        if (!sub.ok && !/duplicate/i.test(sub.error.message || '')) {
          if (auto) this._promptName('Couldn’t reach the board — tap Save to try again');
          else { btn.textContent = '💾 Save score'; btn.classList.remove('cant');
            UI.toast('Could not reach the board: ' + sub.error.message, true); }
          return;
        }
      }
      this._submitted = true;
    } finally { this._posting = false; }
    this.el('nameRow').style.display = 'none';
    this._note(`✓ On the board as ${chk.name.toUpperCase()} — safe to leave`);
    if (opts.fallback)
      UI.toast(`On the board as ${chk.name.toUpperCase()} — name your chief next time to choose your own`, false, 4200);
    const top = await Backend.topScores(10);
    if (top.ok) {
      const mine = top.data.findIndex(r =>
        r.name === chk.name && r.score === entry.score);
      // stay compact: top three, plus your row wherever it landed
      const rows = top.data.slice(0, 3);
      let meIdx = mine >= 0 && mine < 3 ? mine : -1;
      if (mine >= 3) { rows.push(top.data[mine]); meIdx = rows.length - 1; }
      this.renderBoard(rows, this.el('endBoard'), meIdx, mine >= 3 ? mine + 1 : 0);
      const rankText = mine === 0 ? '★ NEW HIGH SCORE ★' : mine > 0 ? `★ GLOBAL RANK #${mine + 1} ★` : '';
      if (rankText) {
        this.el('hsBanner').textContent = rankText; this.el('hsBanner').style.display = 'block';
        // ...and the blinking rank lands on the celebration screen too
        this.el('vicRank').textContent = rankText; this.el('vicRank').style.display = 'block';
      }
      if (!opts.quiet) UI.toast(mine >= 0 ? 'You made the board, chief!' : 'Score on the board');
    }
  },

  /* ---------------- leaderboard ---------------- */
  MODE_ICON: { calm: '🌿', moderate: '🏹', hard: '💀' },   // matches CFG.MODES + the trial cards
  renderBoard(rows, into, meIdx, lastRank) {
    if (!rows.length) { into.innerHTML = '<p class="hint">No chiefs on the board yet — be the first.</p>'; return; }
    into.innerHTML = rows.map((r, i) =>
      `<div class="ldr${i === 0 ? ' top1' : ''}${i === meIdx ? ' me' : ''}">
         <span class="rank">${i === 0 ? '👑' : '#' + (lastRank && i === rows.length - 1 ? lastRank : i + 1)}</span>
         <span class="nm">${this.esc(r.name)}</span>
         <span class="pts">${(r.score || 0).toLocaleString()}</span>
         <span class="md">${this.MODE_ICON[r.mode] || ''}</span>
       </div>`).join('');
  },
  async onLeaders() {
    const box = this.el('ldrList');
    box.innerHTML = '<p class="hint">Fetching…</p>';
    if (!window.Backend || !Backend.isReady()) {
      box.innerHTML = '<p class="hint">The board lives in the cloud — ' +
        (window.Backend && Backend.configured ? 'still connecting…' : 'cloud saves are not configured.') + '</p>';
      return;
    }
    const r = await Backend.topScores(10);
    if (!r.ok) { box.innerHTML = '<p class="hint">Could not reach the board: ' + this.esc(r.error.message) + '</p>'; return; }
    this.renderBoard(r.data, box, -1);
  },

  esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; },

  /* ---------------- wiring ---------------- */
  bind() {
    const on = (id, fn) => this.el(id).addEventListener('click', fn);
    on('btnContinue', () => this.continueGame());
    on('btnTitleNew', () => { this.backTo = 'title'; this.show('newgame'); });
    on('btnTitleLoad', () => { this.backTo = 'title'; this.show('load'); });
    on('btnTitleBoard', () => { this.backTo = 'title'; this.show('leaders'); });
    on('ldrBack', () => {
      // the card system's reward screen sends its LEADERBOARD here and is
      // brought back to itself, as it was left (js/deckscreens.js)
      if (this.backTo === 'endgame' && window.S && S.over) { this.show('endgame', { win: S.over.win, msg: S.over.msg, back: true }); return; }
      this.show(this.backTo === 'paused' ? 'paused' : 'title');
    });
    on('btnSubmitScore', () => (window.Backend && Backend.isReady()) ? this.submitScore() : this._offerSubmit());
    on('btnTitleSettings', () => { this.backTo = 'title'; this.show('settings'); });
    on('btnTitleHow', () => { this.backTo = 'title'; this.show('howto'); });
    for (const id of ['ngBack', 'loadBack', 'setBack', 'howBack'])
      on(id, () => this.show(this.backTo === 'paused' ? 'paused' : 'title'));
    /* the difficulty cards — the only choice a new game asks for, and it
       speaks the SAME two-tap grammar the origin cards teach next: first
       tap selects and shows what the trial means, the second tap on the
       same card starts. No button. */
    this.el('ngMode').querySelectorAll('.dcard').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.v;
      if (this._trialArmed === v) { this.startNewGame(); return; }   // second tap: begin
      this.newPrefs.mode = v;
      this.onNewgame();                       // select + describe (also disarms)
      this._trialArmed = v;
      this.el('ngHint').textContent = 'Tap again to select your trial';
    }));
    // the origin draft — keeping a card starts the game (see draftTap;
    // that is also the tutorial's one entry point now)
    on('btnTutToggle', () => {
      // a tap is an EXPLICIT choice, the opposite of whatever the button showed
      const v = this.tutorialWanted();
      this.lsSet('neo-tutorial-ask', v ? '0' : '1');
      this.syncTutToggle();
      /* TICKING IT ON RE-FOUNDS THE WORLD (audit MAP-V01). The forcing
         ("the tutorial never gambles": Valley · Classic · medium) is decided
         in foundRun, which has already run by the time this checkbox is on
         screen — so ticking it armed the lesson on whatever world had been
         rolled: an archipelago, a karst, an xlarge fjord, 12 times in 12.
         An UN-KEPT draft on a world the lesson cannot teach is founded again
         under the new rule. Only this direction: unticking leaves the
         world alone, and re-ticking on a teachable world founds nothing, so
         the checkbox can never become a free re-deal of the cards. */
      if (!v && window.S && S.draft && !S.draft.done && !this._demo && !this.teachableWorld()) this.refoundForLesson();
    });
    on('btnDraftHelp', () => { this.el('draftOverlay').style.display = 'flex'; });
    // back to the trial pick; the pending draft rides S and resumes intact
    on('btnDraftBack', () => this.show('newgame'));
    on('btnDraftGotIt', () => {
      this.el('draftOverlay').style.display = 'none';
      try { localStorage.setItem('neo-draft-help', '1'); } catch (e) {}
    });
    // pause
    on('btnPauseResume', () => this.enterGame());
    on('btnPauseSave', () => { this.backTo = 'paused'; this.show('load', { saveMode: true }); });
    on('btnPauseLoad', () => { this.backTo = 'paused'; this.show('load'); });
    on('btnPauseSettings', () => { this.backTo = 'paused'; this.show('settings'); });
    on('btnPauseHow', () => { this.backTo = 'paused'; this.show('howto'); });
    // guide page dots — one per panel, lit by scroll position
    {
      const panels = this.el('howPanels'), dots = this.el('howDots');
      if (panels && dots) {
        dots.innerHTML = Array.from(panels.children, () => '<i></i>').join('');
        const mark = () => {
          const i = Math.round(panels.scrollLeft / Math.max(1, panels.clientWidth));
          Array.from(dots.children).forEach((d, k) => d.classList.toggle('on', k === i));
        };
        panels.addEventListener('scroll', () => requestAnimationFrame(mark), { passive: true });
        mark();
      }
    }
    on('btnQuitTitle', () => this.quitToTitle());
    on('btnResign', () => this.resign());
    on('btnDoomResign', () => this.doomResign());
    on('btnDoomStay', () => this.doomStay());
    // endgame
    window.addEventListener('pagehide', () => { if (this.atEnd()) this._postBeforeLeaving(true); });
    on('btnVicScore', () => this.openTally());   // "A New Dawn" victory buttons
    on('btnScoreBack', () => this.closeTally());
    on('btnVicAgain', () => this.endReplay());
    on('btnVicTitle', () => this.endMenu());
    on('btnDefeatAgain', () => this.endReplay());  // "The Last Fire" defeat buttons — same actions
    on('btnDefeatTitle', () => this.endMenu());
    // settings — the cadence is a segmented row now, same idiom as the
    // new-game pickers, so it reads as a game option instead of a form field
    /* AUDIO. Sound owns the state and the persistence; these rows only ask
       it and paint what it says, so there is one source of truth for "is
       the music on" and the controls can never disagree with the speaker.
       The dial plays a tick as it moves, because a level you cannot hear
       while you set it is a level you have to set twice (Sound's own
       per-kind throttle is what keeps a fast drag from machine-gunning). */
    for (const [id, bus] of [['setSfx', 'sfx'], ['setMusic', 'music']]) {
      const row = this.el(id);
      row.addEventListener('click', e => {
        if (!e.target.closest('.spk')) return;
        const on = bus === 'sfx' ? Sound.sfxOn() : Sound.musicOn();
        if (bus === 'sfx') { Sound.setSfx(!on); if (!on) Sound.play('tick'); }
        else Sound.setMusic(!on);
        this.paintAudioRows();
      });
      const sl = row.querySelector('.vol');
      if (sl) sl.addEventListener('input', () => {
        Sound.setVol(bus, sl.value);
        if (bus === 'sfx') Sound.play('tick');
        this.paintAudioRows();
      });
    }
    this.el('setCadence').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      Backend.autosaveDays = +b.dataset.v;
      try { localStorage.setItem('neo-autosave-days', b.dataset.v); } catch (err) {}
      for (const x of this.el('setCadence').querySelectorAll('.abtn'))
        x.classList.toggle('sel', x === b);
    });
    this.el('chiefInput').addEventListener('change', e => {
      if (window.Backend && Backend.isReady()) Backend.setChiefName(e.target.value);
    });
    on('btnExportId', async () => {
      const r = Backend.exportIdentity();
      if (!r.ok) { UI.toast(r.error.message, true); return; }
      try { await navigator.clipboard.writeText(r.data); UI.toast('Recovery token copied — keep it safe'); }
      catch (e) { prompt('Copy your recovery token:', r.data); }
    });
    on('btnImportId', async () => {
      const tok = prompt('Paste your recovery token:');
      if (!tok) return;
      const r = await Backend.importIdentity(tok.trim());
      UI.toast(r.ok ? 'Identity restored — your cloud saves are back' : r.error.message, !r.ok);
      if (r.ok) this.onSettings();
    });
    on('btnExportFile', () => {
      if (!window.S) return;
      const blob = new Blob([G.saveJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'clanfire-day' + S.day + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      UI.toast('Save file downloaded');
    });
    on('btnImportFile', () => this.el('fileLoad').click());
    this.el('fileLoad').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          R.deferBake = true; try { G.loadJSON(rd.result); } finally { R.deferBake = false; }
          Backend.markActiveSlot(null);
          this.lastSavedDay = S.day;
          this.enterGame();
          UI.toast('Save file loaded');
        } catch (err) { UI.toast('Could not load save: ' + err.message, true); }
      };
      rd.readAsText(f);
      e.target.value = '';
    });
  },
};

// classic-script global: game code tests window.Screens for the demo guard
window.Screens = Screens;

/* ---------------- THE CARD FACES (trial + origin) ----------------
   The trial and origin cards were a wood panel with a 2px brown border, an
   emoji or a 128px icon and plain sans-serif text — bland beside the deck's
   framed paintings (operator, after the deck shipped). They are VECTOR now,
   built to their box the way the title's plaques are (TitleScreen.plaque):
   the same ink line, gold-leaf rim, chamfered corners and gold corner caps,
   a lit art window whose glow is the card's own tone, a name plate in the
   menu's Cinzel caps, and a stone on the foot. Nothing in the frame is a
   raster: it is crisp at every DPR and costs no download at all.

   The pictures inside ARE art: 256px icons (assets/icons/cards/ — the
   origin set doubled by Scale2x, the three trials drawn at 256), fetched
   only when a screen shows them, never at boot (tests/draft-cards.mjs), and
   drawn into a canvas at the screen's own pixels (fitDraw).

   ONE GEOMETRY (geo) is read by the SVG and by the HTML boxes alike, so the
   name always sits on its plate and the icon in its window. Without the
   title's helpers (a cached older titlescreen.js) the frame stands down and
   the old wood face is what shows — a painter stands down, it never throws. */
const CardFace = {
  f(n) { return Math.round(n * 100) / 100; },
  // [light, body, edge] of the window's glow, and [glint, stone, shadow] of the gem
  TONES: {
    calm:     { glow: ['#e6f2b4', '#6f9a44', '#141c0c'], gem: ['#d4ffc0', '#46a83e', '#0e3810'] },
    moderate: { glow: ['#ffe9b0', '#c48c30', '#1e1206'], gem: ['#fff0b0', '#e0a228', '#5a3406'] },
    hard:     { glow: ['#ffc9a4', '#b0301c', '#1e0604'], gem: ['#ff9a6c', '#d23a1a', '#5c0b05'] },
    econ:     { glow: ['#ffe9b0', '#c48c30', '#1e1206'], gem: ['#fff0b0', '#e0a228', '#5a3406'] },
    aggro:    { glow: ['#ffc9a4', '#b0301c', '#1e0604'], gem: ['#ff9a6c', '#d23a1a', '#5c0b05'] },
    def:      { glow: ['#e2ecff', '#5e7eaa', '#0c1220'], gem: ['#dce8ff', '#4f7cd0', '#0e1e4a'] },
    explore:  { glow: ['#d6f6e2', '#3f8e6c', '#0a1c12'], gem: ['#c4ffe0', '#2fa06c', '#0a3a22'] },
    naval:    { glow: ['#cdeeff', '#2f7aa8', '#08141f'], gem: ['#cdeeff', '#2a84d0', '#082a4a'] },
  },
  geo(W, H, art) {
    const c = Math.max(6, Math.round(W * 0.075));       // the chamfer
    const rim = Math.max(2.6, W * 0.03);                 // the gold-leaf band
    const R = 1 + rim;                                    // the face begins here
    const pad = R + Math.max(3, W * 0.04);                // the art window's inset
    const ax = pad, ay = pad, aw = W - 2 * pad, ah = Math.round(H * art);
    const ph = Math.max(15, Math.round(H * 0.088));       // the name plate
    const py = Math.round(ay + ah - ph * 0.42), px = Math.round(R + W * 0.012);
    const gem = Math.max(3, W * 0.03), gy = H - R - gem * 1.3;
    const tx = Math.round(pad + W * 0.015), ty = py + ph + Math.round(H * 0.02);
    const th = Math.max(10, Math.round(gy - gem * 1.75 - ty));
    return { W, H, c, rim, R, ax, ay, aw, ah, px, py, pw: W - 2 * px, ph, tx, ty, tw: W - 2 * tx, th, gem, gy,
      icon: Math.max(16, Math.floor(Math.min(aw * 0.94, (py - ay) * 0.98))) };
  },
  helpers() {
    const T = typeof TitleScreen !== 'undefined' ? TitleScreen : null;
    return T && T.oct && T.caps && T.metal && T.rng && T.METAL ? T : null;
  },
  // the rim every face shares: ink, gold leaf lit along its top, the ink seat
  _rim(TS, n, W, H, c, R) {
    const f = v => this.f(v);
    return `<path d="${TS.oct(W, H, c, 0)}" fill="#0b0602"/><path d="${TS.oct(W, H, c, 1)}" fill="url(#${n}g)"/>` +
      `<path d="M${f(c + 0.65)},1.6 H${f(W - c - 0.65)}" stroke="#fff6d4" stroke-opacity=".6" stroke-width=".7"/>` +
      `<path d="${TS.oct(W, H, c, R)}" fill="#120a03"/>`;
  },
  frame(G, tone) {
    const TS = this.helpers();
    if (!TS) return '';
    const T = this.TONES[tone] || this.TONES.moderate, n = 'f', f = v => this.f(v);   // ids live inside the picture: no need to be unique
    const { W, H, c, R, ax, ay, aw, ah } = G;
    let s = '<defs>' + TS.metal(n + 'g', 'gold', 0, 0, 0, H) + TS.metal(n + 'm', 'gold', 0, 0, 0, 22) +
      `<linearGradient id="${n}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2715"/><stop offset=".55" stop-color="#28190c"/><stop offset="1" stop-color="#170e06"/></linearGradient>` +
      `<radialGradient id="${n}w" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="${T.glow[0]}"/><stop offset=".4" stop-color="${T.glow[1]}"/><stop offset="1" stop-color="${T.glow[2]}"/></radialGradient>` +
      `<radialGradient id="${n}v" cx=".5" cy=".5" r=".75"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".66"/></radialGradient>` +
      `<linearGradient id="${n}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#432d16"/><stop offset=".55" stop-color="#26180b"/><stop offset="1" stop-color="#130b04"/></linearGradient>` +
      `<radialGradient id="${n}e" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="${T.gem[0]}"/><stop offset=".55" stop-color="${T.gem[1]}"/><stop offset="1" stop-color="${T.gem[2]}"/></radialGradient>`;
    const wc = Math.max(3, c * 0.45);
    const win = `M${f(ax + wc)},${f(ay)} H${f(ax + aw - wc)} L${f(ax + aw)},${f(ay + wc)} V${f(ay + ah - wc)} L${f(ax + aw - wc)},${f(ay + ah)} H${f(ax + wc)} L${f(ax)},${f(ay + ah - wc)} V${f(ay + wc)} Z`;
    s += `<clipPath id="${n}k"><path d="${win}"/></clipPath></defs>`;
    // the face, and a carved groove one step in from the rim
    s += this._rim(TS, n, W, H, c, R) + `<path d="${TS.oct(W, H, c, R + 0.8)}" fill="url(#${n}b)"/>` +
      `<path d="${TS.oct(W, H, c, R + 2.4)}" fill="none" stroke="#0a0502" stroke-opacity=".7" stroke-width="1"/>` +
      `<path d="${TS.oct(W, H, c, R + 3.2)}" fill="none" stroke="#c9925a" stroke-opacity=".13" stroke-width=".6"/>`;
    // THE WINDOW: the card's tone as light, faint rays and motes behind the
    // picture, a shadow for it to stand on, a vignette, an ink and gold edge
    const cx = ax + aw / 2, cy = ay + (G.py - ay) * 0.55, rl = Math.hypot(aw, ah);
    s += `<g clip-path="url(#${n}k)"><rect x="${f(ax)}" y="${f(ay)}" width="${f(aw)}" height="${f(ah)}" fill="url(#${n}w)"/>`;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.13, da = i % 2 ? 0.05 : 0.085;
      s += `<path d="M${f(cx)},${f(cy)} L${f(cx + Math.cos(a - da) * rl)},${f(cy + Math.sin(a - da) * rl)} L${f(cx + Math.cos(a + da) * rl)},${f(cy + Math.sin(a + da) * rl)} Z" fill="${T.glow[0]}" fill-opacity="${i % 2 ? 0.05 : 0.09}"/>`;
    }
    const rnd = TS.rng(tone + ':' + W);
    for (let i = 0; i < 10; i++) s += `<circle cx="${f(ax + rnd() * aw)}" cy="${f(ay + rnd() * ah * 0.8)}" r="${f(0.45 + rnd() * 0.75)}" fill="${T.glow[0]}" fill-opacity="${f(0.3 + rnd() * 0.45)}"/>`;
    s += `<ellipse cx="${f(cx)}" cy="${f(G.py - 2)}" rx="${f(aw * 0.3)}" ry="${f(Math.max(2, ah * 0.05))}" fill="#000" fill-opacity=".3"/>` +
      `<rect x="${f(ax)}" y="${f(ay)}" width="${f(aw)}" height="${f(ah)}" fill="url(#${n}v)"/></g>` +
      `<path d="${win}" fill="none" stroke="#0b0602" stroke-width="1.6"/>` +
      `<path d="${win}" fill="none" stroke="url(#${n}g)" stroke-width=".8" stroke-opacity=".9"/>`;
    // the text field
    s += `<rect x="${f(G.tx - 3)}" y="${f(G.ty - 2)}" width="${f(G.tw + 6)}" height="${f(G.th + 4)}" rx="2.5" fill="#000" fill-opacity=".24" stroke="#e8c88c" stroke-opacity=".1" stroke-width=".6"/>`;
    // the name plate, straddling the window's foot, with a shadow under it
    const { px, py, pw, ph } = G, e = ph * 0.5;
    const plate = `M${f(px)},${f(py + ph / 2)} L${f(px + e)},${f(py)} H${f(px + pw - e)} L${f(px + pw)},${f(py + ph / 2)} L${f(px + pw - e)},${f(py + ph)} H${f(px + e)} Z`;
    s += `<path d="${plate}" transform="translate(0 1.4)" fill="#000" fill-opacity=".5"/>` +
      `<path d="${plate}" fill="url(#${n}p)" stroke="url(#${n}g)" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M${f(px + e + 1)},${f(py + 1.7)} H${f(px + pw - e - 1)}" stroke="#fff3c6" stroke-opacity=".3" stroke-width=".6"/>`;
    // the stone on the foot
    const gx = W / 2, gy = G.gy, gr = G.gem, b = gr * 1.5;
    s += `<path d="M${f(gx)},${f(gy - b)} L${f(gx + b)},${f(gy)} L${f(gx)},${f(gy + b)} L${f(gx - b)},${f(gy)} Z" fill="url(#${n}m)" stroke="#0b0602" stroke-width="1"/>` +
      `<path d="M${f(gx)},${f(gy - gr)} L${f(gx + gr)},${f(gy)} L${f(gx)},${f(gy + gr)} L${f(gx - gr)},${f(gy)} Z" fill="url(#${n}e)"/>` +
      `<path d="M${f(gx - gr * 0.42)},${f(gy - gr * 0.1)} L${f(gx - gr * 0.05)},${f(gy - gr * 0.5)}" stroke="#fff" stroke-opacity=".8" stroke-width="${f(gr * 0.3)}" stroke-linecap="round"/>`;
    // the corner caps: the title plaques' own, set with the card's stone
    s += TS.caps(W, H, c, W < 150, n + 'c', 'wood', T.gem);
    return this.img(W, H, s);
  },
  // THE BACK: walnut under a gold lattice, a double rule, and a medallion
  // with the clan's fire in it — the same rim and caps as the face
  back(G) {
    const TS = this.helpers();
    if (!TS) return '';
    const n = 'b', f = v => this.f(v), { W, H, c, R } = G;
    const p = Math.max(7, W * 0.085), cx = W / 2, cy = H / 2, mr = W * 0.25;
    let s = '<defs>' + TS.metal(n + 'g', 'gold', 0, 0, 0, H) + TS.metal(n + 'm', 'gold', 0, cy - mr, 0, cy + mr) +
      `<radialGradient id="${n}b" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#3a2514"/><stop offset="1" stop-color="#160d05"/></radialGradient>` +
      `<radialGradient id="${n}d" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#4a2c10"/><stop offset="1" stop-color="#140a03"/></radialGradient>` +
      `<pattern id="${n}l" width="${f(p)}" height="${f(p)}" patternUnits="userSpaceOnUse" x="${f(cx)}" y="${f(cy)}">` +
      `<path d="M0,0 L${f(p)},${f(p)} M${f(p)},0 L0,${f(p)}" stroke="#e8c070" stroke-opacity=".16" stroke-width=".7"/>` +
      `<circle cx="0" cy="0" r=".9" fill="#e8c070" fill-opacity=".3"/></pattern>` +
      `<clipPath id="${n}k"><path d="${TS.oct(W, H, c, R + 0.8)}"/></clipPath>` +
      // the fire's own gold, in its own box (a page-space gradient inside the
      // scaled emblem would land on its first stop and paint it cream)
      `<linearGradient id="${n}f" x1="0" y1="0" x2="0" y2="1">` +
        TS.METAL.gold.map((col, i) => `<stop offset="${[0, 0.22, 0.44, 0.6, 0.78, 1][i]}" stop-color="${col}"/>`).join('') + '</linearGradient></defs>';
    s += this._rim(TS, n, W, H, c, R) +
      `<g clip-path="url(#${n}k)"><rect width="${W}" height="${H}" fill="url(#${n}b)"/><rect width="${W}" height="${H}" fill="url(#${n}l)"/></g>` +
      `<path d="${TS.oct(W, H, c, R + 4)}" fill="none" stroke="url(#${n}g)" stroke-width=".9" stroke-opacity=".8"/>` +
      `<path d="${TS.oct(W, H, c, R + 6.2)}" fill="none" stroke="url(#${n}g)" stroke-width=".5" stroke-opacity=".5"/>`;
    // the medallion, four studs on its ring, and the fire in it
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(mr + 2.4)}" fill="#0b0602"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(mr)}" fill="url(#${n}d)" stroke="url(#${n}m)" stroke-width="2"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(mr - 3.2)}" fill="none" stroke="#e8c070" stroke-opacity=".38" stroke-width=".6"/>`;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, x = cx + Math.cos(a) * mr, y = cy + Math.sin(a) * mr, k = Math.max(2, W * 0.022);
      s += `<path d="M${f(x)},${f(y - k)} L${f(x + k)},${f(y)} L${f(x)},${f(y + k)} L${f(x - k)},${f(y)} Z" fill="url(#${n}m)" stroke="#0b0602" stroke-width=".8"/>`;
    }
    const k = mr * 1.25 / 24;
    s += `<g transform="translate(${f(cx - 12 * k)} ${f(cy - 10.6 * k)}) scale(${f(k)})">` +
      `<path d="M12,1.8 C13.6,5.6 17.6,8 17.6,12.8 C17.6,16.3 15.1,18.6 12,18.6 C8.9,18.6 6.4,16.3 6.4,13.2 C6.4,10.6 7.8,9.2 9,7.6 C9.2,9.6 10,10.8 11,11.2 C10.6,8 11,5 12,1.8 Z" fill="url(#${n}f)" stroke="#0b0602" stroke-width="${f(1.1 / Math.max(1, k * 0.7))}" stroke-linejoin="round"/>` +
      '<path d="M12.3,10.6 C13.2,12.4 14.7,13.4 14.7,15.4 C14.7,17 13.5,17.9 12,17.9 C10.5,17.9 9.4,17 9.4,15.6 C9.4,14.2 10.3,13.3 11,12.6 C11.2,13.6 11.6,14 12.1,14.2 C11.8,13 11.9,11.6 12.3,10.6 Z" fill="#fff3c0" fill-opacity=".55"/>' +
      '<path d="M5.4,20.6 L18.6,17.4 M5.4,17.4 L18.6,20.6" stroke="#0b0602" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M5.4,20.6 L18.6,17.4 M5.4,17.4 L18.6,20.6" stroke="#c98a2e" stroke-width="1.3" stroke-linecap="round"/></g>';
    s += TS.caps(W, H, c, W < 150, n + 'c', 'wood');
    return this.img(W, H, s);
  },
  /* A FRAME IS ONE PICTURE. The SVG is handed to the page as an image (a
     data: URL) rather than inlined: the browser rasterises a vector image at
     the screen's own pixels, so it is exactly as crisp, but the card adds ONE
     element to the page instead of the frame's hundred — laid out inline they
     cost ~30ms a card on a slow phone, right as the draft deals — and every
     gradient id lives inside its own picture, so no two cards share one. */
  _pics: {},
  pic(key, make) { return this._pics[key] || (this._pics[key] = make()); },   // one string per size and tone
  img(W, H, body) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
    return `<img class="cfr" alt="" aria-hidden="true" draggable="false" decoding="sync" width="${W}" height="${H}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
  },

  /* THE PICTURE AT THE SCREEN'S OWN PIXELS. The canvas's backing store is its
     CSS box times the device's pixel ratio; the art is drawn nearest-
     neighbour when the screen shows it at or above its own pixels (crisp,
     the way pixel art should be) and smoothed only when it must be shrunk —
     nearest-neighbour on a shrink drops whole rows. Boot.t2fit's rule. */
  fitCanvas(cv, css) {
    const dpr = Math.min(3, window.devicePixelRatio || 1), b = Math.max(1, Math.round(css * dpr));
    cv.style.width = cv.style.height = css + 'px';
    if (cv.width !== b || cv.height !== b) { cv.width = b; cv.height = b; }
    cv._cfFit = true;
  },
  fitDraw(cv, img) {
    const g = cv.getContext('2d');
    if (!g) return;
    const W = cv.width, H = cv.height, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    g.clearRect(0, 0, W, H);
    if (!iw || !ih) return;
    const s = Math.min(W / iw, H / ih), dw = Math.round(iw * s), dh = Math.round(ih * s);
    g.imageSmoothingEnabled = s < 1;
    if (s < 1) g.imageSmoothingQuality = 'high';
    g.drawImage(img, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
  },

  /* the trial icons: fetched the first time the trial screen opens (a few
     kilobytes each), never at boot; a card with no picture yet shows its
     lit window, and the picture arrives in place */
  TRIAL_URL(mode) { return 'assets/icons/cards/trial-' + mode + '.png?v=' + ((window.CFG && CFG.ART_V) || 1); },
  _trial: {},
  trialImg(mode, then) {
    let e = this._trial[mode];
    if (!e) {
      e = this._trial[mode] = { img: new Image(), ok: false, wait: [] };
      e.img.decoding = 'async';
      try { e.img.fetchPriority = 'high'; } catch (er) {}   // ahead of the world's art still landing
      e.img.onload = () => { e.ok = true; for (const fn of e.wait.splice(0)) fn(e.img); };
      e.img.onerror = () => { e.wait.length = 0; };
      e.img.src = this.TRIAL_URL(mode);
    }
    if (e.ok) then(e.img); else e.wait.push(then);
  },

  /* fit a one-line name to its plate: the type is stepped down until it
     fits, then allowed to wrap — MEASURED ON A CANVAS in the plate's own face
     (Cinzel caps, its letter-spacing), never by reading the page's layout,
     which forced a layout per step on a card that had just been built */
  _mc: null,
  nameWidth(text, px) {
    if (!this._mc) this._mc = document.createElement('canvas').getContext('2d');
    const g = this._mc;
    if (!g) return 0;
    g.font = `700 ${px}px Cinzel, 'Times New Roman', Georgia, serif`;
    const t = String(text).toUpperCase();
    return g.measureText(t).width + t.length * 0.05 * px;
  },
  fitName(el, max, room) {
    const sp = el.firstElementChild;
    if (!sp) return;
    const w = this.nameWidth(sp.textContent, max);
    let sz = w > room && w > 0 ? Math.max(6.5, Math.floor(max * room / w * 2) / 2) : max;
    el.style.fontSize = sz + 'px';
    el.style.whiteSpace = this.nameWidth(sp.textContent, sz) > room ? 'normal' : 'nowrap';
  },
  // …and the words to their field: smaller type first, the flavour line last
  fitText(box) {
    box.classList.remove('tight');
    let k = 1;
    box.style.setProperty('--tk', '1');
    while (box.scrollHeight > box.clientHeight + 1 && k > 0.8) { k -= 0.05; box.style.setProperty('--tk', k.toFixed(2)); }
    if (box.scrollHeight > box.clientHeight + 1) box.classList.add('tight');
  },
  _place(el, x, y, w, h) {
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (w != null) el.style.width = w + 'px';
    if (h != null) el.style.height = h + 'px';
  },

  // an origin card: the face (frame, picture, plate, words) and the back
  /* the words are fitted in the NEXT frame, inside the layout that frame
     does anyway — fitting them as each card is built forced a layout per
     card, a cost the deal paid three times over on a slow phone */
  _fitQ: null,
  fitLater(box) {
    if (!this._fitQ) {
      this._fitQ = [];
      requestAnimationFrame(() => { const q = this._fitQ; this._fitQ = null; for (const b of q) if (b.isConnected) this.fitText(b); });
    }
    this._fitQ.push(box);
  },
  // the size every card on a screen shares, read once (sz) — or its own
  dressOrigin(card, sz) {
    const key = card._cfKey, W = sz ? sz.w : card.offsetWidth, H = sz ? sz.h : card.offsetHeight;
    if (!key || !W || !H || card.classList.contains('burn') || card.classList.contains('gone')) return;
    if (card._cfW === W && card._cfH === H) return;
    const G = this.geo(W, H, 0.44), d = Cards.DEFS[key];
    const front = card.querySelector('.ofront'), back = card.querySelector('.oback');
    const tone = (d && d.cat) || 'econ', fr = this.helpers() ? this.pic(W + 'x' + H + ':' + tone, () => this.frame(G, tone)) : '';
    if (!fr || !front || !back) return;               // no helpers: the wood face stands
    card._cfW = W; card._cfH = H;
    card.style.setProperty('--k', (W / 124).toFixed(3));
    const old = front.querySelector('.cfr');
    if (old) old.remove();
    front.insertAdjacentHTML('afterbegin', fr);
    back.innerHTML = this.pic(W + 'x' + H + ':back', () => this.back(G));
    front.classList.add('framed'); back.classList.add('framed');
    const cv = front.querySelector('canvas');
    if (cv) {
      this.fitCanvas(cv, G.icon);
      this._place(cv, Math.round(G.ax + (G.aw - G.icon) / 2), Math.round(G.ay + (G.py - G.ay - G.icon) / 2));
      Cards.drawMotif(cv, key);
    }
    const nm = front.querySelector('.oname'), e = G.ph * 0.5;
    if (nm) { this._place(nm, G.px + e, G.py, G.pw - 2 * e, G.ph); this.fitName(nm, Math.min(G.ph * 0.6, 7 + W * 0.05), G.pw - 2 * e - 4); }
    const tx = front.querySelector('.otext');
    if (tx) { this._place(tx, G.tx, G.ty, G.tw, G.th); this.fitLater(tx); }
  },
  // a trial card: the same frame in its trial's tone, its own picture
  dressTrial(card, sz) {
    const mode = card.dataset.v, W = sz ? sz.w : card.offsetWidth, H = sz ? sz.h : card.offsetHeight;
    if (!mode || !W || !H || (card._cfW === W && card._cfH === H)) return;
    const G = this.geo(W, H, 0.5), fr = this.helpers() ? this.pic(W + 'x' + H + ':trial:' + mode, () => this.frame(G, mode)) : '';
    if (!fr) return;
    card._cfW = W; card._cfH = H;
    card.style.setProperty('--k', (W / 124).toFixed(3));
    const old = card.querySelector('.cfr');
    if (old) old.remove();
    card.insertAdjacentHTML('afterbegin', fr);
    card.classList.add('framed');
    const cv = card.querySelector('canvas.dart');
    if (cv) {
      this.fitCanvas(cv, G.icon);
      this._place(cv, Math.round(G.ax + (G.aw - G.icon) / 2), Math.round(G.ay + (G.py - G.ay - G.icon) / 2));
      this.trialImg(mode, img => this.fitDraw(cv, img));
    }
    const nm = card.querySelector('.dname'), e = G.ph * 0.5;
    if (nm) { this._place(nm, G.px + e, G.py, G.pw - 2 * e, G.ph); this.fitName(nm, Math.min(G.ph * 0.62, 7.5 + W * 0.055), G.pw - 2 * e - 4); }
    const ln = card.querySelector('.dline');
    if (ln) { this._place(ln, G.tx, G.ty, G.tw, G.th); this.fitLater(ln); }
  },
  /* THE DEAL PAYS NOTHING FOR ITS FRAMES. The origin cards are the trial
     cards' size, so while the player reads the trial screen the five origin
     tones and the back are built and decoded in idle slices, one picture a
     slice; the deal then finds every picture ready (measured: a cold deal
     cost a slow phone ~80ms more than build 111's, inside the founding). */
  prewarm(sz) {
    if (!sz || !this.helpers() || this._warmFor === sz.w + 'x' + sz.h) return;
    this._warmFor = sz.w + 'x' + sz.h;
    let narrow = false;
    try { narrow = !!(window.matchMedia && matchMedia('(max-width: 359px)').matches); } catch (e) {}
    const W = sz.w, H = narrow ? Math.round(W * 9 / 5) : sz.h, G = this.geo(W, H, 0.44);
    const jobs = [() => this.pic(W + 'x' + H + ':back', () => this.back(G))];
    for (const t of ['econ', 'def', 'explore', 'naval', 'aggro']) jobs.push(() => this.pic(W + 'x' + H + ':' + t, () => this.frame(G, t)));
    this._warm = [];
    const run = () => {
      const j = jobs.shift();
      if (!j) return;
      const m = /src="([^"]+)"/.exec(j());
      if (m) { const im = new Image(); im.src = m[1]; this._warm.push(im); }   // decoded ahead, held in the image cache
      setTimeout(run, 40);
    };
    setTimeout(run, 120);
  },
  // a card dressed at one size is dressed again at another (rotation, a
  // window dragged wider); one observer for every card on these screens
  watch(card) {
    if (typeof ResizeObserver !== 'function') return;
    if (!this._ro) this._ro = new ResizeObserver(es => {
      for (const en of es) {
        const c = en.target;
        if (c.classList.contains('dcard')) this.dressTrial(c); else this.dressOrigin(c);
      }
    });
    this._ro.observe(card);
  },
  // fonts arrive late on a cold cache: a name measured in the fallback face
  // is measured again once Cinzel is in — and only then (a resolved
  // fonts.ready re-dressed every card a second time, every time)
  refitWhenFontsLand() {
    if (this._fontOk || this._fontWait || !(document.fonts && document.fonts.load)) return;
    let ok = true;
    try { ok = document.fonts.check('700 12px Cinzel'); } catch (e) {}
    if (ok) { this._fontOk = true; return; }
    this._fontWait = true;
    document.fonts.load('700 12px Cinzel').then(() => {
      this._fontWait = false;
      for (const c of document.querySelectorAll('.ocard, .dcard')) { c._cfW = 0; if (c.classList.contains('dcard')) this.dressTrial(c); else this.dressOrigin(c); }
    }, () => { this._fontWait = false; });
  },
};
window.CardFace = CardFace;
