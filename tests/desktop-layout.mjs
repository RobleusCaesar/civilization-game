/* DESKTOP LAYOUT — the world fills the window, the bars fill the width.

   From a wide-window screenshot (the retention pass): the map sat in the
   middle of a 1900px window between black bands, zoomed in too far; the
   resource bar was four 450px slabs of wood with a number in each; the build
   menu left a third of the bar empty on the right. Three rules:

     THE WORLD COVERS THE VIEWPORT   R.minZoom() — derived from the live
                                     viewport and the map, never a constant —
                                     is the floor for every zoom: clampCam
                                     and the pinch both ask it, so no zoom
                                     can show void beside the map.
     A RUN OPENS AT ITS OWN ZOOM     R.defaultZoom(): a phone keeps 1.7; a
                                     wide window steps back to 1.25 to see
                                     more world; both floored at minZoom. Set
                                     in Screens.enterGame — a played game used
                                     to inherit the title demo's leftover.
     THE BARS FILL THE WIDTH         at ≥900px the four chips are capped and
                                     spread evenly; the build menu centres.
                                     Below 900px NOTHING changes — the phone
                                     layout is pinned at 390px too.

   Run after touching: R.minZoom / defaultZoom / clampCam / resize, the pinch
   handler in ui.js, Screens.enterGame, or the #topbar / #buildmenu CSS.

     node tests/desktop-layout.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });   // shipped PNGs bake into canvases — file:// must be same-origin
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

async function boot(vp) {
  const p = await b.newPage({ viewport: vp });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  await p.waitForTimeout(300);
  return { p, errs };
}

// ---- 1. a wide window: the world fills it, at a zoom that shows more of it ----
{
  const { p, errs } = await boot({ width: 1440, height: 900 });
  const r = await p.evaluate(async () => {
    const out = {};
    const covers = () => {
      R.clampCam();
      const vw = R.viewW() / R.cam.z, vh = R.viewH() / R.cam.z;
      return vw <= CFG.W * CFG.TILE + 0.5 && vh <= CFG.H * CFG.TILE + 0.5;
    };
    for (const size of ['medium', 'large', 'xlarge']) {
      G.newGame('layout-' + size, 'moderate', size); Screens._demo = false;
      R.cam.z = 0.77;                       // whatever the last screen left behind
      Screens.enterGame();                  // THE real door — the one that sets the opening zoom
      for (let i = 0; i < 300 && Screens.current !== 'playing'; i++) await new Promise(r => setTimeout(r, 20));
      const o = { z: +R.cam.z.toFixed(3), min: +R.minZoom().toFixed(3), covers: covers(), entered: Screens.current === 'playing' };
      // every zoom the player can reach still covers the window
      R.cam.z = 0.5; o.floored = covers() && R.cam.z >= R.minZoom() - 1e-9;
      UI.pinchZoom ? UI.pinchZoom(0.01) : (R.cam.z = Math.max(R.minZoom(), Math.min(R.ZOOM_MAX, R.cam.z * 0.01)));
      o.pinchFloored = R.cam.z >= R.minZoom() - 1e-9 && covers();
      out[size] = o;
    }
    // the bars
    const chips = [...document.querySelectorAll('#topbar .trow:first-child .res')].map(e => e.getBoundingClientRect());
    const bar = document.getElementById('topbar').getBoundingClientRect();
    out.chipMax = Math.round(Math.max(...chips.map(c => c.width)));
    out.chipSpread = Math.round(chips[3].right - chips[0].left);
    out.barW = Math.round(bar.width);
    const bm = document.getElementById('buildmenu');
    UI.setMenuCollapsed && UI.setMenuCollapsed(false);
    const btns = [...bm.querySelectorAll('.bbtn')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);   // the Wonder card hides off Calm: a zero rect is not an edge
    const bmr = bm.getBoundingClientRect();
    out.menuLeftGap = Math.round(btns[0].left - bmr.left); out.menuRightGap = Math.round(bmr.right - btns[btns.length - 1].right);
    out.menuOverflows = bm.scrollWidth > bm.clientWidth + 1;
    out.menuKids = [...bm.children].map(e => e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : '') + (getComputedStyle(e).display === 'none' ? '(hidden)' : '')).join(' ');
    return out;
  });
  for (const size of ['medium', 'large', 'xlarge']) {
    const o = r[size];
    ck('theWorldFillsAWideWindow_' + size, o.covers && o.z >= o.min - 1e-9, `z ${o.z} ≥ floor ${o.min}, covers ${o.covers}`);
    ck('andNoZoomCanShowVoid_' + size, o.floored && o.pinchFloored, `floor holds through clampCam and the pinch`);
    ck('andItOpensSteppedBack_' + size, o.entered && o.z <= 1.7 && o.z >= 1.25 - 1e-9, `opened at ${o.z} (phone would be 1.7)${o.entered ? '' : ' — never reached playing'}`);
  }
  ck('theChipsAreCappedAndSpread', r.chipMax <= 260 && r.chipSpread >= r.barW * 0.8,
    `widest chip ${r.chipMax}px, spread ${r.chipSpread}px of ${r.barW}px`);
  ck('theBuildMenuCentres', r.menuOverflows || Math.abs(r.menuLeftGap - r.menuRightGap) <= 8,
    r.menuOverflows ? 'menu overflows — scrolls from its start' : `gaps ${r.menuLeftGap}/${r.menuRightGap} — children: ${r.menuKids}`);
  ck('aWideWindowThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

// ---- 2. a phone: untouched ----
{
  const { p, errs } = await boot({ width: 390, height: 844 });
  const r = await p.evaluate(() => {
    G.newGame('layout-phone', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    const chips = [...document.querySelectorAll('#topbar .trow:first-child .res')].map(e => e.getBoundingClientRect());
    const row = document.querySelector('#topbar .trow').getBoundingClientRect();
    const bm = document.getElementById('buildmenu');
    UI.setMenuCollapsed && UI.setMenuCollapsed(false);
    const cs = getComputedStyle(bm);
    return { z: +R.cam.z.toFixed(3), min: +R.minZoom().toFixed(3),
      chipsFill: Math.round(chips[3].right - chips[0].left) >= Math.round(row.width) - 14,
      chipW: Math.round(chips[0].width),
      justify: cs.justifyContent, resFlex: getComputedStyle(chips.length ? document.querySelector('#topbar .res') : bm).flexGrow };
  });
  ck('aPhoneOpensClose', r.z === 1.7 || (r.min > 1.7 && r.z === r.min), `z ${r.z} (floor ${r.min})`);
  ck('andItsChipsStillFillTheRow', r.chipsFill && r.resFlex === '1', `chip ${r.chipW}px, flex-grow ${r.resFlex}`);
  ck('andItsBuildMenuStillPacksLeft', !/center/.test(r.justify), r.justify);
  ck('aPhoneThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL DESKTOP-LAYOUT CHECKS PASS');
