/* SAPPER-FEES CONTRACT — the sappers' guild works for pay, per tile, and the
   later the tier that unlocks a tool, the dearer it runs.

   The fee table lives in CFG.TERRAFORM (digCost / bridgeCost / clearCost /
   moundCost). The rules this file pins:

     · LADDER — T1 dig is cheapest, T2 bridge dearer, the T3 tools (clear,
       mound) dearest, valued at rough exchange worth (stone 1.5x, gold 4x).
       No gold in any fee: a gold-poor tribe (the rival included) must still
       be able to field its engineers.
     · BILLED ON COMPLETION, EXACTLY ONCE — the fee is checked before the
       work lands and paid only when it does. A bridge charges bridgeCost and
       nothing else (no double-charge against CFG.BRIDGE upgrade prices); a
       failed job (seal-guarded dig, fallen-through crossing) charges nothing.
     · BROKE = SKIP, NEVER DEBT — an unaffordable tile is skipped with a
       warning; resources never go negative, the ground never changes free.
     · OWN PURSE — the rival's sappers bill S.ai.res; the player's bill S.res.
     · THE GHOST SPENDS A BUDGET — a dragged line marks only the tiles the
       treasury can actually cover (same running-budget rule as wall lines).

   Run this after touching any of:
     config.js — CFG.TERRAFORM (digCost/bridgeCost/clearCost/moundCost)
     units.js — the terraform completion branch in update, assignTerraform
     ui.js — updateTerraGhost, the sapper tool tap path
     buildings.js — buildBridge, canAfford, pay

     node tests/sapper-fees.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    S.map.explored.fill(1);
    for (let dy = -8; dy <= 8; dy++) for (let dx = -6; dx <= 14; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    const camp = Bld.place('P', 'sapper', tc.x - 3, tc.y - 3, { free: true, instant: true });
    camp.level = 3;
    S.units = [];
    const u = Units.spawn('sapper', 'P', 26, 25);
    return { tc, u };
  };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };
  const worth = (fee) => { const W = { food: 1, wood: 1, stone: 1.5, gold: 4 }; let s = 0; for (const k in fee || {}) s += fee[k] * W[k]; return s; };
  const snap = (bag) => JSON.parse(JSON.stringify(bag));
  const delta = (before, after) => { const d = {}; for (const k in before) if (before[k] !== after[k]) d[k] = +(before[k] - after[k]).toFixed(2); return d; };

  // ---- 1. the fee ladder: dearer with every tier, and never a gold fee ----
  {
    const TF = CFG.TERRAFORM;
    ck('feeLadder', worth(TF.digCost) < worth(TF.bridgeCost) &&
      worth(TF.bridgeCost) < worth(TF.clearCost) && worth(TF.clearCost) < worth(TF.moundCost),
      `dig ${worth(TF.digCost)} < bridge ${worth(TF.bridgeCost)} < clear ${worth(TF.clearCost)} < mound ${worth(TF.moundCost)}`);
    ck('noGoldFees', [TF.digCost, TF.bridgeCost, TF.clearCost, TF.moundCost].every(f => !f.gold),
      'gold-poor tribes still field their engineers');
  }

  // ---- 2. each job bills its fee exactly once, on completion ----
  {
    const { u } = setup('sf2');
    S.res = { food: 500, wood: 500, stone: 500, gold: 500 };
    const s0 = snap(S.res);
    Units.assignTerraform(u, 28, 25, 'dig');
    const t1 = run(30, () => S.map.terrain[MapGen.idx(28, 25)] !== T.GRASS);
    ck('digBillsExactly', JSON.stringify(delta(s0, snap(S.res))) === JSON.stringify({ food: CFG.TERRAFORM.digCost.food }),
      `after ${t1}s: paid ${JSON.stringify(delta(s0, snap(S.res)))}`);
  }
  {
    const { u } = setup('sf3');
    for (let y = 22; y <= 28; y++) S.map.terrain[MapGen.idx(30, y)] = T.WATER;   // a channel to span
    S.res = { food: 500, wood: 500, stone: 500, gold: 500 };
    const s0 = snap(S.res);
    Units.assignTerraform(u, 30, 25, 'bridge');
    const t1 = run(40, () => !!Bld.bridgeAt(30, 25));
    const paid = delta(s0, snap(S.res));
    ck('bridgeBillsExactly', !!Bld.bridgeAt(30, 25) && JSON.stringify(paid) ===
      JSON.stringify({ wood: CFG.TERRAFORM.bridgeCost.wood, stone: CFG.TERRAFORM.bridgeCost.stone }),
      `after ${t1}s: paid ${JSON.stringify(paid)} (no double-charge vs CFG.BRIDGE)`);
  }
  {
    const { u } = setup('sf4');
    S.map.terrain[MapGen.idx(28, 25)] = T.FOREST; S.map.resAmount[MapGen.idx(28, 25)] = 100;
    S.res = { food: 500, wood: 500, stone: 500, gold: 500 };
    const s0 = snap(S.res);
    Units.assignTerraform(u, 28, 25, 'clear');
    const t1 = run(30, () => S.map.terrain[MapGen.idx(28, 25)] !== T.FOREST);
    const paid = delta(s0, snap(S.res));
    ck('clearBillsExactly', JSON.stringify(paid) ===
      JSON.stringify({ food: CFG.TERRAFORM.clearCost.food, wood: CFG.TERRAFORM.clearCost.wood }),
      `after ${t1}s: paid ${JSON.stringify(paid)}`);
  }

  // ---- 3. broke = the tile is skipped: no debt, no free work ----
  {
    const { u } = setup('sf5');
    S.res = { food: 0, wood: 0, stone: 0, gold: 0 };
    Units.assignTerraform(u, 28, 25, 'dig');
    run(30, () => !u.task);
    const ground = S.map.terrain[MapGen.idx(28, 25)];
    ck('brokeSkipsTheTile', ground === T.GRASS && !u.task,
      `terrain=${ground} (grass=${T.GRASS}) task=${u.task && u.task.type}`);
    ck('neverDebt', Object.values(S.res).every(v => v >= 0), JSON.stringify(S.res));
  }

  // ---- 4. the rival's engineers bill the rival's purse ----
  {
    const { tc } = setup('sf6');
    const aCamp = Bld.place('A', 'sapper', tc.x + 8, tc.y - 3, { free: true, instant: true });
    aCamp.level = 1;
    const au = Units.spawn('sapper', 'A', 28, 25);
    S.res = { food: 500, wood: 500, stone: 500, gold: 500 };
    S.ai.res = { food: 500, wood: 500, stone: 500, gold: 500 };
    const p0 = snap(S.res), a0 = snap(S.ai.res);
    Units.assignTerraform(au, 30, 25, 'dig');
    const t1 = run(30, () => S.map.terrain[MapGen.idx(30, 25)] !== T.GRASS);
    ck('rivalPaysItsOwnPurse',
      JSON.stringify(delta(a0, snap(S.ai.res))) === JSON.stringify({ food: CFG.TERRAFORM.digCost.food }) &&
      JSON.stringify(delta(p0, snap(S.res))) === '{}',
      `after ${t1}s: rival paid ${JSON.stringify(delta(a0, snap(S.ai.res)))}, player ${JSON.stringify(delta(p0, snap(S.res)))}`);
  }

  // ---- 5. the drag ghost spends a running budget: half the treasury marks
  //         half the line ----
  {
    const { u } = setup('sf7');
    S.res = { food: CFG.TERRAFORM.digCost.food * 2 + 5, wood: 0, stone: 0, gold: 0 };
    UI.select('unit', u.id);
    UI.terraMode = 'dig';
    UI.terraDrag = [{ x: 28, y: 25 }, { x: 29, y: 25 }, { x: 30, y: 25 }, { x: 31, y: 25 }];
    UI.updateTerraGhost();
    const okN = (UI.terraGhost || []).filter(t => t.ok).length;
    ck('ghostSpendsABudget', okN === 2, `${okN}/4 tiles marked affordable with ${S.res.food} food`);
    UI.terraMode = null; UI.deselect();
  }

  /* ---- NOTHING IS WORKED IN THE BLACK ----
     The map's outermost ring is its hard border: rendered as off-map void,
     impassable, unbuildable, unfishable. Every one of those rules was spelled
     out by hand where it was needed — and the sapper's four tools were not
     among the places, so a trench or a mound could be QUEUED out in the black:
     marks drawn on the void, for work no hand could ever reach.

     The rule is one thing now, MapGen.onBoard, and every tool asks it. (`inB`
     is only "inside the array" and INCLUDES the rim — that is the trap.) */
  {
    G.newGame('rim', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const W = CFG.W, H = CFG.H, rim = [];
    for (let x = 0; x < W; x++) rim.push([x, 0], [x, H - 1]);
    for (let y = 0; y < H; y++) rim.push([0, y], [W - 1, y]);
    // lay WORKABLE ground all along the rim, so only the border rule itself can
    // refuse — never the terrain
    for (const [x, y] of rim) { const i = MapGen.idx(x, y); S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; }
    for (let x = 1; x < W - 1; x++) { const i = MapGen.idx(x, 1); S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; }
    S.map.terrain[MapGen.idx(0, 10)] = T.FOREST;                    // something to clear
    S.map.terrain[MapGen.idx(0, 12)] = T.WATER;                     // something to bridge / fill
    S.map.terrain[MapGen.idx(1, 12)] = T.WATER;
    Bld._block = null;
    const anyRim = (fn) => rim.some(([x, y]) => fn(x, y));

    ck('theBorderRuleIsOneThing',
      typeof MapGen.onBoard === 'function' &&
      MapGen.onBoard(0, 5) === false && MapGen.onBoard(W - 1, 5) === false &&
      MapGen.onBoard(5, 0) === false && MapGen.onBoard(5, H - 1) === false &&
      MapGen.onBoard(1, 1) === true, 'MapGen.onBoard — and inB is NOT it');
    ck('noToolReachesTheRim',
      !anyRim((x, y) => Terraform.isDiggable(x, y)) &&
      !anyRim((x, y) => Terraform.isClearable(x, y)) &&
      !anyRim((x, y) => Terraform.isMoundable(x, y, 'P')) &&
      !anyRim((x, y) => Terraform.bridgeable(x, y)), 'dig / clear / mound / bridge');
    ck('norIsAJobEverFoundThere', !anyRim((x, y) => !!Units.terraformJob('P', x, y)), '');
    ck('norAnythingElse',
      !anyRim((x, y) => Bld.tileFree(x, y)) &&
      !anyRim((x, y) => Bld.dockSiteOk(x, y, 'P').ok) &&
      !anyRim((x, y) => Units.fishableTile(x, y)) &&
      !anyRim((x, y) => Path.passable(x, y, 'P')),
      'built on, docked on, fished or walked');
    // …and the rule must not eat REAL ground: row 1 is the first playable line
    ck('butRowOneIsRealGround', Terraform.isDiggable(5, 1) && Bld.tileFree(5, 1), '');

    /* THE MARKS. The drag ghost is what actually decides where a mark is laid,
       so it is the thing that has to refuse — measured end to end. */
    const camp = Bld.place('P', 'sapper', Bld.tcOf('P').x + 2, Bld.tcOf('P').y + 2, { free: true, instant: true });
    camp.level = 3;
    const spot = MapGen.findNear(6, 3, 10, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y));
    const sp = Units.spawn('sapper', 'P', spot.x, spot.y);
    ck('theOrderItselfIsRefused', Units.assignTerraform(sp, 5, 0, 'dig') === false, '');
    UI.select('unit', sp.id); UI.terraMode = 'dig';
    UI.terraDrag = [{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 6, y: 0 }];
    UI.updateTerraGhost();
    const ghost = UI.terraGhost;
    ck('theGhostLaysNoMarkOnTheVoid',
      ghost.filter(t => t.ok).length === 1 && ghost.find(t => t.y === 1).ok === true,
      ghost.map(t => t.x + ',' + t.y + ':' + (t.ok ? 'ok' : 'no')).join(' '));
    UI.commitTerraDrag();
    const queued = (sp.jobs || []).concat(sp.task && sp.task.type === 'terraform' ? [sp.task] : []);
    ck('andNothingIsQueuedOutThere',
      queued.length === 1 && queued.every(j => MapGen.onBoard(j.x, j.y)),
      queued.map(j => j.x + ',' + j.y).join(' ') || 'nothing queued at all');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL SAPPER-FEES CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
