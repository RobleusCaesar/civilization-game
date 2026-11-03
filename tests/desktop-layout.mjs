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
     A PHONE'S SMALL CONTROLS HIT    the folded build tab (22px tall, and the
     AT 44 PX, AND LOOK THE SAME     only way back after every order folds
                                     the menu), Pause and Menu (34px) and
                                     the minimap's fold (30px) each carry an
                                     invisible extension that takes the hit
                                     box to 44px where it has room; nothing
                                     they are drawn with changes, the room
                                     they take is room nobody else had, and
                                     an OPEN tab, which moves under the
                                     finger, takes none (§3, PX-14).

   Run after touching: R.minZoom / defaultZoom / clampCam / resize, the pinch
   handler in ui.js, Screens.enterGame, or the #topbar / #buildmenu /
   #panel .pactions / #bmToggle / #miniToggle CSS.

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
      // the press waits for the ground under its view, GROUND_MAX_MS at most (terrain-v4 §12)
      for (const t = performance.now() + Screens.GROUND_MAX_MS + 8000; Screens.current !== 'playing' && performance.now() < t;) await new Promise(r => setTimeout(r, 20));
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
    // the hall at its FULLEST: under threat its emergency calls are out
    // (UI.townThreat — in peace it is two actions and the tools row)
    UI.noteStruck();
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
  ck('thePanelPutsFourOnARow', r.actN >= 4 && r.actPerRow >= 4 && r.actRows <= 2,
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

/* ---- 3. A PHONE'S SMALL CONTROLS HIT AT 44 PX, AND LOOK THE SAME (PX-14) ----
   Every gather, build or station order folds the build menu by design, and
   the way back was a tab 22px tall at the bottom-left: a tap 12-16px above
   it landed in the world. Pause and Menu were 34x34 and 3px apart, the
   minimap's fold 30x30. Each now carries an invisible extension — a pseudo-
   element, so the drawn box (getBoundingClientRect) cannot see it — and it
   is measured as a finger meets it: elementFromPoint on a whole-pixel grid
   round the drawn box with a 24px margin, kept wherever it answers the
   control. Heights reach 44; the tab and the top-bar buttons keep their
   WIDTHS by design (the tab is already 55-75 wide, and four 34px buttons 3px
   apart have no width to give), the fold grows both ways.
   THE TAB'S REACH IS THE FOLDED TAB'S ALONE. An open tab moves: a tap that
   selects a unit lifts the panel, and the tab with it, under the finger,
   and the click the browser sends after the tap lands where the finger
   was — a reach on the open tab hid the panel that tap had just opened
   (a real touch tap, pinned below, with a control that gives the open tab
   a reach and must see the click taken). The folded tab only ever moves
   down, away from any finger.
   And the room each takes is room nobody else had: no pixel of the build
   cards, the panel's buttons or the minimap answers a reach instead of its
   owner, and the top bar's buttons reach no further than the bar. Measured
   on three phones, the notch included (the CDP inset override drives env()). */
for (const ph of [
  { k: 'p390', vp: { width: 390, height: 844 }, dpr: 3, inset: { top: 47, bottom: 34 } },
  { k: 'p320', vp: { width: 320, height: 568 }, dpr: 2, inset: null },
  { k: 'p430', vp: { width: 430, height: 932 }, dpr: 3, inset: { top: 59, bottom: 34 } },
]) {
  const ctx = await b.newContext({ viewport: ph.vp, deviceScaleFactor: ph.dpr, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  if (ph.inset) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: ph.inset.top, topMax: ph.inset.top,
      bottom: ph.inset.bottom, bottomMax: ph.inset.bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
  }
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const sl = ms => new Promise(r => setTimeout(r, ms));
    G.newGame('layout-targets', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    await sl(250);
    const $ = s => document.querySelector(s);
    const drawn = e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: +q.width.toFixed(1), h: +q.height.toFixed(1) }; };
    const owns = (e, x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h)); };
    // the EFFECTIVE hit box: every whole pixel round the drawn box that a finger would land on it
    const hit = (e, M = 24) => {
      const q = e.getBoundingClientRect();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let y = Math.max(0, Math.floor(q.top - M)); y <= Math.min(innerHeight - 1, Math.ceil(q.bottom + M)); y++)
        for (let x = Math.max(0, Math.floor(q.left - M)); x <= Math.min(innerWidth - 1, Math.ceil(q.right + M)); x++)
          if (owns(e, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < x0 ? { l: 0, t: 0, r: 0, b: 0, w: 0, h: 0 } : { l: x0, t: y0, r: x1 + 1, b: y1 + 1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    };
    // the whole pixels inside e's drawn box that a finger would land on THIEF instead
    // (a rounded corner or a scroller's clip answers e's parent: that is not a theft)
    const stolen = (e, thief) => {
      const q = e.getBoundingClientRect(); let n = 0;
      for (let y = Math.max(0, Math.ceil(q.top)); y < Math.min(innerHeight, q.bottom); y++)
        for (let x = Math.max(0, Math.ceil(q.left)); x < Math.min(innerWidth, q.right); x++) if (owns(thief, x, y)) n++;
      return n;
    };
    const live = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.bottom > 0 && q.top < innerHeight && q.right > 0 && q.left < innerWidth && getComputedStyle(e).visibility !== 'hidden'; };
    const out = { tab: {} };
    const tab = $('#bmToggle');
    const tabState = (k) => { out.tab[k] = { label: tab.textContent.trim(), drawn: drawn(tab), hit: hit(tab) }; return out.tab[k]; };
    // the folded tab, nothing selected: the way back after every order
    UI.deselect(); UI.setMenuCollapsed(true); await sl(120);
    const f = tabState('folded');
    const cx = Math.round((f.drawn.l + f.drawn.r) / 2);
    out.near = [12, 16].map(d => ({ d, on: owns(tab, cx, Math.floor(f.drawn.t) - d) }));
    // the open tab over the build menu, and the cards under it keep every pixel
    UI.setMenuCollapsed(false); await sl(120);
    tabState('open');
    const cards = [...document.querySelectorAll('#buildmenu .bbtn')].filter(live);
    out.cardsLost = cards.map(c => stolen(c, tab));
    out.cardN = cards.length;
    // …and the PROBE can see a stolen pixel: a reach pushed down over the cards must show up
    const leak = document.createElement('style');
    leak.textContent = '#bmToggle::before{content:"";position:absolute;left:0;right:0;top:0;bottom:-12px !important}';
    document.head.appendChild(leak); await sl(30);
    out.leakSeen = stolen(cards[0], tab);
    leak.remove(); await sl(30);
    // a villager selected: the tab rides over the panel, whose buttons keep every pixel
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    UI.select('unit', v.id); await sl(200);
    tabState('panel');
    const pbtns = [...document.querySelectorAll('#panel button, #panel [data-act]')].filter(live);
    out.panelLost = pbtns.map(e => stolen(e, tab)); out.panelN = pbtns.length;
    // …and folded away ("▴ Panel")
    tab.click(); await sl(200);
    tabState('panelFolded');
    UI.deselect(); UI.setMenuCollapsed(true); await sl(120);
    // the Master Builders charge badge is the tab's ::after: it keeps its own small shape,
    // and the hit area under it survives (the badge takes no pointer)
    if (window.Deck && Deck.FX && Deck.FX.master_builders && S.deck) {
      S.deck.charges = S.deck.charges || {}; S.deck.charges.master_builders = 3; Deck.FX.master_builders.syncTab(); await sl(60);
      const cs = getComputedStyle(tab, '::after');
      out.badge = { content: cs.content, w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0, tabW: tab.getBoundingClientRect().width, hit: hit(tab) };
      delete S.deck.charges.master_builders; Deck.FX.master_builders.syncTab(); await sl(30);
    }
    // the top bar's buttons: as tall as a finger, never past the bar
    const bar = $('#topbar').getBoundingClientRect();
    out.bar = { t: bar.top, b: bar.bottom };
    out.top = [...document.querySelectorAll('#topbar .iconbtn')].filter(live).map(e => ({ id: e.id, drawn: drawn(e), hit: hit(e) }));
    // the minimap's fold: 44 both ways, and the map under its reach keeps every pixel
    const mt = $('#miniToggle'), mini = $('#mini'), army = $('#armyBar');
    out.fold = { drawn: drawn(mt), hit: hit(mt), miniLost: stolen(mini, mt), armyTop: army.getBoundingClientRect().top };
    return out;
  });
  const T = r.tab, sz = o => `${o.hit.w}x${o.hit.h} hit, drawn ${o.drawn.w}x${o.drawn.h}`;
  ck(`theFoldedBuildTabHitsAt44_${ph.k}`, T.folded.hit.h >= 44 && T.folded.drawn.h <= 24,
    `"${T.folded.label}" ${sz(T.folded)} (a slim tab, a finger-high target)`);
  ck(`andTapsJustAboveItFindIt_${ph.k}`, r.near.every(n => n.on), r.near.map(n => `${n.d}px above: ${n.on ? 'the tab' : 'MISSED'}`).join(', '));
  ck(`andItsWidthIsItsOwn_${ph.k}`, ['folded', 'open', 'panel', 'panelFolded'].every(k => Math.abs(T[k].hit.w - T[k].drawn.w) <= 1.5),
    ['folded', 'open', 'panel', 'panelFolded'].map(k => `${T[k].label}: ${T[k].hit.w} vs drawn ${T[k].drawn.w}`).join('; '));
  ck(`andSoDoesTheFoldedPanelsTab_${ph.k}`, T.panelFolded.hit.h >= 44 && T.panelFolded.drawn.h <= 24,
    `"${T.panelFolded.label}" ${sz(T.panelFolded)} (a unit selected, its panel tucked away)`);
  ck(`butAnOpenTabReachesNoFurtherThanItIsDrawn_${ph.k}`, ['open', 'panel'].every(k => T[k].hit.h <= Math.ceil(T[k].drawn.h) + 1),
    ['open', 'panel'].map(k => `"${T[k].label}" ${sz(T[k])}`).join('; ') + ' (an open tab moves under the finger)');
  ck(`butTheBuildCardsKeepEveryPixel_${ph.k}`, r.cardN > 0 && r.cardsLost.every(n => n === 0),
    `${r.cardN} cards on screen, pixels the tab took from each: ${r.cardsLost.join(',')}`);
  ck(`andThePanelsButtonsToo_${ph.k}`, r.panelN > 0 && r.panelLost.every(n => n === 0),
    `${r.panelN} buttons, pixels the tab took from each: ${r.panelLost.join(',')}`);
  ck(`andTheProbeCanSeeAStolenPixel_${ph.k}`, r.leakSeen > 0, `a reach pushed 12px down over the first card took ${r.leakSeen} of its pixels`);
  if (r.badge) ck(`theMasterBuildersBadgeKeepsItsShape_${ph.k}`, /⚒/.test(r.badge.content) && r.badge.w > 0 && r.badge.w < r.badge.tabW && r.badge.h < 20 && r.badge.hit.h >= 44,
    `badge ${r.badge.content} ${Math.round(r.badge.w)}x${Math.round(r.badge.h)} on a ${Math.round(r.badge.tabW)}px tab, the tab still ${r.badge.hit.w}x${r.badge.hit.h} under it`);
  const pm = r.top.filter(t => t.id === 'btnPause' || t.id === 'btnMenu');
  ck(`pauseAndMenuHitAt44Tall_${ph.k}`, pm.length === 2 && r.top.every(t => t.hit.h >= 44 && t.drawn.h <= 34.5 && Math.abs(t.hit.w - t.drawn.w) <= 1.5),
    r.top.map(t => `${t.id} ${sz(t)}`).join('; '));
  ck(`andNoTopBarButtonReachesPastTheBar_${ph.k}`, r.top.every(t => t.hit.t >= Math.floor(r.bar.t) && t.hit.b <= Math.ceil(r.bar.b)),
    `bar ${Math.round(r.bar.t)}..${Math.round(r.bar.b)}: ` + r.top.map(t => `${t.id} ${t.hit.t}..${t.hit.b}`).join(', '));
  ck(`theMinimapFoldHitsAt44_${ph.k}`, r.fold.hit.w >= 44 && r.fold.hit.h >= 44 && r.fold.drawn.w <= 30.5 && r.fold.drawn.h <= 30.5, sz(r.fold));
  ck(`andTheMapUnderItKeepsEveryPixel_${ph.k}`, r.fold.miniLost === 0 && r.fold.hit.b <= Math.floor(r.fold.armyTop),
    `minimap pixels the fold took: ${r.fold.miniLost}; the fold's reach ends at ${r.fold.hit.b}, the army banners start at ${Math.round(r.fold.armyTop)}`);
  /* …and THE DECK'S COUNT KEEPS ITS RING. Pause's reach needs Pause
     positioned, and a positioned Pause paints over the count badge, which
     hangs 6px past the deck button into a phone's 3px gap (its gold ring
     lost its right edge). The badge's box must look the same as it does
     with Pause and Menu static, 127's paint order; the control takes the
     badge's lift away and must see the ring cut. */
  const badgeShot = async (css) => {
    const box = await p.evaluate(async (css) => {
      let st = document.getElementById('badgeProbe');
      if (!st) { st = document.createElement('style'); st.id = 'badgeProbe'; document.head.appendChild(st); }
      st.textContent = css;
      const btn = document.getElementById('deckBtn'), b = btn && btn.querySelector('.dkBadge');
      if (!b) return null;
      btn.classList.remove('empty'); if (!b.textContent) b.textContent = '3';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const q = b.getBoundingClientRect();
      return { x: Math.floor(q.left) - 1, y: Math.floor(q.top) - 1, width: Math.ceil(q.width) + 3, height: Math.ceil(q.height) + 3 };
    }, css);
    return box ? (await p.screenshot({ clip: box })).toString('base64') : null;
  };
  const shotNow = await badgeShot('');
  const shotOld = await badgeShot('#topbar #btnPause, #topbar #btnMenu { position: static !important; } #topbar #btnPause::after, #topbar #btnMenu::after { display: none !important; }');
  const shotCut = await badgeShot('#topbar #deckBtn .dkBadge { z-index: auto !important; }');
  await badgeShot('');
  ck(`theDeckCountKeepsItsRing_${ph.k}`, !!shotNow && shotNow === shotOld,
    shotNow ? (shotNow === shotOld ? 'the badge reads as it does with Pause static' : 'Pause is drawn over the badge') : 'no badge on the deck button');
  ck(`andTheProbeCanSeeACutRing_${ph.k}`, !!shotNow && shotCut !== shotNow, 'with the badge left under Pause, its box differs: ' + (shotCut !== shotNow));
  /* …and A TAP THAT OPENS THE PANEL KEEPS IT. A villager stands in the tab's
     own column, 8px above where its panel will lift the tab; a real touch tap
     selects it, the panel rises under the finger, and the click the browser
     sends after the tap must land on the world, not on the tab. The control
     gives the OPEN tab the folded tab's reach and must see the click taken. */
  const ghost = async (withReach) => {
    const g = await p.evaluate(async (withReach) => {
      const sl = ms => new Promise(r => setTimeout(r, ms));
      const old = document.getElementById('openReach'); if (old) old.remove();
      if (withReach) {
        const st = document.createElement('style'); st.id = 'openReach';
        st.textContent = '#bmToggle::before{content:"";position:absolute;left:-1px;right:-1px;top:-17px;bottom:-6px}';
        document.head.appendChild(st);
      }
      const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
      // a clear tile mid-map, lit, so the camera can put the villager anywhere on the glass
      S.map.explored.fill(1); G.freeVis = true; G.updateVisibility();
      const s = MapGen.findNear(CFG.W >> 1, CFG.H >> 1, 14, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)
        && !S.units.some(u => u !== v && Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 2));
      v.x = s.x + 0.5; v.y = s.y + 0.5; v.task = null; v.path = null;
      UI.select('unit', v.id); await sl(150);
      const tb = document.getElementById('bmToggle').getBoundingClientRect();
      const sx = Math.round(tb.left + tb.width / 2), sy = Math.floor(tb.top) - 8;
      UI.deselect(); UI.setMenuCollapsed(true); await sl(120);
      const TL = CFG.TILE, z = R.cam.z;
      R.cam.x = v.x * TL - sx / z; R.cam.y = (v.y * TL - CFG.SPRITE_LIFT) - sy / z;
      await sl(150);
      return { sx, sy, vid: v.id, camOk: Math.abs(((v.y * TL - CFG.SPRITE_LIFT) - R.cam.y) * z - sy) < 2 };
    }, withReach);
    await p.touchscreen.tap(g.sx, g.sy);
    await p.waitForTimeout(350);
    return Object.assign(g, await p.evaluate((vid) => {
      const o = { selected: !!(UI.sel && UI.sel.id === vid), panelUp: document.getElementById('panel').classList.contains('show') && !UI.panelHidden,
        sel: UI.sel ? UI.sel.type + ' ' + UI.sel.id : 'nothing' };
      const st = document.getElementById('openReach'); if (st) st.remove();
      UI.deselect(); UI.setMenuCollapsed(true);
      return o;
    }, g.vid));
  };
  /* Only a tap that SELECTED the villager says anything: on a crowded host a
     main-thread stall between finger-down and finger-up turns the tap into a
     hold, which selects nothing (the game's own tap rule), so it is tried
     again, up to four times. */
  const tries = async (withReach) => { let g; for (let i = 1; i <= 4; i++) { g = await ghost(withReach); g.tries = i; if (g.selected) break; } return g; };
  const g0 = await tries(false), g1 = await tries(true);
  ck(`aTapThatOpensThePanelKeepsIt_${ph.k}`, g0.camOk && g0.selected && g0.panelUp,
    `a villager tapped at (${g0.sx}, ${g0.sy}), 8px above where its panel lifts the tab: selected ${g0.selected} (${g0.sel}, camera placed ${g0.camOk}, tap ${g0.tries}), panel still up ${g0.panelUp}`);
  ck(`andTheProbeCanSeeTheClickTaken_${ph.k}`, g1.camOk && g1.selected && !g1.panelUp,
    `with the folded tab's reach given to the open tab, the same tap: selected ${g1.selected} (${g1.sel}, camera placed ${g1.camOk}, tap ${g1.tries}), panel still up ${g1.panelUp} (it must be hidden)`);
  ck(`theTargetsThrewNothing_${ph.k}`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
await b.close();
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL DESKTOP-LAYOUT CHECKS PASS');
