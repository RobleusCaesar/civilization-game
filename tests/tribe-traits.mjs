/* TRIBE TRAITS CONTRACT — each of the five peoples has a HOME GROUND its
   camp seeks at map birth, and ONE signature habit beyond its look:

   PLACEMENT (G.plantTribalCamps / campHomeSpot):
     sea    the coast — the compound touches the waterline ("the ship dragged
            ashore"); wolf a carved alcove in the trees; flint under hills or
            mountains; woad the fertile meadows; broken over a gold seam.
     Statistical across a seed sweep (a map without the feature keeps the
     MapGen seat — flavor never fails a map), plus manners: never on a town's
     doorstep, never inside another camp's chase ground, and the same seed
     seats the same fires twice.

   HABITS:
     wolf   PACK TACTICS — Units.effAtk ×1.5 with 2 of the band within packR
     flint  BRUTE-BLOODED — manRaiderCamp rolls brutes at fleshBruteP
     broken THE DESERTER'S TOLL — G.campTakes: finish a fight with exactly
            one player soldier left standing alone and it defects to the band
     woad   THE PAINTING — G.campTakes: a villager cut down with no soldier
            near is taken; a new spear stands up at the fire
     sea    LONGBOAT SORTIES — coastal camps keep hulls at anchor
            (manRaiderCamp rotation), the fireship guards the anchorage
            (raiderSeek naval-tender branch), and G.seaSortie ships the band
            out to raid ACROSS water, releasing it to ordinary band logic.

   Run after touching G.plantTribalCamps / campHomeSpot / manRaiderCamp /
   tickRaiderCamps / seaSortie / campTakes, Units.effAtk / damage,
   Combat.raiderSeek's tender branch or Combat.openNet.

     node tests/tribe-traits.mjs      # exits non-zero on any regression */
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
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };
  const camps = () => S.buildings.filter(z => z.key === 'raidercamp' && z.owner === 'R');

  // ---- 1. placement: the peoples keep their home ground ----
  // xlarge/hard rolls the most camps per map, so every people shows up in
  // numbers worth measuring; a people the sweep barely dealt is reported,
  // not asserted (a bar on n=1 would be a coin-flip, not a contract)
  {
    const seeds = ['tt1', 'tt2', 'tt3', 'tt4', 'tt5', 'tt6', 'tt7', 'tt8', 'tt9', 'tt10', 'tt11', 'tt12'];
    const home = {}, seen = {};
    let manners = true, mInfo = '';
    for (const sd of seeds) {
      G.newGame(sd, 'hard', 'xlarge');
      const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
      for (const c of camps()) {
        seen[c.tribe] = (seen[c.tribe] || 0) + 1;
        if (G.campOnHomeGround(c.x, c.y, c.tribe)) home[c.tribe] = (home[c.tribe] || 0) + 1;
        const dP = Math.hypot(c.x - ptc.x, c.y - ptc.y), dA = Math.hypot(c.x - atc.x, c.y - atc.y);
        if (dP < 9 || dA < 9) { manners = false; mInfo = `${sd} ${c.tribe}@${c.x},${c.y} dP=${dP.toFixed(1)} dA=${dA.toFixed(1)}`; }
        for (const o of camps()) if (o !== c && Math.hypot(c.x - o.x, c.y - o.y) <= 5)
          { manners = false; mInfo = `${sd} camps ${c.x},${c.y} / ${o.x},${o.y} crowd`; }
      }
      // …and spawnWave's muster list points at the fires that actually burn
      for (const sc of (S.map.spawns.camps || [])) {
        const cb = Bld.at(sc.x, sc.y);
        if (!cb || cb.key !== 'raidercamp') { manners = false; mInfo = `${sd} muster list points at empty ground ${sc.x},${sc.y}`; }
      }
    }
    const rate = t => (home[t] || 0) / Math.max(1, seen[t] || 0);
    const few = t => (seen[t] || 0) < 3;   // too few dealt to bar — reported instead
    const fmt = ['sea', 'wolf', 'flint', 'woad', 'broken']
      .map(t => `${t} ${home[t] || 0}/${seen[t] || 0}`).join('  ');
    ck('theSeaFolkHoldTheCoast', few('sea') || rate('sea') >= 0.8, fmt);
    ck('theWolfskinsKeepTheTrees', few('wolf') || rate('wolf') >= 0.6, fmt);
    ck('theFlintfolkKeepTheStone', few('flint') || rate('flint') >= 0.55, fmt);
    ck('theWoadkinKeepTheMeadows', few('woad') || rate('woad') >= 0.5, fmt);
    ck('theBrokenSitOnWealthWhenThereIsAny', few('broken') || rate('broken') >= 0.15, fmt);
    ck('theSweepDealtEveryPeople', ['sea', 'wolf', 'flint', 'woad', 'broken'].every(t => seen[t] >= 1), fmt);
    ck('theFiresKeepTheirManners', manners, mInfo);
    // the same seed seats the same fires twice
    G.newGame('tt3', 'hard', 'xlarge');
    const a1 = camps().map(c => `${c.tribe}@${c.x},${c.y}`).sort().join(' ');
    G.newGame('tt3', 'hard', 'xlarge');
    const a2 = camps().map(c => `${c.tribe}@${c.x},${c.y}`).sort().join(' ');
    ck('theSameSeedSeatsTheSameFires', a1 === a2, a1);
  }

  /* ---- the fixture world: two grass islands (player / rival) in open sea,
     plus a small barbarian islet with a coastal camp — the shape a real
     islands roll produces, hand-built so every check is deterministic. */
  const setup = (seed, tribe, opts) => {
    G.newGame(seed, 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    for (const c of camps()) Bld.removeToRuin(c);
    S.units = S.units.filter(u => !u.campId);
    const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
    const W = CFG.W, H = CFG.H;
    if (opts && opts.ocean) {
      for (let i = 0; i < W * H; i++) { S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 0; }
    }
    /* discs stay OFF the outermost walkable ring (y/x = 1) — a real map's rim
       is impassable void, so Path.borderReach comes back null on an island
       world and Combat.openNet seeds from the camps instead. An island
       touching the ring would fake an open border and starve that fallback. */
    const disc = (cx, cy, r) => {
      for (let y = Math.max(2, cy - r); y <= Math.min(H - 3, cy + r); y++)
        for (let x = Math.max(2, cx - r); x <= Math.min(W - 3, cx + r); x++)
          if (Math.hypot(x - cx, y - cy) <= r) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    };
    let cx, cy;
    if (opts && opts.ocean) {
      disc(ptc.x + 1, ptc.y + 1, 6);
      disc(atc.x + 1, atc.y + 1, 6);
      for (const b2 of S.buildings.slice()) if (b2.key !== 'tc') Bld.removeToRuin(b2);
      S.bridges = [];
      for (const u of S.units) {
        const home = u.owner === 'A' ? atc : ptc;
        if (S.map.terrain[MapGen.idx(u.x | 0, u.y | 0)] === T.WATER || Units.isNaval(u)) {
          const spot = MapGen.findNear(home.x + 1, home.y + 1, 7, (x, y) => Path.passable(x, y, u.owner) && !Bld.at(x, y));
          if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; u.path = null; u.task = null; }
        }
      }
      // the barbarian islet sits offshore of the player's island
      cx = Math.max(6, ptc.x - 14); cy = Math.max(6, ptc.y - 10);
      disc(cx, cy, 4);
    } else {
      // a quiet inland spot with a pond beside it, far from both halls
      const spot = MapGen.findNear((ptc.x + atc.x) >> 1, (ptc.y + atc.y) >> 1, 18, (x, y) =>
        S.map.terrain[MapGen.idx(x, y)] === T.GRASS && !Bld.at(x, y) &&
        Math.hypot(x - ptc.x, y - ptc.y) > 12 && Math.hypot(x - atc.x, y - atc.y) > 12);
      cx = spot.x; cy = spot.y;
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 4; x <= cx - 2; x++)
        if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.WATER; S.map.resAmount[MapGen.idx(x, y)] = 0; }
    }
    const camp = G.plantRaiderCamp(cx, cy, tribe);
    S.units = S.units.filter(u => !u.campId);       // each check mans the band itself
    /* the muster list mirrors a real islands roll: a fire on each side of the
       water — Combat.openNet seeds the wilderness network from these, and a
       landing is only legal on ground that network can see */
    const pSeed = MapGen.findNear(ptc.x + 1, ptc.y + 1, 8, (x, y) => Path.passable(x, y) && !Bld.at(x, y));
    S.map.spawns.camps = [{ x: camp.x, y: camp.y }].concat(pSeed ? [pSeed] : []);
    for (let i = 0; i < S.map.explored.length; i++) { S.map.explored[i] = 1; S.map.seenTerrain[i] = S.map.terrain[i]; }
    Bld._block = null; G.freeVis = true; G.updateVisibility();
    S.peace = false;
    return { camp, ptc, atc };
  };

  // ---- 2. the Sea Folk: hulls at anchor, and the sortie ----
  {
    const { camp, ptc } = setup('ttsea', 'sea', { ocean: true });
    G.manRaiderCamp(camp, 9);
    const tenders = G.campTenders(camp);
    const boats = tenders.filter(u => Units.isNaval(u));
    ck('theCoastalCampKeepsHulls',
      boats.some(u => Units.isTransport(u)) && boats.some(u => u.kind === 'fireship') && boats.length === 2,
      tenders.map(u => u.kind).join(','));
    ck('theHullsRideOnWater',
      boats.every(u => S.map.terrain[MapGen.idx(u.x | 0, u.y | 0)] === T.WATER), '');
    // the anchorage's teeth: a hostile sail drifting into the arc is fired on
    // (pass = it acquired it, wounded it, or already sank it — the gun works)
    const fs = boats.find(u => u.kind === 'fireship');
    const foe = Units.spawn('fishboat', 'P', fs.x + 2, fs.y);
    run(6, () => fs.tUnit === foe.id || foe.hp < 35 || !S.units.includes(foe));
    ck('theFireshipGunsTheAnchorage',
      fs.tUnit === foe.id || foe.hp < 35 || !S.units.includes(foe),
      `tUnit=${fs.tUnit} foeHp=${foe.hp}`);
    const fi = S.units.indexOf(foe);
    if (fi >= 0) S.units.splice(fi, 1);
    fs.tUnit = 0;
    // the sortie: ready camp, due day — the longboat goes out
    camp.sortieDay = S.day;
    const before = G.campTenders(camp).length;
    G.seaSortie(camp);
    const tr = S.units.find(u => u.owner === 'R' && Units.isTransport(u));
    ck('theSortieLoadsTheBand', !!tr && tr.cargo.length >= 3 && tr.campId === 0 &&
      tr.task && tr.task.type === 'unload', tr ? `${tr.cargo.length} aboard` : 'no hull');
    ck('theSortiePartyIsReleased', tr.cargo.every(u => !u.campId), '');
    ck('andTheCampFeelsTheLoss', G.campTenders(camp).length < before,
      `${before} -> ${G.campTenders(camp).length}`);
    const t = run(120, () => S.units.some(u => u.owner === 'R' && !Units.isNaval(u) && !u.campId &&
      Math.hypot(u.x - (ptc.x + 1), u.y - (ptc.y + 1)) < 10));
    ck('theWarPartyCrossesTheWater', t < 120, `ashore near the town after ${t}s`);
  }

  // ---- 3. the Broken: the deserter's toll ----
  {
    const { camp } = setup('ttbrk', 'broken', {});
    G.manRaiderCamp(camp, 2);
    const rd = G.campTenders(camp)[0];
    const mk = (k, dx, dy) => Units.spawn(k, 'P', camp.x + dx, camp.y + dy);
    const d1 = mk('defender', 2, 1), d2 = mk('defender', 2, 2);
    const q0 = camp.quota;
    Units.damage(d1, 9999, rd.id);
    ck('theLastSoldierStandingDeserts', d2.owner === 'R' && d2.tribe === 'broken' && d2.campId === camp.id,
      `owner=${d2.owner} tribe=${d2.tribe}`);
    ck('andTheBandGrows', camp.quota === q0 + 1, `quota ${q0} -> ${camp.quota}`);
    // …and any banner the deserter marched under lets them go
    S.armies = { 1: [d2.id] };
    UI.pruneArmies();
    ck('theBannerLetsThemGo', !S.armies[1], JSON.stringify(S.armies));
    // never a chain: with two comrades left, nobody deserts (and the cooldown holds)
    const d3 = mk('defender', 2, 1), d4 = mk('defender', 2, 2), d5 = mk('defender', 3, 2);
    S.day += 3;
    Units.damage(d3, 9999, rd.id);
    ck('twoComradesHoldTheLine', d4.owner === 'P' && d5.owner === 'P', '');
    S.units.splice(S.units.indexOf(d4), 1); S.units.splice(S.units.indexOf(d5), 1);
  }

  // ---- 4. the Woadkin: the painting ----
  {
    const { camp } = setup('ttwoad', 'woad', {});
    G.manRaiderCamp(camp, 2);
    const rd = G.campTenders(camp)[0];
    const q0 = camp.quota, n0 = G.campTenders(camp).length;
    const v = Units.spawn('villager', 'P', camp.x + 2, camp.y + 1);
    Units.damage(v, 9999, rd.id);
    ck('aLoneVillagerIsTaken', camp.quota === q0 + 1 && G.campTenders(camp).length === n0 + 1,
      `quota ${q0}->${camp.quota}, band ${n0}->${G.campTenders(camp).length}`);
    // a guarded villager is only mourned, never taken
    S.day += 3;
    const guard = Units.spawn('defender', 'P', camp.x + 3, camp.y + 1);
    const v2 = Units.spawn('villager', 'P', camp.x + 2, camp.y + 1);
    const q1 = camp.quota;
    Units.damage(v2, 9999, rd.id);
    ck('aGuardedVillagerIsNotTaken', camp.quota === q1, '');
    S.units.splice(S.units.indexOf(guard), 1);
    // …and the taking is bounded: the band never grows far past its roll
    S.day += 100;
    for (let i = 0; i < 8; i++) {
      S.day += 3;
      const vx = Units.spawn('villager', 'P', camp.x + 2, camp.y + 1);
      Units.damage(vx, 9999, rd.id);
    }
    const RC = CFG.RAIDER_CAMPS || {};
    ck('theTakingIsBounded', camp.quota <= camp.quota0 + (RC.takeQuotaCap || 3),
      `quota ${camp.quota} vs roll ${camp.quota0}`);
  }

  // ---- 5. the Flintfolk: brute-blooded bands ----
  {
    const { camp } = setup('ttflint', 'flint', {});
    G.manRaiderCamp(camp, 40);
    const band = G.campTenders(camp);
    const brutes = band.filter(u => u.kind === 'brute').length;
    ck('theFlintfolkBreedBrutes', band.length >= 30 && brutes / band.length >= 0.45,
      `${brutes}/${band.length} brutes`);
  }

  // ---- 6. the Wolfskins: pack tactics ----
  {
    const { camp } = setup('ttwolf', 'wolf', {});
    G.manRaiderCamp(camp, 3);
    const band = G.campTenders(camp).filter(u => u.kind === 'raider' || u.kind === 'brute');
    const u0 = band[0];
    for (let i = 1; i < band.length; i++) { band[i].x = u0.x + 1; band[i].y = u0.y; }
    const packed = Units.effAtk(u0);
    for (let i = 1; i < band.length; i++) { band[i].x = u0.x + 8; band[i].y = u0.y + 8; }
    const alone = Units.effAtk(u0);
    ck('thePackStrikesHarder', band.length >= 3 && packed > alone * 1.3,
      `alone ${alone}, in the pack ${packed}`);
  }

  // ---- 7. it all rides in the save ----
  {
    const { camp } = setup('ttsave', 'sea', { ocean: true });
    G.manRaiderCamp(camp, 6);
    camp.sortieDay = 99;
    const json = G.saveJSON();
    G.loadJSON(json);
    const c2 = S.buildings.find(z => z.key === 'raidercamp');
    ck('theTraitsRideInTheSave',
      c2 && c2.tribe === 'sea' && c2.sortieDay === 99 && c2.quota0 === c2.quota &&
      S.units.some(u => u.owner === 'R' && Units.isNaval(u) && u.campId === c2.id),
      c2 ? `tribe=${c2.tribe} sortieDay=${c2.sortieDay}` : 'no camp');
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
const hard = errs.filter(e => !/supabase|fetch|TUNNEL|net::|429/.test(e));
if (hard.length) console.log('PAGE ERRORS:', hard.slice(0, 4));
await b.close();
if (out.fails.length || hard.length) { console.log('FAILURES: ' + (out.fails.join(', ') || 'pageerrors')); process.exit(1); }
console.log('ALL TRIBE-TRAIT CHECKS PASS');
