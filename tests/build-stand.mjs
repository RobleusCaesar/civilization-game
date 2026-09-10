/* BUILD-STAND CONTRACT — nobody builds from the water.

   The operator's report, with the picture: a villager sawing at a lakeside
   work site while his own contact shadow sat on the lake. A builder is never
   PATHED there (Path.find only ever enqueues passable tiles), so one standing
   on water arrived some other way — a shore-fisher eased out to the water
   line when his shoal ran dry and then took the site beside him without
   needing to take a step, a save from before a rule tightened, a tile flooded
   under him. Units.buildStand does not care which: while the work is on, a
   builder stands on ground he could legally stand on.

   The rule, in the operator's words: "If there is water on one side or two
   sides of a building, then they have to stand on the side that is on land,
   even if they have to share a tile with another villager that is also doing
   the construction."

   Run this after touching any of:
     units.js — buildStand / the build branch of Units.update / assignBuild
     map.js   — Path.passable, Path.find
     buildings.js — Bld.reach / Bld.cx / Bld.cy

     node tests/build-stand.mjs      # exits non-zero on any regression      */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const wet = (u) => !Path.passable(u.x | 0, u.y | 0, u.owner, Units.domain(u));

  G.newGame('bstand', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  const W = CFG.W, H = CFG.H, t = S.map.terrain;
  const isW = (x, y) => MapGen.inB(x, y) && t[MapGen.idx(x, y)] === T.WATER;
  const open = (x, y) => MapGen.inB(x, y) && !Path.blocksLand(t[MapGen.idx(x, y)]) && !Bld.at(x, y);

  let seat = null;
  for (let y = 3; y < H - 3 && !seat; y++) for (let x = 3; x < W - 3; x++) {
    if (!open(x, y)) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isW(x + dx, y + dy)).length;
    if (n) { seat = { x, y, n }; break; }
  }
  if (!seat) { ck('aShorelineSeatExists', false, 'no shoreline seat on this map'); return { res, fails }; }

  const site = Bld.place('P', 'house', seat.x, seat.y, { free: true });
  ck('aLakesideSiteStands', !!site && site.construction > 0,
    site ? 'house raising at (' + seat.x + ',' + seat.y + '), ' + seat.n + ' wet sides' : 'place failed');
  if (!site) return { res, fails };

  const pools = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: seat.x + dx, y: seat.y + dy }))
    .filter(q => isW(q.x, q.y));
  const vills = S.units.filter(u => u.owner === 'P' && u.kind === 'villager').slice(0, 2);
  ck('twoVillagersToTest', vills.length === 2, vills.length + ' villagers');
  const dunk = (u, w, s) => {
    Units.assignBuild(u, s);
    u.path = null; u.pathI = 0;            // measure the STAND rule, not a walk
    u.x = w.x + 0.5; u.y = w.y + 0.5;
  };
  vills.forEach((u, i) => dunk(u, pools[Math.min(i, pools.length - 1)], site));
  ck('theyStartOnTheWater', vills.every(wet), 'both placed on water, tasked to build');

  const before = site.construction;
  for (let k = 0; k < 40; k++) Units.update(0.05);

  const dry = vills.filter(u => !wet(u)).length;
  ck('noBuilderStandsOnWater', dry === vills.length,
    dry + '/' + vills.length + ' on ground they could walk — ' +
    vills.map(u => '(' + (u.x | 0) + ',' + (u.y | 0) + ')').join(' '));

  const reach = 1.55 + Bld.reach(site);
  const near = vills.filter(u => Math.hypot(Bld.cx(site) - u.x, Bld.cy(site) - u.y) <= reach).length;
  ck('andStaysInWorkingRange', near === vills.length,
    near + '/' + vills.length + ' within ' + reach.toFixed(2) + ' of the site');
  ck('andTheWorkGoesOn', site.construction < before,
    'construction ' + before.toFixed(2) + ' -> ' + site.construction.toFixed(2));

  /* SHARING IS ALLOWED. Walled in to one landward tile, two builders must both
     take it rather than one of them standing in the lake. */
  G.newGame('bstand2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  const t2 = S.map.terrain;
  let sx = -1, sy = -1;
  for (let y = 6; y < H - 6 && sx < 0; y++) for (let x = 6; x < W - 6; x++) {
    let clear = true;
    for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -2; dx <= 2; dx++)
      if (t2[MapGen.idx(x + dx, y + dy)] !== T.GRASS || Bld.at(x + dx, y + dy)) { clear = false; break; }
    if (clear) { sx = x; sy = y; }
  }
  if (sx < 0) { ck('aPocketToWallIn', false, 'no clear 5x5 to carve'); return { res, fails }; }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) t2[MapGen.idx(sx + dx, sy + dy)] = T.WATER;
  const s2 = Bld.place('P', 'house', sx, sy, { free: true });
  ck('aPocketToWallIn', !!s2, s2 ? 'site at (' + sx + ',' + sy + ') with water E, W and S' : 'place failed');
  if (s2) {
    const vv = S.units.filter(u => u.owner === 'P' && u.kind === 'villager').slice(0, 2);
    for (const u of vv) dunk(u, { x: sx + 1, y: sy }, s2);
    for (let k = 0; k < 40; k++) Units.update(0.05);
    const ok = vv.filter(u => !wet(u)).length;
    const tiles = new Set(vv.map(u => (u.x | 0) + ',' + (u.y | 0)));
    ck('bothTakeTheLandwardSide', ok === vv.length,
      ok + '/' + vv.length + ' on land, on ' + tiles.size + ' tile(s): ' + [...tiles].join(' '));
    ck('andSharingIsAllowed', tiles.size === 1 && ok === 2,
      tiles.size === 1 ? 'both on the one landward tile, as the rule allows' : 'spread over ' + tiles.size);
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
if (out.fails.length) console.log('FAILURES: ' + out.fails.join(', '));
else console.log('ALL BUILD-STAND CHECKS PASS');
console.log('errors: ' + JSON.stringify(errs));
await b.close();
process.exit(out.fails.length || errs.length ? 1 : 0);
