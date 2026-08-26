/* THE HOMESTEAD — a house raised broadside-on to a farm bonds the two.

   The player's ask: a small reward for placing a house beside a field. It
   gives the farm 10% more food and the house room for one more villager, it
   throws a ring of golden sparks and a rising chime the moment it forms, and
   it says so in gold on BOTH panels — and every bit of that goes away again
   when a raid takes either half.

   The rules this file pins:

     BROADSIDE ONLY   the footprints must share an EDGE. A corner touch is two
                      neighbours, not one household.
     ONE TO ONE       every building is in at most one bond — ringing a farm
                      with houses buys nothing after the first.
     OLDEST WINS      ids rise with placement, so the earliest-standing pair
                      takes the tie.
     DERIVED          the bonus is computed from the board every time, so a
                      razed half drops it at once and a save can never carry a
                      stale one. What rides in the save is only the memory of
                      which bonds have been CELEBRATED.
     BOTH FINISHED    a work site is not a homestead yet.
     OWNER-AGNOSTIC   the rival's fields feed its town by the same rule; only
                      the celebration is the player's.

   Run after touching: Bld.broadside / homesteadMap / homesteadOf /
   homesteadMult / homesteadPop / syncHomesteads / celebrateHomestead,
   Bld.popCap, Bld.dailyProduction, UI.panelSub / panelSig, R.startBondSpark,
   or CFG.HOMESTEAD.

     node tests/homestead.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1000);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  // a clear arena well inside the board, so nothing we place lands on scenery
  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    const ox = tc.x + 6, oy = tc.y + 6;
    for (let dy = -3; dy <= 8; dy++) for (let dx = -3; dx <= 8; dx++) {
      const x = ox + dx, y = oy + dy;
      if (!MapGen.inB(x, y)) continue;
      const bAt = Bld.at(x, y);
      if (bAt && bAt.key !== 'tc') Bld.removeToRuin(bAt);
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    Bld._block = null;
    return { tc, ox, oy };
  };
  const put = (key, x, y, owner) =>
    Bld.place(owner || 'P', key, x, y, { free: true, instant: true });

  /* ---- 1. BROADSIDE ONLY ---- */
  {
    const { ox, oy } = setup('hs1');
    const f = put('farm', ox, oy);
    const h = put('house', ox + 1, oy);              // due east — shares an edge
    ck('aFarmAndHouseSideBySideBond', !!f && !!h && Bld.isHomestead(f) && Bld.isHomestead(h),
      'east neighbour');
    ck('andEachKnowsItsPartner',
      Bld.homesteadOf(f) === h && Bld.homesteadOf(h) === f, '');
    Bld.removeToRuin(h);
    const hn = put('house', ox, oy - 1);             // due north
    ck('northSouthCountsToo', !!hn && Bld.isHomestead(f) && Bld.isHomestead(hn), '');
    Bld.removeToRuin(hn);
    const hd = put('house', ox + 1, oy + 1);         // corner only
    ck('butACornerIsNotAHomestead', !!hd && !Bld.isHomestead(f) && !Bld.isHomestead(hd),
      'diagonal touch earns nothing');
    Bld.removeToRuin(hd);
    const hf = put('house', ox + 2, oy);             // a tile of daylight between
    ck('andNeitherIsAGap', !!hf && !Bld.isHomestead(f) && !Bld.isHomestead(hf), '');
  }

  /* ---- 2. ONE TO ONE, AND THE OLDEST PAIR WINS ---- */
  {
    const { ox, oy } = setup('hs2');
    const f1 = put('farm', ox, oy);                  // the older field
    const h = put('house', ox + 1, oy);
    const f2 = put('farm', ox + 1, oy + 1);          // …also broadside to the house
    ck('theHouseKeepsOneFarm',
      Bld.homesteadOf(h) === f1 && Bld.isHomestead(f1) && !Bld.isHomestead(f2),
      'the older field holds the bond');
    // …and a second house beside the spare farm makes its OWN bond
    const h2 = put('house', ox + 2, oy + 1);
    ck('aSecondPairIsItsOwnHomestead',
      Bld.isHomestead(f2) && Bld.homesteadOf(f2) === h2, '');
    ck('andTheFirstBondIsUndisturbed', Bld.homesteadOf(h) === f1, '');
    /* ringing one farm with houses buys nothing more. Counted in BONDS, not in
       pop: the Town Center's own ceiling clamps popCap, so pop would measure
       the ceiling rather than the rule. */
    const bondedNow = () => Bld.list('P').filter(x => Bld.isHomestead(x)).length;
    const before = bondedNow();
    put('house', ox, oy - 1); put('house', ox, oy + 1); put('house', ox - 1, oy);
    ck('noCompounding', bondedNow() === before,
      'three more houses round the same field added ' + (bondedNow() - before) + ' bonds');
  }

  /* ---- 3. WHAT THE BOND IS WORTH ---- */
  {
    const { ox, oy } = setup('hs3');
    const f = put('farm', ox, oy);
    // a hand on the field, so it actually produces
    const v = Units.spawn('villager', 'P', ox, oy);
    Units.assignWork ? Units.assignWork(v, f) : (v.task = { type: 'work', id: f.id, x: f.x, y: f.y });
    v.x = f.x; v.y = f.y;
    const foodOf = () => { S.res.food = 0; Bld.dailyProduction('P'); return S.res.food; };
    const plain = foodOf();
    const h = put('house', ox + 1, oy);
    const bonded = foodOf();
    ck('theFarmGivesTenPercentMore',
      plain > 0 && Math.abs(bonded / plain - CFG.HOMESTEAD.food) < 0.001,
      plain.toFixed(2) + ' -> ' + bonded.toFixed(2) + ' food/day');
    const capWith = Bld.popCap('P');
    Bld.removeToRuin(h);
    const capWithout = Bld.popCap('P');
    const lvPop = CFG.BUILDINGS.house.levels[0].pop || 0;
    ck('theHouseHoldsOneMore', capWith - capWithout === lvPop + CFG.HOMESTEAD.pop,
      'the house was worth ' + (capWith - capWithout) + ' (its own ' + lvPop + ' + ' + CFG.HOMESTEAD.pop + ')');
  }

  /* ---- 4. A RAID TAKES THE BONUS WITH IT ---- */
  {
    const { ox, oy } = setup('hs4');
    const f = put('farm', ox, oy);
    const h = put('house', ox + 1, oy);
    ck('bondedBeforeTheRaid', Bld.isHomestead(f) && Bld.isHomestead(h), '');
    UI.sel = { type: 'bld', id: f.id };
    const goldBefore = /Homestead/.test(UI.panelSub());
    const sigBefore = UI.panelSig();
    // the house burns
    Bld.damage(h, h.hp + 10, 'A');
    ck('theHouseIsGone', !Bld.get(h.id), '');
    ck('andTheFarmKeepsNoBonus', !Bld.isHomestead(f) && Bld.homesteadMult(f) === 1, '');
    const goldAfter = /Homestead/.test(UI.panelSub());
    ck('theGoldLineWasThereAndIsGone', goldBefore && !goldAfter, '');
    ck('andThePanelRefreshesWithoutATap', UI.panelSig() !== sigBefore,
      'the bond bit rides in panelSig');
  }

  /* ---- 5. BOTH HALVES MUST BE FINISHED ---- */
  {
    const { ox, oy } = setup('hs5');
    const f = put('farm', ox, oy);
    const site = Bld.place('P', 'house', ox + 1, oy, { free: true });   // a work site
    ck('aWorkSiteIsNotAHomesteadYet',
      !!site && site.construction > 0 && !Bld.isHomestead(f) && !Bld.isHomestead(site), '');
    Bld.finish(site);
    ck('andFinishingItMakesOne', Bld.isHomestead(f) && Bld.isHomestead(site), '');
  }

  /* ---- 6. THE CELEBRATION: once, for the player, with sparks and a chime ---- */
  {
    const { ox, oy } = setup('hs6');
    R.bondSparks = []; S.log = [];
    let chimes = 0; const cue = UI.cue; UI.cue = k => { if (k === 'bond') chimes++; };
    const f = put('farm', ox, oy);
    const h = put('house', ox + 1, oy);
    const sparks = (R.bondSparks || []).length;
    const said = S.log.map(l => l.msg).join(' | ');
    ck('itThrowsGoldenSparks', sparks === 1, sparks + ' burst, on the seam the pair shares');
    ck('andSoundsItsChime', chimes === 1, chimes + ' chime');
    ck('andTellsThePlayerWhy', /homestead/i.test(said) && /own/i.test(said), said || '(nothing said)');
    // …and it does NOT fire again for a bond that already stands
    S.log = []; chimes = 0; R.bondSparks = [];
    Bld.syncHomesteads();
    ck('butOnlyOnce', chimes === 0 && (R.bondSparks || []).length === 0 && !S.log.length,
      'a standing bond is not news');
    // the rival gets the RULE, not the party
    S.log = []; chimes = 0; R.bondSparks = [];
    const atc = Bld.tcOf('A');
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = atc.x + 4 + dx, y = atc.y + 4 + dy;
      if (MapGen.inB(x, y)) { const o = Bld.at(x, y); if (o && o.key !== 'tc') Bld.removeToRuin(o);
        S.map.terrain[MapGen.idx(x, y)] = T.GRASS; }
    }
    Bld._block = null;
    const af = put('farm', atc.x + 4, atc.y + 4, 'A');
    const ah = put('house', atc.x + 5, atc.y + 4, 'A');
    ck('theRivalGetsTheRule', !!af && !!ah && Bld.isHomestead(af) && Bld.isHomestead(ah), '');
    ck('butNotTheParty', chimes === 0 && (R.bondSparks || []).length === 0,
      'no sparks over the rival town');
    UI.cue = cue;
  }

  /* ---- 7. IT SURVIVES A SAVE, AND CELEBRATES NOTHING ON THE WAY BACK ---- */
  {
    const { ox, oy } = setup('hs7');
    const f = put('farm', ox, oy);
    const h = put('house', ox + 1, oy);
    const cap = Bld.popCap('P');
    const json = G.saveJSON();
    S.log = []; R.bondSparks = [];
    let chimes = 0; const cue = UI.cue; UI.cue = k => { if (k === 'bond') chimes++; };
    G.loadJSON(json);
    UI.cue = cue;
    const f2 = Bld.list('P').find(x => x.key === 'farm');
    const h2 = Bld.list('P').find(x => x.key === 'house');
    ck('theBondSurvivesASaveRoundTrip',
      !!f2 && !!h2 && Bld.isHomestead(f2) && Bld.isHomestead(h2) && Bld.popCap('P') === cap,
      'pop cap ' + Bld.popCap('P') + ' vs ' + cap);
    ck('andLoadingThrowsNoConfetti', chimes === 0 && (R.bondSparks || []).length === 0, '');
  }

  /* ---- 8. THE GOLD IS THE GAME'S OWN SPECIAL COLOUR ---- */
  {
    const { ox, oy } = setup('hs8');
    const f = put('farm', ox, oy);
    const h = put('house', ox + 1, oy);
    UI.sel = { type: 'bld', id: f.id };
    const farmLine = UI.panelSub();
    UI.sel = { type: 'bld', id: h.id };
    const houseLine = UI.panelSub();
    ck('bothPanelsSayIt', /Homestead/.test(farmLine) && /Homestead/.test(houseLine), '');
    ck('theFarmNamesItsFood', /%\s*food/i.test(farmLine), farmLine.slice(-64));
    ck('theHouseNamesItsVillager', /villager/i.test(houseLine), houseLine.slice(-64));
    ck('andBothAreInGold',
      /var\(--gold\)/.test(farmLine) && /var\(--gold\)/.test(houseLine),
      'the colour the game keeps for something special');
  }

  /* ---- 9. THE HINT: the reward is findable BEFORE it is earned ---- */
  {
    const { ox, oy } = setup('hs9');
    const f = put('farm', ox, oy);
    UI.placing = 'house';
    ck('theGhostPromisesTheBond', UI.placeWouldBond({ x: ox + 1, y: oy }) === true,
      'broadside of a free field');
    ck('butNotOnADiagonal', UI.placeWouldBond({ x: ox + 1, y: oy + 1 }) === false, '');
    ck('norAcrossAGap', UI.placeWouldBond({ x: ox + 2, y: oy }) === false, '');
    // …and a field already bonded promises nothing to the next house
    put('house', ox - 1, oy);
    ck('andAFieldAlreadySpokenForPromisesNothing',
      Bld.isHomestead(f) && UI.placeWouldBond({ x: ox + 1, y: oy }) === false,
      'one to one, and the hint knows it');
    UI.placing = null;
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL HOMESTEAD CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs.slice(0, 4));
await b.close();
if (out.fails.length || realErrs.length) process.exit(1);
