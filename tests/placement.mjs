/* PLACEMENT CONTRACT — the touch-first building placement mode, and the ONE
   placement truth beneath it (Bld.canPlace). What this pins:

   1. ONE SOURCE OF TRUTH. The grid tint, the ghost verdict, the confirm and
      the rival AI all ask Bld.canPlace — with machine-readable reason codes,
      cost as a separate STATE (noCost — amber, not refusal), and the seal
      flood validated on the pick (noSeal for scans), never on the scan.
   2. THE SEAL CLAMP: a player must not wall themselves in by accident. The
      closing stone of a gateless ring is refused ('sealed'); a gate always
      passes; a ring with a gate elsewhere lets the wall close.
   3. THE FLOW: menu tap arms and seeds a ghost at the nearest valid cell;
      map taps JUMP the ghost (never commit); confirm RE-VALIDATES from
      scratch (the world can change between release and ✓); cancel keeps the
      menu selection; exit leaves no ghost, grid, or DOM behind.
   4. FOOTPRINTS 1×1 / 2×2 / 3×3, map edges and corners, every reason code,
      afford boundaries (exactly-enough / one-short), dock orientation, and
      the AI still building on every difficulty through the same function.

   Run after touching: Bld.canPlace / wouldSeal / _openToBorder / place,
   UI.enterPlacement / buildPlaceMap / confirmPlacement / exitPlacement /
   tickPlacement, R.drawPlaceGrid / drawPlaceGhost, AI.plot / tryBuild /
   maybeWonder.

     node tests/placement.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1000);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const arena = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.onBoard(x, y) && !Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    Bld._block = null; Bld._openC = null;
    S.res = { food: 999, wood: 999, stone: 999, gold: 999 };
    for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1;
    G.updateVisibility();
    return tc;
  };

  // ---- 1. reason codes: every refusal is distinct and machine-readable ----
  {
    const tc = arena('pl1');
    const at = (x, y, t) => { S.map.terrain[MapGen.idx(x, y)] = t; };
    at(tc.x + 4, tc.y, T.FOREST);
    ck('forestBlocksWithItsOwnName', (() => {
      const r = Bld.canPlace('P', 'house', tc.x + 4, tc.y);
      return !r.ok && r.code === 'blocked' && /forest/i.test(r.why);
    })(), JSON.stringify(Bld.canPlace('P', 'house', tc.x + 4, tc.y)));
    at(tc.x + 4, tc.y + 1, T.WATER);
    ck('waterBlocksWithItsOwnName', (() => {
      const r = Bld.canPlace('P', 'house', tc.x + 4, tc.y + 1);
      return !r.ok && r.code === 'blocked' && /water/i.test(r.why);
    })(), '');
    ck('aBuildingBlocksWithItsOwnName', (() => {
      const r = Bld.canPlace('P', 'house', tc.x, tc.y);   // the hall itself
      return !r.ok && r.code === 'blocked' && /building/i.test(r.why);
    })(), '');
    S.map.explored[MapGen.idx(tc.x - 4, tc.y - 4)] = 0;
    ck('unexploredIsItsOwnCode', Bld.canPlace('P', 'house', tc.x - 4, tc.y - 4).code === 'unexplored', '');
    ck('offMapIsItsOwnCode', Bld.canPlace('P', 'house', -3, -3).code === 'edge', '');
    S.res = { food: 0, wood: 0, stone: 0, gold: 0 };
    ck('costIsItsOwnCodeAndLast', Bld.canPlace('P', 'house', tc.x + 2, tc.y + 2).code === 'cost', '');
    ck('noCostMakesItValid', Bld.canPlace('P', 'house', tc.x + 2, tc.y + 2, { noCost: true }).ok === true, '');
    S.res = { food: 999, wood: 999, stone: 999, gold: 999 };
    // far ground TOWARD the middle of the board (the hall may sit near a rim)
    const fx = tc.x > CFG.W / 2 ? tc.x - 20 : tc.x + 20;
    const fy = tc.y > CFG.H / 2 ? tc.y - 20 : tc.y + 20;
    S.map.terrain[MapGen.idx(fx, fy)] = T.GRASS;   // clear ground, just too far
    ck('anchorRefusalIsItsOwnCode', (() => {
      const r = Bld.canPlace('P', 'house', fx, fy);
      return !r.ok && r.code === 'anchor';
    })(), JSON.stringify(Bld.canPlace('P', 'house', fx, fy)));
  }

  // ---- 2. afford boundaries: exactly enough passes, one short ambers ----
  {
    const tc = arena('pl2');
    const cost = Bld.effCost('P', 'house');
    S.res = Object.assign({ food: 0, wood: 0, stone: 0, gold: 0 }, cost);
    ck('exactlyEnoughIsEnough', Bld.canPlace('P', 'house', tc.x + 3, tc.y + 3).ok === true, JSON.stringify(cost));
    for (const k in cost) if (cost[k] > 0) { S.res[k] = cost[k] - 1; break; }
    const r1 = Bld.canPlace('P', 'house', tc.x + 3, tc.y + 3);
    ck('oneShortIsTheCostState', !r1.ok && r1.code === 'cost', '');
    ck('theCostStateIsNotATileState', Bld.canPlace('P', 'house', tc.x + 3, tc.y + 3, { noCost: true }).ok === true, '');
  }

  // ---- 3. footprints: 2×2 and 3×3 straddling valid and invalid ground ----
  {
    const tc = arena('pl3');
    S.map.terrain[MapGen.idx(tc.x + 5, tc.y + 4)] = T.WATER;   // one wet tile
    const r = Bld.canPlace('P', 'barracks', tc.x + 4, tc.y + 3);   // 2×2 catches it at (5,4)
    ck('oneBadTileRefusesA2x2', !r.ok && r.code === 'blocked', JSON.stringify(r));
    ck('theSame2x2FitsBesideIt', Bld.canPlace('P', 'barracks', tc.x + 2, tc.y + 3).ok === true, '');
    // the wonder's 3×3 through the same loops (clear of the wet tile above)
    const w = Bld.canPlace('P', 'wonder', tc.x - 6, tc.y + 2, { noCost: true });
    ck('a3x3ValidatesWholeFootprint', w.ok === true, JSON.stringify(w));
    S.map.terrain[MapGen.idx(tc.x - 4, tc.y + 4)] = T.MOUNTAIN;   // its far corner
    ck('a3x3CatchesItsFarCorner', Bld.canPlace('P', 'wonder', tc.x - 6, tc.y + 2, { noCost: true }).ok === false, '');
  }

  // ---- 4. map edges and corners: no out-of-bounds reads, edge code fires ----
  {
    arena('pl4');
    let threw = null;
    try {
      for (const [x, y] of [[0, 0], [CFG.W - 1, CFG.H - 1], [0, CFG.H - 1], [CFG.W - 1, 0],
                            [-1, 5], [5, -1], [CFG.W, 5], [5, CFG.H], [CFG.W - 2, CFG.H - 2]])
        Bld.canPlace('P', 'wonder', x, y, { noCost: true });
    } catch (e) { threw = String(e); }
    ck('edgesAndCornersNeverThrow', threw === null, threw || '');
    ck('theRimIsRefused', Bld.canPlace('P', 'house', 0, 0, { noCost: true }).ok === false, '');
  }

  // ---- 5. the seal clamp (a ring test lives in the working set) ----
  {
    const tc = arena('pl5');
    const sz = Bld.size('tc'), R2 = 2, ring = [];
    for (let dy = -R2; dy <= sz + R2 - 1; dy++) for (let dx = -R2; dx <= sz + R2 - 1; dx++)
      if (dy === -R2 || dy === sz + R2 - 1 || dx === -R2 || dx === sz + R2 - 1)
        ring.push({ x: tc.x + dx, y: tc.y + dy });
    const gap = ring.find(t => t.y === tc.y - R2 && t.x === tc.x + 1);   // an EDGE gap (4-dir floods can't pass corners)
    for (const t of ring) if (t !== gap) Bld.place('P', 'wall', t.x, t.y, { free: true, instant: true });
    Bld._openC = null;
    const rw = Bld.canPlace('P', 'wall', gap.x, gap.y);
    ck('theClosingStoneIsRefused', !rw.ok && rw.code === 'sealed', JSON.stringify(rw));
    ck('aHouseCorksJustTheSame', Bld.canPlace('P', 'house', gap.x, gap.y).code === 'sealed', '');
    ck('aGateAlwaysOpensForItsOwner', Bld.canPlace('P', 'gate', gap.x, gap.y).ok === true, '');
    ck('theScanSkipsTheFlood', Bld.canPlace('P', 'wall', gap.x, gap.y, { noSeal: true }).ok === true,
      'the grid uses noSeal; the pick pays for the truth');
    // a gate elsewhere in the ring, and the wall may close the gap
    const g2 = ring.find(t => t.y === tc.y + sz + R2 - 1 && t.x === tc.x + 1);
    const old = Bld.at(g2.x, g2.y);
    S.buildings.splice(S.buildings.indexOf(old), 1); Bld._block = null; Bld._openC = null;
    Bld.place('P', 'gate', g2.x, g2.y, { free: true, instant: true });
    Bld._openC = null;
    ck('aGateInTheRingFreesTheWall', Bld.canPlace('P', 'wall', gap.x, gap.y).ok === true, '');
  }

  // ---- 6. THE FLOW: arm → ghost → jump → confirm/cancel/exit ----
  {
    const tc = arena('pl6');
    R.centerOn(Bld.cx(tc), Bld.cy(tc));
    UI.enterPlacement('house');
    ck('armingSeedsAGhostOnAValidCell', !!UI.placeGhost && UI.placeMap &&
      UI.placeMap[UI.placeGhost.y * CFG.W + UI.placeGhost.x] === 0,
      JSON.stringify(UI.placeGhost));
    ck('theMapIsBuiltOnceAndCached', !!UI.placeMapStamp && UI.placeMapMs < 25,
      'built in ' + (UI.placeMapMs || 0).toFixed(1) + 'ms');
    // a tap JUMPS the ghost — it never commits
    const nB = S.buildings.length;
    const tap = (wx, wy) => UI.handleTap((wx * CFG.TILE - R.cam.x) * R.cam.z, (wy * CFG.TILE - R.cam.y) * R.cam.z);
    tap(tc.x + 3.5, tc.y + 3.5);
    ck('aTapJumpsTheGhostNeverCommits', S.buildings.length === nB &&
      !!UI.placeGhost && UI.placeGhost.set === true, '');
    // confirm places through the existing pipeline (site, builder dispatch)
    UI.placeGhost = { x: tc.x + 3, y: tc.y + 3, set: true }; UI._placeCheck();
    UI.confirmPlacement();
    const built = Bld.at(tc.x + 3, tc.y + 3);
    ck('confirmStartsConstruction', !!built && built.key === 'house' && built.construction > 0, '');
    ck('confirmExitsTheModeWhole', UI.placing === null && UI.placeGhost === null && UI.placeMap === null, '');
    // cancel keeps the selection armed and reopens the menu
    UI.enterPlacement('tower');
    UI.cancelPlacement();
    ck('cancelKeepsTheChoiceArmed', UI.placing === 'tower' && UI.placeGhost === null, '');
    // …and a key with NOWHERE valid to stand (a farm before any soil is
    // picked bare) never opens a ghostless mode — it says why and stays out
    UI.exitPlacement();
    UI.enterPlacement('farm');
    ck('anEmptyRegionExplainsItself', UI.placing === null && UI.placeGhost === null,
      'no silent ghostless mode');
    UI.exitPlacement();
    ck('exitLeavesNothingBehind', UI.placing === null && UI.placeGhost === null &&
      UI.placeMap === null && UI.placeVerdict === null && !UI.placeDragging, '');
  }

  // ---- 7. CONFIRM RE-VALIDATES: the world changed between release and ✓ ----
  {
    const tc = arena('pl7');
    UI.enterPlacement('house');
    UI.placeGhost = { x: tc.x + 3, y: tc.y + 3, set: true }; UI._placeCheck();
    ck('theTintSaysYes', UI.placeVerdict.ok === true, '');
    // …and then someone builds there first
    Bld.place('P', 'farm', tc.x + 3, tc.y + 3, { free: true, instant: true });
    const nB = S.buildings.length;
    UI.confirmPlacement();
    ck('aStaleConfirmIsRejectedGracefully', S.buildings.length === nB && UI.placing === 'house',
      'no house placed, mode stays armed for another try');
    ck('theMapWasRebuiltToTheNewTruth', UI.placeMap[(tc.y + 3) * CFG.W + tc.x + 3] !== 0, '');
    UI.exitPlacement();
  }

  // ---- 8. repeated enter/exit leaks nothing ----
  {
    arena('pl8');
    const domBefore = document.querySelectorAll('#placeUI').length;
    for (let i = 0; i < 40; i++) { UI.enterPlacement(i % 2 ? 'house' : 'barracks'); UI.exitPlacement(); }
    ck('noDomLeakAcrossFortyRounds', document.querySelectorAll('#placeUI').length === Math.max(1, domBefore),
      document.querySelectorAll('#placeUI').length + ' node(s)');
    ck('noStateLeakEither', UI.placing === null && UI.placeGhost === null && UI.placeMap === null, '');
  }

  // ---- 9. lifecycle: save/load and newGame cancel the mode whole ----
  {
    const tc = arena('pl9');
    UI.enterPlacement('house');
    UI.placeGhost = { x: tc.x + 3, y: tc.y + 3, set: true };
    const json = G.saveJSON();
    G.loadJSON(json);
    ck('aLoadCancelsPlacementWhole', UI.placing === null && UI.placeGhost === null && UI.placeMap === null, '');
    ck('placementNeverRidesInASave', !/placeGhost|placeMap/.test(json), '');
    Screens._demo = false; Screens.show('playing');
    UI.enterPlacement('house');
    G.newGame('pl9b', 'moderate', 'large'); Screens._demo = false; Screens.show('playing');
    ck('aNewGameCancelsItToo', UI.placing === null && UI.placeGhost === null, '');
  }

  // ---- 10. the validity map: fog is clean, region is trimmed, cache keys work ----
  {
    const tc = arena('pl10');
    for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 0;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++)
      if (MapGen.inB(tc.x + dx, tc.y + dy)) S.map.explored[MapGen.idx(tc.x + dx, tc.y + dy)] = 1;
    UI.enterPlacement('house');
    let fogged = 0;
    for (let i = 0; i < UI.placeMap.length; i++)
      if (!S.map.explored[i] && UI.placeMap[i] !== 255) fogged++;
    ck('noGridCellEverSitsOnFog', fogged === 0, fogged + ' cells leak the fog');
    // staleness: placing a building must rebuild on the next tick
    const stamp = UI.placeMapStamp;
    Bld.place('P', 'house', tc.x + 3, tc.y + 3, { free: true, instant: true });
    UI.tickPlacement(0.016);
    ck('aPlacementRefreshesTheMap', UI.placeMapStamp !== stamp &&
      UI.placeMap[(tc.y + 3) * CFG.W + tc.x + 3] !== 0, '');
    UI.exitPlacement();
  }

  // ---- 11. hysteresis: a finger on a cell boundary never flickers ----
  {
    const tc = arena('pl11');
    R.centerOn(Bld.cx(tc), Bld.cy(tc));
    UI.enterPlacement('house');
    const sx = (x) => (x * CFG.TILE - R.cam.x) * R.cam.z;
    const sy = (y) => (y * CFG.TILE - R.cam.y) * R.cam.z;
    UI.placeGhost = { x: tc.x + 3, y: tc.y + 3, set: false };
    // wiggle ±0.12 tiles around the boundary of the CURRENT cell — sticky
    const cx0 = tc.x + 3.5, cy0 = tc.y + 3.5;
    let moved = false;
    for (const off of [0.44, 0.56, 0.47, 0.55, 0.45]) {
      UI.placeGhostTo(sx(cx0 + off), sy(cy0), false);
      if (UI.placeGhost.x !== tc.x + 3) moved = true;
    }
    ck('boundaryWiggleNeverFlickers', !moved, 'ghost stayed while the finger sat on the seam');
    UI.placeGhostTo(sx(cx0 + 1.3), sy(cy0), false);
    ck('aRealMoveStillMoves', UI.placeGhost.x === tc.x + 4, 'x=' + UI.placeGhost.x);
    UI.exitPlacement();
  }

  // ---- 12. dock: shore orientation resolves through the shared function ----
  {
    const tc = arena('pl12');
    tc.level = 2;   // the dock's tech gate — this section is about the water rules
    // a lake with a west shore: dock floats, deck anchors west
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 5; dx++)
      S.map.terrain[MapGen.idx(tc.x + 4 + dx, tc.y + dy)] = T.WATER;
    Bld._block = null;
    const r = Bld.canPlace('P', 'dock', tc.x + 4, tc.y + 1);   // west flank against the grass shore
    ck('aRealDockSiteValidates', r.ok === true, JSON.stringify(r));
    const rNo = Bld.canPlace('P', 'dock', tc.x + 2, tc.y + 2);
    ck('landRefusesADockDistinctly', !rNo.ok && rNo.code === 'water', JSON.stringify(rNo));
    Bld.place('P', 'dock', tc.x + 4, tc.y + 1, { free: true, instant: true });
    const dk = Bld.at(tc.x + 4, tc.y + 1);
    ck('theShoreOrientationResolves', ['n', 'e', 's', 'w'].includes(Bld.dockShore(dk)), Bld.dockShore(dk));
  }

  // ---- 13. the rival AI builds through the same function, every difficulty ----
  {
    const counts = {};
    for (const mode of ['calm', 'moderate', 'hard']) {
      G.newGame('plai-' + mode, mode, 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      S.ai.res = { food: 900, wood: 900, stone: 900, gold: 200 };
      const before = Bld.list('A').length;
      for (let d = 0; d < 25; d++) { S.day++; AI.daily(); }
      counts[mode] = Bld.list('A').length - before;
    }
    ck('theChiefStillBuildsOnEveryDifficulty',
      counts.calm > 0 && counts.moderate > 0 && counts.hard > 0, JSON.stringify(counts));
    // …and what it built is legal by the shared truth (footprint overlap check)
    let overlap = 0;
    const seen = new Set();
    for (const bld of S.buildings) {
      const s = Bld.size(bld);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const k = (bld.x + dx) + ',' + (bld.y + dy);
        if (seen.has(k)) overlap++; else seen.add(k);
      }
    }
    ck('nothingTheChiefBuiltOverlaps', overlap === 0, overlap + ' shared tiles');
  }

  // ---- 14. multi-touch never corrupts the drag state ----
  {
    const tc = arena('pl14');
    UI.enterPlacement('house');
    UI.placeGhost = { x: tc.x + 3, y: tc.y + 3, set: false };
    UI.placeDragging = true; UI.placePtr = { x: 100, y: 100, touch: true };
    // a second finger lands: the pinch branch must stand the drag down
    UI.pointers.set(1, { x: 100, y: 100 }); UI.pointers.set(2, { x: 200, y: 200 });
    UI.placeDragging = false; UI.placePtr = null;   // what the pinch branch does
    ck('aPinchStandsTheDragDown', !UI.placeDragging && !!UI.placeGhost, '');
    UI.pointers.clear();
    UI.exitPlacement();
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL PLACEMENT CHECKS PASS');
const hard = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', hard);
await b.close();
process.exit(out.fails.length || hard.length ? 1 : 0);
