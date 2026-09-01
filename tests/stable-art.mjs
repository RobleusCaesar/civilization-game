/* STABLE LINE — PLUMBING CONTRACT. The three cavalry kinds ride
   MILITARY_ART exactly like the foot soldiers: keys {kind}-{p|a}-{tunic},
   the saddle cloth and tunic carry the key ramp, non-P/A owners never
   build a dyed key, and no cavalry kind may enter UNIT_ART (the boot
   probe would serve blue to both factions). Nothing else is special —
   cavalry are ordinary military units with idle/walk/fight sheets, the
   horse archer's arrows ride the existing traveling-shaft grammar, and
   combat facing tracks the live target like every land fighter.

   Run after touching: assets.js (MILITARY_ART cavalry rows),
   render.js (unitArtKey), config.js (stable unit defs).

     node tests/stable-art.mjs      # exits non-zero on any regression */
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

  /* ---- 1. the registries: three cavalry kinds, dyed, full pose lists ---- */
  {
    ck('theStableRidesMilitaryArt',
      JSON.stringify(Assets.MILITARY_ART.rider) === '["idle","walk","fight"]' &&
      JSON.stringify(Assets.MILITARY_ART.horsearcher) === '["idle","walk","fight"]' &&
      JSON.stringify(Assets.MILITARY_ART.lancer) === '["idle","walk","fight"]',
      JSON.stringify({ r: Assets.MILITARY_ART.rider, l: Assets.MILITARY_ART.lancer }));
    const overlap = Object.keys(Assets.MILITARY_ART).filter(k => Assets.UNIT_ART[k]);
    ck('noCavalryRidesTheBootProbe', overlap.length === 0,
      overlap.length ? 'overlap: ' + overlap.join(',') : '');
    const r = Units.spawn('rider', 'P', 20, 20);
    const l = Units.spawn('lancer', 'A', 22, 20);
    const h = Units.spawn('horsearcher', 'P', 24, 20);
    ck('theCavalryWearsTheVillageCloth',
      R.unitArtKey(r) === 'rider-p-' + G.tunicOf('P') &&
      R.unitArtKey(l) === 'lancer-a-' + G.tunicOf('A') &&
      R.unitArtKey(h) === 'horsearcher-p-' + G.tunicOf('P'),
      [R.unitArtKey(r), R.unitArtKey(l)].join(' / '));
    l.owner = 'R';
    ck('aStrangersHorseNeverWearsYourColours', R.unitArtKey(l) === 'lancer', R.unitArtKey(l));
    l.owner = 'A';
    // the operator's ruling reversed the first cut: a 32-box horseman read
    // as a midget on a pony beside his own footmen — cavalry rides at 48
    ck('cavalryTakesTheBigBox',
      Assets.UNIT_BOX.rider === 48 && Assets.UNIT_BOX.horsearcher === 48 && Assets.UNIT_BOX.lancer === 48,
      'horse and rider stand taller than infantry');
    /* ---- 2. the horse archer is honest ranged cavalry ---- */
    ck('theHorseArcherShootsFromTheSaddle',
      CFG.UNITS.horsearcher.rng === 3 && !CFG.UNITS.horsearcher.proj,
      'rng ' + CFG.UNITS.horsearcher.rng + ' through the traveling-shaft grammar');
    S.units = S.units.filter(z => z !== r && z !== l && z !== h);
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ok ' : 'FAIL ') + k + (v.length > 4 ? '  [' + v + ']' : ''));
if (errs.length) { console.log('\npage errors:'); for (const e of errs) console.log('  ' + e); }
await b.close();
if (out.fails.length || errs.length) { console.log('\n' + out.fails.length + ' failing'); process.exit(1); }
console.log('\nall stable plumbing holds');
