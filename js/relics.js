/* ================= WILDERNESS RELICS (tests/relics.mjs) =================
   One hidden relic per map, deep in the wild country: the work of a vanished
   people, finer than anything the player can raise, half-swallowed by the
   land. The player stumbles on it while exploring, takes a one-time windfall
   (gold-spark burst + toast), and can tap it ever after to read what it is.

   PURELY ADDITIVE, BY CONSTRUCTION. Placement only READS the map; nothing
   here writes a tile, blocks a path, claims buildability or touches fog
   logic — the relic is one small object on S plus a drawing. Tile data is
   bit-identical with relics on and off (pinned, the same way the formation
   tracer is). If no valid site exists, no relic is placed and the map is
   never re-rolled.

   DISCOVERY fires the first time the player's own fog reveal uncovers any
   footprint tile (G.updateVisibility calls checkDiscovery). The reward is
   rolled at that moment, granted once, and the whole record rides in the
   save (S.relic) — reloading never re-grants. A dev x-ray (G.freeVis) and
   the title demo are not exploration and never trigger it.

   THE AI IS BLIND TO IT. A relic is not a building and not a unit; nothing
   in ai.js can see it, so rival behavior is identical with and without —
   verified explicitly by the contract test.

   ART rides the formation pipeline's conventions rather than a parallel
   system: assets/features/relic/relic-{W}x{H}-{key}-{letter}.png, footprint
   in the filename, 128 art-px per tile, ?v= cache-busting, the ?dev=1
   conform/drop tools, and a 404 falls back to the procedural placeholder
   below — never an error, never a broken map. Relics are a DECOR category:
   art plus a derived alpha silhouette, with an EMPTY blocked set — zero
   passability meaning. */
const Relics = {
  MAX_PER_MAP: 1,      // the tunable count — 0 disables placement entirely
  EDGE_MARGIN: 4,      // never inside this ring of the map edge
  DEEP_R: 20,          // "deep wilderness": at least this far from both halls (relaxes to 14)
  /* THE WINDFALL, per resource. Food/wood/stone at 50–150 sit at roughly a
     day or two of a worked station — a real bump, never an economy. GOLD IS
     ITS OWN SCALE: gold trickles (a mine's two hands, the trade post's thin
     margins) and a hall's level-2 line is 45 gold, so a flat 50–150 would
     hand the player half the mid-game gold curve. 20–60 ≈ a hall upgrade's
     gold line at the top end — felt, not distorting. */
  REWARD: { food: [50, 150], wood: [50, 150], stone: [50, 150], gold: [20, 60] },

  /* The ten. `land` gates which maps a relic may appear on (null = any);
     `base` is the ground the footprint itself must stand on; `need` is a
     hard adjacency (within r tiles of the footprint), `wish` a soft one
     that only sweetens a site's score. Flavor is the inspect panel's text —
     plain, a little haunted, and it never says who built these things. */
  DEFS: {
    aqueduct: { key: 'aqueduct', name: 'The Broken Aqueduct', land: 'valley', res: 'stone', w: 4, h: 2,
      base: 'grass', wish: { ts: [2], r: 3 },
      flavor: 'Arches stride across the field, cut from dressed stone finer than any mason alive could shape. Three still stand. One still carries its thread of water, patiently, to a cistern that is no longer anywhere.' },
    fallen: { key: 'fallen', name: 'The Fallen Colossus', land: 'valley', res: 'stone', w: 3, h: 2,
      base: 'grass',
      flavor: 'A carved head lies half-sunk in the turf, and an open hand reaches from the grass a spear-throw away. The face has weathered past knowing. Whoever it watched over, it is not watching now.' },
    drowned: { key: 'drowned', name: 'The Drowned Village', land: 'lakeland', res: 'wood', w: 3, h: 2,
      base: 'water', shoreBeside: true,
      flavor: 'Rows of black pilings break the surface in lines too straight for nature. One roof ridge still shows above the water. Nobody left here in a hurry — the doors were shut, and the boats were gone.' },
    trackway: { key: 'trackway', name: 'The Bog Trackway', land: 'lakeland', res: 'gold', w: 4, h: 1,
      base: 'grass', need: { ts: [2], r: 2 },
      flavor: 'A timber road runs dead level across the mire, its joinery still tight after all this time. Beside it lie the offerings paid for safe crossing: shields, cups, a wheel. None of them were ever collected.' },
    cyclopean: { key: 'cyclopean', name: 'The Cyclopean Wall', land: 'highlands', res: 'stone', w: 4, h: 1,
      base: 'grass', need: { ts: [10], r: 2 },
      flavor: 'A wall runs over the ridge, every block larger than a house, fitted without mortar so closely a knife finds no seam. No quarry within a season’s haul could have yielded them. It was not built against anything that walks.' },
    starcircle: { key: 'starcircle', name: 'The Star Circle', land: 'highlands', res: 'gold', w: 3, h: 3,
      base: 'grass', wish: { ts: [3, 10], r: 3 },
      flavor: 'A ring of standing stones, one toppled, older than the hills’ own names. On the longest day the shadows still fall exactly where they were meant to. The reckoning goes on whether anyone is left to read it or not.' },
    leviathan: { key: 'leviathan', name: 'The Leviathan Fall', land: 'islands', res: 'food', w: 4, h: 2,
      base: 'grass', need: { ts: [2], r: 1 },
      flavor: 'A whale’s ribs arch out of the sand, bleached and picked clean, tall as a raised hall. The sea gave this up long before your people came. Whatever could beach such a thing has never come back for it.' },
    ghostharbor: { key: 'ghostharbor', name: 'The Ghost Harbor', land: 'islands', res: 'wood', w: 3, h: 2,
      base: 'grass', need: { ts: [2], r: 1 },
      flavor: 'A stone breakwater curves out into deep water, the mooring rings still set fast. The prow of one ship remains, an eye carved on the bow. It has watched the horizon longer than anyone has been missing.' },
    burnedhall: { key: 'burnedhall', name: 'The Burned Hall', land: null, res: 'wood', w: 2, h: 2,
      base: 'grass',
      flavor: 'A great house, reduced to a ring of charred posts. The hearthstone at its center is unbroken, swept clean by years of wind. Whatever was worth carrying out was carried out; the rest they left to the fire.' },
    lonetower: { key: 'lonetower', name: 'The Lone Tower', land: null, res: 'stone', w: 2, h: 2,
      base: 'grass', wish: { ts: [3, 10], r: 3 },
      flavor: 'A round tower, roofless, its stair spiraling up to open sky. From the top a watcher could see three days’ walk in any direction. Whatever needed seeing that far is not here anymore — or it is, and the tower stopped mattering.' },
  },

  /* ---------------- placement (G.newGame, after the camps) ----------------
     Seeded off the MAP SEED through its own hash — zero draws from the run's
     RNG, so a relic on or off can never shift a card deal — and every probe
     comes from that one stream, so a seed always hides the same relic in the
     same place. */
  place(gen) {
    S.relic = null;
    if (this.MAX_PER_MAP < 1) return null;
    const rng = mulberry32(hashSeed(String(S.seed == null ? '' : S.seed) + '::relic'));
    const land = (S.map && S.map.landform) || (gen && gen.landform) || null;
    const pool = Object.values(this.DEFS).filter(d => !d.land || d.land === land);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0; const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    // the landform's OWN relics lead; the two any-landform pieces are the
    // fallback — so a lakeland map usually hides a lakeland thing, and the
    // Lone Tower doesn't end up on half the maps in the world
    pool.sort((a, b) => (a.land ? 0 : 1) - (b.land ? 0 : 1));
    for (const deep of [this.DEEP_R, 14]) {
      for (const def of pool) {
        const spot = this._site(def, rng, deep);
        if (spot) {
          S.relic = { key: def.key, x: spot.x, y: spot.y, w: def.w, h: def.h, found: 0, amount: 0 };
          return S.relic;
        }
      }
    }
    return null;   // no worthy ground — this map simply keeps its secret elsewhere
  },
  _site(def, rng, deep) {
    const W = CFG.W, H = CFG.H, M = this.EDGE_MARGIN;
    const spanX = W - 2 * M - def.w, spanY = H - 2 * M - def.h;
    if (spanX < 1 || spanY < 1) return null;
    let best = null, bs = -1;
    for (let t = 0; t < 400; t++) {
      const x = M + ((rng() * spanX) | 0), y = M + ((rng() * spanY) | 0);
      const s = this._score(def, x, y, deep);
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return bs >= 0 ? best : null;
  },
  // -1 = the ground refuses; otherwise a score (soft wishes + depth)
  _score(def, x, y, deep) {
    const terr = S.map.terrain, idx = MapGen.idx;
    const P0 = S.map.spawns.player, A0 = S.map.spawns.ai;
    const cx = x + def.w / 2, cy = y + def.h / 2;
    if (Math.hypot(cx - P0.x, cy - P0.y) < deep || Math.hypot(cx - A0.x, cy - A0.y) < deep) return -1;
    const baseT = def.base === 'water' ? T.WATER : T.GRASS;
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      if (terr[idx(x + dx, y + dy)] !== baseT) return -1;
    }
    /* never on or beside a RESOURCE NODE — a relic must not read as claiming
       (or crowding) anything harvestable, and it never sits where a gold
       seam's works would rise around it */
    const NODE = { [T.FOREST]: 1, [T.HILLS]: 1, [T.FERTILE]: 1, [T.GOLDORE]: 1 };
    for (let dy = -1; dy <= def.h; dy++) for (let dx = -1; dx <= def.w; dx++) {
      const nx = x + dx, ny = y + dy;
      if (MapGen.inB(nx, ny) && NODE[terr[idx(nx, ny)]]) return -1;
    }
    const within = (ts, r) => {
      for (let dy = -r; dy < def.h + r; dy++) for (let dx = -r; dx < def.w + r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (MapGen.inB(nx, ny) && ts.indexOf(terr[idx(nx, ny)]) >= 0) return true;
      }
      return false;
    };
    if (def.need && !within(def.need.ts, def.need.r)) return -1;
    if (def.shoreBeside) {   // the drowned village stands off a real shore
      let land = false;
      for (let dy = -1; dy <= def.h && !land; dy++) for (let dx = -1; dx <= def.w; dx++) {
        const nx = x + dx, ny = y + dy;
        if (MapGen.inB(nx, ny) && terr[idx(nx, ny)] === T.GRASS) { land = true; break; }
      }
      if (!land) return -1;
    }
    /* never squatting a CHOKE: a land relic wants broadly open ground around
       it, so it can't visually sit astride the one narrow pass (it blocks
       nothing either way — this is about how the map reads) */
    if (def.base !== 'water') {
      let open = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = (x + (def.w >> 1)) + dx, ny = (y + (def.h >> 1)) + dy;
        if (MapGen.inB(nx, ny) && Path.passable(nx, ny)) open++;
      }
      if (open < 16) return -1;
    }
    let s = Math.min(Math.hypot(cx - P0.x, cy - P0.y), Math.hypot(cx - A0.x, cy - A0.y)) * 0.1;
    if (def.wish && within(def.wish.ts, def.wish.r)) s += 10;
    return s;
  },

  /* ---------------- discovery (G.updateVisibility) ---------------- */
  checkDiscovery() {
    const r = S.relic;
    if (!r || r.found || this.MAX_PER_MAP < 1) return;
    if (window.Screens && Screens._demo) return;      // the title demo does not go treasure-hunting
    if (G.freeVis) return;                            // a dev x-ray is not exploration
    const expl = S.map.explored, idx = MapGen.idx;
    let seen = false;
    for (let dy = 0; dy < r.h && !seen; dy++) for (let dx = 0; dx < r.w; dx++)
      if (expl[idx(r.x + dx, r.y + dy)]) { seen = true; break; }
    if (!seen) return;
    const def = this.DEFS[r.key] || {};
    const range = this.REWARD[def.res] || [50, 150];
    const amt = range[0] + Math.floor(G.rand() * (range[1] - range[0] + 1));
    S.res[def.res] = (S.res[def.res] || 0) + amt;
    r.found = S.day || 1; r.amount = amt;
    if (window.R && R.startBondSpark) {
      R.startBondSpark(r.x + r.w / 2 - 0.5, r.y + r.h / 2 - 0.5);
      R.float(r.x + r.w / 2, r.y + r.h / 2 - 0.6, '+' + amt + ' ' + def.res, '#ffe9a3');
    }
    if (window.UI && UI.toast) UI.toast(`✨ ${def.name} — +${amt} ${def.res}`);
    G.log(`✨ ${def.name} found — +${amt} ${def.res}`, true);
  },

  // is a FOUND relic under this tile? (the inspect tap — never before discovery)
  hitAt(x, y) {
    const r = S.relic;
    return !!(r && r.found && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  },

  /* ---------------- rendering (render.js hooks) ---------------- */
  art(key) {
    const hand = window.Assets && Assets.relicArt && Assets.relicArt[key];
    return hand || this._placeholder(this.DEFS[key]);
  },
  _ph: {},
  /* the 404 stand-in: worked pale stones half-sunk in a ragged patch of old
     ground, lichen creeping back over them. Drawn once per relic at the
     world's own 32px-per-tile density; hand art replaces it file by file. */
  _placeholder(def) {
    if (!def) return document.createElement('canvas');
    if (this._ph[def.key]) return this._ph[def.key];
    const s = 32, c = document.createElement('canvas');
    c.width = def.w * s; c.height = def.h * s;
    const q = c.getContext('2d');
    // MASK TO POSITIVE: hashSeed can exceed 2^31, and ART.rng's `seed|0`
    // would wrap it negative — a Park-Miller stream below zero paints nothing
    const rr = ART.rng((hashSeed(def.key + '::ph') & 0x7fffffff) || 1);
    // the worn ground, fading out at torn edges
    for (let i = 0; i < def.w * def.h * 34; i++) {
      const a = rr() * Math.PI * 2, d = Math.pow(rr(), 0.55);
      const px = c.width / 2 + Math.cos(a) * d * (c.width * 0.46);
      const py = c.height / 2 + Math.sin(a) * d * (c.height * 0.40);
      q.globalAlpha = 0.5 - d * 0.3;
      q.fillStyle = rr() < 0.5 ? '#4a3c26' : '#5c4a2e';
      q.fillRect(px | 0, py | 0, 2, 1);
    }
    q.globalAlpha = 1;
    // old dressed stones, finer than fieldstone, half-buried at odd angles
    const ST = ART.PALETTE.stone, GR = ART.PALETTE.grass;
    const n = def.w * def.h * 3 + 3;
    for (let i = 0; i < n; i++) {
      const bw = 4 + ((rr() * 6) | 0), bh = 3 + ((rr() * 3) | 0);
      const px = 2 + ((rr() * (c.width - bw - 4)) | 0);
      const py = 2 + ((rr() * (c.height - bh - 4)) | 0);
      q.fillStyle = '#241d15'; q.fillRect(px - 1, py + 1, bw + 2, bh + 1);   // sunk edge
      q.fillStyle = ST[2]; q.fillRect(px, py, bw, bh);
      q.fillStyle = ST[3]; q.fillRect(px, py, bw, 1);
      q.fillStyle = ST[1]; q.fillRect(px, py + bh - 1, bw, 1);
      if (rr() < 0.6) { q.fillStyle = GR[2]; q.fillRect(px + ((rr() * bw) | 0), py + ((rr() * bh) | 0), 2, 1); }   // lichen
    }
    this._ph[def.key] = c;
    return c;
  },
  // drawn after the terrain cache + formation layer, before buildings: the
  // relic lies IN the land. Fog does the rest — remembered ground dims it,
  // unexplored ground has nothing drawn at all.
  draw(g) {
    const r = S.relic;
    if (!r || this.MAX_PER_MAP < 1) return;
    const TL = CFG.TILE, expl = S.map.explored, idx = MapGen.idx;
    let anyE = false, anyV = false;
    for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) {
      const i = idx(r.x + dx, r.y + dy);
      if (expl[i]) anyE = true;
      if (G.vis && G.vis[i]) anyV = true;
    }
    if (!anyE) return;
    const img = this.art(r.key);
    if (!img || !img.width) return;
    const dw = r.w * TL, dh = dw * (img.height / img.width);
    if (!anyV) g.globalAlpha = 0.6;   // remembered, not watched — ghosted like a building
    g.drawImage(img, r.x * TL, (r.y + r.h) * TL - dh, dw, dh);
    g.globalAlpha = 1;
  },
  // a discovered relic is a LANDMARK: a small gold pip on the minimap
  drawMini(g) {
    const r = S.relic;
    if (!r || !r.found) return;
    g.fillStyle = '#ffe9a3';
    g.fillRect(r.x * 2 - 1, r.y * 2 - 1, 4, 4);
    g.fillStyle = '#b98a2e';
    g.fillRect(r.x * 2, r.y * 2, 2, 2);
  },
};

// classic-script global, same deal as every other module here
window.Relics = Relics;
