/* ISLAND MAPS CONTRACT — the generator may now roll GENUINELY separated
   landmasses, and the reachability clamp's verdict is LAND OR SEA. What this
   pins:

   1. THE SEA IS NEVER BULLDOZED for a resource: on every map the clamp's
      carves ran along dry ground only — a genuinely divided map stays
      divided, and gen.spawns.seaStarts says so.
   2. THE SEA VERDICT IS COMPLETE: whenever seaStarts is set, the two seats
      stand on different landmasses, BOTH have a dock-capable coast (a 2×2 of
      open on-board water in a ≥ CFG.DOCK_MIN_WATER body flanked by their own
      open ground) on ONE SHARED body, and both islands clear the viability
      floor (≥ 70 land tiles).
   3. NOBODY IS STRANDED: every seat — divided or not — still gets the
      standing resource guarantee (three harvestable tiles of each gatherable
      kind within reach) and at least one reachable gold seam of its own.
   4. DETERMINISM: the same seed generates the same map, twice, byte for
      byte — the sea verdict is a pure function of the roll.
   5. THE MIX IS REAL: across the sweep some islands maps are genuinely
      sea-divided and some are isthmus-joined — never all one, never all the
      other.

   Run after touching MapGen.generate's islands branch, the reachability
   clamp (carveWalk/carveDry/carveSea, dockBodies, the viability floor), or
   the gold-seam pass.

     node tests/island-maps.mjs      # exits non-zero on any regression */
let pw;
try { pw = (await import('playwright')).default ?? await import('playwright'); }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

const p = await b.newPage({ viewport: { width: 600, height: 500 } });
p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
await p.goto('file://' + join(root, 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 20000 });

const v = await p.evaluate(() => {
  const out = { rows: [], determinism: true };
  const analyze = (seed, size) => {
    CFG.W = CFG.H = CFG.SIZES[size];
    const gen = MapGen.generate(seed, 'moderate');
    const t = gen.terrain, W = CFG.W, H = CFG.H;
    const idx = (x, y) => y * W + x;
    // landmass labels
    const lab = new Int32Array(W * H).fill(-1);
    const areas = [];
    for (let i = 0; i < W * H; i++) {
      if (t[i] === T.WATER || lab[i] >= 0) continue;
      const q = [i]; lab[i] = areas.length;
      let n = 0;
      for (let h = 0; h < q.length; h++) {
        const cur = q[h], cx = cur % W, cy = (cur / W) | 0;
        n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = idx(nx, ny);
          if (lab[ni] >= 0 || t[ni] === T.WATER) continue;
          lab[ni] = lab[i]; q.push(ni);
        }
      }
      areas.push(n);
    }
    // water bodies
    const wlab = new Int32Array(W * H).fill(-1);
    const wsize = [];
    for (let i = 0; i < W * H; i++) {
      if (t[i] !== T.WATER || wlab[i] >= 0) continue;
      const q = [i]; wlab[i] = wsize.length;
      let n = 0;
      for (let h = 0; h < q.length; h++) {
        const cur = q[h], cx = cur % W, cy = (cur / W) | 0;
        n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = idx(nx, ny);
          if (wlab[ni] >= 0 || t[ni] !== T.WATER) continue;
          wlab[ni] = wlab[i]; q.push(ni);
        }
      }
      wsize.push(n);
    }
    const BLOCKS = v2 => v2 === T.WATER || v2 === T.MOUNTAIN || v2 === T.FOREST || v2 === T.HILLS || v2 === T.FERTILE;
    const dockBodies = (lm) => {
      const MINW = CFG.DOCK_MIN_WATER || 6;
      const setB = new Set();
      for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) {
        let wet = true, body = -1;
        for (let dy = 0; dy < 2 && wet; dy++) for (let dx = 0; dx < 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!MapGen.onBoard(nx, ny) || t[idx(nx, ny)] !== T.WATER) { wet = false; break; }
          body = wlab[idx(nx, ny)];
        }
        if (!wet || body < 0 || wsize[body] < MINW || setB.has(body)) continue;
        for (const [fx, fy] of [[x - 1, y], [x - 1, y + 1], [x + 2, y], [x + 2, y + 1],
                                [x, y - 1], [x + 1, y - 1], [x, y + 2], [x + 1, y + 2]]) {
          if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
          if (lab[idx(fx, fy)] === lm && !BLOCKS(t[idx(fx, fy)])) { setB.add(body); break; }
        }
      }
      return setB;
    };
    const walk = (s) => {
      const seen = new Uint8Array(W * H), q = [idx(s.x, s.y)];
      seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const cur = q[h], cx = cur % W, cy = (cur / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = idx(nx, ny);
          if (seen[ni] || BLOCKS(t[ni])) continue;
          seen[ni] = 1; q.push(ni);
        }
      }
      return seen;
    };
    const P = gen.spawns.player, A = gen.spawns.ai;
    const guarantee = (s) => {
      const sr = walk(s);
      const short = [];
      for (const rt of [T.FOREST, T.HILLS, T.FERTILE]) {
        let n = 0;
        for (let y = 1; y < H - 1 && n < 3; y++) for (let x = 1; x < W - 1 && n < 3; x++) {
          if (t[idx(x, y)] !== rt) continue;
          if (Math.hypot(x - s.x, y - s.y) > CFG.START_RESOURCE.r * 2) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            if (sr[idx(x + dx, y + dy)]) { n++; break; }
        }
        if (n < 3) short.push('T' + rt + ':' + n);
      }
      let gold = 0;
      for (let i = 0; i < W * H; i++) {
        if (t[i] !== T.GOLDORE) continue;
        const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && sr[idx(x + dx, y + dy)]) { gold++; break; }
      }
      if (gold < 1) short.push('gold:0');
      return short;
    };
    const pl = lab[idx(P.x, P.y)], al = lab[idx(A.x, A.y)];
    const pb = dockBodies(pl), ab = dockBodies(al);
    let sharedOcean = false;
    for (const b2 of pb) if (ab.has(b2)) { sharedOcean = true; break; }
    return {
      seed, size, landform: gen.landform,
      seaStarts: !!gen.spawns.seaStarts,
      sameLand: pl === al,
      areaP: areas[pl], areaA: areas[al],
      sharedOcean, dockP: pb.size > 0, dockA: ab.size > 0,
      shortP: guarantee(P), shortA: guarantee(A),
    };
  };
  const SEEDS = [];
  for (let i = 1; i <= 24; i++) SEEDS.push('isl' + i);
  for (const seed of SEEDS) for (const size of ['medium', 'large', 'xlarge'])
    out.rows.push(analyze(seed, size));
  // determinism: three fixed rolls, generated twice
  for (const [seed, size] of [['isl3', 'medium'], ['isl7', 'xlarge'], ['verify7', 'large']]) {
    CFG.W = CFG.H = CFG.SIZES[size];
    const a = MapGen.generate(seed, 'moderate').terrain.join(',');
    const b2 = MapGen.generate(seed, 'moderate').terrain.join(',');
    if (a !== b2) out.determinism = false;
  }
  return out;
});
{
  const rows = v.rows;
  const isl = rows.filter(r => r.landform === 'islands');
  const sea = rows.filter(r => r.seaStarts);
  ck('theSweepRollsRealIslands', isl.length >= 5, isl.length + ' islands maps of ' + rows.length);
  ck('someMapsAreGenuinelySeaDivided', sea.length >= 2, sea.length + ' sea-divided');
  ck('andSomeIslandsMapsStayJoined', isl.some(r => !r.seaStarts),
    'isthmus maps exist — the mix is a mix');
  ck('seaStartsMeansDifferentLandmasses', sea.every(r => !r.sameLand), '');
  ck('landStartsMeansOneLandmass', rows.filter(r => !r.seaStarts).every(r => r.sameLand),
    'no silent third state');
  ck('everySeaSeatHasADockCoast', sea.every(r => r.dockP && r.dockA), '');
  ck('andTheOceanIsShared', sea.every(r => r.sharedOcean), '');
  ck('andBothIslandsClearTheFloor', sea.every(r => r.areaP >= 70 && r.areaA >= 70),
    sea.map(r => r.areaP + '/' + r.areaA).join(' '));
  const shorts = rows.filter(r => r.shortP.length || r.shortA.length);
  ck('nobodyIsStranded', shorts.length === 0,
    shorts.slice(0, 4).map(r => r.seed + '/' + r.size + ' P[' + r.shortP + '] A[' + r.shortA + ']').join('; ') || 'every seat holds 3 of each + gold');
  ck('theSameSeedRollsTheSameSea', v.determinism, '');
}
await p.close();

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL ISLAND-MAP CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
