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
   6. A SEAT KEEPS ITS DOORSTEP (MapGen.MTN_SEAT_R): no mountain tile within
      MTN_SEAT_R of either hall, on every seed of every size that rolls one.

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
    ck('noMassifRisesAtTheDoorstep', withMtn >= 20 && worst >= MapGen.MTN_SEAT_R,
      withMtn + ' of ' + seeds + ' worlds have mountain; nearest tile to a hall ' + worst.toFixed(1) + ' (floor ' + MapGen.MTN_SEAT_R + ')');
    ck('theRadiusIsOneDeclaration', MapGen.MTN_SEAT_R >= 8, String(MapGen.MTN_SEAT_R));
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
