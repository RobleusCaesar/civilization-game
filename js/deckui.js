"use strict";
/* THE CARD SYSTEM — the in-game deck (tests/deck-ui.mjs): the HUD button,
   the bottom sheet that pauses the world, the closer look, targeting, the
   play animation and the timers of the cards still running.

   NOTHING HERE EXISTS UNTIL IT IS WANTED. With the switch off (Deck.on()
   false) G.frame never calls in, so there is no DOM, no CSS, no listener and
   no per-frame work at all. With it on, the chrome is BUILT on the first
   frame of a real game — never on the title's demo world — and every layer
   carries the body.ingame gate, so a shell screen covers it for free.

   THE CARD IS TAKEN ONLY BY Deck.play, and Deck.play is called exactly as the
   burst LANDS. Everything before that is theatre: the sheet, the lift, the
   aim and the flight can all be called off and the card was never touched.
   A refusal at the landing hands it back in as many words.

   THE DECK HOLDS THE PAUSE, AND GIVES BACK ONLY ITS OWN. Opening the sheet
   pauses the world; aiming keeps it paused; the world resumes the instant a
   card's effect begins, or when the deck is put away. What was there before
   is restored — but only if the pause is still the one the deck set: a
   player who pressed ▶ while aiming keeps the world running, and a screen
   that took over (the pause menu, the end) owns the pause from then on.

   Render state only: nothing here is ever in S or a save (the R.collapses
   rule). onWorldChange() drops all of it from newGame and loadJSON. */
const DeckUI = {
  /* ---------------- the feel lives in these numbers ---------------- */
  SHEET_MS: 220,          // the sheet slides up, with a little overshoot
  LIFT_MS: 150,           // a card lifts out of the row for a closer look
  // the PLAY: the card flies to the centre, flares in its tier colour, then
  // bursts toward what it changes. The effect lands at FLY+FLARE+BURST, and
  // the last of the light is gone AFTER later: 880 ms by design, which keeps
  // a third of a second in hand under the 1.2 s bar (pinned, measured) — a
  // dpr-3 page measured ~250 ms later than a dpr-1 one, its first frame dear
  FLY_MS: 210, FLARE_MS: 220, BURST_MS: 220, AFTER_MS: 230,
  // a player who asks for less motion keeps every piece of information —
  // the card shown, its glow, the toast, the number ticking — and no travel
  CALM: { in: 140, flare: 200, out: 110, after: 220 },
  /* a card whose act draws a MONSTER (its `art`, js/deckfx*.js) lands only
     once the monster's strips are in — up to this long past the flight's
     end, so an act whose art is merely LATE never opens on the procedural
     stand-in. The strips were asked for, high, the moment the card was held
     (Deck.wantArt), so the wait is a backstop that almost never runs. */
  ART_WAIT_MS: 600,
  TICK_MS: 320,           // a resource number counting up to its new value
  SPRING: 'cubic-bezier(.2,1.35,.4,1)',   // springy, with overshoot
  OUT: 'cubic-bezier(.55,0,.85,.35)',     // a launch: slow, then gone

  built: false,
  el: null,               // {btn, badge, timers}
  sheet: null,            // {root, back, panel, row, count, hint}
  open: false,            // the sheet is up
  lifted: null,           // {id, cell, layer, big, why, play}: the card held up for a closer look
  aim: null,              // targeting mode: {id, x, y, set, ok, warn, armed, …}
  playing: null,          // a play sequence in flight: {id, world, layer, dest}
  _pause: null,           // {was, world}: the pause the deck is holding
  _chips: null,           // timer id -> {el, cv, lab, n (ring cells lit), left, col, cat}
  _ticks: [],             // resource numbers counting up after a landing
  _later: [],             // the play sequence's timeouts, cancelled by reset()
  _t: 0,                  // the timers' 0.25 s cadence

  /* ---------------- is there a game to wear chrome for ---------------- */
  // the same test Screens.show uses for body.ingame, read from state rather
  // than the DOM so it costs nothing per frame
  live() {
    return typeof S !== 'undefined' && !!S && !!S.map && !S.over &&
      !!window.Screens && Screens.current === 'playing' && !Screens._demo;
  },
  // the deck has the floor: the tutorial holds its notes (Screens.modalUp)
  // and the toasts ride above the sheet
  hasFloor() { return this.open || !!this.aim || !!this.playing; },
  _calm() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  },

  /* THE TUTORIAL HAS THE FLOOR (operator ruling 12): while the lesson's
     spine is still running (S.tut on, phase 1) the deck is not in the game —
     no button, no timers, no sheet — because a first game already has more
     to read than it can hold. The starter hand still lands (ensureStarter,
     the title already dealt it). The moment the spine is done — the capstone
     answered, or the lesson skipped — the deck walks in, in that same run,
     and the tutorial's last note rings it (Tutorial.EVENTS 'deck'). */
  tutHides() {
    // one predicate, in deck.js beside the door that refuses on it (guarded on
    // the method it calls: a cached older deck.js must stand down, not throw)
    return !!(window.Deck && Deck.lessonHolds && Deck.lessonHolds());
  },
  _shy: false,             // the chrome is built but stood down for the lesson
  _waited: false,          // this world kept the deck back: it ARRIVES when the lesson lets go
  _starter: false,         // the starter hand has been asked for this session

  /* called from G.frame, only while Deck.on() */
  frame(dt) {
    if (!this.live()) {
      // a screen took over (the pause menu, the end): drop the deck where it
      // stands — that screen owns the pause now, and the card was never taken
      if (this.hasFloor() || this._ticks.length) this.reset();
      return;
    }
    if (this.tutHides()) {
      if (!this._starter) { this._starter = true; Deck.ensureStarter(); }
      if (this.built && !this._shy) this._stand(false);
      this._waited = true;
      return;
    }
    if (!this.built) this.build();
    if (this._shy) this._stand(true);
    if (this._waited) { this._waited = false; this._arrive(); }
    if (this.aim) this._aimPlace();
    // a card's dragon on the wing borrows the view to take the beast in
    // (js/deckfx.js, dragonfire.cam — guarded on the method it calls)
    const DF = Deck.FX && Deck.FX.dragonfire;
    if (DF && DF.cam) DF.cam(dt);
    if (this._ticks.length) this._tickNumbers();
    if ((this._t -= dt) > 0) return;
    this._t = 0.25;
    this._timers();
  },

  /* a new world, or a loaded one: nothing of the old run's deck survives it.
     The world change sets its own pause, so the deck's hold is dropped
     without being "given back" into a game it never paused. */
  onWorldChange() {
    this._waited = false;
    if (!this.built) return;
    this.reset();
    if (this._shy) this._stand(true);   // a new world starts with the deck in it
    for (const id in this._chips) this._chips[id].el.remove();
    this._chips = {};
    this._fitChips();
    this.syncBadge();
  },

  // stand the chrome down for the lesson, or bring it back
  _stand(on) {
    if (!this.el) return;
    this._shy = !on;
    if (!on) this.reset();
    this.el.btn.style.display = on ? '' : 'none';
    this.el.timers.style.display = on ? '' : 'none';
    if (on) { this.syncBadge(true); this._fitChips(); }
  },
  /* coming in mid-run, the deck ARRIVES: the button drops into the bar with
     a pop, so the eye has found it before the tutorial's note names it */
  _arrive() {
    if (!this.el) return;
    this.arrivedAt = performance.now();
    if (!this._calm() && this.el.btn.animate) {
      this.el.btn.animate([{ transform: 'translateY(-14px) scale(.4)', opacity: 0 }, { transform: 'translateY(2px) scale(1.18)', opacity: 1, offset: 0.6 },
        { transform: 'none', opacity: 1 }], { duration: 420, easing: this.SPRING });
      this._arriveFlare();
    }
    UI.cue('ok');
  },
  /* …AND IT IS EARNED, NOT JUST THERE: as the button lands, a ring of hard
     gold pixels bursts off it — the play sequence's own flare, in the deck's
     gold, for one beat — and its icon flashes white-gold. Squares, never a
     soft glow; motion and opacity in hard steps (steps()), never a fade.
     Lives on the body for a second, then is gone: nothing outlasts the beat. */
  _arriveFlare() {
    const r = this.el.btn.getBoundingClientRect();
    if (!r.width) return;
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const host = document.createElement('i');
    host.className = 'dkArrive';
    host.style.left = cx + 'px'; host.style.top = cy + 'px';
    const N = 14, PAL = ['#ffd45e', '#fff0b0', '#e8c15a', '#c98446'];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (i & 1 ? 0.12 : 0), big = !(i % 3);
      const d = 26 + (i % 4) * 7, sz = big ? 6 : 4;
      const sq = document.createElement('i');
      sq.style.width = sq.style.height = sz + 'px';
      sq.style.background = PAL[i % PAL.length];
      sq.style.margin = (-sz / 2) + 'px 0 0 ' + (-sz / 2) + 'px';
      host.appendChild(sq);
      // every position on the 2px grid; the ring is born OUTSIDE the button
      // (a spark over the gold icon is gold on gold) and thrown clear of it
      const at = (r) => `translate(${Math.round(Math.cos(a) * r / 2) * 2}px,${Math.round(Math.sin(a) * r / 2) * 2}px)`;
      sq.animate([{ transform: at(16), opacity: 1 }, { transform: at(d), opacity: 1, offset: 0.6 },
        { transform: at(d * 1.3), opacity: 0 }],
        { duration: 640, delay: 200, easing: 'steps(8, end)', fill: 'both' });
    }
    document.body.appendChild(host);
    const ico = this.el.btn.querySelector('.dkIco');
    if (ico && ico.animate) ico.animate([{ filter: 'none' }, { filter: 'brightness(1.9) sepia(.6)', offset: 0.3 }, { filter: 'none' }],
      { duration: 520, delay: 160, easing: 'steps(4, end)' });
    setTimeout(() => host.remove(), 1100);
  },

  reset() {
    for (const t of this._later) clearTimeout(t);
    this._later = [];
    for (const id of ['dkInsp', 'dkAim', 'dkAimBar', 'dkFly']) {
      const e = document.getElementById(id);
      if (e) e.remove();
    }
    if (this.sheet) {
      for (const a of this.sheet.root.getAnimations({ subtree: true })) a.cancel();
      this.sheet.root.classList.remove('on');
      this.sheet.panel.style.transform = '';
    }
    if (this.lifted && this.lifted.cell) this.lifted.cell.classList.remove('dkOut');
    if (this.sheet) this.sheet.root.classList.remove('dkLifted');
    this.open = false; this.lifted = null; this.aim = null; this.playing = null;
    this._pause = null;
    this._finishTicks();
    this._floor();
  },

  /* ---------------- the chrome, built once ---------------- */
  build() {
    this.built = true;
    this.css();
    this._starter = true;
    Deck.ensureStarter();   // the three Stone cards every new collection starts with (once, ever)
    /* THE BUTTON SITS IN THE TOP BAR'S SECOND ROW, before ⏸ — the one slot
       that fits every phone and the desktop's single-row bar without moving
       anything (measured in the UI survey: the gap between the tribe and the
       day is 110px even at 320). It is the HUD's own 44×34 button, because a
       44px-tall one grows the bar and R.topReserve has already latched its
       height; an invisible ::after takes the touch target to 44px instead. */
    const pause = document.getElementById('btnPause');
    const row = pause.parentNode;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'iconbtn';
    btn.id = 'deckBtn';
    btn.innerHTML = this.STACK_SVG + '<b class="dkBadge"></b>';
    row.insertBefore(btn, pause);
    btn.addEventListener('click', () => this.toggle());
    // the timers of the cards still running sit beside the tribe, where the
    // row has room; empty, the strip takes no space at all (:empty)
    const tm = document.createElement('span');
    tm.id = 'dkTimers';
    row.insertBefore(tm, document.getElementById('rDay'));
    this.el = { btn, badge: btn.querySelector('.dkBadge'), timers: tm };
    this._chips = {};
    Deck.onChange(() => this._changed());
    // the row's room changes with the window (and the page-fit's own measure)
    const refit = () => this._fitChips();
    window.addEventListener('resize', refit);
    window.addEventListener('cf-fit', refit);
    // installed ONCE and gated on state, like placement's own keys
    document.addEventListener('keydown', e => this._key(e));
    this.syncBadge(true);
    // the monsters' art for every card the player HOLDS, at the front of the wire
    if (Deck.wantArt) Deck.wantArt();
  },

  /* A PIXEL CARD STACK, not an emoji (the title menu's rule, boot.mjs
     theMenuIsDrawnNotTyped): a bronze card behind a gold one, and the gold
     one is drawn AS A CARD — a little sky with a sun over a hill in its art
     window and a dark name plate under it (a gem in the middle read as a
     "+" at this size). 12 cells drawn at 2 CSS px each, square at every dpr. */
  STACK_SVG: (() => {
    const g = [
      'kkkkkkkk....',
      'kbbbbbbk....',
      'kbBkkkkkkkkk',
      'kbBkhggggggk',
      'kbBkgsssssgk',
      'kbBkgsssusgk',
      'kbBkglllllgk',
      'kbBkgggggggk',
      'kbbkgpppppgk',
      'kkkkgpppppgk',
      '...kgggggggk',
      '...kkkkkkkkk',
    ];
    const C = { k: '#140d06', b: '#c98446', B: '#5c3a1c', g: '#e8c15a', h: '#fff2c0',
      s: '#7fa8d0', u: '#ffd45e', l: '#5c7a3a', p: '#2c2318' };
    let r = '';
    g.forEach((row, y) => [...row].forEach((ch, x) => { if (C[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${C[ch]}"/>`; }));
    return `<svg class="dkIco" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  })(),

  syncBadge(quiet) {
    if (!this.el) return;
    const n = Deck.total(), b = this.el.badge;
    const was = +b.dataset.n || 0;
    b.dataset.n = n;
    b.textContent = n > 99 ? '99+' : String(n);
    this.el.btn.classList.toggle('empty', !n);
    this.el.btn.setAttribute('aria-label', n ? `Your cards (${n})` : 'Your cards');
    // a card gained pops the badge: you can see the count go up
    if (!quiet && n > was && !this._calm() && b.animate)
      b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)', offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: 320, easing: this.SPRING });
  },
  _changed() {
    this.syncBadge();
    // the collection moved under an open sheet (a sync, a grant): show it,
    // unless a card is held up — re-rendering would pull the row from under it
    if (this.open && !this.lifted) this.render();
  },

  _key(e) {
    if (!this.live()) return;
    if (e.key === 'Escape') {
      if (this.playing) return;
      if (this.aim) this.endAim();
      else if (this.lifted) this.putBack();
      else if (this.open) this.closeSheet();
      else return;
      e.preventDefault();
    } else if (e.key === 'Enter' && !this.playing && (this.aim || this.lifted)) {
      if (this.aim) {
        // Enter commits the hovered tile, as a click on it would
        if (this.aim.hover && !this.aim.set) { this.aim.set = true; this._aimSync(); }
        this.confirmAim();
      } else this.play(this.lifted.id);
      e.preventDefault();
    }
  },

  /* ---------------- the pause the deck holds ---------------- */
  // re-asserted on every step (sheet, aim, flight) but what was there is
  // remembered only the first time: a ▶ pressed while aiming lets the world
  // run, the flight holds it still for its second, and the landing gives the
  // player's running world back
  _hold() {
    if (!this._pause) this._pause = { was: !!S.paused, world: S };
    // the player pressed ▶ while the deck held the world (aiming): THAT is
    // the state the landing gives back, not the pause found at the start
    else if (S.paused === false) this._pause.was = false;
    S.paused = true;
    this._pauseBtn();
  },
  _release() {
    const p = this._pause;
    this._pause = null;
    if (!p || p.world !== S) return;
    // only OUR pause is given back: if something else moved it meanwhile —
    // the HUD's own ⏸ while aiming — the deck does not overrule it
    if (S.paused === true) S.paused = p.was;
    this._pauseBtn();
  },
  _pauseBtn() {
    const b = document.getElementById('btnPause');
    if (b) b.textContent = S.paused ? '▶' : '⏸';
  },
  // body classes: dk-floor lifts the toasts over the deck's layers (a
  // refusal said under the sheet's dim is a refusal nobody reads); dk-aiming
  // stands the bottom bar down while the reticle has the ground
  _floor() {
    const c = document.body.classList;
    c.toggle('dk-floor', this.hasFloor());
    c.toggle('dk-aiming', !!this.aim);
    // …but a LIFTED card has the screen: the toasts step back under the
    // inspector rather than over the card's corner and text (playtest g2)
    c.toggle('dk-lifted', !!this.lifted);
  },

  /* ---------------- THE SHEET ---------------- */
  toggle() {
    if (this.playing || !this.live()) return;
    if (this.aim) { this.endAim(true); this.openSheet(); return; }   // back to the deck, card still in hand
    if (this.open) this.closeSheet(); else this.openSheet();
  },

  openSheet() {
    if (this.open || this.playing || !this.live() || this.tutHides()) return;
    if (UI.exitPlacement) UI.exitPlacement();   // a ghost under the sheet would be two modes at once
    this._hold();
    this.open = true;
    if (!this.sheet) this._buildSheet();
    const s = this.sheet;
    this.render();
    if (Deck.wantArt) Deck.wantArt();   // a held monster's art, if it is not in yet
    s.root.classList.add('on');
    for (const a of s.root.getAnimations({ subtree: true })) a.cancel();
    if (this._calm()) {
      s.back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      s.panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    } else {
      s.back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      s.panel.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(-7px)', offset: 0.72 }, { transform: 'none' }],
        { duration: this.SHEET_MS, easing: 'cubic-bezier(.25,.8,.4,1)' });
      // the cards deal in behind it, left to right
      s.row.querySelectorAll('.dkCell').forEach((c, i) => {
        if (i < 9) c.animate([{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }],
          { duration: 200, delay: 60 + i * 28, easing: this.SPRING, fill: 'backwards' });
      });
    }
    this._floor();
    UI.cue('ok');
  },

  // keep: the world stays paused (the card is going on to be aimed or played);
  // fromY: a pull-down hands the panel over from where the finger left it
  closeSheet(keep, fromY) {
    if (!this.open) return;
    this.open = false;
    this.putBack(true);
    const s = this.sheet;
    for (const a of s.root.getAnimations({ subtree: true })) a.cancel();
    const ms = this._calm() ? 140 : 180;
    s.back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
    const out = s.panel.animate(this._calm() ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: fromY ? `translateY(${fromY}px)` : 'none' }, { transform: 'translateY(100%)' }],
      { duration: ms, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
    s.panel.style.transform = '';
    // hidden when the slide ends — or by the failsafe, if the frame that
    // would end it never comes (an animated removal always has one)
    const hide = () => {
      if (this.open) return;
      s.root.classList.remove('on');
      for (const a of s.root.getAnimations({ subtree: true })) a.cancel();
    };
    out.finished.then(hide, () => {});
    this._after(ms + 120, hide);
    if (!keep) this._release();
    this._floor();
  },

  _buildSheet() {
    const root = document.createElement('div');
    root.id = 'dkSheet';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Your cards');
    root.innerHTML =
      '<div class="dkBack"></div>' +
      '<div class="dkPanel">' +
        '<div class="dkGrab"><i class="dkGrip"></i>' +
          '<div class="dkHead"><b class="dkTitle">Your Cards</b><span class="dkCount"></span>' +
          '<button type="button" class="iconbtn dkClose" aria-label="Close">✕</button></div>' +
        '</div>' +
        '<div class="dkRow"></div>' +
        '<p class="dkHint"></p>' +
      '</div>';
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    this.sheet = { root, back: q('.dkBack'), panel: q('.dkPanel'), row: q('.dkRow'), count: q('.dkCount'), hint: q('.dkHint'), grab: q('.dkGrab') };
    q('.dkBack').addEventListener('click', () => this.closeSheet());
    q('.dkClose').addEventListener('click', () => this.closeSheet());
    // a mouse wheel scrolls the row sideways — a desktop has no thumb to swipe it
    const row = this.sheet.row;
    row.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    this._dragToClose(this.sheet.grab, this.sheet.panel);
  },

  /* PULL IT DOWN TO PUT IT AWAY: the grip and the header follow the finger,
     and a pull past 70px (or a flick) closes the sheet; less springs back */
  _dragToClose(grab, panel) {
    let d = null;
    grab.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      d = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0 };
      grab.setPointerCapture(e.pointerId);
    });
    grab.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      d.dy = Math.max(0, e.clientY - d.y);
      panel.style.transform = d.dy ? `translateY(${d.dy}px)` : '';
    });
    const up = e => {
      if (!d || e.pointerId !== d.id) return;
      const fast = d.dy / Math.max(1, performance.now() - d.t) > 0.6;
      const dy = d.dy;
      d = null;
      panel.style.transform = '';
      if (dy > 70 || (fast && dy > 24)) this.closeSheet(false, dy);
      else if (dy > 0 && panel.animate)
        panel.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 200, easing: this.SPRING });
    };
    grab.addEventListener('pointerup', up);
    grab.addEventListener('pointercancel', up);
  },

  /* the faces are whole multiples of device pixels (Deck.fit), so the size
     asked for is only ever a target. A dpr that is not a whole number can
     halve it (a 118px ask at 2.625 floors to 67), so a row card that came
     out under 80% of the ask steps up one multiple instead. +0.01 keeps
     Deck.face's own floor from rounding a third-pixel width down a step. */
  _faceW(want, grow) {
    let f = Deck.fit(want);
    if (grow && f.w < want * 0.8) {
      const dpr = Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
      f = Deck.fit((f.k + 1) * Deck.W / dpr + 0.01);
    }
    return f.w + 0.01;
  },
  _rowW() {
    const vw = document.documentElement.clientWidth || 390;
    return this._faceW(vw >= 900 ? 150 : Math.max(96, Math.min(126, vw * 0.3)), true);
  },

  /* GROUPED BY TIER, HIGHEST FIRST: the rarest cards are the first thing
     the sheet shows, and a tier's name sits over its own cards in its own
     colour. A card that cannot be played now is greyed, with the reason
     under it — the same words a PLAY tap would answer with. */
  render() {
    const s = this.sheet, owned = Deck.owned();
    const n = owned.reduce((a, o) => a + o.n, 0);
    s.count.textContent = n ? n + (n === 1 ? ' card' : ' cards') : '';
    s.row.textContent = '';
    if (!n) {
      // THE EARN RULE in the player's words (Deck.eligible): a win always
      // earns; a defeat earns for a real fight, counted in deeds — and the
      // count so far this run, so the number to beat is never a mystery
      const C = CFG.CARDS, need = C.LOSS_DEEDS, have = Math.min(need, Deck.deeds().n);
      const needD = C.LOSS_DAYS, days = Math.min(needD, (S.stats && S.stats.actDays) | 0);
      const e = document.createElement('div');
      e.className = 'dkEmpty';
      e.innerHTML = `<i class="dkEmptyIco">${this.STACK_SVG}</i><b>No cards in your deck yet</b>` +
        `<span>Win a game and a card is yours to keep. Lose one, and it still is — if you put up a fight: ` +
        `${need} deeds of building, training, gathering, upgrading or razing, with orders given on ${needD} different days ` +
        `(this run: ${have} of ${need} deeds, ${days} of ${needD} days).</span>`;
      s.row.appendChild(e);
      s.hint.textContent = '';
      return;
    }
    const w = this._rowW();
    const tiers = Deck.TIERS.slice().sort((a, b) => b.rank - a.rank);
    for (const t of tiers) {
      const mine = owned.filter(o => o.card.tier === t.k);
      if (!mine.length) continue;
      const g = document.createElement('div');
      g.className = 'dkGroup';
      g.dataset.tier = t.k;
      g.style.setProperty('--tc', t.col);
      g.style.setProperty('--tg', t.glow);
      g.innerHTML = `<b class="dkGroupHd">${t.name}</b><div class="dkCards"></div>`;
      const cards = g.querySelector('.dkCards');
      for (const o of mine) cards.appendChild(this._cell(o, w));
      s.row.appendChild(g);
    }
    s.hint.textContent = 'Tap a card to look closer';
  },
  _cell(o, w) {
    const c = o.card, can = Deck.canPlay(c.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dkCell';
    b.dataset.card = c.id;
    const face = Deck.face(c.id, { w, n: o.n, off: !can.ok });
    b.style.setProperty('--cw', face.style.getPropertyValue('--w'));
    b.appendChild(face);
    const cap = document.createElement('span');
    cap.className = 'dkCap' + (can.ok ? '' : ' no');
    cap.textContent = can.ok ? this._kindLine(c) : can.why;
    b.appendChild(cap);
    b.addEventListener('click', () => this.lift(c.id, b));
    return b;
  },
  _kindLine(c) {
    const k = [Deck.TARGET_LABEL[c.target]];
    if (c.days) k.push(c.days + (c.days === 1 ? ' day' : ' days'));
    return k.join(' · ');
  },

  /* ---------------- THE CLOSER LOOK ---------------- */
  /* The tapped card LIFTS out of the row into the middle of the screen at a
     size its back can be read at (a row card's text is a few pixels tall).
     It is a new face at a whole multiple, carried in by a FLIP: drawn where
     it ends, transformed to where it starts, and let go. Tapping it turns it
     over; PLAY plays it; anywhere else puts it back. */
  lift(id, cell) {
    if (this.playing || this.lifted || !this.open) return;
    this._armed = null;   // a fresh lift is a fresh first tap
    const c = Deck.card(id);
    if (!c || Deck.count(id) < 1) return;
    if (Deck.wantArt) Deck.wantArt(id);   // in the hand: its monster is wanted now
    const can = Deck.canPlay(id), t = Deck.tier(c.tier);
    const L = document.createElement('div');
    L.id = 'dkInsp';
    L.style.setProperty('--tc', t.col);
    L.style.setProperty('--tg', t.glow);
    L.innerHTML =
      '<div class="dkIBack"></div>' +
      '<div class="dkIStage"><div class="dkISlot"><i class="dkHalo"></i></div>' +
        '<div class="dkIAct plaques"><b class="dkWhy"></b>' +
        `<button type="button" class="abtn big gold dkPlay"><span class="blab">Play</span><small></small></button>` +
        '<span class="dkTip">Tap the card to turn it over</span></div>' +
      '</div>' +
      '<button type="button" class="iconbtn dkIClose" aria-label="Put it back">✕</button>';
    document.body.appendChild(L);
    const slot = L.querySelector('.dkISlot'), play = L.querySelector('.dkPlay'), why = L.querySelector('.dkWhy');
    // the room the stage leaves the card: one layout read, at a tap
    const room = slot.getBoundingClientRect();
    const w = Math.max(120, Math.min(360, room.width, room.height * Deck.W / Deck.H));
    /* A REFUSAL IS SAID ONCE, ON THE LINE ABOVE PLAY (playtest g1/g2/g4): the
       face is greyed, but no banner is laid across its art — the reason over
       the picture, above PLAY and in a toast was the same words three times
       on one screen, and the banner hid the art the player lifted it to see */
    const big = Deck.face(id, { w: this._faceW(w, false), n: Deck.count(id), off: !can.ok });
    slot.appendChild(big);
    play.querySelector('small').textContent = c.target === 'none' ? this._kindLine(c) : 'Then choose where';
    play.classList.toggle('cant', !can.ok);
    why.textContent = can.ok ? '' : can.why;
    this.lifted = { id, cell, layer: L, big, why, play };
    cell.classList.add('dkOut');
    this.sheet.root.classList.add('dkLifted');   // the row's own hint steps back under the card's
    this._floor();
    big.addEventListener('click', () => {
      big.classList.toggle('flip');
      UI.cue('ok');
    });
    play.addEventListener('click', () => this.play(id));
    L.querySelector('.dkIBack').addEventListener('click', () => this.putBack());
    L.querySelector('.dkIClose').addEventListener('click', () => this.putBack());
    // the FLIP: from the row card's rect to where the big one now stands
    const from = cell.querySelector('.ccard').getBoundingClientRect(), to = big.getBoundingClientRect();
    big.style.transformOrigin = '0 0';
    if (this._calm()) {
      big.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.LIFT_MS });
    } else {
      const s = from.width / Math.max(1, to.width);
      big.animate([{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${s})` }, { transform: 'none' }],
        { duration: this.LIFT_MS, easing: this.SPRING });
      L.querySelector('.dkHalo').animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'ease-out' });
    }
    L.querySelector('.dkIBack').animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.LIFT_MS });
    UI.cue('ok');
  },

  putBack(instant) {
    // a confirm the player walked away from is no confirm: a card put back
    // (or the sheet closed under it) asks twice again the next time
    this._armed = null;
    const lf = this.lifted;
    if (!lf) return;
    this.lifted = null;
    this._floor();
    const done = () => {
      lf.layer.remove();
      if (lf.cell) lf.cell.classList.remove('dkOut');
      if (this.sheet && !this.lifted) this.sheet.root.classList.remove('dkLifted');
    };
    if (instant || this._calm() || !lf.cell.isConnected) { done(); return; }
    const from = lf.big.getBoundingClientRect(), to = lf.cell.querySelector('.ccard').getBoundingClientRect();
    const s = to.width / Math.max(1, from.width);
    lf.big.animate([{ transform: 'none' }, { transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${s})` }],
      { duration: 130, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' });
    lf.layer.querySelector('.dkIBack').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, fill: 'forwards' });
    lf.layer.querySelector('.dkIAct').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
    setTimeout(done, 135);
  },

  /* ---------------- PLAY ---------------- */
  play(id) {
    if (this.playing || !this.live()) return;
    const can = Deck.canPlay(id);
    if (!can.ok) { this._refuse(can.why, this.lifted && this.lifted.play); return; }
    if (Deck.card(id).target !== 'none') { this.startAim(id); return; }
    /* an untargeted card that would END SOMETHING (Kraken's Call reaching the
       rival at peace, js/deckfx-rival.js) says so and asks twice — the aim's
       own two-tap confirm, on the Play button. The warning is the effect's
       warn(), asked of what the player knows. */
    let warn = null;
    try { const fx = Deck.FX[id]; warn = fx && fx.warn ? fx.warn(null) || null : null; } catch (e) { warn = null; }
    if (warn) {
      const A = this._armed;
      if (!A || A.id !== id || performance.now() - A.at > 8000) {
        this._armed = { id, at: performance.now() };
        if (this.lifted) {
          this.lifted.why.textContent = this._sentence(warn) + ' Tap Play again to confirm.';
          const lb = this.lifted.play.querySelector('.blab');
          if (lb) lb.textContent = 'Confirm';
        }
        this._say(this._sentence(warn), 'note');
        UI.cue('bad');
        return;
      }
    }
    this._armed = null;
    const from = this.lifted ? this.lifted.big : null;
    this._run(id, null, from, from && from.classList.contains('flip'));
  },

  /* a toast the PLAYER asked for (a tap on a chip, a PLAY that is refused)
     is always answered: UI.toast drops a line it showed in the last six
     seconds, which is right for the world's chatter and wrong for a reply */
  _say(msg, kind, ms) {
    if (UI._toastAt) delete UI._toastAt[String(msg).replace(/\d+/g, '#')];
    UI.toast(msg, kind, ms);
  },
  /* A WARNING IS A SENTENCE, and the ask comes after it as another one: the
     truce's own words end in a full stop ("…from today the rival fights
     back."), and the old join hung " — tap ✓ again to confirm." off it —
     "fights back. — tap ✓". One full stop, whatever the effect's text ends
     with, then the ask (playtest g4, nit 8). */
  _sentence(s) {
    const t = String(s || '').trim().replace(/[\s—–-]+$/, '');
    return /[.!?]$/.test(t) ? t : t + '.';
  },
  /* a play that cannot happen says why — on the card's own line above PLAY,
     and the button shakes its head. The toast is the NOTE, never the red
     alarm: red is the town under attack (CLAUDE.md's foe-notes rule), and a
     card that cannot be played now is not an emergency (playtest nit 9) */
  _refuse(why, shakeEl) {
    this._say(why || 'Not now.', 'note');
    UI.cue('bad');
    if (this.lifted) this.lifted.why.textContent = why || '';
    if (shakeEl && !this._calm())
      shakeEl.animate([{ transform: 'none' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' },
        { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
  },

  /* THE PLAY SEQUENCE. The card flies to the middle of the screen, flares in
     its tier's colour — a clean flare for Stone, radiance, rays and embers
     for Enlightenment — then BURSTS toward what it changes: the Town Center,
     the resource bar or the chosen ground. Deck.play is called the moment
     the burst lands, so the effect begins exactly there, and a refusal at
     that moment keeps the card. The world is held still until then and let
     go as the effect begins. Every scrap of it is transform and opacity
     (Web Animations, on the compositor); the layer eats taps for its
     second, so nothing can be ordered from under it. */
  _run(id, tgt, fromEl, showingBack) {
    const c = Deck.card(id), t = Deck.tier(c.tier), fx = Deck.FX[id] || {};
    const world = S, calm = this._calm(), rank = t.rank;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const r0 = fromEl ? fromEl.getBoundingClientRect() : { left: vw / 2 - 40, top: vh - 140, width: 80, height: 111 };
    this.putBack(true);
    if (this.open) this.closeSheet(true);
    if (this.aim) this.endAim(true);
    this._hold();
    // where the burst lands (the world is still: a hall or a target off the
    // screen is brought into view first)
    const at = fx.at || (c.target === 'none' ? 'tc' : 'target');
    const dest = this._dest(at, id, tgt);
    const L = document.createElement('div');
    L.id = 'dkFly';
    L.style.setProperty('--tc', t.col);
    L.style.setProperty('--tg', t.glow);
    document.body.appendChild(L);
    const P = this.playing = { id, world, layer: L, dest, landed: false };
    this._floor();
    // the card in flight, centred on the middle of the screen; everything it
    // does is a transform relative to that
    const fw = this._faceW(Math.min(220, vw * 0.5), false);
    const card = Deck.face(id, { w: fw, back: !!showingBack });
    const hold = document.createElement('div');
    hold.className = 'dkFCard';
    hold.appendChild(card);
    const cx = vw / 2, cy = vh * 0.44;
    L.style.setProperty('--cx', cx + 'px');
    L.style.setProperty('--cy', cy + 'px');
    const glow = this._bit(L, 'dkGlow'), fwPx = parseFloat(card.style.getPropertyValue('--w')), fhPx = parseFloat(card.style.getPropertyValue('--h'));
    hold.style.left = (cx - fwPx / 2) + 'px';
    hold.style.top = (cy - fhPx / 2) + 'px';
    L.appendChild(hold);
    // a card shown by its back turns face-up as it flies
    if (showingBack) requestAnimationFrame(() => card.classList.remove('flip'));
    const s0 = r0.width / fwPx;
    const dx0 = r0.left + r0.width / 2 - cx, dy0 = r0.top + r0.height / 2 - cy;
    let land, flight;
    if (calm) {
      const K = this.CALM;
      land = K.in + K.flare + K.out;
      flight = hold.animate([{ opacity: 0 }, { opacity: 1, offset: K.in / land }, { opacity: 1, offset: (K.in + K.flare) / land }, { opacity: 0 }],
        { duration: land, fill: 'forwards' });
      glow.animate([{ opacity: 0 }, { opacity: 0.9, offset: (K.in + K.flare * 0.5) / land }, { opacity: 0 }], { duration: land, fill: 'forwards' });
    } else {
      const F = this.FLY_MS, X = this.FLARE_MS, B = this.BURST_MS;
      land = F + X + B;
      const o1 = F / land, o2 = (F + X * 0.45) / land, o3 = (F + X) / land;
      const toD = dest.kind === 'point';
      const ddx = dest.x - cx, ddy = dest.y - cy;
      flight = hold.animate([
        { transform: `translate(${dx0}px,${dy0}px) scale(${s0})`, opacity: 1, easing: this.SPRING },
        { transform: 'translate(0,0) scale(1) rotate(-3deg)', opacity: 1, offset: o1, easing: 'ease-in-out' },
        { transform: 'translate(0,-6px) scale(1.09) rotate(0deg)', opacity: 1, offset: o2, easing: 'ease-in-out' },
        { transform: 'translate(0,0) scale(1)', opacity: 1, offset: o3, easing: toD ? this.OUT : 'ease-out' },
        ...(toD
          ? [{ transform: `translate(${ddx * 0.5}px,${ddy * 0.5 - 60}px) scale(.45) rotate(8deg)`, opacity: 1, offset: o3 + (1 - o3) * 0.55, easing: 'ease-in' },
             { transform: `translate(${ddx}px,${ddy}px) scale(.08) rotate(14deg)`, opacity: 0 }]
          : [{ transform: 'scale(1.32)', opacity: 0, offset: Math.min(0.99, o3 + 0.16) },
             { transform: 'scale(1.32)', opacity: 0 }]),
      ], { duration: land, fill: 'forwards' });
      // the light the card brings with it, and the light it flares
      const flareAt = F + X * 0.45;
      glow.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.55, transform: 'scale(.8)', offset: F / land },
        { opacity: 1, transform: 'scale(1.45)', offset: flareAt / land }, { opacity: 0, transform: 'scale(1.2)' }],
        { duration: land, fill: 'forwards', easing: 'ease-out' });
      const lite = this._bit(hold, 'dkLite');
      lite.style.width = fwPx + 'px'; lite.style.height = fhPx + 'px';
      lite.animate([{ opacity: 0 }, { opacity: 0, offset: F / land }, { opacity: 0.85, offset: flareAt / land }, { opacity: 0, offset: o3 }, { opacity: 0 }],
        { duration: land, fill: 'forwards' });
      this._spectacle(L, rank, cx, cy, flareAt, land);
      if (toD) this._trail(L, rank, cx, cy, dest, F + X, B);
      else this._spray(L, dest, cx, cy, F + X, B, rank);
    }
    /* THE LANDING IS THE FLIGHT'S OWN END, not a timer beside it: an
       animation starts on the next frame it is drawn, so on a phone late
       with its frames a clock started now would land the effect while the
       goods are still in the air. The timeout is only the failsafe for a
       flight that never finishes (a hidden tab draws no frames). */
    const land2 = () => { if (this.playing === P && !P.landed) { P.landed = true; this._land(P, tgt, calm); } };
    const go = () => {
      if (this.playing !== P || P.landed || P.waiting) return;
      const A = window.Assets, set = fx.art;
      if (set && A && A.fxSetDone && A.whenFx && !A.fxSetDone(set)) {
        P.waiting = true;
        A.wantFx(set, { prio: 'high' });
        A.whenFx(set, this.ART_WAIT_MS).then(() => { P.waiting = false; land2(); });
        return;
      }
      land2();
    };
    flight.finished.then(go, () => {});
    this._after(land + 400, go);
  },

  // a timeout the next reset() cancels — the sequence's own clock
  _after(ms, fn) {
    const id = setTimeout(() => { this._later = this._later.filter(x => x !== id); fn(); }, ms);
    this._later.push(id);
  },

  _bit(parent, cls) {
    const i = document.createElement('i');
    i.className = cls;
    parent.appendChild(i);
    return i;
  },

  /* THE SPECTACLE SCALES WITH THE TIER: Stone gets a clean flare and nothing
     else; every tier above adds something — sparks, a ring of light, rays,
     and for Enlightenment a radiance that floods the screen and embers
     rising off the card. The sparks are hard squares, the house's pixels. */
  _spectacle(L, rank, cx, cy, flareAt, land) {
    if (rank >= 2) {
      const ring = this._bit(L, 'dkRing');
      ring.animate([{ opacity: 0, transform: 'scale(.25)' }, { opacity: 1, transform: 'scale(.4)', offset: 0.05 }, { opacity: 0, transform: 'scale(2.1)' }],
        { duration: 420, delay: flareAt, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' });
    }
    if (rank >= 3) {
      const rays = this._bit(L, 'dkRays');
      rays.animate([{ opacity: 0, transform: 'rotate(0deg) scale(.6)' }, { opacity: rank >= 4 ? 0.95 : 0.7, transform: 'rotate(14deg) scale(1)', offset: 0.45 },
        { opacity: 0, transform: 'rotate(34deg) scale(1.1)' }], { duration: land - this.FLY_MS * 0.6, delay: this.FLY_MS * 0.6, fill: 'both' });
      if (rank >= 4) {
        const rays2 = this._bit(L, 'dkRays dkRays2');
        rays2.animate([{ opacity: 0, transform: 'rotate(10deg) scale(.7)' }, { opacity: 0.7, transform: 'rotate(-8deg) scale(1.05)', offset: 0.5 },
          { opacity: 0, transform: 'rotate(-26deg) scale(1.15)' }], { duration: land - this.FLY_MS * 0.6, delay: this.FLY_MS * 0.6, fill: 'both' });
        const flash = this._bit(L, 'dkFlash');
        flash.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.35 }, { opacity: 0 }], { duration: 520, delay: flareAt - 140, fill: 'both' });
      }
    }
    const n = [0, 8, 12, 16, 26][rank] || 0;
    for (let i = 0; i < n; i++) {
      const p = this._bit(L, 'dkSpark');
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const ember = rank >= 4 && i % 2;
      const d = 70 + Math.random() * (60 + rank * 22);
      const ex = Math.cos(a) * d, ey = Math.sin(a) * d - (ember ? 80 + Math.random() * 90 : 0);
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      if (ember) p.classList.add('ember');
      p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${ex}px,${ey}px) scale(.5)`, opacity: 0 }],
        { duration: 420 + Math.random() * 220, delay: flareAt - 30 + Math.random() * 60, easing: 'cubic-bezier(.15,.8,.4,1)', fill: 'both' });
    }
  },

  // the burst toward a point: a comet's tail of the tier's light behind the card
  _trail(L, rank, cx, cy, dest, start, dur) {
    const n = 5 + rank * 2;
    for (let i = 0; i < n; i++) {
      const p = this._bit(L, 'dkSpark trail');
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      const lag = 18 + i * 12, jx = (Math.random() - 0.5) * 18, jy = (Math.random() - 0.5) * 18;
      p.animate([{ transform: 'translate(0,0)', opacity: 0 }, { transform: `translate(${jx}px,${jy}px)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${(dest.x - cx) * 0.5 + jx}px,${(dest.y - cy) * 0.5 - 60 + jy}px)`, opacity: 0.9, offset: 0.6 },
        { transform: `translate(${dest.x - cx}px,${dest.y - cy}px) scale(.4)`, opacity: 0 }],
        { duration: Math.max(80, dur - lag + 40), delay: start + lag, easing: 'ease-in', fill: 'both' });
    }
  },

  // the burst toward the bar: the card breaks into its goods, and they fly
  // into the chips they are going to fill — or, with no goods to show, into
  // the bar as the tier's own light
  _spray(L, dest, cx, cy, start, dur, rank) {
    const per = Math.min(10, 4 + rank * 2);
    for (const ch of dest.chips) {
      const ic = ch.res && Sprites.icons[ch.res];
      for (let i = 0; i < per; i++) {
        let cv;
        if (ic) {
          cv = document.createElement('canvas');
          cv.className = 'dkGood';
          cv.width = cv.height = 16;
          cv.getContext('2d').drawImage(ic, 0, 0, 16, 16);
          L.appendChild(cv);
        } else cv = this._bit(L, 'dkSpark trail');
        cv.style.left = cx + 'px'; cv.style.top = cy + 'px';
        const lag = i * 22, a = (i / per - 0.5) * 2.2;
        const mx = Math.sin(a) * 70, my = -40 - Math.cos(a) * 34;
        cv.animate([{ transform: 'translate(0,0) scale(.5)', opacity: 0 },
          { transform: `translate(${mx}px,${my}px) scale(1.15)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${ch.x - cx}px,${ch.y - cy}px) scale(.8)`, opacity: 1, offset: 0.92 },
          { transform: `translate(${ch.x - cx}px,${ch.y - cy}px) scale(.6)`, opacity: 0 }],
          { duration: dur - lag, delay: start + lag, easing: 'cubic-bezier(.35,0,.6,1)', fill: 'both' });
      }
    }
  },

  /* WHERE A CARD LANDS: FX.at names it. 'tc' is the hall (or the world
     point the effect's own dest() names, where its work stands), 'target' the
     chosen ground — both brought on screen first if they are off it (the
     world is paused, so the cut costs nothing) — and 'bar' is the resource
     chips the card fills, read off its own effect text ("+250 food."): the
     text IS the exact effect, by the catalog's own rule. */
  _dest(at, id, tgt) {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    if (at === 'bar') {
      const goods = this._goods(id);
      const chips = goods.map(res => {
        const ic = document.querySelector(`#topbar .ric[data-ic="${res}"]`);
        const r = ic ? ic.getBoundingClientRect() : { left: vw / 2, top: 20, width: 0, height: 0 };
        return { res, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (!chips.length) {
        // nothing named: a TIMED card lands where its countdown is about to
        // appear (beside the tribe) — and so does one held as charges, whose
        // chip appears there too — anything else on the resource bar itself
        const chipped = Deck.card(id).days || (Deck.FX[id] && Deck.FX[id].chip);
        const at = chipped ? document.getElementById('rPopChip') : document.querySelector('#topbar .trow');
        const r = at ? at.getBoundingClientRect() : { left: 0, top: 0, width: vw, height: 30 };
        chips.push({ res: null, x: chipped ? r.right + 20 : r.left + r.width / 2, y: r.top + r.height / 2 });
      }
      /* a card whose goods ARRIVE in the world (Deck.FX[id].showAtHall — the
         town's goods land in a moment at the hall's door) brings the hall on
         screen first, the way 'tc' does: the moment and the count are one
         sequence, never a show culled off camera while the bar ticks up */
      const fx = Deck.FX[id];
      if (fx && fx.showAtHall && typeof Bld !== 'undefined') {
        const tc = Bld.tcOf('P');
        if (tc) { const hx = Bld.cx(tc), hy = Bld.cy(tc) + Bld.size(tc) / 2; if (!R.onScreen(hx, hy)) R.centerOn(hx, hy); }
      }
      const x = chips.reduce((a, ch) => a + ch.x, 0) / chips.length, y = chips.reduce((a, ch) => a + ch.y, 0) / chips.length;
      return { kind: 'bar', chips, x, y };
    }
    let w = null;
    if (at === 'target' && tgt) w = { x: tgt.x, y: tgt.y };   // already a world point
    else if (at === 'focus') {
      // the effect names the ground it is about to change (a world point), or
      // nothing — and then the light bursts in the middle of the screen
      // without moving the view (js/deckfx-rival.js: the kraken's sea, the
      // spied town, the sun's known ground)
      const f = Deck.FX[id] && Deck.FX[id].focus;
      try { w = f ? Deck.FX[id].focus() : null; } catch (e) { w = null; }
    } else {
      // a card whose work stands somewhere of its own (the Wonder cards: the
      // Wonder's works) names its landing point; else it lands on the hall
      const fx = window.Deck && Deck.FX[id], own = fx && fx.dest ? fx.dest() : null;
      const tc = own ? null : Bld.tcOf('P');
      if (own) w = { x: own.x, y: own.y };
      else if (tc) w = { x: Bld.cx(tc), y: Bld.cy(tc) };
    }
    if (!w) return { kind: 'point', x: vw / 2, y: vh / 2 };
    if (!R.onScreen(w.x, w.y)) R.centerOn(w.x, w.y);
    const TL = CFG.TILE, z = R.cam.z;
    return { kind: 'point', x: (w.x * TL - R.cam.x) * z, y: (w.y * TL - R.cam.y) * z };
  },
  RES: ['food', 'wood', 'stone', 'gold'],
  _goods(id) {
    const c = Deck.card(id), out = [];
    const re = /\+[\d,]+\s+(food|wood|stone|gold)\b/g;
    let m;
    while ((m = re.exec(c.text))) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  },

  /* THE LANDING: the one moment the card is spent. Deck.play is the door —
     it re-checks everything and takes the card only if the effect applies.
     The world lets go here, so the effect starts as the light arrives. */
  _land(P, tgt, calm) {
    const { id, dest } = P;
    if (S !== P.world || !this.live()) { this.reset(); return; }   // never walk a card into another world
    const c = Deck.card(id), t = Deck.tier(c.tier);
    const before = {};
    for (const k of this.RES) before[k] = S.res[k] || 0;
    const r = Deck.play(id, tgt);
    this._release();
    const L = P.layer;
    if (!r.ok) {
      this._say(r.why || 'The card could not take hold — it is still yours.', 'note');
      UI.cue('bad');
    } else {
      // the effect itself writes the event log (Deck.say); the landing only
      // says it on screen, so one play is one log line, never two — and a
      // strike whose act narrates itself (`narrates`: the star's blow, the
      // dragon's ash) leaves the saying to the act, one toast, never a stack
      const fx = Deck.FX[id] || {};
      if (!fx.narrates) this._say(typeof r.msg === 'string' && r.msg ? r.msg : `${c.name}: ${this._line(c.text)}`, 'note', 4200);
      UI.cue(t.rank >= 2 ? 'bond' : 'done');
      if (dest.kind === 'point') this._impact(L, dest, t.rank, calm);
      this._count(before, r.fly, calm, L);
      this._t = 0;   // a timed card's countdown pops in on the very next frame
    }
    const after = calm ? this.CALM.after : this.AFTER_MS;
    this._after(after, () => {
      if (this.playing !== P) return;
      L.remove();
      this.playing = null;
      this._floor();
    });
  },
  // the toast's line: the effect's first sentence ("+250 food.", "Five
  // Horse Archers ride out of your Town Center.") — the card names the rest
  // — and a sentence that runs on into its rules ("A falling star strikes
  // the chosen ground: 900 damage to…") is cut at the colon: the numbers are
  // on the card, and the strike's own narration says what it hit
  _line(text) {
    const m = /^.*?(?:[.!](?=\s|$)|:(?=\s))/.exec(text);
    return m ? m[0].replace(/:$/, '.') : text;
  },

  // the light hits the ground: a ring of the tier's pixels and a flash
  _impact(L, dest, rank, calm) {
    const fl = this._bit(L, 'dkHit');
    fl.style.left = dest.x + 'px'; fl.style.top = dest.y + 'px';
    if (calm) { fl.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 240, fill: 'forwards' }); return; }
    fl.animate([{ opacity: 1, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    const ring = this._bit(L, 'dkRing dkRingHit');
    ring.style.left = dest.x + 'px'; ring.style.top = dest.y + 'px';
    ring.animate([{ opacity: 1, transform: 'scale(.2)' }, { opacity: 0, transform: `scale(${1.1 + rank * 0.25})` }],
      { duration: 300, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
  },

  /* THE BAR NUMBER TICKS: every resource the card filled counts up from what
     it was to what it is, while its chip pulses. The goods are what the
     effect SAYS it gave (FX apply's {fly}: {food: 250} or [{res, n}]) and,
     failing that, what the stockpile actually gained. UI.refresh writes the
     bar every quarter second; frame() runs after it and holds the count. */
  _count(before, fly, calm, L) {
    const gained = {};
    if (fly && typeof fly === 'object') {
      if (Array.isArray(fly)) { for (const f of fly) if (f && f.res) gained[f.res] = (gained[f.res] || 0) + (+f.n || +f.amount || 0); }
      else for (const k in fly) gained[k] = +fly[k] || 0;
    }
    for (const k of this.RES) if ((S.res[k] || 0) > before[k] && !(k in gained)) gained[k] = S.res[k] - before[k];
    const now = performance.now();
    for (const k in gained) {
      const el = document.getElementById('r' + k[0].toUpperCase() + k.slice(1));
      if (!el || !(gained[k] > 0)) continue;
      const to = S.res[k] || 0;
      this._ticks = this._ticks.filter(x => x.res !== k);
      this._ticks.push({ res: k, el, from: Math.max(0, to - gained[k]), to, t0: now, dur: this.TICK_MS });
      el.textContent = UI.fmtRes(Math.max(0, to - gained[k]));
      const chip = el.closest('.res');
      if (!chip) continue;
      if (!calm) chip.animate([{ transform: 'none' }, { transform: 'scale(1.12)', offset: 0.35 }, { transform: 'none' }],
        { duration: 340, easing: this.SPRING });
      // the chip lights in the card's colour: a glow laid over it, faded by
      // opacity (an animated box-shadow would repaint the bar every frame)
      const r = chip.getBoundingClientRect(), gl = this._bit(L, 'dkChipGlow');
      gl.style.left = r.left + 'px'; gl.style.top = r.top + 'px';
      gl.style.width = r.width + 'px'; gl.style.height = r.height + 'px';
      gl.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: this.AFTER_MS, fill: 'forwards' });
    }
  },
  _tickNumbers() {
    const now = performance.now();
    for (const x of this._ticks) {
      const k = Math.min(1, (now - x.t0) / x.dur), e = 1 - (1 - k) * (1 - k);
      x.el.textContent = UI.fmtRes(k >= 1 ? (S.res[x.res] || 0) : x.from + (x.to - x.from) * e);
      x.done = k >= 1;
    }
    this._ticks = this._ticks.filter(x => !x.done);
  },
  _finishTicks() {
    if (typeof S !== 'undefined' && S && S.res) for (const x of this._ticks) x.el.textContent = UI.fmtRes(S.res[x.res] || 0);
    this._ticks = [];
  },

  /* ---------------- TARGETING ---------------- */
  /* The sheet closes into the AIM: a reticle on the ground showing the
     card's reach, tinted by Deck.validTarget, with ✕ and ✓ in a bar over the
     build menu. The world stays paused while you choose.
     THE WORLD NEVER RECEIVES THESE TAPS: a capture layer lies between the
     canvas and the HUD and answers every press itself — the placement
     ghost's grammar, so it is already in the player's hands: a tap jumps the
     mark, a press ON it drags it, a press anywhere else pans, two fingers
     pinch, the wheel zooms, a mouse sweeps it until a click parks it. The HUD
     above stays live (the minimap still jumps the view). */
  startAim(id) {
    const c = Deck.card(id), t = Deck.tier(c.tier), fx = Deck.FX[id] || {};
    this.putBack(true);
    if (this.open) this.closeSheet(true);
    if (UI.exitPlacement) UI.exitPlacement();
    this._hold();
    // the ring is the card's REACH: FX.radius in tiles when the effect names
    // one, else 3 — the unit radius Starfall and Dragonfire both strike at
    const A = this.aim = { id, x: 0, y: 0, set: false, ok: false, warn: null, armed: false,
      ptrs: new Map(), drag: false, down: null, pinchD: 0, tr: '', drawn: null, radius: +fx.radius > 0 ? +fx.radius : 3,
      // a strike that reaches buildings less far than people (Starfall 2 of
      // 3, Dragonfire 2.5) draws that reach as a second, fainter ring
      inner: +fx.inner > 0 && +fx.inner < (+fx.radius || 3) ? +fx.inner : 0 };
    const layer = document.createElement('div');
    layer.id = 'dkAim';
    const ret = document.createElement('canvas');
    ret.className = 'dkRet';
    layer.appendChild(ret);
    document.body.appendChild(layer);
    const bar = document.createElement('div');
    bar.id = 'dkAimBar';
    bar.style.setProperty('--tc', t.col);
    bar.innerHTML =
      '<button type="button" class="dkANo" aria-label="Put the card back">✕</button>' +
      '<div class="dkAInfo"><i class="dkAThumb"></i>' +
      `<div class="dkAText"><b class="dkAName"></b><span class="dkAStat"></span></div></div>` +
      '<button type="button" class="dkAGo"></button>';
    bar.querySelector('.dkAName').textContent = c.name;
    bar.querySelector('.dkAThumb').style.backgroundImage =
      `url("${Deck.artUrl(id)}"), ${Deck.glyphUrl(c.cat, 'rgba(255,255,255,0.3)')}, radial-gradient(ellipse at 50% 38%, ${t.col}66, #120d08 78%)`;
    document.body.appendChild(bar);
    A.layer = layer; A.ret = ret; A.bar = bar;
    A.stat = bar.querySelector('.dkAStat'); A.go = bar.querySelector('.dkAGo'); A.thumb = bar.querySelector('.dkAThumb');
    bar.querySelector('.dkANo').addEventListener('click', () => this.endAim());
    A.go.addEventListener('click', () => this.confirmAim());
    this._aimInput(layer);
    // seed the mark at the middle of the open view — on the nearest ground
    // that can take it, so the first thing shown is a mark that would work
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const mid = R.screenToTile(vw / 2, ((R.topReserve || 0) + vh - (R.bottomReserve || 0)) / 2);
    const seat = this._nearestValid(id, mid.x, mid.y, 14) || mid;
    A.x = seat.x; A.y = seat.y;
    this._aimSync();
    this._aimPlace();
    this._floor();
    if (!this._calm()) bar.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 200, easing: this.SPRING });
    UI.cue('ok');
  },

  _nearestValid(id, x0, y0, rMax) {
    if (Deck.validTarget(id, x0, y0)) return { x: x0, y: y0 };
    for (let r = 1; r <= rMax; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (Deck.validTarget(id, x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy };
      }
    return null;
  },

  // cancelled: the card was never touched. keep: the world stays paused
  // (the deck reopens over it, or the card is on its way to land)
  endAim(keep) {
    const A = this.aim;
    if (!A) return;
    this.aim = null;
    A.layer.remove();
    A.bar.remove();
    if (!keep) this._release();
    this._floor();
  },

  confirmAim() {
    const A = this.aim;
    if (!A || this.playing) return;
    const can = Deck.canPlay(A.id);
    if (!can.ok) { this._refuse(can.why, A.go); this.endAim(); return; }
    // RE-VALIDATED FROM SCRATCH: the tint is never trusted (placement's rule)
    if (!Deck.validTarget(A.id, A.x, A.y)) { this._refuse(this._badGround(A), A.go); return; }
    if (A.hover && !A.set) { this._refuse('Click the ground to choose where it lands.', A.go); return; }
    this._aimSync();
    // a card that would END SOMETHING says so, and asks twice (the two-tap
    // confirm the game uses for every act that cannot be undone)
    if (A.warn && !A.armed) {
      A.armed = true;
      this._aimSync();
      UI.cue('bad');
      return;
    }
    // the effect takes a WORLD POINT (js/deckfx.js): the middle of the
    // marked tile, exactly where the reticle's cross is drawn
    this._run(A.id, { x: A.x + 0.5, y: A.y + 0.5 }, A.thumb, false);
  },

  _badGround(A) {
    const c = Deck.card(A.id);
    if (typeof MapGen !== 'undefined' && !MapGen.onBoard(A.x, A.y)) return 'That is beyond the edge of the world.';
    if (c.target === 'explored' && !(S.map.explored && S.map.explored[A.y * CFG.W + A.x])) return 'Choose ground you have explored.';
    // charted by a card, never seen by the tribe's own eyes (js/deckfx-rival.js)
    if (c.target === 'explored' && Deck.litAt && Deck.litAt(A.x, A.y)) return Deck.EYES_WHY;
    return 'That ground will not take it.';
  },

  // the verdict on the mark's tile, said on the bar and in its colour
  _aimSync() {
    const A = this.aim;
    const c = Deck.card(A.id), fx = Deck.FX[A.id] || {};
    A.ok = Deck.validTarget(A.id, A.x, A.y);
    let warn = null;
    if (A.ok && fx.warn) { try { warn = fx.warn({ x: A.x + 0.5, y: A.y + 0.5 }) || null; } catch (e) { warn = null; } }
    A.warn = warn;
    if (!warn) A.armed = false;
    A.stat.textContent = !A.ok ? this._badGround(A)
      : warn ? this._sentence(warn) + (A.armed ? ' Tap ✓ again to confirm.' : '')
      : (A.set ? (c.target === 'explored' ? 'Strike here? Or pick other ground.' : 'Here? Or pick another point.')
               : 'Tap the ground, or drag the mark.');
    A.bar.classList.toggle('bad', !A.ok);
    A.bar.classList.toggle('warn', !!warn);
    /* a mouse that has only hovered has chosen nothing yet. BOOLEANS, always:
       a finger never hovers, so A.hover is undefined on touch, and
       classList.toggle(cls, undefined) FLIPS the class instead of setting it —
       every sync turned a good ✓ grey and back again (playtest g1: after a
       normal tap the button read disabled, the same tile tapped twice lit it) */
    const pick = !!A.hover && !A.set;
    A.go.classList.toggle('off', !A.ok || pick);
    A.go.textContent = pick ? 'Click the ground' : A.armed ? '✓ Confirm' : '✓ Here';
    const key = (A.ok ? (warn ? 'w' : 'v') : 'x') + A.radius;
    if (A.drawn !== key) { A.drawn = key; this._drawReticle(A, !A.ok ? '#e06550' : warn ? '#f0a040' : Deck.tier(c.tier).col); }
  },

  /* the mark: a ring of hard pixels at the card's reach, the tile itself
     framed, a cross at its heart — drawn once per colour in WORLD pixels and
     scaled with the camera, so it reads like the ground it lies on */
  _drawReticle(A, col) {
    const TL = CFG.TILE, R0 = A.radius * TL, pad = 6, half = R0 + pad;
    const cv = A.ret;
    cv.width = cv.height = half * 2;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const dot = (x, y, s, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), s, s); };
    // the reach: a dotted ring, a shadow under every dot so it reads on snow and sand alike
    const steps = Math.max(24, Math.round(2 * Math.PI * R0 / 7));
    for (let i = 0; i < steps; i++) {
      const a = i / steps * Math.PI * 2, x = half + Math.cos(a) * R0 - 1, y = half + Math.sin(a) * R0 - 1;
      dot(x + 1, y + 1, 2, 'rgba(0,0,0,0.55)');
      dot(x, y, 2, col);
    }
    // the buildings' reach, when it is shorter: sparser dots, half as bright
    if (A.inner > 0) {
      const R1 = A.inner * TL, n1 = Math.max(16, Math.round(2 * Math.PI * R1 / 11));
      g.globalAlpha = 0.6;
      for (let i = 0; i < n1; i++) {
        const a = i / n1 * Math.PI * 2, x = half + Math.cos(a) * R1 - 1, y = half + Math.sin(a) * R1 - 1;
        dot(x + 1, y + 1, 2, 'rgba(0,0,0,0.55)');
        dot(x, y, 2, col);
      }
      g.globalAlpha = 1;
    }
    // the faint floor of the reach
    g.globalAlpha = 0.14;
    g.fillStyle = col;
    R.pxDisc(g, half, half, R0 - 2, 2);
    g.globalAlpha = 1;
    // the chosen tile, framed by its corners
    const t0 = half - TL / 2, t1 = half + TL / 2 - 2;
    for (const [x, y] of [[t0, t0], [t1, t0], [t0, t1], [t1, t1]]) {
      const sx = x === t0 ? 1 : -1, sy = y === t0 ? 1 : -1;
      for (let k = 0; k < 6; k++) { dot(x + sx * k + 1, y + 1, 2, 'rgba(0,0,0,0.55)'); dot(x + 1, y + sy * k + 1, 2, 'rgba(0,0,0,0.55)'); }
      for (let k = 0; k < 6; k++) { dot(x + sx * k, y, 2, col); dot(x, y + sy * k, 2, col); }
    }
    // the cross at its heart
    for (let k = -4; k <= 4; k += 2) { dot(half + k, half - 1, 2, col); dot(half - 1, half + k, 2, col); }
    A.half = half;
    A.tr = ''; A.placed = null;
  },

  // the mark rides the camera: written only when it moves (no DOM reads)
  _aimPlace() {
    const A = this.aim, z = R.cam.z, TL = CFG.TILE, cx = R.cam.x, cy = R.cam.y;
    // asked every frame while aiming: nothing is built while nothing moved
    const p = A.placed;
    if (p && p[0] === cx && p[1] === cy && p[2] === z && p[3] === A.x && p[4] === A.y && p[5] === A.half) return;
    A.placed = [cx, cy, z, A.x, A.y, A.half];
    const sx = ((A.x + 0.5) * TL - cx) * z, sy = ((A.y + 0.5) * TL - cy) * z;
    const tr = `translate(${(sx - A.half * z).toFixed(1)}px,${(sy - A.half * z).toFixed(1)}px) scale(${z.toFixed(4)})`;
    if (tr !== A.tr) { A.tr = tr; A.ret.style.transform = tr; }
  },

  _aimTo(px, py) {
    const A = this.aim, t = R.screenToTile(px, py);
    if (t.x === A.x && t.y === A.y) return;
    A.x = t.x; A.y = t.y;
    A.armed = false;
    this._aimSync();
    this._aimPlace();
  },
  _onMark(px, py) {
    const A = this.aim, z = R.cam.z, TL = CFG.TILE;
    const sx = ((A.x + 0.5) * TL - R.cam.x) * z, sy = ((A.y + 0.5) * TL - R.cam.y) * z;
    return Math.hypot(px - sx, py - sy) <= Math.max(30, TL * z * 0.75);
  },

  _aimInput(layer) {
    layer.addEventListener('pointerdown', e => {
      const A = this.aim;
      e.preventDefault();
      if (!A || this.playing) return;
      try { layer.setPointerCapture(e.pointerId); } catch (err) {}
      A.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (A.ptrs.size === 1) {
        if (this._onMark(e.clientX, e.clientY)) { A.drag = true; this._aimTo(e.clientX, e.clientY); }
        else A.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      } else if (A.ptrs.size === 2) {
        const [a, b] = [...A.ptrs.values()];
        A.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        A.down = null; A.drag = false;
      }
    });
    layer.addEventListener('pointermove', e => {
      const A = this.aim;
      if (!A) return;
      const p = A.ptrs.get(e.pointerId);
      /* a mouse SWEEPS the mark over the ground as a preview — and only a
         click (or Enter) commits it. The way to ✓ crosses the ground, so a
         hover that counted would spend the card wherever the cursor last
         crossed above the bar, not where the player pointed. */
      if (!p) {
        if (e.pointerType === 'mouse' && !A.set && !e.buttons) {
          if (!A.hover) { A.hover = true; this._aimSync(); }
          this._aimTo(e.clientX, e.clientY);
        }
        return;
      }
      if (A.ptrs.size === 1) {
        if (A.drag) this._aimTo(e.clientX, e.clientY);
        else if (A.down) {
          if (Math.hypot(e.clientX - A.down.x, e.clientY - A.down.y) > 8) A.down.moved = true;
          if (A.down.moved) {
            R.cam.x -= (e.clientX - p.x) / R.cam.z;
            R.cam.y -= (e.clientY - p.y) / R.cam.z;
            R.clampCam();
          }
        }
      } else if (A.ptrs.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...A.ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (A.pinchD > 0) UI.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / A.pinchD);
        A.pinchD = d;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => {
      const A = this.aim;
      if (!A) return;
      A.ptrs.delete(e.pointerId);
      if (A.drag) { A.drag = false; A.set = true; this._aimSync(); }
      else if (A.down && !A.down.moved && performance.now() - A.down.t < 500) {
        this._aimTo(e.clientX, e.clientY);
        A.set = true;
        this._aimSync();
        UI.cue('ok');
      }
      if (A.ptrs.size < 2) A.pinchD = 0;
      if (!A.ptrs.size) A.down = null;
    };
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', e => {
      const A = this.aim;
      if (!A) return;
      A.ptrs.delete(e.pointerId);
      A.down = null; A.drag = false; A.pinchD = 0;
    });
    layer.addEventListener('wheel', e => {
      UI.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
      e.preventDefault();
    }, { passive: false });
  },

  /* ---------------- TIMED EFFECTS ---------------- */
  /* Each card still running wears a chip beside the tribe: its glyph inside
     a ring of hard pixels in the tier's colour, draining clockwise, and the
     time left — in days while there are days, in seconds on the last one
     (a game day is ten seconds). Tap it to hear what it is. Gone the moment
     Deck.tick expires the effect. */
  _timers() {
    const live = typeof S !== 'undefined' && S && S.deck;
    const list = live ? Deck.timers() : [];
    /* A CARD HELD AS CHARGES wears a chip too (Master Builders' next
       buildings): its count where the days would be, its ring the share of a
       card's worth still in hand. The card says so by carrying chip(n) →
       {label, frac, words} (js/deckfx-town.js); everything else is a timer. */
    if (live && S.deck.charges) for (const key in S.deck.charges) {
      // a card may keep its charges under a key of its own (`chargeKey`, e.g.
      // the pact's bands under 'pact'): the chip still belongs to the CARD
      const id = this._chargeCard(key), fx = id && Deck.FX[id], c = fx && fx.chip ? fx.chip(S.deck.charges[key]) : null;
      if (c) list.push({ id, charge: c });
    }
    const seen = {};
    let moved = false;
    for (const tm of list) {
      if (!Deck.card(tm.id)) continue;
      seen[tm.id] = 1;
      if (!this._chips[tm.id]) moved = true;
      const ch = this._chips[tm.id] || this._chip(tm.id);
      const label = tm.charge ? tm.charge.label : this._left(tm.left);
      if (ch.lab.textContent !== label) { ch.lab.textContent = label; moved = true; }
      ch.left = tm.left;
      ch.charge = tm.charge || null;
      this._ringDraw(ch, Math.max(0, Math.min(1, tm.charge ? tm.charge.frac : tm.frac)));
    }
    for (const id in this._chips) {
      if (seen[id]) continue;
      const ch = this._chips[id];
      delete this._chips[id];
      moved = true;
      const gone = () => { ch.el.remove(); this._fitChips(); };
      if (this._calm() || !ch.el.animate) gone();
      else { ch.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], { duration: 200, fill: 'forwards' }); setTimeout(gone, 210); }
    }
    if (moved) this._fitChips();
  },
  /* EVERY RUNNING CARD IS SEEN, OR COUNTED. The strip shares the bar's second
     row with the tribe and the day, and on a narrow phone two chips are
     already more than the row can give it — a chip cut in half by the
     overflow is a card running that nobody can see. So the strip is FITTED:
     every chip that fits is whole, and the rest are counted in a "+k" badge
     on the last one shown (a badge takes no room in the row), whose tap names
     them. Only a strip too narrow for one ring folds everything into a bare
     "+k" chip. Measured only when something changes (a chip comes or goes, a
     label changes width, the window resizes), never per frame. */
  _fitChips() {
    const tm = this.el && this.el.timers;
    if (!tm) return;
    const ids = Object.keys(this._chips);
    for (const id of ids) this._chips[id].el.style.display = '';
    if (this._badge && this._badge.parentNode) this._badge.remove();
    if (this._more && this._more.parentNode) this._more.remove();   // out, so an empty strip is :empty
    this._hidden = [];
    this._badgeOn = null;
    if (!ids.length || tm.scrollWidth <= tm.clientWidth + 1) return;
    let i = ids.length - 1;
    for (; i >= 0 && tm.scrollWidth > tm.clientWidth + 1; i--) {
      this._chips[ids[i]].el.style.display = 'none';
      this._hidden.unshift(ids[i]);
    }
    const k = this._hidden.length;
    if (i >= 0) {
      if (!this._badge) { this._badge = document.createElement('i'); this._badge.className = 'dkMoreB'; }
      this._badge.textContent = '+' + k;
      this._badgeOn = ids[i];
      this._chips[ids[i]].el.appendChild(this._badge);
      return;
    }
    let more = this._more;
    if (!more) {
      more = this._more = document.createElement('button');
      more.type = 'button';
      more.className = 'dkT dkMore';
      more.appendChild(document.createElement('b'));
      more.addEventListener('click', () => {
        const names = this._alsoRunning();
        if (names) { this._say(names, 'note', 4200); UI.cue('ok'); }
      });
    }
    more.firstChild.textContent = '+' + k;
    more.setAttribute('aria-label', k + ' cards running');
    tm.appendChild(more);
  },
  // the card a key of S.deck.charges belongs to: its own id, or the card that
  // names it as its `chargeKey`; null for a key no card wears a chip for
  _chargeCard(key) {
    if (Deck.FX[key] && Deck.card(key)) return key;
    for (const id in Deck.FX) if (Deck.FX[id] && Deck.FX[id].chargeKey === key && Deck.card(id)) return id;
    return null;
  },
  // the cards the strip had no room to show, named with their time left
  _alsoRunning() {
    const names = (this._hidden || []).map(id => {
      const ch = this._chips[id];
      return ch ? `${Deck.card(id).name} (${ch.charge ? ch.charge.words : this._left(ch.left, true)} left)` : null;
    }).filter(Boolean);
    return names.length ? 'Also running: ' + names.join(', ') + '.' : '';
  },
  /* the time left, rounded UP — a card played for 12 days says 12d, not 11d,
     until it has really spent one. The left-over float is shaved first:
     (now + 2) - now comes back as 2.0000000000000004, and its ceiling is 3. */
  _left(days, words) {
    const d = Math.ceil(days - 1e-6), s = Math.max(1, Math.ceil(days * CFG.DAY_MS / 1000 - 1e-6));
    if (days >= 1) return words ? `${d} day${d === 1 ? '' : 's'}` : d + 'd';
    return s + 's';
  },
  /* EACH RUNNING CARD WEARS ITS OWN GLYPH, AND SAYS ITSELF IN ONE LINE
     (playtest g1/g2): every chip on the strip wore its category's glyph —
     four buff cards, four identical little suns — and a tap printed the
     card's whole rules text, five or six lines over the map. A chip names
     its card in pixels (a hammer for the builders, a sheaf for the harvest,
     a flame for the watchfires, a shield, a skull, a keep, a ghost, a wolf…;
     a card with none here wears its category's, as before — the eye for the
     spy, the crescent for the swallowed sun), and a tap answers with the
     name, the time left and this one short line. 12 x 10 cells, like
     Deck.GLYPHS. */
  CHIP: {
    quick_hands:        { g: 'hammer', line: 'Building and upgrades go twice as fast.' },
    master_builders:    { g: 'house',  line: 'Your next buildings stand complete at once.' },
    harvest_festival:   { g: 'sheaf',  line: 'All gathering and work comes in 40% richer.' },
    bountiful_land:     { g: 'leaf',   line: 'Near your hall, everything comes in 50% richer.' },
    golden_age:         {              line: 'Everything 50% richer, built 50% faster.' },
    watchfires:         { g: 'flame',  line: 'Your towers hit harder and reach farther.' },
    stone_skin:         { g: 'shield', line: 'Your buildings take half damage.' },
    unbreakable_hall:   { g: 'keep',   line: 'Your Town Center cannot fall.' },
    ancestors_host:     { g: 'ghost',  line: 'The host fights beside you, then fades.' },
    scouts_fire:        { g: 'fire',   line: 'Your fire keeps watch over the far ground.' },
    spy_hall:           {              line: 'You see their people wherever they go.' },
    blight:             { g: 'skull',  line: 'Their gathering and work fall by 40%.' },
    swallowed_sun:      {              line: 'Their sun is dark: they see less and strike softer.' },
    barbarian_pact:     { g: 'wolf',   line: 'War bands march on the rival instead of you.' },
    wonders_foundation: {              line: 'It waits for your Wonder to be laid.' },
  },
  CHIP_GLYPHS: {
    hammer: ['..######....', '.#########..', '.##########.', '..######....', '....##......', '....##......', '....##......', '....##......', '....##......', '....##......'],
    house:  ['.....##.....', '....####....', '...######...', '..########..', '.##########.', '..########..', '..###..###..', '..###..###..', '..###..###..', '..###..###..'],
    sheaf:  ['.##..##..##.', '.##..##..##.', '.##..##..##.', '..#..##..#..', '...#.##.#...', '....####....', '...#.##.#...', '..#..##..#..', '.#...##...#.', '.#...##...#.'],
    leaf:   ['........###.', '......#####.', '....#######.', '...########.', '..########..', '..#######...', '..#.####....', '.#..##......', '.#..........', '#...........'],
    flame:  ['.....#......', '....##......', '....###.....', '...####.#...', '...######...', '..#######...', '..###.###...', '..##...##...', '...##.##....', '....###.....'],
    shield: ['.##########.', '.#........#.', '.#.######.#.', '.#.######.#.', '.#.######.#.', '..#.####.#..', '..#.####.#..', '...#.##.#...', '....#..#....', '.....##.....'],
    keep:   ['.##.##.##.##', '.##########.', '.##########.', '..########..', '..###..###..', '..###..###..', '..##....##..', '..##....##..', '.##########.', '............'],
    ghost:  ['...######...', '..########..', '.##########.', '.##..##..##.', '.##..##..##.', '.##########.', '.##########.', '.##########.', '.##.##.##.##', '.#..#..#..#.'],
    fire:   ['.....#......', '.....##.....', '....###.....', '....####....', '...######...', '...##.###...', '....####....', '.##......##.', '...######...', '.##......##.'],
    skull:  ['...######...', '..########..', '.##########.', '.##..##..##.', '.##..##..##.', '.##########.', '..###..###..', '...######...', '...#.##.#...', '............'],
    wolf:   ['.#........#.', '.##......##.', '.###....###.', '.##########.', '.##.####.##.', '.##########.', '..########..', '...######...', '....####....', '.....##.....'],
  },
  chipGlyph(id) {
    const k = this.CHIP[id] && this.CHIP[id].g, c = Deck.card(id);
    return (k && this.CHIP_GLYPHS[k]) || Deck.GLYPHS[c && c.cat] || Deck.GLYPHS.econ;
  },
  // the chip's one line: its own, else the card text's first sentence
  chipLine(id) {
    const e = this.CHIP[id];
    return e && e.line ? e.line : this._line(Deck.card(id).text);
  },
  RING_PX: 26,            // the chip's ring, in CSS px: 13 cells of 2
  _chip(id) {
    const c = Deck.card(id), t = Deck.tier(c.tier);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'dkT';
    el.dataset.id = id;
    el.style.setProperty('--tc', t.col);
    const cv = document.createElement('canvas');
    cv.width = cv.height = this.RING_PX;
    const lab = document.createElement('b');
    el.append(cv, lab);
    el.setAttribute('aria-label', c.name);
    el.addEventListener('click', () => {
      const ch = this._chips[id], span = ch && ch.charge ? ch.charge.words : this._left(ch ? ch.left : 0, true);
      // the chip wearing the "+k" names the cards folded behind it too
      const also = this._badgeOn === id ? ' ' + this._alsoRunning() : '';
      this._say(`${c.name} — ${span} left. ${this.chipLine(id)}${also}`, 'note', 4200);
      UI.cue('ok');
    });
    this.el.timers.insertBefore(el, this._more && this._more.parentNode === this.el.timers ? this._more : null);   // "+k" stays last
    if (!this._calm()) el.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: this.SPRING });
    const ch = { el, cv, lab, n: -1, left: 0, col: t.col, cat: c.cat, glyph: this.chipGlyph(id) };
    this._chips[id] = ch;
    return ch;
  },
  // the ring, redrawn only when a cell of it actually changes
  _RING: null,
  _ringDraw(ch, frac) {
    const P = this.RING_PX, C = P / 2, N = P / 2;   // N cells of 2px a side
    if (!this._RING) {
      const cells = [];
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
        const dx = gx * 2 + 1 - C, dy = gy * 2 + 1 - C, d = Math.hypot(dx, dy);
        if (d >= C - 3.6 && d <= C - 0.6) {
          let a = Math.atan2(dx, -dy);
          if (a < 0) a += Math.PI * 2;
          cells.push({ x: gx * 2, y: gy * 2, a });
        }
      }
      cells.sort((p, q) => p.a - q.a);
      this._RING = cells;
    }
    const cells = this._RING, n = Math.round(frac * cells.length);
    if (n === ch.n) return;
    ch.n = n;
    const g = ch.cv.getContext('2d');
    g.clearRect(0, 0, P, P);
    g.fillStyle = 'rgba(10,7,4,0.72)';
    R.pxDisc(g, C, C, C - 3, 2);
    cells.forEach((p, i) => { g.fillStyle = i < n ? ch.col : '#3b2f1f'; g.fillRect(p.x, p.y, 2, 2); });
    const gl = ch.glyph || Deck.GLYPHS[ch.cat] || Deck.GLYPHS.econ;
    g.fillStyle = '#f3e2b4';
    for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) if (gl[y][x] === '#') g.fillRect(C - 6 + x, C - 5 + y, 1, 1);
  },

  /* ---------------- the stylesheet (injected only when the deck is built) ---------------- */
  css() {
    if (document.getElementById('deckUiCss')) return;
    const st = document.createElement('style');
    st.id = 'deckUiCss';
    st.textContent = `
body:not(.ingame) #dkSheet, body:not(.ingame) #dkInsp, body:not(.ingame) #dkAim,
body:not(.ingame) #dkAimBar, body:not(.ingame) #dkFly { display: none !important; }
body.dk-floor #toasts { z-index: 27; }
/* …except over a LIFTED card: the inspector is the player's to read, and a
   toast over its corner covered the tier badge and the card's own text
   (playtest g2). Under it while it is up — the refusal is said on the card's
   own line — and back over the sheet the moment it is put back */
body.dk-floor.dk-lifted #toasts { z-index: 23; }
/* a tutorial note already on screen steps aside while the deck has the floor
   (its dim sits over the reticle otherwise); it is back the moment the deck
   lets go, its state untouched */
body.dk-floor #tutDim, body.dk-floor #tutUI { visibility: hidden !important; }
body.dk-aiming #bottombar { visibility: hidden; }
#deckBtn { position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
#deckBtn::after { content: ''; position: absolute; left: 0; right: 0; top: -5px; bottom: -5px; }
#deckBtn .dkIco { width: 24px; height: 24px; display: block; filter: drop-shadow(0 1px 0 rgba(0,0,0,.6)); }
#deckBtn .dkBadge { position: absolute; top: -5px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; box-sizing: border-box;
  border-radius: 9px; background: #1c140c; border: 1.5px solid var(--gold); color: #f3e2b4; pointer-events: none;
  font: 800 11px/15px -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.6); }
#deckBtn.empty .dkBadge { display: none; }
.dkArrive { position: fixed; width: 0; height: 0; z-index: 12; pointer-events: none; }
.dkArrive i { position: absolute; left: 0; top: 0; box-shadow: 0 2px 0 #5c3a1c; image-rendering: pixelated; }
#deckBtn.empty .dkIco { opacity: .55; }
/* THE STRIP IS FITTED, AND ITS "+k" IS WHOLE (playtest g1/g2). Two running
   cards with two-digit days needed 124px where a 390px phone's row leaves
   ~103-117, so the second always folded into "+1" with ~60px seemingly free.
   A chip is now its ring and its count and nothing else (no box: the ring's
   own dark disc is the container) — 48px, so two fit beside a "6/13" tribe
   and a "Day 12". The badge rides the last chip's corner, 5px proud of it:
   the strip's padding makes room for it INSIDE the clip (overflow: hidden
   cut its top half off), and an equal negative margin keeps the row's
   layout exactly as it was. */
#dkTimers { display: flex; gap: 3px; flex: 0 1 auto; min-width: 0; overflow: hidden; padding: 6px 6px 0 0; margin: -6px -6px 0 0; }
#dkTimers:empty { display: none; }
.dkT { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 2px; height: 32px; padding: 0;
  border: 0; border-radius: 0; background: none; color: #f3e2b4; text-shadow: 0 1px 0 #000;
  font: 800 11.5px/1 -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: 0; }
.dkT::after { content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; }
.dkT canvas { width: 26px; height: 26px; image-rendering: pixelated; }
.dkT.dkMore { padding: 0 7px; min-width: 30px; justify-content: center; color: #f3e2b4;
  border: 1px solid rgba(10,8,5,.6); border-radius: 8px; background: rgba(0,0,0,.3); }
.dkT .dkMoreB { position: absolute; top: -5px; right: -5px; min-width: 16px; height: 15px; padding: 0 3px; box-sizing: border-box;
  border-radius: 8px; background: #1c140c; border: 1.5px solid var(--tc); color: #f3e2b4; pointer-events: none; font-style: normal;
  font: 800 9.5px/12px -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,.6); }
@media (max-width: 359px) { .dkT { padding-right: 2px; } .dkT b { display: none; } }

#dkSheet { position: fixed; inset: 0; z-index: 24; display: none; }
#dkSheet.on { display: block; }
#dkSheet .dkBack { position: absolute; inset: 0; background: rgba(8,6,3,.62); }
#dkSheet .dkPanel { position: absolute; left: 0; right: 0; bottom: 0; margin: 0 auto; max-width: 1180px;
  background: var(--panel-bg); background-image: var(--wood-tex); border-radius: 16px 16px 0 0;
  border-top: 2px solid #5c421f; box-shadow: inset 0 1px 0 rgba(232,200,140,.22), 0 -10px 30px rgba(0,0,0,.6);
  padding: 4px 0 calc(env(safe-area-inset-bottom, 0px) + 8px); will-change: transform; }
#dkSheet .dkGrab { touch-action: none; cursor: grab; }
#dkSheet .dkGrip { display: block; width: 46px; height: 5px; margin: 4px auto 0; border-radius: 3px; background: #6e5024; }
#dkSheet .dkHead { display: flex; align-items: center; gap: 10px; padding: 0 6px 0 16px; min-height: 46px; }
#dkSheet .dkTitle { font-family: var(--menufont); font-weight: 700; font-size: 17px; letter-spacing: 1.6px; text-transform: uppercase;
  color: #f2e6cd; text-shadow: 0 2px 0 rgba(20,12,4,.85); }
#dkSheet .dkCount { color: var(--dim); font-size: 12px; font-weight: 700; }
#dkSheet .dkClose { margin-left: auto; width: 46px; height: 46px; font-size: 16px; }
#dkSheet .dkRow { display: flex; gap: 22px; overflow-x: auto; overflow-y: hidden; touch-action: pan-x; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 2px 16px 4px; scroll-padding: 0 16px; scroll-snap-type: x proximity; scrollbar-width: thin; }
#dkSheet .dkRow::before, #dkSheet .dkRow::after { content: ''; margin: auto; }
#dkSheet .dkGroup { flex: 0 0 auto; display: flex; flex-direction: column; gap: 4px; }
#dkSheet .dkGroupHd { display: flex; align-items: center; gap: 7px; height: 18px; color: var(--tc);
  font: 700 11px var(--menufont); letter-spacing: 1.4px; text-transform: uppercase; text-shadow: 0 1px 0 #000; }
#dkSheet .dkGroupHd::before { content: ''; width: 7px; height: 7px; background: var(--tc); transform: rotate(45deg); box-shadow: 0 0 6px var(--tg); }
#dkSheet .dkCards { display: flex; gap: 10px; }
#dkSheet .dkCell { flex: 0 0 auto; width: var(--cw); display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 0 0; border: 0; background: none; color: inherit; scroll-snap-align: start; cursor: pointer; }
#dkSheet .dkCell .ccard { transition: transform .15s cubic-bezier(.2,1.35,.4,1); filter: drop-shadow(0 4px 6px rgba(0,0,0,.55)); }
#dkSheet .dkCell:active .ccard { transform: translateY(-6px); }
@media (hover: hover) { #dkSheet .dkCell:hover .ccard { transform: translateY(-4px); } }
#dkSheet .dkCell.dkOut .ccard { opacity: 0; }
#dkSheet .dkCap { max-width: 100%; min-height: 2.6em; font-size: 11px; line-height: 1.3; color: var(--dim); text-align: center;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* a refusal says WHY, and the why is longer than a kind line: it may take a
   third line before the ellipsis (a 320px phone's 88px card held two) */
#dkSheet .dkCap.no { color: #f0c48a; -webkit-line-clamp: 3; }
/* A LIFTED CARD HAS THE SCREEN: the sheet under the inspector's dim stands
   down entirely — its captions and name plates showed through the backdrop and
   ran into the card's own line ("QUICK HANDS" into "Nothing needs mending.",
   playtest g1/g2). Hidden, not removed: the cell keeps its box, so the card
   still flies back into its own slot, and the row is back the moment it lands */
#dkSheet.dkLifted .dkPanel > * { visibility: hidden; }
#dkSheet .dkHint { text-align: center; color: var(--dim); font-size: 11px; margin: 4px 16px 0; min-height: 14px; }
#dkSheet .dkEmpty { margin: 6px auto 10px; max-width: 360px; display: flex; flex-direction: column; align-items: center; gap: 8px;
  text-align: center; color: var(--dim); font-size: 13px; line-height: 1.45; padding: 0 8px; }
#dkSheet .dkEmpty b { font-family: var(--menufont); color: #f2e6cd; font-size: 15px; letter-spacing: 1px; text-transform: uppercase; }
#dkSheet .dkEmptyIco svg { width: 48px; height: 48px; opacity: .7; }

#dkInsp { position: fixed; inset: 0; z-index: 25; }
#dkInsp .dkIBack { position: absolute; inset: 0; background: rgba(6,4,2,.86); }
#dkInsp .dkIStage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none;
  padding: calc(var(--safe-top) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 18px); }
#dkInsp .dkISlot { position: relative; flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
#dkInsp .dkISlot .ccard { pointer-events: auto; cursor: pointer; filter: drop-shadow(0 10px 18px rgba(0,0,0,.6)); }
#dkInsp .dkHalo { position: absolute; left: 50%; top: 50%; width: min(120vmin, 640px); height: min(120vmin, 640px);
  margin: calc(min(120vmin, 640px) / -2) 0 0 calc(min(120vmin, 640px) / -2); pointer-events: none;
  background: radial-gradient(circle, var(--tg) 0%, transparent 58%); opacity: .9; }
#dkInsp .dkIAct { flex: 0 0 auto; width: min(320px, 88vw); display: flex; flex-direction: column; align-items: center; gap: 7px; pointer-events: auto; }
#dkInsp .dkPlay { width: 100%; }
/* A PLAY THAT CANNOT BE PRESSED LOOKS IT: the plaques' disabled wash left the
   green banner a lit sage slab (playtest g2). Here it is an unlit plank —
   cold dark wood, dim rim, dim studs, grey lettering — sitting flush */
#dkInsp .dkPlay.cant { filter: none; cursor: default; }
#dkInsp .dkPlay.cant::before { filter: none; background: #26221c;
  box-shadow: inset 0 0 0 2px #110d08, inset 0 0 0 4px #4b4539, inset 0 0 0 6px #332e26, inset 0 0 0 7px #110d08,
    inset 0 9px 0 rgba(0,0,0,.32); }
#dkInsp .dkPlay.cant::after { opacity: .3; }
#dkInsp .dkPlay.cant .blab { color: #8a8273; text-shadow: none; }
#dkInsp .dkPlay.cant small { color: #6e675a; }
#dkInsp .dkWhy { min-height: 0; color: #f0c48a; font-size: 13px; line-height: 1.35; text-align: center; text-shadow: 0 1px 0 #000; }
#dkInsp .dkWhy:empty { display: none; }
#dkInsp .dkTip { color: var(--dim); font-size: 11px; }
#dkInsp .dkIClose { position: absolute; top: calc(var(--safe-top) + 8px); right: 8px; width: 46px; height: 46px; font-size: 16px; }

#dkAim { position: fixed; inset: 0; z-index: 7; touch-action: none; cursor: crosshair; }
#dkAim .dkRet { position: absolute; left: 0; top: 0; transform-origin: 0 0; image-rendering: pixelated; pointer-events: none;
  animation: dkBreathe 1.3s ease-in-out infinite; }
@keyframes dkBreathe { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
#dkAimBar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 21; display: flex; align-items: center; gap: 10px;
  padding: 10px 10px calc(env(safe-area-inset-bottom, 0px) / 2 + 10px);
  background: var(--panel-bg); background-image: var(--wood-tex); border-top: 2px solid var(--tc);
  box-shadow: inset 0 1px 0 var(--edge), 0 -6px 18px rgba(0,0,0,.5); }
#dkAimBar button { flex: 0 0 auto; min-height: 48px; border-radius: 10px; border: 2px solid; font-size: 16px; font-weight: 800;
  box-shadow: 0 3px 8px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.12); }
#dkAimBar .dkANo { width: 48px; background: #6b2f26; border-color: #e08a74; color: #f8e4dc; }
#dkAimBar .dkAGo { min-width: 104px; padding: 0 14px; background: #3f6b2e; border-color: #9ed678; color: #eaf6dc; }
#dkAimBar .dkAGo.off { background: #3a3d33; border-color: #7b7f70; color: #b9bdae; }
#dkAimBar.warn .dkAGo { background: #7a5418; border-color: #f0b450; color: #fff0d0; }
#dkAimBar button:active { transform: translateY(1px); }
#dkAimBar .dkAInfo { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 9px; }
#dkAimBar .dkAThumb { flex: 0 0 auto; width: 38px; height: 46px; border: 2px solid var(--tc); border-radius: 4px; image-rendering: pixelated;
  background-size: cover, 60% auto, 100% 100%; background-position: center; background-repeat: no-repeat; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
#dkAimBar .dkAText { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#dkAimBar .dkAName { font: 700 13px var(--menufont); letter-spacing: 1px; text-transform: uppercase; color: #f2e6cd;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#dkAimBar .dkAStat { font-size: 12px; line-height: 1.3; color: var(--dim); }
#dkAimBar.bad .dkAStat { color: #f0a090; }
#dkAimBar.warn .dkAStat { color: #f4c470; font-weight: 700; }

#dkFly { position: fixed; inset: 0; z-index: 26; overflow: hidden; }
#dkFly i, #dkFly .dkGood { position: absolute; display: block; pointer-events: none; }
#dkFly .dkFCard { position: absolute; transform-origin: 50% 50%; will-change: transform, opacity; }
#dkFly .dkLite { left: 0; top: 0; background: radial-gradient(ellipse at 50% 45%, rgba(255,250,230,.95), var(--tc) 55%, transparent 80%);
  mix-blend-mode: screen; opacity: 0; }
#dkFly .dkGlow { left: var(--cx); top: var(--cy); width: min(100vmin, 520px); height: min(100vmin, 520px);
  margin: calc(min(100vmin, 520px) / -2) 0 0 calc(min(100vmin, 520px) / -2);
  background: radial-gradient(circle, var(--tg) 0%, var(--tg) 12%, transparent 60%); opacity: 0; }
#dkFly .dkRays { left: var(--cx); top: var(--cy); width: min(120vmin, 640px); height: min(120vmin, 640px);
  margin: calc(min(120vmin, 640px) / -2) 0 0 calc(min(120vmin, 640px) / -2); opacity: 0;
  background: repeating-conic-gradient(from 0deg, var(--tg) 0deg 4deg, transparent 4deg 20deg);
  -webkit-mask-image: radial-gradient(circle, #000 6%, rgba(0,0,0,.55) 30%, transparent 64%);
  mask-image: radial-gradient(circle, #000 6%, rgba(0,0,0,.55) 30%, transparent 64%); }
#dkFly .dkRays2 { background: repeating-conic-gradient(from 10deg, rgba(255,246,210,.6) 0deg 2deg, transparent 2deg 30deg); }
#dkFly .dkFlash { inset: 0; background: radial-gradient(circle at var(--cx) var(--cy), rgba(255,236,170,.95), rgba(255,214,94,.45) 45%, transparent 85%); opacity: 0; }
#dkFly .dkRing, #dkFly .dkHit { left: var(--cx); top: var(--cy); width: 160px; height: 160px; margin: -80px 0 0 -80px; opacity: 0; }
#dkFly .dkRing { border-radius: 50%; border: 3px dotted var(--tc); box-shadow: 0 0 14px var(--tg), inset 0 0 14px var(--tg); }
#dkFly .dkHit { border-radius: 50%; background: radial-gradient(circle, rgba(255,250,230,.95), var(--tg) 35%, transparent 68%); }
#dkFly .dkSpark { width: 4px; height: 4px; margin: -2px 0 0 -2px; background: var(--tc); box-shadow: 0 0 4px var(--tg); opacity: 0; }
#dkFly .dkSpark.ember { width: 3px; height: 3px; background: #ffe7a0; }
#dkFly .dkSpark.trail { width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; }
#dkFly .dkChipGlow { border-radius: 8px; opacity: 0; box-shadow: 0 0 14px 3px var(--tg), inset 0 0 10px var(--tg); }
#dkFly .dkGood { width: 22px; height: 22px; margin: -11px 0 0 -11px; image-rendering: pixelated; opacity: 0;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.7)); }
@media (prefers-reduced-motion: reduce) {
  #dkAim .dkRet { animation: none; }
  #dkSheet .dkCell .ccard { transition: none; }
  #dkSheet .dkCell:active .ccard, #dkSheet .dkCell:hover .ccard { transform: none; }
}
`;
    document.head.appendChild(st);
  },
};
window.DeckUI = DeckUI;
