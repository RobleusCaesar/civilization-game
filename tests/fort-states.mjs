/* THE FORT GOING UP AND COMING DOWN — CONTRACT

   Every wall, gate and tower is RAISED in three drawn stages and BATTERED in
   two drawn states, and each one is the finished piece's own picture in
   progress or in ruin: PixelLab edits OF the finished art (the image being
   edited, with the stage before and the stage after beside it on a context
   sheet, squared up and seen from high above — never isometric; ART_PLAN,
   "THE FORT GOING UP AND COMING DOWN").

     assets/fort/wall-l{n}-{b1,b2,b3,d1,d2}.png   the sixteen-mask curtain
     assets/fort/gate-l{n}-{b1,b2,b3,d1,d2}.png   [face, flank, door]
     assets/fort/tower-l{n}-{d1,d2}.png           the wall tower's body
     assets/buildings/tower-l{n}-{b1,b2,b3}.png   the Watchtower's raising
     assets/buildings/tower-l{n}-{d1,d2}.png      …and its damage

   What this pins:
     1. ON DISK. Every state is the same strip / canvas as the finished piece
        it belongs to, so it lands on exactly the finished pixels (a stage
        drawn on another canvas would jump on the frame the work completes).
     2. THE RAISING. A wall or gate site draws its drawn stage at FULL alpha
        through the finished piece's own anchoring; with no stage art the old
        55% ghost stands. Each stage is its own picture, and the work rises.
        A stage gatehouse carries no door. The Watchtower raises through its
        own PNG stages (tests/build-stages.mjs pins the routing).
     3. THE DAMAGE. Burn phase 1 wears the battered art and phase 2 the broken
        one — for a wall, a gate either way round, a bonded wall tower and a
        free-standing Watchtower — in the building pass AND the occlusion
        redraw (R.wornSprite is the one answer); with no art darkOf/ruinOf
        stand. A battered gatehouse hangs a battered door, and its passage is
        still cut out so an open gate still shows the ground through it. A
        broken Watchtower topples broken.

   Run this after touching any of:
     assets.js — FORT_STATES / _tryFortState / DMG_IDS / _tryDmg / dmgArt
     render.js — fortStateArt / dmgArt / wornSprite / ownStage / the site and
                 damage branches of the building draw / occludeByForts /
                 drawGateDoor / stageIcon / startCollapse
     assets/fort/*-b*.png, *-d*.png, assets/buildings/tower-l*-{b,d}*.png

     node tests/fort-states.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---- 1. ON DISK: every state on its finished piece's own canvas ----
{
  const dims = f => { const b = readFileSync(join(root, f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  const want = [], bad = [], same = [];
  for (const n of [1, 2, 3]) {
    for (const s of ['b1', 'b2', 'b3', 'd1', 'd2']) {
      want.push(['assets/fort/wall-l' + n + '-' + s + '.png', 'assets/fort/wall-l' + n + '.png']);
      want.push(['assets/fort/gate-l' + n + '-' + s + '.png', 'assets/fort/gate-l' + n + '.png']);
      want.push(['assets/buildings/tower-l' + n + '-' + s + '.png', 'assets/buildings/tower-l' + n + '.png']);
    }
    for (const s of ['d1', 'd2']) want.push(['assets/fort/tower-l' + n + '-' + s + '.png', 'assets/fort/tower-l' + n + '.png']);
  }
  const missing = want.filter(([f]) => !existsSync(join(root, f))).map(([f]) => f);
  for (const [f, fin] of want) {
    if (!existsSync(join(root, f))) continue;
    if (dims(f) !== dims(fin)) bad.push(f + ' ' + dims(f) + ' vs ' + dims(fin));
    if (readFileSync(join(root, f)).equals(readFileSync(join(root, fin)))) same.push(f);
  }
  ck('everyStateShips', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : want.length + ' files');
  ck('eachOnItsFinishedPiecesCanvas', bad.length === 0, bad.length ? bad.join('; ') : 'strip for strip, canvas for canvas');
  ck('andNoneIsTheFinishedPieceRenamed', same.length === 0, same.join(', '));
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // the checks read the art's pixels
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.evaluate(() => { Boot.force(); Screens._demo = false; G.newGame('fortstates', 'moderate', 'medium'); Screens.show('playing'); S.paused = true; });
/* Wait for the ART, not a timer: every state, the finished pieces they stand
   in for, and the Watchtower's PNGs (bounded — art that never lands fails
   the checks below rather than hanging the run). */
await p.waitForFunction(() => {
  const fs = Sprites.fortStates;
  if (!fs || !fs.wall || !fs.gate || !fs.tower) return false;
  for (let i = 0; i < 3; i++) {
    for (const s of ['b1', 'b2', 'b3', 'd1', 'd2']) if (!(fs.wall[i] && fs.wall[i][s] && fs.gate[i] && fs.gate[i][s])) return false;
    for (const s of ['d1', 'd2']) if (!(fs.tower[i] && fs.tower[i][s])) return false;
    if (!(Sprites.wallMask[i][10]._cfArt && Sprites.gateMask[i][0]._cfArt && Sprites.towerArt && Sprites.towerArt[i])) return false;
    if (!(Sprites.building.tower[i] && Sprites.building.tower[i]._cfArt)) return false;
    const d = Assets.dmg['tower-l' + (i + 1)], st = Assets.stages['tower-l' + (i + 1)];
    if (!(d && d[0] && d[1] && st && st[0] && st[1] && st[2])) return false;
  }
  return true;
}, null, { timeout: 90000 }).catch(() => {});

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const canvasOf = (c) => {
    if (!c || c.getContext) return c;
    const k = document.createElement('canvas');
    k.width = c.naturalWidth || c.width; k.height = c.naturalHeight || c.height;
    k.getContext('2d').drawImage(c, 0, 0);
    return k;
  };
  const px = (c0) => { const c = canvasOf(c0); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
  const opaque = (c0) => { const d = px(c0).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; };
  // the lowest opaque row in a band of columns — where the piece meets the ground
  const footRow = (c0, x0, x1) => { const im = px(c0); for (let y = im.height - 1; y >= 0; y--) { let n = 0;
    for (let x = x0; x < x1; x++) if (im.data[(y * im.width + x) * 4 + 3] > 127) n++;
    if (n >= (x1 - x0) * 0.25) return y; } return -1; };
  const FS = Sprites.fortStates || {}, ST = ['b1', 'b2', 'b3', 'd1', 'd2'];
  const landed = [0, 1, 2].every(i => ST.every(s => FS.wall && FS.wall[i] && FS.wall[i][s] && FS.gate && FS.gate[i] && FS.gate[i][s]) &&
    ['d1', 'd2'].every(s => FS.tower && FS.tower[i] && FS.tower[i][s]));
  ck('everyStateLanded', landed, landed ? '30 wall/gate strips + 6 wall-tower bodies decoded' : 'Sprites.fortStates incomplete');
  if (!landed) return { res, fails };

  // ---- 2a. each stage is its own picture, the work RISES, and it stands on the finished foot ----
  {
    const pieces = [];
    for (let i = 0; i < 3; i++) {
      pieces.push({ n: 'wall' + (i + 1), fin: Sprites.wallMask[i][10], st: k => FS.wall[i]['b' + k][10] });
      pieces.push({ n: 'gate' + (i + 1), fin: Sprites.gateMask[i][0], st: k => FS.gate[i]['b' + k][0], band: [0.12, 0.3] });
      pieces.push({ n: 'tower' + (i + 1), fin: Sprites.building.tower[i], st: k => Assets.stages['tower-l' + (i + 1)][k - 1] });
    }
    const dup = [], flat = [], foot = [];
    for (const pc of pieces) {
      const u = [1, 2, 3].map(k => canvasOf(pc.st(k)).toDataURL()), f = canvasOf(pc.fin).toDataURL();
      if (new Set([...u, f]).size !== 4) dup.push(pc.n);
      if (!(opaque(pc.st(1)) < opaque(pc.st(3)))) flat.push(pc.n + ' ' + opaque(pc.st(1)) + '→' + opaque(pc.st(3)));
      // the middle of the piece — but a gatehouse's middle is its PASSAGE, open
      // to the ground in the finished face, so it stands on its towers' feet
      const w = canvasOf(pc.fin).width, a = Math.round(w * (pc.band ? pc.band[0] : 0.3)), z = Math.round(w * (pc.band ? pc.band[1] : 0.7));
      const ff = footRow(pc.fin, a, z);
      for (const k of [2, 3]) { const fy = footRow(pc.st(k), a, z); if (Math.abs(fy - ff) > 4) foot.push(pc.n + '-b' + k + ' ' + fy + ' vs ' + ff); }
    }
    ck('eachStageIsItsOwnPicture', dup.length === 0, dup.length ? dup.join(', ') : '9 pieces × 3 stages, none the finished art');
    ck('andTheWorkRises', flat.length === 0, flat.length ? flat.join('; ') : 'stage 1 holds less than stage 3 on every piece');
    ck('onTheFinishedPiecesOwnGround', foot.length === 0, foot.length ? foot.join('; ') : 'the foot row within 4px — squared up, never tipped');
    const doorless = [0, 1, 2].every(i => [1, 2, 3].every(k => opaque(FS.gate[i]['b' + k][2]) === 0));
    ck('aGatehouseGoingUpHangsNoDoor', doorless, 'frame 2 is empty at every stage');
  }

  // ---- a world to draw: a short line, a gate, a lone tower and a bonded one ----
  const x0 = 20, y0 = 20;
  S.buildings = S.buildings.filter(bb => bb.key === 'tc');
  for (let y = y0 - 3; y < y0 + 14; y++) for (let x = x0 - 3; x < x0 + 14; x++) S.map.terrain[y * CFG.W + x] = T.GRASS;
  let id = 8e6;
  const put = (key, x, y, lv) => { const mx = Bld.def(key).levels[lv - 1].hp;
    const bb = { id: id++, key, owner: 'P', x, y, sz: 1, level: lv, hp: mx, maxhp: mx, construction: 0, upgrading: 0, raised: true, queue: [] };
    S.buildings.push(bb); return bb; };
  const wl = put('wall', x0, y0, 2), wm = put('wall', x0 + 1, y0, 2); put('wall', x0 + 2, y0, 2);
  put('wall', x0 + 6, y0, 2); const gt = put('gate', x0 + 7, y0, 2); put('wall', x0 + 8, y0, 2);
  put('wall', x0, y0 + 4, 3); const gv = put('gate', x0, y0 + 5, 3); put('wall', x0, y0 + 6, 3);
  const lone = put('tower', x0 + 6, y0 + 6, 2);
  put('wall', x0 + 9, y0 + 4, 1); const bond = put('tower', x0 + 10, y0 + 4, 1); put('wall', x0 + 11, y0 + 4, 1);
  Bld._block = null;
  for (let i = 0; i < S.map.explored.length; i++) S.map.explored[i] = 1;
  const vis = G.visibleAt; G.visibleAt = () => true;
  R.rebuildTerrain(); R.cam.z = 1;
  const hpAt = (bb, ph) => { bb.hp = bb.maxhp * (ph === 1 ? 0.5 : ph === 2 ? 0.05 : 1); };
  const drawn = (cx, cy) => {
    R.centerOn(cx, cy);
    const rec = [], o = R.blitBld;
    R.blitBld = function (g, spr, ...r) { rec.push({ spr, a: g.globalAlpha }); return o.call(R, g, spr, ...r); };
    try { R.draw(0.016); } finally { R.blitBld = o; }
    return rec;
  };

  // ---- 2b. THE RAISING, drawn at full alpha through the finished anchoring ----
  {
    const t = Bld.def('wall').levels[1].time, bad = [];
    for (const k of [0, 1, 2]) {
      wm.construction = t * (1 - (k + 0.5) / 3); wm.hp = Bld.siteStartHp(wm.maxhp);
      const want = R.fortStateArt(wm, 'b' + (k + 1)), rec = drawn(x0 + 1, y0);
      const hit = rec.find(r => r.spr === want);
      if (!want || !hit || hit.a !== 1 || want !== FS.wall[1]['b' + (k + 1)][R.wallMaskAt(wm.x, wm.y)]) bad.push('stage ' + (k + 1));
    }
    ck('aWallSiteWearsItsDrawnStage', bad.length === 0, bad.length ? bad.join(', ') : 'the mask\x27s own stage frame, full alpha');
    const gtT = Bld.def('gate').levels[1].time;
    gt.construction = gtT * 0.5; gt.hp = Bld.siteStartHp(gt.maxhp);
    const gw = R.fortStateArt(gt, 'b2'), grec = drawn(x0 + 7, y0);
    ck('soDoesAGatehouse', gw === FS.gate[1].b2[0] && grec.some(r => r.spr === gw && r.a === 1), 'its face at stage 2');
    gt.construction = 0; gt.hp = gt.maxhp;
    const keep = Sprites.fortStates; Sprites.fortStates = null;
    const ghost = drawn(x0 + 1, y0).find(r => r.spr === R.bldSprite(wm));
    Sprites.fortStates = keep;
    ck('withNoStageArtTheGhostStands', !!ghost && Math.abs(ghost.a - 0.55) < 1e-6, 'the finished shape at 55%');
    ck('andThePanelShowsTheStage', R.stageIcon(wm) === FS.wall[1]['b' + (Bld.stageOf(wm) + 1)][10], 'the straight run at this stage');
    wm.construction = 0; wm.hp = wm.maxhp;
  }

  // ---- 3. THE DAMAGE: the drawn state replaces darkOf/ruinOf, everywhere it is drawn ----
  {
    const bad = [];
    const cases = [
      { n: 'wall', bb: wl, want: k => FS.wall[1]['d' + k][R.wallMaskAt(wl.x, wl.y)] },
      { n: 'gate face', bb: gt, want: k => FS.gate[1]['d' + k][0] },
      { n: 'gate flank', bb: gv, want: k => FS.gate[2]['d' + k][1] },
      { n: 'bonded tower', bb: bond, want: k => FS.tower[0]['d' + k] },
      { n: 'watchtower', bb: lone, want: k => Assets.dmg['tower-l2'][k - 1] },
    ];
    for (const c of cases) for (const k of [1, 2]) {
      hpAt(c.bb, k);
      if (Bld.burnPhase(c.bb) !== k || R.wornSprite(c.bb) !== c.want(k)) bad.push(c.n + ' d' + k);
    }
    ck('battered,ThenBrokenOpen', bad.length === 0, bad.length ? bad.join(', ') : 'phase 1 → d1, phase 2 → d2 for all five');
    hpAt(lone, 1);
    ck('theWatchtowersScarsLandWhereItStands', R.wornSprite(lone)._cfArt === R.bldSprite(lone)._cfArt, 'the finished PNG\x27s own anchoring');
    for (const c of cases) hpAt(c.bb, 0);
    ck('anUnhurtPieceIsTheFinishedPiece', cases.every(c => R.wornSprite(c.bb) === R.bldSprite(c.bb)), '');
    // with no art, the derived look stands
    hpAt(wl, 1); hpAt(lone, 2);
    const keepF = Sprites.fortStates, keepD = Assets.dmg; Sprites.fortStates = null; Assets.dmg = {};
    const fb = R.wornSprite(wl) === R.darkOf(R.bldSprite(wl)) && R.wornSprite(lone) === R.ruinOf(R.bldSprite(lone));
    Sprites.fortStates = keepF; Assets.dmg = keepD;
    ck('withNoDamageArtDarkOfAndRuinOfStand', fb, '');
    // the building pass draws it…
    const rec = drawn(x0 + 1, y0);
    ck('theBuildingPassDrawsTheScars', rec.some(r => r.spr === FS.wall[1].d1[R.wallMaskAt(wl.x, wl.y)]), '');
    // …and so does the redraw that puts a wall back in front of a man behind it
    const u = { id: 7e6, kind: 'villager', owner: 'P', x: wl.x + 0.5, y: wl.y - 0.4, hp: 40 };
    const o = R.blitBld, seen = [];
    R.blitBld = function (g, spr, ...r) { seen.push(spr); return o.call(R, g, spr, ...r); };
    try { R.occludeByForts(R.g, u); } finally { R.blitBld = o; }
    ck('andSoDoesTheOcclusionRedraw', seen.includes(FS.wall[1].d1[R.wallMaskAt(wl.x, wl.y)]) && !seen.includes(R.darkOf(R.bldSprite(wl))), '');
    hpAt(wl, 0); hpAt(lone, 0);
  }

  // ---- 3b. A BATTERED GATEHOUSE HANGS A BATTERED DOOR, its passage still cut ----
  {
    const bad = [];
    for (const lv of [1, 2, 3]) {
      gt.level = lv; gt.maxhp = Bld.def('gate').levels[lv - 1].hp; hpAt(gt, 1);
      const got = [];
      const g = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage(img) { got.push(img); } };
      R.drawGateDoor(g, gt, gt.x * CFG.TILE, gt.y * CFG.TILE, CFG.TILE, 0, true);
      const dd = FS.gate[lv - 1].d1[2];
      if (!got.length || !got.every(im => im === dd)) bad.push('L' + lv);
    }
    gt.level = 2; gt.maxhp = Bld.def('gate').levels[1].hp; hpAt(gt, 0);
    ck('aBatteredGatehouseHangsABatteredDoor', bad.length === 0, bad.length ? bad.join(', ') : 'every tier');
    const cover = (c0, D) => { const im = px(c0); let n = 0, t = 0;
      for (let y = D.y0; y < D.y1; y++) for (let x = D.x0; x < D.x1; x++) { t++; if (im.data[(y * im.width + x) * 4 + 3] > 127) n++; } return n / t; };
    const open = [];
    for (let i = 0; i < 3; i++) for (const s of ['d1', 'd2']) {
      const D = Assets.FORT_DOOR[i], f = cover(FS.gate[i][s][0], D);
      if (f > 0.25) open.push('L' + (i + 1) + ' ' + s + ' ' + Math.round(f * 100) + '%');
    }
    ck('andItsPassageIsStillSeeThrough', open.length === 0, open.length ? open.join(', ') : 'an open gate still shows the ground');
  }

  // ---- 3c. a broken Watchtower topples BROKEN ----
  {
    lone.hp = 0;
    const n0 = R.collapses.length;
    R.startCollapse(lone);
    const c = R.collapses[R.collapses.length - 1];
    ck('aBrokenWatchtowerTopplesBroken', R.collapses.length === n0 + 1 && c.spr === Assets.dmg['tower-l2'][1], 'the fall is cut from its broken self');
    R.collapses.length = n0; lone.hp = lone.maxhp;
  }
  G.visibleAt = vis;
  return { res, fails };
});
Object.assign(res, out.res); fails.push(...out.fails);
console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL FORT-STATES CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs);
await b.close();
process.exit(fails.length || realErrs.length ? 1 : 0);
