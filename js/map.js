"use strict";
/* Seeded procedural map generation + grid pathfinding. */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const MapGen = {
  idx(x, y) { return y * CFG.W + x; },
  inB(x, y) { return x >= 0 && y >= 0 && x < CFG.W && y < CFG.H; },

  generate(seedStr) {
    const rnd = mulberry32(hashSeed(String(seedStr)));
    const W = CFG.W, H = CFG.H;
    const t = new Array(W * H).fill(T.GRASS);
    const id = this.idx;

    // random-walk blob painter
    function blob(cx, cy, size, type, avoid) {
      let x = cx, y = cy;
      for (let i = 0; i < size; i++) {
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (MapGen.inB(nx, ny) && !(avoid && avoid(nx, ny))) t[id(nx, ny)] = type;
        }
        x += (rnd() * 3 | 0) - 1; y += (rnd() * 3 | 0) - 1;
        x = Math.max(1, Math.min(W - 2, x)); y = Math.max(1, Math.min(H - 2, y));
      }
    }

    const player = { x: 32, y: 32 }, ai = { x: 7, y: 7 };
    const nearStart = (x, y) =>
      (Math.abs(x - player.x) < 5 && Math.abs(y - player.y) < 5) ||
      (Math.abs(x - ai.x) < 5 && Math.abs(y - ai.y) < 5);

    // lakes
    const lakes = 3 + (rnd() * 2 | 0);
    for (let i = 0; i < lakes; i++)
      blob(4 + rnd() * (W - 8) | 0, 4 + rnd() * (H - 8) | 0, 14 + rnd() * 14 | 0, T.WATER, nearStart);
    // forests
    for (let i = 0; i < 9; i++)
      blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, 16 + rnd() * 18 | 0, T.FOREST, nearStart);
    // hills
    for (let i = 0; i < 5; i++)
      blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, 8 + rnd() * 10 | 0, T.HILLS, nearStart);
    // fertile soil patches
    for (let i = 0; i < 6; i++)
      blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, 6 + rnd() * 8 | 0, T.FERTILE, nearStart);

    // guarantee some of each resource near both starts
    function seedNear(cx, cy, type, n) {
      let placed = 0, guard = 0;
      while (placed < n && guard++ < 200) {
        const a = rnd() * Math.PI * 2, d = 3.5 + rnd() * 3.5;
        const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
        if (MapGen.inB(x, y) && t[id(x, y)] === T.GRASS && !nearStart(x, y)) { t[id(x, y)] = type; placed++; }
      }
    }
    for (const s of [player, ai]) {
      seedNear(s.x, s.y, T.FOREST, 6);
      seedNear(s.x, s.y, T.HILLS, 3);
      seedNear(s.x, s.y, T.FERTILE, 4);
    }
    // clear the immediate start plots
    for (const s of [player, ai])
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        t[id(s.x + dx, s.y + dy)] = T.GRASS;

    // raider camps, far from both starts
    const camps = [];
    let guard = 0;
    while (camps.length < 2 && guard++ < 400) {
      const x = 3 + rnd() * (W - 6) | 0, y = 3 + rnd() * (H - 6) | 0;
      const dP = Math.hypot(x - player.x, y - player.y), dA = Math.hypot(x - ai.x, y - ai.y);
      if (dP > 14 && dA > 14 && t[id(x, y)] !== T.WATER) { t[id(x, y)] = T.CAMP; camps.push({ x, y }); }
    }

    return { terrain: t, spawns: { player, ai, camps } };
  },

  // nearest tile matching pred, spiraling out from (cx,cy)
  findNear(cx, cy, maxR, pred) {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (this.inB(x, y) && pred(x, y)) return { x, y };
      }
    }
    return null;
  },
};

/* BFS pathfinding over the tile grid (water is impassable). */
const Path = {
  passable(x, y) { return MapGen.inB(x, y) && S.map.terrain[MapGen.idx(x, y)] !== T.WATER; },

  find(sx, sy, tx, ty) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!MapGen.inB(tx, ty)) return null;
    if (!this.passable(tx, ty)) {
      const n = MapGen.findNear(tx, ty, 3, (x, y) => this.passable(x, y));
      if (!n) return null;
      tx = n.x; ty = n.y;
    }
    if (sx === tx && sy === ty) return [{ x: tx, y: ty }];
    const W = CFG.W, H = CFG.H, id = MapGen.idx;
    const prev = new Int16Array(W * H).fill(-1);
    const q = [id(sx, sy)];
    prev[id(sx, sy)] = id(sx, sy);
    const target = id(tx, ty);
    const dirs = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, -1, 1, -1, -1, 1];
    let head = 0, found = false;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === target) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + dirs[d * 2], ny = cy + dirs[d * 2 + 1];
        if (!this.passable(nx, ny)) continue;
        // no diagonal squeezing between water tiles
        if (dirs[d * 2] && dirs[d * 2 + 1] && (!this.passable(cx + dirs[d * 2], cy) || !this.passable(cx, cy + dirs[d * 2 + 1]))) continue;
        const ni = id(nx, ny);
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (!found) return null;
    const path = [];
    let cur = target;
    while (cur !== id(sx, sy)) {
      path.push({ x: cur % W, y: (cur / W) | 0 });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  },
};
