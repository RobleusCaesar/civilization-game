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
      /* the hall asks for all three goods the game teaches (food, wood, stone) — and,
         since build 193, enough of them that the lumber camp and the quarry earn it
         (operator: "use that as a way for the player to gather even more resources
         to then ultimately build the town center … more like 4 to 5 minutes"); 500 wood
         and 500 stone since build 195 ("reduce wood and stone to 500"), the wait now
         filled with a road, a hunt and a hunter's lodge */
      tc: { 2: { cost: { wood: 500, food: 350, stone: 500 }, time: 2, support: { n: 1, lv: 1 } } },
      allowed: [],
      win: { hall: 2 },
      draft: false, stock: 1.4,
      /* THE LESSON'S OWN GROUND (operator, build 190: "force people to build
         and gather resources in a selected spot and no where else so we can
         tightly control the flow and education"): each good is gathered only
         round its mark (`r` tiles; `wide` once the beat `after` is done), and
         each building the game teaches stands only on its site — the bush is
         picked bare where the house stands beside it, and the farm goes on its
         soil, so the two bond (Scenarios.mayGather / siteRefusal) */
      strict: {
        gather: {
          food: { mark: 'berries', r: 0, wide: 3, after: 'farm', why: 'Pick the berries Mira showed you.',
            sent: 'Off to the berry bush Mira showed you.', spentWhy: 'The bush is picked bare. A farm opens the other bushes.' },
          /* the grove and the rock Mira names are felled and broken BARE first: a lumber
             camp then stands on the stumps and a quarry on the broken rock (build 193),
             and the stand round each opens once its station is raised */
          wood: { mark: 'forest', r: 0, wide: 2.5, after: 'lumber', why: 'Cut the trees Mira showed you.',
            sent: 'Off to the trees Mira showed you.', spentWhy: 'The grove is felled. A lumber camp opens the woods.' },
          stone: { mark: 'stone', r: 0, wide: 2.5, after: 'quarry', why: 'Break the grey rocks Mira showed you.',
            sent: 'Off to the grey rocks Mira showed you.', spentWhy: 'The rock is broken. A quarry opens the other rocks.' },
        },
        fishWhy: 'Not here. Gather where Mira points.',
        sites: {
          house: { mark: 'houseSite', why: 'The house goes beside the berry bush.' },
          farm: { mark: 'berries', why: 'The farm goes where the berries grew.' },
          lumber: { mark: 'forest', why: 'The lumber camp goes on the trees you felled.' },
          quarry: { mark: 'stone', why: 'The quarry goes where you broke the rock.' },
          /* the road is DRAGGED from the lumber camp past the hall to the farm (operator,
             build 199: "have the road stretch between two or three locations … then we
             also teach the player how to click and drag"): every stretch of it goes on
             Mira's line until the whole line is down, so a drag that wanders lays only
             the line and spends nothing on the wander */
          road: { path: ['roadFrom', 'roadTo'], why: 'Lay the road along the line Mira shows you.' },
        },
      },
    },
    prologue_2: {
      game: 2, mode: 'prologue_2', title: 'The Growing Clan',
      /* its lessons are built, not saved for: the stores pay for the barracks,
         the range, the tower, three stretches of wall and the gate cut into
         them (operator, builds 184 and 187), and since build 196 the dock, a
         fishing boat and the transport that carries two hands to the far isle.
         The home isle holds no gold seam and one small rock (the map's
         homeStone, 60 stone: a player who spent the stores' stone on a road can
         still raise the tower, never the hall by it alone): the hall's next
         storey wants the far isle's stone and gold (the dock lesson's reason —
         operator: "really spend some time on teaching the player the dock").
         Game 1's stations are open in the menu from the start. */
      start: { food: 150, wood: 560, stone: 160, gold: 80 },
      storey: 2,
      tc: { 3: { cost: { wood: 220, stone: 100, gold: 50 }, time: 3, support: { n: 3, lv: 1 } } },
      allowed: ['house', 'road', 'lodge', 'farm', 'lumber', 'quarry'],
      win: { hall: 3 },
      draft: false, stock: 1.3,
    },
    /* THE RECKONING (build 196: "create a pitched battle between the two
       villages, but set it up in the way where the player is set up for
       Success … knock down walls attack the buildings and then ultimately
       destroy the town center"): the clan opens grown — its hall at the third
       storey, its stations worked, a barracks, a range, a sappers' camp and a
       trading post standing, an army on the field — across a river from the
       rival's walled town. No quarry stands: the stone in the stores pays the
       barracks' and the range's storeys, the workshop, the stable, the catapult
       and the bridge (370) and leaves the war camp at the front (250) one
       caravan short — the post's lesson buys that last 60 with wood, while the
       stable rises. The workshop, the stable and the war camp are this game's
       new cards (the script opens them, marked NEW). The wood pays for the whole
       making-ready from the stores (two storeys, six ranks, the workshop, the
       trade, the stable, two riders, the catapult, the sapper, his bridge and
       the war camp: about 1,630, the lumber camp's hands topping it up), so the
       lessons are about the army, never a wait at the trees. */
    prologue_3: {
      game: 3, mode: 'prologue_3', title: 'The Reckoning',
      start: { food: 1200, wood: 1600, stone: 800, gold: 300 },   // build 202: a margin for a chief who raises more than the lesson asks (was 560)
      storey: 3,
      allowed: ['house', 'road', 'lodge', 'farm', 'lumber', 'quarry', 'barracks', 'range', 'tower', 'wall', 'dock', 'sapper', 'trade', 'mine'],
      win: { standard: true },
      draft: true, stock: 1.5,
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

  /* THE LESSON'S OWN GROUND (RULES[id].strict, game 1 since build 190): a
     resource tile the player's hands may work. Not a resource: not ours to
     judge. A good the lesson names: within `r` of its mark (`wide` once its
     beat `after` is done). A good it never names (gold, a shoal): refused.
     Asked by every gather order of the player's (Units.assignGather, the
     taps' UI.lessonBars, a rally) and by the guide's own ring (workFor). */
  strictOf() { const sc = this.live(); return (sc && sc.strict) || null; },
  _gatherRule(x, y) {
    const st = this.strictOf();
    if (!st || !st.gather || typeof S === 'undefined' || !S || !S.map) return null;
    const g = CFG.GATHER[S.map.terrain[y * CFG.W + x]];
    if (!g) return null;
    return { res: g.res, rule: st.gather[g.res] || null };
  },
  mayGather(x, y) {
    const r = this._gatherRule(x, y);
    if (!r) return true;
    if (!r.rule) return false;
    const sc = this.live(), m = sc.marks && sc.marks[r.rule.mark];
    if (!m) return true;
    return Math.hypot(x - m[0], y - m[1]) <= this._reach(r.res, r.rule, m) + 1e-6;
  },
  /* how far round its mark a good may be gathered: `r`, or `wide` once the
     beat `after` is done — OR once the lesson would otherwise leave the player
     with no way to get it (build 210, a playtest: "stuck on cutting the trees
     … i can't cut any old tree"). Two such ways: the station's site is LOST
     (another building stands on it, siteLost), or the mark is SPENT while the
     player is short of that good for what the lesson asks next (`_starved`:
     extra houses had spent the grove's wood, the farm still wanted 60, and
     every other tree stayed shut until the lumber camp two beats later) */
  _reach(res, rule, m) {
    const open = rule.after && ((S.pro && S.pro.done && S.pro.done[rule.after]) || this.siteLost(rule.after) || this._starved(res, m));
    return open && rule.wide != null ? rule.wide : (rule.r || 0);
  },
  /* the mark holds none of its good any more, and the player has less of it
     than the guide's current beat asks (Prologue.goalCost). Asked per tile by
     the guide's own scans, so the answer is kept for a tenth of a second */
  _starved(res, m) {
    const i = m[1] * CFG.W + m[0], g = CFG.GATHER[S.map.terrain[i]];
    if (g && g.res === res && S.map.resAmount[i] > 0) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : 0, c = this._needC;
    let need;
    if (c && c.s === S && c.res === res && now - c.t < 100) need = c.need;
    else {
      need = 0;
      // the beat's OWN price (a building, a unit, its cost) — never goalCost's fallback,
      // the hall's next storey, which every line without a price would ask
      try {
        const P = window.Prologue, b = P && P.beat ? P.beat() : null;
        const gc = b && (b.cost || b.key || b.unit) ? P.goalCost(b) : null;
        need = (gc && gc[res]) || 0;
      } catch (e) {}
      this._needC = { s: S, res, t: now, need };
    }
    return (S.res[res] || 0) < need;
  },
  /* THE WORK IS CARRIED OUT WHERE THE LESSON ALLOWS (build 210): an order on
     a good the lesson names, off its ground, while its own ground still holds
     some, is the player asking for that GOOD — the hand is sent to the nearest
     tile of the lesson's ground that `ok(x, y)` (the unit can work) accepts.
     null: the order stands refused (the good is not the lesson's, its ground
     is spent, or no tile there can be worked) */
  lessonTile(x, y, ok, from) {
    const r = this._gatherRule(x, y);
    if (!r || !r.rule || this.mayGather(x, y)) return null;
    const sc = this.live(), m = sc.marks && sc.marks[r.rule.mark];
    if (!m) return null;
    const reach = this._reach(r.res, r.rule, m), R = Math.ceil(reach);
    let best = null, bd = 1e9;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const tx = m[0] + dx, ty = m[1] + dy;
      if (Math.hypot(dx, dy) > reach + 1e-6 || !MapGen.inB(tx, ty)) continue;
      const i = ty * CFG.W + tx, g = CFG.GATHER[S.map.terrain[i]];
      if (!g || g.res !== r.res || !(S.map.resAmount[i] > 0) || (ok && !ok(tx, ty))) continue;
      const d = from ? Math.hypot(tx + 0.5 - from.x, ty + 0.5 - from.y) : Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = { x: tx, y: ty, res: r.res, say: r.rule.sent || null }; }
    }
    return best;
  },
  // the words a refused gather is answered with (null: not refused)
  gatherWhy(x, y) {
    if (this.mayGather(x, y)) return null;
    const r = this._gatherRule(x, y), st = this.strictOf();
    if (r && r.rule) {
      // the mark spent: the station is what opens the stand, and the words say so
      const sc = this.live(), m = sc.marks && sc.marks[r.rule.mark];
      const i = m ? m[1] * CFG.W + m[0] : -1, g = i >= 0 ? CFG.GATHER[S.map.terrain[i]] : null;
      if (m && !(g && g.res === r.res && S.map.resAmount[i] > 0) && r.rule.spentWhy) return r.rule.spentWhy;
      if (r.rule.why) return r.rule.why;
    }
    return (st && st.fishWhy) || 'Not here.';
  },
  // a shoal is a good no lesson of game 1 names: line-fishing waits for the full game
  fishWhy() { const st = this.strictOf(); return st && st.gather && !st.gather.fish ? (st.fishWhy || 'Not here.') : null; },
  /* a building the lesson teaches stands on its site and nowhere else — until
     one of its kind stands there, when the rule has done its work */
  siteRefusal(key, x, y) {
    const st = this.strictOf();
    if (!st || !st.sites || typeof S === 'undefined' || !S) return null;
    // THE LESSON'S SITES ARE KEPT for the lessons (build 210, a playtest: a second
    // house went up on the berry bush's spent soil, and the farm the lesson
    // waited for could stand nowhere — the game stalled for good)
    const held = this.siteHeld(key, x, y);
    if (held) return held;
    const s = st.sites[key];
    if (!s) return null;
    // a LINE (the road): any tile of it, until every tile of it carries a road
    if (s.path) {
      const line = this.pathTiles(s.path);
      if (!line.length || line.some(t => t[0] === x && t[1] === y)) return null;
      return line.every(t => this.roadAt(t[0], t[1]) || this.lineTaken(t[0], t[1])) ? null : s.why;
    }
    const sc = this.live(), m = sc.marks && sc.marks[s.mark];
    if (!m || (x === m[0] && y === m[1])) return null;
    if (S.buildings.some(b => b.owner === 'P' && b.key === key && b.x === m[0] && b.y === m[1])) return null;
    // a site something else already stands on (an older save) frees its building
    if (this.siteLost(key)) return null;
    return s.why;
  },
  /* a building of another kind on a lesson site its own building has not
     taken: refused in words that name what the ground is kept for. A site is
     kept until a building of its kind stands anywhere (its own rule puts it
     there), the road's line until the whole line is laid */
  siteHeld(key, x, y) {
    const st = this.strictOf(), sc = this.live();
    if (!st || !st.sites || !sc) return null;
    const sz = (typeof Bld !== 'undefined' && Bld.size) ? Bld.size(key) : 1;
    const covers = (tx, ty) => tx >= x && tx < x + sz && ty >= y && ty < y + sz;
    for (const k in st.sites) {
      if (k === key) continue;
      const s = st.sites[k], name = (CFG.BUILDINGS[k] && CFG.BUILDINGS[k].name || k).toLowerCase();
      if (s.path) {
        const line = this.pathTiles(s.path);
        if (!line.length || line.every(t => this.roadAt(t[0], t[1]) || this.lineTaken(t[0], t[1]))) continue;
        if (line.some(t => covers(t[0], t[1]) && !this.roadAt(t[0], t[1]))) return 'Mira keeps this ground for the ' + name + '.';
        continue;
      }
      const m = sc.marks && sc.marks[s.mark];
      if (!m || !covers(m[0], m[1])) continue;
      if (S.buildings.some(b => b.owner === 'P' && b.key === k)) continue;
      return 'Mira keeps this ground for the ' + name + '.';
    }
    return null;
  },
  /* a lesson building's site with another of the player's buildings on it (a
     save from before the sites were kept): the building may then stand on any
     ground its own rules allow, and its good's stand opens (mayGather) */
  siteLost(key) {
    const st = this.strictOf(), sc = this.live(), s = st && st.sites && st.sites[key];
    if (!s || s.path || !sc || typeof S === 'undefined' || !S) return false;
    const m = sc.marks && sc.marks[s.mark];
    if (!m || S.buildings.some(b => b.owner === 'P' && b.key === key)) return false;
    const b = typeof Bld !== 'undefined' && Bld.at ? Bld.at(m[0], m[1]) : null;
    return !!(b && b.key !== key);
  },
  // a stretch of the road's line another of the player's buildings stands on (an older save)
  lineTaken(x, y) {
    const b = typeof Bld !== 'undefined' && Bld.at ? Bld.at(x, y) : null;
    return !!(b && b.owner === 'P' && b.key !== 'road');
  },
  /* the tiles of a straight line between two of the live world's marks, from
     the first — a road the lesson asks for. Empty when either mark is missing
     or the two share neither a row nor a column (a drag lays a straight line) */
  pathTiles(names) {
    const sc = this.live(), mk = sc && sc.marks, a = mk && mk[names[0]], b = mk && mk[names[1]];
    if (!a || !b || (a[0] !== b[0] && a[1] !== b[1])) return [];
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])), sx = Math.sign(b[0] - a[0]), sy = Math.sign(b[1] - a[1]), out = [];
    for (let k = 0; k <= n; k++) out.push([a[0] + sx * k, a[1] + sy * k]);
    return out;
  },
  // a road of the player's on the tile: finished (ground) or a stretch still going down
  roadAt(x, y) {
    if (typeof S === 'undefined' || !S || !S.map) return false;
    if (S.map.roads && S.map.roads[y * CFG.W + x]) return true;
    const b = typeof Bld !== 'undefined' && Bld.at ? Bld.at(x, y) : null;
    return !!(b && b.key === 'road' && b.owner === 'P');
  },

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
    /* A MARK'S OWN STOCK (`tileStock`, the map's): a lesson that needs its
       ground to run out on cue — game 1's bush is picked bare for one
       villager's price, and the farm is raised on its soil (build 190) */
    for (const k in (sc.tileStock || {})) {
      const m = sc.marks && sc.marks[k];
      if (!m) continue;
      const i = m[1] * W + m[0];
      if (CFG.RES_AMOUNT[terrain[i]]) resAmount[i] = sc.tileStock[k];
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
    // the people (the rival's are placed once its hall stands, below)
    const stationed = [];
    for (const u of (sc.units || [])) if ((u.owner || 'P') === 'P') {
      const nu = Units.spawn(u.kind || 'villager', 'P', u.x, u.y);
      if (nu && u.female) nu.female = true;
      // a hand already at work on a station the map raises (game 3's grown town)
      if (nu && Array.isArray(u.work)) stationed.push([nu, u.work]);
    }
    // the buildings already standing (the rival's too, below)
    const raise = (b, own) => {
      G.clearFootprint(b.x, b.y, b.key);
      const nb = Bld.place(own, b.key, b.x, b.y, { free: true, instant: true, noAutoAssign: true });
      if (nb) for (let lv = 1; lv < (b.level || 1); lv++) Bld.finishUpgrade(nb, true);
      /* a yard's rally set by the map (game 3: every yard musters on the field
         by the hall, so the army stands together for Group nearby) */
      if (nb && Array.isArray(b.rally)) nb.rally = { x: b.rally[0], y: b.rally[1] };
      return nb;
    };
    for (const b of (sc.buildings || [])) if ((b.owner || 'P') === 'P') raise(b, 'P');
    for (const [nu, w] of stationed) {
      const b = Bld.at(w[0], w[1]);
      if (!b || b.owner !== 'P' || Bld.workersAssigned(b) >= Bld.maxWorkers(b)) continue;
      nu.task = { type: 'work', id: b.id }; nu.tUnit = 0; nu.tBld = 0;
      Units.setPath(nu, b.x, b.y);
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
    /* THE RIVAL'S TOWN AS THE MAP DRAWS IT (game 3's pitched battle): its hall's
       storey, its walls, towers and works, and its own people — placed once its
       hall stands. A scripted rival (its mode's aiOff) builds and trains nothing
       more: what the map lays down is the whole of it. */
    const atc = Bld.tcOf('A');
    if (atc) for (let lv = 1; lv < (sc.rivalLevel || 1); lv++) Bld.finishUpgrade(atc, true);
    for (const b of (sc.buildings || [])) if (b.owner === 'A') raise(b, 'A');
    for (const u of (sc.units || [])) if (u.owner === 'A') {
      const nu = Units.spawn(u.kind || 'villager', 'A', u.x, u.y);
      if (nu && u.female) nu.female = true;
    }
    /* the animals. One marked `still` grazes where it was put until something
       frightens it (game 2's lesson deer: a lone deer roams, and left to it
       walked off toward the herd across the water before the hunt began) —
       wanderT is grazeIdle's own step clock, so the bolt is untouched. One
       given `hp` falls to that many blows' worth: the lesson deer (2) falls
       to a villager's first, where it grazes — a deer bolts from every blow,
       away from the hunter and so from the hall, and at its full 20 three
       hunts in ten ended 11+ tiles out, the lodge with them (build 185) */
    for (const a of (sc.animals || [])) {
      const u = Units.spawn(a.kind, 'W', a.x, a.y);
      if (u && a.still) u.wanderT = 1e9;
      if (u && a.hp > 0) { u.maxhp = a.hp; u.hp = a.hp; }
    }
    // a relic waiting to be found (game 1's since build 210 — the old one went with build 184's map)
    S.relic = null;
    if (sc.relic && window.Relics && Relics.DEFS && Relics.DEFS[sc.relic.key]) {
      const d = Relics.DEFS[sc.relic.key];
      /* `sight`: a journey world opens with its map revealed, so a relic there is
         found when a person of the clan SEES it (Relics.checkDiscovery), never by
         the map it was drawn on — it stands in the remembered fog until then,
         a landmark that asks to be walked to */
      S.relic = { key: sc.relic.key, x: sc.relic.x, y: sc.relic.y, w: d.w || 1, h: d.h || 1, found: 0, amount: 0, sight: true };
    }
    /* AUTHORED RUINS: what a razed building leaves, drawn by the ruins pass
       (js/ruins.js) on its rubble ground ('x'). Authored rubble is put on no
       clock (G.scheduleRevert is never asked), so it stands for the world's
       life; a house raised on it takes the ground as ever. No journey map
       carries any (operator, build 183: the old village burned OFF the map —
       a new home is not raised beside the ashes of the last one); the
       format keeps them for a later campaign. */
    /* THE TOWN'S OWN ROADS (build 205 — operator: "In the level 2 and level 3 towns,
       add a few premade stretches of roads … between the buildings so it feels more
       like a lived in town"): straight runs [x0, y0, x1, y1] laid as finished roads
       (S.map.roads, at the hall's level like every road) on open grass no building
       stands on. Game 1 carries none: it teaches the road. */
    if (!S.map.roads) S.map.roads = {};
    for (const s of (sc.roads || [])) {
      const [x0, y0, x1, y1] = s, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) {
        const x = x0 + Math.sign(x1 - x0) * k, y = y0 + Math.sign(y1 - y0) * k;
        if (!MapGen.onBoard(x, y) || Bld.at(x, y)) continue;
        const i = y * CFG.W + x;
        if (S.map.terrain[i] === T.GRASS) S.map.roads[i] = 1;
      }
    }
    S.ruins = (sc.ruins || []).map(r => ({ x: r.x, y: r.y, sz: r.sz || 1, c: r.c, v: r.v || 1, m: r.m ? 1 : 0, day: 0 }));
    if (window.Ruins && Ruins.want) for (const r of S.ruins) Ruins.want(r.c, r.v);
    // how far the land is known at the first morning (game 1 shows its whole
    // valley; game 2 its own island and the land bridge, the rival's shore
    // left in the fog for its riders to come out of)
    if (sc.reveal && sc.reveal > 6) G.reveal(Bld.cx(tc) | 0, Bld.cy(tc) | 0, sc.reveal);
    // …and ground charted beyond it (game 2's far isle, which the map lesson points at)
    for (const a of (sc.revealAlso || [])) if (Array.isArray(a) && a.length >= 3) G.reveal(a[0], a[1], a[2]);
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
