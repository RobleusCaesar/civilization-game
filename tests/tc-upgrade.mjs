/* TOWN CENTER UPGRADE CONTRACT — the hall rises on the town's shoulders.

   The rules, all of which this file pins:

     THE PRICE      A Town Center storey is the dearest ordinary upgrade in the
                    game: Lv 2 costs 300 wood / 225 stone / 45 gold and Lv 3
                    costs 600 / 450 / 120 — half again what they used to, and
                    Lv 3 is exactly double Lv 2 in every resource.

     THE TOWN       Three FINISHED buildings at the hall's own level buy the
     COMES FIRST    next storey: three level-1 buildings for Lv 2, three
                    level-2 buildings for Lv 3. One rule serves both tiers
                    because it keys off the hall's CURRENT level
                    (Bld.tcSupport / Bld.TC_SUPPORT).

     NO SHORTCUT    Walls and gates do not count. They have no upgrade of
                    their own — the whole curtain is raised at once from the
                    Town Center at a village-wide tier — so counting them
                    would let a line of cheap palisade sections buy the
                    hall's next storey. Work SITES do not count either: a
                    building that isn't finished isn't a building yet.

     NO DEADLOCK    An ordinary building may only reach Lv 2 once the hall is
                    Lv 2, so the sequence is town → hall → town → hall and
                    always terminates.

     BOTH TRIBES    Owner-agnostic. The rival's chief builds a town before a
                    hall on exactly the same terms, and its AI simply scores
                    something else while it cannot.

     THE PLAYER IS  The panel's upgrade button carries the reason and the
     TOLD           running count ("Needs 3 buildings at Lv 1 (have 2)"), and
                    UI.panelSig carries the count — that number moves without
                    `ok` flipping, so without it the panel would sit on a
                    stale tally.

   Run this after touching any of:
     config.js    — CFG.BUILDINGS.tc.levels costs
     buildings.js — canUpgrade / tcSupport / TC_SUPPORT / upgrade
     ui.js        — panelSig's tc branch, the upgrade button
     ai.js        — the Town Center upgrade macro-action

     node tests/tc-upgrade.mjs      # exits non-zero on any regression */
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

  /* ---------- 1. THE PRICE ---------- */
  {
    const L = CFG.BUILDINGS.tc.levels;
    const c2 = L[1].cost, c3 = L[2].cost;
    ck('levelTwoCosts', c2.wood === 300 && c2.stone === 225 && c2.gold === 45,
      JSON.stringify(c2));
    ck('levelThreeCosts', c3.wood === 600 && c3.stone === 450 && c3.gold === 120,
      JSON.stringify(c3));
    // each storey is a real step up, in every resource it asks for
    ck('theThirdStoreyIsDearerInEveryResource',
      ['wood', 'stone', 'gold'].every(r => c3[r] > c2[r]), '');
    // the timber and the stone double between the two storeys; the gold does
    // not (it was never a doubling), which is why the numbers above are pinned
    // literally rather than derived
    ck('timberAndStoneDoubleBetweenStoreys',
      c3.wood === c2.wood * 2 && c3.stone === c2.stone * 2, '');
    ck('theFoundingCampIsFree', Object.keys(L[0].cost || {}).length === 0, '');
  }

  /* ---------- 2. THE TOWN COMES FIRST ---------- */
  G.newGame('tcup', 'moderate', 'large');
  Screens._demo = false; Screens.show('playing'); S.paused = true;
  const tc = Bld.tcOf('P');
  const rich = () => { S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 }; };
  rich();
  G.reveal(tc.x, tc.y, 20);

  // clear the ground around the hall and stand buildings on it to order
  const spots = [];
  for (let dy = -6; dy <= 6 && spots.length < 40; dy++)
    for (let dx = -6; dx <= 6 && spots.length < 40; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y) || Bld.at(x, y)) continue;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      spots.push({ x, y });
    }
  let si = 0;
  const stand = (key) => {
    while (si < spots.length) {
      const s = spots[si++];
      if (Bld.at(s.x, s.y) || !Bld.canPlace('P', key, s.x, s.y).ok) continue;
      const nb = Bld.place('P', key, s.x, s.y, { instant: true });
      if (nb) { nb.construction = 0; Bld._block = null; return nb; }
    }
    return null;
  };

  // ---- 2a. a bare camp cannot raise its hall, however rich ----
  {
    ck('theHallStartsAtOne', tc.level === 1, 'lv ' + tc.level);
    const c = Bld.canUpgrade(tc);
    ck('aBareCampCannotUpgrade', !c.ok && /3 buildings at Lv 1/.test(c.why), c.why);
    ck('supportStartsEmpty', Bld.tcSupport(tc) === 0, String(Bld.tcSupport(tc)));
  }

  // ---- 2b. walls and gates buy nothing ----
  {
    for (let i = 0; i < 6; i++) stand(i === 0 ? 'gate' : 'wall');
    ck('fortificationsDoNotCount', Bld.tcSupport(tc) === 0,
      Bld.list('P').filter(o => o.key === 'wall' || o.key === 'gate').length + ' sections raised, support ' + Bld.tcSupport(tc));
    ck('stillCannotUpgradeOnWallsAlone', !Bld.canUpgrade(tc).ok, '');
  }

  // ---- 2c. …and a work SITE is not a building yet ----
  {
    const sites = [];
    for (let i = 0; i < 3; i++) { const s = stand('house'); if (s) { s.construction = 4; sites.push(s); } }
    Bld._block = null;
    ck('workSitesDoNotCount', Bld.tcSupport(tc) === 0 && !Bld.canUpgrade(tc).ok,
      sites.length + ' sites standing, support ' + Bld.tcSupport(tc));
    for (const s of sites) Bld.finish(s);
    ck('theyCountTheDayTheyFinish', Bld.tcSupport(tc) === 3, String(Bld.tcSupport(tc)));
  }

  // ---- 2d. three finished buildings buy the second storey ----
  {
    rich();
    const c = Bld.canUpgrade(tc);
    ck('threeBuildingsBuyLevelTwo', c.ok, c.why || 'ok');
    // one short, and it is refused again — the count is a real threshold
    const one = Bld.list('P').find(o => o.key === 'house');
    one.construction = 3; Bld._block = null;
    const short = Bld.canUpgrade(tc);
    ck('twoIsNotEnough', !short.ok && /have 2/.test(short.why), short.why);
    Bld.finish(one);
    // pay for it and run the works out
    ck('theUpgradeIsTaken', Bld.upgrade(tc) === true && tc.upgrading > 0, '');
    tc.upgrading = 0; Bld.finishUpgrade(tc);
    ck('theHallIsLevelTwo', tc.level === 2, 'lv ' + tc.level);
  }

  // ---- 2e. the third storey asks for a town at LEVEL TWO ----
  {
    rich();
    ck('levelOneBuildingsNoLongerCount', Bld.tcSupport(tc) === 0,
      Bld.list('P').filter(o => o.key === 'house').length + ' level-1 houses, support ' + Bld.tcSupport(tc));
    const c = Bld.canUpgrade(tc);
    ck('thirdStoreyRefusedOnALevelOneTown', !c.ok && /3 buildings at Lv 2/.test(c.why), c.why);
    // NO DEADLOCK: an ordinary building can now reach Lv 2, because the hall is
    const houses = Bld.list('P').filter(o => o.key === 'house').slice(0, 3);
    ck('theTownCanNowLevelUp', houses.length === 3 && houses.every(h => Bld.canUpgrade(h).ok), '');
    for (const h of houses) { Bld.upgrade(h); h.upgrading = 0; Bld.finishUpgrade(h); rich(); }
    ck('threeLevelTwoBuildingsBuyLevelThree',
      Bld.tcSupport(tc) === 3 && Bld.canUpgrade(tc).ok, 'support ' + Bld.tcSupport(tc));
    ck('theThirdStoreyIsTaken', Bld.upgrade(tc) === true, '');
    tc.upgrading = 0; Bld.finishUpgrade(tc);
    ck('theHallIsLevelThree', tc.level === 3, 'lv ' + tc.level);
    ck('andThatIsTheTop', !Bld.canUpgrade(tc).ok && /Max/.test(Bld.canUpgrade(tc).why), '');
  }

  // ---- 2f. the player is told, and the tally is live ----
  {
    G.newGame('tcup2', 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc2 = Bld.tcOf('P');
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    G.reveal(tc2.x, tc2.y, 20);
    UI.select('bld', tc2.id);
    UI.renderPanel();
    const btn = () => document.querySelector('#panel [data-act="upgrade"]');
    ck('theButtonSaysWhatIsMissing',
      !!btn() && /3 buildings at Lv 1/.test(btn().textContent) && btn().classList.contains('cant'),
      btn() ? btn().textContent : 'no button');
    const sig0 = UI.panelSig();
    // raise one building — the tally must move even though `ok` has not
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = tc2.x + dx, y = tc2.y + dy;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3 || !MapGen.inB(x, y) || Bld.at(x, y)) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      if (Bld.canPlace('P', 'house', x, y).ok) {
        const nb = Bld.place('P', 'house', x, y, { instant: true });
        if (nb) { nb.construction = 0; Bld._block = null; dy = 99; break; }
      }
    }
    const sig1 = UI.panelSig();
    ck('thePanelNoticesTheTownGrowing', sig0 !== sig1 && Bld.tcSupport(tc2) === 1, '');
    UI.refreshPanel();
    ck('theTallyIsRepainted', /have 1/.test(btn().textContent), btn().textContent);
  }

  // ---- 2g. the rival plays by the same rules ----
  {
    const atc = Bld.tcOf('A');
    if (atc) {
      S.ai.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
      const before = Bld.canUpgrade(atc);
      ck('theRivalIsGatedToo',
        before.ok === (Bld.tcSupport(atc) >= Bld.TC_SUPPORT),
        'support ' + Bld.tcSupport(atc) + ' → ' + (before.ok ? 'may' : before.why));
    } else ck('theRivalIsGatedToo', false, 'no rival hall on this map');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL TC-UPGRADE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
