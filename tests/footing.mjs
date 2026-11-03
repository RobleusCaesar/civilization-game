/* THE GROUND UNDER A BUILDING — js/footing.js.

   Operator, 2026-11-03: the V5 land "kinda clash[es] with the buildings (they
   really stand out) … something that makes the building look like it's part
   of the landscape versus a sticker on top of it". Six mockups were drawn in
   the real game; the pick: a cast shadow under every building, a trodden
   yard round the workplaces, a hedge round the homes and towers.

   Served over HTTP (a page from disk taints every PNG, and the footing reads
   the building's own silhouette off its art). Pinned:

     WHO WEARS WHAT     yard: the hall and every workplace; hedge: houses and a
                        free-standing tower; shadow: everything else; nothing
                        for walls, gates, the dock, a tower bonded into a wall
                        line, a work site or an upgrade
     IT IS DRAWN        R.draw lays the ground layer before any building and
                        each building's back and front around its sprite, and
                        R._redrawPic lays them again
     OPEN GROUND ONLY   the ground layer lies on grass, stumps, picked-bare soil
                        or a building's own plot — never water, and never the
                        black past the rim
     THE DOOR IS CLEAR  no bush or tuft of a hedge stands in front of the door
     A PICTURE ONLY     no rule, save byte or RNG draw moves; Math.random is
                        never called
     PACED              a frame with no budget left measures one building
     A NEW LOOK         a burning building's art re-measures its footing
     TRIMMED            each layer canvas is cut to what it holds
     OFF IS NOTHING     CFG.FOOTING.ON false: nothing measured, cached or drawn;
                        ?footing=0 stands it down for the page

   Run after touching: js/footing.js, R.draw's building pass, R._redrawPic,
   R.wornSprite, R.towerLinkMask. */
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
  const p = await b.newPage({ viewport: { width: 600, height: 760 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // nothing leaves the machine
  await p.goto(base + (q || ''));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  return p;
};
const frames = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const p = await page('');
// a town on open meadow: one of every look, a site, a bonded tower, a house by the water
const town = await p.evaluate(() => {
  G.newGame('footing-1', 'moderate', 'medium'); Screens._demo = false;
  const W = CFG.W, H = CFG.H, t = S.map.terrain;
  let RX = 0, RY = 0, best = -1;
  for (let y = 2; y < H - 16; y++) for (let x = 2; x < W - 14; x++) {
    let n = 0; for (let j = 0; j < 14; j++) for (let i = 0; i < 12; i++) if (t[(y + j) * W + x + i] === T.GRASS) n++;
    if (n > best) { best = n; RX = x; RY = y; }
  }
  for (let j = 0; j < 14; j++) for (let i = 0; i < 12; i++) t[(RY + j) * W + RX + i] = T.GRASS;
  for (let j = 1; j <= 4; j++) for (let i = 10; i <= 11; i++) t[(RY + j) * W + RX + i] = T.WATER;   // a pond by the waterside house
  S.units = []; S.garrison = [];
  const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
  S.buildings = S.buildings.filter(o => o === tc || !(o.x >= RX - 3 && o.x < RX + 15 && o.y >= RY - 3 && o.y < RY + 17));
  tc.x = RX + 3; tc.y = RY + 4; Bld._block = null;
  const put = (key, x, y, lv, site) => { const o = Bld.place('P', key, RX + x, RY + y, site ? { free: true } : { free: true, instant: true }); if (o && lv) o.level = lv; return o && o.id; };
  const ids = {
    house: put('house', 1, 1), house2: put('house', 4, 1, 2), lumber: put('lumber', 7, 1), farm: put('farm', 0, 5),
    tower: put('tower', 7, 4), barracks: put('barracks', 5, 7), trade: put('trade', 1, 10), water: put('house', 9, 2),
    site: put('house', 1, 8, 0, true), wallA: put('wall', 6, 12), bonded: put('tower', 7, 12), wallB: put('wall', 8, 12), tc: tc.id
  };
  Bld._block = null;
  R.rebuildTerrain();
  Screens.show('playing'); S.paused = true;
  G.freeVis = true; for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1; G.updateVisibility();
  R.cam.z = 1.6; R.centerOn(RX + 6, RY + 7);
  return { ids, RX, RY };
});
await p.waitForFunction(() => window.Assets && Assets.allArtReady && Assets.allArtReady(), null, { timeout: 90000 }).catch(() => {});
await frames(p, 6);
await p.evaluate(() => Footing.flush());
await frames(p, 3);

// ---- who wears what ----------------------------------------------------------
{
  const r = await p.evaluate(ids => {
    const by = id => S.buildings.find(o => o.id === id);
    const fake = key => Footing.look({ key, x: 0, y: 0, level: 1 });
    return { yard: ['tc', 'barracks', 'range', 'stable', 'siege', 'sapper', 'trade', 'warcamp', 'lumber', 'quarry', 'lodge', 'mine'].map(fake),
      hedge: ['house'].map(fake), shadow: ['farm', 'wonder', 'raidercamp'].map(fake), none: ['wall', 'gate', 'dock'].map(fake),
      tower: Footing.look(by(ids.tower)), bonded: Footing.look(by(ids.bonded)), site: Footing.look(by(ids.site)),
      upgrading: Footing.look(Object.assign({}, by(ids.house), { upgrading: 2 })) };
  }, town.ids);
  ck('theWorkplacesWearAYard', r.yard.every(v => v === 'yard'), r.yard.join(','));
  ck('theHomesAndAFreeTowerWearAHedge', r.hedge.every(v => v === 'hedge') && r.tower === 'hedge', r.hedge.join(',') + ' tower:' + r.tower);
  ck('everythingElseCastsAShadow', r.shadow.every(v => v === 'shadow'), r.shadow.join(','));
  ck('andTheFortsTheDockASiteAndABondedTowerWearNothing', r.none.every(v => v === 'none') && r.bonded === 'none' && r.site === 'none' && r.upgrading === 'none',
    JSON.stringify(r));
}

// ---- it is drawn ---------------------------------------------------------------
{
  const r = await p.evaluate(ids => {
    const by = id => S.buildings.find(o => o.id === id), e = id => Footing._c.get(id);
    const has = id => { const x = e(id); return x ? x.L.map(l => !!l) : null; };
    // earth in the yard: the packed earth's own browns, counted on the ground layer
    const earth = id => { const L = e(id) && e(id).L[0]; if (!L) return 0; const d = L.cv.getContext('2d').getImageData(0, 0, L.cv.width, L.cv.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && d[i] > d[i + 1] + 15 && d[i + 1] > d[i + 2]) n++; return n; };
    // the calls R.draw makes, counted over a frame
    const calls = { ground: 0, back: 0, front: 0 }, orig = {};
    for (const k of Object.keys(calls)) { orig[k] = Footing[k]; Footing[k] = function () { calls[k]++; return orig[k].apply(this, arguments); }; }
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const before = calls.front;
      R._redrawPic(R.ctx || document.getElementById('c').getContext('2d'), by(ids.house));
      const redraw = calls.front - before;
      for (const k of Object.keys(calls)) Footing[k] = orig[k];
      res({ house: has(ids.house), tc: has(ids.tc), farm: has(ids.farm), tower: has(ids.tower), barracks: has(ids.barracks),
        bonded: has(ids.bonded), site: has(ids.site), wall: has(ids.wallA), earthTc: earth(ids.tc), earthHouse: earth(ids.house), calls, redraw });
    })));
  }, town.ids);
  ck('everyFinishedBuildingIsMeasured', [r.house, r.tc, r.farm, r.tower, r.barracks].every(x => x && x[0]), JSON.stringify([r.house, r.tc, r.farm, r.tower, r.barracks]));
  ck('theHedgeStandsAroundTheHouseAndTheTower', r.house && (r.house[1] || r.house[2]) && r.tower && (r.tower[1] || r.tower[2]), JSON.stringify([r.house, r.tower]));
  ck('theYardIsPackedEarth', r.earthTc > 400 && r.earthHouse < r.earthTc / 4, `hall ${r.earthTc} earth cells, house ${r.earthHouse}`);
  ck('andNothingForTheWallsTheSiteOrTheBondedTower', !r.bonded && !r.site && !r.wall, JSON.stringify([r.bonded, r.site, r.wall]));
  ck('theBuildingPassLaysEveryLayer', r.calls.ground >= 1 && r.calls.back >= 5 && r.calls.front >= 5, JSON.stringify(r.calls));
  ck('andARedrawLaysThemAgain', r.redraw === 1, 'front calls in one _redrawPic: ' + r.redraw);
}

// ---- open ground only, the door clear -----------------------------------------
{
  const r = await p.evaluate(ids => {
    const TL = CFG.TILE, bad = [], seenWater = {};
    for (const [id, e] of Footing._c) {
      const L = e.L[0]; if (!L) continue;
      const d = L.cv.getContext('2d').getImageData(0, 0, L.cv.width, L.cv.height).data, w = L.cv.width;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const px = i / 4 % w, py = (i / 4 / w) | 0;
        const tx = Math.floor((L.x + (px + 0.5) * L.w / w) / TL), ty = Math.floor((L.y + (py + 0.5) * L.h / L.cv.height) / TL);
        const ter = MapGen.onBoard(tx, ty) ? S.map.terrain[ty * CFG.W + tx] : -1;
        const ok = ter === T.GRASS || ter === T.STUMPS || ter === T.BARREN || (ter >= 0 && !!Bld.at(tx, ty));
        if (!ok) { bad.push([id, tx, ty, ter]); if (bad.length > 5) break; }
      }
      // is water inside this layer's reach at all? (the waterside house's must be, or the check proves nothing)
      for (let ty = Math.floor(L.y / TL); ty <= Math.floor((L.y + L.h) / TL); ty++) for (let tx = Math.floor(L.x / TL); tx <= Math.floor((L.x + L.w) / TL); tx++)
        if (MapGen.onBoard(tx, ty) && S.map.terrain[ty * CFG.W + tx] === T.WATER) seenWater[id] = true;
    }
    // the door: no standing thing of a hedge in front of the house's door
    const doors = [ids.house, ids.house2, ids.water].map(id => {
      const o = S.buildings.find(x => x.id === id), e = Footing._c.get(id), bs = Bld.size(o);
      const dx = (o.x + bs / 2) * TL, foot = (o.y + bs) * TL; let n = 0;
      for (const L of [e.L[1], e.L[2]]) { if (!L) continue;
        const d = L.cv.getContext('2d').getImageData(0, 0, L.cv.width, L.cv.height).data, w = L.cv.width;
        for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue;
          const wx = L.x + (i / 4 % w + 0.5) * L.w / w, wy = L.y + (((i / 4 / w) | 0) + 0.5) * L.h / L.cv.height;
          if (Math.abs(wx - dx) < 3.5 && wy > foot - 6 && wy < foot + 8) n++; } }
      return n;
    });
    return { bad, waterInReach: !!seenWater[ids.water], doors };
  }, town.ids);
  ck('theGroundLayerLiesOnOpenGroundOnly', r.bad.length === 0 && r.waterInReach, 'off-ground cells: ' + JSON.stringify(r.bad) + ', water in the waterside house\'s reach: ' + r.waterInReach);
  ck('andTheDoorIsKeptClear', r.doors.every(n => n === 0), 'hedge cells in front of each door: ' + r.doors.join(', '));
}

// ---- a picture only: no rule, save byte or RNG draw moves -----------------------
{
  const r = await p.evaluate(async () => {
    const W = CFG.W, H = CFG.H;
    const rules = () => { let h = 2166136261; const add = v => { h = Math.imul(h ^ (v | 0), 16777619); };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { add(Path.passable(x, y, 'P') ? 1 : 0); add(Bld.canPlace('P', 'house', x, y, { noCost: true, noSeal: true }).ok ? 1 : 0); }
      return h >>> 0; };
    const save = () => { const s = JSON.parse(G.saveJSON()); delete s.units; return JSON.stringify(s); };
    const before = { rules: rules(), save: save(), rng: S.rngState };
    let mr = 0; const orig = Math.random; Math.random = function () { mr++; return orig.call(Math); };
    Footing._c.clear(); for (const o of S.buildings) Footing._q.push(o.id), Footing._qs.add(o.id);
    Footing.flush();
    Math.random = orig;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { rules: before.rules === rules(), save: before.save === save(), rng: before.rng === S.rngState, mr, n: Footing._c.size };
  });
  ck('itChangesNoRuleNoSaveAndNoRng', r.rules && r.save && r.rng && r.n > 5, JSON.stringify(r));
  ck('andNeverAsksMathRandom', r.mr === 0, 'Math.random calls while measuring the town: ' + r.mr);
}

// ---- paced, re-measured, trimmed -------------------------------------------------
{
  const r = await p.evaluate(async ids => {
    Footing._c.clear(); Footing._q.length = 0; Footing._qs.clear();
    const all = S.buildings.filter(o => Footing.look(o) !== 'none');
    for (const o of all) { Footing._q.push(o.id); Footing._qs.add(o.id); }
    Footing.tick(0);
    const one = Footing._c.size;
    Footing.flush();
    // a burning building wears darker art: its footing is measured again
    const house = S.buildings.find(o => o.id === ids.barracks), was = Footing._c.get(ids.barracks).spr;
    house.hp = Math.round(house.maxhp * 0.5);
    await new Promise(r => { let k = 0; const f = () => (++k >= 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    Footing.flush();
    await new Promise(r => requestAnimationFrame(r));
    const now = Footing._c.get(ids.barracks);
    house.hp = house.maxhp;
    // the canvases' cells against the footprint each serves
    let cells = 0, n = 0, worst = 0;
    for (const [, e] of Footing._c) { let c = 0; for (const L of e.L) if (L) c += L.cv.width * L.cv.height; cells += c; n++; worst = Math.max(worst, c); }
    return { one, all: all.length, recast: !!now && now.spr !== was && now.spr === R.wornSprite(Object.assign({}, house, { hp: Math.round(house.maxhp * 0.5) })),
      avg: Math.round(cells / Math.max(1, n)), worst };
  }, town.ids);
  ck('aFrameWithNoBudgetLeftMeasuresOneBuilding', r.one === 1 && r.all > 5, `${r.one} of ${r.all}`);
  ck('aBurningBuildingIsMeasuredAgain', r.recast, String(r.recast));
  ck('theLayersAreCutToWhatTheyHold', r.avg < 45000 && r.worst < 140000, `avg ${r.avg} cells a building, worst ${r.worst} (untrimmed: ~110k / ~200k)`);
}

// ---- off is nothing --------------------------------------------------------------
{
  const r = await p.evaluate(async () => {
    CFG.FOOTING.ON = false; Footing._c.clear(); Footing._q.length = 0; Footing._qs.clear();
    await new Promise(r => { let k = 0; const f = () => (++k >= 5 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const out = { cached: Footing._c.size, queued: Footing._q.length, on: Footing.on() };
    CFG.FOOTING.ON = true;
    return out;
  });
  ck('switchedOffNothingIsMeasuredOrDrawn', r.cached === 0 && r.queued === 0 && r.on === false, JSON.stringify(r));
  const q = await page('?footing=0');
  const r2 = await q.evaluate(() => ({ off: Footing._off, on: Footing.on() }));
  ck('andTheLinkStandsItDownForThePage', r2.off === true && r2.on === false, JSON.stringify(r2));
  await q.close();
}

ck('theFootingPagesThrewNothing', errs.length === 0, errs.slice(0, 3).join(' | ') || 'no page errors');
await b.close(); srv.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (fails.length) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
console.log('ALL FOOTING CHECKS PASS');
