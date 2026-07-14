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

  generate(seedStr, mode) {
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

    // starts land anywhere along the map's outer band — never the middle —
    // and the rival settles far away, so openings vary game to game instead
    // of always being corner vs corner
    const m = 7;
    const band = Math.min(W * 0.28, W / 2 - m - 1);   // how far from center a start must sit
    const ringSpot = () => {
      for (let i = 0; i < 200; i++) {
        const x = m + ((rnd() * (W - 2 * m)) | 0), y = m + ((rnd() * (H - 2 * m)) | 0);
        if (Math.max(Math.abs(x - (W - 1) / 2), Math.abs(y - (H - 1) / 2)) >= band) return { x, y };
      }
      return { x: m, y: m };
    };
    const player = ringSpot();
    let ai = { x: W - 1 - player.x, y: H - 1 - player.y };   // fallback: dead opposite
    {
      const minD = Math.hypot(W, H) * 0.5;
      const far = [];
      for (let i = 0; i < 60; i++) {
        const c = ringSpot();
        if (Math.hypot(c.x - player.x, c.y - player.y) >= minD) far.push(c);
      }
      if (far.length) ai = far[(rnd() * far.length) | 0];
    }
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
      // land masses under both towns, a big one mid-map, plus a few wild
      // isles scattered along the outer band, joined by causeways
      const isles = [player, ai, ringSpot(), ringSpot()];
      for (const c of isles)
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
    // Painted tiles must actually land — mountains, lakes and bad rolls can eat
    // blobs, and a map starved of a resource is an unwinnable map (seen live:
    // 2 stone tiles = 112 stone where Town Center Lv2 alone costs 150). So the
    // scarce pocket is pinned to 6–8 tiles and every normal resource gets a
    // floor comfortably above it, keeping the scarce one genuinely the rarest.
    const countType = (type) => { let c = 0; for (let i = 0; i < W * H; i++) if (t[i] === type) c++; return c; };
    const paint = (type, normalN, sizeMin, sizeVar) => {
      if (scarce.terrain === type) {
        // one lean pocket, exactly 6–8 tiles, grown one tile at a time so
        // terrain can't eat it down to nothing (and it can't balloon either)
        const want = 6 + ((rnd() * 3) | 0);
        let guard = 0;
        while (countType(type) < want && guard++ < 800) {
          const cells = [];
          for (let i = 0; i < W * H; i++) if (t[i] === type) cells.push(i);
          let x, y;
          if (cells.length) {
            const c = cells[(rnd() * cells.length) | 0];
            x = c % W + ((rnd() * 3 | 0) - 1); y = (c / W | 0) + ((rnd() * 3 | 0) - 1);
          } else { x = 2 + rnd() * (W - 4) | 0; y = 2 + rnd() * (H - 4) | 0; }
          if (MapGen.inB(x, y) && !nearStart(x, y) && t[id(x, y)] === T.GRASS) t[id(x, y)] = type;
        }
        return;
      }
      const n = Math.max(2, Math.round(normalN * f));
      for (let i = 0; i < n; i++)
        blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, (sizeMin + rnd() * sizeVar) | 0, type, nearStart, [T.GRASS]);
      // floor: never let mountains/lakes starve a normal resource either
      let guard = 0;
      while (countType(type) < 12 && guard++ < 40)
        blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, 6, type, nearStart, [T.GRASS]);
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
    // VARIABLE OPENINGS: how much of each resource sits within walking
    // distance rolls per game — some starts are forest-hugged, some must
    // range for everything. The scarce resource always stays a single tile.
    for (const s of [player, ai]) {
      seedNear(s.x, s.y, T.FOREST, scarce.terrain === T.FOREST ? 1 : 4 + (rnd() * 5 | 0));
      seedNear(s.x, s.y, T.HILLS, scarce.terrain === T.HILLS ? 1 : 2 + (rnd() * 4 | 0));
      seedNear(s.x, s.y, T.FERTILE, scarce.terrain === T.FERTILE ? 1 : 2 + (rnd() * 5 | 0));
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

    /* DIFFICULTY DEFENSIBILITY — bias the PLAYER's seat by difficulty. Calm
       hands them a naturally fortified spot (a treeline/rocky rise closes most
       approaches, leaving 1–2 chokepoints to hold); Moderate leaves more open;
       Hard is exposed — many approach lanes the player must fortify themselves.
       We only ADD barriers to open ground in the "closed" sectors (never touch
       water/mountain or seed resources), always keeping the sector facing the
       rival open, and the reachability clamp below still guarantees a way out. */
    {
      const keep = mode === 'calm' ? 2 : mode === 'moderate' ? 3 : 8;   // open sectors (of 8)
      if (keep < 8) {
        const rf = ((Math.round(Math.atan2(ai.y - player.y, ai.x - player.x) / (Math.PI / 4)) % 8) + 8) % 8;
        const openSec = new Set();
        for (let i = 0; i < keep; i++) openSec.add((rf + Math.round(i * 8 / keep)) % 8);
        const barrier = () => (rnd() < 0.6 ? T.FOREST : T.HILLS);   // woods or a rocky rise
        // a treeline just outside the start plot: Chebyshev ring R0..R1 round the
        // seat, filled SOLID in the closed sectors so the open sectors read as
        // clean, holdable chokepoints (calm gets a slightly thicker band)
        const R0 = 5, R1 = mode === 'calm' ? 7 : 6;
        for (let dy = -R1; dy <= R1; dy++) for (let dx = -R1; dx <= R1; dx++) {
          const ch = Math.max(Math.abs(dx), Math.abs(dy));
          if (ch < R0 || ch > R1) continue;
          const x = player.x + dx, y = player.y + dy;
          if (!MapGen.inB(x, y) || t[id(x, y)] !== T.GRASS) continue;   // only close open ground
          const sec = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
          if (openSec.has(sec)) continue;                              // leave the kept lanes open
          t[id(x, y)] = barrier();
        }
      }
    }

    /* REACHABILITY CLAMP — no sealed spawns, no soft-locked resources. Now that
       forest/hills/fertile block movement too, a bad roll could wall a tribe in
       or ring a needed resource behind impassable ground. So: flood-fill the
       open land from a spawn; if the rival can't be reached, carve a causeway;
       and make sure every resource TYPE has at least one HARVESTABLE tile (a
       resource tile with an open neighbour to stand on) reachable from each
       spawn — carving a minimal seam to the nearest one if not. Harvesting is
       what opens terrain, so a route to the wood is a route through it. */
    {
      const BLOCKS = v => v === T.WATER || v === T.MOUNTAIN || v === T.FOREST || v === T.HILLS || v === T.FERTILE;
      const open4 = i => !BLOCKS(t[i]);
      const flood = (sx, sy) => {
        const seen = new Uint8Array(W * H);
        const si = id(sx, sy); const q = [si]; seen[si] = 1; let head = 0;
        while (head < q.length) {
          const cur = q[head++], cx = cur % W, cy = (cur / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (!MapGen.inB(nx, ny)) continue;
            const ni = id(nx, ny);
            if (seen[ni] || !open4(ni)) continue;
            seen[ni] = 1; q.push(ni);
          }
        }
        return seen;
      };
      // walk a→b clearing blockers into a lane. `preserve` (optional) spares a
      // terrain type: when opening a route TO a scarce resource we clear the
      // rock/orchard in the way but NEVER bulldoze the very wood we're carving
      // to (that would "reach" it by destroying it). `stopAdj` halts one tile
      // short of b — stand beside the resource, don't consume it.
      const carve = (a, b, preserve, stopAdj) => {
        let x = a.x, y = a.y, guard2 = 0;
        const clear = (cx, cy) => {
          if (!MapGen.inB(cx, cy)) return;
          const v = t[id(cx, cy)];
          if (BLOCKS(v) && v !== preserve) t[id(cx, cy)] = T.GRASS;
        };
        while (guard2++ < W * H) {
          clear(x, y); clear(x + 1, y); clear(x, y + 1);
          if (x === b.x && y === b.y) break;
          if (stopAdj && Math.abs(x - b.x) + Math.abs(y - b.y) <= 1) break;   // beside it → done
          if (x !== b.x && (y === b.y || rnd() < 0.5)) x += x < b.x ? 1 : -1;
          else if (y !== b.y) y += y < b.y ? 1 : -1;
        }
      };
      // (a) the two tribes must be able to reach each other. Spare the precious
      //     SCARCE resource first (clear the abundant obstacles instead); only
      //     bulldoze through it as a last resort if that still won't connect.
      let reach = flood(player.x, player.y);
      if (!reach[id(ai.x, ai.y)]) {
        carve(player, ai, scarce.terrain);
        reach = flood(player.x, player.y);
        if (!reach[id(ai.x, ai.y)]) { carve(player, ai); reach = flood(player.x, player.y); }
      }
      // (b) every resource type harvestable + reachable for each tribe. If none
      //     of a type is reachable, open a lane to STAND BESIDE the nearest one,
      //     clearing other obstacles but preserving that resource itself.
      for (const s of [player, ai]) {
        for (const rt of [T.FOREST, T.HILLS, T.FERTILE]) {
          const sreach = flood(s.x, s.y);   // fresh each type — a prior carve may already connect it
          let ok = false, near = null, nearD = 1e9;
          for (let i = 0; i < W * H && !ok; i++) {
            if (t[i] !== rt) continue;
            const rx = i % W, ry = (i / W) | 0;
            let harvestable = false;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = rx + dx, ny = ry + dy;
              if (MapGen.inB(nx, ny) && sreach[id(nx, ny)]) { harvestable = true; break; }
            }
            if (harvestable) { ok = true; break; }
            const d = Math.hypot(rx - s.x, ry - s.y);
            if (d < nearD) { nearD = d; near = { x: rx, y: ry }; }
          }
          if (!ok && near) carve(s, near, rt, true);
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
        // fish ARE food: on a food-scarce map the waters run lean too, or a
        // dock and a few shoals would quietly cancel the whole scarcity
        if (scarce.terrain === T.FERTILE && t[i] === T.WATER) amt = Math.round(amt * 0.5);
        resAmount[i] = amt;
      }
    }

    return { terrain: t, resAmount, scarce: scarce.name, landform, spawns: { player, ai, camps } };
  },

  // a shoal: shore water where fish school close enough to catch from land.
  // Hash-derived (~1/3 of shore tiles), so it needs no save data and matches
  // the renderer's jumping-fish tell exactly — watch the water to find them.
  shoal(x, y) {
    if (!this.inB(x, y) || S.map.terrain[this.idx(x, y)] !== T.WATER) return false;
    let shore = false;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (this.inB(x + ox, y + oy) && S.map.terrain[this.idx(x + ox, y + oy)] !== T.WATER) { shore = true; break; }
    if (!shore) return false;
    return ((x * 73856093 ^ y * 19349663) >>> 0) % 3 === 0;
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

/* Hard terrain obstacles for land units: water, mountains, AND the standing
   resource tiles — forest, rock (hills) and orchard/berry ground (fertile).
   You cannot walk through a wood or a boulder field; you fell/quarry/clear it
   (which reverts the tile to passable ground) or you go around. Depleted
   variants (stumps/pebbles/spent soil) and grass are open. This lookup is read
   in the pathfinding hot loop, so it's a flat array indexed by terrain id. */
const BLOCK_TERR = (() => {
  const a = new Uint8Array(16);
  // sapper-dug TRENCH/MOAT block land units too (a moat also stops boats — it's a
  // ditch, not open water). Ranged fire is distance-based, so archers/siege still
  // shoot over them: only movement is blocked.
  for (const t of [T.WATER, T.MOUNTAIN, T.FOREST, T.HILLS, T.FERTILE, T.TRENCH, T.MOAT]) a[t] = 1;
  return a;
})();

/* Solid obstacles (resources + mountains, NOT water) that should SEAL the
   one-tile lane between them and the map edge — so a wood/boulder/orchard field
   that runs up against the border can't be squeezed past along the very edge. */
const SEAL_TERR = (() => {
  const a = new Uint8Array(16);
  for (const t of [T.MOUNTAIN, T.FOREST, T.HILLS, T.FERTILE]) a[t] = 1;
  return a;
})();

/* BFS pathfinding over the tile grid. Water, mountains and standing resource
   fields are impassable to everyone; walls block all units and gates open only
   for the tribe that built them. When the target can't be reached, returns a
   best-effort path to the closest reachable tile (so besiegers walk up to the
   walls, harvesters walk up to the wood). */
const Path = {
  // does this terrain id block a land unit? (water/mountain/forest/hills/fertile)
  blocksLand(terr) { return BLOCK_TERR[terr] === 1; },

  passable(x, y, owner, domain) {
    if (!MapGen.inB(x, y)) return false;
    const i = MapGen.idx(x, y);
    const terr = S.map.terrain[i];
    if (domain === 'water') return terr === T.WATER;   // boats: open water only (docks don't block hulls)
    if (BLOCK_TERR[terr]) {
      // a standing bridge makes a water/moat tile crossable to land units
      if (!((terr === T.WATER || terr === T.MOAT) && S.map.bridge && S.map.bridge[i])) return false;
    }
    // close the sliver between a solid obstacle and the map edge: a border tile
    // whose inward (perpendicular) neighbour is a resource/mountain is sealed too
    const W = CFG.W, H = CFG.H;
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
      const t = S.map.terrain, ix = MapGen.idx;
      if ((x === 0 && SEAL_TERR[t[ix(1, y)]]) ||
          (x === W - 1 && SEAL_TERR[t[ix(W - 2, y)]]) ||
          (y === 0 && SEAL_TERR[t[ix(x, 1)]]) ||
          (y === H - 1 && SEAL_TERR[t[ix(x, H - 2)]])) return false;
    }
    const blk = Bld.blockAt(x, y);
    if (blk === 0) return true;
    if (blk === 1) return false;                 // wall
    if (blk === 2) return owner === 'P';         // player gate
    if (blk === 3) return owner === 'A';         // rival gate
    return true;
  },

  // guard for continuous (non-grid) steering: same rules as find() — the
  // destination tile must be open, and a diagonal tile change may not cut the
  // corner of a blocked tile. Without this, chasing units could slip through
  // the corner point where a wall meets water/mountain/another wall diagonally.
  canStep(x0, y0, x1, y1, owner, domain) {
    const cx = x0 | 0, cy = y0 | 0, nx = x1 | 0, ny = y1 | 0;
    if (!this.passable(nx, ny, owner, domain)) return false;
    if (nx !== cx && ny !== cy &&
        (!this.passable(nx, cy, owner, domain) || !this.passable(cx, ny, owner, domain))) return false;
    return true;
  },

  // tiles reachable from the open map border (4-dir; sealed walls stay sealed).
  // Used to keep hostile spawns out of walled-off pockets. Returns null when
  // no border tile is passable (island maps) — treat as "no filter".
  borderReach() {
    const spots = [];
    for (let x = 0; x < CFG.W; x++) spots.push({ x, y: 0 }, { x, y: CFG.H - 1 });
    for (let y = 0; y < CFG.H; y++) spots.push({ x: 0, y }, { x: CFG.W - 1, y });
    return this.reachFrom(spots);
  },

  // walkable tiles reachable (4-dir) from any of the given spots; null if none
  // of the seed spots are passable
  reachFrom(spots) {
    const W = CFG.W, H = CFG.H;
    const open = new Uint8Array(W * H);
    const q = [];
    const push = (x, y) => {
      if (!this.passable(x, y)) return;
      const i = MapGen.idx(x, y);
      if (!open[i]) { open[i] = 1; q.push(i); }
    };
    for (const s of spots || []) push(s.x, s.y);
    if (!q.length) return null;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur % W, cy = (cur / W) | 0;
      push(cx + 1, cy); push(cx - 1, cy); push(cx, cy + 1); push(cx, cy - 1);
    }
    return open;
  },

  find(sx, sy, tx, ty, owner, domain) {
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
        if (!this.passable(nx, ny, owner, domain)) continue;
        // no diagonal squeezing between blocked tiles
        if (dx && dy && (!this.passable(cx + dx, cy, owner, domain) || !this.passable(cx, cy + dy, owner, domain))) continue;
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

/* TERRAFORM — the Sapper's map surgery. Trenches (dry ditches that block land),
   moats (trenches flooded from a connected water source — a channel dug from a
   lake floods whole), and clearing (breach a resource wall to grass). Pathfinding
   is computed per-request (no cache), so a terrain edit takes effect on the next
   path with nothing to invalidate; R.updateTile repaints just the one tile. */
const Terraform = {
  DIGGABLE: { [T.GRASS]: 1, [T.STUMPS]: 1, [T.PEBBLES]: 1, [T.BARREN]: 1, [T.RUIN]: 1, [T.CAMP]: 1 },
  CLEARABLE: { [T.FOREST]: 1, [T.HILLS]: 1, [T.FERTILE]: 1 },
  isDiggable(x, y) { return MapGen.inB(x, y) && !Bld.at(x, y) && !!this.DIGGABLE[S.map.terrain[MapGen.idx(x, y)]]; },
  isClearable(x, y) { return MapGen.inB(x, y) && !!this.CLEARABLE[S.map.terrain[MapGen.idx(x, y)]]; },
  bridgeable(x, y) { if (!MapGen.inB(x, y)) return false; const t = S.map.terrain[MapGen.idx(x, y)]; return t === T.WATER || t === T.MOAT; },
  // a bridge must SPAN water: land (or an existing bridge) on both OPPOSITE sides.
  // Returns the deck orientation ('h' = spans E–W, 'v' = spans N–S) perpendicular
  // to the water, or null (middle of a lake / no crossing → can't place).
  bridgeCrossing(x, y, owner) {
    if (!this.bridgeable(x, y)) return null;
    const land = (nx, ny) => {
      if (!MapGen.inB(nx, ny)) return false;
      const t = S.map.terrain[MapGen.idx(nx, ny)];
      if (t === T.WATER || t === T.MOAT) return !!(S.map.bridge && S.map.bridge[MapGen.idx(nx, ny)]);  // an existing bridge counts (extend a span)
      return Path.passable(nx, ny, owner);   // walkable land (grass/cleared/etc.)
    };
    const ew = land(x - 1, y) && land(x + 1, y);   // land east & west → deck runs E–W
    const ns = land(x, y - 1) && land(x, y + 1);   // land north & south → deck runs N–S
    if (ew && ns) return 'h';   // land all round (a pinch) — pick one
    if (ew) return 'h';
    if (ns) return 'v';
    return null;
  },
  waterAdj(x, y) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (MapGen.inB(nx, ny)) { const t = S.map.terrain[MapGen.idx(nx, ny)]; if (t === T.WATER || t === T.MOAT) return true; }
    }
    return false;
  },

  /* Reachability CLAMP: a dig may never pen a town into a tiny sealed pocket. A
     tile touching water becomes a bridgeable moat (reversible) → always allowed;
     otherwise, hypothetically block it and require each TC to keep a sizeable land
     region reachable from just outside its footprint. */
  digWouldSeal(x, y) {
    if (this.waterAdj(x, y)) return false;
    const i = MapGen.idx(x, y), save = S.map.terrain[i];
    S.map.terrain[i] = T.TRENCH;
    let sealed = false;
    for (const owner of ['P', 'A']) {
      const tc = Bld.tcOf(owner); if (!tc) continue;
      const s = Bld.size('tc'), seeds = [];
      for (let k = -1; k <= s; k++) seeds.push({ x: tc.x + k, y: tc.y - 1 }, { x: tc.x + k, y: tc.y + s }, { x: tc.x - 1, y: tc.y + k }, { x: tc.x + s, y: tc.y + k });
      const open = Path.reachFrom(seeds.filter(sp => Path.passable(sp.x, sp.y)));
      let cnt = 0; if (open) for (let j = 0; j < open.length; j++) cnt += open[j];
      if (cnt < 24) { sealed = true; break; }   // penned in — refuse
    }
    S.map.terrain[i] = save;
    return sealed;
  },

  dig(x, y) {
    if (!this.isDiggable(x, y) || this.digWouldSeal(x, y)) return false;
    const i = MapGen.idx(x, y);
    S.map.terrain[i] = T.TRENCH;
    if (S.map.resAmount) S.map.resAmount[i] = 0;
    // NB: do NOT touch seenTerrain here. It is the PLAYER's last-seen memory —
    // updateTile writes it only when the tile is actually visible, and
    // updateVisibility reconciles it on re-sight. Writing it unconditionally let
    // an AI sapper clearing a resource in the player's FOG mark the tile "grass"
    // in memory while the cache still drew the old rock/bush — so the perimeter
    // looked solid but was passable, and enemies walked straight through it.
    if (window.R && R.updateTile) R.updateTile(x, y);
    this.floodMoats(x, y);
    return true;
  },

  // any TRENCH connected (4-dir) to a water source floods to MOAT, and the flood
  // spreads through the whole connected trench channel — dig from a lake and the
  // channel fills.
  floodMoats(x, y) {
    const start = MapGen.idx(x, y);
    if (S.map.terrain[start] !== T.TRENCH && S.map.terrain[start] !== T.MOAT) return;
    const comp = [], seen = new Set([start]), q = [[x, y]]; let touches = false;
    while (q.length) {
      const [cx, cy] = q.pop(); comp.push([cx, cy]);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, ny = cy + oy; if (!MapGen.inB(nx, ny)) continue;
        const ni = MapGen.idx(nx, ny), t = S.map.terrain[ni];
        if (t === T.WATER || t === T.MOAT) touches = true;
        else if (t === T.TRENCH && !seen.has(ni)) { seen.add(ni); q.push([nx, ny]); }
      }
    }
    if (!touches) return;   // dry ditch, stays a trench
    for (const [cx, cy] of comp) {
      const ci = MapGen.idx(cx, cy);
      if (S.map.terrain[ci] === T.MOAT) continue;
      S.map.terrain[ci] = T.MOAT;
      if (window.R && R.updateTile) R.updateTile(cx, cy);   // updateTile writes seenTerrain only when visible (see dig)
    }
  },

  clear(x, y) {
    if (!this.isClearable(x, y)) return false;
    const i = MapGen.idx(x, y);
    S.map.terrain[i] = T.GRASS;
    if (S.map.resAmount) S.map.resAmount[i] = 0;
    // seenTerrain left to updateTile/updateVisibility (see dig) — a rival sapper
    // clearing this in the player's fog must not silently rewrite their memory,
    // or the cleared lane keeps drawing as a solid resource they can't see through
    if (window.R && R.updateTile) R.updateTile(x, y);
    if (CFG.TERRAFORM.clearYield > 0) { /* optional trickle — default 0 */ }
    return true;
  },
};
window.Terraform = Terraform;
