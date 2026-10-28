/* THE NIGHT TITLE — the contract for js/titlescreen.js and the boot block's
   Boot.t2* helpers in index.html (the operator: "the buttons are kind of
   bland, pixelated… the background also feels a bit bland… something
   closer to the quality of the Victory and Loss pages… versions for phone
   and desktop… push to the cards test page").

   1. STAGED, BOTH WAYS. One predicate, TitleScreen.live() = TITLE_PUBLIC ||
      Deck.devOn(). The boot block reads the same answer before the first
      paint (Boot.title2) — the same reading of the link and the storage,
      never a write — and the two agree in every case (?cards=1 / all / 0,
      a remembered flag, a storage that throws). A device the card test link
      never touched keeps today's title: its markup and its stylesheet byte
      for byte (hashes of the blocks as they stood at f2a1c59), no class, no
      element, no stylesheet, and not one request for the night's art.
      Flipping TITLE_PUBLIC alone gives every device the night.
   2. THE ART LANDS BY FILENAME, AND STANDS DOWN QUIETLY. assets/ui/title/
      night-{wide,tall}.{webp,jpg}: a whole-factor nearest-neighbour
      enlargement of each PixelLab master (3x wide, 2x tall), lossless webp
      under 100 KB with a jpg behind it; every URL carries the hand-kept
      ?v= that must equal CFG.ART_V (the glen's rule). A landscape window
      takes the wide valley, a portrait one the tall. With the art missing
      the glen comes back under the new plaques, the splash still lifts, and
      nothing throws.
   3. THE SPLASH IS THE TITLE'S OWN SCENE. On a staged device the splash
      wears the night (the same file, box, fit and shade), the lift waits
      for it, and the title with its chrome hidden is the splash, pixel for
      pixel — the lift adds the logo and the plaques and nothing else.
   4. THE CHROME IS DRAWN AT THE DEVICE'S OWN RESOLUTION. Every plaque wears
      a vector frame built to its own box, every icon is a vector with no
      crisp-edged stepping, no pixel icon shows, and every raster on the
      title but the backdrop (scene art) is shown at or below its own pixels
      on a 3x screen (CSS size x 3 <= natural size). The backdrop is never
      drawn nearest-neighbour on a 1x screen. The probe is shown it can see a
      blow-up.
   5. EVERY LABEL FITS ITS PLAQUE at 320/359/360/375/390/430 — one line, inside
      the plaque's inner box — and every plaque is a 44px target.
   6. IT FITS at 375x667, 390x844@3, 430x932@3, 844x390@3, 768x1024@2,
      1440x900@1 and 1920x1080@1: no sideways scroll, nothing scrolls, the
      logo and every plaque inside the window, the logo clear of the menu,
      the right picture for the window, and the campfire's light never under
      a plaque on a phone.
   7. THE PLAQUES BEHAVE: New Game is the gold plate, a press sends a plaque
      2px down into its frame, Continue's "no saves yet" sits flat and stays
      legible, the pause menu's plaques are untouched, and a player who asks
      for less motion gets no embers.

   Run after touching: index.html's boot block (Boot.title2 / t2*), the title
   markup or its CSS, js/titlescreen.js, Screens.onTitle, G.titleGlenUp, or
   assets/ui/title/.

     node tests/title.mjs      # exits non-zero on any regression */
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

const html = readFileSync(join(root, 'index.html'), 'utf8');
const ART_V = +readFileSync(join(root, 'js/config.js'), 'utf8').match(/ART_V:\s*(\d+)/)[1];
const sha = s => createHash('sha256').update(s).digest('hex');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i + 1); return i >= 0 && j > i ? html.slice(i, j) : ''; };

/* ---- 1a. the old title, byte for byte (the source) ---- */
{
  // each block as it stood at f2a1c59, the build the night title was staged on;
  // a change here is a change for every player, not just the staged ones
  const OLD = {
    splash: ['<div id="splash"', '<script>', '214f1fc380b4e5884fcabdbdb2891dccb324cc0c0e4c8a385d0ff9e6c8139963'],
    title: ['  <div class="screen" id="scrTitle">', '  <div class="screen" id="scrNewgame">', '5efc0376de6094616fb265e108c21d192f057d5c00edb61fc5e6bf6438d7ce22'],
    css: ['  /* ---- title: the painted glen ----', '  /* desktop: the wordmark scales with the viewport', '802eb11d67543888ab1598d0d25f65310bc22cc891148c7e1cc0ba234547a8be'],
    short: ['  /* short viewports (landscape phones): compact so nothing clips */', '  /* AUDIO ROWS', '4e2ff9ada9ad8237e96f36e8f37751667ca8b3e4c1aa6e90ae0ec7641df0406d'],
  };
  const moved = Object.entries(OLD).filter(([, [a, b, h]]) => sha(cut(a, b)) !== h).map(([k]) => k);
  ck('theOldTitleIsByteForByte', moved.length === 0,
    moved.length ? 'changed: ' + moved.join(', ') : 'the splash, the title markup and its two stylesheet blocks, as at f2a1c59');
  const read = f => { try { return readFileSync(join(root, f), 'utf8'); } catch (e) { return ''; } };
  const src = read('js/titlescreen.js');
  const scr = readFileSync(join(root, 'js/screens.js'), 'utf8');
  const tag = html.match(/<script src="js\/titlescreen\.js\?v=(\d+)"><\/script>/);
  const codeV = +html.match(/js\/config\.js\?v=(\d+)/)[1];
  ck('theGateIsOnePredicate',
    (html.match(/TITLE_PUBLIC:\s*false,/g) || []).length === 1 &&
    (src.match(/Deck\.devOn\(\)/g) || []).length === 1 && /Boot\.TITLE_PUBLIC/.test(src) &&
    /TitleScreen\.onTitle\(\)/.test(scr) && !!tag && +tag[1] === codeV,
    'TitleScreen.live(): Boot.TITLE_PUBLIC || Deck.devOn() — flip TITLE_PUBLIC in index.html to go public');
  /* THE NIGHT'S URLS ARE MARKUP IN ALL BUT NAME: built by the boot block
     before any script file has parsed, so nothing stamps them — the ?v= is
     hand-kept, exactly like the glen's, and must equal CFG.ART_V */
  const urls = html.match(/assets\/ui\/title\/[a-z0-9-]+\.(?:webp|jpg)(?:\?v=\d+)?/g) || [];
  const bad = urls.filter(u => !u.includes('?v=') || +u.split('?v=')[1] !== ART_V);
  ck('theNightCarriesTheArtVersion', urls.length >= 4 && bad.length === 0,
    urls.length + ' night urls, CFG.ART_V=' + ART_V + (bad.length ? ' — unstamped or stale: ' + bad.join(' ') : ''));
  ck('theNightLandsByFilename',
    ['night-wide.webp', 'night-wide.jpg', 'night-tall.webp', 'night-tall.jpg'].every(f => urls.some(u => u.startsWith('assets/ui/title/' + f))) &&
    /\(min-aspect-ratio: 4\/3\)/.test(cut('T2_SRC', 'T2_IMG')),
    'assets/ui/title/night-{wide,tall}.{webp,jpg}; a landscape window takes the wide');
  /* served light, and lossless: the webp is the boot's weight on a staged device */
  const meta = f => {
    let b; try { b = readFileSync(join(root, 'assets/ui/title', f)); } catch (e) { return { bytes: Infinity, w: 0, h: 0, lossless: false }; }
    if (f.endsWith('.webp')) {
      const kind = b.slice(12, 16).toString(), x = b.indexOf('VP8L');
      const bits = x >= 0 ? b.readUInt32LE(x + 9) : 0;
      return { bytes: b.length, lossless: x >= 0, w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, kind };
    }
    let i = 2, w = 0, h = 0;
    while (i < b.length) { const m = b[i + 1], L = b.readUInt16BE(i + 2); if (m === 0xc0 || m === 0xc2) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + L; }
    return { bytes: b.length, w, h };
  };
  const W = meta('night-wide.webp'), T = meta('night-tall.webp'), WJ = meta('night-wide.jpg'), TJ = meta('night-tall.jpg');
  ck('theArtShipsAtItsSizes',
    W.lossless && T.lossless && W.w === 688 * 3 && W.h === 384 * 3 && T.w === 384 * 2 && T.h === 688 * 2 &&
    WJ.w === W.w && WJ.h === W.h && TJ.w === T.w && TJ.h === T.h,
    `wide ${W.w}x${W.h} (3x 688x384), tall ${T.w}x${T.h} (2x 384x688), lossless webp, jpgs the same size`);
  ck('andItIsServedLight', W.bytes < 100 * 1024 && T.bytes < 100 * 1024 && WJ.bytes < 320 * 1024 && TJ.bytes < 320 * 1024,
    `webp ${Math.round(W.bytes / 1024)} / ${Math.round(T.bytes / 1024)} KB, jpg ${Math.round(WJ.bytes / 1024)} / ${Math.round(TJ.bytes / 1024)} KB`);
}

/* ---- the page, served over HTTP (a route can take the art away) ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = createServer(async (rq, rs) => {
  try {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    const f = join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
    if (!f.startsWith(root)) { rs.writeHead(403); rs.end(); return; }
    const body = await readFile(f);
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    rs.end(body);
  } catch (e) { rs.writeHead(404); rs.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
const b = await pw.chromium.launch();
const errs = [];
/* opts: q (query), vp, dpr, store (localStorage seed), init (script), route (fn(ctx)), hold (gate the lift), reduced */
const open = async (opts) => {
  opts = opts || {};
  const vp = opts.vp || [390, 844], dpr = opts.dpr || 1;
  const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: dpr,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((seed) => {
    try {
      if (!sessionStorage.getItem('ti-once')) {
        localStorage.clear();
        localStorage.setItem('neo-cards-intro', '1');   // the card announcement would stand over the title
        for (const k in seed) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('ti-once', '1');
      }
    } catch (e) {}
  }, opts.store || {});
  if (opts.hold) await ctx.addInitScript(() => {
    let real;
    window.__bootGate = true;
    Object.defineProperty(window, 'Boot', { configurable: true, get() { return real; }, set(v) {
      real = v;
      const mr = v.markReady;
      v.markReady = function () { if (window.__bootGate) return; return mr.apply(this, arguments); };
    } });
  });
  if (opts.init) await ctx.addInitScript(opts.init);
  if (opts.route) await opts.route(ctx);
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', r => reqs.push(r.url()));
  p.on('pageerror', e => { if (!/supabase|fetch|TUNNEL|net::/.test(String(e))) errs.push((opts.tag || '') + ': ' + String(e)); });
  await p.goto(base + (opts.q || ''), { waitUntil: opts.hold ? 'commit' : 'load' });
  if (!opts.hold) {
    await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Boot && Boot.done && !document.getElementById('splash'), null, { timeout: 30000 });
    await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 });
    await p.waitForFunction(() => [...document.querySelectorAll('#scrTitle img')].every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  return { ctx, p, reqs };
};
const state = p => p.evaluate(() => ({
  title2: !!(window.Boot && Boot.title2),
  live: !!(window.TitleScreen && TitleScreen.live()),
  dev: !!(window.Deck && Deck.devOn()),
  t2: document.getElementById('scrTitle').classList.contains('t2'),
  css: !!document.getElementById('t2css'),
  frames: document.querySelectorAll('#scrTitle .t2f').length,
  icons: document.querySelectorAll('#scrTitle .t2i').length,
  night: !!document.querySelector('#scrTitle img.t2img'),
  tbgStyle: document.querySelector('#scrTitle .tbg').getAttribute('style'),
  oldVis: getComputedStyle(document.querySelector('#scrTitle .tbg img:not(.t2img)')).visibility,
}));
const nightReqs = reqs => reqs.filter(u => /assets\/ui\/title\//.test(u)).map(u => u.replace(/^.*assets\//, '').replace(/\?.*$/, ''));

/* ---- 1b. STAGED BOTH WAYS, in the live page ---- */
{
  // a device the card test link never touched: today's title, and not one byte of the night
  const u = await open({ tag: 'plain' });
  const s = await state(u.p);
  const nr = nightReqs(u.reqs);
  ck('anUnstagedDeviceKeepsTodaysTitle',
    !s.title2 && !s.live && !s.t2 && !s.css && s.frames === 0 && s.icons === 0 && !s.night && s.tbgStyle === null && s.oldVis === 'visible',
    JSON.stringify(s));
  ck('andFetchesNothingOfTheNight', nr.length === 0, nr.length ? 'fetched ' + nr.join(' ') : 'no request under assets/ui/title/');
  await u.ctx.close();
  // the card test link: the night, its plaques, its art
  const st = await open({ q: '?cards=1', tag: 'staged' });
  const s2 = await state(st.p);
  ck('theCardTestLinkWearsTheNight',
    s2.title2 && s2.live && s2.dev && s2.t2 && s2.css && s2.night && s2.frames >= 7 && s2.icons >= 7 && s2.oldVis === 'hidden',
    JSON.stringify(s2));
  ck('andFetchesOnlyThePictureItWears', nightReqs(st.reqs).join() === 'ui/title/night-tall.webp',
    nightReqs(st.reqs).join(' ') || 'nothing');
  await st.ctx.close();
}
{
  /* THE SPLASH'S ANSWER IS DECK'S ANSWER, in every case the link and the
     storage can make — read before the first paint, without a write */
  const CASES = [
    ['', {}, false, 'nothing'],
    ['?cards=1', {}, true, '?cards=1'],
    ['?cards=all', {}, true, '?cards=all'],
    ['', { 'neo-cards-dev': '1' }, true, 'the remembered flag'],
    ['?cards=0', { 'neo-cards-dev': '1' }, false, '?cards=0 over the flag'],
    ['?cards=1&cards=0', {}, false, '?cards=1&cards=0'],
  ];
  const bad = [];
  for (const [q, store, want, name] of CASES) {
    const o = await open({ q, store, tag: 'case ' + name });
    const s = await state(o.p);
    if (s.title2 !== want || s.live !== want || s.dev !== want || s.t2 !== want) bad.push(name + ': ' + JSON.stringify({ title2: s.title2, live: s.live, dev: s.dev, t2: s.t2 }));
    await o.ctx.close();
  }
  // a storage that throws (iOS Block All Cookies): the link still stages, nothing else does
  const throwing = () => { Storage.prototype.getItem = function () { throw new Error('blocked'); }; Storage.prototype.setItem = function () { throw new Error('blocked'); }; };
  for (const [q, want] of [['?cards=1', true], ['', false]]) {
    const o = await open({ q, init: throwing, tag: 'throwing' + q });
    const s = await state(o.p);
    if (s.title2 !== want || s.live !== want || s.t2 !== want) bad.push('throwing storage ' + (q || '(none)') + ': ' + JSON.stringify(s));
    await o.ctx.close();
  }
  ck('theSplashReadsDecksAnswerInEveryCase', bad.length === 0, bad.join(' | ') || CASES.length + 2 + ' cases, Boot.title2 === TitleScreen.live() === Deck.devOn()');
}
{
  /* GOING PUBLIC IS ONE LINE: the page served with TITLE_PUBLIC flipped,
     and nothing else, gives a device with no flag the night */
  const o = await open({ tag: 'public', route: ctx => ctx.route('**/index.html*', async r => {
    const body = html.replace('TITLE_PUBLIC: false,', 'TITLE_PUBLIC: true,');
    await r.fulfill({ status: 200, contentType: 'text/html', body });
  }) });
  const s = await state(o.p);
  ck('flippingTitlePublicIsTheWholeChange', s.title2 && s.live && !s.dev && s.t2 && s.night && s.frames >= 6,
    JSON.stringify({ title2: s.title2, live: s.live, dev: s.dev, t2: s.t2, frames: s.frames }));
  await o.ctx.close();
}

/* ---- 2. A PAINTER STANDS DOWN: the night missing, the glen comes back ---- */
{
  const o = await open({ q: '?cards=1', tag: 'lost', route: ctx => ctx.route('**/assets/ui/title/**', r => r.fulfill({ status: 404, body: '' })) });
  const r = await o.p.evaluate(() => ({
    lifted: Boot.done && !document.getElementById('splash'),
    night: !!document.querySelector('#scrTitle img.t2img'),
    lost: document.querySelector('#scrTitle .tbg').classList.contains('t2lost'),
    glen: (() => { const i = window.TitleScreen ? TitleScreen.glenImg() : null; return !!i && !i.classList.contains('t2img') && getComputedStyle(i).visibility === 'visible' && i.naturalWidth > 0; })(),
    shade: !!document.querySelector('#scrTitle .t2shade'),
    frames: document.querySelectorAll('#scrTitle .t2f').length,
    amb: [...document.querySelectorAll('#scrTitle .t2amb')].filter(a => a.style.display !== 'none').length,
  }));
  ck('aMissingNightLeavesTheGlen', r.lifted && !r.night && r.lost && r.glen && !r.shade && r.frames >= 7 && r.amb === 0,
    JSON.stringify(r));
  await o.ctx.close();
}

/* ---- 3. THE SPLASH IS THE TITLE'S OWN SCENE (a staged phone, the lift held) ---- */
{
  const o = await open({ q: '?cards=1', vp: [390, 844], dpr: 3, hold: true, tag: 'splash' });
  const p = o.p;
  await p.waitForFunction(() => window.Boot && document.querySelector('#splash img.t2img'), null, { timeout: 10000 }).catch(() => {});
  await p.waitForFunction(() => { const i = document.querySelector('#splash img.t2img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && document.querySelector('#scrTitle img.t2img'), null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  const before = await p.evaluate(() => {
    const s = document.querySelector('#splash img.t2img'), t = document.querySelector('#scrTitle img.t2img');
    const look = i => i && ({ src: i.currentSrc, fit: getComputedStyle(i).objectFit, pos: getComputedStyle(i).objectPosition,
      ir: i.style.imageRendering, box: [i.getBoundingClientRect().width, i.getBoundingClientRect().height].join('x') });
    return { splash: look(s), title: look(t), up: !!document.getElementById('splash') && !Boot.done,
      oldHidden: getComputedStyle(document.querySelector('#splash img:not(.t2img)')).visibility === 'hidden',
      bg: getComputedStyle(document.getElementById('splash')).backgroundColor,
      ready: G.titleGlenUp() };
  });
  ck('aStagedSplashWearsTheNight', !!before.splash && before.up && before.oldHidden && /night-tall\.webp/.test(before.splash.src) && before.bg === 'rgb(10, 13, 24)',
    JSON.stringify({ splash: before.splash, up: before.up, oldHidden: before.oldHidden, bg: before.bg }));
  ck('andTheTitleWearsTheSameFileTheSameWay', !!before.splash && !!before.title && JSON.stringify(before.splash) === JSON.stringify(before.title),
    JSON.stringify(before.title));
  const shotSplash = await p.screenshot();
  await p.evaluate(() => { window.__bootGate = false; Boot.markReady(); });
  await p.waitForFunction(() => Boot.done && !document.getElementById('splash'), null, { timeout: 10000 });
  await p.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '#scrTitle .tcol, #scrTitle .t2amb { visibility: hidden !important; } #scrTitle * { animation: none !important; transition: none !important; }';
    document.head.appendChild(s);
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const shotTitle = await p.screenshot();
  const diff = await p.evaluate(async ([a, c]) => {
    const load = async (d) => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, cv.width, cv.height).data; };
    const A = await load(a), B = await load(c);
    let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 6) n++;
    return { n, of: A.length / 4 };
  }, [shotSplash.toString('base64'), shotTitle.toString('base64')]);
  ck('theLiftAddsOnlyTheChrome', diff.n === 0, diff.n + ' of ' + diff.of + ' device pixels differ between the splash and the title without its chrome');
  await o.ctx.close();
  /* THE LIFT WAITS FOR THE NIGHT: titleGlenUp answers from the night's own
     picture, never from the glen hidden (and long since loaded) under it.
     The page's load event already waits for the splash's copy, so the
     title's own picture is pointed at a slow copy of the file to stand for
     a night still on its way. */
  const o2 = await open({ q: '?cards=1', tag: 'glenup', route: ctx => ctx.route(u => /slow=1/.test(String(u)), async r => { await new Promise(z => setTimeout(z, 2000)); await r.continue(); }) });
  const early = await o2.p.evaluate(() => {
    const i = document.querySelector('#scrTitle img.t2img'), pic = i && i.closest('picture');
    if (!i) return { up: G.titleGlenUp(), night: null, glen: true };
    for (const s of [...pic.querySelectorAll('source')]) s.remove();
    i.src = 'assets/ui/title/night-tall.webp?v=60&slow=1';
    const g = document.querySelector('#scrTitle .tbg img:not(.t2img)');
    return { up: G.titleGlenUp(), night: i.complete, glen: !!g && g.complete && g.naturalWidth > 0 };
  });
  await o2.p.waitForFunction(() => { const i = document.querySelector('#scrTitle img.t2img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(() => {});
  const late = await o2.p.evaluate(() => G.titleGlenUp());
  ck('theLiftWaitsForTheNight', !early.up && !early.night && early.glen && late,
    `the glen loaded and the night still coming: titleGlenUp ${early.up}; once it lands: ${late}`);
  await o2.ctx.close();
}

/* ---- 4 + 6. THE CHROME AT THE DEVICE'S RESOLUTION, AND THE FIT ---- */
{
  const probe = (p) => p.evaluate(async () => {
    const t = document.getElementById('scrTitle'), out = [], nat = {};
    const natOf = u => nat[u] || (nat[u] = new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = u; }));
    const shown = el => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    for (const i of t.querySelectorAll('img')) {
      if (!shown(i) || !i.naturalWidth || i.closest('.tbg')) continue;   // the backdrop is scene art
      const r = i.getBoundingClientRect();
      out.push({ name: i.src.split('/').pop().split('?')[0], w: r.width, h: r.height, nw: i.naturalWidth, nh: i.naturalHeight });
    }
    for (const el of t.querySelectorAll('*')) {
      if (el.closest('.tbg')) continue;
      for (const pse of [null, '::before', '::after']) {
        const bi = getComputedStyle(el, pse).backgroundImage, m = bi && /url\("?([^")]+)"?\)/.exec(bi);
        if (!m || /\.svg(\?|$)|^data:image\/svg/.test(m[1])) continue;
        const n = await natOf(m[1]), r = el.getBoundingClientRect();
        if (n && r.width) out.push({ name: 'bg ' + m[1].split('/').pop().split('?')[0], w: r.width, h: r.height, nw: n[0], nh: n[1] });
      }
    }
    const plaques = [...t.querySelectorAll('.tmenu .abtn')].filter(shown);
    const framed = plaques.filter(b2 => { const f = b2.querySelector(':scope > .t2f'); return f && f.getAttribute('viewBox') === `0 0 ${b2.offsetWidth} ${b2.offsetHeight}`; }).length;
    const icons = [...t.querySelectorAll('.tmenu svg')].filter(shown);
    const stepped = icons.filter(s => s.getAttribute('shape-rendering') === 'crispEdges' || getComputedStyle(s).shapeRendering === 'crispEdges').length;
    const pxi = [...t.querySelectorAll('.pxi')].filter(shown).length;
    const night = t.querySelector('img.t2img');
    return { out, plaques: plaques.length, framed, stepped, pxi, ir: night ? night.style.imageRendering : null, src: night ? night.currentSrc.replace(/^.*\//, '').replace(/\?.*$/, '') : null };
  });
  const SIZES = [[375, 667, 2], [390, 844, 3], [430, 932, 3], [844, 390, 3], [768, 1024, 2], [1440, 900, 1], [1920, 1080, 1]];
  const over = [], frames = [], blocky = [], art = [], fit = [];
  for (const [w, h, dpr] of SIZES) {
    const o = await open({ q: '?cards=1', vp: [w, h], dpr, tag: 'fit' + w });
    const r = await probe(o.p);
    for (const x of r.out) {
      const k = Math.max(x.w * 3 / x.nw, x.h * 3 / x.nh);
      if (k > 1.001) over.push(`${x.name} ${x.w.toFixed(0)}px at ${w}x${h} (${k.toFixed(2)}x its ${x.nw}px at 3x)`);
    }
    if (r.framed !== r.plaques || r.plaques < 7 || r.stepped || r.pxi) frames.push(`${w}x${h}: ${r.framed}/${r.plaques} framed, ${r.stepped} stepped icons, ${r.pxi} pixel icons`);
    // never nearest-neighbour on a 1x screen; at 2x/3x only where the picture is shown at or above its pixels
    if ((dpr < 2 && r.ir !== 'auto') || !r.ir) blocky.push(`${w}x${h}@${dpr}: ${r.ir}`);
    const wantWide = w / h >= 4 / 3;
    if (r.src !== (wantWide ? 'night-wide.webp' : 'night-tall.webp')) art.push(`${w}x${h}: ${r.src}`);
    const f = await o.p.evaluate(() => {
      const de = document.documentElement, vw = de.clientWidth, vh = de.clientHeight;
      const t = document.getElementById('scrTitle'), col = t.querySelector('.tcol');
      const logo = document.getElementById('logoArt').getBoundingClientRect(), menu = t.querySelector('.tmenu').getBoundingClientRect();
      const plaques = [...t.querySelectorAll('.tmenu .abtn')].map(b2 => b2.getBoundingClientRect());
      const inside = r => r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5;
      const fire = t.querySelector('.t2amb[data-at="fire"]'), fr = fire && fire.style.display !== 'none' ? fire.getBoundingClientRect() : null;
      return {
        sideways: de.scrollWidth > vw || document.body.scrollWidth > vw,
        scrolls: col.scrollHeight > col.clientHeight + 1,
        logoIn: inside(logo) && logo.width > 0, plaquesIn: plaques.every(inside),
        clear: logo.bottom <= menu.top + 0.5,
        small: plaques.filter(r => r.height < 44 || r.width < 44).length,
        fireUnder: fr ? plaques.some(r => fr.left >= r.left && fr.left <= r.right && fr.top >= r.top && fr.top <= r.bottom) : null,
      };
    });
    const why = [];
    if (f.sideways) why.push('scrolls sideways');
    if (f.scrolls) why.push('the column scrolls');
    if (!f.logoIn) why.push('logo outside the window');
    if (!f.plaquesIn) why.push('a plaque outside the window');
    if (!f.clear) why.push('logo over the menu');
    if (f.small) why.push(f.small + ' plaque(s) under 44px');
    if (f.fireUnder) why.push("the campfire's light under a plaque");
    if (why.length) fit.push(`${w}x${h}: ${why.join(', ')}`);
    if (w === 844) {   // the control: a blow-up the probe must name
      await o.p.evaluate(() => { const s = document.createElement('style'); s.textContent = '#logoArt { width: 420px !important; }'; document.head.appendChild(s); });
      const c = await probe(o.p);
      const named = c.out.some(x => x.name === 'title-logo.png' && x.w * 3 > x.nw);
      ck('andTheChromeProbeCanSeeABlowUp', named, named ? 'a 420px logo is named' : 'the probe missed a 420px logo');
    }
    await o.ctx.close();
  }
  ck('noChromeIsShownPastItsPixelsAt3x', over.length === 0, over.join('; ') || 'every raster but the backdrop at or under its pixels at 3x, at 7 sizes');
  ck('everyPlaqueWearsAVectorFrameBuiltToItsBox', frames.length === 0, frames.join('; ') || 'frames and icons are vectors at 7 sizes, no stepped or pixel icon');
  ck('theNightIsNeverBlockyOnA1xScreen', blocky.length === 0, blocky.join('; ') || 'smoothed on 1x screens, nearest-neighbour only at 2x/3x where it is enlarged');
  ck('aLandscapeWindowTakesTheWideValley', art.length === 0, art.join('; ') || 'wide on every landscape window, tall on every portrait one');
  ck('itFitsAtEverySize', fit.length === 0, fit.join(' | ') || SIZES.map(s => s[0] + 'x' + s[1]).join(' ') + ': no scroll, all inside, logo clear, 44px targets, the fire in the open');
}

/* ---- 5. NO LABEL RUNS OFF ITS PLAQUE (all seven, at the widths the boot contract measures) ---- */
{
  const tight = [];
  for (const w of [320, 359, 360, 375, 390, 430]) {
    const o = await open({ q: '?cards=1', vp: [w, 780], tag: 'labels' + w });
    const rows = await o.p.evaluate(() => [...document.querySelectorAll('#scrTitle .tmenu .abtn')].map(el => {
      const lab = el.querySelector('.blab'), cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const r = lab.getBoundingClientRect(), sm = el.querySelector('small');
      return { t: lab.textContent.trim(), slack: +(inner - r.width).toFixed(1), h: r.height, sm: sm ? sm.getBoundingClientRect().width <= inner : true, H: el.offsetHeight };
    }));
    for (const r of rows) if (r.slack < 2 || r.h > 30 || !r.sm || r.H < 44) tight.push(`${w}px ${r.t} slack=${r.slack} h=${r.h.toFixed(0)} H=${r.H}`);
    if (rows.length < 7) tight.push(`${w}px: ${rows.length} plaques`);
    await o.ctx.close();
  }
  ck('noTitleLabelRunsOffItsPlaque', tight.length === 0, tight.join(' | ') || 'all seven labels fit, one line, 44px plaques, at 320/359/360/375/390/430');
}

/* ---- 7. THE PLAQUES BEHAVE ---- */
{
  const o = await open({ q: '?cards=1', vp: [390, 844], dpr: 2, tag: 'behave' });
  const p = o.p;
  const r = await p.evaluate(() => {
    const kind = id => document.getElementById(id).dataset.t2;
    const c = document.getElementById('btnContinue');
    return { gold: kind('btnTitleNew'), navy: kind('btnTitleBoard'), cont: kind('btnContinue'),
      cant: c.classList.contains('cant'), contF: c.querySelector('.t2f') ? getComputedStyle(c.querySelector('.t2f')).filter : 'no frame',
      contOp: getComputedStyle(c).opacity, small: c.querySelector('small').textContent.trim() };
  });
  ck('newGameIsTheGoldPlate', r.gold === 'gold' && r.navy === 'navy' && r.cont === 'wood', `New Game ${r.gold}, Leaderboard ${r.navy}, Continue ${r.cont}`);
  ck('andANoSavesContinueSitsFlat', r.cant && r.contF === 'none' && r.contOp === '1' && r.small.length > 0, `cant=${r.cant}, its frame's drop: ${r.contF}, "${r.small}"`);
  const top0 = await p.evaluate(() => document.getElementById('btnTitleBoard').getBoundingClientRect().top);
  const bx = await p.evaluate(() => { const q = document.getElementById('btnTitleBoard').getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; });
  await p.mouse.move(bx[0], bx[1]);
  await p.mouse.down();
  // the plate eases down over 70ms: wait for it to settle rather than for a fixed beat
  await p.waitForFunction((t0) => document.getElementById('btnTitleBoard').getBoundingClientRect().top - t0 > 1.9, top0, { timeout: 3000 }).catch(() => {});
  const pressed = await p.evaluate(() => { const el = document.getElementById('btnTitleBoard'), lo = el.querySelector('.t2f .lo'); return { tr: getComputedStyle(el).translate, lo: lo ? getComputedStyle(lo).opacity : 'none', top: el.getBoundingClientRect().top }; });
  await p.mouse.move(2, 2);   // let go off the plaque: a press, not a click (the click would open the board)
  await p.mouse.up();
  await p.waitForFunction((t0) => Math.abs(document.getElementById('btnTitleBoard').getBoundingClientRect().top - t0) < 0.1, top0, { timeout: 3000 }).catch(() => {});
  const back = await p.evaluate(() => document.getElementById('btnTitleBoard').getBoundingClientRect().top);
  ck('aPressSendsThePlaqueIntoItsFrame', /2px/.test(pressed.tr) && pressed.lo === '1' && Math.abs(pressed.top - top0 - 2) < 0.6 && Math.abs(back - top0) < 0.1,
    `pressed translate ${pressed.tr}, bevel turned (${pressed.lo}), ${(pressed.top - top0).toFixed(1)}px down, ${(back - top0).toFixed(1)}px off once let go`);
  // the pause menu wears the same .plaques and must not wear the night's
  const pause = await p.evaluate(() => {
    const b2 = document.querySelector('#scrPaused .pauseMenu .abtn');
    return b2 ? { before: getComputedStyle(b2, '::before').display, after: getComputedStyle(b2, '::after').display, frame: !!b2.querySelector('.t2f') } : null;
  });
  ck('thePauseMenuIsUntouched', !!pause && pause.before !== 'none' && pause.after !== 'none' && !pause.frame, JSON.stringify(pause));
  const emb = await p.evaluate(() => document.querySelectorAll('#scrTitle .t2em').length);
  await o.ctx.close();
  const q = await open({ q: '?cards=1', reduced: true, tag: 'reduced' });
  const still = await q.p.evaluate(() => {
    const an = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).animationName : 'absent'; };
    return { em: document.querySelectorAll('#scrTitle .t2em').length, glow: an('#scrTitle .t2glow'), glint: an('#scrTitle .t2glint') };
  });
  ck('lessMotionMeansNoEmbers', emb > 0 && still.em === 0 && still.glow === 'none' && still.glint === 'none',
    `${emb} embers with motion; with less: ${still.em} embers, glow ${still.glow}, glint ${still.glint}`);
  await q.ctx.close();
}

/* ---- 7b. THE LIGHT SITS ON THE PAINTING'S OWN FIRE AND COMET: each ambient
   anchor, read off the shipped file itself, lands within an art pixel or two
   of something burning — repaint the night and the anchors must follow ---- */
{
  const o = await open({ q: '?cards=1', tag: 'anchors' });
  const r = await o.p.evaluate(async () => {
    const out = [];
    for (const [v, k] of [['wide', 3], ['tall', 2]]) {
      const im = new Image(); im.src = 'assets/ui/title/night-' + v + '.webp?v=' + CFG.ART_V; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      for (const at of ['fire', 'comet']) {
        const [fx, fy] = TitleScreen.ANCHOR[at][v];
        const x = Math.round(fx * im.width), y = Math.round(fy * im.height), R = 3 * k;
        const d = g.getImageData(x - R, y - R, 2 * R + 1, 2 * R + 1).data;
        let best = 0, warm = 0;   // the brightest pixel near it, and the warmest (a white-hot core has no hue of its own)
        for (let i = 0; i < d.length; i += 4) { best = Math.max(best, d[i] + d[i + 1] + d[i + 2]); warm = Math.max(warm, d[i] - d[i + 2]); }
        out.push({ v, at, best, warm });
      }
    }
    return out;
  });
  const off = r.filter(x => x.best < 560 || x.warm < 90);
  ck('theLightSitsOnThePaintingsFireAndComet', r.length === 4 && off.length === 0,
    r.map(x => `${x.v} ${x.at}: brightest ${x.best}, warmth ${x.warm}`).join('; '));
  await o.ctx.close();
}

ck('theTitleRunsClean', errs.length === 0, errs[0] || 'no page errors');
console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL TITLE CHECKS PASS');
await b.close();
srv.close();
process.exit(fails.length ? 1 : 0);
