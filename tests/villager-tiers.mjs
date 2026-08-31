/* VILLAGER TIERS — PHASE 1 CONTRACT (the plumbing, before any art exists).
   A villager's appearance tier derives from its owner's Town Center level
   through a TABLE (Assets.VILLAGER_TIER_BY_TC), resolves per (faction,
   tier, gender) through the ONE sheet resolver (R.unitArtKey feeding
   R.sheetFrames — the sprite and the shadow gate can never disagree), and
   re-skins LIVE when a hall levels up (Bld.finishUpgrade drops the tier
   cache). Tier is derived, never stored: a loaded save recomputes. The
   recolor mechanism is DESIGNATED PALETTE KEYS: hand art is authored
   wearing the blue tunic's exact two-color ramp, swapped to the faction's
   rolled tunic at install (Assets.recolorTunic) — demonstrated here as
   LOSSLESS against the procedural cast itself, before any art is spent.

   Run after touching: render.js (villagerTier/unitArtKey/sheetFrames/
   unitSprite), assets.js (VILLAGER_TIER_BY_TC/TUNIC_KEY/recolorTunic/
   loadVillagerArt/setUnitFrames), buildings.js (finishUpgrade).

     node tests/villager-tiers.mjs      # exits non-zero on any regression */
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

  G.newGame('vt1', 'moderate', 'medium');
  Screens._demo = false; Screens.show('playing'); S.paused = true;

  /* ---- 1. tier follows the table, per faction, independently ---- */
  {
    R._vTier = null;
    ck('bothHallsOpenAtTierOne',
      R.villagerTier('P') === 1 && R.villagerTier('A') === 1, '');
    const tc = Bld.tcOf('P');
    tc.level = 2; R._vTier = null;
    ck('theTierFollowsTheHall',
      R.villagerTier('P') === 2 && R.villagerTier('A') === 1,
      'P hall at 2, the rival unmoved');
    tc.level = 3; R._vTier = null;
    ck('andTheThirdLevelIsTierThree', R.villagerTier('P') === 3, '');
    // the mapping is a TABLE, not an identity — tiers may lag the hall later
    const keep = Assets.VILLAGER_TIER_BY_TC;
    Assets.VILLAGER_TIER_BY_TC = { 1: 1, 2: 1, 3: 2 };
    R._vTier = null;
    ck('theMappingIsATableNotAnIdentity', R.villagerTier('P') === 2,
      'a lagging table reads through the same seam');
    Assets.VILLAGER_TIER_BY_TC = keep;
    tc.level = 1; R._vTier = null;
  }

  /* ---- 2. the resolver key: (faction, tier, gender) — and ONLY for villagers ---- */
  {
    const u = Units.spawn('villager', 'P', 10, 10); u.female = false;
    const uf = Units.spawn('villager', 'A', 12, 10); uf.female = true;
    ck('theKeyCarriesFactionTierAndGender',
      R.unitArtKey(u) === 'villager-p-l1-m' && R.unitArtKey(uf) === 'villager-a-l1-f',
      R.unitArtKey(u) + ' / ' + R.unitArtKey(uf));
    const d = Units.spawn('deer', 'W', 20, 20);
    ck('everyOtherKindIsItsOwnKey', R.unitArtKey(d) === 'deer', '');
    Bld.tcOf('P').level = 3; R._vTier = null;
    ck('theKeyMovesWithTheHall', R.unitArtKey(u) === 'villager-p-l3-m', R.unitArtKey(u));
    Bld.tcOf('P').level = 1; R._vTier = null;
    S.units = S.units.filter(z => z !== u && z !== uf && z !== d);
  }

  /* ---- 3. THE LIVE RE-SKIN: finishUpgrade re-dresses the map that frame ---- */
  {
    const u = Units.spawn('villager', 'P', 10, 10); u.female = false;
    const tc = Bld.tcOf('P');
    R._vTier = null;
    const before = R.unitArtKey(u);
    tc.upgrading = 0.001;              // mid-upgrade, one tick from done
    Bld.finishUpgrade(tc);             // the single choke point where a TC levels
    const after = R.unitArtKey(u);
    ck('theUpgradeReskinsTheLivingMap',
      before === 'villager-p-l1-m' && after === 'villager-p-l2-m',
      before + ' -> ' + after + ' with no respawn and no reload');
    tc.level = 1; R._vTier = null;
    S.units = S.units.filter(z => z !== u);
  }

  /* ---- 4. THE RECOLOR IS LOSSLESS — demonstrated on the procedural cast.
     The procedural red villager and the key-swapped blue villager must be
     THE SAME IMAGE: villagerSheet draws identical geometry with only the
     ramp colors differing, so recolorTunic(blue, 'red') === procedural
     red, pixel for pixel. This is the proof the palette-key mechanism
     survives hand-authored art without loss — settled before art is
     generated, exactly as ordered. ---- */
  {
    let identical = true, checked = 0, firstDiff = '';
    for (const pose of ['walk', 'idle', 'farm', 'guard']) {
      for (let f = 0; f < 2; f++) {
        const blue = Sprites.villager.blue[pose][f];
        const red = Sprites.villager.red[pose][f];
        const c = document.createElement('canvas');
        c.width = blue.width; c.height = blue.height;
        c.getContext('2d').drawImage(blue, 0, 0);
        Assets.recolorTunic(c, 'red');
        const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const rC = document.createElement('canvas');
        rC.width = red.width; rC.height = red.height;
        rC.getContext('2d').drawImage(red, 0, 0);
        /* both sides take the same put/getImageData round trip: the
           procedural frames carry SEMI-ALPHA outline ink, and canvas
           premultiplication re-rounds those bytes by ±1 on the way
           through — a harness artifact only. Shipped strips are hard
           binary alpha (the composer's contract), where the trip is
           exact. recolorTunic on the red set swaps nothing (no key
           pixels exist there) but rides the identical pipeline. */
        Assets.recolorTunic(rC, 'red');
        const r = rC.getContext('2d').getImageData(0, 0, rC.width, rC.height).data;
        checked++;
        for (let i = 0; i < a.length; i++) if (a[i] !== r[i]) {
          identical = false;
          if (!firstDiff) firstDiff = pose + '[' + f + '] byte ' + i;
          break;
        }
      }
    }
    ck('theRecolorIsLossless', identical && checked === 8,
      identical ? checked + ' frames byte-identical to the procedurally-drawn red set'
                : 'diverged at ' + firstDiff);
    // …and it touches ONLY the tunic ramp: recoloring twice is a no-op,
    // because after one pass the key colors no longer exist in the frame
    const c2 = document.createElement('canvas');
    const blue0 = Sprites.villager.blue.walk[0];
    c2.width = blue0.width; c2.height = blue0.height;
    c2.getContext('2d').drawImage(blue0, 0, 0);
    Assets.recolorTunic(c2, 'red');
    const once = c2.getContext('2d').getImageData(0, 0, c2.width, c2.height).data.slice();
    Assets.recolorTunic(c2, 'red');
    const twice = c2.getContext('2d').getImageData(0, 0, c2.width, c2.height).data;
    let same = true;
    for (let i = 0; i < once.length; i++) if (once[i] !== twice[i]) { same = false; break; }
    ck('theRecolorAppliesExactlyOnce', same,
      'a second pass changes nothing — the key ramp is gone after the first');
  }

  /* ---- 5. SPRITE AND SHADOW NEVER DISAGREE — by property, across the
     full variant probe set. Install a PARTIAL fake catalog (some variant
     keys, some directions, some poses — the mid-sprint reality), then for
     every (tier x gender x dir x pose) combo ask both questions and
     demand one answer: the shadow gate is open exactly when the sprite
     actually came from a sheet. ---- */
  {
    const installed = new Set();
    const fakeStrip = (frames) => {
      const c = document.createElement('canvas');
      c.width = 96 * frames; c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = '#123456'; g.fillRect(0, 0, c.width, c.height);
      return c;
    };
    // a deliberately ragged catalog: l2 male gets s+e walk, l2 female gets
    // s walk only, l3 male gets s idle only — everything else is absent
    Assets.setUnitFrames('villager-p-l2-m', 's', 'walk', fakeStrip(4));
    Assets.setUnitFrames('villager-p-l2-m', 'e', 'walk', fakeStrip(4));
    Assets.setUnitFrames('villager-p-l2-f', 's', 'walk', fakeStrip(4));
    Assets.setUnitFrames('villager-p-l3-m', 's', 'idle', fakeStrip(4));
    ['villager-p-l2-m', 'villager-p-l2-f', 'villager-p-l3-m'].forEach(k => installed.add(k));
    const u = Units.spawn('villager', 'P', 10, 10);
    const tc = Bld.tcOf('P');
    let agree = true, sheetHits = 0, probes = 0, firstBad = '';
    for (const lv of [1, 2, 3]) {
      tc.level = lv; R._vTier = null;
      for (const female of [false, true]) {
        u.female = female;
        for (const dir of Assets.UNIT_DIRS8) {
          R._faceMap && R._faceMap.delete && R._faceMap.delete(u);
          // pin facing by planting a fake displacement — unitFacing reads it
          u.path = null; u.pathI = 0;
          // probe every pose the villager can request
          for (const pose of ['idle', 'walk', 'gather', 'mine', 'farm', 'build', 'guard']) {
            probes++;
            const posed = { __proto__: u };            // cheap pose/facing override probe
            const realPose = R.unitPose; const realFace = R.unitFacing;
            R.unitPose = () => pose; R.unitFacing = () => dir;
            const gate = R.sheetUnit(u);
            const spr = R.unitSprite(u);
            R.unitPose = realPose; R.unitFacing = realFace;
            const key = 'villager-p-l' + R.villagerTier('P') + (female ? '-f' : '-m');
            const ua = Assets.unitArt[key];
            const fromSheet = !!ua && !!(ua.dirs[dir] || ua.dirs.s) && spr && spr.width === 96;
            if (gate !== fromSheet) {
              agree = false;
              if (!firstBad) firstBad = key + ' ' + dir + ' ' + pose + ' gate=' + gate + ' sheet=' + fromSheet;
            }
            if (gate) sheetHits++;
          }
        }
      }
    }
    ck('spriteAndShadowNeverDisagree', agree,
      agree ? probes + ' probes, ' + sheetHits + ' resolved to the fake sheets, gate agreed on every one'
            : 'first disagreement: ' + firstBad);
    ck('aPartialCatalogStillRenders', sheetHits > 0 && sheetHits < probes,
      sheetHits + '/' + probes + ' from sheets — the rest fell back with no error');
    tc.level = 1; R._vTier = null;
    for (const k of installed) Assets.removeUnitArt(k);
    S.units = S.units.filter(z => z !== u);
  }

  /* ---- 6. fps rides the VARIANT key — the procedural cast keeps its 4fps ---- */
  {
    const c = document.createElement('canvas');
    c.width = 96 * 12; c.height = 96;
    Assets.setUnitFrames('villager-p-l2-m', 's', 'walk', c);
    ck('sheetFpsRidesTheVariantKey',
      Sprites.animFps['villager-p-l2-m'] === Math.max(4, Math.round(12 / 0.9)) &&
      Sprites.animFps.villager === undefined,
      'variant at ' + Sprites.animFps['villager-p-l2-m'] + 'fps; the 2-frame procedural villager untouched');
    delete Sprites.animFps['villager-p-l2-m'];
    Assets.removeUnitArt('villager-p-l2-m');
  }

  /* ---- 7. tier is DERIVED: a loaded save recomputes, stores nothing ---- */
  {
    Cards.pick(0);
    const tc = Bld.tcOf('P');
    tc.level = 3;
    const json = G.saveJSON();
    ck('noTierRidesInTheSave', !/villagerTier|vTier/.test(json),
      'derived, never stored — old saves work untouched');
    G.loadJSON(json);
    ck('aLoadedSaveRecomputesFromItsHall', R.villagerTier('P') === 3,
      'tier 3 straight off the loaded Town Center');
  }

  /* ---- 8. nothing else moved: animals resolve exactly as before ---- */
  {
    const d = Units.spawn('deer', 'W', 20, 20);
    const bearBox = R.unitBox({ kind: 'bear' });
    ck('theAnimalsFeltNothing',
      R.unitArtKey(d) === 'deer' && bearBox === 48 && R.unitBox(d) === 32, '');
    S.units = S.units.filter(z => z !== d);
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1).replace(/[{}",]/g, ''));
if (errs.length) console.log('errors:', errs.slice(0, 6));
if (out.fails.length || errs.some(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_FILE_NOT_FOUND'))) {
  console.log('FAILURES:', out.fails.join(', ') || '(page errors)');
  process.exit(1);
}
console.log('ALL VILLAGER-TIER CHECKS PASS');
await b.close();
