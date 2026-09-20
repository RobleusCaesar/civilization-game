// Generation stats per landform: is Highlands giving the player a workable seat?
//   node gen-stats.mjs <size> <seedsPerLandform>
import { join } from 'node:path';
let pw; try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = '/home/user/civilization-game';
const [size = 'medium', nS = '20'] = process.argv.slice(2);
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 600, height: 500 } });
await p.goto('file://' + join(root, 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
const rows = await p.evaluate(([size, n]) => {
  const out = [];
  const want = { valley: n, lakeland: n, highlands: n, islands: n };
  let seed = 1000;
  while (Object.values(want).some(v => v > 0) && seed < 1000 + n * 40) {
    seed++;
    CFG.W = CFG.H = CFG.SIZES[size];
    const g = MapGen.generate(String(seed));
    if (!want[g.landform]) continue;
    want[g.landform]--;
    const W = CFG.W, H = CFG.H, t = g.terrain;
    const id = (x, y) => y * W + x;
    const blocked = i => Path.blocksLand(t[i]);
    // largest walkable body + membership of both seats' doorsteps
    const seen = new Uint8Array(W * H); let big = 0, bigSet = null;
    for (let i0 = 0; i0 < W * H; i0++) {
      if (seen[i0] || blocked(i0)) continue;
      const q = [i0]; seen[i0] = 1; const set = [];
      for (let h = 0; h < q.length; h++) { const c = q[h]; set.push(c); const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue; const ni = id(nx, ny); if (seen[ni] || blocked(ni)) continue; seen[ni] = 1; q.push(ni); } }
      if (set.length > big) { big = set.length; bigSet = new Set(set); }
    }
    const walk = (W - 2) * (H - 2) - Array.from(t).filter((v, i) => blocked(i)).length;
    const sp = g.spawns; const pl = sp.player, ai = sp.ai;
    const inBig = (s) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = s.x + dx, y = s.y + dy; if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && bigSet.has(id(x, y))) return true; } return false; };
    // BFS land distance seat to seat
    const dist = (a, c) => { const d = new Int32Array(W * H).fill(-1); const q = []; for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) { const x = a.x + dx, y = a.y + dy; if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && !blocked(id(x, y))) { d[id(x, y)] = 0; q.push(id(x, y)); } }
      for (let h = 0; h < q.length; h++) { const cur = q[h]; const cx = cur % W, cy = (cur / W) | 0; if (Math.abs(cx - c.x) <= 3 && Math.abs(cy - c.y) <= 3) return d[cur];
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue; const ni = id(nx, ny); if (d[ni] >= 0 || blocked(ni)) continue; d[ni] = d[cur] + 1; q.push(ni); } }
      return -1; };
    const near = (s, type, r) => { let c = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = s.x + dx, y = s.y + dy; if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && t[id(x, y)] === type && Math.hypot(dx, dy) <= r) c++; } return c; };
    const reachNear = (s, type, r) => { let c = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = s.x + dx, y = s.y + dy; if (!(x > 0 && y > 0 && x < W - 1 && y < H - 1) || t[id(x, y)] !== type || Math.hypot(dx, dy) > r) continue;
      // a resource tile counts when an open tile beside it is in the seat's body
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + ox, ny = y + oy; if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && bigSet.has(id(nx, ny))) { c++; break; } } } return c; };
    const mtnNear = near(pl, T.MOUNTAIN, 10), waterNear = near(pl, T.WATER, 10);
    const camps = (g.camps || []).length;
    const campD = (g.camps || []).reduce((m, c) => Math.min(m, Math.hypot(c.x - pl.x, c.y - pl.y)), 1e9);
    out.push({ seed, landform: g.landform, variant: g.variant, scarce: g.scarce && g.scarce.name,
      walk, big, bigShare: +(big / walk).toFixed(3), plIn: inBig(pl), aiIn: inBig(ai),
      crow: +Math.hypot(pl.x - ai.x, pl.y - ai.y).toFixed(1), land: dist(pl, ai),
      forest14: reachNear(pl, T.FOREST, 14), hills14: reachNear(pl, T.HILLS, 14), fertile14: reachNear(pl, T.FERTILE, 14), gold: Array.from(t).filter(v => v === T.GOLDORE).length,
      mtn10: mtnNear, water10: waterNear, camps, campD: campD === 1e9 ? null : +campD.toFixed(1) });
  }
  return out;
}, [size, +nS]);
console.log(JSON.stringify(rows));
await b.close();
