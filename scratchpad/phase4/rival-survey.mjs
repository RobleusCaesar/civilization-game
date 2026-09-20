import { join } from 'node:path';
import { appendFileSync } from 'node:fs';
let pw; try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const [mode = 'moderate', seedsS = '11', days = '100', out = ''] = process.argv.slice(2);
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 600, height: 500 } });
await p.goto('file://' + join('/home/user/civilization-game', 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
await p.evaluate(() => (window.Assets && Assets.whenIdle) ? Assets.whenIdle() : null);
for (const seed of seedsS.split(',')) {
  const v = await p.evaluate(([seed, mode, days]) => {
    let s = 777 >>> 0;
    Math.random = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    G.newGame(seed, mode, 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = false; G.freeVis = false;
    Combat.scanT = 0; Units.herdClock = 0;
    const STEP = 0.05, perDay = CFG.DAY_MS / 1000 / STEP;
    const snap = (d) => { const ai = S.ai; return { d, vil: S.units.filter(u => u.owner === 'A' && Units.isVillager(u)).length, army: S.units.filter(u => u.owner === 'A' && Units.isMilitary(u) && !Units.isNaval(u)).length,
      food: Math.round(ai.res.food), wood: Math.round(ai.res.wood), gold: Math.round(ai.res.gold), blds: Bld.list('A').length, food0days: ai._food0 || 0, posture: ai.posture }; };
    const snaps = []; let food0 = 0;
    for (let d = 0; d < days && !S.over; d++) {
      for (let i = 0; i < perDay; i++) {
        const sdt = STEP, dtDays = sdt * 1000 / CFG.DAY_MS;
        G._safe(() => { S.dayT += sdt * 1000; let g2 = 0; while (S.dayT >= CFG.DAY_MS && g2++ < 4) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (!S || S.over) break; } }, 'day');
        if (!S || S.over) break;
        G._safe(() => Bld.update(dtDays), 'b'); G._safe(() => Units.update(sdt), 'u'); G._safe(() => Combat.update(sdt), 'c'); G._safe(() => G.dyingTick(sdt), 'w');
      }
      if (S.ai.res.food <= 1) food0++;
      if (S.day % 25 === 0) snaps.push(snap(S.day));
    }
    return { seed, mode, card: S.draft && S.draft.rival && S.draft.rival.pick && S.draft.rival.pick.key, persona: S.ai.persona, food0days: food0, snaps, over: S.over ? (S.over.win ? 'won' : 'lost') : '' };
  }, [seed, mode, +days]);
  const line = JSON.stringify(v); console.log(line.slice(0, 400)); if (out) appendFileSync(out, line + '\n');
}
await b.close();
