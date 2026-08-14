/* BUILD-STAGES CONTRACT — a work site moves through THREE looks at exact 1/3
   intervals of its build (or upgrade) time, then the finished building
   appears. The looks are DERIVED (render.js padOf/siteOf/frameOf/partialOf)
   — from the footprint, the target TIER's materials and the TARGET SPRITE
   itself — never hand-drawn per key:

     stage 0  THE CLEARED SITE — trodden bare earth in the chocolate brown of
              the shipped yard art (R.SITE_EARTH), the plot staked and
              corded, Neolithic tools (wooden spade, antler pick, basket)
              and the tier's first deliveries (poles / fieldstone / drystone)
     stage 1  THE FRAMING — a lashed post-and-beam skeleton traced from the
              target sprite's own opaque silhouette (R._artBox); drystone
              piers at tier 3, a fieldstone footing at tier 2; roofed kinds
              sketch a ridge and rafters, worker plots and ground-level
              yards frame flat (R.stageRoof)
     stage 2  THE PARTIAL BUILD — the target sprite with its top erased
              above the wall line, pale fresh-cut ends along the break and
              post stubs above it

   Derivation is lazy and cached per target sprite (WeakMap), so PNG art
   that decodes late simply re-derives; the canvases carry the base's
   _cfArt so a PNG's stages land exactly where its finished art will.
   Bespoke `misc/<key>Build1..3` art still WINS the route — the TOWER keeps
   its authored three-sprite raising (and its Up2/3 masonry divergence), the
   DOCK keeps its four-facing jetty stages, the WONDER its shared masons'
   stages (tests/wonder.mjs) and wall/gate their oriented ghosts. The other
   thirteen bespoke sets are RETIRED — the derived stages serve every one.

   Run this after touching any of:
     buildings.js — Bld.stageOf
     render.js — padOf / siteOf / frameOf / partialOf / stageRoof / _artBox /
                 stageIcon / the work-site branch of the building draw
     sprites.js — the tower/dock stage art
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
  const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };

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

  /* ---- 2. THE DERIVED GENERATORS, measured on a synthetic sprite so the
     checks are taint-proof (a file:// PNG poisons getImageData) and fully
     controlled: a "building" with a known wall box and a known roof peak. ---- */
  {
    const mkBase = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#8a6a4a'; g.fillRect(12, 24, 40, 36);                       // walls x12..52, y24..60
      g.fillStyle = '#c8a058';
      g.beginPath(); g.moveTo(8, 26); g.lineTo(32, 6); g.lineTo(56, 26); g.fill();  // roof peaking at y6
      return c;
    };
    const base = mkBase();

    // the trodden pad: chocolate, footprint-scaled, cached
    const p1 = R.padOf(1), p2 = R.padOf(2);
    ck('padIsFootprintScaled', p1.width === 64 && p2.width === 128 && px(p2) > px(p1) * 2.5,
      px(p1) + ' / ' + px(p2) + ' opaque px');
    ck('padIsCached', R.padOf(1) === p1, '');
    {
      // trodden earth in the shipped yard art's CHOCOLATE, never tan/sandy —
      // warm (r above g above b) and dark enough to read as turned soil
      const d = p1.getContext('2d').getImageData(0, 0, 64, 64).data;
      let r = 0, g2 = 0, bl = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 96) { r += d[i]; g2 += d[i + 1]; bl += d[i + 2]; n++; }
      r /= n; g2 /= n; bl /= n;
      ck('thePadIsChocolateNotTan', r > g2 + 20 && g2 > bl + 15 && r < 180 && r > 90,
        'avg rgb ' + [r, g2, bl].map(v => v | 0).join(','));
    }

    // THE PLAN MATCHES THE BUILDING: a round kind breaks a round plot, a
    // squared kind a squared one as wide as its own art — never one blob
    ck('thePlanMatchesTheBuilding',
      R.padShape('house', 1).round === true && R.padShape('lodge', 1).round === false &&
      R.padOf(1, R.padShape('house', 1)).toDataURL() !== p1.toDataURL(), '');
    // …and the clearing is a morning's work, not a stamp: tongues of live
    // grass still stand inside the plan (erased holes in the decal)
    ck('aLittleGrassStillStands', px(p1) < 64 * 64 * 0.82, px(p1) + ' of ' + 64 * 64 + ' px');

    // the cleared site: pad + stakes/cord + tools + the tier's deliveries
    const s11 = R.siteOf('house', 1, 1), s13 = R.siteOf('house', 1, 3);
    const hPad = R.padOf(1, R.padShape('house', 1));           // the site's OWN plan
    ck('siteAddsTheToolsToThePad',
      s11.width === 64 && px(s11) > px(hPad) + 60, px(s11) - px(hPad) + ' prop px');
    ck('siteIsCachedPerKeySizeTier',
      R.siteOf('house', 1, 1) === s11 && s13 !== s11 && s13.toDataURL() !== s11.toDataURL(),
      'tier deliveries differ');
    ck('twoKindsSitesDiffer',
      R.siteOf('lodge', 1, 1).toDataURL() !== s11.toDataURL(), 'per-key seed');

    // the framing: traced from the base's own silhouette
    const f1 = R.frameOf(base, 1, true);
    ck('frameMatchesTheSprite', f1.width === 64 && f1.height === 64 && px(f1) > 150, px(f1) + ' px');
    ck('frameIsCached', R.frameOf(base, 1, true) === f1, '');
    {
      // every frame pixel stays inside the sprite's own bounding box (+outline)
      const d = f1.getContext('2d').getImageData(0, 0, 64, 64).data;
      let out2 = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++)
        if (d[(y * 64 + x) * 4 + 3] > 10 && (x < 5 || x > 59 || y < 3 || y > 63)) out2++;
      ck('theFrameTracesTheSilhouette', out2 === 0, out2 + ' stray px outside the bbox');
    }
    {
      // a roofed kind sketches ridge and rafters above the wall plate; a flat
      // one (yard / worker plot) does not
      const topOf = (c) => {
        const d = c.getContext('2d').getImageData(0, 0, 64, 64).data;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++)
          if (d[(y * 64 + x) * 4 + 3] > 10) return y;
        return 64;
      };
      const flat = R.frameOf(base, 1, false);
      ck('roofedFramesSketchTheRidge', topOf(f1) < topOf(flat) - 6,
        'roofed top y=' + topOf(f1) + ' vs flat y=' + topOf(flat));
    }
    {
      // tier materials: 2 adds a fieldstone footing, 3 builds drystone piers —
      // all three tiers are genuinely different pictures, and stone shows grey
      const f2 = R.frameOf(base, 2, true), f3 = R.frameOf(base, 3, true);
      const grey = (c) => {
        const d = c.getContext('2d').getImageData(0, 0, 64, 64).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i + 3] > 96 && Math.abs(d[i] - d[i + 1]) < 16 && Math.abs(d[i + 1] - d[i + 2]) < 18 && d[i] > 70) n++;
        return n;
      };
      ck('tierMaterialsDiffer',
        f1.toDataURL() !== f2.toDataURL() && f2.toDataURL() !== f3.toDataURL() &&
        grey(f2) > grey(f1) && grey(f3) > grey(f2),
        'grey px t1/t2/t3 = ' + grey(f1) + '/' + grey(f2) + '/' + grey(f3));
    }
    // stageRoof: worker plots and FIRE_AT ground keys frame flat, homes frame roofed
    ck('stageRoofKnowsTheYards',
      R.stageRoof('house', 1) === true && R.stageRoof('tc', 2) === true &&
      R.stageRoof('farm', 1) === false && R.stageRoof('lumber', 1) === false &&
      R.stageRoof('barracks', 1) === false && R.stageRoof('barracks', 3) === true, '');

    // the partial build: top erased above the wall line, pale cut ends, stubs
    const part = R.partialOf(base);
    const box = R._artBox(base);
    const cutY = Math.round((box.t + (box.b - box.t) * 0.45) * 64);
    {
      const d = part.getContext('2d').getImageData(0, 0, 64, 64).data;
      let above = 0, pale = 0;
      for (let y = 0; y < cutY - 8; y++) for (let x = 0; x < 64; x++)
        if (d[(y * 64 + x) * 4 + 3] > 10) above++;
      for (let y = cutY - 1; y < Math.min(64, cutY + 6); y++) for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        if (d[i + 3] > 96 && d[i] > 180 && d[i + 1] > 150) pale++;
      }
      const bottomPx = (c) => {
        const dd = c.getContext('2d').getImageData(0, 44, 64, 20).data;
        let n = 0; for (let i = 3; i < dd.length; i += 4) if (dd[i] > 10) n++;
        return n;
      };
      ck('partialErasesTheRoof', above === 0, above + ' px left above the cut');
      ck('partialKeepsTheWalls', bottomPx(part) >= bottomPx(base), '');
      ck('paleCutEndsAlongTheBreak', pale > 6, pale + ' pale px at the cut line');
      ck('partialIsCached', R.partialOf(base) === part, '');
    }
    {
      // the derived canvases carry the base's _cfArt, so a PNG's stages land
      // exactly where its finished art will (the darkOf/ruinOf rule)
      const marked = mkBase();
      marked._cfArt = { ox: 0, oy: 0, scale: 1 };
      ck('derivedStagesKeepTheAnchor',
        R.frameOf(marked, 1, true)._cfArt === marked._cfArt &&
        R.partialOf(marked)._cfArt === marked._cfArt, '');
    }
  }

  // ---- 3. the RENDER PATH: three genuinely different draws, target-level
  // art, upgrades derived from the level being built TOWARD ----
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
    // which derived generators (and which misc keys) does a full frame ask for?
    const stageCalls = (setup) => {
      setup();
      const got = { site: 0, frame: 0, partial: 0, keys: [] };
      const oS = R.siteOf, oF = R.frameOf, oP = R.partialOf, oA = Assets.drawSprite;
      R.siteOf = function (...a) { got.site++; return oS.apply(R, a); };
      R.frameOf = function (...a) { got.frame++; return oF.apply(R, a); };
      R.partialOf = function (...a) { got.partial++; return oP.apply(R, a); };
      Assets.drawSprite = function (g, key, ...rest) { got.keys.push(key); return oA.call(Assets, g, key, ...rest); };
      try { R.draw(0.016); } finally {
        R.siteOf = oS; R.frameOf = oF; R.partialOf = oP; Assets.drawSprite = oA;
      }
      return got;
    };
    const t = CFG.BUILDINGS.tc.levels[0].time || 1;
    const site = { id: 99871, key: 'tc', owner: 'P', x: tc.x + 3, y: tc.y, level: 1, hp: 100, construction: t, upgrading: 0 };
    S.buildings.push(site);
    const k0 = stageCalls(() => { site.construction = t * 0.9; });
    const k1 = stageCalls(() => { site.construction = t * 0.5; });
    const k2 = stageCalls(() => { site.construction = t * 0.1; });
    ck('threeDistinctStageDraws',
      k0.site === 1 && k0.frame === 0 && k0.partial === 0 &&
      k1.site === 0 && k1.frame === 1 && k1.partial === 0 &&
      k2.site === 0 && k2.frame === 0 && k2.partial === 1,
      'stage0 cleared site, stage1 framing, stage2 partial build');
    ck('theOldGenericLooksAreGone',
      !Sprites.misc.construction1 && !Sprites.misc.constructionBig && !Sprites.misc.scaffold &&
      !Sprites.misc.upgrade1 && !Sprites.misc.upgradeScaffoldBig &&
      [...k0.keys, ...k1.keys, ...k2.keys].every(k => !/^misc\/(construction|upgrade|scaffold)/.test(k)),
      'no generic construction/scaffold sprites exist or are requested');

    /* THE SEQUENCE NEVER RUNS BACKWARDS. Stages 1 and 2 derive from the
       level being built TOWARD. During an upgrade b.level is still the OLD
       level (it only increments in Bld.finishUpgrade), so deriving from it
       would frame and part-build the pre-upgrade building — the last
       pictures would look like the first. */
    const sprsAt = (setup) => {
      setup();
      const got = [];
      const orig = R.bldSprite;
      R.bldSprite = function (bb, lv) { const c = orig.call(R, bb, lv); if (bb.id === site.id) got.push(c); return c; };
      try { R.draw(0.016); } finally { R.bldSprite = orig; }
      return got;
    };
    const TC = Sprites.building.tc;
    site.level = 1; site.construction = 0;
    site.upgTotal = CFG.BUILDINGS.tc.levels[1].time || 1;
    const s2 = sprsAt(() => { site.upgrading = site.upgTotal * 0.1; });
    ck('upgradeStage2ShowsTargetLevel',
      s2.includes(TC[1]) && !s2.includes(TC[0]),
      'L1→L2: the partial NEW hall, never the old camp');
    site.level = 2; site.upgTotal = CFG.BUILDINGS.tc.levels[2].time || 1;
    const s3 = sprsAt(() => { site.upgrading = site.upgTotal * 0.1; });
    ck('upgradeStage2ShowsTargetLevelL3',
      s3.includes(TC[2]) && !s3.includes(TC[1]),
      'L2→L3: the partial stone keep, never the timber hall');
    // a FIRST raising still derives from the level actually being built
    site.level = 1; site.upgrading = 0;
    const s1 = sprsAt(() => { site.construction = t * 0.1; });
    ck('firstRaisingStage2ShowsOwnLevel', s1.includes(TC[0]), '');
    site.construction = 0; site.upgrading = 0;
    S.buildings.splice(S.buildings.indexOf(site), 1);

    // ---- 4. the WATCHTOWER'S bespoke stages still win the route: double-res
    // art, towerBuild1/2/3 requested (towerUp1..3 upgrading), the derived
    // generators never asked ----
    const M = Sprites.misc;
    const tNeed = ['towerBuild1', 'towerBuild2', 'towerBuild3', 'towerUp1', 'towerUp2', 'towerUp3'];
    const tMissing = tNeed.filter(k => !M[k]);
    ck('towerSpriteFamilyDoubleRes',
      tMissing.length === 0 && tNeed.every(k => M[k].width === 128),
      tMissing.length ? 'missing: ' + tMissing.join(',') : '6 labels at 128px');
    ck('towerStagesHaveSubstanceAndDiffer',
      px(M.towerBuild1) > 1500 && px(M.towerBuild2) > 2500 && px(M.towerBuild3) > 2500 &&
      M.towerBuild1.toDataURL() !== M.towerBuild2.toDataURL() &&
      M.towerBuild2.toDataURL() !== M.towerBuild3.toDataURL(), '');
    // upgrades diverge ON PURPOSE: same ground-breaking, then masonry (the
    // stone tiers the upgrade builds toward), not the level-1 wattle raising
    ck('towerUpgradeArtDiverges',
      M.towerUp1 === M.towerBuild1 &&
      M.towerUp2 !== M.towerBuild2 && M.towerUp2.toDataURL() !== M.towerBuild2.toDataURL() &&
      M.towerUp3 !== M.towerBuild3 && M.towerUp3.toDataURL() !== M.towerBuild3.toDataURL() &&
      px(M.towerUp2) > 2500 && px(M.towerUp3) > 2500,
      'towerUp2/3 are the masonry raisings');
    const tw = Bld.place('P', 'tower', tc.x - 3, tc.y, { free: true });
    G.updateVisibility();
    const tt = CFG.BUILDINGS.tower.levels[0].time;
    const w0 = stageCalls(() => { tw.construction = tt * 0.9; });
    const w1 = stageCalls(() => { tw.construction = tt * 0.5; });
    const w2 = stageCalls(() => { tw.construction = tt * 0.1; });
    ck('towerRendersBespokeStages',
      w0.keys.includes('misc/towerBuild1') && w1.keys.includes('misc/towerBuild2') &&
      w2.keys.includes('misc/towerBuild3') &&
      w0.site + w0.frame + w0.partial + w1.site + w1.frame + w1.partial + w2.site + w2.frame + w2.partial === 0,
      'towerBuild1/2/3 requested, derived generators never asked');
    Bld.finish(tw);
    tw.upgTotal = CFG.BUILDINGS.tower.levels[1].time;
    const tu0 = stageCalls(() => { tw.upgrading = tw.upgTotal * 0.9; });
    const tu2 = stageCalls(() => { tw.upgrading = tw.upgTotal * 0.1; });
    ck('towerUpgradeUsesTowerUpLabels',
      tu0.keys.includes('misc/towerUp1') && tu2.keys.includes('misc/towerUp3') &&
      !tu0.keys.includes('misc/towerBuild1'), 'misc/towerUp1 and misc/towerUp3 requested');
    tw.upgrading = 0;

    // ---- 5. the bespoke 1×1 sets are RETIRED; the derived route serves
    // every ordinary key. The dock and the tower alone keep authored stages. ----
    const RETIRED = ['house', 'lodge', 'barracks', 'stable', 'range', 'trade', 'siege',
      'sapper', 'warcamp', 'farm', 'quarry', 'lumber', 'mine'];
    const leftover = RETIRED.filter(k => M[k + 'Build1'] || M[k + 'Up1']);
    ck('bespokeSetsAreRetired', leftover.length === 0,
      leftover.length ? 'still present: ' + leftover.join(',') : '13 sets retired');
    ck('dockKeepsItsOwnRaising',
      !!M.dockBuild1 && !!Sprites.dockBuildFace && Sprites.dockBuildFace.n[0] === M.dockBuild1,
      'the jetty still stages in its own frame');
    // the house as witness: an ordinary key renders the derived stages
    const hh = Bld.place('P', 'house', tc.x - 3, tc.y + 2, { free: true });
    G.updateVisibility();
    const ht = CFG.BUILDINGS.house.levels[0].time;
    const h0 = stageCalls(() => { hh.construction = ht * 0.9; });
    const h2 = stageCalls(() => { hh.construction = ht * 0.1; });
    ck('houseRendersDerivedStages',
      h0.site >= 1 && h0.partial === 0 && h2.partial >= 1 && h2.site === 0 &&
      [...h0.keys, ...h2.keys].every(k => !/house(Build|Up)/.test(k)),
      'cleared site then partial build, no bespoke keys');
    Bld.finish(hh);

    // ---- 6. the PANEL ICON follows the same routing (ui.js asks R.stageIcon) ----
    const hFake = { id: 777, key: 'house', owner: 'P', x: 5, y: 5, level: 1, construction: ht * 0.9, upgrading: 0 };
    const icon0 = R.stageIcon(hFake);
    hFake.construction = ht * 0.1;
    const icon2 = R.stageIcon(hFake);
    ck('stageIconFollowsTheDerivedStages',
      icon0 === R.siteOf('house', Bld.size('house'), 1) &&
      icon2 === R.partialOf(R.bldSprite(hFake, 1)), '');
    const twFake = { id: 778, key: 'tower', owner: 'P', x: 5, y: 5, level: 1, construction: tt * 0.9, upgrading: 0 };
    ck('stageIconHonoursBespokeArt', R.stageIcon(twFake) === M.towerBuild1, '');
    const wlFake = { id: 779, key: 'wall', owner: 'P', x: 5, y: 5, level: 1, construction: 1, upgrading: 0 };
    const wIcon = R.stageIcon(wlFake);
    ck('aFortificationIconNeverBreaks', !!wIcon && !!wIcon.width,
      'derived from the straight-run preview, not the auto-tile mask');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BUILD-STAGES CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
