"use strict";
/* THE CARD ANNOUNCEMENT (tests/card-intro.mjs) — four screens that tell a
   player the cards exist, how they are earned, how they are played and what
   the rarest of them can do, over the title the first time a device opens
   the game with the deck on.

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

   EVERY CLAIM IS THE CODE'S. The earn numbers are read from CFG.CARDS
   (LOSS_DEEDS, LOSS_DAYS, the Hard win table, PITY) and the tier names from
   Deck.TIERS, so a rule retuned there retunes the copy; the contract checks
   the words against the same constants. The faces are Deck.face — the real
   catalog cards, at whole device pixels.

   THE ART (assets/cards/intro/, PixelLab, ART_PLAN.md "The card
   announcement") is fetched only when the announcement opens: the gold
   corner, the ribbon, the laurel, the two emblems and the dusk valley. The
   dragon and the kraken are the beasts' own shipped strips (assets/fx/).
   Lettering is the menu face (Cinzel), so it is crisp at any size. */

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
  BEASTS: [
    { id: 'krakens_call', strip: 'assets/fx/kraken-thrash.png', fw: 224, n: 8, cap: 'Summon the Kraken' },
    { id: 'dragonfire', strip: 'assets/fx/dragon-fly.png', fw: 256, n: 8, cap: 'Unleash the Dragon' },
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
      deeds: C.LOSS_DEEDS | 0, days: C.LOSS_DAYS | 0, pity: C.PITY | 0,
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
  PAGES: ['hello', 'earn', 'play', 'legends'],
  copy() {
    const f = this.facts();
    const t = f.tiers, legend = t[4] || { name: 'Enlightenment', rarity: 'Legendary' };
    return {
      hello: {
        kick: 'New feature', title: 'Cards',
        sub: 'Win or lose, you’ll earn cards to use in future games.',
      },
      earn: {
        kick: 'How to earn', title: 'Earn them',
        sub: 'Every victory earns a card — and so does a defeat you fought hard.',
        win: { h: 'Victory', p: 'A card every time, however fast you win.', note: 'A great victory earns two: on Hard, by the Wonder, or faster than most.' },
        loss: { h: 'A hard-fought defeat', p: 'Still a card, if you did the work.', note: 'Build · train · gather · upgrade · raze' },
        deeds: `${f.deeds} deeds`, days: `${f.days} days of orders`,
        foot: 'Strike your banner and you leave with nothing.',
      },
      play: {
        kick: 'How to play', title: 'Play them',
        sub: 'Tap the deck in your top bar, lift a card, and play it when it counts.',
        deck: 'Your deck', held: f.held > 0 ? `${f.held} ${f.held === 1 ? 'card' : 'cards'} waiting` : '',
        foot: 'Each card plays once — then it’s gone. Choose your moment.',
      },
      legends: {
        kick: 'The prizes', title: 'Chase legends',
        sub: `From ${t[0] ? t[0].name : 'Stone'} to ${legend.rarity} — the harder the fight, the rarer the card.`,
        foot: (f.hardOneIn ? `Win on Hard: 1 card in ${f.hardOneIn} is ${legend.rarity}.` : `Win on Hard for ${legend.rarity} cards.`) +
          (f.pity ? ` ${f.pity} wins without one, and the next is guaranteed.` : ''),
        cta: 'Let’s go',
      },
    };
  },

  _build() {
    const c = this.copy(), esc = s => this.esc(s), f = this.facts();
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
        `<i class="ciRule"></i><p class="ciSub">${esc(P.sub)}</p></div>` +
        `<div class="ciHero">${inner}</div>` +
        (P.foot ? `<p class="ciFoot">${esc(P.foot)}</p>` : '') +
        `</section>`;
    };
    const E = c.earn;
    const earn =
      `<div class="ciRoads">` +
        `<div class="ciRoad win"><i class="ciEmb" data-art="win"></i><div class="ciRoadTx"><h3>${esc(E.win.h)}</h3><p>${esc(E.win.p)}</p>` +
          `<p class="ciGain"><span class="ciCardPip"></span><b>+1 card</b><span class="ciOr">or</span><span class="ciCardPip"></span><span class="ciCardPip two"></span><b>+2</b></p>` +
          `<p class="ciNote">${esc(E.win.note)}</p></div></div>` +
        `<div class="ciRoad loss"><i class="ciEmb" data-art="fight"></i><div class="ciRoadTx"><h3>${esc(E.loss.h)}</h3><p>${esc(E.loss.p)}</p>` +
          `<p class="ciMeter"><span class="ciPips">${'<i></i>'.repeat(f.deeds)}</span><b>${esc(E.deeds)}</b></p>` +
          `<p class="ciMeter"><span class="ciDays">${'<i></i>'.repeat(f.days)}</span><b>${esc(E.days)}</b></p>` +
          `<p class="ciNote">${esc(E.loss.note)}</p></div></div>` +
      `</div>`;
    const play =
      `<div class="ciPlay"><figure class="ciDeck"><div class="ciDeckBtn" aria-hidden="true">${this._stackSvg()}<i class="ciTap"></i></div>` +
        `<figcaption><b>${esc(c.play.deck)}</b>${c.play.held ? `<small>${esc(c.play.held)}</small>` : ''}</figcaption></figure>` +
      `<i class="ciArrow" aria-hidden="true"></i><div class="ciTrio"></div></div>`;
    const legends = `<div class="ciLegends"><ol class="ciTiers"></ol><div class="ciBeasts"></div></div>`;
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
          page(3, 'legends', legends) +
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
    // the pixel art pieces: one URL each, set once
    for (const el of root.querySelectorAll('[data-art]')) el.style.backgroundImage = `url("${this.art(el.dataset.art)}")`;
    root.style.setProperty('--corner', `url("${this.art('corner')}")`);
    root.style.setProperty('--ribbon', `url("${this.art('ribbon')}")`);
    root.style.setProperty('--laurel', `url("${this.art('laurel')}")`);
    root.style.setProperty('--dusk', `url("${this.art('dusk')}")`);
    this._sparks();
  },
  ART: { corner: 'corner.png', ribbon: 'ribbon.png', laurel: 'laurel.png', dusk: 'dusk.webp', win: 'win.png', fight: 'fight.png' },
  art(k) { return this.DIR + this.ART[k] + '?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 1); },

  /* THE ROOM EACH SCREEN HAS. The faces come in whole-pixel steps (Deck.fit:
     on a 3x phone 59 / 117 / 176 CSS px, on a 1x desktop 176 / 352), so the
     sizes are chosen from what fits the panel, and the faces are rebuilt
     only when the step they land on changes (a rotation, a resize). */
  _layout() {
    const root = this._root;
    if (!root) return;
    const vp = this._vp(), dpr = this._dpr();
    const whole = (art, target) => art * Math.max(1, Math.round(target * dpr / art)) / dpr;
    const narrow = vp.w < 600;
    root.classList.toggle('ciNarrow', narrow);
    // the ribbon first: the panel's top gives way to its overhang
    root.style.setProperty('--ribW', whole(160, narrow ? Math.min(240, vp.w * 0.62) : 300) + 'px');
    root.style.setProperty('--cornerW', whole(64, narrow ? 44 : 64) + 'px');
    root.style.setProperty('--laurelH', whole(128, narrow ? 64 : 112) + 'px');
    root.style.setProperty('--embW', whole(64, narrow ? 64 : 120) + 'px');
    const panel = root.querySelector('.ciPanel');
    const pw = panel.clientWidth || Math.min(vp.w - 24, 880);
    const ph = panel.clientHeight || vp.h - 60;
    root.classList.toggle('ciShort', ph < 700);
    const avail = pw - (narrow ? 24 : 72);
    // what the hero may use: the panel less its head and its nav
    const heroH = Math.max(160, ph - (narrow ? 380 : 400));
    const fit = (w, h) => Deck.fit(Math.max(10, Math.min(w, h * Deck.W / Deck.H))).w;
    const cw = fit(narrow ? avail * 0.54 : 230, heroH / 1.1);
    // the cards behind the middle one: a step smaller where the steps allow
    const sw = narrow ? fit(cw * 0.72, heroH) : cw;
    let trioW = fit(narrow ? (avail + 16) / 3 : 200, (heroH - (narrow ? 120 : 40)) / 1.02);
    // the deck button beside three cards needs the room for both; a panel
    // without it (a tablet upright) stacks them as a phone does
    const stack = narrow || 3 * trioW + 40 + 230 > avail;
    if (stack && !narrow) trioW = fit(Math.min(200, (avail - 40) / 3), (heroH - 110) / 1.02);
    root.classList.toggle('ciStack', stack);
    const beastW = fit(narrow ? avail / 2.4 : 200, (heroH - (narrow ? 90 : 60)) / 1.32);
    const key = [cw, sw, trioW, beastW, narrow, stack, Math.round(avail)].join(':');
    if (this._sizes !== key) {
      this._sizes = key;
      this._fan(cw, sw, avail, narrow);
      this._trio(trioW);
      this._legends(beastW, narrow);
    }
    this._fitPage();
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
    const spills = () => {
      const hero = pg.querySelector('.ciHero');
      let need = 0;
      for (const c of hero.children) need += Math.max(c.offsetHeight, c.scrollHeight);
      return need > hero.clientHeight + 2;
    };
    if (!spills()) return;
    pg.classList.add('tight');
    if (spills()) pg.classList.add('scroll');
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
  _legends(cw, narrow) {
    const f = this.facts();
    const ol = this._root.querySelector('.ciTiers');
    // the ladder climbs: Legendary at the top of the column on a wide panel
    const tiers = narrow ? f.tiers : f.tiers.slice().reverse();
    ol.innerHTML = tiers.map(t => {
      const i = f.tiers.indexOf(t);
      return `<li style="--tc:${t.col};--tg:${t.glow};--n:${i}"><i class="ciGem"></i><span><b>${this.esc(t.name)}</b><small>${this.esc(t.rarity)}</small></span></li>`;
    }).join('');
    const host = this._root.querySelector('.ciBeasts');
    host.innerHTML = '';
    host.style.setProperty('--cw', cw + 'px');
    const dpr = this._dpr(), v = (typeof CFG !== 'undefined' && CFG.ART_V) || 1;
    this.BEASTS.forEach((b, n) => {
      const fig = document.createElement('figure');
      fig.className = 'ciBeast ' + (n ? 'dragon' : 'kraken');
      fig.style.setProperty('--n', n);
      const t = Deck.tier(Deck.card(b.id).tier);
      fig.style.setProperty('--tc', t.col);
      // the beast's own strip, stepped: a smooth downscale of a detailed sprite
      // (pixelated only where it is drawn larger than its own pixels)
      const bw = Math.round(cw * (n ? 1.3 : 1.12));
      const beast = document.createElement('i');
      beast.className = 'ciMonster';
      beast.style.width = bw + 'px';
      beast.style.height = bw + 'px';
      beast.style.backgroundImage = `url("${b.strip}?v=${v}")`;
      beast.style.backgroundSize = `${bw * b.n}px ${bw}px`;
      beast.style.setProperty('--strip', -bw * b.n + 'px');
      beast.style.setProperty('--bw', bw + 'px');
      beast.style.imageRendering = bw * dpr > b.fw ? 'pixelated' : 'auto';
      const stage = document.createElement('div');
      stage.className = 'ciStage';
      stage.appendChild(beast);
      stage.appendChild(Deck.face(b.id, { w: cw }));
      fig.appendChild(stage);
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${this.esc(b.cap)}</b><small>${this.esc(t.rarity)}</small>`;
      fig.appendChild(cap);
      host.appendChild(fig);
    });
    // the ladder stands between the two prizes on a wide panel
    if (!narrow) host.insertBefore(ol, host.children[1]);
    else host.parentNode.insertBefore(ol, host);
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
    const v = (typeof CFG !== 'undefined' && CFG.ART_V) || 1;
    if (n === 0) {
      for (const k of ['corner', 'ribbon', 'laurel', 'dusk']) add(this.art(k));
      for (const id of this.FAN) { add(Deck.artUrl(id)); add(Deck.frameUrl(Deck.card(id).tier)); }
    } else if (n === 1) { add(this.art('win')); add(this.art('fight')); }
    else if (n === 2) for (const p of this.PLAY) { add(Deck.artUrl(p.id)); add(Deck.frameUrl(Deck.card(p.id).tier)); }
    else if (n === 3) for (const b of this.BEASTS) { add(Deck.artUrl(b.id)); add(Deck.frameUrl(Deck.card(b.id).tier)); add(b.strip + '?v=' + v); }
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
  // the deck button's own pixel stack (js/deckui.js), so the picture IS the button
  _stackSvg() {
    if (window.DeckUI && DeckUI.STACK_SVG) return DeckUI.STACK_SVG;
    return '<svg class="dkIco" viewBox="0 0 12 12"></svg>';
  },
  CLOSE_SVG: '<svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">' +
    '<rect x="1" y="1" width="2" height="2"/><rect x="3" y="3" width="2" height="2"/><rect x="5" y="5" width="2" height="2"/><rect x="7" y="7" width="2" height="2"/>' +
    '<rect x="7" y="1" width="2" height="2"/><rect x="5" y="3" width="2" height="2"/><rect x="3" y="5" width="2" height="2"/><rect x="1" y="7" width="2" height="2"/></svg>',
  ARROW_R: '<svg class="ciArr" viewBox="0 0 6 8" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor"><rect x="0" y="0" width="2" height="8"/><rect x="2" y="1" width="2" height="6"/><rect x="4" y="3" width="2" height="2"/></svg>',
  ARROW_L: '<svg class="ciArr" viewBox="0 0 6 8" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor"><rect x="4" y="0" width="2" height="8"/><rect x="2" y="1" width="2" height="6"/><rect x="0" y="3" width="2" height="2"/></svg>',

  _css() {
    if (document.getElementById('cardIntroCss')) return;
    if (window.Deck && Deck.css) Deck.css();   // the faces' own stylesheet
    const st = document.createElement('style');
    st.id = 'cardIntroCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
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
#cardIntro .ciPanel { position: relative; width: min(100%, 880px); height: min(100%, 770px);
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
/* the gold corners: one drawing, mirrored, laid over the rim */
#cardIntro .ciCorner { position: absolute; width: var(--cornerW, 64px); height: var(--cornerW, 64px); z-index: 4; pointer-events: none;
  background: var(--corner) 0 0 / 100% 100% no-repeat; image-rendering: pixelated; filter: drop-shadow(0 2px 2px rgba(0,0,0,.7)); }
#cardIntro .ciCorner.tl { left: -9px; top: -9px; }
#cardIntro .ciCorner.tr { right: -9px; top: -9px; transform: scaleX(-1); }
#cardIntro .ciCorner.bl { left: -9px; bottom: -9px; transform: scaleY(-1); }
#cardIntro .ciCorner.br { right: -9px; bottom: -9px; transform: scale(-1, -1); }

/* ---- the close X: 44px to touch, a dark disc with a gold cross to see ---- */
#cardIntro .ciX { position: absolute; right: 16px; top: 16px; z-index: 6; width: 44px; height: 44px; padding: 0; border: 0; background: none;
  display: flex; align-items: center; justify-content: center; color: #f2cd62; cursor: pointer; border-radius: 50%; }
#cardIntro .ciX::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #2c2117, #120c07);
  box-shadow: 0 0 0 1px #0a0704, 0 0 0 2px #a67a34, 0 2px 6px rgba(0,0,0,.6); z-index: -1; }
#cardIntro .ciX svg { width: 14px; height: 14px; filter: drop-shadow(0 1px 0 #000); }
#cardIntro .ciX:hover::before { box-shadow: 0 0 0 1px #0a0704, 0 0 0 2px #f2cd62, 0 0 12px rgba(255,210,100,.5); }
#cardIntro button:focus { outline: none; }
#cardIntro.ciKeys button:focus-visible { outline: 2px solid #ffe9a8; outline-offset: 3px; }

/* ---- the pages ---- */
#cardIntro .ciPages { position: relative; flex: 1 1 auto; min-height: 0; }
#cardIntro .ciPage { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center;
  padding: 0 34px; text-align: center; }
#cardIntro .ciPage.on { display: flex; }
#cardIntro .ciHead { position: relative; flex: 0 0 auto; width: 100%; display: flex; flex-direction: column; align-items: center; }
#cardIntro .ciRibbon { position: relative; margin-top: calc(var(--ribW, 300px) * -.13); width: var(--ribW, 300px); aspect-ratio: 4 / 1; z-index: 5; }
#cardIntro .ciRib { position: absolute; inset: 0; background: var(--ribbon) 0 0 / 100% 100% no-repeat; image-rendering: pixelated;
  filter: drop-shadow(0 3px 3px rgba(0,0,0,.6)); }
/* the lettering sits on the band, which is the ribbon's top 57% (its tails
   hang below it) */
#cardIntro .ciRibbon span { position: absolute; left: 0; right: 0; top: 0; height: 57%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; text-transform: uppercase; color: #f4e6c2;
  font-size: calc(var(--ribW, 300px) * .064); letter-spacing: .12em; white-space: nowrap; text-shadow: 0 1px 0 #061229, 0 0 6px rgba(4,10,30,.8); }
#cardIntro .ciRibbon span::before, #cardIntro .ciRibbon span::after { content: '\\25C6'; color: #f2cd62; font-size: .7em; margin: 0 .6em; }
#cardIntro .ciTitle { position: relative; display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; line-height: 1; }
#cardIntro .ciWord { font-weight: 900; text-transform: uppercase; letter-spacing: .04em; text-align: center;
  font-size: clamp(38px, min(12vw, 10vh), 100px); padding: .06em .04em .1em;
  background: linear-gradient(180deg, #fff6d2 0%, #ffe28a 26%, #f6bf3a 52%, #d0861a 76%, #9c5a10 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 #3a1f05) drop-shadow(0 -1px 0 #3a1f05) drop-shadow(2px 0 0 #3a1f05) drop-shadow(-2px 0 0 #3a1f05)
    drop-shadow(0 4px 0 #1c0f03) drop-shadow(0 0 16px rgba(255,190,70,.45)); }
#cardIntro .ciP-earn .ciWord, #cardIntro .ciP-play .ciWord { font-size: clamp(34px, min(10.5vw, 8.4vh), 84px); }
#cardIntro .ciP-legends .ciWord { font-size: clamp(30px, min(9vw, 7.4vh), 70px); }
/* a wide panel sizes its headline to the PANEL (container units), so the
   laurels never crowd the corners or the X; a browser without them keeps
   the window-sized rule above */
#cardIntro:not(.ciNarrow) .ciWord { white-space: nowrap; font-size: clamp(38px, min(12cqw, 10vh), 100px); }
#cardIntro:not(.ciNarrow) .ciP-earn .ciWord, #cardIntro:not(.ciNarrow) .ciP-play .ciWord { font-size: clamp(34px, min(8.6cqw, 8.4vh), 84px); }
#cardIntro:not(.ciNarrow) .ciP-legends .ciWord { font-size: clamp(30px, min(7.4cqw, 7.4vh), 70px); }
#cardIntro .ciLaurel { flex: 0 0 auto; width: calc(var(--laurelH, 112px) / 2); height: var(--laurelH, 112px);
  background: var(--laurel) 0 0 / 100% 100% no-repeat; image-rendering: pixelated; filter: drop-shadow(0 2px 2px rgba(0,0,0,.6)); }
#cardIntro .ciLaurel.l { transform: scaleX(-1); }
#cardIntro .ciRule { width: min(70%, 420px); height: 9px; margin: 2px 0 2px; flex: 0 0 auto;
  background: linear-gradient(90deg, transparent, #c99a40 25%, #f6d27a 50%, #c99a40 75%, transparent) center / 100% 1px no-repeat; position: relative; }
#cardIntro .ciRule::after { content: ''; position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; transform: translate(-50%, -50%) rotate(45deg);
  background: #f6d27a; box-shadow: 0 0 0 1px #3a2208, 0 0 8px rgba(255,210,100,.7); }
#cardIntro .ciSub { max-width: 31em; margin: 8px auto 0; font-family: Georgia, 'Times New Roman', serif; font-weight: 600;
  font-size: clamp(15px, min(4.2vw, 2.7vh), 22px); line-height: 1.32; color: #f3e8d0; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#cardIntro .ciHero { position: relative; flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
#cardIntro .ciFoot { flex: 0 0 auto; margin: 0 auto 4px; max-width: 40em; font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(12.5px, 3.4vw, 16px); line-height: 1.35; color: #d8c49a; text-shadow: 0 1px 0 #000; }

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
#cardIntro .ciRoads { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: min(100%, 780px); }
#cardIntro .ciRoad { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 18px 18px;
  text-align: center; border-radius: 4px;
  background: linear-gradient(180deg, rgba(42,31,18,.86), rgba(18,13,8,.9));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.7), inset 0 0 0 2px rgba(201,151,62,.6), inset 0 0 30px rgba(255,190,80,.06), 0 10px 24px rgba(0,0,0,.45); }
#cardIntro .ciRoad.loss { background: linear-gradient(180deg, rgba(30,30,32,.86), rgba(13,12,12,.9));
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.7), inset 0 0 0 2px rgba(140,152,170,.55), 0 10px 24px rgba(0,0,0,.45); }
#cardIntro .ciRoadTx { display: flex; flex-direction: column; align-items: center; gap: 6px; }
#cardIntro .ciEmb { flex: 0 0 auto; width: var(--embW, 120px); height: var(--embW, 120px); background: 0 0 / 100% 100% no-repeat;
  image-rendering: pixelated; filter: drop-shadow(0 4px 4px rgba(0,0,0,.6)); }
#cardIntro .ciRoad.win .ciEmb { filter: drop-shadow(0 0 16px rgba(255,200,80,.6)) drop-shadow(0 4px 4px rgba(0,0,0,.6)); }
#cardIntro .ciRoad.loss .ciEmb { filter: drop-shadow(0 0 14px rgba(255,120,40,.3)) drop-shadow(0 4px 4px rgba(0,0,0,.6)); }
#cardIntro .ciRoad h3 { margin: 0; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: clamp(16px, 4.4vw, 23px); line-height: 1.15;
  color: #ffd45e; text-shadow: 0 2px 0 #2a1704, 0 0 12px rgba(255,200,80,.3); }
#cardIntro .ciRoad.loss h3 { color: #dde4ee; text-shadow: 0 2px 0 #10151c; }
#cardIntro .ciRoad p { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(14px, 3.8vw, 17px); line-height: 1.35; color: #efe4cd; }
#cardIntro .ciRoad .ciNote { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: clamp(12px, 3.2vw, 14px); color: #c9b48a; }
#cardIntro .ciRoad.loss .ciNote { font-style: normal; font-family: var(--menufont, 'Cinzel', Georgia, serif); font-weight: 700;
  font-size: clamp(10px, 2.7vw, 12px); letter-spacing: .12em; text-transform: uppercase; color: #aeb6c2; }
#cardIntro .ciGain, #cardIntro .ciMeter { display: flex !important; align-items: center; justify-content: center; gap: 8px; }
#cardIntro .ciGain b, #cardIntro .ciMeter b { font-family: var(--menufont, 'Cinzel', Georgia, serif); font-weight: 800; letter-spacing: .06em;
  text-transform: uppercase; font-size: clamp(12px, 3.3vw, 15px); color: #ffe39a; text-shadow: 0 1px 0 #000; }
#cardIntro .ciRoad.loss .ciMeter b { color: #e6ecf3; }
#cardIntro .ciOr { font-family: Georgia, serif; font-style: italic; font-size: 13px; color: #b8a888; }
/* a card, as a small gold slab with a dark window — the reward, counted */
#cardIntro .ciCardPip { width: 15px; height: 21px; border-radius: 2px; background: linear-gradient(160deg, #fff0b8, #f0c050 40%, #a8701c);
  box-shadow: 0 0 0 1px #2a1704, inset 0 0 0 3px rgba(0,0,0,0) , 0 0 8px rgba(255,200,80,.55); position: relative; }
#cardIntro .ciCardPip::after { content: ''; position: absolute; left: 3px; right: 3px; top: 3px; height: 9px; background: #4a3320; border-radius: 1px; }
#cardIntro .ciCardPip.two { margin-left: -9px; transform: rotate(10deg) translateY(-2px); }
#cardIntro .ciPips, #cardIntro .ciDays { display: inline-flex; gap: 6px; align-items: center; }
#cardIntro .ciPips i { width: 12px; height: 12px; transform: rotate(45deg); background: linear-gradient(135deg, #fff2c0, #e8b84a 55%, #9a6418);
  box-shadow: 0 0 0 1px #2a1704, 0 0 8px rgba(255,200,90,.6); }
#cardIntro .ciDays i { width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fff, #cfd8e4 50%, #6d7b8c);
  box-shadow: 0 0 0 1px #121820, 0 0 6px rgba(200,220,255,.45); }
#cardIntro .ciPage.enter .ciRoad { animation: ciRise .5s cubic-bezier(.2,1.1,.4,1) both; }
#cardIntro .ciPage.enter .ciRoad.loss { animation-delay: .12s; }
#cardIntro .ciPage.enter .ciPips i, #cardIntro .ciPage.enter .ciDays i { animation: ciPop .36s cubic-bezier(.3,1.6,.5,1) both; }
#cardIntro .ciPips i:nth-child(1), #cardIntro .ciDays i:nth-child(1) { animation-delay: .35s !important }
#cardIntro .ciPips i:nth-child(2), #cardIntro .ciDays i:nth-child(2) { animation-delay: .43s !important }
#cardIntro .ciPips i:nth-child(3), #cardIntro .ciDays i:nth-child(3) { animation-delay: .51s !important }
#cardIntro .ciPips i:nth-child(4), #cardIntro .ciDays i:nth-child(4) { animation-delay: .59s !important }
#cardIntro .ciPips i:nth-child(5), #cardIntro .ciDays i:nth-child(5) { animation-delay: .67s !important }
#cardIntro .ciPips i:nth-child(n+6), #cardIntro .ciDays i:nth-child(n+6) { animation-delay: .75s !important }
@keyframes ciPop { from { opacity: 0; scale: .2 } }
@keyframes ciRise { from { opacity: 0; transform: translateY(22px) } }

/* ---- page 3: the deck button and three cards ---- */
#cardIntro .ciPlay { display: flex; align-items: center; justify-content: center; gap: clamp(12px, 3vw, 30px); width: 100%; }
#cardIntro .ciDeck { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 12px; }
#cardIntro .ciDeck figcaption { display: flex; flex-direction: column; align-items: center; gap: 3px; white-space: nowrap; }
#cardIntro .ciDeck figcaption b { font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: clamp(12px, 3.2vw, 14px); color: #ffe39a; text-shadow: 0 1px 0 #000; }
#cardIntro .ciDeck figcaption small { font-family: Georgia, serif; font-style: italic; font-size: clamp(12px, 3.2vw, 14px); color: #e8d6ae; text-shadow: 0 1px 0 #000; }
#cardIntro .ciDeckBtn { position: relative; width: 84px; height: 70px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; background: linear-gradient(180deg, #4a3520, #2b1d10);
  box-shadow: inset 0 0 0 1px #0d0804, inset 0 0 0 2px #a8782f, inset 0 3px 0 2px rgba(255,220,150,.08), 0 6px 16px rgba(0,0,0,.6); }
#cardIntro .ciDeckBtn svg { width: 48px; height: 48px; image-rendering: pixelated; filter: drop-shadow(0 2px 0 rgba(0,0,0,.6)); }
#cardIntro .ciTap { position: absolute; inset: -6px; border-radius: 10px; border: 2px solid rgba(255,214,110,.85); pointer-events: none;
  animation: ciTap 1.6s ease-out infinite; }
@keyframes ciTap { 0% { opacity: .9; transform: scale(.94) } 80%, 100% { opacity: 0; transform: scale(1.16) } }
/* a pixel chevron trail from the button to the hand */
#cardIntro .ciArrow { flex: 0 0 auto; width: 42px; height: 14px;
  background: repeating-linear-gradient(90deg, #f2cd62 0 6px, transparent 6px 12px) 0 50% / 30px 4px no-repeat;
  position: relative; filter: drop-shadow(0 0 6px rgba(255,200,80,.6)); }
#cardIntro .ciArrow::after { content: ''; position: absolute; right: 0; top: 0; border-left: 10px solid #f2cd62; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
#cardIntro .ciTrio { position: relative; display: flex; align-items: flex-start; justify-content: center; gap: clamp(10px, 2vw, 22px); }
#cardIntro .ciCard { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; width: var(--cw); }
#cardIntro .ciTilt { transform: rotate(calc(var(--n) * 4deg)) translateY(calc(var(--n) * var(--n) * 10px)); transform-origin: 50% 100%; }

#cardIntro .ciCard:nth-child(2) { z-index: 2; }
#cardIntro .ciCard:nth-child(2) .ccard { box-shadow: 0 0 18px 2px rgba(255,200,80,.45), 0 8px 14px rgba(0,0,0,.6); }
#cardIntro .ciCard figcaption { width: 100%; margin-top: calc(var(--n) * var(--n) * 10px); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; line-height: 1.2;
  font-size: clamp(10.5px, 2.9vw, 14px); color: #ffe39a; text-shadow: 0 2px 0 #000; }
#cardIntro .ciPage.enter .ciCard { animation: ciLift .55s cubic-bezier(.2,1.2,.4,1) both; animation-delay: calc(.12s + (var(--n) + 1) * .1s); }
#cardIntro .ciPage.enter .ciDeck { animation: ciRise .5s cubic-bezier(.2,1.1,.4,1) both; }
@keyframes ciLift { from { opacity: 0; transform: translateY(40px) scale(.88) } }

/* ---- page 4: the tiers and the beasts ---- */
#cardIntro .ciLegends { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 100%; }
#cardIntro .ciTiers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; align-self: center; }
#cardIntro .ciTiers li { display: flex; align-items: center; gap: 10px; text-align: left; }
#cardIntro .ciTiers li span { display: flex; flex-direction: column; gap: 1px; }
#cardIntro .ciGem { flex: 0 0 auto; width: calc(12px + var(--n) * 2px); height: calc(12px + var(--n) * 2px); transform: rotate(45deg); margin: 4px;
  background: linear-gradient(135deg, #fff, var(--tc) 45%, rgba(0,0,0,.55) 120%); box-shadow: 0 0 0 1px #000, 0 0 calc(4px + var(--n) * 3px) var(--tg); }
#cardIntro .ciTiers b { font-weight: 800; text-transform: uppercase; letter-spacing: .05em; font-size: clamp(9px, 2.5vw, 15px); color: var(--tc); text-shadow: 0 1px 0 #000; white-space: nowrap; }
#cardIntro .ciTiers small { font-family: Georgia, serif; font-size: clamp(9px, 2.3vw, 12.5px); color: #bfae8c; white-space: nowrap; }
#cardIntro .ciBeasts { position: relative; display: flex; justify-content: center; align-items: flex-end; gap: clamp(14px, 4vw, 44px); }
#cardIntro .ciBeast { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; }
#cardIntro .ciStage { position: relative; padding-top: calc(var(--cw) * .42); }
#cardIntro .ciStage .ccard { position: relative; z-index: 2; }
#cardIntro .ciBeast.kraken .ccard { box-shadow: 0 0 22px 3px rgba(170,150,255,.5), 0 8px 14px rgba(0,0,0,.6); }
#cardIntro .ciBeast.dragon .ccard { box-shadow: 0 0 26px 4px rgba(255,150,60,.65), 0 8px 14px rgba(0,0,0,.6); }
#cardIntro .ciMonster { position: absolute; left: 50%; pointer-events: none; transform: translateX(-50%);
  background-repeat: no-repeat; background-position: 0 0; animation: ciStrip .9s steps(8) infinite, ciHover 3.4s ease-in-out infinite;
  filter: drop-shadow(0 6px 6px rgba(0,0,0,.55)); }
/* the kraken rises BEHIND its card, its arms over the frame */
#cardIntro .ciBeast.kraken .ciMonster { top: 0; z-index: 1; animation-duration: 1.1s, 4.2s; }
/* the dragon flies over its own, wings spread across the top */
#cardIntro .ciBeast.dragon .ciMonster { top: calc(var(--bw) * -.12); z-index: 3; }
@keyframes ciStrip { to { background-position-x: var(--strip) } }
@keyframes ciHover { 50% { transform: translateX(-50%) translateY(-6px) } }
#cardIntro .ciBeast figcaption { display: flex; flex-direction: column; align-items: center; gap: 3px; }
#cardIntro .ciBeast figcaption b { font-weight: 800; text-transform: uppercase; letter-spacing: .06em; font-size: clamp(11px, 3vw, 15px); color: #ffe39a; text-shadow: 0 2px 0 #000; white-space: nowrap; }
#cardIntro .ciBeast figcaption small { font-weight: 700; font-size: clamp(9px, 2.4vw, 11.5px); color: var(--tc);
  letter-spacing: .1em; text-transform: uppercase; text-shadow: 0 1px 0 #000; white-space: nowrap; }
#cardIntro .ciPage.enter .ciTiers li { animation: ciRise .4s cubic-bezier(.2,1.1,.4,1) both; animation-delay: calc(var(--n) * 70ms); }
#cardIntro .ciPage.enter .ciBeast { animation: ciRise .6s cubic-bezier(.2,1.1,.4,1) both; animation-delay: calc(.3s + var(--n) * .15s); }

/* ---- the screen's entrance (the head, then the hero) ---- */
#cardIntro .ciPage.enter .ciHead { animation: ciSlide .42s cubic-bezier(.2,1,.4,1) both; }
#cardIntro .ciPage.enter.fromL .ciHead { animation-name: ciSlideL; }
#cardIntro .ciPage.enter .ciFoot { animation: ciFade .5s ease-out .35s both; }
@keyframes ciSlide { from { opacity: 0; transform: translateX(30px) } }
@keyframes ciSlideL { from { opacity: 0; transform: translateX(-30px) } }
@keyframes ciFade { from { opacity: 0 } }

/* ---- the sparks: small gold motes rising through the light ---- */
#cardIntro .ciSparks { position: absolute; left: 10%; right: 10%; top: 24%; bottom: 20%; z-index: 2; pointer-events: none; overflow: hidden; }
#cardIntro .ciSparks i { position: absolute; left: var(--x); top: calc(40% + var(--y)); width: var(--s); height: var(--s); border-radius: 1px;
  background: #fff1b8; box-shadow: 0 0 6px 1px rgba(255,200,80,.9), 0 0 14px 3px rgba(255,170,50,.35);
  animation: ciMote var(--du) linear var(--dl) infinite both; }
@keyframes ciMote { 0% { opacity: 0; transform: translate(0, 0) } 15% { opacity: 1 } 70% { opacity: .85 }
  100% { opacity: 0; transform: translate(calc(var(--dx) * 14px), -220px) } }
#cardIntro[data-page="earn"] .ciSparks { opacity: .45; }

/* ---- the nav: BACK, the NEXT plaque, the dots ---- */
#cardIntro .ciNav { position: relative; z-index: 5; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 18px 0; }
#cardIntro .ciNext { width: min(66%, 340px); min-height: 58px; font-size: 19px; letter-spacing: .14em; }
#cardIntro .ciNext .blab { gap: 12px; }
#cardIntro .ciNext.ciGo::before { background:
    repeating-linear-gradient(90deg, rgba(16,26,8,0.05) 0 2px, rgba(16,26,8,0) 2px 13px),
    linear-gradient(#7d8f3c 0%, #687a2e 45%, #586a22 58%, #48591a 100%);
  box-shadow: inset 0 0 0 2px #14200a, inset 0 0 0 4px #f0c860, inset 0 0 0 6px #a8853a, inset 0 0 0 7px #14200a,
    inset 0 11px 0 rgba(240,230,170,0.17), inset 0 -8px 0 rgba(0,0,0,0.26); }
/* the call to action breathes: a soft light BEHIND the plaque (its own
   element in the nav — a glow inside the plaque's isolated group drew a dark
   box round it) pulses by opacity alone */
#cardIntro .ciCta { position: absolute; left: 50%; top: calc(50% + 5px); width: min(76%, 420px); height: 110px; transform: translate(-50%, -50%);
  pointer-events: none; display: none; background: radial-gradient(ellipse closest-side, rgba(255,214,110,.42), rgba(255,190,80,.16) 55%, transparent);
  animation: ciCall 2.2s ease-in-out .6s infinite both; }
#cardIntro[data-page="legends"] .ciCta { display: block; }
@keyframes ciCall { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
#cardIntro .ciArr { width: 9px; height: 12px; flex: 0 0 auto; filter: drop-shadow(0 2px 0 rgba(20,12,4,.85)); }
#cardIntro .ciBack, #cardIntro .ciNavPad { flex: 0 0 auto; width: 84px; min-height: 44px; }
#cardIntro .ciBack { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer;
  color: #d8c49a; font-family: var(--menufont, 'Cinzel', Georgia, serif); font-weight: 700; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; text-shadow: 0 1px 0 #000; }
#cardIntro .ciBack:hover { color: #ffe39a; }
#cardIntro .ciBack.gone { visibility: hidden; }
#cardIntro .ciDots { position: relative; z-index: 5; flex: 0 0 auto; display: flex; justify-content: center; gap: 2px; padding: 2px 0 12px; }
#cardIntro .ciDot { width: 40px; height: 44px; padding: 0; border: 0; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
#cardIntro .ciDot i { width: 12px; height: 12px; border-radius: 50%; background: #2a2118; box-shadow: inset 0 0 0 2px #6f5a3a, 0 1px 0 rgba(0,0,0,.6); transition: transform .2s; }
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
#cardIntro.ciNarrow .ciGain, #cardIntro.ciNarrow .ciMeter { justify-content: flex-start; }
#cardIntro.ciNarrow .ciMeter b { font-size: 11.5px; white-space: nowrap; }
#cardIntro.ciNarrow .ciPips, #cardIntro.ciNarrow .ciDays { gap: 4px; }
#cardIntro.ciNarrow .ciPips i { width: 10px; height: 10px; }
#cardIntro.ciNarrow .ciDays i { width: 9px; height: 9px; }
#cardIntro.ciStack .ciPlay { flex-direction: column; gap: 16px; }
#cardIntro.ciStack .ciDeck { flex-direction: row; gap: 16px; }
#cardIntro.ciStack .ciArrow { display: none; }
#cardIntro.ciStack .ciDeck figcaption { align-items: flex-start; }
#cardIntro.ciNarrow .ciTrio { gap: 0; }
#cardIntro.ciNarrow .ciCard { margin: 0 calc(var(--cw) * -0.035); }
#cardIntro.ciNarrow .ciCard figcaption { width: calc(100% - 14px); margin-top: calc(6px + var(--n) * var(--n) * 10px); }

#cardIntro.ciNarrow .ciTiers { flex-direction: row; gap: 6px; }
#cardIntro.ciNarrow .ciTiers li { flex-direction: column; text-align: center; gap: 2px; }
#cardIntro.ciNarrow .ciTiers li span { align-items: center; }
#cardIntro.ciNarrow .ciNext { width: min(60%, 250px); font-size: 17px; }
#cardIntro.ciNarrow .ciBack, #cardIntro.ciNarrow .ciNavPad { width: 66px; font-size: 12px; }
#cardIntro.ciNarrow .ciNav { padding: 6px 8px 0; gap: 4px; }
#cardIntro.ciNarrow .ciSub { font-size: clamp(15px, 4.4vw, 18px); }
#cardIntro.ciShort .ciSub { margin-top: 4px; }
#cardIntro .ciNext .blab { white-space: nowrap; }
@media (max-width: 359px) { #cardIntro .ciNext { font-size: 15px; letter-spacing: .1em; } }
/* a screen measured too tall for its panel (_fitPage): tightened first… */
#cardIntro .ciPages .ciPage.tight .ciWord { font-size: clamp(26px, min(9.4vw, 5.8vh), 56px); }
#cardIntro .ciPages .ciPage.tight .ciLaurel { width: 24px; height: 48px; image-rendering: auto; }
#cardIntro .ciPages .ciPage.tight .ciSub { font-size: 14px; margin-top: 4px; }
#cardIntro .ciPages .ciPage.tight .ciRule { margin: 0; }
#cardIntro .ciPages .ciPage.tight .ciRoads { gap: 8px; }
#cardIntro .ciPages .ciPage.tight .ciRoad { padding: 10px 12px; gap: 10px; }
#cardIntro .ciPages .ciPage.tight .ciRoadTx { gap: 3px; }
#cardIntro .ciPages .ciPage.tight .ciEmb { width: 52px; height: 52px; image-rendering: auto; }
#cardIntro .ciPages .ciPage.tight .ciRoad h3 { font-size: 15px; }
#cardIntro .ciPages .ciPage.tight .ciRoad p { font-size: 13.5px; }
#cardIntro .ciPages .ciPage.tight .ciFoot { font-size: 12px; }
/* …and if it still spills, its hero scrolls inside the panel */
#cardIntro .ciPages .ciPage.scroll .ciHero { overflow-y: auto; align-items: flex-start; overscroll-behavior: contain; padding: 4px 0;
  scrollbar-width: thin; scrollbar-color: #8a6a2e transparent; }

/* ---- less motion: the same screens, arrived at without movement ---- */
@media (prefers-reduced-motion: reduce) {
  #cardIntro, #cardIntro *, #cardIntro *::before, #cardIntro *::after { animation: none !important; transition: none !important; }
  #cardIntro .ciSparks { display: none; }
}
#cardIntro.ciStill, #cardIntro.ciStill *, #cardIntro.ciStill *::before, #cardIntro.ciStill *::after { animation: none !important; transition: none !important; }
#cardIntro.ciStill .ciSparks { display: none; }
`;

window.CardIntro = CardIntro;
