/* FINISHED-RUN / CONTINUE CONTRACT — winning must not eat a manual save, and
   must actually retire the Continue button.

   Two player-visible failures, one victory screen:

   1. THE VICTORY CLOBBERED A MANUAL SAVE. `Backend.finalizeRun` used to stamp
      the run's final (won) state into the ACTIVE cloud slot — which is
      whatever slot the player last saved to. A manual snapshot taken two
      minutes before the win was silently replaced by the game-over state, so
      loading it jumped straight to the victory screen. finalizeRun now never
      touches the slot's saved state: it clears the crash net, unbinds the
      slot, and records the finished run's SEED on a local ledger
      (`Backend.noteFinishedSeed` / `finishedSeeds`, capped at 50). A saved
      game is the player's property.

   2. CONTINUE SURVIVED THE WIN. The title's Continue skipped rows stamped
      `over` but happily fell back to any OTHER live row — including an older
      mid-run snapshot of the very run just finished ("Mid Game — day 321").
      Continue now treats a finished run as told in ALL its snapshots: a live
      row whose map_seed is on the finished ledger (or matches any row
      stamped over — legacy saves) is passed over. AND the finish is a hard
      line in time (`neo-finished-at`, read via Backend.lastFinishAt): once a
      game ends, Continue offers NOTHING saved before that moment — not even
      an unfinished other run from last week. "My game is over, New Game is
      my only option." A save written AFTER the finish (a fresh run, or an
      old slot loaded from the Load screen and played) brings the button
      back. The slots themselves stay fully loadable from the Load screen —
      savescumming is the player's right; Continue just doesn't walk back
      into a told story.

   Run this after touching any of:
     backend.js — finalizeRun, noteFinishedSeed/finishedSeeds, autosaveNow,
                  snapshotLocal/readLocalSnapshot/clearLocalSnapshot,
                  markActiveSlot, listSaves (cols)
     screens.js — onTitle (the Continue pick), continueGame, loadRow
     game.js — G.end

     node tests/finished-run-continue.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const tick = () => new Promise(r => setTimeout(r, 30));

  // ---- 1. winning never writes to the save slot, but retires the run ----
  {
    localStorage.removeItem('neo-finished-seeds');
    localStorage.removeItem('neo-finished-at');
    G.newGame('777', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    Backend.markActiveSlot(2); Backend.activeName = 'Village';
    Backend.snapshotLocal(G.saveJSON());                    // the crash net holds a live snapshot
    let slotWrites = 0;
    const origSave = Backend.saveSlot;
    Backend.saveSlot = async () => { slotWrites++; return { ok: true, data: {} }; };
    const origReady = Backend.isReady;
    Backend.isReady = () => true;                           // even with the cloud "reachable"…
    G.end(true, 'test victory');
    await tick();
    Backend.saveSlot = origSave; Backend.isReady = origReady;
    ck('victoryNeverWritesTheSlot', slotWrites === 0, `saveSlot called ${slotWrites} times`);
    ck('crashNetCleared', !Backend.readLocalSnapshot(), '');
    ck('slotUnbound', Backend.activeSlot == null, `activeSlot=${Backend.activeSlot}`);
    ck('finishedSeedRecorded', Backend.finishedSeeds().includes('777'), JSON.stringify(Backend.finishedSeeds()));
    ck('finishMomentRecorded', Backend.lastFinishAt() > 0, String(Backend.lastFinishAt()));
  }

  // ---- 2. the title's Continue: all snapshots of a finished run are told ----
  const tryTitle = async (rows) => {
    const origReady = Backend.isReady, origList = Backend.listSaves;
    Backend.isReady = () => true;
    Backend.listSaves = async () => ({ ok: true, data: rows });
    Screens.onTitle();
    await tick();
    Backend.isReady = origReady; Backend.listSaves = origList;
    const btn = document.getElementById('btnContinue');
    return { label: btn.querySelector('small').textContent, cant: btn.classList.contains('cant') };
  };

  {
    // exactly the reported bug: an old mid-run save + the won row, same seed —
    // Continue used to fall back to "Mid Game"; it must grey out instead
    // (finished-at cleared so this isolates the SEED ledger specifically)
    localStorage.removeItem('neo-finished-seeds');
    localStorage.removeItem('neo-finished-at');
    const r = await tryTitle([
      { slot: 1, name: 'Mid Game', day: 321, map_seed: '255723405', over: null, updated_at: '2026-07-27T01:00:00Z' },
      { slot: 2, name: 'Village', day: 489, map_seed: '255723405', over: { win: true }, updated_at: '2026-07-27T02:00:00Z' },
    ]);
    ck('midRunSaveOfWonGameIsNotContinue', r.cant && !/Mid Game/.test(r.label), JSON.stringify(r));
  }

  {
    // the post-fix shape of the same story: NO won row (the slot was spared),
    // the finish known only from the local ledger — still no Continue
    localStorage.removeItem('neo-finished-at');
    localStorage.setItem('neo-finished-seeds', JSON.stringify(['255723405']));
    const r = await tryTitle([
      { slot: 1, name: 'Mid Game', day: 321, map_seed: '255723405', over: null, updated_at: '2026-07-27T01:00:00Z' },
      { slot: 2, name: 'Village', day: 487, map_seed: '255723405', over: null, updated_at: '2026-07-27T02:00:00Z' },
    ]);
    ck('ledgerAloneRetiresContinue', r.cant, JSON.stringify(r));
    localStorage.removeItem('neo-finished-seeds');
  }

  {
    // regression (fresh device, no recorded finish moment): a live save of a
    // DIFFERENT, unfinished run still continues beside an older finished one
    localStorage.removeItem('neo-finished-at');
    localStorage.setItem('neo-finished-seeds', JSON.stringify(['255723405']));
    const r = await tryTitle([
      { slot: 2, name: 'Village', day: 487, map_seed: '255723405', over: null, updated_at: '2026-07-27T02:00:00Z' },
      { slot: 3, name: 'Fresh Start', day: 12, map_seed: '999', over: null, updated_at: '2026-07-27T03:00:00Z' },
    ]);
    ck('unfinishedRunStillContinues', !r.cant && /Fresh Start/.test(r.label), JSON.stringify(r));
    localStorage.removeItem('neo-finished-seeds');
  }

  {
    // regression: a lone live run with a clean ledger continues as always
    localStorage.removeItem('neo-finished-at');
    const r = await tryTitle([
      { slot: 1, name: 'Mid Game', day: 321, map_seed: '111', over: null, updated_at: '2026-07-27T01:00:00Z' },
    ]);
    ck('plainLiveRunContinues', !r.cant && /Mid Game/.test(r.label), JSON.stringify(r));
  }

  // ---- the finish is a hard line in time: after a win, even an OLDER
  //      unfinished run does not continue — New Game is the only option ----
  {
    localStorage.removeItem('neo-finished-seeds');
    localStorage.setItem('neo-finished-at', String(Date.now()));
    const r = await tryTitle([
      { slot: 3, name: 'Last Week', day: 88, map_seed: '424242', over: null, updated_at: '2026-07-20T12:00:00Z' },
    ]);
    ck('finishRetiresOlderRunsToo', r.cant, JSON.stringify(r));
  }

  // ---- …but a save written AFTER the finish revives the button ----
  {
    localStorage.removeItem('neo-finished-seeds');
    localStorage.setItem('neo-finished-at', String(Date.now() - 60000));
    const r = await tryTitle([
      { slot: 3, name: 'Last Week', day: 88, map_seed: '424242', over: null, updated_at: '2026-07-20T12:00:00Z' },
      { slot: 4, name: 'Fresh Run', day: 5, map_seed: '555', over: null, updated_at: new Date(Date.now() + 5000).toISOString() },
    ]);
    ck('saveAfterFinishRevivesContinue', !r.cant && /Fresh Run/.test(r.label), JSON.stringify(r));
    localStorage.removeItem('neo-finished-at');
  }

  // ---- 3. the finished ledger is capped and deduped ----
  {
    localStorage.removeItem('neo-finished-seeds');
    for (let i = 0; i < 60; i++) Backend.noteFinishedSeed('s' + i);
    Backend.noteFinishedSeed('s59');
    const list = Backend.finishedSeeds();
    ck('ledgerCappedAt50', list.length === 50, `len=${list.length}`);
    ck('ledgerKeepsNewestAndDedupes', list.includes('s59') && !list.includes('s0') && list.filter(s => s === 's59').length === 1, '');
    localStorage.removeItem('neo-finished-seeds');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FINISHED-RUN CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
