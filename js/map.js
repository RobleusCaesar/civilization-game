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
  /* THE PLAYABLE BOARD. `inB` is only "inside the array" — it INCLUDES the
     outermost ring, which is the map's hard border: rendered as off-map black
     void, impassable to everything, unbuildable, unfishable and unworkable.
     Anything asking "may this tile be used" wants THIS, not inB. It was
     spelled out by hand in five places and the sapper's tools were not among
     them, so a trench or a mound could be queued out in the black. */
  onBoard(x, y) { return x > 0 && y > 0 && x < CFG.W - 1 && y < CFG.H - 1; },
  /* THE MOUNTAIN'S SHADOW (tests/mountain.mjs): the rock is drawn as an
     EXTRUSION — the plateau shifts north and a cliff face fills the gap — so
     the art covers up to ~two tiles of walkable ground NORTH of a mountain
     tile (buildings draw before the occlusion strips, which is what hides
     them). Ground the art covers is legal to WALK (the strips ghost a hidden
     unit), but an ENEMY building seated there is invisible to the player —
     a reported day-57 game found a barbarian camp only by the sliver of
     tent peeking past the ridge. One declaration; the camp seating and the
     rival's placement truth (Bld.canPlace) both ask it. */
  mtnShadow(x, y, terr) {
    terr = terr || (typeof S !== 'undefined' && S && S.map && S.map.terrain);
    if (!terr) return false;
    for (let dy = 1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (this.inB(nx, ny) && terr[this.idx(nx, ny)] === T.MOUNTAIN) return true;
    }
    return false;
  },
  /* SHALLOWS — a water tile touching land, which is exactly what the renderer
     shades as shore. The leaner half of the fishery (CFG.FISH_STOCK), used
     both when a map is generated and when a fished-out shoal returns
     (G.fishStockAt — tests/fishery.mjs). */
  shallowWater(x, y) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!this.inB(nx, ny)) continue;
      if (S.map.terrain[this.idx(nx, ny)] !== T.WATER) return true;
    }
    return false;
  },

  generate(seedStr, mode) {
    const rnd = mulberry32(hashSeed(String(seedStr)));
    const W = CFG.W, H = CFG.H;
    const f = (W * H) / 1600;               // area factor vs the classic 40x40
    const t = new Array(W * H).fill(T.GRASS);
    const id = this.idx;

    // random-walk blob painter; `only` restricts which terrain it may replace.
    // Each step lays a small DENSE disc (not a thin 2×2 thread) with a feathered
    // rim, so the walk builds one contiguous mass — a real wood / rock stand /
    // grove — with a soft, broken edge, instead of a stringy scatter of dots.
    function blob(cx, cy, size, type, avoid, only) {
      let x = cx | 0, y = cy | 0;
      for (let i = 0; i < size; i++) {
        const rad = 2 + (rnd() * 2 | 0);                 // 2 or 3: core thickness of the stand
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const dd = dx * dx + dy * dy;
          if (dd > rad * rad + rad) continue;
          const nx = x + dx, ny = y + dy;
          if (!MapGen.inB(nx, ny) || (avoid && avoid(nx, ny))) continue;
          if (only && !only.includes(t[id(nx, ny)])) continue;
          if (dd > (rad - 0.6) * (rad - 0.6) && rnd() < 0.35) continue;   // ragged rim only
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

    /* LANDFORM VARIANTS (tests/variants.mjs) — the same landform, dramatically
       different worlds. A variant is a PARAMETER SET for this generator and
       nothing more: every knob it turns (blob counts, massif sizes, water
       shape, per-resource abundance, what the openings roll near a seat)
       already existed; no variant introduces a terrain type or a new system.

       Rolled from a SIDE STREAM (seed + '::variant' — the relics trick), so
       the main rnd sequence is untouched by the roll itself: on 'classic'
       every value below is exactly what the code shipped with, expression for
       expression, and the map generates BYTE-IDENTICALLY to before variants
       existed. Uniform 25% across the four of each landform — the variety is
       the feature, and classic is just one face of it.

       Balance is not the variant's job: the scarce-resource pocket, the
       per-seat START_RESOURCE guarantee, the resource floors and the
       land-or-sea reachability clamp all run AFTER these knobs and arbitrate
       exactly as before — a variant may starve a resource, but it starves
       both seats equally, and no variant can produce an unreachable one. */
    /* TESTS ONLY: a contract test whose fixture seeds were tuned against
       the pre-variant generator pins FORCE_VARIANT = 'classic' — classic is
       byte-identical to that generator, so those fixture worlds regenerate
       exactly. Never set it outside tests/; the other fifteen worlds are
       held by their own contract (tests/variants.mjs). */
    const vrnd = mulberry32(hashSeed(String(seedStr) + '::variant'));
    const variant = MapGen.FORCE_VARIANT ||
      (typeof window !== 'undefined' && window.__CLASSIC_WORLDS ? 'classic' : null) ||
      MapGen.VARIANTS[landform][(vrnd() * 4) | 0];
    const V = {
      // waters: lakeland lakes / the other inland landforms' lakes
      lakeN: [7, 3], lakeNIn: [3, 2], lakeSize: 18, lakeSizeIn: 14, lakeGrow: 14,
      centralLake: 0,                       // Great Lake: one dominant body first
      // highlands: how the stone stands — count, the landmark, the rest
      massifN: 2.2, landmark: [150, 80], landmarkE: [1.6, 0.9],
      massif: [55, 60], massifE: [1.3, 1.1], cragChance: 0.75,
      // resource paints (count, sizeMin, sizeVar) + floors + the ore deposits
      forest: [7, 5, 8], forestFloor: 12, fertile: [6, 3, 5],
      oreWant: 1.3, oreFloor: 9,
      // what the openings roll near each seat (base, +rnd*var) — always the
      // same for BOTH seats; the scarce override to 1 tile still outranks it
      nearWood: [4, 5], nearStone: [2, 4], nearFood: [2, 5],
      // islands: seat/central/wild isle sizes, how many wilds, the causeways
      isleSeat: 46, isleMid: 60, wildN: 2, wildSize: 46,
      joinChance: 0.55, joinAlways: 0, inletN: 0,
      // Old Country: ancient rubble strewn where someone was before
      ruinN: 0,
    };
    Object.assign(V, {
      // ---- valley ----
      steppe:      { forest: [2, 4, 4], forestFloor: 9, fertile: [11, 4, 7], oreWant: 0.8,
                     cragChance: 0.35, lakeNIn: [2, 2],
                     nearWood: [1, 3], nearStone: [1, 3], nearFood: [4, 6] },
      greatforest: { forest: [17, 8, 12], forestFloor: 44, fertile: [5, 3, 5], nearWood: [6, 5] },
      oldcountry:  { oreWant: 2.3, oreFloor: 16, nearStone: [3, 4], ruinN: 8 },
      // ---- lakeland ----
      delta:       { lakeN: [15, 6], lakeSize: 9, lakeGrow: 6, fertile: [9, 4, 6] },
      greatlake:   { centralLake: 1, lakeN: [2, 2], lakeSize: 10, lakeGrow: 8 },
      pondlands:   { lakeN: [13, 5], lakeSize: 4, lakeGrow: 4 },
      // ---- highlands ----
      karst:       { massifN: 7, landmark: null, massif: [9, 12], massifE: [1.1, 0.5] },
      highpasses:  { massifN: 1.0, landmark: [260, 120], landmarkE: [2.0, 1.0],
                     massif: [140, 80], oreWant: 2.0, oreFloor: 14 },
      foothills:   { massifN: 1.1, landmark: [60, 40], landmarkE: [1.3, 0.6],
                     massif: [26, 26], oreWant: 2.2, oreFloor: 15 },
      // ---- islands ----
      fjord:       { joinAlways: 1, inletN: 7, wildN: 0, isleSeat: 52, isleMid: 85 },
      archipelago: { wildN: 5, wildSize: 24, isleMid: 30, joinChance: 0.15 },
      greatisle:   { isleMid: 110, joinAlways: 1, wildN: 3, wildSize: 18 },
    }[variant] || {});

    /* A MASSIF, NOT A SPINE. The old mountain painter walked a ~3-wide brush
       across the map, which laid WALLS: measured over every mountain-bearing
       xlarge seed, the interior-depth histogram was 1:2086 2:551 3:21 4:1 —
       almost nothing more than two tiles from an edge, so a range had no
       interior for the renderer's height field to raise. A massif is painted
       as a noisy ELLIPSE (a real interior by construction) plus a couple of
       fat spur lobes off its long axis, so a range still runs in a direction
       without thinning back into a wall. Never over a start, never over
       water; the reachability clamp below still guarantees every way
       through. */
    const massif = (cx, cy, area, elong) => {
      const th = rnd() * Math.PI, ca = Math.cos(th), sa = Math.sin(th);
      const b0 = Math.max(2.2, Math.sqrt(area / (Math.PI * elong)));
      const a0 = b0 * elong;
      const lobes = [[cx, cy, a0, b0]];
      const spurs = 1 + ((rnd() * 2) | 0);
      for (let s = 0; s < spurs; s++) {                    // fat lobes off the long axis
        const at = (rnd() < 0.5 ? -1 : 1) * (0.55 + rnd() * 0.45);
        lobes.push([cx + ca * a0 * at, cy + sa * a0 * at,
          a0 * (0.38 + rnd() * 0.2), b0 * (0.7 + rnd() * 0.3)]);
      }
      for (const [lx, ly, la, lb] of lobes) {
        const rr = Math.ceil(Math.max(la, lb)) + 1;
        const x0 = Math.max(1, (lx - rr) | 0), x1 = Math.min(W - 2, (lx + rr) | 0);
        const y0 = Math.max(1, (ly - rr) | 0), y1 = Math.min(H - 2, (ly + rr) | 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x - lx, dy = y - ly;
          const u = (dx * ca + dy * sa) / la, v = (-dx * sa + dy * ca) / lb;
          // rnd() per candidate tile keeps the rim ragged AND deterministic —
          // the iteration order is fixed, so the same seed rolls the same rim
          if (u * u + v * v + (rnd() - 0.5) * 0.45 > 1) continue;
          if (nearStart(x, y) || t[id(x, y)] !== T.GRASS) continue;
          t[id(x, y)] = T.MOUNTAIN;
        }
      }
    };

    if (landform === 'islands') {
      t.fill(T.WATER);
      // land masses under both towns, a big one mid-map, plus a few wild
      // isles scattered along the outer band, joined by causeways.
      // (Variants turn the same dials: the seat isles NEVER shrink below the
      // classic size — the sea-viability FLOOR below leans on their area.)
      const isles = [player, ai];
      for (let wi = 0; wi < V.wildN; wi++) isles.push(ringSpot());
      for (let ii = 0; ii < isles.length; ii++)
        blob(isles[ii].x, isles[ii].y, Math.round((ii < 2 ? V.isleSeat : V.wildSize) * f), T.GRASS, null, [T.WATER]);
      blob(W / 2, H / 2, Math.round(V.isleMid * f), T.GRASS, null, [T.WATER]);
      /* THE CENTRAL ISLE GETS A MOUNTAIN HEART (Part B3): a peak in the
         middle of the big island, with the forest and the ore painted later
         ringing it — an island worth sailing to, not a flat green disc. The
         wild isles roll a small crag each about half the time. */
      massif(W / 2, H / 2, 28 + rnd() * 22 * f, 1.2 + rnd() * 0.5);
      for (const c of isles.slice(2))
        if (rnd() < 0.55) massif(c.x, c.y, 8 + rnd() * 10, 1.1 + rnd() * 0.4);
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
      /* REAL ISLANDS NOW. Each leg of the old player→mid→ai causeway chain
         rolls for itself, so some maps keep an isthmus route, some keep half
         of one, and some are open sea end to end — the reachability clamp
         below no longer bridges the difference by land: it asserts a NAVAL
         route instead (dock-capable coast on both shores of one ocean) and
         only falls back to a causeway when the sea itself cannot carry the
         game. The wild isles never had a causeway; now they actually stay
         islands instead of being annexed by a resource carve. */
      const mid = { x: (W / 2) | 0, y: (H / 2) | 0 };
      const joinP = V.joinAlways ? true : rnd() < V.joinChance;
      const joinA = V.joinAlways ? true : rnd() < V.joinChance;
      if (joinP) causeway(player, mid);
      if (joinA) causeway(mid, ai);
      /* FJORD COAST: the joined mass is then deeply CUT — water blobs eaten
         back into the grass, never over a seat. Land-connected in theory;
         walking around an inlet takes far longer than sailing across it. */
      for (let i = 0; i < V.inletN; i++)
        blob(4 + rnd() * (W - 8) | 0, 4 + rnd() * (H - 8) | 0, (8 + rnd() * 10) | 0, T.WATER, nearStart, [T.GRASS]);
    } else {
      const lakes = landform === 'lakeland'
        ? Math.round((V.lakeN[0] + rnd() * V.lakeN[1]) * f)
        : Math.round((V.lakeNIn[0] + rnd() * V.lakeNIn[1]) * f);
      const lakeSize = landform === 'lakeland' ? V.lakeSize : V.lakeSizeIn;
      // GREAT LAKE: one dominant central body laid first; the loop below only
      // adds a couple of side waters. Play happens around the rim.
      if (V.centralLake)
        blob(W / 2 + rnd() * 6 - 3, H / 2 + rnd() * 6 - 3, Math.round((85 + rnd() * 30) * f), T.WATER, nearStart);
      for (let i = 0; i < lakes; i++)
        blob(4 + rnd() * (W - 8) | 0, 4 + rnd() * (H - 8) | 0, (lakeSize + rnd() * V.lakeGrow) | 0, T.WATER, nearStart);
      if (landform === 'highlands') {
        /* FEWER, BIGGER RANGES. The tile budget roughly matches the old
           ridge-walk (~650 on xlarge) so map balance and the reachability
           clamp see the same amount of stone — but it now stands in a
           handful of massifs with real interiors instead of eleven walls.
           One of them is deliberately MASSIVE: the map's landmark. */
        // variants re-cut the stone: KARST scatters many small crags (no
        // landmark at all), HIGH PASSES stands two enormous walls, FOOTHILLS
        // rolls low and few — all through the same massif painter
        const massifs = Math.max(2, Math.round(V.massifN * f));
        let r0 = 0;
        if (V.landmark) {
          massif(6 + rnd() * (W - 12), 6 + rnd() * (H - 12),
            (V.landmark[0] + rnd() * V.landmark[1]) * f / 2.6, V.landmarkE[0] + rnd() * V.landmarkE[1]);
          r0 = 1;
        }
        for (let r = r0; r < massifs; r++)
          massif(4 + rnd() * (W - 8), 4 + rnd() * (H - 8),
            (V.massif[0] + rnd() * V.massif[1]) * f / 2.6, V.massifE[0] + rnd() * V.massifE[1]);
      } else if (rnd() < V.cragChance) {
        /* …and the OTHER inland landforms carry a little stone too (Part B3):
           one or two modest crags, so most maps have a mountain for the ore
           to sit against and the highlands stay the mountainous ones by a
           clear margin. Deliberately small, and rolled at all only three
           times in four — a bare valley is still a valley. */
        const crags = 1 + (rnd() < 0.4 ? 1 : 0);
        for (let r = 0; r < crags; r++)
          massif(5 + rnd() * (W - 10), 5 + rnd() * (H - 10), (16 + rnd() * 26) * f / 2.6 + 8, 1.2 + rnd() * 0.7);
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
    const paint = (type, normalN, sizeMin, sizeVar, floor) => {
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
      // floor: never let mountains/lakes starve a normal resource either.
      // Variant floors only move UP from the scarce pocket's 6-8 (a variant
      // that leans a resource must still leave more of it than the map's
      // scarce one) or up toward abundance (Great Forest's 44).
      let guard = 0;
      while (countType(type) < (floor || 12) && guard++ < 40)
        blob(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0, 6, type, nearStart, [T.GRASS]);
    };
    paint(T.FOREST, V.forest[0], V.forest[1], V.forest[2], V.forestFloor);
    /* ORE IS A CLAIM, NOT A CARPET (Part B2/B3). A settlement needs three to
       five workable deposits, not sprawling fields — big fields are what read
       as rubbish strewn across the map, and they made stone too cheap to
       fight over. Each deposit is one COMPACT dense knot (a disc with a
       ragged rim, so it has a real core), and the deposits have geological
       logic: they seat FIRST against the mountains — that is where ore
       belongs, and an island with a mountain heart gets its ring of deposits
       for free — then at forest edges where a map is short of mountains, and
       only then in open grass, small. The scarce-resource path above is
       untouched: a stone-scarce map still gets its one lean 6-8 tile pocket
       and nothing else. */
    if (scarce.terrain !== T.HILLS) {
      const oreKnot = (cx, cy) => {
        const rad = 1.3 + rnd() * 0.9;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx, y = cy + dy;
          if (!MapGen.inB(x, y) || nearStart(x, y) || t[id(x, y)] !== T.GRASS) continue;
          if (Math.hypot(dx, dy) + (rnd() - 0.5) * 0.8 > rad) continue;
          t[id(x, y)] = T.HILLS;
        }
      };
      const nearTerr = (x, y, type, rr) => {
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
          if (!MapGen.inB(x + dx, y + dy)) continue;
          if (t[id(x + dx, y + dy)] === type) return true;
        }
        return false;
      };
      /* FAR FEWER, and IN THE CREVASSES (a player report: deposits felt
         strewn about). A deposit belongs in the fold at the mountain's
         base, so the primary pass is a SCORED SEARCH, not rejection
         sampling: every grass tile TOUCHING the rock (r1) is scored by how
         much mountain wraps it within r2, and the deepest re-entrants win.
         A knot only ever paints grass, so a crevasse-seated deposit
         conforms around the rock's own foot. The seeded jitter breaks tie
         runs so two equal notches don't always resolve in scan order. */
      const wantDeposits = Math.max(2, Math.round(V.oreWant * f));
      const seats = [];
      const trySeat = (pred, tries) => {
        let guard = 0;
        while (seats.length < wantDeposits && guard++ < tries) {
          const x = 3 + rnd() * (W - 6) | 0, y = 3 + rnd() * (H - 6) | 0;
          if (t[id(x, y)] !== T.GRASS || nearStart(x, y)) continue;
          if (!pred(x, y)) continue;
          if (seats.some(s2 => Math.hypot(s2.x - x, s2.y - y) < 9)) continue;
          seats.push({ x, y });
        }
      };
      {                                                            // PRIMARY: the crevasses of the mountain base
        const cands = [];
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
          if (t[id(x, y)] !== T.GRASS || nearStart(x, y)) continue;
          if (!nearTerr(x, y, T.MOUNTAIN, 1)) continue;
          let n = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
            if (MapGen.inB(x + dx, y + dy) && t[id(x + dx, y + dy)] === T.MOUNTAIN) n++;
          cands.push({ x, y, s: n + rnd() * 0.5 });
        }
        cands.sort((a, b) => b.s - a.s);
        for (const c of cands) {
          if (seats.length >= wantDeposits) break;
          if (seats.some(s2 => Math.hypot(s2.x - c.x, s2.y - c.y) < 9)) continue;
          seats.push({ x: c.x, y: c.y });
        }
      }
      trySeat((x, y) => nearTerr(x, y, T.FOREST, 2), 500);        // fallback: the forest edge
      trySeat(() => true, 300);                                    // last resort: open ground, still compact
      for (const s2 of seats) oreKnot(s2.x, s2.y);
      // floor: a map must never be starved of stone outright
      let guard = 0;
      while (countType(T.HILLS) < V.oreFloor && guard++ < 40)
        oreKnot(2 + rnd() * (W - 4) | 0, 2 + rnd() * (H - 4) | 0);
    } else paint(T.HILLS, 5, 4, 5);
    paint(T.FERTILE, V.fertile[0], V.fertile[1], V.fertile[2], 12);

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
      seedNear(s.x, s.y, T.FOREST, scarce.terrain === T.FOREST ? 1 : V.nearWood[0] + (rnd() * V.nearWood[1] | 0));
      seedNear(s.x, s.y, T.HILLS, scarce.terrain === T.HILLS ? 1 : V.nearStone[0] + (rnd() * V.nearStone[1] | 0));
      seedNear(s.x, s.y, T.FERTILE, scarce.terrain === T.FERTILE ? 1 : V.nearFood[0] + (rnd() * V.nearFood[1] | 0));
    }
    // clear the immediate start plots
    for (const s of [player, ai])
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        t[id(s.x + dx, s.y + dy)] = T.GRASS;

    /* OLD COUNTRY: someone was here before. Ancient rubble — the game's own
       T.RUIN, the razed-building scar — strewn in singles and pairs across
       the open ground, away from both seats. Painted at generation it is
       never put on the decay clock, so unlike a battle scar it NEVER heals:
       the old country stays old. Walkable, buildable-over, worth nothing —
       pure testimony. */
    if (V.ruinN) {
      const wantRuin = Math.round(V.ruinN * f);
      let laid = 0, rg = 0;
      while (laid < wantRuin && rg++ < 400) {
        const x = 3 + rnd() * (W - 6) | 0, y = 3 + rnd() * (H - 6) | 0;
        if (t[id(x, y)] !== T.GRASS || nearStart(x, y)) continue;
        t[id(x, y)] = T.RUIN;
        if (rnd() < 0.5) {
          const nx = x + ((rnd() * 3 | 0) - 1), ny = y + ((rnd() * 3 | 0) - 1);
          if (MapGen.inB(nx, ny) && t[id(nx, ny)] === T.GRASS && !nearStart(nx, ny))
            t[id(nx, ny)] = T.RUIN;
        }
        laid++;
      }
    }

    /* BARBARIAN CAMPS (tests/raider-camps.mjs), far from both starts — more on
       bigger maps, and more where the mode is harsher. The tile only carries
       the trampled GROUND; the camp itself is a building placed on it in
       G.newGame, with a band of tenders, so it can be pulled down. */
    const camps = [];
    const cm = (CFG.MODES[mode] && CFG.MODES[mode].campMult) != null ? CFG.MODES[mode].campMult : 1;
    const RC = CFG.RAIDER_CAMPS || { perArea: 2, min: 2 };
    const wantCamps = Math.max(RC.min || 2, Math.round((RC.perArea || 2) * f * cm));
    /* AND THE CLEARANCE IS DERIVED, not a taste number. A camp's tenders hold
       ground out to RAIDER_CAMPS.chaseR, and a town lays its buildings out to
       about seven tiles from its hall — so any clearance under the two added
       together puts a barbarian band's yard on top of somebody's lumber camp.
       At the old 14 that happened often, and the rival (whose income is paid
       per LIVING hand) bled a villager every few days from day three and never
       got off the ground. Relaxed in steps if the board can't seat them all,
       so a small map still gets its camps rather than none. */
    const TOWN_RING = 7;
    const wantClear = (RC.chaseR || 7) + TOWN_RING + 4;
    /* …AND A CAMP NEEDS ITS YARD. Tenders mill inside guardR and bands muster
       around the fire, so the ground right around a camp must be OPEN — the
       day the massifs arrived, a camp landed with a crag through its yard and
       its tenders could neither reach prey standing two tiles away nor be
       reached by the war party sent to burn them out. Solid terrain within 2
       tiles disqualifies a spot; like the town clearance, the demand is
       dropped (openNeed 1, then 0) before the camp count is, so a rough map
       still seats its camps. */
    const yardOpen = (x, y, need) => {
      if (need <= 0) return true;
      for (let dy = -need; dy <= need; dy++) for (let dx = -need; dx <= need; dx++) {
        const v = t[id(x + dx, y + dy)];
        if (v === T.MOUNTAIN || v === T.WATER) return false;
      }
      return true;
    };
    /* THE WILDS DO NOT GANG UP. Nothing above stopped two camps landing side
       by side — only distance from the TOWNS was checked — so a bad roll
       could (and did) seat three bands within sight of each other, reading
       as barbarians allied with each other rather than hostile to
       everybody. A camp's own tenders already hold ground out to chaseR
       (RAIDER_CAMPS.chaseR — see "a camp stands in the WILD COUNTRY" above),
       so two camps need AT LEAST that same clearance between them to keep
       their yards from overlapping — reusing the tier's own town-clearance
       number rather than a second hand-picked one, and relaxing in step
       with it so a crowded map still seats every camp. */
    const campsFar = (x, y, clear) => camps.every(c => Math.hypot(x - c.x, y - c.y) > clear);
    /* AND THE WILDS PRESS ON BOTH TRIBES EQUALLY. Alternate which seat each
       new camp must fall nearer to (by straight-line distance — the two
       seats sit on opposite ground, so "nearer to" reads as "that side of
       the board"), so the wild country is never lopsided onto one player's
       doorstep. Dropped in the loosest tiers, same as yardOpen's demand —
       seating every camp still outranks a perfectly even split. */
    for (const [clear, openNeed, enforceSide] of [[wantClear, 2, true], [wantClear - 4, 2, true], [14, 1, false], [10, 0, false]]) {
      let guard = 0;
      while (camps.length < wantCamps && guard++ < 600) {
        const x = 3 + rnd() * (W - 6) | 0, y = 3 + rnd() * (H - 6) | 0;
        const dP = Math.hypot(x - player.x, y - player.y), dA = Math.hypot(x - ai.x, y - ai.y);
        const sideOk = !enforceSide || ((camps.length % 2 === 0) ? dP <= dA : dP > dA);
        // the mountain-shadow clamp is HARD — it never relaxes with the tiers,
        // because a camp the art hides is a camp the player cannot find
        // (MapGen.mtnShadow; a reported day-57 game)
        if (dP > clear && dA > clear && sideOk && t[id(x, y)] === T.GRASS &&
            !MapGen.mtnShadow(x, y, t) &&
            yardOpen(x, y, openNeed) && campsFar(x, y, clear)) {
          t[id(x, y)] = T.CAMP; camps.push({ x, y });
        }
      }
      if (camps.length >= wantCamps) break;
    }

    /* DIFFICULTY DEFENSIBILITY — bias the PLAYER's seat by difficulty, but with
       NATURAL terrain, not a fence. A scattered thicket of woods and rock gathers
       around the seat — denser on the arcs AWAY from the rival, thinning toward
       the sally lane — with a feathered, broken edge and gaps throughout, so it
       reads as organic country the player can lean on, never a perfect square with
       two doorways. Calm sits in heavier cover; Moderate is lightly sheltered;
       Hard gets nothing and must fortify itself. The reachability clamp below still
       guarantees a way out and to every resource. */
    if (mode !== 'hard') {
      const shelter = mode === 'calm' ? 0.85 : 0.5;      // how thick the cover rolls in
      const barrier = () => (rnd() < 0.6 ? T.FOREST : T.HILLS);
      const toRival = Math.atan2(ai.y - player.y, ai.x - player.x);   // the lane we keep clearest
      const R0 = 4.5, R1 = mode === 'calm' ? 8.5 : 7.5, RMID = (R0 + R1) / 2, RHALF = (R1 - R0) / 2;
      const lim = Math.ceil(R1) + 1;
      for (let dy = -lim; dy <= lim; dy++) for (let dx = -lim; dx <= lim; dx++) {
        if (!dx && !dy) continue;
        const d = Math.hypot(dx, dy);
        if (d < R0 - 1.2 || d > R1 + 1.2) continue;
        const x = player.x + dx, y = player.y + dy;
        if (!MapGen.inB(x, y) || t[id(x, y)] !== T.GRASS) continue;    // only close open ground
        // direction weight: 0 straight at the rival (a clear lane to sally), rising
        // smoothly to 1 on the far arc — no discrete sectors, so no geometric seams
        let diff = Math.abs(((Math.atan2(dy, dx) - toRival + Math.PI) % (2 * Math.PI)) - Math.PI);
        const facing = (1 - Math.cos(diff)) / 2;
        // radial feather: thickest mid-band, fading to nothing at the inner/outer
        // edge so the treeline has a soft, ragged boundary
        const taper = Math.max(0, 1 - Math.abs(d - RMID) / (RHALF + 1.2));
        // scattered placement: a low floor everywhere (the odd tree even in a lane)
        // plus per-tile noise, so the cover breaks up into natural clumps and gaps
        const dens = shelter * taper * (0.18 + 0.82 * facing);
        if (rnd() < dens) t[id(x, y)] = barrier();
      }
    }

    /* REACHABILITY CLAMP — no sealed spawns, no soft-locked resources, and —
       new — no sea bulldozed into a land bridge just to satisfy a land-only
       test. The verdict is LAND OR SEA now: if the seats share dry ground,
       a lane is carved along a DRY route (never through water); if the sea
       genuinely divides them, the map holds when both seats' islands offer a
       dock-capable coast on one shared ocean and stand on enough land to
       live on (the viability floor) — and only when the sea itself cannot
       carry the game does the old water-crossing causeway return, as the
       last resort. Resource guarantees follow the same rule: carve along dry
       ground on your own island, PLANT what the island does not hold —
       never annex the isle across the strait. */
    var seaStarts = false;
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
      /* the shortest DRY route a→b (never through water; optionally never
         through `preserve` either, so a lane to a scarce wood cannot be
         forced through its own stands), or null when only the sea connects
         them. BFS on the tile lattice, deterministic — no rnd. */
      const dryPath = (a, b, preserve, stopAdj) => {
        const prev = new Int32Array(W * H).fill(-1);
        const si = id(a.x, a.y), q2 = [si];
        prev[si] = si;
        for (let h2 = 0; h2 < q2.length; h2++) {
          const cur = q2[h2], cx = cur % W, cy = (cur / W) | 0;
          if ((cx === b.x && cy === b.y) ||
              (stopAdj && Math.abs(cx - b.x) + Math.abs(cy - b.y) <= 1)) {
            const path = [];
            for (let i2 = cur; i2 !== si; i2 = prev[i2]) path.push(i2);
            path.push(si);
            return path.reverse();
          }
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (!MapGen.inB(nx, ny)) continue;
            const ni = id(nx, ny);
            if (prev[ni] >= 0 || t[ni] === T.WATER) continue;
            if (preserve != null && t[ni] === preserve) continue;
            prev[ni] = cur; q2.push(ni);
          }
        }
        return null;
      };
      // clear a lane along a dry route with the same 3-tile L brush the old
      // walk used; water is never touched. False when no dry route exists.
      const carveDry = (a, b, preserve, stopAdj) => {
        const path = dryPath(a, b, preserve, stopAdj);
        if (!path) return false;
        for (const i2 of path) {
          const cx = i2 % W, cy = (i2 / W) | 0;
          for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
            const nx = cx + ox, ny = cy + oy;
            if (!MapGen.inB(nx, ny)) continue;
            const v = t[id(nx, ny)];
            if (v !== T.WATER && BLOCKS(v) && v !== preserve) t[id(nx, ny)] = T.GRASS;
          }
        }
        return true;
      };
      /* the classic randomized walk, in two flavours. carveWalk spares
         water (the sea is a fact now) but rolls the SAME rnd sequence the
         old carve did, so a map whose lanes never crossed water generates
         byte-identically to before this change. carveSea is the old
         water-bulldozing walk, kept as the LAST resort for a map whose sea
         cannot carry the game (no shared dock-capable ocean). */
      const walk = (a, b, preserve, stopAdj, clearWater) => {
        let x = a.x, y = a.y, guard2 = 0;
        const clear = (cx, cy) => {
          if (!MapGen.inB(cx, cy)) return;
          const v = t[id(cx, cy)];
          if (!clearWater && v === T.WATER) return;
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
      const carveWalk = (a, b, preserve, stopAdj) => walk(a, b, preserve, stopAdj, false);
      const carveSea = (a, b) => walk(a, b, null, false, true);
      // connected non-water areas, labeled — which shores belong together
      const landLabel = () => {
        const lab = new Int32Array(W * H).fill(-1);
        const area = [];
        for (let i2 = 0; i2 < W * H; i2++) {
          if (t[i2] === T.WATER || lab[i2] >= 0) continue;
          const q2 = [i2]; lab[i2] = area.length;
          let n2 = 0;
          for (let h2 = 0; h2 < q2.length; h2++) {
            const cur = q2[h2], cx = cur % W, cy = (cur / W) | 0;
            n2++;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (!MapGen.inB(nx, ny)) continue;
              const ni = id(nx, ny);
              if (lab[ni] >= 0 || t[ni] === T.WATER) continue;
              lab[ni] = lab[i2]; q2.push(ni);
            }
          }
          area.push(n2);
        }
        return { lab, area };
      };
      // connected water, labeled with sizes — the navigable bodies
      const waterLabel = () => {
        const lab = new Int32Array(W * H).fill(-1);
        const size = [];
        for (let i2 = 0; i2 < W * H; i2++) {
          if (t[i2] !== T.WATER || lab[i2] >= 0) continue;
          const q2 = [i2]; lab[i2] = size.length;
          let n2 = 0;
          for (let h2 = 0; h2 < q2.length; h2++) {
            const cur = q2[h2], cx = cur % W, cy = (cur / W) | 0;
            n2++;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (!MapGen.inB(nx, ny)) continue;
              const ni = id(nx, ny);
              if (lab[ni] >= 0 || t[ni] !== T.WATER) continue;
              lab[ni] = lab[i2]; q2.push(ni);
            }
          }
          size.push(n2);
        }
        return { lab, size };
      };
      /* every water body a landmass could dock on: a 2×2 of open water,
         fully on the board, in a body of at least CFG.DOCK_MIN_WATER tiles,
         with an open tile of THIS landmass on an orthogonal flank —
         Bld.dockSiteOk's own rules, asked of the raw terrain. */
      const dockBodies = (lmLab, lmId, wLab, wSize) => {
        const MINW = (CFG.DOCK_MIN_WATER || 6);
        const out = new Set();
        for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) {
          let wet = true, body = -1;
          for (let dy = 0; dy < 2 && wet; dy++) for (let dx = 0; dx < 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (!MapGen.onBoard(nx, ny) || t[id(nx, ny)] !== T.WATER) { wet = false; break; }
            body = wLab[id(nx, ny)];
          }
          if (!wet || body < 0 || wSize[body] < MINW || out.has(body)) continue;
          for (const [fx, fy] of [[x - 1, y], [x - 1, y + 1], [x + 2, y], [x + 2, y + 1],
                                  [x, y - 1], [x + 1, y - 1], [x, y + 2], [x + 1, y + 2]]) {
            if (!MapGen.inB(fx, fy)) continue;
            const fi = id(fx, fy);
            if (lmLab[fi] === lmId && !BLOCKS(t[fi])) { out.add(body); break; }
          }
        }
        return out;
      };
      // (a) the two tribes must be able to reach each other — BY LAND OR BY
      //     SEA. The classic walks first (sparing the scarce resource, then
      //     not — same rnd stream as ever, water spared now), then a BFS dry
      //     detour the straight walk cannot find, then the sea verdict, and
      //     the causeway only when the sea fails too.
      let reach = flood(player.x, player.y);
      if (!reach[id(ai.x, ai.y)]) {
        carveWalk(player, ai, scarce.terrain);
        reach = flood(player.x, player.y);
        if (!reach[id(ai.x, ai.y)]) { carveWalk(player, ai); reach = flood(player.x, player.y); }
      }
      if (!reach[id(ai.x, ai.y)]) {
        if (carveDry(player, ai, scarce.terrain) || carveDry(player, ai, null))
          reach = flood(player.x, player.y);
      }
      if (!reach[id(ai.x, ai.y)]) {
        const LM = landLabel(), WB = waterLabel();
        const pl = LM.lab[id(player.x, player.y)], al = LM.lab[id(ai.x, ai.y)];
        const pb = dockBodies(LM.lab, pl, WB.lab, WB.size);
        const ab = dockBodies(LM.lab, al, WB.lab, WB.size);
        let shared = false;
        for (const b2 of pb) if (ab.has(b2)) { shared = true; break; }
        /* the VIABILITY FLOOR: a seat island must be a country, not a rock —
           enough standing land for a town and its stations. Below it (or
           with no shared ocean) the map is not sea-playable and the causeway
           returns. 70 tiles ≈ a 5×5 town plot plus three stations of each
           kind plus room to be walled and fought over. */
        const FLOOR = 70;
        if (shared && LM.area[pl] >= FLOOR && LM.area[al] >= FLOOR) {
          seaStarts = true;
        } else {
          carveSea(player, ai);
          reach = flood(player.x, player.y);
        }
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
          /* a lane is carved only along DRY ground — the classic walk first
             (same rnd stream as ever, water spared now), then the BFS detour
             when water stopped the walk. A stand genuinely across the sea
             stays where it is: (c)'s planting provides, never a bulldozed
             strait. */
          if (!ok && near) {
            carveWalk(s, near, rt, true);
            const again = flood(s.x, s.y);
            let opened = false;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = near.x + dx, ny = near.y + dy;
              if (MapGen.inB(nx, ny) && again[id(nx, ny)]) { opened = true; break; }
            }
            if (!opened) carveDry(s, near, rt, true);
          }
        }
      }
      /* (c) THREE OF EACH, WITHIN A WALK (tests/worked-ground.mjs).
         A resource station may only stand on ground its own resource was
         worked OUT of, so "one reachable tile of each kind" — the guarantee
         above — is now the difference between a village that can raise a
         lumber camp and one that can never raise one at all. A seat that rolls
         a single distant stand of timber is not playing a lean game, it is
         playing a broken one, and the rival cannot reason its way out of it.

         So both seats are given at least `min` tiles of every gatherable kind
         inside `r`, planted on open ground beside their own reach when the
         roll did not provide them. THREE is the number because three camps
         still produce meaningfully: a lean start stays hard without being
         dead. The scarce resource is guaranteed too — it stays scarce by
         being few on the board and lean in the ground (×0.6 stock), not by
         being absent from somebody's whole country. */
      const SR = CFG.START_RESOURCE || { min: 3, r: 14 };
      for (const s of [player, ai]) {
        const sreach = flood(s.x, s.y);
        const beside = (x, y) => {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            if (MapGen.inB(x + dx, y + dy) && sreach[id(x + dx, y + dy)]) return true;
          return false;
        };
        for (const rt of [T.FOREST, T.HILLS, T.FERTILE]) {
          const have = [];
          for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            if (t[id(x, y)] !== rt) continue;
            if (Math.hypot(x - s.x, y - s.y) > SR.r) continue;
            if (beside(x, y)) have.push(1);
          }
          if (have.length >= SR.min) continue;
          // …plant the shortfall on open ground the seat can already walk to,
          // never on its own doorstep (the start plots stay clear)
          const spots = [];
          for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            if (t[id(x, y)] !== T.GRASS) continue;
            const d = Math.hypot(x - s.x, y - s.y);
            if (d < 3 || d > SR.r) continue;
            if (!sreach[id(x, y)]) continue;
            spots.push({ x, y, d });
          }
          spots.sort((a, b2) => a.d - b2.d);
          const plant = (list) => {
            for (let k = 0; k < list.length && have.length < SR.min; k++) {
              // spread them out a little — three tiles in one clump is one
              // camp's worth of ground, not three
              const sp = list[k];
              let clash = false;
              for (let dy = -1; dy <= 1 && !clash; dy++) for (let dx = -1; dx <= 1; dx++)
                if (t[id(sp.x + dx, sp.y + dy)] === rt) { clash = true; break; }
              if (clash) continue;
              t[id(sp.x, sp.y)] = rt;
              have.push(1);
            }
          };
          plant(spots);
          /* an ISLAND seat can roll an annulus with no room in it at all —
             widen the walk before giving up, because a start whose island
             simply lacks a resource kind is a stranding, not a lean game.
             Only runs on a shortfall, so ordinary maps are untouched. */
          if (have.length < SR.min) {
            const wide = [];
            for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
              if (t[id(x, y)] !== T.GRASS) continue;
              const d = Math.hypot(x - s.x, y - s.y);
              if (d <= SR.r || d > SR.r * 2) continue;
              if (!sreach[id(x, y)]) continue;
              wide.push({ x, y, d });
            }
            wide.sort((a, b2) => a.d - b2.d);
            plant(wide);
          }
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
    // DENSITY-TIERED STOCK (forest + ore): a stand or deposit is thin at its
    // fringe and rich at its heart. The stock scales with the same 8-neighbour
    // density the renderer draws (sparse edge ×0.6, perimeter ×1, enclosed
    // core ×1.5) — and since the gather rate per terrain is fixed, a villager's
    // time on a tile tracks its stock exactly: fringe tiles clear fast, the
    // dense center takes the longest to cut or mine.
    for (let i = 0; i < W * H; i++) {
      if (t[i] !== T.FOREST && t[i] !== T.HILLS) continue;
      const x = i % W, y = (i / W) | 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && t[ny * W + nx] === t[i]) cnt++;
      }
      resAmount[i] = Math.round(resAmount[i] * (cnt === 8 ? 1.5 : cnt >= 4 ? 1 : 0.6));
    }
    // THE SHALLOW/DEEP SPLIT (CFG.FISH_STOCK): water touching land is shore
    // water — easy to reach and the leanest fishing on the map; open water
    // keeps more. Uses the same "touches a non-water tile" rule the renderer
    // draws its shallows with, so the lean water is the water that LOOKS lean.
    // THE SHOAL EXCEPTION (operator direction: shore fish ran out too fast):
    // the few hash-picked SHOALS — the tiles a villager can line-fish, now
    // one shore tile in nine — carry a BERRY PATCH's stock instead
    // (CFG.RES_AMOUNT[T.FERTILE], so the two stay in sync): fewer good
    // spots, each worth settling by. ON A FOOD-SCARCE MAP THE PRIVILEGE IS
    // WITHHELD — reachable fishing counts toward the food budget, and a
    // rich shoal by the start would quietly cancel the intended scarcity;
    // scarce shoals stay ordinary lean shore water (and the ×0.5 food-
    // scarce water cut above has already run).
    for (let i = 0; i < W * H; i++) {
      if (t[i] !== T.WATER) continue;
      const x = i % W, y = (i / W) | 0;
      let shallow = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (t[ny * W + nx] !== T.WATER) { shallow = true; break; }
      }
      const shoal = shallow && ((x * 73856093 ^ y * 19349663) >>> 0) % 9 === 0;
      if (shoal && scarce.terrain !== T.FERTILE) {
        // remap the tile's OWN base roll into the fertile range — no new
        // rnd() draw, so the seeded stream (and every tuned fixture world
        // downstream of it) is byte-identical to before
        const wr = CFG.RES_AMOUNT[T.WATER], fr = CFG.RES_AMOUNT[T.FERTILE];
        resAmount[i] = Math.round(fr[0] + (resAmount[i] - wr[0]) / (wr[1] - wr[0]) * (fr[1] - fr[0]));
      } else {
        resAmount[i] = Math.round(resAmount[i] * (shallow ? CFG.FISH_STOCK.shallow : CFG.FISH_STOCK.deep));
      }
    }

    /* GOLD SEAMS (tests/gold-mine.mjs). Gold is the one resource with no
       ordinary tile to gather from — it trickles out of the hall and the
       Trading Post and nowhere else. Seams fix that, but never for free: they
       are laid down LAST (so nothing later overwrites them), scattered across
       open ground well away from BOTH towns, and each must sit on land a
       villager could actually walk to, or the mine on it would be a building
       nobody can ever crew. Finding one is exploration; keeping one is a
       fight. */
    {
      const GS = CFG.GOLD_SEAMS || { count: 4, perTile: 0.0015, minFromTown: 10 };
      const want = Math.max(2, Math.round((GS.count || 4) + (GS.perTile || 0) * W * H));
      const walkFrom = (s) => {                    // the open land a seat can walk
        const BLOCKS2 = v => v === T.WATER || v === T.MOUNTAIN || v === T.FOREST || v === T.HILLS || v === T.FERTILE;
        const seen = new Uint8Array(W * H), q = [id(s.x, s.y)];
        seen[q[0]] = 1;
        for (let h = 0; h < q.length; h++) {
          const cur = q[h], cx = cur % W, cy = (cur / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (!MapGen.inB(nx, ny)) continue;
            const ni = id(nx, ny);
            if (seen[ni] || BLOCKS2(t[ni])) continue;
            seen[ni] = 1; q.push(ni);
          }
        }
        return seen;
      };
      /* one plan when the seats share their land (the original single pass,
         byte for byte); when the SEA divides them, each seat's country runs
         its own pass for its own share — or the rival's whole late game
         would sit on the player's island. */
      const plans = seaStarts
        ? [{ reach: walkFrom(player), want: Math.max(2, Math.ceil(want / 2)) },
           { reach: walkFrom(ai), want: Math.max(2, Math.ceil(want / 2)) }]
        : [{ reach: walkFrom(player), want }];
      const seams = [];
      const far = GS.minFromTown || 10;
      for (const plan of plans) {
        let mine = 0;
        let guard3 = 0;
        while (mine < plan.want && guard3++ < 3000) {
          const x = 2 + rnd() * (W - 4) | 0, y = 2 + rnd() * (H - 4) | 0;
          const i = id(x, y);
          if (t[i] !== T.GRASS || !plan.reach[i]) continue;
          if (MapGen.mtnShadow(x, y, t)) continue;   // a seam the art hides is a seam nobody finds
          if (Math.hypot(x - player.x, y - player.y) < far) continue;
          if (Math.hypot(x - ai.x, y - ai.y) < far) continue;
          if (seams.some(s => Math.hypot(s.x - x, s.y - y) < 6)) continue;   // never two in one pocket
          t[i] = T.GOLDORE; resAmount[i] = 0;
          seams.push({ x, y });
          mine++;
        }
        // A COUNTRY WITH NO SEAM AT ALL is one with the whole feature switched
        // off, and a tight or watery roll can genuinely produce one. Relax the
        // rules in order — the spacing first, then the distance from the
        // towns — rather than leaving that side nothing to find.
        for (const relax of [4, 2]) {
          let g4 = 0;
          while (mine < 2 && g4++ < 3000) {
            const x = 2 + rnd() * (W - 4) | 0, y = 2 + rnd() * (H - 4) | 0;
            const i = id(x, y);
            if (t[i] !== T.GRASS || !plan.reach[i]) continue;
            // the mountain-shadow clamp NEVER relaxes (a reported day-9 calm
            // map: the primary pass found one seam, and the relaxation seated
            // the second behind a cliff) — a nearer seam beats an invisible one
            if (MapGen.mtnShadow(x, y, t)) continue;
            if (Math.hypot(x - player.x, y - player.y) < far / relax * 2) continue;
            if (Math.hypot(x - ai.x, y - ai.y) < far / relax * 2) continue;
            if (seams.some(s => Math.hypot(s.x - x, s.y - y) < relax)) continue;
            t[i] = T.GOLDORE; resAmount[i] = 0;
            seams.push({ x, y });
            mine++;
          }
        }
      }
      var goldSeams = seams;
    }

    /* THE STOCK A TILE STARTED WITH. Kept beside the live amount because
       how worked-out a tile IS can only be read against what it held: the
       stone deposits crack open in thirds as they are mined, the way a
       felled wood drops its stand. Written once, never edited. */
    const resMax = resAmount.slice();
    return { terrain: t, resAmount, resMax, scarce: scarce.name, landform, variant,
      worldName: MapGen.worldName(landform, variant),
      spawns: { player, ai, camps, gold: goldSeams, seaStarts } };
  },

  /* the four faces of each landform — see the LANDFORM VARIANTS block in
     generate(). Order matters: the roll indexes this table. */
  VARIANTS: {
    valley: ['classic', 'steppe', 'greatforest', 'oldcountry'],
    lakeland: ['classic', 'delta', 'greatlake', 'pondlands'],
    highlands: ['classic', 'karst', 'highpasses', 'foothills'],
    islands: ['classic', 'fjord', 'archipelago', 'greatisle'],
  },
  // display names — "Highlands · Karst". Without a name the variety is
  // invisible and every map just feels like "a map".
  WORLD_NAMES: {
    valley: 'Valley', lakeland: 'Lakeland', highlands: 'Highlands', islands: 'Islands',
    classic: 'Classic', steppe: 'Steppe', greatforest: 'Great Forest', oldcountry: 'Old Country',
    delta: 'Braided Delta', greatlake: 'Great Lake', pondlands: 'Pondlands',
    karst: 'Karst', highpasses: 'High Passes', foothills: 'Foothills',
    fjord: 'Fjord Coast', archipelago: 'Archipelago', greatisle: 'Great Isle',
  },
  worldName(landform, variant) {
    const lf = this.WORLD_NAMES[landform] || landform || '';
    if (!variant || !this.WORLD_NAMES[variant]) return lf;
    return lf + ' · ' + this.WORLD_NAMES[variant];
  },

  // a shoal: shore water where fish school close enough to catch from land.
  // Hash-derived (~1/9 of shore tiles — the operator thinned them 3× when
  // each shoal got berry-patch stock, see the gen pass), so it needs no save
  // data and matches the renderer's jumping-fish tell exactly — watch the
  // water to find them.
  shoal(x, y) {
    if (!this.onBoard(x, y)) return false;   // off-map rim
    if (S.map.terrain[this.idx(x, y)] !== T.WATER) return false;
    let shore = false;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (this.inB(x + ox, y + oy) && S.map.terrain[this.idx(x + ox, y + oy)] !== T.WATER) { shore = true; break; }
    if (!shore) return false;
    return ((x * 73856093 ^ y * 19349663) >>> 0) % 9 === 0;
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
  // sapper-dug TRENCH/MOAT block land units too. A MOAT is open water to a
  // HULL though (tests/boats-moat-scuttle.mjs) — boats sail flooded channels,
  // friend and foe alike; that's the tradeoff of digging one. Ranged fire is
  // distance-based, so archers/siege still shoot over them: only movement is
  // blocked.
  /* A STONE DEPOSIT STILL BLOCKS, and that was a measured choice. The drawn
     deposit is scattered stone with grass between (the referee’s pick over
     a paved sheet), which makes blocking it the one place the drawn world
     understates the map. Letting it through was tried — the honest fix on
     paper — and tests/variants.mjs showed the rival collapsing on the
     steppe (5 hands by day 45 down to 1): the deposits are part of the
     terrain that shapes its early game. So HILLS stays here, and the
     readability floor in tests/land.mjs exempts deposits BY NAME instead of
     pretending they meet it. If deposits ever stop blocking, re-run the
     steppe before believing it. */
  for (const t of [T.WATER, T.MOUNTAIN, T.FOREST, T.HILLS, T.FERTILE, T.TRENCH, T.MOAT]) a[t] = 1;
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
    // THE MAP EDGE — the outermost ring is off-map black void: nothing walks,
    // floats, fishes, or is built there, in ANY domain. Checked before the water
    // branch so BOATS are kept off the rim too (they'd otherwise sail onto the
    // black and fish jumped in it). The ring is rendered black and is unbuildable
    // (Bld.tileFree / R.draw); the player builds up to it on row 1, which is
    // ordinary passable ground.
    if (!MapGen.onBoard(x, y)) return false;
    if (domain === 'water') return terr === T.WATER || terr === T.MOAT;   // boats: open water — a flooded moat included (docks don't block hulls)
    if (BLOCK_TERR[terr]) {
      // a standing bridge makes a water/moat tile crossable to land units —
      // and so does a LOWERED DRAWBRIDGE, whose deck spans the tile in front
      // of its gate (Bld.deckAt, tests/drawbridge.mjs). Raise it and the
      // crossing goes with it.
      const wet = terr === T.WATER || terr === T.MOAT;
      if (!(wet && ((S.map.bridge && S.map.bridge[i]) || Bld.deckAt(x, y)))) return false;
    }
    const blk = Bld.blockAt(x, y);
    if (blk === 0) return true;
    if (blk === 1) return false;                 // wall
    if (blk === 2) return owner === 'P';         // player gate
    if (blk === 3) return owner === 'A';         // rival gate
    // 4 = an ordinary SOLID building (Bld.solid — everything but the worker
    // plots). Owner-agnostic on purpose: you walk around your own hall, and
    // around the rival's, and so do barbarians and wild animals.
    return false;
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

  // tiles reachable from the open map margin (4-dir; sealed walls stay sealed).
  // Used to keep hostile spawns out of walled-off pockets. Seeds from the
  // OUTERMOST WALKABLE ring (just inside the impassable rim — see passable), so
  // the wilderness network is still found. Returns null on all-water margins.
  borderReach() {
    const spots = [];
    const W = CFG.W, H = CFG.H;
    for (let x = 1; x < W - 1; x++) spots.push({ x, y: 1 }, { x, y: H - 2 });
    for (let y = 1; y < H - 1; y++) spots.push({ x: 1, y }, { x: W - 2, y });
    return this.reachFrom(spots);
  },

  // walkable tiles reachable (4-dir) from any of the given spots; null if none
  // of the seed spots are passable. wallSitesSolid: planning mode — treat a
  // wall/gate SITE under construction as already solid (movement doesn't, see
  // Bld.rebuildBlock, but a seal check that ignored intent would approve a dig
  // whose pocket closes the day the walls finish).
  reachFrom(spots, wallSitesSolid) {
    const W = CFG.W, H = CFG.H;
    const open = new Uint8Array(W * H);
    const q = [];
    const push = (x, y) => {
      if (!this.passable(x, y)) return;
      if (wallSitesSolid) {
        const b = Bld.at(x, y);
        if (b && b.construction > 0 && (b.key === 'wall' || b.key === 'gate')) return;
      }
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

  /* THE SEARCH'S SCRATCH, KEPT. Every call used to allocate and fill a
     W×H Int16Array and ask passable() up to twenty-four times per expanded
     tile (each neighbour, plus the two squeeze checks). The visited map is
     now a generation-stamped buffer that lives across calls — no
     allocation, no fill — and a tile's passability is asked once per
     search and remembered. The expansion order, the queue and the answer
     are exactly what they were; passability cannot change during a search. */
  _pfGen: 0, _pfPrev: null, _pfSeen: null, _pfPass: null, _pfPassGen: null,
  find(sx, sy, tx, ty, owner, domain) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    if (!MapGen.inB(tx, ty)) return null;
    const W = CFG.W, H = CFG.H, id = MapGen.idx, n = W * H;
    const start = id(sx, sy), target = id(tx, ty);
    if (start === target) return [{ x: tx, y: ty }];
    if (!this._pfPrev || this._pfPrev.length !== n) {
      this._pfPrev = new Int32Array(n); this._pfSeen = new Int32Array(n);
      this._pfPass = new Uint8Array(n); this._pfPassGen = new Int32Array(n); this._pfGen = 0;
    }
    const gen = ++this._pfGen, prev = this._pfPrev, seen = this._pfSeen, pass = this._pfPass, passGen = this._pfPassGen;
    // passable, asked once per tile per search; off-board is not passable
    const ok = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const k = y * W + x;
      if (passGen[k] !== gen) { passGen[k] = gen; pass[k] = this.passable(x, y, owner, domain) ? 1 : 0; }
      return pass[k] === 1;
    };
    seen[start] = gen; prev[start] = start;
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
        if (!ok(nx, ny)) continue;
        // no diagonal squeezing between blocked tiles
        if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
        const ni = id(nx, ny);
        if (seen[ni] === gen) continue;
        seen[ni] = gen; prev[ni] = cur;
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
  // MOUND is diggable so the Trench tool can flatten it back to grass (see dig())
  DIGGABLE: { [T.GRASS]: 1, [T.STUMPS]: 1, [T.PEBBLES]: 1, [T.BARREN]: 1, [T.RUIN]: 1, [T.CAMP]: 1, [T.MOUND]: 1 },
  CLEARABLE: { [T.FOREST]: 1, [T.HILLS]: 1, [T.FERTILE]: 1 },
  // open ground a berm may be raised on (NOT a mound already, NOT the founding camp)
  MOUNDABLE_LAND: { [T.GRASS]: 1, [T.STUMPS]: 1, [T.PEBBLES]: 1, [T.BARREN]: 1, [T.RUIN]: 1 },
  /* NOTHING IS WORKED IN THE BLACK (tests/sapper-fees.mjs). Every tool asks
     MapGen.onBoard, not inB: the outermost ring is the map's hard border, and a
     sapper could queue a trench or a mound out there — marks drawn on the void,
     work that could never be reached. */
  isDiggable(x, y) { return MapGen.onBoard(x, y) && !Bld.at(x, y) && !!this.DIGGABLE[S.map.terrain[MapGen.idx(x, y)]]; },
  isClearable(x, y) { return MapGen.onBoard(x, y) && !!this.CLEARABLE[S.map.terrain[MapGen.idx(x, y)]]; },
  bridgeable(x, y) { if (!MapGen.onBoard(x, y)) return false; const t = S.map.terrain[MapGen.idx(x, y)]; return t === T.WATER || t === T.MOAT; },
  // a bridge must SPAN water: land (or an existing bridge) on both OPPOSITE sides.
  // Returns the deck orientation ('h' = spans E–W, 'v' = spans N–S) perpendicular
  // to the water, or null (middle of a lake / no crossing → can't place).
  bridgeCrossing(x, y, owner) {
    if (!this.bridgeable(x, y)) return null;
    const land = (nx, ny) => {
      if (!MapGen.inB(nx, ny)) return false;
      const t = S.map.terrain[MapGen.idx(nx, ny)];
      if (t === T.WATER || t === T.MOAT) return !!(S.map.bridge && S.map.bridge[MapGen.idx(nx, ny)]);  // an existing bridge counts (extend a span)
      // a standing resource (forest/hills/fertile) still counts as the far
      // bank — it blocks land movement same as water, but a sapper can clear
      // it with the same tool right after the bridge goes up, so it must not
      // block the bridge itself or a resource-fringed shore is unbridgeable.
      if (this.CLEARABLE[t]) return true;
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

  /* ---- MOUND: raise a berm on open ground, or reclaim land from water ---- */
  // how deep from the ORIGINAL shore a water tile sits: 1 = shallow (natural land
  // within a tile), up to reclaimReach = the deepest that may ever be reclaimed,
  // 0 = too far out to fill (open water — stays the sea's, transports & warships
  // only). Reclaimed tiles are marked (S.map.reclaimed) so they never count as
  // shore again — that hard-caps reclamation to short stretches, never oceans.
  reclaimDepth(x, y) {
    const reach = (CFG.TERRAFORM && CFG.TERRAFORM.reclaimReach) || 2;
    const natural = (nx, ny) => {
      if (!MapGen.inB(nx, ny)) return false;
      const t = S.map.terrain[MapGen.idx(nx, ny)];
      if (t === T.WATER || t === T.MOAT) return false;                 // water isn't shore
      return !(S.map.reclaimed && S.map.reclaimed[MapGen.idx(nx, ny)]); // reclaimed land isn't shore either
    };
    for (let r = 1; r <= reach; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (natural(x + dx, y + dy)) return r;    // nearest natural-shore ring = depth
      }
    return 0;
  },
  isMoundable(x, y, owner) {
    if (!MapGen.onBoard(x, y) || Bld.at(x, y)) return false;
    const t = S.map.terrain[MapGen.idx(x, y)];
    if (this.MOUNDABLE_LAND[t]) return true;                            // berm on open ground
    if (t === T.WATER || t === T.MOAT) return this.reclaimDepth(x, y) > 0;  // fill near-shore water
    return false;
  },
  // seconds to work this mound tile: berm on land, or shallow/deep reclamation
  moundTime(x, y) {
    const T2 = CFG.TERRAFORM, t = S.map.terrain[MapGen.idx(x, y)];
    if (t === T.WATER || t === T.MOAT) return this.reclaimDepth(x, y) >= 2 ? T2.reclaimDeep : T2.reclaim;
    return T2.mound;
  },
  // do the earthwork: open ground → raised MOUND; water/moat → reclaimed GRASS
  mound(x, y) {
    const i = MapGen.idx(x, y), t = S.map.terrain[i];
    if (this.MOUNDABLE_LAND[t]) S.map.terrain[i] = T.MOUND;
    else if (t === T.WATER || t === T.MOAT) {
      S.map.terrain[i] = T.GRASS;
      if (S.map.reclaimed) S.map.reclaimed[i] = 1;
    } else return false;
    if (S.map.resAmount) S.map.resAmount[i] = 0;
    // seenTerrain is left to updateTile/updateVisibility (see dig) so an edit in
    // the player's fog can't silently rewrite their memory
    if (window.R && R.updateTile) R.updateTile(x, y);
    return true;
  },

  /* Reachability CLAMP: a dig may never pen a town into a tiny sealed pocket. A
     tile touching water becomes a bridgeable moat (reversible) → always allowed;
     otherwise, hypothetically block it and require each TC to keep a sizeable land
     region reachable from just outside its footprint. */
  digWouldSeal(x, y) {
    if (S.map.terrain[MapGen.idx(x, y)] === T.MOUND) return false;   // flattening a mound keeps the tile passable
    if (this.waterAdj(x, y)) return false;
    const i = MapGen.idx(x, y), save = S.map.terrain[i];
    S.map.terrain[i] = T.TRENCH;
    let sealed = false;
    for (const owner of ['P', 'A']) {
      const tc = Bld.tcOf(owner); if (!tc) continue;
      const s = Bld.size('tc'), seeds = [];
      for (let k = -1; k <= s; k++) seeds.push({ x: tc.x + k, y: tc.y - 1 }, { x: tc.x + k, y: tc.y + s }, { x: tc.x - 1, y: tc.y + k }, { x: tc.x + s, y: tc.y + k });
      const open = Path.reachFrom(seeds.filter(sp => Path.passable(sp.x, sp.y)), true);
      let cnt = 0; if (open) for (let j = 0; j < open.length; j++) cnt += open[j];
      if (cnt < 24) { sealed = true; break; }   // penned in — refuse
    }
    S.map.terrain[i] = save;
    return sealed;
  },

  dig(x, y) {
    const i0 = MapGen.idx(x, y);
    if (S.map.terrain[i0] === T.MOUND) {   // the Trench tool levels a mound back to grass
      S.map.terrain[i0] = T.GRASS;
      if (window.R && R.updateTile) R.updateTile(x, y);
      return true;
    }
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
    /* FLOOD FIRST, THEN PAINT ONCE. Painting the dry trench here and letting
       floodMoats paint the flooded channel a moment later did the SAME work
       twice for every spadeful that reaches water — and that work is a whole
       water region (see R.waterDirty), measured at ~300ms a tile on a desktop
       and seconds on a phone. floodMoats paints what it converts, so the tile
       only needs painting here when it stayed a dry ditch. */
    this.floodMoats(x, y);
    if (S.map.terrain[i] === T.TRENCH && window.R && R.updateTile) R.updateTile(x, y);
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
    /* CONVERT THE WHOLE CHANNEL, THEN REPAINT ONCE. Repainting per tile
       (R.updateTile inside the loop) redrew each tile against a HALF-FLOODED
       channel — the flood walks its component in DFS order, so a tile could
       be painted while the ditch three tiles along was still dry, and nothing
       ever came back to it once the rest filled. The visible result was a
       flooded moat that kept the lake's old beach running down the middle of
       it and read as a separate body of water. The terrain is settled first
       and the picture drawn from the finished state. */
    const changed = [];
    for (const [cx, cy] of comp) {
      const ci = MapGen.idx(cx, cy);
      if (S.map.terrain[ci] === T.MOAT) continue;
      S.map.terrain[ci] = T.MOAT;
      // seenTerrain only where the player can actually see it (see dig)
      if (G.visibleAt(cx, cy)) { S.map.seenTerrain[ci] = T.MOAT; changed.push([cx, cy]); }
    }
    if (changed.length && window.R && R.drawTilesAt) R.drawTilesAt(changed);
  },

  clear(x, y) {
    if (!this.isClearable(x, y)) return false;
    const i = MapGen.idx(x, y);
    // a sapper cutting a lane fells real trees too (tests/tree-fall.mjs) —
    // fired BEFORE the flip, while there is still a stand to cut the fall from
    if (S.map.terrain[i] === T.FOREST && window.R && R.startTreeFall) R.startTreeFall(x, y);
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
