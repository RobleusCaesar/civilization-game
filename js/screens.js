"use strict";
/* Screens — the game shell: a tiny state machine over full-viewport screens
   (title / newgame / load / settings / playing / paused / endgame / howto).
   'playing' is the absence of a screen: the shell hides and the HUD returns.
   All chrome uses the established wood/16-bit identity. Mobile-first. */

const Screens = {
  current: null,
  saveMode: false,          // the Load screen doubles as a save-slot picker
  backTo: 'title',          // where Load/Settings/HowTo return to
  lastSavedDay: 0,          // quit-guard: unsaved progress since this day
  _demo: false,             // S currently holds the title's demo world
  _confirmQuit: false,
  newPrefs: { mode: 'moderate', size: 'large', landform: 'random' },

  el(id) { return document.getElementById(id); },

  init() {
    this.bind();
    window.addEventListener('backend-status', e => {
      this.renderChip(e.detail);
      // the backend often comes up after the title first renders — re-resolve
      // the Continue button so cloud saves win over the local crash net
      if (this.current === 'title') this.onTitle();
    });
    // title camera drift
    const pan = () => {
      if (this.current === 'title' && window.S && R.terrainCache) {
        // a demo world that plays itself to a finish quietly rolls a new one
        if (S.over && this._demo) { this._demo = false; this.ensureDemo(); }
        R.cam.x += 0.22; R.cam.y += 0.09;
        const world = CFG.W * CFG.TILE;
        if (R.cam.x > world - R.viewW() / R.cam.z) { R.cam.x = -40; R.cam.y = 40 + Math.random() * world * 0.3; }
        R.clampCam();
      }
      requestAnimationFrame(pan);
    };
    requestAnimationFrame(pan);
  },

  renderChip(d) {
    const chip = this.el('cloudChip');
    if (!chip) return;
    if (!d.configured) { chip.textContent = '☁ cloud saves off'; return; }
    chip.textContent = d.uid ? (d.online ? '☁ ' + Backend.villageName(d.uid) : '☁ offline') : '☁ connecting…';
  },

  show(name, opts) {
    opts = opts || {};
    this.current = name;
    this.el('shell').classList.toggle('show', name !== 'playing');
    document.body.classList.toggle('shell', name !== 'playing');
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('show');
    const scr = this.el('scr' + name[0].toUpperCase() + name.slice(1));
    if (scr) scr.classList.add('show');
    this._confirmQuit = false;
    if (name === 'title') this.onTitle();
    else if (name === 'draft') this.onDraft();
    else if (name === 'newgame') this.onNewgame();
    else if (name === 'load') this.onLoad(opts);
    else if (name === 'settings') this.onSettings();
    else if (name === 'paused') this.onPaused();
    else if (name === 'leaders') this.onLeaders();
    else if (name === 'endgame') this.onEndgame(opts);
    else if (name === 'playing') { if (window.S) S.paused = false; }
    if (name !== 'playing' && window.S && !this._demo) S.paused = true;
  },

  /* ---------------- title ---------------- */
  ensureDemo() {
    if (window.S && this._demo) return;
    this._demo = true;
    G.newGame(String((Math.random() * 1e9) | 0), 'moderate', 'large');
    Cards.pick((Math.random() * 3) | 0);   // the demo world drafts for itself
    G.freeVis = true;         // newGame resets fog; the demo shows the whole map
    G.updateVisibility();
    S.paused = false;                       // the world lives behind the logo
    document.getElementById('toasts').innerHTML = '';
    R.cam.z = 1.7;
    const tc = Bld.tcOf('P');            // open on the village, drift from there
    if (tc) R.centerOn(tc.x, tc.y); else { R.cam.x = 0; R.cam.y = CFG.W * CFG.TILE * 0.3; }
  },

  onTitle() {
    this.ensureDemo();
    this.backTo = 'title';
    // Continue = newest cloud slot (or the crash-net snapshot if it's all we have)
    const btn = this.el('btnContinue');
    btn.classList.add('cant');
    btn.querySelector('small').textContent = 'looking for saves…';
    this._newestSlot = null;
    let snap = window.Backend ? Backend.readLocalSnapshot() : null;
    try {   // a finished run in the crash net is a told story, not a Continue
      if (snap && snap.json && JSON.parse(snap.json).over) snap = null;
    } catch (e) { snap = null; }
    const finish = (label, ok) => {
      btn.querySelector('small').textContent = label;
      btn.classList.toggle('cant', !ok);
    };
    if (window.Backend && Backend.isReady()) {
      Backend.listSaves().then(r => {
        const rows = ((r.ok && r.data) || []).slice()
          .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        const live = rows.find(row => !row.over);   // newest live cloud slot (finished runs greyed out)
        // Continue = the MOST RECENT playable game. An unfinished run that was
        // never saved to a slot lives only in the crash net, and can be newer
        // than any cloud slot — don't let a stale cloud save shadow it.
        const liveAt = live ? (Date.parse(live.updated_at) || 0) : 0;
        if (snap && snap.json && (snap.at || 0) > liveAt) {
          this._newestSlot = 'local';
          finish('recover last session (day ' + snap.day + ')', true);
        } else if (live) {
          this._newestSlot = live.slot;
          finish(`${live.name} — day ${live.day}`, true);
        } else if (snap && snap.json) { this._newestSlot = 'local'; finish('recover last session (day ' + snap.day + ')', true); }
        else if (rows.length) finish('last run complete — start a new game', false);
        else finish('no saves yet', false);
      });
    } else if (snap && snap.json) { this._newestSlot = 'local'; finish('recover last session (day ' + snap.day + ')', true); }
    else finish(window.Backend && Backend.configured ? 'no saves yet' : 'cloud saves off', false);
  },

  async continueGame() {
    if (this._newestSlot == null) return;
    if (this._newestSlot === 'local') {
      const snap = Backend.readLocalSnapshot();
      if (!snap) return;
      G.loadJSON(snap.json);
      if (snap.slot) Backend.markActiveSlot(snap.slot);
      this.enterGame();
      UI.toast('Recovered your last session — save it to a slot to keep it');
      return;
    }
    const r = await Backend.loadSlot(this._newestSlot);
    if (!r.ok) { UI.toast(r.error.message, true); return; }
    this.loadRow(r.data);
  },

  loadRow(row) {
    G.loadJSON(typeof row.state === 'string' ? row.state : JSON.stringify(row.state));
    Backend.markActiveSlot(row.slot);
    Backend.activeName = row.name;
    this.lastSavedDay = S.day;
    this._demo = false;
    // a finished run reopens at its tally (loadJSON already raised it) —
    // the score can still be saved to the board from there
    if (S.over) { G.freeVis = false; return; }
    this.enterGame();
  },

  enterGame() {
    this._demo = false;
    G.freeVis = false;
    S.paused = false;
    document.getElementById('btnPause').textContent = '⏸';
    this.show('playing');
  },

  /* ---------------- new game ---------------- */
  onNewgame() {
    for (const row of ['ngMode', 'ngSize', 'ngLand']) {
      const key = { ngMode: 'mode', ngSize: 'size', ngLand: 'landform' }[row];
      this.el(row).querySelectorAll('.abtn').forEach(b =>
        b.classList.toggle('sel', b.dataset.v === this.newPrefs[key]));
    }
  },

  startNewGame() {
    const p = this.newPrefs;
    let seed = '';
    if (p.landform !== 'random') {
      // roll seeds until the wished landform comes up (generation is cheap)
      for (let i = 0; i < 90; i++) {
        const s = String((Math.random() * 1e9) | 0);
        CFG.W = CFG.H = CFG.SIZES[p.size];
        if (MapGen.generate(s).landform === p.landform) { seed = s; break; }
      }
    }
    if (!seed) seed = String((Math.random() * 1e9) | 0);
    this._demo = false;
    G.freeVis = false;
    // your people's tunic is rolled at random; red stays the rival tribe's colour
    const pool = (Sprites.villagerTunics || ['blue']).filter(t => t !== 'red');
    const tunic = pool[(Math.random() * pool.length) | 0];
    G.newGame(seed, p.mode, p.size, undefined, tunic);     // the rival chief is always a fresh roll
    Backend.markActiveSlot(null);          // fresh run: no cloud slot until first save
    Backend.activeName = null;
    this.lastSavedDay = 1;
    this.show('draft');                    // ORIGIN CARDS: pick before the world moves
  },

  /* ---------------- ORIGIN CARDS: the draft ----------------
     Three face-down cards deal in, flip staggered, tap to lift, tap again
     to keep. The chosen card steps forward, the rest burn away; the rival's
     card is revealed per difficulty (full / name / face-down). */
  onDraft() {
    const D = window.S && S.draft;
    if (!D || D.done || !D.hand.length) { this.enterGame(); return; }   // nothing to draft
    const box = this.el('draftCards');
    box.innerHTML = '';
    this.el('draftRival').style.display = 'none';
    this.el('btnDraftGo').style.display = 'none';
    this.el('draftHint').textContent = 'Tap a card to look it over';
    this._draftSel = -1;
    D.hand.forEach((c, i) => {
      const d = Cards.DEFS[c.key];
      const el = document.createElement('div');
      el.className = 'ocard';
      el.innerHTML =
        `<div class="ocardIn">
           <div class="oface oback">❂</div>
           <div class="oface ofront"><canvas width="128" height="128"></canvas>
             <div class="oname">${this.esc(d.name)}</div>
             <div class="oboon">${this.esc(d.text(c.roll))}</div>
             <div class="oflavor">${this.esc(d.flavor)}</div></div>
         </div>`;
      Cards.drawMotif(el.querySelector('canvas'), c.key);
      el.addEventListener('click', () => this.draftTap(i, el));
      box.appendChild(el);
      setTimeout(() => el.classList.add('dealt'), 60 + i * 130);        // deal in…
      setTimeout(() => el.classList.add('flip'), 560 + i * 150);        // …then flip
    });
    let seen = false;
    try { seen = !!localStorage.getItem('neo-draft-help'); } catch (e) {}
    this.el('draftOverlay').style.display = seen ? 'none' : 'flex';
  },

  draftTap(i, el) {
    const D = window.S && S.draft;
    if (!D || D.done || !el.classList.contains('flip')) return;
    if (this._draftSel !== i) {                    // first tap: lift and consider
      this._draftSel = i;
      for (const o of this.el('draftCards').children) o.classList.remove('lift');
      el.classList.add('lift');
      this.el('draftHint').textContent =
        'Tap again to keep ' + Cards.DEFS[D.hand[i].key].name;
      return;
    }
    Cards.pick(i);                                 // second tap: kept
    const kids = Array.from(this.el('draftCards').children);
    kids.forEach((o, j) => {
      o.classList.remove('lift');
      if (j === i) { o.classList.add('chosen'); return; }
      o.classList.add('burn');
      this._burnCard(o, j);                         // real pixel fire eats it away
    });
    this.el('draftHint').textContent = '';
    this.revealRival();
    this.el('btnDraftGo').style.display = '';
  },

  /* an unchosen card is consumed by a pixel fire that climbs it and throws
     ash into the wind. Each card gets its own seed + wind (outward from the
     centre) so the two never look like the same animation. */
  _burnCard(card, idx) {
    const box = this.el('draftCards');
    // GUARANTEED cleanup. However the fancy fire fares — a rAF the browser
    // throttles to a crawl, a canvas iOS Safari refuses to allocate — the card
    // MUST collapse. This failsafe fires no matter what the animation does, so
    // an unchosen card can never be left standing under the flames.
    const failsafe = setTimeout(() => card.classList.add('gone'), 1500);
    const W = Math.round(card.offsetWidth), H = Math.round(card.offsetHeight);
    if (!W || !H) { clearTimeout(failsafe); card.classList.add('gone'); return; }   // not laid out — just drop it

    // Canvas allocation can fail on memory-tight mobile browsers; if it does,
    // skip the fire but still remove the card (via the failsafe) — never throw.
    let cvs, g, off, og, imgData, d;
    const FW = 46, FH = 62, MAXH = 36;   // chunky offscreen fire buffer, scaled up hard
    try {
      cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      cvs.style.cssText = `position:absolute;left:${card.offsetLeft}px;top:${card.offsetTop}px;` +
        `width:${W}px;height:${H}px;z-index:2;pointer-events:none;image-rendering:pixelated;`;
      box.appendChild(cvs);
      g = cvs.getContext('2d'); g.imageSmoothingEnabled = false;
      off = document.createElement('canvas'); off.width = FW; off.height = FH;
      og = off.getContext('2d');
      imgData = og.createImageData(FW, FH); d = imgData.data;
      if (!g || !og) throw new Error('no 2d context');
    } catch (e) {
      if (cvs) cvs.remove();
      return;   // failsafe still collapses the card a beat later
    }
    const buf = new Uint8Array(FW * FH);
    const PAL = [];
    for (let h = 0; h <= MAXH; h++) {
      const t = h / MAXH; let r, gg, b, a;
      if (t < 0.03) { r = 0; gg = 0; b = 0; a = 0; }
      else if (t < 0.35) { r = 70 + t * 360; gg = 12 + t * 60; b = 8; a = 90 + t * 340; }
      else if (t < 0.70) { r = 235; gg = 70 + (t - 0.35) * 400; b = 18; a = 250; }
      else { r = 255; gg = 205 + (t - 0.70) * 150; b = 70 + (t - 0.70) * 560; a = 255; }
      PAL.push([Math.min(255, r | 0), Math.min(255, gg | 0), Math.min(255, b | 0), Math.min(255, a | 0)]);
    }
    // seeded rng → a distinct fire per card
    let sd = (0x1234 + idx * 0x9e3779b1) >>> 0;
    const rnd = () => { sd = (sd + 0x6d2b79f5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const cardMid = card.offsetLeft + W / 2;
    const wind = cardMid < box.offsetWidth / 2 ? -1 : 1;    // ash blows outward from centre
    const decayBias = 0.55 + rnd() * 0.9, flick = 0.6 + rnd() * 0.7, gust = 0.4 + rnd() * 0.5;
    const ash = [];
    const DUR = 1150, t0 = performance.now(), ease = x => 1 - (1 - x) * (1 - x);

    const drawAsh = dt => {
      for (let k = ash.length - 1; k >= 0; k--) {
        const p = ash[k]; p.age += dt;
        if (p.age >= p.life) { ash.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 26 * dt; p.vx *= 0.99;
        const lf = 1 - p.age / p.life;
        if (p.ember) g.fillStyle = `rgba(255,${(150 + lf * 90) | 0},50,${lf.toFixed(2)})`;
        else { const v = (44 + lf * 70) | 0; g.fillStyle = `rgba(${v},${v - 8},${v - 14},${(lf * 0.75).toFixed(2)})`; }
        g.fillRect(p.x | 0, p.y | 0, p.sz, p.sz);
      }
    };

    const step = now => {
      if (this.current !== 'draft') { clearTimeout(failsafe); cvs.remove(); card.classList.add('gone'); return; }
      const t = Math.min(1, (now - t0) / DUR), front = ease(t);
      const frontRow = Math.round((1 - front) * (FH - 1));
      // the card body dissolves upward (—webkit— prefix for older iOS Safari,
      // which ignores the unprefixed clip-path and would leave the card whole)
      const clip = `inset(0 0 ${(front * 100).toFixed(1)}% 0)`;
      card.style.webkitClipPath = clip; card.style.clipPath = clip;
      // the burn front is the fire source
      for (let x = 0; x < FW; x++)
        for (let y = frontRow; y < Math.min(FH, frontRow + 3); y++) buf[y * FW + x] = MAXH;
      // propagate heat upward with per-card wind + decay (classic fire spread)
      for (let x = 0; x < FW; x++) for (let y = 1; y < FH; y++) {
        const src = y * FW + x, px = buf[src];
        if (px === 0) { buf[src - FW] = 0; continue; }
        const spread = (rnd() * 3) | 0;
        const dec = (rnd() < flick ? (spread & 1) : 0) + (rnd() < decayBias ? 1 : 0);
        let dx = x - spread + 1 + (rnd() < gust ? wind : 0);
        dx = dx < 0 ? 0 : dx >= FW ? FW - 1 : dx;
        buf[(y - 1) * FW + dx] = Math.max(0, px - dec);
      }
      for (let i2 = 0; i2 < FW * FH; i2++) {
        const c = PAL[buf[i2]], o = i2 * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
      }
      og.putImageData(imgData, 0, 0);
      g.clearRect(0, 0, W, H);
      g.drawImage(off, 0, 0, W, H);
      // throw ash + embers off the burning front, into the wind
      const frontPx = (1 - front) * H;
      if (t < 0.94) for (let s = 0, n = 3 + ((rnd() * 4) | 0); s < n; s++)
        ash.push({ x: rnd() * W, y: frontPx + rnd() * 8 - 4,
          vx: wind * (16 + rnd() * 48) + (rnd() * 12 - 6), vy: -(22 + rnd() * 60),
          life: 0.55 + rnd() * 0.7, age: 0, sz: 2 + ((rnd() * 3) | 0), ember: rnd() < 0.3 });
      drawAsh(1 / 60);
      if (t < 1) { requestAnimationFrame(step); return; }
      // the card is ash now — collapse its slot, let the last embers drift, then clean up
      clearTimeout(failsafe);
      if (this.current === 'draft') card.classList.add('gone');
      let extra = 0;
      const drift = () => {
        g.clearRect(0, 0, W, H); extra += 1 / 60; drawAsh(1 / 60);
        if (ash.length && extra < 0.8) requestAnimationFrame(drift); else cvs.remove();
      };
      requestAnimationFrame(drift);
    };
    requestAnimationFrame(step);
  },

  revealRival() {
    const D = S.draft, box = this.el('draftRival');
    const cd = Cards.DEFS[D.rival.pick.key];
    if (D.intel === 'none') {
      box.innerHTML = `<div class="omini hid">❂</div>
        <div>The rival's Origin is <b>hidden</b>. Watch how they move —
        your scouts will whisper what they see.</div>`;
    } else {
      const known = D.intel === 'full';
      box.innerHTML = `<div class="omini"><canvas width="96" height="96"></canvas></div>
        <div>Rival origin: <b>${this.esc(cd.name)}</b>${known
          ? ' — ' + this.esc(cd.text(D.rival.pick.roll)) : ''}</div>`;
      Cards.drawMotif(box.querySelector('canvas'), D.rival.pick.key);
    }
    box.style.display = 'flex';
  },

  /* ---------------- load / save slots ---------------- */
  async onLoad(opts) {
    this.saveMode = !!opts.saveMode;
    this.el('loadTitle').textContent = this.saveMode ? 'Save to a slot' : 'Load game';
    const box = this.el('slotList');
    box.innerHTML = '<p class="hint">Fetching slots…</p>';
    if (!window.Backend || !Backend.isReady()) {
      box.innerHTML = '<p class="hint">Cloud saves are ' +
        (Backend && Backend.configured ? 'connecting…' : 'not configured yet.') +
        ' You can still import a save file below.</p>';
      return;
    }
    const r = await Backend.listSaves();
    if (!r.ok) { box.innerHTML = '<p class="hint">Could not reach the cloud: ' + r.error.message + '</p>'; return; }
    const bySlot = {};
    for (const row of r.data) bySlot[row.slot] = row;
    box.innerHTML = '';
    for (let slot = 1; slot <= 5; slot++) {
      const row = bySlot[slot];
      const card = document.createElement('div');
      card.className = 'scard';
      if (row) {
        const mins = Math.round((row.playtime_seconds || 0) / 60);
        const fin = row.over ? (row.over.win ? ' · 🏆 won' : ' · 💀 lost') : '';
        card.innerHTML =
          `<img class="sthumb" ${row.thumbnail ? 'src="' + row.thumbnail + '"' : ''} alt="">
           <div class="smeta"><b>${this.esc(row.name)}</b>
             <small>Day ${row.day} · ${row.landform || '?'} · ${mins}m${fin}</small></div>
           <div class="sacts"></div>`;
        const acts = card.querySelector('.sacts');
        if (this.saveMode) this.act(acts, '💾 Overwrite', () => this.saveToSlot(slot, row.name));
        else this.act(acts, '▶ Load', async () => {
          const l = await Backend.loadSlot(slot);
          if (l.ok) this.loadRow(l.data); else UI.toast(l.error.message, true);
        });
        this.act(acts, '✏️', async () => {
          const name = prompt('Rename save', row.name);
          if (name != null && name.trim()) { await Backend.renameSlot(slot, name.trim()); this.onLoad({ saveMode: this.saveMode }); }
        });
        this.act(acts, '🗑', async () => {
          if (!card.dataset.confirm) { card.dataset.confirm = '1'; acts.lastChild.textContent = '⚠ sure?'; return; }
          await Backend.deleteSlot(slot);
          if (Backend.activeSlot === slot) Backend.markActiveSlot(null);
          this.onLoad({ saveMode: this.saveMode });
        });
      } else {
        card.innerHTML = `<div class="sthumb empty">·</div>
          <div class="smeta"><b>Empty slot ${slot}</b><small>&nbsp;</small></div><div class="sacts"></div>`;
        if (this.saveMode)
          this.act(card.querySelector('.sacts'), '💾 Save here', () => this.saveToSlot(slot, null));
      }
      box.appendChild(card);
    }
  },

  act(parent, label, fn) {
    const b = document.createElement('button');
    b.className = 'abtn';
    b.textContent = label;
    b.addEventListener('click', fn);
    parent.appendChild(b);
  },

  async saveToSlot(slot, existingName) {
    const name = prompt('Name this save', existingName || Backend.activeName ||
      (window.Backend && Backend.uid ? Backend.villageName(Backend.uid) : 'My Village'));
    if (name == null) return;
    Backend.markActiveSlot(slot);
    Backend.activeName = name.trim() || 'Village';
    const r = await Backend.autosaveNow('manual');
    if (r.ok) {
      this.lastSavedDay = S.day;
      UI.toast('Saved to slot ' + slot);
      this.show(this.backTo === 'paused' ? 'paused' : 'load', { saveMode: this.saveMode });
      if (this.backTo === 'paused') this.show('paused');
    } else UI.toast('Save failed: ' + r.error.message, true);
  },

  /* ---------------- settings ---------------- */
  onSettings() {
    const cad = this.el('setCadence');
    cad.value = String(window.Backend ? Backend.autosaveDays : 2);
    const idBox = this.el('setIdentity');
    idBox.textContent = window.Backend && Backend.uid
      ? Backend.villageName(Backend.uid) : 'cloud saves not connected';
    if (window.Backend && Backend.isReady())
      Backend.getProfile().then(r => {
        if (r.ok && r.data && r.data.chief_name) this.el('chiefInput').value = r.data.chief_name;
      });
  },

  /* ---------------- pause ---------------- */
  onPaused() {
    this.backTo = 'paused';
    if (window.S) S.paused = true;
    this.el('pauseSeed').textContent =
      `${G.modeCfg().icon} ${G.modeCfg().name} · ${S.sizeKey} map · day ${S.day} · seed ${S.seed}` +
      (G.lastFrameError ? '  ·  ⚠️ recovered a glitch (details in log)' : '');
    const log = this.el('logList');
    // if the loop caught and recovered from an error, surface its first line at
    // the top of the log so it can be reported (the game kept running past it)
    const errLine = G.lastFrameError
      ? `<div style="color:#e8a04a">⚠️ ${this.esc(String(G.lastFrameError).split('\n')[0]).slice(0, 160)}</div>`
      : '';
    log.innerHTML = errLine + S.log.slice(0, 30).map(l => `<div>Day ${l.day}: ${this.esc(l.msg)}</div>`).join('');
    const q = this.el('btnQuitTitle');
    q.textContent = '🏕 Quit to title';
    q.classList.remove('danger');
  },

  quitToTitle() {
    const unsaved = window.S && S.day > this.lastSavedDay && !this._demo;
    if (unsaved && !this._confirmQuit) {
      this._confirmQuit = true;
      const q = this.el('btnQuitTitle');
      q.textContent = '⚠ Unsaved progress — tap again to quit';
      q.classList.add('danger');
      if (window.Backend) Backend.snapshotLocal(G.saveJSON());   // belt and braces
      return;
    }
    if (window.Backend && Backend.activeSlot) Backend.autosaveNow('quit');
    this._demo = false;   // force a fresh demo world
    this.show('title');
  },

  /* ---------------- endgame: the arcade tally ---------------- */
  showEnd(win, msg) {
    this.show('endgame', { win, msg });
  },
  onEndgame(opts) {
    const def = this.el('defeatScene'), vic = this.el('victoryPane'), scr = this.el('scrEndgame');
    if (!opts.win) {
      // DEFEAT — no score, no tally, no leaderboard. The clan simply fades into
      // the depths of history: a quiet grave in the dark (see js/defeatart.js).
      scr.classList.add('defeatMode');
      vic.style.display = 'none';
      def.style.display = 'block';
      this._score = null; this._submitted = false; this._leaveWarned = false;
      this.el('defeatTitle').textContent = window.Defeat ? Defeat.title() : 'YOUR CLAN IS NO MORE';
      this.el('defeatEpitaph').textContent = window.Defeat ? Defeat.epitaph() : '';
      const name = (window.Backend && Backend.uid) ? Backend.villageName(Backend.uid) : null;
      this.el('defeatDetail').textContent =
        (name ? name + ' — ' : '') + `fell on day ${S.day} · ${G.modeCfg().name} · seed ${S.seed}`;
      // restart the fade-from-black each time we land here
      def.style.animation = 'none'; void def.offsetWidth; def.style.animation = 'defeatIn 1.6s ease-out both';
      if (window.Defeat) Defeat.start();
      return;
    }
    // VICTORY — the arcade cabinet tally
    if (window.Defeat) Defeat.stop();
    scr.classList.remove('defeatMode');
    def.style.display = 'none';
    vic.style.display = 'block';
    this.el('endTitle').textContent = '🏆 Victory!';
    this.el('endTitle').style.color = 'var(--gold)';
    this.el('endMsg').textContent = (opts.msg || '') +
      ` (${G.modeCfg().name} · day ${S.day} · seed ${S.seed})`;
    // reset the stage
    this.el('scoreLines').innerHTML = '';
    this.el('scoreMult').textContent = '';
    this.el('hsBanner').style.display = 'none';
    this.el('nameRow').style.display = 'none';
    this.el('savedNote').style.display = 'none';
    this.el('savedNote').textContent = '';   // never let a prior run's note linger
    this.el('endBoard').innerHTML = '';
    this._score = Score.compute(true);
    this._submitted = false;
    this._leaveWarned = false;
    this._tally(this._score, true);
  },

  // the cabinet ritual: lines land one by one while the total ticks up
  _tally(sc, win) {
    clearInterval(this._tallyT);
    const box = this.el('scoreLines'), totalEl = this.el('scoreTotal');
    let i = 0, run = 0;
    totalEl.textContent = 'SCORE 0';
    const step = () => {
      if (this.current !== 'endgame') { clearInterval(this._tallyT); return; }
      if (i < sc.lines.length) {
        const l = sc.lines[i++];
        run += l.pts;
        box.insertAdjacentHTML('beforeend',
          `<div class="srow"><span>${l.icon} ${this.esc(l.label)}</span><span class="dots"></span><b>+${l.pts.toLocaleString()}</b></div>`);
        totalEl.textContent = 'SCORE ' + Math.round(run * sc.mult).toLocaleString();
      } else {
        clearInterval(this._tallyT);
        this.el('scoreMult').textContent =
          `${G.modeCfg().icon} ${G.modeCfg().name} difficulty × ${sc.mult}`;
        totalEl.textContent = 'SCORE ' + sc.total.toLocaleString();
        if (win) this._offerSubmit();
      }
    };
    step();
    this._tallyT = setInterval(step, 150);
  },

  /* victories go to the global board AUTOMATICALLY — no button press. The
     chief's saved arcade name posts the run the moment the tally lands. The
     name row only surfaces when there's no name on file yet (the one time a
     Save is still needed), or if the auto-post can't reach the board. */
  _offerSubmit() {
    if (!window.Backend || !Backend.isReady() || this._submitted) return;
    const inp = this.el('arcadeName');
    Backend.getProfile().then(r => {
      const saved = r.ok && r.data && r.data.arcade_name;
      if (saved) { if (!inp.value) inp.value = saved; this.submitScore(saved); }
      else this._promptName('Name your chief to put this score on the board');
    }).catch(() => this._promptName('Name your chief to put this score on the board'));
  },

  // reveal the name + Save row (prefilled name kept), with a one-line note
  _promptName(msg) {
    this.el('nameRow').style.display = 'flex';
    const btn = this.el('btnSubmitScore');
    btn.textContent = '💾 Save score'; btn.classList.remove('cant');
    if (msg) {
      const note = this.el('savedNote');
      note.textContent = msg; note.style.color = 'var(--dim)'; note.style.display = 'block';
    }
  },

  // auto === the saved name for the automatic post; a manual Save reads the box
  async submitScore(auto) {
    if (this._submitted || !this._score) return;
    const chk = Score.cleanName(auto || this.el('arcadeName').value);
    if (!chk.ok) {
      if (auto) this._promptName('Name your chief to put this score on the board');
      else UI.toast(chk.why, true);
      return;
    }
    const btn = this.el('btnSubmitScore');
    if (!auto) { btn.textContent = '…'; btn.classList.add('cant'); }
    // idempotent: never double-post the same run — reopening a finished
    // victory, or an auto-post that already landed, just shows the board
    let already = false;
    const pre = await Backend.topScores(50);
    if (pre.ok) already = pre.data.some(x =>
      x.name === chk.name && x.score === this._score.total && x.mode === S.mode);
    if (!already) {
      const sub = await Backend.submitScore(chk.name, {
        score: this._score.total, mode: S.mode, day: S.day, seed: S.seed,
      });
      if (!sub.ok) {
        if (auto) this._promptName('Couldn’t reach the board — tap Save to try again');
        else { btn.textContent = '💾 Save score'; btn.classList.remove('cant');
          UI.toast('Could not reach the board: ' + sub.error.message, true); }
        return;
      }
    }
    this._submitted = true;
    this.el('nameRow').style.display = 'none';
    const note = this.el('savedNote');
    note.style.color = '';
    note.textContent = `✓ On the board as ${chk.name.toUpperCase()} — safe to leave`;
    note.style.display = 'block';
    const top = await Backend.topScores(10);
    if (top.ok) {
      const mine = top.data.findIndex(r =>
        r.name === chk.name && r.score === this._score.total);
      // stay compact: top three, plus your row wherever it landed
      const rows = top.data.slice(0, 3);
      let meIdx = mine >= 0 && mine < 3 ? mine : -1;
      if (mine >= 3) { rows.push(top.data[mine]); meIdx = rows.length - 1; }
      this.renderBoard(rows, this.el('endBoard'), meIdx, mine >= 3 ? mine + 1 : 0);
      if (mine === 0) { this.el('hsBanner').textContent = '★ NEW HIGH SCORE ★'; this.el('hsBanner').style.display = 'block'; }
      else if (mine > 0) { this.el('hsBanner').textContent = `★ GLOBAL RANK #${mine + 1} ★`; this.el('hsBanner').style.display = 'block'; }
      UI.toast(mine >= 0 ? 'You made the board, chief!' : 'Score on the board');
    }
  },

  /* ---------------- leaderboard ---------------- */
  MODE_ICON: { calm: '🌿', moderate: '⚔️', hard: '💀' },
  renderBoard(rows, into, meIdx, lastRank) {
    if (!rows.length) { into.innerHTML = '<p class="hint">No chiefs on the board yet — be the first.</p>'; return; }
    into.innerHTML = rows.map((r, i) =>
      `<div class="ldr${i === 0 ? ' top1' : ''}${i === meIdx ? ' me' : ''}">
         <span class="rank">${i === 0 ? '👑' : '#' + (lastRank && i === rows.length - 1 ? lastRank : i + 1)}</span>
         <span class="nm">${this.esc(r.name)}</span>
         <span class="pts">${(r.score || 0).toLocaleString()}</span>
         <span class="md">${this.MODE_ICON[r.mode] || ''}</span>
       </div>`).join('');
  },
  async onLeaders() {
    const box = this.el('ldrList');
    box.innerHTML = '<p class="hint">Fetching…</p>';
    if (!window.Backend || !Backend.isReady()) {
      box.innerHTML = '<p class="hint">The board lives in the cloud — ' +
        (window.Backend && Backend.configured ? 'still connecting…' : 'cloud saves are not configured.') + '</p>';
      return;
    }
    const r = await Backend.topScores(10);
    if (!r.ok) { box.innerHTML = '<p class="hint">Could not reach the board: ' + this.esc(r.error.message) + '</p>'; return; }
    this.renderBoard(r.data, box, -1);
  },

  esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; },

  /* ---------------- wiring ---------------- */
  bind() {
    const on = (id, fn) => this.el(id).addEventListener('click', fn);
    on('btnContinue', () => this.continueGame());
    on('btnTitleNew', () => { this.backTo = 'title'; this.show('newgame'); });
    on('btnTitleLoad', () => { this.backTo = 'title'; this.show('load'); });
    on('btnTitleBoard', () => { this.backTo = 'title'; this.show('leaders'); });
    on('ldrBack', () => this.show(this.backTo === 'paused' ? 'paused' : 'title'));
    on('btnSubmitScore', () => this.submitScore());
    on('btnTitleSettings', () => { this.backTo = 'title'; this.show('settings'); });
    on('btnTitleHow', () => { this.backTo = 'title'; this.show('howto'); });
    for (const id of ['ngBack', 'loadBack', 'setBack', 'howBack'])
      on(id, () => this.show(this.backTo === 'paused' ? 'paused' : 'title'));
    // new-game option rows
    for (const [rowId, key] of [['ngMode', 'mode'], ['ngSize', 'size'], ['ngLand', 'landform']])
      this.el(rowId).querySelectorAll('.abtn').forEach(b => b.addEventListener('click', () => {
        this.newPrefs[key] = b.dataset.v;
        this.onNewgame();
      }));
    on('btnStart', () => this.startNewGame());
    // the origin draft
    on('btnDraftGo', () => this.enterGame());
    on('btnDraftHelp', () => { this.el('draftOverlay').style.display = 'flex'; });
    on('btnDraftGotIt', () => {
      this.el('draftOverlay').style.display = 'none';
      try { localStorage.setItem('neo-draft-help', '1'); } catch (e) {}
    });
    // pause
    on('btnPauseResume', () => this.enterGame());
    on('btnPauseSave', () => { this.backTo = 'paused'; this.show('load', { saveMode: true }); });
    on('btnPauseLoad', () => { this.backTo = 'paused'; this.show('load'); });
    on('btnPauseSettings', () => { this.backTo = 'paused'; this.show('settings'); });
    on('btnPauseHow', () => { this.backTo = 'paused'; this.show('howto'); });
    on('btnQuitTitle', () => this.quitToTitle());
    // endgame
    const leaveEnd = (go) => {
      if (this._score && this._score.win && !this._submitted &&
          window.Backend && Backend.isReady() && !this._leaveWarned) {
        this._leaveWarned = true;
        UI.toast('Name your chief to put this score on the board — or tap again to leave', true, 4200);
        return;
      }
      go();
    };
    on('btnEndNew', () => leaveEnd(() => { this.backTo = 'title'; this.show('newgame'); }));
    on('btnEndTitle', () => leaveEnd(() => { this._demo = false; this.show('title'); }));
    // settings
    this.el('setCadence').addEventListener('change', e => {
      Backend.autosaveDays = +e.target.value;
      try { localStorage.setItem('neo-autosave-days', e.target.value); } catch (err) {}
    });
    this.el('chiefInput').addEventListener('change', e => {
      if (window.Backend && Backend.isReady()) Backend.setChiefName(e.target.value);
    });
    on('btnExportId', async () => {
      const r = Backend.exportIdentity();
      if (!r.ok) { UI.toast(r.error.message, true); return; }
      try { await navigator.clipboard.writeText(r.data); UI.toast('Recovery token copied — keep it safe'); }
      catch (e) { prompt('Copy your recovery token:', r.data); }
    });
    on('btnImportId', async () => {
      const tok = prompt('Paste your recovery token:');
      if (!tok) return;
      const r = await Backend.importIdentity(tok.trim());
      UI.toast(r.ok ? 'Identity restored — your cloud saves are back' : r.error.message, !r.ok);
      if (r.ok) this.onSettings();
    });
    on('btnExportFile', () => {
      if (!window.S) return;
      const blob = new Blob([G.saveJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'clanfire-day' + S.day + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      UI.toast('Save file downloaded');
    });
    on('btnImportFile', () => this.el('fileLoad').click());
    this.el('fileLoad').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          G.loadJSON(rd.result);
          Backend.markActiveSlot(null);
          this.lastSavedDay = S.day;
          this.enterGame();
          UI.toast('Save file loaded');
        } catch (err) { UI.toast('Could not load save: ' + err.message, true); }
      };
      rd.readAsText(f);
      e.target.value = '';
    });
  },
};

// classic-script global: game code tests window.Screens for the demo guard
window.Screens = Screens;
