/* THE LEVY — the whole village called to arms, and stood down again.

   The rules this file pins:

     ONE BIT, DERIVED         S.levy is the mode (in every save; legacy saves
     EVERYWHERE               load false). Units.isLevied DERIVES membership —
                              nothing is stamped on a unit, so a villager
                              trained mid-levy is levied, a save round-trip
                              loses nothing, and stand-down has nothing to
                              restore.

     THE STATS ARE THE        effAtk answers max(atk, LEVY.atk) — the lodge
     TOOL IN THEIR HANDS      L3 armed village (base+4) still counts for MORE,
                              never less. effDef adds LEVY.def on top of the
                              stamped stat, read at the damage formula (the
                              only place def decides anything).

     THE PRICE IS THE         A levied hand eats at the MILITARY rate for as
     LARDER                   long as the mode holds. Holding the levy up
                              drains the stores — a stance, not a free
                              upgrade.

     THE LEVY WORKS           Every work order refuses while under arms —
     NOTHING                  gather, build, station, seam claim, shore
                              fishing, auto-dispatch — with the reason in the
                              toast (rule 4). Stand the mode down first;
                              Back to work then returns each hand to the
                              exact post it left (the horn's own memory).

     IT HOLDS THE TOWN,       Auto-acquisition is bounded by MILITIA_RANGE of
     IT DOES NOT RANGE        the hall BOTH ways — the same perimeter the
                              rival's townsfolk militia holds. Explicit
                              orders are the player's business.

     IT BANDS AND FIGHTS      Levied hands group like soldiers and take the
     UNDER DOCTRINE           Strike/Chaos doctrines; Siege never renders
                              (the artillery gate refuses a band with no
                              battery). A struck levied hand stands and
                              fights instead of fleeing.

   Run after touching: Units.isLevied / raiseLevy / standDownLevy / effAtk /
   effDef / foodUpkeep / offDuty / nearestIdleVillager / the assign* gates,
   Combat.acquire's levy branch, UI.levyBlocks / landFighter / the TC panel's
   levy lever, or CFG.LEVY.

     node tests/levy.mjs      # exits non-zero on any regression */

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
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, info) => { res[n] = ok ? 'PASS' : 'FAIL ' + (info || ''); if (!ok) fails.push(n); };
  const vills = () => S.units.filter(u => u.owner === 'P' && Units.isVillager(u));

  // ---- a clean stage: bare ground, a wood to work, a farm to staff ----
  const stage = (seed) => {
    G.newGame(seed, 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    for (let dy = -9; dy <= 10; dy++) for (let dx = -9; dx <= 10; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y)) continue;
      const at = Bld.at(x, y);
      if (at && at.key !== 'tc') Bld.removeToRuin(at);
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      S.map.explored[MapGen.idx(x, y)] = 1;
    }
    S.units = S.units.filter(u => u.owner !== 'P');
    S.garrison = [];
    S.ashes = [];
    Bld._block = null;
    G.freeVis = true; G.updateVisibility();
    return tc;
  };

  /* ---- 1. the mode: one bit, derived everywhere ---- */
  {
    const tc = stage('levy1');
    const wood = { x: tc.x + 3, y: tc.y + 3 };
    S.map.terrain[MapGen.idx(wood.x, wood.y)] = T.FOREST;
    S.map.resAmount[MapGen.idx(wood.x, wood.y)] = 400;
    const v1 = Units.spawn('villager', 'P', tc.x - 2, tc.y + 3);
    const v2 = Units.spawn('villager', 'P', tc.x + 1, tc.y + 4);
    Units.assignGather(v1, wood.x, wood.y);
    ck('aVillageAtPeaceIsNotLevied', !Units.isLevied(v1) && !S.levy, '');

    const n = Units.raiseLevy();
    ck('theWholeVillageAnswers', n === 2 && S.levy, n + ' hands');
    ck('membershipIsDerived', Units.isLevied(v1) && Units.isLevied(v2), '');
    ck('toolsWentDownWhereTheyStood', !v1.task && !v2.task, '');
    ck('andTheInterruptionRemembers', v1.post && v1.post.type === 'gather',
      'the gatherer must carry its post through the levy: ' + JSON.stringify(v1.post));

    // a villager trained MID-LEVY is levied too — nothing to stamp
    const v3 = Units.spawn('villager', 'P', tc.x, tc.y + 5);
    ck('aHandTrainedMidLevyIsLevied', Units.isLevied(v3), '');
    S.units = S.units.filter(u => u.id !== v3.id);

    /* ---- 2. the stats are the tool in their hands ---- */
    ck('theLevyFightsAtItsFigure', Math.round(Units.effAtk(v1)) >= CFG.LEVY.atk,
      'effAtk ' + Units.effAtk(v1) + ' vs LEVY.atk ' + CFG.LEVY.atk);
    ck('andARaisedToolTurnsABlow', Units.effDef(v1) === (v1.def || 0) + CFG.LEVY.def,
      'effDef ' + Units.effDef(v1));

    // the lodge L3 armed village counts for MORE, never less
    S.buildings.push({ id: 9901, key: 'lodge', owner: 'P', level: 3, x: tc.x - 5, y: tc.y - 5,
      hp: 100, maxhp: 100, construction: 0, upgrading: 0 });
    const armedAtk = Units.effAtk(v1);
    S.buildings = S.buildings.filter(b2 => b2.id !== 9901);
    ck('theArmedVillageStillCountsForMore', armedAtk >= CFG.UNITS.villager.atk + 4,
      'lodge L3 spears must not be lowered by the levy: ' + armedAtk);

    /* ---- 3. the price is the larder ---- */
    const U = CFG.FOOD_UPKEEP;
    const perHand = Units.foodUpkeep('P') / vills().length;
    ck('aLeviedHandEatsLikeASoldier', Math.abs(perHand - U.military) < 0.001,
      perHand + ' vs military ' + U.military);
    S.levy = false;
    const perHandDown = Units.foodUpkeep('P') / vills().length;
    ck('andStoodDownEatsLikeAVillager', Math.abs(perHandDown - U.villager) < 0.001,
      perHandDown + ' vs villager ' + U.villager);
    S.levy = true;

    /* ---- 4. the levy works nothing ---- */
    ck('gatherRefuses', !Units.assignGather(v1, wood.x, wood.y), '');
    ck('shoreFishingRefuses', !Units.assignShoreFish(v1, wood.x, wood.y), '');
    const site = Bld.place('P', 'house', tc.x - 3, tc.y + 4, { free: true });
    ck('buildRefuses', site ? !Units.assignBuild(v1, site) : false, '');
    ck('autoDispatchFindsNobody', !Units.nearestIdleVillager(tc.x, tc.y),
      'a levied hand is not idle labor');
    ck('andIsNotOffDuty', !Units.offDuty(v1),
      'Back to work must never pull a fighter off the line');
    ck('soTheHornHasNobodyToSend', Units.hornPending('P') === 0, '');
    if (site) Bld.removeToRuin(site);
    S.ashes = [];

    /* ---- 5. it holds the town, it does not range ---- */
    Combat._militiaOn = false;
    const near = Units.spawn('raider', 'R', tc.x + 4, tc.y + 2);      // inside the perimeter
    const far = Units.spawn('raider', 'R', tc.x + Combat.MILITIA_RANGE + 6, tc.y);   // beyond it
    v1.tUnit = 0; v2.tUnit = 0; v1.task = null; v2.task = null;
    Combat.acquire();
    ck('theLevyEngagesTheRaiderInTown', v1.tUnit === near.id || v2.tUnit === near.id,
      'tUnits: ' + v1.tUnit + ',' + v2.tUnit + ' near=' + near.id);
    ck('andNeverRangesAfterTheFarOne', v1.tUnit !== far.id && v2.tUnit !== far.id,
      'the perimeter is MILITIA_RANGE of the hall, both ways');

    // a struck levied hand stands and fights — no flee task, a mark instead
    v1.tUnit = 0; v1.task = null;
    Units.damage(v1, 3, near.id);
    ck('aStruckHandStandsAndFights', v1.tUnit === near.id && (!v1.task || v1.task.type !== 'flee'),
      'tUnit ' + v1.tUnit + ' task ' + JSON.stringify(v1.task));

    /* ---- 5b. THE CHASE IS LEASHED, AND A SPENT ORDER IS SPENT ----
       (both from the adversarial review of the first cut). A villager is
       neither wild nor military, so the generic chase leash answered 0 and a
       withdrawing foe dragged the levy across the map; and an explicit
       attack's task {type:'attack'} survived the kill, wedging the hand out
       of its own acquire branch forever with a Stop button lit over it. */
    {
      const runner = Units.spawn('raider', 'R', tc.x + 4, tc.y + 4);
      v2.task = null; v2.tUnit = 0;
      Combat.acquire();
      const chaser = [v1, v2].find(u => u.tUnit === runner.id);
      ck('theChaseHasALeash', !!chaser, 'somebody must have acquired the runner');
      if (chaser) {
        runner.x = tc.x + 30.5; runner.y = tc.y + 0.5;    // it withdraws far past the ring
        chaser.x = chaser.anchor.x + 11; chaser.y = chaser.anchor.y;   // …and the chase crossed the leash
        Combat.update(0.05);
        ck('andTheRunnerIsLetGo', chaser.tUnit !== runner.id,
          'leash 10 from the acquisition anchor — the levy never ranges');
      }
      S.units = S.units.filter(u => u.id !== runner.id);
      for (const u of [v1, v2]) { u.tUnit = 0; u.task = null; u.path = null; }

      const mark = Units.spawn('raider', 'R', tc.x + 3, tc.y + 3);
      v1.task = { type: 'attack' }; v1.tUnit = 0;         // the order outlived its kill
      Combat.acquire();
      ck('aSpentOrderIsSpent', v1.tUnit === mark.id && (!v1.task || v1.task.type !== 'attack'),
        'the stale attack task must not wedge the hand: tUnit ' + v1.tUnit + ' task ' + JSON.stringify(v1.task));
      S.units = S.units.filter(u => u.id !== mark.id);
      for (const u of [v1, v2]) { u.tUnit = 0; u.task = null; u.path = null; }

      // and the rival's townsfolk answer a levy at their door like any war
      // party — the mirror reflects both ways (militiaFoe)
      ck('theMirrorReflectsBothWays', S.peace === false ? Combat.militiaFoe(v1) : true,
        'a levied hand at the rival hall must read as an attacker');
    }

    S.units = S.units.filter(u => u.owner !== 'R');
    // the leash test physically moved the chaser — stand the pair back
    // side by side before asking who is in banding reach
    v1.x = tc.x - 2 + 0.5; v1.y = tc.y + 3 + 0.5;
    v2.x = tc.x + 1 + 0.5; v2.y = tc.y + 4 + 0.5;
    for (const u of [v1, v2]) { u.tUnit = 0; u.task = null; u.path = null; u.anchor = { x: u.x, y: u.y }; }

    /* ---- 6. it bands and fights under doctrine ---- */
    ck('leviedHandsBandTogether', UI.groupmatesNear(v1), '');
    UI.sel = { type: 'group', ids: [v1.id, v2.id] };
    UI.tacticsOpen = true;
    UI.renderPanel();
    const q = sel2 => document.querySelector('#panel ' + sel2);
    ck('theBandIsNamedTheLevy', (q('.ptitle') || {}).textContent.includes('Levy'),
      (q('.ptitle') || {}).textContent);
    ck('strikeIsOffered', !!q('[data-act="gstrat"][data-strat="strike"]'), '');
    ck('chaosIsOffered', !!q('[data-act="gstrat"][data-strat="chaos"]'), '');
    ck('siegeIsNot', !q('[data-act="gstrat"][data-strat="siege"]'),
      'a levy has no battery — the artillery gate refuses');
    q('[data-act="gstrat"][data-strat="strike"]').click();
    ck('theDoctrineTakes', v1.strat === 'strike' && v2.strat === 'strike', '');

    // a MIXED band (a catapult brings the battery) may arm Siege — but the
    // stamp lands on the soldiers alone: siegeOrder's own pick excludes
    // levied hands, so a doctrine they carried would be one no code honours
    {
      const cat = Units.spawn('catapult', 'P', tc.x + 2, tc.y + 5);
      UI.sel = { type: 'group', ids: [v1.id, v2.id, cat.id] };
      UI.tacticsOpen = true; UI.renderPanel();
      const sg = q('[data-act="gstrat"][data-strat="siege"]');
      ck('aBatteryBringsSiegeBack', !!sg, 'the artillery gate reads the whole band');
      sg.click();
      ck('butSiegeNeverLandsOnALeviedHand',
        cat.strat === 'siege' && v1.strat !== 'siege' && v2.strat !== 'siege',
        'cat ' + cat.strat + ' hands ' + v1.strat + '/' + v2.strat);
      S.units = S.units.filter(u => u.id !== cat.id);
      for (const u of [v1, v2]) u.strat = 'strike';
      UI.sel = { type: 'group', ids: [v1.id, v2.id] };
    }

    /* ---- 7. stand down: doctrines drop, Back to work takes over ---- */
    const n2 = Units.standDownLevy();
    ck('standDownReachesEveryHand', n2 === 2 && !S.levy, '');
    ck('doctrinesDropWithTheMode', !v1.strat && !v2.strat, '');
    ck('andThePostsSurviveTheWholeArc', v1.post && v1.post.type === 'gather', JSON.stringify(v1.post));
    ck('soBackToWorkHasHandsToSend', Units.hornPending('P') >= 1,
      'pending ' + Units.hornPending('P'));
    const r = Units.backToWork('P');
    ck('andTheGathererGoesBackToItsSeam', r.sent >= 1 && v1.task && v1.task.type === 'gather',
      JSON.stringify(v1.task));
  }

  /* ---- 8. the panel: the lever lives at the hall, and tells the truth ---- */
  {
    const tc = stage('levy2');
    Units.spawn('villager', 'P', tc.x - 2, tc.y + 3);
    Units.spawn('villager', 'P', tc.x + 3, tc.y + 3);
    UI.select('bld', tc.id);
    const q = sel2 => document.querySelector('#panel ' + sel2);
    ck('theHallOffersTheLevy', !!q('[data-act="levy"]'), '');
    ck('andTheLabelSaysRaise', q('[data-act="levy"]').textContent.includes('Raise the levy'), '');
    const sig0 = UI.panelSig();
    q('[data-act="levy"]').click();
    ck('oneTapRaisesIt', S.levy, '');
    ck('theLeverIsInTheSignature', UI.panelSig() !== sig0, 'the label must flip without a reselect');
    UI.renderPanel();
    ck('andNowItSaysStandDown', q('[data-act="levy"]').textContent.includes('Stand down'), '');

    // the levied villager's own panel: no Build, and the hint says why
    const v = vills()[0];
    UI.select('unit', v.id);
    ck('aLeviedHandOffersNoBuild', !q('[data-act="gobuild"]'), '');
    const wr = Units.workReport(v);
    ck('theHintSaysUnderArms', wr && /arms|levy/i.test(wr.what), wr && wr.what);
    UI.select('bld', tc.id);
    q('[data-act="levy"]').click();
    ck('andOneTapStandsItDown', !S.levy, '');
  }

  /* ---- 9. the save carries the mode; a legacy save loads at peace ---- */
  {
    const tc = stage('levy3');
    Units.spawn('villager', 'P', tc.x - 2, tc.y + 3);
    Units.raiseLevy();
    const json = JSON.stringify(S);
    G.loadJSON(json);
    const v = vills()[0];
    ck('theModeRidesInTheSave', S.levy && v && Units.isLevied(v), '');
    const legacy = JSON.parse(json);
    delete legacy.levy;
    G.loadJSON(JSON.stringify(legacy));
    ck('aLegacySaveLoadsWithToolsOut', S.levy === false, '');
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL LEVY CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs.slice(0, 4));
await b.close();
process.exit(out.fails.length || realErrs.length ? 1 : 0);
