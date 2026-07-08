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
        const live = rows.find(row => !row.over);   // finished runs are greyed out
        if (live) {
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
    G.newGame(seed, p.mode, p.size);   // the rival chief is always a fresh roll
    Backend.markActiveSlot(null);          // fresh run: no cloud slot until first save
    Backend.activeName = null;
    this.lastSavedDay = 1;
    this.enterGame();
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
      `${G.modeCfg().icon} ${G.modeCfg().name} · ${S.sizeKey} map · day ${S.day} · seed ${S.seed}`;
    const log = this.el('logList');
    log.innerHTML = S.log.slice(0, 30).map(l => `<div>Day ${l.day}: ${this.esc(l.msg)}</div>`).join('');
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
    this.el('endTitle').textContent = opts.win ? '🏆 Victory!' : '💀 Defeat';
    this.el('endTitle').style.color = opts.win ? 'var(--gold)' : 'var(--danger)';
    this.el('endMsg').textContent = (opts.msg || '') +
      ` (${G.modeCfg().name} · day ${S.day} · seed ${S.seed})`;
    // reset the stage
    this.el('scoreLines').innerHTML = '';
    this.el('scoreMult').textContent = '';
    this.el('hsBanner').style.display = 'none';
    this.el('nameRow').style.display = 'none';
    this.el('savedNote').style.display = 'none';
    this.el('endBoard').innerHTML = '';
    this._score = Score.compute(opts.win);
    this._submitted = false;
    this._leaveWarned = false;
    this._tally(this._score, opts.win);
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

  // victories go to the global board — up to 7 characters, kept clean
  _offerSubmit() {
    if (!window.Backend || !Backend.isReady() || this._submitted) return;
    this.el('nameRow').style.display = 'flex';
    const inp = this.el('arcadeName');
    if (!inp.value) Backend.getProfile().then(r => {
      if (r.ok && r.data && r.data.arcade_name && !inp.value) inp.value = r.data.arcade_name;
    });
  },

  async submitScore() {
    if (this._submitted || !this._score) return;
    const chk = Score.cleanName(this.el('arcadeName').value);
    if (!chk.ok) { UI.toast(chk.why, true); return; }
    const btn = this.el('btnSubmitScore');
    btn.textContent = '…'; btn.classList.add('cant');
    const sub = await Backend.submitScore(chk.name, {
      score: this._score.total, mode: S.mode, day: S.day, seed: S.seed,
    });
    btn.textContent = '🏆 Submit'; btn.classList.remove('cant');
    if (!sub.ok) { UI.toast('Could not reach the board: ' + sub.error.message, true); return; }
    this._submitted = true;
    this.el('nameRow').style.display = 'none';
    const note = this.el('savedNote');
    note.textContent = `✓ Saved to the board as ${chk.name.toUpperCase()} — safe to leave`;
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
      UI.toast(mine >= 0 ? 'You made the board, chief!' : 'Score submitted');
    } else UI.toast('Score submitted');
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
        UI.toast('Your score is NOT on the board yet — save it first, or tap again to leave', true, 4200);
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
