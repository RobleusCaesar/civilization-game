"use strict";
/* ================= THE PROLOGUE'S WORLDS (CLAUDE.md, THE PROLOGUE) =================
   An AUTHORED world: a map drawn by hand, its people and animals placed by
   hand, the buildings its lesson allows, the rules its clock needs, and the
   goal that wins it. The format is meant to outlive the prologue (a future
   campaign is more of the same): map + allowed buildings + rival behaviour +
   win condition + script.

   THE MAP lives in js/scenario-maps.js (SCENARIO_MAPS[id], pure data: the
   38x38 board as rows of characters, the halls, the people, the animals, a
   relic, the camera, and the named MARKS the script points at). THE RULES
   live here (Scenarios.RULES[id]): which mode it plays as, what the stores
   hold at the start, what the hall's storeys cost and ask, which buildings
   the menu shows, and what wins. THE SCRIPT lives in js/prologue.js.

   HOW A WORLD IS MADE: Scenarios.found(id) hands the scenario to G.newGame,
   which asks Scenarios.gen(sc) for the terrain in place of MapGen.generate
   (the same shape, so every wrapper round newGame — the V4/V5 painters —
   still runs) and Scenarios.populate(sc, …) for the people in place of the
   rolled start package, the camps, the relic and the herds. Nothing is ever
   rolled that the player would see: the visuals hash the scenario's fixed
   seed string, so every player gets the same valley.

   THE RULES ARE THE WORLD'S, NOT THE GAME'S: Scenarios.apply patches the few
   CFG numbers a scenario names (the hall's storeys) while its world is live,
   and Scenarios.restore puts them back at the top of every G.newGame and
   G.loadJSON — the only two doors into a world — so no other world ever
   sees them. S.scenario (the id) rides the save; a load re-applies. */
const Scenarios = {
  ON: true,
  CHARS: '#.T~rb^g,:_x',
  // the character of each tile → its terrain (the rim '#' is ordinary grass under the void)
  terrainOf(ch) {
    switch (ch) {
      case 'T': return T.FOREST;
      case '~': return T.WATER;
      case 'r': return T.HILLS;
      case 'b': return T.FERTILE;
      case '^': return T.MOUNTAIN;
      case 'g': return T.GOLDORE;
      case ',': return T.STUMPS;
      case ':': return T.PEBBLES;
      case '_': return T.BARREN;
      case 'x': return T.RUIN;          // the scar a razed building leaves (no journey map carries one)
      default: return T.GRASS;
    }
  },

  /* THE RULES. Each scenario plays as its prologue mode (CFG.MODES.prologue_N,
     the dials no map can say) and names here only what its lesson needs:
       start   the stores at the first morning
       storey  the storey the hall starts at (game 2 opens grown); the
               map's own `hall` is where it stands
       tc      per storey of the hall: its price, its days, and what it
               stands on (support: n finished buildings of storey lv)
       allowed the build menu at the first morning — everything else is
               HIDDEN, never greyed; the script unlocks more (Scenarios.unlock)
       win     { hall: N } the hall reaching storey N wins; { standard } the
               ordinary roads (raze the rival hall, or raise the Wonder)
       draft   whether the origin cards are dealt (game 3's lesson)
       stock   a multiplier on every resource tile's stock (generous worlds)
       card    the tier its win pays (CFG.PROLOGUE.CARD, server-checked) */
  RULES: {
    prologue_1: {
      game: 1, mode: 'prologue_1', title: 'The First Fire',
      start: { food: 15, wood: 5, stone: 0, gold: 0 },
      storey: 1,
      tc: { 2: { cost: { wood: 100, food: 50 }, time: 2, support: { n: 1, lv: 1 } } },
      allowed: [],
      win: { hall: 2 },
      draft: false, stock: 1.4,
    },
    prologue_2: {
      game: 2, mode: 'prologue_2', title: 'The Growing Clan',
      start: { food: 120, wood: 90, stone: 0, gold: 20 },
      storey: 2,
      tc: { 3: { cost: { wood: 220, stone: 120 }, time: 3, support: { n: 3, lv: 1 } } },
      allowed: ['house'],
      win: { hall: 3 },
      draft: false, stock: 1.3,
    },
    prologue_3: {
      game: 3, mode: 'prologue_3', title: 'The Two Roads',
      start: { food: 300, wood: 300, stone: 120, gold: 60 },
      storey: 1,
      allowed: ['house', 'farm', 'lumber', 'quarry', 'lodge', 'mine'],
      win: { standard: true },
      draft: true, stock: 2,
    },
  },
  def(id) {
    const m = (typeof SCENARIO_MAPS !== 'undefined' && SCENARIO_MAPS) ? SCENARIO_MAPS[id] : null;
    const r = this.RULES[id];
    if (!m || !r) return null;
    return Object.assign({ id }, m, r);
  },
  // the scenario of the live world, or null
  live() { return (typeof S !== 'undefined' && S && S.scenario) ? this.def(S.scenario) : null; },
  game() { const d = this.live(); return d ? d.game : 0; },

  /* THE TERRAIN, in MapGen.generate's own shape. Stock follows the generator's
     rule (the middle of CFG.RES_AMOUNT, ×0.6 for a tile with fewer than four
     same-kind neighbours, ×1.5 for one with all eight) times the scenario's
     generosity; water is stocked once S exists (populate: G.fishStockAt). */
  gen(sc) {
    const W = CFG.W, H = CFG.H, N = W * H;
    const terrain = new Array(N).fill(T.GRASS), resAmount = new Array(N).fill(0);
    for (let y = 0; y < H; y++) {
      const row = (sc.rows && sc.rows[y]) || '';
      for (let x = 0; x < W; x++) terrain[y * W + x] = this.terrainOf(row[x] || '.');
    }
    const mult = sc.stock || 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = terrain[i], R = CFG.RES_AMOUNT[t];
      if (!R || t === T.WATER) continue;
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && terrain[yy * W + xx] === t) same++;
      }
      const k = same < 4 ? 0.6 : same === 8 ? 1.5 : 1;
      resAmount[i] = Math.round((R[0] + R[1]) / 2 * k * mult);
    }
    const gold = [];
    for (let i = 0; i < N; i++) if (terrain[i] === T.GOLDORE) gold.push({ x: i % W, y: (i / W) | 0 });
    const ai = sc.rival || (sc.marks && sc.marks.rivalPocket ? { x: sc.marks.rivalPocket[0], y: sc.marks.rivalPocket[1] } : { x: W - 4, y: H - 4 });
    return {
      terrain, resAmount, resMax: resAmount.slice(),
      scarce: null,
      landform: sc.landform || 'valley', variant: sc.variant || 'classic',
      worldName: sc.title,
      spawns: { player: { x: sc.hall.x, y: sc.hall.y }, ai: { x: ai.x, y: ai.y }, camps: [], gold, seaStarts: false },
    };
  },

  /* FOUNDING: the one door. The scenario rides G._scenario for exactly one
     G.newGame; the world it makes is an ordinary world from then on. */
  _founding: false,
  found(id, opts) {
    const sc = this.def(id);
    if (!sc) return false;
    opts = opts || {};
    G._scenario = sc;
    this._founding = true;
    try { G.newGame(sc.seed, sc.mode, 'medium', undefined, opts.tunic || 'blue'); }
    finally { G._scenario = null; this._founding = false; }
    return true;
  },

  /* THE PEOPLE AND THE PLACE, in place of the rolled start: called by
     G.newGame once the player's hall stands (p: its tile), with the rival's
     rolled package (pkA) for AI.init. */
  populate(sc, p, pkA) {
    // the stores at the first morning (never the test page's 2,000: a prologue
    // is played as a new player plays it, on the test page too)
    S.res = Object.assign({ food: 0, wood: 0, stone: 0, gold: 0 }, sc.start || {});
    S.scenario = sc.id;
    S.allow = (sc.allowed || []).slice();
    S.allowNew = [];
    // the hall's starting storey (game 2 opens grown) — a founding raise, no news
    const tc = Bld.tcOf('P');
    if (tc) for (let lv = 1; lv < (sc.storey || 1); lv++) Bld.finishUpgrade(tc, true);
    // the people
    for (const u of (sc.units || [])) Units.spawn(u.kind || 'villager', 'P', u.x, u.y);
    // the buildings already standing
    for (const b of (sc.buildings || [])) {
      const own = b.owner || 'P';
      G.clearFootprint(b.x, b.y, b.key);
      const nb = Bld.place(own, b.key, b.x, b.y, { free: true, instant: true, noAutoAssign: true });
      if (nb) for (let lv = 1; lv < (b.level || 1); lv++) Bld.finishUpgrade(nb, true);
    }
    // worked ground is the player's own (a station may stand on it: tests/worked-ground.mjs)
    for (let i = 0; i < S.map.terrain.length; i++) {
      const t = S.map.terrain[i];
      if (t === T.STUMPS || t === T.PEBBLES || t === T.BARREN) S.map.workedBy[i] = 'P';
    }
    // the water's fish, stocked by the game's own rule
    for (let i = 0; i < S.map.terrain.length; i++) {
      if (S.map.terrain[i] !== T.WATER) continue;
      const x = i % CFG.W, y = (i / CFG.W) | 0;
      const f = G.fishStockAt ? G.fishStockAt(x, y) : 0;
      S.map.resAmount[i] = S.map.resMax[i] = f;
    }
    // the rival: at its seat (game 2, 3) — or, where the lesson wants none,
    // a dormant hall in a pocket nobody can reach (game 1: its mode is aiOff)
    const seat = sc.rival || (sc.marks && sc.marks.rivalPocket && { x: sc.marks.rivalPocket[0], y: sc.marks.rivalPocket[1] });
    if (seat) AI.init(seat, pkA);
    else AI.init({ x: CFG.W - 4, y: CFG.H - 4 }, pkA);
    // the animals
    for (const a of (sc.animals || [])) Units.spawn(a.kind, 'W', a.x, a.y);
    // a relic waiting to be found (game 2)
    S.relic = null;
    if (sc.relic && window.Relics && Relics.DEFS && Relics.DEFS[sc.relic.key]) {
      const d = Relics.DEFS[sc.relic.key];
      S.relic = { key: sc.relic.key, x: sc.relic.x, y: sc.relic.y, w: d.w || 1, h: d.h || 1, found: 0, amount: 0 };
    }
    /* AUTHORED RUINS: what a razed building leaves, drawn by the ruins pass
       (js/ruins.js) on its rubble ground ('x'). Authored rubble is put on no
       clock (G.scheduleRevert is never asked), so it stands for the world's
       life; a house raised on it takes the ground as ever. No journey map
       carries any (operator, build 183: the old village burned OFF the map —
       a new home is not raised beside the ashes of the last one); the
       format keeps them for a later campaign. */
    S.ruins = (sc.ruins || []).map(r => ({ x: r.x, y: r.y, sz: r.sz || 1, c: r.c, v: r.v || 1, m: r.m ? 1 : 0, day: 0 }));
    if (window.Ruins && Ruins.want) for (const r of S.ruins) Ruins.want(r.c, r.v);
    // how far the land is known at the first morning (game 1 shows its whole
    // valley; game 2 keeps the fog its scouting lesson needs)
    if (sc.reveal && sc.reveal > 6) G.reveal(Bld.cx(tc) | 0, Bld.cy(tc) | 0, sc.reveal);
    S.map.biome = sc.region || null;
    S.map.worldName = sc.title;
  },

  // the opening view: centred on the scenario's camera tile at the default zoom
  camera(sc) {
    sc = sc || this.live();
    if (!sc || !sc.camera || !window.R) return;
    if (R.defaultZoom) R.cam.z = R.defaultZoom();
    if (R.centerOn) R.centerOn(sc.camera.x + 0.5, sc.camera.y + 0.5);
  },

  // games 1–2 deal no origin cards: the draft is answered before it is asked
  closeDraft() {
    if (!S.draft) return;
    const rival = S.draft.rival || { hand: [], pick: null };
    S.draft = { hand: [], leanKeys: [], rival, intel: 'none', done: true, pickI: null };
  },

  /* THE RULES OVER CFG (apply/restore). Only what a scenario names is
     patched, and the originals are kept to put back. */
  _saved: null,
  apply(id) {
    this.restore();
    const sc = this.def(id);
    if (!sc) return;
    const saved = [];
    const tcd = CFG.BUILDINGS.tc;
    for (const k in (sc.tc || {})) {
      const lv = +k, L = tcd.levels[lv - 1], o = sc.tc[k];
      if (!L) continue;
      saved.push([L, 'cost', L.cost], [L, 'time', L.time]);
      if (o.cost) L.cost = Object.assign({}, o.cost);
      if (o.time != null) L.time = o.time;
    }
    this._saved = saved;
  },
  restore() {
    if (!this._saved) return;
    for (const [obj, key, val] of this._saved) obj[key] = val;
    this._saved = null;
  },
  // the hall's support rule for its next storey, or null for the game's own
  support(tc) {
    const sc = this.live();
    if (!sc || !sc.tc || !tc || tc.owner !== 'P') return null;
    const o = sc.tc[(tc.level || 1) + 1];
    return o && o.support ? { n: o.support.n, lv: o.support.lv } : null;
  },

  /* THE BUILD MENU: only what the lesson needs (S.allow — hidden, never
     greyed). null outside a scenario: every key is the menu's. */
  allows(key) {
    if (typeof S === 'undefined' || !S || !S.scenario || !Array.isArray(S.allow)) return true;
    return S.allow.includes(key);
  },
  unlock(key) {
    if (typeof S === 'undefined' || !S || !Array.isArray(S.allow) || S.allow.includes(key)) return false;
    S.allow.push(key);
    (S.allowNew = S.allowNew || []).push(key);
    if (typeof UI !== 'undefined' && UI.buildMenu) UI.buildMenu();
    return true;
  },
  isNew(key) { return !!(typeof S !== 'undefined' && S && Array.isArray(S.allowNew) && S.allowNew.includes(key)); },
  seen(key) {
    if (typeof S === 'undefined' || !S || !Array.isArray(S.allowNew)) return;
    const i = S.allowNew.indexOf(key);
    if (i >= 0) S.allowNew.splice(i, 1);
  },

  /* THE GOAL: the hall reaching the storey its scenario asks for wins. The
     guide (Prologue.hallWin) celebrates first and ends the run a beat later;
     without one the run ends at once. Never during founding (game 2's hall
     is raised to its starting storey there). */
  onHall(b) {
    if (this._founding) return;
    const sc = this.live();
    if (!sc || !sc.win || !sc.win.hall || b.level < sc.win.hall || (S && S.over)) return;
    if (window.Prologue && Prologue.hallWin) { try { Prologue.hallWin(b); return; } catch (e) {} }
    G.end(true, sc.title + ' — the hall rises.', 'hall');
  },
};
window.Scenarios = Scenarios;
