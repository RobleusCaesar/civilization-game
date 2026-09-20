import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.goto('file:///home/user/civilization-game/index.html');
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
const out = await p.evaluate(() => {
  const rows = [];
  CFG.W = CFG.H = CFG.SIZES.medium;
  for (let s = 5000; s < 5160; s++) {
    const g = MapGen.generate(String(s), 'moderate');
    const camps = [];
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) if (g.terrain[y * CFG.W + x] === T.CAMP) camps.push({ x, y });
    const pl = g.spawns.player, ai = g.spawns.ai;
    const dP = camps.map(c => Math.hypot(c.x - pl.x, c.y - pl.y)), dA = camps.map(c => Math.hypot(c.x - ai.x, c.y - ai.y));
    let mtn = 0, grass = 0; for (const v of g.terrain) { if (v === T.MOUNTAIN) mtn++; if (v === T.GRASS) grass++; }
    rows.push({ seed: s, landform: g.landform, variant: g.variant, camps: camps.length, minP: Math.min(...dP), minA: Math.min(...dA), near16P: dP.filter(d => d <= 16).length, near16A: dA.filter(d => d <= 16).length, mtn, grass });
  }
  return rows;
});
await b.close();
const by = {};
for (const r of out) (by[r.landform] = by[r.landform] || []).push(r);
const med = a => { a = [...a].sort((x, y) => x - y); return a[a.length >> 1]; };
for (const [lf, rs] of Object.entries(by)) {
  console.log(lf, 'n', rs.length, 'camps med', med(rs.map(r => r.camps)), 'minP med', med(rs.map(r => r.minP)).toFixed(1), 'minP<=14 share', (rs.filter(r => r.minP <= 14).length / rs.length).toFixed(2), 'minA med', med(rs.map(r => r.minA)).toFixed(1), 'near16P mean', (rs.reduce((a, r) => a + r.near16P, 0) / rs.length).toFixed(2), 'mtn med', med(rs.map(r => r.mtn)), 'grass med', med(rs.map(r => r.grass)));
}
