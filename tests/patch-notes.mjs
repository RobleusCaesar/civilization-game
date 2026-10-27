/* PATCH NOTES — the contract for js/patchnotes.js and its tab on the new
   settings page (js/settings.js).

   THE OPERATOR'S RULE: "whenever we push things to main moving forward, add
   user friendly notes to this section." So:

   1. THE NEWEST NOTE IS THIS BUILD. Its `build` equals the shared code
      version every js/ script tag in index.html carries (?v=N). A deploy that
      bumps the code version without writing a note fails here — which is the
      whole point: the notes cannot quietly fall behind.
   2. NEWEST FIRST, honestly dated: builds strictly descending, dates real
      calendar days (YYYY-MM-DD) and never rising as the builds fall.
   3. WRITTEN FOR PLAYERS: every entry has a title and at least one item, and
      no line carries a code identifier — no camelCase, no dotted names, no
      brackets, no underscores or symbols. Those are the tells that a line
      was written for us and not for them. (iPhone, iPad and iOS are names a
      player uses, and are allowed.)
   4. THE RED DOT: the Patch Notes tab wears it until the newest note has been
      SEEN on this device, opening the tab clears it, and a newer build brings
      it back. The doors to the page (the title's and the pause menu's
      Settings buttons) wear it too while it is unread.
   5. THE VERSION LINE reads "Build N · date", newest open, older folded.

     node tests/patch-notes.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 1-3. the file itself, read in node ---- */
const html = readFileSync(join(root, 'index.html'), 'utf8');
const vs = [...html.matchAll(/<script src="js\/[^"?]+\?v=(\d+)"/g)].map(m => +m[1]);
const codeV = vs.length ? vs[0] : NaN;
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, 'js/patchnotes.js'), 'utf8') + '\nwindow.__N = PATCH_NOTES;', sandbox);
const N = sandbox.window.__N || [];

ck('theScriptTagsShareOneCodeVersion', vs.length > 20 && vs.every(v => v === codeV), 'v=' + codeV + ' on ' + vs.length + ' tags');
ck('patchnotesLoadsAtThatVersion', /<script src="js\/patchnotes\.js\?v=(\d+)"/.test(html) && +html.match(/js\/patchnotes\.js\?v=(\d+)/)[1] === codeV, '');
ck('theNewestNoteIsThisBuild', N.length > 0 && +N[0].build === codeV,
  'newest note build ' + (N[0] && N[0].build) + ' vs code ?v=' + codeV + ' — every push to main adds a note');
let desc = true, datesOk = true, dateOrder = true, why = [];
for (let i = 0; i < N.length; i++) {
  const n = N[i];
  if (!Number.isInteger(n.build) || n.build <= 0) { desc = false; why.push('bad build ' + n.build); }
  if (i && !(N[i - 1].build > n.build)) { desc = false; why.push(N[i - 1].build + ' then ' + n.build); }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(n.date || ''));
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) { datesOk = false; why.push('bad date ' + n.date); }
  if (i && String(N[i - 1].date) < String(n.date)) { dateOrder = false; why.push(N[i - 1].date + ' before ' + n.date); }
}
ck('newestFirstByBuild', desc, why.join('; ') || N.map(n => n.build).join(' > '));
ck('everyDateIsARealDay', datesOk, why.join('; ') || N.length + ' dates');
ck('andTheDatesNeverRiseAsTheBuildsFall', dateOrder, why.join('; '));
const ALLOW = /\b(iPhone|iPhones|iPad|iPads|iOS)\b/g;
const CODEY = [
  [/[a-z][A-Z]/, 'camelCase'],
  [/\w\.\w/, 'a dotted name'],
  [/[()[\]{}<>]/, 'brackets'],
  [/[_=;`|\\#$%^*~]/, 'a code symbol'],
  [/\b[a-z]+\.(js|mjs|png|html|sql|json)\b/i, 'a file name'],
];
const bad = [];
let shapeOk = true;
for (const n of N) {
  if (!n.title || !String(n.title).trim() || !Array.isArray(n.items) || !n.items.length) { shapeOk = false; bad.push('empty entry ' + n.build); continue; }
  for (const line of [n.title, ...n.items]) {
    if (typeof line !== 'string' || !line.trim()) { shapeOk = false; bad.push('blank line in ' + n.build); continue; }
    const s = line.replace(ALLOW, 'Phone');
    for (const [re, what] of CODEY) if (re.test(s)) bad.push(n.build + ': ' + what + ' in "' + line.slice(0, 60) + '"');
  }
}
ck('everyEntryHasATitleAndItems', shapeOk, bad.filter(b => /empty|blank/.test(b)).join('; ') || N.length + ' entries');
ck('noLineCarriesACodeIdentifier', !bad.some(b => !/empty|blank/.test(b)), bad.slice(0, 4).join(' | ') || 'written for players');
// the checker can see what it is for (the control): a line in our own dialect trips it
{
  const probe = ['Fixed Deck.play when the hand is empty', 'The renderLog now runs', 'Calls submit_feedback (once)'];
  const seen = probe.map(l => CODEY.some(([re]) => re.test(l.replace(ALLOW, 'Phone'))));
  ck('andTheCheckerCanSeeCode', seen.every(Boolean), JSON.stringify(seen));
}

/* ---- 4-5. the red dot and the version line, in the page ---- */
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('pn-once')) { localStorage.clear(); sessionStorage.setItem('pn-once', '1'); } } catch (e) {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + '?cards=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.SettingsPage, null, { timeout: 30000 });
  await p.waitForFunction(() => document.readyState === 'complete', null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    const o = {};
    const titleDot = () => document.getElementById('btnTitleSettings').classList.contains('sxNew');
    const tabDot = () => { const t = document.querySelector('#scrSetx .sxTab[data-tab="notes"]'); return !!(t && t.classList.contains('hasDot')); };
    o.unseenFresh = SettingsPage.notesUnseen();
    o.titleDotFresh = titleDot();
    Screens.backTo = 'title'; Screens.show('settings');
    o.tabDotBefore = tabDot();
    SettingsPage.open('notes');
    o.tabDotAfter = tabDot();
    o.unseenAfter = SettingsPage.notesUnseen();
    o.titleDotAfter = titleDot();
    o.stored = localStorage.getItem('neo-notes-seen');
    const pane = document.querySelector('#scrSetx .sxPane');
    o.versionLine = (pane.querySelector('.sxVerL') || {}).textContent || '';
    o.openEntries = pane.querySelectorAll('article.sxEntry').length;
    o.folded = pane.querySelectorAll('details.sxEntry').length;
    o.foldedOpen = pane.querySelectorAll('details.sxEntry[open]').length;
    o.items0 = pane.querySelectorAll('article.sxEntry li').length;
    o.n = PATCH_NOTES.length;
    o.items0want = PATCH_NOTES[0].items.length;
    o.want = 'Build ' + PATCH_NOTES[0].build + ' · ';
    // a newer build arrives: the dot comes back, everywhere
    localStorage.setItem('neo-notes-seen', String(PATCH_NOTES[0].build - 1));
    SettingsPage.open('general');
    o.tabDotNewer = tabDot();
    o.titleDotNewer = titleDot();
    // …and a device whose storage throws still clears it for the session
    const real = Storage.prototype.getItem, realSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      o.blockedBefore = SettingsPage.notesUnseen();
      SettingsPage.open('notes');
      o.blockedAfter = SettingsPage.notesUnseen();
    } finally { Storage.prototype.getItem = real; Storage.prototype.setItem = realSet; }
    return o;
  });
  ck('aFreshDeviceHasUnreadNotes', r.unseenFresh === true && r.tabDotBefore === true, JSON.stringify({ unseen: r.unseenFresh, tab: r.tabDotBefore }));
  ck('andTheDoorWearsTheDotToo', r.titleDotFresh === true, 'title Settings plaque');
  ck('openingTheTabClearsIt', r.tabDotAfter === false && r.unseenAfter === false && r.titleDotAfter === false && +r.stored === codeV,
    JSON.stringify({ tab: r.tabDotAfter, unseen: r.unseenAfter, door: r.titleDotAfter, stored: r.stored }));
  ck('aNewerBuildBringsItBack', r.tabDotNewer === true && r.titleDotNewer === true, JSON.stringify({ tab: r.tabDotNewer, door: r.titleDotNewer }));
  ck('andAThrowingStorageStillClearsItForTheSession', r.blockedBefore === true && r.blockedAfter === false,
    JSON.stringify({ before: r.blockedBefore, after: r.blockedAfter }));
  ck('theVersionLineReadsBuildAndDate', r.versionLine.startsWith(r.want) && /\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(r.versionLine), JSON.stringify(r.versionLine));
  ck('theNewestIsOpenAndTheRestFolded', r.openEntries === 1 && r.items0 === r.items0want && r.folded === r.n - 1 && r.foldedOpen === 0,
    JSON.stringify({ open: r.openEntries, items: r.items0, folded: r.folded, foldedOpen: r.foldedOpen, n: r.n }));
  ck('thePageThrewNothing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await b.close();

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (fails.length) { console.log('\n' + fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('\nALL ' + Object.keys(res).length + ' CHECKS PASS');
