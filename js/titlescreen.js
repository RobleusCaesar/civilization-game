"use strict";
/* THE NIGHT TITLE (tests/title.mjs) — PUBLIC since build 106 (it was staged
   behind the card test link from build 101).

   THE GATE IS ONE PREDICATE: TitleScreen.live() — Boot.TITLE_PUBLIC (the
   inline boot block in index.html, because the splash has to know before any
   script file has parsed) or the deck staging flag (Deck.devOn). TITLE_PUBLIC
   is true, so every device wears the night; turned back off, this file would
   do nothing at all — no element, no stylesheet, no listener — and the
   plaques would stand bare on the night the markup now carries (the glen
   it replaced is retired).

   THE VALLEY BY NIGHT. The backdrop is the reward screen's valley (the
   roundhouses in their palisade, the hall on its rise, the pines, the
   mountains) on the night before: stars, a comet over the hall — the card
   system's Starfall, the one hint of the deck — and the clan at its fire.
   PixelLab art, a lossless whole-factor enlargement, laid by the boot block
   (Boot.t2wear) on the splash and here alike, so the lift has no seam.

   THE PLAQUES ARE DRAWN AT THE DEVICE'S OWN RESOLUTION (the operator's
   ruling on UI chrome): every plaque wears an inline SVG built to its own
   box in CSS pixels — dark walnut with its grain, a gold-leaf rim, a carved
   groove, gold corner caps set with a garnet — rebuilt whenever the box
   changes, so every line is its true width on a 1x desktop and a 3x phone.
   The icons are vectors too. Nothing here is a raster but the backdrop,
   which is scene art. New Game is the gold plate (the reward screen's Claim
   Reward), the Leaderboard wears the reward screen's navy, Continue and the
   minor row are walnut; Continue keeps its flat, washed "no saves yet". */
const TitleScreen = {
  live() {
    if (window.Boot && Boot.TITLE_PUBLIC) return true;
    try { return !!(window.Deck && Deck.devOn && Deck.devOn()); } catch (e) { return false; }
  },
  el: null,
  _n: 0,              // svg id counter: every gradient id on the page is unique
  _ro: null,

  /* Screens.onTitle calls in on every title render (the backend's status
     re-renders it too, and the Cards plaque arrives from DeckScreens): the
     dressing is idempotent and picks up whatever plaque is new */
  onTitle() {
    if (!this.live()) return;
    this.mount();
    this.dress();
    this.place();     // the title may have been laid out afresh (it was hidden behind another screen)
  },

  mount() {
    if (this.el) return this.el;
    const t = document.getElementById('scrTitle');
    if (!t) return null;
    this._css();
    t.classList.add('t2');
    this.el = t;     // before the picture: a cached night fires its load at once
    const tbg = t.querySelector('.tbg');
    if (tbg && window.Boot && Boot.t2wear) {
      const img = Boot.t2wear(tbg, tbg.querySelector('img:not(.t2img)'));
      if (img) {
        const go = () => this.ambient();
        if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
      }
    }
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(es => { for (const e of es) this.paint(e.target); });
    }
    window.addEventListener('resize', () => { this.place(); });
    return t;
  },

  /* the picture the title is wearing right now — the night, or the glen it
     fell back to — for G.titleGlenUp (the splash lifts on it) */
  glenImg() {
    const tbg = document.querySelector('#scrTitle .tbg');
    if (!tbg) return null;
    return tbg.querySelector('img.t2img') || tbg.querySelector('img');
  },

  /* ---------------- the plaques ---------------- */
  KIND: { btnTitleNew: 'gold', btnTitleBoard: 'navy', btnContinue: 'wood' },
  ICON: { btnContinue: 'resume', btnTitleNew: 'flame', btnTitleBoard: 'trophy',
    btnTitleSettings: 'gear', btnTitleHow: 'book', btnTitleLoad: 'scroll', btnTitleCards: 'cards' },
  dress() {
    if (!this.el) return;
    for (const b of this.el.querySelectorAll('.tmenu .abtn')) {
      if (b.querySelector(':scope > .t2f')) continue;
      const kind = this.KIND[b.id] || (b.closest('.trow3') ? 'minor' : 'wood');
      b.dataset.t2 = kind;
      const f = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      f.setAttribute('class', 't2f');
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('focusable', 'false');
      b.prepend(f);
      const ic = this.ICON[b.id], lab = b.querySelector('.blab');
      if (ic && lab && !lab.querySelector('.t2i')) lab.insertAdjacentHTML('afterbegin', this.icon(ic, kind));
      this.paint(b);
      if (this._ro) this._ro.observe(b);
    }
  },
  /* the frame, built to the plaque's LAYOUT box (offsetWidth — never the box
     on screen, which the pop-in scales) */
  paint(b) {
    const f = b && b.querySelector(':scope > .t2f');
    if (!f) return;
    const w = b.offsetWidth, h = b.offsetHeight;
    if (!w || !h || (f._w === w && f._h === h)) return;
    f._w = w; f._h = h;
    f.setAttribute('viewBox', `0 0 ${w} ${h}`);
    f.setAttribute('width', w);
    f.setAttribute('height', h);
    f.innerHTML = this.plaque(w, h, b.dataset.t2 || 'wood', b.id || 'p');
  },

  /* ---------------- vector helpers ---------------- */
  f(n) { return Math.round(n * 100) / 100; },
  rng(seed) {
    let s = 2166136261;
    for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  },
  /* the plaque's outline, inset by i: a rectangle with 45° corners whose
     legs are c at the edge (each inset keeps the diagonal parallel) */
  oct(w, h, c, i) {
    const k = c + i * (Math.SQRT2 - 1), f = n => this.f(n);
    return `M${f(k)},${f(i)}H${f(w - k)}L${f(w - i)},${f(k)}V${f(h - k)}L${f(w - k)},${f(h - i)}H${f(k)}L${f(i)},${f(h - k)}V${f(k)}Z`;
  },
  // the metal: burnished gold banded like struck metal, the light from the top
  METAL: {
    gold: ['#fff4c9', '#f6d074', '#d9a03a', '#a8691a', '#e7b955', '#87500f'],
    dark: ['#e9c77a', '#b98a3a', '#8a5e1e', '#5e3c10', '#9c7330', '#3e270a'],
  },
  metal(id, kind, x1, y1, x2, y2) {
    const c = this.METAL[kind], at = [0, 0.22, 0.44, 0.6, 0.78, 1];
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      c.map((s, i) => `<stop offset="${at[i]}" stop-color="${s}"/>`).join('') + '</linearGradient>';
  },
  FACE: {
    wood: { stops: ['#5b3a1e', '#4a2e16', '#3b2410', '#2c1a0a'], grain: '#120700', light: '#c9925a', groove: '#120800' },
    minor: { stops: ['#55361c', '#452b15', '#37210f', '#2a190a'], grain: '#120700', light: '#c9925a', groove: '#120800' },
    navy: { stops: ['#2d3b5c', '#223050', '#1a2541', '#121a30'], grain: '#050913', light: '#9fb6e8', groove: '#060a16' },
    // the gold plate is METAL, not pale wood: banded like struck leaf, its
    // grain no more than a brushing
    gold: { stops: ['#fbe49a', '#ecc25e', '#d8a444', '#c99235', '#e0b14e', '#a8721f'], at: [0, 0.3, 0.5, 0.56, 0.8, 1],
      grain: '#6a3e0a', light: '#fff6d2', groove: '#4a2a06', brush: true },
  },

  /* ONE PLAQUE, drawn to w x h CSS pixels. Outermost in: an ink line, the
     gold-leaf rim (lit along its top), an ink seat, the face with its grain,
     the bevel (top light, foot shade — swapped when pressed), a carved
     groove one step in, and a gold cap on every corner with a garnet set in
     it. Ids are unique per plaque; nothing here is a raster. */
  plaque(w, h, kind, seed) {
    const n = 't2' + (++this._n), f = n2 => this.f(n2), F = this.FACE[kind] || this.FACE.wood;
    const minor = kind === 'minor', c = minor ? 6 : 8, rim = minor ? 2.4 : 3.2;
    const R = 1 + rim, rnd = this.rng(seed + kind);
    const gid = n + 'g', fid = n + 'f', cid = n + 'c', bid = n + 'b', did = n + 'd', mid = n + 'm';
    let s = '<defs>' +
      this.metal(gid, 'gold', 0, 0, 0, h) +
      this.metal(mid, kind === 'gold' ? 'dark' : 'gold', 0, 0, 0, 22) +
      `<linearGradient id="${fid}" x1="0" y1="0" x2="0" y2="1">` +
        F.stops.map((col, i) => `<stop offset="${(F.at || [0, 0.42, 0.62, 1])[i]}" stop-color="${col}"/>`).join('') + '</linearGradient>' +
      `<linearGradient id="${bid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${kind === 'gold' ? 0.34 : 0.13}"/>` +
        '<stop offset=".34" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity="0"/>' +
        `<stop offset="1" stop-color="#000" stop-opacity="${kind === 'gold' ? 0.22 : 0.34}"/></linearGradient>` +
      `<linearGradient id="${did}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/>` +
        '<stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>' +
      `<clipPath id="${cid}"><path d="${this.oct(w, h, c, R + 0.6)}"/></clipPath>` +
      '</defs>';
    // the rim: ink, gold leaf, a hair of light along the top, the ink seat
    s += `<path d="${this.oct(w, h, c, 0)}" fill="#0b0602"/>` +
      `<path d="${this.oct(w, h, c, 1)}" fill="url(#${gid})"/>` +
      `<path d="M${f(c + 0.65)},1.6 H${f(w - c - 0.65)}" stroke="#fff6d4" stroke-opacity=".6" stroke-width=".7"/>` +
      `<path d="${this.oct(w, h, c, R)}" fill="#120a03"/>`;
    // the face and its grain
    s += `<g clip-path="url(#${cid})"><rect width="${w}" height="${h}" fill="url(#${fid})"/>`;
    const lines = Math.max(5, Math.round(h / (F.brush ? 2.6 : 4.2)));
    for (let i = 0; i < lines; i++) {
      const y0 = R + 1 + (h - 2 * R - 2) * (i + rnd() * 0.8) / lines;
      const amp = F.brush ? 0.1 + rnd() * 0.25 : 0.4 + rnd() * 1.3, wl = 46 + rnd() * 70, ph = rnd() * 6.28;
      let d = `M${f(-4)},${f(y0 + Math.sin(ph) * amp)}`;
      for (let x = -4; x < w + 8; x += wl / 4) {
        const x2 = x + wl / 4, y2 = y0 + Math.sin(ph + (x2 / wl) * 6.28) * amp;
        d += `S${f(x2 - wl / 10)},${f(y2)} ${f(x2)},${f(y2)}`;
      }
      const dark = rnd() < 0.78;
      const op = F.brush ? (dark ? 0.04 + rnd() * 0.05 : 0.12 + rnd() * 0.1) : (dark ? 0.16 + rnd() * 0.2 : 0.05 + rnd() * 0.06);
      s += `<path d="${d}" fill="none" stroke="${dark ? F.grain : F.light}" stroke-opacity="${f(op)}" stroke-width="${f(0.5 + rnd() * 0.8)}"/>`;
    }
    // a knot, off to one side of the label (wood only)
    if (!F.brush && (!minor || rnd() < 0.6)) {
      const kx = (rnd() < 0.5 ? 0.12 + rnd() * 0.12 : 0.76 + rnd() * 0.12) * w, ky = h * (0.3 + rnd() * 0.4), kr = 2.2 + rnd() * 1.6;
      for (let r = 0; r < 3; r++) {
        s += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(kr * (2.3 + r * 1.5))}" ry="${f(kr * (0.55 + r * 0.42))}" fill="none" stroke="${F.grain}" stroke-opacity="${f(0.22 - r * 0.05)}" stroke-width=".7"/>`;
      }
      s += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(kr * 1.1)}" ry="${f(kr * 0.42)}" fill="${F.grain}" fill-opacity=".3"/>`;
    }
    s += `<rect class="hi" width="${w}" height="${h}" fill="url(#${bid})"/>` +
      `<rect class="lo" width="${w}" height="${h}" fill="url(#${did})"/>` +
      `<rect class="dim" width="${w}" height="${h}" fill="#000"/></g>`;
    // the carved groove, one step in from the rim: a dark cut with light on its lower lip
    const gi = R + (minor ? 3.2 : 4.4);
    s += `<path d="${this.oct(w, h, c, gi)}" fill="none" stroke="${F.groove}" stroke-opacity="${kind === 'gold' ? 0.5 : 0.62}" stroke-width="1"/>` +
      `<path d="${this.oct(w, h, c, gi + 0.9)}" fill="none" stroke="${F.light}" stroke-opacity="${kind === 'gold' ? 0.45 : 0.1}" stroke-width=".6"/>`;
    // the corner caps
    s += this.caps(w, h, c, minor, mid, kind);
    return s;
  },
  /* A GOLD CAP ON EVERY CORNER, the way a chest's corners are bound: a
     strap of beaten metal folded round the chamfer, its two arms running
     along the edges and ending in a point, and over the fold a round boss
     with a garnet set in a bezel. One drawing (the top-left); the others are
     it mirrored — the strap's gradient mirrored with it so the light still
     falls from the top, the boss and the stone set in page space so their
     glint is always up and to the left. */
  caps(w, h, c, minor, mid, kind, gems) {
    const T = minor ? 3.6 : 4.6, L = minor ? 10 : 15, f = n => this.f(n);
    const E = c + L, P = minor ? 2.6 : 3.4;      // where each arm ends, and how far its point runs on
    const k = c + T * (Math.SQRT2 - 1);           // the strap's inner fold
    const strap = `M${f(E)},0 H${f(c)} L0,${f(c)} V${f(E)} L${f(T / 2)},${f(E + P)} L${f(T)},${f(E)} V${f(k)} L${f(k)},${f(T)} H${f(E)} L${f(E + P)},${f(T / 2)} Z`;
    const gem = minor ? 1.9 : 2.6, rb = gem + (minor ? 1.9 : 2.5);
    const g = (c + (rb - 0.4) * Math.SQRT2) / 2 + 0.2;   // the boss sits inside the outline, on the fold
    const one = (tx, ty, sx, sy, up) => {
      const x = tx + sx * g, y = ty + sy * g;
      return `<g transform="translate(${tx} ${ty}) scale(${sx} ${sy})">` +
        `<path d="${strap}" fill="url(#${mid}${up ? '' : 'u'})" stroke="#0b0602" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M${f(c + 0.6)},1 H${f(E - 0.4)}" stroke="#fff7d8" stroke-opacity="${up ? 0.75 : 0.22}" stroke-width=".7" stroke-linecap="round"/>` +
        '</g>' +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rb)}" fill="url(#${mid}bs)" stroke="#0b0602" stroke-width="1"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rb - 0.9)}" fill="none" stroke="#fff3c6" stroke-opacity=".35" stroke-width=".6"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(gem + 0.7)}" fill="#1a0c02"/>` +
        `<circle cx="${f(x)}" cy="${f(y)}" r="${f(gem)}" fill="url(#${mid}gem)"/>` +
        `<path d="M${f(x - gem * 0.62)},${f(y - gem * 0.05)} L${f(x - gem * 0.05)},${f(y - gem * 0.62)}" stroke="#fff" stroke-opacity=".75" stroke-width="${f(gem * 0.32)}" stroke-linecap="round"/>`;
    };
    const gemCol = gems || ['#ff8a5c', '#cf3518', '#5c0b05'];   // a garnet unless a card names its own stone
    return `<defs>${this.metal(mid + 'u', kind === 'gold' ? 'dark' : 'gold', 0, 22, 0, 0)}` +
      `<radialGradient id="${mid}bs" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="${kind === 'gold' ? '#f0d08a' : '#fff4c9'}"/>` +
        `<stop offset=".45" stop-color="${kind === 'gold' ? '#a8762a' : '#e0ab45'}"/><stop offset="1" stop-color="${kind === 'gold' ? '#4a2c08' : '#7a4c12'}"/></radialGradient>` +
      `<radialGradient id="${mid}gem" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="${gemCol[0]}"/><stop offset=".55" stop-color="${gemCol[1]}"/><stop offset="1" stop-color="${gemCol[2]}"/></radialGradient></defs>` +
      one(0, 0, 1, 1, true) + one(w, 0, -1, 1, true) + one(0, h, 1, -1, false) + one(w, h, -1, -1, false);
  },

  /* ---------------- the icons (24-unit vectors, gold with an ink line) ---------------- */
  ICONS: {
    resume: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="#0b0602" stroke-width="4"/><circle cx="12" cy="12" r="8.6" fill="none" stroke="url(#G)" stroke-width="2.2"/>' +
      '<path d="M10,7.6 L16.6,12 L10,16.4 Z" fill="url(#G)" stroke="#0b0602" stroke-width="1.1" stroke-linejoin="round"/>',
    flame: '<path d="M4.6,21.2 L19.4,17.6 M4.6,17.6 L19.4,21.2" stroke="#0b0602" stroke-width="3.6" stroke-linecap="round"/>' +
      '<path d="M4.6,21.2 L19.4,17.6 M4.6,17.6 L19.4,21.2" stroke="url(#G)" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12,1.8 C13.6,5.6 17.6,8 17.6,12.8 C17.6,16.3 15.1,18.6 12,18.6 C8.9,18.6 6.4,16.3 6.4,13.2 C6.4,10.6 7.8,9.2 9,7.6 C9.2,9.6 10,10.8 11,11.2 C10.6,8 11,5 12,1.8 Z" fill="url(#G)" stroke="#0b0602" stroke-width="1.15" stroke-linejoin="round"/>' +
      '<path d="M12.3,10.6 C13.2,12.4 14.7,13.4 14.7,15.4 C14.7,17 13.5,17.9 12,17.9 C10.5,17.9 9.4,17 9.4,15.6 C9.4,14.2 10.3,13.3 11,12.6 C11.2,13.6 11.6,14 12.1,14.2 C11.8,13 11.9,11.6 12.3,10.6 Z" fill="url(#H)"/>',
    trophy: '<path d="M7.4,5.6 H4.4 C4.4,9.4 6,10.9 8,11 M16.6,5.6 H19.6 C19.6,9.4 18,10.9 16,11" fill="none" stroke="#0b0602" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M7.4,5.6 H4.4 C4.4,9.4 6,10.9 8,11 M16.6,5.6 H19.6 C19.6,9.4 18,10.9 16,11" fill="none" stroke="url(#G)" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M6.8,3.4 H17.2 V7.6 C17.2,11.4 15,13.6 12,13.6 C9,13.6 6.8,11.4 6.8,7.6 Z M10.6,13.4 H13.4 V16.2 H10.6 Z M8.2,16.4 H15.8 V18.6 H8.2 Z M6.8,18.6 H17.2 V20.8 H6.8 Z" fill="url(#G)" stroke="#0b0602" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M8.6,5 V7.8 C8.6,9.6 9.4,11 10.6,11.7" fill="none" stroke="#fff7d8" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round"/>',
    book: '<path d="M12,6.6 C9.4,4.8 6.2,4.6 3,5.4 V18.4 C6.2,17.6 9.4,17.8 12,19.6 C14.6,17.8 17.8,17.6 21,18.4 V5.4 C17.8,4.6 14.6,4.8 12,6.6 Z" fill="url(#G)" stroke="#0b0602" stroke-width="1.15" stroke-linejoin="round"/>' +
      '<path d="M12,6.6 V19.4" stroke="#0b0602" stroke-width="1.1"/><path d="M5.2,8.4 C7,8 8.6,8.2 10,8.9 M5.2,11 C7,10.6 8.6,10.8 10,11.5 M5.2,13.6 C7,13.2 8.6,13.4 10,14.1 M14,8.9 C15.4,8.2 17,8 18.8,8.4 M14,11.5 C15.4,10.8 17,10.6 18.8,11 M14,14.1 C15.4,13.4 17,13.2 18.8,13.6" fill="none" stroke="#5e3c10" stroke-width=".8" stroke-linecap="round"/>',
    scroll: '<path d="M6.6,4.4 H17.6 C19,4.4 19.8,5.4 19.8,6.6 C19.8,7.8 19,8.6 17.8,8.6 V17.4 C17.8,18.8 16.8,19.8 15.4,19.8 H5.6 C4.2,19.8 3.6,18.8 3.6,17.8 C3.6,16.6 4.4,15.8 5.6,15.8 H6.4 V6.6 C6.4,5.4 6.2,4.4 6.6,4.4 Z" fill="url(#G)" stroke="#0b0602" stroke-width="1.15" stroke-linejoin="round"/>' +
      '<path d="M17.8,8.6 H15.6 M5.6,15.8 C6.8,15.8 7.6,16.6 7.6,17.8 C7.6,18.8 7,19.8 5.6,19.8" fill="none" stroke="#0b0602" stroke-width="1"/>' +
      '<path d="M9,8.8 H15.2 M9,11.4 H15.2 M9,14 H13.6" stroke="#5e3c10" stroke-width=".9" stroke-linecap="round"/>',
    cards: '<g transform="rotate(-14 12 13)"><rect x="4.4" y="5" width="10.4" height="14.6" rx="1.6" fill="url(#G)" stroke="#0b0602" stroke-width="1.1"/><rect x="6.2" y="6.9" width="6.8" height="7.4" rx=".6" fill="#5e3c10" fill-opacity=".55"/></g>' +
      '<g transform="rotate(10 12 13)"><rect x="9.6" y="4.2" width="10.4" height="14.6" rx="1.6" fill="url(#G)" stroke="#0b0602" stroke-width="1.1"/><rect x="11.4" y="6.1" width="6.8" height="7.4" rx=".6" fill="#7a1e10" fill-opacity=".8"/>' +
      '<path d="M14.8,8 L16.4,9.8 L14.8,11.6 L13.2,9.8 Z" fill="#ffd27a"/></g>',
  },
  gear() {
    const f = n => this.f(n);
    let d = '';
    const teeth = 8, R1 = 9.6, R2 = 7.2;
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? R2 : R1, sh = 0.13;
      const p0 = [12 + r * Math.cos(a0 + (i % 2 ? 0 : sh)), 12 + r * Math.sin(a0 + (i % 2 ? 0 : sh))];
      const p1 = [12 + r * Math.cos(a1 - (i % 2 ? 0 : sh)), 12 + r * Math.sin(a1 - (i % 2 ? 0 : sh))];
      d += (i ? 'L' : 'M') + f(p0[0]) + ',' + f(p0[1]) + 'L' + f(p1[0]) + ',' + f(p1[1]);
    }
    return `<path d="${d}Z M12,8.6 A3.4,3.4 0 1 0 12.01,8.6 Z" fill="url(#G)" fill-rule="evenodd" stroke="#0b0602" stroke-width="1.1" stroke-linejoin="round"/>` +
      '<circle cx="12" cy="12" r="5.6" fill="none" stroke="#5e3c10" stroke-width=".8"/>';
  },
  icon(name, kind) {
    const n = 't2i' + (++this._n);
    const body = (name === 'gear' ? this.gear() : this.ICONS[name] || '')
      .replace(/url\(#G\)/g, `url(#${n}G)`).replace(/url\(#H\)/g, `url(#${n}H)`);
    // on the gold plate the icon is struck dark, like the lettering
    const G = kind === 'gold'
      ? `<linearGradient id="${n}G" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e3a0c"/><stop offset="1" stop-color="#3a1c04"/></linearGradient>`
      : `<linearGradient id="${n}G" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22"><stop offset="0" stop-color="#fff4c9"/><stop offset=".28" stop-color="#f6d074"/>` +
        '<stop offset=".55" stop-color="#d9a03a"/><stop offset=".75" stop-color="#a8691a"/><stop offset="1" stop-color="#e2b14e"/></linearGradient>';
    const H = `<linearGradient id="${n}H" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${kind === 'gold' ? '#ffe7a6' : '#fff6cf'}"/><stop offset="1" stop-color="${kind === 'gold' ? '#c47a1e' : '#ff9a3c'}"/></linearGradient>`;
    return `<svg class="t2i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs>${G}${H}</defs>${body}</svg>`;
  },

  /* ---------------- the night's own life ----------------
     The campfire in the painting BURNS (operator, 2026-10-28: "the fire just
     has a few sparks, same with the comet. Let's actually make those a
     little more animated"): a warm breath over it, a hot core flickering at
     its own pace, flame-licks rising and leaning, a run of embers and a few
     darting sparks, and smoke drifting off. The comet BLAZES: its head
     pulses, light runs down its tail, sparks shed off it and drift back
     along the tail, and now and then its head flares into a four-pointed
     star. Smooth, drawn by the compositor (transform and opacity only),
     each set on its own place in the picture whatever the crop (ANCHOR, as
     fractions of the master; TAIL, the comet's tail as an angle and a
     length in the master's pixels), fixed scatters with no Math.random, and
     still for a player who asks for less motion. */
  ANCHOR: {
    fire: { wide: [0.2311, 0.83], tall: [0.4531, 0.9] },
    comet: { wide: [0.702, 0.138], tall: [0.2917, 0.1642] },
  },
  TAIL: { wide: [-26, 74], tall: [-36, 124] },
  NATIVE: { wide: 688, tall: 384 },   // the masters' widths: one art pixel is --u CSS pixels
  reduced() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  },
  ambient() {
    if (!this.el) return;
    if (!this.el.querySelector('.t2amb')) {
      const still = this.reduced(), f2 = n => n.toFixed(2);
      let fire = '<i class="t2glow"></i><i class="t2core"></i>', comet = '<i class="t2glint"></i>';
      if (!still) {
        // three flame-licks over the bed of the fire, each at its own pace
        for (let i = 0; i < 3; i++) fire += `<i class="t2lick" style="--x:${(i - 1) * 4.5};--d:${f2(0.9 + i * 0.27)}s;--t:${f2(-i * 0.41)}s"></i>`;
        // a run of embers, and a few sparks that dart as they climb
        for (let i = 0; i < 16; i++) fire += `<i class="t2em" style="--d:${f2(2.2 + (i * 0.71) % 2.1)}s;--t:${f2(-i * 0.53)}s;--x:${((i * 37) % 31) - 15};--k:${f2(0.6 + (i % 4) * 0.22)}"></i>`;
        for (let i = 0; i < 5; i++) fire += `<i class="t2em t2spark" style="--d:${f2(1.3 + (i * 0.37) % 0.8)}s;--t:${f2(-i * 0.61)}s;--x:${((i * 53) % 25) - 12};--k:${f2(0.7 + (i % 2) * 0.3)}"></i>`;
        // smoke drifting off it
        for (let i = 0; i < 3; i++) fire += `<i class="t2smoke" style="--d:${f2(6.5 + i * 1.3)}s;--t:${f2(-i * 2.4)}s;--x:${(i - 1) * 9}"></i>`;
        // the comet: light running down the tail, sparks shed along it, a flare at the head
        comet = '<i class="t2tail"><i class="t2sheen"></i></i><i class="t2trail">';
        for (let i = 0; i < 9; i++) comet += `<i class="t2bit" style="--d:${f2(1.6 + (i * 0.43) % 1.2)}s;--t:${f2(-i * 0.37)}s;--y:${((i * 29) % 9) - 4};--k:${f2(0.6 + (i % 3) * 0.25)}"></i>`;
        comet += '</i><i class="t2glint"></i><i class="t2flare"></i>';
      }
      const tbg = this.el.querySelector('.tbg');
      for (const [k, h] of [['fire', fire], ['comet', comet]]) {
        const a = document.createElement('div');
        a.className = 't2amb';
        a.dataset.at = k;
        a.setAttribute('aria-hidden', 'true');
        a.innerHTML = h;
        if (tbg) tbg.after(a); else this.el.prepend(a);
      }
    }
    this.place();
  },
  /* each anchor of the painting on the screen, through object-fit: cover */
  place() {
    const all = this.el ? this.el.querySelectorAll('.t2amb') : [], img = this.glenImg();
    const ok = img && img.classList.contains('t2img') && img.naturalWidth;
    for (const a of all) {
      if (!ok) { a.style.display = 'none'; continue; }
      const v = /wide/.test(img.currentSrc || img.src) ? 'wide' : 'tall', p = this.ANCHOR[a.dataset.at][v];
      const r = img.getBoundingClientRect(), iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(r.width / iw, r.height / ih), ox = (r.width - iw * s) / 2, oy = (r.height - ih * s) / 2;
      a.style.display = '';
      a.style.left = (ox + p[0] * iw * s) + 'px';
      a.style.top = (oy + p[1] * ih * s) + 'px';
      a.style.setProperty('--u', (s * iw / this.NATIVE[v]).toFixed(3));
      if (a.dataset.at === 'comet') { a.style.setProperty('--ang', this.TAIL[v][0] + 'deg'); a.style.setProperty('--len', this.TAIL[v][1]); }
    }
  },

  _css() {
    if (document.getElementById('t2css')) return;
    const st = document.createElement('style');
    st.id = 't2css';
    st.textContent = TitleScreen.CSS;
    document.head.appendChild(st);
  },
};

TitleScreen.CSS = `
/* ---- the night title (js/titlescreen.js): scoped to #scrTitle.t2, so the
   pause menu's plaques and every unstaged device are untouched ---- */
#scrTitle.t2 .tbg { background: #0a0d18; }
#scrTitle.t2 .thead { background: radial-gradient(60% 80% at 50% 50%, rgba(4,6,14,0.42), rgba(4,6,14,0) 72%); }
#scrTitle.t2 .tmenu { width: min(352px, 90vw); gap: 12px; margin-top: 24px; }
#scrTitle.t2 .plaques .abtn { color: #f4e7c8; min-height: 54px; font-size: 16.5px; letter-spacing: 2.2px;
  text-shadow: 0 1px 0 rgba(8,4,0,0.95), 0 0 1px rgba(8,4,0,0.8), 0 2px 7px rgba(0,0,0,0.5);
  cursor: pointer; -webkit-tap-highlight-color: transparent; transition: translate 70ms ease-out; }
#scrTitle.t2 .plaques .abtn.big { min-height: 58px; }
#scrTitle.t2 .plaques .abtn::before, #scrTitle.t2 .plaques .abtn::after { display: none; }
#scrTitle.t2 .t2f { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; overflow: visible;
  filter: drop-shadow(0 3px 0 rgba(0,0,0,0.55)) drop-shadow(0 7px 12px rgba(0,0,0,0.42)); }
#scrTitle.t2 .t2f .lo, #scrTitle.t2 .t2f .dim { opacity: 0; }
#scrTitle.t2 .pxi { display: none; }
#scrTitle.t2 .blab { gap: 11px; }
#scrTitle.t2 .t2i { width: 25px; height: 25px; flex: 0 0 auto; overflow: visible;
  filter: drop-shadow(0 1px 0 rgba(0,0,0,0.55)); }
/* New Game is the gold plate, its lettering struck into it */
#scrTitle.t2 .abtn[data-t2="gold"] { color: #2a1505; font-size: 18px; letter-spacing: 2.6px;
  text-shadow: 0 1px 0 rgba(255,243,205,0.65); }
#scrTitle.t2 .abtn[data-t2="gold"] .t2i { width: 27px; height: 27px; filter: drop-shadow(0 1px 0 rgba(255,243,205,0.6)); }
#scrTitle.t2 .abtn[data-t2="navy"] { color: #e3e9f6; }
#scrTitle.t2 .plaques .abtn small { color: rgba(242,228,196,0.74); letter-spacing: 1.6px; font-size: 10px; margin-top: 3px;
  text-shadow: 0 1px 0 rgba(0,0,0,0.9); }
/* the minor row: smaller plates, their icon and word on one line */
#scrTitle.t2 .plaques .trow3 { gap: 12px; }
#scrTitle.t2 .plaques .trow3.clFour .abtn { flex: 1 1 calc(50% - 6px); }
/* three across (the deck switched off: no Cards plaque) has no room for an
   icon beside a word — the row reads as words, as it always did */
#scrTitle.t2 .plaques .trow3:not(.clFour) .t2i { display: none; }
#scrTitle.t2 .plaques .trow3 .abtn { min-height: 48px; font-size: 13.5px; letter-spacing: 1.3px; padding: 4px 6px; }
#scrTitle.t2 .trow3 .blab { gap: 7px; }
#scrTitle.t2 .trow3 .t2i { width: 18px; height: 18px; }
@media (max-width: 359px) {
  #scrTitle.t2 .plaques .trow3 .abtn { font-size: 12px; letter-spacing: 0.8px; padding: 4px 3px; }
  #scrTitle.t2 .trow3 .blab { gap: 5px; }
  #scrTitle.t2 .trow3 .t2i { width: 16px; height: 16px; }
}
/* the patch notes' unread dot (js/settings.js) rides the top rim, clear of
   the corner caps and of the word */
#scrTitle.t2 .sxDoorDot { top: -4px; right: 24px; }
/* the deck's count: a gold-ringed coin beside the word */
#scrTitle.t2 #btnTitleCards .clN { height: 19px; min-width: 19px; line-height: 17px; margin-left: 7px; padding: 0 5px;
  background: radial-gradient(circle at 50% 35%, #3a2410, #170c03); border: 1px solid #e0b252;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.6); color: #ffe7a8; font-size: 11px; text-shadow: none; }
/* pressed: the plate goes down into its frame — the drop collapses, the
   bevel turns over, the face takes a step of shade */
/* translate, not transform: the pop-in holds its last transform frame on
   the plaques (fill-mode both), which would swallow a pressed transform */
#scrTitle.t2 .plaques .abtn:active:not(.cant) { transform: none; translate: 0 2px; filter: none; }
#scrTitle.t2 .plaques .abtn:active:not(.cant) .t2f { filter: drop-shadow(0 1px 0 rgba(0,0,0,0.6)); }
#scrTitle.t2 .plaques .abtn:active:not(.cant) .t2f .hi { opacity: 0; }
#scrTitle.t2 .plaques .abtn:active:not(.cant) .t2f .lo { opacity: 1; }
#scrTitle.t2 .plaques .abtn:active:not(.cant) .t2f .dim { opacity: 0.16; }
@media (hover: hover) {
  #scrTitle.t2 .plaques .abtn:hover:not(.cant) .t2f { filter: drop-shadow(0 3px 0 rgba(0,0,0,0.55)) drop-shadow(0 0 10px rgba(240,190,90,0.28)) drop-shadow(0 7px 12px rgba(0,0,0,0.42)); }
}
#scrTitle.t2 .plaques .abtn:focus-visible { outline: 2px solid #f2cf73; outline-offset: 3px; }
/* DISABLED SITS FLUSH AND WASHED: no drop, a cold face, the word still read */
#scrTitle.t2 .plaques .abtn.cant { opacity: 1; filter: saturate(0.25) brightness(0.74); cursor: default; }
#scrTitle.t2 .plaques .abtn.cant .t2f { filter: none; }
#scrTitle.t2 .plaques .abtn.cant .t2f .hi { opacity: 0.4; }
/* a short window (a phone on its side): every target still 44px */
@media (max-height: 600px) {
  #scrTitle.t2 .tcol { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); }
  #scrTitle.t2 .tmenu { margin-top: 10px; gap: 7px; }
  #scrTitle.t2 .plaques .abtn, #scrTitle.t2 .plaques .abtn.big, #scrTitle.t2 .plaques .trow3 .abtn { min-height: 44px; }
  #scrTitle.t2 .plaques .trow3 { gap: 7px; }
}
/* a wide window: the column takes a little more room — the logo only as far
   as its own pixels allow (1100 wide: 366px at 3x, the chrome rule) */
@media (min-width: 900px) and (min-height: 700px) {
  #scrTitle.t2 .tmenu { width: 372px; }
}
@media (min-width: 1200px) and (min-height: 800px) {
  #scrTitle.t2 #logoArt { width: 360px; }
  #scrTitle.t2 .tmenu { width: 388px; gap: 13px; margin-top: 28px; }
  #scrTitle.t2 .plaques .abtn { min-height: 56px; font-size: 17.5px; }
  #scrTitle.t2 .plaques .abtn.big { min-height: 60px; }
  #scrTitle.t2 .plaques .trow3 .abtn { min-height: 50px; font-size: 14px; }
}
/* ---- the fire's own life ---- */
#scrTitle.t2 .t2amb { position: absolute; z-index: 0; left: 0; top: 0; width: 0; height: 0; pointer-events: none; --u: 2; }
#scrTitle.t2 .t2amb i { position: absolute; display: block; }
#scrTitle.t2 .t2glow { left: calc(var(--u) * -34px); top: calc(var(--u) * -26px);
  width: calc(var(--u) * 68px); height: calc(var(--u) * 46px); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,170,80,0.3), rgba(255,140,60,0.12) 55%, rgba(255,120,40,0) 100%);
  animation: t2flick 2.6s ease-in-out infinite; }
/* the hot core, flickering at its own pace over the flames in the painting */
#scrTitle.t2 .t2core { left: calc(var(--u) * -12px); top: calc(var(--u) * -15px); width: calc(var(--u) * 24px); height: calc(var(--u) * 20px);
  border-radius: 50%; background: radial-gradient(closest-side, rgba(255,236,170,0.55), rgba(255,176,80,0.22) 55%, rgba(255,140,50,0) 100%);
  transform-origin: 50% 80%; animation: t2core 1.15s ease-in-out infinite; }
#scrTitle.t2 .t2lick { left: calc(var(--u) * (var(--x) - 3.5) * 1px); top: calc(var(--u) * -19px); width: calc(var(--u) * 7px); height: calc(var(--u) * 15px);
  border-radius: 50% 50% 45% 45% / 70% 70% 30% 30%; transform-origin: 50% 100%;
  background: radial-gradient(ellipse 50% 60% at 50% 78%, rgba(255,244,190,0.75), rgba(255,170,70,0.5) 45%, rgba(255,110,30,0) 100%);
  animation: t2lick var(--d) ease-in-out var(--t) infinite; }
#scrTitle.t2 .t2em { left: -1.5px; top: calc(var(--u) * -8px); width: 3px; height: 3px; border-radius: 50%;
  background: radial-gradient(circle, #fff1c2 0%, #ffb24a 45%, rgba(255,120,30,0) 100%);
  opacity: 0; animation: t2rise var(--d) linear var(--t) infinite; }
#scrTitle.t2 .t2spark { width: 2px; height: 2px; left: -1px; background: #fff3c8; box-shadow: 0 0 4px 1px rgba(255,170,60,0.85);
  animation-name: t2dart; animation-timing-function: ease-out; }
#scrTitle.t2 .t2smoke { left: calc(var(--u) * (var(--x) - 8) * 1px); top: calc(var(--u) * -30px); width: calc(var(--u) * 16px); height: calc(var(--u) * 16px);
  border-radius: 50%; background: radial-gradient(closest-side, rgba(170,160,150,0.2), rgba(150,140,130,0.08) 60%, rgba(140,130,120,0) 100%);
  opacity: 0; animation: t2smoke var(--d) linear var(--t) infinite; }
@keyframes t2flick { 0%, 100% { opacity: 0.8; } 18% { opacity: 1; } 34% { opacity: 0.68; } 52% { opacity: 0.95; } 71% { opacity: 0.75; } 86% { opacity: 1; } }
@keyframes t2core { 0%, 100% { opacity: 0.7; transform: scale(1, 1); } 23% { opacity: 1; transform: scale(1.06, 1.14); }
  47% { opacity: 0.55; transform: scale(0.95, 0.92); } 71% { opacity: 0.9; transform: scale(1.03, 1.08); } }
@keyframes t2lick { 0%, 100% { opacity: 0.45; transform: scale(0.8, 0.7) skewX(0deg); } 30% { opacity: 0.95; transform: scale(1, 1.2) skewX(-7deg); }
  62% { opacity: 0.6; transform: scale(0.9, 0.9) skewX(6deg); } }
@keyframes t2rise {
  0% { opacity: 0; transform: translate(0, 0) scale(var(--k)); }
  12% { opacity: 1; }
  60% { opacity: 0.8; transform: translate(calc(var(--x) * 0.6px * var(--u)), calc(var(--u) * -30px)) scale(var(--k)); }
  100% { opacity: 0; transform: translate(calc(var(--x) * 1px * var(--u)), calc(var(--u) * -54px)) scale(calc(var(--k) * 0.5)); }
}
@keyframes t2dart {
  0% { opacity: 0; transform: translate(0, 0) scale(var(--k)); }
  10% { opacity: 1; }
  30% { transform: translate(calc(var(--x) * 0.5px * var(--u)), calc(var(--u) * -16px)) scale(var(--k)); }
  55% { opacity: 0.9; transform: translate(calc(var(--x) * -0.3px * var(--u)), calc(var(--u) * -30px)) scale(var(--k)); }
  80% { transform: translate(calc(var(--x) * 0.8px * var(--u)), calc(var(--u) * -44px)) scale(var(--k)); }
  100% { opacity: 0; transform: translate(calc(var(--x) * 0.4px * var(--u)), calc(var(--u) * -56px)) scale(calc(var(--k) * 0.4)); }
}
@keyframes t2smoke {
  0% { opacity: 0; transform: translate(0, 0) scale(0.7); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(var(--u) * 10px), calc(var(--u) * -60px)) scale(2.4); }
}
/* ---- the comet's own life: the head pulses, light runs down the tail, sparks shed along it, a flare now and then ---- */
#scrTitle.t2 .t2glint { left: calc(var(--u) * -10px); top: calc(var(--u) * -10px);
  width: calc(var(--u) * 20px); height: calc(var(--u) * 20px); border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255,240,180,0.7), rgba(255,200,110,0.22) 50%, rgba(255,190,90,0) 100%);
  animation: t2glint 2.4s ease-in-out infinite; }
#scrTitle.t2 .t2tail { left: 0; top: calc(var(--u) * -3px); width: calc(var(--u) * var(--len) * 1px); height: calc(var(--u) * 6px);
  transform-origin: 0 50%; transform: rotate(var(--ang)); overflow: hidden; border-radius: 3px;
  -webkit-mask-image: linear-gradient(90deg, #000 0%, rgba(0,0,0,0.85) 35%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 0%, rgba(0,0,0,0.85) 35%, transparent 100%); }
#scrTitle.t2 .t2sheen { left: 0; top: 0; bottom: 0; width: 45%;
  background: linear-gradient(90deg, rgba(255,226,160,0), rgba(255,236,190,0.6) 50%, rgba(255,226,160,0));
  animation: t2sheen 2.2s cubic-bezier(.4,0,.6,1) infinite; }
#scrTitle.t2 .t2trail { left: 0; top: 0; width: 0; height: 0; transform: rotate(var(--ang)); }
#scrTitle.t2 .t2bit { left: -1px; top: -1px; width: 2px; height: 2px; border-radius: 50%; background: #fff6d8;
  box-shadow: 0 0 3px 1px rgba(255,200,120,0.75); opacity: 0; animation: t2shed var(--d) linear var(--t) infinite; }
#scrTitle.t2 .t2flare { left: calc(var(--u) * -9px); top: calc(var(--u) * -9px); width: calc(var(--u) * 18px); height: calc(var(--u) * 18px);
  background: linear-gradient(90deg, rgba(255,250,230,0), rgba(255,250,230,0.95) 50%, rgba(255,250,230,0)) center / 100% 1.5px no-repeat,
    linear-gradient(0deg, rgba(255,250,230,0), rgba(255,250,230,0.95) 50%, rgba(255,250,230,0)) center / 1.5px 100% no-repeat;
  opacity: 0; animation: t2flare 5.6s ease-in-out 1.2s infinite; }
@keyframes t2glint { 0%, 100% { opacity: 0.45; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.22); } }
@keyframes t2sheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(230%); } }
@keyframes t2shed {
  0% { opacity: 0; transform: translate(0, 0) scale(var(--k)); }
  12% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(var(--u) * var(--len) * 0.75px), calc(var(--y) * 1px * var(--u))) scale(calc(var(--k) * 0.3)); }
}
@keyframes t2flare { 0%, 82%, 100% { opacity: 0; transform: scale(0.3) rotate(0deg); } 88% { opacity: 1; transform: scale(1.5) rotate(20deg); } 94% { opacity: 0.4; transform: scale(0.9) rotate(35deg); } }
@media (prefers-reduced-motion: reduce) {
  #scrTitle.t2 .t2glow, #scrTitle.t2 .t2glint, #scrTitle.t2 .t2core { animation: none; }
  #scrTitle.t2 .t2em, #scrTitle.t2 .t2lick, #scrTitle.t2 .t2smoke, #scrTitle.t2 .t2tail, #scrTitle.t2 .t2trail, #scrTitle.t2 .t2flare { display: none; }
}
`;

window.TitleScreen = TitleScreen;
