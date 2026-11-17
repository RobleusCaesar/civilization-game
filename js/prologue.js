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
    // your people's tunic: the same roll a run takes (red stays the rival's)
    const pool = ((typeof Sprites !== 'undefined' && Sprites.villagerTunics) || ['blue']).filter(t => t !== 'red');
    const tunic = pool[(Math.random() * pool.length) | 0] || 'blue';
    Screens._demo = false;
    G.freeVis = false;
    const prev = R.deferBake; R.deferBake = true;   // the bake in slices behind the title, never a frozen press
    try { Scenarios.found(id, { tunic }); } finally { R.deferBake = prev; }
    R.holdBake = !(window.Assets && Assets.artReady && Assets.artReady());
    if (R.holdBake && Screens.waitForArt) { const w = S; Screens.waitForArt(Screens.GAME_ART_FLOOR_MS).then(() => { if (S === w) R.holdBake = false; }); }
    if (window.Backend) { try { Backend.markActiveSlot(null); Backend.activeName = null; } catch (e) {} }
    Screens.lastSavedDay = 1;
    G.updateVisibility();
    if (still) S.paused = true;   // nothing moves until BEGIN
    this._pre = S;
    this._warmGlide();
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
    this.found(g, true);
    this._pre = null;
    this._enterGame(g);
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
  isIdle(u) { return !u.task && !(u.path && u.path.length) && !(window.Units && Units.isLevied && Units.isLevied(u)); },
  // the nearest idle villager to the hall (idle hands strongly preferred), never one already busy if any is free
  idleVil() {
    const tc = this.tc(); let best = null, bd = 1e9;
    for (const u of this.vils()) {
      const d = (tc ? Math.hypot(u.x - tc.x - 1, u.y - tc.y - 1) : 0) - (this.isIdle(u) ? 1e6 : 0);
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
      if (UI.placing === key) {
        this._seatGhost(key, site);
        if (this.vis('#placeOk')) return { sel: '#placeOk' };
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
  need() {
    const b = this.beat(), tc = this.tc();
    let cost = null;
    if (b && b.id === 'house') cost = Bld.effCost('P', 'house');
    else if (b && b.id === 'train') cost = (CFG.UNITS.villager && CFG.UNITS.villager.cost) || null;
    else if (tc && CFG.BUILDINGS.tc.levels[tc.level]) cost = CFG.BUILDINGS.tc.levels[tc.level].cost;
    let best = null, bw = 0;
    for (const k of ['food', 'wood', 'stone']) {
      const c = cost && cost[k]; if (!c) continue;
      const w = 1 - Math.min(1, (S.res[k] || 0) / c);
      if (w > bw) { bw = w; best = k; }
    }
    return best || ((S.res.food || 0) < (S.res.wood || 0) ? 'food' : 'wood');
  },
  // what the standing goal asks of a good, in whole units (0 when it asks none)
  needOf(res) {
    const b = this.beat(), tc = this.tc();
    let cost = null;
    if (b && b.id === 'house') cost = Bld.effCost('P', 'house');
    else if (b && b.id === 'train') cost = (CFG.UNITS.villager && CFG.UNITS.villager.cost) || null;
    else if (tc && CFG.BUILDINGS.tc.levels[tc.level]) cost = CFG.BUILDINGS.tc.levels[tc.level].cost;
    return (cost && cost[res]) || 0;
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
  spareHand() {
    const need = this.need(), sel = this.selVil();
    if (sel && !this.onRes(sel, need)) return sel;
    const t = this.workFor({ x: (this.tc() ? Bld.cx(this.tc()) : CFG.W / 2), y: (this.tc() ? Bld.cy(this.tc()) : CFG.H / 2) }, need);
    let best = null, bd = 1e9;
    for (const u of this.vils()) {
      if (this.onRes(u, need) || (u.task && u.task.type === 'build')) continue;
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

  /* Each beat: { id, face, text, goal, when, done, auto, ring, taps, cheer, on, skipIf }
       text   the Elder's line (≤ 15 words, one instruction)
       goal   the tracker's objective (a string or a function), while the beat stands
       when   the beat is HELD (not shown) until this is true
       done   the beat completes (an action beat: no button, the deed answers it)
       auto   a celebration: shown for this many ms, then the next beat
       ring   the pulse's target: {x,y,r} tile-centred | {u:id} | {sel:'css'}
       taps   the idle hand's taps, in order (same shapes)
       cheer  on completion: this good flies from the deed to its counter
       on     done once, when the beat is first shown (an unlock, a raid)
       skipIf a beat with nothing to teach on this device is passed over */
  SCRIPTS: {
    1() {
      const P = this;
      return [
        { id: 'open', face: 'neutral', text: 'The old village is gone. Here we begin again. Send someone to gather berries.',
          goal: 'Gather berries', ring: P.sendTo('berries'), taps: P.sendTaps('berries'),
          done: () => (P._got.food || 0) >= 1, cheer: 'food' },
        { id: 'berries', face: 'pleased', text: 'Berries! Nobody goes hungry tonight.', auto: 3200 },
        { id: 'wood', face: 'neutral', text: 'Now send someone to cut wood.',
          goal: 'Cut wood', ring: P.sendTo('forest'), taps: P.sendTaps('forest'),
          done: () => (P._got.wood || 0) >= 1, cheer: 'wood' },
        { id: 'timber', face: 'pleased', text: 'Good, strong timber. We\'ll need it.', auto: 3000 },
        { id: 'house', face: 'neutral', text: 'We need a roof. Build a house beside the fire.',
          goal: () => P.afford('house') ? 'Build a house' : 'Gather wood for a house: ' + P.costLine('house'),
          when: () => P.afford('house') || P.has('house'),
          on: () => Scenarios.unlock('house'),
          ring: P.buildRing('house', 'houseSite'), taps: () => { const r = P.buildRing('house', 'houseSite')(); return r ? [r] : []; },
          done: () => P.has('house') },
        { id: 'home', face: 'pleased', text: 'A home! Now there\'s room for one more.', auto: 3200,
          when: () => P.has('house', true) },
        { id: 'train', face: 'neutral', text: 'Train a new villager at the hall.',
          goal: () => P.afford2('villager') ? 'Train a villager' : 'Gather food for a villager: Food ' + Math.floor(S.res.food || 0) + '/50',
          when: () => P.afford2('villager') || P.trained(),
          ring: P.hallRing('#panel [data-act="train"][data-unit="villager"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="train"][data-unit="villager"]')(); return r ? [r] : []; },
          done: () => P.trained() },
        { id: 'welcome', face: 'pleased', text: 'Welcome, little one!', auto: 2600,
          when: () => P.vils().length > P._n0 },
        { id: 'work', face: 'neutral', text: 'Give the newcomer some work.',
          goal: 'Put the newcomer to work',
          ring: () => { const n = P.newcomer(); if (!n) return null; return P.selVil() === n ? P.mark('forest') : { u: n.id }; },
          taps: () => { const n = P.newcomer(); return n ? [{ u: n.id }, P.mark('forest')].filter(Boolean) : []; },
          done: () => { const n = P.newcomer(); return !n || !!n.task; } },
        { id: 'grow', face: 'neutral', text: 'Now our hall must grow. Gather what it needs.',
          goal: () => 'Hall Lv 2: ' + P.hallNeeds(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); } },
        { id: 'raise', face: 'pleased', text: 'We have enough. Raise the hall!',
          goal: 'Raise the hall', ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="upgrade"]')(); return r ? [r] : []; },
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 2 || tc.upgrading > 0); } },
        // an upgrade rises only with hands on it (the game's rule): the Elder sends them
        { id: 'build', face: 'neutral', text: 'Send villagers to build it. Many hands, quick work.',
          goal: 'Send builders to the hall', ring: () => P.builderRing(), taps: () => P.builderTaps(),
          done: () => { const tc = P.tc(); return !tc || !(tc.upgrading > 0) || P.builders(tc).length > 0; } },
        { id: 'rising', face: 'pleased', text: 'Everyone helps. The hall is rising.', auto: 3200, goal: 'The hall is rising' },
      ];
    },
    2() {
      const P = this;
      return [
        { id: 'open', face: 'pleased', text: 'Welcome back, chief. Our clan has grown.', auto: 3200 },
        { id: 'stone', face: 'neutral', text: 'We need stone. Send someone to the grey rocks.',
          goal: 'Gather stone', ring: P.sendTo('stone'), taps: P.sendTaps('stone'),
          done: () => (P._got.stone || 0) >= 1, cheer: 'stone' },
        { id: 'stoneok', face: 'pleased', text: 'Good stone. Great halls are made of it.', auto: 3000 },
        { id: 'lumber', face: 'neutral', text: 'Old felled trees lie nearby. Build a lumber camp there.',
          goal: () => P.afford('lumber') ? 'Build a lumber camp' : 'Gather for a lumber camp: ' + P.costLine('lumber'),
          when: () => P.afford('lumber') || P.has('lumber'),
          on: () => Scenarios.unlock('lumber'),
          ring: P.buildRing('lumber', 'stumps'), taps: () => { const r = P.buildRing('lumber', 'stumps')(); return r ? [r] : []; },
          done: () => P.has('lumber') },
        { id: 'lumberok', face: 'pleased', text: 'A camp! Its workers bring wood without walking far.', auto: 3400,
          when: () => P.has('lumber', true) },
        { id: 'quarry', face: 'neutral', text: 'Now a quarry, on the broken rock.',
          goal: () => P.afford('quarry') ? 'Build a quarry' : 'Gather for a quarry: ' + P.costLine('quarry'),
          when: () => P.afford('quarry') || P.has('quarry'),
          on: () => Scenarios.unlock('quarry'),
          ring: P.buildRing('quarry', 'pebbles'), taps: () => { const r = P.buildRing('quarry', 'pebbles')(); return r ? [r] : []; },
          done: () => P.has('quarry') },
        { id: 'farm', face: 'neutral', text: 'And a farm, where the berries were picked bare.',
          goal: () => P.afford('farm') ? 'Build a farm' : 'Gather for a farm: ' + P.costLine('farm'),
          when: () => P.afford('farm') || P.has('farm'),
          on: () => Scenarios.unlock('farm'),
          ring: P.buildRing('farm', 'barren'), taps: () => { const r = P.buildRing('farm', 'barren')(); return r ? [r] : []; },
          done: () => P.has('farm') },
        { id: 'scout', face: 'neutral', text: 'Something old lies out there. Send someone to look.',
          goal: 'Explore', ring: P.sendTo(() => P.mark('scoutTo', 1) || P.mark('relic', 1)),
          taps: P.sendTaps(() => P.mark('scoutTo', 1) || P.mark('relic', 1)),
          skipIf: () => !S.relic,
          done: () => !!(S.relic && S.relic.found) },
        { id: 'relic', face: 'pleased', text: 'Old stones! Our people will put them to use.', auto: 3200,
          skipIf: () => !S.relic },
        { id: 'deck', face: 'neutral', text: 'You carry cards. Tap your deck and play one.',
          goal: 'Play a card',
          skipIf: () => !(window.Deck && Deck.on && Deck.on() && Deck.total && Deck.total() > 0),
          on: () => { P._deckOpen = true; },
          ring: () => P.vis('#deckBtn') ? { sel: '#deckBtn' } : null,
          taps: () => P.vis('#deckBtn') ? [{ sel: '#deckBtn' }] : [],
          done: () => !!(S.deck && S.deck.played && S.deck.played.length) },
        { id: 'deckok', face: 'pleased', text: 'Well played! Cards help when times are hard.', auto: 3200,
          when: () => !(window.Deck && Deck.acting && Deck.acting()) },
        { id: 'grow', face: 'neutral', text: 'Now raise the hall again. Gather what it needs.',
          goal: () => 'Hall Lv 3: ' + P.hallNeeds(),
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0 || Bld.canUpgrade(tc).ok); } },
        { id: 'raise', face: 'pleased', text: 'We have enough. Raise the hall!',
          goal: 'Raise the hall', ring: P.hallRing('#panel [data-act="upgrade"]'),
          taps: () => { const r = P.hallRing('#panel [data-act="upgrade"]')(); return r ? [r] : []; },
          done: () => { const tc = P.tc(); return !!tc && (tc.level >= 3 || tc.upgrading > 0); } },
        // an upgrade rises only with hands on it (the game's rule): the Elder sends them
        { id: 'build', face: 'neutral', text: 'Send villagers to build it. Many hands, quick work.',
          goal: 'Send builders to the hall', ring: () => P.builderRing(), taps: () => P.builderTaps(),
          done: () => { const tc = P.tc(); return !tc || !(tc.upgrading > 0) || P.builders(tc).length > 0; } },
        { id: 'rising', face: 'pleased', text: 'Everyone helps. The hall is rising.', auto: 3200, goal: 'The hall is rising' },
      ];
    },
    3() {
      const P = this;
      return [
        { id: 'open', face: 'neutral', text: 'Two roads to victory: burn their hall, or raise a Wonder.', auto: 4200 },
        { id: 'barracks', face: 'neutral', text: 'Raiders roam these hills. Build a barracks.',
          goal: () => P.afford('barracks') ? 'Build a barracks' : 'Gather for a barracks: ' + P.costLine('barracks'),
          when: () => P.afford('barracks') || P.has('barracks'),
          on: () => Scenarios.unlock('barracks'),
          ring: P.buildRing('barracks', 'barracksSite'), taps: () => { const r = P.buildRing('barracks', 'barracksSite')(); return r ? [r] : []; },
          done: () => P.has('barracks') },
        { id: 'soldiers', face: 'neutral', text: 'Train soldiers at the barracks.',
          goal: () => 'Soldiers ' + Math.min(3, P.soldiers().length) + '/3',
          when: () => P.has('barracks', true),
          ring: P.yardRing('barracks', '#panel [data-act="train"]'),
          taps: () => { const r = P.yardRing('barracks', '#panel [data-act="train"]')(); return r ? [r] : []; },
          done: () => P.soldiers().length >= 3 },
        { id: 'raid', face: 'concerned', text: 'Raiders! Send your soldiers to meet them.',
          goal: 'Drive off the raiders',
          when: () => P.soldiers().length >= 2 || S.day >= 22,
          on: () => P.raid(),
          ring: () => { const r = P.raiders()[0]; return r ? { u: r.id } : null; },
          taps: () => { const s = P.soldiers()[0], r = P.raiders()[0]; return [s && !P.selSoldier() ? { u: s.id } : null, r ? { u: r.id } : null].filter(Boolean); },
          done: () => P._raided && !P.raiders().length },
        { id: 'beaten', face: 'pleased', text: 'They\'re beaten! Our people are safe.', auto: 3200 },
        { id: 'roads', face: 'neutral', text: 'Now choose: march on their hall, or raise the Wonder here.',
          goal: 'Raze their hall, or raise the Wonder',
          on: () => { Scenarios.unlock('wonder'); },
          ring: () => P.vis('.bbtn[data-key="wonder"]') ? { sel: '.bbtn[data-key="wonder"]' } : null,
          done: () => P.has('wonder') || !!(S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'attackBld' && (Bld.get ? Bld.get(u.task.id) : null))) },
        { id: 'go', face: 'pleased', text: 'The clan is with you, chief. See it through.', auto: 3600 },
      ];
    },
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
    if (this._raided || !window.G || !G.spawnBarb) return;
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
     (N seconds steady), then the beat comes back */
  ASIDES: [
    { id: 'nobuilder', face: 'concerned', text: 'No one is building it. Send a villager to the frame.', hold: 5,
      test() { return this.unbuilt(); },
      ring() { const b = this.unbuilt(); return b ? (this.selVil() ? { x: Bld.cx(b), y: Bld.cy(b), r: 1.1 } : (this.idleVil() ? { u: this.idleVil().id } : null)) : null; },
      taps() { const b = this.unbuilt(), v = this.idleVil(); return [v && !this.selVil() ? { u: v.id } : null, b ? { x: Bld.cx(b), y: Bld.cy(b), r: 1 } : null].filter(Boolean); } },
    /* IDLE HANDS: a gatherer whose tile runs out stands idle (the game's own
       rule — a spent tile is news), so while the player is gathering toward
       a goal (a beat held until it is affordable, or the hall's storey) a
       hand idle 10 s is pointed back to work: the hand, then the nearest
       tile of the good the goal is shortest of */
    { id: 'idle', face: 'concerned', text: 'Idle hands, chief. Send them to gather.', hold: 10,
      test() {
        const b = this.beat(); if (!b) return false;
        const waiting = b.id === 'grow' || (b.when && !S.pro.said[b.id] && !this._shown);
        return waiting && this.vils().some(u => this.isIdle(u));
      },
      ring() { const v = this.selVil(); if (v && this.isIdle(v)) return this.workFor(v); const iv = this.idleVil(); return iv && this.isIdle(iv) ? { u: iv.id } : null; },
      taps() { const iv = this.idleVil(); return iv && this.isIdle(iv) ? [{ u: iv.id }, this.workFor(iv)].filter(Boolean) : []; } },
    /* THE WRONG WORK: every hand busy, none on the good the goal is short
       of (a held beat's price, or the hall's) — the tracker says "Food 0/50"
       and nothing will ever change it. The Elder names the good; the ring
       takes the nearest hand on other work, then the tile. */
    { id: 'need', face: 'concerned', hold: 8,
      text() { return { food: 'We need food. Send someone to the berries.', wood: 'We need wood. Send someone to the trees.', stone: 'We need stone. Send someone to the grey rocks.' }[this.need()] || 'Send someone to gather.'; },
      test() {
        const b = this.beat(); if (!b) return false;
        const waiting = b.id === 'grow' || (b.when && !S.pro.said[b.id] && !this._shown);
        if (!waiting) return false;
        const r = this.need(), have = Math.floor(S.res[r] || 0);
        if (!r || this.gatherers(r).length) return false;
        return !this.vils().some(u => this.isIdle(u)) && have < this.needOf(r);
      },
      ring() { const v = this.selVil(); if (v && !this.onRes(v, this.need())) return this.workFor(v); const h = this.spareHand(); return h ? { u: h.id } : null; },
      taps() { const h = this.spareHand(); return h ? [{ u: h.id }, this.workFor(h)].filter(Boolean) : []; } },
    { id: 'rival', face: 'neutral', text: 'Riders! Another clan shares this valley. They mean no harm.', hold: 0.5, once: true, auto: 4200,
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
  // a site or a storey going up with nobody at it
  unbuilt() {
    for (const b of S.buildings) {
      if (b.owner !== 'P' || !(b.construction > 0 || b.upgrading > 0)) continue;
      const at = S.units.some(u => u.owner === 'P' && u.task && (u.task.type === 'build') && (u.task.id === b.id || u.task.b === b.id || u.task.bid === b.id));
      if (!at) return b;
    }
    return null;
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
    this._aside = null; this._asideT = {};
    this._shown = null; this._lineT0 = 0;
    this._hand = null; this._handN = 0; this._clk = 0; this._lastIn = 0;
    this._finale = null; this._held = null; this._raided = false;
    this._seated = null; this._deckOpen = false; this._collapsed = false;
    this._celebrate = [];
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
  onGather(u, res, take) {
    this._got[res] = (this._got[res] || 0) + take;
    const b = this.beat();
    // the first of a good the lesson asked for flies to its counter
    if (b && b.cheer === res && !this._cheered && this._got[res] >= 1) {
      this._cheered = true;
      this.fly(res, u.x, u.y);
    }
  },

  /* the script's clock: the SIM's (G.simStep), in real seconds */
  simTick(dt) {
    if (!S || !S.scenario || S.over || !this._beats) return;
    if (!S.pro) return;
    this._clk += (dt > 0 ? dt : 0);
    const P = S.pro, now = this.now();
    let b = this.beat();
    // pass over what has nothing to teach here, or is already done
    let guard = 0;
    while (b && guard++ < 20) {
      if (b.skipIf && b.skipIf.call(this)) { this._advance(b, true); b = this.beat(); continue; }
      if (!P.said[b.id] && !b.auto && b.done && b.done.call(this) && !this._shown) { this._advance(b, true); b = this.beat(); continue; }
      break;
    }
    if (!b) { if (!this._aside) this._shown = null; this._asides(dt); return; }
    // a held beat waits, silently: the tracker carries its goal meanwhile
    // (the asides still watch: a held beat is exactly when idle or misplaced hands stall the goal)
    if (b.when && !b.when.call(this) && !P.said[b.id]) { if (!this._aside) this._shown = null; this._goalBeat = b; this._asides(dt); return; }
    if (this._shown !== b) this._present(b);
    if (b.auto) {
      if (now - this._lineT0 >= b.auto) this._advance(b);
    } else if (b.done && b.done.call(this)) {
      this._complete(b);
    }
    this._asides(dt);
  },
  _present(b) {
    const P = S.pro;
    this._shown = b;
    this._lineT0 = this.now();
    this._lastIn = Math.max(this._lastIn, this._lineT0);   // the idle hand counts from the line
    this._hand = null; this._handN = 0; this._cheered = false;
    this._collapsed = false; this._acted = false;
    this._goalBeat = b;
    if (!P.said[b.id]) {
      P.said[b.id] = 1;
      P.t[b.id] = Math.round(S.playtime || 0);
      if (b.on) { try { b.on.call(this); } catch (e) { console.error('prologue beat', b.id, e); } }
      this.track('shown', { game: Scenarios.game(), beat: b.id, i: P.i });
    }
    this.say(b.text, b.face);
  },
  _complete(b) {
    const P = S.pro;
    const target = b.ring ? this._resolve(b.ring.call(this)) : null;
    this.celebrate(target, b.cheer);
    this.track('beat', { game: Scenarios.game(), beat: b.id, i: P.i,
      shown_ms: Math.round(((P.t[b.id] != null ? P.t[b.id] : 0)) * 1000),
      done_ms: Math.round((S.playtime || 0) * 1000), hints: this._handN, hand: this._handN ? 1 : 0 });
    this._advance(b);
  },
  _advance(b, silent) {
    const P = S.pro;
    P.done[b.id] = 1;
    P.i++;
    this._shown = null;
    if (silent) P.said[b.id] = P.said[b.id] || 0;
  },
  _asides(dt) {
    const now = this.now();
    if (this._aside) {
      const a = this._aside;
      const gone = a.auto ? now - this._asideT0 > a.auto : !a.test.call(this);
      if (gone) { this._aside = null; this._shown = null; }   // the beat comes back
      return;
    }
    for (const a of this.ASIDES) {
      if (a.once && S.pro.said['aside:' + a.id]) continue;
      if (a.test.call(this)) {
        this._asideT[a.id] = (this._asideT[a.id] || 0) + dt;
        if (this._asideT[a.id] >= a.hold) {
          this._asideT[a.id] = 0;
          this._aside = a; this._asideT0 = now;
          if (a.once) S.pro.said['aside:' + a.id] = 1;
          this._lineT0 = now; this._hand = null; this._collapsed = false;
          // the words are fixed when the aside is shown (the need aside names its good)
          if (typeof a.text === 'function') this._aside = Object.assign({}, a, { text: a.text.call(this) });
          this.say(this._aside.text, a.face);
          this.track('shown', { game: Scenarios.game(), beat: 'aside:' + a.id, i: S.pro.i });
          return;
        }
      } else this._asideT[a.id] = 0;
    }
  },

  /* ================= THE ELDER ON SCREEN ================= */
  FACES: { neutral: 'assets/ui/elder/elder-neutral-2x.png', pleased: 'assets/ui/elder/elder-pleased-2x.png', concerned: 'assets/ui/elder/elder-concerned-2x.png' },
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
      '<div id="proElder" role="dialog" aria-label="The Elder">' + corners +
        '<div class="pePic"><img alt="" src="' + this.FACES.neutral + '"></div>' +
        '<div class="peBody"><b class="peName">The Elder</b><p class="peTxt"></p>' +
          '<div class="peAsk"><input class="peIn" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Your name">' +
          '<button class="peBtn gold" type="button" data-act="me">That\'s me</button></div></div>' +
        '<button class="peHide" type="button" aria-label="Hide">▾</button>' +
      '</div>' +
      '<button id="proMini" type="button" aria-label="The Elder"><img alt="" src="' + this.FACES.neutral + '"></button>' +
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
    // preload the three faces: a new face must never blink in empty
    for (const k in this.FACES) { const im = new Image(); im.src = this.FACES[k]; }
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
    // the target the pulse rings, on screen (and brought into view once a line)
    const raw = b && b.ring ? b.ring.call(this) : null;
    const tgt = raw ? this._resolve(raw) : null;
    this._ringTo(E, tgt);
    if (Screens.current === 'playing' && !this._held) this._look(raw, tgt, B);
    // the goal tracker: the standing objective, whatever line is up
    this._goal(E, B);
    // the line: open, or folded to a portrait once the player is working on it
    const reading = Math.max(3200, 1200 + 260 * ((line && line.text) || '').split(/\s+/).length);
    if (b && !b.auto && this._acted && !this._userHid && now - this._lineT0 > reading + 4000 && !this._asking) this._collapsed = true;
    // …and opens again for a player who has stopped (the hand comes with it)
    if (this._collapsed && !this._userHid && b && !b.auto && now - this._lastIn > 11000) { this._collapsed = false; this._lineT0 = now; }
    const open = !!line && !this._collapsed && !(window.DeckUI && DeckUI.open) && !(window.Deck && Deck.acting && Deck.acting());
    E.elder.style.display = open ? '' : 'none';
    // #proGoal, #proMini and #proHand are hidden by the stylesheet: a show is an explicit value, never ''
    E.mini.style.display = !open && (b || this._held) && !(window.DeckUI && DeckUI.open) ? 'block' : 'none';
    if (open) this._seat(E, B, tgt);
    else this._seatMini(E, B);
    // the idle hand: 6 s of nothing on an action beat, and it shows the taps
    this._handTick(E, b, now);
    this._fxTick(E, now);
  },
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
    if (!txt) { if (el.style.display !== 'none') { el.style.display = 'none'; document.body.style.setProperty('--pro-h', '0px'); } return; }
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
    const h = el.offsetHeight + 6;
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
  /* THE LOOK: a line whose ring stands off the visible band brings it into
     view once — a short glide that lands it in the half of the band the
     Elder does not sit in. Any touch cancels the glide (the camera is the
     player's); reduced motion makes the move at once; a finger already down
     waits for the lift. */
  _look(raw, tgt, B) {
    if (!raw || raw.sel || !tgt) return;
    const key = ((this._aside || this._shown || {}).id || '') + ':' + (raw.u !== undefined ? 'u' + raw.u : (raw.x | 0) + ',' + (raw.y | 0));
    if (this._looked === key) return;
    const m = 24, inView = tgt.x > m && tgt.x < B.vw - m && tgt.y > B.top + m && tgt.y < B.bot - m;
    if (inView) { this._looked = key; return; }
    if (window.UI && UI.pointers && UI.pointers.size) return;
    this._looked = key;
    let wx = raw.x, wy = raw.y;
    if (raw.u !== undefined) { const u = Units.get(raw.u); if (!u) return; wx = u.x; wy = u.y - CFG.SPRITE_LIFT / CFG.TILE; }
    const z = R.cam.z, TL = CFG.TILE, seat = this._seatBox;
    const elderLow = !seat || seat.y > (B.top + B.bot) / 2;
    const sy = B.top + (B.bot - B.top) * (elderLow ? 0.38 : 0.66), sx = B.vw / 2;
    const tx = wx * TL - sx / z, ty = wy * TL - sy / z;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { R.cam.x = tx; R.cam.y = ty; R.clampCam && R.clampCam(); return; }
    const x0 = R.cam.x, y0 = R.cam.y, t0 = performance.now(), MS = 450, world = S;
    let stop = false;
    const cancel = () => { stop = true; };
    document.addEventListener('pointerdown', cancel, { once: true, capture: true });
    const step = now => {
      if (stop || S !== world) { document.removeEventListener('pointerdown', cancel, true); return; }
      const k = Math.min(1, (now - t0) / MS), e = 1 - Math.pow(1 - k, 3);
      R.cam.x = x0 + (tx - x0) * e; R.cam.y = y0 + (ty - y0) * e; R.clampCam && R.clampCam();
      if (k < 1) requestAnimationFrame(step); else document.removeEventListener('pointerdown', cancel, true);
    };
    requestAnimationFrame(step);
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
    if (!this._hand) { this._hand = { t0: now, i: 0 }; this._handN++; if (this._handN === 1) this._collapsed = false; }
    const taps = (b.taps.call(this) || []).map(t => this._resolve(t)).filter(Boolean);
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
    this._shown = null; this._aside = null; this._goalBeat = null;
    this._collapsed = false; this._userHid = false;
    this.say(g === 1 ? 'Our first fire burns bright. Well done, chief.' : g === 2 ? 'A great hall! The clan is proud, chief.' : 'Well done, chief.', 'pleased');
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
    this.say('Welcome, Chief ' + name + '.', 'pleased');
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
    if (act === 'menu' && typeof S !== 'undefined' && S && S.scenario) { this.track('choice', { game: Scenarios.game(), choice: 'menu' }); return false; }
    if (!/^pro-/.test(act) || !window.Screens) return false;
    const g = Scenarios.game();
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
    if (!S.over.win) return 'The raiders won this time. Try again — the clan believes in you.';
    if (g === 1) return 'Your journey has begun: ' + this.NAMES[2] + ' is next.';
    if (g === 2) return 'One road left: ' + this.NAMES[3] + '.';
    return 'The journey is complete. Every world is yours now.';
  },
  onScreen(name) {
    if (name !== 'playing' && this._el && !this._held) this._el.root.style.display = 'none';
    if (name === 'playing' && typeof S !== 'undefined' && S && S.scenario && !this._began) {
      this._began = S;
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
#scrTitle.pro #btnTitleNew, #scrTitle.pro #btnTitleBoard, #scrTitle.pro #btnTitleCards, #scrTitle.pro #btnTitleLoad { display: none !important; }
#scrTitle.pro #btnContinue.cant { display: none !important; }
#scrTitle.pro .trow3 { grid-template-columns: 1fr 1fr; }
#scrTitle #btnBegin small { display: block; margin-top: 3px; font: 600 12px/1.2 Georgia,serif; letter-spacing: .3px; text-transform: none; opacity: .85; }
#scrTitle .proSkip { display: block; margin: 14px auto 0; padding: 8px 14px; border: 0; background: none; cursor: pointer;
  color: rgba(243,226,180,.72); font: 600 13px/1 Georgia,serif; text-decoration: underline; text-underline-offset: 3px; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#scrTitle .proSkip.arm { color: #ffd77a; }
`;
    document.head.appendChild(st);
  },
};
window.Prologue = Prologue;
