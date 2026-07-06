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
    const terr = S.map.seenTerrain || S.map.terrain;
    const t = terr[MapGen.idx(x, y)];
    const at = (xx, yy) => MapGen.inB(xx, yy) ? terr[MapGen.idx(xx, yy)] : t;
    const TL = CFG.TILE, px = TL / 16, AP = ART.PALETTE;
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    const variants = Sprites.terrain[t];
    let img;
    if (t === T.GRASS && h % 31 === 0)
      img = Sprites.terrainRare[T.GRASS][h % Sprites.terrainRare[T.GRASS].length];   // rare flower meadow
    else if (t === T.WATER) {
      const shore = at(x + 1, y) !== T.WATER || at(x - 1, y) !== T.WATER ||
                    at(x, y + 1) !== T.WATER || at(x, y - 1) !== T.WATER;
      img = variants[shore ? 0 : 1];                    // lighter shallows, darker interior
    } else img = variants[(x * 7 + y * 13) % variants.length];
    g.drawImage(img, x * TL, y * TL);

    if (t === T.WATER) {
      // wet-sand rim + pale foam line along every land-facing edge
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tt = at(x + ox, y + oy);
        if (tt === T.WATER) continue;
        const band = (col, off) => {
          g.fillStyle = col;
          if (ox === 1) g.fillRect(x * TL + TL - (off + 1) * px, y * TL, px, TL);
          else if (ox === -1) g.fillRect(x * TL + off * px, y * TL, px, TL);
          else if (oy === 1) g.fillRect(x * TL, y * TL + TL - (off + 1) * px, TL, px);
          else g.fillRect(x * TL, y * TL + off * px, TL, px);
        };
        band(AP.bone[2], 0);
        band(AP.water[4], 1);
      }
    } else if (Sprites.blendCol[t]) {
      // dithered checker where a differently-grounded biome touches — no hard seams
      const own = Sprites.blendCol[t];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tt = at(x + ox, y + oy);
        if (tt === t) continue;
        const c = Sprites.blendCol[tt];
        if (!c || c === own) continue;
        g.fillStyle = c;
        for (let i2 = (x + y) & 1; i2 < 16; i2 += 2) {
          if (ox === 1) g.fillRect(x * TL + TL - px, y * TL + i2 * px, px, px);
          else if (ox === -1) g.fillRect(x * TL, y * TL + i2 * px, px, px);
          else if (oy === 1) g.fillRect(x * TL + i2 * px, y * TL + TL - px, px, px);
          else g.fillRect(x * TL + i2 * px, y * TL, px, px);
        }
      }
    }
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
    return (b.owner === 'A' ? Sprites.buildingA : Sprites.building)[b.key][b.level - 1];
  },

  unitPose(u) {
    if (u.tUnit || (u.tBld && Math.hypot((Bld.get(u.tBld) || u).x + 0.5 - u.x, (Bld.get(u.tBld) || u).y + 0.5 - u.y) < 1.5)) return 'fight';
    if (Units.moving(u)) return 'walk';
    if (u.task && u.task.type === 'shorefish') return 'idle';   // the rod overlay tells the story
    if (u.task && (u.task.type === 'gather' || u.task.type === 'fish' ||
        u.task.type === 'build' || u.task.type === 'work')) return 'gather';
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
        : (snap.owner === 'A' ? Sprites.buildingA : Sprites.building)[snap.key][snap.level - 1];
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
      if (u.cargo && u.cargo.length) {                 // one pip per soldier aboard
        g.fillStyle = u.owner === 'P' ? '#c0e8ff' : '#ffb0a0';
        for (let ci = 0; ci < u.cargo.length; ci++)
          g.fillRect(ux + 7 + ci * 4, uy - 1, 3, 3);
      }
      if (u.hp < u.maxhp) this.bar(g, ux + 6, uy - 2, TL - 12, 2.5, u.hp / u.maxhp,
        u.owner === 'P' ? '#7dbb5e' : '#e06550');
    }

    // cast lines: every settled shore-fisher shows a rod, a line, and a
    // bobbing float out on the shoal — unmistakably fishing
    for (const u of S.units) {
      if (!u.task || u.task.type !== 'shorefish') continue;
      if ((u.x | 0) !== u.task.sx || (u.y | 0) !== u.task.sy) continue;
      if (!G.visibleAt(u.x | 0, u.y | 0)) continue;
      const dirx = u.task.x - u.task.sx, diry = u.task.y - u.task.sy;
      const tipX = (u.x + dirx * 0.38) * TL, tipY = (u.y + diry * 0.30) * TL - 9;
      const bobX = (u.task.x + 0.5) * TL + Math.sin(u.animT * 1.3) * 3;
      const bobY = (u.task.y + 0.5) * TL + Math.sin(u.animT * 2.1) * 2;
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(110,80,36,0.95)';                      // wood rod
      g.beginPath(); g.moveTo(u.x * TL + dirx * 2, u.y * TL - 2); g.lineTo(tipX, tipY); g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(216,207,174,0.55)';                    // gut line
      g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(bobX, bobY); g.stroke();
      g.fillStyle = ART.PALETTE.fire[2];                           // bright float
      g.fillRect(bobX - 1.5, bobY - 1.5, 3, 3);
      if (Math.sin(u.animT * 2.1) > 0.75) {                        // nibble ripple
        g.strokeStyle = 'rgba(235,244,248,0.35)';
        g.beginPath(); g.ellipse(bobX, bobY + 1, 5, 2.5, 0, 0, Math.PI * 2); g.stroke();
      }
    }

    // the kraken: a once-a-game terror breaking the surface
    if (S.kraken && S.kraken.ev) {
      const ev = S.kraken.ev;
      if (G.visibleAt(ev.x | 0, ev.y | 0)) {
        const k = ev.phase === 'rise' ? Math.min(1, ev.t / 1.0)
          : ev.phase === 'sink' ? Math.max(0, 1 - ev.t / 1.2) : 1;
        const fr = Sprites.misc.kraken[((ev.t * 3) | 0) % 2];
        const size = TL * 1.7;
        g.globalAlpha = k;
        g.drawImage(fr, ev.x * TL - size / 2, ev.y * TL - size / 2 - k * 5, size, size);
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(235,244,248,' + (0.4 * k).toFixed(2) + ')';
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(ev.x * TL, ev.y * TL + 9, 16 + Math.sin(ev.t * 5) * 4, 7, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // hearth smoke drifting from settled buildings, embers over camp fires —
    // transient render-side particles, bounded, visible tiles only
    this.smoke = this.smoke || [];
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.45;
      if (this.smoke.length < 36) {
        for (const b of S.buildings) {
          if (b.construction > 0) continue;
          const rate = b.key === 'tc' ? 0.9 : (b.key === 'house' || b.key === 'lodge') ? 0.2 : 0;
          if (!rate || Math.random() > rate) continue;
          if (!G.visibleAt(b.x, b.y)) continue;
          // the L1 roundhouse hearth is the fire pit in the dooryard — a very
          // faint wisp curls up from it; every other hearth smokes from the roof
          const pit = b.key === 'tc' && b.level === 1;
          this.smoke.push({ x: b.x + (pit ? 0.84 : 0.5) + (Math.random() - 0.5) * 0.12,
                            y: b.y + (pit ? 0.80 : 0.18),
                            t: 0, ttl: (pit ? 1.6 : 2) + Math.random() * 1.2,
                            a: pit ? 0.15 : 0.30 });
          if (this.smoke.length >= 36) break;
        }
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.t += dt;
      if (s.t > s.ttl) { this.smoke.splice(i, 1); continue; }
      const k = s.t / s.ttl;
      const sx = (s.x + Math.sin((s.t + s.x * 7) * 1.6) * 0.06 + s.t * 0.03) * TL;
      const sy = (s.y - s.t * 0.28) * TL;
      const a0 = s.a || 0.30;
      const size = (a0 < 0.2 ? 1.5 : 2) + k * (a0 < 0.2 ? 4 : 5);
      g.fillStyle = 'rgba(206,200,190,' + (a0 * (1 - k)).toFixed(3) + ')';
      g.fillRect(sx - size / 2, sy - size / 2, size, size);
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

    // arrows in flight (flaming ones burn orange with an ember at the head);
    // catapult stones arc high and land hard
    g.lineWidth = 1.5;
    for (const s of Combat.shots) {
      if (s.rock) {
        const k = Math.max(0, 1 - s.t / 0.35);
        const px = (s.x1 + (s.x2 - s.x1) * k) * TL;
        const py = (s.y1 + (s.y2 - s.y1) * k - Math.sin(k * Math.PI) * 1.1) * TL;
        g.fillStyle = ART.PALETTE.stone[1];
        g.fillRect(px - 3, py - 3, 6, 6);
        g.fillStyle = ART.PALETTE.stone[3];
        g.fillRect(px - 3, py - 3, 3, 3);
        continue;
      }
      const a = Math.min(1, s.t * 6);
      g.strokeStyle = s.fire ? 'rgba(242,150,58,' + a + ')' : 'rgba(240,210,122,' + a + ')';
      g.beginPath(); g.moveTo(s.x1 * TL, s.y1 * TL); g.lineTo(s.x2 * TL, s.y2 * TL); g.stroke();
      if (s.fire) {
        g.fillStyle = 'rgba(255,200,80,' + a + ')';
        g.fillRect(s.x2 * TL - 2, s.y2 * TL - 2, 4, 4);
        g.fillStyle = 'rgba(232,138,58,' + a + ')';
        g.fillRect(s.x2 * TL - 1, s.y2 * TL - 1, 2, 2);
      }
    }

    // living water: drifting sparkles, blinking shoreline foam, jumping fish.
    // Viewport-only, a few fillRects per water tile — stays well inside budget.
    this.fishClock = (this.fishClock || 0) + dt;
    {
      const t0 = this.fishClock;
      const cyc = (t0 / 2.4) | 0, phase = (t0 / 2.4) % 1;
      const fishFr = phase < 0.55 ? Sprites.misc.fish[phase < 0.3 ? 0 : 1] : null;
      const terr = S.map.terrain;
      const x0 = Math.max(0, (this.cam.x / TL) | 0), y0 = Math.max(0, (this.cam.y / TL) | 0);
      const x1 = Math.min(CFG.W - 1, ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0);
      const y1 = Math.min(CFG.H - 1, ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = MapGen.idx(x, y);
        if (terr[i] !== T.WATER) continue;
        if (!G.visibleAt(x, y)) continue;
        const h = (x * 73856093 ^ y * 19349663) >>> 0;
        if (h % 3 === 0) {                                  // slow drifting sparkle dash
          const ph = t0 * 0.6 + (h % 13);
          const sx = x * TL + 4 + (Math.sin(ph) * 0.5 + 0.5) * (TL - 14);
          const sy = y * TL + 5 + ((h >> 4) % (TL - 10));
          g.fillStyle = 'rgba(190,224,238,0.45)';
          g.fillRect(sx | 0, sy | 0, 5, 2);
        }
        const landN = terr[MapGen.idx(x, Math.max(0, y - 1))] !== T.WATER;
        const landS = y + 1 < CFG.H && terr[MapGen.idx(x, y + 1)] !== T.WATER;
        const landW = terr[MapGen.idx(Math.max(0, x - 1), y)] !== T.WATER;
        const landE = x + 1 < CFG.W && terr[MapGen.idx(x + 1, y)] !== T.WATER;
        if (landN || landS || landW || landE) {             // blinking foam dots on the shore side
          const a = 0.22 + 0.2 * Math.sin(t0 * 1.7 + (h % 7));
          g.fillStyle = 'rgba(235,244,248,' + Math.max(0, a).toFixed(2) + ')';
          const o1 = 4 + (h % 3) * 8, o2 = 20 - (h % 5) * 3;
          if (landN) { g.fillRect(x * TL + o1, y * TL + 2, 2, 2); g.fillRect(x * TL + o2, y * TL + 3, 2, 2); }
          else if (landS) { g.fillRect(x * TL + o1, y * TL + TL - 4, 2, 2); g.fillRect(x * TL + o2, y * TL + TL - 5, 2, 2); }
          else if (landW) { g.fillRect(x * TL + 2, y * TL + o1, 2, 2); g.fillRect(x * TL + 3, y * TL + o2, 2, 2); }
          else { g.fillRect(x * TL + TL - 4, y * TL + o1, 2, 2); g.fillRect(x * TL + TL - 5, y * TL + o2, 2, 2); }
        }
        if (fishFr && S.map.resAmount[i]) {
          // shoals (h % 3 shore tiles — the ones villagers can line-fish)
          // show jumping fish often: that's the tell to watch for. Open deep
          // water keeps only the rare splash; barren shore water shows none.
          const hf = (h ^ cyc * 83492791) >>> 0;
          const nearLand = landN || landS || landW || landE;
          if (nearLand ? (h % 3 === 0 && hf % 5 < 2) : hf % 31 === 0)
            g.drawImage(fishFr, x * TL, y * TL);
        }
      }
    }

    // ambient life: butterflies flutter over grass, birds glide over forest.
    // Pure decoration — transient render-side particles, never in S.
    this.ambient = this.ambient || [];
    this.ambientT = (this.ambientT || 0) - dt;
    if (this.ambientT <= 0 && this.ambient.length < 4) {
      this.ambientT = 1.4 + Math.random() * 1.8;
      const vx0 = Math.max(0, (this.cam.x / TL) | 0), vy0 = Math.max(0, (this.cam.y / TL) | 0);
      const vw = Math.min(CFG.W - 1, ((this.cam.x + this.viewW() / this.cam.z) / TL) | 0) - vx0;
      const vh = Math.min(CFG.H - 1, ((this.cam.y + this.viewH() / this.cam.z) / TL) | 0) - vy0;
      for (let tries = 0; tries < 8; tries++) {
        const tx = vx0 + (Math.random() * Math.max(1, vw)) | 0;
        const ty = vy0 + (Math.random() * Math.max(1, vh)) | 0;
        const tt = S.map.terrain[MapGen.idx(tx, ty)];
        if ((tt !== T.GRASS && tt !== T.FOREST) || !G.visibleAt(tx, ty)) continue;
        const bird = tt === T.FOREST && Math.random() < 0.5;
        this.ambient.push({
          x: tx + Math.random(), y: ty + Math.random(), bird,
          vx: (Math.random() < 0.5 ? -1 : 1) * (bird ? 1.8 : 0.35),
          vy: (Math.random() - 0.5) * (bird ? 0.5 : 0.3),
          t: 0, ttl: bird ? 5 : 8 + Math.random() * 4, ph: Math.random() * 10,
          col: ART.PALETTE.bloom[(Math.random() * 3) | 0],
        });
        break;
      }
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.t += dt; a.x += a.vx * dt; a.y += a.vy * dt;
      if (!a.bird) a.y += Math.sin((a.t + a.ph) * 5) * 0.010;
      if (a.t > a.ttl || !MapGen.inB(a.x | 0, a.y | 0)) { this.ambient.splice(i, 1); continue; }
      if (!G.visibleAt(a.x | 0, a.y | 0)) continue;
      const ax = a.x * TL, ay = a.y * TL;
      const fade = Math.min(1, Math.min(a.t, a.ttl - a.t) * 2);
      g.globalAlpha = Math.max(0, fade * 0.9);
      if (a.bird) {
        g.fillStyle = ART.PALETTE.ink[1];
        const flap = Math.sin(a.t * 8) > 0 ? 1 : 0;
        g.fillRect(ax - 3, ay - flap, 3, 1.6);
        g.fillRect(ax, ay - 1 - flap, 2, 1.6);
        g.fillRect(ax + 2, ay - flap, 3, 1.6);
      } else {
        g.fillStyle = a.col;
        const open = Math.sin((a.t + a.ph) * 10) > 0;
        g.fillRect(ax - (open ? 2.5 : 1.5), ay, 2, 2);
        g.fillRect(ax + (open ? 0.5 : -0.5), ay, 2, 2);
      }
      g.globalAlpha = 1;
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

    // gentle long-cycle dusk: after ~10 bright days, night eases in and out
    // across ~2 days — one slow, calm breath, never a strobe. Screen-space
    // tint only; costs one or two fillRects.
    {
      const dayF = ((S.day - 1) % 12) + Math.min(1, S.dayT / CFG.DAY_MS);
      let k = 0;
      if (dayF > 10) k = Math.sin((dayF - 10) / 2 * Math.PI);
      if (k > 0.02) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = 'rgba(22,28,64,' + (0.20 * k).toFixed(3) + ')';
        g.fillRect(0, 0, this.cv.width, this.cv.height);
        const warm = 0.07 * Math.sin(Math.min(1, k * 2) * Math.PI);   // dusk/dawn glow
        if (warm > 0.01) {
          g.fillStyle = 'rgba(240,150,70,' + warm.toFixed(3) + ')';
          g.fillRect(0, 0, this.cv.width, this.cv.height);
        }
      }
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

  // small minimap snapshot for cloud-save slot cards
  thumb() {
    try {
      const c = document.createElement('canvas');
      c.width = 72; c.height = 72;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(this.mini, 0, 0, 72, 72);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  },

  drawMini() {
    const AP = ART.PALETTE;
    const g = this.mg, COLORS = [AP.grass[3], AP.leaf[1], AP.water[2], AP.stone[2], AP.soil[2], AP.rust[1],
      AP.grass[2], AP.stone[3], AP.soil[3], AP.stone[1], AP.stone[0]];   // ... ruin, mountain
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
      g.fillStyle = u.owner === 'P' ? '#c0e8ff' : u.owner === 'A' ? '#ffb0a8' : u.owner === 'R' ? '#3fd0b0' : '#e8d8a0';
      g.fillRect((u.x * 2) | 0, (u.y * 2) | 0, 2, 2);
    }
    // camera rect
    const TL = CFG.TILE;
    g.strokeStyle = '#f0e6d0'; g.lineWidth = 1;
    g.strokeRect(this.cam.x / TL * 2, this.cam.y / TL * 2,
      this.viewW() / this.cam.z / TL * 2, this.viewH() / this.cam.z / TL * 2);
  },
};
