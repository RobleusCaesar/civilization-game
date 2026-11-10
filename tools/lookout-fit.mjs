// node tools/lookout-fit.mjs  (MEN='{"free":[..3],"wall":[..3]}' to try other sizes)
// prints, per drawn tower, the feet columns (art px) where the left place, the right place and a lone man fit.
// fit the lookouts' places for a given man size: for every drawn tower, the feasible feet columns for the left place,
// the right place and a lone man — at rest in his rest facing (Lookout.restFace) no body pixel past the outer posts,
// drawing his bow in any of eight facings his arm at most a sixth of his height over the side rail (the contract's rule)
let pw; try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = process.env.ROOT || new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MEN = JSON.parse(process.env.MEN || '{"free":[76,76,76],"wall":[68,68,68]}');   // Lookout.PLAT's man, per tower
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 520, height: 420 } });
await p.goto('file://' + root + '/index.html?terrain=classic', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Boot && Boot.done, null, { timeout: 60000 });
await p.evaluate(() => { Boot.force(); Screens._demo = false; G.newGame('perchfit', 'moderate', 'large'); Screens.show('playing'); S.paused = true; });
await p.waitForFunction(() => !Assets.allArtReady || Assets.allArtReady(), null, { timeout: 120000 }).catch(() => {});
const out = await p.evaluate((MEN) => {
  for (const t of [Bld.tcOf('P'), Bld.tcOf('A')]) if (t) { t.x = 50; t.y = t.owner === 'A' ? 54 : 50; }
  S.buildings = S.buildings.filter(bb => bb.key === 'tc'); S.units = [];
  for (let i = 0; i < S.map.terrain.length; i++) { S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1; }
  Bld._block = null;
  const put = (k, x, y, lv) => { const bb = Bld.place('P', k, x, y, { free: true, instant: true }); if (bb && bb.construction > 0) Bld.finish(bb);
    if (bb) { bb.level = lv; const L = CFG.BUILDINGS[k].levels[lv - 1]; if (L && L.hp) bb.hp = bb.maxhp = L.hp; } Bld._block = null; return bb; };
  const ts = [];
  for (let lv = 1; lv <= 3; lv++) ts.push(put('tower', 20 + lv * 6, 24, lv));
  for (let lv = 1; lv <= 3; lv++) { S.wallLevel = lv; put('wall', 19 + lv * 6, 34, lv); ts.push(put('tower', 20 + lv * 6, 34, lv)); put('wall', 21 + lv * 6, 34, lv); }
  S.wallLevel = 1;
  const read = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const q = c.getContext('2d'); q.drawImage(img, 0, 0); return q.getImageData(0, 0, img.width, img.height).data; };
  const ext = new Map();
  const opened = (img) => { let e = ext.get(img); if (e) return e; const A = read(img), W = img.width, H = img.height, r = 2, Mk = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) Mk[i] = A[i * 4 + 3] > 128 ? 1 : 0;
    let lo = Infinity, hi = -Infinity;
    for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { let all = 1;
      for (let oy = -r; oy <= r && all; oy++) for (let ox = -r; ox <= r; ox++) if (!Mk[(y + oy) * W + x + ox]) { all = 0; break; }
      if (all) { lo = Math.min(lo, x - r); hi = Math.max(hi, x + r + 1); } }
    e = [lo, hi]; ext.set(img, e); return e; };
  const dirs = { s: [0, 9], se: [7, 7], e: [9, 0], ne: [7, -7], n: [0, -9], nw: [-7, -7], w: [-9, 0], sw: [-7, 7] };
  const kinds = ['archer', 'longbow', 'marksman'];
  const res = [];
  for (const tw of ts) {
    const f = Lookout.frame(tw), P = f.P, kind = f.spr._cfArt.fort ? 'wall' : 'free', name = kind + tw.level;
    const prof = Lookout.profile(P), W = f.spr.width, sc = f.r.w / W;
    let xs0 = W, xs1 = -1; for (let x = 0; x < W; x++) if (prof[x]) { xs0 = Math.min(xs0, x); xs1 = Math.max(xs1, x); }
    const l = f.r.x + xs0 * sc, rr = f.r.x + (xs1 + 1) * sc;
    const save = { man: P.man, slots: P.slots.slice(), solo: P.solo };
    P.man = MEN[kind][tw.level - 1];
    // worst spill for a man of `kind` at place `place` with feet column X
    const worst = (place, X) => {
      P.slots = [X, X]; P.solo = X;
      let rest = -1e9, fight = -1e9;
      for (const k of kinds) for (const pose of ['idle', 'fight']) for (const d of (pose === 'idle' ? ['-'] : Object.keys(dirs))) {
        S.units = [];
        const a = Units.spawn(k, 'P', tw.x, tw.y + 1); a.perch = tw.id;
        if (place !== 'alone') { const o = Units.spawn('archer', 'P', tw.x, tw.y + 1); o.perch = tw.id; a.perchSlot = place; o.perchSlot = 1 - place; }
        if (pose === 'fight') { const foe = Units.spawn('defender', 'A', tw.x + dirs[d][0], tw.y + dirs[d][1]); a.tUnit = foe.id; a.task = { type: 'attack', on: foe.id }; }
        else R._faceMap.set(a, { x: a.x, y: a.y, dir: 'n' });
        const s = Lookout.spot(a, f), man = s.y - s.head, fr = R.sheetFrames(a) || [R.unitSprite(a)];
        for (const img of fr) { const D = R.frameBox ? R.frameBox(a, img, s.B) : s.B, x = s.x - D * Lookout.feetAt(a, img), kk = D / img.width;
          const [lo, hi] = opened(img), over = Math.max(l - (x + lo * kk), x + hi * kk - rr);
          if (pose === 'fight') fight = Math.max(fight, over - man / 6); else rest = Math.max(rest, over - 1); }
      }
      return Math.max(rest, fight);
    };
    const ok = {};
    for (const place of [0, 1, 'alone']) { ok[place] = []; for (let X = xs0; X <= xs1; X++) if (worst(place, X) <= -0.15) ok[place].push(X); }
    const rng = a => a.length ? [a[0], a[a.length - 1]] : null;
    // the rails: the feet must stand behind the front at that column
    res.push({ name, man: P.man, posts: [xs0, xs1], left: rng(ok[0]), right: rng(ok[1]), alone: rng(ok.alone), feet: P.feet });
    Object.assign(P, save);
    S.units = [];
  }
  return res;
}, MEN);
for (const r of out) console.log(JSON.stringify(r));
await b.close();
