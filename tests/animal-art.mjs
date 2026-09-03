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
      right pose, sensible pose borrowing (fight→walk, others→idle), and
      an untouched procedural fallback for any kind/direction/pose that
      shipped nothing. Removing the art restores the procedural cast
      exactly.

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
await p.waitForTimeout(900);

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
        for (const dir in dd) for (const pose in dd[dir])
          if (dd[dir][pose][0].width !== box * 2) { gridOk = false; offGrid.push(kk + '/' + dir + '/' + pose + '=' + dd[dir][pose][0].width); }
      }
      ck('theShippedFramesSitOnTheNativeGrid', gridOk && Object.keys(Assets.unitArt).length >= 5,
        gridOk ? Object.keys(Assets.unitArt).length + ' kinds, every frame exactly twice its own draw box'
               : 'off-grid: ' + offGrid.slice(0, 4).join(', '));
      ck('theBearShipsItsFightSheet',
        !!(Assets.unitArt.bear && Assets.unitArt.bear.dirs.s && Assets.unitArt.bear.dirs.s.fight &&
           Assets.unitArt.bear.dirs.s.fight.length >= 4 && Assets.unitArt.bear.dirs.s.fight[0].width === 96),
        'the roster\'s first real fight pose — 12 frames of rear-up-and-swipe at the 96px window');
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
