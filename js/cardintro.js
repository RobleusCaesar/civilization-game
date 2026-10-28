"use strict";
/* THE CARD ANNOUNCEMENT (tests/card-intro.mjs) — five screens that tell a
   player the cards exist, how they are earned, how they are played, what
   each of the five tiers brings and what the rarest of them can do, over
   the title the first time a device opens the game with the deck on.

   SEVEN TENTHS ON A WIDE WINDOW (operator, 2026-10-28, on a laptop:
   "Shrink all tutorial screens by 30%. They are too large right now"): a
   panel that is not a phone's is drawn at SHRINK of its old size — the
   panel, the type, the ornaments, the gaps. Two things keep their own
   size: a 44px touch target (the X, the dots, the NEXT plaque), and a card
   face, which is whole device pixels and never under the art's own size
   (one art pixel to a CSS pixel; on most desktops that is already the face
   it was). A phone's panel already is its screen and keeps it.

   WITH THE SWITCH OFF NOTHING HERE EXISTS. This file defines CardIntro and
   nothing else: no element, no stylesheet, no listener, no storage write.
   Every way in (DeckScreens.onTitle, the collection's "How cards work", the
   Screens.show hook) asks Deck.on() first or finds nothing open to act on.

   WHEN IT SHOWS ITSELF. Once per device (KEY, written through Deck's own
   throwing-storage-safe door, so a phone that blocks storage still sees it
   once a session and never twice), and only:
     - on the TITLE, after the boot splash has lifted and the title's own
       plaques have arrived (AFTER_LIFT_MS past Boot.done)
     - over the title's demo world — never over a run in progress, a pending
       draft, the reward screen or the tutorial's lesson (_canAuto)
   It is stamped seen when it is SHOWN (the victory-paths modal's rule): a
   reload half way through never deals it again, and the collection's
   "How cards work" (and ?cardsintro=1) bring it back on purpose.

   EVERY CLAIM IS THE CODE'S. The odds are read from CFG.CARDS (the Hard
   win table, PITY) and the tier names from Deck.TIERS, so a rule retuned
   there retunes the copy; the contract checks the words against the same
   constants, the +1 and +2 a win pays against Deck.settle, and each tier's
   line against the cards of that tier. The faces are Deck.face — the real
   catalog cards, at whole device pixels.

   THE PICTURES are the card faces (Deck.face, the real catalog paintings
   and frames) and one painted backdrop, the dusk valley (assets/cards/
   intro/dusk.webp, PixelLab, ART_PLAN.md "The card announcement"), fetched
   only when the announcement opens. Everything else it wears — the ribbon,
   the gold corners, the laurels, the emblems, the gems — is CHROME, drawn
   as vectors at the device's own resolution (CardIntro.SVG, below), and
   the lettering is the menu face (Cinzel), crisp at any size. */

const CardIntro = {
  KEY: 'neo-cards-intro',
  AFTER_LIFT_MS: 850,      // past the splash's fade and the title's own pop-in
  WAIT_MAX_MS: 20000,      // a boot that never lifts is not waited on forever
  DIR: 'assets/cards/intro/',
  /* what each screen shows. The fan reads up the tiers toward the middle:
     Stone and Bronze outside, Iron and Imperial in, the Legendary centred. */
  FAN: ['forager_cache', 'swift_raiders', 'enlightenment', 'legion_marches', 'hunters_pack'],
  PLAY: [
    { id: 'war_band', cap: 'Armies' },
    { id: 'harvest_festival', cap: 'Harvests' },
    { id: 'starfall', cap: 'Fire from the sky' },
  ],
  /* THE TIERS (operator: "turn the whole tier structure… into its own
     tutorial screen… no more than a sentence on what improves at each
     level"): one short line a tier, and the cards that line names — the
     contract checks each of them is of that tier, so a line can never
     promise what its tier does not hold */
  TIER_LINES: {
    stone:    { line: 'Goods and quick help.', backs: ['forager_cache', 'willing_hands', 'quick_hands'] },
    bronze:   { line: 'Days of richer work, or a war band.', backs: ['harvest_festival', 'bountiful_land', 'war_band'] },
    iron:     { line: 'Elite troops, siege engines, sabotage.', backs: ['iron_legion', 'siege_train', 'blight'] },
    imperial: { line: 'Legions, a golden age, fire from the sky.', backs: ['legion_marches', 'golden_age', 'starfall'] },
    enlight:  { line: 'Game changers: a dragon, a darkened sun.', backs: ['dragonfire', 'swallowed_sun'] },
  },
  SHRINK: 0.7,             // a wide panel's size against the one it was
  /* the two prizes. Their paintings already show the beast, so nothing is
     drawn over or behind a card: the glory is the tier's own light (a slow
     burst and an aura behind the card), a glint running round its rim and
     motes rising beside it — never across the art */
  PRIZES: [
    { id: 'krakens_call', cap: 'Summon the Kraken' },
    { id: 'dragonfire', cap: 'Unleash the Dragon' },
  ],

  open: false,
  page: 0,
  from: 'title',
  _armed: false,           // the automatic showing is tried once per page load
  _root: null,
  _prevFocus: null,
  _gen: 0,                 // bumps per open: a timer from an older one stands down
  _sizes: null,

  /* ---------------- the facts the copy is made of ---------------- */
  facts() {
    const C = (typeof CFG !== 'undefined' && CFG.CARDS) || {};
    const hard = (C.DROPS && C.DROPS.hard) || [0, 0, 0, 0, 0];
    const leg = hard[4] || 0;
    // "1 in 4" when the share is a whole fraction, else the percentage
    const oneIn = leg > 0 && Math.abs(100 / leg - Math.round(100 / leg)) < 1e-9 ? Math.round(100 / leg) : 0;
    return {
      pity: C.PITY | 0,
      hardLegend: leg, hardOneIn: oneIn,
      tiers: (window.Deck ? Deck.TIERS : []).map(t => ({ k: t.k, name: t.name, rarity: t.rarity, col: t.col, glow: t.glow })),
      held: window.Deck ? Deck.total() : 0,
    };
  },
  num(n) { return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n); },

  /* ---------------- when ---------------- */
  seen() { return !!window.Deck && Deck._get(this.KEY) === '1'; },
  _forced() {
    try { return /[?&]cardsintro=1\b/.test(String(location.search || '')); } catch (e) { return false; }
  },
  /* the title as it stands right now may wear the announcement: the deck on,
     the title showing its demo world (no run, no pending draft), nothing being
     founded, no reward screen, no lesson running */
  _canAuto() {
    if (!window.Deck || !Deck.on() || this.open) return false;
    if (!window.Screens || Screens.current !== 'title' || Screens._founding) return false;
    if (typeof S !== 'undefined' && S && !Screens._demo) return false;
    if (typeof S !== 'undefined' && S && S.tut && S.tut.on) return false;
    if (Deck.lessonHolds && Deck.lessonHolds()) return false;
    if (Screens.modalUp && Screens.modalUp()) return false;
    return true;
  },
  /* DeckScreens.onTitle calls in on every title render (the backend's status
     re-renders it too): the first call of the page load arms one attempt */
  maybeShow() {
    if (!window.Deck || !Deck.on() || this.open || this._armed) return false;
    const forced = this._forced();
    if (!forced && this.seen()) { this._armed = true; return false; }
    this._armed = true;
    const gen = ++this._gen, t0 = Date.now();
    const go = () => {
      if (gen !== this._gen || this.open) return;
      if (this._canAuto()) this.show('title', { auto: true });
      else this._armed = false;   // not now: the next title visit tries again
    };
    const wait = () => {
      if (gen !== this._gen || this.open) return;
      const lifted = !window.Boot || Boot.done;
      if (lifted) { setTimeout(go, this.AFTER_LIFT_MS); return; }
      if (Date.now() - t0 > this.WAIT_MAX_MS) { this._armed = false; return; }
      setTimeout(wait, 120);
    };
    wait();
    return true;
  },
  // Screens.show calls in on every screen change: leaving the screen the
  // announcement stands over takes it away (a test, a deep link, Continue)
  onScreen(name) {
    if (!this.open) return;
    const home = this.from === 'cards' ? 'cards' : 'title';
    if (name !== home) this.close(true);
  },

  /* ---------------- opening and closing ---------------- */
  show(from, opts) {
    if (!window.Deck || !Deck.on() || this.open) return false;
    opts = opts || {};
    this.from = from === 'cards' ? 'cards' : 'title';
    Deck._set(this.KEY, '1');   // stamped when SHOWN
    this._css();
    const gen = ++this._gen;
    this.open = true;
    this.page = 0;
    this._prevFocus = document.activeElement;
    this._build();
    this._bind();
    this._layout();
    this.go(0, { first: true });
    // the first screen's art, then the rest in idle time
    this._preload(0).then(() => { if (gen === this._gen && this.open) this._root.classList.add('ciReady'); });
    setTimeout(() => { if (gen === this._gen && this.open) for (let i = 1; i < this.PAGES.length; i++) this._preload(i); }, 900);
    /* a chime when a tap opened it; arriving by itself it says nothing — no
       sound or buzz may come before the player has touched the page (the
       browser refuses both, and says so in the console) */
    if (!opts.auto) this._cue('bond');
    return true;
  },
  close(silent) {
    if (!this.open) return;
    this.open = false;
    this._gen++;
    this._unbind();
    const root = this._root;
    this._root = null;
    const done = () => { if (root && root.parentNode) root.parentNode.removeChild(root); };
    if (silent || this.reduced()) done();
    else {
      root.classList.add('ciOut');
      setTimeout(done, 260);
    }
    if (!silent) this._cue('ok');
    const back = this._prevFocus;
    this._prevFocus = null;
    try { if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); } catch (e) {}
  },


  /* ---------------- the pages ---------------- */
  PAGES: ['hello', 'earn', 'play', 'tiers', 'legends'],
  copy() {
    const f = this.facts();
    const t = f.tiers, legend = t[4] || { name: 'Enlightenment', rarity: 'Legendary' };
    return {
      hello: {
        kick: 'New feature', title: 'Cards',
        sub: 'Win or lose, you’ll earn cards to use in future games.',
      },
      /* the operator's words (2026-10-28): the victory road says what a win
         pays and the defeat road only that one fought hard still pays — the
         deeds and the days are the rule's business, not this screen's */
      earn: {
        kick: 'How to earn', title: 'Earn them',
        sub: 'Every victory earns a card, and so do hard-fought losses.',
        win: { h: 'Victory', p: 'A good win +1 card, a hard-fought win +2 cards.' },
        loss: { h: 'A hard-fought defeat', p: 'Still a card, if you did the work.' },
        one: '+1 card', two: '+2 cards',
        foot: 'Strike your banner and you leave with nothing.',
      },
      play: {
        kick: 'How to play', title: 'Play them',
        sub: 'Tap the deck in your top bar, lift a card, and play it when it counts.',
        deck: 'Your deck', held: f.held > 0 ? `${f.held} ${f.held === 1 ? 'card' : 'cards'} waiting` : '',
        foot: 'Each card plays once — then it’s gone. Choose your moment.',
      },
      tiers: {
        kick: 'Card rarity', title: 'Five tiers',
        sub: 'The higher the tier, the stronger the card.',
        foot: (f.hardOneIn ? `Win on Hard: 1 card in ${f.hardOneIn} is ${legend.rarity}.` : `Win on Hard for ${legend.rarity} cards.`) +
          (f.pity ? ` ${f.pity} wins without one, and the next is guaranteed.` : ''),
      },
      legends: {
        kick: 'The prizes', title: 'Chase legends',
        sub: 'The harder the fight, the rarer the card.',
        cta: 'Let’s go',
      },
    };
  },

  _build() {
    const c = this.copy(), esc = s => this.esc(s);
    // a compound word never breaks at its own hyphen ("a hard-" / "fought win")
    const nb = s => esc(s).replace(/(\w+-\w+)/g, '<span class="ciNb">$1</span>');
    const root = document.createElement('div');
    root.id = 'cardIntro';
    root.className = 'plaques' + (this.reduced() ? ' ciStill' : '');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'ciTitle0');
    const dots = this.PAGES.map((p, i) =>
      `<button type="button" class="ciDot" data-dot="${i}" aria-label="Screen ${i + 1} of ${this.PAGES.length}"><i></i></button>`).join('');
    const page = (i, key, inner) => {
      const P = c[key];
      return `<section class="ciPage ciP-${key}" data-page="${i}" aria-hidden="true">` +
        `<div class="ciHead"><div class="ciRibbon"><i class="ciRib"></i><span>${esc(P.kick)}</span></div>` +
        `<h2 class="ciTitle" id="ciTitle${i}"><i class="ciLaurel l"></i><span class="ciWord">${esc(P.title)}</span><i class="ciLaurel r"></i></h2>` +
        `<i class="ciRule"></i><p class="ciSub">${nb(P.sub)}</p></div>` +
        `<div class="ciHero">${inner}</div>` +
        (P.foot ? `<p class="ciFoot">${esc(P.foot)}</p>` : '') +
        `</section>`;
    };
    const E = c.earn;
    const earn =
      `<div class="ciRoads">` +
        `<div class="ciRoad win"><i class="ciEmb" data-svg="win"></i><div class="ciRoadTx"><h3>${esc(E.win.h)}</h3><p>${nb(E.win.p)}</p>` +
          // each count keeps its cards: a row too wide for its road breaks between the two, never inside one
          `<p class="ciGain"><span class="ciG"><span class="ciCardPip"></span><b>${esc(E.one)}</b></span><span class="ciOr">or</span>` +
            `<span class="ciG"><span class="ciCardPip"></span><span class="ciCardPip two"></span><b>${esc(E.two)}</b></span></p></div></div>` +
        `<div class="ciRoad loss"><i class="ciEmb" data-svg="fight"></i><div class="ciRoadTx"><h3>${esc(E.loss.h)}</h3><p>${esc(E.loss.p)}</p></div></div>` +
      `</div>`;
    const play =
      `<div class="ciPlay"><figure class="ciDeck"><div class="ciDeckBtn" aria-hidden="true"><i class="ciDeckIco" data-svg="deck"></i><i class="ciTap"></i></div>` +
        `<figcaption><b>${esc(c.play.deck)}</b>${c.play.held ? `<small>${esc(c.play.held)}</small>` : ''}</figcaption></figure>` +
      `<i class="ciArrow" aria-hidden="true"></i><div class="ciTrio"></div></div>`;
    const tiers = `<ol class="ciTiers"></ol>`;
    const legends = `<div class="ciLegends"><div class="ciBeasts"></div></div>`;
    root.innerHTML =
      `<div class="ciVeil" data-act="veil"></div>` +
      `<div class="ciPanel">` +
        `<i class="ciDusk"></i><i class="ciRays"></i><i class="ciGlow"></i>` +
        `<i class="ciCorner tl"></i><i class="ciCorner tr"></i><i class="ciCorner bl"></i><i class="ciCorner br"></i>` +
        `<div class="ciSparks" aria-hidden="true"></div>` +
        `<div class="ciPages">` +
          page(0, 'hello', '<div class="ciFan"></div>') +
          page(1, 'earn', earn) +
          page(2, 'play', play) +
          page(3, 'tiers', tiers) +
          page(4, 'legends', legends) +
        `</div>` +
        `<div class="ciNav"><i class="ciCta" aria-hidden="true"></i>` +
          `<button type="button" class="ciBack" data-act="back" aria-label="Back">${this.ARROW_L}<span>Back</span></button>` +
          `<button type="button" class="abtn big ciNext" data-act="next"><span class="blab">Next ${this.ARROW_R}</span></button>` +
          `<span class="ciNavPad"></span>` +
        `</div>` +
        `<div class="ciDots" role="group" aria-label="Screens">${dots}</div>` +
        `<button type="button" class="ciX" data-act="close" aria-label="Close">${this.CLOSE_SVG}</button>` +
      `</div>`;
    document.body.appendChild(root);
    this._root = root;
    // the chrome: drawn once per opening, handed to CSS as vectors
    const V = this.SVG;
    for (const el of root.querySelectorAll('[data-svg]')) el.style.backgroundImage = V.uri(V[el.dataset.svg]());
    root.style.setProperty('--corner', V.uri(V.corner()));
    root.style.setProperty('--ribbon', V.uri(V.ribbon()));
    root.style.setProperty('--laurel', V.uri(V.laurel()));
    root.style.setProperty('--trail', V.uri(V.trail()));
    // …and the one painted picture behind it all
    root.style.setProperty('--dusk', `url("${this.art('dusk')}")`);
    this._sparks();
  },
  ART: { dusk: 'dusk.webp' },
  art(k) { return this.DIR + this.ART[k] + '?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 1); },

  /* THE ROOM EACH SCREEN HAS. The faces come in whole-pixel steps (Deck.fit:
     on a 3x phone 59 / 117 / 176 CSS px, on a 1x desktop 176 / 352), so the
     sizes are chosen from what fits the panel, and the faces are rebuilt
     only when the step they land on changes (a rotation, a resize). */
  _layout() {
    const root = this._root;
    if (!root) return;
    const vp = this._vp(), dpr = this._dpr();
    const narrow = vp.w < 600;
    root.classList.toggle('ciNarrow', narrow);
    // a wide panel at seven tenths of its old self; a phone's is its screen
    const k = narrow ? 1 : this.SHRINK;
    root.style.setProperty('--k', k);
    /* the chrome is vector, so it takes any size: the ribbon first (the
       panel's top gives way to its overhang), then the ornaments */
    root.style.setProperty('--ribW', Math.round(narrow ? Math.min(268, vp.w * 0.69) : 330 * k) + 'px');
    root.style.setProperty('--cornerW', Math.round(narrow ? 50 : 72 * k) + 'px');
    root.style.setProperty('--laurelH', Math.round(narrow ? 84 : 124 * k) + 'px');
    root.style.setProperty('--embW', Math.round(narrow ? 70 : 124 * k) + 'px');
    void dpr;
    const panel = root.querySelector('.ciPanel');
    const pw = panel.clientWidth || Math.min(vp.w - 24, 880 * k);
    const ph = panel.clientHeight || vp.h - 60;
    root.classList.toggle('ciShort', ph < 700 * k);
    const avail = pw - (narrow ? 24 : 72 * k);
    // what the hero may use: the panel less its head and its nav
    const heroH = Math.max(160 * k, ph - (narrow ? 380 : 300));
    /* a face is whole device pixels, and on a wide panel never smaller than
       the art's own size (one art pixel to a CSS pixel) unless the room it
       had before already was — most desktops showed every face at that
       size, and below it the painting's pixels go */
    const step = (w, h) => Deck.fit(Math.max(10, Math.min(w, h * Deck.W / Deck.H))).w;
    const fit = (w, h) => narrow ? step(w, h) : Math.max(step(w * k, h), Math.min(step(w, h / k), Deck.W));
    const cw = fit(narrow ? avail * 0.54 : 230, heroH / 1.1);
    // the cards behind the middle one: a step smaller where the steps allow
    const sw = narrow ? fit(cw * 0.72, heroH) : cw;
    let trioW = fit(narrow ? (avail + 16) / 3 : 200, (heroH - (narrow ? 120 : 40 * k)) / 1.02);
    // the deck button beside three cards needs the room for both; a panel
    // without it (a tablet upright) stacks them as a phone does
    const stack = narrow || 3 * trioW + (40 + 120) * k > avail;
    if (stack && !narrow) trioW = fit(Math.min(200, (avail - 40 * k) / 3 / k), (heroH - 110 * k) / 1.02);
    root.classList.toggle('ciStack', stack);
    const beastW = fit(narrow ? avail / 2.2 : 200, (heroH - (narrow ? 60 : 50 * k)) / 1.06);
    const key = [cw, sw, trioW, beastW, narrow, stack, Math.round(avail)].join(':');
    if (this._sizes !== key) {
      this._sizes = key;
      this._fan(cw, sw, avail, narrow);
      this._trio(trioW);
      this._tiers();
      this._legends(beastW);
    }
    this._sizePanel(narrow);
    this._fitPage();
  },
  /* A WIDE PANEL IS AS TALL AS ITS TALLEST SCREEN NEEDS: seven tenths of
     its old height, and more only where a screen cannot stand in that — a
     card face never shrinks below the art's own size, so a desktop that
     shows its faces at 176px (a 1x or a 2x screen) needs a taller panel
     than one that shows them at 141 (a laptop at 125%). Every screen is
     measured at rest and the tallest decides, so the panel is one height on
     all five and the nav never moves between them; never taller than it
     used to be, or than the window. A phone's panel is its screen. */
  _sizePanel(narrow) {
    const root = this._root;
    root.style.removeProperty('--panelH');
    if (narrow) return;
    const chrome = root.querySelector('.ciNav').offsetHeight + root.querySelector('.ciDots').offsetHeight;
    let need = 0;
    root.classList.add('ciMeasure');
    for (const pg of root.querySelectorAll('.ciPage')) {
      const was = pg.classList.contains('on'), cls = pg.className;
      pg.classList.add('on');
      pg.classList.remove('tight', 'scroll');
      const back = this._settle(pg);
      const foot = pg.querySelector('.ciFoot'), hero = pg.querySelector('.ciHero');
      let L = 0, top = Infinity, bot = -Infinity;
      for (const c of hero.children) {
        L += Math.max(c.offsetHeight, c.scrollHeight);
        const q = c.getBoundingClientRect();
        top = Math.min(top, q.top); bot = Math.max(bot, q.bottom);
      }
      /* what is drawn past the hero's own boxes counts too: the fan's outer
         cards drop and tilt by transform, which no box records. The hero
         centres its boxes, so a card hanging O below them needs 2·O more */
      let over = 0;
      for (const e of hero.querySelectorAll('.ccard, figcaption')) {
        const q = e.getBoundingClientRect();
        over = Math.max(over, top - q.top, q.bottom - bot);
      }
      const h = pg.querySelector('.ciHead').offsetHeight + (foot ? foot.offsetHeight + 4 : 0) + L + 2 * Math.max(0, over);
      back();
      pg.className = cls;
      if (!was) pg.classList.remove('on');
      need = Math.max(need, h);
    }
    root.classList.remove('ciMeasure');
    const H = Math.min(770, Math.max(Math.round(770 * this.SHRINK), Math.ceil(need + chrome + 10)));
    root.style.setProperty('--panelH', H + 'px');
  },
  /* THE SCREEN FITS ITS PANEL, BY MEASUREMENT. A short window (an iPhone SE,
     a laptop's letterbox) cannot hold every screen at full size: the screen
     on show is measured, TIGHTENED (a smaller headline, laurels, copy and
     road cards) if its hero would spill, and if it still would, its hero
     SCROLLS inside the panel — never laid over its neighbours. */
  _fitPage() {
    const pg = this._root && this._root.querySelector('.ciPage.on');
    if (!pg) return;
    pg.classList.remove('tight', 'scroll');
    /* what is measured is where the screen comes to REST: the light round
       the prizes (a burst wider than the card, an aura, the rim, the motes)
       is decoration that may spill past anything, so it is set aside; and a
       screen just turned to is still rising into place (its entrance starts
       22-40px low), so every entrance is run to its end for the reading and
       handed back where it was. Measured mid-flight, a screen that fits was
       made to scroll. */
    const spills = () => {
      const hero = pg.querySelector('.ciHero');
      this._root.classList.add('ciMeasure');
      const back = this._settle(pg);
      let need = 0;
      for (const c of hero.children) need += Math.max(c.offsetHeight, c.scrollHeight);
      back();
      this._root.classList.remove('ciMeasure');
      return need > hero.clientHeight + 2;
    };
    if (spills()) {
      pg.classList.add('tight');
      if (spills()) pg.classList.add('scroll');
    }
    this._clearX(pg);
    this._fade(pg.querySelector('.ciHero'));
    this._sparkRoom(pg);
  },
  /* a screen just turned to is still rising into place: every entrance on
     it is run to its end for a reading, and the returned function hands
     each back to the moment it was at (the screen plays on, unmoved) */
  _settle(pg) {
    const back = [];
    for (const a of (pg.getAnimations ? pg.getAnimations({ subtree: true }) : [])) {
      const end = a.effect && a.effect.getComputedTiming().endTime;
      if (isFinite(end) && a.playState !== 'finished') { back.push([a, a.currentTime]); a.currentTime = end; }
    }
    return () => { for (const [a, t] of back) a.currentTime = t; };
  },
  /* THE SPARKS RISE WHERE THE CARDS ARE, NEVER THROUGH THE COPY: they pass
     behind the screens, so a spark crossing a line of small type showed in
     the gaps between its letters and read as a stray mark ("Ha•rd",
     "ARMİES"). Their field is the hero's own band — the words above it and
     below it are left clear — and the words INSIDE the hero are cut out of
     it: a hole round the tiers' list and round the words of every caption (an
     even-odd clip path; holes that would touch are made one, or their
     overlap would be cut back in). A screen that has to scroll moves its
     words under a still field, so it shows none. The roads need no hole:
     they stand on their own dark panels. */
  _sparkRoom(pg) {
    const sp = this._root.querySelector('.ciSparks'), hero = pg.querySelector('.ciHero'), panel = this._root.querySelector('.ciPanel');
    if (!sp || !hero) return;
    let top = 0;
    for (let e = hero; e && e !== panel; e = e.offsetParent) top += e.offsetTop;
    // a pixel inside the band each way: offsets are whole pixels, the copy beside it is not
    const height = Math.max(0, hero.offsetHeight - 2);
    sp.style.top = (top + 1) + 'px';
    sp.style.height = height + 'px';
    sp.style.visibility = pg.classList.contains('scroll') ? 'hidden' : '';
    const width = sp.offsetWidth, PAD = 6;
    // the words where they come to rest, in the field's own pixels (the panel may still be scaling in)
    const back = this._settle(pg);
    const F = sp.getBoundingClientRect(), k = F.width / (width || 1) || 1;
    const holes = [];
    const add = q => {
      if (!q || !q.width) return;
      holes.push({ l: Math.max(0, (q.left - F.left) / k - PAD), t: Math.max(0, (q.top - F.top) / k - PAD),
        r: Math.min(width, (q.right - F.left) / k + PAD), b: Math.min(height, (q.bottom - F.top) / k + PAD) });
    };
    const ol = hero.querySelector('.ciTiers');
    if (ol && ol.offsetWidth) add(ol.getBoundingClientRect());
    for (const fc of hero.querySelectorAll('figcaption')) {
      const rg = document.createRange();
      rg.selectNodeContents(fc);
      add(rg.getBoundingClientRect());
    }
    back();
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < holes.length && !merged; i++) for (let j = i + 1; j < holes.length; j++) {
        const A = holes[i], B = holes[j];
        if (A.l <= B.r && B.l <= A.r && A.t <= B.b && B.t <= A.b) {
          holes[i] = { l: Math.min(A.l, B.l), t: Math.min(A.t, B.t), r: Math.max(A.r, B.r), b: Math.max(A.b, B.b) };
          holes.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
    const f = n => Math.round(n * 10) / 10;
    let d = `M0 0H${f(width)}V${f(height)}H0Z`;
    for (const h of holes) if (h.r > h.l && h.b > h.t) d += `M${f(h.l)} ${f(h.t)}H${f(h.r)}V${f(h.b)}H${f(h.l)}Z`;
    sp.style.clipPath = `path(evenodd, "${d}")`;
  },
  /* THE X KEEPS ITS CORNER: on a phone a two-line headline pushes its
     laurels out to the panel's edges (and on a narrow phone even a one-line
     one stands close), and the right laurel's tip rose into the close disc.
     Both laurels are drawn a little smaller, from their feet, until the
     right one's leaves clear the disc's gold ring — never moved down, where
     they would meet the line of copy below (and where that would take them
     under 60%, not drawn at all: a twig is no ornament). The leaves are the
     box less 15% each side (the drawing's own reach, CardIntro.SVG.laurel),
     the ring the disc's 17px plus its 2px rim. Measured on the LAYOUT
     (offsets up to the panel), never the drawn boxes: the head slides in by
     a transform, and a laurel caught mid-slide must not decide where it
     rests. tests/card-intro.mjs (theXStandsClearOfTheLaurels) asks the same
     question of the drawn page. */
  CLEAR: { inkX: 0.15, ring: 19, gap: 2 },
  _clearX(pg) {
    const title = pg.querySelector('.ciTitle'), x = this._root.querySelector('.ciX'), panel = this._root.querySelector('.ciPanel');
    if (!title || !x) return;
    title.style.removeProperty('--lauS');
    const box = el => {
      let l = 0, t = 0;
      for (let e = el; e && e !== panel; e = e.offsetParent) { l += e.offsetLeft; t += e.offsetTop; }
      return { l, t, w: el.offsetWidth, h: el.offsetHeight };
    };
    const X = box(x), cx = X.l + X.w / 2, cy = X.t + X.h / 2, need = this.CLEAR.ring + this.CLEAR.gap;
    // how far the leaves of a laurel drawn at scale k (from its feet) stand from the disc's centre
    const reach = (q, k) => {
      const mid = q.l + q.w / 2, half = q.w * k * (0.5 - this.CLEAR.inkX), top = q.t + q.h * (1 - k), bot = q.t + q.h;
      const nx = Math.max(mid - half, Math.min(cx, mid + half)), ny = Math.max(top, Math.min(cy, bot));
      return Math.hypot(cx - nx, cy - ny);
    };
    let s = 1;
    for (const lau of title.querySelectorAll('.ciLaurel')) {
      const q = box(lau);
      if (!q.w) continue;
      let k = 1;
      while (k >= 0.6 && reach(q, k) < need) k -= 0.02;
      s = Math.min(s, k);
    }
    if (s < 1) title.style.setProperty('--lauS', s < 0.6 ? 0 : s.toFixed(2));
  },
  /* a screen that scrolls says so at its edges: what runs past the hero fades
     out there, rather than being cut through the middle of a line */
  _fade(hero) {
    if (!hero) return;
    const on = hero.closest('.ciPage.scroll');
    const up = on && hero.scrollTop > 1, down = on && hero.scrollTop + hero.clientHeight < hero.scrollHeight - 1;
    hero.style.setProperty('--fadeT', up ? '18px' : '0px');
    hero.style.setProperty('--fadeB', down ? '26px' : '0px');
  },
  _fan(cw, sw, avail, narrow) {
    const host = this._root.querySelector('.ciFan');
    host.innerHTML = '';
    /* the spread: the outermost card stands just inside the panel, never
       further out than a card and a fifth on a wide one. It turns about a
       point 85% down its height (the slot's transform-origin), so its outer
       top corner swings out by the card's height as well as its width —
       measured here, scaled as the slot scales it */
    const rot = narrow ? 6 : 8, th = 2 * rot * Math.PI / 180, sc = 1 - 2 * 0.07, sh = sw * Deck.H / Deck.W;
    const reach = sc * (sw / 2 * Math.cos(th) + 0.85 * sh * Math.sin(th));
    const outer = Math.max(cw * 0.3, Math.min(cw * 1.2, avail / 2 - reach - 3));
    host.style.setProperty('--cw', cw + 'px');
    host.style.setProperty('--ch', cw * Deck.H / Deck.W + 'px');
    host.style.setProperty('--rot', rot + 'deg');
    const slots = [-2, -1, 0, 1, 2];
    this.FAN.forEach((id, n) => {
      const i = slots[n], a = Math.abs(i);
      const slot = document.createElement('div');
      slot.className = 'ciSlot' + (i === 0 ? ' mid' : '');
      const w = i === 0 ? cw : sw;
      slot.style.setProperty('--i', i);
      slot.style.setProperty('--a', a);
      slot.style.setProperty('--sw', w + 'px');
      slot.style.setProperty('--sh', w * Deck.H / Deck.W + 'px');
      slot.style.setProperty('--x', (i < 0 ? -1 : 1) * (a === 2 ? outer : a === 1 ? outer * (narrow ? 0.66 : 0.56) : 0) + 'px');
      slot.style.setProperty('--z', 10 - a);
      slot.style.setProperty('--d', (a === 0 ? 0 : a === 1 ? 90 : 170) + 'ms');
      slot.appendChild(Deck.face(id, { w }));
      host.appendChild(slot);
    });
  },
  _trio(cw) {
    const host = this._root.querySelector('.ciTrio');
    host.innerHTML = '';
    host.style.setProperty('--cw', cw + 'px');
    this.PLAY.forEach((p, n) => {
      const fig = document.createElement('figure');
      fig.className = 'ciCard';
      fig.style.setProperty('--n', n - 1);
      const tilt = document.createElement('div');
      tilt.className = 'ciTilt';
      tilt.appendChild(Deck.face(p.id, { w: cw }));
      fig.appendChild(tilt);
      const cap = document.createElement('figcaption');
      cap.textContent = p.cap;
      fig.appendChild(cap);
      host.appendChild(fig);
    });
  },
  /* THE TIERS, a screen of their own (operator: "clean, well laid out, and
     easy to read"): five rows on a dark plate, Stone at the top to
     Enlightenment at the foot, each a gem in the tier's own cut, its name in
     the tier's colour with its rarity beside it, and one short line on what
     the tier brings. Built through the DOM: a gem is a data URI, and a
     url("…") inside a quoted style attribute ends the attribute. */
  _tiers() {
    const f = this.facts(), V = this.SVG;
    const ol = this._root.querySelector('.ciTiers');
    ol.innerHTML = '';
    f.tiers.forEach((t, n) => {
      const li = document.createElement('li');
      li.style.setProperty('--tc', t.col);
      li.style.setProperty('--tg', t.glow);
      li.style.setProperty('--n', n);
      const gem = document.createElement('i');
      gem.className = 'ciGem';
      gem.style.backgroundImage = V.uri(V.gem(t.col));
      const nm = document.createElement('span');
      nm.className = 'ciTn';
      nm.innerHTML = `<b>${this.esc(t.name)}</b><small>${this.esc(t.rarity)}</small>`;
      const tx = document.createElement('span');
      tx.className = 'ciTd';
      tx.textContent = (this.TIER_LINES[t.k] || {}).line || '';
      li.appendChild(gem);
      li.appendChild(nm);
      li.appendChild(tx);
      ol.appendChild(li);
    });
  },
  _legends(cw) {
    const host = this._root.querySelector('.ciBeasts');
    host.innerHTML = '';
    host.style.setProperty('--cw', cw + 'px');
    host.style.setProperty('--ch', cw * Deck.H / Deck.W + 'px');
    this.PRIZES.forEach((b, n) => {
      const fig = document.createElement('figure');
      fig.className = 'ciPrize ' + (n ? 'dragon' : 'kraken');
      fig.style.setProperty('--n', n);
      const t = Deck.tier(Deck.card(b.id).tier);
      fig.style.setProperty('--tc', t.col);
      fig.style.setProperty('--tg', t.glow);
      const stage = document.createElement('div');
      stage.className = 'ciStage';
      // behind the card: the tier's light, a slow burst and a breathing aura
      stage.innerHTML = '<i class="ciBurst"></i><i class="ciAura"></i>';
      stage.appendChild(Deck.face(b.id, { w: cw }));
      // round it: a glint running the rim, and motes rising beside it (outside the face, never across the art)
      let motes = '';
      for (let i = 0; i < 8; i++) {
        const side = i % 2 ? 1 : -1, x = side < 0 ? -6 - (i * 7 % 12) : 106 + (i * 5 % 12);
        motes += `<i style="--x:${x}%;--y:${40 + (i * 23 % 55)}%;--dl:-${(i * 0.61 % 3).toFixed(2)}s;--du:${(2.6 + (i * 0.37 % 1.4)).toFixed(2)}s;--dx:${side * (2 + i % 3)}px"></i>`;
      }
      stage.insertAdjacentHTML('beforeend', `<i class="ciRim"></i><span class="ciMotes" aria-hidden="true">${motes}</span>`);
      fig.appendChild(stage);
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${this.esc(b.cap)}</b><small>${this.esc(t.rarity)}</small>`;
      fig.appendChild(cap);
      host.appendChild(fig);
    });
  },
  _sparks() {
    const host = this._root.querySelector('.ciSparks');
    let h = '';
    // a fixed scatter (no Math.random: the same sparks every time)
    for (let i = 0; i < 26; i++) {
      const x = 8 + (i * 37 % 84), y = (i * 41 % 60), d = (i * 53 % 29) / 10, dur = 3 + (i * 29 % 19) / 10, s = 2 + (i % 3);
      h += `<i style="--x:${x}%;--y:${y}%;--dl:-${d}s;--du:${dur}s;--s:${s}px;--dx:${(i % 5) - 2}"></i>`;
    }
    host.innerHTML = h;
  },

  /* ---------------- moving between screens ---------------- */
  go(n, opts) {
    if (!this._root) return;
    opts = opts || {};
    const N = this.PAGES.length;
    n = Math.max(0, Math.min(N - 1, n | 0));
    const prev = this.page;
    this.page = n;
    const root = this._root;
    root.dataset.page = this.PAGES[n];
    root.setAttribute('aria-labelledby', 'ciTitle' + n);
    for (const s of root.querySelectorAll('.ciPage')) {
      const on = +s.dataset.page === n;
      s.classList.toggle('on', on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) s.removeAttribute('inert'); else s.setAttribute('inert', '');
      if (on) {
        // replay the screen's entrance (the keyframes restart on a reflow)
        s.classList.remove('enter', 'fromL');
        void s.offsetWidth;
        s.classList.add('enter');
        if (n < prev) s.classList.add('fromL');
      }
    }
    for (const d of root.querySelectorAll('.ciDot')) {
      const on = +d.dataset.dot === n;
      d.classList.toggle('on', on);
      if (on) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    }
    const last = n === N - 1;
    const next = root.querySelector('.ciNext');
    next.querySelector('.blab').innerHTML = (last ? this.esc(this.copy().legends.cta) : 'Next') + ' ' + this.ARROW_R;
    next.classList.toggle('ciGo', last);
    const back = root.querySelector('.ciBack');
    back.classList.toggle('gone', n === 0);
    back.tabIndex = n === 0 ? -1 : 0;
    back.setAttribute('aria-hidden', n === 0 ? 'true' : 'false');
    if (!opts.first) this._cue('ok');
    // keep the keyboard on the thing that moves you on
    if (opts.first || opts.focus || (document.activeElement && document.activeElement.classList.contains('gone'))) {
      try { next.focus({ preventScroll: true }); } catch (e) {}
    }
    this._fitPage();
    this._preload(Math.min(N - 1, n + 1));
  },
  next() { if (this.page >= this.PAGES.length - 1) this.close(); else this.go(this.page + 1); },
  prev() { if (this.page > 0) this.go(this.page - 1); },

  /* ---------------- wiring, made on opening and taken down on closing ---------------- */
  _bind() {
    const root = this._root;
    this._h = {
      click: e => {
        const a = e.target.closest('[data-act], [data-dot]');
        if (!a || !root.contains(a)) return;
        if (a.dataset.dot != null) { this.go(+a.dataset.dot); return; }
        const act = a.dataset.act;
        if (act === 'next') this.next();
        else if (act === 'back') this.prev();
        else if (act === 'close' || act === 'veil') this.close();
      },
      key: e => {
        if (!this.open) return;
        // the focus ring belongs to the keyboard (a tap never shows it)
        if (this._root) this._root.classList.add('ciKeys');
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); if (this.page < this.PAGES.length - 1) this.go(this.page + 1); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); this.prev(); return; }
        if (e.key === 'Tab') { e.stopImmediatePropagation(); this._trap(e); return; }
        // nothing else reaches the title (or the collection) underneath
        e.stopImmediatePropagation();
      },
      down: e => {
        if (this._root) this._root.classList.remove('ciKeys');
        if (e.isPrimary === false) return;
        this._sw = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
      },
      up: e => {
        const s = this._sw;
        this._sw = null;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        this._swiped = Date.now();
        if (dx < 0) { if (this.page < this.PAGES.length - 1) this.go(this.page + 1); }
        else this.prev();
      },
      // a swipe that ends on a button is a swipe, not a press
      guard: e => { if (this._swiped && Date.now() - this._swiped < 350) { e.stopPropagation(); e.preventDefault(); } },
      resize: () => { clearTimeout(this._rT); this._rT = setTimeout(() => this._layout(), 90); },
    };
    root.addEventListener('click', this._h.guard, true);
    root.addEventListener('click', this._h.click);
    // a scrolling hero's edge fades follow its scroll (scroll does not bubble: caught on the way down)
    root.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('ciHero')) this._fade(e.target); }, true);
    const panel = root.querySelector('.ciPanel');
    panel.addEventListener('pointerdown', this._h.down);
    panel.addEventListener('pointerup', this._h.up);
    window.addEventListener('keydown', this._h.key, true);
    window.addEventListener('resize', this._h.resize);
    window.addEventListener('cf-fit', this._h.resize);
  },
  _unbind() {
    if (!this._h) return;
    window.removeEventListener('keydown', this._h.key, true);
    window.removeEventListener('resize', this._h.resize);
    window.removeEventListener('cf-fit', this._h.resize);
    clearTimeout(this._rT);
    this._h = null;
    this._sizes = null;
  },
  _trap(e) {
    const f = [...this._root.querySelectorAll('button')].filter(b => b.tabIndex >= 0 && !b.closest('[inert]') && b.getClientRects().length);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    let j = e.shiftKey ? i - 1 : i + 1;
    if (i < 0) j = e.shiftKey ? f.length - 1 : 0;
    if (j < 0) j = f.length - 1;
    if (j >= f.length) j = 0;
    e.preventDefault();
    f[j].focus();
  },

  /* ---------------- the art, fetched when asked for ---------------- */
  _pre: {},
  _preload(n) {
    const urls = [];
    const add = u => { if (u && !this._pre[u]) urls.push(u); };
    const key = this.PAGES[n];
    if (key === 'hello') {
      add(this.art('dusk'));
      for (const id of this.FAN) { add(Deck.artUrl(id)); add(Deck.frameUrl(Deck.card(id).tier)); }
    } else if (key === 'play') for (const p of this.PLAY) { add(Deck.artUrl(p.id)); add(Deck.frameUrl(Deck.card(p.id).tier)); }
    else if (key === 'legends') for (const b of this.PRIZES) { add(Deck.artUrl(b.id)); add(Deck.frameUrl(Deck.card(b.id).tier)); }
    const all = urls.map(u => (this._pre[u] = new Promise(res => {
      const img = new Image();
      img.onload = img.onerror = () => res();
      img.src = u;
    })));
    // a slow wire still gets the announcement: the art is waited on briefly
    return Promise.race([Promise.all(all), new Promise(r => setTimeout(r, 1400))]);
  },

  /* ---------------- small things ---------------- */
  reduced() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  },
  _dpr() { return Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1); },
  _vp() {
    const de = document.documentElement;
    return { w: de.clientWidth || innerWidth || 390, h: de.clientHeight || innerHeight || 844 };
  },
  // bare UI, never window.UI: it is a script-level const (the window.G trap)
  _cue(kind) { try { if (typeof UI !== 'undefined' && UI.cue) UI.cue(kind); } catch (e) {} },
  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  // drawn at the device's own resolution (operator ruling: UI chrome is never chunky)
  CLOSE_SVG: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5"/></svg>',
  ARROW_R: '<svg class="ciArr" viewBox="0 0 6 8" aria-hidden="true" fill="currentColor"><path d="M0.6 0.4 L5.6 4 L0.6 7.6 Z"/></svg>',
  ARROW_L: '<svg class="ciArr" viewBox="0 0 6 8" aria-hidden="true" fill="currentColor"><path d="M5.4 0.4 L0.4 4 L5.4 7.6 Z"/></svg>',

  _css() {
    if (document.getElementById('cardIntroCss')) return;
    if (window.Deck && Deck.css) Deck.css();   // the faces' own stylesheet
    const st = document.createElement('style');
    st.id = 'cardIntroCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
  },
};

/* THE CHROME IS DRAWN, NOT BLOWN UP (operator ruling: the world's art —
   terrain, buildings, units, the painted backdrops, the card paintings — is
   pixel art; the UI's chrome is never chunky). Every ornament the
   announcement wears — the ribbon, the gold corners, the laurels, the two
   emblems, the deck, the tier gems, the trail — is an SVG built here and
   handed to CSS as a data URI, so the browser draws it at the device's own
   resolution at whatever size the layout asks for. The contract measures it
   (tests/card-intro.mjs, theChromeIsDrawnAtTheDevicesResolution): a raster
   piece of chrome must hold at least 3 device pixels per CSS pixel, and
   nothing here may be drawn pixelated. One gold, one navy, the palette of
   the faces' frames; pure functions, no state, nothing fetched. */
CardIntro.SVG = {
  uri(s) { return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(s) + '")'; },
  doc(w, h, body, vb) { return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb || '0 0 ' + w + ' ' + h}' width='${w}' height='${h}'>${body}</svg>`; },
  rgb(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  mix(a, b, t) {
    const A = this.rgb(a), B = this.rgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  f(n) { return Math.round(n * 100) / 100; },
  /* burnished gold, banded like struck metal, the light from the top left */
  gold(id, x1, y1, x2, y2) {
    return `<linearGradient id='${id}' gradientUnits='userSpaceOnUse' x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'>` +
      `<stop offset='0' stop-color='#fff4c9'/><stop offset='.22' stop-color='#f6d074'/><stop offset='.44' stop-color='#d9a03a'/>` +
      `<stop offset='.6' stop-color='#a8691a'/><stop offset='.78' stop-color='#e7b955'/><stop offset='1' stop-color='#87500f'/></linearGradient>`;
  },
  /* one engraved line: a dark bed, the gold, a hair of light along it */
  line(d, w, gid, hi) {
    return `<path d='${d}' fill='none' stroke='#1c0f03' stroke-width='${w + 2}' stroke-linecap='round' stroke-linejoin='round'/>` +
      `<path d='${d}' fill='none' stroke='url(#${gid})' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'/>` +
      (hi ? `<path d='${d}' fill='none' stroke='#fff6d6' stroke-opacity='.55' stroke-width='${Math.max(.35, w * .22)}' stroke-linecap='round' transform='translate(-.35 -.35)'/>` : '');
  },
  // the same path with x and y exchanged: a corner's second arm is its first, mirrored on the diagonal
  swap(d) { return d.replace(/(-?[\d.]+),(-?[\d.]+)/g, '$2,$1'); },
  /* a leaf of beaten gold: lit along one half, shaded along the other, a
     cut midrib between (the engraver's line) */
  leaf(x, y, deg, L, gid) {
    const w = L * 0.25, f = n => this.f(n);
    return `<g transform='translate(${f(x)} ${f(y)}) rotate(${f(deg)})'>` +
      `<path d='M0,0 C${f(L * .28)},${f(-w)} ${f(L * .7)},${f(-w * .95)} ${f(L)},0 C${f(L * .7)},${f(w * .95)} ${f(L * .28)},${f(w)} 0,0 Z' fill='url(#${gid})' stroke='#2e1803' stroke-width='.75' stroke-linejoin='round'/>` +
      `<path d='M${f(L * .1)},0 Q${f(L * .5)},${f(-w * .12)} ${f(L * .86)},0' fill='none' stroke='#6e3f0c' stroke-width='.5' stroke-linecap='round'/></g>`;
  },
  leafGrad(id) {
    return `<linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff6cf'/><stop offset='.3' stop-color='#f5cf6a'/>` +
      `<stop offset='.5' stop-color='#d89c34'/><stop offset='.52' stop-color='#a86a1c'/><stop offset='1' stop-color='#6f400c'/></linearGradient>`;
  },
  /* a branch along a curve: pt(t) and tan(t) say where and which way it
     runs; leaves go out in pairs, shortening toward the tip */
  branch(pt, tan, o) {
    let s = '';
    const n = o.n, deg = r => r * 180 / Math.PI;
    for (let i = 0; i < n; i++) {
      const t = o.t0 + (o.t1 - o.t0) * i / (n - 1);
      for (const side of [1, -1]) {
        const tt = Math.min(o.t1, t + (side < 0 ? o.stagger : 0));
        const p = pt(tt), d = tan(tt), len = Math.hypot(d[0], d[1]) || 1, T = [d[0] / len, d[1] / len], N = [-T[1], T[0]];
        const a = Math.atan2(T[1], T[0]) + side * o.spread;
        const L = o.L0 + (o.L1 - o.L0) * tt;
        s += this.leaf(p[0] + N[0] * side * .9, p[1] + N[1] * side * .9, deg(a), L, o.gid);
      }
    }
    const e = pt(o.t1 + .015), d = tan(o.t1);
    s += this.leaf(e[0], e[1], deg(Math.atan2(d[1], d[0])), o.L1 * 1.05, o.gid);
    return s;
  },

  /* THE RIBBON: a navy banner with gentle folds, a crisp gold rim and
     swallow-tailed ends folded behind it. The lettering is CSS on its band
     (the top 57%), never baked into the picture. */
  ribbon() {
    const tail = 'M76,29 L7,47 L28,66 L10,93 L86,72 L86,40 Z';
    const fold = 'M58,55.6 L86,54.6 L86,72 Z';
    const band = 'M58,7 Q200,1 342,7 L342,56 Q200,50 58,56 Z';
    const mirror = d => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (m, x, y) => (400 - +x) + ',' + y);
    const shade = (id, dir) => `<linearGradient id='${id}' x1='${dir < 0 ? 0 : 1}' y1='0' x2='${dir < 0 ? 1 : 0}' y2='0'>` +
      `<stop offset='0' stop-color='#000' stop-opacity='0'/><stop offset='.62' stop-color='#000' stop-opacity='.06'/><stop offset='1' stop-color='#000' stop-opacity='.5'/></linearGradient>`;
    const tails = [[tail, fold, 'sl'], [mirror(tail), mirror(fold), 'sr']].map(([t, fo, sh]) =>
      `<path d='${t}' fill='none' stroke='#0b0703' stroke-width='5' stroke-linejoin='round'/>` +
      `<path d='${t}' fill='url(#tl)'/><path d='${t}' fill='url(#${sh})'/>` +
      `<path d='${t}' fill='none' stroke='url(#gr)' stroke-width='2.2' stroke-linejoin='round'/>` +
      `<path d='${fo}' fill='#081129' stroke='#05080f' stroke-width='1.6' stroke-linejoin='round'/>`).join('');
    const cloth = [[0, .38], [.07, 0], [.2, -.1], [.34, .12], [.5, -.12], [.66, .12], [.8, -.1], [.93, 0], [1, .38]]
      .map(([o, a]) => `<stop offset='${o}' stop-color='${a > 0 ? '#000814' : '#9fbaff'}' stop-opacity='${Math.abs(a)}'/>`).join('');
    const body =
      `<defs>${this.gold('gr', 0, 0, 0, 62)}` +
      `<linearGradient id='bd' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#4870c2'/><stop offset='.18' stop-color='#2f55a6'/>` +
        `<stop offset='.55' stop-color='#1d397c'/><stop offset='.86' stop-color='#142b63'/><stop offset='1' stop-color='#0e1f4d'/></linearGradient>` +
      `<linearGradient id='tl' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2c4d98'/><stop offset='.5' stop-color='#1a3373'/><stop offset='1' stop-color='#0c1b45'/></linearGradient>` +
      `<linearGradient id='cl' x1='0' y1='0' x2='1' y2='0'>${cloth}</linearGradient>${shade('sl', -1)}${shade('sr', 1)}</defs>` +
      tails +
      `<path d='${band}' fill='none' stroke='#0b0703' stroke-width='6' stroke-linejoin='round'/>` +
      `<path d='${band}' fill='url(#bd)'/><path d='${band}' fill='url(#cl)'/>` +
      `<path d='M63,11.6 Q200,5.8 337,11.6' fill='none' stroke='#b9cdff' stroke-opacity='.32' stroke-width='1.3'/>` +
      `<path d='M64,13.2 Q200,7.4 336,13.2 M64,50.2 Q200,44.4 336,50.2' fill='none' stroke='#e9c063' stroke-opacity='.62' stroke-width='.9' stroke-dasharray='2.6 2'/>` +
      `<path d='${band}' fill='none' stroke='url(#gr)' stroke-width='3.2' stroke-linejoin='round'/>` +
      `<path d='M59.5,8.4 Q200,2.4 340.5,8.4' fill='none' stroke='#fff6d6' stroke-opacity='.7' stroke-width='.7'/>`;
    return this.doc(400, 100, body);
  },

  /* THE CORNER: a bracket of engraved gold laid along the panel's rim (its
     edge sits at 9 units in, the rim's gold just outside it), curling into
     volutes at both ends, a short inner bracket on the hairline, an acanthus
     leaf into the panel and a jewel on the point. Drawn for the TOP LEFT;
     CSS mirrors it into the other three. */
  corner() {
    const arm = 'M7,56 L7,14 Q7,7 14,7 L56,7';
    const vol = 'M56,7 C61.5,7 63.2,11.6 60.8,14.4 C58.6,16.9 54.6,15.8 55.2,13.1 C55.6,11.4 57.6,11.3 58,12.7';
    const inner = 'M18,38 L18,21 Q18,18 21,18 L38,18';
    const curl = 'M38,18 C42.2,18 43.6,14.6 41.6,13 C40,11.8 38.2,13 39,14.6';
    const acan = 'M11.5,11.5 C17,12.5 23,16.5 27.5,27.5 C20,24.5 13.5,19 11.5,11.5 Z';
    const side = 'M13,13 C17.5,9.5 22,10.2 24.2,12.6 C21,12.4 17.6,12.8 13,13 Z';
    const body =
      `<defs>${this.gold('g', 0, 0, 40, 40)}${this.leafGrad('lf')}</defs>` +
      this.line(arm, 2.6, 'g', true) + this.line(vol, 2, 'g', true) + this.line(this.swap(vol), 2, 'g', true) +
      `<path d='M10.5,52 L10.5,15 Q10.5,10.5 15,10.5 L52,10.5' fill='none' stroke='#2a1604' stroke-opacity='.75' stroke-width='.6'/>` +
      this.line(inner, 1.3, 'g') + this.line(curl, 1.1, 'g') + this.line(this.swap(curl), 1.1, 'g') +
      `<path d='${side}' fill='url(#lf)' stroke='#2e1803' stroke-width='.7'/><path d='${this.swap(side)}' fill='url(#lf)' stroke='#2e1803' stroke-width='.7'/>` +
      `<path d='${acan}' fill='url(#lf)' stroke='#2e1803' stroke-width='.8' stroke-linejoin='round'/>` +
      `<path d='M13.5,13.5 C18,16.5 22,20.5 25,25.5' fill='none' stroke='#6e3f0c' stroke-width='.55' stroke-linecap='round'/>` +
      [[30, 7], [7, 30], [42, 7], [7, 42]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.15' fill='#fff1c0' stroke='#3a2006' stroke-width='.5'/>`).join('') +
      `<path d='M7,0.8 L13.2,7 L7,13.2 L0.8,7 Z' fill='url(#g)' stroke='#1c0f03' stroke-width='1.1' stroke-linejoin='round'/>` +
      `<path d='M7,3.4 L10.6,7 L7,10.6 L3.4,7 Z' fill='none' stroke='#7a4a10' stroke-width='.5'/>` +
      `<circle cx='7' cy='7' r='1.9' fill='#fff7da' stroke='#8a5414' stroke-width='.5'/>`;
    return this.doc(64, 64, body);
  },

  /* THE LAUREL: one branch of beaten gold, convex to the right — the RIGHT
     laurel; the left is its mirror */
  laurel() {
    const P = [[13, 117], [46, 99], [51, 38], [25, 5]];
    const pt = t => { const u = 1 - t; return [0, 1].map(k => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]); };
    const tan = t => { const u = 1 - t; return [0, 1].map(k => 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k])); };
    const stem = `M${P[0]} C${P[1]} ${P[2]} ${P[3]}`;
    let berries = '';
    for (const t of [.3, .55, .78]) {
      const p = pt(t), d = tan(t), l = Math.hypot(d[0], d[1]), N = [-d[1] / l, d[0] / l];
      berries += `<circle cx='${this.f(p[0] - N[0] * 5.4)}' cy='${this.f(p[1] - N[1] * 5.4)}' r='2.1' fill='url(#bb)' stroke='#2e1803' stroke-width='.6'/>`;
    }
    const body =
      `<defs>${this.gold('g', 0, 0, 60, 120)}${this.leafGrad('lf')}` +
      `<radialGradient id='bb' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='#fffbe6'/><stop offset='.45' stop-color='#f0c457'/><stop offset='1' stop-color='#8a5414'/></radialGradient></defs>` +
      this.line(stem, 1.9, 'g', true) + berries +
      this.branch(pt, tan, { n: 9, t0: .05, t1: .93, stagger: .04, spread: .64, L0: 19, L1: 10.5, gid: 'lf' });
    return this.doc(60, 120, body);
  },

  /* VICTORY: a crown in a gold wreath, tied with crimson */
  win() {
    const C = [60, 64], R = 40, rad = d => d * Math.PI / 180;
    const arc = (a0, a1) => ({
      pt: t => { const a = rad(a0 + (a1 - a0) * t); return [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]; },
      tan: t => { const a = rad(a0 + (a1 - a0) * t), s = Math.sign(a1 - a0); return [-Math.sin(a) * s, Math.cos(a) * s]; },
    });
    const L = arc(108, 243), Rr = arc(72, -63);
    const stem = (a0, a1) => {
      const s = [C[0] + R * Math.cos(rad(a0)), C[1] + R * Math.sin(rad(a0))], e = [C[0] + R * Math.cos(rad(a1)), C[1] + R * Math.sin(rad(a1))];
      return `M${this.f(s[0])},${this.f(s[1])} A${R},${R} 0 0 ${a1 > a0 ? 1 : 0} ${this.f(e[0])},${this.f(e[1])}`;
    };
    const o = { n: 8, t0: .04, t1: .95, stagger: .045, spread: .6, L0: 15.5, L1: 10, gid: 'lf' };
    const star = (x, y, s) => `<path d='M${x},${y - s} Q${x + s * .18},${y - s * .18} ${x + s},${y} Q${x + s * .18},${y + s * .18} ${x},${y + s} Q${x - s * .18},${y + s * .18} ${x - s},${y} Q${x - s * .18},${y - s * .18} ${x},${y - s} Z' fill='#fffbe8'/>`;
    const crown = 'M40,68 L36.5,45 L48.5,56.5 L60,37.5 L71.5,56.5 L83.5,45 L80,68 Z';
    const body =
      `<defs>${this.gold('g', 30, 30, 90, 100)}${this.gold('cg', 0, 36, 0, 80)}${this.leafGrad('lf')}` +
      `<radialGradient id='pr' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#ffffff'/><stop offset='.5' stop-color='#f3e3b8'/><stop offset='1' stop-color='#9a7a40'/></radialGradient>` +
      `<radialGradient id='rb' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#ffb3b8'/><stop offset='.4' stop-color='#d81e3a'/><stop offset='1' stop-color='#5a0614'/></radialGradient>` +
      `<radialGradient id='sp' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#cfe6ff'/><stop offset='.45' stop-color='#3a78d8'/><stop offset='1' stop-color='#0c2460'/></radialGradient></defs>` +
      this.line(stem(108, 243), 1.7, 'g') + this.line(stem(72, -63), 1.7, 'g') +
      this.branch(L.pt, L.tan, o) + this.branch(Rr.pt, Rr.tan, o) +
      // the tie: two crimson tails and a knot
      `<path d='M57,103 L47,116 L52,115 L54,119 L60,105 Z M63,103 L73,116 L68,115 L66,119 L60,105 Z' fill='#a81830' stroke='#3a0610' stroke-width='1' stroke-linejoin='round'/>` +
      `<ellipse cx='60' cy='103.5' rx='5' ry='3.6' fill='url(#rb)' stroke='#3a0610' stroke-width='1'/>` +
      // the crown
      `<path d='${crown}' fill='url(#cg)' stroke='#2a1603' stroke-width='1.6' stroke-linejoin='round'/>` +
      `<path d='M40.4,66 L37.9,48.4 M60,40.5 L49.6,57.4 M80.6,48 L72.6,57' fill='none' stroke='#fff6d6' stroke-opacity='.6' stroke-width='.8' stroke-linecap='round'/>` +
      `<rect x='38.5' y='65.5' width='43' height='11.5' rx='2.2' fill='url(#cg)' stroke='#2a1603' stroke-width='1.6'/>` +
      `<path d='M40.5,68.4 L79.5,68.4' stroke='#fff6d6' stroke-opacity='.55' stroke-width='.8'/>` +
      `<ellipse cx='60' cy='71.3' rx='3.6' ry='3.2' fill='url(#rb)' stroke='#2a1603' stroke-width='.8'/>` +
      `<circle cx='48' cy='71.3' r='2.4' fill='url(#sp)' stroke='#2a1603' stroke-width='.7'/><circle cx='72' cy='71.3' r='2.4' fill='url(#sp)' stroke='#2a1603' stroke-width='.7'/>` +
      `<path d='M60,48 L62.4,52.4 L60,56.8 L57.6,52.4 Z' fill='url(#rb)' stroke='#2a1603' stroke-width='.7'/>` +
      `<circle cx='36.5' cy='44' r='2.8' fill='url(#pr)' stroke='#2a1603' stroke-width='.8'/><circle cx='83.5' cy='44' r='2.8' fill='url(#pr)' stroke='#2a1603' stroke-width='.8'/>` +
      `<circle cx='60' cy='36' r='3.2' fill='url(#pr)' stroke='#2a1603' stroke-width='.8'/>` +
      star(33, 31, 4.2) + star(88, 34, 3.2) + star(75, 25, 2.6);
    return this.doc(120, 120, body, '7 13 106 106');
  },

  /* A HARD-FOUGHT DEFEAT (operator: "Switch the graphic of the shield to be
     broken, and with blood splattered behind it"): a round shield split in
     two down a jagged break, the halves thrown apart from their feet with
     splinters hanging off the torn wood, and a splash of blood behind it —
     a body with ragged arms thrown outward and drops beyond. The splash is
     a seeded scatter: the same splash every time, nothing drawn at random. */
  fight() {
    const f = n => this.f(n), TAU = Math.PI * 2;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const C = [60, 60], N = 96;
    // the arms: narrow spikes at chosen angles, a drop at each tip and more beyond
    const arms = [[-2.55, 55], [-1.8, 52], [-1.05, 57], [-0.3, 50], [0.5, 54], [1.3, 49], [2.1, 56], [2.8, 51], [-3.05, 48]];
    const at = (a, r) => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r * 0.9];
    const rim = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU;
      let r = 36 + rnd() * 3 + 3 * Math.sin(a * 5 + 1) + 2 * Math.sin(a * 9);
      for (const [aa, L] of arms) {
        let d = (((a - aa) % TAU) + TAU) % TAU;
        d = Math.min(d, TAU - d);
        if (d < 0.13) r = Math.max(r, L - Math.pow(d / 0.13, 0.7) * (L - 38));
      }
      rim.push(at(a, r));
    }
    // one smooth closed curve through the midpoints
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], m0 = mid(rim[N - 1], rim[0]);
    let splash = `M${f(m0[0])},${f(m0[1])}`;
    for (let i = 0; i < N; i++) { const p = rim[i], m = mid(p, rim[(i + 1) % N]); splash += ` Q${f(p[0])},${f(p[1])} ${f(m[0])},${f(m[1])}`; }
    const drop = (a, r, size, stretch) => {
      const [x, y] = at(a, r);
      return `<ellipse cx='${f(x)}' cy='${f(y)}' rx='${f(size * stretch)}' ry='${f(size)}' transform='rotate(${f(a * 180 / Math.PI)} ${f(x)} ${f(y)})' fill='url(#bl)'/>`;
    };
    let drops = '';
    for (const [aa, L] of arms)
      drops += drop(aa, L - 1.5, 2.6 + rnd() * .8, 1.05) + drop(aa + 0.05, L + 4 + rnd() * 3, 1.7 + rnd() * 1.2, 1.5) + drop(aa - 0.04, L + 10 + rnd() * 5, 0.9 + rnd() * 0.8, 1.3);
    for (let i = 0; i < 12; i++) drops += drop(rnd() * TAU, 47 + rnd() * 9, 0.8 + rnd() * 1.1, 1.15);
    // the shield, whole — drawn twice, once into each half of the break
    const S = [60, 62], R = 30;
    const crack = [[58, 26], [62, 37], [55, 47], [63, 58], [56, 68], [62, 79], [55, 90], [59, 100]].map(p => p.join(',')).join(' L');
    const planks = [-18, -9, 0, 9, 18].map((dx, i) =>
      `<rect x='${S[0] + dx - 4.5}' y='${S[1] - R}' width='9' height='${2 * R}' fill='#000' fill-opacity='${[.14, 0, .09, .03, .16][i]}'/>` +
      `<path d='M${S[0] + dx + 4.5},${S[1] - R} L${S[0] + dx + 4.5},${S[1] + R}' stroke='#2a1608' stroke-width='1.1'/>`).join('');
    const rivets = [0, 45, 90, 135, 180, 225, 270, 315].map(d => { const r = d * Math.PI / 180;
      return `<circle cx='${f(S[0] + Math.cos(r) * (R - 2.6))}' cy='${f(S[1] + Math.sin(r) * (R - 2.6))}' r='1.6' fill='url(#bs)' stroke='#14181d' stroke-width='.6'/>`; }).join('');
    const shield =
      `<circle cx='${S[0]}' cy='${S[1]}' r='${R + 1.5}' fill='#120c07'/><circle cx='${S[0]}' cy='${S[1]}' r='${R}' fill='url(#rim)'/>` +
      `<circle cx='${S[0]}' cy='${S[1]}' r='${R - 5.2}' fill='#1a0f06'/>` +
      `<g clip-path='url(#face)'><rect x='${S[0] - R}' y='${S[1] - R}' width='${2 * R}' height='${2 * R}' fill='url(#wd)'/>${planks}` +
        `<path d='M36,50 Q41,48 45,52 M66,78 Q71,76 74,80 M46,82 Q51,80 53,84 M70,44 Q74,42 77,46' fill='none' stroke='#3a2210' stroke-opacity='.55' stroke-width='.6'/>` +
        `<rect x='${S[0] - R}' y='${S[1] - R}' width='${2 * R}' height='${2 * R}' fill='url(#lt)'/></g>` +
      rivets +
      `<circle cx='${S[0]}' cy='${S[1]}' r='8.4' fill='#14181d'/><circle cx='${S[0]}' cy='${S[1]}' r='7.4' fill='url(#bs)'/>` +
      `<path d='M55.4,57.8 A6,6 0 0 1 62.2,56.2' fill='none' stroke='#fff' stroke-opacity='.7' stroke-width='1' stroke-linecap='round'/>` +
      // the break's raw edge: torn pale wood, a dark line in the grain
      `<g clip-path='url(#disc)'><path d='M${crack}' fill='none' stroke='#e2b07a' stroke-width='2.4' stroke-linejoin='bevel'/>` +
        `<path d='M${crack}' fill='none' stroke='#5a3417' stroke-width='.7' stroke-linejoin='bevel'/></g>`;
    const splinter = d => `<path d='${d}' fill='#d9a46c' stroke='#3a2210' stroke-width='.5' stroke-linejoin='round'/>`;
    const body =
      `<defs>` +
      `<radialGradient id='bl' cx='.42' cy='.38' r='.7'><stop offset='0' stop-color='#c21a26'/><stop offset='.55' stop-color='#8e0d17'/><stop offset='1' stop-color='#5c060d'/></radialGradient>` +
      `<radialGradient id='bp' cx='.45' cy='.42' r='.62'><stop offset='0' stop-color='#b3141f'/><stop offset='.6' stop-color='#860b14'/><stop offset='1' stop-color='#56050b'/></radialGradient>` +
      `<linearGradient id='rim' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#dfe5ea'/><stop offset='.35' stop-color='#8d98a5'/><stop offset='.7' stop-color='#4a5461'/><stop offset='1' stop-color='#262c35'/></linearGradient>` +
      `<linearGradient id='wd' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#9a6a3c'/><stop offset='.5' stop-color='#7a4c27'/><stop offset='1' stop-color='#4e2c13'/></linearGradient>` +
      `<radialGradient id='bs' cx='.38' cy='.32' r='.75'><stop offset='0' stop-color='#ffffff'/><stop offset='.4' stop-color='#aab4bf'/><stop offset='1' stop-color='#323a44'/></radialGradient>` +
      `<radialGradient id='lt' cx='.32' cy='.25' r='.8'><stop offset='0' stop-color='#fff' stop-opacity='.22'/><stop offset='.6' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.35'/></radialGradient>` +
      `<clipPath id='face'><circle cx='${S[0]}' cy='${S[1]}' r='${R - 5.6}'/></clipPath>` +
      `<clipPath id='disc'><circle cx='${S[0]}' cy='${S[1]}' r='${R + 1.5}'/></clipPath>` +
      `<clipPath id='hl'><path d='M0,0 L58,0 L${crack} L59,120 L0,120 Z'/></clipPath>` +
      `<clipPath id='hr'><path d='M120,0 L58,0 L${crack} L59,120 L120,120 Z'/></clipPath></defs>` +
      // the blood, behind everything
      `<path d='${splash} Z' fill='url(#bp)' stroke='#3a0207' stroke-width='.8'/>` + drops +
      // the two halves, thrown apart from their feet
      `<g transform='translate(-5 2) rotate(-13 52 96)'><g clip-path='url(#hl)'>${shield}</g>` +
        splinter('M55,47 L50.5,44.5 L54.6,49.2 Z M56,68 L51,70.5 L56.6,70 Z M55,90 L51.8,93.5 L56,92 Z') + `</g>` +
      `<g transform='translate(5 1) rotate(11 66 96)'><g clip-path='url(#hr)'>${shield}</g>` +
        splinter('M62,37 L66.8,34 L62.8,39.6 Z M63,58 L68,56.2 L63.4,60.6 Z M62,79 L67,80.6 L61.8,81.6 Z') + `</g>`;
    return this.doc(120, 120, body);
  },

  /* YOUR DECK: the HUD button's own picture (a bronze card behind a gold
     one, sky and sun and hill in its window), drawn smooth */
  deck() {
    const body =
      `<defs>${this.gold('g', 14, 10, 42, 46)}` +
      `<linearGradient id='bz' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f0b27a'/><stop offset='.45' stop-color='#c98446'/><stop offset='1' stop-color='#6e4019'/></linearGradient>` +
      `<linearGradient id='sk' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5f8fd0'/><stop offset='1' stop-color='#a9cdf0'/></linearGradient>` +
      `<radialGradient id='sn' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff8d0'/><stop offset='.45' stop-color='#ffd45e'/><stop offset='1' stop-color='#ffd45e' stop-opacity='0'/></radialGradient></defs>` +
      `<g transform='rotate(-11 20 24)'><rect x='6' y='6' width='25' height='34' rx='2.6' fill='url(#bz)' stroke='#140d06' stroke-width='1.4'/>` +
        `<rect x='9' y='9' width='19' height='28' rx='1.4' fill='#5c3a1c' stroke='#2a1a0a' stroke-width='.7'/></g>` +
      `<rect x='15' y='10.5' width='26' height='35' rx='2.6' fill='url(#g)' stroke='#140d06' stroke-width='1.4'/>` +
      `<path d='M17,12.6 L39,12.6' stroke='#fff6d6' stroke-opacity='.7' stroke-width='.8'/>` +
      `<rect x='18' y='13.5' width='20' height='18' rx='1' fill='url(#sk)' stroke='#2c2318' stroke-width='.8'/>` +
      `<circle cx='32' cy='19' r='5.5' fill='url(#sn)'/><circle cx='32' cy='19' r='2.4' fill='#ffe58a'/>` +
      `<path d='M18.4,31.1 L18.4,26 Q24,21.5 29.5,25.4 Q33.5,23 37.6,26.6 L37.6,31.1 Z' fill='#5c7a3a'/>` +
      `<path d='M18.4,26 Q24,21.5 29.5,25.4 Q33.5,23 37.6,26.6' fill='none' stroke='#9cc06a' stroke-width='.8'/>` +
      `<rect x='18' y='34' width='20' height='8.4' rx='1' fill='#2c2318' stroke='#120a04' stroke-width='.6'/>` +
      `<path d='M21,38.2 L35,38.2' stroke='#e8c15a' stroke-opacity='.75' stroke-width='1.1' stroke-linecap='round'/>`;
    return this.doc(48, 48, body);
  },

  /* A TIER'S GEM: a faceted diamond cut in the tier's own colour */
  gem(col) {
    const m = (c, t) => this.mix(col, c, t);
    const T = '12,1.4', R = '22.6,12', B = '12,22.6', L = '1.4,12', t = '12,7', r = '17,12', b = '12,17', l = '7,12';
    const body =
      `<defs><linearGradient id='tb' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${m('#ffffff', .7)}'/><stop offset='1' stop-color='${m('#ffffff', .15)}'/></linearGradient></defs>` +
      `<path d='M${T} L${R} L${B} L${L} Z' fill='${col}' stroke='#0d0804' stroke-width='1.3' stroke-linejoin='round'/>` +
      `<path d='M${L} L${T} L${t} L${l} Z' fill='${m('#ffffff', .55)}'/>` +
      `<path d='M${T} L${R} L${r} L${t} Z' fill='${m('#ffffff', .18)}'/>` +
      `<path d='M${R} L${B} L${b} L${r} Z' fill='${m('#000000', .5)}'/>` +
      `<path d='M${B} L${L} L${l} L${b} Z' fill='${m('#000000', .25)}'/>` +
      `<path d='M${t} L${r} L${b} L${l} Z' fill='url(#tb)'/>` +
      `<path d='M${T} L${t} M${R} L${r} M${B} L${b} M${L} L${l} M${t} L${r} L${b} L${l} Z' fill='none' stroke='#000' stroke-opacity='.22' stroke-width='.5'/>` +
      `<path d='M${T} L${R} L${B} L${L} Z' fill='none' stroke='#0d0804' stroke-width='1.3' stroke-linejoin='round'/>` +
      `<path d='M8.2,4.6 L8.8,6.4 L10.6,7 L8.8,7.6 L8.2,9.4 L7.6,7.6 L5.8,7 L7.6,6.4 Z' fill='#ffffff'/>`;
    return this.doc(24, 24, body);
  },

  /* the way from the deck to the hand: three chevrons, brightening */
  trail() {
    const ch = (x, o) => `<path d='M${x},3.5 L${x + 6},8 L${x},12.5' fill='none' stroke='#1c0f03' stroke-width='4.4' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='${o}'/>` +
      `<path d='M${x},3.5 L${x + 6},8 L${x},12.5' fill='none' stroke='url(#g)' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' stroke-opacity='${o}'/>`;
    return this.doc(42, 16, `<defs>${this.gold('g', 0, 2, 0, 14)}</defs>` + ch(5, .4) + ch(17, .7) + ch(29, 1));
  },
};

/* The stylesheet, injected the first time the announcement opens (never
   before). The hidden state of anything the player must see lives only in a
   keyframe's `from`, held through its delay by `both`, so an entrance that
   never plays still shows the whole screen; everything moves by transform
   and opacity alone; and asking for less motion shows the same screens,
   arrived at without movement. */
CardIntro.CSS = `
#cardIntro { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
  padding: calc(max(10px, env(safe-area-inset-top, 0px)) + var(--ribW, 300px) * .13) max(10px, env(safe-area-inset-right, 0px))
    max(10px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px));
  font-family: var(--menufont, 'Cinzel', Georgia, serif); color: #efe4cd; -webkit-tap-highlight-color: transparent;
  animation: ciVeilIn .32s ease-out both; }
#cardIntro.ciOut { animation: ciVeilOut .24s ease-in both; pointer-events: none; }
@keyframes ciVeilIn { from { opacity: 0 } }
@keyframes ciVeilOut { to { opacity: 0 } }
#cardIntro .ciVeil { position: absolute; inset: 0;
  background: radial-gradient(ellipse 75% 70% at 50% 50%, rgba(8,6,3,.42), rgba(6,4,2,.84) 100%), rgba(10,8,5,.32); }
#cardIntro i { display: block; }
#cardIntro figure { margin: 0; }

/* ---- the panel ---- */
/* --k is the panel's scale: SHRINK (seven tenths) on a wide window, 1 on a
   phone, whose panel is its screen — every size below that is not a touch
   target or a card face is multiplied by it */
#cardIntro .ciPanel { position: relative; width: min(100%, calc(880px * var(--k, 1))); height: min(100%, var(--panelH, calc(770px * var(--k, 1))));
  display: flex; flex-direction: column; isolation: isolate; container-type: inline-size;
  background: linear-gradient(180deg, #1b1510 0%, #120d09 55%, #0d0906 100%);
  border-radius: 3px;
  box-shadow: 0 0 0 1px #0a0704, 0 0 0 3px #b98a36, 0 0 0 4px #5e4116, 0 0 0 6px #120c06,
    0 0 0 7px rgba(232,190,100,.35), 0 18px 60px rgba(0,0,0,.75), 0 0 120px rgba(255,190,80,.1);
  animation: ciPanelIn .5s cubic-bezier(.2,1.2,.4,1) both; touch-action: pan-y; }
@keyframes ciPanelIn { from { opacity: 0; transform: translateY(18px) scale(.96) } }
#cardIntro.ciOut .ciPanel { animation: ciPanelOut .24s ease-in both; }
@keyframes ciPanelOut { to { opacity: 0; transform: translateY(10px) scale(.97) } }
/* an inner gold hairline, a step in from the rim */
#cardIntro .ciPanel::before { content: ''; position: absolute; inset: 9px; border: 1px solid rgba(214,170,84,.42); pointer-events: none; z-index: 3;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.6); }
/* the dusk valley under the panel's own dark: one gradient laid over the
   picture (no filter, no mask — a static layer the compositor never redraws),
   and drawn smooth, since it is scaled up behind everything and a soft
   picture reads as depth */
#cardIntro .ciDusk { position: absolute; inset: 0; z-index: -2; overflow: hidden; border-radius: 3px; pointer-events: none;
  background: linear-gradient(180deg, #1b1510 0%, rgba(22,17,12,.93) 26%, rgba(16,12,8,.68) 58%, rgba(12,9,6,.44) 82%, rgba(10,7,5,.36) 100%),
    var(--dusk) center bottom / cover no-repeat; }
/* the light the cards stand in: soft rays (smooth, never stepped) and a glow */
#cardIntro .ciRays { position: absolute; left: 50%; top: var(--ry, 56%); width: min(120%, 1000px); aspect-ratio: 1; z-index: -1; pointer-events: none;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(from 0deg, rgba(255,214,120,.17) 0deg 5deg, rgba(255,214,120,0) 5deg 15deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 24%, transparent 50%);
  mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 24%, transparent 50%);
  animation: ciSpin 120s linear infinite; transition: opacity .5s; will-change: transform; }
@keyframes ciSpin { to { transform: translate(-50%, -50%) rotate(360deg) } }
#cardIntro .ciGlow { position: absolute; left: 50%; top: var(--ry, 56%); width: min(90%, 620px); aspect-ratio: 1.3; z-index: -1; pointer-events: none;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse at center, rgba(255,200,90,.32), rgba(255,170,60,.12) 38%, transparent 68%); transition: opacity .5s; }
#cardIntro[data-page="earn"] .ciRays { opacity: .3; }
#cardIntro[data-page="earn"] .ciGlow { opacity: .5; }
/* the gold corners: one engraved drawing (vector), mirrored, laid over the
   rim — its 9th unit is the panel's edge, so the bracket rides the rim's gold */
#cardIntro .ciCorner { position: absolute; width: var(--cornerW, 72px); height: var(--cornerW, 72px); z-index: 4; pointer-events: none;
  --o: calc(var(--cornerW, 72px) * -9 / 64);
  background: var(--corner) 0 0 / 100% 100% no-repeat; filter: drop-shadow(0 2px 2px rgba(0,0,0,.7)); }
#cardIntro .ciCorner.tl { left: var(--o); top: var(--o); }
#cardIntro .ciCorner.tr { right: var(--o); top: var(--o); transform: scaleX(-1); }
#cardIntro .ciCorner.bl { left: var(--o); bottom: var(--o); transform: scaleY(-1); }
#cardIntro .ciCorner.br { right: var(--o); bottom: var(--o); transform: scale(-1, -1); }

/* ---- the close X: 44px to touch, a dark disc with a gold cross to see ---- */
#cardIntro .ciX { position: absolute; right: 16px; top: 16px; z-index: 6; width: 44px; height: 44px; padding: 0; border: 0; background: none;
  display: flex; align-items: center; justify-content: center; color: #f2cd62; cursor: pointer; border-radius: 50%; }
#cardIntro .ciX::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #2c2117, #120c07);
  box-shadow: 0 0 0 1px #0a0704, 0 0 0 2px #a67a34, 0 2px 6px rgba(0,0,0,.6); z-index: -1; }
#cardIntro .ciX svg { width: 16px; height: 16px; filter: drop-shadow(0 1px 0 #000); }
#cardIntro .ciX:hover::before { box-shadow: 0 0 0 1px #0a0704, 0 0 0 2px #f2cd62, 0 0 12px rgba(255,210,100,.5); }
#cardIntro button:focus { outline: none; }
#cardIntro.ciKeys button:focus-visible { outline: 2px solid #ffe9a8; outline-offset: 3px; }

/* ---- the pages ---- */
#cardIntro .ciPages { position: relative; flex: 1 1 auto; min-height: 0; }
#cardIntro .ciPage { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center;
  padding: 0 calc(34px * var(--k, 1)); text-align: center; }
#cardIntro .ciPage.on { display: flex; }
#cardIntro .ciHead { position: relative; flex: 0 0 auto; width: 100%; display: flex; flex-direction: column; align-items: center; }
#cardIntro .ciRibbon { position: relative; margin-top: calc(var(--ribW, 300px) * -.13); width: var(--ribW, 300px); aspect-ratio: 4 / 1; z-index: 5; }
#cardIntro .ciRib { position: absolute; inset: 0; background: var(--ribbon) 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 3px 4px rgba(0,0,0,.6)); }
/* the lettering sits on the band, which is the ribbon's top 57% (its tails
   hang below it) */
#cardIntro .ciRibbon span { position: absolute; left: 0; right: 0; top: 0; height: 57%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; text-transform: uppercase; color: #f4e6c2;
  font-size: calc(var(--ribW, 300px) * .06); letter-spacing: .12em; white-space: nowrap; text-shadow: 0 1px 0 #061229, 0 0 6px rgba(4,10,30,.8); }
#cardIntro .ciRibbon span::before, #cardIntro .ciRibbon span::after { content: '\\25C6'; color: #f2cd62; font-size: .7em; margin: 0 .6em; }
#cardIntro .ciTitle { position: relative; display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; line-height: 1; }
#cardIntro .ciWord { font-weight: 900; text-transform: uppercase; letter-spacing: .04em; text-align: center;
  font-size: clamp(38px, min(12vw, 10vh), 100px); padding: .06em .04em .1em;
  background: linear-gradient(180deg, #fff6d2 0%, #ffe28a 26%, #f6bf3a 52%, #d0861a 76%, #9c5a10 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 #3a1f05) drop-shadow(0 -1px 0 #3a1f05) drop-shadow(2px 0 0 #3a1f05) drop-shadow(-2px 0 0 #3a1f05)
    drop-shadow(0 4px 0 #1c0f03) drop-shadow(0 0 16px rgba(255,190,70,.45)); }
#cardIntro .ciP-earn .ciWord, #cardIntro .ciP-play .ciWord, #cardIntro .ciP-tiers .ciWord { font-size: clamp(34px, min(10.5vw, 8.4vh), 84px); }
#cardIntro .ciP-legends .ciWord { font-size: clamp(30px, min(9vw, 7.4vh), 70px); }
/* a wide panel sizes its headline to the PANEL (container units), so the
   laurels never crowd the corners or the X; a browser without them keeps
   the window-sized rule above */
#cardIntro:not(.ciNarrow) .ciWord { white-space: nowrap;
  font-size: clamp(calc(38px * var(--k, 1)), min(12cqw, calc(10vh * var(--k, 1))), calc(100px * var(--k, 1))); }
#cardIntro:not(.ciNarrow) .ciP-earn .ciWord, #cardIntro:not(.ciNarrow) .ciP-play .ciWord, #cardIntro:not(.ciNarrow) .ciP-tiers .ciWord {
  font-size: clamp(calc(34px * var(--k, 1)), min(8.6cqw, calc(8.4vh * var(--k, 1))), calc(84px * var(--k, 1))); }
#cardIntro:not(.ciNarrow) .ciP-legends .ciWord { font-size: clamp(calc(30px * var(--k, 1)), min(7.4cqw, calc(7.4vh * var(--k, 1))), calc(70px * var(--k, 1))); }
#cardIntro .ciLaurel { flex: 0 0 auto; width: calc(var(--laurelH, 112px) / 2); height: var(--laurelH, 112px);
  background: var(--laurel) 0 0 / 100% 100% no-repeat; filter: drop-shadow(0 2px 2px rgba(0,0,0,.6)) drop-shadow(0 0 10px rgba(255,190,70,.25)); }
#cardIntro .ciLaurel.l { transform: scaleX(-1); }
/* drawn smaller from their feet, both together, when the right one would rise under the X (_clearX) */
#cardIntro .ciLaurel { scale: var(--lauS, 1); transform-origin: 50% 100%; }
#cardIntro .ciRule { width: min(70%, calc(420px * var(--k, 1))); height: 9px; margin: 2px 0 2px; flex: 0 0 auto;
  background: linear-gradient(90deg, transparent, #c99a40 25%, #f6d27a 50%, #c99a40 75%, transparent) center / 100% 1px no-repeat; position: relative; }
#cardIntro .ciRule::after { content: ''; position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; transform: translate(-50%, -50%) rotate(45deg);
  background: #f6d27a; box-shadow: 0 0 0 1px #3a2208, 0 0 8px rgba(255,210,100,.7); }
#cardIntro .ciSub { max-width: 31em; margin: calc(8px * var(--k, 1)) auto 0; font-family: Georgia, 'Times New Roman', serif; font-weight: 600;
  font-size: max(14px, calc(var(--k, 1) * clamp(15px, min(4.2vw, 2.7vh), 22px))); line-height: 1.32; color: #f3e8d0; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#cardIntro .ciHero { position: relative; flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
#cardIntro .ciFoot { flex: 0 0 auto; margin: 0 auto 4px; max-width: 40em; font-family: Georgia, 'Times New Roman', serif;
  font-size: max(12px, calc(var(--k, 1) * clamp(12.5px, 3.4vw, 16px))); line-height: 1.35; color: #d8c49a; text-shadow: 0 1px 0 #000; }

/* ---- page 1: the fan ---- */
#cardIntro .ciFan { position: relative; width: 100%; height: calc(var(--ch) * 1.14); }
#cardIntro .ciSlot { position: absolute; left: 50%; top: calc(2% + (var(--ch) - var(--sh)) * .55); width: var(--sw); height: var(--sh); z-index: var(--z);
  transform: translateX(-50%) translateX(var(--x)) translateY(calc(var(--a) * var(--a) * var(--sw) * .045 + var(--a) * var(--sw) * .03))
    rotate(calc(var(--i) * var(--rot, 8deg))) scale(calc(1 - var(--a) * .07));
  transform-origin: 50% 85%; }
/* shadows and glows are box-shadows (a card is a rectangle): a filter over a
   face whose foil moves is a filter redrawn every frame */
#cardIntro .ccard { box-shadow: 0 8px 14px rgba(0,0,0,.6); }
#cardIntro .ciSlot::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: rgba(8,5,2,calc(var(--a) * .1)); }
#cardIntro .ciSlot.mid .ccard { box-shadow: 0 0 0 1px rgba(255,236,170,.55), 0 0 22px 4px rgba(255,214,94,.62), 0 12px 16px rgba(0,0,0,.6); }
#cardIntro .ciSlot.mid::before { content: ''; position: absolute; inset: -16%; z-index: -1; border-radius: 16%;
  background: radial-gradient(ellipse at center, rgba(255,222,120,.55), rgba(255,190,70,.18) 45%, transparent 70%);
  animation: ciPulse 2.6s ease-in-out infinite; }
@keyframes ciPulse { 50% { opacity: .55; transform: scale(.96) } }
#cardIntro .ciSlot.mid .ccard { animation: ciFloat 3.6s ease-in-out .9s infinite; }
@keyframes ciFloat { 50% { transform: translateY(-5px) } }
#cardIntro .ciPage.enter .ciSlot { animation: ciDeal .62s cubic-bezier(.2,1.25,.45,1) var(--d) both; }
@keyframes ciDeal { from { opacity: 0; transform: translateX(-50%) translateY(26%) rotate(0deg) scale(.7) } }

/* ---- page 2: the two roads ---- */
#cardIntro .ciRoads { display: grid; grid-template-columns: 1fr 1fr; gap: calc(20px * var(--k, 1)); width: min(100%, calc(780px * var(--k, 1))); }
/* each road's few lines stand evenly in its box: the two boxes are one
   height, and neither crowds its words to the top */
#cardIntro .ciRoad { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: calc(12px * var(--k, 1)); padding: calc(22px * var(--k, 1)) calc(18px * var(--k, 1));
  text-align: center; border-radius: 4px;
  background: linear-gradient(180deg, rgba(42,31,18,.86), rgba(18,13,8,.9));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.7), inset 0 0 0 2px rgba(201,151,62,.6), inset 0 0 30px rgba(255,190,80,.06), 0 10px 24px rgba(0,0,0,.45); }
#cardIntro .ciRoad.loss { background: linear-gradient(180deg, rgba(30,30,32,.86), rgba(13,12,12,.9));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.7), inset 0 0 0 2px rgba(140,152,170,.55), 0 10px 24px rgba(0,0,0,.45); }
#cardIntro .ciRoadTx { display: flex; flex-direction: column; align-items: center; gap: calc(10px * var(--k, 1)); }
#cardIntro .ciRoadTx p { text-wrap: balance; }
#cardIntro .ciNb { white-space: nowrap; }
#cardIntro .ciEmb { flex: 0 0 auto; width: var(--embW, 120px); height: var(--embW, 120px); background: 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 4px 4px rgba(0,0,0,.6)); }
#cardIntro .ciRoad.win .ciEmb { filter: drop-shadow(0 0 16px rgba(255,200,80,.6)) drop-shadow(0 4px 4px rgba(0,0,0,.6)); }
#cardIntro .ciRoad.loss .ciEmb { filter: drop-shadow(0 0 12px rgba(190,24,34,.28)) drop-shadow(0 4px 4px rgba(0,0,0,.6)); }
#cardIntro .ciRoad h3 { margin: 0; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: max(15px, calc(var(--k, 1) * clamp(16px, 4.4vw, 23px))); line-height: 1.15;
  color: #ffd45e; text-shadow: 0 2px 0 #2a1704, 0 0 12px rgba(255,200,80,.3); }
#cardIntro .ciRoad.loss h3 { color: #dde4ee; text-shadow: 0 2px 0 #10151c; }
#cardIntro .ciRoad p { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: max(13.5px, calc(var(--k, 1) * clamp(14px, 3.8vw, 17px))); line-height: 1.35; color: #efe4cd; }
/* the reward, counted in cards: +1 and +2, room between them */
#cardIntro .ciGain { display: flex !important; align-items: center; justify-content: center; gap: calc(8px * var(--k, 1)); flex-wrap: wrap; row-gap: 6px; margin-top: calc(4px * var(--k, 1)); }
#cardIntro .ciGain b { font-family: var(--menufont, 'Cinzel', Georgia, serif); font-weight: 800; letter-spacing: .06em; white-space: nowrap;
  text-transform: uppercase; font-size: max(12px, calc(var(--k, 1) * clamp(12px, 3.3vw, 15px))); color: #ffe39a; text-shadow: 0 1px 0 #000; }
#cardIntro .ciG { display: inline-flex; align-items: center; gap: calc(8px * var(--k, 1)); white-space: nowrap; }
#cardIntro .ciOr { font-family: Georgia, serif; font-style: italic; font-size: 13px; color: #b8a888; margin: 0 calc(8px * var(--k, 1)); }
/* a card, as a small gold slab with a dark window — the reward, counted */
#cardIntro .ciCardPip { width: 15px; height: 21px; border-radius: 2px; background: linear-gradient(160deg, #fff0b8, #f0c050 40%, #a8701c);
  box-shadow: 0 0 0 1px #2a1704, inset 0 0 0 3px rgba(0,0,0,0) , 0 0 8px rgba(255,200,80,.55); position: relative; }
#cardIntro .ciCardPip::after { content: ''; position: absolute; left: 3px; right: 3px; top: 3px; height: 9px; background: #4a3320; border-radius: 1px; }
#cardIntro .ciCardPip.two { margin-left: -9px; transform: rotate(10deg) translateY(-2px); }
#cardIntro .ciPage.enter .ciRoad { animation: ciRise .5s cubic-bezier(.2,1.1,.4,1) both; }
#cardIntro .ciPage.enter .ciRoad.loss { animation-delay: .12s; }
@keyframes ciRise { from { opacity: 0; transform: translateY(22px) } }

/* ---- page 3: the deck button and three cards ---- */
#cardIntro .ciPlay { display: flex; align-items: center; justify-content: center; gap: calc(var(--k, 1) * clamp(12px, 3vw, 30px)); width: 100%; }
#cardIntro .ciDeck { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: calc(12px * var(--k, 1)); }
#cardIntro .ciDeck figcaption { display: flex; flex-direction: column; align-items: center; gap: 3px; white-space: nowrap; }
#cardIntro .ciDeck figcaption b { font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: max(11.5px, calc(var(--k, 1) * clamp(12px, 3.2vw, 14px))); color: #ffe39a; text-shadow: 0 1px 0 #000; }
#cardIntro .ciDeck figcaption small { font-family: Georgia, serif; font-style: italic; font-size: max(11.5px, calc(var(--k, 1) * clamp(12px, 3.2vw, 14px))); color: #e8d6ae; text-shadow: 0 1px 0 #000; }
#cardIntro .ciDeckBtn { position: relative; width: calc(84px * var(--k, 1)); height: calc(70px * var(--k, 1)); display: flex; align-items: center; justify-content: center;
  border-radius: 6px; background: linear-gradient(180deg, #4a3520, #2b1d10);
  box-shadow: inset 0 0 0 1px #0d0804, inset 0 0 0 2px #a8782f, inset 0 3px 0 2px rgba(255,220,150,.08), 0 6px 16px rgba(0,0,0,.6); }
#cardIntro .ciDeckIco { width: calc(50px * var(--k, 1)); height: calc(50px * var(--k, 1)); background: 0 0 / 100% 100% no-repeat; filter: drop-shadow(0 2px 1px rgba(0,0,0,.6)); }
#cardIntro .ciTap { position: absolute; inset: -6px; border-radius: 10px; border: 2px solid rgba(255,214,110,.85); pointer-events: none;
  animation: ciTap 1.6s ease-out infinite; }
@keyframes ciTap { 0% { opacity: .9; transform: scale(.94) } 80%, 100% { opacity: 0; transform: scale(1.16) } }
/* the way from the button to the hand: three gold chevrons (vector) */
#cardIntro .ciArrow { flex: 0 0 auto; width: calc(42px * var(--k, 1)); height: calc(16px * var(--k, 1)); background: var(--trail) 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 0 6px rgba(255,200,80,.5)); }
#cardIntro .ciTrio { position: relative; display: flex; align-items: flex-start; justify-content: center; gap: calc(var(--k, 1) * clamp(10px, 2vw, 22px)); }
#cardIntro .ciCard { position: relative; display: flex; flex-direction: column; align-items: center; gap: calc(10px * var(--k, 1)); width: var(--cw); }
#cardIntro .ciTilt { transform: rotate(calc(var(--n) * 4deg)) translateY(calc(var(--n) * var(--n) * 10px * var(--k, 1))); transform-origin: 50% 100%; }

#cardIntro .ciCard:nth-child(2) { z-index: 2; }
#cardIntro .ciCard:nth-child(2) .ccard { box-shadow: 0 0 18px 2px rgba(255,200,80,.45), 0 8px 14px rgba(0,0,0,.6); }
#cardIntro .ciCard figcaption { width: 100%; margin-top: calc(var(--n) * var(--n) * 10px * var(--k, 1)); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; line-height: 1.2;
  font-size: max(11px, calc(var(--k, 1) * clamp(10.5px, 2.9vw, 14px))); color: #ffe39a; text-shadow: 0 2px 0 #000, 0 0 7px rgba(10,7,4,.95); }
#cardIntro .ciPage.enter .ciCard { animation: ciLift .55s cubic-bezier(.2,1.2,.4,1) both; animation-delay: calc(.12s + (var(--n) + 1) * .1s); }
#cardIntro .ciPage.enter .ciDeck { animation: ciRise .5s cubic-bezier(.2,1.1,.4,1) both; }
@keyframes ciLift { from { opacity: 0; transform: translateY(40px) scale(.88) } }

/* ---- page 4: the five tiers ---- */
/* THE TIERS: five rows on a dark plate, Stone at the top. A row is a gem in
   the tier's own cut, its name in the tier's colour with its rarity beside
   it, and one short line on what the tier brings: three columns on a wide
   panel (one x for every gem, every name, every line — a subgrid), and on a
   phone the line under the name. The plate is the list's own box, solid,
   its soft edge a spread shadow round it: the light and the rising sparks
   pass BEHIND the screens, and a spark caught in the gap of a small word
   read as a stray letter. */
#cardIntro .ciTiers { --gemS: max(18px, calc(24px * var(--k, 1))); list-style: none; margin: 12px 0; padding: calc(10px * var(--k, 1)) calc(22px * var(--k, 1));
  display: grid; grid-template-columns: var(--gemS) max-content minmax(0, 1fr); column-gap: calc(18px * var(--k, 1));
  width: min(100%, calc(640px * var(--k, 1))); text-align: left; position: relative; z-index: 0; }
#cardIntro .ciTiers::before { content: ''; position: absolute; z-index: -1; inset: 0; pointer-events: none; border-radius: 14px;
  background: rgba(13,9,6,.88); box-shadow: 0 0 14px 4px rgba(13,9,6,.88), inset 0 0 0 1px rgba(214,170,84,.22); }
#cardIntro .ciTiers li { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center;
  padding: calc(13px * var(--k, 1)) 0; border-top: 1px solid rgba(214,170,84,.16); }
#cardIntro .ciTiers li:first-child { border-top: 0; }
#cardIntro .ciGem { width: var(--gemS); height: var(--gemS); background: 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 0 5px var(--tg)) drop-shadow(0 1px 1px rgba(0,0,0,.7)); }
#cardIntro .ciTn { display: flex; flex-direction: column; gap: 2px; }
#cardIntro .ciTiers b { display: block; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; line-height: 1.15;
  font-size: max(13px, calc(18px * var(--k, 1))); color: var(--tc); text-shadow: 0 1px 0 #000, 0 0 8px rgba(0,0,0,.6); white-space: nowrap; }
#cardIntro .ciTiers small { display: block; font-family: Georgia, serif; font-style: italic; line-height: 1.15; font-size: max(11.5px, calc(15px * var(--k, 1)));
  color: #c7b692; white-space: nowrap; text-shadow: 0 1px 0 #000; }
#cardIntro .ciTd { font-family: Georgia, 'Times New Roman', serif; font-size: max(13.5px, calc(19px * var(--k, 1))); line-height: 1.3; color: #efe4cd;
  text-shadow: 0 1px 0 #000; }
#cardIntro.ciNarrow .ciTiers { --gemS: 18px; grid-template-columns: var(--gemS) minmax(0, 1fr); column-gap: 12px; padding: 4px 14px; }
#cardIntro.ciNarrow .ciTiers li { grid-template-columns: subgrid; grid-template-rows: auto auto; row-gap: 3px; padding: 9px 0; }
#cardIntro.ciNarrow .ciGem { grid-row: 1 / span 2; }
#cardIntro.ciNarrow .ciTn { flex-direction: row; align-items: baseline; gap: 8px; }
#cardIntro.ciNarrow .ciTiers b { font-size: 14px; letter-spacing: .04em; }
#cardIntro.ciNarrow .ciTiers small { font-size: 12px; }
#cardIntro.ciNarrow .ciTd { grid-column: 2; font-size: 14px; }
#cardIntro .ciPage.enter .ciTiers li { animation: ciRise .4s cubic-bezier(.2,1.1,.4,1) both; animation-delay: calc(var(--n) * 70ms); }

/* ---- page 5: the two prizes ---- */
#cardIntro .ciLegends { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; }
/* THE PRIZES: the card's painting already shows its beast, so nothing is
   drawn over it or behind it but the tier's own light */
#cardIntro .ciBeasts { position: relative; display: flex; justify-content: center; align-items: center; gap: calc(var(--k, 1) * clamp(28px, 7vw, 76px)); }
#cardIntro .ciPrize { position: relative; display: flex; flex-direction: column; align-items: center; gap: calc(12px * var(--k, 1)); }
#cardIntro .ciStage { position: relative; width: var(--cw); height: var(--ch); }
#cardIntro .ciStage .ccard { position: relative; z-index: 2;
  box-shadow: 0 0 0 1px rgba(255,244,214,.4), 0 0 calc(var(--cw) * .1) calc(var(--cw) * .015) var(--tg), 0 10px 18px rgba(0,0,0,.6); }
/* a slow burst of the tier's light behind the card, and a breathing aura */
#cardIntro .ciBurst { position: absolute; left: 50%; top: 50%; width: calc(var(--cw) * 2.5); aspect-ratio: 1; z-index: 0; pointer-events: none;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(from 0deg, var(--tg) 0deg 3deg, transparent 3deg 12deg);
  -webkit-mask-image: radial-gradient(circle, rgba(0,0,0,.9) 18%, rgba(0,0,0,.35) 34%, transparent 56%);
  mask-image: radial-gradient(circle, rgba(0,0,0,.9) 18%, rgba(0,0,0,.35) 34%, transparent 56%);
  opacity: .55; animation: ciSpin 80s linear infinite; will-change: transform; }
#cardIntro .ciPrize.dragon .ciBurst { opacity: .75; animation-duration: 60s; }
#cardIntro .ciAura { position: absolute; inset: -16% -32%; z-index: 1; pointer-events: none;
  background: radial-gradient(ellipse closest-side, var(--tg), transparent); opacity: .5; animation: ciBreath 3.4s ease-in-out infinite; }
#cardIntro .ciPrize.dragon .ciAura { opacity: .65; animation-delay: -1.2s; }
@keyframes ciBreath { 50% { opacity: .22; transform: scale(.95) } }
/* a glint running round the rim, a hair OUTSIDE the face (it never crosses the art) */
@property --ciAng { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
#cardIntro .ciRim { position: absolute; inset: -5px; z-index: 3; pointer-events: none; border-radius: 4px; padding: 3px;
  background: conic-gradient(from var(--ciAng), transparent 0deg 250deg, var(--tg) 305deg, #fff6d6 338deg, #ffffff 350deg, transparent 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  animation: ciRimRun 5.2s linear infinite; }
#cardIntro .ciPrize.dragon .ciRim { animation-duration: 4.2s; animation-delay: -2s; }
@keyframes ciRimRun { to { --ciAng: 360deg } }
/* motes of the tier's light rising beside the card — never above its top, into the line of copy over it */
#cardIntro .ciMotes { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
#cardIntro.ciMeasure .ciBurst, #cardIntro.ciMeasure .ciAura, #cardIntro.ciMeasure .ciRim, #cardIntro.ciMeasure .ciMotes { display: none !important; }
#cardIntro .ciMotes i { position: absolute; left: var(--x); top: var(--y); width: 3px; height: 3px; border-radius: 50%;
  background: #fffbe8; box-shadow: 0 0 5px 1px var(--tg), 0 0 12px 3px var(--tg);
  animation: ciRiseMote var(--du) linear var(--dl) infinite both; }
@keyframes ciRiseMote { 0% { opacity: 0; transform: translate(0, 0) } 18% { opacity: 1 } 75% { opacity: .8 }
  100% { opacity: 0; transform: translate(var(--dx), calc(var(--ch) * -.38)) } }
#cardIntro .ciPrize figcaption { display: flex; flex-direction: column; align-items: center; gap: 3px; }
/* a phone's two prizes share the row: a caption takes at most its half of
   the panel (container units) and only then breaks, balanced, onto a second line */
#cardIntro.ciNarrow .ciPrize figcaption { max-width: calc((100cqw - 24px - clamp(28px, 7vw, 76px)) / 2); }
#cardIntro.ciNarrow .ciPrize figcaption b { white-space: normal; text-wrap: balance; line-height: 1.2; text-align: center; }
#cardIntro .ciPrize figcaption b { font-weight: 800; text-transform: uppercase; letter-spacing: .06em; font-size: max(11.5px, calc(var(--k, 1) * clamp(11px, 3vw, 15px))); color: #ffe39a;
  text-shadow: 0 2px 0 #000, 0 0 7px rgba(10,7,4,.95); white-space: nowrap; }
#cardIntro .ciPrize figcaption small { font-weight: 700; font-size: max(9.5px, calc(var(--k, 1) * clamp(9px, 2.4vw, 11.5px))); color: var(--tc);
  letter-spacing: .1em; text-transform: uppercase; text-shadow: 0 1px 0 #000, 0 0 6px rgba(10,7,4,.95); white-space: nowrap; }
#cardIntro .ciPage.enter .ciPrize { animation: ciRise .6s cubic-bezier(.2,1.1,.4,1) both; animation-delay: calc(.15s + var(--n) * .15s); }

/* ---- the screen's entrance (the head, then the hero) ---- */
#cardIntro .ciPage.enter .ciHead { animation: ciSlide .42s cubic-bezier(.2,1,.4,1) both; }
#cardIntro .ciPage.enter.fromL .ciHead { animation-name: ciSlideL; }
#cardIntro .ciPage.enter .ciFoot { animation: ciFade .5s ease-out .35s both; }
@keyframes ciSlide { from { opacity: 0; transform: translateX(30px) } }
@keyframes ciSlideL { from { opacity: 0; transform: translateX(-30px) } }
@keyframes ciFade { from { opacity: 0 } }

/* ---- the sparks: small gold motes rising through the light ---- */
/* behind the screens (z -1, over the dusk and the light): a mote never crosses a card's painting,
   and never the copy above or below the hero */
/* in the hero's band alone (_sparkRoom sets top and height), fading in at its top edge */
#cardIntro .ciSparks { position: absolute; left: 10%; right: 10%; top: 24%; height: 56%; z-index: -1; pointer-events: none; overflow: hidden;
  -webkit-mask-image: linear-gradient(transparent, #000 36px); mask-image: linear-gradient(transparent, #000 36px); }
#cardIntro .ciSparks i { position: absolute; left: var(--x); top: calc(40% + var(--y)); width: var(--s); height: var(--s); border-radius: 1px;
  background: #fff1b8; box-shadow: 0 0 6px 1px rgba(255,200,80,.9), 0 0 14px 3px rgba(255,170,50,.35);
  animation: ciMote var(--du) linear var(--dl) infinite both; }
@keyframes ciMote { 0% { opacity: 0; transform: translate(0, 0) } 15% { opacity: 1 } 70% { opacity: .85 }
  100% { opacity: 0; transform: translate(calc(var(--dx) * 14px), -220px) } }
#cardIntro[data-page="earn"] .ciSparks { opacity: .45; }

/* ---- the nav: BACK, the NEXT plaque, the dots ---- */
#cardIntro .ciNav { position: relative; z-index: 5; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: calc(10px * var(--k, 1));
  padding: calc(10px * var(--k, 1)) calc(18px * var(--k, 1)) 0; }
/* the plaque keeps a finger's height (44px) whatever the panel's scale */
#cardIntro .ciNext { width: min(66%, calc(340px * var(--k, 1))); min-height: max(44px, calc(58px * var(--k, 1))); font-size: max(14px, calc(19px * var(--k, 1))); letter-spacing: .14em; }
#cardIntro .ciNext .blab { gap: 12px; }
#cardIntro .ciNext.ciGo::before { background:
    repeating-linear-gradient(90deg, rgba(16,26,8,0.05) 0 2px, rgba(16,26,8,0) 2px 13px),
    linear-gradient(#7d8f3c 0%, #687a2e 45%, #586a22 58%, #48591a 100%);
  box-shadow: inset 0 0 0 2px #14200a, inset 0 0 0 4px #f0c860, inset 0 0 0 6px #a8853a, inset 0 0 0 7px #14200a,
    inset 0 11px 0 rgba(240,230,170,0.17), inset 0 -8px 0 rgba(0,0,0,0.26); }
/* the call to action breathes: a soft light BEHIND the plaque (its own
   element in the nav — a glow inside the plaque's isolated group drew a dark
   box round it) pulses by opacity alone */
#cardIntro .ciCta { position: absolute; left: 50%; top: calc(50% + 5px); width: min(76%, calc(420px * var(--k, 1))); height: calc(110px * var(--k, 1)); transform: translate(-50%, -50%);
  pointer-events: none; display: none; background: radial-gradient(ellipse closest-side, rgba(255,214,110,.42), rgba(255,190,80,.16) 55%, transparent);
  animation: ciCall 2.2s ease-in-out .6s infinite both; }
#cardIntro[data-page="legends"] .ciCta { display: block; }
@keyframes ciCall { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
#cardIntro .ciArr { width: 9px; height: 12px; flex: 0 0 auto; filter: drop-shadow(0 2px 0 rgba(20,12,4,.85)); }
#cardIntro .ciBack, #cardIntro .ciNavPad { flex: 0 0 auto; width: calc(84px * var(--k, 1)); min-height: 44px; }
#cardIntro .ciBack { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer;
  color: #d8c49a; font-family: var(--menufont, 'Cinzel', Georgia, serif); font-weight: 700; font-size: max(11.5px, calc(13px * var(--k, 1))); letter-spacing: .1em; text-transform: uppercase; text-shadow: 0 1px 0 #000; }
#cardIntro .ciBack:hover { color: #ffe39a; }
#cardIntro .ciBack.gone { visibility: hidden; }
#cardIntro .ciDots { position: relative; z-index: 5; flex: 0 0 auto; display: flex; justify-content: center; gap: 2px; padding: calc(2px * var(--k, 1)) 0 calc(12px * var(--k, 1)); }
#cardIntro .ciDot { width: calc(40px * var(--k, 1)); min-width: 30px; height: 44px; padding: 0; border: 0; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
#cardIntro .ciDot i { width: calc(12px * var(--k, 1)); height: calc(12px * var(--k, 1)); border-radius: 50%; background: #2a2118; box-shadow: inset 0 0 0 2px #6f5a3a, 0 1px 0 rgba(0,0,0,.6); transition: transform .2s; }
#cardIntro .ciDot.on i { background: radial-gradient(circle at 40% 35%, #fff3c0, #f2c040 55%, #b57d18); box-shadow: 0 0 0 1px #3a2208, 0 0 10px rgba(255,205,90,.8); transform: scale(1.15); }

/* ---- narrow (a phone upright) ---- */
#cardIntro.ciNarrow .ciPage { padding: 0 12px; }
#cardIntro.ciNarrow .ciPanel::before { inset: 7px; }
#cardIntro.ciNarrow .ciCorner.tl { left: -7px; top: -7px; } #cardIntro.ciNarrow .ciCorner.tr { right: -7px; top: -7px; }
#cardIntro.ciNarrow .ciCorner.bl { left: -7px; bottom: -7px; } #cardIntro.ciNarrow .ciCorner.br { right: -7px; bottom: -7px; }
#cardIntro.ciNarrow .ciX { right: 9px; top: 9px; }
#cardIntro.ciNarrow .ciRoads { grid-template-columns: 1fr; gap: 12px; }
#cardIntro.ciNarrow .ciRoad { flex-direction: row; align-items: center; text-align: left; padding: 14px 14px; gap: 12px; }
#cardIntro.ciNarrow .ciRoadTx { align-items: flex-start; }
#cardIntro.ciNarrow .ciGain { justify-content: flex-start; }
#cardIntro.ciNarrow .ciOr { margin: 0 4px; }
#cardIntro.ciStack .ciPlay { flex-direction: column; gap: 16px; }
#cardIntro.ciStack .ciDeck { flex-direction: row; gap: 16px; }
#cardIntro.ciStack .ciArrow { display: none; }
#cardIntro.ciStack .ciDeck figcaption { align-items: flex-start; }
#cardIntro.ciNarrow .ciTrio, #cardIntro.ciStack .ciTrio { gap: 0; }
#cardIntro.ciStack:not(.ciNarrow) .ciCard { margin: 0 calc(var(--cw) * -0.02); }
/* a caption a little narrower than its card, and a step below it: the tilted
   cards either side never reach under the middle one's words */
#cardIntro.ciStack:not(.ciNarrow) .ciCard figcaption { width: calc(100% - 14px); margin-top: calc(6px + var(--n) * var(--n) * 10px * var(--k, 1)); }
#cardIntro.ciNarrow .ciCard { margin: 0 calc(var(--cw) * -0.035); }
#cardIntro.ciNarrow .ciCard figcaption { width: calc(100% - 14px); margin-top: calc(6px + var(--n) * var(--n) * 10px); }

#cardIntro.ciNarrow .ciNext { width: min(60%, 250px); font-size: 17px; }
#cardIntro.ciNarrow .ciBack, #cardIntro.ciNarrow .ciNavPad { width: 66px; font-size: 12px; }
#cardIntro.ciNarrow .ciNav { padding: 6px 8px 0; gap: 4px; }
#cardIntro.ciNarrow .ciSub { font-size: clamp(15px, 4.4vw, 18px); }
#cardIntro.ciShort .ciSub { margin-top: 4px; }
#cardIntro .ciNext .blab { white-space: nowrap; }
@media (max-width: 359px) { #cardIntro .ciNext { font-size: 15px; letter-spacing: .1em; } }
/* a screen measured too tall for its panel (_fitPage): tightened first… */
#cardIntro .ciPages .ciPage.tight .ciWord { font-size: calc(var(--k, 1) * clamp(26px, min(9.4vw, 5.8vh), 56px)); }
#cardIntro .ciPages .ciPage.tight .ciLaurel { width: calc(26px * var(--k, 1)); height: calc(52px * var(--k, 1)); }
#cardIntro .ciPages .ciPage.tight .ciSub { font-size: 14px; margin-top: 4px; }
#cardIntro .ciPages .ciPage.tight .ciRule { margin: 0; }
#cardIntro .ciPages .ciPage.tight .ciRoads { gap: 8px; }
#cardIntro .ciPages .ciPage.tight .ciRoad { padding: 10px 12px; gap: 10px; }
#cardIntro .ciPages .ciPage.tight .ciRoadTx { gap: 5px; }
#cardIntro .ciPages .ciPage.tight .ciEmb { width: 56px; height: 56px; }
#cardIntro .ciPages .ciPage.tight .ciRoad h3 { font-size: 15px; }
#cardIntro .ciPages .ciPage.tight .ciRoad p { font-size: 13.5px; }
#cardIntro .ciPages .ciPage.tight .ciFoot { font-size: 12px; }
/* the deck and its three cards, closer together */
#cardIntro .ciPages .ciPage.tight .ciPlay { gap: 8px; }
#cardIntro .ciPages .ciPage.tight .ciDeckBtn { width: calc(70px * var(--k, 1)); height: calc(56px * var(--k, 1)); }
#cardIntro .ciPages .ciPage.tight .ciDeckIco { width: calc(40px * var(--k, 1)); height: calc(40px * var(--k, 1)); }
#cardIntro .ciPages .ciPage.tight .ciCard { gap: 5px; }
/* the tiers' rows, closer together */
#cardIntro .ciPages .ciPage.tight .ciTiers { margin: 4px 0; padding-top: 2px; padding-bottom: 2px; }
#cardIntro .ciPages .ciPage.tight .ciTiers li { padding: calc(7px * var(--k, 1)) 0; }
#cardIntro.ciNarrow .ciPages .ciPage.tight .ciTiers li { padding: 5px 0; row-gap: 1px; }
#cardIntro.ciNarrow .ciPages .ciPage.tight .ciTd { font-size: 13px; line-height: 1.25; }
/* the prizes, closer together; a phone's prize caption on one line */
#cardIntro .ciPages .ciPage.tight .ciPrize { gap: 6px; }
#cardIntro.ciNarrow .ciPages .ciPage.tight .ciPrize figcaption b { white-space: nowrap; font-size: 10px; letter-spacing: .03em; }
/* …and if it still spills, its hero scrolls inside the panel */
/* (a column centred in a box it overflows spills UPWARD, where no scroll
   can reach: a scrolling screen's column starts at the top instead) */
#cardIntro .ciPages .ciPage.scroll .ciLegends { height: auto; min-height: 100%; justify-content: flex-start; padding: 6px 0 4px; }
#cardIntro .ciPages .ciPage.scroll .ciHero { overflow-y: auto; overflow-x: hidden; align-items: flex-start; overscroll-behavior: contain; padding: 4px 0;
  scrollbar-width: thin; scrollbar-color: #8a6a2e transparent;
  /* what runs past an edge fades out there (_fade), never cut through a line */
  -webkit-mask-image: linear-gradient(transparent, #000 var(--fadeT, 0px), #000 calc(100% - var(--fadeB, 26px)), transparent);
  mask-image: linear-gradient(transparent, #000 var(--fadeT, 0px), #000 calc(100% - var(--fadeB, 26px)), transparent); }

/* ---- less motion: the same screens, arrived at without movement ---- */
@media (prefers-reduced-motion: reduce) {
  #cardIntro, #cardIntro *, #cardIntro *::before, #cardIntro *::after { animation: none !important; transition: none !important; }
  #cardIntro .ciSparks { display: none; }
}
#cardIntro.ciStill, #cardIntro.ciStill *, #cardIntro.ciStill *::before, #cardIntro.ciStill *::after { animation: none !important; transition: none !important; }
#cardIntro.ciStill .ciSparks { display: none; }
`;

window.CardIntro = CardIntro;
