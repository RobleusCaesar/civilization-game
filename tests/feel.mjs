/* FEEL CONTRACT — the small things that should simply work (build 211,
   js/feel.js; operator, 2026-11-21: "find 10 things in the game that you
   could improve, refine, modify or update that would make the game
   experience feel higher quality… small to medium in size, low risk").

   Ten pieces, each a picture or an input convenience that no rule reads:
     1  A PAUSE YOU CAN SEE: the player's own pause (⏸, or Space) dims the
        world's edges under a PAUSED plate; a pause somebody else holds wears
        none of it. A Resume from the menu keeps the zoom the player left
        (it snapped back to the default on every Resume).
     2  THE KEYBOARD: arrows/WASD glide, + and − zoom, Space pauses, Escape
        steps back (the line tool, the rally, the selection, then the menu;
        on the menu it resumes), 1–9 call a banner, H the hall, B the build
        menu, M the map — never while a field has the focus, a modifier is
        held, or a modal or a card has the screen.
     3  THE MINIMAP DRAGS, and its view frame follows the camera every frame.
     4  AN ALARM SHOWS WHERE: "under attack!" pings the map (the map button
        glows when it is folded) and its toast carries a way there.
     5  A CURSOR THAT SAYS WHAT A CLICK WILL DO (mouse only), fog-honest.
     6  HOVER TO READ (mouse only): the stock left in a tile, a unit's or a
        building's health and crew — never in the fog, never stale.
     7  THE BUILD CARDS EXPLAIN THEMSELVES, and the five station/house
        descriptions say where they really stand (worked ground).
     8  THE BAR POINTS AT WHAT IS MISSING: a refusal for goods flashes the
        chips of the goods short and says how much; a full town, the people.
     9  A VILLAGER HAS A NAME (Units.personName): stable through a save, the
        player's own villagers only; her panel says it.
    10  A BOAT LEAVES A WAKE (R.drawWakes): only while it moves, only on
        water the player sees, never in a save, a still frame is still.

   Run this after touching js/feel.js, R.drawWakes / drawMiniView / miniCam, the
   btnPause handler, Screens.enterGame's zoom line, Units.personName,
   Bld.canTrain / canUpgrade's refusals, or a refusal toast in ui.js.

     node tests/feel.mjs      # exits non-zero on any regression          */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 0. the source ---- */
{
  const feel = readFileSync(join(root, 'js/feel.js'), 'utf8');
  const code = feel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ck('theFileDrawsNoRng', !/Math\.random|G\.rand|\.rand\(/.test(code), 'js/feel.js asks no dice');
  ck('andWritesNothingIntoAWorld', !/\bS\.(?!paused\b|res\b|armies\b|units\b|buildings\b|map\b|over\b|seed\b)[a-zA-Z_]+\s*=(?!=)/.test(code),
    'only S.paused is ever written (the player\'s own pause)');
  const bad = [];
  for (const f of readdirSync(join(root, 'js'))) {
    if (!f.endsWith('.js') || f === 'feel.js') continue;
    readFileSync(join(root, 'js', f), 'utf8').split('\n').forEach((l, i) => {
      if (/\bFeel\.\w/.test(l) && !/typeof Feel/.test(l) && !/^\s*(\/\/|\*)/.test(l)) bad.push(f + ':' + (i + 1));
    });
  }
  ck('everyHookAsksForFeelFirst', bad.length === 0, bad.length ? bad.slice(0, 4).join(', ') : 'every call guarded on `typeof Feel`');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const v = s => (new RegExp('src="js/' + s + '\\?v=(\\d+)"').exec(html) || [])[1];
  ck('itLoadsAfterTheUiAtTheSharedVersion', !!v('feel.js') && v('feel.js') === v('ui.js') &&
    html.indexOf('js/feel.js') > html.indexOf('js/ui.js'), 'feel.js ?v=' + v('feel.js') + ', ui.js ?v=' + v('ui.js'));
  const ui = readFileSync(join(root, 'js/ui.js'), 'utf8');
  ck('aPartyIsCountedInItsOwnPlural', /Selected \$\{ids\.length\} \$\{this\.plural\(label, ids\.length\)\} nearby/.test(ui),
    'the double tap says "3 axemen", never "3 axemans"');
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { try { localStorage.setItem('neo-cards-intro', '1'); localStorage.setItem('neo-victory-seen', '1'); localStorage.setItem('neo-music', '0'); localStorage.setItem('neo-sfx', '0'); } catch (e) {} });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.waitForFunction(() => typeof Feel !== 'undefined' && Feel._inited, null, { timeout: 30000 });
const ev = (f, a) => p.evaluate(f, a);
const play = (seed) => ev((seed) => {
  G.newGame(seed, 'calm', 'medium'); Screens._demo = false; Screens.show('playing');
  G.freeVis = true; G.updateVisibility();
  S.paused = false; Feel.playerPaused(false);
  if (UI.deselect) UI.deselect();
  return true;
}, seed);
// a tile's middle on screen, after centring the view on it
const onScreen = (tx, ty) => ev(([tx, ty]) => {
  R.centerOn(tx + 0.5, ty + 0.5);
  const TL = CFG.TILE, z = R.cam.z;
  return { x: (tx * TL + TL / 2 - R.cam.x) * z, y: (ty * TL + TL / 2 - R.cam.y) * z };
}, [tx, ty]);
const rest = async (pt) => { await p.mouse.move(pt.x + 4, pt.y + 3); await p.waitForTimeout(60); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(80); };

await play('feel-1');

/* ---- 1. the pause you can see ---- */
{
  await p.mouse.move(5, 400);
  await p.keyboard.press('Space');
  await p.waitForTimeout(120);
  const a = await ev(() => { const v = document.getElementById('pauseVeil');
    return { paused: S.paused, on: v.classList.contains('on'), disp: getComputedStyle(v).display, btn: document.getElementById('btnPause').textContent,
      words: v.textContent }; });
  ck('spacePausesUnderAPlate', a.paused && a.on && a.disp === 'flex' && a.btn === '▶' && /paused/i.test(a.words),
    JSON.stringify(a));
  await p.keyboard.press('Space');
  await p.waitForTimeout(80);
  const b2 = await ev(() => ({ paused: S.paused, on: document.getElementById('pauseVeil').classList.contains('on'), btn: document.getElementById('btnPause').textContent }));
  ck('andSpaceResumes', !b2.paused && !b2.on && b2.btn === '⏸', JSON.stringify(b2));
  // the ⏸ button is the same pause
  await p.click('#btnPause'); await p.waitForTimeout(80);
  const c = await ev(() => ({ paused: S.paused, on: document.getElementById('pauseVeil').classList.contains('on') }));
  await p.click('#btnPause'); await p.waitForTimeout(80);
  const c2 = await ev(() => ({ paused: S.paused, on: document.getElementById('pauseVeil').classList.contains('on') }));
  ck('theButtonWearsTheSameVeil', c.paused && c.on && !c2.paused && !c2.on, JSON.stringify([c, c2]));
  // a pause somebody else holds (a card in the air, the Wonder's frame) wears none of it
  const d = await ev(async () => { S.paused = true; await new Promise(r => setTimeout(r, 120));
    const on = document.getElementById('pauseVeil').classList.contains('on'); S.paused = false; return on; });
  ck('aHeldPauseWearsNoVeil', d === false, 'S.paused set by the game, not the player');
  // a new world forgets a veil
  await ev(() => Feel.setPause(true));
  await play('feel-1b');
  const e = await ev(() => document.getElementById('pauseVeil').classList.contains('on'));
  ck('andANewWorldForgetsIt', e === false);
}

/* ---- 2. the keyboard ---- */
{
  await play('feel-2');
  const c0 = await ev(() => { R.cam.z = 1.25; R.centerOn(CFG.W / 2, CFG.H / 2); return { x: R.cam.x, y: R.cam.y, z: R.cam.z }; });
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(420); await p.keyboard.up('ArrowRight');
  await p.keyboard.down('KeyW'); await p.waitForTimeout(420); await p.keyboard.up('KeyW');
  const c1 = await ev(() => ({ x: R.cam.x, y: R.cam.y, z: R.cam.z }));
  ck('arrowsAndWasdGlideTheView', c1.x - c0.x > 40 && c0.y - c1.y > 40, `dx ${Math.round(c1.x - c0.x)}, dy ${Math.round(c1.y - c0.y)} world px`);
  await p.keyboard.press('Equal'); await p.waitForTimeout(60);
  const z1 = await ev(() => R.cam.z);
  await p.keyboard.press('Minus'); await p.waitForTimeout(60);
  const z2 = await ev(() => R.cam.z);
  ck('plusAndMinusZoom', Math.abs(z1 / c1.z - 1.2) < 0.01 && Math.abs(z2 - c1.z) < 0.01, `${c1.z} → ${z1.toFixed(3)} → ${z2.toFixed(3)}`);
  // not in a field, not with a modifier
  const f0 = await ev(() => { const i = document.createElement('input'); i.id = '__feelIn'; i.style.cssText = 'position:fixed;left:400px;top:300px;z-index:99'; document.body.appendChild(i); i.focus(); return { x: R.cam.x, paused: S.paused }; });
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('Space'); await p.keyboard.press('KeyH');
  await p.waitForTimeout(100);
  const f1 = await ev(() => { const i = document.getElementById('__feelIn'); const typed = i.value; i.remove(); return { x: R.cam.x, paused: S.paused, sel: !!UI.sel, typed }; });
  ck('aFieldKeepsItsKeys', f1.x === f0.x && f1.paused === f0.paused && !f1.sel && f1.typed === ' h', JSON.stringify(f1));
  const m0 = await ev(() => ({ z: R.cam.z, x: R.cam.x }));
  await p.keyboard.press('Control+Equal'); await p.keyboard.down('Control'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Control');
  await p.waitForTimeout(100);
  const m1 = await ev(() => ({ z: R.cam.z, x: R.cam.x }));
  ck('andAModifierIsTheBrowsers', m1.z === m0.z && m1.x === m0.x, JSON.stringify([m0, m1]));
  // a modal on the screen keeps every key
  const mo = await ev(async () => { const was = Screens.modalUp; Screens.modalUp = () => true; const x0 = R.cam.x;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
    Screens.modalUp = was; return { moved: R.cam.x !== x0, paused: S.paused }; });
  ck('aModalKeepsEveryKey', !mo.moved && !mo.paused, JSON.stringify(mo));
  // H: home to the hall, and the hall in hand
  await ev(() => { R.centerOn(2, 2); });
  await p.keyboard.press('KeyH');
  await p.waitForTimeout(800);
  const h = await ev(() => { const tc = Bld.tcOf('P'); const x = R.cam.x, y = R.cam.y; R.centerOn(Bld.cx(tc), Bld.cy(tc));
    const want = { x: R.cam.x, y: R.cam.y }; R.cam.x = x; R.cam.y = y;
    return { sel: UI.sel && UI.sel.type === 'bld' && UI.sel.id === tc.id, off: Math.hypot(x - want.x, y - want.y) }; });
  ck('hBringsTheViewHomeToTheHall', h.sel && h.off < 2, `the hall in hand ${h.sel}, ${h.off.toFixed(1)} px off its (clamped) centre`);
  // Escape: the selection, then the menu; on the menu, Resume — with the zoom
  // kept (the world entered through the real door first, as every game is)
  await ev(() => Screens.enterGame());
  await p.waitForFunction(() => Screens.current === 'playing' && !Screens._entering, null, { timeout: 60000 });
  await ev(() => { const tc = Bld.tcOf('P'); UI.select('bld', tc.id); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(80);
  const e1 = await ev(() => !!UI.sel);
  await ev(() => { R.cam.z = 2.05; R.clampCam(); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const e2 = await ev(() => Screens.current);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 20000 });
  await p.waitForTimeout(150);
  const e3 = await ev(() => ({ z: R.cam.z, paused: S.paused }));
  ck('escapeStepsBackOneThingAtATime', !e1 && e2 === 'paused', `selection kept ${e1}, then ${e2}`);
  ck('aResumeKeepsTheViewThePlayerLeft', Math.abs(e3.z - 2.05) < 1e-6 && !e3.paused, `zoom ${e3.z} after the menu (it snapped to the default)`);
  // …but a world opened afresh opens at its own zoom
  await play('feel-2b');
  await ev(() => { R.cam.z = 2.05; Screens._opened = null; Screens.enterGame(); });
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 20000 });
  const z3 = await ev(() => ({ z: R.cam.z, d: R.defaultZoom() }));
  ck('andAFreshWorldStillOpensAtItsOwn', Math.abs(z3.z - z3.d) < 1e-6, JSON.stringify(z3));
  // 1–9 call a banner; B the build menu; M the map
  const ar = await ev(() => { const s = S.units.filter(u => u.owner === 'P').slice(0, 2); S.armies = { 1: s.map(u => u.id) }; UI.deselect(); return s.length; });
  await p.keyboard.press('Digit1'); await p.waitForTimeout(80);
  const a1 = await ev(() => UI.sel && (UI.sel.type === 'group' ? UI.sel.ids.length : UI.sel.type === 'unit' ? 1 : 0));
  ck('aDigitCallsItsBanner', a1 === ar, `${a1} of ${ar} taken in hand by "1"`);
  await ev(() => { UI.deselect(); UI.setMenuCollapsed(false); UI.setMiniCollapsed(false); });
  await p.keyboard.press('KeyB'); await p.waitForTimeout(60);
  const bm = await ev(() => UI.menuCollapsed);
  await p.keyboard.press('KeyB'); await p.waitForTimeout(60);
  const bm2 = await ev(() => UI.menuCollapsed);
  await p.keyboard.press('KeyM'); await p.waitForTimeout(60);
  const mm = await ev(() => UI.miniCollapsed);
  await p.keyboard.press('KeyM'); await p.waitForTimeout(60);
  const mm2 = await ev(() => UI.miniCollapsed);
  ck('bFoldsTheMenuAndMTheMap', bm === true && bm2 === false && mm === true && mm2 === false, JSON.stringify([bm, bm2, mm, mm2]));
  const t = await ev(() => ({ pause: document.getElementById('btnPause').title, menu: document.getElementById('btnMenu').title, map: document.getElementById('mapBtn').title }));
  ck('theButtonsSayTheirKeys', /Space/.test(t.pause) && /Esc/.test(t.menu) && /\(M\)/.test(t.map), JSON.stringify(t));
}

/* ---- 3. the minimap drags, and its frame follows the camera ---- */
{
  await play('feel-3');
  const m = await ev(() => { UI.setMiniCollapsed(false); const r = document.getElementById('mini').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(m.x + m.w * 0.3, m.y + m.h * 0.3);
  await p.mouse.down();
  await p.mouse.move(m.x + m.w * 0.5, m.y + m.h * 0.45, { steps: 5 });
  const mid = await ev(() => ({ x: (R.cam.x + R.viewW() / R.cam.z / 2) / CFG.TILE, y: (R.cam.y + R.viewH() / R.cam.z / 2) / CFG.TILE }));
  await p.mouse.move(m.x + m.w * 0.6, m.y + m.h * 0.55, { steps: 5 });
  await p.mouse.up();
  const end = await ev(() => { const x = R.cam.x, y = R.cam.y; R.centerOn(0.6 * CFG.W, 0.55 * CFG.H); const w = { x: R.cam.x, y: R.cam.y }; R.cam.x = x; R.cam.y = y; return Math.hypot(x - w.x, y - w.y); });
  ck('aPressThatSlidesSweepsTheView', Math.abs(mid.x - 0.5 * 65) < 40 && end < 30, `mid-drag at ${mid.x.toFixed(1)},${mid.y.toFixed(1)}; ${end.toFixed(1)} px from the release point`);
  // the frame is laid where the camera is NOW, between the map's own repaints,
  // on its own layer over the map (R.miniCam): the map itself is never copied
  const f = await ev(() => {
    R.centerOn(CFG.W * 0.3, CFG.H * 0.3);
    R.drawMini();
    const old = R._miniCamRect();
    const W = R.mg.canvas.width, H = R.mg.canvas.height;
    const map0 = R.mg.getImageData(0, 0, W, H).data;
    R.centerOn(CFG.W * 0.62, CFG.H * 0.6);
    const now = R._miniCamRect();
    R.drawMiniView();
    const map1 = R.mg.getImageData(0, 0, W, H).data;
    let mapMoved = 0; for (let i = 0; i < map0.length; i++) if (map0[i] !== map1[i]) mapMoved++;
    const L = R.miniCam, lc = L && L.getContext('2d');
    const a = lc ? lc.getImageData(0, 0, L.width, L.height).data : [];
    const onRect = (r, x, y) => { const inX = x >= r[0] - 1.5 && x <= r[0] + r[2] + 1.5, inY = y >= r[1] - 1.5 && y <= r[1] + r[3] + 1.5;
      return (inX && (Math.abs(y - r[1]) <= 1.5 || Math.abs(y - r[1] - r[3]) <= 1.5)) || (inY && (Math.abs(x - r[0]) <= 1.5 || Math.abs(x - r[0] - r[2]) <= 1.5)); };
    let lit = 0, onNew = 0, onOldOnly = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!a[i + 3]) continue;
      lit++; if (onRect(now, x + 0.5, y + 0.5)) onNew++; else if (onRect(old, x + 0.5, y + 0.5)) onOldOnly++;
    }
    // the layer lies exactly on the map, at its pixels, and never takes a tap
    const mr = R.mini.getBoundingClientRect(), lr = L ? L.getBoundingClientRect() : null;
    const aligned = !!lr && ['left', 'top', 'width', 'height'].every(k => Math.abs(mr[k] - lr[k]) < 0.5);
    const noTap = !!L && getComputedStyle(L).pointerEvents === 'none';
    const sameSize = !!L && L.width === W && L.height === H;
    /* …and the map is never copied or read back to lay it: a copy made the
       canvas rasterise its fills on the spot, a millisecond on every repaint
       (tests/land.mjs theWorldPassFrameStaysCheap read 2.2-2.8ms against 1.2) */
    const srcMini = String(R.drawMini), srcView = String(R.drawMiniView);
    const noCopy = !/drawImage|getImageData|createElement/.test(srcMini) && !/drawImage|getImageData|createElement/.test(srcView);
    return { lit, onNew, onOldOnly, moved: Math.hypot(now[0] - old[0], now[1] - old[1]), mapMoved, aligned, noTap, sameSize, noCopy };
  });
  ck('theFrameFollowsTheCamera', f.moved > 4 && f.lit > 20 && f.onNew === f.lit && f.onOldOnly === 0,
    `${f.lit} frame pixels, ${f.onNew} on the camera's rect now, ${f.onOldOnly} left where it was`);
  ck('onItsOwnLayerTheMapIsNeverCopied', f.mapMoved === 0 && f.aligned && f.noTap && f.sameSize && f.noCopy,
    JSON.stringify({ mapMoved: f.mapMoved, aligned: f.aligned, noTap: f.noTap, sameSize: f.sameSize, noCopy: f.noCopy }));
}

/* ---- 4. an alarm shows where ---- */
{
  await play('feel-4');
  const a = await ev(() => {
    UI.setMiniCollapsed(false);
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {};
    const tc = Bld.tcOf('P');
    R.centerOn(CFG.W / 2, CFG.H / 2);
    Combat._alarmAt = null;
    Combat.hitBuilding(tc, 1, null, 'R');
    const t = [...document.querySelectorAll('#toasts .toast')].find(n => /under attack/.test(n.textContent));
    return { toast: !!t, go: !!(t && t.querySelector('.tgo')), pings: document.querySelectorAll('#miniWrap .mping').length };
  });
  ck('anAlarmPingsTheMap', a.pings === 1, a.pings + ' ping(s)');
  ck('andItsToastCarriesAWayThere', a.toast && a.go, JSON.stringify(a));
  const go = await ev(() => { const g = document.querySelector('#toasts .toast .tgo'); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(go.x, go.y);
  await p.waitForTimeout(800);
  const g2 = await ev(() => { const tc = Bld.tcOf('P'); const x = R.cam.x, y = R.cam.y; R.centerOn(Bld.cx(tc), Bld.cy(tc)); const w = { x: R.cam.x, y: R.cam.y }; R.cam.x = x; R.cam.y = y; return Math.hypot(x - w.x, y - w.y); });
  ck('whichGlidesTheViewThere', g2 < 2, `${g2.toFixed(1)} px from the hall's (clamped) centre`);
  const b2 = await ev(() => { UI.setMiniCollapsed(true); Combat._alarmAt = null; Combat.hitBuilding(Bld.tcOf('P'), 1, null, 'R'); return document.getElementById('mapBtn').classList.contains('alarm'); });
  ck('aFoldedMapGlowsItsButton', b2 === true);
  const own = await ev(() => { UI.setMiniCollapsed(false); document.querySelectorAll('#miniWrap .mping').forEach(n => n.remove()); Combat._alarmAt = null; Combat.hitBuilding(Bld.tcOf('P'), 1, null, 'P'); return document.querySelectorAll('#miniWrap .mping').length; });
  ck('andTheirOwnBlowRaisesNone', own === 0, own + ' ping(s) for the player\'s own blow');
}

/* ---- 5. the cursor and 6. the hover read ---- */
{
  await play('feel-5');
  const t = await ev(() => {
    const tc = Bld.tcOf('P');
    let best = null, bd = 1e9;
    for (let y = 2; y < CFG.H - 2; y++) for (let x = 2; x < CFG.W - 2; x++) {
      const i = MapGen.idx(x, y);
      if (S.map.terrain[i] === T.FOREST && S.map.resAmount[i] > 0 && !Bld.at(x, y)) { const d = Math.hypot(x - Bld.cx(tc), y - Bld.cy(tc)); if (d < bd) { bd = d; best = { x, y, amt: Math.floor(S.map.resAmount[i]) }; } }
    }
    let grass = null;
    for (let y = 3; y < CFG.H - 3 && !grass; y++) for (let x = 3; x < CFG.W - 3 && !grass; x++) {
      let ok = true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (S.map.terrain[MapGen.idx(x + dx, y + dy)] !== T.GRASS || Bld.at(x + dx, y + dy)) ok = false;
      if (ok && !S.units.some(u => Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 2.5)) grass = { x, y };
    }
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    UI.select('unit', v.id);
    return { forest: best, grass, vid: v.id };
  });
  let pt = await onScreen(t.forest.x, t.forest.y);
  await rest(pt);
  const c1 = await ev(() => ({ k: Feel._cursor, css: R.cv.style.cursor }));
  ck('aVillagerOverWoodsGetsTheAxe', c1.k === 'wood' && /url\(/.test(c1.css), `"${c1.k}" — ${c1.css.slice(0, 30)}`);
  await p.waitForTimeout(650);
  const tip = await ev(() => ({ kind: Feel._tipKind, text: document.getElementById('feelTip').textContent, on: document.getElementById('feelTip').classList.contains('on') }));
  ck('aRestingMouseReadsTheStockLeft', tip.on && tip.kind === 'map' && tip.text.includes(t.forest.amt + ' wood left'), `"${tip.text}" (the tile holds ${t.forest.amt})`);
  const mv = await ev(() => { const x0 = R.cam.x, y0 = R.cam.y;
    for (const [dx, dy] of [[64, 0], [-64, 0], [0, 64], [0, -64]]) { R.cam.x = x0 + dx; R.cam.y = y0 + dy; R.clampCam(); if (Math.hypot(R.cam.x - x0, R.cam.y - y0) > 8) break; }
    return Math.round(Math.hypot(R.cam.x - x0, R.cam.y - y0)); });
  await p.waitForTimeout(80);
  const gone = await ev(() => Feel._tipKind);
  ck('andTheReadingGoesWhenTheGroundMoves', mv > 8 && gone === '', `"${gone}" after the camera moved ${mv} px under a still mouse`);
  // nothing in hand over open grass: the plain arrow
  await ev(() => UI.deselect());
  pt = await onScreen(t.grass.x, t.grass.y);
  await rest(pt);
  const c2 = await ev(() => ({ k: Feel._cursor, css: R.cv.style.cursor }));
  ck('nothingInHandIsThePlainArrow', c2.k === '' && c2.css === '', JSON.stringify(c2));
  // a soldier in hand over a wolf in sight: the sword; the same wolf in the fog: nothing
  const w = await ev((g) => {
    const s = Units.spawn('defender', 'P', g.x - 1.5, g.y + 0.5);
    const wolf = Units.spawn('wolf', 'W', g.x + 0.5, g.y + 0.5); wolf.aggro = 0; wolf.path = null;
    window.__wolf = wolf.id; UI.select('unit', s.id); return true;
  }, t.grass);
  pt = await ev(() => { const u = Units.get(window.__wolf); R.centerOn(u.x, u.y); const TL = CFG.TILE, z = R.cam.z; return { x: (u.x * TL - R.cam.x) * z, y: (u.y * TL - CFG.SPRITE_LIFT - R.cam.y) * z }; });
  await rest(pt);
  const c3 = await ev(() => Feel._cursor);
  const c4 = await ev(async () => { G.freeVis = false; const was = G.visibleAt; G.visibleAt = () => false; Feel._curT = 0; Feel._curDirty = true;
    await new Promise(r => setTimeout(r, 120)); const k = Feel._cursor; G.visibleAt = was; G.freeVis = true; return k; });
  ck('aFoeInSightIsTheSword', c3 === 'attack', `"${c3}"`);
  ck('andAFoeInTheFogIsNothing', c4 !== 'attack', `"${c4}" with the wolf unseen`);
  // the hover never reads a tile in the fog's memory as live
  const fog = await ev((f) => { const was = G.visibleAt; G.visibleAt = () => false; const tx = f.x, ty = f.y;
    R.centerOn(tx + 0.5, ty + 0.5); const TL = CFG.TILE, z = R.cam.z;
    const i = Feel.infoAt((tx * TL + TL / 2 - R.cam.x) * z, (ty * TL + TL / 2 - R.cam.y) * z); G.visibleAt = was; return i; }, t.forest);
  ck('theFogHidesTheStock', !!fog && !/\d+ wood/.test(fog.sub || '') && /last seen/i.test(fog.sub || ''), JSON.stringify(fog));
  const unex = await ev((f) => { const i = MapGen.idx(f.x, f.y); const was = S.map.explored[i]; S.map.explored[i] = 0;
    R.centerOn(f.x + 0.5, f.y + 0.5); const TL = CFG.TILE, z = R.cam.z;
    const r = Feel.infoAt((f.x * TL + TL / 2 - R.cam.x) * z, (f.y * TL + TL / 2 - R.cam.y) * z); S.map.explored[i] = was; return r; }, t.forest);
  ck('andTheBlackSaysNothing', unex === null, JSON.stringify(unex));
  // a touch never wears a cursor or a reading
  const touch = await ev(() => { Feel.setCursor(''); Feel.hideTip(); const e = new PointerEvent('pointermove', { pointerType: 'touch', clientX: 400, clientY: 400, bubbles: true });
    R.cv.dispatchEvent(e); return { cur: Feel._cursor, over: Feel._over }; });
  ck('aTouchWearsNone', touch.cur === '', JSON.stringify(touch));
}

/* ---- 7. the build cards explain themselves ---- */
{
  await play('feel-7');
  await ev(() => { UI.deselect(); UI.setMenuCollapsed(false); });
  await p.waitForTimeout(150);
  const tipOf = async (key) => {
    const r = await ev((key) => { const b = document.querySelector(`#buildmenu .bbtn[data-key="${key}"]`); if (!b) return null; b.scrollIntoView({ inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, key);
    if (!r) return null;
    await p.mouse.move(r.x, r.y - 30); await p.mouse.move(r.x, r.y); await p.waitForTimeout(120);
    return ev(() => ({ kind: Feel._tipKind, text: document.getElementById('feelTip').textContent }));
  };
  const farm = await tipOf('farm');
  ck('aCardSaysWhatItDoes', farm && farm.kind === 'card' && farm.text.includes(await ev(() => CFG.BUILDINGS.farm.desc)), farm && farm.text);
  const st = await tipOf('stable');
  ck('andWhatItWaitsOn', st && /Needs Town Center Lv 2/.test(st.text), st && st.text);
  const d = await ev(() => ['farm', 'lodge', 'lumber', 'quarry', 'house'].map(k => [k, CFG.BUILDINGS[k].desc]));
  const where = { farm: /picked bare/, lodge: /animal fell/, lumber: /stumps|felled/, quarry: /rock was broken|broken open/, house: /homestead/ };
  ck('theStationsSayWhereTheyReallyStand', d.every(([k, s]) => where[k].test(s) && !/Build near/i.test(s)), d.map(([k, s]) => k + ': ' + s).join(' | '));
}

/* ---- 8. the bar points at what is missing ---- */
{
  await play('feel-8');
  const a = await ev(async () => {
    UI.deselect(); document.querySelectorAll('#topbar .res.short').forEach(n => n.classList.remove('short'));
    const tc = Bld.tcOf('P'); S.res.food = 0; S.res.wood = 999;
    UI.select('bld', tc.id); UI.renderPanel();
    document.querySelector('#panel [data-act="train"]').click();
    const t = [...document.querySelectorAll('#toasts .toast')].map(n => n.textContent).pop() || '';
    return { food: document.querySelector('#topbar [data-chip="food"]').classList.contains('short'),
      wood: document.querySelector('#topbar [data-chip="wood"]').classList.contains('short'), t };
  });
  ck('aRefusedTrainingFlashesTheShortGood', a.food && !a.wood, JSON.stringify(a));
  ck('andSaysHowMuchItNeeds', /still needs \d+ food/.test(a.t), `"${a.t}"`);
  const b2 = await ev(async () => {
    document.querySelectorAll('#topbar .res.short').forEach(n => n.classList.remove('short'));
    S.res.food = 5000; S.res.wood = 5000; S.res.gold = 5000; S.res.stone = 5000;
    const tc = Bld.tcOf('P');
    while (Units.popUsed('P') < Bld.popCap('P')) Units.spawn('villager', 'P', Bld.cx(tc), Bld.cy(tc) + 2);
    UI.select('bld', tc.id); UI.renderPanel();
    document.querySelector('#panel [data-act="train"]').click();
    const t = [...document.querySelectorAll('#toasts .toast')].map(n => n.textContent).pop() || '';
    return { pop: document.querySelector('#topbar [data-chip="pop"]').classList.contains('short'), t };
  });
  ck('aFullTownFlashesThePeople', b2.pop && /Population cap/.test(b2.t), JSON.stringify(b2));
  const c = await ev(() => { const tc = Bld.tcOf('P'); S.res.wood = 0; const ct = Bld.canTrain(tc, 'villager'); const cu = Bld.canUpgrade(Object.assign({}, tc));
    return { pop: ct.code, short: !!ct.short || ct.code === 'pop' }; });
  ck('theRefusalCarriesItsReasonAsData', c.pop === 'pop', JSON.stringify(c));
}

/* ---- 9. a villager has a name ---- */
{
  await play('feel-9');
  const n = await ev(() => {
    const vs = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    const names = vs.map(u => [u.id, Units.personName(u), u.female]);
    const again = vs.map(u => Units.personName(u));
    const ok = names.every(([, nm, f]) => !!nm && CFG.NAMES[f ? 'f' : 'm'].includes(nm));
    const riv = S.units.find(u => u.owner === 'A' && Units.isVillager(u));
    const sol = Units.spawn('defender', 'P', vs[0].x, vs[0].y);
    const json = G.saveJSON();
    G.loadJSON(json);
    const after = names.map(([id]) => Units.personName(Units.get(id)));
    const v = Units.get(names[0][0]);
    UI.select('unit', v.id); UI.renderPanel();
    const t = document.querySelector('#panel .ptitle');
    return { names: names.map(x => x[1]), same: again.every((x, i) => x === names[i][1]), ok, rival: riv ? Units.personName(riv) : 'none',
      soldier: Units.personName(sol), kept: after.every((x, i) => x === names[i][1]), title: t && t.innerHTML, saved: /personName|"name":/.test(json) };
  });
  ck('aVillagerHasANameFromHerList', n.ok && n.same, n.names.join(', '));
  ck('theSameNameThroughASave', n.kept && !n.saved, 'nothing is stored: the name is the seed and the id');
  ck('onlyThePlayersOwnVillagers', (n.rival === null || n.rival === 'none') && n.soldier === null, JSON.stringify({ rival: n.rival, soldier: n.soldier }));
  ck('herPanelSaysIt', !!n.title && n.title.startsWith(n.names[0] + ' <span class="pkind">'), n.title);
}

/* ---- 10. a boat leaves a wake ---- */
{
  await play('feel-10');
  const w = await ev(() => {
    let best = null;
    for (let y = 4; y < CFG.H - 4 && !best; y++) for (let x = 5; x < CFG.W - 5 && !best; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) if (S.map.terrain[MapGen.idx(x + dx, y + dy)] !== T.WATER) ok = false;
      if (ok) best = { x, y };
    }
    // no open water on this world: lay a pond of tile data (the wake reads the tiles alone)
    if (!best) { best = { x: Math.floor(CFG.W / 2), y: Math.floor(CFG.H / 2) };
      for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) S.map.terrain[MapGen.idx(best.x + dx, best.y + dy)] = T.WATER; }
    const u = Units.spawn('fishboat', 'P', best.x - 3 + 0.5, best.y + 0.5);
    const still = Units.spawn('fishboat', 'P', best.x + 0.5, best.y - 1.5);
    R.centerOn(best.x, best.y);
    for (let i = 0; i < 50; i++) { u.x = best.x - 3 + 0.5 + i * 0.05; u.path = null; still.path = null; R.draw(1 / 60); }
    const tr = R._wakes && R._wakes.get(u.id), ts = R._wakes && R._wakes.get(still.id);
    // a frozen frame is a still frame: two draws at dt 0 move no wake
    const k0 = JSON.stringify(tr && tr.pts); R.draw(0); R.draw(0); const k1 = JSON.stringify(R._wakes.get(u.id).pts);
    // only over water the player sees: count the strokes the wake pass lays
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d');
    let n = 0; const s0 = g.stroke.bind(g); g.stroke = (...a) => { n++; return s0(...a); };
    R.drawWakes(g, 0); const seen = n;
    const was = G.visibleAt; G.visibleAt = () => false; n = 0; R.drawWakes(g, 0); const fog = n; G.visibleAt = was;
    return { pts: tr ? tr.pts.length : 0, still: ts ? ts.pts.length : 0, frozen: k0 === k1, seen, fog, saved: /_wakes|"pts":/.test(G.saveJSON()) };
  });
  if (w.none) ck('aBoatUnderWayLeavesAWake', false, 'no open water on the test world');
  else {
    ck('aBoatUnderWayLeavesAWake', w.pts >= 8 && w.seen > 0, `${w.pts} points, ${w.seen} strokes`);
    ck('aBoatAtAnchorLaysNone', w.still <= 1, w.still + ' point(s) for a still hull');
    ck('aWakeIsNeverDrawnInTheFog', w.fog === 0, w.fog + ' strokes with the water unseen');
    ck('aFrozenFrameMovesNoWake', w.frozen);
    ck('andNoWakeRidesASave', !w.saved);
  }
  const nw = await ev(() => { G.newGame('feel-10b', 'calm', 'medium'); return R._wakes == null || R._wakes.size === 0; });
  ck('aNewWorldForgetsEveryWake', nw);
}

ck('noPageErrors', errs.length === 0, errs.slice(0, 3).join(' | '));
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log(`${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log('ALL FEEL CHECKS PASS');
