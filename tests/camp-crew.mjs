/* CAMP-CREW CONTRACT — a station's own hands raise its upgrade, and go back
   to work afterwards.

   Lumber camps, quarries and hunters' lodges hold TWO workers. Production is
   paused for the whole upgrade anyway (`dailyProduction` skips a building that
   is upgrading), so the crew are the obvious builders — yet one used to be
   sent to build while the other stood beside it doing nothing at all. Both now
   down tools, and because every builder on site ticks the works, two hands
   raise it in half the time.

   Coming back is the subtler half. With two builders only ONE of them crosses
   the finish line; the other finds the works already done and would simply be
   let go. So `Bld.finishUpgrade` → `Bld.resumeCrew` returns every hand that
   downed tools, up to the station's cap — which of them got there first must
   not decide who keeps their job.

   Run this after touching any of:
     buildings.js — upgrade / finishUpgrade / resumeCrew / upgradeTime,
                    hasWorker / workersAssigned / workersActive / maxWorkers,
                    dailyProduction
     units.js — the 'build' task branch (construction, upgrade and repair all
                share it), assignBuild
     config.js — maxWorkers on any station

     node tests/camp-crew.mjs      # exits non-zero on any regression
*/
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  // stand up a 2-worker camp with `n` hands on it, run the upgrade, report
  const run = (seed, key, n) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
    const tc = Bld.tcOf('P');
    tc.level = 3; tc.maxhp = CFG.BUILDINGS.tc.levels[2].hp; tc.hp = tc.maxhp;   // station upgrades need TC 2+
    /* A STATION STANDS ON WORKED GROUND NOW (tests/worked-ground.mjs) — so the
       scenario has to make some before it can plant a camp: paint the spent
       terrain this station belongs on, and mark a killing ground for a lodge. */
    const spot = MapGen.findNear(tc.x + 3, tc.y + 3, 10,
      (x, y) => Bld.tileFree(x, y) && !Bld.at(x, y));
    {
      const d = Bld.def(key);
      if (d.onWorked != null) S.map.terrain[MapGen.idx(spot.x, spot.y)] = d.onWorked;
      if (d.onHunted) G.noteHunt(spot.x, spot.y);
      Bld._block = null;
    }
    const camp = Bld.place('P', key, spot.x, spot.y, { free: true, instant: true });
    for (const u of S.units.slice()) if (u.owner === 'P' && Units.isVillager(u)) u.hp = 0;
    S.units = S.units.filter(u => u.hp > 0);
    const crew = [];
    for (let i = 0; i < n; i++) {
      const v = Units.spawn('villager', 'P', camp.x + 0.5, camp.y + 0.5);
      v.task = { type: 'work', id: camp.id }; crew.push(v);
    }
    const before = { assigned: Bld.workersAssigned(camp), cap: Bld.maxWorkers(camp) };
    Bld.upgrade(camp);
    const builders = S.units.filter(u => u.owner === 'P' && u.task && u.task.type === 'build' && u.task.id === camp.id);
    const total = camp.upgTotal;
    // run frames until the upgrade lands (or we give up)
    let t = 0; const dt = 1 / 30;
    while (camp.upgrading > 0 && t < 400) { Units.update(dt); t += dt; }
    const backAtWork = S.units.filter(u => u.owner === 'P' && u.task && u.task.type === 'work' && u.task.id === camp.id).length;
    const idle = S.units.filter(u => u.owner === 'P' && Units.isVillager(u) && !u.task).length;
    // …and the seam actually flows again: run a day's production
    S.res.wood = 0; S.res.stone = 0; S.res.food = 0;
    Bld.dailyProduction('P');
    const yielded = { wood: Math.round(S.res.wood), stone: Math.round(S.res.stone), food: Math.round(S.res.food) };
    return { camp, before, builders: builders.length, total, secs: +t.toFixed(2),
      level: camp.level, backAtWork, idle, active: Bld.workersActive(camp), yielded };
  };

  const two = run('cw1', 'lumber', 2);
  ck('camp holds two', two.before.cap === 2 && two.before.assigned === 2, `cap=${two.before.cap} on it=${two.before.assigned}`);
  ck('both down tools', two.builders === 2, `${two.builders} builders`);
  ck('upgrade completes', two.level === 2, `level ${two.level}`);
  ck('both back to the seam', two.backAtWork === 2 && two.idle === 0,
    `${two.backAtWork} working, ${two.idle} left idle`);
  ck('both hands earn again', two.active === 2 && two.yielded.wood > 0,
    `${two.active} on station, a day yields ${two.yielded.wood} wood`);

  const one = run('cw1', 'lumber', 1);
  ck('one hand still works', one.builders === 1 && one.level === 2 && one.backAtWork === 1,
    `builders=${one.builders} level=${one.level} back=${one.backAtWork}`);
  ck('two hands out-earn one', two.yielded.wood > one.yielded.wood,
    `2 hands ${two.yielded.wood} vs 1 hand ${one.yielded.wood} wood/day`);
  // two hands should raise it in about half the time one does
  const ratio = one.secs / two.secs;
  ck('two hands, half the time', ratio > 1.7 && ratio < 2.3,
    `1 hand ${one.secs}s vs 2 hands ${two.secs}s (${ratio.toFixed(2)}x)`);

  // a quarry (the other 2-worker station) behaves the same
  const q = run('cw2', 'quarry', 2);
  ck('quarry too', q.builders === 2 && q.level === 2 && q.backAtWork === 2,
    `builders=${q.builders} back=${q.backAtWork}`);

  // a 1-worker station (farm) is unchanged — one hand, one post
  const f = run('cw3', 'farm', 1);
  ck('farm unchanged', f.before.cap === 1 && f.builders === 1 && f.backAtWork === 1,
    `cap=${f.before.cap} builders=${f.builders} back=${f.backAtWork}`);

  // and an EMPTY camp still pulls a passing villager, as before
  {
    G.newGame('cw4', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9000, wood: 9000, stone: 9000, gold: 9000 };
    const tc = Bld.tcOf('P');
    tc.level = 3; tc.maxhp = CFG.BUILDINGS.tc.levels[2].hp; tc.hp = tc.maxhp;
    const spot = MapGen.findNear(tc.x + 3, tc.y + 3, 10, (x, y) => Bld.tileFree(x, y) && !Bld.at(x, y));
    S.map.terrain[MapGen.idx(spot.x, spot.y)] = T.STUMPS;   // a camp stands on a felled stand
    Bld._block = null;
    const camp = Bld.place('P', 'lumber', spot.x, spot.y, { free: true, instant: true });
    for (const u of S.units) if (u.owner === 'P' && Units.isVillager(u)) u.task = null;
    Bld.upgrade(camp);
    const bn = S.units.filter(u => u.owner === 'P' && u.task && u.task.type === 'build' && u.task.id === camp.id).length;
    ck('empty camp pulls a builder', bn === 1, `${bn} builder(s)`);
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL CREW CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
