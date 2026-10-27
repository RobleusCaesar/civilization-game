/* THE DRAGON AND THE KRAKEN (js/beasts.js) — the monsters' drawn selves.

   This file pins:

     THE ART LANDS     the four strips are declared in Assets.FX_SETS under
                       the special events' own names (so the rolled event's
                       wantFx asks for them), they are on disk at the frame
                       counts the drawing reads, and they load and slice
     EVERY BEAT DRAWS  the dragon flying in, breathing and leaving, the kraken
                       rising, thrashing and sinking, both facings, on the
                       art and on the procedural fallback, without a throw
     A PICTURE ONLY    drawing them writes nothing into S (the act, the save)
                       and draws nothing from the run's RNG
     THE JAWS          the breath is drawn from the dragon's jaws to the line
                       of fire the act lays: the jaws hang just behind it,
                       facing either way
     OPEN WATER        the kraken comes up where the water is, not on the
                       shore it reaches across, and within a tentacle's reach
                       of its prey
     THEY ARE HEARD    a roar, a breath, the deep's groan and the slam

   Run after touching: js/beasts.js, the dragon/kraken blocks of R.draw,
   Assets.FX_SETS, G.dragonTick / G.krakenTick's phases.

     node tests/beasts.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---------------- 0. the files themselves (no browser) ----------------
{
  const want = { 'dragon-fly': [8, 256], 'dragon-breath': [9, 256], 'kraken-thrash': [8, 224], 'kraken-tentacle': [13, 160] };
  const bad = [];
  for (const [name, [n, f]] of Object.entries(want)) {
    const p = join(root, 'assets/fx', name + '.png');
    if (!fs.existsSync(p)) { bad.push(name + ' missing'); continue; }
    const b = fs.readFileSync(p), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (h !== f || w !== f * n) bad.push(`${name} ${w}x${h} (want ${f * n}x${f})`);
  }
  ck('theStripsAreOnDiskAtTheirFrameCounts', !bad.length, bad.join('; '));
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Beasts, null, { timeout: 120000 });
await p.evaluate(() => { Boot.force(); Screens._demo = false; G.newGame('beasts', 'moderate', 'medium'); S.paused = true; });

// ---------------- 1. declared and loaded ----------------
{
  const decl = await p.evaluate(() => ({
    d: JSON.stringify(Assets.FX_SETS.dragon), k: JSON.stringify(Assets.FX_SETS.kraken),
  }));
  ck('theRolledEventAsksForItsOwnArt', decl.d === '["dragon-fly","dragon-breath"]' && decl.k === '["kraken-thrash","kraken-tentacle"]', JSON.stringify(decl));
  await p.evaluate(() => { Assets.wantFx('dragon'); Assets.wantFx('kraken'); });
  const ok = await p.waitForFunction(() => ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'].every(n => Assets.fxFrames(n)), null, { timeout: 60000 }).then(() => true, () => false);
  const n = await p.evaluate(() => ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'].map(k => (Assets.fxFrames(k) || []).length).join(','));
  ck('andTheStripsLoadAndSlice', ok && n === '8,9,8,13', n);
}

// ---------------- 2. every beat draws, art or not; a picture only ----------------
{
  const r = await p.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 900;
    const g = cv.getContext('2d');
    const tc = Bld.tcOf('P');
    const errs = [];
    const before = S.rngState;
    const dragonAt = (phase, t, dir) => ({ avail: false, done: true, ash: [], fire: [{ x: tc.x + 3, y: tc.y + 2, ttl: 3, seed: 5 }],
      ev: { phase, t, x: tc.x + 2, y: tc.y + 2, tx: tc.x + 4, ty: tc.y + 2, dir, victims: [], card: phase === 'leave' ? { x: tc.x + 2, y: tc.y + 2 } : null } });
    const w = MapGen.findNear(tc.x, tc.y, 60, (x, y) => G.openWaterAt(x, y)) || { x: tc.x, y: tc.y };
    const krakenAt = (phase, t) => ({ ev: { phase, t, x: w.x + 0.5, y: w.y + 0.5, boatId: -1, owner: 'P' } });
    const drawAll = () => {
      for (const dir of [1, -1]) for (const [ph, ts] of [['fly', [0, 0.2, 0.6, 1.2]], ['burn', [0, 0.2, 0.5, 1.0, 1.6]], ['leave', [0, 0.5, 1.4]]]) for (const t of ts) {
        S.dragon = dragonAt(ph, t, dir);
        const snap = JSON.stringify(S.dragon);
        g.save(); try { R.drawDragonAct(g, 1 / 60); if (R.drawFireTongue) R.drawFireTongue(g, S.dragon.fire[0], 1, 1); } catch (e) { errs.push('dragon ' + ph + t + ': ' + e.message); } g.restore();
        if (JSON.stringify(S.dragon) !== snap) errs.push('dragon act written by its picture (' + ph + ' ' + t + ')');
      }
      for (const [ph, ts] of [['rise', [0, 0.4, 1.0, 1.55]], ['thrash', [0, 0.3, 1.2, 2.1]], ['sink', [0, 0.6, 1.5]]]) for (const t of ts) {
        S.kraken = krakenAt(ph, t);
        const snap = JSON.stringify(S.kraken);
        g.save(); try { R.drawKrakenAct(g, 1 / 60); } catch (e) { errs.push('kraken ' + ph + t + ': ' + e.message); } g.restore();
        if (JSON.stringify(S.kraken) !== snap) errs.push('kraken act written by its picture (' + ph + ' ' + t + ')');
      }
    };
    G.freeVis = true;
    for (let i = 0; i < CFG.W * CFG.H; i++) S.map.explored[i] = 1;
    G.updateVisibility && G.updateVisibility();
    drawAll();
    const withArt = errs.length;
    // …and on the procedural fallback, with the strips taken away
    const kept = {};
    for (const n of ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle']) { kept[n] = Assets.fx[n]; delete Assets.fx[n]; Assets._fxAsked[n] = true; }
    drawAll();
    Object.assign(Assets.fx, kept);
    S.dragon.ev = null; S.kraken.ev = null;
    return { errs, withArt, rng: S.rngState === before };
  });
  ck('everyBeatOfBothBeastsDraws', r.errs.length === 0, r.errs.slice(0, 4).join(' | '));
  ck('andTheFallbackDrawsWithoutTheArt', r.errs.length === 0 && r.withArt === 0, 'errors with art ' + r.withArt + ', in all ' + r.errs.length);
  ck('aPictureDrawsNothingFromTheRunsRng', r.rng);
}

// ---------------- 3. the jaws hang over the line of fire ----------------
{
  const r = await p.evaluate(() => {
    const C = Beasts.DRAGON, TL = CFG.TILE, out = [];
    for (const dir of [1, -1]) {
      // the drawing's own arithmetic at the bottom of the dive (alt = altLow, scale = scaleLow)
      const x = 20, back = (C.reach - C.lead) * TL - C.mouth[0] * C.scaleLow;
      const jaws = (x * TL + dir * back + dir * C.mouth[0] * C.scaleLow) / TL;
      const land = x + dir * C.reach;               // where G.dragonTick lays its fire line
      out.push({ dir, behind: (land - jaws) * dir });
    }
    return out;
  });
  ck('theJawsHangJustBehindTheLineOfFire', r.every(o => o.behind > 0.3 && o.behind < 1.6), JSON.stringify(r));
}

// ---------------- 4. the kraken comes up in open water ----------------
{
  const r = await p.evaluate(() => {
    // a lake built by hand: a wide sea to the east of a long north-south shore
    const W = CFG.W;
    for (let y = 2; y < CFG.H - 2; y++) for (let x = 2; x < W - 2; x++) S.map.terrain[y * W + x] = x >= 20 ? T.WATER : T.GRASS;
    G._wb = null;
    const prey = { x: 20.5, y: 20.5 };                // a boat hugging the shore
    const at = R.krakenBodyAt(prey.x, prey.y);
    let n = 0, m = 0;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { if (ox * ox + oy * oy > 4.5) continue; m++; if (G.wetAt(at.x + ox, at.y + oy)) n++; }
    return { at, wet: n / m, reach: Math.hypot(at.x - prey.x, at.y - prey.y) };
  });
  ck('theKrakenComesUpInOpenWater', r.wet >= 0.9 && r.at.x > 20.5, JSON.stringify(r));
  ck('withinATentaclesReachOfItsPrey', r.reach <= 3.05, 'reach ' + r.reach.toFixed(2));
}

// ---------------- 5. they are heard ----------------
{
  const r = await p.evaluate(() => ['roar', 'breath', 'kraken', 'splash'].map(k => typeof Sound._VOICES[k] === 'function' && Sound.GAP[k] > 0));
  ck('theMonstersAreHeard', r.every(Boolean), JSON.stringify(r));
}

// ---------------- 6. the real frame, with both acts live ----------------
{
  await p.evaluate(() => {
    G.newGame('beasts-live', 'moderate', 'medium'); Screens.show('playing');
    const tc = Bld.tcOf('P');
    S.dragon = { avail: false, done: true, ash: [], fire: [], ev: { phase: 'fly', t: 0, x: tc.x - 10, y: tc.y + 2, tx: tc.x + 3, ty: tc.y + 2, dir: 1, victims: [] } };
  });
  // in, down, the breath, and away — the frame draws every beat of it
  const seen = await p.evaluate(() => new Promise(done => {
    const ph = new Set(), t0 = performance.now();
    const tick = () => {
      if (S.dragon.ev) ph.add(S.dragon.ev.phase);
      if ((!S.dragon.ev && ph.size) || performance.now() - t0 > 12000) return done([...ph].join(','));
      requestAnimationFrame(tick);
    };
    tick();
  }));
  ck('aLiveDragonFliesItsActInTheRealFrame', seen === 'fly,burn,leave' && errs.length === 0, 'phases ' + seen + ', errors ' + errs.slice(0, 3).join(' | '));
}

await b.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (errs.length) console.log('page errors:', errs.slice(0, 5));
if (fails.length || errs.length) { console.log(`\n${fails.length} FAILURE(S)`); process.exit(1); }
console.log('\nall beast checks pass');
