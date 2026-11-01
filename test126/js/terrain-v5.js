/* TERRAIN V5 — THE PROTOTYPE OF REGIONAL CHARACTER (test page only; production
   loads no such file and paints V4).

   One landscape is not one palette: it is a few coherent WORLD FIELDS, each
   derived from the map the generator already made, and a REGION that says how
   each field looks. Everything here is cosmetic: no tile, rule, path or save
   is read differently, and every field is a pure function of the terrain and
   the seed (so a reload paints the same land).

     ELEVATION  e5  rolling swells at the region's own scale, rising toward the
                    mountains and falling toward the water (the valleys hold the
                    lakes), karst dolines pressed in — read in the core as a C2
                    spline and LIT, continuously, so a slope is a gradient of light
                    and never a contour band
     MOISTURE   m5  near water, in hollows, under the woods; the Tuscan field
                    mosaic is moisture laid out in fields — picks dry / ordinary /
                    lush grass, each a density of blades, never a flat blob
     GEOLOGY    g5  how much ground shows through (slope, crest, hollow, dryness,
                    a patch noise), and k5 WHICH ground: limestone or terra rossa,
                    clay or ochre path, alkali crust or loess
     VEGETATION v5  where tufts and flowers gather; s5 where shrubs grow (on the
                    rock's edge in the karst, on dry ground in the garrigue)

   The core (tools/terrain-core.src.js) reads these as world.F.e5 … s5 and the
   region as world.R5; with R5 null it paints V4 exactly. */
(function () {
  if (!window.TerrainX) return;
  const TX = window.TerrainX, KEY = 'neo-v5biome';
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} } };

  const BIOMES = {
    tuscan: {
      name: 'Tuscan countryside', short: 'Tuscan', ref: "Val d'Orcia — rolling clay hills, a mosaic of wheat and grass, cypress and poppies",
      mid: ['#2a3a1c', '#334822', '#3d5527', '#48632c', '#537131', '#5f7e37', '#6c8b3e', '#7a9746', '#8aa351'],
      dry: ['#4b4224', '#5c512a', '#6e6131', '#807038', '#928040', '#a39049', '#b39f54', '#c2ad61', '#cfba70'],
      lush: ['#1f3a1c', '#264822', '#2e5728', '#36662d', '#3f7533', '#498339', '#549141', '#609e49', '#6eaa53'],
      geoA: ['#5c5444', '#716751', '#877b5f', '#9b8e6e', '#ad9f7e', '#bdaf8f'],
      geoB: ['#4a3826', '#58432d', '#665035', '#745c3e', '#826947', '#907651'],
      flowers: [['#d23a2a', '#2a1a10'], ['#d23a2a', '#2a1a10'], ['#e04a30', '#3a2010'], ['#f2efe2', '#e8c24a']],
      shrubs: [['cone', ['#16220f', '#233318', '#30441f', '#3e5527']], ['round', ['#1c2a14', '#2b3d1c', '#3a5024', '#4c642e']]],
      hillS: 6.5, hillAmp: 3.4, mtnRise: 1.5, mtnR: 7, valley: 1.0, relief: 1.35, mContrast: 2.2, fineAmp: 0.3, fineS: 2.2,
      shadeAmp: 0.4, warm: 0.45, cool: 0.3, ao: 0.12,
      moist: 0.34, dryT: 0.4, lushT: 0.66, mosaic: 1.0, mosaicS: 3.4, plough: 0.12, wetR: 1.6, stoneA: false, stoneB: false,
      geoBase: -0.55, geoSlope: 0.9, geoCrest: 0.5, geoHollow: 0, geoDry: 0.25, geoNoise: 0.55, geoS: 2.4, geoRag: 0.45, geoCob: 0, kMode: 'noise',
      tuft: 0.8, flower: 1.1, shrub: 1.6, shrubMode: 'fieldEdge',
    },
    karst: {
      name: 'Balkan limestone karst', short: 'Karst', ref: 'The Slovenian Karst — grey limestone breaking through dry grass, dolines of red soil, juniper scrub',
      mid: ['#29331a', '#323e1f', '#3c4a24', '#46562a', '#51622f', '#5c6e35', '#687a3c', '#758644', '#83924e'],
      dry: ['#363a22', '#424728', '#4f542e', '#5c6135', '#696e3c', '#777b44', '#85884d', '#939556', '#a1a261'],
      lush: ['#1e351b', '#264221', '#2e5027', '#365e2c', '#3f6c32', '#497a39', '#548841', '#60954a', '#6da254'],
      geoA: ['#56554e', '#6c6a61', '#838075', '#99968a', '#aeab9e', '#c3c0b2'],
      geoB: ['#4c2a1e', '#5d3424', '#6f3f2b', '#804a33', '#90563c', '#9e6347'],
      flowers: [['#f2efe2', '#e8c24a'], ['#9b6cc0', '#f0d060'], ['#f0cf4a', '#c8902a']],
      shrubs: [['cone', ['#14200f', '#1f3016', '#2b401d', '#385124']], ['dotted', ['#1d2814', '#2d3a1b', '#3d4c22', '#4e5e2a', '#a8442c']], ['round', ['#1a2514', '#28361c', '#374824', '#475b2d']]],
      hillS: 4.5, hillAmp: 1.7, mtnRise: 1.2, mtnR: 6, valley: 0.6, dolines: 1.5, relief: 1.0, mContrast: 1.6, fineAmp: 0.35, fineS: 1.8,
      shadeAmp: 0.36, warm: 0.4, cool: 0.32, ao: 0.1,
      moist: 0.36, dryT: 0.36, lushT: 0.66, hollowK: 0.9,
      geoBase: 0.02, geoSlope: 0.3, geoCrest: 1.2, geoHollow: 0, geoDry: 0.25, geoNoise: 1.0, geoS: 1.7, geoRag: 0.6, geoCob: 0.14, kMode: 'hollow', stoneA: true, stoneB: false, geoPit: 1.15,
      tuft: 0.7, flower: 0.45, shrub: 0.8, shrubMode: 'rockEdge',
    },
    carpathian: {
      name: 'Carpathian foothills', short: 'Carpathian', ref: 'Hay meadows and wildflowers climbing toward the peaks, damp hollows, dark rock on the steeps',
      mid: ['#203a1c', '#284922', '#305828', '#38672e', '#417634', '#4b843b', '#569243', '#629f4b', '#71ab56'],
      dry: ['#2f421c', '#3a5021', '#465f26', '#526e2c', '#5f7c32', '#6c8a39', '#7a9741', '#88a34a', '#97ae55'],
      lush: ['#17311d', '#1d3d23', '#234a29', '#29582f', '#306636', '#38743d', '#418245', '#4b8f4e', '#579b58'],
      geoA: ['#33352f', '#41433b', '#505247', '#606255', '#717363', '#838574'],
      geoB: ['#3b2e1e', '#4a3a25', '#5a462d', '#6a5336', '#7a6040', '#8a6e4b'],
      flowers: [['#8b5cc6', '#f4f1e4'], ['#f4f1e4', '#e8c24a'], ['#f0d04a', '#c8902a'], ['#e7a2c0', '#f4f1e4'], ['#6a8ad8', '#f4f1e4']],
      shrubs: [['cone', ['#0f1d14', '#18291c', '#213624', '#2c442d']], ['round', ['#17261a', '#223523', '#2d452c', '#3a5636']]],
      hillS: 5.5, hillAmp: 2.4, mtnRise: 4.5, mtnR: 10, valley: 1.2, relief: 1.2, mContrast: 1.6, fineAmp: 0.3, fineS: 2.0,
      shadeAmp: 0.4, warm: 0.35, cool: 0.35, ao: 0.12,
      moist: 0.6, dryT: 0.3, lushT: 0.7, hollowK: 0.8,
      geoBase: -0.85, geoSlope: 1.3, geoCrest: 0.3, geoHollow: 0, geoDry: 0, geoNoise: 0.4, geoS: 2.0, geoRag: 0.45, geoCob: 0.1, kMode: 'slope', stoneA: true, stoneB: false,
      tuft: 1.0, flower: 1.7, shrub: 0.22, shrubMode: 'forestEdge',
    },
    steppe: {
      name: 'Pannonian steppe', short: 'Steppe', ref: 'The Hortobágy puszta — flat pale grassland, white alkali flats in the shallow hollows',
      mid: ['#38401f', '#444c24', '#505a29', '#5d672f', '#6a7435', '#78813c', '#868d44', '#94994e', '#a2a559'],
      dry: ['#4a4628', '#58542e', '#676235', '#76703c', '#857e44', '#948c4d', '#a39a57', '#b1a862', '#beb56f'],
      lush: ['#22381c', '#2a4622', '#335428', '#3c632e', '#467134', '#517f3b', '#5c8c43', '#69994c', '#77a556'],
      geoA: ['#6d6a5e', '#838072', '#9a9686', '#b0ac9b', '#c5c1b0', '#d7d3c3'],
      geoB: ['#5d5038', '#706143', '#83724f', '#95835b', '#a69467', '#b5a374'],
      flowers: [['#f2efe2', '#e8c24a'], ['#e8d050', '#b8902a'], ['#8e6ab8', '#f2efe2']],
      shrubs: [['low', ['#2a3120', '#3a4329', '#4b5533', '#5e683e']]],
      hillS: 9, hillAmp: 0.6, mtnRise: 0.8, mtnR: 5, valley: 0.4, relief: 0.9, mContrast: 1.6, fineAmp: 0.12, fineS: 3.0,
      shadeAmp: 0.22, warm: 0.35, cool: 0.2, ao: 0.15,
      moist: 0.3, dryT: 0.4, lushT: 0.72, hollowK: 0.3,
      geoBase: -0.35, geoSlope: 0, geoCrest: 0, geoHollow: 2.4, geoDry: 0.2, geoNoise: 0.7, geoS: 2.6, geoRag: 0.55, geoCob: 0, kMode: 'noise', geoWetClear: 2.5, stoneA: false, stoneB: false,
      tuft: 1.4, flower: 0.35, shrub: 0.08, shrubMode: 'dry',
    },
    med: {
      name: 'Mediterranean garrigue', short: 'Garrigue', ref: 'Grey-green aromatic scrub on ochre soil, limestone on the crests, lavender in flower',
      mid: ['#2c331d', '#363d22', '#414827', '#4c542d', '#576033', '#636c3a', '#6f7842', '#7c844b', '#899055'],
      dry: ['#3b3d2a', '#474a31', '#545739', '#616441', '#6e714a', '#7b7e54', '#888a5e', '#959769', '#a2a374'],
      lush: ['#20371c', '#284421', '#305227', '#38602c', '#416e32', '#4b7c39', '#568a41', '#62974a', '#6fa354'],
      geoA: ['#5e3f22', '#734d29', '#885d31', '#9c6c3b', '#ad7c47', '#bc8c55'],
      geoB: ['#5b5a52', '#727067', '#89867b', '#9f9c8f', '#b3b0a2', '#c6c3b4'],
      flowers: [['#8a6cc4', '#c7b4e6'], ['#8a6cc4', '#c7b4e6'], ['#f2efe2', '#e8c24a'], ['#f0cf4a', '#c8902a']],
      shrubs: [['round', ['#1a2414', '#29351c', '#384724', '#4a5a2f']], ['dotted', ['#1f2a16', '#2f3d1e', '#3f5027', '#516331', '#8a6cc4']], ['cone', ['#141e10', '#203018', '#2c3f1f', '#3a5027']]],
      hillS: 5, hillAmp: 2.1, mtnRise: 2, mtnR: 7, valley: 0.9, relief: 1.15, mContrast: 1.8, fineAmp: 0.3, fineS: 2.0,
      shadeAmp: 0.38, warm: 0.55, cool: 0.25, ao: 0.12,
      moist: 0.28, dryT: 0.42, lushT: 0.76, hollowK: 0.5,
      geoBase: -0.12, geoSlope: 0.5, geoCrest: 0.8, geoHollow: 0, geoDry: 0.6, geoNoise: 0.7, geoS: 2.0, geoRag: 0.55, geoCob: 0.04, kMode: 'crest', stoneA: false, stoneB: true,
      tuft: 0.6, flower: 0.85, shrub: 1.25, shrubMode: 'dry',
    },
  };
  // the world the generator rolled says which landscape it is (the production proposal)
  const AUTO = { 'highlands:karst': 'karst', 'highlands:foothills': 'carpathian', 'highlands:highpasses': 'carpathian', 'highlands:classic': 'carpathian',
    'valley:steppe': 'steppe', 'valley:classic': 'tuscan', 'valley:oldcountry': 'tuscan', 'valley:greatforest': 'carpathian',
    'lakeland:classic': 'carpathian', 'lakeland:delta': 'steppe', 'lakeland:greatlake': 'tuscan', 'lakeland:pondlands': 'carpathian',
    'islands:classic': 'med', 'islands:fjord': 'karst', 'islands:archipelago': 'med', 'islands:greatisle': 'med' };

  // ---- a small seeded noise for the fields (main thread) ----------------------------
  let SEED = 0;
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041 + SEED) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const vn = (x, y, s) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s); return a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy; };
  const fbm = (x, y, s) => vn(x, y, s) * 0.57 + vn(x * 2.03, y * 2.03, s + 7) * 0.29 + vn(x * 4.1, y * 4.1, s + 13) * 0.14;
  const cl = v => v < 0 ? 0 : v > 1 ? 1 : v, sm = v => { v = cl(v); return v * v * (3 - 2 * v); };
  const blur = (a, W, H, passes) => { let cur = a;
    for (let p = 0; p < passes; p++) { const nx = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let acc = 0, ws = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.max(0, Math.min(W - 1, x + dx)), yy = Math.max(0, Math.min(H - 1, y + dy)), w = (dx ? 1 : 2) * (dy ? 1 : 2); acc += cur[yy * W + xx] * w; ws += w; }
        nx[y * W + x] = acc / ws; }
      cur = nx; }
    return cur; };

  const V5 = window.TerrainV5 = {
    BIOMES, AUTO,
    choice() { return ls.get(KEY) || 'auto'; },
    // the biome a played world wears now: null = V4
    current() {
      const c = this.choice();
      if (c === 'v4') return null;
      if (c !== 'auto' && BIOMES[c]) return c;
      const m = (typeof S !== 'undefined' && S && S.map) || {};
      return AUTO[(m.landform || 'valley') + ':' + (m.variant || 'classic')] || 'tuscan';
    },
    fields(F, terr, W, H, P) {
      SEED = TX.seed | 0;
      const N = W * H, E = new Float32Array(N), PIT = new Float32Array(N);
      // dolines: round sinks pressed into the land, a few per hundred tiles (none in water)
      const pits = [];
      if (P.dolines) { const n = Math.round(N / 100 * P.dolines);
        for (let k = 0; k < n; k++) pits.push([hash(k, 1, 901) * W, hash(k, 2, 901) * H, 1.1 + hash(k, 3, 901) * 1.6, 1.0 + hash(k, 4, 901) * 0.9]); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let e = P.hillAmp * (fbm(x / P.hillS, y / P.hillS, 701) - 0.5) * 2;
        e += P.mtnRise * sm(1 - F.dMtn[i] / P.mtnR);
        e -= P.valley * Math.exp(-F.dWet[i] / 2.6);
        for (const [px, py, r, d] of pits) { const dd = ((x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2) / (r * r); if (dd < 4) { e -= d * Math.exp(-dd); PIT[i] = Math.max(PIT[i], Math.exp(-dd * 1.6)); } }
        E[i] = e;
      }
      const Eb = blur(E, W, H, 2), Ebig = blur(Eb, W, H, 6);
      // the town's own ground is never ploughed
      const this_near = new Uint8Array(N);
      for (const b of (TX.blds || [])) for (let y = Math.max(0, b.y - 4); y < Math.min(H, b.y + b.s + 4); y++) for (let x = Math.max(0, b.x - 4); x < Math.min(W, b.x + b.s + 4); x++) this_near[y * W + x] = 1;
      const e5 = Eb, m5 = new Float32Array(N), g5 = new Float32Array(N), k5 = new Float32Array(N), v5 = new Float32Array(N), s5 = new Float32Array(N), p5 = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
        const gx = (Eb[y * W + xp] - Eb[y * W + xm]) / (xp - xm || 1), gy = (Eb[yp * W + x] - Eb[ym * W + x]) / (yp - ym || 1), slope = Math.hypot(gx, gy);
        const hollow = Ebig[i] - Eb[i], crest = -hollow, flat = 1 - cl(slope * 2.5);
        const wet = Math.exp(-F.dWet[i] / (P.wetR || 3)), wood = Math.exp(-F.dForest[i] / 2);
        let m = P.moist + wet * 0.5 + wood * 0.15 + hollow * (P.hollowK || 0.6) + (fbm(x / 4, y / 4, 711) - 0.5) * 0.3;
        let fieldEdge = 0, plough = 0;
        if (P.mosaic) {
          /* FIELDS: the nearest of a jittered lattice, each field one crop — ripe wheat,
             green, or (a few) ploughed earth — so the land reads as a patchwork laid over
             the hills; the boundaries between two fields are where the cypress may stand */
          const S_ = P.mosaicS, cx = Math.floor(x / S_), cy = Math.floor(y / S_); let best = 1e9, sec = 1e9, val = 0.5, id = 0, id2 = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const qx = (cx + ox + 0.15 + 0.7 * hash(cx + ox, cy + oy, 721)) * S_, qy = (cy + oy + 0.15 + 0.7 * hash(cx + ox, cy + oy, 722)) * S_, d = (x + 0.5 - qx) ** 2 + (y + 0.5 - qy) ** 2;
            if (d < best) { sec = best; id2 = id; best = d; val = hash(cx + ox, cy + oy, 723); id = (cy + oy) * 4096 + cx + ox; } else if (d < sec) { sec = d; id2 = (cy + oy) * 4096 + cx + ox; } }
          if (val < (P.plough || 0) && !(this_near && this_near[i])) plough = 1 + ((hash(id, 0, 729) * 4) | 0);   // which way its furrows run
          m += P.mosaic * (val - 0.5) * (1 - wet);
          const gap = Math.sqrt(sec) - Math.sqrt(best), lo = Math.min(id, id2), hi = Math.max(id, id2);
          if (hash(lo, hi, 727) < 0.4) fieldEdge = Math.exp(-((gap / 0.45) ** 2));
        }
        m = cl(m);
        if (P.mContrast) m = sm((m - 0.5) * P.mContrast + 0.5);
        let g = P.geoBase + P.geoSlope * slope + P.geoCrest * crest + (P.geoHollow || 0) * Math.max(0, hollow) * flat + P.geoDry * (0.5 - m) + P.geoNoise * (fbm(x / P.geoS + 30, y / P.geoS + 9, 731) - 0.5);
        if (plough) g = Math.max(g, 0.95);
        // a doline's floor is red earth (where the Karst is farmed): bare ground, terra rossa
        const pit = P.geoPit ? PIT[i] * P.geoPit : 0;
        if (pit > 0.05) g = Math.max(g, Math.min(0.9, pit));
        g *= cl((F.dWet[i] - (P.geoWetClear || 1.2)) / 1.5);          // the bank stays green
        g = cl(g);
        const k = plough || pit > 0.4 ? 1 : P.kMode === 'hollow' ? sm(hollow * 2.2 + 0.35) : P.kMode === 'crest' ? sm(crest * 2.2 + 0.45) : P.kMode === 'slope' ? sm(0.7 - slope * 1.5) : fbm(x / 3 + 5, y / 3 + 50, 741);
        m5[i] = m; g5[i] = g; k5[i] = k; p5[i] = plough;
        v5[i] = cl(m * 1.1 - g * 0.9 + 0.15);
        const edge = Math.exp(-(((g - 0.48) / 0.18) ** 2));
        s5[i] = cl(P.shrubMode === 'rockEdge' ? edge * 1.2 + (1 - m) * 0.2 : P.shrubMode === 'dry' ? (1 - m) * 0.9 + edge * 0.5 : P.shrubMode === 'forestEdge' ? Math.exp(-F.dForest[i] / 1.6) * 1.2 + edge * 0.3 : P.shrubMode === 'fieldEdge' ? fieldEdge : P.shrubMode === 'moistEdge' ? Math.exp(-(((m - 0.55) / 0.12) ** 2)) * 0.8 : 0.3) * cl((F.dWet[i] - 1) / 1.5);
      }
      Object.assign(F, { e5, m5, g5, k5, v5, s5, p5 });
    },
  };

  // ---- the hooks: the fields join buildFields, the region joins the world -----------
  const bf = TX.buildFields, wo = TX.world;
  TX.buildFields = function () {
    const r = bf.apply(this, arguments), b = V5.current();
    this._v5 = b;
    if (b) V5.fields(this.F, this.terr(), CFG.W, CFG.H, BIOMES[b]);
    return r;
  };
  TX.world = function () { const w = wo.apply(this, arguments); w.R5 = this._v5 ? BIOMES[this._v5] : null; return w; };

  // ---- the switch on the test page ------------------------------------------------------
  V5.set = function (choice) {
    ls.set(KEY, choice === 'auto' ? null : choice);
    V5.paint();
    if (TX.on) { const act = TX.activate(); if (act && act.then) act.then(() => { try { R.fogDirty = true; } catch (e) {} }); }
    const b = V5.current();
    try { G.log('🌄 Land: ' + (b ? BIOMES[b].name : 'V4 (today\'s live ground)') + (V5.choice() === 'auto' ? ' — chosen by the world' : ''), 'note'); } catch (e) {}
  };
  V5.paint = function () {
    const el = document.getElementById('v5biome'); if (!el) return;
    const c = V5.choice(), b = V5.current();
    el.querySelector('.v5cur').textContent = (b ? BIOMES[b].short : 'V4') + (c === 'auto' ? ' (auto)' : '');
    for (const btn of el.querySelectorAll('[data-b]')) btn.classList.toggle('on', btn.dataset.b === c);
  };
  V5.mount = function () {
    if (document.getElementById('v5biome')) return;
    const st = document.createElement('style');
    st.textContent = `#v5biome{position:fixed;z-index:12;right:max(8px,env(safe-area-inset-right,0px));bottom:200px;font:600 12px/1.2 system-ui,sans-serif;color:#f3ead2;display:none;display:none;flex-direction:column-reverse;align-items:flex-end}
body.ingame #v5biome{display:flex}
#v5biome .v5chip{background:rgba(24,18,12,.88);border:1px solid #c8a24a;border-radius:8px;padding:7px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:nowrap}
#v5biome .v5list{display:none;margin-bottom:6px;max-height:60vh;overflow:auto;background:rgba(24,18,12,.94);border:1px solid #c8a24a;border-radius:8px;padding:6px;width:min(250px,calc(100vw - 32px))}
#v5biome.open .v5list{display:block}
#v5biome .v5list button{display:block;width:100%;text-align:left;background:none;border:0;color:#f3ead2;font:inherit;padding:8px 8px;border-radius:6px;cursor:pointer;min-height:36px}
#v5biome .v5list button.on{background:#c8a24a;color:#1a120a}
#v5biome .v5list small{display:block;font-weight:400;opacity:.75;margin-top:2px;font-size:11px}`;
    document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'v5biome';
    const opts = [['auto', 'Auto', 'The world chooses: Karst highlands, Steppe valley, island garrigue…'], ['v4', 'V4', "Today's live ground, for comparison"]].concat(Object.keys(BIOMES).map(k => [k, BIOMES[k].name, BIOMES[k].ref]));
    el.innerHTML = '<div class="v5chip">🌄 Land: <span class="v5cur"></span> ▾</div><div class="v5list">' + opts.map(([k, n, d]) => `<button data-b="${k}">${n}<small>${d}</small></button>`).join('') + '</div>';
    el.querySelector('.v5chip').addEventListener('click', e => { e.stopPropagation(); el.classList.toggle('open'); });
    for (const btn of el.querySelectorAll('[data-b]')) btn.addEventListener('click', e => { e.stopPropagation(); el.classList.remove('open'); V5.set(btn.dataset.b); });
    for (const t of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(t, e => e.stopPropagation());
    document.body.appendChild(el);
    // ride just above the build bar, whatever its height (it folds and unfolds)
    const seat = () => { const bb = document.getElementById('bottombar'), r = bb && bb.getBoundingClientRect(); el.style.bottom = (r && r.height ? Math.max(12, innerHeight - r.top + 10) : 200) + 'px'; };
    seat(); setInterval(seat, 500); addEventListener('resize', seat);
    V5.paint();
  };
  try { const q = new URLSearchParams(location.search).get('biome'); if (q && (q === 'auto' || q === 'v4' || BIOMES[q])) ls.set(KEY, q === 'auto' ? null : q); } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => V5.mount()); else V5.mount();
  // a new or loaded world repaints the chip (auto follows the world's name)
  const ng = G.newGame, lj = G.loadJSON;
  G.newGame = function () { const r = ng.apply(this, arguments); V5.paint(); return r; };
  G.loadJSON = function () { const r = lj.apply(this, arguments); V5.paint(); return r; };
})();
