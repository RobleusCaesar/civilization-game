/* A RESOURCE SOUTH OF A MAN STANDS IN FRONT OF HIS LEGS — R.resBehind,
   R.resTopAt, R.occludeByResource.

   Operator, build 169, with a screenshot of a miner on the stones: "When
   villagers are standing on the tile above a resource chopping down they
   look like they're standing on the tile, versus behind it… with accurate
   perspective maybe you wouldn't see the villager from the knees down since
   that would be behind the tile? Check all different resource tiles."

   Served over HTTP (a page from disk taints the terrain cache, and the
   depth is read off its pixels). Pinned:

     HE STANDS BEHIND IT   a gatherer working a stone pile, a wood, a berry
                           bush or an orchard tree from the NORTH is drawn
                           with his feet DEPTH of a tile below the top of that
                           art in his columns, the step held to [-UP, DOWN]
     THE ART COVERS HIM    the art is laid back over him from his knees down,
                           and not one pixel above his knees changes
     ONLY FROM THE NORTH   a man east of the same pile, or south of it, keeps
                           his old picture: nothing is laid over him, at
                           any frame of his swing, a man's or a woman's
                           (the band above the ore tile south-west of him
                           never lays the boulder beside him over his pick)
     THE FLOOR STAYS UNDER  the band above the south tile is never laid over a
       HIM                 tile that paints a floor of its own (picked-bare
                           soil): every unit on it kept from the waist down,
                           and the floor is never read as the art's top
     A SPECK IS NOT A WALL a scree pebble in his columns does not lift him
     A PICTURE ONLY        no S field moves; the taps (R.unitHit) are the sim's
     CLASSIC STANDS DOWN   under ?terrain=classic (an opaque cache) nothing is
                           measured or laid

   Run after touching: R.workLean, R.resBehind / resTopAt, R.occludeByResource,
   the unit pass in R.draw, Units.assignGather. */
import { join, dirname } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (name, ok, detail) => { res[name] = (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : ''); if (!ok) fails.push(name); };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
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
const base = `http://127.0.0.1:${srv.address().port}/index.html`;

const b = await pw.chromium.launch();
const errs = [];
const page = async (q) => {
  const p = await b.newPage({ viewport: { width: 1200, height: 600 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // nothing leaves the machine
  await p.goto(base + (q || ''));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  return p;
};

/* a stand of each resource, 5 wide and 4 deep, on open meadow, and a
   gatherer at work on the top row of each from the north (and one from the
   east of the stone, one from the south) */
const SCENE = () => {
  G.newGame('resfront-1', 'moderate', 'medium'); Screens._demo = false;
  const x0 = 6, y0 = 10, kinds = [T.HILLS, T.FOREST, T.FERTILE];
  S.buildings = S.buildings.filter(o => Math.abs(o.x - x0 - 9) > 13 || Math.abs(o.y - y0) > 10);
  S.units = []; S.garrison = [];
  for (let y = y0 - 3; y < y0 + 8; y++) for (let x = x0 - 2; x < x0 + 20; x++) {
    const i = MapGen.idx(x, y); let t = T.GRASS;
    const k = Math.floor((x - x0) / 6), c = (x - x0) % 6;
    if (k >= 0 && k < 3 && c < 5 && y >= y0 + 1 && y <= y0 + 4) t = kinds[k];
    S.map.terrain[i] = t; S.map.resAmount[i] = 100; S.map.seenTerrain[i] = t;
  }
  // the stone pile (R._oreCarries) on the stand's top row is the reported case
  // (on the top row, or deeper with the stones north of it cleared to grass)
  let pile = null, py = null;
  for (let y = y0 + 1; y <= y0 + 4 && pile == null; y++)
    for (let x = x0; x < x0 + 5 && pile == null; x++) if (R._oreCarries(x, y, S.map.terrain)) { pile = x; py = y; }
  for (let y = y0 + 1; pile != null && y < py; y++) { const i = MapGen.idx(pile, y); S.map.terrain[i] = S.map.seenTerrain[i] = T.GRASS; }
  Bld._block = null; R.rebuildTerrain();
  Screens.show('playing'); G.freeVis = true; G.updateVisibility();
  const put = (tx, ty, sx, sy) => {
    const u = Units.spawn('villager', 'P', sx, sy);
    Units.assignGather(u, tx, ty);
    const ST = S.map.terrain[MapGen.idx(tx, ty)] === T.FOREST ? 0 : 0.4;
    Object.assign(u.task, { sx, sy, stx: sx + 0.5 + (tx - sx) * ST, sty: sy + 0.5 + (ty - sy) * ST });
    u.x = u.task.stx; u.y = u.task.sty; u.path = null;
    return u.id;
  };
  const ids = {
    pile: pile != null ? put(pile, py, pile, py - 1) : null,
    wood: put(x0 + 8, y0 + 1, x0 + 8, y0),
    fruit: put(x0 + 14, y0 + 1, x0 + 14, y0),
    fruit2: put(x0 + 16, y0 + 1, x0 + 16, y0),
    east: put(x0 + 4, y0 + 2, x0 + 5, y0 + 2),
    south: put(x0 + 2, y0 + 4, x0 + 2, y0 + 5),
  };
  for (const id of ['topbar', 'bottombar', 'miniWrap', 'miniToggle', 'toasts']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  R.cam.z = 1.8; R.centerOn(x0 + 8.5, y0 + 2);
  return { ids, x0, y0, pile };
};

const p = await page('');
const sc = await p.evaluate(SCENE);
await p.waitForFunction(() => window.Assets && Assets.allArtReady && Assets.allArtReady(), null, { timeout: 90000 }).catch(() => {});
await p.waitForFunction(() => window.TerrainX && TerrainX.ready, null, { timeout: 60000 }).catch(() => {});
// let them start their work poses, then hold the world still
await p.evaluate(() => new Promise(r => setTimeout(r, 1500)));
await p.evaluate(() => { S.paused = true; R.rebuildTerrain(); R._resTops = null; });

const v = await p.evaluate((ids) => {
  const U = id => S.units.find(u => u.id === id);
  const out = { v4: !!(TerrainX.on && TerrainX._painted), poses: {}, lean: {}, occ: {} };
  const TL = CFG.TILE, K = R.RES_BEHIND;
  for (const [k, id] of Object.entries(ids)) {
    const u = U(id); if (!u) continue;
    out.poses[k] = R.unitPose(u);
    const l = R.workLean(u), rb = (u.task.y > (u.y | 0)) ? R.resBehind(u, u.task.x, u.task.y) : null;
    out.lean[k] = { y: u.y, ly: l ? l.y : null, rb: rb ? rb.y : null,
      top: R.resTopAt(u.task.x, u.task.y, u.x * TL), foot0: u.y * TL + TL / 2 - CFG.SPRITE_LIFT };
    out.occ[k] = R.occludeByResource(document.createElement('canvas').getContext('2d'), u);
  }
  out.K = K; out.TL = TL;
  return out;
}, sc.ids);

ck('theSceneIsTheV4Layer', v.v4, 'the cache is the V4 layer over transparent ground');
ck('theReportedCaseIsOnTheMap', sc.pile != null, 'a stone pile on the stand\'s top row at x=' + sc.pile);

// HE STANDS BEHIND IT
for (const k of ['pile', 'wood', 'fruit', 'fruit2']) {
  const L = v.lean[k]; if (!L) { ck(k + 'GathererStandsBehindIt', false, 'no gatherer'); continue; }
  const want = L.top + v.K.DEPTH * v.TL;
  const dy = (L.ly - L.y) * v.TL, lo = -v.K.UP * v.TL - 0.01, hi = v.K.DOWN * v.TL + 0.01;
  const feet = L.ly * v.TL + v.TL / 2 - 4;
  const ok = L.top != null && L.ly != null && dy >= lo && dy <= hi &&
    (Math.abs(feet - want) < 0.6 || Math.abs(dy - lo) < 0.02 || Math.abs(dy - hi) < 0.02);
  ck(k + 'GathererStandsBehindIt', ok, `art top ${L.top}, feet drawn at ${feet.toFixed(1)} (want ${want.toFixed(1)}), step ${dy.toFixed(1)}px, pose ${v.poses[k]}`);
}
ck('theMinerGoesBehindThePile', v.lean.pile && v.lean.pile.ly > v.lean.pile.y + 0.05, `drawn ${v.lean.pile && v.lean.pile.ly && v.lean.pile.ly.toFixed(2)} vs stands ${v.lean.pile && v.lean.pile.y.toFixed(2)}`);
// ONLY FROM THE NORTH
ck('aManEastOfItKeepsHisStand', v.lean.east.rb === null && v.lean.east.ly === null, JSON.stringify(v.lean.east));
ck('aManSouthOfItIsNotCovered', v.occ.south === 0 && v.lean.south.rb === null, `laid ${v.occ.south}`);
ck('everyNorthGathererIsCovered', ['pile', 'wood', 'fruit', 'fruit2'].every(k => v.occ[k] >= 1), JSON.stringify(v.occ));

// THE ART COVERS HIM, FROM THE KNEES DOWN — the frame drawn twice, with and without
const px = await p.evaluate((ids) => {
  const U = id => S.units.find(u => u.id === id);
  const TL = CFG.TILE, c = R.canvas || document.getElementById('c'), g2 = c.getContext('2d');
  const real = R.occludeByResource, now = performance.now, t0 = now.call(performance);
  performance.now = () => t0;
  const grab = () => { R.draw(0); return g2.getImageData(0, 0, c.width, c.height).data; };
  const on = grab();
  R.occludeByResource = () => 0; const off = grab(); R.occludeByResource = real;
  const on2 = grab();
  performance.now = now;
  const out = {};
  const dpr = c.width / R.viewW();
  for (const [k, id] of Object.entries(ids)) {
    const u = U(id); if (!u) continue;
    const l = R.workLean(u) || u, B = R.unitBox(u), foot = l.y * TL + TL / 2 - CFG.SPRITE_LIFT;
    const knee = foot - TL * R.RES_FRONT.KNEE;
    const sx = w => Math.round((w - R.cam.x) * R.cam.z * dpr), sy = w => Math.round((w - R.cam.y) * R.cam.z * dpr);
    let above = 0, below = 0, noise = 0;
    for (let y = sy(foot - B * 1.1); y < sy(foot + 2); y++) for (let x = sx(l.x * TL - B / 2); x < sx(l.x * TL + B / 2); x++) {
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
      const i = (y * c.width + x) * 4;
      const d = on[i] !== off[i] || on[i + 1] !== off[i + 1] || on[i + 2] !== off[i + 2];
      if (on[i] !== on2[i] || on[i + 1] !== on2[i + 1]) noise++;
      if (!d) continue;
      if (y < sy(knee) - 1) above++; else below++;
    }
    out[k] = { above, below, noise };
  }
  return out;
}, sc.ids);
// the pile (the reported case) always, and the art reaches the legs of most
// of the others (a narrow trunk or a gap in a crown may miss a pair of legs)
ck('theArtIsLaidOverHisLegs', px.pile && px.pile.below > 20 && ['wood', 'fruit', 'fruit2'].filter(k => px[k] && px[k].below > 20).length >= 2, JSON.stringify(px));
ck('andNothingAboveHisKnees', Object.values(px).every(o => o.above === 0), JSON.stringify(Object.fromEntries(Object.entries(px).map(([k, o]) => [k, o.above]))));
ck('andTheFrameIsStill', Object.values(px).every(o => o.noise === 0), 'two identical draws differ by ' + Object.values(px).map(o => o.noise).join('/'));

/* A MAN BESIDE IT KEEPS HIS PICTURE, AT EVERY FRAME OF HIS SWING. A work
   pose's frame is read off the unit's own clock (u.animT, random from the
   spawn), so one draw checks one frame of the swing — and only once the
   test drew the real villager strips (build 207: a unit asks for its own
   art) did a man working the pile from the east show the fault, in five
   frames of twelve, at random: the band above the ore tile south-west of
   him laid the boulder BESIDE him over the head of his pick. So each frame
   of each man's strip, a man and a woman, is drawn in turn, with the
   occlusion and without it, and not one pixel of him below the knee may
   change. */
const beside = await p.evaluate((ids) => {
  const TL = CFG.TILE, c = R.canvas || document.getElementById('c'), g2 = c.getContext('2d');
  const dpr = c.width / R.viewW();
  const realOcc = R.occludeByResource, realSpr = R.unitSprite, now = performance.now, t0 = now.call(performance);
  const sx = w => Math.round((w - R.cam.x) * R.cam.z * dpr), sy = w => Math.round((w - R.cam.y) * R.cam.z * dpr);
  const out = {};
  performance.now = () => t0;
  try {
    for (const k of ['east', 'south']) {
      const u = S.units.find(o => o.id === ids[k]);
      if (!u) { out[k] = { missing: true }; continue; }
      const sex = u.female;
      for (const fem of [false, true]) {
        u.female = fem;
        const fr = R.sheetFrames(u), n = fr && fr.length ? fr.length : 0, key = R._sheetKey, below = [];
        const l = R.workLean(u) || u, B = R.unitBox(u), foot = l.y * TL + TL / 2 - CFG.SPRITE_LIFT;
        const knee = sy(foot - TL * R.RES_FRONT.KNEE) - 1;
        const X0 = Math.max(0, sx(l.x * TL - B / 2)), X1 = Math.min(c.width, sx(l.x * TL + B / 2));
        const Y0 = Math.max(0, sy(foot - B * 1.1)), Y1 = Math.min(c.height, sy(foot + 2));
        for (let f = 0; f < Math.max(1, n); f++) {
          // his strip's frame f, whatever his clock says; everyone else as ever
          R.unitSprite = function (v) {
            if (v === u) { const a = this.sheetFrames(v); if (a && a.length) return a[f % a.length]; }
            return realSpr.call(this, v);
          };
          R.draw(0); const on = g2.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
          R.occludeByResource = () => 0; R.draw(0); const off = g2.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
          R.occludeByResource = realOcc;
          let d = 0;
          for (let y = Math.max(Y0, knee); y < Y1; y++) for (let x = X0; x < X1; x++) {
            const i = ((y - Y0) * (X1 - X0) + (x - X0)) * 4;
            if (on[i] !== off[i] || on[i + 1] !== off[i + 1] || on[i + 2] !== off[i + 2]) d++;
          }
          below.push(d);
        }
        out[k + (fem ? 'F' : 'M')] = { key, frames: n, below };
      }
      u.female = sex;
    }
  } finally { R.unitSprite = realSpr; R.occludeByResource = realOcc; performance.now = now; }
  return out;
}, sc.ids);
const bes = Object.values(beside);
ck('aManBesideItKeepsHisPicture', bes.length === 4 && bes.every(o => o.frames > 1 && o.below.every(d => d === 0)),
  Object.entries(beside).map(([k, o]) => `${k} ${o.missing ? 'missing' : (o.frames + ' frames: ' + o.below.join(' '))}`).join('; '));

// A SPECK IS NOT A WALL: two opaque pixels in his columns, high in the tile, change nothing
const speck = await p.evaluate((ids) => {
  const u = S.units.find(o => o.id === ids.pile), TL = CFG.TILE;
  if (!u) return { missing: ids.pile };
  R._resTops = null;
  const before = R.resTopAt(u.task.x, u.task.y, u.x * TL);
  const g = R.terrainCache.getContext('2d');
  const sx = Math.round(u.x * TL), sy = u.task.y * TL - 6;
  const keep = g.getImageData(sx, sy, 2, 2);
  g.fillStyle = '#777'; g.fillRect(sx, sy, 2, 2);
  R._resTops = null;
  const after = R.resTopAt(u.task.x, u.task.y, u.x * TL);
  g.putImageData(keep, sx, sy); R._resTops = null;
  return { before, after };
}, sc.ids);
ck('aSpeckIsNotAWall', speck.before === speck.after && speck.before != null, JSON.stringify(speck));

// A PICTURE ONLY
const pure = await p.evaluate((ids) => {
  const snap = () => JSON.stringify(S.units.map(u => [u.id, u.x, u.y, u.task && u.task.sx, u.task && u.task.sy]));
  const a = snap();
  for (let i = 0; i < 3; i++) R.draw(0);
  const u = S.units.find(o => o.id === ids.pile), TL = CFG.TILE;
  // a tap on his logical centre answers as it did: unitHit reads the sim
  const hit = R.unitHit(u, u.x, u.y - CFG.SPRITE_LIFT / TL);
  return { same: a === snap(), hit };
}, sc.ids);
ck('aPictureOnly', pure.same && pure.hit < 1e-9, JSON.stringify(pure));

/* …AND THE GROUND HE STANDS ON STAYS UNDER HIM (a playtest, build 216, with a
   screenshot: a woodcutter on picked-bare soil chopping the wood south of it,
   drawn cut off at the knees — "a villager disappears into the farm"). The
   band above the south tile is laid for the art that rises out of it, but it
   lies in HIS tile, and spent soil paints a floor there that is opaque edge
   to edge: laid back over him, it buried his legs in the ground he stood on.
   His tile turned to spent soil: R.floorAt reads it as a floor, nothing is
   laid in his own tile's band (not one pixel of it changes with the
   occlusion on or off), the art's top is read off the wood alone (never the
   floor's first row), and he still goes behind the wood. The control lays
   the band anyway (R.floorAt answering no) and must see it bury him. */
const soil = await p.evaluate((ids) => {
  const u = S.units.find(o => o.id === ids.wood), TL = CFG.TILE;
  if (!u || !u.task) return { missing: true };
  const own = u.x | 0, row = u.y | 0, i = MapGen.idx(own, row), was = S.map.terrain[i];
  const c = R.canvas || document.getElementById('c'), g2 = c.getContext('2d'), dpr = c.width / R.viewW();
  const sx = w => Math.round((w - R.cam.x) * R.cam.z * dpr), sy = w => Math.round((w - R.cam.y) * R.cam.z * dpr);
  const now = performance.now, t0 = now.call(performance), realOcc = R.occludeByResource, realFloor = R.floorAt;
  const fresh = () => { R._resTops = null; R._floors = null; };
  const band = () => {
    const l = R.workLean(u) || u, B = R.unitBox(u);
    const X0 = Math.max(0, sx(l.x * TL - B / 2)), X1 = Math.min(c.width, sx(l.x * TL + B / 2));
    const Y0 = Math.max(0, sy((u.task.y - R.RES_FRONT.OVER) * TL)), Y1 = Math.min(c.height, sy(u.task.y * TL));
    R.draw(0); const on = g2.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
    R.occludeByResource = () => 0; R.draw(0); const off = g2.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
    R.occludeByResource = realOcc;
    let d = 0;
    for (let k = 0; k < on.length; k += 4) if (on[k] !== off[k] || on[k + 1] !== off[k + 1] || on[k + 2] !== off[k + 2]) d++;
    return { laid: d, ly: +l.y.toFixed(3), top: R.resTopAt(u.task.x, u.task.y, u.x * TL) };
  };
  performance.now = () => t0;
  try {
    S.map.terrain[i] = S.map.seenTerrain[i] = T.BARREN;
    R.drawTileAt(own, row); fresh();
    const floor = typeof R.floorAt === 'function' ? R.floorAt(own, row, u.x * TL - 5, u.x * TL + 6) : 'none';
    const fixed = band();
    R.floorAt = () => false; fresh();
    const control = band();
    return { floor, fixed, control, y: +u.y.toFixed(3), ty: u.task.y, TL };
  } finally {
    R.occludeByResource = realOcc; R.floorAt = realFloor; performance.now = now;
    S.map.terrain[i] = S.map.seenTerrain[i] = was; R.drawTileAt(own, row); fresh();
  }
}, sc.ids);
ck('theSpentSoilHeStandsOnIsAFloor', soil.floor === true, JSON.stringify(soil));
ck('andItIsNeverLaidOverHim', !!soil.fixed && soil.fixed.laid === 0, JSON.stringify(soil.fixed));
ck('andTheArtsTopIsTheWoodsNotTheFloors', !!soil.fixed && soil.fixed.top != null && soil.fixed.top >= soil.ty * soil.TL - 0.5,
  `top ${soil.fixed && soil.fixed.top} against the wood's own top ${soil.ty * soil.TL}`);
ck('andHeStillGoesBehindTheWood', !!soil.fixed && soil.fixed.ly > soil.y + 0.05, `drawn ${soil.fixed && soil.fixed.ly} vs stands ${soil.y}`);
ck('andTheProbeCanSeeTheFloorBuryHim', !!soil.control && soil.control.laid > 40, JSON.stringify(soil.control));
await p.close();

// CLASSIC STANDS DOWN
const q = await page('?terrain=classic');
const sq = await q.evaluate(SCENE);
await q.evaluate(() => new Promise(r => setTimeout(r, 1200)));
const cl = await q.evaluate((id) => {
  const u = S.units.find(o => o.id === id);
  if (!u || !u.task) return { missing: true, n: S.units.length };
  return { occ: R.occludeByResource(document.createElement('canvas').getContext('2d'), u), rb: R.resBehind(u, u.task.x, u.task.y), v4: !!(window.TerrainX && TerrainX.on) };
}, sq.ids.wood);
ck('classicStandsDown', cl.occ === 0 && cl.rb === null && !cl.v4, JSON.stringify(cl));
await q.close();

ck('noPageErrors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close(); srv.close();
console.log(JSON.stringify(res, null, 1));
if (fails.length) { console.log('FAILURES: ' + fails.join(', ')); process.exit(1); }
