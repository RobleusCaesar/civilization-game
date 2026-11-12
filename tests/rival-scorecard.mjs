/* RIVAL-SCORECARD CONTRACT — the chief plays every landform, and the same
   plain questions are asked of each game.

   tests/ai-coverage.mjs asks whether the chief KNOWS about everything in the
   config. This asks whether it can PLAY: one whole game on every face in
   MapGen.VARIANTS (the table is read from the game, so a landform added
   there is played here with no edit), driven headlessly by
   tools/ai-harness.mjs against its scripted player, and judged on ground
   truth the harness measures itself — never on the chief's own account.

   The gates are deliberately UNIVERSAL: they hold on any map anyone could
   add, so a new landform is measured against them the day it lands.

     1. THE GAME RUNS: no failed run, no fault caught, no page error
     2. THE HALL STANDS: the rival is never gone from a game still running
        (it once razed its own Town Center — tests/rival-geo.mjs)
     3. THE TOWN IS NEVER SHUT IN BY ITS OWN WORKS for more than a few days
     4. NOBODY IS LEFT STANDING: trapped and stuck soldier-days stay small
     5. THE TOWN GROWS: villagers, and somebody under arms, by the last day
     6. WHERE THE SEA IS THE ONLY ROAD, A YARD STANDS in good time and a hull
        is laid (a second pass: the islands, with the halls on different
        land masses)
     7. EVERYTHING DECLARED IS REPORTED: what AI.KNOWS lists and no game here
        used is printed (information, not a gate — a short meadow game trains
        no bombard)

   It is seeded end to end (the world's seed, the page's Math.random, a
   virtual clock), so a red check is a change in the chief, not the weather.
   The day tick's cost is PRINTED, never gated: milliseconds belong to the
   machine (CLAUDE.md, the relative-gate rule).

       node tests/rival-scorecard.mjs      # exits non-zero on any failed gate
       node tools/ai-harness.mjs --help    # the instrument itself */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.env.CF_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const { runMatrix } = await import(join(root, 'tools', 'ai-harness.mjs'));

const DAYS = 120;
const GATE = { sealed: 4, corked: 8, trapped: 90, stuck: 60, vill: 5, dockBy: 110 };
const lanes = Math.max(1, Math.min(3, (await import('node:os')).default.cpus().length - 1));

const land = await runMatrix({ days: DAYS, seeds: 1, worlds: 'all', modes: 'moderate', styles: 'passive', sizes: 'medium', lanes, quiet: true, label: 'scorecard' });
const sea = await runMatrix({ days: DAYS, seeds: 1, worlds: 'islands', modes: 'moderate', styles: 'turtle', sizes: 'medium', geo: 'split', lanes, quiet: true, label: 'scorecard-sea' });

const res = {}, fails = [];
const ck = (name, ok, info) => { res[name] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(name); };
const runs = land.runs.concat(sea.runs), okRuns = runs.filter(r => r && !r.failed && r.world);
const tag = r => r.world.landform + ':' + r.world.variant + '/' + r.world.style + '#' + r.world.seed;
const worst = (rs, f) => rs.map(r => [f(r), tag(r)]).sort((a, b) => b[0] - a[0])[0];
const over = (rs, f, lim) => rs.filter(r => f(r) > lim).map(r => tag(r) + '=' + f(r));

ck('everyLandformIsPlayed', land.runs.length >= land.meta.tables.worlds.length && sea.runs.length >= 1,
  land.runs.length + ' land games over ' + land.meta.tables.worlds.length + ' faces, ' + sea.runs.length + ' sea games');
const faults = runs.filter(r => !r || r.failed || (r.errors && (r.errors.safeTotal || (r.errors.page || []).length)) || (r.nodeErrors || []).length);
ck('theGameRuns', !faults.length, faults.length ? faults.map(r => r && r.world ? tag(r) + ' ' + JSON.stringify(r.errors.safe || r.errors.page).slice(0, 120) : 'a run failed').join('; ') : okRuns.length + ' games, no fault');
const gone = okRuns.filter(r => r.outcome.state === 'running' && !(r.growth.final && r.growth.final.hall > 0));
ck('theHallStands', !gone.length, gone.map(tag).join(', ') || 'no game still running has lost the rival\'s hall');
{
  const s = over(okRuns, r => r.trapped.sealedDays, GATE.sealed), c = over(okRuns, r => r.trapped.corkedDays, GATE.corked);
  ck('theTownIsNeverShutInByItsOwnWorks', !s.length && !c.length,
    (s.concat(c).join(', ') || 'worst sealed ' + worst(okRuns, r => r.trapped.sealedDays).join(' d on ') + ', corked ' + worst(okRuns, r => r.trapped.corkedDays).join(' d on ')));
}
{
  const t = over(okRuns, r => r.trapped.trappedUnitDays, GATE.trapped), k = over(okRuns, r => r.trapped.stuckUnitDays, GATE.stuck);
  ck('nobodyIsLeftStanding', !t.length && !k.length,
    (t.concat(k).join(', ') || 'worst trapped ' + worst(okRuns, r => r.trapped.trappedUnitDays).join(' unit-days on ') + ', stuck ' + worst(okRuns, r => r.trapped.stuckUnitDays).join(' on ')));
}
{
  // a game that ended early (somebody won) is not asked how big the town got
  const full = okRuns.filter(r => r.outcome.state === 'running' && r.world.style === 'passive');
  const small = full.filter(r => r.growth.villPeak < GATE.vill).map(r => tag(r) + ' peak ' + r.growth.villPeak);
  const unarmed = full.filter(r => !(r.growth.soldierPeak > 0)).map(tag);
  ck('theTownGrows', !small.length && !unarmed.length, small.concat(unarmed.map(t => t + ' never armed')).join(', ') ||
    full.length + ' games: fewest villagers at peak ' + Math.min(...full.map(r => r.growth.villPeak)) + ', every chief under arms');
}
{
  const split = okRuns.filter(r => r.geo && r.geo.sameLandmass === false && r.geo.seaRoute);
  const noYard = split.filter(r => !(r.sea.firstDockDoneDay != null && r.sea.firstDockDoneDay <= GATE.dockBy)).map(r => tag(r) + ' dock ' + r.sea.firstDockDoneDay);
  const noHull = split.filter(r => !((r.sea.hulls.transport || 0) + (r.sea.hulls.fireship || 0) + (r.sea.hulls.bombard || 0) > 0)).map(r => tag(r) + ' no war hull');
  ck('whereTheSeaIsTheOnlyRoadAYardStands', split.length >= 1 && !noYard.length && !noHull.length,
    noYard.concat(noHull).join(', ') || split.length + ' sea-only games: latest yard day ' + Math.max(...split.map(r => r.sea.firstDockDoneDay)));
}
const un = { buildings: new Set(), units: new Set() };
for (const m of [land, sea]) if (m.summary.unused) { for (const k of m.summary.unused.buildings) un.buildings.add(k); for (const k of m.summary.unused.units) un.units.add(k); }
const used = (m, kind) => m.summary.unused ? null : null;
ck('everythingDeclaredIsReported', !!(land.summary.unused && sea.summary.unused),
  'never used in these ' + okRuns.length + ' games — buildings: ' + ([...un.buildings].filter(k => land.summary.unused.buildings.includes(k) && sea.summary.unused.buildings.includes(k)).join(', ') || '—') +
  '; units: ' + ([...un.units].filter(k => land.summary.unused.units.includes(k) && sea.summary.unused.units.includes(k)).join(', ') || '—'));

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ✓ ' : '  ✗ ') + k + ' — ' + v.replace(/^(PASS|FAIL)( — )?/, ''));
const p95 = Math.max(...okRuns.map(r => r.cost.aiDaily.p95)), mean = okRuns.reduce((n, r) => n + r.cost.aiDaily.mean, 0) / okRuns.length;
console.log('\n  (not gated) the chief\'s day tick on this machine: mean ' + mean.toFixed(1) + ' ms, worst p95 ' + p95.toFixed(1) + ' ms; ' + (land.meta.wallSecs + sea.meta.wallSecs) + ' s of wall clock');
if (fails.length) { console.log('\n' + fails.length + ' FAILURE(S) — ' + fails.join(', ')); process.exit(1); }
console.log('\nall rival-scorecard checks pass');
