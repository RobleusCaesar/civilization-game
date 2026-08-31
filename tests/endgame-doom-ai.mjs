/* FINISH IT — the rival's half of the no-way-back contract (see
   tests/endgame-doom.mjs for the player-facing offer).

   A town with no hands cannot rebuild a wall, re-crew a farm, repair the hall
   or train a replacement, so the chief stops husbanding its host and puts every
   warrior on the Town Center — ahead of the campaign and the raid cadence, and
   re-issued daily so the break-off timers can't call them home halfway.

   FOG HONESTY is the delicate part. The conclusion is drawn from SIGHT and only
   sight: eyes on the hall, and no villager visible. A villager hiding in a far
   corner is NOT caught, deliberately — catching it would mean consulting units
   the chief cannot see, which is omniscience wearing a different hat. The
   inference is fallible on purpose, and hiding a hand is real counterplay.

     node tests/endgame-doom-ai.mjs      # exits non-zero on any regression
*/
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const setup = (seed, opts) => {
    opts = opts || {};
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.day = 150;
    const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A'), ai = S.ai;
    ai.knownB = ai.knownB || {};
    ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: ptc.level, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    ai.posture = 'PUSH';
    for (const u of S.units.slice()) if (u.owner === 'P' && Units.isVillager(u)) u.hp = 0;
    S.units = S.units.filter(u => u.hp > 0);
    // a hidden villager, far from any rival eye
    let hidden = null;
    if (opts.hiddenVillager) {
      // the corner farthest from every rival eye
      let best = null, bd = -1;
      for (let y = 1; y < CFG.H - 1; y += 2) for (let x = 1; x < CFG.W - 1; x += 2) {
        if (!Path.passable(x, y, 'P')) continue;
        const d = Math.min(Math.hypot(x - atc.x, y - atc.y), Math.hypot(x - ptc.x, y - ptc.y));
        if (d > bd) { bd = d; best = { x, y }; }
      }
      hidden = best && Units.spawn('villager', 'P', best.x, best.y);
    }
    // the rival's host: some idle at home, some already off on a raid elsewhere
    const host = [];
    for (let i = 0; i < 8; i++) { const u = Units.spawn('defender', 'A', atc.x + 1 + i * 0.4, atc.y + 3); if (u) host.push(u); }
    if (!opts.blind) for (let i = 0; i < 3; i++) { const u = Units.spawn('archer', 'A', ptc.x + 3 + i * 0.4, ptc.y + 3); if (u) { u.task = { type: 'raid' }; u.raidObj = { type: 'econ', x: 5, y: 5 }; host.push(u); } }
    const boat = Units.spawn('fishboat', 'A', atc.x, atc.y);
    // …and eyes on the hall unless the test says otherwise
    if (!opts.blind) for (let i = 0; i < 2; i++) Units.spawn('defender', 'A', ptc.x + 2 + i * 0.3, ptc.y + 2);
    G.updateVisibility(); AI.assess();
    return { ptc, atc, host, boat, ai, hidden };
  };
  // ---- eyes on an empty town → everything on the hall ----
  {
    const { ptc, boat } = setup('fin1');
    const spent = AI.foeSpent();
    AI.daily();
    const onHall = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid' &&
      u.raidObj && u.raidObj.type === 'tc' && u.raidObj.x === ptc.x && u.raidObj.y === ptc.y);
    const army = S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u) && u.kind !== 'siegetower');
    ck('seesTheTownIsSpent', spent, `foeSpent=${spent}`);
    ck('everyWarriorOnTheHall', onHall.length === army.length && army.length >= 10,
      `${onHall.length}/${army.length} committed`);
    ck('boatsKeepTheirJobs', !(boat && boat.task && boat.task.type === 'raid'), 'fishing boat untouched');
    ck('raidClockRefreshed', S.ai.raidDay === S.day && S.ai.raidLane === 'finish', `raidDay=${S.ai.raidDay} lane=${S.ai.raidLane}`);
  }
  // ---- fog honesty: a villager alive but UNSEEN is not written off ----
  {
    /* The conclusion is drawn from SIGHT, and only sight. A villager the chief
       can see stops it dead. One hiding in a far corner does not — and that is
       correct: to catch that villager the chief would have to consult units it
       cannot see, which is omniscience wearing a different hat. The inference
       is fallible on purpose, and hiding a hand is real counterplay. */
    const { hidden, ptc } = setup('fin2', { hiddenVillager: true });
    const seenHidden = hidden && AI.canSee(hidden);
    ck('doesNotCheatToSeeHiddenHands', !!hidden && !seenHidden && AI.foeSpent() === true,
      `hidden@${hidden && Math.round(hidden.x)},${hidden && Math.round(hidden.y)} visibleToRival=${seenHidden} foeSpent=${AI.foeSpent()}`);
    // …and a villager it CAN see stops it at once
    const inSight = Units.spawn('villager', 'P', ptc.x + 1, ptc.y + 1);
    G.updateVisibility(); AI.assess();
    ck('aVillagerItCanSeeStopsIt', AI.canSee(inSight) && AI.foeSpent() === false,
      `visible=${AI.canSee(inSight)} foeSpent=${AI.foeSpent()}`);
    // …and the moment one reappears in sight the host goes back to normal work
    AI.daily();
    ck('standsDownWhenHandsReturn', !S.ai.finishLogged, `finishLogged=${S.ai.finishLogged}`);
  }
  // ---- and with no eyes on the hall at all, it draws no conclusion ----
  {
    setup('fin3', { blind: true });
    ck('needsEyesOnTheHall', AI.foeSpent() === false, `foeSpent=${AI.foeSpent()}`);
  }
  // ---- re-issued daily, so the break-off timers can't call them home ----
  {
    const { ptc } = setup('fin4');
    AI.daily();
    S.ai.raidDay = S.day - 40;                       // pretend the party has been out for ages
    S.day += 1; G.updateVisibility(); AI.assess(); AI.daily();
    const still = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid' &&
      u.raidObj && u.raidObj.type === 'tc' && u.raidObj.x === ptc.x).length;
    ck('holdsThroughTheTimers', still >= 10 && S.ai.raidDay === S.day, `${still} still on the hall, raidDay=${S.ai.raidDay}/${S.day}`);
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FINISH CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
