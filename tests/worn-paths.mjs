/* WORN PATHS CONTRACT (W7, operator ruling 3: "wear accrues from economic
   trips only — gatherers to camps/TC, builders, traders; military movement
   doesn't wear paths"; and the retro gate's second ruling: "too messy… fewer
   paths, but when those paths are walked the villagers get a 10% speed boost;
   default villagers to walking the path a little more; reduce extraneous
   paths next to the primary path; double the time before a path fades").
   CFG.WEAR, G.noteWear / wearPull / wearDaily / wearLevel, Units.wearPrefer,
   Path.findWeighted, Units.followPath, R.wearPaint.

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
        most once; CFG.WEAR.levels days make thinned grass / trodden earth /
        bare path, and an unused tile drops a level every `decay` days —
        twice the first pass's 25.
     3. IN A REAL SIM a villager sent to the same far stand day after day
        wears its own route to bare path; a soldier marching the same route
        for as long wears nothing.
     4. THE PICTURE IS A FEW CLEAN ROADS: the worn route changes the drawn
        ground on its tiles as a band narrower than a tile (never a tile
        square), the incrementally repainted cache equals a fresh rebake BYTE
        FOR BYTE (the land.mjs discipline), and THINNED GRASS IS NEVER DRAWN
        (level 1 is how a route earns its way to a path; painted, it was the
        pale halo that doubled every road's width).
     5. THE ROAD TAKES THE STEP: a foot beside a path `pull` days more worn
        credits the path, so a parallel rut never gets started.
     6. THE ROAD CALLS THE WALKER: a villager on a work trip routes onto worn
        ground (a cheaper step); a soldier, and a villager in a world with no
        roads, keep the unweighted search.
     7. THE ROAD IS QUICKER: a villager on trodden earth or better walks
        CFG.WEAR.speed (1.1) as fast; a soldier on the same road does not.
        Passability is untouched, the wear rides the save, and the per-unit
        bookkeeping does not.

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
    const want = Array.from({ length: 11 }, (_, d) => G.wearLevelOf(d + 1)).join('');
    ck('aTileCountsDaysNotSteps', e[0] === 11 && lv.join('') === want && want === '00011112222',
      'levels by day ' + lv.join('') + ' (want ' + want + ' for levels ' + CFG.WEAR.levels.join('/') + '), count ' + e[0] + ' after 55 crossings over 11 days');
    for (let d = 0; d < 6; d++) { G.noteWear(v, 12, 10); G.wearDaily(); S.day++; }
    ck('aBarePathTakesThirteenWorkingDays', G.wearLevel(12, 10) === 3 && CFG.WEAR.levels[2] === 13,
      'level ' + G.wearLevel(12, 10) + ' after 17 days (bare path at ' + CFG.WEAR.levels[2] + ')');
    const C = CFG.WEAR, dec = [];
    ck('aPathWaitsTwiceAsLongToFade', C.decay === 50, 'decay ' + C.decay + ' days (the first pass faded after 25)');
    for (let k = 0; k < 3; k++) { S.day += C.decay; e[1] = S.day - C.decay; G.wearDaily(); dec.push(G.wearLevel(12, 10)); }
    ck('anUnusedPathGrowsBackALevelAtATime', dec.join('') === '210' && !S.map.wear[10 * CFG.W + 12],
      'levels after each idle spell ' + dec.join(''));
  }

  // ---- 3. in a real sim: the commute wears a road, the march wears nothing ----
  let route = [];
  {
    const { fx, fy } = world('wp-3');
    for (let d = 0; d < 18; d++) commute(fx, fy);
    route = Object.keys(S.map.wear).map(Number);
    const bare = route.filter(i => G.wearLevelOf(S.map.wear[i][0]) === 3);
    ck('aDailyCommuteWearsABarePath', bare.length >= 8,
      bare.length + ' of ' + route.length + ' route tiles at bare path after 18 working days');
    world('wp-3');
    for (let d = 0; d < 18; d++) commute(fx, fy, 'defender');
    ck('aMarchWearsNothing', Object.keys(S.map.wear).length === 0,
      Object.keys(S.map.wear).length + ' tiles worn by 18 days of a soldier on the same road');
    // …and it is a picture: passability and the save
    world('wp-3');
    for (let d = 0; d < 18; d++) commute(fx, fy);
    const before = route.every(i => Path.passable(i % CFG.W, (i / CFG.W) | 0, 'P'));
    const keep = JSON.stringify(S.map.wear);
    const json = G.saveJSON();
    G.loadJSON(json);
    ck('theRoadNeverBlocksAndRidesTheSave', before && JSON.stringify(S.map.wear) === keep && !/_wearPos|_wx/.test(json) &&
      G._wearRoads > 0 && G._wearRoads === G.countWearRoads(),
      'passable ' + before + ', wear round-trips, no per-unit bookkeeping in the save, ' + G._wearRoads + ' road tiles recounted on load');
  }

  // ---- 4. the drawn ground: a band, not a square; repaint == rebake ----
  {
    const { fx, fy } = world('wp-4');
    for (let d = 0; d < 11; d++) commute(fx, fy);    // reach level 2 on the route (bare at 13)
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

  // ---- 4b. thinned grass is tracked, never drawn ----
  {
    world('wp-4b');
    G.updateVisibility(); R.rebuildTerrain();
    const cg = R.terrainCache.getContext('2d');
    const grab = () => cg.getImageData(0, 0, R.terrainCache.width, R.terrainCache.height).data;
    const none = grab();
    for (let x = 9; x <= 20; x++) S.map.wear[16 * CFG.W + x] = [CFG.WEAR.levels[0], S.day];   // a whole run at level 1
    G.countWearRoads(); R.rebuildTerrain();
    const thin = grab();
    let diff = 0; for (let i = 0; i < none.length; i++) if (none[i] !== thin[i]) diff++;
    for (let x = 9; x <= 20; x++) S.map.wear[16 * CFG.W + x] = [CFG.WEAR.levels[1], S.day];   // …the same run trodden
    G.countWearRoads(); R.rebuildTerrain();
    const trod = grab();
    let diff2 = 0; for (let i = 0; i < none.length; i++) if (none[i] !== trod[i]) diff2++;
    ck('thinnedGrassIsNeverDrawn', diff === 0 && diff2 > 1000,
      diff + ' bytes changed by a run of thinned grass; ' + diff2 + ' by the same run trodden');
  }

  // ---- 5. the road takes the step ----
  {
    world('wp-5');
    for (let x = 9; x <= 20; x++) S.map.wear[16 * CFG.W + x] = [8, S.day];
    S.map.wear[15 * CFG.W + 12] = [7, S.day];                   // a rut one day behind: no pull
    const v = Units.spawn('villager', 'P', 10, 10); v.task = { type: 'gather', x: 22, y: 16 }; v.path = [{ x: 11, y: 10 }];
    G._wearToday = null;
    G.noteWear(v, 14, 17);          // beside the road: the road takes it
    G.noteWear(v, 12, 15);          // the rut is only a day behind its road: it keeps its own
    G.noteWear(v, 14, 12);          // nowhere near a road: its own tile
    const got = [...(G._wearToday || [])].map(i => (i % CFG.W) + ',' + ((i / CFG.W) | 0)).sort();
    ck('theRoadTakesTheStep', JSON.stringify(got) === JSON.stringify(['12,15', '14,12', '14,16']),
      'stamped ' + JSON.stringify(got) + ' — a step at 14,17 credits the road at 14,16; a rut within ' + CFG.WEAR.pull + ' days of it keeps its own');
  }

  // ---- 6. the road calls the walker ----
  {
    world('wp-6');
    // a bare road two rows NORTH of the straight line from the doorstep to the
    // stand — a detour no shortest-steps search would take for its own sake
    for (let x = 10; x <= 19; x++) S.map.wear[14 * CFG.W + x] = [CFG.WEAR.levels[2], S.day];
    G.countWearRoads();
    const onRoad = (p) => p.filter(t => G.wearLevel(t.x, t.y) >= 2).length / Math.max(1, p.length);
    // Units.spawn eases a newcomer off a crowded tile; every walker here starts ON the doorstep
    const at = (kind) => { const u = Units.spawn(kind, 'P', 8.5, 16.5); u.x = 8.5; u.y = 16.5; return u; };
    const v = at('villager'); Units.assignGather(v, 22, 16);
    const vRoad = onRoad(v.path || []), end = v.path[v.path.length - 1];
    const plain = Path.find(8, 16, end.x, end.y, 'P');
    const s2 = at('defender'); Units.moveTo(s2, end.x, end.y);
    const sRoad = onRoad(s2.path || []), sPlain = JSON.stringify(s2.path) === JSON.stringify(plain);
    const w2 = at('villager'); Units.moveTo(w2, end.x, end.y);
    const wPlain = JSON.stringify(w2.path) === JSON.stringify(plain);
    S.map.wear = {}; G.countWearRoads();
    const v2 = at('villager'); Units.assignGather(v2, 22, 16);
    const e2 = v2.path[v2.path.length - 1];
    const sameAsPlain = JSON.stringify(v2.path) === JSON.stringify(Path.find(8, 16, e2.x, e2.y, 'P'));
    ck('theRoadCallsTheWalker', vRoad >= 0.6 && onRoad(plain) < 0.3 && sPlain && sRoad < 0.3 && wPlain && sameAsPlain,
      'a gatherer walks ' + Math.round(100 * vRoad) + '% of its route on the road (the plain search ' + Math.round(100 * onRoad(plain)) +
      '%); the soldier and the stroll take the plain search: ' + sPlain + '/' + wPlain + '; with no roads the gatherer does too: ' + sameAsPlain);
  }

  // ---- 7. the road is quicker ----
  {
    world('wp-7');
    // one step mid-tile, so the waypoint snap cannot quantise the answer
    const step = (kind, worn) => {
      S.map.wear = {};
      if (worn) for (let x = 6; x <= 26; x++) S.map.wear[20 * CFG.W + x] = [CFG.WEAR.levels[1], S.day];
      G.countWearRoads();
      const u = Units.spawn(kind, 'P', 8.05, 20.5); u.x = 8.05; u.y = 20.5;
      u.path = [{ x: 10, y: 20 }]; u.pathI = 0;
      Units.followPath(u, 0.02);
      const d = u.x - 8.05;
      Units.despawn ? Units.despawn(u) : S.units.splice(S.units.indexOf(u), 1);
      return d;
    };
    const r = step('villager', true) / step('villager', false), rs = step('defender', true) / step('defender', false);
    ck('theRoadIsQuicker', Math.abs(r - CFG.WEAR.speed) < 1e-6 && Math.abs(rs - 1) < 1e-9 && CFG.WEAR.speed === 1.1,
      'a villager covers ×' + r.toFixed(4) + ' the ground per step on trodden earth; a soldier ×' + rs.toFixed(4));
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WORN-PATH CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs);
await b.close(); srv.close();
process.exit(out.fails.length || realErrs.length ? 1 : 0);
