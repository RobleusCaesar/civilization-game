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

   Section 9 adds the other half the quarry report asked for — the work
   poses read the same at every tier, and the art for them exists at every
   tier — because a tier that silently has no art for a job does not
   throw: it falls back per lookup and stands about instead of working.

   Run after touching: render.js (villagerTier/unitArtKey/sheetFrames/
   unitSprite/unitPose), assets.js (VILLAGER_TIER_BY_TC/TUNIC_KEY/
   recolorTunic/loadVillagerArt/setUnitFrames), buildings.js
   (finishUpgrade), or assets/units/unit-villager-*.

     node tests/villager-tiers.mjs      # exits non-zero on any regression */
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
// the checks below read the SHIPPED strips, and the boot probes ~1,000 PNGs:
// a fixed 900ms was a race on a slower machine — wait for the art to settle
await p.waitForFunction(() => window.Assets && Assets.allArtReady && Assets.allArtReady(), null, { timeout: 60000 }).catch(() => {});   // the beasts are the LATE tier now
await p.waitForTimeout(300);

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
    // the tunic rides IN the key (the anti-staleness rule: tunics re-roll
    // per run, unitArt survives the session, so a tunic-less key would
    // serve last run's baked colors — adversarial review)
    ck('theKeyCarriesFactionTunicTierAndGender',
      R.unitArtKey(u) === 'villager-p-blue-l1-m' && R.unitArtKey(uf) === 'villager-a-red-l1-f',
      R.unitArtKey(u) + ' / ' + R.unitArtKey(uf));
    const d = Units.spawn('deer', 'W', 20, 20);
    ck('everyOtherKindIsItsOwnKey', R.unitArtKey(d) === 'deer', '');
    Bld.tcOf('P').level = 3; R._vTier = null;
    ck('theKeyMovesWithTheHall', R.unitArtKey(u) === 'villager-p-blue-l3-m', R.unitArtKey(u));
    // …and with the tunic: a re-rolled run can never hit last run's keys
    S.tunic.P = 'teal';
    ck('theKeyMovesWithTheTunic', R.unitArtKey(u) === 'villager-p-teal-l3-m', R.unitArtKey(u));
    S.tunic.P = 'blue';
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
      before === 'villager-p-blue-l1-m' && after === 'villager-p-blue-l2-m',
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
    Assets.setUnitFrames('villager-p-blue-l2-m', 's', 'walk', fakeStrip(4));
    Assets.setUnitFrames('villager-p-blue-l2-m', 'e', 'walk', fakeStrip(4));
    Assets.setUnitFrames('villager-p-blue-l2-f', 's', 'walk', fakeStrip(4));
    Assets.setUnitFrames('villager-p-blue-l3-m', 's', 'idle', fakeStrip(4));
    ['villager-p-blue-l2-m', 'villager-p-blue-l2-f', 'villager-p-blue-l3-m'].forEach(k => installed.add(k));
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
            const key = 'villager-p-blue-l' + R.villagerTier('P') + (female ? '-f' : '-m');
            const ua = Assets.unitArt[key];
            // membership by IDENTITY, not by size (the shipped l1-m walk is
            // 64px while the fake strips are 96 — a width heuristic lies).
            // Searched across ALL the key's directions: the resolver may
            // legitimately serve a different direction than requested (the
            // dirs.s fallback, and the work-pose turn-around below in 5b) —
            // the property under test is came-from-THIS-sheet, not which dir.
            let fromSheet = false;
            if (ua && spr) {
              outer: for (const dk in ua.dirs) {
                const dd = ua.dirs[dk];
                for (const pk in dd) if (dd[pk].includes(spr)) { fromSheet = true; break outer; }
              }
            }
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

  /* ---- 5b. WORKERS TURN TO FACE THE PLAYER (operator report: a villager
     who walked north to its tile worked the whole task back-to-camera).
     While a WORK pose plays, away facings rotate to the nearest front or
     profile — n→s, ne→e, nw→w — and motion/combat poses keep their honest
     displacement facing. Pinned by frame-list identity. ---- */
  {
    const key = 'villager-p-blue-l2-m';
    const mk = (frames) => {
      const c = document.createElement('canvas');
      c.width = 96 * frames; c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = '#654321'; g.fillRect(0, 0, c.width, c.height);
      return c;
    };
    for (const dir of ['s', 'e', 'w', 'n', 'ne', 'nw'])
      for (const pose of ['walk', 'gather', 'guard'])
        Assets.setUnitFrames(key, dir, pose, mk(4));
    const u = Units.spawn('villager', 'P', 10, 10);
    const tc = Bld.tcOf('P');
    tc.level = 2; R._vTier = null; u.female = false;
    const ua = Assets.unitArt[key];
    const resolve = (pose, dir) => {
      const realPose = R.unitPose, realFace = R.unitFacing;
      R.unitPose = () => pose; R.unitFacing = () => dir;
      const fr = R.sheetFrames(u);
      R.unitPose = realPose; R.unitFacing = realFace;
      return fr;
    };
    const cases = [
      ['gather', 'n',  's', 'gather'],   // full about-face
      ['gather', 'ne', 'e', 'gather'],   // quarter-turn to profile
      ['gather', 'nw', 'w', 'gather'],
      ['gather', 's',  's', 'gather'],   // front work untouched
      ['walk',   'n',  'n', 'walk'],     // motion keeps honest facing
      ['guard',  'n',  'n', 'guard'],    // combat keeps honest facing
    ];
    let ok = true, bad = '';
    for (const [pose, dir, wantDir, wantPose] of cases) {
      const fr = resolve(pose, dir);
      if (fr !== ua.dirs[wantDir][wantPose]) {
        ok = false;
        if (!bad) bad = pose + '+' + dir + ' did not resolve to dirs.' + wantDir + '.' + wantPose;
        break;
      }
    }
    ck('workersTurnToFaceThePlayer', ok,
      ok ? 'n→s, ne→e, nw→w while working; walk and guard keep true facing' : bad);
    tc.level = 1; R._vTier = null;
    delete Sprites.animFps[key];
    Assets.removeUnitArt(key);
    S.units = S.units.filter(z => z !== u);
  }

  /* ---- 5c. BUILDERS LEAN TO THE WALL (operator report, day 120): a unit
     playing the build pose DRAWS at the nearest point just outside its
     site's footprint — capped, sim position untouched — and FACES the
     site (front-clamped, the standing no-backs rule). ---- */
  {
    const u = Units.spawn('villager', 'P', 10, 10);
    const tc = Bld.tcOf('P');           // any real building works as the site
    // stand the builder 1 tile west of the hall's west wall, mid-height
    u.x = tc.x - 1.4; u.y = tc.y + 1; u.path = null;
    u.task = { type: 'build', id: tc.id };
    const realPose = R.unitPose; R.unitPose = () => 'build';
    const lean = R.workLean(u);
    R.unitPose = realPose;
    ck('theBuilderLeansToTheWall',
      !!lean && Math.abs(lean.x - (tc.x - 0.38)) < 0.01 && Math.abs(lean.y - u.y) < 0.01,
      lean ? lean.x.toFixed(2) + ',' + lean.y.toFixed(2) + ' vs wall at ' + (tc.x - 0.38).toFixed(2) : 'no lean');
    // far away the lean is capped, not a teleport
    u.x = tc.x - 4; const realPose2 = R.unitPose; R.unitPose = () => 'build';
    const far = R.workLean(u);
    R.unitPose = realPose2;
    ck('aFarLeanIsCappedNotATeleport',
      !!far && Math.hypot(far.x - u.x, far.y - u.y) <= 1.36,
      far ? 'lean of ' + Math.hypot(far.x - u.x, far.y - u.y).toFixed(2) : 'no lean');
    // a non-build task never leans
    u.task = { type: 'gather', res: 'wood' };
    ck('onlyBuildersLean', R.workLean(u) === null, '');
    u.task = null;
    S.units = S.units.filter(z => z !== u);
  }

  /* ---- 5d. THE LEAN LANDS ON GROUND HE COULD STAND ON (operator report,
     day 126, with the picture: a farm's own hand, tools downed for the
     upgrade, drawn knee-deep in the lake south of the field). The sim keeps
     a builder on legal ground — buildStand — but the lean is draw-time and
     answered to nobody: from inside a site it pushed the sprite out the
     SHORT way whatever lay there, and from outside it stepped toward the
     wall across whatever lay between. The lean is one routine shared by
     every kind, so it is measured across kinds, footprints and sides —
     "check other buildings" — and the drawn tile is what is judged: it must
     be passable for the unit or be his own. The last two are the shape the
     rule takes when there is nowhere to go: no lean at all, never a wade. ---- */
  {
    const W = CFG.W, terr = S.map.terrain, tc = Bld.tcOf('P');
    const ox = tc.x + 6, oy = tc.y + 6;
    const saved = terr.slice();
    const clear = () => { for (let y = oy - 4; y <= oy + 6; y++) for (let x = ox - 4; x <= ox + 6; x++) terr[y * W + x] = T.GRASS; Bld._block = null; };
    const okAt = (u, lean) => {
      const lx = lean ? lean.x : u.x, ly = lean ? lean.y : u.y, tx = lx | 0, ty = ly | 0;
      return Path.passable(tx, ty, 'P', 'land') || (tx === (u.x | 0) && ty === (u.y | 0));
    };
    const drop = (u, bb) => { S.units = S.units.filter(z => z !== u); S.buildings = S.buildings.filter(z => z !== bb); Bld._block = null; };
    const bad = [];
    // the report: a plot's own hand, water on each side in turn, standing on
    // the plot's near edge to that side (the worst case for the push-out)
    const DIR = { south: [0, 1], north: [0, -1], west: [-1, 0], east: [1, 0] };
    let poses = 0;
    for (const side in DIR) {
      const [dx, dy] = DIR[side];
      clear(); terr[oy * W + ox] = T.BARREN; terr[(oy + dy) * W + ox + dx] = T.WATER; Bld._block = null;
      const bb = Bld.place('P', 'farm', ox, oy, { free: true, instant: true });
      const u = Units.spawn('villager', 'P', ox, oy);
      u.x = ox + 0.5 + dx * 0.25; u.y = oy + 0.5 + dy * 0.25;
      u.task = { type: 'work', id: bb.id }; bb.upgrading = 4; bb.upgTotal = 4;
      Units.assignBuild(u, bb); u.task.resumeWork = true;
      for (let k = 0; k < 4; k++) Units.update(0.05);
      if (R.unitPose(u) === 'build') poses++;
      const lean = R.workLean(u);
      if (!okAt(u, lean)) bad.push('farm/water ' + side + ' → ' + (lean ? lean.x.toFixed(2) + ',' + lean.y.toFixed(2) : 'none'));
      drop(u, bb);
    }
    ck('aPlotsOwnHandNeverLeansIntoTheWater', poses === 4 && bad.length === 0,
      bad.join('; ') || 'four sides, the real build pose, every lean on dry ground');
    // every kind that raises a site the builder stands on, water south of it
    const bad2 = [];
    for (const key of ['house', 'tower', 'farm', 'lumber', 'quarry', 'barracks', 'range', 'trade', 'sapper']) {
      const d = Bld.def(key); if (!d) continue;
      clear();
      const sz = d.size || 1;
      if (d.onWorked) terr[oy * W + ox] = d.onWorked;
      for (let x = ox; x < ox + sz; x++) terr[(oy + sz) * W + x] = T.WATER;
      Bld._block = null;
      const bb = Bld.place('P', key, ox, oy, { free: true });
      if (!bb) { bad2.push(key + ' (not placed)'); continue; }
      const u = Units.spawn('villager', 'P', ox + sz - 1, oy + sz - 1);
      u.y = oy + sz - 1 + 0.8;
      Units.assignBuild(u, bb);
      for (let k = 0; k < 4; k++) Units.update(0.05);
      if (R.unitPose(u) !== 'build') bad2.push(key + ' (pose ' + R.unitPose(u) + ')');
      else if (!okAt(u, R.workLean(u))) bad2.push(key);
      drop(u, bb);
    }
    ck('andNoKindsSiteLeansItsBuilderIntoTheWater', bad2.length === 0, bad2.join('; ') || 'nine kinds, 1x1 and 2x2, every lean on dry ground');
    // a dock stands ON the water: its builder squares up from the sand
    {
      clear();
      for (let y = oy; y < oy + 4; y++) for (let x = ox; x < ox + 4; x++) terr[y * W + x] = T.WATER;
      Bld._block = null;
      const bb = Bld.place('P', 'dock', ox, oy, { free: true });
      let ok = false, say = 'dock not placed';
      if (bb) {
        const u = Units.spawn('villager', 'P', ox - 1, oy);
        Units.assignBuild(u, bb);
        for (let k = 0; k < 4; k++) Units.update(0.05);
        const lean = R.workLean(u);
        ok = R.unitPose(u) === 'build' && okAt(u, lean);
        say = 'pose ' + R.unitPose(u) + ', drawn at ' + (lean ? lean.x.toFixed(2) + ',' + lean.y.toFixed(2) : 'the sim spot');
        drop(u, bb);
      }
      ck('aDocksBuilderLeansFromTheSandNotTheShallows', ok, say);
    }
    // nowhere to lean: water on three sides, a finished house on the fourth
    {
      clear();
      terr[(oy + 1) * W + ox] = T.WATER; terr[oy * W + ox - 1] = T.WATER; terr[oy * W + ox + 1] = T.WATER; Bld._block = null;
      const wall = Bld.place('P', 'house', ox, oy - 1, { free: true, instant: true });
      const bb = Bld.place('P', 'house', ox, oy, { free: true });
      const u = Units.spawn('villager', 'P', ox, oy);
      Units.assignBuild(u, bb);
      for (let k = 0; k < 4; k++) Units.update(0.05);
      const lean = R.workLean(u);
      ck('withNowhereToLeanHeStaysOnTheSite', R.unitPose(u) === 'build' && lean === null,
        lean ? 'leaned to ' + lean.x.toFixed(2) + ',' + lean.y.toFixed(2) : 'no lean, pose ' + R.unitPose(u));
      drop(u, bb); S.buildings = S.buildings.filter(z => z !== wall); Bld._block = null;
    }
    // at reach of a 2x2 with water between him and the wall: no step across it
    {
      clear();
      terr[oy * W + ox + 2] = T.WATER; terr[(oy + 1) * W + ox + 2] = T.WATER; Bld._block = null;
      const bb = Bld.place('P', 'barracks', ox, oy, { free: true });
      const u = Units.spawn('villager', 'P', ox + 3, oy + 1);
      u.x = ox + 3.02;
      u.task = { type: 'build', id: bb.id };
      const lean = R.workLean(u);
      ck('andAStepAcrossWaterIsCutAtTheShore', R.unitPose(u) === 'build' && okAt(u, lean),
        (lean ? 'drawn at ' + lean.x.toFixed(2) + ',' + lean.y.toFixed(2) : 'no lean') + ', pose ' + R.unitPose(u));
      drop(u, bb);
    }
    for (let i = 0; i < saved.length; i++) terr[i] = saved[i];   // a plain array, not a typed one
    Bld._block = null;
  }

  /* ---- 6. fps rides the VARIANT key — the procedural cast keeps its 4fps ---- */
  {
    const c = document.createElement('canvas');
    c.width = 96 * 12; c.height = 96;
    Assets.setUnitFrames('villager-p-blue-l2-m', 's', 'walk', c);
    ck('sheetFpsRidesTheVariantKey',
      /* TWO RATES PER VILLAGER (the referee’s ruling of 2026-09-04, refining
         the uniform 1.8s of 2026-09-03): the FORAGING poses — kneeling to
         pick a bush, reaching into an orchard — keep the 1.8s cycle he
         judged those sheets at; everything else a villager does went half
         way back toward the old clock at 1.35s, because at 1.8s a walk read
         as wading. Beasts and military keep their 0.9s. */
      Sprites.animFps['villager-p-blue-l2-m'] === Math.max(4, Math.round(12 / Assets.VILLAGER_CYCLE)) &&
      Sprites.animFpsForage['villager-p-blue-l2-m'] === Math.max(4, Math.round(12 / Assets.FORAGE_CYCLE)) &&
      Assets.FORAGE_CYCLE > Assets.VILLAGER_CYCLE &&
      Sprites.animFps.villager === undefined,
      'variant at ' + Sprites.animFps['villager-p-blue-l2-m'] + 'fps walking, '
      + Sprites.animFpsForage['villager-p-blue-l2-m'] + 'fps foraging; the 2-frame procedural villager untouched');
    delete Sprites.animFpsForage['villager-p-blue-l2-m'];
    delete Sprites.animFps['villager-p-blue-l2-m'];
    Assets.removeUnitArt('villager-p-blue-l2-m');
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
    // the 48 box applies ONLY when the sprite actually came from a sheet:
    // the procedural fallback is authored for 32, and stretching it 1.5x
    // is the resample the density doctrine forbids (adversarial review)
    const savedBear = Assets.unitArt.bear;
    delete Assets.unitArt.bear;
    ck('theBigBoxFollowsTheSheet', R.unitBox({ kind: 'bear' }) === 32,
      'no sheet, no 48 — the procedural bear draws at its own native density');
    Assets.unitArt.bear = savedBear;
    S.units = S.units.filter(z => z !== d);
  }

  /* ---- 9. THE QUARRY ORDER READS THE SAME AT EVERY TIER --------------
     From the quarry report, whose second half was "make sure this is
     cleaned up for all three levels, not just level one villager". The
     tier only chooses which SHEET a pose is read from — R.unitPose is
     tier-blind by construction — so what is pinned in the page is that
     property: a villager on a stone-gather task asks for the QUARRY pose
     and for its OWN tier's sheet, at all three levels. Whether the art
     for that pose exists at every tier is a question about files, and it
     is measured on disk below rather than here, because the shipped
     strips load lazily for the tier a hall is standing at. ---- */
  {
    const tc = Bld.tcOf('P');
    const u = Units.spawn('villager', 'P', 20, 20);
    u.task = { type: 'gather', x: 21, y: 20, sx: 20, sy: 20, res: 'stone' };
    const got = [];
    for (const lv of [1, 2, 3]) {
      tc.level = lv; R._vTier = null;
      got.push(R.unitPose(u) + '@' + R.unitArtKey(u));
    }
    tc.level = 1; R._vTier = null;
    S.units = S.units.filter(z => z !== u);
    const gk = u.female ? '-f' : '-m';   // whoever the spawn dealt; the tier is the subject here
    const want = [1, 2, 3].map(l => 'mine@villager-p-' + G.tunicOf('P') + '-l' + l + gk);
    ck('theQuarryPoseIsTheSameOrderAtEveryTier',
      got.join('|') === want.join('|'), got.join(', '));
  }

  return { res, fails };
});

/* …AND THE ART FOR THOSE POSES EXISTS AT EVERY TIER. A missing pose does
   not throw: sheetFrames falls back per lookup and the villager stands
   about instead of swinging, which is exactly the "it's not clear that
   it's chopping stone" complaint wearing different clothes. Read off the
   shipped directory, because the strips load lazily for the tier a hall
   happens to be standing at and an in-page probe would only ever see one
   of the three. */
{
  const { readdirSync } = await import('node:fs');
  const files = new Set(readdirSync(join(root, 'assets/units')));
  const WORK = ['mine', 'gather', 'farm', 'pick', 'reach', 'build'];
  const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const miss = [];
  let have = 0;
  for (const lv of [1, 2, 3]) for (const g of ['m', 'f']) for (const pose of WORK) for (const d of DIRS) {
    const f = 'unit-villager-l' + lv + '-' + g + '-' + d + '-' + pose + '.png';
    if (files.has(f)) have++; else miss.push(f);
  }
  const quarry = miss.filter(f => f.endsWith('-mine.png'));
  out.res.everyTierCarriesTheQuarryPose = (quarry.length ? 'FAIL — ' + quarry.join(', ')
    : 'PASS — the quarry pose at 8 facings on all 3 tiers, both genders');
  if (quarry.length) out.fails.push('everyTierCarriesTheQuarryPose');
  out.res.andEveryOtherWorkPoseToo = (miss.length ? 'FAIL — ' + miss.slice(0, 6).join(', ')
    : 'PASS — ' + have + ' tier/gender/pose/facing strips, none missing');
  if (miss.length) out.fails.push('andEveryOtherWorkPoseToo');
}

console.log(JSON.stringify(out.res, null, 1).replace(/[{}",]/g, ''));
if (errs.length) console.log('errors:', errs.slice(0, 6));
if (out.fails.length || errs.some(e => !e.includes('favicon') && !e.includes('429') && !e.includes('ERR_FILE_NOT_FOUND'))) {
  console.log('FAILURES:', out.fails.join(', ') || '(page errors)');
  process.exit(1);
}
console.log('ALL VILLAGER-TIER CHECKS PASS');
await b.close();
