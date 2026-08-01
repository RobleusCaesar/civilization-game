/* BARBARIAN SENSE CONTRACT — bands fight what's in front of them, leave when
   there's nothing left, and land where the town is soft.

   Three player-visible failures, one screenshot (day 391):

   1. PREY — `Combat.raiderSeek`'s prey tiers were soldiers (`isMilitary`)
      then villagers (`isVillager`). A sapper is NEITHER, so a barbarian
      standing shoulder-to-shoulder with a player sapper had no predicate
      that ever matched it and simply ignored it. Tier 2 is now ANY hostile
      land unit (`!isNaval`) — villagers, sappers, scouts alike.

   2. LEAVE — a band with nothing reachable is supposed to walk off the board
      (`raiderLeave`). But `canReach`'s documented side effect (it SETS
      `u.path` to the best-effort route toward whatever it tested) made
      `raiderLeave`'s `Units.moving(u)` check read a failed prey probe as
      "already trudging out", and the full seek re-ran every frame, stomping
      any exit route — so stranded bands paced the shoreline forever. The
      exit is now a COMMITTED march (`u.leaving`): while it stands, the seek
      is skipped (a departing band only cuts down what's within 2.5 tiles of
      its way), `raiderLeave` re-arms the path only when it runs dry, and a
      band with no road off the board at all melts away on the spot. A
      units.js backstop melts ANY 'R' land unit that sits idle — no target,
      no path — for 8 straight seconds, whatever wedged it.

   3. SEA — two halves:
      a. A barbarian transport that exhausted its landing retries just parked
         at the coast with its warriors aboard, forever ("they can't reach
         land"). It now `sailOff`s: paths for the map rim and despawns there,
         cargo and all — and if not even open water leads off the board, it
         slips away immediately. It NEVER idles with a full hold.
      b. The landing site was "first open beach nearest the prey" — which,
         against a fortified waterfront, is exactly the player's gate. It's
         now `Combat.pickLanding`: every beach along the sail is scored —
         nearest soft building (anything that isn't wall/gate/tower/warcamp)
         wins, +8 for lying inside a finished tower's / war camp's covered
         stretch, +2.5 per wall/gate within 3 tiles. The longboat beaches at
         the soft underbelly and walks in, instead of unloading into arrow
         fire at the best-defended tiles on the map.

   Run this after touching any of:
     combat.js — raiderSeek, raiderLeave, nearestEdgeTile, pickLanding,
                 maybeWave's seaborne branch, canReach
     units.js — the raider branch in update (stall backstop), disembark,
                sailOff, the 'sailoff'/'unload' task branches
     config.js — tower/warcamp levels (range), WAVES

     node tests/barb-sense.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
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

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    /* Every map now plants BARBARIAN CAMPS with bands about them
       (tests/raider-camps.mjs) — real 'R' units that belong to no scenario
       here. Clear them, so every count below is about the band the scenario
       itself put on the board and nothing else. */
    for (const c of Bld.list('R').filter(z => z.key === 'raidercamp')) Bld.removeToRuin(c);
    S.units = S.units.filter(u => !u.campId);
    Bld._block = null;
    return Bld.tcOf('P');
  };
  const T2 = (x, y, t) => { S.map.terrain[MapGen.idx(x, y)] = t; };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };

  // ---- 1. a sapper is prey — the band next to it attacks, not ignores ----
  {
    const tc = setup('bs1');
    // a clear little arena far from both towns
    for (let y = 24; y <= 28; y++) for (let x = 24; x <= 28; x++) T2(x, y, T.GRASS);
    const sap = Units.spawn('sapper', 'P', 26, 26);
    const r = Units.spawn('raider', 'R', 27, 26); r.hostileTo = 'P';
    Combat.raiderSeek(r);
    ck('sapperIsPrey', r.tUnit === sap.id, `tUnit=${r.tUnit} (sapper id=${sap.id})`);
    const hp0 = sap.hp;
    run(3);
    ck('sapperActuallyTakesHits', sap.hp < hp0 || !S.units.includes(sap), `hp ${hp0} -> ${sap.hp}`);
  }

  // ---- 2. regression: a villager is still prey ----
  {
    setup('bs2');
    for (let y = 24; y <= 28; y++) for (let x = 24; x <= 28; x++) T2(x, y, T.GRASS);
    const v = Units.spawn('villager', 'P', 26, 26);
    const r = Units.spawn('raider', 'R', 27, 26); r.hostileTo = 'P';
    Combat.raiderSeek(r);
    ck('villagerStillPrey', r.tUnit === v.id, `tUnit=${r.tUnit}`);
  }

  // ---- 3. a band stranded on a pocket (prey visible across the water it can
  //         never cross) melts away instead of glitching in place forever ----
  {
    setup('bs3');
    // 7x7 water block with a single grass tile at its heart — an island pocket
    for (let y = 22; y <= 28; y++) for (let x = 22; x <= 28; x++) T2(x, y, T.WATER);
    T2(25, 25, T.GRASS);
    for (let x = 20; x <= 30; x++) T2(x, 30, T.GRASS);   // land just south, within sight
    const sap = Units.spawn('sapper', 'P', 25, 30);      // the "right next to them" bystander
    const r = Units.spawn('raider', 'R', 25, 25); r.hostileTo = 'P';
    const t = run(20, () => !S.units.includes(r));
    ck('strandedBandMeltsAway', !S.units.includes(r), `on-board=${S.units.includes(r)} at ${t}s`);
    ck('bystanderSapperUntouched', S.units.includes(sap) && sap.hp === sap.maxhp, `sapper hp=${sap.hp}`);
  }

  // ---- 4. a raider marooned ON open water (illegal state, however it got
  //         there) despawns rather than standing on the waves forever ----
  {
    setup('bs4');
    for (let y = 20; y <= 30; y++) for (let x = 20; x <= 30; x++) T2(x, y, T.WATER);
    const r = Units.spawn('raider', 'R', 25, 25); r.hostileTo = 'P';
    const t = run(20, () => !S.units.includes(r));
    ck('waterMaroonedDespawns', !S.units.includes(r), `on-board=${S.units.includes(r)} at ${t}s`);
  }

  // ---- 5. nothing reachable but a road out exists — the band WALKS OFF the
  //         board (the committed exit march), it doesn't stand pacing ----
  {
    setup('bs5');
    // strip every player thing onto nothing: the raider's whole prey list is
    // one house on an island it can never reach
    S.units = S.units.filter(u => u.owner !== 'P');
    S.buildings = S.buildings.filter(b => b.owner !== 'P');
    for (let y = 22; y <= 26; y++) for (let x = 22; x <= 26; x++) T2(x, y, T.WATER);
    T2(24, 24, T.GRASS);
    Bld.place('P', 'house', 24, 24, { free: true, instant: true });
    // a clear corridor from the raider straight to the northern rim
    for (let y = 1; y <= 8; y++) for (let x = 8; x <= 12; x++) T2(x, y, T.GRASS);
    const r = Units.spawn('raider', 'R', 10, 8); r.hostileTo = 'P';
    let sawLeaving = false;
    let t = 0; const dt = 0.1;
    while (t < 30 && S.units.includes(r)) { Units.update(dt); Combat.update(dt); if (r.leaving) sawLeaving = true; t += dt; }
    ck('unreachablePreyBandLeaves', !S.units.includes(r), `on-board=${S.units.includes(r)} at ${+t.toFixed(1)}s`);
    ck('leftViaCommittedMarch', sawLeaving, 'u.leaving was never set — despawned some other way');
  }

  // ---- 6. the landing is scored: the longboat beaches at the soft underbelly,
  //         never on the fortified stretch under the tower by the gate ----
  {
    setup('bs6');
    S.units = S.units.filter(u => u.owner !== 'P');
    S.buildings = S.buildings.filter(b => b.owner !== 'P');
    // a 1-wide sail channel down x=35, grass banks either side
    for (let y = 3; y <= 27; y++) for (let x = 32; x <= 38; x++) T2(x, y, T.GRASS);
    for (let y = 4; y <= 26; y++) T2(35, y, T.WATER);
    // the fortified stretch (north, nearest the prey): gate + walls + a Lv3 tower
    const tc = Bld.place('P', 'tc', 37, 5, { free: true, instant: true });
    Bld.place('P', 'wall', 34, 5, { free: true, instant: true });
    Bld.place('P', 'gate', 34, 6, { free: true, instant: true });
    Bld.place('P', 'wall', 34, 7, { free: true, instant: true });
    const tw = Bld.place('P', 'tower', 33, 6, { free: true, instant: true });
    tw.level = 3; tw.maxhp = CFG.BUILDINGS.tower.levels[2].hp; tw.hp = tw.maxhp;
    // the soft underbelly (south): houses, no defenses anywhere near
    Bld.place('P', 'house', 33, 20, { free: true, instant: true });
    Bld.place('P', 'house', 33, 21, { free: true, instant: true });
    const cells = []; for (let y = 4; y <= 26; y++) cells.push({ x: 35, y });
    const landing = Combat.pickLanding(cells, tc, null);
    ck('landingExists', !!landing, JSON.stringify(landing));
    if (landing) {
      const twd = Math.hypot(Bld.cx(tw) - (landing.x + 0.5), Bld.cy(tw) - (landing.y + 0.5));
      const rng = CFG.BUILDINGS.tower.levels[2].range;
      ck('landingOutsideTowerFire', twd > rng + 1.5, `landed ${twd.toFixed(1)} from the Lv3 tower (covers ${rng + 1.5})`);
      const softD = Math.min(
        Math.hypot(33.5 - (landing.x + 0.5), 20.5 - (landing.y + 0.5)),
        Math.hypot(33.5 - (landing.x + 0.5), 21.5 - (landing.y + 0.5)));
      ck('landingHugsTheSoftShore', softD <= 4, `landed ${softD.toFixed(1)} from the nearest house — ${JSON.stringify(landing)}`);
    }
  }

  // ---- 7. a longboat that cannot land does NOT park with a full hold — it
  //         gives up the raid and is gone, warriors and all ----
  {
    setup('bs7');
    // a small lake ringed entirely by forest: water everywhere inside, but no
    // beach a soldier could stand on
    for (let y = 27; y <= 33; y++) for (let x = 7; x <= 13; x++) T2(x, y, T.FOREST);
    for (let y = 28; y <= 32; y++) for (let x = 8; x <= 12; x++) T2(x, y, T.WATER);
    const tr = Units.spawn('transport', 'R', 10, 30); tr.hostileTo = 'P'; tr.cargo = [];
    for (let i = 0; i < 3; i++) {
      const ru = Units.spawn('raider', 'R', 10, 30); ru.hostileTo = 'P';
      S.units.splice(S.units.indexOf(ru), 1); tr.cargo.push(ru);
    }
    Units.orderUnload(tr, 9, 30);
    const t = run(30, () => !S.units.includes(tr));
    ck('fullHullNeverParksForever', !S.units.includes(tr), `hull on-board=${S.units.includes(tr)} at ${t}s, task=${JSON.stringify(tr.task)}`);
    ck('noRaiderLeftAfloat', !S.units.some(u => u.owner === 'R'), S.units.filter(u => u.owner === 'R').map(u => u.kind).join(','));
  }

  // ---- 8. regression: a longboat with a real beach still lands its warriors ----
  {
    setup('bs8');
    S.units = S.units.filter(u => u.owner !== 'P');
    // open water with a grass shore east of it, and a player house so the
    // landed band has prey and stays put for the assertion
    for (let y = 20; y <= 26; y++) for (let x = 18; x <= 23; x++) T2(x, y, T.WATER);
    for (let y = 20; y <= 26; y++) for (let x = 24; x <= 28; x++) T2(x, y, T.GRASS);
    Bld.place('P', 'house', 27, 23, { free: true, instant: true });
    const tr = Units.spawn('transport', 'R', 19, 23); tr.hostileTo = 'P'; tr.cargo = [];
    for (let i = 0; i < 2; i++) {
      const ru = Units.spawn('raider', 'R', 19, 23); ru.hostileTo = 'P';
      S.units.splice(S.units.indexOf(ru), 1); tr.cargo.push(ru);
    }
    Units.orderUnload(tr, 23, 23);
    const t = run(30, () => S.units.filter(u => u.owner === 'R' && u.kind === 'raider').length === 2);
    const ashore = S.units.filter(u => u.owner === 'R' && u.kind === 'raider');
    ck('warriorsStillComeAshore', ashore.length === 2, `${ashore.length} ashore after ${t}s`);
    ck('emptiedHullAbandoned', !S.units.includes(tr), 'hull should despawn once emptied');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BARB-SENSE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
