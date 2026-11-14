/* DOCK-SHORE CONTRACT — a dock stands on its shore (operator, build 170:
   "docks don't look integrated into the land, there's a visible stop of
   water between the dock and land, please fix so the dock is anchored to the
   land. Make sure it works for all three levels").

   The jetty is drawn on the 2×2 of water it stands on. Its land end sat a
   few pixels in from the plot's edge, the traced coast rounds every corner,
   and a flank that was land on ONE tile only had the deck butting half into
   the water beside it — so a strip of water showed between the boards and
   the bank. Three rules now:

     1  the FULLER flank is the shore (two land tiles beat one), ties N→S→W→E
        as before — still a question of the tiles alone (Bld.dockShore)
     2  on a half-land flank the jetty slides across onto the land tile
        (Bld.dockLat, R.DOCK_SEAT.LAT)
     3  the picture is seated toward the shore (R.DOCK_SEAT.IN), so its land
        end — the log sill at L1, the stone footing at L2 and L3 — stands ON
        the bank, in every facing, at every level, finished or a site

   A picture only: the dock's tiles, block grid and siting are unchanged.

     node tests/dock-shore.mjs      # exits non-zero on any regression
*/
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof G !== 'undefined' && G.newGame && typeof R !== 'undefined', null, { timeout: 30000 });
const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  G.newGame('dock-shore', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  const TL = CFG.TILE;
  /* A constructed shore: a lake of open water, with land laid along one flank
     of a 2×2 at (x0, y0) — the whole flank, or one tile of it */
  const x0 = 12, y0 = 12;
  const scene = (side, tiles) => {
    S.buildings = S.buildings.filter(o => o.key === 'tc');
    for (let y = y0 - 5; y <= y0 + 6; y++) for (let x = x0 - 5; x <= x0 + 6; x++)
      S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    const flank = { n: [[0, -1], [1, -1]], s: [[0, 2], [1, 2]], w: [[-1, 0], [-1, 1]], e: [[2, 0], [2, 1]] }[side];
    for (const k of tiles) {
      const [dx, dy] = flank[k];
      // a bank three tiles deep behind the flank tile, so it is plainly land
      for (let j = 0; j < 3; j++) {
        const ox = side === 'w' ? -j : side === 'e' ? j : 0, oy = side === 'n' ? -j : side === 's' ? j : 0;
        S.map.terrain[MapGen.idx(x0 + dx + ox, y0 + dy + oy)] = T.GRASS;
      }
    }
    Bld._block = null;
    const d = Bld.place('P', 'dock', x0, y0, { free: true, instant: true });
    Bld._block = null;
    return d;
  };
  // where the picture's land edge lands, in tiles past the plot's own edge (+ = onto the bank)
  const seat = (d, spr, side) => {
    const bw = Bld.size(d) * TL, r = R.artRect(spr, x0 * TL, y0 * TL, bw, bw);
    const reach = side === 'n' ? (y0 * TL - r.y) : side === 's' ? (r.y + r.h - (y0 * TL + bw))
      : side === 'w' ? (x0 * TL - r.x) : (r.x + r.w - (x0 * TL + bw));
    return { reach: reach / TL, r };
  };
  // the jetty's middle across its shore, in world px, from the picture's opaque land edge
  const edgeInk = (spr, side) => {
    const c = spr.getContext ? spr : null;
    if (!c) return null;
    const W = c.width, H = c.height, px = c.getContext('2d').getImageData(0, 0, W, H).data;
    const at = (x, y) => px[(y * W + x) * 4 + 3] > 200;
    let n = 0, sum = 0;
    for (let i = 0; i < (side === 'n' || side === 's' ? W : H); i++) {
      let hit = false;
      for (let j = 0; j < 4 && !hit; j++) {
        const x = side === 'w' ? j : side === 'e' ? W - 1 - j : i;
        const y = side === 'n' ? j : side === 's' ? H - 1 - j : i;
        if (at(x, y)) hit = true;
      }
      if (hit) { n++; sum += i; }
    }
    return { n, mid: n ? sum / n / (side === 'n' || side === 's' ? W : H) : null };
  };
  const SIDES = ['n', 's', 'w', 'e'];
  const rows = [];
  let badSeat = [], badInk = [], badLat = [], badShore = [], badSite = [];
  for (const side of SIDES) for (const tiles of [[0, 1], [0], [1]]) {
    const d = scene(side, tiles);
    if (!d) { badShore.push(side + tiles.join('')); continue; }
    if (Bld.dockShore(d) !== side) badShore.push(`${side}${tiles.join('')}→${Bld.dockShore(d)}`);
    const lat = (Bld.dockLat ? Bld.dockLat(d) : 9), want = tiles.length === 2 ? 0 : tiles[0] === 0 ? -1 : 1;
    if (lat !== want) badLat.push(`${side}${tiles.join('')}: ${lat}≠${want}`);
    for (const lv of [1, 2, 3]) {
      d.level = lv;
      const spr = R.bldSprite(d), s = seat(d, spr, side);
      // the land edge stands on the bank — at least a sixth of a tile onto it
      if (!(s.reach >= 0.18)) badSeat.push(`${side}${tiles.join('')} L${lv}: ${s.reach.toFixed(2)}`);
      // …and something is drawn there the width of the deck: the footing
      const ink = edgeInk(spr, side);
      if (!ink || ink.n < 30) badInk.push(`${side}${tiles.join('')} L${lv}: ${ink && ink.n}px`);
      // the jetty's land end sits over a land tile (the middle of the inked edge)
      if (ink && ink.mid != null) {
        const across = side === 'n' || side === 's'
          ? (s.r.x + ink.mid * s.r.w) / TL : (s.r.y + ink.mid * s.r.h) / TL;
        const tx = side === 'n' || side === 's' ? Math.floor(across) : (side === 'w' ? x0 - 1 : x0 + 2);
        const ty = side === 'n' || side === 's' ? (side === 'n' ? y0 - 1 : y0 + 2) : Math.floor(across);
        if (!Path.passable(tx, ty, 'P')) badLat.push(`${side}${tiles.join('')} L${lv}: lands on (${tx},${ty}), water`);
      }
      rows.push(`${side}${tiles.join('')}L${lv}:${s.reach.toFixed(2)}`);
    }
    // a work site wears the same seat (its stage art, R.dockPic)
    d.level = 1; d.construction = 1; d.buildTotal = 3;
    const st = (R.dockPic ? R.dockPic(Sprites.dockBuildFace[side][0], d, side) : Sprites.dockBuildFace[side][0]);
    if (!(seat(d, st, side).reach >= 0.18)) badSite.push(side + tiles.join(''));
    d.construction = 0;
  }
  ck('theFullerFlankIsTheShore', !badShore.length, badShore.join('; ') || 'every constructed flank read as its own side');
  ck('aHalfLandFlankSlidesTheJettyOntoTheLand', !badLat.length, badLat.join('; ') || 'the deck lands on a land tile in every case');
  ck('theDockStandsOnItsShoreAtEveryLevel', !badSeat.length, badSeat.join('; ') || rows.slice(0, 6).join(' '));
  ck('andItsFootingIsDrawnThere', !badInk.length, badInk.join('; ') || 'sill / footing inked across the land edge, L1-L3');
  ck('aSiteStandsWhereTheDockWill', !badSite.length, badSite.join('; ') || 'every facing');
  // a picture only: the block grid, the siting and the tiles are the tiles'
  {
    const d = scene('s', [0, 1]);
    const blk = []; for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 2; x++) blk.push(Path.passable(x, y, 'P') ? 1 : 0, Path.passable(x, y, 'P', 'water') ? 1 : 0);
    ck('aPictureOnly', blk.join('') === '01010101' && Bld.at(x0, y0) === d && Bld.at(x0 - 1, y0) == null,
      `land/naval passability on the quay ${blk.join('')}`);
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL DOCK-SHORE CHECKS PASS');
const real = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', real);
await b.close();
process.exit(out.fails.length || real.length ? 1 : 0);
