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
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(innerWidth * this.dpr);
    this.cv.height = Math.round(innerHeight * this.dpr);
  },

  drawTile(g, x, y) {
    // render from last-seen memory, not live truth — grey fog shows the past
    const t = (S.map.seenTerrain || S.map.terrain)[MapGen.idx(x, y)];
    const variants = Sprites.terrain[t];
    g.drawImage(variants[(x * 7 + y * 13) % variants.length], x * CFG.TILE, y * CFG.TILE);
  },

  // live terrain changed (depletion, ruins) — only players watching see it
  updateTile(x, y) {
    if (!G.visibleAt(x, y)) return;   // hidden changes stay hidden until revisited
    S.map.seenTerrain[MapGen.idx(x, y)] = S.map.terrain[MapGen.idx(x, y)];
    this.drawTileAt(x, y);
  },
  drawTileAt(x, y) {
    if (this.terrainCache) this.drawTile(this.terrainCache.getContext('2d'), x, y);
  },

  onNewGame() {
    this.mini.width = CFG.W * 2; this.mini.height = CFG.H * 2;   // map size varies per game
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
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      if (!S.map.explored[i]) {
        g.fillStyle = '#0d0b08';               // never seen: black
        g.fillRect(x, y, 1, 1);
      } else if (!(G.vis && G.vis[i])) {
        g.fillStyle = 'rgba(16,16,22,0.45)';   // remembered but out of sight: grey
        g.fillRect(x, y, 1, 1);
      }
    }
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

  // fortification auto-tiling: connect to any adjacent wall/gate — and brace
  // flush against water, mountains, and the map edge, so a wall anchored on an
  // obstacle reads as a stout, sealed junction instead of an open end-cap
  wallMaskAt(x, y, extra) {
    const conn = (xx, yy) => {
      if (!MapGen.inB(xx, yy)) return true;                 // map edge
      if (Bld.blockAt(xx, yy) !== 0) return true;           // wall / gate
      const t = S.map.terrain[MapGen.idx(xx, yy)];
      if (t === T.WATER || t === T.MOUNTAIN) return true;   // natural barrier
      return !!(extra && extra.has(xx + ',' + yy));
    };
    return (conn(x, y - 1) ? 1 : 0) | (conn(x + 1, y) ? 2 : 0) |
           (conn(x, y + 1) ? 4 : 0) | (conn(x - 1, y) ? 8 : 0);
  },
  gateVerticalAt(x, y) {
    const conn = (xx, yy) => MapGen.inB(xx, yy) && Bld.blockAt(xx, yy) !== 0;
    const ns = conn(x, y - 1) || conn(x, y + 1), ew = conn(x + 1, y) || conn(x - 1, y);
    return ns && !ew;
  },
  bldSprite(b) {
    if (b.key === 'wall') return Sprites.wallMask[b.level - 1][this.wallMaskAt(b.x, b.y)];
    if (b.key === 'gate') return Sprites.gateMask[b.level - 1][this.gateVerticalAt(b.x, b.y) ? 1 : 0];
    return Sprites.building[b.key][b.level - 1];
  },

  unitPose(u) {
    if (u.tUnit || (u.tBld && Math.hypot((Bld.get(u.tBld) || u).x + 0.5 - u.x, (Bld.get(u.tBld) || u).y + 0.5 - u.y) < 1.5)) return 'fight';
    if (Units.moving(u)) return 'walk';
    if (u.task && (u.task.type === 'gather' || u.task.type === 'build' || u.task.type === 'work')) return 'gather';
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

    // remembered buildings (ghosts in the grey fog) — drawn as last seen
    for (const k in S.map.seenB) {
      const i = +k, gx = i % CFG.W, gy = (i / CFG.W) | 0;
      if ((G.vis && G.vis[i]) || !S.map.explored[i]) continue;
      const snap = S.map.seenB[k];
      const spr = snap.key === 'wall' ? Sprites.wallMask[snap.level - 1][this.wallMaskAt(gx, gy)]
        : snap.key === 'gate' ? Sprites.gateMask[snap.level - 1][this.gateVerticalAt(gx, gy) ? 1 : 0]
        : Sprites.building[snap.key][snap.level - 1];
      g.drawImage(spr, gx * TL, gy * TL);
    }

    // buildings (y-sorted)
    const blds = S.buildings.slice().sort((a, b) => a.y - b.y);
    for (const b of blds) {
      if (!G.visibleAt(b.x, b.y)) continue;
      const bx = b.x * TL, by = b.y * TL;
      if (b.construction > 0) {
        // fortifications show their oriented shape while going up
        if (b.key === 'wall' || b.key === 'gate') {
          g.globalAlpha = 0.55; g.drawImage(this.bldSprite(b), bx, by); g.globalAlpha = 1;
        } else g.drawImage(Sprites.misc.construction, bx, by);
        const total = Bld.def(b.key).levels[b.level - 1].time;
        this.bar(g, bx + 4, by + TL - 4, TL - 8, 3, 1 - b.construction / total, '#e8c15a');
      } else {
        g.drawImage(this.bldSprite(b), bx, by);
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
    const selIds = !UI.sel ? null
      : UI.sel.type === 'unit' ? new Set([UI.sel.id])
      : UI.sel.type === 'group' ? new Set(UI.sel.ids) : null;
    const units = S.units.slice().sort((a, b) => a.y - b.y);
    for (const u of units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const ux = u.x * TL - TL / 2, uy = u.y * TL - TL / 2 - 4;
      if (selIds && selIds.has(u.id)) {
        g.strokeStyle = '#e8c15a'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(u.x * TL, u.y * TL + 10, 10, 5, 0, 0, Math.PI * 2); g.stroke();
      }
      g.drawImage(this.unitSprite(u), ux, uy);
      if (u.hp < u.maxhp) this.bar(g, ux + 6, uy - 2, TL - 12, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }

    // hostiles piled on one tile: a head-count badge so the stack is readable
    const stacks = new Map();
    for (const u of S.units) {
      if (u.owner === 'P' || Units.isPassive(u)) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const k = (u.x | 0) * 4096 + (u.y | 0);
      const s = stacks.get(k);
      if (s) { s.n++; if (u.y < s.y) { s.x = u.x; s.y = u.y; } }
      else stacks.set(k, { x: u.x, y: u.y, n: 1 });
    }
    g.font = '700 9px -apple-system, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of stacks.values()) {
      if (s.n < 2) continue;
      const bx = s.x * TL, by = s.y * TL - TL / 2 - 11;
      const w = g.measureText('×' + s.n).width + 8;
      g.fillStyle = 'rgba(20,15,11,0.85)';
      g.beginPath();
      if (g.roundRect) g.roundRect(bx - w / 2, by - 6.5, w, 13, 4);
      else g.rect(bx - w / 2, by - 6.5, w, 13);
      g.fill();
      g.strokeStyle = 'rgba(224,101,80,0.9)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#ffb0a0';
      g.fillText('×' + s.n, bx, by + 0.5);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';

    // tower shots
    g.lineWidth = 1.5;
    for (const s of Combat.shots) {
      g.strokeStyle = 'rgba(240,210,122,' + Math.min(1, s.t * 6) + ')';
      g.beginPath(); g.moveTo(s.x1 * TL, s.y1 * TL); g.lineTo(s.x2 * TL, s.y2 * TL); g.stroke();
    }

    // placement ghost
    if (UI.placing === 'wall' && UI.wallGhost && UI.wallGhost.length) {
      // dragged wall line: oriented pieces, green when buildable+affordable
      for (const t of UI.wallGhost) {
        g.globalAlpha = 0.65;
        g.drawImage(Sprites.wallMask[0][t.mask], t.x * TL, t.y * TL);
        g.globalAlpha = 1;
        g.fillStyle = t.ok ? 'rgba(125,187,94,0.35)' : 'rgba(224,101,80,0.45)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
      }
    } else if (UI.placing) {
      const t = UI.placeTile;
      if (t) {
        const ok = Bld.canPlace('P', UI.placing, t.x, t.y).ok;
        const spr = UI.placing === 'gate'
          ? Sprites.gateMask[0][this.gateVerticalAt(t.x, t.y) ? 1 : 0]
          : UI.placing === 'wall'
            ? Sprites.wallMask[0][this.wallMaskAt(t.x, t.y)]
            : Sprites.building[UI.placing][0];
        g.globalAlpha = 0.6;
        g.drawImage(spr, t.x * TL, t.y * TL);
        g.globalAlpha = 1;
        g.fillStyle = ok ? 'rgba(125,187,94,0.35)' : 'rgba(224,101,80,0.4)';
        g.fillRect(t.x * TL, t.y * TL, TL, TL);
      }
    }

    // rally point flag / rally-setting range ring
    if (UI.settingRally) {
      const rb = Bld.get(UI.settingRally);
      if (rb) {
        g.strokeStyle = 'rgba(232,193,90,0.6)'; g.lineWidth = 2;
        g.beginPath();
        g.arc((rb.x + 0.5) * TL, (rb.y + 0.5) * TL, CFG.RALLY_RANGE * TL, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (UI.sel && UI.sel.type === 'bld') {
      const rb = Bld.get(UI.sel.id);
      if (rb && rb.rally) {
        const fx = (rb.rally.x + 0.5) * TL, fy = (rb.rally.y + 0.5) * TL;
        g.strokeStyle = 'rgba(232,193,90,0.5)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo((rb.x + 0.5) * TL, (rb.y + 0.5) * TL); g.lineTo(fx, fy); g.stroke();
        g.strokeStyle = '#e8c15a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx, fy + 6); g.lineTo(fx, fy - 8); g.stroke();
        g.fillStyle = '#e8c15a';
        g.beginPath(); g.moveTo(fx, fy - 8); g.lineTo(fx + 8, fy - 5); g.lineTo(fx, fy - 2); g.fill();
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
      '#6f8a4c', '#7d8a72', '#8a7a58', '#57503f', '#5d5a52'];   // ... ruin, mountain
    const shadeCache = {};
    const shade = c => shadeCache[c] || (shadeCache[c] = c.replace(/[0-9a-f]{2}/gi,
      h => Math.max(0, (parseInt(h, 16) * 0.55) | 0).toString(16).padStart(2, '0')));
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      const i = MapGen.idx(x, y);
      g.fillStyle = !S.map.explored[i] ? '#060504'
        : (G.vis && G.vis[i]) ? COLORS[S.map.seenTerrain[i]]
        : shade(COLORS[S.map.seenTerrain[i]]);
      g.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const b of S.buildings) {
      if (!G.visibleAt(b.x, b.y)) continue;
      g.fillStyle = b.owner === 'P' ? '#5ab4f0' : '#f0645a';
      g.fillRect(b.x * 2 - 1, b.y * 2 - 1, 4, 4);
    }
    for (const k in S.map.seenB) {
      const i = +k;
      if ((G.vis && G.vis[i]) || !S.map.explored[i]) continue;
      g.fillStyle = S.map.seenB[k].owner === 'P' ? '#3a6a8a' : '#8a4a44';
      g.fillRect((i % CFG.W) * 2 - 1, ((i / CFG.W) | 0) * 2 - 1, 4, 4);
    }
    for (const u of S.units) {
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
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
