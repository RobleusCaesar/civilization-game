/* TERRAIN V4 — TEST PAGE ONLY. The V4 compositor wired into the real game, with a switch
   back to today's terrain and a frame meter for judging it on a phone. Nothing in this file
   is loaded by the live page; the live game, its saves' rules and its art are untouched.

   - A run founded or loaded (never the title's demo world) gets the V4 ground and the V4
     mountain set; the demo keeps today's painters.
   - The switch (bottom-left pill) flips V4 ⇄ Today on the spot and is remembered.
   - The meter shows real frame intervals (what you feel), not just script time, and the
     "Pan test" drives the camera across the map for 8 seconds and reports the result. */
(function () {
  if (!window.TerrainX || !window.TCCore) return;
  const TX = window.TerrainX, KEY = 'cf-terrain-v4', MKEY = 'cf-terrain-meter';
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const want = () => ls.get(KEY) !== 'off';
  let failed = '', msg = '', lastPan = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') failed = 'this browser lacks workers or OffscreenCanvas';

  // ---- the mountain set: the V4 pieces, swapped into the game's own kit ----------------------
  const KIT = window.TERRAIN_KIT || { dir: 'assets/terrain/mountain-v4/', kinds: {}, onlyOne: {} };
  let origKit = null, kitOn = false;
  function kit(on) {
    const A = window.Assets; if (!A || !A.mtnKit || !A.setMtnPiece || !Object.keys(KIT.kinds).length) return Promise.resolve();
    if (on === kitOn) return Promise.resolve();
    if (!origKit) origKit = { kit: Object.fromEntries(Object.entries(A.mtnKit).map(([k, v]) => [k, v.slice()])), rare: A.MTN_KIT_RARE, one: A.MTN_KIT_ONLY_ONE };
    kitOn = on;
    const redo = () => { R._mtnArt = null; R._mtnLayerKey = ''; R._mtnDirty = true; };
    if (!on) { for (const k of Object.keys(origKit.kit)) A.mtnKit[k] = origKit.kit[k].slice(); A.MTN_KIT_RARE = origKit.rare; A.MTN_KIT_ONLY_ONE = origKit.one; redo(); return Promise.resolve(); }
    const jobs = [];
    for (const [k, letters] of Object.entries(KIT.kinds)) {
      A.mtnKit[k] = [];
      for (const l of letters) jobs.push(new Promise(res => { const img = new Image(); img.onload = () => res(A.setMtnPiece(k, img, k + '-' + l)); img.onerror = () => res(false); img.src = KIT.dir + k + '-' + l + '.png?v=' + (KIT.v || 1); }));
    }
    A.MTN_KIT_RARE = KIT.rare || {}; A.MTN_KIT_ONLY_ONE = KIT.onlyOne || {};
    return Promise.all(jobs).then(() => { if (kitOn) redo(); });
  }

  // the gap-filler prefers a piece that fits the area to a big one trimmed to the tiles (V4 only)
  let origFill = null;
  function fill(on) {
    if (!R.mtnFillPlan) return;
    if (!origFill) origFill = R.mtnFillPlan;
    if (!on) { R.mtnFillPlan = origFill; return; }
    const src = origFill.toString().replace('- 0.8 * lie / (TL * TL) - 0.02 * (pc.w * pc.h) / (TL * TL)', '- 2.2 * lie / (TL * TL) - 0.07 * (pc.w * pc.h) / (TL * TL)');
    if (src === origFill.toString()) return;
    try { R.mtnFillPlan = (0, eval)('({' + src + '})').mtnFillPlan; } catch (e) { R.mtnFillPlan = origFill; }
  }
  // ---- the run's world: V4 for a played world, today's for the demo ---------------------------
  let inDemo = false;
  const S_ = window.Screens, ensureDemo = S_.ensureDemo;
  S_.ensureDemo = function () { inDemo = true; try { return ensureDemo.apply(this, arguments); } finally { inDemo = false; } };
  const before = () => { const on = want() && !failed && !inDemo; TX.opt = TX.opt || {}; TX.setPainters(on); return on; };
  const after = on => { if (on) { fill(true); kit(true); (anim(), TX.activate()).catch(e => fail(e)); } else { TX.deactivate(); fill(false); kit(false); } };
  for (const name of ['newGame', 'loadJSON']) {
    const orig = G[name];
    G[name] = function () { const on = before(); let r; try { r = orig.apply(this, arguments); } catch (e) { TX.setPainters(false); throw e; } try { after(on); } catch (e) { fail(e); } return r; };
  }
  function fail(e) { failed = String(e && e.message || e); try { TX.deactivate(); fill(false); kit(false); R.rebuildTerrain(); } catch (x) {} paint(); }
  // a worker that throws stands V4 down rather than leaving a hole in the ground
  const startW = TX.startWorkers;
  TX.startWorkers = function () { startW.apply(this, arguments); for (const w of this.workers) w.onerror = ev => fail('worker: ' + (ev.message || 'error')); };

  function setMode(on) {
    ls.set(KEY, on ? 'on' : 'off');
    const live = window.S && S.map && Screens.current === 'playing' && !Screens._demo;
    if (live && on && !failed) { TX.setPainters(true); R.rebuildTerrain(); fill(true); kit(true); (anim(), TX.activate()); }
    else if (live) { TX.deactivate(); fill(false); kit(false); R.rebuildTerrain(); }
    paint();
  }

  // ---- the meter: real frame intervals over the last few seconds -----------------------------
  const ft = []; let lastT = 0, meterOn = ls.get(MKEY) === 'on', panning = null, animOn = ls.get('cf-terrain-anim') !== 'off';
  const anim = () => { TX.opt = Object.assign(TX.opt || {}, { anim: animOn }); };
  function tick(t) {
    if (lastT) { ft.push([t, t - lastT]); while (ft.length && t - ft[0][0] > 4000) ft.shift(); }
    lastT = t;
    if (panning) panStep(t);
    if (meterOn && (t | 0) % 4 === 0) paintMeter();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  function summary(list) {
    const d = list.map(x => x[1]), span = list.length ? (list[list.length - 1][0] - list[0][0]) / 1000 : 0;
    return { fps: span ? +(list.length / span).toFixed(1) : 0, p50: +pct(d, 0.5).toFixed(1), p95: +pct(d, 0.95).toFixed(1), max: +Math.max(0, ...d).toFixed(1), slow: d.filter(x => x > 34).length };
  }
  function chunkMs() { const s = (TX.stats && TX.stats.ms || []).slice(-40).sort((a, b) => a - b); return s.length ? s[s.length >> 1] | 0 : 0; }

  // ---- the pan test: the camera crosses the map at a brisk swipe's pace ----------------------
  const PAN_MS = 8000;
  function panStart() {
    if (!(window.S && S.map && Screens.current === 'playing')) return note('Start or load a game first.');
    const z = R.cam.z, vw = R.viewW() / z, vh = R.viewH() / z, W = CFG.W * CFG.TILE, H = CFG.H * CFG.TILE;
    panning = { t0: 0, from: [R.cam.x, R.cam.y], x: R.cam.x, y: R.cam.y, dx: 0.9, dy: 0.55, vw, vh, W, H, frames: [], stand: 0, last: 0 };
    note('Pan test running…');
  }
  function panStep(t) {
    const p = panning; if (!p.t0) { p.t0 = t; p.last = t; return; }
    const dt = Math.min(50, t - p.last); p.last = t; p.frames.push([t, dt]);
    const sp = 1.1 * dt;                                   // world px per ms ≈ a quick finger swipe at play zoom
    p.x += p.dx * sp; p.y += p.dy * sp;
    if (p.x < 0 || p.x > p.W - p.vw) { p.dx = -p.dx; p.x = Math.max(0, Math.min(p.W - p.vw, p.x)); }
    if (p.y < 0 || p.y > p.H - p.vh) { p.dy = -p.dy; p.y = Math.max(0, Math.min(p.H - p.vh, p.y)); }
    R.cam.x = p.x; R.cam.y = p.y; if (R.clampCam) R.clampCam();
    if (TX.on && TX.ready) { const v = TX.viewChunks(0); if (v.some(([a, b]) => !TX.chunks.has(a + ',' + b))) p.stand++; }
    if (t - p.t0 > PAN_MS) {
      const r = summary(p.frames); r.standIn = p.stand; r.frames = p.frames.length; r.mode = TX.on ? (animOn ? 'V4' : 'V4, water still') : 'Today'; r.chunk = chunkMs();
      R.cam.x = p.from[0]; R.cam.y = p.from[1]; panning = null; lastPan = r;
      note(''); paint();
    }
  }

  // ---- the little panel -------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
  #tx4{position:fixed;left:calc(8px + env(safe-area-inset-left,0px));top:48%;z-index:12;font:600 12px/1.25 system-ui,-apple-system,sans-serif;color:#f3ead2;display:none}
  body.ingame #tx4{display:block}
  #tx4 .pill{background:rgba(24,18,10,.82);border:1px solid #c9a24a;border-radius:16px;padding:6px 10px;cursor:pointer;user-select:none;-webkit-user-select:none}
  #tx4 .pnl{margin-top:6px;background:rgba(20,15,9,.94);border:1px solid #c9a24a;border-radius:10px;padding:10px;width:216px;display:none}
  #tx4.open .pnl{display:block}
  #tx4 .row{display:flex;gap:6px;margin:6px 0}
  #tx4 button{flex:1;font:inherit;color:#f3ead2;background:#3a2c18;border:1px solid #7a6233;border-radius:7px;padding:7px 4px}
  #tx4 button.on{background:#c9a24a;color:#1c140a;border-color:#c9a24a}
  #tx4 .res{font:500 11px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#e8dcc0}
  #tx4m{position:fixed;left:calc(8px + env(safe-area-inset-left,0px));top:calc(var(--safe-top,0px) + 64px);z-index:12;font:600 11px/1.3 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:5px;pointer-events:none;display:none}
  body.ingame #tx4m.on{display:block}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'tx4';
  box.innerHTML = `<div class="pill"></div><div class="pnl">
    <div>Terrain</div><div class="row"><button data-m="v4">V4</button><button data-m="today">Today</button></div>
    <div class="row"><button data-a="anim">Water motion</button></div>
    <div class="row"><button data-a="meter">Frame meter</button><button data-a="pan">Pan test</button></div>
    <div class="res"></div></div>`;
  const meter = document.createElement('div'); meter.id = 'tx4m';
  const mount = () => { if (!document.body) return setTimeout(mount, 50); document.body.appendChild(box); document.body.appendChild(meter); paint(); };
  mount();
  function note(m) { msg = m; paint(); }
  function paint() {
    const on = want() && !failed;
    box.querySelector('.pill').textContent = (on ? 'Terrain V4' : 'Terrain: today') + ' ▾';
    box.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', (b.dataset.m === 'v4') === on));
    box.querySelector('[data-a="meter"]').classList.toggle('on', meterOn);
    box.querySelector('[data-a="anim"]').classList.toggle('on', animOn);
    meter.classList.toggle('on', meterOn);
    let t = msg ? msg + '\n' : '';
    if (failed) t += 'V4 is off: ' + failed + '\n';
    if (lastPan) t += `Pan test (${lastPan.mode}, 8 s)\n fps ${lastPan.fps}\n frame p50 ${lastPan.p50} ms\n frame p95 ${lastPan.p95} ms\n worst ${lastPan.max} ms\n frames >34 ms: ${lastPan.slow}/${lastPan.frames}\n stand-in frames: ${lastPan.standIn}\n chunk build ${lastPan.chunk} ms\n device ${navigator.hardwareConcurrency || '?'} cores, dpr ${devicePixelRatio}`;
    box.querySelector('.res').textContent = t;
  }
  function paintMeter() {
    const r = summary(ft);
    meter.textContent = `${TX.on ? (animOn ? 'V4' : 'V4 still') : 'Today'}  ${r.fps} fps  p50 ${r.p50}  p95 ${r.p95}  max ${r.max} ms` + (TX.on ? `  chunk ${chunkMs()} ms` : '');
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) { if (e.target.closest('.pill')) box.classList.toggle('open'); return; }
    if (b.dataset.m) setMode(b.dataset.m === 'v4');
    else if (b.dataset.a === 'anim') { animOn = !animOn; ls.set('cf-terrain-anim', animOn ? 'on' : 'off'); anim(); paint(); }
    else if (b.dataset.a === 'meter') { meterOn = !meterOn; ls.set(MKEY, meterOn ? 'on' : 'off'); paint(); }
    else if (b.dataset.a === 'pan') { box.classList.remove('open'); panStart(); }
    e.stopPropagation();
  });
  ['pointerdown', 'touchstart', 'mousedown'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation()));
  window.TerrainTest = { setMode, panStart, kit, get lastPan() { return lastPan; }, get failed() { return failed; } };
})();
