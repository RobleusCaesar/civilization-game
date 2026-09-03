// COMBINED-ARMS CONTRACT — the composition decisions, in isolation.
//  1. small host / one way in / undefended  -> ONE full attack (no split)
//  2. big host + defended + a second lane   -> feint + held main column
//  3. the held column commits after 2 days, at a DIFFERENT lane than the feint
//  4. engines never march with the feint
//  5. aim points rotate: a door that didn't give way isn't used twice running
//  6. feints that never pull are abandoned on this player (scorecard)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const out = await p.evaluate(() => {
  const res = {};
  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens.show('playing'); S.paused = true;
    const ai = S.ai, ptc = Bld.tcOf('P');
    S.day = 100;
    ai.knownB = ai.knownB || {};
    ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: 1, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    ai.posture = 'PUSH';
    ai.camp = { strat: 'WARHORN', since: 90, rounds: 0, tried: [], grind: false };
    AI.assess();
    return { ai, ptc, read: ai.read };
  };
  const armyFor = (n, atc) => {
    const made = [];
    for (let i = 0; i < n; i++) made.push(Units.spawn('defender', 'A', atc.x + 1 + (i % 6) * 0.5, atc.y + 3 + ((i / 6) | 0) * 0.5));
    return made.filter(Boolean);
  };

  // ---- 1. SMALL HOST → one full attack ----
  {
    const { ai, read } = setup('cmb1');
    const atc = Bld.tcOf('A');
    armyFor(6, atc);
    const plan = AI.composeAssault(read, 6);
    res.smallHost = { feint: !!plan.feint, why: plan.why };
    AI._launchCampRaid(read, 'WARHORN');
    const raiders = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid');
    res.smallHostLaunch = { raiders: raiders.length, feinters: raiders.filter(u => u.feint).length, pending: !!ai.camp.pending };
  }

  // ---- 2+3+4. BIG HOST vs a defended town → feint, then a held main column ----
  {
    const { ai, ptc, read } = setup('cmb2');
    const atc = Bld.tcOf('A');
    // give the player defences so lanes differ in strength and there's something to draw
    let placed = 0;
    for (let r = 4; r <= 6 && placed < 6; r++) for (let a = 0; a < 8 && placed < 6; a++) {
      const x = Math.round(ptc.x + Math.cos(a / 8 * 6.28) * r), y = Math.round(ptc.y + Math.sin(a / 8 * 6.28) * r);
      if (Bld.canPlace('P', 'tower', x, y).ok) {
        const t = Bld.place('P', 'tower', x, y, { free: true, instant: true });
        if (t) { ai.knownB[MapGen.idx(x, y)] = { key: 'tower', level: 1, owner: 'P', x, y, seen: S.day }; placed++; }
      }
    }
    armyFor(14, atc);
    // engines must stay with the real attack
    const cat = Units.spawn('catapult', 'A', atc.x + 2, atc.y + 4);
    // a live garrison on the walls — a feint draws SOLDIERS, not towers
    const lanes0 = AI.playerLanes();
    if (lanes0.length) for (let i = 0; i < 4; i++) Units.spawn('defender', 'P', lanes0[0].mid.x + i * 0.4, lanes0[0].mid.y);
    AI.assess();
    const read2 = ai.read;
    const plan = AI.composeAssault(read2, 15);
    res.bigHostPlan = { feint: plan.feint ? plan.feint.key : null, main: plan.main ? plan.main.key : null,
      distinct: !!(plan.feint && plan.main && plan.feint.key !== plan.main.key), feintN: plan.feintN, why: plan.why };
    AI._launchCampRaid(read2, 'WARHORN');
    const feinters = S.units.filter(u => u.owner === 'A' && u.feint);
    res.feintLaunched = {
      n: feinters.length,
      allLight: feinters.every(u => !Units.isSiege(u) && u.kind !== 'ballista'),
      catapultHeldBack: !!(cat && !(cat.task && cat.task.type === 'raid')),
      pendingHeld: !!ai.camp.pending, heldN: ai.camp.pending ? ai.camp.pending.ids.length : 0,
      dueInDays: ai.camp.pending ? ai.camp.pending.due - S.day : null,
    };
    // the main column must NOT be committed before its time…
    AI.campaignLaunch(read2, G.modeCfg());
    res.mainHeldEarly = !!ai.camp.pending;
    // …and must commit at the other lane once due
    S.day += 2;
    AI.campaignLaunch(ai.read, G.modeCfg());
    const mainers = S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid' && !u.feint);
    res.mainCommitted = {
      pendingCleared: !ai.camp.pending, n: mainers.length,
      lane: ai.raidLane,
      differentFromFeint: ai.raidLane !== (feinters[0] && feinters[0].raidLane),
      catapultJoined: !!(cat && cat.task && cat.task.type === 'raid'),
    };
  }

  // ---- 5. aim points rotate when a door didn't give way ----
  {
    const { ai, read } = setup('cmb3');
    const lanes = AI.playerLanes();
    if (lanes.length > 1) {
      ai.memory.lastMainLane = lanes[0].key; ai.memory.lastMainWorked = false;
      const a = AI.composeAssault(read, 8);
      ai.memory.lastMainLane = lanes[0].key; ai.memory.lastMainWorked = true;
      const b2 = AI.composeAssault(read, 8);
      res.rotation = { afterFailure: a.main.key, afterSuccess: b2.main.key,
        movedOn: a.main.key !== lanes[0].key, returnedToWinner: b2.main.key === lanes[0].key };
    } else res.rotation = 'only one lane on this map — skipped';
  }

  // ---- 6. feints that never pull get dropped for this player ----
  {
    const { ai, read } = setup('cmb4');
    const lanes = AI.playerLanes();
    if (lanes.length > 1) {
      const key = lanes[0].key;
      ai.memory.combo = { [key]: { tries: 3, pulled: 0, last: S.day } };
      for (let i = 0; i < 4; i++) Units.spawn('defender', 'P', lanes[0].mid.x + i * 0.4, lanes[0].mid.y);
      const plan = AI.composeAssault(read, 20);
      res.sourFeint = { feint: plan.feint ? plan.feint.key : null, why: plan.why };
    } else res.sourFeint = 'skipped';
  }
  // ---- 7. a big host but an UNMANNED wall -> one full attack, no theatre ----
  {
    const { ai, ptc, read } = setup('cmb5');
    const atc = Bld.tcOf('A');
    let placed = 0;
    for (let r = 4; r <= 6 && placed < 6; r++) for (let a = 0; a < 8 && placed < 6; a++) {
      const x = Math.round(ptc.x + Math.cos(a / 8 * 6.28) * r), y = Math.round(ptc.y + Math.sin(a / 8 * 6.28) * r);
      if (Bld.canPlace('P', 'tower', x, y).ok) {
        const t = Bld.place('P', 'tower', x, y, { free: true, instant: true });
        if (t) { ai.knownB[MapGen.idx(x, y)] = { key: 'tower', level: 1, owner: 'P', x, y, seen: S.day }; placed++; }
      }
    }
    for (const u of S.units.filter(u => u.owner === 'P' && Units.isMilitary(u))) u.hp = 0;
    S.units = S.units.filter(u => u.hp > 0);
    armyFor(16, atc);
    AI.assess();
    const plan = AI.composeAssault(ai.read, 16);
    res.undefendedWall = { feint: plan.feint ? plan.feint.key : null, why: plan.why };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL/.test(e)));
await b.close();
