'use strict';
/* THE CARD STORE (#scrStore; js/gold.js, migration 0019; tests/gold.mjs —
   operator, build 223: "a trader's stall (warm lamplight, wares, purse
   always visible)… every catalog card listed with price, grouped by tier…
   tap card → enlarge, tap to flip → BUY… confirm before purchase over ~200
   gold… coins fly purse→card, card flies into deck… not enough gold: price
   in red with 'X more gold needed'; never a dead button… main menu only —
   never in game").
   - THE MAIN MENU'S ALONE (Store.allowed): opened from the title or from
     the title's Settings, never over a game (the pause is the settings page
     too — its purse card offers no door), never on the journey's title (it
     keeps the deck's collection away as well). Screens.show('store') asks
     the same question and shows the title instead.
   - THE STALL IS THE PAINTING (assets/ui/store/stall-{tall,wide}, PixelLab,
     Scale2x'd like the night) under the settings page's carved frame: the
     purse in a plate at its head (it never scrolls away), the wares below
     on one shelf a tier, cheapest first, every card of the catalog with its
     own price. A card short of the purse wears its price red and how much
     more is needed.
   - THE CLOSER LOOK: a tap holds the card up (Deck.lookFit, the size its
     back reads at), a tap on it turns it over, BUY under it. Over
     CFG.GOLD.CONFIRM_OVER the first tap only arms it ("Tap again to buy",
     and a second tap inside 400 ms is a double-tap, not a decision — the
     game's two-tap rule). Short of gold the button still answers: it shakes
     and says how much more, never a dead button.
   - THE PURCHASE is Gold.buy's (one transaction on the record); the coins
     and the flight are its picture, played after the bookkeeping. */
const Store = {
  el: null,
  _from: 'title',
  _id: null,          // the card held up
  _armedAt: 0,        // when a dear purchase was armed (0: not armed)
  _anim: false,       // a purchase is being shown
  _shown: 0,          // the purse as the screen last painted it
  CONFIRM_GAP_MS: 400,

  allowed() {
    if (!(window.Gold && Gold.on()) || typeof Screens === 'undefined') return false;
    const t = document.getElementById('scrTitle');
    if (t && t.classList.contains('pro')) return false;   // the journey keeps to its path
    const cur = Screens.current;
    if (cur === 'title' || cur === 'store') return true;
    return cur === 'settings' && !(window.SettingsPage && SettingsPage.inGame);
  },
  open(from) {
    if (!this.allowed()) return false;
    this._from = from === 'settings' ? 'settings' : 'title';
    Screens.show('store');
    return Screens.current === 'store';
  },
  back() {
    this.closeLook(true);
    if (window.Gold) Gold.stop();
    Screens.show(this._from === 'settings' ? 'settings' : 'title');
  },

  /* ---------------- the screen ---------------- */
  mount() {
    if (this.el) return this.el;
    this._css();
    const scr = document.createElement('div');
    scr.className = 'screen';
    scr.id = 'scrStore';
    const C = window.SettingsPage && SettingsPage.cornerSvg ? SettingsPage : null;
    const v = (typeof CFG !== 'undefined' && CFG.ART_V) || 1, A = n => `assets/ui/store/${n}?v=${v}`;
    scr.innerHTML =
      '<picture class="stBg" aria-hidden="true">' +
        `<source srcset="${A('stall-wide.webp')}" type="image/webp" media="(min-aspect-ratio: 4/3)">` +
        `<source srcset="${A('stall-wide.jpg')}" type="image/jpeg" media="(min-aspect-ratio: 4/3)">` +
        `<source srcset="${A('stall-tall.webp')}" type="image/webp">` +
        `<img src="${A('stall-tall.jpg')}" alt="" decoding="async">` +
      '</picture><i class="stShade" aria-hidden="true"></i>' +
      '<header class="stHead">' +
        '<button class="stBack" type="button" data-act="back" aria-label="Back"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg></button>' +
        '<div class="stTitle"><h2>The Trader</h2><small>Cards for gold</small></div>' +
        `<button class="stDeck" type="button" data-act="deck" aria-label="Your cards">${this._deckSvg()}<b class="stDeckN">0</b></button>` +
      '</header>' +
      '<div class="stFrame">' +
        (C ? [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="stC ${c}">${C.cornerSvg('stc' + c, fx, fy)}</i>`).join('') : '') +
        '<div class="stPurse" role="status" aria-live="polite">' +
          `<img class="stPurseImg" src="${window.Gold ? Gold.art('purse') : ''}" alt="" onerror="this.remove()">` +
          '<div class="stPurseT"><small>Your purse</small><b><span class="stGold">0</span> <em>gold</em></b></div>' +
          `<p class="stPurseHow">Finish a game to earn gold: one for every ${(typeof CFG !== 'undefined' && CFG.GOLD) ? CFG.GOLD.RATE : 200} points.</p>` +
        '</div>' +
        '<div class="stPane"><div class="stShelves"></div></div>' +
      '</div>' +
      '<div class="stLook" hidden>' +
        `<button class="stX" type="button" data-act="unlook" aria-label="Close">${this._closeSvg()}</button>` +
        '<div class="stLookCard" data-act="flip"></div>' +
        '<p class="stCap">Tap the card to turn it over</p>' +
        '<div class="stDeal">' +
          '<button class="stBuy" type="button" data-act="buy"><span class="stBuyL">Buy</span><span class="stBuyP"></span></button>' +
          '<p class="stMsg" role="status" aria-live="polite"></p>' +
          '<p class="stOwn"></p>' +
        '</div>' +
      '</div>';
    document.getElementById('shell').appendChild(scr);
    scr.addEventListener('click', e => this._click(e));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || typeof Screens === 'undefined' || Screens.current !== 'store') return;
      e.preventDefault();
      if (this._id) this.closeLook(false); else this.back();
    });
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (Screens.current === 'store' && !this._anim) this.render(); }, 160);
    });
    if (window.Deck && Deck.onChange) Deck.onChange(() => {
      if (typeof Screens !== 'undefined' && Screens.current === 'store' && !this._anim) this.paint();
    });
    this.el = scr;
    return scr;
  },
  _deckSvg() { return (window.DeckUI && DeckUI.deckIcon) ? DeckUI.deckIcon('stDeckI') : ''; },
  _closeSvg() {
    return '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  },

  // Screens.show('store') calls in
  onShow() {
    this.mount();
    if (window.Deck) { try { Deck.ensureStarter(); } catch (e) {} }
    if (window.Gold) Gold.testLink();
    this.closeLook(true);
    this._shown = Gold.balance();
    this.render();
    Deck.track('store', { ev: 'open', gold: Gold.balance(), from: this._from });
    // the record's purse and price list, asked as the stall opens
    if (Gold.mode() === 'cloud') {
      Deck.sync('store').then(() => {
        if (Screens.current === 'store' && !this._anim) { this._shown = Gold.balance(); this.paint(); }
      }).catch(() => {});
    }
    const pane = this.el.querySelector('.stPane');
    if (pane) pane.scrollTop = 0;
  },

  /* ---------------- the wares ---------------- */
  // the card's size on the shelf: whole device pixels (Deck.fit), as many
  // to a row as the frame holds at a readable size
  _grid() {
    const pane = this.el.querySelector('.stShelves');
    const avail = Math.max(200, (pane && pane.clientWidth) || 300);
    for (const cols of [6, 5, 4, 3, 2]) {
      const gap = cols >= 3 ? 3 : 8, f = Deck.fit((avail - gap * (cols - 1)) / cols);
      if (f.w >= 108 && f.w * cols + gap * (cols - 1) <= avail + 0.01) return { cols, w: f.w };
    }
    return { cols: 2, w: Deck.fit((avail - 8) / 2).w };
  },
  render() {
    if (!this.el) return;
    const host = this.el.querySelector('.stShelves');
    const g = this._grid(), esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    host.style.setProperty('--cols', g.cols);
    host.style.setProperty('--cw', g.w + 'px');
    host.textContent = '';
    for (const t of Deck.TIERS) {
      const cards = Deck.CATALOG.filter(c => c.tier === t.k && Deck.price(c.id) > 0);
      if (!cards.length) continue;
      const ps = cards.map(c => Deck.price(c.id)), lo = Math.min(...ps), hi = Math.max(...ps);
      const sec = document.createElement('section');
      sec.className = 'stShelf';
      sec.dataset.tier = t.k;
      sec.style.setProperty('--tc', t.col);
      sec.innerHTML =
        `<h3 class="stShelfH">${window.DeckUI && DeckUI.gemIcon ? DeckUI.gemIcon('stGem') : ''}` +
          `<span class="stTn">${esc(t.name)}</span><small>${esc(t.rarity)}</small>` +
          `<span class="stEach">${Gold.mark(16)}<b>${Gold.fmt(lo)}${hi > lo ? '–' + Gold.fmt(hi) : ''}</b></span></h3>` +
        '<div class="stWares"></div>';
      const wares = sec.querySelector('.stWares');
      for (const c of cards) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'stItem';
        b.dataset.card = c.id;
        b.dataset.act = 'look';
        b.appendChild(Deck.face(c.id, { w: g.w }));
        b.insertAdjacentHTML('beforeend',
          '<b class="stHave" hidden></b>' +
          `<span class="stTag">${Gold.mark(15)}<b class="stP">${Gold.fmt(Deck.price(c.id))}</b><small class="stMore"></small></span>`);
        wares.appendChild(b);
      }
      host.appendChild(sec);
    }
    this.paint();
  },
  // the numbers only: the purse, each card's price and count, what is short
  paint() {
    if (!this.el) return;
    const gold = this._anim ? this._shown : Gold.balance();
    if (!this._anim) this._shown = gold;
    this.el.querySelector('.stGold').textContent = Gold.fmt(gold);
    this.el.querySelector('.stDeckN').textContent = String(Deck.total());
    for (const b of this.el.querySelectorAll('.stItem')) {
      const id = b.dataset.card, c = Deck.card(id), p = Deck.price(id), n = Deck.count(id), short = p > gold;
      b.classList.toggle('short', short);
      b.querySelector('.stP').textContent = Gold.fmt(p);
      b.querySelector('.stMore').textContent = short ? Gold.fmt(p - gold) + ' more' : '';
      const have = b.querySelector('.stHave');
      have.hidden = !n;
      have.textContent = '×' + n;
      b.setAttribute('aria-label', `${c.name}, ${Gold.fmt(p)} gold` + (short ? `, ${Gold.fmt(p - gold)} more gold needed` : '') + (n ? `, ${n} in your deck` : ''));
    }
    if (this._id) this._paintDeal();
  },

  /* ---------------- the closer look ---------------- */
  lookRoom() {
    const w = innerWidth, h = innerHeight;
    // the deal under the card takes ~150px; the ✕ and the caption the rest
    return Math.min(w - 40, 352, (h - 250) * Deck.W / Deck.H);
  },
  look(id, from) {
    if (!Deck.card(id) || this._anim) return;
    const L = this.el.querySelector('.stLook'), host = L.querySelector('.stLookCard');
    const lf = Deck.lookFit(Math.max(120, this.lookRoom())), calm = Gold.reduced();
    const face = Deck.face(id, { w: lf.w });
    host.innerHTML = '';
    host.appendChild(face);
    this._id = id;
    this._armedAt = 0;
    L.hidden = false;
    Deck.backText(face, lf.tu);
    this._msg('');
    this._paintDeal();
    this._cue('ok');
    if (calm || !from) return;
    const a = from.getBoundingClientRect(), b = face.getBoundingClientRect();
    const s = a.width / b.width, dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    try {
      face.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.32,.5,1)' });
      L.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' });
    } catch (e) {}
  },
  closeLook(now) {
    const L = this.el && this.el.querySelector('.stLook');
    this._id = null;
    this._armedAt = 0;
    if (!L || L.hidden) return;
    const done = () => { if (this._id) return; L.hidden = true; L.querySelector('.stLookCard').innerHTML = ''; };
    if (now || Gold.reduced()) { done(); return; }
    try { const a = L.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' }); a.onfinish = done; } catch (e) {}
    setTimeout(done, 240);
  },
  _paintDeal() {
    const id = this._id;
    if (!id || !this.el) return;
    const L = this.el.querySelector('.stLook'), btn = L.querySelector('.stBuy');
    const p = Deck.price(id), gold = this._anim ? this._shown : Gold.balance(), short = p > gold, n = Deck.count(id);
    const armed = !!this._armedAt;
    btn.classList.toggle('short', short);
    btn.classList.toggle('armed', armed && !short);
    btn.querySelector('.stBuyL').textContent = this._anim ? 'Bought' : (armed && !short ? 'Tap again to buy' : 'Buy');
    btn.querySelector('.stBuyP').innerHTML = `${Gold.mark(18)}<b>${Gold.fmt(p)}</b>`;
    btn.setAttribute('aria-label', `Buy ${Deck.card(id).name} for ${Gold.fmt(p)} gold`);
    L.querySelector('.stOwn').textContent = n ? (n === 1 ? 'One in your deck' : n + ' in your deck') : 'None in your deck yet';
    if (short && !this._anim && !L.querySelector('.stMsg').textContent) this._msg(Gold.fmt(p - gold) + ' more gold needed', 'short');
  },
  _msg(t, kind) {
    const m = this.el && this.el.querySelector('.stLook .stMsg');
    if (!m) return;
    m.textContent = t || '';
    m.dataset.k = kind || '';
  },

  async _tapBuy() {
    const id = this._id;
    if (!id || this._anim || (window.Gold && Gold._buying)) return;
    const L = this.el.querySelector('.stLook'), btn = L.querySelector('.stBuy');
    const p = Deck.price(id), gold = Gold.balance();
    // SHORT: the button answers — it shakes and says what is missing
    if (p > gold) {
      this._shake(btn);
      this._msg(Gold.fmt(p - gold) + ' more gold needed. Finish games to earn more.', 'short');
      this._cue('no');
      Deck.track('store', { ev: 'short', card: id, tier: Deck.card(id).tier, price: p, gold, need: p - gold });
      return;
    }
    // DEAR: the first tap arms it; a second inside CONFIRM_GAP_MS is the same tap twice
    const now = performance.now();
    if (p > ((CFG.GOLD && CFG.GOLD.CONFIRM_OVER) || 200)) {
      if (!this._armedAt) { this._armedAt = now; this._msg('Spend ' + Gold.fmt(p) + ' gold on this card?', 'ask'); this._paintDeal(); this._cue('ok'); return; }
      if (now - this._armedAt < this.CONFIRM_GAP_MS) return;
    }
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
    await this._show(id, before, r);
  },
  _shake(el) {
    if (!el || Gold.reduced()) return;
    try { el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'ease-out' }); } catch (e) {}
  },
  /* THE PURCHASE, SHOWN: coins leave the purse for the card, the purse
     counting down as each lands; then the card flies into the deck, whose
     count steps up as it arrives. The purchase was made before the first
     coin moved — leaving mid-flight loses nothing. */
  _show(id, before, r) {
    return new Promise(resolve => {
      const L = this.el.querySelector('.stLook'), face = L.querySelector('.stLookCard .ccard');
      const goldEl = this.el.querySelector('.stGold'), purse = this.el.querySelector('.stPurseImg') || goldEl;
      const after = r.gold, spent = Math.max(0, before - after), deckN = this.el.querySelector('.stDeckN');
      this._anim = true;
      this._shown = before;
      this._paintDeal();
      const finish = () => {
        this._anim = false;
        this._shown = Gold.balance();
        this.paint();
        resolve();
      };
      if (Gold.reduced() || !face) {
        this._cue('buy');
        this.closeLook(true);
        finish();
        return;
      }
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
          // the card goes into the deck
          const a = face.getBoundingClientRect(), d = this.el.querySelector('.stDeck').getBoundingClientRect();
          const fly = face.cloneNode(true);
          fly.classList.add('stFlying');
          Object.assign(fly.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', margin: 0, zIndex: 70, pointerEvents: 'none' });
          document.body.appendChild(fly);
          face.style.visibility = 'hidden';
          const s = Math.max(0.08, d.height / a.height), dx = d.left + d.width / 2 - (a.left + a.width / 2), dy = d.top + d.height / 2 - (a.top + a.height / 2);
          let ended = false;
          const end = () => {
            if (ended) return;
            ended = true;
            fly.remove();
            this.closeLook(true);
            deckN.textContent = String(Deck.total());
            Gold.settle(this.el.querySelector('.stDeck'));
            this._cue('buy');
            const it = this.el.querySelector(`.stItem[data-card="${id}"] .stHave`);
            finish();
            if (it) Gold.pop(it);
          };
          try {
            const an = fly.animate([
              { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
              { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 40}px) scale(${0.55 + s * 0.2}) rotate(-8deg)`, opacity: 1, offset: 0.35 },
              { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(4deg)`, opacity: 0.85 }],
              { duration: 620, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
            an.onfinish = end;
          } catch (e) { end(); }
          setTimeout(end, 900);
        },
      });
    });
  },
  // the game's own voices: a tap's tick, a refusal's knock, a purchase's chime
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
    if (act === 'back') return this.back();
    if (this._anim) return;
    if (act === 'look') return this.look(a.dataset.card, a.querySelector('.ccard'));
    if (act === 'unlook') return this.closeLook(false);
    if (act === 'flip') { const f = L.querySelector('.ccard'); if (f) { f.classList.toggle('flip'); this._cue('ok'); } return; }
    if (act === 'buy') return this._tapBuy();
    if (act === 'deck' && window.DeckScreens && DeckScreens.openCollection) return DeckScreens.openCollection('title');
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
#scrStore { padding: 0; display: none; flex-direction: column; align-items: center; overflow: hidden; background: #120c07; }
#scrStore.show { display: flex; }
#scrStore .stBg { position: absolute; inset: 0; z-index: 0; display: block; }
#scrStore .stBg img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; display: block; }
#scrStore .stShade { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(rgba(6,4,2,0.72) 0, rgba(6,4,2,0.18) 96px, rgba(6,4,2,0.05) 32%, rgba(6,4,2,0.5) 70%, rgba(6,4,2,0.82)); }
#scrStore .stHead { position: relative; z-index: 2; width: 100%; max-width: 940px; box-sizing: border-box; display: flex; align-items: center; gap: 10px;
  padding: calc(var(--safe-top, 0px) + 8px) 12px 8px; }
#scrStore .stBack, #scrStore .stDeck { position: relative; isolation: isolate; height: 44px; flex: 0 0 auto; padding: 0; border: 0; background: none; cursor: pointer;
  color: #f1d17a; display: flex; align-items: center; justify-content: center; -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent; }
#scrStore .stBack { width: 46px; }
#scrStore .stDeck { min-width: 64px; padding: 0 10px 0 6px; gap: 3px; margin-left: auto; }
#scrStore .stBack::before, #scrStore .stDeck::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim) 32 / 8px stretch; background: var(--plate-face-solid); }
#scrStore .stBack svg { width: 18px; height: 18px; filter: drop-shadow(0 1px 0 #000); }
#scrStore .stBack:active, #scrStore .stDeck:active { translate: 0 2px; }
#scrStore .stDeckI { width: 32px; height: 32px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
#scrStore .stDeckN { font: 700 17px/1 var(--numfont); color: #ffe7a8; text-shadow: 0 1px 0 #000; font-variant-numeric: tabular-nums; }
#scrStore .stTitle { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#scrStore .stTitle h2 { margin: 0; font: 800 26px/1 var(--menufont); letter-spacing: 2px; white-space: nowrap;
  background: linear-gradient(#fff3c8 0%, #f2cd6a 45%, #c08a2c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.85)); }
#scrStore .stTitle small { font: 700 10.5px/1 var(--menufont); letter-spacing: 2.4px; text-transform: uppercase; color: rgba(236,214,160,0.86);
  text-shadow: 0 1px 0 #000; }
/* THE FRAME: the settings page's carved walnut (js/settings.js .sxFrame), its corners its own */
#scrStore .stFrame { position: relative; z-index: 1; flex: 1 1 auto; min-height: 0; width: calc(100% - 20px); max-width: 940px; box-sizing: border-box;
  margin: clamp(60px, 22vh, 240px) 10px calc(env(safe-area-inset-bottom, 0px) + 10px); display: flex; flex-direction: column; padding: 10px;
  background:
    repeating-linear-gradient(92deg, rgba(255,214,150,0.022) 0 1px, rgba(0,0,0,0) 1px 6px, rgba(0,0,0,0.05) 6px 7px, rgba(0,0,0,0) 7px 13px),
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(150,96,40,0.28), rgba(0,0,0,0) 70%),
    linear-gradient(rgba(42,29,17,0.97), rgba(28,20,11,0.97) 60%, rgba(22,15,8,0.98));
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 26px rgba(0,0,0,0.65), 0 12px 34px rgba(0,0,0,0.65); }
#scrStore .stC { position: absolute; z-index: 3; display: block; width: 42px; height: 42px; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
#scrStore .stC svg { display: block; width: 100%; height: 100%; overflow: visible; }
#scrStore .stC.tl { left: -6px; top: -6px; }
#scrStore .stC.tr { right: -6px; top: -6px; transform: scaleX(-1); }
#scrStore .stC.bl { left: -6px; bottom: -6px; transform: scaleY(-1); }
#scrStore .stC.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }
/* THE PURSE: always in view, at the head of the counter */
#scrStore .stPurse { position: relative; flex: 0 0 auto; display: flex; align-items: center; gap: 10px; margin: 2px 4px 8px; padding: 8px 12px 8px 8px;
  isolation: isolate; }
#scrStore .stPurse::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim-lit) 32 / 8px stretch; background: var(--plate-face-lit); }
#scrStore .stPurseImg { width: 48px; height: 48px; flex: 0 0 auto; image-rendering: pixelated; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.7)); }
#scrStore .stPurseT { display: flex; flex-direction: column; gap: 1px; flex: 0 0 auto; }
#scrStore .stPurseT small { font: 700 10px/1 var(--menufont); letter-spacing: 2px; text-transform: uppercase; color: rgba(255,236,190,0.82); }
#scrStore .stPurseT b { font: 700 30px/1 var(--numfont); color: #ffe7a0; text-shadow: 0 2px 0 #2a1704, 0 0 10px rgba(255,200,80,0.35);
  font-variant-numeric: tabular-nums; white-space: nowrap; display: inline-block; transform-origin: 30% 60%; }
#scrStore .stPurseT b em { font: 700 14px/1 var(--menufont); font-style: normal; letter-spacing: 1.5px; color: #f2d58a; text-transform: uppercase; }
#scrStore .stGold { display: inline-block; }
#scrStore .stPurseHow { margin: 0 0 0 auto; max-width: 300px; font: 500 13px/1.3 var(--numfont); color: rgba(244,228,190,0.82); text-align: right; }
@media (max-width: 420px) { #scrStore .stPurseHow { font-size: 12px; max-width: 150px; } }
@media (max-width: 345px) { #scrStore .stPurseHow { display: none; } }
#scrStore .stPane { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  overscroll-behavior: contain; padding: 0 4px 14px; scrollbar-width: thin; scrollbar-color: #8a6420 transparent; }
#scrStore .stShelves { width: 100%; }
/* A SHELF A TIER: its gem, its name in its colour, its price */
#scrStore .stShelf { margin: 4px 0 14px; --tc: #d8c8a0; }
#scrStore .stShelfH { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; margin: 0 0 9px; padding: 8px 10px;
  background: linear-gradient(#2f2214, #21170c); box-shadow: inset 0 -1px 0 rgba(214,170,74,0.45), 0 4px 8px rgba(0,0,0,0.45);
  font: 700 17px/1 var(--menufont); letter-spacing: 1.6px; text-transform: uppercase; color: var(--tc); text-shadow: 0 1px 0 #000; }
#scrStore .stGem { width: 18px; height: 18px; color: var(--tc); flex: 0 0 auto; filter: drop-shadow(0 1px 0 #000); }
#scrStore .stShelfH small { font: 700 10px/1 var(--menufont); letter-spacing: 1.8px; color: rgba(236,220,186,0.7); }
#scrStore .stEach { margin-left: auto; display: flex; align-items: center; gap: 5px; font: 700 17px/1 var(--numfont); letter-spacing: 0; color: #ffe7a8; text-transform: none; }
#scrStore .stWares { display: grid; grid-template-columns: repeat(var(--cols, 3), var(--cw)); justify-content: space-evenly; gap: 12px 3px; }
#scrStore .stItem { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: none;
  cursor: pointer; color: inherit; -webkit-tap-highlight-color: transparent; }
#scrStore .stItem .ccard { filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6)); transition: translate 90ms ease-out; }
#scrStore .stItem:active .ccard { translate: 0 2px; }
@media (hover: hover) { #scrStore .stItem:hover .ccard { translate: 0 -3px; filter: drop-shadow(0 7px 9px rgba(0,0,0,0.6)) drop-shadow(0 0 8px rgba(255,210,110,0.25)); } }
#scrStore .stItem:focus-visible { outline: 2px solid #f2cf73; outline-offset: 3px; }
#scrStore .stHave { position: absolute; top: 3px; right: 3px; z-index: 2; min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box; border-radius: 11px;
  display: flex; align-items: center; justify-content: center; font: 700 13px/1 var(--numfont); color: #ffe7a8;
  background: radial-gradient(circle at 50% 35%, #3a2410, #170c03); border: 1px solid #e0b252; box-shadow: 0 0 0 1px rgba(0,0,0,0.7), 0 2px 3px rgba(0,0,0,0.6); }
#scrStore .stHave[hidden] { display: none; }
/* the price tag: a coin and its number; a card short of the purse wears it red */
#scrStore .stTag { position: relative; isolation: isolate; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; column-gap: 5px; row-gap: 0;
  min-width: 74px; padding: 5px 10px 6px; }
#scrStore .stTag::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim-thin) 32 / 8px stretch; background: var(--plate-face-solid); }
#scrStore .stP { font: 700 17px/1 var(--numfont); color: #ffe7a8; text-shadow: 0 1px 0 #000; font-variant-numeric: tabular-nums; }
#scrStore .stMore { flex: 0 0 100%; text-align: center; font: 700 10.5px/1.15 var(--menufont); letter-spacing: .6px; color: #ff9d7f; text-shadow: 0 1px 0 #000; }
#scrStore .stMore:empty { display: none; }
#scrStore .stItem.short .stP { color: #ff8a6a; }
#scrStore .stItem.short .stTag::before { border-image-source: var(--plate-rim-redq); }
/* THE CLOSER LOOK */
#scrStore .stLook { position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  padding: calc(var(--safe-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: radial-gradient(ellipse 70% 60% at 50% 42%, rgba(40,26,10,0.84), rgba(4,3,2,0.96)); }
#scrStore .stLook[hidden] { display: none; }
#scrStore .stX { position: absolute; top: calc(var(--safe-top, 0px) + 10px); right: 12px; width: 44px; height: 44px; border: 0; background: none; color: #f1d17a;
  isolation: isolate; cursor: pointer; display: flex; align-items: center; justify-content: center; }
#scrStore .stX::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim) 32 / 8px stretch; background: var(--plate-face-solid); }
#scrStore .stX svg { width: 16px; height: 16px; }
#scrStore .stLookCard { cursor: pointer; filter: drop-shadow(0 12px 22px rgba(0,0,0,0.7)) drop-shadow(0 0 18px rgba(255,200,110,0.16)); }
#scrStore .stCap { margin: 0; font: 600 12px/1 var(--menufont); letter-spacing: 1.4px; text-transform: uppercase; color: rgba(236,220,186,0.72); }
#scrStore .stDeal { display: flex; flex-direction: column; align-items: center; gap: 7px; width: min(340px, 100%); }
#scrStore .stBuy { position: relative; isolation: isolate; width: 100%; min-height: 56px; border: 0; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 14px; padding: 6px 18px; color: #fff0bf; -webkit-tap-highlight-color: transparent;
  font: 700 18px/1 var(--menufont); letter-spacing: 2.4px; text-transform: uppercase; text-shadow: 0 1px 0 #000; }
#scrStore .stBuy::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--hud-chamfer);
  border: 8px solid transparent; border-image: var(--plate-rim-lit) 32 / 8px stretch; background: var(--plate-face-lit);
  filter: drop-shadow(0 0 10px rgba(255,200,90,0.25)); }
#scrStore .stBuyP { display: flex; align-items: center; gap: 6px; }
#scrStore .stBuyP b { font: 700 22px/1 var(--numfont); letter-spacing: 0; color: #ffe7a0; }
#scrStore .stBuy:active { translate: 0 2px; }
#scrStore .stBuy.armed::before { border-image-source: var(--plate-rim-gold); }
#scrStore .stBuy.armed { color: #fff7da; }
#scrStore .stBuy.short { color: #f0d9c8; }
#scrStore .stBuy.short::before { border-image-source: var(--plate-rim-redq); background: var(--plate-face-solid); filter: none; }
#scrStore .stBuy.short .stBuyP b { color: #ff8a6a; }
#scrStore .stBuy.busy { opacity: 0.8; }
#scrStore .stMsg { margin: 0; min-height: 17px; font: 600 15px/1.2 var(--numfont); text-align: center; color: #f4e3bd; text-shadow: 0 1px 0 #000; }
#scrStore .stMsg[data-k="short"], #scrStore .stMsg[data-k="warn"] { color: #ff9d7f; }
#scrStore .stMsg[data-k="ask"] { color: #ffe08a; }
#scrStore .stOwn { margin: 0; font: 700 11px/1 var(--menufont); letter-spacing: 1.6px; text-transform: uppercase; color: rgba(236,220,186,0.66); }
.ccard.stFlying { will-change: transform; filter: drop-shadow(0 8px 14px rgba(0,0,0,0.6)); }
/* a short window (a phone on its side): the frame starts higher */
@media (max-height: 600px) {
  #scrStore .stFrame { margin-top: 6px; }
  #scrStore .stHead { padding-top: calc(var(--safe-top, 0px) + 4px); padding-bottom: 4px; }
}
/* a phone: the frame gives the wares its width, so a 390px phone shelves
   three cards a row at whole device pixels */
@media (max-width: 440px) {
  #scrStore .stFrame { width: calc(100% - 10px); margin-left: 5px; margin-right: 5px; padding: 10px 9px; }
  #scrStore .stPane { padding: 0 0 14px; }
  #scrStore .stC { width: 36px; height: 36px; }
}
@media (max-width: 380px) {
  #scrStore .stTitle h2 { font-size: 22px; }
  #scrStore .stPurseT b { font-size: 26px; }
}
@media (min-width: 900px) {
  #scrStore .stFrame { width: calc(100% - 48px); padding: 14px; margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); }
  #scrStore .stC { width: 58px; height: 58px; }
  #scrStore .stHead { padding-left: 24px; padding-right: 24px; }
  #scrStore .stTitle h2 { font-size: 32px; }
}
@media (prefers-reduced-motion: reduce) { #scrStore .stItem .ccard { transition: none; } }
`;
window.Store = Store;
