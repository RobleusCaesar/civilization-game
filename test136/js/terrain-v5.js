/* TERRAIN V5 — THE LAND'S REGIONAL CHARACTER (tests/terrain-v4.mjs §V5; CLAUDE.md
   "TERRAIN V5"). V4's painter, given a REGION: the world the generator rolled picks
   a landscape (AUTO — highland karst, steppe valley, island garrigue, Tuscan hills,
   Carpathian foothills), and a few coherent WORLD FIELDS say how it looks.

   Everything here is cosmetic: no tile, rule, path or save is read differently,
   and every field is a pure function of the terrain, the buildings and the seed
   (so a reload paints the same land).

     ELEVATION  e5  rolling swells at the region's own scale, rising toward the
                    mountains and falling toward the water, karst dolines pressed
                    in — read in the core as a C2 spline and LIT, continuously, so a
                    slope is a gradient of light and never a contour band
     MOISTURE   m5  broad zones (never a tile-sized checker): near water, in
                    hollows, under the woods, and always lush round the food
     GEOLOGY    g5  how much ground shows through (slope, crest, hollow, dryness, a
                    broad patch noise), and k5 WHICH ground: limestone or red earth,
                    clay or ochre, alkali crust or loess
     VEGETATION v5  where tufts and flowers gather; s5 where the few squat plants of
                    dry country may grow
   The core (tools/terrain-core.src.js) reads these as world.F.e5 … s5 and the
   region as world.R5; with R5 null it paints V4 exactly.

   THE WAY BACK: CFG.TERRAIN.V5 false (the kill switch), ?biome=v4 on a device
   (remembered in neo-biome until ?biome=auto), every V4 way back (V5 rides on V4),
   and a fault: a field build that throws stands V5 down for the session and the
   world repaints as V4. ?biome=<name> forces a landscape for testing; the switch
   chip shows only for a device that asked (a test page, or a ?biome link). */
(function () {
  if (!window.TerrainX) return;
  const TX = window.TerrainX, KEY = 'neo-biome';
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
      // broom: a low green cushion in yellow flower, on the driest clay only
      shrubs: [['cushion', ['#1e2a14', '#2d3d1c', '#3d5025', '#506530', '#e2c03c']]],
      grav: ['#4a4236', '#5e5444', '#756a56', '#8c806a', '#a3977f', '#b8ad95'],
      soil: ['#4d4536', '#5f5642', '#72684f', '#857a5d', '#988c6c', '#aa9e7c'],
      hillS: 6.5, hillAmp: 3.4, mtnRise: 1.5, mtnR: 7, valley: 1.0, relief: 1.35, mContrast: 1.7, fineAmp: 0.3, fineS: 2.2,
      shadeAmp: 0.4, warm: 0.45, cool: 0.3, ao: 0.12,
      moist: 0.34, dryT: 0.46, lushT: 0.68, mosaic: 0.75, mosaicS: 5.5, plough: 0.12, wetR: 1.6, stoneA: false, stoneB: false,
      geoBase: -0.2, geoSlope: 0.9, geoCrest: 0.5, geoHollow: 0, geoDry: 0.45, geoNoise: 0.55, geoS: 4.2, geoRag: 0.34, geoCob: 0, kMode: 'noise',
      tuft: 0.8, flower: 1.1, shrub: 0.35, shrubMode: 'dry', gravAmt: 0.45, soilGap: 0.12, cracks: true,
    },
    karst: {
      name: 'Balkan limestone karst', short: 'Karst', ref: 'The Slovenian Karst — grey limestone breaking through dry grass, dolines of red soil, juniper scrub',
      mid: ['#29331a', '#323e1f', '#3c4a24', '#46562a', '#51622f', '#5c6e35', '#687a3c', '#758644', '#83924e'],
      dry: ['#363a22', '#424728', '#4f542e', '#5c6135', '#696e3c', '#777b44', '#85884d', '#939556', '#a1a261'],
      lush: ['#1e351b', '#264221', '#2e5027', '#365e2c', '#3f6c32', '#497a39', '#548841', '#60954a', '#6da254'],
      geoA: ['#56554e', '#6c6a61', '#838075', '#99968a', '#aeab9e', '#c3c0b2'],
      geoB: ['#4b3226', '#5a3c2d', '#694735', '#78523e', '#865e48', '#936a53'],
      flowers: [['#f2efe2', '#e8c24a'], ['#9b6cc0', '#f0d060'], ['#f0cf4a', '#c8902a']],
      // creeping juniper: a flat blue-green mat in the limestone's cracks; winter savory, a grey cushion
      shrubs: [['mat', ['#1a2a22', '#27392d', '#344a38', '#435c45', '#7b93b8']], ['cushion', ['#2a3122', '#3b432f', '#4d563c', '#626b4c']]],
      grav: ['#4c4b45', '#62605a', '#7a7870', '#929086', '#aaa89c', '#c0beb2'],
      soil: ['#544638', '#625343', '#70604e', '#7e6d5a', '#8c7a66', '#9a8772'],
      hillS: 4.5, hillAmp: 1.7, mtnRise: 1.2, mtnR: 6, valley: 0.6, dolines: 1.5, relief: 1.0, mContrast: 1.4, fineAmp: 0.35, fineS: 1.8,
      shadeAmp: 0.36, warm: 0.4, cool: 0.32, ao: 0.1,
      moist: 0.36, dryT: 0.42, lushT: 0.68, hollowK: 0.9,
      geoBase: 0.14, geoSlope: 0.3, geoCrest: 1.2, yard: false, geoHollow: 0, geoDry: 0.25, geoNoise: 1.0, geoS: 3.0, geoRag: 0.45, geoCob: 0.12, kMode: 'hollow', stoneA: true, stoneB: false, geoPit: 1.15,
      tuft: 0.7, flower: 0.45, shrub: 1.6, shrubMode: 'rockEdge', gravAmt: 1.0, soilGap: 0.75,
    },
    carpathian: {
      name: 'Carpathian foothills', short: 'Carpathian', ref: 'Hay meadows and wildflowers climbing toward the peaks, damp hollows, dark rock on the steeps',
      mid: ['#203a1c', '#284922', '#305828', '#38672e', '#417634', '#4b843b', '#569243', '#629f4b', '#71ab56'],
      dry: ['#2f421c', '#3a5021', '#465f26', '#526e2c', '#5f7c32', '#6c8a39', '#7a9741', '#88a34a', '#97ae55'],
      lush: ['#17311d', '#1d3d23', '#234a29', '#29582f', '#306636', '#38743d', '#418245', '#4b8f4e', '#579b58'],
      geoA: ['#33352f', '#41433b', '#505247', '#606255', '#717363', '#838574'],
      geoB: ['#3b2e1e', '#4a3a25', '#5a462d', '#6a5336', '#7a6040', '#8a6e4b'],
      flowers: [['#8b5cc6', '#f4f1e4'], ['#f4f1e4', '#e8c24a'], ['#f0d04a', '#c8902a'], ['#e7a2c0', '#f4f1e4'], ['#6a8ad8', '#f4f1e4']],
      shrubs: [],
      grav: ['#36383a', '#46494a', '#585b5b', '#6b6e6c', '#7f827e', '#949691'],
      soil: ['#3f3a2c', '#4b4535', '#57503e', '#635b47', '#6f6650', '#7b7159'],
      hillS: 5.5, hillAmp: 2.4, mtnRise: 4.5, mtnR: 10, valley: 1.2, relief: 1.2, mContrast: 1.3, fineAmp: 0.3, fineS: 2.0,
      shadeAmp: 0.4, warm: 0.35, cool: 0.35, ao: 0.12,
      moist: 0.6, dryT: 0.3, lushT: 0.7, hollowK: 0.8,
      geoBase: -0.85, geoSlope: 1.3, geoCrest: 0.3, geoHollow: 0, geoDry: 0, geoNoise: 0.4, geoS: 3.4, geoRag: 0.34, geoCob: 0.1, kMode: 'slope', stoneA: true, stoneB: false,
      tuft: 1.0, flower: 1.7, shrub: 0, shrubMode: 'none', gravAmt: 0.4, soilGap: 0.3,
    },
    steppe: {
      name: 'Pannonian steppe', short: 'Steppe', ref: 'The Hortobágy puszta — flat pale grassland, white alkali flats in the shallow hollows',
      mid: ['#38401f', '#444c24', '#505a29', '#5d672f', '#6a7435', '#78813c', '#868d44', '#94994e', '#a2a559'],
      dry: ['#4a4628', '#58542e', '#676235', '#76703c', '#857e44', '#948c4d', '#a39a57', '#b1a862', '#beb56f'],
      lush: ['#22381c', '#2a4622', '#335428', '#3c632e', '#467134', '#517f3b', '#5c8c43', '#69994c', '#77a556'],
      geoA: ['#66625a', '#76726a', '#86827a', '#96928a', '#a4a098', '#b2aea5'],
      geoB: ['#5d5038', '#706143', '#83724f', '#95835b', '#a69467', '#b5a374'],
      flowers: [['#f2efe2', '#e8c24a'], ['#e8d050', '#b8902a'], ['#8e6ab8', '#f2efe2']],
      // feather grass: a fountain of pale blades with silver plumes, alone on the dry loess
      shrubs: [['tussock', ['#3c3e26', '#5a5a34', '#7c7a46', '#a39f63', '#e4dfc6']]],
      grav: ['#5a564a', '#6e6a5c', '#848070', '#9a9685', '#afab99', '#c3bfad'],
      soil: ['#5c5440', '#6d644d', '#7e745a', '#8f8468', '#a09476', '#b0a484'],
      hillS: 9, hillAmp: 0.6, mtnRise: 0.8, mtnR: 5, valley: 0.4, relief: 0.9, mContrast: 1.4, fineAmp: 0.12, fineS: 3.0,
      shadeAmp: 0.22, warm: 0.35, cool: 0.2, ao: 0.15,
      moist: 0.3, dryT: 0.5, lushT: 0.74, hollowK: 0.3, mAmp: 0.36,
      geoBase: 0.14, geoSlope: 0, geoCrest: 0, geoHollow: 2.4, geoDry: 1.0, geoNoise: 1.25, geoS: 4.6, geoRag: 0.4, geoCob: 0, kMode: 'noise', geoWetClear: 2.5, stoneA: false, stoneB: false,
      tuft: 1.4, flower: 0.35, shrub: 0.8, shrubMode: 'dry', gravAmt: 0.6, soilGap: 0.5, cracks: true,
    },
    med: {
      name: 'Mediterranean garrigue', short: 'Garrigue', ref: 'Grey-green aromatic scrub on ochre soil, limestone on the crests, lavender in flower',
      mid: ['#2c331d', '#363d22', '#414827', '#4c542d', '#576033', '#636c3a', '#6f7842', '#7c844b', '#899055'],
      dry: ['#3b3d2a', '#474a31', '#545739', '#616441', '#6e714a', '#7b7e54', '#888a5e', '#959769', '#a2a374'],
      lush: ['#20371c', '#284421', '#305227', '#38602c', '#416e32', '#4b7c39', '#568a41', '#62974a', '#6fa354'],
      geoA: ['#5c4b36', '#6d5a41', '#7e694c', '#8f7858', '#9f8764', '#ae9671'],
      geoB: ['#5b5a52', '#727067', '#89867b', '#9f9c8f', '#b3b0a2', '#c6c3b4'],
      flowers: [['#8a6cc4', '#c7b4e6'], ['#8a6cc4', '#c7b4e6'], ['#f2efe2', '#e8c24a'], ['#f0cf4a', '#c8902a']],
      // the garrigue's own: rosemary and thyme in low grey-green cushions, lavender in flower
      shrubs: [['cushion', ['#252c1f', '#36402c', '#4a563a', '#62704c', '#9c7fd2']], ['cushion', ['#2a3024', '#3c4433', '#515a45', '#6a735a']]],
      grav: ['#56514a', '#6c665d', '#847d72', '#9b9488', '#b1aa9d', '#c5bfb1'],
      soil: ['#5d5340', '#6d624c', '#7d7158', '#8d8064', '#9c8f71', '#ab9e7f'],
      hillS: 5, hillAmp: 2.1, mtnRise: 2, mtnR: 7, valley: 0.9, relief: 1.15, mContrast: 1.55, fineAmp: 0.3, fineS: 2.0,
      shadeAmp: 0.38, warm: 0.55, cool: 0.25, ao: 0.12,
      moist: 0.28, dryT: 0.5, lushT: 0.76, hollowK: 0.5, mAmp: 0.4,
      geoBase: 0.06, geoSlope: 0.5, geoCrest: 0.8, geoHollow: 0, geoDry: 0.9, geoNoise: 0.7, geoS: 3.8, geoRag: 0.4, geoCob: 0.04, kMode: 'crest', stoneA: false, stoneB: true,
      tuft: 0.6, flower: 0.85, shrub: 1.3, shrubMode: 'dry', gravAmt: 1.0, soilGap: 0.72,
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
    failed: false,
    on() { return !(typeof CFG !== 'undefined' && CFG.TERRAIN && CFG.TERRAIN.V5 === false) && !this.failed; },
    choice() { return ls.get(KEY) || 'auto'; },
    // the biome a played world wears now: null = V4
    current() {
      if (!this.on()) return null;
      const c = this.choice();
      if (c === 'v4') return null;
      if (c !== 'auto' && BIOMES[c]) return c;
      const m = (typeof S !== 'undefined' && S && S.map) || {};
      return AUTO[(m.landform || 'valley') + ':' + (m.variant || 'classic')] || 'tuscan';
    },
    /* every edit rebuilds the fields (TerrainX.noteEdit diffs them to find what to repaint),
       so what an edit cannot change is made ONCE per world and region: the noise terms, the
       field mosaic, the dolines, and the elevation (which moves only when the water or the
       mountains do). An edit then pays a few array passes, not the noise. */
    _c: null,
    _static(W, H, P, F) {
      const key = SEED + '|' + W + 'x' + H + '|' + P.name, N = W * H;
      let c = this._c;
      if (!c || c.key !== key) {
        c = this._c = { key, nM: new Float32Array(N), nG: new Float32Array(N), nK: new Float32Array(N), nE: new Float32Array(N), mv: new Float32Array(N), mid: new Int32Array(N), pits: [], eSig: null };
        const ms = P.mScale || 9;
        if (P.dolines) { const n = Math.round(N / 100 * P.dolines);
          for (let k = 0; k < n; k++) c.pits.push([hash(k, 1, 901) * W, hash(k, 2, 901) * H, 1.1 + hash(k, 3, 901) * 1.6, 1.0 + hash(k, 4, 901) * 0.9]); }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          c.nE[i] = P.hillAmp * (fbm(x / P.hillS, y / P.hillS, 701) - 0.5) * 2;
          c.nM[i] = (fbm(x / ms, y / ms, 711) - 0.5) * (P.mAmp || 0.5) + (fbm(x / 4.5, y / 4.5, 713) - 0.5) * 0.1;
          c.nG[i] = P.geoNoise * (fbm(x / P.geoS + 30, y / P.geoS + 9, 731) - 0.5);
          c.nK[i] = fbm(x / 3 + 5, y / 3 + 50, 741);
          if (P.mosaic) {
            /* FIELDS: the nearest of a jittered lattice, each field one crop — ripe wheat,
               green, or (a few) ploughed earth — so the land reads as a patchwork laid over
               the hills, a few large fields rather than a tile-sized checker */
            const S_ = P.mosaicS, cx = Math.floor(x / S_), cy = Math.floor(y / S_); let best = 1e9, val = 0.5, id = 0;
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const qx = (cx + ox + 0.15 + 0.7 * hash(cx + ox, cy + oy, 721)) * S_, qy = (cy + oy + 0.15 + 0.7 * hash(cx + ox, cy + oy, 722)) * S_, d = (x + 0.5 - qx) ** 2 + (y + 0.5 - qy) ** 2;
              if (d < best) { best = d; val = hash(cx + ox, cy + oy, 723); id = (cy + oy) * 4096 + cx + ox; } }
            c.mv[i] = val; c.mid[i] = id;
          }
        }
      }
      // the elevation: the hills, risen toward the mountains, fallen toward the water, the dolines pressed in
      let sig = 0; for (let i = 0; i < N; i++) sig = (sig * 31 + Math.round(F.dMtn[i] * 8) * 7 + Math.round(F.dWet[i] * 8)) | 0;
      if (c.eSig !== sig) {
        const E = new Float32Array(N), PIT = new Float32Array(N);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x;
          let e = c.nE[i] + P.mtnRise * sm(1 - F.dMtn[i] / P.mtnR) - P.valley * Math.exp(-F.dWet[i] / 2.6);
          for (const [px, py, r, d] of c.pits) { const dd = ((x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2) / (r * r); if (dd < 4) { e -= d * Math.exp(-dd); PIT[i] = Math.max(PIT[i], Math.exp(-dd * 1.6)); } }
          E[i] = e;
        }
        c.Eb = blur(E, W, H, 2); c.Ebig = blur(c.Eb, W, H, 6); c.PIT = PIT; c.eSig = sig;
      }
      return c;
    },
    fields(F, terr, W, H, P) {
      SEED = TX.seed | 0;
      const N = W * H, c = this._static(W, H, P, F), Eb = c.Eb, Ebig = c.Ebig, PIT = c.PIT;
      // the town's own ground is never ploughed
      const this_near = new Uint8Array(N);
      for (const b of (TX.blds || [])) for (let y = Math.max(0, b.y - 4); y < Math.min(H, b.y + b.s + 4); y++) for (let x = Math.max(0, b.x - 4); x < Math.min(W, b.x + b.s + 4); x++) this_near[y * W + x] = 1;
      const e5 = Eb, m5 = new Float32Array(N), g5 = new Float32Array(N), k5 = new Float32Array(N), v5 = new Float32Array(N), s5 = new Float32Array(N), p5 = new Uint8Array(N);
      /* FOOD SITS DEEP IN THE GREEN: berries and orchards (FERTILE) are the land's richest
         ground, so the grass round them is lush and no bare earth shows there; the woods
         keep at least an ordinary sward. A cosmetic read of where the food already is. */
      const dFert = TX.edt(Uint8Array.from(terr, t => t === T.FERTILE ? 1 : 0), W, H).map(Math.sqrt);
      const tcM = new Uint8Array(N); for (const b of (TX.blds || [])) if (b.tc) for (let y = b.y; y < b.y + b.s; y++) for (let x = b.x; x < b.x + b.s; x++) if (x >= 0 && y >= 0 && x < W && y < H) tcM[y * W + x] = 1;
      const dTC = TX.edt(tcM, W, H).map(Math.sqrt);
      // pass 1: the raw moisture, broad (zones of several tiles, never a tile-sized checker)
      const M0 = new Float32Array(N), SL = new Float32Array(N), HO = new Float32Array(N), FE = new Float32Array(N), PL = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
        const gx = (Eb[y * W + xp] - Eb[y * W + xm]) / (xp - xm || 1), gy = (Eb[yp * W + x] - Eb[ym * W + x]) / (yp - ym || 1);
        SL[i] = Math.hypot(gx, gy); HO[i] = Ebig[i] - Eb[i];
        const wet = Math.exp(-F.dWet[i] / (P.wetR || 3)), wood = Math.exp(-F.dForest[i] / 2), food = Math.exp(-dFert[i] / 1.6);
        let m = P.moist + wet * 0.5 + wood * 0.15 + food * 0.22 + HO[i] * (P.hollowK || 0.6) + c.nM[i];
        if (P.mosaic) {
          const val = c.mv[i];
          if (val < (P.plough || 0) && !this_near[i] && dFert[i] > 3 && F.dMtn[i] > 3 && F.dWet[i] > 1.5) PL[i] = 1 + ((hash(c.mid[i], 0, 729) * 4) | 0);   // which way its furrows run
          m += P.mosaic * (val - 0.5) * (1 - wet);
        }
        M0[i] = m;
      }
      // one soft pass: a zone's edge is a few tiles of change, never a step from tile to tile
      const MB = blur(M0, W, H, 1);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, slope = SL[i], hollow = HO[i], crest = -hollow, flat = 1 - cl(slope * 2.5);
        let m = cl(MB[i]);
        if (P.mContrast) m = sm((m - 0.5) * P.mContrast + 0.5);
        // round the food the grass is lush, whatever the zone; round the woods at least ordinary
        const fz = sm((2.6 - dFert[i]) / 2.0), fw = sm((1.3 - F.dForest[i]) / 1.0) * 0.6;
        m += (Math.max(m, P.lushT + 0.12) - m) * fz;
        m += (Math.max(m, (P.dryT + P.lushT) / 2 + 0.04) - m) * fw;
        const plough = PL[i];
        let g = P.geoBase + P.geoSlope * slope + P.geoCrest * crest + (P.geoHollow || 0) * Math.max(0, hollow) * flat + P.geoDry * (0.5 - m) + c.nG[i];
        if (plough) g = Math.max(g, 0.95);
        // a doline's floor is red earth (where the Karst is farmed): bare ground, terra rossa
        const pit = P.geoPit ? PIT[i] * P.geoPit : 0;
        if (pit > 0.05) g = Math.max(g, Math.min(0.9, pit));
        g *= cl((F.dWet[i] - (P.geoWetClear || 1.2)) / 1.5);          // the bank stays green
        g *= cl((dFert[i] - 1.6) / 2.0);                               // and so does the orchard's ground
        if (P.yard !== false) g *= 0.35 + 0.65 * cl((dTC[i] - 1.5) / 2.5);   // and the hall's own yard is mostly sward (the karst's is rock)
        g = cl(g);
        const k = plough || pit > 0.4 ? 1 : P.kMode === 'hollow' ? sm(hollow * 2.2 + 0.35) : P.kMode === 'crest' ? sm(crest * 2.2 + 0.45) : P.kMode === 'slope' ? sm(0.7 - slope * 1.5) : c.nK[i];
        m5[i] = cl(m); g5[i] = g; k5[i] = k; p5[i] = plough;
        v5[i] = cl(m * 1.1 - g * 0.9 + 0.15);
        /* THE ARID PLANTS: only where the ground is truly dry, mostly at the edge of bare
           earth (the karst's on the rock's edge); the core then sets them down in a few
           tiny patches, gated again by a broad field, so most dry ground carries none */
        const dry = cl((P.dryT + 0.12 - m) / 0.25), edge = Math.exp(-(((g - 0.5) / 0.16) ** 2));
        s5[i] = cl(P.shrubMode === 'rockEdge' ? edge * (0.3 + dry * 0.7) : P.shrubMode === 'dry' ? dry * (0.35 + edge * 0.65) : 0)
          * cl((F.dWet[i] - 1) / 1.5) * cl((dFert[i] - 2) / 2) * cl((F.dForest[i] - 1) / 1.5);
      }
      Object.assign(F, { e5, m5, g5, k5, v5, s5, p5 });
    },
  };

  // ---- the hooks: the fields join buildFields, the region joins the world -----------
  const bf = TX.buildFields, wo = TX.world;
  TX.buildFields = function () {
    const r = bf.apply(this, arguments), b = V5.current();
    this._v5 = b;
    if (b) try { V5.fields(this.F, this.terr(), CFG.W, CFG.H, BIOMES[b]); }
    catch (e) {
      // a fault stands V5 down for the session: the world paints as V4, never as a broken map
      V5.failed = true; this._v5 = null;
      for (const k of ['e5', 'm5', 'g5', 'k5', 'v5', 's5', 'p5']) delete this.F[k];
      try { console.warn('Terrain V5 stood down:', e); } catch (e2) {}
    }
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
  // the switch is a tester's tool: a test page, or a device that asked for a landscape by link
  V5.tester = function () { try { return /^\/test\d*\//.test(location.pathname) || new URLSearchParams(location.search).has('biome') || ls.get(KEY) != null; } catch (e) { return false; } };
  if (V5.tester()) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => V5.mount()); else V5.mount(); }
  // a new or loaded world repaints the chip (auto follows the world's name)
  const ng = G.newGame, lj = G.loadJSON;
  G.newGame = function () { const r = ng.apply(this, arguments); V5.paint(); return r; };
  G.loadJSON = function () { const r = lj.apply(this, arguments); V5.paint(); return r; };
})();
