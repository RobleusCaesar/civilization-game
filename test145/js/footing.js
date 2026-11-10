/* THE GROUND UNDER A BUILDING (tests/footing.mjs — operator, 2026-11-03: "the
   new landscape designs look much better, but now they kinda clash with the
   buildings… something that makes the building look like it's part of the
   landscape versus a sticker on top of it"; the mockup review chose the cast
   shadow under every building, the trodden yard round the workplaces and the
   hedge round the homes and towers).

   Three looks, by kind (Footing.KINDS):
     SHADOW  every finished building but the fortifications and the dock: it
             lays its own outline on the grass, down and to the right (the
             game's light is top-left), and the ground darkens where it meets
             the walls. Measured off the building's own sprite, so every level,
             the rival's set and a burning building's art cast their own shape.
     YARD    the workplaces: packed earth worn round the walls, wider in front
             of the door, the odd tuft surviving at its edge.
     HEDGE   the homes and the towers: bushes wrap the corners, ferns and long
             grass along the foot — never in the doorway.

   A PICTURE, NEVER A RULE: nothing here writes S, reads or draws an RNG (every
   choice hashes off the building's id and the world position), or touches a
   tile, a path or a hit-test. It is painted on the ground grid of the V4/V5
   terrain (half a world pixel) into three small canvases per building, cut to
   what they hold (an untrimmed set ran ~0.5MB a building, the canvas memory
   iOS purges the terrain to win back):
     ground  before ANY building is drawn (earth, shadow) — R.draw, just after
             the gate roads, inside the board clip
     back    just before this building's sprite (a bush it stands in front of)
     front   just after it (grass and bushes in front of its foot)
   and R._redrawPic lays back and front again, so a unit or a mountain strip
   behind a building never ends up in front of its hedge.

   WORK IS PACED: measuring a building costs a few milliseconds (more on a
   phone), so the measurements wait in a queue drained under BUDGET_MS a frame;
   a building whose footing is not measured yet simply stands as it did. A
   building keeps its footing until its key, level, place, sprite (a burn
   phase, an upgrade) or the ground round it changes.

   THE WAY BACK: CFG.FOOTING.ON false (the kill switch), or ?footing=0 on a
   page. Off, nothing is measured, cached or drawn. */
const Footing = (() => {
  const K = 2;                                   // cells per world pixel — the V4/V5 ground's 64 texels a tile
  const F = {
    BUDGET_MS: 3,
    KINDS: {
      none: ['wall', 'gate', 'dock'],
      yard: ['tc', 'barracks', 'range', 'stable', 'siege', 'sapper', 'trade', 'warcamp', 'lumber', 'quarry', 'lodge', 'mine'],
      hedge: ['house', 'tower']
    },
    _c: new Map(), _q: [], _qs: new Set(), _world: null, _frame: 0,
    _off: (() => { try { return new URLSearchParams(location.search).get('footing') === '0'; } catch (e) { return false; } })()
  };
  F.on = () => !F._off && !!(typeof CFG !== 'undefined' && CFG.FOOTING && CFG.FOOTING.ON);
  // which look a building wears ('none' for a fortification, a site, a bonded tower)
  F.look = b => {
    if (!b || b.construction > 0 || b.upgrading > 0 || F.KINDS.none.includes(b.key)) return 'none';
    if (b.key === 'tower' && R.towerLinkMask) {                         // bonded into a wall line: part of the wall, not a building beside it
      const lm = R.towerLinkMask(b.x, b.y);
      if (lm && (typeof lm === 'object' ? lm.mask : lm)) return 'none';
    }
    if (F.KINDS.yard.includes(b.key)) return 'yard';
    if (F.KINDS.hedge.includes(b.key)) return 'hedge';
    return 'shadow';
  };
  /* WHICH OF ITS LOOKS (operator, build 159: "create 2-3 options for the bigger
     buildings and then like 5+ for the houses… what might the villagers have
     left in their front yard?"): hashed off the building's PLACE, never its id
     or an RNG, so a load wears the same yard and neighbours seldom match. A
     house picks one of Footing.HOME's seven yards and one of three hedge
     layouts; a workplace one of three yards (bare, a cooper's barrels and
     crates, a log pile or stone heap with a bush let grow); everything else one
     of three shadows. side: which side of the door the clutter stands. */
  F.YARDS = 3; F.LAYS = 3;
  F.variant = (b, look) => {
    // a lattice, not a coin: a step east turns the yard on two, a step south on
    // three (seven yards are a prime cycle, so a row of houses wears all seven
    // before one repeats), offset per 16x16 region so the map shows no pattern
    const r = s => Math.floor(hx(b.x >> 4, b.y >> 4, s) * 64);
    const n = look === 'hedge' && b.key === 'house' ? F.HOME.length : F.YARDS;
    return { v: (b.x * 2 + b.y * 3 + r(91)) % n, lay: (b.x + b.y * 2 + r(92)) % F.LAYS,
      side: hx(b.x * 31 + 7, b.y * 17 + 3, 93) < 0.5 ? -1 : 1 };
  };

  // ---- noise, all hashed: no RNG is ever drawn ------------------------------
  const hx = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vn = (x, y, s) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hx(x0, y0, s), b = hx(x0 + 1, y0, s), c = hx(x0, y0 + 1, s), d = hx(x0 + 1, y0 + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const fbm = (x, y, s) => vn(x, y, s) * 0.62 + vn(x * 2.3, y * 2.3, s + 11) * 0.38;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bay = (x, y) => BAY[(y & 3) * 4 + (x & 3)];
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  /* the palette: packed earth in the yards' own chocolate-to-tan, the meadow's
     greens, and petals that never speak the resource language (no gold, fire
     or berry: cream and lilac only) */
  const P = {
    earth: ['#4f3a26', '#654a30', '#7a5c3c', '#8f6f49', '#a6865c'].map(hex),
    grass: ['#24561f', '#2f6b27', '#3d8130', '#4f983a', '#6cb04b', '#93c766'].map(hex),
    seed: ['#8f8257', '#ad9f72', '#c6bb92'].map(hex),
    bush: ['#10291a', '#183d22', '#21552a', '#2d6c31', '#41873a', '#5fa24a'].map(hex),
    bush2: ['#1f2a12', '#33461c', '#4a6424', '#61802d', '#7c9a39', '#9db556'].map(hex),
    stone: ['#34322c', '#55534b', '#706d63', '#8a867a', '#a7a294'].map(hex),
    petal: ['#e9e3d0', '#b9a3d6'].map(hex),
    shadow: [14, 24, 10],
    // what a household leaves about: split wood, wicker, clay, linen (no gold, fire or berry)
    wood: ['#2e1d10', '#4a3020', '#6b472c', '#8c623c', '#a87c4e'].map(hex),
    heart: ['#7f6446', '#9a7b55', '#b59670', '#c9ae86'].map(hex),
    straw: ['#5e5236', '#7a6c47', '#978a5f', '#b3a67c', '#cbc09a'].map(hex),
    clay: ['#3f2c22', '#5f4232', '#7c5a44', '#977258', '#b08c70'].map(hex),
    iron: ['#26282a', '#3d4042', '#5a5d5e'].map(hex),
    cloth: [['#bdb59d', '#ddd5bd'], ['#9483ad', '#b9a3d6'], ['#5f6f80', '#7c8ea0'], ['#857356', '#a4916d']].map(c => c.map(hex)),
    deep: [34, 42, 40]
  };

  // ---- a building's ground plan, measured off its own sprite ----------------
  function prep(b, spr) {
    const TL = CFG.TILE, bs = Bld.size(b), bx = b.x * TL, by = b.y * TL, bw = bs * TL;
    const r = spr && spr._cfArt ? R.artRect(spr, bx, by, bw, bw) : { x: bx, y: by, w: bw, h: bw };
    const ox = Math.floor(bx - 26), oy = Math.floor(Math.min(r.y, by) - 6);
    const W = (bw + 26 + 60) * K, H = Math.ceil(by + bw + 34 - oy) * K;
    const op = new Uint8Array(W * H);
    let read = false;
    if (spr) {
      try {
        const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
        const mg = mc.getContext('2d', { willReadFrequently: true }); mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high';
        mg.drawImage(spr, (r.x - ox) * K, (r.y - oy) * K, r.w * K, r.h * K);
        const a = mg.getImageData(0, 0, W, H).data;
        for (let i = 0; i < W * H; i++) op[i] = a[i * 4 + 3] > 110 ? 1 : 0;
        read = true;
      } catch (e) { /* a tainted picture (a page from disk): stand in a block for it below */ }
    }
    const fpTop = (by - oy) * K, fpBot = (by + bw - oy) * K, fpL = (bx - ox) * K, fpR = (bx + bw - ox) * K;
    if (!read) {   // the footprint, roofed — enough to seat it, never a guess at the art
      const top = Math.round((r.y - oy) * K), inset = Math.round((fpR - fpL) * 0.1);
      for (let y = Math.max(0, top); y < Math.min(H, fpBot); y++) for (let x = fpL + inset; x < fpR - inset; x++) op[y * W + x] = 1;
    }
    const foot = new Int16Array(W).fill(-1);
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (op[y * W + x]) { foot[x] = y; break; }
    const baseTop = Math.round(fpTop + (fpBot - fpTop) * 0.42);
    // the ground plan: the opaque base, the lower part of the footprint; distance from it,
    // anisotropic because the ground recedes (a step north or south is a longer step on the land)
    const dist = new Float32Array(W * H).fill(1e6);
    let bl = W, br = -1, bb = -1;
    for (let y = baseTop; y < H; y++) for (let x = 0; x < W; x++) if (op[y * W + x]) { dist[y * W + x] = 0; if (x < bl) bl = x; if (x > br) br = x; if (y > bb) bb = y; }
    if (br < 0) { bl = fpL; br = fpR - 1; bb = fpBot - 1; for (let y = baseTop; y < fpBot; y++) for (let x = fpL; x < fpR; x++) dist[y * W + x] = 0; }
    const HW = 1, VW = 1.7, DW = Math.hypot(1, 1.7);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + HW);
      if (y > 0) { d = Math.min(d, dist[i - W] + VW); if (x > 0) d = Math.min(d, dist[i - W - 1] + DW); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + DW); }
      dist[i] = d; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let d = dist[i];
      if (x < W - 1) d = Math.min(d, dist[i + 1] + HW);
      if (y < H - 1) { d = Math.min(d, dist[i + W] + VW); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + DW); if (x > 0) d = Math.min(d, dist[i + W - 1] + DW); }
      dist[i] = d; }
    // where it may paint: open ground (grass, stumps, picked-bare soil) or a building's own plot,
    // on the board — never water, a wood, rock, ore or the black beyond the rim
    const ok = new Uint8Array(W * H);
    const tx0 = Math.floor(ox / TL), ty0 = Math.floor(oy / TL), tx1 = Math.floor((ox + W / K) / TL), ty1 = Math.floor((oy + H / K) / TL);
    const tOk = new Map();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      let v = 0;
      if (MapGen.onBoard(tx, ty)) { const t = S.map.terrain[ty * CFG.W + tx]; v = (t === T.GRASS || t === T.STUMPS || t === T.BARREN || Bld.at(tx, ty)) ? 1 : 0; }
      tOk.set(ty * 4096 + tx, v);
    }
    for (let y = 0; y < H; y++) { const ty = Math.floor((oy + y / K) / TL);
      for (let x = 0; x < W; x++) ok[y * W + x] = tOk.get(ty * 4096 + Math.floor((ox + x / K) / TL)) || 0; }
    // the door: the middle of the foot
    const dx = Math.round((fpL + fpR) / 2);
    let dy = -1; for (let x = dx - 4; x <= dx + 4; x++) if (x >= 0 && x < W) dy = Math.max(dy, foot[x]);
    if (dy < 0) dy = fpBot;
    return { id: b.id, bw, bs, ox, oy, W, H, op, foot, dist, ok, baseTop, fpBot, bl, br, bb, dx, dy,
      big: bs > 1 || b.key === 'tc', L: [0, 1, 2].map(() => new Uint8ClampedArray(W * H * 4)) };
  }

  // ---- painting --------------------------------------------------------------
  function put(Q, l, x, y, c, a) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= Q.W || y >= Q.H) return;
    const i = (y * Q.W + x) * 4, A = Q.L[l];
    if (a == null || a >= 1) { A[i] = c[0]; A[i + 1] = c[1]; A[i + 2] = c[2]; A[i + 3] = 255; return; }
    const ea = A[i + 3] / 255, na = a + ea * (1 - a);                    // over what the layer already holds
    for (let k = 0; k < 3; k++) A[i + k] = (c[k] * a + A[i + k] * ea * (1 - a)) / (na || 1);
    A[i + 3] = na * 255;
  }
  const opq = (Q, x, y) => x >= 0 && y >= 0 && x < Q.W && y < Q.H && Q.op[(y | 0) * Q.W + (x | 0)];
  const okAt = (Q, x, y) => x >= 0 && y >= 0 && x < Q.W && y < Q.H && Q.ok[(y | 0) * Q.W + (x | 0)];
  const wx = (Q, x) => Q.ox * K + x, wy = (Q, y) => Q.oy * K + y;     // world cells: neighbouring footings agree
  const rnd = (Q, k) => hx(Q.id, k, 77);
  // a thing standing at (x, y): FRONT if it stands below the foot and covers the sprite, BACK otherwise
  const layerFor = (Q, x, y, r, ht) => {
    let over = false;
    for (let yy = y - ht; yy <= y && !over; yy += 2) for (let xx = x - r; xx <= x + r; xx += 2) if (opq(Q, xx, yy)) { over = true; break; }
    if (!over) return 1;
    const f = Q.foot[Math.max(0, Math.min(Q.W - 1, x | 0))];
    return (f < 0 || y >= f - 3) ? 2 : 1;
  };

  // packed earth round the walls, wider at the door, its edge broken into the grass
  function yardEarth(Q) {
    const R0 = Q.big ? 12 : 8, lobe = Q.big ? 9 : 6, lobeW = Q.big ? 12 : 9, edge = 6 * K, s = 5;
    for (let y = 0; y < Q.H; y++) for (let x = 0; x < Q.W; x++) {
      const i = y * Q.W + x; if (!Q.ok[i] || Q.op[i]) continue;
      const d = Q.dist[i];
      const dirY = y > Q.bb ? 1.4 : y < Q.baseTop ? 0.55 : 1;
      const n = fbm(wx(Q, x) / 22, wy(Q, y) / 22, s) - 0.5, n2 = fbm(wx(Q, x) / 9, wy(Q, y) / 9, s + 2) - 0.5;
      let rr = R0 * K * dirY * (1 + n * 0.8 + n2 * 0.25);
      if (y > Q.bb - K) { const gx = (x - Q.dx - (Q.v || 0) * (Q.side || 1) * (Q.big ? 7 : 4)) / ((lobeW + (Q.v === 2 ? 3 : 0)) * K); rr += lobe * K * Math.exp(-gx * gx); }
      const t = (rr - d) / edge;
      if (t <= 0) continue;
      const jit = hx(wx(Q, x), wy(Q, y), s + 3);
      if (t < 1 && t < bay(wx(Q, x), wy(Q, y)) * 0.75 + jit * 0.25) continue;
      const m = fbm(wx(Q, x) / 6, wy(Q, y) / 6, s + 9);
      let k = m < 0.33 ? 1 : m < 0.66 ? 2 : 3;
      if (jit < 0.06) k = Math.max(0, k - 1); else if (jit > 0.95) k = Math.min(4, k + 1);
      if (d < 2.2 * K) k = Math.max(0, k - 1);                         // darker against the wall
      if (t < 1 && jit > 0.6) k = Math.max(0, k - 1);
      put(Q, 0, x, y, P.earth[k]);
      // the odd pebble trodden in
      if (t > 1.2 && (x & 3) === 1 && (y & 3) === 1 && hx(wx(Q, x) >> 2, wy(Q, y) >> 2, s + 21) < 0.06) {
        put(Q, 0, x, y, P.stone[3]); put(Q, 0, x + 1, y, P.stone[2]); put(Q, 0, x, y + 1, P.stone[1]); put(Q, 0, x + 1, y + 1, P.stone[1]);
      }
    }
    // a few tufts survive at the yard's edge
    for (let k = 0; k < 5; k++) {
      const a = rnd(Q, k) * Math.PI * 2, rr = (Q.big ? 15 : 11) * K;
      const x = Math.round((Q.bl + Q.br) / 2 + Math.cos(a) * rr * 1.2), y = Math.round(Q.bb + Math.sin(a) * rr * 0.55);
      if (okAt(Q, x, y) && !opq(Q, x, y)) tuft(Q, x, y, 7, Q.id * 9 + k, false);
    }
  }
  // the ground darkening where it meets the walls (three hard steps, the outer one dithered)
  function contact(Q, strength) {
    const st = [0.42, 0.26, 0.13].map(v => v * strength);
    for (let y = Math.max(0, Q.baseTop - 2 * K); y < Q.H; y++) for (let x = 0; x < Q.W; x++) {
      const i = y * Q.W + x; if (!Q.ok[i] || Q.op[i]) continue;
      const d = Q.dist[i] / K, band = d < 1.2 ? 0 : d < 2.6 ? 1 : d < 4.2 ? 2 : -1;
      if (band < 0 || (band === 2 && bay(wx(Q, x), wy(Q, y)) > 0.55)) continue;
      put(Q, 0, x, y, P.shadow, st[band]);
    }
  }
  // the building lays its own shape down and to the right (the sun is up and to the left)
  function cast(Q, alpha) {
    const sh = new Uint8Array(Q.W * Q.H);
    for (let x = 0; x < Q.W; x++) {
      const f = Q.foot[x]; if (f < 0) continue;
      for (let y = 0; y <= f; y++) {
        if (!Q.op[y * Q.W + x]) continue;
        const h = f - y, sx = Math.round(x + h * 0.62), sy = Math.round(f + h * 0.2);
        for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) { const X = sx + a, Y = sy + c; if (X < Q.W && Y < Q.H) sh[Y * Q.W + X] = 1; }
      }
    }
    for (let i = 0; i < Q.W * Q.H; i++) if (sh[i] && Q.ok[i] && !Q.op[i]) put(Q, 0, i % Q.W, (i / Q.W) | 0, P.shadow, alpha);
  }
  // standing things
  function blob(Q, l, cx, cy, rx, ry, pal, s, lumpA, leafy) {
    const cells = [], set = new Set();
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const lump = (hx(Math.round(Math.atan2(dy, dx) * 3), s, 7) - 0.5) * lumpA;
      if (dx * dx + dy * dy <= 1 + lump) { cells.push([x, y, dx, dy]); set.add(x + ',' + y); }
    }
    for (const [x, y, dx, dy] of cells) {
      const edge = !set.has((x + 1) + ',' + y) || !set.has((x - 1) + ',' + y) || !set.has(x + ',' + (y + 1)) || !set.has(x + ',' + (y - 1));
      const lit = -dx * 0.6 - dy * 0.8;
      let k = lit > 0.55 ? 4 : lit > 0.15 ? 3 : lit > -0.3 ? 2 : 1;
      const j = hx(x + s * 31, y, s);
      if (leafy && j < 0.18) k = Math.min(5, k + 1); else if (leafy && j > 0.86) k = Math.max(1, k - 1);
      if (edge && (dy > -0.2 || dx > 0.3)) k = 0;                       // inked on its shadowed side
      put(Q, l, x, y, pal[Math.min(pal.length - 1, k)]);
    }
  }
  function bush(Q, x, y, r, s, pal, bloom) {
    const l = layerFor(Q, x, y, r, r * 1.6);
    blob(Q, l, x, y - r * 0.72, r, r * 0.78, pal, s, 0.4, true);
    blob(Q, l, x - r * 0.45, y - r * 0.95, r * 0.62, r * 0.55, pal, s + 1, 0.3, true);
    if (r > 6) blob(Q, l, x + r * 0.5, y - r * 1.1, r * 0.55, r * 0.5, pal, s + 2, 0.3, true);
    // flowers as single specks spread over the crown — paired dots on a dark bush read as eyes
    if (bloom) for (let k = 0; k < r * 2.2; k++) {
      const a = hx(s, k, 1) * Math.PI * 2, d = Math.sqrt(hx(s, k, 2)) * r * 0.85;
      const px = Math.round(x + Math.cos(a) * d), py = Math.round(y - r * 0.8 + Math.sin(a) * d * 0.7);
      if (hx(s, k, 3) < 0.55 && hx(px, py, 9) > 0.3) put(Q, l, px, py, bloom);
    }
  }
  function tuft(Q, x, y, h, s, seedHead) {
    const l = layerFor(Q, x, y, 3, h), n = 4 + Math.floor(hx(s, 1, 3) * 3);
    for (let k = 0; k < n; k++) {
      const lean = (k - (n - 1) / 2) * 0.5 + (hx(s, k, 5) - 0.5) * 0.6, hh = h * (0.6 + hx(s, k, 6) * 0.45), off = (k - (n - 1) / 2) * 0.6;
      for (let t = 0; t <= hh; t++) { const f = t / hh;
        put(Q, l, Math.round(x + lean * t * 0.55 + off), Math.round(y - t), P.grass[f < 0.3 ? 0 : f < 0.65 ? 2 : f < 0.9 ? 4 : 5]); }
      if (seedHead && k % 2 === 0) { const px = Math.round(x + lean * hh * 0.55 + off), py = Math.round(y - hh) - 1;
        put(Q, l, px, py, P.seed[1]); put(Q, l, px, py - 1, P.seed[2]); put(Q, l, px + 1, py, P.seed[0]); }
    }
  }
  function fern(Q, x, y, r) {
    const l = layerFor(Q, x, y, r, r);
    for (const side of [-1, 1]) for (let f = 0; f < 3; f++) {
      const ang = 0.35 + f * 0.45, len = r * (1 - f * 0.18);
      for (let t = 0; t <= len; t++) {
        const px = Math.round(x + side * Math.cos(ang) * t), py = Math.round(y - Math.sin(ang) * t + (t * t) / (len * 2.4));
        put(Q, l, px, py, P.bush[t > len * 0.7 ? 5 : t > len * 0.35 ? 4 : 3]);
        if (t % 2 === 0 && t > 1) put(Q, l, px, py + 1, P.bush[2]);
      }
    }
  }
  function flower(Q, x, y, s) {
    const l = layerFor(Q, x, y, 1, 3), c = P.petal[hx(s, 4, 4) < 0.5 ? 0 : 1];
    put(Q, l, x, y, P.grass[1]); put(Q, l, x, y - 1, P.grass[2]);
    put(Q, l, x, y - 2, c); put(Q, l, x - 1, y - 2, c); put(Q, l, x + 1, y - 2, c); put(Q, l, x, y - 3, c);
  }
  // a corner's foot: where the walls meet the ground at the building's side
  const sideFoot = (Q, side) => { const x0 = side < 0 ? Q.bl : Q.br; let f = -1;
    for (let k = 0; k < 6; k++) { const xx = x0 - side * k; if (xx >= 0 && xx < Q.W && Q.foot[xx] > f) f = Q.foot[xx]; }
    return [x0, f < 0 ? Q.fpBot : f]; };
  const footAt = (Q, x) => { let f = -1; for (let k = -3; k <= 3; k++) { const xx = (x | 0) + k; if (xx >= 0 && xx < Q.W) f = Math.max(f, Q.foot[xx]); } return f < 0 ? Q.fpBot : f; };
  /* THE HEDGE: a clump wrapping each corner, ferns, long grass and flowers along
     the foot, the door kept clear. Three LAYOUTS of the green (a home is the
     one building a town raises by the dozen, so no two neighbours should wear
     the same hedge), and on a house one of seven YARDS: what the household
     left out front (Footing.HOME). A prop takes the place of its side's corner
     bush, so the house never wears both. */
  function hedge(Q) {
    const R0 = Q.big ? 10 : 8, lay = Q.lay, yard = Q.home ? F.HOME[Q.v] : null, propSide = Q.side;
    const wild = yard === 'wild';
    for (const side of [-1, 1]) {
      const [x, f] = sideFoot(Q, side), busy = yard && !wild && side === propSide;
      const pal = rnd(Q, side + 8) > 0.5 ? P.bush : P.bush2, bloom = rnd(Q, side + 9) > (wild ? 0.2 : 0.55) ? P.petal[side > 0 ? 0 : 1] : null;
      if (!busy) {
        if (lay === 0) {                                                  // a clump wrapping the corner
          bush(Q, x + side * R0 * 0.1, f - 2, R0 + rnd(Q, side + 3) * 3 + (wild ? 2 : 0), Q.id * 7 + side, pal, bloom);
          bush(Q, x + side * R0 * 0.9, f + 3, R0 * 0.6, Q.id * 7 + side * 3, P.bush);
          bush(Q, x - side * R0 * 0.2, f - Q.bw * K * 0.28, R0 * 0.75, Q.id * 7 + side * 5, P.bush2);
        } else if (lay === 1) {                                           // one tall shrub against the wall, low growth at its foot
          bush(Q, x - side * R0 * 0.15, f - Q.bw * K * 0.22, R0 * 0.95 + rnd(Q, side + 4) * 2, Q.id * 11 + side, pal, bloom);
          bush(Q, x + side * R0 * 0.55, f + 2, R0 * 0.5, Q.id * 11 + side * 3, P.bush2);
          fern(Q, x + side * R0 * 0.2, f + 5, 6);
        } else {                                                          // a low run of shrubs out from the corner
          for (let k = 0; k < 3; k++) bush(Q, x + side * (R0 * 0.2 + k * R0 * 0.75), f + 1 + k, R0 * (0.62 - k * 0.1), Q.id * 13 + side * 5 + k, k % 2 ? P.bush2 : pal, k === 0 ? bloom : null);
        }
      }
      fern(Q, x + side * R0 * (busy ? 2.6 : 1.5), f + 4, wild ? 10 : 8);
      tuft(Q, x + side * R0 * (busy ? 2.9 : 1.9), f + 1, wild ? 14 : 10, Q.id * 3 + side, true);
      if (wild) { tuft(Q, x + side * R0 * 1.2, f + 6, 13, Q.id * 5 + side, true); flower(Q, x + side * R0 * 0.6, f + 7, Q.id + side); }
    }
    for (let x = Q.bl; x <= Q.br; x++) {
      const f = Q.foot[x];
      if (f < 0 || Math.abs(x - Q.dx) < 15 || (x % 4) !== 0 || rnd(Q, x) > (wild ? 0.85 : 0.6)) continue;   // the door kept clear, leaning blades and all
      if (yard && !wild && Math.sign(x - Q.dx) === propSide && Math.abs(x - Q.dx) > 16) continue;          // the yard's own side is the household's
      if (rnd(Q, x + 100) < 0.8) tuft(Q, x, f + 3, (wild ? 11 : 8) + rnd(Q, x + 3) * 5, Q.id * 13 + x, rnd(Q, x + 7) > 0.5);
      else flower(Q, x, f + 3, x);
    }
    if (yard && !wild) homeYard(Q, yard, propSide);
  }

  // ---- the things people leave about ---------------------------------------------
  const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const free = (Q, x, y) => okAt(Q, x, y) && !opq(Q, x, y);
  // a soft shadow on the ground under a thing, down and to the right
  function under(Q, x, y, rx, ry, a) {
    for (let yy = Math.floor(y - ry); yy <= y + ry; yy++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
      const dx = (xx - x) / rx, dy = (yy - y) / ry;
      if (dx * dx + dy * dy <= 1 && free(Q, xx, yy)) put(Q, 0, xx, yy, P.shadow, a == null ? 0.32 : a);
    }
  }
  function disc(Q, l, cx, cy, r, ramp, rim) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy); if (d > r) continue;
      let c = d > r - 1 ? (dx + dy > 0 ? rim : ramp[1]) : (dx + dy < -r * 0.5 ? ramp[3] : ramp[2]);
      if (d < 0.8) c = ramp[0];
      put(Q, l, x, y, c);
    }
  }
  // split wood stacked against the wall, log ends out
  function woodpile(Q, x, y, s) {
    const rows = [4, 3, 2].slice(0, 2 + (hx(s, 1, 1) < 0.6 ? 1 : 0)), l = layerFor(Q, x, y, 11, 12);
    under(Q, x + 2, y + 1, 12, 3);
    rows.forEach((n, ri) => { for (let k = 0; k < n; k++) {
      const cx = x - (n - 1) * 2.6 + k * 5.2 + (hx(s, ri * 7 + k, 2) - 0.5), cy = y - 2.4 - ri * 4.3;
      disc(Q, l, cx, cy, 2.7, P.heart, P.wood[0]);
    } });
  }
  // a chopping block, the axe left in it
  function block(Q, x, y) {
    const l = layerFor(Q, x, y, 5, 12);
    under(Q, x + 1, y + 1, 5, 2);
    for (let yy = y - 4; yy <= y; yy++) for (let xx = x - 3; xx <= x + 3; xx++) put(Q, l, xx, yy, P.wood[yy === y ? 0 : xx <= x - 2 ? 3 : xx >= x + 2 ? 1 : 2]);
    for (let xx = x - 3; xx <= x + 3; xx++) { put(Q, l, xx, y - 5, P.heart[xx < x ? 3 : 2]); put(Q, l, xx, y - 6, P.heart[xx === x - 3 || xx === x + 3 ? 1 : 2]); }
    put(Q, l, x, y - 6, P.heart[0]);
    for (let t = 0; t < 8; t++) put(Q, l, x + 1 + Math.round(t * 0.6), y - 6 - t, P.wood[t < 2 ? 2 : 4]);   // the haft
    put(Q, l, x - 1, y - 6, P.iron[2]); put(Q, l, x, y - 7, P.iron[1]); put(Q, l, x - 1, y - 7, P.iron[2]); put(Q, l, x + 1, y - 7, P.iron[0]);
  }
  // a wooden pail, bound with two hoops
  function pail(Q, x, y) {
    const l = layerFor(Q, x, y, 4, 9);
    under(Q, x + 1, y + 1, 4, 1.5);
    for (let yy = y - 5; yy <= y; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
      const hoop = yy === y - 1 || yy === y - 4;
      put(Q, l, xx, yy, hoop ? P.iron[xx < x ? 2 : 1] : P.wood[yy === y ? 1 : xx === x - 2 ? 4 : xx === x + 2 ? 2 : 3]);
    }
    for (let xx = x - 2; xx <= x + 2; xx++) put(Q, l, xx, y - 6, Math.abs(xx - x) < 2 ? P.deep : P.wood[3]);
    for (const [xx, yy] of [[-3, -7], [-2, -9], [0, -10], [2, -9], [3, -7]]) put(Q, l, x + xx, y + yy, P.iron[1]);
  }
  // a wicker basket, greens in it
  function basket(Q, x, y, s) {
    const l = layerFor(Q, x, y, 5, 7);
    under(Q, x + 1, y + 1, 5, 1.5);
    for (let yy = y - 4; yy <= y; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
      if ((yy === y && Math.abs(xx - x) > 3) || (yy === y - 4 && Math.abs(xx - x) > 3)) continue;
      put(Q, l, xx, yy, yy === y ? P.straw[0] : P.straw[(xx + yy) & 1 ? 2 : 3 + (xx < x ? 1 : 0) - 1]);
    }
    const herbs = hx(s, 3, 3) < 0.5;
    for (let xx = x - 3; xx <= x + 3; xx++) put(Q, l, xx, y - 5, herbs ? P.grass[(xx & 1) ? 3 : 4] : P.cloth[0][(xx & 1)]);
    if (herbs) { put(Q, l, x - 1, y - 6, P.grass[5]); put(Q, l, x + 2, y - 6, P.grass[4]); }
  }
  // clay jars, two or three, mouths dark
  function pots(Q, x, y, s) {
    const n = hx(s, 2, 9) < 0.5 ? 2 : 3;
    under(Q, x + 2, y + 1, 4 + n * 2.5, 2);
    for (let k = 0; k < n; k++) {
      const cx = x - (n - 1) * 3.5 + k * 7, h = 6 + Math.round(hx(s, k, 8) * 3), rw = 2.4 + hx(s, k, 6) * 0.9, l = layerFor(Q, cx, y, 3, h + 2);
      for (let yy = 0; yy <= h; yy++) {
        const t = yy / h, half = Math.max(1, rw * Math.sin(Math.PI * (0.15 + t * 0.8)));
        for (let xx = -Math.ceil(half); xx <= Math.ceil(half); xx++) {
          if (Math.abs(xx) > half + 0.4) continue;
          const lit = -xx / (half + 1) + (t - 0.5) * 0.6;
          put(Q, l, cx + xx, y - yy, yy === 0 || (Math.abs(xx) >= Math.floor(half) && xx > 0) ? P.clay[0] : P.clay[lit > 0.4 ? 4 : lit > 0 ? 3 : 2]);
        }
      }
      put(Q, l, cx - 1, y - h - 1, P.clay[1]); put(Q, l, cx, y - h - 1, P.deep); put(Q, l, cx + 1, y - h - 1, P.clay[1]);
    }
  }
  // two posts and a line, the washing out
  function washing(Q, x0, x1, y, s) {
    const top = y - 17, l = layerFor(Q, (x0 + x1) / 2, y, (x1 - x0) / 2 + 2, 18);
    under(Q, (x0 + x1) / 2 + 2, y + 1, (x1 - x0) / 2 + 3, 2, 0.2);
    for (const px of [x0, x1]) for (let yy = top; yy <= y; yy++) { put(Q, l, px, yy, P.wood[2]); put(Q, l, px + 1, yy, P.wood[yy === top ? 3 : 1]); }
    const sag = x => top + 1 + Math.round(2 * Math.sin(Math.PI * (x - x0) / (x1 - x0)));
    for (let xx = x0 + 1; xx < x1; xx++) put(Q, l, xx, sag(xx), P.wood[0]);
    let xx = x0 + 3;
    for (let k = 0; xx + 3 < x1 - 1; k++) {
      const w = 4 + Math.round(hx(s, k, 4) * 3), h = 5 + Math.round(hx(s, k, 5) * 4), col = P.cloth[Math.floor(hx(s, k, 6) * 4)];
      if (xx + w >= x1 - 1) break;
      for (let a = 0; a < w; a++) { const ty = sag(xx + a) + 1;
        for (let b = 0; b < h; b++) put(Q, l, xx + a, ty + b, a === w - 1 || b === h - 1 ? shade(col[0], 0.8) : col[a < w / 2 ? 1 : 0]); }
      put(Q, l, xx, sag(xx), P.wood[3]); put(Q, l, xx + w - 1, sag(xx + w - 1), P.wood[3]);   // the pegs
      xx += w + 2;
    }
  }
  // a little bed of herbs and greens, dug in rows
  function garden(Q, x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!free(Q, xx, yy)) continue;
      const edge = yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1;
      put(Q, 0, xx, yy, edge ? P.stone[(xx + yy) % 3 === 0 ? 3 : 2] : P.earth[((yy - y) % 3 === 1) ? 2 : 1]);
    }
    for (let yy = y + 2; yy < y + h - 1; yy += 3) for (let xx = x + 2; xx < x + w - 1; xx += 3) {
      if (!free(Q, xx, yy)) continue;
      const l = layerFor(Q, xx, yy, 1, 3), k = hx(xx + Q.ox * K, yy + Q.oy * K, 5) < 0.5;
      put(Q, l, xx, yy, P.grass[2]); put(Q, l, xx, yy - 1, P.grass[k ? 4 : 3]); put(Q, l, xx - 1, yy - 1, P.grass[3]); put(Q, l, xx + 1, yy - 2, P.grass[k ? 5 : 4]);
    }
  }
  // a log bench by the wall
  function bench(Q, x, y, w) {
    const l = layerFor(Q, x + w / 2, y, w / 2 + 1, 6);
    under(Q, x + w / 2 + 1, y + 1, w / 2 + 2, 1.5);
    for (const lx of [x + 2, x + w - 3]) { put(Q, l, lx, y, P.wood[0]); put(Q, l, lx, y - 1, P.wood[1]); }
    for (let xx = x; xx < x + w; xx++) { put(Q, l, xx, y - 2, P.wood[0]); put(Q, l, xx, y - 3, P.wood[2]); put(Q, l, xx, y - 4, P.wood[xx & 3 ? 3 : 4]); }
    put(Q, l, x, y - 3, P.heart[2]); put(Q, l, x, y - 4, P.heart[3]);
  }
  // a hand cart, its shafts on the ground, a load of logs or a sack
  function cart(Q, x, y, s) {
    const l = layerFor(Q, x + 6, y, 12, 14);
    under(Q, x + 6, y + 1, 12, 2);
    for (let t = 0; t <= 9; t++) put(Q, l, x + 12 + t, y - 6 + Math.round(t * 0.66), P.wood[t & 1 ? 2 : 3]);   // the shafts, down to the ground
    for (let yy = y - 10; yy <= y - 5; yy++) for (let xx = x - 2; xx <= x + 13; xx++)
      put(Q, l, xx, yy, yy === y - 5 ? P.wood[0] : yy === y - 10 ? P.wood[4] : P.wood[(yy - y) % 2 ? 3 : 2]);
    if (hx(s, 4, 4) < 0.5) for (let k = 0; k < 3; k++) disc(Q, l, x + 1 + k * 4.5, y - 12, 2.2, P.heart, P.wood[0]);
    else for (let yy = y - 15; yy <= y - 11; yy++) for (let xx = x + 1; xx <= x + 9; xx++) if (!(yy === y - 15 && (xx === x + 1 || xx === x + 9))) put(Q, l, xx, yy, P.cloth[3][xx < x + 5 ? 1 : 0]);
    for (let yy = y - 8; yy <= y; yy++) for (let xx = x + 1; xx <= x + 9; xx++) {          // the wheel
      const d = Math.hypot(xx - (x + 5), yy - (y - 4));
      if (d <= 4.4 && d > 3.3) put(Q, l, xx, yy, P.wood[d > 3.9 ? 0 : 1]);
      else if (d < 0.9) put(Q, l, xx, yy, P.iron[1]);
      else if (d <= 3.3 && (xx === x + 5 || yy === y - 4)) put(Q, l, xx, yy, P.wood[2]);
    }
  }
  // a barrel, staves and two hoops
  function barrel(Q, x, y) {
    const l = layerFor(Q, x, y, 4, 10);
    for (let yy = y - 8; yy <= y; yy++) { const half = yy === y || yy === y - 8 ? 2 : 3;
      for (let xx = x - half; xx <= x + half; xx++) {
        const hoop = yy === y - 2 || yy === y - 6;
        put(Q, l, xx, yy, hoop ? P.iron[xx < x ? 2 : 1] : xx === x + half || yy === y ? P.wood[0] : P.wood[xx < x - 1 ? 4 : xx < x + 1 ? 3 : 2]);
      } }
    for (let xx = x - 2; xx <= x + 2; xx++) put(Q, l, xx, y - 9, P.wood[xx === x ? 1 : 3]);
  }
  // a crate, a second on it sometimes
  function crate(Q, x, y, two) {
    const one = (cx, cy) => { const l = layerFor(Q, cx + 3, cy, 4, 8);
      for (let yy = cy - 6; yy <= cy; yy++) for (let xx = cx; xx <= cx + 6; xx++) {
        const edge = xx === cx + 6 || yy === cy, rim = xx === cx || yy === cy - 6, brace = xx - cx === cy - yy;
        put(Q, l, xx, yy, edge ? P.wood[0] : rim ? P.wood[4] : brace ? P.wood[1] : P.wood[(xx - cx) % 3 === 0 ? 2 : 3]);
      } };
    under(Q, x + 4, y + 1, 5, 1.5);
    one(x, y); if (two) one(x + 1, y - 7);
  }
  // a heap of fieldstone
  function stones(Q, x, y, s) {
    under(Q, x + 1, y + 1, 6, 1.5, 0.25);
    const l = layerFor(Q, x, y, 6, 6);
    for (let k = 0; k < 4; k++) blob(Q, l, x - 4 + k * 2.6 + hx(s, k, 1) * 1.5, y - 1.5 - (k === 1 || k === 2 ? 2 : 0), 2.2 + hx(s, k, 2), 1.8, P.stone, s + k, 0.3, false);
  }
  F.PAL = P;
  F.HOME = ['woodpile', 'garden', 'washing', 'bench', 'cart', 'pots', 'wild'];
  // what the household left out, beside the door on its side, never in front of it
  function homeYard(Q, yard, side) {
    const [cx, f0] = sideFoot(Q, side), s = Q.id * 17 + 3;
    const at = off => { const x = Math.round(Q.dx + side * off), f = footAt(Q, x); return [x, f + 4]; };
    const go = (x, y, fn) => { if (free(Q, x, y) && free(Q, x, y - 1)) fn(x, y); };
    if (yard === 'woodpile') {
      const [x, y] = at(26); go(x, y - 1, (a, b) => woodpile(Q, a, b, s));
      const [bx, by] = at(15); go(bx, by + 2, (a, b) => block(Q, a, b));
    } else if (yard === 'garden') {
      const [x, y] = at(19); const w = 16, gx = side > 0 ? x - 2 : x - w + 2;
      garden(Q, gx, y + 1, w, 9);
      const [px, py] = at(13); go(px, py + 1, (a, b) => pail(Q, a, b));
    } else if (yard === 'washing') {
      const [x, y] = at(16); const x1 = x + side * 22;
      go(x, y + 4, () => washing(Q, Math.min(x, x1), Math.max(x, x1), y + 4, s));
      const [bx, by] = at(31); go(bx, by + 4, (a, b) => basket(Q, a, b, s));
    } else if (yard === 'bench') {
      const [x, y] = at(17); const w = 14; go(x, y - 1, () => bench(Q, side > 0 ? x : x - w, y - 1, w));
      const [px, py] = at(33); go(px, py, (a, b) => pail(Q, a, b));
    } else if (yard === 'cart') {
      const [x, y] = at(20); go(x, y + 3, (a, b) => cart(Q, side > 0 ? a : a - 10, b, s));
    } else if (yard === 'pots') {
      const [x, y] = at(22); go(x, y, (a, b) => pots(Q, a, b, s));
      const [bx, by] = at(15); go(bx, by + 3, (a, b) => basket(Q, a, b, s + 1));
    }
  }
  // the workplaces' clutter: a cooper's barrels, a crate or two, a log pile, a heap of stone, a bush let grow
  function workYard(Q) {
    const v = Q.v, side = Q.side, s = Q.id * 23 + 1;
    const at = off => { const x = Math.round(Q.dx + side * off), f = footAt(Q, x); return [x, f + 5]; };
    const go = (x, y, fn) => { if (free(Q, x, y) && free(Q, x, y - 1)) fn(x, y); };
    const far = Q.big ? 1.6 : 0.75;
    if (v === 1) {
      const [x, y] = at(24 * far); go(x, y, (a, b) => { barrel(Q, a, b); barrel(Q, a + side * 7, b + 2); });
      const [cx, cy] = at(38 * far); go(cx, cy, (a, b) => crate(Q, a - 3, b, hx(s, 1, 1) < 0.6));
    } else if (v === 2) {
      const [x, y] = at(28 * far); go(x, y, (a, b) => (hx(s, 2, 2) < 0.5 ? woodpile(Q, a, b, s) : stones(Q, a, b, s)));
      const [x2, f2] = sideFoot(Q, -side);                                // the far corner let grow
      bush(Q, x2 - side * 3, f2 - 1, (Q.big ? 9 : 7) + rnd(Q, 31) * 2, s, rnd(Q, 32) > 0.5 ? P.bush : P.bush2, rnd(Q, 33) > 0.6 ? P.petal[0] : null);
      tuft(Q, x2 - side * 13, f2 + 3, 10, s + 5, true);
    }
  }
  // the plain shadow's few touches: tufts and a flower at one corner, or a bush and a stone
  function shadowTouches(Q) {
    const [x, f] = sideFoot(Q, Q.side), s = Q.id * 29;
    if (Q.v === 1) { tuft(Q, x + Q.side * 6, f + 3, 11, s, true); tuft(Q, x + Q.side * 12, f + 5, 8, s + 1, false); if (free(Q, x + Q.side * 9, f + 7)) flower(Q, x + Q.side * 9, f + 7, s); }
    else if (Q.v === 2) { if (free(Q, x + Q.side * 7, f + 2)) bush(Q, x + Q.side * 7, f + 2, 7, s, P.bush2, null); if (free(Q, x + Q.side * 16, f + 5)) stones(Q, x + Q.side * 16, f + 5, s); }
  }

  // ---- measure one building into its three trimmed canvases -----------------
  function build(b, spr, look) {
    const Q = prep(b, spr), vr = F.variant(b, look);
    Q.v = vr.v; Q.side = vr.side; Q.lay = vr.lay; Q.home = b.key === 'house';
    if (look === 'yard') { yardEarth(Q); cast(Q, 0.3); contact(Q, 0.8); workYard(Q); }
    else if (look === 'hedge') { cast(Q, 0.3); contact(Q, 0.85); hedge(Q); }
    else { cast(Q, 0.3); contact(Q, 1.15); if (b.key !== 'raidercamp') shadowTouches(Q); }
    return Q.L.map(A => {
      let x0 = Q.W, y0 = Q.H, x1 = -1, y1 = -1;
      for (let y = 0; y < Q.H; y++) for (let x = 0; x < Q.W; x++) if (A[(y * Q.W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return null;
      const w = x1 - x0 + 1, h = y1 - y0 + 1, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const id = new ImageData(w, h);
      for (let y = 0; y < h; y++) id.data.set(A.subarray(((y + y0) * Q.W + x0) * 4, ((y + y0) * Q.W + x1 + 1) * 4), y * w * 4);
      cv.getContext('2d').putImageData(id, 0, 0);
      return { cv, x: Q.ox + x0 / K, y: Q.oy + y0 / K, w: w / K, h: h / K };
    });
  }
  // what the footing depends on: the kind, level, place, look, and the ground round it
  function sigOf(b, look) {
    const bs = Bld.size(b); let h = 2166136261;
    for (let y = b.y - 1; y <= b.y + bs + 1; y++) for (let x = b.x - 1; x <= b.x + bs + 2; x++) {
      const v = MapGen.onBoard(x, y) ? S.map.terrain[y * CFG.W + x] * 2 + (Bld.at(x, y) ? 1 : 0) : 255;
      h = Math.imul(h ^ v, 16777619);
    }
    return b.key + '|' + b.level + '|' + b.x + ',' + b.y + '|' + bs + '|' + look + '|' + (h >>> 0);
  }
  // the building's footing if it is measured and current; queue it otherwise (a stale one still draws)
  function entry(b) {
    const look = F.look(b); if (look === 'none') return null;
    const spr = R.wornSprite(b), sig = sigOf(b, look);
    let e = F._c.get(b.id);
    if (!e || e.sig !== sig || e.spr !== spr) {
      if (!F._qs.has(b.id)) { F._qs.add(b.id); F._q.push(b.id); }
      if (e && e.sig.split('|').slice(0, 5).join('|') !== sig.split('|').slice(0, 5).join('|')) { F._c.delete(b.id); e = null; }   // a new kind, level or place: never the old picture
    }
    if (e) e.used = F._frame;
    return e;
  }
  F.tick = function (budget) {
    const t0 = performance.now();
    while (F._q.length) {
      const id = F._q.shift(); F._qs.delete(id);
      const b = S.buildings.find(o => o.id === id), look = b && F.look(b);
      if (b && look !== 'none') {
        const spr = R.wornSprite(b);
        try { F._c.set(id, { sig: sigOf(b, look), spr, L: build(b, spr, look), used: F._frame }); }
        catch (e) { F._c.delete(id); }                                  // a painter stands down rather than throwing
      }
      if (budget != null && performance.now() - t0 > budget) break;
    }
  };
  F.flush = () => F.tick(null);
  function blit(g, L) {
    if (!L) return;
    const s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
    g.drawImage(L.cv, L.x, L.y, L.w, L.h);
    g.imageSmoothingEnabled = s;
  }
  const seen = b => { const bs = Bld.size(b);
    for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) if (G.visibleAt(b.x + x, b.y + y)) return true; return false; };
  // the ground layer of every building about to be drawn — before any of them
  F.ground = function (g, blds) {
    if (!F.on()) return;
    if (F._world !== S.map) { F._world = S.map; F._c.clear(); F._q.length = 0; F._qs.clear(); }
    F._frame++;
    for (const b of blds) { if (!seen(b)) continue; const e = entry(b); if (e) blit(g, e.L[0]); }
    F.tick(F.BUDGET_MS);
    if (F._frame % 300 === 0) for (const [id, e] of F._c) if (F._frame - e.used > 600) F._c.delete(id);
  };
  F.back = function (g, b) { if (!F.on()) return; const e = F._c.get(b.id); if (e && F.look(b) !== 'none') blit(g, e.L[1]); };
  F.front = function (g, b) { if (!F.on()) return; const e = F._c.get(b.id); if (e && F.look(b) !== 'none') blit(g, e.L[2]); };
  return F;
})();
window.Footing = Footing;
