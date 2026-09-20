// Phase 4 balance harness: headless runs with a SCRIPTED player of a given
// skill, measuring when the rival first raids, when a wave first lands, when
// the hall falls, and the outcome by day N.
//   node balance-sim.mjs <mode> <size> <style> <days> <seed,seed,...> [out.jsonl]
// style: none (touch nothing) | econ (villagers + houses + stations, no army)
//        | basic (econ + barracks, defenders on Defend, a tower)
import { join } from 'node:path';
import { appendFileSync } from 'node:fs';
let pw; try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = process.env.SIM_ROOT || '/home/user/civilization-game';
const [mode = 'moderate', size = 'large', style = 'basic', daysS = '250', seedsS = '1,2,3', out = ''] = process.argv.slice(2);
const days = +daysS, seeds = seedsS.split(',');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });   // PNG art must not taint the canvases the mountain layer reads
const p = await b.newPage({ viewport: { width: 600, height: 500 } });
p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
await p.goto('file://' + join(root, 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
await p.evaluate(() => (window.Assets && Assets.whenIdle) ? Assets.whenIdle() : null);

// SIM_OVER: a JS snippet run in the page before every G.newGame — dial overrides
// on CFG / AI.PERSONAS for A/B runs (e.g. "CFG.MODES.moderate.aiHarass=14")
const over = process.env.SIM_OVER || '';
for (const seed of seeds) {
  const v = await p.evaluate(async ([seed, mode, size, style, days, over]) => {
    const out = { seed, mode, size, style, over };
    try {
      if (over) new Function(over)();
      // seed Math.random too (the raider-camps trick) and re-zero the module clocks
      let s = 777 >>> 0;
      Math.random = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      G.newGame(seed, mode, size);
      Screens._demo = false; Screens.show('playing'); S.paused = false; G.freeVis = false;
      Combat.scanT = 0; Units.herdClock = 0;
      out.persona = S.ai.persona; out.landform = S.map.landform; out.variant = S.map.variant;
      out.card = (S.draft && S.draft.hand && S.draft.hand[S.draft.pickI || 0] || {}).key || null;
      const tcP0 = Bld.tcOf('P');
      const marks = { raid: 0, raidN: 0, raidPosture: '', wave: 0, tcFell: 0, pArmyAtRaid: 0, aArmyAtRaid: 0, firstHit: 0, barracks: 0 };
      const hist = [];
      const isMil = u => Units.isMilitary(u) && !Units.isNaval(u);
      const armyOf = o => S.units.filter(u => u.owner === o && isMil(u)).length;

      // ---------- the scripted player ----------
      const near = (type, r) => {
        const tc = Bld.tcOf('P'); if (!tc) return null;
        const cx = Bld.cx(tc), cy = Bld.cy(tc); let best = null, bd = 1e9;
        for (let y = Math.max(1, cy - r | 0); y < Math.min(CFG.H - 1, cy + r); y++)
          for (let x = Math.max(1, cx - r | 0); x < Math.min(CFG.W - 1, cx + r); x++) {
            const i = y * CFG.W + x;
            if (S.map.terrain[i] !== type) continue;
            if (S.map.resAmount && !(S.map.resAmount[i] > 0)) continue;
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d < bd) { bd = d; best = { x, y }; }
          }
        return best;
      };
      const placeNear = (key, rMax) => {
        const tc = Bld.tcOf('P'); if (!tc) return null;
        const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0;
        for (let r = 2; r <= (rMax || 8); r++)
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = cx + dx, y = cy + dy;
            if (!MapGen.onBoard(x, y)) continue;
            const c = Bld.canPlace('P', key, x, y);
            if (c && c.ok) return Bld.place('P', key, x, y) || null;
          }
        return null;
      };
      const placeOn = (key, terr, rMax) => {
        const tc = Bld.tcOf('P'); if (!tc) return null;
        const cx = Bld.cx(tc), cy = Bld.cy(tc);
        for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++) {
          if (S.map.terrain[y * CFG.W + x] !== terr) continue;
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rMax) continue;
          const c = Bld.canPlace('P', key, x, y);
          if (c && c.ok) return Bld.place('P', key, x, y) || null;
        }
        return null;
      };
      // ONE SITE AT A TIME, with a builder sent to it: the first cut laid a
      // house every day the cap was near and drained the wood into 20 sites
      const lay = (key, how, arg) => {
        if (Bld.list('P').some(b => b.construction > 0)) return null;
        if (!Bld.canAfford(Bld.effCost('P', key))) return null;
        const b = how === 'on' ? placeOn(key, arg, 14) : placeNear(key, arg);
        if (b) { const u = Units.nearestIdleVillager(b.x, b.y) || S.units.find(o => o.owner === 'P' && Units.isVillager(o) && o.task && o.task.type === 'gather'); if (u) Units.assignBuild(u, b); }
        return b;
      };
      const bot = () => {
        if (style === 'none') return;
        const tc = Bld.tcOf('P'); if (!tc) return;
        const res = S.res;
        const vils = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
        // stations first: crew any finished plot with room
        for (const st of Bld.list('P')) {
          if (!st.construction && CFG.BUILDINGS[st.key].needsWorker && Bld.workersAssigned(st) < Bld.maxWorkers(st)) {
            const u = Units.nearestIdleVillager(st.x, st.y);
            if (u) { u.task = { type: 'work', id: st.id }; u.tUnit = 0; u.tBld = 0; Units.setPath(u, st.x, st.y); }
          }
        }
        // a site with nobody on it gets a hand
        for (const site of Bld.list('P')) {
          if (!(site.construction > 0)) continue;
          if (S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'build' && u.task.id === site.id)) continue;
          const u = Units.nearestIdleVillager(site.x, site.y) || S.units.find(o => o.owner === 'P' && Units.isVillager(o) && o.task && o.task.type === 'gather');
          if (u) Units.assignBuild(u, site);
        }
        // gatherers by need: a third on wood always, food when the larder is low, stone for the barracks
        const idle = vils.filter(u => !u.task && !u.tUnit);
        const onWood = vils.filter(u => u.task && u.task.type === 'gather' && u.task.res === 'wood').length;
        const want = [];
        if (onWood < Math.max(1, Math.ceil(vils.length / 3))) want.push(T.FOREST);
        // FOOD FIRST when the larder is thin: a starving town's soldiers desert
        if (res.food < 300) want.unshift(T.FERTILE);
        if (res.food < 120) want.unshift(T.FERTILE);
        if (res.stone < 120 && S.day >= 5) want.push(T.HILLS);
        want.push(T.FOREST, T.FERTILE);
        idle.forEach((u, i) => {
          for (let k = 0; k < want.length; k++) {
            const t = near(want[(i + k) % want.length], 16);
            if (t && Units.assignGather(u, t.x, t.y)) break;
          }
        });
        // hands: train while there is room and food to spare
        if (Units.popUsed('P') < Bld.popCap('P') && res.food >= 110 && vils.length < 14 && !(tc.queue && tc.queue.length)) Bld.train(tc, 'villager');
        if (style !== 'econ') {
          // the army first once the town has hands: a barracks from day 8
          let bar = Bld.list('P').find(b => b.key === 'barracks');
          if (!bar && S.day >= 8 && vils.length >= 4) { bar = lay('barracks', 'near', 8); if (bar) marks.barracks = S.day; }
          if (bar && !bar.construction) {
            const target = Math.min(10, 3 + Math.floor(S.day / 25));
            if (armyOf('P') + (bar.queue ? bar.queue.length : 0) < target && Units.popUsed('P') < Bld.popCap('P') && !(bar.queue && bar.queue.length >= 2))
              Bld.train(bar, 'defender');
            if (S.day >= 20 && !Bld.list('P').some(b => b.key === 'tower')) lay('tower', 'near', 6);
          }
          for (const u of S.units) if (u.owner === 'P' && isMil(u) && !u.defend && !u.task) Units.setDefend(u, true);
        }
        // roofs when the cap is near (a barracks in the queue outranks a roof)
        if (Bld.popCap('P') - Units.popUsed('P') <= 1) lay('house', 'near', 7);
        // stations on worked ground
        if (Bld.list('P').filter(b => b.key === 'lumber').length < 2) lay('lumber', 'on', T.STUMPS);
        // farms scale with the mouths: one per four hands, at least two, six at most
        if (Bld.list('P').filter(b => b.key === 'farm').length < Math.min(6, Math.max(2, Math.ceil((vils.length + armyOf('P')) / 4)))) lay('farm', 'on', T.BARREN);
        if (Bld.list('P').filter(b => b.key === 'quarry').length < 1) lay('quarry', 'on', T.PEBBLES);
        if (style !== 'good') return;
        /* GOOD: a competent human. Grows to 18 hands, upgrades the hall and
           the stations when it can, keeps a tower, fields up to 14 soldiers,
           and — the part the basic bot never does — WINS: once the army is
           10 strong it marches on the rival hall (the harness knows where it
           is; a human would have scouted), and on Calm it lays the Wonder the
           day it can pay for it. */
        const tcA = Bld.tcOf('A');
        if (vils.length < 18 && Units.popUsed('P') < Bld.popCap('P') && res.food >= 110 && !(tc.queue && tc.queue.length)) Bld.train(tc, 'villager');
        const up = Bld.canUpgrade(tc); if (up && up.ok && !tc.upgrading) Bld.upgrade(tc);
        for (const st of Bld.list('P')) if (CFG.BUILDINGS[st.key].needsWorker && !st.construction && !st.upgrading && st.level < 3 && res.wood > 400 && res.stone > 200) { const u2 = Bld.canUpgrade(st); if (u2 && u2.ok) { Bld.upgrade(st); break; } }
        const bar2 = Bld.list('P').find(b => b.key === 'barracks' && !b.construction);
        if (bar2 && armyOf('P') + (bar2.queue ? bar2.queue.length : 0) < 14 && Units.popUsed('P') < Bld.popCap('P') && !(bar2.queue && bar2.queue.length >= 2) && res.food > 200) Bld.train(bar2, 'defender');
        if (S.peace && UI.wonderOffered && UI.wonderOffered() && !Bld.list('P').some(b => b.key === 'wonder') && Bld.canAfford(Bld.effCost('P', 'wonder'))) {
          const w = placeNear('wonder', 10); if (w) { marks.wonderLaid = S.day; const u = Units.nearestIdleVillager(w.x, w.y); if (u) Units.assignBuild(u, w); }
        }
        if (tcA && !S.peace && S.day >= 60 && armyOf('P') >= 10 && !marks.marched) {
          marks.marched = S.day;
          for (const u of S.units) if (u.owner === 'P' && isMil(u)) { Units.setDefend(u, false); Units.orderAttackBuilding(u, tcA); }
        }
      };

      // ---------- the fixed-step loop ----------
      const STEP = 0.05, perDay = CFG.DAY_MS / 1000 / STEP;
      let lastDay = S.day;
      for (let d = 0; d < days && !S.over; d++) {
        G._safe(() => bot(), 'bot');
        for (let i = 0; i < perDay; i++) {
          const sdt = STEP, dtDays = sdt * 1000 / CFG.DAY_MS;
          G._safe(() => { S.dayT += sdt * 1000; let g2 = 0;
            while (S.dayT >= CFG.DAY_MS && g2++ < 4) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (!S || S.over) break; } }, 'day');
          if (!S || S.over) break;
          G._safe(() => Bld.update(dtDays), 'b'); G._safe(() => Units.update(sdt), 'u');
          G._safe(() => Combat.update(sdt), 'c'); G._safe(() => G.dyingTick(sdt), 'w');
          // event marks, read every step so a raid launched mid-day is caught on its day
          if (!marks.raid && S.ai && S.ai.raidDay) { marks.raid = S.ai.raidDay; marks.raidN = S.ai.raidN || 0; marks.raidPosture = S.ai.posture; marks.pArmyAtRaid = armyOf('P'); marks.aArmyAtRaid = armyOf('A'); }
          if (!marks.wave && S.wave && S.wave.lastDay) marks.wave = S.wave.lastDay;
          // every raid launch and every wave, as a log
          if (S.ai && S.ai.raidDay && S.ai.raidDay !== marks._lastRaidDay) {
            marks._lastRaidDay = S.ai.raidDay;
            const kinds = {}; for (const u of S.units) if (u.owner === 'A' && u.task && u.task.type === 'raid') kinds[u.kind] = (kinds[u.kind] || 0) + 1;
            (marks.raids = marks.raids || []).push({ day: S.ai.raidDay, n: S.ai.raidN || 0, posture: S.ai.posture, lane: S.ai.raidLane, obj: S.ai.raidObj && S.ai.raidObj.type, kinds, pArmy: armyOf('P'), vuln: !!(S.ai.read && S.ai.read.foeVuln) });
          }
          if (S.wave && S.wave.count !== marks._waveCount) {
            marks._waveCount = S.wave.count;
            const rs = S.units.filter(u => u.owner === 'R' && !u.campId).length;
            (marks.waves = marks.waves || []).push({ day: S.day, count: S.wave.count, loose: rs });
          }
          const tcP = Bld.tcOf('P');
          if (!marks.firstHit && tcP && tcP.hp < tcP.maxhp * 0.98) marks.firstHit = S.day;
          if (!marks.tcFell && !tcP) marks.tcFell = S.day;
        }
        if (S.day !== lastDay || d === 0) {
          lastDay = S.day;
          if (S.day % 10 === 0 || d === 0) hist.push({ day: S.day, vil: S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length,
            pArmy: armyOf('P'), aArmy: armyOf('A'), pBld: Bld.list('P').filter(b => !(b.construction > 0)).length, sites: Bld.list('P').filter(b => b.construction > 0).length, aBld: Bld.list('A').length,
            food: Math.round(S.res.food), wood: Math.round(S.res.wood), stone: Math.round(S.res.stone), posture: S.ai && S.ai.posture,
            tcHp: (Bld.tcOf('P') || {}).hp || 0 });
        }
      }
      out.over = S.over ? (S.over.win ? 'won' : 'lost') : 'undecided';
      out.overMsg = S.over ? S.over.msg : '';
      out.endDay = S.day; out.marks = marks; out.hist = hist;
      out.err = G.lastFrameError ? String(G.lastFrameError) : '';
    } catch (e) { out.thrown = String(e && e.stack || e); }
    return out;
  }, [seed, mode, size, style, days, over]);
  const line = JSON.stringify(v);
  console.log(line.slice(0, 600));
  if (out) appendFileSync(out, line + '\n');
}
await b.close();
