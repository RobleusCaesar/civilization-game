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

  /* ---- 4b. AND THE CHASE IS LEASHED TOO ----
     Keeping ACQUISITION inside the camp's ground was only half the rule: with
     a mark in hand the chase ran on the generic 10-tile anchor leash — twice
     the camp's own ground — and everything a barbarian frightens runs HOME. A
     village's people flee to their hall, so the band followed them there and
     stood outside somebody's town killing whoever came out, day after day. On
     a passive-player sim that alone cost the rival 47 villagers by day 200 on
     one seed (its income is paid per LIVING hand), and the day-219 save that
     found this had a rival with 9 buildings and a level-1 hall. */
  {
    const camp = Bld.get(window.__camp);
    const cR = CFG.RAIDER_CAMPS.chaseR || 7;
    const tender = G.campTenders(camp)[0];
    const near = MapGen.findNear(camp.x + 2, camp.y, 2,
      (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
    const v = Units.spawn('villager', 'P', near.x, near.y);
    Combat.raiderSeek(tender);
    ck('theTenderTakesTheMarkInItsYard', tender.tUnit === v.id, '');
    // …now the villager bolts for its hall, the way a frightened villager does
    let spot = null;
    for (let y = 1; y < CFG.H - 1 && !spot; y++) for (let x = 1; x < CFG.W - 1; x++) {
      if (Math.hypot(x - camp.x, y - camp.y) < cR + 6) continue;
      if (Path.passable(x, y, 'P') && !Bld.at(x, y)) { spot = { x, y }; break; }
    }
    v.x = spot.x + 0.5; v.y = spot.y + 0.5;
    ck('aRunnerThatLeavesTheYardIsLetGo', Combat.campLeash(tender, v) === true,
      'the quarry is ' + Math.round(Math.hypot(v.x - camp.x, v.y - camp.y)) + ' tiles off');
    ck('andTheChaseIsDropped', tender.tUnit === 0, '');
    ck('homeIsAlwaysTheFire',
      Math.abs(tender.anchor.x - (camp.x + 0.5)) < 0.01 &&
      Math.abs(tender.anchor.y - (camp.y + 0.5)) < 0.01,
      'the generic leash measures from u.anchor, and a walk home that ends ' +
      'short re-anchors where it stopped — that ratchet is what let a tender ' +
      'end up 19 tiles from its camp');
    // …and run live, the band never ends up out at the runner
    tender.tUnit = v.id;
    for (let t = 0; t < 400; t++) { Units.update(0.1); Combat.update(0.1); }
    const far2 = Math.max(...G.campTenders(camp).map(u => Math.hypot(u.x - camp.x, u.y - camp.y)));
    ck('soTheBandIsStillAtItsCamp', far2 <= cR + 2,
      'furthest ' + far2.toFixed(1) + ' tiles (the old anchor leash allowed 10, and ratcheted past it)');
    S.units.splice(S.units.indexOf(v), 1);
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

  /* ---- 7. A CAMP STANDS IN THE WILD COUNTRY ----
     The clearance from a town is DERIVED: a camp's tenders hold ground out to
     chaseR and a town lays buildings out to ~7 tiles from its hall, so any
     less puts a war band's yard on top of somebody's lumber camp. */
  {
    const cR = CFG.RAIDER_CAMPS.chaseR || 7;
    let worst = 1e9;
    for (let s = 0; s < 4; s++) {
      G.newGame('rc-clear' + s, 'moderate', 'large');
      Screens._demo = false; Screens.show('playing'); S.paused = true;
      const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
      for (const c of campsOf())
        worst = Math.min(worst, Math.hypot(c.x - ptc.x, c.y - ptc.y), Math.hypot(c.x - atc.x, c.y - atc.y));
    }
    ck('noCampOnATownsDoorstep', worst > cR + 7,
      'nearest camp to a hall across four boards: ' + worst.toFixed(1) + ' tiles');
  }

  /* ---- 8. AND THE CHIEF DOES NOT WORK IN A WAR BAND'S YARD ----
     The other half of the bleed: the rival kept siting stations (and claiming
     gold seams) inside a camp's ground, and sent another hand the moment the
     last one was cut down — a conveyor, one villager every few days. */
  {
    G.newGame('rc-yard', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const atc = Bld.tcOf('A');
    // plant a camp right at the edge of the rival's building ring, and let the
    // chief SEE it (fog-honest: an unseen camp is ground it has no reason to shun)
    const cs = MapGen.findNear(atc.x + 6, atc.y, 6,
      (x, y) => Path.passable(x, y) && !Bld.at(x, y) && MapGen.onBoard(x, y));
    const camp = G.plantRaiderCamp(cs.x, cs.y);
    if (!S.ai.seen || !S.ai.seen.length) S.ai.seen = new Array(CFG.W * CFG.H).fill(0);
    S.ai.seen[MapGen.idx(camp.x, camp.y)] = 1;
    const cR2 = CFG.RAIDER_CAMPS.chaseR || 7;
    ck('theYardIsGroundTheChiefKnowsToShun',
      AI.campGround(camp.x + 1, camp.y) === true &&
      AI.campGround(camp.x, camp.y + cR2 + 4) === false,
      'the yard reaches chaseR from the fire and no further');
    let inYard = 0;
    for (let i = 0; i < 40; i++) {
      const s2 = AI.plot('house');
      if (s2 && AI.campGround(s2.x, s2.y)) inYard++;
    }
    ck('soNoStationIsLaidInIt', inYard === 0, inYard + '/40 plots fell inside the camp ground');
    // a gold seam in the yard is not worth a hand either
    const seam = MapGen.findNear(camp.x + 1, camp.y, 2,
      (x, y) => Path.passable(x, y) && !Bld.at(x, y) && MapGen.onBoard(x, y));
    for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++)
      if (S.map.terrain[MapGen.idx(x, y)] === T.GOLDORE) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    S.map.terrain[MapGen.idx(seam.x, seam.y)] = T.GOLDORE;
    S.ai.seen[MapGen.idx(seam.x, seam.y)] = 1;
    ck('norIsASeamInItClaimed', AI.plotMine() === null,
      'the only seam it can see stands ' +
      Math.round(Math.hypot(seam.x - camp.x, seam.y - camp.y)) + ' tiles from the fire');
    // …but burn the camp out and the ground is ordinary again
    Bld.removeToRuin(camp);
    ck('untilTheCampIsBurnedOut',
      AI.campGround(seam.x, seam.y) === false && !!AI.plotMine(), '');
  }

  /* ---- 9. THE WILDS EASE OFF A GUTTED TOWN (G.barbEase) ----
     Barbarians SEASON a war; they must never decide it. A rival ground down to
     a hall and a field of ash by war bands robs the player of the victory they
     spent two hundred days working toward — you march up expecting the fight of
     the game and find an empty village. So a town that got established and then
     fell apart is left alone until it is back on its feet. */
  {
    G.newGame('rc-ease', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.notePeaks();
    // A THIN OPENING IS NOT A GUTTED TOWN. The ease is for a village that stood
    // and fell; a hard first week is the player's to have.
    for (const u of S.units.filter(z => z.owner === 'P' && Units.isVillager(z)))
      S.units.splice(S.units.indexOf(u), 1);
    ck('aThinOpeningIsNotEased',
      Units.count('P', z => Units.isVillager(z)) === 0 && G.barbEase('P') === false,
      'peak ' + S.peakTown.P + ' — it never got established, so there is no fall to cushion');
    S.peakTown.P = 14;                       // …but this one did
    ck('butAGuttedTownIs', G.barbEase('P') === true,
      G.townSize('P') + ' left of a town that stood at 14');
    ck('andItIsMeasuredOnFinishedWorks',
      G.townSize('P') === Bld.list('P').filter(z => Bld.done(z) && z.key !== 'wall' && z.key !== 'gate').length,
      'a curtain is raised and razed constantly and says nothing about a village');
    // a COLLAPSED player is being ENDED, not nursed — the bands finish the run
    S.collapse = true;
    ck('aCollapsedRunIsNeverNursed', G.barbEase('P') === false, '');
    S.collapse = false;
  }
  {
    // …the whole wilderness quietens while it rebuilds
    G.newGame('rc-ease2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.notePeaks();
    S.wave.count = 4; S.wave.next = S.day;
    const before = (() => { Combat.maybeWave(); const g = S.wave.next - S.day; return g; })();
    S.peakTown.A = 14;
    ck('theRivalReadsAsGutted', G.barbEase('A') === true && G.barbEase('P') === false, '');
    S.wave.next = S.day;
    Combat.maybeWave();
    const after = S.wave.next - S.day;
    ck('theWaveClockStretches', after > before, before + ' days between waves → ' + after);
    ck('andNoBandMarchesOnIt',
      S.units.filter(z => z.owner === 'R' && !z.campId).every(z => z.hostileTo !== 'A'),
      'the temper is re-aimed at whoever is still standing');
    // both on their knees: the wilds simply have nothing to take today
    S.peakTown.P = 14;
    const n0 = S.units.filter(z => z.owner === 'R' && !z.campId).length;
    S.wave.next = S.day; Combat.maybeWave();
    ck('withBothDownNoWaveMustersAtAll',
      S.units.filter(z => z.owner === 'R' && !z.campId).length === n0, '');
  }
  {
    // a band ALREADY in the field drops the gutted town off its list too
    G.newGame('rc-ease3', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.notePeaks();
    const atc = Bld.tcOf('A');
    const sp = MapGen.findNear(atc.x + 3, atc.y + 3, 8,
      (x, y) => Path.passable(x, y, 'R') && !Bld.at(x, y));
    const band = Units.spawn('raider', 'R', sp.x, sp.y);
    band.hostileTo = 'ALL';
    const vsp = MapGen.findNear(sp.x + 1, sp.y, 3,
      (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
    const vic = Units.spawn('villager', 'A', vsp.x, vsp.y);
    Combat.raiderSeek(band);
    const mk0 = Units.get(band.tUnit) || Bld.get(band.tBld);
    ck('anOrdinaryTownIsStillHunted', !!mk0 && mk0.owner === 'A',
      mk0 ? mk0.owner + ':' + (mk0.kind || mk0.key) : 'nothing was taken as a mark');
    band.tUnit = 0; band.tBld = 0;
    S.peakTown.A = 14;                                  // now it is on its knees
    Combat.raiderSeek(band);
    const tb = Bld.get(band.tBld);
    ck('aGuttedOneIsPassedOver',
      band.tUnit !== vic.id && (!tb || tb.owner !== 'A'),
      'tUnit ' + band.tUnit + ' / tBld ' + (tb ? tb.owner + ':' + tb.key : 'none'));
    // …but a camp's own tenders are DEFENDING, not choosing a town to sack
    const camp = campsOf()[0];
    const tender = G.campTenders(camp)[0];
    const tsp = MapGen.findNear(camp.x + 2, camp.y, 3,
      (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
    const stray = Units.spawn('villager', 'A', tsp.x, tsp.y);
    tender.tUnit = 0;
    Combat.raiderSeek(tender);
    ck('butATenderStillHoldsItsOwnGround', tender.tUnit === stray.id,
      'walking into a war band\'s fire is dangerous whoever you are');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RAIDER-CAMP CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
