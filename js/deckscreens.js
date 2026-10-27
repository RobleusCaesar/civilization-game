"use strict";
/* THE CARD SYSTEM — the end screen's reveal and the collection
   (tests/deck-screens.mjs).

   WITH THE SWITCH OFF NOTHING HERE EXISTS. Screens calls in at exactly two
   places — onTitle and onEndgame — and with Deck.on() false both answer
   with a cheap early return: no element is made, no stylesheet injected, no
   listener bound, and the victory and defeat scenes are what they always
   were. Everything below is built on first use, the day the switch is on.

   WITH IT ON, the end of every finished run is the REWARD SCREEN, win or
   lose: a banner (VICTORY in gold on a navy ribbon, or DEFEAT in cold slate
   with no laurels), the card rising off a stone plinth under light scaled to
   its tier, its plate, the final score, the cards this run played, the size
   of the deck, CLAIM and the world board. The old scenes (VictoryArt,
   Defeat, assets/endgame) stand down on it; they stay in the game, because
   the switch still needs them.

   THE GRANT IS NOT THE CEREMONY. Deck.settle runs once, when the screen
   opens, and it is idempotent per run: the card is in the collection before
   the first frame of the reveal, so a player who closes the tab mid-rise
   still owns it. CLAIM only flies it to the deck — and the deck's count is
   shown as the collection MINUS the cards still waiting on the plinth, so
   the number ticks up as each one lands. A reopened run (a reload, a
   finished save loaded) is shown already claimed: the reveal is the run's,
   and it was told.

   Nothing here touches S beyond reading it, draws from the run's RNG, or
   reaches a save. Every animation is transform and opacity; a player who
   asks for less motion gets the same screen, arrived at without movement. */

const DeckScreens = {
  /* THE REVEAL, per tier (ms): `at` is when the card starts to rise, `hold`
     the beat before it (light leaking out of the plinth — Enlightenment
     only), `rise` how long it takes to come up and settle with its
     overshoot. The rest of the screen keys off these: rays and flash at the
     settle, the plate and score just behind it. A Stone card is done in
     about 1.4s, an Enlightenment card in about 2.5s. */
  REVEAL: {
    stone:    { at: 300, hold: 0,   rise: 640 },
    bronze:   { at: 320, hold: 0,   rise: 690 },
    iron:     { at: 340, hold: 0,   rise: 720 },
    imperial: { at: 360, hold: 0,   rise: 760 },
    enlight:  { at: 440, hold: 760, rise: 800 },
  },
  /* THE SPECTACLE, per tier — how much of the glow, how many rays, sparks
     and whether the laurels stand. The colours themselves are the tier's
     own (Deck.TIERS), so a card's light always matches its frame. */
  FX: {
    stone:    { glow: 0.45, rays: 0,    rays2: 0,    sparks: 5,  laurel: false, flash: false },
    bronze:   { glow: 0.75, rays: 0.42, rays2: 0,    sparks: 9,  laurel: false, flash: false },
    iron:     { glow: 0.8,  rays: 0.5,  rays2: 0,    sparks: 11, laurel: false, flash: false },
    imperial: { glow: 1,    rays: 0.82, rays2: 0.45, sparks: 16, laurel: true,  flash: true },
    enlight:  { glow: 1,    rays: 1,    rays2: 0.8,  sparks: 26, laurel: true,  flash: true },
  },
  FLY_MS: 640,
  MIN_CELL: 110,       // a collection card smaller than this cannot be read

  _view: null,         // the run on screen: { key, win, cause, cards, claimed, shown, ok, why, score, cw }
  _runs: {},           // run key -> cards claimed, for this session: a return resumes rather than replays
  _gen: 0,             // bumps on every render: a timer from an older one stands down
  _timers: [],
  _ready: false,       // the card on the plinth has settled and answers taps
  _flying: false,

  reduced() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  },
  // bare UI, never window.UI: it is a script-level const (the window.G trap)
  cue(kind) { if (typeof UI !== 'undefined' && UI.cue) UI.cue(kind); },
  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  _vp() {
    const de = document.documentElement;
    return { w: de.clientWidth || innerWidth || 390, h: de.clientHeight || innerHeight || 844 };
  },

  /* ================= THE TITLE =================
     A "Cards" plaque joins the secondary row, and the row folds into two by
     two: a fourth TEXT plaque across that row cannot fit "Settings" at any
     phone width (tests/boot.mjs noTitleLabelRunsOffItsPlaque), while two
     across leaves every label room to spare. Plain text like its
     neighbours — the secondary row carries no icons — with the deck's size
     beside the word. The switch thrown back takes the plaque with it. */
  onTitle() {
    const row = document.querySelector('#scrTitle .trow3');
    if (!window.Deck || !Deck.on()) {
      const old = document.getElementById('btnTitleCards');
      if (old) { old.remove(); if (row) row.classList.remove('clFour'); }
      return;
    }
    // every player without a collection is dealt the starter hand once —
    // today's players included, the day the switch is thrown
    Deck.ensureStarter();
    this._css();
    this._listen();
    if (row && !document.getElementById('btnTitleCards')) {
      const b = document.createElement('button');
      b.className = 'abtn';
      b.id = 'btnTitleCards';
      b.innerHTML = '<span class="blab">Cards<b class="clN"></b></span>';
      b.addEventListener('click', () => this.openCollection('title'));
      row.appendChild(b);
      row.classList.add('clFour');
    }
    this._paintCounts();
  },

  /* ================= THE END SCREEN ================= */
  /* Screens.onEndgame asks here first: true means the reward screen has
     taken the end, false means draw the old scenes exactly as before. */
  takeEnd(opts) {
    if (!(window.Deck && Deck.on() && typeof S !== 'undefined' && S && S.over)) { this._giveBack(); return false; }
    opts = opts || {};
    const win = opts.win != null ? !!opts.win : !!S.over.win;
    this._css();
    this._listen();
    if (window.VictoryArt) VictoryArt.stop();
    if (window.Defeat) Defeat.stop();
    const scr = document.getElementById('scrEndgame');
    scr.classList.remove('victoryMode', 'defeatMode');
    scr.classList.add('ceMode');
    const rep = Deck.report(win, S.over.cause);
    // back from the board or the collection: the screen is exactly as it was left
    if (opts.back && this._view && this._view.key === rep.key && document.getElementById('cardEnd')) return true;
    const res = Deck.settle(rep);
    // a card the catalog no longer carries (an older run's grant) never reaches a renderer
    const cards = (res.ok ? res.cards : []).filter(c => c && Deck.card(c.id));
    const prior = this._runs[rep.key];
    const claimed = prior != null ? prior : (res.again ? cards.length : 0);
    this._runs[rep.key] = claimed;
    const sc = Score.compute(win);
    this._view = {
      key: rep.key, win, cause: rep.cause, cards, claimed, shown: claimed,
      ok: !!res.ok, why: res.why || '', score: sc.total, cw: this._cardW(),
      // a defeat that fell short shows how far it got (Deck.eligible): the
      // row of pips counts whatever is missing — the deeds, else the days
      pips: (!res.ok && Deck.eligible(rep).pips) || null,
    };
    // a fresh run plays its reveal; a resumed or already-told one just stands there
    const fresh = prior == null && !res.again, play = fresh && !this.reduced();
    this._armBoard(win, sc, opts.msg);
    this._render(play, fresh);
    // the world board, exactly as the victory scene posts it (Screens._offerSubmit)
    if (win) Screens._offerSubmit();
    return true;
  },

  /* THE BOARD'S OWN NODES ARE LENT, NEVER COPIED. Screens' board flow
     (_offerSubmit, submitScore, _promptName, _note) writes #nameRow,
     #arcadeName, #savedNote and #vicRank by id, and tests/board-post.mjs pins
     #nameRow inside #victoryScene. So the reward screen borrows the real ones
     into its own slots while it is up — one name box in the document, one
     code path posting the run — and hands each back to the exact place it
     came from the moment the old scenes are drawn again. */
  LEND: [['vicRank', '.ceRank'], ['nameRow', '.ceBoard'], ['savedNote', '.ceBoard']],
  _home: null,
  _lend() {
    const root = document.getElementById('cardEnd');
    if (!root) return;
    if (!this._home) this._home = {};
    for (const [id, sel] of this.LEND) {
      const el = document.getElementById(id), slot = root.querySelector(sel);
      if (!el || !slot) continue;
      if (!this._home[id]) this._home[id] = { parent: el.parentNode, next: el.nextSibling };
      slot.appendChild(el);
    }
  },
  _giveBack() {
    if (!this._home) return;   // nothing was ever lent: the switch-off path costs one compare
    // in reverse, so a node whose recorded neighbour was another lent node finds it home first
    for (let i = this.LEND.length - 1; i >= 0; i--) {
      const id = this.LEND[i][0], h = this._home[id], el = document.getElementById(id);
      if (h && el && h.parent) h.parent.insertBefore(el, h.next && h.next.parentNode === h.parent ? h.next : null);
    }
    this._home = null;
    const scr = document.getElementById('scrEndgame');
    if (scr) scr.classList.remove('ceMode');
  },
  /* Screens' board fields, armed the way its victory scene arms them (and
     cleared the way its defeat scene clears them): the run's entry is
     captured NOW, because a post can outlive this screen. */
  _armBoard(win, sc, msg) {
    Screens._score = win ? sc : null;
    /* `cards_played`: how many this run played — a card-assisted run is
       MARKED on the board (approved at Gate 1). Two wins never go up at all:
       a TEST deck's (?cards=all — every card in the catalog, dealt free, is
       nobody's record), and any card-assisted win while the board cannot
       wear the mark: Backend.submitScore sends named parameters only, and
       until submit_score learns p_cards_played (Backend.BOARD_MARKS_CARDS)
       an assisted score would stand UNMARKED beside real players' — the one
       thing the mark exists to prevent. Said in the score box's note line,
       so the missing name box is never a mystery. */
    const played = this._playedN();
    const hold = !win ? '' : (played && Deck.isTest()) ? 'Test-deck run — not posted to the world board.'
      : (played && !(window.Backend && Backend.BOARD_MARKS_CARDS)) ? 'Card-assisted — kept off the world board until it can wear the mark.' : '';
    Screens._entry = win && !hold ? { score: sc.total, mode: S.mode, day: S.day, seed: S.seed, cards_played: played } : null;
    Screens._submitted = false;
    Screens._leaveWarned = false;
    if (win) Screens._winMsg = msg || '';
    for (const id of ['vicRank', 'hsBanner', 'nameRow', 'savedNote']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    const note = document.getElementById('savedNote');
    if (note) note.textContent = '';   // never let a prior run's note linger
    if (hold && note) { note.textContent = hold; note.style.color = 'var(--dim)'; note.style.display = 'block'; }
    const board = document.getElementById('endBoard');
    if (board) board.innerHTML = '';
  },

  /* The card is shown at a WHOLE multiple of device pixels (Deck.fit). A
     phone gets the authored 176px card; a short phone the next size down
     where that still reads; a wide window the doubled card, as tall as the
     window has room for beside the score. */
  _cardW() {
    const { w, h } = this._vp();
    if (w >= 900 && w / h >= 1.25) return Deck.fit(Math.min(352, (h - 170) / 296 * 176)).w;
    const f = Deck.fit(h >= 720 ? 176 : 132);
    return f.w >= 110 ? f.w : Deck.fit(176).w;
  },

  _rootEl() { return document.getElementById('cardEnd'); },
  _after(ms, fn) {
    const gen = this._gen;
    this._timers.push(setTimeout(() => { if (gen === this._gen && Screens.current === 'endgame') fn(); }, ms));
  },
  _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    if (this._countRaf) cancelAnimationFrame(this._countRaf);
    this._countRaf = 0;
  },

  // the line over the banner: what kind of ending this was, in a few words
  EYEBROW: {
    wonder: 'A wonder of the age', hard: 'A clan of legend', moderate: 'The valley is yours', calm: 'A new dawn rises',
    struck: 'The banner is struck', loss: 'The fire has gone out',
  },
  _eyebrow(v) {
    const E = this.EYEBROW;
    if (!v.win) return v.cause === 'struck_banner' ? E.struck : E.loss;
    if (v.cause === 'wonder') return E.wonder;
    return E[S.mode] || E.moderate;
  },

  _render(play, fresh) {
    const v = this._view;
    this._clearTimers();
    this._gen++;
    this._ready = !play;
    this._cued = !fresh;   // the ending's sting is owed once, to a fresh run
    this._flying = false;
    // the lent nodes leave before the old markup does, or they would be destroyed with it
    this._giveBack();
    document.getElementById('scrEndgame').classList.add('ceMode');
    let root = this._rootEl();
    if (!root) {
      root = document.createElement('div');
      root.id = 'cardEnd';
      document.getElementById('scrEndgame').appendChild(root);
      root.addEventListener('click', e => this._click(e));
    }
    root.className = v.win ? 'ceWin' : 'ceLoss';
    const mode = (typeof G !== 'undefined' && G.modeCfg) ? G.modeCfg().name : '';
    const lau = v.win ? '<canvas class="ceBL" aria-hidden="true"></canvas>' : '';
    root.innerHTML =
      '<canvas class="ceBg" aria-hidden="true"></canvas><i class="ceVig"></i><i class="ceLines"></i>' +
      `<button class="ceDeck" type="button" data-act="deck" aria-label="Your cards">${this.DECK_SVG}<b class="ceDeckN"></b></button>` +
      '<div class="ceFly"></div>' +
      '<div class="ceScroll"><div class="ceCol"><div class="ceIn">' +
        `<p class="ceEye"><i></i><span>${this.esc(this._eyebrow(v))}</span><i></i></p>` +
        `<div class="ceBan"><i class="ceTail l"></i><i class="ceTail r"></i><div class="ceRib">${lau}<b>${v.win ? 'Victory' : 'Defeat'}</b>${lau}</div></div>` +
        '<div class="ceMain">' +
          '<div class="ceStage">' +
            '<i class="ceGlow"></i><i class="ceRays"><i></i></i><i class="ceRays b"><i></i></i>' +
            '<canvas class="ceLaurel l" aria-hidden="true"></canvas><canvas class="ceLaurel r" aria-hidden="true"></canvas>' +
            '<i class="ceShaft"></i><i class="ceFlash"></i>' +
            '<canvas class="cePlinth" aria-hidden="true"></canvas><i class="ceTopGlow"></i><i class="ceSlit"></i>' +
            '<div class="ceClip"><div class="ceMove" data-act="card"></div></div>' +
            '<div class="ceSparks" aria-hidden="true"></div>' +
            '<div class="ceWhy"><b>No card this run</b><span></span><i class="cePips" aria-hidden="true"></i></div>' +
          '</div>' +
          '<div class="ceInfo">' +
            '<div class="cePlate" style="--i:0"><small></small><b></b></div>' +
            '<div class="ceScore" style="--i:1"><small>Final score</small><b class="ceScoreN">0</b>' +
              /* A CARD-ASSISTED RUN SAYS SO (approved at Gate 1: marked on the
                 end screen, in telemetry and on the board), in the score's own
                 box — the one block the board's name box never hides — and ON
                 the day's line, so the mark costs the screen no height (a line
                 of its own pushed the phone's reward past its fold) */
              `<p class="ceMeta"><span class="ceDay">Day ${S.day}${mode ? ' · ' + this.esc(mode) : ''}</span>` +
              (this._playedN() ? `<span class="ceAssist">${this.DECK_SVG}<span>Card-assisted</span></span>` : '') + '</p>' +
              '<div class="ceRank"></div><div class="ceBoard"></div></div>' +
            `<p class="cePlayed" style="--i:2"><small>Cards played this run</small><span>${this.esc(this._playedLine())}</span></p>` +
            `<div class="ceTile" style="--i:3">${this.DECK_SVG}<b class="ceTileN"></b><small>Cards in<br>your deck</small></div>` +
            '<div class="ceBtns" style="--i:4">' +
              '<button class="ceBtn gold ceClaim" type="button" data-act="claim"><i class="ceDia"></i>Claim reward<i class="ceDia"></i></button>' +
              '<div class="ceRow"><button class="ceBtn" type="button" data-act="replay">Replay</button>' +
                '<button class="ceBtn" type="button" data-act="menu">Menu</button></div>' +
              '<button class="ceBtn navy" type="button" data-act="board">Leaderboard</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div></div></div>';
    const u = v.cw / Deck.W;
    root.style.setProperty('--cw', v.cw + 'px');
    root.style.setProperty('--ch', (v.cw * Deck.H / Deck.W) + 'px');
    root.style.setProperty('--u', u + 'px');
    this._paintBg(root.querySelector('.ceBg'), v.win);
    this._paintPlinth(root.querySelector('.cePlinth'), v.win);
    if (v.win) root.querySelectorAll('.ceBL').forEach((c, i) => this._paintLaurel(c, 44, i === 1));
    root.querySelectorAll('.ceLaurel').forEach((c, i) => this._paintLaurel(c, 150, i === 1));
    this._lend();
    this._setButtons(v.claimed >= v.cards.length ? 'done' : 'claim');
    this._paintCounts();

    // what stands on the plinth: the next card to claim, or nothing
    const first = v.cards[v.claimed];
    const T = this._timeline(first ? first.tier : null, true);
    root.style.setProperty('--t-info', T.info);
    this._stageCard(v.claimed, play, true);
    const scoreEl = root.querySelector('.ceScoreN');
    if (!play) {
      scoreEl.textContent = v.score.toLocaleString();
      if (this.reduced()) root.classList.add('ceCalm');
      // less motion is not less sound: a fresh ending still sounds its sting
      this._sting();
      return;
    }
    root.classList.add('ceIntro');
    this._after(400, () => this._sting());
    this._after(T.info + 70, () => this._countUp(scoreEl, v.score, 720));
    this._after(T.info + 5 * 70 + 420, () => root.classList.remove('ceIntro'));
  },

  /* the run's own timeline for one card: the first card waits for the
     banner (intro); a bonus card rises as soon as the last one lands */
  _timeline(tier, intro) {
    const R = this.REVEAL[tier] || null;
    if (!R) return { at: 0, hold: 0, rise: 0, settle: intro ? 420 : 0, info: intro ? 380 : 0 };
    const at = (intro ? R.at : 80) + R.hold;
    const settle = at + R.rise;
    return { at, hold: R.hold, rise: R.rise, settle, info: intro ? Math.max(380, settle - 120) : 0 };
  },

  /* put card i on the plinth (or nothing, when every card is claimed or
     none was earned) and, if asked, play its rise */
  _stageCard(i, play, intro) {
    const v = this._view, root = this._rootEl();
    const st = root.querySelector('.ceStage'), move = root.querySelector('.ceMove');
    const c = v.cards[i] || null;
    move.innerHTML = '';
    st.classList.remove('ceReveal', 'ceRising', 'ceIdle');
    st.dataset.tier = c ? c.tier : (v.cards.length ? v.cards[v.cards.length - 1].tier : 'none');
    const tierK = c ? c.tier : st.dataset.tier;
    const fx = this.FX[tierK] || this.FX.stone, t = Deck.TIERS.find(x => x.k === tierK) || Deck.TIERS[0];
    st.style.setProperty('--glow', t.glow);
    st.style.setProperty('--tc', t.col);
    st.style.setProperty('--glow-o', fx.glow);
    st.style.setProperty('--ray-o', fx.rays);
    st.style.setProperty('--ray2-o', fx.rays2);
    st.classList.toggle('ceLaurels', !!fx.laurel && !!c);
    st.classList.toggle('ceFlashy', !!fx.flash);
    st.classList.toggle('ceHolds', !!(this.REVEAL[tierK] && this.REVEAL[tierK].hold));
    this._sparks(root.querySelector('.ceSparks'), c ? fx.sparks : 0, tierK);
    const why = root.querySelector('.ceWhy');
    why.style.display = v.ok ? 'none' : '';
    why.querySelector('span').textContent = v.why;
    /* …AND SHOWS IT: one pip a deed, the ones done lit — the words say the
       count, the row lets the eye take it in before the words are read */
    const pips = why.querySelector('.cePips');
    pips.textContent = '';
    if (v.pips) for (let i = 0; i < v.pips.of; i++) {
      const e = document.createElement('i');
      if (i < Math.min(v.pips.n, v.pips.of)) e.className = 'on';
      pips.appendChild(e);
    }
    this._plate(c);
    if (!c) {
      // nothing on the plinth: the light goes down to an ember, and the
      // reason (if any) stands where the card would have
      st.classList.toggle('ceIdle', v.cards.length > 0);
      st.classList.add('ceEmpty');
      this._ready = true;
      return;
    }
    st.classList.remove('ceEmpty');
    const face = Deck.face(c.id, { w: v.cw });
    face.setAttribute('role', 'button');
    face.setAttribute('aria-label', c.bonus ? 'Bonus card: ' + Deck.card(c.id).name : Deck.card(c.id).name);
    move.appendChild(face);
    if (!play) { this._ready = true; return; }
    const T = this._timeline(c.tier, intro);
    st.style.setProperty('--t-at', T.at);
    st.style.setProperty('--t-hold', T.hold);
    st.style.setProperty('--t-rise', T.rise);
    st.style.setProperty('--t-settle', T.settle);
    void st.offsetWidth;   // a second card restarts the same animations: the browser must see them end first
    st.classList.add('ceReveal', 'ceRising');
    this._ready = false;
    this._after(T.settle, () => this._settled());
    this._after(T.settle + 720, () => st.classList.remove('ceReveal'));
  },
  _sting() {
    if (this._cued || !this._view) return;
    this._cued = true;
    this.cue(this._view.win ? 'win' : 'lose');
  },
  _settled() {
    const root = this._rootEl(), st = root && root.querySelector('.ceStage');
    if (!st) return;
    st.classList.remove('ceRising');
    this._ready = true;
    this.cue(st.dataset.tier === 'enlight' ? 'impact' : 'done');
  },
  /* a tap during the reveal — or leaving the screen — ends it at once: the
     resting state of every element IS the settled screen, so dropping the
     animation classes is the whole of a skip */
  _skip() {
    const root = this._rootEl();
    if (!root) return;
    const counting = !!this._countRaf;
    this._clearTimers();
    root.classList.remove('ceIntro');
    const st = root.querySelector('.ceStage');
    if (st) st.classList.remove('ceReveal', 'ceRising');
    if (this._view && (counting || root.querySelector('.ceScoreN').textContent === '0'))
      root.querySelector('.ceScoreN').textContent = this._view.score.toLocaleString();
    this._sting();
    this._ready = true;
    /* a card the skip caught between two (the bonus, staged on a timer
       after the first one lands) is put on the plinth now: whatever the
       player does next, the bonus is SEEN before it can be claimed */
    const v = this._view;
    if (v && v.claimed < v.cards.length && !this._flying && !root.querySelector('.ceMove .ccard'))
      this._stageCard(v.claimed, false, false);
  },

  _plate(c) {
    const v = this._view, root = this._rootEl();
    const plate = root.querySelector('.cePlate'), kick = plate.querySelector('small'), name = plate.querySelector('b');
    if (c) {
      const t = Deck.tier(c.tier);
      plate.style.setProperty('--tc', t.col);
      kick.innerHTML = `<span>${c.bonus ? 'Bonus card' : 'Reward card'}</span><em>${this.esc(t.name)}</em>`;
      name.textContent = Deck.card(c.id).name;
    } else if (v.cards.length) {
      plate.style.removeProperty('--tc');
      kick.textContent = 'Added to your deck';
      // the same card twice reads "Harvest Festival ×2", never "… & Harvest Festival"
      const n = {};
      for (const x of v.cards) n[x.id] = (n[x.id] || 0) + 1;
      name.textContent = Object.keys(n).map(id => Deck.card(id).name + (n[id] > 1 ? ' ×' + n[id] : '')).join(' & ');
    } else {
      plate.style.removeProperty('--tc');
      kick.textContent = 'Reward card';
      name.textContent = 'Not earned';
    }
  },

  _playedN() { return (S.deck && Array.isArray(S.deck.played)) ? S.deck.played.filter(x => x && Deck.card(x.id)).length : 0; },
  _playedLine() {
    const p = (S.deck && Array.isArray(S.deck.played)) ? S.deck.played : [];
    if (!p.length) return 'None';
    const n = {}, order = [];
    for (const x of p) { if (!Deck.card(x.id)) continue; if (!n[x.id]) order.push(x.id); n[x.id] = (n[x.id] || 0) + 1; }
    return order.map(id => Deck.card(id).name + (n[id] > 1 ? ' ×' + n[id] : '')).join(', ') || 'None';
  },

  _setButtons(state) {
    const root = this._rootEl(), b = root.querySelector('.ceBtns');
    b.dataset.s = state;
    root.classList.toggle('ceDone', state === 'done');
  },

  /* the deck's count as the player should SEE it: the collection minus the
     cards still waiting on the plinth, so a claim visibly adds one */
  _paintCounts(bump) {
    if (!window.Deck || !Deck.on()) return;
    const total = Deck.total();
    const t = document.querySelector('#btnTitleCards .clN');
    if (t) t.textContent = String(total);
    const v = this._view, root = this._rootEl();
    if (v && root && root.querySelector('.ceDeckN')) {
      const shown = Math.max(0, total - (v.cards.length - v.shown));
      for (const sel of ['.ceDeckN', '.ceTileN']) {
        const el = root.querySelector(sel);
        el.textContent = String(shown);
        if (bump && !this.reduced()) el.animate(this.BUMP, { duration: 420, easing: 'ease-out' });
      }
      if (bump && !this.reduced()) root.querySelector('.ceDeck svg').animate(this.BUMP, { duration: 460, easing: 'ease-out' });
    }
    if (Screens.current === 'cards' && !this._zoomed) this._renderCollection();
  },
  BUMP: [{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.35 }, { transform: 'scale(0.94)', offset: 0.68 }, { transform: 'scale(1)' }],

  _countUp(el, to, ms) {
    const t0 = performance.now(), gen = this._gen;
    const step = now => {
      if (gen !== this._gen) return;
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e).toLocaleString();
      this._countRaf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    this._countRaf = requestAnimationFrame(step);
  },

  _click(e) {
    const a = e.target.closest('[data-act]');
    if (!a) {
      // a tap anywhere during the reveal hurries it along
      if (!this._ready) this._skip();
      return;
    }
    const act = a.dataset.act;
    if (act === 'card') return this._tapCard();
    if (act === 'claim') return this.claim();
    if (this._flying) return;
    if (act === 'deck') {
      this._skip();
      const v = this._view, last = v && (v.cards[Math.max(0, v.shown - 1)] || v.cards[0]);
      return this.openCollection('endgame', last ? last.tier : null);
    }
    if (act === 'board') { this._skip(); Screens.backTo = 'endgame'; Screens.show('leaders'); return; }
    // REPLAY and MENU leave through Screens' own door, which posts the
    // run to the board on the way out exactly as the old scenes did
    if (act === 'replay') { this._skip(); Screens.endReplay(); return; }
    if (act === 'menu') { this._skip(); Screens.endMenu(); }
  },
  _tapCard() {
    if (!this._ready) { this._skip(); return; }
    const face = this._rootEl().querySelector('.ceMove .ccard');
    if (!face) return;
    face.classList.toggle('flip');
    this.cue('ok');
  },

  /* CLAIM: the card flies to the deck at the top of the screen and the
     count there ticks up as it lands. The bookkeeping happens at the tap —
     a player who leaves mid-flight comes back to a claimed card — and the
     flight is only the picture of it. A bonus card rises once the first has
     landed. */
  claim() {
    const v = this._view, root = this._rootEl();
    if (!v || !root || this._flying || v.claimed >= v.cards.length) return;
    /* a tap during the reveal only hurries it along — the button is
       still invisible then, and a tap where it is about to appear must
       not take a card the player has not yet seen rise */
    if (!this._ready) { this._skip(); return; }
    // nothing on the plinth means nothing to claim: show it first (the skip stages it)
    if (!root.querySelector('.ceMove .ccard')) { this._skip(); return; }
    v.claimed++;
    this._runs[v.key] = v.claimed;
    this._flying = true;
    const face = root.querySelector('.ceMove .ccard'), deck = root.querySelector('.ceDeck svg');
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      if (face && face.isConnected) face.remove();
      this._flying = false;
      v.shown = v.claimed;
      this._paintCounts(true);
      this.cue('bond');
      const st = root.querySelector('.ceStage');
      if (v.claimed < v.cards.length) {
        this._after(this.reduced() ? 0 : 240, () => this._stageCard(v.claimed, !this.reduced(), false));
        if (st) st.classList.add('ceIdle');
        return;
      }
      this._stageCard(v.claimed, false, false);
      this._setButtons('done');
      if (!this.reduced()) root.querySelector('.ceBtns').animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    };
    if (!face || !deck || this.reduced()) {
      if (face) face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
      setTimeout(land, face ? 190 : 0);
      return;
    }
    face.classList.remove('flip');
    const rr = root.getBoundingClientRect(), fr = face.getBoundingClientRect(), dr = deck.getBoundingClientRect();
    // the flight leaves the plinth's clip and the scroller: it is lifted onto
    // a layer over the whole screen, at the exact spot it stood
    face.style.left = (fr.left - rr.left) + 'px';
    face.style.top = (fr.top - rr.top) + 'px';
    root.querySelector('.ceFly').appendChild(face);
    const dx = dr.left + dr.width / 2 - (fr.left + fr.width / 2), dy = dr.top + dr.height / 2 - (fr.top + fr.height / 2);
    const s = Math.max(0.06, dr.width / fr.width);
    const anim = face.animate([
      { transform: 'none', opacity: 1 },
      { transform: 'translate(0, -16px) scale(1.05) rotate(-2deg)', opacity: 1, offset: 0.2 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-14deg)`, opacity: 1, offset: 0.88 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s * 0.7}) rotate(-14deg)`, opacity: 0 },
    ], { duration: this.FLY_MS, easing: 'cubic-bezier(.45,0,.35,1)', fill: 'forwards' });
    anim.onfinish = land;
    // a flight the browser never finishes (a backgrounded tab throttles it to
    // a crawl) must still land the card
    setTimeout(land, this.FLY_MS + 500);
  },

  /* ---------------- sparks: pixel motes that drift up through the light ---------------- */
  _sparks(box, n, tier) {
    box.innerHTML = '';
    const ember = tier === 'enlight';
    const cols = {
      stone: ['#e6dfcf', '#bdb5a3'], bronze: ['#ffc58a', '#e8904a'], iron: ['#e2f0ff', '#9cc4f0'],
      imperial: ['#fff3c2', '#ffd76a'], enlight: ['#ffd56a', '#ff9a3a', '#fff0b0'],
    }[tier] || ['#e6dfcf'];
    let html = '';
    for (let i = 0; i < n; i++) {
      const sz = ember ? 2 + (Math.random() * 3 | 0) : 2 + (Math.random() * 2 | 0);
      const x = 8 + Math.random() * 84, y = ember ? 55 + Math.random() * 45 : 20 + Math.random() * 70;
      const d = (ember ? 1.6 : 2.6) + Math.random() * 2.2;
      html += `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--s:${sz}px;--sc:${cols[i % cols.length]};` +
        `--dx:${((Math.random() - 0.5) * 40).toFixed(0)}px;--dy:${-(ember ? 120 + Math.random() * 120 : 50 + Math.random() * 70).toFixed(0)}px;` +
        `animation-duration:${d.toFixed(2)}s;animation-delay:${(-Math.random() * d).toFixed(2)}s"></i>`;
    }
    box.innerHTML = html;
  },

  /* ================= THE PICTURES =================
     All three are pixel art painted once into small canvases and blown up
     nearest-neighbour: the backdrop at about four screen pixels a pixel,
     the plinth and the laurels at the card's own density, so they read as
     part of the same picture as the card standing on them. */

  /* the land at dusk (a win) or under a cold night (a loss): a sky in hard
     bands, two ranges, a hall on the far ridge — whole, or broken and
     smoking — pines down both sides, and a river catching the light. Its
     shapes are the run's own (seeded off S.seed), its job is mood: the
     vignette keeps it well under the card. */
  _paintBg(cv, win) {
    const vp = this._vp(), k = Math.max(4, vp.w / 340, vp.h / 260);
    const W = Math.max(60, Math.round(vp.w / k)), H = Math.max(60, Math.round(vp.h / k));
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return;
    const img = g.createImageData(W, H), d = img.data;
    const rnd = mulberry32(hashSeed('cards-end:' + String(S.seed)));
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const P = win ? {
      sky: ['#0b0807', '#160e0a', '#24160d', '#382010', '#542e13', '#784018', '#9c5720', '#c0732c'],
      glow: [216, 140, 56], far: '#33201a', farRim: '#7e4a24', hall: '#21140e', lit: '#e6a446',
      near: '#1b120c', nearRim: '#4c2e17', tree: '#0d0b07', treeRim: '#3c2a14', ground: '#0f0a07', water: ['#6e4019', '#a6662a', '#e3a24e'],
    } : {
      sky: ['#030408', '#05080f', '#080d19', '#0c1424', '#111b31', '#16223d', '#1d2b4a', '#243556'],
      glow: [70, 96, 140], far: '#111829', farRim: '#2c3c5a', hall: '#0a0e18', lit: '#c84a26',
      near: '#0a0e18', nearRim: '#1b273e', tree: '#05070c', treeRim: '#162036', ground: '#05070b', water: null,
    };
    const set = (x, y, c, a) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4, rgb = typeof c === 'string' ? hex(c) : c;
      const al = a == null ? 1 : a;
      d[i] = d[i] * (1 - al) + rgb[0] * al; d[i + 1] = d[i + 1] * (1 - al) + rgb[1] * al; d[i + 2] = d[i + 2] * (1 - al) + rgb[2] * al; d[i + 3] = 255;
    };
    const hy = Math.round(H * 0.56);
    // sky: hard bands, and a glow behind where the card stands, quantized the same way
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const band = Math.min(P.sky.length - 1, Math.floor(Math.min(1, y / hy) * P.sky.length));
      set(x, y, P.sky[band]);
      const gx = (x - W / 2) / (W * 0.42), gy = (y - hy * 0.92) / (H * 0.42);
      const gl = Math.max(0, 1 - Math.sqrt(gx * gx + gy * gy));
      if (gl > 0) set(x, y, P.glow, Math.floor(gl * 4) / 4 * (win ? 0.32 : 0.22));
    }
    if (!win) for (let i = 0; i < W * H / 180; i++) {
      const x = rnd() * W | 0, y = rnd() * hy * 0.8 | 0;
      set(x, y, rnd() < 0.2 ? '#d6deea' : '#6f7c96');
    }
    const ph = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3, rnd() * 6.3];
    const ridge = (x, base, amp, f) => {
      const u = x / W, side = 0.55 + 0.9 * Math.abs(u - 0.5);   // lower in the middle, behind the card
      return Math.round(base - H * amp * side * (0.6 + 0.4 * Math.sin(u * 7 * f + ph[0]) * 0.6 +
        0.25 * Math.sin(u * 17 * f + ph[1]) + 0.12 * Math.sin(u * 41 * f + ph[2])));
    };
    const far = [], near = [];
    for (let x = 0; x < W; x++) { far[x] = ridge(x, hy, 0.17, 1); near[x] = ridge(x, hy + H * 0.08, 0.07, 1.7); }
    for (let x = 0; x < W; x++) {
      for (let y = Math.max(0, far[x]); y < H; y++) set(x, y, P.far);
      set(x, far[x], P.farRim);
    }
    // the hall on the far ridge, right of centre: whole and lit after a win,
    // broken and smoking after a loss
    {
      const x0 = Math.round(W * 0.74), base = far[x0] + 1, u = Math.max(2, Math.round(W / 70));
      const parts = win ? [[0, 3, 7], [3, 6, 5], [6, 9, 9], [9, 12, 4], [12, 15, 6]] : [[0, 3, 4], [3, 6, 2], [6, 9, 6], [12, 15, 3]];
      for (const [a, b, h] of parts) for (let x = x0 + a * u / 2; x < x0 + b * u / 2; x++) for (let y = base - h * u / 2; y < base + 3; y++) set(x | 0, y | 0, P.hall);
      if (win) { for (let x = x0; x < x0 + 7.5 * u; x += u) set(x | 0, (base - 7 * u / 2 - 1) | 0, P.hall); set((x0 + 3.6 * u) | 0, (base - 2 * u / 2) | 0, P.lit); set((x0 + 5 * u) | 0, (base - 3 * u / 2) | 0, P.lit); }
      else for (let i = 0; i < 26; i++) {   // the last of the smoke, thinning as it climbs
        const t = i / 26, x = (x0 + 4 * u + Math.sin(t * 9) * 2 + t * 10) | 0, y = (base - 3 * u - t * H * 0.3) | 0;
        set(x, y, '#4a5670', 0.45 * (1 - t)); set(x + 1, y, '#3a4458', 0.35 * (1 - t));
      }
    }
    for (let x = 0; x < W; x++) {
      for (let y = Math.max(0, near[x]); y < H; y++) set(x, y, y > H * 0.86 ? P.ground : P.near);
      set(x, near[x], P.nearRim);
    }
    if (P.water) {
      // a river winding out of the hills toward the foot of the screen, holding the sky's light
      for (let y = near[(W * 0.7) | 0] + 2; y < H; y++) {
        const t = (y - hy) / (H - hy), cx = W * (0.68 + 0.1 * t) + Math.sin(t * 6 + ph[3]) * W * 0.04, hw = 0.5 + t * W * 0.05;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
          set(x, y, P.water[(y + x) % 7 === 0 ? 2 : (y % 3 === 0 ? 1 : 0)], 0.85);
        }
      }
    } else for (let y = hy - 4; y < hy + H * 0.12; y++) for (let x = 0; x < W; x++) {
      // the valley mist, in two thin hard bands
      if ((y + (x >> 3)) % 5 < 2) set(x, y, '#54627e', 0.12);
    }
    // pines down both sides, the near ones last; each takes a rim of light on the side facing the card
    const trees = [];
    for (let i = 0; i < Math.round(W * 0.16); i++) {
      const left = i % 2 === 0, x = left ? rnd() * W * 0.27 : W - rnd() * W * 0.27;
      trees.push({ x: Math.round(x), base: Math.round(hy + H * (0.04 + rnd() * 0.42)), left });
    }
    trees.sort((a, b) => a.base - b.base);
    for (const t of trees) {
      const h = Math.round(H * (0.07 + (t.base - hy) / H * 0.42) * (0.8 + rnd() * 0.4)), w = Math.max(3, h * 0.42);
      for (let yy = 0; yy < h; yy++) {
        const k2 = yy / h, tier = (yy % Math.max(3, h / 5 | 0)) / Math.max(3, h / 5 | 0);
        const half = Math.max(0.5, w / 2 * (k2 * 0.75 + tier * 0.3));
        const y = t.base - h + yy;
        for (let x = Math.round(t.x - half); x <= Math.round(t.x + half); x++) set(x, y, P.tree);
        set(Math.round(t.left ? t.x + half : t.x - half), y, P.treeRim, 0.8);
      }
      for (let y = t.base; y < H; y++) set(t.x, y, P.tree);
    }
    g.putImageData(img, 0, 0);
  },

  /* THE PLINTH: a round drum of dressed stone, mossy on a win and cold on
     a loss, with a slit across its top the card rises out of. 232 x 70 art
     pixels, its top surface centred 18 pixels down — the card stands on
     that line (the stage's CSS reads the same two numbers). */
  PLINTH: { w: 232, h: 70, ty: 18 },
  _paintPlinth(cv, win) {
    const PW = this.PLINTH.w, PH = this.PLINTH.h, cx = PW / 2, ty = this.PLINTH.ty, rx = 112, ry = 15, FH = 30;
    cv.width = PW; cv.height = PH;
    const g = cv.getContext('2d');
    if (!g) return;
    const img = g.createImageData(PW, PH), d = img.data;
    const C = win ? {
      ink: '#15100b', foot: '#0f0b08', face: ['#2c261e', '#40382c', '#565040', '#6c6450'], mortar: '#1e1913',
      top: ['#4c4536', '#5f5746', '#736a56', '#8c826a'], slit: '#060403', lip: '#a69a7e', moss: ['#2b4219', '#3f5e24', '#5a7e32'],
    } : {
      ink: '#0b0d12', foot: '#07090c', face: ['#1c2129', '#283039', '#36404b', '#454f5c'], mortar: '#11151b',
      top: ['#2f3742', '#3a4450', '#47525f', '#566270'], slit: '#030405', lip: '#6e7a8a', moss: ['#1f2a26', '#2b3a33', '#3a4c42'],
    };
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= PW || y >= PH) return;
      const i = (y * PW + x) * 4, rgb = hex(c);
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    };
    const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    // the footing it stands on
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const ex = (x + 0.5 - cx) / (rx + 5), ey = (y + 0.5 - (ty + FH + 3)) / (ry + 4), e = ex * ex + ey * ey;
      if (e <= 1) put(x, y, e > 0.86 ? C.ink : C.foot);
    }
    // the drum's face: courses of blocks bending round the curve, lit from the front-left
    for (let x = 0; x < PW; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (Math.abs(dx) >= 1) continue;
      const yt = ty + ry * Math.sqrt(1 - dx * dx), yb = yt + FH, th = Math.asin(dx);
      const lightK = Math.max(0, Math.min(3, Math.floor((Math.cos(th + 0.45) * 0.9 + 0.1) * 4)));
      for (let y = Math.floor(yt); y <= Math.ceil(yb); y++) {
        const v = y - yt, course = Math.floor(v / 10);
        const deg = th * 180 / Math.PI + (course % 2) * 9, blk = Math.floor(deg / 18);
        const prev = Math.floor((Math.asin(Math.max(-1, (x - 0.5 - cx) / rx)) * 180 / Math.PI + (course % 2) * 9) / 18);
        let c;
        if (y >= Math.floor(yb) || Math.abs(dx) > 0.985) c = C.ink;
        else if ((v % 10 < 1 && v > 1) || blk !== prev) c = C.mortar;
        else c = C.face[Math.max(0, Math.min(3, lightK + (hash(blk, course) < 0.3 ? -1 : hash(blk, course) > 0.85 ? 1 : 0)))];
        put(x, y, c);
      }
    }
    // the top: a ring of radial blocks round worn flagstones, the far rim catching the light
    for (let y = 0; y < ty + ry + 1; y++) for (let x = 0; x < PW; x++) {
      const ex = (x + 0.5 - cx) / rx, ey = (y + 0.5 - ty) / ry, r = Math.sqrt(ex * ex + ey * ey);
      if (r > 1) continue;
      const ang = (Math.atan2(ey, ex) * 180 / Math.PI + 360) % 360;
      let c;
      if (r > 0.955) c = C.ink;
      else if (r > 0.86 && ey < 0) c = C.top[3];
      else if (Math.abs(r - 0.66) < 0.035 || (r > 0.66 && ang % 20 < 1.7)) c = C.mortar;
      else if (r > 0.66) c = C.top[ey < -0.2 ? 2 : 1 + (hash(Math.floor(ang / 20), 1) < 0.4 ? 1 : 0)];
      else c = C.top[(hash(x >> 3, y >> 2) < 0.25 ? 0 : 1) + (ey < -0.3 ? 1 : 0)];
      put(x, y, c);
    }
    // the slit the card comes out of, with a lit lip below it
    for (let x = cx - 90; x <= cx + 90; x++) { put(x, ty, C.slit); put(x, ty + 1, C.lip); }
    put(cx - 91, ty, C.ink); put(cx + 90, ty, C.ink);
    // moss along the front rim, a few tongues hanging down the face
    const rnd = mulberry32(win ? 7 : 11);
    for (let i = 0; i < 16; i++) {
      const dx = (rnd() * 1.8 - 0.9), x0 = Math.round(cx + dx * rx), yt = Math.round(ty + ry * Math.sqrt(1 - dx * dx));
      const w = 3 + (rnd() * 6 | 0), drop = rnd() < 0.5 ? 1 + (rnd() * 7 | 0) : 1;
      for (let x = x0; x < x0 + w; x++) {
        const hang = x === x0 + (w >> 1) ? drop : (rnd() < 0.5 ? 1 : 2);
        for (let y = yt - 1; y < yt + hang; y++) put(x, y, C.moss[y === yt - 1 ? 2 : (y > yt + 1 ? 0 : 1)]);
      }
    }
    g.putImageData(img, 0, 0);
  },

  /* A LAUREL BRANCH, painted from a curve: a stem bowing outward, paired
     leaves along it shrinking toward the tip, each shaded light on its upper
     side, the whole thing outlined in ink. One painter makes the small sprigs
     on the banner and the tall branches beside the card; `mirror` turns the
     left one into the right. Gold from ART.PALETTE.gold. */
  _paintLaurel(cv, h, mirror) {
    const w = Math.max(6, Math.round(h * 0.5));
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (!g) return;
    const GOLD = ['#3a2508', '#8a6a1e', '#c99b32', '#e8c15a', '#fff2c0'];   // ink, then the palette's gold ramp
    const m = new Uint8Array(w * h);
    const x0 = w * 0.8, y0 = h - 1, x1 = -w * 0.15, y1 = h * 0.55, x2 = w * 0.58, y2 = 1;
    const P = t => ({ x: (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2, y: (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2 });
    const leaf = (cxL, cyL, dx, dy, L, Wd) => {
      const px = -dy, py = dx;
      for (let y = Math.floor(cyL - L); y <= cyL + L; y++) for (let x = Math.floor(cxL - L); x <= cxL + L; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const qx = x + 0.5 - cxL, qy = y + 0.5 - cyL, lx = qx * dx + qy * dy, ly = qx * px + qy * py;
        const e = (lx / (L / 2)) ** 2 + (ly / (Wd / 2)) ** 2;
        if (e > 1) continue;
        // the side of the leaf facing up the branch takes the light
        m[y * w + x] = e < 0.25 && lx > 0 ? 4 : (ly * (dx >= 0 ? 1 : -1) < 0 ? 3 : 2);
      }
    };
    const n = Math.max(3, Math.round(h / 14));
    for (let i = 0; i < n; i++) {
      const t = 0.05 + i * (0.86 / (n - 1)), p = P(t), q = P(t + 0.01);
      let tx = q.x - p.x, ty = q.y - p.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const L = h * 0.13 * (1 - 0.45 * t) + 2, Wd = Math.max(1.6, L * 0.44);
      for (const s of [-1, 1]) {
        let dx = tx + (-ty) * s * 0.95, dy = ty + tx * s * 0.95;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        leaf(p.x + dx * L * 0.5, p.y + dy * L * 0.5, dx, dy, s < 0 ? L * 1.1 : L * 0.9, Wd);
      }
    }
    { const p = P(1), q = P(0.97); let dx = p.x - q.x, dy = p.y - q.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      leaf(p.x + dx * h * 0.04, p.y + dy * h * 0.04, dx, dy, h * 0.09 + 2, Math.max(1.6, h * 0.035)); }
    for (let t = 0; t <= 1; t += 0.5 / h) {
      const p = P(t), x = Math.round(p.x), y = Math.round(p.y);
      if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
      if (t < 0.5 && x + 1 < w) m[y * w + x + 1] = 1;
    }
    const img = g.createImageData(w, h), d = img.data;
    const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = m[y * w + x];
      // an empty pixel is drawn only as the ink edge of a leaf or the stem beside it
      if (!v && !((x > 0 && m[y * w + x - 1]) || (x < w - 1 && m[y * w + x + 1]) ||
                  (y > 0 && m[(y - 1) * w + x]) || (y < h - 1 && m[(y + 1) * w + x]))) continue;
      const rgb = hex(GOLD[v]), o = (y * w + (mirror ? w - 1 - x : x)) * 4;
      d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  },

  // the deck: two cards, the front one gold-framed (16-cell pixel art)
  DECK_SVG: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">' +
    '<rect x="6" y="0" width="9" height="12" fill="#1a1006"/><rect x="7" y="1" width="7" height="10" fill="#8a5f23"/>' +
    '<rect x="8" y="2" width="5" height="8" fill="#5a3c16"/>' +
    '<rect x="1" y="3" width="10" height="13" fill="#1a1006"/><rect x="2" y="4" width="8" height="11" fill="#e8c15a"/>' +
    '<rect x="3" y="5" width="6" height="9" fill="#3a2410"/><rect x="5" y="7" width="2" height="5" fill="#f2cd62"/>' +
    '<rect x="4" y="8" width="4" height="3" fill="#f2cd62"/><rect x="5" y="8" width="2" height="2" fill="#fff6d0"/></svg>',
  CLOSE_SVG: '<svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">' +
    '<rect x="1" y="1" width="2" height="2"/><rect x="3" y="3" width="2" height="2"/><rect x="5" y="5" width="2" height="2"/><rect x="7" y="7" width="2" height="2"/>' +
    '<rect x="7" y="1" width="2" height="2"/><rect x="5" y="3" width="2" height="2"/><rect x="3" y="5" width="2" height="2"/><rect x="1" y="7" width="2" height="2"/></svg>',

  /* ================= THE COLLECTION =================
     Every card the game holds, by tier: what you own (×N), what you have
     found and since played (greyed), and what you have never seen — a dark
     silhouette with a "?" that gives away neither the art nor the name. Tap
     a card to bring it up close, tap again to turn it over. */
  _colFrom: 'title',
  _colTier: null,
  _zoomed: false,
  openCollection(from, tier) {
    if (!window.Deck || !Deck.on()) return;
    this._css();
    this._listen();
    this._colFrom = from === 'endgame' ? 'endgame' : 'title';
    this._colScreen();
    if (tier && Deck.TIERS.some(t => t.k === tier)) this._colTier = tier;
    else if (!this._colTier) this._colTier = this._latestTier();
    this._zoomClose(true);
    Screens.show('cards');
    this._renderCollection();
  },
  closeCollection() {
    this._zoomClose(true);
    if (this._colFrom === 'endgame' && typeof S !== 'undefined' && S && S.over)
      Screens.show('endgame', { win: S.over.win, msg: S.over.msg, back: true });
    else Screens.show('title');
  },
  // the tier of the card most recently found: where a player opening the
  // collection most likely wants to look
  _latestTier() {
    const seen = Deck.col().seen;
    let best = null, at = -1;
    for (const id in seen) if (Deck.card(id) && seen[id] > at) { at = seen[id]; best = id; }
    return best ? Deck.card(best).tier : 'stone';
  },
  _colScreen() {
    let scr = document.getElementById('scrCards');
    if (scr) return scr;
    scr = document.createElement('div');
    scr.className = 'screen';
    scr.id = 'scrCards';
    scr.innerHTML =
      '<header class="shead"><button class="abtn back" type="button" data-act="back" aria-label="Back">‹</button>' +
        '<h2>Your cards</h2><b class="clHeld"></b></header>' +
      '<p class="clSum"></p>' +
      '<div class="clTabs" role="tablist"></div>' +
      '<div class="sbody clBody"><div class="clHead"></div><div class="clGrid"></div></div>' +
      `<div class="clZoom" hidden><button class="clX" type="button" data-act="unzoom" aria-label="Close">${this.CLOSE_SVG}</button>` +
        '<div class="clZCard" data-act="zflip"></div><p class="clZCap"></p></div>';
    document.getElementById('shell').appendChild(scr);
    scr.addEventListener('click', e => {
      const a = e.target.closest('[data-act], [data-tier], .clCell');
      if (!a) return;
      if (a.classList.contains('clTab')) { this._colTier = a.dataset.tier; this.cue('ok'); this._renderCollection(); return; }
      if (a.classList.contains('clCell')) { this._zoom(a); return; }
      const act = a.dataset.act;
      if (act === 'back') this.closeCollection();
      else if (act === 'unzoom') this._zoomClose(false);
      else if (act === 'zflip') this._zoomFlip();
    });
    // a tap on the dark around the enlarged card puts it back
    scr.querySelector('.clZoom').addEventListener('click', e => { if (e.target.classList.contains('clZoom')) this._zoomClose(false); });
    return scr;
  },

  /* the grid's card size: the largest whole-pixel card (Deck.fit) that
     still gives the most columns at a readable size. At a whole multiple
     the sizes come in steps (117 / 176 px on a 3x phone, 88 / 176 on a 2x),
     so the column count follows the step that fits, never the reverse. */
  _gridSize() {
    const vw = Math.min(this._vp().w, 820), pad = vw < 420 ? 6 : 14, avail = vw - pad * 2;
    for (const cols of [5, 4, 3, 2]) {
      const f = Deck.fit((avail - 4 * (cols - 1)) / cols);
      if (f.w >= this.MIN_CELL && f.w * cols + 4 * (cols - 1) <= avail + 0.01) {
        const gap = Math.max(4, Math.min(18, (avail - f.w * cols) / Math.max(1, cols - 1)));
        return { cols, w: f.w, pad, gap };
      }
    }
    return { cols: 2, w: Deck.fit((avail - 4) / 2).w, pad, gap: 4 };
  },
  _renderCollection() {
    const scr = document.getElementById('scrCards');
    if (!scr) return;
    const sel = Deck.TIERS.some(t => t.k === this._colTier) ? this._colTier : 'stone';
    const total = Deck.total(), found = Deck.CATALOG.filter(c => Deck.seen(c.id)).length;
    scr.querySelector('.clHeld').textContent = total + (total === 1 ? ' card' : ' cards');
    scr.querySelector('.clSum').textContent = `${found} of ${Deck.CATALOG.length} discovered`;
    scr.querySelector('.clTabs').innerHTML = Deck.TIERS.map(t => {
      const all = Deck.ofTier(t.k), held = all.reduce((n, c) => n + Deck.count(c.id), 0), seen = all.filter(c => Deck.seen(c.id)).length;
      return `<button class="clTab${t.k === sel ? ' sel' : ''}" type="button" role="tab" data-tier="${t.k}" aria-selected="${t.k === sel}" ` +
        `aria-label="${this.esc(t.name)}: ${held} held, ${seen} of ${all.length} discovered" style="--tc:${t.col};--tg:${t.glow}">` +
        `<i class="clGem${seen ? '' : ' dim'}"></i><span class="clTabNm">${this.esc(t.name)}</span><span class="clTabAb" aria-hidden="true">${['I', 'II', 'III', 'IV', 'V'][t.rank]}</span><b class="clTabN">${held}</b></button>`;
    }).join('');
    const t = Deck.tier(sel), cards = Deck.ofTier(sel);
    const seenN = cards.filter(c => Deck.seen(c.id)).length, pct = Math.round(100 * seenN / cards.length);
    const head = scr.querySelector('.clHead');
    head.style.setProperty('--tc', t.col);
    head.innerHTML = `<p><b>${this.esc(t.name)}</b><span>${this.esc(t.rarity)}</span></p>` +
      `<p class="clPct"><em>${seenN} of ${cards.length} discovered</em><strong>${pct}%</strong></p>` +
      `<i class="clBar"><i style="transform:scaleX(${(pct / 100).toFixed(3)})"></i></i>`;
    const gs = this._gridSize(), grid = scr.querySelector('.clGrid');
    grid.style.setProperty('--cols', gs.cols);
    grid.style.setProperty('--cell', gs.w + 'px');
    grid.style.setProperty('--gap', gs.gap + 'px');
    scr.querySelector('.clBody').style.setProperty('--pad', gs.pad + 'px');
    grid.innerHTML = '';
    for (const c of cards) {
      const cell = document.createElement('div');
      cell.className = 'clCell';
      const n = Deck.count(c.id);
      if (Deck.seen(c.id)) {
        cell.dataset.card = c.id;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', c.name + (n ? ', ' + n + ' held' : ', none held'));
        cell.appendChild(Deck.face(c.id, { w: gs.w, n, off: !n }));
      } else {
        cell.dataset.unknown = c.tier;   // the tier only: nothing in the page names the card
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', 'Undiscovered ' + t.name + ' card');
        cell.appendChild(this._silhouette(c.id, gs.w));
      }
      grid.appendChild(cell);
    }
  },
  /* AN UNDISCOVERED CARD GIVES NOTHING AWAY. Deck.face(unknown) blanks the
     art and the front's name, but its BACK still carries the name and the
     effect, and the element its id: the silhouette drops all three (and the
     kind's pennant glyph), so neither a flip nor the page's own markup can
     spoil what the card is. */
  _silhouette(id, w) {
    const el = Deck.face(id, { w, unknown: true });
    for (const sel of ['.cc-b', '.cc-ico']) { const x = el.querySelector(sel); if (x) x.remove(); }
    delete el.dataset.card;
    el.dataset.unknown = '1';
    return el;
  },

  _zoom(cell) {
    const scr = document.getElementById('scrCards'), zoom = scr.querySelector('.clZoom'), host = zoom.querySelector('.clZCard');
    const vp = this._vp();
    const w = Deck.fit(Math.min(vp.w - 48, 352, (vp.h - 190) * Deck.W / Deck.H)).w;
    const id = cell.dataset.card;
    let face, cap;
    if (id) {
      const n = Deck.count(id);
      face = Deck.face(id, { w, n, off: !n });
      cap = (n ? (n > 1 ? `${n} in your deck` : 'In your deck') : 'Played — none in your deck') + ' · tap to turn it over';
    } else {
      // any card of the tier makes the same silhouette (frame only, nothing named)
      face = this._silhouette(Deck.ofTier(cell.dataset.unknown)[0].id, w);
      cap = 'Not yet discovered — win a game, or lose one fighting, to earn a card';
    }
    host.innerHTML = '';
    host.appendChild(face);
    zoom.querySelector('.clZCap').textContent = cap;
    zoom.hidden = false;
    this._zoomed = true;
    this.cue('ok');
    if (this.reduced()) return;
    // it grows out of the card that was tapped
    const a = cell.getBoundingClientRect(), b = face.getBoundingClientRect();
    const s = a.width / b.width, dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    face.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }],
      { duration: 340, easing: 'cubic-bezier(.3,1.32,.5,1)' });
    zoom.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  },
  _zoomFlip() {
    const face = document.querySelector('#scrCards .clZCard .ccard');
    if (!face || face.dataset.unknown) return;   // a silhouette has no back to show
    face.classList.toggle('flip');
    this.cue('ok');
  },
  _zoomClose(now) {
    const zoom = document.querySelector('#scrCards .clZoom');
    this._zoomed = false;
    if (!zoom || zoom.hidden) return;
    const done = () => { zoom.hidden = true; zoom.querySelector('.clZCard').innerHTML = ''; };
    if (now || this.reduced()) { done(); return; }
    const anim = zoom.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
    anim.onfinish = done;
    setTimeout(() => { if (!this._zoomed) done(); }, 260);
  },

  /* ---------------- wiring, made on first use with the switch on ---------------- */
  _listening: false,
  _listen() {
    if (this._listening) return;
    this._listening = true;
    Deck.onChange(() => this._paintCounts());
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || Screens.current !== 'cards') return;
      if (this._zoomed) this._zoomClose(false); else this.closeCollection();
    });
  },

  _css() {
    if (document.getElementById('deckScreensCss')) return;
    const st = document.createElement('style');
    st.id = 'deckScreensCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
  },
};

/* The stylesheet, injected on first use with the switch on (never before).
   Two rules hold throughout: the HIDDEN state of anything the player must
   see lives only in a keyframe's `from` (held through the delay by `both`),
   so a reveal that never plays still shows the whole screen; and every
   moving thing moves by transform or opacity alone. */
DeckScreens.CSS = `
/* ---- the title's Cards plaque: the secondary row folds two by two ---- */
.plaques .trow3.clFour { flex-wrap: wrap; }
.plaques .trow3.clFour .abtn { flex: 1 1 calc(50% - 5px); }
#btnTitleCards .clN { min-width: 18px; height: 18px; margin-left: 8px; padding: 0 5px; border-radius: 9px;
  background: #1c140c; border: 1px solid #c9973e; color: #f2e6cd; font: 700 10.5px/16px var(--menufont);
  letter-spacing: 0; text-align: center; box-sizing: border-box; }

/* ---- the reward screen ---- */
#scrEndgame.ceMode { background: #0b0806; }
#scrEndgame.ceMode > .sbody { display: none; }
#cardEnd { display: none; position: absolute; inset: 0; overflow: hidden; color: #efe4cd;
  font-family: var(--menufont); --fc: rgba(214,170,74,0.55); --fc2: rgba(214,170,74,0.16); --ink: #f3e2b4;
  --chamfer: polygon(0 5px, 3px 5px, 3px 3px, 5px 3px, 5px 0, calc(100% - 5px) 0, calc(100% - 5px) 3px, calc(100% - 3px) 3px,
    calc(100% - 3px) 5px, 100% 5px, 100% calc(100% - 5px), calc(100% - 3px) calc(100% - 5px), calc(100% - 3px) calc(100% - 3px),
    calc(100% - 5px) calc(100% - 3px), calc(100% - 5px) 100%, 5px 100%, 5px calc(100% - 3px), 3px calc(100% - 3px), 3px calc(100% - 5px), 0 calc(100% - 5px)); }
#scrEndgame.ceMode #cardEnd { display: block; }
#cardEnd.ceLoss { --fc: rgba(140,156,178,0.5); --fc2: rgba(140,156,178,0.14); }
#cardEnd .ceBg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
#cardEnd .ceVig { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(ellipse 78% 56% at 50% 36%, rgba(8,6,4,0) 28%, rgba(8,6,4,0.55) 72%, rgba(8,6,4,0.9) 100%),
  linear-gradient(rgba(8,6,4,0.5), rgba(8,6,4,0) 16%, rgba(8,6,4,0) 46%, rgba(8,6,4,0.82) 72%, rgba(8,6,4,0.94)); }
#cardEnd .ceLines { position: absolute; pointer-events: none;
  inset: calc(var(--safe-top) + 6px) 6px calc(env(safe-area-inset-bottom, 0px) + 6px) 6px;
  border: 1px solid var(--fc2); background:
  linear-gradient(var(--fc), var(--fc)) 3px 3px / 22px 2px no-repeat, linear-gradient(var(--fc), var(--fc)) 3px 3px / 2px 22px no-repeat,
  linear-gradient(var(--fc), var(--fc)) calc(100% - 3px) 3px / 22px 2px no-repeat, linear-gradient(var(--fc), var(--fc)) calc(100% - 3px) 3px / 2px 22px no-repeat,
  linear-gradient(var(--fc), var(--fc)) 3px calc(100% - 3px) / 22px 2px no-repeat, linear-gradient(var(--fc), var(--fc)) 3px calc(100% - 3px) / 2px 22px no-repeat,
  linear-gradient(var(--fc), var(--fc)) calc(100% - 3px) calc(100% - 3px) / 22px 2px no-repeat,
  linear-gradient(var(--fc), var(--fc)) calc(100% - 3px) calc(100% - 3px) / 2px 22px no-repeat; }
#cardEnd .ceDeck { position: absolute; z-index: 3; top: calc(var(--safe-top) + 8px); right: 12px; width: 48px; height: 48px;
  padding: 0; border: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle, rgba(20,14,8,0.75) 40%, rgba(20,14,8,0) 72%); }
#cardEnd .ceDeck svg { width: 32px; height: 32px; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.6)); }
#cardEnd .ceDeckN { position: absolute; right: -2px; bottom: 2px; min-width: 20px; height: 18px; padding: 0 4px; border-radius: 9px;
  background: #1c140c; border: 1.5px solid #d4a540; color: var(--ink); font: 800 10.5px/15px var(--menufont); text-align: center; }
#cardEnd .ceFly { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
#cardEnd .ceFly .ccard { position: absolute; }
#cardEnd .ceScroll { position: absolute; inset: 0; z-index: 1; overflow-x: hidden; overflow-y: auto;
  -webkit-overflow-scrolling: touch; touch-action: pan-y; }
/* the column CLIPS: the light round the card reaches far past it, and an
   absolutely placed glow still counts toward the scroller's overflow — on a
   wide window the rays alone made the screen scroll. The column is at least
   the whole screen, so the clip only ever falls at its edges. */
#cardEnd .ceCol { min-height: 100%; display: flex; flex-direction: column; overflow: hidden; overflow: clip;
  padding: calc(var(--safe-top) + 8px) 16px calc(env(safe-area-inset-bottom, 0px) + 18px); }
/* vertical AUTO margins centre the column when it fits and start it at the
   top when it does not: justify-content: center would push an overflowing
   column's head above the scroll origin, where nobody can reach it */
#cardEnd .ceIn { margin: auto 0; width: 100%; display: flex; flex-direction: column; align-items: center; }

/* the eyebrow shares its row with the deck in the corner — a row as tall as
   the deck — so the banner below always starts clear of it */
#cardEnd .ceEye { display: flex; align-items: center; gap: 10px; width: min(360px, calc(100% - 96px)); height: 48px; margin: 0 auto 2px;
  color: #ead39b; font-size: 12px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; white-space: nowrap;
  text-shadow: 0 2px 0 rgba(0,0,0,0.85); position: relative; z-index: 2; }
#cardEnd.ceLoss .ceEye { color: #aeb8c8; }
#cardEnd .ceEye i { position: relative; flex: 1 1 0; min-width: 12px; height: 1px; background: linear-gradient(90deg, transparent, var(--fc)); }
#cardEnd .ceEye i:last-child { background: linear-gradient(90deg, var(--fc), transparent); }
#cardEnd .ceEye i::after { content: ''; position: absolute; top: -2px; width: 5px; height: 5px; background: var(--fc); transform: rotate(45deg); }
#cardEnd .ceEye i:first-child::after { right: -1px; }
#cardEnd .ceEye i:last-child::after { left: -1px; }

#cardEnd .ceBan { position: relative; z-index: 2; padding: 0 30px; margin: 0 auto;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,0.65)); }
#cardEnd .ceRib { position: relative; display: flex; align-items: center; justify-content: center; gap: 14px;
  min-width: 248px; height: 56px; padding: 0 16px; clip-path: var(--chamfer);
  background: linear-gradient(#2c3e62 0%, #1c2b4a 46%, #15213b 54%, #0f1830 100%);
  box-shadow: inset 0 0 0 2px #090e1b, inset 0 0 0 4px #d4a540, inset 0 0 0 5px #6b4e16, inset 0 0 0 6px #090e1b,
    inset 0 13px 0 rgba(170,200,255,0.07), inset 0 -10px 0 rgba(0,0,0,0.26); }
#cardEnd .ceRib b { font-size: 32px; font-weight: 900; letter-spacing: 5px; line-height: 1; text-transform: uppercase; padding-left: 5px;
  background: linear-gradient(#fff6cf 0%, #f6d77c 38%, #d9a640 64%, #a8741e 100%); -webkit-background-clip: text; background-clip: text;
  color: transparent; filter: drop-shadow(0 2px 0 #070b16); }
#cardEnd .ceBL { width: 22px; height: 44px; image-rendering: pixelated; flex: 0 0 auto; }
#cardEnd .ceTail { position: absolute; z-index: -1; top: 18px; width: 56px; height: 44px;
  background: linear-gradient(#1b2846, #0e162a); box-shadow: inset 0 2px 0 rgba(212,165,64,0.55), inset 0 -2px 0 rgba(212,165,64,0.4); }
#cardEnd .ceTail.l { left: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 15px 50%); }
#cardEnd .ceTail.r { right: 0; clip-path: polygon(0 0, 100% 0, calc(100% - 15px) 50%, 100% 100%, 0 100%); }
#cardEnd .ceTail::after { content: ''; position: absolute; bottom: 0; width: 12px; height: 8px; background: #05080f; }
#cardEnd .ceTail.l::after { right: 0; clip-path: polygon(100% 0, 100% 100%, 0 0); }
#cardEnd .ceTail.r::after { left: 0; clip-path: polygon(0 0, 100% 0, 0 100%); }
#cardEnd.ceLoss .ceRib { background: linear-gradient(#3a424e 0%, #29303a 46%, #20262e 54%, #171b22 100%);
  box-shadow: inset 0 0 0 2px #0a0c10, inset 0 0 0 4px #7f8a9a, inset 0 0 0 5px #3a414c, inset 0 0 0 6px #0a0c10,
    inset 0 13px 0 rgba(200,215,235,0.05), inset 0 -10px 0 rgba(0,0,0,0.3); }
#cardEnd.ceLoss .ceRib b { background: linear-gradient(#f1f4f8 0%, #c3ccd7 46%, #8e98a6 100%); -webkit-background-clip: text; background-clip: text; }
#cardEnd.ceLoss .ceTail { background: linear-gradient(#262c35, #161a20); box-shadow: inset 0 2px 0 rgba(127,138,154,0.5), inset 0 -2px 0 rgba(127,138,154,0.35); }

#cardEnd .ceMain { width: 100%; display: flex; flex-direction: column; align-items: center; }
/* the stage: the card stands on the plinth's slit, which is 18 art pixels
   below the plinth's top (DeckScreens.PLINTH) — so the card's foot is the
   stage's height less the 52 that hang below it */
#cardEnd .ceStage { position: relative; width: calc(var(--u) * 232); height: calc(var(--ch) + var(--u) * 52); margin-top: 6px; flex: 0 0 auto; }
#cardEnd .ceStage > i, #cardEnd .ceStage > canvas, #cardEnd .ceSparks { position: absolute; pointer-events: none; }
#cardEnd .ceGlow { left: 50%; top: calc(var(--ch) * 0.5); width: calc(var(--cw) * 2.3); height: calc(var(--ch) * 1.6);
  margin: calc(var(--ch) * -0.8) 0 0 calc(var(--cw) * -1.15); opacity: var(--glow-o);
  background: radial-gradient(closest-side, var(--glow) 0%, var(--glow) 30%, rgba(0,0,0,0) 100%); }
#cardEnd .ceRays { left: 50%; top: calc(var(--ch) * 0.48); width: calc(var(--ch) * 2.5); height: calc(var(--ch) * 2.5);
  margin: calc(var(--ch) * -1.25) 0 0 calc(var(--ch) * -1.25); opacity: var(--ray-o);
  -webkit-mask-image: radial-gradient(circle, #000 14%, rgba(0,0,0,0.5) 34%, rgba(0,0,0,0) 66%);
  mask-image: radial-gradient(circle, #000 14%, rgba(0,0,0,0.5) 34%, rgba(0,0,0,0) 66%); }
#cardEnd .ceRays.b { opacity: var(--ray2-o); }
#cardEnd .ceRays > i { position: absolute; inset: 0; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, var(--glow) 0deg 6deg, rgba(0,0,0,0) 6deg 17deg);
  animation: ceSpin 52s linear infinite; }
#cardEnd .ceRays.b > i { background: repeating-conic-gradient(from 7deg, var(--glow) 0deg 2.5deg, rgba(0,0,0,0) 2.5deg 23deg);
  animation-duration: 76s; animation-direction: reverse; }
#cardEnd .ceLaurel { display: none; bottom: calc(var(--u) * 52); width: calc(var(--u) * 75); height: calc(var(--u) * 150);
  image-rendering: pixelated; transform-origin: 50% 100%; filter: drop-shadow(0 0 calc(var(--u) * 6) rgba(255,214,110,0.35)); }
#cardEnd .ceLaurels .ceLaurel { display: block; }
#cardEnd .ceLaurel.l { right: calc(50% + var(--cw) * 0.5 - var(--u) * 16); }
#cardEnd .ceLaurel.r { left: calc(50% + var(--cw) * 0.5 - var(--u) * 16); }
#cardEnd .cePlinth { left: 50%; top: calc(var(--ch) - var(--u) * 18); width: calc(var(--u) * 232); height: calc(var(--u) * 70);
  margin-left: calc(var(--u) * -116); image-rendering: pixelated; }
#cardEnd .ceTopGlow { left: 50%; top: calc(var(--ch) - var(--u) * 16); width: calc(var(--u) * 220); height: calc(var(--u) * 30);
  margin-left: calc(var(--u) * -110); opacity: calc(var(--glow-o) * 0.75); mix-blend-mode: screen;
  background: radial-gradient(closest-side, var(--glow), rgba(0,0,0,0)); }
#cardEnd .ceSlit { left: 50%; top: calc(var(--ch) - var(--u) * 3); width: calc(var(--u) * 190); height: calc(var(--u) * 6);
  margin-left: calc(var(--u) * -95); opacity: 0; mix-blend-mode: screen;
  background: radial-gradient(closest-side, #fff8e0, var(--glow) 55%, rgba(0,0,0,0)); }
#cardEnd .ceShaft { left: 50%; top: calc(var(--ch) * -0.1); width: calc(var(--cw) * 0.9); height: calc(var(--ch) * 1.1);
  margin-left: calc(var(--cw) * -0.45); opacity: 0; transform-origin: 50% 100%; mix-blend-mode: screen;
  background: linear-gradient(rgba(0,0,0,0), var(--glow) 70%, #fff6d6); -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,0), #000 30%, #000 70%, rgba(0,0,0,0));
  mask-image: linear-gradient(90deg, rgba(0,0,0,0), #000 30%, #000 70%, rgba(0,0,0,0)); }
#cardEnd .ceFlash { left: 50%; top: calc(var(--ch) * 0.5); width: calc(var(--ch) * 1.2); height: calc(var(--ch) * 1.2);
  margin: calc(var(--ch) * -0.6) 0 0 calc(var(--ch) * -0.6); opacity: 0; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,250,230,0.95), var(--glow) 45%, rgba(0,0,0,0)); }
#cardEnd .ceClip { position: absolute; left: 50%; bottom: calc(var(--u) * 52); width: calc(var(--cw) + 80px); height: calc(var(--ch) + 60px);
  margin-left: calc(var(--cw) * -0.5 - 40px); pointer-events: none; }
#cardEnd .ceRising .ceClip { overflow: hidden; }
#cardEnd .ceMove { position: absolute; left: 40px; bottom: 0; width: var(--cw); height: var(--ch); pointer-events: auto; cursor: pointer; }
#cardEnd .ceEmpty .ceMove { pointer-events: none; }
#cardEnd .ceSparks { left: 50%; top: 0; width: calc(var(--cw) * 2); height: var(--ch); margin-left: calc(var(--cw) * -1); }
/* every card claimed: the light holds still — no endless masked spin on a phone parked here */
#cardEnd.ceDone .ceRays > i, #cardEnd.ceDone .ceSparks > i { animation-play-state: paused; }
/* the board's name box (lent in on a first win) needs the room: the played
   line and the deck tile step aside, the corner deck still carries the count */
#cardEnd:has(.ceBoard #nameRow[style*="flex"]) .cePlayed, #cardEnd:has(.ceBoard #nameRow[style*="flex"]) .ceTile { display: none; }
#cardEnd .ceSparks > i { position: absolute; width: var(--s); height: var(--s); background: var(--sc);
  box-shadow: 0 0 6px var(--sc); animation: ceFloat 3s linear infinite; }
#cardEnd .ceIdle .ceGlow, #cardEnd .ceIdle .ceRays, #cardEnd .ceIdle .ceTopGlow { opacity: 0.3; transition: opacity .5s ease-out; }
#cardEnd .ceWhy { position: absolute; left: 50%; bottom: calc(var(--u) * 52 + 4px); width: var(--cw); height: calc(var(--ch) - 4px);
  margin-left: calc(var(--cw) * -0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  padding: 14px; box-sizing: border-box; text-align: center; background: rgba(12,9,6,0.58);
  border: 2px dashed rgba(214,170,74,0.32); border-radius: 6px; }
#cardEnd.ceLoss .ceWhy { border-color: rgba(140,156,178,0.32); }
#cardEnd .ceWhy b { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--ink); }
#cardEnd .ceWhy span { font: 600 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #d8c8a4; }
#cardEnd .cePips { display: flex; gap: 5px; }
#cardEnd .cePips:empty { display: none; }
#cardEnd .cePips i { width: 10px; height: 10px; background: rgba(140,156,178,0.16); box-shadow: inset 0 0 0 2px rgba(140,156,178,0.45); }
#cardEnd .cePips i.on { background: #e8c15a; box-shadow: inset 0 -2px 0 #9a6e1c, inset 0 2px 0 #fff0b0; }

#cardEnd .ceInfo { width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; gap: 8px;
  position: relative; z-index: 1; }
#cardEnd .cePlate { position: relative; margin-top: -4px; min-width: min(300px, 94%); padding: 8px 22px 9px; text-align: center;
  clip-path: var(--chamfer); background: linear-gradient(#2e2216, #1c140b);
  box-shadow: inset 0 0 0 1px #0d0905, inset 0 0 0 2px rgba(214,170,74,0.55), inset 0 0 0 3px #0d0905, inset 0 0 0 4px rgba(214,170,74,0.16); }
#cardEnd.ceLoss .cePlate { background: linear-gradient(#22262d, #15181d);
  box-shadow: inset 0 0 0 1px #08090b, inset 0 0 0 2px rgba(140,156,178,0.5), inset 0 0 0 3px #08090b, inset 0 0 0 4px rgba(140,156,178,0.14); }
/* the kicker breaks between its two halves, never inside one: "Reward card"
   over "Enlightenment" on a narrow phone, never "Reward / card" */
#cardEnd .cePlate small { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 1px 8px; font-size: 10.5px; font-weight: 700;
  letter-spacing: 3px; text-transform: uppercase; color: #c9a75c; }
#cardEnd .cePlate small > * { white-space: nowrap; }
#cardEnd.ceLoss .cePlate small { color: #9aa6b8; }
#cardEnd .cePlate small em { font-style: normal; color: var(--tc, #c9a75c); }
#cardEnd .cePlate small em::before { content: ''; display: inline-block; width: 4px; height: 4px; margin: 0 8px 2px 0; background: currentColor; transform: rotate(45deg); }
#cardEnd .cePlate b { display: block; margin-top: 3px; font-size: clamp(16px, 5.4vw, 21px); font-weight: 700; letter-spacing: 2px; line-height: 1.15;
  text-transform: uppercase; color: var(--ink); text-shadow: 0 2px 0 rgba(0,0,0,0.85); }
#cardEnd .ceScore, #cardEnd .ceTile { position: relative; width: 100%; background-color: rgba(12,9,6,0.76); border: 1px solid var(--fc2);
  background-repeat: no-repeat; background-image:
  linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)),
  linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc));
  background-size: 14px 2px, 2px 14px, 14px 2px, 2px 14px, 14px 2px, 2px 14px, 14px 2px, 2px 14px;
  background-position: 4px 4px, 4px 4px, calc(100% - 4px) 4px, calc(100% - 4px) 4px, 4px calc(100% - 4px), 4px calc(100% - 4px),
    calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) calc(100% - 4px); }
#cardEnd .ceScore { padding: 8px 14px 9px; text-align: center; }
#cardEnd .ceScore small, #cardEnd .cePlayed small, #cardEnd .ceTile small { font-size: 10px; font-weight: 700; letter-spacing: 3px;
  text-transform: uppercase; color: #8f98aa; }
#cardEnd .ceScoreN { display: block; font-size: 36px; font-weight: 900; line-height: 1.1; letter-spacing: 1px; font-variant-numeric: tabular-nums;
  background: linear-gradient(#fff3c8, #f2cd6a 48%, #c08a2c); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.75)); }
#cardEnd.ceLoss .ceScoreN { background: linear-gradient(#f3efe2, #cfc6ad 52%, #9b917a); -webkit-background-clip: text; background-clip: text; }
#cardEnd .ceMeta { margin: 1px 0 0; font-size: 12px; font-weight: 600; letter-spacing: 1px; color: #b5a888; }
#cardEnd .ceMeta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; column-gap: 9px; row-gap: 2px; }
#cardEnd .ceDay, #cardEnd .ceAssist { white-space: nowrap; }
#cardEnd .ceAssist { display: inline-flex; align-items: center; gap: 4px; color: #e8c15a; }
#cardEnd .ceAssist::before { content: '·'; color: #b5a888; margin-right: 5px; }
#cardEnd .ceAssist svg { width: 13px; height: 13px; flex: 0 0 auto; image-rendering: pixelated; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.6)); }
#cardEnd .ceRank:empty { display: none; }
#cardEnd #vicRank { margin: 5px auto 0; font-size: 12px; }
#cardEnd .ceBoard { width: 100%; display: flex; flex-direction: column; align-items: center; }
#cardEnd #nameRow { margin: 8px auto 0; }
#cardEnd #savedNote { margin: 6px auto 0; }
#cardEnd .cePlayed { width: 100%; margin: 0; display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 2px 8px;
  font: 600 12.5px/1.35 -apple-system, "Segoe UI", Roboto, sans-serif; color: #d6c8a6; text-align: center; }
#cardEnd .cePlayed small { font-family: var(--menufont); }
#cardEnd .ceTile { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 7px 14px; }
#cardEnd .ceTile svg { width: 32px; height: 32px; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.6)); }
#cardEnd .ceTileN { font-size: 28px; font-weight: 900; line-height: 1; color: var(--ink); font-variant-numeric: tabular-nums;
  text-shadow: 0 2px 0 rgba(0,0,0,0.8); }
#cardEnd .ceTile small { text-align: left; line-height: 1.3; }
#cardEnd .ceBtns { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 3px; }
#cardEnd .ceRow { display: flex; gap: 10px; }
#cardEnd .ceRow .ceBtn { flex: 1 1 0; }
#cardEnd .ceBtns[data-s="claim"] .ceRow, #cardEnd .ceBtns[data-s="done"] .ceClaim { display: none; }
#cardEnd .ceBtn { position: relative; isolation: isolate; width: 100%; min-height: 50px; padding: 0 12px; border: 0; background: none;
  display: flex; align-items: center; justify-content: center; gap: 16px; cursor: pointer;
  color: #f4e8cc; font: 700 15px/1 var(--menufont); letter-spacing: 2.4px; text-transform: uppercase;
  text-shadow: 0 2px 0 rgba(20,12,4,0.85); -webkit-appearance: none; appearance: none; }
#cardEnd .ceBtn::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#3b3020 0%, #2c2316 50%, #241c11 100%);
  box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.42), inset 0 10px 0 rgba(255,240,200,0.06), inset 0 -8px 0 rgba(0,0,0,0.28);
  filter: drop-shadow(0 3px 0 rgba(0,0,0,0.5)); }
#cardEnd .ceBtn.gold { min-height: 56px; color: #2b1906; font-size: 16px; text-shadow: 0 1px 0 rgba(255,240,190,0.55); }
#cardEnd .ceBtn.gold::before { background: linear-gradient(#f0cd6e 0%, #d7a542 46%, #b8862c 54%, #93661c 100%);
  box-shadow: inset 0 0 0 2px #2a1906, inset 0 0 0 3px #fff0b8, inset 0 0 0 5px #b8862a, inset 0 0 0 6px #4a3008,
    inset 0 12px 0 rgba(255,250,220,0.22), inset 0 -10px 0 rgba(60,30,0,0.22); }
#cardEnd .ceBtn.navy { color: #d6deec; }
#cardEnd .ceBtn.navy::before { background: linear-gradient(#25314a 0%, #1a2338 50%, #141b2c 100%);
  box-shadow: inset 0 0 0 2px #080b14, inset 0 0 0 3px rgba(150,170,210,0.38), inset 0 10px 0 rgba(200,215,255,0.05), inset 0 -8px 0 rgba(0,0,0,0.3); }
#cardEnd .ceBtn:active { transform: translateY(2px); filter: brightness(0.88); }
#cardEnd .ceDia { width: 7px; height: 7px; background: currentColor; opacity: 0.75; transform: rotate(45deg); }

/* a wide window: banner across the top, the card on the left, the run on the right */
@media (min-width: 900px) and (min-aspect-ratio: 5/4) {
  #cardEnd .ceMain { flex-direction: row; justify-content: center; align-items: center; gap: 64px; }
  #cardEnd .ceInfo { width: 360px; flex: 0 0 auto; }
  #cardEnd .cePlate { margin-top: 0; }
  #cardEnd .ceEye { font-size: 15px; width: min(420px, calc(100% - 120px)); }
  #cardEnd .ceRib { height: 64px; min-width: 330px; }
  #cardEnd .ceRib b { font-size: 40px; }
  #cardEnd .ceTail { top: 22px; height: 48px; }
}
/* the narrowest phones: the banner gives the deck in the corner its room */
@media (max-width: 359px) {
  #cardEnd .ceEye { gap: 6px; font-size: 10.5px; letter-spacing: 1.2px; width: calc(100% - 80px); }
  #cardEnd .ceEye i { min-width: 0; }
  #cardEnd .ceRib { min-width: 206px; }
  #cardEnd .ceRib b { font-size: 28px; letter-spacing: 4px; }
  #cardEnd .ceDeck { top: calc(var(--safe-top) + 10px); right: 6px; width: 44px; height: 44px; }
  #cardEnd .cePlate small { font-size: 9.5px; letter-spacing: 2px; }
}

/* ---- the reveal: on only while it plays ---- */
#cardEnd.ceIntro .ceBg, #cardEnd.ceIntro .ceVig { animation: ceFade 450ms ease-out both; }
#cardEnd.ceIntro .ceEye { animation: ceFade 360ms ease-out 80ms both; }
#cardEnd.ceIntro .ceBan { animation: ceDrop 540ms linear 120ms both; }
#cardEnd.ceIntro .ceInfo > *, #cardEnd.ceIntro .ceDeck { animation: ceUp 380ms cubic-bezier(.2,.8,.3,1) both;
  animation-delay: calc((var(--t-info) + var(--i, 0) * 70) * 1ms); }
#cardEnd .ceReveal .ceMove { animation: ceRise calc(var(--t-rise) * 1ms) cubic-bezier(.22,.8,.3,1) calc(var(--t-at) * 1ms) both; }
#cardEnd .ceReveal .ceGlow, #cardEnd .ceReveal .ceTopGlow {
  animation: ceGlowIn calc((var(--t-rise) + var(--t-hold) + 300) * 1ms) ease-out calc((var(--t-at) - var(--t-hold) - 120) * 1ms) both; }
#cardEnd .ceReveal .ceRays { animation: ceGrowIn 640ms cubic-bezier(.2,.9,.3,1.2) calc((var(--t-settle) - 180) * 1ms) both; }
#cardEnd .ceReveal .ceSlit { animation: ceSlit calc((var(--t-rise) * 0.8 + var(--t-hold)) * 1ms) ease-out calc((var(--t-at) - var(--t-hold)) * 1ms) both; }
#cardEnd .ceReveal .ceSparks { animation: ceFade 700ms ease-out calc((var(--t-settle) - 260 - var(--t-hold)) * 1ms) both; }
#cardEnd .ceReveal.ceFlashy .ceFlash { animation: ceFlash 640ms ease-out calc((var(--t-settle) - 60) * 1ms) both; }
#cardEnd .ceReveal .ceLaurel.l { animation: ceLaurelL 520ms cubic-bezier(.3,1.4,.5,1) calc((var(--t-settle) - 90) * 1ms) both; }
#cardEnd .ceReveal .ceLaurel.r { animation: ceLaurelR 520ms cubic-bezier(.3,1.4,.5,1) calc((var(--t-settle) - 90) * 1ms) both; }
/* ENLIGHTENMENT HOLDS ITS BREATH: light climbs out of the slit before the
   card does, and the ground gives a shake as it breaks loose */
#cardEnd .ceReveal.ceHolds .ceShaft { animation: ceShaft calc((var(--t-hold) + 160) * 1ms) ease-in calc((var(--t-at) - var(--t-hold)) * 1ms) both; }
#cardEnd .ceStage.ceReveal.ceHolds { animation: ceShake 380ms linear calc(var(--t-at) * 1ms) both; }

@keyframes ceFade { from { opacity: 0; } }
@keyframes ceUp { 0% { opacity: 0; transform: translateY(12px); } 70% { opacity: 1; transform: translateY(-2px); } 100% { opacity: 1; transform: none; } }
@keyframes ceDrop { 0% { opacity: 0; transform: translateY(-18px) scale(0.86); } 55% { opacity: 1; transform: translateY(3px) scale(1.04); }
  80% { transform: translateY(-1px) scale(0.99); } 100% { opacity: 1; transform: none; } }
@keyframes ceRise { 0% { transform: translateY(102%) scale(0.97); } 64% { transform: translateY(-7%) scale(1.025); }
  84% { transform: translateY(1.4%) scale(0.996); } 100% { transform: none; } }
@keyframes ceGlowIn { from { opacity: 0; transform: scale(0.45); } }
@keyframes ceGrowIn { from { opacity: 0; transform: scale(0.6); } }
@keyframes ceSpin { to { transform: rotate(360deg); } }
@keyframes ceSlit { 0% { opacity: 0; transform: scaleX(0.2); } 30% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0; transform: scaleX(1); } }
@keyframes ceFlash { 0% { opacity: 0; transform: scale(0.35); } 18% { opacity: 1; } 100% { opacity: 0; transform: scale(2.2); } }
@keyframes ceLaurelL { 0% { opacity: 0; transform: rotate(-26deg) scale(0.55); } 65% { opacity: 1; transform: rotate(3deg) scale(1.04); } 100% { opacity: 1; transform: none; } }
@keyframes ceLaurelR { 0% { opacity: 0; transform: rotate(26deg) scale(0.55); } 65% { opacity: 1; transform: rotate(-3deg) scale(1.04); } 100% { opacity: 1; transform: none; } }
@keyframes ceShaft { 0% { opacity: 0; transform: scaleY(0.1); } 82% { opacity: 1; transform: scaleY(1); } 100% { opacity: 0; transform: scaleY(1.25); } }
@keyframes ceShake { 0%, 100% { transform: none; } 20% { transform: translate(-3px, 1px); } 40% { transform: translate(3px, -1px); }
  60% { transform: translate(-2px, 0); } 80% { transform: translate(1px, 1px); } }
@keyframes ceFloat { 0% { opacity: 0; transform: translate(0, 0); } 15% { opacity: 1; } 80% { opacity: 0.85; }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)); } }

/* ---- the collection ---- */
#scrCards { background: radial-gradient(120% 70% at 50% 0%, #2a2116 0%, #15100a 55%, #0b0806 100%); }
#scrCards .shead { max-width: 820px; }
#scrCards .shead h2 { font-family: var(--menufont); font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; font-size: 19px; }
#scrCards .clHeld { flex: 0 0 auto; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(214,170,74,0.5);
  color: var(--text); font: 700 12px/1.2 var(--menufont); letter-spacing: 1px; background: #1c140c; }
#scrCards .clSum { width: 100%; max-width: 820px; margin: -4px auto 8px; padding: 0 16px; color: var(--dim); font-size: 12px; text-align: center; }
#scrCards .clTabs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; width: 100%; max-width: 820px; margin: 0 auto; padding: 0 10px; flex: 0 0 auto; }
#scrCards .clTab { min-height: 48px; padding: 4px 2px; border: 1px solid #3a2e1d; border-radius: 8px; background: #1b150e; color: var(--text);
  display: flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; font-family: var(--menufont); }
#scrCards .clTab.sel { border-color: var(--tc); background: #2a2114; box-shadow: inset 0 -3px 0 var(--tc), 0 0 12px var(--tg); }
#scrCards .clGem { width: 11px; height: 11px; flex: 0 0 auto; transform: rotate(45deg); background: var(--tc);
  box-shadow: 0 0 0 1px #0d0905, 0 0 7px var(--tg); }
#scrCards .clGem.dim { background: #3b342a; box-shadow: 0 0 0 1px #0d0905; }
#scrCards .clTabNm { display: none; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
#scrCards .clTabN { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
@media (min-width: 600px) { #scrCards .clTabNm { display: inline; } #scrCards .clTabAb { display: none; } }
/* a phone's tabs drop the tier names: the tier's ORDER (I-V) stands in, so
   the pale Stone and Imperial gems are never told apart by colour alone */
#scrCards .clTabAb { font: 700 10px/1 var(--menufont); letter-spacing: .5px; opacity: .8; }
#scrCards .cc-n { font-size: max(calc(var(--u) * 10), 10px); }
#scrCards .clBody { max-width: 820px; padding: 10px var(--pad, 10px) calc(env(safe-area-inset-bottom, 0px) + 24px); }
#scrCards .clHead { margin: 2px 4px 14px; color: var(--text); }
#scrCards .clHead p { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0; }
#scrCards .clHead p b { font: 700 17px/1.2 var(--menufont); letter-spacing: 2px; text-transform: uppercase; color: var(--tc); }
#scrCards .clHead p span { margin-left: auto; color: var(--dim); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
#scrCards .clHead .clPct { margin-top: 4px; font-size: 12px; color: var(--dim); }
#scrCards .clHead .clPct em { font-style: normal; }
#scrCards .clHead .clPct strong { color: var(--text); font: 800 13px/1 var(--menufont); }
#scrCards .clBar { display: block; height: 4px; margin-top: 6px; background: #2a2218; overflow: hidden; }
#scrCards .clBar > i { display: block; height: 100%; background: var(--tc); transform-origin: 0 50%; }
#scrCards .clGrid { display: grid; grid-template-columns: repeat(var(--cols), var(--cell)); gap: 14px var(--gap); justify-content: center; }
#scrCards .clCell { cursor: pointer; position: relative; }
#scrCards .clZoom { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: calc(var(--safe-top) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px); background: rgba(6,5,3,0.88); }
#scrCards .clZoom[hidden] { display: none; }
#scrCards .clX { position: absolute; top: calc(var(--safe-top) + 10px); right: 12px; width: 48px; height: 48px; border: 1px solid #3a2e1d;
  border-radius: 10px; background: #1b150e; color: var(--text); display: flex; align-items: center; justify-content: center; cursor: pointer; }
#scrCards .clX svg { width: 16px; height: 16px; }
#scrCards .clZCard { cursor: pointer; }
#scrCards .clZCap { margin: 0; max-width: 340px; color: var(--dim); font-size: 13px; text-align: center; }

/* LESS MOTION: the same screen, arrived at without movement — nothing spins
   or drifts, the reveal is never played (DeckScreens.reduced), and what
   would have risen is simply there */
@media (prefers-reduced-motion: reduce) {
  #cardEnd .ceRays > i, #cardEnd .ceSparks > i { animation: none; }
  #cardEnd .ceSparks > i { opacity: 0.55; }
  #cardEnd .ceBtn:active { transform: none; }
  #cardEnd.ceCalm .ceIn { animation: ceFade 240ms ease-out both; }
}
`;
window.DeckScreens = DeckScreens;
