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
   (the chrome ruling): the medals, the laurels, the crown, the trophy. The
   only rasters are the trial icons, 256px files shown at 28px at most —
   within their pixels on a 3x screen.

   THE PODIUM: the three best chiefs stand on carved plinths, the first in
   the middle and highest, each under a laurelled medal of their metal.
   The ranks to tenth beneath them, a ruled row each, ONE ROW PER CHIEF
   (their best — board_top). A place says FOUR THINGS AND NOTHING ELSE
   (operator, 2026-11-04: "Get rid of the number of wins under the player and
   the day … get rid of the icon for the origin card. Just name, points,
   difficulty and place"): no day, no win count, no origin icon, no card
   mark, no chief count over the board and no words under it ("Delete the
   text at the bottom … Keep the page clean"). The rows still carry the
   origin and the card count (the post and the table keep them); the page
   shows none of it. The player's own row is gold; when it is not on the
   list it waits at the foot of the pane, and a device the dashboard leaves
   out is told its wins are kept off the board.

   THE FILTERS ARE PUT AWAY (operator, 2026-11-04: "hide the filter (for
   now). It's too much, makes the page look cluttered and dilutes the value
   of being on the leaderboard"): FILTERS false builds no bar and the board
   is always the overall, all-time one. The code stays — every difficulty or
   one, all time or this week — and FILTERS true brings it back as it was.

   ONE PAGE, NO EMPTY SPACE ("Vertically Re-size the ranking list so there
   isn't unbalanced empty space. Make sure everything fits on a single
   page"): the board is the TOP TEN (SHOW), the frame is as tall as what it
   holds and stands in the middle of the screen with the title, and nothing
   scrolls. EVERY ONE OF THE TEN IS SHOWN (operator, build 161: "It only
   shows 9 and not 10 … Literally anyone that wins should take the tenth
   spot"): build 143 left the lowest ranks off a window too short for them,
   and on a 1280x720 laptop that was the tenth. Where the ten do not fit,
   _fit (measured: the pane's own overflow) presses the rows under the
   podium down to ROW_MIN, puts away the hidden device's note, shrinks the
   podium (POD_MIN), then tightens the rows (ROW_FLOOR) — and on a window
   too small even for that the pane scrolls with all ten in it. A rank is
   never left off. A phone on its side puts the podium beside the rows.

   THE CARD THE BOARD LIFTS is said on the reward screen ("▲ Board #N"),
   never here.

   THE CARD THE BOARD LIFTS (Deck.settle, CFG.CARDS.BOARD): a win whose
   score would stand in the overall top ten raises its reward card a tier
   half the time, on the podium every time. The place is read off the board
   as last seen (peek) — the reward screen opens in the same task the run
   ends, with no time to ask the cloud — so the board is looked at a few
   seconds after a run is entered and every few minutes of play, from a page
   whose wins go on it (posts). */
const WorldBoard = {
  LIMIT: 100,                 // the chiefs a board asks for (board_top's own ceiling — the card's lift reads them)
  SHOW: 10,                   // the chiefs the page shows: the podium and the ranks under it to tenth
  ROW_MIN: 38,                // how far a row under the podium is pressed before anything else gives
  POD_MIN: 0.62,              // how small the podium may be drawn (a zoom) to keep the ten on one page
  ROW_FLOOR: 26,              // the tightest row, its rank chip and padding stepped down (.wbTight)
  FILTERS: false,             // the difficulty / week bars: put away for now (the operator's word)
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
  ROMAN: { 1: 'I', 2: 'II', 3: 'III' },

  modeName(m) { const C = this.cfg(); return (C && C.MODES && C.MODES[m] && C.MODES[m].name) || (m ? m[0].toUpperCase() + m.slice(1) : ''); },
  modeIcon(m) {
    return m && /^(calm|moderate|hard)$/.test(m)
      ? `<img class="wbMode" src="${this.art('assets/icons/cards/trial-' + m + '.png')}" alt="${this.esc(this.modeName(m))}" title="${this.esc(this.modeName(m))}" onerror="this.remove()">` : '';
  },
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
    if (!this.FILTERS) { this.mode = ''; this.days = 0; }
    scr.innerHTML =
      '<div class="wbShade"></div>' +
      '<header class="wbHead"><span class="wbBackSlot"></span>' + this.TROPHY +
        '<div class="wbTitle"><h2>Leaderboard</h2></div></header>' +
      '<div class="wbFrame">' +
        (C ? [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="wbC ${c}">${C.cornerSvg('wbc' + c, fx, fy)}</i>`).join('') : '') +
        (this.FILTERS ? '<div class="wbBar">' +
          `<div class="wbSeg wbModes" role="tablist" aria-label="Difficulty">${this.MODES.map(([k, n]) => `<button type="button" role="tab" data-mode="${k}">${n}</button>`).join('')}</div>` +
          `<div class="wbSeg wbWhen" role="tablist" aria-label="When">${this.WHEN.map(([k, n]) => `<button type="button" role="tab" data-days="${k}">${n}</button>`).join('')}</div>` +
        '</div>' : '') +
        '<div class="wbPane"></div>' +
      '</div>';
    if (back) {
      back.className = 'wbBack';
      back.setAttribute('aria-label', 'Back');
      back.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>';
      scr.querySelector('.wbBackSlot').replaceWith(back);
    }
    scr.querySelector('.wbPane').appendChild(list);
    const bar = scr.querySelector('.wbBar');
    if (bar) bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode != null) this.mode = b.dataset.mode;
      if (b.dataset.days != null) this.days = +b.dataset.days || 0;
      this._paintBar();
      this.load();
    });
    list.addEventListener('click', e => { if (e.target.closest('[data-act="retry"]')) { this._cache.clear(); this.load(); } });
    // the page is fitted to the window: again whenever the window changes
    const refit = () => { if (window.Screens && Screens.current === 'leaders') this._fit(); };
    window.addEventListener('resize', refit);
    window.addEventListener('cf-fit', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit, () => {});
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
    if (!this.FILTERS) { this.mode = ''; this.days = 0; }
    this._paintBar();
    this.load();
    return true;
  },
  _key() { return this.mode + '|' + this.days; },
  _say(html) {
    const box = document.getElementById('ldrList');
    if (box) box.innerHTML = html;
    this._fit();
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
    const rest = rows.length ? rows.slice(3, this.SHOW).map(r => this.row(r)).join('')
      : `<p class="wbMsg wbEmpty">${this.days ? 'No victories this week yet' : 'No chiefs on this board yet'} — be the first.</p>`;
    // the podium, and beside or beneath it the rest: the ranks to tenth and your own best
    box.innerHTML = this.podium(rows.slice(0, 3)) +
      `<div class="wbRest">${rows.length > 3 ? `<ol class="wbList">${rest}</ol>` : rows.length ? '' : rest}${this.meRow(d, rows)}</div>`;
    this._fit();
  },
  podium(top) {
    const H = { 1: 66, 2: 46, 3: 32 };
    const step = k => {
      const r = top[k - 1];
      if (!r) return `<div class="wbStep s${k} wbOpen"><div class="wbWho"><span class="wbMedalBox">${this.medal(k)}</span><b class="wbNm">Unclaimed</b></div>` +
        `<div class="wbPlinth" style="--h:${H[k]}"><b>${this.ROMAN[k]}</b></div></div>`;
      return `<div class="wbStep s${k}${r.mine ? ' mine' : ''}" aria-label="${this.esc(`Place ${k}: ${r.name}, ${this.pts(r.score)} points, ${this.modeName(r.mode)}`)}">` +
        '<div class="wbWho">' +
          (k === 1 ? this.CROWN : '') + `<span class="wbMedalBox">${this.medal(k)}</span>` +
          `<b class="wbNm">${this.esc(r.name)}</b>` +
          `<span class="wbPts">${this.pts(r.score)}</span>` +
          `<span class="wbTags">${this.modeIcon(r.mode)}</span>` +
          (r.mine ? '<i class="wbYou">You</i>' : '') +
        '</div>' +
        `<div class="wbPlinth" style="--h:${H[k]}"><b>${this.ROMAN[k]}</b></div></div>`;
    };
    return `<div class="wbPodium">${step(2)}${step(1)}${step(3)}</div>`;
  },
  // a place: its rank, the name, the difficulty, the points — nothing else
  row(r, me) {
    return `<li class="wbRow${r.mine || me ? ' mine' : ''}${me ? ' wbMe' : ''}">` +
      `<span class="wbRk">${r.rank != null ? r.rank : '—'}</span>` +
      `<span class="wbWhoR"><b>${this.esc(r.name)}${r.mine || me ? '<i class="wbYou">You</i>' : ''}</b></span>` +
      `<span class="wbTags">${this.modeIcon(r.mode)}</span>` +
      `<span class="wbPts">${this.pts(r.score)}</span></li>`;
  },
  /* the player's own best, at the foot, when the ten above do not hold it
     (every one of the ten is always shown, so a listed row is never cut) */
  meRow(d, rows) {
    const me = d && d.me, at = rows.findIndex(r => r.mine);
    if (me && me.hidden) return '<p class="wbMine wbAside">Your games on this device are kept off the board.</p>';
    if (at >= 0 && at < this.SHOW) return '';
    const r = at >= 0 ? rows[at] : me;
    if (!r) return '';
    return `<ol class="wbList wbMeList">${this.row(r, true)}</ol>`;
  },

  /* ---------------- one page: every rank shown, the page pressed to hold them ---------------- */
  /* What gives, in order, until the pane holds without scrolling: the rows
     (to ROW_MIN), the hidden device's note, the podium (a zoom, to POD_MIN),
     the rows again (.wbTight, to ROW_FLOOR). Each step takes only what the
     page needs — the tallest row and the largest podium that still fit — so
     no band is left empty. Nothing is ever hidden but the note; a window too
     small for all of that scrolls, with every rank in it. */
  _fit() {
    const pane = this.el && this.el.querySelector('.wbPane');
    if (!pane) return;
    // not laid out yet (the screen is still coming up): measure next frame
    if (!pane.clientHeight) {
      if ((this._fitTries = (this._fitTries || 0) + 1) < 30) requestAnimationFrame(() => this._fit());
      return;
    }
    this._fitTries = 0;
    const list = pane.querySelector('.wbList:not(.wbMeList)');
    const rows = list ? [...list.children] : [];
    const pod = pane.querySelector('.wbPodium'), aside = pane.querySelector('.wbAside');
    const press = h => list && list.style.setProperty('--rowh', h + 'px');
    const zoom = z => { if (pod) { if (z < 1) pod.style.zoom = String(z); else pod.style.removeProperty('zoom'); } };
    for (const r of rows) r.hidden = false;
    if (list) { list.hidden = false; list.classList.remove('wbTight'); list.style.removeProperty('--rowh'); }
    if (aside) aside.hidden = false;
    zoom(1);
    const over = () => pane.scrollHeight > pane.clientHeight;   // strict: a tenth row hanging 1px past the pane is under its edge
    if (!over()) return;
    // the largest value in [lo, hi] (whole steps of `step`) that still fits, set; false when even lo does not
    const tallest = (set, lo, hi, step) => {
      set(lo);
      if (over()) return false;
      let a = 0, b = Math.max(0, Math.round((hi - lo) / step));
      while (a < b) { const m = Math.ceil((a + b) / 2); set(lo + m * step); if (over()) b = m - 1; else a = m; }
      set(lo + a * step);
      return true;
    };
    const h0 = rows.length ? Math.round(rows[0].getBoundingClientRect().height) : 0;
    // 1. the rows, pressed
    if (rows.length && tallest(press, Math.min(this.ROW_MIN, h0), h0, 1)) return;
    // 2. the hidden device's note put away (the ranks matter more)
    if (aside) {
      aside.hidden = true;
      if (!rows.length ? !over() : tallest(press, Math.min(this.ROW_MIN, h0), h0, 1)) return;
    }
    // 3. the podium, drawn smaller (CSS zoom: its layout shrinks with it)
    if (pod && 'zoom' in pod.style && tallest(zoom, this.POD_MIN, 1, 0.02)) return;
    // 4. the rows tightened, the podium at its smallest
    if (rows.length) {
      list.classList.add('wbTight');
      if (tallest(press, this.ROW_FLOOR, this.ROW_MIN, 1)) return;
    }
    // 5. a window too small even for that: the pane scrolls, every rank still in it
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
  background: none; color: var(--txt); font-family: var(--menufont); align-items: center; justify-content: center; padding: 0; }
#scrLeaders.wb [hidden] { display: none !important; }
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

/* ---- the carved frame (the settings page's): as tall as what it holds, never taller than the window ---- */
#scrLeaders.wb .wbFrame { position: relative; z-index: 1; flex: 0 1 auto; min-height: 0; width: calc(100% - 20px); max-width: 860px;
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
/* each button starts at its own label's width and the rest is shared: an
   even split cut MODERATE short at 320px on another machine's fonts */
#scrLeaders.wb .wbSeg button { flex: 1 1 auto; min-width: 0; height: 100%; min-height: 0; border: 0; border-radius: 0; padding: 0 6px; cursor: pointer; white-space: nowrap;
  background: linear-gradient(#2c2216, #1f170e); color: #cdbd99; box-shadow: none; font: 700 11px/1 var(--menufont); letter-spacing: 0.5px; text-transform: uppercase;
  -webkit-appearance: none; appearance: none; }
#scrLeaders.wb .wbSeg button.on { color: #2b1906; text-shadow: 0 1px 0 rgba(255,240,190,0.5);
  background: linear-gradient(#f0cd6e 0%, #d7a542 50%, #b8862c 100%); box-shadow: inset 0 0 0 1px #fff0b8; }
#scrLeaders.wb .wbSeg button:focus-visible { outline: 2px solid #e8c15a; outline-offset: -2px; }

/* ---- the pane: it never scrolls (WorldBoard._fit) — the scroll is only a last resort on a window too small for all ten, pressed ---- */
#scrLeaders.wb .wbPane { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  padding: 6px 8px 0; position: relative; z-index: 1; overscroll-behavior: contain; }
#scrLeaders.wb #ldrList { display: flex; flex-direction: column; }
#scrLeaders.wb .wbRest { display: flex; flex-direction: column; min-width: 0; }
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
#scrLeaders.wb .wbTags { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 22px; }
#scrLeaders.wb .wbTags img { display: block; width: 24px; height: 24px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
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
#scrLeaders.wb .wbList { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
/* a row's height is its --rowh when the page has to press the list to fit (WorldBoard._fit) */
#scrLeaders.wb .wbRow { display: flex; align-items: center; gap: 10px; min-height: var(--rowh, 44px); padding: 2px 10px 2px 6px; background: rgba(8,6,3,0.45);
  box-shadow: inset 0 0 0 1px rgba(214,170,74,0.14); }
#scrLeaders.wb .wbRow:nth-child(odd) { background: rgba(20,14,8,0.5); }
#scrLeaders.wb .wbRk { flex: 0 0 auto; min-width: 36px; height: 30px; padding: 0 4px; display: flex; align-items: center; justify-content: center; clip-path: var(--chamfer);
  font: 700 13px/1 var(--menufont); color: var(--ink); font-variant-numeric: tabular-nums; background: rgba(8,6,3,0.8); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.4); }
#scrLeaders.wb .wbWhoR { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; }
#scrLeaders.wb .wbWhoR b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 15px/1.15 var(--menufont); letter-spacing: 1.4px;
  text-transform: uppercase; color: #f2e4c1; }
#scrLeaders.wb .wbRow .wbTags { flex: 0 0 auto; gap: 3px; }
#scrLeaders.wb .wbRow .wbTags img { width: 22px; height: 22px; }
#scrLeaders.wb .wbRow .wbPts { flex: 0 0 auto; min-width: 58px; text-align: right; font: 800 15px/1 var(--menufont); color: #f0cd6e; font-variant-numeric: tabular-nums;
  text-shadow: 0 1.5px 0 rgba(0,0,0,0.9); }
#scrLeaders.wb .wbRow.mine { background: linear-gradient(90deg, rgba(122,88,30,0.55), rgba(60,42,14,0.5)); box-shadow: inset 0 0 0 1px #f2cf6c, inset 0 0 0 2px rgba(60,40,10,0.8); }
#scrLeaders.wb .wbRow.mine .wbRk { color: #2b1906; background: linear-gradient(#f4d272, #c8942f); box-shadow: inset 0 0 0 1px #fff0b8; }
/* the tightest rows (WorldBoard._fit's last step): the rank chip and the padding step down so a row can be ROW_FLOOR */
#scrLeaders.wb .wbList.wbTight { gap: 2px; margin-top: 4px; }
#scrLeaders.wb .wbList.wbTight .wbRow { padding-top: 1px; padding-bottom: 1px; }
#scrLeaders.wb .wbList.wbTight .wbRk { height: 24px; }
#scrLeaders.wb .wbList.wbTight .wbTags img { width: 20px; height: 20px; }
#scrLeaders.wb .wbList.wbTight ~ .wbMeList { margin-top: 3px; padding: 2px 0 0; }
#scrLeaders.wb .wbList.wbTight ~ .wbMeList .wbRow { min-height: 26px; padding-top: 1px; padding-bottom: 1px; }
#scrLeaders.wb .wbList.wbTight ~ .wbMeList .wbRk { height: 24px; }
/* the player's own best, held at the foot of the pane */
#scrLeaders.wb .wbMeList { position: sticky; bottom: 0; z-index: 2; margin-top: 10px; padding: 6px 0 8px;
  background: linear-gradient(rgba(22,15,8,0), #1a120a 30%); }
#scrLeaders.wb .wbMine { margin: 12px 4px 0; padding: 10px 12px; text-align: center; font: 600 12.5px/1.4 var(--sans); color: #cdb57c;
  background: rgba(8,6,3,0.55); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.3); }
#scrLeaders.wb .wbEmpty { margin-top: 8px; }

/* ---- a wide window: the page stands in the middle, everything a size up ---- */
@media (min-width: 720px) {
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 18px) 18px 14px; max-width: 860px; }
  #scrLeaders.wb .wbHead h2 { font-size: 34px; }
  #scrLeaders.wb .wbTrophy { width: 44px; height: 44px; }
  #scrLeaders.wb .wbFrame { width: calc(100% - 48px); margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); padding: 10px; }
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
  #scrLeaders.wb .wbTags img { width: 30px; height: 30px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 1.5px); }
  #scrLeaders.wb .wbPlinth b { font-size: 26px; }
  #scrLeaders.wb .s1 .wbPlinth b { font-size: 34px; }
  #scrLeaders.wb .wbSeg { height: 36px; }
  #scrLeaders.wb .wbSeg button { font-size: 12px; letter-spacing: 1px; }
  #scrLeaders.wb .wbRow .wbTags img { width: 26px; height: 26px; }
  #scrLeaders.wb .wbRk { min-width: 42px; height: 34px; font-size: 14px; }
  #scrLeaders.wb .wbRow { min-height: var(--rowh, 48px); padding: 2px 16px 2px 8px; gap: 14px; }
  #scrLeaders.wb .wbWhoR b { font-size: 16px; }
  #scrLeaders.wb .wbRow .wbPts { font-size: 17px; min-width: 76px; }
}
/* a short desktop window (a laptop): the header and the podium step down so the ten fit */
@media (min-width: 720px) and (max-height: 860px) {
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 10px) 18px 10px; }
  #scrLeaders.wb .wbHead h2 { font-size: 30px; }
  #scrLeaders.wb .wbTrophy { width: 40px; height: 40px; }
  #scrLeaders.wb .wbFrame { margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 14px); }
  #scrLeaders.wb .wbPodium { padding-top: 18px; }
  #scrLeaders.wb .wbMedalBox { width: 52px; height: 61px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 64px; height: 75px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 1px); }
  #scrLeaders.wb .wbPlinth b { font-size: 22px; }
  #scrLeaders.wb .s1 .wbPlinth b { font-size: 28px; }
}
/* A PHONE ON ITS SIDE (or any short, wide window): the podium stands beside the rows, everything a step tighter */
@media (min-aspect-ratio: 4/3) and (max-height: 560px) {
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 6px) 18px 6px; }
  #scrLeaders.wb .wbHead h2 { font-size: 24px; }
  #scrLeaders.wb .wbTrophy { width: 32px; height: 32px; }
  #scrLeaders.wb .wbFrame { width: calc(100% - 28px); max-width: 940px; margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); padding: 8px; }
  #scrLeaders.wb .wbC { width: 42px; height: 42px; }
  #scrLeaders.wb .wbC.tl { left: -6px; top: -6px; } #scrLeaders.wb .wbC.tr { right: -6px; top: -6px; }
  #scrLeaders.wb .wbC.bl { left: -6px; bottom: -6px; } #scrLeaders.wb .wbC.br { right: -6px; bottom: -6px; }
  #scrLeaders.wb .wbPane { padding: 6px 12px 0; }
  /* the podium on the left, the ranks on the right */
  #scrLeaders.wb #ldrList { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 16px; align-items: center; }
  #scrLeaders.wb #ldrList > .wbPodium { grid-area: 1 / 1; margin: 0; padding: 12px 0 8px; gap: 8px; }
  #scrLeaders.wb #ldrList > .wbRest { grid-area: 1 / 2; padding-bottom: 6px; }
  #scrLeaders.wb #ldrList > .wbMsg, #scrLeaders.wb #ldrList > .wbRetry { grid-column: 1 / -1; }
  #scrLeaders.wb #ldrList > .wbPodium + .wbWait { grid-area: 1 / 2; }
  #scrLeaders.wb .wbRest > .wbList:first-child, #scrLeaders.wb .wbRest > .wbMsg:first-child { margin-top: 0; }
  #scrLeaders.wb .wbMedalBox { width: 40px; height: 46px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 48px; height: 56px; }
  #scrLeaders.wb .wbCrown { width: 30px; height: 17px; margin-bottom: -5px; }
  #scrLeaders.wb .wbWho { gap: 2px; padding-bottom: 6px; }
  #scrLeaders.wb .wbNm { font-size: 14px; letter-spacing: 1px; }
  #scrLeaders.wb .s1 .wbNm { font-size: 16px; }
  #scrLeaders.wb .wbStep .wbPts { font-size: 16px; }
  #scrLeaders.wb .s1 .wbPts { font-size: 19px; }
  #scrLeaders.wb .wbTags { min-height: 20px; }
  #scrLeaders.wb .wbTags img { width: 22px; height: 22px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 0.7px); }
  #scrLeaders.wb .wbPlinth b, #scrLeaders.wb .s1 .wbPlinth b { font-size: 18px; margin-top: 4px; }
  #scrLeaders.wb .wbRow { min-height: var(--rowh, 40px); padding: 2px 10px 2px 6px; gap: 10px; }
  #scrLeaders.wb .wbRk { min-width: 34px; height: 28px; font-size: 13px; }
  #scrLeaders.wb .wbWhoR { gap: 2px; }
  #scrLeaders.wb .wbWhoR b { font-size: 14px; }
  #scrLeaders.wb .wbRow .wbTags img { width: 20px; height: 20px; }
  #scrLeaders.wb .wbRow .wbPts { font-size: 15px; min-width: 56px; }
  #scrLeaders.wb .wbMeList { margin-top: 6px; padding: 4px 0 4px; }
}
@media (min-aspect-ratio: 4/3) and (max-height: 560px) and (max-width: 719px) {
  #scrLeaders.wb .wbNm { font-size: 13px; }
  #scrLeaders.wb .s1 .wbNm { font-size: 14px; }
}
/* the smallest phone on its side (568x320): the last step down */
@media (min-aspect-ratio: 4/3) and (max-height: 340px) {
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 4px) 18px 4px; }
  #scrLeaders.wb .wbHead h2 { font-size: 20px; }
  #scrLeaders.wb .wbTrophy { width: 26px; height: 26px; }
  #scrLeaders.wb .wbBack { width: 38px; height: 34px; }
  #scrLeaders.wb .wbTitle { gap: 3px; }
  #scrLeaders.wb .wbFrame { margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 6px); }
  #scrLeaders.wb #ldrList > .wbPodium { padding-top: 8px; }
  #scrLeaders.wb .wbMedalBox { width: 32px; height: 37px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 38px; height: 44px; }
  #scrLeaders.wb .wbCrown { width: 24px; height: 14px; margin-bottom: -4px; }
  #scrLeaders.wb .wbWho { gap: 1px; padding-bottom: 4px; }
  #scrLeaders.wb .wbStep .wbPts, #scrLeaders.wb .s1 .wbPts { font-size: 15px; }
  #scrLeaders.wb .wbTags { min-height: 17px; }
  #scrLeaders.wb .wbTags img { width: 17px; height: 17px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 0.45px); }
  #scrLeaders.wb .wbPlinth b, #scrLeaders.wb .s1 .wbPlinth b { font-size: 14px; margin-top: 4px; }
}
/* a short phone held upright (320x568, 375x667): the header and the podium step down */
@media (max-aspect-ratio: 4/3) and (max-height: 700px) {
  #scrLeaders.wb .wbHead { padding: calc(var(--safe-top) + 6px) 14px 6px; }
  #scrLeaders.wb .wbHead h2 { font-size: 24px; }
  #scrLeaders.wb .wbTrophy { width: 32px; height: 32px; }
  #scrLeaders.wb .wbBack { width: 42px; height: 40px; }
  #scrLeaders.wb .wbPodium { padding-top: 12px; }
  #scrLeaders.wb .wbMedalBox { width: 38px; height: 44px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 46px; height: 54px; }
  #scrLeaders.wb .wbCrown { width: 28px; height: 16px; margin-bottom: -5px; }
  #scrLeaders.wb .wbWho { gap: 2px; padding-bottom: 6px; }
  #scrLeaders.wb .wbNm { margin-top: 1px; }
  #scrLeaders.wb .wbTags { min-height: 18px; }
  #scrLeaders.wb .wbTags img { width: 18px; height: 18px; }
  #scrLeaders.wb .wbPlinth { height: calc(var(--h) * 0.62px); }
  #scrLeaders.wb .wbPlinth b, #scrLeaders.wb .s1 .wbPlinth b { font-size: 17px; margin-top: 4px; }
  #scrLeaders.wb .wbRow { min-height: var(--rowh, 42px); }
}
/* the narrowest phones */
@media (max-width: 359px) {
  #scrLeaders.wb .wbHead { gap: 9px; }
  #scrLeaders.wb .wbHead h2 { font-size: 21px; letter-spacing: 1.2px; }
  #scrLeaders.wb .wbTrophy { width: 30px; height: 30px; }
  #scrLeaders.wb .wbSeg button { font-size: 10px; letter-spacing: 0.2px; padding: 0 4px; }
  #scrLeaders.wb .wbMedalBox { width: 44px; height: 51px; }
  #scrLeaders.wb .s1 .wbMedalBox { width: 54px; height: 63px; }
  #scrLeaders.wb .wbNm { font-size: 13px; letter-spacing: 1px; }
  #scrLeaders.wb .s1 .wbNm { font-size: 15px; }
  #scrLeaders.wb .wbStep .wbPts { font-size: 15px; }
  #scrLeaders.wb .s1 .wbPts { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) { #scrLeaders.wb .wbWait, #scrLeaders.wb .wbGhost { animation: none; } }
`;
window.WorldBoard = WorldBoard;
