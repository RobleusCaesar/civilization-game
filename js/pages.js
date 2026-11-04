"use strict";
/* THE LOAD AND GUIDE PAGES (tests/pages.mjs — operator, 2026-11-04: "Update
   the design of the Load and Guide pages so they match the high quality
   design of the settings page and the card announcement modal").

   THE PAGES ARE THEIR OLD SCREENS, DRESSED. #scrLoad and #scrHowto keep every
   node the rest of the game reaches by id — the back buttons (Screens.bind's,
   which return to the title or the pause menu), #loadTitle (onLoad names the
   page Load or Save), #slotList (where onLoad writes the slots and every
   message, `.hint` for a failure), #btnImportFile / #fileLoad, #howPanels and
   #howDots — and the chrome is built round them once, the first time each is
   shown (mount). A cached older screens.js finds the same ids and still works.

   THE LOOK IS THE SETTINGS PAGE'S AND THE ANNOUNCEMENT'S: a chamfered back
   plaque, the page's emblem and its name in gold Cinzel; the carved walnut
   frame with the gold-leaf rim and SettingsPage.cornerSvg's corners (absent,
   the frame has none); the title's own `.plaques` buttons (walnut, gold rim,
   nailheads; the green Continue plaque for Load); the announcement's gold
   rule with its diamond, its BACK / NEXT / dots and its serif body. Over the
   title's night when opened from the title (Screens.nightBehind); from the
   pause menu, over the game itself.

   EVERY ORNAMENT IS A VECTOR (the chrome ruling): the arrows, the slot
   actions (rename, delete), the file mark, the medallion's ring. The rasters
   are the two settings tab icons as emblems (128px at ≤42 CSS px) and the
   guide's pictures — doubled by Scale2x to 256px (assets/ui/guide/*-2x.png,
   the 128px masters beside them), shown at ≤84 CSS px on a phone — so each is
   within its pixels on a 3x screen. A save's own thumbnail is the save's
   picture, not chrome. */
const ShellPages = {
  _m: {},
  cfg() { return typeof CFG !== 'undefined' ? CFG : null; },     // CFG is a script-level const (the window.G trap)
  art(path) { const C = this.cfg(); return path + '?v=' + ((C && C.ART_V) || 1); },
  esc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; },

  /* ---------------- the chrome, drawn ---------------- */
  BACK: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square"/></svg>',
  ARROW_R: '<svg class="pgArr" viewBox="0 0 6 8" aria-hidden="true" fill="currentColor"><path d="M0.6 0.4 L5.6 4 L0.6 7.6 Z"/></svg>',
  ARROW_L: '<svg class="pgArr" viewBox="0 0 6 8" aria-hidden="true" fill="currentColor"><path d="M5.4 0.4 L0.4 4 L5.4 7.6 Z"/></svg>',
  PEN: '<svg class="pgIc" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 16.5l1-4.2L13.6 3.2a1.6 1.6 0 0 1 2.3 0l.9.9a1.6 1.6 0 0 1 0 2.3L7.7 15.5z" fill="#e9d29a" stroke="#1b1106" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M12.3 4.5l3.2 3.2M4.5 12.3l3.2 3.2" stroke="#1b1106" stroke-width="1.2"/><path d="M3.5 16.5l1-4.2 3.2 3.2z" fill="#3a2a14"/></svg>',
  BIN: '<svg class="pgIc" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 6.5h10l-.9 10a1.4 1.4 0 0 1-1.4 1.3H7.3a1.4 1.4 0 0 1-1.4-1.3z" fill="#e9d29a" stroke="#1b1106" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M3.6 5h12.8M8 5V3.4h4V5" fill="none" stroke="#1b1106" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.8 5h12.4" stroke="#e9d29a" stroke-width=".7" stroke-linecap="round"/>' +
    '<path d="M8.4 9v6M11.6 9v6" stroke="#6b4f22" stroke-width="1.2" stroke-linecap="round"/></svg>',
  FILE: '<svg class="pgIc" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 2.5h7l3.5 3.5v11.5H5z" fill="#efe0b8" stroke="#1b1106" stroke-width="1.3" stroke-linejoin="round"/>' +
    '<path d="M12 2.5V6h3.5" fill="#cbb17a" stroke="#1b1106" stroke-width="1.2" stroke-linejoin="round"/><path d="M10.2 8.5v6M7.6 12l2.6 2.6 2.6-2.6" fill="none" stroke="#7a3a12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  /* the page's frame: the back plaque, the emblem and the name; the carved
     frame with its corners; a pane. Built once per screen. */
  frame(scr, o) {
    const back = document.getElementById(o.back);
    const C = window.SettingsPage && SettingsPage.cornerSvg ? SettingsPage : null;
    scr.classList.add('pg', o.cls);
    scr.innerHTML =
      '<div class="pgShade"></div>' +
      `<header class="pgHead"><span class="pgBackSlot"></span><img class="pgEmb" src="${this.art(o.emblem)}" alt="" onerror="this.remove()">` +
        `<h2 class="pgTitle"${o.titleId ? ` id="${o.titleId}"` : ''}>${this.esc(o.title)}</h2></header>` +
      '<div class="pgFrame">' +
        (C ? [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]].map(([c, fx, fy]) => `<i class="pgC ${c}">${C.cornerSvg('pgc' + o.cls + c, fx, fy)}</i>`).join('') : '') +
        '<div class="pgPane"></div>' +
      '</div>';
    if (back) {
      back.className = 'pgBack';
      back.setAttribute('aria-label', 'Back');
      back.innerHTML = this.BACK;
      scr.querySelector('.pgBackSlot').replaceWith(back);
    }
    return scr.querySelector('.pgPane');
  },

  // dress a page the first time it is shown; answers whether it is dressed
  mount(key) {
    if (this._m[key]) return true;
    const scr = document.getElementById(key === 'load' ? 'scrLoad' : 'scrHowto');
    if (!scr) return false;
    this._css();
    if (key === 'load') this._mountLoad(scr);
    else this._mountGuide(scr);
    this._m[key] = true;
    return true;
  },

  /* ---------------- the Load page ---------------- */
  _mountLoad(scr) {
    const list = document.getElementById('slotList'), imp = document.getElementById('btnImportFile'), file = document.getElementById('fileLoad');
    const was = document.getElementById('loadTitle');
    const pane = this.frame(scr, { cls: 'pgLoad', back: 'loadBack', emblem: 'assets/ui/settings/tab-saves.png',
      title: was ? was.textContent : 'Load game', titleId: 'loadTitle' });
    pane.classList.add('plaques');
    pane.appendChild(list);
    const foot = document.createElement('div');
    foot.className = 'pgImport';
    foot.innerHTML = '<i class="pgRule"><b>From a file</b></i>';
    if (imp) {
      imp.className = 'abtn';
      imp.innerHTML = `<span class="blab">${this.FILE}Import a save file</span>`;
      foot.appendChild(imp);
    }
    if (file) foot.appendChild(file);
    pane.appendChild(foot);
  },
  playtime(sec) {
    const m = Math.max(0, Math.round((+sec || 0) / 60));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  },
  place(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : ''; },
  /* one slot: its number, the save's own picture, the name and one line,
     the actions as data-act buttons (Screens.onLoad wires them) */
  slotCard(row, slot, saveMode) {
    const card = document.createElement('div');
    if (!row) {
      card.className = 'scard pgSlot empty';
      card.innerHTML = `<span class="sthumb pgThumb empty"><b>${slot}</b></span>` +
        `<div class="smeta"><b>Empty slot</b><small>Slot ${slot}</small></div>` +
        `<div class="sacts">${saveMode ? '<button type="button" class="abtn gold pgGo" data-act="save"><span class="blab">Save here</span></button>' : ''}</div>`;
      return card;
    }
    const fin = row.over ? (row.over.win ? '<i class="pgBadge win">Victory</i>' : '<i class="pgBadge lost">Fallen</i>') : '';
    const sub = [`Day ${+row.day || 1}`, this.place(row.landform), this.playtime(row.playtime_seconds)].filter(Boolean).join(' · ');
    card.className = 'scard pgSlot' + (row.over ? (row.over.win ? ' won' : ' lost') : '');
    card.innerHTML =
      `<span class="sthumb pgThumb">${row.thumbnail ? `<img src="${this.esc(row.thumbnail)}" alt="">` : `<b>${slot}</b>`}</span>` +
      `<div class="smeta"><b><span class="pgNm">${this.esc(row.name)}</span>${fin}</b><small>${this.esc(sub)}</small></div>` +
      '<div class="sacts">' +
        (saveMode ? '<button type="button" class="abtn pgGo" data-act="overwrite"><span class="blab">Overwrite</span></button>'
          : '<button type="button" class="abtn gold pgGo" data-act="load"><span class="blab">Load</span></button>') +
        `<button type="button" class="abtn pgIcon" data-act="rename" aria-label="Rename" title="Rename">${this.PEN}</button>` +
        `<button type="button" class="abtn pgIcon pgDel" data-act="del" aria-label="Delete" title="Delete">${this.BIN}</button>` +
      '</div>';
    return card;
  },
  // the delete's first tap arms it: the bin plaque turns red and asks
  armDelete(b) {
    if (!b) return;
    b.classList.add('danger', 'armed');
    b.setAttribute('aria-label', 'Delete — tap again to confirm');
    b.innerHTML = '<span class="blab">Delete?</span>';
  },

  /* ---------------- the Guide ---------------- */
  _mountGuide(scr) {
    const panels = document.getElementById('howPanels'), dots = document.getElementById('howDots');
    const pane = this.frame(scr, { cls: 'pgGuide', back: 'howBack', emblem: 'assets/ui/settings/tab-notes.png', title: 'Guide' });
    pane.classList.add('plaques');
    pane.appendChild(panels);
    // the announcement's nav: BACK, the NEXT plaque, the dots
    const nav = document.createElement('div');
    nav.className = 'pgNav';
    nav.innerHTML = `<button type="button" class="pgPrev" data-act="prev" aria-label="Previous page">${this.ARROW_L}<span>Back</span></button>` +
      `<button type="button" class="abtn pgNext" data-act="next"><span class="blab"><span class="pgNextL">Next</span> ${this.ARROW_R}</span></button>` +
      '<span class="pgNavPad"></span>';
    pane.appendChild(nav);
    pane.appendChild(dots);
    const n = panels.children.length;
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', 'Pages');
    dots.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" class="pgDot" data-i="${i}" aria-label="Page ${i + 1} of ${n}"><i></i></button>`).join('');
    // each page: the picture in a medallion, the rule under the heading
    for (const pg of panels.querySelectorAll('.gpage')) {
      const img = pg.querySelector('.gart'), h = pg.querySelector('h3');
      if (img && !img.closest('.gmed')) {
        const m = document.createElement('span');
        m.className = 'gmed';
        img.replaceWith(m);
        m.appendChild(img);
      }
      if (h && !(h.nextElementSibling && h.nextElementSibling.classList.contains('grule'))) h.insertAdjacentHTML('afterend', '<i class="grule"></i>');
    }
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'prev') this.go(this.at() - 1);
      else if (this.at() >= n - 1) { const bk = document.getElementById('howBack'); if (bk) bk.click(); }   // the last page's plaque reads Done
      else this.go(this.at() + 1);
    });
    dots.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) this.go(+b.dataset.i); });
    panels.addEventListener('scroll', () => { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.paintGuide(); }); }, { passive: true });
    window.addEventListener('keydown', e => {
      if (!window.Screens || Screens.current !== 'howto' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { this.go(this.at() + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { this.go(this.at() - 1); e.preventDefault(); }
    });
  },
  at() {
    const p = document.getElementById('howPanels');
    return p ? Math.round(p.scrollLeft / Math.max(1, p.clientWidth)) : 0;
  },
  go(i) {
    const p = document.getElementById('howPanels');
    if (!p) return;
    i = Math.max(0, Math.min(p.children.length - 1, i));
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.scrollTo({ left: i * p.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    this.paintGuide(i);
  },
  paintGuide(i) {
    const p = document.getElementById('howPanels'), d = document.getElementById('howDots');
    if (!p || !d) return;
    const n = p.children.length;
    if (i == null) i = this.at();
    Array.from(d.children).forEach((x, k) => { x.classList.toggle('on', k === i); x.setAttribute('aria-current', k === i ? 'page' : 'false'); });
    const scr = document.getElementById('scrHowto');
    const prev = scr && scr.querySelector('.pgPrev'), next = scr && scr.querySelector('.pgNextL');
    if (prev) prev.classList.toggle('gone', i <= 0);
    if (next) next.textContent = i >= n - 1 ? 'Done' : 'Next';
  },
  // Screens.show('howto'): always from the first page
  onGuide() {
    if (!this.mount('howto')) return false;
    const p = document.getElementById('howPanels');
    if (p) p.scrollLeft = 0;
    this.paintGuide(0);
    return true;
  },

  _css() {
    if (document.getElementById('pgCss')) return;
    const st = document.createElement('style');
    st.id = 'pgCss';
    st.textContent = this.CSS;
    document.head.appendChild(st);
  },
};

ShellPages.CSS = `
.screen.pg { --chamfer: polygon(0 5px, 3px 5px, 3px 3px, 5px 3px, 5px 0, calc(100% - 5px) 0, calc(100% - 5px) 3px, calc(100% - 3px) 3px,
    calc(100% - 3px) 5px, 100% 5px, 100% calc(100% - 5px), calc(100% - 3px) calc(100% - 5px), calc(100% - 3px) calc(100% - 3px),
    calc(100% - 5px) calc(100% - 3px), calc(100% - 5px) 100%, 5px 100%, 5px calc(100% - 3px), 3px calc(100% - 3px), 3px calc(100% - 5px), 0 calc(100% - 5px));
  --txt: #e8dcbd; --dim: #ab9c7e; --sans: -apple-system, "Segoe UI", Roboto, sans-serif;
  background: none; color: var(--txt); font-family: var(--menufont); align-items: center; justify-content: center; padding: 0; }
.screen.pg [hidden] { display: none !important; }
/* the old screens' own backgrounds (an id each) give way to the night or the game behind */
#scrHowto.pg, #scrLoad.pg { background: none; }
.screen.pg .pgShade { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 90% 70% at 50% 42%, rgba(10,7,4,0.3), rgba(10,7,4,0.8)), linear-gradient(rgba(10,7,4,0.55), rgba(10,7,4,0.25) 30%, rgba(10,7,4,0.6)); }

/* ---- the header: the back plaque, the emblem, the name ---- */
.screen.pg .pgHead { position: relative; z-index: 1; width: 100%; max-width: 760px; flex: 0 0 auto; display: flex; align-items: center; gap: 12px;
  padding: calc(var(--safe-top) + 10px) 14px 10px; }
.screen.pg .pgBack { position: relative; isolation: isolate; width: 46px; height: 44px; min-height: 0; flex: 0 0 auto; padding: 0; border: 0; background: none; cursor: pointer;
  color: #f1d17a; display: flex; align-items: center; justify-content: center; box-shadow: none; -webkit-appearance: none; appearance: none; }
.screen.pg .pgBack::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--chamfer);
  background: linear-gradient(#3b3020, #241c11); box-shadow: inset 0 0 0 2px #120c05, inset 0 0 0 3px rgba(214,170,74,0.6), inset 0 10px 0 rgba(255,240,200,0.06); }
.screen.pg .pgBack svg { width: 18px; height: 18px; filter: drop-shadow(0 1px 0 #000); }
.screen.pg .pgBack:active { transform: translateY(2px); }
.screen.pg .pgEmb { width: 38px; height: 38px; flex: 0 0 auto; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.7)); }
.screen.pg .pgTitle { margin: 0; min-width: 0; font: 800 28px/1 var(--menufont); letter-spacing: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: linear-gradient(#fff3c8 0%, #f2cd6a 45%, #c08a2c 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,0.85)); padding-bottom: 2px; }

/* ---- the carved frame (the settings page's): as tall as what it holds ---- */
.screen.pg .pgFrame { position: relative; z-index: 1; flex: 0 1 auto; min-height: 0; width: calc(100% - 20px); max-width: 740px;
  margin: 0 10px calc(env(safe-area-inset-bottom, 0px) + 10px); display: flex; flex-direction: column; padding: 8px;
  background:
    repeating-linear-gradient(92deg, rgba(255,214,150,0.022) 0 1px, rgba(0,0,0,0) 1px 6px, rgba(0,0,0,0.05) 6px 7px, rgba(0,0,0,0) 7px 13px),
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(110,74,34,0.25), rgba(0,0,0,0) 70%),
    linear-gradient(#2a1d11, #1c140b 60%, #160f08);
  box-shadow: inset 0 0 0 2px #0b0704, inset 0 0 0 4px #b98a32, inset 0 0 0 5px #f3d27a, inset 0 0 0 6px #6b4a16, inset 0 0 0 8px #0b0704,
    inset 0 0 26px rgba(0,0,0,0.65), 0 12px 34px rgba(0,0,0,0.65); }
.screen.pg .pgC { position: absolute; z-index: 3; display: block; width: 42px; height: 42px; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6)); }
.screen.pg .pgC svg { display: block; width: 100%; height: 100%; overflow: visible; }
.screen.pg .pgC.tl { left: -6px; top: -6px; }
.screen.pg .pgC.tr { right: -6px; top: -6px; transform: scaleX(-1); }
.screen.pg .pgC.bl { left: -6px; bottom: -6px; transform: scaleY(-1); }
.screen.pg .pgC.br { right: -6px; bottom: -6px; transform: scale(-1, -1); }
.screen.pg .pgPane { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  padding: 12px 10px 12px; position: relative; z-index: 1; overscroll-behavior: contain; display: flex; flex-direction: column; }
.screen.pg .hint { margin: 16px 8px; text-align: center; font: 600 13.5px/1.45 var(--sans); color: var(--dim); }
/* the announcement's rule: a hair of gold with a diamond in the middle */
.screen.pg .pgRule, .screen.pg .grule { display: block; position: relative; height: 9px; flex: 0 0 auto; font-style: normal;
  background: linear-gradient(90deg, transparent, #c99a40 25%, #f6d27a 50%, #c99a40 75%, transparent) center / 100% 1px no-repeat; }
.screen.pg .grule::after { content: ''; position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; transform: translate(-50%, -50%) rotate(45deg);
  background: #f6d27a; box-shadow: 0 0 0 1px #3a2208, 0 0 8px rgba(255,210,100,.7); }
/* the title's plaques, a size down to sit in a list */
.screen.pg .plaques .abtn { min-height: 44px; padding: 0 16px; font-size: 14px; letter-spacing: 1.2px; display: inline-flex; align-items: center; justify-content: center; }
.screen.pg .plaques .abtn .blab { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.screen.pg .pgIc { width: 20px; height: 20px; flex: 0 0 auto; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.6)); }
.screen.pg .pgArr { width: 7px; height: 10px; flex: 0 0 auto; }

/* ---- the Load page: five slots, a file ---- */
#scrLoad.pg #slotList { display: flex; flex-direction: column; gap: 8px; }
#scrLoad.pg .pgSlot { position: relative; margin: 0; border: 0; border-radius: 0; display: grid; grid-template-columns: 58px minmax(0, 1fr); grid-template-areas: "th meta" "acts acts"; align-items: center;
  gap: 10px 12px; padding: 10px 12px 12px 10px; background: rgba(8,6,3,0.5); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.18), inset 0 0 18px rgba(0,0,0,0.35); }
/* the settings page's card brackets, at each corner */
#scrLoad.pg .pgSlot::before { content: ''; position: absolute; inset: 4px; pointer-events: none;
  background: linear-gradient(#b8903f, #b8903f) 0 0 / 10px 1.5px, linear-gradient(#b8903f, #b8903f) 0 0 / 1.5px 10px,
    linear-gradient(#b8903f, #b8903f) 100% 0 / 10px 1.5px, linear-gradient(#b8903f, #b8903f) 100% 0 / 1.5px 10px,
    linear-gradient(#b8903f, #b8903f) 0 100% / 10px 1.5px, linear-gradient(#b8903f, #b8903f) 0 100% / 1.5px 10px,
    linear-gradient(#b8903f, #b8903f) 100% 100% / 10px 1.5px, linear-gradient(#b8903f, #b8903f) 100% 100% / 1.5px 10px;
  background-repeat: no-repeat; opacity: 0.75; }
#scrLoad.pg .pgSlot.won { box-shadow: inset 0 0 0 1px rgba(242,207,108,0.42), inset 0 0 18px rgba(0,0,0,0.35); }
#scrLoad.pg .pgThumb { grid-area: th; width: 58px; height: 58px; border: 0; border-radius: 0; image-rendering: auto; display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #0d0905; box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f0cf76, 0 0 0 5px #4a3210, 0 3px 8px 5px rgba(0,0,0,0.45); }
#scrLoad.pg .pgThumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
#scrLoad.pg .pgThumb b { font: 700 22px/1 var(--menufont); color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: linear-gradient(#ffe9a6, #a87b2e); filter: drop-shadow(0 1px 0 #000); }
#scrLoad.pg .smeta { grid-area: meta; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
#scrLoad.pg .smeta > b { display: flex; align-items: center; gap: 8px; min-width: 0; font: 700 15.5px/1.15 var(--menufont); letter-spacing: 1.2px;
  text-transform: uppercase; color: #f4e5bf; text-shadow: 0 1px 0 #000; }
#scrLoad.pg .pgNm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#scrLoad.pg .smeta small { font: 600 12px/1.25 var(--sans); color: #a8997b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#scrLoad.pg .pgBadge { flex: 0 0 auto; padding: 3px 6px 2px; font: 800 9px/1 var(--menufont); letter-spacing: 1px; font-style: normal; clip-path: var(--chamfer); }
#scrLoad.pg .pgBadge.win { color: #2b1906; background: linear-gradient(#f4d272, #c8942f); }
#scrLoad.pg .pgBadge.lost { color: #f3d9cf; background: linear-gradient(#7a2a20, #4e1610); }
#scrLoad.pg .sacts { grid-area: acts; display: flex; flex-direction: row; align-items: stretch; gap: 8px; min-width: 0; }
#scrLoad.pg .sacts .pgGo { flex: 1 1 auto; }
#scrLoad.pg .sacts .pgIcon { flex: 0 0 auto; width: 48px; padding: 0; }
#scrLoad.pg .sacts .pgIcon::after { background: none; }
#scrLoad.pg .sacts .pgDel.armed { width: auto; padding: 0 14px; }
#scrLoad.pg .pgSlot.empty { grid-template-columns: 58px minmax(0, 1fr) auto; grid-template-areas: "th meta acts"; padding: 8px 12px 8px 10px;
  background: rgba(8,6,3,0.28); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.1); }
#scrLoad.pg .pgSlot.empty::before { opacity: 0.35; }
#scrLoad.pg .pgThumb.empty { width: 42px; height: 42px; margin-left: 8px; background: rgba(0,0,0,0.3); box-shadow: inset 0 0 0 1px rgba(214,170,74,0.35); }
#scrLoad.pg .pgThumb.empty b { font-size: 17px; opacity: 0.6; }
#scrLoad.pg .pgSlot.empty .smeta > b { color: #8f8066; font-size: 13.5px; }
#scrLoad.pg .pgSlot.empty .smeta small { color: #6f6350; }
#scrLoad.pg .pgSlot.empty .sacts .pgGo { flex: 0 0 auto; }
#scrLoad.pg .pgImport { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px; padding: 0 4px 2px; }
#scrLoad.pg .pgImport .pgRule { width: 100%; height: 14px; text-align: center; }
#scrLoad.pg .pgImport .pgRule b { position: relative; top: -2px; padding: 0 12px; font: 700 10.5px/14px var(--menufont); letter-spacing: 2px; text-transform: uppercase;
  color: #cdb57c; background: #1c140b; text-shadow: 0 1px 0 #000; }
#scrLoad.pg #btnImportFile { width: min(100%, 320px); }

/* ---- the Guide: the announcement's page, one at a time ---- */
#scrHowto.pg .pgPane { overflow: hidden; padding: 10px 6px 0; }
#scrHowto.pg #howPanels { display: flex; flex: 1 1 auto; min-height: 0; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none;
  -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y; position: relative; inset: auto; height: auto; }
#scrHowto.pg #howPanels::-webkit-scrollbar { display: none; }
#scrHowto.pg #howPanels > section { flex: 0 0 100%; min-width: 0; scroll-snap-align: center; overflow-y: auto; display: flex; flex-direction: row; padding: 0; touch-action: pan-x pan-y; }
#scrHowto.pg .gpage { margin: auto; max-width: 31em; padding: 6px 14px 10px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0; }
#scrHowto.pg .gmed { position: relative; display: flex; align-items: center; justify-content: center; width: 112px; height: 112px; flex: 0 0 auto; margin: 4px 0 12px; border-radius: 50%;
  background: radial-gradient(circle at 50% 45%, rgba(255,214,120,0.24), rgba(150,96,30,0.12) 55%, rgba(0,0,0,0.35) 72%);
  box-shadow: 0 0 0 1px #0b0704, 0 0 0 3px #a87b2e, 0 0 0 4px #f3d27a, 0 0 0 5px #4a3210, 0 0 22px 6px rgba(255,190,80,0.16), inset 0 0 16px rgba(0,0,0,0.5); }
#scrHowto.pg .gart { display: block; width: 84px; height: 84px; margin: 0; image-rendering: auto; filter: drop-shadow(0 3px 2px rgba(0,0,0,0.6)); }
#scrHowto.pg .gpage h3 { margin: 0; color: transparent; font: 900 24px/1.1 var(--menufont); letter-spacing: 1.5px; text-transform: uppercase; text-wrap: balance;
  background: linear-gradient(180deg, #fff6d2 0%, #ffe28a 30%, #f6bf3a 58%, #c97f1a 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 #2a1604) drop-shadow(0 0 10px rgba(255,190,70,.3)); padding: 0 0 2px; }
#scrHowto.pg .grule { width: min(70%, 300px); margin: 8px 0 10px; }
#scrHowto.pg .gpage p { margin: 0 0 9px; font: 600 15.5px/1.42 Georgia, 'Times New Roman', serif; color: #f1e5cb; text-shadow: 0 2px 0 rgba(0,0,0,.7); }
#scrHowto.pg .gpage p:last-child { margin-bottom: 0; }
#scrHowto.pg .gpage b { color: #ffd77a; font-weight: 700; }
#scrHowto.pg .pgNav { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 4px 0; }
#scrHowto.pg .pgPrev, #scrHowto.pg .pgNavPad { flex: 0 0 auto; width: 84px; min-height: 44px; }
#scrHowto.pg .pgPrev { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer; box-shadow: none;
  color: #d8c49a; font: 700 12.5px/1 var(--menufont); letter-spacing: .1em; text-transform: uppercase; text-shadow: 0 1px 0 #000; -webkit-appearance: none; appearance: none; }
#scrHowto.pg .pgPrev:hover { color: #ffe39a; }
#scrHowto.pg .pgPrev.gone { visibility: hidden; }
#scrHowto.pg .pgNext { width: min(56%, 260px); min-height: 52px; font-size: 16px; letter-spacing: .14em; }
#scrHowto.pg .pgNext .pgArr { width: 8px; height: 11px; }
#scrHowto.pg #howDots { position: static; flex: 0 0 auto; display: flex; flex-wrap: nowrap; justify-content: center; gap: 0; padding: 2px 0 4px; margin: 0; }
#scrHowto.pg .pgDot { flex: 0 1 26px; min-width: 0; width: 26px; height: 40px; padding: 0; border: 0; background: none; box-shadow: none; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-appearance: none; appearance: none; }
#scrHowto.pg .pgDot i { width: 10px; height: 10px; border-radius: 50%; background: #2a2118; box-shadow: inset 0 0 0 2px #6f5a3a, 0 1px 0 rgba(0,0,0,.6); transition: transform .2s; }
#scrHowto.pg .pgDot.on i { background: radial-gradient(circle at 40% 35%, #fff3c0, #f2c040 55%, #b57d18); box-shadow: 0 0 0 1px #3a2208, 0 0 10px rgba(255,205,90,.8); transform: scale(1.15); }

/* ---- a wide window: the page a size up ---- */
@media (min-width: 720px) {
  .screen.pg .pgHead { padding: calc(var(--safe-top) + 18px) 18px 14px; }
  .screen.pg .pgTitle { font-size: 34px; }
  .screen.pg .pgEmb { width: 42px; height: 42px; }
  .screen.pg .pgFrame { width: calc(100% - 48px); padding: 10px; margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); }
  .screen.pg .pgC { width: 58px; height: 58px; }
  .screen.pg .pgC.tl { left: -8px; top: -8px; } .screen.pg .pgC.tr { right: -8px; top: -8px; }
  .screen.pg .pgC.bl { left: -8px; bottom: -8px; } .screen.pg .pgC.br { right: -8px; bottom: -8px; }
  #scrLoad.pg .pgPane { padding: 18px 24px 20px; }
  #scrLoad.pg .pgSlot { grid-template-columns: 64px minmax(0, 1fr) auto; grid-template-areas: "th meta acts"; padding: 12px 14px 12px 12px; gap: 0 16px; }
  #scrLoad.pg .pgThumb { width: 64px; height: 64px; }
  #scrLoad.pg .smeta > b { font-size: 17px; }
  #scrLoad.pg .smeta small { font-size: 13px; }
  #scrLoad.pg .sacts .pgGo { flex: 0 0 auto; min-width: 128px; }
  #scrHowto.pg .pgPane { padding: 22px 24px 4px; }
  #scrHowto.pg .gmed { width: 120px; height: 120px; margin-bottom: 16px; }
  #scrHowto.pg .gart { width: 84px; height: 84px; }
  #scrHowto.pg .gpage { max-width: 600px; }
  #scrHowto.pg .gpage h3 { font-size: 32px; }
  #scrHowto.pg .grule { margin: 12px 0 14px; }
  #scrHowto.pg .gpage p { font-size: 18px; }
  #scrHowto.pg .pgNext { min-height: 56px; font-size: 17px; }
}
/* a short window held upright (320x568): the medallion steps down */
@media (max-aspect-ratio: 4/3) and (max-height: 700px) {
  .screen.pg .pgHead { padding: calc(var(--safe-top) + 6px) 14px 6px; }
  .screen.pg .pgTitle { font-size: 24px; }
  .screen.pg .pgEmb { width: 32px; height: 32px; }
  #scrHowto.pg .gmed { width: 88px; height: 88px; margin-bottom: 8px; }
  #scrHowto.pg .gart { width: 66px; height: 66px; }
  #scrHowto.pg .gpage h3 { font-size: 21px; }
  #scrHowto.pg .grule { margin: 6px 0 8px; }
  #scrHowto.pg .gpage p { font-size: 14.5px; line-height: 1.38; }
  #scrLoad.pg .pgSlot { gap: 8px 10px; padding: 8px 10px 10px 8px; }
}
/* A PHONE ON ITS SIDE: the guide's picture beside its words, the slots two lines */
@media (min-aspect-ratio: 4/3) and (max-height: 560px) {
  .screen.pg .pgHead { padding: calc(var(--safe-top) + 6px) 18px 6px; }
  .screen.pg .pgTitle { font-size: 24px; }
  .screen.pg .pgEmb { width: 32px; height: 32px; }
  .screen.pg .pgFrame { max-width: 900px; margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); }
  #scrHowto.pg .pgPane { padding: 8px 12px 0; }
  #scrHowto.pg .gpage { display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: center; align-items: start; justify-items: start;
    text-align: left; max-width: 46em; column-gap: 22px; }
  #scrHowto.pg .gpage > * { grid-column: 2; }
  #scrHowto.pg .gmed { grid-column: 1; grid-row: 1 / span 4; align-self: center; width: 104px; height: 104px; margin: 0; }
  #scrHowto.pg .gart { width: 78px; height: 78px; }
  #scrHowto.pg .gpage h3 { font-size: 21px; }
  #scrHowto.pg .grule { width: 200px; margin: 6px 0 8px; }
  #scrHowto.pg .gpage p { font-size: 14.5px; line-height: 1.36; margin-bottom: 6px; }
  #scrHowto.pg .pgNav { padding-top: 4px; }
  #scrHowto.pg .pgNext { min-height: 44px; }
  #scrHowto.pg .pgDot { height: 32px; }
  /* the slots each on one line */
  #scrLoad.pg .pgPane { padding: 12px 14px 12px; }
  #scrLoad.pg .pgSlot { grid-template-columns: 52px minmax(0, 1fr) auto; grid-template-areas: "th meta acts"; gap: 0 14px; padding: 8px 12px 8px 10px; }
  #scrLoad.pg .pgThumb { width: 52px; height: 52px; }
  #scrLoad.pg .pgThumb.empty { width: 38px; height: 38px; margin-left: 7px; }
  #scrLoad.pg .sacts .pgGo { flex: 0 0 auto; min-width: 104px; }
}
@media (max-width: 359px) {
  .screen.pg .pgTitle { font-size: 21px; letter-spacing: 1.2px; }
  #scrLoad.pg .sacts .pgIcon { width: 44px; }
  #scrHowto.pg .pgPrev, #scrHowto.pg .pgNavPad { width: 66px; }
}
@media (prefers-reduced-motion: reduce) { #scrHowto.pg .pgDot i { transition: none; } }
`;
window.ShellPages = ShellPages;
