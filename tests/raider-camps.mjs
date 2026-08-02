/* BARBARIAN CAMP CONTRACT — the far country is not empty scenery.

   A camp used to be a picture on the ground: `T.CAMP` terrain, a wave muster
   point, and nothing you could do about it. It is now a BUILDING owned by 'R',
   standing on that trampled ground, and the rules are:

     TENDED     Always. A camp is manned the day the map is made, from the
                mode's `campGuard` band, and it RE-MANS itself: a tender that
                falls is replaced after CFG.RAIDER_CAMPS.remanDays. Clearing
                the band is an afternoon's work; taking the ground is not.

     MILLING    Tenders are not a war party. They wander their own ground
                (guardR), fight whatever walks into it (chaseR) and never set
                off across the map after a villager they glimpsed — which is
                what makes a trip past one dangerous WITHOUT turning every camp
                into a permanent invasion. The stranded-raider backstop in
                units.js must skip them, or every camp empties in a minute.

     BURNABLE   It has hp. Pull it down and the ground is won: no more spears
                are raised there, no wave musters there again, and its standing
                band goes loose (Combat.raiderSeek drops the post).

     SCALED     How many camps the map carries is the size factor times the
                mode's `campMult`; how many tend each comes from `campGuard`.
                Both go up with difficulty and with the board.

   Run this after touching any of:
     config.js — CFG.RAIDER_CAMPS, MODES[*].campMult / campGuard,
                 CFG.BUILDINGS.raidercamp
     map.js — the camp pass in MapGen.generate
     game.js — plantRaiderCamp / manRaiderCamp / campQuota / tickRaiderCamps
     combat.js — the camp-tender branch in raiderSeek, the wave muster filter
     units.js — the stranded-'R' backstop
     buildings.js — the 'R' branch in damage
     sprites.js — Sprites.terrain[T.CAMP], B_DRAW.raidercamp

     node tests/raider-camps.mjs      # exits non-zero on any regression */
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
  const campsOf = () => Bld.list('R').filter(z => z.key === 'raidercamp');
  const survey = (mode, size, runs) => {
    let camps = 0, tenders = 0, n = 0, unmanned = 0;
    for (let s = 0; s < runs; s++) {
      G.newGame('rc-' + mode + size + s, mode, size);
      Screens._demo = false; Screens.show('playing'); S.paused = true;
      const cs = campsOf();
      for (const c of cs) if (G.campTenders(c).length === 0) unmanned++;
      camps += cs.length; n++;
      tenders += S.units.filter(u => u.owner === 'R' && u.campId).length;
    }
    return { camps: camps / n, per: tenders / Math.max(1, camps), unmanned };
  };

  // ---- 1. every camp is manned, from the mode's band ----
  {
    const mod = survey('moderate', 'large', 4);
    ck('everyCampIsTended', mod.unmanned === 0 && mod.per >= 1,
      mod.per.toFixed(1) + ' tenders a camp, none standing empty');
    const band = CFG.MODES.moderate.campGuard;
    ck('withinTheModesBand', mod.per >= band[0] && mod.per <= band[1], JSON.stringify(band));
    ck('theyAreHostileToEveryone',
      S.units.filter(u => u.campId).every(u => u.hostileTo === 'ALL'),
      'a camp band answers to nobody');
  }

  // ---- 2. more camps, and more spears, as it gets harder and bigger ----
  {
    const calm = survey('calm', 'xlarge', 3), hard = survey('hard', 'xlarge', 3);
    ck('harderMeansMoreCamps', hard.camps > calm.camps,
      'calm ' + calm.camps.toFixed(1) + ' → hard ' + hard.camps.toFixed(1) + ' on the same board');
    ck('harderMeansBiggerBands', hard.per > calm.per,
      'calm ' + calm.per.toFixed(1) + ' → hard ' + hard.per.toFixed(1) + ' a camp');
    const small = survey('moderate', 'medium', 3), big = survey('moderate', 'xlarge', 3);
    ck('moreGroundMoreCamps', big.camps > small.camps,
      'medium ' + small.camps.toFixed(1) + ' → xlarge ' + big.camps.toFixed(1));
    ck('theScalingIsInTheModeTable',
      CFG.MODES.calm.campMult < CFG.MODES.moderate.campMult &&
      CFG.MODES.moderate.campMult < CFG.MODES.hard.campMult &&
      CFG.MODES.hard.campGuard[0] > CFG.MODES.calm.campGuard[0], '');
  }

  // ---- 3. tenders MILL: they hold their ground and never march off ----
  {
    G.newGame('rc-mill', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const camp = campsOf()[0];
    ck('theCampIsAStandingBuilding',
      !!camp && camp.owner === 'R' && camp.hp === CFG.BUILDINGS.raidercamp.levels[0].hp &&
      S.map.terrain[MapGen.idx(camp.x, camp.y)] === T.CAMP,
      'a building on trampled ground, not a picture of one');
    ck('andItIsGroundYouWalkAround', Bld.solid('raidercamp') === true, '');
    const band = G.campTenders(camp).slice();
    for (let t = 0; t < 1500; t++) { Units.update(0.1); Combat.update(0.1); }
    const live = band.filter(u => Units.get(u.id));
    const far = Math.max(...live.map(u => Math.hypot(u.x - camp.x, u.y - camp.y)));
    ck('theyDoNotMeltAway', live.length === band.length,
      live.length + '/' + band.length + ' still at the fire after two and a half minutes');
    ck('andTheyStayHome', far <= (CFG.RAIDER_CAMPS.guardR || 5) + 2,
      'furthest wandered ' + far.toFixed(1) + ' tiles');
    ck('butTheyDidMOVE', live.some(u => Math.hypot(u.x - camp.x, u.y - camp.y) > 0.9),
      'milling, not statues');
    window.__camp = camp.id;
  }

  // ---- 4. …and they fight whatever walks in ----
  {
    const camp = Bld.get(window.__camp);
    const tender = G.campTenders(camp)[0];
    // on GROUND a villager could actually be standing on — dropped in a
    // treeline it is unreachable and the tender is right to ignore it
    const near = MapGen.findNear(camp.x + 2, camp.y, 2,
      (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
    const v = Units.spawn('villager', 'P', near.x, near.y);
    Combat.raiderSeek(tender);
    ck('astrayVillagerIsPrey', tender.tUnit === v.id,
      'tUnit=' + tender.tUnit + ' at ' + near.x + ',' + near.y);
    S.units.splice(S.units.indexOf(v), 1);
    // …but a villager far off across the map is not worth leaving the fire for
    let spot = null;
    for (let y = 1; y < CFG.H - 1 && !spot; y++) for (let x = 1; x < CFG.W - 1; x++) {
      if (Math.hypot(x - camp.x, y - camp.y) < 15) continue;
      if (Path.passable(x, y, 'P') && !Bld.at(x, y)) { spot = { x, y }; break; }
    }
    const far = Units.spawn('villager', 'P', spot.x, spot.y);
    tender.tUnit = 0;
    Combat.raiderSeek(tender);
    ck('butTheFarCountryIsNotTheirBusiness', tender.tUnit === 0,
      'a camp band is not a war party (a villager ' +
      Math.round(Math.hypot(spot.x - camp.x, spot.y - camp.y)) + ' tiles off is left alone)');
    S.units.splice(S.units.indexOf(far), 1);
  }

  // ---- 5. the camp re-mans itself ----
  {
    const camp = Bld.get(window.__camp);
    const quota = camp.quota;
    for (const u of G.campTenders(camp).slice()) S.units.splice(S.units.indexOf(u), 1);
    ck('aBandCanBeCutDown', G.campTenders(camp).length === 0, '');
    for (let d = 0; d < (CFG.RAIDER_CAMPS.remanDays || 6) - 1; d++) G.dayTick();
    ck('andTheGroundIsQuietForADayOrTwo', G.campTenders(camp).length === 0,
      'not instant — CFG.RAIDER_CAMPS.remanDays is ' + CFG.RAIDER_CAMPS.remanDays);
    for (let d = 0; d < (CFG.RAIDER_CAMPS.remanDays || 6) * (quota + 1); d++) G.dayTick();
    ck('butTheCampRaisesMoreSpears', G.campTenders(camp).length === quota,
      G.campTenders(camp).length + ' back, to its own quota of ' + quota);
  }

  // ---- 6. burn it out and the ground is won ----
  {
    const camp = Bld.get(window.__camp);
    const band = G.campTenders(camp).slice();
    const before = campsOf().length;
    Bld.damage(camp, 999999);
    ck('aCampCanBeBurnedOut',
      campsOf().length === before - 1 && !Bld.get(window.__camp), '');
    for (const u of band) Combat.raiderSeek(u);
    ck('itsBandGoesLoose', band.every(u => !u.campId),
      'no post to hold — they hunt like any other band now');
    for (let d = 0; d < (CFG.RAIDER_CAMPS.remanDays || 6) * 3; d++) G.dayTick();
    ck('andNoMoreSpearsAreRaisedThere',
      !S.units.some(u => u.campId === window.__camp), '');
    // …and no wave ever musters there again
    const still = campsOf();
    const listed = (S.map.spawns.camps || []).filter(c => {
      const cb = Bld.at(c.x, c.y);
      return cb && cb.owner === 'R' && cb.key === 'raidercamp';
    });
    ck('norDoesAWaveMusterThere', listed.length === still.length && listed.length < (S.map.spawns.camps || []).length,
      listed.length + ' of ' + (S.map.spawns.camps || []).length + ' muster points still standing');
  }

  // ---- 7. it looks like nobody's tribe ----
  {
    const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
    ck('theCampHasItsOwnArt',
      !!Sprites.building.raidercamp && px(Sprites.building.raidercamp[0]) > 700, '');
    ck('andTheGroundUnderItIsBare',
      px(Sprites.terrain[T.CAMP][0]) > 200 &&
      Sprites.terrain[T.CAMP][0].toDataURL() !== Sprites.building.raidercamp[0].toDataURL(),
      'trampled earth — what is LEFT when the camp burns');
    ck('itIsNotInTheBuildMenu', UI.MENU_KEYS.indexOf('raidercamp') < 0,
      'nobody raises one of these');
  }

  /* ---- 6. AND YOU CAN ACTUALLY ORDER THE ATTACK ----
     Making the camp a building is only half of "burnable": the tap has to
     issue the order. It didn't. Every foe-building tap in ui.js asked
     `owner === 'A'`, and a camp is owned by 'R' — so a war party stood beside
     one being told ABOUT it, with no way to pull it down. All three tap sites
     now go through Bld.foeBld(b, owner): anything not yours that can be hurt,
     the rival's works and a barbarian camp alike. */
  {
    G.newGame('rc6', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    const camp = S.buildings.find(z => z.key === 'raidercamp');
    ck('aCampIsSomethingYouMayAttack',
      !!camp && camp.owner === 'R' && Bld.foeBld(camp, 'P') === true,
      camp ? 'owner ' + camp.owner : 'no camp on the map');
    // …and it is not a target for the band that lives in it
    ck('butNotForItsOwnBand', Bld.foeBld(camp, 'R') === false, '');
    const spot = MapGen.findNear(camp.x + 2, camp.y, 6,
      (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
    const s2 = Units.spawn('defender', 'P', spot.x, spot.y);
    s2.x = spot.x + 0.5; s2.y = spot.y + 0.5;
    UI.select('unit', s2.id);
    const TL = CFG.TILE, z = R.cam.z;
    UI.handleTap((camp.x + 0.5) * TL * z - R.cam.x * z, (camp.y + 0.5) * TL * z - R.cam.y * z);
    ck('tappingItOrdersTheAttack',
      s2.task && s2.task.type === 'attackBld' && s2.tBld === camp.id,
      s2.task ? s2.task.type + ' / tBld ' + s2.tBld : 'no order given');
    // …and the blows land, and it comes down
    const hp0 = camp.hp;
    for (let i = 0; i < 6; i++) {
      const q = Units.spawn('defender', 'P', spot.x, spot.y);
      q.x = spot.x + 0.5 + i * 0.2; q.y = spot.y + 0.5;
      Units.orderAttackBuilding(q, camp);
    }
    for (let i = 0; i < 4000 && Bld.get(camp.id); i++) { Units.update(0.05); Combat.update(0.05); }
    ck('andTheCampBurnsDown', !Bld.get(camp.id) && camp.hp < hp0,
      'hp ' + Math.round(camp.hp) + '/' + camp.maxhp);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RAIDER-CAMP CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
