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

/* THE TERRAIN REBUILD MUST NOT GUARD ON `window.S`. S is a script-level var,
   so window.S is undefined and such a guard is permanently true — the cache
   is then never baked and the whole map draws as a swallowed render error.
   (The same trap window.G / window.Sprites set; CLAUDE.md documents it.)
   Measured on the source, because a wrong guard here fails SILENTLY: the
   frame loop catches the error and the game keeps running. */
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(root, 'js/render.js'), 'utf8');
  // strip the comments first — this rule is ABOUT the word `window.S`, and the
  // comment above the guard necessarily says it
  const fn = src.slice(src.indexOf('rebuildTerrain()'), src.indexOf('rebuildTerrain()') + 700)
    .split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
  const ok = fn.length > 20 && !/window\.S\b/.test(fn) && /S\.map\.terrain/.test(fn);
  res.theRebuildGuardsOnTheRealMapField = ok ? 'PASS' : 'FAIL — window.S is undefined, or the field name drifted';
  if (!ok) fails.push('theRebuildGuardsOnTheRealMapField');
}

/* THE FOG-GHOST LOOKUP MUST ASK WHICH PEOPLE HELD THE CAMP. A remembered
   raidercamp is drawn from S.map.seenB, and that lookup reads
   Sprites.building/Sprites.buildingA directly rather than going through
   R.bldSprite — so it is easy to "fix" a camp's live look and never notice
   the ghost of one still shows the generic fallback. Measured on the source
   for the same reason as the guard above: a wrong branch here is a visual
   regression a headless pixel check would have to get lucky to catch, not a
   thrown error. */
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(root, 'js/render.js'), 'utf8');
  const anchor = src.indexOf('remembered buildings (ghosts in the grey fog)');
  const fn = anchor < 0 ? '' : src.slice(anchor, anchor + 1500)
    .split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
  const ok = fn.length > 20 && /snap\.tribe/.test(fn) && /Sprites\.camp/.test(fn);
  res.theFogGhostLookupReadsTheCampsTribe = ok ? 'PASS' : 'FAIL — the ghost lookup no longer special-cases raidercamp/tribe';
  if (!ok) fails.push('theFogGhostLookupReadsTheCampsTribe');
}

/* THE SHIPPED ORIGIN-ICON SET IS COMPLETE AND WELL-FORMED — one 128x128
   true-alpha PNG per motif named in js/cards.js, at
   assets/icons/origins/{motif}.png (all lowercase; Pages is
   case-sensitive). Measured on the committed files, because a missing or
   miscased file is a SILENT fallback to the procedural motif — exactly the
   failure the building convention documents. */
{
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(join(root, 'js/cards.js'), 'utf8');
  const motifs = [...new Set([...src.matchAll(/motif:\s*'([a-z]+)'/g)].map(m => m[1]))];
  const bad = [];
  for (const m of motifs) {
    const f = join(root, 'assets/icons/origins', m + '.png');
    if (!existsSync(f)) { bad.push(m + ': missing'); continue; }
    const buf = readFileSync(f);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), ct = buf[25];
    if (w !== 128 || h !== 128) bad.push(m + ': ' + w + 'x' + h);
    else if (ct !== 6 && !(ct === 3 && buf.includes('tRNS'))) bad.push(m + ': colorType ' + ct + ' has no alpha');
  }
  const ok = motifs.length >= 26 && !bad.length;
  res.everyOriginMotifShipsATrueAlphaIcon = ok ? 'PASS'
    : 'FAIL — ' + (bad.join('; ') || 'motif scan found only ' + motifs.length);
  if (!ok) fails.push('everyOriginMotifShipsATrueAlphaIcon');
}

// ---------- pass 1: the player page (no dev flag) ----------
{
  const p = await b.newPage({ viewport: { width: 430, height: 880 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  // give the convention loader time to resolve the shipped PNGs / 404s
  await p.waitForFunction(() => window.Assets && Assets.art['tc-l1'] !== undefined &&
    Assets.art['house-l1'] !== undefined, null, { timeout: 8000 }).catch(() => {});
  // …and the origin-icon probes (one per motif; all ship, so all must land)
  await p.waitForFunction(() => window.Assets && window.Cards &&
    Object.keys(Cards.DEFS).every(k => Assets.isImage('ui/card/' + k)),
    null, { timeout: 8000 }).catch(() => {});
  const out = await p.evaluate(() => {
    const res = {}, fails = [];
    const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

    /* ---- 0. THE GROUND TAKES ART THE SAME WAY THE BUILDINGS DO ----
       assets/terrain/{name}.png, {name}-2.png … where {name} is the
       terrain's own name in lowercase. Derived from the T enum, never a
       hand-kept list, so a new terrain gets a slot for free. */
    {
      const names = Object.keys(T).map(k => Assets.terrainName(T[k]));
      ck('everyTerrainHasAnArtSlot',
        names.length === Object.keys(T).length && names.every(n => n && n === n.toLowerCase()),
        names.join(', '));
      ck('andTheGroundNamesAreDerivedNotListed',
        Assets.terrainName(T.GOLDORE) === 'goldore' && Assets.terrainName(T.GRASS) === 'grass', '');
      ck('theGroundUrlsCarryTheCacheBuster',
        /assets\/terrain\/grass\.png\?v=/.test(Assets.terrainUrl('grass', 1)) &&
        /grass-2\.png\?v=/.test(Assets.terrainUrl('grass', 2)),
        Assets.terrainUrl('grass', 2));

      // a stand-in tile, injected the way a decoded PNG is
      const tile = (col) => {
        const c = document.createElement('canvas'); c.width = c.height = CFG.TILE;
        const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
        return c;
      };
      // skip the border ring: the outermost tiles are drawn as the off-map
      // void (#0d0b08), so a sample taken there measures the rim, not ground.
      // For GRASS prefer a tile whose whole neighbourhood is grass: the
      // contextual shade (darker under wood, damp by water) and the fringe
      // scatter both land on boundary tiles, and "the first grass tile on
      // the map" once fell beside a wood and drifted a channel just past
      // the sample tolerance — a fixture artifact, not an override failure.
      const idxOf = (want, quiet) => {
        let any = null;
        for (let y = 2; y < CFG.H - 2; y++) for (let x = 2; x < CFG.W - 2; x++) {
          if (S.map.terrain[MapGen.idx(x, y)] !== want) continue;
          any = any || { x, y };
          if (!quiet) return { x, y };
          let open = true;
          for (let oy = -1; oy <= 1 && open; oy++) for (let ox = -1; ox <= 1; ox++)
            if (S.map.terrain[MapGen.idx(x + ox, y + oy)] !== want) { open = false; break; }
          if (open) return { x, y };
        }
        return any;
      };
      /* Sample the MEAN of a tile's middle, and compare with a tolerance: the
         ground now carries a tonal overlay and a decal scatter ON TOP of
         whatever the floor is (that is the point — supplied art must get the
         same treatment as procedural ground), so an exact pixel match would
         only ever pass on a flat world. The override still has to DOMINATE. */
      const sample = (at) => {
        const g = R.terrainCache.getContext('2d');
        const d = g.getImageData(at.x * CFG.TILE + 8, at.y * CFG.TILE + 8, CFG.TILE - 16, CFG.TILE - 16).data;
        let r = 0, gg = 0, bb = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
        return [Math.round(r / n), Math.round(gg / n), Math.round(bb / n)];
      };
      const near = (a, b2, tol) => Math.abs(a[0] - b2[0]) <= tol && Math.abs(a[1] - b2[1]) <= tol && Math.abs(a[2] - b2[2]) <= tol;
      /* On a FOREST tile the canopy covers most of the middle, so an average
         says nothing about the floor beneath it. Count how much of the tile is
         unmistakably the override colour instead — that is the actual claim. */
      const floorPct = (at, isCol) => {
        const g = R.terrainCache.getContext('2d');
        const d = g.getImageData(at.x * CFG.TILE, at.y * CFG.TILE, CFG.TILE, CFG.TILE).data;
        let hit = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { n++; if (isCol(d[i], d[i + 1], d[i + 2])) hit++; }
        return +(100 * hit / n).toFixed(1);
      };
      const magenta = (r, gg, bb) => r > 140 && gg < 110 && bb > 110;
      const gAt = idxOf(T.GRASS, true), fAt = idxOf(T.FOREST);
      if (gAt && fAt && R.terrainCache) {
        const before = sample(gAt);
        Assets.terrain = {};                                   // start from the shipped state
        Assets.setTerrainArt(T.GRASS, tile('rgb(255,0,200)'));
        ck('aDroppedTileIsWhatTheMapDraws', near(sample(gAt), [255, 0, 200], 40), sample(gAt).join(','));
        /* THE GRASS OVERRIDE CARRIES THE WHOLE FLOOR. Every grass-floored
           resource is authored on a TRANSPARENT floor and painted over this
           one, so if supplied grass did not reach paintGround each forest
           tile would keep a patch of the old green under the new ground. */
        const under = floorPct(fAt, magenta);
        ck('andTheGrassOverrideCarriesTheWholeFloor', under > 8,
          under + '% of the forest tile is the supplied floor, under its trees');
        Assets.terrain = {}; R.rebuildTerrain();
        ck('andRemovingItRestoresTheProceduralTile', near(sample(gAt), before, 1),
          sample(gAt).join(',') + ' vs ' + before.join(','));
      } else {
        ck('aDroppedTileIsWhatTheMapDraws', false, 'no map to measure on');
      }
    }

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

    // ---- 1b. camp art has its OWN convention: one PNG per PEOPLE, not per
    // building id (ART_PLAN.md) — tribes are DERIVED from CFG.TRIBES, never
    // a hand-kept list, so a sixth people needs no code change here ----
    ck('campTribesAreDerivedFromCfgTribes',
      JSON.stringify(Assets.campTribes()) === JSON.stringify(CFG.TRIBES.map(t => t.key)),
      Assets.campTribes().join(','));
    ck('campFilenamesFollowTheirOwnShape',
      Assets.campTribes().every(t => Assets.campName(t) === 'camp-' + t + '.png'), '');
    ck('campFilenamesAreLowercase',
      Assets.campTribes().every(t => Assets.campName(t) === Assets.campName(t).toLowerCase()), '');
    ck('campUrlsCarryTheCacheBuster',
      Assets.campTribes().every(t => Assets.campUrl(t).includes('?v=')), Assets.campUrl('wolf'));

    // ---- 1c. the camp DRESSING takes PNGs one prop at a time:
    // camp-{tribe}-prop{1..4}.png replaces exactly that prop of that people's
    // set; the other three keep their procedural look ----
    ck('campPropFilenamesFollowTheShape',
      Assets.campPropName('wolf', 1) === 'camp-wolf-prop1.png' &&
      Assets.campPropUrl('sea', 4).includes('?v='),
      Assets.campPropUrl('wolf', 1));
    ck('campPropIndicesAreBounded',
      Assets.setCampPropArt('wolf', 0, document.createElement('canvas')) === false &&
      Assets.setCampPropArt('wolf', Assets.CAMP_PROP_N + 1, document.createElement('canvas')) === false &&
      Assets.setCampPropArt('nosuchtribe', 1, document.createElement('canvas')) === false,
      'out-of-range and unknown-tribe installs are refused');
    {
      // a dropped-in prop is what the dressing draws — measured on the pixels
      const mark = document.createElement('canvas');
      mark.width = mark.height = 8;
      const mg2 = mark.getContext('2d');
      mg2.fillStyle = '#ff00c8'; mg2.fillRect(0, 0, 8, 8);
      ck('aDroppedPropInstalls', Assets.setCampPropArt('wolf', 1, mark) === true, '');
      G.newGame('ap-props', 'moderate', 'large');
      for (const c of Bld.list('R').filter(z => z.key === 'raidercamp')) Bld.removeToRuin(c);
      S.units = S.units.filter(u => u.owner !== 'R');
      const tc2 = Bld.tcOf('P');
      for (let x = tc2.x + 4; x <= tc2.x + 10; x++) for (let y = tc2.y + 4; y <= tc2.y + 10; y++)
        if (MapGen.inB(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      Bld._block = null;
      const cc2 = G.plantRaiderCamp(tc2.x + 7, tc2.y + 7, 'wolf');
      const sc2 = document.createElement('canvas');
      sc2.width = sc2.height = 3 * CFG.TILE;
      const sg2 = sc2.getContext('2d');
      sg2.imageSmoothingEnabled = false;
      sg2.translate(-(cc2.x - 1) * CFG.TILE, -(cc2.y - 1) * CFG.TILE);
      R.drawCampDress(sg2, cc2);
      const px2 = sc2.getContext('2d').getImageData(0, 0, sc2.width, sc2.height).data;
      let magenta = 0;
      for (let i = 0; i < px2.length; i += 4)
        if (px2[i] > 220 && px2[i + 1] < 60 && px2[i + 2] > 160) magenta++;
      ck('andTheDressingDrawsIt', magenta > 40, magenta + ' marker pixels on the yard');
      // clean up the injected override so nothing leaks into later checks
      delete Assets.campProps.wolf;
      delete Assets.art['camp-wolf-prop1']; delete Assets.loaded['camp-wolf-prop1'];
    }

    // ---- 1d. origin card icons have their OWN convention: one PNG per
    // MOTIF (assets/icons/origins/{motif}.png) — motifs are DERIVED from
    // Cards.DEFS, never a hand-kept list, so a 27th card gets a slot for
    // free. A hit installs into ui/card/<cardKey>, which is what
    // Cards.drawMotif already prefers over the procedural 64-grid motif —
    // so the draft screen and the rival reveal take the image with zero
    // code at the call sites ----
    {
      const motifs = Assets.originMotifs();
      const defKeys = Object.keys(Cards.DEFS);
      ck('originMotifsAreDerivedFromTheCardTable',
        motifs.length > 0 && defKeys.every(k => motifs.includes(Cards.DEFS[k].motif)),
        motifs.length + ' motifs across ' + defKeys.length + ' cards');
      ck('originFilenamesAreLowercase',
        motifs.every(m => Assets.originName(m) === m.toLowerCase() + '.png'), '');
      ck('originUrlsCarryTheCacheBuster',
        motifs.every(m => Assets.originUrl(m).includes('?v=')), Assets.originUrl('hearth'));
      // the shipped set is COMPLETE: every card's icon really loaded (the
      // page-level wait above gave the probes time to resolve)
      const unloaded = defKeys.filter(k => !Assets.isImage('ui/card/' + k));
      ck('everyShippedOriginIconLoads', unloaded.length === 0,
        unloaded.join(',') || 'all ' + defKeys.length + ' cards iconed');
      // an installed icon is what drawMotif paints — measured on the pixels
      const key = defKeys[0], motif = Cards.DEFS[key].motif;
      const prevImg = Assets.ui.card[key];   // the shipped icon — restored below
      const mark = document.createElement('canvas');
      mark.width = mark.height = 8;
      const mg3 = mark.getContext('2d');
      mg3.fillStyle = '#ff00c8'; mg3.fillRect(0, 0, 8, 8);
      ck('aDroppedOriginIconInstalls', Assets.setOriginArt(motif, mark) === true, '');
      const mc = document.createElement('canvas');
      mc.width = mc.height = 64;
      Cards.drawMotif(mc, key);
      ck('theCardCanvasAdoptsTheIconsNativeSize', mc.width === 8 && mc.height === 8,
        mc.width + 'px backing store');
      const mpx = mc.getContext('2d').getImageData(0, 0, 8, 8).data;
      ck('andDrawMotifPaintsTheIcon', mpx[0] > 220 && mpx[1] < 60 && mpx[2] > 160,
        [mpx[0], mpx[1], mpx[2]].join(','));
      // a LATE-decoding icon repaints an already-dealt card: drawMotif
      // stamps the card key on every canvas it paints, and setOriginArt
      // walks the stamps — cards draw ONCE into DOM canvases, so without
      // this a slow network's draft screen keeps the procedural motif
      document.body.appendChild(mc);
      const mark2 = document.createElement('canvas');
      mark2.width = mark2.height = 8;
      const mg4 = mark2.getContext('2d');
      mg4.fillStyle = '#00ff37'; mg4.fillRect(0, 0, 8, 8);
      Assets.setOriginArt(motif, mark2);
      const rpx = mc.getContext('2d').getImageData(0, 0, 8, 8).data;
      ck('aLateIconRepaintsTheDealtCard', rpx[1] > 220 && rpx[0] < 60,
        [rpx[0], rpx[1], rpx[2]].join(','));
      mc.remove();
      ck('unknownMotifsAreRefused', Assets.setOriginArt('nosuchmotif', mark) === false, '');
      // restore the shipped icon so nothing leaks into later checks
      if (prevImg) Assets.setOriginArt(motif, prevImg);
      else for (const k of defKeys) if (Cards.DEFS[k].motif === motif) {
        delete Assets.ui.card[k]; delete Assets.loaded['ui/card/' + k];
      }
    }

    // ---- 1e. formation art has its OWN convention: multi-tile pieces over
    // terrain REGIONS (js/formations.js; ART_PLAN.md) —
    // assets/terrain/formations/{terrain}/{terrain}-{W}x{H}-{shape}-{letter}.png,
    // footprint in the name, image width bound to it, coverage mask derived
    // from the alpha channel, discovery from a known stem list ----
    {
      ck('formationTerrainsAreRealTerrains',
        Assets.formationTerrains().every(n => T[n.toUpperCase()] !== undefined),
        Assets.formationTerrains().join(','));
      ck('formationFilenamesAreLowercase',
        Assets.formationName('Mountain-4x3-Ridge-A') === 'mountain-4x3-ridge-a.png', '');
      ck('formationUrlsCarryTheCacheBuster',
        Assets.formationUrl('mountain', 'mountain-4x3-ridge-a').includes('?v=') &&
        Assets.formationUrl('mountain', 'mountain-4x3-ridge-a').startsWith('assets/terrain/formations/mountain/'),
        Assets.formationUrl('mountain', 'mountain-4x3-ridge-a'));
      const good = Assets.parseFormationStem('mountain-4x3-ridge-a', null);
      ck('theStemCarriesTheFootprint',
        !!good && good.tId === T.MOUNTAIN && good.w === 4 && good.h === 3 &&
        good.shape === 'ridge' && good.letter === 'a', JSON.stringify(good));
      ck('badStemsAreRefused',
        Assets.parseFormationStem('dragon-2x2-peak-a', null) === null &&      // no such terrain
        Assets.parseFormationStem('mountain-2x2-peak', null) === null &&      // no letter
        Assets.parseFormationStem('mountain-0x2-peak-a', null) === null &&    // zero footprint
        Assets.parseFormationStem('mountain-25x2-peak-a', null) === null &&   // past the 24-tile ceiling
        Assets.parseFormationStem('mountain-2x2-peak-a', 'forest') === null,  // wrong directory
        '');
      ck('aToweringRangeIsARealPiece',
        !!Assets.parseFormationStem('mountain-24x16-range-a', null) &&
        Assets.parseFormationStem('mountain-24x16-range-a', null).w === 24,
        '24 tiles wide parses — the ceiling moved for the hero ranges');
      // a stand-in piece: install, mask from alpha, width validation, removal
      const mkPiece = (w, h, hole) => {
        const c = document.createElement('canvas');
        c.width = w * Assets.FORMATION_PX; c.height = h * Assets.FORMATION_PX + 32;
        const g2 = c.getContext('2d');
        g2.fillStyle = '#ff00c8'; g2.fillRect(0, 0, c.width, c.height);
        if (hole) g2.clearRect(hole[0] * Assets.FORMATION_PX, 32 + hole[1] * Assets.FORMATION_PX,
          Assets.FORMATION_PX, Assets.FORMATION_PX);
        return c;
      };
      ck('aFormationPieceInstalls',
        Assets.setFormationArt('mountain', 'mountain-2x2-test-z', mkPiece(2, 2), null) === true &&
        !!Assets.formationPiece('mountain', 'mountain-2x2-test-z'), '');
      ck('theMaskComesFromTheAlphaChannel',
        Assets.setFormationArt('mountain', 'mountain-2x2-test-y', mkPiece(2, 2, [1, 1]), null) === true &&
        Assets.formationPiece('mountain', 'mountain-2x2-test-y').maskN === 3,
        'L-piece maskN=' + (Assets.formationPiece('mountain', 'mountain-2x2-test-y') || {}).maskN);
      ck('aLyingWidthIsRefused',
        Assets.setFormationArt('mountain', 'mountain-3x2-test-x', mkPiece(2, 2), null) === false, '');
      ck('removalRestoresAbsence',
        Assets.removeFormationArt('mountain', 'mountain-2x2-test-z') === true &&
        Assets.removeFormationArt('mountain', 'mountain-2x2-test-y') === true &&
        !Assets.formationPiece('mountain', 'mountain-2x2-test-z') &&
        !Formations.artTerrain(T.MOUNTAIN), '');
      // 404 tolerance: probing a stem with no file behind it records the miss
      // and throws nothing — absence is never an error
      Assets._tryLoadFormation('mountain', 'mountain-9x9-nofile-q');
      ck('aMissingPieceIsSilent', true, 'probe dispatched; noPageErrors below settles it');
    }

    // ---- 2. shipped art loads by convention, into BOTH tribes' tables ----
    const tc1 = Assets.art['tc-l1'];
    ck('shippedHallArtLoadsByFilename', !!tc1 && !!tc1._cfArt,
      tc1 ? 'loaded, marked' : 'not loaded (moved file missing?)');
    ck('bothTribesShareTheImage',
      Sprites.building.tc[0] === tc1 && Sprites.buildingA.tc[0] === tc1, '');
    // dynamic pick: the artist keeps shipping PNGs, so "a missing file" is
    // whatever slot is STILL missing today — hard-coding one broke the check
    // the day house-l1.png landed
    const missKey = slots.map(s => Assets.slotKey(s.id, s.lv)).find(k => Assets.art[k] === null);
    const miss = missKey && missKey.match(/^(.+)-l(\d+)$/);
    ck('aMissingFileStaysProcedural',
      !missKey || (!Sprites.building[miss[1]][+miss[2] - 1]._cfArt &&
        Sprites.building[miss[1]][+miss[2] - 1] instanceof HTMLCanvasElement),
      missKey || 'every slot has shipped art — nothing left to check');
    ck('theCampfirePropStillArrives', !!Assets.resolve('misc/campfireTc') &&
      Assets.isImage('misc/campfireTc'), '');

    // ---- 2b. shipped camp art loads by ITS convention, straight into
    // Sprites.camp[tribe] — the one place R.bldSprite and the panel icon
    // already read a live camp's look from, so nothing else has to change
    // for a dropped PNG to appear on a placed camp ----
    {
      const campShipped = Assets.campTribes().find(t => Assets.art[Assets.campSlotKey(t)]);
      ck('shippedCampArtLoadsByFilename',
        !!campShipped && !!Assets.art[Assets.campSlotKey(campShipped)]._cfArt,
        campShipped || 'no camp PNG shipped yet');
      ck('shippedCampArtInstallsIntoSpritesCamp',
        !campShipped || Sprites.camp[campShipped] === Assets.art[Assets.campSlotKey(campShipped)],
        '');
      const campMissing = Assets.campTribes().find(t => Assets.art[Assets.campSlotKey(t)] === null);
      ck('aMissingCampFileStaysProcedural',
        !campMissing || (!Sprites.camp[campMissing]._cfArt &&
          Sprites.camp[campMissing] instanceof HTMLCanvasElement),
        campMissing || 'every tribe has shipped art — nothing left to check');

      // R.bldSprite hands a live camp back its people's own art — same
      // routing a dock/tower/wall already get, exercised the same way
      // section 5 below exercises the dock override
      const fakeCamp = document.createElement('canvas'); fakeCamp.width = fakeCamp.height = 64;
      const savedWolf = Sprites.camp.wolf;
      Assets.setCampArt('wolf', fakeCamp, null);
      ck('bldSpriteHandsBackTheTribesCampArt',
        R.bldSprite({ key: 'raidercamp', owner: 'R', level: 1, tribe: 'wolf' }) === fakeCamp, '');
      Sprites.camp.wolf = savedWolf;   // restore the shipped state for what follows
    }

    // ---- 2b½. wonder art loads by ITS convention — one PNG per MONUMENT
    // (wonder-{key}.png, CFG.WONDERS-derived), landing in Sprites.wonders[key],
    // the dictionary Sprites.useWonder copies the run's rolled monument out
    // of — so the menu icon, panel, bldSprite, burn variants and fog ghost
    // all take it through the existing wonder slot with no call-site change ----
    {
      const wShipped = Assets.wonderKeys().find(k => Assets.art[Assets.wonderSlotKey(k)]);
      ck('shippedWonderArtLoadsByFilename',
        !!wShipped && !!Assets.art[Assets.wonderSlotKey(wShipped)]._cfArt,
        wShipped || 'no wonder PNG shipped yet');
      ck('shippedWonderArtInstallsIntoSpritesWonders',
        !wShipped || Sprites.wonders[wShipped] === Assets.art[Assets.wonderSlotKey(wShipped)], '');
      ck('anUnknownMonumentIsRefused',
        Assets.setWonderArt('atlantis', document.createElement('canvas'), null) === false, '');
      // useWonder hands the LIVE slot the installed art — and a late-loading
      // PNG re-points a monument already standing (the S.wonder re-apply)
      const savedPyr = Sprites.wonders.pyramid;
      const fakeW = document.createElement('canvas'); fakeW.width = 96; fakeW.height = 128;
      S.wonder = 'pyramid';
      Assets.setWonderArt('pyramid', fakeW, null);
      ck('aLateLoadingWonderRePointsTheLiveSlot',
        Sprites.building.wonder[0] === fakeW && !!fakeW._cfArt, '');
      Sprites.wonders.pyramid = savedPyr;
      if (savedPyr) Sprites.useWonder('pyramid');
      // the ?dev=1 filename router knows the shape (and refuses a stranger)
      ck('theDevRouterKnowsWonderFilenames',
        (DevArt.parseName('Wonder-Sphinx.PNG') || {}).kind === 'wonder' &&
        DevArt.parseName('wonder-atlantis.png') === null, '');
    }

    // ---- 2c. the fog-of-war ghost of a raider camp keeps its PEOPLE, not a
    // generic fallback (a real gap this convention closed: the ghost lookup
    // read Sprites.building directly and never asked which tribe held the
    // fire). Two halves: the DATA (G.updateVisibility stamps tribe into the
    // S.map.seenB snapshot) and the SOURCE (the render.js lookup actually
    // reads it) — the source check because a wrong branch here fails
    // SILENTLY, the same reasoning the window.S guard check at the top of
    // this file uses. ----
    G.newGame('artcamp', 'moderate', 'large');
    Screens._demo = false; S.paused = true;
    const cx = 20, cy = 20, ci = MapGen.idx(cx, cy);
    S.buildings.push({ id: 987654, key: 'raidercamp', owner: 'R', level: 1, x: cx, y: cy, tribe: 'flint', hp: 420 });
    S.units.push({ id: 987655, owner: 'P', kind: 'villager', x: cx, y: cy, hp: 1, maxHp: 1 });
    G.updateVisibility();
    const snap = S.map.seenB[ci];
    ck('fogMemorySnapshotsTheCampsTribe',
      !!snap && snap.key === 'raidercamp' && snap.tribe === 'flint', JSON.stringify(snap));

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

    /* ---- 5b. EVERY ICON IS THE ART ITSELF ----
       The build menu used to paint its icons ONCE, at boot, straight out of
       the procedural table — and building PNGs decode asynchronously long
       after that, so a redesigned house kept its old icon for the whole
       session while the map showed the new art. Icons now resolve the LIVE
       drawable and repaint whenever it changes: drop in new art and the
       menu, the placement ghost and the panel all follow with no code
       change and no manifest. */
    {
      G.newGame('articon', 'calm', 'medium');
      Screens._demo = false; Screens.show('playing'); S.paused = true;
      for (let i = 0; i < 4; i++) UI.refresh(0.3);   // refresh() is throttled at 0.25s
      const btn = document.querySelector('.bbtn[data-key="house"]');
      const ic = btn && btn.querySelector('canvas');
      const art = document.createElement('canvas'); art.width = art.height = 64;
      { const g2 = art.getContext('2d'); g2.fillStyle = '#ff00ff'; g2.fillRect(0, 0, 64, 64); }
      Assets.setBuildingArt('house', 1, art, null);
      ck('theMenuResolvesTheLiveArt', UI.menuIconSprite('house') === art, '');
      for (let i = 0; i < 4; i++) UI.refresh(0.3);
      ck('theMenuIconFollowsNewArt', !!ic && ic._cfIcon === art, '');
      // …and the GHOST the player positions is the same drawable
      const ghostB = { key: 'house', owner: 'P', level: 1, x: 4, y: 4, construction: 0 };
      ck('theGhostIsTheSameArt', R.bldSprite(ghostB, 1) === art, '');
      // …and a LATER redesign lands everywhere again (the ?dev=1 live loop)
      const art2 = document.createElement('canvas'); art2.width = art2.height = 64;
      { const g2 = art2.getContext('2d'); g2.fillStyle = '#123456'; g2.fillRect(0, 0, 64, 64); }
      Assets.setBuildingArt('house', 1, art2, null);
      for (let i = 0; i < 4; i++) UI.refresh(0.3);
      ck('aLaterRedesignLandsToo', !!ic && ic._cfIcon === art2, '');
      ck('theGhostFollowsTheRedesign', R.bldSprite(ghostB, 1) === art2, '');
      // repainting the SAME drawable is free — that is what makes asking
      // every frame affordable
      let paints = 0;
      const realDraw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...a) { paints++; return realDraw.apply(this, a); };
      UI.iconInto(ic, art2); UI.iconInto(ic, art2);
      CanvasRenderingContext2D.prototype.drawImage = realDraw;
      ck('repaintingTheSameArtIsFree', paints === 0, paints + ' redundant draws');
    }

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
      JSON.stringify({ kind: 'building', id: 'barracks', lv: 2 }), '');
    ck('caseIsNormalizedNotRejected', JSON.stringify(DevArt.parseName('Barracks-L2.PNG')) ===
      JSON.stringify({ kind: 'building', id: 'barracks', lv: 2 }), 'people are not case-sensitive; Pages is');
    ck('unknownIdsAreNeverGuessed', DevArt.parseName('fortress-l1.png') === null, '');
    ck('outOfRangeLevelsAreRefused', DevArt.parseName('warcamp-l2.png') === null &&
      DevArt.parseName('tc-l4.png') === null, '');
    ck('excludedIdsAreRefused', DevArt.parseName('wall-l1.png') === null, '');
    ck('freeformNamesGoToThePicker', DevArt.parseName('my cool barracks.png') === null, '');
    ck('canonicalNamesAreLowercase', DevArt.canonicalName('range', 2) === 'range-l2.png', '');

    // ---- camp filename inference: its own shape, same normalization rules ----
    ck('campConventionNamesParse', JSON.stringify(DevArt.parseName('camp-wolf.png')) ===
      JSON.stringify({ kind: 'camp', tribe: 'wolf' }), '');
    ck('campCaseIsNormalizedNotRejected', JSON.stringify(DevArt.parseName('Camp-WOLF.PNG')) ===
      JSON.stringify({ kind: 'camp', tribe: 'wolf' }), '');
    ck('unknownTribesAreNeverGuessed', DevArt.parseName('camp-orcs.png') === null, '');
    ck('campCanonicalNameIsLowercase', Assets.campName('flint') === 'camp-flint.png', '');

    // ---- formation filename inference: its own shape again — validated by
    // the loader's parser, and deliberately catalog-independent, so an artist
    // can preview a brand-new stem before it is listed ----
    ck('formationConventionNamesParse', JSON.stringify(DevArt.parseName('mountain-4x3-ridge-a.png')) ===
      JSON.stringify({ kind: 'formation', terrain: 'mountain', stem: 'mountain-4x3-ridge-a' }), '');
    ck('formationCaseIsNormalizedNotRejected', JSON.stringify(DevArt.parseName('Mountain-4X3-Ridge-A.PNG')) ===
      JSON.stringify({ kind: 'formation', terrain: 'mountain', stem: 'mountain-4x3-ridge-a' }), '');
    ck('unknownFormationTerrainsAreNeverGuessed', DevArt.parseName('dragon-4x3-ridge-a.png') === null, '');

    // ---- formation inject / revert round-trip — mask derived on the drop,
    // revert restores absence (nothing shipped in this slot) ----
    {
      const fm = document.createElement('canvas');
      fm.width = 2 * Assets.FORMATION_PX; fm.height = 2 * Assets.FORMATION_PX + 40;
      const fg = fm.getContext('2d');
      fg.fillStyle = '#ff00c8'; fg.fillRect(0, 0, fm.width, fm.height);
      ck('aDroppedFormationPieceLandsInItsSlot',
        DevArt.injectFormation('mountain', 'mountain-2x2-test-w', fm, 'Mountain-2x2-TEST-W.png') === true &&
        !!Assets.formationPiece('mountain', 'mountain-2x2-test-w') &&
        Assets.formationPiece('mountain', 'mountain-2x2-test-w').maskN === 4, '');
      ck('thePanelListsTheFormationOverride',
        document.getElementById('devArtList').textContent.includes('mountain-2x2-test-w'), '');
      DevArt.revert(Assets.formationSlotKey('mountain', 'mountain-2x2-test-w'));
      ck('formationRevertRestoresAbsence',
        !Assets.formationPiece('mountain', 'mountain-2x2-test-w') &&
        !Formations.artTerrain(T.MOUNTAIN) &&
        !DevArt.overrides[Assets.formationSlotKey('mountain', 'mountain-2x2-test-w')], '');
    }

    // ---- the formation WORKBENCH: the artist's whole loop without a commit.
    // A file-picker button (mobile Safari has no drag-drop — the phone is the
    // primary authoring device), plain-words contract reports in the PANEL
    // (never the console), the per-cell coverage grid, and the force-place
    // pin that bypasses the solver so a big piece is viewable on any map ----
    {
      ck('theWorkbenchControlsExist',
        !!document.getElementById('devArtFileBtn') &&
        !!document.getElementById('devArtMaskTgl') &&
        !!document.getElementById('devFormInfo') &&
        (document.getElementById('devArtFile') || {}).type === 'file' &&
        /png/.test(document.getElementById('devArtFile').accept) &&
        document.getElementById('devArtFile').multiple, '');
      // the file-picker route — a synthetic File through the ONE intake both
      // routes share, exactly as a phone-picked PNG arrives
      const mkFile = async (w, h, name, paint) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g2 = c.getContext('2d');
        g2.fillStyle = '#6e7280';
        if (paint) paint(g2, w, h); else g2.fillRect(0, 0, w, h);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        return new File([blob], name, { type: 'image/png' });
      };
      DevArt._handleFiles([
        await mkFile(256, 320, 'Mountain-2x2-Test-U.PNG'),                      // good, case-normalized
        await mkFile(400, 256, 'mountain-4x2-test-t.png'),                      // width liar
        await mkFile(256, 256, 'mountain-2x2-test-s.png',
          (g2) => g2.fillRect(0, 0, 128, 128)),                                 // one painted cell of four
      ]);
      for (let i = 0; i < 40 && !DevArt._formInfo['mountain-2x2-test-s']; i++)
        await new Promise(r => setTimeout(r, 50));
      ck('aPickedFileLandsInItsSlot',
        !!DevArt.overrides[Assets.formationSlotKey('mountain', 'mountain-2x2-test-u')] &&
        /✓/.test(DevArt._formInfo['mountain-2x2-test-u'] || ''),
        DevArt._formInfo['mountain-2x2-test-u']);
      ck('aLyingWidthIsRefusedInPlainWords',
        /refused/.test(DevArt._formInfo['mountain-4x2-test-t'] || '') &&
        /512px/.test(DevArt._formInfo['mountain-4x2-test-t'] || '') &&
        !DevArt.overrides[Assets.formationSlotKey('mountain', 'mountain-4x2-test-t')],
        DevArt._formInfo['mountain-4x2-test-t']);
      ck('aSparseMaskIsFlaggedPerCell',
        /⚠ mask 1\/4/.test(DevArt._formInfo['mountain-2x2-test-s'] || '') &&
        /bare ground/.test(DevArt._formInfo['mountain-2x2-test-s'] || ''),
        DevArt._formInfo['mountain-2x2-test-s']);
      ck('theReportsRenderInThePanelNotTheConsole',
        document.getElementById('devFormInfo').textContent.includes('refused') &&
        document.getElementById('devFormInfo').textContent.includes('✓'), '');

      // the pin: plant a mountain block, prove the solver alone leaves it
      // procedural (one piece cannot cover it), then pin and see it placed
      Boot.force(); G.newGame('ap-pin', 'moderate', 'medium');
      const W2 = CFG.W;
      let px2 = 3, py2 = 3;
      outer2: for (let y = 4; y < CFG.H - 10; y++) for (let x = 4; x < W2 - 10; x++) {
        let ok = true;
        for (let oy = 0; oy < 6 && ok; oy++) for (let ox = 0; ox < 7 && ox < W2 && ok; ox++)
          if (Bld.at(x + ox, y + oy)) ok = false;
        if (ok) { px2 = x; py2 = y; break outer2; }
      }
      for (let oy = 0; oy < 5; oy++) for (let ox = 0; ox < 6; ox++)
        S.map.terrain[(py2 + oy) * W2 + px2 + ox] = T.MOUNTAIN;
      for (let i = 0; i < S.map.explored.length; i++) { S.map.explored[i] = 1; S.map.seenTerrain[i] = S.map.terrain[i]; }
      Bld._block = null;
      R._mtnKey = ''; R._mtn = null; R._mtnLayerKey = ''; R._mtnDirty = true;
      R.rebuildTerrain();
      R.mtnStrips();
      const unpinnedKinds = new Set(R._mtnArt.map(a => a.kind || 'region'));
      ck('anUncoverableRegionStaysProcedural', !unpinnedKinds.has('formation-pin'),
        [...unpinnedKinds].join(','));
      DevArt.setFormationPin('mountain', 'mountain-2x2-test-u');
      R.mtnStrips();
      const pinnedKinds = new Set(R._mtnArt.map(a => a.kind || 'region'));
      ck('thePinPlacesThePieceRegardless', pinnedKinds.has('formation-pin'),
        [...pinnedKinds].join(','));
      // the coverage grid draws through the render hook without error
      DevArt.maskOverlay = true;
      R.draw(1 / 60);
      DevArt.maskOverlay = false;
      ck('theCoverageGridDraws', true, '');
      // revert-all: overrides gone, pin cleared, procedural back
      DevArt.revertAll();
      R._mtnLayerKey = ''; R._mtnDirty = true;
      R.mtnStrips();
      ck('workbenchRevertAllStandsEverythingDown',
        Object.keys(DevArt.overrides).length === 0 && DevArt.formationPin === null &&
        !Formations.artTerrain(T.MOUNTAIN) &&
        R._mtnArt.every(a => (a.kind || 'region') !== 'formation-pin'), '');

      // ---- CONFORM: raw art of any size/name → a contract-true piece.
      // The pipeline is what's pinned: key the flat backdrop, trim margins,
      // land on the 128px/tile grid at the chosen density (N divides 128,
      // so blocks are k×k uniform), baseline on the bottom edge, width
      // exactly W×128, live temp piece pinned, clean close ----
      {
        const raw = document.createElement('canvas');
        raw.width = 620; raw.height = 700;
        const rg = raw.getContext('2d');
        rg.fillStyle = '#8a8a8a'; rg.fillRect(0, 0, 620, 700);          // flat backdrop
        rg.fillStyle = '#4b4f5a';
        rg.beginPath(); rg.moveTo(90, 600); rg.lineTo(310, 80); rg.lineTo(530, 600);
        rg.closePath(); rg.fill();
        DevArt.openConform(raw, 'Some External Export (2).PNG');
        const c0 = DevArt._conform;
        ck('conformOpensWithTheBackdropKeySuggested',
          !!document.getElementById('devConform') && c0.keyBg === true && DevArt.maskOverlay === true, '');
        const onGrid = (cnv, k) => {
          const d = cnv.getContext('2d').getImageData(0, 0, cnv.width, cnv.height).data;
          for (let by = 0; by < cnv.height; by += k) for (let bx = 0; bx < cnv.width; bx += k) {
            const i0 = (by * cnv.width + bx) * 4;
            for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
              const i = ((by + dy) * cnv.width + bx + dx) * 4;
              if (d[i] !== d[i0] || d[i + 3] !== d[i0 + 3]) return false;
            }
          }
          return true;
        };
        const b1 = c0.built;
        const d1 = b1 && b1.canvas.getContext('2d').getImageData(0, 0, b1.canvas.width, b1.canvas.height).data;
        let bottomArt = 0;
        if (b1) for (let x = 0; x < b1.canvas.width; x++)
          if (d1[((b1.canvas.height - 1) * b1.canvas.width + x) * 4 + 3] >= 16) bottomArt++;
        ck('conformLandsOnTheGameGrid',
          !!b1 && b1.canvas.width === 2 * Assets.FORMATION_PX && onGrid(b1.canvas, 4),
          b1 ? b1.canvas.width + 'px wide at N=32 (4px blocks)' : 'no build');
        ck('theBackdropIsKeyedAndTheBaselineHolds',
          !!b1 && d1[3] === 0 && bottomArt > 0,
          'corner alpha 0, ' + bottomArt + ' art px on the bottom row');
        ck('theTempPieceIsPinnedLive',
          !!c0.tempStem && DevArt.formationPin && DevArt.formationPin.stem === c0.tempStem &&
          !!Assets.formationPiece('mountain', c0.tempStem), c0.tempStem);
        // density and footprint re-target live; shape/letter sanitize into the name
        c0.N = 8; DevArt._conformApply();
        ck('densityRetargetsTheGrid', !!c0.built && onGrid(c0.built.canvas, 16), '');
        c0.W = 3; c0.H = 2; c0.shape = 'Ridge!'; c0.letter = 'Q'; DevArt._conformApply();
        ck('footprintAndNameFollowTheControls',
          c0.built.canvas.width === 3 * Assets.FORMATION_PX &&
          DevArt._conformStem() === 'mountain-3x2-ridge-q' &&
          c0.tempStem === 'mountain-3x2-ridge-q', DevArt._conformStem());
        DevArt._conformClose();
        R._mtnLayerKey = ''; R._mtnDirty = true;
        R.mtnStrips();
        ck('conformCloseStandsEverythingDown',
          !document.getElementById('devConform') && DevArt.formationPin === null &&
          !Formations.artTerrain(T.MOUNTAIN) && DevArt.maskOverlay === false, '');
      }
    }

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
    // multi-slot, then revert all — restoring whatever shipped TODAY (a real
    // house PNG keeps its _cfArt; the old `!_cfArt` check assumed procedural)
    const h1 = Sprites.building.house[0], h2 = Sprites.building.house[1];
    const f2 = document.createElement('canvas'); f2.width = f2.height = 64;
    DevArt.inject('house', 1, fake, 'a.png');
    DevArt.inject('house', 2, f2, 'b.png');
    DevArt.revertAll();
    ck('revertAllClearsEveryOverride', Object.keys(DevArt.overrides).length === 0 &&
      Sprites.building.house[0] === h1 && Sprites.building.house[1] === h2, '');

    // ---- camp inject / revert round-trip — same shipping path (Assets.
    // setCampArt), same override bookkeeping, but ONE sprite per tribe
    // rather than a level pair, so revert has its own branch to prove out ----
    {
      const beforeCamp = Sprites.camp.woad;
      const loadedBeforeCamp = !!Assets.loaded['camp-woad'];
      const fakeCamp = document.createElement('canvas'); fakeCamp.width = 90; fakeCamp.height = 140;
      DevArt.injectCamp('woad', fakeCamp, 'draft-woad.png');
      ck('campInjectionReplacesTheLiveSlot',
        Sprites.camp.woad === fakeCamp && !!fakeCamp._cfArt, '');
      ck('thePanelListsTheCampOverride',
        document.getElementById('devArtList').textContent.includes('camp-woad'), '');
      DevArt.revert('camp-woad');
      ck('campRevertRestoresTheShippedState',
        Sprites.camp.woad === beforeCamp && !DevArt.overrides['camp-woad'] &&
        !!Assets.loaded['camp-woad'] === loadedBeforeCamp,
        loadedBeforeCamp ? 'shipped PNG restored' : 'procedural restored');
    }

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

    // ---- and a camp-{tribe}.png drop lands the same way, into Sprites.camp ----
    {
      const cnv = document.createElement('canvas'); cnv.width = 40; cnv.height = 60;
      const blob = await new Promise(r => cnv.toBlob(r, 'image/png'));
      const file = new File([blob], 'camp-sea.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      dispatchEvent(new DragEvent('drop', { dataTransfer: dt }));
      for (let i = 0; i < 40 && !DevArt.overrides['camp-sea']; i++)
        await new Promise(r => setTimeout(r, 50));
      const spr = Sprites.camp.sea;
      ck('aDroppedCampPngLandsInItsSlot',
        !!DevArt.overrides['camp-sea'] && spr instanceof HTMLImageElement && !!spr._cfArt,
        DevArt.overrides['camp-sea'] || 'drop never landed');
      ck('theCampDropUsesTheShippingAnchor', spr._cfArt && spr.height === 60 && spr.width === 40, '');
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
