/* THE HALL ON FIRE CONTRACT — the Town Center burns in its own art and comes
   down as the run's last beat (R.HALL_FIRE / hallFirePic / drawHallSmoke /
   startHallFall / drawHallFallSky / groundHeld in js/render.js,
   Assets.wantHallFire in js/assets.js, the held curtain in G.end).

   Operator, build 164: "work on the animations for the Town Center under
   attack. We have charred ruins and fire, but it looks really basic… There
   should be fire inside the building, coming from the building, part of the
   building, not just fire sprites placed on top of a darkened building…
   Since this is the culmination of the game, this should look epic, you're
   either watching your TC be destroyed in horror, or feeling extreme
   satisfaction at almost winning."

     NOTHING AT BOOT    No hall-fire strip is asked for by the boot or the
                        title's demo world; a hall asks for its own level's
                        five strips the first time it is HURT, once.
     ITS OWN ART        The burn phase picks the state (catch, blaze, gutted);
                        the frame lands on the finished picture (scale 4/3);
                        every caller draws the one scratch (wornSprite), the
                        footing's yard the plain hall; no flame sprite is laid
                        over it, and without the art the old flames stand in.
     NO RNG, NO STATE   The smoke and the embers draw from their own stream:
                        never the page's Math.random, never S.
     IT FALLS IN ITS    The fall is drawn in the building pass in the hall's
     OWN PLACE          own place; the ash, the remains and every repaint its
                        death asks for wait until it is down.
     THE CURTAIN WAITS  A fall the player sees holds the end screen
                        HALL_FIRE.holdMs (the run is already over: S.over and
                        its score); a hidden page, a new world, an unseen fall
                        or a missing fall strip show the ending at once.
     THE WORDS          "YOUR HALL HAS FALLEN" / "THE RIVAL'S HALL HAS FALLEN".
     NOT IN THE BLACK   The smoke over a hall on the first row stays on the board.

   Served over HTTP: the registration and the black are read off pixels, and a
   page from disk taints every canvas a PNG touches.

     node tests/hall-fire.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const fireReq = [];
const srv = createServer(async (rq, rs) => {
  try {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    if (/^\/assets\/fire\//.test(u)) fireReq.push(u);
    const f = join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
    if (!f.startsWith(root)) { rs.writeHead(403); rs.end(); return; }
    const body = await readFile(f);
    rs.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' });
    rs.end(body);
  } catch (e) { rs.writeHead(404); rs.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 760, height: 620 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
// the title's demo world runs a while: it must ask for nothing
await p.waitForTimeout(2500);
const bootReq = fireReq.length;
const results = {}, fails = [];
const ck = (n, ok, i) => { results[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

ck('nothingIsAskedForAtBoot', bootReq === 0, bootReq + ' fire strips asked for by the boot and the demo');
{
  const v = await p.evaluate(() => {
    // the demo's own hall, hurt, asks for nothing either
    const tc = Bld.tcOf('P');
    const was = tc && tc.hp;
    if (tc) tc.hp = tc.maxhp * 0.3;
    const art = tc ? R.hallFireArt(tc) : null;
    if (tc) tc.hp = was;
    return { demo: !!Screens._demo, art: art === null, asked: Object.keys(Assets._hallAsked).length };
  });
  ck('theDemoWorldsHallAsksForNothing', v.demo && v.art && v.asked === 0, JSON.stringify(v));
}

// ---- a world of our own, its hall on open ground ----
await p.evaluate(() => {
  G.newGame('hallfire1', 'moderate', 'medium');
  Screens._demo = false; Screens.show('playing'); if (window.Boot && Boot.force) Boot.force();
  S.paused = true;
  const tc = Bld.tcOf('P');
  for (let dy = -4; dy <= 5; dy++) for (let dx = -4; dx <= 5; dx++) {
    const x = tc.x + dx, y = tc.y + dy;
    if (MapGen.onBoard(x, y) && !Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
  }
  S.units = S.units.filter(u => Math.hypot(u.x - tc.x, u.y - tc.y) > 7);
  Bld._block = null; R.rebuildTerrain();
  G.freeVis = true; G.updateVisibility();
  R.cam.z = 2; R.centerOn(tc.x + 1, tc.y + 0.6);
  window.__tc = tc;
});
{
  const v = await p.evaluate(() => {
    const tc = __tc; tc.level = 1;
    for (let i = 0; i < 6; i++) R.draw(1 / 60);
    return { asked: Object.keys(Assets._hallAsked).length, art: R.hallFireArt(tc) };
  });
  ck('aWholeHallAsksForNothing', v.asked === 0 && v.art === null, JSON.stringify(v));
}
await p.evaluate(() => { __tc.hp = __tc.maxhp * 0.5; for (let i = 0; i < 3; i++) R.draw(1 / 60); });
await p.waitForFunction(() => ['catch', 'blaze', 'gutted', 'fall', 'ruin'].every(st => Assets.hallFireStrip(1, st)), null, { timeout: 30000 }).catch(() => {});
{
  await p.evaluate(() => { for (let i = 0; i < 6; i++) R.draw(1 / 60); });
  const mine = fireReq.filter(u => /tc-l1-/.test(u)).map(u => u.split('/').pop()).sort();
  const want = ['tc-l1-blaze.png', 'tc-l1-catch.png', 'tc-l1-fall.png', 'tc-l1-gutted.png', 'tc-l1-ruin.png'];
  ck('aHurtHallAsksForItsLevelsFiveStripsOnce',
    JSON.stringify(mine) === JSON.stringify(want) && fireReq.length === 5,
    fireReq.join(', '));
}

// ---- the state follows the burn phase ----
{
  const v = await p.evaluate(() => {
    const tc = __tc, at = f => { tc.hp = tc.maxhp * f; const a = R.hallFireArt(tc); return a ? (['catch', 'blaze', 'gutted', 'fall', 'ruin'].find(st => Assets.hallFireStrip(1, st) === a) || '?') : null; };
    return { whole: at(1), scratch: at(0.99), catch: at(0.8), blaze: at(0.5), gutted: at(0.05) };
  });
  ck('theBurnPhasePicksTheState',
    v.whole === null && v.scratch === null && v.catch === 'catch' && v.blaze === 'blaze' && v.gutted === 'gutted',
    JSON.stringify(v));
}

// ---- it lands on the finished picture, at every level ----
for (const lv of [1, 2, 3]) {
  await p.evaluate((lv) => { __tc.level = lv; __tc.hp = __tc.maxhp * 0.8; R.draw(1 / 60); }, lv);
  await p.waitForFunction((lv) => Assets.hallFireStrip(lv, 'catch'), lv, { timeout: 30000 }).catch(() => {});
  const v = await p.evaluate((lv) => {
    const tc = __tc;
    const mask = (draw) => {
      const c = document.createElement('canvas'); c.width = c.height = 400;
      const g = c.getContext('2d'); g.translate(100, 200); draw(g);
      const d = g.getImageData(0, 0, 400, 400).data, m = new Uint8Array(400 * 400);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
      return m;
    };
    tc.hp = tc.maxhp;
    const fin = R.bldSprite(tc);
    const A = mask(g => R.blitBld(g, fin, 0, 0, 200, 200));
    const strip = Assets.hallFireStrip(lv, 'catch');
    if (!strip) return { missing: true };
    const fr = R._hallFrame(-99, strip, 0);
    const B = mask(g => R.blitBld(g, fr, 0, 0, 200, 200));
    // the hall's own pixels: where the fire adds flame above the roof, B
    // grows — so measure how much of the finished hall the frame covers, and
    // how far the frame's foot sits from the finished foot
    let both = 0, a = 0, footA = -1, footB = -1;
    for (let i = 0; i < A.length; i++) { if (A[i]) { a++; if (B[i]) both++; footA = Math.max(footA, (i / 400) | 0); } if (B[i]) footB = Math.max(footB, (i / 400) | 0); }
    R._hallScr.delete(-99);
    return { cover: +(both / Math.max(1, a)).toFixed(3), footA, footB, scale: fr._cfArt && fr._cfArt.scale };
  }, lv);
  ck('itLandsOnTheFinishedPicture_l' + lv,
    !v.missing && v.cover >= 0.9 && Math.abs(v.footA - v.footB) <= 3 && Math.abs(v.scale - 4 / 3) < 1e-9,
    JSON.stringify(v));
}

// ---- every caller draws the one picture; no flame sprite over it ----
{
  const v = await p.evaluate(() => {
    const tc = __tc; tc.level = 1; tc.hp = tc.maxhp * 0.5;
    const seen = [], flames = [];
    const oB = R.blitBld, oS = Assets.drawSprite;
    R.blitBld = function (g, spr, ...r) { seen.push(spr); return oB.call(this, g, spr, ...r); };
    Assets.drawSprite = function (g, key, ...r) { flames.push(key); return oS.call(this, g, key, ...r); };
    let flameOld = 0;
    try {
      R.draw(1 / 60);
      const scr = R._hallScr.get(tc.id);
      const out = {
        worn: R.wornSprite(tc) === scr, drawn: seen.includes(scr),
        plain: R.wornSprite(tc, true) !== scr,
        flames: flames.filter(k => /flame/.test(k)).length,
      };
      // control: with the art stood down, the old flames stand in
      R.HALL_FIRE.on = false; flames.length = 0;
      R.draw(1 / 60);
      flameOld = flames.filter(k => /flame/.test(k)).length;
      R.HALL_FIRE.on = true;
      out.flameOld = flameOld;
      return out;
    } finally { R.blitBld = oB; Assets.drawSprite = oS; R.HALL_FIRE.on = true; }
  });
  ck('everyCallerDrawsTheOnePicture', v.worn && v.drawn, JSON.stringify(v));
  ck('andTheFootingMeasuresThePlainHall', v.plain, '');
  ck('noFlameSpriteIsLaidOverItsOwnFire', v.flames === 0 && v.flameOld > 0, 'own fire ' + v.flames + ' flame sprites; old look ' + v.flameOld);
}

// ---- no RNG, no state ----
{
  const v = await p.evaluate(async () => {
    const tc = __tc; tc.hp = tc.maxhp * 0.05;
    const rng0 = S.rngState, bl0 = JSON.stringify(S.buildings);
    let calls = 0;
    const oR = Math.random, oD = R.drawHallSmoke;
    R.drawHallSmoke = function (...a) { const m = Math.random; Math.random = () => { calls++; return m(); }; try { return oD.apply(this, a); } finally { Math.random = m; } };
    // the smoke lives on the page's clock: draw across two real seconds
    try { for (let i = 0; i < 60; i++) { R.draw(1 / 30); await new Promise(r => setTimeout(r, 33)); } }
    finally { R.drawHallSmoke = oD; Math.random = oR; }
    const fx = R._hallFx.get(tc.id);
    return { calls, rng: S.rngState === rng0, same: JSON.stringify(S.buildings) === bl0, puffs: fx ? fx.puffs.length : 0, embers: fx ? fx.embers.length : 0 };
  });
  ck('theSmokeAndEmbersDrawNoRng', v.calls === 0 && v.rng, JSON.stringify(v));
  ck('andWriteNothing', v.same, '');
  ck('andTheyAreThere', v.puffs > 10 && v.embers > 10, v.puffs + ' puffs, ' + v.embers + ' embers');
}

// ---- nothing in the black: the smoke over a hall on the first row ----
{
  const v = await p.evaluate(async () => {
    const tc = __tc, ox = tc.x, oy = tc.y;
    tc.y = 1; Bld._block = null;
    G.updateVisibility();
    R.cam.z = 2; R.centerOn(tc.x + 1, 1.5);
    tc.hp = tc.maxhp * 0.05;
    for (let i = 0; i < 70; i++) { R.draw(1 / 30); await new Promise(r => setTimeout(r, 33)); }
    const bp = R.boardPx(), z = R.cam.z * R.dpr;
    const top = Math.floor((bp.y0 - R.cam.y) * z) - 2;
    let lit = 0, n = 0;
    if (top > 4) {
      const d = R.cv.getContext('2d').getImageData(0, 0, R.cv.width, top).data;
      for (let i = 0; i < d.length; i += 4) { n++; if (Math.abs(d[i] - 13) > 6 || Math.abs(d[i + 1] - 11) > 6 || Math.abs(d[i + 2] - 8) > 6) lit++; }
    }
    // the control: the column really rises past the board's edge, so the
    // band read above is where it would be drawn if it were not held back
    const fx = R._hallFx.get(tc.id);
    const over = fx ? fx.puffs.filter(q => q.y - CFG.TILE * 1.05 * q.t * (1 - q.t / q.life * 0.25) < bp.y0).length + fx.embers.filter(e => e.y < bp.y0).length : 0;
    tc.y = oy; tc.x = ox; Bld._block = null; G.updateVisibility();
    R.cam.z = 2; R.centerOn(tc.x + 1, tc.y + 0.6);
    return { top, n, lit, over };
  });
  ck('nothingIsDrawnInTheBlack', v.top > 4 && v.n > 0 && v.lit === 0, JSON.stringify(v));
  ck('andTheProbeIsUnderTheSmoke', v.over > 0, v.over + ' puffs and sparks past the board\'s edge');
}

// ---- the fall: in its own place, the ground waits, the curtain waits ----
{
  const v = await p.evaluate(() => {
    const tc = __tc; tc.level = 1; tc.hp = tc.maxhp * 0.05; R.draw(1 / 60);
    const idx = MapGen.idx(tc.x, tc.y);
    S.paused = false;
    Bld.damage(tc, 1e9);
    const c = R.collapses.find(z => z.hall);
    const seen = [];
    const oB = R.blitBld;
    R.blitBld = function (g, spr, ...r) { seen.push(spr); return oB.call(this, g, spr, ...r); };
    try { R.draw(1 / 60); } finally { R.blitBld = oB; }
    const scr = R._hallScr.get(tc.id);
    return {
      over: !!S.over, cause: S.over && S.over.cause, score: S.over && typeof S.over.score === 'number',
      screen: Screens.current, hallFall: R.hallFall === c && !!c, pseudo: !!(c && c.pseudo && c.pseudo._fall === c),
      drawn: seen.includes(scr), held: R.groundHeld(), holds: !!(R._groundHold && R._groundHold.has(idx)),
      ash: !!R.collapseAt(tc.x, tc.y), ruinTile: S.map.terrain[idx] === T.RUIN,
    };
  });
  ck('theRunIsOverAtOnce', v.over && v.cause === 'tc_destroyed' && v.score, JSON.stringify(v));
  ck('itFallsInItsOwnPlace', v.hallFall && v.pseudo && v.drawn, '');
  ck('theGroundWaitsForIt', v.held && v.holds && v.ash && v.ruinTile, 'rubble in state, the picture held');
  ck('theCurtainWaitsForTheFall', v.screen === 'playing', 'screen ' + v.screen);
  const t0 = Date.now();
  await p.waitForFunction(() => Screens.current === 'endgame', null, { timeout: 15000 }).catch(() => {});
  const held = Date.now() - t0;
  const hold = await p.evaluate(() => R.HALL_FIRE.holdMs);
  ck('andThenComes', held >= hold * 0.75 && held <= hold + 4000, held + 'ms (hold ' + hold + 'ms)');
  // the fall ends: the ground is let go and painted
  const w = await p.evaluate(() => {
    R.drawCollapses(R.g, 60);
    return { held: R.groundHeld(), left: R.collapses.filter(z => z.hall).length, fall: R.hallFall };
  });
  ck('whenItIsDownTheGroundIsLetGo', !w.held && w.left === 0 && w.fall === null, JSON.stringify(w));
}

// ---- a hidden page, a new world, an unseen fall, a missing strip: at once ----
const fresh = async (seed, setup) => p.evaluate(({ seed, setup }) => {
  G.newGame(seed, 'moderate', 'medium');
  Screens._demo = false; Screens.show('playing'); S.paused = false;
  G.freeVis = true; G.updateVisibility();
  const tc = Bld.tcOf(setup === 'rival' || setup === 'fog' ? 'A' : 'P');
  tc.level = 1; tc.hp = tc.maxhp * 0.05;
  window.__tc = tc;
  R.cam.z = 2; R.centerOn(tc.x + 1, tc.y + 0.6);
  R.draw(1 / 60);
}, { seed, setup });
{
  await fresh('hallfire2', 'hidden');
  const v = await p.evaluate(() => {
    Bld.damage(__tc, 1e9);
    const before = Screens.current;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const after = Screens.current;
    delete document.hidden;
    return { before, after };
  });
  ck('aHiddenPageIsShownItsEndingAtOnce', v.before === 'playing' && v.after === 'endgame', JSON.stringify(v));
}
{
  await fresh('hallfire3', 'world');
  await p.evaluate(() => { Bld.damage(__tc, 1e9); G.newGame('hallfire3b', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); });
  await p.waitForTimeout(4600);
  const v = await p.evaluate(() => ({ screen: Screens.current, over: !!S.over, held: R.groundHeld() }));
  ck('aNewWorldInTheBeatShowsNoEnding', v.screen === 'playing' && !v.over && !v.held, JSON.stringify(v));
}
{
  await fresh('hallfire4', 'rival');
  const v = await p.evaluate(() => {
    let title = null;
    const oT = R.actTitle;
    R.actTitle = function (g, t, ...r) { title = t; return oT.call(this, g, t, ...r); };
    Bld.damage(__tc, 1e9, undefined, 'P');
    try { for (let i = 0; i < 40; i++) R.draw(1 / 30); } finally { R.actTitle = oT; }
    return { win: !!(S.over && S.over.win), screen: Screens.current, title, fall: !!R.hallFall };
  });
  ck('theRivalsHallFallsForTheVictoryToo', v.win && v.screen === 'playing' && v.fall, JSON.stringify(v));
  ck('andItsWordsAreTheVictorys', v.title === "THE RIVAL'S HALL HAS FALLEN", String(v.title));
}
{
  await fresh('hallfire5', 'own');
  const v = await p.evaluate(() => {
    let title = null;
    const oT = R.actTitle;
    R.actTitle = function (g, t, ...r) { title = t; return oT.call(this, g, t, ...r); };
    Bld.damage(__tc, 1e9);
    try { for (let i = 0; i < 40; i++) R.draw(1 / 30); } finally { R.actTitle = oT; }
    return { title };
  });
  ck('andYoursAreTheDefeats', v.title === 'YOUR HALL HAS FALLEN', String(v.title));
}
{
  await fresh('hallfire6', 'fog');
  const v = await p.evaluate(() => {
    G.freeVis = false; S.map.visible && S.map.visible.fill(0);
    const vis = G.visibleAt; G.visibleAt = () => false;
    try { Bld.damage(__tc, 1e9, undefined, 'P'); } finally { G.visibleAt = vis; }
    return { screen: Screens.current, fall: R.hallFall };
  });
  ck('anUnseenFallHoldsNothing', v.screen === 'endgame' && v.fall === null, JSON.stringify(v));
}
{
  await fresh('hallfire7', 'nostrip');
  const v = await p.evaluate(() => {
    const keep = Assets.hallFire['tc-l1-fall'];
    delete Assets.hallFire['tc-l1-fall'];
    try { Bld.damage(__tc, 1e9); } finally { Assets.hallFire['tc-l1-fall'] = keep; }
    return { screen: Screens.current, fall: R.hallFall, held: R.groundHeld() };
  });
  ck('withoutItsFallArtTheHallGoesAsItAlwaysDid', v.screen === 'endgame' && v.fall === null && !v.held, JSON.stringify(v));
}

await b.close(); srv.close();
const realErrs = errs.filter(e => !/Failed to fetch|NetworkError|ERR_|supabase/i.test(e));
ck('noPageErrors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));
for (const [k, v] of Object.entries(results)) console.log((v.startsWith('PASS') ? '  ok   ' : '  FAIL ') + k + (v.includes(' — ') ? v.slice(4) : ''));
if (fails.length) { console.log(`\n${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log('\nall hall-fire contract checks passed');
