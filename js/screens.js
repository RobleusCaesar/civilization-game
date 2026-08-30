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

  init() {
    this.bind();
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
    const scr = this.el('scr' + name[0].toUpperCase() + name.slice(1));
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
    else if (name === 'playing') { if (window.S) S.paused = false; }
    if (name !== 'playing' && window.S && !this._demo) S.paused = true;
  },

  /* ---------------- title ---------------- */
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
    G.newGame(String((Math.random() * 1e9) | 0), 'moderate', 'large');
    Cards.pick((Math.random() * 3) | 0);   // the demo world drafts for itself
    G.freeVis = true;         // newGame resets fog; the demo shows the whole map
    G.updateVisibility();
    S.paused = false;                       // the world lives behind the logo
    document.getElementById('toasts').innerHTML = '';
    R.cam.z = 1.7;
    const tc = Bld.tcOf('P');            // open on the village, drift from there
    if (tc) R.centerOn(tc.x, tc.y); else { R.cam.x = 0; R.cam.y = CFG.W * CFG.TILE * 0.3; }
  },

  onTitle() {
    this.ensureDemo();
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
  },

  async continueGame() {
    if (this._newestSlot == null) return;
    if (this._newestSlot === 'local') {
      const snap = Backend.readLocalSnapshot();
      if (!snap) return;
      G.loadJSON(snap.json);
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
    G.loadJSON(typeof row.state === 'string' ? row.state : JSON.stringify(row.state));
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
    S.paused = false;
    document.getElementById('btnPause').textContent = '⏸';
    this.show('playing');
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
    this.el('ngMode').querySelectorAll('.dcard').forEach(b =>
      b.classList.toggle('sel', b.dataset.v === this.newPrefs.mode));
    this.el('ngDesc').textContent = this.MODE_DESC[this.newPrefs.mode] || '';
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
       with the world already founded and the hand already dealt; pressing
       on with the SAME trial resumes that exact draft — map, cards and
       all. A fresh roll is only ever paid for with a different trial, so
       there is no free re-draw loop. */
    if (window.S && !this._demo && S.draft && !S.draft.done &&
        S.mode === this.newPrefs.mode) { this.show('draft'); return; }
    this._founding = true;
    const btn = this.el('btnStart');
    const was = btn ? btn.textContent : '';
    if (btn) { btn.classList.add('busy'); btn.textContent = 'Founding the valley…'; }
    const done = () => {
      this._founding = false;
      if (btn) { btn.classList.remove('busy'); btn.textContent = was; }
    };
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
    let tut = false;
    try { tut = localStorage.getItem('neo-tutorial-ask') === '1'; } catch (e) {}
    const lean = this.SIZE_LEAN[p.mode] || this.SIZE_LEAN.moderate;
    let roll = Math.random(), size = lean[0][0];
    for (const [k, w] of lean) { if ((roll -= w) <= 0) { size = k; break; } }
    if (tut) size = 'medium';
    const wantLf = tut ? 'valley'
      : ['valley', 'lakeland', 'highlands', 'islands'][(Math.random() * 4) | 0];
    let seed = '';
    CFG.W = CFG.H = CFG.SIZES[size];
    for (let i = 0; i < 160; i++) {
      const s = String((Math.random() * 1e9) | 0);
      const g = MapGen.generate(s);
      if (g.landform === wantLf && (!tut || g.variant === 'classic')) { seed = s; break; }
    }
    if (!seed) seed = String((Math.random() * 1e9) | 0);   // the roll stands anyway
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
    Backend.markActiveSlot(null);          // fresh run: no cloud slot until first save
    Backend.activeName = null;
    this.lastSavedDay = 1;
    this.show('draft');                    // ORIGIN CARDS: pick before the world moves
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
    D.hand.forEach((c, i) => {
      const d = Cards.DEFS[c.key];
      const el = document.createElement('div');
      el.className = 'ocard';
      el.innerHTML =
        `<div class="ocardIn">
           <div class="oface oback">❂</div>
           <div class="oface ofront"><canvas width="128" height="128"></canvas>
             <div class="oname">${this.esc(d.name)}</div>
             <div class="oboon">${this.esc(d.text(c.roll))}</div>
             <div class="oflavor">${this.esc(d.flavor)}</div></div>
         </div>`;
      Cards.drawMotif(el.querySelector('canvas'), c.key);
      el.addEventListener('click', () => this.draftTap(i, el));
      box.appendChild(el);
      if (replay) { el.classList.add('dealt', 'flip'); return; }
      setTimeout(() => el.classList.add('dealt'), 60 + i * 130);        // deal in…
      setTimeout(() => el.classList.add('flip'), 560 + i * 150);        // …then flip
    });
    this._dealtFor = S.seed;
    let seen = false;
    try { seen = !!localStorage.getItem('neo-draft-help'); } catch (e) {}
    this.el('draftOverlay').style.display = seen ? 'none' : 'flex';
    this.syncTutToggle();
  },

  // the Tutorial choice remembers itself across runs. The button carries its
  // own checkmark span (.tik) — state is the .sel class, never rewritten text
  syncTutToggle() {
    const b = this.el('btnTutToggle');
    if (!b) return;
    let v = false;
    try { v = localStorage.getItem('neo-tutorial-ask') === '1'; } catch (e) {}
    b.classList.toggle('sel', v);
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
      this.enterGame();
      // the rival's origin is a NOTIFICATION now, difficulty-gated, and it
      // has to land in-game: toasts are hidden on every shell screen
      if (window.Cards) Cards.announceRival();
      if (window.Tutorial) Tutorial.maybeStart();
    }, this.DRAFT_BURN_MS);
  },
  DRAFT_BURN_MS: 780,   // long enough to see the fire take, short enough to feel instant

  /* an unchosen card is consumed by a pixel fire that climbs it and throws
     ash into the wind. Each card gets its own seed + wind (outward from the
     centre) so the two never look like the same animation. */
  _burnCard(card, idx) {
    const box = this.el('draftCards');
    // GUARANTEED cleanup. However the fancy fire fares — a rAF the browser
    // throttles to a crawl, a canvas iOS Safari refuses to allocate — the card
    // MUST collapse. This failsafe fires no matter what the animation does, so
    // an unchosen card can never be left standing under the flames.
    const failsafe = setTimeout(() => card.classList.add('gone'), 1500);
    const W = Math.round(card.offsetWidth), H = Math.round(card.offsetHeight);
    if (!W || !H) { clearTimeout(failsafe); card.classList.add('gone'); return; }   // not laid out — just drop it

    // Canvas allocation can fail on memory-tight mobile browsers; if it does,
    // skip the fire but still remove the card (via the failsafe) — never throw.
    let cvs, g, off, og, imgData, d;
    const FW = 46, FH = 62, MAXH = 36;   // chunky offscreen fire buffer, scaled up hard
    try {
      cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      cvs.style.cssText = `position:absolute;left:${card.offsetLeft}px;top:${card.offsetTop}px;` +
        `width:${W}px;height:${H}px;z-index:2;pointer-events:none;image-rendering:pixelated;`;
      box.appendChild(cvs);
      g = cvs.getContext('2d'); g.imageSmoothingEnabled = false;
      off = document.createElement('canvas'); off.width = FW; off.height = FH;
      og = off.getContext('2d');
      imgData = og.createImageData(FW, FH); d = imgData.data;
      if (!g || !og) throw new Error('no 2d context');
    } catch (e) {
      if (cvs) cvs.remove();
      return;   // failsafe still collapses the card a beat later
    }
    const buf = new Uint8Array(FW * FH);
    const PAL = [];
    for (let h = 0; h <= MAXH; h++) {
      const t = h / MAXH; let r, gg, b, a;
      if (t < 0.03) { r = 0; gg = 0; b = 0; a = 0; }
      else if (t < 0.35) { r = 70 + t * 360; gg = 12 + t * 60; b = 8; a = 90 + t * 340; }
      else if (t < 0.70) { r = 235; gg = 70 + (t - 0.35) * 400; b = 18; a = 250; }
      else { r = 255; gg = 205 + (t - 0.70) * 150; b = 70 + (t - 0.70) * 560; a = 255; }
      PAL.push([Math.min(255, r | 0), Math.min(255, gg | 0), Math.min(255, b | 0), Math.min(255, a | 0)]);
    }
    // seeded rng → a distinct fire per card
    let sd = (0x1234 + idx * 0x9e3779b1) >>> 0;
    const rnd = () => { sd = (sd + 0x6d2b79f5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const cardMid = card.offsetLeft + W / 2;
    const wind = cardMid < box.offsetWidth / 2 ? -1 : 1;    // ash blows outward from centre
    const decayBias = 0.55 + rnd() * 0.9, flick = 0.6 + rnd() * 0.7, gust = 0.4 + rnd() * 0.5;
    const ash = [];
    const DUR = 1150, t0 = performance.now(), ease = x => 1 - (1 - x) * (1 - x);

    const drawAsh = dt => {
      for (let k = ash.length - 1; k >= 0; k--) {
        const p = ash[k]; p.age += dt;
        if (p.age >= p.life) { ash.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 26 * dt; p.vx *= 0.99;
        const lf = 1 - p.age / p.life;
        if (p.ember) g.fillStyle = `rgba(255,${(150 + lf * 90) | 0},50,${lf.toFixed(2)})`;
        else { const v = (44 + lf * 70) | 0; g.fillStyle = `rgba(${v},${v - 8},${v - 14},${(lf * 0.75).toFixed(2)})`; }
        g.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
      }
    };

    const step = now => {
      if (this.current !== 'draft') { clearTimeout(failsafe); cvs.remove(); card.classList.add('gone'); return; }
      const t = Math.min(1, (now - t0) / DUR), front = ease(t);
      const frontRow = Math.round((1 - front) * (FH - 1));
      // the card body dissolves upward (—webkit— prefix for older iOS Safari,
      // which ignores the unprefixed clip-path and would leave the card whole)
      const clip = `inset(0 0 ${(front * 100).toFixed(1)}% 0)`;
      card.style.webkitClipPath = clip; card.style.clipPath = clip;
      // the burn front is the fire source
      for (let x = 0; x < FW; x++)
        for (let y = frontRow; y < Math.min(FH, frontRow + 3); y++) buf[y * FW + x] = MAXH;
      // propagate heat upward with per-card wind + decay (classic fire spread)
      for (let x = 0; x < FW; x++) for (let y = 1; y < FH; y++) {
        const src = y * FW + x, px = buf[src];
        if (px === 0) { buf[src - FW] = 0; continue; }
        const spread = (rnd() * 3) | 0;
        const dec = (rnd() < flick ? (spread & 1) : 0) + (rnd() < decayBias ? 1 : 0);
        let dx = x - spread + 1 + (rnd() < gust ? wind : 0);
        dx = dx < 0 ? 0 : dx >= FW ? FW - 1 : dx;
        buf[(y - 1) * FW + dx] = Math.max(0, px - dec);
      }
      for (let i2 = 0; i2 < FW * FH; i2++) {
        const c = PAL[buf[i2]], o = i2 * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
      }
      og.putImageData(imgData, 0, 0);
      g.clearRect(0, 0, W, H);
      g.drawImage(off, 0, 0, W, H);
      // throw ash + embers off the burning front, into the wind
      const frontPx = (1 - front) * H;
      if (t < 0.94) for (let s = 0, n = 3 + ((rnd() * 4) | 0); s < n; s++)
        ash.push({ x: rnd() * W, y: frontPx + rnd() * 8 - 4,
          vx: wind * (16 + rnd() * 48) + (rnd() * 12 - 6), vy: -(22 + rnd() * 60),
          life: 0.55 + rnd() * 0.7, age: 0, sz: 2 + ((rnd() * 3) | 0), ember: rnd() < 0.3 });
      drawAsh(1 / 60);
      if (t < 1) { requestAnimationFrame(step); return; }
      // the card is ash now — collapse its slot, let the last embers drift, then clean up
      clearTimeout(failsafe);
      if (this.current === 'draft') card.classList.add('gone');
      let extra = 0;
      const drift = () => {
        g.clearRect(0, 0, W, H); extra += 1 / 60; drawAsh(1 / 60);
        if (ash.length && extra < 0.8) requestAnimationFrame(drift); else cvs.remove();
      };
      requestAnimationFrame(drift);
    };
    requestAnimationFrame(step);
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
    this.renderLog();          // the event log lives on this page now
    const days = String(window.Backend ? Backend.autosaveDays : 2);
    for (const b of this.el('setCadence').querySelectorAll('.abtn'))
      b.classList.toggle('sel', b.dataset.v === days);
    const idBox = this.el('setIdentity');
    idBox.textContent = window.Backend && Backend.uid
      ? 'Your village: ' + Backend.villageName(Backend.uid) : 'cloud saves not connected';
    if (window.Backend && Backend.isReady())
      Backend.getProfile().then(r => {
        if (r.ok && r.data && r.data.chief_name) this.el('chiefInput').value = r.data.chief_name;
      });
  },

  /* ---------------- pause ---------------- */
  onPaused() {
    this.backTo = 'paused';
    if (window.S) S.paused = true;
    // the world's name lives under the plaque — the pause menu is where a
    // player asks "where am I again?"
    const wn = this.worldLabel();
    this.el('pauseWorld').textContent = wn ? '🗺 ' + wn : '';
    const q = this.el('btnQuitTitle');
    q.textContent = 'Quit to title';
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
  doomResign() { this.resign(true); },
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
    G.end(false, 'You struck your banner and left the valley.');
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
    this._demo = false;   // force a fresh demo world
    this.show('title');
  },

  /* ---------------- endgame: the arcade tally ---------------- */
  showEnd(win, msg) {
    this.show('endgame', { win, msg });
  },
  onEndgame(opts) {
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
      this._score = null; this._submitted = false; this._leaveWarned = false;
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

  /* victories go to the global board AUTOMATICALLY — no button press. The
     chief's saved arcade name posts the run the moment the tally lands. The
     name row only surfaces when there's no name on file yet (the one time a
     Save is still needed), or if the auto-post can't reach the board. */
  _offerSubmit() {
    if (!window.Backend || !Backend.isReady() || this._submitted) return;
    const inp = this.el('arcadeName');
    Backend.getProfile().then(r => {
      const saved = r.ok && r.data && r.data.arcade_name;
      if (saved) { if (!inp.value) inp.value = saved; this.submitScore(saved); }
      else this._promptName('Name your chief to put this score on the board');
    }).catch(() => this._promptName('Name your chief to put this score on the board'));
  },

  // reveal the name + Save row (prefilled name kept), with a one-line note
  _promptName(msg) {
    this.el('nameRow').style.display = 'flex';
    const btn = this.el('btnSubmitScore');
    btn.textContent = '💾 Save score'; btn.classList.remove('cant');
    if (msg) {
      const note = this.el('savedNote');
      note.textContent = msg; note.style.color = 'var(--dim)'; note.style.display = 'block';
    }
  },

  // auto === the saved name for the automatic post; a manual Save reads the box
  async submitScore(auto) {
    if (this._submitted || !this._score) return;
    const chk = Score.cleanName(auto || this.el('arcadeName').value);
    if (!chk.ok) {
      if (auto) this._promptName('Name your chief to put this score on the board');
      else UI.toast(chk.why, true);
      return;
    }
    const btn = this.el('btnSubmitScore');
    if (!auto) { btn.textContent = '…'; btn.classList.add('cant'); }
    // idempotent: never double-post the same run — reopening a finished
    // victory, or an auto-post that already landed, just shows the board
    let already = false;
    const pre = await Backend.topScores(50);
    if (pre.ok) already = pre.data.some(x =>
      x.name === chk.name && x.score === this._score.total && x.mode === S.mode);
    if (!already) {
      const sub = await Backend.submitScore(chk.name, {
        score: this._score.total, mode: S.mode, day: S.day, seed: S.seed,
      });
      if (!sub.ok) {
        if (auto) this._promptName('Couldn’t reach the board — tap Save to try again');
        else { btn.textContent = '💾 Save score'; btn.classList.remove('cant');
          UI.toast('Could not reach the board: ' + sub.error.message, true); }
        return;
      }
    }
    this._submitted = true;
    this.el('nameRow').style.display = 'none';
    const note = this.el('savedNote');
    note.style.color = '';
    note.textContent = `✓ On the board as ${chk.name.toUpperCase()} — safe to leave`;
    note.style.display = 'block';
    const top = await Backend.topScores(10);
    if (top.ok) {
      const mine = top.data.findIndex(r =>
        r.name === chk.name && r.score === this._score.total);
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
      UI.toast(mine >= 0 ? 'You made the board, chief!' : 'Score on the board');
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
    on('ldrBack', () => this.show(this.backTo === 'paused' ? 'paused' : 'title'));
    on('btnSubmitScore', () => this.submitScore());
    on('btnTitleSettings', () => { this.backTo = 'title'; this.show('settings'); });
    on('btnTitleHow', () => { this.backTo = 'title'; this.show('howto'); });
    for (const id of ['ngBack', 'loadBack', 'setBack', 'howBack'])
      on(id, () => this.show(this.backTo === 'paused' ? 'paused' : 'title'));
    // the difficulty cards — the only choice a new game asks for
    this.el('ngMode').querySelectorAll('.dcard').forEach(b => b.addEventListener('click', () => {
      this.newPrefs.mode = b.dataset.v;
      this.onNewgame();
    }));
    on('btnStart', () => this.startNewGame());
    // the origin draft — keeping a card starts the game (see draftTap;
    // that is also the tutorial's one entry point now)
    on('btnTutToggle', () => {
      let v = false;
      try { v = localStorage.getItem('neo-tutorial-ask') === '1'; } catch (e) {}
      try { localStorage.setItem('neo-tutorial-ask', v ? '0' : '1'); } catch (e) {}
      this.syncTutToggle();
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
    const leaveEnd = (go) => {
      if (this._score && this._score.win && !this._submitted &&
          window.Backend && Backend.isReady() && !this._leaveWarned) {
        this._leaveWarned = true;
        UI.toast('Name your chief to put this score on the board — or tap again to leave', true, 4200);
        return;
      }
      go();
    };
    const goNew = () => leaveEnd(() => { this.backTo = 'title'; this.show('newgame'); });
    const goTitle = () => leaveEnd(() => { this._demo = false; this.show('title'); });
    on('btnVicScore', () => this.openTally());   // "A New Dawn" victory buttons
    on('btnScoreBack', () => this.closeTally());
    on('btnVicAgain', goNew);
    on('btnVicTitle', goTitle);
    on('btnDefeatAgain', goNew);     // "The Last Fire" defeat buttons — same actions
    on('btnDefeatTitle', goTitle);
    // settings — the cadence is a segmented row now, same idiom as the
    // new-game pickers, so it reads as a game option instead of a form field
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
          G.loadJSON(rd.result);
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
