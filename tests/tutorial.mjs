/* TUTORIAL CONTRACT (js/tutorial.js) — the game teaches itself, and the
   teaching must cost nothing when it is off.

   What is pinned here:

   1. ZERO RESIDUE OFF. A run without the Origin-screen checkbox has
      S.tut === null, no tutorial DOM, and full-speed sim (simScale 1).
   2. THE ONE ENTRY POINT. Tutorial.maybeStart() arms only with the stored
      checkbox on, a fresh non-demo world and no S.tut already; the scout's
      day hashes off the SEED (9–13) and never off the run's RNG.
   3. THE ORDERED SPINE. The first step presents with its text and Next;
      answering it advances the pointer; the step counter is honest.
   4. OUT-OF-ORDER TOLERANCE. A deed done early (gathering stone while the
      wood step is up) marks its later step done in the background, and the
      pointer skips it when it gets there.
   5. ACTION-GATED ADVANCE. Selecting a villager satisfies tapVillager with
      no button press.
   6. SLOW, NEVER STOPPED. A shown note puts Tutorial.simScale at 0.2;
      dormancy and completion restore 1.
   7. IT RIDES IN THE SAVE. Save mid-tutorial, load it back: phase / step /
      done survive; transient display state does not.
   8. SKIP IS CLEAN. skip() removes every element, kills a live scout,
      restores speed, and stays off (S.tut.on false, skipped true).
   9. THE SCRIPTED SCOUT. Spawns on its day as a rival rider with
      strat 'strike' + scouting (it looks, it never fights), moves under the
      steer, S.rngState is untouched by its whole life, and it is gone after
      its ride. Seen beside the town, its note fires in the rival's colour.
  10. CALM ONLY WHERE CALM. The neutrality note never fires at war
      (moderate); it fires on calm after the scout.
  11. THE CAPSTONE ends phase 1 (TC level 2 → congratulate → phase 2), and
      phase-2 notes fire one-shot: the Trading Post at TC3, mortality via
      G's hook, the win nudge off a standing army.
  12. THE FIRST TWO GAMES TEACH THEMSELVES (Screens.tutorialWanted): with
      the checkbox never touched, games one and two get the teacher and the
      third does not (neo-games counts the foundings); an explicit '1'/'0'
      wins over the count either way; a mid-lesson Skip records the '0';
      a device with any trace of earlier play is seeded as a veteran; the
      draft-screen toggle shows the EFFECTIVE state and a tap flips it into
      an explicit choice; and the teacher is armed BEFORE the run_start
      row is written, so the row tells the truth.
  13. TWO ROADS TO VICTORY (Screens.showVictoryPaths): the first Calm game
      opens on a modal — the rival's hall, this run's own monument with its
      price — once per device, only where the mode offers the Wonder, never
      on Moderate; the tutorial holds its notes while it is up and resumes
      when it is dismissed; leaving the game removes it. And the Wonder's
      build card is dressed as the goal: gold rim, a victory ribbon, a live
      "% saved" line, never ghosted like an unaffordable hut.
  14. THE DECK, TAUGHT LAST (operator ruling 12): with the cards on, the
      deck is kept out of the game while the spine runs (the starter hand
      still lands), walks in the moment the capstone is answered or the
      lesson skipped, and one last note rings it — a slow lesson past day
      150 still names it, a skip still teaches it (one note, nothing to
      skip on it). With the cards OFF the note never fires and the lesson
      goes cold exactly as before, waiting for nothing.
  15. A CARD HAS THE FLOOR (the five-player playtest): a card played under
      a note — the test link's deck stands during the lesson — runs its act
      at full speed with nothing of the lesson on screen, for as long as
      Deck.acting() (the deck's ONE predicate) says it runs; the same note
      comes back after a breath, once the act's own toast is read (bounded),
      slowing the world again. The note's card is opaque: a toast under it
      never reads through.
  16. THE DECK'S NOTE RETIRES WITH THE DECK: up when the last card is
      played, "tap it and play a card" is put away; due over a deck that is
      already empty, it is booked and never shown.
  17. THE RING IS ONE THE PLAYER CAN SEE (PX-05): a lesson's ring under the
      bottom bar, or half a tile past the right edge — both of which
      R.onScreen calls seen — glides into the band no HUD covers; a ring
      already in the clear leaves the camera alone; a gather lesson looks
      again once, when the first villager selection raises the panel over
      it, and never a third time; no look starts while a finger is down
      (it waits for the lift) or while a shell screen covers the world (it
      waits for the game); under reduced motion the move is a jump.
  18. A NOTE THAT WAITS ON A DEED CAN BE PUT AWAY (PX-29): every
      action-gated contextual note offers "Dismiss" (the spine never does),
      and one tap books it for good. The worked-ground note names the
      station its ground can carry — stumps a Lumber Camp, broken rock a
      Quarry, spent soil a Farm — and rings it.
  19. THE TOASTS STEP BELOW THE CARD (--tut-h): while a lesson card sits at
      the top of the screen the toast column starts at the card's bottom
      edge, else 0px, written only when it changes; Tutorial.noteUp() is
      true while a card is on the glass or within the BREATH after one.
  20. THE RIVAL'S INTEL WAITS TO BE READ (PX-10c): never posted while the
      Calm modal has the floor or the game is not on screen, posted once
      when it is, and dropped — never posted late — for another world or
      past its wait.

   Run this after touching any of:
     tutorial.js — everything
     game.js — G.frame's sim-scale/tick hooks, newGame/loadJSON's
               onWorldChange calls, tickMortality's note
     screens.js — draftTap's game start (the old btnDraftGo) /
                  btnTutToggle / syncTutToggle
     index.html — the #tut* CSS/DOM, the draft-screen toggle

     node tests/tutorial.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const T_ = T;   // top-level const — reachable bare, never as window.T

  // the module-clock rule: fixed-step work must not inherit the title demo's phase
  const fresh = (seed, mode, tut) => {
    try { localStorage.setItem('neo-tutorial-ask', tut ? '1' : '0'); } catch (e) {}
    G.newGame(seed, mode || 'calm', 'medium');
    Screens._demo = false;
    Screens.show('playing');
    S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
    if (tut) Tutorial.maybeStart();
  };
  const tick = (n, dt) => { for (let i = 0; i < (n || 1); i++) Tutorial.tick(dt || 1); };
  const clickNext = () => {
    const el = document.getElementById('tutNext'); if (el) el.click();
    tick(6, 0.3);                       // through the BREATH between notes
  };
  const txtOf = id => { const el = document.getElementById(id); return el ? el.textContent : '(no #' + id + ')'; };

  // ---- 1. zero residue when the checkbox is off ----
  {
    fresh('101', 'moderate', false);
    ck('offMeansNull', S.tut === null, String(S.tut));
    ck('offMeansNoDom', !document.getElementById('tutUI') && !document.getElementById('tutDim'), '');
    ck('offMeansFullSpeed', Tutorial.simScale === 1, String(Tutorial.simScale));
  }

  // ---- 2. the entry point and the seed-hashed scout day ----
  {
    fresh('202', 'calm', true);
    ck('checkboxArms', !!S.tut && S.tut.on === true && S.tut.phase === 1, JSON.stringify(S.tut));
    const d1 = S.tut.scoutDay;
    ck('scoutDayInBand', d1 >= 9 && d1 <= 13, String(d1));
    const rng = S.rngState;
    fresh('202', 'calm', true);
    ck('scoutDayDeterministic', S.tut.scoutDay === d1, S.tut.scoutDay + ' vs ' + d1);
    ck('armDrawsNoRng', S.rngState === rng, '');
    // demo worlds and already-armed runs never re-arm
    const t0 = S.tut; Tutorial.maybeStart();
    ck('neverReArms', S.tut === t0, '');
    // the lesson's larder: a tutorial start affords the taught builds
    ck('larderToppedUp', S.res.wood >= 200 && S.res.stone >= 100 && S.res.gold >= 20,
      JSON.stringify(S.res));
  }

  // ---- 3. the spine presents, and Next advances ----
  {
    fresh('303', 'calm', true);
    tick(2, 0.3);
    ck('welcomeShows', Tutorial._show && Tutorial._show.id === 'welcome',
      JSON.stringify(Tutorial._show));
    const panel = document.getElementById('tutPanel');
    ck('panelExists', !!panel && panel.textContent.includes('Town Center'), '');
    ck('counterHonest', txtOf('tutNum') === '1/' + Tutorial.STEPS.length,
      txtOf('tutNum'));
    ck('slowWhileShown', Tutorial.simScale === Tutorial.SLOW, String(Tutorial.simScale));
    // THE BREATH: answering a note leaves a quiet beat before the next one
    document.getElementById('tutNext').click();
    tick(1, 0.1);
    ck('breathAfterNext', Tutorial._show === null && Tutorial._gapT > 0 && Tutorial.BREATH === 1.0,
      JSON.stringify(Tutorial._show) + ' gap=' + Tutorial._gapT.toFixed(2) + ' BREATH=' + Tutorial.BREATH);
    tick(6, 0.3);
    ck('nextAdvances', S.tut.done.welcome === 1 && S.tut.step === 1, JSON.stringify(S.tut.done));
    ck('secondStepShows', Tutorial._show && Tutorial._show.id === 'resources', '');
    // …and the RESOURCES spotlight is a tight rectangle around the four
    // resource CHIPS — never the full-bleed bar, whose ring survives only as
    // one floating gold line — with ALL FOUR of the ring's sides on screen
    {
      const dim = document.getElementById('tutDim');
      const ring = document.getElementById('tutRing').getBoundingClientRect();
      let L = 1e9, T2 = 1e9, R2 = -1e9, B = -1e9;
      for (const id of ['rFood', 'rWood', 'rStone', 'rGold']) {
        const chip = document.getElementById(id).closest('.res');
        const r = chip.getBoundingClientRect();
        L = Math.min(L, r.left); T2 = Math.min(T2, r.top);
        R2 = Math.max(R2, r.right); B = Math.max(B, r.bottom);
      }
      const d = dim.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      // the drawn box hugs the chips ±6, clamped 4px inside the viewport —
      // a full-bleed rect never puts a ring edge offscreen again
      const ex = { left: Math.max(4, L - 6), top: Math.max(4, T2 - 6),
                   right: Math.min(vw - 4, R2 + 6), bottom: Math.min(vh - 4, B + 6) };
      ck('uiSpotlightIsARect', dim.style.borderRadius === '12px' &&
        Math.abs(d.left - ex.left) < 3 && Math.abs(d.top - ex.top) < 3 &&
        Math.abs(d.right - ex.right) < 3 && Math.abs(d.bottom - ex.bottom) < 3,
        dim.style.borderRadius + ' dim=' + JSON.stringify([d.left, d.top, d.right, d.bottom]) +
        ' expected=' + JSON.stringify(ex));
      ck('allFourRingSidesOnScreen',
        ring.left >= 0 && ring.top >= 0 && ring.right <= vw && ring.bottom <= vh &&
        ring.width < vw - 2,   // tighter than the full-bleed bar
        JSON.stringify([ring.left, ring.top, ring.right, ring.bottom]) + ' vw=' + vw);
      const panel = document.getElementById('tutPanel').getBoundingClientRect();
      ck('cardSitsUnderTheChips', panel.top > B && panel.top < B + 40,
        'panel.top=' + panel.top + ' chips.bottom=' + B);
    }
  }

  // ---- 4 + 5. out-of-order satisfaction and action-gated advance ----
  {
    fresh('404', 'calm', true);
    tick(2, 0.3);
    // do the STONE step's deed while welcome is still up
    const hills = (() => {
      for (let i = 0; i < S.map.terrain.length; i++)
        if (S.map.terrain[i] === T_.HILLS) return { x: i % CFG.W, y: (i / CFG.W) | 0 };
      return null;
    })();
    const v = S.units.find(u => u.owner === 'P' && u.kind === 'villager');
    v.task = { type: 'gather', x: hills.x, y: hills.y };
    tick(3, 0.3);
    ck('earlyDeedMarksLaterStep', S.tut.done.gatherStone === 1, JSON.stringify(S.tut.done));
    v.task = null;
    // selecting a villager satisfies tapVillager with no button
    clickNext(); tick(2, 0.3);   // welcome
    clickNext(); tick(2, 0.3);   // resources
    ck('tapVillagerShown', Tutorial._show && Tutorial._show.id === 'tapVillager', JSON.stringify(Tutorial._show));
    UI.sel = { type: 'unit', id: v.id };
    tick(8, 0.3);
    ck('selectionSatisfies', S.tut.done.tapVillager === 1, JSON.stringify(S.tut.done));
    UI.sel = null;
    // …and when the pointer walks on, the early-done stone step is skipped
    const wood = (() => {
      for (let i = 0; i < S.map.terrain.length; i++)
        if (S.map.terrain[i] === T_.FOREST) return { x: i % CFG.W, y: (i / CFG.W) | 0 };
    })();
    const fert = (() => {
      for (let i = 0; i < S.map.terrain.length; i++)
        if (S.map.terrain[i] === T_.FERTILE) return { x: i % CFG.W, y: (i / CFG.W) | 0 };
    })();
    v.task = { type: 'gather', x: wood.x, y: wood.y }; tick(8, 0.3);
    v.task = { type: 'gather', x: fert.x, y: fert.y }; tick(8, 0.3);
    v.task = null;
    tick(8, 0.3);
    ck('pointerSkipsTheDone', Tutorial._show && Tutorial._show.id === 'gold',
      JSON.stringify(Tutorial._show) + ' step=' + S.tut.step);
    // the HOUSE step rings the House card in the open build menu, not the
    // toggle that opens it
    clickNext();
    ck('houseShows', Tutorial._show && Tutorial._show.id === 'house', JSON.stringify(Tutorial._show));
    {
      const card = document.querySelector('.bbtn[data-key="house"]');
      const ring = document.getElementById('tutRing');
      const okAnchor = card && card.offsetParent !== null && ring.style.display !== 'none' &&
        (() => { const c = card.getBoundingClientRect(), r = ring.getBoundingClientRect();
                 // the ring hugs the card through the same 10px viewport clamp
                 const hl = Math.max(10, c.left), hr = Math.min(window.innerWidth - 10, c.right);
                 return Math.abs(r.left - (hl - 5)) < 2 && Math.abs(r.width - ((hr - hl) + 10)) < 4; })();
      ck('houseRingsTheCard', !!okAnchor,
        card ? 'card visible=' + (card.offsetParent !== null) + ' ring=' + ring.style.display : 'no card');
    }
    // …and the lesson's first house is raised in a blink: place a REAL site
    // and the next scan finishes it — once, and only once
    {
      const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
      S.res.wood = 500;
      const put = () => {
        for (let r = 2; r < 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = tc.x + dx, y = tc.y + dy;
          if (Bld.canPlace('P', 'house', x, y).ok) return Bld.place('P', 'house', x, y);
        }
        return null;
      };
      const h1 = put();
      tick(2, 0.2);
      ck('firstHouseInstant', !!h1 && !(h1.construction > 0) && h1.hp === h1.maxhp && S.tut.houseGiven === 1,
        h1 ? 'construction=' + h1.construction + ' given=' + S.tut.houseGiven : 'no site placed');
      const h2 = put();
      tick(2, 0.2);
      ck('secondHouseBuildsForReal', !!h2 && h2.construction > 0,
        h2 ? 'construction=' + h2.construction : 'no site placed');
    }
  }

  // ---- 6. slow while shown, full speed when dormant ----
  {
    fresh('505', 'calm', true);
    tick(2, 0.3);
    ck('shownIsSlow', Tutorial.simScale === Tutorial.SLOW, '');
    // a held step (tcReady before the support exists) shows nothing and runs free
    for (const st of Tutorial.STEPS) if (st.id !== 'tcReady' && st.id !== 'capstone') S.tut.done[st.id] = 1;
    Tutorial._show = null;
    tick(3, 0.3);
    ck('dormantIsFullSpeed', Tutorial.simScale === 1 && !Tutorial._show,
      Tutorial.simScale + ' ' + JSON.stringify(Tutorial._show));
  }

  // ---- 7. it rides in the save ----
  {
    fresh('606', 'calm', true);
    tick(2, 0.3);
    clickNext(); tick(2, 0.3);
    const json = G.saveJSON();
    fresh('707', 'moderate', false);           // some other run in between
    G.loadJSON(json);
    ck('saveCarriesTut', !!S.tut && S.tut.on && S.tut.step === 1 && S.tut.done.welcome === 1,
      JSON.stringify(S.tut));
    ck('loadResetsTransients', Tutorial._show === null && Tutorial.simScale === 1, '');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    tick(2, 0.3);
    ck('resumesWhereItStood', Tutorial._show && Tutorial._show.id === 'resources',
      JSON.stringify(Tutorial._show));
    // …and a pre-tutorial save backfills null
    const bare = JSON.parse(json); delete bare.tut;
    G.loadJSON(JSON.stringify(bare));
    ck('legacyBackfillsNull', S.tut === null, String(S.tut));
  }

  // ---- 9. the scripted scout ----
  {
    fresh('808', 'calm', true);
    S.day = S.tut.scoutDay;
    const rng = S.rngState;
    tick(1, 0.1);
    const scout = S.units.find(u => u.tutScout);
    ck('scoutSpawns', !!scout && scout.owner === 'A' && scout.kind === 'rider', '');
    ck('scoutIsPassive', scout.strat === 'strike' && scout.scouting === true, '');
    ck('scoutDrawsNoRng', S.rngState === rng, '');
    // the steer moves it
    const sx = scout.x, sy = scout.y;
    for (let i = 0; i < 30; i++) { Tutorial.tick(1); Units.update(0.4); }
    ck('scoutRides', Math.hypot(scout.x - sx, scout.y - sy) > 1.2,
      'moved ' + Math.hypot(scout.x - sx, scout.y - sy).toFixed(2));
    // seen beside the town, its note names the rival's colour
    const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
    scout.x = tc.x + 3.5; scout.y = tc.y + 0.5; scout.path = null;
    G.updateVisibility();
    Tutorial._lastEvAt = -1e9; Tutorial._show = null;
    tick(2, 0.6);
    ck('scoutNoteFires', Tutorial._show && Tutorial._show.id === 'scout', JSON.stringify(Tutorial._show));
    ck('noteWearsTheirColour', txtOf('tutTxt').includes(G.tunicOf('A')),
      txtOf('tutTxt'));
    // overstaying ends the ride
    S.day = S.tut.scoutDay + 3;
    tick(1, 0.1);
    ck('scoutLeaves', !S.units.some(u => u.tutScout) && S.tut.scoutId === 0, '');
  }

  // ---- 10. neutrality is calm's note alone ----
  {
    fresh('909', 'moderate', true);
    for (const st of Tutorial.STEPS) S.tut.done[st.id] = 1;
    S.tut.step = Tutorial.STEPS.length;               // dormant — notes may flow
    S.tut.fired.scout = 1; Tutorial._lastEvAt = -1e9;
    tick(2, 0.6);
    ck('noPeaceNoteAtWar', !(Tutorial._show && Tutorial._show.id === 'neutrality'),
      JSON.stringify(Tutorial._show));
    fresh('910', 'calm', true);
    for (const st of Tutorial.STEPS) S.tut.done[st.id] = 1;
    S.tut.step = Tutorial.STEPS.length;
    S.tut.fired.scout = 1; Tutorial._lastEvAt = -1e9;
    tick(2, 0.6);
    ck('peaceNoteOnCalm', Tutorial._show && Tutorial._show.id === 'neutrality',
      JSON.stringify(Tutorial._show));
  }

  // ---- 11. the capstone ends phase 1; phase 2 fires one-shot ----
  {
    fresh('111', 'calm', true);
    for (const st of Tutorial.STEPS) if (!st.end) S.tut.done[st.id] = 1;
    const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
    tc.level = 2;
    Tutorial._show = null;
    tick(3, 0.3);
    ck('capstoneShows', Tutorial._show && Tutorial._show.id === 'capstone', JSON.stringify(Tutorial._show));
    // mark every other note told BEFORE answering the capstone — clickNext
    // ticks through the breath now, and an unfired note (dock) would take
    // the stage during those ticks
    for (const e of Tutorial.EVENTS) if (e.id !== 'trade') S.tut.fired[e.id] = 1;
    clickNext();
    ck('capstoneOpensPhase2', S.tut.phase === 2 && S.tut.done.capstone === 1, JSON.stringify(S.tut));
    // Trading Post note at TC3, one-shot
    tc.level = 3; Tutorial._lastEvAt = -1e9; tick(2, 0.6);
    ck('tradeNoteAtTc3', Tutorial._show && Tutorial._show.id === 'trade', JSON.stringify(Tutorial._show));
    clickNext();
    Tutorial._lastEvAt = -1e9; tick(2, 0.6);
    ck('tradeNoteOnce', !(Tutorial._show && Tutorial._show.id === 'trade') && S.tut.fired.trade === 1,
      JSON.stringify(Tutorial._show));
  }

  // ---- the fog lesson borrows the camera, and gives it back ----
  {
    fresh('116', 'calm', true);
    for (const st of Tutorial.STEPS)
      if (['welcome', 'resources', 'tapVillager', 'gatherWood', 'gatherFood',
           'gatherStone', 'gold', 'house', 'train'].includes(st.id)) S.tut.done[st.id] = 1;
    const z0 = R.cam.z;
    tick(2, 0.3);                    // presents fog…
    tick(30, 0.05);                  // …and the glide runs out
    ck('fogShowsAndZoomsOut', Tutorial._show && Tutorial._show.id === 'fog' && R.cam.z < z0 - 0.05,
      JSON.stringify(Tutorial._show) + ' z ' + z0.toFixed(2) + '→' + R.cam.z.toFixed(2));
    // the darkness is genuinely in frame: some visible tile is unexplored
    const seesDark = (() => {
      const TL = CFG.TILE, z = R.cam.z;
      const tx0 = Math.max(0, (R.cam.x / TL) | 0), ty0 = Math.max(0, (R.cam.y / TL) | 0);
      const tx1 = Math.min(CFG.W - 1, ((R.cam.x + R.viewW() / z) / TL) | 0);
      const ty1 = Math.min(CFG.H - 1, ((R.cam.y + R.viewH() / z) / TL) | 0);
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++)
        if (!S.map.explored[y * CFG.W + x]) return true;
      return false;
    })();
    ck('theDarkIsOnScreen', seesDark, 'view holds no unexplored tile');
    clickNext();                     // answers it; the give-back glide runs in these ticks
    tick(10, 0.1);
    ck('zoomHandedBack', Math.abs(R.cam.z - z0) < 0.05, 'z ' + R.cam.z.toFixed(2) + ' vs ' + z0.toFixed(2));
    // …and the MAP lesson follows the darkness it draws
    ck('mapStartsFolded', UI.miniCollapsed === true, String(UI.miniCollapsed));
    tick(6, 0.3);
    ck('minimapStepAfterFog', Tutorial._show && Tutorial._show.id === 'minimap',
      JSON.stringify(Tutorial._show));
    {
      const tog = document.getElementById('mapBtn').getBoundingClientRect();
      const ring = document.getElementById('tutRing').getBoundingClientRect();
      ck('mapToggleIsRinged', Math.abs(ring.left - (Math.max(10, tog.left) - 5)) < 3,
        'ring.left=' + ring.left + ' tog.left=' + tog.left);
    }
    document.getElementById('mapBtn').click();     // the REAL unfold, from the top bar
    tick(3, 0.3);
    ck('unfoldingAnswersIt', S.tut.done.minimap === 1 && !UI.miniCollapsed,
      JSON.stringify(S.tut.done) + ' collapsed=' + UI.miniCollapsed);
  }

  // ---- the first spear: train at the barracks, then walk it on guard ----
  {
    fresh('119', 'calm', true);
    for (const st of Tutorial.STEPS)
      if (['welcome', 'resources', 'tapVillager', 'gatherWood', 'gatherFood', 'gatherStone',
           'gold', 'house', 'train', 'fog', 'minimap'].includes(st.id)) S.tut.done[st.id] = 1;
    for (const e of Tutorial.EVENTS) S.tut.fired[e.id] = 1;   // the spine alone is under test
    const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
    // the barracks step guides the CHAIN: a selected villager rings the
    // panel's Build button, not the hidden menu
    S.res.wood = 300; S.res.stone = 150; S.res.gold = 30; S.res.food = 300;
    tick(3, 0.3);
    ck('barracksStepShows', Tutorial._show && Tutorial._show.id === 'barracks', JSON.stringify(Tutorial._show));
    /* THE RINGED CARD IS BROUGHT INTO VIEW. The build menu scrolls
       horizontally and the barracks sits past the fold, so opening Build used
       to show a highlight the player could not see. */
    {
      const wrap = document.getElementById('buildmenu');
      const card = document.querySelector('.bbtn[data-key="barracks"]');
      const seen = () => {
        const wr = wrap.getBoundingClientRect(), br = card.getBoundingClientRect();
        return br.left >= wr.left - 1 && br.right <= wr.right + 1;
      };
      // THE REAL FLOW: the menu is shut, the player taps Build. (Closing it
      // re-arms the one-shot — the anchor falls back off the card — so each
      // OPENING centres afresh while scrolling within one opening is free.)
      UI.setMenuCollapsed(true); UI.refresh(0.3); Tutorial.tick(0.3);
      UI.setMenuCollapsed(false); UI.refresh(0.3);
      wrap.scrollLeft = 0;
      const scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
      ck('theBarracksSitsPastTheFold', scrolls && !seen(),
        'scrollable=' + scrolls + ' visibleAt0=' + seen());
      Tutorial.tick(0.3);
      // the smooth scroll SETTLES rather than finishing on a clock — a fixed
      // 500ms nap flaked whenever the machine was loaded (measured 29-53px
      // still in flight). Poll until scrollLeft stops moving, up to 3s.
      {
        let last = -1, still = 0;
        for (let k = 0; k < 30 && still < 3; k++) {
          await new Promise(res => setTimeout(res, 100));
          if (wrap.scrollLeft === last) still++; else { still = 0; last = wrap.scrollLeft; }
        }
      }
      const wr = wrap.getBoundingClientRect(), br = card.getBoundingClientRect();
      ck('theRingedCardIsScrolledIntoView', seen(), 'card left=' + Math.round(br.left) + ' menu right=' + Math.round(wr.right));
      ck('andItLandsInTheMiddle',
        Math.abs((br.left + br.width / 2) - (wr.left + wr.width / 2)) < 6,
        'off centre by ' + Math.round((br.left + br.width / 2) - (wr.left + wr.width / 2)) + 'px');
      // …and a player who scrolls elsewhere is NOT fought
      wrap.scrollLeft = 0;
      for (let i = 0; i < 3; i++) Tutorial.tick(0.3);
      await new Promise(res => setTimeout(res, 300));
      ck('itDoesNotFightThePlayersScroll', wrap.scrollLeft === 0, 'scrollLeft=' + wrap.scrollLeft);
      // …but closing and reopening the menu centres it afresh
      UI.setMenuCollapsed(true); UI.refresh(0.3); Tutorial.tick(0.3);
      UI.setMenuCollapsed(false); UI.refresh(0.3); Tutorial.tick(0.3);
      await new Promise(res => setTimeout(res, 500));
      ck('reopeningTheMenuCentresItAgain', seen(), 'visible=' + seen());
    }
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    UI.select('unit', v.id);
    tick(1, 0.1);
    {
      const gb = document.querySelector('#panel [data-act="gobuild"]');
      // the ring's PLACED corner, not its bounding box: the ring pulses by a
      // scale, which moves the box's edge in proportion to the target's width
      // — and Build is a full-width button now that Banish moved beside the ✕
      const rEl = document.getElementById('tutRing');
      const ring = { left: parseFloat(rEl.style.left), top: parseFloat(rEl.style.top) };
      const ok = gb && (() => { const c = gb.getBoundingClientRect();
        return Math.abs(ring.left - (Math.max(10, c.left) - 5)) < 3 && Math.abs(ring.top - (Math.max(10, c.top) - 5)) < 3; })();
      ck('selectedVillagerRingsBuildButton', !!ok, gb ? 'gobuild at ' + JSON.stringify(gb.getBoundingClientRect()) : 'no gobuild btn');
    }
    UI.deselect();
    // a finished barracks → the SOLDIER step, ringing the hall
    let bk = null;
    outer:
    for (let r = 2; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (Bld.canPlace('P', 'barracks', x, y, { noCost: true }).ok) {
        bk = Bld.place('P', 'barracks', x, y, { instant: true, free: true });
        break outer;
      }
    }
    tick(8, 0.3);
    ck('soldierStepShows', Tutorial._show && Tutorial._show.id === 'soldier', JSON.stringify(Tutorial._show));
    // a REAL training order — and the first spear answers at once
    const ok = Bld.train(bk, 'defender');
    tick(2, 0.2);                                    // the scan zeroes the timer…
    G._safe(() => Bld.update(0.001), 'bld');         // …and the real trainer spawns them
    tick(8, 0.3);
    const spear = S.units.find(u => u.owner === 'P' && u.kind === 'defender');
    ck('firstSpearAnswersAtOnce', !!ok && !!spear && S.tut.soldierGiven === 1 && S.tut.done.soldier === 1,
      'trained=' + ok + ' spear=' + !!spear + ' given=' + S.tut.soldierGiven);
    ck('guardStepShows', Tutorial._show && Tutorial._show.id === 'guard', JSON.stringify(Tutorial._show));
    // a REAL walk order posts them — and answers the lesson
    Units.moveTo(spear, (spear.x | 0) + 4, (spear.y | 0));
    tick(3, 0.3);
    ck('walkingThePostAnswersIt', S.tut.done.guard === 1, JSON.stringify(S.tut.done));
  }

  // ---- the taught town: barracks → tower → wall, each held until payable,
  //      and the upgrade note only when Bld.canUpgrade says YES ----
  {
    fresh('117', 'calm', true);
    for (const st of Tutorial.STEPS)
      if (['welcome', 'resources', 'tapVillager', 'gatherWood', 'gatherFood', 'gatherStone',
           'gold', 'house', 'train', 'fog', 'minimap', 'soldier', 'guard'].includes(st.id)) S.tut.done[st.id] = 1;
    for (const e of Tutorial.EVENTS) S.tut.fired[e.id] = 1;   // the spine alone is under test
    const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
    const put = (key) => {
      for (let r = 2; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (Bld.canPlace('P', key, x, y, { noCost: true }).ok)
          return Bld.place('P', key, x, y, { instant: true, free: true });
      }
      return null;
    };
    // broke → the barracks note HOLDS (nothing shows, full speed)
    S.res.wood = 0; S.res.stone = 0; S.res.gold = 0;
    tick(3, 0.3);
    ck('brokeHoldsTheNote', Tutorial._show === null && Tutorial.simScale === 1,
      JSON.stringify(Tutorial._show));
    S.res.wood = 300; S.res.stone = 150; S.res.gold = 30;
    tick(3, 0.3);
    ck('paidShowsBarracks', Tutorial._show && Tutorial._show.id === 'barracks',
      JSON.stringify(Tutorial._show));
    put('barracks'); tick(8, 0.3);
    ck('thenTower', Tutorial._show && Tutorial._show.id === 'tower', JSON.stringify(Tutorial._show));
    put('tower'); tick(8, 0.3);
    ck('thenWall', Tutorial._show && Tutorial._show.id === 'wall', JSON.stringify(Tutorial._show));
    put('wall'); tick(8, 0.3);
    ck('thenWinCond', Tutorial._show && Tutorial._show.id === 'winCond', JSON.stringify(Tutorial._show));
    put('house');                                    // support: barracks+tower+house = 3
    clickNext();                                     // answer winCond
    /* THE STANDING GOAL closes the silent gap: after the win conditions the
       lesson names the hall as the objective, prices it, and counts what is
       still missing — even while the purse is empty. */
    S.res.wood = 0; S.res.stone = 0; S.res.gold = 0;
    tick(4, 0.3);
    ck('goalStepShows', Tutorial._show && Tutorial._show.id === 'tcGoal', JSON.stringify(Tutorial._show));
    {
      const t = txtOf('tutTxt');
      const cost = CFG.BUILDINGS.tc.levels[1].cost;
      ck('theGoalNamesTheHallAndThePrice',
        /Level 2/i.test(t) && t.indexOf(String(cost.wood)) >= 0 && t.indexOf(String(cost.stone)) >= 0, t);
      ck('theGoalCountsTheShortfall', /still need/i.test(t) && /wood/.test(t) && /stone/.test(t), t);
      // and it points at the hall, whose panel carries the upgrade
      const tcB = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
      const a = Tutorial._upgradeAnchor();
      ck('theGoalPointsAtTheHall', !!a && Math.abs(a.x - (tcB.x + 1)) < 0.01, JSON.stringify(a));
    }
    // …and with the goods in hand its second sentence flips to "go and do it"
    S.res.wood = 900; S.res.stone = 900; S.res.gold = 300;
    Tutorial._show = null; tick(4, 0.3);
    ck('theGoalTurnsIntoAnOrderWhenPayable', /tap the Town Center/i.test(txtOf('tutTxt')), txtOf('tutTxt'));
    clickNext();                                     // answer the goal
    // THE REPORTED BUG: support met, purse empty → the upgrade note must wait
    S.res.wood = 0; S.res.stone = 0; S.res.gold = 0;
    tick(4, 0.3);
    ck('upgradeNoteWaitsForTheGoods', Tutorial._show === null,
      JSON.stringify(Tutorial._show) + ' support=' + Bld.tcSupport(tc));
    S.res.wood = 400; S.res.stone = 300; S.res.gold = 60;
    tick(3, 0.3);
    ck('upgradeNoteWhenPayable', Tutorial._show && Tutorial._show.id === 'tcReady',
      JSON.stringify(Tutorial._show) + ' canUp=' + JSON.stringify(Bld.canUpgrade(tc)));
    // …and it is the ONLY step that speaks of the upgrade
    const mentions = Tutorial.STEPS.filter(st => {
      const t = Tutorial.TEXT[st.id];
      const str = typeof t === 'function' ? '' : (t || '');
      return /upgrade/i.test(str);
    }).map(st => st.id);
    ck('oneUpgradeMention', mentions.length === 1 && mentions[0] === 'tcReady', mentions.join(','));
  }

  // ---- a foundation with no hands on it gets the builder lesson ----
  {
    fresh('118', 'calm', true);
    tick(2, 0.3);                                    // welcome is up — urgent must preempt it
    for (const u of S.units) if (u.owner === 'P' && Units.isVillager(u)) {
      u.task = { type: 'gather', x: u.x | 0, y: u.y | 0 };   // every hand busy
    }
    const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
    let site = null;
    outer:
    for (let r = 2; r < 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (Bld.canPlace('P', 'barracks', x, y, { noCost: true }).ok) {
        site = Bld.place('P', 'barracks', x, y, { free: true });   // a REAL site, unbuilt
        break outer;
      }
    }
    Tutorial._lastEvAt = -1e9;
    tick(2, 0.3);
    ck('handsNoteWaitsForAutoDispatch', !(Tutorial._show && Tutorial._show.id === 'buildHands'),
      JSON.stringify(Tutorial._show));               // the 5s grace: idle hands get their chance
    Tutorial._stuckSince = performance.now() - 6000; // …which has now passed
    tick(2, 0.3);
    ck('handsNoteFires', Tutorial._show && Tutorial._show.id === 'buildHands' && !!site,
      JSON.stringify(Tutorial._show));
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    Units.assignBuild(v, site);                      // the taught action answers it
    tick(3, 0.3);
    ck('assigningABuilderAnswersIt', S.tut.fired.buildHands === 1, JSON.stringify(S.tut.fired));
    // AN UPGRADE IS WORKS TOO: Bld.upgrade only drafts an IDLE villager, and
    // by this point in the lesson every hand is out gathering
    {
      const tc2 = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
      for (const u of S.units) if (u.owner === 'P' && Units.isVillager(u))
        u.task = { type: 'gather', x: u.x | 0, y: u.y | 0 };   // nobody idle, nobody building
      tc2.upgrading = 3;
      S.tut.fired.buildHands = 0; Tutorial._show = null;
      Tutorial._stuckSince = performance.now() - 6000;
      Tutorial._lastEvAt = -1e9;
      tick(3, 0.3);
      ck('anUpgradeWithNoHandsIsAStallToo', Tutorial._show && Tutorial._show.id === 'buildHands',
        JSON.stringify(Tutorial._show));
      tc2.upgrading = 0;
    }
    // the barracks copy teaches the CHAIN (villager → Build menu); the
    // foundation-hands teaching lives in the buildHands note above
    ck('theBarracksCopyTeachesIt', /villager/i.test(Tutorial.TEXT.barracks) && /build/i.test(Tutorial.TEXT.barracks),
      Tutorial.TEXT.barracks);
  }

  // ---- the phase-2 siege note fires on the first enemy stone seen ----
  {
    fresh('115', 'moderate', true);
    S.tut.phase = 2; S.tut.step = Tutorial.STEPS.length;
    for (const e of Tutorial.EVENTS) if (e.id !== 'siegePractice') S.tut.fired[e.id] = 1;
    S.map.seenB[42] = { key: 'wall', level: 1, owner: 'A' };   // enemy stone, seen
    Tutorial._lastEvAt = -1e9; tick(2, 0.6);
    ck('siegePracticeOnEnemyWalls', Tutorial._show && Tutorial._show.id === 'siegePractice',
      JSON.stringify(Tutorial._show));
    // …and the retired notes are genuinely gone
    ck('redundantNotesRetired', !Tutorial.EVENTS.some(e => e.id === 'defensePractice' || e.id === 'military' || e.id === 'defense'),
      Tutorial.EVENTS.map(e => e.id).join(','));
  }

  // ---- phase-2 extras: mortality via the hook, the win nudge ----
  {
    fresh('112', 'calm', true);
    S.tut.phase = 2; S.tut.step = Tutorial.STEPS.length;
    for (const e of Tutorial.EVENTS) if (e.id !== 'mortality' && e.id !== 'winNudge') S.tut.fired[e.id] = 1;
    Tutorial.note('mortality');
    // …and the note still fires on a save RESUMED in phase 2 (a run that
    // finished phase 1 in an earlier session)
    G.loadJSON(G.saveJSON());
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    Tutorial._lastEvAt = -1e9; tick(2, 0.6);
    ck('mortalityNoteViaHook', Tutorial._show && Tutorial._show.id === 'mortality',
      JSON.stringify(Tutorial._show));
    clickNext();
    const tc = S.buildings.find(o => o.owner === 'P' && o.key === 'tc');
    for (let i = 0; i < 8; i++) Units.spawn('defender', 'P', tc.x - 2, tc.y + 3 + (i % 3));
    Tutorial._lastEvAt = -1e9; tick(2, 0.6);
    ck('winNudgeOffAnArmy', Tutorial._show && Tutorial._show.id === 'winNudge' && S.tut.nudge === 'war',
      JSON.stringify(Tutorial._show) + ' ' + S.tut.nudge);
    ck('nudgeSpeaksWar', txtOf('tutTxt').includes('engines'), '');
  }

  // ---- 8. skip is clean, both phases ----
  // (with the cards switched off: on, a skip mid-spine keeps the teacher for
  // the deck's one note — section 14 pins that half)
  {
    const cardsWere = CFG.CARDS.ON;
    CFG.CARDS.ON = false;
    fresh('113', 'calm', true);
    S.day = S.tut.scoutDay; tick(1, 0.1);           // a live scout to clean up
    tick(2, 0.3);                                    // a note on show
    Tutorial.skip();
    CFG.CARDS.ON = cardsWere;
    ck('skipTurnsOff', S.tut.on === false && S.tut.skipped === true, JSON.stringify(S.tut));
    ck('skipRemovesDom', !document.getElementById('tutUI') && !document.getElementById('tutDim'), '');
    ck('skipKillsScout', !S.units.some(u => u.tutScout), '');
    ck('skipRestoresSpeed', Tutorial.simScale === 1, String(Tutorial.simScale));
  }

  // ---- losing mid-tutorial goes quiet, never errors ----
  {
    fresh('114', 'calm', true);
    tick(2, 0.3);
    S.over = 'lost';
    tick(2, 0.3);
    ck('defeatGoesQuiet', Tutorial.simScale === 1, String(Tutorial.simScale));
    S.over = null;
  }

  // ---- the draft screen's toggle remembers itself ----
  {
    try { localStorage.setItem('neo-tutorial-ask', '1'); } catch (e) {}
    Screens.syncTutToggle();
    const btn = document.getElementById('btnTutToggle');
    ck('toggleExists', !!btn, '');
    // state is the .sel class + the green check (.tik) — the label never changes
    const tik = () => getComputedStyle(btn.querySelector('.tik')).display !== 'none';
    ck('toggleReadsOn', btn.classList.contains('sel') && tik(), btn.className);
    btn.click();
    ck('toggleFlipsOff', !btn.classList.contains('sel') && !tik() &&
      localStorage.getItem('neo-tutorial-ask') === '0', btn.className);
  }

  // ---- 12. the first two games teach themselves ----
  {
    const LS = ['neo-tutorial-ask', 'neo-games', 'neo-finished-seeds', 'neo-active-slot', 'neo-emergency', 'neo-draft-help', 'neo-victory-seen'];
    const wipe = () => { for (const k of LS) { try { localStorage.removeItem(k); } catch (e) {} } };
    wipe();
    ck('aFreshDeviceHasFoundedNothing', Screens.gamesFounded() === 0, String(Screens.gamesFounded()));
    ck('andGameOneGetsTheTeacher', Screens.tutorialWanted() === true, '');
    Screens.noteGameFounded();
    ck('andSoDoesGameTwo', Screens.gamesFounded() === 1 && Screens.tutorialWanted() === true, String(Screens.gamesFounded()));
    Screens.noteGameFounded();
    ck('butNotGameThree', Screens.gamesFounded() === 2 && Screens.tutorialWanted() === false, String(Screens.gamesFounded()));
    try { localStorage.setItem('neo-tutorial-ask', '1'); } catch (e) {}
    ck('anExplicitOnOutranksTheCount', Screens.tutorialWanted() === true, '');
    wipe();
    try { localStorage.setItem('neo-tutorial-ask', '0'); } catch (e) {}
    ck('anExplicitOffOutranksTheCount', Screens.tutorialWanted() === false && Screens.gamesFounded() === 0, '');
    // a device that has played before is seeded as a veteran on its first read
    wipe();
    try { localStorage.setItem('neo-finished-seeds', '["12345"]'); } catch (e) {}
    ck('aReturningPlayerIsAVeteran', Screens.gamesFounded() === Screens.TUT_AUTO_GAMES && Screens.tutorialWanted() === false,
      String(Screens.gamesFounded()));
    // maybeStart reads the same predicate: auto-on with the checkbox untouched
    wipe();
    G.newGame('120', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
    Tutorial.maybeStart();
    ck('maybeStartArmsOnTheUntouchedFirstGame', !!(S.tut && S.tut.on), JSON.stringify(S.tut && S.tut.on));
    // …and a Skip is the answer for good
    Tutorial.skip();
    ck('aSkipRecordsTheOptOut', localStorage.getItem('neo-tutorial-ask') === '0' && Screens.tutorialWanted() === false,
      String(localStorage.getItem('neo-tutorial-ask')));
    // the toggle shows the EFFECTIVE state (auto-on reads as on) and a tap makes it explicit
    wipe();
    Screens.syncTutToggle();
    const tb = document.getElementById('btnTutToggle');
    ck('theToggleShowsAutoOnAsOn', tb.classList.contains('sel'), tb.className);
    tb.click();
    ck('andATapMakesItAnExplicitOff', !tb.classList.contains('sel') && localStorage.getItem('neo-tutorial-ask') === '0', tb.className);
    // the teacher is armed BEFORE the run is logged (draftTap's order), and
    // the founding count steps AFTER the arming read
    const srcTap = Screens.draftTap.toString();
    const iStart = srcTap.indexOf('Tutorial.maybeStart()'), iNote = srcTap.indexOf('this.noteGameFounded()'), iEnter = srcTap.indexOf('this.enterGame()');
    ck('theTeacherIsArmedBeforeTheRunIsLogged', iStart >= 0 && iNote > iStart && iEnter > iNote,
      'maybeStart@' + iStart + ' noteGameFounded@' + iNote + ' enterGame@' + iEnter);
    // and the row itself carries it: arm, then enter a fresh run with the log captured
    wipe();
    const rows = [];
    const oldLog = Backend.logRunStart; const oldReady = Backend.isReady;
    Backend.logRunStart = (r) => rows.push(r); Backend.isReady = () => true;
    try {
      G.newGame('121', 'moderate', 'medium'); Screens._demo = false; S.paused = true;
      G._freshRun = true;
      Tutorial.maybeStart();
      Screens._enterNow();   // the row is written here; enterGame may park behind the art plaque
    } finally { Backend.logRunStart = oldLog; Backend.isReady = oldReady; }
    ck('andTheRunStartRowSaysTutorial', rows.length === 1 && rows[0].tutorial === true, JSON.stringify(rows));
    Tutorial.skip();
    wipe();
    // A REPLAY SPENDS NOTHING: it never arms the teacher, so it must not eat one of the two slots
    ck('aReplaySpendsNoTeachingGame', !/this\.noteGameFounded\(/.test(Screens.replayRun.toString()), '');   // the CALL, not the comment naming it
    // THE MEMORY HAS A FALLBACK: with storage throwing, the promise holds for the session
    // and nothing is permanent — the count steps, the toggle answers, the modal shows once
    {
      const gi = Storage.prototype.getItem, si = Storage.prototype.setItem, ri = Storage.prototype.removeItem;
      Storage.prototype.getItem = Storage.prototype.setItem = Storage.prototype.removeItem = function () { throw new Error('storage blocked'); };
      Screens._mem = {};
      try {
        const a = Screens.gamesFounded() === 0 && Screens.tutorialWanted() === true;
        Screens.noteGameFounded(); Screens.noteGameFounded();
        const b2 = Screens.gamesFounded() === 2 && Screens.tutorialWanted() === false;
        Screens.lsSet('neo-tutorial-ask', '1');
        const c = Screens.tutorialWanted() === true;
        Screens.syncTutToggle(); tb.click();
        const d = Screens.tutorialWanted() === false;
        const e = Screens.victoryPathsDue !== undefined && (Screens._mem['neo-victory-seen'] == null);
        Screens.lsSet('neo-victory-seen', '1');
        const f = Screens.lsGet('neo-victory-seen') === '1';
        ck('blockedStorageFallsBackToTheSession', a && b2 && c && d && e && f, [a, b2, c, d, e, f].join('/'));
      } finally { Storage.prototype.getItem = gi; Storage.prototype.setItem = si; Storage.prototype.removeItem = ri; Screens._mem = {}; }
    }
    wipe();
    // THE PIN OUTRANKS THE AUTO-ON: a shared ?seed= founds its world and spends no slot;
    // an EXPLICIT checkbox still outranks the pin
    {
      const here = location.pathname + location.hash;
      Screens.newPrefs.mode = 'moderate';
      history.replaceState(null, '', location.pathname + '?seed=4242&size=medium' + location.hash);
      Screens.foundRun();
      const pinnedWorld = S.seed === '4242' && Screens._pinnedRun === true && !/seed=/.test(location.search);
      ck('aSharedSeedBeatsTheAutoOn', pinnedWorld, 'seed ' + S.seed + ' pinned ' + Screens._pinnedRun + ' search ' + location.search);
      ck('andDraftTapArmsNothingForIt', /_pinnedRun/.test(Screens.draftTap.toString()), '');
      Screens.lsSet('neo-tutorial-ask', '1');
      history.replaceState(null, '', location.pathname + '?seed=4242&size=medium' + location.hash);
      Screens.foundRun();
      ck('butAnExplicitCheckboxStillOutranksIt', Screens._pinnedRun === false && S.seed !== '4242' && S.sizeKey === 'medium',
        'seed ' + S.seed + ' pinned ' + Screens._pinnedRun);
      history.replaceState(null, '', here);
      Screens._pinnedRun = false;
      Screens.show('playing'); S.paused = true;
    }
    wipe();
    // TICKING IT ON RE-FOUNDS AN UN-KEPT DRAFT (audit MAP-V01): the forcing
    // is decided in foundRun, before the checkbox is ever on screen, so a
    // tick used to arm the lesson on whatever world was already rolled.
    // Only that direction re-founds — the checkbox is never a free re-deal.
    {
      const raf3 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      Screens.lsSet('neo-games', '9');   // a veteran: the teacher is not auto-on
      Screens.newPrefs.mode = 'moderate';
      let tries = 0;
      do { Screens.foundRun(); } while (Screens.teachableWorld() && ++tries < 40);
      const rolled = S.map.landform + '·' + S.map.variant + '·' + S.sizeKey, s0 = S.seed;
      Screens.syncTutToggle();
      tb.click(); await raf3();
      const ticked = Screens.teachableWorld() && S.seed !== s0 && S.draft && !S.draft.done;
      const s1 = S.seed;
      tb.click(); await raf3();
      const untickKeeps = S.seed === s1;
      tb.click(); await raf3();
      const retickKeeps = S.seed === s1 && Screens.tutorialWanted();
      ck('tickingTheTutorialRefoundsAnUnteachableWorld', ticked && untickKeeps && retickKeeps,
        'rolled ' + rolled + ' -> ' + S.map.landform + '·' + S.map.variant + '·' + S.sizeKey +
        JSON.stringify({ ticked, untickKeeps, retickKeeps }));
      // …and a TICKED box is spent by finishing the lesson (MAP-01): an
      // explicit '1' no longer forces every later game onto the valley
      G.newGame('123', 'calm', 'medium'); Screens._demo = false; S.paused = true;
      Tutorial.maybeStart();
      const end = Tutorial.STEPS.find(z => z.end);
      Tutorial._show = { kind: 'step', id: end.id };
      Tutorial._completeShow();
      const spent = S.tut.phase === 2 && Screens.lsGet('neo-tutorial-ask') == null && Screens.tutorialWanted() === false;
      Screens.lsSet('neo-tutorial-ask', '0');
      G.newGame('124', 'calm', 'medium'); Screens._demo = false; S.paused = true;
      S.tut = { on: true, phase: 1, step: 0, done: {}, fired: {} };
      Tutorial._show = { kind: 'step', id: end.id }; Tutorial._completeShow();
      const offStays = Screens.lsGet('neo-tutorial-ask') === '0';
      ck('andFinishingTheLessonSpendsTheTick', spent && offStays, JSON.stringify({ spent, offStays }));
      Tutorial.skip();
      Screens.show('playing'); S.paused = true;
    }
    wipe();
  }

  // ---- 13. two roads to victory: the Calm modal and the Wonder card ----
  {
    const wipeSeen = () => { try { localStorage.removeItem('neo-victory-seen'); } catch (e) {} };
    wipeSeen();
    fresh('122', 'moderate', false);
    ck('noModalOnModerate', Screens.victoryPathsDue() === false && !UI.wonderOffered(), String(UI.wonderOffered()));
    fresh('123', 'calm', false);
    ck('theFirstCalmGameIsDueAModal', Screens.victoryPathsDue() === true, '');
    const modal = Screens.showVictoryPaths();
    ck('theModalStands', !!document.getElementById('victoryModal') && Screens.modalUp(), '');
    const txt = modal.textContent;
    const wcost = CFG.BUILDINGS.wonder.levels[0].cost;
    ck('itNamesBothRoads', /Town Center/.test(txt) && txt.includes(CFG.BUILDINGS.wonder.name) && txt.includes(String(wcost.wood)) && txt.includes(String(wcost.gold)),
      txt.slice(0, 200));
    const painted = (cv) => { try { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; } catch (e) { return -1; } };
    const arts = Array.from(modal.querySelectorAll('canvas.vpArt'));
    ck('bothRoadsAreDrawn', arts.length === 2 && arts.every(c => painted(c) > 200), arts.map(painted).join('/'));
    ck('itIsStampedSeenWhenShown', localStorage.getItem('neo-victory-seen') === '1', String(localStorage.getItem('neo-victory-seen')));
    ck('andNeverDealtTwice', Screens.victoryPathsDue() === false, '');
    // the tutorial holds its notes while the modal has the floor, then resumes
    Screens.hideVictoryPaths();
    wipeSeen();
    fresh('124', 'calm', true);
    Screens.showVictoryPaths();
    tick(6, 0.3);
    const tutUp = () => { const el = document.getElementById('tutUI'); return !!(el && el.style.display !== 'none'); };
    ck('theTeacherHoldsUnderTheModal', Tutorial._show === null && !tutUp(), JSON.stringify(Tutorial._show));
    document.getElementById('vpGotIt').click();
    ck('gotItTakesItDown', !Screens.modalUp(), '');
    tick(6, 0.3);
    ck('andTheTeacherResumes', !!Tutorial._show && tutUp(), JSON.stringify(Tutorial._show));
    // leaving the game removes it
    wipeSeen();
    Screens.showVictoryPaths();
    Screens.show('paused');
    ck('leavingTheGameRemovesIt', !Screens.modalUp() && Screens._modalUp === false, '');
    Screens.show('playing'); S.paused = true;
    Tutorial.skip();
    // it is SHOWN by _enterNow (deferred from draftTap), never under the art plaque
    wipeSeen();
    Screens._victoryPathsPending = true;
    G._freshRun = false; Screens._enterNow();
    ck('theModalIsShownWhenTheWorldIs', Screens.modalUp() && Screens._victoryPathsPending === false, '');
    ck('andItSlowsTheWorldWhileItHasTheFloor', Screens._modalUp === true && /Screens\._modalUp/.test(G.frame.toString()), '');
    // the price wraps between its pairs; nothing overflows the card at phone width
    {
      const card = document.querySelector('#victoryModal .vpCard'), price = document.querySelector('#victoryModal .vpPrice');
      ck('thePriceWrapsInsideTheCard', !!card && !!price && getComputedStyle(price).whiteSpace !== 'nowrap' && card.scrollWidth <= card.clientWidth + 1,
        card ? card.scrollWidth + '/' + card.clientWidth + ' ' + (price && getComputedStyle(price).whiteSpace) : 'no card');
    }
    document.getElementById('vpGotIt').click();
    S.paused = true;
    // the Wonder card reads as the goal
    UI.refreshMenu();
    const wb = document.querySelector('.bbtn[data-key="wonder"]');
    ck('theWonderCardIsDressedAsTheGoal', !!wb && wb.classList.contains('wonder') && !!wb.querySelector('.bwin') && !!wb.querySelector('.bprog') && wb.style.display !== 'none',
      wb ? wb.className + ' ' + wb.style.display : 'no card');
    const prog = () => wb.querySelector('.bprog').textContent;
    ck('itSaysHowFarTheTownHasSaved', /^\d+% saved$/.test(prog()), prog());
    ck('andIsNeverGhostedLikeAHut', parseFloat(getComputedStyle(wb).opacity) >= 0.8, getComputedStyle(wb).opacity);
    for (const k in wcost) S.res[k] = wcost[k];
    UI.refreshMenu();
    ck('paidInFullItSaysReady', prog() === 'Ready to raise', prog());
    S.res.wood = Math.floor(wcost.wood / 2);
    UI.refreshMenu();
    ck('theScarcestPileSetsTheFigure', prog() === '50% saved', prog());
    // ground broken: the goods are spent, so the card reports the works, not "0% saved"
    {
      const tc = Bld.tcOf('P'); let site = null;
      for (let r = 3; r <= 12 && !site; r++) for (let dy = -r; dy <= r && !site; dy++) for (let dx = -r; dx <= r && !site; dx++) {
        const x = (tc.x + dx) | 0, y = (tc.y + dy) | 0;
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !MapGen.onBoard(x, y)) continue;
        const c = Bld.canPlace('P', 'wonder', x, y, { noCost: true, noSeal: true });
        if (c && c.ok) site = Bld.place('P', 'wonder', x, y, { free: true });
      }
      UI.refreshMenu();
      ck('onceGroundIsBrokenTheCardReportsTheWorks', !!site && /^Rising — \d+ days$/.test(prog()), site ? prog() : 'no site could be laid');
      if (site) { site.construction = 0; UI.refreshMenu(); }
      ck('andRaisedOnceItStands', !!site && prog() === 'Raised', prog());
    }
    wipeSeen();
  }

  // ---- 14. the deck, taught last (operator ruling 12) ----
  // The card deck is kept OUT of the game while the spine runs and walks in
  // the moment it is done — the capstone answered, or the lesson skipped —
  // and one last note rings it. With the cards switched off none of it
  // exists: the note never fires and is never waited for.
  {
    const deckBtn = () => document.getElementById('deckBtn');
    const btnUp = () => { const el = deckBtn(); return !!el && el.offsetParent !== null; };
    const toCapstone = (day) => {
      for (const st of Tutorial.STEPS) if (!st.end) S.tut.done[st.id] = 1;
      S.buildings.find(o => o.owner === 'P' && o.key === 'tc').level = 2;
      if (day) S.day = day;
      Tutorial._show = null; tick(3, 0.3);
    };
    // OFF: the lesson goes cold exactly as before — it waits for no deck
    // (the switch ships on since build 106: thrown off here)
    const cardsWere = CFG.CARDS.ON;
    CFG.CARDS.ON = false;
    {
      fresh('140', 'calm', true);
      toCapstone();
      for (const e of Tutorial.EVENTS) if (e.id !== 'deck') S.tut.fired[e.id] = 1;
      const capUp = Tutorial._show && Tutorial._show.id === 'capstone';
      clickNext();
      ck('offTheDeckNoteIsNeverWaitedFor', capUp && S.tut.on === false && S.tut.completed === true && !S.tut.fired.deck && !btnUp(),
        JSON.stringify({ capUp, on: S.tut.on, completed: S.tut.completed, deck: S.tut.fired.deck }));
      fresh('140b', 'calm', true);
      S.tut.phase = 2; S.tut.step = Tutorial.STEPS.length;
      for (const e of Tutorial.EVENTS) if (e.id !== 'deck' && e.id !== 'trade') S.tut.fired[e.id] = 1;
      Tutorial._lastEvAt = -1e9; tick(3, 0.6);
      ck('andNeverShown', !(Tutorial._show && Tutorial._show.id === 'deck'), JSON.stringify(Tutorial._show));
    }
    // ON: hidden for the spine, the starter hand landed all the same
    const was = cardsWere;
    CFG.CARDS.ON = true;
    try {
      // a fresh device: no collection, and the deck's once-a-page starter
      // deal not yet spent (with the switch shipping on, an earlier section
      // of this page already spent it on the collection wiped here)
      Deck._col = null; Deck._del(Deck.KEY); DeckUI._starter = false;
      fresh('141', 'calm', true);
      DeckUI.frame(0.1); tick(2, 0.3); DeckUI.frame(0.1);
      ck('theDeckIsHiddenWhileTheSpineRuns', !btnUp() && DeckUI.tutHides(),
        'button up ' + btnUp() + ', built ' + DeckUI.built);
      ck('andTheStarterHandStillLands', !!Deck.col().starter && Deck.total() >= 3, 'starter ' + Deck.col().starter + ', ' + Deck.total() + ' cards');
      toCapstone();
      for (const e of Tutorial.EVENTS) if (e.id !== 'deck') S.tut.fired[e.id] = 1;
      clickNext();                                       // the capstone answered
      DeckUI.frame(0.1);
      ck('itWalksInTheMomentTheSpineIsDone', S.tut.phase === 2 && btnUp() && DeckUI.arrivedAt > 0 && S.tut.on === true,
        `phase ${S.tut.phase}, button ${btnUp()}, on ${S.tut.on}`);
      Tutorial._lastEvAt = -1e9; tick(6, 0.3);
      const a = Tutorial._anchor();
      ck('andTheLastNoteRingsIt', Tutorial._show && Tutorial._show.id === 'deck' && a && a.sel === '#deckBtn' &&
        /tap it and play a card/.test(txtOf('tutTxt')) && /kept until played/.test(txtOf('tutTxt')) && /gone for good/.test(txtOf('tutTxt')),
        JSON.stringify(Tutorial._show) + ' ' + txtOf('tutTxt'));
      ck('inTwoSentences', (Tutorial.TEXT.deck.replace(/<[^>]+>/g, '').match(/[.!?](\s|$)/g) || []).length <= 2, Tutorial.TEXT.deck);
      clickNext();
      ck('answeredItPutsTheLessonAway', S.tut.fired.deck === 1 && S.tut.on === false && btnUp(), JSON.stringify(S.tut.fired.deck) + ' on ' + S.tut.on);
      // a SLOW lesson (its capstone past day 150) still names the deck before going cold
      fresh('142', 'calm', true);
      DeckUI.frame(0.1);
      toCapstone(160);
      for (const e of Tutorial.EVENTS) if (e.id !== 'deck') S.tut.fired[e.id] = 1;
      clickNext();
      DeckUI.frame(0.1);
      const held = S.tut.on === true;
      Tutorial._lastEvAt = -1e9; tick(6, 0.3);
      ck('aSlowLessonStillNamesTheDeck', held && Tutorial._show && Tutorial._show.id === 'deck', 'held ' + held + ' ' + JSON.stringify(Tutorial._show));
      clickNext();
      // A SKIP mid-spine: the deck walks in and is still taught — one note,
      // nothing to skip on it, and answering it ends the lesson for good
      fresh('143', 'calm', true);
      DeckUI.frame(0.1); tick(2, 0.3);
      const hiddenFirst = !btnUp();
      Tutorial.skip();
      DeckUI.frame(0.1);
      Tutorial._lastEvAt = -1e9; tick(6, 0.3);
      const skipEl = document.getElementById('tutSkip');
      ck('aSkipStillTeachesTheDeck', hiddenFirst && btnUp() && S.tut.skipped === true && Tutorial._show && Tutorial._show.id === 'deck' &&
        !!skipEl && skipEl.style.display === 'none' && localStorage.getItem('neo-tutorial-ask') === '0',
        JSON.stringify({ hiddenFirst, up: btnUp(), skipped: S.tut.skipped, show: Tutorial._show }));
      clickNext();
      ck('andThenItIsGone', S.tut.on === false && S.tut.fired.deck === 1 && !document.getElementById('tutUI'), 'on ' + S.tut.on);
      /* A SKIP ON THE DECK'S OWN NOTE is the player's answer to it: in phase
         2 that note wears a Skip button, and tapping it must not bring the
         same note straight back without one (fired is only set on an answer,
         so the naive skip re-armed the teacher for the "owed" deck) */
      fresh('145', 'calm', true);
      DeckUI.frame(0.1);
      toCapstone();
      for (const e of Tutorial.EVENTS) if (e.id !== 'deck') S.tut.fired[e.id] = 1;
      clickNext();                                       // the capstone answered: the deck walks in
      DeckUI.frame(0.1);
      Tutorial._lastEvAt = -1e9; tick(6, 0.3);
      const onDeck = !!(Tutorial._show && Tutorial._show.id === 'deck');
      const sk = document.getElementById('tutSkip');
      const skipShown = !!sk && sk.style.display !== 'none';
      if (sk) { sk.click(); sk.click(); }                // the Skip's own confirm: tap, then tap again
      Tutorial._lastEvAt = -1e9; tick(8, 0.3);
      ck('aSkipOnTheDeckNoteSkipsIt', onDeck && skipShown && S.tut.on === false && S.tut.fired.deck === 1 && !S.tut.deckOnly &&
        !(Tutorial._show && Tutorial._show.id === 'deck') && !document.getElementById('tutUI'),
        JSON.stringify({ onDeck, skipShown, on: S.tut.on, deck: S.tut.fired.deck, deckOnly: S.tut.deckOnly, show: Tutorial._show }));
      // a skip once the deck was told is an ordinary skip
      fresh('144', 'calm', true);
      S.tut.fired.deck = 1;
      Tutorial.skip();
      ck('aSkipAfterTheDeckWasToldIsJustASkip', S.tut.on === false && !S.tut.deckOnly, JSON.stringify(S.tut));
    } finally {
      CFG.CARDS.ON = was;
      if (DeckUI.built) DeckUI._stand(false);
    }
  }

  // ---- 15. a card has the floor (the five-player playtest, the operator's path) ----
  // A fresh device arms the lesson by itself and ?cards=all's deck stands
  // during it. A card played under a note used to get the note straight back
  // 0.2–1 s after the landing — its dim over the act, its card over the result
  // toast, and its ×0.2 slow motion running the WHOLE act (the dragon's 3 s
  // took 15). Played through the real deck UI on the real frame loop: while
  // Deck.acting() the world runs at full speed and nothing of the lesson is on
  // screen; the note comes back — the same note, slowing the world again —
  // only after a breath and once the act's own toast has been read.
  {
    const was = CFG.CARDS.ON;
    CFG.CARDS.ON = true;
    const frame = () => new Promise(r => requestAnimationFrame(r));
    // ON SCREEN, measured as the browser sees it (display AND visibility)
    const onScreen = (id) => { const el = document.getElementById(id); if (!el) return false;
      const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const lessonUp = () => onScreen('tutUI') || onScreen('tutDim');
    // the act, read from the things that ARE it (the flight, a card's show,
    // its dragon, star or kraken) — never through the predicate under test
    const toastUp = () => [...document.querySelectorAll('#toasts .toast')].some(el => el.style.opacity !== '0');
    const CAP = Tutorial.ACT_TOAST_S || 6;
    const actNow = () => !!DeckUI.playing || R.cardShows.length > 0 || R.summons.length > 0 || !!R._cardSky ||
      !!(S.dragon && S.dragon.ev && S.dragon.ev.card) || !!(S.deck && (S.deck.strike || S.deck.kraken));
    try {
      Deck._col = null; Deck.dealAll();                  // the test link's deck: it stands during the lesson
      fresh('150', 'moderate', true);
      S.paused = false;
      let t0 = performance.now();
      while (!(Tutorial._show && onScreen('tutUI') && DeckUI.built) && performance.now() - t0 < 6000) await frame();
      const note0 = Tutorial._show && Tutorial._show.id;
      ck('aNoteIsUpOverAStandingDeck', !!note0 && Tutorial.simScale === Tutorial.SLOW && DeckUI.built && !Deck.lessonHolds(),
        JSON.stringify({ note0, scale: Tutorial.simScale, built: DeckUI.built }));
      const playUnder = async (id, tgt) => {
        UI._toastAt = {};
        const st = { slow: 0, seen: 0, acted: 0, evFrom: 0, evTo: 0, actEnd: 0, back: 0, toastAtBack: null, earlyBack: false };
        const start = performance.now();
        DeckUI._run(id, tgt || null, null, false);
        while (performance.now() - start < 25000) {
          await frame();
          const now = performance.now(), acting = actNow();
          if (S.dragon && S.dragon.ev && S.dragon.ev.card) { if (!st.evFrom) st.evFrom = now; }
          else if (st.evFrom && !st.evTo) st.evTo = now;
          if (acting) {
            st.acted++; st.actEnd = 0;
            if (!S.paused && Tutorial.simScale !== 1) st.slow++;   // the act at the lesson's slow motion
            if (lessonUp()) st.seen++;                              // the lesson over the act
          } else {
            if (!st.actEnd) st.actEnd = now;
            if (onScreen('tutUI')) {
              st.back = now; st.toastAtBack = toastUp();
              // the breath is counted in frames from the first quiet one: a
              // frame's worth of slack (the dt clamp's 0.1 s and a little)
              st.earlyBack = now - st.actEnd < Tutorial.BREATH * 1000 - 250;
              break;
            }
          }
        }
        st.show = Tutorial._show && Tutorial._show.id;
        st.scaleBack = Tutorial.simScale;
        st.tail = st.back ? Math.round(st.back - st.actEnd) : -1;
        st.ms = Math.round((st.back || performance.now()) - start);
        return st;
      };
      // a card with no show of its own (its act is the flight): the note
      // waits out the breath AND the landing's toast
      const f = await playUnder('forager_cache');
      ck('aCardPlayedUnderTheLessonPlaysAtFullSpeed', f.acted > 5 && f.slow === 0, JSON.stringify(f));
      ck('andNothingOfTheLessonIsOnScreenOverIt', f.acted > 5 && f.seen === 0, JSON.stringify(f));
      ck('theNoteComesBackAfterABreathAndTheToast', f.back > 0 && !f.earlyBack && f.show === note0 && f.scaleBack === Tutorial.SLOW &&
        (f.toastAtBack === false || f.tail >= (CAP - 0.2) * 1000),
        `back ${f.tail}ms after the act, toast still up ${f.toastAtBack}, note ${f.show}, scale ${f.scaleBack}`);
      // a card whose act runs on SIM time: the dragon (3 s at full speed; 15 at ×0.2)
      const tc = Bld.tcOf('P');
      let tgt = null;
      for (let r = 3; r <= 8 && !tgt; r++) for (let dy = -r; dy <= r && !tgt; dy++) for (let dx = -r; dx <= r && !tgt; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tc.x + 1 + dx + 0.5, y = tc.y + 1 + dy + 0.5;
        if (Deck.validTarget('dragonfire', x, y)) tgt = { x, y };
      }
      const d = await playUnder('dragonfire', tgt);
      const flight = d.evTo && d.evFrom ? Math.round(d.evTo - d.evFrom) : -1;
      ck('theDragonsActTakesItsOwnTime', !!tgt && flight > 0 && flight < 6500 && d.slow === 0 && d.seen === 0,
        `the card's dragon on the wing ${flight}ms of real time (×0.2 reads ~15000); ${JSON.stringify(d)}`);
      ck('andTheSameNoteReturnsAfterIt', d.back > 0 && !d.earlyBack && d.show === note0 && d.scaleBack === Tutorial.SLOW,
        `back ${d.tail}ms after the act (${d.ms}ms after the play), note ${d.show}, scale ${d.scaleBack}`);
      /* …and the act's own toast is left to be READ: a headless page's frame
         rate decides whether the landing toast is still up when a flight
         ends, so the rule is measured on its own — an act ends (Deck.acting
         held, then let go) with a 2.5 s toast just raised: the note waits
         the toast out, never the whole ACT_TOAST_S cap, and never for ever */
      {
        const real = Deck.acting;
        let on = true;
        Deck.acting = () => on;
        try {
          let t1 = performance.now();
          while (performance.now() - t1 < 400) await frame();           // the lesson stands aside
          const asideWhile = !lessonUp() && Tutorial.simScale === 1;
          on = false;
          UI._toastAt = {};
          UI.toast('The act says what it did.', 'note', 2500);
          const t2 = performance.now();
          let back = 0, toastAt = null;
          while (performance.now() - t2 < 12000) {
            await frame();
            if (onScreen('tutUI')) { back = performance.now() - t2; toastAt = toastUp(); break; }
          }
          ck('andWaitsForTheActsToastToBeRead', asideWhile && back >= 2400 && back < CAP * 1000 && toastAt === false,
            `aside ${asideWhile}; back ${Math.round(back)}ms after the act (toast 2500ms, cap ${CAP}s), toast up then ${toastAt}`);
        } finally { Deck.acting = real; }
      }
      // THE CARD IS OPAQUE: a toast under it never reads through it
      const bg = getComputedStyle(document.getElementById('tutPanel')).backgroundColor;
      const al = /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg);
      ck('noToastShowsThroughTheNote', !al || +al[1] >= 1, bg);
      ck('theOnePredicateIsTheDecks', typeof Deck.acting === 'function' && !!Tutorial._cardActing && /Deck\.acting/.test(Tutorial._cardActing.toString()), '');
    } finally {
      S.paused = true;
      CFG.CARDS.ON = was;
      if (DeckUI.built) DeckUI._stand(false);
      Deck._del(Deck.KEY); Deck._del(Deck.REAL_KEY); Deck._col = null;
    }
  }

  // ---- 16. the deck's note retires with the deck (the playtest's emptied deck) ----
  // "tap it and play a card" over a deck with nothing in it is a note telling
  // the player to do the impossible: up when the last card is played, it is
  // put away; due over an empty deck, it is booked and never shown.
  {
    const was = CFG.CARDS.ON;
    CFG.CARDS.ON = true;
    const btnUp = () => { const el = document.getElementById('deckBtn'); return !!el && el.offsetParent !== null; };
    const toPhase2 = () => {
      for (const st of Tutorial.STEPS) if (!st.end) S.tut.done[st.id] = 1;
      S.buildings.find(o => o.owner === 'P' && o.key === 'tc').level = 2;
      Tutorial._show = null; tick(3, 0.3);
      for (const e of Tutorial.EVENTS) if (e.id !== 'deck') S.tut.fired[e.id] = 1;
      clickNext();                                       // the capstone answered: the deck walks in
      DeckUI.frame(0.1);
    };
    try {
      // the note up, then the last card played
      Deck._col = null; Deck._del(Deck.KEY); Deck._del(Deck.REAL_KEY);
      fresh('160', 'calm', true);
      DeckUI.frame(0.1);
      toPhase2();
      const c = Deck.col(); c.counts = { forager_cache: 1 }; Deck.saveCol();
      Tutorial._lastEvAt = -1e9; tick(6, 0.3);
      const up = !!(Tutorial._show && Tutorial._show.id === 'deck') && btnUp();
      S.paused = true;
      const r = Deck.play('forager_cache');
      tick(1, 0.05);
      ck('theDeckNoteRetiresWhenTheDeckIsEmptied', up && r.ok && Deck.total() === 0 && !(Tutorial._show && Tutorial._show.id === 'deck') &&
        S.tut.fired.deck === 1 && S.tut.on === false && !document.getElementById('tutUI'),
        JSON.stringify({ up, played: r.ok, total: Deck.total(), show: Tutorial._show, fired: S.tut.fired.deck, on: S.tut.on }));
      // due over a deck that is already empty: never shown
      Deck._col = null; Deck._del(Deck.KEY);
      fresh('161', 'calm', true);
      DeckUI.frame(0.1);
      Deck.col().counts = {}; Deck.saveCol();
      toPhase2();
      let shown = false;
      Tutorial._lastEvAt = -1e9;
      for (let i = 0; i < 8; i++) { tick(1, 0.3); if (Tutorial._show && Tutorial._show.id === 'deck') shown = true; }
      ck('andIsNeverShownOverAnEmptyDeck', btnUp() && Deck.total() === 0 && !shown && S.tut.fired.deck === 1 && S.tut.on === false,
        JSON.stringify({ btn: btnUp(), total: Deck.total(), shown, fired: S.tut.fired.deck, on: S.tut.on }));
    } finally {
      CFG.CARDS.ON = was;
      if (DeckUI.built) DeckUI._stand(false);
      Deck._del(Deck.KEY); Deck._del(Deck.REAL_KEY); Deck._col = null;
    }
  }

  // ---- 17. the ring the lesson asks the player to tap is one they can SEE (PX-05) ----
  // R.onScreen (the army banners' "slightly in frame") calls a tile under the
  // villager panel, or half a tile past the right edge, seen — so on a phone
  // the first gather lessons rang trees nobody could see and the camera never
  // moved. Everything here is measured off the DOM and the camera, never by
  // asking the code under test what it thinks.
  const TL_ = CFG.TILE;
  const cv_ = R.cv || document.getElementById('c');
  const ringPt = a => ({ x: (a.x * TL_ - R.cam.x) * R.cam.z, y: (a.y * TL_ - R.cam.y) * R.cam.z - CFG.SPRITE_LIFT * R.cam.z });
  const rectOf = id => { const el = document.getElementById(id); if (!el) return null;
    const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 ? q : null; };
  // the band no HUD covers: under the top bar, above the bottom bar and its tab
  const band = () => { const tb = rectOf('topbar'); let bot = R.viewH();
    for (const id of ['bottombar', 'bmToggle']) { const q = rectOf(id); if (q) bot = Math.min(bot, q.top); }
    return { top: tb ? tb.bottom : 0, bottom: bot, right: R.viewW() }; };
  // seen = inside that band AND the world canvas is what a finger there would touch
  const seen = a => { if (!a) return false; const p = ringPt(a), b = band();
    return p.x > 0 && p.x < b.right && p.y > b.top && p.y < b.bottom && document.elementFromPoint(p.x, p.y) === cv_; };
  const where = a => { if (!a) return 'no anchor'; const p = ringPt(a), b = band();
    return '(' + Math.round(p.x) + ',' + Math.round(p.y) + ') band ' + Math.round(b.top) + '..' + Math.round(b.bottom) + ' w' + Math.round(b.right); };
  // the camera put so a world point's RING lands at (sx, sy) — unclamped: the test owns it
  const aim = (a, sx, sy) => { R.cam.x = a.x * TL_ - sx / R.cam.z; R.cam.y = a.y * TL_ - (sy + CFG.SPRITE_LIFT * R.cam.z) / R.cam.z; };
  const villager = () => S.units.find(u => u.owner === 'P' && u.kind === 'villager');
  {
    const terrOf = { gatherWood: [T_.FOREST], gatherFood: [T_.FERTILE], gatherStone: [T_.HILLS] };
    // a gather lesson about to be told: the steps before it booked, nothing on show yet
    const upTo = (seed, id) => {
      fresh(seed, 'calm', true);
      R.cam.z = 1.7; UI.deselect();
      for (const st of Tutorial.STEPS) { if (st.id === id) break; S.tut.done[st.id] = 1; }
      return Tutorial._nearTile(id, terrOf[id]);   // the tile the lesson will ring
    };
    const bres = R.bottomReserve, menuWas = UI.menuCollapsed;
    R.bottomReserve = 0;   // a first game: the build menu never opened, so R.onScreen has learned no floor
    try {
      // (a) half a tile past the right edge, a villager in hand (the wood lesson as it is met)
      {
        const a = upTo('171', 'gatherWood');
        UI.select('unit', villager().id);
        if (a) aim(a, R.viewW() + 0.2 * TL_ * R.cam.z, (band().top + band().bottom) / 2);
        const claimed = !!a && R.onScreen(a.x, a.y), before = seen(a);
        Tutorial._pan = null;
        tick(1, 0.05);
        const glides = !!(Tutorial._show && Tutorial._show.id === 'gatherWood' && Tutorial._pan);
        tick(24, 0.05);
        ck('aRingPastTheRightEdgeGlidesIntoView', claimed && !before && glides && seen(a),
          JSON.stringify({ onScreen: claimed, seenBefore: before, glides, after: where(a) }));
      }
      // (b) under the bottom bar — R.onScreen calls that seen too
      {
        const a = upTo('172', 'gatherWood');
        UI.select('unit', villager().id);
        const bb = rectOf('bottombar');
        if (a && bb) aim(a, R.viewW() / 2, bb.top + 24);
        const claimed = !!a && R.onScreen(a.x, a.y), before = seen(a);
        Tutorial._pan = null;
        tick(1, 0.05);
        const glides = !!(Tutorial._show && Tutorial._show.id === 'gatherWood' && Tutorial._pan);
        tick(24, 0.05);
        ck('aRingUnderTheBottomBarGlidesIntoView', claimed && !before && glides && seen(a),
          JSON.stringify({ onScreen: claimed, seenBefore: before, glides, after: where(a) }));
      }
      // (c) the food lesson, told with nothing in hand (the last order deselected):
      // the ring is clear and the camera is left alone — until the first villager
      // selection raises the panel over it, which looks once more, and only once
      {
        const a = upTo('173', 'gatherFood');
        UI.select('unit', villager().id);
        const panelTop = rectOf('bottombar').top;
        UI.dispatchedWorker();   // the wood order's own deselect: the menu tucked away, as the real flow leaves it
        if (a) aim(a, R.viewW() / 2, panelTop + 30);
        const before = seen(a);
        tick(1, 0.05);
        const quiet = !!(Tutorial._show && Tutorial._show.id === 'gatherFood') && !Tutorial._pan;
        ck('aRingInTheClearLeavesTheCameraAlone', !!a && before && quiet,
          JSON.stringify({ seenBefore: before, show: Tutorial._show, pan: !!Tutorial._pan, at: where(a) }));
        UI.select('unit', villager().id);
        const hidden = !seen(a);
        tick(1, 0.05);
        const glides = !!Tutorial._pan;
        tick(24, 0.05);
        ck('theFirstVillagerSelectionLooksAgain', !!a && hidden && glides && seen(a),
          JSON.stringify({ hiddenBySelection: hidden, glides, after: where(a) }));
        // hide it again and select afresh: a third look is never taken
        if (a) aim(a, R.viewW() / 2, rectOf('bottombar').top + 30);
        UI.deselect(); tick(1, 0.05);
        UI.select('unit', villager().id); tick(2, 0.05);
        ck('andNeverAThirdTime', !!a && !Tutorial._pan && !seen(a) && Tutorial._show && Tutorial._show.id === 'gatherFood',
          JSON.stringify({ pan: !!Tutorial._pan, at: where(a) }));
      }
      // (d) never while a finger is down: the look waits for the lift
      {
        const a = upTo('174', 'gatherStone');
        if (a) aim(a, R.viewW() + 0.2 * TL_ * R.cam.z, (band().top + band().bottom) / 2);
        UI.pointers.set(9917, { x: 2, y: 2 });
        let duringDown = null;
        try { tick(3, 0.05); duringDown = !!Tutorial._pan || seen(a); }
        finally { UI.pointers.delete(9917); }
        tick(1, 0.05);
        const onLift = !!Tutorial._pan;
        tick(24, 0.05);
        ck('noLookWhileAFingerIsDownItWaitsForTheLift', !!a && !!(Tutorial._show && Tutorial._show.id === 'gatherStone') &&
          duringDown === false && onLift && seen(a),
          JSON.stringify({ duringDown, onLift, after: where(a) }));
      }
      // (d2) nor while the world is off the glass: the pause menu over it is not
      // "the ring is hidden" — the look waits for the game and measures then
      {
        const a = upTo('176', 'gatherWood');
        UI.select('unit', villager().id);
        if (a) aim(a, R.viewW() + 0.2 * TL_ * R.cam.z, (band().top + band().bottom) / 2);
        let underShell = null, shown = false;
        Screens.show('paused');
        try { tick(3, 0.05); underShell = !!Tutorial._pan; shown = !!(Tutorial._show && Tutorial._show.id === 'gatherWood'); }
        finally { Screens.show('playing'); S.paused = true; }
        tick(1, 0.05);
        const onReturn = !!Tutorial._pan;
        tick(24, 0.05);
        ck('noLookUnderAShellScreenItWaitsForTheGame', !!a && shown && underShell === false && onReturn && seen(a),
          JSON.stringify({ shown, underShell, onReturn, after: where(a) }));
      }
      // (e) reduced motion: the same move, made at once — never a glide
      {
        const mm = window.matchMedia;
        window.matchMedia = q => /prefers-reduced-motion/.test(q) ? { matches: true, media: q } : mm.call(window, q);
        try {
          const a = upTo('175', 'gatherWood');
          UI.select('unit', villager().id);
          if (a) aim(a, R.viewW() + 0.2 * TL_ * R.cam.z, (band().top + band().bottom) / 2);
          tick(1, 0.05);
          ck('underReducedMotionTheLookJumpsNeverGlides', !!a && !!(Tutorial._show && Tutorial._show.id === 'gatherWood') &&
            !Tutorial._pan && seen(a), JSON.stringify({ pan: !!Tutorial._pan, at: where(a) }));
        } finally { window.matchMedia = mm; }
      }
    } finally { UI.deselect(); UI.setMenuCollapsed(menuWas, true); R.bottomReserve = bres; }
  }

  // ---- 18. a note that waits on a deed can be put away; the ground names its station (PX-29) ----
  {
    // phase 2 with every other note told, one explored worked tile of one
    // kind near the hall, everything payable: the worked-ground note is due
    const askWorked = (seed, terr) => {
      fresh(seed, 'calm', true);
      S.tut.phase = 2; S.tut.step = Tutorial.STEPS.length;
      for (const e of Tutorial.EVENTS) if (e.id !== 'workedGround') S.tut.fired[e.id] = 1;
      const worked = [T_.STUMPS, T_.PEBBLES, T_.BARREN];
      for (let i = 0; i < S.map.terrain.length; i++) if (worked.includes(S.map.terrain[i])) S.map.terrain[i] = T_.GRASS;
      const tc = Bld.tcOf('P');
      let at = null;
      for (let r = 3; r <= 8 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (!MapGen.onBoard(x, y)) continue;
        const i = MapGen.idx(x, y);
        if (S.map.terrain[i] === T_.GRASS && S.map.explored[i] && !Bld.at(x, y)) at = { x, y, i };
      }
      if (at) S.map.terrain[at.i] = terr;
      S.res.wood = S.res.stone = S.res.gold = S.res.food = 999;
      UI.deselect();
      Tutorial._lastEvAt = -1e9; Tutorial._memo = {};
      tick(2, 0.6);
      return at;
    };
    const names = { lumber: CFG.BUILDINGS.lumber.name, quarry: CFG.BUILDINGS.quarry.name, farm: CFG.BUILDINGS.farm.name };
    for (const [check, terr, key] of [['stumpsAskForALumberCamp', T_.STUMPS, 'lumber'],
                                      ['brokenRockAsksForAQuarry', T_.PEBBLES, 'quarry'],
                                      ['spentSoilAsksForAFarm', T_.BARREN, 'farm']]) {
      const at = askWorked('18' + key.length, terr);
      const up = !!(Tutorial._show && Tutorial._show.id === 'workedGround');
      const txt = txtOf('tutTxt');
      const others = Object.keys(names).filter(k => k !== key).map(k => names[k]);
      const a = Tutorial._anchor();
      // the ring follows it: its own card, the villager's Build button, or the worked tile
      const rings = !!a && (a.sel ? (a.sel.includes('"' + key + '"') || a.sel.includes('gobuild'))
        : (!!at && Math.floor(a.x) === at.x && Math.floor(a.y) === at.y));
      ck(check, !!at && up && txt.includes(names[key]) && !others.some(n => txt.includes(n)) && rings,
        JSON.stringify({ at: !!at, up, txt: txt.slice(0, 120), anchor: a }));
      if (key === 'lumber')
        ck('theLumberCampCopyIsWordForWord', document.getElementById('tutTxt').innerHTML ===
          'That worked-bare ground can carry a <b>Lumber Camp</b> — tap a villager, open <b>Build</b>, and set the camp on the stumps. Stations rise from <b>other</b> goods: a camp costs stone, a quarry wood.',
          document.getElementById('tutTxt').innerHTML);
    }
    // the note waits on a deed the player may not want yet — and now it can be put away for good
    {
      askWorked('184', T_.PEBBLES);
      const nx = document.getElementById('tutNext');
      const r = nx.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const offered = getComputedStyle(nx).display !== 'none' && r.width > 0 && (hit === nx || nx.contains(hit));
      ck('aNoteThatWaitsOnADeedOffersDismiss', !!(Tutorial._show && Tutorial._show.id === 'workedGround') && offered &&
        nx.textContent === 'Dismiss', JSON.stringify({ show: Tutorial._show, offered, label: nx.textContent }));
      nx.click();
      tick(1, 0.1);
      const gone = !Tutorial._show && S.tut.fired.workedGround === 1;
      Tutorial._lastEvAt = -1e9;
      tick(8, 0.6);
      ck('oneDismissPutsItAwayForGood', gone && !(Tutorial._show && Tutorial._show.id === 'workedGround'),
        JSON.stringify({ gone, show: Tutorial._show }));
    }
    // every note that waits on a deed offers it — the builder, the station, the worked ground
    {
      fresh('186', 'calm', true);
      const evs = Tutorial.EVENTS.filter(e => e.adv).map(e => e.id);
      const labels = {};
      for (const id of evs) {
        Tutorial._present('event', id); Tutorial._syncOverlay(0);
        const nx = document.getElementById('tutNext');
        labels[id] = getComputedStyle(nx).display !== 'none' ? nx.textContent : '(hidden)';
        Tutorial._show = null; Tutorial._hideAll();
      }
      ck('everyNoteThatWaitsOnADeedOffersDismiss', evs.length >= 3 && evs.every(id => labels[id] === 'Dismiss'), JSON.stringify(labels));
    }
    // …and the spine never does: its deeds ARE the lesson
    {
      fresh('185', 'calm', true);
      tick(2, 0.3);
      const welcomeSays = document.getElementById('tutNext').textContent;
      for (const st of Tutorial.STEPS) { if (st.id === 'gatherWood') break; S.tut.done[st.id] = 1; }
      Tutorial._show = null;
      tick(2, 0.3);
      const nx = document.getElementById('tutNext');
      ck('theSpineNeverOffersDismiss', !!(Tutorial._show && Tutorial._show.id === 'gatherWood') &&
        getComputedStyle(nx).display === 'none' && welcomeSays === 'Got it',
        JSON.stringify({ show: Tutorial._show, display: getComputedStyle(nx).display, welcomeSays }));
    }
  }

  // ---- 19. the toasts step below the lesson's card (--tut-h); noteUp() ----
  {
    const tutH = () => getComputedStyle(document.body).getPropertyValue('--tut-h').trim();
    const box = document.getElementById('toasts');
    fresh('190', 'calm', true);
    R.cam.z = 1.7;
    const tc = Bld.tcOf('P'), hall = { x: tc.x + 1, y: tc.y + 1 };
    aim(hall, R.viewW() / 2, R.viewH() * 0.62);        // the hall low on the glass: the card sits at the TOP
    tick(2, 0.3);
    const pr = document.getElementById('tutPanel').getBoundingClientRect();
    box.innerHTML = ''; UI._toastAt = {};
    UI.toast('A word from the scouts.', 'note', 4000);
    const t0 = box.querySelector('.toast');
    const tr = t0 ? t0.getBoundingClientRect() : null;
    const crosses = !tr || (tr.bottom > pr.top && tr.top < pr.bottom && tr.right > pr.left && tr.left < pr.right);
    const colTop = box.getBoundingClientRect().top;
    ck('aToastShownWhileTheCardIsUpSitsBelowIt', !!(Tutorial._show && Tutorial._show.id === 'welcome') &&
      pr.top < R.viewH() / 2 && !crosses && Math.abs(colTop - pr.bottom) <= 1,
      JSON.stringify({ card: [Math.round(pr.top), Math.round(pr.bottom)], toast: tr && [Math.round(tr.top), Math.round(tr.bottom)], column: Math.round(colTop), tutH: tutH() }));
    // steady: written only when it changes
    {
      const sp = document.body.style.setProperty;
      let writes = 0;
      document.body.style.setProperty = function (k, v, p) { if (k === '--tut-h') writes++; return sp.call(this, k, v, p); };
      try { tick(10, 0.05); } finally { delete document.body.style.setProperty; }
      ck('itIsWrittenOnlyWhenItChanges', writes === 0 && parseFloat(tutH()) > 0, writes + ' writes over 10 steady frames, --tut-h ' + tutH());
    }
    // the card seated at the BOTTOM (the hall high): the column stands where it always did
    aim(hall, R.viewW() / 2, R.viewH() * 0.3);
    tick(1, 0.05);
    const low = document.getElementById('tutPanel').getBoundingClientRect();
    ck('aCardAtTheBottomStepsNothing', low.top > R.viewH() / 2 && tutH() === '0px', JSON.stringify({ card: Math.round(low.top), tutH: tutH() }));
    aim(hall, R.viewW() / 2, R.viewH() * 0.62);
    tick(1, 0.05);
    const raised = tutH();
    document.getElementById('tutNext').click();         // answered: the card is gone, so is the step
    tick(1, 0.05);
    ck('noCardNoStep', parseFloat(raised) > 0 && tutH() === '0px', JSON.stringify({ raised, after: tutH() }));
    box.innerHTML = ''; UI._toastAt = {};
    // noteUp(): true while a card is on the glass or within the BREATH after one
    {
      const nu = () => typeof Tutorial.noteUp === 'function' ? Tutorial.noteUp() : 'missing';
      const rows = {};
      fresh('191', 'calm', false); rows.off = nu();
      fresh('192', 'calm', true); tick(2, 0.3); rows.shown = nu();
      document.getElementById('tutNext').click(); tick(1, 0.1); rows.breath = nu();
      for (const st of Tutorial.STEPS) if (st.id !== 'tcReady' && st.id !== 'capstone') S.tut.done[st.id] = 1;
      tick(8, 0.3); rows.quiet = nu();
      fresh('193', 'calm', true); tick(2, 0.3);
      const acting = Deck.acting;
      Deck.acting = () => true;
      try { tick(1, 0.05); rows.aside = nu(); } finally { Deck.acting = acting; }
      S.over = 'lost'; rows.over = nu(); S.over = null;
      const cardsWere = CFG.CARDS.ON;
      CFG.CARDS.ON = false;
      try { Tutorial.skip(); rows.skipped = nu(); } finally { CFG.CARDS.ON = cardsWere; }
      ck('noteUpIsTrueWhileACardIsUpOrWithinTheBreath', rows.off === false && rows.shown === true && rows.breath === true &&
        rows.quiet === false && rows.aside === false && rows.over === false && rows.skipped === false, JSON.stringify(rows));
    }
  }

  // ---- 19b. the world's news waits only while the card is being READ (the build 128 review) ----
  // A card that waits on a deed stands for minutes; news held for as long as
  // it stood was dropped after 20 s, so a tutorial game never showed the
  // rival's intel, the first spent tile or an off-view "finished". It waits
  // the card's reading time (Tutorial.noteReading), then shows UNDER it.
  {
    const box = document.getElementById('toasts');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const seen = (re) => {
      const el = [...box.querySelectorAll('.toast')].find(n => re.test(n.textContent));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      box.style.pointerEvents = 'auto'; el.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      box.style.pointerEvents = ''; el.style.pointerEvents = '';
      return (hit === el || el.contains(hit)) ? r : null;
    };
    fresh('194', 'calm', true);
    R.cam.z = 1.7;
    const tc = Bld.tcOf('P'), hall = { x: tc.x + 1, y: tc.y + 1 };
    aim(hall, R.viewW() / 2, R.viewH() * 0.62);        // the card seated at the TOP
    tick(2, 0.3);
    box.innerHTML = ''; UI._toastAt = {};
    const card = Tutorial._show && Tutorial._show.id;
    G.log('Scouts report a hut finished in the hills', 'note');
    const heldWhileRead = !box.querySelector('.toast');
    await sleep(600);
    const stillHeld = !seen(/Scouts report/);
    // the card's words have had their time; the card itself still stands
    const pn = performance.now.bind(performance), skip = (Tutorial._readMs || 9000) + 400;
    performance.now = () => pn() + skip;
    let r = null;
    try { const t0 = pn(); while (!(r = seen(/Scouts report/)) && pn() - t0 < 4000) await sleep(50); }
    finally { performance.now = pn; }
    const pr = document.getElementById('tutPanel').getBoundingClientRect();
    const under = !!r && r.top >= pr.bottom - 1;
    ck('theWorldsNewsWaitsOnlyWhileTheCardIsRead', !!card && heldWhileRead && stillHeld && !!r && Tutorial._show && Tutorial._show.id === card && under,
      JSON.stringify({ card, heldWhileRead, stillHeld, shown: !!r, still: Tutorial._show && Tutorial._show.id, toast: r && [Math.round(r.top), Math.round(r.bottom)], panel: [Math.round(pr.top), Math.round(pr.bottom)] }));
    box.innerHTML = ''; UI._toastAt = {};
  }

  // ---- 19c. the station note names the station it rings (the build 128 review, PLAYER-04) ----
  {
    const words = () => { const t = Tutorial.TEXT.station; return typeof t === 'function' ? t() : t; };
    const plant = (key) => {
      fresh('195', 'calm', true);
      const tc = Bld.tcOf('P');
      const b = Bld.place('P', key, tc.x + 4, tc.y + 4, { free: true, instant: true });
      if (b && b.construction > 0) Bld.finish(b);
      return b;
    };
    const q = plant('quarry'), quarry = words();
    const l = plant('lumber'), lumber = words();
    ck('theStationNoteNamesTheStationItRings', !!q && !!l && /quarry/.test(quarry) && /stone/.test(quarry) && !/camp|wood/.test(quarry) &&
      lumber === 'A station pays only while hands <b>work</b> it — tap a villager, then the camp, to crew it. Its steady wood is what raises every building after.',
      JSON.stringify({ quarry, lumber }));
  }

  // ---- 20. the rival's intel waits for a screen that can show it (PX-10c) ----
  {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // a post is waited for as a CONDITION, bounded (the post polls every 250ms
    // and a loaded runner can stretch that past any fixed sleep); an absence
    // is still read after a fixed beat
    const until = async (f, ms) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await sleep(50); };
    const box = document.getElementById('toasts');
    const intel = () => [...box.querySelectorAll('.toast')].filter(el => /Rival origin|Scouts whisper/.test(el.textContent)).length;
    const logged = () => S.log.filter(l => /Rival origin|Scouts whisper/.test(l.msg)).length;
    const wipe = () => { box.innerHTML = ''; UI._toastAt = {}; };
    const unseen = () => { try { localStorage.removeItem('neo-victory-seen'); } catch (e) {} };
    // the first Calm game opens on the modal — the intel waits it out, then posts once
    {
      unseen(); fresh('200', 'calm', false); wipe();
      Screens.showVictoryPaths();
      Cards.announceRival();
      const under = intel();
      await sleep(700);
      const stillUnder = intel();
      document.getElementById('vpGotIt').click();
      await until(() => intel() >= 2, 5000);
      const after = intel(), afterLog = logged();
      await sleep(700);
      ck('theRivalsIntelWaitsForTheModalToGo', under === 0 && stillUnder === 0 && after === 2 && afterLog === 2 && intel() === 2 && logged() === 2,
        JSON.stringify({ under, stillUnder, after, afterLog, later: intel(), laterLog: logged() }));
    }
    // …and never under a shell screen: it waits for the game itself
    {
      unseen(); fresh('202', 'calm', false); wipe();
      Screens.show('paused');
      Cards.announceRival();
      const hidden = intel();
      Screens.show('playing'); S.paused = true;
      await until(() => intel() >= 2, 5000);
      ck('itWaitsForTheGameToBeOnScreen', hidden === 0 && intel() === 2, JSON.stringify({ hidden, after: intel() }));
    }
    // …it is this world's news alone: another world taking the glass drops it
    {
      unseen(); fresh('203', 'calm', false); wipe();
      Screens.showVictoryPaths();
      Cards.announceRival();
      Screens.hideVictoryPaths();
      fresh('204', 'calm', false); wipe();
      await sleep(700);
      ck('anotherWorldNeverWearsIt', intel() === 0 && logged() === 0, JSON.stringify({ toasts: intel(), log: logged() }));
    }
    // …and too late is never: past its wait it is dropped, not posted into a column nobody reads
    {
      const was = Cards.INTEL_WAIT_MS;
      Cards.INTEL_WAIT_MS = 300;
      try {
        unseen(); fresh('205', 'calm', false); wipe();
        Screens.showVictoryPaths();
        Cards.announceRival();
        await sleep(800);
        Screens.hideVictoryPaths();
        await sleep(700);
        ck('pastItsWaitTheIntelIsDropped', intel() === 0 && logged() === 0, JSON.stringify({ toasts: intel(), log: logged() }));
      } finally { Cards.INTEL_WAIT_MS = was; }
    }
    // …and in a TUTORIAL game it reaches the player too (PX-10's own acceptance,
    // found false by the build 128 review): it waits out the lesson card's
    // reading, then shows under the card, which is still up
    {
      unseen(); fresh('206', 'calm', true); tick(2, 0.3); wipe();
      const card = Tutorial._show && Tutorial._show.id;
      Cards.announceRival();
      await until(() => logged() >= 2, 5000);
      const heldWhileRead = intel() === 0;
      const pn = performance.now.bind(performance), skip = (Tutorial._readMs || 9000) + 400;
      performance.now = () => pn() + skip;
      try { await until(() => intel() >= 2, 4000); } finally { performance.now = pn; }
      ck('andInATutorialGameItShowsOnceTheCardIsRead', !!card && heldWhileRead && intel() === 2 && Tutorial._show && Tutorial._show.id === card,
        JSON.stringify({ card, heldWhileRead, shown: intel(), log: logged(), still: Tutorial._show && Tutorial._show.id }));
      wipe();
    }
    Screens.hideVictoryPaths();
    wipe(); unseen();
  }

  try { localStorage.setItem('neo-tutorial-ask', '0'); } catch (e) {}
  return { res, fails };
});

/* ---- 17b. the ring clears the lesson's OWN card on a 320 px phone and on a
   phone on its side (the build 128 review, PLAYER-02): the look landed the
   ring mid-band, the card then seated over it, and the old test asked only
   the ring's centre. Measured off the DOM, every gather lesson as it is met
   (a villager in hand), on three seeds. ---- */
for (const [vw, vh, tag] of [[320, 568, 'OnA320Phone'], [844, 390, 'OnAPhoneOnItsSide']]) {
  await p.setViewportSize({ width: vw, height: vh });
  await p.waitForTimeout(300);
  const rows = await p.evaluate(() => {
    const rows = [];
    const tick = (k, dt) => { for (let i = 0; i < k; i++) Tutorial.tick(dt); };
    for (const seed of ['171', '172', '173']) for (const step of ['gatherWood', 'gatherFood', 'gatherStone']) {
      try { localStorage.setItem('neo-tutorial-ask', '1'); } catch (e) {}
      G.newGame(seed, 'calm', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      Combat.scanT = 0; Units.herdClock = 0; Tutorial.maybeStart();
      R.cam.z = 1.7;
      for (const st of Tutorial.STEPS) { if (st.id === step) break; S.tut.done[st.id] = 1; }
      const v = S.units.find(u => u.owner === 'P' && u.kind === 'villager');
      UI.select('unit', v.id);
      tick(12, 0.3); tick(30, 0.05);   // the note is told, looks, and the glide settles
      if (!Tutorial._show || Tutorial._show.id !== step) { rows.push({ seed, step, err: 'not shown: ' + (Tutorial._show && Tutorial._show.id) }); continue; }
      const ring = document.getElementById('tutRing').getBoundingClientRect();
      const card = document.getElementById('tutPanel').getBoundingClientRect();
      const ix = Math.max(0, Math.min(ring.right, card.right) - Math.max(ring.left, card.left));
      const iy = Math.max(0, Math.min(ring.bottom, card.bottom) - Math.max(ring.top, card.top));
      const covered = ring.width * ring.height > 0 ? (ix * iy) / (ring.width * ring.height) : 1;
      const a = Tutorial._anchor(), TL = CFG.TILE, z = R.cam.z;
      const hit = document.elementFromPoint((a.x * TL - R.cam.x) * z, (a.y * TL - R.cam.y) * z);
      rows.push({ seed, step, covered: +covered.toFixed(2), tile: hit ? (hit.id || hit.tagName) : null });
    }
    try { localStorage.setItem('neo-tutorial-ask', '0'); } catch (e) {}
    return rows;
  });
  const badRows = rows.filter(x => x.err || x.covered > 0.02 || x.tile !== 'c');
  const name = 'theRingClearsItsOwnCard' + tag;
  out.res[name] = (badRows.length ? 'FAIL' : 'PASS') + ' — ' + JSON.stringify(badRows.length ? badRows : rows.map(x => x.covered));
  if (badRows.length) out.fails.push(name);
}
await p.setViewportSize({ width: 390, height: 844 });

let bad = out.fails.length;
for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ✅' : '  ❌'), k, '—', v);
const real = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (real.length) { bad++; console.log('  ❌ page errors:', real.join(' | ')); }
await b.close();
if (bad) { console.log(`\n${bad} FAILURE(S) — the tutorial contract is broken`); process.exit(1); }
console.log('\nAll tutorial contract checks passed.');
