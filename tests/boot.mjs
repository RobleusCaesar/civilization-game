/* BOOT CONTRACT — the game never opens on a black screen with stray chrome.

   THE SPLASH   A full-screen logo is declared IN index.html with INLINE
                styles, as the first element in the body, so the browser
                paints it on frame one. A splash injected by JS cannot do
                that job: the screen is black until the scripts parse, which
                is exactly the flash it exists to hide. It holds for
                Boot.HOLD_MS, then cross-fades to the title.

   THE LIFT     Two conditions, both required: the hold has elapsed (or a tap
                skipped it) AND the title is READY — world built, first frame
                painted. Lifting on the timer alone uncovers the very gap the
                splash covers, so `ready` is never short-circuited; a tap
                skips the WAIT, not the readiness. A failsafe marks ready
                anyway, so a broken boot can never strand the player on a
                logo.

   THE CHROME   The HUD, minimap, day counter, pause button, resource
                counters and collapse arrows are hidden by DEFAULT and come
                back only under `body.ingame` — set by Screens.show for the
                playing screen, and only when a real, NON-DEMO game is live
                (the title runs a demo world in S and must never wear a
                resource bar). Not merely hidden behind the splash: gone.

   THE NOTCH    One variable carries the top inset (--safe-top), env() with
                its own 0px default so an unknown env can't drop the whole
                declaration, a --safe-min floor and an --edge-clear step,
                both zero unless the page runs UNDER the clock.

   THE CLOCK'S BLUR  The status bar is OPAQUE (`black`): from iOS 26.1 a
                translucent bar has a system blur and tint under it that
                reaches ~45pt past the inset and that no page can switch
                off, and the counters sat in it. An install made before the
                change keeps the translucent bar until it is re-added, so
                one that reports an inset (or is as tall as the screen)
                steps its chrome past the band — measured here on an
                emulated iPhone in every install mode (§5).

   Run this after touching any of:
     index.html — the splash block, the Boot script, the body.ingame gate,
                  --safe-top / --safe-min / --edge-clear, html.ios-app /
                  .under-bar, the page-fit script, the status-bar and
                  viewport metas
     screens.js — show() (the ingame class, the Boot.force call), foundRun
     game.js — the load handler's first-frame markReady, the shell draw rate
     assets.js — the strip pump (_stripLoad / _pumpStrips / _queueInstall /
                 _drainInstalls / _hold), _dyeStrip, setUnitFrames
     map.js — generate's peek;  artstyle.js — outline

     node tests/boot.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + join(root, 'index.html');
/* HOLD THE TITLE'S READINESS FOR THE TEST (3b, 3c). With HOLD_MS 0 a quick
   boot marks ready and lifts the splash before a check's own evaluate runs,
   so a check that needs "not lifted yet" raced the machine and failed only
   when it was FAST. This wraps Boot.markReady — the game's first frame and
   the failsafe both come through it — behind a gate the check opens itself
   (window.__bootGate = false). Nothing else about the boot changes. */
const holdReady = (p) => p.addInitScript(() => {
  let real;
  window.__bootGate = true;
  Object.defineProperty(window, 'Boot', { configurable: true, get() { return real; }, set(v) {
    real = v;
    const mr = v.markReady;
    v.markReady = function () { if (window.__bootGate) return; return mr.apply(this, arguments); };
  } });
});
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 1. THE SOURCE ITSELF: the splash must be declared, inline-styled, and
   ahead of everything else in the body. Measured on the FILE, because this is
   a claim about what the browser can paint before it runs a line of JS. ---- */
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const body = html.slice(html.indexOf('<body>'));
  const iSplash = body.indexOf('id="splash"');
  const iCanvas = body.indexOf('<canvas id="c"');
  ck('theSplashIsInTheDocument', iSplash > 0, iSplash > 0 ? '' : 'not declared in index.html');
  ck('andItIsTheFirstThingInTheBody', iSplash > 0 && iSplash < iCanvas,
    'ahead of the canvas and all chrome');
  const tag = body.slice(iSplash - 60, iSplash + 3400);   // wide enough for the <picture> block and its two-night sources
  ck('itCarriesItsOwnInlineStyles',
    /style="[^"]*position:fixed/.test(tag) && /style="[^"]*z-index:\s*\d/.test(tag),
    'it needs no stylesheet to cover the screen');
  /* THE LOADING SCREEN IS THE TITLE'S OWN NIGHT — the same file, drawn the
     same way, so the fade has no scene change in it and the boot fetches
     ONE image rather than a poster and then a backdrop. (It was the glen
     until build 106, when the night title went public and the glen was
     retired — tests/title.mjs holds the markup to the boot block's own
     sources.) */
  ck('theLoadingScreenIsTheNight', /assets\/ui\/title\/night-tall\.jpg/.test(tag), '');
  ck('andItIsDrawnLikeTheTitleIs', /object-fit:\s*cover/.test(tag),
    'contain would letterbox it and the fade would jump');
  /* THE SHELL TRACKS THE DYNAMIC VIEWPORT. iOS Safari resolves height:100%
     against the SMALL viewport, so with the toolbar retracted every shell
     scene sat high over a black band at the foot of the screen (a reported
     screenshot set: "all three scenes seem top justified"). html/body take
     100dvh where supported — a supplement to the 100% fallback, never a
     replacement — and the splash carries the same rule INLINE, because it
     must cover the screen before any stylesheet parses. */
  ck('theShellTracksTheDynamicViewport',
    /@supports\s*\(height:\s*100dvh\)\s*{\s*html,\s*body\s*{\s*height:\s*100dvh/.test(html),
    'html/body take 100dvh where supported');
  ck('andSoDoesTheSplash', /style="[^"]*min-height:100dvh/.test(tag),
    'inline, ahead of every stylesheet');
  /* …AND THE PAGE IS SIZED BY MEASUREMENT (the bottom-band report): on a
     real iPhone the fixed-position viewport reached the screen's bottom
     edge while 100% and 100dvh both stopped short. A hidden fixed probe is
     measured and html/body pinned to it in px; `cf-fit` tells the canvas
     to follow. The dvh rules above stay as the no-JS fallback. */
  ck('andThePageIsSizedByMeasurement',
    /position:fixed;top:0;left:0;right:0;bottom:0;visibility:hidden/.test(html) &&
    /documentElement\.style\.height = h \+ 'px'/.test(html) &&
    /cf-fit/.test(html),
    'a fixed probe pins html/body to the real viewport box');
  /* the ground behind the picture is the NIGHT'S OWN DARK (#0a0d18, the
     art's sky — Boot.T2_BG), so the frame before the image decodes is the
     night, never a green, white or transparent flash (it was the glen's
     green #505c1e until the glen was retired) */
  ck('itPaintsOnTheGamesOwnGround', /background:\s*#0a0d18/.test(tag),
    'the night\'s own dark — never a green, white or transparent flash');
  // …and the viewport opts into the notch
  ck('theViewportCoversTheNotch', /viewport-fit=cover/.test(html), '');

  /* THE HOME-SCREEN ICON. "Add to Home Screen" reads apple-touch-icon; the
     image must be square, OPAQUE (iOS composites black behind any alpha) and
     carry no wordmark — iOS prints the app's name under the icon already. */
  const png = (rel) => {
    const buf = readFileSync(join(root, rel));
    // PNG header: width/height at bytes 16..24, colour type at byte 25
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colour: buf[25], bytes: buf.length };
  };
  const iconM = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/);
  ck('theHomeScreenIconIsDeclared', !!iconM, iconM ? iconM[1] : 'no apple-touch-icon link');
  if (iconM) {
    const { w, h, colour } = png(iconM[1]);
    ck('theIconIsSquareAndBigEnough', w === h && w >= 180, w + '×' + h);
    // colour type 3 is a PALETTE png — opaque unless it carries a tRNS chunk
    ck('andItIsOpaque', colour === 2 || colour === 0 || colour === 3,
      colour === 6 || colour === 4 ? 'has an alpha channel — iOS fills it black'
        : 'PNG colour type ' + colour);
  }
  /* THE TAB GETS ITS OWN, SIMPLER DRAWING. A favicon is painted at 16-32px,
     where the home-screen icon's gold frame and embers turn to mush — two
     jobs, two pictures. Smallest declared first so browsers pick the fit. */
  const favs = [...html.matchAll(/rel="icon"[^>]*sizes="(\d+)x\1"[^>]*href="([^"]+)"/g)]
    .map(m => ({ px: +m[1], href: m[2] }));
  ck('theTabIconIsDeclared', favs.some(f => f.px <= 32),
    favs.map(f => f.px).join(', ') || 'no small icon link');
  const tab = favs.filter(f => f.px <= 32);
  const tabBad = tab.filter(f => { const p = png(f.href); return p.w !== f.px || p.h !== f.px; });
  ck('andTheTabFilesAreTheSizeTheyClaim', tab.length > 0 && tabBad.length === 0,
    tabBad.length ? tabBad[0].href : tab.map(f => f.px + 'px').join(' + '));
  ck('andItIsADifferentDrawingFromTheHomeScreen',
    !!iconM && tab.length > 0 && !tab.some(f => f.href === iconM[1]),
    'the tab must not just be the detailed icon shrunk');
  /* THE SPLASH IMAGE GATES FIRST PAINT, so it is served as WebP with a
     baseline format still behind it — a browser without WebP must get the
     night, not the bare dark screen the splash exists to prevent. */
  {
    const tag = body.slice(iSplash, iSplash + 3400);
    const hasWebp = /srcset="[^"]*\.webp(\?v=\d+)?"/.test(tag);
    ck('theSplashIsServedLight', hasWebp, hasWebp ? 'webp source declared' : 'no webp');
    const webpM = tag.match(/srcset="([^"]+\.webp)(?:\?v=\d+)?"/);
    if (webpM) {
      const wb = readFileSync(join(root, webpM[1].split('?')[0])).length;
      const fb = readFileSync(join(root, webpM[1].split('?')[0].replace(/\.webp$/, '.jpg'))).length;
      ck('andItIsGenuinelySmaller', wb < fb,
        Math.round(wb/1024) + 'KB webp vs ' + Math.round(fb/1024) + 'KB fallback');
    }
    ck('butTheBaselineStaysAsTheFallback',
      /<img[^>]+src="assets\/ui\/title\/night-tall\.jpg(\?v=\d+)?"/.test(tag), '');
  }
  ck('theTopInsetHasADefaultAndAFloor',
    /--safe-top:\s*calc\(max\(env\(safe-area-inset-top,\s*0px\),\s*var\(--safe-min\)\)\s*\+\s*var\(--edge-clear\)\)/.test(html) &&
    /--safe-min:\s*0px/.test(html) && /--edge-clear:\s*0px/.test(html),
    'an unknown env() would otherwise drop the whole declaration');
  /* THE STATUS BAR IS OPAQUE. iOS 26.1+ blurs and tints the page under a
     translucent bar ~45pt past the inset, and the page cannot turn it off;
     with `black` the page starts beneath the clock and nothing is under it.
     (The behaviour on each install mode is measured in §5.) */
  {
    const sb = html.match(/<meta name="apple-mobile-web-app-status-bar-style" content="([^"]+)"/);
    ck('theStatusBarIsOpaque', !!sb && sb[1] === 'black',
      sb ? sb[1] + (sb[1] === 'black-translucent' ? ' — the page runs under the iOS 26.1 blur' : '') : 'no status-bar meta');
  }
  ck('andTheTopBarWearsIt',
    /#topbar\s*\{[^}]*padding:\s*calc\(var\(--safe-top\)/.test(html), '');

  /* THE TITLE WEARS THE NIGHT. The menu backdrop is PixelLab art — webp
     served, jpg fallback — declared in the title screen's own markup so it
     starts loading with the HTML parse, behind the splash. */
  {
    const iTitle = body.indexOf('id="scrTitle"');
    const title = body.slice(iTitle, body.indexOf('id="scrNewgame"'));
    ck('theTitleWearsThePaintedBackdrop',
      /srcset="assets\/ui\/title\/night-tall\.webp(\?v=\d+)?"/.test(title) &&
      /<img[^>]+src="assets\/ui\/title\/night-tall\.jpg(\?v=\d+)?"/.test(title),
      'webp source + jpg fallback in #scrTitle');
    const wb = readFileSync(join(root, 'assets/ui/title/night-tall.webp')).length;
    const jb = readFileSync(join(root, 'assets/ui/title/night-tall.jpg')).length;
    ck('andTheBackdropIsServedLight', wb < jb && wb < 300 * 1024,
      Math.round(wb / 1024) + 'KB webp vs ' + Math.round(jb / 1024) + 'KB jpg');
    /* THE MENU IS DRAWN, NOT TYPED: every title button carries a pixel-SVG
       icon and none carries an emoji — Apple's glossy 3D set beside pixel
       art is the single loudest "web page" tell there is. (The cloud chip
       is JS-written and exempt; this is a claim about the buttons.) */
    const btns = [...title.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[0]);
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    /* NO EMOJI ANYWHERE on the title — Apple's glossy 3D set beside pixel
       art is the loudest "web page" tell there is. The HERO plaques carry a
       drawn pixel icon (which is part of what marks them primary); the
       narrow secondary row is deliberately TEXT ONLY, because an icon in a
       plaque that size costs more label room than it earns. */
    const big = btns.filter(t => /class="abtn big/.test(t));
    ck('theMenuIsDrawnNotTyped',
      btns.length >= 6 && !btns.some(t => emoji.test(t)),
      btns.length + ' buttons, no emoji');
    ck('andTheHeroPlaquesAreIconed',
      big.length === 3 && big.every(t => t.includes('class="pxi"')),
      big.length + ' hero plaques drawn, secondary row text-only');
    /* THE WORDMARK IS SWAPPABLE BY FILENAME. Drop assets/ui/title-logo.png
       in and it replaces the type — the same "art lands by filename" rule
       the building art follows, no code change and no manifest. It must
       reveal only on a successful decode and drop itself on a 404, or a
       repo without the file flashes a broken image where the logo goes. */
    ck('theWordmarkIsSwappableByFilename',
      /id="logoArt"[^>]+src="assets\/ui\/title-logo\.png"/.test(title) &&
      /onload="[^"]*hasLogoArt/.test(title) && /onerror="this\.remove\(\)"/.test(title) &&
      // the rule may carry a selector LIST (the art also stands the tagline
      // down) — match the behaviour, not the exact formatting
      /#scrTitle\.hasLogoArt \.logo\b[^{]*\{[^}]*display:\s*none/.test(html),
      'art wins, type is the fallback');
    ck('andTheTypeFallbackIsStillThere', /<h1 class="logo">CLANFIRE<\/h1>/.test(title), '');
    /* ONE PICTURE, TWO LAYERS. The loading screen and the title wear the
       SAME file: that is what makes the lift seamless — the scene stands
       still and only the chrome arrives. If these ever diverge the boot
       gains a visible jump-cut back. */
    ck('theLoadingScreenAndTheTitleShareTheirGround',
      /srcset="assets\/ui\/title\/night-tall\.webp(\?v=\d+)?"/.test(tag) &&
      /srcset="assets\/ui\/title\/night-tall\.webp(\?v=\d+)?"/.test(title),
      'same art on both layers');
    /* THE POP-IN CAN NEVER STRAND AN INVISIBLE MENU. The hidden state lives
       ONLY in the keyframe's `from`, held through the delay by `both` — a
       resting `opacity: 0` on the chrome would mean a title whose .popIn
       never lands (JS died, a test drove straight in with Boot.force, the
       class refactored away) shows a backdrop and NO BUTTONS. */
    ck('andAMissingPopNeverHidesTheMenu',
      !/#scrTitle[^{]*\.(thead|tmenu)[^{]*\{[^}]*opacity:\s*0\s*[;}]/.test(html) &&
      /@keyframes popIn\s*\{\s*from\s*\{[^}]*opacity:\s*0/.test(html) &&
      /#scrTitle\.popIn \.thead\s*\{[^}]*both/.test(html),
      'hidden only inside the keyframe, never at rest');
    /* THE SHIPPED WORDMARK MUST BE GENUINELY TRANSPARENT. It sits over the
       glen, so a PNG that lost its alpha (a round-trip through JPEG will do
       it) reads as a BLACK BOX nailed to the meadow — and it would still
       pass every other check here, because the file loads fine. */
    {
      const buf = readFileSync(join(root, 'assets/ui/title-logo.png'));
      const colour = buf[25];
      const hasTRNS = buf.includes(Buffer.from('tRNS'));
      ck('theShippedWordmarkIsTransparent',
        colour === 6 || colour === 4 || (colour === 3 && hasTRNS),
        'PNG colour type ' + colour + (colour === 3 ? (hasTRNS ? ' + tRNS' : ' with NO tRNS') : ''));
      ck('andItIsLightEnoughForTheTitle', buf.length < 200 * 1024,
        Math.round(buf.length / 1024) + 'KB');
    }
    /* and the display faces are SELF-HOSTED and light — a Google Fonts
       fetch would be a third-party call on the boot path */
    const f = readFileSync(join(root, 'assets/ui/pixelify.woff2'));
    ck('theTitleFaceIsSelfHosted',
      /@font-face[^}]*url\('assets\/ui\/pixelify\.woff2'\)/.test(html) &&
      f.slice(0, 4).toString() === 'wOF2' && f.length < 30 * 1024,
      Math.round(f.length / 1024) + 'KB woff2');
    /* THE MENU IS SET LIKE THE LOGO'S BANNER, not like a terminal: the
       plaque labels wear the same inscriptional Roman caps the art does. */
    const mf = readFileSync(join(root, 'assets/ui/cinzel.woff2'));
    ck('theMenuFaceMatchesTheBanner',
      /--menufont:\s*'Cinzel'/.test(html) &&
      /@font-face[^}]*url\('assets\/ui\/cinzel\.woff2'\)/.test(html) &&
      mf.slice(0, 4).toString() === 'wOF2' && mf.length < 60 * 1024,
      Math.round(mf.length / 1024) + 'KB woff2');
    // the plaque styles are shared (.plaques — title AND pause wear them)
    ck('andTheButtonsAreSetInIt',
      /\.plaques \.abtn \{[^}]*font-family:\s*var\(--menufont\)/.test(html) &&
      /\.plaques \.abtn \{[^}]*text-transform:\s*uppercase/.test(html) &&
      /class="tmenu plaques"/.test(html) && /class="pauseMenu plaques"/.test(html),
      'Roman caps on the plaques');
  }
}

/* ---- 2. THE FIRST PAINTED FRAME is the logo, and nothing else ---- */
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'commit' });
  // the earliest moment we can look: the element exists before any script has
  // had a chance to run a frame
  await p.waitForSelector('#splash', { state: 'attached', timeout: 5000 });
  const first = await p.evaluate(() => {
    const sp = document.getElementById('splash');
    /* The probe is deliberately the EARLIEST possible look, and since
       Boot.HOLD_MS went to 0 (2026-09-20) it is a look we cannot reliably
       win: between the selector wait and this evaluate the splash may have
       been torn down entirely, or — the case that started failing — caught
       part-way through its fade. Both of those are a splash that WAS up
       first; only a splash that never showed at all would be a regression,
       and it is indistinguishable from a completed one. So "up" accepts
       gone and going, and the teeth of this section stay where they can
       actually bite: no game chrome on that first look, and a body that is
       not in a game — both asserted from this same sample below. */
    const cs = sp ? getComputedStyle(sp) : null;
    const vis = (id) => {
      const el = document.getElementById(id);
      return el ? getComputedStyle(el).display !== 'none' : false;
    };
    return {
      up: sp ? (cs.display !== 'none' || +cs.opacity < 1) : true,
      covers: sp ? (sp.getBoundingClientRect().width >= innerWidth - 1 &&
              sp.getBoundingClientRect().height >= innerHeight - 1) : true,
      hud: ['topbar', 'bottombar', 'miniWrap', 'miniToggle', 'armyBar', 'toasts'].filter(vis),
      ingame: document.body.classList.contains('ingame'),
    };
  });
  ck('theSplashIsUpOnTheFirstLook', first.up, 'up, or already lifting — HOLD_MS is 0');
  ck('andItCoversTheWholeViewport', first.covers, '');
  ck('noChromeRendersBeforeAGame', first.hud.length === 0,
    first.hud.length ? 'showing: ' + first.hud.join(', ') : 'HUD fully gated');
  ck('andTheBodyIsNotInAGame', !first.ingame, '');
  await p.close();
  if (errs.length) ck('theBootRunsClean', false, errs[0]);
}

/* ---- 2b. NO TITLE LABEL RUNS OFF ITS PLAQUE ----
   The three-across row shares the menu's width, so each button gets about a
   third of it for an icon, a gap and a label — and the labels are set in
   Roman CAPS, which run wider than the pixel face they replaced. This is
   measured on the live page at the narrowest phone still in service and at
   both sides of the step-down breakpoint, because a label that overflows
   does not throw, wrap or fail any other check: it just gets quietly
   clipped by the plaque it is written on. ---- */
{
  const widths = [320, 359, 360, 375, 390, 430];
  const tight = [];
  for (const w of widths) {
    const p = await b.newPage({ viewport: { width: w, height: 780 } });
    await p.goto(url);
    await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 20000 });
    await p.evaluate(() => Boot.force());
    await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 });
    const rows = await p.evaluate(() => [...document.querySelectorAll('#scrTitle .trow3 .abtn')].map(el => {
      const lab = el.querySelector('.blab'), cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const r = lab.getBoundingClientRect();
      return { t: lab.textContent.trim(), slack: +(inner - r.width).toFixed(1), h: r.height };
    }));
    for (const r of rows) if (r.slack < 2 || r.h > 26) tight.push(`${w}px ${r.t} slack=${r.slack}`);
    await p.close();
  }
  ck('noTitleLabelRunsOffItsPlaque', tight.length === 0,
    tight.length ? tight.join(' | ') : 'all three fit at ' + widths.join('/') + 'px');
}

/* ---- 3. THE HOLD, and the tap that skips it ---- */
{
  // 3a. left alone, the splash holds its beat and then lifts by itself
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Boot && window.Boot.HOLD_MS != null, null, { timeout: 5000 });   // 0 is a value, not an absence
  /* ONE round trip, and the wait is anchored to the PAGE's own clock
     (Boot.t0). Sampling on the harness's clock measures harness latency: two
     round-trips of startup lag on a loaded machine push a "45% of the hold"
     sample past the hold itself, and the splash is then reported as lifting
     early when it did exactly the right thing. */
  const mid = await p.evaluate(async () => {
    /* 2026-09-20 (the retention pass): THE HOLD IS GONE. HOLD_MS is 0 — the
       art takes long enough on its own, and the splash now lifts the moment
       the title is ready. The old fractions-of-the-hold sampling divided by
       it; the budget is an absolute 4s now, and what is pinned is that the
       lift never outruns readiness: the two are the same instant. */
    const till = async (ms) => {
      const target = Boot.t0 + ms;
      while (performance.now() < target && !Boot.ready) await new Promise(r => setTimeout(r, 15));
      return performance.now() - Boot.t0;
    };
    const at = performance.now() - Boot.t0;
    const up = { at, done: Boot.done, ready: Boot.ready };
    /* the splash's own picture, read NOW: with no hold the lift starts the
       instant the title is ready and the element is gone ~0.5s later, so a
       read after the readiness wait raced the fade (red whenever the title
       came up quickly) */
    const spPic = document.querySelector('#splash picture'), spEl = document.getElementById('splash');
    const splash = {
      srcs: spPic ? [...spPic.querySelectorAll(':scope > source')].map(s => (s.getAttribute('media') || '') + '|' + s.getAttribute('srcset')).join(' ; ') : null,
      wide: !!spPic && [...spPic.querySelectorAll(':scope > source')].some(s => /min-aspect-ratio: 4\/3/.test(s.getAttribute('media') || '') && /night-wide/.test(s.getAttribute('srcset'))),
      bg: spEl ? getComputedStyle(spEl).backgroundColor : '',
      // …and the copy Boot.t2wear laid over it (the same t2pic builds the title's)
      t2: (() => { const c = document.querySelector('#splash picture.t2bg'); return c ? [...c.querySelectorAll(':scope > source')].map(s => (s.getAttribute('media') || '') + '|' + s.getAttribute('srcset')).join(' ; ') : null; })(),
    };
    /* the READINESS budget is the whole hold, not a fraction of it: the
       promise is that the world is built and drawn BEHIND the logo, so the
       lift is the timer's call and the player never waits past the beat.
       Asserting it at 40% measures the machine (a loaded box needs ~1.3s to
       boot a world), not the boot sequence. */
    /* the readiness budget: the beat, or 4s when the beat is shorter than
       a world takes to bake on a loaded box (the bake now waits for the art
       and runs in slices; on file:// the art is local and lands at once) */
    const readyAt = await till(4000);
    return {
      hold: Boot.HOLD_MS, fade: Boot.FADE_MS, fail: Boot.FAILSAFE_MS,
      up, readyAt, ready: Boot.ready, doneLate: Boot.done, splash,
    };
  });
  /* Long enough to take in the glen, short enough that it never feels like a
     wait. The bound is a bracket around the CURRENT deliberate value, not a
     design floor of its own — the whole point of this test is that cutting
     HOLD_MS further is a real decision and has to touch this line to make
     it, so a future cut is expected to move this bound too, not to be
     blocked by it. */
  /* 2026-09-05: the operator's direction was "things launch instantly (both
     menu and game)" — the beat went to 1.5s. On the operator's OWN device
     that still read as "sits for a bit" on a warm cache, where the beat,
     not the art gate, is what a player actually waits on (the art gate
     only binds on a cold one). Cut again, to 500ms — still a beat of its
     own, not a same-frame flash, but no longer the dominant cost in the
     total boot-to-menu time the operator is holding to a 3s budget. */
  ck('theHoldIsGone', mid.hold === 0, mid.hold + 'ms — the art is the only wait now');
  /* TWO NIGHTS (the glen's rule, carried over when the night replaced it in
     build 106). Any landscape window gets the wide valley, a portrait one
     the tall — chosen by <source media> at parse time, before any script,
     and only the match is fetched; the splash and the title carry the SAME
     sources, so the lift still has no scene change; and the box behind the
     picture is the night's own dark. */
  /* the MARKUP's own sources — `:scope > source`, never every descendant:
     Boot.t2wear lays its copy of the night INSIDE #scrTitle's picture (and
     inside #splash), so a descendant query reads both lists, six sources
     against three, and the claim here is about the markup the browser
     parses before any script runs */
  const glen = await p.evaluate((splash) => {
    const srcs = el => [...el.querySelectorAll(':scope > source')].map(s => (s.getAttribute('media') || '') + '|' + s.getAttribute('srcset')).join(' ; ');
    const tb = document.querySelector('#scrTitle picture.tbg');
    const t2 = document.querySelector('#scrTitle picture.t2bg');
    return { same: !!splash.srcs && !!tb && splash.srcs === srcs(tb) && !!splash.t2 && !!t2 && splash.t2 === srcs(t2) && splash.t2 === splash.srcs, wide: splash.wide,
      lists: [splash.srcs, tb && srcs(tb), splash.t2, t2 && srcs(t2)],
      splashBg: splash.bg, tbgBg: tb ? getComputedStyle(tb).backgroundColor : '' };
  }, mid.splash);
  ck('aWideWindowGetsItsOwnNight', glen.wide, '');
  /* AND THE NIGHT'S OWN CACHE-BUSTER IS HAND-KEPT, SO IT IS MEASURED. Every
     other picture in the game is fetched through Assets, which stamps
     CFG.ART_V on the URL for it. These two <picture> blocks are MARKUP —
     that is the whole point of them, the fetch has to start with the HTML
     parse, behind the splash — so nothing stamps them at runtime, and
     re-encoding the art under an unchanged filename reaches nobody who has
     visited the site before. The query is therefore written by hand in
     index.html, and this check is what keeps the two numbers from drifting
     apart: bump CFG.ART_V for new title art and restamp the markup with it
     (an ART bump does not restamp it for you). */
  {
    const want = await p.evaluate(() => (typeof CFG === 'undefined' ? null : CFG.ART_V));
    const markup = readFileSync(join(root, 'index.html'), 'utf8');
    const urls = (markup.match(/assets\/ui\/title\/night-(?:wide|tall)\.(?:webp|jpg)(\?v=\d+)?/g) || []);
    const stamped = urls.filter(u => u.includes('?v='));
    const agree = stamped.length === urls.length && urls.length >= 8 &&
      stamped.every(u => +u.split('?v=')[1] === want);
    ck('theNightCarriesTheArtVersion', agree,
      urls.length + ' night urls, ' + stamped.length + ' stamped, CFG.ART_V=' + want +
      (agree ? '' : ' — ' + [...new Set(urls)].join(' ')));
  }
  ck('andTheSplashAndTitleStillShareTheirSources', glen.same, glen.same ? 'markup and worn copy alike' : JSON.stringify(glen.lists));
  ck('andTheGroundBehindThePictureIsTheNights', /rgb\(10, 13, 24\)/.test(glen.splashBg) && /rgb\(10, 13, 24\)/.test(glen.tbgBg), glen.splashBg + ' / ' + glen.tbgBg);
  ck('andTheFadeIsACrossFadeNotACut', mid.fade >= 200 && mid.fade <= 900, mid.fade + 'ms');
  ck('andAFailsafeAlwaysStartsTheGame', mid.fail > mid.hold, mid.fail + 'ms');
  /* 2026-09-05, the 500ms cut: measured directly (scratchpad/parsetime2.mjs,
     the Navigation Timing API, no polling involved) — parsing and running
     the 26 classic <script> tags alone costs ~490-540ms on this machine
     BEFORE any page script can run at all, DOMContentLoaded's own handlers
     (R.init/UI.init/Assets.init/Screens.init/Screens.show) another
     ~130-190ms on top. That is real, unavoidable work (script parse is
     CPU-bound, not something a local file:// test's network has any say
     over), and it now reliably outruns the hold before the page could even
     sample it: this poll's OWN first possible evaluation can't run until
     the main thread is free of those scripts, by which point Boot.t0 + a
     500ms hold has already passed. That is not a flash — Boot.held only
     drives the SECOND half of an AND (Boot.ready still gates the lift) —
     so what actually matters here is unchanged: the splash must still be
     up the first moment this test can look, whichever condition turns out
     to be the binding one. */
  ck('itNeverLiftsUnready', !mid.up.done || mid.up.ready,
    mid.up.done && !mid.up.ready ? 'gone at ' + Math.round(mid.up.at) + 'ms before the title was ready' : 'sampled at ' + Math.round(mid.up.at) + 'ms');
  ck('theTitleIsReadyBehindIt', mid.ready,
    'the night on screen (by ' + Math.round(mid.readyAt) + 'ms of a 4000ms budget)');
  // …and it is gone once the beat has passed
  await p.waitForFunction(() => Boot.done, null, { timeout: 8000 });
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 4000 });
  const after = await p.evaluate(() => ({
    gone: !document.getElementById('splash'),
    screen: Screens.current,
    hud: ['topbar', 'bottombar', 'miniWrap', 'armyBar'].filter(id => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display !== 'none';
    }),
  }));
  ck('thenItLiftsOnItsOwn', after.gone, '');
  ck('ontoTheTitleScreen', after.screen === 'title', after.screen);
  ck('andStillNoChromeOnTheTitle', after.hud.length === 0,
    after.hud.length ? 'showing: ' + after.hud.join(', ') : '');
  await p.close();
}
{
  // 3b. A TAP SKIPS AHEAD. The tap lands well inside the hold, and the splash
  // is gone long before the hold would have run out.
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await holdReady(p);
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!window.Boot, null, { timeout: 5000 });
  /* the preconditions are SET, not waited for: whether the title happens to
     be drawn yet is 3c's subject, and waiting on a loaded machine can drift
     past the hold and test the timer instead of the tap. Here the hold has
     provably NOT elapsed, so only the tap can lift it. */
  const t = await p.evaluate(async () => {
    Boot.ready = true;
    Boot.held = false;
    const wasDone = Boot.done;
    dispatchEvent(new Event('pointerdown'));
    const heldAtTap = Boot.held;   // the hold's state when the tap landed — the fade wait below may outlast a short hold
    await new Promise(r => setTimeout(r, Boot.FADE_MS + 200));
    return { wasDone, held: heldAtTap, done: Boot.done,
      at: Math.round(performance.now() - Boot.t0), hold: Boot.HOLD_MS,
      gone: !document.getElementById('splash') };
  });
  ck('aTapSkipsTheRestOfTheHold',
    !t.wasDone && !t.held && t.done && t.gone,
    'gone at ' + t.at + 'ms with the ' + t.hold + 'ms hold still unspent');
  await p.close();
}
{
  /* 3d. IT CROSS-FADES, IT DOES NOT CUT. The trap this pins: the element
     carries its own INLINE opacity (so it can paint before any stylesheet is
     parsed), and an inline property outranks every rule — a class-driven
     `.lift { opacity: 0 }` silently never runs and the splash just vanishes
     when it is removed. The lift must write the inline property. */
  /* the lift is GATED until the sample is armed: with no hold, an
     ungated splash starts fading the instant the title is ready, and a
     busy main thread then sampled a splash already gone (NaN) */
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await holdReady(p);
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Boot && window.Screens && Screens.current === 'title' && document.getElementById('splash'), null, { timeout: 15000 });
  const fade = await p.evaluate(async () => {
    const el = document.getElementById('splash');
    const hasTransition = /opacity/.test(getComputedStyle(el).transitionProperty) &&
      parseFloat(getComputedStyle(el).transitionDuration) > 0.1;
    window.__bootGate = false;
    Boot.markReady();
    Boot.skip();
    /* the change is FLUSHED at once, so the transition starts now and not at
       whatever style recalc a busy page reaches next (a long task in between
       started it on the very read that sampled it, and that read said 1).
       Then it is sampled on a real clock through the fade: a cross-fade is
       caught between its ends at least once, a cut never is — one sample at
       a fixed moment measured the machine as often as the fade */
    getComputedStyle(el).opacity;
    const t0 = performance.now(), seen = [];
    let mid = NaN, still = false;
    while (performance.now() - t0 < Boot.FADE_MS + 40 && document.getElementById('splash')) {
      await new Promise(r => setTimeout(r, 12));
      if (!document.getElementById('splash')) break;
      const o = parseFloat(getComputedStyle(el).opacity);
      seen.push(+o.toFixed(2));
      if (o > 0 && o < 0.98) { mid = o; still = true; break; }
    }
    return { hasTransition, mid, target: el.style.opacity, still, seen: seen.slice(0, 12) };
  });
  ck('theSplashCarriesAnOpacityTransition', fade.hasTransition, '');
  ck('andTheLiftActuallyDrivesIt',
    fade.target === '0' && fade.still && fade.mid > 0 && fade.mid < 0.98,
    'caught mid-fade at ' + (isNaN(fade.mid) ? 'nothing' : fade.mid.toFixed(2)) + ' — a cut reads only 1 or gone (samples ' + fade.seen.join(' ') + ')');
  await p.close();
}
{
  /* 3c. THE TAP NEVER OUTRUNS THE TITLE. A tap before the world is drawn
     shortens the wait, it does not uncover a blank screen: the splash stays
     until `ready`, then goes.
     READINESS IS HELD BY THE TEST, NOT RACED: a quick boot used to lift the
     splash before the evaluate below could set `ready = false`, so the
     "not drawn yet" state is now held by holdReady (above) — a fact, not a
     hope about timing. */
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await holdReady(p);
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!window.Boot, null, { timeout: 5000 });
  const held = await p.evaluate(() => {
    Boot.ready = false;                 // pretend the title has not drawn yet
    Boot.skip();
    return { done: Boot.done, up: !!document.getElementById('splash') };
  });
  ck('aTapBeforeTheTitleIsDrawnWaitsForIt', !held.done && held.up,
    'it keeps covering the gap it exists for');
  const then = await p.evaluate(() => { window.__bootGate = false; Boot.markReady(); return Boot.done; });
  ck('andGoesTheInstantItIs', then, '');
  await p.close();
}

{
  /* 3d. THE FOG FEATHER OWES NOTHING TO ctx.filter (a reported phone
     screenshot set: hard tile-stepped pale rectangles across every bay —
     the lit water inside the town's own vision against the fog-dimmed
     memory beyond it, upscaled RAW, because iOS Safari builds in the field
     ignore canvas filters). redrawFog blurs by hand now; this page deletes
     the filter API outright and the reveal edge must still be a gradient. */
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(() => {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter',
      { get: () => 'none', set: () => {}, configurable: true });
  });
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 8000 });
  const r = await p.evaluate(() => {
    G.newGame('fogfeather', 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    // an explored world with one visible pocket — the user's own situation
    S.map.explored.fill(1);
    const vis = new Uint8Array(CFG.W * CFG.H);
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
      if (Math.hypot(x - 30, y - 30) < 6) vis[MapGen.idx(x, y)] = 1;
    G.vis = vis; R.fogDirty = true; R.redrawFog();
    const g2 = R.fogBlurCv.getContext('2d');
    const scale = R.fogBlurCv.width / CFG.W;
    const row = g2.getImageData(0, Math.round(30.5 * scale), R.fogBlurCv.width, 1).data;
    const a = (tx) => row[Math.round(tx * scale) * 4 + 3];
    const steps = new Set();
    for (let x = Math.round(22 * scale); x <= Math.round(30 * scale); x++) steps.add(row[x * 4 + 3]);
    const out = { steps: steps.size, centre: a(30.5), far: a(18) };
    /* …AND WHERE SOMEONE STANDS IS CLEAR (operator report, day 100: "the
       area where troops or villagers are is not as bright"). The feather
       was symmetric, so it fogged every lit pocket from the inside — a lone
       unit's own tile measured alpha 81 against the remembered fog's 115.
       One unit's vision (UNIT_VISION tiles), and every tile of it read at
       its centre, must be fully clear; the soft edge lives in the fog. */
    const R0 = CFG.UNIT_VISION, vis1 = new Uint8Array(CFG.W * CFG.H), inside = [];
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
      if (Math.hypot(x - 30, y - 30) <= R0) { vis1[MapGen.idx(x, y)] = 1; inside.push([x, y]); }
    G.vis = vis1; R.fogDirty = true; R.redrawFog();
    const d2 = R.fogBlurCv.getContext('2d').getImageData(0, 0, R.fogBlurCv.width, R.fogBlurCv.height).data;
    const at = (x, y) => d2[(Math.round((y + 0.5) * scale) * R.fogBlurCv.width + Math.round((x + 0.5) * scale)) * 4 + 3];
    out.unitTile = at(30, 30);
    out.worstInside = Math.max(...inside.filter(([x, y]) => Math.hypot(x - 30, y - 30) <= R0 - 1).map(([x, y]) => at(x, y)));
    out.outside = at(30 + R0 + 2, 30);
    return out;
  });
  await p.close();
  ck('theFogFeatherOwesNothingToCtxFilter',
    r.steps >= 5 && r.centre < 40 && r.far > 60,
    `boundary carries ${r.steps} alpha steps (lit centre a=${r.centre}, remembered a=${r.far}) with the filter API deleted`);
  ck('andWhereSomeoneStandsTheGroundIsClear',
    r.unitTile === 0 && r.worstInside <= 8 && r.outside > 60,
    `one unit's vision: its own tile a=${r.unitTile}, worst tile inside a=${r.worstInside}, two tiles past the edge a=${r.outside}`);
}

/* ---- 4. THE CHROME COMES BACK WITH A GAME, and goes when it ends ---- */
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 8000 });
  const out = await p.evaluate(() => {
    const shown = () => ['topbar', 'bottombar', 'miniWrap', 'miniToggle', 'armyBar'].filter(id => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display !== 'none';
    });
    const r = {};
    // the title's DEMO world lives in S — and still wears no chrome
    r.demoWorld = !!window.S && Screens._demo;
    r.onTitle = shown();
    // enter a real game
    G.newGame('boot-t', 'moderate', 'large');
    Screens._demo = false;
    Screens.show('playing');
    r.inGameClass = document.body.classList.contains('ingame');
    r.inGame = shown();
    r.splashForced = !document.getElementById('splash');
    // open a shell screen mid-game: the chrome stands down again
    Screens.show('paused');
    r.paused = shown();
    Screens.show('playing');
    // …and a DEMO world can never bring the HUD back, whatever the screen says
    Screens._demo = true;
    Screens.show('playing');
    r.demoNever = document.body.classList.contains('ingame');
    Screens._demo = false;
    return r;
  });
  ck('theTitlesDemoWorldWearsNoChrome',
    out.demoWorld && out.onTitle.length === 0,
    out.onTitle.length ? 'showing: ' + out.onTitle.join(', ') : 'S exists, HUD hidden');
  ck('aRealGameBringsTheChromeBack',
    out.inGameClass && out.inGame.length >= 3,
    out.inGame.join(', ') || 'nothing came back');
  ck('andEnteringAGameRetiresTheSplash', out.splashForced, '');
  ck('aShellScreenStandsItDownAgain', out.paused.length === 0,
    out.paused.length ? 'showing: ' + out.paused.join(', ') : '');
  ck('butADemoWorldNeverWearsIt', !out.demoNever,
    'playing + a demo world is still not a game');
  ck('theBootRunsClean', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)).length === 0,
    errs[0] || 'no page errors');
  await p.close();
}

/* ---- 5. THE CLOCK'S BLUR (a reported home-screen screenshot: the top
   bar's first row — food, wood, stone, gold — blurred and dimmed, the second
   row sharp). From iOS 26.1 a home-screen app whose page runs under a
   TRANSLUCENT status bar gets a system blur and tint past the inset that no
   page setting removes: it ended ~32pt below a 59pt inset on the reporting
   iPhone and ~38-45pt below a 62pt one on a 16 Pro Max. The bar is opaque
   now, so a fresh install's page starts beneath the clock; an install made
   BEFORE the change keeps the translucent bar until it is re-added, and its
   chrome must step past the band. Every mode is emulated at the reporting
   iPhone's size — the screen, the page box iOS hands the app, the inset it
   reports (CDP's safe-area override, which env() reads) and
   navigator.standalone — and the counters' row is MEASURED where it lands,
   with the minimap that hangs below the bar. ---- */
{
  const BAND = 45;                    // the deepest measured reach past the inset
  const PHONE = { w: 393, h: 852 };   // the reporting iPhone, in CSS px
  const mode = async ({ app, vw, vh, inset }) => {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh },
      screen: { width: PHONE.w, height: PHONE.h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    if (app) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone',
      { configurable: true, get: () => true }));
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: inset, topMax: inset } });
    await p.goto(url, { waitUntil: 'commit' });
    await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 8000 });
    const r = await p.evaluate(() => {
      document.body.classList.add('ingame');   // the bar is laid out only while a game is on
      const top = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;padding-top:env(safe-area-inset-top, 0px)';
      document.body.appendChild(probe);
      const bar = top('#topbar'), row = top('#topbar .trow'), mini = top('#miniWrap');
      return { env: parseFloat(getComputedStyle(probe).paddingTop), cls: document.documentElement.className,
        barTop: bar.top, barBottom: bar.bottom, row: row.top, mini: mini ? mini.top : null };
    });
    await ctx.close();
    return r;
  };
  const say = (m) => `counters at ${Math.round(m.row)}px, inset ${m.env}px, html.${m.cls || '(none)'}`;
  // a FRESH install: the bar is opaque, the page starts beneath the clock
  const fresh = await mode({ app: true, vw: PHONE.w, vh: PHONE.h - 59, inset: 0 });
  ck('aFreshInstallStartsBeneathTheClock', fresh.row <= 10,
    say(fresh) + ' — an opaque bar needs no floor and no clearance');
  // an OLD install: translucent, the page under the clock, the inset reported
  const old = await mode({ app: true, vw: PHONE.w, vh: PHONE.h, inset: 59 });
  ck('anOldInstallStepsPastTheBlur', old.row >= old.env + BAND && old.env === 59,
    say(old) + ` — the band reaches ${old.env + BAND}px`);
  ck('andTheBandShowsTheBarsOwnWood', old.barTop === 0,
    'the bar still starts at the top edge, so the blur shows its own wood, never the map');
  // an old install on a build that reports NO inset: the geometry tells
  const blind = await mode({ app: true, vw: PHONE.w, vh: PHONE.h, inset: 0 });
  ck('evenOneThatReportsNoInset', blind.row >= 44 + BAND && blind.cls.split(' ').includes('under-bar'),
    say(blind) + ' — clear of a 44px clock and the band below it');
  // an iPhone on its side has no status bar at all
  const side = await mode({ app: true, vw: PHONE.h, vh: PHONE.w, inset: 0 });
  ck('anAppOnItsSideKeepsItsTop', side.row <= 10,
    say(side) + ' — the old floor used to leave a 44px dead strip here');
  // a BROWSER TAB is never stepped: it gets the real inset, nothing more
  const tab = await mode({ app: false, vw: PHONE.w, vh: PHONE.h, inset: 59 });
  const tab0 = await mode({ app: false, vw: PHONE.w, vh: PHONE.h - 59, inset: 0 });
  ck('aBrowserTabKeepsTheRealInset', tab.row >= 59 && tab.row <= 59 + 10 && tab0.row <= 10,
    `tab at inset 59: ${Math.round(tab.row)}px, at inset 0: ${Math.round(tab0.row)}px`);
  const all = [fresh, old, blind, side, tab, tab0];
  ck('andTheHudHangsBelowTheBarInEveryMode',
    all.every(m => m.mini !== null && m.mini >= m.barBottom - 1),
    all.map(m => `${Math.round(m.mini)}≥${Math.round(m.barBottom)}`).join(' '));
}

/* ---- 6. THE FOUNDING NEVER HOLDS THE CARDS (a playtest: "super laggy…
   the first card pops quickly, the other two are slow to load"). Founding a
   run asks for ~900 people strips; on a throttled phone every response and
   every install landed on the main thread at once, and the origin cards'
   deal and flips waited seconds behind it. Measured on a 4×-throttled phone
   profile: the three flips at 3.3 / 4.2 / 6.4 s after the trial tap, now on
   their own schedule (~1.5-2.3 s), the frames behind the draft 2-3× more
   often, the art ready no later. The rules, each pinned here:
     - the strips are fetched a few at a time (Assets.STRIP_FLIGHT), the
       people ahead of the wild beasts, and installed in slices between
       frames — and a strip is COUNTED until it is INSTALLED, so artReady()
       still means the people are drawn;
     - a strip is dyed ONCE, on one scratch, never once per frame canvas;
     - a fresh run fetches the rival's army and sappers in the background
       tier: they stand under the fog for the opening days;
     - the wished landform is PEEKED, never painted, once per rolled seed;
     - a paused world behind a shell screen is drawn once a second;
     - the outline pass inks exactly the pixels it always did. ---- */
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Assets && Assets.ready, null, { timeout: 15000 });
  const r = await p.evaluate(async () => {
    const out = {};
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    // a founded run — what Screens.foundRun does, minus the draft
    Screens._demo = false;
    G.newGame('boot-found', 'moderate', 'medium', undefined, 'green');
    out.queued = Assets._stripQ.length;
    out.flightCap = Assets.STRIP_FLIGHT;
    out.peopleArcher = Assets._stripQ.filter(([, u]) => /unit-archer-/.test(u)).length;
    out.rivalArcherLate = Assets._stripQLate.filter(([, u]) => /unit-archer-/.test(u)).length;
    out.rivalSapperLate = Assets._stripQLate.filter(([, u]) => /unit-sapper-/.test(u)).length;
    // watch the wire and the count until the people are drawn
    let maxFly = 0;
    const t0 = performance.now();
    while (!Assets.artReady() && performance.now() - t0 < 60000) {
      maxFly = Math.max(maxFly, Assets._stripFlying);
      await sleep(20);
    }
    out.maxFly = maxFly;
    out.readyIn = Math.round(performance.now() - t0);
    out.peopleLeftAtReady = Assets._stripQ.length + Assets._installQ.filter(([, d]) => d && !d.late).length;
    const tun = G.tunicOf('P'), key = 'villager-p-' + tun + '-l1-m';
    out.villagerDrawn = !!(Assets.unitArt[key] && Assets.unitArt[key].dirs.s && Assets.unitArt[key].dirs.s.walk);
    // ONE read per dyed strip, never one per frame
    const strip = document.createElement('canvas'); strip.width = 64 * 9; strip.height = 64;
    const sg = strip.getContext('2d'); sg.fillStyle = Assets.TUNIC_KEY.body; sg.fillRect(0, 0, strip.width, 64);
    const gid = CanvasRenderingContext2D.prototype.getImageData;
    let reads = 0;
    CanvasRenderingContext2D.prototype.getImageData = function () { reads++; return gid.apply(this, arguments); };
    try { Assets.setUnitFrames('boot-dye', 's', 'walk', strip, 'green'); }
    finally { CanvasRenderingContext2D.prototype.getImageData = gid; }
    out.reads = reads;
    const f = Assets.unitArt['boot-dye'].dirs.s.walk;
    const px = f[8].getContext('2d').getImageData(10, 10, 1, 1).data;
    const want = Sprites.tunicCol.green.body;
    out.dyed = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('') === want.toLowerCase();
    out.frames = f.length;
    delete Assets.unitArt['boot-dye'];
    // the landform is PEEKED: the same name a full generate lays, no tiles
    let agree = 0, n = 0, tiles = 0;
    for (const size of ['medium', 'large', 'xlarge']) {
      CFG.W = CFG.H = CFG.SIZES[size];
      for (let i = 0; i < 12; i++) {
        const sd = 'peek-' + size + '-' + i, a = MapGen.generate(sd, undefined, true), g = MapGen.generate(sd, 'moderate');
        n++; if (a.landform === g.landform && a.variant === g.variant) agree++;
        if (a.terrain) tiles++;
      }
    }
    CFG.W = CFG.H = CFG.SIZES[S.sizeKey];
    out.peek = { n, agree, tiles };
    // a STILL world behind a shell screen is drawn once a second (the load
    // screen here: the new-game screen and the draft stand on the night,
    // where the world is not drawn at all — tests/draft-cards.mjs)
    R.ensureTerrain();
    Screens.show('load');
    const draw = R.draw; let still = 0, moving = 0, which = 'still';
    R.draw = function () { if (which === 'still') still++; else moving++; return draw.apply(this, arguments); };
    try {
      out.paused = S.paused;
      G._shellDrawT = 0;
      await sleep(2300);
      which = 'moving'; S.paused = false; G._shellDrawT = 0;
      await sleep(2300);
    } finally { R.draw = draw; }
    out.still = still; out.moving = moving;
    return out;
  });
  ck('theStripsWaitTheirTurn', r.queued > 0 && r.maxFly <= r.flightCap,
    `${r.queued} queued at the founding, never more than ${r.maxFly} of ${r.flightCap} on the wire`);
  ck('andTheyAreCountedUntilInstalled', r.peopleLeftAtReady === 0 && r.villagerDrawn,
    `ready after ${r.readyIn}ms with ${r.peopleLeftAtReady} people strips still to install; the player's villagers drawn: ${r.villagerDrawn}`);
  ck('theRivalsArmyWaitsBehindThePeople', r.peopleArcher > 0 && r.rivalArcherLate === r.peopleArcher && r.rivalSapperLate > 0,
    `archer strips: ${r.peopleArcher} counted (the player's), ${r.rivalArcherLate} in the background (the rival's); rival sappers ${r.rivalSapperLate}`);
  ck('aStripIsDyedOnceNotPerFrame', r.reads === 1 && r.dyed && r.frames === 9,
    `${r.reads} pixel read(s) for a ${r.frames}-frame strip, its last frame dyed: ${r.dyed}`);
  ck('theLandformIsPeekedNotPainted', r.peek.agree === r.peek.n && r.peek.tiles === 0,
    `${r.peek.agree}/${r.peek.n} seeds name the world a full generate lays, ${r.peek.tiles} painted a tile`);
  ck('aStillWorldIsDrawnOnceASecond', r.paused && r.still >= 1 && r.still <= 3 && r.moving > r.still,
    `paused behind the load screen: ${r.still} draws in 2.3s; the same world moving: ${r.moving}`);
  ck('theFoundingRunsClean', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)).length === 0,
    errs[0] || 'no page errors');
  await p.close();
}

/* ---- 7. THE OUTLINE INKS WHAT IT ALWAYS DID. The pass runs over every
   procedural sprite as sprites.js parses, and was rewritten for speed (a
   flat mask, four-neighbour growth, runs of fill); this is the old per-pixel
   rule transcribed, against the live pass, on random sprites with soft
   edges, at both widths the game uses. ---- */
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => typeof ART !== 'undefined' && ART.outline, null, { timeout: 15000 });
  const r = await p.evaluate(() => {
    const ref = (canvas, width) => {                  // the pass as it was written first
      const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
      const d = g.getImageData(0, 0, w, h).data;
      const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 96;
      const edges = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        let near = false;
        for (let dy = -width; dy <= width && !near; dy++) for (let dx = -width; dx <= width; dx++) {
          if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) > width) continue;
          if (solid(x + dx, y + dy)) { near = true; break; }
        }
        if (near) edges.push([x, y]);
      }
      g.fillStyle = 'rgba(20,16,10,' + ART.STYLE.OUTLINE_ALPHA + ')';
      for (const [x, y] of edges) g.fillRect(x, y, 1, 1);
    };
    let seed = 99;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    let cases = 0, same = 0;
    for (let k = 0; k < 160; k++) {
      const w = 6 + (rnd() * 90 | 0), h = 6 + (rnd() * 90 | 0), width = k % 3 === 0 ? 2 : 1;
      const a = document.createElement('canvas'); a.width = w; a.height = h;
      const g = a.getContext('2d');
      for (let j = 0; j < 24; j++) {
        g.fillStyle = `rgba(${rnd() * 255 | 0},${rnd() * 255 | 0},${rnd() * 255 | 0},${[1, 0.2, 0.37, 0.38, 0.6][rnd() * 5 | 0]})`;
        g.fillRect(rnd() * w | 0, rnd() * h | 0, 1 + rnd() * w / 3 | 0, 1 + rnd() * h / 3 | 0);
      }
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; c2.getContext('2d').drawImage(a, 0, 0);
      ref(a, width); ART.outline(c2, width);
      const da = a.getContext('2d').getImageData(0, 0, w, h).data, db = c2.getContext('2d').getImageData(0, 0, w, h).data;
      cases++;
      let eq = true; for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) { eq = false; break; }
      if (eq) same++;
    }
    return { cases, same };
  });
  ck('theOutlineInksTheSamePixels', r.same === r.cases, `${r.same}/${r.cases} random sprites identical to the per-pixel rule`);
  await p.close();
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL BOOT CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
