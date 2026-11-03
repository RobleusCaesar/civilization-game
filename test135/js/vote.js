"use strict";
/* A VOTE EARNS A CARD (tests/vote.mjs) — the whole of it, in this one file.

   Operator, 2026-11-03: "if someone votes for our game they get a card",
   then, once the first build hid it on the Cards screen: "No one is going
   to know to click on this link … a banner … Vote and Get A Free Card …
   tap the banner and have the modal appear, it should look like the card
   announcement pages … After the 12 hours having it re-appear. When it
   reappears, all future free cards are stone (lowest level), and
   randomized … also remove the button from the card screen … keep this
   whole section containerized so we can delete it if needed fairly easily …
   add this to the analytics in a traffic section".

   HOW IT FLOWS. The title wears a slim gold banner, "Vote & get a free
   card"; the reward screen, once its card is claimed, a line, "Want
   another?". Either opens the pop-up — the card announcement's own look
   (js/cardintro.js: its panel, ribbon, laurels, corners and dusk, its
   stylesheet re-scoped to #voteCard) — showing the card the vote earns and
   one gold plaque, VOTE NOW, which opens the vote page in a new tab with the
   player's id as ?ref=. The site calls our Edge Function
   (supabase/functions/vote-callback), which grants the card into the record
   (migrations 0012 and 0013). As the player comes back to the tab the deck
   syncs (the card arrives the ordinary way, through the record) and
   claim_vote_notes() says what the vote did, once (afterSync).

   THE CARD. A player's FIRST vote earns CFG.CARDS.VOTE.CARD (Swift Raiders,
   0013's vote_card()); every later one a random card of VOTE.LATER (Stone,
   vote_later_tier()). The server decides; vote_status() tells the game which
   is next (firstDue), and the pop-up shows that card — or, for the random
   one, a Stone card face down.

   THE OFFER COMES AND GOES (offered). Only where the record can take the
   card (Deck._syncGate: never a test deck, a test page or a page from disk),
   only online, and never inside the wait: after a press it rests PENDING_MS
   for the vote to land, then until the last counted vote is GAP_H (12) hours
   old (the site's own limit) — or the whole 12 hours after the press when
   the server's status cannot be read. On a window too short to hold it under
   the menu, the banner stands aside.

   ANALYTICS. The banner and the line send one 'vote' row when SEEN (once a
   page, per place), the pop-up one when OPENED and one when VOTE NOW is
   pressed (GO) — { step, where, first } through Backend._emit, on the live
   site alone like every row. The dashboard's Traffic section reads them
   beside the votes the site reported (0013's analytics_traffic).

   TO TAKE IT OUT: this file and its <script> tag, CFG.CARDS.VOTE, the two
   guarded one-line hooks (Deck._syncRun → Vote.afterSync, DeckScreens.
   _setButtons → Vote.onReward), tests/vote.mjs and its contract-times line.
   The server half may stay: with nothing offering the link, nobody votes
   through it. CFG.CARDS.VOTE.ON = false switches all of it off without a
   deletion (no element, no stylesheet, no request). */

const Vote = {
  KEY: 'neo-vote-at',          // when this device last pressed VOTE NOW (build 133's key)
  FIRST_KEY: 'neo-vote-first', // '1' once this player's first vote card has landed
  LAST_KEY: 'neo-vote-last',   // the last counted vote, as the server last said (epoch ms)
  PENDING_MS: 20 * 60e3,       // after a press, the offer rests this long for the vote to land
  BACK_MS: 30 * 60e3,          // coming back within this of a press is coming back from voting
  LOOK_MS: [4000, 15000, 45000, 120000],   // the callback may lag the vote: look again, a few times
  STATUS_MS: 60e3,             // the status is asked at most this often
  BANNER: 'Vote & get a free card',
  status: null,                // vote_status(), as last heard on this page: { uid, granted, last_at }
  _seen: {},                   // a 'seen' row is sent once a page, per place
  _root: null,

  /* ---------------- the rules ---------------- */
  cfg() {
    const V = typeof CFG !== 'undefined' && CFG.CARDS && CFG.CARDS.VOTE;
    return V && V.ON !== false && V.URL ? V : null;
  },
  on() { return !!(this.cfg() && window.Deck && Deck.on && Deck.on()); },
  _get(k) { try { return window.Deck && Deck._get ? Deck._get(k) : localStorage.getItem(k); } catch (e) { return null; } },
  _set(k, v) { try { if (window.Deck && Deck._set) Deck._set(k, v); else localStorage.setItem(k, v); } catch (e) {} },
  // the vote page, carrying this player's id — null wherever the record cannot take the card
  link() {
    const V = this.cfg();
    if (!V || !this.on() || !Deck._syncGate || Deck._syncGate()) return null;
    return V.URL + (V.URL.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + encodeURIComponent(window.Backend.uid);
  },
  gap() { return ((this.cfg() || {}).GAP_H || 12) * 3600e3; },
  _status() { const s = this.status; return s && window.Backend && s.uid === Backend.uid ? s : null; },
  lastVote() { const s = this._status(); return (s && s.last_at) || +this._get(this.LAST_KEY) || 0; },
  nextAt() {
    const press = +this._get(this.KEY) || 0, last = this.lastVote(), gap = this.gap();
    let t = last ? last + gap : 0;
    // a press no counted vote has answered yet: rest while it lands (the
    // whole wait when the server cannot say whether it did)
    if (press > last) t = Math.max(t, press + (this._status() ? this.PENDING_MS : gap));
    return t;
  },
  firstDue() {
    const s = this._status();
    return s ? !(s.granted > 0) : this._get(this.FIRST_KEY) !== '1';
  },
  offered() {
    if (!this.link()) return false;
    try { if (navigator.onLine === false) return false; } catch (e) {}
    return Date.now() >= this.nextAt();
  },
  // what the next vote earns: the first vote's card, or null for a random one of the later tier
  nextCard() { return this.firstDue() ? this.cfg().CARD : null; },
  tierName() {
    const k = (this.cfg() || {}).LATER || 'stone';
    try { return Deck.tier(k).name; } catch (e) { return 'Stone'; }
  },

  /* ---------------- the server ---------------- */
  async refreshStatus(force) {
    if (!this.link() || this._stBusy) return this._status();
    if (!force && this._stAt && Date.now() - this._stAt < this.STATUS_MS) return this._status();
    const uid = window.Backend.uid;
    this._stBusy = true;
    this._stAt = Date.now();
    try {
      const r = await Backend.rpc('vote_status', {});
      if (r && r.ok && r.data && r.data.ok === true && Backend.uid === uid) {
        this.status = { uid, granted: +r.data.granted || 0, last_at: +r.data.last_at || 0 };
        if (this.status.last_at) this._set(this.LAST_KEY, String(this.status.last_at));
        if (this.status.granted > 0) this._set(this.FIRST_KEY, '1');
      }
    } catch (e) { /* unknown: the local memory stands in */ }
    finally { this._stBusy = false; }
    this.paint();
    return this._status();
  },
  // the device pressed VOTE NOW in the last week: worth asking what came of it
  _votedLately() { const at = +this._get(this.KEY) || 0; return at > 0 && Date.now() - at < 7 * 864e5; },
  /* told by Deck._syncRun once the record is on the device: what the votes
     did, said once — the card it earned by name, or the wait */
  async afterSync(uid) {
    if (!this.on() || !this._votedLately()) return 0;
    let r;
    try { r = await window.Backend.rpc('claim_vote_notes', {}); } catch (e) { return 0; }
    if (!r || !r.ok || !r.data || r.data.ok !== true || !Array.isArray(r.data.notes)) return 0;
    if (window.Backend.uid !== uid) return 0;
    const notes = r.data.notes.filter(n => n && (n.result === 'granted' || n.result === 'too_soon'));
    if (!notes.length) return 0;
    if (notes.some(n => n.result === 'granted')) this._set(this.FIRST_KEY, '1');
    // one line: the latest card, or the latest refusal when nothing was given
    const best = notes.filter(n => n.result === 'granted').pop() || notes[notes.length - 1];
    this._tell(this.line(best));
    try { if (Deck._changed) Deck._changed(); } catch (e) {}
    this.refreshStatus(true);
    return notes.length;
  },
  line(n) {
    const c = n && n.card && window.Deck ? Deck.card(n.card) : null;
    if (n && n.result === 'granted') return `Thank you for voting! ${c ? c.name : 'A card'} joins your deck.`;
    return `Thank you for voting! A vote earns a card once every ${(this.cfg() || {}).GAP_H || 12} hours.`;
  },
  // in a game the event log says it (and toasts it); on a menu, the shell's line
  _tell(line) {
    try {
      const inGame = typeof G !== 'undefined' && G.log && window.Screens && Screens.current === 'playing' && !Screens._demo;
      if (inGame) G.log('🗳️ ' + line);
      else if (window.Screens && Screens.say) Screens.say(line);
    } catch (e) {}
  },
  track(step, where) {
    try {
      const B = window.Backend;
      if (!B || !B._emit) return;
      B._emit({ kind: 'vote', device: B.deviceKind ? B.deviceKind() : null,
        props: { step, where: where === 'reward' ? 'reward' : 'title', first: this.firstDue() } });
    } catch (e) {}
  },

  /* ---------------- the press ---------------- */
  go(where) {
    this._set(this.KEY, String(Date.now()));
    this.track('go', where);
    this._armReturn();
    this.close(true);
    this.paint();
    this._tell('Vote, then come back here: your card arrives about a minute later.');
  },
  // coming back to the tab after a press: sync a few times, the callback may lag
  _armReturn() {
    if (this._armed) return;
    this._armed = true;
    try { document.addEventListener('visibilitychange', () => { if (!document.hidden) this._look(); }); } catch (e) {}
  },
  _look() {
    const at = +this._get(this.KEY) || 0;
    if (!at || Date.now() - at > this.BACK_MS) return;
    for (const t of this._looks || []) clearTimeout(t);
    this._looks = this.LOOK_MS.map(ms => setTimeout(() => {
      try { if (Deck.sync) Deck.sync('vote'); } catch (e) {}
      this.refreshStatus(true);
    }, ms));
  },

  /* ---------------- the banner on the title ---------------- */
  _banner() {
    let el = document.getElementById('vtBanner');
    if (el) return el;
    const menu = document.querySelector('#scrTitle .tmenu');
    if (!menu) return null;
    this._css();
    el = document.createElement('button');
    el.type = 'button';
    el.id = 'vtBanner';
    el.className = 'vtBanner';
    el.hidden = true;
    el.innerHTML = `<i class="vtStar" aria-hidden="true"></i><span>${this.esc(this.BANNER)}</span><i class="vtStar" aria-hidden="true"></i>`;
    el.addEventListener('click', () => this.open('title'));
    menu.appendChild(el);
    return el;
  },
  paint() {
    if (!this.cfg()) return;
    const title = !!(window.Screens && Screens.current === 'title');
    const want = this.on() && title && this.offered();
    const el = want ? this._banner() : document.getElementById('vtBanner');
    if (el) {
      el.hidden = !want;
      if (want) {
        // under the menu, or not at all: a window too short keeps its menu whole
        const col = el.closest('.tcol');
        if (col && col.scrollHeight > col.clientHeight + 1) el.hidden = true;
        else if (!this._seen.title) { this._seen.title = 1; this.track('seen', 'title'); }
      }
    }
    if (title && this.link()) this.refreshStatus();
    this._paintReward();
  },

  /* ---------------- the line on the reward screen ---------------- */
  onReward(btns, state) {
    this._rewardBtns = btns;
    this._rewardState = state;
    if (state === 'done') this.refreshStatus();
    this._paintReward();
  },
  _paintReward() {
    const b = this._rewardBtns;
    if (!b || !document.contains(b)) { this._rewardBtns = null; return; }
    let el = b.parentNode.querySelector('.vtMore');
    const want = this._rewardState === 'done' && this.offered();
    if (!want) { if (el) el.hidden = true; return; }
    if (!el) {
      this._css();
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'vtMore';
      el.innerHTML = `<i class="vtStar" aria-hidden="true"></i><span>Want another? <b>Vote for a free card</b></span>`;
      el.addEventListener('click', () => this.open('reward'));
      b.parentNode.insertBefore(el, b.nextSibling);
    }
    el.hidden = false;
    if (!this._seen.reward) { this._seen.reward = 1; this.track('seen', 'reward'); }
  },

  /* ---------------- the pop-up ---------------- */
  copy() {
    const V = this.cfg(), first = this.firstDue();
    const c = first && window.Deck ? Deck.card(V.CARD) : null;
    const h = V.GAP_H || 12;
    return {
      kick: 'Vote for us', title: 'Free card',
      sub: first && c ? `Vote for us on Vibe Top List and ${c.name} joins your deck.`
        : `Vote for us on Vibe Top List and a random ${this.tierName()} card joins your deck.`,
      foot: `One vote every ${h} hours. Come back after you vote: your card arrives about a minute later.`,
      cta: 'Vote now',
    };
  },
  open(where) {
    if (this._root || !this.on()) return false;
    const link = this.link();
    if (!link) return false;
    this._where = where === 'reward' ? 'reward' : 'title';
    this._css();
    this.track('open', this._where);
    this._prevFocus = document.activeElement;
    const c = this.copy(), esc = s => this.esc(s);
    const root = document.createElement('div');
    root.id = 'voteCard';
    root.className = 'plaques' + (this.reduced() ? ' ciStill' : '') + (window.CardIntro ? '' : ' vtPlain');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'vtTitle');
    const CI = window.CardIntro;
    const close = CI ? CI.CLOSE_SVG : '×';
    root.innerHTML =
      `<div class="ciVeil" data-act="close"></div>` +
      `<div class="ciPanel">` +
        `<i class="ciDusk"></i><i class="ciRays"></i><i class="ciGlow"></i>` +
        `<i class="ciCorner tl"></i><i class="ciCorner tr"></i><i class="ciCorner bl"></i><i class="ciCorner br"></i>` +
        `<div class="ciPages"><section class="ciPage on enter vtPage">` +
          `<div class="ciHead"><div class="ciRibbon"><i class="ciRib"></i><span>${esc(c.kick)}</span></div>` +
            `<h2 class="ciTitle" id="vtTitle"><i class="ciLaurel l"></i><span class="ciWord">${esc(c.title)}</span><i class="ciLaurel r"></i></h2>` +
            `<i class="ciRule"></i><p class="ciSub">${esc(c.sub)}</p></div>` +
          `<div class="ciHero"><div class="vtSlot"></div></div>` +
          `<p class="ciFoot">${esc(c.foot)}</p>` +
        `</section></div>` +
        `<div class="ciNav"><i class="ciCta vtCta" aria-hidden="true"></i>` +
          `<a class="abtn big gold ciNext vtGo" data-act="go" href="${esc(link)}" target="_blank" rel="noopener"><span class="blab">${this.STAR_SVG}${esc(c.cta)}</span></a>` +
        `</div>` +
        `<button type="button" class="ciX" data-act="close" aria-label="Close">${close}</button>` +
      `</div>`;
    document.body.appendChild(root);
    this._root = root;
    if (CI && CI.SVG) {
      const V = CI.SVG;
      root.style.setProperty('--corner', V.uri(V.corner()));
      root.style.setProperty('--ribbon', V.uri(V.ribbon()));
      root.style.setProperty('--laurel', V.uri(V.laurel()));
      root.style.setProperty('--dusk', `url("${CI.art('dusk')}")`);
    }
    this._bind();
    this._layout();
    try { root.querySelector('.vtGo').focus({ preventScroll: true }); } catch (e) {}
    try { if (typeof UI !== 'undefined' && UI.cue) UI.cue('bond'); } catch (e) {}
    return true;
  },
  close(silent) {
    const root = this._root;
    if (!root) return;
    this._root = null;
    this._unbind();
    const done = () => { if (root.parentNode) root.parentNode.removeChild(root); };
    if (silent || this.reduced()) done();
    else { root.classList.add('ciOut'); setTimeout(done, 260); }
    const back = this._prevFocus;
    this._prevFocus = null;
    try { if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true }); } catch (e) {}
  },
  /* THE CARD THE VOTE EARNS, AT WHOLE DEVICE PIXELS (Deck.fit): as large as
     the window lets the panel stand whole, never past the art's own size on
     a wide window; measured, and a step smaller while the panel spills */
  _layout() {
    const root = this._root;
    if (!root) return;
    const de = document.documentElement, vw = de.clientWidth || innerWidth, vh = de.clientHeight || innerHeight;
    const narrow = vw < 600;
    // a phone on its side: the card beside the words, or the screen cannot hold them
    const short = vh < 560 && vw > vh;
    root.classList.toggle('ciNarrow', narrow);
    root.classList.toggle('vtShort', short);
    const k = narrow ? 1 : 0.7;
    root.style.setProperty('--k', k);
    root.style.setProperty('--ribW', Math.round(narrow ? Math.min(268, vw * 0.69) : 330 * k) + 'px');
    root.style.setProperty('--cornerW', Math.round(narrow ? 50 : 72 * k) + 'px');
    root.style.setProperty('--laurelH', Math.round(short ? 56 : narrow ? 84 : 124 * k) + 'px');
    // what spills is the screen's own column, by its BOX: the light round the
    // card (its glow, the rays) may overhang anything and is no spill
    const slot = root.querySelector('.vtSlot'), panel = root.querySelector('.ciPanel'), pages = root.querySelector('.ciPages');
    const page = root.querySelector('.ciPage');
    const id = this.nextCard();
    const stone = (Deck.CATALOG.find(x => x.tier === ((this.cfg() || {}).LATER || 'stone')) || Deck.CATALOG[0]).id;
    let want = narrow ? Math.min(vw * 0.5, Deck.W) : Deck.W;
    want = Math.min(want, Math.max(59, (vh - (short ? 170 : narrow ? 400 : 360)) * Deck.W / Deck.H));
    for (let i = 0; i < 4; i++) {
      const sz = Deck.fit(Math.max(10, want));
      slot.innerHTML = '';
      slot.classList.toggle('vtMystery', !id);
      slot.style.setProperty('--cw', sz.w + 'px');
      slot.style.setProperty('--ch', sz.h + 'px');
      slot.appendChild(Deck.face(id || stone, { w: sz.w, unknown: !id }));
      if (page.offsetHeight <= pages.clientHeight + 1 || sz.w <= 59) break;
      want = sz.w - 0.5;
    }
    // the light the card stands in rises from its middle
    const p = panel.getBoundingClientRect(), s = slot.getBoundingClientRect();
    if (p.height) root.style.setProperty('--ry', Math.round(((s.top + s.height / 2) - p.top) / p.height * 100) + '%');
  },
  _bind() {
    const root = this._root;
    this._h = {
      click: e => {
        const a = e.target.closest('[data-act]');
        if (!a || !root.contains(a)) return;
        if (a.dataset.act === 'close') { e.preventDefault(); this.close(); }
        else if (a.dataset.act === 'go') this.go(this._where);   // the link opens the page itself
      },
      key: e => {
        if (!this._root) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
        if (e.key === 'Tab') {
          const f = [...this._root.querySelectorAll('a[href], button')];
          const i = f.indexOf(document.activeElement);
          const j = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i >= f.length - 1 ? 0 : i + 1);
          e.preventDefault();
          e.stopImmediatePropagation();
          if (f[j]) f[j].focus();
          return;
        }
        e.stopImmediatePropagation();   // nothing else reaches the screen underneath
      },
      resize: () => { clearTimeout(this._rT); this._rT = setTimeout(() => this._layout(), 90); },
    };
    root.addEventListener('click', this._h.click);
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
  },

  /* ---------------- small things ---------------- */
  reduced() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  },
  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  // drawn at the device's own resolution (the chrome rule): a five-point star
  STAR_SVG: '<svg class="vtS" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .9 10.1 5.6 15.2 6.1 11.4 9.5 12.5 14.6 8 12 3.5 14.6 4.6 9.5.8 6.1 5.9 5.6Z" fill="currentColor"/></svg>',
  _css() {
    if (document.getElementById('voteCss')) return;
    if (window.Deck && Deck.css) Deck.css();   // the faces' own stylesheet
    const st = document.createElement('style');
    st.id = 'voteCss';
    // the announcement's look, re-scoped to this pop-up, then this file's own
    const look = window.CardIntro && CardIntro.CSS ? CardIntro.CSS.replace(/#cardIntro\b/g, '#voteCard') : '';
    st.textContent = look + this.CSS;
    document.head.appendChild(st);
  },
};

Vote.CSS = `
/* ---- the banner, under the title's menu: a slim gold plate, a 44px target ---- */
#scrTitle .tmenu > .vtBanner { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; min-height: 44px; margin: 2px 0 0; padding: 0 16px; border: 0; background: none; cursor: pointer;
  font: 700 12.5px/1.1 var(--menufont, 'Cinzel', Georgia, serif); letter-spacing: .13em; text-transform: uppercase; white-space: nowrap;
  color: #ffe7a8; text-shadow: 0 1px 0 #2a1806, 0 0 10px rgba(255,200,90,.4); -webkit-tap-highlight-color: transparent;
  animation: vtIn .5s ease-out .35s both; }
#scrTitle .tmenu > .vtBanner[hidden] { display: none !important; }
#scrTitle .tmenu > .vtBanner::before { content: ''; position: absolute; inset: 5px 0; z-index: -1; border-radius: 999px;
  background: linear-gradient(180deg, rgba(64,44,15,.94), rgba(30,20,8,.94));
  box-shadow: inset 0 0 0 1px #0a0704, inset 0 0 0 2px #d0a246, inset 0 0 0 3px rgba(20,12,4,.6), inset 0 6px 0 rgba(255,230,160,.08),
    0 0 18px rgba(255,190,80,.28), 0 3px 8px rgba(0,0,0,.55); }
#scrTitle .tmenu > .vtBanner::after { content: ''; position: absolute; inset: -6px 10%; z-index: -2; border-radius: 999px; pointer-events: none;
  background: radial-gradient(ellipse closest-side, rgba(255,206,100,.32), transparent); animation: vtGlow 2.6s ease-in-out infinite; }
#scrTitle .tmenu > .vtBanner:hover::before { box-shadow: inset 0 0 0 1px #0a0704, inset 0 0 0 2px #f2cd62, inset 0 0 0 3px rgba(20,12,4,.6),
  inset 0 6px 0 rgba(255,230,160,.1), 0 0 22px rgba(255,200,90,.45), 0 3px 8px rgba(0,0,0,.55); }
#scrTitle .tmenu > .vtBanner:active { translate: 0 1px; }
#scrTitle .tmenu > .vtBanner:focus-visible { outline: 2px solid #f2cf73; outline-offset: 2px; border-radius: 999px; }
.vtStar { display: block; flex: 0 0 auto; width: 11px; height: 11px; background: #f2cd62;
  clip-path: polygon(50% 0, 63% 35%, 100% 38%, 71% 61%, 81% 100%, 50% 78%, 19% 100%, 29% 61%, 0 38%, 37% 35%);
  filter: drop-shadow(0 0 4px rgba(255,210,100,.8)); }
@keyframes vtIn { from { opacity: 0; transform: translateY(6px); } }
@keyframes vtGlow { 50% { opacity: .35; } }
@media (max-width: 359px) { #scrTitle .tmenu > .vtBanner { font-size: 11px; letter-spacing: .09em; gap: 7px; } }
@media (prefers-reduced-motion: reduce) { #scrTitle .tmenu > .vtBanner, #scrTitle .tmenu > .vtBanner::after { animation: none; } }

/* ---- the line on the reward screen, once the card is claimed ---- */
#cardEnd .vtMore { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; flex: 0 0 auto;
  margin: 8px auto 0; min-height: 40px; padding: 0 16px; border: 0; background: none; cursor: pointer; color: #e8d3a2;
  font: 600 13px/1.2 Georgia, 'Times New Roman', serif; text-shadow: 0 1px 0 #000; -webkit-tap-highlight-color: transparent; }
#cardEnd .vtMore[hidden] { display: none !important; }
#cardEnd .vtMore b { color: #ffe39a; font: 700 12px/1.2 var(--menufont, 'Cinzel', Georgia, serif); letter-spacing: .1em; text-transform: uppercase;
  border-bottom: 1px solid rgba(242,205,98,.55); padding-bottom: 1px; }
#cardEnd .vtMore:hover b { color: #fff1c2; border-bottom-color: #f2cd62; }
#cardEnd .vtMore::after { content: ''; position: absolute; inset: -2px 0; }

/* ---- the pop-up: the announcement's panel, one screen tall ---- */
#voteCard .ciPanel { width: min(100%, calc(660px * var(--k, 1))); height: auto; max-height: 100%; }
#voteCard .ciPages { flex: 0 1 auto; min-height: 0; }
#voteCard .ciPage { position: relative; inset: auto; display: flex; }
#voteCard .ciHero { flex: 0 0 auto; padding: calc(20px * var(--k, 1)) 0 calc(16px * var(--k, 1)); }
#voteCard .ciFoot { padding: 0 calc(10px * var(--k, 1)); }
#voteCard .ciNav { padding-bottom: calc(26px * var(--k, 1)); }
#voteCard .ciCta.vtCta { display: block; }
#voteCard .ciNext { text-decoration: none; display: flex; align-items: center; justify-content: center; }
#voteCard .ciNext .blab { display: flex; align-items: center; gap: 10px; }
#voteCard .vtS { width: 1em; height: 1em; flex: 0 0 auto; filter: drop-shadow(0 1px 0 rgba(20,12,4,.8)); }
#voteCard:not(.ciNarrow) .ciWord { font-size: clamp(calc(34px * var(--k, 1)), min(10cqw, calc(9vh * var(--k, 1))), calc(84px * var(--k, 1))); }
#voteCard.ciNarrow .ciWord { font-size: clamp(34px, min(11vw, 8vh), 72px); }
#voteCard.ciNarrow .ciPanel { width: min(100%, 460px); }
/* a phone on its side: the card beside the words */
#voteCard.vtShort .ciPanel { width: min(100%, 680px); }
#voteCard.vtShort .ciPage { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "hero head" "hero foot";
  column-gap: 24px; align-items: center; padding: 0 28px; }
#voteCard.vtShort .ciHead { grid-area: head; align-self: end; }
#voteCard.vtShort .ciHero { grid-area: hero; padding: 14px 0 4px; }
#voteCard.vtShort .ciFoot { grid-area: foot; align-self: start; margin-top: 8px; }
#voteCard.vtShort .ciRule { display: none; }
#voteCard.vtShort .ciNav { padding-top: 6px; padding-bottom: 16px; }
/* the card it earns, in the light: a soft pulse behind it, a slow float */
#voteCard .vtSlot { position: relative; width: var(--cw); height: var(--ch); }
#voteCard .vtSlot::before { content: ''; position: absolute; inset: -18%; z-index: -1; border-radius: 16%;
  background: radial-gradient(ellipse at center, rgba(255,222,120,.55), rgba(255,190,70,.18) 45%, transparent 70%);
  animation: ciPulse 2.6s ease-in-out infinite; }
#voteCard .vtSlot .ccard { box-shadow: 0 0 0 1px rgba(255,236,170,.55), 0 0 22px 4px rgba(255,214,94,.62), 0 12px 16px rgba(0,0,0,.6);
  animation: ciFloat 3.6s ease-in-out .9s infinite; }
#voteCard .vtSlot.vtMystery .cc-ico { display: none; }
/* the random card, face down: a gold question in its window */
#voteCard .vtSlot.vtMystery .cc-art::after { content: '?'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font: 900 calc(var(--u, 1px) * 74)/1 var(--menufont, 'Cinzel', Georgia, serif); color: #f2cd62;
  text-shadow: 0 2px 0 #3a2208, 0 0 calc(var(--u, 1px) * 14) rgba(255,200,90,.55); }
#voteCard.ciStill .vtSlot::before, #voteCard.ciStill .vtSlot .ccard { animation: none; }
/* without the announcement's stylesheet (a cached older cardintro.js): a plain dark panel that still works */
#voteCard.vtPlain { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 12px; color: #efe4cd; }
#voteCard.vtPlain .ciVeil { position: absolute; inset: 0; background: rgba(6,4,2,.8); }
#voteCard.vtPlain .ciPanel { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 18px;
  background: #1b1510; border: 2px solid #b98a36; text-align: center; }
#voteCard.vtPlain .ciRibbon span, #voteCard.vtPlain .ciWord { font-family: var(--menufont, Georgia, serif); }
#voteCard.vtPlain .ciX { position: absolute; right: 8px; top: 8px; width: 44px; height: 44px; background: none; border: 0; color: #f2cd62; font-size: 24px; }
#voteCard.vtPlain i { display: none; }
`;

window.Vote = Vote;

/* ---------------- boot: listen, and paint when the title shows ---------------- */
(() => {
  if (!Vote.cfg()) return;   // switched off: nothing listens, nothing is built
  const paint = () => { try { Vote.paint(); } catch (e) {} };
  const boot = () => {
    const t = document.getElementById('scrTitle');
    if (t && window.MutationObserver) new MutationObserver(paint).observe(t, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('backend-status', paint);
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    window.addEventListener('resize', paint);
    window.addEventListener('cf-fit', paint);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });
    // the wait ends while the title stands open: look again now and then
    setInterval(() => { if (!document.hidden && window.Screens && Screens.current === 'title') paint(); }, 30000);
    // a press this page did not see (a reload after voting) still looks for its card
    const at = +Vote._get(Vote.KEY) || 0;
    if (at && Date.now() - at < Vote.BACK_MS) { Vote._armReturn(); Vote._look(); }
    paint();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
