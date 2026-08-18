/* ============================= THE TUTORIAL =============================
   (tests/tutorial.mjs) Two playtesters could not find the game under the
   interface, so the game teaches itself now. Everything here is DATA-DRIVEN:
   STEPS is phase 1's ordered spine (welcome → the four resources → the first
   works → the greater hall), EVENTS is everything contextual — notes that
   fire when the thing they explain first exists, in phase 1 and quietly on
   into phase 2. All copy lives in Tutorial.TEXT and nowhere else.

   THE CONTRACT, in order of importance:
   - ZERO COST WHEN OFF. Everything gates on `S.tut && S.tut.on` at the
     G.frame call site; no DOM, no listeners, no per-frame work exists until
     a run actually opts in (the checkbox on the Origin Card screen).
   - IT NEVER TAKES CONTROL. Input is never blocked, no button is disabled,
     the one camera pan is short (~0.45s) and any touch cancels it. While a
     note is up the sim runs SLOW (×0.2), never paused — chosen over a pause
     because a frozen world reads as a broken game on a phone — and a touch
     on the canvas 800ms after the note appears releases full speed (the
     player is playing; don't fight them).
   - OUT-OF-ORDER TOLERANCE. Every later step's advance condition is scanned
     in the background; do a thing before you're told and the telling is
     skipped. Conditions are therefore STATELESS reads of S, never counters
     captured at show time.
   - IT RIDES IN THE SAVE. S.tut carries phase / done / fired / the scout's
     schedule; everything else (DOM refs, pan lerp, throttles) lives on this
     module and is reset by onWorldChange() from newGame/loadJSON — the same
     rule R.collapses and G._dying follow.
   - THE SCRIPTED SCOUT never touches G.rand (a draw would re-deal the seeded
     stream): its day hashes off the seed string (the G.rollWonder rule) and
     its ride is fixed geometry. It spawns with u.strat = 'strike' so
     Combat.acquire skips it and it retaliates at nobody — a rider that only
     looks. u.scouting keeps the rival AI's defend-stamp off its back; the
     steer re-asserts its route every ~0.7s against anything else that grabs
     it, and it despawns after its ride or 2 days, whichever comes first.  */
'use strict';

const Tutorial = {
  /* ---- transient state (never saved; onWorldChange resets all of it) ---- */
  simScale: 1,        // read by G.frame; 0.2 while a note is up and unreleased
  SLOW: 0.2,
  BREATH: 1.0,        // quiet seconds between one note answered and the next
                      // appearing — instant chaining read as being rushed
  _dom: false,        // overlay elements exist
  _show: null,        // {kind:'step'|'event', id} currently displayed
  _shownAt: 0,        // performance.now() when it appeared
  _released: false,   // player touched the world → full speed again
  _advT: 0, _evT: 0,  // check throttles (s)
  _gapT: 0,           // the breath: seconds left before the next note may show
  _pan: null,         // eased camera glide toward an offscreen anchor
  _memo: {},          // per-step anchor memos (nearest-tile scans, 1s ttl)
  _skipArm: 0,        // two-tap skip confirm (performance.now deadline)
  _lastEvAt: -1e9,    // real-time spacing between contextual notes — NEVER 0,
                      // or the gate blocks the first 25s of every page load

  /* ======================= COPY — edit it HERE ======================
     One entry per step/event id. ≤2 short sentences, the game's own voice.
     A function entry is called at show time (dynamic bits like the rival's
     tunic colour). Simple <b> emphasis is allowed — these strings are
     authored here and nowhere else. */
  TEXT: {
    welcome: 'This hall is your <b>Town Center</b> — the heart of the tribe. Lose it and the story ends; everything is built outward from here.',
    resources: '<b>Food, wood, stone, gold</b> — the row up top is everything your people hold. They eat every day, so food comes first.',
    tapVillager: 'Tap one of your <b>villagers</b> to select them. Every pair of hands can gather, build and mend.',
    gatherWood: 'With a villager selected, tap a <b>stand of trees</b>. They will walk over and take wood from it.',
    gatherFood: 'Send a villager to the <b>orchards and berries</b> for food. They can also fish where shoals jump near shore — and farms come later.',
    gatherStone: 'Hills of <b>loose rock</b> yield stone — send a hand to break some out. The great mountains are walls, not quarries; nothing walks through them.',
    gold: 'Your hall trickles a little <b>gold</b> each day. Gold seams lie far out in wild country — rich, and held by whoever dares.',
    train: 'Tap your Town Center and <b>train a new villager</b>. Hands are the tribe’s real wealth — keep food ahead of mouths.',
    house: 'Open the <b>Build</b> menu and raise a <b>House</b>. Each roof shelters four more of your people.',
    fog: 'All that <b>darkness</b> is land your people have not walked yet — and it is not empty: wild bands and beasts roam it. Scout carefully, and don’t send anyone far alone.',
    tcPath: 'The hall rises on the town’s shoulders: finish <b>three buildings</b> at its level and it may take a second storey.',
    winCond: () => (S.peace
      ? 'Two roads to victory: raze the rival’s hall, or raise the <b>Ancient Wonder</b> and win without a war. The rival is racing for their own.'
      : 'To win, <b>raze the rival’s Town Center</b>. They build, arm and grow bolder with every season — so should you.'),
    tcReady: 'Your town can carry a greater hall now. Tap the Town Center and start the <b>upgrade</b>.',
    capstone: 'A second storey stands — your tribe is no longer small. The tutorial ends here; a few more notes will come as you unlock new works.',
    /* contextual notes */
    scout: () => 'A rider in <b>' + G.tunicOf('A') + '</b> — the rival tribe’s scout, sizing you up. They grow stronger with every season you give them.',
    neutrality: 'The rival keeps the <b>peace</b> for now — neither side strikes until you do. Race them in quiet, or start the war yourself.',
    workedGround: 'Ground worked bare can carry a <b>station</b> — a Lumber Camp on stumps, a Quarry on broken rock, a Farm on spent soil. Each is built from <b>other</b> goods: a camp costs stone, a quarry wood.',
    station: 'A station only pays while hands <b>work</b> it. Tap a villager, then the plot, to put them on.',
    military: 'Spears from the <b>Barracks</b>, bows from the Range, riders from the Stable, engines from the Workshop. Spears hold, bows reach, riders run down bows — no one arm wins alone.',
    defense: '<b>Walls</b> turn a raid and <b>towers</b> make it bleed — even a short line across a narrow place buys the town time. Tap a wall section to build a <b>gate</b> through it.',
    dock: 'That water can work for you — a <b>Dock</b> trains fishing boats, and transports to carry your people across.',
    sapperE: 'The <b>Sappers’ Camp</b> trains engineers who reshape the land — trenches, causeways, bridges over water. The map itself is a weapon.',
    trade: 'The <b>Trading Post</b> turns surplus into anything else — dearly. When the stone runs out, it is often the only stone there is.',
    siegePractice: 'Walls fall to <b>engines</b>, not to swords. Catapults outrange towers; keep foot soldiers between your guns and the gate.',
    defensePractice: 'A wall is only as strong as its <b>line</b> — close the gaps, and put a tower where it sees the road in. Tap a wall section to build a gate through it.',
    winNudgeWar: 'Your war camp is strong. When you march, bring <b>engines</b> for their walls and spears to screen them — and strike the hall, not the stones.',
    winNudgeWonder: 'Your town is rich and the land is quiet. The <b>Ancient Wonder</b> waits in your build menu — raise it and win without a war.',
    mortality: 'A villager has died — age, mischance, the usual ways of the world. Their <b>post stands empty</b>; send another pair of hands.',
  },

  /* ---- small shared reads ---- */
  _tc() { return S.buildings.find(b => b.owner === 'P' && b.key === 'tc'); },
  _stationKeys: { farm: 1, lumber: 1, quarry: 1, lodge: 1, mine: 1 },
  _gatherOn(terr) {
    return S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'gather' &&
      S.map.terrain[MapGen.idx(u.task.x, u.task.y)] === terr);
  },
  // nearest EXPLORED tile of a terrain set to the hall — memoized ~1s, since
  // it is a whole-map scan and anchors resolve every frame
  _nearTile(key, terrs) {
    const m = this._memo[key];
    const now = performance.now();
    if (m && now - m.t < 1000) return m.v;
    const tc = this._tc();
    let best = null, bd = 1e9;
    if (tc) {
      const cx = tc.x + 1, cy = tc.y + 1, terr = S.map.terrain, ex = S.map.explored;
      for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
        const i = y * CFG.W + x;
        if (!ex[i] || terrs.indexOf(terr[i]) < 0) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5, r: 0.9 }; }
      }
    }
    this._memo[key] = { t: now, v: best };
    return best;
  },

  /* ================== PHASE 1 — the ordered spine ==================
     { id, anchor?, when?, adv?, end? } — an entry with adv is action-gated;
     one without is an info note and carries the Got-it button. `when` holds
     the step silently until it is true (the world runs at full speed while
     nothing is on show). Anchors: {x,y,r} in tiles, {u:id} a tracked unit,
     {sel:'#css'} a UI element, or null. */
  STEPS: [
    { id: 'welcome',
      anchor() { const tc = Tutorial._tc(); return tc && { x: tc.x + 1, y: tc.y + 1, r: 1.5 }; } },
    { id: 'resources', anchor: () => ({ sel: '#topbar' }) },
    { id: 'tapVillager',
      anchor() {
        const tc = Tutorial._tc(); if (!tc) return null;
        let best = null, bd = 1e9;
        for (const u of S.units) {
          if (u.owner !== 'P' || u.kind !== 'villager') continue;
          const d = (u.x - tc.x) * (u.x - tc.x) + (u.y - tc.y) * (u.y - tc.y);
          if (d < bd) { bd = d; best = u; }
        }
        return best && { u: best.id };
      },
      adv() {
        const s = UI.sel; if (!s) return false;
        const own = id => { const u = Units.get(id); return !!(u && u.owner === 'P' && u.kind === 'villager'); };
        return s.type === 'unit' ? own(s.id) : s.type === 'group' ? s.ids.some(own) : false;
      } },
    { id: 'gatherWood',
      anchor: () => Tutorial._nearTile('gatherWood', [T.FOREST]),
      adv: () => Tutorial._gatherOn(T.FOREST) },
    { id: 'gatherFood',
      anchor: () => Tutorial._nearTile('gatherFood', [T.FERTILE]),
      adv: () => Tutorial._gatherOn(T.FERTILE) ||
        S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'fish') },
    { id: 'gatherStone',
      anchor: () => Tutorial._nearTile('gatherStone', [T.HILLS]),
      adv: () => Tutorial._gatherOn(T.HILLS) },
    { id: 'gold', anchor: () => ({ sel: '#rGold' }) },
    // the house comes BEFORE training on purpose: a start package can open at
    // the population cap, and a train order refused for room would deadlock
    // the spine — a roof always buys the room the next order needs
    { id: 'house',
      // point at the HOUSE CARD itself while the menu is open; only a closed
      // menu falls back to ringing the toggle that opens it
      anchor() {
        const btn = document.querySelector('.bbtn[data-key="house"]');
        if (btn && btn.offsetParent !== null) return { sel: '.bbtn[data-key="house"]' };
        return { sel: '#bmToggle' };
      },
      adv: () => S.buildings.some(b => b.owner === 'P' && b.key === 'house') },
    { id: 'train',
      anchor() { const tc = Tutorial._tc(); return tc && { x: tc.x + 1, y: tc.y + 1, r: 1.5 }; },
      adv: () => S.stats.trained > 0 ||
        S.buildings.some(b => b.owner === 'P' && b.queue && b.queue.length > 0) },
    // the fog lesson BORROWS THE CAMERA: with the town filling the screen the
    // "darkness" it names is nowhere in sight and the note reads as abstract —
    // so it glides the zoom out until the black edges show, and hands the
    // zoom back when answered. Any touch cancels both (the player's camera).
    { id: 'fog', anchor: null, zoomOut: true },
    { id: 'tcPath',
      anchor() { const tc = Tutorial._tc(); return tc && { x: tc.x + 1, y: tc.y + 1, r: 1.5 }; } },
    { id: 'winCond', anchor: null },
    { id: 'tcReady',
      when() { const tc = Tutorial._tc(); return !!tc && tc.level === 1 && !(tc.upgrading > 0) &&
        Bld.tcSupport(tc) >= Bld.TC_SUPPORT; },
      anchor() { const tc = Tutorial._tc(); return tc && { x: tc.x + 1, y: tc.y + 1, r: 1.5 }; },
      adv() { const tc = Tutorial._tc(); return !!tc && (tc.upgrading > 0 || tc.level >= 2); } },
    { id: 'capstone', end: true,
      when() { const tc = Tutorial._tc(); return !!tc && tc.level >= 2; },
      anchor() { const tc = Tutorial._tc(); return tc && { x: tc.x + 1, y: tc.y + 1, r: 1.5 }; } },
  ],

  /* ================== CONTEXTUAL NOTES (both phases) ==================
     One-shot, in array order of priority, spaced ≥25s apart so they never
     stack. `when` decides everything (including which phase they can occur
     in); an entry with adv is action-gated like a step. */
  EVENTS: [
    { id: 'scout', urgent: true,   // it is on screen NOW — the one note that preempts a step
      when() { const u = Tutorial._scout(); return !!u && G.visibleAt(u.x | 0, u.y | 0); },
      anchor() { const u = Tutorial._scout(); return u && { u: u.id }; } },
    { id: 'neutrality',
      when: () => !!S.peace && !!S.tut.fired.scout, anchor: null },
    { id: 'workedGround',
      when() {
        const terr = S.map.terrain, ex = S.map.explored;
        for (let i = 0; i < terr.length; i++)
          if (ex[i] && (terr[i] === T.STUMPS || terr[i] === T.PEBBLES || terr[i] === T.BARREN)) return true;
        return false;
      },
      anchor: () => Tutorial._nearTile('workedGround', [T.STUMPS, T.PEBBLES, T.BARREN]),
      adv: () => S.buildings.some(b => b.owner === 'P' && Tutorial._stationKeys[b.key]) },
    { id: 'station',
      when: () => S.buildings.some(b => b.owner === 'P' && Tutorial._stationKeys[b.key] && !(b.construction > 0)),
      anchor() {
        const b = S.buildings.find(o => o.owner === 'P' && Tutorial._stationKeys[o.key] && !(o.construction > 0));
        return b && { x: b.x + 0.5, y: b.y + 0.5, r: 0.9 };
      },
      adv: () => S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'work') },
    { id: 'military',
      when() {
        if (S.buildings.some(b => b.owner === 'P' &&
          (b.key === 'barracks' || b.key === 'range' || b.key === 'stable' || b.key === 'siege'))) return true;
        const c = ((CFG.BUILDINGS.barracks.levels[0] || {}).cost || {});
        return S.day >= 7 && S.res.wood >= (c.wood || 0) && S.res.food >= (c.food || 0);
      }, anchor: () => ({ sel: '#bmToggle' }) },
    { id: 'defense', when: () => !!S.tut.fired.military && S.day >= 9, anchor: null },
    { id: 'dock',
      when() {
        const tc = Tutorial._tc(); if (!tc || tc.level < 2) return false;
        const m = Tutorial._memo.dockWater;
        if (m !== undefined) return m;
        let found = false;
        for (let dy = -12; dy <= 12 && !found; dy++) for (let dx = -12; dx <= 12; dx++) {
          const x = tc.x + 1 + dx, y = tc.y + 1 + dy;
          if (MapGen.onBoard(x, y) && S.map.terrain[MapGen.idx(x, y)] === T.WATER) { found = true; break; }
        }
        return (Tutorial._memo.dockWater = found);
      }, anchor: null },
    { id: 'sapperE', when() { const tc = Tutorial._tc(); return !!tc && tc.level >= 2; }, anchor: null },
    { id: 'trade', when() { const tc = Tutorial._tc(); return !!tc && tc.level >= 3; }, anchor: null },
    { id: 'siegePractice',
      when() {
        if (S.buildings.some(b => b.owner === 'P' && b.key === 'siege')) return true;
        if (S.units.some(u => u.owner === 'P' && Units.isSiege && Units.isSiege(u))) return true;
        for (const k in S.map.seenB) {
          const sb = S.map.seenB[k];
          if (sb && sb.owner === 'A' && (sb.key === 'wall' || sb.key === 'gate' || sb.key === 'tower')) return true;
        }
        return false;
      }, anchor: null },
    { id: 'defensePractice',
      when: () => S.stats.walls > 0 || S.buildings.some(b => b.owner === 'P' && b.key === 'wall'),
      anchor: null },
    { id: 'winNudge',
      when() {
        const mil = S.units.filter(u => u.owner === 'P' && Units.isMilitary && Units.isMilitary(u)).length;
        if (mil >= 8) { S.tut.nudge = 'war'; return true; }
        const tc = Tutorial._tc();
        if (S.peace && tc && tc.level >= 2 && UI.wonderOffered && UI.wonderOffered() &&
            S.buildings.filter(b => b.owner === 'P' && Tutorial._stationKeys[b.key]).length >= 5) {
          S.tut.nudge = 'wonder'; return true;
        }
        return false;
      },
      text: () => Tutorial.TEXT[S.tut.nudge === 'wonder' ? 'winNudgeWonder' : 'winNudgeWar'],
      anchor: null },
    { id: 'mortality', when: () => !!(S.tut.noted && S.tut.noted.mortality), anchor: null },
  ],

  /* ======================= lifecycle ======================= */
  // Screens' Begin-after-the-draft button calls this — the ONLY entry point,
  // so a loaded save or the title demo can never start a tutorial by accident
  maybeStart() {
    if (!window.S || S.tut || (window.Screens && Screens._demo)) return;
    let on = false;
    try { on = localStorage.getItem('neo-tutorial-ask') === '1'; } catch (e) {}
    if (!on) return;
    // the scout's day: 9–13, hashed off the seed string so it is fixed for
    // the run and never draws from the seeded RNG (the G.rollWonder rule)
    let h = 0; const s = String(S.seed) + '::tutscout';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    S.tut = { on: true, phase: 1, step: 0, done: {}, fired: {},
              scoutDay: 9 + (Math.abs(h) % 5), scoutSpawned: 0, scoutId: 0, scoutLeg: 0 };
  },

  // from G.newGame and G.loadJSON: the world was replaced — drop every piece
  // of transient state so nothing (a pan, a memo, a shown note) leaks across
  onWorldChange() {
    this.simScale = 1;
    this._show = null; this._pan = null; this._zRestore = 0; this._memo = {};
    this._advT = this._evT = this._gapT = 0; this._skipArm = 0; this._lastEvAt = -1e9;
    this._removeDom();
  },

  // a mid-game hook (tickMortality) pushes what a stateless scan can't see
  note(id) {
    if (!window.S || !S.tut || !S.tut.on) return;
    (S.tut.noted || (S.tut.noted = {}))[id] = 1;
  },

  skip() {
    if (!window.S || !S.tut) return;
    S.tut.on = false; S.tut.skipped = true;
    this._killScout();
    this.onWorldChange();   // removes the DOM, restores full speed
  },

  /* ======================= the frame tick =======================
     Called from G.frame only while S.tut.on — see the call site guard. */
  tick(dt) {
    if (!window.S || !S.tut || !S.tut.on) return;   // belt and braces — the call site gates too
    if (S.over) { this.simScale = 1; this._hideAll(); return; }
    this._scoutTick(dt);
    if (this._gapT > 0) this._gapT -= dt;   // the breath between notes
    this._advT -= dt;
    if (this._advT <= 0) { this._advT = 0.15; this._scanSteps(); }
    // THE SPINE HAS RIGHT OF WAY: contextual notes fill the quiet stretches
    // (a held step, phase 2) rather than shoving the lesson aside — except
    // the scout, which is on screen RIGHT NOW and won't wait
    this._updateDisplay();
    this._evT -= dt;
    if (this._evT <= 0) { this._evT = 0.5; this._checkEvents(); }
    this._syncOverlay(dt);
    // SLOW, never stopped: ×0.2 while a note is up, full speed once it is
    // answered or the player touches the world 800ms+ after it appeared
    this.simScale = (this._show && !this._released) ? this.SLOW : 1;
  },

  /* ---- the ordered spine: background satisfaction + the pointer ---- */
  _scanSteps() {
    const t = S.tut;
    if (t.phase !== 1) return;
    // a shown step whose hold-condition lapsed (the hall fell, the support
    // count dropped) goes quietly back to waiting
    if (this._show && this._show.kind === 'step') {
      const def = this.STEPS.find(s => s.id === this._show.id);
      if (def && def.when && !def.when()) { this._show = null; this._hideAll(); }
    }
    // THE LESSON'S FIRST HOUSE IS RAISED IN A BLINK: the house step leads
    // straight into training, and training needs the roof FINISHED for the
    // room it grants — waiting out a real build read as the tutorial
    // stalling. One house only, and only the one the lesson asked for
    // (a start-package house that satisfied the step early earns nothing);
    // every later house builds at its real pace. Runs BEFORE the adv scan,
    // so the site the player just laid is finished before the step books it.
    if (!t.houseGiven && !t.done.house) {
      const site = S.buildings.find(b => b.owner === 'P' && b.key === 'house' && b.construction > 0);
      if (site) { t.houseGiven = 1; Bld.finish(site); }
    }
    // OUT-OF-ORDER: anything already done in the world is done in the book
    for (let i = t.step; i < this.STEPS.length; i++) {
      const st = this.STEPS[i];
      if (!t.done[st.id] && st.adv && st.adv()) {
        t.done[st.id] = 1;
        if (this._show && this._show.kind === 'step' && this._show.id === st.id) {
          UI.cue('ok'); this._show = null;
          this._gapT = this.BREATH;   // a beat before the next note appears
        }
      }
    }
    while (t.step < this.STEPS.length && t.done[this.STEPS[t.step].id]) t.step++;
  },

  _checkEvents() {
    const t = S.tut;
    if (this._show && this._show.kind === 'event') {
      // an action-gated note completes itself the moment the deed is done
      const ev = this.EVENTS.find(e => e.id === this._show.id);
      if (ev && ev.adv && ev.adv()) this._completeShow();
      return;
    }
    if (this._gapT > 0) return;                               // the breath holds here too
    if (performance.now() - this._lastEvAt < 25000) return;   // never stack notes
    for (const ev of this.EVENTS) {
      if (t.fired[ev.id]) continue;
      if (this._show && !ev.urgent) continue;   // a step is on show — wait for a quiet moment
      let ok = false;
      try { ok = !!ev.when(); } catch (e) {}
      if (!ok) continue;
      this._present('event', ev.id);
      return;
    }
  },

  /* ---- what is on show right now ---- */
  _updateDisplay() {
    if (this._show) return;                       // one thing at a time
    if (this._gapT > 0) return;                   // let the last one land first
    const t = S.tut;
    if (t.phase !== 1 || t.step >= this.STEPS.length) return;   // phase 2 is events-only
    const st = this.STEPS[t.step];
    if (st.when && !st.when()) return;            // held — the world runs free
    this._present('step', st.id);
  },

  _present(kind, id) {
    this._show = { kind, id };
    this._shownAt = performance.now();
    this._released = false;
    this._skipArm = 0;
    if (kind === 'event') this._lastEvAt = this._shownAt;
    this._ensureDom();
    const def = this._defOf();
    const src = (def && def.text) || this.TEXT[id];
    this._el.txt.innerHTML = typeof src === 'function' ? src() : (src || '');
    // action-gated notes advance themselves; info notes carry the button
    const info = !(def && def.adv);
    this._el.next.style.display = info ? '' : 'none';
    this._el.next.textContent = id === 'capstone' ? 'Onward' : 'Got it';
    if (kind === 'step' && S.tut.phase === 1) {
      const n = this.STEPS.findIndex(s => s.id === id);
      this._el.num.textContent = (n + 1) + '/' + this.STEPS.length;
    } else this._el.num.textContent = '';
    // glide to a world anchor the player can't currently see — or, for the
    // fog lesson, glide the ZOOM out until the unexplored dark is in frame
    if (def && def.zoomOut) { this._zoomToFog(); return; }
    const a = this._anchor();
    if (a && a.u !== undefined) { const u = Units.get(a.u); if (u) this._panTo(u.x, u.y); }
    else if (a && a.x !== undefined) this._panTo(a.x, a.y);
  },

  // widen the view until the explored ground plus a band of fog fits on
  // screen, centered on the hall; remember the zoom so the answered note can
  // hand it back. Only ever zooms OUT, never past the pinch floor (0.5).
  _zoomToFog() {
    const tc = this._tc();
    if (!tc) return;
    const ex = S.map.explored;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
      if (ex[y * CFG.W + x]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    if (x1 < 0) return;
    const M = 5;   // tiles of darkness shown beyond the known ground
    const bw = (x1 - x0 + 1 + M * 2) * CFG.TILE;
    const bh = (y1 - y0 + 1 + M * 2) * CFG.TILE;
    const usableH = Math.max(160, R.viewH() - (R.topReserve || 0) - (R.bottomReserve || 0));
    let tz = Math.min(R.viewW() / bw, usableH / bh);
    tz = Math.max(0.5, Math.min(R.cam.z, tz));
    if (tz >= R.cam.z - 0.02) return;   // the dark is already in frame
    this._zRestore = R.cam.z;
    this._pan = { t: 0, dur: 0.6, cx: tc.x + 1, cy: tc.y + 1, sz: R.cam.z, tz };
  },

  _defOf() {
    if (!this._show) return null;
    return this._show.kind === 'step'
      ? this.STEPS.find(s => s.id === this._show.id)
      : this.EVENTS.find(e => e.id === this._show.id);
  },

  // Got-it / a satisfied action: book it, chime, move on
  _completeShow() {
    const sh = this._show; if (!sh) return;
    const t = S.tut;
    if (sh.kind === 'event') t.fired[sh.id] = 1;
    else {
      t.done[sh.id] = 1;
      const def = this._defOf();
      if (def && def.end) t.phase = 2;   // the capstone: phase 1 is complete
      while (t.step < this.STEPS.length && t.done[this.STEPS[t.step].id]) t.step++;
    }
    UI.cue('ok');
    this._show = null;
    this._gapT = this.BREATH;   // a beat before the next note appears
    // a note that borrowed the zoom hands it back on its way out
    if (this._zRestore) {
      const tc = this._tc();
      if (tc) this._pan = { t: 0, dur: 0.6, cx: tc.x + 1, cy: tc.y + 1, sz: R.cam.z, tz: this._zRestore };
      this._zRestore = 0;
    }
    this._hideAll();
    // guidance has run its course → go fully cold (zero further cost)
    if (t.phase === 2 && (S.day > 150 || this.EVENTS.every(e => t.fired[e.id]))) {
      t.on = false; t.completed = true;
      this.onWorldChange();
    }
  },

  /* ======================= the scripted scout ======================= */
  _scout() { return (S.tut.scoutId && S.units.find(u => u.id === S.tut.scoutId)) || null; },
  _killScout() {
    const u = this._scout();
    if (u) Units.despawn(u);
    if (S.tut) S.tut.scoutId = 0;
  },
  _scoutTick(dt) {
    const t = S.tut;
    if (t.phase !== 1 && !t.scoutSpawned) return;     // never spawns into phase 2
    if (!t.scoutSpawned) {
      if (S.day < t.scoutDay) return;
      t.scoutSpawned = 1;
      this._spawnScout();
      return;
    }
    const u = this._scout();
    if (!u) { t.scoutId = 0; return; }
    if (S.day > t.scoutDay + 2) { this._killScout(); return; }   // overstayed — ride off
    this._steerT = (this._steerT || 0) - dt;
    if (this._steerT > 0) return;
    this._steerT = 0.7;
    const legs = this._scoutLegs(); if (!legs) { this._killScout(); return; }
    if (t.scoutLeg >= legs.length) { this._killScout(); return; }
    const g = legs[t.scoutLeg];
    const d = Math.hypot(u.x - g.x, u.y - g.y);
    if (d < 1.6) { t.scoutLeg++; return; }
    // the steer OWNS this unit: shake off anything else that grabbed it,
    // then re-assert the leg (a failed path skips the leg rather than parking)
    u.tUnit = 0; u.tBld = 0; u.strat = 'strike'; u.assault = false;
    const marching = u.task && u.task.type === 'move' &&
      u.path && u.pathI < u.path.length;
    if (!marching && !Units.moveTo(u, g.x | 0, g.y | 0)) t.scoutLeg++;
  },
  _spawnScout() {
    const tc = this._tc(), sp = S.map.spawns;
    if (!tc || !sp || !sp.ai) return;
    const cx = tc.x + 1, cy = tc.y + 1;
    let dx = sp.ai.x - cx, dy = sp.ai.y - cy;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    // entry: the first passable tile walking IN from ~15 tiles out toward town
    let at = null;
    for (let r = 15; r >= 8; r--) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (MapGen.onBoard(x, y) && Path.passable(x, y, 'A')) { at = { x, y }; break; }
    }
    if (!at) { S.tut.scoutSpawned = 1; return; }   // no road in — the note simply never fires
    const u = Units.spawn('rider', 'A', at.x, at.y);
    u.scouting = true;        // the rival AI's defend-stamp and busy filters pass it by
    u.tutScout = true;
    u.strat = 'strike';       // Combat.acquire skips it; it retaliates at nobody
    S.tut.scoutId = u.id;
    S.tut.scoutLeg = 0;
  },
  // the ride, as fixed geometry: in to the town's edge, one flanking sweep,
  // then back out the way it came
  _scoutLegs() {
    const tc = this._tc(), sp = S.map.spawns;
    if (!tc || !sp || !sp.ai) return null;
    const cx = tc.x + 1, cy = tc.y + 1;
    let dx = sp.ai.x - cx, dy = sp.ai.y - cy;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx;   // perpendicular — the flanking sweep
    const cl = (x, y) => ({ x: Math.max(1, Math.min(CFG.W - 2, x)), y: Math.max(1, Math.min(CFG.H - 2, y)) });
    return [
      cl(cx + dx * 5, cy + dy * 5),
      cl(cx + dx * 5 + px * 6, cy + dy * 5 + py * 6),
      cl(cx + dx * 14, cy + dy * 14),
    ];
  },

  /* ======================= overlay DOM ======================= */
  _el: null,
  _ensureDom() {
    if (this._dom) return;
    this._dom = true;
    const dim = document.createElement('div'); dim.id = 'tutDim';
    const ui = document.createElement('div'); ui.id = 'tutUI';
    ui.innerHTML =
      '<div id="tutRing"></div><div id="tutArrow">➤</div>' +
      '<div id="tutPanel"><div id="tutTxt"></div>' +
      '<div id="tutRow"><button class="abtn" id="tutNext">Got it</button>' +
      '<span id="tutNum"></span><button id="tutSkip">Skip tutorial</button></div></div>';
    document.body.appendChild(dim);
    document.body.appendChild(ui);
    this._el = {
      dim, ui,
      ring: ui.querySelector('#tutRing'), arrow: ui.querySelector('#tutArrow'),
      panel: ui.querySelector('#tutPanel'), txt: ui.querySelector('#tutTxt'),
      next: ui.querySelector('#tutNext'), num: ui.querySelector('#tutNum'),
      skip: ui.querySelector('#tutSkip'),
    };
    this._el.next.addEventListener('click', () => this._completeShow());
    this._el.skip.addEventListener('click', () => {
      const now = performance.now();
      if (now < this._skipArm) { this.skip(); return; }
      this._skipArm = now + 2600;
      this._el.skip.textContent = 'Tap again to skip';
      setTimeout(() => { if (this._el) this._el.skip.textContent = 'Skip tutorial'; }, 2600);
    });
    // a touch on the world 800ms after a note appears releases full speed —
    // and any touch cancels the camera glide (the player owns the camera)
    this._onPtr = e => {
      this._pan = null;
      this._zRestore = 0;   // the player took the camera — never yank it back
      if (this._show && performance.now() - this._shownAt > 800) this._released = true;
    };
    (R.cv || document.getElementById('c')).addEventListener('pointerdown', this._onPtr, { passive: true });
  },
  _removeDom() {
    if (!this._dom) return;
    this._dom = false;
    try { (R.cv || document.getElementById('c')).removeEventListener('pointerdown', this._onPtr); } catch (e) {}
    for (const id of ['tutDim', 'tutUI']) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
    this._el = null;
  },
  _hideAll() {
    if (!this._el) return;
    this._el.dim.style.display = 'none';
    this._el.ui.style.display = 'none';
  },

  _anchor() {
    const def = this._defOf();
    if (!def || !def.anchor) return null;
    try { return def.anchor(); } catch (e) { return null; }
  },

  /* ---- per-frame: spotlight, arrow and panel follow the live anchor ---- */
  _syncOverlay(dt) {
    if (!this._show) { this._hideAll(); return; }
    this._ensureDom();
    const el = this._el;
    el.ui.style.display = 'block';
    // the camera glide (cancelled by any touch) — a plain pan, or the fog
    // lesson's zoom, which re-centers on its point at every interpolated z
    if (this._pan) {
      const p = this._pan;
      p.t += dt / p.dur;
      const k = p.t >= 1 ? 1 : 1 - Math.pow(1 - p.t, 3);   // ease-out cubic
      if (p.tz !== undefined) {
        R.cam.z = p.sz + (p.tz - p.sz) * k;
        R.centerOn(p.cx, p.cy);                            // clamps itself
      } else {
        R.cam.x = p.sx + (p.tx - p.sx) * k;
        R.cam.y = p.sy + (p.ty - p.sy) * k;
        R.clampCam();
      }
      if (p.t >= 1) this._pan = null;
    }
    const a = this._anchor();
    let hole = null, offDir = null;
    if (a && a.sel) {
      const t = document.querySelector(a.sel);
      if (t && t.offsetParent !== null) {
        const r = t.getBoundingClientRect();
        hole = { x: r.left + r.width / 2, y: r.top + r.height / 2,
                 r: Math.max(r.width, r.height) / 2 + 8, rect: r };
      }
    } else if (a) {
      let wx = a.x, wy = a.y, rr = a.r || 0.8;
      if (a.u !== undefined) {
        const u = Units.get(a.u);
        if (u) { wx = u.x; wy = u.y; rr = 0.8; } else wx = undefined;
      }
      if (wx !== undefined) {
        const z = R.cam.z, TL = CFG.TILE;
        const sx = (wx * TL - R.cam.x) * z;
        const sy = (wy * TL - R.cam.y) * z - CFG.SPRITE_LIFT * z;
        const vw = R.viewW(), vh = R.viewH();
        if (sx > -20 && sx < vw + 20 && sy > -20 && sy < vh + 20) hole = { x: sx, y: sy, r: rr * TL * z };
        else offDir = { sx: Math.max(16, Math.min(vw - 16, sx)), sy: Math.max((R.topReserve || 0) + 26, Math.min(vh - 90, sy)),
                        ang: Math.atan2(sy - vh / 2, sx - vw / 2) };
      }
    }
    // the dim + ring around whatever the note points at. A UI target's hole
    // is a RECTANGLE hugging the element — the circle version, sized to a
    // bar's whole width, read as a giant half-circle clipped by the screen
    if (hole) {
      el.dim.style.display = 'block';
      el.ring.style.display = 'block';
      if (hole.rect) {   // a UI target keeps its own shape
        const pad = 6;
        el.dim.style.borderRadius = '12px';
        el.dim.style.left = (hole.rect.left - pad) + 'px';
        el.dim.style.top = (hole.rect.top - pad) + 'px';
        el.dim.style.width = (hole.rect.width + pad * 2) + 'px';
        el.dim.style.height = (hole.rect.height + pad * 2) + 'px';
        el.ring.style.borderRadius = '10px';
        el.ring.style.left = (hole.rect.left - 5) + 'px';
        el.ring.style.top = (hole.rect.top - 5) + 'px';
        el.ring.style.width = (hole.rect.width + 10) + 'px';
        el.ring.style.height = (hole.rect.height + 10) + 'px';
      } else {
        el.dim.style.borderRadius = '50%';
        el.dim.style.left = (hole.x - hole.r) + 'px';
        el.dim.style.top = (hole.y - hole.r) + 'px';
        el.dim.style.width = el.dim.style.height = hole.r * 2 + 'px';
        el.ring.style.borderRadius = '50%';
        el.ring.style.left = (hole.x - hole.r) + 'px';
        el.ring.style.top = (hole.y - hole.r) + 'px';
        el.ring.style.width = el.ring.style.height = hole.r * 2 + 'px';
      }
      el.arrow.style.display = 'none';
    } else {
      el.dim.style.display = 'none';
      el.ring.style.display = 'none';
      if (offDir) {   // the target walked offscreen: a chevron at the edge points after it
        el.arrow.style.display = 'block';
        el.arrow.style.left = (offDir.sx - 13) + 'px';
        el.arrow.style.top = (offDir.sy - 13) + 'px';
        el.arrow.style.transform = 'rotate(' + offDir.ang + 'rad)';
      } else el.arrow.style.display = 'none';
    }
    // the panel's seat: a UI target gets the card RIGHT BESIDE it (under the
    // resource bar, above the build-menu card — the note and the thing it
    // names read as one); a world target keeps the opposite-half rule so the
    // card never covers the spotlight
    const vh2 = window.innerHeight || R.viewH();
    if (hole && hole.rect) {
      if (hole.rect.top + hole.rect.height / 2 < vh2 * 0.5) {
        el.panel.style.top = (hole.rect.bottom + 12) + 'px'; el.panel.style.bottom = 'auto';
      } else {
        el.panel.style.bottom = (vh2 - hole.rect.top + 12) + 'px'; el.panel.style.top = 'auto';
      }
    } else {
      const topBar = document.getElementById('topbar');
      const botBar = document.getElementById('bottombar');
      const topPad = (topBar ? topBar.offsetHeight : 0) + 10;
      const botPad = (botBar ? botBar.offsetHeight : 0) + 10;
      const targetHigh = hole ? hole.y < vh2 * 0.48 : false;
      if (targetHigh) { el.panel.style.top = 'auto'; el.panel.style.bottom = botPad + 'px'; }
      else { el.panel.style.top = topPad + 'px'; el.panel.style.bottom = 'auto'; }
    }
  },

  _panTo(tx, ty) {
    if (R.onScreen(tx, ty)) return;   // already in view — the camera is the player's
    const z = R.cam.z, TL = CFG.TILE;
    this._pan = {
      t: 0, dur: 0.45,
      sx: R.cam.x, sy: R.cam.y,
      tx: tx * TL - R.viewW() / z / 2,
      ty: ty * TL - R.viewH() / z / 2,
    };
  },
};

window.Tutorial = Tutorial;
