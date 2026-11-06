/* RUINS CONTRACT — what a razed building leaves on the ground (js/ruins.js).

   Operator, build 155: "when the barbarians village is destroyed, or actually
   any building for that matter, the destroyed tile square is also still low
   pixel count and bland… different destruction tile types for different
   buildings… a wall or tower, maybe it's a more visual rubble pile, although
   still walkable."

     A PICTURE, NEVER A RULE  The ground is still T.RUIN: walkable, on the
                    ruin clock back to grass. A ruin record in S.ruins is read
                    by the draw alone, and it rides the save.
     ITS OWN KIND   A palisade leaves charred stakes, a stone wall or tower a
                    rubble heap, a hut its burnt frame, a stone house its fallen
                    walls, a yard its wreck, a great hall its shell, a camp its
                    burnt-out compound. Every class ships its drawn variants.
     NO RNG         The variant and the mirror hash off the position.
     CLEAN IS CLEAN A site called off leaves clean ground and no ruin.
     IT GOES        Healed ground, or a building raised over it, drops the ruin.

     node tests/ruins.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const nap = ms => new Promise(r => setTimeout(r, ms));
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  G.newGame('ruins1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  G.freeVis = true; G.updateVisibility();
  const tc = Bld.tcOf('P');
  // open ground well away from the hall, cleared to grass
  const ox = Math.max(4, tc.x - 14), oy = Math.max(4, tc.y - 14);
  for (let y = oy; y < oy + 10; y++) for (let x = ox; x < ox + 16; x++) {
    S.map.terrain[MapGen.idx(x, y)] = T.GRASS; if (S.map.resAmount) S.map.resAmount[MapGen.idx(x, y)] = 0;
  }
  R.rebuildTerrain && R.rebuildTerrain(); Bld._block = null;
  const raze = (key, x, y, lv, owner) => {
    const bb = Bld.place(owner || 'R', key, x, y, { free: true, instant: true });
    if (!bb) return null;
    bb.level = lv || 1;
    Bld.damage(bb, 1e7, 'P');
    return S.ruins.find(r => r.x === x && r.y === y) || null;
  };

  // ---- 1. each building leaves its own kind of remains ----
  const rngBefore = S.rngState;
  const hut = raze('house', ox + 1, oy + 1, 1);
  const stone = raze('house', ox + 3, oy + 1, 3);
  const pal = raze('wall', ox + 5, oy + 1, 1);
  const wall2 = raze('wall', ox + 7, oy + 1, 2);
  const tow = raze('tower', ox + 9, oy + 1, 3);
  const yard = raze('barracks', ox + 1, oy + 4, 1);
  const hall = raze('barracks', ox + 4, oy + 4, 3);
  const camp = raze('raidercamp', ox + 9, oy + 6, 1);
  ck('aHutLeavesItsBurntFrame', hut && hut.c === 'timber', hut ? hut.c : 'no ruin');
  ck('aStoneHouseLeavesStone', stone && (stone.c === 'stonehouse' || stone.c === 'rubble'), stone ? stone.c : 'no ruin');
  ck('aPalisadeLeavesCharredStakes', pal && pal.c === 'stakes', pal ? pal.c : 'no ruin');
  ck('aStoneWallLeavesARubbleHeap', wall2 && wall2.c === 'rubble', wall2 ? wall2.c : 'no ruin');
  ck('aStoneTowerLeavesARubbleHeap', tow && tow.c === 'rubble', tow ? tow.c : 'no ruin');
  ck('aYardLeavesItsWreck', yard && yard.c === 'yard' && yard.sz === 2, yard ? yard.c + ' sz ' + yard.sz : 'no ruin');
  ck('aGreatHallLeavesItsShell', hall && hall.c === 'hall', hall ? hall.c : 'no ruin');
  ck('aCampLeavesItsCompoundOverTheYard', camp && camp.c === 'yard' && camp.big === 2, camp ? camp.c + ' big ' + camp.big : 'no ruin');
  ck('andNoRngIsDrawn', S.rngState === rngBefore, '');

  // ---- 2. the ground is still the rubble rule: walkable ----
  {
    let walk = true, ruin = true;
    for (const r of [hut, pal, wall2, tow, yard]) if (r) {
      const i = MapGen.idx(r.x, r.y);
      if (S.map.terrain[i] !== T.RUIN) ruin = false;
      if (!Path.passable(r.x, r.y, 'P')) walk = false;
    }
    ck('theGroundIsStillRubble', ruin, '');
    ck('andTheRubbleIsWalkable', walk, 'a rubble heap is a picture, never a wall');
  }

  // ---- 3. every class ships its art, and the art draws ----
  {
    for (const c in Ruins.SETS) for (let v = 1; v <= Ruins.SETS[c]; v++) Ruins.want(c, v);
    for (let i = 0; i < 60; i++) {
      let all = true;
      for (const c in Ruins.SETS) for (let v = 1; v <= Ruins.SETS[c]; v++) if (!Ruins.img(c, v)) all = false;
      if (all) break;
      await nap(100);
    }
    const miss = [];
    for (const c in Ruins.SETS) for (let v = 1; v <= Ruins.SETS[c]; v++) if (!Ruins.img(c, v)) miss.push(c + '-' + v);
    ck('everyClassShipsItsDrawnVariants', !miss.length, miss.join(', '));
    let threw = '';
    try { const cv = document.createElement('canvas'); cv.width = cv.height = 64; Ruins.draw(cv.getContext('2d'), R); }
    catch (e) { threw = String(e); }
    ck('andTheDrawStandsUp', !threw, threw);
    ck('aDrawnRuinStandsInForTheAshHeap', !!hut && Ruins.covers(hut.x, hut.y), '');
  }

  // ---- 4. a save carries them ----
  {
    const n = S.ruins.length;
    const json = G.saveJSON ? G.saveJSON() : JSON.stringify(S);
    G.loadJSON(json); Screens._demo = false; S.paused = true;
    ck('aSaveCarriesTheRuins', S.ruins && S.ruins.length === n, (S.ruins ? S.ruins.length : 'none') + ' of ' + n);
    const old = JSON.parse(json); delete old.ruins;
    G.loadJSON(JSON.stringify(old)); Screens._demo = false; S.paused = true;
    ck('anOlderSaveLoadsWithNone', Array.isArray(S.ruins) && S.ruins.length === 0, '');
    G.loadJSON(json); Screens._demo = false; S.paused = true;
  }

  // ---- 5. a site called off leaves clean ground and no ruin ----
  {
    const sx = ox + 13, sy = oy + 1;
    const site = Bld.place('P', 'house', sx, sy, { free: true });
    const n = S.ruins.length;
    if (site) Bld.cancelWork ? Bld.cancelWork(site) : Bld.removeToRuin(site, true);
    ck('aCalledOffSiteLeavesNoRuin', S.ruins.length === n && !S.ruins.some(r => r.x === sx && r.y === sy),
      site ? '' : 'could not lay the site');
  }

  // ---- 6. it goes with the ground, and under a new building ----
  {
    const r = S.ruins.find(o => o.c === 'timber');
    const i = MapGen.idx(r.x, r.y);
    S.map.terrain[i] = T.GRASS;
    Ruins.prune();
    ck('healedGroundTakesTheRuinAway', !S.ruins.includes(r) && !S.ruins.some(o => o.x === r.x && o.y === r.y), '');
    const w = S.ruins.find(o => o.c === 'rubble' && o.sz === 1);
    const nb = Bld.place('P', 'house', w.x, w.y, { free: true, instant: true });
    Bld._block = null;
    ck('aBuildingRaisedOverItHidesIt', !!nb && !Ruins.live(w), nb ? '' : 'could not place');
    Ruins.prune();
    ck('andTheSweepDropsIt', !S.ruins.includes(w), '');
  }
  return { res, fails };
});
// the art is on disk under the filenames the code asks for
const src = readFileSync(join(root, 'js/ruins.js'), 'utf8');
const sets = JSON.parse(src.match(/SETS:\s*(\{[^}]*\})/)[1].replace(/(\w+):/g, '"$1":'));
const missing = [];
for (const c in sets) for (let v = 1; v <= sets[c]; v++)
  if (!existsSync(join(root, 'assets/ruins', `ruin-${c}-${v}.png`))) missing.push(`${c}-${v}`);
out.res.theFilesAreOnDisk = missing.length ? 'FAIL — ' + missing.join(', ') : 'PASS';
if (missing.length) out.fails.push('theFilesAreOnDisk');
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RUINS CHECKS PASS');
const bad = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', bad);
await b.close();
process.exit(out.fails.length || bad.length ? 1 : 0);
