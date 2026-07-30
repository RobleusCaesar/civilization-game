/* BUILD-STAGES CONTRACT — a work site moves through THREE looks at exact 1/3
   intervals of its build (or upgrade) time, then the finished building
   appears:

     stage 0  GROUND BROKEN  — misc/construction1 (Big1 for the 2×2 hall)
     stage 1  THE RAISING    — the classic work-site art (construction /
              constructionBig / constructionBig3 by size and target level)
     stage 2  IN SCAFFOLD    — the target building's own sprite with the
              misc/scaffold (scaffoldBig) overlay drawn over it

   Upgrades wear the SAME three looks for now, but under their OWN sprite
   labels (misc/upgrade1, upgrade2, upgradeScaffold, upgradeBig1, upgradeBig2,
   upgradeBig2_3, upgradeScaffoldBig) so upgrade art can diverge per level
   later without touching the render plumbing. This file pins that aliasing —
   if the art diverges on purpose, update the check and say so in the commit.

   Run this after touching any of:
     buildings.js — Bld.stageOf
     render.js — the work-site branch of the building draw
     sprites.js — the construction/upgrade/scaffold sprite family
     ui.js — the building panel's work-site icon

     node tests/build-stages.mjs      # exits non-zero on any regression */
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

  // ---- 1. stage math: exact 1/3 intervals, construction and upgrade alike ----
  {
    G.newGame('bs1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const t = CFG.BUILDINGS.house.levels[0].time;
    const fake = (left) => ({ key: 'house', level: 1, construction: left, upgrading: 0 });
    ck('constructionThirds',
      Bld.stageOf(fake(t)) === 0 && Bld.stageOf(fake(t * 0.67)) === 0 &&
      Bld.stageOf(fake(t * 0.66)) === 1 && Bld.stageOf(fake(t * 0.34)) === 1 &&
      Bld.stageOf(fake(t * 0.33)) === 2 && Bld.stageOf(fake(0.0001)) === 2,
      't=' + t);
    const ut = CFG.BUILDINGS.barracks.levels[1].time;
    const fakeUp = (left) => ({ key: 'barracks', level: 1, construction: 0, upgrading: left, upgTotal: ut });
    ck('upgradeThirds',
      Bld.stageOf(fakeUp(ut)) === 0 && Bld.stageOf(fakeUp(ut * 0.5)) === 1 && Bld.stageOf(fakeUp(ut * 0.1)) === 2, '');
  }

  // ---- 2. the sprite family exists, and upgrades alias construction FOR NOW ----
  {
    const M = Sprites.misc;
    const need = ['construction1', 'construction', 'constructionBig1', 'constructionBig', 'constructionBig3',
      'scaffold', 'scaffoldBig', 'upgrade1', 'upgrade2', 'upgradeScaffold',
      'upgradeBig1', 'upgradeBig2', 'upgradeBig2_3', 'upgradeScaffoldBig'];
    const missing = need.filter(k => !M[k]);
    ck('spriteFamilyComplete', missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : '14 labels');
    const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
    ck('stageArtHasSubstance', px(M.construction1) > 400 && px(M.scaffold) > 300 && px(M.constructionBig1) > 1500 && px(M.scaffoldBig) > 1200, '');
    ck('upgradeAliasesConstructionForNow',
      M.upgrade1 === M.construction1 && M.upgrade2 === M.construction && M.upgradeScaffold === M.scaffold &&
      M.upgradeBig1 === M.constructionBig1 && M.upgradeBig2 === M.constructionBig &&
      M.upgradeBig2_3 === M.constructionBig3 && M.upgradeScaffoldBig === M.scaffoldBig,
      'same art, separate labels');
  }

  // ---- 3. the three stages RENDER as three genuinely different pictures ----
  {
    G.newGame('bs3', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.GRASS; S.map.explored[MapGen.idx(x, y)] = 1; }
    }
    S.units = [];
    const h = Bld.place('P', 'house', tc.x + 3, tc.y, { free: true });
    G.updateVisibility();
    R.centerOn(tc.x + 3.5, tc.y + 0.5);
    const t = CFG.BUILDINGS.house.levels[0].time;
    // spy on the real draw path: which work-site sprite keys does a full
    // frame request for this site at each stage?
    const keysAt = (setup) => {
      setup();
      const calls = [];
      const orig = Assets.drawSprite;
      Assets.drawSprite = function (g, key, x, y, o) { calls.push(key); return orig.call(Assets, g, key, x, y, o); };
      try { R.draw(0.016); } finally { Assets.drawSprite = orig; }
      return calls;
    };
    const k0 = keysAt(() => { h.construction = t * 0.9; });
    const k1 = keysAt(() => { h.construction = t * 0.5; });
    const k2 = keysAt(() => { h.construction = t * 0.1; });
    ck('threeDistinctStageDraws',
      k0.includes('misc/construction1') && !k0.includes('misc/construction') &&
      k1.includes('misc/construction') && !k1.includes('misc/construction1') &&
      k2.includes('misc/scaffold') && !k2.includes('misc/construction'),
      `stage0 ground-broken, stage1 raising, stage2 scaffold overlay`);
    // and an upgrade renders the staged looks under its OWN labels
    Bld.finish(h);
    h.upgTotal = CFG.BUILDINGS.house.levels[1].time;
    const u0 = keysAt(() => { h.upgrading = h.upgTotal * 0.9; });
    const u2 = keysAt(() => { h.upgrading = h.upgTotal * 0.1; });
    ck('upgradeStagesUseUpgradeLabels',
      u0.includes('misc/upgrade1') && u2.includes('misc/upgradeScaffold') &&
      !u0.includes('misc/construction1') && !u2.includes('misc/scaffold'),
      'misc/upgrade1 and misc/upgradeScaffold requested');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BUILD-STAGES CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
