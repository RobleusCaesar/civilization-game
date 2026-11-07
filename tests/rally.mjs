/* THE RALLY IS AN ORDER IN WAITING (build 158).

   Operator: "when you're building a unit, and you click something for Move /
   Set Rally point, the unit should automatically start doing something if
   they can at the point. For example, if you create an archer and click Set
   Rally on a tower, then when the archer is created they go to and
   automatically scale the tower. If the tower is full, the archer just stands
   at the base. Town Center can send villagers to a bush, stone, wood, etc…
   There should be a little ring that blinks once… Any place where someone
   can be sent should be selectable. Don't forget transport ships too.
   Villagers and soldiers can keep stacking as long as it's available… If the
   item gets full, don't move the rally point."

   The rules this file pins:

     ONE PLAN         Units.rallyPlan is the one answer to "what would a fresh
                      unit do there": the tap's toast and the release ask it.
     IT DOES THE JOB  a tower is climbed, a hull boarded, a station worked, a
                      site built, a resource gathered, a seam claimed, a foe's
                      works attacked (at war only).
     IT STACKS        while there is room (two bows on a tower, two hands on a
                      camp, the edges of a resource, a hull's five seats) —
                      and then the next one STANDS BY it, and the rally never
                      moves.
     THE TAP PICKS    a rally armed from a panel lands on what the finger hit:
                      an own transport, a building (a sliver off counts when a
                      trainee could act there), else the tile; the toast says
                      what new units will do, and a ring blinks once.
     PLAIN GROUND     is a plain walk, as before, with no ring.

   Run after touching: Units.rallyPlan / rallyTo / rallyStand / rallyPoint /
   gatherRoom, Bld.releaseTrained, UI.rallyPick / rallyPreview, the rally
   branch of UI.handleTap, or R.draw's rally flag and ring.

     node tests/rally.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 500, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1000);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, info) => { res[n] = ok ? 'PASS' + (info ? ' — ' + info : '') : 'FAIL ' + (info || ''); if (!ok) fails.push(n); };
  const TL = CFG.TILE;

  // a flat meadow round the hall, so every scenario stands on known ground
  const fresh = (seed, mode) => {
    G.newGame(seed, mode || 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
    const tc = Bld.tcOf('P');
    S.units = S.units.filter(u => !(u.owner === 'P' && u.kind !== 'villager') && u.owner !== 'W' && u.owner !== 'R');
    S.buildings = S.buildings.filter(bl => bl === tc || bl.owner !== 'P');
    for (let dy = -9; dy <= 10; dy++) for (let dx = -9; dx <= 10; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.onBoard(x, y) || Bld.covers(tc, x, y)) continue;
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.resAmount[i] = 0;
      S.map.explored[i] = 1;
    }
    // the villagers already out stay out of the way: idle, at home
    for (const u of S.units) if (u.owner === 'P') { u.task = null; u.path = null; }
    Bld._block = null;
    return tc;
  };
  const put = (key, x, y, owner) => Bld.place(owner || 'P', key, x, y, { free: true, instant: true });
  const release = (bl, kind) => {
    const spot = Bld.spawnSpot(bl, kind);
    return spot ? Bld.releaseTrained(bl, kind, spot) : null;
  };
  const forest = (x, y) => { const i = MapGen.idx(x, y); S.map.terrain[i] = T.FOREST; S.map.resAmount[i] = 200; Bld._block = null; };
  const scr = (wx, wy) => [(wx * TL - R.cam.x) * R.cam.z, (wy * TL - R.cam.y) * R.cam.z];
  const tapAt = (wx, wy) => { const [sx, sy] = scr(wx, wy); UI.handleTap(sx, sy); };
  let said = '';
  const toast0 = UI.toast.bind(UI);
  UI.toast = (msg, ...rest) => { said = String(msg); return toast0(msg, ...rest); };
  const lastToast = () => said;
  const center = (x, y) => { R.cam.z = 1.7; R.cam.x = (x + 0.5) * TL - innerWidth / 2 / R.cam.z; R.cam.y = (y + 0.5) * TL - innerHeight / 2 / R.cam.z; };

  /* ---- 1. A TOWER IS CLIMBED, TWO AT A TIME; THE THIRD WAITS AT ITS FOOT ---- */
  {
    const tc = fresh('ra1');
    const range = put('range', tc.x + 4, tc.y + 3);
    const tw = put('tower', tc.x + 4, tc.y - 3);
    range.rally = { x: tw.x, y: tw.y, bid: tw.id };
    const a1 = release(range, 'archer'), a2 = release(range, 'archer'), a3 = release(range, 'archer');
    ck('anArcherRalliedToATowerGoesToManIt', a1 && a1.task && a1.task.type === 'mantower' && a1.task.id === tw.id,
      JSON.stringify(a1 && a1.task));
    ck('andTheSecondStacksBesideHim', a2 && a2.task && a2.task.type === 'mantower', JSON.stringify(a2 && a2.task));
    ck('theThirdStandsAtTheBase', a3 && a3.task && a3.task.type === 'move' &&
      Math.abs(a3.task.x - tw.x) <= 1 && Math.abs(a3.task.y - tw.y) <= 1, JSON.stringify(a3 && a3.task));
    ck('andTheRallyNeverMoves', range.rally.bid === tw.id && range.rally.x === tw.x && range.rally.y === tw.y,
      JSON.stringify(range.rally));
    // …and the two that went really climb it
    S.paused = false;
    for (let i = 0; i < 600 && !(a1.perch && a2.perch); i++) Units.update(1 / 30);
    ck('andTheyReachThePlatform', a1.perch === tw.id && a2.perch === tw.id, 'perch ' + a1.perch + '/' + a2.perch);
    // a barracks blade has no business on a tower: he only walks there
    const yard = put('barracks', tc.x - 6, tc.y + 3);
    yard.rally = { x: tw.x, y: tw.y, bid: tw.id };
    const d = release(yard, 'defender');
    ck('aBladeRalliedToATowerOnlyWalksThere', d && d.task && d.task.type === 'move', JSON.stringify(d && d.task));
  }

  /* ---- 2. THE HALL SENDS ITS VILLAGERS TO WORK, AND STACKS THEM ---- */
  {
    const tc = fresh('ra2');
    const fx = tc.x - 4, fy = tc.y + 1;
    forest(fx, fy);
    tc.rally = { x: fx, y: fy };
    const sent = [];
    for (let i = 0; i < 5; i++) sent.push(release(tc, 'villager'));
    const gath = sent.filter(v => v && v.task && v.task.type === 'gather' && v.task.x === fx && v.task.y === fy);
    const edges = new Set(gath.map(v => v.task.sx + ',' + v.task.sy));
    ck('newVillagersGatherAtTheRalliedWood', gath.length === 4, gath.length + ' of 5 gathering');
    ck('eachOnAnEdgeOfItsOwn', edges.size === gath.length, [...edges].join(' '));
    const fifth = sent[4];
    ck('theFifthStandsBesideIt', fifth && fifth.task && fifth.task.type === 'move' &&
      Math.abs(fifth.task.x - fx) + Math.abs(fifth.task.y - fy) <= 3, JSON.stringify(fifth && fifth.task));
    ck('andTheHallsRallyStaysPut', tc.rally.x === fx && tc.rally.y === fy && !tc.rally.bid, JSON.stringify(tc.rally));

    // a station: two hands, then the third waits
    const sx = tc.x + 5, sy = tc.y + 4;
    S.map.terrain[MapGen.idx(sx, sy)] = T.STUMPS; Bld._block = null;
    const camp = put('lumber', sx, sy);
    tc.rally = { x: camp.x, y: camp.y, bid: camp.id };
    const w = [release(tc, 'villager'), release(tc, 'villager'), release(tc, 'villager')];
    const working = w.filter(v => v && v.task && v.task.type === 'work' && v.task.id === camp.id).length;
    ck('aStationTakesItsCrewFromTheRally', working === Math.min(2, Bld.maxWorkers(camp)),
      working + ' working, room for ' + Bld.maxWorkers(camp));
    ck('andTheNextHandStandsByTheCamp', w[2] && w[2].task && w[2].task.type === 'move', JSON.stringify(w[2] && w[2].task));

    // a work site is built
    const site = Bld.place('P', 'house', tc.x - 3, tc.y - 5, { free: true });
    tc.rally = { x: site.x, y: site.y, bid: site.id };
    const builder = release(tc, 'villager');
    ck('aSiteIsBuiltByTheRallied', builder && builder.task && builder.task.type === 'build' && builder.task.id === site.id,
      JSON.stringify(builder && builder.task));

    // a gold seam is claimed
    const gx = tc.x + 7, gy = tc.y - 4;
    S.map.terrain[MapGen.idx(gx, gy)] = T.GOLDORE; Bld._block = null;
    tc.rally = { x: gx, y: gy };
    const miner = release(tc, 'villager');
    ck('aSeamIsClaimedByTheRallied', miner && miner.task && miner.task.type === 'claim', JSON.stringify(miner && miner.task));

    // under arms, a villager only walks
    S.levy = true;
    tc.rally = { x: fx, y: fy };
    const lv = release(tc, 'villager');
    ck('aLeviedHandOnlyWalksToTheWood', lv && lv.task && lv.task.type === 'move', JSON.stringify(lv && lv.task));
    S.levy = false;
  }

  /* ---- 3. A TRANSPORT IS BOARDED UNTIL ITS SEATS ARE TAKEN ---- */
  {
    const tc = fresh('ra3');
    const yard = put('barracks', tc.x + 4, tc.y + 3);
    // a hull at the shore: a pond beside the yard, the transport on it
    const wx = tc.x + 4, wy = tc.y + 7;
    for (let dy = 0; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
      const i = MapGen.idx(wx + dx, wy + dy); S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 0;
    }
    Bld._block = null;
    const tr = Units.spawn('transport', 'P', wx + 0.5, wy + 0.5);
    yard.rally = { x: wx, y: wy, uid: tr.id };
    const cap = Units.cargoCap(tr), sent = [];
    for (let i = 0; i < cap + 1; i++) sent.push(release(yard, 'defender'));
    const boarding = sent.filter(u => u && u.task && u.task.type === 'board' && u.task.id === tr.id).length;
    ck('soldiersRalliedToATransportBoardIt', boarding === cap, boarding + ' of ' + (cap + 1) + ' boarding, ' + cap + ' seats');
    const last = sent[cap];
    ck('andTheOneWithNoSeatWaitsAshore', last && last.task && last.task.type === 'move', JSON.stringify(last && last.task));
    ck('andTheRallyStillNamesTheHull', yard.rally.uid === tr.id, JSON.stringify(yard.rally));
    // the flag rides the hull
    tr.x += 0.6;
    const rp = Units.rallyPoint(yard.rally);
    ck('theRallyFlagRidesTheHull', Math.abs(rp.x - tr.x) < 1e-6 && Math.abs(rp.y - tr.y) < 1e-6, JSON.stringify(rp));
    // the hull gone, the rally is a walk to where it was
    S.units = S.units.filter(u => u !== tr);
    const after = release(yard, 'defender');
    ck('aSunkHullLeavesAPlainWalk', after && after.task && after.task.type === 'move', JSON.stringify(after && after.task));
  }

  /* ---- 4. A FOE'S WORKS ARE ATTACKED — AT WAR, NEVER IN THE TRUCE ---- */
  {
    const tc = fresh('ra4');
    S.peace = false;
    const yard = put('barracks', tc.x + 4, tc.y + 3);
    const foe = put('house', tc.x + 8, tc.y + 3, 'A');
    yard.rally = { x: foe.x, y: foe.y, bid: foe.id };
    const d = release(yard, 'defender');
    ck('atWarASoldierRalliedOnAFoesHouseAttacksIt', d && d.task && d.task.type === 'attackBld' && d.tBld === foe.id,
      JSON.stringify(d && d.task) + ' tBld ' + (d && d.tBld));
    S.peace = true;
    const d2 = release(yard, 'defender');
    ck('inTheTruceHeOnlyWalks', d2 && d2.task && d2.task.type === 'move' && S.peace === true, JSON.stringify(d2 && d2.task));
  }

  /* ---- 5. THE TAP PICKS THE TARGET, SAYS WHAT HAPPENS, AND BLINKS ONCE ---- */
  {
    const tc = fresh('ra5');
    const range = put('range', tc.x + 4, tc.y + 3);
    const tw = put('tower', tc.x + 4, tc.y - 3);
    G.updateVisibility();
    center(tw.x, tw.y);
    UI.settingRally = range.id;
    tapAt(tw.x + 0.5, tw.y + 0.5);
    ck('aTapOnATowerSetsTheRallyOnIt', range.rally && range.rally.bid === tw.id, JSON.stringify(range.rally));
    ck('andTheToastSaysTheyWillClimb', /climb the Watchtower/i.test(lastToast()), lastToast());
    ck('andARingBlinksRoundIt', !!(UI.rallyRing && UI.rallyRing.rally.bid === tw.id), JSON.stringify(UI.rallyRing));
    // the ring is a one-shot: it blinks and is gone
    let frames = 0;
    for (; frames < 120 && UI.rallyRing; frames++) R.draw(1 / 30);
    ck('theRingBlinksOnceAndIsGone', !UI.rallyRing && frames > 5 && frames < 60, frames + ' frames');

    // a sliver of a miss on the tower still lands on it (a bow could act there)
    range.rally = null; UI.settingRally = range.id;
    tapAt(tw.x + 1.25, tw.y + 0.5);
    ck('aSliverOffTheTowerStillPicksIt', range.rally && range.rally.bid === tw.id, JSON.stringify(range.rally));

    // a full tower: the rally is set, and the toast says they will wait
    const b1 = Units.spawn('archer', 'P', tw.x + 0.5, tw.y + 1.5), b2 = Units.spawn('archer', 'P', tw.x + 0.5, tw.y + 1.5);
    Lookout.order(b1, tw); Lookout.order(b2, tw);
    range.rally = null; UI.settingRally = range.id;
    tapAt(tw.x + 0.5, tw.y + 0.5);
    ck('aFullTowerStillTakesTheRally', range.rally && range.rally.bid === tw.id, JSON.stringify(range.rally));
    ck('andSaysTheyWillWaitBesideIt', /full for now/i.test(lastToast()), lastToast());

    // the hall on a bush a sliver off: the villagers' order snaps to it
    const bx = tc.x - 4, by = tc.y + 1;
    const i = MapGen.idx(bx, by); S.map.terrain[i] = T.FERTILE; S.map.resAmount[i] = 200; Bld._block = null;
    center(bx, by);
    UI.settingRally = tc.id;
    tapAt(bx + 1.2, by + 0.5);
    ck('theHallsTapSnapsToTheBush', tc.rally && tc.rally.x === bx && tc.rally.y === by, JSON.stringify(tc.rally));
    ck('andSaysTheVillagersWillGather', /villagers will gather food/i.test(lastToast()), lastToast());

    // plain ground: a plain walk, no ring
    UI.rallyRing = null;
    UI.settingRally = tc.id;
    tapAt(tc.x + 3.5, tc.y + 6.5);
    ck('plainGroundIsAPlainRally', tc.rally && tc.rally.x === tc.x + 3 && tc.rally.y === tc.y + 6 && !tc.rally.bid && !tc.rally.uid,
      JSON.stringify(tc.rally));
    ck('andBlinksNoRing', !UI.rallyRing && /Rally point set/.test(lastToast()), lastToast());
    const v = release(tc, 'villager');
    ck('andANewVillagerWalksThere', v && v.task && v.task.type === 'move' && v.task.x === tc.x + 3, JSON.stringify(v && v.task));

    // out of reach: nothing set, the tool stays armed
    const before = JSON.stringify(tc.rally);
    UI.settingRally = tc.id;
    center(tc.x + 14, tc.y);
    tapAt(tc.x + 14.5, tc.y + 0.5);
    ck('outOfReachSetsNothing', JSON.stringify(tc.rally) === before && UI.settingRally === tc.id, JSON.stringify(tc.rally));
    UI.settingRally = null;

    // the rally rides a save
    tc.rally = { x: tw.x, y: tw.y, bid: tw.id };
    const sv = JSON.parse(G.saveJSON ? G.saveJSON() : JSON.stringify(S));
    const tc2 = sv.buildings.find(bl => bl.id === tc.id);
    ck('theRallysTargetRidesASave', tc2 && tc2.rally && tc2.rally.bid === tw.id, JSON.stringify(tc2 && tc2.rally));
  }

  /* ---- 6. ONE PLAN: THE PREVIEW IS THE RELEASE ---- */
  {
    const tc = fresh('ra6');
    const fx = tc.x - 4, fy = tc.y + 1;
    forest(fx, fy);
    const pv = UI.rallyPreview(tc, { x: fx, y: fy });
    tc.rally = { x: fx, y: fy };
    const v = release(tc, 'villager');
    ck('thePreviewAndTheReleaseAgree', pv && pv.act === 'gather' && v.task.type === 'gather', JSON.stringify(pv));
  }

  return { res, fails };
});

let bad = out.fails.length;
for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ok   ' : '  FAIL ') + k + (v.length > 4 ? '  ' + v.replace(/^(PASS|FAIL) ?(— )?/, '') : ''));
if (errs.length) { console.log('page errors:\n  ' + errs.join('\n  ')); bad++; }
console.log(bad ? `${bad} FAILURE(S) — rally contract` : 'rally contract: all ' + Object.keys(out.res).length + ' checks pass');
await b.close();
process.exit(bad ? 1 : 0);
