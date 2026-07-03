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

  newGame(seed, modeKey) {
    const mode = CFG.MODES[modeKey] ? modeKey : 'moderate';
    const gen = MapGen.generate(seed);
    S = {
      seed: String(seed),
      mode,
      rngState: hashSeed(String(seed)) | 0,
      day: 1, dayT: 0,
      paused: false, over: null,
      res: Object.assign({}, CFG.START_RES),
      map: {
        terrain: gen.terrain,
        explored: new Array(CFG.W * CFG.H).fill(0),
        spawns: gen.spawns,
      },
      buildings: [], units: [],
      nextId: 1,
      wave: { next: CFG.MODES[mode].waveFirst, count: 0 },
      ai: null,
      log: [],
    };
    const p = gen.spawns.player;
    Bld.place('P', 'tc', p.x, p.y, { free: true, instant: true });
    this.reveal(p.x, p.y, 6);
    for (let i = 0; i < CFG.START_VILLAGERS; i++)
      Units.spawn('villager', 'P', p.x - 1 + i, p.y + 2);
    AI.init(gen.spawns.ai);
    Units.spawnWild('deer', 8);
    Units.spawnWild('cow', 8);

    R.onNewGame();
    UI.deselect();
    UI.placing = null;
    UI.builderFor = null;
    document.getElementById('btnPause').textContent = '⏸';
    document.getElementById('endModal').classList.remove('show');
    this.log(`A new tribe settles the valley (${this.modeCfg().name}). Gather, build, survive.`);
    this.log('First raiders expected around day ' + S.wave.next);
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

  revealT: 0,
  revealAroundUnits(dt) {
    this.revealT -= dt;
    if (this.revealT > 0) return;
    this.revealT = 0.4;
    for (const u of S.units)
      if (u.owner === 'P') this.reveal(u.x | 0, u.y | 0, CFG.UNIT_VISION);
  },

  dayTick() {
    S.day++;
    Bld.dailyProduction('P');
    Units.dailySpawns();
    Combat.maybeWave();
    AI.daily();
    this.checkWin();
  },

  checkWin() {
    if (S.over) return;
    const total = S.res.food + S.res.wood + S.res.stone + S.res.gold;
    const pop = Units.popUsed('P');
    if (total >= CFG.WIN.econTotal && pop >= CFG.WIN.econPop) {
      this.end(true, `Your tribe prospers: ${total | 0} resources and ${pop} people. The valley follows you!`);
      return;
    }
    if (S.day >= CFG.WIN.surviveDay && Bld.tcOf('P')) {
      this.end(true, `You survived ${CFG.WIN.surviveDay} days of beasts and raiders. Your legend endures!`);
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
    if (!data || !data.map || !Array.isArray(data.map.terrain) ||
        data.map.terrain.length !== CFG.W * CFG.H)
      throw new Error('not a Neolithic save file');
    S = data;
    S.paused = true;
    document.getElementById('btnPause').textContent = '▶';
    UI.deselect();
    UI.placing = null;
    R.onNewGame();
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
        G.revealAroundUnits(dt);
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
