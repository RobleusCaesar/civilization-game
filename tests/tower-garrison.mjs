/* TOWER GARRISON CONTRACT — the open towers, the bows on them, and the wall
   that stands between two people.

   Operator, 2026-11-04: "TOWER ART — REMOVE ROOFS… open elevated platforms…
   Everything else stays identical: size, footprint… ARCHER GARRISON. A
   player can man a tower with up to 2 archers. While garrisoned, an
   archer's sight AND attack radius are doubled… garrisoned archers render
   standing on the now-open platform… The garrison is destroyed if the
   archers are on the tower when the tower is destroyed… 1 second to
   garrison, and un-garrison… disappear for that second… archers can be
   targeted on top of a tower by enemy ranged soldiers… the enemy AI… does
   target archers first… If an archer is killed on a tower, create a sprite
   where they fall to their death… These units obviously count… to the total
   population cap. WALL LINE-OF-SIGHT (bug fix)… an intact wall blocks LOS
   both ways… a hole/breach in the wall opens LOS at that point… garrisoned
   tower archers shoot over walls."

     §1 the art: every tower PNG the roofs came off keeps its exact size, and
        every pixel is either solid or clear (hard alpha)
     §2 the climb: an order walks the bow to the door, then a second on the
        stairs — hidden, untappable, out of every reach — then the platform
     §3 two to a tower: a third bow is refused; the panel and the tap say so
     §4 twice the sight and twice the reach, and only bows and engines answer
     §5 an order off the platform takes the stairs down first, a second hidden
     §6 the tower falls and takes its lookout: dead, a fall on screen, the
        population freed — and one killed up there falls too
     §7 the rival's bows mark a bow on a tower first (a raiding column's from
        well out); its blades cannot
     §8 an intact wall blocks sight both ways; a breach or an open gate lets
        it through; a bow on a tower sees over
     §9 drawn on the platform, tapped where it is drawn, and a save carries it

   Run this after touching any of:
     js/lookout.js, combat.js (canEngage / sees / losGrid / reachOf /
     bestFoe / nearestUnit / the perched branches), units.js (the lookout
     hooks), buildings.js (damage / demolish), render.js (the tower pass,
     unitHit / unitHidden), ui.js (the tower tap and panels),
     assets/buildings/tower-l*.png, assets/fort/tower-l*.png

     node tests/tower-garrison.mjs   # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- §1 the art, read off the disk ---- */
// a tiny PNG reader: size, colour type and every alpha (8-bit RGBA or palette+tRNS)
function readPng(path) {
  const buf = readFileSync(path);
  let o = 8, w = 0, h = 0, depth = 0, ctype = 0, idat = [], trns = null;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'tRNS') trns = d;
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 6: 4, 2: 3, 3: 1, 4: 2, 0: 1 }[ctype], bpp = Math.max(1, ch * depth / 8), stride = Math.ceil(w * ch * depth / 8);
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = (x >= bpp && y) ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  const alpha = [];
  if (ctype === 6 && depth === 8) for (let i = 3; i < out.length; i += 4) alpha.push(out[i]);
  else if (ctype === 3 && depth === 8) for (let i = 0; i < out.length; i++) alpha.push(trns && out[i] < trns.length ? trns[out[i]] : 255);
  else if (ctype === 2 || ctype === 0) alpha.push(255);
  return { w, h, ctype, alpha };
}
{
  // the shipped sizes — the roofs come off, nothing else moves (operator: "size, footprint, tier geometry")
  const SIZES = {
    'assets/buildings/tower-l1.png': [88, 114], 'assets/buildings/tower-l2.png': [84, 116], 'assets/buildings/tower-l3.png': [84, 113],
    'assets/fort/tower-l1.png': [68, 90], 'assets/fort/tower-l2.png': [58, 91], 'assets/fort/tower-l3.png': [65, 85],
  };
  const bad = [], soft = [];
  for (const [f, [w, h]] of Object.entries(SIZES)) {
    const png = readPng(join(root, f));
    if (png.w !== w || png.h !== h) bad.push(`${f} ${png.w}x${png.h} (was ${w}x${h})`);
    const semi = png.alpha.filter(a => a > 0 && a < 255).length;
    if (semi) soft.push(`${f}: ${semi}`);
  }
  ck('theRooflessTowersKeepTheirShippedSize', !bad.length, bad.join('; ') || '6 drawings, sizes as shipped');
  ck('andEveryPixelIsSolidOrClear', !soft.length, soft.join('; ') || 'hard alpha throughout');
  /* …and the rest of the drawing keeps its OUTLINE: the roofed towers' own
     per-row extents (run-length, "l-r*n", "_" a clear row), taken off the
     shipped art before the roofs came off. A roofless row may be narrower —
     the roof was the widest thing — never wider: the first redraw stood its
     deck 2px out past the old gallery each side, and wall-lines' mountain
     check caught the rim beside the wall arm. */
  const OLD_ROWS = {
    'assets/buildings/tower-l1.png': '40-47 38-49 36-51 34-53 33-54 31-56 29-58 27-60 26-61 24-63 22-65 20-67 18-69 16-71 15-72 14-73 13-74*2 12-75 13-74 12-75*2 13-74 12-75*2 11-76 12-75*2 11-76 12-75 11-76*3 12-75 11-76 12-75 11-76 12-75*2 11-76*4 12-75 14-73 17-70 18-69*2 17-70 16-71*10 15-72*7 13-74 12-75 11-76 10-77 8-79 7-80 6-81 5-82 4-83 3-84 2-85 1-86*2 0-87*28 1-86*2 2-85*2 3-84 5-82 7-80',
    'assets/buildings/tower-l2.png': '40-43 39-44 37-46 35-48 33-50 31-52 29-54 27-56 25-58 23-60 21-62 19-64 17-66 15-68 14-69 13-70*23 14-69 16-67*14 15-68*3 14-69*4 15-68 16-67*7 15-68 12-71 11-72 9-74 8-75 7-76*2 5-78 4-79 3-80 2-81 1-82 1-83 0-83*14 0-82 0-83*5 1-82*3 3-80 4-79 5-78 7-76 11-72 30-53*6 31-52',
    'assets/fort/tower-l1.png': '30-37 28-39 26-41 24-43 23-44 21-46 19-48 17-50 16-51 14-53 12-55 10-57 8-59 6-61 5-62 4-63 3-64*2 2-65 3-64 2-65*2 3-64 2-65*2 1-66 2-65*2 1-66 2-65 1-66*3 2-65 1-66 2-65 1-66 2-65*2 1-66*4 2-65 4-63 7-60 8-59 7-60 6-61*21 4-63 3-64 2-65*2 1-66*2 0-67*3 0-66 0-67*4 1-66 0-67*3 1-66*2 3-64',
    'assets/fort/tower-l2.png': '27-30 26-31 24-33 22-35 20-37 18-39 16-41 14-43 12-45 10-47 8-49 6-51 4-53 2-55 1-56 0-57*23 1-56 3-54*14 2-55*3 1-56*4 2-55 3-54*29 7-50',
  };
  const out = [];
  for (const [f, rl] of Object.entries(OLD_ROWS)) {
    const rows = [];
    for (const g of rl.split(' ')) { const [v, n] = g.split('*'); for (let k = 0; k < (+n || 1); k++) rows.push(v === '_' ? null : v.split('-').map(Number)); }
    const png = readPng(join(root, f)), w = png.w;
    let bad = 0;
    for (let y = 0; y < png.h; y++) for (let x = 0; x < w; x++) {
      if (!png.alpha[y * w + x]) continue;
      const r = rows[y];
      if (!r || x < r[0] || x > r[1]) bad++;
    }
    if (bad) out.push(`${f}: ${bad} px outside`);
  }
  ck('andTheyStayInsideTheirOldOutline', !out.length, out.join('; ') || 'no row wider than the roofed tower was');
  // the damage states and the raising stages share their tower's canvas (fort-states.mjs holds the rest)
  const st = [];
  for (const lv of [1, 2]) for (const k of ['d1', 'd2']) {
    for (const [dir, base] of [['buildings', 'tower-l' + lv], ['fort', 'tower-l' + lv]]) {
      const f = `assets/${dir}/${base}-${k}.png`;
      try { const png = readPng(join(root, f)); const semi = png.alpha.filter(a => a > 0 && a < 255).length; if (semi) st.push(`${f}: ${semi} soft`); }
      catch (e) { st.push(f + ' unreadable'); }
    }
  }
  ck('andTheirBatteredStatesAreHardEdgedToo', !st.length, st.join('; ') || 'd1/d2 at L1 and L2, both forms');
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });   // the drawn checks read the frame's pixels
const p = await b.newPage({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html?terrain=classic'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.evaluate(() => { Boot.force(); Screens._demo = false; G.newGame('lookout', 'moderate', 'large'); Screens.show('playing'); S.paused = true; });
await p.waitForFunction(() => typeof Sprites !== 'undefined' && Sprites.towerArt && [0, 1, 2].every(i => Sprites.towerArt[i]) &&
  (!Assets.allArtReady || Assets.allArtReady()), null, { timeout: 120000 }).catch(() => {});

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const TL = CFG.TILE, C = CFG.LOOKOUT;
  const clear = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    for (const t of [Bld.tcOf('P'), Bld.tcOf('A')]) if (t) { t.x = 50; t.y = t.owner === 'A' ? 56 : 52; }
    S.buildings = S.buildings.filter(bb => bb.key === 'tc'); S.units = []; S.peace = false;
    for (let i = 0; i < S.map.terrain.length; i++) { S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1; }
    Bld._block = null;
    G.freeVis = true;
    if (window.Combat) Combat.scanT = 0;
  };
  const put = (k, x, y, lv, owner) => {
    const bb = Bld.place(owner || 'P', k, x, y, { free: true, instant: true });
    if (bb && bb.construction > 0) Bld.finish(bb);
    if (bb) { bb.level = lv || 1; const L = CFG.BUILDINGS[k].levels[bb.level - 1]; if (L && L.hp) bb.hp = bb.maxhp = L.hp; }
    Bld._block = null;
    return bb;
  };
  const step = (sec, fn) => { for (let t = 0; t < sec; t += 0.05) { Units.update(0.05); if (fn) fn(); } };
  const fight = (sec, keep) => { for (let t = 0; t < sec; t += 0.05) { Combat.update(0.05); Units.update(0.05); if (keep) keep(); } };

  /* ---- §2 the climb ---- */
  {
    clear('lk2');
    const t = put('tower', 20, 20, 1);
    const a = Units.spawn('archer', 'P', 20, 24);
    const ordered = Lookout.order(a, t);
    let hiddenSeen = false, hitInf = false, unreach = false, climbT = 0, startedAt = -1;
    const foe = Units.spawn('archer', 'A', 24, 20);
    for (let k = 0; k < 400 && !a.perch; k++) {
      Units.update(0.05);
      if (a.climb) {
        if (startedAt < 0) startedAt = k;
        climbT += 0.05;
        hiddenSeen = R.unitHidden(a);
        hitInf = R.unitHit(a, a.x, a.y - 0.2) === Infinity;
        unreach = !Combat.canEngage(foe, a);
      }
    }
    ck('anOrderWalksTheBowToTheTowerAndUpIt', ordered && a.perch === t.id && a.x === t.x + 0.5 && a.y === t.y + 0.5,
      `ordered ${ordered}, perched on ${a.perch}`);
    ck('andTheClimbTakesASecond', Math.abs(climbT - C.climbS) <= 0.06, `${climbT.toFixed(2)} s on the stairs`);
    ck('outOfSightUntappableAndOutOfReachOnTheStairs', hiddenSeen && hitInf && unreach,
      `hidden ${hiddenSeen}, tap ${hitInf ? 'nothing' : 'hit'}, reachable ${!unreach}`);
    // pinned: a walk the leash or a guard post lays is never taken
    a.path = [{ x: 25, y: 25 }]; a.pathI = 0;
    step(1);
    ck('aBowOnThePlatformIsPinnedToItsTower', a.perch === t.id && a.x === t.x + 0.5 && a.y === t.y + 0.5, `at ${a.x}, ${a.y}`);
    // the population: a bow up a tower still counts
    const popUp = Units.popUsed('P');
    ck('andStillCountsAgainstThePopulation', popUp >= 1 && S.units.includes(a), `pop ${popUp}`);
  }

  /* ---- §3 two to a tower ---- */
  {
    clear('lk3');
    const t = put('tower', 20, 20, 2);
    const bows = [0, 1, 2].map(i => Units.spawn(i === 1 ? 'longbow' : 'archer', 'P', 19 + i, 23));
    const got = bows.map(u => Lookout.order(u, t));
    step(4);
    const up = bows.filter(u => u.perch === t.id).length;
    ck('aTowerTakesTwoBowsAndRefusesTheThird', got[0] && got[1] && !got[2] && up === 2 && Lookout.room(t) === 0,
      `orders ${got.join('/')}, ${up} up`);
    const soldier = Units.spawn('defender', 'P', 22, 23);
    ck('andOnlyBowsGoUp', !Lookout.canMan(soldier) && !Lookout.order(soldier, t) && Lookout.canMan(bows[1]), 'defender refused, longbow allowed');
    // the tower's panel says it and offers the way down
    UI.select('bld', t.id);
    const ph = document.getElementById('panel').innerHTML;
    ck('theTowerPanelCountsItsLookoutAndBringsThemDown', /2\/2 archers on the lookout/.test(UI.panelSub()) && /data-act="lookoutdown"/.test(ph),
      UI.panelSub().replace(/<[^>]+>/g, ''));
    UI.deselect && UI.deselect();
    // THE TAP: bows selected, an own tower tapped — the transport's pattern, through the real handler
    clear('lk3b');
    const t2 = put('tower', 30, 30, 1);
    const g1 = Units.spawn('archer', 'P', 27, 33), g2 = Units.spawn('longbow', 'P', 28, 33), g3 = Units.spawn('archer', 'P', 29, 33);
    G.updateVisibility(); R.cam.z = 2; R.centerOn(30.5, 30.5);
    const scr = (wx, wy) => [(wx * TL - R.cam.x) * R.cam.z, (wy * TL - R.cam.y) * R.cam.z];
    UI.sel = { type: 'group', ids: [g1.id, g2.id, g3.id] };
    const [sx, sy] = scr(30.5, 30.45);
    UI.handleTap(sx, sy);
    const sent = [g1, g2, g3].filter(u => u.task && u.task.type === 'mantower' && u.task.id === t2.id).length;
    // one bow selected, a full tower tapped: the tap is a LOOK (rule 6), the tower's panel
    step(4);
    UI.sel = { type: 'unit', id: g3.id };
    const [fx, fy] = scr(30.5, 30.9);       // its foot, clear of the bows drawn on its top
    UI.handleTap(fx, fy);
    const look = UI.sel && UI.sel.type === 'bld' && UI.sel.id === t2.id && !(g3.task && g3.task.type === 'mantower');
    ck('tappingAnOwnTowerWithBowsSelectedSendsThemUp', sent === 2 && look,
      `${sent} sent of 3 (two fit); a full tower tapped with a bow in hand ${look ? 'selects the tower' : 'did something else: ' + JSON.stringify(UI.sel) + ' task ' + JSON.stringify(g3.task)}`);
    UI.deselect && UI.deselect();
  }

  /* ---- §4 twice the sight and the reach ---- */
  {
    clear('lk4');
    const t = put('tower', 20, 20, 1);
    const a = Units.spawn('archer', 'P', 20, 22);
    Lookout.order(a, t); step(3);
    const base = CFG.UNITS.archer.rng, vis = CFG.UNITS.archer.vision || CFG.UNIT_VISION;
    ck('aBowOnATowerReachesTwiceAsFar', Math.abs(Combat.reachOf(a) - base * C.rangeMult) < 1e-9, `${Combat.reachOf(a)} vs ${base}`);
    // sight, measured in the real visibility pass (towers mark their own; read a tile past both)
    G.freeVis = false;
    const far = Math.round(t.x + 0.5 + vis * 1.8) | 0;
    // the tower's own sight must not be what lights it: stand the tower's vision down for the read
    const lvl = Bld.lv(t), v0 = lvl.vision; lvl.vision = 0.5;
    G.updateVisibility();
    const seenUp = G.visibleAt(far, t.y);
    const a2 = Units.spawn('archer', 'P', 30, 40);   // the same bow, on the ground, far from anything
    G.updateVisibility();
    const farG = Math.round(30.5 + vis * 1.8) | 0;
    const seenGround = G.visibleAt(farG, 40);
    lvl.vision = v0; G.freeVis = true;
    ck('andSeesTwiceAsFar', seenUp && !seenGround, `a tile ${(vis * 1.8).toFixed(1)} out: tower ${seenUp}, ground ${seenGround}`);
    a2.hp = 0; S.units = S.units.filter(u => u !== a2);
    // a foe past a bow's own reach but inside twice it: the bow on the tower shoots it
    const foe = Units.spawn('defender', 'A', 20.5 + base * 1.7, 20.5);
    const hp0 = foe.hp;
    fight(6, () => { foe.x = 20.5 + base * 1.7; foe.y = 20.5; foe.path = null; foe.tUnit = 0; foe.hp = Math.max(foe.hp, 1); });
    ck('andShootsWhatOnlyTheDoubledReachCanReach', foe.hp < hp0 && a.perch === t.id, `foe ${hp0} → ${Math.round(foe.hp)} at ${(base * 1.7).toFixed(1)} tiles`);
    ck('aBladeCannotStrikeABowOnATower', !Combat.canEngage(foe, a) && Combat.canEngage(Units.spawn('archer', 'A', 30, 30), a),
      'defender no, archer yes');
  }

  /* ---- §5 down the stairs ---- */
  {
    clear('lk5');
    const t = put('tower', 20, 20, 1);
    const a = Units.spawn('archer', 'P', 20, 22);
    Lookout.order(a, t); step(3);
    Units.moveTo(a, 26, 26);
    Units.update(0.05);
    const hiddenDown = !!a.climb && !a.perch && R.unitHidden(a);
    let downT = 0;
    while (a.climb && downT < 3) { Units.update(0.05); downT += 0.05; }
    ck('anOrderOffThePlatformTakesTheStairsDownFirst', hiddenDown && Math.abs(downT - C.climbS) <= 0.1,
      `hidden on the way down ${hiddenDown}, ${downT.toFixed(2)} s`);
    step(8);
    ck('andThenIsCarriedOut', !a.perch && !a.climb && Math.hypot(a.x - 26.5, a.y - 26.5) < 1.2, `at ${a.x.toFixed(1)}, ${a.y.toFixed(1)}`);
    // and the panel button
    Lookout.order(a, t); step(8);
    const upAgain = a.perch === t.id;
    Lookout.down(a, null); step(1.2);
    ck('climbDownBringsThemToTheDoor', upAgain && !a.perch && !a.climb && Math.abs(a.x - (t.x + 0.5)) <= 1.5 && Math.abs(a.y - (t.y + 0.5)) <= 1.5,
      `back up ${upAgain}, down at ${a.x}, ${a.y}`);
  }

  /* ---- §6 the tower falls ---- */
  {
    clear('lk6');
    const t = put('tower', 20, 20, 1);
    const bows = [Units.spawn('archer', 'P', 19, 22), Units.spawn('longbow', 'P', 21, 22)];
    for (const u of bows) Lookout.order(u, t);
    step(4);
    const pop0 = Units.popUsed('P');
    Lookout.falls = [];
    Bld.damage(t, 1e7, undefined, 'A');
    ck('theTowerFallsAndTakesItsLookoutWithIt', bows.every(u => !S.units.includes(u)) && !Bld.get(t.id),
      `${bows.filter(u => S.units.includes(u)).length} left alive`);
    ck('andTheyFallOnScreen', Lookout.falls.length === 2, `${Lookout.falls.length} falls`);
    ck('andThePopulationIsFreed', Units.popUsed('P') === pop0 - 2, `${pop0} → ${Units.popUsed('P')}`);
    // one killed up there falls too, and the fall ends where it lands
    const t2 = put('tower', 30, 20, 2);
    const a = Units.spawn('archer', 'P', 30, 22); Lookout.order(a, t2); step(4);
    Lookout.falls = [];
    Units.damage(a, 9999, 0, 'A');
    const f = Lookout.falls[0];
    const g = R.cv.getContext('2d');
    if (f) for (let i = 0; i < 40; i++) Lookout.drawFalls(g, 0.05);
    ck('aBowKilledOnATowerFallsToTheGroundAndIsGone', !!f && f.y1 > f.y0 && !Lookout.falls.length && !S.units.includes(a),
      f ? `from ${f.y0.toFixed(0)} to ${f.y1.toFixed(0)} px, ${Lookout.falls.length} still falling` : 'no fall');
    // a tower torn down by its own hands puts them on the ground, unharmed
    const t3 = put('tower', 40, 20, 1);
    const c = Units.spawn('archer', 'P', 40, 22); Lookout.order(c, t3); step(4);
    Bld.demolish(t3);
    ck('aTowerTornDownLetsItsLookoutDownAlive', S.units.includes(c) && !c.perch && !c.climb && c.hp > 0, `hp ${c.hp}`);
  }

  /* ---- §7 the rival's eye ---- */
  {
    clear('lk7');
    const t = put('tower', 20, 20, 1);
    const up = Units.spawn('archer', 'P', 20, 22); Lookout.order(up, t); step(3);
    const ground = Units.spawn('defender', 'P', 22, 20);
    // a rival bow nearer the man on the ground than the bow on the tower
    const rb = Units.spawn('archer', 'A', 24, 20.5);
    const pick = Combat.bestFoe(rb, rb.x, rb.y, 8, o => Combat.hostileUnits(rb, o) && Combat.canEngage(rb, o));
    ck('theRivalsBowsMarkABowOnATowerFirst', pick === up,
      `picked ${pick ? pick.kind + (pick.perch ? ' (on the tower)' : '') : 'nothing'} — ground man ${Math.hypot(22 - 24, 20 - 20.5).toFixed(1)}, tower ${Math.hypot(20.5 - 24, 0).toFixed(1)}`);
    const rm = Units.spawn('defender', 'A', 24, 21.5);
    const mp = Combat.bestFoe(rm, rm.x, rm.y, 8, o => Combat.hostileUnits(rm, o) && Combat.canEngage(rm, o));
    ck('andItsBladesGoForWhatTheyCanReach', mp === ground, `picked ${mp ? mp.kind : 'nothing'}`);
    // a raiding column's bows go for the tower from well out, under its doubled reach
    const raider = Units.spawn('archer', 'A', 28, 20.5);
    raider.task = { type: 'raid' };
    Combat.aiRaidSeek(raider);
    ck('aRaidingBowGoesForTheMannedTowerFromWellOut', raider.tUnit === up.id,
      `${Math.hypot(28 - 20.5, 0).toFixed(1)} tiles out — marked ${raider.tUnit === up.id ? 'the bow on the tower' : raider.tUnit ? 'something else' : 'nothing'}`);
    // the war brain does not take a bow on our tower for a battery on unwalkable ground
    ck('aBowOnATowerIsNoGunPosition', !AI.seenGuns().includes(up), 'seenGuns leaves it out');
  }

  /* ---- §8 the wall between ---- */
  {
    clear('lk8');
    for (let y = 14; y <= 28; y++) put('wall', 20, y, 1);
    const pa = Units.spawn('archer', 'P', 17, 21), ra = Units.spawn('archer', 'A', 23, 21);
    const blocked = !Combat.sees(pa, ra) && !Combat.sees(ra, pa);
    const hp = [pa.hp, ra.hp];
    fight(10, () => { for (const u of [pa, ra]) { u.hp = Math.max(u.hp, 1); } });
    ck('anIntactWallBlocksSightBothWays', blocked && pa.hp === hp[0] && ra.hp === hp[1] && !pa.tUnit && !ra.tUnit,
      `sees ${Combat.sees(pa, ra)}/${Combat.sees(ra, pa)}, hp ${pa.hp}/${ra.hp}`);
    // a diagonal run of sections is a wall too
    clear('lk8b');
    for (let k = 0; k < 10; k++) put('wall', 15 + k, 15 + k, 1);
    const d1 = Units.spawn('archer', 'P', 18, 22), d2 = Units.spawn('archer', 'A', 22, 18);
    ck('aDiagonalRunIsAWallToo', !Combat.sees(d1, d2), 'corner-to-corner sections close the line');
    // the breach: a section razed opens the line there
    clear('lk8c');
    const ws = [];
    for (let y = 14; y <= 28; y++) ws.push(put('wall', 20, y, 1));
    const p2 = Units.spawn('archer', 'P', 17, 21), r2 = Units.spawn('archer', 'A', 23, 21);
    const before = Combat.sees(p2, r2);
    Bld.damage(ws.find(w => w.y === 21), 1e6, undefined, 'P');
    Bld._block = null;
    const after = Combat.sees(p2, r2);
    const farLine = Combat.sees(Units.spawn('archer', 'P', 17, 15), Units.spawn('archer', 'A', 23, 15));
    ck('aBreachOpensTheLineThere', !before && after && !farLine, `before ${before}, after ${after}, elsewhere ${farLine}`);
    // an open gate is a doorway; a sealed one is wall
    clear('lk8d');
    for (let y = 14; y <= 28; y++) if (y !== 21) put('wall', 20, y, 1);
    const gt = put('gate', 20, 21, 1);
    const p3 = Units.spawn('archer', 'P', 17, 21), r3 = Units.spawn('archer', 'A', 23, 21);
    gt.raised = true; Bld._block = null;
    const shut = Combat.sees(p3, r3);
    gt.raised = false; Bld._block = null;
    const open = Combat.sees(p3, r3);
    ck('aSealedGateIsWallAnOpenOneADoor', !shut && open, `sealed ${shut}, open ${open}`);
    // a bow on a tower in the line shoots over it — and is shot at over it
    clear('lk8e');
    for (let y = 14; y <= 28; y++) if (y !== 21) put('wall', 20, y, 1);
    const tw = put('tower', 20, 21, 1);
    const up = Units.spawn('archer', 'P', 19, 22); Lookout.order(up, tw); step(4);
    const out = Units.spawn('defender', 'A', 23, 21);
    const hp0 = out.hp;
    fight(6, () => { out.x = 23.5; out.y = 21.5; out.path = null; out.tUnit = 0; out.hp = Math.max(out.hp, 1); });
    const rb = Units.spawn('archer', 'A', 24, 22);
    ck('aBowOnATowerShootsOverTheWall', up.perch === tw.id && out.hp < hp0 && Combat.sees(rb, up),
      `outside man ${hp0} → ${Math.round(out.hp)}, the rival's bow sees the tower top ${Combat.sees(rb, up)}`);
    // the grid is cheap: no wall near the line, no walk
    clear('lk8f');
    const g0 = Units.spawn('archer', 'P', 10, 10), g1 = Units.spawn('archer', 'A', 14, 10);
    ck('noWallAnywhereIsAClearLine', Combat.sees(g0, g1) && Combat.losGrid() && Combat._losN === 0, 'no walls');
  }

  /* ---- §9 drawn, tapped, saved ---- */
  {
    clear('lk9');
    const t = put('tower', 30, 30, 2);
    const a = Units.spawn('archer', 'P', 30, 32); Lookout.order(a, t); step(3);
    const s = Lookout.spot(a), am = Lookout.aim(a);
    const tap = R.unitHit(a, am.x / TL, am.y / TL);
    ck('aBowOnATowerIsTappedWhereItIsDrawn', tap < 0.55, `dead-on ${tap.toFixed(2)}`);
    // a man's full size, half of him over the rail (operator, build 146)
    const body = s.y - s.head, over = (s.cut - s.head) / body;
    ck('aBowStandsAManHigh', C.drawScale >= 0.99 && body >= 0.8 * TL, `drawScale ${C.drawScale}, body ${body.toFixed(1)}px of a ${TL}px tile`);
    ck('andHalfOfHimShowsOverTheRail', Math.abs(over - 0.5) < 0.02, `${Math.round(over * 100)}% of him above the parapet's top`);
    // drawn: the frame with the bow and without it differ above the parapet,
    // reaching up to his head, and nothing of him below the rail past its ends
    G.updateVisibility(); R.cam.z = 3; R.centerOn(30.5, 30); R.holdBake = false; R.rebuildTerrain(); if (R.ensureTerrain) R.ensureTerrain();
    if (R.redrawFog) R.redrawFog();
    const X0 = s.x - 24, Y0 = s.head - 6, WW = 48, HH = s.y + 6 - Y0;
    const read = () => { R.draw(0); const z = R.cam.z * (R.dpr || 1);
      const x0 = Math.round((X0 - R.cam.x) * z), y0 = Math.round((Y0 - R.cam.y) * z);
      return { d: R.cv.getContext('2d').getImageData(x0, y0, Math.round(WW * z), Math.round(HH * z)).data, w: Math.round(WW * z), z }; };
    for (let i = 0; i < 40; i++) R.draw(0);           // the footings (the tower's hedge) are measured over frames: settle them first
    const withBow = read();
    const keep = a.perch; a.perch = 0; S.units = S.units.filter(u => u !== a);
    const without = read();
    a.perch = keep; S.units.push(a);
    let diff = 0, top = Infinity;
    for (let i = 0; i < withBow.d.length; i += 4) {
      if (Math.abs(withBow.d[i] - without.d[i]) + Math.abs(withBow.d[i + 1] - without.d[i + 1]) <= 30) continue;
      diff++; top = Math.min(top, Y0 + Math.floor(i / 4 / withBow.w) / withBow.z);
    }
    ck('aBowOnATowerIsDrawnOnThePlatform', diff > 60 && top < s.head + 4,
      `${diff} pixels of bow, his head drawn ${(s.cut - top).toFixed(1)}px over the rail`);
    // two men pushed out past the parapet's ends: over the rail they show
    // beyond its ends (the probe sees there), below it nothing of them does
    const b2 = Units.spawn('archer', 'P', 30, 32); Lookout.order(b2, t); step(3);
    const hw = Lookout.HALF_W; Lookout.HALF_W = -0.3;
    const crew = [a, b2], sp = Lookout.spot(a);
    const at = () => { R.draw(0); const z = R.cam.z * (R.dpr || 1);
      const x0 = Math.round((sp.l - 28 - R.cam.x) * z), y0 = Math.round((sp.head - 6 - R.cam.y) * z);
      return { d: R.cv.getContext('2d').getImageData(x0, y0, Math.round((sp.r - sp.l + 56) * z), Math.round((sp.bot - sp.head + 12) * z)).data,
        w: Math.round((sp.r - sp.l + 56) * z), z, X: sp.l - 28, Y: sp.head - 6 }; };
    for (let i = 0; i < 10; i++) R.draw(0);
    const w2 = at();
    const keep2 = crew.map(u => u.perch); crew.forEach(u => { u.perch = 0; }); S.units = S.units.filter(u => !crew.includes(u));
    const wo2 = at();
    crew.forEach((u, i) => { u.perch = keep2[i]; S.units.push(u); }); Lookout.HALF_W = hw;
    let overPast = 0, underPast = 0;
    for (let i = 0; i < w2.d.length; i += 4) {
      if (Math.abs(w2.d[i] - wo2.d[i]) + Math.abs(w2.d[i + 1] - wo2.d[i + 1]) <= 30) continue;
      const wx = w2.X + ((i / 4) % w2.w) / w2.z, wy = w2.Y + Math.floor(i / 4 / w2.w) / w2.z;
      if (wx >= sp.l - 1 && wx <= sp.r + 1) continue;
      if (wy < sp.cut - 1) overPast++; else if (wy > sp.cut + 1) underPast++;
    }
    ck('andNoLegHangsBesideTheTower', underPast === 0 && overPast > 50,
      `${underPast} pixels of them below the rail past the parapet's ends (${overPast} over it, where they may lean out)`);
    // a save carries it up there
    const json = G.saveJSON();
    G.loadJSON(json);
    const back = S.units.find(u => u.kind === 'archer');
    ck('aSaveCarriesTheLookout', back && back.perch && Bld.get(back.perch) && Bld.get(back.perch).key === 'tower', back ? 'perch ' + back.perch : 'no archer');
  }
  return { res, fails };
});
Object.assign(res, out.res); fails.push(...out.fails);
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ✓ ' : '  ✗ ') + k + ' — ' + v.replace(/^(PASS|FAIL)( — )?/, ''));
if (errs.length) { console.log('page errors:', errs.slice(0, 5)); fails.push('pageErrors'); }
await b.close();
if (fails.length) { console.log(`\n${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log('\nall tower-garrison checks pass');
