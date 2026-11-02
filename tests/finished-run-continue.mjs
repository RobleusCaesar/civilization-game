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

   3. A STATUS WORD REPLACED THE GAME BEING CONTINUED (§4). Continue loads the
      save, then waits behind "Preparing the world…" while the title is still
      the current screen — and every backend status word (a sign-in landing, a
      request failing) re-ran onTitle to re-resolve the Continue button, which
      rolled a fresh demo world over the loaded game and entered THAT: a
      random world with no HUD. On a phone's cold cache the plaque stands for
      seconds while the sign-in lands. A world being entered now outranks the
      demo (Screens._entering, set by enterGame until _enterNow).

   4. OFFLINE, THE TITLE CHASED ITS OWN FAILURES (§5). Every failed request
      said the status again on backend-status, and the title answered every
      status word with a save lookup of three tries, each of which failed and
      said it again: one lookup became thousands in ten seconds and the page
      froze. Backend.emit now says a status only when it CHANGED.

   5. THE CRASH NET LOST THE GAME THAT WAS PLAYED (§6). A world founded
      behind the origin cards and never entered was written over the real
      game on a tab-hide (autosaveNow now refuses a world with S.played
      false), and a second game in one sitting saved no recovery snapshot
      until it passed the previous run's last day (G.newGame and G.loadJSON
      now restart the cadence).

   6. CONTINUE WORKS THE FIRST TIME AND SAYS WHERE YOU ARE (§7, PX-21a /
      PX-69 / PX-38 — every message claim is a claim about what the player
      can SEE: shown, and on top at its own centre by elementFromPoint, never
      that some element holds the words). One opening at a time
      (Screens._continuing / opening()): a double Continue loads and enters
      once — a cloud save is fetched once, the press made while it is on
      its way is answered, and one that never answers is called off past
      LOAD_MAX_MS, its late answer dropped — and a New Game tap under the
      plaque founds nothing, while the title stays live under it. A save that will not open says why on the
      shell's own line (#shellMsg, Screens.say: a toast is display:none off
      the playing screen) and a world the attempt touched leaves a clean
      title; so do a failed or finished cloud save, a slot that will not
      load, a file that will not import and an identity that will not
      restore. A tap while the lookup is still out is answered. The title's
      drift moves only the demo, never a world being entered. A crash-net
      Continue counts its day as saved, and arriving says "Welcome back —
      day N" once (a Resume says nothing). The plaque's bar fills by time
      against the art's floor when the art says nothing, and never goes
      back; a fault behind the plaque, or a wait that never ends
      (PREP_MAX_MS), still enters the game.

   Run this after touching any of:
     backend.js — finalizeRun, noteFinishedSeed/finishedSeeds, autosaveNow,
                  snapshotLocal/readLocalSnapshot/clearLocalSnapshot,
                  markActiveSlot, listSaves (cols), emit, _rest's catch
     screens.js — onTitle (the Continue pick), continueGame, loadRow,
                  _loadSave, say/unsay, enterGame/_enterNow (the plaque and
                  its tick), showPrep, saveToSlot, the file import, the
                  title drift in init, ensureDemo, the backend-status listener
     index.html — #shellMsg (the shell's message line)
     game.js — G.end, the autosave cadence in G.dayTick, and the cadence
               restart in G.newGame / G.loadJSON

     node tests/finished-run-continue.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
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

  // ---- 4. a status word never replaces a game being entered ----
  {
    G.newGame('8675309', 'calm', 'small'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const json = G.saveJSON();
    Screens._demo = false; Screens.show('title');           // the title, wearing its demo world
    Backend.snapshotLocal(json); Screens._newestSlot = 'local';
    // hold the entry behind the plaque, as a cold phone cache does
    const realReady = Assets.artReady, realIdle = Assets.whenIdle;
    let hold = true, release = null;
    Assets.artReady = function () { return !hold && realReady.call(Assets); };
    Assets.whenIdle = () => new Promise(r => { release = r; });
    let during = '';
    try {
      await Screens.continueGame();
      await tick();
      during = `${Screens.current} seed=${S.seed}`;
      // the sign-in lands (or a request fails) while the plaque is up
      window.dispatchEvent(new CustomEvent('backend-status', { detail: { online: true, configured: true, uid: 'u1' } }));
      await tick();
    } finally {
      hold = false; Assets.artReady = realReady; Assets.whenIdle = realIdle; if (release) release();
    }
    for (let i = 0; i < 600 && Screens.current !== 'playing'; i++) await tick();
    const hud = document.body.classList.contains('ingame');
    ck('aStatusWordNeverReplacesTheGameBeingEntered',
      Screens.current === 'playing' && String(S.seed) === '8675309' && !Screens._demo && hud,
      `during: ${during}; after: ${Screens.current} seed=${S.seed} demo=${Screens._demo} hud=${hud}`);
    ck('andTheTitleIsItselfAgainAfter', !Screens._entering, `entering=${Screens._entering}`);
    S.paused = true;
    Backend.clearLocalSnapshot && Backend.clearLocalSnapshot();
  }

  // ---- 5. the title never chases its own failures (offline) ----
  {
    // a dead network: every request fails after a beat, as a real one does
    const realFetch = window.fetch, realReady = Backend.isReady;
    let calls = 0, words = 0;
    const onWord = () => words++;
    window.fetch = () => { calls++; return new Promise((_, no) => setTimeout(() => no(new TypeError('Failed to fetch')), 40)); };
    Backend.isReady = () => true;
    window.addEventListener('backend-status', onWord);
    Screens._demo = false; Screens.show('title');           // a signed-in player comes back to the title
    let worst = 0, last = performance.now();
    const until = last + 3000;
    while (performance.now() < until) {
      await new Promise(r => setTimeout(r, 50));
      const now = performance.now(); worst = Math.max(worst, now - last - 50); last = now;
    }
    // stop any storm still running: requests that never answer say nothing
    window.fetch = () => new Promise(() => {});
    window.removeEventListener('backend-status', onWord);
    const label = document.getElementById('btnContinue').querySelector('small').textContent;
    Backend.isReady = realReady;
    ck('theTitleNeverChasesItsOwnFailures', calls <= 12 && words <= 2,
      `${calls} requests and ${words} status words in 3 s offline (one lookup tries 3 times); worst stall ${Math.round(worst)} ms; Continue reads "${label}"`);
    window.__realFetch = realFetch;                         // put back after §6, which needs no network
  }

  // ---- 6. the crash net keeps the game that was PLAYED ----
  {
    // a world nobody entered (the draft behind the origin cards) never
    // replaces the played game the crash net is holding
    G.newGame('6061', 'calm', 'small'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.day = 26; Backend.snapshotLocal(G.saveJSON());
    G.newGame('7071', 'calm', 'small'); Screens._demo = false;   // founded, as foundRun leaves it: never shown
    await Backend.autosaveNow('hide');
    const kept = Backend.readLocalSnapshot();
    const keptSeed = kept && kept.json ? String(JSON.parse(kept.json).seed) : 'none';
    Screens.show('playing'); S.paused = true;               // entered: now it is the game
    await Backend.autosaveNow('hide');
    const now = Backend.readLocalSnapshot();
    const nowSeed = now && now.json ? String(JSON.parse(now.json).seed) : 'none';
    ck('aWorldNobodyEnteredNeverReplacesTheCrashNet', keptSeed === '6061' && kept.day === 26,
      `after a hide on the unentered world the net holds seed ${keptSeed}, day ${kept && kept.day}`);
    ck('andTheGameOnceEnteredIsSaved', nowSeed === '7071', `after entering, the net holds seed ${nowSeed}`);

    // a SECOND game in one sitting keeps its cadence from day one — and so
    // does a loaded save, whatever day the last run reached
    const realSave = Backend.autosaveNow;
    let cad = 0;
    Backend.autosaveNow = (why) => { if (why === 'cadence') cad++; return Promise.resolve({ ok: false }); };
    try {
      Backend._lastAutosaveDay = 20;                        // the last run's last snapshot was on day 20
      G.newGame('8081', 'calm', 'small'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      S.day = 1; G.dayTick();                               // → day 2
      const second = cad;
      S.day = 5; const day5 = G.saveJSON();
      Backend._lastAutosaveDay = 22;                        // a later day of some other run
      G.loadJSON(day5); Screens._demo = false; Screens.show('playing'); S.paused = true;
      cad = 0; G.dayTick();                                 // → day 6
      const loaded = cad;
      ck('aSecondGameKeepsItsCrashNetCadence', second === 1,
        `${second} cadence snapshot(s) on day 2 of a second game (the last run stopped on day 20)`);
      ck('andSoDoesALoadedSave', loaded === 1, `${loaded} cadence snapshot(s) on day 6 of a loaded day-5 save (the last run stopped on day 22)`);
    } finally { Backend.autosaveNow = realSave; }
    S.paused = true;
    Backend.clearLocalSnapshot && Backend.clearLocalSnapshot();
    window.fetch = window.__realFetch; delete window.__realFetch;
  }

  /* ---- 7. CONTINUE WORKS THE FIRST TIME AND SAYS WHERE YOU ARE (PX-21a /
     PX-69 / PX-38). Every claim about a message is a claim about what the
     player can SEE: shown (display, visibility, opacity up the tree) and on
     top at its own centre (elementFromPoint) — never that some element holds
     the words, which is how every shell-screen toast stayed "present" while
     body:not(.ingame) #toasts hid it. ---- */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const seen = el => {
    if (!el) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // a toast column takes no taps (pointer-events: none), which hit-testing
    // honours: let the words themselves take the probe for one read, so the
    // answer is about what is PAINTED on top there, never about taps
    const pe = el.style.getPropertyValue('pointer-events'), pri = el.style.getPropertyPriority('pointer-events');
    el.style.setProperty('pointer-events', 'auto', 'important');
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    el.style.setProperty('pointer-events', pe, pri);
    return !!hit && (hit === el || el.contains(hit));
  };
  // the words a player can see right now that say `re`
  const sees = re => [...document.querySelectorAll('body *')].find(el => !el.childElementCount && re.test(el.textContent || '') && seen(el)) || null;
  const prepUp = () => { const e = document.getElementById('prep'); return !!e && e.style.display !== 'none'; };
  const playing = async (ms) => { const t = performance.now() + (ms || 15000); while (Screens.current !== 'playing' && performance.now() < t) await tick(); return Screens.current === 'playing'; };
  // nothing still opening from the step before — a Resume whose art is still
  // landing waits behind its own plaque, and a press made then is (rightly)
  // refused: each section starts from a settled shell
  const settle = async () => { const t = performance.now() + 20000; while ((Screens._entering || Screens._continuing || Screens._prepRun) && performance.now() < t) await tick(); };
  // a played game in the crash net, and the title in front of it — a fresh page's state
  const netGame = (seed, day) => {
    G.newGame(seed, 'calm', 'small'); Cards.pick(0); Screens._demo = false; Screens.show('playing'); S.paused = true; S.day = day;
    Backend.snapshotLocal(G.saveJSON());
    Screens._demo = false; Screens.lastSavedDay = 0; Screens.show('title');   // the title's own demo world; Continue reads the net
  };
  // the art still on its way, as on a cold phone cache: the press waits behind the plaque
  const holdArt = () => {
    const h = { ready: Assets.artReady, idle: Assets.whenIdle, release: null, on: true };
    Assets.artReady = function () { return !h.on && h.ready.call(Assets); };
    Assets.whenIdle = () => new Promise(r => { h.release = r; });
    h.let = () => { h.on = false; Assets.artReady = h.ready; Assets.whenIdle = h.idle; if (h.release) h.release(); };
    return h;
  };
  const cont = () => document.getElementById('btnContinue');

  // ---- 7a. a double tap on Continue loads the save ONCE and enters it once;
  //          the arrival is told; the crash net's day counts as saved ----
  {
    netGame('424243', 9);
    let loads = 0, enters = 0;
    const l0 = G.loadJSON, e0 = Screens._enterNow;
    G.loadJSON = function (j) { loads++; return l0.call(G, j); };
    Screens._enterNow = function () { enters++; return e0.call(Screens); };
    try {
      UI._toastAt = {};
      cont().click(); cont().click();                       // a double tap
      await playing();
      await wait(400);
    } finally { G.loadJSON = l0; Screens._enterNow = e0; }
    ck('aDoubleContinueLoadsOnce', loads === 1 && enters === 1 && Screens.current === 'playing' && String(S.seed) === '424243',
      `${loads} load(s), ${enters} entr(ies); ${Screens.current}, seed ${S.seed}`);
    // the note follows the world's first painted frames: look for it a while,
    // never at one fixed beat (a loaded machine stretches the first frames)
    let note = null;
    for (const t = performance.now() + 4000; !note && performance.now() < t;) { note = sees(/Welcome back/); if (!note) await tick(); }
    ck('theArrivalIsTold', !!note && /day 9\b/.test(note.textContent), note ? `"${note.textContent}" is seen` : 'no "Welcome back" a player can see');
    ck('aCrashNetContinueCountsAsSavedThatDay', Screens.lastSavedDay === 9, `lastSavedDay=${Screens.lastSavedDay} on a day-9 Continue`);
    // …and only on arriving: a Resume from the pause menu says nothing
    UI._toastAt = {};
    const before = new Set(document.querySelectorAll('#toasts .toast'));
    Screens.show('paused'); Screens.enterGame();
    await playing(); await wait(600);                       // the Resume is in (behind a plaque if the art is still landing)
    const again = [...document.querySelectorAll('#toasts .toast')].filter(t => !before.has(t) && /Welcome back/.test(t.textContent)).length;
    ck('andOnlyOnArriving', again === 0, `${again} new "Welcome back" on a Resume`);
    S.paused = true;
  }

  // ---- 7a². …and a CLOUD save the same: the press waits on the network with
  //          nothing on screen yet, which is exactly when a player presses
  //          again — that press is answered, never obeyed ----
  {
    await settle();
    G.newGame('737373', 'calm', 'small'); Cards.pick(0); Screens._demo = false; Screens.show('playing'); S.paused = true; S.day = 12;
    const state = G.saveJSON();
    Backend.clearLocalSnapshot();
    const realReady = Backend.isReady, realList = Backend.listSaves, realLoad = Backend.loadSlot;
    const l0 = G.loadJSON, e0 = Screens._enterNow, gives = [];
    let fetches = 0, loads = 0, enters = 0, msg = null;
    Backend.isReady = () => true;
    Backend.listSaves = async () => ({ ok: true, data: [{ slot: 3, name: 'Hill Fort', day: 12, map_seed: '737373', updated_at: new Date().toISOString(), over: false }] });
    Backend.loadSlot = (slot) => { fetches++; return new Promise(r => gives.push(() => r({ ok: true, data: { slot, name: 'Hill Fort', state } }))); };
    G.loadJSON = function (j) { loads++; return l0.call(G, j); };
    Screens._enterNow = function () { enters++; return e0.call(Screens); };
    try {
      Screens._demo = false; Screens.show('title');
      for (let i = 0; i < 200 && Screens._newestSlot !== 3; i++) await tick();
      cont().click(); await wait(150);                      // the save is on its way
      cont().click(); await wait(150);                      // …and nothing has happened yet
      msg = sees(/Opening your saved game/i);
      gives.splice(0).forEach(g => g());                     // the network answers
      await playing();
      await wait(200);
    } finally {
      Backend.isReady = realReady; Backend.listSaves = realList; Backend.loadSlot = realLoad;
      G.loadJSON = l0; Screens._enterNow = e0;
    }
    ck('aDoubleContinueOnACloudSaveFetchesOnce', fetches === 1 && loads === 1 && enters === 1 && Screens.current === 'playing' && String(S.seed) === '737373',
      `${fetches} fetch(es), ${loads} load(s), ${enters} entr(ies); ${Screens.current}, seed ${S.seed}`);
    ck('andTheSecondPressIsAnswered', !!msg, msg ? `"${msg.textContent}" is seen while the save is on its way` : 'nothing a player can see');
    S.paused = true;
  }

  // ---- 7a³. …and a cloud save that NEVER answers (a token refresh that
  //          hangs, a body that stalls after its headers) cannot hold the
  //          title's presses for good: past LOAD_MAX_MS the attempt is called
  //          off, said, and an answer that comes later is never loaded ----
  {
    await settle();
    G.newGame('747474', 'calm', 'small'); Cards.pick(0); Screens._demo = false; Screens.show('playing'); S.paused = true; S.day = 8;
    const state = G.saveJSON();
    Backend.clearLocalSnapshot();
    const realReady = Backend.isReady, realList = Backend.listSaves, realLoad = Backend.loadSlot, cap0 = Screens.LOAD_MAX_MS;
    const l0 = G.loadJSON, late = [];
    let loads = 0, msg = null, busy = null, ng = null, after = null, label = '';
    Backend.isReady = () => true;
    Backend.listSaves = async () => ({ ok: true, data: [{ slot: 4, name: 'Long Road', day: 8, map_seed: '747474', updated_at: new Date().toISOString(), over: false }] });
    Backend.loadSlot = (slot) => new Promise(r => late.push(() => r({ ok: true, data: { slot, name: 'Long Road', state } })));   // no answer
    G.loadJSON = function (j) { loads++; return l0.call(G, j); };
    Screens.LOAD_MAX_MS = 700;
    try {
      Screens._demo = false; Screens.show('title');
      for (let i = 0; i < 200 && Screens._newestSlot !== 4; i++) await tick();
      label = cont().querySelector('small').textContent + ' / ' + Screens._newestSlot;
      cont().click(); await wait(1100);                     // past the cap
      msg = sees(/could not be opened/i);
      busy = !!(Screens._continuing || Screens._entering);
      late.splice(0).forEach(g => g());                      // …and then the cloud answers after all
      await wait(300);
      after = { screen: Screens.current, loads };
      document.getElementById('btnTitleNew').click(); await tick();
      ng = Screens.current;
    } finally {
      Backend.isReady = realReady; Backend.listSaves = realList; Backend.loadSlot = realLoad;
      G.loadJSON = l0; Screens.LOAD_MAX_MS = cap0;
    }
    ck('aCloudSaveThatNeverAnswersLetsGoOfTheTitle', !!msg && !busy && after.loads === 0 && after.screen === 'title' && ng === 'newgame',
      `${msg ? '"' + msg.textContent + '"' : 'nothing a player can see'} (Continue read "${label}"); in flight ${busy}; a late answer loaded ${after.loads} time(s) (${after.screen}); New game opened "${ng}"`);
    Screens.show('title');
  }

  // ---- 7b. a New Game tap while the plaque is up founds nothing, and the
  //          title's drift never moves the world being entered ----
  {
    netGame('5151', 4);
    const h = holdArt();
    let during = {}, cam0 = null, cam1 = null;
    try {
      cont().click(); await wait(120);
      // the plaque is up; the world behind it bakes (the frame loop's slices)
      for (let i = 0; i < 200 && (R._bake || R._bakeDue || !R.terrainCache); i++) await tick();
      cam0 = [R.cam.x, R.cam.y];
      await wait(400);
      cam1 = [R.cam.x, R.cam.y];
      document.getElementById('btnTitleNew').click(); await tick();
      const screenAfterTap = Screens.current;
      Screens.newPrefs.mode = 'calm'; Screens.startNewGame();          // a trial tapped twice, wherever the tap landed
      await wait(250);
      during = { plaque: prepUp(), screenAfterTap, seed: String(S.seed) };
    } finally { h.let(); }
    await playing();
    ck('aNewGameTapDuringThePlaqueFoundsNothing',
      during.plaque && during.screenAfterTap === 'title' && during.seed === '5151' && Screens.current === 'playing' && String(S.seed) === '5151' && S.day === 4,
      `plaque ${during.plaque}; the tap left the title on "${during.screenAfterTap}", the world ${during.seed}; entered ${Screens.current} seed ${S.seed} day ${S.day}`);
    const moved = cam0 && cam1 ? Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1]) : -1;
    ck('theTitleDriftNeverMovesAWorldBeingEntered', moved === 0, `the loaded world's camera moved ${moved.toFixed ? moved.toFixed(1) : moved}px behind the plaque`);
    S.paused = true;
    // …while the title's own demo still drifts
    Screens._demo = false; Screens.show('title');
    for (let i = 0; i < 600 && !(R.terrainCache && !R._bake && !R._bakeDue); i++) await tick();
    const d0 = [R.cam.x, R.cam.y]; await wait(400);
    const drift = Math.hypot(R.cam.x - d0[0], R.cam.y - d0[1]);
    ck('butTheDemoStillDrifts', Screens._demo && drift > 0.5, `demo ${Screens._demo}, drifted ${drift.toFixed(1)}px in 0.4 s`);
  }

  // ---- 7c. a Continue whose save will not open says why, where the player
  //          can see it, and leaves a title that still answers ----
  {
    G.newGame('8181', 'calm', 'small'); Cards.pick(0);
    const j = JSON.parse(G.saveJSON()); j.v = 99;               // e.g. a snapshot a newer build wrote on this origin
    localStorage.setItem('neo-emergency', JSON.stringify({ at: Date.now(), day: 7, slot: null, json: JSON.stringify(j) }));
    Screens._demo = false; Screens.show('title');
    const label = cont().querySelector('small').textContent;
    let threw = null;
    try { cont().click(); } catch (e) { threw = String(e); }
    await wait(400);
    const msg = sees(/could not be opened/i);
    const stuck = !!(Screens._continuing || Screens._entering);
    document.getElementById('btnTitleNew').click(); await tick();
    const ng = Screens.current;
    ck('aContinueThatCannotOpenSaysWhyVisibly', !!msg && /newer version/i.test(msg.textContent) && !threw,
      msg ? `"${msg.textContent}" is seen over the title (Continue read "${label}")` : `nothing a player can see (Continue read "${label}")`);
    ck('andTheTitleStillAnswers', !stuck && ng === 'newgame', `in flight ${stuck}; New game opened "${ng}"`);
    Screens.show('title');
    localStorage.removeItem('neo-emergency');
  }

  // ---- 7d. a load that fails AFTER touching the world leaves a clean title ----
  {
    G.newGame('9292', 'calm', 'small'); Cards.pick(0); Screens._demo = false; Screens.show('playing'); S.paused = true; S.day = 3;
    Backend.snapshotLocal(G.saveJSON());
    Screens._demo = false; Screens.show('title');
    const demoSeed = String(S.seed);
    const on0 = R.onNewGame; let once = true;
    R.onNewGame = function () { if (once) { once = false; throw new Error('a painter fault mid-load'); } return on0.apply(R, arguments); };
    try { cont().click(); await wait(400); } finally { R.onNewGame = on0; }
    const msg = sees(/could not be opened/i);
    ck('aLoadThatFailsHalfWayLeavesACleanTitle',
      Screens.current === 'title' && Screens._demo && String(S.seed) !== '9292' && !!(R.terrainCache || R._bakeDue || R._bake),
      `title ${Screens.current}, demo ${Screens._demo}, world ${S.seed} (the save was 9292, the old demo ${demoSeed}), ground ${!!R.terrainCache || 'due ' + !!(R._bakeDue || R._bake)}`);
    ck('andSaysSo', !!msg, msg ? `"${msg.textContent}"` : 'nothing a player can see');
    Backend.clearLocalSnapshot();
  }

  // ---- 7e. a tap while the cloud lookup is still out is answered ----
  {
    const realReady = Backend.isReady, realList = Backend.listSaves;
    let answer = null;
    Backend.isReady = () => true;
    Backend.listSaves = () => new Promise(r => { answer = r; });
    Backend.clearLocalSnapshot();
    try {
      Screens._demo = false; Screens.show('title');
      const label = cont().querySelector('small').textContent;
      cont().click(); await wait(300);
      const msg = sees(/still checking/i);
      ck('aTapWhileTheLookupIsOutIsAnswered', /looking/.test(label) && !!msg, msg ? `"${msg.textContent}" (Continue read "${label}")` : `nothing a player can see (Continue read "${label}")`);
    } finally {
      if (answer) answer({ ok: true, data: [] });
      Backend.isReady = realReady; Backend.listSaves = realList;
    }
    await tick();
  }

  // ---- 7f. the plaque's bar shows progress: time against the art's floor
  //          when the art says nothing, and it never goes back ----
  {
    netGame('3131', 5);
    const h = holdArt();
    const floor0 = Screens.GAME_ART_FLOOR_MS, pend0 = Assets.pending;
    Screens.GAME_ART_FLOOR_MS = 3000;
    Assets.pending = 40;                                        // forty pictures still on the wire, none landing
    const samples = [];
    try {
      cont().click();
      const t0 = performance.now();
      for (let i = 0; i < 16; i++) {
        await wait(100);
        const f = document.getElementById('prepFill');
        samples.push([performance.now() - t0, f ? parseFloat(f.style.width) || 0 : -1]);
      }
    } finally { Assets.pending = pend0; Screens.GAME_ART_FLOOR_MS = floor0; h.let(); }
    await playing();
    let back = 0; for (let i = 1; i < samples.length; i++) if (samples[i][1] < samples[i - 1][1]) back++;
    const [tl, wl] = samples[samples.length - 1];
    ck('thePlaquesBarShowsProgress', back === 0 && wl >= Math.min(100, 100 * (tl - 150) / 3000) - 2 && wl > 20,
      `${back} step(s) back; ${wl}% at ${Math.round(tl)} ms of a 3000 ms floor (forty pictures pending)`);
    S.paused = true;
  }

  // ---- 7g. a fault in the plaque's tick still lifts it and enters the game ----
  {
    netGame('7373', 6);
    const h = holdArt();
    const tb = R.tickBake; let faults = 0;
    try {
      cont().click(); await wait(80);
      R.tickBake = function () { if (!faults++) throw new Error('a painter fault behind the plaque'); return tb.apply(R, arguments); };
      R._bakeDue = true;                                        // the bake is still owed when the art lands
    } finally { h.let(); }
    const ok = await playing(6000);
    R.tickBake = tb;
    ck('aFaultBehindThePlaqueStillEntersTheGame', ok && String(S.seed) === '7373' && !prepUp() && !Screens._entering,
      `faults ${faults}; ${Screens.current} seed ${S.seed}, plaque ${prepUp()}, entering ${Screens._entering}`);
    S.paused = true;
  }

  // ---- 7h. the shell's messages are SEEN: a cloud save that fails or works,
  //          a slot that will not load, a file that will not import, an
  //          identity that will not restore ----
  {
    G.newGame('6464', 'calm', 'small'); Cards.pick(0); Screens._demo = false; Screens.show('playing'); S.paused = true; S.day = 12;
    const real = { ready: Backend.isReady, list: Backend.listSaves, load: Backend.loadSlot, auto: Backend.autosaveNow, imp: Backend.importIdentity, prompt: window.prompt };
    window.prompt = () => 'Test Village';
    try {
      Backend.isReady = () => true;
      Backend.listSaves = async () => ({ ok: true, data: [{ slot: 1, name: 'Old Village', day: 3, landform: 'valley', playtime_seconds: 60, updated_at: new Date().toISOString() }] });
      // a cloud save that fails — the player is on the Save screen, from the pause menu
      Screens.backTo = 'paused'; Screens.show('load', { saveMode: true }); await wait(50);
      Backend.autosaveNow = async () => ({ ok: false, error: { code: 500, message: 'Server error' } });
      await Screens.saveToSlot(2, null); await wait(150);
      const fail = sees(/save failed/i);
      ck('aFailedSaveIsSeen', !!fail, fail ? `"${fail.textContent}" over the ${Screens.current} screen` : 'nothing a player can see');
      // …and one that works ("Did my progress save?")
      Backend.autosaveNow = async () => ({ ok: true, data: null });
      await Screens.saveToSlot(2, null); await wait(150);
      const good = sees(/saved to slot 2/i);
      ck('andASaveThatWorksIsSeenToo', !!good, good ? `"${good.textContent}" over the ${Screens.current} screen` : 'nothing a player can see');
      // a slot that will not load (the Load screen's own button)
      Screens.backTo = 'title'; Screens.show('load'); await wait(50);
      Backend.loadSlot = async () => ({ ok: false, error: { code: 'network', message: 'Request timed out' } });
      const lb = [...document.querySelectorAll('#slotList .abtn')].find(x => /Load/.test(x.textContent));
      if (lb) lb.click();
      await wait(150);
      const lf = sees(/could not be opened|timed out/i);
      ck('aSlotThatWillNotLoadIsSeen', !!lb && !!lf && Screens.current === 'load', lf ? `"${lf.textContent}"` : `nothing a player can see (button ${!!lb})`);
      // …and one whose fetch THROWS releases the press, keeps the world in
      // hand and the screen it was on, and says so
      if (Screens.unsay) Screens.unsay();
      const seed0 = String(S.seed);
      Backend.loadSlot = async () => { throw new Error('a fault in the fetch'); };
      const lb2 = [...document.querySelectorAll('#slotList .abtn')].find(x => /Load/.test(x.textContent));
      if (lb2) lb2.click();
      await wait(150);
      const lt = sees(/could not be opened/i);
      const busy = !!(Screens._continuing || Screens._entering);
      ck('aLoadThatThrowsLetsGoOfThePress', !!lt && !busy && Screens.current === 'load' && String(S.seed) === seed0,
        `${lt ? '"' + lt.textContent + '"' : 'nothing a player can see'}; in flight ${busy}; ${Screens.current}; world ${S.seed} (was ${seed0})`);
      // a save file that will not import
      const inp = document.getElementById('fileLoad');
      const dt = new DataTransfer(); dt.items.add(new File(['this is not a save'], 'village.json', { type: 'application/json' }));
      inp.files = dt.files; inp.dispatchEvent(new Event('change'));
      await wait(300);
      const imp = sees(/could not (be opened|load)/i);
      ck('aFileThatWillNotImportIsSeen', !!imp && Screens.current === 'load', imp ? `"${imp.textContent}"` : 'nothing a player can see');
      // an identity that will not restore, over the settings page
      Screens.show('settings'); await wait(50);
      Backend.importIdentity = async () => ({ ok: false, error: { code: 'bad_token', message: 'That does not look like a recovery token' } });
      document.getElementById('btnImportId').click();
      await wait(150);
      const idm = sees(/does not look like a recovery token/i);
      ck('aRestoreThatFailsIsSeen', !!idm, idm ? `"${idm.textContent}" over Settings` : 'nothing a player can see');
    } finally {
      Backend.isReady = real.ready; Backend.listSaves = real.list; Backend.loadSlot = real.load;
      Backend.autosaveNow = real.auto; Backend.importIdentity = real.imp; window.prompt = real.prompt;
    }
    Screens.backTo = 'title'; Screens.show('title');
  }

  // ---- 7i. the plaque never strands the player: a wait that never ends is
  //          cut off, and the game is entered (last — on a build without the
  //          cut-off its pending entry would fire into anything after it) ----
  {
    netGame('8383', 8);
    const h = holdArt();
    const floor0 = Screens.GAME_ART_FLOOR_MS, max0 = Screens.PREP_MAX_MS;
    Screens.GAME_ART_FLOOR_MS = 120000;                         // the art never lands
    Screens.PREP_MAX_MS = 1500;
    let ok = false;
    try { cont().click(); ok = await playing(5000); }
    finally { Screens.GAME_ART_FLOOR_MS = floor0; Screens.PREP_MAX_MS = max0; h.let(); }
    ck('thePlaqueNeverStrandsThePlayer', ok && String(S.seed) === '8383' && !prepUp(),
      `after 5 s: ${Screens.current}, seed ${S.seed}, plaque ${prepUp()}`);
    S.paused = true;
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FINISHED-RUN CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
