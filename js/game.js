"use strict";
/* Game state, main loop, day ticks, win/loss, save/load, boot. */

var S = null;   // the whole game state — plain data, JSON-serializable

const G = {
  autosave: null,
  autosaveT: 0,
  lastT: 0,

  // seeded runtime RNG (state lives in S so saves stay coherent)
  rand() {
    S.rngState = (S.rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(S.rngState ^ (S.rngState >>> 15), 1 | S.rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  modeCfg() { return CFG.MODES[S && S.mode] || CFG.MODES.moderate; },

  newGame(seed, modeKey, sizeKey) {
    const mode = CFG.MODES[modeKey] ? modeKey : 'moderate';
    const size = CFG.SIZES[sizeKey] ? sizeKey : 'medium';
    CFG.W = CFG.H = CFG.SIZES[size];
    const gen = MapGen.generate(seed);
    S = {
      seed: String(seed),
      mode,
      sizeKey: size,
      rngState: hashSeed(String(seed)) | 0,
      day: 1, dayT: 0,
      paused: false, over: null,
      res: Object.assign({}, CFG.START_RES),
      wallLevel: 1,                         // village-wide fortification tier (all walls & gates)
      map: {
        W: CFG.W, H: CFG.H,
        terrain: gen.terrain,
        resAmount: gen.resAmount,
        fishStocked: true,                  // water tiles carry fish from generation

        scarce: gen.scarce,
        landform: gen.landform,
        decay: {},                          // idx -> day the depleted/ruined tile regrows to grass
        explored: new Array(CFG.W * CFG.H).fill(0),
        seenTerrain: gen.terrain.slice(),   // what the player last saw, per tile
        seenB: {},                          // last-seen buildings: idx -> {key, level, owner}
        spawns: gen.spawns,
      },
      buildings: [], units: [],
      garrison: [],                         // villagers sheltered inside the Town Center
      nextId: 1,
      wave: { next: CFG.MODES[mode].waveFirst, count: 0 },
      ai: null,
      log: [],
    };
    Bld._block = null;
    const p = gen.spawns.player;
    Bld.place('P', 'tc', p.x, p.y, { free: true, instant: true });
    this.reveal(p.x, p.y, 6);
    for (let i = 0; i < CFG.START_VILLAGERS; i++)
      Units.spawn('villager', 'P', p.x - 1 + i, p.y + 2);
    AI.init(gen.spawns.ai);
    Units.spawnWild('deer', 8);
    Units.spawnWild('cow', 8);

    this.vis = null;
    R.onNewGame();
    this.updateVisibility();
    UI.deselect();
    UI.placing = null;
    UI.builderFor = null;
    UI.settingRally = null;
    document.getElementById('btnPause').textContent = '⏸';
    document.getElementById('endModal').classList.remove('show');
    const LAND = { valley: 'a green valley', lakeland: 'a land of lakes', highlands: 'rugged highlands', islands: 'a chain of islands' };
    this.log(`A new tribe settles ${LAND[gen.landform] || 'the wilds'} (${this.modeCfg().name}). Destroy the rival Town Center to win.`);
    this.log(`Scouts report: ${gen.scarce} is scarce in this valley — claim it before the rival does.`, true);
    this.log('First barbarian raids expected around day ' + S.wave.next);
  },

  log(msg, warn) {
    S.log.unshift({ day: S.day, msg });
    if (S.log.length > 60) S.log.pop();
    UI.toast(msg, warn);
  },

  reveal(cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      const x = cx + dx, y = cy + dy;
      if (MapGen.inB(x, y) && !S.map.explored[MapGen.idx(x, y)]) {
        S.map.explored[MapGen.idx(x, y)] = 1;
        R.fogDirty = true;
      }
    }
  },

  /* ---- three-state fog: black (unexplored), grey (remembered), clear (visible).
     Visibility comes from player buildings and units; while a tile is visible its
     last-seen memory (terrain + buildings) is kept in sync. ---- */
  vis: null,
  visT: 0,
  visibleAt(x, y) {
    const i = MapGen.idx(x, y);
    return this.vis ? !!this.vis[i] : !!S.map.explored[i];
  },
  updateVisibility() {
    const W = CFG.W, H = CFG.H;
    if (!this.vis || this.vis.length !== W * H) this.vis = new Uint8Array(W * H);
    else this.vis.fill(0);
    const vis = this.vis, expl = S.map.explored;
    const mark = (cx, cy, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const x = cx + dx, y = cy + dy;
        if (!MapGen.inB(x, y)) continue;
        const i = MapGen.idx(x, y);
        vis[i] = 1;
        if (!expl[i]) { expl[i] = 1; }
      }
    };
    for (const b of S.buildings)
      if (b.owner === 'P') mark(b.x, b.y, Bld.done(b) ? (Bld.lv(b).vision || 4) : 2);
    for (const u of S.units)
      if (u.owner === 'P') mark(u.x | 0, u.y | 0, CFG.UNIT_VISION);
    // sync last-seen memory on every visible tile
    const liveB = new Map();
    for (const b of S.buildings) liveB.set(MapGen.idx(b.x, b.y), b);
    for (let i = 0; i < W * H; i++) {
      if (!vis[i]) continue;
      if (S.map.seenTerrain[i] !== S.map.terrain[i]) {
        S.map.seenTerrain[i] = S.map.terrain[i];
        R.drawTileAt(i % W, (i / W) | 0);
      }
      const b = liveB.get(i);
      if (b) {
        const sb = S.map.seenB[i];
        if (!sb || sb.key !== b.key || sb.level !== b.level)
          S.map.seenB[i] = { key: b.key, level: b.level, owner: b.owner };
      } else if (S.map.seenB[i]) delete S.map.seenB[i];
    }
    R.fogDirty = true;
  },

  // a freshly depleted or ruined tile greens over after RUIN_DECAY_DAYS
  scheduleRevert(idx) {
    if (!S.map.decay) S.map.decay = {};
    S.map.decay[idx] = S.day + CFG.RUIN_DECAY_DAYS;
  },

  dayTick() {
    // victory and defeat come only through Town Centers falling (see Bld.damage)
    S.day++;
    // worked-out land recovers: stumps, pebbles and spent soil regrow into
    // their source terrain with a lean restock, so no resource is ever gone
    // for good — a starved player can always grind back, just slowly.
    // Ruins simply fade to grass.
    if (S.map.decay) {
      const SOURCE = { [T.STUMPS]: T.FOREST, [T.PEBBLES]: T.HILLS, [T.BARREN]: T.FERTILE };
      const scarceTerr = { wood: T.FOREST, stone: T.HILLS, food: T.FERTILE }[S.map.scarce];
      let regrown = false;
      for (const k in S.map.decay) {
        if (S.day < S.map.decay[k]) continue;
        const i = +k, t = S.map.terrain[i];
        if (SOURCE[t] !== undefined) {
          const src = SOURCE[t];
          const r = CFG.RES_AMOUNT[src];
          let amt = (r[0] + r[1]) / 2 * CFG.REGROW_FRACTION;
          if (src === scarceTerr) amt *= 0.6;      // the scarce resource stays lean
          S.map.terrain[i] = src;
          S.map.resAmount[i] = Math.round(amt);
          R.updateTile(i % CFG.W, (i / CFG.W) | 0);
          regrown = true;
        } else if (t === T.RUIN) {
          S.map.terrain[i] = T.GRASS;
          R.updateTile(i % CFG.W, (i / CFG.W) | 0);
        }
        delete S.map.decay[k];
      }
      if (regrown && !S.regrowSeen) {
        S.regrowSeen = true;
        this.log('🌱 Worked-out land recovers in time — old clearings and pits are worth working again');
      }
    }
    Bld.dailyProduction('P');
    Units.dailySpawns();
    Combat.maybeWave();
    AI.daily();

    // the tribe endures: if every villager is dead (none on the map, none
    // sheltering, none in training), two survivors step out of the Town
    // Center — a wiped workforce is a setback, never a soft game-over
    {
      const tc = Bld.tcOf('P');
      if (tc && Bld.done(tc) &&
          !S.units.some(u => u.owner === 'P' && Units.isVillager(u)) &&
          S.garrison.length === 0 &&
          !tc.queue.some(q => q.unit === 'villager')) {
        for (let i = 0; i < 2; i++) {
          const spot = MapGen.findNear(tc.x, tc.y + 1, 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y)) || { x: tc.x, y: tc.y + 1 };
          Units.spawn('villager', 'P', spot.x, spot.y);
        }
        this.log('🛖 Two villagers emerge from the Town Center — the tribe endures', true);
      }
    }
  },

  end(win, msg) {
    if (S.over) return;
    S.over = { win, msg };
    S.paused = false;
    UI.showEnd(win, msg);
  },

  /* ---------------- save / load ---------------- */
  saveJSON() { return JSON.stringify(S); },
  loadJSON(json) {
    const data = JSON.parse(json);
    if (!data || !data.map || !Array.isArray(data.map.terrain))
      throw new Error('not a Neolithic save file');
    const w = data.map.W || 40, h = data.map.H || 40;
    if (data.map.terrain.length !== w * h)
      throw new Error('not a Neolithic save file');
    CFG.W = w; CFG.H = h;
    // size labels shifted a tier (old small/medium/large → medium/large/xlarge):
    // re-key old saves by their actual map width so the menu reads true
    if (!CFG.SIZES[data.sizeKey] || CFG.SIZES[data.sizeKey] !== w) {
      const match = Object.keys(CFG.SIZES).find(k => CFG.SIZES[k] === w);
      data.sizeKey = match || (w <= 34 ? 'medium' : w <= 45 ? 'large' : 'xlarge');
    }
    if (!data.wallLevel) data.wallLevel = 1;
    if (!data.map.resAmount) {
      // older save: give surviving resource tiles an average stock
      data.map.resAmount = data.map.terrain.map(t => {
        const r = CFG.RES_AMOUNT[t];
        return r ? Math.round((r[0] + r[1]) / 2) : 0;
      });
    }
    if (!data.garrison) data.garrison = [];
    if (data.ai && !data.ai.persona) data.ai.persona = 'homesteader';   // pre-persona save: the classic temperament
    if (!data.map.seenTerrain) data.map.seenTerrain = data.map.terrain.slice();
    if (!data.map.seenB) data.map.seenB = {};
    if (!data.map.decay) data.map.decay = {};
    if (!data.map.fishStocked) {
      // pre-dock save: stock its waters so fishing works after loading
      const fr = CFG.RES_AMOUNT[T.WATER];
      for (let i = 0; i < data.map.terrain.length; i++)
        if (data.map.terrain[i] === T.WATER && !data.map.resAmount[i])
          data.map.resAmount[i] = Math.round((fr[0] + fr[1]) / 2);
      data.map.fishStocked = true;
    }
    S = data;
    Bld._block = null;
    S.paused = true;
    document.getElementById('btnPause').textContent = '▶';
    UI.deselect();
    UI.placing = null;
    this.vis = null;
    R.onNewGame();
    this.updateVisibility();
    if (S.over) UI.showEnd(S.over.win, S.over.msg);
  },

  /* ---------------- main loop ---------------- */
  frame(t) {
    const dt = Math.min(0.1, (t - G.lastT) / 1000 || 0.016);
    G.lastT = t;
    if (S && !S.paused && !S.over) {
      const dtDays = dt * 1000 / CFG.DAY_MS;
      S.dayT += dt * 1000;
      let guard = 0;
      while (S.dayT >= CFG.DAY_MS && guard++ < 4) {
        S.dayT -= CFG.DAY_MS;
        G.dayTick();
        if (!S || S.over) break;
      }
      if (S && !S.over) {
        Bld.update(dtDays);
        Units.update(dt);
        Combat.update(dt);
        G.visT -= dt;
        if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
        G.autosaveT -= dt;
        if (G.autosaveT <= 0) { G.autosaveT = 10; G.autosave = G.saveJSON(); }
      }
    }
    if (S) {
      R.draw(dt);
      UI.refresh(dt);
    }
    requestAnimationFrame(G.frame);
  },
};

window.addEventListener('load', () => {
  R.init();
  UI.init();
  G.newGame(String((Math.random() * 1e9) | 0));
  requestAnimationFrame(t => { G.lastT = t; requestAnimationFrame(G.frame); });
});
