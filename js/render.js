"use strict";
/* Canvas renderer: camera, cached terrain layer, fog of war, entities, minimap. */

const R = {
  cv: null, g: null,
  mini: null, mg: null,
  cam: { x: 0, y: 0, z: 1.5 },   // world px offset + zoom
  dpr: 1,
  terrainCache: null,
  fogCv: null, fogG: null, fogDirty: true,
  floats: [],                    // {x,y,txt,col,t}
  miniT: 0,

  init() {
    this.cv = document.getElementById('c');
    this.g = this.cv.getContext('2d');
    this.mini = document.getElementById('mini');
    this.mg = this.mini.getContext('2d');
    this.mini.width = CFG.W * 2; this.mini.height = CFG.H * 2;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * this.dpr);
    this.cv.height = Math.round(innerHeight * this.dpr);
  },

  drawTile(g, x, y) {
    const t = S.map.terrain[MapGen.idx(x, y)];
    const variants = Sprites.terrain[t];
    g.drawImage(variants[(x * 7 + y * 13) % variants.length], x * CFG.TILE, y * CFG.TILE);
  },

  // redraw one tile of the cached terrain layer (depletion, ruins)
  updateTile(x, y) {
    if (this.terrainCache) this.drawTile(this.terrainCache.getContext('2d'), x, y);
  },

  onNewGame() {
    // pre-render the full terrain layer once
    const px = CFG.W * CFG.TILE;
    this.terrainCache = document.createElement('canvas');
    this.terrainCache.width = px; this.terrainCache.height = px;
    const g = this.terrainCache.getContext('2d');
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) this.drawTile(g, x, y);
    this.fogCv = document.createElement('canvas');
    this.fogCv.width = CFG.W; this.fogCv.height = CFG.H;
    this.fogG = this.fogCv.getContext('2d');
    this.fogDirty = true;
    this.floats = [];
    const tc = Bld.tcOf('P');
    if (tc) this.centerOn(tc.x + 0.5, tc.y + 0.5);
  },

  redrawFog() {
    const g = this.fogG;
    g.clearRect(0, 0, CFG.W, CFG.H);
    g.fillStyle = '#0d0b08';
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
      if (!S.map.explored[MapGen.idx(x, y)]) g.fillRect(x, y, 1, 1);
    this.fogDirty = false;
  },

  viewW() { return this.cv.width / this.dpr; },
  viewH() { return this.cv.height / this.dpr; },

  clampCam() {
    const world = CFG.W * CFG.TILE;
    const vw = this.viewW() / this.cam.z, vh = this.viewH() / this.cam.z;
    const pad = 80 / this.cam.z;
    this.cam.x = Math.max(-pad, Math.min(world - vw + pad, this.cam.x));
    this.cam.y = Math.max(-pad, Math.min(world - vh + pad, this.cam.y));
  },

  centerOn(tx, ty) {
    this.cam.x = tx * CFG.TILE - this.viewW() / this.cam.z / 2;
    this.cam.y = ty * CFG.TILE - this.viewH() / this.cam.z / 2;
    this.clampCam();
  },

  screenToWorld(sx, sy) {
    return { x: sx / this.cam.z + this.cam.x, y: sy / this.cam.z + this.cam.y };
  },
  screenToTile(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / CFG.TILE), y: Math.floor(w.y / CFG.TILE) };
  },

  float(x, y, txt, col) {
    if (this.floats.length > 40) this.floats.shift();
    this.floats.push({ x, y, txt, col, t: 1.0 });
  },

  explored(x, y) { return S.map.explored[MapGen.idx(x, y)]; },

  unitPose(u) {
    if (u.tUnit || (u.tBld && Math.hypot((Bld.get(u.tBld) || u).x + 0.5 - u.x, (Bld.get(u.tBld) || u).y + 0.5 - u.y) < 1.5)) return 'fight';
    if (Units.moving(u)) return 'walk';
    if (u.task && (u.task.type === 'gather' || u.task.type === 'build')) return 'gather';
    return 'idle';
  },
  unitSprite(u) {
    let key = u.kind;
    if ((u.kind === 'defender' || u.kind === 'elite') && u.owner === 'A') key = 'defenderA';
    const sheet = Sprites.unit[key] || Sprites.unit.villager;
    const pose = sheet[this.unitPose(u)] ? this.unitPose(u) : 'walk';
    const fr = sheet[pose];
    return fr[((u.animT * 4) | 0) % fr.length];
  },

  draw(dt) {
    if (!S) return;
    const g = this.g, TL = CFG.TILE, z = this.cam.z * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0d0b08';
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(z, 0, 0, z, -this.cam.x * z, -this.cam.y * z);
    g.imageSmoothingEnabled = false;

    // terrain
    g.drawImage(this.terrainCache, 0, 0);

    // buildings (y-sorted)
    const blds = S.buildings.slice().sort((a, b) => a.y - b.y);
    for (const b of blds) {
      if (!this.explored(b.x, b.y)) continue;
      const bx = b.x * TL, by = b.y * TL;
      if (b.construction > 0) {
        g.drawImage(Sprites.misc.construction, bx, by);
        const total = Bld.def(b.key).levels[0].time;
        this.bar(g, bx + 4, by + TL - 4, TL - 8, 3, 1 - b.construction / total, '#e8c15a');
      } else {
        g.drawImage(Sprites.building[b.key][b.level - 1], bx, by);
        if (b.upgrading > 0) {
          g.fillStyle = 'rgba(232,193,90,0.25)'; g.fillRect(bx, by, TL, TL);
          const total = Bld.def(b.key).levels[b.level].time;
          this.bar(g, bx + 4, by + TL - 4, TL - 8, 3, 1 - b.upgrading / total, '#e8c15a');
        }
        // owner tag
        g.fillStyle = b.owner === 'P' ? '#4a90c2' : '#c2564a';
        g.fillRect(bx + 1, by + 1, 4, 4);
      }
      if (b.hp < b.maxhp) this.bar(g, bx + 3, by - 4, TL - 6, 3, b.hp / b.maxhp, '#7dbb5e');
      if (UI.sel && UI.sel.type === 'bld' && UI.sel.id === b.id) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.strokeRect(bx + 0.5, by + 0.5, TL - 1, TL - 1);
      }
    }

    // units (y-sorted)
    const units = S.units.slice().sort((a, b) => a.y - b.y);
    for (const u of units) {
      if (!this.explored(u.x | 0, u.y | 0)) continue;
      const ux = u.x * TL - TL / 2, uy = u.y * TL - TL / 2 - 4;
      if (UI.sel && UI.sel.type === 'unit' && UI.sel.id === u.id) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(u.x * TL, u.y * TL + 10, 10, 5, 0, 0, Math.PI * 2); g.stroke();
      }
      g.drawImage(this.unitSprite(u), ux, uy);
      if (u.hp < u.maxhp) this.bar(g, ux + 6, uy - 2, TL - 12, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }

    // tower shots
    g.lineWidth = 1.5;
    for (const s of Combat.shots) {
      g.strokeStyle = 'rgba(240,210,122,' + Math.min(1, s.t * 6) + ')';
      g.beginPath(); g.moveTo(s.x1 * TL, s.y1 * TL); g.lineTo(s.x2 * TL, s.y2 * TL); g.stroke();
    }

    // placement ghost
    if (UI.placing) {
      const t = UI.placeTile;
      if (t) {
        const ok = Bld.canPlace('P', UI.placing, t.x, t.y).ok;
        g.globalAlpha = 0.6;
        g.drawImage(Sprites.building[UI.placing][0], t.x * TL, t.y * TL);
        g.globalAlpha = 1;
        g.fillStyle = ok ? 'rgba(125,187,94,0.35)' : 'rgba(224,101,80,0.4)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
      }
    }

    // fog of war
    if (this.fogDirty) this.redrawFog();
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fogCv, 0, 0, CFG.W, CFG.H, 0, 0, CFG.W * TL, CFG.H * TL);
    g.imageSmoothingEnabled = false;

    // floating text
    g.textAlign = 'center';
    g.font = 'bold 9px sans-serif';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t -= dt; f.y -= dt * 0.6;
      if (f.t <= 0) { this.floats.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, f.t * 2);
      g.fillStyle = f.col;
      g.fillText(f.txt, f.x * TL, f.y * TL);
      g.globalAlpha = 1;
    }

    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.5; this.drawMini(); }
  },

  bar(g, x, y, w, h, frac, col) {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, y, w, h);
    g.fillStyle = col;
    g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  },

  drawMini() {
    const g = this.mg, COLORS = ['#5a8f3c', '#2e5c25', '#2e6b8a', '#8f8f86', '#6b5433', '#3d3833',
      '#6f8a4c', '#7d8a72', '#8a7a58', '#57503f'];   // stumps, pebbles, barren, ruin
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      g.fillStyle = S.map.explored[MapGen.idx(x, y)] ? COLORS[S.map.terrain[MapGen.idx(x, y)]] : '#060504';
      g.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const b of S.buildings) {
      if (!this.explored(b.x, b.y)) continue;
      g.fillStyle = b.owner === 'P' ? '#5ab4f0' : '#f0645a';
      g.fillRect(b.x * 2 - 1, b.y * 2 - 1, 4, 4);
    }
    for (const u of S.units) {
      if (!this.explored(u.x | 0, u.y | 0)) continue;
      g.fillStyle = u.owner === 'P' ? '#c0e8ff' : u.owner === 'A' ? '#ffb0a8' : u.owner === 'R' ? '#ff5040' : '#e8d8a0';
      g.fillRect((u.x * 2) | 0, (u.y * 2) | 0, 2, 2);
    }
    // camera rect
    const TL = CFG.TILE;
    g.strokeStyle = '#f0e6d0'; g.lineWidth = 1;
    g.strokeRect(this.cam.x / TL * 2, this.cam.y / TL * 2,
      this.viewW() / this.cam.z / TL * 2, this.viewH() / this.cam.z / TL * 2);
  },
};
