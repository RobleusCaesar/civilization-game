/* FRAME HOT-PATH CONTRACT — the late-game town must not cost more per frame
   or per day than the early one (audit PRF-02 / PRF-03 / PRF-V01).

   Measured on a real day-191 save before this contract existed: a day tick
   averaged 61ms and peaked at 102ms at desktop speed (260ms mean / 452ms
   peak at 4x CPU throttle — a visible hitch every game day), and the world
   pass blew the 1.5ms desktop gate in 11 of 12 runs. Two faults, both of
   them "a question asked of the whole town once per tile":

     1. `Bld.at(x, y)` was a LINEAR scan of S.buildings — and it is asked by
        the rival's floods, the wall auto-tiling, the gate facing and the
        tower bond, hundreds of times per call. It is a per-tile index now,
        rebuilt only when the building list or the block grid changes.
     2. The building loop in R.draw culled on FOG alone, so every building
        any unit could see anywhere on the map was drawn every frame — 28 of
        47 blits off screen on that save, the rival's whole wall line among
        them. It culls to the camera band first now.

   Neither change may alter a single answer or a single pixel, so this file
   checks the index against the linear definition on every tile of a crowded
   map (including the edits tests and old code make behind its back), counts
   how much of the town one query touches, proves no blit lands off screen,
   and proves a frozen-time frame byte-identical with the cull switched off.
   It deliberately sets NO millisecond bar — the machine-independent way to
   say "it does not scan" is to count the scanning.

   Run this after touching any of:
     buildings.js — at / covers / rebuildBlock / place / removeToRuin
     render.js — the building loop in draw(), viewTiles, artRect

     node tests/frame-hotpath.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const linear = (x, y) => S.buildings.find(o => Bld.covers(o, x, y));

  // a crowded, fortified town spread across the whole board
  Boot.force(); Screens._demo = false;
  G.newGame('hotpath', 'moderate', 'large'); Screens.show('playing'); S.paused = true;
  S.res = { food: 1e6, wood: 1e6, stone: 1e6, gold: 1e6 };
  for (let i = 0; i < CFG.W * CFG.H; i++) { S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1; }
  S.units = [];
  S.buildings = S.buildings.filter(z => z.key === 'tc'); Bld._block = null;
  const put = (o, key, x, y) => {
    const bb = Bld.place(o, key, x, y, { free: true, instant: true });
    if (bb && bb.construction > 0) Bld.finish(bb);
    return bb;
  };
  const kinds = ['house', 'barracks', 'tower', 'farm', 'range', 'stable'];
  let k = 0;
  for (let y = 3; y < CFG.H - 4; y += 3) for (let x = 3; x < CFG.W - 4; x += 3) {
    if (Bld.at(x, y) || Bld.at(x + 1, y + 1)) continue;
    put(k % 3 ? 'P' : 'A', kinds[k++ % kinds.length], x, y);
  }
  // a wall line with towers and a gate in it, far from the hall
  for (let x = 6; x < 30; x++) if (!Bld.at(x, CFG.H - 3)) put('A', x === 18 ? 'gate' : x % 6 ? 'wall' : 'tower', x, CFG.H - 3);
  R.rebuildTerrain();
  const nB = S.buildings.length;

  // ---- 1. Bld.at is the linear definition, on every tile ----
  const agree = () => {
    let bad = 0, first = null;
    for (let y = -1; y <= CFG.H; y++) for (let x = -1; x <= CFG.W; x++) {
      if (Bld.at(x, y) !== linear(x, y)) { bad++; if (!first) first = [x, y]; }
    }
    // fractional and off-board asks still answer what the definition does
    for (const [x, y] of [[3.5, 3.5], [10.2, 7.9], [-0.5, 2], [CFG.W + 0.5, 1]]) if (Bld.at(x, y) !== linear(x, y)) { bad++; first = first || [x, y]; }
    return { bad, first };
  };
  let a = agree();
  ck('atIsTheLinearDefinition', a.bad === 0, nB + ' buildings, ' + a.bad + ' tiles disagree' + (a.first ? ' first at ' + a.first : ''));
  // the edits that happen behind the index's back: a test pushing a raw
  // building, a filter-replace, a place, a ruin — none bumps anything the
  // caller had to remember
  const raw = { id: 99999, key: 'house', owner: 'P', x: 1, y: 1, level: 1, hp: 50, maxhp: 50, construction: 0, sz: 1 };
  S.buildings.push(raw);
  const pushed = Bld.at(1, 1) === raw;
  S.buildings = S.buildings.filter(z => z !== raw);
  const filtered = Bld.at(1, 1) === linear(1, 1);
  const hb = put('P', 'house', 2, CFG.H - 6);
  const placed = hb && Bld.at(hb.x, hb.y) === hb;
  const victim = S.buildings.find(z => z.key === 'barracks');
  Bld.removeToRuin(victim);
  const ruined = Bld.at(victim.x, victim.y) === linear(victim.x, victim.y) && Bld.at(victim.x, victim.y) !== victim;
  // an in-place move announced the way the codebase announces it
  const tc = Bld.tcOf('P'); tc.x = 2; tc.y = 2; Bld._block = null;
  const moved = Bld.at(2, 2) === tc && Bld.at(3, 3) === tc;
  a = agree();
  ck('andStaysItThroughEveryEdit', pushed && filtered && placed && ruined && moved && a.bad === 0,
    JSON.stringify({ pushed, filtered, placed, ruined, moved, disagree: a.bad }));

  // ---- 2. one query touches a tile's worth of the town, not the town ----
  let covers = 0; const oc = Bld.covers;
  Bld.covers = function () { covers++; return oc.apply(this, arguments); };
  let asks = 0;
  try { for (let y = 0; y < CFG.H; y += 2) for (let x = 0; x < CFG.W; x += 2) { Bld.at(x, y); asks++; } }
  finally { Bld.covers = oc; }
  ck('aQueryDoesNotScanTheTown', covers <= asks,
    covers + ' covers() calls for ' + asks + ' queries over ' + S.buildings.length + ' buildings (a scan would be ~' + Math.round(asks * S.buildings.length / 2) + ')');

  // ---- 3. the building loop draws nothing off screen ----
  const vis = G.visibleAt; G.visibleAt = () => true;
  R.cam.z = 1.7; R.centerOn(CFG.W / 2, CFG.H / 2);
  const blit = R.blitBld; const rects = [];
  R.blitBld = function (g, spr, x, y, w, h) { rects.push([x, y, w, h]); return blit.apply(this, arguments); };
  try { R.draw(0.016); } finally { R.blitBld = blit; }
  const v = R.viewTiles(), TL = CFG.TILE;
  // "far off" = further than the loop's own generous band (footprints of
  // art overhang and smoke, R.draw's comment) plus a tile of slack
  const off = rects.filter(([x, y, w, h]) => x + w * 3.5 + 2 * TL < v.x0 * TL || x - w * 2.5 - 2 * TL > v.x1 * TL ||
    y + h * 3 + 2 * TL < v.y0 * TL || y - h * 4 - 2 * TL > v.y1 * TL);
  const on = rects.filter(([x, y, w, h]) => x + w > v.x0 * TL && x < v.x1 * TL && y + h > v.y0 * TL && y < v.y1 * TL);
  ck('theBuildingLoopDrawsNothingOffScreen', off.length === 0 && on.length > 3,
    rects.length + ' blits, ' + on.length + ' on screen, ' + off.length + ' far off it (of ' + S.buildings.length + ' fog-visible buildings)');

  // ---- 4. …and the cull is invisible: frozen time, cull off vs on ----
  const pn = performance.now, dn = Date.now, mr = Math.random, VT = R.viewTiles;
  const keep = {}; for (const kk of ['smoke', 'ambient']) if (Array.isArray(R[kk])) keep[kk] = structuredClone(R[kk]);
  const frame = () => {
    for (const kk in keep) R[kk] = structuredClone(keep[kk]);
    let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    R.draw(0);
    const d = R.cv.getContext('2d').getImageData(0, 0, R.cv.width, R.cv.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0; return h;
  };
  let differ = 0, unstable = 0, frames = 0;
  performance.now = () => 777777; Date.now = () => 1700000000000;
  try {
    const cams = [[CFG.W / 2, CFG.H / 2, 1.7], [12, CFG.H - 4, 1.7], [18, CFG.H - 3, 3.5], [CFG.W / 2, CFG.H / 2, 0.5]];
    // straddle the camera edge round a spread of buildings
    S.buildings.filter((z, i) => i % 11 === 0).forEach(z => { for (const [dx, dy] of [[6, 0], [-6, 0], [0, 10], [0, -10]]) cams.push([z.x + dx, z.y + dy, 1.7]); });
    for (const [x, y, z] of cams) {
      R.cam.z = z; R.centerOn(x, y); R.clampCam && R.clampCam();
      R.viewTiles = () => ({ x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }); frame(); const all = frame();
      R.viewTiles = VT; frame(); const cut = frame();
      R.viewTiles = () => ({ x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }); const again = frame();
      frames++; if (all !== again) unstable++; else if (all !== cut) differ++;
    }
  } finally { performance.now = pn; Date.now = dn; Math.random = mr; R.viewTiles = VT; G.visibleAt = vis; }
  ck('theCullIsInvisible', differ === 0 && unstable === 0 && frames > 10,
    frames + ' frozen frames, ' + differ + ' differ with the cull on, ' + unstable + ' unstable');
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FRAME-HOTPATH CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs);
await b.close();
process.exit(out.fails.length || realErrs.length ? 1 : 0);
