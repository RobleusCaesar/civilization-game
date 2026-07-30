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

   THE WATCHTOWER is the first building with BESPOKE stage art: three
   double-res (128px, 64-cell fine grid) sprites of the tall tower going up —
   misc/towerBuild1 (the footing: staked plot, foundation trench, first plinth
   course), towerBuild2 (the shaft rising in its putlog scaffold under a rope
   windlass), towerBuild3 (the crown: lookout platform, railing and hoist at
   the wall-head). render.js routes b.key === 'tower' to these for ALL three
   stages — never the generic looks, never the scaffold overlay. Tower
   UPGRADES diverge on purpose: an upgrade lifts the tower toward its STONE
   tiers, so misc/towerUp2/3 climb in coursed masonry with dressed quoins,
   while towerBuild2/3 (the first raising, toward the wattle level-1 tower)
   climb in wattle-and-daub. Ground-breaking is shared (towerUp1 aliases
   towerBuild1).

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
    G.updateVisibility();
    R.centerOn(tc.x + 3.5, tc.y + 0.5);
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
    // the GENERIC three-stage path now serves the 2×2 hall (every 1×1
    // building has bespoke art) — a synthetic TC site pins it
    const t = CFG.BUILDINGS.tc.levels[0].time || 1;
    const site = { id: 99871, key: 'tc', owner: 'P', x: tc.x + 3, y: tc.y, level: 1, hp: 100, construction: t, upgrading: 0 };
    S.buildings.push(site);
    const k0 = keysAt(() => { site.construction = t * 0.9; });
    const k1 = keysAt(() => { site.construction = t * 0.5; });
    const k2 = keysAt(() => { site.construction = t * 0.1; });
    ck('threeDistinctStageDraws',
      k0.includes('misc/constructionBig1') && !k0.includes('misc/constructionBig') &&
      k1.includes('misc/constructionBig') && !k1.includes('misc/constructionBig1') &&
      k2.includes('misc/scaffoldBig') && !k2.includes('misc/constructionBig'),
      `stage0 ground-broken, stage1 raising, stage2 scaffold overlay (2×2 hall)`);
    // and an upgrade renders the staged looks under its OWN labels
    site.construction = 0;
    site.upgTotal = CFG.BUILDINGS.tc.levels[1].time || 1;
    const u0 = keysAt(() => { site.upgrading = site.upgTotal * 0.9; });
    const u2 = keysAt(() => { site.upgrading = site.upgTotal * 0.1; });
    ck('upgradeStagesUseUpgradeLabels',
      u0.includes('misc/upgradeBig1') && u2.includes('misc/upgradeScaffoldBig') &&
      !u0.includes('misc/constructionBig1') && !u2.includes('misc/scaffoldBig'),
      'misc/upgradeBig1 and misc/upgradeScaffoldBig requested');

    /* THE SEQUENCE NEVER RUNS BACKWARDS. Stage 2 shows the building being
       built TOWARD, standing in scaffold — the TARGET level's art. During an
       upgrade b.level is still the OLD level (it only increments in
       Bld.finishUpgrade), so drawing b.level here put the pre-upgrade
       building (the TC's level-1 camp) on screen AFTER stage 1 had already
       raised the new hall — the last picture looked like the first. */
    const sprsAt = (setup) => {
      setup();
      const got = [];
      const orig = R.bldSprite;
      R.bldSprite = function (bb, lv) { const c = orig.call(R, bb, lv); if (bb.id === site.id) got.push(c); return c; };
      try { R.draw(0.016); } finally { R.bldSprite = orig; }
      return got;
    };
    const TC = Sprites.building.tc;
    site.level = 1;
    const s2 = sprsAt(() => { site.construction = 0; site.upgrading = site.upgTotal * 0.1; });
    ck('upgradeStage2ShowsTargetLevel',
      s2.includes(TC[1]) && !s2.includes(TC[0]),
      'L1→L2: the NEW hall in scaffold, never the old camp');
    site.level = 2; site.upgTotal = CFG.BUILDINGS.tc.levels[2].time || 1;
    const s3 = sprsAt(() => { site.upgrading = site.upgTotal * 0.1; });
    ck('upgradeStage2ShowsTargetLevelL3',
      s3.includes(TC[2]) && !s3.includes(TC[1]),
      'L2→L3: the stone keep in scaffold, never the timber hall');
    // a FIRST raising still shows the level actually being built
    site.level = 1; site.upgrading = 0;
    const s1 = sprsAt(() => { site.construction = t * 0.1; });
    ck('firstRaisingStage2ShowsOwnLevel', s1.includes(TC[0]), '');
    site.construction = 0; site.upgrading = 0;
    S.buildings.splice(S.buildings.indexOf(site), 1);

    // ---- 4. the WATCHTOWER'S bespoke stages: double-res art, and the render
    // path requests towerBuild1/2/3 (towerUp1..3 upgrading) — never the
    // generic looks, never the scaffold overlay ----
    const M = Sprites.misc;
    const tNeed = ['towerBuild1', 'towerBuild2', 'towerBuild3', 'towerUp1', 'towerUp2', 'towerUp3'];
    const tMissing = tNeed.filter(k => !M[k]);
    ck('towerSpriteFamilyDoubleRes',
      tMissing.length === 0 && tNeed.every(k => M[k].width === 128),
      tMissing.length ? 'missing: ' + tMissing.join(',') : '6 labels at 128px');
    const px2 = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
    ck('towerStagesHaveSubstanceAndDiffer',
      px2(M.towerBuild1) > 1500 && px2(M.towerBuild2) > 2500 && px2(M.towerBuild3) > 2500 &&
      M.towerBuild1.toDataURL() !== M.towerBuild2.toDataURL() &&
      M.towerBuild2.toDataURL() !== M.towerBuild3.toDataURL(), '');
    // upgrades diverge ON PURPOSE: same ground-breaking, then masonry (the
    // stone tiers the upgrade builds toward), not the level-1 wattle raising
    ck('towerUpgradeArtDiverges',
      M.towerUp1 === M.towerBuild1 &&
      M.towerUp2 !== M.towerBuild2 && M.towerUp2.toDataURL() !== M.towerBuild2.toDataURL() &&
      M.towerUp3 !== M.towerBuild3 && M.towerUp3.toDataURL() !== M.towerBuild3.toDataURL() &&
      px2(M.towerUp2) > 2500 && px2(M.towerUp3) > 2500,
      'towerUp2/3 are the masonry raisings');
    const tw = Bld.place('P', 'tower', tc.x - 3, tc.y, { free: true });
    G.updateVisibility();
    const tt = CFG.BUILDINGS.tower.levels[0].time;
    const w0 = keysAt(() => { tw.construction = tt * 0.9; });
    const w1 = keysAt(() => { tw.construction = tt * 0.5; });
    const w2 = keysAt(() => { tw.construction = tt * 0.1; });
    ck('towerRendersBespokeStages',
      w0.includes('misc/towerBuild1') && !w0.includes('misc/construction1') &&
      w1.includes('misc/towerBuild2') && !w1.includes('misc/construction') &&
      w2.includes('misc/towerBuild3') && !w2.includes('misc/scaffold'),
      'towerBuild1/2/3 requested, generic keys not');
    Bld.finish(tw);
    tw.upgTotal = CFG.BUILDINGS.tower.levels[1].time;
    const tu0 = keysAt(() => { tw.upgrading = tw.upgTotal * 0.9; });
    const tu2 = keysAt(() => { tw.upgrading = tw.upgTotal * 0.1; });
    ck('towerUpgradeUsesTowerUpLabels',
      tu0.includes('misc/towerUp1') && tu2.includes('misc/towerUp3') &&
      !tu0.includes('misc/towerBuild1') && !tu2.includes('misc/upgradeScaffold'),
      'misc/towerUp1 and misc/towerUp3 requested');

    // ---- 5. EVERY 1×1 building raises its own way: a bespoke three-sprite
    // family at 128px each, three genuinely different stages, upgrades
    // aliased under their own <key>Up labels (tower's diverge; the rest
    // share art for now) ----
    const KEYS = ['house', 'lodge', 'barracks', 'stable', 'range', 'trade', 'siege',
      'sapper', 'warcamp', 'dock', 'farm', 'quarry', 'lumber'];
    const probs = [];
    for (const k of KEYS) {
      for (let i = 1; i <= 3; i++) {
        const c = M[k + 'Build' + i];
        if (!c) { probs.push(k + 'Build' + i + ' missing'); continue; }
        if (c.width !== 128) probs.push(k + 'Build' + i + ' not 128px');
        if (px2(c) < 1200) probs.push(k + 'Build' + i + ' too thin (' + px2(c) + 'px)');
        if (M[k + 'Up' + i] !== c) probs.push(k + 'Up' + i + ' not aliased');
      }
      if (M[k + 'Build1'] && M[k + 'Build2'] && M[k + 'Build3'] &&
        (M[k + 'Build1'].toDataURL() === M[k + 'Build2'].toDataURL() ||
          M[k + 'Build2'].toDataURL() === M[k + 'Build3'].toDataURL()))
        probs.push(k + ' stages not distinct');
    }
    ck('allBuildingsHaveBespokeStages', probs.length === 0,
      probs.length ? probs.slice(0, 6).join('; ') : KEYS.length + ' buildings × 3 stages, all 128px, all distinct, Up-aliased');
    // and the render path actually requests them — the house as witness
    const hh = Bld.place('P', 'house', tc.x - 3, tc.y + 2, { free: true });
    G.updateVisibility();
    const ht = CFG.BUILDINGS.house.levels[0].time;
    const h0 = keysAt(() => { hh.construction = ht * 0.9; });
    const h1 = keysAt(() => { hh.construction = ht * 0.5; });
    const h2 = keysAt(() => { hh.construction = ht * 0.1; });
    ck('houseRendersBespokeStages',
      h0.includes('misc/houseBuild1') && !h0.includes('misc/construction1') &&
      h1.includes('misc/houseBuild2') && !h1.includes('misc/construction') &&
      h2.includes('misc/houseBuild3') && !h2.includes('misc/scaffold'),
      'houseBuild1/2/3 requested, generic keys not');
    Bld.finish(hh);
    hh.upgTotal = CFG.BUILDINGS.house.levels[1].time;
    const hu0 = keysAt(() => { hh.upgrading = hh.upgTotal * 0.9; });
    ck('houseUpgradeUsesHouseUpLabels',
      hu0.includes('misc/houseUp1') && !hu0.includes('misc/upgrade1'), 'misc/houseUp1 requested');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BUILD-STAGES CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
