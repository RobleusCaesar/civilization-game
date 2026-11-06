/* EVERY BAND IS ITS OWN FIGHT (CFG.BARB_BANDS, G.composeBand / spawnBarb /
   bandHurt / bandLoss / campBeasts, Combat.maybeWave / raiderSeek — operator,
   build 156: "mix up the experiences when fighting the different barbarian
   tribes… the characters that are clearly larger, make them harder to kill,
   and hit harder, but slower… different tiers of speed, damage and strength…
   different odds that each is generated… one group is more likely to attack
   and run, and another is more likely to keep throwing people at you… the
   woodland guys… wolves that fight along side them… the guys with the deer
   antlers have a bear").

     TIERS        light (quick, fragile), mid, heavy (the brute: tougher, a
                  heavier blow, a slower walk and swing), and the peoples'
                  beasts — each worth about what it costs.
     BOUGHT       a band is a strength budget spent by its people's odds: the
                  same strength comes as many small or few big; every people
                  draws several make-ups and more than one style; heavies and
                  bears wait for the third wave.
     ITS OWN BEASTS  wolves with the Wolfskins, a bear with the Flintfolk, and
                  nobody else; never a band of beasts alone; a beast fights for
                  its band and never chews a wall.
     STYLES       harry: a hurt fighter breaks off and runs, soft prey first;
                  press: every fall calls a fresh one up, a few to a band.
     HASHED       composing a band draws no G.rand.
     SAVED        S.barbBands rides the save; an older save loads with none.

     node tests/barb-bands.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  G.newGame('bands1', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  const BB = CFG.BARB_BANDS, T = BB.TIERS;
  const tc = Bld.tcOf('P');
  // open ground: a 5×3 of walkable land with nothing built on it
  const open = MapGen.findNear(tc.x, tc.y, 40, (x, y) => {
    if (Math.hypot(x - tc.x, y - tc.y) < 5) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++)
      if (!MapGen.onBoard(x + dx, y + dy) || !Path.passable(x + dx, y + dy, 'R') || Bld.at(x + dx, y + dy)) return false;
    return true;
  });
  const fx = open ? open.x : tc.x + 10, fy = open ? open.y : tc.y + 10;
  const clean = () => { S.units = S.units.filter(u => u.owner !== 'R'); };

  // ---- 1. the tiers ----
  {
    const s = {};
    for (const r of ['light', 'mid', 'heavy', 'wolf', 'bear']) {
      const u = G.spawnBarb(r, fx, fy, { tribe: r === 'wolf' ? 'wolf' : 'flint' });
      const cd = CFG.ATTACK_COOLDOWN * (CFG.UNITS[u.kind].cdMult || 1);
      s[r] = { hp: u.maxhp, atk: u.atk, speed: u.speed, cd, kind: u.kind, tier: u.tier, beast: !!u.beast };
    }
    clean();
    ck('aLightOneIsQuickAndFragile', s.light.hp < s.mid.hp && s.light.speed > s.mid.speed && s.light.atk < s.mid.atk,
      JSON.stringify([s.light, s.mid]));
    ck('aBruteIsTougherHitsHarderButSlower',
      s.heavy.kind === 'brute' && s.heavy.hp >= 2.5 * s.mid.hp && s.heavy.atk >= 2 * s.mid.atk &&
      s.heavy.speed < s.mid.speed && s.heavy.cd > s.mid.cd, JSON.stringify(s.heavy));
    // worth about what it costs, by the square law a melee is fought by: a
    // budget buys budget/cost of them, and a side's strength is its numbers
    // squared × hp × blows a second — so hp × dps / cost² is the fair figure
    const worth = r => s[r].hp * s[r].atk / s[r].cd / (T[r].cost * T[r].cost);
    const ratios = ['light', 'heavy', 'wolf', 'bear'].map(r => +(worth(r) / worth('mid')).toFixed(2));
    ck('eachIsWorthAboutWhatItCosts', ratios.every(x => x > 0.55 && x < 1.8), ratios.join(' / '));
    ck('theBeastsAreTheirOwnKind', s.wolf.kind === 'wolf' && s.bear.kind === 'bear' && s.wolf.beast && s.bear.beast, '');
  }

  // ---- 2. bought from a budget, by the people's odds ----
  {
    const tribes = CFG.TRIBES.map(t => t.key);
    const report = {}; let costOk = true, capOk = true, beastOk = true, aloneOk = true;
    const seenStyles = {}, seenKinds = {}, early = { heavy: 0, bear: 0 };
    const rng0 = S.rngState;
    for (const t of tribes) {
      const mixes = new Set(); seenStyles[t] = new Set(); seenKinds[t] = {};
      for (let i = 0; i < 200; i++) {
        const band = G.composeBand(t, 6, 6, G.barbRand('t:' + t + ':' + i), 6);
        const cost = band.roles.reduce((a, r) => a + T[r].cost, 0);
        if (cost > 6.01) costOk = false;
        if (band.roles.length < 1 || band.roles.length > 6) capOk = false;
        for (const r of band.roles) {
          seenKinds[t][r] = (seenKinds[t][r] || 0) + 1;
          if (T[r].beast && r !== G.barbPeople(t).beast) beastOk = false;
        }
        if (band.roles.every(r => T[r].beast)) aloneOk = false;
        mixes.add(band.roles.slice().sort().join('+'));
        seenStyles[t].add(band.style);
        const e = G.composeBand(t, 6, 6, G.barbRand('e:' + t + ':' + i), 1);
        for (const r of e.roles) if (r === 'heavy' || r === 'bear') early[r]++;
      }
      report[t] = mixes.size;
    }
    ck('theBudgetIsNeverOverspent', costOk && capOk, '');
    ck('everyPeopleMeetsYouInManyMakeUps', Object.values(report).every(n => n >= 5), JSON.stringify(report));
    ck('andFightsInMoreThanOneStyle', tribes.every(t => seenStyles[t].size >= 2),
      tribes.map(t => t + ':' + [...seenStyles[t]].join('/')).join(' '));
    ck('theWolfskinsRunWithWolves', (seenKinds.wolf.wolf || 0) > 50, JSON.stringify(seenKinds.wolf));
    ck('theFlintfolkBringABear', (seenKinds.flint.bear || 0) > 20, JSON.stringify(seenKinds.flint));
    ck('andNobodyElseKeepsBeasts', beastOk && ['broken', 'woad', 'sea'].every(t => !seenKinds[t].wolf && !seenKinds[t].bear), '');
    ck('neverABandOfBeastsAlone', aloneOk, '');
    ck('theOpeningMeetsNoBruteNorBear', early.heavy === 0 && early.bear === 0, JSON.stringify(early));
    // the same strength as many small or few big
    let many = false, few = false;
    for (const t of tribes) for (let i = 0; i < 200; i++) {
      const band = G.composeBand(t, 6, 6, G.barbRand('s:' + t + ':' + i), 6);
      if (band.roles.length >= 5) many = true;
      if (band.roles.length === 2 && band.roles.every(r => r === 'heavy')) few = true;
    }
    ck('theSameStrengthComesAsManySmallOrFewBig', many && few, `five or more: ${many}, two brutes: ${few}`);
    ck('composingDrawsNoRunRng', S.rngState === rng0, '');
  }

  // ---- 3. a real wave carries its tiers, style and band ----
  {
    clean(); S.barbBands = {};
    let stamped = true, waves = 0, notes = [];
    const logs = []; const fn = G.foeNote; G.foeNote = (m) => { logs.push(m); };
    for (let i = 0; i < 12; i++) {
      S.wave.next = S.day; const before = S.units.length; Combat.maybeWave();
      const fresh = S.units.slice(before).filter(u => u.owner === 'R' && !Units.isNaval(u));
      for (const tr of S.units) if (tr.owner === 'R' && tr.cargo) for (const c of tr.cargo) fresh.push(c);
      if (fresh.length) waves++;
      for (const u of fresh) if (!u.tier || !u.style || !u.bandId) stamped = false;
      clean();
    }
    G.foeNote = fn;
    ck('aWaveCarriesItsTiersStyleAndBand', waves >= 6 && stamped, `${waves} waves`);
    ck('andItsSightingSaysWhatIsComing', logs.some(m => /brute|raider|wol|bear/.test(m)), logs.slice(0, 2).join(' | '));
  }

  // ---- 4. hit and run ----
  {
    clean();
    const u = G.spawnBarb('mid', fx, fy, { tribe: 'woad' }); u.hostileTo = 'P'; u.style = 'harry';
    Units.damage(u, Math.floor(u.maxhp * 0.3));
    const stillFighting = !u.fled;
    Units.damage(u, Math.floor(u.maxhp * 0.35));
    ck('aHurtHarrierBreaksOffAndRuns', stillFighting && (u.fled || !S.units.includes(u)) && !u.tUnit,
      `hp ${u.hp}/${u.maxhp}, fled ${u.fled}`);
    // soft prey first: a villager and a soldier at the same range
    clean();
    const h = G.spawnBarb('light', fx, fy, { tribe: 'woad' }); h.hostileTo = 'P'; h.style = 'harry';
    const vil = Units.spawn('villager', 'P', fx + 2, fy); const sol = Units.spawn('defender', 'P', fx - 2, fy);
    vil.x = h.x + 2; vil.y = h.y; sol.x = h.x - 1.8; sol.y = h.y;
    Combat.raiderSeek(h);
    ck('aHarrierGoesForTheHandsFirst', h.tUnit === vil.id, `marked ${h.tUnit} (villager ${vil.id}, soldier ${sol.id})`);
    S.units = S.units.filter(u => u !== vil && u !== sol); clean();
  }

  // ---- 5. it keeps coming ----
  {
    clean(); S.barbBands = { wT: { style: 'press', left: 2, x: fx, y: fy, tribe: 'broken', disp: 'P', scale: 1, day: S.day } };
    const a = G.spawnBarb('mid', fx, fy, { tribe: 'broken' }); a.hostileTo = 'P'; a.style = 'press'; a.bandId = 'wT';
    const n0 = S.units.filter(u => u.owner === 'R').length;
    Units.damage(a, 9999);
    const up1 = S.units.filter(u => u.owner === 'R' && u.bandId === 'wT');
    for (const u of up1.slice()) Units.damage(u, 9999);
    const up2 = S.units.filter(u => u.owner === 'R' && u.bandId === 'wT');
    for (const u of up2.slice()) Units.damage(u, 9999);
    const up3 = S.units.filter(u => u.owner === 'R' && u.bandId === 'wT');
    ck('aPressingBandCallsTheNextOneUp', n0 === 1 && up1.length === 1 && up1[0].tier === 'light' && up2.length === 1,
      `after falls: ${up1.length}, ${up2.length}`);
    ck('butOnlyAFewToABand', up3.length === 0 && S.barbBands.wT.left === 0, `left ${S.barbBands.wT.left}`);
    clean();
  }

  // ---- 6. a beast fights for its band ----
  {
    clean();
    const w = G.spawnBarb('wolf', fx, fy, { tribe: 'wolf' }); w.hostileTo = 'P'; w.bandId = 'wB';
    const r = G.spawnBarb('mid', fx + 1, fy, { tribe: 'wolf' }); r.hostileTo = 'P'; r.bandId = 'wB';
    const vil = Units.spawn('villager', 'P', fx, fy);
    ck('aWarWolfIsTheBandsAlly', Combat.hostileUnits(w, vil) && !Combat.hostileUnits(w, r), '');
    vil.x = w.x + 20; vil.y = w.y + 20;   // nobody in reach: it keeps at its people's heels
    Combat.raiderSeek(w);
    ck('andNeverChewsAWall', !w.tBld && S.units.includes(w), `tBld ${w.tBld}`);
    S.units = S.units.filter(u => u !== vil); clean();
  }

  // ---- 7. the camps keep their beasts, over and above the hands ----
  {
    const camps = Bld.list('R').filter(c => c.key === 'raidercamp');
    const c = camps[0];
    if (c) {
      const t0 = c.tribe;
      c.tribe = 'wolf'; G.campBeasts(c);
      const wolves = G.campTenders(c).filter(u => u.beast && u.kind === 'wolf').length;
      const hands = G.campTenders(c).filter(u => !u.beast).length;
      const q0 = c.quota; c.quota = hands; c.reman = 99;
      const before = G.campTenders(c).length; G.tickRaiderCamps();
      const after = G.campTenders(c).length;
      ck('aWolfskinFireKeepsItsWolves', wolves === 2, `${wolves} wolves (moderate)`);
      ck('andTheyAreNoHand', before === after, `tenders ${before} → ${after} with the hands at quota`);
      for (const u of G.campTenders(c)) if (u.beast) S.units.splice(S.units.indexOf(u), 1);
      c.tribe = 'flint'; G.campBeasts(c);
      ck('aFlintfolkFireKeepsABear', G.campTenders(c).filter(u => u.kind === 'bear').length === 1, '');
      for (const u of G.campTenders(c)) if (u.beast) S.units.splice(S.units.indexOf(u), 1);
      c.tribe = 'woad'; G.campBeasts(c);
      ck('andTheOthersKeepNone', !G.campTenders(c).some(u => u.beast), '');
      c.tribe = t0; c.quota = q0; c.reman = 0;
    } else ck('aWolfskinFireKeepsItsWolves', false, 'no camp on the map');
  }

  // ---- 8. it rides the save ----
  {
    S.barbBands = { w9: { style: 'press', left: 1, x: 3, y: 4, tribe: 'sea', disp: 'ALL', scale: 1.2, day: S.day } };
    const json = G.saveJSON ? G.saveJSON() : JSON.stringify(S);
    G.loadJSON(json); Screens._demo = false; S.paused = true;
    ck('aSaveCarriesThePressingBands', S.barbBands && S.barbBands.w9 && S.barbBands.w9.left === 1, '');
    const old = JSON.parse(json); delete old.barbBands;
    G.loadJSON(JSON.stringify(old)); Screens._demo = false; S.paused = true;
    ck('anOlderSaveLoadsWithNone', S.barbBands && typeof S.barbBands === 'object' && !Object.keys(S.barbBands).length, '');
  }
  return { res, fails };
});
const bad = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (bad.length) { out.res.noErrors = 'FAIL — ' + bad.slice(0, 3).join(' | '); out.fails.push('noErrors'); }
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BAND CHECKS PASS');
await b.close();
process.exit(out.fails.length ? 1 : 0);
