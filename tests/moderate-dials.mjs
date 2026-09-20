/* THE RETENTION PASS — BALANCE (Phase 4). What a scripted-player harness
   measured on Moderate (8–16 seeds per style, 200 days, medium maps):
   a town with no spears by day ~50 lost its hall by ~day 60 in 75–83% of
   games; one holding five defenders and a tower still lost 50–70%, ground
   down by raids every 8–10 days after its gatherers were cut down in the
   field before the first raid arrived; 14 of 30 rivals sat at ZERO food for
   20+ of their first 100 days with 250+ gold banked and never fielded a
   soldier (the "nothing ever happens" game); and on Calm a reconnaissance
   column launched at peace stabbed the first villager it met and started
   the war the mode promises not to. This file pins the dials and the
   rules that answer those measurements.

   1. THE MODERATE DIALS (CFG.MODES.moderate): aiEarly 0.75, aiRaidCdMult
      1.35, aiVulnDay 25, aiHarass 12 with aiHarassLead 0, waveFirst 52 —
      and Hard keeps its edge (no cadence multiplier, the old day-12 opening).
   2. THE DIALS ARE READ WHERE THEY BITE (source pins on ai.js): the raid
      cooldown is multiplied by aiRaidCdMult, the vulnerability floor reads
      aiVulnDay, the harassment start reads aiHarassLead.
   3. A STARVING CHIEF SPENDS ITS GOLD (AI.autoConvert): food at zero with a
      250-gold purse and the market buys food the same day; a fed town keeps
      the 250 floor exactly as before.
   4. THE SPARE HANDS SCALE WITH THE TOWN (AI.workTheLand): a town of three
      keeps one hand home, a starving town none — measured as a party going
      out where the flat rule sent nobody.
   5. THE WONDER IS PRICED FOR A REAL ECONOMY: 6,000 food / 6,000 wood /
      4,000 stone / 1,500 gold — stone, the finite one, the smallest bill —
      and the rival's bill (aiCostFrac) is unchanged in absolute wood.
   6. THE HIGHLANDS DOORSTEP IS MEASURED, not clamped — the seat-clearance
      idea was withdrawn for breaking a start-resource guarantee (see there).

   Run after touching: CFG.MODES, the raid launch block / harassment block
   in AI.daily, AI.autoConvert, AI.workTheLand, CFG.BUILDINGS.wonder,
   CFG.WONDER.aiCostFrac, or massif() in map.js.

     node tests/moderate-dials.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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

const aiSrc = readFileSync(join(root, 'js/ai.js'), 'utf8');
const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const fresh = (seed, mode, size) => {
    G.newGame(seed, mode, size || 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
  };

  // ---- 1. the dials ----
  {
    const m = CFG.MODES.moderate, h = CFG.MODES.hard;
    ck('moderateFieldsALighterEarlyArmy', m.aiEarly === 0.75, String(m.aiEarly));
    ck('moderatePacesItsRaids', m.aiRaidCdMult === 1.35 && !(h.aiRaidCdMult > 1), 'moderate ' + m.aiRaidCdMult + ' hard ' + h.aiRaidCdMult);
    ck('moderateWaitsForDay25ToExploitAThinTown', m.aiVulnDay === 25 && !(h.aiVulnDay > 12), 'moderate ' + m.aiVulnDay + ' hard ' + h.aiVulnDay);
    ck('moderateHarriesLaterAndRarer', m.aiHarass === 12 && m.aiHarassLead === 0 && h.aiHarass === 5 && h.aiHarassLead == null,
      'moderate ' + m.aiHarass + '/' + m.aiHarassLead + ' hard ' + h.aiHarass + '/' + h.aiHarassLead);
    ck('theFirstWaveClearsTheFirstRaidsWindow', m.waveFirst === 52 && m.aiRaidDay === 50, 'wave ' + m.waveFirst + ' raid floor ' + m.aiRaidDay);
  }

  // ---- 3. a starving chief spends its gold ----
  {
    fresh('md-famine', 'moderate');
    const ai = S.ai, C = CFG.AI_CONVERT;
    ai.goal = null; ai.convert = null;
    ai.res = { food: 0, wood: 200, stone: 100, gold: 270 };   // the survey's median corpse
    AI.autoConvert();
    ck('famineBuysFoodWithThePurse', !!ai.convert && ai.convert.need === 'food' && ai.convert.pay === 'gold' && ai.convert.amt > 0,
      JSON.stringify(ai.convert));
    ck('andLeavesTheTownAPurseNotAHoard', ai.res.gold >= 20 && ai.res.gold < 270, String(ai.res.gold));
    // a FED town keeps the floor: 270 gold against a 250 keep buys nothing
    ai.goal = null; ai.convert = null;
    ai.res = { food: 300, wood: 100, stone: 100, gold: 270 };
    AI.autoConvert();
    ck('aFedTownKeepsItsFloor', !ai.convert || ai.convert.need !== 'wood' || ai.res.gold >= C.keep - 1,
      JSON.stringify(ai.convert) + ' gold ' + ai.res.gold);
  }

  // ---- 4. the spare hands scale with the town ----
  {
    fresh('md-spare', 'moderate');
    const tc = Bld.tcOf('A');
    // exactly three idle hands beside the hall and a stand of trees in reach
    for (const u of S.units.filter(u => u.owner === 'A')) Units.despawn(u);
    for (let i = 0; i < 3; i++) Units.spawn('villager', 'A', tc.x - 1, tc.y + 2 + i);
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0;
    let planted = 0;
    for (let dy = -6; dy <= 6 && planted < 4; dy++) for (let dx = -6; dx <= 6 && planted < 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (Math.hypot(dx, dy) < 4 || !MapGen.onBoard(x, y) || S.map.terrain[MapGen.idx(x, y)] !== T.GRASS || Bld.at(x, y)) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.FOREST; S.map.resAmount[MapGen.idx(x, y)] = 100; planted++;
    }
    Bld._block = null; G.updateVisibility();
    S.ai.res = { food: 300, wood: 0, stone: 300, gold: 100 };
    S.ai.read = S.ai.read || {}; S.ai.read.underThreat = false;
    AI.workTheLand(S.ai.read);
    const out3 = S.units.filter(u => u.owner === 'A' && Units.isVillager(u) && u.task && u.task.type === 'gather').length;
    ck('aTownOfThreeSendsAHandOut', planted >= 2 && out3 >= 1, planted + ' stands, ' + out3 + ' gathering (the flat rule kept all three home)');
    ck('theRuleIsInTheCode', /hands\.length <= 3 \? 1 : this\.WORK_SPARE/.test(AI.workTheLand.toString()), '');
  }

  // ---- 5. the wonder is priced for a real economy ----
  {
    const c = CFG.BUILDINGS.wonder.levels[0].cost;
    ck('theWonderIsPricedForARealEconomy', c.food === 6000 && c.wood === 6000 && c.stone === 4000 && c.gold === 1500, JSON.stringify(c));
    ck('stoneIsTheSmallestBill', c.stone < c.wood && c.stone < c.food, '');
    fresh('md-wonder', 'calm');
    const eff = Bld.effCost('A', 'wonder');
    ck('theRivalsAbsoluteBillDidNotMove', eff.wood === 1800, 'rival wood bill ' + eff.wood + ' (0.12 × 15000 was 1800)');
  }

  // ---- 6. a seat keeps its doorstep ----
  {
    let worst = 1e9, seeds = 0, withMtn = 0;
    for (const size of ['medium', 'large']) {
      CFG.W = CFG.H = CFG.SIZES[size];
      for (let s = 3000; s < 3040; s++) {
        const g = MapGen.generate(String(s)); seeds++;
        let any = false;
        for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
          if (g.terrain[y * CFG.W + x] !== T.MOUNTAIN) continue;
          any = true;
          for (const st of [g.spawns.player, g.spawns.ai]) worst = Math.min(worst, Math.hypot(x - st.x, y - st.y));
        }
        if (any) withMtn++;
      }
    }
    /* THE DOORSTEP RULE WAS WITHDRAWN, and this is its headstone. Highlands
       has won 0 of 39 logged games and the sims found no economic cause, so
       the hypothesis was that what Highlands does to a HUMAN is put a massif
       at the door — 14 mountain tiles within ten of the seat on average, and
       the extruded art covers the town north of every ridge. Keeping massifs
       8 tiles clear of both halls tested that idea. It also tipped
       tests/worked-ground.mjs's everySeatCanWorkEveryResource: one of its six
       boards came up a resource short IN-SUITE (standalone all six pass, so
       the interaction runs through earlier sections' state, not through the
       clamp alone). An unmeasured hypothesis that breaks a guarantee the game
       genuinely depends on — a seat that cannot work a resource cannot ever
       raise that station — is not a trade worth making, and tuning the radius
       until the check went quiet would have hidden an interaction nobody had
       explained. So it is out, and Highlands is a question for the dashboard's
       landform split rather than for a number picked here.
       What survives is the MEASUREMENT: how much rock really does sit on a
       Highlands doorstep, so the next attempt starts from a fact. */
    ck('theHighlandsDoorstepIsMeasured', withMtn >= 20 && worst >= 0,
      withMtn + ' of ' + seeds + ' worlds have mountain; nearest tile to a hall ' +
      worst.toFixed(1) + ' — recorded, not clamped');
  }
  // ---- 7. THE LEAKS THE BOTS COULD NEVER HAVE SHOWN US ----
  /* A scripted player's win rate is a blunt instrument and these four cost
     the player advantage in ways no aggregate would name. Each is the same
     fault: a rule deciding "is that other tribe my enemy" by hand instead of
     asking Combat.hostile, so it answered YES during a truce nobody broke. */
  {
    // 7a. the gathering dial is the PLAYER's, as the production dial already was
    fresh('lk-gather', 'hard');
    const pv = Units.spawn('villager', 'P', Bld.tcOf('P').x + 2, Bld.tcOf('P').y + 3);
    const av = Units.spawn('villager', 'A', Bld.tcOf('A').x + 2, Bld.tcOf('A').y + 3);
    const gm = CFG.MODES.hard;
    ck('theGatherTaxIsThePlayersAlone',
      Math.abs(Units.gatherMode(pv) - gm.gather) < 1e-9 && Math.abs(Units.gatherMode(av) - 1) < 1e-9,
      'player ' + Units.gatherMode(pv) + ' (mode gather ' + gm.gather + '), rival ' + Units.gatherMode(av) +
      ' — the rival used to pay the player\'s Hard tax on every log it cut');
    ck('andEveryRateAsksTheOneHelper',
      !/modeCfg\(\)\.gather|mode\.gather/.test(Units.workReport.toString()) &&
      (Units.gatherMode.toString().indexOf("owner === 'P'") > 0), '');

    // 7b. CHAOS asks the funnel for whose buildings it may burn
    fresh('lk-chaos', 'calm');
    ck('chaosBurnsNobodyDuringATruce', S.peace === true && !Combat.hostile('P', 'A'), 'peace ' + S.peace);
    const src = Combat.chaosSeek.toString();
    ck('andItsTargetOwnersComeFromTheFunnel',
      /hostile\(u\.owner, o\)/.test(src) && !/u\.owner === 'P' \? 'A' : 'P'/.test(src),
      'the A/P flip could never name a barbarian camp either');
    // the rival's works must survive a chaos-armed party standing next to them
    const foeB = Bld.list('A').find(b => Bld.attackable(b) && Bld.done(b));
    if (foeB) {
      const sol = Units.spawn('defender', 'P', Bld.cx(foeB) + 1, Bld.cy(foeB) + 1);
      sol.strat = 'chaos'; sol.task = null; sol.tBld = 0; sol.tUnit = 0;
      Combat.chaosSeek(sol);
      const got = S.buildings.find(x => x.id === sol.tBld);
      /* Standing ON the rival's doorstep at peace it takes a BARBARIAN CAMP
         twelve tiles away instead — both halves of the fix in one reading.
         It may never touch 'A' while the truce holds, and it may now see
         'R' at all, which the old 'A'/'P' flip could not name however close
         the camp stood. "Touches nothing" would be the wrong assertion: the
         wilds signed no truce. */
      ck('soAChaosPartyAtPeaceLeavesTheRivalAlone', S.peace === true && (!got || got.owner !== 'A'),
        got ? 'took ' + got.owner + '/' + got.key + ' at ' +
          Math.hypot(Bld.cx(got) - sol.x, Bld.cy(got) - sol.y).toFixed(1) +
          ' tiles, with a rival building at 1.4' : 'took nothing');
      ck('andItCanNameABarbarianCampNow', !!got && got.owner === 'R',
        got ? got.owner + '/' + got.key : 'nothing in reach');
    }

    // 7c. the rival's townsfolk do not scurry from a visitor
    fresh('lk-scurry', 'calm');
    ck('theScurryReadIsGated',
      /Combat\.hostile\('A', 'P'\)/.test(Units.update.toString()),
      'a player soldier riding past at peace used to send the rival indoors');

    // 7d. no guns, no kill zone, during a truce
    fresh('lk-guns', 'calm');
    const atc = Bld.tcOf('A');
    const arch = Units.spawn('archer', 'P', atc.x + 4, atc.y + 4);
    S.ai.seen = S.ai.seen || {};
    G.freeVis = true; G.updateVisibility();
    ck('noGunsAreSeenDuringATruce', AI.seenGuns().length === 0,
      'a peaceful archer used to swing the whole build plan to a counter-battery');
    G.breakPeace();
    ck('andTheyAreSeenAgainTheMomentWarStarts', !S.peace && Combat.hostile('A', 'P'),
      'the gate is the truce, not the archer');
    if (arch) Units.despawn(arch);
  }

  // ---- 8. EVERY MODE DECLARES ITS OWN DIALS ----
  /* A dial absent from a mode reads the code's default, and a code default is
     one mode's number wearing no label: `aiVulnDay || 12` handed CALM Hard's
     floor, and `aiRampDays || 12` was read from a mode object that never
     defined it at all, so the gentler Moderate ramp its own comment described
     had never once run. Anything the code reads, every mode declares. */
  {
    const M = CFG.MODES, modes = ['calm', 'moderate', 'hard'];
    const must = ['aiVulnDay', 'aiRampDays', 'bandCap', 'aiHarass'];
    const missing = [];
    for (const k of must) for (const m of modes) if (M[m][k] == null) missing.push(m + '.' + k);
    ck('noModeInheritsAnothersNumber', missing.length === 0, missing.join(', ') || 'all declared');
    ck('theRampIsRealNow', M.moderate.aiRampDays > M.hard.aiRampDays &&
      /m\.aiRampDays/.test(AI.armyWant.toString()),
      'moderate ' + M.moderate.aiRampDays + ' vs hard ' + M.hard.aiRampDays);
    ck('andCalmNoLongerInheritsHardsVulnerabilityFloor', M.calm.aiVulnDay > M.moderate.aiVulnDay,
      'calm ' + M.calm.aiVulnDay + ', moderate ' + M.moderate.aiVulnDay + ', hard ' + M.hard.aiVulnDay);
  }

  return { res, fails };
});

// ---- 2. the dials are read where they bite (source) ----
const src = {};
src.raidCd = /P\.raidCd - 4\)\) \* \(m\.aiRaidCdMult \|\| 1\)/.test(aiSrc);
src.vuln = /\(read\.foeVuln \|\| read\.strikeWindow\) \? \(m\.aiVulnDay \|\| 12\)/.test(aiSrc);
src.harass = /m\.aiHarassLead != null \? m\.aiHarassLead : 16/.test(aiSrc);
src.huntPeace = /if \(!S\.peace && !read\.anchor && ai\.raidCd <= 0/.test(aiSrc);
for (const [k, ok] of Object.entries(src)) out.res['theDialIsReadWhereItBites:' + k] = ok ? 'PASS' : 'FAIL';
for (const [k, ok] of Object.entries(src)) if (!ok) out.fails.push(k);

let bad = out.fails.length;
for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? '  ✅' : '  ❌'), k, '—', v);
const real = errors.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (real.length) { bad++; console.log('  ❌ page errors:', real.join(' | ')); }
await b.close();
if (bad) { console.log(`\n${bad} FAILURE(S) — the Moderate dials contract is broken`); process.exit(1); }
console.log('\nAll Moderate-dials contract checks passed.');
