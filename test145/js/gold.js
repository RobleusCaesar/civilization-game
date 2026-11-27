'use strict';
/* GOLD AND THE PURSE (CFG.GOLD, migration 0019_gold_store.sql; tests/gold.mjs
   — operator, build 223: "finished games convert score to gold… the store…
   a trader's stall… coins burst from the plinth"). The purse lives on the
   card collection (Deck.col().gold, js/deck.js), earned by Deck.settle /
   Deck.prologue and kept true by the cloud (Deck.sync: grant_gold,
   grant_prologue_gold, my_gold). This file is what the screens ask of it:

   - THE PURCHASE (Gold.buy): ONE question to the record — 0019's buy_card,
     which takes the gold, adds the card and writes the purchase in ONE
     transaction under the player's own lock, so two taps, two tabs or two
     devices can never spend one coin twice and the purse can never go below
     nothing. The id of a purchase whose answer was lost is KEPT (c.pend), so
     pressing BUY again asks the same question and the record answers
     "already" — never a second card for one press. A device the cloud never
     talks to (a test deck, a test build, a page from disk) buys from its own
     mirror, the same rules on one device: the purse re-read under a lock the
     other tabs share (navigator.locks), never spent below nothing.
   - THE COINS: the one gold this game draws for money (assets/ui/gold/: a
     minted coin spinning in sixteen frames, its glint in eight, the purse it
     goes into), and the flights both screens use — a burst off the plinth
     into the end screen's counter, a stream from the purse to the card in
     the store. A picture only: the bookkeeping happens before any coin
     moves, so a player who leaves mid-flight has lost nothing.
   - THE TEST PAGE'S PURSE (?gold=reset, ?gold=N): on a TEST deck only —
     never a real purse — it deals the toy purse again or sets it.
   Off (CFG.GOLD.ON false, or the deck switched off) nothing here draws,
   asks or writes. */
const Gold = {
  on() { return !!(window.Deck && Deck.goldOn && Deck.goldOn()); },
  balance() { return this.on() ? Deck.gold() : 0; },
  fmt(n) { return Math.max(0, Math.floor(+n || 0)).toLocaleString('en-US'); },
  art(name) { return 'assets/ui/gold/' + name + '.png?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 1); },

  /* ---------------- where a purchase is decided ----------------
     'cloud' — the record's door (the live site, signed in, online);
     'local' — a device the cloud never talks to (Deck._syncGate's test,
       not_site, not_configured, no_backend): its own mirror is its record;
     'offline' — the cloud is wanted but not reachable now (signed out,
       no network): a purchase waits for it, since only the record may spend. */
  mode() {
    if (!this.on()) return 'off';
    const why = Deck._syncGate ? Deck._syncGate() : 'no_backend';
    if (!why) return (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'cloud';
    if (why === 'not_ready') return 'offline';
    if (why === 'off') return 'off';
    return 'local';
  },

  /* ---------------- THE PURCHASE ---------------- */
  _buying: false,
  PEND_MS: 15 * 60 * 1000,   // a purchase whose answer was lost is asked again under its own id this long
  /* buy(id) → { ok, card, price, gold, already } or { ok: false, reason,
     price, gold, need }. Reasons: not_enough (need = what is missing),
     pending (the record's purse is short only of gold still on its way up),
     price_changed (price = the record's own), offline, network, full,
     not_for_sale, busy. */
  async buy(id) {
    if (!this.on() || !window.Deck || !Deck.card(id) || !(Deck.price(id) > 0)) return { ok: false, reason: 'not_for_sale' };
    if (this._buying) return { ok: false, reason: 'busy' };
    const mode = this.mode();
    if (mode !== 'cloud' && mode !== 'local') return { ok: false, reason: 'offline', price: Deck.price(id), gold: this.balance() };
    this._buying = true;
    try {
      const r = await this._locked(() => mode === 'local' ? this._buyLocal(id) : this._buyCloud(id));
      if (r && r.ok) {
        const c = Deck.card(id);
        Deck.track('store', { ev: 'buy', card: id, tier: c.tier, price: r.price, gold: r.gold, again: !!r.already });
      }
      return r;
    } catch (e) {
      console.error('purchase', e);
      return { ok: false, reason: 'network' };
    } finally { this._buying = false; }
  },
  // the purse is re-read and written under one lock every tab of this site shares
  _locked(fn) {
    try {
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request)
        return navigator.locks.request('clanfire-purse', () => fn());
    } catch (e) { /* a browser without locks: the record (cloud) or the moment (local) decides */ }
    return fn();
  },
  // the mirror as the DISK holds it: another tab's purchase is never spent twice
  _fresh() { if (Deck._diskMoved && Deck._diskMoved()) Deck._col = null; return Deck.col(); },
  _pid(c, id, price) {
    const p = c.pend;
    if (p && p.card === id && Date.now() - (p.at || 0) < this.PEND_MS) return p.id;
    const pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    c.pend = { id: pid, card: id, price, at: Date.now() };
    return pid;
  },
  _unpend(c, pid) { if (c.pend && (!pid || c.pend.id === pid)) delete c.pend; },
  // a purchase lands once, whatever answers twice (c.buys, by purchase id)
  _apply(c, pid, id, price, gold) {
    if (!c.buys[pid]) {
      c.buys[pid] = { card: id, price, at: Date.now() };
      Deck._add(id, 1);
    }
    c.gold = Math.max(0, Math.floor(gold));
    c.rev = (c.rev | 0) + 1;   // a reconcile asked before this purchase is no longer the truth
    this._unpend(c, pid);
  },
  _short(c, price, reason) {
    return { ok: false, reason: reason || 'not_enough', price, gold: c.gold, need: Math.max(0, price - c.gold) };
  },
  _buyLocal(id) {
    const c = this._fresh(), price = Deck.price(id);
    const pid = this._pid(c, id, price);
    if (c.buys[pid]) { this._unpend(c, pid); Deck.saveCol(); return { ok: true, card: id, price, gold: c.gold, already: true }; }
    if (c.gold < price) { this._unpend(c, pid); Deck.saveCol(); return this._short(c, price); }
    this._apply(c, pid, id, price, c.gold - price);
    Deck.saveCol();
    return { ok: true, card: id, price, gold: c.gold };
  },
  async _buyCloud(id) {
    // the gold this device earned goes up first, so the record's purse is the whole purse
    let c = this._fresh();
    if (c.gq.length) { try { await Deck.sync('buy'); } catch (e) {} c = this._fresh(); }
    const price = Deck.price(id);
    // what the mirror already knows is short is said at once (the store asked
    // the record when it opened; the record would only say the same)
    if (c.gold < price && !c.gq.length && !(c.pend && c.pend.card === id)) return this._short(c, price);
    const pid = this._pid(c, id, price);
    Deck.saveCol();
    let r = null;
    try { r = await window.Backend.rpc('buy_card', { p_card_key: id, p_purchase_id: pid, p_price: price }); } catch (e) { r = null; }
    c = this._fresh();
    const d = r && r.ok ? r.data : null;
    // AN ANSWER THAT IS NOT OURS IS NO ANSWER: the pending id is kept, so the
    // next press asks the same question and is never a second purchase
    if (!d || typeof d.ok !== 'boolean') {
      const code = r && r.error && r.error.code;
      return { ok: false, reason: code === 404 ? 'not_yet' : 'network', price, gold: c.gold };
    }
    if (d.ok) {
      const paid = Math.floor(+d.price) > 0 ? Math.floor(+d.price) : price;
      this._apply(c, pid, id, paid, +d.gold >= 0 ? +d.gold : c.gold - (c.buys[pid] ? 0 : paid));
      Deck.saveCol();
      return { ok: true, card: id, price: paid, gold: c.gold, already: !!d.already };
    }
    // a refusal is final for this purchase id
    this._unpend(c, pid);
    if (+d.gold >= 0) c.gold = Math.floor(+d.gold);
    c.rev = (c.rev | 0) + 1;
    if (d.reason === 'price_changed' && +d.price > 0) {
      if (!c.prices || typeof c.prices !== 'object') c.prices = {};
      c.prices[id] = Math.floor(+d.price);
    }
    Deck.saveCol();
    if (d.reason === 'not_enough') return this._short(c, Deck.price(id), c.gq.length ? 'pending' : 'not_enough');
    if (d.reason === 'price_changed') return { ok: false, reason: 'price_changed', price: Deck.price(id), gold: c.gold };
    return { ok: false, reason: d.reason || 'refused', price, gold: c.gold };
  },
  // the words a refusal is told in (the store says them on the card)
  why(r) {
    if (!r) return '';
    switch (r.reason) {
      case 'not_enough': return this.fmt(r.need) + ' more gold needed';
      case 'pending': return 'Your latest gold is still on its way. Try again in a moment.';
      case 'price_changed': return 'The trader’s price is now ' + this.fmt(r.price) + ' gold.';
      case 'offline': return 'The trader needs a connection. Your gold is safe.';
      case 'not_yet': return 'The store is not open yet. Your gold is safe.';
      case 'network': return 'Couldn’t reach the trader. Your gold is safe — try again.';
      case 'full': return 'Your deck holds as many of these as it can.';
      case 'busy': return '';
      default: return 'The trader can’t sell that right now.';
    }
  },

  /* ---------------- THE TEST PAGE'S PURSE ----------------
     ?gold=reset deals the toy purse again (CFG.GOLD.TEST, its ledger and
     purchases forgotten), ?gold=N sets it — on a TEST deck only, never a
     real purse; the link is taken out of the address once read, so a
     reload does not undo what was bought since */
  testLink() {
    let q = '';
    try { q = String(location.search || ''); } catch (e) { return false; }
    const m = /[?&]gold=(reset|\d{1,7})\b/.exec(q);
    if (!m || !this.on()) return false;
    try { Deck.ensureStarter(); } catch (e) {}
    const c = Deck.col();
    let done = false;
    if (c.test) {
      if (m[1] === 'reset') { c.gold = CFG.GOLD.TEST || 0; c.goldRuns = {}; c.buys = {}; delete c.pend; }
      else c.gold = Math.min(1e6, +m[1]);
      c.rev = (c.rev | 0) + 1;
      Deck.saveCol();
      done = true;
    }
    try {
      const u = new URL(location.href);
      u.searchParams.delete('gold');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
    return done;
  },

  /* ---------------- THE TITLE: the Store's plate, the purse on it ----------------
     Screens.onTitle calls in before the night dresses its plates
     (TitleScreen.ICON names its pouch); the journey's title puts it away
     with the deck's collection (prologue.js) */
  onTitle() {
    const menu = document.querySelector('#scrTitle .tmenu');
    let b = document.getElementById('btnTitleStore');
    if (!this.on()) { if (b) b.remove(); return; }
    this._css();
    this.testLink();
    if (menu && !b) {
      b = document.createElement('button');
      b.className = 'abtn big';
      b.id = 'btnTitleStore';
      b.innerHTML = '<span class="blab">Store</span><span class="tPurse" aria-hidden="true">' + this.mark(20) + '<b class="tGoldN">0</b></span>';
      b.addEventListener('click', () => { if (window.Store) Store.open('title'); });
      menu.insertBefore(b, menu.querySelector('.trow2') || null);
    }
    this.paintTitle();
    this._warmStall();
    if (!this._titleSub && window.Deck && Deck.onChange) { this._titleSub = true; Deck.onChange(() => this.paintTitle()); }
    // the record's purse, asked as the title is read (a sign-in brings its own sync)
    if (this.mode() === 'cloud' && !this._titleSynced) { this._titleSynced = true; try { Deck.sync('title'); } catch (e) {} }
  },
  /* the stall's painting is fetched while the title is read, in idle time —
     one picture, the one the store's <picture> will choose (wide on a
     landscape window, webp) — so the store never opens on a bare night */
  _warmStall() {
    if (this._warmed || typeof Image === 'undefined') return;
    this._warmed = true;
    const go = () => {
      let wide = false;
      try { wide = matchMedia('(min-aspect-ratio: 4/3)').matches; } catch (e) {}
      const v = (typeof CFG !== 'undefined' && CFG.ART_V) || 1;
      try { new Image().src = 'assets/ui/store/stall-' + (wide ? 'wide' : 'tall') + '.webp?v=' + v; } catch (e) {}
    };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 8000 }); else setTimeout(go, 3000);
  },
  paintTitle() {
    const b = document.getElementById('btnTitleStore');
    if (!b) return;
    const g = this.balance();
    b.querySelector('.tGoldN').textContent = this.fmt(g);
    b.setAttribute('aria-label', 'Store, ' + this.fmt(g) + ' gold in your purse');
  },

  /* ---------------- THE COINS ---------------- */
  reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } },
  _css() {
    if (document.getElementById('goldCss')) return;
    const st = document.createElement('style');
    st.id = 'goldCss';
    st.textContent = this.CSS();
    document.head.appendChild(st);
  },
  // one coin, spinning on its own phase
  coin(size, still) {
    this._css();
    const c = document.createElement('i');
    c.className = 'gcoin' + (still ? ' still' : '');
    c.setAttribute('aria-hidden', 'true');
    c.style.setProperty('--s', size + 'px');
    if (!still) c.style.animationDelay = (-Math.random() * 0.7).toFixed(3) + 's';
    return c;
  },
  // the coin that stands beside a number: still, glinting now and then
  mark(size) {
    this._css();
    return `<i class="gmark" aria-hidden="true" style="--s:${size}px"></i>`;
  },
  _layer() {
    let l = document.getElementById('goldFx');
    if (!l) {
      this._css();
      l = document.createElement('div');
      l.id = 'goldFx';
      l.setAttribute('aria-hidden', 'true');
      document.body.appendChild(l);
    }
    return l;
  },
  _flights: [],
  _raf: 0,
  // every coin in the air is let go (a screen left, a skip)
  stop() {
    for (const f of this._flights) { for (const p of f.coins) if (p.el) p.el.remove(); f.dead = true; }
    this._flights = [];
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  },
  /* fly(opts): coins from opts.from ({x, y}, viewport px) to opts.to (a
     function answering {x, y}, asked as each coin homes, so a target that
     moves is still met). opts.n coins, opts.size px; opts.burst throws them
     up and out first (the plinth); else they stream (the purse). onEach(i)
     as each lands, onDone() after the last. Under reduced motion nothing
     flies: onEach for every coin, then onDone, at once. */
  fly(opts) {
    const n = Math.max(1, opts.n | 0), done = opts.onDone || (() => {}), each = opts.onEach || (() => {});
    if (this.reduced() || opts.calm) { for (let i = 0; i < n; i++) each(i, n); done(); return null; }
    const layer = this._layer(), size = opts.size || 28, t0 = performance.now();
    const f = { coins: [], landed: 0, n, each, done, burst: !!opts.burst, to: opts.to, dead: false };
    for (let i = 0; i < n; i++) {
      const el = this.coin(size);
      el.style.transform = `translate(${opts.from.x - size / 2}px, ${opts.from.y - size / 2}px)`;
      layer.appendChild(el);
      // a burst: thrown up and out under gravity, then drawn home in turn;
      // a stream: away in a line, each a beat after the last
      const a = (-Math.PI / 2) + (Math.random() - 0.5) * 2.5, v = 430 + Math.random() * 380;
      f.coins.push({
        el, size, x0: opts.from.x + (f.burst ? (Math.random() - 0.5) * size : 0), y0: opts.from.y,
        vx: f.burst ? Math.cos(a) * v * 0.8 : (Math.random() - 0.5) * 90,
        vy: f.burst ? Math.sin(a) * v : -120 - Math.random() * 120,
        t1: f.burst ? 0.42 + Math.random() * 0.26 + i * 0.012 : 0.06 + i * 0.045,   // free flight, s
        t2: f.burst ? 0.46 + i * 0.03 : 0.42 + Math.random() * 0.1,                 // homing, s
        start: t0, bx: 0, by: 0, home: null, out: false,
      });
    }
    this._flights.push(f);
    if (f.burst) this.flash(opts.from, size * 4.2);
    if (!this._raf) this._raf = requestAnimationFrame(now => this._tick(now));
    return f;
  },
  /* a breath of warm light where coins burst or land: smooth, at the
     device's pixels, gone in half a second (the effects rule) */
  flash(at, d) {
    if (!at || this.reduced()) return;
    const l = this._layer(), e = document.createElement('i');
    e.className = 'gflash';
    e.style.cssText = `width:${d}px;height:${d}px;transform:translate(${at.x - d / 2}px, ${at.y - d / 2}px)`;
    l.appendChild(e);
    try {
      const a = e.animate([{ opacity: 0, scale: 0.4 }, { opacity: 0.95, scale: 1, offset: 0.22 }, { opacity: 0, scale: 1.35 }],
        { duration: 620, easing: 'ease-out' });
      a.onfinish = () => e.remove();
    } catch (err) { e.remove(); }
    setTimeout(() => e.remove(), 900);
  },
  _tick(now) {
    this._raf = 0;
    const G = 1500;
    for (const f of this._flights) {
      if (f.dead) continue;
      for (const p of f.coins) {
        if (p.out) continue;
        const t = (now - p.start) / 1000;
        let x, y, s = 1;
        if (t < p.t1) {
          x = p.x0 + p.vx * t; y = p.y0 + p.vy * t + 0.5 * G * t * t * (f.burst ? 1 : 0.4);
        } else {
          if (!p.home) {
            const t1 = p.t1;
            p.bx = p.x0 + p.vx * t1; p.by = p.y0 + p.vy * t1 + 0.5 * G * t1 * t1 * (f.burst ? 1 : 0.4);
            p.home = true;
          }
          let to = { x: p.bx, y: p.by };
          try { to = f.to() || to; } catch (e) {}
          const k = Math.min(1, (t - p.t1) / p.t2), e = k * k * (3 - 2 * k), ea = k * k;
          // an arc above the straight line, the coin shrinking into the purse
          const lift = Math.sin(Math.PI * k) * (f.burst ? 50 : 70);
          x = p.bx + (to.x - p.bx) * e;
          y = p.by + (to.y - p.by) * ea - lift;
          s = 1 - 0.32 * k;
          if (k >= 1) {
            p.out = true;
            p.el.remove();
            f.landed++;
            try { f.each(f.landed - 1, f.n); } catch (err) {}
            if (f.landed >= f.n) { f.dead = true; try { f.done(); } catch (err) {} }
            continue;
          }
        }
        p.el.style.transform = `translate(${(x - p.size / 2).toFixed(1)}px, ${(y - p.size / 2).toFixed(1)}px) scale(${s.toFixed(3)})`;
      }
    }
    this._flights = this._flights.filter(f => !f.dead);
    if (this._flights.length) this._raf = requestAnimationFrame(t => this._tick(t));
  },
  // how many coins a sum is thrown as: a handful at least, never a blizzard
  coinsFor(amount) { return Math.max(12, Math.min(26, Math.round((+amount || 0) / 4))); },
  // the centre of an element, in viewport px
  at(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
  /* a number that steps from `from` toward `to` as coins land: step(k) sets
     the share landed (0..1); the purse total follows it */
  pop(el) {
    if (!el || this.reduced()) return;
    try { el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' }); } catch (e) {}
  },
  // the last coin home: a settle with a slight overshoot
  settle(el) {
    if (!el || this.reduced()) return;
    try {
      el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.24)', offset: 0.32 }, { transform: 'scale(0.95)', offset: 0.62 },
        { transform: 'scale(1.03)', offset: 0.82 }, { transform: 'scale(1)' }], { duration: 560, easing: 'ease-out' });
    } catch (e) {}
  },
  sound(kind) { try { if (typeof Sound !== 'undefined' && Sound.play) Sound.play(kind); } catch (e) {} },

  CSS() {
    const S = this.art('coin-spin'), C = this.art('coin'), L = this.art('coin-glint');
    // the glint plays its eight frames in the first fifth of a 5 s loop, then rests
    let gl = '';
    for (let i = 0; i <= 8; i++) gl += `${(i * 2.5).toFixed(1)}% { background-position: calc(var(--s) * -${Math.min(i, 7)}) 0; }\n`;
    return `
#goldFx { position: fixed; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; contain: strict; }
.gcoin { position: absolute; left: 0; top: 0; width: var(--s); height: var(--s); display: block;
  background: url("${S}") 0 0 / calc(var(--s) * 16) var(--s) no-repeat;
  animation: gspin .72s steps(16) infinite; will-change: transform;
  filter: drop-shadow(0 2px 1px rgba(0,0,0,.55)); }
.gflash { position: absolute; left: 0; top: 0; display: block; border-radius: 50%; pointer-events: none; opacity: 0;
  background: radial-gradient(closest-side, rgba(255,246,206,0.9), rgba(255,214,110,0.55) 38%, rgba(255,170,60,0.18) 66%, rgba(255,150,40,0)); }
.gcoin.still { animation: none; background-image: url("${C}"); background-size: var(--s) var(--s); }
@keyframes gspin { to { background-position: calc(var(--s) * -16) 0; } }
.gmark { display: inline-block; flex: 0 0 auto; width: var(--s); height: var(--s); vertical-align: middle;
  background: url("${L}") 0 0 / calc(var(--s) * 8) var(--s) no-repeat;
  animation: gglint 5s steps(1) infinite; filter: drop-shadow(0 1px 1px rgba(0,0,0,.6)); }
@keyframes gglint {
${gl}  100% { background-position: 0 0; }
}
@media (prefers-reduced-motion: reduce) { .gmark { animation: none; } .gcoin { animation: none; } }
/* the Store's plate on the title: the purse at its right, the word centred */
#btnTitleStore .tPurse { position: absolute; right: 18px; top: 50%; translate: 0 -50%; display: flex; align-items: center; gap: 6px;
  pointer-events: none; }
#btnTitleStore .tGoldN { font: 700 18px/1 var(--numfont); letter-spacing: 0; color: #ffe7a0; font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 0 #000, 0 0 8px rgba(255,200,80,0.3); }
@media (max-width: 359px) { #btnTitleStore .tPurse { right: 12px; } #btnTitleStore .tGoldN { font-size: 16px; } }
/* the Settings page's purse (js/settings.js) */
#scrSetx .sxGold { display: flex; align-items: center; gap: 7px; flex: 0 0 auto; font: 700 24px/1 var(--numfont); color: #ffe7a0;
  text-shadow: 0 1px 0 #000; font-variant-numeric: tabular-nums; }
`;
  },
};
window.Gold = Gold;
