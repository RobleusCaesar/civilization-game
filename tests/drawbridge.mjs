/* DRAWBRIDGE CONTRACT — the level-3 gatehouse's bridge on chains.

   The rules, all of which this file pins:

     THE THIRD TIER OWNS IT   Bld.canDrawbridge is true only for a FINISHED
                              level-3 gate. L1 and L2 have no winch, no
                              gallery to hang the chains from, and no lever
                              on the panel; a gate still being raised has
                              none either. That is what the tier buys.

     RAISED IS A WALL         Bld.rebuildBlock writes block code 1 for a
                              raised gate — the code that stops EVERYONE,
                              its owner included. A gate you have shut is
                              shut against you too; that is what makes the
                              lever a decision. Lowered, it is code 2/3
                              again and passes its own tribe exactly as
                              before, so nothing else in the wall-line
                              contract moves.

     NOBODY IS WEDGED         Shutting the gate on somebody standing in the
                              passage steps them clear (Bld.stepOffFootprint,
                              the same helper Bld.finish uses when a
                              footprint turns solid).

     THE LEVER SAYS WHAT IT   One button, and its label is the ACTION, not
     WILL DO                  the state: "Raise" while the deck is down,
                              "Lower" while it is up. UI.panelSig carries
                              b.raised, so the label flips the moment the
                              order lands instead of waiting for a reselect.

     BOTH DIRECTIONS ARE      Sprites.drawbridge is a strip of stills per
     DRAWN                    orientation, frame 0 fully DOWN and the last
                              fully UP — so raising and lowering are the same
                              strip read one way or the other. The swing is
                              MONOTONIC and never vanishes: the honest
                              projection (ground reach foreshortened, standing
                              height 1:1) walks the deck's free end smoothly
                              across the hinge. Taking a max() of the two
                              terms instead would teleport the deck from one
                              side of the hinge to the other in a single
                              frame.

     TWO VIEWS, NOT ONE       Like the gatehouse it hangs on, the deck has an
     ROTATED                  east-west self (it lies south, toward you) and a
                              north-south self (it lies east), on canvases of
                              different shapes. Neither is the other rotated.

     THE SWING IS RENDER      R._dbA (the eased angle) lives on R and never on
     STATE                    the building or in S — same rule as R._fighting,
                              R.collapses and R.deaths. The tile seals the
                              instant the order is given; the animation is
                              only what the player SEES. A gate first met
                              already shut starts settled, not slamming.

   Run this after touching any of:
     buildings.js — rebuildBlock / canDrawbridge / toggleDrawbridge /
                    stepOffFootprint / finish
     render.js    — drawDrawbridge / _dbA / gateVerticalAt / the building draw
     sprites.js   — deckFace / deckSide / tileDB / the drawbridge atlas
     ui.js        — panelSig / renderPanel's gate branch / the drawbridge act

     node tests/drawbridge.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  /* ---------- 1. THE ART: both directions, both views ---------- */
  {
    const fam = Sprites.drawbridge;
    ck('atlasHasBothViews', Array.isArray(fam) && fam.length === 2 &&
      fam[0].length >= 5 && fam[0].length === fam[1].length,
      fam ? fam[0].length + ' frames per view' : 'missing');
    // the face view hangs its extra half-tile BELOW (the deck lies south);
    // the flank view hangs it to the SIDE (the deck lies east)
    const f0 = fam[0][0], f1 = fam[1][0];
    ck('faceCanvasIsTall', f0.height > f0.width, f0.width + '×' + f0.height);
    ck('flankCanvasIsWide', f1.width > f1.height, f1.width + '×' + f1.height);
    // neither view is the other rotated — they are authored separately
    ck('viewsAreNotTheSameDrawing',
      fam[0][0].toDataURL() !== fam[1][0].toDataURL() &&
      fam[0][fam[0].length - 1].toDataURL() !== fam[1][fam[1].length - 1].toDataURL(), '');
    // every frame differs from its neighbour — a strip of stills, not padding
    let same = 0;
    for (const set of fam) for (let i = 1; i < set.length; i++)
      if (set[i].toDataURL() === set[i - 1].toDataURL()) same++;
    ck('everyFrameMoves', same === 0, same + ' repeated frames');

    /* THE SWING. Measure where the deck's ink actually is in each frame: the
       lowest row it reaches (it retracts as the deck lifts) and the highest
       (it climbs). Both must move MONOTONICALLY across the strip, and the
       deck must never disappear — the edge-on frames mid-swing are thin, but
       they are still drawn. */
    // measure the DECK ONLY — warm brown timber. The winch drums and the
    // chains are iron and sit still on the gallery in every frame; counting
    // them would pin the extents and the checks below would pass on furniture.
    const rows = (c) => {
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      let lo = -1, hi = -1, n = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] < 100 || d[i] - d[i + 2] < 26) continue;
        n++; if (hi < 0) hi = y; lo = y;
      }
      return { lo, hi, n };
    };
    const face = fam[0].map(rows);
    ck('everyFrameDrawsSomething', face.every(r => r.n > 20),
      'lightest frame ' + Math.min(...face.map(r => r.n)) + 'px');
    let downOk = true, upOk = true;
    for (let i = 1; i < face.length; i++) {
      if (face[i].lo > face[i - 1].lo) downOk = false;    // the ground reach only ever retracts
      if (face[i].hi > face[i - 1].hi) upOk = false;      // the deck only ever climbs
    }
    ck('theDeckRetractsMonotonically', downOk, face.map(r => r.lo).join(','));
    ck('theDeckClimbsMonotonically', upOk, face.map(r => r.hi).join(','));
    // …and the two ends of the strip really are the two ends of the action
    ck('firstFrameIsDownLastIsUp',
      face[0].lo > face[face.length - 1].lo + 8 &&
      face[face.length - 1].hi < face[0].hi - 8,
      'down reaches row ' + face[0].lo + ', up climbs to row ' + face[face.length - 1].hi);
  }

  /* ---------- 2. THE RULES ---------- */
  G.newGame('drawbridge', 'moderate', 'large');
  Screens._demo = false; Screens.show('playing'); S.paused = true;
  const tc = Bld.tcOf('P');
  const cx = tc.x, cy = tc.y + 5;
  S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  G.reveal(cx, cy, 18); G.reveal(cx + 8, cy, 12);
  for (let i = -3; i <= 3; i++) {
    S.map.terrain[MapGen.idx(cx + i, cy)] = T.GRASS;
    Bld.place('P', i === 0 ? 'gate' : 'wall', cx + i, cy, { instant: true });
  }
  for (let j = -3; j <= 3; j++) {
    S.map.terrain[MapGen.idx(cx + 8, cy + j)] = T.GRASS;
    Bld.place('P', j === 0 ? 'gate' : 'wall', cx + 8, cy + j, { instant: true });
  }
  for (const bb of S.buildings) if (bb.key === 'wall' || bb.key === 'gate') bb.construction = 0;
  Bld._block = null;
  const gate = S.buildings.find(bb => bb.key === 'gate' && bb.x === cx && bb.y === cy);
  const vGate = S.buildings.find(bb => bb.key === 'gate' && bb.x === cx + 8);
  ck('twoGatesForTheTest', !!gate && !!vGate, '');

  // ---- 2a. the third tier owns it ----
  {
    const lvls = {};
    for (const L of [1, 2, 3]) { gate.level = L; lvls[L] = Bld.canDrawbridge(gate); }
    ck('onlyLevelThreeHasAWinch', !lvls[1] && !lvls[2] && lvls[3],
      'L1 ' + lvls[1] + ' · L2 ' + lvls[2] + ' · L3 ' + lvls[3]);
    gate.level = 3;
    gate.construction = 2;
    const raising = Bld.canDrawbridge(gate);
    gate.construction = 0;
    ck('noLeverWhileItIsStillBeingRaised', !raising, '');
    // a WALL never grows one, whatever its level
    const wall = S.buildings.find(bb => bb.key === 'wall');
    wall.level = 3;
    ck('aWallHasNoDrawbridge', !Bld.canDrawbridge(wall), '');
  }

  // ---- 2b. raised is a WALL, for everyone ----
  {
    for (const g of [gate, vGate]) { g.level = 3; g.raised = false; }
    Bld._block = null;
    const openBlk = Bld.blockAt(gate.x, gate.y);
    const openP = Path.passable(gate.x, gate.y, 'P'), openA = Path.passable(gate.x, gate.y, 'A');
    ck('loweredIsTheDoorItAlwaysWas', openBlk === 2 && openP && !openA,
      'code ' + openBlk + ', player passes, rival does not');
    ck('theLeverReports', Bld.toggleDrawbridge(gate) === true && gate.raised === true, '');
    const shutBlk = Bld.blockAt(gate.x, gate.y);
    ck('raisedIsCodeOne', shutBlk === 1, 'code ' + shutBlk);
    ck('raisedShutsOutItsOwnTribeToo',
      !Path.passable(gate.x, gate.y, 'P') && !Path.passable(gate.x, gate.y, 'A') &&
      !Path.passable(gate.x, gate.y, 'R'), '');
    // …and it is still a FORTIFICATION, so the curtain's auto-tiling and every
    // wall-line rule that asks Bld.fortAt read it exactly as before
    ck('raisedIsStillPartOfTheLine', Bld.fortAt(gate.x, gate.y), '');
    ck('theLeverGoesBothWays',
      Bld.toggleDrawbridge(gate) === true && gate.raised === false &&
      Bld.blockAt(gate.x, gate.y) === 2 && Path.passable(gate.x, gate.y, 'P'), '');
    // a level-2 gate refuses the order outright rather than sealing silently
    gate.level = 2; Bld._block = null;
    const refused = Bld.toggleDrawbridge(gate);
    gate.level = 3; gate.raised = false; Bld._block = null;
    ck('aLevelTwoGateRefusesTheOrder', refused === false && !gate.raised, '');
  }

  // ---- 2c. nobody is wedged in the passage ----
  {
    gate.raised = false; Bld._block = null;
    const v = Units.spawn('villager', 'P', gate.x, gate.y);
    v.x = gate.x + 0.5; v.y = gate.y + 0.5;
    Bld.toggleDrawbridge(gate);
    const onGate = (v.x | 0) === gate.x && (v.y | 0) === gate.y;
    ck('shuttingTheGateStepsYouClear',
      !onGate && Path.passable(v.x | 0, v.y | 0, 'P'),
      'ended at ' + (v.x | 0) + ',' + (v.y | 0));
    Units.despawn(v);
    Bld.toggleDrawbridge(gate);   // back down
  }

  // ---- 2d. the lever's label is the ACTION ----
  {
    gate.raised = false; Bld._block = null;
    UI.select('bld', gate.id);
    UI.renderPanel();
    const label = () => {
      const el = document.querySelector('#panel [data-act="drawbridge"]');
      return el ? el.textContent : null;
    };
    const down = label();
    const sigDown = UI.panelSig();
    document.querySelector('#panel [data-act="drawbridge"]').click();
    const up = label();
    const sigUp = UI.panelSig();
    ck('theLeverSaysRaiseWhileItIsDown', !!down && /Raise/i.test(down), String(down));
    ck('theLeverSaysLowerWhileItIsUp', !!up && /Lower/i.test(up), String(up));
    ck('theOrderLandsFromTheButton', gate.raised === true && Bld.blockAt(gate.x, gate.y) === 1, '');
    // the signature must MOVE, or refreshPanel would leave the stale label up
    ck('panelSigCarriesTheDeck', sigDown !== sigUp, '');
    // a level-1 gate shows no lever at all
    gate.raised = false; gate.level = 1; Bld._block = null;
    UI.renderPanel();
    ck('noLeverOnAnEarlyGate', label() === null, '');
    gate.level = 3; Bld._block = null;
    UI.renderPanel();
    ck('theLeverIsBackAtLevelThree', label() !== null, '');
  }

  // ---- 2e. the swing is RENDER state, and the seal does not wait for it ----
  {
    gate.raised = false; vGate.raised = false; Bld._block = null;
    R._dbA = {};
    const before = JSON.stringify(S).length;
    Bld.toggleDrawbridge(gate);
    // the tile is shut THIS INSTANT — no frame has been drawn yet
    ck('theSealDoesNotWaitForTheAnimation',
      Bld.blockAt(gate.x, gate.y) === 1 && R._dbA[gate.id] === undefined, '');
    ck('theDeckAngleIsNeverInASave',
      !/"_dbA"|"gateA"/.test(JSON.stringify(S)) && !('gateA' in gate) &&
      typeof R._dbA === 'object', '');
    // a gate first MET already shut starts settled rather than slamming
    const vis = G.visibleAt; G.visibleAt = () => true;
    R.centerOn(gate.x + 0.5, gate.y + 0.5);
    try { R.draw(0.016); } finally { G.visibleAt = vis; }
    ck('aGateMetShutStartsSettled', R._dbA[gate.id] === 1, String(R._dbA[gate.id]));
    // …and lowering it eases back rather than snapping
    Bld.toggleDrawbridge(gate);
    G.visibleAt = () => true;
    try { R.draw(0.016); } finally { G.visibleAt = vis; }
    const eased = R._dbA[gate.id];
    ck('theSwingIsEased', eased > 0 && eased < 1, String(eased));
    ck('butThePassageIsOpenAlready', Path.passable(gate.x, gate.y, 'P'), '');
    void before;
  }

  // ---- 2f. each gate wears the view its LINE calls for ----
  {
    ck('theTwoGatesFaceDifferentWays',
      R.gateVerticalAt(gate.x, gate.y) === false && R.gateVerticalAt(vGate.x, vGate.y) === true, '');
    // and the right strip reaches the canvas for each
    const vis = G.visibleAt; G.visibleAt = () => true;
    const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
    const drawn = [];
    proto.drawImage = function (img) { drawn.push(img); return orig.apply(this, arguments); };
    R.centerOn(gate.x + 4, gate.y + 0.5);
    try { R.draw(0.016); } finally { proto.drawImage = orig; G.visibleAt = vis; }
    ck('theFaceDeckIsDrawn', Sprites.drawbridge[0].some(c => drawn.includes(c)), '');
    ck('theFlankDeckIsDrawn', Sprites.drawbridge[1].some(c => drawn.includes(c)), '');
  }

  // ---- 2g. a legacy save has open gates, and knows it ----
  {
    const snap = JSON.parse(JSON.stringify(S));
    for (const bb of snap.buildings) delete bb.raised;
    G.loadJSON(JSON.stringify(snap));
    const g2 = S.buildings.filter(bb => bb.key === 'gate');
    ck('preDrawbridgeSavesLoadOpen',
      g2.length > 0 && g2.every(bb => bb.raised === false) &&
      g2.every(bb => Bld.blockAt(bb.x, bb.y) !== 1), '');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL DRAWBRIDGE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
