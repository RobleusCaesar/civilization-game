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
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
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
    const s = Units.spawn('rider', 'P', 16, 10);
    ck('unlistedKindsStayPlain', R.unitArtKey(s) === 'rider', '');
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
