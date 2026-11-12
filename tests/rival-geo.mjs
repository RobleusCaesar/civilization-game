/* RIVAL-GEO CONTRACT — the chief reads its map, and does not destroy itself.

   Born of the first run of tools/ai-harness.mjs (112 whole games, every
   landform, three player styles), which measured what the rival actually did
   and found three ways it lost games to nobody:

     · it RAZED ITS OWN TOWN CENTER. The cork cure flooded from one doorstep
       tile, looked for the plug round a building's anchor tile only, and its
       fallback tore down the nearest building, a day at a time — walls, huts,
       the hall — through Bld.removeToRuin, which ends no game (8 of 112 runs)
     · it fed EVERY VILLAGER IT EVER HIRED to one building site, inside the
       reach of a war band it had never seen
     · on water it stood BLIND FOR 300 DAYS with a fleet in harbour: every sea
       action needed one sighted enemy building, and nothing could cross the
       water to sight one

   Every check here is on CONSTRUCTED ground, so no seed can flatter it, and
   every one fails on the code before the rewrite. To see that for yourself:

       CF_ROOT=/path/to/an/older/checkout node tests/rival-geo.mjs

   Run this after touching any of:
     ai.js — geo/_geoRead, corkedGround/cutTheCork/_doorIn/freeTheTown,
             _reachA, plot's seal clamp, noteDeath/deadWork/deadSite,
             towerSpot, _buildDock, the dock candidates in bestBuild,
             trainForces' yard block, seaSearch/searchBeach, searchTarget/
             scoutReach/huntTarget, stormTheHall, _launchAmphib, detail/
             onDetail and the stance stamp at the foot of daily, glance,
             maybeWalls' return value, mendTheHurt, seaMinded/secondFront
     config.js — CFG.MODES[*].aiMend, CFG.HEAL_FOOD
     units.js — the death branch's AI.noteDeath call, disembark
     game.js — simStep's AI.glance call

       node tests/rival-geo.mjs       # exits non-zero on any regression

   The invariants:
     1. THE HALL IS NEVER THE CORK — and the plug is found round a whole
        footprint, so a 2x2 across a lane is seen (and refused at the clamp)
     2. THE DOORSTEP IS ONE GROUND — a pocket beside the hall is not "the town"
     3. A POCKET WITH OUR PEOPLE IN IT IS A CORK, and the cut section is a GATE
     4. NO BUILDER IS SENT TO WORKS THAT KILL BUILDERS — two different days of
        dead villagers, not one bad afternoon
     5. THE MAP IS READ (AI.geo): land masses, the sea, whether the enemy can
        only be reached by water
     6. THE DOCK IS SCORED FROM THE MAP, the troop hull is laid before the nets
     7. THE SEARCH GOES BY SEA — never at peace, a home guard stays, the party
        lands as scouts on land that is not ours
     8. ONLY THOSE WHO CAN WALK THERE MARCH (stormTheHall), and the blind hunt
        never reads the player's true hall
     9. A DETAIL OUTLIVES THE DAY'S STANCE STAMP; the tribe sees as it walks
     9b. THE HURT GO HOME TO MEND, for the player's price, never on Calm;
         a sea-minded chief raids by water with the road open
    10. THE NEW STATE RIDES IN THE SAVE, and an older save loads
   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = process.env.CF_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}; const fails = [];
  const ck = (name, ok, info) => { res[name] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(name); };
  // a section that throws (an older build lacks the method) fails its checks by name
  const section = (names, fn) => { try { fn(); } catch (e) { for (const n of names) if (!(n in res)) ck(n, false, 'threw: ' + String(e && e.message || e).slice(0, 90)); } };
  const idx = (x, y) => MapGen.idx(x, y);
  const rect = (x0, y0, x1, y1, tt) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (MapGen.onBoard(x, y)) S.map.terrain[idx(x, y)] = tt; };
  let wn = 0;
  /* A BLANK WORLD: water everywhere, nobody on it but the two halls, which the
     caller then sets down on land it carves. The rival's memory is wiped, its
     purse is full. Deterministic: every section builds exactly what it needs. */
  const world = () => {
    G.newGame('rgeo' + (wn++), 'moderate', 'large'); Screens.show('playing'); S.paused = true; S.day = 40; S.peace = false;
    const W = CFG.W, H = CFG.H, N = W * H;
    S.units.length = 0;
    const tA = Bld.tcOf('A'), tP = Bld.tcOf('P');
    S.buildings.length = 0; S.buildings.push(tA, tP);
    for (let i = 0; i < N; i++) { S.map.terrain[i] = T.WATER; if (S.map.resAmount) S.map.resAmount[i] = 0; }
    S.ai.seen = new Array(N).fill(0); S.ai.knownB = {}; S.ai.deadAt = {}; S.ai.scouts = []; S.ai.seaParty = null;
    S.ai.seaPartyDay = -99; S.ai.memory = { wallStop: false, wallHit: 0 }; S.ai.camp = null; S.ai.raidCd = 0;
    S.ai.persona = 'homesteader'; S.ai.opening = { bias: 'none', fired: true };
    S.ai.res = { food: 3000, wood: 3000, stone: 3000, gold: 3000 }; S.ai.acts = 99;
    S.corpses = []; S.ashes = []; S.ruins = [];
    return { tA, tP, W, H, my: (H / 2) | 0 };
  };
  const settle = () => { Bld._block = null; G.updateVisibility(); if (AI.updateVision) AI.updateVision(); return AI.assess() || S.ai.read; };
  // TWO ISLANDS: the rival's on the west, the player's on the east, sea between
  const twoIslands = (joined) => {
    const w = world();
    rect(4, w.my - 8, 16, w.my + 8, T.GRASS);
    rect(w.W - 17, w.my - 8, w.W - 5, w.my + 8, T.GRASS);
    if (joined) rect(16, w.my - 1, w.W - 17, w.my + 1, T.GRASS);
    w.tA.x = 9; w.tA.y = w.my; w.tP.x = w.W - 11; w.tP.y = w.my;
    w.read = settle();
    return w;
  };
  const seeHome = () => { const h = AI.aiLandReach(); for (let i = 0; i < h.length; i++) if (h[i]) S.ai.seen[i] = 1; };
  const knowTheHall = (w) => {
    S.ai.knownB[idx(w.tP.x, w.tP.y)] = { key: 'tc', level: 1, owner: 'P', x: w.tP.x, y: w.tP.y, seen: S.day };
    w.read = AI.assess() || S.ai.read;
  };
  const men = (n, x, y, kind) => { const o = []; for (let i = 0; i < n; i++) o.push(Units.spawn(kind || 'defender', 'A', x + (i % 3), y + ((i / 3) | 0))); return o; };

  /* ---- 1. THE HALL IS NEVER THE CORK. The rival's hall stands in a pocket
     whose one pass — two tiles wide — is filled by a 2x2 barracks whose
     ANCHOR tile is on the outside. The old cure looked round the anchor
     alone, found no plug, fell back to "the nearest building" — and the only
     building beside reached ground was the hall. ---- */
  section(['aTwoByTwoAcrossALaneIsRefusedAtTheClamp', 'theHallIsNeverTheCork', 'andTheRealPlugComesDown', 'theWayOutIsCheckedWithNoWallStanding'], () => {
    const w = world(), y0 = w.my;
    rect(4, y0 - 8, 17, y0 + 8, T.GRASS);            // the open country, west
    rect(20, y0 - 6, 32, y0 + 6, T.GRASS);           // the pocket, east
    rect(18, y0, 19, y0 + 1, T.GRASS);               // the pass: two wide, two long
    w.tA.x = 26; w.tA.y = y0; w.tP.x = 8; w.tP.y = y0 - 5;
    settle();
    const tc = w.tA;
    ck('aTwoByTwoAcrossALaneIsRefusedAtTheClamp',
      !AI.corkedGround(tc) && !!AI.corkedGround(tc, { x: 18, y: y0, sz: 2 }) && !AI.corkedGround(tc, { x: 18, y: y0 }),
      'a 2x2 on the pass corks the pocket; one tile of it does not');
    const bk = Bld.place('A', 'barracks', 18, y0, { free: true, instant: true });
    Bld._block = null;
    const corked = !!AI.corkedGround(tc);
    for (let d = 0; d < 6 && Bld.tcOf('A'); d++) { S.day++; (AI.freeTheTown || AI.cutTheCork).call(AI, tc); }
    ck('theHallIsNeverTheCork', corked && !!Bld.tcOf('A'), 'corked=' + corked + ' hall=' + (Bld.tcOf('A') ? 'stands' : 'RAZED BY ITS OWN CHIEF'));
    ck('andTheRealPlugComesDown', !!Bld.tcOf('A') && !S.buildings.includes(bk) && !AI.corkedGround(tc), 'barracks ' + (S.buildings.includes(bk) ? 'still there' : 'gone'));
    ck('theWayOutIsCheckedWithNoWallStanding', typeof AI.freeTheTown === 'function' && Bld.forts('A').length === 0,
      'the cure lived inside maybeWalls behind "if any fort stands"');
  });

  /* ---- 2. THE DOORSTEP IS ONE GROUND. Four huts box in the hall's first
     doorstep tile. The town is wide open on every other side. ---- */
  section(['aDoorstepPocketIsNotACork'], () => {
    const w = world(), y0 = w.my;
    rect(6, y0 - 9, 30, y0 + 9, T.GRASS);
    w.tA.x = 18; w.tA.y = y0; w.tP.x = w.W - 6; w.tP.y = 4; S.map.terrain[idx(w.tP.x, w.tP.y)] = T.GRASS;
    const px = w.tA.x - 1, py = w.tA.y - 1;                     // the first tile the old seed scan tried
    for (const [x, y] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) Bld.place('A', 'house', x, y, { free: true, instant: true });
    settle();
    const n0 = S.buildings.length, corked = AI.corkedGround(w.tA);
    (AI.freeTheTown || AI.cutTheCork).call(AI, w.tA);
    ck('aDoorstepPocketIsNotACork', !corked && S.buildings.length === n0, 'corked=' + !!corked + ' buildings ' + n0 + '->' + S.buildings.length);
  });

  /* ---- 3. A POCKET WITH OUR PEOPLE IN IT IS A CORK. A nine-tile nook behind
     one wall section, far too small to count as ground — and a villager is
     standing in it. The section is swapped for a gate. ---- */
  section(['aPocketWithOurPeopleInItIsACork', 'andTheCutSectionIsAGate', 'andAnEmptyNookIsLeftAlone'], () => {
    const w = world(), y0 = w.my;
    rect(6, y0 - 8, 26, y0 + 8, T.GRASS);
    rect(27, y0, 27, y0, T.GRASS);                              // the neck
    rect(28, y0 - 1, 30, y0 + 1, T.GRASS);                      // the nook
    w.tA.x = 14; w.tA.y = y0; w.tP.x = w.W - 6; w.tP.y = 4; S.map.terrain[idx(w.tP.x, w.tP.y)] = T.GRASS;
    const wall = Bld.place('A', 'wall', 27, y0, { free: true, instant: true });
    settle();
    ck('andAnEmptyNookIsLeftAlone', !AI.corkedGround(w.tA), 'nine tiles and nobody in them is not a cork');
    const v = Units.spawn('villager', 'A', 29, y0);
    const pen = AI.corkedGround(w.tA);
    ck('aPocketWithOurPeopleInItIsACork', !!pen, pen ? 'gained ' + pen.gained : 'the villager is walled out and nobody noticed');
    (AI.freeTheTown || AI.cutTheCork).call(AI, w.tA);
    const door = Bld.at(27, y0), path = Path.find(v.x | 0, v.y | 0, w.tA.x - 1, w.tA.y, 'A');
    const end = path && path.length ? path[path.length - 1] : null;
    ck('andTheCutSectionIsAGate', !!door && door.key === 'gate' && door.owner === 'A' && !S.buildings.includes(wall) &&
      !!end && Math.hypot(end.x - (w.tA.x - 1), end.y - w.tA.y) < 1.1, (door ? door.key : 'bare ground') + ', home ' + (end ? end.x + ',' + end.y : 'unreachable'));
  });

  /* ---- 4. NO BUILDER IS SENT TO WORKS THAT KILL BUILDERS. ---- */
  section(['aRaidsDeadAreNotACurse', 'aSiteWhoseBuildersDieIsCalledOff', 'andItsPriceComesHome', 'aTowerIsNotRaisedWhereBuildersDie'], () => {
    const w = world(), y0 = w.my;
    rect(4, y0 - 12, 34, y0 + 12, T.GRASS);
    w.tA.x = 18; w.tA.y = y0; w.tP.x = w.W - 6; w.tP.y = 4; S.map.terrain[idx(w.tP.x, w.tP.y)] = T.GRASS;
    settle();
    const tc = w.tA;
    const vs = [Units.spawn('villager', 'A', tc.x - 1, tc.y + 3), Units.spawn('villager', 'A', tc.x, tc.y + 3), Units.spawn('villager', 'A', tc.x + 1, tc.y + 3)];
    // one bad afternoon: three hands cut down together beside the granary
    for (const v of vs) AI.noteDeath(tc.x + 4, tc.y + 4, v);
    ck('aRaidsDeadAreNotACurse', AI.deadWork(tc.x + 4, tc.y + 4) === false, 'three dead on one day');
    // the works: a house site six tiles out, paid for
    const sx = tc.x - 6, sy = tc.y - 2;
    const wood0 = S.ai.res.wood;
    const site = Bld.place('A', 'house', sx, sy, {});
    const paid = wood0 - S.ai.res.wood;
    AI.noteDeath(sx + 1, sy, vs[0]);
    S.day++;
    AI.noteDeath(sx, sy + 1, vs[1]);
    const dead = AI.deadSite(site);
    const wood1 = S.ai.res.wood;
    S.ai.acts = 99;
    AI.daily();
    const still = S.buildings.includes(site);
    const sent = S.units.some(u => u.owner === 'A' && u.task && u.task.type === 'build' && u.task.id === site.id);
    ck('aSiteWhoseBuildersDieIsCalledOff', !!site && dead && !still && !sent, 'deadSite=' + dead + ' site ' + (still ? 'STANDS' : 'gone') + ' builder sent=' + sent);
    ck('andItsPriceComesHome', paid > 0 && !still, 'paid ' + paid + ' wood');
    // a tower: every tile within reach of the hall has eaten builders on two days, bar one small patch
    S.ai.deadAt = {};
    const patch = (x, y) => x >= tc.x + 4 && x <= tc.x + 6 && y >= tc.y + 4 && y <= tc.y + 6;
    for (let dy = -9; dy <= 9; dy += 2) for (let dx = -9; dx <= 9; dx += 2) {
      const x = tc.x + dx, y = tc.y + dy;
      if (Math.abs(x - (tc.x + 5)) <= 3 && Math.abs(y - (tc.y + 5)) <= 3) continue;
      S.day = 41; AI.noteDeath(x, y, vs[0]); S.day = 42; AI.noteDeath(x, y, vs[1]);
    }
    let bad = 0, got = 0;
    for (let i = 0; i < 12; i++) { const sp = AI.towerSpot(tc); if (!sp) continue; got++; if (!patch(sp.x, sp.y)) bad++; }
    ck('aTowerIsNotRaisedWhereBuildersDie', bad === 0, got + ' sites offered, ' + bad + ' on killing ground');
  });

  /* ---- 5. THE MAP IS READ. ---- */
  section(['theMapIsReadIntoLandsAndSeas', 'theWalkIsSpentBeforeTheSeaIsAsked', 'anEnemyAcrossTheWaterIsASeaWar', 'andAcrossALandBridgeItIsNot', 'theReadIsOnePassADay'], () => {
    const w = twoIslands(false);
    const g = AI.geo();
    const pm = g.lab[idx(w.tP.x, w.tP.y)];
    ck('theMapIsReadIntoLandsAndSeas', g.homeMass > 0 && pm > 0 && pm !== g.homeMass && g.overseas >= 24 && g.coast > 0 && g.blind === true,
      'home mass ' + g.homeMass + ', theirs ' + pm + ', land over the water ' + g.overseas + ', coast ' + g.coast);
    const before = !!g.seaSearch;
    seeHome();
    const g2 = AI.geo();
    ck('theWalkIsSpentBeforeTheSeaIsAsked', before === false && g2.seaSearch === true && g2.landDone === true,
      'unwalked: seaSearch=' + before + '; walked out: seaSearch=' + g2.seaSearch);
    knowTheHall(w);
    const g3 = AI.geo();
    ck('anEnemyAcrossTheWaterIsASeaWar', g3.foeSeaOnly === true && g3.seaNeed === 1 && g3.blind === false, 'foeSeaOnly=' + g3.foeSeaOnly + ' seaNeed=' + g3.seaNeed);
    // one read per tick, however many ask
    let n = 0; const o = AI._geoRead; AI._geoRead = function () { n++; return o.apply(this, arguments); };
    AI._tick = {}; for (let i = 0; i < 6; i++) AI.geo(); AI._tick = null; AI._geoRead = o;
    ck('theReadIsOnePassADay', n === 1, n + ' floods for six questions');
    const j = twoIslands(true); knowTheHall(j);
    const g4 = AI.geo();
    ck('andAcrossALandBridgeItIsNot', g4.foeSeaOnly === false && g4.seaNeed < 1, 'foeSeaOnly=' + g4.foeSeaOnly + ' seaNeed=' + g4.seaNeed);
  });

  /* ---- 6. THE DOCK IS SCORED FROM THE MAP; the troop hull before the nets. ---- */
  section(['theDockIsScoredFromTheMap', 'theTroopHullIsLaidBeforeTheNets'], () => {
    const w = twoIslands(false); knowTheHall(w);
    S.day = 12;                                                  // a level-1 hall, the opening barely begun
    AI.bestBuild(w.read);
    const dk = S.buildings.find(x => x.owner === 'A' && x.key === 'dock');
    ck('theDockIsScoredFromTheMap', !!dk && w.tA.level === 1, dk ? 'dock laid at ' + dk.x + ',' + dk.y + ' on day 12, hall level 1' : 'no dock: ' +
      S.buildings.filter(x => x.owner === 'A').map(x => x.key).join(','));
    if (dk) { dk.construction = 0; dk.hp = dk.maxhp || dk.hp; }
    Bld._block = null;
    men(6, 8, w.my + 3);
    const m = G.modeCfg();
    w.read = AI.assess() || S.ai.read;
    AI.trainForces(m, w.read);
    const q = dk && dk.queue && dk.queue[0];
    ck('theTroopHullIsLaidBeforeTheNets', !!q && q.unit === 'transport', 'first on the slip: ' + (q ? q.unit : 'nothing'));
  });

  /* ---- 7. THE SEARCH GOES BY SEA. ---- */
  section(['aBlindChiefPutsAPartyAshore', 'andAHomeGuardStays', 'onLandThatIsNotOurs', 'neverAtPeace', 'theyLandAsScouts', 'andWalkThatLandNotOurs'], () => {
    const mk = (peace) => {
      const w = twoIslands(false); seeHome(); S.peace = !!peace;
      w.hull = Units.spawn('transport', 'A', 3, w.my);
      w.men = men(5, 8, w.my + 3);
      w.read = AI.assess() || S.ai.read;
      return w;
    };
    const pz = mk(true);
    const went0 = AI.seaSearch(pz.read);
    ck('neverAtPeace', !went0 && !(pz.hull.cargo && pz.hull.cargo.length), 'at peace: ' + (went0 ? 'SAILED' : 'stayed'));
    const w = mk(false), g = AI.geo();
    const went = AI.seaSearch(w.read);
    const aboard = (w.hull.cargo || []).length, home = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u)).length;
    ck('aBlindChiefPutsAPartyAshore', went === true && aboard >= 1 && aboard <= 3 && !!w.hull.task && w.hull.task.type === 'unload', aboard + ' aboard');
    ck('andAHomeGuardStays', home >= 2, home + ' left at home');
    const tx = w.hull.task ? w.hull.task.x : 0, ty = w.hull.task ? w.hull.task.y : 0, lm = g.lab[idx(tx, ty)];
    ck('onLandThatIsNotOurs', lm > 0 && lm !== g.homeMass, 'beach ' + tx + ',' + ty + ' on mass ' + lm + ' (home ' + g.homeMass + ')');
    // put the hull against that beach and land them
    const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => [tx + ox, ty + oy]).find(([x, y]) => S.map.terrain[idx(x, y)] === T.WATER);
    w.hull.x = wet[0] + 0.5; w.hull.y = wet[1] + 0.5; w.hull.path = null;
    const ids = (w.hull.cargo || []).map(c => c.id);
    Units.disembark(w.hull);
    S.day++;
    AI.seaSearch(w.read);
    const ashore = S.units.filter(u => ids.includes(u.id));
    ck('theyLandAsScouts', ashore.length === ids.length && ashore.every(u => u.scouting && S.ai.scouts.includes(u.id)), ashore.length + ' of ' + ids.length + ' ashore, scouting');
    const dst = ashore.length ? AI.searchTarget(ashore[0]) : null;
    ck('andWalkThatLandNotOurs', !!dst && g.lab[idx(dst.x, dst.y)] === lm, dst ? 'next leg ' + dst.x + ',' + dst.y + ' on mass ' + g.lab[idx(dst.x, dst.y)] : 'no leg');
  });

  /* ---- 8. ONLY THOSE WHO CAN WALK THERE MARCH. ---- */
  section(['theStormLeavesTheStrandedForTheFleet', 'andMarchesThemWhereARoadRuns', 'theBlindHuntNeverReadsTheTrueHall'], () => {
    const w = twoIslands(false); knowTheHall(w);
    const ms = men(5, 8, w.my + 3);
    const n = AI.stormTheHall(S.ai.knownB[idx(w.tP.x, w.tP.y)]);
    const raiding = ms.filter(u => u.task && u.task.type === 'raid').length;
    ck('theStormLeavesTheStrandedForTheFleet', n === 0 && raiding === 0, 'stormTheHall=' + n + ', ' + raiding + ' of 5 put on a raid they cannot walk to');
    const j = twoIslands(true); knowTheHall(j);
    const mj = men(5, 8, j.my + 3);
    const nj = AI.stormTheHall(S.ai.knownB[idx(j.tP.x, j.tP.y)]);
    ck('andMarchesThemWhereARoadRuns', nj === 5 && mj.every(u => u.task && u.task.type === 'raid'), 'stormTheHall=' + nj);
    const b2 = twoIslands(false); seeHome();
    const ht = AI.huntTarget();
    ck('theBlindHuntNeverReadsTheTrueHall', ht === null, ht ? 'marches on ' + ht.x + ',' + ht.y + ' (the hall is at ' + b2.tP.x + ',' + b2.tP.y + ')' : 'no target: the walk is over');
  });

  /* ---- 9. A DETAIL OUTLIVES THE STAMP; THE TRIBE SEES AS IT WALKS. ---- */
  section(['aDetailOutlivesTheDaysStanceStamp', 'theTribeSeesAsItWalks', 'andAGlanceOnlyAdds', 'theWallPassSaysWhatItDid'], () => {
    const w = twoIslands(true);
    const ms = men(2, 8, w.my + 3);
    AI.detail(ms[0], 'escort', 3);
    AI.daily();
    ck('aDetailOutlivesTheDaysStanceStamp', ms[0].defend === false && ms[1].defend === true, 'on a detail: defend=' + ms[0].defend + '; idle: defend=' + ms[1].defend);
    ck('theWallPassSaysWhatItDid', typeof AI.maybeWalls(w.tA) === 'number', typeof AI.maybeWalls(w.tA));
    S.ai.knownB = {};
    const r = Units.spawn('rider', 'A', w.tP.x - 3, w.tP.y);
    r.path = [{ x: w.tP.x - 2, y: w.tP.y }]; r.pathI = 0;
    let sum0 = 0; for (let i = 0; i < AI._vis.length; i++) sum0 += AI._vis[i];
    AI.glance();
    let sum1 = 0; for (let i = 0; i < AI._vis.length; i++) sum1 += AI._vis[i];
    ck('theTribeSeesAsItWalks', !!S.ai.knownB[idx(w.tP.x, w.tP.y)], 'a rider passing the hall at noon ' + (S.ai.knownB[idx(w.tP.x, w.tP.y)] ? 'saw it' : 'saw nothing'));
    ck('andAGlanceOnlyAdds', sum0 === sum1, 'the dawn pass\'s sight is untouched (' + sum0 + ' -> ' + sum1 + ')');
  });

  /* ---- 9b. THE HURT GO HOME TO MEND, at the player's own price. ---- */
  section(['aHurtSoldierWalksHome', 'andIsMendedAtThePlayersPrice', 'neverIntoHunger', 'norTwiceInTwoDays', 'andCalmsChiefDoesNotMend'], () => {
    const w = twoIslands(true);
    const [hurt, well] = men(2, 14, w.my + 6);
    hurt.hp = Math.round(hurt.maxhp * 0.2);
    const r0 = AI.mendTheHurt(w.read);
    const z = Bld.healZoneFor(hurt);
    const goesHome = !!hurt.task && hurt.task.type === 'move' && Math.hypot(hurt.task.x + 0.5 - z.x, hurt.task.y + 0.5 - z.y) <= z.r && !!hurt.detail && hurt.detail.kind === 'mend';
    ck('aHurtSoldierWalksHome', r0 === 0 && goesHome && !well.task, hurt.task ? 'sent to ' + hurt.task.x + ',' + hurt.task.y : 'left standing at a fifth of its strength');
    // on the healing ground, with a thin granary
    hurt.x = hurt.task ? hurt.task.x + 0.5 : z.x; hurt.y = hurt.task ? hurt.task.y + 0.5 : z.y; hurt.path = null;
    const price = Math.max(1, Math.ceil((1 - hurt.hp / hurt.maxhp) * CFG.HEAL_FOOD[hurt.kind]));
    S.ai.res.food = price + 20;
    AI.mendTheHurt(w.read);
    ck('neverIntoHunger', hurt.hp < hurt.maxhp && S.ai.res.food === price + 20, 'granary ' + (price + 20) + ', price ' + price);
    S.ai.res.food = 1000;
    AI.mendTheHurt(w.read);
    ck('andIsMendedAtThePlayersPrice', hurt.hp === hurt.maxhp && S.ai.res.food === 1000 - price, 'paid ' + (1000 - S.ai.res.food) + ' food (the player pays ' + price + ')');
    hurt.hp = Math.round(hurt.maxhp * 0.2);
    AI.mendTheHurt(w.read);
    ck('norTwiceInTwoDays', hurt.hp < hurt.maxhp, 'a second mend the same day');
    const c = twoIslands(true); S.mode = 'calm';
    const [h2] = men(1, 14, c.my + 6); h2.hp = Math.round(h2.maxhp * 0.2);
    const rc = AI.mendTheHurt(c.read);
    ck('andCalmsChiefDoesNotMend', rc === 0 && !h2.task && G.modeCfg().aiMend === false, 'calm: ' + (h2.task ? 'sent home' : 'left as it was'));
    S.mode = 'moderate';
  });

  /* ---- 9c. THE SEA IS A ROAD TO A CHIEF WHO THINKS SO. ---- */
  section(['theMarinerThinksOfTheSeaAsARoad', 'aFarmerDoesNot', 'aCraftyChiefLearnsItFromItsLosses', 'theSeaRaiderLandsWithTheRoadOpen'], () => {
    const w = twoIslands(true); knowTheHall(w);
    S.ai.persona = 'mariner';
    ck('theMarinerThinksOfTheSeaAsARoad', AI.seaMinded(w.read) === true, 'a land road and a shared sea');
    S.ai.persona = 'homesteader'; S.ai.memory.towerStop = S.day;
    ck('aFarmerDoesNot', AI.seaMinded(w.read) === false, 'even stopped by towers (creativity ' + AI.creativity().toFixed(2) + ')');
    S.ai.persona = 'warlord';
    const crafty = AI.seaMinded(w.read);
    S.ai.memory.towerStop = 0;
    ck('aCraftyChiefLearnsItFromItsLosses', crafty === true && AI.seaMinded(w.read) === false, 'the warlord: stopped by towers ' + crafty + ', never stopped ' + AI.seaMinded(w.read));
    S.ai.persona = 'mariner'; S.ai.posture = 'PUSH'; S.ai.stall = null; S.ai.seaCd = 0;
    const hull = Units.spawn('transport', 'A', 3, w.my + 4);
    men(7, 8, w.my + 3);
    w.read = AI.assess() || S.ai.read; S.ai.posture = 'PUSH';
    const went = AI.secondFront(w.read);
    ck('theSeaRaiderLandsWithTheRoadOpen', went === true && (hull.cargo || []).length >= 3, went ? (hull.cargo || []).length + ' aboard, bound for the far shore' : 'no landing: the fleet waits for a stall that never comes');
  });

  /* ---- 10. THE NEW STATE RIDES IN THE SAVE. ---- */
  section(['theNewStateRidesInTheSave', 'andAnOlderSaveLoads'], () => {
    const w = twoIslands(false); seeHome();
    const ms = men(4, 8, w.my + 3);
    AI.detail(ms[0], 'lookout', 9);
    S.ai.seaParty = { hull: 7, ids: [ms[1].id], day: S.day, mass: 2, x: 30, y: 12 };
    S.ai.memory.seaTried = { 2: S.day }; S.ai.seaOnly = true; S.ai.assaultLane = { x: 3, y: 9 };
    AI.noteDeath(8, w.my + 5, Units.spawn('villager', 'A', 8, w.my + 5));
    const json = G.saveJSON(), id0 = ms[0].id;
    G.loadJSON(json); Screens._demo = false; S.paused = true;
    const u = S.units.find(x => x.id === id0);
    const dAt = S.ai.deadAt && S.ai.deadAt[8 + ',' + (w.my + 5)];
    ck('theNewStateRidesInTheSave', !!u && !!u.detail && u.detail.kind === 'lookout' && !!S.ai.seaParty && S.ai.seaParty.mass === 2 &&
      !!S.ai.memory.seaTried && S.ai.seaOnly === true && !!S.ai.assaultLane && !!dAt && Array.isArray(dAt.wd), 'detail, sea party, tried coasts, the workers\' ledger');
    const old = JSON.parse(json);
    delete old.ai.seaParty; delete old.ai.seaOnly; delete old.ai.assaultLane; delete old.ai.seaPartyDay; delete old.ai.memory.seaTried;
    for (const k in old.ai.deadAt) delete old.ai.deadAt[k].wd;
    for (const x of old.units) delete x.detail;
    G.loadJSON(JSON.stringify(old)); Screens._demo = false; S.paused = true;
    let threw = null;
    try { AI.assess(); AI.geo(); AI.seaSearch(S.ai.read); AI.deadWork(8, 20); AI.daily(); } catch (e) { threw = String(e && e.message || e); }
    ck('andAnOlderSaveLoads', !threw && S.ai.seaParty !== undefined, threw || 'a save from before the rewrite plays on');
  });

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL CONTRACT CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL/.test(e)).slice(0, 4));
await b.close();
process.exit(out.fails.length ? 1 : 0);
