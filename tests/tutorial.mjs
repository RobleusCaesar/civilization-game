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
      const tog = document.getElementById('miniToggle').getBoundingClientRect();
      const ring = document.getElementById('tutRing').getBoundingClientRect();
      ck('mapToggleIsRinged', Math.abs(ring.left - (Math.max(10, tog.left) - 5)) < 3,
        'ring.left=' + ring.left + ' tog.left=' + tog.left);
    }
    document.getElementById('miniToggle').click();     // the REAL unfold
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
      const ring = document.getElementById('tutRing').getBoundingClientRect();
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
  {
    fresh('113', 'calm', true);
    S.day = S.tut.scoutDay; tick(1, 0.1);           // a live scout to clean up
    tick(2, 0.3);                                    // a note on show
    Tutorial.skip();
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

  try { localStorage.setItem('neo-tutorial-ask', '0'); } catch (e) {}
  return { res, fails };
});

let bad = out.fails.length;
for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ✅' : '  ❌'), k, '—', v);
const real = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (real.length) { bad++; console.log('  ❌ page errors:', real.join(' | ')); }
await b.close();
if (bad) { console.log(`\n${bad} FAILURE(S) — the tutorial contract is broken`); process.exit(1); }
console.log('\nAll tutorial contract checks passed.');
