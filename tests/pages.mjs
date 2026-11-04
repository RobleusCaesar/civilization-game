/* THE LOAD AND GUIDE PAGES — the contract for js/pages.js and the slot
   wiring it shares with js/screens.js (Screens.onLoad / _slotCard).

   The operator, 2026-11-04: "Update the design of the Load and Guide pages
   so they match the high quality design of the settings page and the card
   announcement modal."

   1. THE LOAD PAGE IS DRESSED AND KEEPS ITS DOORS: the settings page's
      header and carved frame round the same ids (#loadBack, #loadTitle,
      #slotList, #btnImportFile, #fileLoad); five slots, each a carved card —
      the save's picture, its name, "Day N · Landform · 1h 30m", a Victory or
      Fallen mark — with Load as the green plaque, rename and delete as
      vector icon plaques; empty slots say so; no emoji anywhere.
   2. EVERY ACT STILL ACTS: Load opens the slot, rename renames, delete asks
      once (the plaque turns red, "Delete?") and deletes on the second tap,
      the import opens the file picker; from the pause menu the page is
      "Save game", with Overwrite and Save here.
   3. THE GUIDE PAGES LIKE THE ANNOUNCEMENT: twelve pages, each its picture
      in a gold medallion, a gold heading over the announcement's rule; BACK,
      the NEXT plaque and a dot per page; NEXT and the arrow keys turn the
      page, a dot jumps to it, the last page's plaque reads Done and goes
      back; it always opens on the first page.
   4. THE NIGHT FROM THE TITLE, THE GAME FROM THE PAUSE MENU.
   5. THE PICTURES ARE WITHIN THEIR PIXELS AND NOT FETCHED AT BOOT: the guide's
      art is the Scale2x 256px files, lazy, never asked for until the Guide
      opens; every raster is at or under its own pixels on a 3x screen; the
      ornaments are vectors.
   6. IT FITS from 320 to 1440 wide, a phone on its side included: nothing
      off the page, no word cut short, every guide page whole at 390x844 and
      on a desktop.

     node tests/pages.mjs      # exits non-zero on any regression */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

// a cloud with three saves (one won) and two empty slots; every call recorded
const MOCK = `
  window.__MOCK = (() => {
    const st = { uid: 'mock-uid-0001', calls: [] };
    const session = () => ({ access_token: 't', refresh_token: 'r', user: { id: st.uid } });
    const auth = { async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: session() }, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; } };
    const rows = [
      { slot: 1, name: 'Ashford by the lake', game_version: '2', day: 142, map_seed: '1', landform: 'lakeland', playtime_seconds: 5400, thumbnail: null, updated_at: '2026-11-03T20:00:00Z', over: null },
      { slot: 2, name: 'Stormhold', game_version: '2', day: 61, map_seed: '2', landform: 'highlands', playtime_seconds: 2280, thumbnail: null, updated_at: '2026-11-02T20:00:00Z', over: null },
      { slot: 4, name: 'The long winter', game_version: '2', day: 214, map_seed: '3', landform: 'valley', playtime_seconds: 9300, thumbnail: null, updated_at: '2026-10-30T20:00:00Z', over: { win: true } },
    ];
    const rest = (method, path, body) => {
      st.calls.push({ method, path, body });
      if (path.startsWith('/saves') && method === 'GET') return rows.map(r => Object.assign({}, r, { thumbnail: window.__THUMB || null }));
      if (path.startsWith('/profiles') && method === 'GET') return [{ id: st.uid, arcade_name: 'MOSSY' }];
      return method === 'GET' ? [] : null;
    };
    window.__NEO_BACKEND_MOCK = { auth, rest };
    return st;
  })();
`;
const errs = [];
const boot = async (vp, reqs) => {
  const p = await b.newPage({ viewport: vp ? { width: vp[0], height: vp[1] } : { width: 390, height: 844 }, deviceScaleFactor: (vp && vp[2]) || 1 });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
  if (reqs) p.on('request', r => reqs.push(r.url()));
  await p.addInitScript(MOCK);
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Boot && Boot.done, null, { timeout: 30000 });
  await p.waitForFunction(() => Backend.isReady(), null, { timeout: 5000 });
  await p.evaluate(() => { try { R.drawMini && R.drawMini(); } catch (e) {} window.__THUMB = R.thumb ? R.thumb() : null; });
  return p;
};
const openLoad = async (p, save) => {
  await p.evaluate(sv => {
    if (sv) { G.newGame('pages', 'moderate', 'medium'); Screens._demo = false; Screens.show('paused'); Screens.backTo = 'paused'; Screens.show('load', { saveMode: true }); }
    else { Screens.backTo = 'title'; Screens.show('load'); }
  }, !!save);
  await p.waitForFunction(() => document.querySelectorAll('#slotList .scard').length === 5, null, { timeout: 5000 });
};
const openGuide = async (p, from) => {
  await p.evaluate(f => { Screens.backTo = f || 'title'; Screens.show('howto'); }, from);
  await p.waitForFunction(() => document.querySelector('#scrHowto.pg .pgNext'), null, { timeout: 5000 });
};
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{1F000}-\u{1F2FF}]/u;

// ---- 0. nothing of the guide is fetched before it is opened ----
{
  const reqs = [];
  const p = await boot(null, reqs);
  await p.waitForTimeout(600);
  const before = reqs.filter(u => /assets\/ui\/guide\//.test(u)).length;
  await openGuide(p);
  await p.waitForFunction(() => { const i = document.querySelector('#howPanels .gart'); return i && i.complete && i.naturalWidth; }, null, { timeout: 5000 });
  const after = reqs.filter(u => /assets\/ui\/guide\//.test(u));
  ck('theGuidesPicturesWaitForTheGuide', before === 0 && after.length > 0 && after.every(u => /-2x\.png/.test(u)),
    `${before} guide pictures asked for at boot; ${after.length} once it opened (${[...new Set(after.map(u => u.split('/').pop().split('?')[0]))].slice(0, 3).join(' ')}…)`);
  await p.close();
}

// ---- 1. the Load page is dressed and keeps its doors ----
{
  const p = await boot();
  await openLoad(p);
  const a = await p.evaluate(() => {
    const scr = document.getElementById('scrLoad'), L = document.getElementById('slotList');
    const cards = [...L.querySelectorAll('.scard')];
    const one = c => ({ name: (c.querySelector('.smeta > b') || {}).textContent, sub: (c.querySelector('.smeta small') || {}).textContent,
      img: !!c.querySelector('.pgThumb img'), load: [...c.querySelectorAll('.abtn')].filter(x => /^Load$/i.test(x.textContent.trim())).map(x => x.className).join(),
      icons: [...c.querySelectorAll('.abtn.pgIcon')].map(x => x.getAttribute('aria-label') + (x.querySelector('svg') ? ':svg' : '')).join(','),
      empty: c.classList.contains('empty') });
    return { pg: scr.classList.contains('pg'), backIn: !!scr.querySelector('.pgHead #loadBack'), title: document.getElementById('loadTitle').textContent,
      titleIn: !!scr.querySelector('.pgHead #loadTitle'), frame: !!scr.querySelector('.pgFrame #slotList'), corners: scr.querySelectorAll('.pgC svg').length,
      imp: !!scr.querySelector('.pgFrame #btnImportFile') && !!scr.querySelector('.pgFrame #fileLoad'), impText: document.getElementById('btnImportFile').textContent.trim(),
      cards: cards.map(one), emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(scr.textContent) };
  });
  const c1 = a.cards[0], c3 = a.cards[2], c4 = a.cards[3];
  ck('theLoadPageWearsTheSettingsChromeRoundItsOwnIds', a.pg && a.backIn && a.titleIn && a.title === 'Load game' && a.frame && a.imp && a.corners === 4 && a.impText === 'Import a save file',
    `dressed ${a.pg}; back ${a.backIn}, title "${a.title}", list in the frame ${a.frame}, import ${a.imp} ("${a.impText}"), ${a.corners} corners`);
  ck('aSlotIsItsPictureNameAndOneLine', a.cards.length === 5 && /Ashford by the lake/i.test(c1.name) && c1.sub === 'Day 142 · Lakeland · 1h 30m' && c1.img &&
    /gold/.test(c1.load) && c1.icons === 'Rename:svg,Delete:svg' && /Victory/.test(c4.name) && c3.empty && /Empty slot/.test(c3.name),
    `${a.cards.length} slots; "${c1.name}" / "${c1.sub}"; picture ${c1.img}; Load ${c1.load}; icons ${c1.icons}; slot 4 "${c4.name}"; slot 3 "${c3.name}"`);
  ck('andNoEmojiStandsInForAnIcon', !a.emoji, a.emoji ? 'an emoji on the page' : 'vector icons only');
  // the acts
  const acts = await p.evaluate(async () => {
    const card = n => document.querySelectorAll('#slotList .scard')[n];
    const got = {};
    const fetchSlot = Screens._fetchSlot;
    Screens._fetchSlot = async s => { got.load = s; return { stale: true }; };
    [...card(1).querySelectorAll('.abtn')].find(x => /^Load$/i.test(x.textContent.trim())).click();
    await new Promise(r => setTimeout(r, 50));
    Screens._fetchSlot = fetchSlot; Screens._continuing = false;
    const ren = Backend.renameSlot, del = Backend.deleteSlot, pr = window.prompt;
    Backend.renameSlot = async (s, n) => { got.rename = s + ':' + n; return { ok: true }; };
    Backend.deleteSlot = async s => { (got.del = got.del || []).push(s); return { ok: true }; };
    window.prompt = () => 'New name';
    card(0).querySelector('[data-act="rename"]').click();
    await new Promise(r => setTimeout(r, 50));
    for (let i = 0; i < 50 && document.querySelectorAll('#slotList .scard').length !== 5; i++) await new Promise(r => setTimeout(r, 20));
    const d = card(0).querySelector('[data-act="del"]');
    d.click();
    await new Promise(r => setTimeout(r, 30));
    got.armed = d.classList.contains('danger') + ':' + d.textContent.trim() + ':' + (got.del ? got.del.length : 0);
    d.click();
    await new Promise(r => setTimeout(r, 50));
    Backend.renameSlot = ren; Backend.deleteSlot = del; window.prompt = pr;
    const f = document.getElementById('fileLoad'), fc = f.click;
    f.click = () => { got.file = true; };
    document.getElementById('btnImportFile').click();
    f.click = fc;
    return got;
  });
  ck('everyActStillActs', acts.load === 2 && acts.rename === '1:New name' && acts.armed === 'true:Delete?:0' && acts.del && acts.del.join() === '1' && acts.file === true,
    `Load → slot ${acts.load}; rename ${acts.rename}; first delete tap ${acts.armed} (danger:label:deleted); then deleted ${acts.del}; import opens the picker ${acts.file}`);
  await p.close();
}
// from the pause menu: Save game, Overwrite and Save here
{
  const p = await boot();
  await openLoad(p, true);
  const s = await p.evaluate(() => ({ title: document.getElementById('loadTitle').textContent,
    over: document.querySelectorAll('#slotList [data-act="overwrite"]').length, here: document.querySelectorAll('#slotList [data-act="save"]').length,
    load: document.querySelectorAll('#slotList [data-act="load"]').length, night: Screens.nightUp() }));
  ck('fromThePauseMenuItIsSaveGame', s.title === 'Save game' && s.over === 3 && s.here === 2 && s.load === 0,
    `"${s.title}": ${s.over} Overwrite, ${s.here} Save here, ${s.load} Load`);
  ck('andTheGameStaysBehindIt', s.night === false, `night ${s.night}`);
  await p.close();
}

// ---- 3–4. the guide ----
{
  const p = await boot();
  await openGuide(p);
  const g = await p.evaluate(async () => {
    const P = document.getElementById('howPanels'), scr = document.getElementById('scrHowto');
    const state = () => ({ at: Math.round(P.scrollLeft / P.clientWidth), dot: [...document.querySelectorAll('#howDots .pgDot')].findIndex(d => d.classList.contains('on')),
      back: !scr.querySelector('.pgPrev').classList.contains('gone'), next: scr.querySelector('.pgNextL').textContent });
    // a smooth scroll: give it time to start, then wait until it stands still on a page
    const settle = async () => { await new Promise(r => setTimeout(r, 200)); let last = -1;
      for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 40)); const x = P.scrollLeft; if (x === last && Math.abs(x / P.clientWidth - Math.round(x / P.clientWidth)) < 0.01) break; last = x; } };
    const pages = [...P.querySelectorAll('.gpage')];
    const each = pages.map(pg => ({ med: !!pg.querySelector('.gmed .gart'), h: !!pg.querySelector('h3 + .grule'), lazy: (pg.querySelector('.gart') || {}).loading }));
    const out = { n: pages.length, each, dots: document.querySelectorAll('#howDots .pgDot').length, night: Screens.nightUp(), start: state() };
    scr.querySelector('.pgNext').click(); await settle(); out.next = state();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); await settle(); out.key = state();
    scr.querySelector('.pgPrev').click(); await settle(); out.prev = state();
    document.querySelectorAll('#howDots .pgDot')[11].click(); await settle(); out.last = state();
    scr.querySelector('.pgNext').click(); await new Promise(r => setTimeout(r, 60)); out.done = Screens.current;
    Screens.backTo = 'title'; Screens.show('howto'); await new Promise(r => setTimeout(r, 60)); out.again = state();
    return out;
  });
  ck('twelvePagesEachAMedallionAndARule', g.n === 12 && g.dots === 12 && g.each.every(e => e.med && e.h && e.lazy === 'lazy'),
    `${g.n} pages, ${g.dots} dots; ${g.each.filter(e => e.med && e.h).length} with medallion and rule, ${g.each.filter(e => e.lazy === 'lazy').length} lazy`);
  ck('nextArrowsBackAndADotTurnThePage', g.start.at === 0 && g.start.dot === 0 && !g.start.back && g.start.next === 'Next' &&
    g.next.at === 1 && g.next.dot === 1 && g.next.back && g.key.at === 2 && g.prev.at === 1 && g.last.at === 11 && g.last.dot === 11 && g.last.next === 'Done',
    `start ${JSON.stringify(g.start)}; next → ${g.next.at}; → key ${g.key.at}; back → ${g.prev.at}; dot 12 → ${g.last.at} reads "${g.last.next}"`);
  ck('theLastPlaqueGoesBackAndItOpensOnPageOne', g.done === 'title' && g.again.at === 0 && g.again.dot === 0, `Done → ${g.done}; reopened at page ${g.again.at + 1}`);
  ck('theNightStandsBehindItFromTheTitle', g.night === true, `night ${g.night}`);
  await p.evaluate(() => { G.newGame('pages2', 'moderate', 'medium'); Screens._demo = false; Screens.show('paused'); });
  await openGuide(p, 'paused');
  const nightPaused = await p.evaluate(() => Screens.nightUp());
  ck('andTheGameFromThePauseMenu', nightPaused === false, `night ${nightPaused}`);
  await p.close();
}

// ---- 5–6. within their pixels, vector chrome, and it fits ----
for (const [w, h, dsf] of [[320, 568, 3], [390, 844, 3], [430, 932, 3], [844, 390, 3], [667, 375, 3], [1440, 900, 1]]) {
  const p = await boot([w, h, dsf]);
  const out = [];
  for (const page of ['load', 'howto']) {
    if (page === 'load') await openLoad(p); else await openGuide(p);
    // a lazy picture on a page not yet turned to never loads: wait for what is shown, a little while at most
    await p.evaluate(() => Promise.race([new Promise(r => setTimeout(r, 2500)),
      Promise.all([...document.querySelectorAll('.screen.show img')].filter(i => i.loading !== 'lazy' || i.getBoundingClientRect().right > 0 && i.getBoundingClientRect().left < innerWidth)
        .map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))]));
    const m = await p.evaluate(guide => {
      const scr = document.querySelector('.screen.show'), W = document.documentElement.clientWidth, bad = [];
      for (const i of scr.querySelectorAll('img')) {
        if (!i.naturalWidth || i.closest('.pgThumb')) continue;          // a save's own picture is the save's, not chrome
        const r = i.getBoundingClientRect();
        if (r.width && r.width * 3 > i.naturalWidth + 0.5) bad.push(i.src.split('/').pop().split('?')[0] + ' ' + r.width.toFixed(0) + 'px of ' + i.naturalWidth);
        if (getComputedStyle(i).imageRendering === 'pixelated') bad.push(i.className + ' asks for pixelated drawing');
      }
      const over = [];
      // the guide's other pages stand off to the side by design: measure the page on show
      const P = document.getElementById('howPanels'), at = P ? Math.round(P.scrollLeft / Math.max(1, P.clientWidth)) : 0;
      const shown = guide ? P.children[at] : null;
      for (const el of scr.querySelectorAll('.pgTitle, .pgSlot, .smeta > b, .abtn, .pgFrame, .gpage, .pgNav, #howDots, .pgImport')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (guide && el.closest('#howPanels > section') && el.closest('#howPanels > section') !== shown) continue;
        if (r.right > W + 0.5 || r.left < -0.5) over.push((el.className || el.id) + ' off the page');
        if (!el.classList.contains('pgFrame') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis' &&
          !el.querySelector('[style*="ellipsis"], .pgNm')) over.push((el.className || el.id) + ' cut: ' + el.textContent.trim().slice(0, 18));
      }
      const dots = [...scr.querySelectorAll('#howDots .pgDot')].map(d => Math.round(d.getBoundingClientRect().top));
      if (guide && new Set(dots).size > 1) over.push('the dots run onto two rows');
      // every guide page whole (no scroll inside a page) where there is room for it
      const cut = guide ? [...scr.querySelectorAll('#howPanels > section')].filter(s => s.scrollHeight > s.clientHeight + 1).length : 0;
      const vec = scr.querySelectorAll('.pgBack svg, .pgC svg').length;
      return { bad, over, cut, vec, hscroll: document.documentElement.scrollWidth > W + 1 };
    }, page === 'howto');
    const roomy = (w >= 390 && h >= 800) || w >= 1000;
    out.push(`${page}: ${m.bad.length + m.over.length + (m.hscroll ? 1 : 0)} faults${page === 'howto' ? ', ' + m.cut + ' pages scroll' : ''}`);
    ck(`theRastersAreWithinTheirPixelsAndTheOrnamentsVectors_${page}_${w}x${h}`, m.bad.length === 0 && m.vec >= 5, m.bad.join(' | ') || `${m.vec} vector ornaments`);
    ck(`andItFits_${page}_${w}x${h}`, m.over.length === 0 && !m.hscroll && (page !== 'howto' || !roomy || m.cut === 0),
      m.over.join(' | ') || (m.hscroll ? 'the page scrolls sideways' : page === 'howto' ? `${m.cut} of 12 pages scroll inside` : 'fits'));
  }
  await p.close();
}

await b.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL PAGES CHECKS PASS');
console.log('errors:', errs);
if (fails.length || errs.length) process.exit(1);
