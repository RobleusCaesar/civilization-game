/* SIEGE LINE — PLUMBING CONTRACT. The four engines ride MILITARY_ART
   (a keyed pennant is the only dyed region — a captured-looking engine
   is a friend/foe bug) with NO idle sheets: a machine that stops HOLDS
   its walk frame 0 through the stationary-borrow rule, and the
   attackless siege tower ships no fight sheet either. The trebuchet's
   flaming ball is the operator's hero: projFx 'firestorm' rides the
   same seam as the bombard's blast — bigger ball in flight, and the
   landing throws a wide ember splash plus a BLAZE that burns on the
   ground for seconds (R.blazes, capped at 6). The catapult's boulder,
   the ballista's bolt and the plain fire-arrow strike stay
   byte-identical.

   Run after touching: assets.js (MILITARY_ART engines/UNIT_BOX),
   render.js (projectile flight draw, R.impact firestorm branch,
   R.blazes), combat.js (launch fx thread), config.js (trebuchet def).

     node tests/siege-art.mjs      # exits non-zero on any regression */
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

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  G.newGame('aa1', 'moderate', 'medium');
  Screens._demo = false; Screens.show('playing'); S.paused = true;

  /* ---- 1. the registries: four engines, dyed, correctly pose-listed ---- */
  {
    ck('theSiegeTrainRidesMilitaryArt',
      JSON.stringify(Assets.MILITARY_ART.catapult) === '["walk","fight"]' &&
      JSON.stringify(Assets.MILITARY_ART.ballista) === '["walk","fight"]' &&
      JSON.stringify(Assets.MILITARY_ART.trebuchet) === '["walk","fight"]' &&
      JSON.stringify(Assets.MILITARY_ART.siegetower) === '["walk"]',
      JSON.stringify({ c: Assets.MILITARY_ART.catapult, s: Assets.MILITARY_ART.siegetower }));
    const overlap = Object.keys(Assets.MILITARY_ART).filter(k => Assets.UNIT_ART[k]);
    ck('noEngineRidesTheBootProbe', overlap.length === 0,
      overlap.length ? 'overlap: ' + overlap.join(',') : '');
    const t = Units.spawn('trebuchet', 'P', 20, 20);
    ck('theEngineWearsTheVillagePennant',
      R.unitArtKey(t) === 'trebuchet-p-' + G.tunicOf('P'), R.unitArtKey(t));
    t.owner = 'R';
    ck('aStrangersEngineNeverWearsYourColours', R.unitArtKey(t) === 'trebuchet', R.unitArtKey(t));
    t.owner = 'P';
    // the operator's ruling: the WHOLE siege train stands ship-sized —
    // the first cut's 32-box catapult and ballista read as toys
    ck('theWholeSiegeTrainTakesTheBigBox',
      Assets.UNIT_BOX.trebuchet === 48 && Assets.UNIT_BOX.siegetower === 48 &&
      Assets.UNIT_BOX.catapult === 48 && Assets.UNIT_BOX.ballista === 48,
      JSON.stringify({ t: Assets.UNIT_BOX.trebuchet, c: Assets.UNIT_BOX.catapult }));
    S.units = S.units.filter(z => z !== t);
  }

  /* ---- 2. a stopped machine holds its walk frame; the tower never fights ---- */
  {
    const key = 'siegetower-p-' + G.tunicOf('P');
    const strip = document.createElement('canvas');
    strip.width = 96 * 4; strip.height = 96;
    strip.getContext('2d').fillRect(0, 0, strip.width, strip.height);
    for (const dir of Assets.UNIT_DIRS8) Assets.setUnitFrames(key, dir, 'walk', strip, G.tunicOf('P'));
    const st = Units.spawn('siegetower', 'P', 22, 20); st.x = 22; st.y = 20; st.path = null;
    st.task = null; st.tUnit = 0; st.tBld = 0;
    const fr = R.sheetFrames(st);
    ck('aStoppedMachineHoldsItsWalkFrame',
      !!fr && R._sheetHold === true && R.unitPose(st) === 'idle',
      'pose ' + R.unitPose(st) + ', hold ' + R._sheetHold);
    Assets.removeUnitArt(key);
    S.units = S.units.filter(z => z !== st);
  }

  /* ---- 3. the firestorm threads; the catapult and ballista do not ---- */
  {
    const tr = Units.spawn('trebuchet', 'P', 20, 20);
    const cat = Units.spawn('catapult', 'P', 24, 20);
    const bal = Units.spawn('ballista', 'P', 26, 20);
    const n0 = Combat.projectiles.length;
    Combat.launch(tr, 28, 20, { kind: 'bld', id: 0, dmg: 0 });
    Combat.launch(cat, 28, 21, { kind: 'bld', id: 0, dmg: 0 });
    Combat.launch(bal, 28, 22, { kind: 'bld', id: 0, dmg: 0 });
    const pt = Combat.projectiles[n0], pc = Combat.projectiles[n0 + 1], pb = Combat.projectiles[n0 + 2];
    ck('onlyTheTrebuchetHurlsAFirestorm',
      pt && pt.fx === 'firestorm' && pt.kind === 'flame' &&
      pc && pc.fx === null && pc.kind === 'stone' &&
      pb && pb.fx === null && pb.kind === 'bolt',
      JSON.stringify({ t: pt && pt.fx, c: pc && pc.fx, b: pb && pb.fx }));

    /* ---- 4. the landing: ember splash + a pooled blaze, capped at 6 ---- */
    R.blazes.length = 0; R.particles.length = 0;
    Combat.impact(pt);
    ck('theBallLightsTheGroundWhereItLands',
      R.blazes.length === 1 && R.particles.length >= 25,
      R.blazes.length + ' blazes, ' + R.particles.length + ' particles');
    for (let i = 0; i < 9; i++) R.impact(24.5, 20.5, 'flame', 'firestorm');
    ck('theBlazePoolIsCapped', R.blazes.length <= 6, R.blazes.length + ' pooled');

    /* ---- 5. the plain flame strike and the boulder stay byte-identical ---- */
    R.blazes.length = 0; R.particles.length = 0;
    R.impact(24.5, 20.5, 'flame');                       // a fire ARROW's burst
    const arrowN = R.particles.length;
    ck('theFireArrowBurstIsUntouched',
      R.blazes.length === 0 && arrowN > 0 && arrowN <= 17,
      R.blazes.length + ' blazes, ' + arrowN + ' particles (12 embers + 5 smoke)');
    R.particles.length = 0;
    Combat.impact(pc);                                    // the catapult boulder
    ck('theBoulderStaysByteIdentical',
      R.blazes.length === 0 && R.particles.length > 0 && R.particles.length <= 16,
      R.particles.length + ' particles');
    Combat.projectiles.length = 0;
    S.units = S.units.filter(z => z !== tr && z !== cat && z !== bal);
  }

  /* ---- 6. new-game drops the blaze pool with the other VFX ---- */
  {
    R.blazes.push({ x: 1, y: 1, t: 0 });
    G.newGame('aa2', 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    ck('aNewGameInheritsNoOldFires', R.blazes.length === 0, R.blazes.length + ' left over');
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ok ' : 'FAIL ') + k + (v.length > 4 ? '  [' + v + ']' : ''));
if (errs.length) { console.log('\npage errors:'); for (const e of errs) console.log('  ' + e); }
await b.close();
if (out.fails.length || errs.length) { console.log('\n' + out.fails.length + ' failing'); process.exit(1); }
console.log('\nall siege plumbing holds');
