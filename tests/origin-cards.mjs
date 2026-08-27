/* ORIGIN CARDS — the 26-card pool, the strategy-openers, and the hooks.

   The pool grew from resource piles to STRATEGY OPENERS: ten cards now plant
   a real building (several of them ahead of their tech gate — the Bowyer's
   range, the Delver's camp, the Caravan Master's trading post), and every
   boon reads through a named Cards hook so the engine stays one line per
   call site. This file pins:

     APPLIES CLEAN   every card, both sides, several seeds — no throw, no
                     pageerror, and a gifted building never lands on top of
                     anything (Bld.place free+instant validates NOTHING, so
                     Cards._prebuild's footprint check is all that stands
                     between a gift and a range inside somebody's house)
     THE OPENERS     bowyer→range, delver→sapper camp (Lv2 on calm),
                     tradewind→trading post, warden→tower, huntlord→lodge on
                     bloodied ground, timberwright→lumber camp, seareaver→a
                     fireship on real water and NO dock
     THE HOOKS       Hearthbond deepens the homestead through
                     Bld.homesteadMult/Pop; the Warden's towers see farther
                     through G.updateVisibility; the Prospector's mines pay
                     through Cards.prodMult and its seams land in the
                     rival's ai.seen; quick feet / saddle-born are STAMPED
                     at spawn, never read per frame
     THE DEAL        same seed = same hand (determinism), the no-cancel rule
                     (an axis card never rides a rich/poor axis), needsShore
                     honored, the six classic persona keys still forceable
     THE FACE        every DEFS key draws a non-blank 64-grid motif, and no
                     boon headline outruns the card that must carry it

   Run after touching: js/cards.js, Bld.homesteadMult/homesteadPop,
   G.updateVisibility's building mark, or the draft screen's card CSS.

     node tests/origin-cards.mjs      # exits non-zero on any regression */

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

  const overlaps = () => {
    const boxes = S.buildings.map(bb => ({ x: bb.x, y: bb.y, s: Bld.size(bb), k: bb.key }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (a.x < c.x + c.s && c.x < a.x + a.s && a.y < c.y + c.s && c.y < a.y + a.s)
        return a.k + '@' + a.x + ',' + a.y + ' vs ' + c.k + '@' + c.x + ',' + c.y;
    }
    return null;
  };

  // ---- 1. every card applies clean on both sides, and gifts never overlap ----
  {
    let bad = null, overlap = null;
    for (const key of Cards.keys()) {
      for (const [seed, mode] of [['77', 'calm'], ['505354099', 'moderate'], ['9911', 'hard']]) {
        try {
          G.newGame(seed, mode, 'medium');
          Cards.apply('P', { key, roll: Cards.DEFS[key].roll() });
          Cards.apply('A', { key, roll: Cards.DEFS[key].roll() });
          const o = overlaps();
          if (o && !overlap) overlap = key + ': ' + o;
          for (let i = 0; i < 6; i++) { Units.update(0.12); Combat.update(0.12); }
          G.dayTick();
        } catch (e) { bad = bad || (key + '/' + mode + ': ' + String(e).slice(0, 120)); }
      }
    }
    ck('everyCardAppliesCleanOnBothSides', !bad, bad || '26 keys × 3 seeds/modes');
    ck('andNoGiftEverLandsOnAnotherBuilding', !overlap, overlap || '');
  }

  // ---- 2. the strategy-openers plant what they promise ----
  {
    const stands = (side, key, cardKey, wantLv) => {
      G.newGame('77', 'calm', 'medium');
      Cards.apply(side, { key: cardKey, roll: Cards.DEFS[cardKey].roll() });
      const bld = S.buildings.find(x => x.owner === side && x.key === key);
      return bld && Bld.done(bld) && (!wantLv || bld.level === wantLv) ? bld : null;
    };
    ck('theBowyerRaisesHisRange', !!stands('P', 'range', 'bowyer'), 'a range, finished, day one');
    ck('theDelverBringsHisCampAtCalmTierTwo', !!stands('P', 'sapper', 'delver', 2),
      'calm kick=2 → the Lv 2 camp (bridges unlocked)');
    ck('theCaravanMasterOpensTheMarket', !!stands('P', 'trade', 'tradewind'),
      'a trading post three hall-tiers early — the gift is the DOOR, not the price');
    ck('theWardenMansHisTower', !!stands('A', 'tower', 'warden'), 'and for the rival too');
    ck('theTimberwrightWorksAFelledStand', !!stands('P', 'lumber', 'timberwright'), '');
    const lodge = stands('P', 'lodge', 'huntlord');
    ck('theHuntlordsLodgeStandsOnBloodiedGround', !!lodge && G.huntedAt(lodge.x, lodge.y),
      lodge ? 'hunted=' + !!G.huntedAt(lodge.x, lodge.y) : 'no lodge');
    // the sea-reaver: a fireship on real water, and pointedly NO dock
    G.newGame('77', 'calm', 'medium');
    Cards.apply('P', { key: 'seareaver', roll: Cards.DEFS.seareaver.roll() });
    const ship = S.units.find(u => u.owner === 'P' && u.kind === 'fireship');
    const wet = ship && S.map.terrain[MapGen.idx(ship.x | 0, ship.y | 0)] === T.WATER;
    const dock = S.buildings.find(x => x.owner === 'P' && x.key === 'dock');
    ck('theSeaReaverRidesAtAnchor', !!ship && wet && !dock,
      ship ? ('wet=' + wet + ' dock=' + !!dock) : 'no ship');
  }

  // ---- 3. the hooks ----
  {
    // Hearthbond: the bond runs deeper — read through the SAME derived path
    G.newGame('77', 'moderate', 'medium');
    const tc = Bld.tcOf('P');
    const spot = MapGen.findNear(tc.x, tc.y, 10, (x, y) =>
      Bld.tileFree(x, y) && Bld.tileFree(x + 1, y) && Bld.tileFree(x + 2, y) && Bld.tileFree(x + 3, y));
    S.map.terrain[MapGen.idx(spot.x, spot.y)] = T.GRASS; S.map.terrain[MapGen.idx(spot.x + 1, spot.y)] = T.GRASS;
    const farm = Bld.place('P', 'farm', spot.x, spot.y, { free: true, instant: true, noAutoAssign: true });
    const house = Bld.place('P', 'house', spot.x + 1, spot.y, { free: true, instant: true, noAutoAssign: true });
    const m0 = Bld.homesteadMult(farm), p0 = Bld.homesteadPop(house);
    Cards.apply('P', { key: 'harvestlord', roll: { food: 0.10, pop: 1, kick: 0 } });
    const m1 = Bld.homesteadMult(farm), p1 = Bld.homesteadPop(house);
    ck('hearthbondDeepensTheBond', Math.abs(m1 - m0 - 0.10) < 1e-9 && p1 === p0 + 1,
      m0 + '→' + m1 + ', pop ' + p0 + '→' + p1);
    const farmA = { key: 'farm', owner: 'A', id: farm.id };
    ck('andOnlyForItsHolder', Bld.homesteadMult(farm.owner === 'P' ? farm : farmA) === m1 &&
      (Cards.homeAdd('A') === 0), 'the rival, boonless, keeps the base bond');

    // Warden: towers watch farther — measured on the real visibility grid,
    // on a tower planted FAR from the hall so nothing else lights the probe
    G.newGame('77', 'moderate', 'medium');
    const tc2 = Bld.tcOf('P');
    const ts = MapGen.findNear((CFG.W / 2) | 0, (CFG.H / 2) | 0, 10, (x, y) =>
      Bld.tileFree(x, y) && Math.hypot(x - tc2.x, y - tc2.y) >= 15 &&
      x > 12 && x < CFG.W - 12);
    const tw = Bld.place('P', 'tower', ts.x, ts.y, { free: true, instant: true, noAutoAssign: true });
    const base = Bld.lv(tw).vision || 4;
    const dir = tw.x - tc2.x > 0 ? 1 : -1;   // probe AWAY from the hall's own light
    const seen = (r) => { G.updateVisibility(); return G.vis[MapGen.idx(tw.x + dir * r, tw.y)] || 0; };
    const before = seen(base + 2);
    Cards._boon('P').sight = { add: 2 };
    const after = seen(base + 2);
    ck('theWardensTowersWatchFarther', before === 0 && after === 1,
      'tw=' + tw.x + ',' + tw.y + ' r=' + (base + 2) + ' dir=' + dir + ': ' + before + '→' + after);

    // Prospector: mines pay more, and the rival CHIEF remembers every seam
    G.newGame('77', 'moderate', 'medium');
    Cards.apply('A', { key: 'prospector', roll: { mm: 1.5, gold: 0 } });
    const seamIdx = [];
    for (let i = 0; i < S.map.terrain.length; i++) if (S.map.terrain[i] === T.GOLDORE) seamIdx.push(i);
    ck('theProspectorsMinesPayMore', Cards.prodMult('A', { key: 'mine' }) === 1.5 &&
      Cards.prodMult('A', { key: 'farm' }) === 1, '');
    ck('andTheRivalChiefRemembersEverySeam', seamIdx.length >= 2 &&
      seamIdx.every(i => S.ai.seen[i] === 1), seamIdx.length + ' seams');

    // quick feet / saddle-born: STAMPED at spawn, nothing read per frame
    G.newGame('77', 'moderate', 'medium');
    const v0 = S.units.find(u => u.owner === 'P' && u.kind === 'villager');
    const spd0 = v0.speed;
    Cards.apply('P', { key: 'forager', roll: { food: 0, wood: 0, stone: 0, kick: 0, pm: 1.12 } });
    const fresh = Units.spawn('villager', 'P', v0.x | 0, (v0.y | 0) + 1);
    ck('quickFeetAreStampedOnEveryHand', v0.speed > spd0 && fresh.speed > CFG.UNITS.villager.speed,
      spd0 + '→' + v0.speed + ', fresh ' + fresh.speed);

    // legacy boons from old saves still read (the hooks never dropped them)
    S.boons.P.farm = { mult: 1.25 };
    S.boons.P.tcGold = { add: 3, until: 99 };
    const r0 = { gold: 0 }; Cards.dailyExtras('P', r0);
    ck('aLegacySavesBoonsStillPay', Cards.prodMult('P', { key: 'farm' }) === 1.25 && r0.gold === 3, '');
  }

  // ---- 4. the deal ----
  {
    const handOf = () => { G.newGame('424242', 'moderate', 'large'); return JSON.stringify(S.draft.hand); };
    const h1 = handOf(), h2 = handOf();
    ck('aSeedDealsTheSameHandTwice', h1 === h2, '');
    // the no-cancel rule and the shore gate, over several seeds
    let cancel = null, shore = null;
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      G.newGame(seed, 'moderate', 'medium');
      const pk = S.opening.player;
      for (const c of S.draft.hand) {
        const d = Cards.DEFS[c.key];
        if (d.axis && (d.axis === pk.rich || d.axis === pk.poor)) cancel = cancel || (seed + ':' + c.key);
        if (d.needsShore && !Cards._shore('P')) shore = shore || (seed + ':' + c.key);
      }
    }
    ck('anAxisCardNeverFlattensTheRoll', !cancel, cancel || '8 seeds');
    ck('aWarshipNeedsWaterAtTheDoor', !shore, shore || '');
    // the six classic persona names still force the rival's pick
    let forcedOk = true;
    for (const k of ['homesteader', 'warlord', 'horselord', 'mariner', 'mason', 'forager']) {
      G.newGame('77', 'moderate', 'medium', k);
      if (S.draft.rival.pick.key !== k) { forcedOk = false; break; }
    }
    ck('theSixPersonasStillForce', forcedOk, '');
  }

  // ---- 5. the face: every key draws, and no headline outruns its card ----
  {
    let blank = null, longText = null, nan = null;
    G.newGame('77', 'calm', 'medium');
    for (const key of Cards.keys()) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
      Cards.drawMotif(cv, key);
      const d = cv.getContext('2d').getImageData(0, 0, 128, 128).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 96) n++;
      if (n < 400) blank = blank || (key + ' (' + n + 'px)');
      for (const mode of ['calm', 'moderate', 'hard']) {
        S.mode = mode;
        for (let t = 0; t < 6; t++) {
          const r = Cards.DEFS[key].roll();
          const txt = Cards.DEFS[key].text(r);
          if (txt.length > 60) longText = longText || (key + '/' + mode + ' (' + txt.length + '): ' + txt);
          const v = Cards.DEFS[key].val(r);
          if (!isFinite(v) || v <= 0) nan = nan || (key + '/' + mode + ' val=' + v);
        }
      }
    }
    ck('everyKeyDrawsAMotif', !blank, blank || '26 motifs, 64-grid');
    ck('noHeadlineOutrunsItsCard', !longText, longText || 'all ≤ 60 chars');
    ck('everyValIsAFiniteReward', !nan, nan || '');
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (out.fails.length || errs.length) { console.log('FAILURES:', out.fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL ORIGIN-CARD CHECKS PASS');
