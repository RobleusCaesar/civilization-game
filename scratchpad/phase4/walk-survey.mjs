import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.goto('file:///home/user/civilization-game/index.html');
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
const out = await p.evaluate(() => {
  const rows = [];
  CFG.W = CFG.H = CFG.SIZES.medium; const W = CFG.W, H = CFG.H;
  const BLOCKS = v => v === T.WATER || v === T.MOUNTAIN || v === T.FOREST || v === T.HILLS || v === T.FERTILE;
  const walkFrom = (t, sx, sy) => {
    const d = new Int16Array(W * H).fill(-1); const q = [sy * W + sx]; d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h], cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx;
        if (d[ni] >= 0 || BLOCKS(t[ni])) continue;
        if (dx && dy && (BLOCKS(t[cy * W + nx]) || BLOCKS(t[ny * W + cx]))) continue;
        d[ni] = d[cur] + 1; q.push(ni);
      }
    }
    return d;
  };
  for (let s = 5000; s < 5120; s++) {
    const g = MapGen.generate(String(s), 'moderate'); const t = g.terrain;
    for (const [who, st] of [['P', g.spawns.player], ['A', g.spawns.ai]]) {
      const d = walkFrom(t, st.x, st.y + 2);
      const r = { seed: s, who, landform: g.landform };
      for (const [nm, rt] of [['forest', T.FOREST], ['hills', T.HILLS], ['fertile', T.FERTILE]]) {
        let crow = 0, walk = 0, walk18 = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          if (t[y * W + x] !== rt || Math.hypot(x - st.x, y - st.y) > 14) continue;
          let best = 1e9;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = d[(y + dy) * W + x + dx]; if (w >= 0 && w < best) best = w; }
          if (best === 1e9) continue;
          crow++; if (best <= 14) walk++; if (best <= 18) walk18++;
        }
        r[nm] = [crow, walk, walk18];
      }
      rows.push(r);
    }
  }
  return rows;
});
await b.close();
const by = {};
for (const r of out) (by[r.landform] = by[r.landform] || []).push(r);
for (const [lf, rs] of Object.entries(by)) {
  const line = [lf, 'seats', rs.length];
  for (const nm of ['forest', 'hills', 'fertile']) {
    const crow = rs.reduce((a, r) => a + r[nm][0], 0), walk = rs.reduce((a, r) => a + r[nm][1], 0);
    const shortCrow = rs.filter(r => r[nm][0] < 3).length, shortWalk = rs.filter(r => r[nm][1] < 3).length, shortWalk18 = rs.filter(r => r[nm][2] < 3).length;
    line.push(`${nm}: crow-total ${crow} walk14-total ${walk} (${(100 * walk / crow).toFixed(0)}%) seats<3 crow ${shortCrow} walk14 ${shortWalk} walk18 ${shortWalk18}`);
  }
  console.log(line.join(' | '));
}
