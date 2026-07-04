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
    const f = (W * H) / 1600;               // area factor vs the classic 40x40
    const t = new Array(W * H).fill(T.GRASS);
    const id = this.idx;

    // random-walk blob painter; `only` restricts which terrain it may replace
    function blob(cx, cy, size, type, avoid, only) {
      let x = cx | 0, y = cy | 0;
      for (let i = 0; i < size; i++) {
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!MapGen.inB(nx, ny) || (avoid && avoid(nx, ny))) continue;
          if (only && !only.includes(t[id(nx, ny)])) continue;
          t[id(nx, ny)] = type;
        }
        x += (rnd() * 3 | 0) - 1; y += (rnd() * 3 | 0) - 1;
        x = Math.max(1, Math.min(W - 2, x)); y = Math.max(1, Math.min(H - 2, y));
      }
    }

    // starting corners vary per seed; the rival always settles the opposite one
    const m = 7;
    const corners = [{ x: m, y: m }, { x: W - 1 - m, y: m }, { x: m, y: H - 1 - m }, { x: W - 1 - m, y: H - 1 - m }];
    const pi = (rnd() * 4) | 0;
    const player = corners[pi], ai = corners[3 - pi];
    const nearStart = (x, y) =>
      (Math.abs(x - player.x) < 5 && Math.abs(y - player.y) < 5) ||
      (Math.abs(x - ai.x) < 5 && Math.abs(y - ai.y) < 5);

    // every valley is short on one resource — finding it matters
    const SCARCE = [
      { name: 'wood', terrain: T.FOREST },
      { name: 'stone', terrain: T.HILLS },
      { name: 'food', terrain: T.FERTILE },
    ];
    const scarce = SCARCE[(rnd() * 3) | 0];

    // landform shapes the bones of the map
    const lfRoll = rnd();
    const landform = lfRoll < 0.4 ? 'valley' : lfRoll < 0.6 ? 'lakeland'
      : lfRoll < 0.8 ? 'highlands' : 'islands';

    if (landform === 'islands') {
      t.fill(T.WATER);
      // land masses on every corner plus the middle, joined by causeways
      for (const c of corners)
        blob(c.x, c.y, Math.round(46 * f), T.GRASS, null, [T.WATER]);
      blob(W / 2, H / 2, Math.round(60 * f), T.GRASS, null, [T.WATER]);
      const causeway = (a, b) => {
        let x = a.x, y = a.y;
        let guard = 0;
        while ((x !== b.x || y !== b.y) && guard++ < W * H) {
          for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
            const nx = x + ox, ny = y + oy;
            if (MapGen.inB(nx, ny) && t[id(nx, ny)] === T.WATER) t[id(nx, ny)] = T.GRASS;
          }
          if (x !== b.x && (y === b.y || rnd() < 0.5)) x += x < b.x ? 1 : -1;
          else if (y !== b.y) y += y < b.y ? 1 : -1;
        }
      };
      const mid = { x: (W / 2) | 0, y: (H / 2) | 0 };
      causeway(player, mid);
      causeway(mid, ai);
    } else {
      const lakes = landform === 'lakeland'
        ? Math.round((7 + rnd() * 3) * f)
        : Math.round((3 + rnd() * 2) * f);
      const lakeSize = landform === 'lakeland' ? 18 : 14;
      for (let i = 0; i < lakes; i++)
        blob(4 + rnd() * (W - 8) | 0, 4 + rnd() * (H - 8) | 0, (lakeSize + rnd() * 14) | 0, T.WATER, nearStart);
      if (landform === 'highlands') {
        // impassable mountain ridges wander across the land
        const ridges = Math.max(3, Math.round(4 * f));
        for (let r = 0; r < ridges; r++) {
          let x = (2 + rnd() * (W - 4)) | 0, y = (2 + rnd() * (H - 4)) | 0;
          let dir = rnd() * Math.PI * 2;
          const len = (W * (0.5 + rnd() * 0.4)) | 0;
          for (let i = 0; i < len; i++) {
            for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
              const nx = (x | 0) + ox, ny = (y | 0) + oy;
              if (MapGen.inB(nx, ny) && !nearStart(nx, ny) && t[id(nx, ny)] === T.GRASS)
                t[id(nx, ny)] = T.MOUNTAIN;
            }
            dir += (rnd() - 0.5) * 0.5;
            x += Math.cos(dir); y += Math.sin(dir);
            if (!MapGen.inB(x | 0, y | 0)) break;
          }
        }
      }
    }

    // resource fields: normal kinds scale with map area, the scarce one stays
    // a single small pocket no matter the size
    const paint = (type, normalN, sizeMin, sizeVar) => {
      const isScarce = scarce.terrain === type;
      const n = isScarce ? 1 : Math.max(2, Math.round(normalN * f));
      for (let i = 0; i < n; i++) {
        const size = isScarce
          ? Math.max(4, ((sizeMin + rnd() * sizeVar) * 0.5) | 0)
          : (sizeMin + rnd() * sizeVar) | 0;
        blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, size, type, nearStart, [T.GRASS]);
      }
    };
    paint(T.FOREST, 9, 16, 18);
    paint(T.HILLS, 5, 8, 10);
    paint(T.FERTILE, 6, 6, 8);

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
      seedNear(s.x, s.y, T.FOREST, scarce.terrain === T.FOREST ? 1 : 6);
      seedNear(s.x, s.y, T.HILLS, scarce.terrain === T.HILLS ? 1 : 3);
      seedNear(s.x, s.y, T.FERTILE, scarce.terrain === T.FERTILE ? 1 : 4);
    }
    // clear the immediate start plots
    for (const s of [player, ai])
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        t[id(s.x + dx, s.y + dy)] = T.GRASS;

    // raider camps, far from both starts (more on bigger maps)
    const camps = [];
    const wantCamps = Math.max(2, Math.round(2 * f));
    let guard = 0;
    while (camps.length < wantCamps && guard++ < 600) {
      const x = 3 + rnd() * (W - 6) | 0, y = 3 + rnd() * (H - 6) | 0;
      const dP = Math.hypot(x - player.x, y - player.y), dA = Math.hypot(x - ai.x, y - ai.y);
      if (dP > 14 && dA > 14 && t[id(x, y)] === T.GRASS) { t[id(x, y)] = T.CAMP; camps.push({ x, y }); }
    }

    // guarantee the two tribes can reach each other — carve a causeway if not
    {
      const pass = i => t[i] !== T.WATER && t[i] !== T.MOUNTAIN;
      const seen = new Uint8Array(W * H);
      const q = [id(player.x, player.y)];
      seen[q[0]] = 1;
      let head = 0;
      while (head < q.length) {
        const cur = q[head++];
        const cx = cur % W, cy = (cur / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!MapGen.inB(nx, ny)) continue;
          const ni = id(nx, ny);
          if (seen[ni] || !pass(ni)) continue;
          seen[ni] = 1; q.push(ni);
        }
      }
      if (!seen[id(ai.x, ai.y)]) {
        let x = player.x, y = player.y, guard2 = 0;
        while ((x !== ai.x || y !== ai.y) && guard2++ < W * H) {
          for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
            const nx = x + ox, ny = y + oy;
            if (!MapGen.inB(nx, ny)) continue;
            const v = t[id(nx, ny)];
            if (v === T.WATER || v === T.MOUNTAIN) t[id(nx, ny)] = T.GRASS;
          }
          if (x !== ai.x && (y === ai.y || rnd() < 0.5)) x += x < ai.x ? 1 : -1;
          else if (y !== ai.y) y += y < ai.y ? 1 : -1;
        }
      }
    }

    // every resource tile carries a finite, randomized stock; scarce tiles run leaner
    const resAmount = new Array(W * H).fill(0);
    for (let i = 0; i < W * H; i++) {
      const range = CFG.RES_AMOUNT[t[i]];
      if (range) {
        let amt = Math.round(range[0] + rnd() * (range[1] - range[0]));
        if (t[i] === scarce.terrain) amt = Math.round(amt * 0.6);
        resAmount[i] = amt;
      }
    }

    return { terrain: t, resAmount, scarce: scarce.name, landform, spawns: { player, ai, camps } };
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

/* BFS pathfinding over the tile grid. Water is impassable to everyone; walls
   block all units and gates open only for the tribe that built them. When the
   target can't be reached, returns a best-effort path to the closest
   reachable tile (so besiegers walk up to the walls). */
const Path = {
  passable(x, y, owner) {
    if (!MapGen.inB(x, y)) return false;
    const terr = S.map.terrain[MapGen.idx(x, y)];
    if (terr === T.WATER || terr === T.MOUNTAIN) return false;
    const blk = Bld.blockAt(x, y);
    if (blk === 0) return true;
    if (blk === 1) return false;                 // wall
    if (blk === 2) return owner === 'P';         // player gate
    if (blk === 3) return owner === 'A';         // rival gate
    return true;
  },

  find(sx, sy, tx, ty, owner) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!MapGen.inB(tx, ty)) return null;
    const W = CFG.W, H = CFG.H, id = MapGen.idx;
    const start = id(sx, sy), target = id(tx, ty);
    if (start === target) return [{ x: tx, y: ty }];
    const prev = new Int16Array(W * H).fill(-1);
    prev[start] = start;
    const q = [start];
    const dirs = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, -1, 1, -1, -1, 1];
    let head = 0, found = false;
    let best = start, bestD = Math.hypot(sx - tx, sy - ty);
    while (head < q.length) {
      const cur = q[head++];
      if (cur === target) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (let d = 0; d < 8; d++) {
        const dx = dirs[d * 2], dy = dirs[d * 2 + 1];
        const nx = cx + dx, ny = cy + dy;
        if (!this.passable(nx, ny, owner)) continue;
        // no diagonal squeezing between blocked tiles
        if (dx && dy && (!this.passable(cx + dx, cy, owner) || !this.passable(cx, cy + dy, owner))) continue;
        const ni = id(nx, ny);
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        q.push(ni);
        const dd = Math.hypot(nx - tx, ny - ty);
        if (dd < bestD) { bestD = dd; best = ni; }
      }
    }
    const goal = found ? target : best;
    if (goal === start) return null;
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.push({ x: cur % W, y: (cur / W) | 0 });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  },
};
