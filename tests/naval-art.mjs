/* DOCK LINE — PLUMBING CONTRACT (the code, before any art exists).
   Boats split across the two registries by DYE, not by job: the fishing
   boat, the transport and the fire warship carry no village colour, so
   they ride UNIT_ART's plain-kind probe and one neutral sheet serves
   every owner (including the Sea Folk's 'R' longboats — accepted and
   flagged). The Bombard Ship alone flies a dyed stern banner, so it
   rides MILITARY_ART — and a non-P/A owner must NEVER build a dyed key
   there, or tunicOf's blue default would sail a Sea Folk hull in the
   player's livery. A hull also holds its heading: every facing
   correction (fight target-turn, the WORK_TURN no-backs clamp) is
   written for people and skipped afloat; the idle dwell-warp is too (a
   bob that plateaus reads as running aground), and boats bake their
   own water shadow so the renderer's ground ellipse is skipped. The
   Bombard's stone lands a 'blast': projectiles thread CFG projFx →
   R.impact, which throws the big burst and pools a shockwave + scorch
   (R.blasts, capped, water-aware).

   Run after touching: assets.js (UNIT_ART hulls/MILITARY_ART bombard/
   UNIT_BOX), render.js (unitArtKey owner guard, sheetFrames naval
   facing, idle clock, workLean, R.impact blast branch, R.blasts),
   combat.js (launch fx thread), config.js (dock unit defs).

     node tests/naval-art.mjs      # exits non-zero on any regression */
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

  // one water tile serves every boat below (positions set EXPLICITLY —
  // spawn slides, the banked lesson)
  let wx = -1, wy = -1;
  outer: for (let y = 4; y < CFG.H - 4; y++) for (let x = 4; x < CFG.W - 4; x++)
    if (S.map.terrain[MapGen.idx(x, y)] === T.WATER) { wx = x + 0.5; wy = y + 0.5; break outer; }
  ck('theMapHasWaterToTestOn', wx > 0, 'no T.WATER tile found on aa1/medium');

  // a plain white strip: 4 square frames, no tunic key anywhere
  const mkStrip = (n, cols) => {
    const c = document.createElement('canvas');
    c.width = 96 * (n || 4); c.height = 96;
    const g2 = c.getContext('2d');
    for (let i = 0; i < (n || 4); i++) {
      g2.fillStyle = (cols && cols[i]) || '#e8e0d0';
      g2.fillRect(96 * i, 0, 96, 96);
    }
    return c;
  };

  /* ---- 1. the registries split by dye, and the keys follow ---- */
  {
    const fb = Units.spawn('fishboat', 'P', wx, wy); fb.x = wx; fb.y = wy;
    const tr = Units.spawn('transport', 'A', wx, wy); tr.x = wx; tr.y = wy;
    const fs = Units.spawn('fireship', 'R', wx, wy); fs.x = wx; fs.y = wy;
    const bo = Units.spawn('bombard', 'P', wx, wy); bo.x = wx; bo.y = wy;
    const ba = Units.spawn('bombard', 'A', wx, wy); ba.x = wx; ba.y = wy;
    ck('undyedHullsKeyPlainForEveryOwner',
      R.unitArtKey(fb) === 'fishboat' && R.unitArtKey(tr) === 'transport' &&
      R.unitArtKey(fs) === 'fireship',
      [R.unitArtKey(fb), R.unitArtKey(tr), R.unitArtKey(fs)].join(' / '));
    ck('theBombardAloneWearsTheVillageDye',
      R.unitArtKey(bo) === 'bombard-p-' + G.tunicOf('P') &&
      R.unitArtKey(ba) === 'bombard-a-' + G.tunicOf('A'),
      R.unitArtKey(bo) + ' / ' + R.unitArtKey(ba));
    bo.owner = 'R';   // a Sea Folk bombard must never key into a village dye
    ck('aStrangersHullNeverWearsYourColours', R.unitArtKey(bo) === 'bombard',
      R.unitArtKey(bo) + ' (tunicOf defaults strangers to blue — the guard)');
    bo.owner = 'P';
    ck('theRegistriesNeverShareAHull',
      !Assets.MILITARY_ART.fishboat && !Assets.MILITARY_ART.transport &&
      !Assets.MILITARY_ART.fireship && !Assets.UNIT_ART.bombard &&
      !!Assets.MILITARY_ART.bombard,
      'a shared kind would serve blue-keyed art to both factions');
    ck('theFishingBoatShipsItsHaul',
      Assets.UNIT_ART.fishboat.includes('gather') && Assets.UNIT_ART.fireship.includes('fight'),
      JSON.stringify({ fishboat: Assets.UNIT_ART.fishboat, fireship: Assets.UNIT_ART.fireship }));
    S.units = S.units.filter(z => z !== fb && z !== tr && z !== fs && z !== bo && z !== ba);
  }

  /* ---- 2. a hull holds its heading: combat never spins a boat ---- */
  {
    const fs = Units.spawn('fireship', 'P', wx, wy); fs.x = wx; fs.y = wy; fs.path = null;
    const strip = mkStrip(4);
    for (const dir of Assets.UNIT_DIRS8)
      for (const pose of ['idle', 'walk', 'fight']) Assets.setUnitFrames('fireship', dir, pose, strip);
    const foe = Units.spawn('brute', 'R', wx + 1, wy); foe.hp = 9999; foe.x = wx; foe.y = wy - 1;
    fs.tUnit = foe.id;                                  // foe due NORTH…
    R._faceMap.set(fs, { x: fs.x, y: fs.y, dir: 'e' }); // …but the hull last sailed EAST
    const ua = Assets.unitArt.fireship;
    const fr = R.sheetFrames(fs);
    let hit = null;
    for (const dk in ua.dirs) for (const pk in ua.dirs[dk]) if (ua.dirs[dk][pk] === fr) hit = dk + '.' + pk;
    ck('aHullHoldsItsHeadingInAFight', hit === 'e.fight',
      hit + ' (a land fighter would have spun to n)');
    fs.tUnit = 0;
    /* …and at work: a fishing boat hauling with its bow north KEEPS the
       bow north — the no-backs clamp is for shoulder blades, not sterns */
    const fb = Units.spawn('fishboat', 'P', wx, wy); fb.x = wx; fb.y = wy; fb.path = null;
    for (const dir of Assets.UNIT_DIRS8)
      for (const pose of ['idle', 'walk', 'gather']) Assets.setUnitFrames('fishboat', dir, pose, strip);
    fb.task = { type: 'fish' };
    ck('theFishTaskWearsTheHaulPose', R.unitPose(fb) === 'gather', R.unitPose(fb));
    R._faceMap.set(fb, { x: fb.x, y: fb.y, dir: 'n' });
    const ua2 = Assets.unitArt.fishboat;
    const fr2 = R.sheetFrames(fb);
    let hit2 = null;
    for (const dk in ua2.dirs) for (const pk in ua2.dirs[dk]) if (ua2.dirs[dk][pk] === fr2) hit2 = dk + '.' + pk;
    ck('aHullHoldsItsHeadingAtWork', hit2 === 'n.gather',
      hit2 + ' (a villager would have been clamped n→s)');
    fb.task = null;
    Assets.removeUnitArt('fireship'); Assets.removeUnitArt('fishboat');
    S.units = S.units.filter(z => z !== fs && z !== foe && z !== fb);
  }

  /* ---- 3. water never dwells: the at-anchor bob rides the straight clock ---- */
  {
    const fb = Units.spawn('fishboat', 'P', wx, wy); fb.x = wx; fb.y = wy; fb.path = null;
    fb.task = null; fb.tUnit = 0; fb.tBld = 0;
    const strip = mkStrip(2, ['#aa3344', '#33aa44']);   // two frames, told apart by ink
    for (const dir of Assets.UNIT_DIRS8) {
      Assets.setUnitFrames('fishboat', dir, 'idle', strip);
      Assets.setUnitFrames('fishboat', dir, 'walk', strip);
    }
    // the install derived Sprites.animFps.fishboat from the walk strip, so
    // read it back: 1/fps + ε puts the STRAIGHT clock exactly on frame 1,
    // while the dwell-warp's opening plateau would still be holding frame 0
    const fps = (Sprites.animFps && Sprites.animFps.fishboat) || 8;
    fb.animT = 1 / fps + 0.01;
    const spr = R.unitSprite(fb);
    const d = spr.getContext('2d').getImageData(4, 4, 1, 1).data;
    ck('aBoatsBobNeverPlateaus', d[0] === 0x33 && d[1] === 0xaa && d[2] === 0x44,
      'pixel rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ') — red means the land dwell-warp held frame 0');
    Assets.removeUnitArt('fishboat');
    S.units = S.units.filter(z => z !== fb);
  }

  /* ---- 4. a hull never leans onto a building footprint ---- */
  {
    const tr = Units.spawn('transport', 'P', wx, wy);
    const atc = Bld.tcOf('A');
    tr.x = Bld.cx(atc) + 1.2; tr.y = Bld.cy(atc); tr.path = null;
    tr.tUnit = 0; tr.tBld = atc.id;                     // an (imaginary) hull battering a hall
    ck('aHullNeverLeansOntoLand', R.workLean(tr) === null,
      JSON.stringify(R.workLean(tr)));
    tr.tBld = 0;
    S.units = S.units.filter(z => z !== tr);
  }

  /* ---- 5. the bombard's stone lands a blast: threaded, thrown, pooled, capped ---- */
  {
    const bo = Units.spawn('bombard', 'P', wx, wy); bo.x = wx; bo.y = wy;
    // the catapult SLID to valid land when it spawned — its own feet are
    // the one tile guaranteed dry, so the bombard's test stone lands there
    const cat = Units.spawn('catapult', 'P', 20, 20);
    const n0 = Combat.projectiles.length;
    Combat.launch(bo, cat.x, cat.y, { kind: 'bld', id: 0, dmg: 0 });
    Combat.launch(cat, cat.x + 2, cat.y, { kind: 'bld', id: 0, dmg: 0 });
    const pb = Combat.projectiles[n0], pc = Combat.projectiles[n0 + 1];
    ck('theBombardThreadsItsBlastTheCatapultDoesNot',
      pb && pb.fx === 'blast' && pb.kind === 'stone' && pc && pc.fx === null,
      JSON.stringify({ bombard: pb && pb.fx, catapult: pc && pc.fx }));
    // land the bombard's stone: the burst pools a shockwave + scorch
    R.blasts.length = 0; R.particles.length = 0;
    Combat.impact(pb);
    ck('aLandingStoneThrowsTheBigPoof',
      R.blasts.length === 1 && R.particles.length >= 40,
      R.blasts.length + ' blasts, ' + R.particles.length + ' particles');
    // water-aware: a stone into the sea sprays, it does not dust
    ck('aStoneOnLandScorches', R.blasts[0].wet === false, JSON.stringify(R.blasts[0]));
    R.impact(wx, wy, 'stone', 'blast');
    ck('theSeaSpraysWhereTheLandDusts', R.blasts[1] && R.blasts[1].wet === true,
      JSON.stringify(R.blasts[1]));
    for (let i = 0; i < 12; i++) R.impact(cat.x, cat.y, 'stone', 'blast');
    ck('theBlastPoolIsCapped', R.blasts.length <= 8, R.blasts.length + ' pooled');
    // an ordinary catapult stone still takes the old small burst, no pool entry
    R.blasts.length = 0; R.particles.length = 0;
    Combat.impact(pc);
    ck('theCatapultStoneStaysByteIdentical',
      R.blasts.length === 0 && R.particles.length > 0 && R.particles.length <= 16,
      R.blasts.length + ' blasts, ' + R.particles.length + ' particles');
    Combat.projectiles.length = 0;
    S.units = S.units.filter(z => z !== bo && z !== cat);
  }

  /* ---- 6. the big-box doctrine holds afloat: 48 with a sheet, native 32 without ---- */
  {
    const bo = Units.spawn('bombard', 'P', wx, wy); bo.x = wx; bo.y = wy;
    const key = R.unitArtKey(bo);
    // the real strips ship now, so the pre-art state is RECREATED for the
    // procedural check — remove whatever the loaders installed first
    Assets.removeUnitArt(key);
    ck('aProceduralHullDrawsAtItsNative32', R.unitBox(bo) === CFG.TILE, R.unitBox(bo) + 'px');
    const strip = mkStrip(4);
    for (const dir of Assets.UNIT_DIRS8)
      for (const pose of ['idle', 'walk', 'fight']) Assets.setUnitFrames(key, dir, pose, strip, G.tunicOf('P'));
    ck('aSheetedWorkingHullDrawsAt48', R.unitBox(bo) === 48, R.unitBox(bo) + 'px');
    const fb = Units.spawn('fishboat', 'P', wx, wy); fb.x = wx; fb.y = wy;
    ck('theFishingFleetStaysSmall', !Assets.UNIT_BOX.fishboat,
      'dozens per game — fat hulls would swallow the harbor');
    Assets.removeUnitArt(key);
    S.units = S.units.filter(z => z !== bo && z !== fb);
    // …and the shadow gate: every hull bakes its own water shadow
    ck('everyHullIsNaval',
      ['fishboat', 'transport', 'fireship', 'bombard'].every(k => !!CFG.UNITS[k].naval),
      'the drawUnitShadow gate keys on Units.isNaval');
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ok ' : 'FAIL ') + k + (v.length > 4 ? '  [' + v + ']' : ''));
if (errs.length) { console.log('\npage errors:'); for (const e of errs) console.log('  ' + e); }
await b.close();
if (out.fails.length || errs.length) { console.log('\n' + out.fails.length + ' failing'); process.exit(1); }
console.log('\nall naval plumbing holds');
