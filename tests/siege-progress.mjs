/* SIEGE-PROGRESS CONTRACT — a siege round is scored on PENETRATION, not damage.

   The bug this locks out: walls and gates are ordinary entries in S.buildings,
   so razing ONE wall section made both of the old success tests true at once
   ("a building disappeared" and "≥10% off their fortifications"). A chief that
   broke a section every round and was wiped out before it could walk through
   scored itself a winner every time, never reached the dry-round test, and
   battered the same stone for the rest of the game.

   Run this after touching any of:
     ai.js — campaignLaunch (round evaluation / startRound), campaignSelect,
             campaignReady, notePenetration, _foeCoreCount, _noteStrat,
             routeHolds / _reachesTown, INSIDE_R, ROUTE_HOLD
     combat.js — aiRaidSeek (the per-frame penetration sample)
     buildings.js — forts, removeToRuin, place

       node tests/siege-progress.mjs      # exits non-zero on any regression

   The invariants:
     1. WALL IS NOT A WIN  — razing wall sections, and chipping fortification
        HP, never scores a round as a breakthrough on their own
     2. INSIDE IS          — two raiders in the town core scores it
     3. CORE NOT FRINGE    — razing a building in the town core scores; razing
        an outlying hut does not
     4. ROTATE             — dry rounds accumulate and the plan is retired to
        `tried`; a grind is not exempt
     5. COME BACK HEAVIER  — a host annihilated short of the wall raises
        camp.surge, and campaignReady then demands a bigger force
     6. TWO WIPES ROTATE   — the plan is wrong for this town whatever the numbers
     7. ONE VERDICT        — a finished round is scored exactly once, not once
        per day until it happens to rotate
     8. A HOLE IS NOT A ROAD — one broken section does not read as "we can walk
        in", which used to tear down the plan AND wipe the rotation memory
     9. NO SNAP-BACK       — when every plan has been tried the wheel restarts,
        but not on the plan just abandoned
   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}; const fails = [];
  const ck = (name, ok, info) => { res[name] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(name); };

  /* Stand a campaign up on a known board: the player's hall is remembered, the
     rival is in PUSH, and a named plan holds the slot with a live round. */
  const setup = (seed, strat, grind) => {
    G.newGame(seed, 'moderate', 'large'); Screens.show('playing'); S.paused = true;
    S.day = 100;
    const ai = S.ai, ptc = Bld.tcOf('P');
    ai.knownB = ai.knownB || {};
    ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: ptc.level, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    ai.posture = 'PUSH';
    G.updateVisibility(); AI.assess();
    ai.camp = { strat: strat || 'IRONBELLY', since: 90, rounds: 0, tried: [], grind: !!grind, dry: 0, surge: 0 };
    return { ai, ptc, cx: Bld.cx(ptc) | 0, cy: Bld.cy(ptc) | 0 };
  };
  // open a round by hand, exactly as startRound does, then close it at the deadline
  const openRound = (ptc, party) => {
    const camp = S.ai.camp;
    camp.rounds++;
    camp.roundBaseBld = Bld.list('P').length;
    camp.roundBaseHp = AI._foeFortHp();
    camp.roundBaseCore = AI._foeCoreCount();
    camp.roundEnd = S.day + 12;
    camp.pushDay = S.day;
    camp.aim = { x: Bld.cx(ptc), y: Bld.cy(ptc) };
    camp.deep = null; camp.inIds = [];
    camp.partyIds = (party || []).map(u => u.id);
    camp.partyN = camp.partyIds.length;
  };
  const closeRound = () => { S.day = S.ai.camp.roundEnd; AI.campaignLaunch(S.ai.read, G.modeCfg()); };
  const ringPlayer = (cx, cy, r) => {
    let n = 0;
    for (let d = -r; d <= r; d++) for (const y of [cy - r, cy + r])
      if (Bld.canPlace('P', 'wall', cx + d, y).ok || (G.clearFootprint(cx + d, y, 'wall'), Bld.canPlace('P', 'wall', cx + d, y).ok))
        if (Bld.place('P', 'wall', cx + d, y, { free: true, instant: true })) n++;
    for (let d = -r + 1; d <= r - 1; d++) for (const x of [cx - r, cx + r])
      if (Bld.canPlace('P', 'wall', x, cy + d).ok || (G.clearFootprint(x, cy + d, 'wall'), Bld.canPlace('P', 'wall', x, cy + d).ok))
        if (Bld.place('P', 'wall', x, cy + d, { free: true, instant: true })) n++;
    return n;
  };

  // ---- 1. WALL IS NOT A WIN: raze sections + chip HP, get nobody inside ----
  {
    const { ai, ptc, cx, cy } = setup('sp1');
    const laid = ringPlayer(cx, cy, 5);
    const atc = Bld.tcOf('A');
    const party = [];
    for (let i = 0; i < 6; i++) { const u = Units.spawn('defender', 'A', atc.x + 1 + i * 0.4, atc.y + 3); if (u) { u.task = { type: 'raid' }; party.push(u); } }
    openRound(ptc, party);
    const hp0 = AI._foeFortHp();
    // knock down three sections and batter a fourth — a very productive round by
    // the OLD yardstick, and not one boot inside the town
    let razed = 0;
    for (const f of Bld.forts('P').slice(0, 3)) { Bld.removeToRuin(f); razed++; }
    const f4 = Bld.forts('P')[0]; if (f4) f4.hp = Math.max(1, f4.hp * 0.2);
    // the OLD test was `razed || chipped` — razing sections satisfied it alone
    const oldWouldWin = (Bld.list('P').length < ai.camp.roundBaseBld) || (AI._foeFortHp() < hp0 * 0.9);
    closeRound();
    ck('wallNotAWin.setup', laid > 12 && razed === 3 && oldWouldWin,
      `ring=${laid} razed=${razed} oldMetricSaysWon=${oldWouldWin}`);
    ck('wallNotAWin', ai.camp.dry > 0 && !((ai.memory || {}).lastMainWorked),
      `dry=${ai.camp.dry} lastMainWorked=${(ai.memory || {}).lastMainWorked}`);
    const sc = ((ai.memory || {}).strat || {}).IRONBELLY || {};
    ck('wallNotAWin.scorecard', sc.prog === 0 && sc.dry >= 1, JSON.stringify(sc));
  }

  // ---- 2. INSIDE IS a win: two raiders in the town core ----
  {
    const { ai, ptc, cx, cy } = setup('sp2');
    ringPlayer(cx, cy, 5);
    const atc = Bld.tcOf('A');
    const party = [];
    for (let i = 0; i < 6; i++) { const u = Units.spawn('defender', 'A', atc.x + 1 + i * 0.4, atc.y + 3); if (u) { u.task = { type: 'raid' }; party.push(u); } }
    openRound(ptc, party);
    // walk two of them into the town and let the sampler see them
    for (let i = 0; i < 2; i++) { party[i].x = Bld.cx(ptc) + 1; party[i].y = Bld.cy(ptc) + 1; AI.notePenetration(party[i]); }
    const inN = (ai.camp.inIds || []).length;
    closeRound();
    ck('insideIsAWin', inN === 2 && (ai.memory || {}).lastMainWorked === true && ai.camp.dry === 0,
      `inside=${inN} lastMainWorked=${(ai.memory || {}).lastMainWorked} dry=${ai.camp.dry}`);
    const sc = ((ai.memory || {}).strat || {}).IRONBELLY || {};
    ck('insideIsAWin.scorecard', sc.prog === 1 && sc.deep != null, JSON.stringify(sc));
    // one lone raider dipping in is NOT a breakthrough
    const s2 = setup('sp2b');
    ringPlayer(s2.cx, s2.cy, 5);
    const lone = Units.spawn('defender', 'A', Bld.tcOf('A').x + 1, Bld.tcOf('A').y + 3);
    lone.task = { type: 'raid' };
    openRound(s2.ptc, [lone, lone, lone]);
    lone.x = Bld.cx(s2.ptc) + 1; lone.y = Bld.cy(s2.ptc) + 1; AI.notePenetration(lone);
    closeRound();
    ck('oneManIsNotABreakIn', S.ai.camp.dry > 0, `dry=${S.ai.camp.dry}`);
  }

  // ---- 3. CORE not FRINGE: which building burned matters ----
  {
    const { ptc, cx, cy } = setup('sp3');
    // a hut in the town core and one out on the fringe
    const site = (x, y) => { if (!MapGen.inB(x, y)) return null; G.clearFootprint(x, y, 'house'); return Bld.canPlace('P', 'house', x, y).ok ? { x, y } : null; };
    // a hut just off the hall, and one well outside the core radius
    const ring = (r) => { for (let a = 0; a < 16; a++) { const s = site(Math.round(cx + Math.cos(a / 16 * 6.283) * r), Math.round(cy + Math.sin(a / 16 * 6.283) * r)); if (s) return s; } return null; };
    const near = ring(2) || ring(3);
    const far = ring(AI.INSIDE_R + 6) || ring(AI.INSIDE_R + 8) || ring(AI.INSIDE_R + 4);
    const inHut = near && Bld.place('P', 'house', near.x, near.y, { free: true, instant: true });
    const outHut = far && Bld.place('P', 'house', far.x, far.y, { free: true, instant: true });
    if (!inHut || !outHut) { ck('coreNotFringe', false, 'could not site the two huts'); ck('fortsAreNotCore', false, 'skipped'); }
    else {
    const coreWith = AI._foeCoreCount();
    Bld.removeToRuin(outHut);
    const coreAfterFringe = AI._foeCoreCount();
    Bld.removeToRuin(inHut);
    const coreAfterCore = AI._foeCoreCount();
    ck('coreNotFringe', !!inHut && !!outHut && coreAfterFringe === coreWith && coreAfterCore === coreWith - 1,
      `core ${coreWith} → fringe razed ${coreAfterFringe} → core razed ${coreAfterCore}`);
    // and walls/gates/towers are never "core" at all
    const t = MapGen.findNear(cx + 3, cy, 3, (x, y) => Bld.canPlace('P', 'tower', x, y).ok);
    const c0 = AI._foeCoreCount();
    if (t) Bld.place('P', 'tower', t.x, t.y, { free: true, instant: true });
    ck('fortsAreNotCore', !!t && AI._foeCoreCount() === c0, `${c0} → ${AI._foeCoreCount()}`);
    }
  }

  // ---- 4. ROTATE: dry rounds retire the plan — a grind is not exempt ----
  {
    const { ai, ptc, cx, cy } = setup('sp4', 'IRONBELLY', true);
    ringPlayer(cx, cy, 5);
    const atc = Bld.tcOf('A');
    let rounds = 0;
    for (let i = 0; i < 6 && ai.camp.strat === 'IRONBELLY'; i++) {
      const party = [];
      for (let k = 0; k < 6; k++) { const u = Units.spawn('defender', 'A', atc.x + 1 + k * 0.4, atc.y + 3); if (u) { u.task = { type: 'raid' }; party.push(u); } }
      openRound(ptc, party);
      for (const u of party) { u.x = Bld.cx(ptc); u.y = Bld.cy(ptc) - 8; AI.notePenetration(u); }   // reach the wall, get no further
      closeRound(); rounds++;
      for (const u of party) u.hp = 0; S.units = S.units.filter(u => u.hp > 0);
    }
    ck('grindRotates', ai.camp.strat !== 'IRONBELLY' && ai.camp.tried.indexOf('IRONBELLY') >= 0 && rounds <= 4,
      `after ${rounds} dry rounds strat=${ai.camp.strat} tried=[${ai.camp.tried}]`);
  }

  // ---- 5+6. COME BACK HEAVIER, then give up on the plan ----
  {
    const { ai, ptc, cx, cy } = setup('sp5', 'WARHORN', false);
    ringPlayer(cx, cy, 5);
    const atc = Bld.tcOf('A');
    const readyAt = [];
    const wipeRound = () => {
      const party = [];
      for (let k = 0; k < 6; k++) { const u = Units.spawn('defender', 'A', atc.x + 1 + k * 0.4, atc.y + 3); if (u) { u.task = { type: 'raid' }; party.push(u); } }
      openRound(ptc, party);
      for (const u of party) { u.x = Bld.cx(ptc); u.y = Bld.cy(ptc) - 8; AI.notePenetration(u); }
      for (const u of party) u.hp = 0; S.units = S.units.filter(u => u.hp > 0);   // annihilated
      closeRound();
      readyAt.push(ai.camp.surge || 0);
    };
    wipeRound();
    const surge1 = ai.camp.surge;
    // the bar for committing again has genuinely risen
    for (let k = 0; k < 6; k++) { const u = Units.spawn('defender', 'A', atc.x + 1 + k * 0.4, atc.y + 5); if (u) u.task = null; }
    const readyWithSix = AI.campaignReady('WARHORN');
    ai.camp.surge = 0;
    const readyWithSixNoSurge = AI.campaignReady('WARHORN');
    ai.camp.surge = surge1;
    ck('comeBackHeavier', surge1 === 1 && readyWithSixNoSurge && !readyWithSix,
      `surge=${surge1} sixMenReady(base)=${readyWithSixNoSurge} sixMenReady(surged)=${readyWithSix}`);
    if (ai.camp.strat === 'WARHORN') wipeRound();
    ck('twoWipesRotate', ai.camp.strat !== 'WARHORN' && ai.camp.tried.indexOf('WARHORN') >= 0,
      `strat=${ai.camp.strat} tried=[${ai.camp.tried}] surge=${ai.camp.surge}`);
  }

  // ---- 7. ONE VERDICT per round, not one per day ----
  {
    const { ai, ptc, cx, cy } = setup('sp7', 'IRONBELLY', true);
    ringPlayer(cx, cy, 5);
    const atc = Bld.tcOf('A');
    const party = [];
    for (let k = 0; k < 6; k++) { const u = Units.spawn('defender', 'A', atc.x + 1 + k * 0.4, atc.y + 3); if (u) { u.task = { type: 'raid' }; party.push(u); } }
    openRound(ptc, party);
    closeRound();                                   // the one real verdict
    const dry1 = ai.camp.dry, tries1 = (((ai.memory || {}).strat || {}).IRONBELLY || {}).tries;
    for (let d = 0; d < 5; d++) { S.day++; AI.campaignLaunch(ai.read, G.modeCfg()); }
    const tries2 = (((ai.memory || {}).strat || {}).IRONBELLY || {}).tries;
    ck('oneVerdictPerRound', tries1 === 1 && tries2 === 1 && ai.camp.dry === dry1,
      `scored ${tries2}× over 6 days, dry ${dry1}→${ai.camp.dry}`);
  }

  // ---- 8. A HOLE IS NOT A ROAD ----
  {
    const { ai, ptc, cx, cy } = setup('sp8');
    ringPlayer(cx, cy, 5);
    ai.routeOpen = 0; ai.routeDay = -1;
    // hand-built reach masks so the persistence rule is tested on its own terms,
    // independent of what this particular map's terrain happens to allow
    const open = new Uint8Array(CFG.W * CFG.H), shut = new Uint8Array(CFG.W * CFG.H);
    for (let dy = -1; dy <= Bld.size('tc'); dy++) for (let dx = -1; dx <= Bld.size('tc'); dx++)
      if (MapGen.inB(ptc.x + dx, ptc.y + dy)) open[MapGen.idx(ptc.x + dx, ptc.y + dy)] = 1;
    const d0 = S.day;
    const reachesNow = AI._reachesTown(open, ptc);
    const holds1 = AI.routeHolds(open, ptc);                       // day 1 of the hole
    S.day = d0 + 1; const holds2 = AI.routeHolds(open, ptc);       // day 2
    S.day = d0 + 2; const holds3 = AI.routeHolds(open, ptc);       // day 3 — now it is a road
    ck('holeIsNotARoad', reachesNow && !holds1 && !holds2 && holds3 && AI.ROUTE_HOLD >= 2,
      `pathExists=${reachesNow} holds after 1/2/3 days = ${holds1}/${holds2}/${holds3}`);
    // …and the masons closing it resets the clock rather than banking the days
    S.day = d0 + 3;
    const afterRepair = AI.routeHolds(shut, ptc);
    ck('repairResetsTheClock', !afterRepair && (ai.routeOpen || 0) === 0, `routeOpen=${ai.routeOpen}`);
  }

  /* ---- 10. THE SAPPER PICKS THE RIGHT TOOL. A bridge is 6s and free; filling
     a water tile is 10-20s and 35 stone + 10 wood. `Terraform.bridgeable` only
     asks "is this water" — it does NOT ask whether a deck can be laid, which
     needs land on both opposite sides. So the breach planner called mid-lake
     tiles "bridge", the job could never be built, and the lane fell through to
     filling the lake one wagon at a time beside a crossing it could have
     spanned. bridgeCrossing is the honest question. ---- */
  {
    setup('sp10');
    const idx = MapGen.idx, cx = 20, cy = 20;
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 6; x <= cx + 6; x++) S.map.terrain[idx(x, y)] = T.GRASS;
    for (let y = cy - 4; y <= cy + 4; y++) S.map.terrain[idx(cx, y)] = T.WATER;                    // a 1-wide channel
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx + 3; x <= cx + 5; x++) S.map.terrain[idx(x, y)] = T.WATER;   // a wide lake
    S.map.terrain[idx(cx - 2, cy)] = T.FOREST;
    const mode = (x, y) => {
      const t = S.map.terrain[idx(x, y)], water = (t === T.WATER || t === T.MOAT);
      if (water && Terraform.bridgeCrossing(x, y, 'A') && !Bld.bridgeAt(x, y)) return 'bridge';
      if (Terraform.isClearable(x, y)) return 'clear';
      if (water && Terraform.isMoundable(x, y, 'A')) return 'mound';
      return null;
    };
    const F = CFG.TERRAFORM;
    ck('spanIsBridged', mode(cx, cy) === 'bridge' && !!Terraform.bridgeCrossing(cx, cy, 'A'),
      `channel → ${mode(cx, cy)}`);
    ck('lakeIsNotBridged', mode(cx + 4, cy) !== 'bridge' && !Terraform.bridgeCrossing(cx + 4, cy, 'A'),
      `mid-lake → ${mode(cx + 4, cy)} (old code said "bridge" and could never build it)`);
    ck('treelineIsCut', mode(cx - 2, cy) === 'clear', `forest → ${mode(cx - 2, cy)}`);
    // and the price ladder the lane choice reasons about must stay in this order
    ck('toolCostOrder', F.clear < F.bridge && F.bridge < F.reclaim && F.reclaim < F.reclaimDeep,
      `clear ${F.clear} < bridge ${F.bridge} < reclaim ${F.reclaim} < deep ${F.reclaimDeep}`);
  }

  // ---- 9. NO SNAP-BACK to the plan just abandoned ----
  {
    const { ai } = setup('sp9', 'IRONBELLY', true);
    // every plan already tried: the wheel must restart WITHOUT re-picking this one
    ai.camp.tried = AI.CAMPAIGNS.slice();
    const before = ai.camp.strat;
    for (let i = 0; i < 3; i++) { S.day++; AI.assess(); AI.campaignSelect(S.ai.read); }
    const kept = ai.camp.tried.length === 1 && ai.camp.tried[0] === before;
    ck('noSnapBack', ai.camp.strat !== before || kept,
      `was ${before}, now ${ai.camp.strat}, tried=[${ai.camp.tried}]`);
    ck('noBlanksInTried', ai.camp.tried.every(k => !!k), `tried=[${ai.camp.tried}]`);
  }
  /* ---- 10. A COLUMN NEVER STANDS AT THE WALL DOING NOTHING ----
     The reported failure: a war party marched up to a walled town, could SEE
     the villagers working inside, could not reach any of them, had no standing
     objective — and simply stood there. Every seek branch above it is
     reachability-gated (deliberately: a villager safe behind stone must not
     freeze the column), so with no objective the party fell straight through to
     "go home" and did nothing at all. A raider that can reach the enemy's
     STONEWORK turns on it instead: the way in is the way in. */
  {
    G.newGame('sp10', 'moderate', 'large'); Screens.show('playing'); S.paused = true;
    const ptc = Bld.tcOf('P');
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    S.units = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    Bld._block = null;
    /* a SEALED pocket: eight wall sections ringing one tile, with a villager
       inside it. Nothing about this is reachable — which is the whole point:
       the column can see a man it can never touch. */
    // mid-board, well clear of the hall and of the map edge (a party spawned
    // off-map is clamped onto the ring itself and can never take a step)
    const px = (CFG.W / 2) | 0, py = (CFG.H / 2) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const w = Bld.place('P', 'wall', px + dx, py + dy, { free: true });
      if (w) Bld.finish(w);
    }
    Bld._block = null;
    S.units = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).slice(0, 1);
    for (const u of S.units) { u.x = px + 0.5; u.y = py + 0.5; u.path = null; u.task = null; }
    // the rival's column arrives outside it, with NO objective of any kind
    S.ai.raidObj = null; S.ai.raidLane = null;
    const party = [];
    for (let i = 0; i < 4; i++) {
      const u = Units.spawn(i < 2 ? 'axeman' : 'elite', 'A', px + 3 + (i % 2), py - 1 + ((i / 2) | 0));
      u.task = { type: 'raid' }; u.defend = false; u.anchor = { x: u.x, y: u.y };
      party.push(u);
    }
    const fortHp = () => Bld.list('P').filter(z => z.key === 'wall').reduce((a, z) => a + z.hp, 0);
    const hp0 = fortHp();
    // they can SEE a villager they cannot get at — that must not freeze them
    const vil = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
    ck('theVillagersAreVisibleButOutOfReach',
      !!vil && Math.hypot(vil.x - party[0].x, vil.y - party[0].y) < Combat.CHAOS_R &&
      !Combat.canReach(party[0], vil.x, vil.y, 1.6), 'seen, unreachable');
    for (let t = 0; t < 400; t++) { Units.update(0.1); Combat.update(0.1); }
    const onStone = party.filter(u => Units.get(u.id) && u.tBld && (() => {
      const bb = Bld.get(u.tBld); return bb && (bb.key === 'wall' || bb.key === 'gate');
    })()).length;
    ck('theColumnTurnsOnTheWall', onStone >= 3, `${onStone} of ${party.length} battering stone`);
    ck('andTheStoneActuallyTakesIt', fortHp() < hp0, `${hp0} → ${fortHp()}`);
    ck('theyKeepTheirRaidTask', party.every(u => !Units.get(u.id) || (u.task && u.task.type === 'raid')),
      'the chief can still call them home');
    // …but a column with nothing of the enemy's within reach still goes home
    const lone = Units.spawn('axeman', 'A', 2, 2);
    lone.task = { type: 'raid' }; lone.anchor = { x: lone.x, y: lone.y };
    Combat.aiRaidSeek(lone);
    ck('anEmptyFieldStillSendsThemHome', !lone.tBld, 'nothing within RAID_SHELL_R');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL CONTRACT CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL/.test(e)).slice(0, 4));
await b.close();
process.exit(out.fails.length ? 1 : 0);
