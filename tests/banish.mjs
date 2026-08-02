/* BANISHMENT CONTRACT — the villager's answer to Scuttle.

   Late on, a town that has finished building has hands it would rather have as
   spears, and the population cap is the only thing in the way. So a villager
   can be sent away for good. The rules:

     NOTHING BACK   No food, no wood, not even the training cost. The ONE thing
                    banishment buys is the place in the population — that is the
                    whole point of the button, and the reason it is not a
                    disguised refund.

     ON THEIR FEET  They walk out to the board's rim and leave there, rather
                    than vanishing on the tap. So the road is real: a barbarian
                    can cut them down on the way, and the order can be called
                    off by giving them any other order before they arrive.

     VILLAGERS ONLY Soldiers keep their posts (for now), and nothing of anyone
                    else's tribe can be banished at all.

     TWO TAPS       It cannot be undone once they reach the rim, so the button
                    arms first and acts second — the same confirm pattern the
                    hulls (Scuttle) and demolition use.

   Run this after touching any of:
     units.js — banish / canBanish / sendToEdge / edgeTarget / atMapEdge /
                leaveTheMap, the 'banish' branch in update, workReport
     ui.js — the villager panel's Build/Banish row and its click handler
     buildings.js — popCap; units.js — popUsed

     node tests/banish.mjs      # exits non-zero on any regression */
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
  const vill = () => S.units.find(u => u.owner === 'P' && Units.isVillager(u));

  // ---- 1. who may be sent away ----
  {
    G.newGame('ban1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    const v = vill();
    ck('aVillagerMayBeBanished', Units.canBanish(v) === true, '');
    const sold = Units.spawn('defender', 'P', v.x | 0, (v.y | 0) + 1);
    ck('butASoldierKeepsItsPost', Units.canBanish(sold) === false,
      'deliberately villagers only for now');
    const foe = S.units.find(u => u.owner === 'A' && Units.isVillager(u));
    ck('andNobodyElsesPeopleCanBe', !foe || Units.canBanish(foe) === false, '');
    S.units.splice(S.units.indexOf(sold), 1);
  }

  // ---- 2. they down tools and WALK, and the order can be called off ----
  {
    const v = vill();
    // put them to work first, so we can see the tools go down
    const ft = (() => {
      for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++)
        if (CFG.GATHER[S.map.terrain[MapGen.idx(x, y)]]) return { x, y };
      return null;
    })();
    if (ft) Units.assignGather(v, ft.x, ft.y);
    ck('itStartsWithAJob', !!(v.task && v.task.type === 'gather'), v.task ? v.task.type : 'idle');
    const n0 = Units.popUsed('P');
    ck('banishTakesTheOrder', Units.banish(v) === true, '');
    ck('theToolsGoDown', v.task && v.task.type === 'banish', v.task ? v.task.type : 'no task');
    ck('andTheyAreWalking', Units.moving(v), '');
    ck('theirPanelSaysSo', (Units.workReport(v) || {}).what === 'Leaving the valley', '');
    ck('butTheyStillCountUntilTheyGo', Units.popUsed('P') === n0,
      'the place is freed when they LEAVE, not when the order is given');
    // …and any other order calls it off
    Units.moveTo(v, v.x | 0, (v.y | 0) + 1);
    ck('anyOtherOrderCallsItOff', v.task && v.task.type !== 'banish',
      v.task ? v.task.type : 'no task');
  }

  // ---- 3. they LEAVE at the rim, and the population is what comes back ----
  {
    G.newGame('ban2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    const v = vill();
    const id = v.id;
    const before = { pop: Units.popUsed('P'), food: S.res.food, wood: S.res.wood, gold: S.res.gold };
    const aim = Units.edgeTarget(v);
    Units.banish(v);
    ck('theRoadAimsAtTheRim',
      !!aim && (aim.x <= 1 || aim.y <= 1 || aim.x >= CFG.W - 2 || aim.y >= CFG.H - 2),
      aim ? aim.x + ',' + aim.y : 'nowhere to go');
    ck('andNeverIntoTheBlack', !!aim && MapGen.onBoard(aim.x, aim.y),
      'the outer ring is off-map void — the rim is one tile in');
    ck('andItIsGroundTheyCanStandOn', !!aim && Path.passable(aim.x, aim.y, 'P'), '');
    for (let i = 0; i < 6000 && Units.get(id); i++) Units.update(0.1);
    ck('theyLeaveTheMap', !Units.get(id), 'still walking after ten minutes');
    ck('andThePlaceInThePopulationIsFreed', Units.popUsed('P') === before.pop - 1,
      before.pop + ' → ' + Units.popUsed('P'));
    ck('andNothingElseComesBack',
      S.res.food <= before.food && S.res.wood === before.wood && S.res.gold === before.gold,
      'no refund — the pop cap is the whole of it');
    ck('theNewsIsTold', S.log.some(e => /banish/i.test(e.msg)), '');
  }

  // ---- 4. sealed in with nowhere to walk, they still go ----
  {
    G.newGame('ban3', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const v = vill();
    const id = v.id;
    // wall the whole board off from them: every tile but their own is mountain
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
      if (!((x === (v.x | 0)) && (y === (v.y | 0)))) S.map.terrain[MapGen.idx(x, y)] = T.MOUNTAIN;
    Bld._block = null;
    Units.banish(v);
    for (let i = 0; i < 60 && Units.get(id); i++) Units.update(0.1);
    ck('aSealedInVillagerStillSlipsAway', !Units.get(id),
      'no road out is not a reason to keep feeding them');
  }

  // ---- 5. the button: on the villager's panel, beside Build, and it ARMS first ----
  {
    G.newGame('ban4', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    const v = vill();
    UI.confirmDemolish = 0;
    UI.select('unit', v.id);
    const q = (sel) => document.querySelector('#panel ' + sel);
    ck('thePanelOffersIt', !!q('[data-act="banish"]'), '');
    ck('rightBesideBuild', (() => {
      const acts = [...document.querySelectorAll('#panel .pactions .abtn')].map(e => e.dataset.act);
      const i = acts.indexOf('gobuild'), j = acts.indexOf('banish');
      return i >= 0 && j === i + 1;
    })(), 'the two share a row');
    ck('andNeitherIsFullWidth',
      !q('[data-act="banish"]').classList.contains('wide') &&
      !q('[data-act="gobuild"]').classList.contains('wide'), '');
    // first tap ARMS, second acts
    q('[data-act="banish"]').click();
    ck('theFirstTapOnlyArmsIt',
      !!Units.get(v.id) && (!v.task || v.task.type !== 'banish') && UI.confirmDemolish === v.id,
      'it cannot be undone once they reach the rim');
    ck('andSaysSo', /confirm/i.test(q('[data-act="banish"]').textContent), q('[data-act="banish"]').textContent.slice(0, 40));
    q('[data-act="banish"]').click();
    ck('theSecondTapSendsThemOff', !!v.task && v.task.type === 'banish', v.task ? v.task.type : 'nothing happened');
    ck('andTheSelectionIsLetGo', !UI.sel, '');
    // a soldier is offered nothing of the sort
    const sold = Units.spawn('defender', 'P', v.x | 0, (v.y | 0) + 1);
    UI.select('unit', sold.id);
    ck('aSoldierIsOfferedNoSuchThing', !q('[data-act="banish"]'), '');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BANISH CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
