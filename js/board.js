"use strict";
/* THE WORLD BOARD (tests/world-board.mjs, migration 0014 — operator,
   2026-11-04: "The leaderboard is a bit bland … The settings page in
   particular is well designed, let's get the leaderboard to match. I think
   we might need to make a bigger deal out of the top 3 players, then list
   everyone beneath them … Just wanted people to feel a tiny bit of
   additional pride over their placement").

   THE PAGE IS #scrLeaders, DRESSED. The old screen's own nodes are kept —
   #ldrBack (Screens.bind's back, which returns to the reward screen it was
   opened from) and #ldrList (where every message is written) — and the rest
   is built round them once, the first time the board is shown. A cached
   older screens.js still finds both ids and still paints its plain rows.

   THE LOOK IS THE SETTINGS PAGE'S: Cinzel caps, a carved walnut frame with
   a gold-leaf rim, the vector corner ornament (SettingsPage.cornerSvg —
   absent, the frame simply has no corners), chamfered plaques, over the
   title's night painting (Screens.nightBehind). EVERY ORNAMENT IS A VECTOR
   (the chrome ruling): the medals, the laurels, the crown, the trophy, the
   card mark. The only rasters are the trial and origin icons, 256px files
   shown at 26px at most — within their pixels on a 3x screen.

   THE PODIUM: the three best chiefs stand on carved plinths, the first in
   the middle and highest, each under a laurelled medal of their metal, with
   their score, their difficulty and day, the origin card the run was
   founded with, how many victories they hold and, for an assisted win, the
   card mark. EVERYONE ELSE beneath them, a ruled row each, ONE ROW PER
   CHIEF (their best — board_top). The player's own row is gold; when it is
   not on the list it waits at the foot of the pane, and a device the
   dashboard leaves out is told its wins are kept off the board.

   FILTERS: every difficulty or one, all time or this week — a Calm chief
   never makes the overall board past a Hard one, and a newcomer's week can.

   THE CARD THE BOARD LIFTS (Deck.settle, CFG.CARDS.BOARD): a win whose
   score would stand in the overall top ten raises its reward card a tier
   half the time, on the podium every time. The place is read off the board
   as last seen (peek) — the reward screen opens in the same task the run
   ends, with no time to ask the cloud — so the board is looked at a few
   seconds after a run is entered and every few minutes of play, from a page
   whose wins go on it (posts). */
const WorldBoard = {
  LIMIT: 100,                 // the chiefs a board lists (board_top's own ceiling)
  PEEK_MS: 8 * 60 * 1000,     // how often a game in play looks at the board again
  PEEK_AFTER_MS: 4000,        // …and the first look, this long after the world opens (never in the entry's own frames)
  CACHE_MS: 45 * 1000,        // a filter shown again within this is not asked again
  MODES: [['', 'All'], ['hard', 'Hard'], ['moderate', 'Moderate'], ['calm', 'Calm']],
  WHEN: [['0', 'All time'], ['7', 'This week']],
  mode: '',
  days: 0,
  _seq: 0,
  _cache: new Map(),
  _peek: null,                // { at, rows, me, v2 } — the overall all-time board as last seen
  el: null,

  esc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; },
  // CFG is a script-level const: window.CFG is undefined (the window.G trap)
  cfg() { return typeof CFG !== 'undefined' ? CFG : null; },
  art(path) { const C = this.cfg(); return path + '?v=' + ((C && C.ART_V) || 1); },

  /* ---------------- the chrome, drawn ---------------- */
  METALS: {
    1: { hi: '#fffbe2', a: '#f8dc7c', b: '#d6a23b', c: '#94661c', lo: '#4a3006', rib: ['#a3222a', '#e6c25c'], name: 'Gold' },
    2: { hi: '#ffffff', a: '#e8eef5', b: '#b3c0ce', c: '#6c7b8c', lo: '#27303b', rib: ['#22406e', '#cdd8e4'], name: 'Silver' },
    3: { hi: '#fff0de', a: '#eeb07a', b: '#bf7638', c: '#7d4518', lo: '#351a06', rib: ['#2f5a2a', '#e2a46a'], name: 'Bronze' },
  },
  // a laurelled medal on its ribbon, the numeral struck in it
  medal(rank) {
    const M = this.METALS[rank], id = 'wbm' + rank, ink = '#1b1106';
    // a sprig up each side from the foot of the disc: leaves on a ring just
    // outside it, each laid along the ring and splayed a little outward
    const leaves = dir => {
      let s = '';
      for (let i = 0; i < 6; i++) {
        const deg = 90 - dir * (16 + i * 21), t = deg * Math.PI / 180, r = 23.2;
        const x = 32 + r * Math.cos(t), y = 46 + r * Math.sin(t), rot = deg + 90 - dir * 28;
        s += `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="4.4" ry="1.9" transform="rotate(${rot.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
      }
      return s;
    };
    return `<svg class="wbMedal" viewBox="0 0 64 74" aria-hidden="true" focusable="false"><defs>` +
      `<radialGradient id="${id}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${M.hi}"/><stop offset=".3" stop-color="${M.a}"/><stop offset=".72" stop-color="${M.b}"/><stop offset="1" stop-color="${M.c}"/></radialGradient>` +
      `<linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe08a"/><stop offset="1" stop-color="#5d7a2a"/></linearGradient>` +
      '</defs>' +
      // the ribbon, two tails behind the medal
      `<path d="M19,2H29L36,30H26Z" fill="${M.rib[0]}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M35,2H45L38,30H28Z" fill="${M.rib[0]}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M23.3,2L30.4,30M40.7,2L33.6,30" stroke="${M.rib[1]}" stroke-width="1.6" opacity=".85"/>` +
      // the laurel, round the lower half
      `<g fill="url(#${id}l)" stroke="#24300c" stroke-width=".55">${leaves(1)}${leaves(-1)}</g>` +
      // the disc
      `<circle cx="32" cy="46" r="19.5" fill="url(#${id})" stroke="${ink}" stroke-width="1.4"/>` +
      `<circle cx="32" cy="46" r="15.2" fill="none" stroke="${M.c}" stroke-width="1.3"/>` +
      `<circle cx="32" cy="46" r="15.2" fill="none" stroke="${M.hi}" stroke-opacity=".55" stroke-width=".6" transform="translate(-.6 -.6)"/>` +
      `<path d="M20.5,38A13.5,13.5 0 0 1 33,31.5" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>` +
      `<text x="32" y="53.2" text-anchor="middle" font-family="Cinzel, 'Times New Roman', serif" font-weight="700" font-size="20" fill="${M.lo}">${rank}</text>` +
      `<text x="31.4" y="52.4" text-anchor="middle" font-family="Cinzel, 'Times New Roman', serif" font-weight="700" font-size="20" fill="${M.hi}" fill-opacity=".35">${rank}</text>` +
      '</svg>';
  },
  CROWN: '<svg class="wbCrown" viewBox="0 0 40 22" aria-hidden="true" focusable="false"><defs><linearGradient id="wbcg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#fff3c2"/><stop offset=".45" stop-color="#f0c75c"/><stop offset="1" stop-color="#9c6a1c"/></linearGradient></defs>' +
    '<path d="M3,19L1.5,6L11,12L20,2L29,12L38.5,6L37,19Z" fill="url(#wbcg)" stroke="#1b1106" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M4,16.6H36" stroke="#7a5216" stroke-width="1.1"/>' +
    '<circle cx="20" cy="11.5" r="2.4" fill="#c8303a" stroke="#1b1106" stroke-width=".8"/><circle cx="11" cy="14.2" r="1.6" fill="#3d7ac8" stroke="#1b1106" stroke-width=".7"/>' +
    '<circle cx="29" cy="14.2" r="1.6" fill="#3d7ac8" stroke="#1b1106" stroke-width=".7"/>' +
    '<circle cx="20" cy="2.2" r="1.5" fill="#fff3c2" stroke="#1b1106" stroke-width=".7"/><circle cx="1.8" cy="6" r="1.3" fill="#fff3c2" stroke="#1b1106" stroke-width=".7"/><circle cx="38.2" cy="6" r="1.3" fill="#fff3c2" stroke="#1b1106" stroke-width=".7"/></svg>',
  TROPHY: '<svg class="wbTrophy" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><defs><linearGradient id="wbtg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#fff3c2"/><stop offset=".35" stop-color="#f2cd6a"/><stop offset=".75" stop-color="#b8862c"/><stop offset="1" stop-color="#6f4914"/></linearGradient></defs>' +
    '<path d="M9.5,8.5H4.5V12C4.5,17.5 8.5,20.5 13,21M30.5,8.5H35.5V12C35.5,17.5 31.5,20.5 27,21" fill="none" stroke="#1b1106" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M9.5,8.5H4.5V12C4.5,17.5 8.5,20.5 13,21M30.5,8.5H35.5V12C35.5,17.5 31.5,20.5 27,21" fill="none" stroke="url(#wbtg)" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M9,4H31V12C31,19.5 26,24.5 20,24.5S9,19.5 9,12Z" fill="url(#wbtg)" stroke="#1b1106" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M12.5,7.5V12.5C12.5,16.5 14.5,19.5 17.5,21" fill="none" stroke="#fff6d6" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/>' +
    '<path d="M17.5,24.5H22.5L23.5,30H16.5Z" fill="url(#wbtg)" stroke="#1b1106" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M11.5,30H28.5V35.5H11.5Z" fill="#5a3a12" stroke="#1b1106" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M13.5,32.6H26.5" stroke="#e6bd5a" stroke-width="1.2"/>' +
    '<path d="M20,8.6L21.5,12.1L25.2,12.3L22.3,14.6L23.3,18.2L20,16.1L16.7,18.2L17.7,14.6L14.8,12.3L18.5,12.1Z" fill="#fff3c2" stroke="#7a5216" stroke-width=".7" stroke-linejoin="round"/></svg>',
  CARD: '<svg class="wbCard" viewBox="0 0 12 16" aria-hidden="true" focusable="false">' +
    '<rect x="1" y="1" width="10" height="14" rx="1.6" fill="#2a1d10" stroke="#e6bd5a" stroke-width="1.3"/>' +
    '<path d="M6,4.2L7,6.6L9.4,6.8L7.6,8.4L8.2,10.9L6,9.6L3.8,10.9L4.4,8.4L2.6,6.8L5,6.6Z" fill="#f2cd6a"/></svg>',
  ROMAN: { 1: 'I', 2: 'II', 3: 'III' },

  modeName(m) { const C = this.cfg(); return (C && C.MODES && C.MODES[m] && C.MODES[m].name) || (m ? m[0].toUpperCase() + m.slice(1) : ''); },
  modeIcon(m) {
    return m && /^(calm|moderate|hard)$/.test(m)
      ? `<img class="wbMode" src="${this.art('assets/icons/cards/trial-' + m + '.png')}" alt="${this.esc(this.modeName(m))}" title="${this.esc(this.modeName(m))}" onerror="this.remove()">` : '';
  },
  // the origin card the run was founded with — its own 256px icon and name
  origin(key) {
    const d = key && window.Cards && Cards.DEFS && Cards.DEFS[key];
    if (!d || !d.motif) return null;
    return { name: d.name || key, src: this.art('assets/icons/cards/origin-' + d.motif + '.png') };
  },
  originIcon(key) {
    const o = this.origin(key);
    return o ? `<img class="wbOrig" src="${o.src}" alt="${this.esc(o.name)}" title="Founded as ${this.esc(o.name)}" onerror="this.remove()">` : '';
  },
  cardMark(n) {
    n = +n || 0;
    return n > 0 ? `<span class="wbCm" title="Card-assisted: ${n} card${n === 1 ? '' : 's'} played">${this.CARD}<b>${n}</b></span>` : '';
  },
  wins(n, short) { n = +n || 1; return short ? (n > 1 ? `${n} wins` : '1 win') : (n > 1 ? `${n} victories` : '1 victory'); },
  pts(s) { return (+s || 0).toLocaleString('en-US'); },

  /* ---------------- the page ---------------- */
  mount() {
    if (this.el) return this.el;
    const scr = document.getElementById('scrLeaders');
    if (!scr) return null;
    this._css();
    const back = document.getElementById('ldrBack');
    const list = document.getElementById('ldrList') || document.createElement('div');
    list.id = 'ldrList';
    const C = window.SettingsPage && SettingsPage.cornerSvg ? SettingsPage : null;
    scr.classList.add('wb');
    scr.innerHTML =
      '<div class="wbShade"></div>' +
      '<header class="wbHead"><span class="wbBackSlot"></span>' + this.TROPHY +
        '<div class="wbTitle"><h2>Leaderboard</h2><small class="wbCount"></small></div></header>' +
      '<div class="wbFrame">' +
        (C ? [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="wbC ${c}">${C.cornerSvg('wbc' + c, fx, fy)}</i>`).join('') : '') +
        '<div class="wbBar">' +
          `<div class="wbSeg wbModes" role="tablist" aria-label="Difficulty">${this.MODES.map(([k, n]) => `<button type="button" role="tab" data-mode="${k}">${n}</button>`).join('')}</div>` +
          `<div class="wbSeg wbWhen" role="tablist" aria-label="When">${this.WHEN.map(([k, n]) => `<button type="button" role="tab" data-days="${k}">${n}</button>`).join('')}</div>` +
        '</div>' +
        '<div class="wbPane"></div>' +
      '</div>';
    if (back) {
      back.className = 'wbBack';
      back.setAttribute('aria-label', 'Back');
      back.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
      scr.querySelector('.wbBackSlot').replaceWith(back);
    }
    scr.querySelector('.wbPane').appendChild(list);
    scr.querySelector('.wbBar').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode != null) this.mode = b.dataset.mode;
      if (b.dataset.days != null) this.days = +b.dataset.days || 0;
      this._paintBar();
      this.load();
    });
    list.addEventListener('click', e => { if (e.target.closest('[data-act="retry"]')) { this._cache.clear(); this.load(); } });
    this.el = scr;
    return scr;
  },
  _paintBar() {
    if (!this.el) return;
    for (const b of this.el.querySelectorAll('.wbBar button')) {
      const on = b.dataset.mode != null ? b.dataset.mode === this.mode : (+b.dataset.days || 0) === this.days;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  },
  // Screens.onLeaders: every time the board is shown
  onShow() {
    if (!this.mount()) return false;
    this._paintBar();
    this.load();
    return true;
  },
  _key() { return this.mode + '|' + this.days; },
  _say(html) {
    const box = document.getElementById('ldrList');
    if (box) box.innerHTML = html;
    const n = this.el && this.el.querySelector('.wbCount');
    if (n) n.textContent = '';
  },
  async load() {
    const B = window.Backend;
    if (!B || !B.isReady()) {
      this._say('<p class="hint wbMsg">The board lives in the cloud — ' +
        (B && B.configured ? 'still connecting…' : 'cloud saves are not configured.') + '</p>');
      return;
    }
    const key = this._key(), seq = ++this._seq;
    const hit = this._cache.get(key);
    if (hit && performance.now() - hit.at < this.CACHE_MS) { this.render(hit.data); return; }
    if (!hit) this._say(this.skeleton());
    const r = await B.board({ limit: this.LIMIT, mode: this.mode || null, days: this.days || null });
    if (seq !== this._seq || Screens.current !== 'leaders') return;   // a later ask, or the page left: drop it
    if (!r.ok) {
      const why = (window.Screens && Screens.whyNet) ? Screens.whyNet(r.error) : 'the cloud could not be reached';
      this._say(`<p class="hint wbMsg">The world board could not be shown: ${this.esc(why)}</p>` +
        '<button class="wbRetry" type="button" data-act="retry">Try again</button>');
      return;
    }
    this._cache.set(key, { at: performance.now(), data: r.data });
    if (!this.mode && !this.days) this._keep(r.data);
    this.render(r.data);
  },
  skeleton() {
    const step = (k, h) => `<div class="wbStep s${k} wbGhost"><div class="wbWho"><i class="wbMedalGhost"></i><i class="wbBarGhost"></i><i class="wbBarGhost short"></i></div>` +
      `<div class="wbPlinth" style="--h:${h}"><b>${this.ROMAN[k]}</b></div></div>`;
    return `<div class="wbPodium">${step(2, 46)}${step(1, 66)}${step(3, 32)}</div><p class="wbMsg wbWait">Reading the board…</p>`;
  },

  /* ---------------- the board, drawn ---------------- */
  render(d) {
    const box = document.getElementById('ldrList');
    if (!box) return;
    const rows = Array.isArray(d && d.rows) ? d.rows : [];
    const n = this.el && this.el.querySelector('.wbCount');
    if (n) n.textContent = rows.length ? `${(+d.players || rows.length).toLocaleString('en-US')} chief${(+d.players || rows.length) === 1 ? '' : 's'}${this.mode ? ' · ' + this.modeName(this.mode) : ''}${this.days ? ' · this week' : ''}` : '';
    if (!rows.length) {
      box.innerHTML = this.podium([]) + `<p class="wbMsg wbEmpty">${this.days ? 'No victories this week yet' : 'No chiefs on this board yet'} — be the first.</p>` + this.meRow(d, rows) + this.foot(d);
      return;
    }
    const rest = rows.slice(3).map(r => this.row(r)).join('');
    box.innerHTML = this.podium(rows.slice(0, 3)) + (rest ? `<ol class="wbList">${rest}</ol>` : '') + this.meRow(d, rows) + this.foot(d);
  },
  podium(top) {
    const H = { 1: 66, 2: 46, 3: 32 };
    const step = k => {
      const r = top[k - 1];
      if (!r) return `<div class="wbStep s${k} wbOpen"><div class="wbWho"><span class="wbMedalBox">${this.medal(k)}</span><b class="wbNm">Unclaimed</b></div>` +
        `<div class="wbPlinth" style="--h:${H[k]}"><b>${this.ROMAN[k]}</b></div></div>`;
      const tags = this.originIcon(r.origin) + this.modeIcon(r.mode) + this.cardMark(r.cards);
      return `<div class="wbStep s${k}${r.mine ? ' mine' : ''}" aria-label="${this.esc(`Place ${k}: ${r.name}, ${this.pts(r.score)} points`)}">` +
        '<div class="wbWho">' +
          (k === 1 ? this.CROWN : '') + `<span class="wbMedalBox">${this.medal(k)}</span>` +
          `<b class="wbNm">${this.esc(r.name)}</b>` +
          `<span class="wbPts">${this.pts(r.score)}</span>` +
          `<span class="wbTags">${tags}</span>` +
          `<small class="wbSub">${r.day ? 'Day ' + (+r.day) + ' · ' : ''}${this.wins(r.wins, true)}</small>` +
          (r.mine ? '<i class="wbYou">You</i>' : '') +
        '</div>' +
        `<div class="wbPlinth" style="--h:${H[k]}"><b>${this.ROMAN[k]}</b></div></div>`;
    };
    return `<div class="wbPodium">${step(2)}${step(1)}${step(3)}</div>`;
  },
  row(r, me) {
    const tags = this.originIcon(r.origin) + this.modeIcon(r.mode) + this.cardMark(r.cards);
    return `<li class="wbRow${r.mine || me ? ' mine' : ''}${me ? ' wbMe' : ''}">` +
      `<span class="wbRk">${r.rank != null ? r.rank : '—'}</span>` +
      `<span class="wbWhoR"><b>${this.esc(r.name)}${r.mine || me ? '<i class="wbYou">You</i>' : ''}</b>` +
        `<small>${r.day ? 'Day ' + (+r.day) + ' · ' : ''}${this.wins(r.wins)}</small></span>` +
      `<span class="wbTags">${tags}</span>` +
      `<span class="wbPts">${this.pts(r.score)}</span></li>`;
  },
  // the player's own best, at the foot of the pane, when it is not already on the list
  meRow(d, rows) {
    const me = d && d.me;
    if (!me) return '';
    if (me.hidden) return '<p class="wbMine wbAside">Your games on this device are kept off the board.</p>';
    if (rows.some(r => r.mine)) return '';
    return `<ol class="wbList wbMeList">${this.row(me, true)}</ol>`;
  },
  foot() {
    const K = this.cfg(), C = K && K.CARDS && K.CARDS.BOARD;
    const lift = C && C.ON !== false
      ? ` Win a place in the top ${C.TOP} and your reward card may rise a tier — on the podium, it always does.` : '';
    return `<p class="wbFoot">One place for each chief — their best victory. The hardest roads score highest.${lift}</p>`;
  },

  /* ---------------- the board as last seen (the card's lift) ---------------- */
  _keep(data) {
    if (!data || !Array.isArray(data.rows)) return;
    this._peek = { at: Date.now(), rows: data.rows, me: data.me || null, v2: !!data.v2 };
  },
  /* only a page whose wins go on the board looks at it for them: the live
     site, or a test's mock (a test build, ?dev= or a local server holds every
     win, so its board would lift nothing — and nothing leaves it unasked) */
  posts() {
    const B = window.Backend;
    return !!(B && B.isReady && B.isReady() && (B.mock || (B.telemetryAllowed && B.telemetryAllowed())));
  },
  async peek() {
    const B = window.Backend;
    if (!this.posts() || this._peeking) return;
    this._peeking = true;
    try {
      const r = await B.board({ limit: this.LIMIT });
      if (r && r.ok) { this._keep(r.data); this._cache.set('|0', { at: performance.now(), data: r.data }); }
    } catch (e) { /* the board is a nicety: a failure leaves the last look standing */ }
    finally { this._peeking = false; }
  },
  // look at the board while a game is played — on entry, then every few minutes
  watch() {
    clearTimeout(this._peekT);
    this._peekT = setTimeout(() => this.peek(), this.PEEK_AFTER_MS);
    if (this._watchT) return;
    this._watchT = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (window.Screens && Screens.current === 'playing' && !Screens._demo) this.peek();
    }, this.PEEK_MS);
  },
  /* where a score would stand on the overall board as last seen: 1 + the
     OTHER chiefs whose best beats it (the player's own best never pushes
     their own run down). null when the board has never been seen. */
  placeFor(score) {
    const c = this._peek;
    if (!c || !Array.isArray(c.rows)) return null;
    let above = 0;
    for (const r of c.rows) if (!r.mine && (+r.score || 0) > (+score || 0)) above++;
    return above + 1;
  },

  _css() {
    if (document.getElementById('wbCss')) return;
    const st = document.createElement('style');
    st.id = 'wbCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
  },
};

WorldBoard.CSS = `
#scrLeaders.wb { --chamfer: polygon(0 5px, 3px 5px, 3px 3px, 5px 3px, 5px 0, calc(100% - 5px) 0, calc(100% - 5px) 3px, calc(100% - 3px) 3px,
    calc(100% - 3px) 5px, 100% 5px, 100% calc(100% - 5px), calc(100% - 3px) calc(100% - 5px), calc(100% - 3px) calc(100% - 3px),
    calc(100% - 5px) calc(100% - 3px), calc(100% - 5px) 100%, 5px 100%, 5px calc(100% - 3px), 3px calc(100% - 3px), 3px calc(100% - 5px), 0 calc(100% - 5px));
  --ink: #f3e2b4; --txt: #e8dcbd; --dim: #ab9c7e; --sans: -apple-system, "Segoe UI", Roboto, sans-serif;
  background: none; color: var(--txt); font-family: var(--menufont); align-items: center; padding: 0; }
#scrLeaders.wb .wbShade { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 90% 70% at 50% 40%, rgba(10,7,4,0.25), rgba(10,7,4,0.78)), linear-gradient(rgba(10,7,4,0.55), rgba(10,7,4,0.2) 30%, rgba(10,7,4,0.55)); }

/* ---- the header: back plaque, the trophy, the word ---- */
#scrLeaders.wb .wbHead { position: relative; z-index: 1; width: 100%; max-width: 900px; flex: 0 0 auto; display: flex; align-items: center; gap: 12px;
  padding: calc(var(--safe-top) + 10px) 14px 10px; }
#scrLeaders.wb .wbBack { position: relative; isolation: isolate; width: 46px; height: 44px; min-height: 0; flex: 0 0 auto; padding: 0; border: 0; background: none; cursor: pointer;
  color: #f1d17a; display: flex; align-items: center; justify-content: center; box-shadow: none; -webkit-appearance: none; appearance: none; }
#scrLeaders.wb .wbBack::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#3b3020, #241c11); box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.6), inset 0 10px 0 rgba(255,240,200,0.06); }
#scrLeaders.wb .wbBack svg { width: 18px; height: 18px; filter: drop-shadow(0 1px 0 #000); }
#scrLeaders.wb .wbBack:active { transform: translateY(2px); }
#scrLeaders.wb .wbTrophy { width: 38px; height: 38px; flex: 0 0 auto; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.7)); }
#scrLeaders.wb .wbTitle { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
#scrLeaders.wb .wbHead h2 { margin: 0; font: 800 28px/1 var(--menufont); letter-spacing: 2px; white-space: nowrap;
  background: linear-gradient(#fff3c8 0%, #f2cd6a 45%, #c08a2c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.85)); }
#scrLeaders.wb .wbCount { font: 700 10.5px/1 var(--menufont); letter-spacing: 2px; text-transform: uppercase; color: #cdb57c; text-shadow: 0 1px 0 #000; min-height: 10px; }

/* ---- the carved frame (the settings page's) ---- */
#scrLeaders.wb .wbFrame { position: relative; z-index: 1; flex: 1 1 auto; min-height: 0; width: calc(100% - 20px); max-width: 860px;
  margin: 0 10px calc(env(safe-area-inset-bottom, 0px) + 10px); display: flex; flex-direction: column; padding: 8px;
  background:
    repeating-linear-gradient(92deg, rgba(255,214,150,0.022) 0 1px, rgba(0,0,0,0) 1px 6px, rgba(0,0,0,0.05) 6px 7px, rgba(0,0,0,0) 7px 13px),
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(110,74,34,0.25), rgba(0,0,0,0) 70%),
    linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 26px rgba(0,0,0,0.65), 0 12px 34px rgba(0,0,0,0.65); }
#scrLeaders.wb .wbC { position: absolute; z-index: 3; display: block; width: 42px; height: 42px; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
#scrLeaders.wb .wbC svg { display: block; width: 100%; height: 100%; overflow: visible; }
#scrLeaders.wb .wbC.tl { left: -6px; top: -6px; }
#scrLeaders.wb .wbC.tr { right: -6px; top: -6px; transform: scaleX(-1); }
#scrLeaders.wb .wbC.bl { left: -6px; bottom: -6px; transform: scaleY(-1); }
#scrLeaders.wb .wbC.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }

/* ---- the filters: two small segmented bars (the settings page's cadence bar) ---- */
#scrLeaders.wb .wbBar { flex: 0 0 auto; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 10px; padding: 10px 8px 10px; position: relative; z-index: 2;
  border-bottom: 1px solid rgba(214,170,74,0.22); box-shadow: 0 1px 0 rgba(0,0,0,0.5); }
#scrLeaders.wb .wbSeg { display: flex; height: 32px; clip-path: var(--chamfer); background: #120d07; padding: 2px; gap: 2px;
  box-shadow: inset 0 0 0 1px #050302, inset 0 0 0 2px rgba(214,170,74,0.45); flex: 1 1 260px; max-width: 360px; }
#scrLeaders.wb .wbWhen { flex: 0 1 200px; }
#scrLeaders.wb .wbSeg button { flex: 1 1 0; min-width: 0; height: 100%; min-height: 0; border: 0; border-radius: 0; padding: 0 4px; cursor: pointer; white-space: nowrap;
  background: linear-gradient(#2c2216, #1f170e); color: #cdbd99; box-shadow: none; font: 700 11px/1 var(--menufont); letter-spacing: 0.5px; text-transform: uppercase;
  -webkit-appearance: none; appearance: none; }
#scrLeaders.wb .wbSeg button.on { color: #2b1906; text-shadow: 0 1px 0 rgba(255,240,190,0.5);
  background: linear-gradient(#f0cd6e 0%, #d7a542 50%, #b8862c 100%); box-shadow: inset 0 0 0 1px #fff0b8; }
#scrLeaders.wb .wbSeg button:focus-visible { outline: 2px solid #e8c15a; outline-offset: -2px; }

/* ---- the pane ---- */
#scrLeaders.wb .wbPane { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  padding: 6px 8px 0; position: relative; z-index: 1; overscroll-behavior: contain; }
#scrLeaders.wb #ldrList { display: flex; flex-direction: column; min-height: 100%; }
#scrLeaders.wb .wbMsg { margin: 14px 8px; text-align: center; font: 600 13.5px/1.45 var(--sans); color: var(--dim); }
#scrLeaders.wb .wbMsg.hint { margin-top: 28px; }
#scrLeaders.wb .wbWait { animation: wbPulse 1.2s ease-in-out infinite; }
@keyframes wbPulse { 50% { opacity: 0.45; } }
#scrLeaders.wb .wbRetry { align-self: center; position: relative; isolation: isolate; height: 38px; min-height: 0; padding: 0 18px; border: 0; background: none; cursor: pointer;
  color: #f4e8cc; font: 700 12.5px/1 var(--menufont); letter-spacing: 1.4px; text-transform: uppercase; text-shadow: 0 1px 0 rgba(0,0,0,0.85); box-shadow: none; }
#scrLeaders.wb .wbRetry::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#3b3020 0%, #2c2316 50%, #241c11 100%);
  box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.48), inset 0 10px 0 rgba(255,240,200,0.06), inset 0 -8px 0 rgba(0,0,0,0.28); }

/* ---- the podium ---- */
#scrLeaders.wb .wbPodium { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 6px;
  padding: 18px 2px 0; margin: 0 0 4px; }
#scrLeaders.wb .wbPodium::before { content: ''; position: absolute; left: 50%; top: 4px; width: 62%; height: 78%; transform: translateX(-50%); pointer-events: none;
  background: radial-gradient(ellipse at 50% 42%, rgba(255,214,120,0.22), rgba(255,200,90,0.07) 45%, rgba(0,0,0,0) 70%); }
#scrLeaders.wb .wbStep { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: stretch; }
#scrLeaders.wb .wbWho { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0 2px 8px; text-align: center; min-width: 0; }
#scrLeaders.wb .wbMedalBox { display: block; width: 50px; height: 58px; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.6)); }
#scrLeaders.wb .s1 .wbMedalBox { width: 62px; height: 72px; }
#scrLeaders.wb .wbMedal { display: block; width: 100%; height: 100%; }
#scrLeaders.wb .wbCrown { display: block; width: 34px; height: 19px; margin: 0 0 -6px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.7)); position: relative; z-index: 1; }
#scrLeaders.wb .wbNm { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px;
  font: 800 15px/1.1 var(--menufont); letter-spacing: 1.5px; text-transform: uppercase; color: #f6e7c0; text-shadow: 0 2px 0 rgba(0,0,0,0.85); }
#scrLeaders.wb .s1 .wbNm { font-size: 17px; color: #fff2c4; }
#scrLeaders.wb .wbStep .wbPts { font: 800 17px/1 var(--menufont); letter-spacing: 0.5px; font-variant-numeric: tabular-nums;
  background: linear-gradient(#fff3c8 0%, #f2cd6a 50%, #c08a2c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 1.5px 0 rgba(0,0,0,0.9)); }
#scrLeaders.wb .s1 .wbPts { font-size: 20px; }
#scrLeaders.wb .s2 .wbPts { background-image: linear-gradient(#ffffff, #dfe6ee 50%, #93a3b4); }
#scrLeaders.wb .s3 .wbPts { background-image: linear-gradient(#fff0de, #eeb07a 50%, #a8662e); }
#scrLeaders.wb .wbSub { font: 600 11px/1.25 var(--sans); color: #a8997b; }
#scrLeaders.wb .wbTags { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 22px; }
#scrLeaders.wb .wbTags img { display: block; width: 22px; height: 22px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
#scrLeaders.wb .wbTags img.wbMode { width: 19px; height: 19px; }
#scrLeaders.wb .wbCm { display: inline-flex; align-items: center; gap: 2px; padding: 0 4px 0 3px; height: 19px; border-radius: 3px; background: rgba(8,6,3,0.7);
  box-shadow: inset 0 0 0 1px rgba(214,170,74,0.45); font: 700 10.5px/1 var(--menufont); color: #f2cd6a; }
#scrLeaders.wb .wbCard { width: 10px; height: 14px; display: block; }
#scrLeaders.wb .wbYou { display: inline-block; vertical-align: middle; margin-left: 6px; padding: 2px 5px 1px; font: 800 9px/1 var(--menufont); letter-spacing: 1px; font-style: normal;
  text-transform: uppercase; color: #2b1906; background: linear-gradient(#f4d272, #c8942f); clip-path: var(--chamfer); }
#scrLeaders.wb .wbStep .wbYou { position: absolute; top: -6px; right: 4px; margin: 0; }
#scrLeaders.wb .wbOpen .wbMedalBox { opacity: 0.35; filter: grayscale(0.6); }
#scrLeaders.wb .wbOpen .wbNm { color: #7d6f55; font-size: 12px; letter-spacing: 1px; }
/* the plinth: carved stone, its numeral cut into the face */
#scrLeaders.wb .wbPlinth { position: relative; height: calc(var(--h) * 1px); display: flex; align-items: center; justify-content: center;
  clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%, 0 6px);
  background: linear-gradient(90deg, rgba(0,0,0,0.25), rgba(255,255,255,0.04) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.3)),
    linear-gradient(#6b5a43 0%, #54453a 14%, #43372b 60%, #322820 100%);
  box-shadow: inset 0 3px 0 rgba(255,236,190,0.18), inset 0 -2px 0 rgba(0,0,0,0.4); }
#scrLeaders.wb .wbPlinth::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 6px;
  background: linear-gradient(#cfa34a, #8a6420); opacity: 0.85; }
#scrLeaders.wb .s1 .wbPlinth::before { background: linear-gradient(#ffe9a0, #c99632); opacity: 1; }
#scrLeaders.wb .s2 .wbPlinth::before { background: linear-gradient(#eef3f8, #8d9cad); }
#scrLeaders.wb .s3 .wbPlinth::before { background: linear-gradient(#f2bd8c, #93561f); }
#scrLeaders.wb .wbPlinth b { margin-top: 5px; font: 700 20px/1 var(--menufont); color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: linear-gradient(#ffe9a6, #c99632); filter: drop-shadow(0 -1px 0 rgba(0,0,0,0.7)) drop-shadow(0 1px 0 rgba(255,236,190,0.18)); }
#scrLeaders.wb .s1 .wbPlinth b { font-size: 26px; }
#scrLeaders.wb .s2 .wbPlinth b { background-image: linear-gradient(#ffffff, #9fb0c2); }
#scrLeaders.wb .s3 .wbPlinth b { background-image: linear-gradient(#ffd9b0, #b06a30); }
#scrLeaders.wb .wbStep.mine .wbPlinth { box-shadow: inset 0 3px 0 rgba(255,236,190,0.18), inset 0 0 0 2px rgba(242,207,108,0.55); }
/* the skeleton while the board is read */
#scrLeaders.wb .wbGhost .wbMedalGhost { display: block; width: 46px; height: 46px; border-radius: 50%; margin-top: 8px; background: rgba(214,170,74,0.12); }
#scrLeaders.wb .wbGhost .wbBarGhost { display: block; width: 70%; height: 10px; margin-top: 6px; background: rgba(214,170,74,0.1); }
#scrLeaders.wb .wbGhost .wbBarGhost.short { width: 45%; }
#scrLeaders.wb .wbGhost { animation: wbPulse 1.2s ease-in-out infinite; }

/* ---- everyone beneath them ---- */
#scrLeaders.wb .wbList { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
#scrLeaders.wb .wbRow { display: flex; align-items: center; gap: 10px; min-height: 50px; padding: 6px 10px 6px 6px; background: rgba(8,6,3,0.45);
  box-shadow: inset 0 0 0 1px rgba(214,170,74,0.14); }
#scrLeaders.wb .wbRow:nth-child(odd) { background: rgba(20,14,8,0.5); }
#scrLeaders.wb .wbRk { flex: 0 0 auto; min-width: 36px; height: 30px; padding: 0 4px; display: flex; align-items: center; justify-content: center; clip-path: var(--chamfer);
  font: 700 13px/1 var(--menufont); color: var(--ink); font-variant-numeric: tabular-nums; background: rgba(8,6,3,0.8); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.4); }
#scrLeaders.wb .wbWhoR { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
#scrLeaders.wb .wbWhoR b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 14.5px/1.15 var(--menufont); letter-spacing: 1.4px;
  text-transform: uppercase; color: #f2e4c1; }
#scrLeaders.wb .wbWhoR small { font: 600 11px/1.2 var(--sans); color: #998b6e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#scrLeaders.wb .wbRow .wbTags { flex: 0 0 auto; gap: 3px; }
#scrLeaders.wb .wbRow .wbTags img { width: 20px; height: 20px; }
#scrLeaders.wb .wbRow .wbTags img.wbMode { width: 17px; height: 17px; }
#scrLeaders.wb .wbRow .wbPts { flex: 0 0 auto; min-width: 58px; text-align: right; font: 800 15px/1 var(--menufont); color: #f0cd6e; font-variant-numeric: tabular-nums;
  text-shadow: 0 1.5px 0 rgba(0,0,0,0.9); }
#scrLeaders.wb .wbRow.mine { background: linear-gradient(90deg, rgba(122,88,30,0.55), rgba(60,42,14,0.5)); box-shadow: inset 0 0 0 1px #f2cf6c, inset 0 0 0 2px rgba(60,40,10,0.8); }
#scrLeaders.wb .wbRow.mine .wbRk { color: #2b1906; background: linear-gradient(#f4d272, #c8942f); box-shadow: inset 0 0 0 1px #fff0b8; }
/* the player's own best, held at the foot of the pane */
#scrLeaders.wb .wbMeList { position: sticky; bottom: 0; z-index: 2; margin-top: 10px; padding: 6px 0 8px;
  background: linear-gradient(rgba(22,15,8,0), #1a120a 30%); }
#scrLeaders.wb .wbMine { margin: 12px 4px 0; padding: 10px 12px; text-align: center; font: 600 12.5px/1.4 var(--sans); color: #cdb57c;
  background: rgba(8,6,3,0.55); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.3); }
#scrLeaders.wb .wbFoot { margin: auto 6px 0; padding: 16px 4px 14px; text-align: center; font: 12px/1.5 var(--sans); color: #8f8167; }
#scrLeaders.wb .wbEmpty { margin-top: 8px; }

/* ---- a wide window: the page stands in the middle, everything a size up ---- */
@media (min-width: 720px) {
  #scrLeaders.wb { justify-content: center; }
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 18px) 18px 14px; max-width: 860px; }
  #scrLeaders.wb .wbHead h2 { font-size: 34px; }
  #scrLeaders.wb .wbTrophy { width: 44px; height: 44px; }
  #scrLeaders.wb .wbFrame { width: calc(100% - 48px); margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); max-height: 820px; padding: 10px; }
  #scrLeaders.wb .wbC { width: 58px; height: 58px; }
  #scrLeaders.wb .wbC.tl { left: -8px; top: -8px; } #scrLeaders.wb .wbC.tr { right: -8px; top: -8px; }
  #scrLeaders.wb .wbC.bl { left: -8px; bottom: -8px; } #scrLeaders.wb .wbC.br { right: -8px; bottom: -8px; }
  #scrLeaders.wb .wbBar { padding: 14px 16px 12px; }
  #scrLeaders.wb .wbPane { padding: 8px 24px 0; }
  #scrLeaders.wb .wbPodium { gap: 14px; padding: 26px 40px 0; }
  #scrLeaders.wb .wbMedalBox { width: 60px; height: 70px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 76px; height: 88px; }
  #scrLeaders.wb .wbCrown { width: 42px; height: 23px; }
  #scrLeaders.wb .wbNm { font-size: 18px; }
  #scrLeaders.wb .s1 .wbNm { font-size: 21px; }
  #scrLeaders.wb .wbStep .wbPts { font-size: 21px; }
  #scrLeaders.wb .s1 .wbPts { font-size: 25px; }
  #scrLeaders.wb .wbSub { font-size: 12px; }
  #scrLeaders.wb .wbTags img { width: 28px; height: 28px; }
  #scrLeaders.wb .wbTags img.wbMode { width: 24px; height: 24px; }
  #scrLeaders.wb .wbCm { height: 22px; font-size: 12px; }
  #scrLeaders.wb .wbCard { width: 12px; height: 16px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 1.5px); }
  #scrLeaders.wb .wbPlinth b { font-size: 26px; }
  #scrLeaders.wb .s1 .wbPlinth b { font-size: 34px; }
  #scrLeaders.wb .wbSeg { height: 36px; }
  #scrLeaders.wb .wbSeg button { font-size: 12px; letter-spacing: 1px; }
  #scrLeaders.wb .wbCount { font-size: 11.5px; }
  #scrLeaders.wb .wbRow .wbTags img { width: 24px; height: 24px; }
  #scrLeaders.wb .wbRow .wbTags img.wbMode { width: 21px; height: 21px; }
  #scrLeaders.wb .wbRk { min-width: 42px; height: 34px; font-size: 14px; }
  #scrLeaders.wb .wbFoot { font-size: 13px; }
  #scrLeaders.wb .wbRow { min-height: 54px; padding: 6px 16px 6px 8px; gap: 14px; }
  #scrLeaders.wb .wbWhoR b { font-size: 16px; }
  #scrLeaders.wb .wbWhoR small { font-size: 12px; }
  #scrLeaders.wb .wbRow .wbPts { font-size: 17px; min-width: 76px; }
}
/* a short wide window — a phone on its side: the header and the podium tighten */
@media (min-width: 720px) and (max-height: 560px) {
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 6px) 18px 6px; }
  #scrLeaders.wb .wbHead h2 { font-size: 26px; }
  #scrLeaders.wb .wbTrophy { width: 34px; height: 34px; }
  #scrLeaders.wb .wbFrame { margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); }
  #scrLeaders.wb .wbBar { padding: 8px 12px; }
  #scrLeaders.wb .wbSeg { height: 32px; }
  #scrLeaders.wb .wbPodium { padding-top: 10px; gap: 10px; }
  #scrLeaders.wb .wbMedalBox { width: 40px; height: 46px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 48px; height: 56px; }
  #scrLeaders.wb .wbCrown { width: 30px; height: 17px; margin-bottom: -5px; }
  #scrLeaders.wb .wbWho { gap: 2px; padding-bottom: 6px; }
  #scrLeaders.wb .wbNm { font-size: 15px; }
  #scrLeaders.wb .s1 .wbNm { font-size: 17px; }
  #scrLeaders.wb .wbStep .wbPts { font-size: 17px; }
  #scrLeaders.wb .s1 .wbPts { font-size: 20px; }
  #scrLeaders.wb .wbTags { min-height: 20px; }
  #scrLeaders.wb .wbTags img { width: 22px; height: 22px; }
  #scrLeaders.wb .wbTags img.wbMode { width: 19px; height: 19px; }
  #scrLeaders.wb .wbSub { font-size: 11px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 0.6px); }
  #scrLeaders.wb .wbPlinth b, #scrLeaders.wb .s1 .wbPlinth b { font-size: 18px; margin-top: 4px; }
}
/* the narrowest phones */
@media (max-width: 359px) {
  #scrLeaders.wb .wbHead { gap: 9px; }
  #scrLeaders.wb .wbHead h2 { font-size: 21px; letter-spacing: 1.2px; }
  #scrLeaders.wb .wbTrophy { width: 30px; height: 30px; }
  #scrLeaders.wb .wbSeg button { font-size: 10px; letter-spacing: 0.2px; }
  #scrLeaders.wb .wbMedalBox { width: 44px; height: 51px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 54px; height: 63px; }
  #scrLeaders.wb .wbNm { font-size: 13px; letter-spacing: 1px; }
  #scrLeaders.wb .s1 .wbNm { font-size: 15px; }
  #scrLeaders.wb .wbStep .wbPts { font-size: 15px; }
  #scrLeaders.wb .s1 .wbPts { font-size: 17px; }
  #scrLeaders.wb .wbRow .wbTags img.wbOrig { display: none; }
}
@media (prefers-reduced-motion: reduce) { #scrLeaders.wb .wbWait, #scrLeaders.wb .wbGhost { animation: none; } }
`;
window.WorldBoard = WorldBoard;
