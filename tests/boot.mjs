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
                declaration, and a --safe-min floor that boot raises on iOS
                standalone, where black-translucent runs the page under the
                status bar and the clock lands on the food counter.

   Run this after touching any of:
     index.html — the splash block, the Boot script, the body.ingame gate,
                  --safe-top / --safe-min, the viewport meta
     screens.js — show() (the ingame class, the Boot.force call)
     game.js — the load handler's first-frame markReady

     node tests/boot.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + join(root, 'index.html');
const b = await pw.chromium.launch();
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
  const tag = body.slice(iSplash - 60, iSplash + 1200);   // wide enough for the <picture> block
  ck('itCarriesItsOwnInlineStyles',
    /style="[^"]*position:fixed/.test(tag) && /style="[^"]*z-index:\s*\d/.test(tag),
    'it needs no stylesheet to cover the screen');
  ck('itShowsTheLogoFile', /assets\/ui\/logo\.png/.test(tag), '');
  ck('itPaintsOnTheGamesOwnGround', /background:\s*#0d0b08/.test(tag),
    'the dark theme ground — never a white or transparent flash');
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
     where the home-screen icon's ornate border and wheat turn to mush — two
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
  /* THE SPLASH IMAGE GATES FIRST PAINT, so it is served as WebP with the PNG
     still behind it — a browser without WebP must get a logo, not the bare
     dark screen the splash exists to prevent. */
  {
    const tag = body.slice(iSplash, iSplash + 900);
    const hasWebp = /srcset="[^"]*\.webp"/.test(tag);
    ck('theSplashIsServedLight', hasWebp, hasWebp ? 'webp source declared' : 'PNG only');
    const webpM = tag.match(/srcset="([^"]+\.webp)"/);
    if (webpM) {
      const wb = readFileSync(join(root, webpM[1])).length;
      const pb = readFileSync(join(root, 'assets/ui/logo.png')).length;
      ck('andItIsGenuinelySmaller', wb < pb * 0.5,
        Math.round(wb/1024) + 'KB vs ' + Math.round(pb/1024) + 'KB of PNG');
    }
    ck('butThePngStaysAsTheFallback', /<img[^>]+src="assets\/ui\/logo\.png"/.test(tag), '');
  }
  ck('theTopInsetHasADefaultAndAFloor',
    /--safe-top:\s*max\(env\(safe-area-inset-top,\s*0px\)/.test(html) &&
    /--safe-min:/.test(html),
    'an unknown env() would otherwise drop the whole declaration');
  ck('andTheTopBarWearsIt',
    /#topbar\s*\{[^}]*padding:\s*calc\(var\(--safe-top\)/.test(html), '');

  /* THE TITLE WEARS THE PAINTED GLEN. The menu backdrop is supplied art —
     webp served, jpg fallback — declared in the title screen's own markup so
     it starts loading with the HTML parse, behind the splash. */
  {
    const iTitle = body.indexOf('id="scrTitle"');
    const title = body.slice(iTitle, body.indexOf('id="scrNewgame"'));
    ck('theTitleWearsThePaintedBackdrop',
      /srcset="assets\/ui\/title-bg\.webp"/.test(title) &&
      /<img[^>]+src="assets\/ui\/title-bg\.jpg"/.test(title),
      'webp source + jpg fallback in #scrTitle');
    const wb = readFileSync(join(root, 'assets/ui/title-bg.webp')).length;
    const jb = readFileSync(join(root, 'assets/ui/title-bg.jpg')).length;
    ck('andTheBackdropIsServedLight', wb < jb && wb < 300 * 1024,
      Math.round(wb / 1024) + 'KB webp vs ' + Math.round(jb / 1024) + 'KB jpg');
    /* THE MENU IS DRAWN, NOT TYPED: every title button carries a pixel-SVG
       icon and none carries an emoji — Apple's glossy 3D set beside pixel
       art is the single loudest "web page" tell there is. (The cloud chip
       is JS-written and exempt; this is a claim about the buttons.) */
    const btns = [...title.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[0]);
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    ck('theMenuIsDrawnNotTyped',
      btns.length >= 6 && btns.every(t => t.includes('class="pxi"')) &&
      !btns.some(t => emoji.test(t)),
      btns.length + ' buttons, all iconed, no emoji');
    /* THE WORDMARK IS SWAPPABLE BY FILENAME. Drop assets/ui/title-logo.png
       in and it replaces the type — the same "art lands by filename" rule
       the building art follows, no code change and no manifest. It must
       reveal only on a successful decode and drop itself on a 404, or a
       repo without the file flashes a broken image where the logo goes. */
    ck('theWordmarkIsSwappableByFilename',
      /id="logoArt"[^>]+src="assets\/ui\/title-logo\.png"/.test(title) &&
      /onload="[^"]*hasLogoArt/.test(title) && /onerror="this\.remove\(\)"/.test(title) &&
      /#scrTitle\.hasLogoArt \.logo \{ display: none/.test(html),
      'art wins, type is the fallback');
    ck('andTheTypeFallbackIsStillThere', /<h1 class="logo">CLANFIRE<\/h1>/.test(title), '');
    /* and the display face is SELF-HOSTED and light — a Google Fonts
       fetch would be a third-party call on the boot path */
    const f = readFileSync(join(root, 'assets/ui/pixelify.woff2'));
    ck('theTitleFaceIsSelfHosted',
      /@font-face[^}]*url\('assets\/ui\/pixelify\.woff2'\)/.test(html) &&
      f.slice(0, 4).toString() === 'wOF2' && f.length < 30 * 1024,
      Math.round(f.length / 1024) + 'KB woff2');
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
    const cs = getComputedStyle(sp);
    const vis = (id) => {
      const el = document.getElementById(id);
      return el ? getComputedStyle(el).display !== 'none' : false;
    };
    return {
      up: !!sp && cs.opacity === '1' && cs.display !== 'none',
      covers: sp.getBoundingClientRect().width >= innerWidth - 1 &&
              sp.getBoundingClientRect().height >= innerHeight - 1,
      hud: ['topbar', 'bottombar', 'miniWrap', 'miniToggle', 'armyBar', 'toasts'].filter(vis),
      ingame: document.body.classList.contains('ingame'),
    };
  });
  ck('theSplashIsUpOnTheFirstLook', first.up, '');
  ck('andItCoversTheWholeViewport', first.covers, '');
  ck('noChromeRendersBeforeAGame', first.hud.length === 0,
    first.hud.length ? 'showing: ' + first.hud.join(', ') : 'HUD fully gated');
  ck('andTheBodyIsNotInAGame', !first.ingame, '');
  await p.close();
  if (errs.length) ck('theBootRunsClean', false, errs[0]);
}

/* ---- 3. THE HOLD, and the tap that skips it ---- */
{
  // 3a. left alone, the splash holds its beat and then lifts by itself
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Boot && window.Boot.HOLD_MS, null, { timeout: 5000 });
  /* ONE round trip, and the wait is anchored to the PAGE's own clock
     (Boot.t0). Sampling on the harness's clock measures harness latency: two
     round-trips of startup lag on a loaded machine push a "45% of the hold"
     sample past the hold itself, and the splash is then reported as lifting
     early when it did exactly the right thing. */
  const mid = await p.evaluate(async () => {
    const till = async (frac) => {
      const target = Boot.t0 + Boot.HOLD_MS * frac;
      while (performance.now() < target) await new Promise(r => setTimeout(r, 15));
      return performance.now() - Boot.t0;
    };
    const at = await till(0.4);
    const up = { at, done: Boot.done };
    /* the READINESS budget is the whole hold, not a fraction of it: the
       promise is that the world is built and drawn BEHIND the logo, so the
       lift is the timer's call and the player never waits past the beat.
       Asserting it at 40% measures the machine (a loaded box needs ~1.3s to
       boot a world), not the boot sequence. */
    const readyAt = await till(0.95);
    return {
      hold: Boot.HOLD_MS, fade: Boot.FADE_MS, fail: Boot.FAILSAFE_MS,
      up, readyAt, ready: Boot.ready, doneLate: Boot.done,
    };
  });
  // long enough to read the logo, short enough that it never feels like a wait
  ck('theHoldIsAFullBeat', mid.hold >= 3000 && mid.hold <= 5000, mid.hold + 'ms');
  ck('andTheFadeIsACrossFadeNotACut', mid.fade >= 200 && mid.fade <= 900, mid.fade + 'ms');
  ck('andAFailsafeAlwaysStartsTheGame', mid.fail > mid.hold, mid.fail + 'ms');
  ck('itHoldsThroughTheBeat', mid.up.at < mid.hold && !mid.up.done,
    mid.up.at >= mid.hold ? 'sampled late, at ' + Math.round(mid.up.at) + 'ms of ' + mid.hold
      : 'still up at ' + Math.round(mid.up.at) + 'ms of ' + mid.hold);
  ck('theTitleIsReadyBehindIt', mid.ready,
    'world built and drawn inside the ' + mid.hold + 'ms beat (by ' + Math.round(mid.readyAt) + 'ms)');
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
    await new Promise(r => setTimeout(r, Boot.FADE_MS + 200));
    return { wasDone, held: Boot.held, done: Boot.done,
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
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.Boot && Boot.ready, null, { timeout: 8000 });
  const fade = await p.evaluate(async () => {
    const el = document.getElementById('splash');
    const hasTransition = /opacity/.test(getComputedStyle(el).transitionProperty) &&
      parseFloat(getComputedStyle(el).transitionDuration) > 0.1;
    Boot.skip();
    /* sampled on a real clock, not on rAFs: a transition's first tick lands
       on the style recalc AFTER the change, so two frames in it can still
       read exactly 1 and say nothing either way */
    await new Promise(r => setTimeout(r, Math.round(Boot.FADE_MS * 0.35)));
    const mid = parseFloat(getComputedStyle(el).opacity);
    return { hasTransition, mid, target: el.style.opacity,
      still: !!document.getElementById('splash') };
  });
  ck('theSplashCarriesAnOpacityTransition', fade.hasTransition, '');
  ck('andTheLiftActuallyDrivesIt',
    fade.target === '0' && fade.still && fade.mid > 0 && fade.mid < 0.98,
    'caught mid-fade at ' + fade.mid.toFixed(2) + ' — a cut would read 1 or gone');
  await p.close();
}
{
  /* 3c. THE TAP NEVER OUTRUNS THE TITLE. A tap before the world is drawn
     shortens the wait, it does not uncover a blank screen: the splash stays
     until `ready`, then goes. */
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!window.Boot, null, { timeout: 5000 });
  const held = await p.evaluate(() => {
    Boot.ready = false;                 // pretend the title has not drawn yet
    Boot.skip();
    return { done: Boot.done, up: !!document.getElementById('splash') };
  });
  ck('aTapBeforeTheTitleIsDrawnWaitsForIt', !held.done && held.up,
    'it keeps covering the gap it exists for');
  const then = await p.evaluate(() => { Boot.markReady(); return Boot.done; });
  ck('andGoesTheInstantItIs', then, '');
  await p.close();
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

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL BOOT CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
