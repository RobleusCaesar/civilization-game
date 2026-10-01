/* WORN PATHS CONTRACT (W7, operator ruling 3: "wear accrues from economic
   trips only — gatherers to camps/TC, builders, traders; military movement
   doesn't wear paths; purely visual"). CFG.WEAR, G.noteWear / wearDaily /
   wearLevel, R.wearPaint.

   The audit measured the hazard that shapes the rule (GRS-08/09): a working
   town's villagers barely walk once they are posted, while ONE 20-soldier
   march crosses the same thirty tiles twenty times. A counter of raw
   footsteps would pave a road for the army and nothing for the town. So:

     1. ONLY WORK WALKS WEAR: a villager on its way to gather, work, build or
        claim stamps the grass it steps onto; a soldier never does, a
        villager on a plain walk never does, and the rival only where the
        player can see it (a path worn in the fog would draw the rival's
        town onto the map). Never on a building or off the grass.
     2. DISTINCT DAYS, NOT STEPS: a tile counts each day it was crossed at
        most once; 3 / 6 / 10 days make thinned grass / trodden earth / bare
        path, and an unused tile drops a level every `decay` days.
     3. IN A REAL SIM a villager sent to the same far stand day after day
        wears its own route to bare path; a soldier marching the same route
        for as long wears nothing.
     4. IT IS ONLY A PICTURE, AND AN HONEST ONE: the worn route changes the
        drawn ground on its tiles as a band narrower than a tile (never a
        tile square), passability is untouched, the incrementally repainted
        cache equals a fresh rebake BYTE FOR BYTE (the land.mjs discipline),
        and the wear rides the save while the per-unit bookkeeping does not.

     node tests/worn-paths.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// served over HTTP: under file:// every canvas a PNG touched is tainted and
// the cache cannot be read back for the parity check
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = createServer(async (rq, rs) => {
  try {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    const f = join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
    if (!f.startsWith(root)) { rs.writeHead(403); rs.end(); return; }
    const body = await readFile(f);
    rs.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' });
    rs.end(body);
  } catch (e) { rs.writeHead(404); rs.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:' + srv.address().port + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  Boot.force(); Screens._demo = false;
  // a flat, known world with one far stand east of the hall
  const world = (seed) => {
    G.newGame(seed, 'moderate', 'medium'); Screens.show('playing'); S.paused = true;
    for (let i = 0; i < CFG.W * CFG.H; i++) { S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1; }
    S.buildings = S.buildings.filter(z => z.key === 'tc' && z.owner === 'P'); S.units = []; Bld._block = null;
    const tc = Bld.tcOf('P'); tc.x = 6; tc.y = 15; Bld._block = null;
    const fx = 22, fy = 16;
    S.map.terrain[fy * CFG.W + fx] = T.FOREST; S.map.seenTerrain[fy * CFG.W + fx] = T.FOREST;
    S.map.resAmount[fy * CFG.W + fx] = 1e6;
    S.map.wear = {}; G._wearToday = null; G.freeVis = true; G.updateVisibility();
    return { tc, fx, fy };
  };
  // one working day: a fresh hand walks from the doorstep to the stand
  const commute = (fx, fy, kind) => {
    const u = Units.spawn(kind || 'villager', 'P', 8, 16);
    if (kind) Units.moveTo(u, fx - 1, fy); else Units.assignGather(u, fx, fy);
    for (let k = 0; k < 900 && u.path; k++) Units.update(0.05);
    Units.despawn ? Units.despawn(u) : S.units.splice(S.units.indexOf(u), 1);
    G.wearDaily(); S.day++;
  };

  // ---- 1. only work walks wear ----
  {
    const { fx, fy } = world('wp-1');
    const v = Units.spawn('villager', 'P', 10, 10);
    v.task = { type: 'gather', x: fx, y: fy }; v.path = [{ x: 11, y: 10 }];
    G.noteWear(v, 11, 10);
    const s = Units.spawn('defender', 'P', 10, 12);
    s.task = { type: 'move', x: 20, y: 12 }; G.noteWear(s, 11, 12);
    const w = Units.spawn('villager', 'P', 10, 14);
    w.task = { type: 'move', x: 20, y: 14 }; G.noteWear(w, 11, 14);
    const a = Units.spawn('villager', 'A', 10, 18); a.task = { type: 'gather', x: fx, y: fy };
    const vis = G.visibleAt;
    G.visibleAt = () => false; G.noteWear(a, 11, 18);
    G.visibleAt = () => true; G.noteWear(a, 11, 19);
    G.visibleAt = vis;
    G.noteWear(v, 6, 15);                         // the hall's own footprint
    S.map.terrain[20 * CFG.W + 11] = T.STUMPS; G.noteWear(v, 11, 20);   // off the grass
    const got = [...(G._wearToday || [])].map(i => (i % CFG.W) + ',' + ((i / CFG.W) | 0)).sort();
    ck('onlyWorkWalksWear', JSON.stringify(got) === JSON.stringify(['11,10', '11,19']),
      'stamped ' + JSON.stringify(got) + ' — the gatherer and the SEEN rival hand; never the soldier, the stroll, the fog, the hall or the stumps');
  }

  // ---- 2. distinct days, not steps; levels; decay ----
  {
    world('wp-2');
    const v = Units.spawn('villager', 'P', 10, 10); v.task = { type: 'build' };
    const lv = [];
    for (let d = 0; d < 11; d++) {
      for (let k = 0; k < 5; k++) G.noteWear(v, 12, 10);     // five crossings, one day
      G.wearDaily(); S.day++; lv.push(G.wearLevel(12, 10));
    }
    const e = S.map.wear[10 * CFG.W + 12];
    ck('aTileCountsDaysNotSteps', e[0] === 11 && lv.join('') === '00111222233',
      'levels by day ' + lv.join('') + ', count ' + e[0] + ' after 55 crossings over 11 days');
    const C = CFG.WEAR, dec = [];
    for (let k = 0; k < 3; k++) { S.day += C.decay; e[1] = S.day - C.decay; G.wearDaily(); dec.push(G.wearLevel(12, 10)); }
    ck('anUnusedPathGrowsBackALevelAtATime', dec.join('') === '210' && !S.map.wear[10 * CFG.W + 12],
      'levels after each idle spell ' + dec.join(''));
  }

  // ---- 3. in a real sim: the commute wears a road, the march wears nothing ----
  let route = [];
  {
    const { fx, fy } = world('wp-3');
    for (let d = 0; d < 11; d++) commute(fx, fy);
    route = Object.keys(S.map.wear).map(Number);
    const bare = route.filter(i => G.wearLevelOf(S.map.wear[i][0]) === 3);
    ck('aDailyCommuteWearsABarePath', bare.length >= 8,
      bare.length + ' of ' + route.length + ' route tiles at bare path after 11 working days');
    world('wp-3');
    for (let d = 0; d < 11; d++) commute(fx, fy, 'defender');
    ck('aMarchWearsNothing', Object.keys(S.map.wear).length === 0,
      Object.keys(S.map.wear).length + ' tiles worn by 11 days of a soldier on the same road');
    // …and it is a picture: passability and the save
    world('wp-3');
    for (let d = 0; d < 11; d++) commute(fx, fy);
    const before = route.every(i => Path.passable(i % CFG.W, (i / CFG.W) | 0, 'P'));
    const keep = JSON.stringify(S.map.wear);
    const json = G.saveJSON();
    G.loadJSON(json);
    ck('itIsOnlyAPictureAndItRidesTheSave', before && JSON.stringify(S.map.wear) === keep && !/_wearPos|_wx/.test(json),
      'passable ' + before + ', wear round-trips, no per-unit bookkeeping in the save');
  }

  // ---- 4. the drawn ground: a band, not a square; repaint == rebake ----
  {
    const { fx, fy } = world('wp-4');
    for (let d = 0; d < 9; d++) commute(fx, fy);     // reach level 2 on the route
    G.updateVisibility(); R.rebuildTerrain();
    const TL = CFG.TILE, cg = R.terrainCache.getContext('2d');
    const grab = () => cg.getImageData(0, 0, R.terrainCache.width, R.terrainCache.height).data;
    const pre = grab();
    // two more days through the real daily repaint
    for (let d = 0; d < 2; d++) commute(fx, fy);
    R.flushRepaint && R.flushRepaint();
    const inc = grab();
    R.rebuildTerrain();
    const full = grab();
    let diff = 0; for (let i = 0; i < full.length; i++) if (inc[i] !== full[i]) diff++;
    ck('theRepaintIsTheRebake', diff === 0, diff + ' bytes differ between the daily repaint and a fresh bake');
    // a bare-path tile in the run of the road: how much of it changed, and
    // whether its top and bottom rows (between path centres) stayed grass
    const W = R.terrainCache.width;
    const bare = Object.keys(S.map.wear).map(Number).filter(i => G.wearLevelOf(S.map.wear[i][0]) === 3)
      .filter(i => { const x = i % CFG.W, y = (i / CFG.W) | 0;
        return G.wearLevel(x - 1, y) === 3 && G.wearLevel(x + 1, y) === 3 && !G.wearLevel(x, y - 1) && !G.wearLevel(x, y + 1); });
    const off = { 0: 0, 1: 0, 2: 0 }, tot = { 0: 0, 1: 0, 2: 0 };
    let worn = 0, all = 0;
    for (const i of bare) {
      const tx = (i % CFG.W) * TL, ty = ((i / CFG.W) | 0) * TL;
      for (let yy = 0; yy < TL; yy++) for (let xx = 0; xx < TL; xx++) {
        const k = ((ty + yy) * W + tx + xx) * 4;
        const ch = Math.abs(full[k] - pre[k]) + Math.abs(full[k + 1] - pre[k + 1]) + Math.abs(full[k + 2] - pre[k + 2]) > 18 ||
          full[k + 1] < full[k] + 8;   // browner than grass: on the path
        const band = yy < TL * 0.2 ? 0 : yy > TL * 0.8 ? 2 : 1;
        tot[band]++; if (ch) off[band]++;
        all++; if (full[k + 1] < full[k] + 8) worn++;
      }
    }
    const mid = off[1] / Math.max(1, tot[1]), edge = (off[0] + off[2]) / Math.max(1, tot[0] + tot[2]);
    ck('aWornRoadIsABandNotASquare', bare.length >= 3 && mid > 0.5 && edge < 0.35,
      bare.length + ' straight bare tiles: path ' + Math.round(100 * mid) + '% across the middle rows, ' +
      Math.round(100 * edge) + '% along the top and bottom fifths');
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WORN-PATH CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs);
await b.close(); srv.close();
process.exit(out.fails.length || realErrs.length ? 1 : 0);
