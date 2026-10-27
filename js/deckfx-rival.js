"use strict";
/* THE CARD SYSTEM — RIVAL AND SKY — what a card learns, reveals or sends
   against the rival: Scout's Fire, Pathfinder's Map, Spy in the Hall,
   Barbarian Pact, The Swallowed Sun, Kraken's Call (tests/deck-rival.mjs).
   The contract every entry keeps is in js/deckfx.js (the engine) and
   js/deck.js (Deck.play, the one door); a card's own moment in the world is
   its `show` (R.startCardShow, js/render.js), and a running card's look is
   its drawLive.

   THE CARD-LIT MAP. Three of these cards put ground on the player's map that
   nobody of theirs has walked: Scout's Fire (a ring of land, watched for
   three days), Pathfinder's Map (every tile) and Spy in the Hall (the
   footprints of the rival's buildings). Filling S.map.explored alone would
   lie in three places at once — the exploration score would count a card's
   chart as the tribe's travels (ruling 6), Bld.foreignHome would refuse the
   ground round a hall the player has never seen (a hint about where it is),
   and every strike aimed at "explored ground" could be blind-aimed at it. So
   each tile a card charts is ALSO marked card-lit (S.deck.lit, a packed
   bitset, base64 — ~700 characters on the biggest map), and REAL sight
   clears the mark (G.updateVisibility calls Deck.eyesClear with what the
   tribe's own buildings and people see, before any card's watch is lit).
   Deck.eyesAt is "ground the player's own eyes have seen" — explored and not
   card-lit, or in sight right now — and the strike gate, foreignHome and the
   score all ask it. S.map.seenTerrain is never synced by a card (it would
   draw the rival's felled woods and quarries — their town — onto the map),
   and the charting never touches the board's rim (MapGen.onBoard, never
   inB: G.reveal's rim leak stays out of it).

   THE REST, card by card, is told above each entry. Everything here is
   wrapped in one function so no name of this file ever collides with a
   sibling effect file's (classic scripts share one global scope). */
(function () {
  /* ---------------- the house's small tools ---------------- */
  const snap = v => Math.round(v / 2) * 2;                      // the 2px grid
  const snapTo = (v, c) => Math.round(v / c) * c;              // a coarser grid (the sky's big pixels)
  const hash = n => {
    let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const rnd = (a, b) => hash(Math.imul(a | 0, 73856093) ^ Math.imul((b | 0) + 1, 19349663)) / 4294967296;
  const qa = (a, n) => Math.max(0, Math.min(1, Math.round(a * (n || 4)) / (n || 4)));   // a hard alpha step
  const c01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ease = p => { p = c01(p); return 1 - (1 - p) * (1 - p) * (1 - p); };
  const view = pad => { const v = R.viewTiles(); return { x0: v.x0 - pad, y0: v.y0 - pad, x1: v.x1 + pad, y1: v.y1 + pad }; };
  const inView = (v, x, y) => x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;
  const sfx = k => { try { if (typeof Sound !== 'undefined' && Sound.play) Sound.play(k); } catch (e) {} };
  const playing = () => window.Screens && Screens.current === 'playing';
  // a ring made OF dots — never a stroked arc (the house's rule)
  const ring = (g, cx, cy, r, n, sy, sz) => {
    sz = sz || 2;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      g.fillRect(snap(cx + Math.cos(a) * r), snap(cy + Math.sin(a) * r * (sy || 1)), sz, sz);
    }
  };
  // a tile disc of radius r about (cx, cy), on the board only
  const disc = (cx, cy, r) => {
    const out = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + r) continue;
      const x = cx + dx, y = cy + dy;
      if (MapGen.onBoard(x, y)) out.push(MapGen.idx(x, y));
    }
    return out;
  };
  const FIRE = () => ART.PALETTE.fire;   // ['#a33f1c', '#e88a3a', '#f2c14a', '#ffe9a0']

  /* A column of flame in hard pixels: slices every 2px from the foot up,
     an outer orange, an inner gold and a white-hot heart, each slice swaying
     on its own phase. `h` and `w` in world px. */
  const flame = (g, x, y, h, w, t, seed) => {
    if (h < 2) return;
    const F = FIRE();
    for (let yy = 0; yy < h; yy += 2) {
      const k = yy / h, sway = Math.sin(t * 9 + k * 7 + seed) * (1.5 + k * 4) + Math.sin(t * 13 + seed * 2.1 + k * 3) * k * 2;
      const wd = w * Math.pow(1 - k, 0.85);
      const cx = x + sway, py = snap(y - yy - 2);
      if (wd >= 2) { g.fillStyle = k > 0.78 ? F[0] : F[1]; g.fillRect(snap(cx - wd / 2), py, Math.max(2, snap(wd)), 2); }
      if (k < 0.75 && wd * 0.62 >= 2) { g.fillStyle = F[2]; g.fillRect(snap(cx - wd * 0.31), py, Math.max(2, snap(wd * 0.62)), 2); }
      if (k < 0.45 && wd * 0.3 >= 2) { g.fillStyle = F[3]; g.fillRect(snap(cx - wd * 0.15), py, Math.max(2, snap(wd * 0.3)), 2); }
    }
  };

  /* ================= THE CARD-LIT MAP ================= */
  Object.assign(Deck, {
    EYES_WHY: 'Choose ground your own people have seen — a card’s map is not their eyes.',
    _litC: null,
    /* the mask, decoded once per value of S.deck.lit (Uint8Array, 1 = a card
       charted it and the tribe has not seen it since) — null when nothing is */
    litMask() {
      const run = typeof S !== 'undefined' && S && S.deck;
      const src = run && run.lit;
      if (!src) return null;
      const N = CFG.W * CFG.H, c = this._litC;
      if (c && c.src === src && c.N === N) return c.n ? c.arr : null;
      const arr = new Uint8Array(N);
      let n = 0, bin = '';
      try { bin = atob(src); } catch (e) { bin = ''; }
      for (let i = 0; i < N; i++) if ((bin.charCodeAt(i >> 3) || 0) & (1 << (i & 7))) { arr[i] = 1; n++; }
      this._litC = { src, N, arr, n };
      return n ? arr : null;
    },
    _litPut(arr) {
      const N = arr.length, bytes = new Uint8Array((N + 7) >> 3);
      let n = 0;
      for (let i = 0; i < N; i++) if (arr[i]) { bytes[i >> 3] |= 1 << (i & 7); n++; }
      let src = '';
      if (n) { let bin = ''; for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]); src = btoa(bin); }
      this.run().lit = src;
      this._litC = { src, N, arr, n };
    },
    litAt(x, y) { const m = this.litMask(); return !!(m && MapGen.inB(x, y) && m[MapGen.idx(x, y)]); },
    litCount() { const m = this.litMask(); return m ? this._litC.n : 0; },
    /* A CARD CHARTS these tiles: each one not yet explored is explored AND
       card-lit. Returns the tiles it charted (the fog that rolls back).
       An unfound RELIC's footprint is never charted unless the card says
       so (`relic`: Scout's Fire, whose ring finds a relic legitimately):
       charting it would FIND it (Relics.checkDiscovery reads explored), and
       finding one draws the run's RNG — the kraken's watch or a spy's mark
       must never dig up treasure as a side effect. */
    light(idxs, relic) {
      const ex = S.map.explored, N = CFG.W * CFG.H, r = S.relic, W = CFG.W;
      const keep = r && !r.found && !relic
        ? i => { const x = i % W, y = (i / W) | 0; return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
        : null;
      const arr = this.litMask() || new Uint8Array(N);
      const fresh = [];
      for (const i of idxs) { if (ex[i] || (keep && keep(i))) continue; ex[i] = 1; arr[i] = 1; fresh.push(i); }
      if (fresh.length) { this._litPut(arr); if (window.R) R.fogDirty = true; }
      return fresh;
    },
    /* REAL SIGHT CLEARS THE MARK (G.updateVisibility, with the tiles the
       tribe's own buildings and people see this pass). Also retires the
       relic's map mark once the relic is dug up. */
    eyesClear(vis) {
      const run = S.deck;
      if (run && run.relicMark && (!S.relic || S.relic.found)) run.relicMark = false;
      const m = this.litMask();
      if (!m) return;
      let ch = false;
      for (let i = 0; i < m.length; i++) if (m[i] && vis[i]) { m[i] = 0; ch = true; }
      if (ch) this._litPut(m);
    },
    // ground the player's OWN people have seen: explored and not card-lit — or
    // card-lit but in sight right now. With no card ever played: explored.
    eyesAt(x, y) {
      if (!MapGen.inB(x, y)) return false;
      const i = MapGen.idx(x, y);
      if (!S.map.explored[i]) return false;
      const m = this.litMask();
      if (!m || !m[i]) return true;
      return !!(G.vis && G.vis[i]);
    },
    /* does the player KNOW this hall stands here (Bld.foreignHome)? Their
       eyes on its tile, or its ghost in their memory (a spy put it there, or
       a watch fire saw it). With nothing card-lit it is exactly the old read. */
    eyesKnow(b) {
      const i = MapGen.idx(b.x, b.y);
      if (!this.litMask()) return !!(S.map.explored && S.map.explored[i]);
      if (this.eyesAt(b.x, b.y)) return true;
      const sb = S.map.seenB && S.map.seenB[i];
      return !!(sb && sb.key === b.key && sb.owner === b.owner);
    },

    /* the rival's people, seen through a spy in their hall */
    spySees(u) { return u.owner === 'A' && !!this.timed('spy_hall'); },
    /* the card's sun, dark over the rival alone */
    sunOver(owner) { return owner === 'A' && !!this.timed('swallowed_sun'); },
    /* BARBARIAN PACT: Combat.maybeWave asks, and tells us when a band turns */
    pactPending() {
      const c = typeof S !== 'undefined' && S && S.deck && S.deck.charges;
      return !!(c && c.pact > 0);
    },
    pactTurned(tribe, n) {
      const c = this.run().charges;
      c.pact = Math.max(0, (c.pact || 0) - 1);
      const left = c.pact;
      G.log('🥁 The pact holds: a war band of ' + G.tribeName(tribe) + ' (' + n + ') turns on the rival' +
        (left ? ' — ' + left + ' more to come.' : ' — the last the pact bought.'), 'note', 6400);
      if (window.R && R.startCardShow && playing()) R.startCardShow('barbarian_pact', { turn: true, ms: 1700 });
      sfx('cardDrum');
    },

    /* ---------------- THE KRAKEN'S ACT (sim time, G.frame) ---------------- */
    krakenTick(dt) {
      const K = S.deck && S.deck.kraken, fx = this.FX.krakens_call;
      if (!K || !fx) { if (S.deck) S.deck.kraken = null; return; }
      K.t += dt;
      for (const a of K.acts) {
        if (a.phase === 'done') continue;
        if (a.phase === 'wait') {
          if (K.t < a.at) continue;
          const boat = Units.get(a.id);
          // gone, or slipped off the open sea, before the deep reached it
          if (!boat || boat.hp <= 0 || !G.openWaterAt(boat.x | 0, boat.y | 0)) { a.phase = 'done'; continue; }
          a.x = boat.x; a.y = boat.y; a.phase = 'rise'; a.t = 0;
          boat.path = null; boat.task = null;   // HELD for the rise, as the world's kraken holds its boat
          this.light(disc(a.x | 0, a.y | 0, fx.SIGHT));
          continue;
        }
        a.t += dt;
        if (a.phase === 'rise') {
          const boat = Units.get(a.id);
          if (boat) { boat.path = null; a.x = boat.x; a.y = boat.y; }
          if (a.t > fx.RISE) {
            if (boat && boat.hp > 0) {
              boat.krakenTaken = true;
              Units.damage(boat, 99999, 0, 'P');   // a KILL — the player's own act
              K.took++;
              if (window.R && G.visibleAt(a.x | 0, a.y | 0)) { if (R.shakeAt) R.shakeAt(7, 0.6); if (R.impact) R.impact(a.x, a.y, 'stone', 'blast'); }
              sfx('cardTake');
            }
            a.phase = 'thrash'; a.t = 0;
          }
        } else if (a.phase === 'thrash' && a.t > fx.THRASH) { a.phase = 'sink'; a.t = 0; }
        else if (a.phase === 'sink' && a.t > fx.SINK) a.phase = 'done';
      }
      if (!K.hit && K.t >= fx.COAST_S) { K.hit = true; fx.batter(K); }
      if (K.hit && K.t >= fx.endT(K)) { S.deck.kraken = null; fx.over(K); }
    },

    /* ---------------- what a card left on the world (R.drawCardWorld) ---------------- */
    drawRivalWorld(g, dt) {
      if (S.deck.relicMark) this.FX.pathfinders_map.drawMark(g);
      if (S.deck.kraken) this.FX.krakens_call.draw(g, dt, S.deck.kraken);
    },
    // …and on the minimap (R.drawMini): the marked relic, the spied people
    drawMini(g) {
      const r = S.relic;
      if (S.deck.relicMark && r && !r.found) {
        const x = (r.x + r.w / 2) * 2, y = (r.y + r.h / 2) * 2, on = ((performance.now() / 500) | 0) % 2 === 0;
        g.fillStyle = on ? '#ffd45e' : '#c99b32';
        for (let k = -3; k <= 3; k++) { g.fillRect((x + k) | 0, (y + k) | 0, 2, 2); g.fillRect((x + k) | 0, (y - k) | 0, 2, 2); }
      }
      if (this.timed('spy_hall')) {
        g.fillStyle = '#b06a70';
        for (const u of S.units) {
          if (u.owner !== 'A' || G.visibleAt(u.x | 0, u.y | 0)) continue;
          g.fillRect((u.x * 2) | 0, (u.y * 2) | 0, 2, 2);
        }
      }
    },
  });

  /* THE WATCH a card keeps (G.updateVisibility lights explored ground only —
     every card here charts its ground first, card-lit, so the score never
     counts it). Chained onto the engine's own sights, so a strike's watch and
     these never clobber each other. */
  const baseSights = Deck.sights;
  Deck.sights = function () {
    const out = baseSights ? baseSights.call(this) : [];
    const sf = this.timed('scouts_fire'), now = this.now();
    if (sf && sf.pts) for (const p of sf.pts) if (p.until > now) out.push({ x: p.x, y: p.y, r: this.FX.scouts_fire.R });
    const K = S.deck && S.deck.kraken, kf = this.FX.krakens_call;
    if (K && kf) {
      for (const a of K.acts) if (a.phase !== 'wait' && a.phase !== 'done') out.push({ x: a.x | 0, y: a.y | 0, r: kf.SIGHT });
      if (K.t < kf.COAST_S + kf.TAIL) for (const c of K.coast) out.push({ x: c.x | 0, y: c.y | 0, r: kf.COAST_SIGHT });
    }
    return out;
  };

  /* the fog as it stood before a card lifted it, drawn back over the tiles
     it hid until a FRONT has passed them — the fog rolling back. `cover(tx,
     ty)` is the front's verdict for an 8px block's centre (in tiles). Rows of
     whole tiles are merged into one rect; only tiles the front is crossing
     are cut into 8px blocks. */
  const fogBack = (g, tiles, col, front) => {
    if (!tiles || !tiles.length) return;
    const TL = CFG.TILE, W = CFG.W, v = view(1), B = 8, nb = TL / B;
    g.fillStyle = col;
    for (const i of tiles) {
      const tx = i % W, ty = (i / W) | 0;
      if (!inView(v, tx, ty)) continue;
      const f = front(tx + 0.5, ty + 0.5, 0.75);
      if (f === 1) { g.fillRect(tx * TL, ty * TL, TL, TL); continue; }
      if (f === 0) continue;
      for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++)
        if (front(tx + (bx + 0.5) / nb, ty + (by + 0.5) / nb, 0) === 1) g.fillRect(tx * TL + bx * B, ty * TL + by * B, B, B);
    }
  };

  /* ================= THE CARDS ================= */
  Object.assign(Deck.FX, {

    /* STONE — SCOUT'S FIRE: any point on the board, explored or not. The land
       within 9 tiles (a disc, the board's own tiles only) is charted for good
       — card-lit — and a WATCH is kept there for 3 days: a vision source
       (Deck.sights), so the watch is real sight of what stands there now (the
       memory syncs, buildings ghost, a relic inside the ring is found), while
       the score never counts the ring. G.updateVisibility does not run while
       the deck sheet holds the world still, so the card runs it itself.
       Each fire is its OWN watch: a second fire at another point does not
       lengthen the first, it lights a second hill (one timer chip, running
       to the later of the two). */
    scouts_fire: {
      at: 'target', radius: 9, R: 9, DAYS: 3,
      can() { return { ok: true }; },
      valid() { return true; },
      apply(tgt) {
        const cx = Math.floor(tgt.x), cy = Math.floor(tgt.y), ring9 = disc(cx, cy, this.R);
        // what the fog hid before the fire: never seen (black) and remembered (dim)
        const dark = [], dim = [];
        for (const i of ring9) {
          if (!S.map.explored[i]) dark.push(i);
          else if (!(G.vis && G.vis[i])) dim.push(i);
        }
        Deck.light(ring9, true);   // a relic inside the ring is found, legitimately
        const now = Deck.now(), until = now + this.DAYS, pt = { x: cx, y: cy, until };
        const live = Deck.timed('scouts_fire');
        if (live) { live.pts = (live.pts || []).filter(p => p.until > now); live.pts.push(pt); live.until = Math.max(live.until, until); }
        else Deck.addTimed('scouts_fire', this.DAYS, { pts: [pt] });
        if (window.R) {
          if (R.startCardShow) R.startCardShow('scouts_fire', { x: tgt.x, y: tgt.y, dark, dim });
          if (R.startle) R.startle(tgt.x, tgt.y, 10);
        }
        sfx('cardBeacon');
        // the watch begins NOW, though the sheet holds the world still
        G.updateVisibility();
        Deck.say('🔥 A signal fire burns on the far hill: the land within ' + this.R + ' tiles of it is on your map for good, and your scouts keep watch there for ' + this.DAYS + ' days.');
        return { ok: true, x: tgt.x, y: tgt.y, until };
      },
      end() { G.log('🔥 The signal fire has burned out — the scouts come down off the hill.', 'note', 5000); },
      /* THE MOMENT: a pillar of fire springs up, sparks fly, and the fog rolls
         back from it in a widening ring to the edge of the land it charts;
         the pillar settles into the watch fire that burns on (drawLive). */
      show: {
        ms: 2600, layer: 'world',
        draw(g, s, p) {
          const TL = CFG.TILE, x = s.x * TL, y = s.y * TL + TL * 0.25, t = s.t;
          // the fog rolling back, a ring growing from the fire to the land's edge
          const rf = this.R * 1.05 * ease(p / 0.62);
          const front = (fx, fy, m) => {
            const d = Math.hypot(fx - s.x, fy - s.y);
            return d > rf + m ? 1 : d < rf - m ? 0 : 0.5;
          };
          fogBack(g, s.dark, '#0d0b08', front);
          fogBack(g, s.dim, 'rgba(16,16,22,0.45)', front);
          g.save(); g.globalCompositeOperation = 'lighter';
          // the ring of firelight riding the front
          if (p < 0.7) {
            g.fillStyle = 'rgba(255,170,70,' + qa(0.75 * (1 - p / 0.7)) + ')';
            ring(g, x, s.y * TL, rf * TL, Math.max(24, Math.round(rf * 9)), 1);
          }
          // NO LIGHT POOLED ON THE GROUND (a warm glow over the meadow reads
          // as sand): the fire lights only itself, its sparks and the ring
          if (p < 0.1) {                                 // the catch: a flash at the foot
            g.fillStyle = 'rgba(255,240,200,' + qa(0.8 * (1 - p / 0.1)) + ')';
            R.pxDisc(g, x, y - TL * 0.4, TL * (0.6 + p * 8), 2);
          }
          g.restore();
          // the pillar: up in a breath, held, then settling to a watch fire
          const H = p < 0.12 ? 3.8 * ease(p / 0.12) : p < 0.5 ? 3.8 : 3.8 - 2.6 * ease((p - 0.5) / 0.5);
          const Wd = TL * (p < 0.5 ? 0.95 : 0.95 - 0.45 * ease((p - 0.5) / 0.5));
          flame(g, x, y, H * TL, Wd, t, 1.7);
          // sparks thrown up off the pillar's head
          g.save(); g.globalCompositeOperation = 'lighter';
          const F = FIRE();
          for (let k = 0; k < 30; k++) {
            const t0 = (k / 30) * 1.5, age = t - t0;
            if (age < 0 || age > 1.1) continue;
            const vx = (rnd(k, 1) - 0.5) * 70, vy = 50 + rnd(k, 2) * 90;
            const sx = x + vx * age + Math.sin(age * 6 + k) * 4, sy = y - H * TL * 0.7 - vy * age + 30 * age * age;
            g.fillStyle = (k % 3 ? F[3] : F[2]);
            g.globalAlpha = qa(1 - age / 1.1);
            g.fillRect(snap(sx), snap(sy), 2, 2);
          }
          g.restore();
        },
      },
      /* the watch fire, burning on for the 3 days at every hill lit: a ring
         of hearth stones, a crossed stack of logs, three tongues of flame on
         their own phases, sparks going up and a thread of smoke above — and
         no light pooled on the ground round it */
      drawLive(g, e) {
        const now = Deck.now(), TL = CFG.TILE, v = view(2), t = performance.now() / 1000, F = FIRE();
        for (const pt of e.pts || []) {
          if (!(pt.until > now) || !inView(v, pt.x, pt.y)) continue;
          const left = pt.until - now, k = left < 0.25 ? Math.max(0.25, left / 0.25) : 1;   // it gutters at the end
          const x = (pt.x + 0.5) * TL, y = (pt.y + 0.5) * TL + TL * 0.25, sd = pt.x * 0.7 + pt.y;
          // the hearth stones, lit on their inner faces
          for (let n = 0; n < 9; n++) {
            const a = n / 9 * Math.PI * 2, sx = snap(x + Math.cos(a) * TL * 0.38), sy = snap(y + Math.sin(a) * TL * 0.17);
            g.fillStyle = '#4a4740'; g.fillRect(sx - 2, sy - 2, 4, 4);
            g.fillStyle = Math.sin(a) < 0 ? '#8a8272' : '#6a655a'; g.fillRect(sx - 2, sy - 2, 4, 2);
          }
          // the logs, crossed
          g.fillStyle = '#3a2614';
          for (let d = -6; d <= 6; d += 2) { g.fillRect(snap(x + d), snap(y - 2 + d * 0.3), 2, 4); g.fillRect(snap(x + d), snap(y - 2 - d * 0.3), 2, 4); }
          g.fillStyle = '#6e4a26'; g.fillRect(snap(x - 6), snap(y - 4), 4, 2); g.fillRect(snap(x + 4), snap(y - 4), 4, 2);
          // embers in the bed, light ADDED — the bed only, never the ground
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let n = 0; n < 5; n++) {
            g.fillStyle = 'rgba(255,' + (120 + n * 20) + ',40,' + qa((0.5 + 0.5 * Math.sin(t * 7 + n * 2.1 + sd)) * k) + ')';
            g.fillRect(snap(x - 6 + n * 3), snap(y - 2), 2, 2);
          }
          g.restore();
          // three tongues
          flame(g, x - 4, y - 2, TL * (0.75 + 0.12 * Math.sin(t * 6 + sd)) * k, TL * 0.3 * k, t * 1.1, sd + 2.1);
          flame(g, x + 4, y - 2, TL * (0.7 + 0.12 * Math.sin(t * 5.3 + sd)) * k, TL * 0.28 * k, t * 0.93, sd + 4.4);
          flame(g, x, y - 2, TL * (1.15 + 0.18 * Math.sin(t * 4.6 + sd)) * k, TL * 0.42 * k, t, sd);
          // sparks going up, light ADDED
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let n = 0; n < 7; n++) {
            const ph = (t * 0.7 + n / 7 + (sd % 1)) % 1;
            g.fillStyle = n % 2 ? F[3] : F[2];
            g.globalAlpha = qa((1 - ph) * k);
            g.fillRect(snap(x + Math.sin(ph * 7 + n * 1.7) * 6 * ph + (rnd(n, pt.x) - 0.5) * 8), snap(y - TL * 0.9 - ph * TL * 1.4), 2, 2);
          }
          g.restore();
          // a thread of smoke above
          for (let n = 0; n < 7; n++) {
            const ph = (t * 0.3 + n / 7) % 1;
            g.fillStyle = 'rgba(96,92,86,' + qa(0.55 * (1 - ph) * k) + ')';
            const w = 2 + (ph > 0.45 ? 2 : 0);
            g.fillRect(snap(x + Math.sin(ph * 5 + n) * 4 * ph + ph * 8), snap(y - TL * 1.5 - ph * TL * 1.8), w, w);
          }
        }
      },
    },

    /* BRONZE — PATHFINDER'S MAP: every tile of the world charted for good —
       land, water, ore and gold seams, as they lie (S.map.seenTerrain, the
       world as generated where nobody has looked since; never synced from the
       live terrain, which would draw the rival's town) — card-lit, so none of
       it is exploration and none of it is ground a strike may be aimed at.
       The relic's footprint is left DARK (charting it would be finding it)
       and the relic is MARKED instead, on the map and the minimap, until a
       hand walks there and digs. Nothing standing on the land is shown.
       Refused (kept) when it would chart nothing and mark nothing. */
    pathfinders_map: {
      at: 'focus',
      focus() { return null; },   // no camera move — the map unrolls over the whole screen
      _todo() {
        const ex = S.map.explored, r = S.relic, W = CFG.W, H = CFG.H, tiles = [];
        const inRelic = (x, y) => r && !r.found && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!MapGen.onBoard(x, y) || inRelic(x, y)) continue;
          const i = y * W + x;
          if (!ex[i]) tiles.push(i);
        }
        return { tiles, mark: !!(r && !r.found && !(S.deck && S.deck.relicMark)) };
      },
      can() {
        const t = this._todo();
        if (t.tiles.length || t.mark) return { ok: true };
        return { ok: false, why: 'The whole world is already on your map' + (S.relic && !S.relic.found ? ', and the relic is marked on it' : '') + '.' };
      },
      apply() {
        const ok = this.can();
        if (!ok.ok) return ok;
        const t = this._todo(), fresh = Deck.light(t.tiles);
        if (t.mark) Deck.run().relicMark = true;
        if (window.R && R.startCardShow) {
          const mask = new Uint8Array(CFG.W * CFG.H);
          for (const i of fresh) mask[i] = 1;
          R.startCardShow('pathfinders_map', { lit: fresh, mask, relic: t.mark || !!(S.relic && !S.relic.found && S.deck.relicMark) });
        }
        sfx('cardUnroll');
        Deck.say('🗺 A pathfinder’s map, drawn in charcoal on a hide: ' + (fresh.length ? 'the whole world is on your map now' : 'your map was already whole') +
          (t.mark ? ', and the lost relic is marked on it — someone still has to walk there and dig.' : '.'));
        return { ok: true };
      },
      /* the relic's mark: a gold X over the dark where it lies, in a ring of
         dots that breathes — and the minimap carries the same X */
      drawMark(g) {
        const r = S.relic;
        if (!r || r.found) return;
        const TL = CFG.TILE, cx = (r.x + r.w / 2) * TL, cy = (r.y + r.h / 2) * TL;
        const v = view(2);
        if (!inView(v, r.x, r.y) && !inView(v, r.x + r.w, r.y + r.h)) return;
        const t = performance.now() / 1000, br = 0.5 + 0.5 * Math.sin(t * 2.4);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(255,212,94,' + qa(0.35 + 0.35 * br) + ')';
        ring(g, cx, cy, TL * (0.95 + 0.12 * br) * Math.max(1, r.w / 2), 20, 1);
        g.restore();
        const arm = Math.max(10, TL * 0.42 * Math.max(1, r.w / 2));
        for (let k = -arm; k <= arm; k += 2) {
          g.fillStyle = '#3a2410'; g.fillRect(snap(cx + k) + 2, snap(cy + k) + 2, 4, 4); g.fillRect(snap(cx + k) + 2, snap(cy - k) + 2, 4, 4);
        }
        g.fillStyle = br > 0.5 ? '#ffd45e' : '#e8c15a';
        for (let k = -arm; k <= arm; k += 2) { g.fillRect(snap(cx + k), snap(cy + k), 4, 4); g.fillRect(snap(cx + k), snap(cy - k), 4, 4); }
      },
      /* THE MOMENT: a hide unrolls across the screen, the world draws itself
         on it in charcoal from west to east, the relic's X is struck, and the
         hide lifts away as the fog peels back off the world beneath it. */
      show: {
        ms: 3800, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          if (layer === 'world') {
            // the fog over every tile it charts, until the peel's front passes
            const fx = (CFG.W + 2) * ease((p - 0.62) / 0.34) - 1;
            const TL = CFG.TILE, W = CFG.W, v = view(1), m = s.mask;
            g.fillStyle = '#0d0b08';
            for (let ty = Math.max(0, v.y0 | 0); ty <= Math.min(CFG.H - 1, Math.ceil(v.y1)); ty++) {
              let run0 = -1;
              const edge = fx + Math.sin(ty * 1.7) * 0.8;   // a ragged front, never a ruler
              for (let tx = Math.max(0, v.x0 | 0); tx <= Math.min(W, Math.ceil(v.x1) + 1); tx++) {
                const on = tx < W && m[ty * W + tx] && tx + 1 > edge;
                if (on && run0 < 0) run0 = tx;
                if (!on && run0 >= 0) {
                  const x0 = Math.max(run0 * TL, snap(edge * TL));
                  g.fillRect(x0, ty * TL, tx * TL - x0, TL);
                  run0 = -1;
                }
              }
            }
            // charcoal dust blowing off the front
            if (p > 0.62 && p < 0.98) {
              g.fillStyle = 'rgba(60,44,30,0.8)';
              for (let k = 0; k < 40; k++) {
                const ty = v.y0 + rnd(k, 7) * (v.y1 - v.y0), jx = (rnd(k, 8) - 0.3) * 1.6;
                g.fillRect(snap((fx + jx) * TL), snap(ty * TL), 2, 2);
              }
            }
            return;
          }
          this.hide(g, s, p);
        },
      },
      // the hide's art: built once per play (render state on the show)
      _hideArt(s) {
        const W = CFG.W, H = CFG.H, M = 8, aw = W * 2 + M * 2, ah = H * 2 + M * 2;
        const art = document.createElement('canvas'); art.width = aw; art.height = ah;
        const ink = document.createElement('canvas'); ink.width = aw; ink.height = ah;
        const a = art.getContext('2d'), k = ink.getContext('2d');
        // written pixel by pixel into ImageData (a 146px hide is 21k pixels —
        // one putImageData, not 21k fillRects, at the moment the card lands)
        const ai = a.createImageData(aw, ah), ad = ai.data, ki = k.createImageData(aw, ah), kd = ki.data;
        const put = (d, x, y, c) => { if (x < 0 || y < 0 || x >= aw || y >= ah) return; const i = (y * aw + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
        const SKIN = [196, 161, 112], DARK = [168, 129, 78], PALE = [214, 183, 136], MID = [189, 152, 102], RIM = [140, 106, 62];
        const CHAR = [42, 32, 22], HATCH = [90, 70, 48], WOOD = [78, 64, 38], ORE = [106, 86, 64], GOLD = [184, 134, 26], BORDER = [58, 44, 30];
        // the hide: a warm skin, blotched, its edge torn
        for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
          const e = Math.min(x, y, aw - 1 - x, ah - 1 - y), h = hash(x * 977 + y * 131);
          if (e < 2 && h % 3 === 0) continue;
          put(ad, x, y, e < 1 ? RIM : h % 17 === 0 ? DARK : h % 23 === 0 ? PALE : h % 7 === 0 ? MID : SKIN);
        }
        // a drawn border, with the hand's gaps
        for (let x = 4; x < aw - 4; x++) if (hash(x * 31) % 9) { put(kd, x, 4, BORDER); put(kd, x, ah - 5, BORDER); }
        for (let y = 4; y < ah - 4; y++) if (hash(y * 37) % 9) { put(kd, 4, y, BORDER); put(kd, aw - 5, y, BORDER); }
        // the world, in charcoal: the sea hatched, the coast drawn, crags and woods marked
        const terr = S.map.seenTerrain, wet = t => t === T.WATER || t === T.MOAT;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!MapGen.onBoard(x, y)) continue;
          const t = terr[y * W + x], ax = M + x * 2, ay = M + y * 2;
          if (wet(t)) {
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
              if ((ax + dx + ay + dy) % 3 === 0) put(kd, ax + dx, ay + dy, HATCH);
            continue;
          }
          for (const [ox, oy, px, py, pw, ph] of [[1, 0, 1, 0, 1, 2], [-1, 0, 0, 0, 1, 2], [0, 1, 0, 1, 2, 1], [0, -1, 0, 0, 2, 1]]) {
            const nx = x + ox, ny = y + oy;
            if (MapGen.inB(nx, ny) && wet(terr[ny * W + nx]))
              for (let yy = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++) put(kd, ax + px + xx, ay + py + yy, CHAR);
          }
          if (t === T.MOUNTAIN && (x + y) % 2 === 0) { put(kd, ax, ay + 1, CHAR); put(kd, ax + 1, ay, CHAR); }
          else if (t === T.FOREST && (x * 3 + y) % 3 === 0) put(kd, ax, ay, WOOD);
          else if (t === T.HILLS) put(kd, ax + 1, ay + 1, ORE);
          else if (t === T.GOLDORE) { put(kd, ax, ay, GOLD); put(kd, ax + 1, ay, GOLD); put(kd, ax, ay + 1, GOLD); put(kd, ax + 1, ay + 1, GOLD); }
        }
        // home: the player's own hall, a small square they will know
        const tc = Bld.tcOf('P');
        if (tc) {
          const hx = M + tc.x * 2 - 1, hy = M + tc.y * 2 - 1;
          for (let q = 0; q < 6; q++) { put(kd, hx + q, hy, CHAR); put(kd, hx + q, hy + 5, CHAR); put(kd, hx, hy + q, CHAR); put(kd, hx + 5, hy + q, CHAR); }
        }
        a.putImageData(ai, 0, 0); k.putImageData(ki, 0, 0);
        s.art = art; s.ink = ink; s.aw = aw; s.ah = ah; s.M = M;
      },
      hide(g, s, p) {
        if (!s.art) this._hideArt(s);
        const W = R.cv.width, H = R.cv.height;
        const k = Math.max(2, Math.floor(Math.min(W * 0.84 / s.aw, H * 0.62 / s.ah)));
        const dw = s.aw * k, dh = s.ah * k, x0 = Math.round((W - dw) / 2), lift = p > 0.66 ? ease((p - 0.66) / 0.24) * H * 0.05 : 0;
        const y0 = Math.round(H * 0.46 - dh / 2 - lift);
        const fade = p < 0.66 ? 1 : qa(1 - ease((p - 0.66) / 0.22), 4);
        if (fade <= 0) return;
        // the world goes quiet behind the hide
        g.fillStyle = 'rgba(8,6,4,' + qa(0.45 * fade * Math.min(1, p / 0.08), 6) + ')';
        g.fillRect(0, 0, W, H);
        const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
        g.globalAlpha = fade;
        // it unrolls from the west
        const un = Math.max(1, Math.round(s.aw * ease(p / 0.2)));
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(x0 + k * 2, y0 + k * 3, un * k, dh);           // its hard shadow
        g.drawImage(s.art, 0, 0, un, s.ah, x0, y0, un * k, dh);
        // the charcoal draws itself, west to east, a nib glinting at its tip
        const dr = Math.min(un, Math.round(s.aw * ease((p - 0.14) / 0.42)));
        if (dr > 0) g.drawImage(s.ink, 0, 0, dr, s.ah, x0, y0, dr * k, dh);
        if (dr > 0 && dr < s.aw - 2 && p < 0.58) {
          g.fillStyle = '#fff2c0';
          g.fillRect(x0 + dr * k, y0 + Math.round((0.5 + 0.4 * Math.sin(p * 40)) * dh), k * 2, k * 2);
        }
        // the rolls: one at the west edge, one riding the unrolling front
        for (const rx of [x0 - k * 2, x0 + un * k - k * 2]) {
          g.fillStyle = '#6e5130'; g.fillRect(rx, y0 - k * 2, k * 4, dh + k * 4);
          g.fillStyle = '#9a7646'; g.fillRect(rx + k, y0 - k * 2, k, dh + k * 4);
          g.fillStyle = '#3a2814'; g.fillRect(rx + k * 3, y0 - k * 2, k, dh + k * 4);
        }
        // a compass rose in the corner, inked as the drawing reaches it
        if (dr > s.aw * 0.8) {
          const qx = x0 + (s.aw - 14) * k, qy = y0 + 13 * k;
          g.fillStyle = '#2a2016';
          for (let d = -5; d <= 5; d++) { g.fillRect(qx + d * k, qy, k, k); g.fillRect(qx, qy + d * k, k, k); }
          for (let d = -2; d <= 2; d++) { g.fillRect(qx + d * k, qy + d * k, k, k); g.fillRect(qx + d * k, qy - d * k, k, k); }
          g.fillStyle = '#8e2e1e'; g.fillRect(qx - k, qy - 6 * k, k * 3, k * 2);   // north, in ochre
        }
        // the relic struck with an X in red ochre, and the walk to it dotted from home
        const r = S.relic, home = Bld.tcOf('P');
        if (s.relic && r && p > 0.54) {
          const pop = 1 + 1.4 * (1 - ease((p - 0.54) / 0.08));
          const cx = x0 + (s.M + (r.x + r.w / 2) * 2) * k, cy = y0 + (s.M + (r.y + r.h / 2) * 2) * k, arm = Math.round(4 * pop) * k;
          if (home) {
            const hx = x0 + (s.M + Bld.cx(home) * 2) * k, hy = y0 + (s.M + Bld.cy(home) * 2) * k;
            const L = Math.hypot(cx - hx, cy - hy), n = Math.max(2, Math.floor(L / (k * 3))), upto = Math.round(n * Math.min(1, (p - 0.56) / 0.08));
            g.fillStyle = '#8e2e1e';
            for (let i = 1; i < upto; i++) {
              const q = i / n, wob = Math.sin(q * 9) * k * 2;
              g.fillRect(Math.round((hx + (cx - hx) * q - (cy - hy) / L * wob) / k) * k, Math.round((hy + (cy - hy) * q + (cx - hx) / L * wob) / k) * k, k, k);
            }
          }
          g.fillStyle = '#8e2e1e';
          for (let d = -arm; d <= arm; d += k) { g.fillRect(cx + d - k, cy + d - k, k * 2, k * 2); g.fillRect(cx + d - k, cy - d - k, k * 2, k * 2); }
        }
        g.globalAlpha = 1;
        g.imageSmoothingEnabled = sm;
      },
    },

    /* IRON — SPY IN THE HALL (allowed at peace: it is a guest, not a blow).
       Every building the rival has STANDING is marked on the player's map
       for good — its ghost written into S.map.seenB, its footprint card-lit
       (charted, never the tribe's exploration, never strike-aimable ground) —
       measured to survive every later visibility pass until real sight finds
       it gone. The origin card they drafted is said in as many words (a save
       from before the draft says so, truthfully). And for 10 days their
       PEOPLE are seen wherever they go: drawn over the fog as dim silhouettes
       with an eye over them (drawLive) and on the minimap — SHOWN, never
       tappable or orderable until the tribe's own sight reaches them (the
       tap's hit-test asks G.visibleAt, untouched), but KNOWN: a strike's
       truce question counts them (Deck.reachesRival). The rival learns
       nothing; its memory is never written. */
    spy_hall: {
      at: 'focus', DAYS: 10,
      // the burst lands on the town it marks (the card is about to put it on the map)
      focus() {
        const tc = Bld.tcOf('A');
        if (tc) return { x: Bld.cx(tc), y: Bld.cy(tc) };
        const bs = S.buildings.filter(b => b.owner === 'A');
        if (!bs.length) return null;
        return { x: bs.reduce((a, b) => a + Bld.cx(b), 0) / bs.length, y: bs.reduce((a, b) => a + Bld.cy(b), 0) / bs.length };
      },
      can() { return { ok: true }; },
      origin() {
        const pk = S.draft && S.draft.rival && S.draft.rival.pick;
        const cd = pk && window.Cards && Cards.DEFS && Cards.DEFS[pk.key];
        return cd ? { name: cd.name, text: cd.text(pk.roll) } : null;
      },
      apply() {
        const foot = [], marks = [];
        for (const b of S.buildings) {
          if (b.owner !== 'A') continue;
          S.map.seenB[MapGen.idx(b.x, b.y)] = { key: b.key, level: b.level, owner: b.owner, tribe: b.tribe };
          const s = Bld.size(b);
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
            if (MapGen.onBoard(b.x + dx, b.y + dy)) foot.push(MapGen.idx(b.x + dx, b.y + dy));
          marks.push({ x: Bld.cx(b), y: Bld.cy(b), bx: b.x, by: b.y, s });
        }
        Deck.light(foot);
        if (window.R) R.fogDirty = true;
        const was = !!Deck.timed('spy_hall');
        const e = Deck.addTimed('spy_hall', this.DAYS);
        const o = this.origin();
        const at = this.focus() || { x: CFG.W / 2, y: CFG.H / 2 };
        marks.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
        if (window.R && R.startCardShow) R.startCardShow('spy_hall', { x: at.x, y: at.y, marks: marks.slice(0, 80) });
        sfx('cardEye');
        const said = o ? 'they drafted ' + o.name + ' — ' + o.text + '.' : 'they drafted no origin card: theirs is a tribe older than the draft.';
        Deck.say('🕵 A spy sits at the rival’s fire: ' + marks.length + ' building' + (marks.length === 1 ? '' : 's') +
          ' of theirs marked on your map, ' + (was ? 'their people watched ' + this.DAYS + ' days longer' : 'their people seen wherever they go for ' + this.DAYS + ' days') +
          ' — and ' + said);
        return { ok: true, until: e.until, msg: 'Spy in the Hall: their town is on your map, and ' + said };
      },
      end() { G.log('🕵 The spy slips away from their fire — their people are hidden again beyond your own sight.', 'note', 5000); },
      /* THE MOMENT: an eye opens over the rival's town, looks across it, and
         every building it marks answers with a ring and an eye of its own. */
      show: {
        ms: 3400, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const open = p < 0.08 ? 0 : p < 0.24 ? ease((p - 0.08) / 0.16) : p < 0.8 ? 1 : p < 0.92 ? 1 - ease((p - 0.8) / 0.12) : 0;
          if (layer === 'sky') {
            // the edges of the world close in while the eye is open (a vignette in hard steps)
            const W = R.cv.width, H = R.cv.height, a = 0.32 * open;
            if (a <= 0.01) return;
            for (let b = 0; b < 4; b++) {
              const w = Math.round(Math.min(W, H) * 0.035 * (b + 1));
              g.fillStyle = 'rgba(6,8,18,' + qa(a * (1 - b * 0.22), 8) + ')';
              g.fillRect(0, 0, W, w); g.fillRect(0, H - w, W, w); g.fillRect(0, w, w, H - 2 * w); g.fillRect(W - w, w, w, H - 2 * w);
            }
            return;
          }
          const TL = CFG.TILE, ex = s.x * TL, ey = (s.y - 2.4) * TL;
          // the marks: in order out from the hall, a dotted thread from the eye, a ring, a pip
          const n = s.marks.length;
          for (let i = 0; i < n; i++) {
            const m = s.marks[i], ta = 0.26 + 0.38 * (n > 1 ? i / (n - 1) : 0), q = (p - ta) / 0.12;
            if (q < 0) continue;
            const mx = m.x * TL, my = m.y * TL;
            if (q < 1) {
              g.fillStyle = 'rgba(255,212,94,' + qa(0.8 * (1 - q)) + ')';
              const L = Math.hypot(mx - ex, my - ey), steps = Math.max(2, Math.floor(L / 10));
              for (let k = 1; k < steps; k++) if (k / steps < q * 1.6) g.fillRect(snap(ex + (mx - ex) * k / steps), snap(ey + (my - ey) * k / steps), 2, 2);
              g.fillStyle = 'rgba(255,212,94,' + qa(0.9 * (1 - q)) + ')';
              ring(g, mx, my, TL * (0.4 + 0.9 * ease(q)), 16, 1);
            }
            const fadeM = p > 0.9 ? qa(1 - (p - 0.9) / 0.1) : 1;
            g.globalAlpha = fadeM;
            // the footprint MARKED: gold corner brackets, snapping in
            if (m.s) {
              const pad = 4 * (1 - Math.min(1, q * 3)) * TL / 8, x0 = m.bx * TL - pad, y0 = m.by * TL - pad, x1 = (m.bx + m.s) * TL + pad, y1 = (m.by + m.s) * TL + pad, L = Math.max(6, TL * 0.3);
              g.fillStyle = '#ffd45e';
              for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
                g.fillRect(snap(sx > 0 ? cx : cx - L), snap(sy > 0 ? cy : cy - 2), snap(L), 2);
                g.fillRect(snap(sx > 0 ? cx : cx - 2), snap(sy > 0 ? cy : cy - L), 2, snap(L));
              }
            }
            this.pip(g, mx, my - TL * 0.9, q < 0.3 ? 2 : 1);
            g.globalAlpha = 1;
          }
          if (open > 0) this.eye(g, ex, ey, open, p);
        },
      },
      // a small eye: the mark over a building, and over a spied soul
      pip(g, x, y, sc) {
        const c = 2 * (sc || 1), x0 = snap(x - c * 3), y0 = snap(y - c);
        g.fillStyle = '#1b1410';
        g.fillRect(x0 + c, y0 - c, c * 4, c); g.fillRect(x0 + c, y0 + c * 2, c * 4, c);
        g.fillRect(x0, y0, c, c * 2); g.fillRect(x0 + c * 5, y0, c, c * 2);
        g.fillStyle = '#e9e2cf'; g.fillRect(x0 + c, y0, c * 4, c * 2);
        g.fillStyle = '#d8a838'; g.fillRect(x0 + c * 2, y0, c * 2, c * 2);
        g.fillStyle = '#120c08'; g.fillRect(x0 + c * 2 + c / 2, y0 + c / 2, c, c);
      },
      // the great eye: an almond of hard cells that opens, looks, and glows gold
      eye(g, x, y, open, p) {
        x = snap(x); y = snap(y);
        const c = 4, HW = 12, look = p > 0.3 && p < 0.8 ? Math.sin((p - 0.3) / 0.5 * Math.PI * 2) : 0;
        const t = performance.now() / 1000;
        // its halo: two rings of gold dots turning against each other, and rays
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const [rr, n, dir, al] of [[1.32, 36, 1, 0.75], [1.62, 48, -1, 0.45]]) {
          g.fillStyle = 'rgba(255,212,94,' + qa(al * open) + ')';
          for (let k = 0; k < n; k++) {
            const a = k / n * Math.PI * 2 + dir * t * 0.6;
            g.fillRect(snap(x + Math.cos(a) * c * HW * rr), snap(y + Math.sin(a) * c * HW * rr * 0.62), 4, 4);
          }
        }
        g.fillStyle = 'rgba(255,233,160,' + qa(0.5 * open) + ')';
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * Math.PI * 2 + t * 0.2, r0 = c * HW * 1.75, r1 = r0 + c * (3 + 2 * Math.sin(t * 3 + k));
          for (let r = r0; r < r1; r += 4) g.fillRect(snap(x + Math.cos(a) * r), snap(y + Math.sin(a) * r * 0.62), 2, 2);
        }
        g.restore();
        const ix = Math.round(look * 4), IR = 4.6, PR = 2;
        for (let cx = -HW; cx <= HW; cx++) {
          const half = Math.floor(6 * Math.sqrt(Math.max(0, 1 - (cx / HW) * (cx / HW))) * open + 0.35);
          for (let cy = -half; cy <= half; cy++) {
            const edge = Math.abs(cy) === half || Math.abs(cx) === HW;
            const d = Math.hypot(cx - ix, cy);
            g.fillStyle = edge ? '#1b1410' : d <= PR ? '#120c08' : d <= IR - 1 ? '#d8a838' : d <= IR ? '#7a5418' : '#e9e2cf';
            g.fillRect(x + cx * c - c / 2, y + cy * c - c / 2, c, c);
          }
          // the lashes above the upper lid
          if (open > 0.5 && cx % 3 === 0 && Math.abs(cx) < HW - 1) { g.fillStyle = '#1b1410'; g.fillRect(x + cx * c - c / 2, y + (-half - 1) * c - c / 2, c, c); }
        }
        if (open > 0.6) { g.fillStyle = '#fff6d8'; g.fillRect(x + (ix - 2) * c - c / 2, y - 2 * c - c / 2, c, c); }   // the glint
      },
      /* THEIR PEOPLE, SEEN THROUGH THE FOG: every rival soul the tribe's own
         sight does not reach is drawn over the fog as a dim silhouette with an
         eye over it — its own sprite and box, in the spy's colour, fading in
         and out with the card. Culled to the camera; the silhouettes are cut
         once per frame of art (a WeakMap, render state). */
      _sil: new WeakMap(),
      silhouette(img) {
        let c = this._sil.get(img);
        if (c) return c;
        const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
        if (!w || !h) return null;
        const tint = (col) => {
          const t = document.createElement('canvas'); t.width = w; t.height = h;
          const tq = t.getContext('2d');
          tq.drawImage(img, 0, 0);
          tq.globalCompositeOperation = 'source-in';
          tq.fillStyle = col; tq.fillRect(0, 0, w, h);
          return t;
        };
        const rim = tint('#e0a0a6'), body = tint('#7c3440');
        c = document.createElement('canvas'); c.width = w; c.height = h;
        const q = c.getContext('2d');
        const o = Math.max(1, Math.round(w / 48));   // about one world pixel
        for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) q.drawImage(rim, dx, dy);
        q.drawImage(body, 0, 0);
        this._sil.set(img, c);
        return c;
      },
      drawLive(g, e) {
        const now = Deck.now(), TL = CFG.TILE, v = view(1.5);
        const fade = qa(Math.min(1, (now - e.from) / 0.08, (e.until - now) / 0.08), 4);
        if (fade <= 0) return;
        for (const u of S.units) {
          if (u.owner !== 'A' || !inView(v, u.x, u.y) || G.visibleAt(u.x | 0, u.y | 0)) continue;
          const B = R.unitBox(u), img = R.unitSprite(u), sil = img && this.silhouette(img);
          if (!sil) continue;
          const D = R.frameBox(u, img, B), top = R.frameTop(u.y, B, D);
          g.globalAlpha = 0.6 * fade;
          g.drawImage(sil, u.x * TL - D / 2, top, D, D);
          g.globalAlpha = 0.9 * fade;
          this.pip(g, u.x * TL, top + D * 0.18, 1);
          g.globalAlpha = 1;
        }
      },
    },

    /* IMPERIAL — BARBARIAN PACT (deniable: the wilds fight the rival, the
       truce stands): the next 3 barbarian war bands march on the rival. Three
       charges in S.deck.charges.pact (a second pact adds three more), spent in
       Combat.maybeWave as a band musters toward the RIVAL — over land where
       its fight net reaches the rival's town, or by longboat to its shore.
       It NEVER turns a band onto the player: while the wilds are sparing a
       beaten rival (G.barbEase('A')) the bands WAIT — no muster that day, not
       one draw, the charge kept — and a band that cannot reach the rival at
       all disperses with its charge kept. Each band that turns is told at
       every difficulty (a war drum and a log line), because the player
       bought it; the muster's whereabouts are never said. */
    barbarian_pact: {
      at: 'tc', N: 3,
      can() { return { ok: true }; },
      apply() {
        const c = Deck.run().charges, again = (c.pact || 0) > 0;
        c.pact = (c.pact || 0) + this.N;
        const tc = Bld.tcOf('P');
        // the signal fire burns on the GROUND beside the hall (never on its
        // roof — a fire on a building is the game's one unprompted alarm)
        if (window.R && R.startCardShow) {
          const sz = tc ? Bld.size(tc) : 0;
          R.startCardShow('barbarian_pact', tc ? { x: Bld.cx(tc), y: Bld.cy(tc), fx: tc.x + sz + 0.55, fy: tc.y + sz - 0.35 } : {});
        }
        sfx('cardDrums');
        Deck.say(again ? '🥁 The pact is sealed again: the next ' + c.pact + ' barbarian war bands will march on the rival instead of you.'
          : '🥁 Gold for the wolves: the next ' + this.N + ' barbarian war bands will march on the rival instead of you.');
        return { ok: true };
      },
      /* THE MOMENT: four war-drum strokes. On every stroke the screen's edges
         pulse red, the ground shakes and a ring of red dots rolls out across
         the ground from the hall; a signal fire springs up beside it and
         throws a column of RED smoke into the sky; and on the last stroke the
         pact is STAMPED over the whole screen — a war-paint handprint in red
         ochre, dripping, with the words under it — and fades. A band turning
         later gets two strokes and its own pulse (no smoke and no stamp: the
         muster is not the player's to see). */
      BEATS: [0.08, 0.28, 0.48, 0.57],
      // a hand stencil, the oldest mark there is: four fingers, a thumb, a palm, a wrist
      HAND: ['.....XX......', '..XX.XX......', '..XX.XX.XX...', '..XX.XX.XX...', '..XX.XX.XX...',
             '..XX.XX.XX.XX', '..XX.XX.XX.XX', 'X.XXXXXXXXXXX', 'XXXXXXXXXXXXX', '.XXXXXXXXXXXX',
             '..XXXXXXXXXXX', '..XXXXXXXXXX.', '...XXXXXXXXX.', '....XXXXXXX..', '.....XXXXX...'],
      show: {
        ms: 3400, layers: ['world', 'sky'],
        draw(g, s, p, dt, layer) {
          const beats = s.turn ? [0.1, 0.42] : this.BEATS;
          if (layer === 'world') {
            if (s.turn || s.x == null) return;
            // the drum rolling out across the ground, a ring per stroke
            const TL = CFG.TILE;
            for (let b = 0; b < beats.length; b++) {
              const q = (p - beats[b]) / 0.22;
              if (q < 0 || q > 1) continue;
              g.fillStyle = 'rgba(176,40,24,' + qa(0.9 * (1 - q), 4) + ')';
              ring(g, s.x * TL, s.y * TL + TL * 0.4, TL * (0.8 + 5.5 * ease(q)), 44, 0.5, 4);
              g.fillStyle = 'rgba(255,190,90,' + qa(0.6 * (1 - q), 4) + ')';
              ring(g, s.x * TL, s.y * TL + TL * 0.4, TL * (0.6 + 4.2 * ease(q)), 30, 0.5, 2);
            }
            this.smoke(g, s, p);
            return;
          }
          const W = R.cv.width, H = R.cv.height;
          s.hit = s.hit || {};
          for (let b = 0; b < beats.length; b++) {
            const q = (p - beats[b]) / 0.16;
            if (q < 0 || q > 1) continue;
            if (!s.hit[b]) { s.hit[b] = 1; if (R.shakeAt) R.shakeAt(b === beats.length - 1 ? 8 : 4, 0.35); }
            const a = 0.46 * (1 - q) * (1 - q);
            for (let k = 0; k < 4; k++) {
              const w = Math.round(Math.min(W, H) * (0.03 + 0.03 * k) * (1 + 0.4 * (1 - q)));
              g.fillStyle = 'rgba(120,18,12,' + qa(a * (1 - k * 0.24), 8) + ')';
              g.fillRect(0, 0, W, w); g.fillRect(0, H - w, W, w); g.fillRect(0, w, w, H - 2 * w); g.fillRect(W - w, w, w, H - 2 * w);
            }
          }
          if (!s.turn) this.stamp(g, s, p, W, H);
        },
      },
      // the pact, stamped: a war-paint handprint slammed down on the last stroke
      stamp(g, s, p, W, H) {
        const t0 = this.BEATS[3], q = (p - t0) / 0.05;
        if (q < 0 || p > 0.97) return;
        const fade = p < 0.84 ? 1 : 1 - (p - 0.84) / 0.13;
        const sc = q < 1 ? 1 + 0.7 * (1 - ease(q)) : 1;
        const rows = this.HAND, cols = rows[0].length;
        const cell = Math.max(4, Math.round(Math.min(W, H) / 36 * sc / 2) * 2);
        const hw = cols * cell, hh = rows.length * cell, x0 = Math.round(W / 2 - hw / 2), y0 = Math.round(H * 0.4 - hh / 2);
        // the world goes still under it
        g.fillStyle = 'rgba(14,6,3,' + qa(0.38 * fade * Math.min(1, q), 6) + ')';
        g.fillRect(0, 0, W, H);
        g.globalAlpha = qa(0.92 * fade, 6);
        // the paint: two reds, a ragged edge (a cell skipped here and there), a darker heart
        for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) {
          if (rows[r][c] !== 'X') continue;
          const edge = c === 0 || c === cols - 1 || rows[r][c - 1] !== 'X' || rows[r][c + 1] !== 'X' ||
            !rows[r - 1] || rows[r - 1][c] !== 'X' || !rows[r + 1] || rows[r + 1][c] !== 'X';
          if (edge && hash(r * 31 + c * 7) % 5 === 0) continue;
          g.fillStyle = edge ? '#b0331f' : (hash(r * 13 + c) % 4 === 0 ? '#6e1d12' : '#8e2e1e');
          g.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
        }
        // drips running down from the palm's heel, longer the longer it holds
        const run = Math.min(1, Math.max(0, (p - t0 - 0.03) / 0.2));
        g.fillStyle = '#8e2e1e';
        for (const [c, len] of [[5, 3], [7, 5], [9, 2]]) {
          const n = Math.round(len * run);
          for (let k = 0; k < n; k++) g.fillRect(x0 + c * cell + (k === n - 1 ? 0 : cell / 4), y0 + (rows.length + k) * cell, k === n - 1 ? cell : cell / 2, cell);
        }
        // spatter thrown off the slam
        if (q < 3) {
          for (let k = 0; k < 16; k++) {
            const an = k / 16 * Math.PI * 2 + 0.3, rr = (hw * 0.55 + cell * 3 * Math.min(1, q)) * (0.8 + 0.4 * rnd(k, 5));
            g.fillRect(snapTo(W / 2 + Math.cos(an) * rr, cell / 2), snapTo(H * 0.4 + Math.sin(an) * rr * 0.9, cell / 2), cell / 2, cell / 2);
          }
        }
        // the words
        const fs = Math.round(Math.min(34, W / 15));
        g.font = 'bold ' + fs + 'px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'top';
        const ty = y0 + hh + cell * 6, sh2 = Math.max(2, Math.round(fs / 10));
        g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillText('THE PACT IS SEALED', W / 2 + sh2, ty + sh2);
        g.fillStyle = '#e8c39a'; g.fillText('THE PACT IS SEALED', W / 2, ty);
        g.font = Math.round(fs * 0.5) + 'px sans-serif';
        g.fillStyle = 'rgba(240,226,200,0.92)';
        const left = (S.deck && S.deck.charges && S.deck.charges.pact) || 3;
        g.fillText('The next ' + left + ' war band' + (left === 1 ? '' : 's') + ' march on the rival', W / 2, ty + Math.round(fs * 1.3));
        g.globalAlpha = 1;
      },
      // the signal fire beside the hall, and its column of red smoke
      smoke(g, s, p) {
        const TL = CFG.TILE, x0 = (s.fx != null ? s.fx : s.x) * TL, y0 = (s.fy != null ? s.fy : s.y) * TL, T0 = s.t, F = FIRE();
        const v = view(3);
        if (!inView(v, x0 / TL, y0 / TL)) return;
        // a ring of stones and the logs, then the fire on them
        g.fillStyle = '#5a554c';
        ring(g, x0, y0 + 2, TL * 0.36, 9, 0.45, 4);
        g.fillStyle = '#4a3220';
        g.fillRect(snap(x0 - TL * 0.3), snap(y0 - 2), snap(TL * 0.6), 4);
        g.fillRect(snap(x0 - 4), snap(y0 - TL * 0.12), 8, 4);
        const life = p < 0.08 ? ease(p / 0.08) : p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
        if (life > 0) {
          flame(g, x0 - 5, y0, TL * 0.95 * life, TL * 0.36, T0, 3.3);
          flame(g, x0 + 5, y0, TL * 0.8 * life, TL * 0.32, T0 * 1.13, 5.9);
          flame(g, x0, y0, TL * 1.3 * life, TL * 0.42, T0 * 0.91, 1.1);
        }
        // the column of red smoke: puffs in hard steps, rising and spreading, drifting east
        for (let i = 0; i < 30; i++) {
          const t0 = (i / 30) * 2.6, age = T0 - t0;
          if (age < 0 || age > 2.4) continue;
          const q = age / 2.4, sway = Math.sin(age * 1.6 + i * 1.3) * (3 + q * 14) + q * q * TL * 1.2;
          const px = x0 + sway, py = y0 - TL * 0.9 - q * TL * 6, r = 4 + q * 16;
          g.fillStyle = q < 0.25 ? '#c0301c' : q < 0.55 ? '#962a1c' : '#6e3630';
          g.globalAlpha = qa((q < 0.12 ? q / 0.12 : 1) * (1 - q) * 0.95);
          R.pxDisc(g, px, py, r, 2);
          if (i % 4 === 0 && q < 0.5) { g.fillStyle = F[2]; g.fillRect(snap(px + r * 0.3), snap(py - r * 0.2), 2, 2); }
        }
        g.globalAlpha = 1;
      },
    },

    /* ENLIGHTENMENT — THE SWALLOWED SUN (deniable: the truce stands): for 4
       game days the sun is dark over the RIVAL alone. They SEE half as far —
       their own vision (AI.updateVision asks G.sightIn with the owner; the
       hall and level-3 towers keep their sight, the eclipse's own rule); they
       STRIKE 30% softer — every unit blow (Units.effAtk) AND the two blows
       that never pass through it, an engine's bldAtk (Combat.bldAtkOf) and a
       tower's or War Camp's own arrow (lv.atk), through Deck.mult ('atk',
       'bldAtk', 'towerAtk'); they MUSTER NO WAR BAND — one predicate
       (AI.sunHush) shuts every road to a fight in AI.daily: the storm, the
       campaign and its second front, the ordinary raid, the purge, the hunt,
       the harass sorties and the wonder alarm; and every one of their people
       not already fighting STOPS AND STARES (G.eclipseAwe, generalised per
       owner). The player's people, forewarned, work on. The world's own
       eclipse is never driven: G.eclipseDark() stays 0, so the war bands
       still muster and the predators keep their distance from the towns. */
    swallowed_sun: {
      at: 'focus', DAYS: 4, SOFT: 0.7,
      mult: {
        atk(owner) { return owner === 'A' ? this.SOFT : 1; },
        bldAtk(owner) { return owner === 'A' ? this.SOFT : 1; },
        towerAtk(owner) { return owner === 'A' ? this.SOFT : 1; },
      },
      // the rival's known ground (what the dusk lies over), centred: no read of what is hidden
      known() {
        const out = [], sb = S.map.seenB, W = CFG.W;
        if (sb) for (const k in sb) {
          const m = sb[k];
          if (!m || m.owner !== 'A') continue;
          const s = Bld.size(m.key);
          out.push({ x: (k % W) + s / 2, y: ((k / W) | 0) + s / 2 });
        }
        return out;
      },
      focus() {
        const kn = this.known();
        if (!kn.length) return null;
        return { x: kn.reduce((a, b) => a + b.x, 0) / kn.length, y: kn.reduce((a, b) => a + b.y, 0) / kn.length };
      },
      can() { return { ok: true }; },
      apply() {
        const was = !!Deck.timed('swallowed_sun');
        const e = Deck.addTimed('swallowed_sun', this.DAYS);
        if (window.R && R.startCardShow) R.startCardShow('swallowed_sun', {});
        sfx('cardDrone');
        Deck.say(was ? '🌑 Their dark deepens: ' + this.DAYS + ' more days without a sun.'
          : '🌑 The sun goes dark over the rival for ' + this.DAYS + ' days: they see half as far, strike 30% softer, muster no war band, and every one of their people not already fighting stops to stare at the sky. Your people, forewarned, work on.');
        return { ok: true, until: e.until };
      },
      end() { G.log('☀️ The sun comes back to the rival, a sliver at a time — their people take up their tools again.', 'note', 5000); },

      /* the sun in the sky, at 48 art px, blown up nearest-neighbour: the
         eclipse's own drawing language (R.drawEclipseSky), its moon sliding in
         from the east; `blaze` 0..1 lights the corona up for the card's held
         beat */
      _sky: null,
      sunArt(off, total, ring1, blaze, now) {
        const N = 48, c0 = N / 2;
        const c = this._sky || (this._sky = Object.assign(document.createElement('canvas'), { width: N, height: N }));
        const cg = c.getContext('2d');
        cg.clearRect(0, 0, N, N);
        const RS = 12;
        const dsc = (cx, r, col) => {
          cg.fillStyle = col;
          for (let y = -r; y <= r; y++) { const dx = Math.floor(Math.sqrt(r * r - y * y) + 0.35); cg.fillRect(Math.round(cx - dx), c0 + y, dx * 2 + 1, 1); }
        };
        if (!total) {
          cg.fillStyle = '#ffd35a';
          for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4 + now * 0.2, r0 = RS + 2, r1 = RS + 4 + (k % 2) * 2;
            for (let r = r0; r <= r1; r++) cg.fillRect(Math.round(c0 + Math.cos(a) * r), Math.round(c0 + Math.sin(a) * r), 1, 1);
          }
          dsc(c0, RS + 1, '#f0a030'); dsc(c0, RS, '#ffd35a'); dsc(c0, RS - 3, '#fff1b8');
        } else {
          const br = 0.75 + 0.25 * Math.sin(now * 1.7);
          for (let k = 0; k < 64; k++) {
            const a = k / 64 * Math.PI * 2 + now * 0.05, h = Math.imul(k + 11, 0x9e3779b1) >>> 0;
            const len = 2 + (h % 7) + ((k % 8) === 0 ? 5 : 0) + Math.round(blaze * ((h >> 5) % 6));
            cg.fillStyle = (k % 3 === 0 && blaze > 0.2) ? 'rgba(255,214,94,' + (0.9 * br).toFixed(3) + ')' : 'rgba(232,240,255,' + (0.85 * br).toFixed(3) + ')';
            for (let r = RS + 1; r <= Math.min(c0 - 1, RS + len); r++) {
              if (r > RS + 2 && ((h >> (r & 15)) & 1)) continue;
              cg.fillRect(Math.round(c0 + Math.cos(a) * r), Math.round(c0 + Math.sin(a) * r), 1, 1);
            }
          }
          dsc(c0, RS + 1, 'rgba(255,250,236,0.95)');
        }
        const lim = total ? 99 : RS + 1;
        for (let y = -RS; y <= RS; y++) {
          const dx = Math.floor(Math.sqrt(RS * RS - y * y) + 0.35);
          for (let x = Math.round(c0 + off - dx); x <= Math.round(c0 + off + dx); x++) {
            if (Math.hypot(x - c0, y) > lim) continue;
            cg.fillStyle = Math.hypot(x - (c0 + off), y) > RS - 1.2 ? '#15121f' : '#1d1a2b';
            cg.fillRect(x, c0 + y, 1, 1);
          }
        }
        if (ring1) {
          const bx = Math.round(c0 - (RS + 1)), by = c0;
          cg.fillStyle = '#ffffff';
          for (let r = 0; r <= 5; r++) { cg.fillRect(bx - r, by, 1, 1); cg.fillRect(bx + r, by, 1, 1); cg.fillRect(bx, by - r, 1, 1); cg.fillRect(bx, by + r, 1, 1); }
          cg.fillRect(bx - 1, by - 1, 3, 3);
        }
        return c;
      },
      // where the small dark sun hangs while the card runs: top centre, under the bar
      skySpot() {
        const dpr = R.dpr || 1, k = Math.max(2, Math.round(1.2 * dpr));
        return { k, x: Math.round(R.cv.width / 2 - 24 * k), y: Math.round(((R.topReserve || 56) + 12) * dpr) };
      },
      /* THE MOMENT, in the eclipse's own drawing language (R.drawEclipse):
         the sun stands huge in the sky and the MOON'S SHADOW rolls in across
         the screen from the west — its curved leading limb, two penumbra
         steps ahead of the umbra, cut at a quarter of the screen's
         resolution and blown up nearest-neighbour, so the dark comes in as a
         hard pixel curve and never as a fade — while the moon bites the sun
         from the east. The diamond ring flashes; at totality the world HOLDS
         (a shake, the drone's floor dropping out, the birds thrown up), a
         ring of light bursts off the black disc, the corona blazes, the
         stars come out under the umbra (over the board only — never in the
         off-map black, the eclipse's rule) and the words go up. Then the
         trailing limb lets the light back and the black sun climbs to its
         place over the bar, where it hangs for the four days. */
      SWEEP: { in0: 0.3, in1: 2.0, out0: 4.2, out1: 5.4, bands: [[1.16, 0.10], [1.08, 0.26], [1, 0.62]] },
      _shade: null,
      shadow(g, cx, cy, Rr, W, H) {
        const sc = 4, sw = Math.ceil(W / sc), sh = Math.ceil(H / sc);
        let c = this._shade;
        if (!c || c.width !== sw || c.height !== sh) c = this._shade = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
        const cg = c.getContext('2d');
        cg.clearRect(0, 0, sw, sh);
        let prev = 0;
        const ccx = cx / sc, ccy = cy / sc;
        for (const [rf, tgt] of this.SWEEP.bands) {
          const a = 1 - (1 - tgt) / (1 - prev); prev = tgt;
          const r = Rr * rf / sc;
          cg.fillStyle = 'rgba(8,10,32,' + a.toFixed(3) + ')';
          const y0 = Math.max(0, Math.floor(ccy - r)), y1 = Math.min(sh - 1, Math.ceil(ccy + r));
          for (let y = y0; y <= y1; y++) {
            const dy = y + 0.5 - ccy; if (Math.abs(dy) > r) continue;
            const dx = Math.sqrt(r * r - dy * dy);
            const xa = Math.max(0, Math.round(ccx - dx)), xb = Math.min(sw, Math.round(ccx + dx));
            if (xb > xa) cg.fillRect(xa, y, xb - xa, 1);
          }
        }
        const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
        g.drawImage(c, 0, 0, sw * sc, sh * sc);
        g.imageSmoothingEnabled = sm;
      },
      show: {
        ms: 5600, layer: 'sky',
        draw(g, s, p) {
          const T = s.t, W = R.cv.width, H = R.cv.height, now = performance.now() / 1000, SW = this.SWEEP;
          const travel = 28, tot = 2.0;
          const total = T >= tot, f = ease((T - 0.4) / 1.6);
          const off = total ? 0 : travel * (1 - f);
          if (T > 1.86 && !s.ring) { s.ring = 1; if (R.flashAt) R.flashAt(0.5, 0.35, '255,250,236'); }   // the diamond ring
          if (total && !s.beat) {
            s.beat = 1;
            if (R.shakeAt) R.shakeAt(10, 1.2);
            if (R.startle) R.startle(R.cam.x / CFG.TILE + R.viewW() / R.cam.z / CFG.TILE / 2, R.cam.y / CFG.TILE + R.viewH() / R.cam.z / CFG.TILE / 2, 30);
          }
          // THE SHADOW: in from the west, held (drifting, never still), out to the east
          const cy = H * 0.45, D = W * 0.05, Rr = Math.hypot(W / 2 + D, Math.max(cy, H - cy)) * 1.02, outR = Rr * SW.bands[0][0];
          let scx = null;
          if (T >= SW.in0 && T < SW.out1) {
            // smoothstep, never an ease-out: the limb must be SEEN crossing the screen
            const sst = q => { q = c01(q); return q * q * (3 - 2 * q); };
            if (T < SW.in1) scx = -outR + (W / 2 - D + outR) * sst((T - SW.in0) / (SW.in1 - SW.in0));
            else if (T < SW.out0) scx = (W / 2 - D) + 2 * D * ((T - SW.in1) / (SW.out0 - SW.in1));
            else scx = (W / 2 + D) + (W + outR - (W / 2 + D)) * sst((T - SW.out0) / (SW.out1 - SW.out0));
            this.shadow(g, scx, cy, Rr, W, H);
          }
          // THE STARS: under the umbra, once it is deep, over the board only
          const deep = T < tot ? 0 : T < SW.out0 ? Math.min(1, (T - tot) / 0.6) : 1 - (T - SW.out0) / 0.5;
          if (deep > 0 && scx != null) {
            const z = R.cam.z * (R.dpr || 1), sz = Math.max(2, Math.round(W / 300));
            for (let i = 0; i < 110; i++) {
              const h1 = Math.imul(i + 3, 0x9e3779b1) >>> 0, h2 = Math.imul(i + 9, 0x85ebca6b) >>> 0;
              if ((h1 & 7) === 0 && ((now / 0.5 + i) | 0) % 4 === 0) continue;   // a slow twinkle
              const sx = (h1 % 10007) / 10007 * W | 0, sy = (h2 % 9973) / 9973 * H | 0;
              if (Math.hypot(sx - scx, sy - cy) > Rr - 24) continue;
              if (!R.onBoardPx(sx / z + R.cam.x, sy / z + R.cam.y)) continue;
              g.fillStyle = (h1 & 3) === 0 ? 'rgba(255,233,160,' + qa(0.9 * deep, 4) + ')' : 'rgba(232,236,255,' + qa(0.75 * deep, 4) + ')';
              g.fillRect(snap(sx), snap(sy), (h2 & 7) === 0 ? sz * 2 : sz, (h2 & 7) === 0 ? sz * 2 : sz);
            }
          }
          const blaze = total ? Math.max(0, 1 - Math.abs(T - 2.6) / 1.6) : 0;
          const art = this.sunArt(off, total, !total && T > 1.85, blaze, now);
          // big, then climbing to its place
          const sp = this.skySpot(), big = Math.max(4, Math.round(Math.min(W, H) * 0.42 / 48));
          const m = ease((T - 4.2) / 1.2), k = Math.round(big + (sp.k - big) * m);
          const bx = W / 2 - 24 * big, by = H * 0.18 - 24 * big;
          const x = Math.round(bx + (sp.x - bx) * m), y = Math.round(by + (sp.y - by) * m);
          const ccx = x + 24 * k, ccy = y + 24 * k;
          const fin = T < 0.5 ? qa(T / 0.5, 4) : 1;
          // THE BURST at totality: two rings of light, made of dots, thrown off the black disc
          if (total && T < tot + 1.1) {
            g.save(); g.globalCompositeOperation = 'lighter';
            for (const [d0, n, col] of [[0, 56, '255,233,160'], [0.18, 40, '232,240,255']]) {
              const q = (T - tot - d0) / 0.9;
              if (q <= 0 || q >= 1) continue;
              g.fillStyle = 'rgba(' + col + ',' + qa(0.95 * (1 - q), 4) + ')';
              ring(g, ccx, ccy, 13 * k + Math.max(W, H) * 0.55 * ease(q), n, 1, Math.max(2, snap(k * 1.5)));
            }
            g.restore();
          }
          const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
          g.globalAlpha = fin;
          g.drawImage(art, x, y, 48 * k, 48 * k);
          if (total && blaze > 0) {                   // the corona BLAZES: light added over itself
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = qa(0.7 * blaze, 6);
            g.drawImage(art, x, y, 48 * k, 48 * k);
            g.globalCompositeOperation = 'source-over';
          }
          g.globalAlpha = 1;
          g.imageSmoothingEnabled = sm;
          if (total && T < 4.4) {
            const a = qa(Math.min(1, (T - tot) / 0.4) * Math.min(1, (4.4 - T) / 0.6), 6);
            const fs = Math.round(Math.min(40, W / 13));
            g.globalAlpha = a;
            g.font = 'bold ' + fs + 'px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'top';
            const ty = y + 48 * k + Math.round(fs * 0.4), sh2 = Math.max(2, Math.round(fs / 10));
            g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillText('THEIR SUN IS SWALLOWED', W / 2 + sh2, ty + sh2);
            g.fillStyle = '#ffd45e'; g.fillText('THEIR SUN IS SWALLOWED', W / 2, ty);
            g.font = Math.round(fs * 0.45) + 'px sans-serif';
            g.fillStyle = 'rgba(232,236,255,0.9)';
            g.fillText('Four days of dark over the rival', W / 2, ty + Math.round(fs * 1.25));
            g.globalAlpha = 1;
          }
        },
      },
      /* THE DUSK over the rival's known ground — every building of theirs the
         player's memory holds, lit over a disc of DUSK_R tiles in three hard
         alpha steps at a quarter-tile grid (one canvas, rebuilt only when
         that memory changes; one blit a frame) — and the small black sun
         over the bar. Fades in and out over a tenth of a day in steps. */
      DUSK_R: 5,
      _dusk: null,
      duskCv() {
        const now = performance.now();
        const c = this._dusk;
        if (c && c.W === CFG.W && c.map === S.map && now - c.at < 600) return c.cv;
        let key = CFG.W + ':';
        const kn = this.known();
        for (const b of kn) key += b.x + ',' + b.y + ';';
        if (c && c.key === key && c.map === S.map) { c.at = now; return c.cv; }
        const Q = 4, W = CFG.W, H = CFG.H, cw = W * Q, ch = H * Q, D = this.DUSK_R;
        const lvl = new Uint8Array(cw * ch);
        for (const b of kn) {
          const x0 = Math.max(0, Math.floor((b.x - D) * Q)), x1 = Math.min(cw - 1, Math.ceil((b.x + D) * Q));
          const y0 = Math.max(0, Math.floor((b.y - D) * Q)), y1 = Math.min(ch - 1, Math.ceil((b.y + D) * Q));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const d = Math.hypot((x + 0.5) / Q - b.x, (y + 0.5) / Q - b.y);
            const l = d <= D - 1.6 ? 3 : d <= D - 0.8 ? 2 : d <= D ? 1 : 0;
            if (l > lvl[y * cw + x]) lvl[y * cw + x] = l;
          }
        }
        const cv = (c && c.cv && c.cv.width === cw) ? c.cv : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
        const q = cv.getContext('2d'), im = q.createImageData(cw, ch), d = im.data, A = [0, 52, 92, 128];
        for (let i = 0; i < lvl.length; i++) {
          if (!lvl[i]) continue;
          d[i * 4] = 8; d[i * 4 + 1] = 10; d[i * 4 + 2] = 30; d[i * 4 + 3] = A[lvl[i]];
        }
        q.putImageData(im, 0, 0);
        this._dusk = { W: CFG.W, map: S.map, at: now, key, cv };
        return cv;
      },
      drawLive(g, e) {
        const now = Deck.now(), TL = CFG.TILE;
        const fade = qa(Math.min(1, (now - e.from) / 0.12, (e.until - now) / 0.12), 4);
        if (fade <= 0) return;
        const cv = this.duskCv();
        R.clipBoard(g, () => {
          const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
          g.globalAlpha = fade;
          g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, CFG.W * TL, CFG.H * TL);
          g.globalAlpha = 1;
          g.imageSmoothingEnabled = sm;
        });
        // the small black sun: not while the play's own sun is still climbing
        // to its place, and not over the world's own eclipse
        if (R.cardShows.some(s => s.id === 'swallowed_sun') || (S.eclipse && S.eclipse.phase)) return;
        const t = performance.now() / 1000, sp = this.skySpot(), art = this.sunArt(0, true, false, 0.25, t);
        g.setTransform(1, 0, 0, 1, 0, 0);
        const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
        g.globalAlpha = fade;
        g.drawImage(art, sp.x, sp.y, 48 * sp.k, 48 * sp.k);
        g.globalAlpha = 1;
        g.imageSmoothingEnabled = sm;
      },
    },

    /* IMPERIAL — KRAKEN'S CALL: the kraken rises against the RIVAL. It drags
       down up to 4 of their ships on OPEN water (G.openWaterAt — the deep
       lives there; a hull on a pond is out of its reach), their warships
       first, then the troop rafts, then the fishing boats — each its own act
       (rise, the take, the thrash, the sink) queued in S.deck.kraken and
       staggered so the deep comes up four times in a few seconds; the world
       event's singleton (S.kraken.ev) and its 'answer' are never used, so a
       fleet that would have "beaten it back" does not save a single hull.
       And it batters every building of theirs within 2 tiles of open water
       for 600, the rival's hall at most 40% of its strength (Deck.hitBld,
       cause 'kraken' — never the wilds' 'fire'). The hulls are KILLS, the
       razes are razes; nothing scores krakenSlain and nothing is
       specialFired. The act is SEEN: every spot it rises at and every shore
       it batters is charted (card-lit) and watched while it plays.
       THE TRUCE: reaching the rival at peace ends it AT THE PLAY, like an
       attack order — asked of what the player KNOWS (a rival hull in sight or
       seen through a spy, a remembered building by open water), and warned
       before the confirm. A player at peace who knows of nothing it could
       reach has it handed back, in words that say nothing about what is
       hidden. With no open sea in the world it is greyed: "Needs open
       water"; with nothing at all to strike it comes back with a reason. */
    krakens_call: {
      at: 'focus', DMG: 600, TC_CAP: 0.4, SHIPS: 4, NEAR: 2,
      RISE: 1.6, THRASH: 1.4, SINK: 1.6,     // the world's own act's beats (R.drawKraken fades on them)
      FIRST: 0.5, GAP: 0.85,                 // the first rise, then one every GAP seconds
      COAST_S: 1.5, TAIL: 2.6,               // the shore is battered at COAST_S; its watch holds TAIL more
      SIGHT: 3, COAST_SIGHT: 2,
      SOFT: { fireship: 0, bombard: 1, transport: 2, fishboat: 3 },
      openSea() {
        const wb = G._waterBodies();
        for (let b = 0; b < wb.size.length; b++) if (wb.edge[b] || wb.size[b] >= CFG.KRAKEN.bodyMin) return true;
        return false;
      },
      // the nearest open-water tile within NEAR of a footprint (x, y, s), or null
      shoreOf(x, y, s) {
        let best = null, bd = 1e9;
        for (let wy = y - this.NEAR - 1; wy <= y + s + this.NEAR; wy++) for (let wx = x - this.NEAR - 1; wx <= x + s + this.NEAR; wx++) {
          if (!MapGen.inB(wx, wy) || !G.openWaterAt(wx, wy)) continue;
          const dx = Math.max(x - (wx + 1), wx - (x + s), 0), dy = Math.max(y - (wy + 1), wy - (y + s), 0), d = Math.hypot(dx, dy);
          if (d <= this.NEAR && d < bd) { bd = d; best = { x: wx, y: wy }; }
        }
        return best;
      },
      targets() {
        const ships = S.units.filter(u => u.owner === 'A' && Units.isNaval(u) && u.hp > 0 && G.openWaterAt(u.x | 0, u.y | 0))
          .sort((a, b) => (this.SOFT[a.kind] ?? 2) - (this.SOFT[b.kind] ?? 2) || a.id - b.id).slice(0, this.SHIPS);
        const coast = [];
        for (const b of S.buildings) {
          if (b.owner !== 'A' || !Bld.attackable(b)) continue;
          const w = this.shoreOf(b.x, b.y, Bld.size(b));
          if (w) coast.push({ b, w });
        }
        return { ships, coast };
      },
      // what the PLAYER knows of the rival by the open sea — the truce's question
      knows() {
        for (const u of S.units)
          if (u.owner === 'A' && Units.isNaval(u) && G.openWaterAt(u.x | 0, u.y | 0) &&
              (G.visibleAt(u.x | 0, u.y | 0) || Deck.spySees(u))) return true;
        const seen = S.map.seenB, W = CFG.W;
        if (seen) for (const k in seen) {
          const m = seen[k];
          if (!m || m.owner !== 'A' || m.key === 'mine') continue;
          if (this.shoreOf(k % W, (k / W) | 0, Bld.size(m.key))) return true;
        }
        return false;
      },
      // will the deep come up for anything? At peace, only for what the player knows of
      plan() {
        if (S.peace && !this.knows()) return null;
        const t = this.targets();
        return (t.ships.length || t.coast.length) ? t : null;
      },
      can() {
        if (!this.openSea()) return { ok: false, why: 'Needs open water' };
        if (S.deck && S.deck.kraken) return { ok: false, why: 'The kraken is still risen.' };
        if (S.kraken && S.kraken.ev) return { ok: false, why: 'The deep is already stirring — wait for it to settle.' };
        return { ok: true };
      },
      warn() { return S.peace && this.knows() ? Deck.TRUCE : null; },
      focus() {
        if (!this.can().ok) return null;
        const t = this.plan();
        if (!t) return null;
        if (t.ships.length) return { x: t.ships[0].x, y: t.ships[0].y };
        return { x: Bld.cx(t.coast[0].b), y: Bld.cy(t.coast[0].b) };
      },
      apply() {
        const ok = this.can();
        if (!ok.ok) return ok;
        const t = this.plan();
        if (!t) return { ok: false, why: S.peace
          ? 'The truce holds, and you know of nothing of theirs on the open sea or beside it — the deep would take nothing.'
          : 'Nothing of theirs rides the open sea or stands beside it — the deep would come up empty.' };
        // the player knows what it reaches (plan): an attack order's terms
        if (S.peace) G.breakPeace();
        const K = {
          t: 0, n: Deck.playedCount(), hit: false, took: 0, struck: 0, razed: 0,
          acts: t.ships.map((u, i) => ({ id: u.id, x: u.x, y: u.y, at: this.FIRST + i * this.GAP, phase: 'wait', t: 0 })),
          coast: t.coast.map(({ b, w }) => ({ id: b.id, x: Bld.cx(b), y: Bld.cy(b), wx: w.x + 0.5, wy: w.y + 0.5 })),
        };
        // the shore it batters is watched from the moment it is called
        const lit = [];
        for (const c of K.coast) for (const i of disc(c.x | 0, c.y | 0, this.COAST_SIGHT)) lit.push(i);
        Deck.light(lit);
        Deck.run().kraken = K;
        // the beast's art is fetched on demand (Assets.FX_SETS — nothing with no set)
        if (window.Assets && Assets.wantFx) Assets.wantFx('kraken');
        if (window.R) {
          if (R.startCardShow) R.startCardShow('krakens_call', {});
          if (R.flashAt) R.flashAt(0.4, 1.4, '2,10,22');
          if (R.shakeAt) R.shakeAt(4, 1.4);
        }
        sfx('cardDeep');
        Deck.say('🐙 You called on the deep, and the kraken rose against the rival' +
          (t.ships.length ? ' — ' + t.ships.length + ' of their ships in its reach' : '') +
          (t.coast.length ? (t.ships.length ? ' and ' : ' — ') + t.coast.length + ' building' + (t.coast.length === 1 ? '' : 's') + ' on their shore' : '') + '.');
        return { ok: true };
      },
      endT(K) {
        let e = this.COAST_S + this.TAIL;
        for (const a of K.acts) e = Math.max(e, a.at + this.RISE + this.THRASH + this.SINK);
        return e;
      },
      // the blow on the shore: 600 to every building it reaches, the hall clamped
      batter(K) {
        let struck = 0, razed = 0;
        for (const c of K.coast) {
          const b = Bld.get(c.id);
          if (!b || b.hp <= 0 || !Deck.foe(b.owner)) continue;
          Deck.hitBld(b, this.DMG, this.TC_CAP, 'kraken');
          struck++;
          if (b.hp <= 0 || !S.buildings.includes(b)) razed++;
          if (window.R && R.impact && G.visibleAt(c.x | 0, c.y | 0)) R.impact(c.x, c.y, 'stone');
        }
        K.struck = struck; K.razed = razed;
        if (struck) {
          if (window.R) { if (R.shakeAt) R.shakeAt(8, 0.9); if (R.startle && K.coast[0]) R.startle(K.coast[0].x, K.coast[0].y, 14); }
          sfx('impact');
          G.log('🐙 The kraken batters their shore: ' + struck + ' building' + (struck === 1 ? '' : 's') + ' struck' +
            (razed ? ', ' + razed + ' down' : '') + '.', 'note', 6000);
        }
      },
      over(K) {
        if (K.took) G.log('🐙 The kraken sinks back into the deep — ' + K.took + ' of their ships dragged under.', 'note', 6000);
        else if (!K.struck) G.log('🐙 The kraken sinks back into the deep with nothing to show for it.', 'note', 5000);
      },
      /* THE ACT, drawn from its state (so a save mid-act reloads into the same
         sea): the open water darkens, every rise churns foam rings and the
         take throws a splash, tentacles come up out of the sea and slam down
         on the shore. The beast itself is R.drawKraken — ONE function, the
         world event's own, so the kraken's look can be redrawn in one place. */
      draw(g, dt, K) {
        const TL = CFG.TILE, W = CFG.W, v = view(2), tt = K.t, end = this.endT(K);
        const a = qa(0.42 * Math.min(1, tt / 0.6) * c01((end - tt) / 1.0), 8);
        if (a > 0) {
          g.fillStyle = 'rgba(2,10,24,' + a + ')';
          for (let ty = Math.max(0, v.y0 | 0); ty <= Math.min(CFG.H - 1, Math.ceil(v.y1)); ty++) {
            let r0 = -1;
            for (let tx = Math.max(0, v.x0 | 0); tx <= Math.min(W, Math.ceil(v.x1) + 1); tx++) {
              const on = tx < W && MapGen.onBoard(tx, ty) && S.map.explored[ty * W + tx] && G.openWaterAt(tx, ty);
              if (on && r0 < 0) r0 = tx;
              if (!on && r0 >= 0) { g.fillRect(r0 * TL, ty * TL, (tx - r0) * TL, TL); r0 = -1; }
            }
          }
        }
        for (const c of K.coast) this.tentacle(g, c, tt, v);
        for (const ac of K.acts) {
          if (ac.phase === 'wait' || ac.phase === 'done' || !G.visibleAt(ac.x | 0, ac.y | 0)) continue;
          this.foam(g, ac);
          R.drawKraken(g, ac);
        }
      },
      foam(g, ac) {
        const TL = CFG.TILE, x = ac.x * TL, y = ac.y * TL + TL * 0.35;
        g.fillStyle = '#dceef4';
        if (ac.phase === 'rise') {
          for (let j = 0; j < 3; j++) {
            const q = (ac.t / this.RISE * 1.6 + j / 3) % 1;
            g.globalAlpha = qa(0.85 * (1 - q));
            ring(g, x, y, TL * (0.5 + 1.8 * q), 28, 0.45);
          }
        } else if (ac.phase === 'thrash') {
          const q = c01(ac.t / 1.0);
          g.globalAlpha = qa(1 - q);
          ring(g, x, y, TL * (0.8 + 2.6 * ease(q)), 40, 0.5);
          ring(g, x, y, TL * (0.5 + 1.5 * ease(q)), 28, 0.5);
          for (let k = 0; k < 16; k++) {               // the spray thrown up by the take
            const vx = (rnd(ac.id, k) - 0.5) * 120, vy = 60 + rnd(ac.id, k + 40) * 110, tt = ac.t;
            const sy = y - vy * tt + 160 * tt * tt;
            if (sy > y) continue;
            g.globalAlpha = qa(1 - q);
            g.fillRect(snap(x + vx * tt), snap(sy), 2 + (k % 2) * 2, 2 + (k % 2) * 2);
          }
          g.globalAlpha = qa(0.6 * (1 - q * 0.5));
          ring(g, x, y, TL * (1.2 + 0.2 * Math.sin(ac.t * 9)), 22, 0.45);
        } else {
          const q = c01(ac.t / this.SINK);
          g.globalAlpha = qa(0.7 * (1 - q));
          for (let k = 0; k < 18; k++) {                // the whirl closing over it
            const an = k / 18 * Math.PI * 2 + ac.t * 4, rr = TL * (1.6 - 1.2 * q) * (0.6 + 0.4 * ((k % 3) / 2));
            g.fillRect(snap(x + Math.cos(an) * rr), snap(y + Math.sin(an) * rr * 0.45), 2, 2);
          }
        }
        g.globalAlpha = 1;
      },
      /* AN ARM OF THE DEEP, drawn along a spine of points {x, y, r} from the
         water to the tip, at a `cell` pixel grid (2 in the world, ~6 device
         px in the sky): an ink outline, the body, a wet teal sheen down the
         outer edge, pale suckers down the inner one, a teal tip. ONE drawing
         for the world's slam and the sky's rising arms — the kraken's arms,
         like R.drawKraken its body, are redrawn in one place. */
      arm(g, pts, cell) {
        const AP = ART.PALETTE, n = pts.length;
        if (n < 2) return;
        const nrm = i => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
          return { x: -dy / L, y: dx / L };
        };
        g.fillStyle = AP.ink[0];
        for (const q of pts) R.pxDisc(g, q.x, q.y, q.r + cell, cell);
        for (let i = 0; i < n; i++) {
          const q = pts[i], t = i / (n - 1);
          g.fillStyle = t > 0.88 ? AP.teal[1] : AP.ink[1];
          R.pxDisc(g, q.x, q.y, q.r, cell);
        }
        for (let i = 1; i < n - 1; i++) {
          const q = pts[i], m = nrm(i), t = i / (n - 1);
          if (q.r < cell * 1.5) continue;
          const big = q.r > cell * 4 ? 2 : 1, c2 = cell * big;
          // the wet sheen along the outer edge: a dark-teal rim, lit every few steps
          g.fillStyle = AP.teal[0];
          g.fillRect(snapTo(q.x + m.x * q.r * 0.62, cell), snapTo(q.y + m.y * q.r * 0.62, cell), c2, c2);
          if (i % 3 === 1 && t < 0.85) { g.fillStyle = AP.teal[1]; g.fillRect(snapTo(q.x + m.x * q.r * 0.5, cell), snapTo(q.y + m.y * q.r * 0.5, cell), cell, cell); }
          // suckers down the inner face: a pale ring with a dark mouth
          if (i % 2 === 0 && t < 0.92) {
            const sx = snapTo(q.x - m.x * q.r * 0.55, cell), sy = snapTo(q.y - m.y * q.r * 0.55, cell);
            g.fillStyle = AP.bone ? AP.bone[2] : AP.teal[2];
            g.fillRect(sx, sy, c2, c2);
            if (big > 1) { g.fillStyle = AP.ink[0]; g.fillRect(sx + cell / 2, sy + cell / 2, cell, cell); }
          }
        }
      },
      // a spine for an arm: from a base, `len` long, curling hard at the tip
      spine(bx, by, a0, len, curl, r0, sway, N) {
        const pts = [];
        let x = bx, y = by, a = a0;
        const st = len / N;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          pts.push({ x, y, r: Math.max(1, r0 * (1 - t * 0.82)) });
          a += curl * (0.012 + 0.34 * t * t * t) + sway * Math.sin(t * 3.1) * 0.02;
          x += Math.cos(a) * st; y += Math.sin(a) * st;
        }
        return pts;
      },
      /* a tentacle: up out of the open water beside the building, over, and
         DOWN on it at the blow — then back into the sea. */
      tentacle(g, c, tt, v) {
        const t0 = this.COAST_S - 0.7, t1 = this.COAST_S + 1.6;
        if (tt < t0 || tt > t1) return;
        if (!inView(v, c.x, c.y) && !inView(v, c.wx, c.wy)) return;
        if (!G.visibleAt(c.x | 0, c.y | 0) && !G.visibleAt(c.wx | 0, c.wy | 0)) return;
        const TL = CFG.TILE, ox = c.wx * TL, oy = c.wy * TL, bx = c.x * TL, by = c.y * TL;
        let tipX, tipY, reach;
        if (tt < this.COAST_S) {                          // rearing up out of the sea
          const u = ease((tt - t0) / 0.7);
          tipX = ox + (bx - ox) * 0.25; tipY = oy - TL * 2.8 * u; reach = u;
        } else if (tt < this.COAST_S + 0.12) {            // the slam
          const u = (tt - this.COAST_S) / 0.12;
          tipX = ox + (bx - ox) * (0.25 + 0.75 * u); tipY = oy - TL * 2.8 * (1 - u) + (by - oy) * u; reach = 1;
        } else if (tt < this.COAST_S + 0.8) { tipX = bx; tipY = by; reach = 1; }
        else {                                            // drawn back under
          const u = ease((tt - this.COAST_S - 0.8) / 0.8);
          tipX = bx + (ox - bx) * u; tipY = by + (oy - by) * u; reach = 1 - u;
        }
        if (reach <= 0.02) return;
        const cx = (ox + tipX) / 2 + (tipY - oy) * 0.15, cy = Math.min(oy, tipY) - TL * 1.3 * reach;
        const N = 22, pts = [];
        const writhe = Math.sin(tt * 11) * 2;
        for (let i = 0; i <= N; i++) {
          const q = i / N, a = (1 - q) * (1 - q), b2 = 2 * (1 - q) * q, d = q * q;
          pts.push({ x: a * ox + b2 * cx + d * tipX + Math.sin(q * 6 + tt * 9) * writhe * q,
                     y: a * oy + b2 * cy + d * tipY, r: Math.max(2, (9 - 7 * q) * (0.5 + 0.5 * reach)) });
        }
        this.arm(g, pts, 2);
        // foam where it leaves the water, and spray off the slam
        g.fillStyle = '#dceef4';
        g.globalAlpha = qa(0.85 * reach);
        ring(g, ox, oy + 4, TL * (0.5 + 0.15 * Math.sin(tt * 12)), 16, 0.45);
        ring(g, ox, oy + 4, TL * (0.85 + 0.1 * Math.sin(tt * 9)), 22, 0.45);
        if (tt >= this.COAST_S && tt < this.COAST_S + 0.6) {
          const q = (tt - this.COAST_S) / 0.6;
          g.globalAlpha = qa(1 - q);
          g.fillStyle = '#c9b48a';
          for (let k = 0; k < 14; k++) {                   // the shore thrown up where it lands
            const an = k / 14 * Math.PI * 2, rr = TL * (0.3 + 1.3 * ease(q)) * (0.7 + 0.3 * rnd(c.id, k));
            g.fillRect(snap(bx + Math.cos(an) * rr), snap(by + Math.sin(an) * rr * 0.5 - TL * 0.5 * Math.sin(q * Math.PI)), 4, 4);
          }
        }
        g.globalAlpha = 1;
      },
      /* THE MOMENT the deep answers, over the whole screen: the dark of the
         sea closes in from the edges in hard bands while three vast arms come
         up out of the bottom of the screen — swaying, curling at the tip —
         with the spray thrown off them, and sink back as the act begins on
         the map. Coarse pixel cells, never a smooth vector arm. */
      ARMS: [[0.14, 0.66, 1, 0.0, 1.0], [0.86, 0.58, -1, 1.7, 0.92], [0.52, 0.42, 1, 3.1, 0.66]],
      show: {
        ms: 3000, layer: 'sky',
        draw(g, s, p) {
          const W = R.cv.width, H = R.cv.height, T = s.t, k = p < 0.25 ? ease(p / 0.25) : 1 - ease((p - 0.4) / 0.6);
          if (k > 0) {
            for (let b = 0; b < 5; b++) {
              const w = Math.round(Math.min(W, H) * (0.04 + 0.05 * b) * k);
              g.fillStyle = 'rgba(2,14,30,' + qa(0.55 * k * (1 - b * 0.18), 8) + ')';
              g.fillRect(0, 0, W, w); g.fillRect(0, H - w, W, w); g.fillRect(0, w, w, H - 2 * w); g.fillRect(W - w, w, w, H - 2 * w);
            }
          }
          // the arms: up over 0.05..0.4, held swaying, down over 0.62..0.95
          const up = p < 0.05 ? 0 : p < 0.4 ? ease((p - 0.05) / 0.35) : p < 0.62 ? 1 : 1 - ease((p - 0.62) / 0.33);
          if (up <= 0) return;
          const cell = Math.max(4, Math.round(Math.min(W, H) / 110));
          for (let i = this.ARMS.length - 1; i >= 0; i--) {
            const [fx, fh, curl, ph, sc] = this.ARMS[i];
            const len = H * fh * up, r0 = Math.min(W, H) * 0.11 * sc;
            if (len < r0) continue;
            const sway = Math.sin(T * 2.3 + ph);
            const pts = this.spine(W * fx + sway * W * 0.02, H + r0 * 0.6, -Math.PI / 2 + curl * 0.18 + sway * 0.06, len, curl * (0.55 + 0.25 * Math.sin(T * 1.7 + ph)), r0, sway, 34);
            this.arm(g, pts, cell);
          }
          // spray off the water at their feet, light added
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < this.ARMS.length; i++) {
            const bx = W * this.ARMS[i][0];
            for (let n = 0; n < 18; n++) {
              const ph2 = (T * 1.4 + n / 18 + i * 0.37) % 1;
              const sx = bx + (rnd(i * 31 + n, 3) - 0.5) * W * 0.16, sy = H - ph2 * H * 0.12 * (0.5 + rnd(n, i));
              g.fillStyle = 'rgba(220,238,244,' + qa(0.8 * (1 - ph2) * up, 4) + ')';
              g.fillRect(snapTo(sx, cell), snapTo(sy, cell), cell, cell);
            }
          }
          g.restore();
        },
      },
    },
  });

  /* ================= THE VOICES (js/audio.js) =================
     Synthesised, never a file. Each is gapped (Sound.GAP) so a fumbled
     double play never doubles a drone. */
  if (typeof Sound !== 'undefined' && Sound._VOICES && Sound.GAP) {
    Object.assign(Sound._VOICES, {
      // the fire catches: a whoosh climbing the band, a crackle, a low warmth
      cardBeacon(t, v) {
        this._noise({ at: t, hz: 300, to: 2400, dur: 0.6, q: 0.7, gain: 0.18 * v, atk: 0.12 });
        this._noise({ at: t, delay: 0.35, hz: 3000, to: 1800, dur: 0.5, q: 2.5, gain: 0.07 * v, rate: 1.8 });
        this._note({ at: t, hz: 110, to: 70, dur: 0.6, type: 'triangle', gain: 0.10 * v, lp: 500 });
      },
      // a hide unrolled on a table, a soft thump, and the find rising
      cardUnroll(t, v) {
        this._noise({ at: t, hz: 3800, to: 2200, dur: 0.7, q: 0.6, gain: 0.08 * v, atk: 0.1 });
        this._noise({ at: t, delay: 0.75, hz: 400, to: 160, dur: 0.18, q: 0.9, gain: 0.14 * v });
        this._note({ at: t, delay: 2.05, hz: 392, to: 587, dur: 0.5, type: 'sine', gain: 0.07 * v });
      },
      // an eye opening: a low shimmer rising under a glassy ring
      cardEye(t, v) {
        this._note({ at: t, hz: 146, to: 220, dur: 1.2, type: 'sine', gain: 0.12 * v, atk: 0.4 });
        this._note({ at: t, delay: 0.5, hz: 880, to: 1320, dur: 0.9, type: 'sine', gain: 0.05 * v, atk: 0.2 });
        this._noise({ at: t, hz: 5200, to: 3000, dur: 1.0, q: 3, gain: 0.03 * v, atk: 0.3 });
      },
      // four war-drum strokes, the last two close (on the show's own beats)
      cardDrums(t, v) {
        for (const [d, k] of [[0.27, 1], [0.95, 1], [1.63, 0.9], [1.94, 1.15]]) {
          this._note({ at: t, delay: d, hz: 82, to: 46, dur: 0.42, type: 'sine', gain: 0.32 * v * k });
          this._noise({ at: t, delay: d, hz: 260, to: 90, dur: 0.22, q: 0.9, gain: 0.22 * v * k, filter: 'lowpass' });
        }
      },
      // a band turns: two strokes
      cardDrum(t, v) {
        for (const d of [0.17, 0.71]) {
          this._note({ at: t, delay: d, hz: 82, to: 46, dur: 0.4, type: 'sine', gain: 0.28 * v });
          this._noise({ at: t, delay: d, hz: 260, to: 90, dur: 0.2, q: 0.9, gain: 0.18 * v, filter: 'lowpass' });
        }
      },
      // the sun goes out: a deep drone swelling, and at totality the floor drops away
      cardDrone(t, v) {
        this._note({ at: t, hz: 55, dur: 4.6, type: 'sawtooth', gain: 0.10 * v, lp: 240, atk: 1.2 });
        this._note({ at: t, hz: 82.4, dur: 4.2, type: 'sine', gain: 0.09 * v, atk: 1.4 });
        this._note({ at: t, delay: 2.0, hz: 41, to: 33, dur: 3.2, type: 'sine', gain: 0.24 * v, atk: 0.12 });
        this._noise({ at: t, delay: 2.0, hz: 220, to: 60, dur: 2.4, q: 0.8, gain: 0.16 * v, filter: 'lowpass', rate: 0.5 });
      },
      // the deep answers: a sub swell under the sea rushing in
      cardDeep(t, v) {
        this._note({ at: t, hz: 49, to: 33, dur: 2.6, type: 'sine', gain: 0.30 * v, atk: 0.6 });
        this._noise({ at: t, hz: 600, to: 120, dur: 2.2, q: 0.6, gain: 0.18 * v, filter: 'lowpass', atk: 0.5, rate: 0.6 });
      },
      // a hull dragged under: a crash and the water closing over it
      cardTake(t, v) {
        this._noise({ at: t, hz: 1600, to: 300, dur: 0.6, q: 0.5, gain: 0.24 * v });
        this._note({ at: t, hz: 70, to: 40, dur: 0.6, type: 'sine', gain: 0.22 * v });
        this._noise({ at: t, delay: 0.3, hz: 2400, to: 900, dur: 0.8, q: 0.7, gain: 0.08 * v, rate: 1.4 });
      },
    });
    Object.assign(Sound.GAP, { cardBeacon: 1.0, cardUnroll: 2.0, cardEye: 2.0, cardDrums: 3.0, cardDrum: 1.0, cardDrone: 4.0, cardDeep: 3.0, cardTake: 0.35 });
  }
})();
