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
     §4a HE SHOOTS ONLY WHAT IS SEEN (build 151 — operator: "archers in the
        tower can see beyond the lit area. Even with their extended view,
        they should only be able to shoot visible enemies. Pull in their
        range so they can't shoot enemies until they're within visible
        range"): the doubled reach ends at the ground the platform lights
        (Lookout.sightOf — his doubled sight, or the tower's watch if it is
        farther), a foe in the dark past it is never struck and one walking
        into the light is, a foe inside the reach on ground the player cannot
        see is never marked (Combat.perchSees), and the placement ring is
        that reach
     §4b the player's tower shoots ONLY through its bows (operator, build
        148: "towers should no longer shoot arrows. Only if they're manned
        with archers they should shoot"): empty, it looses nothing at any
        level and says so on its panel; manned, its bows do the shooting;
        the rival's towers still fire by themselves
     §3b at his post, not in a party (build 150): a bow sent up a tower
        leaves the selection (the rest of a party stays in hand); up there
        his panel offers no Defend and no Stop; a double tap, Group nearby
        and a banner take the ground's men alone; a tap on him still selects
        him
     §4c the platform makes a bow a better one, the same on every tower
        (build 149: "Tougher archers. Hit for more, take less damage. Two
        archers should be more powerful than the tower by itself
        previously"; build 150: "just do 50% more than what they do on the
        ground… regardless of the towers level"; build 151: "Bring damage
        down to 25% above normal and defense to 25% above normal"): two base
        archers (and two longbows) on a player tower out-shoot a rival tower
        firing the old way on the wattle and timber storeys (the stone
        storey's old volley is now a shade ahead); up there every kind of
        bow, on every storey, hits CFG.LOOKOUT.atk times his own ground blow
        (a better bow on the ground is a better bow up there) and takes
        CFG.LOOKOUT.hurt of every blow (an engine's stone too), the number
        floated is the number taken, the panel shows both; off it, nothing
     §5 an order off the platform takes the stairs down first, a second hidden
     §6 the tower falls and takes its lookout: dead, a fall on screen, the
        population freed — and one killed up there falls too
     §7 the rival's bows mark a bow on a tower first (a raiding column's from
        well out); its blades cannot
     §8 an intact wall blocks sight both ways; a breach or an open gate lets
        it through; a bow on a tower sees over
     §9 drawn INSIDE the platform — whole, the tower's own front laid over
        him, a man's size beside the villagers, his body inside the outer
        posts whichever way he faces (two a little squeezed together) —
        tapped where it is drawn, told what to shoot by a tap, and a save
        carries it

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
    // everything in sight — and the visibility map REDRAWN under it: a bow up
    // a tower shoots only what the player sees (build 151, Combat.perchSees),
    // and the map newGame left was laid before freeVis was set
    G.freeVis = true; G.updateVisibility();
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

  /* ---- §3b at his post, not in a party (build 150 — operator: "Remove the
     defend button when archers are on the tower since that's a given. When
     an archer goes up a tower deselect them (after sending an archer up a
     tower I click something else and then my archer comes down again…). If
     you select all soldiers in an area, archers in the towers shouldn't be
     selectable. They should only be selectable when they're on the ground")
     ---- */
  {
    clear('lk3c');
    const hall = Bld.tcOf('P'); hall.x = 33; hall.y = 29; Bld._block = null;   // the hall beside it: defended ground
    const t = put('tower', 30, 30, 1);
    G.updateVisibility(); R.cam.z = 2; R.centerOn(30.5, 31.5);
    const scr = (wx, wy) => [(wx * TL - R.cam.x) * R.cam.z, (wy * TL - R.cam.y) * R.cam.z];
    // one bow sent up by a tap: out of hand the moment the order lands
    const a1 = Units.spawn('archer', 'P', 28.5, 32.5);
    UI.select('unit', a1.id);
    UI.handleTap(...scr(30.5, 30.45));
    const sentOne = !!(a1.task && a1.task.type === 'mantower'), freedOne = !UI.sel;
    // a party — two bows and a blade — at a tower with room for one more:
    // the bow that fits leaves the selection, the rest stay in hand
    const a2 = Units.spawn('longbow', 'P', 29.5, 32.5), a3 = Units.spawn('archer', 'P', 30.5, 32.6), d1 = Units.spawn('defender', 'P', 31.5, 32.5);
    UI.sel = { type: 'group', ids: [a2.id, a3.id, d1.id] }; UI.renderPanel();
    UI.handleTap(...scr(30.5, 30.45));
    const upOf = [a2, a3].filter(u => u.task && u.task.type === 'mantower').length;
    const kept = UI.sel && UI.sel.type === 'group' ? UI.sel.ids.slice() : UI.sel && UI.sel.type === 'unit' ? [UI.sel.id] : [];
    const climber = [a2, a3].find(u => u.task && u.task.type === 'mantower');
    const shed = upOf === 1 && kept.length === 2 && !kept.includes(climber.id) && kept.includes(d1.id);
    ck('aBowSentUpATowerLeavesTheSelection', sentOne && freedOne && shed,
      `one bow sent: ordered ${sentOne}, selection cleared ${freedOne}; a party at a tower with room for one: ${upOf} sent, ${kept.length} still in hand (the one going up ${climber && kept.includes(climber.id) ? 'STILL' : 'not'} among them)`);
    UI.deselect && UI.deselect();
    step(4);
    const below = [a2, a3].find(u => !u.perch);
    // his panel: Climb down, no Defend, no Stop — not even with a mark in hand
    const foe = Units.spawn('defender', 'A', 70, 70);
    a1.tUnit = foe.id;
    UI.select('unit', a1.id);
    const ph = document.getElementById('panel').innerHTML;
    const busyUp = UI.unitBusy(a1);
    a1.tUnit = 0;
    UI.select('unit', below.id);
    const gh = document.getElementById('panel').innerHTML, groundDef = /data-act="defend"/.test(gh) && Units.inDefendBounds(below);
    UI.deselect && UI.deselect();
    S.units = S.units.filter(o => o !== foe);
    ck('noDefendOrStopUpATower', a1.perch === t.id && busyUp && !/data-act="defend"/.test(ph) && !/data-act="stop"/.test(ph) && /data-act="lookoutdown"/.test(ph) && groundDef,
      `up there (busy ${busyUp}): Defend ${/data-act="defend"/.test(ph)}, Stop ${/data-act="stop"/.test(ph)}, Climb down ${/data-act="lookoutdown"/.test(ph)}; the bow on the ground beside him offers Defend ${groundDef}`);
    // the area takes the ground alone: a double tap, Group nearby, a banner
    G.updateVisibility();
    const [bx, by] = scr(below.x, below.y - CFG.SPRITE_LIFT / TL);
    UI.handleDoubleTap(bx, by);
    const dbl = UI.sel && UI.sel.type === 'unit' ? [UI.sel.id] : UI.sel && UI.sel.ids ? UI.sel.ids.slice() : [];
    const a4 = Units.spawn(below.kind, 'P', 29.5, 33.5); G.updateVisibility();   // a double tap gathers its own kind
    UI.handleDoubleTap(bx, by);
    const dbl2 = UI.sel && UI.sel.ids ? UI.sel.ids.slice() : UI.sel ? [UI.sel.id] : [];
    UI.deselect && UI.deselect();
    const perched = [a1, a2, a3].filter(u => u.perch === t.id);
    const areaOk = perched.length === 2 && dbl.length === 1 && dbl[0] === below.id &&
      dbl2.length === 2 && dbl2.includes(below.id) && dbl2.includes(a4.id) && !perched.some(u => dbl2.includes(u.id));
    if (perched.length < 2 || !below) { ck('anAreaSelectionLeavesTheTowersBows', false, `${perched.length} bows got up the tower`); return { res, fails }; }
    const nearUp = UI.groupmatesNear(perched[0]), nearDown = UI.groupmatesNear(below);
    S.armies = { 1: [perched[0].id, below.id, d1.id], 2: perched.map(u => u.id) };
    UI.selectArmy(1);
    const army1 = UI.sel && UI.sel.ids ? UI.sel.ids.slice() : [];
    UI.selectArmy(2);
    const army2 = UI.sel;
    UI.deselect && UI.deselect();
    ck('anAreaSelectionLeavesTheTowersBows', areaOk && !nearUp && nearDown && army1.length === 2 && !army1.includes(perched[0].id) && !army2 &&
      (S.armies[1] || []).includes(perched[0].id),
      `a double tap: ${dbl.length} then ${dbl2.length} selected (${perched.filter(u => dbl2.includes(u.id)).length} of the 2 up the tower); Group nearby from up there ${nearUp}, from below ${nearDown}; a banner: ${army1.length} of 3 taken in hand, the one up the tower kept on its roster ${(S.armies[1] || []).includes(perched[0].id)}; a banner all up the towers selects ${army2 ? 'SOMETHING' : 'nothing'}`);
    // a tap on the man himself still takes him in hand (how he is told what to shoot)
    const m = Lookout.aim(perched[0]);
    UI.handleTap(...scr(m.x / TL, m.y / TL));
    ck('butATapOnHimStillSelectsHim', UI.sel && UI.sel.type === 'unit' && UI.sel.id === perched[0].id, JSON.stringify(UI.sel));
    UI.deselect && UI.deselect();
  }

  /* ---- §4 twice the sight and the reach ---- */
  {
    clear('lk4');
    const t = put('tower', 20, 20, 1);
    const a = Units.spawn('archer', 'P', 20, 22);
    Lookout.order(a, t); step(3);
    const base = CFG.UNITS.archer.rng, vis = CFG.UNITS.archer.vision || CFG.UNIT_VISION;
    ck('aBowOnATowerReachesTwiceAsFarWithinWhatItSees', Math.abs(Combat.reachOf(a) - Math.min(base * C.rangeMult, Lookout.sightOf(a))) < 1e-9 && Combat.reachOf(a) > base,
      `${Combat.reachOf(a)} vs ${base} on the ground, ${base * C.rangeMult} doubled, the platform lights ${Lookout.sightOf(a)}`);
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

  /* ---- §4a HE SHOOTS ONLY WHAT IS SEEN (build 151) ---- */
  {
    clear('lk4a');
    const t = put('tower', 20, 20, 1);
    const m = Units.spawn('marksman', 'P', 20, 22);
    Lookout.order(m, t); step(3);
    const lit = Lookout.sightOf(m), dbl = CFG.UNITS.marksman.rng * C.rangeMult;
    const own = (CFG.UNITS.marksman.vision || CFG.UNIT_VISION) * C.sightMult;
    ck('theReachEndsAtTheLitGround', m.perch === t.id && lit === Math.max(own, Bld.lv(t).vision) && lit < dbl && Combat.reachOf(m) === lit,
      `a marksman on a level 1 tower: doubled reach ${dbl}, the platform lights ${lit} (his ${own}, the tower's ${Bld.lv(t).vision}), reach ${Combat.reachOf(m)}`);
    // the real fog from here on: what the player sees is what G.updateVisibility marks
    G.freeVis = false;
    const live = (sec, keep) => fight(sec, () => { G.updateVisibility(); keep(); });
    const fx = 20.5 + lit + 1.6;                    // past the lit ground, inside the old doubled reach
    const dark = Units.spawn('defender', 'A', fx, 20.5);
    const hp0 = dark.hp;
    G.updateVisibility();
    const unseen = !G.visibleAt(fx | 0, 20);
    live(6, () => { dark.x = fx; dark.y = 20.5; dark.path = null; dark.tUnit = 0; dark.hp = Math.max(dark.hp, 1); });
    ck('aFoeInTheDarkIsNeverStruck', unseen && dark.hp === hp0 && m.tUnit !== dark.id,
      `${(fx - 20.5).toFixed(1)} tiles out, seen ${!unseen}: ${hp0} → ${dark.hp}`);
    // …and one walking into the light is
    const nx = 20.5 + lit - 1.2;
    live(6, () => { dark.x = nx; dark.y = 20.5; dark.path = null; dark.tUnit = 0; dark.hp = Math.max(dark.hp, 1); });
    ck('andOneWalkingIntoTheLightIs', dark.hp < hp0 && !!G.visibleAt(nx | 0, 20),
      `${(nx - 20.5).toFixed(1)} tiles out: ${hp0} → ${Math.round(dark.hp)}`);
    // THE FOG ITSELF IS ASKED: inside the reach, on ground the player cannot see, nothing is marked
    dark.hp = dark.maxhp; m.tUnit = 0;
    const vis0 = G.visibleAt, hid = (x, y) => x === (nx | 0) && y === 20;
    G.visibleAt = function (x, y) { return hid(x, y) ? false : vis0.call(this, x, y); };
    let hpH = dark.hp;
    try {
      fight(6, () => { dark.x = nx; dark.y = 20.5; dark.path = null; dark.tUnit = 0; dark.hp = Math.max(dark.hp, 1); });
      hpH = dark.hp;
    } finally { G.visibleAt = vis0; }
    ck('aFoeInsideTheReachButUnseenIsNeverMarked', hpH === dark.maxhp && Math.hypot(nx - 20.5, 0) < Combat.reachOf(m),
      `inside the reach (${(nx - 20.5).toFixed(1)} of ${Combat.reachOf(m)}), its tile hidden: ${dark.maxhp} → ${hpH}`);
    G.freeVis = true; G.updateVisibility();
    // a stone tower watches farther, so its bows reach farther — never past their own doubled reach
    clear('lk4a3');
    const t3 = put('tower', 20, 20, 3);
    const m3 = Units.spawn('marksman', 'P', 20, 22), a3 = Units.spawn('archer', 'P', 20.4, 22);
    Lookout.order(m3, t3); Lookout.order(a3, t3); step(4);
    const w3 = Bld.lv(t3).vision;
    ck('aTowerThatSeesFartherLetsThemReachFarther', m3.perch === t3.id && a3.perch === t3.id &&
      Combat.reachOf(m3) === Math.min(dbl, w3) && Combat.reachOf(a3) === Math.min(CFG.UNITS.archer.rng * C.rangeMult, w3),
      `level 3 watches ${w3}: marksman ${Combat.reachOf(m3)}, archer ${Combat.reachOf(a3)} (doubled ${CFG.UNITS.archer.rng * C.rangeMult})`);
    // the placement ghost's ring is the reach a bow posted on a new tower would have
    const ring = Lookout.postReach('P'), L1 = CFG.BUILDINGS.tower.levels[0];
    ck('andThePlacementRingIsThatReach', ring === Math.min(dbl, Math.max(own, L1.vision)),
      `ring ${ring} — the farthest bow fielded (a marksman, ${dbl} doubled) on a new tower that watches ${Math.max(own, L1.vision)}`);
  }

  /* ---- §4b the player's tower shoots only through its bows (build 148) ---- */
  {
    // every arrow loosed from a tower's own crown (cx, cy - 0.6), every float
    // in the tower's own colour, and what the foe beside it lost
    const watch = (tw, foe, sec) => {
      let own = 0;
      const fx = foe.x, fy = foe.y, hp0 = foe.hp;
      const push0 = Combat.shots.push, f0 = R.float;
      Combat.shots.push = function (...a) {
        for (const sh of a) if (Math.abs(sh.x1 - (tw.x + 0.5)) < 1e-9 && Math.abs(sh.y1 - (tw.y - 0.1)) < 1e-9) own++;
        return push0.apply(this, a);
      };
      R.float = function (x, y, txt, col) { if (col === '#f0d27a') own++; return f0.apply(this, arguments); };
      try {
        fight(sec, () => { foe.x = fx; foe.y = fy; foe.path = null; foe.tUnit = 0; foe.tBld = 0; foe.task = null; foe.hp = Math.max(foe.hp, 1); });
      } finally { delete Combat.shots.push; R.float = f0; }
      return { own, lost: hp0 - foe.hp };
    };
    const empty = [];
    for (const lv of [1, 2, 3]) {
      clear('lk4b' + lv);
      const t = put('tower', 20, 20, lv);
      const foe = Units.spawn('defender', 'A', 22.5, 20.5);   // two tiles out: inside every level's old range
      empty.push(watch(t, foe, 6));
    }
    ck('anEmptyPlayerTowerShootsNothingAtAnyLevel', empty.every(w => w.own === 0 && w.lost === 0),
      `Lv1/Lv2/Lv3 — the tower's own arrows ${empty.map(w => w.own).join('/')}, the foe lost ${empty.map(w => w.lost).join('/')}`);
    // …and its panel says so, and how to man it
    clear('lk4bp');
    const tp = put('tower', 20, 20, 2);
    UI.select('bld', tp.id);
    const line = UI.panelSub().replace(/<[^>]+>/g, '');
    UI.deselect && UI.deselect();
    ck('andItsPanelSaysItShootsNothingUnmanned', /shoots nothing/.test(line) && /archers/.test(line), line);
    // manned, its bows shoot — and still nothing of the tower's own
    clear('lk4bm');
    const tm = put('tower', 20, 20, 2);
    const a = Units.spawn('archer', 'P', 20, 22);
    Lookout.order(a, tm); step(3);
    const fm = Units.spawn('defender', 'A', 22.5, 20.5);
    const man = watch(tm, fm, 6);
    ck('mannedItsBowsDoTheShooting', a.perch === tm.id && man.lost > 0 && man.own === 0,
      `perched ${a.perch === tm.id}; the foe lost ${man.lost}, the tower's own arrows ${man.own}`);
    // the rival's towers still fire by themselves
    clear('lk4br');
    const tr = put('tower', 20, 20, 2, 'A');
    const fr = Units.spawn('defender', 'P', 22.5, 20.5);
    const riv = watch(tr, fr, 6);
    ck('theRivalsTowersStillFireByThemselves', riv.own > 0 && riv.lost > 0, `the rival tower's arrows ${riv.own}, the foe lost ${riv.lost}`);
  }

  /* ---- §4c the platform makes a bow a better one, the same on every tower
     (build 149 — operator: "Tougher archers. Hit for more, take less damage.
     Two archers should be more powerful than the tower by itself
     previously"; build 150, on 149's ladder by storey: "That's way too much
     of a damage boost. How about the archers just do 50% more than what they
     do on the ground? No special damage based on the archer type. Better
     archers on the ground mean better archers in the tower, regardless of
     the towers level. The only benefit to higher towers is that they're
     harder to knock down") ---- */
  {
    const C = CFG.LOOKOUT;
    // what a pinned, unkillable foe loses in `sec` seconds (it never strikes back)
    const bleed = (foe, sec) => {
      foe.hp = foe.maxhp = 1e5;
      const fx = foe.x, fy = foe.y;
      fight(sec, () => { foe.x = fx; foe.y = fy; foe.path = null; foe.tUnit = 0; foe.tBld = 0; foe.task = null; foe.cd = 99; });
      return 1e5 - foe.hp;
    };
    const man = (t, kind) => {
      const bows = [Units.spawn(kind, 'P', 20, 22), Units.spawn(kind, 'P', 20.4, 22)];
      for (const a of bows) Lookout.order(a, t);
      step(4);
      return bows;
    };
    // "the tower by itself previously" is a RIVAL tower: it still fires the
    // old way (its storey's arrow every 1.4 s, the L1 fumble), and the foe
    // stands where both fires reach it
    const SEC = 30, rows = [];
    for (const lv of [1, 2, 3]) {
      clear('lk4cr' + lv);
      put('tower', 20, 20, lv, 'A');
      const old = bleed(Units.spawn('defender', 'P', 22.5, 20.5), SEC);
      const two = {};
      for (const kind of ['archer', 'longbow']) {
        clear('lk4cp' + lv + kind);
        const t = put('tower', 20, 20, lv);
        const bows = man(t, kind);
        two[kind] = bows.every(a => a.perch === t.id) ? bleed(Units.spawn('defender', 'A', 22.5, 20.5), SEC) : -1;
      }
      rows.push({ lv, old, archer: two.archer, longbow: two.longbow });
    }
    // (build 151: a quarter again a base archer's own blow, every storey —
    // the operator brought it down from build 150's half again. Two still
    // out-shoot the old wattle and timber towers; the stone storey's old
    // 19-point volley is now a shade ahead, and the row says by how much)
    // (build 162 — operator: "reduce archers in the tower to their normal on
    // the ground damage. They're too strong right now": up there a bow
    // strikes his ground blow, so the old tower's fire is no longer the bar;
    // the wattle storey's is still well under two archers', and the rows say
    // by how much on every storey)
    ck('twoArchersOutshootTheOldWattleTower', rows.filter(r => r.lv === 1).every(r => r.archer > r.old),
      rows.map(r => `Lv${r.lv}: two archers ${r.archer} vs the old tower ${r.old} (${(r.archer / Math.max(1, r.old)).toFixed(2)}x)`).join('; '));
    // the longbow is the slow bow (a blow every 1.4 swings, 6 to the
    // archer's 7): a quarter again his own blow out-shoots the timber
    // storeys' old fire, and comes short of the stone tower's 19-point
    // volley (build 150 — the storey adds nothing to a bow's blow)
    ck('andSoDoTwoLongbows', rows.filter(r => r.lv === 1).every(r => r.longbow > r.old),
      rows.map(r => `Lv${r.lv}: two longbows ${r.longbow} vs ${r.old}`).join('; '));

    // the numbers themselves: what a bow up there strikes and takes, floated
    // as dealt — ONE bow on the platform and a rival archer (def 0) trade shots
    const trade = [];
    for (const lv of [1, 2, 3]) {
      clear('lk4ct' + lv);
      const t = put('tower', 20, 20, lv);
      const a = Units.spawn('archer', 'P', 20, 22);
      Lookout.order(a, t); step(4);
      const r = Units.spawn('archer', 'A', 22.5, 20.5);
      a.hp = a.maxhp = 1e4; r.hp = r.maxhp = 1e4;
      const ours = [], theirs = [], f0 = R.float;
      R.float = function (x, y, txt, col) {
        if (col === '#f08a7a' && /^-\d+$/.test(txt)) (Math.hypot(x - r.x, y + 0.4 - r.y) < 0.05 ? ours : theirs).push(+txt.slice(1));
        return f0.apply(this, arguments);
      };
      const aHp = a.hp, rHp = r.hp, rx = r.x, ry = r.y;
      try { fight(12, () => { r.x = rx; r.y = ry; r.path = null; }); } finally { R.float = f0; }
      // the game's own figures (the L3 signal fire and home turf ride effAtk)
      const ground = Math.max(1, Math.round(Units.effAtk(r) - Units.effDef(a)));
      trade.push({ lv, ours, theirs, aLost: aHp - a.hp, rLost: rHp - r.hp, ground,
        hit: Math.max(1, Math.round(Units.effAtk(a) * C.atk - Units.effDef(r))),
        take: Math.max(1, Math.round(ground * C.hurt)),
        shown: UI.atkShown ? UI.atkShown(a) : -1, base: Math.round(Units.effAtk(a)), perched: a.perch === t.id });
    }
    ck('aBowUpThereHitsAsHeDoesOnTheGround', trade.every(w => w.perched && w.ours.length > 3 && w.ours.every(n => n === w.hit) && w.hit === w.base && w.shown === w.base),
      trade.map(w => `Lv${w.lv}: hits ${[...new Set(w.ours)].join('/')} (expected ${w.hit}, ${w.base} on the ground, panel ATK ${w.shown})`).join('; '));
    ck('andTakesLessThanABowOnTheGround', trade.every(w => w.theirs.length > 3 && w.theirs.every(n => n === w.take) && w.take < w.ground),
      trade.map(w => `Lv${w.lv}: takes ${[...new Set(w.theirs)].join('/')} (expected ${w.take}, on the ground ${w.ground})`).join('; '));
    ck('andTheNumberShownIsTheNumberTaken', trade.every(w => w.aLost === w.theirs.reduce((s, n) => s + n, 0) && w.rLost === w.ours.reduce((s, n) => s + n, 0)),
      trade.map(w => `Lv${w.lv}: took ${w.aLost} (floated ${w.theirs.reduce((s, n) => s + n, 0)}), dealt ${w.rLost} (floated ${w.ours.reduce((s, n) => s + n, 0)})`).join('; '));

    // an engine's stone lands covered too (asked where it lands, not where it was thrown)
    clear('lk4ce');
    const te = put('tower', 20, 20, 2);
    const [ae] = man(te, 'archer');
    ae.hp = ae.maxhp = 1e4;
    const cat = Units.spawn('catapult', 'A', 24.5, 20.5);
    cat.hp = cat.maxhp = 1e4; cat.cd = 99;   // it throws only the one stone below
    const h0 = ae.hp;
    Combat.launch(cat, ae.x, ae.y, { kind: 'unit', id: ae.id, dmg: 20, srcId: cat.id });
    fight(4, () => { cat.cd = 99; cat.tUnit = 0; });
    ck('anEnginesStoneLandsCoveredToo', ae.perch === te.id && h0 - ae.hp === Math.max(1, Math.round(20 * C.hurt)),
      `a 20 stone took ${h0 - ae.hp} (expected ${Math.max(1, Math.round(20 * C.hurt))})`);

    // off the platform nothing changes, and the tower's panel names what its storey gives
    clear('lk4cg');
    const g = Units.spawn('archer', 'P', 30, 30);
    const tl = put('tower', 20, 20, 3);
    man(tl, 'archer');
    UI.select('bld', tl.id);
    const tline = UI.panelSub().replace(/<[^>]+>/g, '');
    UI.deselect && UI.deselect();
    ck('offThePlatformABowIsItself', Lookout.atkMult(g) === 1 && Combat.covered(g, 7) === 7 && UI.atkShown(g) === CFG.UNITS.archer.atk,
      `atk ×${Lookout.atkMult(g)}, a 7 blow takes ${Combat.covered(g, 7)}, panel ATK ${UI.atkShown(g)}`);
    // build 151 made it a quarter tougher; build 162 took his blow back to
    // the ground's ("reduce archers in the tower to their normal on the
    // ground damage"), the toughness kept
    ck('hisGroundBlowAndAQuarterTougher', C.atk === 1 && Math.abs(1 / C.hurt - 1.25) < 1e-9, `atk ×${C.atk}, hurt ×${C.hurt}`);
    const pt = Math.round(100 / C.hurt - 100);
    ck('andTheTowerSaysWhatThePlatformGives', !/harder/.test(tline) && tline.includes(`and are ${pt}% tougher`) && /shoot all the tower sees/.test(tline), tline);

    // HALF AGAIN, EVERY BOW, EVERY STOREY (build 150): the platform's figure
    // is one number — no kind of bow and no storey of tower moves it — so a
    // bow up there strikes half again his own ground blow, and a better bow
    // on the ground is a better bow up there
    const grid = [];
    let fireOnTheGround = -1;
    for (const lv of [1, 2, 3]) {
      clear('lk4cf' + lv);
      const t = put('tower', 20, 20, lv);
      // the stone storey's signal fire still lifts the soldiers on the ground round it
      if (lv === 3) { const g3 = Units.spawn('archer', 'P', 20.5, 23.5); fireOnTheGround = Units.effAtk(g3); S.units = S.units.filter(o => o !== g3); }
      const ups = [];
      for (const kind of ['archer', 'longbow', 'marksman']) {
        const u = Units.spawn(kind, 'P', 20, 22);
        Lookout.order(u, t); step(3);
        const row = { lv, kind, perched: u.perch === t.id, atk: Lookout.atkMult(u), hurt: Lookout.hurtMult(u),
          shown: UI.atkShown(u), ground: Units.effAtk(u) };
        ups.push(row); grid.push(row);
        Lookout.down(u, null); step(2);
        S.units = S.units.filter(o => o !== u);
      }
    }
    ck('oneBoostForEveryBowAtEveryStorey', grid.length === 9 && grid.every(g => g.perched && g.atk === C.atk && g.hurt === C.hurt && g.shown === Math.round(g.ground * C.atk)),
      grid.map(g => `Lv${g.lv} ${g.kind}: ×${g.atk}, takes ×${g.hurt}, ATK ${g.shown} (ground ${Math.round(g.ground)})`).join('; '));
    const byKind = k => grid.filter(g => g.kind === k && g.lv === 1)[0];
    ck('aBetterBowOnTheGroundIsABetterBowUpThere', byKind('marksman').shown > byKind('archer').shown && byKind('archer').shown > byKind('longbow').shown,
      `on a Lv1 tower: marksman ${byKind('marksman').shown}, archer ${byKind('archer').shown}, longbow ${byKind('longbow').shown} — their ground order, kept`);
    // …and the storey adds no blow: the same ATK on a wattle, a timber and a
    // stone tower — the stone tower's signal fire lifts the ground round it,
    // never the bows on its own platform
    const sameAtL = k => new Set(grid.filter(g => g.kind === k).map(g => g.shown)).size === 1;
    ck('andTheTowersStoreyAddsNoBlow', ['archer', 'longbow', 'marksman'].every(sameAtL) && typeof C.atk === 'number' && C.atk === 1 && !Array.isArray(C.atk) && !Array.isArray(C.hurt) &&
      fireOnTheGround === CFG.UNITS.archer.atk + 2,
      `ATK by storey: ${['archer', 'longbow', 'marksman'].map(k => k + ' ' + grid.filter(g => g.kind === k).map(g => g.shown).join('/')).join(', ')}; CFG.LOOKOUT.atk ${JSON.stringify(C.atk)}, hurt ${JSON.stringify(C.hurt)}; an archer on the ground by the stone tower ${fireOnTheGround} (its signal fire)`);
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

  /* ---- §9 drawn inside the platform, tapped where drawn, told what to shoot, saved ---- */
  {
    clear('lk9');
    const t = put('tower', 30, 30, 2);
    const a = Units.spawn('archer', 'P', 30, 32); Lookout.order(a, t); step(3);
    const am = Lookout.aim(a);
    const tap = R.unitHit(a, am.x / TL, am.y / TL);
    ck('aBowOnATowerIsTappedWhereItIsDrawn', tap < 0.55, `dead-on ${tap.toFixed(2)}`);
    // THE BOWS STAND INSIDE THE PLATFORM (operator, build 147): every drawn
    // tower, both men up, at rest and drawing their bows
    clear('lk9b');
    G.updateVisibility(); R.holdBake = false;
    const towers = [];
    for (let lv = 1; lv <= 3; lv++) towers.push(put('tower', 20 + lv * 6, 24, lv));
    for (let lv = 1; lv <= 3; lv++) {
      S.wallLevel = lv;
      put('wall', 19 + lv * 6, 34, lv); towers.push(put('tower', 20 + lv * 6, 34, lv)); put('wall', 21 + lv * 6, 34, lv);
    }
    S.wallLevel = 1;
    const kinds = ['archer', 'longbow', 'marksman'];
    towers.forEach((tw, i) => { for (let k = 0; k < 2; k++) { const u = Units.spawn(kinds[(i + k) % 3], 'P', tw.x, tw.y + 1); Lookout.order(u, tw); } });
    step(3);
    const foe = Units.spawn('defender', 'A', 40, 44); foe.hp = foe.maxhp = 1e9;
    G.updateVisibility(); R.rebuildTerrain(); if (R.ensureTerrain) R.ensureTerrain(); if (R.redrawFog) R.redrawFog();
    UI.sel = null;
    const artPx = (spr) => { const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height;
      const q = c.getContext('2d'); q.drawImage(spr, 0, 0); return q.getImageData(0, 0, c.width, c.height).data; };
    /* THE BODY IS WHAT IS MEASURED, ON EVERY FRAME (build 162's re-measure):
       the rule's body is a frame's ink OPENED by two of its own pixels — a
       shaft, a string or a bow drops out, an arm, a cloak, a head stays. This
       check used to open the DRAWN picture instead, and at its zoom a frame
       is drawn up 1.8x with smoothing, which fused a marksman's bow and its
       string into one solid band the opening kept: his bow at rest read as a
       body 3.7px past the rail. And it read whichever frame the clock showed.
       So each frame of the pose is swapped for its own opened ink and drawn
       through the real draw path twice, white then black; what the two
       pictures disagree on is the body's coverage at the screen's pixels,
       and every frame of every man up there is visited in turn. */
    const OPEN = 2;
    const bodies = new Map();
    const bodyOf = (img) => {
      let bc = bodies.get(img);
      if (bc) return bc;
      const A = artPx(img), W = img.width, H = img.height, r = OPEN, ink = new Uint8Array(W * H), er = new Uint8Array(W * H), op = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) ink[i] = A[i * 4 + 3] > 128 ? 1 : 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let all = 1;
        for (let oy = -r; oy <= r && all; oy++) for (let ox = -r; ox <= r; ox++) {
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !ink[yy * W + xx]) { all = 0; break; }
        }
        er[y * W + x] = all;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (er[y * W + x])
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
          const xx = x + ox, yy = y + oy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) op[yy * W + xx] = 1;
        }
      bc = [255, 0].map(v => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const q = c.getContext('2d'), id = q.createImageData(W, H);
        for (let i = 0; i < W * H; i++) if (op[i]) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
        q.putImageData(id, 0, 0);
        return c;
      });
      bodies.set(img, bc);
      return bc;
    };
    // every state that shows a new frame of u's pose: its idle clock at rest,
    // its cooldown in a synced strike (else the strip's own clock)
    const frameStates = (u) => {
      const st = [], seen = new Set(), t0 = u.animT, c0 = u.cd;
      let fr = R.sheetFrames(u);
      if (!fr || !fr.length) return st;
      const key = R._sheetKey, synced = R._strikeK != null && window.BattleFX && BattleFX.cdOf;
      const fps = (Sprites.animFps && (Sprites.animFps[key] || Sprites.animFps[u.kind])) || 8;
      const span = synced ? BattleFX.cdOf(u) : (fr.length / fps) * 4;
      for (let i = 0; i <= 256; i++) {
        const v = span * (i + 0.5) / 257;
        if (synced) u.cd = v; else u.animT = v;
        fr = R.sheetFrames(u);
        const img = R.unitSprite(u), k = fr ? fr.indexOf(img) : -1;
        if (k < 0 || seen.has(fr.length + ':' + k)) continue;
        seen.add(fr.length + ':' + k);
        Lookout.feetAt(u, img);               // the feet are the real frames', read before any swap
        st.push({ u, v, synced, fr });
      }
      u.animT = t0; u.cd = c0;
      return st;
    };
    const bad = { front: [], inside: [], whole: [], placed: [] };
    let measured = 0, minShown = Infinity, maxSpill = -Infinity, maxReach = -Infinity, deepest = 0, statesSeen = 0;
    for (const tw of towers) {
      const crew = S.units.filter(u => u.perch === tw.id);
      const f = Lookout.frame(tw), P = f && f.P;
      const name = (f && f.spr._cfArt && f.spr._cfArt.fort ? 'wall' : 'free') + tw.level;
      if (crew.length !== 2 || !P) { bad.placed.push(`${name}: ${crew.length} up, ${P ? 'measured' : 'no platform'}`); continue; }
      const prof = Lookout.profile(P), A = artPx(f.spr), W = f.spr.width, H = f.spr.height, sc = f.r.w / W;
      const opq = (x, y) => x >= 0 && y >= 0 && x < W && y < H && A[(y * W + x) * 4 + 3] > 128;
      const front = (x, y) => opq(x, y) && prof[x] !== undefined && y >= prof[x];
      let xs0 = W, xs1 = -1;
      for (let x = 0; x < W; x++) if (prof[x]) { xs0 = Math.min(xs0, x); xs1 = Math.max(xs1, x); }
      for (const mode of ['idle', 'fight']) {
        for (const u of crew) { if (mode === 'fight') { u.tUnit = foe.id; u.task = { type: 'attack', on: foe.id }; } else { u.tUnit = 0; u.task = null; } }
        R.cam.z = 3; R.centerOn(tw.x + 0.5, tw.y);
        const z = R.cam.z * (R.dpr || 1);
        const X0 = f.r.x - 12, Y0 = f.r.y - 24, WW = f.r.w + 24, HH = f.r.h + 30;
        const read = () => { R.draw(0);
          return R.cv.getContext('2d').getImageData(Math.round((X0 - R.cam.x) * z), Math.round((Y0 - R.cam.y) * z), Math.round(WW * z), Math.round(HH * z)).data; };
        for (let i = 0; i < 40; i++) R.draw(0);        // the footings settle over frames first
        const withMen = read();
        const list = S.units; S.units = S.units.filter(u => !crew.includes(u));   // the same world with nobody up there
        const without = read();
        S.units = list;
        const again = read();                            // and nothing else moved meanwhile
        let noise = 0;
        for (let i = 0; i < again.length; i += 4) if (Math.abs(again[i] - withMen[i]) + Math.abs(again[i + 1] - withMen[i + 1]) + Math.abs(again[i + 2] - withMen[i + 2]) > 12) noise++;
        if (noise) bad.placed.push(`${name} ${mode}: ${noise} px moved between two identical frames`);
        if (globalThis.__dbg) globalThis.__dbg.push({ name, mode, X0, Y0, z, w: Math.round(WW * z), h: Math.round(HH * z), r: f.r, sc,
          diffs: (() => { const o = []; for (let py = 0; py < Math.round(HH * z); py++) for (let px = 0; px < Math.round(WW * z); px++) { const i = (py * Math.round(WW * z) + px) * 4;
            const dv = Math.abs(withMen[i] - without[i]) + Math.abs(withMen[i + 1] - without[i + 1]) + Math.abs(withMen[i + 2] - without[i + 2]);
            if (dv > 12) { const wx = X0 + (px + 0.5) / z, wy = Y0 + (py + 0.5) / z; o.push([Math.floor((wx - f.r.x) / sc), Math.floor((wy - f.r.y) / sc), dv]); } } return o; })() });
        const w = Math.round(WW * z), h = Math.round(HH * z);
        let frontHit = 0, minX = Infinity, maxX = -Infinity, low = -Infinity;
        // what is drawn of the men: in front of the tower's front never, and
        // where their heads and feet are. Their EXTENT is the body pass below:
        // an arrow loosed toward that side, or a bow held out over the
        // corner, may cross the tower's edge — a man may not (bodyOf)
        const top = crew.map(() => Infinity);
        const spots = crew.map(u => Lookout.spot(u, f));
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
          const i = (py * w + px) * 4;
          const dv = Math.abs(withMen[i] - without[i]) + Math.abs(withMen[i + 1] - without[i + 1]) + Math.abs(withMen[i + 2] - without[i + 2]);
          const wx = X0 + (px + 0.5) / z, wy = Y0 + (py + 0.5) / z;
          const ax = Math.floor((wx - f.r.x) / sc), ay = Math.floor((wy - f.r.y) / sc);
          // inside the front (two art pixels deep — the reach of the picture's
          // own resampling): exactly the tower, never a man
          let deep = true;
          for (let oy = -2; oy <= 2 && deep; oy++) for (let ox = -2; ox <= 2; ox++) if (!front(ax + ox, ay + oy)) { deep = false; break; }
          if (deep && dv > 12) frontHit++;
          if (dv <= 30) continue;
          low = Math.max(low, wy);
          spots.forEach((sp, k) => { if (Math.abs(wx - sp.x) < sp.B * 0.3) top[k] = Math.min(top[k], wy); });
        }
        // the BODY's extent: every frame of each man's pose in turn (the other
        // man as the clock left him), his opened ink drawn white, then black
        const states = [];
        for (const u of crew) states.push(...frameStates(u));
        statesSeen += states.length;
        const swapped = new Map();
        for (const s of states) if (!swapped.has(s.fr)) swapped.set(s.fr, s.fr.slice());
        const shots = [[], []];
        for (const c of [0, 1]) {
          for (const [arr, orig] of swapped) for (let i = 0; i < arr.length; i++) arr[i] = bodyOf(orig[i])[c];
          for (const s of states) {
            const t0 = s.u.animT, c0 = s.u.cd;
            if (s.synced) s.u.cd = s.v; else s.u.animT = s.v;
            shots[c].push(read());
            s.u.animT = t0; s.u.cd = c0;
          }
        }
        for (const [arr, orig] of swapped) for (let i = 0; i < arr.length; i++) arr[i] = orig[i];
        if (!states.length) bad.placed.push(`${name} ${mode}: no frame of the men could be visited`);
        states.forEach((s, j) => {
          const Wt = shots[0][j], Bk = shots[1][j];
          for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
            const i = (py * w + px) * 4;
            if (Wt[i] - Bk[i] < 128) continue;              // the body covers at least half this pixel
            minX = Math.min(minX, X0 + px / z); maxX = Math.max(maxX, X0 + (px + 1) / z);
          }
        });
        measured++;
        if (frontHit) bad.front.push(`${name} ${mode}: ${frontHit} px of a man over the tower's front`);
        // at rest within a world pixel of the outer posts (the picture's own
        // resampling); drawing his bow, his arm may reach over the side rail
        // by at most a sixth of his height, as an archer leans out to shoot
        const man = spots[0].y - spots[0].head;
        const l = f.r.x + xs0 * sc, rr = f.r.x + (xs1 + 1) * sc, tol = mode === 'fight' ? man / 6 : 1;
        const spill = Math.max(l - minX, maxX - rr);
        if (mode === 'fight') maxReach = Math.max(maxReach, spill / man); else maxSpill = Math.max(maxSpill, spill);
        if (!(minX >= l - tol && maxX <= rr + tol)) bad.inside.push(`${name} ${mode}: drawn ${minX.toFixed(1)}..${maxX.toFixed(1)} beyond the platform ${l.toFixed(1)}..${rr.toFixed(1)}`);
        const feet = Math.max(...spots.map(sp => sp.y));
        deepest = Math.max(deepest, low - feet);
        if (low > feet + 1) bad.inside.push(`${name} ${mode}: a man drawn ${(low - feet).toFixed(1)}px below his feet`);
        spots.forEach((sp, k) => { const man = sp.y - sp.head, shown = sp.rail - top[k];
          minShown = Math.min(minShown, shown / man);
          if (!(shown >= 0.55 * man)) bad.whole.push(`${name} ${mode}: ${Math.round(shown / man * 100)}% of a man shows over the rail`); });
      }
    }
    for (const u of S.units) if (u.perch) { u.tUnit = 0; u.task = null; }
    ck('everyTowerCarriesItsLookout', !bad.placed.length && measured === 12, bad.placed.join('; ') || `6 drawn towers, two up on each, ${measured} pictures`);
    ck('theTowersFrontIsAlwaysInFrontOfItsLookout', !bad.front.length, bad.front.join('; ') || 'the rail, the posts, the merlons and the ladder top stand in front of the men, pixel for pixel');
    ck('andTheyStandInsideThePlatform', !bad.inside.length, bad.inside.join('; ') || `between the corner posts, every frame (${statesSeen} pictures of the body: at rest no part of a man ${Math.max(0, maxSpill).toFixed(1)}px past the platform's edge; drawing, his arm ${Math.round(Math.max(0, maxReach) * 100)}% of his height over the rail, a bow or a loosed arrow aside), nothing ${deepest.toFixed(1)}px below their feet`);
    ck('andEachIsDrawnWhole', !bad.whole.length, bad.whole.join('; ') || `at least ${Math.round(minShown * 100)}% of every man over the rail, the rest behind it — never cut by a line`);
    // A MAN'S SIZE BESIDE THE VILLAGERS (operator, build 148: "could you make
    // them 40% bigger… They just look so so small relative to the villagers.
    // I think it breaks the illusion too much"): the man drawn up there, his
    // ink from crown to foot, against a villager's on the ground — on a free
    // tower at least two thirds of one, on a wall tower (denser art, so a
    // bigger man for the same art) at least nine tenths; build 162 ("they
    // still look a little tiny"): a villager's height on a free tower (0.95
    // at least), a tenth over him on a wall tower (1.05 at least)
    {
      const inkH = (img, D) => { const A = artPx(img), W = img.width, H = img.height; let t = -1, bt = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A[(y * W + x) * 4 + 3] > 128) { if (t < 0) t = y; bt = y; }
        return t < 0 ? 0 : (bt - t + 1) * D / H; };
      const v = Units.spawn('villager', 'P', 40, 40); R._faceMap.set(v, { x: v.x, y: v.y, dir: 's' });
      const vi = R.unitSprite(v), vh = inkH(vi, R.frameBox ? R.frameBox(v, vi, R.unitBox(v)) : R.unitBox(v));
      S.units = S.units.filter(o => o !== v);
      const short = [], seen = [];
      for (const tw of towers) {
        const f = Lookout.frame(tw), wall = !!(f && f.spr._cfArt && f.spr._cfArt.fort);
        for (const u of S.units.filter(o => o.perch === tw.id)) {
          R._faceMap.set(u, { x: u.x, y: u.y, dir: 's' });
          const p = Lookout.pic(u, Lookout.spot(u, f)), k = inkH(p.img, p.D) / vh;
          seen.push((wall ? 'wall' : 'free') + tw.level + ' ' + k.toFixed(2));
          if (!(k >= (wall ? 1.05 : 0.95))) short.push(`${wall ? 'wall' : 'free'}${tw.level} ${u.kind}: ${k.toFixed(2)} of a villager`);
        }
      }
      ck('andTheyStandAMansHeightBesideTheVillagers', vh > 20 && seen.length === 12 && !short.length, short.join('; ') ||
        `a villager ${vh.toFixed(1)}px; the bows up there ${[...new Set(seen)].join(', ')} of him`);
    }
    // the measurements are the art's own: the size it was measured on, the
    // front starting on a drawn pixel of every column, the feet behind the
    // front at both places, the places between the outer columns
    const off = [];
    for (const kind of ['free', 'wall']) Lookout.PLAT[kind].forEach((P, li) => {
      const tw = towers.find(x => x.level === li + 1 && !!(Lookout.frame(x).spr._cfArt || {}).fort === (kind === 'wall'));
      const f = tw && Lookout.frame(tw);
      if (!f || f.P !== P) { off.push(`${kind}${li + 1}: not drawn on its own picture`); return; }
      const A = artPx(f.spr), W = f.spr.width, prof = Lookout.profile(P);
      for (let x = 0; x < W; x++) if (prof[x] && !(A[(prof[x] * W + x) * 4 + 3] > 128)) off.push(`${kind}${li + 1}: column ${x}'s front starts on air`);
      for (const sx of P.slots.concat(P.solo)) if (!(prof[sx] && P.feet >= prof[sx])) off.push(`${kind}${li + 1}: feet ${P.feet} in front of the rail at ${sx}`);
    });
    ck('andTheMeasurementsAreTheArtsOwn', !off.length, off.slice(0, 6).join('; ') || 'sizes, fronts, feet and places agree with the shipped art');
    // HE STANDS ON HIS OWN FEET (build 147's review): the bow sheets do not
    // centre their man in his frame — facing south an archer stands 8 of 64
    // px left of its middle, a longbow facing south-west 12 right — so a man
    // drawn by his frame's middle hopped about the platform as he turned and
    // stood at a merlon beside his crenel. Every kind, all eight facings, at
    // rest and shooting, on every tower: the middle of his feet, read off
    // the very frame drawn, is his place
    {
      const dirs = { s: [0, 9], se: [7, 7], e: [9, 0], ne: [7, -7], n: [0, -9], nw: [-7, -7], w: [-9, 0], sw: [-7, 7] };
      const miss = []; let worst = 0, cases = 0;
      for (const tw of towers) {
        const f = Lookout.frame(tw);
        if (!f || !f.P) continue;
        for (const u of S.units) if (u.perch === tw.id) u.perch = 0;
        for (const kind of ['archer', 'longbow', 'marksman']) for (const pose of ['idle', 'fight']) for (const d of Object.keys(dirs)) {
          const a = Units.spawn(kind, 'P', tw.x, tw.y + 1), o = Units.spawn('archer', 'P', tw.x, tw.y + 1);
          a.perch = o.perch = tw.id; a.perchSlot = 1; o.perchSlot = 0;
          let foe = null;
          if (pose === 'fight') { foe = Units.spawn('defender', 'A', tw.x + dirs[d][0], tw.y + dirs[d][1]); a.tUnit = foe.id; a.task = { type: 'attack', on: foe.id }; }
          else R._faceMap.set(a, { x: a.x, y: a.y, dir: d });
          const s = Lookout.spot(a, f), p = Lookout.pic(a, s);
          const A = artPx(p.img), W = p.img.width, H = p.img.height;
          let top = -1, bot = -1;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A[(y * W + x) * 4 + 3] > 128) { if (top < 0) top = y; bot = y; }
          let sx = 0, n = 0;
          for (let y = Math.floor(bot - (bot - top) * 0.12); y <= bot; y++) for (let x = 0; x < W; x++) if (A[(y * W + x) * 4 + 3] > 128) { sx += x; n++; }
          const off = Math.abs(p.x + (sx / n + 0.5) * p.D / W - s.x) / s.B;
          worst = Math.max(worst, off); cases++;
          if (off > 0.06) miss.push(`${(f.spr._cfArt.fort ? 'wall' : 'free') + tw.level} ${kind} ${pose} ${d}: feet ${(off * 100).toFixed(0)}% of a man off his place`);
          S.units = S.units.filter(x => x !== a && x !== o && x !== foe);
        }
      }
      ck('heStandsOnHisOwnFeet', !miss.length && cases === 288, miss.slice(0, 4).join('; ') + (miss.length > 4 ? ` (+${miss.length - 4})` : '') ||
        `${cases} pictures — every kind, all eight facings, at rest and shooting: the feet within ${(worst * 100).toFixed(1)}% of a man of the place`);
    }
    // AND THEY STAY INSIDE WHICHEVER WAY THEY FACE (operator, build 148:
    // "make sure the physics of them staying inside the fence at the top of
    // the tower remains… It's okay if the archers are a little squished next
    // to each other, as long as their bodies stay inside the fence"). The
    // picture above meets each man in one facing and one frame of his
    // animation; this meets every one: every tower, at both places and
    // alone, every kind, at rest and drawing his bow, all eight facings,
    // every frame of the pose — the frame's ink opened by two of its own
    // pixels (a bow, a string, an arrow drop out; an arm, a cloak, a head
    // stay), placed exactly where Lookout.pic draws it. At rest no part of
    // him passes the platform's outer posts (a world pixel for the
    // resampling); drawing his bow, his arm reaches over the side rail by at
    // most a sixth of his height
    {
      const dirs = { s: [0, 9], se: [7, 7], e: [9, 0], ne: [7, -7], n: [0, -9], nw: [-7, -7], w: [-9, 0], sw: [-7, 7] };
      const ext = new Map();
      const opened = (img) => {
        let e = ext.get(img);
        if (e) return e;
        const A = artPx(img), W = img.width, H = img.height, r = 2, Mk = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) Mk[i] = A[i * 4 + 3] > 128 ? 1 : 0;
        let lo = Infinity, hi = -Infinity;
        for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) {
          let all = 1;
          for (let oy = -r; oy <= r && all; oy++) for (let ox = -r; ox <= r; ox++) if (!Mk[(y + oy) * W + x + ox]) { all = 0; break; }
          if (all) { lo = Math.min(lo, x - r); hi = Math.max(hi, x + r + 1); }
        }
        e = [lo, hi]; ext.set(img, e); return e;
      };
      const out = []; let rest = -Infinity, reach = -Infinity, cases = 0, frames = 0, poses = 0;
      for (const tw of towers) {
        const f = Lookout.frame(tw);
        if (!f || !f.P) continue;
        const name = (f.spr._cfArt.fort ? 'wall' : 'free') + tw.level;
        const prof = Lookout.profile(f.P), W = f.spr.width, sc = f.r.w / W;
        let xs0 = W, xs1 = -1;
        for (let x = 0; x < W; x++) if (prof[x]) { xs0 = Math.min(xs0, x); xs1 = Math.max(xs1, x); }
        const l = f.r.x + xs0 * sc, rr = f.r.x + (xs1 + 1) * sc;
        for (const u of S.units) if (u.perch === tw.id) u.perch = 0;
        // at rest he keeps watch in his resting facing whatever way he came up
        // (Lookout.restFace, build 162: the left man south-west, the right man
        // south-east, a lone man south); drawing his bow, any of the eight
        const restD = place => place === 'alone' ? Lookout.REST.solo : place === 0 ? Lookout.REST.left : Lookout.REST.right;
        for (const place of [0, 1, 'alone']) for (const kind of kinds) for (const pose of ['idle', 'fight']) for (const d of (pose === 'idle' ? [restD(place)] : Object.keys(dirs))) {
          const a = Units.spawn(kind, 'P', tw.x, tw.y + 1);
          a.perch = tw.id;
          let o = null, foe = null;
          if (place !== 'alone') { o = Units.spawn('archer', 'P', tw.x, tw.y + 1); o.perch = tw.id; a.perchSlot = place; o.perchSlot = 1 - place; }
          if (pose === 'fight') { foe = Units.spawn('defender', 'A', tw.x + dirs[d][0], tw.y + dirs[d][1]); a.tUnit = foe.id; a.task = { type: 'attack', on: foe.id }; }
          else R._faceMap.set(a, { x: a.x, y: a.y, dir: 'n' });   // came up facing away: the rest facing still holds
          const s = Lookout.spot(a, f), man = s.y - s.head, fr = R.sheetFrames(a);
          if (fr && R._sheetPose === pose && R._sheetFace === d) poses++;
          for (const img of fr || [R.unitSprite(a)]) {
            const D = R.frameBox ? R.frameBox(a, img, s.B) : s.B, x = s.x - D * Lookout.feetAt(a, img), k = D / img.width;
            const [lo, hi] = opened(img), over = Math.max(l - (x + lo * k), x + hi * k - rr);
            frames++;
            if (pose === 'fight') reach = Math.max(reach, over / man); else rest = Math.max(rest, over);
            if (over > (pose === 'fight' ? man / 6 : 1)) out.push(`${name} ${place} ${kind} ${pose} ${d}: ${over.toFixed(1)}px past the outer post (${Math.round(over / man * 100)}% of his height)`);
          }
          cases++;
          S.units = S.units.filter(x => x !== a && x !== o && x !== foe);
        }
      }
      ck('andStayInsideWhicheverWayTheyFace', !out.length && cases === 486 && poses === 486, out.slice(0, 4).join('; ') + (out.length > 4 ? ` (+${out.length - 4})` : '') ||
        `${cases} men (${poses} in the pose and facing asked), ${frames} frames — at rest the body ${Math.max(0, rest).toFixed(1)}px past the outer posts at worst; drawing, the arm ${Math.round(Math.max(0, reach) * 100)}% of his height over the side rail at worst`);
    }
    // AND EACH MAN'S HEALTH OVER HIM (build 148): two up there stand closer
    // together than a bar is wide, so two hurt men's bars stand side by side
    // over the pair — never one laid over the other, which read as one man's
    // health — each over its own man, the tower's own bar clear of both
    {
      const bad2 = []; let pairs = 0;
      const realBar = R.bar, g2 = document.createElement('canvas').getContext('2d');
      for (const tw of towers) {
        const f = Lookout.frame(tw);
        if (!f || !f.P) continue;
        const name = (f.spr._cfArt.fort ? 'wall' : 'free') + tw.level;
        for (const u of S.units) if (u.perch === tw.id) u.perch = 0;
        const men = [0, 1].map(k => { const m = Units.spawn(kinds[k], 'P', tw.x, tw.y + 1); m.perch = tw.id; m.perchSlot = k; m.hp = Math.round(m.maxhp * 0.4); return m; });
        const hp0 = tw.hp; tw.hp = Math.round(tw.maxhp * 0.5);
        const rects = [];
        R.bar = (g, x, y, w, h, frac, col) => rects.push({ x, y, w, h, col });
        try { Lookout.draw(g2, tw); } finally { R.bar = realBar; }
        tw.hp = hp0;
        const bars = rects.filter(r => r.col === '#7dbb5e').sort((a, c) => a.x - c.x);
        const sp = men.map(m => Lookout.spot(m)).sort((a, c) => a.x - c.x);
        pairs++;
        if (bars.length !== 2) { bad2.push(`${name}: ${bars.length} bars for two hurt men`); S.units = S.units.filter(o => !men.includes(o)); continue; }
        const [a, c] = bars;
        const apart = a.x + a.w <= c.x + 0.01 || a.y + a.h <= c.y + 0.01 || c.y + c.h <= a.y + 0.01;
        const over = bars.every((r, k) => r.x <= sp[k].x && sp[k].x <= r.x + r.w);
        if (!apart) bad2.push(`${name}: the bars overlap (${a.x.toFixed(1)}+${a.w.toFixed(1)} over ${c.x.toFixed(1)})`);
        if (!over) bad2.push(`${name}: a bar is not over its own man`);
        S.units = S.units.filter(o => !men.includes(o));
      }
      ck('andEachMansHealthStandsOverHim', !bad2.length && pairs === 6, bad2.join('; ') || `${pairs} towers, two hurt men on each: two bars side by side, each over its own man, as wide as a lone man's`);
    }
    // TOLD WHAT TO SHOOT (operator, build 147: "click archers on the tower and
    // then click an enemy and have them attack whoever I select… like a
    // house"): a bow tapped on the platform is selected; a foe tapped is shot
    // at from up there, a soldier or a house, while it is in the doubled reach
    {
      clear('lk9c');
      const t2 = put('tower', 30, 30, 2);
      const b1 = Units.spawn('archer', 'P', 30, 32), b2 = Units.spawn('longbow', 'P', 30, 32);
      Lookout.order(b1, t2); Lookout.order(b2, t2); step(3);
      G.updateVisibility(); R.cam.z = 3; R.centerOn(31, 32); UI.sel = null;
      const tapW = (wx, wy) => UI.handleTap((wx * TL - R.cam.x) * R.cam.z, (wy * TL - R.cam.y) * R.cam.z);
      const pins = [];
      const fightP = (sec) => { for (let k = 0; k < sec; k += 0.05) { Combat.update(0.05); Units.update(0.05); for (const [o, x, y] of pins) { o.x = x; o.y = y; o.path = null; } } };
      let m = Lookout.aim(b1); tapW(m.x / TL, m.y / TL);
      const picked = UI.sel && UI.sel.type === 'unit' && UI.sel.id === b1.id;
      const foe2 = Units.spawn('defender', 'A', 33, 35); foe2.hp = foe2.maxhp = 400; pins.push([foe2, foe2.x, foe2.y]);
      G.updateVisibility();
      tapW(foe2.x, foe2.y - CFG.SPRITE_LIFT / TL);
      const told = b1.task && b1.task.type === 'attack' && b1.tUnit === foe2.id;
      fightP(3);
      const shotUnit = foe2.hp < 400 && b1.perch === t2.id;
      S.units = S.units.filter(o => o !== foe2); pins.length = 0;
      const house = put('house', 35, 31, 1, 'A'); house.hp = house.maxhp = 2000; G.updateVisibility();
      UI.sel = { type: 'group', ids: [b1.id, b2.id] }; UI.renderPanel();
      tapW(house.x + 0.5, house.y + 0.5);
      const toldBoth = [b1, b2].every(o => o.task && o.task.type === 'attackBld' && o.tBld === house.id);
      fightP(4);
      const shotHouse = house.hp < 2000 && b1.perch === t2.id && b2.perch === t2.id;
      UI.sel = null;
      ck('aBowOnATowerShootsWhatItIsToldTo', picked && told && shotUnit && toldBoth && shotHouse,
        `tapped on the tower ${picked}; a soldier: ordered ${told}, shot from up there ${shotUnit}; a house: both ordered ${toldBoth}, shot from up there ${shotHouse} (${Math.round(house.hp)}/2000)`);
    }
    // a save carries it up there
    clear('lk9d');
    const t3 = put('tower', 30, 30, 2);
    const a3 = Units.spawn('archer', 'P', 30, 32); Lookout.order(a3, t3); step(3);
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
