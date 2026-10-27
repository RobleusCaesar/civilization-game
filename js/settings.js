"use strict";
/* THE SETTINGS PAGE, OVERHAULED (tests/settings.mjs) — staged behind the card
   test link until it goes public.

   THE GATE IS ONE PREDICATE: SettingsPage.live(). Today it answers yes only on
   a device where the card staging flag is on (Deck.devOn: ?cards=1 or
   ?cards=all once) — the operator tests it there first. Everyone else keeps
   the old #scrSettings screen byte for byte: nothing here builds an element,
   injects a stylesheet or fetches a picture unless live() says so.
   GOING PUBLIC IS ONE LINE: set PUBLIC to true.

   ONLY REAL SETTINGS. Every control on this page changes something the game
   actually reads — the autosave cadence (Backend.autosaveDays), the two audio
   switches and their dials (js/audio.js), the guided lesson for the next new
   game (Screens.tutorialWanted), the how-to text on unit panels
   (UI.helpHidden), the chief's name and the recovery token (Backend). There
   is no language picker, no graphics toggle and no controls page, because
   the game has none of those, and a section with nothing real in it is not
   drawn: the chief's-name card waits for the cloud, the save-file button for
   a game in progress, the chronicle for a log.

   Five tabs: General · Audio · Saves · Feedback · Patch Notes. A side rail on
   anything 720px and wider, a tab strip across the top on a phone. The look
   is the reward screen's (js/deckscreens.js): Cinzel caps, chamfered plaques
   with gold rims, dark carved wood — with PixelLab's corner ornaments, tab
   icons and the patch-notes painting (assets/ui/settings/), drawn at device
   resolution (never nearest-neighbour blown up: the operator's ruling on UI
   chrome). A missing picture falls back to the plain CSS frame. */
const SettingsPage = {
  PUBLIC: false,          // ← THE ONE-LINE FLIP: true shows this page to every player
  live() {
    if (this.PUBLIC) return true;
    try { return !!(window.Deck && Deck.devOn && Deck.devOn()); } catch (e) { return false; }
  },

  TABS: [
    { k: 'general', name: 'General' },
    { k: 'audio', name: 'Audio' },
    { k: 'saves', name: 'Saves' },
    { k: 'feedback', name: 'Feedback' },
    { k: 'notes', name: 'Patch Notes', short: 'Notes' },
  ],
  tab: 'general',
  el: null,

  /* ---------------- device storage (it can throw) ---------------- */
  _mem: {},
  _get(k) { try { return localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(this._mem, k) ? this._mem[k] : null; } },
  _set(k, v) { try { localStorage.setItem(k, v); } catch (e) { this._mem[k] = v; } },

  art(name) {
    const v = (typeof CFG !== 'undefined' && CFG.ART_V) ? '?v=' + CFG.ART_V : '';
    return 'assets/ui/settings/' + name + '.png' + v;
  },
  /* THE CORNER ORNAMENT IS DRAWN, NOT PASTED (the chrome ruling: a frame's
     ornament is UI chrome, so it is as sharp on a 3x phone as the type beside
     it — the 128px PixelLab corner it replaces was shown at 58 CSS px on a
     wide window, 1.36x its pixels at 3x). A gold L over the frame's rim with
     a pearled groove, a cut gem in a lozenge at the corner, a leaf in the
     crook and on each arm a LYRE — two scrolls springing from one root and
     curling away from each other — built as vector paths once, at mount.
     The light always falls from the top: a corner flipped upside down turns
     its own gradients over. */
  _spiral(lead, cx, cy, r0, r1, a0, turns, n) {
    const pts = lead.slice();
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + turns * 2 * Math.PI * t, r = r0 * Math.pow(r1 / r0, t);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const f = v => +v.toFixed(2);
    let d = 'M' + f(pts[0][0]) + ',' + f(pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {   // Catmull-Rom, as cubic Béziers
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ',' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ',' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ',' + f(p2[1]);
    }
    return { d, end: pts[pts.length - 1] };
  },
  cornerSvg(id, flipX, flipY) {
    const gx = flipX ? [64, 0] : [0, 64], gy = flipY ? [64, 0] : [0, 64];
    const g = id + 'g', gm = id + 'm', gj = id + 'j', ink = '#1d1206';
    // the top arm's three scrolls; the left arm is the same drawing, transposed
    const S = [
      [this._spiral([[39.5, 18.2], [38.6, 20.6]], 33.2, 24.6, 5.2, 1.25, 0.05, 1.62, 30), 2.5],
      [this._spiral([[40.2, 18.2], [41.4, 20.4]], 45.6, 23.4, 4.0, 1.0, Math.PI - 0.1, -1.55, 24), 2.1],
      [this._spiral([[52.5, 18.2], [52.9, 19.6]], 51.2, 21.1, 1.9, 0.6, 0, 1.2, 12), 1.4],
    ];
    const sx = flipX ? 1 : -1, sy = flipY ? 1 : -1;   // the highlight's nudge, toward the light
    const wire = ([s, w], grad, tx, ty) =>
      `<path d="${s.d}" fill="none" stroke="${ink}" stroke-width="${(w + 1.9).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${s.d}" fill="none" stroke="url(#${grad})" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${s.d}" fill="none" stroke="#fff5cf" stroke-opacity=".5" stroke-width="${(w * 0.28).toFixed(2)}" stroke-linecap="round" transform="translate(${tx * 0.35} ${ty * 0.35})"/>` +
      `<circle cx="${s.end[0].toFixed(2)}" cy="${s.end[1].toFixed(2)}" r="${(w * 0.62).toFixed(2)}" fill="url(#${grad})" stroke="${ink}" stroke-width=".8"/>`;
    // the left arm is drawn in transposed space, so its gradient and nudge are written transposed too
    const armTop = S.map(x => wire(x, gm, sx, sy)).join(''), armLeft = S.map(x => wire(x, gm + 't', sy, sx)).join('');
    const mEnd = [flipX ? 24 : 40, flipY ? 24 : 40];
    const pearls = [29.5, 34.5, 39.5, 44.5, 49].map(v => `<circle cx="${v}" cy="13.75" r="1.05"/><circle cx="13.75" cy="${v}" r="1.05"/>`).join('');
    return `<svg class="sxCsvg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>` +
      `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${gx[0]}" y1="${gy[0]}" x2="${gx[1]}" y2="${gy[1]}">` +
        '<stop offset="0" stop-color="#fff3c2"/><stop offset=".22" stop-color="#f4d175"/><stop offset=".5" stop-color="#d9a744"/><stop offset=".78" stop-color="#a87526"/><stop offset="1" stop-color="#6f4914"/></linearGradient>' +
      [[gm, gx[0], gy[0], mEnd[0], mEnd[1]], [gm + 't', gy[0], gx[0], mEnd[1], mEnd[0]]].map(([i, a, b, c, d]) =>
        `<linearGradient id="${i}" gradientUnits="userSpaceOnUse" x1="${a}" y1="${b}" x2="${c}" y2="${d}">` +
        '<stop offset="0" stop-color="#ffeeb0"/><stop offset=".45" stop-color="#e2b453"/><stop offset="1" stop-color="#9a6a20"/></linearGradient>').join('') +
      `<linearGradient id="${gj}" x1="0" y1="${flipY ? 1 : 0}" x2="1" y2="${flipY ? 0 : 1}">` +
        '<stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#d9ecf7"/><stop offset=".7" stop-color="#8fb3d1"/><stop offset="1" stop-color="#40607f"/></linearGradient>' +
      '</defs>' +
      armTop + `<g transform="matrix(0 1 1 0 0 0)">${armLeft}</g>` +
      `<path d="M17,17C25.5,17.6 30.6,22.4 30.2,30.2C22.4,30.6 17.6,25.5 17,17Z" fill="url(#${g})" stroke="${ink}" stroke-width="1.15" stroke-linejoin="round"/>` +
      '<path d="M19.2,19.2L28.2,28.2" stroke="#7a5216" stroke-width=".8" stroke-linecap="round"/>' +
      '<path d="M20.2,18.6C24.6,19.4 27.8,21.8 28.6,25.6" fill="none" stroke="#fff3c6" stroke-opacity=".55" stroke-width=".6" stroke-linecap="round"/>' +
      `<path d="M9.5,9.5H51L56.5,13.75L51,18H18V51L13.75,56.5L9.5,51Z" fill="url(#${g})" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
      '<path d="M27,13.75H50.5M13.75,27V50.5" stroke="#6f4914" stroke-width="2.6" stroke-linecap="round"/>' +
      `<g fill="#ffe9a6">${pearls}</g>` +
      `<path d="M${flipX ? 16.9 : 10.6},${flipY ? 16.9 : 10.6}H50.6M${flipX ? 16.9 : 10.6},${flipY ? 16.9 : 10.6}V50.6" stroke="#fff6d6" stroke-opacity=".7" stroke-width=".7" stroke-linecap="round"/>` +
      `<path d="M14,2.8L25.2,14L14,25.2L2.8,14Z" fill="url(#${g})" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
      '<path d="M14,4.9L23.1,14L14,23.1L4.9,14Z" fill="none" stroke="#fff3c6" stroke-opacity=".5" stroke-width=".7"/>' +
      `<path d="M14,7.6L20.4,14L14,20.4L7.6,14Z" fill="url(#${gj})" stroke="#24180a" stroke-width=".9" stroke-linejoin="round"/>` +
      '<path d="M14,7.6V20.4M7.6,14H20.4" stroke="#2f4a66" stroke-opacity=".45" stroke-width=".5"/>' +
      `<path d="${flipY ? 'M14,19.3L17.1,16.2L14,14L10.9,16.2Z' : 'M14,8.7L17.1,11.8L14,14L10.9,11.8Z'}" fill="#fff" fill-opacity=".75"/>` +
      `<circle cx="56.5" cy="13.75" r="1.6" fill="url(#${g})" stroke="${ink}" stroke-width=".9"/>` +
      `<circle cx="13.75" cy="56.5" r="1.6" fill="url(#${g})" stroke="${ink}" stroke-width=".9"/>` +
      '</svg>';
  },
  esc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; },
  attr(s) { return this.esc(s).replace(/"/g, '&quot;'); },

  /* ---------------- patch notes: the red dot ---------------- */
  SEEN_KEY: 'neo-notes-seen',
  newestBuild() { return (window.PATCH_NOTES && PATCH_NOTES[0] && +PATCH_NOTES[0].build) || 0; },
  notesUnseen() { return (+this._get(this.SEEN_KEY) || 0) < this.newestBuild(); },
  markNotesSeen() { if (this.newestBuild()) this._set(this.SEEN_KEY, String(this.newestBuild())); this.paintDots(); },
  MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? (+m[3]) + ' ' + this.MONTHS[+m[2] - 1] + ' ' + m[1] : String(iso || '');
  },
  versionLine(n) { return n ? 'Build ' + n.build + ' · ' + this.fmtDate(n.date) : ''; },

  /* ---------------- boot: the dots on the doors, for a staged device ---------------- */
  boot() {
    if (!this.live()) return;
    this._css();
    this.paintDots();
  },
  paintDots() {
    const unseen = this.notesUnseen();
    /* the dot is a CHILD of the plaque, never a ::before/::after on it — the
       carved plaque draws its own body (::before) and nailheads (::after),
       and borrowing either strips the plaque bare */
    for (const id of ['btnTitleSettings', 'btnPauseSettings']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.toggle('sxNew', unseen);
      let d = b.querySelector('.sxDoorDot');
      if (unseen && !d) { d = document.createElement('i'); d.className = 'sxDoorDot'; d.setAttribute('aria-hidden', 'true'); b.appendChild(d); }
      else if (!unseen && d) d.remove();
    }
    if (this.el) {
      const t = this.el.querySelector('.sxTab[data-tab="notes"]');
      if (t) t.classList.toggle('hasDot', unseen);
    }
  },

  /* ---------------- mount: build once, show many ---------------- */
  mount() {
    if (this.el) return this.el;
    this._css();
    const el = document.createElement('div');
    el.className = 'screen';
    el.id = 'scrSetx';
    el.innerHTML =
      '<div class="sxShade"></div>' +
      '<header class="sxHead">' +
        '<button class="sxBack" type="button" aria-label="Back"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg></button>' +
        `<img class="sxGear" alt="" src="${this.art('tab-general')}" onerror="this.style.visibility='hidden'">` +
        '<h2>Settings</h2>' +
      '</header>' +
      '<div class="sxFrame">' +
        [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="sxC ${c}">${this.cornerSvg('sxc' + c, fx, fy)}</i>`).join('') +
        '<nav class="sxNav" role="tablist" aria-label="Settings sections">' +
          this.TABS.map(t =>
            `<button class="sxTab" type="button" role="tab" data-tab="${t.k}" aria-selected="false">` +
              `<img alt="" src="${this.art('tab-' + t.k)}" onerror="this.style.visibility='hidden'">` +
              `<span class="sxTn">${this.esc(t.name)}</span>${t.short ? `<span class="sxTs">${this.esc(t.short)}</span>` : ''}` +
              '<i class="sxDot" aria-label="New"></i><i class="sxChev" aria-hidden="true"></i>' +
            '</button>').join('') +
          `<p class="sxRailFoot">Clanfire<br>${this.esc(this.versionLine(window.PATCH_NOTES && PATCH_NOTES[0]))}</p>` +
        '</nav>' +
        '<div class="sxPane" role="tabpanel"></div>' +
      '</div>';
    document.getElementById('shell').appendChild(el);
    this.el = el;
    el.querySelector('.sxBack').addEventListener('click', () => this.back());
    el.querySelector('.sxNav').addEventListener('click', e => {
      const b = e.target.closest('.sxTab'); if (!b) return;
      this.open(b.dataset.tab);
    });
    el.querySelector('.sxNav').addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const ks = this.TABS.map(t => t.k);
      const i = ks.indexOf(this.tab), d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
      this.open(ks[(i + d + ks.length) % ks.length]);
      const nb = el.querySelector(`.sxTab[data-tab="${this.tab}"]`); if (nb) nb.focus();
      e.preventDefault();
    });
    const pane = el.querySelector('.sxPane');
    pane.addEventListener('click', e => this.onClick(e));
    pane.addEventListener('input', e => this.onInput(e));
    pane.addEventListener('change', e => this.onChange(e));
    return el;
  },

  back() {
    if (typeof Screens === 'undefined') return;
    Screens.show(Screens.backTo === 'paused' ? 'paused' : 'title');
  },

  // Screens.show('settings') calls this every time the page is shown
  onShow() {
    this.mount();
    this._chiefAsked = false;
    this.open(this.tab || 'general');
    this.paintDots();
  },

  open(k) {
    if (!this.TABS.some(t => t.k === k)) k = 'general';
    this.tab = k;
    for (const b of this.el.querySelectorAll('.sxTab')) {
      const on = b.dataset.tab === k;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
    this.el.dataset.tab = k;
    const pane = this.el.querySelector('.sxPane');
    pane.innerHTML = this['tab_' + k]();
    pane.scrollTop = 0;
    if (k === 'audio') this.paintAudio();
    if (k === 'general') this.paintGeneral();
    if (k === 'feedback') this.paintForm();
    if (k === 'notes') this.markNotesSeen();
    this.paintDots();
  },

  /* ---------------- shared bits ---------------- */
  card(title, body, cls) {
    return `<section class="sxCard${cls ? ' ' + cls : ''}">${title ? `<h3>${this.esc(title)}</h3>` : ''}${body}</section>`;
  },
  row(label, sub, control, cls) {
    return `<div class="sxRow${cls ? ' ' + cls : ''}"><div class="sxL"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div>${control || ''}</div>`;
  },
  toggle(act, on, label) {
    return `<button class="sxTog${on ? ' on' : ''}" type="button" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${this.attr(label)}" data-act="${act}"><i></i></button>`;
  },
  gameLive() { return !!(window.S && S.map && typeof Screens !== 'undefined' && !Screens._demo); },

  /* ---------------- GENERAL ---------------- */
  tab_general() {
    let h = '';
    if (window.Backend && Backend.isReady()) {
      h += this.card('Your Chief',
        this.row('Chief’s name', 'Shown with your scores on the world board.',
          '', 'sxStack') +
        `<div class="sxField"><input class="sxIn" id="sxChief" maxlength="24" placeholder="Name your chief" autocomplete="off" aria-label="Chief’s name" value="${this.attr(this._chief || '')}"></div>` +
        `<p class="sxNote">Your village: <b>${this.esc(Backend.villageName(Backend.uid))}</b></p>`);
    }
    const tut = typeof Screens !== 'undefined' ? Screens.tutorialWanted() : false;
    h += this.card('Help & Tips',
      this.row('Guided lesson', '<span class="sxTutSub"></span>', this.toggle('tut', tut, 'Guided lesson in your next new game')) +
      this.row('Unit tips', 'The how-to text on a selected unit’s panel.', this.toggle('unithelp', !(typeof UI !== 'undefined' && UI.helpHidden), 'Show unit tips')));
    if (this.gameLive() && S.log && S.log.length) {
      const err = (typeof G !== 'undefined' && G.lastFrameError)
        ? `<div class="sxErr">⚠ ${this.esc(String(G.lastFrameError).split('\n')[0]).slice(0, 160)}</div>` : '';
      h += this.card('Chronicle',
        `<details class="sxFold"><summary>This run’s event log<span>${S.log.length > 30 ? 'latest 30' : S.log.length + ' entries'}</span></summary>` +
        `<div class="sxLog">${err}${S.log.slice(0, 30).map(l => `<div><b>Day ${this.esc(l.day)}</b> ${this.esc(l.msg)}</div>`).join('')}</div></details>`);
    }
    return h;
  },
  paintGeneral() {
    const sub = this.el.querySelector('.sxTutSub');
    if (sub && typeof Screens !== 'undefined') {
      const v = Screens.lsGet('neo-tutorial-ask');
      sub.textContent = v === '1' ? 'On — your next new game teaches the basics.'
        : v === '0' ? 'Off — new games start without the lesson.'
          : (Screens.tutorialWanted() ? 'On for your first two games, then off by itself.' : 'Off — you’ve played your first two games.');
    }
    const t = this.el.querySelector('[data-act="tut"]');
    if (t && typeof Screens !== 'undefined') this._setTog(t, Screens.tutorialWanted());
    const u = this.el.querySelector('[data-act="unithelp"]');
    if (u) this._setTog(u, !(typeof UI !== 'undefined' && UI.helpHidden));
    // the chief's name is the cloud's: asked once per showing, written into
    // whichever input is on screen when the answer lands (a tab switch in the
    // meantime builds a new one)
    if (this.el.querySelector('#sxChief') && window.Backend && Backend.isReady() && !this._chiefAsked) {
      this._chiefAsked = true;
      Backend.getProfile().then(r => {
        if (!(r.ok && r.data && r.data.chief_name)) return;
        this._chief = r.data.chief_name;
        const ci = this.el.querySelector('#sxChief');
        if (ci && document.activeElement !== ci) ci.value = this._chief;
      });
    }
  },
  _setTog(b, on) {
    b.classList.toggle('on', !!on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  },

  /* ---------------- AUDIO ---------------- */
  tab_audio() {
    const one = (bus, label, sub) =>
      `<div class="sxAud" data-bus="${bus}">` +
        this.row(label, sub, this.toggle('mute-' + bus, true, label)) +
        `<div class="sxDial"><input class="sxVol" type="range" min="0" max="100" step="5" data-bus="${bus}" aria-label="${this.attr(label)} volume"><output class="sxPct">0%</output></div>` +
      '</div>';
    return this.card('Audio',
      one('music', 'Music', 'The fireside tune under the game.') +
      one('sfx', 'Sound effects', 'Axes, horns, battle and the clicks of the menus.') +
      '<p class="sxNote">The music is played by the game itself, not a recording — it never repeats and costs nothing to load.</p>');
  },
  /* the audio rows read Sound's LIVE state every time — one source of truth
     for "is the music on", the same rule Screens.paintAudioRows keeps for the
     old page: the switch shows whether anything will be HEARD (switch and
     dial together), a muted row keeps its number on the dial */
  paintAudio() {
    if (typeof Sound === 'undefined' || !this.el) return;
    for (const bus of ['sfx', 'music']) {
      const box = this.el.querySelector(`.sxAud[data-bus="${bus}"]`); if (!box) continue;
      const on = bus === 'sfx' ? Sound.sfxOn() : Sound.musicOn();
      const v = Sound.vol(bus);
      this._setTog(box.querySelector('.sxTog'), on);
      const sl = box.querySelector('.sxVol'), pct = box.querySelector('.sxPct');
      if (document.activeElement !== sl) sl.value = String(v);
      sl.style.setProperty('--p', v + '%');
      pct.textContent = on ? v + '%' : 'Off';
      box.classList.toggle('muted', !on);
    }
  },

  /* ---------------- SAVES ---------------- */
  CADENCE: [['0', 'Off'], ['1', 'Daily'], ['2', '2 days'], ['5', '5 days']],
  tab_saves() {
    const days = String(window.Backend ? Backend.autosaveDays : 2);
    const seg = '<div class="sxSeg" role="radiogroup" aria-label="Autosave">' +
      this.CADENCE.map(([v, n]) => `<button type="button" role="radio" data-cad="${v}" aria-checked="${v === days ? 'true' : 'false'}" class="${v === days ? 'on' : ''}">${n}</button>`).join('') +
      '</div>';
    const cloud = window.Backend && Backend.isReady();
    let h = this.card('Autosave',
      '<p class="sxLead">How often your game saves itself, counted in game days.</p>' + seg +
      `<p class="sxNote">${cloud ? 'Saves go to your cloud slot and to this device.' : 'Cloud saves aren’t connected on this device — the game keeps a copy here.'}</p>`);
    let b = '';
    if (this.gameLive()) b += this.row('Save file', 'Download this game as a file you can load anywhere.', '<button class="sxBtn" type="button" data-act="export-file">Download</button>');
    if (cloud) {
      b += this.row('Recovery token', 'Moves your cloud saves to another device. Treat it like a password.', '<button class="sxBtn" type="button" data-act="export-id">Copy</button>');
      b += this.row('Restore identity', 'Paste a token from your other device.', '<button class="sxBtn" type="button" data-act="import-id">Restore</button>');
    }
    if (b) h += this.card('Backup & Recovery', b);
    if (cloud) h += `<p class="sxFoot">Signed in as <b>${this.esc(Backend.villageName(Backend.uid))}</b></p>`;
    return h;
  },

  /* ---------------- FEEDBACK ---------------- */
  _form: null,
  formState() {
    if (!this._form) this._form = { kind: 'bug', email: this._get('neo-feedback-email') || '', name: '', message: '', attach: true, attachTouched: false };
    return this._form;
  },
  ICONS: { bug: 'kind-bug', idea: 'kind-idea', crash: 'kind-crash', other: 'kind-other' },
  tab_feedback() {
    const f = this.formState();
    const kinds = (window.Feedback ? Feedback.KINDS : []).map(k =>
      `<button type="button" class="sxKind${k.k === f.kind ? ' on' : ''}" role="radio" aria-checked="${k.k === f.kind ? 'true' : 'false'}" data-kind="${k.k}">` +
      `<img alt="" src="${this.art(this.ICONS[k.k])}" onerror="this.remove()"><span>${this.esc(k.name)}</span></button>`).join('');
    const pending = window.Feedback ? Feedback.outbox().length : 0;
    return this.card('Feedback & Support',
      '<p class="sxLead">Found a bug? Have an idea? It goes straight to the developer, who reads every one — and replies.</p>' +
      '<form class="sxForm" novalidate autocomplete="on">' +
        `<div class="sxKinds" role="radiogroup" aria-label="Kind of report">${kinds}</div>` +
        '<label class="sxLbl" for="sxEmail">Your email <em>required</em></label>' +
        `<input class="sxIn" id="sxEmail" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com" value="${this.attr(f.email)}">` +
        '<p class="sxPriv"><svg viewBox="0 0 12 14" aria-hidden="true"><path d="M3.2 6V4.2a2.8 2.8 0 0 1 5.6 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1.5" y="6" width="9" height="7" rx="1.2" fill="currentColor"/></svg>So we can reply. Used only to answer you \u2014 never shared, never put on a list.</p>' +
        '<label class="sxLbl" for="sxName">Your name <em>optional</em></label>' +
        `<input class="sxIn" id="sxName" name="name" autocomplete="nickname" maxlength="60" placeholder="What should we call you?" value="${this.attr(f.name)}">` +
        '<label class="sxLbl" for="sxMsg">Message <em>required</em><span class="sxCount"></span></label>' +
        `<textarea class="sxIn sxMsg" id="sxMsg" name="message" rows="5" maxlength="${window.Feedback ? Feedback.MSG_MAX : 4000}" placeholder="What happened, or what would you love to see?">${this.esc(f.message)}</textarea>` +
        '<label class="sxCheck"><input type="checkbox" id="sxAttach"><i></i><span>Attach technical details</span></label>' +
        '<details class="sxFold sxWhat"><summary>What’s included</summary><pre class="sxDetails"></pre></details>' +
        '<button class="sxSend" type="submit"><span class="sxDia"></span>Send<span class="sxDia"></span></button>' +
        '<p class="sxStatus" role="status" aria-live="polite"></p>' +
        (pending ? `<p class="sxPending">${pending === 1 ? 'One report is' : pending + ' reports are'} waiting to be sent. <button type="button" class="sxLink" data-act="flush">Try now</button></p>` : '') +
      '</form>');
  },
  paintForm() {
    const f = this.formState();
    const k = window.Feedback && Feedback.kind(f.kind);
    if (!f.attachTouched) f.attach = !!(k && k.tech);
    const at = this.el.querySelector('#sxAttach'); if (at) at.checked = f.attach;
    const pre = this.el.querySelector('.sxDetails');
    if (pre && window.Feedback) pre.textContent = Feedback.detailsText(Feedback.details());
    const what = this.el.querySelector('.sxWhat'); if (what) what.style.display = f.attach ? '' : 'none';
    this.paintCount();
    const form = this.el.querySelector('.sxForm');
    if (form && !form._sx) { form._sx = true; form.addEventListener('submit', e => { e.preventDefault(); this.send(); }); }
  },
  paintCount() {
    const c = this.el && this.el.querySelector('.sxCount'); if (!c) return;
    const n = this.formState().message.length, max = window.Feedback ? Feedback.MSG_MAX : 4000;
    c.textContent = n > max * 0.8 ? n + ' / ' + max : '';
  },
  status(msg, kind) {
    const s = this.el && this.el.querySelector('.sxStatus'); if (!s) return;
    s.textContent = msg || '';
    s.className = 'sxStatus' + (kind ? ' ' + kind : '');
  },
  async send() {
    if (!window.Feedback || this._sending) return;
    const f = this.formState();
    const form = this.el.querySelector('.sxForm');
    for (const x of form.querySelectorAll('.bad')) x.classList.remove('bad');
    const c = Feedback.check(f);
    if (!c.ok) {
      this.status(c.why, 'bad');
      const fld = { email: '#sxEmail', message: '#sxMsg' }[c.field];
      const el = fld && form.querySelector(fld);
      if (el) { el.classList.add('bad'); el.focus(); }
      return;
    }
    this._sending = true;
    const btn = form.querySelector('.sxSend'); btn.classList.add('busy'); btn.disabled = true;
    this.status('Sending…');
    let r;
    try { r = await Feedback.submit(f); } catch (e) { r = { state: 'saved', why: 'Saved on this device — it will be sent automatically.' }; }
    this._sending = false;
    btn.classList.remove('busy'); btn.disabled = false;
    if (r.state === 'refused') { this.status(r.why, 'bad'); return; }
    if (r.state === 'offsite') { this.status(r.why, 'warn'); return; }
    this._set('neo-feedback-email', f.email.trim());
    // the report is safe (sent, or in the outbox): clear the message, keep who you are
    f.message = ''; f.attachTouched = false;
    const msg = form.querySelector('#sxMsg'); if (msg) msg.value = '';
    if (r.state === 'sent') this.status('Sent — thank you! We’ll reply to ' + f.email.trim() + '.', 'good');
    else this.status(r.why, 'warn');
    this.paintCount();
  },

  /* ---------------- PATCH NOTES ---------------- */
  tab_notes() {
    const N = window.PATCH_NOTES || [];
    if (!N.length) return this.card('Patch Notes', '<p class="sxNote">No notes yet.</p>');
    const n0 = N[0];
    const items = (n) => '<ul class="sxItems">' + n.items.map(i => `<li>${this.esc(i)}</li>`).join('') + '</ul>';
    let h = '<section class="sxCard sxNotes">' +
      '<div class="sxHero">' +
        `<img alt="" src="${this.art('notes-art')}" onerror="this.parentNode.classList.add('noArt');this.remove()">` +
        '<div class="sxHeroT"><small>What’s new</small><b>Patch Notes</b></div>' +
      '</div>' +
      `<div class="sxVer"><i></i><span class="sxVerL">${this.esc(this.versionLine(n0))}</span><span class="sxNow">This version</span></div>` +
      `<article class="sxEntry open"><h4>${this.esc(n0.title)}</h4>${items(n0)}</article>` +
      '</section>';
    if (N.length > 1) {
      h += this.card('Earlier updates', N.slice(1).map(n =>
        `<details class="sxFold sxEntry"><summary><span class="sxEt">${this.esc(n.title)}</span><span class="sxEv">${this.esc(this.versionLine(n))}</span></summary>${items(n)}</details>`).join(''));
    }
    return h;
  },

  /* ---------------- events ---------------- */
  onClick(e) {
    const t = e.target;
    const tog = t.closest('.sxTog');
    if (tog) { this.toggleAct(tog.dataset.act); return; }
    const seg = t.closest('[data-cad]');
    if (seg) { this.setCadence(seg.dataset.cad); return; }
    const kind = t.closest('.sxKind');
    if (kind) {
      const f = this.formState();
      f.kind = kind.dataset.kind;
      for (const b of this.el.querySelectorAll('.sxKind')) {
        const on = b === kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      }
      this.paintForm();
      return;
    }
    const act = t.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    // the backup buttons ARE the old page's buttons: the same handlers, so the
    // two pages can never disagree about what "download" or "restore" does
    if (a === 'export-file') { const b = document.getElementById('btnExportFile'); if (b) b.click(); }
    else if (a === 'export-id') { const b = document.getElementById('btnExportId'); if (b) b.click(); }
    else if (a === 'import-id') { const b = document.getElementById('btnImportId'); if (b) b.click(); }
    else if (a === 'flush' && window.Feedback) {
      this.status('Sending…');
      Feedback.flush().then(() => {
        const left = Feedback.outbox().length;
        if (this.tab === 'feedback') { this.open('feedback'); this.status(left ? 'Still waiting — we’ll keep trying.' : 'Sent — thank you!', left ? 'warn' : 'good'); }
      });
    }
  },
  toggleAct(a) {
    if (a === 'tut' && typeof Screens !== 'undefined') {
      const v = Screens.tutorialWanted();
      Screens.lsSet('neo-tutorial-ask', v ? '0' : '1');
      /* a pending, un-kept draft on a world the lesson cannot teach is founded
         again the moment the draft shows (Screens.onDraft) — the draft
         toggle's own rule (audit MAP-V01), so ticking it here can never arm
         the lesson on an archipelago */
      if (!v) Screens._lessonRefound = true;
      this.paintGeneral();
    } else if (a === 'unithelp' && typeof UI !== 'undefined') {
      UI.helpHidden = !UI.helpHidden;
      this._set('neo-unit-help', UI.helpHidden ? '1' : '0');
      try { if (UI.renderPanel && this.gameLive()) UI.renderPanel(); } catch (e) {}
      this.paintGeneral();
    } else if (/^mute-/.test(a) && typeof Sound !== 'undefined') {
      const bus = a.slice(5);
      const on = bus === 'sfx' ? Sound.sfxOn() : Sound.musicOn();
      if (bus === 'sfx') { Sound.setSfx(!on); if (!on) Sound.play('tick'); }
      else Sound.setMusic(!on);
      this.paintAudio();
    }
  },
  setCadence(v) {
    if (!window.Backend) return;
    Backend.autosaveDays = +v;
    this._set('neo-autosave-days', String(v));
    for (const b of this.el.querySelectorAll('[data-cad]')) {
      const on = b.dataset.cad === String(v);
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  },
  onInput(e) {
    const t = e.target;
    if (t.classList.contains('sxVol') && typeof Sound !== 'undefined') {
      Sound.setVol(t.dataset.bus, t.value);
      if (t.dataset.bus === 'sfx') Sound.play('tick');
      this.paintAudio();
      return;
    }
    const f = this.formState();
    if (t.id === 'sxEmail') { f.email = t.value; t.classList.remove('bad'); }
    else if (t.id === 'sxName') f.name = t.value;
    else if (t.id === 'sxMsg') { f.message = t.value; t.classList.remove('bad'); this.paintCount(); }
  },
  onChange(e) {
    const t = e.target;
    if (t.id === 'sxAttach') {
      const f = this.formState(); f.attach = t.checked; f.attachTouched = true;
      const what = this.el.querySelector('.sxWhat'); if (what) what.style.display = f.attach ? '' : 'none';
    } else if (t.id === 'sxChief') {
      if (window.Backend && Backend.isReady()) { this._chief = t.value; Backend.setChiefName(t.value); }
    }
  },

  /* ---------------- the stylesheet (injected only when live) ---------------- */
  _css() {
    if (document.getElementById('setxCss')) return;
    const st = document.createElement('style');
    st.id = 'setxCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
  },
};

SettingsPage.CSS = `
/* the doors wear a red dot while a patch note is unread (staged devices only) */
.sxDoorDot { position: absolute; z-index: 2; top: 7px; right: 8px; width: 10px; height: 10px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at 35% 30%, #ff8a6e, #e2412b 60%, #a8220f); box-shadow: 0 0 0 2px #1d1007, 0 0 8px rgba(255,90,60,0.75); }

#scrSetx { --chamfer: polygon(0 5px, 3px 5px, 3px 3px, 5px 3px, 5px 0, calc(100% - 5px) 0, calc(100% - 5px) 3px, calc(100% - 3px) 3px,
    calc(100% - 3px) 5px, 100% 5px, 100% calc(100% - 5px), calc(100% - 3px) calc(100% - 5px), calc(100% - 3px) calc(100% - 3px),
    calc(100% - 5px) calc(100% - 3px), calc(100% - 5px) 100%, 5px 100%, 5px calc(100% - 3px), 3px calc(100% - 3px), 3px calc(100% - 5px), 0 calc(100% - 5px));
  --gold: #e8c15a; --rim: #d4a540; --ink: #f3e2b4; --txt: #e8dcbd; --dim: #ab9c7e; --fc: rgba(214,170,74,0.6); --fc2: rgba(214,170,74,0.16);
  background: none; color: var(--txt); font-family: var(--menufont); align-items: center; }
#scrSetx .sxShade { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 90% 70% at 50% 45%, rgba(10,7,4,0.35), rgba(10,7,4,0.82)), linear-gradient(rgba(10,7,4,0.55), rgba(10,7,4,0.3) 30%, rgba(10,7,4,0.6)); }

/* ---- the header: back plaque, the gear, the word ---- */
#scrSetx .sxHead { position: relative; z-index: 1; width: 100%; max-width: 940px; flex: 0 0 auto; display: flex; align-items: center; gap: 12px;
  padding: calc(var(--safe-top) + 10px) 14px 10px; }
#scrSetx .sxBack { position: relative; isolation: isolate; width: 46px; height: 44px; flex: 0 0 auto; padding: 0; border: 0; background: none; cursor: pointer;
  color: #f1d17a; display: flex; align-items: center; justify-content: center; -webkit-appearance: none; appearance: none; }
#scrSetx .sxBack::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#3b3020, #241c11); box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.6), inset 0 10px 0 rgba(255,240,200,0.06); }
#scrSetx .sxBack svg { width: 18px; height: 18px; filter: drop-shadow(0 1px 0 #000); }
#scrSetx .sxBack:active { transform: translateY(2px); }
#scrSetx .sxGear { width: 38px; height: 38px; flex: 0 0 auto; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.7)); }
#scrSetx .sxHead h2 { margin: 0; font: 800 28px/1 var(--menufont); letter-spacing: 2px;
  background: linear-gradient(#fff3c8 0%, #f2cd6a 45%, #c08a2c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.85)); }

/* ---- the carved frame ---- */
#scrSetx .sxFrame { position: relative; z-index: 1; flex: 0 1 auto; min-height: 0; width: calc(100% - 20px); max-width: 920px;
  margin: 0 10px calc(env(safe-area-inset-bottom, 0px) + 10px); display: flex; flex-direction: column; padding: 8px;
  background:
    repeating-linear-gradient(92deg, rgba(255,214,150,0.022) 0 1px, rgba(0,0,0,0) 1px 6px, rgba(0,0,0,0.05) 6px 7px, rgba(0,0,0,0) 7px 13px),
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(110,74,34,0.25), rgba(0,0,0,0) 70%),
    linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 26px rgba(0,0,0,0.65), 0 12px 34px rgba(0,0,0,0.65); }
#scrSetx .sxC { position: absolute; z-index: 3; display: block; width: 42px; height: 42px; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
#scrSetx .sxC svg { display: block; width: 100%; height: 100%; overflow: visible; }
#scrSetx .sxC.tl { left: -6px; top: -6px; }
#scrSetx .sxC.tr { right: -6px; top: -6px; transform: scaleX(-1); }
#scrSetx .sxC.bl { left: -6px; bottom: -6px; transform: scaleY(-1); }
#scrSetx .sxC.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }

/* ---- the tabs: a strip across the top on a phone ---- */
#scrSetx .sxNav { flex: 0 0 auto; display: flex; gap: 6px; padding: 8px 6px 10px; position: relative; z-index: 2;
  border-bottom: 1px solid rgba(214,170,74,0.22); box-shadow: 0 1px 0 rgba(0,0,0,0.5); }
#scrSetx .sxTab { position: relative; isolation: isolate; flex: 1 1 0; min-width: 0; height: 62px; padding: 6px 2px 5px; border: 0; background: none; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #d9caa6;
  font: 700 clamp(8.5px, 2.4vw, 10px)/1 var(--menufont); letter-spacing: 0; text-transform: uppercase; -webkit-appearance: none; appearance: none; }
#scrSetx .sxTab::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#33281a, #231a0f); box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.3), inset 0 10px 0 rgba(255,240,200,0.04), inset 0 -8px 0 rgba(0,0,0,0.25); }
#scrSetx .sxTab img { width: 28px; height: 28px; flex: 0 0 auto; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)) saturate(0.8) brightness(0.86); }
#scrSetx .sxTab .sxTn, #scrSetx .sxTab .sxTs { white-space: nowrap; text-shadow: 0 1px 0 #000; }
#scrSetx .sxTab .sxTs { display: none; }
#scrSetx .sxTab.on { color: #fff0bf; }
#scrSetx .sxTab.on::before { background: linear-gradient(#6a4f22 0%, #4a3515 55%, #3a280f 100%);
  box-shadow: inset 0 0 0 2px #1a1005, inset 0 0 0 3px #f2cf6c, inset 0 0 0 4px #8a6420, inset 0 10px 0 rgba(255,236,170,0.12), inset 0 -8px 0 rgba(0,0,0,0.25); }
#scrSetx .sxTab.on img { filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)) drop-shadow(0 0 6px rgba(255,210,110,0.45)); }
#scrSetx .sxTab:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
#scrSetx .sxDot { display: none; position: absolute; top: 6px; right: 7px; width: 9px; height: 9px; border-radius: 50%; background: #e2412b;
  box-shadow: 0 0 0 2px #1d1007, 0 0 7px rgba(255,90,60,0.75); }
#scrSetx .sxTab.hasDot .sxDot { display: block; }
#scrSetx .sxChev { display: none; }
#scrSetx .sxRailFoot { display: none; }

/* ---- the pane ---- */
#scrSetx .sxPane { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  padding: 12px 8px 12px; position: relative; z-index: 1; overscroll-behavior: contain; }
#scrSetx .sxCard { position: relative; margin: 0 0 14px; padding: 13px 15px 14px; background-color: rgba(8,6,3,0.5); border: 1px solid var(--fc2);
  background-repeat: no-repeat; background-image:
  linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)),
  linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc)), linear-gradient(var(--fc), var(--fc));
  background-size: 14px 2px, 2px 14px, 14px 2px, 2px 14px, 14px 2px, 2px 14px, 14px 2px, 2px 14px;
  background-position: 3px 3px, 3px 3px, calc(100% - 3px) 3px, calc(100% - 3px) 3px, 3px calc(100% - 3px), 3px calc(100% - 3px),
    calc(100% - 3px) calc(100% - 3px), calc(100% - 3px) calc(100% - 3px); }
#scrSetx .sxCard:last-child { margin-bottom: 0; }
#scrSetx .sxCard h3 { margin: 0 0 6px; padding-bottom: 9px; font: 700 19px/1.1 var(--menufont); letter-spacing: 1px; color: var(--ink);
  text-shadow: 0 2px 0 rgba(0,0,0,0.8); border-bottom: 1px solid transparent;
  border-image: linear-gradient(90deg, rgba(214,170,74,0.55), rgba(214,170,74,0.12) 70%, rgba(214,170,74,0)) 1; }
#scrSetx .sxRow { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid rgba(214,170,74,0.1); }
#scrSetx .sxCard > .sxRow:last-child, #scrSetx .sxAud:last-of-type .sxRow { border-bottom: 0; }
#scrSetx .sxRow.sxStack { padding-bottom: 6px; border-bottom: 0; }
#scrSetx .sxL { flex: 1 1 auto; min-width: 0; }
#scrSetx .sxL b { display: block; font: 700 15px/1.25 var(--menufont); letter-spacing: 0.5px; color: #f2e4c1; }
#scrSetx .sxL span { display: block; margin-top: 3px; font: 13px/1.38 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--dim); }
#scrSetx .sxNote, #scrSetx .sxLead { margin: 8px 0 0; font: 12.5px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--dim); }
#scrSetx .sxLead { margin: 4px 0 12px; font-size: 13.5px; color: #cbbd9b; }
#scrSetx .sxNote b, #scrSetx .sxFoot b { color: #e8d39b; font-weight: 600; }
#scrSetx .sxFoot { margin: 2px 0 0; text-align: center; font: 12px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #8f8167; }

/* the switch: a gold pill, the knob slides */
#scrSetx .sxTog { position: relative; flex: 0 0 auto; width: 52px; height: 30px; padding: 0; border: 0; border-radius: 15px; cursor: pointer;
  background: linear-gradient(#1a130b, #241a10); box-shadow: inset 0 0 0 1.5px #0a0603, inset 0 0 0 2.5px rgba(214,170,74,0.32), inset 0 3px 5px rgba(0,0,0,0.6);
  -webkit-appearance: none; appearance: none; transition: background .16s; }
#scrSetx .sxTog i { position: absolute; top: 4px; left: 4px; width: 22px; height: 22px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff8e2, #cdbd99 70%, #8f7f60); box-shadow: 0 2px 3px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(0,0,0,0.25);
  transition: transform .18s cubic-bezier(.3,1.3,.5,1); }
#scrSetx .sxTog.on { background: linear-gradient(#f4d272 0%, #d8a742 50%, #a97a24 100%);
  box-shadow: inset 0 0 0 1.5px #2a1906, inset 0 0 0 2.5px #fff0b8, inset 0 -3px 0 rgba(90,50,0,0.25); }
#scrSetx .sxTog.on i { transform: translateX(22px); background: radial-gradient(circle at 35% 30%, #fffdf4, #f6ead0 70%, #c9b58c); }
#scrSetx .sxTog:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }

/* the dial and its read-out */
#scrSetx .sxDial { display: flex; align-items: center; gap: 12px; padding: 2px 0 12px; }
#scrSetx .sxVol { flex: 1 1 auto; min-width: 0; height: 30px; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; touch-action: pan-x; }
#scrSetx .sxVol::-webkit-slider-runnable-track { height: 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px #0a0603, inset 0 2px 3px rgba(0,0,0,0.5);
  background: linear-gradient(to right, #e8b94c 0 var(--p, 50%), #241b11 var(--p, 50%) 100%); }
#scrSetx .sxVol::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; margin-top: -8px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff3c8, #e2b24c 55%, #9c6f1f); border: 1.5px solid #2a1906; box-shadow: 0 2px 4px rgba(0,0,0,0.6); }
#scrSetx .sxVol::-moz-range-track { height: 8px; border-radius: 4px; background: #241b11; box-shadow: inset 0 0 0 1px #0a0603; }
#scrSetx .sxVol::-moz-range-progress { height: 8px; border-radius: 4px 0 0 4px; background: #e8b94c; }
#scrSetx .sxVol::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #e2b24c; border: 1.5px solid #2a1906; }
#scrSetx .sxVol:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
#scrSetx .sxPct { flex: 0 0 auto; min-width: 58px; height: 30px; display: flex; align-items: center; justify-content: center;
  font: 700 13px/1 var(--menufont); color: var(--ink); font-variant-numeric: tabular-nums; background: rgba(8,6,3,0.7);
  box-shadow: inset 0 0 0 1px rgba(214,170,74,0.4); clip-path: var(--chamfer); }
#scrSetx .sxAud.muted .sxVol { opacity: 0.5; }
#scrSetx .sxAud.muted .sxPct { color: #8f8167; }

/* the cadence: ONE small segmented bar (the old one was four 54px plaques) */
#scrSetx .sxSeg { display: flex; width: 100%; max-width: 300px; height: 32px; margin: 2px 0 2px; clip-path: var(--chamfer);
  background: #120d07; box-shadow: inset 0 0 0 1px #050302, inset 0 0 0 2px rgba(214,170,74,0.45); padding: 2px; gap: 2px; }
#scrSetx .sxSeg button { flex: 1 1 0; min-width: 0; height: 100%; border: 0; padding: 0 4px; cursor: pointer; white-space: nowrap;
  background: linear-gradient(#2c2216, #1f170e); color: #cdbd99; font: 700 11.5px/1 var(--menufont); letter-spacing: 0.6px; text-transform: uppercase;
  -webkit-appearance: none; appearance: none; }
#scrSetx .sxSeg button.on { color: #2b1906; text-shadow: 0 1px 0 rgba(255,240,190,0.5);
  background: linear-gradient(#f0cd6e 0%, #d7a542 50%, #b8862c 100%); box-shadow: inset 0 0 0 1px #fff0b8; }
#scrSetx .sxSeg button:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }

/* a small plaque button */
#scrSetx .sxBtn, #scrSetx .sxSend { position: relative; isolation: isolate; flex: 0 0 auto; border: 0; background: none; cursor: pointer;
  -webkit-appearance: none; appearance: none; text-transform: uppercase; font-family: var(--menufont); }
#scrSetx .sxBtn { height: 38px; padding: 0 16px; color: #f4e8cc; font-size: 12.5px; font-weight: 700; letter-spacing: 1.4px; text-shadow: 0 1px 0 rgba(0,0,0,0.85); }
#scrSetx .sxBtn::before, #scrSetx .sxSend::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#3b3020 0%, #2c2316 50%, #241c11 100%);
  box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.48), inset 0 10px 0 rgba(255,240,200,0.06), inset 0 -8px 0 rgba(0,0,0,0.28); }
#scrSetx .sxBtn:active, #scrSetx .sxSend:active { transform: translateY(2px); filter: brightness(0.9); }

/* folds */
#scrSetx .sxFold summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 8px 0;
  font: 700 14px/1.2 var(--menufont); color: #e8d39b; letter-spacing: 0.5px; }
#scrSetx .sxFold summary::-webkit-details-marker { display: none; }
#scrSetx .sxFold summary::before { content: ''; flex: 0 0 auto; width: 7px; height: 7px; border-right: 2px solid #d4a540; border-bottom: 2px solid #d4a540;
  transform: rotate(-45deg); transition: transform .15s; margin-right: 2px; }
#scrSetx .sxFold[open] > summary::before { transform: rotate(45deg); }
#scrSetx .sxFold summary span { margin-left: auto; font: 600 11px/1 -apple-system, "Segoe UI", Roboto, sans-serif; color: #8f8167; letter-spacing: 0; }
#scrSetx .sxLog { max-height: 260px; overflow-y: auto; touch-action: pan-y; font: 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--dim); }
#scrSetx .sxLog div { padding: 4px 0; border-bottom: 1px solid rgba(214,170,74,0.08); }
#scrSetx .sxLog b { color: #cdb57c; font-weight: 600; margin-right: 4px; }
#scrSetx .sxErr { color: #e8a04a !important; }

/* ---- the feedback form ---- */
#scrSetx .sxKinds { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0 0 14px; }
#scrSetx .sxKind { position: relative; isolation: isolate; min-width: 0; height: 58px; padding: 6px 2px; border: 0; background: none; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #d9caa6;
  font: 700 10.5px/1.05 var(--menufont); letter-spacing: 0.4px; text-transform: uppercase; text-align: center; -webkit-appearance: none; appearance: none; }
#scrSetx .sxKind::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer); background: linear-gradient(#30261a, #20180e);
  box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.26); }
#scrSetx .sxKind img { width: 21px; height: 21px; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
#scrSetx .sxKind.on { color: #fff0bf; }
#scrSetx .sxKind.on::before { background: linear-gradient(#5d451e, #3c2a10);
  box-shadow: inset 0 0 0 2px #1a1005, inset 0 0 0 3px #f2cf6c, inset 0 0 0 4px #8a6420; }
#scrSetx .sxLbl { display: flex; align-items: baseline; gap: 8px; margin: 12px 0 6px; font: 700 12px/1 var(--menufont); letter-spacing: 1.6px;
  text-transform: uppercase; color: #e8d39b; }
#scrSetx .sxLbl em { font: italic 600 11px/1 -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: 0; text-transform: none; color: #8f8167; }
#scrSetx .sxCount { margin-left: auto; font: 600 11px/1 -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: 0; color: #8f8167; text-transform: none; }
#scrSetx .sxIn { display: block; width: 100%; min-height: 46px; padding: 11px 12px; border-radius: 0; border: 0; color: #f4ead2;
  background: #120d07; box-shadow: inset 0 0 0 1px #050302, inset 0 0 0 2px rgba(214,170,74,0.32), inset 0 3px 6px rgba(0,0,0,0.5);
  font: 16px/1.35 -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-user-select: text; user-select: text; touch-action: auto;
  -webkit-appearance: none; appearance: none; outline: none; }
#scrSetx .sxIn::placeholder { color: #6e624c; }
#scrSetx .sxIn:focus { box-shadow: inset 0 0 0 1px #050302, inset 0 0 0 2px #e6bd5a, inset 0 3px 6px rgba(0,0,0,0.5), 0 0 0 3px rgba(232,193,90,0.15); }
#scrSetx .sxIn.bad { box-shadow: inset 0 0 0 1px #050302, inset 0 0 0 2px #e0614a, inset 0 3px 6px rgba(0,0,0,0.5); }
#scrSetx .sxMsg { min-height: 120px; resize: vertical; }
#scrSetx .sxField { margin: 0 0 2px; }
#scrSetx .sxPriv { margin: 6px 0 0; display: flex; gap: 6px; font: 12px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #8f8167; }
#scrSetx .sxPriv svg { flex: 0 0 auto; width: 11px; height: 13px; margin-top: 1px; color: #a8955f; }
#scrSetx .sxCheck { display: flex; align-items: center; gap: 10px; margin: 14px 0 2px; cursor: pointer; font: 600 14px/1.2 -apple-system, "Segoe UI", Roboto, sans-serif; color: #e2d4b2; }
#scrSetx .sxCheck input { position: absolute; opacity: 0; width: 1px; height: 1px; }
#scrSetx .sxCheck i { flex: 0 0 auto; width: 22px; height: 22px; background: #120d07; box-shadow: inset 0 0 0 1px #050302, inset 0 0 0 2px rgba(214,170,74,0.45); position: relative; }
#scrSetx .sxCheck input:checked + i { background: linear-gradient(#f0cd6e, #b8862c); box-shadow: inset 0 0 0 1px #2a1906, inset 0 0 0 2px #fff0b8; }
#scrSetx .sxCheck input:checked + i::after { content: ''; position: absolute; left: 7px; top: 3px; width: 6px; height: 11px; border-right: 3px solid #2a1906; border-bottom: 3px solid #2a1906; transform: rotate(45deg); }
#scrSetx .sxCheck input:focus-visible + i { outline: 2px solid var(--gold); outline-offset: 2px; }
#scrSetx .sxWhat summary { padding: 6px 0 4px 32px; font-size: 12.5px; color: #b9a473; }
#scrSetx .sxDetails { margin: 4px 0 0; padding: 10px 12px; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word;
  background: rgba(5,3,2,0.6); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.18); font: 11.5px/1.45 ui-monospace, Menlo, Consolas, monospace; color: #a99a7c;
  -webkit-user-select: text; user-select: text; touch-action: pan-y; }
#scrSetx .sxSend { display: flex; align-items: center; justify-content: center; gap: 16px; width: 100%; min-height: 54px; margin-top: 16px;
  color: #2b1906; font-size: 16px; font-weight: 700; letter-spacing: 2.4px; text-shadow: 0 1px 0 rgba(255,240,190,0.55); }
#scrSetx .sxSend::before { background: linear-gradient(#f0cd6e 0%, #d7a542 46%, #b8862c 54%, #93661c 100%);
  box-shadow: inset 0 0 0 2px #2a1906, inset 0 0 0 3px #fff0b8, inset 0 0 0 5px #b8862a, inset 0 0 0 6px #4a3008,
    inset 0 12px 0 rgba(255,250,220,0.22), inset 0 -10px 0 rgba(60,30,0,0.22); filter: drop-shadow(0 3px 0 rgba(0,0,0,0.5)); }
#scrSetx .sxSend.busy { animation: btnBusy 1s ease-in-out infinite; pointer-events: none; }
#scrSetx .sxDia { width: 7px; height: 7px; background: currentColor; opacity: 0.75; transform: rotate(45deg); }
#scrSetx .sxStatus { min-height: 18px; margin: 10px 0 0; text-align: center; font: 600 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--dim); }
#scrSetx .sxStatus.good { color: #9fd37a; }
#scrSetx .sxStatus.warn { color: #f0c66a; }
#scrSetx .sxStatus.bad { color: #f08a72; }
#scrSetx .sxPending { margin: 8px 0 0; text-align: center; font: 12px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #b9a473; }
#scrSetx .sxLink { border: 0; background: none; padding: 0 0 0 4px; color: #f2cf6c; text-decoration: underline; font: inherit; cursor: pointer; }

/* ---- patch notes ---- */
#scrSetx .sxNotes { padding: 10px 10px 14px; }
#scrSetx .sxHero { position: relative; aspect-ratio: 2 / 1; overflow: hidden; box-shadow: inset 0 0 0 1px #0b0704, 0 0 0 1px rgba(214,170,74,0.35);
  background: linear-gradient(#3a2c1a, #1a120a); }
#scrSetx .sxHero img { display: block; width: 100%; height: 100%; object-fit: cover; image-rendering: auto; }
#scrSetx .sxHero::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(rgba(10,7,4,0) 45%, rgba(10,7,4,0.82)); box-shadow: inset 0 0 0 2px rgba(10,7,4,0.6), inset 0 0 0 3px rgba(242,207,108,0.35); }
#scrSetx .sxHeroT { position: absolute; z-index: 1; left: 14px; bottom: 11px; display: flex; flex-direction: column; gap: 4px; }
#scrSetx .sxHeroT small { font: 700 10.5px/1 var(--menufont); letter-spacing: 3px; text-transform: uppercase; color: #e8d39b; text-shadow: 0 1px 0 #000; }
#scrSetx .sxHeroT b { font: 800 25px/1 var(--menufont); letter-spacing: 1.5px;
  background: linear-gradient(#fff3c8, #f2cd6a 50%, #c08a2c); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.9)); }
#scrSetx .sxVer { display: flex; align-items: center; gap: 10px; margin: 12px 4px 4px; padding: 9px 12px; background: rgba(5,3,2,0.55); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.25); }
#scrSetx .sxVer i { width: 10px; height: 10px; border-radius: 50%; background: #5fd06a; box-shadow: 0 0 0 2px #0d1a0e, 0 0 8px rgba(95,208,106,0.7); flex: 0 0 auto; }
#scrSetx .sxVerL { font: 700 14px/1.2 var(--menufont); letter-spacing: 0.8px; color: var(--ink); }
#scrSetx .sxNow { margin-left: auto; font: 600 11px/1 -apple-system, "Segoe UI", Roboto, sans-serif; color: #8f8167; }
#scrSetx .sxEntry h4 { margin: 12px 4px 2px; font: 700 17px/1.2 var(--menufont); letter-spacing: 0.6px; color: #f2e4c1; }
#scrSetx .sxItems { list-style: none; margin: 6px 4px 0; padding: 0; }
#scrSetx .sxItems li { position: relative; padding: 6px 0 6px 20px; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #d8cbac; }
#scrSetx .sxItems li::before { content: ''; position: absolute; left: 4px; top: 13px; width: 6px; height: 6px; background: #d4a540; transform: rotate(45deg);
  box-shadow: 0 0 0 1px #2a1906; }
#scrSetx details.sxEntry { border-bottom: 1px solid rgba(214,170,74,0.12); }
#scrSetx details.sxEntry:last-child { border-bottom: 0; }
#scrSetx details.sxEntry summary { padding: 11px 0; flex-wrap: wrap; row-gap: 3px; }
#scrSetx details.sxEntry summary .sxEt { font: 700 14.5px/1.25 var(--menufont); color: #efdeb4; margin: 0; flex: 1 1 auto; min-width: 0; letter-spacing: 0.4px; }
#scrSetx details.sxEntry summary .sxEv { margin-left: auto; color: #8f8167; font: 600 11px/1 -apple-system, "Segoe UI", Roboto, sans-serif; }
#scrSetx details.sxEntry .sxItems { margin: 0 4px 10px 15px; }

/* ---- a wide window: the rail on the left, the pane on the right ---- */
@media (min-width: 720px) {
  #scrSetx .sxHead { padding: calc(var(--safe-top) + 18px) 18px 14px; }
  #scrSetx .sxHead h2 { font-size: 34px; }
  #scrSetx .sxGear { width: 46px; height: 46px; }
  #scrSetx .sxFrame { flex-direction: row; width: calc(100% - 48px); margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); max-height: 760px; }
  #scrSetx .sxC { width: 58px; height: 58px; left: auto; top: auto; }
  #scrSetx .sxC.tl { left: -8px; top: -8px; } #scrSetx .sxC.tr { right: -8px; top: -8px; }
  #scrSetx .sxC.bl { left: -8px; bottom: -8px; } #scrSetx .sxC.br { right: -8px; bottom: -8px; }
  #scrSetx .sxNav { flex: 0 0 auto; flex-direction: column; width: 244px; gap: 10px; padding: 18px 14px 16px 14px; border-bottom: 0;
    border-right: 1px solid rgba(214,170,74,0.22); box-shadow: 1px 0 0 rgba(0,0,0,0.5); }
  #scrSetx .sxTab { flex: 0 0 auto; height: 56px; flex-direction: row; justify-content: flex-start; gap: 12px; padding: 0 14px 0 12px;
    font-size: 14px; letter-spacing: 1px; }
  #scrSetx .sxTab img { width: 34px; height: 34px; }
  #scrSetx .sxTab .sxDot { top: 7px; right: 8px; }
  #scrSetx .sxTab.on .sxChev { display: block; margin-left: auto; width: 8px; height: 8px; border-right: 2px solid #f2cf6c; border-top: 2px solid #f2cf6c; transform: rotate(45deg); }
  #scrSetx .sxRailFoot { display: block; margin: auto 0 0; padding: 14px 4px 2px; text-align: center; font: 600 11px/1.5 var(--menufont);
    letter-spacing: 1.5px; text-transform: uppercase; color: #7d6f55; }
  #scrSetx .sxPane { padding: 16px 18px 16px 18px; }
  #scrSetx .sxKind { height: 62px; font-size: 11px; }
  #scrSetx .sxKind img { width: 28px; height: 28px; }
  #scrSetx .sxCard { padding: 16px 20px 18px; }
  #scrSetx .sxCard h3 { font-size: 21px; }
  #scrSetx .sxNotes { padding: 12px 12px 16px; }
  #scrSetx .sxHero { aspect-ratio: 5 / 2; }
  #scrSetx .sxHeroT b { font-size: 30px; }
}
/* a SHORT wide window — a phone on its side (844x390) takes the rail, and the
   rail's five 56px plaques used to run out through the frame's foot: the
   header tightens, the plaques shorten, and the rail scrolls before it spills */
@media (min-width: 720px) and (max-height: 560px) {
  #scrSetx .sxHead { padding: calc(var(--safe-top) + 8px) 18px 8px; }
  #scrSetx .sxHead h2 { font-size: 26px; }
  #scrSetx .sxGear { width: 36px; height: 36px; }
  #scrSetx .sxFrame { margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); }
  #scrSetx .sxNav { gap: 6px; padding: 12px 12px; overflow-y: auto; overscroll-behavior: contain; }
  #scrSetx .sxTab { height: 42px; }
  #scrSetx .sxTab img { width: 28px; height: 28px; }
  #scrSetx .sxRailFoot { display: none; }
}
/* a tall wide window: the rail never looks cramped beside a short tab */
@media (min-width: 720px) and (min-height: 620px) { #scrSetx .sxFrame { min-height: 460px; } }
/* the narrowest phones: the strip keeps its five */
@media (max-width: 359px) {
  #scrSetx .sxTab { font-size: 8.5px; letter-spacing: 0.2px; }
  #scrSetx .sxTab img { width: 24px; height: 24px; }
  #scrSetx .sxHead h2 { font-size: 24px; }
}
/* a phone: "Patch Notes" reads "Notes" on the strip */
@media (max-width: 719px) {
  #scrSetx .sxTab .sxTs { display: inline; }
  #scrSetx .sxTab .sxTs ~ .sxDot { }
  #scrSetx .sxTab[data-tab="notes"] .sxTn { display: none; }
  #scrSetx .sxKind span { font-size: 9.5px; }
}
@media (prefers-reduced-motion: reduce) { #scrSetx .sxTog, #scrSetx .sxTog i { transition: none; } }
`;
window.SettingsPage = SettingsPage;
window.addEventListener('load', () => { try { SettingsPage.boot(); } catch (e) {} });
