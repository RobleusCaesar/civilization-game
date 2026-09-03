/* ARCHER LINE — PLUMBING CONTRACT (the code, before any art exists).
   Military sheet art rides the villager recolor law: neutral blue-key
   files install under {kind}-{p|a}-{tunic} (tunic IN the key), loaded by
   Assets.loadMilitaryArt and resolved by the same R.unitArtKey →
   R.sheetFrames seam. The kinds must NEVER appear in UNIT_ART (the boot
   probe would serve un-recolored blue art to both factions). Arrows are
   now traveling shafts: shots carry t0, a fumbled shot overshoots its
   mark deterministically, a fire arrow's expiry lights a capped ground
   flame (R.arrowStrike → R.arrowFires), and a ranged unit volleying a
   building from its own reach wears the fight pose.

   Run after touching: assets.js (MILITARY_ART/loadMilitaryArt),
   render.js (unitArtKey military branch, unitPose building gate,
   arrowStrike/arrowFires), combat.js (shot spawns, overshoot, expiry).

     node tests/archer-art.mjs      # exits non-zero on any regression */
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

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  G.newGame('aa1', 'moderate', 'medium');
  Screens._demo = false; Screens.show('playing'); S.paused = true;

  /* ---- 1. the key scheme: {kind}-{p|a}-{tunic}, and ONLY for listed kinds ---- */
  {
    const a = Units.spawn('archer', 'P', 10, 10);
    const l = Units.spawn('longbow', 'A', 12, 10);
    const m = Units.spawn('marksman', 'P', 14, 10);
    const tp = G.tunicOf('P'), ta = G.tunicOf('A');
    ck('theKeyCarriesKindFactionAndTunic',
      R.unitArtKey(a) === 'archer-p-' + tp &&
      R.unitArtKey(l) === 'longbow-a-' + ta &&
      R.unitArtKey(m) === 'marksman-p-' + tp,
      R.unitArtKey(a) + ' / ' + R.unitArtKey(l));
    // the control kind must stay OUTSIDE every art registry — 'rider'
    // joined MILITARY_ART with the stable line, so the barbarian stands in
    const s = Units.spawn('raider', 'R', 16, 10);
    ck('unlistedKindsStayPlain', R.unitArtKey(s) === 'raider', R.unitArtKey(s));
    S.units = S.units.filter(z => z !== a && z !== l && z !== m && z !== s);
  }

  /* ---- 2. the UNIT_ART trap stays shut: no military kind in the boot probe ---- */
  {
    const overlap = Object.keys(Assets.MILITARY_ART).filter(k => Assets.UNIT_ART[k]);
    ck('noMilitaryKindRidesTheBootProbe', overlap.length === 0,
      overlap.length ? 'overlap: ' + overlap.join(',') : 'the boot probe would install un-recolored blue art');
  }

  /* ---- 3. installed military frames recolor exactly like villagers ---- */
  {
    const strip = document.createElement('canvas');
    strip.width = 96 * 4; strip.height = 96;
    const sg = strip.getContext('2d');
    sg.fillStyle = Assets.TUNIC_KEY.body; sg.fillRect(0, 0, strip.width, 40);
    sg.fillStyle = Assets.TUNIC_KEY.accent; sg.fillRect(0, 40, strip.width, 40);
    Assets.setUnitFrames('archer-p-red', 's', 'fight', strip, 'red');
    const fr = Assets.unitArt['archer-p-red'].dirs.s.fight[0];
    const d = fr.getContext('2d').getImageData(0, 0, 1, 1).data;
    const want = Sprites.tunicCol.red.body;
    const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const wb = hx(want);
    ck('militaryFramesBakeTheTunicAtInstall',
      d[0] === wb[0] && d[1] === wb[1] && d[2] === wb[2],
      'key body → ' + want);
    Assets.removeUnitArt('archer-p-red');
  }

  /* ---- 4. a ranged unit volleying a building at reach wears the fight pose ---- */
  {
    const m = Units.spawn('marksman', 'P', 10, 10);
    const tc = Bld.tcOf('A');
    m.tBld = tc.id; m.path = null;
    // stand at the marksman's own rng (5) minus a hair from the hall's centre
    const reach = Bld.reach(tc);
    m.x = Bld.cx(tc) - (5 + reach - 0.2); m.y = Bld.cy(tc);
    const poseFar = R.unitPose(m);
    // …and a melee axeman at the same spot still reads as walking up
    const s = Units.spawn('axeman', 'P', m.x, m.y);
    s.tBld = tc.id; s.path = null;
    const poseMelee = R.unitPose(s);
    ck('rangedVolleysWearTheFightPose', poseFar === 'fight', 'marksman at rng: ' + poseFar);
    ck('meleeStillClosesOnFoot', poseMelee !== 'fight', 'soldier at 5 tiles: ' + poseMelee);
    m.tBld = 0; s.tBld = 0;
    S.units = S.units.filter(z => z !== m && z !== s);
  }

  /* ---- 5. shots carry t0; a fumble overshoots deterministically ---- */
  {
    const sh = { x1: 0, y1: 0, x2: 3, y2: 4, t: 0.24, t0: 0.24 };
    Combat.overshoot(sh);
    // 3-4-5 triangle: +0.9 along the unit vector (0.6, 0.8)
    ck('theOvershootIsDeterministic',
      Math.abs(sh.x2 - 3.54) < 1e-9 && Math.abs(sh.y2 - 4.72) < 1e-9 && sh.miss === true,
      sh.x2.toFixed(3) + ',' + sh.y2.toFixed(3));
  }

  /* ---- 5b. the sword slash: sword kinds only, capped, render-side ---- */
  {
    R.slashes.length = 0;
    const e = Units.spawn('elite', 'P', 30, 30);
    const d = Units.spawn('defender', 'P', 30.4, 30.4);
    const v = Units.spawn('brute', 'R', 30.9, 30); v.hp = 9999;
    // the strike tick: cd expired, standing in range
    e.tUnit = v.id; d.tUnit = v.id; e.cd = 0; d.cd = 0;
    const before = R.slashes.length;
    Combat.update(0.02);
    ck('onlyTheSwordDrawsBlood', R.slashes.length === before + 1,
      'elite + defender struck together, ' + (R.slashes.length - before) + ' slash(es)');
    for (let i = 0; i < 30; i++) R.meleeSlash(30, 30, 31, 30);
    ck('theSlashPoolIsCapped', R.slashes.length <= 10, R.slashes.length + ' held of 30+');
    R.slashes.length = 0;
    e.tUnit = 0; d.tUnit = 0;
    S.units = S.units.filter(z => z !== e && z !== d && z !== v);
  }

  /* ---- 5d. a fighter FACES what it fights: combat facing derives from
     the live target (unit or building), not the last displacement ---- */
  {
    const strip = document.createElement('canvas');
    strip.width = 96 * 4; strip.height = 96;
    strip.getContext('2d').fillRect(0, 0, strip.width, strip.height);
    for (const dir of Assets.UNIT_DIRS8)
      for (const pose of ['idle', 'walk', 'fight'])
        Assets.setUnitFrames('elite-p-' + G.tunicOf('P'), dir, pose, strip, G.tunicOf('P'));
    // spawn SLIDES to valid ground — position explicitly after spawning
    const e = Units.spawn('elite', 'P', 40, 40); e.x = 40; e.y = 40; e.path = null;
    const foe = Units.spawn('brute', 'R', 41, 40); foe.hp = 9999; foe.x = 41; foe.y = 40;
    e.tUnit = foe.id;
    R._faceMap.set(e, { x: e.x, y: e.y, dir: 's' });   // displacement says south
    const key = 'elite-p-' + G.tunicOf('P');
    const ua = Assets.unitArt[key];
    const resolveDir = () => {
      const fr = R.sheetFrames(e);
      for (const dk in ua.dirs) for (const pk in ua.dirs[dk]) if (ua.dirs[dk][pk] === fr) return dk + '.' + pk;
      return null;
    };
    const east = resolveDir();                          // foe due east
    foe.x = 40; foe.y = 39;                             // foe circles due north
    const north = resolveDir();
    ck('aFighterFacesItsFoe', east === 'e.fight' && north === 'n.fight',
      east + ' then ' + north + ' as the foe circles');
    const atc = Bld.tcOf('A');
    e.tUnit = 0; e.tBld = atc.id;
    // stand just inside the melee building gate, read from the real reach
    e.x = Bld.cx(atc) - (1.5 + Bld.reach(atc) - 0.2); e.y = Bld.cy(atc);
    const atWall = resolveDir();
    ck('aBattererSquaresUpToTheWall', atWall === 'e.fight', atWall + ' vs the hall due east');
    // …and the melee batterer LEANS to the wall; a ranged one never does
    const lean = R.workLean(e);
    const m = Units.spawn('marksman', 'P', e.x, e.y); m.tBld = e.tBld;
    ck('theBattererLeansTheArcherDoesNot', !!lean && R.workLean(m) === null,
      lean ? 'melee leans ' + Math.hypot(lean.x - e.x, lean.y - e.y).toFixed(2) : 'no melee lean');
    e.tBld = 0; m.tBld = 0;
    Assets.removeUnitArt(key);
    S.units = S.units.filter(z => z !== e && z !== foe && z !== m);
  }

  /* ---- 5e. the SAPPER: tiers by its camp, four crafts by job, faces
     its tile (physics-first), and the procedural rig folds the four
     crafts back onto its 'work' swing ---- */
  {
    const sp = Units.spawn('sapper', 'P', 20, 20); sp.x = 20.5; sp.y = 20.5; sp.path = null;
    ck('theSapperTiersByItsCamp', R.sapperTier('P') === 1 && R.unitArtKey(sp) === 'sapper-p-' + G.tunicOf('P') + '-l1',
      R.unitArtKey(sp));
    // a finished camp at level 3 lifts the tier once the cache drops
    const camp = { id: 999901, key: 'sapper', owner: 'P', x: 5, y: 5, level: 3, hp: 560, maxhp: 560, construction: 0, upgrading: 0 };
    S.buildings.push(camp);
    R._sTier = null;
    ck('aLeveledCampReskinsTheCorps', R.sapperTier('P') === 3 && R.unitArtKey(sp).endsWith('-l3'), R.unitArtKey(sp));
    S.buildings = S.buildings.filter(b => b !== camp); R._sTier = null;
    // the four crafts, by job — and bridgeup shares the bridge craft
    const poses = {};
    for (const job of ['dig', 'bridge', 'bridgeup', 'clear', 'mound']) {
      sp.task = { type: 'terraform', job, x: 21, y: 20, sx: 20, sy: 20 };
      poses[job] = R.unitPose(sp);
    }
    ck('fourCraftsByJob',
      poses.dig === 'dig' && poses.bridge === 'bridge' && poses.bridgeup === 'bridge' &&
      poses.clear === 'clear' && poses.mound === 'mound', JSON.stringify(poses));
    // facing: the tile due EAST resolves the e sheet, un-clamped physics
    const skey = R.unitArtKey(sp);
    const strip = document.createElement('canvas');
    strip.width = 96 * 4; strip.height = 96;
    strip.getContext('2d').fillRect(0, 0, strip.width, strip.height);
    for (const dir of ['s', 'e', 'n', 'w']) Assets.setUnitFrames(skey, dir, 'dig', strip, G.tunicOf('P'));
    Assets.setUnitFrames(skey, 's', 'walk', strip, G.tunicOf('P'));
    sp.task = { type: 'terraform', job: 'dig', x: 21, y: 20, sx: 20, sy: 20 };
    R._faceMap.set(sp, { x: sp.x, y: sp.y, dir: 's' });
    const ua = Assets.unitArt[skey];
    let fr = R.sheetFrames(sp), hitE = null;
    for (const dk in ua.dirs) for (const pk in ua.dirs[dk]) if (ua.dirs[dk][pk] === fr) hitE = dk + '.' + pk;
    sp.task.x = 20; sp.task.y = 19;                    // tile due NORTH: physics wins
    fr = R.sheetFrames(sp); let hitN = null;
    for (const dk in ua.dirs) for (const pk in ua.dirs[dk]) if (ua.dirs[dk][pk] === fr) hitN = dk + '.' + pk;
    ck('theSapperFacesItsTile', hitE === 'e.dig' && hitN === 'n.dig', hitE + ' / ' + hitN);
    Assets.removeUnitArt(skey);
    sp.task = null;
    S.units = S.units.filter(z => z !== sp);
  }

  /* ---- 6. fire-arrow strikes pool, capped, and drain on expiry ---- */
  {
    R.arrowFires.length = 0;
    for (let i = 0; i < 30; i++) R.arrowStrike(20 + i * 0.1, 20);
    ck('theGroundFirePoolIsCapped', R.arrowFires.length === 12,
      R.arrowFires.length + ' of 30 strikes held');
    // a fire shot's expiry routes through arrowStrike via the combat tick
    R.arrowFires.length = 0;
    Combat.shots.length = 0;
    Combat.shots.push({ x1: 0, y1: 0, x2: 2, y2: 2, t: 0.01, t0: 0.24, fire: true });
    Combat.update(0.05);
    ck('aFireArrowsExpiryLightsTheGround',
      R.arrowFires.length === 1 && Combat.shots.length === 0,
      R.arrowFires.length + ' fire(s) after the tick');
    R.arrowFires.length = 0;
  }

  return { res, fails };
});

await b.close();
for (const [k, v] of Object.entries(out.res)) console.log(' ' + k + ': ' + v);
console.log('errors:', JSON.stringify(errs.filter(e => !/net::ERR_FILE_NOT_FOUND/.test(e))));
if (out.fails.length || errs.filter(e => !/net::ERR_FILE_NOT_FOUND/.test(e)).length) {
  console.error('ARCHER-ART CHECKS FAILED:', out.fails.join(', '));
  process.exit(1);
}
console.log('ALL ARCHER-ART CHECKS PASS');
