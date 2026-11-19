/* THE TRAIN BUTTON SHOWS ITS WORK (UI.paintTraining / queueLine / trainFlash,
   Bld.trainNow; operator, build 201, with a phone shot of the dock's panel:
   "when you click to build a villager it's not always obvious that something
   is happening … instead of showing queued and then like one of three, which
   is light gray and kinda hard to see … on the button itself … we show the
   progress bar of someone being created and will need to carry that through
   to the military units as well … if nobody is queued, then maybe it's that
   current light gray color but if somebody is queued … say something like
   training in progress and have it be a gold color and then show it as like
   one of three").

     THE LINE      An empty yard reads "Queue: 0/N" in the quiet grey; a
                   working one says who: "Training Villager… 1/3", in gold
                   (.qon), and "Training paused (upgrading)" while the masons
                   have the yard. A unit waiting at the gate is still said.
     THE BUTTON    Every train button whose kind is queued wears a gold rim
                   (.trn) and the count of its kind waiting; the one being
                   trained (the queue's head) a gold bar along its foot that
                   fills with the work done, and only that one. A tap that
                   queued someone flashes it (.tgo) at once.
     IN PLACE      The bar and the count are laid over the button: queueing
                   moves nothing, and every refresh repaints them without a
                   relayout.
     THE WHOLE     The share done is read off the whole time the unit was
     TIME          queued with (the entry's T); an entry without one (an older
                   save) takes the yard's own time for its kind.
     EVERY YARD    The hall, the barracks, the range — one loop draws them all.

     node tests/train-progress.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html') + '?prologue=0', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(600);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  G.newGame('trainseen', 'moderate', 'medium');
  Screens._demo = false; S.played = true; Screens.show('playing'); S.paused = true;
  S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  const cap0 = Bld.popCap; Bld.popCap = () => 999;   // room for every queue this file fills
  const tc = Bld.tcOf('P');
  const q = () => document.getElementById('qLine');
  const btn = uk => document.querySelector(`#panel [data-act="train"][data-unit="${uk}"]`);
  const look = uk => { const e = btn(uk); return e && { trn: e.classList.contains('trn'), n: e.querySelector('.tq').textContent,
    on: e.querySelector('.ttrack').classList.contains('on'), w: parseFloat(e.querySelector('.tbar').style.width) || 0, go: e.classList.contains('tgo') }; };

  /* ---- THE LINE, EMPTY: as it was ---- */
  tc.queue = [];
  UI.select('bld', tc.id); UI.renderPanel();
  const r0 = btn('villager').getBoundingClientRect();
  ck('anEmptyYardReadsAsItDid', /^Queue: 0\/\d+$/.test(q().textContent) && !q().classList.contains('qon') && !look('villager').trn && !look('villager').on && look('villager').n === '',
    q().textContent + ' ' + JSON.stringify(look('villager')));

  /* ---- A TAP: the button flashes, the line names him in gold, the bar starts ---- */
  btn('villager').click();
  const a = look('villager');
  ck('aTapThatQueuesFlashesTheButton', a.go, JSON.stringify(a));
  ck('theLineNamesWhoIsTrainingInGold', /^Training Villager… 1\/\d+$/.test(q().textContent) && q().classList.contains('qon')
    && getComputedStyle(q()).color !== getComputedStyle(document.querySelector('#panel .phead .psub') || q()).color, q().textContent);
  ck('andTheButtonWearsItsRimAndCount', a.trn && a.n === '1' && a.on, JSON.stringify(a));
  const r1 = btn('villager').getBoundingClientRect();
  ck('andNothingMoves', Math.abs(r0.x - r1.x) < 0.5 && Math.abs(r0.y - r1.y) < 0.5 && Math.abs(r0.width - r1.width) < 0.5 && Math.abs(r0.height - r1.height) < 0.5,
    JSON.stringify([r0, r1].map(r => [r.x, r.y, r.width, r.height].map(Math.round))));

  /* ---- THE BAR FILLS WITH THE WORK DONE, IN PLACE ---- */
  const head = tc.queue[0];
  ck('theQueueKeepsTheWholeTime', head.T > 0 && Math.abs(head.T - head.t) < 1e-9, JSON.stringify(head));
  head.t = head.T * 0.75; UI.refreshPanel();
  const w1 = look('villager').w;
  head.t = head.T * 0.25; UI.refreshPanel();
  const w2 = look('villager').w;
  const same = btn('villager') === document.querySelector('#panel [data-act="train"][data-unit="villager"]');
  ck('theBarFillsWithTheWorkDone', Math.abs(w1 - 25) < 1 && Math.abs(w2 - 75) < 1 && same, `${w1}% then ${w2}%`);
  // the real clock moves it too
  S.paused = false; const wa = look('villager').w; Bld.update(head.t * 0.5); UI.refreshPanel(); S.paused = true;
  ck('andTheYardsOwnClockMovesIt', look('villager').w > wa, `${wa}% → ${look('villager').w}%`);

  /* ---- PAUSED: the masons have the yard ---- */
  tc.upgrading = 3; UI.refreshPanel();
  const pz = q().textContent, pc = btn('villager') && btn('villager').classList.contains('tpause');
  tc.upgrading = 0; UI.renderPanel();
  ck('aPausedYardSaysSo', /^Training paused \(upgrading\)/.test(pz) && pc, pz + ' ' + pc);

  /* ---- AN OLDER SAVE'S ENTRY: no whole time, the yard's own stands in ---- */
  tc.queue = [{ unit: 'villager', t: CFG.BUILDINGS.tc.train.villager.time * 0.5 }];
  UI.refreshPanel();
  const old = Bld.trainNow(tc);
  ck('anEntryWithoutItsWholeTimeTakesTheYards', old && Math.abs(old.frac - 0.5) < 0.01 && Math.abs(look('villager').w - 50) < 1, JSON.stringify(old));

  /* ---- DONE: back to the quiet line ---- */
  tc.queue = []; UI.refreshPanel();
  ck('anEmptiedYardGoesQuietAgain', /^Queue: 0\//.test(q().textContent) && !q().classList.contains('qon') && !look('villager').trn && !look('villager').on,
    q().textContent + ' ' + JSON.stringify(look('villager')));

  /* ---- A YARD OF SOLDIERS: a count per kind, the bar on the head alone ---- */
  let bk = null;
  for (let r = 3; r < 12 && !bk; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]])
    if (!bk && Bld.canPlace('P', 'barracks', tc.x + dx, tc.y + dy, { noCost: true }).ok) bk = Bld.place('P', 'barracks', tc.x + dx, tc.y + dy, { instant: true, free: true });
  if (!bk) ck('aBarracksStands', false, 'no ground');
  else {
    bk.level = 2;
    UI.select('bld', bk.id); UI.renderPanel();
    btn('defender').click(); btn('defender').click(); btn('axeman').click();
    const d = look('defender'), x = look('axeman');
    ck('aYardCountsEachKindWaiting', d.trn && d.n === '2' && x.trn && x.n === '1', JSON.stringify({ d, x }));
    ck('andBarsOnlyTheOneBeingTrained', d.on && !x.on && /^Training Defender… 3\//.test(q().textContent), JSON.stringify({ d, x, line: q().textContent }));
    // the head moves on: the bar goes to the next kind in line
    bk.queue.splice(0, 2); UI.refreshPanel();
    const d2 = look('defender'), x2 = look('axeman');
    ck('andTheBarMovesToTheNextInLine', !d2.trn && !d2.on && x2.on && /^Training Axeman… 1\//.test(q().textContent), JSON.stringify({ d2, x2, line: q().textContent }));
  }

  /* ---- THE RANGE, BY THE SAME LOOP ---- */
  let rg = null;
  for (let r = 3; r < 14 && !rg; r++) for (const [dx, dy] of [[-r, r], [r, -r], [0, -r], [-r, 0], [r, 0], [0, r]])
    if (!rg && Bld.canPlace('P', 'range', tc.x + dx, tc.y + dy, { noCost: true }).ok) rg = Bld.place('P', 'range', tc.x + dx, tc.y + dy, { instant: true, free: true });
  if (rg) {
    UI.select('bld', rg.id); UI.renderPanel();
    btn('archer').click();
    const ar = look('archer');
    ck('everyYardShowsItsWork', ar.trn && ar.on && ar.n === '1' && /^Training Archer… 1\//.test(q().textContent), JSON.stringify(ar) + ' ' + q().textContent);
  } else ck('everyYardShowsItsWork', false, 'no ground for a range');

  Bld.popCap = cap0;
  return { res, fails };
});
for (const [k, v] of Object.entries(out.res)) console.log(`  ${k}: ${v}`);
if (errs.length) { console.log('page errors:', errs.slice(0, 5)); out.fails.push('pageErrors'); }
await b.close();
if (out.fails.length) { console.log('\nFAILURES: ' + out.fails.join(', ')); process.exit(1); }
console.log('\nALL TRAIN-PROGRESS CHECKS PASS');
