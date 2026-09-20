import { join } from 'node:path';
let pw; try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const [seed = '11', days = '60'] = process.argv.slice(2);
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 600, height: 500 } });
await p.goto('file://' + join('/home/user/civilization-game', 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
await p.evaluate(() => (window.Assets && Assets.whenIdle) ? Assets.whenIdle() : null);
const v = await p.evaluate(([seed, days]) => {
  let s = 777 >>> 0;
  Math.random = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  G.newGame(seed, 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = false; G.freeVis = false;
  Combat.scanT = 0; Units.herdClock = 0;
  const log = [];
  const STEP = 0.05, perDay = CFG.DAY_MS / 1000 / STEP;
  for (let d = 0; d < days && !S.over; d++) {
    for (let i = 0; i < perDay; i++) {
      const sdt = STEP, dtDays = sdt * 1000 / CFG.DAY_MS;
      G._safe(() => { S.dayT += sdt * 1000; let g2 = 0; while (S.dayT >= CFG.DAY_MS && g2++ < 4) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (!S || S.over) break; } }, 'day');
      if (!S || S.over) break;
      G._safe(() => Bld.update(dtDays), 'b'); G._safe(() => Units.update(sdt), 'u'); G._safe(() => Combat.update(sdt), 'c'); G._safe(() => G.dyingTick(sdt), 'w');
    }
    if (S.day % 10 === 0) {
      const ai = S.ai;
      log.push({ day: S.day, persona: ai.persona, posture: ai.posture, res: Object.fromEntries(Object.entries(ai.res).map(([k, v]) => [k, Math.round(v)])),
        goal: ai.goal && JSON.stringify(ai.goal).slice(0, 80), orderI: ai.orderI,
        blds: Bld.list('A').map(b => b.key + (b.construction > 0 ? '*' : '') + b.level).join(','),
        units: S.units.filter(u => u.owner === 'A').reduce((m, u) => (m[u.kind] = (m[u.kind] || 0) + 1, m), {}),
        anchor: !!(ai.read && ai.read.anchor), err: G.lastFrameError ? String(G.lastFrameError).slice(0, 200) : '' });
    }
  }
  return { log, card: S.draft && S.draft.rival && S.draft.rival.pick && S.draft.rival.pick.key, lastErr: G.lastFrameError ? String(G.lastFrameError) : '' };
}, [seed, +days]);
for (const l of v.log) console.log(JSON.stringify(l));
console.log('rival card', v.card, 'lastErr', v.lastErr.slice(0, 300));
await b.close();
