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

   …and build 212's ten (operator: "10 more refinements… small refinements
   and tweaks that make the game feel high quality, intentional and
   thoughtful"):
    11  EVERY ORDER SHOWS WHERE IT LANDS: a walk two gold rings closing on a
        pin, a hand sent to work a ring round the work, an attack a rust
        ring round its mark — gone after its beat, a still frame still, never
        round a foe in the fog.
    12  A WORK'S HANDS, AND A HAND'S WORK: a station in hand rings its
        workers, a worker in hand rings the station (quiet rings).
    13  THE BAR SHOWS THE BITE: a blow leaves a pale chunk where the health
        was, held a beat and drained; a bar with no one behind it is the old
        bar, byte for byte.
    14  THE RALLY FLAG FLIES, and nothing of it lies in the black.
    15  GOLD SEAMS GLINT — only seams in sight, never under a mine.
    16  FIREFLIES on a deep night at the woods' edge — never by day, in the
        fog or in the black.
    17  THE THING YOU WANTED, READY: a card or a training refused for goods
        says so once the goods are in, and shines; built another way, it is
        let go; a journey world says nothing (Mira's voice).
    18  NEWS OFF THE VIEW SAYS WHERE: a building finished off the view wears
        the toast's way there; one on the view does not.
    19  MORE KEYS: ? shows every key, . takes the next idle villager in turn,
        and Escape steps back from a shell page.
    20  THE LOADING PLAQUE wears the HUD's walnut and gold and says one thing
        worth knowing — never in a journey world.

   Run this after touching js/feel.js, R.drawWakes / drawMiniView / miniCam, the
   btnMenu handler (the one menu), Screens.enterGame's zoom line, Units.personName,
   Bld.canTrain / canUpgrade's refusals, or a refusal toast in ui.js — or
   R.drawGRing / drawMarkTile / drawRallyFlag / drawSeamGlints /
   drawFireflies / bar / barBite, UI._orderSnap, Bld.goNews, Screens.showPrep.

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
    return { paused: S.paused, on: v.classList.contains('on'), disp: getComputedStyle(v).display, words: v.textContent }; });
  ck('spacePausesUnderAPlate', a.paused && a.on && a.disp === 'flex' && /paused/i.test(a.words),
    JSON.stringify(a));
  await p.keyboard.press('Space');
  await p.waitForTimeout(80);
  const b2 = await ev(() => ({ paused: S.paused, on: document.getElementById('pauseVeil').classList.contains('on') }));
  ck('andSpaceResumes', !b2.paused && !b2.on, JSON.stringify(b2));
  /* THE ONE MENU IS THE PAUSE (build 214 — the ⏸ beside the menu went: "we
     don't need two buttons"): the gear pauses the world under the menu's
     Game tab, and its Resume gives the world back */
  await p.click('#btnMenu'); await p.waitForTimeout(150);
  const c = await ev(() => ({ cur: Screens.current, paused: S.paused, tab: SettingsPage.tab, inGame: SettingsPage.inGame,
    resume: !!document.querySelector('#scrSetx.show .sxPane #btnPauseResume'), head: document.querySelector('#scrSetx .sxHead h2').textContent }));
  // Resume is the real door (Screens.enterGame), which waits behind its
  // plaque for any art this test's world never asked to wait for
  await p.click('#btnPauseResume');
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(120);
  const c2 = await ev(() => ({ cur: Screens.current, paused: S.paused }));
  ck('theMenuIsThePause', c.cur === 'paused' && c.paused && c.tab === 'game' && c.inGame && c.resume && /paused/i.test(c.head)
    && c2.cur === 'playing' && !c2.paused, JSON.stringify([c, c2]));
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
  // (the ⏸ is gone: Space is said on the pause veil's own plate and the keys' plate)
  const t = await ev(() => ({ menu: document.getElementById('btnMenu').title, map: document.getElementById('mapBtn').title }));
  ck('theButtonsSayTheirKeys', /Esc/.test(t.menu) && /\(M\)/.test(t.map), JSON.stringify(t));
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

/* ---- 11. every order shows where it lands ---- */
{
  await play('feel-11');
  const t = await ev(() => {
    const W = CFG.W, terr = S.map.terrain;
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    let grass = null, wood = null;
    for (let r = 3; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (v.x | 0) + dx, y = (v.y | 0) + dy;
      if (!MapGen.onBoard(x, y) || !MapGen.onBoard(x, y + 1)) continue;
      if (!grass && terr[y * W + x] === T.GRASS && !Bld.at(x, y) && !S.units.some(o => Math.hypot(o.x - x - 0.5, o.y - y - 0.5) < 1.6)) grass = { x, y };
      if (!wood && terr[y * W + x] === T.FOREST && S.map.resAmount[y * W + x] > 0 && terr[(y + 1) * W + x] === T.GRASS && !Bld.at(x, y + 1)) wood = { x, y };
    }
    return { vid: v.id, grass, wood };
  });
  const tapTile = async (x, y) => { const pt = await onScreen(x, y); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(90); };
  await ev((vid) => { UI.select('unit', vid); }, t.vid);
  await tapTile(t.grass.x, t.grass.y);
  const m1 = await ev(() => { const m = Feel._mark, now = performance.now() / 1000, r = Feel.ringsFor(now);
    const sig = o => o && JSON.stringify({ t: o.tiles, u: [...o.units], b: [...o.blds] });
    return { kind: m && m.kind, x: m && m.x, y: m && m.y, tiles: r ? r.tiles.length : 0, dot: r && r.tiles.some(q => q.dot > 0),
      still: sig(Feel.ringsFor(now)) === sig(Feel.ringsFor(now)) }; });
  ck('aWalkMarksWhereItLands', m1.kind === 'move' && m1.x === t.grass.x + 0.5 && m1.y === t.grass.y + 0.5 && m1.tiles === 2 && m1.dot,
    JSON.stringify(m1));
  ck('andTheMarkIsAPureFunctionOfTheClock', m1.still, 'two asks at one moment lay the same rings');
  // it is laid on the ground, in the frame's own pass
  const drawn = await ev(() => { let n = 0; const o = R.drawMarkTile; R.drawMarkTile = function (...a) { n++; return o.apply(this, a); }; R.draw(0); R.drawMarkTile = o; return n; });
  ck('andIsDrawnOnTheGround', drawn >= 1, drawn + ' tile ring(s) laid by R.draw');
  await p.waitForTimeout(1000);
  ck('andIsGoneAfterItsBeat', await ev(() => { Feel.ringsFor(performance.now() / 1000); return Feel._mark === null; }));
  // a hand sent to the woods rings the woods
  await ev((vid) => { UI.select('unit', vid); }, t.vid);
  await tapTile(t.wood.x, t.wood.y);
  const m2 = await ev((vid) => ({ kind: Feel._mark && Feel._mark.kind, x: Feel._mark && Feel._mark.x, y: Feel._mark && Feel._mark.y, task: Units.get(vid).task && Units.get(vid).task.type }), t.vid);
  ck('aHandSentToWorkRingsTheWork', m2.task === 'gather' && m2.kind === 'work' && m2.x === t.wood.x + 0.5 && m2.y === t.wood.y + 0.5, JSON.stringify(m2));
  // a soldier sent at a wolf rings the wolf in rust — and never through the fog
  const w = await ev((g) => {
    const s = Units.spawn('defender', 'P', g.x - 1.5, g.y + 0.5);
    const wolf = Units.spawn('wolf', 'W', g.x + 0.5, g.y + 0.5); wolf.aggro = 0; wolf.path = null;
    UI.select('unit', s.id);
    R.centerOn(wolf.x, wolf.y); const TL = CFG.TILE, z = R.cam.z;
    return { sid: s.id, wid: wolf.id, x: (wolf.x * TL - R.cam.x) * z, y: (wolf.y * TL - CFG.SPRITE_LIFT - R.cam.y) * z };
  }, t.grass);
  await p.mouse.click(w.x, w.y); await p.waitForTimeout(80);
  const m3 = await ev((w) => { const m = Feel._mark, r = Feel.ringsFor(performance.now() / 1000), o = r && r.units.get(w.wid);
    let foe = 0; const d = R.drawGRing; R.drawGRing = function (g, q, st, o2) { if (st === 'foe') foe++; return d.apply(this, arguments); };
    R.draw(0);
    const was = G.visibleAt; G.visibleAt = (x, y) => false; let hid = foe; R.draw(0); hid = foe - hid; G.visibleAt = was; R.drawGRing = d;
    return { kind: m && m.kind, uid: m && m.uid, st: o && o.st, drawn: foe - hid, hid }; }, w);
  ck('anAttackRingsItsMarkInRust', m3.kind === 'attack' && m3.uid === w.wid && m3.st === 'foe' && m3.drawn >= 1, JSON.stringify(m3));
  ck('andNeverRoundAFoeInTheFog', m3.hid === 0, m3.hid + ' rust ring(s) with the wolf unseen');
}

/* ---- 12. a work's hands, and a hand's work ---- */
{
  await play('feel-12');
  const c = await ev(() => {
    const tc = Bld.tcOf('P'); S.res.wood = S.res.food = S.res.stone = S.res.gold = 5000;
    let farm = null;
    for (let r = 2; r < 10 && !farm; r++) for (let dy = -r; dy <= r && !farm; dy++) for (let dx = -r; dx <= r && !farm; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.onBoard(x, y)) continue;
      const was = S.map.terrain[MapGen.idx(x, y)];
      if (was !== T.GRASS || Bld.at(x, y)) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.BARREN;
      if (Bld.canPlace('P', 'farm', x, y, { noCost: true }).ok) farm = Bld.place('P', 'farm', x, y, { free: true, instant: true });
      else S.map.terrain[MapGen.idx(x, y)] = was;
    }
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    v.task = { type: 'work', id: farm.id }; v.path = null;
    UI.select('bld', farm.id);
    const r1 = Feel.ringsFor(performance.now() / 1000);
    UI.select('unit', v.id);
    const r2 = Feel.ringsFor(performance.now() / 1000);
    UI.deselect();
    const r3 = Feel.ringsFor(performance.now() / 1000);
    return { hands: r1 && r1.units.has(v.id) && r1.units.get(v.id).calm === 1, work: r2 && r2.blds.has(farm.id), none: !r3 || (!r3.units.size && !r3.blds.size && !r3.tiles.length) };
  });
  ck('aStationInHandRingsItsHands', !!c.hands, JSON.stringify(c));
  ck('andAHandInHandRingsItsWork', !!c.work && c.none, JSON.stringify(c));
}

/* ---- 13. the bar shows the bite ---- */
{
  await play('feel-13');
  const b13 = await ev(() => {
    const d = Units.spawn('defender', 'P', CFG.W / 2, CFG.H / 2);
    const max = d.maxhp;
    Units.damage(d, Math.round(max * 0.4), null);
    const now = performance.now() / 1000, frac = d.hp / max;
    const g0 = R._barGhost(d, now, frac), C = R.BAR_BITE;
    const later = R._barGhost(d, now + C.hold + 1 / C.drain + 0.05, frac);
    // drawn: a pale chunk between the health and where it was; no `who`, the old bar
    const cv = document.createElement('canvas'); cv.width = 100; cv.height = 4; const g = cv.getContext('2d');
    R.bar(g, 0, 0, 100, 4, frac, '#7dbb5e', d);
    const at = x => Array.from(g.getImageData(x, 1, 1, 1).data);
    const pale = at(Math.round(100 * (frac + (g0 - frac) / 2)));
    g.clearRect(0, 0, 100, 4); R.bar(g, 0, 0, 100, 4, frac, '#7dbb5e');
    const plain = at(Math.round(100 * (frac + (g0 - frac) / 2)));
    return { pre: 1, g0, frac, later, pale, plain };
  });
  ck('aBlowLeavesTheBite', Math.abs(b13.g0 - 1) < 1e-9 && b13.frac < 0.7, `the bar was at ${b13.g0}, now ${b13.frac.toFixed(2)}`);
  ck('whichDrainsAway', Math.abs(b13.later - b13.frac) < 1e-9, `${b13.later} once it has drained`);
  ck('drawnPaleBetweenTheTwo', b13.pale[0] > 220 && b13.pale[1] > 200 && b13.plain[0] < 60, JSON.stringify({ pale: b13.pale, plain: b13.plain }));
}

/* ---- 14. the rally flag flies, and nothing of it lies in the black ---- */
{
  await play('feel-14');
  const f = await ev(() => {
    S.res.wood = S.res.food = S.res.stone = S.res.gold = 5000;
    const tc = Bld.tcOf('P');
    // the flag on the board's first playable row, the camera at the edge, so the black is in view
    // the flag's foot on the first playable row's top: its pole rises into the black
    tc.rally = { x: tc.x + 1, y: 0.55 };   // its foot at 1.05 tiles (rallyPoint adds the half)
    UI.select('bld', tc.id);
    R.cam.z = 2; R.centerOn(tc.x + 1, 1); R.clampCam();
    let n = 0; const o = R.drawRallyFlag; R.drawRallyFlag = function (...a) { n++; return o.apply(this, a); };
    const pn = performance.now; const t0 = pn.call(performance); performance.now = () => t0;
    const W = R.cv.width, H = R.cv.height;
    const bp = R.boardPx(), z = R.cam.z * R.dpr;
    const sy0 = (bp.y0 - R.cam.y) * z;   // the board's top edge on the canvas
    const probe = () => {
      R.draw(0); const a = R.g.getImageData(0, 0, W, H).data;
      const keep = R.drawRallyFlag; R.drawRallyFlag = () => {}; R.draw(0); const b = R.g.getImageData(0, 0, W, H).data; R.drawRallyFlag = keep;
      let diff = 0, out = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) { diff++; if (y < sy0 - 0.5) out++; } }
      return { diff, out };
    };
    const real = probe();
    // the control: with the board's clip stood down the probe must see the pole in the black
    const clip = R._gClip; R._gClip = () => {}; const ctl = probe(); R._gClip = clip;
    R.drawRallyFlag = o; performance.now = pn;
    return { n, diff: real.diff, out: real.out, ctl: ctl.out, sy0: Math.round(sy0) };
  });
  ck('theRallyFlagFlies', f.n >= 1 && f.diff > 40, `${f.n} draw(s), ${f.diff} pixels its own`);
  ck('andNothingOfItLiesInTheBlack', f.out === 0, `${f.out} of its pixels above the board's edge (row ${f.sy0})`);
  ck('andTheProbeCanSeeOneThere', f.ctl > 0, `${f.ctl} with the clip stood down`);
}

/* ---- 15. gold seams glint, 16. fireflies on a deep night ---- */
{
  await play('feel-15');
  const s15 = await ev(() => {
    const W = CFG.W;
    let seam = null;
    for (let y = 3; y < CFG.H - 3 && !seam; y++) for (let x = 3; x < W - 3 && !seam; x++) if (S.map.terrain[y * W + x] === T.GOLDORE && !Bld.at(x, y)) seam = { x, y };
    if (!seam) { seam = { x: Math.floor(W / 2), y: Math.floor(CFG.H / 2) }; S.map.terrain[seam.y * W + seam.x] = T.GOLDORE; }
    R.cam.z = 2; R.centerOn(seam.x + 0.5, seam.y + 0.5);
    // a moment the seam's own rhythm is lit
    const h = ((seam.x * 73856093) ^ (seam.y * 19349663)) >>> 0, C = R.GLINT;
    const per = C.period + (h % 97) / 97 * 1.6;
    const tLit = Math.ceil(1000 / per) * per - (h % 1000) / 1000 * per + C.life / 2;
    const pn = performance.now;
    const count = (fn) => { const cv = document.createElement('canvas'); cv.width = R.cv.width; cv.height = R.cv.height; const g = cv.getContext('2d');
      g.setTransform(R.cam.z * R.dpr, 0, 0, R.cam.z * R.dpr, -R.cam.x * R.cam.z * R.dpr, -R.cam.y * R.cam.z * R.dpr);
      let n = 0; const f0 = g.fill.bind(g); g.fill = (...a) => { n++; return f0(...a); }; fn(g); return n; };
    performance.now = () => tLit * 1000;
    const lit = count(g => R.drawSeamGlints(g));
    const was = G.visibleAt; G.visibleAt = () => false; const fog = count(g => R.drawSeamGlints(g)); G.visibleAt = was;
    const ba = Bld.at; Bld.at = (x, y) => (x === seam.x && y === seam.y) ? { key: 'mine' } : ba.call(Bld, x, y);
    const mined = count(g => R.drawSeamGlints(g)); Bld.at = ba;
    performance.now = pn;
    // fireflies: a deep night at a wood's edge, never by day, never in the fog
    const terr = S.map.terrain; let edge = null;
    for (let y = 4; y < CFG.H - 4 && !edge; y++) for (let x = 4; x < W - 4 && !edge; x++) {
      if (terr[y * W + x] !== T.GRASS) continue; let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (terr[(y + dy) * W + x + dx] === T.FOREST) n++;
      if (n >= 6) edge = { x, y };
    }
    R.centerOn(edge.x + 0.5, edge.y + 0.5);
    const ff = (k) => { const dp = R.dayPhase, dk = R._dusk; R._dusk = null; R.dayPhase = () => ({ k, warm: 0, dayF: 0.5 });
      const cv = document.createElement('canvas'); cv.width = R.cv.width; cv.height = R.cv.height; const g = cv.getContext('2d');
      let n = 0; const d0 = g.drawImage.bind(g); g.drawImage = (...a) => { n++; return d0(...a); };
      R.drawFireflies(g); R.dayPhase = dp; R._dusk = dk; return n; };
    const night = ff(0.95), day = ff(0);
    const was2 = G.visibleAt; G.visibleAt = () => false; const ffFog = ff(0.95); G.visibleAt = was2;
    const src = String(R.drawFireflies);
    return { lit, fog, mined, night, day, ffFog, clip: /boardPx\(\)/.test(src) && /clip\(\)/.test(src) };
  });
  ck('aSeamInSightGlints', s15.lit > 0, s15.lit + ' fill(s) at its lit moment');
  ck('butNeverInTheFogOrUnderAMine', s15.fog === 0 && s15.mined === 0, JSON.stringify({ fog: s15.fog, mined: s15.mined }));
  ck('fireflyLightOnADeepNight', s15.night > 0 && s15.day === 0, `${s15.night} at night, ${s15.day} by day`);
  ck('neverInTheFogNorTheBlack', s15.ffFog === 0 && s15.clip, JSON.stringify({ fog: s15.ffFog, clipped: s15.clip }));
}

/* ---- 17. the thing you wanted, ready ---- */
{
  await play('feel-17');
  await ev(() => { UI.deselect(); UI.setMenuCollapsed(false); document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {}; });
  await p.waitForTimeout(100);
  const a = await ev(() => { S.res.wood = 0; S.res.stone = 0; S.res.gold = 0; UI.refreshMenu && UI.refreshMenu();
    const btn = document.querySelector('#buildmenu .bbtn[data-key="barracks"]'); btn.click();
    const w = Feel._want && Feel._want.key; if (UI.placing) UI.exitPlacement(); UI.setMenuCollapsed(false); return w; });
  await ev(() => { S.res.wood = 5000; S.res.stone = 5000; S.res.gold = 5000; });
  await p.waitForTimeout(800);
  const r = await ev(() => ({ said: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).filter(x => /Enough to build a Barracks now/.test(x)).length,
    lit: !!document.querySelector('#buildmenu .bbtn[data-key="barracks"].fkReady'), left: !!Feel._want }));
  ck('aRefusedCardIsRemembered', a === 'barracks', String(a));
  ck('andSaysSoWhenTheGoodsAreIn', r.said === 1 && r.lit && !r.left, JSON.stringify(r));
  // raised another way meanwhile: let go, nothing said
  const b2 = await ev(async () => {
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {};
    S.res.wood = 0; S.res.stone = 0; S.res.gold = 0;
    document.querySelector('#buildmenu .bbtn[data-key="house"]').click(); if (UI.placing) UI.exitPlacement(); UI.setMenuCollapsed(false);
    const tc = Bld.tcOf('P'); let done = false;
    for (let r = 2; r < 9 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) {
      if (Bld.canPlace('P', 'house', tc.x + dx, tc.y + dy, { noCost: true }).ok) { Bld.place('P', 'house', tc.x + dx, tc.y + dy, { free: true, instant: true }); done = true; } }
    S.res.wood = 5000; await new Promise(r => setTimeout(r, 800));
    return { said: [...document.querySelectorAll('#toasts .toast')].some(t => /Enough to build a House/.test(t.textContent)), left: !!Feel._want };
  });
  ck('builtAnotherWayItIsLetGo', !b2.said && !b2.left, JSON.stringify(b2));
  // a training: said in its own words
  const c = await ev(async () => {
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {};
    const tc = Bld.tcOf('P'); S.res.food = 0; UI.select('bld', tc.id); UI.renderPanel();
    document.querySelector('#panel [data-act="train"][data-unit="villager"]').click();
    const w = Feel._want && Feel._want.kind;
    S.res.food = 5000; await new Promise(r => setTimeout(r, 800));
    return { w, said: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).filter(x => /Enough to train a Villager now/.test(x)).length };
  });
  ck('aTrainingSaysItInItsOwnWords', c.w === 'train' && c.said === 1, JSON.stringify(c));
  // a journey world: Mira has the one voice
  const j = await ev(async () => {
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {};
    const tc = Bld.tcOf('P'); S.res.food = 0; UI.select('bld', tc.id); UI.renderPanel();
    document.querySelector('#panel [data-act="train"][data-unit="villager"]').click();
    const sc = S.scenario; S.scenario = 'prologue_x';
    S.res.food = 5000; await new Promise(r => setTimeout(r, 800));
    S.scenario = sc;
    return { said: [...document.querySelectorAll('#toasts .toast')].some(t => /Enough to/.test(t.textContent)), left: !!Feel._want };
  });
  ck('aJourneyWorldSaysNothing', !j.said && !j.left, JSON.stringify(j));
}

/* ---- 18. news off the view says where ---- */
{
  await play('feel-18');
  const n = await ev(() => {
    const tc = Bld.tcOf('P'); S.res.wood = 5000;
    const site = () => { for (let r = 3; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (Bld.canPlace('P', 'house', tc.x + dx, tc.y + dy, { noCost: true }).ok) return Bld.place('P', 'house', tc.x + dx, tc.y + dy, { free: true }); } return null; };
    const last = () => [...document.querySelectorAll('#toasts .toast')].pop();
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {};
    const a = site(); R.centerOn(a.x > CFG.W / 2 ? 3 : CFG.W - 4, a.y > CFG.H / 2 ? 3 : CFG.H - 4);
    const offView = !UI.inOpenBand(Bld.cx(a), Bld.cy(a));
    Bld.finish(a); const t1 = last();
    document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); UI._toastAt = {};
    const b = site(); R.centerOn(Bld.cx(b), Bld.cy(b)); Bld.finish(b); const t2 = last();
    return { offView, go: !!(t1 && t1.querySelector('.tgo')), onView: !!(t2 && t2.querySelector('.tgo')) };
  });
  ck('newsOffTheViewSaysWhere', n.offView && n.go, JSON.stringify(n));
  ck('newsOnTheViewNeedsNoWay', !n.onView, JSON.stringify(n));
}

/* ---- 19. more keys ---- */
{
  await play('feel-19');
  await p.mouse.move(5, 400);
  await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(120);
  const k1 = await ev(() => ({ on: Feel._keysOn, disp: getComputedStyle(document.getElementById('feelKeys')).display, words: document.getElementById('feelKeys').textContent }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(80);
  const k2 = await ev(() => ({ on: Feel._keysOn, scr: Screens.current }));
  ck('aQuestionMarkShowsEveryKey', k1.on && k1.disp === 'flex' && /Next idle villager/.test(k1.words) && /Home to the hall/.test(k1.words), JSON.stringify({ on: k1.on, disp: k1.disp }));
  ck('andEscapePutsItAwayFirst', !k2.on && k2.scr === 'playing', JSON.stringify(k2));
  const ids = await ev(() => { const vs = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)); vs.forEach(u => { u.task = null; u.path = null; u.tUnit = 0; }); UI.deselect(); return vs.map(u => u.id).sort((a, b) => a - b); });
  const seen = [];
  for (let i = 0; i < ids.length + 1; i++) { await p.keyboard.press('Period'); await p.waitForTimeout(60); seen.push(await ev(() => UI.sel && UI.sel.type === 'unit' ? UI.sel.id : null)); }
  ck('aDotTakesTheNextIdleVillagerInTurn', ids.length >= 2 && seen.slice(0, ids.length).every((id, i) => id === ids[i]) && seen[ids.length] === ids[0],
    `${seen.join(',')} over idle ${ids.join(',')}`);
  await ev(() => { Screens.backTo = 'paused'; Screens.show('howto'); });
  await p.waitForTimeout(150);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const s1 = await ev(() => Screens.current);
  await ev(() => { Screens.backTo = 'paused'; Screens.show('settings'); });
  await p.waitForTimeout(150);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const s2 = await ev(() => Screens.current);
  ck('escapeStepsBackFromAShellPage', s1 === 'paused' && s2 === 'paused', `guide → ${s1}, settings → ${s2}`);
  await ev(() => Screens.enterGame());
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 20000 });
}

/* ---- 20. the loading plaque ---- */
{
  await play('feel-20');
  const q = await ev(() => {
    Screens.showPrep(true);
    const el = document.getElementById('prep'), tip = document.getElementById('prepTip'), fill = document.getElementById('prepFill');
    const a = { shown: getComputedStyle(el).display === 'flex', tip: tip && tip.textContent, tipShown: !!tip && getComputedStyle(tip).display !== 'none', fill: !!fill,
      title: (document.getElementById('prepTitle') || {}).textContent };
    Screens.showPrep(false);
    const sc = S.scenario; S.scenario = 'prologue_x'; Screens.showPrep(true);
    const j = getComputedStyle(document.getElementById('prepTip')).display === 'none';
    Screens.showPrep(false); S.scenario = sc;
    const hidden = getComputedStyle(document.getElementById('prep')).display === 'none';
    return { ...a, journey: j, hidden, tips: Screens.PREP_TIPS.length };
  });
  ck('thePlaqueSaysOneThingWorthKnowing', q.shown && q.tipShown && q.fill && /^TIP/.test(q.tip) && /Preparing the world/.test(q.title), JSON.stringify(q));
  ck('butNotInAJourneyWorld', q.journey && q.hidden, JSON.stringify({ journey: q.journey, hidden: q.hidden }));
}

ck('noPageErrors', errs.length === 0, errs.slice(0, 3).join(' | '));
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log(`${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log('ALL FEEL CHECKS PASS');
