/* THE TRIAL AND ORIGIN CARDS — the contract for CardFace (js/screens.js),
   the burn (Screens._burnCard) and the card icons (assets/icons/cards/).

   The operator, once the deck had shipped: the difficulty and origin screens
   "feel bland… let's create higher quality looking cards, higher pixel
   count, maybe card borders, and for the difficulty, higher pixel count
   icons… increase pixel count and frames for the flame animations to really
   sell the idea of the cards burning up… Important that this work doesn't
   hurt the loading rate and speed wins that we just gained." So:

   1. THE BOOT FETCHES NO CARD ART, AND THE TAP BUILDS NOTHING. Nothing on
      these screens is asked for before the splash lifts; once the title is
      up and quiet the trial cards are laid out unseen and dressed, every
      card picture is fetched and the origin frames are built (operator, on
      the first test build: "when you click New Game, [the live build] loads
      the difficulty select instantly. We've reintroduced delays"). So the
      New Game tap builds no frame and its very first frame wears every
      frame and picture, and the draft finds its three pictures waiting.
      Both card screens stand on the title's night painting, and the world
      under it is not drawn (it used to show black until its bake was done).
   2. THE FRAMES ARE VECTORS, BUILT TO THEIR BOX: every trial and origin
      card wears an SVG frame and back, handed over as one picture each (a
      data: URL — the browser rasterises it at the screen's own pixels, and
      the card adds one element to the page, not a hundred); no emoji, no
      raster chrome.
   3. THE PICTURES ARE AT THE SCREEN'S OWN PIXELS: an icon canvas's backing
      store is its CSS box times the device's pixel ratio, and the icons are
      256px art.
   4. THE WORDS FIT: every name on every origin card sits on its plate and
      every boon in its field, at a small phone, a phone and a desktop (only
      the flavour line may yield, never the boon).
   5. THE FIRE IS FINE AND EVERY FRAME IS A FRAME: a fire cell is at most two
      device pixels, the fire draws on every animation frame, the card's body
      is clipped away under a rising front, the card is gone once the front
      has crossed it and the canvas once the flames have guttered; leaving
      the draft tears it down; reduced motion fades the card instead; the
      world opens only after the front has crossed (DRAFT_BURN_MS ≥ BURN.ms).
   6. A PAINTER STANDS DOWN: without the title's SVG helpers (a cached older
      titlescreen.js) the cards keep their old wood face and nothing throws.

     node tests/draft-cards.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch {
  try { pw = (await import('/opt/node-tools/node_modules/playwright/index.js')).default; }
  catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + join(root, 'index.html');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });   // the icons bake into canvases the checks read
const SEEN = () => { try { localStorage.setItem('neo-cards-intro', '1'); localStorage.setItem('neo-draft-help', '1'); } catch (e) {} };
async function open(w, h, dpr, opts) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: dpr > 1, hasTouch: dpr > 1,
    reducedMotion: (opts && opts.reduce) ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(SEEN);
  if (opts && opts.init) await ctx.addInitScript(opts.init);
  const p = await ctx.newPage();
  const errs = [], reqs = [], stamps = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('request', r => { reqs.push(r.url()); stamps.push(Date.now()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && !document.getElementById('splash'), null, { timeout: 30000 });
  return { ctx, p, errs, reqs, stamps };
}
const cardArt = u => /assets\/icons\/cards\//.test(u);
const toDraft = async (p, mode) => {
  await p.evaluate(m => { document.getElementById('btnTitleNew').click();
    const c = document.querySelector('#ngMode .dcard[data-v="' + m + '"]'); c.click(); c.click(); }, mode || 'moderate');
  await p.waitForFunction(() => Screens.current === 'draft', null, { timeout: 30000 });
};

/* ---- 1-3. the boot, the trial screen, the deal ---- */
{
  const { ctx, p, errs, reqs, stamps } = await open(390, 844, 3);
  // the card screens are made ready while the title is read: wait for it
  await p.waitForFunction(() => Screens._cardPrepAt > 0 && ['calm', 'moderate', 'hard'].every(m => CardFace._trial[m] && CardFace._trial[m].ok) &&
    Assets.originMotifs().every(m => Assets.originState(m) === 'ok') && !!Screens._fireTex, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(200);
  const prep = await p.evaluate(() => ({ at: performance.timeOrigin + (Screens._cardPrepAt || 0), lifted: !!(window.Boot && Boot.done), n: Assets.originMotifs().length,
    ok: Assets.originMotifs().filter(m => Assets.originState(m) === 'ok').length, tex: !!Screens._fireTex,
    trial: ['calm', 'moderate', 'hard'].filter(m => CardFace._trial[m] && CardFace._trial[m].ok).length,
    dressed: [...document.querySelectorAll('#ngMode .dcard')].filter(c => c.classList.contains('framed')).length }));
  const early = reqs.filter((u, i) => cardArt(u) && stamps[i] < prep.at - 2);
  ck('theBootFetchesNoCardArt', prep.at > 0 && prep.lifted && early.length === 0, early.map(u => u.split('/').pop()).join(', ') || 'none before the title was up and quiet');
  ck('theCardScreensAreMadeReadyWhileTheTitleIsRead', prep.trial === 3 && prep.ok === prep.n && prep.n === 26 && prep.dressed === 3 && prep.tex,
    JSON.stringify(prep));
  // THE TAP BUILDS NOTHING, AND ITS FIRST FRAME WEARS EVERYTHING
  const tap = await p.evaluate(() => new Promise(res => {
    let built = 0; const f = CardFace.frame;
    CardFace.frame = function () { built++; return f.apply(this, arguments); };
    document.getElementById('btnTitleNew').click();
    CardFace.frame = f;
    requestAnimationFrame(() => {
      const ready = [...document.querySelectorAll('#ngMode .dcard')].map(c => {
        const im = c.querySelector(':scope > img.cfr'), cv = c.querySelector('canvas.dart');
        let ink = 0;
        try { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) ink++; } catch (e) { ink = -1; }
        return !!(im && im.complete && im.naturalWidth) && ink > 2000;
      });
      res({ built, ready, night: document.getElementById('shell').classList.contains('night') && Screens.nightUp() });
    });
  }));
  ck('theTrialScreenOpensOnFinishedCards', tap.built === 0 && tap.ready.length === 3 && tap.ready.every(Boolean), JSON.stringify(tap));
  ck('andStandsOnTheNight', tap.night, '');
  await p.waitForFunction(() => [...document.querySelectorAll('#ngMode .dcard canvas.dart')].every(c => c._cfFit), null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(900);
  const t = await p.evaluate(() => {
    const dpr = Math.min(3, devicePixelRatio || 1), out = { cards: [] };
    for (const c of document.querySelectorAll('#ngMode .dcard')) {
      const cv = c.querySelector('canvas.dart'), nm = c.querySelector('.dname'), ln = c.querySelector('.dline');
      let ink = 0;
      try { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) ink++; } catch (e) { ink = -1; }
      out.cards.push({ v: c.dataset.v, framed: c.classList.contains('framed'), svg: /^data:image\/svg\+xml/.test((c.querySelector(':scope > img.cfr') || {}).src || ''),
        img: c.querySelectorAll('img:not(.cfr)').length, emoji: /\p{Extended_Pictographic}/u.test(c.textContent),
        backing: cv.width, css: parseFloat(cv.style.width), dev: Math.round(parseFloat(cv.style.width) * dpr), ink,
        nameFits: nm.firstElementChild.offsetWidth <= nm.clientWidth + 0.5 || nm.scrollHeight <= nm.clientHeight + 1,
        lineFits: ln.scrollHeight <= ln.clientHeight + 1 });
    }
    return out;
  });
  const T = t.cards;
  ck('threeTrialCardsWearVectorFrames', T.length === 3 && T.every(c => c.framed && c.svg && !c.img), JSON.stringify(T.map(c => [c.v, c.framed, c.svg, c.img])));
  ck('andNoTrialWearsAnEmoji', T.every(c => !c.emoji), JSON.stringify(T.map(c => c.emoji)));
  ck('andAreDrawnAtTheScreensOwnPixels', T.every(c => c.backing === c.dev && c.css >= 48), JSON.stringify(T.map(c => [c.backing, c.dev, c.css])));
  ck('andArePainted', T.every(c => c.ink > 2000), JSON.stringify(T.map(c => c.ink)));
  ck('theTrialWordsFit', T.every(c => c.nameFits && c.lineFits), JSON.stringify(T.map(c => [c.nameFits, c.lineFits])));
  // the draft: every dealt picture is already here, and the world under the
  // night is not drawn
  const before = reqs.length;
  await p.evaluate(() => {
    window.__late = []; window.__draws = 0;
    const f = Screens.dealOrigin;
    Screens.dealOrigin = function (el, key) { const m = Cards.DEFS[key] && Cards.DEFS[key].motif; if (m && Assets.originState(m) !== 'ok') window.__late.push(m); return f.apply(this, arguments); };
    const dr = R.draw; R.draw = function () { if (Screens.current === 'draft') window.__draws++; return dr.apply(this, arguments); };
    const c = document.querySelector('#ngMode .dcard[data-v="moderate"]'); c.click(); c.click();
  });
  await p.waitForFunction(() => Screens.current === 'draft', null, { timeout: 30000 });
  await p.waitForTimeout(2200);
  // a world whose bake is done would be drawn once a second behind any other
  // shell screen; under the night it is not drawn at all
  await p.evaluate(() => { R.holdBake = false; R.ensureTerrain(); window.__draws = 0; });
  await p.waitForTimeout(1600);
  const d = await p.evaluate(() => {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const cards = [...document.querySelectorAll('#draftCards .ocard')];
    return { motifs: S.draft.hand.map(c => Cards.DEFS[c.key].motif), n: cards.length,
      framed: cards.every(c => [c.querySelector('.ofront.framed > img.cfr'), c.querySelector('.oback.framed > img.cfr')].every(i => i && /^data:image\/svg\+xml/.test(i.src))),
      fit: cards.map(c => { const cv = c.querySelector('canvas'); return [cv.width, Math.round(parseFloat(cv.style.width) * dpr)]; }),
      late: window.__late, draws: window.__draws, night: document.getElementById('shell').classList.contains('night') && Screens.nightUp(),
      tex: !!Screens._fireTex };
  });
  const got = reqs.slice(before).filter(u => /origin-/.test(u)).map(u => u.split('/').pop().split('?')[0]);
  ck('theDraftFindsItsPicturesWaiting', d.n === 3 && got.length === 0 && d.late.length === 0, JSON.stringify({ got, motifs: d.motifs, late: d.late }));
  ck('andTheWorldUnderTheNightIsNotDrawn', d.night && d.draws === 0, JSON.stringify({ night: d.night, draws: d.draws }));
  ck('theDealtCardsWearVectorFacesAndBacks', d.framed, '');
  ck('andTheirPicturesAreAtTheScreensOwnPixels', d.fit.every(([a, c]) => a === c), JSON.stringify(d.fit));
  ck('theFiresNoiseIsReadyBeforeTheBurn', d.tex, '');
  ck('thePagesThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---- 4. every origin's words fit, at three sizes ---- */
for (const [w, h, dpr] of [[320, 568, 2], [390, 844, 3], [1440, 900, 1]]) {
  const { ctx, p, errs } = await open(w, h, dpr);
  await toDraft(p, 'calm');
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const box = document.getElementById('draftCards'), bad = [];
    let n = 0, flavourDropped = 0;
    for (const k of Object.keys(Cards.DEFS)) {
      const d = Cards.DEFS[k];
      for (let t = 0; t < 3; t++) {
        box.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'ocard dealt flip';
        el.innerHTML = Screens.originCardHTML(d, { key: k, roll: d.roll() });
        box.appendChild(el);
        Screens.dealOrigin(el, k);
        await new Promise(r => requestAnimationFrame(() => r()));   // the words are fitted in the next frame
        const nm = el.querySelector('.oname'), tx = el.querySelector('.otext'), boon = el.querySelector('.oboon');
        n++;
        const nameOk = nm.firstElementChild.offsetWidth <= nm.clientWidth + 0.5 || nm.scrollHeight <= nm.clientHeight + 1;
        const textOk = tx.scrollHeight <= tx.clientHeight + 1 && boon.offsetHeight > 0;
        if (tx.classList.contains('tight')) flavourDropped++;
        if (!nameOk || !textOk) bad.push(k + (nameOk ? '' : ' name') + (textOk ? '' : ' text'));
      }
    }
    return { n, bad: [...new Set(bad)], flavourDropped };
  });
  ck('everyOriginsWordsFit@' + w, r.bad.length === 0, r.bad.join(', ') || (r.n + ' deals, flavour dropped on ' + r.flavourDropped));
  ck('andThatPageThrewNothing@' + w, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---- 5. the burn, on a held clock ---- */
const HOLD = () => {
  window.__hold = () => {
    Screens.DRAFT_BURN_MS = 1e9;
    let T = performance.now(); const q = [];
    performance.now = () => T;
    window.requestAnimationFrame = fn => { q.push(fn); return q.length; };
    const st0 = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => ms > 1000 ? 0 : st0(fn, ms, ...a);   // the card's real-time failsafe waits
    window.__adv = ms => { const end = T + ms; while (T < end) { T = Math.min(end, T + 1000 / 60); for (const fn of q.splice(0)) fn(T); } };
  };
};
for (const [w, h, dpr] of [[390, 844, 3], [1440, 900, 1]]) {
  const { ctx, p, errs } = await open(w, h, dpr, { init: HOLD });
  await toDraft(p);
  await p.waitForTimeout(2400);
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#draftCards .ocard')];
    cards[1].click();
    __hold();
    cards[1].click();                                  // kept: the other two burn
    const out = { dpr: Math.min(3, devicePixelRatio || 1), B: Screens.BURN, wait: Screens.DRAFT_BURN_MS };
    const front = c => { const m = (c.style.clipPath || '').match(/[\d.]+px [\d.]+px/g) || []; const ys = m.slice(2).map(s => parseFloat(s.split(' ')[1])); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : -1; };
    out.cvs = [...document.querySelectorAll('#draftCards canvas.burnfx')].map(c => ({ cell: c._cfCell, pix: c.style.imageRendering }));
    __adv(250); out.f250 = front(cards[0]); out.lit250 = Screens._burnStats().cellsLit;
    __adv(350); out.f600 = front(cards[0]); out.lit600 = Screens._burnStats().cellsLit; out.poly = /^polygon\(/.test(cards[0].style.clipPath);
    __adv(500); out.gone = cards[0].classList.contains('gone') && cards[2].classList.contains('gone'); out.frames = Screens._burnStats().frames;
    out.kept = cards[1].classList.contains('chosen') && !cards[1].classList.contains('gone');
    __adv(1500); out.left = document.querySelectorAll('#draftCards canvas.burnfx').length;
    return out;
  });
  ck('twoCardsBurnInFineFire@' + w, r.cvs.length === 2 && r.cvs.every(c => c.cell >= 1 && c.cell <= 2 && c.pix === 'pixelated'), JSON.stringify(r.cvs));
  ck('theFireIsAlight@' + w, r.lit250 > 400 && r.lit600 > 400, JSON.stringify([r.lit250, r.lit600]));
  ck('theCardBurnsUpUnderARisingFront@' + w, r.poly && r.f250 > 0 && r.f600 < r.f250 - 20, JSON.stringify([r.f250, r.f600]));
  ck('everyFrameIsAFrame@' + w, r.frames >= 60, r.frames + ' frames in 1.1s');
  ck('theBurntCardsGoAndTheKeptOneStays@' + w, r.gone && r.kept, JSON.stringify([r.gone, r.kept]));
  ck('andTheFireGutsOut@' + w, r.left === 0, r.left + ' canvases left');
  ck('andThatBurnThrewNothing@' + w, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const src = readFileSync(join(root, 'js/screens.js'), 'utf8');
  const wait = +(src.match(/DRAFT_BURN_MS:\s*(\d+)/) || [])[1], ms = +(src.match(/BURN:\s*\{\s*ms:\s*(\d+)/) || [])[1];
  ck('theWorldOpensAfterTheFrontHasCrossed', wait >= ms && ms > 0 && wait <= ms + 400, JSON.stringify({ wait, ms }));
}
// leaving the draft mid-burn tears it down; reduced motion fades instead
{
  const { ctx, p, errs } = await open(390, 844, 3, { init: HOLD });
  await toDraft(p);
  await p.waitForTimeout(2400);
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#draftCards .ocard')];
    cards[0].click(); __hold(); cards[0].click();
    __adv(200);
    const mid = document.querySelectorAll('#draftCards canvas.burnfx').length;
    Screens.show('title');
    __adv(50);
    return { mid, after: document.querySelectorAll('#draftCards canvas.burnfx').length, gone: cards[1].classList.contains('gone') && cards[2].classList.contains('gone') };
  });
  ck('leavingTheDraftTearsTheFireDown', r.mid === 2 && r.after === 0 && r.gone, JSON.stringify(r));
  ck('andThatThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open(390, 844, 3, { reduce: true });
  await toDraft(p);
  await p.waitForTimeout(2400);
  const r = await p.evaluate(async () => {
    Screens.DRAFT_BURN_MS = 1e9;
    const cards = [...document.querySelectorAll('#draftCards .ocard')];
    cards[0].click(); cards[0].click();
    const fire = document.querySelectorAll('#draftCards canvas.burnfx').length, op = cards[1].style.opacity;
    await new Promise(r => setTimeout(r, 600));
    return { fire, op, gone: cards[1].classList.contains('gone') && cards[2].classList.contains('gone') };
  });
  ck('reducedMotionFadesTheCardsInstead', r.fire === 0 && r.op === '0' && r.gone, JSON.stringify(r));
  ck('andThatFadeThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---- 6. a painter stands down ---- */
{
  const { ctx, p, errs } = await open(390, 844, 3, { init: () => {
    // a cached older titlescreen.js: the plaque helpers the frames borrow are not there
    const t = setInterval(() => { if (window.TitleScreen) { delete TitleScreen.caps; clearInterval(t); } }, 1);
  } });
  await toDraft(p);
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#draftCards .ocard')], trials = [...document.querySelectorAll('#ngMode .dcard')];
    return { framed: cards.some(c => c.querySelector('.framed')) || trials.some(c => c.classList.contains('framed')),
      drawn: cards.every(c => { const cv = c.querySelector('canvas'); return cv && cv.width > 0; }), n: cards.length };
  });
  ck('withoutTheHelpersTheWoodFacesStand', r.n === 3 && !r.framed && r.drawn, JSON.stringify(r));
  ck('andNothingThrows', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await b.close();

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (fails.length) { console.log('\n' + fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('\nALL ' + Object.keys(res).length + ' DRAFT-CARD CHECKS PASS');
