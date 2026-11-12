/* AI-COVERAGE CONTRACT — the rival keeps up with the game.

   The rival's brain is one long file written against the game as it stood
   on the day each rule was written. Content moves faster than that: a
   building, a unit, a difficulty or a landform lands in the config, and
   nothing tells the chief. The audit that started this file found a chief
   that never built a dock on an island map and four hand-kept training
   tables (which hall trains what, which rank is basic, which is top) that a
   new unit would silently fall out of. So the question "does the chief know
   about everything in the game?" is asked HERE, of the config itself, on
   every push:

     1. EVERY BUILDING AND EVERY UNIT IS ACCOUNTED FOR. AI.KNOWS lists each
        key of CFG.BUILDINGS and CFG.UNITS once — with the routine the chief
        comes by it through, or with `skip` and a reason. A key the config
        has and the ledger lacks fails; so does a ledger line for something
        the config no longer has, and a `by` that names no real routine or
        whose routines never mention the key.
     2. THE TRAINING LINES ARE READ OFF THE CONFIG (AI.lines): every unit a
        hall trains has a hall, every war hall a basic and a top rank; a
        unit added to a hall's `train` list is in the line with no edit.
     3. A PERSONA ONLY ASKS FOR WHAT EXISTS: every key in an opening order
        is a building the chief builds, every kind in an army mix is a unit
        some hall trains, and every origin card leans on a real persona.
     4. EVERY DIFFICULTY CARRIES THE DIALS THE CHIEF READS — a mode added
        without `aiMend` or `aiArmyCap` is caught here, not as a NaN army.
     5. EVERY TERRAIN IS READ, AND THE SEA IS THE PATHFINDER'S SEA: the map
        read labels water by Path.floats, so a new kind of water is sea to
        the chief the day it is sea to a boat.
     6. EVERY LANDFORM IS PLAYED: for each face in MapGen.VARIANTS a world is
        founded, the chief reads it (AI.geo) and thinks for three days with
        no fault — a landform added to the table is in this loop with no
        edit to this file.
     7. THE NEW STATE RIDES IN THE SAVE.

   When this goes red after you added something: give it a line in AI.KNOWS
   (js/ai.js) — and if the chief should really use it, teach the routine you
   name there. Then run the scorecard to see whether it ever does:

       node tools/ai-harness.mjs --quick          # "declared but never used"
       node tests/rival-scorecard.mjs             # every landform, 120 days

       node tests/ai-coverage.mjs      # exits non-zero on any gap */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = process.env.CF_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.route('**/*', r => { const t = r.request().resourceType(); return (t === 'image' || t === 'media' || t === 'font') ? r.abort() : r.continue(); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof Screens !== 'undefined' && typeof S !== 'undefined' && !!S && typeof AI !== 'undefined', null, { timeout: 60000 });
await p.waitForTimeout(600);

// the dials the chief READS, straight off the source (a dial read nowhere is no dial)
const dials = new Set();
for (const f of ['ai.js', 'combat.js', 'units.js', 'game.js', 'buildings.js']) {
  const src = readFileSync(join(root, 'js', f), 'utf8');
  for (const m of src.matchAll(/\b(?:m|mode|modeCfg\(\))\.(ai[A-Z][A-Za-z]*)/g)) dials.add(m[1]);
}

const out = await p.evaluate((dialList) => {
  const res = {}; const fails = [];
  const ck = (name, ok, info) => { res[name] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(name); };
  const section = (names, fn) => { try { fn(); } catch (e) { for (const n of names) if (!(n in res)) ck(n, false, 'threw: ' + String(e && e.message || e).slice(0, 120)); } };
  // the tick caches wrap the AI's own methods: a harness may not have, so read sources off the object as it stands
  const src = name => (typeof AI[name] === 'function' ? String(AI[name]) : '');
  const K = AI.KNOWS || { buildings: {}, units: {}, optionalDials: [] };

  /* ---- 1. the ledger ---- */
  section(['everyBuildingIsAccountedFor', 'everyUnitIsAccountedFor', 'noLedgerLineIsStale', 'everySkipSaysWhy',
    'everyRoutineNamedIsReal', 'andNamesWhatItBuilds'], () => {
    const missB = Object.keys(CFG.BUILDINGS).filter(k => !K.buildings[k]);
    const missU = Object.keys(CFG.UNITS).filter(k => !K.units[k]);
    ck('everyBuildingIsAccountedFor', !!AI.KNOWS && !missB.length, missB.length ? 'no line in AI.KNOWS for: ' + missB.join(', ') : Object.keys(CFG.BUILDINGS).length + ' buildings');
    ck('everyUnitIsAccountedFor', !!AI.KNOWS && !missU.length, missU.length ? 'no line in AI.KNOWS for: ' + missU.join(', ') : Object.keys(CFG.UNITS).length + ' units');
    const stale = Object.keys(K.buildings).filter(k => !CFG.BUILDINGS[k]).concat(Object.keys(K.units).filter(k => !CFG.UNITS[k]));
    ck('noLedgerLineIsStale', !stale.length, stale.join(', ') || 'none');
    const all = Object.entries(K.buildings).map(([k, v]) => ['building ' + k, k, v]).concat(Object.entries(K.units).map(([k, v]) => ['unit ' + k, k, v]));
    const noWhy = all.filter(([, , v]) => !v.by && !(typeof v.skip === 'string' && v.skip.length >= 12)).map(e => e[0]);
    ck('everySkipSaysWhy', !noWhy.length, noWhy.join(', ') || all.filter(e => e[2].skip).length + ' skipped, each with a reason');
    const unreal = [], silent = [];
    const inOrder = k => Object.values(AI.PERSONAS).some(P => (P.order || []).includes(k));
    const inMix = k => Object.values(AI.PERSONAS).some(P => (P.mix || []).some(m => m[0] === k));
    const L = AI.lines ? AI.lines() : { adv: {}, top: {}, basic: {} };
    const inLine = k => Object.values(L.adv).includes(k) || Object.values(L.basic).includes(k);
    for (const [label, k, v] of all) {
      if (!v.by) continue;
      for (const f of v.by) if (typeof AI[f] !== 'function') unreal.push(label + ' → ' + f);
      const named = v.by.some(f => src(f).includes("'" + k + "'")) ||
        (v.by.includes('openingBook') && inOrder(k)) || (v.by.includes('trainArmy') && (inMix(k) || inLine(k)));
      if (!named) silent.push(label);
    }
    ck('everyRoutineNamedIsReal', !unreal.length, unreal.join(', ') || 'all found on AI');
    ck('andNamesWhatItBuilds', !silent.length, silent.length ? 'named by none of their routines, orders or mixes: ' + silent.join(', ') : 'each key is named by a routine, an order or a mix');
  });

  /* ---- 2. the training lines ---- */
  section(['everyTrainedUnitHasItsHall', 'everyWarHallHasItsRanks', 'aNewUnitJoinsTheLineUnasked', 'andEveryArmedUnitIsASoldierToTheGame', 'andTheChiefBuildsEveryHallItTrainsFrom'], () => {
    const L = AI.lines();
    const lost = [];
    for (const bk in CFG.BUILDINGS) for (const uk in (CFG.BUILDINGS[bk].train || {})) if (L.hallOf[uk] !== bk) lost.push(uk);
    ck('everyTrainedUnitHasItsHall', !lost.length, lost.join(', ') || Object.keys(L.hallOf).length + ' units, each with its hall');
    const bad = L.war.filter(h => !L.basic[h] || !L.top[h]);
    ck('everyWarHallHasItsRanks', L.war.length >= 1 && !bad.length, 'war halls ' + L.war.join(', ') + (bad.length ? ' — no ranks: ' + bad.join(', ') : ''));
    // a unit added to a hall's list: derived, with nothing edited in ai.js
    const save = CFG.BUILDINGS, clone = JSON.parse(JSON.stringify(save));
    clone.barracks.train.testpike = { cost: { food: 10 }, time: 1, reqLevel: 4 };
    const saveU = CFG.UNITS.testpike; CFG.UNITS.testpike = Object.assign({}, CFG.UNITS.defender);
    // (the one hand list a new soldier still needs is Units.isMilitary — check 2b holds it to the config)
    const mil0 = Units.isMilitary; Units.isMilitary = function (u) { return u.kind === 'testpike' || mil0.call(this, u); };
    let ok = false, info = '';
    try { CFG.BUILDINGS = clone; const L2 = AI.lines(); ok = L2.hallOf.testpike === 'barracks' && L2.top.barracks === 'testpike' && L2.adv[L2.basic.barracks] === 'testpike'; info = 'hall ' + L2.hallOf.testpike + ', top ' + L2.top.barracks + ', drilled up from ' + L2.basic.barracks; }
    finally { CFG.BUILDINGS = save; Units.isMilitary = mil0; if (saveU === undefined) delete CFG.UNITS.testpike; AI._linesC = null; }
    ck('aNewUnitJoinsTheLineUnasked', ok, info);
    /* 2b. A SOLDIER IN THE CONFIG IS A SOLDIER TO THE GAME. Units.isMilitary is
       a hand list of kinds; a fighting unit added to a hall's train list and
       left off it is no soldier to the chief (not counted in its army, never
       given a stance, never marched) nor to the player's panel. Anything a
       hall trains that carries a weapon — and is not a villager, a sapper or
       a working hull — must be on it. */
    const unlisted = [];
    for (const uk in L.hallOf) {
      const d = CFG.UNITS[uk]; if (!d) continue;
      const armed = (d.atk || 0) > 0 || (d.bldAtk || 0) > 0;
      if (!armed || uk === 'villager' || uk === 'sapper' || uk === 'fishboat' || uk === 'transport') continue;
      if (!Units.isMilitary({ kind: uk })) unlisted.push(uk);
    }
    ck('andEveryArmedUnitIsASoldierToTheGame', !unlisted.length, unlisted.length ? 'trained, armed, and not in Units.isMilitary: ' + unlisted.join(', ') : 'every armed unit a hall trains is military');
    const noHall = Object.keys(L.hallOf).filter(uk => K.units[uk] && K.units[uk].by && !(K.buildings[L.hallOf[uk]] && K.buildings[L.hallOf[uk]].by));
    ck('andTheChiefBuildsEveryHallItTrainsFrom', !noHall.length, noHall.join(', ') || 'every hall is one the chief raises');
  });

  /* ---- 3. personas and cards ---- */
  section(['everyOpeningOrderIsBuildable', 'everyArmyMixIsTrainable', 'everyPersonaCarriesItsDials', 'everyCardLeansOnAPersona'], () => {
    const badO = [], badM = [], badD = [];
    const NEED = ['name', 'order', 'mix', 'raidPower', 'raidDayAdd', 'raidShare', 'raidCd', 'dockTC', 'boats', 'shipDiv', 'tcDays'];
    const L = AI.lines();
    for (const [pk, P] of Object.entries(AI.PERSONAS)) {
      for (const k of P.order || []) if (!CFG.BUILDINGS[k] || !(K.buildings[k] && K.buildings[k].by)) badO.push(pk + ':' + k);
      let w = 0;
      for (const [k, wt] of P.mix || []) { w += wt; if (!CFG.UNITS[k] || !L.hallOf[k]) badM.push(pk + ':' + k); }
      if (Math.abs(w - 1) > 0.011) badM.push(pk + ' weights sum to ' + w.toFixed(2));
      for (const d of NEED) if (P[d] == null) badD.push(pk + '.' + d);
    }
    ck('everyOpeningOrderIsBuildable', !badO.length, badO.join(', ') || Object.keys(AI.PERSONAS).length + ' personas');
    ck('everyArmyMixIsTrainable', !badM.length, badM.join(', ') || 'every kind has a hall, every mix sums to 1');
    ck('everyPersonaCarriesItsDials', !badD.length, badD.join(', ') || NEED.length + ' dials each');
    const defs = (window.Cards && Cards.DEFS) || {};
    const badC = Object.keys(defs).filter(k => !AI.PERSONAS[defs[k].lean]);
    ck('everyCardLeansOnAPersona', Object.keys(defs).length > 0 && !badC.length, badC.join(', ') || Object.keys(defs).length + ' cards');
  });

  /* ---- 4. the difficulty dials ---- */
  section(['everyModeCarriesTheDialsTheChiefReads', 'noOptionalDialIsMadeUp'], () => {
    const opt = new Set(K.optionalDials || []), gaps = [];
    for (const d of dialList) { if (opt.has(d)) continue; for (const mk in CFG.MODES) if (CFG.MODES[mk][d] === undefined) gaps.push(mk + '.' + d); }
    ck('everyModeCarriesTheDialsTheChiefReads', dialList.length >= 10 && !gaps.length, gaps.join(', ') || dialList.length + ' dials read, ' + Object.keys(CFG.MODES).length + ' modes');
    const ghost = [...opt].filter(d => !dialList.includes(d));
    ck('noOptionalDialIsMadeUp', !ghost.length, ghost.join(', ') || 'every optional dial is one the code reads');
  });

  /* ---- 5. terrain ---- */
  section(['everyTerrainIsOneOfThreeThings', 'theSeaIsThePathfindersSea', 'andANewWaterIsSeaToTheChief'], () => {
    const names = Object.keys(T), both = names.filter(n => Path.floats(T[n]) && !Path.blocksLand(T[n]));
    ck('everyTerrainIsOneOfThreeThings', typeof Path.floats === 'function' && !both.length && names.some(n => Path.floats(T[n])),
      names.map(n => n + ':' + (Path.floats(T[n]) ? 'water' : Path.blocksLand(T[n]) ? 'block' : 'open')).join(' '));
    const g = String(AI._geoRead);
    ck('theSeaIsThePathfindersSea', g.includes('Path.floats') && !/T\.WATER|T\.MOAT/.test(g.slice(0, g.indexOf('homeMass'))), 'the labelling in AI._geoRead asks Path.floats');
    // a world of two meadows parted by a strip of a terrain the chief has never heard of
    G.newGame('aicov-terr', 'moderate', 'medium'); S.paused = true;
    const W = CFG.W, H = CFG.H, tA = Bld.tcOf('A'), tP = Bld.tcOf('P');
    S.units.length = 0; S.buildings.length = 0; S.buildings.push(tA, tP);
    for (let i = 0; i < W * H; i++) S.map.terrain[i] = T.GRASS;
    const NEWT = 99, mid = (W / 2) | 0;
    for (let y = 0; y < H; y++) for (let x = mid - 1; x <= mid + 1; x++) S.map.terrain[y * W + x] = NEWT;
    tA.x = 6; tA.y = (H / 2) | 0; tP.x = W - 9; tP.y = (H / 2) | 0; Bld._block = null;
    const f0 = Path.floats;
    let before, after;
    try {
      before = AI._geoRead(tA);
      Path.floats = t => t === NEWT || f0.call(Path, t);
      after = AI._geoRead(tA);
    } finally { Path.floats = f0; }
    const mA = (g2) => g2.lab[tA.y * W + tA.x], mP = (g2) => g2.lab[tP.y * W + tP.x], strip = (g2) => g2.lab[tA.y * W + mid];
    ck('andANewWaterIsSeaToTheChief', strip(before) > 0 && strip(after) < 0 && mA(after) !== mP(after),
      'declared water: strip label ' + strip(before) + ' → ' + strip(after) + ', the halls on masses ' + mA(after) + ' / ' + mP(after));
  });

  /* ---- 6. every landform is played ---- */
  section(['everyLandformIsFound', 'theChiefReadsEveryLandform', 'andThinksThereWithoutAFault'], () => {
    const faces = [];
    for (const lf in MapGen.VARIANTS) for (const v of MapGen.VARIANTS[lf]) faces.push(lf + ':' + v);
    const seedOf = {};
    for (let s = 1000; s < 4000 && Object.keys(seedOf).length < faces.length; s++) {
      const pk = MapGen.generate(String(s), 'moderate', true), k = pk.landform + ':' + pk.variant;
      if (!(k in seedOf)) seedOf[k] = String(s);
    }
    const lost = faces.filter(f => !seedOf[f]);
    ck('everyLandformIsFound', faces.length >= 4 && !lost.length, lost.length ? 'no seed in 3,000 for: ' + lost.join(', ') : faces.length + ' faces');
    const blind = [], faults = [];
    const safe0 = G._safe; let caught = [];
    G._safe = function (fn, tag) { try { return fn(); } catch (e) { caught.push(tag + ': ' + String(e && e.message || e).slice(0, 80)); } };
    try {
      for (const f of faces) {
        if (!seedOf[f]) continue;
        G.newGame(seedOf[f], 'moderate', 'medium'); S.paused = false; S.played = false;
        const tc = Bld.tcOf('A');
        let g = null; AI._tick = {}; try { g = AI.geo(); } finally { AI._tick = null; }
        if (!g || !(g.homeMass > 0) || !(g.homeN > 20) || !(g.seaNeed >= 0 && g.seaNeed <= 1) || !g.walkMass || !g.walkMass[g.homeMass]) blind.push(f);
        caught = [];
        for (let i = 0; i < 3 * 200 && !S.over; i++) G.simStep(CFG.DAY_MS / 1000 / 200);
        if (caught.length || !Bld.tcOf('A') || !S.ai.read) faults.push(f + (caught.length ? ' [' + caught[0] + ']' : ' [no hall or no read]'));
      }
    } finally { G._safe = safe0; }
    ck('theChiefReadsEveryLandform', !blind.length, blind.join(', ') || 'a home mass, walkable ground and a sea need on each');
    ck('andThinksThereWithoutAFault', !faults.length, faults.join('; ') || 'three days on each, no fault');
  });

  /* ---- 7. the save ---- */
  section(['theNewStateRidesInTheSave'], () => {
    G.newGame('aicov-save', 'moderate', 'medium'); S.played = true;
    S.ai.seaParty = { hull: 0, ids: [7], day: 3, mass: 2, x: 5, y: 5 }; S.ai.deadAt = { '4,4': { n: 2, day: 9, wd: [8, 9] } };
    const u = S.units.find(o => o.owner === 'A'); if (u) { u.marauder = true; u.shun = 5; u.shunTo = 9.5; }
    const data = G.saveJSON();
    G.loadJSON(data);
    const u2 = u && S.units.find(o => o.id === u.id);
    const old = JSON.parse(data); delete old.ai.seaParty; delete old.ai.deadAt; delete old.ai.seaOnly; if (old.ai.memory) delete old.ai.memory.seaTried;
    let oldOk = true; try { G.loadJSON(JSON.stringify(old)); AI._tick = {}; try { AI.geo(); AI.maraud(); } finally { AI._tick = null; } } catch (e) { oldOk = false; }
    ck('theNewStateRidesInTheSave', !!(u2 && u2.marauder && u2.shun === 5) && oldOk && S.ai.seaParty === null,
      'a marked unit keeps its marks; a save without the new fields loads and thinks');
  });

  return { res, fails };
}, [...dials].sort());

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ✓ ' : '  ✗ ') + k + ' — ' + v.replace(/^(PASS|FAIL)( — )?/, ''));
const real = errs.filter(e => !/supabase|fetch|net::/i.test(e));
if (real.length) console.log('page errors:', real.slice(0, 3));
await b.close();
if (out.fails.length || real.length) { console.log('\n' + (out.fails.length + (real.length ? 1 : 0)) + ' FAILURE(S) — ' + out.fails.join(', ')); process.exit(1); }
console.log('\nall ai-coverage checks pass');
