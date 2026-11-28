'use strict';
/* THE MARKETPLACE (#scrStore; js/gold.js, migrations 0019 + 0020;
   tests/gold.mjs — operator, build 225: "a unified 'Marketplace'; you see
   the shop keeper and he has some buttons available… then you click the
   button you want, and then… the black rectangle and either the cards you
   want to buy or the cards you own… Something integrated where the cards
   feel more like part of the world… the ability to Sell… Sell should go for
   20% less than the buy rate… devolve the technology of the shop keeper to
   the second age… the hut plus the guy with the two beard braids… we don't
   need the cards to have different text appearing next to the cards… when
   you click they get bigger and flip around so you can read the back…
   you see the front for half a second and then it flips… take up the space
   over the deck… have the shopkeeper comment on the card"; then: "make him
   almost twice as big so he fits the space better… now there's only one
   button for the shopkeeper, not 2").
   - THE HALL: a timber trading hut of the second age (assets/ui/store/hut-
     {wide,tall}, PixelLab, Scale2x'd like the night; the masters in
     assets/masters/store/), the trader standing BEHIND its counter — his
     picture (assets/ui/store/trader.png, 256px drawn at the hut's own
     density, Scale2x'd with it) laid between the painting and a copy of the
     painting cut to the counter, so the counter hides his legs. Store.layout
     places the hall for the window: a portrait window wears the tall hut, a
     landscape one the wide; the hall COVERS the window and the trader is
     always in view (GEO: each painting's counter line and his place).
   - THE THREE OFFERS (the landing): Buy, Sell and Your Deck, signs on the
     counter's front; his speech bubble greets the chief by name.
   - THE CASE: the album's black panel in the settings page's carved gold
     rim, on the counter (a phone) or beside him (a wide window): the three
     modes as tabs, the five tiers as tabs that jump the shelf and light the
     tier in view, then every card of the mode at whole device pixels —
     BUY every card of the catalog with its price (short of the purse: red,
     and how much more), SELL every card held with what the trader pays and
     how many are held, DECK every card, the ones not found yet dark.
   - A CARD HELD UP: a tap lifts it over the case (Deck.lookFit), face up,
     and half a second later it turns to its back (FLIP_MS; reduced motion:
     its back at once); a tap on it turns it again. Under it BUY or SELL and
     Put back; the trader says something about it. Over CFG.GOLD.CONFIRM_OVER
     — and for the last copy a deck holds — the first tap only arms it, and
     a second tap inside 400 ms is a double-tap, not a decision. Short of
     gold the button still answers: it shakes and says how much more.
   - THE MAIN MENU'S ALONE (Store.allowed): opened from the title or the
     title's Settings, never over a game, never on the journey's title.
   - THE PURCHASE and THE SALE are Gold.buy's and Gold.sell's (one
     transaction on the record each); the coins and the card's flight are
     their picture, played after the bookkeeping. */
const Store = {
  el: null,
  _from: 'title',
  _mode: 'land',      // 'land' | 'buy' | 'sell' | 'own'
  _id: null,          // the card held up
  _armedAt: 0,        // when a deal was armed (0: not armed)
  _anim: false,       // a deal is being shown
  _shown: 0,          // the purse as the screen last painted it
  _key: '',           // the painting worn ('wide' | 'tall')
  _flipT: 0,
  CONFIRM_GAP_MS: 400,
  FLIP_MS: 500,
  // the held card's box ends this far inside the case's foot (its gold trim), and
  // the deal under the card takes this much of it: gap, buttons, the note line, padding
  LOOK_RIM: 8, LOOK_DEAL: 97,
  NAME: 'Old Bran',
  /* the paintings' own geometry, in MASTER pixels: the counter's top edge
     (`top`), the foot of its front lip (`front`), where the trader stands
     (`tx`, his middle), and where the counter's front may be carried on
     down the window (`cut`: the row its planks are cut at, `tile`: the
     height of counter-{wide,tall}.png, a band of those planks and its mirror,
     so it repeats without a seam — build 226, the operator: "Make sure the
     shop keepers table goes to the bottom of the screen"). TR is his picture:
     256px square at the hut's own density, his feet on row `foot`, his crown
     on row `head`, half his width `half`. */
  GEO: {
    wide: { w: 688, h: 384, top: 280, front: 326, tx: 250, cut: 352, tile: 64 },
    tall: { w: 384, h: 688, top: 457, front: 507, tx: 178, cut: 560, tile: 160 },
  },
  TR: { size: 256, foot: 208, head: 15, half: 106, face: 46 },

  allowed() {
    if (!(window.Gold && Gold.on()) || typeof Screens === 'undefined') return false;
    const t = document.getElementById('scrTitle');
    if (t && t.classList.contains('pro')) return false;   // the journey keeps to its path
    const cur = Screens.current;
    if (cur === 'title' || cur === 'store') return true;
    return cur === 'settings' && !(window.SettingsPage && SettingsPage.inGame);
  },
  open(from, mode) {
    if (!this.allowed()) return false;
    this._from = from === 'settings' ? 'settings' : 'title';
    this._mode = ['buy', 'sell', 'own'].includes(mode) ? mode : 'land';
    Screens.show('store');
    return Screens.current === 'store';
  },
  // leaves the Marketplace (to the title, or the Settings it was opened from)
  back() {
    this.closeLook(true);
    if (window.Gold) Gold.stop();
    Screens.show(this._from === 'settings' ? 'settings' : 'title');
  },
  // one step back: a card held is put back, a mode returns to the offers, the offers leave
  step() {
    if (this._anim) return;
    if (this._id) return this.closeLook(false);
    if (this._mode !== 'land') return this.setMode('land');
    this.back();
  },

  /* ---------------- the screen ---------------- */
  mount() {
    if (this.el) return this.el;
    this._css();
    const scr = document.createElement('div');
    scr.className = 'screen';
    scr.id = 'scrStore';
    scr.style.setProperty('--plank', `url("${this._art('sign.png')}")`);
    const C = window.SettingsPage && SettingsPage.cornerSvg ? SettingsPage : null;
    scr.innerHTML =
      '<div class="mkScene" aria-hidden="true">' +
        '<img class="mkBg" alt="" decoding="async">' +
        `<img class="mkTrader" alt="" decoding="async" src="${this._art('trader.png')}">` +
        '<img class="mkBg mkOver" alt="" decoding="async">' +
        '<i class="mkExt"></i>' +
      '</div>' +
      '<i class="mkSb" aria-hidden="true"></i>' +
      '<header class="stHead">' +
        '<button class="stBack" type="button" data-act="step" aria-label="Back"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg></button>' +
        '<div class="stTitle"><h2>Marketplace</h2><small class="stSub">The trader’s hall</small></div>' +
        '<div class="stPurse" role="status" aria-live="polite">' +
          `<img class="stPurseImg" src="${window.Gold ? Gold.art('purse') : ''}" alt="" onerror="this.remove()">` +
          '<b><span class="stGold">0</span></b><span class="stPurseW">gold</span></div>' +
      '</header>' +
      '<div class="mkSay" role="status" aria-live="polite"><b class="mkWho"></b><span class="mkSayT"></span></div>' +
      '<div class="mkOffers">' +
        `<button class="mkOffer" type="button" data-act="mode" data-mode="buy"><i class="mkOi"><img src="${this._art('coins.png')}" alt=""></i><span><b>Buy</b><small>Cards for gold</small></span>${this.GO}</button>` +
        `<button class="mkOffer" type="button" data-act="mode" data-mode="sell"><i class="mkOi"><img src="${window.Gold ? Gold.art('purse') : ''}" alt=""></i><span><b>Sell</b><small>Gold for your cards</small></span>${this.GO}</button>` +
        `<button class="mkOffer" type="button" data-act="mode" data-mode="own"><i class="mkOi"><img src="${this._art('deck.png')}" alt=""></i><span><b>Your Deck</b><small class="mkFound"></small></span>${this.GO}</button>` +
      '</div>' +
      '<div class="stCase" hidden>' +
        (C ? [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="stC ${c}">${C.cornerSvg('stc' + c, fx, fy)}</i>`).join('') : '') +
        '<div class="stModes" role="tablist">' +
          `<button class="stMode" type="button" role="tab" data-act="mode" data-mode="buy"><img src="${this._art('coins.png')}" alt=""><span>Buy</span></button>` +
          `<button class="stMode" type="button" role="tab" data-act="mode" data-mode="sell"><img src="${window.Gold ? Gold.art('purse') : ''}" alt=""><span>Sell</span></button>` +
          `<button class="stMode" type="button" role="tab" data-act="mode" data-mode="own"><img src="${this._art('deck.png')}" alt=""><span><i class="stMy">Your </i>Deck</span></button>` +
        '</div>' +
        '<div class="stTiers"></div>' +
        '<div class="stPane"><div class="stShelves"></div><p class="stEmpty" hidden></p>' +
          '<button class="stHow" type="button" data-act="intro" hidden>How cards work</button></div>' +
      '</div>' +
      '<div class="stLook" hidden>' +
        '<div class="stLookCard" data-act="flip"></div>' +
        '<div class="stDeal">' +
          '<div class="stDealRow">' +
            `<button class="stBuy" type="button" data-act="deal"><img class="stBuyI" src="${this._art('coins.png')}" alt=""><span class="stBuyL">Buy</span><span class="stBuyP"></span></button>` +
            '<button class="stPut" type="button" data-act="unlook">Put back</button>' +
          '</div>' +
          '<div class="stNotes"><p class="stMsg" role="status" aria-live="polite"></p><p class="stOwn"></p></div>' +
        '</div>' +
      '</div>';
    document.getElementById('shell').appendChild(scr);
    scr.addEventListener('click', e => this._click(e));
    scr.querySelector('.stPane').addEventListener('scroll', () => this._litTier(), { passive: true });
    for (const img of scr.querySelectorAll('.mkBg')) img.addEventListener('error', () => {
      // a browser without webp, or a missing file: the png beside it
      if (/\.webp/.test(img.src)) img.src = img.src.replace('.webp', '.png');
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || typeof Screens === 'undefined' || Screens.current !== 'store') return;
      if (window.CardIntro && CardIntro.open) return;   // the announcement closes itself
      e.preventDefault();
      this.step();
    });
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (Screens.current === 'store' && !this._anim) { this.layout(); this.render(); this._placeSay(); if (this._id) this._sizeLook(); } }, 160);
    });
    if (window.Deck && Deck.onChange) Deck.onChange(() => {
      if (typeof Screens === 'undefined' || Screens.current !== 'store' || this._anim) return;
      if (this._mode === 'sell' || this._mode === 'own') this.render(); else this.paint();
    });
    this.el = scr;
    return scr;
  },
  _art(n) { return `assets/ui/store/${n}?v=${(typeof CFG !== 'undefined' && CFG.ART_V) || 1}`; },
  // the gold chevron at an offer's right end
  // burnt into the pale board like the word beside it
  GO: '<svg class="mkGo" viewBox="0 0 12 20" aria-hidden="true"><path d="M2.5 2.5 9.5 10l-7 7.5" fill="none" stroke="#2a1608" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  /* what the case and the offers must leave clear at the window's foot: the
     phone's home bar (the safe area), and a test page's TEST BUILD badge */
  _foot(H) {
    const sb = (this.el && this.el.querySelector('.mkSb').offsetHeight) || 0;
    let f = sb + 8;
    const tb = document.getElementById('testBadge');
    if (tb && tb.getClientRects().length && getComputedStyle(tb).display !== 'none') f = Math.max(f, H - tb.getBoundingClientRect().top + 6);
    return Math.round(f);
  },
  _deckSvg(cls) { return (window.DeckUI && DeckUI.deckIcon) ? DeckUI.deckIcon(cls) : ''; },
  _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  // Screens.show('store') calls in
  onShow() {
    this.mount();
    if (window.Deck) { try { Deck.ensureStarter(); } catch (e) {} }
    if (window.Gold) Gold.testLink();
    this.closeLook(true);
    this._shown = Gold.balance();
    this._applyMode(true);
    Deck.track('store', { ev: 'open', gold: Gold.balance(), from: this._from });
    // the record's purse and price list, asked as the hall opens
    if (Gold.mode() === 'cloud') {
      Deck.sync('store').then(() => {
        if (Screens.current === 'store' && !this._anim) { this._shown = Gold.balance(); this.render(); }
      }).catch(() => {});
    }
  },

  /* ---------------- the modes ---------------- */
  setMode(m) {
    if (this._anim) return;
    m = ['buy', 'sell', 'own'].includes(m) ? m : 'land';
    if (m === this._mode && !this._id) return;
    this.closeLook(true);
    this._mode = m;
    this._applyMode(false);
    this._cue('ok');
    if (m !== 'land') Deck.track('store', { ev: 'mode', mode: m, gold: Gold.balance() });
  },
  _applyMode(first) {
    const m = this._mode, el = this.el;
    el.dataset.mode = m;
    el.querySelector('.stSub').textContent = { land: 'The trader’s hall', buy: 'Buying', sell: 'Selling', own: 'Your deck' }[m];
    el.querySelector('.stCase').hidden = m === 'land';
    el.querySelector('.mkOffers').hidden = m !== 'land';
    for (const b of el.querySelectorAll('.stMode')) {
      const on = b.dataset.mode === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    // the case is placed before its cards are sized to it, the bubble after both
    this.layout();
    const pane = el.querySelector('.stPane');
    if (pane) pane.scrollTop = 0;
    this.render();
    this.say(this._line(m));
    this._litTier();
    if (!first && !Gold.reduced()) {
      const tgt = m === 'land' ? el.querySelector('.mkOffers') : el.querySelector('.stCase');
      try { tgt.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' }); } catch (e) {}
    }
  },

  /* ---------------- the trader's words ---------------- */
  _chief() {
    let n = '';
    try { if (typeof Prologue !== 'undefined' && Prologue.named) n = Prologue.named(); else n = localStorage.getItem('neo-chief') || ''; } catch (e) {}
    n = String(n || '').replace(/\s+/g, ' ').trim().replace(/^chief\s+/i, '').slice(0, 24).trim();
    return n ? 'Chief ' + this._esc(n) : 'Chief';
  },
  _found() { return Deck.CATALOG.filter(c => Deck.count(c.id) > 0).length; },
  _line(kind, id, x) {
    const c = id ? Deck.card(id) : null, nm = c ? this._esc(c.name) : '';
    const g = n => Gold.fmt(n);
    switch (kind) {
      case 'land': return `Welcome, ${this._chief()}! Come to <em>buy</em>, to <em>sell</em>, or to look over <em>your deck</em>?`;
      case 'buy': return 'Take your time. Pick up anything that catches your eye.';
      case 'sell': return this._held().length ? 'Show me what you have. I pay four fifths of my own price.' : 'You hold no cards to sell, Chief. Win a few games first.';
      case 'own': {
        const f = this._found(), all = Deck.CATALOG.length;
        return f >= all ? 'Every card in the land! A collection for the songs.' : `${f} of ${all} found. ${all - f} more out there to find.`;
      }
      case 'holdbuy': {
        const p = g(Deck.price(id));
        if (id === 'dragonfire') return `Dragonfire! Handle it with care. <em>${p} gold.</em>`;
        return ({
          stone: `${nm}. A humble card, only <em>${p} gold.</em>`,
          bronze: `${nm}, a sound choice. <em>${p} gold.</em>`,
          iron: `${nm}! Fine work, and cheap at <em>${p} gold.</em>`,
          imperial: `Ah, ${nm}. Fit for an emperor: <em>${p} gold.</em>`,
          enlight: `${nm}… I keep that one close. <em>${p} gold.</em>`,
        })[c.tier] || `${nm}. <em>${p} gold.</em>`;
      }
      case 'holdsell': return `${nm}? I’ll give you <em>${g(Gold.sellPrice(id))} gold</em> for it.`;
      case 'holdown': { const n = Deck.count(id); return n === 1 ? `${nm}. You hold one.` : `${nm}. You hold ${n}.`; }
      case 'unknown': return 'Not found yet. Win it in battle, or buy one from me.';
      case 'short': return 'Not enough gold yet, Chief. Win a few more fights.';
      case 'bought': return `${nm} is yours. A fine trade!`;
      case 'sold': return `${g(x)} gold for your ${nm}. A pleasure, Chief.`;
      default: return '';
    }
  },
  say(html) {
    const b = this.el && this.el.querySelector('.mkSay');
    if (!b) return;
    b.querySelector('.mkWho').textContent = this.NAME;
    b.querySelector('.mkSayT').innerHTML = html || '';
    b.hidden = !html;
    this._placeSay();
  },

  /* ---------------- the hall, laid out for the window ---------------- */
  _vp() {
    const de = document.documentElement;
    return { W: de.clientWidth || innerWidth || 390, H: de.clientHeight || innerHeight || 844 };
  },
  layout() {
    const el = this.el;
    if (!el) return;
    const { W, H } = this._vp(), wide = W / H >= 4 / 3, key = wide ? 'wide' : 'tall', g = this.GEO[key], T = this.TR;
    if (this._key !== key) {
      this._key = key;
      for (const img of el.querySelectorAll('.mkBg')) img.src = this._art(`hut-${key}.webp`);
    }
    const head = el.querySelector('.stHead').getBoundingClientRect().bottom;
    const sb = el.querySelector('.mkSb').offsetHeight || 0, foot = this._foot(H);
    const browse = this._mode !== 'land';
    const offers = el.querySelector('.mkOffers'), box = el.querySelector('.stCase');
    let s, x0, y0, cb = null;
    offers.classList.toggle('col', !wide);
    offers.classList.remove('side');
    if (!wide) {
      if (!browse) {
        s = Math.max(W / g.w, H / g.h);
        x0 = (W - g.w * s) / 2;
        y0 = (H - g.h * s) / 2;
        const oh = offers.offsetHeight || 220;
        const over = y0 + (g.front + 8) * s + oh + 6 + foot - H;
        if (over > 0) y0 -= over;
      } else {
        s = W / g.w;
        x0 = 0;
        const C = Math.round(Math.min(H - 300, Math.max(H * 0.37, head + 10 + (T.foot - T.head + 4) * s)));
        y0 = C - g.top * s;
        // the case ends above the home bar, its gold trim whole; the counter runs on under it
        cb = { left: 0, right: 0, top: C, bottom: foot };
      }
    } else {
      s = Math.max(W / g.w, H / g.h);
      y0 = (H - g.h * s) / 2;
      if (!browse) {
        x0 = (W - g.w * s) / 2;
        const oh = offers.offsetHeight || 66, top = y0 + (g.front + 10) * s;
        const room = H - foot - 4 - (top + oh), headTop = y0 + (g.top - T.foot + T.head) * s;
        if (room < 0) {
          const lift = Math.min(-room, Math.max(0, headTop - head - 4));
          y0 -= lift;
          if (room + lift < 0) offers.classList.add('side');   // a short window: the offers stand beside him
        }
      } else {
        const right = W >= 900 ? 24 : 12, cw = Math.round(Math.min(640, Math.max(360, W * 0.46)));
        cb = { left: W - cw - right, right, top: head + 6, bottom: Math.max((W >= 900 ? 24 : 10) + sb, foot) };
        x0 = Math.min(0, Math.max(W - g.w * s, cb.left / 2 - g.tx * s));
      }
      if (x0 === undefined) x0 = (W - g.w * s) / 2;
    }
    this._geo = { s, x0, y0, g, W, H, head, sb, foot, wide, cb };
    // the hall
    const sc = el.querySelector('.mkScene');
    Object.assign(sc.style, { left: x0 + 'px', top: y0 + 'px', width: g.w * s + 'px', height: g.h * s + 'px' });
    const dpr = Math.max(1, devicePixelRatio || 1), up = g.w * s * dpr >= g.w * 2 - 0.5;   // the file is twice the master
    sc.classList.toggle('px', up);
    const tr = el.querySelector('.mkTrader');
    Object.assign(tr.style, { left: (g.tx - T.size / 2) * s + 'px', top: (g.top - T.foot) * s + 'px', width: T.size * s + 'px', height: T.size * s + 'px' });
    el.querySelector('.mkOver').style.clipPath = `inset(${(g.top / g.h * 100).toFixed(3)}% 0 0 0)`;
    // the counter carried on to the window's foot when the painting stops short of it:
    // its own planks from `cut` down, a band and its mirror repeating (counter-{key}.png)
    const ext = el.querySelector('.mkExt'), short = y0 + g.h * s < H - 0.5;
    ext.hidden = !short;
    if (short) {
      Object.assign(ext.style, { top: g.cut * s + 'px', height: Math.ceil(H - (y0 + g.cut * s)) + 2 + 'px',
        backgroundImage: `url("${this._art('counter-' + key + '.png')}")`, backgroundSize: `${g.w * s}px ${g.tile * s}px` });
    }
    // the offers: on the counter's front, under him
    const cx = x0 + g.tx * s;
    if (!browse) {
      if (offers.classList.contains('side')) {
        const ow = offers.offsetWidth || 224, oh = offers.offsetHeight || 172;
        Object.assign(offers.style, { left: Math.min(W - ow - 12, cx + T.half * s + 16) + 'px', top: Math.max(head + 6, (head + H - foot - oh) / 2) + 'px' });
      } else if (!wide) {
        Object.assign(offers.style, { left: '0px', top: y0 + (g.front + 8) * s + 'px' });
      } else {
        const ow = offers.offsetWidth || 700;
        Object.assign(offers.style, { left: Math.max(12, Math.min(W - ow - 12, cx - ow / 2)) + 'px', top: y0 + (g.front + 10) * s + 'px' });
      }
    }
    // the case
    if (cb) {
      Object.assign(box.style, { left: cb.left + 'px', right: cb.right + 'px', top: cb.top + 'px', bottom: cb.bottom + 'px' });
      box.classList.toggle('side', wide);
      box.classList.toggle('roomy', W - cb.left - cb.right >= 520);
    }
    this._placeSay();
    this._placeLook();
  },
  // the bubble at his head: above it where there is room, else beside it, never over the offers or the case
  _placeSay() {
    const el = this.el, G = this._geo;
    if (!el || !G) return;
    const b = el.querySelector('.mkSay');
    if (b.hidden) return;
    const { s, x0, y0, g, W, H, head, wide, cb } = G, T = this.TR;
    const cx = x0 + g.tx * s, headTop = y0 + (g.top - T.foot + T.head) * s, face = T.face * s;
    const limR = cb && wide ? cb.left - 10 : W - 10;
    const avoid = [];
    const o = el.querySelector('.mkOffers');
    if (!o.hidden) avoid.push(o.getBoundingClientRect());
    if (cb) avoid.push({ left: cb.left, top: cb.top, right: W - cb.right, bottom: H - cb.bottom });
    const hits = r => avoid.some(a => r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top);
    const bw0 = Math.round(Math.min(wide ? 320 : 250, Math.max(160, (limR - 10) * 0.62)));
    const tries = [];
    // above his head, leaning right
    tries.push(bw => ({ left: Math.max(10, Math.min(limR - bw, cx - bw * 0.28)), topOf: bh => headTop - bh - 12, tail: 'b' }));
    // beside him, right then left
    tries.push(bw => ({ left: cx + face + 6, topOf: () => Math.max(head + 6, headTop - 4), tail: 'l' }));
    tries.push(bw => ({ left: cx - face - 6 - bw, topOf: () => Math.max(head + 6, headTop - 4), tail: 'r' }));
    for (const bw of [bw0, Math.max(150, Math.round(bw0 * 0.8)), 150, 132, 118]) {
      b.style.width = bw + 'px';
      b.classList.toggle('narrow', bw < 150);
      const bh = b.offsetHeight;
      for (const t of tries) {
        const p = t(bw), top = p.topOf(bh), r = { left: p.left, top, right: p.left + bw, bottom: top + bh };
        if (r.left < 8 || r.right > limR + 2 || r.top < head + 4 || r.bottom > H - 8 || hits(r)) continue;
        return this._putSay(b, r, p.tail, cx, headTop);
      }
    }
    // nothing fits cleanly: above him, clamped under the header
    b.style.width = bw0 + 'px';
    b.classList.remove('narrow');
    const bh = b.offsetHeight, left = Math.max(10, Math.min(limR - bw0, cx - bw0 * 0.28));
    this._putSay(b, { left, top: Math.max(head + 4, headTop - bh - 12) }, 'b', cx, headTop);
  },
  _putSay(b, r, tail, cx, headTop) {
    b.style.left = Math.round(r.left) + 'px';
    b.style.top = Math.round(r.top) + 'px';
    b.dataset.tail = tail;
    const w = b.offsetWidth, h = b.offsetHeight;
    b.style.setProperty('--tx', Math.max(16, Math.min(w - 28, cx - r.left - 6)) + 'px');
    b.style.setProperty('--ty', Math.max(10, Math.min(h - 26, headTop + 30 - r.top)) + 'px');
  },

  /* ---------------- the case ---------------- */
  // the card's size on the shelf: whole device pixels (Deck.fit), as many to a row as the case holds at a readable size
  _grid() {
    const pane = this.el.querySelector('.stShelves');
    const avail = Math.max(200, (pane && pane.clientWidth) || 300);
    for (const cols of [6, 5, 4, 3, 2]) {
      const gap = cols >= 3 ? 3 : 4, f = Deck.fit((avail - gap * (cols - 1)) / cols);
      if (f.w >= 108 && f.w * cols + gap * (cols - 1) <= avail + 0.01) return { cols, w: f.w };
    }
    return { cols: 2, w: Deck.fit((avail - 4) / 2).w };
  },
  _held() { return Deck.CATALOG.filter(c => Deck.count(c.id) > 0); },
  _cards(t) {
    const all = Deck.CATALOG.filter(c => c.tier === t.k && Deck.price(c.id) > 0);
    return this._mode === 'sell' ? all.filter(c => Deck.count(c.id) > 0) : all;
  },
  render() {
    if (!this.el) return;
    const m = this._mode;
    this.el.querySelector('.mkFound').textContent = `${this._found()} of ${Deck.CATALOG.length} cards found`;
    const host = this.el.querySelector('.stShelves'), tiers = this.el.querySelector('.stTiers');
    const empty = this.el.querySelector('.stEmpty');
    host.textContent = '';
    tiers.textContent = '';
    if (m === 'land') { this.paint(); return; }
    const pane = this.el.querySelector('.stPane'), keep = pane.scrollTop;
    const g = this._grid();
    host.style.setProperty('--cols', g.cols);
    host.style.setProperty('--cw', g.w + 'px');
    let any = 0;
    for (const t of Deck.TIERS) {
      // a tier's tab is its gem and its name (build 226: its prices and counts were "too messy")
      const cards = this._cards(t);
      const tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'stTier' + (cards.length ? '' : ' none');
      tb.dataset.act = 'tier';
      tb.dataset.tier = t.k;
      tb.style.setProperty('--tc', t.col);
      tb.innerHTML = `<span class="stTn">${window.DeckUI && DeckUI.gemIcon ? DeckUI.gemIcon('stGem') : ''}${this._esc(t.name)}</span>`;
      tb.setAttribute('aria-label', `${t.name}: ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`);
      tiers.appendChild(tb);
      if (!cards.length) continue;
      any += cards.length;
      const sec = document.createElement('section');
      sec.className = 'stShelf';
      sec.dataset.tier = t.k;
      sec.style.setProperty('--tc', t.col);
      sec.innerHTML = '<div class="stWares"></div>';
      const wares = sec.querySelector('.stWares');
      for (const c of cards) {
        const n = Deck.count(c.id), unknown = m === 'own' && !n;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'stItem' + (unknown ? ' unknown' : '');
        b.dataset.card = c.id;
        b.dataset.act = 'look';
        b.appendChild(Deck.face(c.id, unknown ? { w: g.w, unknown: true } : { w: g.w }));
        // under a ware its price alone, red when the purse is short of it (build 226)
        if (m === 'buy') b.insertAdjacentHTML('beforeend', `<span class="stTag">${Gold.mark(15)}<b class="stP"></b></span>`);
        else if (m === 'sell') b.insertAdjacentHTML('beforeend', `<span class="stTag">${Gold.mark(15)}<b class="stP"></b><i class="stHave"></i></span>`);
        else b.insertAdjacentHTML('beforeend', `<span class="stTag own"><i class="stHave"></i></span>`);
        wares.appendChild(b);
      }
      host.appendChild(sec);
    }
    empty.hidden = !!any;
    this.el.querySelector('.stHow').hidden = !(m === 'own' && window.CardIntro);
    empty.textContent = any ? '' : (m === 'sell' ? 'Nothing to sell yet. Win games to earn cards.' : '');
    this.paint();
    pane.scrollTop = keep;
    this._litTier();
  },
  // the numbers only: the purse, each card's price, what is short, how many are held
  paint() {
    if (!this.el) return;
    const gold = this._anim ? this._shown : Gold.balance();
    if (!this._anim) this._shown = gold;
    this.el.querySelector('.stGold').textContent = Gold.fmt(gold);
    this.el.querySelector('.mkFound').textContent = `${this._found()} of ${Deck.CATALOG.length} cards found`;
    const m = this._mode;
    for (const b of this.el.querySelectorAll('.stItem')) {
      const id = b.dataset.card, c = Deck.card(id), n = Deck.count(id);
      if (m === 'buy') {
        const p = Deck.price(id), short = p > gold;
        b.classList.toggle('short', short);
        b.querySelector('.stP').textContent = Gold.fmt(p);
        b.setAttribute('aria-label', `${c.name}, ${Gold.fmt(p)} gold` + (short ? ', more than your purse holds' : ''));
      } else if (m === 'sell') {
        const p = Gold.sellPrice(id);
        b.querySelector('.stP').textContent = Gold.fmt(p);
        b.querySelector('.stHave').textContent = '×' + n;
        b.setAttribute('aria-label', `${c.name}, sells for ${Gold.fmt(p)} gold, ${n} held`);
      } else {
        b.querySelector('.stHave').textContent = n ? (n === 1 ? 'One in your deck' : n + ' in your deck') : 'Not found yet';
        b.setAttribute('aria-label', n ? `${c.name}, ${n} in your deck` : 'A card not found yet');
      }
    }
    if (this._id) this._paintDeal();
  },
  // the tier in view is the lit tab
  _litTier() {
    if (!this.el || this._mode === 'land') return;
    const pane = this.el.querySelector('.stPane'), top = pane.getBoundingClientRect().top + 8;
    let lit = null;
    for (const sec of pane.querySelectorAll('.stShelf')) { if (sec.getBoundingClientRect().top <= top + 40 || !lit) lit = sec.dataset.tier; }
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) {
      const last = [...pane.querySelectorAll('.stShelf')].pop();
      if (last && last.getBoundingClientRect().top < pane.getBoundingClientRect().bottom - 60) lit = last.dataset.tier;
    }
    for (const t of this.el.querySelectorAll('.stTier')) t.classList.toggle('on', t.dataset.tier === lit);
  },
  jumpTier(k) {
    const pane = this.el.querySelector('.stPane'), sec = pane.querySelector(`.stShelf[data-tier="${k}"]`);
    if (!sec) return;
    const y = sec.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 2;
    try { pane.scrollTo({ top: y, behavior: Gold.reduced() ? 'auto' : 'smooth' }); } catch (e) { pane.scrollTop = y; }
    for (const t of this.el.querySelectorAll('.stTier')) t.classList.toggle('on', t.dataset.tier === k);
  },

  /* ---------------- a card held up ---------------- */
  // where the held card may stand: over the case, rising a little above it on a phone
  _lookBox() {
    const G = this._geo;
    if (!G || !G.cb) return null;
    const { W, H, cb, head, wide, s, y0, g } = G, T = this.TR;
    // on a phone it may rise over the counter, never over his face
    const chin = y0 + (g.top - T.foot + T.head + 96) * s;
    const rise = wide ? 0 : Math.max(0, Math.min(cb.top - head - 8, cb.top - chin - 6));
    // and down to the case's foot, inside its gold frame (the deal's last line
    // drawn across the trim was build 226's), never into the home bar
    const bottom = Math.max(G.sb || 0, cb.bottom + this.LOOK_RIM);
    return { left: cb.left, right: cb.right, top: cb.top - rise, bottom, w: W - cb.left - cb.right, h: H - bottom - (cb.top - rise) };
  },
  // a short case (a phone on its side) stands the deal beside the card, not under it
  _lookRow(B) { return !!B && B.h < 440 && B.w >= 360; },
  _placeLook() {
    const L = this.el && this.el.querySelector('.stLook'), B = this._lookBox();
    if (!L || !B) return;
    Object.assign(L.style, { left: B.left + 'px', right: B.right + 'px', top: B.top + 'px', bottom: B.bottom + 'px' });
    L.classList.toggle('row', this._lookRow(B));
  },
  lookRoom() {
    const B = this._lookBox();
    if (!B) return 260;
    if (this._lookRow(B)) return Math.min(B.w - 200, 352, (B.h - 20) * Deck.W / Deck.H);
    return Math.min(B.w - 28, 352, (B.h - this.LOOK_DEAL) * Deck.W / Deck.H);
  },
  /* the held card: as big as the room over the case allows, at whole device
     pixels, its back's words at the size a closer look reads them (LOOK_TU) */
  _lookFit() {
    const w = Deck.fit(Math.max(120, this.lookRoom())).w;
    return { w, tu: Math.max(w / Deck.W, Deck.LOOK_TU || 2) };
  },
  _sizeLook() {
    const L = this.el.querySelector('.stLook'), f = L.querySelector('.ccard');
    if (!f || !this._id) return;
    const lf = this._lookFit();
    const face = Deck.face(this._id, { w: lf.w, back: f.classList.contains('flip') });
    f.replaceWith(face);
    Deck.backText(face, lf.tu);
    this._settleLook();
  },
  // nothing of the deal may spill past the case's frame (a long word wraps a line):
  // the card a whole step smaller until it all fits
  _settleLook() {
    const L = this.el && this.el.querySelector('.stLook');
    if (!L || L.hidden || !this._id || L.classList.contains('row')) return;
    for (let i = 0; i < 3 && L.scrollHeight > L.clientHeight + 1; i++) {
      const f = L.querySelector('.ccard'), was = f ? f.offsetWidth : 0, w = Deck.fit(was - 1).w;
      if (!f || w >= was || w < 100) return;
      const face = Deck.face(this._id, { w, back: f.classList.contains('flip') });
      f.replaceWith(face);
      Deck.backText(face, Math.max(w / Deck.W, Deck.LOOK_TU || 2));
    }
  },
  look(id, from) {
    if (!Deck.card(id) || this._anim) return;
    if (this._mode === 'land') { this._mode = 'buy'; this._applyMode(true); }
    const m = this._mode, n = Deck.count(id);
    if (m === 'own' && !n) { this.say(this._line('unknown')); this._cue('no'); return; }
    if (m === 'sell' && !n) return;
    this._placeLook();
    const L = this.el.querySelector('.stLook'), host = L.querySelector('.stLookCard');
    const lf = this._lookFit(), calm = Gold.reduced();
    const face = Deck.face(id, { w: lf.w, back: calm });
    host.innerHTML = '';
    host.appendChild(face);
    this._id = id;
    this._armedAt = 0;
    L.hidden = false;
    this.el.querySelector('.stCase').classList.add('holding');
    Deck.backText(face, lf.tu);
    this._msg('');
    this._paintDeal();
    this._settleLook();
    this.say(this._line('hold' + m, id));
    this._cue('ok');
    clearTimeout(this._flipT);
    // face up for half a second, then it turns to its back (the face in the host
    // then: a resize or the settling may have redrawn it)
    if (!calm) this._flipT = setTimeout(() => { const fc = host.querySelector('.ccard'); if (this._id === id && fc) fc.classList.add('flip'); }, this.FLIP_MS);
    if (calm || !from) return;
    const card = host.querySelector('.ccard') || face;
    const a = from.getBoundingClientRect(), b = card.getBoundingClientRect();
    const s = a.width / b.width, dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    try {
      card.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.32,.5,1)' });
      L.querySelector('.stDeal').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    } catch (e) {}
  },
  closeLook(now) {
    const L = this.el && this.el.querySelector('.stLook');
    const had = this._id;
    this._id = null;
    this._armedAt = 0;
    clearTimeout(this._flipT);
    if (!L || L.hidden) return;
    const box = this.el.querySelector('.stCase');
    const done = () => { if (this._id) return; L.hidden = true; L.querySelector('.stLookCard').innerHTML = ''; box.classList.remove('holding'); };
    if (had && !now && this._mode !== 'land') this.say(this._line(this._mode));
    if (now || Gold.reduced()) { done(); return; }
    try { const a = L.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' }); a.onfinish = done; } catch (e) {}
    setTimeout(done, 240);
  },
  _paintDeal() {
    const id = this._id;
    if (!id || !this.el) return;
    const L = this.el.querySelector('.stLook'), btn = L.querySelector('.stBuy'), m = this._mode;
    const gold = this._anim ? this._shown : Gold.balance(), n = Deck.count(id), armed = !!this._armedAt;
    btn.hidden = m === 'own';
    btn.classList.toggle('sell', m === 'sell');
    const ico = btn.querySelector('.stBuyI'), want = m === 'sell' ? Gold.art('purse') : this._art('coins.png');
    if (ico && ico.getAttribute('src') !== want) ico.setAttribute('src', want);
    L.querySelector('.stPut').textContent = m === 'own' ? 'Back to the deck' : 'Put back';
    if (m === 'buy') {
      const p = Deck.price(id), short = p > gold;
      btn.classList.toggle('short', short);
      btn.classList.toggle('armed', armed && !short);
      btn.querySelector('.stBuyL').textContent = this._anim ? 'Bought' : (armed && !short ? 'Tap again' : 'Buy');
      btn.querySelector('.stBuyP').innerHTML = `${Gold.mark(18)}<b>${Gold.fmt(p)}</b>`;
      btn.setAttribute('aria-label', `Buy ${Deck.card(id).name} for ${Gold.fmt(p)} gold`);
      L.querySelector('.stOwn').textContent = n ? (n === 1 ? 'One already in your deck' : n + ' already in your deck') : 'None in your deck yet';
      if (short && !this._anim && !L.querySelector('.stMsg').textContent) this._msg('Not enough gold yet', 'short');
    } else if (m === 'sell') {
      const p = Gold.sellPrice(id);
      btn.classList.remove('short');
      btn.classList.toggle('armed', armed);
      btn.querySelector('.stBuyL').textContent = this._anim ? 'Sold' : (armed ? 'Tap again' : 'Sell');
      btn.querySelector('.stBuyP').innerHTML = `${Gold.mark(18)}<b>${Gold.fmt(p)}</b>`;
      btn.setAttribute('aria-label', `Sell ${Deck.card(id).name} for ${Gold.fmt(p)} gold`);
      L.querySelector('.stOwn').textContent = (n === 1 ? 'Your only one' : n + ' in your deck') + ' · his price ' + Gold.fmt(Deck.price(id));
    } else {
      L.querySelector('.stOwn').textContent = n === 1 ? 'One in your deck' : n + ' in your deck';
    }
  },
  _msg(t, kind) {
    const m = this.el && this.el.querySelector('.stLook .stMsg');
    if (!m) return;
    m.textContent = t || '';
    m.dataset.k = kind || '';
    if (t && !this._anim) this._settleLook();
  },

  /* ---------------- the deal ---------------- */
  _tapDeal() { return this._mode === 'sell' ? this._tapSell() : this._tapBuy(); },
  // a dear deal (or the last copy sold) arms on the first tap; a second inside CONFIRM_GAP_MS is the same tap twice
  _arm(ask) {
    const now = performance.now();
    if (!this._armedAt) { this._armedAt = now; this._msg(ask, 'ask'); this._paintDeal(); this._cue('ok'); return false; }
    return now - this._armedAt >= this.CONFIRM_GAP_MS;
  },
  async _tapBuy() {
    const id = this._id;
    if (!id || this._anim || (window.Gold && Gold._buying)) return;
    const L = this.el.querySelector('.stLook'), btn = L.querySelector('.stBuy');
    const p = Deck.price(id), gold = Gold.balance();
    // SHORT: the button answers — it shakes and says what is missing
    if (p > gold) {
      this._shake(btn);
      this._msg('Not enough gold yet. Finish games to earn more.', 'short');
      this.say(this._line('short', id, p - gold));
      this._cue('no');
      Deck.track('store', { ev: 'short', card: id, tier: Deck.card(id).tier, price: p, gold, need: p - gold });
      return;
    }
    if (p > ((CFG.GOLD && CFG.GOLD.CONFIRM_OVER) || 200) && !this._arm('Spend ' + Gold.fmt(p) + ' gold on this card?')) return;
    btn.classList.add('busy');
    btn.querySelector('.stBuyL').textContent = 'Buying…';
    this._msg('');
    const before = gold;
    const r = await Gold.buy(id);
    btn.classList.remove('busy');
    if (!r.ok) {
      this._armedAt = 0;
      if (r.reason === 'busy') { this._paintDeal(); return; }
      this._shake(btn);
      this._msg(Gold.why(r), r.reason === 'not_enough' ? 'short' : 'warn');
      this._cue('no');
      if (r.reason === 'not_enough') Deck.track('store', { ev: 'short', card: id, tier: Deck.card(id).tier, price: r.price, gold: r.gold, need: r.need });
      this.paint();
      return;
    }
    this._armedAt = 0;
    await this._showBuy(id, before, r);
  },
  async _tapSell() {
    const id = this._id;
    if (!id || this._anim || (window.Gold && Gold._buying)) return;
    const L = this.el.querySelector('.stLook'), btn = L.querySelector('.stBuy');
    const p = Gold.sellPrice(id), n = Deck.count(id);
    if (n < 1) { this.closeLook(false); return; }
    if ((n === 1 || p > ((CFG.GOLD && CFG.GOLD.CONFIRM_OVER) || 200))
        && !this._arm(n === 1 ? 'Your only one. Sell it for ' + Gold.fmt(p) + ' gold?' : 'Sell it for ' + Gold.fmt(p) + ' gold?')) return;
    btn.classList.add('busy');
    btn.querySelector('.stBuyL').textContent = 'Selling…';
    this._msg('');
    const before = Gold.balance();
    const r = await Gold.sell(id);
    btn.classList.remove('busy');
    if (!r.ok) {
      this._armedAt = 0;
      if (r.reason === 'busy') { this._paintDeal(); return; }
      this._shake(btn);
      this._msg(r.reason === 'not_yet' ? 'The trader isn’t buying cards yet. Your deck is safe.' : r.reason === 'network' ? 'Couldn’t reach the trader. Your deck is safe — try again.' : Gold.why(r), 'warn');
      this._cue('no');
      this.paint();
      return;
    }
    this._armedAt = 0;
    await this._showSell(id, before, r);
  },
  _shake(el) {
    if (!el || Gold.reduced()) return;
    try { el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'ease-out' }); } catch (e) {}
  },
  // the card leaves the look: into the deck (a purchase) or to the trader's hands (a sale)
  _flyCard(face, to, done) {
    const a = face.getBoundingClientRect(), d = to.getBoundingClientRect();
    const fly = face.cloneNode(true);
    fly.classList.add('stFlying');
    Object.assign(fly.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', margin: 0, zIndex: 70, pointerEvents: 'none' });
    document.body.appendChild(fly);
    face.style.visibility = 'hidden';
    const s = Math.max(0.08, d.height / a.height), dx = d.left + d.width / 2 - (a.left + a.width / 2), dy = d.top + d.height / 2 - (a.top + a.height / 2);
    let ended = false;
    const end = () => { if (ended) return; ended = true; fly.remove(); done(); };
    try {
      const an = fly.animate([
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 40}px) scale(${0.55 + s * 0.2}) rotate(-8deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(4deg)`, opacity: 0.2 }],
        { duration: 620, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
      an.onfinish = end;
    } catch (e) { end(); }
    setTimeout(end, 900);
  },
  /* THE PURCHASE, SHOWN: coins leave the purse for the card, the purse
     counting down as each lands; then the card flies into the deck. The
     purchase was made before the first coin moved — leaving mid-flight
     loses nothing. */
  _showBuy(id, before, r) {
    return new Promise(resolve => {
      const L = this.el.querySelector('.stLook'), face = L.querySelector('.stLookCard .ccard');
      const goldEl = this.el.querySelector('.stGold'), purse = this.el.querySelector('.stPurseImg') || goldEl;
      const after = r.gold, spent = Math.max(0, before - after);
      this._anim = true;
      this._shown = before;
      this._paintDeal();
      const finish = () => {
        this._anim = false;
        this._shown = Gold.balance();
        this.closeLook(true);
        this.say(this._line('bought', id));
        this.paint();
        resolve();
      };
      if (Gold.reduced() || !face) { this._cue('buy'); finish(); return; }
      const n = Math.max(6, Math.min(16, Math.round(spent / 25)));
      Gold.fly({
        from: Gold.at(purse), to: () => Gold.at(face), n, size: 26,
        onEach: (i, k) => {
          this._shown = Math.round(before - spent * (i + 1) / k);
          goldEl.textContent = Gold.fmt(this._shown);
          Gold.sound('coin');
          if (i === 0) Gold.pop(goldEl);
        },
        onDone: () => {
          this._shown = after;
          goldEl.textContent = Gold.fmt(after);
          Gold.sound('purse');
          const deckTab = this.el.querySelector('.stMode[data-mode="own"]');
          this._flyCard(face, deckTab, () => { Gold.settle(deckTab); this._cue('buy'); finish(); });
        },
      });
    });
  },
  /* THE SALE, SHOWN: the card goes to the trader's hands, and his coins come
     back to the purse, which counts up as each lands. Sold before the card
     moved, like a purchase. */
  _showSell(id, before, r) {
    return new Promise(resolve => {
      const L = this.el.querySelector('.stLook'), face = L.querySelector('.stLookCard .ccard');
      const goldEl = this.el.querySelector('.stGold'), purse = this.el.querySelector('.stPurseImg') || goldEl;
      const after = r.gold, got = Math.max(0, after - before);
      this._anim = true;
      this._shown = before;
      this._paintDeal();
      const finish = () => {
        this._anim = false;
        this._shown = Gold.balance();
        this.closeLook(true);
        this.render();
        this.say(this._line('sold', id, got || r.price));
        resolve();
      };
      if (Gold.reduced() || !face) { this._cue('buy'); finish(); return; }
      const trader = this.el.querySelector('.mkTrader');
      const from = Gold.at(face);
      this._flyCard(face, trader, () => {
        const n = Math.max(6, Math.min(16, Math.round(got / 25)));
        Gold.fly({
          from, to: () => Gold.at(purse), n, size: 26,
          onEach: (i, k) => {
            this._shown = Math.round(before + got * (i + 1) / k);
            goldEl.textContent = Gold.fmt(this._shown);
            Gold.sound('coin');
            if (i === 0) Gold.pop(goldEl);
          },
          onDone: () => {
            this._shown = after;
            goldEl.textContent = Gold.fmt(after);
            Gold.sound('purse');
            Gold.settle(this.el.querySelector('.stPurse'));
            this._cue('buy');
            finish();
          },
        });
      });
    });
  },
  // the game's own voices: a tap's tick, a refusal's knock, a deal's chime
  _cue(kind) {
    try {
      if (kind === 'buy') { if (typeof Sound !== 'undefined' && Sound.ui) Sound.ui('complete'); return; }
      if (typeof UI !== 'undefined' && UI.cue) UI.cue(kind === 'no' ? 'bad' : 'ok');
    } catch (e) {}
  },

  _click(e) {
    const L = this.el.querySelector('.stLook');
    if (e.target === L) { if (!this._anim) this.closeLook(false); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'step') return this.step();
    if (this._anim) return;
    if (act === 'mode') return this.setMode(a.dataset.mode);
    if (act === 'tier') { if (!a.classList.contains('none')) this.jumpTier(a.dataset.tier); return; }
    if (act === 'look') return this.look(a.dataset.card, a.querySelector('.ccard'));
    if (act === 'unlook') return this.closeLook(false);
    if (act === 'flip') { const f = L.querySelector('.ccard'); if (f) { clearTimeout(this._flipT); f.classList.toggle('flip'); this._cue('ok'); } return; }
    if (act === 'deal') return this._tapDeal();
    // the card announcement, on purpose (js/cardintro.js), from the Deck
    if (act === 'intro' && window.CardIntro) { CardIntro.show('store'); return; }
  },

  _css() {
    if (document.getElementById('storeCss')) return;
    const st = document.createElement('style');
    st.id = 'storeCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
  },
};

Store.CSS = `
#scrStore { padding: 0; display: none; overflow: hidden; background: #160d0a; }
#scrStore.show { display: block; }
#scrStore .mkScene { position: absolute; z-index: 0; pointer-events: none; }
#scrStore .mkScene img { position: absolute; display: block; max-width: none; image-rendering: auto; }
#scrStore .mkScene.px img { image-rendering: pixelated; }
#scrStore .mkBg { left: 0; top: 0; width: 100%; height: 100%; }
#scrStore .mkExt { position: absolute; left: 0; width: 100%; display: block; background-color: #2a1a12; background-repeat: repeat-y; background-position: 0 0; }
#scrStore .mkExt[hidden] { display: none; }
#scrStore .mkScene.px .mkExt { image-rendering: pixelated; }
#scrStore .mkSb { position: absolute; left: 0; bottom: 0; width: 1px; height: env(safe-area-inset-bottom, 0px); pointer-events: none; visibility: hidden; }
/* THE HEADER: back, the name, the purse */
#scrStore .stHead { position: absolute; left: 0; right: 0; top: 0; z-index: 6; display: flex; align-items: center; gap: 10px; box-sizing: border-box;
  padding: calc(var(--safe-top, 0px) + 8px) max(12px, env(safe-area-inset-right, 0px)) 12px max(12px, env(safe-area-inset-left, 0px));
  background: linear-gradient(rgba(10,6,3,0.86), rgba(10,6,3,0.55) 68%, rgba(10,6,3,0)); }
#scrStore .stBack { position: relative; isolation: isolate; width: 46px; height: 44px; flex: 0 0 auto; padding: 0; border: 0; background: none; cursor: pointer;
  color: #f1d17a; display: flex; align-items: center; justify-content: center; -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent; }
#scrStore .stBack::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim) 32 / 8px stretch; background: var(--plate-face-solid); }
#scrStore .stBack svg { width: 18px; height: 18px; filter: drop-shadow(0 1px 0 #000); }
#scrStore .stBack:active { translate: 0 2px; }
#scrStore .stTitle { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
#scrStore .stTitle h2 { margin: 0; font: 800 24px/1 var(--menufont); letter-spacing: 1.6px; white-space: nowrap;
  background: linear-gradient(#fff3c8 0%, #f2cd6a 45%, #c08a2c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.85)); }
#scrStore .stSub { font: 700 10px/1 var(--menufont); letter-spacing: 2.4px; text-transform: uppercase; color: rgba(236,214,160,0.86); text-shadow: 0 1px 0 #000; white-space: nowrap; }
#scrStore .stPurse { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; height: 40px; padding: 0 12px 0 4px; border-radius: 20px;
  background: linear-gradient(#24180c, #110b06); box-shadow: inset 0 0 0 1.5px #b98a32, inset 0 0 0 3px #1a1108, 0 2px 5px rgba(0,0,0,0.6); }
#scrStore .stPurseImg { width: 34px; height: 34px; image-rendering: pixelated; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
#scrStore .stPurse b { font: 700 19px/1 var(--numfont); color: #ffe7a0; text-shadow: 0 1px 0 #000; font-variant-numeric: tabular-nums; }
#scrStore .stGold { display: inline-block; transform-origin: 30% 60%; }
#scrStore .stPurseW { font: 700 9.5px/1 var(--menufont); letter-spacing: 1.4px; text-transform: uppercase; color: #e9cf8a; }
@media (max-width: 460px) {
  #scrStore .stHead { gap: 8px; }
  #scrStore .stTitle h2 { font-size: 20px; letter-spacing: 1px; }
  #scrStore .stSub { font-size: 9px; letter-spacing: 2px; }
  #scrStore .stPurseW { display: none; }
  #scrStore .stPurse { height: 36px; padding-right: 10px; }
  #scrStore .stPurseImg { width: 28px; height: 28px; }
  #scrStore .stPurse b { font-size: 17px; }
}
@media (max-width: 370px) { #scrStore .stTitle h2 { font-size: 17px; letter-spacing: 0.6px; } #scrStore .stBack { width: 42px; } }
@media (min-width: 900px) {
  #scrStore .stHead { padding-left: 28px; padding-right: 28px; }
  #scrStore .stTitle h2 { font-size: 32px; }
  #scrStore .stSub { font-size: 11px; }
}
/* HIS WORDS: a parchment bubble at his head */
#scrStore .mkSay { position: absolute; z-index: 4; box-sizing: border-box; padding: 8px 12px 10px; pointer-events: none;
  font: italic 500 15px/1.28 var(--numfont); color: #2b1a0c;
  background: linear-gradient(#f2e5c2, #ddc79b); border: 2px solid #3a2414; border-radius: 6px;
  box-shadow: 0 3px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5); --tx: 30px; --ty: 20px; }
#scrStore .mkSay[hidden] { display: none; }
#scrStore .mkSay em { font-style: normal; font-weight: 700; color: #6a3a0c; }
#scrStore .mkWho { display: block; margin-bottom: 4px; font: 800 9px/1 var(--menufont); letter-spacing: 1.8px; text-transform: uppercase; color: #7a4a16; }
#scrStore .mkSay::after { content: ''; position: absolute; width: 12px; height: 12px; background: #ddc79b; border: 2px solid #3a2414; }
#scrStore .mkSay[data-tail="b"]::after { left: var(--tx); bottom: -8px; border-top: 0; border-left: 0; transform: rotate(45deg); }
#scrStore .mkSay[data-tail="l"]::after { left: -8px; top: var(--ty); border-top: 0; border-right: 0; transform: rotate(45deg); background: #e8d6ad; }
#scrStore .mkSay[data-tail="r"]::after { right: -8px; top: var(--ty); border-bottom: 0; border-left: 0; transform: rotate(45deg); background: #e8d6ad; }
@media (min-width: 900px) { #scrStore .mkSay { font-size: 18px; padding: 10px 14px 12px; } #scrStore .mkWho { font-size: 10px; } }
#scrStore .mkSay.narrow { font-size: 13.5px; padding: 7px 9px 8px; }
/* THE OFFERS: wooden signs on the counter's front (build 226 — the operator's mockup:
   a pale ash board in an iron frame, standing out from the dark counter, a picture,
   the word burnt in and a chevron) */
#scrStore .mkOffers { position: absolute; z-index: 3; display: flex; gap: 14px; filter: drop-shadow(0 5px 6px rgba(0,0,0,0.65)); }
#scrStore .mkOffers[hidden] { display: none; }
#scrStore .mkOffers.col { right: 0; flex-direction: column; align-items: center; gap: 10px; }
#scrStore .mkOffers.side { flex-direction: column; gap: 8px; }
#scrStore .mkOffer { position: relative; isolation: isolate; display: flex; align-items: center; gap: 12px; width: 296px; height: 66px; padding: 0 20px 0 24px;
  border: 0; background: none; cursor: pointer; text-align: left; color: #f6e6bd; -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent;
  --pw: 53px; }
#scrStore .mkOffers.col .mkOffer { width: min(340px, calc(100vw - 40px)); height: 66px; }
#scrStore .mkOffers.side .mkOffer { width: 252px; height: 54px; --pw: 43px; padding: 0 16px 0 20px; }
@media (max-width: 360px) { #scrStore .mkOffers.col .mkOffer b { font-size: 19px; letter-spacing: 1.2px; } #scrStore .mkOffers.col .mkOffer { padding: 0 16px 0 20px; } }
/* the plank: its ends (the iron brackets) kept, its middle drawn out to the sign's width */
#scrStore .mkOffer::before { content: ''; position: absolute; inset: 0; z-index: -1; border-style: solid; border-width: 0 var(--pw); border-color: transparent;
  border-image: var(--plank) 0 64 fill / 0 var(--pw) stretch; }
#scrStore .mkOffer::after { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0; transition: opacity 120ms ease-out;
  background: radial-gradient(ellipse 70% 90% at 45% 50%, rgba(255,250,222,0.34), rgba(255,250,222,0) 75%); }
#scrStore .mkOffer:active { translate: 0 2px; }
#scrStore .mkOffer:active::after { opacity: 1; }
@media (hover: hover) { #scrStore .mkOffer:hover::after { opacity: 1; } #scrStore .mkOffer:hover .mkGo { translate: 3px 0; } }
#scrStore .mkOffer:focus-visible { outline: 2px solid #f2cf73; outline-offset: 3px; }
#scrStore .mkOi { width: 46px; height: 46px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
#scrStore .mkOi img { width: 46px; height: 46px; filter: drop-shadow(0 2px 1px rgba(0,0,0,0.55)); }
#scrStore .mkOffers.side .mkOi, #scrStore .mkOffers.side .mkOi img { width: 38px; height: 38px; }
#scrStore .mkOffer > span { flex: 1 1 auto; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
/* the letters are burnt into the pale board: dark ink with a light cut below */
#scrStore .mkOffer b { font: 800 22px/1 var(--menufont); letter-spacing: 1.6px; text-transform: uppercase; white-space: nowrap; color: #2a1608;
  text-shadow: 0 1px 0 rgba(255,244,214,0.75); }
#scrStore .mkOffer small { font: 600 14.5px/1 var(--numfont); color: #5a3416; text-shadow: 0 1px 0 rgba(255,244,214,0.6); white-space: nowrap; }
#scrStore .mkOffers.side .mkOffer b { font-size: 18px; }
#scrStore .mkOffers.side .mkOffer small { font-size: 13px; }
#scrStore .mkGo { width: 12px; height: 20px; flex: 0 0 auto; transition: translate 120ms ease-out; filter: drop-shadow(0 1px 0 rgba(255,244,214,0.6)); }
/* THE CASE: the album's black panel in the settings page's carved gold rim */
#scrStore .stCase { position: absolute; z-index: 2; display: flex; flex-direction: column; box-sizing: border-box;
  padding: 10px 8px 8px;
  background:
    radial-gradient(ellipse 90% 70% at 50% 35%, rgba(64,40,20,0.34), rgba(0,0,0,0) 70%),
    repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, rgba(0,0,0,0.02) 2px 4px),
    linear-gradient(#1b130c, #120c07 60%, #0d0805);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 40px rgba(0,0,0,0.85), 0 -6px 24px rgba(0,0,0,0.55); }
#scrStore .stCase[hidden] { display: none; }
#scrStore .stCase.side { padding: 14px 14px 10px; box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16,
  inset 0 0 0 8px #0b0704, inset 0 0 40px rgba(0,0,0,0.85), 0 10px 30px rgba(0,0,0,0.7); }
#scrStore .stC { position: absolute; z-index: 3; display: block; width: 40px; height: 40px; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
#scrStore .stC svg { display: block; width: 100%; height: 100%; overflow: visible; }
#scrStore .stC.tl { left: -6px; top: -6px; }
#scrStore .stC.tr { right: -6px; top: -6px; transform: scaleX(-1); }
#scrStore .stC.bl { left: -6px; bottom: -6px; transform: scaleY(-1); }
#scrStore .stC.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }
/* a phone's case spans the window: its ornaments stand inside it, whole */
#scrStore .stCase:not(.side) .stC.tl, #scrStore .stCase:not(.side) .stC.bl { left: 0; }
#scrStore .stCase:not(.side) .stC.tr, #scrStore .stCase:not(.side) .stC.br { right: 0; }
#scrStore .stCase:not(.side) .stC.bl, #scrStore .stCase:not(.side) .stC.br { bottom: 0; }
@media (min-width: 900px) { #scrStore .stC { width: 52px; height: 52px; } }
#scrStore .stModes { flex: 0 0 auto; display: flex; gap: 7px; padding: 3px 4px 10px; }
#scrStore .stMode, #scrStore .stTier { position: relative; isolation: isolate; border: 0; background: none; cursor: pointer; -webkit-appearance: none; appearance: none;
  -webkit-tap-highlight-color: transparent; color: #d9caa6; }
#scrStore .stMode { flex: 1 1 0; min-width: 0; height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px;
  font: 800 15px/1 var(--menufont); letter-spacing: 1.2px; text-transform: uppercase; white-space: nowrap; text-shadow: 0 1px 0 #000; }
#scrStore .stMode::before, #scrStore .stTier::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim) 32 / 8px stretch;
  background: linear-gradient(rgba(255,240,200,0.06), rgba(255,240,200,0) 10px) border-box, linear-gradient(#3b3020, #241c11) border-box; }
#scrStore .stMode.on, #scrStore .stTier.on { color: #fff0bf; }
#scrStore .stMode.on::before, #scrStore .stTier.on::before { border-image-source: var(--plate-rim-lit); background: var(--plate-face-lit); }
#scrStore .stMode img { width: 30px; height: 30px; flex: 0 0 auto; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
#scrStore .stMode.on { filter: drop-shadow(0 0 7px rgba(255,196,90,0.55)); }
#scrStore .stMode:active { translate: 0 2px; }
@media (hover: hover) { #scrStore .stMode:not(.on):hover { color: #f6e6bd; filter: brightness(1.12); } }
/* "Your Deck" where the case has the room, "Deck" where it has not */
#scrStore .stMy { font-style: normal; display: none; }
#scrStore .stCase.roomy .stMy { display: inline; }
#scrStore .stCase:not(.roomy) .stMode { font-size: 14px; gap: 6px; }
#scrStore .stCase:not(.roomy) .stMode img { width: 27px; height: 27px; }
#scrStore .stTiers { flex: 0 0 auto; display: flex; gap: 5px; padding: 0 4px 9px; border-bottom: 1px solid rgba(214,170,74,0.22); }
#scrStore .stTier { flex: 1 1 0; min-width: 0; height: 36px; padding: 0 2px; display: flex; align-items: center; justify-content: center;
  font: 800 9.5px/1 var(--menufont); letter-spacing: 0.4px; text-transform: uppercase; color: #cfbf9a; }
#scrStore .stTier::before { border-width: 6px; border-image: var(--plate-rim-thin) 32 / 6px stretch; background: linear-gradient(#2a2015, #17110a) border-box; }
#scrStore .stTier.none { opacity: 0.38; cursor: default; }
#scrStore .stTn { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; color: var(--tc); text-shadow: 0 1px 0 #000; }
#scrStore .stTier.on .stTn { color: #fff0bf; }
#scrStore .stGem { width: 11px; height: 11px; color: var(--tc); flex: 0 0 auto; filter: drop-shadow(0 1px 0 #000); }
#scrStore .stCase.roomy .stTier { height: 38px; font-size: 11px; letter-spacing: 0.8px; }
#scrStore .stCase.roomy .stGem { width: 12px; height: 12px; }
#scrStore .stPane { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  overscroll-behavior: contain; padding: 0 0 10px; scrollbar-width: thin; scrollbar-color: #8a6420 transparent; }
#scrStore .stShelves { width: 100%; }
#scrStore .stShelf { padding: 12px 0 4px; }
#scrStore .stShelf + .stShelf { border-top: 1px solid rgba(214,170,74,0.28); margin-top: 6px; }
#scrStore .stWares { display: grid; grid-template-columns: repeat(var(--cols, 3), var(--cw)); justify-content: space-evenly; gap: 14px 3px; }
#scrStore .stItem { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 0; border: 0; background: none;
  cursor: pointer; color: inherit; -webkit-tap-highlight-color: transparent; }
#scrStore .stItem .ccard { filter: drop-shadow(0 5px 4px rgba(0,0,0,0.85)) drop-shadow(0 1px 1px rgba(0,0,0,0.9)); transition: translate 90ms ease-out; }
#scrStore .stItem:active .ccard { translate: 0 2px; }
@media (hover: hover) { #scrStore .stItem:hover .ccard { translate: 0 -3px; filter: drop-shadow(0 7px 9px rgba(0,0,0,0.75)) drop-shadow(0 0 8px rgba(255,210,110,0.25)); } }
#scrStore .stItem:focus-visible { outline: 2px solid #f2cf73; outline-offset: 3px; }
#scrStore .stItem.unknown { cursor: default; }
#scrStore .stTag { position: relative; isolation: isolate; display: flex; align-items: center; justify-content: center; gap: 5px;
  box-sizing: border-box; min-width: min(78%, 120px); height: 30px; padding: 0 10px; margin-top: -1px; }
#scrStore .stTag::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 6px solid transparent; border-image: var(--plate-rim-thin) 32 / 6px stretch; background: linear-gradient(#2c2115, #17100a) border-box; }
#scrStore .stP { font: 700 17px/1 var(--numfont); color: #ffe7a8; text-shadow: 0 1px 0 #000; font-variant-numeric: tabular-nums; }
#scrStore .stHave { font: 700 12.5px/1 var(--numfont); font-style: normal; color: #d6c8a4; text-shadow: 0 1px 0 #000; margin-left: 3px; }
#scrStore .stTag.own .stHave { margin: 0; color: #f3e2b4; }
#scrStore .stItem.unknown .stTag.own .stHave { font: 700 9px/1 var(--menufont); letter-spacing: 1px; text-transform: uppercase; color: #8d7f66; }
#scrStore .stItem.short .stP { color: #ff6f52; }
#scrStore .stEmpty { margin: 26px 16px; text-align: center; font: italic 500 16px/1.35 var(--numfont); color: rgba(236,220,186,0.74); }
#scrStore .stEmpty[hidden] { display: none; }
#scrStore .stHow { display: block; margin: 14px auto 6px; padding: 8px 14px; border: 0; background: none; cursor: pointer;
  font: 700 11px/1 var(--menufont); letter-spacing: 1.6px; text-transform: uppercase; color: #e6c66e; text-decoration: underline;
  text-underline-offset: 4px; text-decoration-color: rgba(230,198,110,0.45); }
#scrStore .stHow[hidden] { display: none; }
/* A CARD HELD UP, over the case */
#scrStore .stCase.holding > .stModes, #scrStore .stCase.holding > .stTiers, #scrStore .stCase.holding > .stPane { filter: brightness(0.26) saturate(0.7); }
#scrStore .stLook { position: absolute; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 10px;
  padding: 4px 12px; box-sizing: border-box; }
#scrStore .stLook[hidden] { display: none; }
#scrStore .stLook.row { flex-direction: row; justify-content: center; align-items: center; gap: 14px; padding-top: 8px; }
#scrStore .stLook.row .stDeal { width: 176px; flex: 0 0 auto; }
#scrStore .stLook.row .stDealRow { flex-direction: column; align-items: stretch; }
#scrStore .stLook.row .stBuy { max-width: none; }
#scrStore .stLookCard { cursor: pointer; filter: drop-shadow(0 12px 18px rgba(0,0,0,0.85)) drop-shadow(0 0 18px rgba(255,200,110,0.16)); }
#scrStore .stDeal { display: flex; flex-direction: column; align-items: center; gap: 5px; width: min(400px, 100%); }
/* the status and the count share one line, and wrap only when they must */
#scrStore .stNotes { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 2px 12px; min-height: 18px; }
#scrStore .stDealRow { display: flex; gap: 10px; justify-content: center; width: 100%; }
#scrStore .stBuy, #scrStore .stPut { position: relative; isolation: isolate; min-height: 50px; border: 0; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent;
  font: 800 16px/1 var(--menufont); letter-spacing: 1.8px; text-transform: uppercase; }
#scrStore .stBuy { flex: 1 1 auto; max-width: 250px; min-height: 56px; gap: 9px; padding: 6px 18px 6px 12px; color: #2c1604; text-shadow: 0 1px 0 rgba(255,240,200,0.5); }
#scrStore .stBuyI { width: 34px; height: 34px; flex: 0 0 auto; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); }
#scrStore .stBuy.short .stBuyI { filter: grayscale(0.6) brightness(0.8); }
#scrStore .stBuyL { letter-spacing: 2px; }
#scrStore .stBuy[hidden] { display: none; }
#scrStore .stBuy::before, #scrStore .stPut::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer); border: 8px solid transparent; }
#scrStore .stBuy::before { border-image: var(--plate-rim-gold) 32 / 8px stretch;
  background: linear-gradient(#f7dc8c, #e8bd57 30%, #d4a141 50%, #c18c30 58%, #d8a947 82%, #a8721f) border-box; filter: drop-shadow(0 0 10px rgba(255,200,90,0.25)); }
#scrStore .stBuyP { display: flex; align-items: center; gap: 5px; }
#scrStore .stBuyP b { font: 700 21px/1 var(--numfont); letter-spacing: 0; }
#scrStore .stBuy.sell { color: #fff0e0; text-shadow: 0 1px 0 #000; }
#scrStore .stBuy.sell::before { border-image-source: var(--plate-rim-red); background: var(--plate-face-red) border-box; filter: none; }
#scrStore .stBuy.armed::before { filter: drop-shadow(0 0 12px rgba(255,220,120,0.6)); }
#scrStore .stBuy.short { color: #f0d9c8; text-shadow: 0 1px 0 #000; }
#scrStore .stBuy.short::before { border-image-source: var(--plate-rim-redq); background: var(--plate-face-solid); filter: none; }
#scrStore .stBuy.short .stBuyP b { color: #ff8a6a; }
#scrStore .stBuy.busy { opacity: 0.8; }
#scrStore .stBuy:active, #scrStore .stPut:active { translate: 0 2px; }
#scrStore .stPut { flex: 0 1 auto; min-height: 56px; padding: 6px 18px; color: #f3e2b4; text-shadow: 0 1px 0 #000; }
#scrStore .stPut::before { border-image: var(--plate-rim) 32 / 8px stretch; background: var(--plate-face-solid); }
#scrStore .stMsg { margin: 0; min-height: 17px; font: 600 15px/1.2 var(--numfont); text-align: center; color: #f4e3bd; text-shadow: 0 1px 0 #000; }
#scrStore .stMsg:empty { display: none; }
#scrStore .stMsg[data-k="short"], #scrStore .stMsg[data-k="warn"] { color: #ff9d7f; }
#scrStore .stMsg[data-k="ask"] { color: #ffe08a; }
#scrStore .stOwn { margin: 0; font: 600 13px/1.2 var(--numfont); color: rgba(236,220,186,0.74); text-align: center; text-shadow: 0 1px 0 #000; }
.ccard.stFlying { will-change: transform; filter: drop-shadow(0 8px 14px rgba(0,0,0,0.6)); }
@media (prefers-reduced-motion: reduce) { #scrStore .stItem .ccard { transition: none; } }
`;
window.Store = Store;
