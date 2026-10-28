/* THE SETTINGS PAGE, OVERHAULED — the contract for js/settings.js and
   js/feedback.js (and migration 0009's door, through the test mock).

   1. STAGED BEHIND THE CARD TEST LINK. One predicate, SettingsPage.live():
      on a device the card staging flag never touched, Settings is the OLD
      screen — its markup byte for byte (a hash of the block), no new element,
      no stylesheet, no picture fetched. With ?cards=1 the new page stands in
      for it, under the same screen name, from the title and from the pause
      menu, and its back button returns to whichever it came from. Flipping
      SettingsPage.PUBLIC is the whole go-public change.
   2. ONLY REAL SETTINGS. The page's controls are exactly the known set —
      nothing unrecognised — and each one changes what it says it changes:
      the two audio switches and their dials (Sound), the autosave cadence
      (Backend.autosaveDays and its key), the guided lesson
      (Screens.tutorialWanted), the unit tips (UI.helpHidden). No Controls
      tab, no Graphics tab, no language picker. A card with nothing real in
      it is not drawn: the chief's name waits for the cloud, the save-file
      button for a game in progress.
   3. THE CADENCE IS SMALL: one segmented bar on one row, measured at 390.
   4. THE FORM: no report leaves without a valid email and a message, and
      the refusal says why; a good one sends FormSubmit's exact fields to
      the operator's address and a copy to submit_feedback; a failed email
      is KEPT in the outbox and goes again — on 'online' and on the next
      load — and the player is told plainly which happened; FormSubmit's
      "needs activation" is not delivery; a 404 from the copy's door (0009
      not applied) is silent; the client rate-limits; and a page that is not
      the site sends nothing at all.
   5. THE ERROR RING: script errors, rejected promises and the frame loop's
      recovered faults are kept (last 20) and ride in a Bug or Crash report;
      an Idea carries no technical details unless asked.
   6. IT FITS at 390x844, 430x932, 768x1024, 1440x900, 1920x1080 and a
      phone on its side (844x390): no sideways scroll, no clipped tab label,
      the frame inside the window and every rail plaque inside the frame —
      and on a wide window the frame keeps one height on every tab and
      stands in the middle of the window, never in its top half.
   7. CHROME IS DRAWN AT THE DEVICE'S OWN RESOLUTION (the operator's ruling
      on UI chrome): measured in the live page at eight sizes, every raster
      the page draws is shown at or below its own pixels on a 3x screen
      (CSS size × 3 ≤ natural size); the frame's corners are vectors; the
      patch-notes painting, a scene, is never stretched past 2x on a desktop.

     node tests/settings.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + join(root, 'index.html');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 1a. the old screen, byte for byte (the source) ---- */
const html = readFileSync(join(root, 'index.html'), 'utf8');
{
  const a = html.indexOf('  <!-- SETTINGS is three quiet rows'), b = html.indexOf('  <div class="screen" id="scrPaused">');
  const h = a >= 0 && b > a ? createHash('sha256').update(html.slice(a, b)).digest('hex') : '';
  // the block as it stood when the new page was staged (ffbeaea); a change
  // here is a change for every player, not just the staged ones
  ck('theOldScreenIsByteForByte', h === '73de79abfb979a32c4832f99e73c834dd403108575f0bafb1b8f96e3a4f07660', h.slice(0, 16));
  const src = readFileSync(join(root, 'js/settings.js'), 'utf8');
  ck('theGateIsOnePredicate', /PUBLIC:\s*false/.test(src) && (src.match(/Deck\.devOn\(\)/g) || []).length === 1 &&
    /SettingsPage\.live\(\)\) scr = SettingsPage\.mount\(\)/.test(readFileSync(join(root, 'js/screens.js'), 'utf8')),
    'SettingsPage.live(): PUBLIC || Deck.devOn() — flip PUBLIC to go public');
}

/* ---- 0. the art (PixelLab, assets/ui/settings/) — square, true alpha (the
   icons sit on wood), and big enough for where they are drawn: the tab icons
   are 128px, the report-kind icons were RE-MADE at a finer native size (the
   64px set was shown at 28 CSS px on a wide window — 1.31x its pixels at 3x),
   and the frame's corner is a vector now, so no corner picture ships at all.
   Whether each is drawn within its pixels is MEASURED, in §7; the painting
   carries a real pixel count; nothing asks for nearest-neighbour ---- */
{
  const png = (f) => {
    const buf = readFileSync(join(root, 'assets/ui/settings', f));
    return { sig: buf.slice(1, 4).toString(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: buf[25] };
  };
  const bad = [];
  const want = { 'tab-general.png': 128, 'tab-audio.png': 128, 'tab-saves.png': 128, 'tab-feedback.png': 128, 'tab-notes.png': 128,
    'kind-bug.png': 96, 'kind-idea.png': 96, 'kind-crash.png': 96, 'kind-other.png': 96 };   // at least
  for (const [f, n] of Object.entries(want)) {
    let p; try { p = png(f); } catch (e) { bad.push(f + ' missing'); continue; }
    if (p.sig !== 'PNG' || p.w < n || p.h !== p.w) bad.push(f + ' ' + p.w + 'x' + p.h);
    if (p.type !== 6) bad.push(f + ' not true alpha (type ' + p.type + ')');
  }
  let gone = true; try { png('corner.png'); gone = false; } catch (e) {}
  if (!gone) bad.push('corner.png still ships (the corner is drawn as a vector)');
  let art; try { art = png('notes-art.png'); } catch (e) { art = null; }
  if (!art || art.w < 640 || art.w / art.h < 1.8) bad.push('notes-art ' + (art ? art.w + 'x' + art.h : 'missing'));
  ck('theArtShipsAtItsSizes', bad.length === 0, bad.join('; ') || 'nine icons and a ' + art.w + 'x' + art.h + ' painting');
  ck('andNothingAsksForNearestNeighbour', !/pixelated|crisp-edges/.test(readFileSync(join(root, 'js/settings.js'), 'utf8')), '');
}

const MOCK = `
  window.__MOCK = (() => {
    const st = { uid: 'mock-uid-0001', calls: [], mails: [], rpcs: [], mail: 'ok', rpc: 'ok' };
    const session = () => ({ access_token: 't', refresh_token: 'r', user: { id: st.uid } });
    const auth = {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: session() }, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; },
    };
    const rest = (method, path, body) => {
      st.calls.push({ method, path });
      if (path.indexOf('https://formsubmit.co/ajax/') === 0) {
        if (st.mail === 'throw') throw new TypeError('Failed to fetch');
        st.mails.push({ path, body: JSON.parse(JSON.stringify(body)) });
        if (st.mail === 'activate') return { success: 'false', message: 'This form needs Activation. We\\'ve sent you an email containing an Activate Form link.' };
        return { success: 'true', message: 'The form was submitted successfully.' };
      }
      if (path === '/rpc/submit_feedback') {
        st.rpcs.push(JSON.parse(JSON.stringify(body)));
        if (st.rpc === '404') return { error: { status: 404, code: 404, message: 'Could not find the function public.submit_feedback' } };
        return { ok: true };
      }
      if (path.startsWith('/profiles') && method === 'GET') return [{ id: st.uid, chief_name: 'Ashka' }];
      return method === 'GET' ? [] : null;
    };
    return { st, auth, rest };
  })();
  window.__NEO_BACKEND_MOCK = { auth: window.__MOCK.auth, rest: window.__MOCK.rest };
`;
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const allErrs = [];
const open = async (opts) => {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: opts.vp || { width: 390, height: 844 }, deviceScaleFactor: opts.dpr || 1 });
  if (opts.clear !== false) await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('st-once')) { localStorage.clear(); sessionStorage.setItem('st-once', '1'); } } catch (e) {} });
  if (opts.init) await ctx.addInitScript(opts.init);
  if (opts.mock) await ctx.addInitScript(MOCK);
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', r => reqs.push(r.url()));
  p.on('pageerror', e => { if (!opts.expectErrors) allErrs.push((opts.tag || '') + ': ' + e); });
  await p.goto(url + (opts.q || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(m => window.Screens && Screens.current === 'title' && (!m || Backend.isReady()), !!opts.mock, { timeout: 60000 });
  return { ctx, p, reqs };
};

/* ---- 1b. a device the staging flag never touched: the old screen, and nothing new ---- */
{
  const { ctx, p, reqs } = await open({ tag: 'plain' });
  await p.waitForFunction(() => document.readyState === 'complete', null, { timeout: 30000 });
  const r = await p.evaluate(() => {
    Screens.backTo = 'title'; Screens.show('settings');
    const old = document.getElementById('scrSettings');
    return { live: SettingsPage.live(), cur: Screens.current, oldShown: old.classList.contains('show'),
      newEl: !!document.getElementById('scrSetx'), css: !!document.getElementById('setxCss'),
      dot: document.getElementById('btnTitleSettings').classList.contains('sxNew'),
      // the old page still paints its rows (Screens.onSettings ran)
      cadSel: (old.querySelector('#setCadence .abtn.sel') || {}).dataset ? old.querySelector('#setCadence .abtn.sel').dataset.v : null };
  });
  await p.waitForTimeout(300);
  const art = reqs.filter(u => /assets\/ui\/settings\//.test(u));
  ck('offTheStagingFlagItIsTheOldScreen', !r.live && r.cur === 'settings' && r.oldShown && !r.newEl, JSON.stringify(r));
  ck('andNothingOfTheNewPageExists', !r.css && !r.dot && art.length === 0, 'css ' + r.css + ', dot ' + r.dot + ', art requests ' + art.length);
  ck('andTheOldScreenStillPaintsItself', r.cadSel === '2', 'cadence sel ' + r.cadSel);
  // the flip is one line: PUBLIC on, and the same device gets the new page
  const f = await p.evaluate(() => {
    SettingsPage.PUBLIC = true; Screens.show('title'); Screens.show('settings');
    const o = { cur: Screens.current, newShown: !!(document.getElementById('scrSetx') || {}).classList && document.getElementById('scrSetx').classList.contains('show'),
      oldShown: document.getElementById('scrSettings').classList.contains('show') };
    SettingsPage.PUBLIC = false;
    return o;
  });
  ck('flippingPublicIsTheWholeGoLive', f.cur === 'settings' && f.newShown && !f.oldShown, JSON.stringify(f));
  await ctx.close();
}

/* ---- 1d. the two pieces that run for EVERYONE cost nothing and send
   nothing: the error ring is two listeners that do no work until an error,
   and the outbox retry is one storage read — with the mock answering every
   door, a device that never wrote a report sends nothing past the retry's
   moment, and writes nothing to the device ---- */
{
  const { ctx, p } = await open({ mock: true, tag: 'everyone' });
  await p.waitForFunction(() => performance.now() > 8000, null, { timeout: 30000, polling: 250 });
  const r = await p.evaluate(() => ({
    mails: __MOCK.st.mails.length, rpcs: __MOCK.st.rpcs.length, live: SettingsPage.live(),
    keys: ['neo-feedback-outbox', 'neo-errlog', 'neo-feedback-sent'].filter(k => localStorage.getItem(k) != null),
    ring: Feedback.errors().length,
  }));
  ck('forEveryoneTheRingAndTheRetrySendNothing', !r.live && r.mails === 0 && r.rpcs === 0 && r.keys.length === 0 && r.ring === 0, JSON.stringify(r));
  await ctx.close();
}

/* ---- 1c, 2, 3. staged: the new page, its doors, and only real settings ---- */
{
  const { ctx, p } = await open({ q: '?cards=1', mock: true, tag: 'staged' });
  const r = await p.evaluate(async () => {
    const o = {};
    const shown = id => { const e = document.getElementById(id); return !!(e && e.classList.contains('show')); };
    Screens.backTo = 'title'; Screens.show('settings');
    o.live = SettingsPage.live();
    o.title = { cur: Screens.current, nu: shown('scrSetx'), old: shown('scrSettings') };
    document.querySelector('#scrSetx .sxBack').click();
    o.backToTitle = Screens.current;
    // …and from the pause menu, through its own button
    G.newGame('424242', 'moderate', 'medium'); Screens._demo = false;
    Screens.show('paused');
    document.getElementById('btnPauseSettings').click();
    o.pause = { cur: Screens.current, nu: shown('scrSetx') };
    document.querySelector('#scrSetx .sxBack').click();
    o.backToPause = Screens.current;
    Screens.backTo = 'paused'; Screens.show('settings');

    // the tabs: exactly these five
    o.tabs = Array.from(document.querySelectorAll('#scrSetx .sxTab')).map(t => t.dataset.tab).join(',');
    // every control on every tab, named by what it does
    const KNOWN = /^(tog:tut|tog:unithelp|tog:mute-sfx|tog:mute-music|vol:sfx|vol:music|cad:[0125]|in:sxChief|act:export-file|act:export-id|act:import-id|kind:(bug|idea|crash|other)|in:sxEmail|in:sxName|in:sxMsg|in:sxAttach|send|act:flush)$/;
    o.controls = [];
    for (const t of SettingsPage.TABS) {
      SettingsPage.open(t.k);
      await new Promise(r => setTimeout(r, 30));
      for (const el of document.querySelectorAll('#scrSetx .sxPane button, #scrSetx .sxPane input, #scrSetx .sxPane textarea, #scrSetx .sxPane select')) {
        const name = el.classList.contains('sxTog') ? 'tog:' + el.dataset.act
          : el.classList.contains('sxVol') ? 'vol:' + el.dataset.bus
            : el.dataset.cad != null ? 'cad:' + el.dataset.cad
              : el.dataset.kind ? 'kind:' + el.dataset.kind
                : el.classList.contains('sxSend') ? 'send'
                  : el.dataset.act ? 'act:' + el.dataset.act
                    : el.id ? 'in:' + el.id : el.tagName.toLowerCase() + '?';
        o.controls.push(name);
      }
    }
    o.unknown = o.controls.filter(c => !KNOWN.test(c));
    o.hasSelect = !!document.querySelector('#scrSetx select');

    // AUDIO: the switches and the dials change Sound
    SettingsPage.open('audio');
    const q = s => document.querySelector('#scrSetx ' + s);
    Sound.setMusic(true); Sound.setSfx(true); SettingsPage.paintAudio();
    q('[data-act="mute-music"]').click();
    o.musicOff = { on: Sound.musicOn(), key: Sound.lsGet('neo-music'), aria: q('[data-act="mute-music"]').getAttribute('aria-checked'), pct: q('.sxAud[data-bus="music"] .sxPct').textContent };
    q('[data-act="mute-music"]').click();
    o.musicOn = Sound.musicOn();
    q('[data-act="mute-sfx"]').click();
    o.sfxOff = { on: Sound.sfxOn(), key: Sound.lsGet('neo-sfx') };
    q('[data-act="mute-sfx"]').click();
    o.sfxOn = Sound.sfxOn();
    const sl = q('.sxVol[data-bus="sfx"]');
    sl.value = '75'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    o.sfxVol = { vol: Sound.vol('sfx'), key: Sound.lsGet('neo-sfx-vol'), pct: q('.sxAud[data-bus="sfx"] .sxPct').textContent };
    const ml = q('.sxVol[data-bus="music"]');
    ml.value = '0'; ml.dispatchEvent(new Event('input', { bubbles: true }));
    o.musicZero = { on: Sound.musicOn(), pct: q('.sxAud[data-bus="music"] .sxPct').textContent, tog: q('[data-act="mute-music"]').getAttribute('aria-checked') };
    Sound.setVol('music', Sound.DEFAULT_VOL.music); Sound.setVol('sfx', Sound.DEFAULT_VOL.sfx); Sound.setMusic(false);

    // SAVES: the cadence
    SettingsPage.open('saves');
    q('[data-cad="5"]').click();
    o.cad5 = { days: Backend.autosaveDays, key: localStorage.getItem('neo-autosave-days'), on: q('[data-cad="5"]').classList.contains('on') && !q('[data-cad="2"]').classList.contains('on') };
    q('[data-cad="0"]').click();
    o.cad0 = Backend.autosaveDays;
    q('[data-cad="2"]').click();
    o.saveFile = !!q('[data-act="export-file"]');
    o.idRows = !!q('[data-act="export-id"]') && !!q('[data-act="import-id"]');
    const seg = q('.sxSeg').getBoundingClientRect();
    const segs = Array.from(document.querySelectorAll('#scrSetx .sxSeg button')).map(x => x.getBoundingClientRect());
    o.seg = { h: Math.round(seg.height), w: Math.round(seg.width), rows: new Set(segs.map(x => Math.round(x.top))).size, n: segs.length };
    // the old cadence, for scale (four 54px plaques over two rows)
    const oc = document.getElementById('setCadence');
    const sc = document.getElementById('scrSettings'); sc.classList.add('show');
    o.oldSeg = { h: Math.round(oc.getBoundingClientRect().height), w: Math.round(oc.getBoundingClientRect().width) };
    sc.classList.remove('show');

    // GENERAL: the lesson and the unit tips
    SettingsPage.open('general');
    localStorage.removeItem('neo-tutorial-ask');
    SettingsPage.open('general');
    const before = Screens.tutorialWanted();
    q('[data-act="tut"]').click();
    o.tut = { before, after: Screens.tutorialWanted(), key: localStorage.getItem('neo-tutorial-ask'), aria: q('[data-act="tut"]').getAttribute('aria-checked') };
    q('[data-act="tut"]').click();
    o.tutBack = Screens.tutorialWanted();
    const hh = UI.helpHidden;
    q('[data-act="unithelp"]').click();
    o.unit = { before: hh, after: UI.helpHidden, key: localStorage.getItem('neo-unit-help') };
    q('[data-act="unithelp"]').click();
    o.chief = !!q('#sxChief');
    await new Promise(r => setTimeout(r, 200));
    o.chiefName = q('#sxChief') ? q('#sxChief').value : null;
    o.chronicle = !!document.querySelector('#scrSetx .sxLog');
    return o;
  });
  ck('stagedItIsTheNewPage', r.live && r.title.cur === 'settings' && r.title.nu && !r.title.old, JSON.stringify(r.title));
  ck('reachableFromTheTitleAndThePause', r.backToTitle === 'title' && r.pause.cur === 'settings' && r.pause.nu && r.backToPause === 'paused',
    JSON.stringify({ t: r.backToTitle, p: r.pause, back: r.backToPause }));
  ck('fiveTabsNoControlsNoGraphics', r.tabs === 'general,audio,saves,feedback,notes', r.tabs);
  ck('everyControlIsARealSetting', r.unknown.length === 0 && !r.hasSelect, r.unknown.join(',') || r.controls.length + ' controls, all known');
  ck('theMusicSwitchSwitchesTheMusic', r.musicOff.on === false && r.musicOff.key === '0' && r.musicOff.aria === 'false' && r.musicOff.pct === 'Off' && r.musicOn === true,
    JSON.stringify(r.musicOff) + ' then ' + r.musicOn);
  ck('theEffectsSwitchSwitchesTheEffects', r.sfxOff.on === false && r.sfxOff.key === '0' && r.sfxOn === true, JSON.stringify(r.sfxOff));
  ck('theDialSetsTheLevel', r.sfxVol.vol === 75 && r.sfxVol.key === '75' && r.sfxVol.pct === '75%', JSON.stringify(r.sfxVol));
  ck('andZeroIsMute', r.musicZero.on === false && r.musicZero.pct === 'Off' && r.musicZero.tog === 'false', JSON.stringify(r.musicZero));
  ck('theCadenceSetsTheAutosave', r.cad5.days === 5 && r.cad5.key === '5' && r.cad5.on && r.cad0 === 0, JSON.stringify(r.cad5) + ' / off=' + r.cad0);
  // the operator: "the save rate options buttons are too large" — the old row
  // was four 44px plaques across the whole width
  ck('theCadenceIsOneSmallBar', r.seg.n === 4 && r.seg.rows === 1 && r.seg.h <= 34 && r.seg.w <= 320 &&
    r.seg.h * r.seg.w < 0.7 * r.oldSeg.h * r.oldSeg.w,
    JSON.stringify(r.seg) + ' vs the old ' + r.oldSeg.w + 'x' + r.oldSeg.h);
  ck('theLessonSwitchIsTheLessonChoice', r.tut.after === !r.tut.before && r.tut.key === (r.tut.before ? '0' : '1') && r.tut.aria === String(r.tut.after) && r.tutBack === r.tut.before,
    JSON.stringify(r.tut));
  ck('theUnitTipsSwitchIsTheUnitTips', r.unit.after === !r.unit.before && r.unit.key === (r.unit.after ? '1' : '0'), JSON.stringify(r.unit));
  ck('theConditionalCardsAppearWhenTheyAreReal', r.saveFile && r.idRows && r.chief && r.chiefName === 'Ashka',
    JSON.stringify({ file: r.saveFile, id: r.idRows, chief: r.chief, name: r.chiefName }));
  await ctx.close();
}
/* …and with no cloud and no game, those cards are simply not drawn */
{
  const { ctx, p } = await open({ q: '?cards=1', tag: 'bare' });
  const r = await p.evaluate(() => {
    Screens.backTo = 'title'; Screens.show('settings');
    SettingsPage.open('general');
    const chief = !!document.querySelector('#scrSetx #sxChief');
    SettingsPage.open('saves');
    return { chief, file: !!document.querySelector('#scrSetx [data-act="export-file"]'), id: !!document.querySelector('#scrSetx [data-act="export-id"]'),
      cards: document.querySelectorAll('#scrSetx .sxCard').length };
  });
  ck('aCardWithNothingRealIsNotDrawn', !r.chief && !r.file && !r.id && r.cards === 1, JSON.stringify(r));
  await ctx.close();
}

/* …and ticking the lesson on HERE never arms it on a world it cannot teach:
   a pending draft on an archipelago is founded again when it shows (the
   draft toggle's own MAP-V01 rule, reached from Settings) */
{
  const { ctx, p } = await open({ q: '?cards=1', tag: 'lesson' });
  const r = await p.evaluate(async () => {
    const frames = (n) => new Promise(res => { const f = () => (n-- <= 0 ? res() : requestAnimationFrame(f)); f(); });
    Screens.lsSet('neo-tutorial-ask', '0');
    Screens.newPrefs.mode = 'moderate';
    let tries = 0;
    do { Screens.foundRun(); tries++; } while (Screens.teachableWorld() && tries < 12);
    const before = { teachable: Screens.teachableWorld(), seed: S.seed, pending: !!(S.draft && !S.draft.done) };
    Screens.show('title');
    Screens.backTo = 'title'; Screens.show('settings'); SettingsPage.open('general');
    document.querySelector('#scrSetx [data-act="tut"]').click();
    const wanted = Screens.tutorialWanted();
    document.querySelector('#scrSetx .sxBack').click();
    Screens.show('newgame'); Screens.startNewGame();          // the same trial: the pending draft resumes…
    for (let i = 0; i < 40 && Screens.teachableWorld() === false; i++) await frames(2);
    return { before, wanted, after: { teachable: Screens.teachableWorld(), seed: S.seed, cur: Screens.current } };
  });
  ck('aLessonTickedHereIsNeverArmedOnAnUnteachableWorld', !r.before.teachable && r.before.pending && r.wanted && r.after.teachable && r.after.seed !== r.before.seed && r.after.cur === 'draft',
    JSON.stringify(r));
  await ctx.close();
}

/* ---- 4, 5. the form, the outbox, the ring ---- */
{
  const { ctx, p, reqs } = await open({ q: '?cards=1', mock: true, tag: 'form', expectErrors: true });
  const r = await p.evaluate(async () => {
    const o = {};
    const st = __MOCK.st;
    const q = s => document.querySelector('#scrSetx ' + s);
    const settle = (ms) => new Promise(r => setTimeout(r, ms || 60));
    // the ring: a thrown error, a rejected promise, a recovered frame fault
    setTimeout(() => { throw new Error('ring test: the tower fell through the map'); }, 0);
    Promise.reject(new Error('ring test: a promise nobody caught'));
    G._safe(() => { throw new Error('ring test: a recovered frame fault'); }, 'combat');
    await settle(80);
    o.ring = Feedback.errors().map(e => e.msg);

    Screens.backTo = 'title'; Screens.show('settings');
    SettingsPage.open('feedback');
    const fill = (email, msg) => {
      const e = q('#sxEmail'), m = q('#sxMsg');
      e.value = email; e.dispatchEvent(new Event('input', { bubbles: true }));
      m.value = msg; m.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const send = async () => { q('.sxSend').click(); for (let i = 0; i < 60 && SettingsPage._sending; i++) await settle(50); await settle(30); return q('.sxStatus').textContent; };
    // refusals: nothing queued, nothing sent, the reason said
    fill('', 'The tower fell through the map.');
    o.noEmail = { msg: await send(), bad: q('#sxEmail').classList.contains('bad') };
    fill('not-an-email', 'The tower fell through the map.');
    o.badEmail = await send();
    fill('player@example.com', '  ');
    o.noMsg = { msg: await send(), bad: q('#sxMsg').classList.contains('bad') };
    o.afterRefusals = { mails: st.mails.length, rpcs: st.rpcs.length, outbox: Feedback.outbox().length };
    o.attachDefaultBug = q('#sxAttach').checked;

    // a good Bug report
    fill('player@example.com', 'The tower fell through the map on day 40.');
    q('#sxName').value = 'Ashka'; q('#sxName').dispatchEvent(new Event('input', { bubbles: true }));
    o.sent = await send();
    o.mail = st.mails[0] || null;
    o.rpc = st.rpcs[0] || null;
    o.outboxAfterSend = Feedback.outbox().length;
    o.msgCleared = q('#sxMsg').value === '' && q('#sxEmail').value === 'player@example.com';

    // the client's rate limit: a second report straight away is refused
    fill('player@example.com', 'And another thing about towers.');
    o.rate = await send();
    o.rateQueued = Feedback.outbox().length;
    o.rateMails = st.mails.length;

    // an Idea carries no details unless asked
    localStorage.removeItem('neo-feedback-sent');
    q('[data-kind="idea"]').click();
    o.attachDefaultIdea = q('#sxAttach').checked;
    fill('player@example.com', 'A ferry across the lake would be lovely.');
    o.ideaSent = await send();
    o.ideaMail = st.mails[1] || null;
    o.ideaRpc = st.rpcs[1] || null;

    // the email fails: kept, said plainly, and sent when the line comes back
    localStorage.removeItem('neo-feedback-sent');
    st.mail = 'throw';
    q('[data-kind="crash"]').click();
    fill('player@example.com', 'It froze when the dragon came.');
    o.offline = await send();
    o.offlineOutbox = Feedback.outbox().map(x => ({ mailed: x.mailed, stored: x.stored }));
    st.mail = 'ok';
    const mailsBefore = st.mails.length;
    window.dispatchEvent(new Event('online'));
    for (let i = 0; i < 80 && Feedback.outbox().length; i++) await settle(100);
    o.online = { outbox: Feedback.outbox().length, mailed: st.mails.length - mailsBefore, subject: (st.mails[st.mails.length - 1] || {}).body && st.mails[st.mails.length - 1].body._subject };

    // "needs activation" is not delivery; a 404 on the copy is silent
    localStorage.removeItem('neo-feedback-sent');
    st.mail = 'activate'; st.rpc = '404';
    q('[data-kind="other"]').click();
    fill('player@example.com', 'Just saying hello.');
    o.activate = await send();
    o.activateOutbox = Feedback.outbox().map(x => ({ mailed: x.mailed, stored: x.stored }));
    st.mail = 'ok';
    await Feedback.flush();
    o.afterActivation = Feedback.outbox().length;
    // the reference a retried copy carries is the one minted on the device
    o.refs = st.rpcs.map(x => x.p_details && x.p_details.ref);
    return o;
  });
  const to = 'https://formsubmit.co/ajax/efa96b8d4bc3a39bd17e1d6cfdd24e5a';
  ck('theRingKeepsErrorsRejectionsAndFrameFaults',
    r.ring.some(m => /tower fell through the map/.test(m)) && r.ring.some(m => /promise nobody caught/.test(m)) && r.ring.some(m => /combat: ring test: a recovered frame fault/.test(m)),
    r.ring.slice(-3).join(' | '));
  ck('noEmailNoReport', /email/i.test(r.noEmail.msg) && r.noEmail.bad, r.noEmail.msg);
  ck('aBadEmailNoReport', /doesn.t look right/i.test(r.badEmail), r.badEmail);
  ck('noMessageNoReport', /tell us/i.test(r.noMsg.msg) && r.noMsg.bad, r.noMsg.msg);
  ck('andARefusalSendsAndQueuesNothing', r.afterRefusals.mails === 0 && r.afterRefusals.rpcs === 0 && r.afterRefusals.outbox === 0, JSON.stringify(r.afterRefusals));
  ck('aBugAttachesDetailsByDefault', r.attachDefaultBug === true && r.attachDefaultIdea === false, 'bug ' + r.attachDefaultBug + ', idea ' + r.attachDefaultIdea);
  const m = r.mail && r.mail.body;
  ck('theEmailGoesToTheOperatorWithFormSubmitsFields', !!m && r.mail.path === to && m.email === 'player@example.com' && m._replyto === 'player@example.com' &&
    m.name === 'Ashka' && m._subject === 'Clanfire — Bug' && m._template === 'table' && m._captcha === 'false' &&
    m.message === 'The tower fell through the map on day 40.' && m.kind === 'Bug',
    m ? JSON.stringify({ path: r.mail.path, subject: m._subject, name: m.name, tpl: m._template, cap: m._captcha }) : 'no mail');
  ck('andItsDetailsCarryTheBuildAndTheRing', !!m && /Build: 97/.test(m.details) && /tower fell through the map/.test(m.details) && /Recent errors \(\d+\)/.test(m.details),
    m ? m.details.split('\n').slice(0, 3).join(' / ') : '');
  const rp = r.rpc;
  ck('aCopyGoesToSubmitFeedback', !!rp && rp.p_kind === 'bug' && rp.p_email === 'player@example.com' && rp.p_message === 'The tower fell through the map on day 40.' &&
    rp.p_details && /^fb-/.test(rp.p_details.ref) && rp.p_details.report && rp.p_details.report.build === 97 && Array.isArray(rp.p_details.report.errors),
    rp ? JSON.stringify({ kind: rp.p_kind, ref: rp.p_details && rp.p_details.ref, errs: rp.p_details && rp.p_details.report && rp.p_details.report.errors.length }) : 'no rpc');
  ck('andThePlayerIsToldItWasSent', /^Sent — thank you/.test(r.sent) && r.outboxAfterSend === 0 && r.msgCleared, r.sent);
  ck('theClientRateLimits', /wait a few seconds/i.test(r.rate) && r.rateQueued === 0 && r.rateMails === 1, r.rate);
  ck('anIdeaCarriesNoDetailsUnlessAsked', !!r.ideaMail && r.ideaMail.body.details === 'Not attached' && r.ideaMail.body._subject === 'Clanfire — Idea' &&
    r.ideaRpc && !r.ideaRpc.p_details.report, r.ideaMail ? r.ideaMail.body.details : 'no mail');
  ck('aFailedEmailIsKeptAndSaidPlainly', /back online/i.test(r.offline) && r.offlineOutbox.length === 1 && r.offlineOutbox[0].mailed === false,
    r.offline + ' ' + JSON.stringify(r.offlineOutbox));
  ck('andGoesWhenTheLineComesBack', r.online.outbox === 0 && r.online.mailed === 1 && r.online.subject === 'Clanfire — Crash report', JSON.stringify(r.online));
  ck('needsActivationIsNotDelivery', /next time you open the game/i.test(r.activate) && r.activateOutbox.length === 1 && !r.activateOutbox[0].mailed && r.activateOutbox[0].stored,
    r.activate + ' ' + JSON.stringify(r.activateOutbox));
  ck('aMissingDoorIsSilentAndTheRetryDelivers', r.afterActivation === 0, 'outbox ' + r.afterActivation);
  ck('aRetriedCopyKeepsItsReference', r.refs.length >= 4 && r.refs.every(x => /^fb-/.test(x)), r.refs.join(','));
  const live = reqs.filter(u => /formsubmit|supabase\.co/.test(u));
  ck('andNothingTouchedTheRealNetwork', live.length === 0, live.slice(0, 2).join(' '));
  await ctx.close();
}
/* the next load sends what the last one could not */
{
  const seed = () => {
    try {
      if (sessionStorage.getItem('ob-seeded')) return;
      sessionStorage.setItem('ob-seeded', '1');
      localStorage.setItem('neo-feedback-outbox', JSON.stringify([{ id: 'fb-old-1', at: Date.now() - 3600e3, kind: 'bug', email: 'player@example.com',
        name: '', message: 'Saved while offline yesterday.', details: null, mailed: false, stored: false, tries: 1 }]));
    } catch (e) {}
  };
  const { ctx, p } = await open({ q: '?cards=1', mock: true, init: seed, clear: false, tag: 'reload' });
  await p.waitForFunction(() => __MOCK.st.mails.length > 0 || (Date.now() - performance.timeOrigin) > 15000, null, { timeout: 30000, polling: 200 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ mails: __MOCK.st.mails.map(m => m.body.message), outbox: Feedback.outbox().length, rpcs: __MOCK.st.rpcs.length }));
  ck('theNextLoadSendsTheOutbox', r.mails.length === 1 && r.mails[0] === 'Saved while offline yesterday.' && r.outbox === 0 && r.rpcs === 1, JSON.stringify(r));
  await ctx.close();
}
/* a page that is not the site sends nothing, mock or no mock — and says so */
{
  const { ctx, p, reqs } = await open({ q: '?cards=1', tag: 'offsite' });
  const r = await p.evaluate(async () => {
    let fetched = 0; const real = window.fetch; window.fetch = (...a) => { fetched++; return real(...a); };
    Screens.backTo = 'title'; Screens.show('settings'); SettingsPage.open('feedback');
    const res = await Feedback.submit({ kind: 'bug', email: 'player@example.com', message: 'From a page on disk.', attach: true });
    window.fetch = real;
    return { state: res.state, why: res.why, outbox: Feedback.outbox().length, fetched, can: Feedback.canSend() };
  });
  ck('aPageThatIsNotTheSiteSendsNothing', r.state === 'offsite' && r.outbox === 0 && r.fetched === 0 && !r.can, JSON.stringify(r));
  ck('andNoRequestLeft', !reqs.some(u => /formsubmit/.test(u)), '');
  await ctx.close();
}

/* ---- 7. CHROME IS DRAWN AT THE DEVICE'S OWN RESOLUTION (the operator's
   standing ruling: the world's art stays pixel art, but UI CHROME — frames,
   corner ornaments, icons, buttons, dots — is high quality at the device's
   pixels, never a small picture blown up). Measured in the live page, every
   tab, at every size the page lays out for — a phone ON ITS SIDE included,
   which is 3x AND takes the wide window's rail, the case the phone-only
   source check missed: every raster the page draws (an <img>, or a CSS
   background url() on any element or pseudo-element) is shown at or below
   its own pixel count on a 3x screen — CSS size × 3 ≤ natural size. A vector
   (inline SVG, a gradient, a border) passes by being one. The patch-notes
   painting is a SCENE and keeps its pixel art, so it is exempt from the 3x
   rule — but on a desktop window it is never stretched past twice its
   pixels on a 2x screen. The probe is shown it can see a blow-up: one icon
   pushed to 60px must be named. ---- */
{
  const probe = async (p) => p.evaluate(async () => {
    const out = [], nat = {};
    const natOf = u => nat[u] || (nat[u] = new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = u; }));
    for (const t of SettingsPage.TABS) {
      SettingsPage.open(t.k);
      const root = document.getElementById('scrSetx');
      const imgs = Array.from(root.querySelectorAll('img'));
      await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); })));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const i of root.querySelectorAll('img')) {
        const cs = getComputedStyle(i), rc = i.getBoundingClientRect();
        if (!rc.width || cs.display === 'none' || cs.visibility === 'hidden' || !i.naturalWidth) continue;
        out.push({ tab: t.k, name: i.src.split('/').pop().split('?')[0], scene: !!i.closest('.sxHero'), w: rc.width, h: rc.height, nw: i.naturalWidth, nh: i.naturalHeight });
      }
      for (const el of root.querySelectorAll('*')) {
        for (const pse of [null, '::before', '::after']) {
          const bi = getComputedStyle(el, pse).backgroundImage;
          const m = bi && /url\("?([^")]+)"?\)/.exec(bi);
          if (!m || /\.svg(\?|$)|^data:image\/svg/.test(m[1])) continue;
          const n = await natOf(m[1]), rc = el.getBoundingClientRect();
          if (n) out.push({ tab: t.k, name: 'bg ' + m[1].split('/').pop().split('?')[0], scene: false, w: rc.width, h: rc.height, nw: n[0], nh: n[1] });
        }
      }
    }
    return { out, vectors: document.querySelectorAll('#scrSetx .sxC svg').length };
  });
  const over = [], seen = new Set(), scenes = [];
  let vectors = 0;
  for (const [w, h] of [[320, 568], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
    const { ctx, p } = await open({ q: '?cards=1', vp: { width: w, height: h }, tag: 'chrome' + w });
    await p.evaluate(() => { Screens.backTo = 'title'; Screens.show('settings'); });
    const r = await probe(p);
    vectors = Math.max(vectors, r.vectors);
    for (const x of r.out) {
      seen.add(x.name);
      if (x.scene) {
        if (w >= 1024 && x.w * 2 > 2 * x.nw) scenes.push(x.name + ' ' + x.w.toFixed(0) + 'px wide at ' + w + 'x' + h + ' (' + (x.w * 2 / x.nw).toFixed(2) + 'x its pixels at 2x)');
        continue;
      }
      const k = Math.max(x.w * 3 / x.nw, x.h * 3 / x.nh);
      if (k > 1.001) over.push(x.name + ' ' + x.w.toFixed(0) + 'px at ' + w + 'x' + h + ' (' + k.toFixed(2) + 'x its ' + x.nw + 'px at 3x)');
    }
    if (w === 844) {  // the control: a blow-up the probe must name
      await p.evaluate(() => { const s = document.createElement('style'); s.id = 'ctlBlow'; s.textContent = '#scrSetx .sxTab img { width: 60px !important; height: 60px !important; }'; document.head.appendChild(s); });
      const c = await probe(p);
      const named = c.out.some(x => !x.scene && /^tab-/.test(x.name) && x.w * 3 > x.nw);
      ck('andTheChromeProbeCanSeeABlowUp', named, named ? 'a 60px tab icon is named' : 'the probe missed a 60px tab icon');
    }
    await ctx.close();
  }
  const worst = {};
  for (const o of over) { const k = o.split(' ')[0], r = +/\((\d+\.\d+)x/.exec(o)[1]; if (!worst[k] || r > worst[k].r) worst[k] = { r, o }; }
  const pieces = Object.values(worst).sort((a, b) => b.r - a.r).map(w => w.o);
  ck('noChromeIsShownPastItsPixelsAt3x', over.length === 0 && seen.size >= 10,
    over.length ? pieces.length + ' piece(s): ' + pieces.join('; ') : seen.size + ' rasters measured on 8 sizes × 5 tabs, all at or under their pixels at 3x');
  ck('theFrameCornersAreVectors', vectors === 4 && !seen.has('corner.png'), vectors + ' vector corners');
  ck('andThePaintingIsNeverStretchedOnADesktop', scenes.length === 0 && seen.has('notes-art.png'), scenes[0] || 'the patch-notes painting stays within 2x its pixels at 2x');
}

/* ---- 6. it fits, every tab, at six sizes — a phone on its side among them ---- */
for (const [w, h] of [[390, 844], [430, 932], [768, 1024], [1440, 900], [1920, 1080], [844, 390]]) {
  const { ctx, p } = await open({ q: '?cards=1', vp: { width: w, height: h }, tag: 'fit' + w });
  const r = await p.evaluate(async () => {
    Screens.backTo = 'title'; Screens.show('settings');
    const bad = [], hts = [];
    for (const t of SettingsPage.TABS) {
      SettingsPage.open(t.k);
      await new Promise(r => setTimeout(r, 40));
      const el = document.getElementById('scrSetx'), pane = el.querySelector('.sxPane'), fr = el.querySelector('.sxFrame').getBoundingClientRect();
      /* on a wide window the frame is the PAGE: it keeps one height whichever
         tab is open (the rail's foot used to jump 300px between Audio and the
         notes) and the header and frame stand in the middle of the window —
         at 1920x1080 a short tab sat in the top half over 540px of nothing */
      if (innerWidth >= 720) {
        hts.push(fr.height);
        const above = el.querySelector('.sxHead').getBoundingClientRect().top, below = innerHeight - fr.bottom;
        if (below > above + 40) bad.push(t.k + ': top-heavy — ' + above.toFixed(0) + 'px above the header, ' + below.toFixed(0) + 'px under the frame');
      }
      if (document.scrollingElement.scrollWidth > innerWidth) bad.push(t.k + ': page scrolls sideways');
      if (pane.scrollWidth > pane.clientWidth + 1) bad.push(t.k + ': pane scrolls sideways ' + pane.scrollWidth + '>' + pane.clientWidth);
      if (fr.left < 0 || fr.right > innerWidth + 0.5 || fr.bottom > innerHeight + 0.5 || fr.top < 0) bad.push(t.k + ': frame outside ' + JSON.stringify([fr.left, fr.top, fr.right, fr.bottom]));
      for (const tab of el.querySelectorAll('.sxTab')) {
        const lab = Array.from(tab.querySelectorAll('.sxTn, .sxTs')).find(x => getComputedStyle(x).display !== 'none');
        const tr = tab.getBoundingClientRect(), lr = lab.getBoundingClientRect();
        // a rail plaque stays inside the frame (a phone on its side ran the fifth one out through its foot)
        if (tr.bottom > fr.bottom - 2 || tr.right > fr.right - 2) bad.push(t.k + ': tab "' + lab.textContent + '" spills out of the frame ' + (tr.bottom - fr.bottom).toFixed(1));
        if (lr.left < tr.left + 4 || lr.right > tr.right - 4) bad.push(t.k + ': label "' + lab.textContent + '" crowds its tab ' + [lr.left - tr.left, tr.right - lr.right].map(v => v.toFixed(1)).join('/'));  // a clear 4px each side, or it reads as touching the plaque's rim
      }
      for (const x of pane.querySelectorAll('.sxCard, .sxSeg, .sxSend, .sxKinds')) {
        const xr = x.getBoundingClientRect(), pr = pane.getBoundingClientRect();
        if (xr.right > pr.right + 0.5 || xr.left < pr.left - 0.5) bad.push(t.k + ': ' + x.className + ' wider than the pane');
      }
    }
    if (hts.length && Math.max(...hts) - Math.min(...hts) > 0.5) bad.push('the frame changes height between tabs: ' + hts.map(v => v.toFixed(0)).join('/'));
    return { bad, rail: getComputedStyle(document.querySelector('#scrSetx .sxNav')).flexDirection };
  });
  ck('itFitsAt' + w + 'x' + h, r.bad.length === 0, r.bad.slice(0, 3).join(' | ') || 'every tab, nav ' + r.rail);
  await ctx.close();
}

// THE ADDRESS IS NEVER IN THE PAGE: the form posts to the operator's FormSubmit
// alias, so no shipped file carries the inbox it lands in
{
  const fs = await import('fs');
  const shipped = ['index.html', ...fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
  const leaks = shipped.filter(f => /@frostrivercapital\./i.test(fs.readFileSync(f, 'utf8')));
  ck('theInboxIsNeverInThePageSource', leaks.length === 0 && /^[0-9a-f]{32}$/.test(fs.readFileSync('js/feedback.js', 'utf8').match(/TO: '([^']+)'/)[1]), leaks.join(', ') || 'alias only');
}
ck('noPageThrew', allErrs.length === 0, allErrs.slice(0, 3).join(' | '));
await b.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (fails.length) { console.log('\n' + fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('\nALL ' + Object.keys(res).length + ' CHECKS PASS');
