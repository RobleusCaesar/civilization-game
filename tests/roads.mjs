/* THE ROAD BUILDER — js/roads.js (operator, 2026-11-03: "allowing people to
   draw lines and create roads between buildings… look real, worn, embedded in
   the ground… Remove the previous feature… where roads are created
   automatically… a villager builds them… less than the time for a wall…
   Fairly cheap… a small speed boost for their soldiers and villagers… steer
   towards using the roads… next to huts / houses in the build menu… flow
   seamlessly… intersections and roads turning… north south and east west (no
   diagonals)").

   Served over HTTP (the road painter reads its own canvases back). Pinned:

     THE BUTTON        Road sits beside House; it arms the wall's line drag
     THE LINE          a drag lays orthogonal tiles only; refused ground is
                       refused (water, a wood, a building, the rival's hand)
     CHEAP AND QUICK   a road costs less than a wall and rises in under a
                       wall's time, and the price is paid a tile at a time
     A VILLAGER BUILDS IT, in the real build task, and the finished site
                       leaves the buildings and becomes ground: no building,
                       the same passability, spent ground paved to grass
     QUICKER           the player's units walk CFG.ROADS.speed as fast on it;
                       the rival's do not
     IT CALLS          a player's route bends onto a road; the rival's does not
     THE WORN PATHS STAND DOWN while roads are on
     THE PICTURE       ground under every road tile; a straight run joins its
                       neighbour with no seam; a turn reaches its two sides and
                       a crossroads all four; no two tiles alike; decor at the
                       edges, never over water
     THROUGH THE GATE  every gate of the player's carries the hall's road down its
                       passage and a tile out either side; a road beside it never
                       turns into its flank; nothing is laid in the save; the
                       fort's road strip is the stand-in (builder off, the rival)
     A HOUSE TAKES THE GROUND; A SAVE KEEPS THE ROADS
     WORTH BUILDING TO (§10, build 153) a finished building of the player's
                       that meets a road EDGE-ON works a tenth better, each
                       kind its own way (CFG.ROADS.boosts — every kind
                       audited): a station's day, the HUD's sum and the work
                       line × 1.1; a yard (the hall too) trains and a post's
                       caravans come home 1.1× as fast, its panel counting the
                       days at that pace; a fort takes 1/1.1 of a blow (the
                       number floated the number taken); a house holds one
                       more. A bonded farm or house keeps the bond, never
                       both; a corner is no door; a site has none until it
                       stands; the rival's never; built over or dug away it
                       goes. The panel says so in gold, the placement chip
                       promises it, a twinkle marks the moment it starts (once,
                       small, gone in about a second); the save carries nothing new
     OFF IS OFF        CFG.ROADS.ON false: no button, no road, worn paths back

   Run after touching: js/roads.js, CFG.ROADS / CFG.BUILDINGS.road, UI.isLine and
   the wall drag, Bld.canPlace / finish / place, Units.wearPrefer / moveTo,
   G.noteWear / wearLevel, R.draw's building pass. */
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
const p = await b.newPage({ viewport: { width: 600, height: 760 } });
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await p.goto(base);
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });

// a world with an open meadow to lay roads on, a pond and a wood beside it
const W0 = await p.evaluate(() => {
  G.newGame('roads-1', 'moderate', 'medium'); Screens._demo = false;
  const W = CFG.W, H = CFG.H, t = S.map.terrain;
  let RX = 0, RY = 0, best = -1;
  for (let y = 2; y < H - 16; y++) for (let x = 2; x < W - 16; x++) {
    let n = 0; for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) if (t[(y + j) * W + x + i] === T.GRASS) n++;
    if (n > best) { best = n; RX = x; RY = y; }
  }
  for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) { const k = (RY + j) * W + RX + i; t[k] = T.GRASS; if (S.map.resAmount) S.map.resAmount[k] = 0; }
  t[(RY + 1) * W + RX + 12] = T.WATER; t[(RY + 1) * W + RX + 13] = T.WATER;      // a pond
  t[(RY + 3) * W + RX + 12] = T.FOREST;                                          // a tree
  t[(RY + 6) * W + RX + 1] = T.STUMPS;                                           // spent ground
  S.units = []; S.garrison = [];
  S.buildings = S.buildings.filter(o => !(o.x >= RX - 2 && o.x < RX + 16 && o.y >= RY - 2 && o.y < RY + 16));
  Bld._block = null; R.rebuildTerrain();
  Screens.show('playing'); S.paused = true;
  G.freeVis = true; for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1; G.updateVisibility();
  R.cam.z = 1.4; R.centerOn(RX + 7, RY + 7);
  S.res.wood = 10000; S.res.stone = 10000; S.res.food = 10000;
  return { RX, RY };
});
const { RX, RY } = W0;

// ---- the button, the line --------------------------------------------------------
{
  const r = await p.evaluate(() => {
    const keys = UI.MENU_KEYS, btn = document.querySelector('.bbtn[data-key="road"]');
    if (btn) btn.click();
    const armed = UI.placing, ghost = !!UI.placeGhost;
    UI.placing = null; UI.refreshMenu && UI.refreshMenu();
    return { after: keys[keys.indexOf('house') + 1], btn: !!btn, armed, ghost };
  });
  ck('theRoadSitsBesideTheHouse', r.after === 'road' && r.btn, JSON.stringify(r));
  ck('andArmsTheLineDrag', r.armed === 'road' && !r.ghost, JSON.stringify(r));
}
{
  const r = await p.evaluate(({ RX, RY }) => {
    UI.placing = 'road'; UI.wallDrag = [{ x: RX + 1, y: RY + 2 }];
    UI.extendWallDrag({ x: RX + 9, y: RY + 6 });                       // a diagonal drag
    const chain = UI.wallDrag.slice();
    const ortho = chain.every((c, i) => !i || Math.abs(c.x - chain[i - 1].x) + Math.abs(c.y - chain[i - 1].y) === 1);
    UI.wallDrag = null; UI.wallGhost = null; UI.placing = null;
    const refuse = {
      water: Bld.canPlace('P', 'road', RX + 12, RY + 1).code, wood: Bld.canPlace('P', 'road', RX + 12, RY + 3).code,
      rival: Bld.canPlace('A', 'road', RX + 2, RY + 2).code, open: Bld.canPlace('P', 'road', RX + 2, RY + 2).ok
    };
    const d = CFG.BUILDINGS.road.levels[0], wl = CFG.BUILDINGS.wall.levels[0];
    const price = o => Object.values(o).reduce((a, v) => a + v, 0);
    return { n: chain.length, ortho, refuse, cost: price(d.cost), wood: d.cost.wood, stone: d.cost.stone, wallCost: price(wl.cost), time: d.time, wallTime: wl.time };
  }, { RX, RY });
  ck('aDragLaysOrthogonalTilesOnly', r.ortho && r.n >= 12, `${r.n} tiles, every step north-south or east-west: ${r.ortho}`);
  ck('refusedGroundIsRefused', r.refuse.water === 'ground' && r.refuse.wood === 'ground' && r.refuse.rival === 'owner' && r.refuse.open === true, JSON.stringify(r.refuse));
  // the operator's price (2026-11-04): ten wood and five stone a tile, still under a wall's
  ck('aRoadIsCheaperAndQuickerThanAWall', r.wood === 10 && r.stone === 5 && r.cost < r.wallCost && r.time < r.wallTime / 2, `road ${r.wood} wood + ${r.stone} stone in ${r.time} days; wall ${r.wallCost} in ${r.wallTime}`);
}

// ---- a villager builds it, and it becomes ground ------------------------------------
{
  const r = await p.evaluate(({ RX, RY }) => {
    const pass = () => { let h = 0; for (let y = RY - 1; y < RY + 15; y++) for (let x = RX - 1; x < RX + 15; x++) h = (h * 31 + (Path.passable(x, y, 'P') ? 1 : 0) + (Path.passable(x, y, 'A') ? 2 : 0)) | 0; return h; };
    const before = pass(), res0 = { wood: S.res.wood, stone: S.res.stone };
    const v = Units.spawn('villager', 'P', RX + 0.5, RY + 5.5);
    UI.placing = 'road'; UI.wallDrag = [{ x: RX + 1, y: RY + 6 }]; UI.extendWallDrag({ x: RX + 5, y: RY + 6 }); UI.commitWallDrag();
    UI.wallDrag = null; UI.wallGhost = null;
    const sites = S.buildings.filter(o => o.key === 'road').length;
    const paid = { wood: res0.wood - S.res.wood, stone: res0.stone - S.res.stone };
    // the real sim: the build task, a fiftieth of a second at a time
    let days = 0; const dt = 0.05;
    for (let k = 0; k < 40000 && S.buildings.some(o => o.key === 'road'); k++) { Units.update(dt); days += dt * 1000 / CFG.DAY_MS; }
    const roads = [1, 2, 3, 4, 5].filter(i => Roads.at(RX + i, RY + 6)).length;
    return { sites, paid, left: S.buildings.filter(o => o.key === 'road').length, roads, days: +days.toFixed(2),
      bldAt: !!Bld.at(RX + 2, RY + 6), samePass: pass() === before, paved: S.map.terrain[(RY + 6) * CFG.W + RX + 1] === T.GRASS,
      decay: !!(S.map.decay && S.map.decay[(RY + 6) * CFG.W + RX + 1]), builder: !!v };
  }, { RX, RY });
  ck('theLineIsPaidATileAtATime', r.sites === 5 && r.paid.wood === 50 && r.paid.stone === 25, JSON.stringify({ sites: r.sites, paid: r.paid }));
  ck('aVillagerBuildsItInTheRealBuildTask', r.builder && r.left === 0 && r.roads === 5, `${r.roads} of 5 roads in ${r.days} game days`);
  ck('andTheFinishedRoadIsGroundNotABuilding', !r.bldAt && r.samePass, JSON.stringify({ bldAt: r.bldAt, samePass: r.samePass }));
  ck('spentGroundIsPavedAndStopsRegrowing', r.paved && !r.decay, JSON.stringify({ paved: r.paved, decay: r.decay }));
}

// ---- quicker, and it calls the walker ------------------------------------------------
{
  const r = await p.evaluate(({ RX, RY }) => {
    for (let i = 0; i < 12; i++) S.map.roads[(RY + 10) * CFG.W + RX + 1 + i] = 1;
    Roads._n = -1;
    // speed: a unit walking east one tile, on the road and on the grass beside it
    const walk = (owner, y) => {
      const u = Units.spawn('villager', owner, RX + 2.5, y + 0.5); u.path = [{ x: RX + 9, y }]; u.pathI = 0;
      const x0 = u.x; for (let k = 0; k < 10; k++) Units.followPath(u, 0.05);
      const d = u.x - x0; S.units.splice(S.units.indexOf(u), 1); return d;
    };
    const onP = walk('P', RY + 10), offP = walk('P', RY + 12), onA = walk('A', RY + 10), offA = walk('A', RY + 12);
    // route: from the road's row two tiles up, to its far end two tiles up — the road runs two rows below
    const route = owner => { const u = Units.spawn('villager', owner, RX + 1.5, RY + 8.5); Units.setPath(u, RX + 12, RY + 8);
      const on = (u.path || []).filter(q => Roads.at(q.x, q.y)).length; S.units.splice(S.units.indexOf(u), 1); return on; };
    return { onP, offP, onA, offA, ratio: +(onP / offP).toFixed(3), rival: +(onA / offA).toFixed(3), routeP: route('P'), routeA: route('A') };
  }, { RX, RY });
  ck('thePlayersPeopleWalkFasterOnARoad', Math.abs(r.ratio - 1.2) < 0.03, `on/off the road: ${r.ratio}`);
  ck('andTheRivalsDoNot', Math.abs(r.rival - 1) < 0.01, `rival on/off: ${r.rival}`);
  ck('aPlayersRouteBendsOntoTheRoad', r.routeP >= 6 && r.routeA === 0, `road steps on the player's route ${r.routeP}, the rival's ${r.routeA}`);
}

// ---- the worn paths stand down --------------------------------------------------------
{
  const r = await p.evaluate(({ RX, RY }) => {
    const v = Units.spawn('villager', 'P', RX + 7.5, RY + 3.5); v.task = { type: 'gather', x: RX + 7, y: RY + 3 };
    G._wearToday = null; G.noteWear(v, RX + 7, RY + 3);
    S.map.wear = S.map.wear || {}; S.map.wear[(RY + 3) * CFG.W + RX + 8] = [30, S.day];
    const out = { stamped: !!(G._wearToday && G._wearToday.size), level: G.wearLevel(RX + 8, RY + 3), count: G.countWearRoads() };
    delete S.map.wear[(RY + 3) * CFG.W + RX + 8]; S.units.splice(S.units.indexOf(v), 1);
    return out;
  }, { RX, RY });
  ck('theWornPathsStandDownWhileRoadsAreOn', !r.stamped && r.level === 0 && r.count === 0, JSON.stringify(r));
}

// ---- the picture -------------------------------------------------------------------------
{
  // a turn and a crossroads beside the straight run at row 10
  await p.evaluate(({ RX, RY }) => {
    const m = S.map.roads, W = CFG.W;
    for (const [x, y] of [[4, 11], [4, 12], [4, 9], [4, 8], [9, 11], [9, 12], [10, 12]]) m[(RY + y) * W + RX + x] = 1;
    window.__lv0 = Bld.tcOf('P').level; Bld.tcOf('P').level = 2;      // the geometry below is the packed-earth road's
    Roads._n = -1; Roads._c.clear();
  }, { RX, RY });
  await p.evaluate(() => new Promise(r => { let k = 0; const f = () => (++k >= 40 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const r = await p.evaluate(({ RX, RY }) => {
    const C = CFG.TILE * 2, e = (x, y) => Roads._c.get((RY + y) * CFG.W + RX + x);
    const alpha = (cv, x, y) => cv.getContext('2d').getImageData(x, y, 1, 1).data[3];
    const col = (cv, x) => { const d = cv.getContext('2d').getImageData(x, 0, 1, C).data, o = []; for (let y = 0; y < C; y++) o.push(d[y * 4 + 3] ? 1 : 0); return o; };
    // a straight run: the band leaving tile 6 east is the band entering tile 7 west
    const a = e(6, 10), b2 = e(7, 10);
    let seam = -1; if (a && b2) { const L = col(a.surf, C - 1), Rr = col(b2.surf, 0); seam = L.reduce((s, v, i) => s + (v !== Rr[i] ? 1 : 0), 0); }
    // which sides a tile's ground reaches: the middle of each edge
    const reach = t => t ? ['N', 'E', 'S', 'W'].filter((s, i) => alpha(t.surf, [C / 2, C - 1, C / 2, 0][i], [0, C / 2, C - 1, C / 2][i]) > 0).join('') : null;
    // no two straight tiles alike
    const sig = t => { const d = t.surf.getContext('2d').getImageData(0, 0, C, C).data; let h = 2166136261; for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; };
    const straight = [2, 3, 5, 6, 7].map(x => e(x, 10)).filter(Boolean).map(sig);
    // decor never over water: the pond is two rows above nothing — check the decor of every cached tile lies on open ground or road
    let bad = 0;
    for (const [i, en] of Roads._c) { const d = en.dec; if (!d) continue;
      const px = d.cv.getContext('2d').getImageData(0, 0, d.cv.width, d.cv.height).data;
      for (let k = 0; k < px.length; k += 4) { if (!px[k + 3]) continue;
        const tx = Math.floor((d.x + ((k / 4) % d.cv.width + 0.5) * d.w / d.cv.width) / CFG.TILE), ty = Math.floor((d.y + (((k / 4 / d.cv.width) | 0) + 0.5) * d.h / d.cv.height) / CFG.TILE);
        const t = S.map.terrain[ty * CFG.W + tx]; if (t === T.WATER) bad++; } }
    return { seam, straightRun: reach(e(6, 10)), cross: reach(e(4, 10)), tee: reach(e(9, 10)), turn: reach(e(9, 12)), unique: new Set(straight).size, of: straight.length, bad, cached: Roads._c.size };
  }, { RX, RY });
  // the two columns either side of the edge are neighbours on one wandering band: each of its two
  // edges may step a cell between them, exactly as between any two columns inside a tile
  ck('aStraightRunJoinsItsNeighbourWithNoSeam', r.seam >= 0 && r.seam <= 2, 'cells that differ across the shared edge: ' + r.seam + ' (a wandering edge steps at most a cell)');
  ck('aCrossroadsReachesAllFourSidesATurnItsTwo', r.straightRun === 'EW' && r.cross === 'NESW' && r.tee === 'ESW' && r.turn === 'NE',
    JSON.stringify({ straight: r.straightRun, cross: r.cross, tee: r.tee, turn: r.turn }));
  ck('noTwoTilesAlike', r.of >= 4 && r.unique === r.of, `${r.unique} distinct of ${r.of} straight tiles`);
  ck('andNothingGrowsOverTheWater', r.bad === 0, 'decor cells over water: ' + r.bad);
}

// ---- the roads follow the hall ---------------------------------------------------------
/* operator, 2026-11-04: "Show me designs for level 1, 2 and 3. Have roads upgrade when
   town center upgrades (no cost), like villagers. Make the current road level 2, create a
   more rural road (more like a worn path), and then a level 3 that's like a Roman road.
   Come up with a better icon for the road in the build menu." */
{
  const r = await p.evaluate(async ({ RX, RY }) => {
    const tc = Bld.tcOf('P'), C = CFG.TILE * 2, out = {};
    const frames = n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const e = (x, y) => Roads._c.get((RY + y) * CFG.W + RX + x);
    const px = t => t.surf.getContext('2d').getImageData(0, 0, C, C).data;
    const res0 = JSON.stringify(S.res);
    for (const lv of [1, 2, 3]) {
      tc.level = lv; await frames(30);
      const t = e(5, 10), a = e(6, 10), b2 = e(7, 10), d = t && px(t);
      let fill = 0, kerb = 0, mortar = 0, h = 2166136261;
      if (d) for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue; fill++;
        if (d[i] === 0xb6 && d[i + 1] === 0xac && d[i + 2] === 0x97) kerb++;           // a kerb block's face
        if (d[i] === 0x3a && d[i + 1] === 0x39 && d[i + 2] === 0x35) mortar++;         // the via's mortar
        h = Math.imul(h ^ (d[i] + d[i + 1] * 7 + d[i + 2] * 13), 16777619);
      }
      let seam = -1;
      if (a && b2) { const L = a.surf.getContext('2d').getImageData(C - 1, 0, 1, C).data, Rr = b2.surf.getContext('2d').getImageData(0, 0, 1, C).data; seam = 0; for (let y = 0; y < C; y++) if (!!L[y * 4 + 3] !== !!Rr[y * 4 + 3]) seam++; }
      // the same quickening at every level
      const walk = y => { const u = Units.spawn('villager', 'P', RX + 2.5, y + 0.5); u.path = [{ x: RX + 9, y }]; u.pathI = 0;
        const x0 = u.x; for (let k = 0; k < 10; k++) Units.followPath(u, 0.05); const dd = u.x - x0; S.units.splice(S.units.indexOf(u), 1); return dd; };
      out[lv] = { level: Roads.level(), key: t ? t.k.slice(-1) : null, fill, kerb, mortar, sig: h >>> 0, seam,
        speed: +(walk(RY + 10) / walk(RY + 12)).toFixed(3), card: UI.menuIconSprite('road') === Sprites.building.road[lv - 1] };
    }
    tc.level = window.__lv0;
    const cards = Sprites.building.road.map(c => c.toDataURL());
    return { out, free: JSON.stringify(S.res) === res0, cards: new Set(cards).size, cardPx: Sprites.building.road.map(c => c.width + 'x' + c.height).join(' ') };
  }, { RX, RY });
  const o = r.out;
  ck('theRoadsFollowTheHall', [1, 2, 3].every(l => o[l].level === l && o[l].key === String(l)), [1, 2, 3].map(l => `hall ${l}: road ${o[l].level}, painted ${o[l].key}`).join(' · '));
  ck('andRiseWithItForNothing', r.free, 'no resource moved while the roads changed');
  ck('eachLevelIsItsOwnRoad', new Set([1, 2, 3].map(l => o[l].sig)).size === 3 && o[1].fill < o[2].fill && o[2].fill < o[3].fill,
    'cells filled on one straight tile: worn track ' + o[1].fill + ', earth road ' + o[2].fill + ', via ' + o[3].fill);
  ck('theViaIsKerbedAndMortaredStone', o[3].kerb > 30 && o[3].mortar > 30 && o[2].kerb === 0 && o[1].kerb === 0, `via: ${o[3].kerb} kerb, ${o[3].mortar} mortar cells`);
  ck('andTheViaRunsOnWithNoSeam', o[3].seam >= 0 && o[3].seam <= 2, 'cells that differ across the shared edge: ' + o[3].seam);
  ck('theQuickeningIsTheSameAtEveryLevel', [1, 2, 3].every(l => Math.abs(o[l].speed - 1.2) < 0.03), [1, 2, 3].map(l => o[l].speed).join(' / '));
  ck('theRoadCardFollowsTheHall', [1, 2, 3].every(l => o[l].card) && r.cards === 3, `three cards (${r.cardPx}), the menu shows the hall's`);
}

// ---- the road goes through the gate -----------------------------------------------------
/* operator, 2026-11-04, on a gate with a road either side and grass in its passage: "make
   sure that the road goes through. Or just maybe make it a road regardless to keep it
   simple. Gates won't always be the same level of development as the road, so we'll need
   to make sure the gate road matches the current player road level". */
{
  const r = await p.evaluate(async ({ RX, RY }) => {
    const W = CFG.W, C = CFG.TILE * 2, m = S.map.roads, tc = Bld.tcOf('P'), lv0 = tc.level;
    const frames = n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const put = (k, x, y, lv) => { const o = Bld.place('P', k, RX + x, RY + y, { free: true, instant: true }); if (o && o.construction > 0) Bld.finish(o); if (o) { o.level = lv || 1; if (k === 'gate') o.raised = false; } Bld._block = null; return o; };
    // an east-west wall with a gate: a road up to it from the north, one from the south (the report)
    for (let x = 2; x <= 8; x++) put(x === 6 ? 'gate' : 'wall', x, 4);
    for (const [x, y] of [[6, 2], [6, 3], [6, 6], [6, 7]]) m[(RY + y) * W + RX + x] = 1;
    // a north-south wall with a gate and no road at all
    for (let y = 1; y <= 8; y++) put(y === 5 ? 'gate' : 'wall', 11, y);
    // a gate at the END of a line with a road beside its open flank
    for (let x = 1; x <= 3; x++) put('wall', x, 12); const endGate = put('gate', 4, 12); m[(RY + 12) * W + RX + 5] = 1;
    Roads._n = -1; Roads._c.clear();
    const e = (x, y) => Roads._c.get((RY + y) * W + RX + x);
    const alpha = (cv, x, y) => cv.getContext('2d').getImageData(x, y, 1, 1).data[3];
    const reach = t => t ? ['N', 'E', 'S', 'W'].filter((s, i) => alpha(t.surf, [C / 2, C - 1, C / 2, 0][i], [0, C / 2, C - 1, C / 2][i]) > 0).join('') : null;
    const out = { lv: {} };
    for (const lv of [1, 2, 3]) {
      tc.level = lv; await frames(20);
      const g = e(6, 4);
      out.lv[lv] = { key: g ? g.k.slice(-1) : null, gateLv: Bld.at(RX + 6, RY + 4).level };
    }
    tc.level = 2; await frames(20);
    out.ewGate = reach(e(6, 4)); out.north = reach(e(6, 3)); out.apron = reach(e(6, 5)); out.south = reach(e(6, 6));
    out.nsGate = reach(e(11, 5)); out.nsAprons = [reach(e(10, 5)), reach(e(12, 5))];
    out.endGate = reach(e(4, 12)); out.beside = reach(e(5, 12)); out.endAxis = Roads.gateRoads().get((RY + 12) * W + RX + 4);
    // a picture only: no road is laid, the gate's rules are the gate's
    const gi = (RY + 4) * W + RX + 6;
    out.rules = !Roads.at(RX + 6, RY + 4) && !m[gi] && !m[(RY + 5) * W + RX + 6];
    // the fort's own road strip stands down under the player's gate, and comes back with the builder off
    const ns = Bld.at(RX + 11, RY + 5);
    for (let k = 0; k < 60 && !R.gapGate(ns); k++) await frames(10);
    const snap = () => { R.ambient = []; R.draw(0); return R.g.getImageData(0, 0, R.cv.width, R.cv.height).data; };
    const z = R.cam.z * (R.dpr || 1), x0 = Math.ceil(((RX + 10) * CFG.TILE - R.cam.x) * z), x1 = Math.floor(((RX + 13) * CFG.TILE - R.cam.x) * z);
    const y0 = Math.ceil(((RY + 5) * CFG.TILE - R.cam.y) * z), y1 = Math.floor(((RY + 6) * CFG.TILE - R.cam.y) * z);
    const strip = () => { const a = snap(); const keep = Sprites.gateRoad; Sprites.gateRoad = null; const b2 = snap(); Sprites.gateRoad = keep;
      let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * R.cv.width + x) * 4; if (a[i] !== b2[i] || a[i + 1] !== b2[i + 1] || a[i + 2] !== b2[i + 2]) n++; } return n; };
    out.gap = R.gapGate(ns); out.stripOn = strip();
    CFG.ROADS.ON = false; out.stripOff = strip(); CFG.ROADS.ON = true;
    tc.level = lv0;
    return out;
  }, { RX, RY });
  ck('theRoadGoesThroughTheGate', r.ewGate === 'NS' && /S/.test(r.north || '') && r.apron === 'NS' && /N/.test(r.south || ''),
    `gate ${r.ewGate}, the road north of it ${r.north}, its apron ${r.apron}, the road south ${r.south}`);
  ck('itIsTheHallsRoadNotTheWalls', [1, 2, 3].every(l => r.lv[l].key === String(l)) && r.lv[1].gateLv === 1,
    [1, 2, 3].map(l => `hall ${l}: painted ${r.lv[l].key}`).join(' · '));
  ck('aGateWithNoRoadStillReadsAsAWayThrough', r.nsGate === 'EW' && r.nsAprons.every(a => a === 'E' || a === 'W') && r.nsAprons[0] !== r.nsAprons[1],
    `north-south gate ${r.nsGate}, its aprons ${r.nsAprons.join(' / ')}`);
  ck('aRoadBesideItNeverTurnsIntoItsFlank', r.endAxis === 'ns' && !/[EW]/.test(r.endGate || '') && !/W/.test(r.beside || ''),
    `end gate (${r.endAxis}) ${r.endGate}, the road beside it ${r.beside}`);
  ck('butNoRoadIsLaidThere', r.rules, 'no road in the save at the gate or its apron');
  ck('theFortsRoadStripIsTheStandIn', r.gap && r.stripOn === 0 && r.stripOff > 200,
    `gap gate ${r.gap}; strip pixels with the builder on ${r.stripOn}, off ${r.stripOff}`);
}

// ---- a house takes the ground; a save keeps the roads ------------------------------------
{
  const r = await p.evaluate(({ RX, RY }) => {
    const had = Roads.at(RX + 3, RY + 10);
    Bld.place('P', 'house', RX + 3, RY + 10, { free: true, instant: true });
    const gone = !Roads.at(RX + 3, RY + 10);
    const n = Object.keys(S.map.roads).length;
    G.loadJSON(G.saveJSON());
    return { had, gone, n, after: Object.keys(S.map.roads).length, at: Roads.at(RX + 5, RY + 10) };
  }, { RX, RY });
  ck('aHouseRaisedOnARoadTakesTheGround', r.had && r.gone, JSON.stringify(r));
  ck('aSaveKeepsTheRoads', r.n > 10 && r.after === r.n && r.at, JSON.stringify(r));
}

// ---- 10. A ROAD IS WORTH BUILDING TO (Bld.roadBoost — operator, build 153) ------------------
// A fresh world: an open meadow, the player's hall and nothing else of theirs, so every
// figure below is the one building's own.
const B0 = await p.evaluate(() => {
  G.newGame('roads-boost', 'moderate', 'medium'); Screens._demo = false;
  const W = CFG.W, H = CFG.H, t = S.map.terrain, hall = Bld.tcOf('P');
  let BX = 0, BY = 0, best = -1;
  for (let y = 2; y < H - 20; y++) for (let x = 2; x < W - 20; x++) {
    // the patch keeps clear of the player's own hall (and a tile round it)
    if (hall.x + 2 >= x - 1 && hall.x <= x + 18 && hall.y + 2 >= y - 1 && hall.y <= y + 18) continue;
    let n = 0; for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) if (t[(y + j) * W + x + i] === T.GRASS) n++;
    if (n > best) { best = n; BX = x; BY = y; }
  }
  for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) { const k = (BY + j) * W + BX + i; t[k] = T.GRASS; if (S.map.resAmount) S.map.resAmount[k] = 0; }
  S.units = []; S.garrison = [];
  S.buildings = S.buildings.filter(o => o.owner !== 'P' || o.key === 'tc');
  S.buildings = S.buildings.filter(o => !(o.x >= BX - 2 && o.x < BX + 20 && o.y >= BY - 2 && o.y < BY + 20));
  S.map.roads = {};
  Bld._block = null; R.rebuildTerrain();
  Screens.show('playing'); S.paused = true;
  G.freeVis = true; for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1; G.updateVisibility();
  R.cam.z = 1.4; R.centerOn(BX + 9, BY + 9);
  S.res.wood = 10000; S.res.stone = 10000; S.res.food = 10000; S.res.gold = 10000;
  window.__rb = {
    put(k, x, y, owner) { const o = Bld.place(owner || 'P', k, BX + x, BY + y, { free: true, instant: true }); Bld._block = null; return o; },
    road(x, y) { S.map.roads[(BY + y) * CFG.W + BX + x] = 1; Roads._n = -1; },
    unroad(x, y) { delete S.map.roads[(BY + y) * CFG.W + BX + x]; Roads._n = -1; },
    hand(o) { const v = Units.spawn('villager', 'P', o.x, o.y); v.x = o.x + 0.5; v.y = o.y + 0.5; v.task = { type: 'work', id: o.id }; v.path = null; return v; },
    lump(res) { const r0 = Object.assign({}, S.res); Bld.dailyProduction('P'); const n = S.res[res] - r0[res]; S.res = r0; return n; },
    sub(o) { UI.select('bld', o.id); UI.renderPanel(); const el = document.querySelector('#panel .phead .psub'); return el ? { html: el.innerHTML, text: el.textContent } : null; },
    gold(o) {
      UI.select('bld', o.id); UI.renderPanel();
      const b = [...document.querySelectorAll('#panel .phead .psub b')].find(e => /Road/.test(e.textContent));
      return b ? { text: b.textContent, col: getComputedStyle(b).color } : null;
    },
  };
  return { BX, BY };
});
const { BX, BY } = B0;
{
  // THE AUDIT: every kind of building has its road, or is left out on purpose
  const r = await p.evaluate(() => {
    const B = CFG.BUILDINGS, K = CFG.ROADS.boosts, out = { missing: [], wrong: [] };
    const left = ['road', 'wonder', 'raidercamp'];
    for (const k in B) {
      if (left.includes(k)) { if (K[k]) out.wrong.push(k + ' should be left out'); continue; }
      if (!K[k]) { out.missing.push(k); continue; }
      const want = B[k].needsWorker ? 'yield' : B[k].train ? 'pace' : k === 'trade' ? 'trade' : k === 'house' ? 'room' : ['wall', 'gate', 'tower', 'warcamp'].includes(k) ? 'guard' : '?';
      if (K[k] !== want) out.wrong.push(`${k}: ${K[k]} (want ${want})`);
    }
    out.boost = CFG.ROADS.boost; out.room = CFG.ROADS.room;
    return out;
  });
  ck('everyBuildingHasItsRoad', !r.missing.length && !r.wrong.length && r.boost === 1.1 && r.room === 1,
    r.missing.length || r.wrong.length ? `missing ${r.missing.join(', ')}; ${r.wrong.join('; ')}` : 'stations yield, yards pace (the hall too), the post trades, forts guard, a house has room — at 1.1');
}
{
  // A STATION BRINGS IN A TENTH MORE — the day's lump, the HUD's sum and the work line alike
  const r = await p.evaluate(() => {
    const cmp = __rb.put('lumber', 2, 2); const v = __rb.hand(cmp);
    const base = __rb.lump('wood'), hud0 = UI.incomePerDay('wood').total, line0 = Units.workReport(v).rate.n;
    __rb.road(3, 1);                                    // a corner touch: no door
    const corner = Bld.roadBoost(cmp);
    __rb.unroad(3, 1);
    __rb.road(3, 2);                                    // edge-on: the road meets it
    const out = { corner, kind: Bld.roadBoost(cmp), base, lump: __rb.lump('wood'), hud: UI.incomePerDay('wood').total, hud0,
      line: Units.workReport(v).rate.n, line0, gold: __rb.gold(cmp), sub: __rb.sub(cmp) };
    return out;
  });
  ck('aRoadBesideAStationBringsInATenthMore', r.kind === 'yield' && Math.abs(r.lump / r.base - 1.1) < 1e-9,
    `${r.base} → ${r.lump} wood a day`);
  ck('andTheHudAndTheWorkLineSayTheSame', Math.abs(r.hud - r.lump) < 1e-9 && Math.abs(r.hud0 - r.base) < 1e-9 && Math.abs(r.line / r.line0 - 1.1) < 1e-9,
    `HUD ${r.hud0} → ${r.hud}; the hand's line ${r.line0} → ${r.line}`);
  ck('aCornerIsNotARoadToItsDoor', r.corner === null, `diagonal only: ${r.corner}`);
  ck('itsPanelSaysSoInGold', !!r.gold && r.gold.text === '✦ Road +10% wood' && r.gold.col === 'rgb(232, 193, 90)' && !/</.test(r.sub.text) && /\+5\.5 wood\/day/.test(r.sub.text),
    `${JSON.stringify(r.gold)} — "${r.sub && r.sub.text}"`);
}
{
  // A BONDED FARM KEEPS ITS BOND, NEVER BOTH; a lone farm takes the road
  const r = await p.evaluate(() => {
    const farm = __rb.put('farm', 2, 6); __rb.hand(farm);
    const house = __rb.put('house', 3, 6);              // broadside: the homestead
    __rb.road(1, 6);                                    // …and a road on the farm's other side
    const pop0 = Bld.popCap('P');
    const both = { hs: Bld.homesteadMult(farm), road: Bld.roadMult(farm, 'yield'), houseRoad: Bld.roadBoost(house), gold: __rb.gold(farm) };
    const lumpBond = __rb.lump('food');
    __rb.road(4, 6);                                    // a road beside the bonded house too
    const popBondRoad = Bld.popCap('P');
    // the house goes: the bond with it — and the road takes over the farm, at the same tenth
    Bld.removeToRuin(house);
    const after = { hs: Bld.homesteadMult(farm), kind: Bld.roadBoost(farm), lump: __rb.lump('food'), gold: __rb.gold(farm) };
    return { both, lumpBond, after, pop0, popBondRoad };
  });
  ck('aBondedFarmTakesTheBondNotTheRoadToo', r.both.hs === 1.1 && r.both.road === 1 && r.after.kind === 'yield' && Math.abs(r.after.lump - r.lumpBond) < 1e-9,
    `bonded: homestead ×${r.both.hs}, road ×${r.both.road} (${r.lumpBond} food); the house gone: road ${r.after.kind} (${r.after.lump} food)`);
  ck('andABondedHouseHoldsOneMoreNotTwo', r.both.houseRoad === null && r.popBondRoad === r.pop0,
    `a bonded house beside a road: road ${r.both.houseRoad}, pop cap ${r.pop0} → ${r.popBondRoad}`);
  ck('theGoldLineFollowsWhoIsPaying', !r.both.gold && !!r.after.gold && r.after.gold.text === '✦ Road +10% food',
    `bonded farm's road line: ${JSON.stringify(r.both.gold)}; alone: ${JSON.stringify(r.after.gold)}`);
}
{
  // A HOUSE BESIDE A ROAD HOLDS ONE MORE
  const r = await p.evaluate(() => {
    const h = __rb.put('house', 8, 2);
    const c0 = Bld.popCap('P');
    __rb.road(8, 1);
    const c1 = Bld.popCap('P');
    return { c0, c1, kind: Bld.roadBoost(h), gold: __rb.gold(h) };
  });
  ck('aHouseBesideARoadHoldsOneMore', r.kind === 'room' && r.c1 === r.c0 + 1 && !!r.gold && r.gold.text === '✦ Road +1 villager',
    `pop cap ${r.c0} → ${r.c1}; ${JSON.stringify(r.gold)}`);
}
{
  // A YARD TRAINS A TENTH FASTER — the war halls, the hall's villagers, the sappers, the dock
  const r = await p.evaluate(() => {
    const yd = __rb.put('barracks', 11, 2);              // 2×2: 11..12, 2..3
    const tc = Bld.tcOf('P');
    const tick = o => { o.queue = [{ unit: o.key === 'tc' ? 'villager' : 'defender', t: 5 }]; Bld.update(0.1); const d = 5 - o.queue[0].t; o.queue = []; return d; };
    const d0 = tick(yd);
    __rb.road(13, 3);                                   // beside its east face
    const d1 = tick(yd);
    // the hall: a road beside its own footprint
    S.map.roads[(tc.y - 1) * CFG.W + tc.x] = 1; S.map.terrain[(tc.y - 1) * CFG.W + tc.x] = T.GRASS;
    Bld._block = null;
    const busy = Bld.at(tc.x, tc.y - 1);
    const t1 = busy ? null : tick(tc);
    delete S.map.roads[(tc.y - 1) * CFG.W + tc.x];
    const t0 = tick(tc);
    return { d0, d1, kind: Bld.roadBoost(yd), t0, t1, busy: !!busy, gold: __rb.gold(yd) };
  });
  ck('aYardTrainsATenthFaster', r.kind === 'pace' && Math.abs(r.d1 / r.d0 - 1.1) < 1e-9 && !!r.gold && r.gold.text === '✦ Road: trains 10% faster',
    `a tenth of a day's training: ${r.d0} → ${r.d1}; ${JSON.stringify(r.gold)}`);
  ck('andTheHallTrainsItsVillagersFaster', r.busy || Math.abs(r.t1 / r.t0 - 1.1) < 1e-9, r.busy ? 'the hall\'s north side was built on' : `${r.t0} → ${r.t1}`);
}
{
  // CARAVANS COME HOME A TENTH SOONER, and the post's panel counts the days at that pace
  const r = await p.evaluate(() => {
    const tp = __rb.put('trade', 2, 10);                // 2×2: 2..3, 10..11
    const tick = () => { tp.caravan = { need: 'wood', pay: 'food', cost: 80, amt: 20, t: 2, total: 2 }; Bld.update(0.1); const d = 2 - tp.caravan.t; return d; };
    const d0 = tick();
    __rb.road(4, 10);
    const d1 = tick();
    // 2.1 days of road left reads 2 at a tenth faster (3 at the plain pace), 1.05 reads 1 (2)
    tp.caravan.t = 2.1; UI.select('bld', tp.id); UI.renderPanel();
    const left = (document.getElementById('carLeft') || {}).textContent;
    tp.caravan.t = 1.05; UI.refreshPanel();
    const left2 = (document.getElementById('carLeft') || {}).textContent;
    tp.caravan = null; UI.tradeNeed = null; UI.renderPanel();
    const each = (document.getElementById('panel').textContent.match(/post, ([\d.]+)d each way/) || [])[1];
    return { d0, d1, left, left2, each, delay: Bld.tradeSpec(tp).delay, gold: __rb.gold(tp) };
  });
  ck('caravansComeHomeATenthSooner', Math.abs(r.d1 / r.d0 - 1.1) < 1e-9 && !!r.gold && r.gold.text === '✦ Road: caravans 10% faster',
    `${r.d0} → ${r.d1} of the road home a tick; ${JSON.stringify(r.gold)}`);
  ck('andThePostCountsTheDaysAtThatPace', r.left === '2d' && r.left2 === '1d' && +r.each === Math.round(r.delay / 1.1 * 10) / 10,
    `2.1d left reads ${r.left}, 1.05d reads ${r.left2}; a ${r.delay}d trip reads ${r.each}d each way`);
}
{
  // A FORT TAKES A TENTH LESS OF EVERY BLOW — the wall, the gate, the tower; the number floated is the number taken
  const r = await p.evaluate(() => {
    const wl = __rb.put('wall', 8, 6), tw = __rb.put('tower', 10, 6), gt = __rb.put('gate', 12, 6);
    const hit = o => { const h0 = o.hp; const ret = Bld.damage(o, 110, 'test'); const took = h0 - o.hp; o.hp = o.maxhp; return { ret, took }; };
    const bare = [hit(wl), hit(tw), hit(gt)];
    __rb.road(8, 7); __rb.road(10, 7); __rb.road(12, 7);
    const roaded = [hit(wl), hit(tw), hit(gt)];
    // a rival wall beside the player's road is NOT made stronger
    const rw = __rb.put('wall', 14, 6, 'A'); __rb.road(14, 7);
    const rival = hit(rw);
    return { bare, roaded, rival, kinds: [wl, tw, gt].map(o => Bld.roadBoost(o)), rk: Bld.roadBoost(rw), gold: __rb.gold(wl) };
  });
  ck('aFortTakesATenthLessOfEveryBlow', r.kinds.every(k => k === 'guard') && r.bare.every(h => h.took === 110) &&
      r.roaded.every(h => Math.abs(h.took - 100) < 1e-9 && Math.abs(h.ret - h.took) < 1e-9) && !!r.gold && r.gold.text === '✦ Road: 10% stronger',
    `a 110 blow takes ${r.bare.map(h => h.took).join('/')} bare, ${r.roaded.map(h => +h.took.toFixed(3) + ' (floats ' + +h.ret.toFixed(3) + ')').join(' / ')} beside a road; ${JSON.stringify(r.gold)}`);
  ck('andTheRivalsWallsNeverGetIt', r.rk === null && r.rival.took === 110, `a rival wall beside the player's road: ${r.rk}, takes ${r.rival.took}`);
}
{
  // THE BONUS GOES WITH THE ROAD: built over, or dug away — and a work site has none until it stands
  const r = await p.evaluate(({ BX, BY }) => {
    const yd = Bld.list('P').find(o => o.key === 'barracks');
    const had = Bld.roadBoost(yd);
    UI.select('bld', yd.id); UI.renderPanel();
    // a house raised ON the road tile takes the ground, and the bonus with it
    __rb.put('house', 13, 3);
    const builtOver = Bld.roadBoost(yd);
    UI.refreshPanel();
    const line = !!document.querySelector('#panel .phead .psub') && /Road/.test(document.querySelector('#panel .phead .psub').textContent);
    // a road dug into a trench is no road
    const cmp = Bld.list('P').find(o => o.key === 'lumber');
    const i = (BY + 2) * CFG.W + BX + 3, t0 = S.map.terrain[i];
    S.map.terrain[i] = T.TRENCH;
    const dug = Bld.roadBoost(cmp);
    S.map.terrain[i] = t0;
    const back = Bld.roadBoost(cmp);
    // a site beside a road: nothing until it stands
    __rb.road(16, 10);
    const site = Bld.place('P', 'range', BX + 14, BY + 10, { free: true }); Bld._block = null;
    const onSite = Bld.roadBoost(site);
    Bld.finish(site);
    const stood = Bld.roadBoost(site);
    return { had, builtOver, line, dug, back, onSite, stood };
  }, { BX, BY });
  ck('theBonusGoesWithTheRoad', r.had === 'pace' && r.builtOver === null && !r.line && r.dug === null && r.back === 'yield',
    `the yard: ${r.had} → built over ${r.builtOver} (gold line still there: ${r.line}); the camp dug: ${r.dug}, filled back: ${r.back}`);
  ck('aWorkSiteHasNoneUntilItStands', r.onSite === null && r.stood === 'pace', `site ${r.onSite} → finished ${r.stood}`);
}
{
  // IT TWINKLES ONCE WHEN IT STARTS: a road reaching a building, or a building finishing beside one
  const r = await p.evaluate(async ({ BX, BY }) => {
    R.roadSparks = [];
    const tw = __rb.put('tower', 2, 14);
    const lay = (x, y) => { const s = Bld.place('P', 'road', BX + x, BY + y); Bld._block = null; if (s) Bld.finish(s); return !!s; };
    const laid = lay(3, 14);                            // the first road to reach it
    const first = R.roadSparks.length;
    const laid2 = lay(2, 15);                           // a second road to the same tower: already working
    const second = R.roadSparks.length - first;
    const site = Bld.place('P', 'house', BX + 4, BY + 14, { free: true }); Bld._block = null;
    Bld.finish(site);                                   // a house finishing beside the road
    const third = R.roadSparks.length - first - second;
    const pts = R.roadSparks.slice();
    // small, and over in about a second
    const frames = n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    S.paused = false; const t0 = performance.now();
    while (R.roadSparks.length && performance.now() - t0 < 4000) await frames(5);
    const gone = performance.now() - t0; S.paused = true;
    return { laid, laid2, first, second, third, pts, gone, ms: R.ROAD_SPARK.ms, left: R.roadSparks.length, tower: [tw.x, tw.y] };
  }, { BX, BY });
  ck('itTwinklesOnceWhenTheRoadArrives', r.laid && r.laid2 && r.first === 1 && r.second === 0 && r.third === 1,
    `the first road ${r.first} twinkle, a second road ${r.second}, a house finishing beside a road ${r.third}`);
  ck('whereTheRoadMeetsIt', Math.abs(r.pts[0].x - (BX + 3)) < 1e-9 && Math.abs(r.pts[0].y - (BY + 14.5)) < 1e-9,
    `at ${JSON.stringify(r.pts[0])}, the tower's east face is x ${BX + 3}`);
  ck('andItIsSmallAndBrief', r.ms <= 1500 && r.left === 0 && r.gone < 3000, `${r.ms} ms by design; gone in ${Math.round(r.gone)} ms`);
}
{
  // THE PLACEMENT CHIP PROMISES IT ON THE SPOT, a save carries nothing new, and off is off
  const r = await p.evaluate(({ BX, BY }) => {
    UI.placing = 'barracks';
    const chip = UI.placeWouldRoad({ x: BX + 6, y: BY + 14 });   // a road at (5,14)? none — and then beside one
    __rb.road(5, 15);
    const chip2 = UI.placeWouldRoad({ x: BX + 6, y: BY + 14 });
    UI.placing = null;
    // …and the real chip says it, in the panels' gold
    UI.enterPlacement('barracks'); UI.placeGhostSet(BX + 7, BY + 15); UI._placeDomSync();   // the footprint centred on the tap: (6, 14)
    const el = document.getElementById('placeWhy');
    const shown = { text: el && el.textContent, gold: !!el && el.classList.contains('boon'), col: el && getComputedStyle(el).color,
      ghost: UI.placeGhost && [UI.placeGhost.x - BX, UI.placeGhost.y - BY] };
    UI.exitPlacement();
    const save = G.saveJSON();
    const yd = Bld.list('P').find(o => o.key === 'lumber');
    CFG.ROADS.ON = false;
    const off = Bld.roadBoost(yd), offLump = __rb.lump('wood');
    CFG.ROADS.ON = true;
    return { chip, chip2, shown, saved: /roadBoost|roadSpark|roadKind/.test(save), off, offLump, onLump: __rb.lump('wood'),
      desc: CFG.BUILDINGS.road.desc, guide: (document.getElementById('howPanels') || {}).textContent || '' };
  }, { BX, BY });
  ck('thePlacementChipPromisesItOnTheSpot', r.chip === '' && r.chip2 === '✦ Road: trains 10% faster' &&
      r.shown.text === r.chip2 && r.shown.gold && r.shown.col === 'rgb(232, 193, 90)',
    `apart: "${r.chip}"; beside a road: "${r.chip2}"; on the chip: ${JSON.stringify(r.shown)}`);
  ck('aSaveCarriesNothingNew', !r.saved, 'the bonus is derived from the roads the save already keeps');
  ck('switchedOffTheRoadsGiveNothing', r.off === null && Math.abs(r.onLump / r.offLump - 1.1) < 1e-9, `off: ${r.off}, ${r.offLump} → ${r.onLump} wood`);
  ck('theRoadCardAndTheGuideSayIt', /10% better/.test(r.desc) && /roads.*10%/s.test(r.guide), `"${r.desc}"`);
}

// ---- off is off -----------------------------------------------------------------------
{
  const r = await p.evaluate(({ RX, RY }) => {
    CFG.ROADS.ON = false;
    UI.buildMenu && UI.buildMenu();
    const out = { btn: !!document.querySelector('.bbtn[data-key="road"]'), at: Roads.at(RX + 5, RY + 10), place: Bld.canPlace('P', 'road', RX + 2, RY + 2).ok };
    S.map.wear = S.map.wear || {}; S.map.wear[(RY + 3) * CFG.W + RX + 8] = [30, S.day];
    out.wear = G.wearLevel(RX + 8, RY + 3);
    CFG.ROADS.ON = true; UI.buildMenu && UI.buildMenu();
    return out;
  }, { RX, RY });
  ck('switchedOffThereIsNoRoadAndTheWornPathsReturn', !r.btn && !r.at && !r.place && r.wear >= 2, JSON.stringify(r));
}

ck('theRoadPagesThrewNothing', errs.length === 0, errs.slice(0, 3).join(' | ') || 'no page errors');
await b.close(); srv.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL ROAD CHECKS PASS');
