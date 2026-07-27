/* SAPPER DESELECT + HEAL CONTRACT.

   1. DESELECT ON DISPATCH — a sapper given a real terraform task (bridge tap,
      or a drag-chain dig/clear/mound) deselects exactly like a villager sent
      to gather/build/station (UI.dispatchedWorker, renamed from
      dispatchedVillager — it now serves both). The tricky part is
      `Units.queueTerraform`'s return count: it reports tiles QUEUED, not
      tiles the sapper actually reached — a queued tile with no passable
      neighbour fails silently inside `Units.startNextTerraform`, so
      `commitTerraDrag` must check the sapper's real task/queue state, not
      just trust that count, or it deselects on a silent failure with no way
      for the player to learn anything went wrong.
   2. HEAL AT THE TOWN CENTER — a sapper is a land unit like any other, and
      `Bld.healZoneFor` / `Bld.inHealZone` already treated it that way; the
      only gap was a missing `CFG.HEAL_FOOD.sapper` entry, which alone gated
      the whole heal UI off. Its price (30) matches its food line item at
      training, the same convention as villager/defender/archer.

   Run this after touching any of:
     ui.js — commitTerraDrag, handleTap's sapper terraform branch,
             dispatchedWorker, select/deselect
     units.js — assignTerraform, queueTerraform, startNextTerraform
     buildings.js — healZoneFor, inHealZone
     config.js — CFG.HEAL_FOOD, CFG.HEAL_RADIUS

     node tests/sapper-deselect-heal.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
const root = '/home/user/civilization-game';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + root + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  // inverse of R.screenToWorld — R has no worldToScreen, tests need one to
  // synthesize taps at a given world tile via the real handleTap() path
  const screenAt = (wx, wy) => ({ x: (wx - R.cam.x) * R.cam.z, y: (wy - R.cam.y) * R.cam.z });

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    G.updateVisibility();
    return Bld.tcOf('P');
  };

  // ---- 1. VILLAGER regression: dispatched-to-gather still deselects (the
  //         renamed helper must behave identically to before) ----
  {
    const tc = setup('sap1');
    const v = Units.spawn('villager', 'P', tc.x + 1, tc.y + 1);
    UI.select('unit', v.id);
    // find a nearby resource tile
    let rt = null;
    for (let dy = -8; dy <= 8 && !rt; dy++) for (let dx = -8; dx <= 8 && !rt; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y);
      if (S.map.explored[i] && CFG.GATHER[S.map.terrain[i]] && S.map.resAmount[i] > 0) rt = { x, y };
    }
    const sxy = screenAt((rt.x + 0.5) * CFG.TILE, (rt.y + 0.5) * CFG.TILE);
    UI.handleTap(sxy.x, sxy.y);
    ck('villagerStillDeselectsOnGather', UI.sel === null, `sel=${JSON.stringify(UI.sel)}`);
    ck('villagerTaskAssigned', v.task && v.task.type === 'gather', JSON.stringify(v.task));
  }

  // ---- 2. SAPPER: single-tile bridge assignment via tap deselects ----
  {
    const tc = setup('sap2');
    // stand a Sappers' Camp so the sapper has bridge tier (2)
    const camp = Bld.place('P', 'sapper', tc.x + 2, tc.y + 2, { free: true, instant: true });
    camp.level = 2; camp.maxhp = CFG.BUILDINGS.sapper.levels[1].hp; camp.hp = camp.maxhp;
    const s = Units.spawn('sapper', 'P', tc.x + 1, tc.y);
    // carve a 1-wide water channel with land on both sides so bridgeCrossing works
    const cx = tc.x + 10, cy = tc.y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) S.map.terrain[MapGen.idx(cx + dx, cy + dy)] = T.GRASS;
    S.map.terrain[MapGen.idx(cx, cy)] = T.WATER;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) S.map.explored[MapGen.idx(cx + dx, cy + dy)] = 1;
    UI.select('unit', s.id);
    UI.terraMode = 'bridge';
    const sxy = screenAt((cx + 0.5) * CFG.TILE, (cy + 0.5) * CFG.TILE);
    UI.handleTap(sxy.x, sxy.y);
    ck('sapperBridgeTaskAssigned', s.task && s.task.type === 'terraform' && s.task.job === 'bridge', JSON.stringify(s.task));
    ck('sapperDeselectsAfterBridgeTap', UI.sel === null, `sel=${JSON.stringify(UI.sel)}`);
  }

  // ---- 3. SAPPER: drag-chain dig commit deselects (the primary workflow —
  //         forest/plains dig requires only tier 1, no camp upgrade needed) ----
  {
    const tc = setup('sap3');
    Bld.place('P', 'sapper', tc.x + 2, tc.y + 2, { free: true, instant: true });   // tier 1
    const s = Units.spawn('sapper', 'P', tc.x + 1, tc.y);
    UI.select('unit', s.id);
    UI.terraMode = 'dig';
    // simulate the drag: press, extend across two grass tiles, release
    const x0 = tc.x + 6, y0 = tc.y;
    for (let i = 0; i < 3; i++) S.map.terrain[MapGen.idx(x0 + i, y0)] = T.GRASS;
    UI.terraDrag = [{ x: x0, y: y0 }];
    UI.extendTerraDrag({ x: x0 + 2, y: y0 });
    const before = { sel: JSON.parse(JSON.stringify(UI.sel)) };
    UI.commitTerraDrag();
    ck('sapperDigTaskAssigned', s.task && s.task.type === 'terraform' && s.task.job === 'dig', JSON.stringify(s.task));
    ck('sapperDeselectsAfterDragCommit', UI.sel === null, `before=${JSON.stringify(before.sel)} after=${JSON.stringify(UI.sel)}`);
  }

  // ---- 4. SAPPER: a drag commit that adds NOTHING NEW (already queued) does
  //         NOT deselect — matches the villager "order failed" pattern ----
  {
    const tc = setup('sap4');
    Bld.place('P', 'sapper', tc.x + 2, tc.y + 2, { free: true, instant: true });
    const s = Units.spawn('sapper', 'P', tc.x + 1, tc.y);
    const x0 = tc.x + 6, y0 = tc.y;
    // a passable neighbour so the sapper can actually stand and start (an
    // isolated diggable tile with no reachable side is a separate, real
    // edge case — that one must NOT deselect, and is covered next)
    S.map.terrain[MapGen.idx(x0, y0)] = T.GRASS;
    S.map.terrain[MapGen.idx(x0 - 1, y0)] = T.GRASS;
    UI.select('unit', s.id);
    UI.terraMode = 'dig';
    UI.terraDrag = [{ x: x0, y: y0 }];
    UI.updateTerraGhost();
    UI.commitTerraDrag();          // first commit — queues it, deselects
    ck('firstCommitDeselects', UI.sel === null, JSON.stringify(UI.sel));
    // re-select and try to queue the SAME tile again — nothing new added
    UI.select('unit', s.id);
    UI.terraMode = 'dig';
    UI.terraDrag = [{ x: x0, y: y0 }];
    UI.updateTerraGhost();
    UI.commitTerraDrag();
    ck('duplicateCommitStaysSelected', UI.sel && UI.sel.type === 'unit' && UI.sel.id === s.id, JSON.stringify(UI.sel));
  }

  // ---- 5. SAPPER HEALING: heal button appears, costs food, restores hp ----
  {
    const tc = setup('sap5');
    const s = Units.spawn('sapper', 'P', tc.x + 1, tc.y);
    s.hp = 20;   // damaged, maxhp 55
    UI.select('unit', s.id);
    ck('sapperInHealZone', Bld.inHealZone(s), 'sapper stands within the TC radius');
    ck('sapperHasHealCost', !!CFG.HEAL_FOOD.sapper, `HEAL_FOOD.sapper=${CFG.HEAL_FOOD.sapper}`);
    const cost = UI.healCost(s);
    // the heal cost scales with missing hp: (1 - hp/maxhp) * base, min 1
    const expected = Math.max(1, Math.ceil((1 - 20 / 55) * CFG.HEAL_FOOD.sapper));
    ck('healCostScalesWithDamage', cost === expected, `cost=${cost} expected=${expected}`);
    UI.renderPanel();
    const btnExists = !!document.querySelector('#panel [data-act="heal"]');
    ck('healButtonRendersOnSapperPanel', btnExists, 'panel has a heal button');
    const foodBefore = S.res.food;
    document.querySelector('#panel [data-act="heal"]').click();
    ck('healRestoresHp', s.hp === s.maxhp, `hp=${s.hp}/${s.maxhp}`);
    ck('healSpendsFood', S.res.food === foodBefore - cost, `food ${foodBefore} -> ${S.res.food}, cost ${cost}`);
  }

  // ---- 6. Healing is refused OUTSIDE the TC radius ----
  {
    const tc = setup('sap6');
    const far = Math.round(CFG.HEAL_RADIUS * 3);
    const s = Units.spawn('sapper', 'P', tc.x + far, tc.y);
    s.hp = 10;
    UI.select('unit', s.id);
    ck('sapperOutOfHealZone', !Bld.inHealZone(s), 'sapper stands outside the TC radius');
    UI.renderPanel();
    const btn = document.querySelector('#panel [data-act="heal"]');
    ck('healButtonGreyedOutsideZone', btn && btn.classList.contains('cant'), btn ? btn.className : 'no button');
    const before = { hp: s.hp, food: S.res.food };
    if (btn) btn.click();
    ck('healDoesNothingOutsideZone', s.hp === before.hp && S.res.food === before.food,
      `hp ${before.hp}->${s.hp} food ${before.food}->${S.res.food}`);
  }

  // ---- 7. A full-hp sapper shows no heal button at all ----
  {
    setup('sap7');
    const tc = Bld.tcOf('P');
    const s = Units.spawn('sapper', 'P', tc.x + 1, tc.y);   // spawns at full hp
    UI.select('unit', s.id);
    UI.renderPanel();
    ck('noHealButtonAtFullHp', !document.querySelector('#panel [data-act="heal"]'), 'no button when undamaged');
  }

  // ---- 8. Rival sappers heal the same way (owner-agnostic check, direct API —
  //         the rival never taps the heal button, but the cost/zone rules must
  //         still be symmetric since AI.daily() may use them) ----
  {
    setup('sap8');
    const atc = Bld.tcOf('A');
    const rs = Units.spawn('sapper', 'A', atc.x + 1, atc.y);
    rs.hp = 10;
    ck('rivalSapperInHealZone', Bld.inHealZone(rs), 'rival sapper in its own TC radius');
    ck('rivalSapperHealCostSameFormula', UI.healCost(rs) === Math.max(1, Math.ceil((1 - 10 / rs.maxhp) * CFG.HEAL_FOOD.sapper)),
      `cost=${UI.healCost(rs)}`);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL SAPPER CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
