/* MORTALITY CONTRACT — every so often, a villager simply dies.

   Life was short and full of surprises. Mechanically it exists so that a
   station you staffed on day forty and forgot about will, sooner or later,
   want a hand put back on it — the post is left EMPTY, and re-staffing it is
   the player's problem.

   The rules:

     THE CLOCK    One death every `deathEvery` days, a band per difficulty:
                  Calm waits longest, Hard shortest. S.nextDeath rides in the
                  save; a pre-mortality save rolls a fresh gap on its next
                  tick rather than firing immediately.

     NEVER THE    It will not take the last villager. A random roll must not be
     LAST         able to end a run the player is still playing.

     PLAYER-SIDE  The rival is untouched: it hires its workforce back on a
                  timer of its own, so mortality there would be invisible
                  bookkeeping that only re-tunes its economy.

     THE CAUSE    Keyed to what they were DOING (CFG.DEATHS) — the station they
                  were stationed at, the resource they were gathering, whether
                  they were building or fishing. A woodcutter goes the way a
                  woodcutter goes.

     THE NEWS     Plain G.log at EVERY difficulty — never G.foeNote, which is
                  difficulty-gated enemy intel. A death in the village is the
                  player's own news.

     THE FALL     R.deathSheet cuts 4-8 frames out of that villager's own
                  sprite: a stagger, the tip about their heels, flat on the
                  ground with a puff of dust, and gone. R.deaths is
                  render-side only and never reaches a save.

   Run this after touching any of:
     config.js — CFG.MORTALITY, CFG.DEATHS, MODES[*].deathEvery
     game.js — rollDeathGap / deathCause / tickMortality / dayTick /
               newGame + loadJSON (S.nextDeath)
     render.js — deathSheet / startDeath / drawDeaths

     node tests/mortality.mjs      # exits non-zero on any regression */
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

  // ---- 1. the lines: enough of them, and tied to the work ----
  {
    const D = CFG.DEATHS;
    ck('aGoodManyWaysToGo',
      D.general.length >= 10 && D.general.length <= 20, D.general.length + ' general causes');
    const JOBS = ['farm', 'lumber', 'quarry', 'mine', 'lodge',
      'gatherWood', 'gatherStone', 'gatherFood', 'build', 'fish'];
    const thin = JOBS.filter(k => !D[k] || D[k].length < 3 || D[k].length > 4);
    ck('threeOrFourPerJob', thin.length === 0,
      thin.length ? thin.join(',') : JOBS.length + ' kinds of work, 3-4 causes each');
    const all = Object.keys(D).reduce((a, k) => a.concat(D[k]), []);
    ck('noTwoTheSame', new Set(all).size === all.length, all.length + ' lines, all distinct');
    ck('theyReadLikeSentences',
      all.every(s => /[.!]$/.test(s) && s.length > 20 && s === s.trim()), '');
    // the station keys line up with real buildings, so a plot always has its own
    ck('everyWorkerPlotHasItsOwn',
      Object.keys(CFG.BUILDINGS).filter(k => CFG.BUILDINGS[k].needsWorker)
        .every(k => D[k] && D[k].length), '');
  }

  // ---- 2. the clock: slower on Calm, faster on Hard ----
  {
    const band = {}, span = {};
    for (const m of ['calm', 'moderate', 'hard']) {
      G.newGame('mo-' + m, m, 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      let lo = 1e9, hi = 0, sum = 0;
      for (let i = 0; i < 500; i++) { const g = G.rollDeathGap(); lo = Math.min(lo, g); hi = Math.max(hi, g); sum += g; }
      band[m] = sum / 500; span[m] = [lo, hi];
    }
    ck('calmWaitsLongest', band.calm > band.moderate && band.moderate > band.hard,
      'calm ' + band.calm.toFixed(0) + 'd · moderate ' + band.moderate.toFixed(0) +
      'd · hard ' + band.hard.toFixed(0) + 'd between deaths');
    ck('theModerateBandIsTheStatedOne',
      span.moderate[0] >= 25 && span.moderate[1] <= 40, JSON.stringify(span.moderate));
    ck('everyModeNamesItsOwn',
      ['calm', 'moderate', 'hard'].every(m => Array.isArray(CFG.MODES[m].deathEvery)), '');
  }

  // ---- 3. a death: the right cause, an empty post, news at any difficulty ----
  {
    // HARD on purpose: the news must not be gated the way foeNote is
    G.newGame('mo-run', 'hard', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P'); tc.level = 3;
    for (let y = tc.y - 3; y <= tc.y + 9; y++) for (let x = tc.x - 3; x <= tc.x + 11; x++) {
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    S.map.terrain[MapGen.idx(tc.x + 7, tc.y + 4)] = T.GOLDORE;
    Bld._block = null;
    const plots = [];
    for (const [k, dx, dy] of [['farm', 2, 4], ['lumber', 4, 4], ['quarry', 6, 4], ['mine', 7, 4], ['lodge', 2, 6]]) {
      const bb = Bld.place('P', k, tc.x + dx, tc.y + dy, { free: true, noAutoAssign: true });
      if (bb) { Bld.finish(bb); plots.push(bb); }
    }
    S.units = [];
    for (const bb of plots) { const v = Units.spawn('villager', 'P', bb.x, bb.y); v.task = { type: 'work', id: bb.id }; }
    for (let i = 0; i < 40; i++) Units.update(0.1);
    const staffed0 = plots.filter(bb => Bld.workersAssigned(bb) > 0).length;
    ck('everyPlotStartsStaffed', staffed0 === plots.length, staffed0 + '/' + plots.length);

    // force the clock and take one
    const before = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length;
    const said = [];
    const ol = G.log.bind(G);
    G.log = (m, w, ms) => { said.push(m); return ol(m, w, ms); };
    R.deaths.length = 0;
    S.nextDeath = S.day;
    const cause = G.tickMortality();
    G.log = ol;
    const after = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length;
    ck('oneVillagerGoes', after === before - 1, before + ' → ' + after);
    ck('andItsPostIsEmpty',
      plots.filter(bb => Bld.workersAssigned(bb) > 0).length === staffed0 - 1,
      'the station is left for the player to re-staff');
    ck('theCauseFitsTheWork',
      !!cause && CFG.DEATHS[cause.bucket] && CFG.DEATHS[cause.bucket].includes(cause.line) &&
      cause.bucket !== 'general',
      cause ? cause.bucket + ': ' + cause.line : 'no cause');
    ck('theNewsIsToldOnHard',
      said.some(m => /☠/.test(m) && m.indexOf(cause.line) >= 0),
      said.filter(m => /☠/.test(m))[0] || 'nothing said');
    ck('andTheyKeelOverWhereTheyStood', R.deaths.length === 1, R.deaths.length + ' fall(s) playing');
    ck('theClockRewinds', S.nextDeath > S.day, 'next on day ' + S.nextDeath);
  }

  // ---- 4. never the last villager, and never the rival's ----
  {
    while (S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length > 1) {
      const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
      S.units.splice(S.units.indexOf(v), 1);
    }
    S.nextDeath = S.day;
    const got = G.tickMortality();
    ck('neverTheLastHand',
      !got && S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length === 1,
      'a random roll cannot end a run the player is still playing');
    ck('andItTriesAgainSoon', S.nextDeath > S.day && S.nextDeath <= S.day + 3, 'day ' + S.nextDeath);
    // give the rival a workforce and run a long stretch — it must be untouched
    const atc = Bld.tcOf('A');
    for (let i = 0; i < 6; i++) Units.spawn('villager', 'A', atc.x + (i % 3), atc.y + 2 + ((i / 3) | 0));
    const rival0 = S.units.filter(u => u.owner === 'A' && Units.isVillager(u)).length;
    for (let d = 0; d < 120; d++) { S.nextDeath = S.day; G.tickMortality(); G.day = S.day++; }
    const rival1 = S.units.filter(u => u.owner === 'A' && Units.isVillager(u)).length;
    ck('theRivalNeverLosesOneToThis', rival1 >= rival0, rival0 + ' → ' + rival1);
  }

  // ---- 5. the fall: 4-8 frames out of their own sprite, and never saved ----
  {
    const base = Sprites.villager.blue.idle[0];
    const sheet = R.deathSheet(base);
    const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
    ck('fourToEightFrames', sheet.length >= 4 && sheet.length <= 8, sheet.length + ' frames');
    ck('drawnThroughTheOrdinaryUnitBox',
      sheet.every(c => c.width === base.width && c.height === base.height),
      'same canvas as any unit sprite, so it draws at the same offset');
    ck('itStartsOnItsFeet', px(sheet[0]) >= px(base) * 0.85, '');
    ck('itGoesOver',
      sheet.every((c, i) => i === 0 || c.toDataURL() !== sheet[i - 1].toDataURL()), '');
    ck('andTheBodyIsGoneByTheEnd', px(sheet[sheet.length - 1]) < px(sheet[0]) * 0.55,
      'they vanish at the end of the sheet');
    ck('everyTunicAndBothSexesFallForFree',
      R.deathSheet(Sprites.villagerF.blue.idle[0]).length === sheet.length &&
      R.deathSheet(base) === sheet,
      'cut from the unit\'s OWN sprite, cached per artwork');
    ck('theFallIsNeverSaved',
      S.deaths === undefined && !/"deaths"/.test(G.saveJSON()),
      'render-side only, same rule as R.collapses');
  }

  // ---- 6. the clock rides in the save; a legacy save does not fire at once ----
  {
    G.newGame('mo-save', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const when = S.nextDeath;
    ck('theClockIsSetAtTheStart', when > S.day, 'first death due on day ' + when);
    const json = G.saveJSON();
    G.loadJSON(json);
    ck('andRidesInTheSave', S.nextDeath === when, S.nextDeath + ' vs ' + when);
    const legacy = JSON.parse(json); delete legacy.nextDeath;
    G.loadJSON(JSON.stringify(legacy));
    const n0 = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length;
    G.dayTick();
    ck('aLegacySaveDoesNotBuryAnyoneOnLoad',
      S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length === n0 &&
      S.nextDeath > S.day, 'it rolls a fresh gap instead, due day ' + S.nextDeath);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL MORTALITY CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
