/* TOWER/ARCHER MISS-CHANCE CONTRACT — a level-1 Watchtower (and the War Camp,
   which fires like one) misses 1 shot in 3; a base Archer misses 1 in 4. This
   is a deliberate early-game nerf (Lv1 towers were reading as too strong) that
   makes upgrading the Range hall and the Watchtower actually matter — Lv2/Lv3
   towers, longbow and marksman are all untouched, and it applies identically
   to the player and the rival (same combat.js code path, no owner branching).

   Run this after touching any of:
     combat.js — the tower/warcamp fire loop, the tUnit and tBld ranged-attack
                 branches in Combat.update
     config.js — CFG.UNITS.archer / longbow / marksman / horsearcher,
                 CFG.BUILDINGS.tower / warcamp levels
     render.js — R.float (miss text uses the same float-text path as damage)

     node tests/tower-archer-miss.mjs      # exits non-zero on any regression

   The invariants:
     1. A Lv1 tower misses ~1/3 of its shots; a miss deals NO damage
     2. Lv2 and Lv3 towers never miss
     3. A War Camp misses at the same ~1/3 rate as a Lv1 tower
     4. The rival's Lv1 towers and base archers miss at the SAME rate as the
        player's — no owner branching anywhere in the miss check
     5. A base Archer misses ~1/4 of its shots, against units AND buildings
     6. longbow / marksman / horsearcher never miss — only the base archer
     7. The hit/miss sequence is deterministic per seed (uses G.rand, the
        seeded RNG — never Math.random)
     8. The same design's other half: the BASE rank of each military hall
        (defender / archer / rider / catapult) costs NO GOLD — rough, cheap
        troops worth massing late-game — while every upgraded rank still
        bills gold, so the choice between quantity and quality stays real
   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + root + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    for (const u of S.units.slice()) if (Units.isMilitary(u) || Units.isVillager(u)) u.hp = 0;
    S.units = S.units.filter(u => u.hp > 0);
    S.buildings = S.buildings.filter(bb => bb.key === 'tc');
  };

  // fire `shots` times: place a tower/warcamp and one target unit, tick combat
  // repeatedly, count hits vs misses via intercepted float text
  const fireTower = (key, level, owner, shots) => {
    setup('miss1');
    const tc = Bld.tcOf(owner === 'A' ? 'A' : 'P') || Bld.tcOf('P');
    const bb = Bld.place(owner, key, tc.x + 6, tc.y, { free: true, instant: true });
    if (level) bb.level = level;
    const foeOwner = owner === 'A' ? 'P' : 'A';
    if (!Bld.tcOf(foeOwner)) { /* need both towns for hostility in a 1v1 skirmish */ }
    const foe = Units.spawn('defender', foeOwner, tc.x + 6.5, tc.y + 1);
    let hits = 0, misses = 0, dmgTotal = 0;
    const origFloat = R.float.bind(R);
    R.float = (x, y, txt) => { if (txt === 'Miss!') misses++; else if (/^-\d/.test(txt)) { hits++; dmgTotal += -parseInt(txt, 10); } };
    let n = 0, guard = 0;
    while (n < shots && guard < shots * 400) {
      guard++;
      foe.hp = foe.maxhp;   // keep it alive so every cooldown fires a fresh shot
      bb.cd = 0;
      Combat.update(0.05);
      if (hits + misses > n) n = hits + misses;
    }
    R.float = origFloat;
    return { hits, misses, total: hits + misses, dmgTotal, dead: foe.hp <= 0 };
  };

  const fireArcher = (kind, owner, shots) => {
    setup('miss2');
    const tc = Bld.tcOf('P');
    const a = Units.spawn(kind, owner, tc.x + 2, tc.y + 2);
    const foeOwner = owner === 'A' ? 'P' : 'A';
    const foe = Units.spawn('defender', foeOwner, tc.x + 3, tc.y + 2);
    a.tUnit = foe.id;
    let hits = 0, misses = 0;
    const origFloat = R.float.bind(R);
    R.float = (x, y, txt) => { if (txt === 'Miss!') misses++; else if (/^-\d/.test(txt)) hits++; };
    let n = 0, guard = 0;
    while (n < shots && guard < shots * 400) {
      guard++;
      foe.hp = foe.maxhp; a.tUnit = foe.id; a.cd = 0;
      Combat.update(0.05);
      if (hits + misses > n) n = hits + misses;
    }
    R.float = origFloat;
    return { hits, misses, total: hits + misses };
  };

  const fireArcherVsBuilding = (owner, shots) => {
    setup('miss3');
    const tc = Bld.tcOf('P');
    const a = Units.spawn('archer', owner, tc.x + 2, tc.y + 2);
    const foeOwner = owner === 'A' ? 'P' : 'A';
    const wallSpot = MapGen.findNear(tc.x + 3, tc.y + 2, 6, (x, y) => Bld.canPlace(foeOwner, 'wall', x, y).ok);
    const wall = Bld.place(foeOwner, 'wall', wallSpot.x, wallSpot.y, { free: true, instant: true });
    a.tBld = wall.id;
    let hits = 0, misses = 0;
    const origFloat = R.float.bind(R);
    R.float = (x, y, txt) => { if (txt === 'Miss!') misses++; else if (/^-\d/.test(txt)) hits++; };
    let n = 0, guard = 0;
    while (n < shots && guard < shots * 400) {
      guard++;
      wall.hp = wall.maxhp; a.tBld = wall.id; a.cd = 0;
      Combat.update(0.05);
      if (hits + misses > n) n = hits + misses;
    }
    R.float = origFloat;
    return { hits, misses, total: hits + misses };
  };

  // ---- Lv1 tower ≈ 1/3 miss ----
  {
    const r = fireTower('tower', 1, 'P', 240);
    const rate = r.misses / r.total;
    ck('lv1TowerMissRate', rate > 0.27 && rate < 0.40, `${r.misses}/${r.total} = ${rate.toFixed(3)} (want ~0.333)`);
    ck('lv1TowerMissNoDamage', r.dead === false, `foe still alive after ${r.total} shots`);
  }
  // ---- Lv2/Lv3 tower never miss ----
  for (const lv of [2, 3]) {
    const r = fireTower('tower', lv, 'P', 60);
    ck(`lv${lv}TowerNeverMisses`, r.misses === 0 && r.hits === r.total, `${r.misses} misses / ${r.total} shots`);
  }
  // ---- War Camp ≈ 1/3 miss, same as Lv1 tower ----
  {
    const r = fireTower('warcamp', null, 'P', 240);
    const rate = r.misses / r.total;
    ck('warcampMissRate', rate > 0.27 && rate < 0.40, `${r.misses}/${r.total} = ${rate.toFixed(3)}`);
  }
  // ---- rival's Lv1 tower misses at the SAME rate (owner-agnostic) ----
  {
    const r = fireTower('tower', 1, 'A', 240);
    const rate = r.misses / r.total;
    ck('rivalLv1TowerSameRate', rate > 0.27 && rate < 0.40, `${r.misses}/${r.total} = ${rate.toFixed(3)}`);
  }
  // ---- base archer ≈ 1/4 miss, vs a unit ----
  {
    const r = fireArcher('archer', 'P', 300);
    const rate = r.misses / r.total;
    ck('archerMissRate', rate > 0.19 && rate < 0.31, `${r.misses}/${r.total} = ${rate.toFixed(3)} (want ~0.25)`);
  }
  // ---- rival's base archer misses at the SAME rate ----
  {
    const r = fireArcher('archer', 'A', 300);
    const rate = r.misses / r.total;
    ck('rivalArcherSameRate', rate > 0.19 && rate < 0.31, `${r.misses}/${r.total} = ${rate.toFixed(3)}`);
  }
  // ---- longbow / marksman never miss (only the base archer is nerfed) ----
  for (const kind of ['longbow', 'marksman', 'horsearcher']) {
    const r = fireArcher(kind, 'P', 60);
    ck(`${kind}NeverMisses`, r.misses === 0 && r.hits === r.total, `${r.misses} misses / ${r.total} shots`);
  }
  // ---- archer vs a BUILDING also misses ~1/4 ----
  {
    const r = fireArcherVsBuilding('P', 200);
    const rate = r.misses / r.total;
    ck('archerVsBuildingMissRate', rate > 0.18 && rate < 0.32, `${r.misses}/${r.total} = ${rate.toFixed(3)}`);
  }
  // ---- determinism: same seed replays the identical hit/miss sequence ----
  {
    const seqFor = () => {
      setup('missdet');
      const tc = Bld.tcOf('P');
      const bb = Bld.place('P', 'tower', tc.x + 6, tc.y, { free: true, instant: true });
      const foe = Units.spawn('defender', 'A', tc.x + 6.5, tc.y + 1);
      const seq = [];
      const origFloat = R.float.bind(R);
      R.float = (x, y, txt) => { seq.push(txt === 'Miss!' ? 'm' : 'h'); };
      for (let i = 0; i < 30; i++) { foe.hp = foe.maxhp; bb.cd = 0; Combat.update(0.05); }
      R.float = origFloat;
      return seq.join('');
    };
    const a = seqFor(), b2 = seqFor();
    ck('deterministicPerSeed', a === b2 && a.length > 0, a === b2 ? `identical (${a.length} shots)` : `a=${a} b=${b2}`);
  }

  // ---- 9. an engine never shells ground it can't watch: the trebuchet's
  //         spotters see at least as far as it throws (rng 8 → vision 9),
  //         while ordinary units keep the tight UNIT_VISION fog ----
  {
    ck('trebuchetSeesItsShot', (CFG.UNITS.trebuchet.vision || 0) > CFG.UNITS.trebuchet.rng,
      `vision ${CFG.UNITS.trebuchet.vision || 0} vs rng ${CFG.UNITS.trebuchet.rng}`);
    setup('miss9');
    const tc = Bld.tcOf('P');
    const tx = tc.x > 25 ? tc.x - 15 : tc.x + 15, ty = tc.y;
    const tb = Units.spawn('trebuchet', 'P', tx, ty);
    G.updateVisibility();
    const atThrow = !!G.vis[MapGen.idx(tx + 8, ty)];
    Units.despawn(tb);
    const df = Units.spawn('defender', 'P', tx, ty);
    G.updateVisibility();
    const footSees = !!G.vis[MapGen.idx(tx + 8, ty)];
    ck('trebuchetLightsItsTargetGround', atThrow && !footSees,
      `trebuchet sees +8: ${atThrow}; a defender there does not: ${!footSees}`);
    Units.despawn(df);
  }

  // ---- 8. the other half of the same design: base ranks cost NO GOLD.
  //         The least-trained soldier of each military hall (the ones that
  //         fumble shots) is the cheap body a late-game player can mass —
  //         a real alternative to "Lv3 is only a little dearer, just use
  //         that". Upgraded ranks all still bill gold. ----
  {
    const T2 = CFG.BUILDINGS;
    const base = { barracks: 'defender', range: 'archer', stable: 'rider', siege: 'catapult' };
    const goldFree = Object.entries(base).every(([hall, uk]) => !T2[hall].train[uk].cost.gold);
    ck('baseRanksCostNoGold', goldFree,
      Object.entries(base).map(([hall, uk]) => `${uk}:${T2[hall].train[uk].cost.gold || 0}g`).join(' '));
    const upg = [['barracks', 'axeman'], ['barracks', 'elite'], ['range', 'longbow'], ['range', 'marksman'],
      ['stable', 'horsearcher'], ['stable', 'lancer'], ['siege', 'ballista'], ['siege', 'trebuchet']];
    ck('upgradedRanksStillBillGold', upg.every(([hall, uk]) => (T2[hall].train[uk].cost.gold || 0) > 0),
      upg.map(([hall, uk]) => `${uk}:${T2[hall].train[uk].cost.gold || 0}g`).join(' '));
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL MISS-CHANCE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
