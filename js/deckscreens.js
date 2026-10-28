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
    this._preload();
    // the first title with the deck on announces it, once per device (js/cardintro.js)
    if (window.CardIntro) { try { CardIntro.maybeShow(); } catch (e) { console.error('card announcement', e); } }
  },
  /* the reward screen's pictures are fetched while the player is still on
     the title, in idle time — a few hundred KB — so a run's end never waits
     on the network for its valley (a late one still fades in over the
     painting; this only makes that rare) */
  _preload() {
    if (this._preloaded) return;
    this._preloaded = true;
    const go = () => {
      const vp = this._vp(), o = vp.w / vp.h < 0.9 ? '-tall' : '-wide', none = () => {};
      this._want('win' + o, this.ART_EXT.bg, none);
      this._want('loss' + o, this.ART_EXT.bg, none);
      this._want('pedestal', this.ART_EXT.pedestal, none);
    };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 8000 }); else setTimeout(go, 3000);
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
       MARKED on the board (approved at Gate 1), and held off it while the
       board cannot wear the mark or the deck is a test deck. The rule is
       Screens.boardHold, the ONE answer the old victory scene asks too (a
       run that played cards and ended with the switch off is held there by
       the same words). Said in the score box's note line, so the missing
       name box is never a mystery. */
    // (guarded on the method it calls: a cached older screens.js has none, and
    // then an assisted win is held — the safe way round)
    const { hold, played } = Screens.boardHold ? Screens.boardHold(win)
      : { hold: win && this._playedN() ? 'Not posted to the world board — it cannot wear the card mark yet.' : '', played: this._playedN() };
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
    // the column's fixed rows (eyebrow, banner, the gap under it, the edges)
    // take 146px; the rest is the card and the altar below its foot
    const P = this.PLINTH, per = Deck.H + P.h - P.ty;
    if (w >= 900 && w / h >= 1.25) return Deck.fit(Math.min(352, (h - 146) / per * Deck.W)).w;
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
    const lau = side => v.win ? `<i class="ceBL ${side}" aria-hidden="true"></i>` : '';
    root.innerHTML =
      '<canvas class="ceBg" aria-hidden="true"></canvas><canvas class="ceBgArt" aria-hidden="true"></canvas>' +
      '<i class="ceVig"></i><i class="ceLines"></i>' +
      `<button class="ceDeck" type="button" data-act="deck" aria-label="Your cards">${this.DECK_SVG}<b class="ceDeckN"></b></button>` +
      '<div class="ceFly"></div>' +
      '<div class="ceScroll"><div class="ceCol"><div class="ceIn">' +
        `<p class="ceEye"><i></i><span>${this.esc(this._eyebrow(v))}</span><i></i></p>` +
        `<div class="ceBan"><i class="ceRibArt" aria-hidden="true"></i><div class="ceRib">${lau('l')}<b>${v.win ? 'Victory' : 'Defeat'}</b>${lau('r')}</div></div>` +
        '<div class="ceMain">' +
          '<div class="ceStage">' +
            '<i class="ceGlow"></i><i class="ceRays"><i></i></i><i class="ceRays b"><i></i></i>' +
            '<i class="ceLaurel l" aria-hidden="true"></i><i class="ceLaurel r" aria-hidden="true"></i>' +
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
    const P = this.PLINTH;
    root.style.setProperty('--pw', P.w);
    root.style.setProperty('--ph', P.h);
    root.style.setProperty('--pty', P.ty);
    root.style.setProperty('--phang', P.h - P.ty);
    root.style.setProperty('--pfoot', P.foot);
    // the painted valley when it has landed; the procedural one until then, and for good on a 404
    if (!this._artBg(root, v.win)) this._paintBg(root.querySelector('.ceBg'), v.win);
    this._plinth(root.querySelector('.cePlinth'), v.win);
    // the chrome: the laurels and the banner, drawn as vectors (DeckScreens.SVG)
    const V = this.SVG;
    root.style.setProperty('--laurelL', V.laurel(true));
    root.style.setProperty('--laurelR', V.laurel(false));
    root.style.setProperty('--sprigL', V.laurel(true, true));
    root.style.setProperty('--sprigR', V.laurel(false, true));
    root.style.setProperty('--glint', V.glint());
    ['TL', 'TR', 'BR', 'BL'].forEach((k, i) => root.style.setProperty('--cn' + k, V.corner(i, v.win)));
    root.style.setProperty('--loz', V.lozenge(v.win));
    this._ribbon(root, v.win);
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
      // the cards this run granted are the ones the player is looking for:
      // the collection opens on their tier, brought into view and marked NEW
      const v = this._view, ids = v ? v.cards.map(c => c.id) : [];
      const best = ids.map(id => Deck.card(id)).filter(Boolean).sort((a, b) => Deck.tier(b.tier).rank - Deck.tier(a.tier).rank)[0];
      return this.openCollection('endgame', best ? best.tier : null, ids);
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

  /* ---------------- sparks: motes of light that drift up through it ----------------
     soft round motes with a white-hot core, and — from Iron up — every
     third one a four-point glint; drawn by the browser at the device's own
     resolution, never squares of pixels (the chrome ruling) */
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
      const gl = i % 3 === 2 && (tier === 'iron' || tier === 'imperial' || tier === 'enlight');
      // a glint is a star the size of a letter: it twinkles BESIDE the card
      // (the box is two cards wide, the card its middle half), never over
      // the name on its plate, where a still frame read it as a flaw
      const x = gl ? (Math.random() < 0.5 ? 6 + Math.random() * 16 : 78 + Math.random() * 16) : 8 + Math.random() * 84;
      const y = ember ? 55 + Math.random() * 45 : 20 + Math.random() * 70;
      const d = (ember ? 1.6 : 2.6) + Math.random() * 2.2;
      html += `<i${gl ? ' class="gl"' : ''} style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--s:${sz}px;--sc:${cols[i % cols.length]};` +
        `--dx:${((Math.random() - 0.5) * 40).toFixed(0)}px;--dy:${-(ember ? 120 + Math.random() * 120 : 50 + Math.random() * 70).toFixed(0)}px;` +
        `animation-duration:${d.toFixed(2)}s;animation-delay:${(-Math.random() * d).toFixed(2)}s"></i>`;
    }
    box.innerHTML = html;
  },

  /* ================= THE PAINTED VALLEY =================
     The backdrop and the plinth are SUPPLIED ART, landing by FILENAME alone
     (the ART_PLAN rule — no manifest): in ART_DIR,

       win-wide / win-tall     the valley at dawn, for a victory
       loss-wide / loss-tall   the same valley at dusk, the hall fallen
       pedestal                the carved altar the card stands on

     the backdrops as .webp with a .jpg behind each, the pedestal a .png.
     `wide` is drawn on a landscape window and `tall` on a portrait one.
     Each name is asked for once a session; a picture that has landed is
     drawn the moment the screen opens, and one still on its way fades in
     over the procedural painting below when it lands. A 404 keeps that
     painting for good — A PAINTER STANDS DOWN FOR ART THAT ISN'T THERE,
     the screen never does — and nothing here reads a pixel (a file://
     picture taints its canvas). */
  ART_DIR: 'assets/endgame/reward/',
  ART_EXT: { bg: ['.webp', '.jpg'], pedestal: ['.png'] },
  _art: {},            // name -> { ok: true | false | null (still loading), img, cbs }
  _want(name, exts, cb) {
    let e = this._art[name];
    if (!e) {
      e = this._art[name] = { ok: null, img: null, cbs: [], url: '' };
      const v = (typeof CFG !== 'undefined' && CFG.ART_V) ? '?v=' + CFG.ART_V : '';
      let tries = 0;
      const next = i => {
        if (i >= exts.length) {
          /* a failure can be the network's, not the file's (a boot still
             probing a thousand pictures can refuse a request outright): the
             names are asked once more a moment later before the painting is
             kept for the session */
          if (++tries < 2) { setTimeout(() => next(0), 1500); return; }
          e.ok = false; e.cbs = []; return;
        }
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => {
          e.ok = true; e.img = im; e.url = im.src;
          const cbs = e.cbs; e.cbs = [];
          for (const f of cbs) f(im);
        };
        im.onerror = () => next(i + 1);
        im.src = this.ART_DIR + name + exts[i] + v;
      };
      next(0);
    }
    if (e.ok) { cb(e.img); return true; }
    if (e.ok === null) e.cbs.push(cb);
    return false;
  },
  /* the backdrop: true when the picture was drawn at once (the procedural
     one need not be painted at all) */
  _artBg(root, win) {
    const vp = this._vp(), name = (win ? 'win' : 'loss') + (vp.w / vp.h < 0.9 ? '-tall' : '-wide');
    const cv = root.querySelector('.ceBgArt'), gen = this._gen;
    let now = true;
    const got = this._want(name, this.ART_EXT.bg, img => {
      if (gen !== this._gen || !cv.isConnected) return;
      this._blitBg(cv, img);
      root.classList.add('ceArtBg');
      root.dataset.bg = name;
      if (!now) cv.classList.add('ceArtIn');   // late: it fades in over the painting
    });
    now = false;
    return got;
  },
  /* A PIXEL PICTURE ON ANY SCREEN, CRISP: a phone's three device pixels a
     CSS pixel already make every art pixel a block of 3-4 squares, so it is
     drawn as it is, nearest-neighbour. A desktop shows the 688-wide valley
     at 2.1-2.8 screen pixels a pixel, where plain nearest-neighbour makes
     columns of two and three side by side; there the picture is blown up
     by a WHOLE factor first and the browser takes it down the last part of
     the way smoothly — every art pixel the same size, edges a hair soft. */
  _blitBg(cv, img) {
    const vp = this._vp(), dpr = Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.max(vp.w / iw, vp.h / ih) * dpr;
    const k = s >= 3 ? 1 : Math.max(1, Math.min(3, Math.ceil(s)));
    cv.width = iw * k; cv.height = ih * k;
    const g = cv.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, cv.width, cv.height);
    cv.classList.toggle('ceSoft', k > 1);
  },
  /* THE BANNER IS DRAWN TO ITS OWN SIZE: the band is as wide as its word
     makes it (VICTORY with its sprigs, DEFEAT without) and as tall as the
     window's layout says, so the picture is built for the box it is laid
     out in — every rim line its true width, every corner true, at any size
     — and built again whenever that box changes (a font landing, a window
     turned). Layout sizes (offsetWidth), never the box on screen: the drop
     plays a scale over it. */
  _ribRO: null,
  _ribbon(root, win) {
    if (this._ribRO) { this._ribRO.disconnect(); this._ribRO = null; }
    const ban = root.querySelector('.ceBan'), rib = root.querySelector('.ceRib'), art = root.querySelector('.ceRibArt');
    if (!ban || !rib || !art) return;
    const paint = () => {
      if (!art.isConnected) return;
      const bw = rib.offsetWidth, bh = rib.offsetHeight, pad = rib.offsetLeft;
      if (!bw || !bh) return;
      const r = this.SVG.ribbon(bw, bh, pad, win);
      art.style.width = r.w + 'px';
      art.style.height = r.h + 'px';
      art.style.backgroundImage = r.uri;
    };
    paint();
    if (typeof ResizeObserver === 'function') {
      this._ribRO = new ResizeObserver(paint);
      this._ribRO.observe(rib);
    }
  },
  /* THE PLINTH, in one box whatever is drawn in it (PLINTH): the carved
     altar when it has landed, the procedural drum until then (or for good),
     each placed so its slit — the line the card stands on — falls on
     PLINTH.ty. A defeat's altar is the same stone under a cold sky: drained
     of colour and cooled by compositing alone, so the picture keeps its
     own few colours. */
  _plinth(cv, win) {
    const P = this.PLINTH, gen = this._gen;
    cv.width = P.w; cv.height = P.h;
    const g = cv.getContext('2d');
    if (!g) return;
    cv.classList.remove('ceArt');
    const drawn = this._want('pedestal', this.ART_EXT.pedestal, img => {
      if (gen !== this._gen || !cv.isConnected) return;
      g.clearRect(0, 0, P.w, P.h);
      g.drawImage(img, Math.round((P.w - img.width) / 2), 0);
      if (!win) {
        g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,0.72)'; g.fillRect(0, 0, P.w, P.h);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = '#a3b0c6'; g.fillRect(0, 0, P.w, P.h);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(img, Math.round((P.w - img.width) / 2), 0);
        g.globalCompositeOperation = 'source-over';
      }
      cv.classList.add('ceArt');
    });
    if (drawn) return;
    const old = document.createElement('canvas');
    this._paintPlinth(old, win);
    g.drawImage(old, Math.round((P.w - old.width) / 2), P.ty - this.DRUM.ty);
  },

  /* ================= THE PICTURES =================
     The two fallbacks for the painted world — the land and the drum — are
     pixel art painted once into small canvases and blown up
     nearest-neighbour: the backdrop at about four screen pixels a pixel,
     the drum at the card's own density, so it reads as part of the same
     picture as the card standing on it. They are SCENE, not chrome: the
     laurels and the banner are drawn as vectors (DeckScreens.SVG). */

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

  /* THE PLINTH'S BOX, in art pixels at the card's own density: the carved
     altar's canvas (assets/endgame/reward/pedestal.png), the line the card
     stands on PLINTH.ty pixels down. The stage's CSS reads these numbers
     (--pw, --ph, --pty); whatever stands in the box is placed to them. On a
     phone the card's plate stands in front of the altar's lowest `foot`
     rows, the way a name plaque is set against a plinth's base — the height
     a taller altar would otherwise cost the screen. */
  PLINTH: { w: 240, h: 102, ty: 26, foot: 22 },
  /* THE DRUM, the procedural fallback: a round drum of dressed stone, mossy
     on a win and cold on a loss, with a slit across its top the card rises
     out of. 232 x 70 art pixels, its top surface centred 18 pixels down. */
  DRUM: { w: 232, h: 70, ty: 18 },
  _paintPlinth(cv, win) {
    const PW = this.DRUM.w, PH = this.DRUM.h, cx = PW / 2, ty = this.DRUM.ty, rx = 112, ry = 15, FH = 30;
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

  /* the deck: a bronze card behind a gold one — the HUD button's own
     picture (DeckUI.deckIcon), a smooth vector at every size it is shown */
  get DECK_SVG() { return (window.DeckUI && DeckUI.deckIcon) ? DeckUI.deckIcon() : ''; },
  get CLOSE_SVG() { return DeckScreens.SVG.CLOSE; },
  /* a tier tab's gem: the deck sheet's own faceted gem (DeckUI.gemIcon),
     smooth at every size; dark while nothing of the tier has been found */
  _gem(seen) {
    const cls = 'clGem' + (seen ? '' : ' dim');
    return (window.DeckUI && DeckUI.gemIcon) ? DeckUI.gemIcon(cls) : `<i class="${cls}"></i>`;
  },

  /* ================= THE COLLECTION =================
     Every card the game holds, by tier: what you own (×N), what you have
     found and since played (greyed), and what you have never seen — a dark
     silhouette with a "?" that gives away neither the art nor the name. Tap
     a card to bring it up close, tap again to turn it over. */
  _colFrom: 'title',
  _colTier: null,
  _zoomed: false,
  /* THE NEW CARDS ARE FOUND FOR YOU (playtest earn, b-win-05): opened from
     the reward screen the collection used to land on the right tier but
     scrolled to its top in catalog order, the new card half off the screen
     behind a row of "?"s and nothing to say which one was new. `fresh` is the
     run's granted cards: each wears a NEW tag, its tier's tab a gold mark,
     and the first of them in the tier shown is brought into the middle of
     the view when the collection opens. Opened from the title, nothing is new. */
  _new: null,
  _scrollNew: false,
  openCollection(from, tier, fresh) {
    if (!window.Deck || !Deck.on()) return;
    this._css();
    this._listen();
    this._colFrom = from === 'endgame' ? 'endgame' : 'title';
    if (Array.isArray(fresh)) this._new = new Set(fresh.filter(id => Deck.card(id)));
    else if (this._colFrom !== 'endgame') this._new = null;
    this._scrollNew = !!(this._new && this._new.size);
    this._colScreen();
    if (tier && Deck.TIERS.some(t => t.k === tier)) this._colTier = tier;
    else if (!this._colTier) this._colTier = this._latestTier();
    this._zoomClose(true);
    // a card the cloud's record took back is SAID here, once, if no game
    // heard it first (Deck.tellLost, js/deck.js) — never a silent vanishing
    this._lostLines = (Deck.tellLost ? Deck.tellLost() : []);
    Screens.show('cards');
    this._renderCollection();
  },
  _lostLines: [],
  closeCollection() {
    this._lostLines = [];
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
      // the card announcement, on purpose this time (js/cardintro.js)
      '<button class="clHow" type="button" data-act="intro">How cards work</button>' +
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
      else if (act === 'intro' && window.CardIntro) { this._zoomClose(true); CardIntro.show('cards'); }
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
    const sum = scr.querySelector('.clSum');
    sum.textContent = `${found} of ${Deck.CATALOG.length} discovered`;
    for (const line of (this._lostLines || [])) {
      const n = document.createElement('span');
      n.className = 'clLost';
      n.style.cssText = 'display:block;margin-top:4px;color:var(--gold, #ffd45e)';
      n.textContent = line;
      sum.appendChild(n);
    }
    scr.querySelector('.clTabs').innerHTML = Deck.TIERS.map(t => {
      const all = Deck.ofTier(t.k), held = all.reduce((n, c) => n + Deck.count(c.id), 0), seen = all.filter(c => Deck.seen(c.id)).length;
      const fresh = this._new && all.some(c => this._new.has(c.id));
      return `<button class="clTab${t.k === sel ? ' sel' : ''}${fresh ? ' clFresh' : ''}" type="button" role="tab" data-tier="${t.k}" aria-selected="${t.k === sel}" ` +
        `aria-label="${this.esc(t.name)}: ${held} held, ${seen} of ${all.length} discovered${fresh ? ', new cards' : ''}" style="--tc:${t.col};--tg:${t.glow}">` +
        `${this._gem(seen)}<span class="clTabNm">${this.esc(t.name)}</span><span class="clTabAb" aria-hidden="true">${['I', 'II', 'III', 'IV', 'V'][t.rank]}</span><b class="clTabN">${held}</b></button>`;
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
        cell.setAttribute('aria-label', c.name + (n ? ', ' + n + ' held' : ', none held') + (this._new && this._new.has(c.id) ? ', new' : ''));
        cell.appendChild(Deck.face(c.id, { w: gs.w, n, off: !n }));
        if (this._new && this._new.has(c.id)) {
          cell.classList.add('clNew');
          const tag = document.createElement('b');
          tag.className = 'clNewTag';
          tag.textContent = 'New';
          cell.appendChild(tag);
        }
      } else {
        cell.dataset.unknown = c.tier;   // the tier only: nothing in the page names the card
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', 'Undiscovered ' + t.name + ' card');
        cell.appendChild(this._silhouette(c.id, gs.w));
      }
      grid.appendChild(cell);
    }
    // the first new card of this tier, brought to the middle of the view —
    // once, as the collection opens (a repaint of the counts never moves it)
    const first = this._scrollNew && grid.querySelector('.clCell.clNew');
    if (first) {
      this._scrollNew = false;
      const body = scr.querySelector('.clBody'), br = body.getBoundingClientRect(), cr = first.getBoundingClientRect();
      body.scrollTop = Math.max(0, body.scrollTop + cr.top - br.top - Math.max(0, (br.height - cr.height) / 2));
    } else if (this._scrollNew) {
      this._scrollNew = false;
      scr.querySelector('.clBody').scrollTop = 0;
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

/* THE CHROME IS DRAWN, NOT BLOWN UP (the operator's standing ruling: the
   world's art — the painted valley, the pedestal standing in it, the card
   paintings — stays pixel art; the screen's CHROME — the banner, its
   sprigs, the laurels round the card, the corner brackets, the deck's
   picture, the ceremony's sparks — is drawn at the device's own
   resolution, never a small picture blown up). Each ornament is an SVG
   built here and handed to CSS as a data URI (its own little document, so
   its gradient ids can never collide with anything else on the page), and
   the browser draws it at whatever size the layout asks, on any screen.
   One burnished gold and one cold silver — the faces' own frames — and the
   navy and slate of the banner. Pure functions; the strings are cached;
   nothing is fetched. tests/deck-screens.mjs §7 measures the result: no
   raster on these screens but the exempt pictures is shown past its own
   pixels on a 3x screen. */
DeckScreens.SVG = {
  _c: {},
  memo(k, fn) { return this._c[k] || (this._c[k] = fn()); },
  uri(s) { return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(s) + '")'; },
  doc(w, h, body) { return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}'>${body}</svg>`; },
  f(n) { return Math.round(n * 100) / 100; },
  /* the metal, banded like struck gold (or silver), lit from the top */
  METAL: {
    gold: ['#fff4c9', '#f6d074', '#d9a03a', '#a8691a', '#e7b955', '#87500f'],
    silver: ['#ffffff', '#dde3ea', '#a9b3c0', '#6c7684', '#c8d0da', '#4a5361'],
  },
  metal(id, kind, x1, y1, x2, y2) {
    const c = this.METAL[kind] || this.METAL.gold, at = [0, 0.22, 0.44, 0.6, 0.78, 1];
    return `<linearGradient id='${id}' gradientUnits='userSpaceOnUse' x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'>` +
      c.map((s, i) => `<stop offset='${at[i]}' stop-color='${s}'/>`).join('') + '</linearGradient>';
  },
  leafGrad(id) {
    return `<linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff6cf'/><stop offset='.3' stop-color='#f5cf6a'/>` +
      `<stop offset='.5' stop-color='#d89c34'/><stop offset='.52' stop-color='#a86a1c'/><stop offset='1' stop-color='#6f400c'/></linearGradient>`;
  },
  /* a leaf of beaten gold: lit along one half, shaded along the other, a
     cut midrib between */
  leaf(x, y, deg, L, gid, ink) {
    const w = L * 0.25, f = n => this.f(n);
    return `<g transform='translate(${f(x)} ${f(y)}) rotate(${f(deg)})'>` +
      `<path d='M0,0 C${f(L * .28)},${f(-w)} ${f(L * .7)},${f(-w * .95)} ${f(L)},0 C${f(L * .7)},${f(w * .95)} ${f(L * .28)},${f(w)} 0,0 Z' fill='url(#${gid})' stroke='#2e1803' stroke-width='${ink}' stroke-linejoin='round'/>` +
      `<path d='M${f(L * .1)},0 Q${f(L * .5)},${f(-w * .12)} ${f(L * .86)},0' fill='none' stroke='#6e3f0c' stroke-width='${f(ink * .7)}' stroke-linecap='round'/></g>`;
  },

  /* A LAUREL BRANCH of beaten gold along a curve that bows OUT from the
     card and leans back in at its tip — the RIGHT branch; `mirror` makes
     the left. Leaves go out in pairs, shortening toward the tip, berries in
     the crook. 60 x 120 units: the tall branches beside the card (u x 75 by
     u x 150) and, with fewer leaves and a heavier ink line so it still
     reads at 44px, the sprigs on the banner. */
  laurel(mirror, sprig) {
    return this.memo('laurel' + (mirror ? 'L' : 'R') + (sprig ? 's' : ''), () => {
      const P = [[13, 117], [46, 99], [51, 38], [25, 5]];
      const pt = t => { const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };
      const tan = t => { const u = 1 - t; return [0, 1].map(k => 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k])); };
      const o = sprig ? { n: 5, spread: .62, L0: 24, L1: 15, ink: 1.5, stem: 3.2 } : { n: 11, spread: .6, L0: 23, L1: 12.5, ink: .8, stem: 2.1 };
      const deg = r => r * 180 / Math.PI;
      let leaves = '';
      for (let i = 0; i < o.n; i++) {
        const t = .05 + (.93 - .05) * i / (o.n - 1);
        for (const side of [1, -1]) {
          const tt = Math.min(.93, t + (side < 0 ? .04 : 0));
          const p = pt(tt), d = tan(tt), len = Math.hypot(d[0], d[1]) || 1, T = [d[0] / len, d[1] / len], N = [-T[1], T[0]];
          const a = Math.atan2(T[1], T[0]) + side * o.spread;
          leaves += this.leaf(p[0] + N[0] * side * .9, p[1] + N[1] * side * .9, deg(a), o.L0 + (o.L1 - o.L0) * tt, 'lf', o.ink);
        }
      }
      { const e = pt(.945), d = tan(.93); leaves += this.leaf(e[0], e[1], deg(Math.atan2(d[1], d[0])), o.L1 * 1.05, 'lf', o.ink); }
      let berries = '';
      if (!sprig) for (const t of [.3, .55, .78]) {
        const p = pt(t), d = tan(t), l = Math.hypot(d[0], d[1]), N = [-d[1] / l, d[0] / l];
        berries += `<circle cx='${this.f(p[0] - N[0] * 5.4)}' cy='${this.f(p[1] - N[1] * 5.4)}' r='2.1' fill='url(#bb)' stroke='#2e1803' stroke-width='.6'/>`;
      }
      const stem = `M${P[0]} C${P[1]} ${P[2]} ${P[3]}`;
      const body =
        `<defs>${this.metal('g', 'gold', 0, 0, 60, 120)}${this.leafGrad('lf')}` +
        `<radialGradient id='bb' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='#fffbe6'/><stop offset='.45' stop-color='#f0c457'/><stop offset='1' stop-color='#8a5414'/></radialGradient></defs>` +
        `<g${mirror ? " transform='translate(60 0) scale(-1 1)'" : ''}>` +
        `<path d='${stem}' fill='none' stroke='#1c0f03' stroke-width='${o.stem + 2}' stroke-linecap='round'/>` +
        `<path d='${stem}' fill='none' stroke='url(#g)' stroke-width='${o.stem}' stroke-linecap='round'/>` +
        berries + leaves + '</g>';
      return this.uri(this.doc(60, 120, body));
    });
  },

  /* THE BANNER, drawn to the size it is laid out at (DeckScreens._ribbon
     measures it): a cloth band with a burnished rim, stitched inside it,
     its folds catching the light, and a swallow-tailed end folded behind
     each side. `bw` x `bh` is the band, `pad` the room each side for a
     tail; a victory's is navy and gold, a defeat's slate and silver. The
     word is CSS on the band, never baked into the picture. */
  ribbon(bw, bh, pad, win) {
    const k = [bw, bh, pad, win ? 1 : 0].join(':');
    return this.memo('rib' + k, () => {
      const f = n => this.f(n);
      const W = bw + pad * 2, tt = Math.round(bh * 0.33), th = Math.round(bh * 0.78), H = Math.max(bh, tt + th) + 2;
      const C = win
        ? { band: ['#33497a', '#26385f', '#1b2a4a', '#14203a', '#0e172c'], tail: ['#22365f', '#17253f', '#0c1527'], fold: '#05080f', ink: '#070b16',
            sheen: '#aac2ff', stitch: '#e2b85a', trim: '#d4a540', metal: 'gold' }
        : { band: ['#4c5562', '#3a424e', '#2b313a', '#20262e', '#161a20'], tail: ['#353c46', '#252b33', '#14171c'], fold: '#07080b', ink: '#0a0c10',
            sheen: '#dfe6ef', stitch: '#aab4c2', trim: '#8a96a6', metal: 'silver' };
      const x0 = pad, x1 = pad + bw, c = Math.max(3, bh * 0.07);
      const rect = (i) => { const a = x0 + i, b = x1 - i, t = i, u = bh - i, cc = Math.max(0.5, c - i * 0.42);
        return `M${f(a + cc)},${f(t)} H${f(b - cc)} L${f(b)},${f(t + cc)} V${f(u - cc)} L${f(b - cc)},${f(u)} H${f(a + cc)} L${f(a)},${f(u - cc)} V${f(t + cc)} Z`; };
      const nd = bh * 0.27, ti = 1.5;
      const tail = (dir) => {
        // the tail runs out from under the band, a swallow notch in its free end
        const xo = dir < 0 ? ti : W - ti, xn = xo - dir * nd, xIn = dir < 0 ? x0 + bh * 0.36 : x1 - bh * 0.36, xB = dir < 0 ? x0 + bh * 0.25 : x1 - bh * 0.25;
        const y0 = tt, y1 = tt + th, ym = (y0 + y1) / 2;
        const t = `M${f(xIn)},${f(y0)} L${f(xo)},${f(y0)} L${f(xn)},${f(ym)} L${f(xo)},${f(y1)} L${f(xB)},${f(y1)} Z`;
        const fold = `M${f(dir < 0 ? x0 : x1)},${f(bh - 0.5)} L${f(xB)},${f(bh - 0.5)} L${f(xB)},${f(y1)} Z`;
        const sh = dir < 0 ? 'sl' : 'sr';
        const rims = `M${f(xo)},${f(y0 + 1.6)} L${f(xIn)},${f(y0 + 1.6)} M${f(xo)},${f(y1 - 1.6)} L${f(xB)},${f(y1 - 1.6)}`;
        return `<path d='${t}' fill='none' stroke='${C.ink}' stroke-width='3' stroke-linejoin='round'/>` +
          `<path d='${t}' fill='url(#tl)'/><path d='${t}' fill='url(#${sh})'/>` +
          `<path d='${rims}' fill='none' stroke='${C.trim}' stroke-width='1.6' stroke-opacity='.8'/>` +
          `<path d='${fold}' fill='${C.fold}' stroke='${C.ink}' stroke-width='1' stroke-linejoin='round'/>`;
      };
      const shade = (id, dir) => `<linearGradient id='${id}' gradientUnits='userSpaceOnUse' x1='${dir < 0 ? 0 : W}' y1='0' x2='${dir < 0 ? x0 + bh * .36 : x1 - bh * .36}' y2='0'>` +
        `<stop offset='0' stop-color='#000' stop-opacity='0'/><stop offset='.6' stop-color='#000' stop-opacity='.08'/><stop offset='1' stop-color='#000' stop-opacity='.55'/></linearGradient>`;
      // the cloth: soft folds across the band, lit and shadowed in turn
      const folds = [[0, .34], [.06, 0], [.17, -.1], [.3, .1], [.45, -.12], [.6, .1], [.74, -.1], [.88, .06], [.95, 0], [1, .34]]
        .map(([o, a]) => `<stop offset='${o}' stop-color='${a > 0 ? '#000' : C.sheen}' stop-opacity='${Math.abs(a)}'/>`).join('');
      const bandG = C.band.map((s, i) => `<stop offset='${[0, .2, .52, .82, 1][i]}' stop-color='${s}'/>`).join('');
      const tailG = C.tail.map((s, i) => `<stop offset='${[0, .5, 1][i]}' stop-color='${s}'/>`).join('');
      const body =
        `<defs>${this.metal('gr', C.metal, 0, 0, 0, bh)}` +
        `<linearGradient id='bd' x1='0' y1='0' x2='0' y2='1'>${bandG}</linearGradient>` +
        `<linearGradient id='tl' x1='0' y1='0' x2='0' y2='1'>${tailG}</linearGradient>` +
        `<linearGradient id='cl' x1='0' y1='0' x2='1' y2='0'>${folds}</linearGradient>` +
        `<linearGradient id='sn' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.16'/><stop offset='.42' stop-color='#fff' stop-opacity='.04'/>` +
          `<stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.28'/></linearGradient>` +
        shade('sl', -1) + shade('sr', 1) + '</defs>' +
        tail(-1) + tail(1) +
        `<path d='${rect(0)}' fill='${C.ink}'/>` +
        `<path d='${rect(1)}' fill='url(#bd)'/><path d='${rect(1)}' fill='url(#cl)'/><path d='${rect(1)}' fill='url(#sn)'/>` +
        // the rim: burnished metal in a dark bed, a hairline of light along its top
        `<path d='${rect(3)}' fill='none' stroke='${C.ink}' stroke-width='4.4'/>` +
        `<path d='${rect(3)}' fill='none' stroke='url(#gr)' stroke-width='2.4'/>` +
        `<path d='M${f(x0 + 2.6 + c)},${f(2.4)} H${f(x1 - 2.6 - c)}' stroke='#fff8e0' stroke-opacity='.7' stroke-width='.7'/>` +
        `<path d='${rect(6.1)}' fill='none' stroke='url(#gr)' stroke-width='.8' stroke-opacity='.55'/>` +
        // the stitching inside the rim
        `<path d='${rect(8.6)}' fill='none' stroke='${C.stitch}' stroke-opacity='.42' stroke-width='.8' stroke-dasharray='3 2.4'/>`;
      return { uri: this.uri(this.doc(f(W), f(H), body)), w: W, h: H };
    });
  },

  /* THE CLOSE: an X drawn smooth in the button's own colour */
  CLOSE: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3.6 3.6 L12.4 12.4 M12.4 3.6 L3.6 12.4"/></svg>',

  /* A CORNER BRACKET for the run's panels and the screen's frame: two arms
     of burnished metal meeting over a small diamond knot, a finer bracket
     inside them, the whole fading toward its tips. ONE path per arm pair,
     so the corner is never painted twice — the flat CSS bars it replaces
     were two translucent rects overlapping, and the overlap lit a brighter
     square in every corner. `pos` 0..3 turns it to the top-left, top-right,
     bottom-right and bottom-left; gold for a victory, silver for a defeat. */
  corner(pos, win) {
    return this.memo('cn' + pos + (win ? 'g' : 's'), () => {
      const c = win ? ['#fff3cc', '#ecc265', '#b98426', '#6f4710'] : ['#e6ebf2', '#b4bdca', '#7c8796', '#434b58'];
      const body =
        `<defs><linearGradient id='m' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='24' y2='24'>` +
          `<stop offset='0' stop-color='${c[0]}'/><stop offset='.18' stop-color='${c[1]}'/><stop offset='.5' stop-color='${c[2]}' stop-opacity='.85'/>` +
          `<stop offset='1' stop-color='${c[3]}' stop-opacity='.25'/></linearGradient></defs>` +
        `<g transform='rotate(${pos * 90} 12 12)'>` +
          `<path d='M3 23 V3 H23' fill='none' stroke='#0d0905' stroke-opacity='.5' stroke-width='3.6'/>` +
          `<path d='M3 23 V3 H23' fill='none' stroke='url(#m)' stroke-width='1.8'/>` +
          `<path d='M6.6 14 V6.6 H14' fill='none' stroke='url(#m)' stroke-width='.8' stroke-opacity='.7'/>` +
          `<path d='M3 .4 L5.6 3 L3 5.6 L.4 3 Z' fill='${c[1]}' stroke='#0d0905' stroke-width='.7' stroke-opacity='.8'/>` +
          `<path d='M3 .4 L5.6 3 L3 3 Z' fill='${c[0]}'/></g>`;
      return this.uri(this.doc(24, 24, body));
    });
  },
  /* THE EYEBROW'S KNOT: a small faceted lozenge where each rule ends,
     opaque, so the rule never shows through it */
  lozenge(win) {
    return this.memo('lz' + (win ? 'g' : 's'), () => {
      const c = win ? ['#fff3cc', '#e2b452', '#8d5c18'] : ['#ffffff', '#b9c3d0', '#5d6777'];
      return this.uri(this.doc(12, 12,
        `<path d='M6 .7 L11.3 6 L6 11.3 L.7 6 Z' fill='${c[1]}' stroke='#0d0905' stroke-width='.9' stroke-opacity='.75' stroke-linejoin='round'/>` +
        `<path d='M6 1.6 L10.4 6 L6 6 Z' fill='${c[0]}' fill-opacity='.8'/><path d='M6 1.6 L1.6 6 L6 6 Z' fill='${c[0]}'/>` +
        `<path d='M1.6 6 L6 10.4 L6 6 Z' fill='${c[2]}' fill-opacity='.55'/><path d='M10.4 6 L6 10.4 L6 6 Z' fill='${c[2]}'/>`));
    });
  },

  /* A GLINT for the ceremony's sparks: a four-point star of light */
  glint() {
    return this.memo('glint', () => this.uri(this.doc(20, 20,
      `<defs><radialGradient id='h' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff' stop-opacity='.9'/><stop offset='.3' stop-color='#fff4c8' stop-opacity='.35'/><stop offset='1' stop-color='#fff4c8' stop-opacity='0'/></radialGradient></defs>` +
      `<circle cx='10' cy='10' r='10' fill='url(#h)'/>` +
      `<path d='M10,0.6 Q11,9 19.4,10 Q11,11 10,19.4 Q9,11 0.6,10 Q9,9 10,0.6 Z' fill='#fffbea'/>`)));
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
  font-family: var(--menufont); --fc: rgba(214,170,74,0.55); --fc2: rgba(214,170,74,0.16); --ink: #f3e2b4; --gap: 16px; }
#scrEndgame.ceMode #cardEnd { display: block; }
#cardEnd.ceLoss { --fc: rgba(140,156,178,0.5); --fc2: rgba(140,156,178,0.14); }
#cardEnd .ceBg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
/* THE PAINTED VALLEY (DeckScreens._artBg) lies over the procedural land once
   it has landed — faded in when it lands late — and settles a breath closer
   over its first half minute: a one-off drift, never an endless loop */
#cardEnd .ceBgArt { display: none; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  object-position: 50% 42%; image-rendering: pixelated; transform-origin: 40% 45%; }
#cardEnd .ceBgArt.ceSoft { image-rendering: auto; }
#cardEnd.ceArtBg .ceBgArt { display: block; animation: ceDrift 32s cubic-bezier(.25,.6,.35,1) both; }
#cardEnd.ceArtBg .ceBgArt.ceArtIn { animation: ceFade 700ms ease-out both, ceDrift 32s cubic-bezier(.25,.6,.35,1) both; }
#cardEnd.ceIntro.ceArtBg .ceBgArt { animation: ceFade 450ms ease-out both, ceDrift 32s cubic-bezier(.25,.6,.35,1) both; }
#cardEnd .ceVig { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(ellipse 78% 56% at 50% 36%, rgba(8,6,4,0) 28%, rgba(8,6,4,0.55) 72%, rgba(8,6,4,0.9) 100%),
  linear-gradient(rgba(8,6,4,0.5), rgba(8,6,4,0) 16%, rgba(8,6,4,0) 46%, rgba(8,6,4,0.82) 72%, rgba(8,6,4,0.94)); }
/* a painted valley is worth seeing: the edges darken only enough to hold
   the frame, the top only enough to keep the eyebrow readable on a bright
   sky, and the foot only where the run's numbers stand on a phone */
#cardEnd.ceArtBg .ceVig { background:
  radial-gradient(ellipse 92% 80% at 50% 44%, rgba(8,6,4,0) 52%, rgba(8,6,4,0.42) 86%, rgba(8,6,4,0.72) 100%),
  linear-gradient(rgba(8,6,4,0.62), rgba(8,6,4,0.18) 13%, rgba(8,6,4,0) 24%, rgba(8,6,4,0) 52%, rgba(8,6,4,0.62) 78%, rgba(8,6,4,0.84)); }
/* the dawn is bright: a breath of dusk over all of it, so the card's own
   light is still the brightest thing on the screen */
#cardEnd.ceWin.ceArtBg .ceVig { background:
  radial-gradient(ellipse 92% 80% at 50% 44%, rgba(8,6,4,0) 52%, rgba(8,6,4,0.42) 86%, rgba(8,6,4,0.72) 100%),
  linear-gradient(rgba(8,6,4,0.62), rgba(8,6,4,0.18) 13%, rgba(8,6,4,0) 24%, rgba(8,6,4,0) 52%, rgba(8,6,4,0.62) 78%, rgba(8,6,4,0.84)),
  linear-gradient(rgba(14,8,4,0.26), rgba(14,8,4,0.26)); }
/* over a painted valley the run's numbers stand on dark, not on the hills */
#cardEnd.ceArtBg .ceScore, #cardEnd.ceArtBg .ceTile { background-color: rgba(12,9,6,0.84); }
#cardEnd.ceArtBg .cePlayed { padding: 5px 10px 6px; box-sizing: border-box;
  background: radial-gradient(closest-side, rgba(10,7,4,0.78), rgba(10,7,4,0.62) 70%, rgba(10,7,4,0) 100%); }
#cardEnd.ceArtBg .cePlayed small { color: #a9a08c; }
#cardEnd.ceArtBg .ceEye span { text-shadow: 0 2px 0 rgba(0,0,0,0.85), 0 0 10px rgba(8,6,4,0.9); }
#cardEnd .ceLines { position: absolute; pointer-events: none;
  inset: calc(var(--safe-top) + 6px) 6px calc(env(safe-area-inset-bottom, 0px) + 6px) 6px;
  border: 1px solid var(--fc2); opacity: 0.8;
  /* the frame's corners are the panels' brackets, larger (DeckScreens.SVG.corner) */
  background: var(--cnTL) 1px 1px / 28px 28px no-repeat, var(--cnTR) calc(100% - 1px) 1px / 28px 28px no-repeat,
    var(--cnBR) calc(100% - 1px) calc(100% - 1px) / 28px 28px no-repeat, var(--cnBL) 1px calc(100% - 1px) / 28px 28px no-repeat; }
#cardEnd .ceDeck { position: absolute; z-index: 3; top: calc(var(--safe-top) + 8px); right: 12px; width: 44px; height: 44px;
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
  padding: calc(var(--safe-top) + 8px) 16px calc(env(safe-area-inset-bottom, 0px) + 12px); }
/* vertical AUTO margins centre the column when it fits and start it at the
   top when it does not: justify-content: center would push an overflowing
   column's head above the scroll origin, where nobody can reach it */
#cardEnd .ceIn { margin: auto 0; width: 100%; display: flex; flex-direction: column; align-items: center; }

/* the eyebrow shares its row with the deck in the corner — a row as tall as
   the deck — so the banner below always starts clear of it */
#cardEnd .ceEye { display: flex; align-items: center; gap: 10px; width: min(360px, calc(100% - 96px)); height: 44px; margin: 0 auto 2px;
  color: #ead39b; font-size: 12px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; white-space: nowrap;
  text-shadow: 0 2px 0 rgba(0,0,0,0.85); position: relative; z-index: 2; }
#cardEnd.ceLoss .ceEye { color: #aeb8c8; }
#cardEnd .ceEye i { position: relative; flex: 1 1 0; min-width: 12px; height: 1px; background: linear-gradient(90deg, transparent, var(--fc)); }
#cardEnd .ceEye i:last-child { background: linear-gradient(90deg, var(--fc), transparent); }
/* each rule ends in a small faceted knot, opaque (DeckScreens.SVG.lozenge) */
#cardEnd .ceEye i::after { content: ''; position: absolute; top: -3.5px; width: 8px; height: 8px; background: var(--loz) no-repeat 0 0 / 100% 100%; }
#cardEnd .ceEye i:first-child::after { right: -4px; }
#cardEnd .ceEye i:last-child::after { left: -4px; }

#cardEnd .ceBan { position: relative; z-index: 2; padding: 0 30px; margin: 0 auto;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,0.65)); }
/* the banner is a picture drawn to the band's own size (DeckScreens._ribbon):
   the band and its two tails, under the word */
#cardEnd .ceRibArt { position: absolute; left: 0; top: 0; pointer-events: none; background: no-repeat 0 0 / 100% 100%; }
#cardEnd .ceRib { position: relative; display: flex; align-items: center; justify-content: center; gap: 14px;
  min-width: 248px; height: 56px; padding: 0 16px; }
#cardEnd .ceRib b { font-size: 32px; font-weight: 900; letter-spacing: 5px; line-height: 1; text-transform: uppercase; padding-left: 5px;
  background: linear-gradient(#fff6cf 0%, #f6d77c 38%, #d9a640 64%, #a8741e 100%); -webkit-background-clip: text; background-clip: text;
  color: transparent; filter: drop-shadow(0 2px 0 #070b16); }
/* the banner's sprigs and the branches beside the card: vector laurels */
#cardEnd .ceBL { width: 22px; height: 44px; flex: 0 0 auto; background: var(--sprigL) no-repeat 0 0 / 100% 100%;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.55)); }
#cardEnd .ceBL.r { background-image: var(--sprigR); }
#cardEnd.ceLoss .ceRib b { background: linear-gradient(#f1f4f8 0%, #c3ccd7 46%, #8e98a6 100%); -webkit-background-clip: text; background-clip: text; }

#cardEnd .ceMain { width: 100%; display: flex; flex-direction: column; align-items: center; }
/* the stage: the card stands on the plinth's slit, which is --pty art
   pixels below the plinth's top (DeckScreens.PLINTH) — so the card's foot is
   the stage's height less the --phang that hang below it. It stands --gap
   clear of the banner: the card's frame must never crowd the title */
#cardEnd .ceStage { position: relative; width: calc(var(--u) * var(--pw)); height: calc(var(--ch) + var(--u) * var(--phang)); margin-top: var(--gap); flex: 0 0 auto; }
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
  background: repeating-conic-gradient(from 0deg, var(--glow) 0deg 5.4deg, rgba(0,0,0,0) 6.6deg 17deg);
  animation: ceSpin 52s linear infinite; }
#cardEnd .ceRays.b > i { background: repeating-conic-gradient(from 7deg, var(--glow) 0deg 2deg, rgba(0,0,0,0) 3deg 23deg);
  animation-duration: 76s; animation-direction: reverse; }
#cardEnd .ceLaurel { display: none; bottom: calc(var(--u) * var(--phang)); width: calc(var(--u) * 75); height: calc(var(--u) * 150);
  transform-origin: 50% 100%; background: no-repeat 0 0 / 100% 100%;
  filter: drop-shadow(0 calc(var(--u) * 1.5) calc(var(--u) * 1.5) rgba(0,0,0,0.55)) drop-shadow(0 0 calc(var(--u) * 6) rgba(255,214,110,0.35)); }
#cardEnd .ceLaurels .ceLaurel { display: block; }
#cardEnd .ceLaurel.l { right: calc(50% + var(--cw) * 0.5 - var(--u) * 16); background-image: var(--laurelL); }
#cardEnd .ceLaurel.r { left: calc(50% + var(--cw) * 0.5 - var(--u) * 16); background-image: var(--laurelR); }
#cardEnd .cePlinth { left: 50%; top: calc(var(--ch) - var(--u) * var(--pty)); width: calc(var(--u) * var(--pw)); height: calc(var(--u) * var(--ph));
  margin-left: calc(var(--u) * var(--pw) * -0.5); image-rendering: pixelated; }
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
#cardEnd .ceClip { position: absolute; left: 50%; bottom: calc(var(--u) * var(--phang)); width: calc(var(--cw) + 80px); height: calc(var(--ch) + 60px);
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
/* a mote of light: a white-hot core in the tier's colour, soft to its edge;
   a glint (.gl) is a four-point star of light (DeckScreens.SVG.glint) */
#cardEnd .ceSparks > i { position: absolute; width: calc(var(--s) * 2.6); height: calc(var(--s) * 2.6); border-radius: 50%;
  margin: calc(var(--s) * -1.3) 0 0 calc(var(--s) * -1.3);
  background: radial-gradient(circle closest-side, #fffbea 0, #fffbea 22%, var(--sc) 46%, rgba(0,0,0,0) 100%);
  animation: ceFloat 3s linear infinite; }
#cardEnd .ceSparks > i.gl { width: calc(var(--s) * 4.4); height: calc(var(--s) * 4.4); margin: calc(var(--s) * -2.2) 0 0 calc(var(--s) * -2.2);
  border-radius: 0; background: var(--glint) no-repeat 0 0 / 100% 100%; }
#cardEnd .ceIdle .ceGlow, #cardEnd .ceIdle .ceRays, #cardEnd .ceIdle .ceTopGlow { opacity: 0.3; transition: opacity .5s ease-out; }
#cardEnd .ceWhy { position: absolute; left: 50%; bottom: calc(var(--u) * var(--phang) + 4px); width: var(--cw); height: calc(var(--ch) - 4px);
  margin-left: calc(var(--cw) * -0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  padding: 14px; box-sizing: border-box; text-align: center; background: rgba(12,9,6,0.58);
  border: 2px dashed rgba(214,170,74,0.32); border-radius: 6px; }
#cardEnd.ceLoss .ceWhy { border-color: rgba(140,156,178,0.32); }
#cardEnd .ceWhy b { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--ink); }
#cardEnd .ceWhy span { font: 600 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #d8c8a4; }
/* the deeds as gems: an empty setting, or one lit in gold */
#cardEnd .cePips { display: flex; gap: 9px; padding: 2px 0; }
#cardEnd .cePips:empty { display: none; }
#cardEnd .cePips i { width: 9px; height: 9px; transform: rotate(45deg); border-radius: 1.5px;
  background: rgba(140,156,178,0.14); box-shadow: inset 0 0 0 1.5px rgba(160,174,194,0.55); }
#cardEnd .cePips i.on { background: linear-gradient(135deg, #fff4c9 0%, #f6d074 30%, #d9a03a 62%, #87500f 100%);
  box-shadow: 0 0 0 1px #2a1906, 0 0 6px rgba(255,210,110,0.45); }

#cardEnd .ceInfo { width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  position: relative; z-index: 1; }
#cardEnd .cePlate { position: relative; margin-top: calc(-4px - var(--u) * var(--pfoot)); min-width: min(300px, 94%); padding: 8px 22px 9px; text-align: center;
  border-radius: 5px; background: linear-gradient(#2e2216, #1c140b);
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
/* the run's panels: a dark field in a faint rule, a burnished bracket in
   each corner (DeckScreens.SVG.corner), drawn at the device's pixels */
#cardEnd .ceScore, #cardEnd .ceTile { position: relative; width: 100%; background-color: rgba(12,9,6,0.76); border: 1px solid var(--fc2);
  background-repeat: no-repeat; background-image: var(--cnTL), var(--cnTR), var(--cnBR), var(--cnBL); background-size: 19px 19px;
  background-position: 2px 2px, calc(100% - 2px) 2px, calc(100% - 2px) calc(100% - 2px), 2px calc(100% - 2px); }
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
#cardEnd .ceAssist svg { width: 16px; height: 16px; margin: -2px 0; flex: 0 0 auto; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.6)); }
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
/* the plaques: a rounded rim that runs unbroken round every corner, the
   light falling soft across the face — drawn by the browser, never stepped */
#cardEnd .ceBtn::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: 6px;
  background: linear-gradient(rgba(255,240,200,0.08), rgba(255,240,200,0) 42%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.28)),
    linear-gradient(#3b3020 0%, #2c2316 50%, #241c11 100%);
  box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.42);
  filter: drop-shadow(0 3px 0 rgba(0,0,0,0.5)); }
#cardEnd .ceBtn.gold { min-height: 56px; color: #2b1906; font-size: 16px; text-shadow: 0 1px 0 rgba(255,240,190,0.55); }
#cardEnd .ceBtn.gold::before { background: linear-gradient(rgba(255,250,220,0.26), rgba(255,250,220,0) 44%, rgba(60,30,0,0) 58%, rgba(60,30,0,0.24)),
    linear-gradient(#f0cd6e 0%, #d7a542 46%, #b8862c 54%, #93661c 100%);
  box-shadow: inset 0 0 0 2px #2a1906, inset 0 0 0 3px #fff0b8, inset 0 0 0 5px #b8862a, inset 0 0 0 6px #4a3008; }
#cardEnd .ceBtn.navy { color: #d6deec; }
#cardEnd .ceBtn.navy::before { background: linear-gradient(rgba(200,215,255,0.07), rgba(200,215,255,0) 42%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.3)),
    linear-gradient(#25314a 0%, #1a2338 50%, #141b2c 100%);
  box-shadow: inset 0 0 0 2px #080b14, inset 0 0 0 3px rgba(150,170,210,0.38); }
#cardEnd .ceBtn:active { transform: translateY(2px); filter: brightness(0.88); }
#cardEnd .ceDia { width: 7px; height: 7px; background: currentColor; opacity: 0.75; transform: rotate(45deg); }

/* a tall phone or a tablet has height to spare: the card stands further off the banner */
@media (min-height: 900px) { #cardEnd { --gap: 24px; } }
/* a wide window: banner across the top, the card on the left, the run on the right */
@media (min-width: 900px) and (min-aspect-ratio: 5/4) {
  #cardEnd { --gap: 30px; }
  #cardEnd .ceMain { flex-direction: row; justify-content: center; align-items: center; gap: 64px; }
  #cardEnd .ceInfo { width: 360px; flex: 0 0 auto; }
  #cardEnd .cePlate { margin-top: 0; }
  #cardEnd .ceEye { font-size: 15px; width: min(420px, calc(100% - 120px)); height: 30px; }
  #cardEnd .ceRib { height: 64px; min-width: 330px; }
  #cardEnd .ceRib b { font-size: 40px; }
}
/* the narrowest phones: the banner gives the deck in the corner its room */
@media (max-width: 359px) {
  #cardEnd .ceEye { gap: 6px; font-size: 10.5px; letter-spacing: 1.2px; width: calc(100% - 80px); }
  #cardEnd .ceEye i { min-width: 0; }
  #cardEnd .ceRib { min-width: 206px; }
  #cardEnd .ceRib b { font-size: 28px; letter-spacing: 4px; }
  #cardEnd .ceDeck { right: 6px; }
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
@keyframes ceDrift { from { transform: scale(1.06); } }
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
/* "How cards work": the card announcement, again — small on the page, a
   44px target under the finger (the invisible ::after) */
#scrCards .clHow { position: relative; display: flex; align-items: center; gap: 7px; flex: 0 0 auto; margin: -4px auto 10px; height: 26px; padding: 0 12px;
  border: 1px solid rgba(214,170,74,0.45); border-radius: 999px; background: #1c140c; color: #f2cd62; cursor: pointer;
  font: 700 11px/1 var(--menufont); letter-spacing: 1.4px; text-transform: uppercase; }
#scrCards .clHow::before { content: ''; width: 7px; height: 7px; transform: rotate(45deg); background: #f2cd62; box-shadow: 0 0 6px rgba(255,210,100,.6); }
#scrCards .clHow::after { content: ''; position: absolute; left: -1px; right: -1px; top: -10px; bottom: -10px; }
#scrCards .clTabs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; width: 100%; max-width: 820px; margin: 0 auto; padding: 0 10px; flex: 0 0 auto; }
#scrCards .clTab { min-width: 0; min-height: 48px; padding: 4px 2px; border: 1px solid #3a2e1d; border-radius: 8px; background: #1b150e; color: var(--text);
  display: flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; font-family: var(--menufont); }
#scrCards .clTab.sel { border-color: var(--tc); background: #2a2114; box-shadow: inset 0 -3px 0 var(--tc), 0 0 12px var(--tg); }
/* the gem is the deck sheet's own (DeckUI.gemIcon): faceted, in the tier's
   colour, drawn smooth; the CSS diamond is only its fallback */
#scrCards .clGem { width: 15px; height: 15px; flex: 0 0 auto; display: block; color: var(--tc); filter: drop-shadow(0 0 4px var(--tg)); }
#scrCards i.clGem { width: 11px; height: 11px; transform: rotate(45deg); background: var(--tc); box-shadow: 0 0 0 1px #0d0905; filter: none; }
#scrCards .clGem.dim { color: #3b342a; filter: none; }
#scrCards i.clGem.dim { background: #3b342a; }
#scrCards .clTabNm { display: none; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
#scrCards .clTabN { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
/* THE NAMES TAKE THE ROOM THEY NEED: five equal columns gave "Iron" the
   width "Enlightenment" needed, and squeezed Enlightenment's gem and count
   onto its tab's border. Once the names are shown each tab is as wide as
   its own name plus the same margin, the spare shared out evenly — and
   the names wait for a window wide enough for all five */
@media (min-width: 700px) {
  #scrCards .clTabs { display: flex; }
  #scrCards .clTab { flex: 1 1 auto; padding: 4px 12px; }
  #scrCards .clTabNm { display: inline; } #scrCards .clTabAb { display: none; }
}
/* the narrowest phones close the gaps inside a tab: "III 7" beside its gem
   stood on the tab's own border at 320px */
@media (max-width: 359px) { #scrCards .clTab { gap: 4px; } }
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
/* NEW: the run's own cards wear a gold tag over their top edge, and their
   tier's tab a gold notch — hard pixels, no glow */
#scrCards .clNewTag { position: absolute; left: 50%; top: -7px; transform: translateX(-50%); z-index: 2; pointer-events: none;
  padding: 3px 7px 2px; background: #ffd45e; color: #2a1a06; border: 2px solid #2a1a06; box-shadow: 0 2px 0 #2a1a06;
  font: 700 10px/1 var(--menufont); letter-spacing: 1.2px; text-transform: uppercase; white-space: nowrap; }
#scrCards .clTab.clFresh { position: relative; }
#scrCards .clTab.clFresh::after { content: ''; position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; background: #ffd45e;
  box-shadow: 0 0 0 1px #2a1a06; }
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
  #cardEnd.ceArtBg .ceBgArt, #cardEnd.ceArtBg .ceBgArt.ceArtIn, #cardEnd.ceIntro.ceArtBg .ceBgArt { animation: none; }
  #cardEnd .ceSparks > i { opacity: 0.55; }
  #cardEnd .ceBtn:active { transform: none; }
  #cardEnd.ceCalm .ceIn { animation: ceFade 240ms ease-out both; }
}
`;
window.DeckScreens = DeckScreens;
