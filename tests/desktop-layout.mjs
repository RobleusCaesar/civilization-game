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
     THE TOP BAR IS ONE ROW          the tribe, the day and the two buttons
                                     ride BESIDE the resources, not under
                                     them — a second row cost ~30px of map
                                     across the whole width for no reason on
                                     a window that can hold all eight chips
                                     on one line (operator, 2026-09-22). The
                                     markup is unchanged: the phone still
                                     stacks, so this is measured as a height
                                     and as two boxes that overlap in y.
     THE ACTIONS ARE FOUR ACROSS     a panel's buttons wrap at four per row
                                     instead of two, and a .wide button takes
                                     half a row instead of all of it — so a
                                     Town Center's seven actions are two rows
                                     of wood, not four. The phone keeps two.

   Run after touching: R.minZoom / defaultZoom / clampCam / resize, the pinch
   handler in ui.js, Screens.enterGame, or the #topbar / #buildmenu /
   #panel .pactions CSS.

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
    /* ONE ROW. The two .trow boxes share a line here, which is a y-overlap —
       not an equal top, because each is centred on its own height and the
       one with the 34px buttons is the taller. The bar's own height is the
       thing the map actually gets back, so it is measured too. */
    const rows = [...document.querySelectorAll('#topbar .trow')].map(e => e.getBoundingClientRect());
    out.rowsShareALine = rows[0].bottom > rows[1].top + 4 && rows[1].bottom > rows[0].top + 4;
    out.barH = Math.round(bar.height);
    out.rowsSpanTheBar = Math.round(rows[1].right - rows[0].left) >= out.barW - 16;
    /* FOUR ACROSS. A Town Center is the fullest panel in the game, so it is
       the one worth measuring: how many distinct tops do its buttons have? */
    G.newGame('layout-panel', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    UI.select('bld', Bld.tcOf('P').id);
    await new Promise(r => setTimeout(r, 150));
    const acts = [...document.querySelectorAll('#panel .pactions .abtn')].map(e => e.getBoundingClientRect());
    out.actN = acts.length;
    out.actRows = new Set(acts.map(c => Math.round(c.top))).size;
    out.actPerRow = Math.max(...[...new Set(acts.map(c => Math.round(c.top)))]
      .map(t => acts.filter(c => Math.round(c.top) === t).length));
    out.panelH = Math.round(document.getElementById('bottombar').getBoundingClientRect().height);
    UI.deselect();
    /* …and a BARRACKS, which is the panel that caught this rule being wrong:
       it carries a .wide upgrade AND a .wide champion, and a half-width
       .wide left the champion alone on a row of its own — a third row of
       wood for one button. .wide is a phone affordance; a quarter of this
       bar is already wider than a phone's full-width button. */
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tcb = Bld.tcOf('P');
    const bk = Bld.place('P', 'barracks', tcb.x + 4, tcb.y, { free: true });
    if (bk) {
      bk.construction = 0; bk.hp = bk.maxhp;
      UI.select('bld', bk.id);
      await new Promise(r => setTimeout(r, 150));
      const pw = document.getElementById('panel').getBoundingClientRect().width;
      const ba = [...document.querySelectorAll('#panel .pactions .abtn')].map(e => e.getBoundingClientRect());
      out.bkN = ba.length;
      out.bkRows = new Set(ba.map(c => Math.round(c.top))).size;
      out.bkAlone = ba.filter(c => Math.round(c.width) >= Math.round(pw) - 2).length;
      UI.deselect();
    }
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
  /* the chips spread across the space they HAVE — which is the bar less the
     tribe, the day and the two buttons now sharing the line with them */
  ck('theChipsAreCappedAndSpread', r.chipMax <= 260 && r.chipSpread >= r.barW * 0.62 && r.rowsSpanTheBar,
    `widest chip ${r.chipMax}px, spread ${r.chipSpread}px of ${r.barW}px; the two groups span the bar: ${r.rowsSpanTheBar}`);
  ck('theTopBarIsOneRow', r.rowsShareALine && r.barH <= 56,
    `the two groups share a line: ${r.rowsShareALine}, bar ${r.barH}px tall (stacked it is ~75)`);
  ck('thePanelPutsFourOnARow', r.actN >= 5 && r.actPerRow >= 4 && r.actRows <= 2,
    `${r.actN} actions in ${r.actRows} row(s), ${r.actPerRow} on the fullest — two rows of wood, not four`);
  ck('andNoPanelRunsPastTwoRows', r.bkRows <= 2 && r.bkAlone === 0,
    'the barracks: ' + r.bkN + ' actions in ' + r.bkRows + ' row(s), ' + r.bkAlone + ' of them alone on a full-width row');
  ck('theBuildMenuCentres', r.menuOverflows || Math.abs(r.menuLeftGap - r.menuRightGap) <= 8,
    r.menuOverflows ? 'menu overflows — scrolls from its start' : `gaps ${r.menuLeftGap}/${r.menuRightGap} — children: ${r.menuKids}`);
  ck('aWideWindowThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

// ---- 2. a phone: untouched ----
{
  const { p, errs } = await boot({ width: 390, height: 844 });
  const r = await p.evaluate(async () => {
    G.newGame('layout-phone', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing');
    const chips = [...document.querySelectorAll('#topbar .trow:first-child .res')].map(e => e.getBoundingClientRect());
    const row = document.querySelector('#topbar .trow').getBoundingClientRect();
    const bm = document.getElementById('buildmenu');
    UI.setMenuCollapsed && UI.setMenuCollapsed(false);
    const cs = getComputedStyle(bm);
    const rows = [...document.querySelectorAll('#topbar .trow')].map(e => e.getBoundingClientRect());
    return { z: +R.cam.z.toFixed(3), min: +R.minZoom().toFixed(3),
      chipsFill: Math.round(chips[3].right - chips[0].left) >= Math.round(row.width) - 14,
      chipW: Math.round(chips[0].width),
      // a phone cannot hold eight chips on a line: it still stacks, and the
      // panel still runs two across (notes 3 and 4 were desktop-only)
      stacked: rows[1].top >= rows[0].bottom - 1,
      justify: cs.justifyContent, resFlex: getComputedStyle(chips.length ? document.querySelector('#topbar .res') : bm).flexGrow };
  });
  ck('aPhoneOpensClose', r.z === 1.7 || (r.min > 1.7 && r.z === r.min), `z ${r.z} (floor ${r.min})`);
  ck('andItsChipsStillFillTheRow', r.chipsFill && r.resFlex === '1', `chip ${r.chipW}px, flex-grow ${r.resFlex}`);
  ck('andItsBuildMenuStillPacksLeft', !/center/.test(r.justify), r.justify);
  ck('andItsTopBarStillStacks', r.stacked, 'eight chips do not fit on 390px — the one-row rule is desktop-only');
  ck('aPhoneThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL DESKTOP-LAYOUT CHECKS PASS');
