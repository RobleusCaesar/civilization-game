/* ANIMAL ART CONTRACT (Assets unit sheets + R.unitFacing) — the first
   CHARACTER-CLASS art path: PNG sheets for things that move.

   1. FACING is derived from real displacement at draw time, snaps to 8
      ways (y-down: +y = south), ignores micro-jitter, accumulates slow
      drift honestly, HOLDS when the unit stops — and lives in a WeakMap,
      never on the unit, so it can never ride into a save or the sim.
   2. SHEETS are horizontal strips of square frames (count = width/height);
      a non-integer strip is refused with one warning and the procedural
      sprite stands. The south walk strip sets the kind's playback rate so
      a full cycle takes ~0.9s at any frame count.
   3. R.unitSprite prefers installed sheets PER LOOKUP: right direction,
      right pose, sensible pose borrowing (fight→charge→walk, charge→walk,
      others→idle), and an untouched procedural fallback for any
      kind/direction/pose that shipped nothing. Removing the art restores
      the procedural cast exactly.
   4. A STRIKE MAY SHIP A BIGGER FRAME at the same 2:1 density (the wolf's
      bite, the boar's charge: 96px frames over a 64px walk), drawn in a
      box grown up and out from the walk's own feet (R.frameBox /
      frameTop) — so its first frame must stand on the walk's feet, and in
      a wild fight its tempo (Sprites.animFpsStrike) puts the blow in the
      back half of the lunge.

   Run after touching Assets.setUnitFrames/_tryLoadUnit, R.unitFacing,
   R.unitSprite's sheet branch, or the assets/units/ conventions.

     node tests/animal-art.mjs      # exits non-zero on any regression */
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
// the checks below read the SHIPPED strips, and the boot probes ~1,000 PNGs:
// a fixed 900ms was a race on a slower machine — wait for the art to settle
await p.waitForFunction(() => window.Assets && Assets.allArtReady && Assets.allArtReady(), null, { timeout: 60000 }).catch(() => {});   // the beasts are the LATE tier now
await p.waitForTimeout(300);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  /* REAL deer art ships now, and on file:// a loaded PNG is TAINTED —
     drawing it poisons every getImageData below (the relics test learned
     the same). The suite runs against its OWN data-URL sheets, with the
     boot-loaded art stashed; the stash is inspected structurally (no
     pixel reads) at the end. */
  const bootArt = Assets.unitArt;
  const bootFps = Sprites.animFps.deer;   // set by the shipped south walk at load
  Assets.unitArt = {};

  // ---- 1. facing ----
  {
    const u = { id: 900001, kind: 'deer', x: 10, y: 10, animT: 0 };
    ck('aNewUnitFacesSouth', R.unitFacing(u) === 's', '');
    u.x += 0.1; ck('movingEastFacesEast', R.unitFacing(u) === 'e', '');
    u.x += 0.004; u.y -= 0.003;
    ck('microJitterNeverFlipsTheFacing', R.unitFacing(u) === 'e',
      'a collision shove is not a turn');
    u.y += 0.1; u.x += 0.0;
    ck('movingSouthFacesSouth', R.unitFacing(u) === 's', '+y is south (y-down map)');
    u.x -= 0.08; u.y -= 0.08;
    ck('diagonalsSnapToTheOctant', R.unitFacing(u) === 'nw', '');
    const held = R.unitFacing(u);
    for (let i = 0; i < 5; i++) R.unitFacing(u);
    ck('aStoppedUnitHoldsItsFacing', R.unitFacing(u) === held, '');
    // slow drift accumulates into an honest turn (never resets the anchor)
    for (let i = 0; i < 6; i++) { u.x += 0.005; R.unitFacing(u); }
    ck('slowDriftStillTurnsTheHead', R.unitFacing(u) === 'e',
      '6 × 0.005 tiles eastward crosses the threshold');
    ck('facingNeverTouchesTheUnit',
      Object.keys(u).sort().join() === 'animT,id,kind,x,y',
      'WeakMap only — nothing rides into a save');
  }

  // ---- 2. strips: slicing, playback rate, refusal ----
  const strip = (n, fh, mark) => {
    const c = document.createElement('canvas');
    c.width = n * fh; c.height = fh;
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) { g.fillStyle = mark(i); g.fillRect(i * fh, 0, fh, fh); }
    const img = new Image();
    return new Promise(r => { img.onload = () => r(img); img.src = c.toDataURL('image/png'); });
  };
  {
    const img = await strip(4, 96, i => ['#ff0000', '#00ff00', '#0000ff', '#ffff00'][i]);
    ck('aStripSlicesIntoSquareFrames',
      Assets.setUnitFrames('deer', 's', 'walk', img) === true &&
      Assets.unitArt.deer.dirs.s.walk.length === 4 &&
      Assets.unitArt.deer.dirs.s.walk[0].width === 96, '');
    ck('theWalkStripSetsThePlaybackRate', Sprites.animFps.deer === Math.max(4, Math.round(4 / 0.9)),
      'a full cycle takes ~0.9s at any frame count (fps ' + Sprites.animFps.deer + ')');
    const px = (cv) => { const d2 = cv.getContext('2d').getImageData(0, 0, 1, 1).data; return [d2[0], d2[1], d2[2]]; };
    ck('framesKeepTheirOrder',
      px(Assets.unitArt.deer.dirs.s.walk[1])[1] === 255 &&
      px(Assets.unitArt.deer.dirs.s.walk[2])[2] === 255, '');
    const bad = await strip(3, 96, () => '#808080');
    // 3×96 = 288 wide is fine; fake a ragged one by drawing 290 wide
    const rag = document.createElement('canvas'); rag.width = 290; rag.height = 96;
    const ragImg = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = rag.toDataURL('image/png'); });
    ck('aRaggedStripIsRefused', Assets.setUnitFrames('deer', 's', 'idle', ragImg) === false &&
      !Assets.unitArt.deer.dirs.s.idle, 'not a whole number of square frames');
    ck('aWholeStripOfAnyCountLands', Assets.setUnitFrames('deer', 'w', 'walk', bad) === true, '');
  }

  /* ---- 2b. THE WALK IS DRIVEN BY DISTANCE (operator ruling; audit VIL-01 /
     MIL-04 / ANI-05). The leg phase advances by the ground covered over the
     kind's stride (R.walkStride: base speed × R.WALK_CYCLE_S), never by the
     clock — so a held-up unit stops stepping, half speed is half cadence,
     and at the kind's own base speed one cycle lasts WALK_CYCLE_S. Measured
     on a synthetic 4-frame strip, every direction installed, frames told
     apart by colour. ---- */
  {
    const img4 = await strip(4, 96, i => ['#ff0000', '#00ff00', '#0000ff', '#ffff00'][i]);
    for (const d of Assets.UNIT_DIRS8) Assets.setUnitFrames('wolf', d, 'walk', img4);
    const idx = (cv) => { const d2 = cv.getContext('2d').getImageData(0, 0, 1, 1).data;
      return d2[0] === 255 && d2[1] === 255 ? 3 : d2[0] === 255 ? 0 : d2[1] === 255 ? 1 : d2[2] === 255 ? 2 : -1; };
    const mk = (id) => ({ id, kind: 'wolf', owner: 'W', x: 20.5, y: 20.5, animT: 0, path: [{ x: 40, y: 20 }], pathI: 0 });
    const sp = CFG.UNITS.wolf.speed, cyc = R.WALK_CYCLE_S, steps = 48;
    // held up: a path in hand, no ground covered, two seconds of clock
    const held = mk(910001); const f0 = idx(R.unitSprite(held));
    let still = true;
    for (let k = 0; k < 120; k++) { held.animT += 1 / 60; if (idx(R.unitSprite(held)) !== f0) still = false; }
    ck('aHeldUpUnitStopsStepping', R.unitPose(held) === 'walk' && still,
      'two seconds walking on the spot drew ' + (still ? 'one frame' : 'more than one frame'));
    // full speed for one cycle: every frame shown, in order, and back to the start
    const run1 = (speed, id) => {
      const u = mk(id), seen = [idx(R.unitSprite(u))];
      for (let k = 0; k < steps; k++) { u.x += speed * cyc / steps; u.animT += cyc / steps; seen.push(idx(R.unitSprite(u))); }
      return seen;
    };
    const full = run1(sp, 910002);
    const order = full.filter((v, i) => i === 0 || v !== full[i - 1]);
    ck('oneCycleIsOneWalkCycleAtBaseSpeed', order.length === 5 && order[0] === order[4] &&
      new Set(order.slice(0, 4)).size === 4 && order.slice(0, 4).every((v, i) => v === (order[0] + i) % 4),
      'frames over ' + cyc + 's at ' + sp + ' tiles/s: ' + order.join('→'));
    const half = run1(sp / 2, 910003);
    const halfOrder = half.filter((v, i) => i === 0 || v !== half[i - 1]);
    ck('halfSpeedIsHalfCadence', halfOrder.length === 3,
      'the same ' + cyc + 's at half speed stepped through ' + halfOrder.join('→') + ' (half a cycle)');
    // a garrison exit or a unit first met off screen moves the phase nothing
    const jump = mk(910004); const j0 = idx(R.unitSprite(jump)); jump.x += 6;
    ck('aTeleportIsNotAStride', idx(R.unitSprite(jump)) === j0, 'six tiles in one frame left the legs where they were');
    Assets.removeUnitArt('wolf');
  }

  // ---- 3. unitSprite routing + fallback ----
  {
    Screens._demo = false;
    G.newGame('aa1', 'moderate', 'medium');
    // a real deer from the sim, steered by hand
    const u = { id: 900002, kind: 'deer', owner: 'W', x: 20, y: 20, animT: 0.01 };
    u.x -= 0.1; // establish west  (anchor was created on first facing read below)
    R.unitFacing(u); u.x -= 0.1;
    const wantW = R.unitFacing(u) === 'w';
    const fr = R.unitSprite(u);
    const d2 = fr.getContext ? fr.getContext('2d').getImageData(0, 0, 1, 1).data : null;
    ck('theSheetForTheFacingIsDrawn', wantW && d2 && d2[0] === 128 && d2[1] === 128,
      'the grey west strip, not the coloured south one');
    // a direction with no art falls to the SOUTH sheet…
    u.y -= 0.2; R.unitFacing(u);
    const frN = R.unitSprite(u);
    const dN = frN.getContext ? frN.getContext('2d').getImageData(0, 0, 1, 1).data : null;
    ck('aMissingDirectionBorrowsSouth', dN && (dN[0] === 255 || dN[1] === 255 || dN[2] === 255),
      'north shipped nothing; the south walk stands in');
    // …and a kind with NO art keeps its procedural sprite EXACTLY
    const boar = { id: 900003, kind: 'boar', owner: 'W', x: 20, y: 20, animT: 0 };
    const spr = R.unitSprite(boar);
    const pose = R.unitPose(boar);
    ck('aKindWithoutArtIsUntouched',
      Sprites.unit.boar[Sprites.unit.boar[pose] ? pose : 'idle'].includes(spr), '');
    // removal restores the procedural deer exactly
    Assets.removeUnitArt('deer');
    const spr2 = R.unitSprite(u);
    let inProc = false;
    for (const pp in Sprites.unit.deer) if (Sprites.unit.deer[pp].includes(spr2)) inProc = true;
    ck('deletingTheArtRestoresTheProceduralDeer', inProc, '');
  }

  // ---- 4. conventions ----
  {
    ck('theFilenameConventionHolds',
      Assets.unitStem('deer', 'se', 'walk') === 'unit-deer-se-walk' &&
      Assets.unitUrl('deer', 'se', 'walk').indexOf('assets/units/unit-deer-se-walk.png') === 0, '');
    ck('allEightDirectionsAreProbed', Assets.UNIT_DIRS8.length === 8 &&
      new Set(Assets.UNIT_DIRS8).size === 8, '');
    ck('theRosterListsTheDeer', !!Assets.UNIT_ART.deer, 'first character-class kind');
  }

  // ---- 4b. the wild keeps its spacing (the stacked-deer report) ----
  {
    /* SEEDED, because unseeded this read red on 7 seeds in 40 — on main
       itself (8d5ff55), the same seven. Every one was two deer CROSSING
       mid-bolt at the sampled instant, not a stuck stack: the wolves penned
       9.5 tiles off sit inside the 10-tile range (aggro 4 x 2.5) that the
       predator-and-prey rule later gave them, so the deer never stop
       running. Math.random, Combat.scanT and Units.herdClock are the three
       lines every suite that drives Units.update itself wants (CLAUDE.md,
       MODULE-LEVEL CLOCKS); the scene and its bar are unchanged. */
    let rs = 2654435761 >>> 0;
    Math.random = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    Combat.scanT = 0; Units.herdClock = 0;
    Screens._demo = false;
    G.newGame('aa-stack', 'moderate', 'medium');
    S.paused = true;
    // pile three deer and two wolves onto single tiles, then let them live
    const tc = Bld.tcOf('P');
    const spot = MapGen.findNear(tc.x + 8, tc.y + 8, 12, (x, y) => Path.passable(x, y));
    const pile = [];
    for (let i = 0; i < 3; i++) { const d = Units.spawn('deer', 'W', spot.x + 0.5, spot.y + 0.5); if (d) { d.x = spot.x + 0.5; d.y = spot.y + 0.5; pile.push(d); } }
    // the wolves pile 9 tiles off — near enough to test their own unstacking,
    // far enough that the deer are not held in perpetual panic
    for (let i = 0; i < 2; i++) { const d = Units.spawn('wolf', 'W', spot.x + 9.5, spot.y + 0.5); if (d) { d.x = spot.x + 9.5; d.y = spot.y + 0.5; pile.push(d); } }
    for (let t = 0; t < 60; t++) Units.update(0.4);   // 24 simulated seconds of wild life
    let shared = 0;
    for (const a of pile) for (const b2 of pile) {
      if (a === b2 || a.kind !== b2.kind || a.id >= b2.id) continue;
      if ((a.x | 0) === (b2.x | 0) && (a.y | 0) === (b2.y | 0)) shared++;
    }
    ck('noTwoOfAKindShareATile', shared === 0,
      'three stacked deer and two stacked wolves spread to their own ground (' + shared + ' still sharing)');
    // …and a wander target another of the kind stands on is refused outright
    const a2 = pile[0], b3 = pile[1];
    if (a2 && b3) ck('aTakenStandIsRefused',
      Units.wildCrowded(a2, b3.x | 0, b3.y | 0) === b3 &&
      Units.wildCrowded(a2, 1, 1) === null, '');
  }

  // ---- 5. the SHIPPED art, inspected structurally (tainted on file://) ----
  {
    Assets.unitArt = bootArt;
    const d = bootArt.deer;
    ck('theShippedDeerCarriesAllEightDirections',
      !!d && Object.keys(d.dirs).length === 8 &&
      Assets.UNIT_DIRS8.every(k => d.dirs[k] && d.dirs[k].walk && d.dirs[k].idle),
      d ? Object.keys(d.dirs).sort().join(',') : 'no art loaded');
    ck('everyShippedStripIsSquareFramesAtItsOwnCount',
      !!d && Assets.UNIT_DIRS8.every(k =>
        d.dirs[k].walk.length === 12 && d.dirs[k].idle.length === 8 &&
        d.dirs[k].walk[0].width === d.dirs[k].walk[0].height),
      '12-frame walk + 8-frame graze, every direction — a slow loop needs fewer');
    Sprites.animFps.deer = bootFps;   // the suite's 4-frame strip changed it
    ck('theShippedWalkSetsTheRate', bootFps === Math.max(4, Math.round(12 / 0.9)),
      'fps ' + bootFps + ' — one stride ≈ 0.9s at 12 frames');
    /* THE SHADOW GATE, ASSERTED AS AN INVARIANT rather than as a roster.
       Every procedural sprite bakes its own contact shadow (villagers,
       soldiers, hulls, beasts); character PNGs carry none and get the
       renderer's. The rule that must hold for ALL time is: the gate is
       open EXACTLY when the sprite actually came from a sheet. Written
       as a list of kinds it would invert — and fail on a correct change
       — the day villager or bear art ships. Checked across kinds AND
       directions, because sheets resolve per (direction, pose) and the
       strips load asynchronously: a kind whose facing has not arrived
       yet draws procedurally and must NOT be shadowed. */
    // "came from a sheet" is asked of the SHEETS themselves, never of the
    // procedural sets: a villager's sheet is picked by the run's randomly
    // rolled tunic, so naming one would test the tunic, not the gate
    const inSheets = (spr) => {
      for (const kk in Assets.unitArt) {
        const dd = Assets.unitArt[kk].dirs;
        for (const dir in dd) for (const pose in dd[dir])
          if (dd[dir][pose].includes(spr)) return true;
      }
      return false;
    };
    let gateHolds = true, probed = 0;
    for (const kind of ['deer', 'villager', 'boar', 'bear', 'wolf', 'cow', 'spearman']) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const u = { id: 950000 + probed, kind, owner: 'P', x: 20, y: 20, animT: 0 };
        R.unitFacing(u); u.x += dx * 0.2; u.y += dy * 0.2;   // establish a heading
        if (R.sheetUnit(u) !== inSheets(R.unitSprite(u))) gateHolds = false;
        probed++;
      }
    }
    ck('theShadowGateIsOpenExactlyWhenTheSpriteCameFromASheet', gateHolds,
      probed + ' kind x direction probes — never a second shadow under the procedural cast');
    // EVERY sheet kind, at ITS OWN box: 2:1 native density is the law for
    // the whole roster — the deer's 64px frames into the 32px box, and the
    // bear's 96px frames into its 48px box (Assets.UNIT_BOX). A kind whose
    // frames are not exactly twice its draw box shimmers at every zoom.
    {
      let gridOk = true; const offGrid = [];
      for (const kk in Assets.unitArt) {
        if (kk.indexOf('villager') === 0) continue;   // villager variants ride their own suite
        // keyed art (bombard-p-blue, sapper-p-blue-l2) draws at its KIND's
        // box — the key's first dash-segment names the kind
        const box = (Assets.UNIT_BOX && Assets.UNIT_BOX[kk.split('-')[0]]) || CFG.TILE;
        const dd = Assets.unitArt[kk].dirs;
        // a STRIKE strip may ship a bigger window than the walk — drawn in
        // frameBox's grown box it keeps the walk's density exactly, so it is
        // on the grid when the walk is and its margins are whole world px
        const bigStrike = (dir, pose, w) => pose !== 'walk' && pose !== 'idle' && dd[dir].walk &&
          dd[dir].walk[0].width === box * 2 && w > box * 2 && (w - box * 2) % 4 === 0;
        for (const dir in dd) for (const pose in dd[dir]) {
          const w = dd[dir][pose][0].width;
          if (w !== box * 2 && !bigStrike(dir, pose, w)) { gridOk = false; offGrid.push(kk + '/' + dir + '/' + pose + '=' + w); }
        }
      }
      ck('theShippedFramesSitOnTheNativeGrid', gridOk && Object.keys(Assets.unitArt).length >= 5,
        gridOk ? Object.keys(Assets.unitArt).length + ' kinds, every walk and idle frame exactly twice its own draw box, every strike window at that density'
               : 'off-grid: ' + offGrid.slice(0, 4).join(', '));
      /* THE BEAR STANDS UP TO FIGHT (ANIMAL STRIFE, the operator: "bear on
         hind legs swiping"). Its first fight sheet stayed on all fours,
         because a bear at its full height does not fit the 96px walk window;
         the oversize strike window (frameBox) is what makes room — 160px,
         the walk window bottom-centre in it, every extra row above. */
      const bf = Assets.UNIT_DIRS8.filter(dd => { const ff = Assets.unitArt.bear && Assets.unitArt.bear.dirs[dd] && Assets.unitArt.bear.dirs[dd].fight;
        return ff && ff.length >= 8 && ff[0].width === 160; });
      ck('theBearRearsUpToFight', bf.length === 8,
        bf.length + ' of 8 directions carry the rear-up-and-swipe in the 160px strike window');
      /* EACH FILE HOLDS ITS OWN VIEW (audit ANI-01). The facing math above
         is right, but the deer, wolf, boar and cow strips shipped filed one
         octant off — file X held the view 45° on from X — so every one of
         them walked crabwise to its heading and a wolf attacking eastward
         showed its rump. Nothing checked WHICH VIEW a strip holds. This
         does, from the art itself: the straight front and rear (s, n) are
         the NARROW views and the two profiles (e, w) the wide ones, by a
         clear margin. Measured on the re-filed strips: the wider of s/n
         against the narrower of e/w reads deer 0.38/0.73, wolf 0.59/0.75,
         boar 0.56/0.84, cow 0.42/0.80; on the old filing every species
         failed (deer 0.61/0.61, wolf 0.77/0.77, boar 0.77/0.69, cow
         0.80/0.64). Opaque bbox width as a share of the frame, walk frame 0.
         The bear is not in this list on purpose: two of its eight strips
         are duplicate views and it has no true profile yet (ANI-09), which
         is a regeneration, not a re-filing. */
      const viewW = (fr) => {
        try {
          const a = fr.getContext('2d').getImageData(0, 0, fr.width, fr.height).data;
          let x0 = fr.width, x1 = -1;
          for (let y = 0; y < fr.height; y++) for (let x = 0; x < fr.width; x++)
            if (a[(y * fr.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
          return x1 < 0 ? null : (x1 - x0 + 1) / fr.width;
        } catch (e) { return null; }
      };
      const views = {}, badView = [];
      for (const kk of ['deer', 'wolf', 'boar', 'cow']) {
        const dd = Assets.unitArt[kk] && Assets.unitArt[kk].dirs, w = {};
        for (const d of ['s', 'n', 'e', 'w']) w[d] = dd && dd[d] && dd[d].walk ? viewW(dd[d].walk[0]) : null;
        const narrow = Math.max(w.s, w.n), wide = Math.min(w.e, w.w);
        views[kk] = (narrow != null ? narrow.toFixed(2) : '?') + '/' + (wide != null ? wide.toFixed(2) : '?');
        if (Object.values(w).some(v => v == null) || !(narrow < wide - 0.1)) badView.push(kk);
      }
      ck('eachAnimalStripHoldsItsOwnView', badView.length === 0,
        'widest front-or-rear / narrowest profile (walk f0): ' + Object.entries(views).map(([k2, v2]) => k2 + ' ' + v2).join(', ') +
        (badView.length ? ' — filed off: ' + badView.join(', ') : ''));

      /* THE WILD FIGHTS IN ITS OWN ART (ANIMAL STRIFE): the wolf's bite and
         the boar's charge, every direction, in the 96px strike window. */
      const STRIKES = [['wolf', 'fight'], ['boar', 'charge']];   // (the bear's is pinned above)
      const missing = [];
      for (const [kk, pose] of STRIKES) for (const dir of Assets.UNIT_DIRS8) {
        const fr = Assets.unitArt[kk] && Assets.unitArt[kk].dirs[dir] && Assets.unitArt[kk].dirs[dir][pose];
        if (!fr || fr.length < 6 || fr[0].width !== 96) missing.push(kk + '/' + dir + '/' + pose + (fr ? '=' + fr.length + 'x' + fr[0].width : ''));
      }
      ck('theWolfBitesAndTheBoarCharges', missing.length === 0,
        missing.length ? 'missing or short: ' + missing.join(', ') : 'eight directions each, six frames or more, 96px window');

      /* …STANDING ON THE WALK'S OWN FEET. A strike frame is drawn in a box
         grown up and out from the walk box's feet, so its walk window lands
         exactly where the walk was; what can still drift is the ART — a strike
         generated on a different-sized character, or registered on its body
         instead of its hooves (the boar's first charge did both: drawn a
         size small and three pixels high). Frame 0 of each strike is the
         pose the beast was standing in, so its lowest opaque row and its
         mass centre must land on the walk frame 0's, through the real draw
         math, within a world pixel and a half. */
      const footOf = (fr) => {
        try {
          const a = fr.getContext('2d').getImageData(0, 0, fr.width, fr.height).data;
          let low = -1, sx = 0, n = 0;
          for (let y = 0; y < fr.height; y++) for (let x = 0; x < fr.width; x++)
            if (a[(y * fr.width + x) * 4 + 3] > 128) { low = y; sx += x; n++; }
          return n ? { low, cx: sx / n } : null;
        } catch (e) { return null; }
      };
      const offFeet = [];
      let worst = 0;
      for (const [kk, pose] of STRIKES.concat([['bear', 'fight']])) for (const dir of Assets.UNIT_DIRS8) {
        const d2 = Assets.unitArt[kk] && Assets.unitArt[kk].dirs[dir];
        if (!d2 || !d2[pose] || !d2.walk) continue;
        const B = (Assets.UNIT_BOX && Assets.UNIT_BOX[kk]) || CFG.TILE, wk = d2.walk[0], st = d2[pose][0];
        R._sheetKey = kk;
        const Dw = R.frameBox({ kind: kk }, wk, B), Ds = R.frameBox({ kind: kk }, st, B);
        const fw = footOf(wk), fs = footOf(st);
        if (!fw || !fs) { offFeet.push(kk + '/' + dir + ' unreadable'); continue; }
        // world y of the lowest opaque row's bottom edge, and world x of the mass centre
        const yw = R.frameTop(0, B, Dw) + (fw.low + 1) * Dw / wk.height, ys = R.frameTop(0, B, Ds) + (fs.low + 1) * Ds / st.height;
        const xw = -Dw / 2 + fw.cx * Dw / wk.width, xs = -Ds / 2 + fs.cx * Ds / st.width;
        const e = Math.max(Math.abs(yw - ys), Math.abs(xw - xs));
        worst = Math.max(worst, e);
        if (e > 1.5) offFeet.push(kk + '/' + dir + ' ' + (ys - yw).toFixed(1) + 'y ' + (xs - xw).toFixed(1) + 'x');
      }
      ck('aStrikeStandsOnItsWalksFeet', offFeet.length === 0,
        offFeet.length ? 'off its feet (world px): ' + offFeet.join(', ') : 'every strike frame 0 within ' + worst.toFixed(2) + ' world px of its walk');

      /* …AND IN A WILD FIGHT THE BLOW LANDS LATE IN THE LUNGE. strifeStep
         starts the strike from frame 0 STRIFE_LEAD seconds before the damage
         and the pose ends with the blow, so the frame on screen at the blow
         is floor(lead × tempo): at the wolf's walk rate (8) that was frame 2
         of 9, a wolf still crouching when its bite drew blood. */
      const lead = Combat.STRIFE_LEAD.wolf, fpsS = Sprites.animFpsStrike && Sprites.animFpsStrike.wolf;
      const bad = [];
      for (const dir of Assets.UNIT_DIRS8) {
        const fr = Assets.unitArt.wolf && Assets.unitArt.wolf.dirs[dir] && Assets.unitArt.wolf.dirs[dir].fight;
        if (!fr) continue;
        const at = Math.floor(lead * fpsS + 1e-9);
        if (!(at >= fr.length * 0.4 && at < fr.length)) bad.push(dir + ' ' + at + '/' + fr.length);
      }
      const probe = { id: 960001, kind: 'wolf', owner: 'W', x: 30, y: 30, animT: lead - 1e-6, strife: 7, strifePose: 'fight' };
      Assets.unitArt = bootArt;
      R.unitFacing(probe);
      const shown = R.unitSprite(probe), dirFr = R.sheetFrames(probe);
      const shownAt = dirFr ? dirFr.indexOf(shown) : -1;
      ck('theBiteLandsLateInTheLunge', !!fpsS && bad.length === 0 && shownAt === Math.floor((lead - 1e-6) * fpsS),
        'tempo ' + fpsS + 'fps on a ' + lead + 's lead: the blow shows frame ' + Math.floor(lead * fpsS) +
        (bad.length ? ' — too early or past the strip: ' + bad.join(', ') : '') + '; the live sprite resolved frame ' + shownAt);
    }
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
if (errs.length) console.log('errors:', errs);
await b.close();
if (out.fails.length || errs.some(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_FILE_NOT_FOUND'))) {
  console.log('FAILURES:', out.fails.join(', ') || '(page errors)');
  process.exit(1);
}
console.log('ALL ANIMAL-ART CHECKS PASS');
