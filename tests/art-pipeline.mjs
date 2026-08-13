/* ART PIPELINE CONTRACT — hand-authored PNGs land by FILENAME ALONE
   (ART_PLAN.md). What this pins:

   1. CONVENTION, NOT MANIFEST. assets/manifest.js is gone; the loader tries
      assets/buildings/{id}-l{level}.png for every valid slot at startup. The
      shipped hall art (tc-l1..3) loads through the convention into BOTH
      tribes' tables; a slot with no file keeps its procedural drawable and
      records the miss. Filenames are ALWAYS lowercase (Pages is
      case-sensitive) and every URL carries the ?v= cache-buster.

   2. ONE ANCHORING RULE. R.artRect: bottom-center on the footprint, scaled
      to footprint width, aspect preserved, tall art overhangs UPWARD; the
      sidecar's offsetX/offsetY (footprint fractions) and scale apply on
      top. blitBld routes every _cfArt drawable through it, and the burn
      variants (darkOf/ruinOf) carry the marker so a burning PNG building
      keeps its anchor. A dock PNG overrides all four shore orientations.

   3. THE ?dev=1 PREVIEW IS THE SHIPPING PATH. Without the flag: no panel,
      no listeners, zero behavior change. With it: filename inference is
      case-normalized and never guesses (unknown names go to a picker),
      injection lands through Assets.setBuildingArt (the startup path), and
      revert restores the SHIPPED state — procedural, or the shipped PNG.

   Run after touching: js/assets.js, js/dev.js, R.blitBld / R.artRect /
   R.bldSprite, UI.iconInto.

     node tests/art-pipeline.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();

const res = {}, fails = [];
const merge = (out) => { Object.assign(res, out.res); fails.push(...out.fails); };

// ---------- pass 1: the player page (no dev flag) ----------
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  // give the convention loader time to resolve the shipped PNGs / 404s
  await p.waitForFunction(() => window.Assets && Assets.art['tc-l1'] !== undefined &&
    Assets.art['house-l1'] !== undefined, null, { timeout: 8000 }).catch(() => {});
  const out = await p.evaluate(() => {
    const res = {}, fails = [];
    const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

    // ---- 1. the manifest is gone; the convention enumerates the slots ----
    ck('manifestIsGone', window.ASSET_MANIFEST === undefined, '');
    const slots = Assets.artSlots();
    const names = slots.map(s => Assets.artName(s.id, s.lv));
    ck('conventionCoversTheTown',
      names.includes('tc-l3.png') && names.includes('barracks-l1.png') &&
      names.includes('warcamp-l1.png') && !names.includes('warcamp-l2.png'),
      slots.length + ' slots');
    ck('masksMonumentsAndCampsAreExcluded',
      !names.some(n => /^(wall|gate|wonder|raidercamp)-/.test(n)),
      'wall/gate tile from mask atlases; the wonder is per-monument; a camp is its people');
    ck('everyFilenameIsLowercase', names.every(n => n === n.toLowerCase()), '');
    ck('everyUrlCarriesTheCacheBuster',
      slots.every(s => Assets.artUrl(s.id, s.lv).includes('?v=')), Assets.artUrl('tc', 1));

    // ---- 2. shipped art loads by convention, into BOTH tribes' tables ----
    const tc1 = Assets.art['tc-l1'];
    ck('shippedHallArtLoadsByFilename', !!tc1 && !!tc1._cfArt,
      tc1 ? 'loaded, marked' : 'not loaded (moved file missing?)');
    ck('bothTribesShareTheImage',
      Sprites.building.tc[0] === tc1 && Sprites.buildingA.tc[0] === tc1, '');
    ck('aMissingFileStaysProcedural',
      Assets.art['house-l1'] === null && !Sprites.building.house[0]._cfArt &&
      Sprites.building.house[0] instanceof HTMLCanvasElement, '');
    ck('theCampfirePropStillArrives', !!Assets.resolve('misc/campfireTc') &&
      Assets.isImage('misc/campfireTc'), '');

    // ---- 3. the ONE anchoring rule (R.artRect / blitBld) ----
    const tall = document.createElement('canvas'); tall.width = 100; tall.height = 200;
    tall._cfArt = { ox: 0, oy: 0, scale: 1 };
    let r = R.artRect(tall, 10, 20, 64, 64);
    ck('scaledToFootprintWidth', r.w === 64, 'w=' + r.w);
    ck('aspectIsPreserved', r.h === 128, 'h=' + r.h);
    ck('bottomAnchoredOverhangingUp', r.y === 20 + 64 - 128 && r.x === 10,
      'x=' + r.x + ' y=' + r.y);
    tall._cfArt = { ox: 0.25, oy: -0.5, scale: 0.5 };
    r = R.artRect(tall, 10, 20, 64, 64);
    ck('sidecarScaleApplies', r.w === 32 && r.h === 64, r.w + 'x' + r.h);
    ck('sidecarOffsetsAreFootprintFractions',
      r.x === 10 + (64 - 32) / 2 + 16 && r.y === 20 + 64 - 64 - 32,
      'x=' + r.x + ' y=' + r.y);
    // blitBld actually routes marked art through artRect
    const calls = [];
    const spy = { drawImage: (...a) => calls.push(a), imageSmoothingEnabled: false, imageSmoothingQuality: '' };
    tall._cfArt = { ox: 0, oy: 0, scale: 1 };
    R.blitBld(spy, tall, 10, 20, 64, 64);
    ck('blitBldUsesTheSharedRule',
      calls.length === 1 && calls[0][2] === 20 - 64 && calls[0][3] === 64 && calls[0][4] === 128,
      JSON.stringify(calls[0] && calls[0].slice(1)));
    // …and unmarked (procedural) sprites keep the old exact-fit blit
    const sq = document.createElement('canvas'); sq.width = sq.height = 64;
    calls.length = 0;
    R.blitBld(spy, sq, 10, 20, 64, 64);
    ck('proceduralArtIsUntouched',
      calls.length === 1 && calls[0][1] === 10 && calls[0][2] === 20 &&
      calls[0][3] === 64 && calls[0][4] === 64, JSON.stringify(calls[0] && calls[0].slice(1)));

    // ---- 4. the burn variants keep the anchor ----
    const marked = document.createElement('canvas'); marked.width = 64; marked.height = 128;
    marked._cfArt = { ox: 0, oy: 0, scale: 1 };
    ck('aBurningPngKeepsItsAnchor', R.darkOf(marked)._cfArt === marked._cfArt, '');
    ck('aRuinedPngKeepsItsAnchorToo', R.ruinOf(marked)._cfArt === marked._cfArt, '');

    // ---- 5. a dock PNG overrides every shore orientation ----
    G.newGame('artdock', 'moderate', 'large'); Screens._demo = false; S.paused = true;
    const fake = document.createElement('canvas'); fake.width = fake.height = 64;
    Assets.setBuildingArt('dock', 1, fake, null);
    const bDock = { key: 'dock', owner: 'P', level: 1, x: 5, y: 5 };
    ck('dockArtOverridesAllOrientations', R.bldSprite(bDock) === fake, '');

    // ---- 6. no dev surface without the flag ----
    ck('noDevPanelForPlayers', !document.getElementById('devArtPanel') &&
      window.DevArt && DevArt.on === false, '');

    return { res, fails };
  });
  merge(out);
  const hard = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
  res.noPageErrors = hard.length ? 'FAIL — ' + hard[0] : 'PASS';
  if (hard.length) fails.push('noPageErrors');
  await p.close();
}

// ---------- pass 2: the ?dev=1 page ----------
{
  const p = await b.newPage({ viewport: { width: 900, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + '?dev=1', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  const out = await p.evaluate(async () => {
    const res = {}, fails = [];
    const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

    ck('devPanelExistsWithTheFlag', DevArt.on === true && !!document.getElementById('devArtPanel'), '');

    // ---- filename inference: normalized, never guessed ----
    ck('conventionNamesParse', JSON.stringify(DevArt.parseName('barracks-l2.png')) ===
      JSON.stringify({ id: 'barracks', lv: 2 }), '');
    ck('caseIsNormalizedNotRejected', JSON.stringify(DevArt.parseName('Barracks-L2.PNG')) ===
      JSON.stringify({ id: 'barracks', lv: 2 }), 'people are not case-sensitive; Pages is');
    ck('unknownIdsAreNeverGuessed', DevArt.parseName('fortress-l1.png') === null, '');
    ck('outOfRangeLevelsAreRefused', DevArt.parseName('warcamp-l2.png') === null &&
      DevArt.parseName('tc-l4.png') === null, '');
    ck('excludedIdsAreRefused', DevArt.parseName('wall-l1.png') === null, '');
    ck('freeformNamesGoToThePicker', DevArt.parseName('my cool barracks.png') === null, '');
    ck('canonicalNamesAreLowercase', DevArt.canonicalName('range', 2) === 'range-l2.png', '');

    // ---- inject / revert round-trip through the shipping path. The slot's
    // shipped state is whatever it is TODAY (procedural, or a real PNG that
    // has since landed in assets/buildings/) — revert restores exactly it. ----
    await new Promise(r => setTimeout(r, 400));   // let any shipped PNG finish decoding
    const before = Sprites.building.barracks[0];
    const beforeA = Sprites.buildingA.barracks[0];
    const loadedBefore = !!Assets.loaded['barracks-l1'];
    const fake = document.createElement('canvas'); fake.width = 80; fake.height = 120;
    DevArt.inject('barracks', 1, fake, 'draft-3.png');
    ck('injectionReplacesTheLiveSlot',
      Sprites.building.barracks[0] === fake && Sprites.buildingA.barracks[0] === fake &&
      !!fake._cfArt, '');
    ck('thePanelListsTheOverride',
      document.getElementById('devArtList').textContent.includes('barracks-l1'), '');
    DevArt.revert('barracks-l1');
    ck('revertRestoresTheShippedState',
      Sprites.building.barracks[0] === before && Sprites.buildingA.barracks[0] === beforeA &&
      !DevArt.overrides['barracks-l1'] && !!Assets.loaded['barracks-l1'] === loadedBefore,
      loadedBefore ? 'shipped PNG restored' : 'procedural restored');
    // multi-slot, then revert all
    const f2 = document.createElement('canvas'); f2.width = f2.height = 64;
    DevArt.inject('house', 1, fake, 'a.png');
    DevArt.inject('house', 2, f2, 'b.png');
    DevArt.revertAll();
    ck('revertAllClearsEveryOverride', Object.keys(DevArt.overrides).length === 0 &&
      !Sprites.building.house[0]._cfArt && !Sprites.building.house[1]._cfArt, '');

    // ---- a REAL drop event lands end-to-end (a genuine PNG File, a genuine
    // DragEvent on the window — the whole glue, not just the API below it) ----
    {
      const cnv = document.createElement('canvas'); cnv.width = 32; cnv.height = 48;
      const blob = await new Promise(r => cnv.toBlob(r, 'image/png'));
      const file = new File([blob], 'stable-l1.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      dispatchEvent(new DragEvent('drop', { dataTransfer: dt }));
      // the object-URL image decodes async — give it a moment
      for (let i = 0; i < 40 && !DevArt.overrides['stable-l1']; i++)
        await new Promise(r => setTimeout(r, 50));
      const spr = Sprites.building.stable[0];
      ck('aDroppedPngLandsInItsSlot',
        !!DevArt.overrides['stable-l1'] && spr instanceof HTMLImageElement && !!spr._cfArt,
        DevArt.overrides['stable-l1'] || 'drop never landed');
      ck('theDropUsesTheShippingAnchor', spr._cfArt && spr.height === 48 && spr.width === 32, '');
      DevArt.revertAll();
    }

    return { res, fails };
  });
  merge(out);
  const hard = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
  res.noDevPageErrors = hard.length ? 'FAIL — ' + hard[0] : 'PASS';
  if (hard.length) fails.push('noDevPageErrors');
  await p.close();
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL ART-PIPELINE CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
