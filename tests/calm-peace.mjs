/* THE CALM TRUCE — Calm starts at PEACE with the rival (tests own S.peace):
   neither tribe's units, hulls or towers auto-engage the other, the chief
   never postures for war (it expands and races for its own Wonder), and the
   player's FIRST attack order breaks the truce for good — after which Calm
   plays exactly as it always did. Barbarians and the wilds are outside the
   truce entirely.

   What this pins:
   1. S.peace: true on a fresh Calm run, false on every other mode; rides in
      the save; a pre-truce save backfills FALSE (whatever fighting was under
      way continues — the truce is a new-run promise).
   2. Combat.hostile is the single gate: no P<->A auto-acquisition and no
      tower fire in EITHER direction while the truce holds; barbarians stay
      hostile to both tribes.
   3. Every player attack-order path breaks the peace (unit taps and
      orderAttackBuilding both funnel to G.breakPeace), and the damage
      safety net catches anything that slips past the order sites.
   4. The chief at peace never chooses PUSH/PRESSURE, even on a read that
      would scream for it at war.
   5. The wonder race: the rival's bill is scaled (CFG.WONDER.aiCostFrac —
      its per-hand economy could never pay the player-scale 15k price), Calm
      pulls its gate earlier (MODES.calm.aiWonderDay), the site is revealed
      to the player the day ground is broken, and the #wonderWarn countdown
      banner holds the screen while the works rise.

   Run after touching: Combat.hostile/hostileUnits, G.breakPeace, the attack
   order sites in ui.js/units.js, AI.choosePosture/maybeWonder/wonderWatch,
   Bld.effCost, UI.tickWonderWarn, CFG.MODES.calm.

     node tests/calm-peace.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto('file://' + join(root, 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 20000 });

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const fresh = (mode) => {
    G.newGame('cp-' + mode, mode, 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
    return Bld.tcOf('P');
  };

  // ---- 1. the flag itself ----
  fresh('calm');
  ck('aCalmRunStartsAtPeace', S.peace === true, '');
  fresh('moderate');
  ck('everyOtherModeStartsAtWar', S.peace === false, '');

  // ---- 2. the truce holds BOTH ways, and the wilds sign nothing ----
  {
    fresh('calm');
    S.units = [];
    const pa = Units.spawn('archer', 'P', 20, 20);
    const av = Units.spawn('villager', 'A', 21, 20);
    const aa = Units.spawn('archer', 'A', 24, 20);
    const pv = Units.spawn('villager', 'P', 25, 20);
    Combat.scanT = 0; Combat.acquire();
    ck('nobodyAutoAcquiresAcrossTheTruce',
      !pa.tUnit && !aa.tUnit,
      'P archer holds ' + (pa.tUnit || 'nothing') + ', A archer holds ' + (aa.tUnit || 'nothing'));
    ck('andTheTowersHoldTheirFireBothWays',
      Combat.hostileToBld({ owner: 'P' }, aa) === false &&
      Combat.hostileToBld({ owner: 'A' }, pa) === false,
      'hostileToBld is the tower-fire gate');
    const raider = Units.spawn('raider', 'R', 30, 20);
    raider.hostileTo = 'ALL';   // a wave band; a camp tender defaults to hunting 'P'
    ck('theWildsSignNothing',
      Combat.hostileUnits(pa, raider) === true && Combat.hostileUnits(aa, raider) === true &&
      Combat.hostileUnits(raider, pv) === true,
      'barbarians stay everyone\'s problem');
  }

  // ---- 2b. THE MILITIA LEAK (a real day-4 save): the rival's townsfolk
  //      militia read "player military near the hall" through a hand-rolled
  //      owner check that never asked hostileUnits — so a rider merely riding
  //      past the rival hall at peace raised the militia, the villagers
  //      stabbed it, and the damage net blamed the player for the war.
  //      townUnderSiege and the militia acquire now share Combat.militiaFoe,
  //      whose P case goes through the peace-gated hostile() funnel. ----
  {
    fresh('calm');
    const atc = Bld.tcOf('A');
    const cx = Bld.cx(atc), cy = Bld.cy(atc);
    S.units = S.units.filter(u => !(u.owner === 'A' && Units.isMilitary(u)));
    const rider = Units.spawn('rider', 'P', cx + 2, cy);
    const near = Units.spawn('villager', 'A', cx + 1, cy);
    ck('aVisitingRiderIsNotASiege', Combat.townUnderSiege() === false,
      'a soldier of a tribe we are not at war with is a visitor');
    Combat.scanT = 0; Combat.acquire();
    ck('andRaisesNoMilitia', !near.tUnit && !near.militia,
      'villager holds ' + (near.tUnit || 'nothing'));
    // the same ground at WAR: the militia rises exactly as before
    G.breakPeace();
    ck('atWarTheSameGroundIsASiege', Combat.townUnderSiege() === true, '');
    Combat.acquire();
    ck('andTheTownsfolkTakeUpArms', near.tUnit === rider.id && near.militia === true,
      'war behavior unchanged — four villagers can still drag down a lone attacker');
  }

  // ---- 3. the first strike ends it, permanently and loudly ----
  {
    fresh('calm');
    S.units = [];
    const sword = Units.spawn('defender', 'P', 20, 20);
    const hut = Bld.list('A').find(x => x.key === 'tc');
    ck('theTruceHoldsUntilTheOrder', S.peace === true, '');
    Units.orderAttackBuilding(sword, hut);
    ck('theFirstStrikeEndsTheTruce', S.peace === false, '');
    ck('andItIsToldPlainly', S.log.some(l => /truce/i.test(l.msg)),
      'plain G.log at every difficulty — the player\'s own declaration');
    ck('andHostilityResumes', Combat.hostile('P', 'A') === true && Combat.hostile('A', 'P') === true, '');
    // save/load keeps the broken state — there is no walking it back
    G.loadJSON(G.saveJSON());
    ck('aBrokenTruceStaysBroken', S.peace === false, '');
  }

  // ---- 3b. the damage safety net (a path that skipped every order site) ----
  {
    fresh('calm');
    S.units = [];
    const pa = Units.spawn('archer', 'P', 20, 20);
    const av = Units.spawn('villager', 'A', 21, 20);
    Units.damage(av, 3, pa.id);
    ck('theDamageNetCatchesStrays', S.peace === false, 'any P<->A blood ends it');
  }

  // ---- 3c. a pre-truce save wakes at war ----
  {
    fresh('calm');
    const j = JSON.parse(G.saveJSON());
    delete j.peace;
    G.loadJSON(JSON.stringify(j));
    ck('aPreTruceSaveWakesAtWar', S.peace === false,
      'the truce is a new-run promise, never something a mid-war save wakes up inside');
    // …while a truce SAVED is a truce KEPT
    fresh('calm');
    G.loadJSON(G.saveJSON());
    ck('aSavedTruceIsAKeptTruce', S.peace === true, '');
  }

  // ---- 4. the chief never postures for war while the truce holds ----
  {
    fresh('calm');
    S.ai.read = Object.assign({}, S.ai.read, {
      sacked: false, underThreat: false, threat: 0,
      foeVuln: true, strikeWindow: true, myPower: 20, foePower: 2, powerRatio: 10,
      knownTC: { x: 5, y: 5, seen: S.day }, econEdge: 500,
    });
    S.ai.posture = null;
    const post = AI.choosePosture();
    ck('theChiefNeverPosturesForWar', post === 'EXPAND',
      'a read screaming PUSH still answers ' + post + ' while the truce holds');
  }

  // ---- 5. the wonder race ----
  {
    const frac = CFG.WONDER.aiCostFrac;
    const full = CFG.BUILDINGS.wonder.levels[0].cost;
    const eff = Bld.effCost('A', 'wonder');
    ck('theRivalsBillIsScaled',
      frac > 0 && frac < 1 && eff.wood === Math.round(full.wood * frac) &&
      eff.gold === Math.round(full.gold * frac) &&
      eff.food === 0 && eff.stone < eff.wood,
      'aiCostFrac ' + frac + ': ' + eff.wood + ' wood against the player\'s ' + full.wood +
      '; foodless (a live town EATS its food) and stone-light (the finite resource)');
    ck('thePlayerStillPaysInFull', Bld.effCost('P', 'wonder').food === full.food, '');

    fresh('calm');
    S.ai.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    S.ai.acts = 99;
    // clear ground round the rival hall so plotWonder has a 3x3 to take
    const atc = Bld.tcOf('A');
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = atc.x + dx, y = atc.y + dy;
      if (MapGen.inB(x, y) && !Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    Bld._block = null;
    const gate = CFG.MODES.calm.aiWonderDay;
    ck('calmPullsTheGateEarlier', gate != null && gate < (CFG.WONDER.aiDay || 350), 'day ' + gate);
    S.day = gate - 1;
    ck('notADayBeforeTheGate', AI.maybeWonder() === false, '');
    S.day = gate;
    const laid = AI.maybeWonder();
    const w = Bld.list('A').find(x => x.key === 'wonder');
    ck('onTheDayTheGroundIsBroken', laid === true && !!w, '');
    ck('andTheSiteIsRevealedToThePlayer',
      !!w && !!S.map.explored[MapGen.idx(w.x, w.y)] &&
      !!(S.map.seenB && S.map.seenB[MapGen.idx(w.x, w.y)]),
      'Bld.place reveals the works the day the ground is broken');
    ck('andThePeaceHolds', S.peace === true, 'raising a monument is not an attack');
    // the countdown banner: pinned while the works rise, gone when they fall
    document.body.classList.add('ingame');
    UI.tickWonderWarn();
    const el = document.getElementById('wonderWarn');
    const shown = el && el.style.display !== 'none' && /\d+ days? of work/.test(el.textContent);
    ck('theCountdownHoldsTheScreen', !!shown, el ? el.textContent : 'no #wonderWarn element');
    Bld.removeToRuin(w);
    UI.tickWonderWarn();
    ck('andRetiresWhenTheWorksFall', el.style.display === 'none', '');
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL CALM-PEACE CHECKS PASS');
console.log('errors:', JSON.stringify(errors.slice(0, 4)));
await b.close();
process.exit(out.fails.length || errors.length ? 1 : 0);
